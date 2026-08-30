import { isAncestorOfActiveElement } from "../../../../../base/browser/dom.js";
import { alert } from "../../../../../base/browser/ui/aria/aria.js";
import { coalesce } from "../../../../../base/common/arrays.js";
import { timeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { safeIntl } from "../../../../../base/common/date.js";
import { Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { language } from "../../../../../base/common/platform.js";
import { basename } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { EditorAction2 } from "../../../../../editor/browser/editorExtensions.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsLinuxContext, IsWindowsContext } from "../../../../../platform/contextkey/common/contextkeys.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import product from "../../../../../platform/product/common/product.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IAgentHostEnablementService } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ActiveEditorContext } from "../../../../common/contextkeys.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts } from "../../../../services/layout/browser/layoutService.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { EXTENSIONS_CATEGORY, IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { SCMHistoryItemChangeRangeContentProvider } from "../../../scm/browser/scmHistoryChatContext.js";
import { ISCMService } from "../../../scm/common/scm.js";
import { IChatAgentService } from "../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatInputNoticeHubService } from "../widget/input/chatInputNoticeHub.js";
import { ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { ChatMode } from "../../common/chatModes.js";
import { ElicitationState, IChatService, IChatToolInvocation } from "../../common/chatService/chatService.js";
import { isRequestVM } from "../../common/model/chatViewModel.js";
import { IChatWidgetHistoryService } from "../../common/widget/chatWidgetHistoryService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, getDefaultNewChatSessionResource, resolveDefaultNewChatSessionType } from "../../common/constants.js";
import { AICustomizationManagementCommands } from "../aiCustomization/aiCustomizationManagement.js";
import { ILanguageModelsService } from "../../common/languageModels.js";
import { CopilotUsageExtensionFeatureId } from "../../common/languageModelStats.js";
import { ILanguageModelToolsConfirmationService } from "../../common/tools/languageModelToolsConfirmationService.js";
import { ILanguageModelToolsService, isToolSet, ToolAndToolSetEnablementMap } from "../../common/tools/languageModelToolsService.js";
import { ChatViewId, IChatWidgetService, isIChatViewViewContext } from "../chat.js";
import { ChatEditorInput, showClearEditingSessionConfirmation } from "../widgetHosts/editor/chatEditorInput.js";
import { convertBufferToScreenshotVariable } from "../attachments/chatScreenshotContext.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { IChatSessionsService, localChatSessionType } from "../../common/chatSessionsService.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
const CHAT_CATEGORY = localize2("chat.category", "Chat");
const COPILOT_CLI_AGENT_HOST_PROVIDER_ID = "copilotcli";
const ACTION_ID_NEW_CHAT = `workbench.action.chat.newChat`;
const ACTION_ID_NEW_EDIT_SESSION = `workbench.action.chat.newEditSession`;
const ACTION_ID_OPEN_CHAT = "workbench.action.openChat";
const CHAT_OPEN_ACTION_ID = "workbench.action.chat.open";
const CHAT_SETUP_ACTION_ID = "workbench.action.chat.triggerSetup";
const CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID = "workbench.action.chat.triggerSetupSupportAnonymousAction";
const TOGGLE_CHAT_ACTION_ID = "workbench.action.chat.toggle";
const GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID = "workbench.action.chat.generateAgentInstructions";
const GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID = "workbench.action.chat.generateOnDemandInstructions";
const GENERATE_PROMPT_COMMAND_ID = "workbench.action.chat.generatePrompt";
const GENERATE_SKILL_COMMAND_ID = "workbench.action.chat.generateSkill";
const GENERATE_AGENT_COMMAND_ID = "workbench.action.chat.generateAgent";
const GENERATE_HOOK_COMMAND_ID = "workbench.action.chat.generateHook";
const INSERT_FORK_CONVERSATION_COMMAND_ID = "workbench.action.chat.insertForkConversationCommand";
const INSERT_TROUBLESHOOT_COMMAND_ID = "workbench.action.chat.insertTroubleshootCommand";
const defaultChat = {
  provider: product.defaultChatAgent?.provider ?? { enterprise: { id: "" } },
  completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? "",
  completionsMenuCommand: product.defaultChatAgent?.completionsMenuCommand ?? ""
};
const CHAT_CONFIG_MENU_ID = new MenuId("workbench.chat.menu.config");
const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = "workbench.action.chat.openQuotaExceededDialog";
class OpenChatGlobalAction extends Action2 {
  constructor(overrides, mode) {
    super({
      ...overrides,
      icon: Codicon.chatSparkle,
      f1: true,
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.Setup.hidden.negate(),
        ChatContextKeys.Setup.disabledInWorkspace.negate()
      )
    });
    this.mode = mode;
  }
  async run(accessor, opts) {
    opts = typeof opts === "string" ? { query: opts } : opts;
    const chatService = accessor.get(IChatService);
    const widgetService = accessor.get(IChatWidgetService);
    const toolsService = accessor.get(ILanguageModelToolsService);
    const hostService = accessor.get(IHostService);
    const chatAgentService = accessor.get(IChatAgentService);
    const instaService = accessor.get(IInstantiationService);
    const commandService = accessor.get(ICommandService);
    const fileService = accessor.get(IFileService);
    const languageModelService = accessor.get(ILanguageModelsService);
    const scmService = accessor.get(ISCMService);
    const logService = accessor.get(ILogService);
    const configurationService = accessor.get(IConfigurationService);
    let chatWidget = widgetService.lastFocusedWidget;
    if (!this.mode || !chatWidget || !isAncestorOfActiveElement(chatWidget.domNode)) {
      chatWidget = await widgetService.revealWidget();
    }
    if (!chatWidget) {
      return;
    }
    const switchToMode = opts?.mode ? chatWidget.input.currentChatModesObs.get().findModeByName(opts.mode) : this.mode;
    if (switchToMode) {
      await this.handleSwitchToMode(switchToMode, chatWidget, instaService, commandService);
    }
    if (opts?.modelSelector) {
      const ids = await languageModelService.selectLanguageModels(opts.modelSelector);
      const id = ids.sort().at(0);
      if (!id) {
        throw new Error(`No language models found matching selector: ${JSON.stringify(opts.modelSelector)}.`);
      }
      const model = languageModelService.lookupLanguageModel(id);
      if (!model) {
        throw new Error(`Language model not loaded: ${id}.`);
      }
      chatWidget.input.setCurrentLanguageModel({ metadata: model, identifier: id }, true);
    }
    if (opts?.toolsInclude || opts?.toolsExclude) {
      const model = chatWidget.input.selectedLanguageModel.get()?.metadata;
      const allTools = Array.from(toolsService.getTools(model));
      const allToolSets = Array.from(toolsService.getToolSetsForModel(model));
      const result = computeToolEnablementMap({
        allTools,
        allToolSets,
        toolsInclude: opts.toolsInclude,
        toolsExclude: opts.toolsExclude
      });
      for (const identifier of result.unknownIdentifiers) {
        logService.warn(`Tool filtering: Unknown identifier '${identifier}' - no matching tool or toolset found.`);
      }
      chatWidget.input.selectedToolsModel.set(result.enablementMap, true);
    }
    if (opts?.previousRequests?.length && chatWidget.viewModel) {
      for (const { request, response } of opts.previousRequests) {
        chatService.addCompleteRequest(chatWidget.viewModel.sessionResource, request, void 0, 0, { message: response });
      }
    }
    if (opts?.attachScreenshot) {
      const screenshot = await hostService.getScreenshot();
      if (screenshot) {
        chatWidget.attachmentModel.addContext(convertBufferToScreenshotVariable(screenshot));
      }
    }
    if (opts?.attachFiles) {
      for (const file of opts.attachFiles) {
        const uri = file instanceof URI ? file : file.uri;
        const range = file instanceof URI ? void 0 : file.range;
        if (await fileService.exists(uri)) {
          chatWidget.attachmentModel.addFile(uri, range);
        }
      }
    }
    if (opts?.attachHistoryItemChanges) {
      for (const historyItemChange of opts.attachHistoryItemChanges) {
        const repository = scmService.getRepository(URI.file(historyItemChange.uri.path));
        const historyProvider = repository?.provider.historyProvider.get();
        if (!historyProvider) {
          continue;
        }
        const historyItem = await historyProvider.resolveHistoryItem(historyItemChange.historyItemId);
        if (!historyItem) {
          continue;
        }
        chatWidget.attachmentModel.addContext({
          id: historyItemChange.uri.toString(),
          name: `${basename(historyItemChange.uri)}`,
          value: historyItemChange.uri,
          historyItem,
          kind: "scmHistoryItemChange"
        });
      }
    }
    if (opts?.attachHistoryItemChangeRanges) {
      for (const historyItemChangeRange of opts.attachHistoryItemChangeRanges) {
        const repository = scmService.getRepository(URI.file(historyItemChangeRange.end.uri.path));
        const historyProvider = repository?.provider.historyProvider.get();
        if (!repository || !historyProvider) {
          continue;
        }
        const [historyItemStart, historyItemEnd] = await Promise.all([
          historyProvider.resolveHistoryItem(historyItemChangeRange.start.historyItemId),
          historyProvider.resolveHistoryItem(historyItemChangeRange.end.historyItemId)
        ]);
        if (!historyItemStart || !historyItemEnd) {
          continue;
        }
        const uri = historyItemChangeRange.end.uri.with({
          scheme: SCMHistoryItemChangeRangeContentProvider.scheme,
          query: JSON.stringify({
            repositoryId: repository.id,
            start: historyItemStart.id,
            end: historyItemChangeRange.end.historyItemId
          })
        });
        chatWidget.attachmentModel.addContext({
          id: uri.toString(),
          name: `${basename(uri)}`,
          value: uri,
          historyItemChangeStart: {
            uri: historyItemChangeRange.start.uri,
            historyItem: historyItemStart
          },
          historyItemChangeEnd: {
            uri: historyItemChangeRange.end.uri,
            historyItem: {
              ...historyItemEnd,
              displayId: historyItemChangeRange.end.historyItemId
            }
          },
          kind: "scmHistoryItemChangeRange"
        });
      }
    }
    let resp;
    if (opts?.query) {
      if (opts.isPartialQuery) {
        chatWidget.input.showScrollbarUntilAccept();
        chatWidget.setInput(opts.query);
      } else {
        if (!chatWidget.viewModel) {
          await Event.toPromise(chatWidget.onDidChangeViewModel);
        }
        await waitForDefaultAgent(chatAgentService, chatWidget.input.currentModeKind);
        if (opts.preserveInput) {
          resp = chatWidget.acceptInput(opts.query, { preserveInput: true });
        } else {
          chatWidget.setInput(opts.query);
          resp = chatWidget.acceptInput();
        }
      }
    }
    if (opts?.toolIds && opts.toolIds.length > 0) {
      for (const toolId of opts.toolIds) {
        const tool = toolsService.getTool(toolId);
        if (tool) {
          chatWidget.attachmentModel.addContext({
            id: tool.id,
            name: tool.displayName,
            fullName: tool.displayName,
            value: void 0,
            icon: ThemeIcon.isThemeIcon(tool.icon) ? tool.icon : void 0,
            kind: "tool"
          });
        }
      }
    }
    chatWidget.focusInput();
    if (opts?.blockOnResponse) {
      const response = await resp;
      if (response) {
        const autoReplyEnabled = configurationService.getValue(ChatConfiguration.AutoReply);
        await new Promise((resolve) => {
          const d = response.onDidChange(async () => {
            if (response.isComplete) {
              d.dispose();
              resolve();
              return;
            }
            const pendingConfirmation = response.isPendingConfirmation.get();
            if (pendingConfirmation) {
              const hasPendingQuestionCarousel = response.response.value.some(
                (part) => part.kind === "questionCarousel" && !part.isUsed
              );
              if (autoReplyEnabled && hasPendingQuestionCarousel) {
                return;
              }
              d.dispose();
              resolve();
            }
          });
        });
        const confirmationInfo = getPendingConfirmationInfo(response);
        if (confirmationInfo) {
          return { ...response.result, ...confirmationInfo };
        }
        return { ...response.result };
      }
    }
    return void 0;
  }
  async handleSwitchToMode(switchToMode, chatWidget, instaService, commandService) {
    const currentMode = chatWidget.input.currentModeKind;
    if (switchToMode) {
      const model = chatWidget.viewModel?.model;
      const chatModeCheck = model ? await instaService.invokeFunction(handleModeSwitch, currentMode, switchToMode.kind, model.getRequests().length, model) : { needToClearSession: false };
      if (!chatModeCheck) {
        return;
      }
      chatWidget.input.setChatMode(switchToMode.id, true, true);
      if (chatModeCheck.needToClearSession) {
        await commandService.executeCommand(ACTION_ID_NEW_CHAT);
      }
    }
  }
}
async function waitForDefaultAgent(chatAgentService, mode) {
  const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode);
  if (defaultAgent) {
    return;
  }
  await Promise.race([
    Event.toPromise(Event.filter(chatAgentService.onDidChangeAgents, () => {
      const defaultAgent2 = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode);
      return Boolean(defaultAgent2);
    })),
    timeout(6e4).then(() => {
      throw new Error("Timed out waiting for default agent");
    })
  ]);
}
function getPendingConfirmationInfo(response) {
  for (const part of response.response.value) {
    if (part.kind === "toolInvocation") {
      const state = part.state.get();
      if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
        return {
          type: "confirmation",
          kind: "toolInvocation",
          toolId: part.toolId
        };
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
        return {
          type: "confirmation",
          kind: "toolPostApproval",
          toolId: part.toolId
        };
      }
    }
    if (part.kind === "confirmation" && !part.isUsed) {
      return {
        type: "confirmation",
        kind: "confirmation",
        title: part.title,
        data: part.data
      };
    }
    if (part.kind === "questionCarousel" && !part.isUsed) {
      return {
        type: "confirmation",
        kind: "questionCarousel",
        questions: part.questions
      };
    }
    if (part.kind === "elicitation2" && part.state.get() === ElicitationState.Pending) {
      const title = part.title;
      return {
        type: "confirmation",
        kind: "elicitation",
        title: typeof title === "string" ? title : title.value
      };
    }
  }
  return void 0;
}
class PrimaryOpenChatGlobalAction extends OpenChatGlobalAction {
  constructor() {
    super({
      id: CHAT_OPEN_ACTION_ID,
      title: localize2("openChat", "Open Chat"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI
        }
      },
      menu: [{
        id: MenuId.ChatTitleBarMenu,
        group: "a_open",
        order: 1
      }]
    });
  }
}
function getOpenChatActionIdForMode(mode) {
  return `workbench.action.chat.open${mode.name.get()}`;
}
class ModeOpenChatGlobalAction extends OpenChatGlobalAction {
  constructor(mode, keybinding) {
    super({
      id: getOpenChatActionIdForMode(mode),
      title: localize2("openChatMode", "Open Chat ({0})", mode.label.get()),
      keybinding
    }, mode);
  }
}
function registerChatActions() {
  var _a, _b, _c, _d, _e, _f;
  function getNewChatEditorSessionUri(accessor) {
    return getDefaultNewChatSessionResource(accessor.get(IConfigurationService), accessor.get(IChatSessionsService), accessor.get(IStorageService), accessor.get(IWorkspaceContextService).getWorkspace(), accessor.get(IAgentHostEnablementService).enabled.get());
  }
  registerAction2(PrimaryOpenChatGlobalAction);
  registerAction2(class extends ModeOpenChatGlobalAction {
    constructor() {
      super(ChatMode.Ask);
    }
  });
  registerAction2(class extends ModeOpenChatGlobalAction {
    constructor() {
      super(ChatMode.Agent, {
        when: ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
        linux: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyI
        }
      });
    }
  });
  registerAction2(class extends ModeOpenChatGlobalAction {
    constructor() {
      super(ChatMode.Edit);
    }
  });
  registerAction2(class ToggleChatAction extends Action2 {
    constructor() {
      super({
        id: TOGGLE_CHAT_ACTION_ID,
        title: localize2("toggleChat", "Toggle Chat"),
        category: CHAT_CATEGORY
      });
    }
    async run(accessor) {
      const layoutService = accessor.get(IWorkbenchLayoutService);
      const viewsService = accessor.get(IViewsService);
      const viewDescriptorService = accessor.get(IViewDescriptorService);
      const widgetService = accessor.get(IChatWidgetService);
      const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);
      const chatVisible = viewsService.isViewVisible(ChatViewId);
      if (chatVisible) {
        this.updatePartVisibility(layoutService, chatLocation, false);
      } else {
        this.updatePartVisibility(layoutService, chatLocation, true);
        (await widgetService.revealWidget())?.focusInput();
      }
    }
    updatePartVisibility(layoutService, location, visible) {
      let part;
      switch (location) {
        case ViewContainerLocation.Panel:
          part = Parts.PANEL_PART;
          break;
        case ViewContainerLocation.Sidebar:
          part = Parts.SIDEBAR_PART;
          break;
        case ViewContainerLocation.AuxiliaryBar:
          part = Parts.AUXILIARYBAR_PART;
          break;
      }
      if (part) {
        layoutService.setPartHidden(!visible, part);
      }
    }
  });
  registerAction2(class NewChatEditorAction extends Action2 {
    constructor() {
      super({
        id: ACTION_ID_OPEN_CHAT,
        title: localize2("interactiveSession.open", "New Chat Editor"),
        icon: Codicon.plus,
        f1: true,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyCode.KeyN,
          when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatEditor)
        },
        menu: [{
          id: MenuId.ChatTitleBarMenu,
          group: "b_new",
          order: 0
        }, {
          id: MenuId.ChatNewMenu,
          group: "2_new",
          order: 2
        }, {
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo("copilot"), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo("new-session"), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo("comment")),
          order: 1
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), ACTIVE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatEditorCopilotIconAction extends Action2 {
    constructor() {
      super({
        id: ACTION_ID_OPEN_CHAT + ".copilotIcon",
        title: localize2("interactiveSession.open", "New Chat Editor"),
        icon: Codicon.copilot,
        f1: false,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: [{
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.isEqualTo("copilot")),
          order: 1
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), ACTIVE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatEditorNewSessionIconAction extends Action2 {
    constructor() {
      super({
        id: ACTION_ID_OPEN_CHAT + ".newSessionIcon",
        title: localize2("interactiveSession.open", "New Chat Editor"),
        icon: Codicon.newSession,
        f1: false,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: [{
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.isEqualTo("new-session")),
          order: 1
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), ACTIVE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatEditorCommentIconAction extends Action2 {
    constructor() {
      super({
        id: ACTION_ID_OPEN_CHAT + ".commentIcon",
        title: localize2("interactiveSession.open", "New Chat Editor"),
        icon: Codicon.comment,
        f1: false,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: [{
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.isEqualTo("comment")),
          order: 1
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), ACTIVE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatEditorToSideAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.openChatToSide",
        title: localize2("interactiveSession.openToSide", "New Chat Editor to the Side"),
        f1: true,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), SIDE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatWindowAction extends Action2 {
    constructor() {
      super({
        id: `workbench.action.newChatWindow`,
        title: localize2("interactiveSession.newChatWindow", "New Chat Window"),
        f1: true,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: [{
          id: MenuId.ChatTitleBarMenu,
          group: "b_new",
          order: 1
        }, {
          id: MenuId.ChatNewMenu,
          group: "2_new",
          order: 3
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), AUX_WINDOW_GROUP, { pinned: true, auxiliary: { compact: true, bounds: { width: 640, height: 640 } } });
    }
  });
  registerAction2(class ClearChatInputHistoryAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.clearInputHistory",
        title: localize2("interactiveSession.clearHistory.label", "Clear Input History"),
        precondition: ChatContextKeys.enabled,
        category: CHAT_CATEGORY,
        f1: true
      });
    }
    async run(accessor, ...args) {
      const historyService = accessor.get(IChatWidgetHistoryService);
      historyService.clearHistory();
    }
  });
  registerAction2(class FocusChatAction extends EditorAction2 {
    constructor() {
      super({
        id: "chat.action.focus",
        title: localize2("actions.interactiveSession.focus", "Focus Chat List"),
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatInput),
        category: CHAT_CATEGORY,
        keybinding: [
          // On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
          {
            when: ContextKeyExpr.and(ChatContextKeys.inputCursorAtTop, ChatContextKeys.inQuickChat.negate()),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
            weight: KeybindingWeight.EditorContrib
          },
          // On win/linux, ctrl+up can always focus the chat list
          {
            when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), ChatContextKeys.inQuickChat.negate()),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
            weight: KeybindingWeight.EditorContrib
          },
          {
            when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inQuickChat),
            primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
            weight: KeybindingWeight.WorkbenchContrib
          }
        ]
      });
    }
    runEditorCommand(accessor, editor) {
      const editorUri = editor.getModel()?.uri;
      if (editorUri) {
        const widgetService = accessor.get(IChatWidgetService);
        widgetService.getWidgetByInputUri(editorUri)?.focusResponseItem();
      }
    }
  });
  registerAction2(class FocusMostRecentlyFocusedChatAction extends EditorAction2 {
    constructor() {
      super({
        id: "workbench.chat.action.focusLastFocused",
        title: localize2("actions.interactiveSession.focusLastFocused", "Focus Last Focused Chat List Item"),
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatInput),
        category: CHAT_CATEGORY,
        keybinding: [
          // On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
          {
            when: ContextKeyExpr.and(ChatContextKeys.inputCursorAtTop, ChatContextKeys.inQuickChat.negate()),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow | KeyMod.Shift,
            weight: KeybindingWeight.EditorContrib + 1
          },
          // On win/linux, ctrl+up can always focus the chat list
          {
            when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), ChatContextKeys.inQuickChat.negate()),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow | KeyMod.Shift,
            weight: KeybindingWeight.EditorContrib + 1
          },
          {
            when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inQuickChat),
            primary: KeyMod.CtrlCmd | KeyCode.DownArrow | KeyMod.Shift,
            weight: KeybindingWeight.WorkbenchContrib + 1
          }
        ]
      });
    }
    runEditorCommand(accessor, editor) {
      const editorUri = editor.getModel()?.uri;
      if (editorUri) {
        const widgetService = accessor.get(IChatWidgetService);
        widgetService.getWidgetByInputUri(editorUri)?.focusResponseItem(true);
      }
    }
  });
  registerAction2(class FocusChatInputAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.focusInput",
        title: localize2("interactiveSession.focusInput.label", "Focus Chat Input"),
        f1: false,
        keybinding: [
          {
            primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
            weight: KeybindingWeight.WorkbenchContrib,
            when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat.negate())
          },
          {
            when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
            weight: KeybindingWeight.WorkbenchContrib
          }
        ]
      });
    }
    run(accessor, ...args) {
      const widgetService = accessor.get(IChatWidgetService);
      widgetService.lastFocusedWidget?.focusInput();
    }
  });
  registerAction2((_a = class extends Action2 {
    constructor() {
      super({
        id: _a.ID,
        title: localize2("interactiveSession.focusTodosView.label", "Toggle Focus Between TODOs and Input"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib + 1,
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT,
          when: ContextKeyExpr.or(
            ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent)),
            ContextKeyExpr.and(ChatContextKeys.inChatTodoList, ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent))
          )
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      const widget = widgetService.lastFocusedWidget;
      if (!widget || !widget.toggleTodosViewFocus()) {
        alert(localize("chat.todoList.focusUnavailable", "No agent todos to focus right now."));
      }
    }
  }, _a.ID = "workbench.action.chat.focusTodosView", _a));
  registerAction2((_b = class extends Action2 {
    constructor() {
      super({
        id: _b.ID,
        title: localize2("interactiveSession.focusQuestionCarousel.label", "Chat: Toggle Focus Between Question and Input"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.inChatSession,
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
          when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel)
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      const widget = widgetService.lastFocusedWidget;
      if (!widget || !widget.toggleQuestionCarouselFocus()) {
        alert(localize("chat.questionCarousel.focusUnavailable", "No chat question to focus right now."));
      }
    }
  }, _b.ID = "workbench.action.chat.focusQuestionCarousel", _b));
  registerAction2((_c = class extends Action2 {
    constructor() {
      super({
        id: _c.ID,
        title: localize2("interactiveSession.previousQuestion.label", "Chat: Previous Question"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel),
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.Alt | KeyCode.KeyP,
          when: ContextKeyExpr.and(ChatContextKeys.inChatQuestionCarousel, ChatContextKeys.Editing.hasQuestionCarousel)
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      widgetService.lastFocusedWidget?.navigateToPreviousQuestion();
    }
  }, _c.ID = "workbench.action.chat.previousQuestion", _c));
  registerAction2((_d = class extends Action2 {
    constructor() {
      super({
        id: _d.ID,
        title: localize2("interactiveSession.nextQuestion.label", "Chat: Next Question"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel),
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.Alt | KeyCode.KeyN,
          when: ContextKeyExpr.and(ChatContextKeys.inChatQuestionCarousel, ChatContextKeys.Editing.hasQuestionCarousel)
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      widgetService.lastFocusedWidget?.navigateToNextQuestion();
    }
  }, _d.ID = "workbench.action.chat.nextQuestion", _d));
  registerAction2((_e = class extends Action2 {
    constructor() {
      super({
        id: _e.ID,
        title: localize2("interactiveSession.focusQuestionCarouselTerminal.label", "Chat: Focus Terminal from Question Carousel"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel, ChatContextKeys.chatQuestionCarouselHasTerminal),
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.Alt | KeyCode.KeyT,
          when: ContextKeyExpr.and(ChatContextKeys.inChatQuestionCarousel, ChatContextKeys.Editing.hasQuestionCarousel, ChatContextKeys.chatQuestionCarouselHasTerminal)
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      widgetService.lastFocusedWidget?.focusQuestionCarouselTerminal();
    }
  }, _e.ID = "workbench.action.chat.focusQuestionCarouselTerminal", _e));
  registerAction2((_f = class extends Action2 {
    constructor() {
      super({
        id: _f.ID,
        title: localize2("interactiveSession.focusNotice.label", "Chat: Toggle Focus Between Notice and Input"),
        category: CHAT_CATEGORY,
        f1: true,
        // The Agents composer is not a chat widget, so it never sets
        // `inChatSession`; it reports its own focus instead.
        precondition: ContextKeyExpr.or(ChatContextKeys.inChatSession, ChatContextKeys.inChatComposer),
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
          when: ContextKeyExpr.or(
            ChatContextKeys.inChatSession,
            ChatContextKeys.inChatTip,
            ChatContextKeys.inChatComposer
          )
        }]
      });
    }
    run(accessor) {
      if (!accessor.get(IChatInputNoticeHubService).toggleNoticeFocus()) {
        alert(localize("chat.notice.focusUnavailable", "No chat notice."));
      }
    }
  }, // Kept as `focusTip` so existing keybindings and user settings continue to work.
  _f.ID = "workbench.action.chat.focusTip", _f));
  registerAction2(class ShowContextUsageAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.showContextUsage",
        title: localize2("interactiveSession.showContextUsage.label", "Show Context Window Usage"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      const widget = widgetService.lastFocusedWidget ?? await widgetService.revealWidget();
      widget?.input.showContextUsageDetails();
    }
  });
  registerAction2(class CompactAgentHostConversationAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.compactAgentHostConversation",
        title: localize2("interactiveSession.compactAgentHostConversation.label", "Compact Conversation"),
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: {
          id: MenuId.ChatContextUsageActions,
          group: "navigation",
          when: ContextKeyExpr.and(
            ChatContextKeys.chatIsAgentHostSession,
            ChatContextKeys.chatAgentHostProviderId.isEqualTo(COPILOT_CLI_AGENT_HOST_PROVIDER_ID)
          )
        }
      });
    }
    async run(_accessor, widget) {
      await widget?.acceptInput("/compact", { preserveInput: true });
    }
  });
  registerAction2(class ToggleShowContextUsageAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.toggleShowContextUsage",
        title: localize2("chat.showContextUsage", "Show Context Usage"),
        category: CHAT_CATEGORY,
        toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatContextUsageEnabled}`, true),
        menu: {
          id: MenuId.ChatWelcomeContext,
          group: "1_display",
          order: 1,
          when: ChatContextKeys.inChatEditor.negate()
        }
      });
    }
    async run(accessor) {
      const configurationService = accessor.get(IConfigurationService);
      const currentValue = configurationService.getValue(ChatConfiguration.ChatContextUsageEnabled);
      await configurationService.updateValue(ChatConfiguration.ChatContextUsageEnabled, !currentValue);
    }
  });
  const nonEnterpriseCopilotUsers = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.notEquals(`config.${defaultChat.completionsAdvancedSetting}.authProvider`, defaultChat.provider.enterprise.id));
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.manageSettings",
        title: localize2("manageChat", "Manage Copilot Settings"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ContextKeyExpr.and(
          ContextKeyExpr.or(
            ChatContextKeys.Entitlement.planFree,
            ChatContextKeys.Entitlement.planEdu,
            ChatContextKeys.Entitlement.planPro,
            ChatContextKeys.Entitlement.planProPlus,
            ChatContextKeys.Entitlement.planMax
          ),
          nonEnterpriseCopilotUsers
        ),
        menu: {
          id: MenuId.ChatTitleBarMenu,
          group: "y_manage",
          order: 1,
          when: nonEnterpriseCopilotUsers
        }
      });
    }
    async run(accessor) {
      const openerService = accessor.get(IOpenerService);
      const defaultAccountService = accessor.get(IDefaultAccountService);
      openerService.open(URI.parse(defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings)));
    }
  });
  registerAction2(class ShowExtensionsUsingCopilot extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.showExtensionsUsingCopilot",
        title: localize2("showCopilotUsageExtensions", "Show Extensions using Copilot"),
        f1: true,
        category: EXTENSIONS_CATEGORY,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
      extensionsWorkbenchService.openSearch(`@contribute:${CopilotUsageExtensionFeatureId}`);
    }
  });
  registerAction2(class ConfigureCopilotCompletions extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.configureCodeCompletions",
        title: localize2("configureCompletions", "Configure Inline Suggestions..."),
        precondition: ContextKeyExpr.and(
          ChatContextKeys.Setup.installed,
          ChatContextKeys.Setup.disabled.negate(),
          ChatContextKeys.Setup.untrusted.negate()
        ),
        menu: {
          id: MenuId.ChatTitleBarMenu,
          group: "f_completions",
          order: 10
        }
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      commandService.executeCommand(defaultChat.completionsMenuCommand);
    }
  });
  registerAction2(class ShowQuotaExceededDialogAction extends Action2 {
    constructor() {
      super({
        id: OPEN_CHAT_QUOTA_EXCEEDED_DIALOG,
        title: localize("upgradeChat", "Upgrade GitHub Copilot Plan")
      });
    }
    async run(accessor) {
      const chatEntitlementService = accessor.get(IChatEntitlementService);
      const commandService = accessor.get(ICommandService);
      const dialogService = accessor.get(IDialogService);
      const telemetryService = accessor.get(ITelemetryService);
      let message;
      const chatQuotaExceeded = chatEntitlementService.quotas.chat?.percentRemaining === 0;
      const completionsQuotaExceeded = chatEntitlementService.quotas.completions?.percentRemaining === 0;
      if (chatQuotaExceeded && !completionsQuotaExceeded) {
        message = localize("chatQuotaExceeded", "You've reached your monthly chat messages quota. You still have free inline suggestions available.");
      } else if (completionsQuotaExceeded && !chatQuotaExceeded) {
        message = localize("completionsQuotaExceeded", "You've reached your monthly inline suggestions quota. You still have free chat messages available.");
      } else {
        message = localize("chatAndCompletionsQuotaExceeded", "You've reached your monthly chat messages and inline suggestions quota.");
      }
      if (chatEntitlementService.quotas.resetDate) {
        const dateFormatter = chatEntitlementService.quotas.resetDateHasTime ? safeIntl.DateTimeFormat(language, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric" }) : safeIntl.DateTimeFormat(language, { year: "numeric", month: "long", day: "numeric" });
        const quotaResetDate = new Date(chatEntitlementService.quotas.resetDate);
        message = [message, localize("quotaResetDate", "The allowance will reset on {0}.", dateFormatter.value.format(quotaResetDate))].join(" ");
      }
      const free = chatEntitlementService.entitlement === ChatEntitlement.Free;
      const upgradeToPro = free ? localize("upgradeToPro", "Upgrade to GitHub Copilot Pro for:\n- Unlimited inline suggestions\n- Unlimited chat messages\n- Access to premium models") : void 0;
      await dialogService.prompt({
        type: "none",
        message: localize("copilotQuotaReached", "GitHub Copilot Quota Reached"),
        cancelButton: {
          label: localize("dismiss", "Dismiss"),
          run: () => {
          }
        },
        buttons: [
          {
            label: free ? localize("upgradePro", "Upgrade to GitHub Copilot Pro") : localize("upgradePlan", "Upgrade GitHub Copilot Plan"),
            run: () => {
              const commandId = "workbench.action.chat.upgradePlan";
              telemetryService.publicLog2("workbenchActionExecuted", { id: commandId, from: "chat-dialog" });
              commandService.executeCommand(commandId);
            }
          }
        ],
        custom: {
          icon: Codicon.copilotWarningLarge,
          markdownDetails: coalesce([
            { markdown: new MarkdownString(message, true) },
            upgradeToPro ? { markdown: new MarkdownString(upgradeToPro, true) } : void 0
          ])
        }
      });
    }
  });
  registerAction2(class ResetTrustedToolsAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.resetTrustedTools",
        title: localize2("resetTrustedTools", "Reset Tool Confirmations"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    run(accessor) {
      accessor.get(ILanguageModelToolsConfirmationService).resetToolAutoConfirmation();
      accessor.get(INotificationService).info(localize("resetTrustedToolsSuccess", "Tool confirmation preferences have been reset."));
    }
  });
  registerAction2(class GenerateInstructionsAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
        title: localize2("generateInstructions", "Generate Agent Instructions"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/init",
        isPartialQuery: false
      });
    }
  });
  registerAction2(class GenerateInstructionAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
        title: localize2("generateOnDemandInstructions", "Generate On-Demand Instructions"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-instructions ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class GeneratePromptAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_PROMPT_COMMAND_ID,
        title: localize2("generatePrompt", "Generate Prompt File"),
        shortTitle: localize2("generatePrompt.short", "Generate Prompt"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-prompt ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class GenerateSkillAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_SKILL_COMMAND_ID,
        title: localize2("generateSkill", "Generate Skill"),
        shortTitle: localize2("generateSkill.short", "Generate Skill"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-skill ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class GenerateAgentAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_AGENT_COMMAND_ID,
        title: localize2("generateAgent", "Generate Custom Agent"),
        shortTitle: localize2("generateAgent.short", "Generate Agent"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-agent ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class GenerateHookAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_HOOK_COMMAND_ID,
        title: localize2("generateHook", "Generate Hook"),
        shortTitle: localize2("generateHook.short", "Generate Hook"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-hook ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class InsertForkConversationSlashCommandAction extends Action2 {
    constructor() {
      super({
        id: INSERT_FORK_CONVERSATION_COMMAND_ID,
        title: localize2("insertForkConversationSlashCommand", "Insert Fork Command"),
        shortTitle: localize2("insertForkConversationSlashCommand.short", "Insert /fork"),
        category: CHAT_CATEGORY,
        icon: Codicon.repoForked,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        query: "/fork ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class InsertTroubleshootSlashCommandAction extends Action2 {
    constructor() {
      super({
        id: INSERT_TROUBLESHOOT_COMMAND_ID,
        title: localize2("insertTroubleshootSlashCommand", "Insert Troubleshoot Command"),
        shortTitle: localize2("insertTroubleshootSlashCommand.short", "Insert /troubleshoot"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        query: "/troubleshoot ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class OpenChatFeatureSettingsAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.openFeatureSettings",
        title: localize2("openChatFeatureSettings", "Chat Settings"),
        shortTitle: localize("openChatFeatureSettings.short", "Chat Settings"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.enabled,
        menu: [
          {
            id: CHAT_CONFIG_MENU_ID,
            when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals("view", ChatViewId)),
            order: 15,
            group: "3_configure"
          },
          {
            id: MenuId.ChatWelcomeContext,
            group: "2_settings",
            order: 1
          },
          {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals("view", ChatViewId)),
            order: 15,
            group: "3_configure"
          }
        ]
      });
    }
    async run(accessor) {
      const preferencesService = accessor.get(IPreferencesService);
      preferencesService.openSettings({ query: "@feature:chat " });
    }
  });
  MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
    command: {
      id: AICustomizationManagementCommands.OpenEditor,
      title: localize2("openChatCustomizations", "Open Customizations"),
      category: CHAT_CATEGORY,
      icon: Codicon.gear
    },
    group: "navigation",
    when: ContextKeyExpr.and(
      ChatContextKeys.enabled,
      ContextKeyExpr.equals("view", ChatViewId)
    ),
    order: 6
  });
}
function stringifyItem(item, includeName = true) {
  if (isRequestVM(item)) {
    return (includeName ? `${item.username}: ` : "") + item.messageText;
  } else {
    return (includeName ? `${item.username}: ` : "") + item.response.toString();
  }
}
function computeToolEnablementMap(options) {
  const { allTools, allToolSets, toolsInclude, toolsExclude } = options;
  const enablementMap = /* @__PURE__ */ new Map();
  const matchedIdentifiers = /* @__PURE__ */ new Set();
  const toolMatches = (tool, identifiers) => {
    if (identifiers.has(tool.id)) {
      matchedIdentifiers.add(tool.id);
      return true;
    }
    if (tool.toolReferenceName && identifiers.has(tool.toolReferenceName)) {
      matchedIdentifiers.add(tool.toolReferenceName);
      return true;
    }
    return false;
  };
  const toolSetMatches = (toolSet, identifiers) => {
    if (identifiers.has(toolSet.id)) {
      matchedIdentifiers.add(toolSet.id);
      return true;
    }
    if (identifiers.has(toolSet.referenceName)) {
      matchedIdentifiers.add(toolSet.referenceName);
      return true;
    }
    return false;
  };
  const explicitlyIncludedTools = /* @__PURE__ */ new Set();
  if (toolsInclude) {
    const includeSet = new Set(toolsInclude);
    for (const toolSet of allToolSets) {
      if (toolSetMatches(toolSet, includeSet)) {
        for (const tool of toolSet.getTools()) {
          enablementMap.set(tool, true);
        }
      }
    }
    for (const tool of allTools) {
      if (toolMatches(tool, includeSet)) {
        enablementMap.set(tool, true);
        explicitlyIncludedTools.add(tool);
      } else if (!enablementMap.has(tool)) {
        enablementMap.set(tool, false);
      }
    }
    for (const toolSet of allToolSets) {
      for (const tool of toolSet.getTools()) {
        if (toolMatches(tool, includeSet)) {
          enablementMap.set(tool, true);
          explicitlyIncludedTools.add(tool);
        } else if (!enablementMap.has(tool)) {
          enablementMap.set(tool, false);
        }
      }
    }
  } else {
    for (const tool of allTools) {
      enablementMap.set(tool, true);
    }
    for (const toolSet of allToolSets) {
      for (const tool of toolSet.getTools()) {
        enablementMap.set(tool, true);
      }
    }
  }
  if (toolsExclude) {
    const excludeSet = new Set(toolsExclude);
    for (const toolSet of allToolSets) {
      if (toolSetMatches(toolSet, excludeSet)) {
        for (const tool of toolSet.getTools()) {
          if (!explicitlyIncludedTools.has(tool)) {
            enablementMap.set(tool, false);
          }
        }
      }
    }
    for (const tool of allTools) {
      if (toolMatches(tool, excludeSet)) {
        enablementMap.set(tool, false);
      }
    }
    for (const toolSet of allToolSets) {
      for (const tool of toolSet.getTools()) {
        if (toolMatches(tool, excludeSet)) {
          enablementMap.set(tool, false);
        }
      }
    }
  }
  const allIdentifiers = /* @__PURE__ */ new Set([...toolsInclude ?? [], ...toolsExclude ?? []]);
  const unknownIdentifiers = [];
  for (const identifier of allIdentifiers) {
    if (!matchedIdentifiers.has(identifier)) {
      unknownIdentifiers.push(identifier);
    }
  }
  const enabledToolCount = Array.from(enablementMap.entries()).filter(([item, enabled]) => enabled && !isToolSet(item)).length;
  if (enabledToolCount === 0) {
    throw new Error("Tool filtering resulted in zero enabled tools. At least one tool must be enabled.");
  }
  for (const toolSet of allToolSets) {
    const toolSetTools = Array.from(toolSet.getTools());
    const allToolsEnabled = toolSetTools.length > 0 && toolSetTools.every((t) => enablementMap.get(t) === true);
    enablementMap.set(toolSet, allToolsEnabled);
  }
  return { enablementMap: ToolAndToolSetEnablementMap.fromMap(enablementMap), unknownIdentifiers };
}
async function handleCurrentEditingSession(model, phrase, dialogService) {
  return showClearEditingSessionConfirmation(model, dialogService, { messageOverride: phrase });
}
async function handleModeSwitch(accessor, fromMode, toMode, requestCount, model) {
  if (!model?.editingSession || fromMode === toMode) {
    return { needToClearSession: false };
  }
  const dialogService = accessor.get(IDialogService);
  const needToClearEdits = (fromMode === ChatModeKind.Edit || toMode === ChatModeKind.Edit) && requestCount > 0;
  if (needToClearEdits) {
    const phrase = localize("switchMode.confirmPhrase", "Switching agents will end your current edit session.");
    const currentEdits = model.editingSession.entries.get();
    const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
    if (undecidedEdits.length > 0) {
      if (!await handleCurrentEditingSession(model, phrase, dialogService)) {
        return false;
      }
      return { needToClearSession: true };
    } else {
      const confirmation = await dialogService.confirm({
        title: localize("agent.newSession", "Start new session?"),
        message: localize("agent.newSessionMessage", "Changing the agent will end your current edit session. Would you like to change the agent?"),
        primaryButton: localize("agent.newSession.confirm", "Yes"),
        type: "info"
      });
      if (!confirmation.confirmed) {
        return false;
      }
      return { needToClearSession: true };
    }
  }
  return { needToClearSession: false };
}
async function clearChatSessionPreservingType(accessor, widget, sessionType) {
  const viewsService = accessor.get(IViewsService);
  const currentResource = widget.viewModel?.model.sessionResource;
  const currentSessionType = currentResource ? getChatSessionType(currentResource) : void 0;
  const { sessionType: newSessionType } = resolveDefaultNewChatSessionType(accessor, { explicitOverride: sessionType, currentSessionType });
  if (isIChatViewViewContext(widget.viewContext)) {
    const view = await viewsService.openView(ChatViewId);
    if (newSessionType !== localChatSessionType) {
      await view.loadSession(URI.from({ scheme: newSessionType, path: `/untitled-${generateUuid()}` }));
    } else {
      await view.startNewLocalSession();
    }
  } else {
    await widget.clear(newSessionType);
  }
}
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  submenu: MenuId.ChatTextEditorMenu,
  group: "1_chat",
  order: 5,
  title: localize("generateCode", "Generate Code"),
  when: ContextKeyExpr.and(
    ChatContextKeys.Setup.hidden.negate(),
    ChatContextKeys.Setup.disabledInWorkspace.negate()
  )
});
registerAction2(class ToggleDefaultVisibilityAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.toggleDefaultVisibility",
      title: localize2("chat.toggleDefaultVisibility.label", "Show View by Default"),
      toggled: ContextKeyExpr.equals("config.workbench.secondarySideBar.defaultVisibility", "hidden").negate(),
      f1: false,
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("view", ChatViewId),
          ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.AuxiliaryBar)
        ),
        order: 0,
        group: "5_configure"
      }
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const currentValue = configurationService.getValue("workbench.secondarySideBar.defaultVisibility");
    configurationService.updateValue("workbench.secondarySideBar.defaultVisibility", currentValue !== "hidden" ? "hidden" : "visible");
  }
});
registerAction2(class EditToolApproval extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.editToolApproval",
      title: localize2("chat.editToolApproval.label", "Manage Tool Approval"),
      metadata: {
        description: localize2("chat.editToolApproval.description", "Edit/manage the tool approval and confirmation preferences for AI chat agents.")
      },
      precondition: ChatContextKeys.enabled,
      f1: true,
      category: CHAT_CATEGORY
    });
  }
  async run(accessor, scope) {
    const confirmationService = accessor.get(ILanguageModelToolsConfirmationService);
    const toolsService = accessor.get(ILanguageModelToolsService);
    confirmationService.manageConfirmationPreferences([...toolsService.getAllToolsIncludingDisabled()], scope ? { defaultScope: scope } : void 0);
  }
});
export {
  ACTION_ID_NEW_CHAT,
  ACTION_ID_NEW_EDIT_SESSION,
  ACTION_ID_OPEN_CHAT,
  CHAT_CATEGORY,
  CHAT_CONFIG_MENU_ID,
  CHAT_OPEN_ACTION_ID,
  CHAT_SETUP_ACTION_ID,
  CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID,
  GENERATE_AGENT_COMMAND_ID,
  GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
  GENERATE_HOOK_COMMAND_ID,
  GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
  GENERATE_PROMPT_COMMAND_ID,
  GENERATE_SKILL_COMMAND_ID,
  INSERT_FORK_CONVERSATION_COMMAND_ID,
  INSERT_TROUBLESHOOT_COMMAND_ID,
  ModeOpenChatGlobalAction,
  clearChatSessionPreservingType,
  computeToolEnablementMap,
  getOpenChatActionIdForMode,
  handleCurrentEditingSession,
  handleModeSwitch,
  registerChatActions,
  stringifyItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgc2FmZUludGwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElDb21tYW5kUGFsZXR0ZU9wdGlvbnMsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc0xpbnV4Q29udGV4dCwgSXNXaW5kb3dzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IEdpdEh1YlBhdGhzLCBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGl2ZUVkaXRvckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgQVVYX1dJTkRPV19HUk9VUCwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OU19DQVRFR09SWSwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlQ29udGVudFByb3ZpZGVyLCBTY21IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVXJpRmllbGRzIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2Jyb3dzZXIvc2NtSGlzdG9yeUNoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFJlc3VsdCwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXROb3RpY2VIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGljZUh1Yi5qcyc7XG5pbXBvcnQgeyBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElDaGF0UmVzcG9uc2VNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUsIElDaGF0TW9kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgRWxpY2l0YXRpb25TdGF0ZSwgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVmFyaWFibGVFbnRyeSwgSVNDTUhpc3RvcnlJdGVtQ2hhbmdlVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNSZXF1ZXN0Vk0gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dpZGdldC9jaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQsIGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblJlc291cmNlLCByZXNvbHZlRGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudENvbW1hbmRzIH0gZnJvbSAnLi4vYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3IsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ29waWxvdFVzYWdlRXh0ZW5zaW9uRmVhdHVyZUlkIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxTdGF0cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbERhdGEsIElUb29sU2V0LCBpc1Rvb2xTZXQsIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRWaWV3SWQsIElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UsIGlzSUNoYXRWaWV3Vmlld0NvbnRleHQgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9yLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JJbnB1dCwgc2hvd0NsZWFyRWRpdGluZ1Nlc3Npb25Db25maXJtYXRpb24gfSBmcm9tICcuLi93aWRnZXRIb3N0cy9lZGl0b3IvY2hhdEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGNvbnZlcnRCdWZmZXJUb1NjcmVlbnNob3RWYXJpYWJsZSB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRTY3JlZW5zaG90Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IENoYXRWaWV3UGFuZSB9IGZyb20gJy4uL3dpZGdldEhvc3RzL3ZpZXdQYW5lL2NoYXRWaWV3UGFuZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBDSEFUX0NBVEVHT1JZID0gbG9jYWxpemUyKCdjaGF0LmNhdGVnb3J5JywgJ0NoYXQnKTtcblxuY29uc3QgQ09QSUxPVF9DTElfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCA9ICdjb3BpbG90Y2xpJztcblxuZXhwb3J0IGNvbnN0IEFDVElPTl9JRF9ORVdfQ0hBVCA9IGB3b3JrYmVuY2guYWN0aW9uLmNoYXQubmV3Q2hhdGA7XG5leHBvcnQgY29uc3QgQUNUSU9OX0lEX05FV19FRElUX1NFU1NJT04gPSBgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm5ld0VkaXRTZXNzaW9uYDtcbmV4cG9ydCBjb25zdCBBQ1RJT05fSURfT1BFTl9DSEFUID0gJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkNoYXQnO1xuZXhwb3J0IGNvbnN0IENIQVRfT1BFTl9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nO1xuZXhwb3J0IGNvbnN0IENIQVRfU0VUVVBfQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXAnO1xuZXhwb3J0IGNvbnN0IENIQVRfU0VUVVBfU1VQUE9SVF9BTk9OWU1PVVNfQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXBTdXBwb3J0QW5vbnltb3VzQWN0aW9uJztcbmNvbnN0IFRPR0dMRV9DSEFUX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudG9nZ2xlJztcblxuZXhwb3J0IGNvbnN0IEdFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5nZW5lcmF0ZUFnZW50SW5zdHJ1Y3Rpb25zJztcbmV4cG9ydCBjb25zdCBHRU5FUkFURV9PTl9ERU1BTkRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmdlbmVyYXRlT25EZW1hbmRJbnN0cnVjdGlvbnMnO1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRFX1BST01QVF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5nZW5lcmF0ZVByb21wdCc7XG5leHBvcnQgY29uc3QgR0VORVJBVEVfU0tJTExfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZ2VuZXJhdGVTa2lsbCc7XG5leHBvcnQgY29uc3QgR0VORVJBVEVfQUdFTlRfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZ2VuZXJhdGVBZ2VudCc7XG5leHBvcnQgY29uc3QgR0VORVJBVEVfSE9PS19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5nZW5lcmF0ZUhvb2snO1xuZXhwb3J0IGNvbnN0IElOU0VSVF9GT1JLX0NPTlZFUlNBVElPTl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5pbnNlcnRGb3JrQ29udmVyc2F0aW9uQ29tbWFuZCc7XG5leHBvcnQgY29uc3QgSU5TRVJUX1RST1VCTEVTSE9PVF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5pbnNlcnRUcm91Ymxlc2hvb3RDb21tYW5kJztcblxuY29uc3QgZGVmYXVsdENoYXQgPSB7XG5cdHByb3ZpZGVyOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnByb3ZpZGVyID8/IHsgZW50ZXJwcmlzZTogeyBpZDogJycgfSB9LFxuXHRjb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZzogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5jb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZyA/PyAnJyxcblx0Y29tcGxldGlvbnNNZW51Q29tbWFuZDogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5jb21wbGV0aW9uc01lbnVDb21tYW5kID8/ICcnLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFZpZXdPcGVuT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBUaGUgcXVlcnkgZm9yIGNoYXQuXG5cdCAqL1xuXHRxdWVyeTogc3RyaW5nO1xuXHQvKipcblx0ICogV2hldGhlciB0aGUgcXVlcnkgaXMgcGFydGlhbCBhbmQgd2lsbCBhd2FpdCBtb3JlIGlucHV0IGZyb20gdGhlIHVzZXIuXG5cdCAqL1xuXHRpc1BhcnRpYWxRdWVyeT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBBIGxpc3Qgb2YgdG9vbHMgSURzIHdpdGggYGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0YCB0aGF0IHdpbGwgYmUgcmVzb2x2ZWQgYW5kIGF0dGFjaGVkIGlmIHRoZXkgZXhpc3QuXG5cdCAqL1xuXHR0b29sSWRzPzogc3RyaW5nW107XG5cdC8qKlxuXHQgKiBBbnkgcHJldmlvdXMgY2hhdCByZXF1ZXN0cyBhbmQgcmVzcG9uc2VzIHRoYXQgc2hvdWxkIGJlIHNob3duIGluIHRoZSBjaGF0IHZpZXcuXG5cdCAqL1xuXHRwcmV2aW91c1JlcXVlc3RzPzogSUNoYXRWaWV3T3BlblJlcXVlc3RFbnRyeVtdO1xuXHQvKipcblx0ICogV2hldGhlciBhIHNjcmVlbnNob3Qgb2YgdGhlIGZvY3VzZWQgd2luZG93IHNob3VsZCBiZSB0YWtlbiBhbmQgYXR0YWNoZWRcblx0ICovXG5cdGF0dGFjaFNjcmVlbnNob3Q/OiBib29sZWFuO1xuXHQvKipcblx0ICogQSBsaXN0IG9mIGZpbGUgVVJJcyB0byBhdHRhY2ggdG8gdGhlIGNoYXQgYXMgY29udGV4dC5cblx0ICovXG5cdGF0dGFjaEZpbGVzPzogKFVSSSB8IHsgdXJpOiBVUkk7IHJhbmdlOiBJUmFuZ2UgfSlbXTtcblx0LyoqXG5cdCAqIEEgbGlzdCBvZiBzb3VyY2UgY29udHJvbCBoaXN0b3J5IGl0ZW0gY2hhbmdlcyB0byBhdHRhY2ggdG8gdGhlIGNoYXQgYXMgY29udGV4dC5cblx0ICovXG5cdGF0dGFjaEhpc3RvcnlJdGVtQ2hhbmdlcz86IHsgdXJpOiBVUkk7IGhpc3RvcnlJdGVtSWQ6IHN0cmluZyB9W107XG5cdC8qKlxuXHQgKiBBIGxpc3Qgb2Ygc291cmNlIGNvbnRyb2wgaGlzdG9yeSBpdGVtIGNoYW5nZSByYW5nZXMgdG8gYXR0YWNoIHRvIHRoZSBjaGF0IGFzIGNvbnRleHQuXG5cdCAqL1xuXHRhdHRhY2hIaXN0b3J5SXRlbUNoYW5nZVJhbmdlcz86IHtcblx0XHRzdGFydDogeyB1cmk6IFVSSTsgaGlzdG9yeUl0ZW1JZDogc3RyaW5nIH07XG5cdFx0ZW5kOiB7IHVyaTogVVJJOyBoaXN0b3J5SXRlbUlkOiBzdHJpbmcgfTtcblx0fVtdO1xuXHQvKipcblx0ICogVGhlIG1vZGUgSUQgb3IgbmFtZSB0byBvcGVuIHRoZSBjaGF0IGluLlxuXHQgKi9cblx0bW9kZT86IENoYXRNb2RlS2luZCB8IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIGxhbmd1YWdlIG1vZGVsIHNlbGVjdG9yIHRvIHVzZSBmb3IgdGhlIGNoYXQuXG5cdCAqIEFuIEVycm9yIHdpbGwgYmUgdGhyb3duIGlmIHRoZXJlJ3Mgbm8gbWF0Y2guIElmIHRoZXJlIGFyZSBtdWx0aXBsZVxuXHQgKiBtYXRjaGVzLCB0aGUgZmlyc3QgbWF0Y2ggd2lsbCBiZSB1c2VkLlxuXHQgKlxuXHQgKiBFeGFtcGxlczpcblx0ICpcblx0ICogYGBgXG5cdCAqIHtcblx0ICogICBpZDogJ2NsYXVkZS1zb25uZXQtNCcsXG5cdCAqICAgdmVuZG9yOiAnY29waWxvdCdcblx0ICogfVxuXHQgKiBgYGBcblx0ICpcblx0ICogVXNlIGBjbGF1ZGUtc29ubmV0LTRgIGZyb20gYW55IHZlbmRvcjpcblx0ICpcblx0ICogYGBgXG5cdCAqIHtcblx0ICogICBpZDogJ2NsYXVkZS1zb25uZXQtNCcsXG5cdCAqIH1cblx0ICogYGBgXG5cdCAqL1xuXHRtb2RlbFNlbGVjdG9yPzogSUxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3I7XG5cblx0LyoqXG5cdCAqIFdhaXQgdG8gcmVzb2x2ZSB0aGUgY29tbWFuZCB1bnRpbCB0aGUgY2hhdCByZXNwb25zZSByZWFjaGVzIGEgdGVybWluYWwgc3RhdGUgKGNvbXBsZXRlLCBlcnJvciwgb3IgcGVuZGluZyB1c2VyIGNvbmZpcm1hdGlvbiwgZXRjLikuXG5cdCAqL1xuXHRibG9ja09uUmVzcG9uc2U/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBBIGxpc3Qgb2YgdG9vbCBpZGVudGlmaWVycyB0byBpbmNsdWRlLiBXaGVuIHNwZWNpZmllZCBhbG9uZSwgb25seSB0aGVzZSB0b29scyB3aWxsIGJlIGVuYWJsZWQuXG5cdCAqIElkZW50aWZpZXJzIGNhbiBiZSB0b29sIElEcywgdG9vbCByZWZlcmVuY2UgbmFtZXMgKGB0b29sUmVmZXJlbmNlTmFtZWApLFxuXHQgKiB0b29sc2V0IElEcywgb3IgdG9vbHNldCByZWZlcmVuY2UgbmFtZXMgKGByZWZlcmVuY2VOYW1lYCkuXG5cdCAqIFdoZW4gYSB0b29sc2V0IGlkZW50aWZpZXIgbWF0Y2hlcywgYWxsIHRvb2xzIGluIHRoYXQgdG9vbHNldCBhcmUgaW5jbHVkZWQuXG5cdCAqIENhbiBiZSBjb21iaW5lZCB3aXRoIGB0b29sc0V4Y2x1ZGVgIGZvciBmaW5lLWdyYWluZWQgY29udHJvbC5cblx0ICovXG5cdHRvb2xzSW5jbHVkZT86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBBIGxpc3Qgb2YgdG9vbCBpZGVudGlmaWVycyB0byBleGNsdWRlLiBXaGVuIHNwZWNpZmllZCBhbG9uZSwgYWxsIHRvb2xzIGV4Y2VwdCB0aGVzZSB3aWxsIGJlIGVuYWJsZWQuXG5cdCAqIElkZW50aWZpZXJzIGNhbiBiZSB0b29sIElEcywgdG9vbCByZWZlcmVuY2UgbmFtZXMgKGB0b29sUmVmZXJlbmNlTmFtZWApLFxuXHQgKiB0b29sc2V0IElEcywgb3IgdG9vbHNldCByZWZlcmVuY2UgbmFtZXMgKGByZWZlcmVuY2VOYW1lYCkuXG5cdCAqIFdoZW4gYSB0b29sc2V0IGlkZW50aWZpZXIgbWF0Y2hlcywgYWxsIHRvb2xzIGluIHRoYXQgdG9vbHNldCBhcmUgZXhjbHVkZWQuXG5cdCAqIENhbiBiZSBjb21iaW5lZCB3aXRoIGB0b29sc0luY2x1ZGVgIC0gZXhjbHVzaW9ucyBhcmUgYXBwbGllZCBhZnRlciBpbmNsdXNpb25zLlxuXHQgKiBFeHBsaWNpdCB0b29sIHJlZmVyZW5jZXMgaW4gYHRvb2xzSW5jbHVkZWAgb3ZlcnJpZGUgdG9vbHNldCBleGNsdXNpb25zLFxuXHQgKiBidXQgZXhwbGljaXQgdG9vbCBleGNsdXNpb25zIGFsd2F5cyB3aW4uXG5cdCAqL1xuXHR0b29sc0V4Y2x1ZGU/OiBzdHJpbmdbXTtcblxuXHQvKipcblx0ICogU3VibWl0cyBgcXVlcnlgIHdpdGhvdXQgdGFraW5nIG92ZXIgdGhlIGlucHV0IGJveCwga2VlcGluZyBhbnkgZHJhZnQgdGhlIHVzZXJcblx0ICogaGFzIHR5cGVkIGFuZCBvbWl0dGluZyBpdHMgYXR0YWNobWVudHMgZnJvbSB0aGUgcmVxdWVzdC4gRm9yIG1haW50ZW5hbmNlXG5cdCAqIGNvbW1hbmRzIHN1Y2ggYXMgYC9jb21wYWN0YCB0aGF0IGFyZSBub3QgdXNlciBtZXNzYWdlcy5cblx0ICpcblx0ICogTXV0dWFsbHkgZXhjbHVzaXZlIHdpdGggYGF0dGFjaFNjcmVlbnNob3RgLCBgYXR0YWNoRmlsZXNgLFxuXHQgKiBgYXR0YWNoSGlzdG9yeUl0ZW1DaGFuZ2VzYCwgYGF0dGFjaEhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VzYCBhbmQgYHRvb2xJZHNgOlxuXHQgKiB0aG9zZSBhdHRhY2ggY29udGV4dCB2aWEgdGhlIGlucHV0IGJveCwgd2hpY2ggdGhpcyBvcHRpb24gZGVsaWJlcmF0ZWx5XG5cdCAqIGV4Y2x1ZGVzIGZyb20gdGhlIHJlcXVlc3QuXG5cdCAqL1xuXHRwcmVzZXJ2ZUlucHV0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFZpZXdPcGVuUmVxdWVzdEVudHJ5IHtcblx0cmVxdWVzdDogc3RyaW5nO1xuXHRyZXNwb25zZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgQ0hBVF9DT05GSUdfTUVOVV9JRCA9IG5ldyBNZW51SWQoJ3dvcmtiZW5jaC5jaGF0Lm1lbnUuY29uZmlnJyk7XG5cbmNvbnN0IE9QRU5fQ0hBVF9RVU9UQV9FWENFRURFRF9ESUFMT0cgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5RdW90YUV4Y2VlZGVkRGlhbG9nJztcblxuYWJzdHJhY3QgY2xhc3MgT3BlbkNoYXRHbG9iYWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3Iob3ZlcnJpZGVzOiBQaWNrPElDb21tYW5kUGFsZXR0ZU9wdGlvbnMsICdrZXliaW5kaW5nJyB8ICd0aXRsZScgfCAnaWQnIHwgJ21lbnUnPiwgcHJpdmF0ZSByZWFkb25seSBtb2RlPzogSUNoYXRNb2RlKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHQpXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdHM/OiBzdHJpbmcgfCBJQ2hhdFZpZXdPcGVuT3B0aW9ucyk6IFByb21pc2U8SUNoYXRBZ2VudFJlc3VsdCAmIHsgdHlwZT86ICdjb25maXJtYXRpb24nIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRvcHRzID0gdHlwZW9mIG9wdHMgPT09ICdzdHJpbmcnID8geyBxdWVyeTogb3B0cyB9IDogb3B0cztcblxuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHRvb2xzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk7XG5cdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0QWdlbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0QWdlbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxzU2VydmljZSk7XG5cdFx0Y29uc3Qgc2NtU2VydmljZSA9IGFjY2Vzc29yLmdldChJU0NNU2VydmljZSk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGxldCBjaGF0V2lkZ2V0ID0gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHQvLyBXaGVuIHRoaXMgd2FzIGludm9rZWQgdG8gc3dpdGNoIHRvIGEgbW9kZSB2aWEga2V5YmluZGluZywgYW5kIHNvbWUgY2hhdCB3aWRnZXQgaXMgZm9jdXNlZCwgdXNlIHRoYXQgb25lLlxuXHRcdC8vIE90aGVyd2lzZSwgb3BlbiB0aGUgdmlldy5cblx0XHRpZiAoIXRoaXMubW9kZSB8fCAhY2hhdFdpZGdldCB8fCAhaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudChjaGF0V2lkZ2V0LmRvbU5vZGUpKSB7XG5cdFx0XHRjaGF0V2lkZ2V0ID0gYXdhaXQgd2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKTtcblx0XHR9XG5cblx0XHRpZiAoIWNoYXRXaWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzd2l0Y2hUb01vZGUgPSBvcHRzPy5tb2RlID8gY2hhdFdpZGdldC5pbnB1dC5jdXJyZW50Q2hhdE1vZGVzT2JzLmdldCgpLmZpbmRNb2RlQnlOYW1lKG9wdHMubW9kZSkgOiB0aGlzLm1vZGU7XG5cdFx0aWYgKHN3aXRjaFRvTW9kZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5oYW5kbGVTd2l0Y2hUb01vZGUoc3dpdGNoVG9Nb2RlLCBjaGF0V2lkZ2V0LCBpbnN0YVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRpZiAob3B0cz8ubW9kZWxTZWxlY3Rvcikge1xuXHRcdFx0Y29uc3QgaWRzID0gYXdhaXQgbGFuZ3VhZ2VNb2RlbFNlcnZpY2Uuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMob3B0cy5tb2RlbFNlbGVjdG9yKTtcblx0XHRcdGNvbnN0IGlkID0gaWRzLnNvcnQoKS5hdCgwKTtcblx0XHRcdGlmICghaWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBsYW5ndWFnZSBtb2RlbHMgZm91bmQgbWF0Y2hpbmcgc2VsZWN0b3I6ICR7SlNPTi5zdHJpbmdpZnkob3B0cy5tb2RlbFNlbGVjdG9yKX0uYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gbGFuZ3VhZ2VNb2RlbFNlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChpZCk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTGFuZ3VhZ2UgbW9kZWwgbm90IGxvYWRlZDogJHtpZH0uYCk7XG5cdFx0XHR9XG5cblx0XHRcdGNoYXRXaWRnZXQuaW5wdXQuc2V0Q3VycmVudExhbmd1YWdlTW9kZWwoeyBtZXRhZGF0YTogbW9kZWwsIGlkZW50aWZpZXI6IGlkIH0sIHRydWUpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRzPy50b29sc0luY2x1ZGUgfHwgb3B0cz8udG9vbHNFeGNsdWRlKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNoYXRXaWRnZXQuaW5wdXQuc2VsZWN0ZWRMYW5ndWFnZU1vZGVsLmdldCgpPy5tZXRhZGF0YTtcblx0XHRcdGNvbnN0IGFsbFRvb2xzID0gQXJyYXkuZnJvbSh0b29sc1NlcnZpY2UuZ2V0VG9vbHMobW9kZWwpKTtcblx0XHRcdGNvbnN0IGFsbFRvb2xTZXRzID0gQXJyYXkuZnJvbSh0b29sc1NlcnZpY2UuZ2V0VG9vbFNldHNGb3JNb2RlbChtb2RlbCkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlVG9vbEVuYWJsZW1lbnRNYXAoe1xuXHRcdFx0XHRhbGxUb29scyxcblx0XHRcdFx0YWxsVG9vbFNldHMsXG5cdFx0XHRcdHRvb2xzSW5jbHVkZTogb3B0cy50b29sc0luY2x1ZGUsXG5cdFx0XHRcdHRvb2xzRXhjbHVkZTogb3B0cy50b29sc0V4Y2x1ZGUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIHJlc3VsdC51bmtub3duSWRlbnRpZmllcnMpIHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKGBUb29sIGZpbHRlcmluZzogVW5rbm93biBpZGVudGlmaWVyICcke2lkZW50aWZpZXJ9JyAtIG5vIG1hdGNoaW5nIHRvb2wgb3IgdG9vbHNldCBmb3VuZC5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y2hhdFdpZGdldC5pbnB1dC5zZWxlY3RlZFRvb2xzTW9kZWwuc2V0KHJlc3VsdC5lbmFibGVtZW50TWFwLCB0cnVlKTtcblx0XHR9XG5cblx0XHRpZiAob3B0cz8ucHJldmlvdXNSZXF1ZXN0cz8ubGVuZ3RoICYmIGNoYXRXaWRnZXQudmlld01vZGVsKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgcmVxdWVzdCwgcmVzcG9uc2UgfSBvZiBvcHRzLnByZXZpb3VzUmVxdWVzdHMpIHtcblx0XHRcdFx0Y2hhdFNlcnZpY2UuYWRkQ29tcGxldGVSZXF1ZXN0KGNoYXRXaWRnZXQudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdCwgdW5kZWZpbmVkLCAwLCB7IG1lc3NhZ2U6IHJlc3BvbnNlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAob3B0cz8uYXR0YWNoU2NyZWVuc2hvdCkge1xuXHRcdFx0Y29uc3Qgc2NyZWVuc2hvdCA9IGF3YWl0IGhvc3RTZXJ2aWNlLmdldFNjcmVlbnNob3QoKTtcblx0XHRcdGlmIChzY3JlZW5zaG90KSB7XG5cdFx0XHRcdGNoYXRXaWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoY29udmVydEJ1ZmZlclRvU2NyZWVuc2hvdFZhcmlhYmxlKHNjcmVlbnNob3QpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG9wdHM/LmF0dGFjaEZpbGVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2Ygb3B0cy5hdHRhY2hGaWxlcykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBmaWxlIGluc3RhbmNlb2YgVVJJID8gZmlsZSA6IGZpbGUudXJpO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IGZpbGUgaW5zdGFuY2VvZiBVUkkgPyB1bmRlZmluZWQgOiBmaWxlLnJhbmdlO1xuXG5cdFx0XHRcdGlmIChhd2FpdCBmaWxlU2VydmljZS5leGlzdHModXJpKSkge1xuXHRcdFx0XHRcdGNoYXRXaWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUodXJpLCByYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG9wdHM/LmF0dGFjaEhpc3RvcnlJdGVtQ2hhbmdlcykge1xuXHRcdFx0Zm9yIChjb25zdCBoaXN0b3J5SXRlbUNoYW5nZSBvZiBvcHRzLmF0dGFjaEhpc3RvcnlJdGVtQ2hhbmdlcykge1xuXHRcdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gc2NtU2VydmljZS5nZXRSZXBvc2l0b3J5KFVSSS5maWxlKGhpc3RvcnlJdGVtQ2hhbmdlLnVyaS5wYXRoKSk7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHJlcG9zaXRvcnk/LnByb3ZpZGVyLmhpc3RvcnlQcm92aWRlci5nZXQoKTtcblx0XHRcdFx0aWYgKCFoaXN0b3J5UHJvdmlkZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gYXdhaXQgaGlzdG9yeVByb3ZpZGVyLnJlc29sdmVIaXN0b3J5SXRlbShoaXN0b3J5SXRlbUNoYW5nZS5oaXN0b3J5SXRlbUlkKTtcblx0XHRcdFx0aWYgKCFoaXN0b3J5SXRlbSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCh7XG5cdFx0XHRcdFx0aWQ6IGhpc3RvcnlJdGVtQ2hhbmdlLnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6IGAke2Jhc2VuYW1lKGhpc3RvcnlJdGVtQ2hhbmdlLnVyaSl9YCxcblx0XHRcdFx0XHR2YWx1ZTogaGlzdG9yeUl0ZW1DaGFuZ2UudXJpLFxuXHRcdFx0XHRcdGhpc3RvcnlJdGVtOiBoaXN0b3J5SXRlbSxcblx0XHRcdFx0XHRraW5kOiAnc2NtSGlzdG9yeUl0ZW1DaGFuZ2UnXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAob3B0cz8uYXR0YWNoSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZXMpIHtcblx0XHRcdGZvciAoY29uc3QgaGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZSBvZiBvcHRzLmF0dGFjaEhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBzY21TZXJ2aWNlLmdldFJlcG9zaXRvcnkoVVJJLmZpbGUoaGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZS5lbmQudXJpLnBhdGgpKTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeT8ucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdFx0XHRpZiAoIXJlcG9zaXRvcnkgfHwgIWhpc3RvcnlQcm92aWRlcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgW2hpc3RvcnlJdGVtU3RhcnQsIGhpc3RvcnlJdGVtRW5kXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRoaXN0b3J5UHJvdmlkZXIucmVzb2x2ZUhpc3RvcnlJdGVtKGhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2Uuc3RhcnQuaGlzdG9yeUl0ZW1JZCksXG5cdFx0XHRcdFx0aGlzdG9yeVByb3ZpZGVyLnJlc29sdmVIaXN0b3J5SXRlbShoaXN0b3J5SXRlbUNoYW5nZVJhbmdlLmVuZC5oaXN0b3J5SXRlbUlkKSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGlmICghaGlzdG9yeUl0ZW1TdGFydCB8fCAhaGlzdG9yeUl0ZW1FbmQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHVyaSA9IGhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2UuZW5kLnVyaS53aXRoKHtcblx0XHRcdFx0XHRzY2hlbWU6IFNDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VDb250ZW50UHJvdmlkZXIuc2NoZW1lLFxuXHRcdFx0XHRcdHF1ZXJ5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0XHRyZXBvc2l0b3J5SWQ6IHJlcG9zaXRvcnkuaWQsXG5cdFx0XHRcdFx0XHRzdGFydDogaGlzdG9yeUl0ZW1TdGFydC5pZCxcblx0XHRcdFx0XHRcdGVuZDogaGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZS5lbmQuaGlzdG9yeUl0ZW1JZFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIFNjbUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VVcmlGaWVsZHMpXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNoYXRXaWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoe1xuXHRcdFx0XHRcdGlkOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRuYW1lOiBgJHtiYXNlbmFtZSh1cmkpfWAsXG5cdFx0XHRcdFx0dmFsdWU6IHVyaSxcblx0XHRcdFx0XHRoaXN0b3J5SXRlbUNoYW5nZVN0YXJ0OiB7XG5cdFx0XHRcdFx0XHR1cmk6IGhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2Uuc3RhcnQudXJpLFxuXHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW06IGhpc3RvcnlJdGVtU3RhcnRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGhpc3RvcnlJdGVtQ2hhbmdlRW5kOiB7XG5cdFx0XHRcdFx0XHR1cmk6IGhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2UuZW5kLnVyaSxcblx0XHRcdFx0XHRcdGhpc3RvcnlJdGVtOiB7XG5cdFx0XHRcdFx0XHRcdC4uLmhpc3RvcnlJdGVtRW5kLFxuXHRcdFx0XHRcdFx0XHRkaXNwbGF5SWQ6IGhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2UuZW5kLmhpc3RvcnlJdGVtSWRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGtpbmQ6ICdzY21IaXN0b3J5SXRlbUNoYW5nZVJhbmdlJ1xuXHRcdFx0XHR9IHNhdGlzZmllcyBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZVZhcmlhYmxlRW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCByZXNwOiBQcm9taXNlPElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAob3B0cz8ucXVlcnkpIHtcblxuXHRcdFx0aWYgKG9wdHMuaXNQYXJ0aWFsUXVlcnkpIHtcblx0XHRcdFx0Y2hhdFdpZGdldC5pbnB1dC5zaG93U2Nyb2xsYmFyVW50aWxBY2NlcHQoKTtcblx0XHRcdFx0Y2hhdFdpZGdldC5zZXRJbnB1dChvcHRzLnF1ZXJ5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghY2hhdFdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UoY2hhdFdpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgd2FpdEZvckRlZmF1bHRBZ2VudChjaGF0QWdlbnRTZXJ2aWNlLCBjaGF0V2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZCk7XG5cdFx0XHRcdGlmIChvcHRzLnByZXNlcnZlSW5wdXQpIHtcblx0XHRcdFx0XHQvLyBTdWJtaXQgdGhlIHF1ZXJ5IGRpcmVjdGx5IHNvIHRoZSB1c2VyJ3MgZHJhZnQgaXMgbmV2ZXIgb3ZlcndyaXR0ZW4uXG5cdFx0XHRcdFx0cmVzcCA9IGNoYXRXaWRnZXQuYWNjZXB0SW5wdXQob3B0cy5xdWVyeSwgeyBwcmVzZXJ2ZUlucHV0OiB0cnVlIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNoYXRXaWRnZXQuc2V0SW5wdXQob3B0cy5xdWVyeSk7IC8vIHdhaXQgdW50aWwgdGhlIG1vZGVsIGlzIHJlc3RvcmVkIGJlZm9yZSBzZXR0aW5nIHRoZSBpbnB1dCwgb3IgaXQgd2lsbCBiZSBjbGVhcmVkIHdoZW4gdGhlIG1vZGVsIGlzIHJlc3RvcmVkXG5cdFx0XHRcdFx0cmVzcCA9IGNoYXRXaWRnZXQuYWNjZXB0SW5wdXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvcHRzPy50b29sSWRzICYmIG9wdHMudG9vbElkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2xJZCBvZiBvcHRzLnRvb2xJZHMpIHtcblx0XHRcdFx0Y29uc3QgdG9vbCA9IHRvb2xzU2VydmljZS5nZXRUb29sKHRvb2xJZCk7XG5cdFx0XHRcdGlmICh0b29sKSB7XG5cdFx0XHRcdFx0Y2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCh7XG5cdFx0XHRcdFx0XHRpZDogdG9vbC5pZCxcblx0XHRcdFx0XHRcdG5hbWU6IHRvb2wuZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRmdWxsTmFtZTogdG9vbC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdHZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRpY29uOiBUaGVtZUljb24uaXNUaGVtZUljb24odG9vbC5pY29uKSA/IHRvb2wuaWNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGtpbmQ6ICd0b29sJ1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y2hhdFdpZGdldC5mb2N1c0lucHV0KCk7XG5cblx0XHRpZiAob3B0cz8uYmxvY2tPblJlc3BvbnNlKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHJlc3A7XG5cdFx0XHRpZiAocmVzcG9uc2UpIHtcblx0XHRcdFx0Y29uc3QgYXV0b1JlcGx5RW5hYmxlZCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkF1dG9SZXBseSk7XG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGQgPSByZXNwb25zZS5vbkRpZENoYW5nZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAocmVzcG9uc2UuaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IHBlbmRpbmdDb25maXJtYXRpb24gPSByZXNwb25zZS5pc1BlbmRpbmdDb25maXJtYXRpb24uZ2V0KCk7XG5cdFx0XHRcdFx0XHRpZiAocGVuZGluZ0NvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgcGVuZGluZyBjb25maXJtYXRpb24gaXMgYSBxdWVzdGlvbiBjYXJvdXNlbCB0aGF0IHdpbGwgYmUgYXV0by1yZXBsaWVkLlxuXHRcdFx0XHRcdFx0XHQvLyBPbmx5IHF1ZXN0aW9uIGNhcm91c2VscyBhcmUgYXV0by1yZXBsaWVkOyBvdGhlciBjb25maXJtYXRpb24gdHlwZXMgKHRvb2wgYXBwcm92YWxzLFxuXHRcdFx0XHRcdFx0XHQvLyBlbGljaXRhdGlvbnMsIGV0Yy4pIHNob3VsZCBjYXVzZSB1cyB0byByZXNvbHZlIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHRcdFx0XHRjb25zdCBoYXNQZW5kaW5nUXVlc3Rpb25DYXJvdXNlbCA9IHJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlLnNvbWUoXG5cdFx0XHRcdFx0XHRcdFx0cGFydCA9PiBwYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJyAmJiAhcGFydC5pc1VzZWRcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0aWYgKGF1dG9SZXBseUVuYWJsZWQgJiYgaGFzUGVuZGluZ1F1ZXN0aW9uQ2Fyb3VzZWwpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBBdXRvLXJlcGx5IHdpbGwgaGFuZGxlIHRoaXMgcXVlc3Rpb24gY2Fyb3VzZWwsIGtlZXAgd2FpdGluZ1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjb25maXJtYXRpb25JbmZvID0gZ2V0UGVuZGluZ0NvbmZpcm1hdGlvbkluZm8ocmVzcG9uc2UpO1xuXHRcdFx0XHRpZiAoY29uZmlybWF0aW9uSW5mbykge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLnJlc3BvbnNlLnJlc3VsdCwgLi4uY29uZmlybWF0aW9uSW5mbyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IC4uLnJlc3BvbnNlLnJlc3VsdCB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVN3aXRjaFRvTW9kZShzd2l0Y2hUb01vZGU6IElDaGF0TW9kZSwgY2hhdFdpZGdldDogSUNoYXRXaWRnZXQsIGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3VycmVudE1vZGUgPSBjaGF0V2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZDtcblxuXHRcdGlmIChzd2l0Y2hUb01vZGUpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY2hhdFdpZGdldC52aWV3TW9kZWw/Lm1vZGVsO1xuXHRcdFx0Y29uc3QgY2hhdE1vZGVDaGVjayA9IG1vZGVsID8gYXdhaXQgaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGhhbmRsZU1vZGVTd2l0Y2gsIGN1cnJlbnRNb2RlLCBzd2l0Y2hUb01vZGUua2luZCwgbW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGgsIG1vZGVsKSA6IHsgbmVlZFRvQ2xlYXJTZXNzaW9uOiBmYWxzZSB9O1xuXHRcdFx0aWYgKCFjaGF0TW9kZUNoZWNrKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNoYXRXaWRnZXQuaW5wdXQuc2V0Q2hhdE1vZGUoc3dpdGNoVG9Nb2RlLmlkLCB0cnVlLCB0cnVlKTtcblxuXHRcdFx0aWYgKGNoYXRNb2RlQ2hlY2submVlZFRvQ2xlYXJTZXNzaW9uKSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFDVElPTl9JRF9ORVdfQ0hBVCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JEZWZhdWx0QWdlbnQoY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsIG1vZGU6IENoYXRNb2RlS2luZCk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBkZWZhdWx0QWdlbnQgPSBjaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBtb2RlKTtcblx0aWYgKGRlZmF1bHRBZ2VudCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0RXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihjaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0QWdlbnQgPSBjaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBtb2RlKTtcblx0XHRcdHJldHVybiBCb29sZWFuKGRlZmF1bHRBZ2VudCk7XG5cdFx0fSkpLFxuXHRcdHRpbWVvdXQoNjBfMDAwKS50aGVuKCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdUaW1lZCBvdXQgd2FpdGluZyBmb3IgZGVmYXVsdCBhZ2VudCcpOyB9KVxuXHRdKTtcbn1cblxuLyoqXG4gKiBJbmZvcm1hdGlvbiBhYm91dCBhIHBlbmRpbmcgY29uZmlybWF0aW9uIGluIGEgY2hhdCByZXNwb25zZS5cbiAqL1xuZXhwb3J0IHR5cGUgSUNoYXRQZW5kaW5nQ29uZmlybWF0aW9uSW5mbyA9XG5cdHwgeyB0eXBlOiAnY29uZmlybWF0aW9uJzsga2luZDogJ3Rvb2xJbnZvY2F0aW9uJzsgdG9vbElkOiBzdHJpbmcgfVxuXHR8IHsgdHlwZTogJ2NvbmZpcm1hdGlvbic7IGtpbmQ6ICd0b29sUG9zdEFwcHJvdmFsJzsgdG9vbElkOiBzdHJpbmcgfVxuXHR8IHsgdHlwZTogJ2NvbmZpcm1hdGlvbic7IGtpbmQ6ICdjb25maXJtYXRpb24nOyB0aXRsZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1cblx0fCB7IHR5cGU6ICdjb25maXJtYXRpb24nOyBraW5kOiAncXVlc3Rpb25DYXJvdXNlbCc7IHF1ZXN0aW9uczogdW5rbm93bltdIH1cblx0fCB7IHR5cGU6ICdjb25maXJtYXRpb24nOyBraW5kOiAnZWxpY2l0YXRpb24nOyB0aXRsZTogc3RyaW5nIH07XG5cbi8qKlxuICogRXh0cmFjdHMgZGV0YWlsZWQgaW5mb3JtYXRpb24gYWJvdXQgdGhlIHBlbmRpbmcgY29uZmlybWF0aW9uIGZyb20gYSBjaGF0IHJlc3BvbnNlLlxuICogUmV0dXJucyB1bmRlZmluZWQgaWYgdGhlcmUgaXMgbm8gcGVuZGluZyBjb25maXJtYXRpb24uXG4gKi9cbmZ1bmN0aW9uIGdldFBlbmRpbmdDb25maXJtYXRpb25JbmZvKHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWwpOiBJQ2hhdFBlbmRpbmdDb25maXJtYXRpb25JbmZvIHwgdW5kZWZpbmVkIHtcblx0Zm9yIChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlKSB7XG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBwYXJ0LnN0YXRlLmdldCgpO1xuXHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAnY29uZmlybWF0aW9uJyxcblx0XHRcdFx0XHRraW5kOiAndG9vbEludm9jYXRpb24nLFxuXHRcdFx0XHRcdHRvb2xJZDogcGFydC50b29sSWQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0XHRcdGtpbmQ6ICd0b29sUG9zdEFwcHJvdmFsJyxcblx0XHRcdFx0XHR0b29sSWQ6IHBhcnQudG9vbElkLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocGFydC5raW5kID09PSAnY29uZmlybWF0aW9uJyAmJiAhcGFydC5pc1VzZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0XHRraW5kOiAnY29uZmlybWF0aW9uJyxcblx0XHRcdFx0dGl0bGU6IHBhcnQudGl0bGUsXG5cdFx0XHRcdGRhdGE6IHBhcnQuZGF0YSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJyAmJiAhcGFydC5pc1VzZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsXG5cdFx0XHRcdHF1ZXN0aW9uczogcGFydC5xdWVzdGlvbnMsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAocGFydC5raW5kID09PSAnZWxpY2l0YXRpb24yJyAmJiBwYXJ0LnN0YXRlLmdldCgpID09PSBFbGljaXRhdGlvblN0YXRlLlBlbmRpbmcpIHtcblx0XHRcdGNvbnN0IHRpdGxlID0gcGFydC50aXRsZTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0XHRraW5kOiAnZWxpY2l0YXRpb24nLFxuXHRcdFx0XHR0aXRsZTogdHlwZW9mIHRpdGxlID09PSAnc3RyaW5nJyA/IHRpdGxlIDogdGl0bGUudmFsdWUsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBQcmltYXJ5T3BlbkNoYXRHbG9iYWxBY3Rpb24gZXh0ZW5kcyBPcGVuQ2hhdEdsb2JhbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDSEFUX09QRU5fQUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkNoYXQnLCBcIk9wZW4gQ2hhdFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5SSxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5SVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRncm91cDogJ2Ffb3BlbicsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRPcGVuQ2hhdEFjdGlvbklkRm9yTW9kZShtb2RlOiBJQ2hhdE1vZGUpOiBzdHJpbmcge1xuXHRyZXR1cm4gYHdvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuJHttb2RlLm5hbWUuZ2V0KCl9YDtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE1vZGVPcGVuQ2hhdEdsb2JhbEFjdGlvbiBleHRlbmRzIE9wZW5DaGF0R2xvYmFsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IobW9kZTogSUNoYXRNb2RlLCBrZXliaW5kaW5nPzogSUNvbW1hbmRQYWxldHRlT3B0aW9uc1sna2V5YmluZGluZyddKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGdldE9wZW5DaGF0QWN0aW9uSWRGb3JNb2RlKG1vZGUpLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkNoYXRNb2RlJywgXCJPcGVuIENoYXQgKHswfSlcIiwgbW9kZS5sYWJlbC5nZXQoKSksXG5cdFx0XHRrZXliaW5kaW5nXG5cdFx0fSwgbW9kZSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ2hhdEFjdGlvbnMoKSB7XG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBzZXNzaW9uIFVSSSB0byB1c2Ugd2hlbiBvcGVuaW5nIGEgYnJhbmQtbmV3IGNoYXQgZWRpdG9yLFxuXHQgKiBob25vcmluZyB0aGUgcmVtZW1iZXJlZCBoYXJuZXNzIHByZWZlcmVuY2UgYW5kIHRoZW4gdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdC5cblx0ICovXG5cdGZ1bmN0aW9uIGdldE5ld0NoYXRFZGl0b3JTZXNzaW9uVXJpKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogVVJJIHtcblx0XHRyZXR1cm4gZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uUmVzb3VyY2UoYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSksIGFjY2Vzc29yLmdldChJQ2hhdFNlc3Npb25zU2VydmljZSksIGFjY2Vzc29yLmdldChJU3RvcmFnZVNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKS5nZXRXb3Jrc3BhY2UoKSwgYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSkuZW5hYmxlZC5nZXQoKSk7XG5cdH1cblxuXHRyZWdpc3RlckFjdGlvbjIoUHJpbWFyeU9wZW5DaGF0R2xvYmFsQWN0aW9uKTtcblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTW9kZU9wZW5DaGF0R2xvYmFsQWN0aW9uIHtcblx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoQ2hhdE1vZGUuQXNrKTsgfVxuXHR9KTtcblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTW9kZU9wZW5DaGF0R2xvYmFsQWN0aW9uIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKENoYXRNb2RlLkFnZW50LCB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmhhcyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkfWApLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUksXG5cdFx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlJXG5cdFx0XHRcdH1cblx0XHRcdH0sKTtcblx0XHR9XG5cdH0pO1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBNb2RlT3BlbkNoYXRHbG9iYWxBY3Rpb24ge1xuXHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihDaGF0TW9kZS5FZGl0KTsgfVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlQ2hhdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogVE9HR0xFX0NIQVRfQUNUSU9OX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0b2dnbGVDaGF0JywgXCJUb2dnbGUgQ2hhdFwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUllcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0Y29uc3QgbGF5b3V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdEZXNjcmlwdG9yU2VydmljZSk7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGNoYXRMb2NhdGlvbiA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKENoYXRWaWV3SWQpO1xuXHRcdFx0Y29uc3QgY2hhdFZpc2libGUgPSB2aWV3c1NlcnZpY2UuaXNWaWV3VmlzaWJsZShDaGF0Vmlld0lkKTtcblx0XHRcdGlmIChjaGF0VmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVBhcnRWaXNpYmlsaXR5KGxheW91dFNlcnZpY2UsIGNoYXRMb2NhdGlvbiwgZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy51cGRhdGVQYXJ0VmlzaWJpbGl0eShsYXlvdXRTZXJ2aWNlLCBjaGF0TG9jYXRpb24sIHRydWUpO1xuXHRcdFx0XHQoYXdhaXQgd2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKSk/LmZvY3VzSW5wdXQoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRwcml2YXRlIHVwZGF0ZVBhcnRWaXNpYmlsaXR5KGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIHwgbnVsbCwgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdFx0bGV0IHBhcnQ6IFBhcnRzLlBBTkVMX1BBUlQgfCBQYXJ0cy5TSURFQkFSX1BBUlQgfCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCB8IHVuZGVmaW5lZDtcblx0XHRcdHN3aXRjaCAobG9jYXRpb24pIHtcblx0XHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWw6XG5cdFx0XHRcdFx0cGFydCA9IFBhcnRzLlBBTkVMX1BBUlQ7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXI6XG5cdFx0XHRcdFx0cGFydCA9IFBhcnRzLlNJREVCQVJfUEFSVDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyOlxuXHRcdFx0XHRcdHBhcnQgPSBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBhcnQpIHtcblx0XHRcdFx0bGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKCF2aXNpYmxlLCBwYXJ0KTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5ld0NoYXRFZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEFDVElPTl9JRF9PUEVOX0NIQVQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuJywgXCJOZXcgQ2hhdCBFZGl0b3JcIiksXG5cdFx0XHRcdGljb246IENvZGljb24ucGx1cyxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleU4sXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuaW5DaGF0RWRpdG9yKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpdGxlQmFyTWVudSxcblx0XHRcdFx0XHRncm91cDogJ2JfbmV3Jyxcblx0XHRcdFx0XHRvcmRlcjogMFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TmV3TWVudSxcblx0XHRcdFx0XHRncm91cDogJzJfbmV3Jyxcblx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhDaGF0RWRpdG9ySW5wdXQuRWRpdG9ySUQpLCBDaGF0Q29udGV4dEtleXMubmV3Q2hhdEJ1dHRvbkV4cGVyaW1lbnRJY29uLm5vdEVxdWFsc1RvKCdjb3BpbG90JyksIENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24ubm90RXF1YWxzVG8oJ25ldy1zZXNzaW9uJyksIENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24ubm90RXF1YWxzVG8oJ2NvbW1lbnQnKSksXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IHdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24oZ2V0TmV3Q2hhdEVkaXRvclNlc3Npb25VcmkoYWNjZXNzb3IpLCBBQ1RJVkVfR1JPVVAsIHsgcGlubmVkOiB0cnVlIH0gc2F0aXNmaWVzIElDaGF0RWRpdG9yT3B0aW9ucyk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3Q2hhdEVkaXRvckNvcGlsb3RJY29uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBBQ1RJT05fSURfT1BFTl9DSEFUICsgJy5jb3BpbG90SWNvbicsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuJywgXCJOZXcgQ2hhdCBFZGl0b3JcIiksXG5cdFx0XHRcdGljb246IENvZGljb24uY29waWxvdCxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKENoYXRFZGl0b3JJbnB1dC5FZGl0b3JJRCksIENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24uaXNFcXVhbFRvKCdjb3BpbG90JykpLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRhd2FpdCB3aWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKGdldE5ld0NoYXRFZGl0b3JTZXNzaW9uVXJpKGFjY2Vzc29yKSwgQUNUSVZFX0dST1VQLCB7IHBpbm5lZDogdHJ1ZSB9IHNhdGlzZmllcyBJQ2hhdEVkaXRvck9wdGlvbnMpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5ld0NoYXRFZGl0b3JOZXdTZXNzaW9uSWNvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogQUNUSU9OX0lEX09QRU5fQ0hBVCArICcubmV3U2Vzc2lvbkljb24nLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24ub3BlbicsIFwiTmV3IENoYXQgRWRpdG9yXCIpLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLm5ld1Nlc3Npb24sXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhDaGF0RWRpdG9ySW5wdXQuRWRpdG9ySUQpLCBDaGF0Q29udGV4dEtleXMubmV3Q2hhdEJ1dHRvbkV4cGVyaW1lbnRJY29uLmlzRXF1YWxUbygnbmV3LXNlc3Npb24nKSksXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IHdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24oZ2V0TmV3Q2hhdEVkaXRvclNlc3Npb25VcmkoYWNjZXNzb3IpLCBBQ1RJVkVfR1JPVVAsIHsgcGlubmVkOiB0cnVlIH0gc2F0aXNmaWVzIElDaGF0RWRpdG9yT3B0aW9ucyk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3Q2hhdEVkaXRvckNvbW1lbnRJY29uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBBQ1RJT05fSURfT1BFTl9DSEFUICsgJy5jb21tZW50SWNvbicsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuJywgXCJOZXcgQ2hhdCBFZGl0b3JcIiksXG5cdFx0XHRcdGljb246IENvZGljb24uY29tbWVudCxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKENoYXRFZGl0b3JJbnB1dC5FZGl0b3JJRCksIENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24uaXNFcXVhbFRvKCdjb21tZW50JykpLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRhd2FpdCB3aWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKGdldE5ld0NoYXRFZGl0b3JTZXNzaW9uVXJpKGFjY2Vzc29yKSwgQUNUSVZFX0dST1VQLCB7IHBpbm5lZDogdHJ1ZSB9IHNhdGlzZmllcyBJQ2hhdEVkaXRvck9wdGlvbnMpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5ld0NoYXRFZGl0b3JUb1NpZGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5DaGF0VG9TaWRlJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLm9wZW5Ub1NpZGUnLCBcIk5ldyBDaGF0IEVkaXRvciB0byB0aGUgU2lkZVwiKSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRhd2FpdCB3aWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKGdldE5ld0NoYXRFZGl0b3JTZXNzaW9uVXJpKGFjY2Vzc29yKSwgU0lERV9HUk9VUCwgeyBwaW5uZWQ6IHRydWUgfSBzYXRpc2ZpZXMgSUNoYXRFZGl0b3JPcHRpb25zKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXdDaGF0V2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5uZXdDaGF0V2luZG93YCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLm5ld0NoYXRXaW5kb3cnLCBcIk5ldyBDaGF0IFdpbmRvd1wiKSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpdGxlQmFyTWVudSxcblx0XHRcdFx0XHRncm91cDogJ2JfbmV3Jyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TmV3TWVudSxcblx0XHRcdFx0XHRncm91cDogJzJfbmV3Jyxcblx0XHRcdFx0XHRvcmRlcjogM1xuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRhd2FpdCB3aWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKGdldE5ld0NoYXRFZGl0b3JTZXNzaW9uVXJpKGFjY2Vzc29yKSwgQVVYX1dJTkRPV19HUk9VUCwgeyBwaW5uZWQ6IHRydWUsIGF1eGlsaWFyeTogeyBjb21wYWN0OiB0cnVlLCBib3VuZHM6IHsgd2lkdGg6IDY0MCwgaGVpZ2h0OiA2NDAgfSB9IH0gc2F0aXNmaWVzIElDaGF0RWRpdG9yT3B0aW9ucyk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xlYXJDaGF0SW5wdXRIaXN0b3J5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNsZWFySW5wdXRIaXN0b3J5Jyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLmNsZWFySGlzdG9yeS5sYWJlbCcsIFwiQ2xlYXIgSW5wdXQgSGlzdG9yeVwiKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlKTtcblx0XHRcdGhpc3RvcnlTZXJ2aWNlLmNsZWFySGlzdG9yeSgpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzQ2hhdEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2NoYXQuYWN0aW9uLmZvY3VzJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWN0aW9ucy5pbnRlcmFjdGl2ZVNlc3Npb24uZm9jdXMnLCAnRm9jdXMgQ2hhdCBMaXN0JyksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdFx0Ly8gT24gbWFjLCByZXF1aXJlIHRoYXQgdGhlIGN1cnNvciBpcyBhdCB0aGUgdG9wIG9mIHRoZSBpbnB1dCwgdG8gYXZvaWQgc3RlYWxpbmcgY21kK3VwIHRvIG1vdmUgdGhlIGN1cnNvciB0byB0aGUgdG9wXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbnB1dEN1cnNvckF0VG9wLCBDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQubmVnYXRlKCkpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdC8vIE9uIHdpbi9saW51eCwgY3RybCt1cCBjYW4gYWx3YXlzIGZvY3VzIHRoZSBjaGF0IGxpc3Rcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoSXNXaW5kb3dzQ29udGV4dCwgSXNMaW51eENvbnRleHQpLCBDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQubmVnYXRlKCkpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbiwgQ2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0KSxcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBlZGl0b3JVcmkgPSBlZGl0b3IuZ2V0TW9kZWwoKT8udXJpO1xuXHRcdFx0aWYgKGVkaXRvclVyaSkge1xuXHRcdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRcdHdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShlZGl0b3JVcmkpPy5mb2N1c1Jlc3BvbnNlSXRlbSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzTW9zdFJlY2VudGx5Rm9jdXNlZENoYXRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guY2hhdC5hY3Rpb24uZm9jdXNMYXN0Rm9jdXNlZCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2FjdGlvbnMuaW50ZXJhY3RpdmVTZXNzaW9uLmZvY3VzTGFzdEZvY3VzZWQnLCAnRm9jdXMgTGFzdCBGb2N1c2VkIENoYXQgTGlzdCBJdGVtJyksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdFx0Ly8gT24gbWFjLCByZXF1aXJlIHRoYXQgdGhlIGN1cnNvciBpcyBhdCB0aGUgdG9wIG9mIHRoZSBpbnB1dCwgdG8gYXZvaWQgc3RlYWxpbmcgY21kK3VwIHRvIG1vdmUgdGhlIGN1cnNvciB0byB0aGUgdG9wXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbnB1dEN1cnNvckF0VG9wLCBDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQubmVnYXRlKCkpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3cgfCBLZXlNb2QuU2hpZnQsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDEsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQvLyBPbiB3aW4vbGludXgsIGN0cmwrdXAgY2FuIGFsd2F5cyBmb2N1cyB0aGUgY2hhdCBsaXN0XG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLm9yKElzV2luZG93c0NvbnRleHQsIElzTGludXhDb250ZXh0KSwgQ2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0Lm5lZ2F0ZSgpKSxcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93IHwgS2V5TW9kLlNoaWZ0LFxuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyAxLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyB8IEtleU1vZC5TaGlmdCxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBlZGl0b3JVcmkgPSBlZGl0b3IuZ2V0TW9kZWwoKT8udXJpO1xuXHRcdFx0aWYgKGVkaXRvclVyaSkge1xuXHRcdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRcdHdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShlZGl0b3JVcmkpPy5mb2N1c1Jlc3BvbnNlSXRlbSh0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c0NoYXRJbnB1dEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5mb2N1c0lucHV0Jyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLmZvY3VzSW5wdXQubGFiZWwnLCBcIkZvY3VzIENoYXQgSW5wdXRcIiksXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0a2V5YmluZGluZzogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbiwgQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0Lm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQubmVnYXRlKCkpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdCksXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHR3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0Py5mb2N1c0lucHV0KCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNUb2Rvc1ZpZXdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmZvY3VzVG9kb3NWaWV3JztcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogRm9jdXNUb2Rvc1ZpZXdBY3Rpb24uSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5mb2N1c1RvZG9zVmlldy5sYWJlbCcsIFwiVG9nZ2xlIEZvY3VzIEJldHdlZW4gVE9ET3MgYW5kIElucHV0XCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFnZW50KSxcblx0XHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVQsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0LCBDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0VG9kb0xpc3QsIENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQuaXNFcXVhbFRvKENoYXRNb2RlS2luZC5BZ2VudCkpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblxuXHRcdFx0aWYgKCF3aWRnZXQgfHwgIXdpZGdldC50b2dnbGVUb2Rvc1ZpZXdGb2N1cygpKSB7XG5cdFx0XHRcdGFsZXJ0KGxvY2FsaXplKCdjaGF0LnRvZG9MaXN0LmZvY3VzVW5hdmFpbGFibGUnLCBcIk5vIGFnZW50IHRvZG9zIHRvIGZvY3VzIHJpZ2h0IG5vdy5cIikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzUXVlc3Rpb25DYXJvdXNlbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZm9jdXNRdWVzdGlvbkNhcm91c2VsJztcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogRm9jdXNRdWVzdGlvbkNhcm91c2VsQWN0aW9uLklELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24uZm9jdXNRdWVzdGlvbkNhcm91c2VsLmxhYmVsJywgXCJDaGF0OiBUb2dnbGUgRm9jdXMgQmV0d2VlbiBRdWVzdGlvbiBhbmQgSW5wdXRcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbixcblx0XHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5QSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIENoYXRDb250ZXh0S2V5cy5FZGl0aW5nLmhhc1F1ZXN0aW9uQ2Fyb3VzZWwpLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXG5cdFx0XHRpZiAoIXdpZGdldCB8fCAhd2lkZ2V0LnRvZ2dsZVF1ZXN0aW9uQ2Fyb3VzZWxGb2N1cygpKSB7XG5cdFx0XHRcdGFsZXJ0KGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWwuZm9jdXNVbmF2YWlsYWJsZScsIFwiTm8gY2hhdCBxdWVzdGlvbiB0byBmb2N1cyByaWdodCBub3cuXCIpKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBQcmV2aW91c1F1ZXN0aW9uQ2Fyb3VzZWxRdWVzdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucHJldmlvdXNRdWVzdGlvbic7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IFByZXZpb3VzUXVlc3Rpb25DYXJvdXNlbFF1ZXN0aW9uQWN0aW9uLklELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24ucHJldmlvdXNRdWVzdGlvbi5sYWJlbCcsIFwiQ2hhdDogUHJldmlvdXMgUXVlc3Rpb25cIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIENoYXRDb250ZXh0S2V5cy5FZGl0aW5nLmhhc1F1ZXN0aW9uQ2Fyb3VzZWwpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVAsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRRdWVzdGlvbkNhcm91c2VsLCBDaGF0Q29udGV4dEtleXMuRWRpdGluZy5oYXNRdWVzdGlvbkNhcm91c2VsKSxcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0d2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldD8ubmF2aWdhdGVUb1ByZXZpb3VzUXVlc3Rpb24oKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXh0UXVlc3Rpb25DYXJvdXNlbFF1ZXN0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5uZXh0UXVlc3Rpb24nO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBOZXh0UXVlc3Rpb25DYXJvdXNlbFF1ZXN0aW9uQWN0aW9uLklELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24ubmV4dFF1ZXN0aW9uLmxhYmVsJywgXCJDaGF0OiBOZXh0IFF1ZXN0aW9uXCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuRWRpdGluZy5oYXNRdWVzdGlvbkNhcm91c2VsKSxcblx0XHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlOLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0UXVlc3Rpb25DYXJvdXNlbCwgQ2hhdENvbnRleHRLZXlzLkVkaXRpbmcuaGFzUXVlc3Rpb25DYXJvdXNlbCksXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ/Lm5hdmlnYXRlVG9OZXh0UXVlc3Rpb24oKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1F1ZXN0aW9uQ2Fyb3VzZWxUZXJtaW5hbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZm9jdXNRdWVzdGlvbkNhcm91c2VsVGVybWluYWwnO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBGb2N1c1F1ZXN0aW9uQ2Fyb3VzZWxUZXJtaW5hbEFjdGlvbi5JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLmZvY3VzUXVlc3Rpb25DYXJvdXNlbFRlcm1pbmFsLmxhYmVsJywgXCJDaGF0OiBGb2N1cyBUZXJtaW5hbCBmcm9tIFF1ZXN0aW9uIENhcm91c2VsXCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuRWRpdGluZy5oYXNRdWVzdGlvbkNhcm91c2VsLCBDaGF0Q29udGV4dEtleXMuY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxIYXNUZXJtaW5hbCksXG5cdFx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5VCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIENoYXRDb250ZXh0S2V5cy5FZGl0aW5nLmhhc1F1ZXN0aW9uQ2Fyb3VzZWwsIENoYXRDb250ZXh0S2V5cy5jaGF0UXVlc3Rpb25DYXJvdXNlbEhhc1Rlcm1pbmFsKSxcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0d2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldD8uZm9jdXNRdWVzdGlvbkNhcm91c2VsVGVybWluYWwoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c05vdGljZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdC8vIEtlcHQgYXMgYGZvY3VzVGlwYCBzbyBleGlzdGluZyBrZXliaW5kaW5ncyBhbmQgdXNlciBzZXR0aW5ncyBjb250aW51ZSB0byB3b3JrLlxuXHRcdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZm9jdXNUaXAnO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBGb2N1c05vdGljZUFjdGlvbi5JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLmZvY3VzTm90aWNlLmxhYmVsJywgXCJDaGF0OiBUb2dnbGUgRm9jdXMgQmV0d2VlbiBOb3RpY2UgYW5kIElucHV0XCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdC8vIFRoZSBBZ2VudHMgY29tcG9zZXIgaXMgbm90IGEgY2hhdCB3aWRnZXQsIHNvIGl0IG5ldmVyIHNldHNcblx0XHRcdFx0Ly8gYGluQ2hhdFNlc3Npb25gOyBpdCByZXBvcnRzIGl0cyBvd24gZm9jdXMgaW5zdGVhZC5cblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbiwgQ2hhdENvbnRleHRLZXlzLmluQ2hhdENvbXBvc2VyKSxcblx0XHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuU2xhc2gsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbixcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRUaXAsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0Q29tcG9zZXJcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHQvLyBSZXNvbHZlZCB0aHJvdWdoIHRoZSBub3RpY2UgaHViIHJhdGhlciB0aGFuIHRoZSBjaGF0IHdpZGdldCBzZXJ2aWNlIHNvXG5cdFx0XHQvLyB0aGlzIGFsc28gd29ya3MgaW4gdGhlIEFnZW50cyB3aW5kb3csIHdob3NlIGNvbXBvc2VyIGlzIG5vdCBhIGNoYXQgd2lkZ2V0LlxuXHRcdFx0aWYgKCFhY2Nlc3Nvci5nZXQoSUNoYXRJbnB1dE5vdGljZUh1YlNlcnZpY2UpLnRvZ2dsZU5vdGljZUZvY3VzKCkpIHtcblx0XHRcdFx0YWxlcnQobG9jYWxpemUoJ2NoYXQubm90aWNlLmZvY3VzVW5hdmFpbGFibGUnLCBcIk5vIGNoYXQgbm90aWNlLlwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd0NvbnRleHRVc2FnZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zaG93Q29udGV4dFVzYWdlJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLnNob3dDb250ZXh0VXNhZ2UubGFiZWwnLCBcIlNob3cgQ29udGV4dCBXaW5kb3cgVXNhZ2VcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldCA/PyAoYXdhaXQgd2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKSk7XG5cdFx0XHR3aWRnZXQ/LmlucHV0LnNob3dDb250ZXh0VXNhZ2VEZXRhaWxzKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29tcGFjdEFnZW50SG9zdENvbnZlcnNhdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb21wYWN0QWdlbnRIb3N0Q29udmVyc2F0aW9uJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLmNvbXBhY3RBZ2VudEhvc3RDb252ZXJzYXRpb24ubGFiZWwnLCBcIkNvbXBhY3QgQ29udmVyc2F0aW9uXCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdENvbnRleHRVc2FnZUFjdGlvbnMsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdElzQWdlbnRIb3N0U2Vzc2lvbixcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0QWdlbnRIb3N0UHJvdmlkZXJJZC5pc0VxdWFsVG8oQ09QSUxPVF9DTElfQUdFTlRfSE9TVF9QUk9WSURFUl9JRClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd2lkZ2V0PzogSUNoYXRXaWRnZXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdC8vIENvbXBhY3Rpb24gaXMgYSBtYWludGVuYW5jZSBjb21tYW5kLCBzbyBrZWVwIGFueSBkcmFmdCB0aGUgdXNlciB0eXBlZCAoIzMxNDY2NCkuXG5cdFx0XHRhd2FpdCB3aWRnZXQ/LmFjY2VwdElucHV0KCcvY29tcGFjdCcsIHsgcHJlc2VydmVJbnB1dDogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVTaG93Q29udGV4dFVzYWdlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRvZ2dsZVNob3dDb250ZXh0VXNhZ2UnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LnNob3dDb250ZXh0VXNhZ2UnLCBcIlNob3cgQ29udGV4dCBVc2FnZVwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQ2hhdENvbnRleHRVc2FnZUVuYWJsZWR9YCwgdHJ1ZSksXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRXZWxjb21lQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJzFfZGlzcGxheScsXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQ2hhdEVkaXRvci5uZWdhdGUoKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q29udGV4dFVzYWdlRW5hYmxlZCk7XG5cdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q29udGV4dFVzYWdlRW5hYmxlZCwgIWN1cnJlbnRWYWx1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25zdCBub25FbnRlcnByaXNlQ29waWxvdFVzZXJzID0gQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke2RlZmF1bHRDaGF0LmNvbXBsZXRpb25zQWR2YW5jZWRTZXR0aW5nfS5hdXRoUHJvdmlkZXJgLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLmlkKSk7XG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VTZXR0aW5ncycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hbmFnZUNoYXQnLCBcIk1hbmFnZSBDb3BpbG90IFNldHRpbmdzXCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5GcmVlLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5FZHUsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhblBybyxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuUHJvUGx1cyxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuTWF4XG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRub25FbnRlcnByaXNlQ29waWxvdFVzZXJzXG5cdFx0XHRcdCksXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRUaXRsZUJhck1lbnUsXG5cdFx0XHRcdFx0Z3JvdXA6ICd5X21hbmFnZScsXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0d2hlbjogbm9uRW50ZXJwcmlzZUNvcGlsb3RVc2Vyc1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdEFjY291bnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWZhdWx0QWNjb3VudFNlcnZpY2UpO1xuXHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVzb2x2ZUdpdEh1YlVybChHaXRIdWJQYXRocy5jb3BpbG90U2V0dGluZ3MpKSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd0V4dGVuc2lvbnNVc2luZ0NvcGlsb3QgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zaG93RXh0ZW5zaW9uc1VzaW5nQ29waWxvdCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dDb3BpbG90VXNhZ2VFeHRlbnNpb25zJywgXCJTaG93IEV4dGVuc2lvbnMgdXNpbmcgQ29waWxvdFwiKSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGNhdGVnb3J5OiBFWFRFTlNJT05TX0NBVEVHT1JZLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAY29udHJpYnV0ZToke0NvcGlsb3RVc2FnZUV4dGVuc2lvbkZlYXR1cmVJZH1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb25maWd1cmVDb3BpbG90Q29tcGxldGlvbnMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb25maWd1cmVDb2RlQ29tcGxldGlvbnMnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb25maWd1cmVDb21wbGV0aW9ucycsIFwiQ29uZmlndXJlIElubGluZSBTdWdnZXN0aW9ucy4uLlwiKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmluc3RhbGxlZCxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWQubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLnVudHJ1c3RlZC5uZWdhdGUoKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRcdGdyb3VwOiAnZl9jb21wbGV0aW9ucycsXG5cdFx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc01lbnVDb21tYW5kKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93UXVvdGFFeGNlZWRlZERpYWxvZ0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBPUEVOX0NIQVRfUVVPVEFfRVhDRUVERURfRElBTE9HLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3VwZ3JhZGVDaGF0JywgXCJVcGdyYWRlIEdpdEh1YiBDb3BpbG90IFBsYW5cIilcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0Y29uc3QgY2hhdEVudGl0bGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdEVudGl0bGVtZW50U2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdGNvbnN0IGNoYXRRdW90YUV4Y2VlZGVkID0gY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuY2hhdD8ucGVyY2VudFJlbWFpbmluZyA9PT0gMDtcblx0XHRcdGNvbnN0IGNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZCA9IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLmNvbXBsZXRpb25zPy5wZXJjZW50UmVtYWluaW5nID09PSAwO1xuXHRcdFx0aWYgKGNoYXRRdW90YUV4Y2VlZGVkICYmICFjb21wbGV0aW9uc1F1b3RhRXhjZWVkZWQpIHtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0UXVvdGFFeGNlZWRlZCcsIFwiWW91J3ZlIHJlYWNoZWQgeW91ciBtb250aGx5IGNoYXQgbWVzc2FnZXMgcXVvdGEuIFlvdSBzdGlsbCBoYXZlIGZyZWUgaW5saW5lIHN1Z2dlc3Rpb25zIGF2YWlsYWJsZS5cIik7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZCAmJiAhY2hhdFF1b3RhRXhjZWVkZWQpIHtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjb21wbGV0aW9uc1F1b3RhRXhjZWVkZWQnLCBcIllvdSd2ZSByZWFjaGVkIHlvdXIgbW9udGhseSBpbmxpbmUgc3VnZ2VzdGlvbnMgcXVvdGEuIFlvdSBzdGlsbCBoYXZlIGZyZWUgY2hhdCBtZXNzYWdlcyBhdmFpbGFibGUuXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0QW5kQ29tcGxldGlvbnNRdW90YUV4Y2VlZGVkJywgXCJZb3UndmUgcmVhY2hlZCB5b3VyIG1vbnRobHkgY2hhdCBtZXNzYWdlcyBhbmQgaW5saW5lIHN1Z2dlc3Rpb25zIHF1b3RhLlwiKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnJlc2V0RGF0ZSkge1xuXHRcdFx0XHRjb25zdCBkYXRlRm9ybWF0dGVyID0gY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMucmVzZXREYXRlSGFzVGltZSA/IHNhZmVJbnRsLkRhdGVUaW1lRm9ybWF0KGxhbmd1YWdlLCB7IHllYXI6ICdudW1lcmljJywgbW9udGg6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIGhvdXI6ICdudW1lcmljJywgbWludXRlOiAnbnVtZXJpYycgfSkgOiBzYWZlSW50bC5EYXRlVGltZUZvcm1hdChsYW5ndWFnZSwgeyB5ZWFyOiAnbnVtZXJpYycsIG1vbnRoOiAnbG9uZycsIGRheTogJ251bWVyaWMnIH0pO1xuXHRcdFx0XHRjb25zdCBxdW90YVJlc2V0RGF0ZSA9IG5ldyBEYXRlKGNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnJlc2V0RGF0ZSk7XG5cdFx0XHRcdG1lc3NhZ2UgPSBbbWVzc2FnZSwgbG9jYWxpemUoJ3F1b3RhUmVzZXREYXRlJywgXCJUaGUgYWxsb3dhbmNlIHdpbGwgcmVzZXQgb24gezB9LlwiLCBkYXRlRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChxdW90YVJlc2V0RGF0ZSkpXS5qb2luKCcgJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZyZWUgPSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZTtcblx0XHRcdGNvbnN0IHVwZ3JhZGVUb1BybyA9IGZyZWUgPyBsb2NhbGl6ZSgndXBncmFkZVRvUHJvJywgXCJVcGdyYWRlIHRvIEdpdEh1YiBDb3BpbG90IFBybyBmb3I6XFxuLSBVbmxpbWl0ZWQgaW5saW5lIHN1Z2dlc3Rpb25zXFxuLSBVbmxpbWl0ZWQgY2hhdCBtZXNzYWdlc1xcbi0gQWNjZXNzIHRvIHByZW1pdW0gbW9kZWxzXCIpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6ICdub25lJyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvcGlsb3RRdW90YVJlYWNoZWQnLCBcIkdpdEh1YiBDb3BpbG90IFF1b3RhIFJlYWNoZWRcIiksXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZGlzbWlzcycsIFwiRGlzbWlzc1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHsgLyogbm9vcCAqLyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogZnJlZSA/IGxvY2FsaXplKCd1cGdyYWRlUHJvJywgXCJVcGdyYWRlIHRvIEdpdEh1YiBDb3BpbG90IFByb1wiKSA6IGxvY2FsaXplKCd1cGdyYWRlUGxhbicsIFwiVXBncmFkZSBHaXRIdWIgQ29waWxvdCBQbGFuXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nO1xuXHRcdFx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogY29tbWFuZElkLCBmcm9tOiAnY2hhdC1kaWFsb2cnIH0pO1xuXHRcdFx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdGljb246IENvZGljb24uY29waWxvdFdhcm5pbmdMYXJnZSxcblx0XHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IGNvYWxlc2NlKFtcblx0XHRcdFx0XHRcdHsgbWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlLCB0cnVlKSB9LFxuXHRcdFx0XHRcdFx0dXBncmFkZVRvUHJvID8geyBtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKHVwZ3JhZGVUb1BybywgdHJ1ZSkgfSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc2V0VHJ1c3RlZFRvb2xzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc2V0VHJ1c3RlZFRvb2xzJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVzZXRUcnVzdGVkVG9vbHMnLCBcIlJlc2V0IFRvb2wgQ29uZmlybWF0aW9uc1wiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UpLnJlc2V0VG9vbEF1dG9Db25maXJtYXRpb24oKTtcblx0XHRcdGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSkuaW5mbyhsb2NhbGl6ZSgncmVzZXRUcnVzdGVkVG9vbHNTdWNjZXNzJywgXCJUb29sIGNvbmZpcm1hdGlvbiBwcmVmZXJlbmNlcyBoYXZlIGJlZW4gcmVzZXQuXCIpKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHZW5lcmF0ZUluc3RydWN0aW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogR0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlSW5zdHJ1Y3Rpb25zJywgXCJHZW5lcmF0ZSBBZ2VudCBJbnN0cnVjdGlvbnNcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nLCB7XG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHF1ZXJ5OiAnL2luaXQnLFxuXHRcdFx0XHRpc1BhcnRpYWxRdWVyeTogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHZW5lcmF0ZUluc3RydWN0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBHRU5FUkFURV9PTl9ERU1BTkRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlT25EZW1hbmRJbnN0cnVjdGlvbnMnLCBcIkdlbmVyYXRlIE9uLURlbWFuZCBJbnN0cnVjdGlvbnNcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nLCB7XG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHF1ZXJ5OiAnL2NyZWF0ZS1pbnN0cnVjdGlvbnMgJyxcblx0XHRcdFx0aXNQYXJ0aWFsUXVlcnk6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHZW5lcmF0ZVByb21wdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogR0VORVJBVEVfUFJPTVBUX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlUHJvbXB0JywgXCJHZW5lcmF0ZSBQcm9tcHQgRmlsZVwiKSxcblx0XHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUyKCdnZW5lcmF0ZVByb21wdC5zaG9ydCcsIFwiR2VuZXJhdGUgUHJvbXB0XCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zcGFya2xlLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuJywge1xuXHRcdFx0XHRtb2RlOiAnYWdlbnQnLFxuXHRcdFx0XHRxdWVyeTogJy9jcmVhdGUtcHJvbXB0ICcsXG5cdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgR2VuZXJhdGVTa2lsbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogR0VORVJBVEVfU0tJTExfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZ2VuZXJhdGVTa2lsbCcsIFwiR2VuZXJhdGUgU2tpbGxcIiksXG5cdFx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignZ2VuZXJhdGVTa2lsbC5zaG9ydCcsIFwiR2VuZXJhdGUgU2tpbGxcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nLCB7XG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHF1ZXJ5OiAnL2NyZWF0ZS1za2lsbCAnLFxuXHRcdFx0XHRpc1BhcnRpYWxRdWVyeTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdlbmVyYXRlQWdlbnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEdFTkVSQVRFX0FHRU5UX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlQWdlbnQnLCBcIkdlbmVyYXRlIEN1c3RvbSBBZ2VudFwiKSxcblx0XHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUyKCdnZW5lcmF0ZUFnZW50LnNob3J0JywgXCJHZW5lcmF0ZSBBZ2VudFwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24uc3BhcmtsZSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbicsIHtcblx0XHRcdFx0bW9kZTogJ2FnZW50Jyxcblx0XHRcdFx0cXVlcnk6ICcvY3JlYXRlLWFnZW50ICcsXG5cdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgR2VuZXJhdGVIb29rQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBHRU5FUkFURV9IT09LX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlSG9vaycsIFwiR2VuZXJhdGUgSG9va1wiKSxcblx0XHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUyKCdnZW5lcmF0ZUhvb2suc2hvcnQnLCBcIkdlbmVyYXRlIEhvb2tcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nLCB7XG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHF1ZXJ5OiAnL2NyZWF0ZS1ob29rICcsXG5cdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgSW5zZXJ0Rm9ya0NvbnZlcnNhdGlvblNsYXNoQ29tbWFuZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogSU5TRVJUX0ZPUktfQ09OVkVSU0FUSU9OX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2luc2VydEZvcmtDb252ZXJzYXRpb25TbGFzaENvbW1hbmQnLCBcIkluc2VydCBGb3JrIENvbW1hbmRcIiksXG5cdFx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignaW5zZXJ0Rm9ya0NvbnZlcnNhdGlvblNsYXNoQ29tbWFuZC5zaG9ydCcsIFwiSW5zZXJ0IC9mb3JrXCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZXBvRm9ya2VkLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuJywge1xuXHRcdFx0XHRxdWVyeTogJy9mb3JrICcsXG5cdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgSW5zZXJ0VHJvdWJsZXNob290U2xhc2hDb21tYW5kQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBJTlNFUlRfVFJPVUJMRVNIT09UX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2luc2VydFRyb3VibGVzaG9vdFNsYXNoQ29tbWFuZCcsIFwiSW5zZXJ0IFRyb3VibGVzaG9vdCBDb21tYW5kXCIpLFxuXHRcdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZTIoJ2luc2VydFRyb3VibGVzaG9vdFNsYXNoQ29tbWFuZC5zaG9ydCcsIFwiSW5zZXJ0IC90cm91Ymxlc2hvb3RcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuJywge1xuXHRcdFx0XHRxdWVyeTogJy90cm91Ymxlc2hvb3QgJyxcblx0XHRcdFx0aXNQYXJ0aWFsUXVlcnk6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuQ2hhdEZlYXR1cmVTZXR0aW5nc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuRmVhdHVyZVNldHRpbmdzJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkNoYXRGZWF0dXJlU2V0dGluZ3MnLCBcIkNoYXQgU2V0dGluZ3NcIiksXG5cdFx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplKCdvcGVuQ2hhdEZlYXR1cmVTZXR0aW5ncy5zaG9ydCcsIFwiQ2hhdCBTZXR0aW5nc1wiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdGlkOiBDSEFUX0NPTkZJR19NRU5VX0lELFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQ2hhdFZpZXdJZCkpLFxuXHRcdFx0XHRcdG9yZGVyOiAxNSxcblx0XHRcdFx0XHRncm91cDogJzNfY29uZmlndXJlJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0V2VsY29tZUNvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICcyX3NldHRpbmdzJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBDaGF0Vmlld0lkKSksXG5cdFx0XHRcdFx0b3JkZXI6IDE1LFxuXHRcdFx0XHRcdGdyb3VwOiAnM19jb25maWd1cmUnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHRcdHByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3MoeyBxdWVyeTogJ0BmZWF0dXJlOmNoYXQgJyB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNob3cgYSBkaXJlY3QgZ2VhciBhY3Rpb24gdG8gb3BlbiB0aGUgQ3VzdG9taXphdGlvbnMgZWRpdG9yXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVmlld1RpdGxlLCB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcy5PcGVuRWRpdG9yLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkNoYXRDdXN0b21pemF0aW9ucycsIFwiT3BlbiBDdXN0b21pemF0aW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5nZWFyXG5cdFx0fSxcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQ2hhdFZpZXdJZCksXG5cdFx0KSxcblx0XHRvcmRlcjogNlxuXHR9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmluZ2lmeUl0ZW0oaXRlbTogSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaW5jbHVkZU5hbWUgPSB0cnVlKTogc3RyaW5nIHtcblx0aWYgKGlzUmVxdWVzdFZNKGl0ZW0pKSB7XG5cdFx0cmV0dXJuIChpbmNsdWRlTmFtZSA/IGAke2l0ZW0udXNlcm5hbWV9OiBgIDogJycpICsgaXRlbS5tZXNzYWdlVGV4dDtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gKGluY2x1ZGVOYW1lID8gYCR7aXRlbS51c2VybmFtZX06IGAgOiAnJykgKyBpdGVtLnJlc3BvbnNlLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVG9vbEZpbHRlcmluZ09wdGlvbnMge1xuXHRhbGxUb29sczogSVRvb2xEYXRhW107XG5cdGFsbFRvb2xTZXRzOiBJVG9vbFNldFtdO1xuXHR0b29sc0luY2x1ZGU/OiBzdHJpbmdbXTtcblx0dG9vbHNFeGNsdWRlPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRvb2xGaWx0ZXJpbmdSZXN1bHQge1xuXHRlbmFibGVtZW50TWFwOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXA7XG5cdHVua25vd25JZGVudGlmaWVyczogc3RyaW5nW107XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHRvb2wgZW5hYmxlbWVudCBtYXAgYmFzZWQgb24gaW5jbHVkZS9leGNsdWRlIGZpbHRlcnMuXG4gKlxuICogUmVzb2x1dGlvbiBhbGdvcml0aG06XG4gKiAxLiBJZiBgdG9vbHNJbmNsdWRlYCBpcyBzcGVjaWZpZWQsIHN0YXJ0IHdpdGggb25seSB0aG9zZSB0b29scy90b29sc2V0cyBlbmFibGVkXG4gKiAyLiBJZiBgdG9vbHNFeGNsdWRlYCBpcyBzcGVjaWZpZWQsIHJlbW92ZSB0aG9zZSB0b29scy90b29sc2V0c1xuICogMy4gRXhwbGljaXQgdG9vbCByZWZlcmVuY2VzIGluIGB0b29sc0luY2x1ZGVgIG92ZXJyaWRlIHRvb2xzZXQgZXhjbHVzaW9uc1xuICogNC4gRXhwbGljaXQgdG9vbCBleGNsdXNpb25zIGFsd2F5cyB3aW5cbiAqIDUuIFRvb2xzZXQgZW5hYmxlbWVudCBpcyBjYWxjdWxhdGVkIGJhc2VkIG9uIHdoZXRoZXIgYWxsIG1lbWJlciB0b29scyBhcmUgZW5hYmxlZFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgZmlsdGVyaW5nIHJlc3VsdHMgaW4gemVybyBlbmFibGVkIHRvb2xzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlVG9vbEVuYWJsZW1lbnRNYXAob3B0aW9uczogSVRvb2xGaWx0ZXJpbmdPcHRpb25zKTogSVRvb2xGaWx0ZXJpbmdSZXN1bHQge1xuXHRjb25zdCB7IGFsbFRvb2xzLCBhbGxUb29sU2V0cywgdG9vbHNJbmNsdWRlLCB0b29sc0V4Y2x1ZGUgfSA9IG9wdGlvbnM7XG5cblx0Y29uc3QgZW5hYmxlbWVudE1hcCA9IG5ldyBNYXA8SVRvb2xEYXRhIHwgSVRvb2xTZXQsIGJvb2xlYW4+KCk7XG5cdGNvbnN0IG1hdGNoZWRJZGVudGlmaWVycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8vIEhlbHBlciB0byBjaGVjayBpZiBhIHRvb2wgbWF0Y2hlcyBhbnkgaWRlbnRpZmllciAoYnkgaWQgb3IgdG9vbFJlZmVyZW5jZU5hbWUpXG5cdGNvbnN0IHRvb2xNYXRjaGVzID0gKHRvb2w6IElUb29sRGF0YSwgaWRlbnRpZmllcnM6IFNldDxzdHJpbmc+KTogYm9vbGVhbiA9PiB7XG5cdFx0aWYgKGlkZW50aWZpZXJzLmhhcyh0b29sLmlkKSkge1xuXHRcdFx0bWF0Y2hlZElkZW50aWZpZXJzLmFkZCh0b29sLmlkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodG9vbC50b29sUmVmZXJlbmNlTmFtZSAmJiBpZGVudGlmaWVycy5oYXModG9vbC50b29sUmVmZXJlbmNlTmFtZSkpIHtcblx0XHRcdG1hdGNoZWRJZGVudGlmaWVycy5hZGQodG9vbC50b29sUmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xuXG5cdC8vIEhlbHBlciB0byBjaGVjayBpZiBhIHRvb2xzZXQgbWF0Y2hlcyBhbnkgaWRlbnRpZmllciAoYnkgaWQgb3IgcmVmZXJlbmNlTmFtZSlcblx0Y29uc3QgdG9vbFNldE1hdGNoZXMgPSAodG9vbFNldDogSVRvb2xTZXQsIGlkZW50aWZpZXJzOiBTZXQ8c3RyaW5nPik6IGJvb2xlYW4gPT4ge1xuXHRcdGlmIChpZGVudGlmaWVycy5oYXModG9vbFNldC5pZCkpIHtcblx0XHRcdG1hdGNoZWRJZGVudGlmaWVycy5hZGQodG9vbFNldC5pZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGlkZW50aWZpZXJzLmhhcyh0b29sU2V0LnJlZmVyZW5jZU5hbWUpKSB7XG5cdFx0XHRtYXRjaGVkSWRlbnRpZmllcnMuYWRkKHRvb2xTZXQucmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xuXG5cdC8vIFRyYWNrIHdoaWNoIHRvb2xzIGFyZSBleHBsaWNpdGx5IHJlZmVyZW5jZWQgaW4gdG9vbHNJbmNsdWRlXG5cdGNvbnN0IGV4cGxpY2l0bHlJbmNsdWRlZFRvb2xzID0gbmV3IFNldDxJVG9vbERhdGE+KCk7XG5cblx0Ly8gU3RlcCAxOiBCdWlsZCBpbml0aWFsIHNldCBiYXNlZCBvbiB0b29sc0luY2x1ZGVcblx0aWYgKHRvb2xzSW5jbHVkZSkge1xuXHRcdGNvbnN0IGluY2x1ZGVTZXQgPSBuZXcgU2V0KHRvb2xzSW5jbHVkZSk7XG5cblx0XHQvLyBGaXJzdCwgcHJvY2VzcyB0b29sc2V0cyAtIGlmIGEgdG9vbHNldCBtYXRjaGVzLCBlbmFibGUgYWxsIGl0cyB0b29sc1xuXHRcdGZvciAoY29uc3QgdG9vbFNldCBvZiBhbGxUb29sU2V0cykge1xuXHRcdFx0aWYgKHRvb2xTZXRNYXRjaGVzKHRvb2xTZXQsIGluY2x1ZGVTZXQpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcblx0XHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRoZW4gcHJvY2VzcyBpbmRpdmlkdWFsIHRvb2xzXG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIGFsbFRvb2xzKSB7XG5cdFx0XHRpZiAodG9vbE1hdGNoZXModG9vbCwgaW5jbHVkZVNldCkpIHtcblx0XHRcdFx0ZW5hYmxlbWVudE1hcC5zZXQodG9vbCwgdHJ1ZSk7XG5cdFx0XHRcdGV4cGxpY2l0bHlJbmNsdWRlZFRvb2xzLmFkZCh0b29sKTtcblx0XHRcdH0gZWxzZSBpZiAoIWVuYWJsZW1lbnRNYXAuaGFzKHRvb2wpKSB7XG5cdFx0XHRcdGVuYWJsZW1lbnRNYXAuc2V0KHRvb2wsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gQWxzbyBwcm9jZXNzIHRvb2xzIGZyb20gdG9vbHNldHMgdGhhdCBtYXkgbm90IGJlIGluIGFsbFRvb2xzXG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIGFsbFRvb2xTZXRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbFNldC5nZXRUb29scygpKSB7XG5cdFx0XHRcdGlmICh0b29sTWF0Y2hlcyh0b29sLCBpbmNsdWRlU2V0KSkge1xuXHRcdFx0XHRcdGVuYWJsZW1lbnRNYXAuc2V0KHRvb2wsIHRydWUpO1xuXHRcdFx0XHRcdGV4cGxpY2l0bHlJbmNsdWRlZFRvb2xzLmFkZCh0b29sKTtcblx0XHRcdFx0fSBlbHNlIGlmICghZW5hYmxlbWVudE1hcC5oYXModG9vbCkpIHtcblx0XHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gTm8gdG9vbHNJbmNsdWRlIHNwZWNpZmllZCAtIHN0YXJ0IHdpdGggYWxsIHRvb2xzIGVuYWJsZWRcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgYWxsVG9vbHMpIHtcblx0XHRcdGVuYWJsZW1lbnRNYXAuc2V0KHRvb2wsIHRydWUpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHRvb2xTZXQgb2YgYWxsVG9vbFNldHMpIHtcblx0XHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcblx0XHRcdFx0ZW5hYmxlbWVudE1hcC5zZXQodG9vbCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gU3RlcCAyOiBSZW1vdmUgdG9vbHMgbWF0Y2hpbmcgdG9vbHNFeGNsdWRlXG5cdGlmICh0b29sc0V4Y2x1ZGUpIHtcblx0XHRjb25zdCBleGNsdWRlU2V0ID0gbmV3IFNldCh0b29sc0V4Y2x1ZGUpO1xuXG5cdFx0Ly8gRmlyc3QsIHByb2Nlc3MgdG9vbHNldHMgLSBpZiBhIHRvb2xzZXQgbWF0Y2hlcywgZGlzYWJsZSBhbGwgaXRzIHRvb2xzXG5cdFx0Ly8gKHVubGVzcyBleHBsaWNpdGx5IGluY2x1ZGVkIGFzIGluZGl2aWR1YWwgdG9vbHMpXG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIGFsbFRvb2xTZXRzKSB7XG5cdFx0XHRpZiAodG9vbFNldE1hdGNoZXModG9vbFNldCwgZXhjbHVkZVNldCkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xTZXQuZ2V0VG9vbHMoKSkge1xuXHRcdFx0XHRcdC8vIEV4cGxpY2l0IHRvb2wgcmVmZXJlbmNlIG92ZXJyaWRlcyB0b29sc2V0IGV4Y2x1c2lvblxuXHRcdFx0XHRcdGlmICghZXhwbGljaXRseUluY2x1ZGVkVG9vbHMuaGFzKHRvb2wpKSB7XG5cdFx0XHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhlbiBwcm9jZXNzIGluZGl2aWR1YWwgdG9vbHMgLSBleHBsaWNpdCBleGNsdXNpb24gYWx3YXlzIHdpbnNcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgYWxsVG9vbHMpIHtcblx0XHRcdGlmICh0b29sTWF0Y2hlcyh0b29sLCBleGNsdWRlU2V0KSkge1xuXHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgdG9vbFNldCBvZiBhbGxUb29sU2V0cykge1xuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xTZXQuZ2V0VG9vbHMoKSkge1xuXHRcdFx0XHRpZiAodG9vbE1hdGNoZXModG9vbCwgZXhjbHVkZVNldCkpIHtcblx0XHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBDb2xsZWN0IHVua25vd24gaWRlbnRpZmllcnNcblx0Y29uc3QgYWxsSWRlbnRpZmllcnMgPSBuZXcgU2V0KFsuLi4odG9vbHNJbmNsdWRlID8/IFtdKSwgLi4uKHRvb2xzRXhjbHVkZSA/PyBbXSldKTtcblx0Y29uc3QgdW5rbm93bklkZW50aWZpZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgYWxsSWRlbnRpZmllcnMpIHtcblx0XHRpZiAoIW1hdGNoZWRJZGVudGlmaWVycy5oYXMoaWRlbnRpZmllcikpIHtcblx0XHRcdHVua25vd25JZGVudGlmaWVycy5wdXNoKGlkZW50aWZpZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFZhbGlkYXRlIGF0IGxlYXN0IG9uZSB0b29sIGlzIGVuYWJsZWRcblx0Y29uc3QgZW5hYmxlZFRvb2xDb3VudCA9IEFycmF5LmZyb20oZW5hYmxlbWVudE1hcC5lbnRyaWVzKCkpLmZpbHRlcigoW2l0ZW0sIGVuYWJsZWRdKSA9PiBlbmFibGVkICYmICFpc1Rvb2xTZXQoaXRlbSkpLmxlbmd0aDtcblx0aWYgKGVuYWJsZWRUb29sQ291bnQgPT09IDApIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rvb2wgZmlsdGVyaW5nIHJlc3VsdGVkIGluIHplcm8gZW5hYmxlZCB0b29scy4gQXQgbGVhc3Qgb25lIHRvb2wgbXVzdCBiZSBlbmFibGVkLicpO1xuXHR9XG5cblx0Ly8gQ2FsY3VsYXRlIHRvb2xzZXQgZW5hYmxlbWVudCBiYXNlZCBvbiB3aGV0aGVyIGFsbCBtZW1iZXIgdG9vbHMgYXJlIGVuYWJsZWRcblx0Zm9yIChjb25zdCB0b29sU2V0IG9mIGFsbFRvb2xTZXRzKSB7XG5cdFx0Y29uc3QgdG9vbFNldFRvb2xzID0gQXJyYXkuZnJvbSh0b29sU2V0LmdldFRvb2xzKCkpO1xuXHRcdGNvbnN0IGFsbFRvb2xzRW5hYmxlZCA9IHRvb2xTZXRUb29scy5sZW5ndGggPiAwICYmIHRvb2xTZXRUb29scy5ldmVyeSh0ID0+IGVuYWJsZW1lbnRNYXAuZ2V0KHQpID09PSB0cnVlKTtcblx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sU2V0LCBhbGxUb29sc0VuYWJsZWQpO1xuXHR9XG5cblx0cmV0dXJuIHsgZW5hYmxlbWVudE1hcDogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21NYXAoZW5hYmxlbWVudE1hcCksIHVua25vd25JZGVudGlmaWVycyB9O1xufVxuXG5cbi8qKlxuICogUmV0dXJucyB3aGV0aGVyIHdlIGNhbiBjb250aW51ZSBjbGVhcmluZy9zd2l0Y2hpbmcgY2hhdCBzZXNzaW9ucywgZmFsc2UgdG8gY2FuY2VsLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlQ3VycmVudEVkaXRpbmdTZXNzaW9uKG1vZGVsOiBJQ2hhdE1vZGVsLCBwaHJhc2U6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0cmV0dXJuIHNob3dDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uKG1vZGVsLCBkaWFsb2dTZXJ2aWNlLCB7IG1lc3NhZ2VPdmVycmlkZTogcGhyYXNlIH0pO1xufVxuXG4vKipcbiAqIFJldHVybnMgd2hldGhlciB3ZSBjYW4gc3dpdGNoIHRoZSBhZ2VudCwgYmFzZWQgb24gd2hldGhlciB0aGUgdXNlciBoYWQgdG8gYWdyZWUgdG8gY2xlYXIgdGhlIHNlc3Npb24sIGZhbHNlIHRvIGNhbmNlbC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZU1vZGVTd2l0Y2goXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRmcm9tTW9kZTogQ2hhdE1vZGVLaW5kLFxuXHR0b01vZGU6IENoYXRNb2RlS2luZCxcblx0cmVxdWVzdENvdW50OiBudW1iZXIsXG5cdG1vZGVsOiBJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkLFxuKTogUHJvbWlzZTxmYWxzZSB8IHsgbmVlZFRvQ2xlYXJTZXNzaW9uOiBib29sZWFuIH0+IHtcblx0aWYgKCFtb2RlbD8uZWRpdGluZ1Nlc3Npb24gfHwgZnJvbU1vZGUgPT09IHRvTW9kZSkge1xuXHRcdHJldHVybiB7IG5lZWRUb0NsZWFyU2Vzc2lvbjogZmFsc2UgfTtcblx0fVxuXG5cdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRjb25zdCBuZWVkVG9DbGVhckVkaXRzID0gKGZyb21Nb2RlID09PSBDaGF0TW9kZUtpbmQuRWRpdCB8fCB0b01vZGUgPT09IENoYXRNb2RlS2luZC5FZGl0KSAmJiByZXF1ZXN0Q291bnQgPiAwO1xuXHRpZiAobmVlZFRvQ2xlYXJFZGl0cykge1xuXHRcdC8vIFN3aXRjaGluZyBpbnRvIG9yIG91dCBvZiBlZGl0IG1vZGUsIGFzayB0byBkaXNjYXJkIHRoZSBzZXNzaW9uXG5cdFx0Y29uc3QgcGhyYXNlID0gbG9jYWxpemUoJ3N3aXRjaE1vZGUuY29uZmlybVBocmFzZScsIFwiU3dpdGNoaW5nIGFnZW50cyB3aWxsIGVuZCB5b3VyIGN1cnJlbnQgZWRpdCBzZXNzaW9uLlwiKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRFZGl0cyA9IG1vZGVsLmVkaXRpbmdTZXNzaW9uLmVudHJpZXMuZ2V0KCk7XG5cdFx0Y29uc3QgdW5kZWNpZGVkRWRpdHMgPSBjdXJyZW50RWRpdHMuZmlsdGVyKChlZGl0KSA9PiBlZGl0LnN0YXRlLmdldCgpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblx0XHRpZiAodW5kZWNpZGVkRWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKCFhd2FpdCBoYW5kbGVDdXJyZW50RWRpdGluZ1Nlc3Npb24obW9kZWwsIHBocmFzZSwgZGlhbG9nU2VydmljZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBuZWVkVG9DbGVhclNlc3Npb246IHRydWUgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudC5uZXdTZXNzaW9uJywgXCJTdGFydCBuZXcgc2Vzc2lvbj9cIiksXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudC5uZXdTZXNzaW9uTWVzc2FnZScsIFwiQ2hhbmdpbmcgdGhlIGFnZW50IHdpbGwgZW5kIHlvdXIgY3VycmVudCBlZGl0IHNlc3Npb24uIFdvdWxkIHlvdSBsaWtlIHRvIGNoYW5nZSB0aGUgYWdlbnQ/XCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnYWdlbnQubmV3U2Vzc2lvbi5jb25maXJtJywgXCJZZXNcIiksXG5cdFx0XHRcdHR5cGU6ICdpbmZvJ1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIWNvbmZpcm1hdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBuZWVkVG9DbGVhclNlc3Npb246IHRydWUgfTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBuZWVkVG9DbGVhclNlc3Npb246IGZhbHNlIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNsZWFyRWRpdGluZ1Nlc3Npb25Db25maXJtYXRpb25PcHRpb25zIHtcblx0dGl0bGVPdmVycmlkZT86IHN0cmluZztcblx0bWVzc2FnZU92ZXJyaWRlPzogc3RyaW5nO1xuXHRpc0FyY2hpdmVBY3Rpb24/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIENsZWFycyB0aGUgY3VycmVudCBjaGF0IHNlc3Npb24gYW5kIHN0YXJ0cyBhIG5ldyBvbmUgdXNpbmcgdGhlIHNoYXJlZFxuICogbmV3LXNlc3Npb24gaGFybmVzcyByZXNvbHZlci5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsZWFyQ2hhdFNlc3Npb25QcmVzZXJ2aW5nVHlwZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd2lkZ2V0OiBJQ2hhdFdpZGdldCwgc2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IGN1cnJlbnRSZXNvdXJjZSA9IHdpZGdldC52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0Y29uc3QgY3VycmVudFNlc3Npb25UeXBlID0gY3VycmVudFJlc291cmNlID8gZ2V0Q2hhdFNlc3Npb25UeXBlKGN1cnJlbnRSZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IHsgc2Vzc2lvblR5cGU6IG5ld1Nlc3Npb25UeXBlIH0gPSByZXNvbHZlRGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShhY2Nlc3NvciwgeyBleHBsaWNpdE92ZXJyaWRlOiBzZXNzaW9uVHlwZSwgY3VycmVudFNlc3Npb25UeXBlIH0pO1xuXHRpZiAoaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCh3aWRnZXQudmlld0NvbnRleHQpKSB7XG5cdFx0Y29uc3QgdmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhDaGF0Vmlld0lkKSBhcyBDaGF0Vmlld1BhbmU7XG5cdFx0aWYgKG5ld1Nlc3Npb25UeXBlICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0Ly8gTG9hZCBhIHNlc3Npb24gb2YgdGhlIHJlc29sdmVkIHR5cGUgaW4gdGhlIHNpZGViYXIuXG5cdFx0XHRhd2FpdCB2aWV3LmxvYWRTZXNzaW9uKFVSSS5mcm9tKHsgc2NoZW1lOiBuZXdTZXNzaW9uVHlwZSwgcGF0aDogYC91bnRpdGxlZC0ke2dlbmVyYXRlVXVpZCgpfWAgfSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBUaGUgcmVzb2x2ZWQgdHlwZSBpcyBsb2NhbCAoYW4gZXhwbGljaXQgcmVxdWVzdCBvciBzZXNzaW9uXG5cdFx0XHQvLyBwcmVzZXJ2YXRpb24pLiBBIHBsYWluIGB3aWRnZXQuY2xlYXIoKWAgcmUtYWNxdWlyZXMgdGhlIGNvbXB1dGVkXG5cdFx0XHQvLyBkZWZhdWx0IChhIG5vbi1sb2NhbCBoYXJuZXNzIHdoZW4gdGhlIGFnZW50IGhvc3QgaXMgZW5hYmxlZCksIHNvXG5cdFx0XHQvLyBzdGFydCBhIGxvY2FsIHNlc3Npb24gZXhwbGljaXRseSB0byBob25vciB0aGUgcmVzb2x2ZWQgdHlwZS5cblx0XHRcdGF3YWl0IHZpZXcuc3RhcnROZXdMb2NhbFNlc3Npb24oKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gRm9yIHRoZSBlZGl0b3IsIHRocmVhZCB0aGUgcmVzb2x2ZWQgdHlwZSB0aHJvdWdoIHRoZSBjbGVhciBwYXRoIHNvXG5cdFx0Ly8gY2xlYXJDaGF0RWRpdG9yIG9wZW5zIGEgc2Vzc2lvbiBvZiB0aGF0IHR5cGUgaW5zdGVhZCBvZiByZWNvbXB1dGluZ1xuXHRcdC8vIHRoZSBkZWZhdWx0ICh3aGljaCB3b3VsZCBkcm9wIGFuIGV4cGxpY2l0IG9yIHByZXNlcnZlZCBsb2NhbCByZXF1ZXN0KS5cblx0XHRhd2FpdCB3aWRnZXQuY2xlYXIobmV3U2Vzc2lvblR5cGUpO1xuXHR9XG59XG5cblxuLy8gLS0tIENoYXQgU3VibWVudXMgaW4gdmFyaW91cyBDb21wb25lbnRzXG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQ29udGV4dCwge1xuXHRzdWJtZW51OiBNZW51SWQuQ2hhdFRleHRFZGl0b3JNZW51LFxuXHRncm91cDogJzFfY2hhdCcsXG5cdG9yZGVyOiA1LFxuXHR0aXRsZTogbG9jYWxpemUoJ2dlbmVyYXRlQ29kZScsIFwiR2VuZXJhdGUgQ29kZVwiKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdClcbn0pO1xuXG4vLyAtLS0gQ2hhdCBEZWZhdWx0IFZpc2liaWxpdHlcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZURlZmF1bHRWaXNpYmlsaXR5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRvZ2dsZURlZmF1bHRWaXNpYmlsaXR5Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQudG9nZ2xlRGVmYXVsdFZpc2liaWxpdHkubGFiZWwnLCBcIlNob3cgVmlldyBieSBEZWZhdWx0XCIpLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNlY29uZGFyeVNpZGVCYXIuZGVmYXVsdFZpc2liaWxpdHknLCAnaGlkZGVuJykubmVnYXRlKCksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQ2hhdFZpZXdJZCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnBhbmVsTG9jYXRpb24uaXNFcXVhbFRvKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0Z3JvdXA6ICc1X2NvbmZpZ3VyZSdcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY3VycmVudFZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2hpZGRlbicgfCB1bmtub3duPignd29ya2JlbmNoLnNlY29uZGFyeVNpZGVCYXIuZGVmYXVsdFZpc2liaWxpdHknKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnd29ya2JlbmNoLnNlY29uZGFyeVNpZGVCYXIuZGVmYXVsdFZpc2liaWxpdHknLCBjdXJyZW50VmFsdWUgIT09ICdoaWRkZW4nID8gJ2hpZGRlbicgOiAndmlzaWJsZScpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEVkaXRUb29sQXBwcm92YWwgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZWRpdFRvb2xBcHByb3ZhbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LmVkaXRUb29sQXBwcm92YWwubGFiZWwnLCBcIk1hbmFnZSBUb29sIEFwcHJvdmFsXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMignY2hhdC5lZGl0VG9vbEFwcHJvdmFsLmRlc2NyaXB0aW9uJywgXCJFZGl0L21hbmFnZSB0aGUgdG9vbCBhcHByb3ZhbCBhbmQgY29uZmlybWF0aW9uIHByZWZlcmVuY2VzIGZvciBBSSBjaGF0IGFnZW50cy5cIiksXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNjb3BlPzogJ3dvcmtzcGFjZScgfCAncHJvZmlsZScgfCAnc2Vzc2lvbicpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maXJtYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRcdGNvbmZpcm1hdGlvblNlcnZpY2UubWFuYWdlQ29uZmlybWF0aW9uUHJlZmVyZW5jZXMoWy4uLnRvb2xzU2VydmljZS5nZXRBbGxUb29sc0luY2x1ZGluZ0Rpc2FibGVkKCldLCBzY29wZSA/IHsgZGVmYXVsdFNjb3BlOiBzY29wZSB9IDogdW5kZWZpbmVkKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGFBQWE7QUFFdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBRXBCLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFpQyxRQUFRLGNBQWMsdUJBQXVCO0FBQ3ZGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCLHdCQUF3QjtBQUNqRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUErQztBQUN4RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixPQUFPLGFBQWE7QUFDcEIsU0FBUyxhQUFhLDhCQUE4QjtBQUNwRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3Qiw2QkFBNkI7QUFDOUQsU0FBUyxpQkFBaUIsK0JBQStCO0FBQ3pELFNBQVMsY0FBYyxrQkFBa0Isa0JBQWtCO0FBQzNELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCLGFBQWE7QUFDL0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsZ0RBQW9GO0FBQzdGLFNBQVMsbUJBQW1CO0FBQzVCLFNBQTJCLHlCQUF5QjtBQUNwRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLGdCQUEyQjtBQUNwQyxTQUFTLGtCQUFrQixjQUFjLDJCQUEyQjtBQUVwRSxTQUF3RCxtQkFBbUI7QUFDM0UsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxtQkFBbUIsbUJBQW1CLGNBQWMsa0NBQWtDLHdDQUF3QztBQUN2SSxTQUFTLHlDQUF5QztBQUNsRCxTQUFxQyw4QkFBOEI7QUFDbkUsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyw4Q0FBOEM7QUFDdkQsU0FBUyw0QkFBaUQsV0FBVyxtQ0FBbUM7QUFDeEcsU0FBUyxZQUF5QixvQkFBb0IsOEJBQThCO0FBRXBGLFNBQVMsaUJBQWlCLDJDQUEyQztBQUNyRSxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQiw0QkFBNEI7QUFDM0QsU0FBUyxvQkFBb0I7QUFHdEIsTUFBTSxnQkFBZ0IsVUFBVSxpQkFBaUIsTUFBTTtBQUU5RCxNQUFNLHFDQUFxQztBQUVwQyxNQUFNLHFCQUFxQjtBQUMzQixNQUFNLDZCQUE2QjtBQUNuQyxNQUFNLHNCQUFzQjtBQUM1QixNQUFNLHNCQUFzQjtBQUM1QixNQUFNLHVCQUF1QjtBQUM3QixNQUFNLHlDQUF5QztBQUN0RCxNQUFNLHdCQUF3QjtBQUV2QixNQUFNLHlDQUF5QztBQUMvQyxNQUFNLDZDQUE2QztBQUNuRCxNQUFNLDZCQUE2QjtBQUNuQyxNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLDJCQUEyQjtBQUNqQyxNQUFNLHNDQUFzQztBQUM1QyxNQUFNLGlDQUFpQztBQUU5QyxNQUFNLGNBQWM7QUFBQSxFQUNuQixVQUFVLFFBQVEsa0JBQWtCLFlBQVksRUFBRSxZQUFZLEVBQUUsSUFBSSxHQUFHLEVBQUU7QUFBQSxFQUN6RSw0QkFBNEIsUUFBUSxrQkFBa0IsOEJBQThCO0FBQUEsRUFDcEYsd0JBQXdCLFFBQVEsa0JBQWtCLDBCQUEwQjtBQUM3RTtBQThHTyxNQUFNLHNCQUFzQixJQUFJLE9BQU8sNEJBQTRCO0FBRTFFLE1BQU0sa0NBQWtDO0FBRXhDLE1BQWUsNkJBQTZCLFFBQVE7QUFBQSxFQUNuRCxZQUFZLFdBQWtHLE1BQWtCO0FBQy9ILFVBQU07QUFBQSxNQUNMLEdBQUc7QUFBQSxNQUNILE1BQU0sUUFBUTtBQUFBLE1BQ2QsSUFBSTtBQUFBLE1BQ0osVUFBVTtBQUFBLE1BQ1YsY0FBYyxlQUFlO0FBQUEsUUFDNUIsZ0JBQWdCLE1BQU0sT0FBTyxPQUFPO0FBQUEsUUFDcEMsZ0JBQWdCLE1BQU0sb0JBQW9CLE9BQU87QUFBQSxNQUNsRDtBQUFBLElBQ0QsQ0FBQztBQVY0RztBQUFBLEVBVzlHO0FBQUEsRUFFQSxNQUFlLElBQUksVUFBNEIsTUFBeUc7QUFDdkosV0FBTyxPQUFPLFNBQVMsV0FBVyxFQUFFLE9BQU8sS0FBSyxJQUFJO0FBRXBELFVBQU0sY0FBYyxTQUFTLElBQUksWUFBWTtBQUM3QyxVQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCO0FBQ3JELFVBQU0sZUFBZSxTQUFTLElBQUksMEJBQTBCO0FBQzVELFVBQU0sY0FBYyxTQUFTLElBQUksWUFBWTtBQUM3QyxVQUFNLG1CQUFtQixTQUFTLElBQUksaUJBQWlCO0FBQ3ZELFVBQU0sZUFBZSxTQUFTLElBQUkscUJBQXFCO0FBQ3ZELFVBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFVBQU0sY0FBYyxTQUFTLElBQUksWUFBWTtBQUM3QyxVQUFNLHVCQUF1QixTQUFTLElBQUksc0JBQXNCO0FBQ2hFLFVBQU0sYUFBYSxTQUFTLElBQUksV0FBVztBQUMzQyxVQUFNLGFBQWEsU0FBUyxJQUFJLFdBQVc7QUFDM0MsVUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUUvRCxRQUFJLGFBQWEsY0FBYztBQUcvQixRQUFJLENBQUMsS0FBSyxRQUFRLENBQUMsY0FBYyxDQUFDLDBCQUEwQixXQUFXLE9BQU8sR0FBRztBQUNoRixtQkFBYSxNQUFNLGNBQWMsYUFBYTtBQUFBLElBQy9DO0FBRUEsUUFBSSxDQUFDLFlBQVk7QUFDaEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxlQUFlLE1BQU0sT0FBTyxXQUFXLE1BQU0sb0JBQW9CLElBQUksRUFBRSxlQUFlLEtBQUssSUFBSSxJQUFJLEtBQUs7QUFDOUcsUUFBSSxjQUFjO0FBQ2pCLFlBQU0sS0FBSyxtQkFBbUIsY0FBYyxZQUFZLGNBQWMsY0FBYztBQUFBLElBQ3JGO0FBRUEsUUFBSSxNQUFNLGVBQWU7QUFDeEIsWUFBTSxNQUFNLE1BQU0scUJBQXFCLHFCQUFxQixLQUFLLGFBQWE7QUFDOUUsWUFBTSxLQUFLLElBQUksS0FBSyxFQUFFLEdBQUcsQ0FBQztBQUMxQixVQUFJLENBQUMsSUFBSTtBQUNSLGNBQU0sSUFBSSxNQUFNLCtDQUErQyxLQUFLLFVBQVUsS0FBSyxhQUFhLENBQUMsR0FBRztBQUFBLE1BQ3JHO0FBRUEsWUFBTSxRQUFRLHFCQUFxQixvQkFBb0IsRUFBRTtBQUN6RCxVQUFJLENBQUMsT0FBTztBQUNYLGNBQU0sSUFBSSxNQUFNLDhCQUE4QixFQUFFLEdBQUc7QUFBQSxNQUNwRDtBQUVBLGlCQUFXLE1BQU0sd0JBQXdCLEVBQUUsVUFBVSxPQUFPLFlBQVksR0FBRyxHQUFHLElBQUk7QUFBQSxJQUNuRjtBQUVBLFFBQUksTUFBTSxnQkFBZ0IsTUFBTSxjQUFjO0FBQzdDLFlBQU0sUUFBUSxXQUFXLE1BQU0sc0JBQXNCLElBQUksR0FBRztBQUM1RCxZQUFNLFdBQVcsTUFBTSxLQUFLLGFBQWEsU0FBUyxLQUFLLENBQUM7QUFDeEQsWUFBTSxjQUFjLE1BQU0sS0FBSyxhQUFhLG9CQUFvQixLQUFLLENBQUM7QUFFdEUsWUFBTSxTQUFTLHlCQUF5QjtBQUFBLFFBQ3ZDO0FBQUEsUUFDQTtBQUFBLFFBQ0EsY0FBYyxLQUFLO0FBQUEsUUFDbkIsY0FBYyxLQUFLO0FBQUEsTUFDcEIsQ0FBQztBQUVELGlCQUFXLGNBQWMsT0FBTyxvQkFBb0I7QUFDbkQsbUJBQVcsS0FBSyx1Q0FBdUMsVUFBVSx3Q0FBd0M7QUFBQSxNQUMxRztBQUVBLGlCQUFXLE1BQU0sbUJBQW1CLElBQUksT0FBTyxlQUFlLElBQUk7QUFBQSxJQUNuRTtBQUVBLFFBQUksTUFBTSxrQkFBa0IsVUFBVSxXQUFXLFdBQVc7QUFDM0QsaUJBQVcsRUFBRSxTQUFTLFNBQVMsS0FBSyxLQUFLLGtCQUFrQjtBQUMxRCxvQkFBWSxtQkFBbUIsV0FBVyxVQUFVLGlCQUFpQixTQUFTLFFBQVcsR0FBRyxFQUFFLFNBQVMsU0FBUyxDQUFDO0FBQUEsTUFDbEg7QUFBQSxJQUNEO0FBQ0EsUUFBSSxNQUFNLGtCQUFrQjtBQUMzQixZQUFNLGFBQWEsTUFBTSxZQUFZLGNBQWM7QUFDbkQsVUFBSSxZQUFZO0FBQ2YsbUJBQVcsZ0JBQWdCLFdBQVcsa0NBQWtDLFVBQVUsQ0FBQztBQUFBLE1BQ3BGO0FBQUEsSUFDRDtBQUNBLFFBQUksTUFBTSxhQUFhO0FBQ3RCLGlCQUFXLFFBQVEsS0FBSyxhQUFhO0FBQ3BDLGNBQU0sTUFBTSxnQkFBZ0IsTUFBTSxPQUFPLEtBQUs7QUFDOUMsY0FBTSxRQUFRLGdCQUFnQixNQUFNLFNBQVksS0FBSztBQUVyRCxZQUFJLE1BQU0sWUFBWSxPQUFPLEdBQUcsR0FBRztBQUNsQyxxQkFBVyxnQkFBZ0IsUUFBUSxLQUFLLEtBQUs7QUFBQSxRQUM5QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsUUFBSSxNQUFNLDBCQUEwQjtBQUNuQyxpQkFBVyxxQkFBcUIsS0FBSywwQkFBMEI7QUFDOUQsY0FBTSxhQUFhLFdBQVcsY0FBYyxJQUFJLEtBQUssa0JBQWtCLElBQUksSUFBSSxDQUFDO0FBQ2hGLGNBQU0sa0JBQWtCLFlBQVksU0FBUyxnQkFBZ0IsSUFBSTtBQUNqRSxZQUFJLENBQUMsaUJBQWlCO0FBQ3JCO0FBQUEsUUFDRDtBQUVBLGNBQU0sY0FBYyxNQUFNLGdCQUFnQixtQkFBbUIsa0JBQWtCLGFBQWE7QUFDNUYsWUFBSSxDQUFDLGFBQWE7QUFDakI7QUFBQSxRQUNEO0FBRUEsbUJBQVcsZ0JBQWdCLFdBQVc7QUFBQSxVQUNyQyxJQUFJLGtCQUFrQixJQUFJLFNBQVM7QUFBQSxVQUNuQyxNQUFNLEdBQUcsU0FBUyxrQkFBa0IsR0FBRyxDQUFDO0FBQUEsVUFDeEMsT0FBTyxrQkFBa0I7QUFBQSxVQUN6QjtBQUFBLFVBQ0EsTUFBTTtBQUFBLFFBQ1AsQ0FBOEM7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFDQSxRQUFJLE1BQU0sK0JBQStCO0FBQ3hDLGlCQUFXLDBCQUEwQixLQUFLLCtCQUErQjtBQUN4RSxjQUFNLGFBQWEsV0FBVyxjQUFjLElBQUksS0FBSyx1QkFBdUIsSUFBSSxJQUFJLElBQUksQ0FBQztBQUN6RixjQUFNLGtCQUFrQixZQUFZLFNBQVMsZ0JBQWdCLElBQUk7QUFDakUsWUFBSSxDQUFDLGNBQWMsQ0FBQyxpQkFBaUI7QUFDcEM7QUFBQSxRQUNEO0FBRUEsY0FBTSxDQUFDLGtCQUFrQixjQUFjLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxVQUM1RCxnQkFBZ0IsbUJBQW1CLHVCQUF1QixNQUFNLGFBQWE7QUFBQSxVQUM3RSxnQkFBZ0IsbUJBQW1CLHVCQUF1QixJQUFJLGFBQWE7QUFBQSxRQUM1RSxDQUFDO0FBQ0QsWUFBSSxDQUFDLG9CQUFvQixDQUFDLGdCQUFnQjtBQUN6QztBQUFBLFFBQ0Q7QUFFQSxjQUFNLE1BQU0sdUJBQXVCLElBQUksSUFBSSxLQUFLO0FBQUEsVUFDL0MsUUFBUSx5Q0FBeUM7QUFBQSxVQUNqRCxPQUFPLEtBQUssVUFBVTtBQUFBLFlBQ3JCLGNBQWMsV0FBVztBQUFBLFlBQ3pCLE9BQU8saUJBQWlCO0FBQUEsWUFDeEIsS0FBSyx1QkFBdUIsSUFBSTtBQUFBLFVBQ2pDLENBQThDO0FBQUEsUUFDL0MsQ0FBQztBQUVELG1CQUFXLGdCQUFnQixXQUFXO0FBQUEsVUFDckMsSUFBSSxJQUFJLFNBQVM7QUFBQSxVQUNqQixNQUFNLEdBQUcsU0FBUyxHQUFHLENBQUM7QUFBQSxVQUN0QixPQUFPO0FBQUEsVUFDUCx3QkFBd0I7QUFBQSxZQUN2QixLQUFLLHVCQUF1QixNQUFNO0FBQUEsWUFDbEMsYUFBYTtBQUFBLFVBQ2Q7QUFBQSxVQUNBLHNCQUFzQjtBQUFBLFlBQ3JCLEtBQUssdUJBQXVCLElBQUk7QUFBQSxZQUNoQyxhQUFhO0FBQUEsY0FDWixHQUFHO0FBQUEsY0FDSCxXQUFXLHVCQUF1QixJQUFJO0FBQUEsWUFDdkM7QUFBQSxVQUNEO0FBQUEsVUFDQSxNQUFNO0FBQUEsUUFDUCxDQUFtRDtBQUFBLE1BQ3BEO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFFSixRQUFJLE1BQU0sT0FBTztBQUVoQixVQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLG1CQUFXLE1BQU0seUJBQXlCO0FBQzFDLG1CQUFXLFNBQVMsS0FBSyxLQUFLO0FBQUEsTUFDL0IsT0FBTztBQUNOLFlBQUksQ0FBQyxXQUFXLFdBQVc7QUFDMUIsZ0JBQU0sTUFBTSxVQUFVLFdBQVcsb0JBQW9CO0FBQUEsUUFDdEQ7QUFDQSxjQUFNLG9CQUFvQixrQkFBa0IsV0FBVyxNQUFNLGVBQWU7QUFDNUUsWUFBSSxLQUFLLGVBQWU7QUFFdkIsaUJBQU8sV0FBVyxZQUFZLEtBQUssT0FBTyxFQUFFLGVBQWUsS0FBSyxDQUFDO0FBQUEsUUFDbEUsT0FBTztBQUNOLHFCQUFXLFNBQVMsS0FBSyxLQUFLO0FBQzlCLGlCQUFPLFdBQVcsWUFBWTtBQUFBLFFBQy9CO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sV0FBVyxLQUFLLFFBQVEsU0FBUyxHQUFHO0FBQzdDLGlCQUFXLFVBQVUsS0FBSyxTQUFTO0FBQ2xDLGNBQU0sT0FBTyxhQUFhLFFBQVEsTUFBTTtBQUN4QyxZQUFJLE1BQU07QUFDVCxxQkFBVyxnQkFBZ0IsV0FBVztBQUFBLFlBQ3JDLElBQUksS0FBSztBQUFBLFlBQ1QsTUFBTSxLQUFLO0FBQUEsWUFDWCxVQUFVLEtBQUs7QUFBQSxZQUNmLE9BQU87QUFBQSxZQUNQLE1BQU0sVUFBVSxZQUFZLEtBQUssSUFBSSxJQUFJLEtBQUssT0FBTztBQUFBLFlBQ3JELE1BQU07QUFBQSxVQUNQLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxlQUFXLFdBQVc7QUFFdEIsUUFBSSxNQUFNLGlCQUFpQjtBQUMxQixZQUFNLFdBQVcsTUFBTTtBQUN2QixVQUFJLFVBQVU7QUFDYixjQUFNLG1CQUFtQixxQkFBcUIsU0FBa0Isa0JBQWtCLFNBQVM7QUFDM0YsY0FBTSxJQUFJLFFBQWMsYUFBVztBQUNsQyxnQkFBTSxJQUFJLFNBQVMsWUFBWSxZQUFZO0FBQzFDLGdCQUFJLFNBQVMsWUFBWTtBQUN4QixnQkFBRSxRQUFRO0FBQ1Ysc0JBQVE7QUFDUjtBQUFBLFlBQ0Q7QUFFQSxrQkFBTSxzQkFBc0IsU0FBUyxzQkFBc0IsSUFBSTtBQUMvRCxnQkFBSSxxQkFBcUI7QUFJeEIsb0JBQU0sNkJBQTZCLFNBQVMsU0FBUyxNQUFNO0FBQUEsZ0JBQzFELFVBQVEsS0FBSyxTQUFTLHNCQUFzQixDQUFDLEtBQUs7QUFBQSxjQUNuRDtBQUNBLGtCQUFJLG9CQUFvQiw0QkFBNEI7QUFFbkQ7QUFBQSxjQUNEO0FBQ0EsZ0JBQUUsUUFBUTtBQUNWLHNCQUFRO0FBQUEsWUFDVDtBQUFBLFVBQ0QsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUVELGNBQU0sbUJBQW1CLDJCQUEyQixRQUFRO0FBQzVELFlBQUksa0JBQWtCO0FBQ3JCLGlCQUFPLEVBQUUsR0FBRyxTQUFTLFFBQVEsR0FBRyxpQkFBaUI7QUFBQSxRQUNsRDtBQUNBLGVBQU8sRUFBRSxHQUFHLFNBQVMsT0FBTztBQUFBLE1BQzdCO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLG1CQUFtQixjQUF5QixZQUF5QixjQUFxQyxnQkFBZ0Q7QUFDdkssVUFBTSxjQUFjLFdBQVcsTUFBTTtBQUVyQyxRQUFJLGNBQWM7QUFDakIsWUFBTSxRQUFRLFdBQVcsV0FBVztBQUNwQyxZQUFNLGdCQUFnQixRQUFRLE1BQU0sYUFBYSxlQUFlLGtCQUFrQixhQUFhLGFBQWEsTUFBTSxNQUFNLFlBQVksRUFBRSxRQUFRLEtBQUssSUFBSSxFQUFFLG9CQUFvQixNQUFNO0FBQ25MLFVBQUksQ0FBQyxlQUFlO0FBQ25CO0FBQUEsTUFDRDtBQUNBLGlCQUFXLE1BQU0sWUFBWSxhQUFhLElBQUksTUFBTSxJQUFJO0FBRXhELFVBQUksY0FBYyxvQkFBb0I7QUFDckMsY0FBTSxlQUFlLGVBQWUsa0JBQWtCO0FBQUEsTUFDdkQ7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRUEsZUFBZSxvQkFBb0Isa0JBQXFDLE1BQW1DO0FBQzFHLFFBQU0sZUFBZSxpQkFBaUIsZ0JBQWdCLGtCQUFrQixNQUFNLElBQUk7QUFDbEYsTUFBSSxjQUFjO0FBQ2pCO0FBQUEsRUFDRDtBQUVBLFFBQU0sUUFBUSxLQUFLO0FBQUEsSUFDbEIsTUFBTSxVQUFVLE1BQU0sT0FBTyxpQkFBaUIsbUJBQW1CLE1BQU07QUFDdEUsWUFBTUEsZ0JBQWUsaUJBQWlCLGdCQUFnQixrQkFBa0IsTUFBTSxJQUFJO0FBQ2xGLGFBQU8sUUFBUUEsYUFBWTtBQUFBLElBQzVCLENBQUMsQ0FBQztBQUFBLElBQ0YsUUFBUSxHQUFNLEVBQUUsS0FBSyxNQUFNO0FBQUUsWUFBTSxJQUFJLE1BQU0scUNBQXFDO0FBQUEsSUFBRyxDQUFDO0FBQUEsRUFDdkYsQ0FBQztBQUNGO0FBZ0JBLFNBQVMsMkJBQTJCLFVBQXdFO0FBQzNHLGFBQVcsUUFBUSxTQUFTLFNBQVMsT0FBTztBQUMzQyxRQUFJLEtBQUssU0FBUyxrQkFBa0I7QUFDbkMsWUFBTSxRQUFRLEtBQUssTUFBTSxJQUFJO0FBQzdCLFVBQUksTUFBTSxTQUFTLG9CQUFvQixVQUFVLHdCQUF3QjtBQUN4RSxlQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixRQUFRLEtBQUs7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUNBLFVBQUksTUFBTSxTQUFTLG9CQUFvQixVQUFVLHdCQUF3QjtBQUN4RSxlQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixRQUFRLEtBQUs7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssU0FBUyxrQkFBa0IsQ0FBQyxLQUFLLFFBQVE7QUFDakQsYUFBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sT0FBTyxLQUFLO0FBQUEsUUFDWixNQUFNLEtBQUs7QUFBQSxNQUNaO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxTQUFTLHNCQUFzQixDQUFDLEtBQUssUUFBUTtBQUNyRCxhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixXQUFXLEtBQUs7QUFBQSxNQUNqQjtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssU0FBUyxrQkFBa0IsS0FBSyxNQUFNLElBQUksTUFBTSxpQkFBaUIsU0FBUztBQUNsRixZQUFNLFFBQVEsS0FBSztBQUNuQixhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixPQUFPLE9BQU8sVUFBVSxXQUFXLFFBQVEsTUFBTTtBQUFBLE1BQ2xEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFFQSxNQUFNLG9DQUFvQyxxQkFBcUI7QUFBQSxFQUM5RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLFlBQVksV0FBVztBQUFBLE1BQ3hDLFlBQVk7QUFBQSxRQUNYLFFBQVEsaUJBQWlCO0FBQUEsUUFDekIsU0FBUyxPQUFPLFVBQVUsT0FBTyxNQUFNLFFBQVE7QUFBQSxRQUMvQyxLQUFLO0FBQUEsVUFDSixTQUFTLE9BQU8sVUFBVSxPQUFPLFVBQVUsUUFBUTtBQUFBLFFBQ3BEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFFTyxTQUFTLDJCQUEyQixNQUF5QjtBQUNuRSxTQUFPLDZCQUE2QixLQUFLLEtBQUssSUFBSSxDQUFDO0FBQ3BEO0FBRU8sTUFBZSxpQ0FBaUMscUJBQXFCO0FBQUEsRUFDM0UsWUFBWSxNQUFpQixZQUFtRDtBQUMvRSxVQUFNO0FBQUEsTUFDTCxJQUFJLDJCQUEyQixJQUFJO0FBQUEsTUFDbkMsT0FBTyxVQUFVLGdCQUFnQixtQkFBbUIsS0FBSyxNQUFNLElBQUksQ0FBQztBQUFBLE1BQ3BFO0FBQUEsSUFDRCxHQUFHLElBQUk7QUFBQSxFQUNSO0FBQ0Q7QUFFTyxTQUFTLHNCQUFzQjtBQWpsQnRDO0FBc2xCQyxXQUFTLDJCQUEyQixVQUFpQztBQUNwRSxXQUFPLGlDQUFpQyxTQUFTLElBQUkscUJBQXFCLEdBQUcsU0FBUyxJQUFJLG9CQUFvQixHQUFHLFNBQVMsSUFBSSxlQUFlLEdBQUcsU0FBUyxJQUFJLHdCQUF3QixFQUFFLGFBQWEsR0FBRyxTQUFTLElBQUksMkJBQTJCLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxFQUMvUDtBQUVBLGtCQUFnQiwyQkFBMkI7QUFDM0Msa0JBQWdCLGNBQWMseUJBQXlCO0FBQUEsSUFDdEQsY0FBYztBQUFFLFlBQU0sU0FBUyxHQUFHO0FBQUEsSUFBRztBQUFBLEVBQ3RDLENBQUM7QUFDRCxrQkFBZ0IsY0FBYyx5QkFBeUI7QUFBQSxJQUN0RCxjQUFjO0FBQ2IsWUFBTSxTQUFTLE9BQU87QUFBQSxRQUNyQixNQUFNLGVBQWUsSUFBSSxVQUFVLGtCQUFrQixZQUFZLEVBQUU7QUFBQSxRQUNuRSxRQUFRLGlCQUFpQjtBQUFBLFFBQ3pCLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRO0FBQUEsUUFDakQsT0FBTztBQUFBLFVBQ04sU0FBUyxPQUFPLFVBQVUsT0FBTyxNQUFNLE9BQU8sUUFBUSxRQUFRO0FBQUEsUUFDL0Q7QUFBQSxNQUNELENBQUU7QUFBQSxJQUNIO0FBQUEsRUFDRCxDQUFDO0FBQ0Qsa0JBQWdCLGNBQWMseUJBQXlCO0FBQUEsSUFDdEQsY0FBYztBQUFFLFlBQU0sU0FBUyxJQUFJO0FBQUEsSUFBRztBQUFBLEVBQ3ZDLENBQUM7QUFFRCxrQkFBZ0IsTUFBTSx5QkFBeUIsUUFBUTtBQUFBLElBQ3RELGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsY0FBYyxhQUFhO0FBQUEsUUFDNUMsVUFBVTtBQUFBLE1BQ1gsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sSUFBSSxVQUE0QjtBQUNyQyxZQUFNLGdCQUFnQixTQUFTLElBQUksdUJBQXVCO0FBQzFELFlBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxZQUFNLHdCQUF3QixTQUFTLElBQUksc0JBQXNCO0FBQ2pFLFlBQU0sZ0JBQWdCLFNBQVMsSUFBSSxrQkFBa0I7QUFFckQsWUFBTSxlQUFlLHNCQUFzQixvQkFBb0IsVUFBVTtBQUN6RSxZQUFNLGNBQWMsYUFBYSxjQUFjLFVBQVU7QUFDekQsVUFBSSxhQUFhO0FBQ2hCLGFBQUsscUJBQXFCLGVBQWUsY0FBYyxLQUFLO0FBQUEsTUFDN0QsT0FBTztBQUNOLGFBQUsscUJBQXFCLGVBQWUsY0FBYyxJQUFJO0FBQzNELFNBQUMsTUFBTSxjQUFjLGFBQWEsSUFBSSxXQUFXO0FBQUEsTUFDbEQ7QUFBQSxJQUNEO0FBQUEsSUFFUSxxQkFBcUIsZUFBd0MsVUFBd0MsU0FBd0I7QUFDcEksVUFBSTtBQUNKLGNBQVEsVUFBVTtBQUFBLFFBQ2pCLEtBQUssc0JBQXNCO0FBQzFCLGlCQUFPLE1BQU07QUFDYjtBQUFBLFFBQ0QsS0FBSyxzQkFBc0I7QUFDMUIsaUJBQU8sTUFBTTtBQUNiO0FBQUEsUUFDRCxLQUFLLHNCQUFzQjtBQUMxQixpQkFBTyxNQUFNO0FBQ2I7QUFBQSxNQUNGO0FBRUEsVUFBSSxNQUFNO0FBQ1Qsc0JBQWMsY0FBYyxDQUFDLFNBQVMsSUFBSTtBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUdELGtCQUFnQixNQUFNLDRCQUE0QixRQUFRO0FBQUEsSUFDekQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSwyQkFBMkIsaUJBQWlCO0FBQUEsUUFDN0QsTUFBTSxRQUFRO0FBQUEsUUFDZCxJQUFJO0FBQUEsUUFDSixVQUFVO0FBQUEsUUFDVixjQUFjLGdCQUFnQjtBQUFBLFFBQzlCLFlBQVk7QUFBQSxVQUNYLFFBQVEsaUJBQWlCO0FBQUEsVUFDekIsU0FBUyxPQUFPLFVBQVUsUUFBUTtBQUFBLFVBQ2xDLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixlQUFlLGdCQUFnQixZQUFZO0FBQUEsUUFDckY7QUFBQSxRQUNBLE1BQU0sQ0FBQztBQUFBLFVBQ04sSUFBSSxPQUFPO0FBQUEsVUFDWCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUixHQUFHO0FBQUEsVUFDRixJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxRQUNSLEdBQUc7QUFBQSxVQUNGLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsTUFBTSxlQUFlLElBQUksb0JBQW9CLFVBQVUsZ0JBQWdCLFFBQVEsR0FBRyxnQkFBZ0IsNEJBQTRCLFlBQVksU0FBUyxHQUFHLGdCQUFnQiw0QkFBNEIsWUFBWSxhQUFhLEdBQUcsZ0JBQWdCLDRCQUE0QixZQUFZLFNBQVMsQ0FBQztBQUFBLFVBQ2hTLE9BQU87QUFBQSxRQUNSLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBQUEsSUFFQSxNQUFNLElBQUksVUFBNEI7QUFDckMsWUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGtCQUFrQjtBQUNyRCxZQUFNLGNBQWMsWUFBWSwyQkFBMkIsUUFBUSxHQUFHLGNBQWMsRUFBRSxRQUFRLEtBQUssQ0FBOEI7QUFBQSxJQUNsSTtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLHVDQUF1QyxRQUFRO0FBQUEsSUFDcEUsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUksc0JBQXNCO0FBQUEsUUFDMUIsT0FBTyxVQUFVLDJCQUEyQixpQkFBaUI7QUFBQSxRQUM3RCxNQUFNLFFBQVE7QUFBQSxRQUNkLElBQUk7QUFBQSxRQUNKLFVBQVU7QUFBQSxRQUNWLGNBQWMsZ0JBQWdCO0FBQUEsUUFDOUIsTUFBTSxDQUFDO0FBQUEsVUFDTixJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE1BQU0sZUFBZSxJQUFJLG9CQUFvQixVQUFVLGdCQUFnQixRQUFRLEdBQUcsZ0JBQWdCLDRCQUE0QixVQUFVLFNBQVMsQ0FBQztBQUFBLFVBQ2xKLE9BQU87QUFBQSxRQUNSLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBQUEsSUFFQSxNQUFNLElBQUksVUFBNEI7QUFDckMsWUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGtCQUFrQjtBQUNyRCxZQUFNLGNBQWMsWUFBWSwyQkFBMkIsUUFBUSxHQUFHLGNBQWMsRUFBRSxRQUFRLEtBQUssQ0FBOEI7QUFBQSxJQUNsSTtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLDBDQUEwQyxRQUFRO0FBQUEsSUFDdkUsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUksc0JBQXNCO0FBQUEsUUFDMUIsT0FBTyxVQUFVLDJCQUEyQixpQkFBaUI7QUFBQSxRQUM3RCxNQUFNLFFBQVE7QUFBQSxRQUNkLElBQUk7QUFBQSxRQUNKLFVBQVU7QUFBQSxRQUNWLGNBQWMsZ0JBQWdCO0FBQUEsUUFDOUIsTUFBTSxDQUFDO0FBQUEsVUFDTixJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE1BQU0sZUFBZSxJQUFJLG9CQUFvQixVQUFVLGdCQUFnQixRQUFRLEdBQUcsZ0JBQWdCLDRCQUE0QixVQUFVLGFBQWEsQ0FBQztBQUFBLFVBQ3RKLE9BQU87QUFBQSxRQUNSLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBQUEsSUFFQSxNQUFNLElBQUksVUFBNEI7QUFDckMsWUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGtCQUFrQjtBQUNyRCxZQUFNLGNBQWMsWUFBWSwyQkFBMkIsUUFBUSxHQUFHLGNBQWMsRUFBRSxRQUFRLEtBQUssQ0FBOEI7QUFBQSxJQUNsSTtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLHVDQUF1QyxRQUFRO0FBQUEsSUFDcEUsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUksc0JBQXNCO0FBQUEsUUFDMUIsT0FBTyxVQUFVLDJCQUEyQixpQkFBaUI7QUFBQSxRQUM3RCxNQUFNLFFBQVE7QUFBQSxRQUNkLElBQUk7QUFBQSxRQUNKLFVBQVU7QUFBQSxRQUNWLGNBQWMsZ0JBQWdCO0FBQUEsUUFDOUIsTUFBTSxDQUFDO0FBQUEsVUFDTixJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE1BQU0sZUFBZSxJQUFJLG9CQUFvQixVQUFVLGdCQUFnQixRQUFRLEdBQUcsZ0JBQWdCLDRCQUE0QixVQUFVLFNBQVMsQ0FBQztBQUFBLFVBQ2xKLE9BQU87QUFBQSxRQUNSLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBQUEsSUFFQSxNQUFNLElBQUksVUFBNEI7QUFDckMsWUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGtCQUFrQjtBQUNyRCxZQUFNLGNBQWMsWUFBWSwyQkFBMkIsUUFBUSxHQUFHLGNBQWMsRUFBRSxRQUFRLEtBQUssQ0FBOEI7QUFBQSxJQUNsSTtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLGtDQUFrQyxRQUFRO0FBQUEsSUFDL0QsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxpQ0FBaUMsNkJBQTZCO0FBQUEsUUFDL0UsSUFBSTtBQUFBLFFBQ0osVUFBVTtBQUFBLFFBQ1YsY0FBYyxnQkFBZ0I7QUFBQSxNQUMvQixDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsTUFBTSxJQUFJLFVBQTRCO0FBQ3JDLFlBQU0sZ0JBQWdCLFNBQVMsSUFBSSxrQkFBa0I7QUFDckQsWUFBTSxjQUFjLFlBQVksMkJBQTJCLFFBQVEsR0FBRyxZQUFZLEVBQUUsUUFBUSxLQUFLLENBQThCO0FBQUEsSUFDaEk7QUFBQSxFQUNELENBQUM7QUFFRCxrQkFBZ0IsTUFBTSw0QkFBNEIsUUFBUTtBQUFBLElBQ3pELGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsb0NBQW9DLGlCQUFpQjtBQUFBLFFBQ3RFLElBQUk7QUFBQSxRQUNKLFVBQVU7QUFBQSxRQUNWLGNBQWMsZ0JBQWdCO0FBQUEsUUFDOUIsTUFBTSxDQUFDO0FBQUEsVUFDTixJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxRQUNSLEdBQUc7QUFBQSxVQUNGLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFFBQ1IsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sSUFBSSxVQUE0QjtBQUNyQyxZQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCO0FBQ3JELFlBQU0sY0FBYyxZQUFZLDJCQUEyQixRQUFRLEdBQUcsa0JBQWtCLEVBQUUsUUFBUSxNQUFNLFdBQVcsRUFBRSxTQUFTLE1BQU0sUUFBUSxFQUFFLE9BQU8sS0FBSyxRQUFRLElBQUksRUFBRSxFQUFFLENBQThCO0FBQUEsSUFDek07QUFBQSxFQUNELENBQUM7QUFFRCxrQkFBZ0IsTUFBTSxvQ0FBb0MsUUFBUTtBQUFBLElBQ2pFLGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUseUNBQXlDLHFCQUFxQjtBQUFBLFFBQy9FLGNBQWMsZ0JBQWdCO0FBQUEsUUFDOUIsVUFBVTtBQUFBLFFBQ1YsSUFBSTtBQUFBLE1BQ0wsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUNBLE1BQU0sSUFBSSxhQUErQixNQUFpQjtBQUN6RCxZQUFNLGlCQUFpQixTQUFTLElBQUkseUJBQXlCO0FBQzdELHFCQUFlLGFBQWE7QUFBQSxJQUM3QjtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLHdCQUF3QixjQUFjO0FBQUEsSUFDM0QsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxvQ0FBb0MsaUJBQWlCO0FBQUEsUUFDdEUsY0FBYyxlQUFlLElBQUksZ0JBQWdCLFdBQVc7QUFBQSxRQUM1RCxVQUFVO0FBQUEsUUFDVixZQUFZO0FBQUE7QUFBQSxVQUVYO0FBQUEsWUFDQyxNQUFNLGVBQWUsSUFBSSxnQkFBZ0Isa0JBQWtCLGdCQUFnQixZQUFZLE9BQU8sQ0FBQztBQUFBLFlBQy9GLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxZQUNsQyxRQUFRLGlCQUFpQjtBQUFBLFVBQzFCO0FBQUE7QUFBQSxVQUVBO0FBQUEsWUFDQyxNQUFNLGVBQWUsSUFBSSxlQUFlLEdBQUcsa0JBQWtCLGNBQWMsR0FBRyxnQkFBZ0IsWUFBWSxPQUFPLENBQUM7QUFBQSxZQUNsSCxTQUFTLE9BQU8sVUFBVSxRQUFRO0FBQUEsWUFDbEMsUUFBUSxpQkFBaUI7QUFBQSxVQUMxQjtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixlQUFlLGdCQUFnQixXQUFXO0FBQUEsWUFDbkYsU0FBUyxPQUFPLFVBQVUsUUFBUTtBQUFBLFlBQ2xDLFFBQVEsaUJBQWlCO0FBQUEsVUFDMUI7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsaUJBQWlCLFVBQTRCLFFBQTJDO0FBQ3ZGLFlBQU0sWUFBWSxPQUFPLFNBQVMsR0FBRztBQUNyQyxVQUFJLFdBQVc7QUFDZCxjQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCO0FBQ3JELHNCQUFjLG9CQUFvQixTQUFTLEdBQUcsa0JBQWtCO0FBQUEsTUFDakU7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsa0JBQWdCLE1BQU0sMkNBQTJDLGNBQWM7QUFBQSxJQUM5RSxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxVQUFVLCtDQUErQyxtQ0FBbUM7QUFBQSxRQUNuRyxjQUFjLGVBQWUsSUFBSSxnQkFBZ0IsV0FBVztBQUFBLFFBQzVELFVBQVU7QUFBQSxRQUNWLFlBQVk7QUFBQTtBQUFBLFVBRVg7QUFBQSxZQUNDLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixrQkFBa0IsZ0JBQWdCLFlBQVksT0FBTyxDQUFDO0FBQUEsWUFDL0YsU0FBUyxPQUFPLFVBQVUsUUFBUSxVQUFVLE9BQU87QUFBQSxZQUNuRCxRQUFRLGlCQUFpQixnQkFBZ0I7QUFBQSxVQUMxQztBQUFBO0FBQUEsVUFFQTtBQUFBLFlBQ0MsTUFBTSxlQUFlLElBQUksZUFBZSxHQUFHLGtCQUFrQixjQUFjLEdBQUcsZ0JBQWdCLFlBQVksT0FBTyxDQUFDO0FBQUEsWUFDbEgsU0FBUyxPQUFPLFVBQVUsUUFBUSxVQUFVLE9BQU87QUFBQSxZQUNuRCxRQUFRLGlCQUFpQixnQkFBZ0I7QUFBQSxVQUMxQztBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixlQUFlLGdCQUFnQixXQUFXO0FBQUEsWUFDbkYsU0FBUyxPQUFPLFVBQVUsUUFBUSxZQUFZLE9BQU87QUFBQSxZQUNyRCxRQUFRLGlCQUFpQixtQkFBbUI7QUFBQSxVQUM3QztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsSUFFQSxpQkFBaUIsVUFBNEIsUUFBMkM7QUFDdkYsWUFBTSxZQUFZLE9BQU8sU0FBUyxHQUFHO0FBQ3JDLFVBQUksV0FBVztBQUNkLGNBQU0sZ0JBQWdCLFNBQVMsSUFBSSxrQkFBa0I7QUFDckQsc0JBQWMsb0JBQW9CLFNBQVMsR0FBRyxrQkFBa0IsSUFBSTtBQUFBLE1BQ3JFO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLDZCQUE2QixRQUFRO0FBQUEsSUFDMUQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSx1Q0FBdUMsa0JBQWtCO0FBQUEsUUFDMUUsSUFBSTtBQUFBLFFBQ0osWUFBWTtBQUFBLFVBQ1g7QUFBQSxZQUNDLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxZQUNsQyxRQUFRLGlCQUFpQjtBQUFBLFlBQ3pCLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixlQUFlLGdCQUFnQixZQUFZLE9BQU8sR0FBRyxnQkFBZ0IsWUFBWSxPQUFPLENBQUM7QUFBQSxVQUNuSTtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixlQUFlLGdCQUFnQixZQUFZLE9BQU8sR0FBRyxnQkFBZ0IsV0FBVztBQUFBLFlBQ3pILFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxZQUNsQyxRQUFRLGlCQUFpQjtBQUFBLFVBQzFCO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUNBLElBQUksYUFBK0IsTUFBaUI7QUFDbkQsWUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGtCQUFrQjtBQUNyRCxvQkFBYyxtQkFBbUIsV0FBVztBQUFBLElBQzdDO0FBQUEsRUFDRCxDQUFDO0FBRUQsbUJBQWdCLG1CQUFtQyxRQUFRO0FBQUEsSUFHMUQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUksR0FBcUI7QUFBQSxRQUN6QixPQUFPLFVBQVUsMkNBQTJDLHNDQUFzQztBQUFBLFFBQ2xHLFVBQVU7QUFBQSxRQUNWLElBQUk7QUFBQSxRQUNKLGNBQWMsZ0JBQWdCLGFBQWEsVUFBVSxhQUFhLEtBQUs7QUFBQSxRQUN2RSxZQUFZLENBQUM7QUFBQSxVQUNaLFFBQVEsaUJBQWlCLG1CQUFtQjtBQUFBLFVBQzVDLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRO0FBQUEsVUFDakQsTUFBTSxlQUFlO0FBQUEsWUFDcEIsZUFBZSxJQUFJLGdCQUFnQixhQUFhLGdCQUFnQixhQUFhLFVBQVUsYUFBYSxLQUFLLENBQUM7QUFBQSxZQUMxRyxlQUFlLElBQUksZ0JBQWdCLGdCQUFnQixnQkFBZ0IsYUFBYSxVQUFVLGFBQWEsS0FBSyxDQUFDO0FBQUEsVUFDOUc7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBQUEsSUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFlBQU0sZ0JBQWdCLFNBQVMsSUFBSSxrQkFBa0I7QUFDckQsWUFBTSxTQUFTLGNBQWM7QUFFN0IsVUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLHFCQUFxQixHQUFHO0FBQzlDLGNBQU0sU0FBUyxrQ0FBa0Msb0NBQW9DLENBQUM7QUFBQSxNQUN2RjtBQUFBLElBQ0Q7QUFBQSxFQUNELEdBN0JnQixHQUNDLEtBQUssd0NBRE4sR0E2QmY7QUFFRCxtQkFBZ0IsbUJBQTBDLFFBQVE7QUFBQSxJQUdqRSxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSSxHQUE0QjtBQUFBLFFBQ2hDLE9BQU8sVUFBVSxrREFBa0QsK0NBQStDO0FBQUEsUUFDbEgsVUFBVTtBQUFBLFFBQ1YsSUFBSTtBQUFBLFFBQ0osY0FBYyxnQkFBZ0I7QUFBQSxRQUM5QixZQUFZLENBQUM7QUFBQSxVQUNaLFFBQVEsaUJBQWlCO0FBQUEsVUFDekIsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVE7QUFBQSxVQUNqRCxNQUFNLGVBQWUsSUFBSSxnQkFBZ0IsZUFBZSxnQkFBZ0IsUUFBUSxtQkFBbUI7QUFBQSxRQUNwRyxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsSUFBSSxVQUFrQztBQUNyQyxZQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCO0FBQ3JELFlBQU0sU0FBUyxjQUFjO0FBRTdCLFVBQUksQ0FBQyxVQUFVLENBQUMsT0FBTyw0QkFBNEIsR0FBRztBQUNyRCxjQUFNLFNBQVMsMENBQTBDLHNDQUFzQyxDQUFDO0FBQUEsTUFDakc7QUFBQSxJQUNEO0FBQUEsRUFDRCxHQTFCZ0IsR0FDQyxLQUFLLCtDQUROLEdBMEJmO0FBRUQsbUJBQWdCLG1CQUFxRCxRQUFRO0FBQUEsSUFHNUUsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUksR0FBdUM7QUFBQSxRQUMzQyxPQUFPLFVBQVUsNkNBQTZDLHlCQUF5QjtBQUFBLFFBQ3ZGLFVBQVU7QUFBQSxRQUNWLElBQUk7QUFBQSxRQUNKLGNBQWMsZUFBZSxJQUFJLGdCQUFnQixlQUFlLGdCQUFnQixRQUFRLG1CQUFtQjtBQUFBLFFBQzNHLFlBQVksQ0FBQztBQUFBLFVBQ1osUUFBUSxpQkFBaUI7QUFBQSxVQUN6QixTQUFTLE9BQU8sTUFBTSxRQUFRO0FBQUEsVUFDOUIsTUFBTSxlQUFlLElBQUksZ0JBQWdCLHdCQUF3QixnQkFBZ0IsUUFBUSxtQkFBbUI7QUFBQSxRQUM3RyxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsSUFBSSxVQUFrQztBQUNyQyxZQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCO0FBQ3JELG9CQUFjLG1CQUFtQiwyQkFBMkI7QUFBQSxJQUM3RDtBQUFBLEVBQ0QsR0F0QmdCLEdBQ0MsS0FBSywwQ0FETixHQXNCZjtBQUVELG1CQUFnQixtQkFBaUQsUUFBUTtBQUFBLElBR3hFLGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJLEdBQW1DO0FBQUEsUUFDdkMsT0FBTyxVQUFVLHlDQUF5QyxxQkFBcUI7QUFBQSxRQUMvRSxVQUFVO0FBQUEsUUFDVixJQUFJO0FBQUEsUUFDSixjQUFjLGVBQWUsSUFBSSxnQkFBZ0IsZUFBZSxnQkFBZ0IsUUFBUSxtQkFBbUI7QUFBQSxRQUMzRyxZQUFZLENBQUM7QUFBQSxVQUNaLFFBQVEsaUJBQWlCO0FBQUEsVUFDekIsU0FBUyxPQUFPLE1BQU0sUUFBUTtBQUFBLFVBQzlCLE1BQU0sZUFBZSxJQUFJLGdCQUFnQix3QkFBd0IsZ0JBQWdCLFFBQVEsbUJBQW1CO0FBQUEsUUFDN0csQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLElBQUksVUFBa0M7QUFDckMsWUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGtCQUFrQjtBQUNyRCxvQkFBYyxtQkFBbUIsdUJBQXVCO0FBQUEsSUFDekQ7QUFBQSxFQUNELEdBdEJnQixHQUNDLEtBQUssc0NBRE4sR0FzQmY7QUFFRCxtQkFBZ0IsbUJBQWtELFFBQVE7QUFBQSxJQUd6RSxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSSxHQUFvQztBQUFBLFFBQ3hDLE9BQU8sVUFBVSwwREFBMEQsNkNBQTZDO0FBQUEsUUFDeEgsVUFBVTtBQUFBLFFBQ1YsSUFBSTtBQUFBLFFBQ0osY0FBYyxlQUFlLElBQUksZ0JBQWdCLGVBQWUsZ0JBQWdCLFFBQVEscUJBQXFCLGdCQUFnQiwrQkFBK0I7QUFBQSxRQUM1SixZQUFZLENBQUM7QUFBQSxVQUNaLFFBQVEsaUJBQWlCO0FBQUEsVUFDekIsU0FBUyxPQUFPLE1BQU0sUUFBUTtBQUFBLFVBQzlCLE1BQU0sZUFBZSxJQUFJLGdCQUFnQix3QkFBd0IsZ0JBQWdCLFFBQVEscUJBQXFCLGdCQUFnQiwrQkFBK0I7QUFBQSxRQUM5SixDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsSUFBSSxVQUFrQztBQUNyQyxZQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCO0FBQ3JELG9CQUFjLG1CQUFtQiw4QkFBOEI7QUFBQSxJQUNoRTtBQUFBLEVBQ0QsR0F0QmdCLEdBQ0MsS0FBSyx1REFETixHQXNCZjtBQUVELG1CQUFnQixtQkFBZ0MsUUFBUTtBQUFBLElBSXZELGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJLEdBQWtCO0FBQUEsUUFDdEIsT0FBTyxVQUFVLHdDQUF3Qyw2Q0FBNkM7QUFBQSxRQUN0RyxVQUFVO0FBQUEsUUFDVixJQUFJO0FBQUE7QUFBQTtBQUFBLFFBR0osY0FBYyxlQUFlLEdBQUcsZ0JBQWdCLGVBQWUsZ0JBQWdCLGNBQWM7QUFBQSxRQUM3RixZQUFZLENBQUM7QUFBQSxVQUNaLFFBQVEsaUJBQWlCO0FBQUEsVUFDekIsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVE7QUFBQSxVQUNqRCxNQUFNLGVBQWU7QUFBQSxZQUNwQixnQkFBZ0I7QUFBQSxZQUNoQixnQkFBZ0I7QUFBQSxZQUNoQixnQkFBZ0I7QUFBQSxVQUNqQjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLElBQUksVUFBa0M7QUFHckMsVUFBSSxDQUFDLFNBQVMsSUFBSSwwQkFBMEIsRUFBRSxrQkFBa0IsR0FBRztBQUNsRSxjQUFNLFNBQVMsZ0NBQWdDLGlCQUFpQixDQUFDO0FBQUEsTUFDbEU7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBaENnQixHQUVDLEtBQUssa0NBRk4sR0FnQ2Y7QUFFRCxrQkFBZ0IsTUFBTSwrQkFBK0IsUUFBUTtBQUFBLElBQzVELGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsNkNBQTZDLDJCQUEyQjtBQUFBLFFBQ3pGLFVBQVU7QUFBQSxRQUNWLElBQUk7QUFBQSxRQUNKLGNBQWMsZ0JBQWdCO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxZQUFNLGdCQUFnQixTQUFTLElBQUksa0JBQWtCO0FBQ3JELFlBQU0sU0FBUyxjQUFjLHFCQUFzQixNQUFNLGNBQWMsYUFBYTtBQUNwRixjQUFRLE1BQU0sd0JBQXdCO0FBQUEsSUFDdkM7QUFBQSxFQUNELENBQUM7QUFFRCxrQkFBZ0IsTUFBTSwyQ0FBMkMsUUFBUTtBQUFBLElBQ3hFLGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUseURBQXlELHNCQUFzQjtBQUFBLFFBQ2hHLFVBQVU7QUFBQSxRQUNWLGNBQWMsZ0JBQWdCO0FBQUEsUUFDOUIsTUFBTTtBQUFBLFVBQ0wsSUFBSSxPQUFPO0FBQUEsVUFDWCxPQUFPO0FBQUEsVUFDUCxNQUFNLGVBQWU7QUFBQSxZQUNwQixnQkFBZ0I7QUFBQSxZQUNoQixnQkFBZ0Isd0JBQXdCLFVBQVUsa0NBQWtDO0FBQUEsVUFDckY7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsTUFBTSxJQUFJLFdBQTZCLFFBQXFDO0FBRTNFLFlBQU0sUUFBUSxZQUFZLFlBQVksRUFBRSxlQUFlLEtBQUssQ0FBQztBQUFBLElBQzlEO0FBQUEsRUFDRCxDQUFDO0FBRUQsa0JBQWdCLE1BQU0scUNBQXFDLFFBQVE7QUFBQSxJQUNsRSxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxVQUFVLHlCQUF5QixvQkFBb0I7QUFBQSxRQUM5RCxVQUFVO0FBQUEsUUFDVixTQUFTLGVBQWUsT0FBTyxVQUFVLGtCQUFrQix1QkFBdUIsSUFBSSxJQUFJO0FBQUEsUUFDMUYsTUFBTTtBQUFBLFVBQ0wsSUFBSSxPQUFPO0FBQUEsVUFDWCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsVUFDUCxNQUFNLGdCQUFnQixhQUFhLE9BQU87QUFBQSxRQUMzQztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxZQUFNLHVCQUF1QixTQUFTLElBQUkscUJBQXFCO0FBQy9ELFlBQU0sZUFBZSxxQkFBcUIsU0FBa0Isa0JBQWtCLHVCQUF1QjtBQUNyRyxZQUFNLHFCQUFxQixZQUFZLGtCQUFrQix5QkFBeUIsQ0FBQyxZQUFZO0FBQUEsSUFDaEc7QUFBQSxFQUNELENBQUM7QUFFRCxRQUFNLDRCQUE0QixlQUFlLElBQUksZ0JBQWdCLFNBQVMsZUFBZSxVQUFVLFVBQVUsWUFBWSwwQkFBMEIsaUJBQWlCLFlBQVksU0FBUyxXQUFXLEVBQUUsQ0FBQztBQUMzTSxrQkFBZ0IsY0FBYyxRQUFRO0FBQUEsSUFDckMsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxjQUFjLHlCQUF5QjtBQUFBLFFBQ3hELFVBQVU7QUFBQSxRQUNWLElBQUk7QUFBQSxRQUNKLGNBQWMsZUFBZTtBQUFBLFVBQzVCLGVBQWU7QUFBQSxZQUNkLGdCQUFnQixZQUFZO0FBQUEsWUFDNUIsZ0JBQWdCLFlBQVk7QUFBQSxZQUM1QixnQkFBZ0IsWUFBWTtBQUFBLFlBQzVCLGdCQUFnQixZQUFZO0FBQUEsWUFDNUIsZ0JBQWdCLFlBQVk7QUFBQSxVQUM3QjtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDTCxJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxVQUNQLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsTUFBZSxJQUFJLFVBQTJDO0FBQzdELFlBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFlBQU0sd0JBQXdCLFNBQVMsSUFBSSxzQkFBc0I7QUFDakUsb0JBQWMsS0FBSyxJQUFJLE1BQU0sc0JBQXNCLGlCQUFpQixZQUFZLGVBQWUsQ0FBQyxDQUFDO0FBQUEsSUFDbEc7QUFBQSxFQUNELENBQUM7QUFFRCxrQkFBZ0IsTUFBTSxtQ0FBbUMsUUFBUTtBQUFBLElBRWhFLGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsOEJBQThCLCtCQUErQjtBQUFBLFFBQzlFLElBQUk7QUFBQSxRQUNKLFVBQVU7QUFBQSxRQUNWLGNBQWMsZ0JBQWdCO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQWUsSUFBSSxVQUEyQztBQUM3RCxZQUFNLDZCQUE2QixTQUFTLElBQUksMkJBQTJCO0FBQzNFLGlDQUEyQixXQUFXLGVBQWUsOEJBQThCLEVBQUU7QUFBQSxJQUN0RjtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLG9DQUFvQyxRQUFRO0FBQUEsSUFFakUsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSx3QkFBd0IsaUNBQWlDO0FBQUEsUUFDMUUsY0FBYyxlQUFlO0FBQUEsVUFDNUIsZ0JBQWdCLE1BQU07QUFBQSxVQUN0QixnQkFBZ0IsTUFBTSxTQUFTLE9BQU87QUFBQSxVQUN0QyxnQkFBZ0IsTUFBTSxVQUFVLE9BQU87QUFBQSxRQUN4QztBQUFBLFFBQ0EsTUFBTTtBQUFBLFVBQ0wsSUFBSSxPQUFPO0FBQUEsVUFDWCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQWUsSUFBSSxVQUEyQztBQUM3RCxZQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxxQkFBZSxlQUFlLFlBQVksc0JBQXNCO0FBQUEsSUFDakU7QUFBQSxFQUNELENBQUM7QUFFRCxrQkFBZ0IsTUFBTSxzQ0FBc0MsUUFBUTtBQUFBLElBRW5FLGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFNBQVMsZUFBZSw2QkFBNkI7QUFBQSxNQUM3RCxDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsTUFBZSxJQUFJLFVBQTRCO0FBQzlDLFlBQU0seUJBQXlCLFNBQVMsSUFBSSx1QkFBdUI7QUFDbkUsWUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsWUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsWUFBTSxtQkFBbUIsU0FBUyxJQUFJLGlCQUFpQjtBQUV2RCxVQUFJO0FBQ0osWUFBTSxvQkFBb0IsdUJBQXVCLE9BQU8sTUFBTSxxQkFBcUI7QUFDbkYsWUFBTSwyQkFBMkIsdUJBQXVCLE9BQU8sYUFBYSxxQkFBcUI7QUFDakcsVUFBSSxxQkFBcUIsQ0FBQywwQkFBMEI7QUFDbkQsa0JBQVUsU0FBUyxxQkFBcUIsb0dBQW9HO0FBQUEsTUFDN0ksV0FBVyw0QkFBNEIsQ0FBQyxtQkFBbUI7QUFDMUQsa0JBQVUsU0FBUyw0QkFBNEIsb0dBQW9HO0FBQUEsTUFDcEosT0FBTztBQUNOLGtCQUFVLFNBQVMsbUNBQW1DLHlFQUF5RTtBQUFBLE1BQ2hJO0FBRUEsVUFBSSx1QkFBdUIsT0FBTyxXQUFXO0FBQzVDLGNBQU0sZ0JBQWdCLHVCQUF1QixPQUFPLG1CQUFtQixTQUFTLGVBQWUsVUFBVSxFQUFFLE1BQU0sV0FBVyxPQUFPLFFBQVEsS0FBSyxXQUFXLE1BQU0sV0FBVyxRQUFRLFVBQVUsQ0FBQyxJQUFJLFNBQVMsZUFBZSxVQUFVLEVBQUUsTUFBTSxXQUFXLE9BQU8sUUFBUSxLQUFLLFVBQVUsQ0FBQztBQUN2UixjQUFNLGlCQUFpQixJQUFJLEtBQUssdUJBQXVCLE9BQU8sU0FBUztBQUN2RSxrQkFBVSxDQUFDLFNBQVMsU0FBUyxrQkFBa0Isb0NBQW9DLGNBQWMsTUFBTSxPQUFPLGNBQWMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHO0FBQUEsTUFDekk7QUFFQSxZQUFNLE9BQU8sdUJBQXVCLGdCQUFnQixnQkFBZ0I7QUFDcEUsWUFBTSxlQUFlLE9BQU8sU0FBUyxnQkFBZ0IsMkhBQTJILElBQUk7QUFFcEwsWUFBTSxjQUFjLE9BQU87QUFBQSxRQUMxQixNQUFNO0FBQUEsUUFDTixTQUFTLFNBQVMsdUJBQXVCLDhCQUE4QjtBQUFBLFFBQ3ZFLGNBQWM7QUFBQSxVQUNiLE9BQU8sU0FBUyxXQUFXLFNBQVM7QUFBQSxVQUNwQyxLQUFLLE1BQU07QUFBQSxVQUFhO0FBQUEsUUFDekI7QUFBQSxRQUNBLFNBQVM7QUFBQSxVQUNSO0FBQUEsWUFDQyxPQUFPLE9BQU8sU0FBUyxjQUFjLCtCQUErQixJQUFJLFNBQVMsZUFBZSw2QkFBNkI7QUFBQSxZQUM3SCxLQUFLLE1BQU07QUFDVixvQkFBTSxZQUFZO0FBQ2xCLCtCQUFpQixXQUFnRiwyQkFBMkIsRUFBRSxJQUFJLFdBQVcsTUFBTSxjQUFjLENBQUM7QUFDbEssNkJBQWUsZUFBZSxTQUFTO0FBQUEsWUFDeEM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0EsUUFBUTtBQUFBLFVBQ1AsTUFBTSxRQUFRO0FBQUEsVUFDZCxpQkFBaUIsU0FBUztBQUFBLFlBQ3pCLEVBQUUsVUFBVSxJQUFJLGVBQWUsU0FBUyxJQUFJLEVBQUU7QUFBQSxZQUM5QyxlQUFlLEVBQUUsVUFBVSxJQUFJLGVBQWUsY0FBYyxJQUFJLEVBQUUsSUFBSTtBQUFBLFVBQ3ZFLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLGdDQUFnQyxRQUFRO0FBQUEsSUFDN0QsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxxQkFBcUIsMEJBQTBCO0FBQUEsUUFDaEUsVUFBVTtBQUFBLFFBQ1YsSUFBSTtBQUFBLFFBQ0osY0FBYyxnQkFBZ0I7QUFBQSxNQUMvQixDQUFDO0FBQUEsSUFDRjtBQUFBLElBQ1MsSUFBSSxVQUFrQztBQUM5QyxlQUFTLElBQUksc0NBQXNDLEVBQUUsMEJBQTBCO0FBQy9FLGVBQVMsSUFBSSxvQkFBb0IsRUFBRSxLQUFLLFNBQVMsNEJBQTRCLGdEQUFnRCxDQUFDO0FBQUEsSUFDL0g7QUFBQSxFQUNELENBQUM7QUFFRCxrQkFBZ0IsTUFBTSxtQ0FBbUMsUUFBUTtBQUFBLElBQ2hFLGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsd0JBQXdCLDZCQUE2QjtBQUFBLFFBQ3RFLFVBQVU7QUFBQSxRQUNWLE1BQU0sUUFBUTtBQUFBLFFBQ2QsSUFBSTtBQUFBLFFBQ0osY0FBYyxnQkFBZ0I7QUFBQSxNQUMvQixDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFlBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFlBQU0sZUFBZSxlQUFlLDhCQUE4QjtBQUFBLFFBQ2pFLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxRQUNQLGdCQUFnQjtBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsa0JBQWdCLE1BQU0sa0NBQWtDLFFBQVE7QUFBQSxJQUMvRCxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxVQUFVLGdDQUFnQyxpQ0FBaUM7QUFBQSxRQUNsRixVQUFVO0FBQUEsUUFDVixNQUFNLFFBQVE7QUFBQSxRQUNkLElBQUk7QUFBQSxRQUNKLGNBQWMsZ0JBQWdCO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxZQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxZQUFNLGVBQWUsZUFBZSw4QkFBOEI7QUFBQSxRQUNqRSxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsUUFDUCxnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLDZCQUE2QixRQUFRO0FBQUEsSUFDMUQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxrQkFBa0Isc0JBQXNCO0FBQUEsUUFDekQsWUFBWSxVQUFVLHdCQUF3QixpQkFBaUI7QUFBQSxRQUMvRCxVQUFVO0FBQUEsUUFDVixNQUFNLFFBQVE7QUFBQSxRQUNkLElBQUk7QUFBQSxRQUNKLGNBQWMsZ0JBQWdCO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxZQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxZQUFNLGVBQWUsZUFBZSw4QkFBOEI7QUFBQSxRQUNqRSxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsUUFDUCxnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLDRCQUE0QixRQUFRO0FBQUEsSUFDekQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxpQkFBaUIsZ0JBQWdCO0FBQUEsUUFDbEQsWUFBWSxVQUFVLHVCQUF1QixnQkFBZ0I7QUFBQSxRQUM3RCxVQUFVO0FBQUEsUUFDVixNQUFNLFFBQVE7QUFBQSxRQUNkLElBQUk7QUFBQSxRQUNKLGNBQWMsZ0JBQWdCO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxZQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxZQUFNLGVBQWUsZUFBZSw4QkFBOEI7QUFBQSxRQUNqRSxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsUUFDUCxnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLDRCQUE0QixRQUFRO0FBQUEsSUFDekQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxpQkFBaUIsdUJBQXVCO0FBQUEsUUFDekQsWUFBWSxVQUFVLHVCQUF1QixnQkFBZ0I7QUFBQSxRQUM3RCxVQUFVO0FBQUEsUUFDVixNQUFNLFFBQVE7QUFBQSxRQUNkLElBQUk7QUFBQSxRQUNKLGNBQWMsZ0JBQWdCO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxZQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxZQUFNLGVBQWUsZUFBZSw4QkFBOEI7QUFBQSxRQUNqRSxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsUUFDUCxnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLDJCQUEyQixRQUFRO0FBQUEsSUFDeEQsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxnQkFBZ0IsZUFBZTtBQUFBLFFBQ2hELFlBQVksVUFBVSxzQkFBc0IsZUFBZTtBQUFBLFFBQzNELFVBQVU7QUFBQSxRQUNWLE1BQU0sUUFBUTtBQUFBLFFBQ2QsSUFBSTtBQUFBLFFBQ0osY0FBYyxnQkFBZ0I7QUFBQSxNQUMvQixDQUFDO0FBQUEsSUFDRjtBQUFBLElBRUEsTUFBTSxJQUFJLFVBQTJDO0FBQ3BELFlBQU0saUJBQWlCLFNBQVMsSUFBSSxlQUFlO0FBQ25ELFlBQU0sZUFBZSxlQUFlLDhCQUE4QjtBQUFBLFFBQ2pFLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxRQUNQLGdCQUFnQjtBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBRUQsa0JBQWdCLE1BQU0saURBQWlELFFBQVE7QUFBQSxJQUM5RSxjQUFjO0FBQ2IsWUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxVQUFVLHNDQUFzQyxxQkFBcUI7QUFBQSxRQUM1RSxZQUFZLFVBQVUsNENBQTRDLGNBQWM7QUFBQSxRQUNoRixVQUFVO0FBQUEsUUFDVixNQUFNLFFBQVE7QUFBQSxRQUNkLElBQUk7QUFBQSxRQUNKLGNBQWMsZ0JBQWdCO0FBQUEsTUFDL0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxZQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxZQUFNLGVBQWUsZUFBZSw4QkFBOEI7QUFBQSxRQUNqRSxPQUFPO0FBQUEsUUFDUCxnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUVELGtCQUFnQixNQUFNLDZDQUE2QyxRQUFRO0FBQUEsSUFDMUUsY0FBYztBQUNiLFlBQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxrQ0FBa0MsNkJBQTZCO0FBQUEsUUFDaEYsWUFBWSxVQUFVLHdDQUF3QyxzQkFBc0I7QUFBQSxRQUNwRixVQUFVO0FBQUEsUUFDVixJQUFJO0FBQUEsUUFDSixjQUFjLGdCQUFnQjtBQUFBLE1BQy9CLENBQUM7QUFBQSxJQUNGO0FBQUEsSUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsWUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFDbkQsWUFBTSxlQUFlLGVBQWUsOEJBQThCO0FBQUEsUUFDakUsT0FBTztBQUFBLFFBQ1AsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxrQkFBZ0IsTUFBTSxzQ0FBc0MsUUFBUTtBQUFBLElBQ25FLGNBQWM7QUFDYixZQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsMkJBQTJCLGVBQWU7QUFBQSxRQUMzRCxZQUFZLFNBQVMsaUNBQWlDLGVBQWU7QUFBQSxRQUNyRSxVQUFVO0FBQUEsUUFDVixJQUFJO0FBQUEsUUFDSixjQUFjLGdCQUFnQjtBQUFBLFFBQzlCLE1BQU07QUFBQSxVQUFDO0FBQUEsWUFDTixJQUFJO0FBQUEsWUFDSixNQUFNLGVBQWUsSUFBSSxnQkFBZ0IsU0FBUyxlQUFlLE9BQU8sUUFBUSxVQUFVLENBQUM7QUFBQSxZQUMzRixPQUFPO0FBQUEsWUFDUCxPQUFPO0FBQUEsVUFDUjtBQUFBLFVBQ0E7QUFBQSxZQUNDLElBQUksT0FBTztBQUFBLFlBQ1gsT0FBTztBQUFBLFlBQ1AsT0FBTztBQUFBLFVBQ1I7QUFBQSxVQUNBO0FBQUEsWUFDQyxJQUFJLE9BQU87QUFBQSxZQUNYLE1BQU0sZUFBZSxJQUFJLGdCQUFnQixTQUFTLGVBQWUsT0FBTyxRQUFRLFVBQVUsQ0FBQztBQUFBLFlBQzNGLE9BQU87QUFBQSxZQUNQLE9BQU87QUFBQSxVQUNSO0FBQUEsUUFBQztBQUFBLE1BQ0YsQ0FBQztBQUFBLElBQ0Y7QUFBQSxJQUVBLE1BQWUsSUFBSSxVQUEyQztBQUM3RCxZQUFNLHFCQUFxQixTQUFTLElBQUksbUJBQW1CO0FBQzNELHlCQUFtQixhQUFhLEVBQUUsT0FBTyxpQkFBaUIsQ0FBQztBQUFBLElBQzVEO0FBQUEsRUFDRCxDQUFDO0FBR0QsZUFBYSxlQUFlLE9BQU8sV0FBVztBQUFBLElBQzdDLFNBQVM7QUFBQSxNQUNSLElBQUksa0NBQWtDO0FBQUEsTUFDdEMsT0FBTyxVQUFVLDBCQUEwQixxQkFBcUI7QUFBQSxNQUNoRSxVQUFVO0FBQUEsTUFDVixNQUFNLFFBQVE7QUFBQSxJQUNmO0FBQUEsSUFDQSxPQUFPO0FBQUEsSUFDUCxNQUFNLGVBQWU7QUFBQSxNQUNwQixnQkFBZ0I7QUFBQSxNQUNoQixlQUFlLE9BQU8sUUFBUSxVQUFVO0FBQUEsSUFDekM7QUFBQSxJQUNBLE9BQU87QUFBQSxFQUNSLENBQUM7QUFDRjtBQUVPLFNBQVMsY0FBYyxNQUFzRCxjQUFjLE1BQWM7QUFDL0csTUFBSSxZQUFZLElBQUksR0FBRztBQUN0QixZQUFRLGNBQWMsR0FBRyxLQUFLLFFBQVEsT0FBTyxNQUFNLEtBQUs7QUFBQSxFQUN6RCxPQUFPO0FBQ04sWUFBUSxjQUFjLEdBQUcsS0FBSyxRQUFRLE9BQU8sTUFBTSxLQUFLLFNBQVMsU0FBUztBQUFBLEVBQzNFO0FBQ0Q7QUEwQk8sU0FBUyx5QkFBeUIsU0FBc0Q7QUFDOUYsUUFBTSxFQUFFLFVBQVUsYUFBYSxjQUFjLGFBQWEsSUFBSTtBQUU5RCxRQUFNLGdCQUFnQixvQkFBSSxJQUFtQztBQUM3RCxRQUFNLHFCQUFxQixvQkFBSSxJQUFZO0FBRzNDLFFBQU0sY0FBYyxDQUFDLE1BQWlCLGdCQUFzQztBQUMzRSxRQUFJLFlBQVksSUFBSSxLQUFLLEVBQUUsR0FBRztBQUM3Qix5QkFBbUIsSUFBSSxLQUFLLEVBQUU7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUsscUJBQXFCLFlBQVksSUFBSSxLQUFLLGlCQUFpQixHQUFHO0FBQ3RFLHlCQUFtQixJQUFJLEtBQUssaUJBQWlCO0FBQzdDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFHQSxRQUFNLGlCQUFpQixDQUFDLFNBQW1CLGdCQUFzQztBQUNoRixRQUFJLFlBQVksSUFBSSxRQUFRLEVBQUUsR0FBRztBQUNoQyx5QkFBbUIsSUFBSSxRQUFRLEVBQUU7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLFlBQVksSUFBSSxRQUFRLGFBQWEsR0FBRztBQUMzQyx5QkFBbUIsSUFBSSxRQUFRLGFBQWE7QUFDNUMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUdBLFFBQU0sMEJBQTBCLG9CQUFJLElBQWU7QUFHbkQsTUFBSSxjQUFjO0FBQ2pCLFVBQU0sYUFBYSxJQUFJLElBQUksWUFBWTtBQUd2QyxlQUFXLFdBQVcsYUFBYTtBQUNsQyxVQUFJLGVBQWUsU0FBUyxVQUFVLEdBQUc7QUFDeEMsbUJBQVcsUUFBUSxRQUFRLFNBQVMsR0FBRztBQUN0Qyx3QkFBYyxJQUFJLE1BQU0sSUFBSTtBQUFBLFFBQzdCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxlQUFXLFFBQVEsVUFBVTtBQUM1QixVQUFJLFlBQVksTUFBTSxVQUFVLEdBQUc7QUFDbEMsc0JBQWMsSUFBSSxNQUFNLElBQUk7QUFDNUIsZ0NBQXdCLElBQUksSUFBSTtBQUFBLE1BQ2pDLFdBQVcsQ0FBQyxjQUFjLElBQUksSUFBSSxHQUFHO0FBQ3BDLHNCQUFjLElBQUksTUFBTSxLQUFLO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBRUEsZUFBVyxXQUFXLGFBQWE7QUFDbEMsaUJBQVcsUUFBUSxRQUFRLFNBQVMsR0FBRztBQUN0QyxZQUFJLFlBQVksTUFBTSxVQUFVLEdBQUc7QUFDbEMsd0JBQWMsSUFBSSxNQUFNLElBQUk7QUFDNUIsa0NBQXdCLElBQUksSUFBSTtBQUFBLFFBQ2pDLFdBQVcsQ0FBQyxjQUFjLElBQUksSUFBSSxHQUFHO0FBQ3BDLHdCQUFjLElBQUksTUFBTSxLQUFLO0FBQUEsUUFDOUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsT0FBTztBQUVOLGVBQVcsUUFBUSxVQUFVO0FBQzVCLG9CQUFjLElBQUksTUFBTSxJQUFJO0FBQUEsSUFDN0I7QUFDQSxlQUFXLFdBQVcsYUFBYTtBQUNsQyxpQkFBVyxRQUFRLFFBQVEsU0FBUyxHQUFHO0FBQ3RDLHNCQUFjLElBQUksTUFBTSxJQUFJO0FBQUEsTUFDN0I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUdBLE1BQUksY0FBYztBQUNqQixVQUFNLGFBQWEsSUFBSSxJQUFJLFlBQVk7QUFJdkMsZUFBVyxXQUFXLGFBQWE7QUFDbEMsVUFBSSxlQUFlLFNBQVMsVUFBVSxHQUFHO0FBQ3hDLG1CQUFXLFFBQVEsUUFBUSxTQUFTLEdBQUc7QUFFdEMsY0FBSSxDQUFDLHdCQUF3QixJQUFJLElBQUksR0FBRztBQUN2QywwQkFBYyxJQUFJLE1BQU0sS0FBSztBQUFBLFVBQzlCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsZUFBVyxRQUFRLFVBQVU7QUFDNUIsVUFBSSxZQUFZLE1BQU0sVUFBVSxHQUFHO0FBQ2xDLHNCQUFjLElBQUksTUFBTSxLQUFLO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQ0EsZUFBVyxXQUFXLGFBQWE7QUFDbEMsaUJBQVcsUUFBUSxRQUFRLFNBQVMsR0FBRztBQUN0QyxZQUFJLFlBQVksTUFBTSxVQUFVLEdBQUc7QUFDbEMsd0JBQWMsSUFBSSxNQUFNLEtBQUs7QUFBQSxRQUM5QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUdBLFFBQU0saUJBQWlCLG9CQUFJLElBQUksQ0FBQyxHQUFJLGdCQUFnQixDQUFDLEdBQUksR0FBSSxnQkFBZ0IsQ0FBQyxDQUFFLENBQUM7QUFDakYsUUFBTSxxQkFBK0IsQ0FBQztBQUN0QyxhQUFXLGNBQWMsZ0JBQWdCO0FBQ3hDLFFBQUksQ0FBQyxtQkFBbUIsSUFBSSxVQUFVLEdBQUc7QUFDeEMseUJBQW1CLEtBQUssVUFBVTtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUdBLFFBQU0sbUJBQW1CLE1BQU0sS0FBSyxjQUFjLFFBQVEsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDLE1BQU0sT0FBTyxNQUFNLFdBQVcsQ0FBQyxVQUFVLElBQUksQ0FBQyxFQUFFO0FBQ3RILE1BQUkscUJBQXFCLEdBQUc7QUFDM0IsVUFBTSxJQUFJLE1BQU0sbUZBQW1GO0FBQUEsRUFDcEc7QUFHQSxhQUFXLFdBQVcsYUFBYTtBQUNsQyxVQUFNLGVBQWUsTUFBTSxLQUFLLFFBQVEsU0FBUyxDQUFDO0FBQ2xELFVBQU0sa0JBQWtCLGFBQWEsU0FBUyxLQUFLLGFBQWEsTUFBTSxPQUFLLGNBQWMsSUFBSSxDQUFDLE1BQU0sSUFBSTtBQUN4RyxrQkFBYyxJQUFJLFNBQVMsZUFBZTtBQUFBLEVBQzNDO0FBRUEsU0FBTyxFQUFFLGVBQWUsNEJBQTRCLFFBQVEsYUFBYSxHQUFHLG1CQUFtQjtBQUNoRztBQU1BLGVBQXNCLDRCQUE0QixPQUFtQixRQUE0QixlQUFpRDtBQUNqSixTQUFPLG9DQUFvQyxPQUFPLGVBQWUsRUFBRSxpQkFBaUIsT0FBTyxDQUFDO0FBQzdGO0FBS0EsZUFBc0IsaUJBQ3JCLFVBQ0EsVUFDQSxRQUNBLGNBQ0EsT0FDbUQ7QUFDbkQsTUFBSSxDQUFDLE9BQU8sa0JBQWtCLGFBQWEsUUFBUTtBQUNsRCxXQUFPLEVBQUUsb0JBQW9CLE1BQU07QUFBQSxFQUNwQztBQUVBLFFBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFFBQU0sb0JBQW9CLGFBQWEsYUFBYSxRQUFRLFdBQVcsYUFBYSxTQUFTLGVBQWU7QUFDNUcsTUFBSSxrQkFBa0I7QUFFckIsVUFBTSxTQUFTLFNBQVMsNEJBQTRCLHNEQUFzRDtBQUUxRyxVQUFNLGVBQWUsTUFBTSxlQUFlLFFBQVEsSUFBSTtBQUN0RCxVQUFNLGlCQUFpQixhQUFhLE9BQU8sQ0FBQyxTQUFTLEtBQUssTUFBTSxJQUFJLE1BQU0sdUJBQXVCLFFBQVE7QUFDekcsUUFBSSxlQUFlLFNBQVMsR0FBRztBQUM5QixVQUFJLENBQUMsTUFBTSw0QkFBNEIsT0FBTyxRQUFRLGFBQWEsR0FBRztBQUNyRSxlQUFPO0FBQUEsTUFDUjtBQUVBLGFBQU8sRUFBRSxvQkFBb0IsS0FBSztBQUFBLElBQ25DLE9BQU87QUFDTixZQUFNLGVBQWUsTUFBTSxjQUFjLFFBQVE7QUFBQSxRQUNoRCxPQUFPLFNBQVMsb0JBQW9CLG9CQUFvQjtBQUFBLFFBQ3hELFNBQVMsU0FBUywyQkFBMkIsNEZBQTRGO0FBQUEsUUFDekksZUFBZSxTQUFTLDRCQUE0QixLQUFLO0FBQUEsUUFDekQsTUFBTTtBQUFBLE1BQ1AsQ0FBQztBQUNELFVBQUksQ0FBQyxhQUFhLFdBQVc7QUFDNUIsZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPLEVBQUUsb0JBQW9CLEtBQUs7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFFQSxTQUFPLEVBQUUsb0JBQW9CLE1BQU07QUFDcEM7QUFZQSxlQUFzQiwrQkFBK0IsVUFBNEIsUUFBcUIsYUFBZ0Q7QUFDckosUUFBTSxlQUFlLFNBQVMsSUFBSSxhQUFhO0FBQy9DLFFBQU0sa0JBQWtCLE9BQU8sV0FBVyxNQUFNO0FBQ2hELFFBQU0scUJBQXFCLGtCQUFrQixtQkFBbUIsZUFBZSxJQUFJO0FBQ25GLFFBQU0sRUFBRSxhQUFhLGVBQWUsSUFBSSxpQ0FBaUMsVUFBVSxFQUFFLGtCQUFrQixhQUFhLG1CQUFtQixDQUFDO0FBQ3hJLE1BQUksdUJBQXVCLE9BQU8sV0FBVyxHQUFHO0FBQy9DLFVBQU0sT0FBTyxNQUFNLGFBQWEsU0FBUyxVQUFVO0FBQ25ELFFBQUksbUJBQW1CLHNCQUFzQjtBQUU1QyxZQUFNLEtBQUssWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLGdCQUFnQixNQUFNLGFBQWEsYUFBYSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDakcsT0FBTztBQUtOLFlBQU0sS0FBSyxxQkFBcUI7QUFBQSxJQUNqQztBQUFBLEVBQ0QsT0FBTztBQUlOLFVBQU0sT0FBTyxNQUFNLGNBQWM7QUFBQSxFQUNsQztBQUNEO0FBS0EsYUFBYSxlQUFlLE9BQU8sZUFBZTtBQUFBLEVBQ2pELFNBQVMsT0FBTztBQUFBLEVBQ2hCLE9BQU87QUFBQSxFQUNQLE9BQU87QUFBQSxFQUNQLE9BQU8sU0FBUyxnQkFBZ0IsZUFBZTtBQUFBLEVBQy9DLE1BQU0sZUFBZTtBQUFBLElBQ3BCLGdCQUFnQixNQUFNLE9BQU8sT0FBTztBQUFBLElBQ3BDLGdCQUFnQixNQUFNLG9CQUFvQixPQUFPO0FBQUEsRUFDbEQ7QUFDRCxDQUFDO0FBSUQsZ0JBQWdCLE1BQU0sc0NBQXNDLFFBQVE7QUFBQSxFQUNuRSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHNDQUFzQyxzQkFBc0I7QUFBQSxNQUM3RSxTQUFTLGVBQWUsT0FBTyx1REFBdUQsUUFBUSxFQUFFLE9BQU87QUFBQSxNQUN2RyxJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsUUFDTCxJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU0sZUFBZTtBQUFBLFVBQ3BCLGVBQWUsT0FBTyxRQUFRLFVBQVU7QUFBQSxVQUN4QyxnQkFBZ0IsY0FBYyxVQUFVLHNCQUFzQixZQUFZO0FBQUEsUUFDM0U7QUFBQSxRQUNBLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTRCO0FBQ3JDLFVBQU0sdUJBQXVCLFNBQVMsSUFBSSxxQkFBcUI7QUFFL0QsVUFBTSxlQUFlLHFCQUFxQixTQUE2Qiw4Q0FBOEM7QUFDckgseUJBQXFCLFlBQVksZ0RBQWdELGlCQUFpQixXQUFXLFdBQVcsU0FBUztBQUFBLEVBQ2xJO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixNQUFNLHlCQUF5QixRQUFRO0FBQUEsRUFDdEQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSwrQkFBK0Isc0JBQXNCO0FBQUEsTUFDdEUsVUFBVTtBQUFBLFFBQ1QsYUFBYSxVQUFVLHFDQUFxQyxnRkFBZ0Y7QUFBQSxNQUM3STtBQUFBLE1BQ0EsY0FBYyxnQkFBZ0I7QUFBQSxNQUM5QixJQUFJO0FBQUEsTUFDSixVQUFVO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTRCLE9BQTREO0FBQ2pHLFVBQU0sc0JBQXNCLFNBQVMsSUFBSSxzQ0FBc0M7QUFDL0UsVUFBTSxlQUFlLFNBQVMsSUFBSSwwQkFBMEI7QUFDNUQsd0JBQW9CLDhCQUE4QixDQUFDLEdBQUcsYUFBYSw2QkFBNkIsQ0FBQyxHQUFHLFFBQVEsRUFBRSxjQUFjLE1BQU0sSUFBSSxNQUFTO0FBQUEsRUFDaEo7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJkZWZhdWx0QWdlbnQiXQp9Cg==
