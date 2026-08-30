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
import { coalesce } from "../../../../../../../base/common/arrays.js";
import { decodeBase64 } from "../../../../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { StopWatch } from "../../../../../../../base/common/stopwatch.js";
import { isPatternInWord } from "../../../../../../../base/common/filters.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { basename } from "../../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { assertType } from "../../../../../../../base/common/types.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../../base/common/uuid.js";
import { getCodeEditor, isCodeEditor } from "../../../../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../../../../editor/common/config/editorOptions.js";
import { CompletionItemKind, SymbolKinds } from "../../../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../../../editor/common/services/languageFeatures.js";
import { IOutlineModelService } from "../../../../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { localize } from "../../../../../../../nls.js";
import { Action2, registerAction2 } from "../../../../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { FileKind, IFileService } from "../../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../../../../platform/registry/common/platform.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { Extensions as WorkbenchExtensions } from "../../../../../../common/contributions.js";
import { EditorsOrder, isDiffEditorInput } from "../../../../../../common/editor.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { IHistoryService } from "../../../../../../services/history/common/history.js";
import { LifecyclePhase } from "../../../../../../services/lifecycle/common/lifecycle.js";
import { ISearchService } from "../../../../../../services/search/common/search.js";
import { McpPromptArgumentPick } from "../../../../../mcp/browser/mcpPromptArgumentPick.js";
import { IMcpService, McpResourceURI } from "../../../../../mcp/common/mcpTypes.js";
import { searchFilesAndFolders } from "../../../../../search/browser/searchChatContext.js";
import { IChatAgentNameService, IChatAgentService, getFullyQualifiedId } from "../../../../common/participants/chatAgents.js";
import { getAttachableImageExtension } from "../../../../common/model/chatModel.js";
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from "../../../../common/requestParser/chatParserTypes.js";
import { IChatSlashCommandService } from "../../../../common/participants/chatSlashCommands.js";
import { toAttachedContextDynamicVariable } from "../../../../common/attachments/chatVariables.js";
import { ChatAgentLocation, ChatModeKind, isSupportedChatFileScheme } from "../../../../common/constants.js";
import { isToolSet } from "../../../../common/tools/languageModelToolsService.js";
import { IChatSessionsService, isAgentHostTarget } from "../../../../common/chatSessionsService.js";
import { ICustomizationHarnessService } from "../../../../common/customizationHarnessService.js";
import { matchesSessionType } from "../../../../common/promptSyntax/service/promptsService.js";
import { ChatSubmitAction } from "../../../actions/chatExecuteActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { resizeImage } from "../../../chatImageUtils.js";
import { ChatDynamicVariableModel } from "../../../attachments/chatDynamicVariables.js";
import { IChatService } from "../../../../common/chatService/chatService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
import { attachedContextCompletionAdditionalTriggerCharacters, computeCompletionRanges, escapeForCharClass, getAttachedContextCompletionMatch, getAttachedContextCompletionSortText, getCompletionRangeWord, isEmptyUpToCompletionWord } from "./chatInputCompletionUtils.js";
import { getAgentSessionProviderIcon, AgentSessionProviders } from "../../../agentSessions/agentSessions.js";
const SlashCommandWord = /\/[\p{L}0-9_.:-]*/gu;
const AgentOrSlashCommandWord = /(@|\/)[\p{L}0-9_.:-]*/gu;
function isAgentHostBackedWidget(widget) {
  const sessionResource = widget.viewModel?.model.sessionResource;
  return !!sessionResource && isAgentHostTarget(getChatSessionType(sessionResource));
}
let SlashCommandCompletions = class extends Disposable {
  constructor(languageFeaturesService, chatWidgetService, chatSlashCommandService, harnessService, chatService, chatSessionsService, mcpService) {
    super();
    this.languageFeaturesService = languageFeaturesService;
    this.chatWidgetService = chatWidgetService;
    this.chatSlashCommandService = chatSlashCommandService;
    this.harnessService = harnessService;
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "globalSlashCommands",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, _token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return null;
        }
        const range = computeCompletionRanges(model, position, SlashCommandWord);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const parsedRequest = widget.parsedInput.parts;
        const usedAgent = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
        if (usedAgent) {
          return;
        }
        const slashCommands = this.chatSlashCommandService.getCommands(widget.location, widget.input.currentModeKind);
        if (!slashCommands) {
          return null;
        }
        const sessionType = getChatSessionType(widget.viewModel.model.sessionResource);
        return {
          suggestions: slashCommands.filter((c) => {
            if (!c.silent && !widget.attachmentCapabilities.supportsPromptAttachments) {
              return false;
            }
            if (c.when && !widget.scopedContextKeyService.contextMatchesRules(c.when)) {
              return false;
            }
            if (!matchesSessionType(c.sessionTypes, sessionType)) {
              return false;
            }
            if (!widget.lockedAgentId) {
              return true;
            }
            if (c.modes && c.modes.length && !c.modes.includes(ChatModeKind.Agent)) {
              return false;
            }
            return true;
          }).map((c, i) => {
            const withSlash = `/${c.command}`;
            return {
              label: { label: withSlash, description: c.detail },
              insertText: c.executeImmediately ? "" : `${withSlash} `,
              documentation: c.detail,
              range,
              sortText: c.sortText ?? "a".repeat(i + 1),
              kind: CompletionItemKind.Text,
              // The icons are disabled here anyway,
              command: c.executeImmediately ? { id: ChatSubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : void 0
            };
          })
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "globalSlashCommandsAt",
      triggerCharacters: [chatAgentLeader],
      provideCompletionItems: async (model, position, _context, _token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return null;
        }
        const range = computeCompletionRanges(model, position, /@\w*/g);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const slashCommands = this.chatSlashCommandService.getCommands(widget.location, widget.input.currentModeKind);
        if (!slashCommands) {
          return null;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        const currentSessionType = getChatSessionType(widget.viewModel.model.sessionResource);
        return {
          suggestions: slashCommands.filter((c) => !c.when || widget.scopedContextKeyService.contextMatchesRules(c.when)).filter((c) => matchesSessionType(c.sessionTypes, currentSessionType)).map((c, i) => {
            const withSlash = `${chatSubcommandLeader}${c.command}`;
            return {
              label: { label: withSlash, description: c.detail },
              insertText: c.executeImmediately ? "" : `${withSlash} `,
              documentation: c.detail,
              range,
              filterText: `${chatAgentLeader}${c.command}`,
              sortText: c.sortText ?? "z".repeat(i + 1),
              kind: CompletionItemKind.Text,
              // The icons are disabled here anyway,
              command: c.executeImmediately ? { id: ChatSubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : void 0
            };
          })
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "promptSlashCommands",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return null;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        const range = computeCompletionRanges(model, position, SlashCommandWord);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const parsedRequest = widget.parsedInput.parts;
        const usedAgent = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
        if (usedAgent) {
          return;
        }
        const currentSessionType = getChatSessionType(widget.viewModel.model.sessionResource);
        const promptCommands = await this.harnessService.getSlashCommands(widget.viewModel.model.sessionResource, token);
        if (promptCommands.length === 0) {
          return null;
        }
        if (widget.lockedAgentId && !widget.attachmentCapabilities.supportsPromptAttachments) {
          return null;
        }
        const userInvocableCommands = promptCommands.filter((c) => c.userInvocable).filter((c) => matchesSessionType(c.sessionTypes, currentSessionType));
        if (userInvocableCommands.length === 0) {
          return null;
        }
        return {
          suggestions: userInvocableCommands.map((c, i) => {
            const colonLabel = `/${c.name}`;
            const hasSubcommand = c.name.includes(":");
            const displayLabel = hasSubcommand ? `/${c.name.replace(/:/g, " ")}` : colonLabel;
            const description = c.description;
            return {
              label: { label: displayLabel, description },
              insertText: `${displayLabel} `,
              documentation: c.description,
              range,
              // Allow matching by either the space form (what the user sees) or the
              // colon form (so legacy `/chronicle:tips` typing still filters).
              filterText: hasSubcommand ? `${colonLabel} ${displayLabel}` : void 0,
              sortText: "a".repeat(i + 1),
              kind: CompletionItemKind.Text
              // The icons are disabled here anyway,
            };
          })
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "mcpPromptSlashCommands",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, _token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return null;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        const range = computeCompletionRanges(model, position, /\/[\p{L}0-9_.-]*/gu);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        return {
          suggestions: mcpService.servers.get().flatMap((server) => server.prompts.get().map((prompt) => {
            const label = `/mcp.${prompt.id}`;
            return {
              label: { label, description: prompt.description },
              command: {
                id: StartParameterizedPromptAction.ID,
                title: prompt.name,
                arguments: [model, server, prompt, `${label} `]
              },
              insertText: `${label} `,
              range,
              kind: CompletionItemKind.Text
            };
          }))
        };
      }
    }));
  }
};
SlashCommandCompletions = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IChatSlashCommandService),
  __decorateParam(3, ICustomizationHarnessService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IChatSessionsService),
  __decorateParam(6, IMcpService)
], SlashCommandCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SlashCommandCompletions, LifecyclePhase.Eventually);
let AgentCompletions = class extends Disposable {
  constructor(languageFeaturesService, chatWidgetService, chatAgentService, chatAgentNameService, chatSessionsService) {
    super();
    this.languageFeaturesService = languageFeaturesService;
    this.chatWidgetService = chatWidgetService;
    this.chatAgentService = chatAgentService;
    this.chatAgentNameService = chatAgentNameService;
    this.chatSessionsService = chatSessionsService;
    const subCommandProvider = {
      _debugDisplayName: "chatAgentSubcommand",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        const range = computeCompletionRanges(model, position, SlashCommandWord);
        if (!range) {
          return;
        }
        const usedAgent = this.getCurrentAgentForWidget(widget);
        if (!usedAgent || usedAgent.command) {
          return;
        }
        return {
          suggestions: usedAgent.agent.slashCommands.map((c, i) => {
            const withSlash = `/${c.name}`;
            return {
              label: withSlash,
              insertText: `${withSlash} `,
              documentation: c.description,
              range,
              kind: CompletionItemKind.Text
              // The icons are disabled here anyway
            };
          })
        };
      }
    };
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, subCommandProvider));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatAgentAndSubcommand",
      triggerCharacters: [chatAgentLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        const viewModel = widget?.viewModel;
        if (!widget || !viewModel) {
          return;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        const range = computeCompletionRanges(model, position, AgentOrSlashCommandWord);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const agents = this.chatAgentService.getAgents().filter((a) => a.locations.includes(widget.location));
        const chatSessionContributions = this.chatSessionsService.getAllChatSessionContributions();
        const chatSessionAgentIds = new Set(chatSessionContributions.map((contribution) => contribution.type));
        const agentsForSlashCommands = agents.filter((a) => !chatSessionAgentIds.has(a.id));
        const getFilterText = (agent, command) => {
          const dummyPrefix = agent.id === "github.copilot.terminalPanel" ? `0000` : ``;
          return `${chatAgentLeader}${dummyPrefix}${agent.name}.${command}`;
        };
        const justAgents = agents.filter((a) => !a.isDefault).filter((a) => !chatSessionAgentIds.has(a.id)).map((agent) => {
          const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
          const detail = agent.description;
          return {
            label: isDupe ? { label: agentLabel, description: agent.description, detail: ` (${agent.publisherDisplayName})` } : agentLabel,
            documentation: detail,
            filterText: `${chatAgentLeader}${agent.name}`,
            insertText: `${agentLabel} `,
            range,
            kind: CompletionItemKind.Text,
            sortText: `${chatAgentLeader}${agent.name}`,
            command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget }] }
          };
        });
        return {
          suggestions: justAgents.concat(
            coalesce(agentsForSlashCommands.flatMap((agent) => agent.slashCommands.map((c, i) => {
              if (agent.isDefault && this.chatAgentService.getDefaultAgent(widget.location, widget.input.currentModeKind)?.id !== agent.id) {
                return;
              }
              const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
              const label = `${agentLabel} ${chatSubcommandLeader}${c.name}`;
              const item = {
                label: isDupe ? { label, description: c.description, detail: isDupe ? ` (${agent.publisherDisplayName})` : void 0 } : label,
                documentation: c.description,
                filterText: getFilterText(agent, c.name),
                commitCharacters: [" "],
                insertText: label + " ",
                range,
                kind: CompletionItemKind.Text,
                // The icons are disabled here anyway
                sortText: `x${chatAgentLeader}${agent.name}${c.name}`,
                command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget }] }
              };
              if (agent.isDefault) {
                const label2 = `${chatSubcommandLeader}${c.name}`;
                item.label = label2;
                item.insertText = `${label2} `;
                item.documentation = c.description;
              }
              return item;
            })))
          )
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatAgentAndSubcommand",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        const viewModel = widget?.viewModel;
        if (!widget || !viewModel) {
          return;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        const range = computeCompletionRanges(model, position, AgentOrSlashCommandWord);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const agents = this.chatAgentService.getAgents().filter((a) => a.locations.includes(widget.location) && a.modes.includes(widget.input.currentModeKind)).filter((a) => !this.chatSessionsService.getChatSessionContribution(a.id));
        return {
          suggestions: coalesce(agents.flatMap((agent) => agent.slashCommands.map((c, i) => {
            if (agent.isDefault && this.chatAgentService.getDefaultAgent(widget.location, widget.input.currentModeKind)?.id !== agent.id) {
              return;
            }
            const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
            const withSlash = `${chatSubcommandLeader}${c.name}`;
            const extraSortText = agent.id === "github.copilot.terminalPanel" ? `z` : ``;
            const sortText = `${chatSubcommandLeader}${extraSortText}${agent.name}${c.name}`;
            const item = {
              label: { label: withSlash, description: agentLabel, detail: isDupe ? ` (${agent.publisherDisplayName})` : void 0 },
              commitCharacters: [" "],
              insertText: `${agentLabel} ${withSlash} `,
              documentation: `(${agentLabel}) ${c.description ?? ""}`,
              range,
              kind: CompletionItemKind.Text,
              // The icons are disabled here anyway
              sortText,
              command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget }] }
            };
            if (agent.isDefault) {
              const label = `${chatSubcommandLeader}${c.name}`;
              item.label = label;
              item.insertText = `${label} `;
              item.documentation = c.description;
            }
            return item;
          })))
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "installChatExtensions",
      triggerCharacters: [chatAgentLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        if (!model.getLineContent(1).startsWith(chatAgentLeader)) {
          return;
        }
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (widget?.location !== ChatAgentLocation.Chat || widget.input.currentModeKind !== ChatModeKind.Ask) {
          return;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        const range = computeCompletionRanges(model, position, AgentOrSlashCommandWord);
        if (!range) {
          return;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const label = localize("installLabel", "Install Chat Extensions...");
        const item = {
          label,
          insertText: "",
          range,
          kind: CompletionItemKind.Text,
          // The icons are disabled here anyway
          command: { id: "workbench.extensions.search", title: "", arguments: ["@tag:chat-participant"] },
          filterText: chatAgentLeader + label,
          sortText: "zzz"
        };
        return {
          suggestions: [item]
        };
      }
    }));
  }
  getCurrentAgentForWidget(widget) {
    if (widget.lockedAgentId) {
      const usedAgent2 = this.chatAgentService.getAgent(widget.lockedAgentId);
      return usedAgent2 && { agent: usedAgent2 };
    }
    const parsedRequest = widget.parsedInput.parts;
    const usedAgentIdx = parsedRequest.findIndex((p) => p instanceof ChatRequestAgentPart);
    if (usedAgentIdx < 0) {
      return;
    }
    const usedAgent = parsedRequest[usedAgentIdx];
    const usedOtherCommand = parsedRequest.find((p) => p instanceof ChatRequestAgentSubcommandPart || p instanceof ChatRequestSlashPromptPart);
    if (usedOtherCommand) {
      return {
        agent: usedAgent.agent,
        command: usedOtherCommand instanceof ChatRequestAgentSubcommandPart ? usedOtherCommand.command.name : void 0
      };
    }
    for (const partAfterAgent of parsedRequest.slice(usedAgentIdx + 1)) {
      if (!(partAfterAgent instanceof ChatRequestTextPart) || !partAfterAgent.text.trim().match(/^(\/[\p{L}0-9_.:-]*)?$/u)) {
        return;
      }
    }
    return { agent: usedAgent.agent };
  }
  getAgentCompletionDetails(agent) {
    const isAllowed = this.chatAgentNameService.getAgentNameRestriction(agent);
    const agentLabel = `${chatAgentLeader}${isAllowed ? agent.name : getFullyQualifiedId(agent)}`;
    const isDupe = isAllowed && this.chatAgentService.agentHasDupeName(agent.id);
    return { label: agentLabel, isDupe };
  }
};
AgentCompletions = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IChatAgentService),
  __decorateParam(3, IChatAgentNameService),
  __decorateParam(4, IChatSessionsService)
], AgentCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentCompletions, LifecyclePhase.Eventually);
const _AssignSelectedAgentAction = class _AssignSelectedAgentAction extends Action2 {
  constructor() {
    super({
      id: _AssignSelectedAgentAction.ID,
      title: ""
      // not displayed
    });
  }
  async run(accessor, ...args) {
    const arg = args[0];
    if (!arg || !arg.widget || !arg.agent) {
      return;
    }
    if (!arg.agent.modes.includes(arg.widget.input.currentModeKind)) {
      arg.widget.input.setChatMode(arg.agent.modes[0]);
    }
    arg.widget.lastSelectedAgent = arg.agent;
  }
};
_AssignSelectedAgentAction.ID = "workbench.action.chat.assignSelectedAgent";
let AssignSelectedAgentAction = _AssignSelectedAgentAction;
registerAction2(AssignSelectedAgentAction);
const _StartParameterizedPromptAction = class _StartParameterizedPromptAction extends Action2 {
  constructor() {
    super({
      id: _StartParameterizedPromptAction.ID,
      title: ""
      // not displayed
    });
  }
  async run(accessor, model, server, prompt, textToReplace) {
    if (!model || !prompt) {
      return;
    }
    const instantiationService = accessor.get(IInstantiationService);
    const notificationService = accessor.get(INotificationService);
    const widgetService = accessor.get(IChatWidgetService);
    const fileService = accessor.get(IFileService);
    const chatWidget = await widgetService.revealWidget(true);
    if (!chatWidget) {
      return;
    }
    const lastPosition = model.getFullModelRange().collapseToEnd();
    const getPromptIndex = () => model.findMatches(textToReplace, true, false, true, null, false)[0];
    const replaceTextWith = (value) => model.applyEdits([{
      range: getPromptIndex()?.range || lastPosition,
      text: value
    }]);
    const store = new DisposableStore();
    const cts = store.add(new CancellationTokenSource());
    store.add(chatWidget.input.startGenerating());
    store.add(model.onDidChangeContent(() => {
      if (getPromptIndex()) {
        cts.cancel();
      }
    }));
    model.changeDecorations((accessor2) => {
      const id = accessor2.addDecoration(lastPosition, {
        description: "mcp-prompt-spinner",
        showIfCollapsed: true,
        after: {
          content: " ",
          inlineClassNameAffectsLetterSpacing: true,
          inlineClassName: ThemeIcon.asClassName(ThemeIcon.modify(Codicon.loading, "spin")) + " chat-prompt-spinner"
        }
      });
      store.add(toDisposable(() => {
        model.changeDecorations((a) => a.removeDecoration(id));
      }));
    });
    const pick = store.add(instantiationService.createInstance(McpPromptArgumentPick, prompt));
    try {
      await server.start();
      const args = await pick.createArgs();
      if (!args) {
        replaceTextWith("");
        return;
      }
      let messages;
      try {
        messages = await prompt.resolve(args, cts.token);
      } catch (e) {
        if (!cts.token.isCancellationRequested) {
          notificationService.error(localize("mcp.prompt.error", "Error resolving prompt: {0}", String(e)));
        }
        replaceTextWith("");
        return;
      }
      const toAttach = [];
      const attachBlob = async (mimeType, contents, uriStr, isText = false) => {
        let validURI;
        if (uriStr) {
          for (const uri of [URI.parse(uriStr), McpResourceURI.fromServer(server.definition, uriStr)]) {
            try {
              validURI ||= await fileService.exists(uri) ? uri : void 0;
            } catch {
            }
          }
        }
        if (isText) {
          if (validURI) {
            toAttach.push({
              id: generateUuid(),
              kind: "file",
              value: validURI,
              name: basename(validURI)
            });
          } else {
            toAttach.push({
              id: generateUuid(),
              kind: "generic",
              value: contents,
              name: localize("mcp.prompt.resource", "Prompt Resource")
            });
          }
        } else if (mimeType && getAttachableImageExtension(mimeType)) {
          const resized = await resizeImage(contents).catch(() => decodeBase64(contents).buffer);
          chatWidget.attachmentModel.addContext({
            id: generateUuid(),
            name: localize("mcp.prompt.image", "Prompt Image"),
            fullName: localize("mcp.prompt.image", "Prompt Image"),
            value: resized,
            kind: "image",
            references: validURI && [{ reference: validURI, kind: "reference" }]
          });
        } else if (validURI) {
          toAttach.push({
            id: generateUuid(),
            kind: "file",
            value: validURI,
            name: basename(validURI)
          });
        } else {
        }
      };
      const hasMultipleRoles = messages.some((m) => m.role !== messages[0].role);
      let input = "";
      for (const message of messages) {
        switch (message.content.type) {
          case "text":
            if (input) {
              input += "\n\n";
            }
            if (hasMultipleRoles) {
              input += `--${message.role.toUpperCase()}
`;
            }
            input += message.content.text;
            break;
          case "resource":
            if ("text" in message.content.resource) {
              await attachBlob(message.content.resource.mimeType, message.content.resource.text, message.content.resource.uri, true);
            } else {
              await attachBlob(message.content.resource.mimeType, message.content.resource.blob, message.content.resource.uri);
            }
            break;
          case "image":
          case "audio":
            await attachBlob(message.content.mimeType, message.content.data);
            break;
        }
      }
      if (toAttach.length) {
        chatWidget.attachmentModel.addContext(...toAttach);
      }
      replaceTextWith(input);
    } finally {
      store.dispose();
    }
  }
};
_StartParameterizedPromptAction.ID = "workbench.action.chat.startParameterizedPrompt";
let StartParameterizedPromptAction = _StartParameterizedPromptAction;
registerAction2(StartParameterizedPromptAction);
class ReferenceArgument {
  constructor(widget, variable) {
    this.widget = widget;
    this.variable = variable;
  }
}
let BuiltinDynamicCompletions = class extends Disposable {
  // MUST be using `g`-flag
  constructor(historyService, workspaceContextService, searchService, labelService, languageFeaturesService, chatWidgetService, outlineService, editorService, configurationService, codeEditorService, chatAgentService, instantiationService, chatSessionsService) {
    super();
    this.historyService = historyService;
    this.workspaceContextService = workspaceContextService;
    this.searchService = searchService;
    this.labelService = labelService;
    this.languageFeaturesService = languageFeaturesService;
    this.chatWidgetService = chatWidgetService;
    this.outlineService = outlineService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
    this.chatAgentService = chatAgentService;
    this.instantiationService = instantiationService;
    this.chatSessionsService = chatSessionsService;
    this.registerVariableCompletions("attachedContexts", ({ widget, range }) => {
      if (!widget.supportsFileReferences) {
        return;
      }
      const typedLeader = range.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
      const typedWord = getCompletionRangeWord(range) ?? typedLeader;
      const suggestOptions = widget.inputEditor.getOption(EditorOption.suggest);
      const suggestions = coalesce(widget.attachmentModel.attachments.filter((attachment) => !attachment.range).map((attachment) => {
        const match = getAttachedContextCompletionMatch(typedWord, typedLeader, attachment.name, attachment.kind, suggestOptions);
        if (!match) {
          return void 0;
        }
        const text = `${typedLeader}attachment:${attachment.name}`;
        const referenceRange = {
          startLineNumber: range.replace.startLineNumber,
          startColumn: range.replace.startColumn,
          endLineNumber: range.replace.endLineNumber,
          endColumn: range.replace.startColumn + text.length
        };
        return {
          label: { label: attachment.name, description: localize("attachedContext", "Attached context") },
          filterText: match.filterText,
          insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
          range,
          kind: attachment.kind === "directory" ? CompletionItemKind.Folder : attachment.kind === "file" || attachment.kind === "image" ? CompletionItemKind.File : CompletionItemKind.Reference,
          sortText: getAttachedContextCompletionSortText(match.score),
          command: {
            id: BuiltinDynamicCompletions.addReferenceCommand,
            title: "",
            arguments: [new ReferenceArgument(widget, toAttachedContextDynamicVariable(attachment, referenceRange))]
          }
        };
      }));
      return { suggestions, incomplete: true };
    }, BuiltinDynamicCompletions.VariableNameDef, true, attachedContextCompletionAdditionalTriggerCharacters);
    const fileWordPattern = new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, "g");
    this.registerVariableCompletions("fileAndFolder", async ({ widget, range }, token) => {
      if (!widget.supportsFileReferences) {
        return;
      }
      const result = { suggestions: [] };
      if (widget.lockedAgentId) {
        const agent = this.chatAgentService.getAgent(widget.lockedAgentId);
        if (agent && !agent.capabilities?.supportsFileAttachments) {
          return result;
        }
      }
      await this.addFileAndFolderEntries(widget, result, range, token);
      return result;
    }, fileWordPattern);
    this.registerVariableCompletions("selection", ({ widget, range }, token) => {
      if (!widget.supportsFileReferences) {
        return;
      }
      if (widget.location === ChatAgentLocation.EditorInline) {
        return;
      }
      const active = this.findActiveCodeEditor();
      if (!isCodeEditor(active)) {
        return;
      }
      const currentResource = active.getModel()?.uri;
      const currentSelection = active.getSelection();
      if (!currentSelection || !currentResource || currentSelection.isEmpty()) {
        return;
      }
      const typedLeader = range.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
      const basename2 = this.labelService.getUriBasenameLabel(currentResource);
      const text = `${typedLeader}file:${basename2}:${currentSelection.startLineNumber}-${currentSelection.endLineNumber}`;
      const fullRangeText = `:${currentSelection.startLineNumber}:${currentSelection.startColumn}-${currentSelection.endLineNumber}:${currentSelection.endColumn}`;
      const description = this.labelService.getUriLabel(currentResource, { relative: true }) + fullRangeText;
      const result = { suggestions: [] };
      result.suggestions.push({
        label: { label: `${typedLeader}selection`, description },
        filterText: `${typedLeader}selection`,
        insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
        range,
        kind: CompletionItemKind.Text,
        sortText: "z",
        command: {
          id: BuiltinDynamicCompletions.addReferenceCommand,
          title: "",
          arguments: [new ReferenceArgument(widget, {
            id: "vscode.selection",
            isFile: true,
            range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + text.length },
            data: { range: currentSelection, uri: currentResource }
          })]
        }
      });
      return result;
    });
    this.registerVariableCompletions("symbol", ({ widget, range, position, model }, token) => {
      if (!widget.supportsFileReferences) {
        return null;
      }
      const result = { suggestions: [] };
      const range2 = computeCompletionRanges(model, position, new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, "g"), true);
      if (range2) {
        this.addSymbolEntries(widget, result, range2, token);
      }
      return result;
    });
    const sessionWordPattern = new RegExp(`${chatVariableLeader}[^\\s]*`, "g");
    this.registerVariableCompletions("sessionReference", async ({ widget, range }, token) => {
      if (widget.location !== ChatAgentLocation.Chat) {
        return;
      }
      const typedWord = range.varWord?.word ?? "";
      const sessionPrefix = `${chatVariableLeader}session`;
      const result = { suggestions: [] };
      if (typedWord.toLowerCase().startsWith(`${sessionPrefix}:`)) {
        const allSessions = [];
        const sessionProviderFilter = [AgentSessionProviders.Local, AgentSessionProviders.Background, AgentSessionProviders.AgentHostCopilot];
        for await (const group of this.chatSessionsService.getChatSessionItems(sessionProviderFilter, token)) {
          if (token.isCancellationRequested) {
            return;
          }
          const providerIcon = getAgentSessionProviderIcon(group.chatSessionType);
          for (const item of group.items) {
            allSessions.push({
              title: item.label,
              sessionResource: item.resource,
              lastMessageDate: item.timing.lastRequestEnded ?? item.timing.created,
              icon: item.iconPath ?? providerIcon
            });
          }
        }
        const currentSessionResource = widget.viewModel?.sessionResource;
        const filteredSessions = allSessions.filter((s) => !currentSessionResource || s.sessionResource.toString() !== currentSessionResource.toString()).sort((a, b) => b.lastMessageDate - a.lastMessageDate);
        for (const session of filteredSessions) {
          const text = `${sessionPrefix}:${session.title}`;
          const dateStr = new Date(session.lastMessageDate).toLocaleString();
          result.suggestions.push({
            label: { label: session.title, description: dateStr },
            filterText: `${sessionPrefix}:${session.title}`,
            insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
            range,
            kind: CompletionItemKind.Text,
            sortText: `z${String(Number.MAX_SAFE_INTEGER - session.lastMessageDate).padStart(20, "0")}`,
            command: {
              id: BuiltinDynamicCompletions.addReferenceCommand,
              title: "",
              arguments: [new ReferenceArgument(widget, {
                id: session.sessionResource.toString(),
                icon: session.icon,
                range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + text.length },
                data: session.sessionResource
              })]
            }
          });
        }
      } else {
        result.suggestions.push({
          label: { label: sessionPrefix, description: localize("session.description", "Attach a chat session") },
          filterText: sessionPrefix,
          insertText: `${sessionPrefix}:`,
          range,
          kind: CompletionItemKind.Text,
          sortText: "z",
          command: { id: "editor.action.triggerSuggest", title: "" }
        });
      }
      return result;
    }, sessionWordPattern);
    this._register(CommandsRegistry.registerCommand(BuiltinDynamicCompletions.addReferenceCommand, (_services, arg) => {
      assertType(arg instanceof ReferenceArgument);
      return this.cmdAddReference(arg);
    }));
  }
  findActiveCodeEditor() {
    const codeEditor = this.codeEditorService.getActiveCodeEditor();
    if (codeEditor) {
      const model = codeEditor.getModel();
      if (model?.uri.scheme === Schemas.vscodeNotebookCell) {
        return void 0;
      }
      if (model) {
        return codeEditor;
      }
    }
    for (const codeOrDiffEditor of this.editorService.getVisibleTextEditorControls(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
      const codeEditor2 = getCodeEditor(codeOrDiffEditor);
      if (!codeEditor2) {
        continue;
      }
      const model = codeEditor2.getModel();
      if (model) {
        return codeEditor2;
      }
    }
    return void 0;
  }
  registerVariableCompletions(debugName, provider, wordPattern = BuiltinDynamicCompletions.VariableNameDef, includeAgentHost = false, additionalTriggerCharacters = []) {
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: `chatVarCompletions-${debugName}`,
      triggerCharacters: [chatVariableLeader, chatAgentLeader, ...additionalTriggerCharacters],
      provideCompletionItems: async (model, position, context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget) {
          return;
        }
        if (!includeAgentHost && isAgentHostBackedWidget(widget)) {
          return;
        }
        const range = computeCompletionRanges(model, position, wordPattern, true);
        if (range) {
          return provider({ model, position, widget, range, context }, token);
        }
        return;
      }
    }));
  }
  async addFileAndFolderEntries(widget, result, info, token) {
    const typedLeader = info.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
    const makeCompletionItem = (resource, kind, description, boostPriority) => {
      const basename2 = this.labelService.getUriBasenameLabel(resource);
      const text = `${typedLeader}file:${basename2}`;
      const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
      const labelDescription = description ? localize("fileEntryDescription", "{0} ({1})", uriLabel, description) : uriLabel;
      const sortText = boostPriority ? " " : "!";
      return {
        label: { label: basename2, description: labelDescription },
        filterText: `${basename2} ${typedLeader}${basename2} ${uriLabel}`,
        insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
        range: info,
        kind: kind === FileKind.FILE ? CompletionItemKind.File : CompletionItemKind.Folder,
        sortText,
        command: {
          id: BuiltinDynamicCompletions.addReferenceCommand,
          title: "",
          arguments: [new ReferenceArgument(widget, {
            id: resource.toString(),
            isFile: kind === FileKind.FILE,
            isDirectory: kind === FileKind.FOLDER,
            range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + text.length },
            data: resource
          })]
        }
      };
    };
    let pattern;
    if (info.varWord?.word && (info.varWord.word.startsWith(chatVariableLeader) || info.varWord.word.startsWith(chatAgentLeader))) {
      pattern = info.varWord.word.toLowerCase().slice(1);
    }
    const seen = new ResourceSet();
    const len = result.suggestions.length;
    for (const [i, item] of this.historyService.getHistory().entries()) {
      const resource = isDiffEditorInput(item) ? item.modified.resource : item.resource;
      if (!resource || seen.has(resource) || !this.instantiationService.invokeFunction((accessor) => isSupportedChatFileScheme(accessor, resource.scheme))) {
        continue;
      }
      if (pattern) {
        const uriLabel = this.labelService.getUriLabel(resource, { relative: true }).toLowerCase();
        const basename2 = this.labelService.getUriBasenameLabel(resource).toLowerCase();
        const combined = `${basename2} ${uriLabel}`;
        if (!isPatternInWord(pattern, 0, pattern.length, combined, 0, combined.length)) {
          continue;
        }
      }
      seen.add(resource);
      const newLen = result.suggestions.push(makeCompletionItem(resource, FileKind.FILE, i === 0 ? localize("activeFile", "Active file") : void 0, i === 0));
      if (newLen - len >= 5) {
        break;
      }
    }
    if (pattern) {
      const cacheKey = this.updateCacheKey();
      const workspaces = this.workspaceContextService.getWorkspace().folders.map((folder) => folder.uri);
      for (const workspace of workspaces) {
        const { folders, files } = await searchFilesAndFolders(workspace, pattern, true, token, cacheKey.key, this.configurationService, this.searchService);
        for (const file of files) {
          if (!seen.has(file)) {
            result.suggestions.push(makeCompletionItem(file, FileKind.FILE));
            seen.add(file);
          }
        }
        for (const folder of folders) {
          if (!seen.has(folder)) {
            result.suggestions.push(makeCompletionItem(folder, FileKind.FOLDER));
            seen.add(folder);
          }
        }
      }
    }
    result.incomplete = true;
  }
  addSymbolEntries(widget, result, info, token) {
    const timeoutMs = 100;
    const stopwatch = new StopWatch();
    const typedLeader = info.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
    const makeSymbolCompletionItem = (symbolItem, pattern2) => {
      const text = `${typedLeader}sym:${symbolItem.name}`;
      const resource = symbolItem.location.uri;
      const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
      const sortText = pattern2 ? "{" : "|";
      return {
        label: { label: symbolItem.name, description: uriLabel },
        filterText: `${typedLeader}${symbolItem.name}`,
        insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
        range: info,
        kind: SymbolKinds.toCompletionKind(symbolItem.kind),
        sortText,
        command: {
          id: BuiltinDynamicCompletions.addReferenceCommand,
          title: "",
          arguments: [new ReferenceArgument(widget, {
            id: `vscode.symbol/${JSON.stringify(symbolItem.location)}`,
            fullName: symbolItem.name,
            range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + text.length },
            data: symbolItem.location,
            icon: SymbolKinds.toIcon(symbolItem.kind)
          })]
        }
      };
    };
    let pattern;
    if (info.varWord?.word && (info.varWord.word.startsWith(chatVariableLeader) || info.varWord.word.startsWith(chatAgentLeader))) {
      pattern = info.varWord.word.toLowerCase().slice(1);
    }
    const symbolsToAdd = [];
    for (const outlineModel of this.outlineService.getCachedModels()) {
      const symbols = outlineModel.asListOfDocumentSymbols();
      for (const symbol of symbols) {
        symbolsToAdd.push({ symbol, uri: outlineModel.uri });
      }
    }
    let timedOut = false;
    for (const symbol of symbolsToAdd) {
      if (stopwatch.elapsed() > timeoutMs || token.isCancellationRequested) {
        timedOut = true;
        break;
      }
      result.suggestions.push(makeSymbolCompletionItem({ ...symbol.symbol, location: { uri: symbol.uri, range: symbol.symbol.range } }, pattern ?? ""));
    }
    result.incomplete = !!pattern || timedOut;
  }
  updateCacheKey() {
    if (this.cacheKey && Date.now() - this.cacheKey.time > 6e4) {
      this.searchService.clearCache(this.cacheKey.key);
      this.cacheKey = void 0;
    }
    if (!this.cacheKey) {
      this.cacheKey = {
        key: generateUuid(),
        time: Date.now()
      };
    }
    this.cacheKey.time = Date.now();
    return this.cacheKey;
  }
  cmdAddReference(arg) {
    arg.widget.getContrib(ChatDynamicVariableModel.ID)?.addReference(arg.variable);
  }
};
BuiltinDynamicCompletions.addReferenceCommand = "_addReferenceCmd";
BuiltinDynamicCompletions.VariableNameDef = new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][\\w:-]*`, "g");
BuiltinDynamicCompletions = __decorateClass([
  __decorateParam(0, IHistoryService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, ISearchService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IOutlineModelService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, ICodeEditorService),
  __decorateParam(10, IChatAgentService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IChatSessionsService)
], BuiltinDynamicCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinDynamicCompletions, LifecyclePhase.Eventually);
let ToolCompletions = class extends Disposable {
  // MUST be using `g`-flag
  constructor(languageFeaturesService, chatWidgetService, chatAgentService) {
    super();
    this.languageFeaturesService = languageFeaturesService;
    this.chatWidgetService = chatWidgetService;
    this.chatAgentService = chatAgentService;
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatVariables",
      triggerCharacters: [chatVariableLeader, chatAgentLeader],
      provideCompletionItems: async (model, position, _context, _token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget) {
          return null;
        }
        if (isAgentHostBackedWidget(widget)) {
          return null;
        }
        if (widget.lockedAgentId) {
          const agent = this.chatAgentService.getAgent(widget.lockedAgentId);
          if (agent && !agent.capabilities?.supportsToolAttachments) {
            return null;
          }
        }
        const range = computeCompletionRanges(model, position, ToolCompletions.VariableNameDef, true);
        if (!range) {
          return null;
        }
        const usedNames = /* @__PURE__ */ new Set();
        for (const part of widget.parsedInput.parts) {
          if (part instanceof ChatRequestToolPart) {
            usedNames.add(part.toolName);
          } else if (part instanceof ChatRequestToolSetPart) {
            usedNames.add(part.name);
          }
        }
        const typedLeader = range.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
        const pattern = range.varWord?.word ? range.varWord.word.toLowerCase().slice(1) : "";
        const suggestions = [];
        const iter = widget.input.selectedToolsModel.entriesMap.get();
        for (const [item, enabled] of iter) {
          if (!enabled) {
            continue;
          }
          let detail;
          let documentation;
          let name;
          if (isToolSet(item)) {
            detail = item.description;
            name = item.referenceName;
          } else {
            const source = item.source;
            detail = localize("tool_source_completion", "{0}: {1}", source.label, item.displayName);
            name = item.toolReferenceName ?? item.displayName;
            documentation = item.userDescription ?? item.modelDescription;
          }
          if (usedNames.has(name)) {
            continue;
          }
          if (pattern) {
            const lowerName = name.toLowerCase();
            if (!isPatternInWord(pattern, 0, pattern.length, lowerName, 0, lowerName.length)) {
              continue;
            }
          }
          const withLeader = `${typedLeader}${name}`;
          suggestions.push({
            label: withLeader,
            range,
            detail,
            documentation,
            filterText: `${typedLeader}${name}`,
            insertText: withLeader + " ",
            kind: CompletionItemKind.Tool
          });
        }
        return { suggestions };
      }
    }));
  }
};
ToolCompletions.VariableNameDef = new RegExp(`(?<=^|\\s)[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]\\w*`, "g");
ToolCompletions = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IChatAgentService)
], ToolCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ToolCompletions, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcY2hhdElucHV0Q29tcGxldGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgaXNQYXR0ZXJuSW5Xb3JkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBnZXRDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmRBdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uSXRlbUtpbmQsIENvbXBsZXRpb25JdGVtUHJvdmlkZXIsIENvbXBsZXRpb25MaXN0LCBEb2N1bWVudFN5bWJvbCwgTG9jYXRpb24sIFByb3ZpZGVyUmVzdWx0LCBTeW1ib2xLaW5kLCBTeW1ib2xLaW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2RvY3VtZW50U3ltYm9scy9icm93c2VyL291dGxpbmVNb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvcnNPcmRlciwgaXNEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IE1jcFByb21wdEFyZ3VtZW50UGljayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL21jcC9icm93c2VyL21jcFByb21wdEFyZ3VtZW50UGljay5qcyc7XG5pbXBvcnQgeyBJTWNwUHJvbXB0LCBJTWNwUHJvbXB0TWVzc2FnZSwgSU1jcFNlcnZlciwgSU1jcFNlcnZpY2UsIE1jcFJlc291cmNlVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBzZWFyY2hGaWxlc0FuZEZvbGRlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hDaGF0Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50RGF0YSwgSUNoYXRBZ2VudE5hbWVTZXJ2aWNlLCBJQ2hhdEFnZW50U2VydmljZSwgZ2V0RnVsbHlRdWFsaWZpZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBnZXRBdHRhY2hhYmxlSW1hZ2VFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0QWdlbnRQYXJ0LCBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQsIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0LCBDaGF0UmVxdWVzdFRleHRQYXJ0LCBDaGF0UmVxdWVzdFRvb2xQYXJ0LCBDaGF0UmVxdWVzdFRvb2xTZXRQYXJ0LCBjaGF0QWdlbnRMZWFkZXIsIGNoYXRTdWJjb21tYW5kTGVhZGVyLCBjaGF0VmFyaWFibGVMZWFkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0U2xhc2hDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUR5bmFtaWNWYXJpYWJsZSwgdG9BdHRhY2hlZENvbnRleHREeW5hbWljVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kLCBpc1N1cHBvcnRlZENoYXRGaWxlU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBpc1Rvb2xTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgaXNBZ2VudEhvc3RUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFN1Ym1pdEFjdGlvbiwgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2FjdGlvbnMvY2hhdEV4ZWN1dGVBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IHJlc2l6ZUltYWdlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdEltYWdlVXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYXR0YWNobWVudHMvY2hhdER5bmFtaWNWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IGF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25BZGRpdGlvbmFsVHJpZ2dlckNoYXJhY3RlcnMsIGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzLCBlc2NhcGVGb3JDaGFyQ2xhc3MsIGdldEF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25NYXRjaCwgZ2V0QXR0YWNoZWRDb250ZXh0Q29tcGxldGlvblNvcnRUZXh0LCBnZXRDb21wbGV0aW9uUmFuZ2VXb3JkLCBJQ2hhdENvbXBsZXRpb25SYW5nZVJlc3VsdCwgaXNFbXB0eVVwVG9Db21wbGV0aW9uV29yZCB9IGZyb20gJy4vY2hhdElucHV0Q29tcGxldGlvblV0aWxzLmpzJztcbmltcG9ydCB7IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbiwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcblxuLyoqXG4gKiBSZWdleCBtYXRjaGluZyBhIHNsYXNoIGNvbW1hbmQgd29yZCAoZS5nLiBgL2Zvb2ApLiBVc2VzIGBcXHB7TH1gIGZvciBVbmljb2RlXG4gKiBsZXR0ZXIgbWF0Y2hpbmcsIGNvbnNpc3RlbnQgd2l0aCBgaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWVgLlxuICovXG5jb25zdCBTbGFzaENvbW1hbmRXb3JkID0gL1xcL1tcXHB7TH0wLTlfLjotXSovZ3U7XG5cbi8qKlxuICogUmVnZXggbWF0Y2hpbmcgYW4gYWdlbnQtb3Itc2xhc2ggY29tbWFuZCB3b3JkIChlLmcuIGBAYWdlbnRgIG9yIGAvY21kYCkuXG4gKi9cbmNvbnN0IEFnZW50T3JTbGFzaENvbW1hbmRXb3JkID0gLyhAfFxcLylbXFxwe0x9MC05Xy46LV0qL2d1O1xuXG4vKipcbiAqIFJldHVybnMgYHRydWVgIHdoZW4gdGhlIHdpZGdldCdzIGNoYXQgc2Vzc2lvbiBpcyBiYWNrZWQgYnkgYW4gYWdlbnRcbiAqIGhvc3QgKGxvY2FsIG9yIHJlbW90ZSkuIEZvciB0aGVzZSBzZXNzaW9ucywgY29tcGxldGlvbnMgYXJlIGRlbGVnYXRlZFxuICogdG8gdGhlIGFnZW50IGhvc3QgdmlhIGBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zYCwgYW5kIHRoZSB3b3JrYmVuY2gnc1xuICogZGVmYXVsdCBpbi1wcm9jZXNzIHByb3ZpZGVycyAoZmlsZS9zeW1ib2wvdG9vbC9hZ2VudCkgc2hvcnQtY2lyY3VpdC5cbiAqL1xuZnVuY3Rpb24gaXNBZ2VudEhvc3RCYWNrZWRXaWRnZXQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IGJvb2xlYW4ge1xuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB3aWRnZXQudmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdHJldHVybiAhIXNlc3Npb25SZXNvdXJjZSAmJiBpc0FnZW50SG9zdFRhcmdldChnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSk7XG59XG5cbmNsYXNzIFNsYXNoQ29tbWFuZENvbXBsZXRpb25zIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2xhc2hDb21tYW5kU2VydmljZTogSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnZ2xvYmFsU2xhc2hDb21tYW5kcycsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogW2NoYXRTdWJjb21tYW5kTGVhZGVyXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghd2lkZ2V0IHx8ICF3aWRnZXQudmlld01vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBwb3NpdGlvbiwgU2xhc2hDb21tYW5kV29yZCk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghaXNFbXB0eVVwVG9Db21wbGV0aW9uV29yZChtb2RlbCwgcmFuZ2UpKSB7XG5cdFx0XHRcdFx0Ly8gTm8gdGV4dCBhbGxvd2VkIGJlZm9yZSB0aGUgY29tcGxldGlvblxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSB3aWRnZXQucGFyc2VkSW5wdXQucGFydHM7XG5cdFx0XHRcdGNvbnN0IHVzZWRBZ2VudCA9IHBhcnNlZFJlcXVlc3QuZmluZChwID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50UGFydCk7XG5cdFx0XHRcdGlmICh1c2VkQWdlbnQpIHtcblx0XHRcdFx0XHQvLyBObyAoY2xhc3NpYykgZ2xvYmFsIHNsYXNoIGNvbW1hbmRzIHdoZW4gYW4gYWdlbnQgaXMgdXNlZFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSB0aGlzLmNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzKHdpZGdldC5sb2NhdGlvbiwgd2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZCk7XG5cdFx0XHRcdGlmICghc2xhc2hDb21tYW5kcykge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUod2lkZ2V0LnZpZXdNb2RlbC5tb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IHNsYXNoQ29tbWFuZHNcblx0XHRcdFx0XHRcdC5maWx0ZXIoYyA9PiB7XG5cdFx0XHRcdFx0XHRcdC8vIHNpbGVudCBjb21tYW5kcyBhcmUgY2xpZW50LXNpZGUgb25seS4uLiBzbyB0aGV5J3JlIG5vdCBcImF0dGFjaGluZyBhbnl0aGluZ1wiXG5cdFx0XHRcdFx0XHRcdC8vIHNvIHRoaXMgY2hlY2sgY2FuIGJlIHNjb3BlZCB0byB3aGVuIHRoZSBjb21tYW5kIF9kb2VzXyBhdHRhY2ggc29tZXRoaW5nIGJlZm9yZVxuXHRcdFx0XHRcdFx0XHQvLyBjaGVja2luZyBpZiB0aGUgd2lkZ2V0IHN1cHBvcnRzIGF0dGFjaG1lbnRzIGF0IGFsbFxuXHRcdFx0XHRcdFx0XHRpZiAoIWMuc2lsZW50ICYmICF3aWRnZXQuYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChjLndoZW4gJiYgIXdpZGdldC5zY29wZWRDb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGMud2hlbikpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKCFtYXRjaGVzU2Vzc2lvblR5cGUoYy5zZXNzaW9uVHlwZXMsIHNlc3Npb25UeXBlKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoIXdpZGdldC5sb2NrZWRBZ2VudElkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKGMubW9kZXMgJiYgYy5tb2Rlcy5sZW5ndGggJiYgIWMubW9kZXMuaW5jbHVkZXMoQ2hhdE1vZGVLaW5kLkFnZW50KSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHQubWFwKChjLCBpKTogQ29tcGxldGlvbkl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB3aXRoU2xhc2ggPSBgLyR7Yy5jb21tYW5kfWA7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHdpdGhTbGFzaCwgZGVzY3JpcHRpb246IGMuZGV0YWlsIH0sXG5cdFx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogYy5leGVjdXRlSW1tZWRpYXRlbHkgPyAnJyA6IGAke3dpdGhTbGFzaH0gYCxcblx0XHRcdFx0XHRcdFx0XHRkb2N1bWVudGF0aW9uOiBjLmRldGFpbCxcblx0XHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRzb3J0VGV4dDogYy5zb3J0VGV4dCA/PyAnYScucmVwZWF0KGkgKyAxKSxcblx0XHRcdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCwgLy8gVGhlIGljb25zIGFyZSBkaXNhYmxlZCBoZXJlIGFueXdheSxcblx0XHRcdFx0XHRcdFx0XHRjb21tYW5kOiBjLmV4ZWN1dGVJbW1lZGlhdGVseSA/IHsgaWQ6IENoYXRTdWJtaXRBY3Rpb24uSUQsIHRpdGxlOiB3aXRoU2xhc2gsIGFyZ3VtZW50czogW3sgd2lkZ2V0LCBpbnB1dFZhbHVlOiBgJHt3aXRoU2xhc2h9IGAgfSBzYXRpc2ZpZXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dF0gfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdnbG9iYWxTbGFzaENvbW1hbmRzQXQnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtjaGF0QWdlbnRMZWFkZXJdLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCF3aWRnZXQgfHwgIXdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIHBvc2l0aW9uLCAvQFxcdyovZyk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghaXNFbXB0eVVwVG9Db21wbGV0aW9uV29yZChtb2RlbCwgcmFuZ2UpKSB7XG5cdFx0XHRcdFx0Ly8gTm8gdGV4dCBhbGxvd2VkIGJlZm9yZSB0aGUgY29tcGxldGlvblxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNsYXNoQ29tbWFuZHMgPSB0aGlzLmNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLmdldENvbW1hbmRzKHdpZGdldC5sb2NhdGlvbiwgd2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZCk7XG5cdFx0XHRcdGlmICghc2xhc2hDb21tYW5kcykge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHdpZGdldC5sb2NrZWRBZ2VudElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUod2lkZ2V0LnZpZXdNb2RlbC5tb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IHNsYXNoQ29tbWFuZHNcblx0XHRcdFx0XHRcdC5maWx0ZXIoYyA9PiAhYy53aGVuIHx8IHdpZGdldC5zY29wZWRDb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGMud2hlbikpXG5cdFx0XHRcdFx0XHQuZmlsdGVyKGMgPT4gbWF0Y2hlc1Nlc3Npb25UeXBlKGMuc2Vzc2lvblR5cGVzLCBjdXJyZW50U2Vzc2lvblR5cGUpKVxuXHRcdFx0XHRcdFx0Lm1hcCgoYywgaSk6IENvbXBsZXRpb25JdGVtID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgd2l0aFNsYXNoID0gYCR7Y2hhdFN1YmNvbW1hbmRMZWFkZXJ9JHtjLmNvbW1hbmR9YDtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogd2l0aFNsYXNoLCBkZXNjcmlwdGlvbjogYy5kZXRhaWwgfSxcblx0XHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBjLmV4ZWN1dGVJbW1lZGlhdGVseSA/ICcnIDogYCR7d2l0aFNsYXNofSBgLFxuXHRcdFx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGMuZGV0YWlsLFxuXHRcdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdGZpbHRlclRleHQ6IGAke2NoYXRBZ2VudExlYWRlcn0ke2MuY29tbWFuZH1gLFxuXHRcdFx0XHRcdFx0XHRcdHNvcnRUZXh0OiBjLnNvcnRUZXh0ID8/ICd6Jy5yZXBlYXQoaSArIDEpLFxuXHRcdFx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LCAvLyBUaGUgaWNvbnMgYXJlIGRpc2FibGVkIGhlcmUgYW55d2F5LFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IGMuZXhlY3V0ZUltbWVkaWF0ZWx5ID8geyBpZDogQ2hhdFN1Ym1pdEFjdGlvbi5JRCwgdGl0bGU6IHdpdGhTbGFzaCwgYXJndW1lbnRzOiBbeyB3aWRnZXQsIGlucHV0VmFsdWU6IGAke3dpdGhTbGFzaH0gYCB9IHNhdGlzZmllcyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0XSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0LCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Byb21wdFNsYXNoQ29tbWFuZHMnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtjaGF0U3ViY29tbWFuZExlYWRlcl0sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghd2lkZ2V0IHx8ICF3aWRnZXQudmlld01vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNBZ2VudEhvc3RCYWNrZWRXaWRnZXQod2lkZ2V0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIHBvc2l0aW9uLCBTbGFzaENvbW1hbmRXb3JkKTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFpc0VtcHR5VXBUb0NvbXBsZXRpb25Xb3JkKG1vZGVsLCByYW5nZSkpIHtcblx0XHRcdFx0XHQvLyBObyB0ZXh0IGFsbG93ZWQgYmVmb3JlIHRoZSBjb21wbGV0aW9uXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHdpZGdldC5wYXJzZWRJbnB1dC5wYXJ0cztcblx0XHRcdFx0Y29uc3QgdXNlZEFnZW50ID0gcGFyc2VkUmVxdWVzdC5maW5kKHAgPT4gcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KTtcblx0XHRcdFx0aWYgKHVzZWRBZ2VudCkge1xuXHRcdFx0XHRcdC8vIE5vIChjbGFzc2ljKSBnbG9iYWwgc2xhc2ggY29tbWFuZHMgd2hlbiBhbiBhZ2VudCBpcyB1c2VkXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY3VycmVudFNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHdpZGdldC52aWV3TW9kZWwubW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgcHJvbXB0Q29tbWFuZHMgPSBhd2FpdCB0aGlzLmhhcm5lc3NTZXJ2aWNlLmdldFNsYXNoQ29tbWFuZHMod2lkZ2V0LnZpZXdNb2RlbC5tb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHRva2VuKTtcblx0XHRcdFx0aWYgKHByb21wdENvbW1hbmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHdpZGdldC5sb2NrZWRBZ2VudElkICYmICF3aWRnZXQuYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB1c2VySW52b2NhYmxlQ29tbWFuZHMgPSBwcm9tcHRDb21tYW5kc1xuXHRcdFx0XHRcdC5maWx0ZXIoYyA9PiBjLnVzZXJJbnZvY2FibGUpXG5cdFx0XHRcdFx0LmZpbHRlcihjID0+IG1hdGNoZXNTZXNzaW9uVHlwZShjLnNlc3Npb25UeXBlcywgY3VycmVudFNlc3Npb25UeXBlKSk7XG5cdFx0XHRcdGlmICh1c2VySW52b2NhYmxlQ29tbWFuZHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiB1c2VySW52b2NhYmxlQ29tbWFuZHMubWFwKChjLCBpKTogQ29tcGxldGlvbkl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29sb25MYWJlbCA9IGAvJHtjLm5hbWV9YDtcblx0XHRcdFx0XHRcdGNvbnN0IGhhc1N1YmNvbW1hbmQgPSBjLm5hbWUuaW5jbHVkZXMoJzonKTtcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3BsYXlMYWJlbCA9IGhhc1N1YmNvbW1hbmQgPyBgLyR7Yy5uYW1lLnJlcGxhY2UoLzovZywgJyAnKX1gIDogY29sb25MYWJlbDtcblx0XHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYy5kZXNjcmlwdGlvbjtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBkaXNwbGF5TGFiZWwsIGRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGAke2Rpc3BsYXlMYWJlbH0gYCxcblx0XHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogYy5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdC8vIEFsbG93IG1hdGNoaW5nIGJ5IGVpdGhlciB0aGUgc3BhY2UgZm9ybSAod2hhdCB0aGUgdXNlciBzZWVzKSBvciB0aGVcblx0XHRcdFx0XHRcdFx0Ly8gY29sb24gZm9ybSAoc28gbGVnYWN5IGAvY2hyb25pY2xlOnRpcHNgIHR5cGluZyBzdGlsbCBmaWx0ZXJzKS5cblx0XHRcdFx0XHRcdFx0ZmlsdGVyVGV4dDogaGFzU3ViY29tbWFuZCA/IGAke2NvbG9uTGFiZWx9ICR7ZGlzcGxheUxhYmVsfWAgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHNvcnRUZXh0OiAnYScucmVwZWF0KGkgKyAxKSxcblx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsIC8vIFRoZSBpY29ucyBhcmUgZGlzYWJsZWQgaGVyZSBhbnl3YXksXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0LCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ21jcFByb21wdFNsYXNoQ29tbWFuZHMnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtjaGF0U3ViY29tbWFuZExlYWRlcl0sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdFx0XHRpZiAoIXdpZGdldCB8fCAhd2lkZ2V0LnZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzQWdlbnRIb3N0QmFja2VkV2lkZ2V0KHdpZGdldCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyByZWdleCBpcyB0aGUgb3Bwb3NpdGUgb2YgYG1jcFByb21wdFJlcGxhY2VTcGVjaWFsQ2hhcnNgIGZvdW5kIGluIGBtY3BUeXBlcy50c2Bcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIC9cXC9bXFxwe0x9MC05Xy4tXSovZ3UpO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWlzRW1wdHlVcFRvQ29tcGxldGlvbldvcmQobW9kZWwsIHJhbmdlKSkge1xuXHRcdFx0XHRcdC8vIE5vIHRleHQgYWxsb3dlZCBiZWZvcmUgdGhlIGNvbXBsZXRpb25cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAod2lkZ2V0LmxvY2tlZEFnZW50SWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IG1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5mbGF0TWFwKHNlcnZlciA9PiBzZXJ2ZXIucHJvbXB0cy5nZXQoKS5tYXAoKHByb21wdCk6IENvbXBsZXRpb25JdGVtID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gYC9tY3AuJHtwcm9tcHQuaWR9YDtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsLCBkZXNjcmlwdGlvbjogcHJvbXB0LmRlc2NyaXB0aW9uIH0sXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogU3RhcnRQYXJhbWV0ZXJpemVkUHJvbXB0QWN0aW9uLklELFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBwcm9tcHQubmFtZSxcblx0XHRcdFx0XHRcdFx0XHRhcmd1bWVudHM6IFttb2RlbCwgc2VydmVyLCBwcm9tcHQsIGAke2xhYmVsfSBgXSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogYCR7bGFiZWx9IGAsXG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSkpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihTbGFzaENvbW1hbmRDb21wbGV0aW9ucywgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5cbmNsYXNzIEFnZW50Q29tcGxldGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnROYW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudE5hbWVTZXJ2aWNlOiBJQ2hhdEFnZW50TmFtZVNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblxuXHRcdGNvbnN0IHN1YkNvbW1hbmRQcm92aWRlcjogQ29tcGxldGlvbkl0ZW1Qcm92aWRlciA9IHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnY2hhdEFnZW50U3ViY29tbWFuZCcsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogW2NoYXRTdWJjb21tYW5kTGVhZGVyXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCF3aWRnZXQgfHwgIXdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNBZ2VudEhvc3RCYWNrZWRXaWRnZXQod2lkZ2V0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIHBvc2l0aW9uLCBTbGFzaENvbW1hbmRXb3JkKTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHVzZWRBZ2VudCA9IHRoaXMuZ2V0Q3VycmVudEFnZW50Rm9yV2lkZ2V0KHdpZGdldCk7XG5cdFx0XHRcdGlmICghdXNlZEFnZW50IHx8IHVzZWRBZ2VudC5jb21tYW5kKSB7XG5cdFx0XHRcdFx0Ly8gT25seSBvbmUgYWxsb3dlZFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IHVzZWRBZ2VudC5hZ2VudC5zbGFzaENvbW1hbmRzLm1hcCgoYywgaSk6IENvbXBsZXRpb25JdGVtID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHdpdGhTbGFzaCA9IGAvJHtjLm5hbWV9YDtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiB3aXRoU2xhc2gsXG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGAke3dpdGhTbGFzaH0gYCxcblx0XHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogYy5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LCAvLyBUaGUgaWNvbnMgYXJlIGRpc2FibGVkIGhlcmUgYW55d2F5XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHN1YkNvbW1hbmRQcm92aWRlcikpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0LCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ2NoYXRBZ2VudEFuZFN1YmNvbW1hbmQnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtjaGF0QWdlbnRMZWFkZXJdLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB3aWRnZXQ/LnZpZXdNb2RlbDtcblx0XHRcdFx0aWYgKCF3aWRnZXQgfHwgIXZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc0FnZW50SG9zdEJhY2tlZFdpZGdldCh3aWRnZXQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHdpZGdldC5sb2NrZWRBZ2VudElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBwb3NpdGlvbiwgQWdlbnRPclNsYXNoQ29tbWFuZFdvcmQpO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWlzRW1wdHlVcFRvQ29tcGxldGlvbldvcmQobW9kZWwsIHJhbmdlKSkge1xuXHRcdFx0XHRcdC8vIE5vIHRleHQgYWxsb3dlZCBiZWZvcmUgdGhlIGNvbXBsZXRpb25cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhZ2VudHMgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnRzKClcblx0XHRcdFx0XHQuZmlsdGVyKGEgPT4gYS5sb2NhdGlvbnMuaW5jbHVkZXMod2lkZ2V0LmxvY2F0aW9uKSk7XG5cblx0XHRcdFx0Ly8gRmlsdGVyIG91dCBjaGF0U2Vzc2lvbnMgY29udHJpYnV0aW9ucyBmb3Igc2xhc2ggY29tbWFuZCBjb21wbGV0aW9uc1xuXHRcdFx0XHRjb25zdCBjaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMgPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zKCk7XG5cdFx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uQWdlbnRJZHMgPSBuZXcgU2V0KGNoYXRTZXNzaW9uQ29udHJpYnV0aW9ucy5tYXAoY29udHJpYnV0aW9uID0+IGNvbnRyaWJ1dGlvbi50eXBlKSk7XG5cdFx0XHRcdGNvbnN0IGFnZW50c0ZvclNsYXNoQ29tbWFuZHMgPSBhZ2VudHMuZmlsdGVyKGEgPT4gIWNoYXRTZXNzaW9uQWdlbnRJZHMuaGFzKGEuaWQpKTtcblxuXHRcdFx0XHQvLyBXaGVuIHRoZSBpbnB1dCBpcyBvbmx5IGAvYCwgaXRlbXMgYXJlIHNvcnRlZCBieSBzb3J0VGV4dC5cblx0XHRcdFx0Ly8gV2hlbiB0eXBpbmcsIGZpbHRlclRleHQgaXMgdXNlZCB0byBzY29yZSBhbmQgc29ydC5cblx0XHRcdFx0Ly8gVGhlIHNhbWUgbGlzdCBpcyByZWZpbHRlcmVkL3JhbmtlZCB3aGlsZSB0eXBpbmcuXG5cdFx0XHRcdGNvbnN0IGdldEZpbHRlclRleHQgPSAoYWdlbnQ6IElDaGF0QWdlbnREYXRhLCBjb21tYW5kOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHQvLyBUaGlzIGlzIGhhY2tpbmcgdGhlIGZpbHRlciBhbGdvcml0aG0gdG8gbWFrZSBAdGVybWluYWwgL2V4cGxhaW4gbWF0Y2ggd29yc2UgdGhhbiBAd29ya3NwYWNlIC9leHBsYWluIGJ5IG1ha2luZyBpdHMgbWF0Y2ggaW5kZXggbGF0ZXIgaW4gdGhlIHN0cmluZy5cblx0XHRcdFx0XHQvLyBXaGVuIEkgdHlwZSBgL2V4cGAsIHRoZSB3b3Jrc3BhY2Ugb25lIHNob3VsZCBiZSBzb3J0ZWQgb3ZlciB0aGUgdGVybWluYWwgb25lLlxuXHRcdFx0XHRcdGNvbnN0IGR1bW15UHJlZml4ID0gYWdlbnQuaWQgPT09ICdnaXRodWIuY29waWxvdC50ZXJtaW5hbFBhbmVsJyA/IGAwMDAwYCA6IGBgO1xuXHRcdFx0XHRcdHJldHVybiBgJHtjaGF0QWdlbnRMZWFkZXJ9JHtkdW1teVByZWZpeH0ke2FnZW50Lm5hbWV9LiR7Y29tbWFuZH1gO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGp1c3RBZ2VudHM6IENvbXBsZXRpb25JdGVtW10gPSBhZ2VudHNcblx0XHRcdFx0XHQuZmlsdGVyKGEgPT4gIWEuaXNEZWZhdWx0KVxuXHRcdFx0XHRcdC5maWx0ZXIoYSA9PiAhY2hhdFNlc3Npb25BZ2VudElkcy5oYXMoYS5pZCkpXG5cdFx0XHRcdFx0Lm1hcChhZ2VudCA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB7IGxhYmVsOiBhZ2VudExhYmVsLCBpc0R1cGUgfSA9IHRoaXMuZ2V0QWdlbnRDb21wbGV0aW9uRGV0YWlscyhhZ2VudCk7XG5cdFx0XHRcdFx0XHRjb25zdCBkZXRhaWwgPSBhZ2VudC5kZXNjcmlwdGlvbjtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGlzRHVwZSA/XG5cdFx0XHRcdFx0XHRcdFx0eyBsYWJlbDogYWdlbnRMYWJlbCwgZGVzY3JpcHRpb246IGFnZW50LmRlc2NyaXB0aW9uLCBkZXRhaWw6IGAgKCR7YWdlbnQucHVibGlzaGVyRGlzcGxheU5hbWV9KWAgfSA6XG5cdFx0XHRcdFx0XHRcdFx0YWdlbnRMYWJlbCxcblx0XHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogZGV0YWlsLFxuXHRcdFx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBgJHtjaGF0QWdlbnRMZWFkZXJ9JHthZ2VudC5uYW1lfWAsXG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGAke2FnZW50TGFiZWx9IGAsXG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRcdFx0c29ydFRleHQ6IGAke2NoYXRBZ2VudExlYWRlcn0ke2FnZW50Lm5hbWV9YCxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDogeyBpZDogQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbi5JRCwgdGl0bGU6IEFzc2lnblNlbGVjdGVkQWdlbnRBY3Rpb24uSUQsIGFyZ3VtZW50czogW3sgYWdlbnQsIHdpZGdldCB9IHNhdGlzZmllcyBBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uQXJnc10gfSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczoganVzdEFnZW50cy5jb25jYXQoXG5cdFx0XHRcdFx0XHRjb2FsZXNjZShhZ2VudHNGb3JTbGFzaENvbW1hbmRzLmZsYXRNYXAoYWdlbnQgPT4gYWdlbnQuc2xhc2hDb21tYW5kcy5tYXAoKGMsIGkpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGFnZW50LmlzRGVmYXVsdCAmJiB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KHdpZGdldC5sb2NhdGlvbiwgd2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZCk/LmlkICE9PSBhZ2VudC5pZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHsgbGFiZWw6IGFnZW50TGFiZWwsIGlzRHVwZSB9ID0gdGhpcy5nZXRBZ2VudENvbXBsZXRpb25EZXRhaWxzKGFnZW50KTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBgJHthZ2VudExhYmVsfSAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7Yy5uYW1lfWA7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IENvbXBsZXRpb25JdGVtID0ge1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBpc0R1cGUgP1xuXHRcdFx0XHRcdFx0XHRcdFx0eyBsYWJlbCwgZGVzY3JpcHRpb246IGMuZGVzY3JpcHRpb24sIGRldGFpbDogaXNEdXBlID8gYCAoJHthZ2VudC5wdWJsaXNoZXJEaXNwbGF5TmFtZX0pYCA6IHVuZGVmaW5lZCB9IDpcblx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGMuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdFx0ZmlsdGVyVGV4dDogZ2V0RmlsdGVyVGV4dChhZ2VudCwgYy5uYW1lKSxcblx0XHRcdFx0XHRcdFx0XHRjb21taXRDaGFyYWN0ZXJzOiBbJyAnXSxcblx0XHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBsYWJlbCArICcgJyxcblx0XHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCwgLy8gVGhlIGljb25zIGFyZSBkaXNhYmxlZCBoZXJlIGFueXdheVxuXHRcdFx0XHRcdFx0XHRcdHNvcnRUZXh0OiBgeCR7Y2hhdEFnZW50TGVhZGVyfSR7YWdlbnQubmFtZX0ke2MubmFtZX1gLFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHsgaWQ6IEFzc2lnblNlbGVjdGVkQWdlbnRBY3Rpb24uSUQsIHRpdGxlOiBBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uLklELCBhcmd1bWVudHM6IFt7IGFnZW50LCB3aWRnZXQgfSBzYXRpc2ZpZXMgQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbkFyZ3NdIH0sXG5cdFx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdFx0aWYgKGFnZW50LmlzRGVmYXVsdCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIGRlZmF1bHQgYWdlbnQgaXNuJ3QgbWVudGlvbmVkIG5vciBpbnNlcnRlZFxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gYCR7Y2hhdFN1YmNvbW1hbmRMZWFkZXJ9JHtjLm5hbWV9YDtcblx0XHRcdFx0XHRcdFx0XHRpdGVtLmxhYmVsID0gbGFiZWw7XG5cdFx0XHRcdFx0XHRcdFx0aXRlbS5pbnNlcnRUZXh0ID0gYCR7bGFiZWx9IGA7XG5cdFx0XHRcdFx0XHRcdFx0aXRlbS5kb2N1bWVudGF0aW9uID0gYy5kZXNjcmlwdGlvbjtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHRcdFx0fSkpKSlcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnY2hhdEFnZW50QW5kU3ViY29tbWFuZCcsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogW2NoYXRTdWJjb21tYW5kTGVhZGVyXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0Y29uc3Qgdmlld01vZGVsID0gd2lkZ2V0Py52aWV3TW9kZWw7XG5cdFx0XHRcdGlmICghd2lkZ2V0IHx8ICF2aWV3TW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNBZ2VudEhvc3RCYWNrZWRXaWRnZXQod2lkZ2V0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh3aWRnZXQubG9ja2VkQWdlbnRJZCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIEFnZW50T3JTbGFzaENvbW1hbmRXb3JkKTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFpc0VtcHR5VXBUb0NvbXBsZXRpb25Xb3JkKG1vZGVsLCByYW5nZSkpIHtcblx0XHRcdFx0XHQvLyBObyB0ZXh0IGFsbG93ZWQgYmVmb3JlIHRoZSBjb21wbGV0aW9uXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWdlbnRzID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50cygpXG5cdFx0XHRcdFx0LmZpbHRlcihhID0+IGEubG9jYXRpb25zLmluY2x1ZGVzKHdpZGdldC5sb2NhdGlvbikgJiYgYS5tb2Rlcy5pbmNsdWRlcyh3aWRnZXQuaW5wdXQuY3VycmVudE1vZGVLaW5kKSlcblx0XHRcdFx0XHQvLyBGaWx0ZXIgb3V0IGNoYXRTZXNzaW9ucyBjb250cmlidXRpb25zIGZvciBzbGFzaCBjb21tYW5kIGNvbXBsZXRpb25zXG5cdFx0XHRcdFx0LmZpbHRlcihhID0+ICF0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oYS5pZCkpO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IGNvYWxlc2NlKGFnZW50cy5mbGF0TWFwKGFnZW50ID0+IGFnZW50LnNsYXNoQ29tbWFuZHMubWFwKChjLCBpKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoYWdlbnQuaXNEZWZhdWx0ICYmIHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQod2lkZ2V0LmxvY2F0aW9uLCB3aWRnZXQuaW5wdXQuY3VycmVudE1vZGVLaW5kKT8uaWQgIT09IGFnZW50LmlkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgeyBsYWJlbDogYWdlbnRMYWJlbCwgaXNEdXBlIH0gPSB0aGlzLmdldEFnZW50Q29tcGxldGlvbkRldGFpbHMoYWdlbnQpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgd2l0aFNsYXNoID0gYCR7Y2hhdFN1YmNvbW1hbmRMZWFkZXJ9JHtjLm5hbWV9YDtcblx0XHRcdFx0XHRcdGNvbnN0IGV4dHJhU29ydFRleHQgPSBhZ2VudC5pZCA9PT0gJ2dpdGh1Yi5jb3BpbG90LnRlcm1pbmFsUGFuZWwnID8gYHpgIDogYGA7XG5cdFx0XHRcdFx0XHRjb25zdCBzb3J0VGV4dCA9IGAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7ZXh0cmFTb3J0VGV4dH0ke2FnZW50Lm5hbWV9JHtjLm5hbWV9YDtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW06IENvbXBsZXRpb25JdGVtID0ge1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogd2l0aFNsYXNoLCBkZXNjcmlwdGlvbjogYWdlbnRMYWJlbCwgZGV0YWlsOiBpc0R1cGUgPyBgICgke2FnZW50LnB1Ymxpc2hlckRpc3BsYXlOYW1lfSlgIDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0XHRcdGNvbW1pdENoYXJhY3RlcnM6IFsnICddLFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBgJHthZ2VudExhYmVsfSAke3dpdGhTbGFzaH0gYCxcblx0XHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogYCgke2FnZW50TGFiZWx9KSAke2MuZGVzY3JpcHRpb24gPz8gJyd9YCxcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LCAvLyBUaGUgaWNvbnMgYXJlIGRpc2FibGVkIGhlcmUgYW55d2F5XG5cdFx0XHRcdFx0XHRcdHNvcnRUZXh0LFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7IGlkOiBBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uLklELCB0aXRsZTogQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbi5JRCwgYXJndW1lbnRzOiBbeyBhZ2VudCwgd2lkZ2V0IH0gc2F0aXNmaWVzIEFzc2lnblNlbGVjdGVkQWdlbnRBY3Rpb25BcmdzXSB9LFxuXHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0aWYgKGFnZW50LmlzRGVmYXVsdCkge1xuXHRcdFx0XHRcdFx0XHQvLyBkZWZhdWx0IGFnZW50IGlzbid0IG1lbnRpb25lZCBub3IgaW5zZXJ0ZWRcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBgJHtjaGF0U3ViY29tbWFuZExlYWRlcn0ke2MubmFtZX1gO1xuXHRcdFx0XHRcdFx0XHRpdGVtLmxhYmVsID0gbGFiZWw7XG5cdFx0XHRcdFx0XHRcdGl0ZW0uaW5zZXJ0VGV4dCA9IGAke2xhYmVsfSBgO1xuXHRcdFx0XHRcdFx0XHRpdGVtLmRvY3VtZW50YXRpb24gPSBjLmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdFx0XHR9KSkpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0LCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ2luc3RhbGxDaGF0RXh0ZW5zaW9ucycsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogW2NoYXRBZ2VudExlYWRlcl0sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0aWYgKCFtb2RlbC5nZXRMaW5lQ29udGVudCgxKS5zdGFydHNXaXRoKGNoYXRBZ2VudExlYWRlcikpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKHdpZGdldD8ubG9jYXRpb24gIT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQgfHwgd2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZCAhPT0gQ2hhdE1vZGVLaW5kLkFzaykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc0FnZW50SG9zdEJhY2tlZFdpZGdldCh3aWRnZXQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHdpZGdldC5sb2NrZWRBZ2VudElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBwb3NpdGlvbiwgQWdlbnRPclNsYXNoQ29tbWFuZFdvcmQpO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFpc0VtcHR5VXBUb0NvbXBsZXRpb25Xb3JkKG1vZGVsLCByYW5nZSkpIHtcblx0XHRcdFx0XHQvLyBObyB0ZXh0IGFsbG93ZWQgYmVmb3JlIHRoZSBjb21wbGV0aW9uXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBsb2NhbGl6ZSgnaW5zdGFsbExhYmVsJywgXCJJbnN0YWxsIENoYXQgRXh0ZW5zaW9ucy4uLlwiKTtcblx0XHRcdFx0Y29uc3QgaXRlbTogQ29tcGxldGlvbkl0ZW0gPSB7XG5cdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogJycsXG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsIC8vIFRoZSBpY29ucyBhcmUgZGlzYWJsZWQgaGVyZSBhbnl3YXlcblx0XHRcdFx0XHRjb21tYW5kOiB7IGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuc2VhcmNoJywgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFsnQHRhZzpjaGF0LXBhcnRpY2lwYW50J10gfSxcblx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBjaGF0QWdlbnRMZWFkZXIgKyBsYWJlbCxcblx0XHRcdFx0XHRzb3J0VGV4dDogJ3p6eidcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbaXRlbV1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnJlbnRBZ2VudEZvcldpZGdldCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogeyBhZ2VudDogSUNoYXRBZ2VudERhdGE7IGNvbW1hbmQ/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHdpZGdldC5sb2NrZWRBZ2VudElkKSB7XG5cdFx0XHRjb25zdCB1c2VkQWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnQod2lkZ2V0LmxvY2tlZEFnZW50SWQpO1xuXHRcdFx0cmV0dXJuIHVzZWRBZ2VudCAmJiB7IGFnZW50OiB1c2VkQWdlbnQgfTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gd2lkZ2V0LnBhcnNlZElucHV0LnBhcnRzO1xuXHRcdGNvbnN0IHVzZWRBZ2VudElkeCA9IHBhcnNlZFJlcXVlc3QuZmluZEluZGV4KChwKTogcCBpcyBDaGF0UmVxdWVzdEFnZW50UGFydCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFBhcnQpO1xuXHRcdGlmICh1c2VkQWdlbnRJZHggPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNlZEFnZW50ID0gcGFyc2VkUmVxdWVzdFt1c2VkQWdlbnRJZHhdIGFzIENoYXRSZXF1ZXN0QWdlbnRQYXJ0O1xuXG5cdFx0Y29uc3QgdXNlZE90aGVyQ29tbWFuZCA9IHBhcnNlZFJlcXVlc3QuZmluZChwID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQgfHwgcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0KTtcblx0XHRpZiAodXNlZE90aGVyQ29tbWFuZCkge1xuXHRcdFx0Ly8gT25seSBvbmUgYWxsb3dlZFxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YWdlbnQ6IHVzZWRBZ2VudC5hZ2VudCxcblx0XHRcdFx0Y29tbWFuZDogdXNlZE90aGVyQ29tbWFuZCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCA/IHVzZWRPdGhlckNvbW1hbmQuY29tbWFuZC5uYW1lIDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcGFydEFmdGVyQWdlbnQgb2YgcGFyc2VkUmVxdWVzdC5zbGljZSh1c2VkQWdlbnRJZHggKyAxKSkge1xuXHRcdFx0Ly8gQ291bGQgYWxsb3cgdGV4dCBhZnRlciAncG9zaXRpb24nXG5cdFx0XHRpZiAoIShwYXJ0QWZ0ZXJBZ2VudCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0VGV4dFBhcnQpIHx8ICFwYXJ0QWZ0ZXJBZ2VudC50ZXh0LnRyaW0oKS5tYXRjaCgvXihcXC9bXFxwe0x9MC05Xy46LV0qKT8kL3UpKSB7XG5cdFx0XHRcdC8vIE5vIHRleHQgYWxsb3dlZCBiZXR3ZWVuIGFnZW50IGFuZCBzdWJjb21tYW5kXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBhZ2VudDogdXNlZEFnZW50LmFnZW50IH07XG5cdH1cblxuXHRwcml2YXRlIGdldEFnZW50Q29tcGxldGlvbkRldGFpbHMoYWdlbnQ6IElDaGF0QWdlbnREYXRhKTogeyBsYWJlbDogc3RyaW5nOyBpc0R1cGU6IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3QgaXNBbGxvd2VkID0gdGhpcy5jaGF0QWdlbnROYW1lU2VydmljZS5nZXRBZ2VudE5hbWVSZXN0cmljdGlvbihhZ2VudCk7XG5cdFx0Y29uc3QgYWdlbnRMYWJlbCA9IGAke2NoYXRBZ2VudExlYWRlcn0ke2lzQWxsb3dlZCA/IGFnZW50Lm5hbWUgOiBnZXRGdWxseVF1YWxpZmllZElkKGFnZW50KX1gO1xuXHRcdGNvbnN0IGlzRHVwZSA9IGlzQWxsb3dlZCAmJiB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuYWdlbnRIYXNEdXBlTmFtZShhZ2VudC5pZCk7XG5cdFx0cmV0dXJuIHsgbGFiZWw6IGFnZW50TGFiZWwsIGlzRHVwZSB9O1xuXHR9XG59XG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oQWdlbnRDb21wbGV0aW9ucywgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5cbmludGVyZmFjZSBBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uQXJncyB7XG5cdGFnZW50OiBJQ2hhdEFnZW50RGF0YTtcblx0d2lkZ2V0OiBJQ2hhdFdpZGdldDtcbn1cblxuY2xhc3MgQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmFzc2lnblNlbGVjdGVkQWdlbnQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6ICcnIC8vIG5vdCBkaXNwbGF5ZWRcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgYXJnID0gYXJnc1swXSBhcyBBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uQXJncyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIWFyZyB8fCAhYXJnLndpZGdldCB8fCAhYXJnLmFnZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFhcmcuYWdlbnQubW9kZXMuaW5jbHVkZXMoYXJnLndpZGdldC5pbnB1dC5jdXJyZW50TW9kZUtpbmQpKSB7XG5cdFx0XHRhcmcud2lkZ2V0LmlucHV0LnNldENoYXRNb2RlKGFyZy5hZ2VudC5tb2Rlc1swXSk7XG5cdFx0fVxuXG5cdFx0YXJnLndpZGdldC5sYXN0U2VsZWN0ZWRBZ2VudCA9IGFyZy5hZ2VudDtcblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKEFzc2lnblNlbGVjdGVkQWdlbnRBY3Rpb24pO1xuXG5jbGFzcyBTdGFydFBhcmFtZXRlcml6ZWRQcm9tcHRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zdGFydFBhcmFtZXRlcml6ZWRQcm9tcHQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTdGFydFBhcmFtZXRlcml6ZWRQcm9tcHRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogJycgLy8gbm90IGRpc3BsYXllZFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBtb2RlbDogSVRleHRNb2RlbCwgc2VydmVyOiBJTWNwU2VydmVyLCBwcm9tcHQ6IElNY3BQcm9tcHQsIHRleHRUb1JlcGxhY2U6IHN0cmluZykge1xuXHRcdGlmICghbW9kZWwgfHwgIXByb21wdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCBjaGF0V2lkZ2V0ID0gYXdhaXQgd2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQodHJ1ZSk7XG5cdFx0aWYgKCFjaGF0V2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdFBvc2l0aW9uID0gbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKS5jb2xsYXBzZVRvRW5kKCk7XG5cdFx0Y29uc3QgZ2V0UHJvbXB0SW5kZXggPSAoKSA9PiBtb2RlbC5maW5kTWF0Y2hlcyh0ZXh0VG9SZXBsYWNlLCB0cnVlLCBmYWxzZSwgdHJ1ZSwgbnVsbCwgZmFsc2UpWzBdO1xuXHRcdGNvbnN0IHJlcGxhY2VUZXh0V2l0aCA9ICh2YWx1ZTogc3RyaW5nKSA9PiBtb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRyYW5nZTogZ2V0UHJvbXB0SW5kZXgoKT8ucmFuZ2UgfHwgbGFzdFBvc2l0aW9uLFxuXHRcdFx0dGV4dDogdmFsdWUsXG5cdFx0fV0pO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRzdG9yZS5hZGQoY2hhdFdpZGdldC5pbnB1dC5zdGFydEdlbmVyYXRpbmcoKSk7XG5cblx0XHRzdG9yZS5hZGQobW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRcdGlmIChnZXRQcm9tcHRJbmRleCgpKSB7XG5cdFx0XHRcdGN0cy5jYW5jZWwoKTsgLy8gY2FuY2VsIGlmIHRoZSB1c2VyIGRlbGV0ZXMgdGhlaXIgcHJvbXB0XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgaWQgPSBhY2Nlc3Nvci5hZGREZWNvcmF0aW9uKGxhc3RQb3NpdGlvbiwge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ21jcC1wcm9tcHQtc3Bpbm5lcicsXG5cdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRjb250ZW50OiAnICcsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWUsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiBUaGVtZUljb24uYXNDbGFzc05hbWUoVGhlbWVJY29uLm1vZGlmeShDb2RpY29uLmxvYWRpbmcsICdzcGluJykpICsgJyBjaGF0LXByb21wdC1zcGlubmVyJyxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0bW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoYSA9PiBhLnJlbW92ZURlY29yYXRpb24oaWQpKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHBpY2sgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwUHJvbXB0QXJndW1lbnRQaWNrLCBwcm9tcHQpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBzdGFydCB0aGUgc2VydmVyIGlmIG5vdCBhbHJlYWR5IHJ1bm5pbmcgc28gdGhhdCBpdCdzIHJlYWR5IHRvIHJlc29sdmVcblx0XHRcdC8vIHRoZSBwcm9tcHQgaW5zdGFudGx5IHdoZW4gdGhlIHVzZXIgZmluaXNoZXMgcGlja2luZyBhcmd1bWVudHMuXG5cdFx0XHRhd2FpdCBzZXJ2ZXIuc3RhcnQoKTtcblxuXHRcdFx0Y29uc3QgYXJncyA9IGF3YWl0IHBpY2suY3JlYXRlQXJncygpO1xuXHRcdFx0aWYgKCFhcmdzKSB7XG5cdFx0XHRcdHJlcGxhY2VUZXh0V2l0aCgnJyk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG1lc3NhZ2VzOiBJTWNwUHJvbXB0TWVzc2FnZVtdO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bWVzc2FnZXMgPSBhd2FpdCBwcm9tcHQucmVzb2x2ZShhcmdzLCBjdHMudG9rZW4pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRpZiAoIWN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ21jcC5wcm9tcHQuZXJyb3InLCBcIkVycm9yIHJlc29sdmluZyBwcm9tcHQ6IHswfVwiLCBTdHJpbmcoZSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXBsYWNlVGV4dFdpdGgoJycpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRvQXR0YWNoOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblx0XHRcdGNvbnN0IGF0dGFjaEJsb2IgPSBhc3luYyAobWltZVR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29udGVudHM6IHN0cmluZywgdXJpU3RyPzogc3RyaW5nLCBpc1RleHQgPSBmYWxzZSkgPT4ge1xuXHRcdFx0XHRsZXQgdmFsaWRVUkk6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHVyaVN0cikge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdXJpIG9mIFtVUkkucGFyc2UodXJpU3RyKSwgTWNwUmVzb3VyY2VVUkkuZnJvbVNlcnZlcihzZXJ2ZXIuZGVmaW5pdGlvbiwgdXJpU3RyKV0pIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHZhbGlkVVJJIHx8PSBhd2FpdCBmaWxlU2VydmljZS5leGlzdHModXJpKSA/IHVyaSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0XHQvLyBpZ25vcmVkXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzVGV4dCkge1xuXHRcdFx0XHRcdGlmICh2YWxpZFVSSSkge1xuXHRcdFx0XHRcdFx0dG9BdHRhY2gucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0XHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogdmFsaWRVUkksXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGJhc2VuYW1lKHZhbGlkVVJJKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0b0F0dGFjaC5wdXNoKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBjb250ZW50cyxcblx0XHRcdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ21jcC5wcm9tcHQucmVzb3VyY2UnLCAnUHJvbXB0IFJlc291cmNlJyksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAobWltZVR5cGUgJiYgZ2V0QXR0YWNoYWJsZUltYWdlRXh0ZW5zaW9uKG1pbWVUeXBlKSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc2l6ZWQgPSBhd2FpdCByZXNpemVJbWFnZShjb250ZW50cylcblx0XHRcdFx0XHRcdC5jYXRjaCgoKSA9PiBkZWNvZGVCYXNlNjQoY29udGVudHMpLmJ1ZmZlcik7XG5cdFx0XHRcdFx0Y2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCh7XG5cdFx0XHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnbWNwLnByb21wdC5pbWFnZScsICdQcm9tcHQgSW1hZ2UnKSxcblx0XHRcdFx0XHRcdGZ1bGxOYW1lOiBsb2NhbGl6ZSgnbWNwLnByb21wdC5pbWFnZScsICdQcm9tcHQgSW1hZ2UnKSxcblx0XHRcdFx0XHRcdHZhbHVlOiByZXNpemVkLFxuXHRcdFx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0XHRcdHJlZmVyZW5jZXM6IHZhbGlkVVJJICYmIFt7IHJlZmVyZW5jZTogdmFsaWRVUkksIGtpbmQ6ICdyZWZlcmVuY2UnIH1dLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHZhbGlkVVJJKSB7XG5cdFx0XHRcdFx0dG9BdHRhY2gucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0XHRraW5kOiAnZmlsZScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogdmFsaWRVUkksXG5cdFx0XHRcdFx0XHRuYW1lOiBiYXNlbmFtZSh2YWxpZFVSSSksXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbm90IGEgdmFsaWQgcmVzb3VyY2UvcmVzb3VyY2UgVVJJXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGhhc011bHRpcGxlUm9sZXMgPSBtZXNzYWdlcy5zb21lKG0gPT4gbS5yb2xlICE9PSBtZXNzYWdlc1swXS5yb2xlKTtcblx0XHRcdGxldCBpbnB1dCA9ICcnO1xuXHRcdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIG1lc3NhZ2VzKSB7XG5cdFx0XHRcdHN3aXRjaCAobWVzc2FnZS5jb250ZW50LnR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0XHRcdGlmIChpbnB1dCkge1xuXHRcdFx0XHRcdFx0XHRpbnB1dCArPSAnXFxuXFxuJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChoYXNNdWx0aXBsZVJvbGVzKSB7XG5cdFx0XHRcdFx0XHRcdGlucHV0ICs9IGAtLSR7bWVzc2FnZS5yb2xlLnRvVXBwZXJDYXNlKCl9XFxuYDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aW5wdXQgKz0gbWVzc2FnZS5jb250ZW50LnRleHQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyZXNvdXJjZSc6XG5cdFx0XHRcdFx0XHRpZiAoJ3RleHQnIGluIG1lc3NhZ2UuY29udGVudC5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBhdHRhY2hCbG9iKG1lc3NhZ2UuY29udGVudC5yZXNvdXJjZS5taW1lVHlwZSwgbWVzc2FnZS5jb250ZW50LnJlc291cmNlLnRleHQsIG1lc3NhZ2UuY29udGVudC5yZXNvdXJjZS51cmksIHRydWUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgYXR0YWNoQmxvYihtZXNzYWdlLmNvbnRlbnQucmVzb3VyY2UubWltZVR5cGUsIG1lc3NhZ2UuY29udGVudC5yZXNvdXJjZS5ibG9iLCBtZXNzYWdlLmNvbnRlbnQucmVzb3VyY2UudXJpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2ltYWdlJzpcblx0XHRcdFx0XHRjYXNlICdhdWRpbyc6XG5cdFx0XHRcdFx0XHRhd2FpdCBhdHRhY2hCbG9iKG1lc3NhZ2UuY29udGVudC5taW1lVHlwZSwgbWVzc2FnZS5jb250ZW50LmRhdGEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHRvQXR0YWNoLmxlbmd0aCkge1xuXHRcdFx0XHRjaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KC4uLnRvQXR0YWNoKTtcblx0XHRcdH1cblx0XHRcdHJlcGxhY2VUZXh0V2l0aChpbnB1dCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihTdGFydFBhcmFtZXRlcml6ZWRQcm9tcHRBY3Rpb24pO1xuXG5cbmNsYXNzIFJlZmVyZW5jZUFyZ3VtZW50IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgd2lkZ2V0OiBJQ2hhdFdpZGdldCxcblx0XHRyZWFkb25seSB2YXJpYWJsZTogSUR5bmFtaWNWYXJpYWJsZVxuXHQpIHsgfVxufVxuXG5pbnRlcmZhY2UgSVZhcmlhYmxlQ29tcGxldGlvbnNEZXRhaWxzIHtcblx0bW9kZWw6IElUZXh0TW9kZWw7XG5cdHBvc2l0aW9uOiBQb3NpdGlvbjtcblx0Y29udGV4dDogQ29tcGxldGlvbkNvbnRleHQ7XG5cdHdpZGdldDogSUNoYXRXaWRnZXQ7XG5cdHJhbmdlOiBJQ2hhdENvbXBsZXRpb25SYW5nZVJlc3VsdDtcbn1cblxuY2xhc3MgQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBhZGRSZWZlcmVuY2VDb21tYW5kID0gJ19hZGRSZWZlcmVuY2VDbWQnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBWYXJpYWJsZU5hbWVEZWYgPSBuZXcgUmVnRXhwKGBbJHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdFZhcmlhYmxlTGVhZGVyKX0ke2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0QWdlbnRMZWFkZXIpfV1bXFxcXHc6LV0qYCwgJ2cnKTsgLy8gTVVTVCBiZSB1c2luZyBgZ2AtZmxhZ1xuXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIaXN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElTZWFyY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoU2VydmljZTogSVNlYXJjaFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElPdXRsaW5lTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3V0bGluZVNlcnZpY2U6IElPdXRsaW5lTW9kZWxTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3RlclZhcmlhYmxlQ29tcGxldGlvbnMoJ2F0dGFjaGVkQ29udGV4dHMnLCAoeyB3aWRnZXQsIHJhbmdlIH0pID0+IHtcblx0XHRcdGlmICghd2lkZ2V0LnN1cHBvcnRzRmlsZVJlZmVyZW5jZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0eXBlZExlYWRlciA9IHJhbmdlLnZhcldvcmQ/LndvcmQ/LmNoYXJBdCgwKSA9PT0gY2hhdEFnZW50TGVhZGVyID8gY2hhdEFnZW50TGVhZGVyIDogY2hhdFZhcmlhYmxlTGVhZGVyO1xuXHRcdFx0Y29uc3QgdHlwZWRXb3JkID0gZ2V0Q29tcGxldGlvblJhbmdlV29yZChyYW5nZSkgPz8gdHlwZWRMZWFkZXI7XG5cdFx0XHRjb25zdCBzdWdnZXN0T3B0aW9ucyA9IHdpZGdldC5pbnB1dEVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpO1xuXHRcdFx0Y29uc3Qgc3VnZ2VzdGlvbnMgPSBjb2FsZXNjZSh3aWRnZXQuYXR0YWNobWVudE1vZGVsLmF0dGFjaG1lbnRzXG5cdFx0XHRcdC5maWx0ZXIoYXR0YWNobWVudCA9PiAhYXR0YWNobWVudC5yYW5nZSlcblx0XHRcdFx0Lm1hcCgoYXR0YWNobWVudCk6IENvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IGdldEF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25NYXRjaCh0eXBlZFdvcmQsIHR5cGVkTGVhZGVyLCBhdHRhY2htZW50Lm5hbWUsIGF0dGFjaG1lbnQua2luZCwgc3VnZ2VzdE9wdGlvbnMpO1xuXHRcdFx0XHRcdGlmICghbWF0Y2gpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBgJHt0eXBlZExlYWRlcn1hdHRhY2htZW50OiR7YXR0YWNobWVudC5uYW1lfWA7XG5cdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlUmFuZ2UgPSB7XG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHJhbmdlLnJlcGxhY2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IHJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiByYW5nZS5yZXBsYWNlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4gKyB0ZXh0Lmxlbmd0aFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBhdHRhY2htZW50Lm5hbWUsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0YWNoZWRDb250ZXh0JywgJ0F0dGFjaGVkIGNvbnRleHQnKSB9LFxuXHRcdFx0XHRcdFx0ZmlsdGVyVGV4dDogbWF0Y2guZmlsdGVyVGV4dCxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6IHJhbmdlLnZhcldvcmQ/LmVuZENvbHVtbiA9PT0gcmFuZ2UucmVwbGFjZS5lbmRDb2x1bW4gPyBgJHt0ZXh0fSBgIDogdGV4dCxcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0a2luZDogYXR0YWNobWVudC5raW5kID09PSAnZGlyZWN0b3J5J1xuXHRcdFx0XHRcdFx0XHQ/IENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXJcblx0XHRcdFx0XHRcdFx0OiBhdHRhY2htZW50LmtpbmQgPT09ICdmaWxlJyB8fCBhdHRhY2htZW50LmtpbmQgPT09ICdpbWFnZSdcblx0XHRcdFx0XHRcdFx0XHQ/IENvbXBsZXRpb25JdGVtS2luZC5GaWxlXG5cdFx0XHRcdFx0XHRcdFx0OiBDb21wbGV0aW9uSXRlbUtpbmQuUmVmZXJlbmNlLFxuXHRcdFx0XHRcdFx0c29ydFRleHQ6IGdldEF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25Tb3J0VGV4dChtYXRjaC5zY29yZSksXG5cdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdGlkOiBCdWlsdGluRHluYW1pY0NvbXBsZXRpb25zLmFkZFJlZmVyZW5jZUNvbW1hbmQsXG5cdFx0XHRcdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbbmV3IFJlZmVyZW5jZUFyZ3VtZW50KHdpZGdldCwgdG9BdHRhY2hlZENvbnRleHREeW5hbWljVmFyaWFibGUoYXR0YWNobWVudCwgcmVmZXJlbmNlUmFuZ2UpKV1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiB7IHN1Z2dlc3Rpb25zLCBpbmNvbXBsZXRlOiB0cnVlIH07XG5cdFx0fSwgQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5WYXJpYWJsZU5hbWVEZWYsIHRydWUsIGF0dGFjaGVkQ29udGV4dENvbXBsZXRpb25BZGRpdGlvbmFsVHJpZ2dlckNoYXJhY3RlcnMpO1xuXG5cdFx0Ly8gRmlsZS9Gb2xkZXIgY29tcGxldGlvbnMgaW4gb25lIGdvIGFuZCBtXG5cdFx0Y29uc3QgZmlsZVdvcmRQYXR0ZXJuID0gbmV3IFJlZ0V4cChgWyR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRWYXJpYWJsZUxlYWRlcil9JHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdEFnZW50TGVhZGVyKX1dW15cXFxcc10qYCwgJ2cnKTtcblx0XHR0aGlzLnJlZ2lzdGVyVmFyaWFibGVDb21wbGV0aW9ucygnZmlsZUFuZEZvbGRlcicsIGFzeW5jICh7IHdpZGdldCwgcmFuZ2UgfSwgdG9rZW4pID0+IHtcblx0XHRcdGlmICghd2lkZ2V0LnN1cHBvcnRzRmlsZVJlZmVyZW5jZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQ6IENvbXBsZXRpb25MaXN0ID0geyBzdWdnZXN0aW9uczogW10gfTtcblxuXHRcdFx0Ly8gSWYgbG9ja2VkIHRvIGFuIGFnZW50IHRoYXQgZG9lc24ndCBzdXBwb3J0IGZpbGUgYXR0YWNobWVudHMsIHNraXBcblx0XHRcdGlmICh3aWRnZXQubG9ja2VkQWdlbnRJZCkge1xuXHRcdFx0XHRjb25zdCBhZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudCh3aWRnZXQubG9ja2VkQWdlbnRJZCk7XG5cdFx0XHRcdGlmIChhZ2VudCAmJiAhYWdlbnQuY2FwYWJpbGl0aWVzPy5zdXBwb3J0c0ZpbGVBdHRhY2htZW50cykge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuYWRkRmlsZUFuZEZvbGRlckVudHJpZXMod2lkZ2V0LCByZXN1bHQsIHJhbmdlLCB0b2tlbik7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXG5cdFx0fSwgZmlsZVdvcmRQYXR0ZXJuKTtcblxuXHRcdC8vIFNlbGVjdGlvbiBjb21wbGV0aW9uXG5cdFx0dGhpcy5yZWdpc3RlclZhcmlhYmxlQ29tcGxldGlvbnMoJ3NlbGVjdGlvbicsICh7IHdpZGdldCwgcmFuZ2UgfSwgdG9rZW4pID0+IHtcblx0XHRcdGlmICghd2lkZ2V0LnN1cHBvcnRzRmlsZVJlZmVyZW5jZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAod2lkZ2V0LmxvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLmZpbmRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0XHRpZiAoIWlzQ29kZUVkaXRvcihhY3RpdmUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudFJlc291cmNlID0gYWN0aXZlLmdldE1vZGVsKCk/LnVyaTtcblx0XHRcdGNvbnN0IGN1cnJlbnRTZWxlY3Rpb24gPSBhY3RpdmUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAoIWN1cnJlbnRTZWxlY3Rpb24gfHwgIWN1cnJlbnRSZXNvdXJjZSB8fCBjdXJyZW50U2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHR5cGVkTGVhZGVyID0gcmFuZ2UudmFyV29yZD8ud29yZD8uY2hhckF0KDApID09PSBjaGF0QWdlbnRMZWFkZXIgPyBjaGF0QWdlbnRMZWFkZXIgOiBjaGF0VmFyaWFibGVMZWFkZXI7XG5cdFx0XHRjb25zdCBiYXNlbmFtZSA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwoY3VycmVudFJlc291cmNlKTtcblx0XHRcdGNvbnN0IHRleHQgPSBgJHt0eXBlZExlYWRlcn1maWxlOiR7YmFzZW5hbWV9OiR7Y3VycmVudFNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXJ9LSR7Y3VycmVudFNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyfWA7XG5cdFx0XHRjb25zdCBmdWxsUmFuZ2VUZXh0ID0gYDoke2N1cnJlbnRTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyfToke2N1cnJlbnRTZWxlY3Rpb24uc3RhcnRDb2x1bW59LSR7Y3VycmVudFNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyfToke2N1cnJlbnRTZWxlY3Rpb24uZW5kQ29sdW1ufWA7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGN1cnJlbnRSZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSArIGZ1bGxSYW5nZVRleHQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogQ29tcGxldGlvbkxpc3QgPSB7IHN1Z2dlc3Rpb25zOiBbXSB9O1xuXHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogYCR7dHlwZWRMZWFkZXJ9c2VsZWN0aW9uYCwgZGVzY3JpcHRpb24gfSxcblx0XHRcdFx0ZmlsdGVyVGV4dDogYCR7dHlwZWRMZWFkZXJ9c2VsZWN0aW9uYCxcblx0XHRcdFx0aW5zZXJ0VGV4dDogcmFuZ2UudmFyV29yZD8uZW5kQ29sdW1uID09PSByYW5nZS5yZXBsYWNlLmVuZENvbHVtbiA/IGAke3RleHR9IGAgOiB0ZXh0LFxuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdHNvcnRUZXh0OiAneicsXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLCB0aXRsZTogJycsIGFyZ3VtZW50czogW25ldyBSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIHtcblx0XHRcdFx0XHRcdGlkOiAndnNjb2RlLnNlbGVjdGlvbicsXG5cdFx0XHRcdFx0XHRpc0ZpbGU6IHRydWUsXG5cdFx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IHJhbmdlLnJlcGxhY2Uuc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogcmFuZ2UucmVwbGFjZS5zdGFydENvbHVtbiwgZW5kTGluZU51bWJlcjogcmFuZ2UucmVwbGFjZS5lbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW46IHJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4gKyB0ZXh0Lmxlbmd0aCB9LFxuXHRcdFx0XHRcdFx0ZGF0YTogeyByYW5nZTogY3VycmVudFNlbGVjdGlvbiwgdXJpOiBjdXJyZW50UmVzb3VyY2UgfSBzYXRpc2ZpZXMgTG9jYXRpb25cblx0XHRcdFx0XHR9KV1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXG5cdFx0Ly8gU3ltYm9sIGNvbXBsZXRpb25zXG5cdFx0dGhpcy5yZWdpc3RlclZhcmlhYmxlQ29tcGxldGlvbnMoJ3N5bWJvbCcsICh7IHdpZGdldCwgcmFuZ2UsIHBvc2l0aW9uLCBtb2RlbCB9LCB0b2tlbikgPT4ge1xuXHRcdFx0aWYgKCF3aWRnZXQuc3VwcG9ydHNGaWxlUmVmZXJlbmNlcykge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBDb21wbGV0aW9uTGlzdCA9IHsgc3VnZ2VzdGlvbnM6IFtdIH07XG5cdFx0XHRjb25zdCByYW5nZTIgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIG5ldyBSZWdFeHAoYFske2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0VmFyaWFibGVMZWFkZXIpfSR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRBZ2VudExlYWRlcil9XVteXFxcXHNdKmAsICdnJyksIHRydWUpO1xuXHRcdFx0aWYgKHJhbmdlMikge1xuXHRcdFx0XHR0aGlzLmFkZFN5bWJvbEVudHJpZXMod2lkZ2V0LCByZXN1bHQsIHJhbmdlMiwgdG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXG5cdFx0Ly8gU2Vzc2lvbiBSZWZlcmVuY2UgY29tcGxldGlvblxuXHRcdGNvbnN0IHNlc3Npb25Xb3JkUGF0dGVybiA9IG5ldyBSZWdFeHAoYCR7Y2hhdFZhcmlhYmxlTGVhZGVyfVteXFxcXHNdKmAsICdnJyk7XG5cdFx0dGhpcy5yZWdpc3RlclZhcmlhYmxlQ29tcGxldGlvbnMoJ3Nlc3Npb25SZWZlcmVuY2UnLCBhc3luYyAoeyB3aWRnZXQsIHJhbmdlIH0sIHRva2VuKSA9PiB7XG5cdFx0XHRpZiAod2lkZ2V0LmxvY2F0aW9uICE9PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHlwZWRXb3JkID0gcmFuZ2UudmFyV29yZD8ud29yZCA/PyAnJztcblx0XHRcdGNvbnN0IHNlc3Npb25QcmVmaXggPSBgJHtjaGF0VmFyaWFibGVMZWFkZXJ9c2Vzc2lvbmA7XG5cdFx0XHRjb25zdCByZXN1bHQ6IENvbXBsZXRpb25MaXN0ID0geyBzdWdnZXN0aW9uczogW10gfTtcblxuXHRcdFx0aWYgKHR5cGVkV29yZC50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoYCR7c2Vzc2lvblByZWZpeH06YCkpIHtcblx0XHRcdFx0Ly8gVXNlciBoYXMgdHlwZWQgI3Nlc3Npb246IFx1MjAxNCBmZXRjaCBhbGwgc2Vzc2lvbnMgYW5kIHNob3cgdGhlbSBpbmxpbmVcblx0XHRcdFx0Y29uc3QgYWxsU2Vzc2lvbnM6IHsgdGl0bGU6IHN0cmluZzsgc2Vzc2lvblJlc291cmNlOiBVUkk7IGxhc3RNZXNzYWdlRGF0ZTogbnVtYmVyOyBpY29uOiBUaGVtZUljb24gfVtdID0gW107XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblByb3ZpZGVyRmlsdGVyID0gW0FnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb3BpbG90XTtcblx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBncm91cCBvZiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25JdGVtcyhzZXNzaW9uUHJvdmlkZXJGaWx0ZXIsIHRva2VuKSkge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwcm92aWRlckljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oZ3JvdXAuY2hhdFNlc3Npb25UeXBlKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXAuaXRlbXMpIHtcblx0XHRcdFx0XHRcdGFsbFNlc3Npb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0aXRsZTogaXRlbS5sYWJlbCxcblx0XHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBpdGVtLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IGl0ZW0udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPz8gaXRlbS50aW1pbmcuY3JlYXRlZCxcblx0XHRcdFx0XHRcdFx0aWNvbjogaXRlbS5pY29uUGF0aCA/PyBwcm92aWRlckljb24sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblJlc291cmNlID0gd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZFNlc3Npb25zID0gYWxsU2Vzc2lvbnNcblx0XHRcdFx0XHQuZmlsdGVyKHMgPT4gIWN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgfHwgcy5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gY3VycmVudFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKVxuXHRcdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBiLmxhc3RNZXNzYWdlRGF0ZSAtIGEubGFzdE1lc3NhZ2VEYXRlKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgZmlsdGVyZWRTZXNzaW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBgJHtzZXNzaW9uUHJlZml4fToke3Nlc3Npb24udGl0bGV9YDtcblx0XHRcdFx0XHRjb25zdCBkYXRlU3RyID0gbmV3IERhdGUoc2Vzc2lvbi5sYXN0TWVzc2FnZURhdGUpLnRvTG9jYWxlU3RyaW5nKCk7XG5cdFx0XHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHNlc3Npb24udGl0bGUsIGRlc2NyaXB0aW9uOiBkYXRlU3RyIH0sXG5cdFx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBgJHtzZXNzaW9uUHJlZml4fToke3Nlc3Npb24udGl0bGV9YCxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6IHJhbmdlLnZhcldvcmQ/LmVuZENvbHVtbiA9PT0gcmFuZ2UucmVwbGFjZS5lbmRDb2x1bW4gPyBgJHt0ZXh0fSBgIDogdGV4dCxcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRzb3J0VGV4dDogYHoke1N0cmluZyhOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiAtIHNlc3Npb24ubGFzdE1lc3NhZ2VEYXRlKS5wYWRTdGFydCgyMCwgJzAnKX1gLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRpZDogQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLCB0aXRsZTogJycsIGFyZ3VtZW50czogW25ldyBSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIHtcblx0XHRcdFx0XHRcdFx0XHRpZDogc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0XHRpY29uOiBzZXNzaW9uLmljb24sXG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiByYW5nZS5yZXBsYWNlLnN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IHJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXI6IHJhbmdlLnJlcGxhY2UuZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiByYW5nZS5yZXBsYWNlLnN0YXJ0Q29sdW1uICsgdGV4dC5sZW5ndGggfSxcblx0XHRcdFx0XHRcdFx0XHRkYXRhOiBzZXNzaW9uLnNlc3Npb25SZXNvdXJjZVxuXHRcdFx0XHRcdFx0XHR9KV1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVXNlciB0eXBlZCAjIG9yICNzIGV0YyBcdTIwMTQgc2hvdyBzaW5nbGUgI3Nlc3Npb24gZW50cnkgdGhhdCBpbnNlcnRzICNzZXNzaW9uOiBhbmQgcmUtdHJpZ2dlcnMgc3VnZ2VzdFxuXHRcdFx0XHRyZXN1bHQuc3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHNlc3Npb25QcmVmaXgsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2Vzc2lvbi5kZXNjcmlwdGlvbicsICdBdHRhY2ggYSBjaGF0IHNlc3Npb24nKSB9LFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IHNlc3Npb25QcmVmaXgsXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogYCR7c2Vzc2lvblByZWZpeH06YCxcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRzb3J0VGV4dDogJ3onLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdlZGl0b3IuYWN0aW9uLnRyaWdnZXJTdWdnZXN0JywgdGl0bGU6ICcnIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCBzZXNzaW9uV29yZFBhdHRlcm4pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLCAoX3NlcnZpY2VzLCBhcmcpID0+IHtcblx0XHRcdGFzc2VydFR5cGUoYXJnIGluc3RhbmNlb2YgUmVmZXJlbmNlQXJndW1lbnQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuY21kQWRkUmVmZXJlbmNlKGFyZyk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kQWN0aXZlQ29kZUVkaXRvcigpOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29kZUVkaXRvciA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdGlmIChjb2RlRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNvZGVFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbD8udXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBjb2RlRWRpdG9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNvZGVPckRpZmZFZGl0b3Igb2YgdGhpcy5lZGl0b3JTZXJ2aWNlLmdldFZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IGdldENvZGVFZGl0b3IoY29kZU9yRGlmZkVkaXRvcik7XG5cdFx0XHRpZiAoIWNvZGVFZGl0b3IpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gY29kZUVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBjb2RlRWRpdG9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZhcmlhYmxlQ29tcGxldGlvbnMoZGVidWdOYW1lOiBzdHJpbmcsIHByb3ZpZGVyOiAoZGV0YWlsczogSVZhcmlhYmxlQ29tcGxldGlvbnNEZXRhaWxzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb3ZpZGVyUmVzdWx0PENvbXBsZXRpb25MaXN0Piwgd29yZFBhdHRlcm46IFJlZ0V4cCA9IEJ1aWx0aW5EeW5hbWljQ29tcGxldGlvbnMuVmFyaWFibGVOYW1lRGVmLCBpbmNsdWRlQWdlbnRIb3N0ID0gZmFsc2UsIGFkZGl0aW9uYWxUcmlnZ2VyQ2hhcmFjdGVyczogcmVhZG9ubHkgc3RyaW5nW10gPSBbXSkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6IGBjaGF0VmFyQ29tcGxldGlvbnMtJHtkZWJ1Z05hbWV9YCxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbY2hhdFZhcmlhYmxlTGVhZGVyLCBjaGF0QWdlbnRMZWFkZXIsIC4uLmFkZGl0aW9uYWxUcmlnZ2VyQ2hhcmFjdGVyc10sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWluY2x1ZGVBZ2VudEhvc3QgJiYgaXNBZ2VudEhvc3RCYWNrZWRXaWRnZXQod2lkZ2V0KSkge1xuXHRcdFx0XHRcdC8vIEFnZW50LWhvc3Qgc2Vzc2lvbnMgZGVsZWdhdGUgY29tcGxldGlvbnMgdG8gdGhlIGhvc3Rcblx0XHRcdFx0XHQvLyBwcm9jZXNzIHZpYSBgQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uc2AuXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIHdvcmRQYXR0ZXJuLCB0cnVlKTtcblx0XHRcdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHByb3ZpZGVyKHsgbW9kZWwsIHBvc2l0aW9uLCB3aWRnZXQsIHJhbmdlLCBjb250ZXh0IH0sIHRva2VuKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGNhY2hlS2V5PzogeyBrZXk6IHN0cmluZzsgdGltZTogbnVtYmVyIH07XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRGaWxlQW5kRm9sZGVyRW50cmllcyh3aWRnZXQ6IElDaGF0V2lkZ2V0LCByZXN1bHQ6IENvbXBsZXRpb25MaXN0LCBpbmZvOiB7IGluc2VydDogUmFuZ2U7IHJlcGxhY2U6IFJhbmdlOyB2YXJXb3JkOiBJV29yZEF0UG9zaXRpb24gfCBudWxsIH0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXG5cdFx0Y29uc3QgdHlwZWRMZWFkZXIgPSBpbmZvLnZhcldvcmQ/LndvcmQ/LmNoYXJBdCgwKSA9PT0gY2hhdEFnZW50TGVhZGVyID8gY2hhdEFnZW50TGVhZGVyIDogY2hhdFZhcmlhYmxlTGVhZGVyO1xuXG5cdFx0Y29uc3QgbWFrZUNvbXBsZXRpb25JdGVtID0gKHJlc291cmNlOiBVUkksIGtpbmQ6IEZpbGVLaW5kLCBkZXNjcmlwdGlvbj86IHN0cmluZywgYm9vc3RQcmlvcml0eT86IGJvb2xlYW4pOiBDb21wbGV0aW9uSXRlbSA9PiB7XG5cdFx0XHRjb25zdCBiYXNlbmFtZSA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwocmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgdGV4dCA9IGAke3R5cGVkTGVhZGVyfWZpbGU6JHtiYXNlbmFtZX1gO1xuXHRcdFx0Y29uc3QgdXJpTGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IGxhYmVsRGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvblxuXHRcdFx0XHQ/IGxvY2FsaXplKCdmaWxlRW50cnlEZXNjcmlwdGlvbicsICd7MH0gKHsxfSknLCB1cmlMYWJlbCwgZGVzY3JpcHRpb24pXG5cdFx0XHRcdDogdXJpTGFiZWw7XG5cdFx0XHQvLyBrZWVwIGZpbGVzIGFib3ZlIG90aGVyIGNvbXBsZXRpb25zXG5cdFx0XHRjb25zdCBzb3J0VGV4dCA9IGJvb3N0UHJpb3JpdHkgPyAnICcgOiAnISc7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBiYXNlbmFtZSwgZGVzY3JpcHRpb246IGxhYmVsRGVzY3JpcHRpb24gfSxcblx0XHRcdFx0ZmlsdGVyVGV4dDogYCR7YmFzZW5hbWV9ICR7dHlwZWRMZWFkZXJ9JHtiYXNlbmFtZX0gJHt1cmlMYWJlbH1gLFxuXHRcdFx0XHRpbnNlcnRUZXh0OiBpbmZvLnZhcldvcmQ/LmVuZENvbHVtbiA9PT0gaW5mby5yZXBsYWNlLmVuZENvbHVtbiA/IGAke3RleHR9IGAgOiB0ZXh0LFxuXHRcdFx0XHRyYW5nZTogaW5mbyxcblx0XHRcdFx0a2luZDoga2luZCA9PT0gRmlsZUtpbmQuRklMRSA/IENvbXBsZXRpb25JdGVtS2luZC5GaWxlIDogQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcixcblx0XHRcdFx0c29ydFRleHQsXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLCB0aXRsZTogJycsIGFyZ3VtZW50czogW25ldyBSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIHtcblx0XHRcdFx0XHRcdGlkOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0aXNGaWxlOiBraW5kID09PSBGaWxlS2luZC5GSUxFLFxuXHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IGtpbmQgPT09IEZpbGVLaW5kLkZPTERFUixcblx0XHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogaW5mby5yZXBsYWNlLnN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IGluZm8ucmVwbGFjZS5zdGFydENvbHVtbiwgZW5kTGluZU51bWJlcjogaW5mby5yZXBsYWNlLmVuZExpbmVOdW1iZXIsIGVuZENvbHVtbjogaW5mby5yZXBsYWNlLnN0YXJ0Q29sdW1uICsgdGV4dC5sZW5ndGggfSxcblx0XHRcdFx0XHRcdGRhdGE6IHJlc291cmNlXG5cdFx0XHRcdFx0fSldXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGxldCBwYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGluZm8udmFyV29yZD8ud29yZCAmJiAoaW5mby52YXJXb3JkLndvcmQuc3RhcnRzV2l0aChjaGF0VmFyaWFibGVMZWFkZXIpIHx8IGluZm8udmFyV29yZC53b3JkLnN0YXJ0c1dpdGgoY2hhdEFnZW50TGVhZGVyKSkpIHtcblx0XHRcdHBhdHRlcm4gPSBpbmZvLnZhcldvcmQud29yZC50b0xvd2VyQ2FzZSgpLnNsaWNlKDEpOyAvLyByZW1vdmUgbGVhZGluZyAjIG9yIEBcblx0XHR9XG5cblx0XHRjb25zdCBzZWVuID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Y29uc3QgbGVuID0gcmVzdWx0LnN1Z2dlc3Rpb25zLmxlbmd0aDtcblxuXHRcdC8vIEhJU1RPUllcblx0XHQvLyBhbHdheXMgdGFrZSB0aGUgbGFzdCBOIGl0ZW1zXG5cdFx0Zm9yIChjb25zdCBbaSwgaXRlbV0gb2YgdGhpcy5oaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KCkuZW50cmllcygpKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGlzRGlmZkVkaXRvcklucHV0KGl0ZW0pID8gaXRlbS5tb2RpZmllZC5yZXNvdXJjZSA6IGl0ZW0ucmVzb3VyY2U7XG5cdFx0XHRpZiAoIXJlc291cmNlIHx8IHNlZW4uaGFzKHJlc291cmNlKSB8fCAhdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBpc1N1cHBvcnRlZENoYXRGaWxlU2NoZW1lKGFjY2Vzc29yLCByZXNvdXJjZS5zY2hlbWUpKSkge1xuXHRcdFx0XHQvLyBpZ25vcmUgZWRpdG9ycyB3aXRob3V0IGEgcmVzb3VyY2Vcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwYXR0ZXJuKSB7XG5cdFx0XHRcdC8vIHVzZSBwYXR0ZXJuIGlmIGF2YWlsYWJsZVxuXHRcdFx0XHRjb25zdCB1cmlMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IGJhc2VuYW1lID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbChyZXNvdXJjZSkudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0Y29uc3QgY29tYmluZWQgPSBgJHtiYXNlbmFtZX0gJHt1cmlMYWJlbH1gO1xuXHRcdFx0XHRpZiAoIWlzUGF0dGVybkluV29yZChwYXR0ZXJuLCAwLCBwYXR0ZXJuLmxlbmd0aCwgY29tYmluZWQsIDAsIGNvbWJpbmVkLmxlbmd0aCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRzZWVuLmFkZChyZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBuZXdMZW4gPSByZXN1bHQuc3VnZ2VzdGlvbnMucHVzaChtYWtlQ29tcGxldGlvbkl0ZW0ocmVzb3VyY2UsIEZpbGVLaW5kLkZJTEUsIGkgPT09IDAgPyBsb2NhbGl6ZSgnYWN0aXZlRmlsZScsICdBY3RpdmUgZmlsZScpIDogdW5kZWZpbmVkLCBpID09PSAwKSk7XG5cdFx0XHRpZiAobmV3TGVuIC0gbGVuID49IDUpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU0VBUkNIXG5cdFx0Ly8gdXNlIGZpbGUgc2VhcmNoIHdoZW4gaGF2aW5nIGEgcGF0dGVyblxuXHRcdGlmIChwYXR0ZXJuKSB7XG5cblx0XHRcdGNvbnN0IGNhY2hlS2V5ID0gdGhpcy51cGRhdGVDYWNoZUtleSgpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlcyA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZSBvZiB3b3Jrc3BhY2VzKSB7XG5cdFx0XHRcdGNvbnN0IHsgZm9sZGVycywgZmlsZXMgfSA9IGF3YWl0IHNlYXJjaEZpbGVzQW5kRm9sZGVycyh3b3Jrc3BhY2UsIHBhdHRlcm4sIHRydWUsIHRva2VuLCBjYWNoZUtleS5rZXksIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuc2VhcmNoU2VydmljZSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRcdGlmICghc2Vlbi5oYXMoZmlsZSkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKG1ha2VDb21wbGV0aW9uSXRlbShmaWxlLCBGaWxlS2luZC5GSUxFKSk7XG5cdFx0XHRcdFx0XHRzZWVuLmFkZChmaWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgZm9sZGVycykge1xuXHRcdFx0XHRcdGlmICghc2Vlbi5oYXMoZm9sZGVyKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2gobWFrZUNvbXBsZXRpb25JdGVtKGZvbGRlciwgRmlsZUtpbmQuRk9MREVSKSk7XG5cdFx0XHRcdFx0XHRzZWVuLmFkZChmb2xkZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIG1hcmsgcmVzdWx0cyBhcyBpbmNvbXBsZXRlIGJlY2F1c2UgZnVydGhlciB0eXBpbmcgbWlnaHQgeWllbGRcblx0XHQvLyBpbiBtb3JlIHNlYXJjaCByZXN1bHRzXG5cdFx0cmVzdWx0LmluY29tcGxldGUgPSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRTeW1ib2xFbnRyaWVzKHdpZGdldDogSUNoYXRXaWRnZXQsIHJlc3VsdDogQ29tcGxldGlvbkxpc3QsIGluZm86IHsgaW5zZXJ0OiBSYW5nZTsgcmVwbGFjZTogUmFuZ2U7IHZhcldvcmQ6IElXb3JkQXRQb3NpdGlvbiB8IG51bGwgfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0Y29uc3QgdGltZW91dE1zID0gMTAwO1xuXHRcdGNvbnN0IHN0b3B3YXRjaCA9IG5ldyBTdG9wV2F0Y2goKTtcblxuXHRcdGNvbnN0IHR5cGVkTGVhZGVyID0gaW5mby52YXJXb3JkPy53b3JkPy5jaGFyQXQoMCkgPT09IGNoYXRBZ2VudExlYWRlciA/IGNoYXRBZ2VudExlYWRlciA6IGNoYXRWYXJpYWJsZUxlYWRlcjtcblxuXHRcdGNvbnN0IG1ha2VTeW1ib2xDb21wbGV0aW9uSXRlbSA9IChzeW1ib2xJdGVtOiB7IG5hbWU6IHN0cmluZzsgbG9jYXRpb246IExvY2F0aW9uOyBraW5kOiBTeW1ib2xLaW5kIH0sIHBhdHRlcm46IHN0cmluZyk6IENvbXBsZXRpb25JdGVtID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBgJHt0eXBlZExlYWRlcn1zeW06JHtzeW1ib2xJdGVtLm5hbWV9YDtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gc3ltYm9sSXRlbS5sb2NhdGlvbi51cmk7XG5cdFx0XHRjb25zdCB1cmlMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3Qgc29ydFRleHQgPSBwYXR0ZXJuID8gJ3snIC8qIGFmdGVyIHogKi8gOiAnfCcgLyogYWZ0ZXIgeyAqLztcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHN5bWJvbEl0ZW0ubmFtZSwgZGVzY3JpcHRpb246IHVyaUxhYmVsIH0sXG5cdFx0XHRcdGZpbHRlclRleHQ6IGAke3R5cGVkTGVhZGVyfSR7c3ltYm9sSXRlbS5uYW1lfWAsXG5cdFx0XHRcdGluc2VydFRleHQ6IGluZm8udmFyV29yZD8uZW5kQ29sdW1uID09PSBpbmZvLnJlcGxhY2UuZW5kQ29sdW1uID8gYCR7dGV4dH0gYCA6IHRleHQsXG5cdFx0XHRcdHJhbmdlOiBpbmZvLFxuXHRcdFx0XHRraW5kOiBTeW1ib2xLaW5kcy50b0NvbXBsZXRpb25LaW5kKHN5bWJvbEl0ZW0ua2luZCksXG5cdFx0XHRcdHNvcnRUZXh0LFxuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0aWQ6IEJ1aWx0aW5EeW5hbWljQ29tcGxldGlvbnMuYWRkUmVmZXJlbmNlQ29tbWFuZCwgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFtuZXcgUmVmZXJlbmNlQXJndW1lbnQod2lkZ2V0LCB7XG5cdFx0XHRcdFx0XHRpZDogYHZzY29kZS5zeW1ib2wvJHtKU09OLnN0cmluZ2lmeShzeW1ib2xJdGVtLmxvY2F0aW9uKX1gLFxuXHRcdFx0XHRcdFx0ZnVsbE5hbWU6IHN5bWJvbEl0ZW0ubmFtZSxcblx0XHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogaW5mby5yZXBsYWNlLnN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IGluZm8ucmVwbGFjZS5zdGFydENvbHVtbiwgZW5kTGluZU51bWJlcjogaW5mby5yZXBsYWNlLmVuZExpbmVOdW1iZXIsIGVuZENvbHVtbjogaW5mby5yZXBsYWNlLnN0YXJ0Q29sdW1uICsgdGV4dC5sZW5ndGggfSxcblx0XHRcdFx0XHRcdGRhdGE6IHN5bWJvbEl0ZW0ubG9jYXRpb24sXG5cdFx0XHRcdFx0XHRpY29uOiBTeW1ib2xLaW5kcy50b0ljb24oc3ltYm9sSXRlbS5raW5kKVxuXHRcdFx0XHRcdH0pXVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRsZXQgcGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpbmZvLnZhcldvcmQ/LndvcmQgJiYgKGluZm8udmFyV29yZC53b3JkLnN0YXJ0c1dpdGgoY2hhdFZhcmlhYmxlTGVhZGVyKSB8fCBpbmZvLnZhcldvcmQud29yZC5zdGFydHNXaXRoKGNoYXRBZ2VudExlYWRlcikpKSB7XG5cdFx0XHRwYXR0ZXJuID0gaW5mby52YXJXb3JkLndvcmQudG9Mb3dlckNhc2UoKS5zbGljZSgxKTsgLy8gcmVtb3ZlIGxlYWRpbmcgIyBvciBAXG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3ltYm9sc1RvQWRkOiB7IHN5bWJvbDogRG9jdW1lbnRTeW1ib2w7IHVyaTogVVJJIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgb3V0bGluZU1vZGVsIG9mIHRoaXMub3V0bGluZVNlcnZpY2UuZ2V0Q2FjaGVkTW9kZWxzKCkpIHtcblx0XHRcdGNvbnN0IHN5bWJvbHMgPSBvdXRsaW5lTW9kZWwuYXNMaXN0T2ZEb2N1bWVudFN5bWJvbHMoKTtcblx0XHRcdGZvciAoY29uc3Qgc3ltYm9sIG9mIHN5bWJvbHMpIHtcblx0XHRcdFx0c3ltYm9sc1RvQWRkLnB1c2goeyBzeW1ib2wsIHVyaTogb3V0bGluZU1vZGVsLnVyaSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgdGltZWRPdXQgPSBmYWxzZTtcblxuXHRcdGZvciAoY29uc3Qgc3ltYm9sIG9mIHN5bWJvbHNUb0FkZCkge1xuXHRcdFx0aWYgKHN0b3B3YXRjaC5lbGFwc2VkKCkgPiB0aW1lb3V0TXMgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGltZWRPdXQgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKG1ha2VTeW1ib2xDb21wbGV0aW9uSXRlbSh7IC4uLnN5bWJvbC5zeW1ib2wsIGxvY2F0aW9uOiB7IHVyaTogc3ltYm9sLnVyaSwgcmFuZ2U6IHN5bWJvbC5zeW1ib2wucmFuZ2UgfSB9LCBwYXR0ZXJuID8/ICcnKSk7XG5cdFx0fVxuXG5cdFx0cmVzdWx0LmluY29tcGxldGUgPSAhIXBhdHRlcm4gfHwgdGltZWRPdXQ7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNhY2hlS2V5KCkge1xuXHRcdGlmICh0aGlzLmNhY2hlS2V5ICYmIERhdGUubm93KCkgLSB0aGlzLmNhY2hlS2V5LnRpbWUgPiA2MDAwMCkge1xuXHRcdFx0dGhpcy5zZWFyY2hTZXJ2aWNlLmNsZWFyQ2FjaGUodGhpcy5jYWNoZUtleS5rZXkpO1xuXHRcdFx0dGhpcy5jYWNoZUtleSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuY2FjaGVLZXkpIHtcblx0XHRcdHRoaXMuY2FjaGVLZXkgPSB7XG5cdFx0XHRcdGtleTogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdHRpbWU6IERhdGUubm93KClcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGhpcy5jYWNoZUtleS50aW1lID0gRGF0ZS5ub3coKTtcblxuXHRcdHJldHVybiB0aGlzLmNhY2hlS2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBjbWRBZGRSZWZlcmVuY2UoYXJnOiBSZWZlcmVuY2VBcmd1bWVudCkge1xuXHRcdC8vIGludm9rZWQgdmlhIHRoZSBjb21wbGV0aW9uIGNvbW1hbmRcblx0XHRhcmcud2lkZ2V0LmdldENvbnRyaWI8Q2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsPihDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwuSUQpPy5hZGRSZWZlcmVuY2UoYXJnLnZhcmlhYmxlKTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucywgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5cbmNsYXNzIFRvb2xDb21wbGV0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFZhcmlhYmxlTmFtZURlZiA9IG5ldyBSZWdFeHAoYCg/PD1efFxcXFxzKVske2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0VmFyaWFibGVMZWFkZXIpfSR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRBZ2VudExlYWRlcil9XVxcXFx3KmAsICdnJyk7IC8vIE1VU1QgYmUgdXNpbmcgYGdgLWZsYWdcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdjaGF0VmFyaWFibGVzJyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbY2hhdFZhcmlhYmxlTGVhZGVyLCBjaGF0QWdlbnRMZWFkZXJdLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc0FnZW50SG9zdEJhY2tlZFdpZGdldCh3aWRnZXQpKSB7XG5cdFx0XHRcdFx0Ly8gQWdlbnQtaG9zdCBzZXNzaW9ucyBkZWxlZ2F0ZSBjb21wbGV0aW9ucyB0byB0aGUgaG9zdFxuXHRcdFx0XHRcdC8vIHByb2Nlc3MgdmlhIGBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zYC5cblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIGxvY2tlZCB0byBhbiBhZ2VudCB0aGF0IGRvZXNuJ3Qgc3VwcG9ydCB0b29sIGF0dGFjaG1lbnRzLCBza2lwXG5cdFx0XHRcdGlmICh3aWRnZXQubG9ja2VkQWdlbnRJZCkge1xuXHRcdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KHdpZGdldC5sb2NrZWRBZ2VudElkKTtcblx0XHRcdFx0XHRpZiAoYWdlbnQgJiYgIWFnZW50LmNhcGFiaWxpdGllcz8uc3VwcG9ydHNUb29sQXR0YWNobWVudHMpIHtcblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIHBvc2l0aW9uLCBUb29sQ29tcGxldGlvbnMuVmFyaWFibGVOYW1lRGVmLCB0cnVlKTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblxuXHRcdFx0XHRjb25zdCB1c2VkTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHdpZGdldC5wYXJzZWRJbnB1dC5wYXJ0cykge1xuXHRcdFx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUb29sUGFydCkge1xuXHRcdFx0XHRcdFx0dXNlZE5hbWVzLmFkZChwYXJ0LnRvb2xOYW1lKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFRvb2xTZXRQYXJ0KSB7XG5cdFx0XHRcdFx0XHR1c2VkTmFtZXMuYWRkKHBhcnQubmFtZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdHlwZWRMZWFkZXIgPSByYW5nZS52YXJXb3JkPy53b3JkPy5jaGFyQXQoMCkgPT09IGNoYXRBZ2VudExlYWRlciA/IGNoYXRBZ2VudExlYWRlciA6IGNoYXRWYXJpYWJsZUxlYWRlcjtcblx0XHRcdFx0Y29uc3QgcGF0dGVybiA9IHJhbmdlLnZhcldvcmQ/LndvcmQgPyByYW5nZS52YXJXb3JkLndvcmQudG9Mb3dlckNhc2UoKS5zbGljZSgxKSA6ICcnO1xuXHRcdFx0XHRjb25zdCBzdWdnZXN0aW9uczogQ29tcGxldGlvbkl0ZW1bXSA9IFtdO1xuXG5cblx0XHRcdFx0Y29uc3QgaXRlciA9IHdpZGdldC5pbnB1dC5zZWxlY3RlZFRvb2xzTW9kZWwuZW50cmllc01hcC5nZXQoKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IFtpdGVtLCBlbmFibGVkXSBvZiBpdGVyKSB7XG5cdFx0XHRcdFx0aWYgKCFlbmFibGVkKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgZGV0YWlsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0bGV0IGRvY3VtZW50YXRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdGxldCBuYW1lOiBzdHJpbmc7XG5cdFx0XHRcdFx0aWYgKGlzVG9vbFNldChpdGVtKSkge1xuXHRcdFx0XHRcdFx0ZGV0YWlsID0gaXRlbS5kZXNjcmlwdGlvbjtcblx0XHRcdFx0XHRcdG5hbWUgPSBpdGVtLnJlZmVyZW5jZU5hbWU7XG5cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc291cmNlID0gaXRlbS5zb3VyY2U7XG5cdFx0XHRcdFx0XHRkZXRhaWwgPSBsb2NhbGl6ZSgndG9vbF9zb3VyY2VfY29tcGxldGlvbicsIFwiezB9OiB7MX1cIiwgc291cmNlLmxhYmVsLCBpdGVtLmRpc3BsYXlOYW1lKTtcblx0XHRcdFx0XHRcdG5hbWUgPSBpdGVtLnRvb2xSZWZlcmVuY2VOYW1lID8/IGl0ZW0uZGlzcGxheU5hbWU7XG5cdFx0XHRcdFx0XHRkb2N1bWVudGF0aW9uID0gaXRlbS51c2VyRGVzY3JpcHRpb24gPz8gaXRlbS5tb2RlbERlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh1c2VkTmFtZXMuaGFzKG5hbWUpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocGF0dGVybikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbG93ZXJOYW1lID0gbmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRcdFx0aWYgKCFpc1BhdHRlcm5JbldvcmQocGF0dGVybiwgMCwgcGF0dGVybi5sZW5ndGgsIGxvd2VyTmFtZSwgMCwgbG93ZXJOYW1lLmxlbmd0aCkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3Qgd2l0aExlYWRlciA9IGAke3R5cGVkTGVhZGVyfSR7bmFtZX1gO1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IHdpdGhMZWFkZXIsXG5cdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdGRldGFpbCxcblx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb24sXG5cdFx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBgJHt0eXBlZExlYWRlcn0ke25hbWV9YCxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6IHdpdGhMZWFkZXIgKyAnICcsXG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVG9vbCxcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHsgc3VnZ2VzdGlvbnMgfTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFRvb2xDb21wbGV0aW9ucywgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFzQixlQUFlLG9CQUFvQjtBQUN6RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUk3QixTQUE0QyxvQkFBa0gsbUJBQW1CO0FBRWpMLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdDQUFnQztBQUN6QyxTQUEwQyxjQUFjLDJCQUEyQjtBQUNuRixTQUFTLGNBQWMseUJBQXlCO0FBQ2hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9C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QU0sT0FBTyxPQUFPLE1BQU0sbUJBQW1CLFdBQVcsSUFBSTtBQUU1RCxtQkFBVyxDQUFDLE1BQU0sT0FBTyxLQUFLLE1BQU07QUFDbkMsY0FBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLFVBQ0Q7QUFFQSxjQUFJO0FBQ0osY0FBSTtBQUVKLGNBQUk7QUFDSixjQUFJLFVBQVUsSUFBSSxHQUFHO0FBQ3BCLHFCQUFTLEtBQUs7QUFDZCxtQkFBTyxLQUFLO0FBQUEsVUFFYixPQUFPO0FBQ04sa0JBQU0sU0FBUyxLQUFLO0FBQ3BCLHFCQUFTLFNBQVMsMEJBQTBCLFlBQVksT0FBTyxPQUFPLEtBQUssV0FBVztBQUN0RixtQkFBTyxLQUFLLHFCQUFxQixLQUFLO0FBQ3RDLDRCQUFnQixLQUFLLG1CQUFtQixLQUFLO0FBQUEsVUFDOUM7QUFFQSxjQUFJLFVBQVUsSUFBSSxJQUFJLEdBQUc7QUFDeEI7QUFBQSxVQUNEO0FBRUEsY0FBSSxTQUFTO0FBQ1osa0JBQU0sWUFBWSxLQUFLLFlBQVk7QUFDbkMsZ0JBQUksQ0FBQyxnQkFBZ0IsU0FBUyxHQUFHLFFBQVEsUUFBUSxXQUFXLEdBQUcsVUFBVSxNQUFNLEdBQUc7QUFDakY7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUVBLGdCQUFNLGFBQWEsR0FBRyxXQUFXLEdBQUcsSUFBSTtBQUN4QyxzQkFBWSxLQUFLO0FBQUEsWUFDaEIsT0FBTztBQUFBLFlBQ1A7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0EsWUFBWSxHQUFHLFdBQVcsR0FBRyxJQUFJO0FBQUEsWUFDakMsWUFBWSxhQUFhO0FBQUEsWUFDekIsTUFBTSxtQkFBbUI7QUFBQSxVQUMxQixDQUFDO0FBQUEsUUFFRjtBQUVBLGVBQU8sRUFBRSxZQUFZO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQXhHTSxnQkFFbUIsa0JBQWtCLElBQUksT0FBTyxjQUFjLG1CQUFtQixrQkFBa0IsQ0FBQyxHQUFHLG1CQUFtQixlQUFlLENBQUMsU0FBUyxHQUFHO0FBRnRKLGtCQUFOO0FBQUEsRUFLRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQRztBQTBHTixTQUFTLEdBQW9DLG9CQUFvQixTQUFTLEVBQUUsOEJBQThCLGlCQUFpQixlQUFlLFVBQVU7IiwKICAibmFtZXMiOiBbImxhYmVsIiwgInVzZWRBZ2VudCIsICJhY2Nlc3NvciIsICJiYXNlbmFtZSIsICJjb2RlRWRpdG9yIiwgInBhdHRlcm4iXQp9Cg==
