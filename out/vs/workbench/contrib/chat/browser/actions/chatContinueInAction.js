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
import { Codicon } from "../../../../../base/common/codicons.js";
import { h } from "../../../../../base/browser/dom.js";
import { Disposable, markAsSingleton } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { isAbsolute } from "../../../../../base/common/path.js";
import { basename } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { isITextModel } from "../../../../../editor/common/model.js";
import { localize, localize2 } from "../../../../../nls.js";
import { ActionWidgetDropdownActionViewItem } from "../../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IsSessionsWindowContext, ResourceContextKey } from "../../../../common/contextkeys.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IChatAgentService } from "../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { chatEditingWidgetFileStateContextKey, ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { ChatRequestParser } from "../../common/requestParser/chatRequestParser.js";
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from "../attachments/chatVariables.js";
import { ChatSendResult, IChatService } from "../../common/chatService/chatService.js";
import { IChatSessionsService, SessionType } from "../../common/chatSessionsService.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { PROMPT_LANGUAGE_ID } from "../../common/promptSyntax/promptTypes.js";
import { AgentSessionProviders, CHAT_DELEGATE_TO_AGENT_HOST_SESSION_COMMAND_ID, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName, isAgentHostTarget } from "../agentSessions/agentSessions.js";
import { ISCMService } from "../../../scm/common/scm.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { IChatWidgetService, isIChatViewViewContext } from "../chat.js";
import { ctxHasEditorModification } from "../chatEditing/chatEditingEditorContextKeys.js";
import { CHAT_SETUP_ACTION_ID } from "./chatActions.js";
import { PromptFileVariableKind, toPasteVariableEntry, toPromptFileVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { ChatSessionPosition, openChatSession } from "../chatSessions/chatSessions.contribution.js";
import { importedTurnsFromChatModel } from "../agentSessions/agentHost/importLocalConversationToAgentSession.js";
function extractNwoFromRemoteUrl(remoteUrl) {
  const match = remoteUrl.match(/(?:github\.com)[/:](?<owner>[^/]+)\/(?<repo>[^/.]+)/);
  if (match?.groups) {
    return `${match.groups.owner}/${match.groups.repo}`;
  }
  return void 0;
}
async function resolveGitRemoteNwo(repoPath, fileService) {
  try {
    const gitPath = `${repoPath}/.git`;
    const gitUri = URI.file(gitPath);
    let configUri;
    try {
      const stat = await fileService.stat(gitUri);
      if (stat.isDirectory) {
        configUri = URI.file(`${gitPath}/config`);
      } else {
        const gitFile = await fileService.readFile(gitUri);
        const gitDir = gitFile.value.toString().trim().replace(/^gitdir:\s*/, "");
        const resolvedGitDir = gitDir.startsWith("/") ? gitDir : `${repoPath}/${gitDir}`;
        const commonDir = resolvedGitDir.replace(/\/worktrees\/[^/]+$/, "");
        configUri = URI.file(`${commonDir}/config`);
      }
    } catch {
      return void 0;
    }
    const content = await fileService.readFile(configUri);
    const configText = content.value.toString();
    const remoteMatch = configText.match(/\[remote\s+"origin"\][^[]*url\s*=\s*(.+)/m);
    if (remoteMatch?.[1]) {
      return extractNwoFromRemoteUrl(remoteMatch[1].trim());
    }
  } catch {
  }
  return void 0;
}
var ActionLocation = /* @__PURE__ */ ((ActionLocation2) => {
  ActionLocation2["ChatWidget"] = "chatWidget";
  ActionLocation2["Editor"] = "editor";
  return ActionLocation2;
})(ActionLocation || {});
const _ContinueChatInSessionAction = class _ContinueChatInSessionAction extends Action2 {
  constructor() {
    super({
      id: _ContinueChatInSessionAction.ID,
      title: localize2("continueChatInSession", "Continue Chat in..."),
      tooltip: localize("continueChatInSession", "Continue Chat in..."),
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ChatContextKeys.requestInProgress.negate(),
        ChatContextKeys.remoteJobCreating.negate(),
        ChatContextKeys.hasCanDelegateProviders
      ),
      menu: [
        {
          id: MenuId.ChatExecute,
          group: "navigation",
          order: 3.4,
          when: ContextKeyExpr.and(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.hasCanDelegateProviders
          )
        },
        {
          id: MenuId.EditorContent,
          group: "continueIn",
          when: ContextKeyExpr.and(
            ContextKeyExpr.equals(ResourceContextKey.Scheme.key, Schemas.untitled),
            ContextKeyExpr.equals(ResourceContextKey.LangId.key, PROMPT_LANGUAGE_ID),
            ContextKeyExpr.notEquals(chatEditingWidgetFileStateContextKey.key, ModifiedFileEntryState.Modified),
            ctxHasEditorModification.negate(),
            ChatContextKeys.hasCanDelegateProviders
          )
        }
      ]
    });
  }
  async run() {
  }
};
_ContinueChatInSessionAction.ID = "workbench.action.chat.continueChatInSession";
let ContinueChatInSessionAction = _ContinueChatInSessionAction;
let ChatContinueInSessionActionItem = class extends ActionWidgetDropdownActionViewItem {
  constructor(action, location, actionWidgetService, contextKeyService, keybindingService, chatSessionsService, instantiationService, openerService, telemetryService, scmService, workspaceContextService) {
    super(action, {
      actionProvider: ChatContinueInSessionActionItem.actionProvider(chatSessionsService, instantiationService, scmService, workspaceContextService, location),
      actionBarActions: ChatContinueInSessionActionItem.getActionBarActions(openerService),
      reporter: { id: "ChatContinueInSession", name: "ChatContinueInSession", includeOptions: true }
    }, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.location = location;
    this.contextKeyService = contextKeyService;
  }
  static getActionBarActions(openerService) {
    const learnMoreUrl = "https://aka.ms/vscode-agent-handoff";
    return [{
      id: "workbench.action.chat.continueChatInSession.learnMore",
      label: localize("chat.learnMore", "Learn More"),
      tooltip: localize("chat.learnMore", "Learn More"),
      class: void 0,
      enabled: true,
      run: async () => {
        await openerService.open(URI.parse(learnMoreUrl));
      }
    }];
  }
  static actionProvider(chatSessionsService, instantiationService, scmService, workspaceContextService, location) {
    return {
      getActions: () => {
        const actions = [];
        const contributions = chatSessionsService.getAllChatSessionContributions();
        const folders = workspaceContextService.getWorkspace().folders;
        let hasGitRepo = false;
        if (folders.length > 0) {
          for (const repo of scmService.repositories) {
            if (repo.provider.rootUri && workspaceContextService.getWorkspaceFolder(repo.provider.rootUri)) {
              hasGitRepo = true;
              break;
            }
          }
        }
        const backgroundContrib = contributions.find((contrib) => contrib.type === AgentSessionProviders.Background);
        if (backgroundContrib && backgroundContrib.canDelegate) {
          actions.push(this.toAction(AgentSessionProviders.Background, backgroundContrib, instantiationService, location));
        }
        const cloudContrib = contributions.find((contrib) => contrib.type === AgentSessionProviders.Cloud);
        if (cloudContrib && cloudContrib.canDelegate) {
          actions.push(this.toAction(AgentSessionProviders.Cloud, cloudContrib, instantiationService, location, hasGitRepo));
        }
        for (const contrib of contributions) {
          if (contrib.canDelegate && isAgentHostTarget(contrib.type)) {
            actions.push(this.toAction(contrib.type, contrib, instantiationService, location));
          }
        }
        if (actions.length === 0) {
          actions.push(this.toSetupAction(AgentSessionProviders.Background, instantiationService));
          actions.push(this.toSetupAction(AgentSessionProviders.Cloud, instantiationService));
        }
        return actions;
      }
    };
  }
  static toAction(provider, contrib, instantiationService, location, enabled = true) {
    const providerName = getAgentSessionProviderName(provider);
    const label = providerName === provider ? contrib.displayName ?? providerName : providerName;
    return {
      id: contrib.type,
      enabled,
      icon: getAgentSessionProviderIcon(provider),
      class: void 0,
      description: `@${contrib.name}`,
      label,
      tooltip: localize("continueSessionIn", "Continue in {0}", label),
      category: { label: localize("continueIn", "Continue In"), order: 0, showHeader: true },
      run: () => instantiationService.invokeFunction((accessor) => {
        if (location === "editor" /* Editor */) {
          return new CreateRemoteAgentJobFromEditorAction().run(accessor, contrib);
        }
        return new CreateRemoteAgentJobAction().run(accessor, contrib);
      })
    };
  }
  static toSetupAction(provider, instantiationService) {
    return {
      id: provider,
      enabled: true,
      icon: getAgentSessionProviderIcon(provider),
      class: void 0,
      label: getAgentSessionProviderName(provider),
      tooltip: localize("continueSessionIn", "Continue in {0}", getAgentSessionProviderName(provider)),
      category: { label: localize("continueIn", "Continue In"), order: 0, showHeader: true },
      run: () => instantiationService.invokeFunction((accessor) => {
        const commandService = accessor.get(ICommandService);
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
      })
    };
  }
  renderLabel(element) {
    if (this.location === "editor" /* Editor */) {
      const view = h("span.action-widget-delegate-label", [
        h("span", { className: ThemeIcon.asClassName(Codicon.forward) }),
        h("span", [localize("continueInEllipsis", "Continue in...")])
      ]);
      element.appendChild(view.root);
      return null;
    } else {
      const icon = this.contextKeyService.contextMatchesRules(ChatContextKeys.remoteJobCreating) ? Codicon.sync : Codicon.forward;
      element.classList.add(...ThemeIcon.asClassNameArray(icon));
      return super.renderLabel(element);
    }
  }
};
ChatContinueInSessionActionItem = __decorateClass([
  __decorateParam(2, IActionWidgetService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IChatSessionsService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, ISCMService),
  __decorateParam(10, IWorkspaceContextService)
], ChatContinueInSessionActionItem);
const NEW_CHAT_SESSION_ACTION_ID = "workbench.action.chat.openNewSessionEditor";
const MAX_DELEGATION_TRANSCRIPT_LENGTH = 2e4;
function buildDelegationTranscript(requests, maxLength = MAX_DELEGATION_TRANSCRIPT_LENGTH) {
  let transcript = requests.map((req) => {
    const userMsg = `User: ${req.message.text}`;
    const respMsg = req.response?.response ? `Assistant: ${req.response.response.getMarkdown()}` : "";
    return respMsg ? `${userMsg}
${respMsg}` : userMsg;
  }).join("\n\n");
  if (transcript.length > maxLength) {
    transcript = transcript.substring(transcript.length - maxLength);
  }
  return transcript;
}
function createDelegationTranscriptAttachment(transcript, sourceName) {
  if (!transcript) {
    return void 0;
  }
  const transcriptName = localize("chat.delegation.transcriptName", "Previous conversation");
  const transcriptContent = localize("chat.delegation.transcriptContent", "The following is the conversation history from a previous {0} session. Continue working on it.\n\n{1}", sourceName, transcript);
  return toPasteVariableEntry(transcriptName, transcriptContent, {
    id: `chat-delegation-transcript-${generateUuid()}`,
    icon: Codicon.history,
    language: "markdown",
    pastedLines: transcriptName,
    fileName: transcriptName
  });
}
class CreateRemoteAgentJobAction {
  constructor() {
  }
  openUntitledEditor(commandService, continuationTarget) {
    commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`);
  }
  /**
   * Extracts the GitHub "owner/repo" NWO from the source session by checking
   * multiple data sources: chat model repoData, session metadata, and session options.
   */
  async extractRepoNwoFromSession(agentSessionsService, chatSessionsService, fileService, sessionResource, chatModel) {
    const repoData = chatModel.repoData;
    if (repoData?.remoteUrl) {
      const nwo = extractNwoFromRemoteUrl(repoData.remoteUrl);
      if (nwo) {
        return nwo;
      }
    }
    const agentSession = agentSessionsService.getSession(sessionResource);
    if (agentSession?.metadata) {
      const metadata = agentSession.metadata;
      const owner = metadata.owner;
      const name = metadata.name;
      if (owner && name) {
        return `${owner}/${name}`;
      }
      const repositoryNwo = metadata.repositoryNwo;
      if (repositoryNwo?.includes("/")) {
        return repositoryNwo;
      }
      const repositoryUrl = metadata.repositoryUrl;
      if (repositoryUrl) {
        const nwo = extractNwoFromRemoteUrl(repositoryUrl);
        if (nwo) {
          return nwo;
        }
      }
      const workingDir = metadata.workingDirectoryPath ?? metadata.repositoryPath ?? metadata.worktreePath;
      if (workingDir) {
        const nwo = await resolveGitRemoteNwo(workingDir, fileService);
        if (nwo) {
          return nwo;
        }
      }
    }
    for (const optionId of ["repositories", "repository"]) {
      const repoOption = chatSessionsService.getSessionOption(sessionResource, optionId);
      if (repoOption) {
        const optionValue = typeof repoOption === "string" ? repoOption : repoOption.id;
        if (optionValue) {
          const segments = optionValue.split("/").filter(Boolean);
          if (segments.length === 2) {
            return optionValue;
          }
          const nwo = extractNwoFromRemoteUrl(optionValue);
          if (nwo) {
            return nwo;
          }
          try {
            const uri = URI.parse(optionValue);
            if (uri.authority === "github") {
              const parts = uri.path.split("/").filter(Boolean);
              if (parts.length >= 2) {
                return `${parts[0]}/${parts[1]}`;
              }
            }
          } catch {
          }
          if (isAbsolute(optionValue)) {
            const nwoFromGit = await resolveGitRemoteNwo(optionValue, fileService);
            if (nwoFromGit) {
              return nwoFromGit;
            }
          }
        }
      }
    }
    return void 0;
  }
  async run(accessor, continuationTarget, _widget) {
    const contextKeyService = accessor.get(IContextKeyService);
    const commandService = accessor.get(ICommandService);
    const widgetService = accessor.get(IChatWidgetService);
    const chatAgentService = accessor.get(IChatAgentService);
    const chatService = accessor.get(IChatService);
    const editorService = accessor.get(IEditorService);
    const agentSessionsService = accessor.get(IAgentSessionsService);
    const chatSessionsService = accessor.get(IChatSessionsService);
    const fileService = accessor.get(IFileService);
    const instantiationService = accessor.get(IInstantiationService);
    const remoteJobCreatingKey = ChatContextKeys.remoteJobCreating.bindTo(contextKeyService);
    try {
      remoteJobCreatingKey.set(true);
      const widget = _widget ?? widgetService.lastFocusedWidget;
      if (!widget || !widget.viewModel) {
        return this.openUntitledEditor(commandService, continuationTarget);
      }
      const chatModel = widget.viewModel.model;
      if (!chatModel) {
        return;
      }
      const sessionResource = widget.viewModel.sessionResource;
      const chatRequests = chatModel.getRequests();
      let userPrompt = widget.getInput();
      if (!userPrompt) {
        if (!chatRequests.length) {
          return this.openUntitledEditor(commandService, continuationTarget);
        }
        userPrompt = "implement this.";
      }
      const attachedContext = widget.input.getAttachedAndImplicitContext();
      widget.input.acceptInput(true);
      if (widget.location === ChatAgentLocation.EditorInline) {
        const activeEditor = editorService.activeTextEditorControl;
        if (activeEditor) {
          const model = activeEditor.getModel();
          let activeEditorUri = void 0;
          if (model && isITextModel(model)) {
            activeEditorUri = model.uri;
          }
          const selection = activeEditor.getSelection();
          if (activeEditorUri && selection) {
            attachedContext.add({
              kind: "file",
              id: "vscode.implicit.selection",
              name: basename(activeEditorUri),
              value: {
                uri: activeEditorUri,
                range: selection
              }
            });
          }
        }
      }
      const continuationTargetType = continuationTarget.type;
      const isSessionsWindow = IsSessionsWindowContext.getValue(contextKeyService);
      const sourceSessionType = getAgentSessionProvider(sessionResource) ?? getChatSessionType(sessionResource);
      const handoffToNewSession = isSessionsWindow || isAgentHostTarget(continuationTargetType) || !!sourceSessionType && isAgentHostTarget(sourceSessionType);
      if (handoffToNewSession && sourceSessionType && sourceSessionType !== continuationTargetType) {
        const isSidebar = isIChatViewViewContext(widget.viewContext);
        const transcript = buildDelegationTranscript(chatRequests);
        const sourceContribution = chatSessionsService.getAllChatSessionContributions().find((c) => c.type === sourceSessionType || getAgentSessionProvider(c.type) === sourceSessionType);
        const sourceName = sourceContribution?.displayName ?? getAgentSessionProviderName(sourceSessionType);
        const continuationContext = attachedContext.asArray();
        let handoffPrompt = userPrompt;
        const importConversationTurns = continuationTargetType === SessionType.AgentHostCopilot && !isSessionsWindow ? importedTurnsFromChatModel(chatModel) : void 0;
        const importConversationModelId = importConversationTurns ? widget.input.selectedLanguageModel.get()?.metadata.id : void 0;
        const importConversationModel = importConversationModelId ? { id: importConversationModelId } : void 0;
        if (transcript && !importConversationTurns) {
          if (isAgentHostTarget(continuationTargetType)) {
            const transcriptAttachment = createDelegationTranscriptAttachment(transcript, sourceName);
            if (transcriptAttachment) {
              continuationContext.unshift(transcriptAttachment);
            }
          } else {
            handoffPrompt = localize("chat.delegation.inlinePrompt", "The following is the conversation history from a previous {0} session. Continue working on it.\n\n{1}\n\nUser: {2}", sourceName, transcript, userPrompt);
          }
        }
        const initialSessionOptions = /* @__PURE__ */ new Map();
        const repoNwo = await this.extractRepoNwoFromSession(agentSessionsService, chatSessionsService, fileService, sessionResource, chatModel);
        if (repoNwo) {
          initialSessionOptions.set("repositories", repoNwo);
        }
        if (isAgentHostTarget(continuationTargetType)) {
          if (isSessionsWindow) {
            const delegationRequest = {
              type: continuationTargetType,
              displayName: continuationTarget.displayName,
              prompt: handoffPrompt,
              attachedContext: continuationContext
            };
            await commandService.executeCommand(CHAT_DELEGATE_TO_AGENT_HOST_SESSION_COMMAND_ID, delegationRequest);
          } else {
            await instantiationService.invokeFunction((innerAccessor) => openChatSession(
              innerAccessor,
              {
                type: continuationTargetType,
                displayName: continuationTarget.displayName,
                position: isSidebar ? ChatSessionPosition.Sidebar : ChatSessionPosition.Editor,
                // Replace the source chat editor in place so switching harness
                // feels like the same chat continues rather than opening a new
                // tab. The source (local) session stays in chat history and is
                // recoverable. The sidebar path already swaps in place via
                // `loadSession`, so it needs no replacement. Pass the source
                // resource (not a bare flag) so the correct editor is resolved
                // at replace time even if the active editor changed meanwhile.
                replaceEditorForResource: isSidebar ? void 0 : sessionResource
              },
              {
                prompt: handoffPrompt,
                attachedContext: continuationContext,
                initialSessionOptions: initialSessionOptions.size > 0 ? initialSessionOptions : void 0,
                importConversation: importConversationTurns ? { turns: importConversationTurns, model: importConversationModel } : void 0
              }
            ));
          }
          return;
        }
        const actionId = isSidebar ? `workbench.action.chat.openNewSessionSidebar.${continuationTargetType}` : `${NEW_CHAT_SESSION_ACTION_ID}.${continuationTargetType}`;
        await commandService.executeCommand(actionId, {
          prompt: handoffPrompt,
          attachedContext: continuationContext,
          initialSessionOptions: initialSessionOptions.size > 0 ? initialSessionOptions : void 0
        });
        return;
      }
      const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
      const requestParser = instantiationService.createInstance(ChatRequestParser);
      const context = { sessionType: getChatSessionType(sessionResource) };
      const parsedRequest = requestParser.parseChatRequestWithReferences(getDynamicVariablesForWidget(widget), getSelectedToolAndToolSetsForWidget(widget), userPrompt, ChatAgentLocation.Chat, context);
      const addedRequest = chatModel.addRequest(
        parsedRequest,
        { variables: attachedContext.asArray() },
        0,
        void 0,
        defaultAgent
      );
      await chatService.removeRequest(sessionResource, addedRequest.id);
      const sendResult = await chatService.sendRequest(sessionResource, userPrompt, {
        agentIdSilent: continuationTargetType,
        attachedContext: attachedContext.asArray(),
        ...widget.getSelectedModelRequestOptions(),
        ...widget.getModeRequestOptions()
      });
      if (ChatSendResult.isSent(sendResult)) {
        await widget.handleDelegationExitIfNeeded(defaultAgent, sendResult.data.agent);
      }
    } catch (e) {
      console.error("[Delegation] Error creating remote coding agent job", e);
      throw e;
    } finally {
      remoteJobCreatingKey.set(false);
    }
  }
}
class CreateRemoteAgentJobFromEditorAction {
  constructor() {
  }
  async run(accessor, continuationTarget) {
    try {
      const editorService = accessor.get(IEditorService);
      const activeEditor = editorService.activeTextEditorControl;
      const commandService = accessor.get(ICommandService);
      if (!activeEditor) {
        return;
      }
      const model = activeEditor.getModel();
      if (!model || !isITextModel(model)) {
        return;
      }
      const uri = model.uri;
      const attachedContext = [toPromptFileVariableEntry(uri, PromptFileVariableKind.PromptFile, void 0, false, [])];
      const prompt = `Follow instructions in [${basename(uri)}](${uri.toString()}).`;
      await commandService.executeCommand(`${NEW_CHAT_SESSION_ACTION_ID}.${continuationTarget.type}`, { prompt, attachedContext });
    } catch (e) {
      console.error("Error creating remote agent job from editor", e);
      throw e;
    }
  }
}
let ContinueChatInSessionActionRendering = class extends Disposable {
  constructor(actionViewItemService, instantiationService) {
    super();
    const disposable = actionViewItemService.register(MenuId.EditorContent, ContinueChatInSessionAction.ID, (action, options, instantiationService2) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(ChatContinueInSessionActionItem, action, "editor" /* Editor */);
    });
    markAsSingleton(disposable);
  }
};
ContinueChatInSessionActionRendering.ID = "chat.continueChatInSessionActionRendering";
ContinueChatInSessionActionRendering = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService)
], ContinueChatInSessionActionRendering);
export {
  ActionLocation,
  ChatContinueInSessionActionItem,
  ContinueChatInSessionAction,
  ContinueChatInSessionActionRendering,
  CreateRemoteAgentJobAction,
  buildDelegationTranscript,
  createDelegationTranscriptAttachment
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRDb250aW51ZUluQWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCBtYXJrQXNTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGlzSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uLCBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgUmVzb3VyY2VDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgY2hhdEVkaXRpbmdXaWRnZXRGaWxlU3RhdGVDb250ZXh0S2V5LCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RQYXJzZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UmVxdWVzdFBhcnNlci5qcyc7XG5pbXBvcnQgeyBnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0LCBnZXRTZWxlY3RlZFRvb2xBbmRUb29sU2V0c0ZvcldpZGdldCB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFNlbmRSZXN1bHQsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZENoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50LCBJQ2hhdFNlc3Npb25zU2VydmljZSwgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgUFJPTVBUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIEFnZW50U2Vzc2lvblRhcmdldCwgQ0hBVF9ERUxFR0FURV9UT19BR0VOVF9IT1NUX1NFU1NJT05fQ09NTUFORF9JRCwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbiwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lLCBJQWdlbnRIb3N0RGVsZWdhdGlvblJlcXVlc3QsIGlzQWdlbnRIb3N0VGFyZ2V0IH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlLCBpc0lDaGF0Vmlld1ZpZXdDb250ZXh0IH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBjdHhIYXNFZGl0b3JNb2RpZmljYXRpb24gfSBmcm9tICcuLi9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ0VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENIQVRfU0VUVVBfQUNUSU9OX0lEIH0gZnJvbSAnLi9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnksIFByb21wdEZpbGVWYXJpYWJsZUtpbmQsIHRvUGFzdGVWYXJpYWJsZUVudHJ5LCB0b1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25Qb3NpdGlvbiwgb3BlbkNoYXRTZXNzaW9uIH0gZnJvbSAnLi4vY2hhdFNlc3Npb25zL2NoYXRTZXNzaW9ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgaW1wb3J0ZWRUdXJuc0Zyb21DaGF0TW9kZWwgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9pbXBvcnRMb2NhbENvbnZlcnNhdGlvblRvQWdlbnRTZXNzaW9uLmpzJztcbmltcG9ydCB0eXBlIHsgTW9kZWxTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgXCJvd25lci9yZXBvXCIgbmFtZS13aXRoLW93bmVyIGZyb20gYSBnaXQgcmVtb3RlIFVSTC5cbiAqIFN1cHBvcnRzIEhUVFBTIChodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby5naXQpIGFuZCBTU0ggKGdpdEBnaXRodWIuY29tOm93bmVyL3JlcG8uZ2l0KSBmb3JtYXRzLlxuICovXG5mdW5jdGlvbiBleHRyYWN0TndvRnJvbVJlbW90ZVVybChyZW1vdGVVcmw6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1hdGNoID0gcmVtb3RlVXJsLm1hdGNoKC8oPzpnaXRodWJcXC5jb20pWy86XSg/PG93bmVyPlteL10rKVxcLyg/PHJlcG8+W14vLl0rKS8pO1xuXHRpZiAobWF0Y2g/Lmdyb3Vwcykge1xuXHRcdHJldHVybiBgJHttYXRjaC5ncm91cHMub3duZXJ9LyR7bWF0Y2guZ3JvdXBzLnJlcG99YDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIEdpdEh1YiBOV08gZnJvbSBhIGxvY2FsIGdpdCByZXBvc2l0b3J5IHBhdGggYnkgcmVhZGluZyBgLmdpdC9jb25maWdgLlxuICogSGFuZGxlcyBib3RoIHJlZ3VsYXIgcmVwb3MgYW5kIGdpdCB3b3JrdHJlZXMuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVHaXRSZW1vdGVOd28ocmVwb1BhdGg6IHN0cmluZywgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgZ2l0UGF0aCA9IGAke3JlcG9QYXRofS8uZ2l0YDtcblx0XHRjb25zdCBnaXRVcmkgPSBVUkkuZmlsZShnaXRQYXRoKTtcblxuXHRcdGxldCBjb25maWdVcmk6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnN0YXQoZ2l0VXJpKTtcblx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdC8vIFJlZ3VsYXIgZ2l0IHJlcG9cblx0XHRcdFx0Y29uZmlnVXJpID0gVVJJLmZpbGUoYCR7Z2l0UGF0aH0vY29uZmlnYCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBHaXQgd29ya3RyZWUgXHUyMDE0IC5naXQgaXMgYSBmaWxlIHdpdGggXCJnaXRkaXI6IDxwYXRoPlwiXG5cdFx0XHRcdGNvbnN0IGdpdEZpbGUgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShnaXRVcmkpO1xuXHRcdFx0XHRjb25zdCBnaXREaXIgPSBnaXRGaWxlLnZhbHVlLnRvU3RyaW5nKCkudHJpbSgpLnJlcGxhY2UoL15naXRkaXI6XFxzKi8sICcnKTtcblx0XHRcdFx0Ly8gUmVzb2x2ZSByZWxhdGl2ZSBwYXRoc1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZEdpdERpciA9IGdpdERpci5zdGFydHNXaXRoKCcvJylcblx0XHRcdFx0XHQ/IGdpdERpclxuXHRcdFx0XHRcdDogYCR7cmVwb1BhdGh9LyR7Z2l0RGlyfWA7XG5cdFx0XHRcdC8vIFRoZSBjb25maWcgaXMgaW4gdGhlIGNvbW1vbiBkaXIgKHBhcmVudCBvZiB3b3JrdHJlZSBnaXQgZGlycylcblx0XHRcdFx0Ly8gZS5nLiwgZ2l0ZGlyIHBvaW50cyB0byAvcmVwby8uZ2l0L3dvcmt0cmVlcy9uYW1lLCBjb25maWcgaXMgYXQgL3JlcG8vLmdpdC9jb25maWdcblx0XHRcdFx0Y29uc3QgY29tbW9uRGlyID0gcmVzb2x2ZWRHaXREaXIucmVwbGFjZSgvXFwvd29ya3RyZWVzXFwvW14vXSskLywgJycpO1xuXHRcdFx0XHRjb25maWdVcmkgPSBVUkkuZmlsZShgJHtjb21tb25EaXJ9L2NvbmZpZ2ApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gLmdpdCBkb2Vzbid0IGV4aXN0XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShjb25maWdVcmkpO1xuXHRcdGNvbnN0IGNvbmZpZ1RleHQgPSBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCk7XG5cblx0XHQvLyBQYXJzZSByZW1vdGUgXCJvcmlnaW5cIiBVUkwgZnJvbSBnaXQgY29uZmlnXG5cdFx0Y29uc3QgcmVtb3RlTWF0Y2ggPSBjb25maWdUZXh0Lm1hdGNoKC9cXFtyZW1vdGVcXHMrXCJvcmlnaW5cIlxcXVteW10qdXJsXFxzKj1cXHMqKC4rKS9tKTtcblx0XHRpZiAocmVtb3RlTWF0Y2g/LlsxXSkge1xuXHRcdFx0cmV0dXJuIGV4dHJhY3ROd29Gcm9tUmVtb3RlVXJsKHJlbW90ZU1hdGNoWzFdLnRyaW0oKSk7XG5cdFx0fVxuXHR9IGNhdGNoIHtcblx0XHQvLyBGaWxlIG5vdCBmb3VuZCBvciBub3QgcmVhZGFibGVcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBBY3Rpb25Mb2NhdGlvbiB7XG5cdENoYXRXaWRnZXQgPSAnY2hhdFdpZGdldCcsXG5cdEVkaXRvciA9ICdlZGl0b3InXG59XG5cbmV4cG9ydCBjbGFzcyBDb250aW51ZUNoYXRJblNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNvbnRpbnVlQ2hhdEluU2Vzc2lvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnRpbnVlQ2hhdEluU2Vzc2lvbkFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbnRpbnVlQ2hhdEluU2Vzc2lvbicsIFwiQ29udGludWUgQ2hhdCBpbi4uLlwiKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjb250aW51ZUNoYXRJblNlc3Npb24nLCBcIkNvbnRpbnVlIENoYXQgaW4uLi5cIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0SW5Qcm9ncmVzcy5uZWdhdGUoKSxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnJlbW90ZUpvYkNyZWF0aW5nLm5lZ2F0ZSgpLFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaGFzQ2FuRGVsZWdhdGVQcm92aWRlcnMsXG5cdFx0XHQpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RXhlY3V0ZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDMuNCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NrZWRUb0NvZGluZ0FnZW50Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5oYXNDYW5EZWxlZ2F0ZVByb3ZpZGVycyxcblx0XHRcdFx0KSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGVudCxcblx0XHRcdFx0Z3JvdXA6ICdjb250aW51ZUluJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmtleSwgU2NoZW1hcy51bnRpdGxlZCksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKFJlc291cmNlQ29udGV4dEtleS5MYW5nSWQua2V5LCBQUk9NUFRfTEFOR1VBR0VfSUQpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhjaGF0RWRpdGluZ1dpZGdldEZpbGVTdGF0ZUNvbnRleHRLZXkua2V5LCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSxcblx0XHRcdFx0XHRjdHhIYXNFZGl0b3JNb2RpZmljYXRpb24ubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmhhc0NhbkRlbGVnYXRlUHJvdmlkZXJzLFxuXHRcdFx0XHQpLFxuXHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEhhbmRsZWQgYnkgYSBjdXN0b20gYWN0aW9uIGl0ZW1cblx0fVxufVxuZXhwb3J0IGNsYXNzIENoYXRDb250aW51ZUluU2Vzc2lvbkFjdGlvbkl0ZW0gZXh0ZW5kcyBBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBNZW51SXRlbUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvY2F0aW9uOiBBY3Rpb25Mb2NhdGlvbixcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVNDTVNlcnZpY2Ugc2NtU2VydmljZTogSVNDTVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihhY3Rpb24sIHtcblx0XHRcdGFjdGlvblByb3ZpZGVyOiBDaGF0Q29udGludWVJblNlc3Npb25BY3Rpb25JdGVtLmFjdGlvblByb3ZpZGVyKGNoYXRTZXNzaW9uc1NlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzY21TZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbG9jYXRpb24pLFxuXHRcdFx0YWN0aW9uQmFyQWN0aW9uczogQ2hhdENvbnRpbnVlSW5TZXNzaW9uQWN0aW9uSXRlbS5nZXRBY3Rpb25CYXJBY3Rpb25zKG9wZW5lclNlcnZpY2UpLFxuXHRcdFx0cmVwb3J0ZXI6IHsgaWQ6ICdDaGF0Q29udGludWVJblNlc3Npb24nLCBuYW1lOiAnQ2hhdENvbnRpbnVlSW5TZXNzaW9uJywgaW5jbHVkZU9wdGlvbnM6IHRydWUgfSxcblx0XHR9LCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHN0YXRpYyBnZXRBY3Rpb25CYXJBY3Rpb25zKG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlKSB7XG5cdFx0Y29uc3QgbGVhcm5Nb3JlVXJsID0gJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1hZ2VudC1oYW5kb2ZmJztcblx0XHRyZXR1cm4gW3tcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNvbnRpbnVlQ2hhdEluU2Vzc2lvbi5sZWFybk1vcmUnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0LmxlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjaGF0LmxlYXJuTW9yZScsIFwiTGVhcm4gTW9yZVwiKSxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UobGVhcm5Nb3JlVXJsKSk7XG5cdFx0XHR9XG5cdFx0fV07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBhY3Rpb25Qcm92aWRlcihjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgc2NtU2VydmljZTogSVNDTVNlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIGxvY2F0aW9uOiBBY3Rpb25Mb2NhdGlvbik6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblByb3ZpZGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25bXSA9IFtdO1xuXHRcdFx0XHRjb25zdCBjb250cmlidXRpb25zID0gY2hhdFNlc3Npb25zU2VydmljZS5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKTtcblx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRcdGxldCBoYXNHaXRSZXBvID0gZmFsc2U7XG5cdFx0XHRcdGlmIChmb2xkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHJlcG8gb2Ygc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdFx0XHRcdGlmIChyZXBvLnByb3ZpZGVyLnJvb3RVcmkgJiYgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlcG8ucHJvdmlkZXIucm9vdFVyaSkpIHtcblx0XHRcdFx0XHRcdFx0aGFzR2l0UmVwbyA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENvbnRpbnVlIGluIEJhY2tncm91bmRcblx0XHRcdFx0Y29uc3QgYmFja2dyb3VuZENvbnRyaWIgPSBjb250cmlidXRpb25zLmZpbmQoY29udHJpYiA9PiBjb250cmliLnR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kKTtcblx0XHRcdFx0aWYgKGJhY2tncm91bmRDb250cmliICYmIGJhY2tncm91bmRDb250cmliLmNhbkRlbGVnYXRlKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRoaXMudG9BY3Rpb24oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIGJhY2tncm91bmRDb250cmliLCBpbnN0YW50aWF0aW9uU2VydmljZSwgbG9jYXRpb24pKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENvbnRpbnVlIGluIENsb3VkIChkaXNhYmxlZCB3aGVuIG5vIGdpdCByZXBvc2l0b3J5KVxuXHRcdFx0XHRjb25zdCBjbG91ZENvbnRyaWIgPSBjb250cmlidXRpb25zLmZpbmQoY29udHJpYiA9PiBjb250cmliLnR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCk7XG5cdFx0XHRcdGlmIChjbG91ZENvbnRyaWIgJiYgY2xvdWRDb250cmliLmNhbkRlbGVnYXRlKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRoaXMudG9BY3Rpb24oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBjbG91ZENvbnRyaWIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBsb2NhdGlvbiwgaGFzR2l0UmVwbykpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ29udGludWUgaW4gYW55IGFnZW50IGhvc3Qgc2Vzc2lvbiAobG9jYWwgYGFnZW50LWhvc3QtKmAgb3IgcmVtb3RlXG5cdFx0XHRcdC8vIGByZW1vdGUtKmApLCBlLmcuIENvcGlsb3QgQ0xJIC8gQ29kZXggLyBDbGF1ZGUgYWdlbnQtaG9zdCBzZXNzaW9ucy5cblx0XHRcdFx0Zm9yIChjb25zdCBjb250cmliIG9mIGNvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdFx0XHRpZiAoY29udHJpYi5jYW5EZWxlZ2F0ZSAmJiBpc0FnZW50SG9zdFRhcmdldChjb250cmliLnR5cGUpKSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2godGhpcy50b0FjdGlvbihjb250cmliLnR5cGUsIGNvbnRyaWIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBsb2NhdGlvbikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE9mZmVyIGFjdGlvbnMgdG8gZW50ZXIgc2V0dXAgaWYgd2UgaGF2ZSBubyBjb250cmlidXRpb25zXG5cdFx0XHRcdGlmIChhY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCh0aGlzLnRvU2V0dXBBY3Rpb24oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSk7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRoaXMudG9TZXR1cEFjdGlvbihBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgdG9BY3Rpb24ocHJvdmlkZXI6IEFnZW50U2Vzc2lvblRhcmdldCwgY29udHJpYjogUmVzb2x2ZWRDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgbG9jYXRpb246IEFjdGlvbkxvY2F0aW9uLCBlbmFibGVkOiBib29sZWFuID0gdHJ1ZSk6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJOYW1lID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKHByb3ZpZGVyKTtcblx0XHQvLyBGb3IgZHluYW1pY2FsbHktcmVnaXN0ZXJlZCBhZ2VudCBob3N0IHByb3ZpZGVycywgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lXG5cdFx0Ly8gZmFsbHMgYmFjayB0byB0aGUgcmF3IHNlc3Npb24gdHlwZTsgcHJlZmVyIHRoZSBjb250cmlidXRpb24ncyBkaXNwbGF5IG5hbWUuXG5cdFx0Y29uc3QgbGFiZWwgPSBwcm92aWRlck5hbWUgPT09IHByb3ZpZGVyID8gKGNvbnRyaWIuZGlzcGxheU5hbWUgPz8gcHJvdmlkZXJOYW1lKSA6IHByb3ZpZGVyTmFtZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGNvbnRyaWIudHlwZSxcblx0XHRcdGVuYWJsZWQsXG5cdFx0XHRpY29uOiBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24ocHJvdmlkZXIpLFxuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdGRlc2NyaXB0aW9uOiBgQCR7Y29udHJpYi5uYW1lfWAsXG5cdFx0XHRsYWJlbCxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjb250aW51ZVNlc3Npb25JbicsIFwiQ29udGludWUgaW4gezB9XCIsIGxhYmVsKSxcblx0XHRcdGNhdGVnb3J5OiB7IGxhYmVsOiBsb2NhbGl6ZSgnY29udGludWVJbicsIFwiQ29udGludWUgSW5cIiksIG9yZGVyOiAwLCBzaG93SGVhZGVyOiB0cnVlIH0sXG5cdFx0XHRydW46ICgpID0+IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0aWYgKGxvY2F0aW9uID09PSBBY3Rpb25Mb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IENyZWF0ZVJlbW90ZUFnZW50Sm9iRnJvbUVkaXRvckFjdGlvbigpLnJ1bihhY2Nlc3NvciwgY29udHJpYik7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBDcmVhdGVSZW1vdGVBZ2VudEpvYkFjdGlvbigpLnJ1bihhY2Nlc3NvciwgY29udHJpYik7XG5cdFx0XHR9KVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyB0b1NldHVwQWN0aW9uKHByb3ZpZGVyOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogcHJvdmlkZXIsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0aWNvbjogZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKHByb3ZpZGVyKSxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRsYWJlbDogZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKHByb3ZpZGVyKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjb250aW51ZVNlc3Npb25JbicsIFwiQ29udGludWUgaW4gezB9XCIsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShwcm92aWRlcikpLFxuXHRcdFx0Y2F0ZWdvcnk6IHsgbGFiZWw6IGxvY2FsaXplKCdjb250aW51ZUluJywgXCJDb250aW51ZSBJblwiKSwgb3JkZXI6IDAsIHNob3dIZWFkZXI6IHRydWUgfSxcblx0XHRcdHJ1bjogKCkgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9BQ1RJT05fSUQpO1xuXHRcdFx0fSlcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckxhYmVsKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUgfCBudWxsIHtcblx0XHRpZiAodGhpcy5sb2NhdGlvbiA9PT0gQWN0aW9uTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHRjb25zdCB2aWV3ID0gaCgnc3Bhbi5hY3Rpb24td2lkZ2V0LWRlbGVnYXRlLWxhYmVsJywgW1xuXHRcdFx0XHRoKCdzcGFuJywgeyBjbGFzc05hbWU6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmZvcndhcmQpIH0pLFxuXHRcdFx0XHRoKCdzcGFuJywgW2xvY2FsaXplKCdjb250aW51ZUluRWxsaXBzaXMnLCBcIkNvbnRpbnVlIGluLi4uXCIpXSlcblx0XHRcdF0pO1xuXHRcdFx0ZWxlbWVudC5hcHBlbmRDaGlsZCh2aWV3LnJvb3QpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGljb24gPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoQ2hhdENvbnRleHRLZXlzLnJlbW90ZUpvYkNyZWF0aW5nKSA/IENvZGljb24uc3luYyA6IENvZGljb24uZm9yd2FyZDtcblx0XHRcdGVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG5cdFx0XHRyZXR1cm4gc3VwZXIucmVuZGVyTGFiZWwoZWxlbWVudCk7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IE5FV19DSEFUX1NFU1NJT05fQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTmV3U2Vzc2lvbkVkaXRvcic7XG5cbmNvbnN0IE1BWF9ERUxFR0FUSU9OX1RSQU5TQ1JJUFRfTEVOR1RIID0gMjBfMDAwO1xuXG4vKipcbiAqIE1pbmltYWwgc2hhcGUgb2YgYSBjaGF0IHJlcXVlc3QgbmVlZGVkIHRvIGJ1aWxkIGEgZGVsZWdhdGlvbiB0cmFuc2NyaXB0LlxuICogS2VwdCBzdHJ1Y3R1cmFsIHNvIHtAbGluayBidWlsZERlbGVnYXRpb25UcmFuc2NyaXB0fSBjYW4gYmUgdW5pdC10ZXN0ZWRcbiAqIHdpdGhvdXQgY29uc3RydWN0aW5nIGEgZnVsbCBjaGF0IG1vZGVsLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElEZWxlZ2F0aW9uVHJhbnNjcmlwdFJlcXVlc3Qge1xuXHRyZWFkb25seSBtZXNzYWdlOiB7IHJlYWRvbmx5IHRleHQ6IHN0cmluZyB9O1xuXHRyZWFkb25seSByZXNwb25zZT86IHsgcmVhZG9ubHkgcmVzcG9uc2U/OiB7IGdldE1hcmtkb3duKCk6IHN0cmluZyB9IH07XG59XG5cbi8qKlxuICogQnVpbGRzIGEgcGxhaW4tdGV4dCB0cmFuc2NyaXB0IG9mIGEgcHJpb3IgY29udmVyc2F0aW9uIGZvciBoYW5kaW5nIG9mZlxuICogKGRlbGVnYXRpbmcpIHRvIGFub3RoZXIgc2Vzc2lvbiB0eXBlLiBUaGUgdHJhbnNjcmlwdCBpcyB0cnVuY2F0ZWQgdG8gdGhlXG4gKiBtb3N0IHJlY2VudCB7QGxpbmsgbWF4TGVuZ3RofSBjaGFyYWN0ZXJzIHRvIGF2b2lkIGV4Y2VlZGluZyB0aGUgdGFyZ2V0XG4gKiBtb2RlbCdzIHRva2VuIGxpbWl0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRGVsZWdhdGlvblRyYW5zY3JpcHQocmVxdWVzdHM6IHJlYWRvbmx5IElEZWxlZ2F0aW9uVHJhbnNjcmlwdFJlcXVlc3RbXSwgbWF4TGVuZ3RoOiBudW1iZXIgPSBNQVhfREVMRUdBVElPTl9UUkFOU0NSSVBUX0xFTkdUSCk6IHN0cmluZyB7XG5cdGxldCB0cmFuc2NyaXB0ID0gcmVxdWVzdHMubWFwKHJlcSA9PiB7XG5cdFx0Y29uc3QgdXNlck1zZyA9IGBVc2VyOiAke3JlcS5tZXNzYWdlLnRleHR9YDtcblx0XHRjb25zdCByZXNwTXNnID0gcmVxLnJlc3BvbnNlPy5yZXNwb25zZSA/IGBBc3Npc3RhbnQ6ICR7cmVxLnJlc3BvbnNlLnJlc3BvbnNlLmdldE1hcmtkb3duKCl9YCA6ICcnO1xuXHRcdHJldHVybiByZXNwTXNnID8gYCR7dXNlck1zZ31cXG4ke3Jlc3BNc2d9YCA6IHVzZXJNc2c7XG5cdH0pLmpvaW4oJ1xcblxcbicpO1xuXHRpZiAodHJhbnNjcmlwdC5sZW5ndGggPiBtYXhMZW5ndGgpIHtcblx0XHR0cmFuc2NyaXB0ID0gdHJhbnNjcmlwdC5zdWJzdHJpbmcodHJhbnNjcmlwdC5sZW5ndGggLSBtYXhMZW5ndGgpO1xuXHR9XG5cdHJldHVybiB0cmFuc2NyaXB0O1xufVxuXG4vKipcbiAqIFdyYXBzIGEgY29udmVyc2F0aW9uIHRyYW5zY3JpcHQgYXMgYSBwYXN0ZSBhdHRhY2htZW50IHNvIGl0IGNhbiBiZSBwYXNzZWQgdmlhXG4gKiBgYXR0YWNoZWRDb250ZXh0YCB0byBhIGRlbGVnYXRlZCBzZXNzaW9uLCBrZWVwaW5nIHRoZSB1c2VyJ3MgcHJvbXB0IGNsZWFuLlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSB0cmFuc2NyaXB0IGlzIGVtcHR5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRGVsZWdhdGlvblRyYW5zY3JpcHRBdHRhY2htZW50KHRyYW5zY3JpcHQ6IHN0cmluZywgc291cmNlTmFtZTogc3RyaW5nKTogSUNoYXRSZXF1ZXN0UGFzdGVWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0aWYgKCF0cmFuc2NyaXB0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0cmFuc2NyaXB0TmFtZSA9IGxvY2FsaXplKCdjaGF0LmRlbGVnYXRpb24udHJhbnNjcmlwdE5hbWUnLCBcIlByZXZpb3VzIGNvbnZlcnNhdGlvblwiKTtcblx0Y29uc3QgdHJhbnNjcmlwdENvbnRlbnQgPSBsb2NhbGl6ZSgnY2hhdC5kZWxlZ2F0aW9uLnRyYW5zY3JpcHRDb250ZW50JywgXCJUaGUgZm9sbG93aW5nIGlzIHRoZSBjb252ZXJzYXRpb24gaGlzdG9yeSBmcm9tIGEgcHJldmlvdXMgezB9IHNlc3Npb24uIENvbnRpbnVlIHdvcmtpbmcgb24gaXQuXFxuXFxuezF9XCIsIHNvdXJjZU5hbWUsIHRyYW5zY3JpcHQpO1xuXHRyZXR1cm4gdG9QYXN0ZVZhcmlhYmxlRW50cnkodHJhbnNjcmlwdE5hbWUsIHRyYW5zY3JpcHRDb250ZW50LCB7XG5cdFx0aWQ6IGBjaGF0LWRlbGVnYXRpb24tdHJhbnNjcmlwdC0ke2dlbmVyYXRlVXVpZCgpfWAsXG5cdFx0aWNvbjogQ29kaWNvbi5oaXN0b3J5LFxuXHRcdGxhbmd1YWdlOiAnbWFya2Rvd24nLFxuXHRcdHBhc3RlZExpbmVzOiB0cmFuc2NyaXB0TmFtZSxcblx0XHRmaWxlTmFtZTogdHJhbnNjcmlwdE5hbWUsXG5cdH0pO1xufVxuXG5leHBvcnQgY2xhc3MgQ3JlYXRlUmVtb3RlQWdlbnRKb2JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHsgfVxuXG5cdHByaXZhdGUgb3BlblVudGl0bGVkRWRpdG9yKGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsIGNvbnRpbnVhdGlvblRhcmdldDogUmVzb2x2ZWRDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCkge1xuXHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGAke05FV19DSEFUX1NFU1NJT05fQUNUSU9OX0lEfS4ke2NvbnRpbnVhdGlvblRhcmdldC50eXBlfWApO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4dHJhY3RzIHRoZSBHaXRIdWIgXCJvd25lci9yZXBvXCIgTldPIGZyb20gdGhlIHNvdXJjZSBzZXNzaW9uIGJ5IGNoZWNraW5nXG5cdCAqIG11bHRpcGxlIGRhdGEgc291cmNlczogY2hhdCBtb2RlbCByZXBvRGF0YSwgc2Vzc2lvbiBtZXRhZGF0YSwgYW5kIHNlc3Npb24gb3B0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZXh0cmFjdFJlcG9Od29Gcm9tU2Vzc2lvbihhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSwgc2Vzc2lvblJlc291cmNlOiBVUkksIGNoYXRNb2RlbDogQ2hhdE1vZGVsKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyAxLiBUcnkgY2hhdCBtb2RlbCdzIHJlcG9EYXRhIChwb3B1bGF0ZWQgd2hlbiBsb2NhbCBnaXQgcmVwbyBleGlzdHMpXG5cdFx0Y29uc3QgcmVwb0RhdGEgPSBjaGF0TW9kZWwucmVwb0RhdGE7XG5cdFx0aWYgKHJlcG9EYXRhPy5yZW1vdGVVcmwpIHtcblx0XHRcdGNvbnN0IG53byA9IGV4dHJhY3ROd29Gcm9tUmVtb3RlVXJsKHJlcG9EYXRhLnJlbW90ZVVybCk7XG5cdFx0XHRpZiAobndvKSB7XG5cdFx0XHRcdHJldHVybiBud287XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gMi4gVHJ5IGFnZW50IHNlc3Npb24gbWV0YWRhdGEgKHBvcHVsYXRlZCBieSBzZXNzaW9uIHByb3ZpZGVycylcblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSBhZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGFnZW50U2Vzc2lvbj8ubWV0YWRhdGEpIHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYWdlbnRTZXNzaW9uLm1ldGFkYXRhO1xuXG5cdFx0XHQvLyBDbG91ZCBzZXNzaW9ucyBzZXQgbmFtZS9vd25lciBpbiBtZXRhZGF0YVxuXHRcdFx0Y29uc3Qgb3duZXIgPSBtZXRhZGF0YS5vd25lciBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBuYW1lID0gbWV0YWRhdGEubmFtZSBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAob3duZXIgJiYgbmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gYCR7b3duZXJ9LyR7bmFtZX1gO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBCYWNrZ3JvdW5kIHNlc3Npb25zIG1heSBzZXQgcmVwb3NpdG9yeU53byBkaXJlY3RseVxuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeU53byA9IG1ldGFkYXRhLnJlcG9zaXRvcnlOd28gYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHJlcG9zaXRvcnlOd28/LmluY2x1ZGVzKCcvJykpIHtcblx0XHRcdFx0cmV0dXJuIHJlcG9zaXRvcnlOd287XG5cdFx0XHR9XG5cblx0XHRcdC8vIEJhY2tncm91bmQgc2Vzc2lvbnMgbWF5IHNldCByZXBvc2l0b3J5VXJsXG5cdFx0XHRjb25zdCByZXBvc2l0b3J5VXJsID0gbWV0YWRhdGEucmVwb3NpdG9yeVVybCBhcyBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocmVwb3NpdG9yeVVybCkge1xuXHRcdFx0XHRjb25zdCBud28gPSBleHRyYWN0TndvRnJvbVJlbW90ZVVybChyZXBvc2l0b3J5VXJsKTtcblx0XHRcdFx0aWYgKG53bykge1xuXHRcdFx0XHRcdHJldHVybiBud287XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQmFja2dyb3VuZCBzZXNzaW9ucyBzZXQgd29ya2luZ0RpcmVjdG9yeVBhdGggXHUyMDE0IHJlc29sdmUgZ2l0IHJlbW90ZSBmcm9tIGl0XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyID0gKG1ldGFkYXRhLndvcmtpbmdEaXJlY3RvcnlQYXRoID8/IG1ldGFkYXRhLnJlcG9zaXRvcnlQYXRoID8/IG1ldGFkYXRhLndvcmt0cmVlUGF0aCkgYXMgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHdvcmtpbmdEaXIpIHtcblx0XHRcdFx0Y29uc3QgbndvID0gYXdhaXQgcmVzb2x2ZUdpdFJlbW90ZU53byh3b3JraW5nRGlyLCBmaWxlU2VydmljZSk7XG5cdFx0XHRcdGlmIChud28pIHtcblx0XHRcdFx0XHRyZXR1cm4gbndvO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gMy4gVHJ5IHNlc3Npb24gb3B0aW9ucyAocmVwb3NpdG9yeSBwaWNrZXIgc2VsZWN0aW9uKVxuXHRcdC8vIENsb3VkIHNlc3Npb25zIHVzZSAncmVwb3NpdG9yaWVzJywgc2Vzc2lvbnMgd2luZG93IHVzZXMgJ3JlcG9zaXRvcnknXG5cdFx0Zm9yIChjb25zdCBvcHRpb25JZCBvZiBbJ3JlcG9zaXRvcmllcycsICdyZXBvc2l0b3J5J10pIHtcblx0XHRcdGNvbnN0IHJlcG9PcHRpb24gPSBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24oc2Vzc2lvblJlc291cmNlLCBvcHRpb25JZCk7XG5cdFx0XHRpZiAocmVwb09wdGlvbikge1xuXHRcdFx0XHRjb25zdCBvcHRpb25WYWx1ZSA9IHR5cGVvZiByZXBvT3B0aW9uID09PSAnc3RyaW5nJyA/IHJlcG9PcHRpb24gOiAocmVwb09wdGlvbiBhcyB7IGlkOiBzdHJpbmcgfSkuaWQ7XG5cdFx0XHRcdGlmIChvcHRpb25WYWx1ZSkge1xuXHRcdFx0XHRcdC8vIENoZWNrIGlmIGl0J3MgYWxyZWFkeSBhIFwib3duZXIvcmVwb1wiIE5XTyAoZXhhY3RseSB0d28gc2VnbWVudHMpXG5cdFx0XHRcdFx0Y29uc3Qgc2VnbWVudHMgPSBvcHRpb25WYWx1ZS5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKTtcblx0XHRcdFx0XHRpZiAoc2VnbWVudHMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gb3B0aW9uVmFsdWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFRyeSBleHRyYWN0aW5nIE5XTyBmcm9tIGEgVVJMXG5cdFx0XHRcdFx0Y29uc3QgbndvID0gZXh0cmFjdE53b0Zyb21SZW1vdGVVcmwob3B0aW9uVmFsdWUpO1xuXHRcdFx0XHRcdGlmIChud28pIHtcblx0XHRcdFx0XHRcdHJldHVybiBud287XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFRyeSBwYXJzaW5nIGFzIFVSSSAoZS5nLiBnaXRodWItcmVtb3RlLWZpbGU6Ly9naXRodWIvb3duZXIvcmVwby8uLi4pXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShvcHRpb25WYWx1ZSk7XG5cdFx0XHRcdFx0XHRpZiAodXJpLmF1dGhvcml0eSA9PT0gJ2dpdGh1YicpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcGFydHMgPSB1cmkucGF0aC5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKTtcblx0XHRcdFx0XHRcdFx0aWYgKHBhcnRzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGAke3BhcnRzWzBdfS8ke3BhcnRzWzFdfWA7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdFx0XHQvLyBMb2NhbCBmaWxlc3lzdGVtIHBhdGggXHUyMDE0IHJlc29sdmUgZ2l0IHJlbW90ZVxuXHRcdFx0XHRcdGlmIChpc0Fic29sdXRlKG9wdGlvblZhbHVlKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbndvRnJvbUdpdCA9IGF3YWl0IHJlc29sdmVHaXRSZW1vdGVOd28ob3B0aW9uVmFsdWUsIGZpbGVTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdGlmIChud29Gcm9tR2l0KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBud29Gcm9tR2l0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRpbnVhdGlvblRhcmdldDogUmVzb2x2ZWRDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCwgX3dpZGdldD86IElDaGF0V2lkZ2V0KSB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0QWdlbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0QWdlbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGFnZW50U2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBZ2VudFNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVtb3RlSm9iQ3JlYXRpbmdLZXkgPSBDaGF0Q29udGV4dEtleXMucmVtb3RlSm9iQ3JlYXRpbmcuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZW1vdGVKb2JDcmVhdGluZ0tleS5zZXQodHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IF93aWRnZXQgPz8gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRcdGlmICghd2lkZ2V0IHx8ICF3aWRnZXQudmlld01vZGVsKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm9wZW5VbnRpdGxlZEVkaXRvcihjb21tYW5kU2VydmljZSwgY29udGludWF0aW9uVGFyZ2V0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdG9kb0Bjb25ub3I0MzEyOiByZW1vdmUgJ2FzJyBjYXN0XG5cdFx0XHRjb25zdCBjaGF0TW9kZWwgPSB3aWRnZXQudmlld01vZGVsLm1vZGVsIGFzIENoYXRNb2RlbDtcblx0XHRcdGlmICghY2hhdE1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gd2lkZ2V0LnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBjaGF0UmVxdWVzdHMgPSBjaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRcdGxldCB1c2VyUHJvbXB0ID0gd2lkZ2V0LmdldElucHV0KCk7XG5cdFx0XHRpZiAoIXVzZXJQcm9tcHQpIHtcblx0XHRcdFx0aWYgKCFjaGF0UmVxdWVzdHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub3BlblVudGl0bGVkRWRpdG9yKGNvbW1hbmRTZXJ2aWNlLCBjb250aW51YXRpb25UYXJnZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVzZXJQcm9tcHQgPSAnaW1wbGVtZW50IHRoaXMuJztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYXR0YWNoZWRDb250ZXh0ID0gd2lkZ2V0LmlucHV0LmdldEF0dGFjaGVkQW5kSW1wbGljaXRDb250ZXh0KCk7XG5cdFx0XHR3aWRnZXQuaW5wdXQuYWNjZXB0SW5wdXQodHJ1ZSk7XG5cblx0XHRcdC8vIEZvciBpbmxpbmUgZWRpdG9yIG1vZGUsIGFkZCBzZWxlY3Rpb24gb3IgY3Vyc29yIGluZm9ybWF0aW9uXG5cdFx0XHRpZiAod2lkZ2V0LmxvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpIHtcblx0XHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRcdFx0aWYgKGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gYWN0aXZlRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRcdFx0bGV0IGFjdGl2ZUVkaXRvclVyaTogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChtb2RlbCAmJiBpc0lUZXh0TW9kZWwobW9kZWwpKSB7XG5cdFx0XHRcdFx0XHRhY3RpdmVFZGl0b3JVcmkgPSBtb2RlbC51cmkgYXMgVVJJO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhY3RpdmVFZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKGFjdGl2ZUVkaXRvclVyaSAmJiBzZWxlY3Rpb24pIHtcblx0XHRcdFx0XHRcdGF0dGFjaGVkQ29udGV4dC5hZGQoe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnZmlsZScsXG5cdFx0XHRcdFx0XHRcdGlkOiAndnNjb2RlLmltcGxpY2l0LnNlbGVjdGlvbicsXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGJhc2VuYW1lKGFjdGl2ZUVkaXRvclVyaSksXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dXJpOiBhY3RpdmVFZGl0b3JVcmksXG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IHNlbGVjdGlvblxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRpbnVhdGlvblRhcmdldFR5cGUgPSBjb250aW51YXRpb25UYXJnZXQudHlwZTtcblxuXHRcdFx0Ly8gV2hlbiBzb3VyY2UgYW5kIHRhcmdldCBzZXNzaW9uIHR5cGVzIGRpZmZlciwgb3BlbiBhIG5ldyBzZXNzaW9uIG9mXG5cdFx0XHQvLyB0aGUgdGFyZ2V0IHR5cGUgYW5kIGhhbmQgb2ZmIHRoZSBwcmlvciBjb252ZXJzYXRpb24gYXMgYW4gYXR0YWNobWVudFxuXHRcdFx0Ly8gKGhpc3RvcnktaW1wb3J0KSBpbnN0ZWFkIG9mIHNlbmRpbmcgdG8gdGhlIGN1cnJlbnQgKGluY29tcGF0aWJsZSlcblx0XHRcdC8vIHNlc3Npb24gcmVzb3VyY2UuIFRoaXMgaGFwcGVucyBmb3IgYW55IGNyb3NzLXR5cGUgZGVsZWdhdGlvbiBpbiB0aGVcblx0XHRcdC8vIHNlc3Npb25zIHdpbmRvdywgYW5kIHdoZW5ldmVyIGVpdGhlciB0aGUgc291cmNlIG9yIHRoZSB0YXJnZXQgaXMgYW5cblx0XHRcdC8vIGFnZW50IGhvc3Qgc2Vzc2lvbiAoZS5nLiBDb3BpbG90IENMSSAvIENvZGV4IC8gQ2xhdWRlIGFnZW50IGhvc3QpLFxuXHRcdFx0Ly8gc28gZGVsZWdhdGlvbiB3b3JrcyBmcm9tIGFueXRoaW5nIHRvIGFueSBhZ2VudCBob3N0IHNlc3Npb24gYW5kIGZyb21cblx0XHRcdC8vIGFueSBhZ2VudCBob3N0IHNlc3Npb24gdG8gYW55IHRhcmdldC5cblx0XHRcdGNvbnN0IGlzU2Vzc2lvbnNXaW5kb3cgPSBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHQvLyBSZXNvbHZlIGEgc291cmNlIHNlc3Npb24gdHlwZSB0aGF0IGFsc28gY292ZXJzIGR5bmFtaWNhbGx5LXJlZ2lzdGVyZWRcblx0XHRcdC8vIGFnZW50IGhvc3QgcHJvdmlkZXJzIChlLmcuIGBhZ2VudC1ob3N0LWNvZGV4YCksIHdoaWNoIGFyZSBub3QgcGFydCBvZlxuXHRcdFx0Ly8gdGhlIEFnZW50U2Vzc2lvblByb3ZpZGVycyBlbnVtLlxuXHRcdFx0Y29uc3Qgc291cmNlU2Vzc2lvblR5cGUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihzZXNzaW9uUmVzb3VyY2UpID8/IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgaGFuZG9mZlRvTmV3U2Vzc2lvbiA9IGlzU2Vzc2lvbnNXaW5kb3cgfHwgaXNBZ2VudEhvc3RUYXJnZXQoY29udGludWF0aW9uVGFyZ2V0VHlwZSkgfHwgKCEhc291cmNlU2Vzc2lvblR5cGUgJiYgaXNBZ2VudEhvc3RUYXJnZXQoc291cmNlU2Vzc2lvblR5cGUpKTtcblx0XHRcdGlmIChoYW5kb2ZmVG9OZXdTZXNzaW9uICYmIHNvdXJjZVNlc3Npb25UeXBlICYmIHNvdXJjZVNlc3Npb25UeXBlICE9PSBjb250aW51YXRpb25UYXJnZXRUeXBlKSB7XG5cdFx0XHRcdGNvbnN0IGlzU2lkZWJhciA9IGlzSUNoYXRWaWV3Vmlld0NvbnRleHQod2lkZ2V0LnZpZXdDb250ZXh0KTtcblxuXHRcdFx0XHQvLyBCdWlsZCB0aGUgcHJpb3IgY29udmVyc2F0aW9uIHRyYW5zY3JpcHQgc28gY29udGV4dCBpcyBwcmVzZXJ2ZWQuXG5cdFx0XHRcdC8vIEFnZW50IGhvc3QgdGFyZ2V0cyBjb25zdW1lIGl0IGFzIGFuIGF0dGFjaG1lbnQgKGtlZXBpbmcgdGhlIHVzZXInc1xuXHRcdFx0XHQvLyBwcm9tcHQgY2xlYW4pOyBvdGhlciB0YXJnZXRzIChlLmcuIHRoZSBDbG91ZCBjb2RpbmcgYWdlbnQpIGRvbid0XG5cdFx0XHRcdC8vIHByb2Nlc3MgcGFzdGUgYXR0YWNobWVudHMsIHNvIGZvciB0aG9zZSB3ZSBpbmxpbmUgaXQgaW50byB0aGUgcHJvbXB0LlxuXHRcdFx0XHRjb25zdCB0cmFuc2NyaXB0ID0gYnVpbGREZWxlZ2F0aW9uVHJhbnNjcmlwdChjaGF0UmVxdWVzdHMpO1xuXHRcdFx0XHRjb25zdCBzb3VyY2VDb250cmlidXRpb24gPSBjaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucygpLmZpbmQoYyA9PiBjLnR5cGUgPT09IHNvdXJjZVNlc3Npb25UeXBlIHx8IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKGMudHlwZSkgPT09IHNvdXJjZVNlc3Npb25UeXBlKTtcblx0XHRcdFx0Y29uc3Qgc291cmNlTmFtZSA9IHNvdXJjZUNvbnRyaWJ1dGlvbj8uZGlzcGxheU5hbWUgPz8gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKHNvdXJjZVNlc3Npb25UeXBlKTtcblx0XHRcdFx0Y29uc3QgY29udGludWF0aW9uQ29udGV4dCA9IGF0dGFjaGVkQ29udGV4dC5hc0FycmF5KCk7XG5cdFx0XHRcdGxldCBoYW5kb2ZmUHJvbXB0ID0gdXNlclByb21wdDtcblx0XHRcdFx0Ly8gQ29udGludWluZyBhIGxvY2FsIGNoYXQgaW50byBDb3BpbG90IENMSSAobWFpbiB3aW5kb3cpIGltcG9ydHMgdGhlXG5cdFx0XHRcdC8vIHByaW9yIGNvbnZlcnNhdGlvbiBhcyByZWFsLCBlZGl0YWJsZSB0dXJucyBzZWVkZWQgaW50byB0aGUgbmV3XG5cdFx0XHRcdC8vIHNlc3Npb24sIGluc3RlYWQgb2YgaGFuZGluZyBpdCBvdmVyIGFzIGEgcmVhZC1vbmx5IHRyYW5zY3JpcHRcblx0XHRcdFx0Ly8gYXR0YWNobWVudC4gVGhlIHR1cm5zIGFyZSB0aHJlYWRlZCB0aHJvdWdoIHRoZSBub3JtYWxcblx0XHRcdFx0Ly8gYG9wZW5DaGF0U2Vzc2lvbmAgZmxvdyBzbyB0aGUgc2Vzc2lvbiBsaWZlY3ljbGUgKG1vZGVsIHBpY2tlcixcblx0XHRcdFx0Ly8gY29uZmlnIGNoaXBzLCBldGMuKSBpcyB1bmNoYW5nZWQuXG5cdFx0XHRcdGNvbnN0IGltcG9ydENvbnZlcnNhdGlvblR1cm5zID0gKGNvbnRpbnVhdGlvblRhcmdldFR5cGUgPT09IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QgJiYgIWlzU2Vzc2lvbnNXaW5kb3cpXG5cdFx0XHRcdFx0PyBpbXBvcnRlZFR1cm5zRnJvbUNoYXRNb2RlbChjaGF0TW9kZWwpXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIENhcnJ5IHRoZSBzb3VyY2Ugc2Vzc2lvbidzIHNlbGVjdGVkIG1vZGVsIHNvIHRoZSBpbXBvcnRlZCBzZXNzaW9uXG5cdFx0XHRcdC8vIHJlc3VtZXMgb24gdGhlIHNhbWUgbW9kZWwgcmF0aGVyIHRoYW4gdGhlIGhvc3QgZGVmYXVsdC4gVGhlIHJhd1xuXHRcdFx0XHQvLyBtb2RlbCBpZCAoYG1ldGFkYXRhLmlkYCkgbWF0Y2hlcyB0aGUgQ29waWxvdCBjYXRhbG9nIHNoYXJlZCBieSB0aGVcblx0XHRcdFx0Ly8gbG9jYWwgbW9kZWxzIGFuZCBDb3BpbG90IENMSS5cblx0XHRcdFx0Y29uc3QgaW1wb3J0Q29udmVyc2F0aW9uTW9kZWxJZCA9IGltcG9ydENvbnZlcnNhdGlvblR1cm5zID8gd2lkZ2V0LmlucHV0LnNlbGVjdGVkTGFuZ3VhZ2VNb2RlbC5nZXQoKT8ubWV0YWRhdGEuaWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGltcG9ydENvbnZlcnNhdGlvbk1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCA9IGltcG9ydENvbnZlcnNhdGlvbk1vZGVsSWQgPyB7IGlkOiBpbXBvcnRDb252ZXJzYXRpb25Nb2RlbElkIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0cmFuc2NyaXB0ICYmICFpbXBvcnRDb252ZXJzYXRpb25UdXJucykge1xuXHRcdFx0XHRcdGlmIChpc0FnZW50SG9zdFRhcmdldChjb250aW51YXRpb25UYXJnZXRUeXBlKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdHJhbnNjcmlwdEF0dGFjaG1lbnQgPSBjcmVhdGVEZWxlZ2F0aW9uVHJhbnNjcmlwdEF0dGFjaG1lbnQodHJhbnNjcmlwdCwgc291cmNlTmFtZSk7XG5cdFx0XHRcdFx0XHRpZiAodHJhbnNjcmlwdEF0dGFjaG1lbnQpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWF0aW9uQ29udGV4dC51bnNoaWZ0KHRyYW5zY3JpcHRBdHRhY2htZW50KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aGFuZG9mZlByb21wdCA9IGxvY2FsaXplKCdjaGF0LmRlbGVnYXRpb24uaW5saW5lUHJvbXB0JywgXCJUaGUgZm9sbG93aW5nIGlzIHRoZSBjb252ZXJzYXRpb24gaGlzdG9yeSBmcm9tIGEgcHJldmlvdXMgezB9IHNlc3Npb24uIENvbnRpbnVlIHdvcmtpbmcgb24gaXQuXFxuXFxuezF9XFxuXFxuVXNlcjogezJ9XCIsIHNvdXJjZU5hbWUsIHRyYW5zY3JpcHQsIHVzZXJQcm9tcHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEV4dHJhY3QgcmVwb3NpdG9yeSBpbmZvIGZyb20gdGhlIHNvdXJjZSBzZXNzaW9uIHRvIHBhc3MgdG8gdGhlIHRhcmdldCBzZXNzaW9uXG5cdFx0XHRcdGNvbnN0IGluaXRpYWxTZXNzaW9uT3B0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRcdGNvbnN0IHJlcG9Od28gPSBhd2FpdCB0aGlzLmV4dHJhY3RSZXBvTndvRnJvbVNlc3Npb24oYWdlbnRTZXNzaW9uc1NlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIGZpbGVTZXJ2aWNlLCBzZXNzaW9uUmVzb3VyY2UsIGNoYXRNb2RlbCk7XG5cdFx0XHRcdGlmIChyZXBvTndvKSB7XG5cdFx0XHRcdFx0aW5pdGlhbFNlc3Npb25PcHRpb25zLnNldCgncmVwb3NpdG9yaWVzJywgcmVwb053byk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBZ2VudCBob3N0IHRhcmdldHMgYXJlIGRlbGVnYXRlZCBnZW5lcmljYWxseSAobm8gcGVyLXNlc3Npb24tdHlwZVxuXHRcdFx0XHQvLyBjb21tYW5kKS4gSW4gdGhlIEFnZW50cyB3aW5kb3cgYSBzaW5nbGUgcmVnaXN0ZXJlZCBjb21tYW5kIGNyZWF0ZXNcblx0XHRcdFx0Ly8gdGhlIHRhcmdldCBzZXNzaW9uIHRocm91Z2ggdGhlIHNlc3Npb24gbWFuYWdlbWVudCBzZXJ2aWNlOyBpbiB0aGVcblx0XHRcdFx0Ly8gbWFpbiB3aW5kb3cgd2Ugb3BlbiB0aGUgc2Vzc2lvbiBkaXJlY3RseS4gQm90aCBwYXRocyBjYXJyeSB0aGVcblx0XHRcdFx0Ly8gdHJhbnNjcmlwdCBhcyBhbiBhdHRhY2htZW50LlxuXHRcdFx0XHRpZiAoaXNBZ2VudEhvc3RUYXJnZXQoY29udGludWF0aW9uVGFyZ2V0VHlwZSkpIHtcblx0XHRcdFx0XHRpZiAoaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVsZWdhdGlvblJlcXVlc3Q6IElBZ2VudEhvc3REZWxlZ2F0aW9uUmVxdWVzdCA9IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogY29udGludWF0aW9uVGFyZ2V0VHlwZSxcblx0XHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6IGNvbnRpbnVhdGlvblRhcmdldC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdFx0cHJvbXB0OiBoYW5kb2ZmUHJvbXB0LFxuXHRcdFx0XHRcdFx0XHRhdHRhY2hlZENvbnRleHQ6IGNvbnRpbnVhdGlvbkNvbnRleHQsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9ERUxFR0FURV9UT19BR0VOVF9IT1NUX1NFU1NJT05fQ09NTUFORF9JRCwgZGVsZWdhdGlvblJlcXVlc3QpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihpbm5lckFjY2Vzc29yID0+IG9wZW5DaGF0U2Vzc2lvbihcblx0XHRcdFx0XHRcdFx0aW5uZXJBY2Nlc3Nvcixcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IGNvbnRpbnVhdGlvblRhcmdldFR5cGUsXG5cdFx0XHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6IGNvbnRpbnVhdGlvblRhcmdldC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogaXNTaWRlYmFyID8gQ2hhdFNlc3Npb25Qb3NpdGlvbi5TaWRlYmFyIDogQ2hhdFNlc3Npb25Qb3NpdGlvbi5FZGl0b3IsXG5cdFx0XHRcdFx0XHRcdFx0Ly8gUmVwbGFjZSB0aGUgc291cmNlIGNoYXQgZWRpdG9yIGluIHBsYWNlIHNvIHN3aXRjaGluZyBoYXJuZXNzXG5cdFx0XHRcdFx0XHRcdFx0Ly8gZmVlbHMgbGlrZSB0aGUgc2FtZSBjaGF0IGNvbnRpbnVlcyByYXRoZXIgdGhhbiBvcGVuaW5nIGEgbmV3XG5cdFx0XHRcdFx0XHRcdFx0Ly8gdGFiLiBUaGUgc291cmNlIChsb2NhbCkgc2Vzc2lvbiBzdGF5cyBpbiBjaGF0IGhpc3RvcnkgYW5kIGlzXG5cdFx0XHRcdFx0XHRcdFx0Ly8gcmVjb3ZlcmFibGUuIFRoZSBzaWRlYmFyIHBhdGggYWxyZWFkeSBzd2FwcyBpbiBwbGFjZSB2aWFcblx0XHRcdFx0XHRcdFx0XHQvLyBgbG9hZFNlc3Npb25gLCBzbyBpdCBuZWVkcyBubyByZXBsYWNlbWVudC4gUGFzcyB0aGUgc291cmNlXG5cdFx0XHRcdFx0XHRcdFx0Ly8gcmVzb3VyY2UgKG5vdCBhIGJhcmUgZmxhZykgc28gdGhlIGNvcnJlY3QgZWRpdG9yIGlzIHJlc29sdmVkXG5cdFx0XHRcdFx0XHRcdFx0Ly8gYXQgcmVwbGFjZSB0aW1lIGV2ZW4gaWYgdGhlIGFjdGl2ZSBlZGl0b3IgY2hhbmdlZCBtZWFud2hpbGUuXG5cdFx0XHRcdFx0XHRcdFx0cmVwbGFjZUVkaXRvckZvclJlc291cmNlOiBpc1NpZGViYXIgPyB1bmRlZmluZWQgOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRwcm9tcHQ6IGhhbmRvZmZQcm9tcHQsXG5cdFx0XHRcdFx0XHRcdFx0YXR0YWNoZWRDb250ZXh0OiBjb250aW51YXRpb25Db250ZXh0LFxuXHRcdFx0XHRcdFx0XHRcdGluaXRpYWxTZXNzaW9uT3B0aW9uczogaW5pdGlhbFNlc3Npb25PcHRpb25zLnNpemUgPiAwID8gaW5pdGlhbFNlc3Npb25PcHRpb25zIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdGltcG9ydENvbnZlcnNhdGlvbjogaW1wb3J0Q29udmVyc2F0aW9uVHVybnMgPyB7IHR1cm5zOiBpbXBvcnRDb252ZXJzYXRpb25UdXJucywgbW9kZWw6IGltcG9ydENvbnZlcnNhdGlvbk1vZGVsIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBOb24tYWdlbnQtaG9zdCB0YXJnZXRzIChlLmcuIENsb3VkIC8gQmFja2dyb3VuZCkgY29udGludWUgdG8gdXNlXG5cdFx0XHRcdC8vIHRoZWlyIHBlci1zZXNzaW9uLXR5cGUgbmV3LXNlc3Npb24gY29tbWFuZC5cblx0XHRcdFx0Y29uc3QgYWN0aW9uSWQgPSBpc1NpZGViYXJcblx0XHRcdFx0XHQ/IGB3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk5ld1Nlc3Npb25TaWRlYmFyLiR7Y29udGludWF0aW9uVGFyZ2V0VHlwZX1gXG5cdFx0XHRcdFx0OiBgJHtORVdfQ0hBVF9TRVNTSU9OX0FDVElPTl9JRH0uJHtjb250aW51YXRpb25UYXJnZXRUeXBlfWA7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGFjdGlvbklkLCB7XG5cdFx0XHRcdFx0cHJvbXB0OiBoYW5kb2ZmUHJvbXB0LFxuXHRcdFx0XHRcdGF0dGFjaGVkQ29udGV4dDogY29udGludWF0aW9uQ29udGV4dCxcblx0XHRcdFx0XHRpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IGluaXRpYWxTZXNzaW9uT3B0aW9ucy5zaXplID4gMCA/IGluaXRpYWxTZXNzaW9uT3B0aW9ucyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGVmYXVsdEFnZW50ID0gY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0XHRjb25zdCByZXF1ZXN0UGFyc2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpO1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IHsgc2Vzc2lvblR5cGU6IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpIH07XG5cdFx0XHQvLyBBZGQgdGhlIHJlcXVlc3QgdG8gdGhlIG1vZGVsIGZpcnN0XG5cdFx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gcmVxdWVzdFBhcnNlci5wYXJzZUNoYXRSZXF1ZXN0V2l0aFJlZmVyZW5jZXMoZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh3aWRnZXQpLCBnZXRTZWxlY3RlZFRvb2xBbmRUb29sU2V0c0ZvcldpZGdldCh3aWRnZXQpLCB1c2VyUHJvbXB0LCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IGFkZGVkUmVxdWVzdCA9IGNoYXRNb2RlbC5hZGRSZXF1ZXN0KFxuXHRcdFx0XHRwYXJzZWRSZXF1ZXN0LFxuXHRcdFx0XHR7IHZhcmlhYmxlczogYXR0YWNoZWRDb250ZXh0LmFzQXJyYXkoKSB9LFxuXHRcdFx0XHQwLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdGRlZmF1bHRBZ2VudFxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgY2hhdFNlcnZpY2UucmVtb3ZlUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIGFkZGVkUmVxdWVzdC5pZCk7XG5cdFx0XHRjb25zdCBzZW5kUmVzdWx0ID0gYXdhaXQgY2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCB1c2VyUHJvbXB0LCB7XG5cdFx0XHRcdGFnZW50SWRTaWxlbnQ6IGNvbnRpbnVhdGlvblRhcmdldFR5cGUsXG5cdFx0XHRcdGF0dGFjaGVkQ29udGV4dDogYXR0YWNoZWRDb250ZXh0LmFzQXJyYXkoKSxcblx0XHRcdFx0Li4ud2lkZ2V0LmdldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9ucygpLFxuXHRcdFx0XHQuLi53aWRnZXQuZ2V0TW9kZVJlcXVlc3RPcHRpb25zKClcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoQ2hhdFNlbmRSZXN1bHQuaXNTZW50KHNlbmRSZXN1bHQpKSB7XG5cdFx0XHRcdGF3YWl0IHdpZGdldC5oYW5kbGVEZWxlZ2F0aW9uRXhpdElmTmVlZGVkKGRlZmF1bHRBZ2VudCwgc2VuZFJlc3VsdC5kYXRhLmFnZW50KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdbRGVsZWdhdGlvbl0gRXJyb3IgY3JlYXRpbmcgcmVtb3RlIGNvZGluZyBhZ2VudCBqb2InLCBlKTtcblx0XHRcdHRocm93IGU7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlbW90ZUpvYkNyZWF0aW5nS2V5LnNldChmYWxzZSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIENyZWF0ZVJlbW90ZUFnZW50Sm9iRnJvbUVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkgeyB9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250aW51YXRpb25UYXJnZXQ6IFJlc29sdmVkQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQpIHtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbCA9IGFjdGl2ZUVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFtb2RlbCB8fCAhaXNJVGV4dE1vZGVsKG1vZGVsKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cmkgPSBtb2RlbC51cmk7XG5cdFx0XHRjb25zdCBhdHRhY2hlZENvbnRleHQgPSBbdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeSh1cmksIFByb21wdEZpbGVWYXJpYWJsZUtpbmQuUHJvbXB0RmlsZSwgdW5kZWZpbmVkLCBmYWxzZSwgW10pXTtcblx0XHRcdGNvbnN0IHByb21wdCA9IGBGb2xsb3cgaW5zdHJ1Y3Rpb25zIGluIFske2Jhc2VuYW1lKHVyaSl9XSgke3VyaS50b1N0cmluZygpfSkuYDtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGAke05FV19DSEFUX1NFU1NJT05fQUNUSU9OX0lEfS4ke2NvbnRpbnVhdGlvblRhcmdldC50eXBlfWAsIHsgcHJvbXB0LCBhdHRhY2hlZENvbnRleHQgfSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgY3JlYXRpbmcgcmVtb3RlIGFnZW50IGpvYiBmcm9tIGVkaXRvcicsIGUpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRpbnVlQ2hhdEluU2Vzc2lvbkFjdGlvblJlbmRlcmluZyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnY2hhdC5jb250aW51ZUNoYXRJblNlc3Npb25BY3Rpb25SZW5kZXJpbmcnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51SWQuRWRpdG9yQ29udGVudCwgQ29udGludWVDaGF0SW5TZXNzaW9uQWN0aW9uLklELCAoYWN0aW9uLCBvcHRpb25zLCBpbnN0YW50aWF0aW9uU2VydmljZTIpID0+IHtcblx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRDb250aW51ZUluU2Vzc2lvbkFjdGlvbkl0ZW0sIGFjdGlvbiwgQWN0aW9uTG9jYXRpb24uRWRpdG9yKTtcblx0XHR9KTtcblx0XHRtYXJrQXNTaW5nbGV0b24oZGlzcG9zYWJsZSk7XG5cdH1cbn1cbiJdLAog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QU8sVUFBVSxHQUFHO0FBQ3RDLGNBQU0sT0FBTyw2QkFBNkIsY0FBYyxXQUFXLEtBQUssS0FBSztBQUFBLE1BQzlFO0FBQUEsSUFDRCxTQUFTLEdBQUc7QUFDWCxjQUFRLE1BQU0sdURBQXVELENBQUM7QUFDdEUsWUFBTTtBQUFBLElBQ1AsVUFBRTtBQUNELDJCQUFxQixJQUFJLEtBQUs7QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0scUNBQXFDO0FBQUEsRUFDMUMsY0FBYztBQUFBLEVBQUU7QUFBQSxFQUVoQixNQUFNLElBQUksVUFBNEIsb0JBQXdEO0FBRTdGLFFBQUk7QUFDSCxZQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxZQUFNLGVBQWUsY0FBYztBQUNuQyxZQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUVuRCxVQUFJLENBQUMsY0FBYztBQUNsQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFFBQVEsYUFBYSxTQUFTO0FBQ3BDLFVBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxLQUFLLEdBQUc7QUFDbkM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxNQUFNLE1BQU07QUFDbEIsWUFBTSxrQkFBa0IsQ0FBQywwQkFBMEIsS0FBSyx1QkFBdUIsWUFBWSxRQUFXLE9BQU8sQ0FBQyxDQUFDLENBQUM7QUFDaEgsWUFBTSxTQUFTLDJCQUEyQixTQUFTLEdBQUcsQ0FBQyxLQUFLLElBQUksU0FBUyxDQUFDO0FBQzFFLFlBQU0sZUFBZSxlQUFlLEdBQUcsMEJBQTBCLElBQUksbUJBQW1CLElBQUksSUFBSSxFQUFFLFFBQVEsZ0JBQWdCLENBQUM7QUFBQSxJQUM1SCxTQUFTLEdBQUc7QUFDWCxjQUFRLE1BQU0sK0NBQStDLENBQUM7QUFDOUQsWUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxJQUFNLHVDQUFOLGNBQW1ELFdBQTZDO0FBQUEsRUFJdEcsWUFDeUIsdUJBQ0Qsc0JBQ3RCO0FBQ0QsVUFBTTtBQUNOLFVBQU0sYUFBYSxzQkFBc0IsU0FBUyxPQUFPLGVBQWUsNEJBQTRCLElBQUksQ0FBQyxRQUFRLFNBQVMsMEJBQTBCO0FBQ25KLFVBQUksRUFBRSxrQkFBa0IsaUJBQWlCO0FBQ3hDLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTyxxQkFBcUIsZUFBZSxpQ0FBaUMsUUFBUSxxQkFBcUI7QUFBQSxJQUMxRyxDQUFDO0FBQ0Qsb0JBQWdCLFVBQVU7QUFBQSxFQUMzQjtBQUNEO0FBakJhLHFDQUVJLEtBQUs7QUFGVCx1Q0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFsiQWN0aW9uTG9jYXRpb24iXQp9Cg==
