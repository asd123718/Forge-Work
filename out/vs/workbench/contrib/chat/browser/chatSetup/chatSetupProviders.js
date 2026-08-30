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
import { raceTimeout, timeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../../nls.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import product from "../../../../../platform/product/common/product.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceTrustManagementService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { nullExtensionDescription } from "../../../../services/extensions/common/extensions.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../common/tools/languageModelToolsService.js";
import { IChatAgentService } from "../../common/participants/chatAgents.js";
import { chatRequiresSetup, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { ChatRequestModel } from "../../common/model/chatModel.js";
import { ChatMode } from "../../common/chatModes.js";
import { ChatRequestAgentPart, ChatRequestToolPart } from "../../common/requestParser/chatParserTypes.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../common/constants.js";
import { ILanguageModelsService } from "../../common/languageModels.js";
import { CHAT_OPEN_ACTION_ID, CHAT_SETUP_ACTION_ID } from "../actions/chatActions.js";
import { ChatViewId, IChatWidgetService } from "../chat.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { CodeActionKind } from "../../../../../editor/contrib/codeAction/common/types.js";
import { ACTION_START as INLINE_CHAT_START } from "../../../inlineChat/common/inlineChat.js";
import { IMarkerService, MarkerSeverity } from "../../../../../platform/markers/common/markers.js";
import { ChatGlobalPerfMark, markChatGlobal } from "../../common/chatPerf.js";
import { ChatSetupAnonymous, ChatSetupStep, maybeEnableAuthExtension, refreshTokens } from "./chatSetup.js";
import { ChatSetup } from "./chatSetupRunner.js";
import { chatViewsWelcomeRegistry } from "../viewsWelcome/chatViewsWelcome.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IOutputService } from "../../../../services/output/common/output.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
const defaultChat = {
  extensionId: product.defaultChatAgent?.extensionId ?? "",
  chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? "",
  provider: product.defaultChatAgent?.provider ?? { default: { id: "", name: "" }, enterprise: { id: "", name: "" }, apple: { id: "", name: "" }, google: { id: "", name: "" } },
  outputChannelId: product.defaultChatAgent?.chatExtensionOutputId ?? "",
  outputExtensionStateCommand: product.defaultChatAgent?.chatExtensionOutputExtensionStateCommand ?? ""
};
const ToolsAgentContextKey = ContextKeyExpr.and(
  ContextKeyExpr.equals(`config.${ChatConfiguration.AgentEnabled}`, true),
  ContextKeyExpr.not(`previewFeaturesDisabled`)
  // Set by extension
);
let SetupAgent = class extends Disposable {
  constructor(context, controller, location, instantiationService, logService, telemetryService, environmentService, workspaceTrustManagementService, chatEntitlementService, viewsService, contextKeyService, outputService, extensionsWorkbenchService, commandService) {
    super();
    this.context = context;
    this.controller = controller;
    this.location = location;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.environmentService = environmentService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.chatEntitlementService = chatEntitlementService;
    this.viewsService = viewsService;
    this.contextKeyService = contextKeyService;
    this.outputService = outputService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.commandService = commandService;
    this._onUnresolvableError = this._register(new Emitter());
    this.onUnresolvableError = this._onUnresolvableError.event;
    this.pendingForwardedRequests = new ResourceMap();
    this.registerCommands();
  }
  static registerDefaultAgents(instantiationService, location, mode, context, controller) {
    return instantiationService.invokeFunction((accessor) => {
      const chatAgentService = accessor.get(IChatAgentService);
      let description;
      if (mode === ChatModeKind.Ask) {
        description = ChatMode.Ask.description.get();
      } else if (mode === ChatModeKind.Edit) {
        description = ChatMode.Edit.description.get();
      } else {
        description = ChatMode.Agent.description.get();
      }
      let id;
      switch (location) {
        case ChatAgentLocation.Chat:
          if (mode === ChatModeKind.Ask) {
            id = "setup.chat";
          } else if (mode === ChatModeKind.Edit) {
            id = "setup.edits";
          } else {
            id = "setup.agent";
          }
          break;
        case ChatAgentLocation.Terminal:
          id = "setup.terminal";
          break;
        case ChatAgentLocation.EditorInline:
          id = "setup.editor";
          break;
        case ChatAgentLocation.Notebook:
          id = "setup.notebook";
          break;
      }
      return SetupAgent.doRegisterAgent(instantiationService, chatAgentService, id, `${defaultChat.provider.default.name} Copilot`, true, description, location, mode, context, controller);
    });
  }
  static registerBuiltInAgents(instantiationService, context, controller) {
    return instantiationService.invokeFunction((accessor) => {
      const chatAgentService = accessor.get(IChatAgentService);
      const disposables = new DisposableStore();
      const { disposable: vscodeDisposable } = SetupAgent.doRegisterAgent(instantiationService, chatAgentService, "setup.vscode", "vscode", false, localize2("vscodeAgentDescription", "Ask questions about VS Code").value, ChatAgentLocation.Chat, ChatModeKind.Agent, context, controller);
      disposables.add(vscodeDisposable);
      const { disposable: workspaceDisposable } = SetupAgent.doRegisterAgent(instantiationService, chatAgentService, "setup.workspace", "workspace", false, localize2("workspaceAgentDescription", "Ask about your workspace").value, ChatAgentLocation.Chat, ChatModeKind.Agent, context, controller);
      disposables.add(workspaceDisposable);
      const { disposable: terminalDisposable } = SetupAgent.doRegisterAgent(instantiationService, chatAgentService, "setup.terminal.agent", "terminal", false, localize2("terminalAgentDescription", "Ask how to do something in the terminal").value, ChatAgentLocation.Chat, ChatModeKind.Agent, context, controller);
      disposables.add(terminalDisposable);
      disposables.add(SetupTool.registerTool(instantiationService, {
        id: "setup_tools_createNewWorkspace",
        source: ToolDataSource.Internal,
        icon: Codicon.newFolder,
        displayName: localize("setupToolDisplayName", "New Workspace"),
        modelDescription: "Scaffold a new workspace in VS Code",
        userDescription: localize("setupToolsDescription", "Scaffold a new workspace in VS Code"),
        canBeReferencedInPrompt: true,
        toolReferenceName: "new",
        when: ContextKeyExpr.true()
      }));
      return disposables;
    });
  }
  static doRegisterAgent(instantiationService, chatAgentService, id, name, isDefault, description, location, mode, context, controller) {
    const disposables = new DisposableStore();
    disposables.add(chatAgentService.registerAgent(id, {
      id,
      name,
      isDefault,
      isCore: true,
      modes: [mode],
      when: mode === ChatModeKind.Agent ? ToolsAgentContextKey?.serialize() : void 0,
      slashCommands: [],
      disambiguation: [],
      locations: [location],
      metadata: { helpTextPrefix: SetupAgent.SETUP_NEEDED_MESSAGE },
      description,
      extensionId: nullExtensionDescription.identifier,
      extensionVersion: void 0,
      extensionDisplayName: nullExtensionDescription.name,
      extensionPublisherId: nullExtensionDescription.publisher
    }));
    const agent = disposables.add(instantiationService.createInstance(SetupAgent, context, controller, location));
    disposables.add(chatAgentService.registerAgentImplementation(id, agent));
    if (mode === ChatModeKind.Agent) {
      chatAgentService.updateAgent(id, { themeIcon: Codicon.tools });
    }
    return { agent, disposable: disposables };
  }
  registerCommands() {
    this._register(CommandsRegistry.registerCommand(SetupAgent.CHAT_RETRY_COMMAND_ID, async (accessor, sessionResource) => {
      const hostService = accessor.get(IHostService);
      const chatWidgetService = accessor.get(IChatWidgetService);
      const widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
      await widget?.clear();
      hostService.reload();
    }));
    this._register(CommandsRegistry.registerCommand(SetupAgent.CHAT_SHOW_OUTPUT_COMMAND_ID, async (accessor) => {
      const commandService = accessor.get(ICommandService);
      if (defaultChat.outputExtensionStateCommand) {
        raceTimeout(
          commandService.executeCommand(defaultChat.outputExtensionStateCommand),
          5e3,
          () => this.logService.info("[chat setup] Timed out executing extension state command")
        ).then(void 0, (error) => {
          this.logService.info("[chat setup] Failed to execute extension state command", error);
        });
      }
      if (defaultChat.outputChannelId) {
        await commandService.executeCommand(`workbench.action.output.show.${defaultChat.outputChannelId}`);
      }
    }));
  }
  async invoke(request, progress) {
    return this.instantiationService.invokeFunction(async (accessor) => {
      const chatService = accessor.get(IChatService);
      const languageModelsService = accessor.get(ILanguageModelsService);
      const chatWidgetService = accessor.get(IChatWidgetService);
      const chatAgentService = accessor.get(IChatAgentService);
      const languageModelToolsService = accessor.get(ILanguageModelToolsService);
      const defaultAccountService = accessor.get(IDefaultAccountService);
      return this.doInvoke(request, (part) => progress([part]), chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService, defaultAccountService);
    });
  }
  async doInvoke(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService, defaultAccountService) {
    if (chatRequiresSetup({
      completed: !!this.context.state.completed,
      disabled: !!this.context.state.disabled,
      untrusted: !!this.context.state.untrusted,
      entitlement: this.context.state.entitlement,
      anonymous: this.chatEntitlementService.anonymous,
      hasByokModels: this.chatEntitlementService.hasByokModels
    })) {
      return this.doInvokeWithSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService, defaultAccountService);
    }
    return this.doInvokeWithoutSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService);
  }
  async doInvokeWithoutSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService) {
    const requestModel = chatWidgetService.getWidgetBySessionResource(request.sessionResource)?.viewModel?.model.getRequests().at(-1);
    if (!requestModel) {
      this.logService.error("[chat setup] Request model not found, cannot redispatch request.");
      return {};
    }
    progress({
      kind: "progressMessage",
      content: new MarkdownString(localize("waitingChat", "Getting chat ready")),
      shimmer: true
    });
    await this.forwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
    return {};
  }
  async forwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService) {
    try {
      await this.doForwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
    } catch (error) {
      this.logService.error("[chat setup] Failed to forward request to chat", error);
      progress({
        kind: "warning",
        content: new MarkdownString(localize("copilotUnavailableWarning", "Failed to get a response. Please try again."))
      });
    }
  }
  async doForwardRequestToChat(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService) {
    if (this.pendingForwardedRequests.has(requestModel.session.sessionResource)) {
      throw new Error("Request already in progress");
    }
    const forwardRequest = this.doForwardRequestToChatWhenReady(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
    this.pendingForwardedRequests.set(requestModel.session.sessionResource, forwardRequest);
    try {
      await forwardRequest;
    } finally {
      this.pendingForwardedRequests.delete(requestModel.session.sessionResource);
    }
  }
  async doForwardRequestToChatWhenReady(requestModel, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService) {
    const authExtensionReEnabled = await maybeEnableAuthExtension(this.extensionsWorkbenchService, this.logService);
    if (authExtensionReEnabled) {
      refreshTokens(this.commandService);
    }
    const widget = chatWidgetService.getWidgetBySessionResource(requestModel.session.sessionResource);
    const modeInfo = widget?.input.currentModeInfo;
    let agentActivated = false;
    let agentReady = false;
    let languageModelReady = false;
    let toolsModelReady = false;
    markChatGlobal(ChatGlobalPerfMark.WillWaitForActivation);
    const whenAgentActivated = this.whenAgentActivated(chatService).then(() => agentActivated = true);
    const whenAgentReady = this.whenAgentReady(chatAgentService, modeInfo?.kind)?.then(() => agentReady = true);
    if (!whenAgentReady) {
      agentReady = true;
    }
    const whenLanguageModelReady = this.whenLanguageModelReady(languageModelsService, requestModel.modelId)?.then(() => languageModelReady = true);
    if (!whenLanguageModelReady) {
      languageModelReady = true;
    }
    const whenToolsModelReady = this.whenToolsModelReady(languageModelToolsService, requestModel)?.then(() => toolsModelReady = true);
    if (!whenToolsModelReady) {
      toolsModelReady = true;
    }
    if (whenLanguageModelReady instanceof Promise || whenAgentReady instanceof Promise || whenToolsModelReady instanceof Promise) {
      const timeoutHandle = setTimeout(() => {
        progress({
          kind: "progressMessage",
          content: new MarkdownString(localize("waitingChat2", "Chat is almost ready")),
          shimmer: true
        });
      }, 1e4);
      const disposables = new DisposableStore();
      disposables.add(toDisposable(() => clearTimeout(timeoutHandle)));
      try {
        const allReady = Promise.allSettled([
          whenAgentActivated,
          whenAgentReady,
          whenLanguageModelReady,
          whenToolsModelReady
        ]);
        const ready = await Promise.race([
          timeout(this.environmentService.remoteAuthority ? 6e4 : 2e4).then(() => "timedout"),
          this.whenPanelAgentHasGuidance(disposables).then(() => "panelGuidance"),
          allReady
        ]);
        if (ready === "panelGuidance") {
          const warningMessage = localize("chatTookLongWarningExtension", "Please try again.");
          progress({
            kind: "markdownContent",
            content: new MarkdownString(warningMessage)
          });
          this._onUnresolvableError.fire();
          return;
        }
        if (ready === "timedout") {
          let warningMessage;
          if (this.chatEntitlementService.anonymous) {
            warningMessage = localize("chatTookLongWarningAnonymous", "Chat took too long to get ready. Please ensure that the extension `{0}` is installed and enabled. Click restart to try again if this issue persists.", defaultChat.chatExtensionId);
          } else {
            warningMessage = localize("chatTookLongWarning", "Chat took too long to get ready. Please ensure you are signed in to {0} and that the extension `{1}` is installed and enabled. Click restart to try again if this issue persists.", defaultChat.provider.default.name, defaultChat.chatExtensionId);
          }
          const diagnosticInfo = this.computeDiagnosticInfo(agentActivated, agentReady, languageModelReady, toolsModelReady, requestModel, languageModelsService, chatAgentService, modeInfo);
          this.logService.warn(`[chat setup] ${warningMessage}`, diagnosticInfo);
          this.telemetryService.publicLog2("chatSetup.timeout", diagnosticInfo);
          progress({
            kind: "warning",
            content: new MarkdownString(warningMessage)
          });
          if (defaultChat.outputChannelId && this.outputService.getChannelDescriptor(defaultChat.outputChannelId)) {
            progress({
              kind: "command",
              command: {
                id: SetupAgent.CHAT_SHOW_OUTPUT_COMMAND_ID,
                title: localize("showCopilotChatDetails", "Show Details")
              }
            });
          } else {
            this.logService.warn(defaultChat.outputChannelId ? `[chat setup] No output channel found for id '${defaultChat.outputChannelId}' to show details about chat setup timeout. Please ensure the ${defaultChat.chatExtensionId} extension is activated.` : "[chat setup] No output channel provided via product.json to show details about chat setup timeout.");
            progress({
              kind: "command",
              command: {
                id: SetupAgent.CHAT_RETRY_COMMAND_ID,
                title: localize("retryChat", "Restart"),
                arguments: [requestModel.session.sessionResource]
              }
            });
          }
          await allReady;
          const recoveryDiagnosticInfo = this.computeDiagnosticInfo(agentActivated, agentReady, languageModelReady, toolsModelReady, requestModel, languageModelsService, chatAgentService, modeInfo);
          this.logService.info("[chat setup] Chat setup timeout recovered", recoveryDiagnosticInfo);
          this.telemetryService.publicLog2("chatSetup.timeoutRecovery", recoveryDiagnosticInfo);
        }
      } finally {
        disposables.dispose();
      }
    }
    markChatGlobal(ChatGlobalPerfMark.DidWaitForActivation);
    await chatService.resendRequest(requestModel, {
      ...widget?.getModeRequestOptions(),
      modeInfo,
      ...widget?.getSelectedModelRequestOptions()
    });
  }
  async whenPanelAgentHasGuidance(disposables) {
    const panelAgentHasGuidance = () => chatViewsWelcomeRegistry.get().some((descriptor) => this.contextKeyService.contextMatchesRules(descriptor.when));
    if (panelAgentHasGuidance()) {
      return;
    }
    return new Promise((resolve) => {
      let descriptorKeys = /* @__PURE__ */ new Set();
      const updateDescriptorKeys = () => {
        const descriptors = chatViewsWelcomeRegistry.get();
        descriptorKeys = new Set(descriptors.flatMap((d) => d.when.keys()));
      };
      updateDescriptorKeys();
      const onDidChangeRegistry = Event.map(chatViewsWelcomeRegistry.onDidChange, () => "registry");
      const onDidChangeRelevantContext = Event.map(
        Event.filter(this.contextKeyService.onDidChangeContext, (e) => e.affectsSome(descriptorKeys)),
        () => "context"
      );
      disposables.add(Event.any(
        onDidChangeRegistry,
        onDidChangeRelevantContext
      )((source) => {
        if (source === "registry") {
          updateDescriptorKeys();
        }
        if (panelAgentHasGuidance()) {
          resolve();
        }
      }));
    });
  }
  whenLanguageModelReady(languageModelsService, modelId) {
    const hasModelForRequest = () => {
      if (modelId) {
        return !!languageModelsService.lookupLanguageModel(modelId);
      }
      for (const id of languageModelsService.getLanguageModelIds()) {
        const model = languageModelsService.lookupLanguageModel(id);
        if (model?.isDefaultForLocation[ChatAgentLocation.Chat]) {
          return true;
        }
      }
      return false;
    };
    if (hasModelForRequest()) {
      return;
    }
    return Event.toPromise(Event.filter(languageModelsService.onDidChangeLanguageModels, () => hasModelForRequest()));
  }
  whenToolsModelReady(languageModelToolsService, requestModel) {
    const needsToolsModel = requestModel.message.parts.some((part) => part instanceof ChatRequestToolPart);
    if (!needsToolsModel) {
      return;
    }
    for (const tool of languageModelToolsService.getAllToolsIncludingDisabled()) {
      if (tool.id.startsWith("copilot_")) {
        return;
      }
    }
    return Event.toPromise(Event.filter(languageModelToolsService.onDidChangeTools, () => {
      for (const tool of languageModelToolsService.getAllToolsIncludingDisabled()) {
        if (tool.id.startsWith("copilot_")) {
          return true;
        }
      }
      return false;
    }));
  }
  whenAgentReady(chatAgentService, mode) {
    const defaultAgent = chatAgentService.getDefaultAgent(this.location, mode);
    if (defaultAgent && !defaultAgent.isCore) {
      return;
    }
    return Event.toPromise(Event.filter(chatAgentService.onDidChangeAgents, () => {
      const defaultAgent2 = chatAgentService.getDefaultAgent(this.location, mode);
      return Boolean(defaultAgent2 && !defaultAgent2.isCore);
    }));
  }
  async whenAgentActivated(chatService) {
    try {
      await chatService.activateDefaultAgent(this.location);
    } catch (error) {
      this.logService.error(error);
    }
  }
  computeDiagnosticInfo(agentActivated, agentReady, languageModelReady, toolsModelReady, requestModel, languageModelsService, chatAgentService, modeInfo) {
    const languageModelIds = languageModelsService.getLanguageModelIds();
    let languageModelDefaultCount = 0;
    for (const id of languageModelIds) {
      const model = languageModelsService.lookupLanguageModel(id);
      if (model?.isDefaultForLocation[ChatAgentLocation.Chat]) {
        languageModelDefaultCount++;
      }
    }
    const defaultAgent = chatAgentService.getDefaultAgent(this.location, modeInfo?.kind);
    const contributedDefaultAgent = chatAgentService.getContributedDefaultAgent(this.location);
    const chatViewPane = this.viewsService.getActiveViewWithId(ChatViewId);
    const matchingWelcomeView = chatViewPane?.getMatchingWelcomeView();
    return {
      agentActivated,
      agentReady,
      agentHasDefault: !!defaultAgent,
      agentDefaultIsCore: defaultAgent?.isCore ?? false,
      agentHasContributedDefault: !!contributedDefaultAgent,
      agentContributedDefaultIsCore: contributedDefaultAgent?.isCore ?? false,
      agentActivatedCount: chatAgentService.getActivatedAgents().length,
      agentLocation: this.location,
      agentModeKind: modeInfo?.kind ?? "",
      languageModelReady,
      languageModelCount: languageModelIds.length,
      languageModelDefaultCount,
      languageModelHasRequestedModel: !!requestModel.modelId,
      toolsModelReady,
      isRemote: !!this.environmentService.remoteAuthority,
      isAnonymous: this.chatEntitlementService.anonymous,
      matchingWelcomeViewWhen: matchingWelcomeView?.when.serialize() ?? (chatViewPane ? "noWelcomeView" : "noChatViewPane")
    };
  }
  async doInvokeWithSetup(request, progress, chatService, languageModelsService, chatWidgetService, chatAgentService, languageModelToolsService, defaultAccountService) {
    this.telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "chat" });
    const widget = chatWidgetService.getWidgetBySessionResource(request.sessionResource);
    const requestModel = widget?.viewModel?.model.getRequests().at(-1);
    const setupListener = Event.runAndSubscribe(this.controller.value.onDidChange, (() => {
      switch (this.controller.value.step) {
        case ChatSetupStep.SigningIn:
          progress({
            kind: "progressMessage",
            content: new MarkdownString(localize("setupChatSignIn2", "Signing in to {0}", defaultAccountService.getDefaultAccountAuthenticationProvider().name)),
            shimmer: true
          });
          break;
        case ChatSetupStep.Installing:
          progress({
            kind: "progressMessage",
            content: new MarkdownString(localize("installingChat", "Getting chat ready")),
            shimmer: true
          });
          break;
      }
    }));
    let result = void 0;
    try {
      result = await ChatSetup.getInstance(this.instantiationService, this.context, this.controller).run({
        disableChatViewReveal: true,
        // we are already in a chat context
        forceAnonymous: this.chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithoutDialog : void 0
        // only enable anonymous selectively
      });
    } catch (error) {
      this.logService.error(`[chat setup] Error during setup: ${toErrorMessage(error)}`);
    } finally {
      setupListener.dispose();
    }
    if (typeof result?.success === "boolean") {
      if (result.success) {
        if (result.dialogSkipped) {
          await widget?.clear();
        } else if (requestModel) {
          let newRequest = this.replaceAgentInRequestModel(requestModel, chatAgentService);
          newRequest = this.replaceToolInRequestModel(newRequest);
          await this.forwardRequestToChat(newRequest, progress, chatService, languageModelsService, chatAgentService, chatWidgetService, languageModelToolsService);
        }
      } else {
        progress({
          kind: "warning",
          content: new MarkdownString(localize("chatSetupError", "Chat setup failed."))
        });
      }
    } else {
      progress({
        kind: "markdownContent",
        content: this.workspaceTrustManagementService.isWorkspaceTrusted() ? SetupAgent.SETUP_NEEDED_MESSAGE : SetupAgent.TRUST_NEEDED_MESSAGE
      });
    }
    return {};
  }
  replaceAgentInRequestModel(requestModel, chatAgentService) {
    const agentPart = requestModel.message.parts.find((r) => r instanceof ChatRequestAgentPart);
    if (!agentPart) {
      return requestModel;
    }
    const agentId = agentPart.agent.id.replace(/setup\./, `${defaultChat.extensionId}.`.toLowerCase());
    const githubAgent = chatAgentService.getAgent(agentId);
    if (!githubAgent) {
      return requestModel;
    }
    const newAgentPart = new ChatRequestAgentPart(agentPart.range, agentPart.editorRange, githubAgent);
    return new ChatRequestModel({
      session: requestModel.session,
      message: {
        parts: requestModel.message.parts.map((part) => {
          if (part instanceof ChatRequestAgentPart) {
            return newAgentPart;
          }
          return part;
        }),
        text: requestModel.message.text
      },
      variableData: requestModel.variableData,
      timestamp: Date.now(),
      attempt: requestModel.attempt,
      modeInfo: requestModel.modeInfo,
      confirmation: requestModel.confirmation,
      locationData: requestModel.locationData,
      attachedContext: requestModel.attachedContext,
      isCompleteAddedRequest: requestModel.isCompleteAddedRequest
    });
  }
  replaceToolInRequestModel(requestModel) {
    const toolPart = requestModel.message.parts.find((r) => r instanceof ChatRequestToolPart);
    if (!toolPart) {
      return requestModel;
    }
    const toolId = toolPart.toolId.replace(/setup.tools\./, `copilot_`.toLowerCase());
    const newToolPart = new ChatRequestToolPart(
      toolPart.range,
      toolPart.editorRange,
      toolPart.toolName,
      toolId,
      toolPart.displayName,
      toolPart.icon
    );
    const chatRequestToolEntry = {
      id: toolId,
      name: "new",
      range: toolPart.range,
      kind: "tool",
      value: void 0
    };
    const variableData = {
      variables: [chatRequestToolEntry]
    };
    return new ChatRequestModel({
      session: requestModel.session,
      message: {
        parts: requestModel.message.parts.map((part) => {
          if (part instanceof ChatRequestToolPart) {
            return newToolPart;
          }
          return part;
        }),
        text: requestModel.message.text
      },
      variableData,
      timestamp: Date.now(),
      attempt: requestModel.attempt,
      modeInfo: requestModel.modeInfo,
      confirmation: requestModel.confirmation,
      locationData: requestModel.locationData,
      attachedContext: [chatRequestToolEntry],
      isCompleteAddedRequest: requestModel.isCompleteAddedRequest
    });
  }
};
SetupAgent.SETUP_NEEDED_MESSAGE = new MarkdownString(localize("settingUpCopilotNeeded", "You need to set up GitHub Copilot and be signed in to use Chat."));
SetupAgent.TRUST_NEEDED_MESSAGE = new MarkdownString(localize("trustNeeded", "You need to trust this workspace to use Chat."));
SetupAgent.CHAT_RETRY_COMMAND_ID = "workbench.action.chat.retrySetup";
SetupAgent.CHAT_SHOW_OUTPUT_COMMAND_ID = "workbench.action.chat.showOutput";
SetupAgent = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, IWorkbenchEnvironmentService),
  __decorateParam(7, IWorkspaceTrustManagementService),
  __decorateParam(8, IChatEntitlementService),
  __decorateParam(9, IViewsService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IOutputService),
  __decorateParam(12, IExtensionsWorkbenchService),
  __decorateParam(13, ICommandService)
], SetupAgent);
class SetupTool {
  static registerTool(instantiationService, toolData) {
    return instantiationService.invokeFunction((accessor) => {
      const toolService = accessor.get(ILanguageModelToolsService);
      const tool = instantiationService.createInstance(SetupTool);
      return toolService.registerTool(toolData, tool);
    });
  }
  async invoke(invocation, countTokens, progress, token) {
    const result = {
      content: [
        {
          kind: "text",
          value: ""
        }
      ]
    };
    return result;
  }
  async prepareToolInvocation(parameters, token) {
    return void 0;
  }
}
let AINewSymbolNamesProvider = class {
  constructor(context, controller, instantiationService, chatEntitlementService) {
    this.context = context;
    this.controller = controller;
    this.instantiationService = instantiationService;
    this.chatEntitlementService = chatEntitlementService;
  }
  static registerProvider(instantiationService, context, controller) {
    return instantiationService.invokeFunction((accessor) => {
      const languageFeaturesService = accessor.get(ILanguageFeaturesService);
      const provider = instantiationService.createInstance(AINewSymbolNamesProvider, context, controller);
      return languageFeaturesService.newSymbolNamesProvider.register("*", provider);
    });
  }
  async provideNewSymbolNames(model, range, triggerKind, token) {
    await this.instantiationService.invokeFunction((accessor) => {
      return ChatSetup.getInstance(this.instantiationService, this.context, this.controller).run({
        forceAnonymous: this.chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithDialog : void 0
      });
    });
    return [];
  }
};
AINewSymbolNamesProvider = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IChatEntitlementService)
], AINewSymbolNamesProvider);
let ChatCodeActionsProvider = class {
  constructor(markerService) {
    this.markerService = markerService;
  }
  static registerProvider(instantiationService) {
    return instantiationService.invokeFunction((accessor) => {
      const languageFeaturesService = accessor.get(ILanguageFeaturesService);
      const provider = instantiationService.createInstance(ChatCodeActionsProvider);
      return languageFeaturesService.codeActionProvider.register("*", provider);
    });
  }
  async provideCodeActions(model, range) {
    const actions = [];
    let generateOrModifyTitle;
    let generateOrModifyCommand;
    if (range.isEmpty()) {
      const textAtLine = model.getLineContent(range.startLineNumber);
      if (/^\s*$/.test(textAtLine)) {
        generateOrModifyTitle = localize("generate", "Generate");
        generateOrModifyCommand = AICodeActionsHelper.generate(range);
      }
    } else {
      const textInSelection = model.getValueInRange(range);
      if (!/^\s*$/.test(textInSelection)) {
        generateOrModifyTitle = localize("modify", "Modify");
        generateOrModifyCommand = AICodeActionsHelper.modify(range);
      }
    }
    if (generateOrModifyTitle && generateOrModifyCommand) {
      actions.push({
        kind: CodeActionKind.RefactorRewrite.append("copilot").value,
        isAI: true,
        title: generateOrModifyTitle,
        command: generateOrModifyCommand
      });
    }
    const markers = AICodeActionsHelper.warningOrErrorMarkersAtRange(this.markerService, model.uri, range);
    if (markers.length > 0) {
      actions.push({
        kind: CodeActionKind.QuickFix.append("copilot").value,
        isAI: true,
        diagnostics: markers,
        title: localize("fix", "Fix"),
        command: AICodeActionsHelper.fixMarkers(markers, range)
      });
      actions.push({
        kind: CodeActionKind.QuickFix.append("explain").append("copilot").value,
        isAI: true,
        diagnostics: markers,
        title: localize("explain", "Explain"),
        command: AICodeActionsHelper.explainMarkers(markers)
      });
    }
    return {
      actions,
      dispose() {
      }
    };
  }
};
ChatCodeActionsProvider = __decorateClass([
  __decorateParam(0, IMarkerService)
], ChatCodeActionsProvider);
class AICodeActionsHelper {
  static warningOrErrorMarkersAtRange(markerService, resource, range) {
    return markerService.read({ resource, severities: MarkerSeverity.Error | MarkerSeverity.Warning }).filter((marker) => range.startLineNumber <= marker.endLineNumber && range.endLineNumber >= marker.startLineNumber);
  }
  static modify(range) {
    return {
      id: INLINE_CHAT_START,
      title: localize("modify", "Modify"),
      arguments: [
        {
          initialSelection: this.rangeToSelection(range),
          initialRange: range,
          position: range.getStartPosition()
        }
      ]
    };
  }
  static generate(range) {
    return {
      id: INLINE_CHAT_START,
      title: localize("generate", "Generate"),
      arguments: [
        {
          initialSelection: this.rangeToSelection(range),
          initialRange: range,
          position: range.getStartPosition()
        }
      ]
    };
  }
  static rangeToSelection(range) {
    return new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
  }
  static explainMarkers(markers) {
    return {
      id: CHAT_OPEN_ACTION_ID,
      title: localize("explain", "Explain"),
      arguments: [
        {
          query: `@workspace /explain ${markers.map((marker) => marker.message).join(", ")}`,
          isPartialQuery: true
        }
      ]
    };
  }
  static fixMarkers(markers, range) {
    return {
      id: INLINE_CHAT_START,
      title: localize("fix", "Fix"),
      arguments: [
        {
          message: `/fix ${markers.map((marker) => marker.message).join(", ")}`,
          initialSelection: this.rangeToSelection(range),
          initialRange: range,
          position: range.getStartPosition()
        }
      ]
    };
  }
}
export {
  AICodeActionsHelper,
  AINewSymbolNamesProvider,
  ChatCodeActionsProvider,
  SetupAgent,
  SetupTool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRTZXR1cFxcY2hhdFNldHVwUHJvdmlkZXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmFjZVRpbWVvdXQsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvdW50VG9rZW5zQ2FsbGJhY2ssIElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xSZXN1bHQsIFRvb2xEYXRhU291cmNlLCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24sIElDaGF0QWdlbnRSZXF1ZXN0LCBJQ2hhdEFnZW50UmVzdWx0LCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnRDb250ZXh0LCBjaGF0UmVxdWlyZXNTZXR1cCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCwgQ2hhdFJlcXVlc3RNb2RlbCwgSUNoYXRSZXF1ZXN0TW9kZWwsIElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0QWdlbnRQYXJ0LCBDaGF0UmVxdWVzdFRvb2xQYXJ0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0UHJvZ3Jlc3MsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RUb29sRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDSEFUX09QRU5fQUNUSU9OX0lELCBDSEFUX1NFVFVQX0FDVElPTl9JRCB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdJZCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld1BhbmUgfSBmcm9tICcuLi93aWRnZXRIb3N0cy92aWV3UGFuZS9jaGF0Vmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb24sIENvZGVBY3Rpb25MaXN0LCBDb21tYW5kLCBOZXdTeW1ib2xOYW1lLCBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24sIFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBBQ1RJT05fU1RBUlQgYXMgSU5MSU5FX0NIQVRfU1RBUlQgfSBmcm9tICcuLi8uLi8uLi9pbmxpbmVDaGF0L2NvbW1vbi9pbmxpbmVDaGF0LmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2VyLCBJTWFya2VyU2VydmljZSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IENoYXRTZXR1cENvbnRyb2xsZXIgfSBmcm9tICcuL2NoYXRTZXR1cENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQ2hhdEdsb2JhbFBlcmZNYXJrLCBtYXJrQ2hhdEdsb2JhbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0UGVyZi5qcyc7XG5pbXBvcnQgeyBDaGF0U2V0dXBBbm9ueW1vdXMsIENoYXRTZXR1cFN0ZXAsIElDaGF0U2V0dXBSZXN1bHQsIG1heWJlRW5hYmxlQXV0aEV4dGVuc2lvbiwgcmVmcmVzaFRva2VucyB9IGZyb20gJy4vY2hhdFNldHVwLmpzJztcbmltcG9ydCB7IENoYXRTZXR1cCB9IGZyb20gJy4vY2hhdFNldHVwUnVubmVyLmpzJztcbmltcG9ydCB7IGNoYXRWaWV3c1dlbGNvbWVSZWdpc3RyeSB9IGZyb20gJy4uL3ZpZXdzV2VsY29tZS9jaGF0Vmlld3NXZWxjb21lLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbmNvbnN0IGRlZmF1bHRDaGF0ID0ge1xuXHRleHRlbnNpb25JZDogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5leHRlbnNpb25JZCA/PyAnJyxcblx0Y2hhdEV4dGVuc2lvbklkOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCA/PyAnJyxcblx0cHJvdmlkZXI6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXIgPz8geyBkZWZhdWx0OiB7IGlkOiAnJywgbmFtZTogJycgfSwgZW50ZXJwcmlzZTogeyBpZDogJycsIG5hbWU6ICcnIH0sIGFwcGxlOiB7IGlkOiAnJywgbmFtZTogJycgfSwgZ29vZ2xlOiB7IGlkOiAnJywgbmFtZTogJycgfSB9LFxuXHRvdXRwdXRDaGFubmVsSWQ6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbk91dHB1dElkID8/ICcnLFxuXHRvdXRwdXRFeHRlbnNpb25TdGF0ZUNvbW1hbmQ6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbk91dHB1dEV4dGVuc2lvblN0YXRlQ29tbWFuZCA/PyAnJyxcbn07XG5cbmNvbnN0IFRvb2xzQWdlbnRDb250ZXh0S2V5ID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZH1gLCB0cnVlKSxcblx0Q29udGV4dEtleUV4cHIubm90KGBwcmV2aWV3RmVhdHVyZXNEaXNhYmxlZGApIC8vIFNldCBieSBleHRlbnNpb25cbik7XG5cbmV4cG9ydCBjbGFzcyBTZXR1cEFnZW50IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiB7XG5cblx0c3RhdGljIHJlZ2lzdGVyRGVmYXVsdEFnZW50cyhpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIG1vZGU6IENoYXRNb2RlS2luZCwgY29udGV4dDogQ2hhdEVudGl0bGVtZW50Q29udGV4dCwgY29udHJvbGxlcjogTGF6eTxDaGF0U2V0dXBDb250cm9sbGVyPik6IHsgYWdlbnQ6IFNldHVwQWdlbnQ7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH0ge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBjaGF0QWdlbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0QWdlbnRTZXJ2aWNlKTtcblxuXHRcdFx0bGV0IGRlc2NyaXB0aW9uO1xuXHRcdFx0aWYgKG1vZGUgPT09IENoYXRNb2RlS2luZC5Bc2spIHtcblx0XHRcdFx0ZGVzY3JpcHRpb24gPSBDaGF0TW9kZS5Bc2suZGVzY3JpcHRpb24uZ2V0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKG1vZGUgPT09IENoYXRNb2RlS2luZC5FZGl0KSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gQ2hhdE1vZGUuRWRpdC5kZXNjcmlwdGlvbi5nZXQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gQ2hhdE1vZGUuQWdlbnQuZGVzY3JpcHRpb24uZ2V0KCk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBpZDogc3RyaW5nO1xuXHRcdFx0c3dpdGNoIChsb2NhdGlvbikge1xuXHRcdFx0XHRjYXNlIENoYXRBZ2VudExvY2F0aW9uLkNoYXQ6XG5cdFx0XHRcdFx0aWYgKG1vZGUgPT09IENoYXRNb2RlS2luZC5Bc2spIHtcblx0XHRcdFx0XHRcdGlkID0gJ3NldHVwLmNoYXQnO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAobW9kZSA9PT0gQ2hhdE1vZGVLaW5kLkVkaXQpIHtcblx0XHRcdFx0XHRcdGlkID0gJ3NldHVwLmVkaXRzJztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWQgPSAnc2V0dXAuYWdlbnQnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbDpcblx0XHRcdFx0XHRpZCA9ICdzZXR1cC50ZXJtaW5hbCc7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lOlxuXHRcdFx0XHRcdGlkID0gJ3NldHVwLmVkaXRvcic7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2s6XG5cdFx0XHRcdFx0aWQgPSAnc2V0dXAubm90ZWJvb2snO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gU2V0dXBBZ2VudC5kb1JlZ2lzdGVyQWdlbnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2UsIGlkLCBgJHtkZWZhdWx0Q2hhdC5wcm92aWRlci5kZWZhdWx0Lm5hbWV9IENvcGlsb3RgIC8qIERvIE5PVCBjaGFuZ2UsIHRoaXMgaGlkZXMgdGhlIHVzZXJuYW1lIGFsdG9nZXRoZXIgaW4gQ2hhdCAqLywgdHJ1ZSwgZGVzY3JpcHRpb24sIGxvY2F0aW9uLCBtb2RlLCBjb250ZXh0LCBjb250cm9sbGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdHN0YXRpYyByZWdpc3RlckJ1aWx0SW5BZ2VudHMoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgY29udGV4dDogQ2hhdEVudGl0bGVtZW50Q29udGV4dCwgY29udHJvbGxlcjogTGF6eTxDaGF0U2V0dXBDb250cm9sbGVyPik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgY2hhdEFnZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdEFnZW50U2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciBWU0NvZGUgYWdlbnRcblx0XHRcdGNvbnN0IHsgZGlzcG9zYWJsZTogdnNjb2RlRGlzcG9zYWJsZSB9ID0gU2V0dXBBZ2VudC5kb1JlZ2lzdGVyQWdlbnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2UsICdzZXR1cC52c2NvZGUnLCAndnNjb2RlJywgZmFsc2UsIGxvY2FsaXplMigndnNjb2RlQWdlbnREZXNjcmlwdGlvbicsIFwiQXNrIHF1ZXN0aW9ucyBhYm91dCBWUyBDb2RlXCIpLnZhbHVlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDaGF0TW9kZUtpbmQuQWdlbnQsIGNvbnRleHQsIGNvbnRyb2xsZXIpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZzY29kZURpc3Bvc2FibGUpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciB3b3Jrc3BhY2UgYWdlbnRcblx0XHRcdGNvbnN0IHsgZGlzcG9zYWJsZTogd29ya3NwYWNlRGlzcG9zYWJsZSB9ID0gU2V0dXBBZ2VudC5kb1JlZ2lzdGVyQWdlbnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2UsICdzZXR1cC53b3Jrc3BhY2UnLCAnd29ya3NwYWNlJywgZmFsc2UsIGxvY2FsaXplMignd29ya3NwYWNlQWdlbnREZXNjcmlwdGlvbicsIFwiQXNrIGFib3V0IHlvdXIgd29ya3NwYWNlXCIpLnZhbHVlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDaGF0TW9kZUtpbmQuQWdlbnQsIGNvbnRleHQsIGNvbnRyb2xsZXIpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHdvcmtzcGFjZURpc3Bvc2FibGUpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciB0ZXJtaW5hbCBhZ2VudFxuXHRcdFx0Y29uc3QgeyBkaXNwb3NhYmxlOiB0ZXJtaW5hbERpc3Bvc2FibGUgfSA9IFNldHVwQWdlbnQuZG9SZWdpc3RlckFnZW50KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjaGF0QWdlbnRTZXJ2aWNlLCAnc2V0dXAudGVybWluYWwuYWdlbnQnLCAndGVybWluYWwnLCBmYWxzZSwgbG9jYWxpemUyKCd0ZXJtaW5hbEFnZW50RGVzY3JpcHRpb24nLCBcIkFzayBob3cgdG8gZG8gc29tZXRoaW5nIGluIHRoZSB0ZXJtaW5hbFwiKS52YWx1ZSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgQ2hhdE1vZGVLaW5kLkFnZW50LCBjb250ZXh0LCBjb250cm9sbGVyKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0ZXJtaW5hbERpc3Bvc2FibGUpO1xuXG5cdFx0XHQvLyBSZWdpc3RlciB0b29sc1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKFNldHVwVG9vbC5yZWdpc3RlclRvb2woaW5zdGFudGlhdGlvblNlcnZpY2UsIHtcblx0XHRcdFx0aWQ6ICdzZXR1cF90b29sc19jcmVhdGVOZXdXb3Jrc3BhY2UnLFxuXHRcdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLm5ld0ZvbGRlcixcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdzZXR1cFRvb2xEaXNwbGF5TmFtZScsIFwiTmV3IFdvcmtzcGFjZVwiKSxcblx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1NjYWZmb2xkIGEgbmV3IHdvcmtzcGFjZSBpbiBWUyBDb2RlJyxcblx0XHRcdFx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2V0dXBUb29sc0Rlc2NyaXB0aW9uJywgXCJTY2FmZm9sZCBhIG5ldyB3b3Jrc3BhY2UgaW4gVlMgQ29kZVwiKSxcblx0XHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnbmV3Jyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIudHJ1ZSgpLFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBkb1JlZ2lzdGVyQWdlbnQoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsIGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgaXNEZWZhdWx0OiBib29sZWFuLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIG1vZGU6IENoYXRNb2RlS2luZCwgY29udGV4dDogQ2hhdEVudGl0bGVtZW50Q29udGV4dCwgY29udHJvbGxlcjogTGF6eTxDaGF0U2V0dXBDb250cm9sbGVyPik6IHsgYWdlbnQ6IFNldHVwQWdlbnQ7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH0ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnQoaWQsIHtcblx0XHRcdGlkLFxuXHRcdFx0bmFtZSxcblx0XHRcdGlzRGVmYXVsdCxcblx0XHRcdGlzQ29yZTogdHJ1ZSxcblx0XHRcdG1vZGVzOiBbbW9kZV0sXG5cdFx0XHR3aGVuOiBtb2RlID09PSBDaGF0TW9kZUtpbmQuQWdlbnQgPyBUb29sc0FnZW50Q29udGV4dEtleT8uc2VyaWFsaXplKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRzbGFzaENvbW1hbmRzOiBbXSxcblx0XHRcdGRpc2FtYmlndWF0aW9uOiBbXSxcblx0XHRcdGxvY2F0aW9uczogW2xvY2F0aW9uXSxcblx0XHRcdG1ldGFkYXRhOiB7IGhlbHBUZXh0UHJlZml4OiBTZXR1cEFnZW50LlNFVFVQX05FRURFRF9NRVNTQUdFIH0sXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGV4dGVuc2lvbklkOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllcixcblx0XHRcdGV4dGVuc2lvblZlcnNpb246IHVuZGVmaW5lZCxcblx0XHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24ubmFtZSxcblx0XHRcdGV4dGVuc2lvblB1Ymxpc2hlcklkOiBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24ucHVibGlzaGVyXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWdlbnQgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dXBBZ2VudCwgY29udGV4dCwgY29udHJvbGxlciwgbG9jYXRpb24pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckFnZW50SW1wbGVtZW50YXRpb24oaWQsIGFnZW50KSk7XG5cdFx0aWYgKG1vZGUgPT09IENoYXRNb2RlS2luZC5BZ2VudCkge1xuXHRcdFx0Y2hhdEFnZW50U2VydmljZS51cGRhdGVBZ2VudChpZCwgeyB0aGVtZUljb246IENvZGljb24udG9vbHMgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWdlbnQsIGRpc3Bvc2FibGU6IGRpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVRVUF9ORUVERURfTUVTU0FHRSA9IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnc2V0dGluZ1VwQ29waWxvdE5lZWRlZCcsIFwiWW91IG5lZWQgdG8gc2V0IHVwIEdpdEh1YiBDb3BpbG90IGFuZCBiZSBzaWduZWQgaW4gdG8gdXNlIENoYXQuXCIpKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVFJVU1RfTkVFREVEX01FU1NBR0UgPSBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3RydXN0TmVlZGVkJywgXCJZb3UgbmVlZCB0byB0cnVzdCB0aGlzIHdvcmtzcGFjZSB0byB1c2UgQ2hhdC5cIikpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENIQVRfUkVUUllfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmV0cnlTZXR1cCc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENIQVRfU0hPV19PVVRQVVRfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc2hvd091dHB1dCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25VbnJlc29sdmFibGVFcnJvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblVucmVzb2x2YWJsZUVycm9yID0gdGhpcy5fb25VbnJlc29sdmFibGVFcnJvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBlbmRpbmdGb3J3YXJkZWRSZXF1ZXN0cyA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPHZvaWQ+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dDogQ2hhdEVudGl0bGVtZW50Q29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRyb2xsZXI6IExhenk8Q2hhdFNldHVwQ29udHJvbGxlcj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElPdXRwdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3V0cHV0U2VydmljZTogSU91dHB1dFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyQ29tbWFuZHMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJDb21tYW5kcygpOiB2b2lkIHtcblxuXHRcdC8vIFJldHJ5IGNoYXQgY29tbWFuZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFNldHVwQWdlbnQuQ0hBVF9SRVRSWV9DT01NQU5EX0lELCBhc3luYyAoYWNjZXNzb3IsIHNlc3Npb25SZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGF3YWl0IHdpZGdldD8uY2xlYXIoKTtcblxuXHRcdFx0aG9zdFNlcnZpY2UucmVsb2FkKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2hvdyBvdXRwdXQgY29tbWFuZDogZXhlY3V0ZSBleHRlbnNpb24gc3RhdGUgY29tbWFuZCBpZiBhdmFpbGFibGUsIHRoZW4gc2hvdyBvdXRwdXQgY2hhbm5lbFxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFNldHVwQWdlbnQuQ0hBVF9TSE9XX09VVFBVVF9DT01NQU5EX0lELCBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRcdGlmIChkZWZhdWx0Q2hhdC5vdXRwdXRFeHRlbnNpb25TdGF0ZUNvbW1hbmQpIHtcblx0XHRcdFx0Ly8gQ29tbWFuZCBpbnZvY2F0aW9uIG1heSBmYWlsIG9yIGlzIGJsb2NrZWQgYnkgdGhlIGV4dGVuc2lvbiBhY3RpdmF0aW5nXG5cdFx0XHRcdC8vIHNvIHdlIGp1c3QgZG9uJ3Qgd2FpdCBhbmQgdGltZW91dCBhZnRlciBhIGNlcnRhaW4gdGltZSwgbG9nZ2luZyB0aGUgZXJyb3IgaWYgaXQgZmFpbHMgb3IgdGltZXMgb3V0LlxuXHRcdFx0XHRyYWNlVGltZW91dChcblx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChkZWZhdWx0Q2hhdC5vdXRwdXRFeHRlbnNpb25TdGF0ZUNvbW1hbmQpLFxuXHRcdFx0XHRcdDUwMDAsXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tjaGF0IHNldHVwXSBUaW1lZCBvdXQgZXhlY3V0aW5nIGV4dGVuc2lvbiBzdGF0ZSBjb21tYW5kJylcblx0XHRcdFx0KS50aGVuKHVuZGVmaW5lZCwgZXJyb3IgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdbY2hhdCBzZXR1cF0gRmFpbGVkIHRvIGV4ZWN1dGUgZXh0ZW5zaW9uIHN0YXRlIGNvbW1hbmQnLCBlcnJvcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGVmYXVsdENoYXQub3V0cHV0Q2hhbm5lbElkKSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGB3b3JrYmVuY2guYWN0aW9uLm91dHB1dC5zaG93LiR7ZGVmYXVsdENoYXQub3V0cHV0Q2hhbm5lbElkfWApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCwgcHJvZ3Jlc3M6IChwYXJ0czogSUNoYXRQcm9ncmVzc1tdKSA9PiB2b2lkKTogUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXN5bmMgYWNjZXNzb3IgLyogdXNpbmcgYWNjZXNzb3IgZm9yIGxhenkgbG9hZGluZyAqLyA9PiB7XG5cdFx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsc1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNoYXRBZ2VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRBZ2VudFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cblx0XHRcdHJldHVybiB0aGlzLmRvSW52b2tlKHJlcXVlc3QsIHBhcnQgPT4gcHJvZ3Jlc3MoW3BhcnRdKSwgY2hhdFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxzU2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIGRlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSW52b2tlKHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBwcm9ncmVzczogKHBhcnQ6IElDaGF0UHJvZ3Jlc3MpID0+IHZvaWQsIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSwgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UpOiBQcm9taXNlPElDaGF0QWdlbnRSZXN1bHQ+IHtcblx0XHRpZiAoY2hhdFJlcXVpcmVzU2V0dXAoe1xuXHRcdFx0Y29tcGxldGVkOiAhIXRoaXMuY29udGV4dC5zdGF0ZS5jb21wbGV0ZWQsXG5cdFx0XHRkaXNhYmxlZDogISF0aGlzLmNvbnRleHQuc3RhdGUuZGlzYWJsZWQsXG5cdFx0XHR1bnRydXN0ZWQ6ICEhdGhpcy5jb250ZXh0LnN0YXRlLnVudHJ1c3RlZCxcblx0XHRcdGVudGl0bGVtZW50OiB0aGlzLmNvbnRleHQuc3RhdGUuZW50aXRsZW1lbnQsXG5cdFx0XHRhbm9ueW1vdXM6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXMsXG5cdFx0XHRoYXNCeW9rTW9kZWxzOiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuaGFzQnlva01vZGVscyxcblx0XHR9KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9JbnZva2VXaXRoU2V0dXAocmVxdWVzdCwgcHJvZ3Jlc3MsIGNoYXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGNoYXRXaWRnZXRTZXJ2aWNlLCBjaGF0QWdlbnRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBkZWZhdWx0QWNjb3VudFNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvSW52b2tlV2l0aG91dFNldHVwKHJlcXVlc3QsIHByb2dyZXNzLCBjaGF0U2VydmljZSwgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZSwgY2hhdEFnZW50U2VydmljZSwgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSW52b2tlV2l0aG91dFNldHVwKHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBwcm9ncmVzczogKHBhcnQ6IElDaGF0UHJvZ3Jlc3MpID0+IHZvaWQsIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSwgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKTogUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0PiB7XG5cdFx0Y29uc3QgcmVxdWVzdE1vZGVsID0gY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpPy52aWV3TW9kZWw/Lm1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdGlmICghcmVxdWVzdE1vZGVsKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tjaGF0IHNldHVwXSBSZXF1ZXN0IG1vZGVsIG5vdCBmb3VuZCwgY2Fubm90IHJlZGlzcGF0Y2ggcmVxdWVzdC4nKTtcblx0XHRcdHJldHVybiB7fTsgLy8gdGhpcyBzaG91bGQgbm90IGhhcHBlblxuXHRcdH1cblxuXHRcdHByb2dyZXNzKHtcblx0XHRcdGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLFxuXHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCd3YWl0aW5nQ2hhdCcsIFwiR2V0dGluZyBjaGF0IHJlYWR5XCIpKSxcblx0XHRcdHNoaW1tZXI6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0aGlzLmZvcndhcmRSZXF1ZXN0VG9DaGF0KHJlcXVlc3RNb2RlbCwgcHJvZ3Jlc3MsIGNoYXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2UsIGNoYXRXaWRnZXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKTtcblxuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZm9yd2FyZFJlcXVlc3RUb0NoYXQocmVxdWVzdE1vZGVsOiBJQ2hhdFJlcXVlc3RNb2RlbCwgcHJvZ3Jlc3M6IChwYXJ0OiBJQ2hhdFByb2dyZXNzKSA9PiB2b2lkLCBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvRm9yd2FyZFJlcXVlc3RUb0NoYXQocmVxdWVzdE1vZGVsLCBwcm9ncmVzcywgY2hhdFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxzU2VydmljZSwgY2hhdEFnZW50U2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tjaGF0IHNldHVwXSBGYWlsZWQgdG8gZm9yd2FyZCByZXF1ZXN0IHRvIGNoYXQnLCBlcnJvcik7XG5cblx0XHRcdHByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ3dhcm5pbmcnLFxuXHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NvcGlsb3RVbmF2YWlsYWJsZVdhcm5pbmcnLCBcIkZhaWxlZCB0byBnZXQgYSByZXNwb25zZS4gUGxlYXNlIHRyeSBhZ2Fpbi5cIikpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvRm9yd2FyZFJlcXVlc3RUb0NoYXQocmVxdWVzdE1vZGVsOiBJQ2hhdFJlcXVlc3RNb2RlbCwgcHJvZ3Jlc3M6IChwYXJ0OiBJQ2hhdFByb2dyZXNzKSA9PiB2b2lkLCBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLnBlbmRpbmdGb3J3YXJkZWRSZXF1ZXN0cy5oYXMocmVxdWVzdE1vZGVsLnNlc3Npb24uc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZXF1ZXN0IGFscmVhZHkgaW4gcHJvZ3Jlc3MnKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb3J3YXJkUmVxdWVzdCA9IHRoaXMuZG9Gb3J3YXJkUmVxdWVzdFRvQ2hhdFdoZW5SZWFkeShyZXF1ZXN0TW9kZWwsIHByb2dyZXNzLCBjaGF0U2VydmljZSwgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBjaGF0QWdlbnRTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZSwgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk7XG5cdFx0dGhpcy5wZW5kaW5nRm9yd2FyZGVkUmVxdWVzdHMuc2V0KHJlcXVlc3RNb2RlbC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZSwgZm9yd2FyZFJlcXVlc3QpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZvcndhcmRSZXF1ZXN0O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdGb3J3YXJkZWRSZXF1ZXN0cy5kZWxldGUocmVxdWVzdE1vZGVsLnNlc3Npb24uc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvRm9yd2FyZFJlcXVlc3RUb0NoYXRXaGVuUmVhZHkocmVxdWVzdE1vZGVsOiBJQ2hhdFJlcXVlc3RNb2RlbCwgcHJvZ3Jlc3M6IChwYXJ0OiBJQ2hhdFByb2dyZXNzKSA9PiB2b2lkLCBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gRW5zdXJlIGF1dGggZXh0ZW5zaW9uIGlzIGVuYWJsZWQgYmVmb3JlIHdhaXRpbmcgZm9yIGNoYXQgcmVhZGluZXNzLlxuXHRcdC8vIFRoaXMgbXVzdCBydW4gYmVmb3JlIHRoZSByZWFkaW5lc3MgZXZlbnQgbGlzdGVuZXJzIGFyZSBzZXQgdXAgYmVjYXVzZVxuXHRcdC8vIHVwZGF0ZVJ1bm5pbmdFeHRlbnNpb25zIHJlc3RhcnRzIGFsbCBleHRlbnNpb24gaG9zdHMuXG5cdFx0Y29uc3QgYXV0aEV4dGVuc2lvblJlRW5hYmxlZCA9IGF3YWl0IG1heWJlRW5hYmxlQXV0aEV4dGVuc2lvbih0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGlmIChhdXRoRXh0ZW5zaW9uUmVFbmFibGVkKSB7XG5cdFx0XHRyZWZyZXNoVG9rZW5zKHRoaXMuY29tbWFuZFNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHJlcXVlc3RNb2RlbC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgbW9kZUluZm8gPSB3aWRnZXQ/LmlucHV0LmN1cnJlbnRNb2RlSW5mbztcblxuXHRcdC8vIFdlIG5lZWQgYSBzaWduYWwgdG8ga25vdyB3aGVuIHdlIGNhbiByZXNlbmQgdGhlIHJlcXVlc3QgdG9cblx0XHQvLyBDaGF0LiBXYWl0aW5nIGZvciB0aGUgcmVnaXN0cmF0aW9uIG9mIHRoZSBhZ2VudCBpcyBub3Rcblx0XHQvLyBlbm91Z2gsIHdlIGFsc28gbmVlZCBhIGxhbmd1YWdlL3Rvb2xzIG1vZGVsIHRvIGJlIGF2YWlsYWJsZS5cblxuXHRcdGxldCBhZ2VudEFjdGl2YXRlZCA9IGZhbHNlO1xuXHRcdGxldCBhZ2VudFJlYWR5ID0gZmFsc2U7XG5cdFx0bGV0IGxhbmd1YWdlTW9kZWxSZWFkeSA9IGZhbHNlO1xuXHRcdGxldCB0b29sc01vZGVsUmVhZHkgPSBmYWxzZTtcblxuXHRcdG1hcmtDaGF0R2xvYmFsKENoYXRHbG9iYWxQZXJmTWFyay5XaWxsV2FpdEZvckFjdGl2YXRpb24pO1xuXG5cdFx0Y29uc3Qgd2hlbkFnZW50QWN0aXZhdGVkID0gdGhpcy53aGVuQWdlbnRBY3RpdmF0ZWQoY2hhdFNlcnZpY2UpLnRoZW4oKCkgPT4gYWdlbnRBY3RpdmF0ZWQgPSB0cnVlKTtcblx0XHRjb25zdCB3aGVuQWdlbnRSZWFkeSA9IHRoaXMud2hlbkFnZW50UmVhZHkoY2hhdEFnZW50U2VydmljZSwgbW9kZUluZm8/LmtpbmQpPy50aGVuKCgpID0+IGFnZW50UmVhZHkgPSB0cnVlKTtcblx0XHRpZiAoIXdoZW5BZ2VudFJlYWR5KSB7XG5cdFx0XHRhZ2VudFJlYWR5ID0gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3Qgd2hlbkxhbmd1YWdlTW9kZWxSZWFkeSA9IHRoaXMud2hlbkxhbmd1YWdlTW9kZWxSZWFkeShsYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHJlcXVlc3RNb2RlbC5tb2RlbElkKT8udGhlbigoKSA9PiBsYW5ndWFnZU1vZGVsUmVhZHkgPSB0cnVlKTtcblx0XHRpZiAoIXdoZW5MYW5ndWFnZU1vZGVsUmVhZHkpIHtcblx0XHRcdGxhbmd1YWdlTW9kZWxSZWFkeSA9IHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHdoZW5Ub29sc01vZGVsUmVhZHkgPSB0aGlzLndoZW5Ub29sc01vZGVsUmVhZHkobGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgcmVxdWVzdE1vZGVsKT8udGhlbigoKSA9PiB0b29sc01vZGVsUmVhZHkgPSB0cnVlKTtcblx0XHRpZiAoIXdoZW5Ub29sc01vZGVsUmVhZHkpIHtcblx0XHRcdHRvb2xzTW9kZWxSZWFkeSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHdoZW5MYW5ndWFnZU1vZGVsUmVhZHkgaW5zdGFuY2VvZiBQcm9taXNlIHx8IHdoZW5BZ2VudFJlYWR5IGluc3RhbmNlb2YgUHJvbWlzZSB8fCB3aGVuVG9vbHNNb2RlbFJlYWR5IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0Y29uc3QgdGltZW91dEhhbmRsZSA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRwcm9ncmVzcyh7XG5cdFx0XHRcdFx0a2luZDogJ3Byb2dyZXNzTWVzc2FnZScsXG5cdFx0XHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCd3YWl0aW5nQ2hhdDInLCBcIkNoYXQgaXMgYWxtb3N0IHJlYWR5XCIpKSxcblx0XHRcdFx0XHRzaGltbWVyOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sIDEwMDAwKTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKSkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYWxsUmVhZHkgPSBQcm9taXNlLmFsbFNldHRsZWQoW1xuXHRcdFx0XHRcdHdoZW5BZ2VudEFjdGl2YXRlZCxcblx0XHRcdFx0XHR3aGVuQWdlbnRSZWFkeSxcblx0XHRcdFx0XHR3aGVuTGFuZ3VhZ2VNb2RlbFJlYWR5LFxuXHRcdFx0XHRcdHdoZW5Ub29sc01vZGVsUmVhZHlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IHJlYWR5ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0XHR0aW1lb3V0KHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSA/IDYwMDAwIC8qIGluY3JlYXNlIGZvciByZW1vdGUgc2NlbmFyaW9zICovIDogMjAwMDApLnRoZW4oKCkgPT4gJ3RpbWVkb3V0JyksXG5cdFx0XHRcdFx0dGhpcy53aGVuUGFuZWxBZ2VudEhhc0d1aWRhbmNlKGRpc3Bvc2FibGVzKS50aGVuKCgpID0+ICdwYW5lbEd1aWRhbmNlJyksXG5cdFx0XHRcdFx0YWxsUmVhZHlcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0aWYgKHJlYWR5ID09PSAncGFuZWxHdWlkYW5jZScpIHtcblx0XHRcdFx0XHRjb25zdCB3YXJuaW5nTWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0VG9va0xvbmdXYXJuaW5nRXh0ZW5zaW9uJywgXCJQbGVhc2UgdHJ5IGFnYWluLlwiKTtcblxuXHRcdFx0XHRcdHByb2dyZXNzKHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHdhcm5pbmdNZXNzYWdlKVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0Ly8gVGhpcyBtZWFucyBDaGF0IGlzIHVuaGVhbHRoeSBhbmQgd2UgY2Fubm90IHJldHJ5IHRoZVxuXHRcdFx0XHRcdC8vIHJlcXVlc3QuIFNpZ25hbCB0aGlzIHRvIHRoZSBvdXRzaWRlIHZpYSBhbiBldmVudC5cblx0XHRcdFx0XHR0aGlzLl9vblVucmVzb2x2YWJsZUVycm9yLmZpcmUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocmVhZHkgPT09ICd0aW1lZG91dCcpIHtcblx0XHRcdFx0XHRsZXQgd2FybmluZ01lc3NhZ2U6IHN0cmluZztcblx0XHRcdFx0XHRpZiAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmFub255bW91cykge1xuXHRcdFx0XHRcdFx0d2FybmluZ01lc3NhZ2UgPSBsb2NhbGl6ZSgnY2hhdFRvb2tMb25nV2FybmluZ0Fub255bW91cycsIFwiQ2hhdCB0b29rIHRvbyBsb25nIHRvIGdldCByZWFkeS4gUGxlYXNlIGVuc3VyZSB0aGF0IHRoZSBleHRlbnNpb24gYHswfWAgaXMgaW5zdGFsbGVkIGFuZCBlbmFibGVkLiBDbGljayByZXN0YXJ0IHRvIHRyeSBhZ2FpbiBpZiB0aGlzIGlzc3VlIHBlcnNpc3RzLlwiLCBkZWZhdWx0Q2hhdC5jaGF0RXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR3YXJuaW5nTWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0VG9va0xvbmdXYXJuaW5nJywgXCJDaGF0IHRvb2sgdG9vIGxvbmcgdG8gZ2V0IHJlYWR5LiBQbGVhc2UgZW5zdXJlIHlvdSBhcmUgc2lnbmVkIGluIHRvIHswfSBhbmQgdGhhdCB0aGUgZXh0ZW5zaW9uIGB7MX1gIGlzIGluc3RhbGxlZCBhbmQgZW5hYmxlZC4gQ2xpY2sgcmVzdGFydCB0byB0cnkgYWdhaW4gaWYgdGhpcyBpc3N1ZSBwZXJzaXN0cy5cIiwgZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5uYW1lLCBkZWZhdWx0Q2hhdC5jaGF0RXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGRpYWdub3N0aWNJbmZvID0gdGhpcy5jb21wdXRlRGlhZ25vc3RpY0luZm8oYWdlbnRBY3RpdmF0ZWQsIGFnZW50UmVhZHksIGxhbmd1YWdlTW9kZWxSZWFkeSwgdG9vbHNNb2RlbFJlYWR5LCByZXF1ZXN0TW9kZWwsIGxhbmd1YWdlTW9kZWxzU2VydmljZSwgY2hhdEFnZW50U2VydmljZSwgbW9kZUluZm8pO1xuXG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtjaGF0IHNldHVwXSAke3dhcm5pbmdNZXNzYWdlfWAsIGRpYWdub3N0aWNJbmZvKTtcblxuXHRcdFx0XHRcdHR5cGUgQ2hhdFNldHVwVGltZW91dENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdFx0b3duZXI6ICdjaHJtYXJ0aSc7XG5cdFx0XHRcdFx0XHRjb21tZW50OiAnUHJvdmlkZXMgaW5zaWdodCBpbnRvIGNoYXQgc2V0dXAgdGltZW91dHMuJztcblx0XHRcdFx0XHRcdGFnZW50QWN0aXZhdGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgYWdlbnQgd2FzIGFjdGl2YXRlZC4nIH07XG5cdFx0XHRcdFx0XHRhZ2VudFJlYWR5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgYWdlbnQgd2FzIHJlYWR5LicgfTtcblx0XHRcdFx0XHRcdGFnZW50SGFzRGVmYXVsdDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgYSBkZWZhdWx0IGFnZW50IGV4aXN0cyBmb3IgdGhlIGxvY2F0aW9uIGFuZCBtb2RlLicgfTtcblx0XHRcdFx0XHRcdGFnZW50RGVmYXVsdElzQ29yZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGRlZmF1bHQgYWdlbnQgaXMgYSBjb3JlIGFnZW50LicgfTtcblx0XHRcdFx0XHRcdGFnZW50SGFzQ29udHJpYnV0ZWREZWZhdWx0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhIGNvbnRyaWJ1dGVkIGRlZmF1bHQgYWdlbnQgZXhpc3RzIGZvciB0aGUgbG9jYXRpb24uJyB9O1xuXHRcdFx0XHRcdFx0YWdlbnRDb250cmlidXRlZERlZmF1bHRJc0NvcmU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBjb250cmlidXRlZCBkZWZhdWx0IGFnZW50IGlzIGEgY29yZSBhZ2VudC4nIH07XG5cdFx0XHRcdFx0XHRhZ2VudEFjdGl2YXRlZENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIGFjdGl2YXRlZCBhZ2VudHMgYXQgdGltZW91dC4nIH07XG5cdFx0XHRcdFx0XHRhZ2VudExvY2F0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGNoYXQgYWdlbnQgbG9jYXRpb24uJyB9O1xuXHRcdFx0XHRcdFx0YWdlbnRNb2RlS2luZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjaGF0IG1vZGUga2luZC4nIH07XG5cdFx0XHRcdFx0XHRsYW5ndWFnZU1vZGVsUmVhZHk6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBsYW5ndWFnZSBtb2RlbCB3YXMgcmVhZHkuJyB9O1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VNb2RlbENvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHJlZ2lzdGVyZWQgbGFuZ3VhZ2UgbW9kZWxzIGF0IHRpbWVvdXQuJyB9O1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VNb2RlbERlZmF1bHRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBsYW5ndWFnZSBtb2RlbHMgd2l0aCBpc0RlZmF1bHRGb3JMb2NhdGlvbltDaGF0XSBzZXQuJyB9O1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VNb2RlbEhhc1JlcXVlc3RlZE1vZGVsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhIHNwZWNpZmljIG1vZGVsIElEIHdhcyByZXF1ZXN0ZWQuJyB9O1xuXHRcdFx0XHRcdFx0dG9vbHNNb2RlbFJlYWR5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdG9vbHMgbW9kZWwgd2FzIHJlYWR5LicgfTtcblx0XHRcdFx0XHRcdGlzUmVtb3RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGlzIGlzIGEgcmVtb3RlIHNjZW5hcmlvLicgfTtcblx0XHRcdFx0XHRcdGlzQW5vbnltb3VzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhbm9ueW1vdXMgYWNjZXNzIGlzIGVuYWJsZWQuJyB9O1xuXHRcdFx0XHRcdFx0bWF0Y2hpbmdXZWxjb21lVmlld1doZW46IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgd2hlbiBjbGF1c2Ugb2YgdGhlIG1hdGNoaW5nIGV4dGVuc2lvbiB3ZWxjb21lIHZpZXcsIGlmIGFueS4nIH07XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0eXBlIENoYXRTZXR1cFRpbWVvdXRFdmVudCA9IHtcblx0XHRcdFx0XHRcdGFnZW50QWN0aXZhdGVkOiBib29sZWFuO1xuXHRcdFx0XHRcdFx0YWdlbnRSZWFkeTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdGFnZW50SGFzRGVmYXVsdDogYm9vbGVhbjtcblx0XHRcdFx0XHRcdGFnZW50RGVmYXVsdElzQ29yZTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdGFnZW50SGFzQ29udHJpYnV0ZWREZWZhdWx0OiBib29sZWFuO1xuXHRcdFx0XHRcdFx0YWdlbnRDb250cmlidXRlZERlZmF1bHRJc0NvcmU6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHRhZ2VudEFjdGl2YXRlZENvdW50OiBudW1iZXI7XG5cdFx0XHRcdFx0XHRhZ2VudExvY2F0aW9uOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRhZ2VudE1vZGVLaW5kOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRsYW5ndWFnZU1vZGVsUmVhZHk6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHRsYW5ndWFnZU1vZGVsQ291bnQ6IG51bWJlcjtcblx0XHRcdFx0XHRcdGxhbmd1YWdlTW9kZWxEZWZhdWx0Q291bnQ6IG51bWJlcjtcblx0XHRcdFx0XHRcdGxhbmd1YWdlTW9kZWxIYXNSZXF1ZXN0ZWRNb2RlbDogYm9vbGVhbjtcblx0XHRcdFx0XHRcdHRvb2xzTW9kZWxSZWFkeTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdGlzUmVtb3RlOiBib29sZWFuO1xuXHRcdFx0XHRcdFx0aXNBbm9ueW1vdXM6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHRtYXRjaGluZ1dlbGNvbWVWaWV3V2hlbjogc3RyaW5nO1xuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0U2V0dXBUaW1lb3V0RXZlbnQsIENoYXRTZXR1cFRpbWVvdXRDbGFzc2lmaWNhdGlvbj4oJ2NoYXRTZXR1cC50aW1lb3V0JywgZGlhZ25vc3RpY0luZm8pO1xuXG5cdFx0XHRcdFx0cHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdFx0a2luZDogJ3dhcm5pbmcnLFxuXHRcdFx0XHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHdhcm5pbmdNZXNzYWdlKVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKGRlZmF1bHRDaGF0Lm91dHB1dENoYW5uZWxJZCAmJiB0aGlzLm91dHB1dFNlcnZpY2UuZ2V0Q2hhbm5lbERlc2NyaXB0b3IoZGVmYXVsdENoYXQub3V0cHV0Q2hhbm5lbElkKSkge1xuXHRcdFx0XHRcdFx0cHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogU2V0dXBBZ2VudC5DSEFUX1NIT1dfT1VUUFVUX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaG93Q29waWxvdENoYXREZXRhaWxzJywgXCJTaG93IERldGFpbHNcIilcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGRlZmF1bHRDaGF0Lm91dHB1dENoYW5uZWxJZFxuXHRcdFx0XHRcdFx0XHQ/IGBbY2hhdCBzZXR1cF0gTm8gb3V0cHV0IGNoYW5uZWwgZm91bmQgZm9yIGlkICcke2RlZmF1bHRDaGF0Lm91dHB1dENoYW5uZWxJZH0nIHRvIHNob3cgZGV0YWlscyBhYm91dCBjaGF0IHNldHVwIHRpbWVvdXQuIFBsZWFzZSBlbnN1cmUgdGhlICR7ZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkfSBleHRlbnNpb24gaXMgYWN0aXZhdGVkLmBcblx0XHRcdFx0XHRcdFx0OiAnW2NoYXQgc2V0dXBdIE5vIG91dHB1dCBjaGFubmVsIHByb3ZpZGVkIHZpYSBwcm9kdWN0Lmpzb24gdG8gc2hvdyBkZXRhaWxzIGFib3V0IGNoYXQgc2V0dXAgdGltZW91dC4nKTtcblx0XHRcdFx0XHRcdHByb2dyZXNzKHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IFNldHVwQWdlbnQuQ0hBVF9SRVRSWV9DT01NQU5EX0lELFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmV0cnlDaGF0JywgXCJSZXN0YXJ0XCIpLFxuXHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW3JlcXVlc3RNb2RlbC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZV1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gV2FpdCBmb3IgYWxsIHJlYWRpbmVzcyBzaWduYWxzIGFuZCBsb2cvc2VuZFxuXHRcdFx0XHRcdC8vIHRlbGVtZXRyeSBhYm91dCByZWNvdmVyeSBhZnRlciB0aGUgdGltZW91dC5cblx0XHRcdFx0XHRhd2FpdCBhbGxSZWFkeTtcblxuXHRcdFx0XHRcdGNvbnN0IHJlY292ZXJ5RGlhZ25vc3RpY0luZm8gPSB0aGlzLmNvbXB1dGVEaWFnbm9zdGljSW5mbyhhZ2VudEFjdGl2YXRlZCwgYWdlbnRSZWFkeSwgbGFuZ3VhZ2VNb2RlbFJlYWR5LCB0b29sc01vZGVsUmVhZHksIHJlcXVlc3RNb2RlbCwgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBjaGF0QWdlbnRTZXJ2aWNlLCBtb2RlSW5mbyk7XG5cblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnW2NoYXQgc2V0dXBdIENoYXQgc2V0dXAgdGltZW91dCByZWNvdmVyZWQnLCByZWNvdmVyeURpYWdub3N0aWNJbmZvKTtcblxuXHRcdFx0XHRcdHR5cGUgQ2hhdFNldHVwVGltZW91dFJlY292ZXJ5Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRvd25lcjogJ2Nocm1hcnRpJztcblx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdQcm92aWRlcyBpbnNpZ2h0IGludG8gY2hhdCBzZXR1cCB0aW1lb3V0IHJlY292ZXJ5Lic7XG5cdFx0XHRcdFx0XHRhZ2VudEFjdGl2YXRlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGFnZW50IHdhcyBhY3RpdmF0ZWQuJyB9O1xuXHRcdFx0XHRcdFx0YWdlbnRSZWFkeTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGFnZW50IHdhcyByZWFkeS4nIH07XG5cdFx0XHRcdFx0XHRhZ2VudEhhc0RlZmF1bHQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIGEgZGVmYXVsdCBhZ2VudCBleGlzdHMgZm9yIHRoZSBsb2NhdGlvbiBhbmQgbW9kZS4nIH07XG5cdFx0XHRcdFx0XHRhZ2VudERlZmF1bHRJc0NvcmU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBkZWZhdWx0IGFnZW50IGlzIGEgY29yZSBhZ2VudC4nIH07XG5cdFx0XHRcdFx0XHRhZ2VudEhhc0NvbnRyaWJ1dGVkRGVmYXVsdDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgYSBjb250cmlidXRlZCBkZWZhdWx0IGFnZW50IGV4aXN0cyBmb3IgdGhlIGxvY2F0aW9uLicgfTtcblx0XHRcdFx0XHRcdGFnZW50Q29udHJpYnV0ZWREZWZhdWx0SXNDb3JlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgY29udHJpYnV0ZWQgZGVmYXVsdCBhZ2VudCBpcyBhIGNvcmUgYWdlbnQuJyB9O1xuXHRcdFx0XHRcdFx0YWdlbnRBY3RpdmF0ZWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBhY3RpdmF0ZWQgYWdlbnRzIGF0IHJlY292ZXJ5IHRpbWUuJyB9O1xuXHRcdFx0XHRcdFx0YWdlbnRMb2NhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjaGF0IGFnZW50IGxvY2F0aW9uLicgfTtcblx0XHRcdFx0XHRcdGFnZW50TW9kZUtpbmQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY2hhdCBtb2RlIGtpbmQuJyB9O1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VNb2RlbFJlYWR5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgbGFuZ3VhZ2UgbW9kZWwgd2FzIHJlYWR5LicgfTtcblx0XHRcdFx0XHRcdGxhbmd1YWdlTW9kZWxDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiByZWdpc3RlcmVkIGxhbmd1YWdlIG1vZGVscyBhdCByZWNvdmVyeSB0aW1lLicgfTtcblx0XHRcdFx0XHRcdGxhbmd1YWdlTW9kZWxEZWZhdWx0Q291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgbGFuZ3VhZ2UgbW9kZWxzIHdpdGggaXNEZWZhdWx0Rm9yTG9jYXRpb25bQ2hhdF0gc2V0IGF0IHJlY292ZXJ5IHRpbWUuJyB9O1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VNb2RlbEhhc1JlcXVlc3RlZE1vZGVsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhIHNwZWNpZmljIG1vZGVsIElEIHdhcyByZXF1ZXN0ZWQuJyB9O1xuXHRcdFx0XHRcdFx0dG9vbHNNb2RlbFJlYWR5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgdG9vbHMgbW9kZWwgd2FzIHJlYWR5LicgfTtcblx0XHRcdFx0XHRcdGlzUmVtb3RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGlzIGlzIGEgcmVtb3RlIHNjZW5hcmlvLicgfTtcblx0XHRcdFx0XHRcdGlzQW5vbnltb3VzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhbm9ueW1vdXMgYWNjZXNzIGlzIGVuYWJsZWQuJyB9O1xuXHRcdFx0XHRcdFx0bWF0Y2hpbmdXZWxjb21lVmlld1doZW46IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgd2hlbiBjbGF1c2Ugb2YgdGhlIG1hdGNoaW5nIGV4dGVuc2lvbiB3ZWxjb21lIHZpZXcsIGlmIGFueS4nIH07XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0eXBlIENoYXRTZXR1cFRpbWVvdXRSZWNvdmVyeUV2ZW50ID0ge1xuXHRcdFx0XHRcdFx0YWdlbnRBY3RpdmF0ZWQ6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHRhZ2VudFJlYWR5OiBib29sZWFuO1xuXHRcdFx0XHRcdFx0YWdlbnRIYXNEZWZhdWx0OiBib29sZWFuO1xuXHRcdFx0XHRcdFx0YWdlbnREZWZhdWx0SXNDb3JlOiBib29sZWFuO1xuXHRcdFx0XHRcdFx0YWdlbnRIYXNDb250cmlidXRlZERlZmF1bHQ6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHRhZ2VudENvbnRyaWJ1dGVkRGVmYXVsdElzQ29yZTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdGFnZW50QWN0aXZhdGVkQ291bnQ6IG51bWJlcjtcblx0XHRcdFx0XHRcdGFnZW50TG9jYXRpb246IHN0cmluZztcblx0XHRcdFx0XHRcdGFnZW50TW9kZUtpbmQ6IHN0cmluZztcblx0XHRcdFx0XHRcdGxhbmd1YWdlTW9kZWxSZWFkeTogYm9vbGVhbjtcblx0XHRcdFx0XHRcdGxhbmd1YWdlTW9kZWxDb3VudDogbnVtYmVyO1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VNb2RlbERlZmF1bHRDb3VudDogbnVtYmVyO1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VNb2RlbEhhc1JlcXVlc3RlZE1vZGVsOiBib29sZWFuO1xuXHRcdFx0XHRcdFx0dG9vbHNNb2RlbFJlYWR5OiBib29sZWFuO1xuXHRcdFx0XHRcdFx0aXNSZW1vdGU6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHRpc0Fub255bW91czogYm9vbGVhbjtcblx0XHRcdFx0XHRcdG1hdGNoaW5nV2VsY29tZVZpZXdXaGVuOiBzdHJpbmc7XG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRTZXR1cFRpbWVvdXRSZWNvdmVyeUV2ZW50LCBDaGF0U2V0dXBUaW1lb3V0UmVjb3ZlcnlDbGFzc2lmaWNhdGlvbj4oJ2NoYXRTZXR1cC50aW1lb3V0UmVjb3ZlcnknLCByZWNvdmVyeURpYWdub3N0aWNJbmZvKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG1hcmtDaGF0R2xvYmFsKENoYXRHbG9iYWxQZXJmTWFyay5EaWRXYWl0Rm9yQWN0aXZhdGlvbik7XG5cdFx0YXdhaXQgY2hhdFNlcnZpY2UucmVzZW5kUmVxdWVzdChyZXF1ZXN0TW9kZWwsIHtcblx0XHRcdC4uLndpZGdldD8uZ2V0TW9kZVJlcXVlc3RPcHRpb25zKCksXG5cdFx0XHRtb2RlSW5mbyxcblx0XHRcdC4uLndpZGdldD8uZ2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zKClcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2hlblBhbmVsQWdlbnRIYXNHdWlkYW5jZShkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGFuZWxBZ2VudEhhc0d1aWRhbmNlID0gKCkgPT4gY2hhdFZpZXdzV2VsY29tZVJlZ2lzdHJ5LmdldCgpLnNvbWUoZGVzY3JpcHRvciA9PiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoZGVzY3JpcHRvci53aGVuKSk7XG5cblx0XHRpZiAocGFuZWxBZ2VudEhhc0d1aWRhbmNlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRsZXQgZGVzY3JpcHRvcktleXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRcdFx0Y29uc3QgdXBkYXRlRGVzY3JpcHRvcktleXMgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0b3JzID0gY2hhdFZpZXdzV2VsY29tZVJlZ2lzdHJ5LmdldCgpO1xuXHRcdFx0XHRkZXNjcmlwdG9yS2V5cyA9IG5ldyBTZXQoZGVzY3JpcHRvcnMuZmxhdE1hcChkID0+IGQud2hlbi5rZXlzKCkpKTtcblx0XHRcdH07XG5cdFx0XHR1cGRhdGVEZXNjcmlwdG9yS2V5cygpO1xuXG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZVJlZ2lzdHJ5ID0gRXZlbnQubWFwKGNoYXRWaWV3c1dlbGNvbWVSZWdpc3RyeS5vbkRpZENoYW5nZSwgKCkgPT4gJ3JlZ2lzdHJ5JyBhcyBjb25zdCk7XG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZVJlbGV2YW50Q29udGV4dCA9IEV2ZW50Lm1hcChcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCBlID0+IGUuYWZmZWN0c1NvbWUoZGVzY3JpcHRvcktleXMpKSxcblx0XHRcdFx0KCkgPT4gJ2NvbnRleHQnIGFzIGNvbnN0XG5cdFx0XHQpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQuYW55KFxuXHRcdFx0XHRvbkRpZENoYW5nZVJlZ2lzdHJ5LFxuXHRcdFx0XHRvbkRpZENoYW5nZVJlbGV2YW50Q29udGV4dFxuXHRcdFx0KShzb3VyY2UgPT4ge1xuXHRcdFx0XHRpZiAoc291cmNlID09PSAncmVnaXN0cnknKSB7XG5cdFx0XHRcdFx0dXBkYXRlRGVzY3JpcHRvcktleXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGFuZWxBZ2VudEhhc0d1aWRhbmNlKCkpIHtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgd2hlbkxhbmd1YWdlTW9kZWxSZWFkeShsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dW5rbm93bj4gfCB2b2lkIHtcblx0XHRjb25zdCBoYXNNb2RlbEZvclJlcXVlc3QgPSAoKSA9PiB7XG5cdFx0XHRpZiAobW9kZWxJZCkge1xuXHRcdFx0XHRyZXR1cm4gISFsYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlbElkKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoaWQpO1xuXHRcdFx0XHRpZiAobW9kZWw/LmlzRGVmYXVsdEZvckxvY2F0aW9uW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH07XG5cblx0XHRpZiAoaGFzTW9kZWxGb3JSZXF1ZXN0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihsYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscywgKCkgPT4gaGFzTW9kZWxGb3JSZXF1ZXN0KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgd2hlblRvb2xzTW9kZWxSZWFkeShsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgcmVxdWVzdE1vZGVsOiBJQ2hhdFJlcXVlc3RNb2RlbCk6IFByb21pc2U8dW5rbm93bj4gfCB2b2lkIHtcblx0XHRjb25zdCBuZWVkc1Rvb2xzTW9kZWwgPSByZXF1ZXN0TW9kZWwubWVzc2FnZS5wYXJ0cy5zb21lKHBhcnQgPT4gcGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0VG9vbFBhcnQpO1xuXHRcdGlmICghbmVlZHNUb29sc01vZGVsKSB7XG5cdFx0XHRyZXR1cm47IC8vIE5vIHRvb2xzIGluIHRoaXMgcmVxdWVzdCwgbm8gbmVlZCB0byBjaGVja1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIHRoYXQgdG9vbHMgb3RoZXIgdGhhbiBzZXR1cC4gYW5kIGludGVybmFsIHRvb2xzIGFyZSByZWdpc3RlcmVkLlxuXHRcdGZvciAoY29uc3QgdG9vbCBvZiBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQoKSkge1xuXHRcdFx0aWYgKHRvb2wuaWQuc3RhcnRzV2l0aCgnY29waWxvdF8nKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHdlIGhhdmUgdG9vbHMhXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEV2ZW50LnRvUHJvbWlzZShFdmVudC5maWx0ZXIobGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5vbkRpZENoYW5nZVRvb2xzLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRBbGxUb29sc0luY2x1ZGluZ0Rpc2FibGVkKCkpIHtcblx0XHRcdFx0aWYgKHRvb2wuaWQuc3RhcnRzV2l0aCgnY29waWxvdF8nKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlOyAvLyB3ZSBoYXZlIHRvb2xzIVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTsgLy8gbm8gZXh0ZXJuYWwgdG9vbHMgZm91bmRcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHdoZW5BZ2VudFJlYWR5KGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLCBtb2RlOiBDaGF0TW9kZUtpbmQgfCB1bmRlZmluZWQpOiBQcm9taXNlPHVua25vd24+IHwgdm9pZCB7XG5cdFx0Y29uc3QgZGVmYXVsdEFnZW50ID0gY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQodGhpcy5sb2NhdGlvbiwgbW9kZSk7XG5cdFx0aWYgKGRlZmF1bHRBZ2VudCAmJiAhZGVmYXVsdEFnZW50LmlzQ29yZSkge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBoYXZlIGEgZGVmYXVsdCBhZ2VudCBmcm9tIGFuIGV4dGVuc2lvbiFcblx0XHR9XG5cblx0XHRyZXR1cm4gRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihjaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0QWdlbnQgPSBjaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudCh0aGlzLmxvY2F0aW9uLCBtb2RlKTtcblx0XHRcdHJldHVybiBCb29sZWFuKGRlZmF1bHRBZ2VudCAmJiAhZGVmYXVsdEFnZW50LmlzQ29yZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3aGVuQWdlbnRBY3RpdmF0ZWQoY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjaGF0U2VydmljZS5hY3RpdmF0ZURlZmF1bHRBZ2VudCh0aGlzLmxvY2F0aW9uKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVEaWFnbm9zdGljSW5mbyhhZ2VudEFjdGl2YXRlZDogYm9vbGVhbiwgYWdlbnRSZWFkeTogYm9vbGVhbiwgbGFuZ3VhZ2VNb2RlbFJlYWR5OiBib29sZWFuLCB0b29sc01vZGVsUmVhZHk6IGJvb2xlYW4sIHJlcXVlc3RNb2RlbDogSUNoYXRSZXF1ZXN0TW9kZWwsIGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsIG1vZGVJbmZvOiB7IGtpbmQ/OiBDaGF0TW9kZUtpbmQgfSB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxJZHMgPSBsYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpO1xuXHRcdGxldCBsYW5ndWFnZU1vZGVsRGVmYXVsdENvdW50ID0gMDtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIGxhbmd1YWdlTW9kZWxJZHMpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoaWQpO1xuXHRcdFx0aWYgKG1vZGVsPy5pc0RlZmF1bHRGb3JMb2NhdGlvbltDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSkge1xuXHRcdFx0XHRsYW5ndWFnZU1vZGVsRGVmYXVsdENvdW50Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdEFnZW50ID0gY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQodGhpcy5sb2NhdGlvbiwgbW9kZUluZm8/LmtpbmQpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkRGVmYXVsdEFnZW50ID0gY2hhdEFnZW50U2VydmljZS5nZXRDb250cmlidXRlZERlZmF1bHRBZ2VudCh0aGlzLmxvY2F0aW9uKTtcblx0XHRjb25zdCBjaGF0Vmlld1BhbmUgPSB0aGlzLnZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkKENoYXRWaWV3SWQpIGFzIENoYXRWaWV3UGFuZSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtYXRjaGluZ1dlbGNvbWVWaWV3ID0gY2hhdFZpZXdQYW5lPy5nZXRNYXRjaGluZ1dlbGNvbWVWaWV3KCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0YWdlbnRBY3RpdmF0ZWQsXG5cdFx0XHRhZ2VudFJlYWR5LFxuXHRcdFx0YWdlbnRIYXNEZWZhdWx0OiAhIWRlZmF1bHRBZ2VudCxcblx0XHRcdGFnZW50RGVmYXVsdElzQ29yZTogZGVmYXVsdEFnZW50Py5pc0NvcmUgPz8gZmFsc2UsXG5cdFx0XHRhZ2VudEhhc0NvbnRyaWJ1dGVkRGVmYXVsdDogISFjb250cmlidXRlZERlZmF1bHRBZ2VudCxcblx0XHRcdGFnZW50Q29udHJpYnV0ZWREZWZhdWx0SXNDb3JlOiBjb250cmlidXRlZERlZmF1bHRBZ2VudD8uaXNDb3JlID8/IGZhbHNlLFxuXHRcdFx0YWdlbnRBY3RpdmF0ZWRDb3VudDogY2hhdEFnZW50U2VydmljZS5nZXRBY3RpdmF0ZWRBZ2VudHMoKS5sZW5ndGgsXG5cdFx0XHRhZ2VudExvY2F0aW9uOiB0aGlzLmxvY2F0aW9uLFxuXHRcdFx0YWdlbnRNb2RlS2luZDogbW9kZUluZm8/LmtpbmQgPz8gJycsXG5cdFx0XHRsYW5ndWFnZU1vZGVsUmVhZHksXG5cdFx0XHRsYW5ndWFnZU1vZGVsQ291bnQ6IGxhbmd1YWdlTW9kZWxJZHMubGVuZ3RoLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbERlZmF1bHRDb3VudCxcblx0XHRcdGxhbmd1YWdlTW9kZWxIYXNSZXF1ZXN0ZWRNb2RlbDogISFyZXF1ZXN0TW9kZWwubW9kZWxJZCxcblx0XHRcdHRvb2xzTW9kZWxSZWFkeSxcblx0XHRcdGlzUmVtb3RlOiAhIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdGlzQW5vbnltb3VzOiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzLFxuXHRcdFx0bWF0Y2hpbmdXZWxjb21lVmlld1doZW46IG1hdGNoaW5nV2VsY29tZVZpZXc/LndoZW4uc2VyaWFsaXplKCkgPz8gKGNoYXRWaWV3UGFuZSA/ICdub1dlbGNvbWVWaWV3JyA6ICdub0NoYXRWaWV3UGFuZScpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvSW52b2tlV2l0aFNldHVwKHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBwcm9ncmVzczogKHBhcnQ6IElDaGF0UHJvZ3Jlc3MpID0+IHZvaWQsIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSwgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UpOiBQcm9taXNlPElDaGF0QWdlbnRSZXN1bHQ+IHtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBDSEFUX1NFVFVQX0FDVElPTl9JRCwgZnJvbTogJ2NoYXQnIH0pO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlcXVlc3RNb2RlbCA9IHdpZGdldD8udmlld01vZGVsPy5tb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblxuXHRcdGNvbnN0IHNldHVwTGlzdGVuZXIgPSBFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5jb250cm9sbGVyLnZhbHVlLm9uRGlkQ2hhbmdlLCAoKCkgPT4ge1xuXHRcdFx0c3dpdGNoICh0aGlzLmNvbnRyb2xsZXIudmFsdWUuc3RlcCkge1xuXHRcdFx0XHRjYXNlIENoYXRTZXR1cFN0ZXAuU2lnbmluZ0luOlxuXHRcdFx0XHRcdHByb2dyZXNzKHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLFxuXHRcdFx0XHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdzZXR1cENoYXRTaWduSW4yJywgXCJTaWduaW5nIGluIHRvIHswfVwiLCBkZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCkubmFtZSkpLFxuXHRcdFx0XHRcdFx0c2hpbW1lcjogdHJ1ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0U2V0dXBTdGVwLkluc3RhbGxpbmc6XG5cdFx0XHRcdFx0cHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdFx0a2luZDogJ3Byb2dyZXNzTWVzc2FnZScsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2luc3RhbGxpbmdDaGF0JywgXCJHZXR0aW5nIGNoYXQgcmVhZHlcIikpLFxuXHRcdFx0XHRcdFx0c2hpbW1lcjogdHJ1ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgcmVzdWx0OiBJQ2hhdFNldHVwUmVzdWx0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCBDaGF0U2V0dXAuZ2V0SW5zdGFuY2UodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5jb250ZXh0LCB0aGlzLmNvbnRyb2xsZXIpLnJ1bih7XG5cdFx0XHRcdGRpc2FibGVDaGF0Vmlld1JldmVhbDogdHJ1ZSwgXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIHdlIGFyZSBhbHJlYWR5IGluIGEgY2hhdCBjb250ZXh0XG5cdFx0XHRcdGZvcmNlQW5vbnltb3VzOiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzID8gQ2hhdFNldHVwQW5vbnltb3VzLkVuYWJsZWRXaXRob3V0RGlhbG9nIDogdW5kZWZpbmVkXHQvLyBvbmx5IGVuYWJsZSBhbm9ueW1vdXMgc2VsZWN0aXZlbHlcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtjaGF0IHNldHVwXSBFcnJvciBkdXJpbmcgc2V0dXA6ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXR1cExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHQvLyBVc2VyIGhhcyBhZ3JlZWQgdG8gcnVuIHRoZSBzZXR1cFxuXHRcdGlmICh0eXBlb2YgcmVzdWx0Py5zdWNjZXNzID09PSAnYm9vbGVhbicpIHtcblx0XHRcdGlmIChyZXN1bHQuc3VjY2Vzcykge1xuXHRcdFx0XHRpZiAocmVzdWx0LmRpYWxvZ1NraXBwZWQpIHtcblx0XHRcdFx0XHRhd2FpdCB3aWRnZXQ/LmNsZWFyKCk7IC8vIG1ha2Ugcm9vbSBmb3IgdGhlIENoYXQgd2VsY29tZSBleHBlcmllbmNlXG5cdFx0XHRcdH0gZWxzZSBpZiAocmVxdWVzdE1vZGVsKSB7XG5cdFx0XHRcdFx0bGV0IG5ld1JlcXVlc3QgPSB0aGlzLnJlcGxhY2VBZ2VudEluUmVxdWVzdE1vZGVsKHJlcXVlc3RNb2RlbCwgY2hhdEFnZW50U2VydmljZSk7IFx0Ly8gUmVwbGFjZSBhZ2VudCBwYXJ0IHdpdGggdGhlIGFjdHVhbCBDaGF0IGFnZW50Li4uXG5cdFx0XHRcdFx0bmV3UmVxdWVzdCA9IHRoaXMucmVwbGFjZVRvb2xJblJlcXVlc3RNb2RlbChuZXdSZXF1ZXN0KTsgXHRcdFx0XHRcdFx0XHQvLyAuLi50aGVuIHJlcGxhY2UgYW55IHRvb2wgcGFydHMgd2l0aCB0aGUgYWN0dWFsIENoYXQgdG9vbHNcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZm9yd2FyZFJlcXVlc3RUb0NoYXQobmV3UmVxdWVzdCwgcHJvZ3Jlc3MsIGNoYXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGNoYXRBZ2VudFNlcnZpY2UsIGNoYXRXaWRnZXRTZXJ2aWNlLCBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cHJvZ3Jlc3Moe1xuXHRcdFx0XHRcdGtpbmQ6ICd3YXJuaW5nJyxcblx0XHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2NoYXRTZXR1cEVycm9yJywgXCJDaGF0IHNldHVwIGZhaWxlZC5cIikpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVzZXIgaGFzIGNhbmNlbGxlZCB0aGUgc2V0dXBcblx0XHRlbHNlIHtcblx0XHRcdHByb2dyZXNzKHtcblx0XHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSA/IFNldHVwQWdlbnQuU0VUVVBfTkVFREVEX01FU1NBR0UgOiBTZXR1cEFnZW50LlRSVVNUX05FRURFRF9NRVNTQUdFXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIHJlcGxhY2VBZ2VudEluUmVxdWVzdE1vZGVsKHJlcXVlc3RNb2RlbDogSUNoYXRSZXF1ZXN0TW9kZWwsIGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlKTogSUNoYXRSZXF1ZXN0TW9kZWwge1xuXHRcdGNvbnN0IGFnZW50UGFydCA9IHJlcXVlc3RNb2RlbC5tZXNzYWdlLnBhcnRzLmZpbmQoKHIpOiByIGlzIENoYXRSZXF1ZXN0QWdlbnRQYXJ0ID0+IHIgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50UGFydCk7XG5cdFx0aWYgKCFhZ2VudFBhcnQpIHtcblx0XHRcdHJldHVybiByZXF1ZXN0TW9kZWw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWdlbnRJZCA9IGFnZW50UGFydC5hZ2VudC5pZC5yZXBsYWNlKC9zZXR1cFxcLi8sIGAke2RlZmF1bHRDaGF0LmV4dGVuc2lvbklkfS5gLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGNvbnN0IGdpdGh1YkFnZW50ID0gY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudChhZ2VudElkKTtcblx0XHRpZiAoIWdpdGh1YkFnZW50KSB7XG5cdFx0XHRyZXR1cm4gcmVxdWVzdE1vZGVsO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld0FnZW50UGFydCA9IG5ldyBDaGF0UmVxdWVzdEFnZW50UGFydChhZ2VudFBhcnQucmFuZ2UsIGFnZW50UGFydC5lZGl0b3JSYW5nZSwgZ2l0aHViQWdlbnQpO1xuXG5cdFx0cmV0dXJuIG5ldyBDaGF0UmVxdWVzdE1vZGVsKHtcblx0XHRcdHNlc3Npb246IHJlcXVlc3RNb2RlbC5zZXNzaW9uIGFzIENoYXRNb2RlbCxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0cGFydHM6IHJlcXVlc3RNb2RlbC5tZXNzYWdlLnBhcnRzLm1hcChwYXJ0ID0+IHtcblx0XHRcdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3QWdlbnRQYXJ0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdFx0fSksXG5cdFx0XHRcdHRleHQ6IHJlcXVlc3RNb2RlbC5tZXNzYWdlLnRleHRcblx0XHRcdH0sXG5cdFx0XHR2YXJpYWJsZURhdGE6IHJlcXVlc3RNb2RlbC52YXJpYWJsZURhdGEsXG5cdFx0XHR0aW1lc3RhbXA6IERhdGUubm93KCksXG5cdFx0XHRhdHRlbXB0OiByZXF1ZXN0TW9kZWwuYXR0ZW1wdCxcblx0XHRcdG1vZGVJbmZvOiByZXF1ZXN0TW9kZWwubW9kZUluZm8sXG5cdFx0XHRjb25maXJtYXRpb246IHJlcXVlc3RNb2RlbC5jb25maXJtYXRpb24sXG5cdFx0XHRsb2NhdGlvbkRhdGE6IHJlcXVlc3RNb2RlbC5sb2NhdGlvbkRhdGEsXG5cdFx0XHRhdHRhY2hlZENvbnRleHQ6IHJlcXVlc3RNb2RlbC5hdHRhY2hlZENvbnRleHQsXG5cdFx0XHRpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0OiByZXF1ZXN0TW9kZWwuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVwbGFjZVRvb2xJblJlcXVlc3RNb2RlbChyZXF1ZXN0TW9kZWw6IElDaGF0UmVxdWVzdE1vZGVsKTogSUNoYXRSZXF1ZXN0TW9kZWwge1xuXHRcdGNvbnN0IHRvb2xQYXJ0ID0gcmVxdWVzdE1vZGVsLm1lc3NhZ2UucGFydHMuZmluZCgocik6IHIgaXMgQ2hhdFJlcXVlc3RUb29sUGFydCA9PiByIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUb29sUGFydCk7XG5cdFx0aWYgKCF0b29sUGFydCkge1xuXHRcdFx0cmV0dXJuIHJlcXVlc3RNb2RlbDtcblx0XHR9XG5cblx0XHRjb25zdCB0b29sSWQgPSB0b29sUGFydC50b29sSWQucmVwbGFjZSgvc2V0dXAudG9vbHNcXC4vLCBgY29waWxvdF9gLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGNvbnN0IG5ld1Rvb2xQYXJ0ID0gbmV3IENoYXRSZXF1ZXN0VG9vbFBhcnQoXG5cdFx0XHR0b29sUGFydC5yYW5nZSxcblx0XHRcdHRvb2xQYXJ0LmVkaXRvclJhbmdlLFxuXHRcdFx0dG9vbFBhcnQudG9vbE5hbWUsXG5cdFx0XHR0b29sSWQsXG5cdFx0XHR0b29sUGFydC5kaXNwbGF5TmFtZSxcblx0XHRcdHRvb2xQYXJ0Lmljb25cblx0XHQpO1xuXG5cdFx0Y29uc3QgY2hhdFJlcXVlc3RUb29sRW50cnk6IElDaGF0UmVxdWVzdFRvb2xFbnRyeSA9IHtcblx0XHRcdGlkOiB0b29sSWQsXG5cdFx0XHRuYW1lOiAnbmV3Jyxcblx0XHRcdHJhbmdlOiB0b29sUGFydC5yYW5nZSxcblx0XHRcdGtpbmQ6ICd0b29sJyxcblx0XHRcdHZhbHVlOiB1bmRlZmluZWRcblx0XHR9O1xuXG5cdFx0Y29uc3QgdmFyaWFibGVEYXRhOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEgPSB7XG5cdFx0XHR2YXJpYWJsZXM6IFtjaGF0UmVxdWVzdFRvb2xFbnRyeV1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIG5ldyBDaGF0UmVxdWVzdE1vZGVsKHtcblx0XHRcdHNlc3Npb246IHJlcXVlc3RNb2RlbC5zZXNzaW9uIGFzIENoYXRNb2RlbCxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0cGFydHM6IHJlcXVlc3RNb2RlbC5tZXNzYWdlLnBhcnRzLm1hcChwYXJ0ID0+IHtcblx0XHRcdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0VG9vbFBhcnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXdUb29sUGFydDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR0ZXh0OiByZXF1ZXN0TW9kZWwubWVzc2FnZS50ZXh0XG5cdFx0XHR9LFxuXHRcdFx0dmFyaWFibGVEYXRhOiB2YXJpYWJsZURhdGEsXG5cdFx0XHR0aW1lc3RhbXA6IERhdGUubm93KCksXG5cdFx0XHRhdHRlbXB0OiByZXF1ZXN0TW9kZWwuYXR0ZW1wdCxcblx0XHRcdG1vZGVJbmZvOiByZXF1ZXN0TW9kZWwubW9kZUluZm8sXG5cdFx0XHRjb25maXJtYXRpb246IHJlcXVlc3RNb2RlbC5jb25maXJtYXRpb24sXG5cdFx0XHRsb2NhdGlvbkRhdGE6IHJlcXVlc3RNb2RlbC5sb2NhdGlvbkRhdGEsXG5cdFx0XHRhdHRhY2hlZENvbnRleHQ6IFtjaGF0UmVxdWVzdFRvb2xFbnRyeV0sXG5cdFx0XHRpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0OiByZXF1ZXN0TW9kZWwuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCxcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0dXBUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblxuXHRzdGF0aWMgcmVnaXN0ZXJUb29sKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIHRvb2xEYXRhOiBJVG9vbERhdGEpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IHRvb2xTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHVwVG9vbCk7XG5cdFx0XHRyZXR1cm4gdG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sKHRvb2xEYXRhLCB0b29sKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIGNvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBwcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVG9vbFJlc3VsdCA9IHtcblx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogJydcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH07XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uPyhwYXJhbWV0ZXJzOiB1bmtub3duLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQUlOZXdTeW1ib2xOYW1lc1Byb3ZpZGVyIHtcblxuXHRzdGF0aWMgcmVnaXN0ZXJQcm92aWRlcihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0OiBDaGF0RW50aXRsZW1lbnRDb250ZXh0LCBjb250cm9sbGVyOiBMYXp5PENoYXRTZXR1cENvbnRyb2xsZXI+KTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJTmV3U3ltYm9sTmFtZXNQcm92aWRlciwgY29udGV4dCwgY29udHJvbGxlcik7XG5cdFx0XHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UubmV3U3ltYm9sTmFtZXNQcm92aWRlci5yZWdpc3RlcignKicsIHByb3ZpZGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dDogQ2hhdEVudGl0bGVtZW50Q29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRyb2xsZXI6IExhenk8Q2hhdFNldHVwQ29udHJvbGxlcj4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZU5ld1N5bWJvbE5hbWVzKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogSVJhbmdlLCB0cmlnZ2VyS2luZDogTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPE5ld1N5bWJvbE5hbWVbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0cmV0dXJuIENoYXRTZXR1cC5nZXRJbnN0YW5jZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmNvbnRleHQsIHRoaXMuY29udHJvbGxlcikucnVuKHtcblx0XHRcdFx0Zm9yY2VBbm9ueW1vdXM6IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXMgPyBDaGF0U2V0dXBBbm9ueW1vdXMuRW5hYmxlZFdpdGhEaWFsb2cgOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0Q29kZUFjdGlvbnNQcm92aWRlciB7XG5cblx0c3RhdGljIHJlZ2lzdGVyUHJvdmlkZXIoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29kZUFjdGlvbnNQcm92aWRlcik7XG5cdFx0XHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLnJlZ2lzdGVyKCcqJywgcHJvdmlkZXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNvZGVBY3Rpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UgfCBTZWxlY3Rpb24pOiBQcm9taXNlPENvZGVBY3Rpb25MaXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWN0aW9uczogQ29kZUFjdGlvbltdID0gW107XG5cblx0XHQvLyBcIkdlbmVyYXRlXCIgaWYgdGhlIGxpbmUgaXMgd2hpdGVzcGFjZSBvbmx5XG5cdFx0Ly8gXCJNb2RpZnlcIiBpZiB0aGVyZSBpcyBhIHNlbGVjdGlvblxuXHRcdGxldCBnZW5lcmF0ZU9yTW9kaWZ5VGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZ2VuZXJhdGVPck1vZGlmeUNvbW1hbmQ6IENvbW1hbmQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0Y29uc3QgdGV4dEF0TGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRpZiAoL15cXHMqJC8udGVzdCh0ZXh0QXRMaW5lKSkge1xuXHRcdFx0XHRnZW5lcmF0ZU9yTW9kaWZ5VGl0bGUgPSBsb2NhbGl6ZSgnZ2VuZXJhdGUnLCBcIkdlbmVyYXRlXCIpO1xuXHRcdFx0XHRnZW5lcmF0ZU9yTW9kaWZ5Q29tbWFuZCA9IEFJQ29kZUFjdGlvbnNIZWxwZXIuZ2VuZXJhdGUocmFuZ2UpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB0ZXh0SW5TZWxlY3Rpb24gPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpO1xuXHRcdFx0aWYgKCEvXlxccyokLy50ZXN0KHRleHRJblNlbGVjdGlvbikpIHtcblx0XHRcdFx0Z2VuZXJhdGVPck1vZGlmeVRpdGxlID0gbG9jYWxpemUoJ21vZGlmeScsIFwiTW9kaWZ5XCIpO1xuXHRcdFx0XHRnZW5lcmF0ZU9yTW9kaWZ5Q29tbWFuZCA9IEFJQ29kZUFjdGlvbnNIZWxwZXIubW9kaWZ5KHJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZ2VuZXJhdGVPck1vZGlmeVRpdGxlICYmIGdlbmVyYXRlT3JNb2RpZnlDb21tYW5kKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRraW5kOiBDb2RlQWN0aW9uS2luZC5SZWZhY3RvclJld3JpdGUuYXBwZW5kKCdjb3BpbG90JykudmFsdWUsXG5cdFx0XHRcdGlzQUk6IHRydWUsXG5cdFx0XHRcdHRpdGxlOiBnZW5lcmF0ZU9yTW9kaWZ5VGl0bGUsXG5cdFx0XHRcdGNvbW1hbmQ6IGdlbmVyYXRlT3JNb2RpZnlDb21tYW5kLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFya2VycyA9IEFJQ29kZUFjdGlvbnNIZWxwZXIud2FybmluZ09yRXJyb3JNYXJrZXJzQXRSYW5nZSh0aGlzLm1hcmtlclNlcnZpY2UsIG1vZGVsLnVyaSwgcmFuZ2UpO1xuXHRcdGlmIChtYXJrZXJzLmxlbmd0aCA+IDApIHtcblxuXHRcdFx0Ly8gXCJGaXhcIiBpZiB0aGVyZSBhcmUgZGlhZ25vc3RpY3MgaW4gdGhlIHJhbmdlXG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRraW5kOiBDb2RlQWN0aW9uS2luZC5RdWlja0ZpeC5hcHBlbmQoJ2NvcGlsb3QnKS52YWx1ZSxcblx0XHRcdFx0aXNBSTogdHJ1ZSxcblx0XHRcdFx0ZGlhZ25vc3RpY3M6IG1hcmtlcnMsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZml4JywgXCJGaXhcIiksXG5cdFx0XHRcdGNvbW1hbmQ6IEFJQ29kZUFjdGlvbnNIZWxwZXIuZml4TWFya2VycyhtYXJrZXJzLCByYW5nZSlcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBcIkV4cGxhaW5cIiBpZiB0aGVyZSBhcmUgZGlhZ25vc3RpY3MgaW4gdGhlIHJhbmdlXG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRraW5kOiBDb2RlQWN0aW9uS2luZC5RdWlja0ZpeC5hcHBlbmQoJ2V4cGxhaW4nKS5hcHBlbmQoJ2NvcGlsb3QnKS52YWx1ZSxcblx0XHRcdFx0aXNBSTogdHJ1ZSxcblx0XHRcdFx0ZGlhZ25vc3RpY3M6IG1hcmtlcnMsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZXhwbGFpbicsIFwiRXhwbGFpblwiKSxcblx0XHRcdFx0Y29tbWFuZDogQUlDb2RlQWN0aW9uc0hlbHBlci5leHBsYWluTWFya2VycyhtYXJrZXJzKVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRkaXNwb3NlKCkgeyB9XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQUlDb2RlQWN0aW9uc0hlbHBlciB7XG5cblx0c3RhdGljIHdhcm5pbmdPckVycm9yTWFya2Vyc0F0UmFuZ2UobWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsIHJlc291cmNlOiBVUkksIHJhbmdlOiBSYW5nZSB8IFNlbGVjdGlvbik6IElNYXJrZXJbXSB7XG5cdFx0cmV0dXJuIG1hcmtlclNlcnZpY2Vcblx0XHRcdC5yZWFkKHsgcmVzb3VyY2UsIHNldmVyaXRpZXM6IE1hcmtlclNldmVyaXR5LkVycm9yIHwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyB9KVxuXHRcdFx0LmZpbHRlcihtYXJrZXIgPT4gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDw9IG1hcmtlci5lbmRMaW5lTnVtYmVyICYmIHJhbmdlLmVuZExpbmVOdW1iZXIgPj0gbWFya2VyLnN0YXJ0TGluZU51bWJlcik7XG5cdH1cblxuXHRzdGF0aWMgbW9kaWZ5KHJhbmdlOiBSYW5nZSk6IENvbW1hbmQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogSU5MSU5FX0NIQVRfU1RBUlQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ21vZGlmeScsIFwiTW9kaWZ5XCIpLFxuXHRcdFx0YXJndW1lbnRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbml0aWFsU2VsZWN0aW9uOiB0aGlzLnJhbmdlVG9TZWxlY3Rpb24ocmFuZ2UpLFxuXHRcdFx0XHRcdGluaXRpYWxSYW5nZTogcmFuZ2UsXG5cdFx0XHRcdFx0cG9zaXRpb246IHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKVxuXHRcdFx0XHR9IHNhdGlzZmllcyB7IGluaXRpYWxTZWxlY3Rpb246IElTZWxlY3Rpb247IGluaXRpYWxSYW5nZTogSVJhbmdlOyBwb3NpdGlvbjogSVBvc2l0aW9uIH1cblx0XHRcdF1cblx0XHR9O1xuXHR9XG5cblx0c3RhdGljIGdlbmVyYXRlKHJhbmdlOiBSYW5nZSk6IENvbW1hbmQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogSU5MSU5FX0NIQVRfU1RBUlQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dlbmVyYXRlJywgXCJHZW5lcmF0ZVwiKSxcblx0XHRcdGFyZ3VtZW50czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5pdGlhbFNlbGVjdGlvbjogdGhpcy5yYW5nZVRvU2VsZWN0aW9uKHJhbmdlKSxcblx0XHRcdFx0XHRpbml0aWFsUmFuZ2U6IHJhbmdlLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiByYW5nZS5nZXRTdGFydFBvc2l0aW9uKClcblx0XHRcdFx0fSBzYXRpc2ZpZXMgeyBpbml0aWFsU2VsZWN0aW9uOiBJU2VsZWN0aW9uOyBpbml0aWFsUmFuZ2U6IElSYW5nZTsgcG9zaXRpb246IElQb3NpdGlvbiB9XG5cdFx0XHRdXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJhbmdlVG9TZWxlY3Rpb24ocmFuZ2U6IFJhbmdlKTogSVNlbGVjdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0fVxuXG5cdHN0YXRpYyBleHBsYWluTWFya2VycyhtYXJrZXJzOiBJTWFya2VyW10pOiBDb21tYW5kIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IENIQVRfT1BFTl9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2V4cGxhaW4nLCBcIkV4cGxhaW5cIiksXG5cdFx0XHRhcmd1bWVudHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHF1ZXJ5OiBgQHdvcmtzcGFjZSAvZXhwbGFpbiAke21hcmtlcnMubWFwKG1hcmtlciA9PiBtYXJrZXIubWVzc2FnZSkuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB0cnVlXG5cdFx0XHRcdH0gc2F0aXNmaWVzIHsgcXVlcnk6IHN0cmluZzsgaXNQYXJ0aWFsUXVlcnk6IGJvb2xlYW4gfVxuXHRcdFx0XVxuXHRcdH07XG5cdH1cblxuXHRzdGF0aWMgZml4TWFya2VycyhtYXJrZXJzOiBJTWFya2VyW10sIHJhbmdlOiBSYW5nZSk6IENvbW1hbmQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogSU5MSU5FX0NIQVRfU1RBUlQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZpeCcsIFwiRml4XCIpLFxuXHRcdFx0YXJndW1lbnRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRtZXNzYWdlOiBgL2ZpeCAke21hcmtlcnMubWFwKG1hcmtlciA9PiBtYXJrZXIubWVzc2FnZSkuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGluaXRpYWxTZWxlY3Rpb246IHRoaXMucmFuZ2VUb1NlbGVjdGlvbihyYW5nZSksXG5cdFx0XHRcdFx0aW5pdGlhbFJhbmdlOiByYW5nZSxcblx0XHRcdFx0XHRwb3NpdGlvbjogcmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpXG5cdFx0XHRcdH0gc2F0aXNmaWVzIHsgbWVzc2FnZTogc3RyaW5nOyBpbml0aWFsU2VsZWN0aW9uOiBJU2VsZWN0aW9uOyBpbml0aWFsUmFuZ2U6IElSYW5nZTsgcG9zaXRpb246IElQb3NpdGlvbiB9XG5cdFx0XHRdXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGFBQWEsZUFBZTtBQUVyQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFFdkUsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsT0FBTyxhQUFhO0FBQ3BCLFNBQVMseUJBQXlCO0FBQ2xDLFNB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
