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
import { DeferredPromise } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { autorun } from "../../../base/common/observable.js";
import { revive } from "../../../base/common/marshalling.js";
import { Schemas } from "../../../base/common/network.js";
import { escapeRegExpCharacters } from "../../../base/common/strings.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { URI } from "../../../base/common/uri.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Range } from "../../../editor/common/core/range.js";
import { getWordAtText } from "../../../editor/common/core/wordHelper.js";
import { CompletionItemKind } from "../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../editor/common/services/languageFeatures.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { IChatWidgetService } from "../../contrib/chat/browser/chat.js";
import { AgentSessionProviders, getAgentSessionProvider } from "../../contrib/chat/browser/agentSessions/agentSessions.js";
import { AddDynamicVariableAction } from "../../contrib/chat/browser/attachments/chatDynamicVariables.js";
import { IChatAgentService } from "../../contrib/chat/common/participants/chatAgents.js";
import { IPromptsService, PromptsStorage } from "../../contrib/chat/common/promptSyntax/service/promptsService.js";
import { isValidPromptType, PromptsType } from "../../contrib/chat/common/promptSyntax/promptTypes.js";
import { ChatRequestAgentPart } from "../../contrib/chat/common/requestParser/chatParserTypes.js";
import { ChatRequestParser } from "../../contrib/chat/common/requestParser/chatRequestParser.js";
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from "../../contrib/chat/browser/attachments/chatVariables.js";
import { IChatService } from "../../contrib/chat/common/chatService/chatService.js";
import { ChatSessionOptionsMap, IChatSessionsService } from "../../contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation, ChatModeKind } from "../../contrib/chat/common/constants.js";
import { ILanguageModelToolsService } from "../../contrib/chat/common/tools/languageModelToolsService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { NotebookDto } from "./mainThreadNotebookDto.js";
import { getChatSessionType, isUntitledChatSession } from "../../contrib/chat/common/model/chatUri.js";
import { ICustomizationHarnessService } from "../../contrib/chat/common/customizationHarnessService.js";
import { AICustomizationManagementSection } from "../../contrib/chat/common/aiCustomizationWorkspaceService.js";
import { IAgentPluginService } from "../../contrib/chat/common/plugins/agentPluginService.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
class MainThreadChatTask {
  constructor(content) {
    this.content = content;
    this.kind = "progressTask";
    this.deferred = new DeferredPromise();
    this._onDidAddProgress = new Emitter();
    this.progress = [];
  }
  get onDidAddProgress() {
    return this._onDidAddProgress.event;
  }
  task() {
    return this.deferred.p;
  }
  isSettled() {
    return this.deferred.isSettled;
  }
  complete(v) {
    this.deferred.complete(v);
  }
  add(progress) {
    this.progress.push(progress);
    this._onDidAddProgress.fire(progress);
  }
  toJSON() {
    return {
      kind: "progressTaskSerialized",
      content: this.content,
      progress: this.progress
    };
  }
}
let MainThreadChatAgents2 = class extends Disposable {
  constructor(extHostContext, _chatAgentService, _chatSessionService, _chatService, _languageFeaturesService, _chatWidgetService, _instantiationService, _logService, _extensionService, _uriIdentityService, _promptsService, _languageModelToolsService, _customizationHarnessService, _telemetryService, _agentPluginService, _environmentService) {
    super();
    this._chatAgentService = _chatAgentService;
    this._chatSessionService = _chatSessionService;
    this._chatService = _chatService;
    this._languageFeaturesService = _languageFeaturesService;
    this._chatWidgetService = _chatWidgetService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._extensionService = _extensionService;
    this._uriIdentityService = _uriIdentityService;
    this._promptsService = _promptsService;
    this._languageModelToolsService = _languageModelToolsService;
    this._customizationHarnessService = _customizationHarnessService;
    this._telemetryService = _telemetryService;
    this._agentPluginService = _agentPluginService;
    this._environmentService = _environmentService;
    this._agents = this._register(new DisposableMap());
    this._agentCompletionProviders = this._register(new DisposableMap());
    this._agentIdsToCompletionProviders = this._register(new DisposableMap());
    this._chatParticipantDetectionProviders = this._register(new DisposableMap());
    this._promptFileProviders = this._register(new DisposableMap());
    this._promptFileProviderEmitters = this._register(new DisposableMap());
    this._promptFileContentRegistrations = this._register(new DisposableMap());
    this._customizationProviders = this._register(new DisposableMap());
    this._customizationProviderEmitters = this._register(new DisposableMap());
    this._pendingProgress = /* @__PURE__ */ new Map();
    this._activeTasks = /* @__PURE__ */ new Map();
    this._unresolvedAnchors = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatAgents2);
    this._register(this._chatService.onDidDisposeSession((e) => {
      for (const resource of e.sessionResources) {
        this._proxy.$releaseSession(resource);
      }
    }));
    this._register(this._chatService.onDidPerformUserAction((e) => {
      if (typeof e.agentId === "string") {
        for (const [handle, agent] of this._agents) {
          if (agent.id === e.agentId) {
            if (e.action.kind === "vote") {
              this._proxy.$acceptFeedback(handle, e.result ?? {}, e.action);
            } else {
              this._proxy.$acceptAction(handle, e.result || {}, e);
            }
            break;
          }
        }
      }
    }));
    this._register(this._chatService.onDidReceiveQuestionCarouselAnswer((e) => {
      this._proxy.$handleQuestionCarouselAnswer(e.requestId, e.resolveId, e.answers);
    }));
    this._register(this._chatWidgetService.onDidChangeFocusedSession(() => {
      this._acceptActiveChatSession(this._chatWidgetService.lastFocusedWidget);
    }));
    this._acceptActiveChatSession(this._chatWidgetService.lastFocusedWidget);
    this._register(this._promptsService.onDidChangeCustomAgents(() => {
      this._proxy.$onDidChangeCustomAgents();
    }));
    this._register(this._promptsService.onDidChangeInstructions(() => {
      this._proxy.$onDidChangeInstructions();
    }));
    this._register(this._promptsService.onDidChangeSkills(() => {
      this._proxy.$onDidChangeSkills();
    }));
    this._register(this._promptsService.onDidChangeSlashCommands(() => {
      this._proxy.$onDidChangeSlashCommands();
    }));
    this._register(this._promptsService.onDidChangeHooks(() => {
      this._proxy.$onDidChangeHooks();
    }));
    this._register(autorun((reader) => {
      this._agentPluginService.plugins.read(reader);
      this._proxy.$onDidChangePlugins();
    }));
  }
  _acceptActiveChatSession(widget) {
    const sessionResource = widget?.viewModel?.sessionResource;
    const isLocal = sessionResource && getAgentSessionProvider(sessionResource) === AgentSessionProviders.Local;
    this._proxy.$acceptActiveChatSession(isLocal ? sessionResource : void 0);
  }
  _toChatResourceSource(storage) {
    switch (storage) {
      case PromptsStorage.local:
        return "local";
      case PromptsStorage.user:
        return "user";
      case PromptsStorage.extension:
        return "extension";
      case PromptsStorage.plugin:
        return "plugin";
      case PromptsStorage.builtIn:
        return "builtin";
    }
  }
  _toCustomAgentDto(agent) {
    return {
      uri: agent.uri,
      name: agent.name,
      description: agent.description,
      source: this._toChatResourceSource(agent.source.storage),
      extensionId: agent.source.storage === PromptsStorage.extension ? agent.source.extensionId.value : void 0,
      pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : void 0,
      sessionTypes: agent.sessionTypes,
      argumentHint: agent.argumentHint,
      tools: agent.tools,
      model: agent.model,
      userInvocable: agent.visibility.userInvocable,
      disableModelInvocation: !agent.visibility.agentInvocable,
      enabled: agent.enabled
    };
  }
  _toInstructionDto(instruction) {
    return {
      uri: instruction.uri,
      name: instruction.name,
      description: instruction.description,
      source: this._toChatResourceSource(instruction.storage),
      extensionId: instruction.extension?.identifier.value,
      pluginUri: instruction.pluginUri,
      sessionTypes: instruction.sessionTypes,
      pattern: instruction.pattern
    };
  }
  _toSkillDto(skill) {
    return {
      uri: skill.uri,
      name: skill.name,
      description: skill.description,
      source: this._toChatResourceSource(skill.storage),
      extensionId: skill.extension?.identifier.value,
      pluginUri: skill.pluginUri,
      sessionTypes: skill.sessionTypes,
      userInvocable: skill.userInvocable,
      disableModelInvocation: skill.disableModelInvocation
    };
  }
  _toSlashCommandDto(slashCommand) {
    return {
      uri: slashCommand.uri,
      name: slashCommand.name,
      description: slashCommand.description,
      source: this._toChatResourceSource(slashCommand.storage),
      extensionId: slashCommand.extension?.identifier.value,
      pluginUri: slashCommand.pluginUri,
      sessionTypes: slashCommand.sessionTypes,
      argumentHint: slashCommand.argumentHint,
      userInvocable: slashCommand.userInvocable
    };
  }
  _toHookDto(hookFile) {
    return {
      uri: hookFile.uri,
      sessionTypes: hookFile.sessionTypes,
      source: this._toChatResourceSource(hookFile.storage),
      extensionId: hookFile.extension?.identifier.value,
      pluginUri: hookFile.pluginUri
    };
  }
  _toPluginDto(plugin) {
    return {
      uri: plugin.uri
    };
  }
  async $provideCustomAgents(token) {
    const customAgents = await this._promptsService.getCustomAgents(token);
    return customAgents.map((agent) => this._toCustomAgentDto(agent));
  }
  async $provideInstructions(token) {
    const instructions = await this._promptsService.getInstructionFiles(token);
    return instructions.map((instruction) => this._toInstructionDto(instruction));
  }
  async $provideSkills(token) {
    const skills = await this._promptsService.findAgentSkills(token) ?? [];
    return skills.map((skill) => this._toSkillDto(skill));
  }
  async $provideSlashCommands(token) {
    const slashCommands = await this._promptsService.getPromptSlashCommands(token);
    return slashCommands.map((slashCommand) => this._toSlashCommandDto(slashCommand));
  }
  async $provideHooks(token) {
    const hookFiles = await this._promptsService.listPromptFiles(PromptsType.hook, token);
    return hookFiles.map((hookFile) => this._toHookDto(hookFile));
  }
  async $providePlugins(_token) {
    const plugins = this._agentPluginService.plugins.get();
    return plugins.map((plugin) => this._toPluginDto(plugin));
  }
  $unregisterAgent(handle) {
    this._agents.deleteAndDispose(handle);
  }
  async $transferActiveChatSession(toWorkspace) {
    const widget = this._chatWidgetService.lastFocusedWidget;
    const model = widget?.viewModel?.model;
    if (!model) {
      this._logService.error(`MainThreadChat#$transferActiveChatSession: No active chat session found`);
      return;
    }
    await this._chatService.transferChatSession(model.sessionResource, URI.revive(toWorkspace));
  }
  async $registerAgent(handle, extension, id, metadata, dynamicProps) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const staticAgentRegistration = this._chatAgentService.getAgent(id, true);
    const chatSessionRegistration = this._chatSessionService.getAllChatSessionContributions().find((c) => c.type === id || c.alternativeIds?.includes(id));
    if (!staticAgentRegistration && !chatSessionRegistration && !dynamicProps) {
      if (this._chatAgentService.getAgentsByName(id).length) {
        throw new Error(`chatParticipant must be declared with an ID in package.json. The "id" property may be missing! "${id}"`);
      }
      throw new Error(`chatParticipant must be declared in package.json: ${id}`);
    }
    const impl = {
      invoke: async (request, progress, history, token) => {
        const chatSession = this._chatService.getSession(request.sessionResource);
        this._pendingProgress.set(request.requestId, { progress, chatSession, isSubagent: !!request.subAgentInvocationId });
        try {
          const chatSessionResource = request.sessionResource;
          const chatSessionContext = {
            chatSessionResource,
            isUntitled: isUntitledChatSession(chatSessionResource),
            initialSessionOptions: ChatSessionOptionsMap.toStrValueArray(this._chatSessionService.getSessionOptions(chatSessionResource))
          };
          const rpcResult = await this._proxy.$invokeAgent(handle, request, {
            history,
            chatSessionContext
          }, token);
          if (rpcResult?.errorCallstack && !rpcResult.errorDetails?.isRateLimited && !rpcResult.errorDetails?.isQuotaExceeded && !rpcResult.errorDetails?.isExpectedError) {
            this._telemetryService.publicLogError2("chatAgentError", {
              callstack: rpcResult.errorCallstack,
              msg: rpcResult.errorDetails?.message ?? "",
              errorName: rpcResult.errorName ?? "",
              agent: id,
              agentExtensionId: extension.value
            });
          }
          if (rpcResult) {
            const { errorCallstack: _, errorName: _2, ...result } = rpcResult;
            return result;
          }
          return {};
        } finally {
          this._pendingProgress.delete(request.requestId);
        }
      },
      setRequestTools: (requestId, tools) => {
        this._proxy.$setRequestTools(requestId, tools);
      },
      setYieldRequested: (requestId, value) => {
        this._proxy.$setYieldRequested(requestId, value);
      },
      provideFollowups: async (request, result, history, token) => {
        if (!this._agents.get(handle)?.hasFollowups) {
          return [];
        }
        return this._proxy.$provideFollowups(request, handle, result, { history }, token);
      },
      provideChatTitle: (history, token) => {
        return this._proxy.$provideChatTitle(handle, history, token);
      },
      provideChatSummary: (history, token) => {
        return this._proxy.$provideChatSummary(handle, history, token);
      }
    };
    if (chatSessionRegistration?.alternativeIds?.includes(id)) {
      return;
    }
    let disposable;
    if (!staticAgentRegistration && dynamicProps) {
      const extensionDescription = this._extensionService.extensions.find((e) => ExtensionIdentifier.equals(e.identifier, extension));
      disposable = this._chatAgentService.registerDynamicAgent(
        {
          id,
          name: dynamicProps.name,
          description: dynamicProps.description,
          extensionId: extension,
          extensionVersion: extensionDescription?.version,
          extensionDisplayName: extensionDescription?.displayName ?? extension.value,
          extensionPublisherId: extensionDescription?.publisher ?? "",
          publisherDisplayName: dynamicProps.publisherName,
          fullName: dynamicProps.fullName,
          metadata: revive(metadata),
          slashCommands: [],
          disambiguation: [],
          locations: [ChatAgentLocation.Chat],
          modes: [ChatModeKind.Ask, ChatModeKind.Agent, ChatModeKind.Edit]
        },
        impl
      );
    } else {
      disposable = this._chatAgentService.registerAgentImplementation(id, impl);
    }
    this._agents.set(handle, {
      id,
      extensionId: extension,
      dispose: () => disposable.dispose(),
      hasFollowups: metadata.hasFollowups
    });
  }
  async $updateAgent(handle, metadataUpdate) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const data = this._agents.get(handle);
    if (!data) {
      this._logService.error(`MainThreadChatAgents2#$updateAgent: No agent with handle ${handle} registered`);
      return;
    }
    data.hasFollowups = metadataUpdate.hasFollowups;
    this._chatAgentService.updateAgent(data.id, revive(metadataUpdate));
  }
  async $handleProgressChunk(requestId, chunks) {
    const pendingProgress = this._pendingProgress.get(requestId);
    if (!pendingProgress) {
      this._logService.warn(`MainThreadChatAgents2#$handleProgressChunk: No pending progress for requestId ${requestId}`);
      return;
    }
    const { progress, chatSession, isSubagent } = pendingProgress;
    const chatProgressParts = [];
    const response = chatSession?.getRequests().find((req) => req.id === requestId)?.response;
    for (const item of chunks) {
      const [progress2, responsePartHandle] = Array.isArray(item) ? item : [item];
      if (progress2.kind === "externalEdits") {
        if (chatSession?.editingSession && responsePartHandle !== void 0 && response) {
          const parts = progress2.start ? await chatSession.editingSession.startExternalEdits(response, responsePartHandle, revive(progress2.resources), progress2.undoStopId) : await chatSession.editingSession.stopExternalEdits(response, responsePartHandle);
          chatProgressParts.push(...parts);
        }
        continue;
      }
      if (progress2.kind === "beginToolInvocation") {
        this._languageModelToolsService.beginToolCall({
          toolCallId: progress2.toolCallId,
          toolId: progress2.toolName,
          chatRequestId: requestId,
          sessionResource: chatSession?.sessionResource,
          subagentInvocationId: progress2.subagentInvocationId
        });
        continue;
      }
      if (progress2.kind === "updateToolInvocation") {
        this._languageModelToolsService.updateToolStream(progress2.toolCallId, progress2.streamData?.partialInput, CancellationToken.None);
        continue;
      }
      if (progress2.kind === "usage") {
        if (isSubagent) {
          chatProgressParts.push({
            kind: "usage",
            promptTokens: progress2.promptTokens,
            completionTokens: progress2.completionTokens,
            outputBuffer: progress2.outputBuffer,
            copilotCredits: progress2.copilotCredits,
            promptTokenDetails: progress2.promptTokenDetails
          });
        } else if (response) {
          response.setUsage({
            kind: "usage",
            promptTokens: progress2.promptTokens,
            completionTokens: progress2.completionTokens,
            outputBuffer: progress2.outputBuffer,
            copilotCredits: progress2.copilotCredits,
            promptTokenDetails: progress2.promptTokenDetails
          });
        } else {
          this._logService.warn(`MainThreadChatAgents2#$handleProgressChunk: No response model for usage of non-subagent request ${requestId}; dropping usage.`);
        }
        continue;
      }
      const revivedProgress = progress2.kind === "notebookEdit" ? ChatNotebookEdit.fromChatEdit(progress2) : revive(progress2);
      if (revivedProgress.kind === "notebookEdit" || revivedProgress.kind === "textEdit" || revivedProgress.kind === "codeblockUri") {
        revivedProgress.uri = this._uriIdentityService.asCanonicalUri(revivedProgress.uri);
      }
      if (responsePartHandle !== void 0) {
        if (revivedProgress.kind === "progressTask") {
          const handle = responsePartHandle;
          const responsePartId = `${requestId}_${handle}`;
          const task = new MainThreadChatTask(revivedProgress.content);
          this._activeTasks.set(responsePartId, task);
          chatProgressParts.push(task);
        } else if (responsePartHandle !== void 0) {
          const responsePartId = `${requestId}_${responsePartHandle}`;
          const task = this._activeTasks.get(responsePartId);
          switch (revivedProgress.kind) {
            case "progressTaskResult":
              if (task && revivedProgress.content) {
                task.complete(revivedProgress.content.value);
                this._activeTasks.delete(responsePartId);
              } else {
                task?.complete(void 0);
              }
              break;
            case "warning":
            case "reference":
              task?.add(revivedProgress);
              break;
          }
        }
        continue;
      }
      if (revivedProgress.kind === "inlineReference" && revivedProgress.resolveId && response) {
        if (!this._unresolvedAnchors.has(requestId)) {
          this._unresolvedAnchors.set(requestId, /* @__PURE__ */ new Map());
        }
        this._unresolvedAnchors.get(requestId)?.set(revivedProgress.resolveId, { response });
      }
      chatProgressParts.push(revivedProgress);
    }
    progress(chatProgressParts);
  }
  $handleAnchorResolve(requestId, handle, resolveAnchor) {
    const unresolvedAnchorsForRequest = this._unresolvedAnchors.get(requestId);
    if (!unresolvedAnchorsForRequest) {
      return;
    }
    const unresolvedAnchor = unresolvedAnchorsForRequest.get(handle);
    if (!unresolvedAnchor) {
      return;
    }
    unresolvedAnchorsForRequest.delete(handle);
    if (unresolvedAnchorsForRequest.size === 0) {
      this._unresolvedAnchors.delete(requestId);
    }
    if (resolveAnchor) {
      const revivedAnchor = revive(resolveAnchor);
      unresolvedAnchor.response.resolveInlineReference(handle, revivedAnchor);
    }
  }
  $registerAgentCompletionsProvider(handle, id, triggerCharacters) {
    const provide = async (query, token) => {
      const completions = await this._proxy.$invokeCompletionProvider(handle, query, token);
      return completions.map((c) => ({ ...c, icon: c.icon ? ThemeIcon.fromId(c.icon) : void 0 }));
    };
    this._agentIdsToCompletionProviders.set(id, this._chatAgentService.registerAgentCompletionProvider(id, provide));
    this._agentCompletionProviders.set(handle, this._languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatAgentCompletions:" + handle,
      triggerCharacters,
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this._chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return;
        }
        const triggerCharsPart = triggerCharacters.map((c) => escapeRegExpCharacters(c)).join("");
        const wordRegex = new RegExp(`[${triggerCharsPart}]\\S*`, "g");
        const query = getWordAtText(position.column, wordRegex, model.getLineContent(position.lineNumber), 0)?.word ?? "";
        if (query && !triggerCharacters.some((c) => query.startsWith(c))) {
          return;
        }
        const context = {
          sessionType: getChatSessionType(widget.viewModel.model.sessionResource)
        };
        const parsedRequest = this._instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(widget), getSelectedToolAndToolSetsForWidget(widget), model.getValue(), ChatAgentLocation.Chat, context).parts;
        const agentPart = parsedRequest.find((part) => part instanceof ChatRequestAgentPart);
        const thisAgentId = this._agents.get(handle)?.id;
        if (agentPart?.agent.id !== thisAgentId) {
          return;
        }
        const range = computeCompletionRanges(model, position, wordRegex);
        if (!range) {
          return null;
        }
        const result = await provide(query, token);
        const variableItems = result.map((v) => {
          const insertText = v.insertText ?? (typeof v.label === "string" ? v.label : v.label.label);
          const rangeAfterInsert = new Range(range.insert.startLineNumber, range.insert.startColumn, range.insert.endLineNumber, range.insert.startColumn + insertText.length);
          return {
            label: v.label,
            range,
            insertText: insertText + " ",
            kind: CompletionItemKind.Text,
            detail: v.detail,
            documentation: v.documentation,
            command: { id: AddDynamicVariableAction.ID, title: "", arguments: [{ id: v.id, widget, range: rangeAfterInsert, variableData: revive(v.value), command: v.command }] }
          };
        });
        return {
          suggestions: variableItems
        };
      }
    }));
  }
  $unregisterAgentCompletionsProvider(handle, id) {
    this._agentCompletionProviders.deleteAndDispose(handle);
    this._agentIdsToCompletionProviders.deleteAndDispose(id);
  }
  $registerChatParticipantDetectionProvider(handle) {
    this._chatParticipantDetectionProviders.set(handle, this._chatAgentService.registerChatParticipantDetectionProvider(
      handle,
      {
        provideParticipantDetection: async (request, history, options, token) => {
          return await this._proxy.$detectChatParticipant(handle, request, { history }, options, token);
        }
      }
    ));
  }
  $unregisterChatParticipantDetectionProvider(handle) {
    this._chatParticipantDetectionProviders.deleteAndDispose(handle);
  }
  async $registerPromptFileProvider(handle, type, extensionId) {
    const extension = await this._extensionService.getExtension(extensionId.value);
    if (!extension) {
      this._logService.error(`[MainThreadChatAgents2] Could not find extension for prompt file provider: ${extensionId.value}`);
      return;
    }
    if (!isValidPromptType(type)) {
      this._logService.error(`[MainThreadChatAgents2] Invalid contribution type: ${type}`);
      return;
    }
    const emitter = new Emitter();
    this._promptFileProviderEmitters.set(handle, emitter);
    const contentRegistrations = new DisposableMap();
    this._promptFileContentRegistrations.set(handle, contentRegistrations);
    const disposable = this._promptsService.registerPromptFileProvider(extension, type, {
      onDidChangePromptFiles: emitter.event,
      providePromptFiles: async (context, token) => {
        const contributions = await this._proxy.$providePromptFiles(handle, type, context, token);
        if (!contributions) {
          return void 0;
        }
        return contributions.map((c) => {
          return {
            name: c.name,
            description: c.description,
            sessionTypes: c.sessionTypes,
            when: c.when,
            uri: URI.revive(c.uri)
          };
        });
      }
    });
    this._promptFileProviders.set(handle, disposable);
  }
  $unregisterPromptFileProvider(handle) {
    this._promptFileProviders.deleteAndDispose(handle);
    this._promptFileProviderEmitters.deleteAndDispose(handle);
    this._promptFileContentRegistrations.deleteAndDispose(handle);
  }
  $onDidChangePromptFiles(handle) {
    const emitter = this._promptFileProviderEmitters.get(handle);
    if (emitter) {
      emitter.fire();
    }
  }
  async $registerChatSessionCustomizationProvider(handle, chatSessionType, metadata, extensionId) {
    if (this._environmentService.isSessionsWindow && !this._chatSessionService.getContentProviderSchemes().includes(chatSessionType)) {
      return;
    }
    const extension = await this._extensionService.getExtension(extensionId.value);
    if (!extension) {
      this._logService.error(`[MainThreadChatAgents2] Could not find extension for customization provider: ${extensionId.value}`);
      return;
    }
    const emitter = new Emitter();
    this._customizationProviderEmitters.set(handle, emitter);
    const itemProvider = {
      onDidChange: emitter.event,
      provideChatSessionCustomizations: async (sessionResource, token) => {
        const items = await this._proxy.$provideChatSessionCustomizations(handle, sessionResource, token);
        if (!items) {
          return void 0;
        }
        return items.map((item) => ({
          uri: URI.revive(item.uri),
          type: item.type,
          name: item.name,
          source: item.source,
          description: item.description,
          groupKey: item.groupKey,
          badge: item.badge,
          badgeTooltip: item.badgeTooltip,
          extensionId: item.extensionId,
          pluginUri: item.pluginUri ? URI.revive(item.pluginUri) : void 0,
          pluginLabel: item.pluginLabel,
          userInvocable: item.userInvocable
        }));
      },
      provideSourceFolders: async (sessionResource, type, token) => {
        const folders = await this._proxy.$provideSourceFolders(handle, sessionResource, type, token);
        if (!folders) {
          return void 0;
        }
        return folders.map((folder) => ({
          uri: URI.revive(folder.uri),
          label: folder.label,
          source: folder.source
        }));
      }
    };
    const typeToSection = {
      "agent": AICustomizationManagementSection.Agents,
      "skill": AICustomizationManagementSection.Skills,
      "instructions": AICustomizationManagementSection.Instructions,
      "prompt": AICustomizationManagementSection.Prompts,
      "hook": AICustomizationManagementSection.Hooks,
      "plugins": AICustomizationManagementSection.Plugins
    };
    let hiddenSections;
    if (metadata.supportedTypes) {
      const supportedSections = /* @__PURE__ */ new Set();
      for (const t of metadata.supportedTypes) {
        const section = typeToSection[t];
        if (section) {
          supportedSections.add(section);
        }
      }
      hiddenSections = Object.values(typeToSection).filter((section) => !supportedSections.has(section));
    }
    const descriptor = {
      id: chatSessionType,
      label: metadata.label,
      icon: metadata.iconId ? ThemeIcon.fromId(metadata.iconId) : ThemeIcon.fromId(Codicon.extensions.id),
      hiddenSections,
      itemProvider
    };
    const registration = this._customizationHarnessService.registerExternalHarness(descriptor);
    this._customizationProviders.set(handle, registration);
  }
  $unregisterChatSessionCustomizationProvider(handle) {
    this._customizationProviders.deleteAndDispose(handle);
    this._customizationProviderEmitters.deleteAndDispose(handle);
  }
  $onDidChangeCustomizations(handle) {
    const emitter = this._customizationProviderEmitters.get(handle);
    if (emitter) {
      emitter.fire();
    }
  }
};
MainThreadChatAgents2 = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadChatAgents2),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IChatSessionsService),
  __decorateParam(3, IChatService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, IPromptsService),
  __decorateParam(11, ILanguageModelToolsService),
  __decorateParam(12, ICustomizationHarnessService),
  __decorateParam(13, ITelemetryService),
  __decorateParam(14, IAgentPluginService),
  __decorateParam(15, IWorkbenchEnvironmentService)
], MainThreadChatAgents2);
function computeCompletionRanges(model, position, reg) {
  const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
  if (!varWord && model.getWordUntilPosition(position).word) {
    return;
  }
  let insert;
  let replace;
  if (!varWord) {
    insert = replace = Range.fromPositions(position);
  } else {
    insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
    replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
  }
  return { insert, replace };
}
var ChatNotebookEdit;
((ChatNotebookEdit2) => {
  function fromChatEdit(part) {
    return {
      kind: "notebookEdit",
      uri: URI.revive(part.uri),
      done: part.done,
      edits: part.edits.map(NotebookDto.fromCellEditOperationDto)
    };
  }
  ChatNotebookEdit2.fromChatEdit = fromChatEdit;
})(ChatNotebookEdit || (ChatNotebookEdit = {}));
export {
  MainThreadChatAgents2,
  MainThreadChatTask
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZENoYXRBZ2VudHMyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBnZXRXb3JkQXRUZXh0IH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uSXRlbUtpbmQsIENvbXBsZXRpb25MaXN0IH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBBZGREeW5hbWljVmFyaWFibGVBY3Rpb24sIElBZGREeW5hbWljVmFyaWFibGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdER5bmFtaWNWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudEhpc3RvcnlFbnRyeSwgSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uLCBJQ2hhdEFnZW50UmVxdWVzdCwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IElBZ2VudFNraWxsLCBJQ2hhdFByb21wdFNsYXNoQ29tbWFuZCwgSUN1c3RvbUFnZW50LCBJSW5zdHJ1Y3Rpb25GaWxlLCBJUHJvbXB0RmlsZUNvbnRleHQsIElQcm9tcHRQYXRoLCBJUHJvbXB0c1NlcnZpY2UsIFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1ZhbGlkUHJvbXB0VHlwZSwgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsLCBJQ2hhdFJlc3BvbnNlTW9kZWwgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdEFnZW50UGFydCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RQYXJzZXIsIElDaGF0UGFyc2VyQ29udGV4dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UmVxdWVzdFBhcnNlci5qcyc7XG5pbXBvcnQgeyBnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0LCBnZXRTZWxlY3RlZFRvb2xBbmRUb29sU2V0c0ZvcldpZGdldCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlLCBJQ2hhdENvbnRlbnRSZWZlcmVuY2UsIElDaGF0Rm9sbG93dXAsIElDaGF0Tm90ZWJvb2tFZGl0LCBJQ2hhdFByb2dyZXNzLCBJQ2hhdFNlcnZpY2UsIElDaGF0VGFzaywgSUNoYXRUYXNrU2VyaWFsaXplZCwgSUNoYXRXYXJuaW5nTWVzc2FnZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25PcHRpb25zTWFwLCBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb250ZXh0LCBleHRIb3N0TmFtZWRDdXN0b21lciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IER0byB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q2hhdEFnZW50c1NoYXBlMiwgRXh0SG9zdENvbnRleHQsIElDaGF0QWdlbnRJbnZva2VSZXN1bHQsIElDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25JdGVtRHRvLCBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXJNZXRhZGF0YUR0bywgSUNoYXROb3RlYm9va0VkaXREdG8sIElDaGF0UGFydGljaXBhbnRNZXRhZGF0YSwgSUNoYXRQcm9ncmVzc0R0bywgSUNoYXRTZXNzaW9uQ29udGV4dER0bywgSUN1c3RvbUFnZW50RHRvLCBJRHluYW1pY0NoYXRBZ2VudFByb3BzLCBJRXh0ZW5zaW9uQ2hhdEFnZW50TWV0YWRhdGEsIElIb29rRHRvLCBJSW5zdHJ1Y3Rpb25EdG8sIElQbHVnaW5EdG8sIElTa2lsbER0bywgSVNsYXNoQ29tbWFuZER0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDaGF0QWdlbnRzU2hhcGUyIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tEdG8gfSBmcm9tICcuL21haW5UaHJlYWROb3RlYm9va0R0by5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUsIGlzVW50aXRsZWRDaGF0U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCBJQ3VzdG9taXphdGlvbkl0ZW0sIElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLCBJSGFybmVzc0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW4sIElBZ2VudFBsdWdpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIEFnZW50RGF0YSB7XG5cdGRpc3Bvc2U6ICgpID0+IHZvaWQ7XG5cdGlkOiBzdHJpbmc7XG5cdGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyO1xuXHRoYXNGb2xsb3d1cHM/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgVW5yZXNvbHZlZEFuY2hvciB7XG5cdHJlYWRvbmx5IHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlTW9kZWw7XG59XG5cbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkQ2hhdFRhc2sgaW1wbGVtZW50cyBJQ2hhdFRhc2sge1xuXHRwdWJsaWMgcmVhZG9ubHkga2luZCA9ICdwcm9ncmVzc1Rhc2snO1xuXG5cdHB1YmxpYyByZWFkb25seSBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8c3RyaW5nIHwgdm9pZD4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZFByb2dyZXNzID0gbmV3IEVtaXR0ZXI8SUNoYXRXYXJuaW5nTWVzc2FnZSB8IElDaGF0Q29udGVudFJlZmVyZW5jZT4oKTtcblx0cHVibGljIGdldCBvbkRpZEFkZFByb2dyZXNzKCk6IEV2ZW50PElDaGF0V2FybmluZ01lc3NhZ2UgfCBJQ2hhdENvbnRlbnRSZWZlcmVuY2U+IHsgcmV0dXJuIHRoaXMuX29uRGlkQWRkUHJvZ3Jlc3MuZXZlbnQ7IH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgcHJvZ3Jlc3M6IChJQ2hhdFdhcm5pbmdNZXNzYWdlIHwgSUNoYXRDb250ZW50UmVmZXJlbmNlKVtdID0gW107XG5cblx0Y29uc3RydWN0b3IocHVibGljIGNvbnRlbnQ6IElNYXJrZG93blN0cmluZykgeyB9XG5cblx0dGFzaygpIHtcblx0XHRyZXR1cm4gdGhpcy5kZWZlcnJlZC5wO1xuXHR9XG5cblx0aXNTZXR0bGVkKCkge1xuXHRcdHJldHVybiB0aGlzLmRlZmVycmVkLmlzU2V0dGxlZDtcblx0fVxuXG5cdGNvbXBsZXRlKHY6IHN0cmluZyB8IHZvaWQpIHtcblx0XHR0aGlzLmRlZmVycmVkLmNvbXBsZXRlKHYpO1xuXHR9XG5cblx0YWRkKHByb2dyZXNzOiBJQ2hhdFdhcm5pbmdNZXNzYWdlIHwgSUNoYXRDb250ZW50UmVmZXJlbmNlKTogdm9pZCB7XG5cdFx0dGhpcy5wcm9ncmVzcy5wdXNoKHByb2dyZXNzKTtcblx0XHR0aGlzLl9vbkRpZEFkZFByb2dyZXNzLmZpcmUocHJvZ3Jlc3MpO1xuXHR9XG5cblx0dG9KU09OKCk6IElDaGF0VGFza1NlcmlhbGl6ZWQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAncHJvZ3Jlc3NUYXNrU2VyaWFsaXplZCcsXG5cdFx0XHRjb250ZW50OiB0aGlzLmNvbnRlbnQsXG5cdFx0XHRwcm9ncmVzczogdGhpcy5wcm9ncmVzc1xuXHRcdH07XG5cdH1cbn1cblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRDaGF0QWdlbnRzMilcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkQ2hhdEFnZW50czIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZENoYXRBZ2VudHNTaGFwZTIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgQWdlbnREYXRhPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRDb21wbGV0aW9uUHJvdmlkZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SWRzVG9Db21wbGV0aW9uUHJvdmlkZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgSURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdEZpbGVQcm92aWRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvbXB0RmlsZVByb3ZpZGVyRW1pdHRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXIsIEVtaXR0ZXI8dm9pZD4+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRGaWxlQ29udGVudFJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXIsIERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT4+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbWl6YXRpb25Qcm92aWRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvblByb3ZpZGVyRW1pdHRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxudW1iZXIsIEVtaXR0ZXI8dm9pZD4+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdQcm9ncmVzcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHByb2dyZXNzOiAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4gdm9pZDsgY2hhdFNlc3Npb246IElDaGF0TW9kZWwgfCB1bmRlZmluZWQ7IGlzU3ViYWdlbnQ6IGJvb2xlYW4gfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RDaGF0QWdlbnRzU2hhcGUyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVRhc2tzID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0VGFzaz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91bnJlc29sdmVkQW5jaG9ycyA9IG5ldyBNYXA8LyogcmVxdWVzdElkICovc3RyaW5nLCBNYXA8LyogaWQgKi8gc3RyaW5nLCBVbnJlc29sdmVkQW5jaG9yPj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25TZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQWdlbnRQbHVnaW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q2hhdEFnZW50czIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFNlcnZpY2Uub25EaWREaXNwb3NlU2Vzc2lvbihlID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZS5zZXNzaW9uUmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlU2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRTZXJ2aWNlLm9uRGlkUGVyZm9ybVVzZXJBY3Rpb24oZSA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIGUuYWdlbnRJZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBbaGFuZGxlLCBhZ2VudF0gb2YgdGhpcy5fYWdlbnRzKSB7XG5cdFx0XHRcdFx0aWYgKGFnZW50LmlkID09PSBlLmFnZW50SWQpIHtcblx0XHRcdFx0XHRcdGlmIChlLmFjdGlvbi5raW5kID09PSAndm90ZScpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdEZlZWRiYWNrKGhhbmRsZSwgZS5yZXN1bHQgPz8ge30sIGUuYWN0aW9uKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRBY3Rpb24oaGFuZGxlLCBlLnJlc3VsdCB8fCB7fSwgZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFNlcnZpY2Uub25EaWRSZWNlaXZlUXVlc3Rpb25DYXJvdXNlbEFuc3dlcihlID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRoYW5kbGVRdWVzdGlvbkNhcm91c2VsQW5zd2VyKGUucmVxdWVzdElkLCBlLnJlc29sdmVJZCwgZS5hbnN3ZXJzKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFdpZGdldFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9hY2NlcHRBY3RpdmVDaGF0U2Vzc2lvbih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUHVzaCB0aGUgaW5pdGlhbCBhY3RpdmUgc2Vzc2lvbiBpZiB0aGVyZSBpcyBhbHJlYWR5IGEgZm9jdXNlZCB3aWRnZXRcblx0XHR0aGlzLl9hY2NlcHRBY3RpdmVDaGF0U2Vzc2lvbih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbUFnZW50cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Byb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2tpbGxzKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZVNraWxscygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZUhvb2tzKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZENoYW5nZUhvb2tzKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlUGx1Z2lucygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2FjY2VwdEFjdGl2ZUNoYXRTZXNzaW9uKHdpZGdldDogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB3aWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdGNvbnN0IGlzTG9jYWwgPSBzZXNzaW9uUmVzb3VyY2UgJiYgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIoc2Vzc2lvblJlc291cmNlKSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsO1xuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRBY3RpdmVDaGF0U2Vzc2lvbihpc0xvY2FsID8gc2Vzc2lvblJlc291cmNlIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3RvQ2hhdFJlc291cmNlU291cmNlKHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlKTogSUN1c3RvbUFnZW50RHRvWydzb3VyY2UnXSB7XG5cdFx0c3dpdGNoIChzdG9yYWdlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLmxvY2FsOlxuXHRcdFx0XHRyZXR1cm4gJ2xvY2FsJztcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UudXNlcjpcblx0XHRcdFx0cmV0dXJuICd1c2VyJztcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uOlxuXHRcdFx0XHRyZXR1cm4gJ2V4dGVuc2lvbic7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLnBsdWdpbjpcblx0XHRcdFx0cmV0dXJuICdwbHVnaW4nO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5idWlsdEluOlxuXHRcdFx0XHRyZXR1cm4gJ2J1aWx0aW4nO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RvQ3VzdG9tQWdlbnREdG8oYWdlbnQ6IElDdXN0b21BZ2VudCk6IElDdXN0b21BZ2VudER0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogYWdlbnQudXJpLFxuXHRcdFx0bmFtZTogYWdlbnQubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbixcblx0XHRcdHNvdXJjZTogdGhpcy5fdG9DaGF0UmVzb3VyY2VTb3VyY2UoYWdlbnQuc291cmNlLnN0b3JhZ2UpLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGFnZW50LnNvdXJjZS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24gPyBhZ2VudC5zb3VyY2UuZXh0ZW5zaW9uSWQudmFsdWUgOiB1bmRlZmluZWQsXG5cdFx0XHRwbHVnaW5Vcmk6IGFnZW50LnNvdXJjZS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5wbHVnaW4gPyBhZ2VudC5zb3VyY2UucGx1Z2luVXJpIDogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBhZ2VudC5zZXNzaW9uVHlwZXMsXG5cdFx0XHRhcmd1bWVudEhpbnQ6IGFnZW50LmFyZ3VtZW50SGludCxcblx0XHRcdHRvb2xzOiBhZ2VudC50b29scyxcblx0XHRcdG1vZGVsOiBhZ2VudC5tb2RlbCxcblx0XHRcdHVzZXJJbnZvY2FibGU6IGFnZW50LnZpc2liaWxpdHkudXNlckludm9jYWJsZSxcblx0XHRcdGRpc2FibGVNb2RlbEludm9jYXRpb246ICFhZ2VudC52aXNpYmlsaXR5LmFnZW50SW52b2NhYmxlLFxuXHRcdFx0ZW5hYmxlZDogYWdlbnQuZW5hYmxlZCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9JbnN0cnVjdGlvbkR0byhpbnN0cnVjdGlvbjogSUluc3RydWN0aW9uRmlsZSk6IElJbnN0cnVjdGlvbkR0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogaW5zdHJ1Y3Rpb24udXJpLFxuXHRcdFx0bmFtZTogaW5zdHJ1Y3Rpb24ubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBpbnN0cnVjdGlvbi5kZXNjcmlwdGlvbixcblx0XHRcdHNvdXJjZTogdGhpcy5fdG9DaGF0UmVzb3VyY2VTb3VyY2UoaW5zdHJ1Y3Rpb24uc3RvcmFnZSksXG5cdFx0XHRleHRlbnNpb25JZDogaW5zdHJ1Y3Rpb24uZXh0ZW5zaW9uPy5pZGVudGlmaWVyLnZhbHVlLFxuXHRcdFx0cGx1Z2luVXJpOiBpbnN0cnVjdGlvbi5wbHVnaW5VcmksXG5cdFx0XHRzZXNzaW9uVHlwZXM6IGluc3RydWN0aW9uLnNlc3Npb25UeXBlcyxcblx0XHRcdHBhdHRlcm46IGluc3RydWN0aW9uLnBhdHRlcm4sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RvU2tpbGxEdG8oc2tpbGw6IElBZ2VudFNraWxsKTogSVNraWxsRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBza2lsbC51cmksXG5cdFx0XHRuYW1lOiBza2lsbC5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IHNraWxsLmRlc2NyaXB0aW9uLFxuXHRcdFx0c291cmNlOiB0aGlzLl90b0NoYXRSZXNvdXJjZVNvdXJjZShza2lsbC5zdG9yYWdlKSxcblx0XHRcdGV4dGVuc2lvbklkOiBza2lsbC5leHRlbnNpb24/LmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRwbHVnaW5Vcmk6IHNraWxsLnBsdWdpblVyaSxcblx0XHRcdHNlc3Npb25UeXBlczogc2tpbGwuc2Vzc2lvblR5cGVzLFxuXHRcdFx0dXNlckludm9jYWJsZTogc2tpbGwudXNlckludm9jYWJsZSxcblx0XHRcdGRpc2FibGVNb2RlbEludm9jYXRpb246IHNraWxsLmRpc2FibGVNb2RlbEludm9jYXRpb24sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RvU2xhc2hDb21tYW5kRHRvKHNsYXNoQ29tbWFuZDogSUNoYXRQcm9tcHRTbGFzaENvbW1hbmQpOiBJU2xhc2hDb21tYW5kRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBzbGFzaENvbW1hbmQudXJpLFxuXHRcdFx0bmFtZTogc2xhc2hDb21tYW5kLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogc2xhc2hDb21tYW5kLmRlc2NyaXB0aW9uLFxuXHRcdFx0c291cmNlOiB0aGlzLl90b0NoYXRSZXNvdXJjZVNvdXJjZShzbGFzaENvbW1hbmQuc3RvcmFnZSksXG5cdFx0XHRleHRlbnNpb25JZDogc2xhc2hDb21tYW5kLmV4dGVuc2lvbj8uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdHBsdWdpblVyaTogc2xhc2hDb21tYW5kLnBsdWdpblVyaSxcblx0XHRcdHNlc3Npb25UeXBlczogc2xhc2hDb21tYW5kLnNlc3Npb25UeXBlcyxcblx0XHRcdGFyZ3VtZW50SGludDogc2xhc2hDb21tYW5kLmFyZ3VtZW50SGludCxcblx0XHRcdHVzZXJJbnZvY2FibGU6IHNsYXNoQ29tbWFuZC51c2VySW52b2NhYmxlLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90b0hvb2tEdG8oaG9va0ZpbGU6IElQcm9tcHRQYXRoKTogSUhvb2tEdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IGhvb2tGaWxlLnVyaSxcblx0XHRcdHNlc3Npb25UeXBlczogaG9va0ZpbGUuc2Vzc2lvblR5cGVzLFxuXHRcdFx0c291cmNlOiB0aGlzLl90b0NoYXRSZXNvdXJjZVNvdXJjZShob29rRmlsZS5zdG9yYWdlKSxcblx0XHRcdGV4dGVuc2lvbklkOiBob29rRmlsZS5leHRlbnNpb24/LmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRwbHVnaW5Vcmk6IGhvb2tGaWxlLnBsdWdpblVyaSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9QbHVnaW5EdG8ocGx1Z2luOiBJQWdlbnRQbHVnaW4pOiBJUGx1Z2luRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBwbHVnaW4udXJpLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUN1c3RvbUFnZW50cyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDdXN0b21BZ2VudER0b1tdPiB7XG5cdFx0Y29uc3QgY3VzdG9tQWdlbnRzID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKHRva2VuKTtcblx0XHRyZXR1cm4gY3VzdG9tQWdlbnRzLm1hcChhZ2VudCA9PiB0aGlzLl90b0N1c3RvbUFnZW50RHRvKGFnZW50KSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUluc3RydWN0aW9ucyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElJbnN0cnVjdGlvbkR0b1tdPiB7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UuZ2V0SW5zdHJ1Y3Rpb25GaWxlcyh0b2tlbik7XG5cdFx0cmV0dXJuIGluc3RydWN0aW9ucy5tYXAoaW5zdHJ1Y3Rpb24gPT4gdGhpcy5fdG9JbnN0cnVjdGlvbkR0byhpbnN0cnVjdGlvbikpO1xuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVTa2lsbHModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2tpbGxEdG9bXT4ge1xuXHRcdGNvbnN0IHNraWxscyA9IGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmZpbmRBZ2VudFNraWxscyh0b2tlbikgPz8gW107XG5cdFx0cmV0dXJuIHNraWxscy5tYXAoc2tpbGwgPT4gdGhpcy5fdG9Ta2lsbER0byhza2lsbCkpO1xuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVTbGFzaENvbW1hbmRzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNsYXNoQ29tbWFuZER0b1tdPiB7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kcyA9IGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHModG9rZW4pO1xuXHRcdHJldHVybiBzbGFzaENvbW1hbmRzLm1hcChzbGFzaENvbW1hbmQgPT4gdGhpcy5fdG9TbGFzaENvbW1hbmREdG8oc2xhc2hDb21tYW5kKSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUhvb2tzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUhvb2tEdG9bXT4ge1xuXHRcdGNvbnN0IGhvb2tGaWxlcyA9IGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5ob29rLCB0b2tlbik7XG5cdFx0cmV0dXJuIGhvb2tGaWxlcy5tYXAoaG9va0ZpbGUgPT4gdGhpcy5fdG9Ib29rRHRvKGhvb2tGaWxlKSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZVBsdWdpbnMoX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVBsdWdpbkR0b1tdPiB7XG5cdFx0Y29uc3QgcGx1Z2lucyA9IHRoaXMuX2FnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpO1xuXHRcdHJldHVybiBwbHVnaW5zLm1hcChwbHVnaW4gPT4gdGhpcy5fdG9QbHVnaW5EdG8ocGx1Z2luKSk7XG5cdH1cblxuXG5cdCR1bnJlZ2lzdGVyQWdlbnQoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9hZ2VudHMuZGVsZXRlQW5kRGlzcG9zZShoYW5kbGUpO1xuXHR9XG5cblx0YXN5bmMgJHRyYW5zZmVyQWN0aXZlQ2hhdFNlc3Npb24odG9Xb3Jrc3BhY2U6IFVyaUNvbXBvbmVudHMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRjb25zdCBtb2RlbCA9IHdpZGdldD8udmlld01vZGVsPy5tb2RlbDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBNYWluVGhyZWFkQ2hhdCMkdHJhbnNmZXJBY3RpdmVDaGF0U2Vzc2lvbjogTm8gYWN0aXZlIGNoYXQgc2Vzc2lvbiBmb3VuZGApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2NoYXRTZXJ2aWNlLnRyYW5zZmVyQ2hhdFNlc3Npb24obW9kZWwuc2Vzc2lvblJlc291cmNlLCBVUkkucmV2aXZlKHRvV29ya3NwYWNlKSk7XG5cdH1cblxuXHRhc3luYyAkcmVnaXN0ZXJBZ2VudChoYW5kbGU6IG51bWJlciwgZXh0ZW5zaW9uOiBFeHRlbnNpb25JZGVudGlmaWVyLCBpZDogc3RyaW5nLCBtZXRhZGF0YTogSUV4dGVuc2lvbkNoYXRBZ2VudE1ldGFkYXRhLCBkeW5hbWljUHJvcHM6IElEeW5hbWljQ2hhdEFnZW50UHJvcHMgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdGNvbnN0IHN0YXRpY0FnZW50UmVnaXN0cmF0aW9uID0gdGhpcy5fY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudChpZCwgdHJ1ZSk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25SZWdpc3RyYXRpb24gPSB0aGlzLl9jaGF0U2Vzc2lvblNlcnZpY2UuZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zKCkuZmluZChjID0+IGMudHlwZSA9PT0gaWQgfHwgYy5hbHRlcm5hdGl2ZUlkcz8uaW5jbHVkZXMoaWQpKTtcblx0XHRpZiAoIXN0YXRpY0FnZW50UmVnaXN0cmF0aW9uICYmICFjaGF0U2Vzc2lvblJlZ2lzdHJhdGlvbiAmJiAhZHluYW1pY1Byb3BzKSB7XG5cdFx0XHRpZiAodGhpcy5fY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudHNCeU5hbWUoaWQpLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBMaWtlbHkgc29tZSBleHRlbnNpb24gYXV0aG9ycyB3aWxsIG5vdCBhZG9wdCB0aGUgbmV3IElELCBzbyBnaXZlIGEgaGludCBpZiB0aGV5IHJlZ2lzdGVyIGFcblx0XHRcdFx0Ly8gcGFydGljaXBhbnQgYnkgbmFtZSBpbnN0ZWFkIG9mIElELlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGNoYXRQYXJ0aWNpcGFudCBtdXN0IGJlIGRlY2xhcmVkIHdpdGggYW4gSUQgaW4gcGFja2FnZS5qc29uLiBUaGUgXCJpZFwiIHByb3BlcnR5IG1heSBiZSBtaXNzaW5nISBcIiR7aWR9XCJgKTtcblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBjaGF0UGFydGljaXBhbnQgbXVzdCBiZSBkZWNsYXJlZCBpbiBwYWNrYWdlLmpzb246ICR7aWR9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW1wbDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uID0ge1xuXHRcdFx0aW52b2tlOiBhc3luYyAocmVxdWVzdCwgcHJvZ3Jlc3MsIGhpc3RvcnksIHRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdQcm9ncmVzcy5zZXQocmVxdWVzdC5yZXF1ZXN0SWQsIHsgcHJvZ3Jlc3MsIGNoYXRTZXNzaW9uLCBpc1N1YmFnZW50OiAhIXJlcXVlc3Quc3ViQWdlbnRJbnZvY2F0aW9uSWQgfSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhdFNlc3Npb25SZXNvdXJjZSA9IHJlcXVlc3Quc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uQ29udGV4dDogSUNoYXRTZXNzaW9uQ29udGV4dER0byA9IHtcblx0XHRcdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRpc1VudGl0bGVkOiBpc1VudGl0bGVkQ2hhdFNlc3Npb24oY2hhdFNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRcdFx0XHRpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IENoYXRTZXNzaW9uT3B0aW9uc01hcC50b1N0clZhbHVlQXJyYXkodGhpcy5fY2hhdFNlc3Npb25TZXJ2aWNlLmdldFNlc3Npb25PcHRpb25zKGNoYXRTZXNzaW9uUmVzb3VyY2UpKSxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Y29uc3QgcnBjUmVzdWx0OiBJQ2hhdEFnZW50SW52b2tlUmVzdWx0IHwgdW5kZWZpbmVkID0gYXdhaXQgdGhpcy5fcHJveHkuJGludm9rZUFnZW50KGhhbmRsZSwgcmVxdWVzdCwge1xuXHRcdFx0XHRcdFx0aGlzdG9yeSxcblx0XHRcdFx0XHRcdGNoYXRTZXNzaW9uQ29udGV4dCxcblx0XHRcdFx0XHR9LCB0b2tlbik7XG5cblx0XHRcdFx0XHQvLyBTdXBwcmVzcyBleHBlY3RlZCBvcGVyYXRpb25hbCBlcnJvcnMgKHJhdGUgbGltaXRpbmcsIHF1b3RhIGV4Y2VlZGVkLCBhbmQgb3RoZXJcblx0XHRcdFx0XHQvLyB1c2VyLWFjdGlvbmFibGUgY29uZGl0aW9ucyBmbGFnZ2VkIHZpYSBgaXNFeHBlY3RlZEVycm9yYCkgZnJvbSBlcnJvciB0ZWxlbWV0cnlcblx0XHRcdFx0XHQvLyB0byBhdm9pZCBub2lzZSBpbiBlcnJvciByZXBvcnRpbmcuXG5cdFx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMTE1ODIgKHJhdGUtbGltaXRlZCBwcmVjZWRlbnQpLFxuXHRcdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMTE1ODMgKHNwYXduIGdpdCBFTk9FTlQpLFxuXHRcdFx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMTE1ODQgKG5ldHdvcmsgY29ubmVjdGl2aXR5KSxcblx0XHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzExNTg1IChFUEVSTS9wZXJtaXNzaW9uIGVycm9ycyksXG5cdFx0XHRcdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMxMTU4NiAoVU5DIGhvc3QgYWNjZXNzKSxcblx0XHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzExNTg3IChjbG91ZCBhZ2VudCBub3QgZW5hYmxlZCkuXG5cdFx0XHRcdFx0aWYgKHJwY1Jlc3VsdD8uZXJyb3JDYWxsc3RhY2sgJiYgIXJwY1Jlc3VsdC5lcnJvckRldGFpbHM/LmlzUmF0ZUxpbWl0ZWQgJiYgIXJwY1Jlc3VsdC5lcnJvckRldGFpbHM/LmlzUXVvdGFFeGNlZWRlZCAmJiAhcnBjUmVzdWx0LmVycm9yRGV0YWlscz8uaXNFeHBlY3RlZEVycm9yKSB7XG5cdFx0XHRcdFx0XHR0eXBlIENoYXRBZ2VudEVycm9yRXZlbnQgPSB7IGNhbGxzdGFjazogc3RyaW5nOyBtc2c6IHN0cmluZzsgZXJyb3JOYW1lOiBzdHJpbmc7IGFnZW50OiBzdHJpbmc7IGFnZW50RXh0ZW5zaW9uSWQ6IHN0cmluZyB9O1xuXHRcdFx0XHRcdFx0dHlwZSBDaGF0QWdlbnRFcnJvckNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdFx0XHRvd25lcjogJ2JyeWFuY2hlbi1kJztcblx0XHRcdFx0XHRcdFx0Y29tbWVudDogJ0xvZ2dlZCB3aGVuIGEgY2hhdCBhZ2VudCBoYW5kbGVyIHRocm93cyBhbiBlcnJvciB3aXRoIGEgY2FsbHN0YWNrLic7XG5cdFx0XHRcdFx0XHRcdGNhbGxzdGFjazogeyBjbGFzc2lmaWNhdGlvbjogJ0NhbGxzdGFja09yRXhjZXB0aW9uJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBjYWxsc3RhY2sgb2YgdGhlIGVycm9yLicgfTtcblx0XHRcdFx0XHRcdFx0bXNnOiB7IGNsYXNzaWZpY2F0aW9uOiAnQ2FsbHN0YWNrT3JFeGNlcHRpb24nOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGVycm9yIG1lc3NhZ2UuJyB9O1xuXHRcdFx0XHRcdFx0XHRlcnJvck5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3IgbmFtZSAoZS5nLiBUeXBlRXJyb3IsIENoYXRRdW90YUV4Y2VlZGVkKS4nIH07XG5cdFx0XHRcdFx0XHRcdGFnZW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFnZW50IHRoYXQgdGhyZXcgdGhlIGVycm9yLicgfTtcblx0XHRcdFx0XHRcdFx0YWdlbnRFeHRlbnNpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBleHRlbnNpb24gdGhhdCBjb250cmlidXRlZCB0aGUgYWdlbnQuJyB9O1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nRXJyb3IyPENoYXRBZ2VudEVycm9yRXZlbnQsIENoYXRBZ2VudEVycm9yQ2xhc3NpZmljYXRpb24+KCdjaGF0QWdlbnRFcnJvcicsIHtcblx0XHRcdFx0XHRcdFx0Y2FsbHN0YWNrOiBycGNSZXN1bHQuZXJyb3JDYWxsc3RhY2ssXG5cdFx0XHRcdFx0XHRcdG1zZzogcnBjUmVzdWx0LmVycm9yRGV0YWlscz8ubWVzc2FnZSA/PyAnJyxcblx0XHRcdFx0XHRcdFx0ZXJyb3JOYW1lOiBycGNSZXN1bHQuZXJyb3JOYW1lID8/ICcnLFxuXHRcdFx0XHRcdFx0XHRhZ2VudDogaWQsXG5cdFx0XHRcdFx0XHRcdGFnZW50RXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi52YWx1ZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFN0cmlwIHRlbGVtZXRyeS1vbmx5IGZpZWxkIGJlZm9yZSByZXR1cm5pbmcgdG8gdGhlIG1vZGVsIGxheWVyXG5cdFx0XHRcdFx0aWYgKHJwY1Jlc3VsdCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBlcnJvckNhbGxzdGFjazogXywgZXJyb3JOYW1lOiBfMiwgLi4ucmVzdWx0IH0gPSBycGNSZXN1bHQ7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb2dyZXNzLmRlbGV0ZShyZXF1ZXN0LnJlcXVlc3RJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRzZXRSZXF1ZXN0VG9vbHM6IChyZXF1ZXN0SWQsIHRvb2xzKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRzZXRSZXF1ZXN0VG9vbHMocmVxdWVzdElkLCB0b29scyk7XG5cdFx0XHR9LFxuXHRcdFx0c2V0WWllbGRSZXF1ZXN0ZWQ6IChyZXF1ZXN0SWQsIHZhbHVlKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRzZXRZaWVsZFJlcXVlc3RlZChyZXF1ZXN0SWQsIHZhbHVlKTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlRm9sbG93dXBzOiBhc3luYyAocmVxdWVzdCwgcmVzdWx0LCBoaXN0b3J5LCB0b2tlbik6IFByb21pc2U8SUNoYXRGb2xsb3d1cFtdPiA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5fYWdlbnRzLmdldChoYW5kbGUpPy5oYXNGb2xsb3d1cHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVGb2xsb3d1cHMocmVxdWVzdCwgaGFuZGxlLCByZXN1bHQsIHsgaGlzdG9yeSB9LCB0b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZUNoYXRUaXRsZTogKGhpc3RvcnksIHRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZUNoYXRUaXRsZShoYW5kbGUsIGhpc3RvcnksIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlQ2hhdFN1bW1hcnk6IChoaXN0b3J5LCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVDaGF0U3VtbWFyeShoYW5kbGUsIGhpc3RvcnksIHRva2VuKTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdC8vIERvIG5vdCBhdHRlbXB0IHRvIHJlZ2lzdGVyIG1pZ3JhdGVkIGNoYXRTZXNzaW9uIHByb3ZpZGVyc1xuXHRcdGlmIChjaGF0U2Vzc2lvblJlZ2lzdHJhdGlvbj8uYWx0ZXJuYXRpdmVJZHM/LmluY2x1ZGVzKGlkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblx0XHRpZiAoIXN0YXRpY0FnZW50UmVnaXN0cmF0aW9uICYmIGR5bmFtaWNQcm9wcykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uRGVzY3JpcHRpb24gPSB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZmluZChlID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uKSk7XG5cdFx0XHRkaXNwb3NhYmxlID0gdGhpcy5fY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckR5bmFtaWNBZ2VudChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdG5hbWU6IGR5bmFtaWNQcm9wcy5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBkeW5hbWljUHJvcHMuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbixcblx0XHRcdFx0XHRleHRlbnNpb25WZXJzaW9uOiBleHRlbnNpb25EZXNjcmlwdGlvbj8udmVyc2lvbixcblx0XHRcdFx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogZXh0ZW5zaW9uRGVzY3JpcHRpb24/LmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi52YWx1ZSxcblx0XHRcdFx0XHRleHRlbnNpb25QdWJsaXNoZXJJZDogZXh0ZW5zaW9uRGVzY3JpcHRpb24/LnB1Ymxpc2hlciA/PyAnJyxcblx0XHRcdFx0XHRwdWJsaXNoZXJEaXNwbGF5TmFtZTogZHluYW1pY1Byb3BzLnB1Ymxpc2hlck5hbWUsXG5cdFx0XHRcdFx0ZnVsbE5hbWU6IGR5bmFtaWNQcm9wcy5mdWxsTmFtZSxcblx0XHRcdFx0XHRtZXRhZGF0YTogcmV2aXZlKG1ldGFkYXRhKSxcblx0XHRcdFx0XHRzbGFzaENvbW1hbmRzOiBbXSxcblx0XHRcdFx0XHRkaXNhbWJpZ3VhdGlvbjogW10sXG5cdFx0XHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHRcdFx0bW9kZXM6IFtDaGF0TW9kZUtpbmQuQXNrLCBDaGF0TW9kZUtpbmQuQWdlbnQsIENoYXRNb2RlS2luZC5FZGl0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW1wbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpc3Bvc2FibGUgPSB0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnRJbXBsZW1lbnRhdGlvbihpZCwgaW1wbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWdlbnRzLnNldChoYW5kbGUsIHtcblx0XHRcdGlkOiBpZCxcblx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSxcblx0XHRcdGhhc0ZvbGxvd3VwczogbWV0YWRhdGEuaGFzRm9sbG93dXBzXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyAkdXBkYXRlQWdlbnQoaGFuZGxlOiBudW1iZXIsIG1ldGFkYXRhVXBkYXRlOiBJRXh0ZW5zaW9uQ2hhdEFnZW50TWV0YWRhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9hZ2VudHMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBNYWluVGhyZWFkQ2hhdEFnZW50czIjJHVwZGF0ZUFnZW50OiBObyBhZ2VudCB3aXRoIGhhbmRsZSAke2hhbmRsZX0gcmVnaXN0ZXJlZGApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRkYXRhLmhhc0ZvbGxvd3VwcyA9IG1ldGFkYXRhVXBkYXRlLmhhc0ZvbGxvd3Vwcztcblx0XHR0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLnVwZGF0ZUFnZW50KGRhdGEuaWQsIHJldml2ZShtZXRhZGF0YVVwZGF0ZSkpO1xuXHR9XG5cblx0YXN5bmMgJGhhbmRsZVByb2dyZXNzQ2h1bmsocmVxdWVzdElkOiBzdHJpbmcsIGNodW5rczogKElDaGF0UHJvZ3Jlc3NEdG8gfCBbSUNoYXRQcm9ncmVzc0R0bywgbnVtYmVyXSlbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBlbmRpbmdQcm9ncmVzcyA9IHRoaXMuX3BlbmRpbmdQcm9ncmVzcy5nZXQocmVxdWVzdElkKTtcblx0XHRpZiAoIXBlbmRpbmdQcm9ncmVzcykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBNYWluVGhyZWFkQ2hhdEFnZW50czIjJGhhbmRsZVByb2dyZXNzQ2h1bms6IE5vIHBlbmRpbmcgcHJvZ3Jlc3MgZm9yIHJlcXVlc3RJZCAke3JlcXVlc3RJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IHByb2dyZXNzLCBjaGF0U2Vzc2lvbiwgaXNTdWJhZ2VudCB9ID0gcGVuZGluZ1Byb2dyZXNzO1xuXHRcdGNvbnN0IGNoYXRQcm9ncmVzc1BhcnRzOiBJQ2hhdFByb2dyZXNzW10gPSBbXTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlID0gY2hhdFNlc3Npb24/LmdldFJlcXVlc3RzKCkuZmluZChyZXEgPT4gcmVxLmlkID09PSByZXF1ZXN0SWQpPy5yZXNwb25zZTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBjaHVua3MpIHtcblx0XHRcdGNvbnN0IFtwcm9ncmVzcywgcmVzcG9uc2VQYXJ0SGFuZGxlXSA9IEFycmF5LmlzQXJyYXkoaXRlbSkgPyBpdGVtIDogW2l0ZW1dO1xuXG5cdFx0XHRpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ2V4dGVybmFsRWRpdHMnKSB7XG5cdFx0XHRcdGlmIChjaGF0U2Vzc2lvbj8uZWRpdGluZ1Nlc3Npb24gJiYgcmVzcG9uc2VQYXJ0SGFuZGxlICE9PSB1bmRlZmluZWQgJiYgcmVzcG9uc2UpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJ0cyA9IHByb2dyZXNzLnN0YXJ0XG5cdFx0XHRcdFx0XHQ/IGF3YWl0IGNoYXRTZXNzaW9uLmVkaXRpbmdTZXNzaW9uLnN0YXJ0RXh0ZXJuYWxFZGl0cyhyZXNwb25zZSwgcmVzcG9uc2VQYXJ0SGFuZGxlLCByZXZpdmUocHJvZ3Jlc3MucmVzb3VyY2VzKSwgcHJvZ3Jlc3MudW5kb1N0b3BJZClcblx0XHRcdFx0XHRcdDogYXdhaXQgY2hhdFNlc3Npb24uZWRpdGluZ1Nlc3Npb24uc3RvcEV4dGVybmFsRWRpdHMocmVzcG9uc2UsIHJlc3BvbnNlUGFydEhhbmRsZSk7XG5cdFx0XHRcdFx0Y2hhdFByb2dyZXNzUGFydHMucHVzaCguLi5wYXJ0cyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcm9ncmVzcy5raW5kID09PSAnYmVnaW5Ub29sSW52b2NhdGlvbicpIHtcblx0XHRcdFx0Ly8gQmVnaW4gYSBzdHJlYW1pbmcgdG9vbCBpbnZvY2F0aW9uXG5cdFx0XHRcdHRoaXMuX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuYmVnaW5Ub29sQ2FsbCh7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogcHJvZ3Jlc3MudG9vbENhbGxJZCxcblx0XHRcdFx0XHR0b29sSWQ6IHByb2dyZXNzLnRvb2xOYW1lLFxuXHRcdFx0XHRcdGNoYXRSZXF1ZXN0SWQ6IHJlcXVlc3RJZCxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGNoYXRTZXNzaW9uPy5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0c3ViYWdlbnRJbnZvY2F0aW9uSWQ6IHByb2dyZXNzLnN1YmFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcm9ncmVzcy5raW5kID09PSAndXBkYXRlVG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRcdC8vIFVwZGF0ZSB0aGUgc3RyZWFtaW5nIGRhdGEgZm9yIGFuIGV4aXN0aW5nIHRvb2wgaW52b2NhdGlvblxuXHRcdFx0XHR0aGlzLl9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnVwZGF0ZVRvb2xTdHJlYW0ocHJvZ3Jlc3MudG9vbENhbGxJZCwgcHJvZ3Jlc3Muc3RyZWFtRGF0YT8ucGFydGlhbElucHV0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcm9ncmVzcy5raW5kID09PSAndXNhZ2UnKSB7XG5cdFx0XHRcdGlmIChpc1N1YmFnZW50KSB7XG5cdFx0XHRcdFx0Ly8gQSBzdWJhZ2VudCBpbnZva2VkIHZpYSBSdW5TdWJhZ2VudFRvb2wgcmV1c2VzIHRoZSBwYXJlbnQgcmVxdWVzdCBhbmRcblx0XHRcdFx0XHQvLyBoYXMgbm8gcmVxdWVzdCBtb2RlbCBvZiBpdHMgb3duLiBGb3J3YXJkIHRoZSB1c2FnZSB0byB0aGUgYWdlbnQnc1xuXHRcdFx0XHRcdC8vIHByb2dyZXNzIGNhbGxiYWNrIHNvIHRoZSBzdWJhZ2VudCB0b29sIGNhbiBzdXJmYWNlIGl0cyBjcmVkaXQgKEFJQylcblx0XHRcdFx0XHQvLyBjb3N0IG9uIGhvdmVyLCB3aXRob3V0IGluZmxhdGluZyB0aGUgcGFyZW50IHJlcXVlc3QncyBjb250ZXh0LXdpbmRvd1xuXHRcdFx0XHRcdC8vIHdpZGdldCBvciB0b2tlbiBjb3VudHMuXG5cdFx0XHRcdFx0Y2hhdFByb2dyZXNzUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0XHRraW5kOiAndXNhZ2UnLFxuXHRcdFx0XHRcdFx0cHJvbXB0VG9rZW5zOiBwcm9ncmVzcy5wcm9tcHRUb2tlbnMsXG5cdFx0XHRcdFx0XHRjb21wbGV0aW9uVG9rZW5zOiBwcm9ncmVzcy5jb21wbGV0aW9uVG9rZW5zLFxuXHRcdFx0XHRcdFx0b3V0cHV0QnVmZmVyOiBwcm9ncmVzcy5vdXRwdXRCdWZmZXIsXG5cdFx0XHRcdFx0XHRjb3BpbG90Q3JlZGl0czogcHJvZ3Jlc3MuY29waWxvdENyZWRpdHMsXG5cdFx0XHRcdFx0XHRwcm9tcHRUb2tlbkRldGFpbHM6IHByb2dyZXNzLnByb21wdFRva2VuRGV0YWlsc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0cmVzcG9uc2Uuc2V0VXNhZ2Uoe1xuXHRcdFx0XHRcdFx0a2luZDogJ3VzYWdlJyxcblx0XHRcdFx0XHRcdHByb21wdFRva2VuczogcHJvZ3Jlc3MucHJvbXB0VG9rZW5zLFxuXHRcdFx0XHRcdFx0Y29tcGxldGlvblRva2VuczogcHJvZ3Jlc3MuY29tcGxldGlvblRva2Vucyxcblx0XHRcdFx0XHRcdG91dHB1dEJ1ZmZlcjogcHJvZ3Jlc3Mub3V0cHV0QnVmZmVyLFxuXHRcdFx0XHRcdFx0Y29waWxvdENyZWRpdHM6IHByb2dyZXNzLmNvcGlsb3RDcmVkaXRzLFxuXHRcdFx0XHRcdFx0cHJvbXB0VG9rZW5EZXRhaWxzOiBwcm9ncmVzcy5wcm9tcHRUb2tlbkRldGFpbHNcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBOb24tc3ViYWdlbnQgcmVxdWVzdCB3aXRoIG5vIHJlc3BvbnNlIG1vZGVsOiB1bmV4cGVjdGVkLiBEcm9wIHRoZVxuXHRcdFx0XHRcdC8vIHVzYWdlIHJhdGhlciB0aGFuIGZvcndhcmRpbmcgaXQgYXMgYSBwcm9ncmVzcyBwYXJ0LlxuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTWFpblRocmVhZENoYXRBZ2VudHMyIyRoYW5kbGVQcm9ncmVzc0NodW5rOiBObyByZXNwb25zZSBtb2RlbCBmb3IgdXNhZ2Ugb2Ygbm9uLXN1YmFnZW50IHJlcXVlc3QgJHtyZXF1ZXN0SWR9OyBkcm9wcGluZyB1c2FnZS5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmV2aXZlZFByb2dyZXNzID0gcHJvZ3Jlc3Mua2luZCA9PT0gJ25vdGVib29rRWRpdCdcblx0XHRcdFx0PyBDaGF0Tm90ZWJvb2tFZGl0LmZyb21DaGF0RWRpdChwcm9ncmVzcylcblx0XHRcdFx0OiByZXZpdmUocHJvZ3Jlc3MpIGFzIElDaGF0UHJvZ3Jlc3M7XG5cblx0XHRcdGlmIChyZXZpdmVkUHJvZ3Jlc3Mua2luZCA9PT0gJ25vdGVib29rRWRpdCdcblx0XHRcdFx0fHwgcmV2aXZlZFByb2dyZXNzLmtpbmQgPT09ICd0ZXh0RWRpdCdcblx0XHRcdFx0fHwgcmV2aXZlZFByb2dyZXNzLmtpbmQgPT09ICdjb2RlYmxvY2tVcmknXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gbWFrZSBzdXJlIHRvIHVzZSB0aGUgY2Fub25pY2FsIHVyaVxuXHRcdFx0XHRyZXZpdmVkUHJvZ3Jlc3MudXJpID0gdGhpcy5fdXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKHJldml2ZWRQcm9ncmVzcy51cmkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzcG9uc2VQYXJ0SGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblxuXHRcdFx0XHRpZiAocmV2aXZlZFByb2dyZXNzLmtpbmQgPT09ICdwcm9ncmVzc1Rhc2snKSB7XG5cdFx0XHRcdFx0Y29uc3QgaGFuZGxlID0gcmVzcG9uc2VQYXJ0SGFuZGxlO1xuXHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlUGFydElkID0gYCR7cmVxdWVzdElkfV8ke2hhbmRsZX1gO1xuXHRcdFx0XHRcdGNvbnN0IHRhc2sgPSBuZXcgTWFpblRocmVhZENoYXRUYXNrKHJldml2ZWRQcm9ncmVzcy5jb250ZW50KTtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVUYXNrcy5zZXQocmVzcG9uc2VQYXJ0SWQsIHRhc2spO1xuXHRcdFx0XHRcdGNoYXRQcm9ncmVzc1BhcnRzLnB1c2godGFzayk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmVzcG9uc2VQYXJ0SGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCByZXNwb25zZVBhcnRJZCA9IGAke3JlcXVlc3RJZH1fJHtyZXNwb25zZVBhcnRIYW5kbGV9YDtcblx0XHRcdFx0XHRjb25zdCB0YXNrID0gdGhpcy5fYWN0aXZlVGFza3MuZ2V0KHJlc3BvbnNlUGFydElkKTtcblx0XHRcdFx0XHRzd2l0Y2ggKHJldml2ZWRQcm9ncmVzcy5raW5kKSB7XG5cdFx0XHRcdFx0XHRjYXNlICdwcm9ncmVzc1Rhc2tSZXN1bHQnOlxuXHRcdFx0XHRcdFx0XHRpZiAodGFzayAmJiByZXZpdmVkUHJvZ3Jlc3MuY29udGVudCkge1xuXHRcdFx0XHRcdFx0XHRcdHRhc2suY29tcGxldGUocmV2aXZlZFByb2dyZXNzLmNvbnRlbnQudmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVRhc2tzLmRlbGV0ZShyZXNwb25zZVBhcnRJZCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGFzaz8uY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgJ3dhcm5pbmcnOlxuXHRcdFx0XHRcdFx0Y2FzZSAncmVmZXJlbmNlJzpcblx0XHRcdFx0XHRcdFx0dGFzaz8uYWRkKHJldml2ZWRQcm9ncmVzcyk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJldml2ZWRQcm9ncmVzcy5raW5kID09PSAnaW5saW5lUmVmZXJlbmNlJyAmJiByZXZpdmVkUHJvZ3Jlc3MucmVzb2x2ZUlkICYmIHJlc3BvbnNlKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fdW5yZXNvbHZlZEFuY2hvcnMuaGFzKHJlcXVlc3RJZCkpIHtcblx0XHRcdFx0XHR0aGlzLl91bnJlc29sdmVkQW5jaG9ycy5zZXQocmVxdWVzdElkLCBuZXcgTWFwKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VucmVzb2x2ZWRBbmNob3JzLmdldChyZXF1ZXN0SWQpPy5zZXQocmV2aXZlZFByb2dyZXNzLnJlc29sdmVJZCwgeyByZXNwb25zZSB9KTtcblx0XHRcdH1cblxuXHRcdFx0Y2hhdFByb2dyZXNzUGFydHMucHVzaChyZXZpdmVkUHJvZ3Jlc3MpO1xuXHRcdH1cblxuXHRcdHByb2dyZXNzKGNoYXRQcm9ncmVzc1BhcnRzKTtcblx0fVxuXG5cdCRoYW5kbGVBbmNob3JSZXNvbHZlKHJlcXVlc3RJZDogc3RyaW5nLCBoYW5kbGU6IHN0cmluZywgcmVzb2x2ZUFuY2hvcjogRHRvPElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZT4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB1bnJlc29sdmVkQW5jaG9yc0ZvclJlcXVlc3QgPSB0aGlzLl91bnJlc29sdmVkQW5jaG9ycy5nZXQocmVxdWVzdElkKTtcblx0XHRpZiAoIXVucmVzb2x2ZWRBbmNob3JzRm9yUmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVucmVzb2x2ZWRBbmNob3IgPSB1bnJlc29sdmVkQW5jaG9yc0ZvclJlcXVlc3QuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCF1bnJlc29sdmVkQW5jaG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dW5yZXNvbHZlZEFuY2hvcnNGb3JSZXF1ZXN0LmRlbGV0ZShoYW5kbGUpO1xuXHRcdGlmICh1bnJlc29sdmVkQW5jaG9yc0ZvclJlcXVlc3Quc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fdW5yZXNvbHZlZEFuY2hvcnMuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc29sdmVBbmNob3IpIHtcblx0XHRcdGNvbnN0IHJldml2ZWRBbmNob3IgPSByZXZpdmUocmVzb2x2ZUFuY2hvcikgYXMgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlO1xuXHRcdFx0dW5yZXNvbHZlZEFuY2hvci5yZXNwb25zZS5yZXNvbHZlSW5saW5lUmVmZXJlbmNlKGhhbmRsZSwgcmV2aXZlZEFuY2hvcik7XG5cdFx0fVxuXHR9XG5cblx0JHJlZ2lzdGVyQWdlbnRDb21wbGV0aW9uc1Byb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBpZDogc3RyaW5nLCB0cmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlID0gYXN5bmMgKHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0Y29uc3QgY29tcGxldGlvbnMgPSBhd2FpdCB0aGlzLl9wcm94eS4kaW52b2tlQ29tcGxldGlvblByb3ZpZGVyKGhhbmRsZSwgcXVlcnksIHRva2VuKTtcblx0XHRcdHJldHVybiBjb21wbGV0aW9ucy5tYXAoKGMpID0+ICh7IC4uLmMsIGljb246IGMuaWNvbiA/IFRoZW1lSWNvbi5mcm9tSWQoYy5pY29uKSA6IHVuZGVmaW5lZCB9KSk7XG5cdFx0fTtcblx0XHR0aGlzLl9hZ2VudElkc1RvQ29tcGxldGlvblByb3ZpZGVycy5zZXQoaWQsIHRoaXMuX2NoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudENvbXBsZXRpb25Qcm92aWRlcihpZCwgcHJvdmlkZSkpO1xuXG5cdFx0dGhpcy5fYWdlbnRDb21wbGV0aW9uUHJvdmlkZXJzLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnY2hhdEFnZW50Q29tcGxldGlvbnM6JyArIGhhbmRsZSxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCF3aWRnZXQgfHwgIXdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0cmlnZ2VyQ2hhcnNQYXJ0ID0gdHJpZ2dlckNoYXJhY3RlcnMubWFwKGMgPT4gZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhjKSkuam9pbignJyk7XG5cdFx0XHRcdGNvbnN0IHdvcmRSZWdleCA9IG5ldyBSZWdFeHAoYFske3RyaWdnZXJDaGFyc1BhcnR9XVxcXFxTKmAsICdnJyk7XG5cdFx0XHRcdGNvbnN0IHF1ZXJ5ID0gZ2V0V29yZEF0VGV4dChwb3NpdGlvbi5jb2x1bW4sIHdvcmRSZWdleCwgbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlciksIDApPy53b3JkID8/ICcnO1xuXG5cdFx0XHRcdGlmIChxdWVyeSAmJiAhdHJpZ2dlckNoYXJhY3RlcnMuc29tZShjID0+IHF1ZXJ5LnN0YXJ0c1dpdGgoYykpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IHtcblx0XHRcdFx0XHRzZXNzaW9uVHlwZTogZ2V0Q2hhdFNlc3Npb25UeXBlKHdpZGdldC52aWV3TW9kZWwubW9kZWwuc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRQYXJzZXJDb250ZXh0O1xuXHRcdFx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpLnBhcnNlQ2hhdFJlcXVlc3RXaXRoUmVmZXJlbmNlcyhnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0KHdpZGdldCksIGdldFNlbGVjdGVkVG9vbEFuZFRvb2xTZXRzRm9yV2lkZ2V0KHdpZGdldCksIG1vZGVsLmdldFZhbHVlKCksIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIGNvbnRleHQpLnBhcnRzO1xuXHRcdFx0XHRjb25zdCBhZ2VudFBhcnQgPSBwYXJzZWRSZXF1ZXN0LmZpbmQoKHBhcnQpOiBwYXJ0IGlzIENoYXRSZXF1ZXN0QWdlbnRQYXJ0ID0+IHBhcnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50UGFydCk7XG5cdFx0XHRcdGNvbnN0IHRoaXNBZ2VudElkID0gdGhpcy5fYWdlbnRzLmdldChoYW5kbGUpPy5pZDtcblx0XHRcdFx0aWYgKGFnZW50UGFydD8uYWdlbnQuaWQgIT09IHRoaXNBZ2VudElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIHdvcmRSZWdleCk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGUocXVlcnksIHRva2VuKTtcblx0XHRcdFx0Y29uc3QgdmFyaWFibGVJdGVtcyA9IHJlc3VsdC5tYXAodiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaW5zZXJ0VGV4dCA9IHYuaW5zZXJ0VGV4dCA/PyAodHlwZW9mIHYubGFiZWwgPT09ICdzdHJpbmcnID8gdi5sYWJlbCA6IHYubGFiZWwubGFiZWwpO1xuXHRcdFx0XHRcdGNvbnN0IHJhbmdlQWZ0ZXJJbnNlcnQgPSBuZXcgUmFuZ2UocmFuZ2UuaW5zZXJ0LnN0YXJ0TGluZU51bWJlciwgcmFuZ2UuaW5zZXJ0LnN0YXJ0Q29sdW1uLCByYW5nZS5pbnNlcnQuZW5kTGluZU51bWJlciwgcmFuZ2UuaW5zZXJ0LnN0YXJ0Q29sdW1uICsgaW5zZXJ0VGV4dC5sZW5ndGgpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsYWJlbDogdi5sYWJlbCxcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogaW5zZXJ0VGV4dCArICcgJyxcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LFxuXHRcdFx0XHRcdFx0ZGV0YWlsOiB2LmRldGFpbCxcblx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IHYuZG9jdW1lbnRhdGlvbixcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IHsgaWQ6IEFkZER5bmFtaWNWYXJpYWJsZUFjdGlvbi5JRCwgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFt7IGlkOiB2LmlkLCB3aWRnZXQsIHJhbmdlOiByYW5nZUFmdGVySW5zZXJ0LCB2YXJpYWJsZURhdGE6IHJldml2ZSh2LnZhbHVlKSwgY29tbWFuZDogdi5jb21tYW5kIH0gc2F0aXNmaWVzIElBZGREeW5hbWljVmFyaWFibGVDb250ZXh0XSB9XG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgQ29tcGxldGlvbkl0ZW07XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IHZhcmlhYmxlSXRlbXNcblx0XHRcdFx0fSBzYXRpc2ZpZXMgQ29tcGxldGlvbkxpc3Q7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0JHVucmVnaXN0ZXJBZ2VudENvbXBsZXRpb25zUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9hZ2VudENvbXBsZXRpb25Qcm92aWRlcnMuZGVsZXRlQW5kRGlzcG9zZShoYW5kbGUpO1xuXHRcdHRoaXMuX2FnZW50SWRzVG9Db21wbGV0aW9uUHJvdmlkZXJzLmRlbGV0ZUFuZERpc3Bvc2UoaWQpO1xuXHR9XG5cblx0JHJlZ2lzdGVyQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcnMuc2V0KGhhbmRsZSwgdGhpcy5fY2hhdEFnZW50U2VydmljZS5yZWdpc3RlckNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKGhhbmRsZSxcblx0XHRcdHtcblx0XHRcdFx0cHJvdmlkZVBhcnRpY2lwYW50RGV0ZWN0aW9uOiBhc3luYyAocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgb3B0aW9uczogeyBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb247IHBhcnRpY2lwYW50czogSUNoYXRQYXJ0aWNpcGFudE1ldGFkYXRhW10gfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3Byb3h5LiRkZXRlY3RDaGF0UGFydGljaXBhbnQoaGFuZGxlLCByZXF1ZXN0LCB7IGhpc3RvcnkgfSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cdH1cblxuXHQkdW5yZWdpc3RlckNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXJzLmRlbGV0ZUFuZERpc3Bvc2UoaGFuZGxlKTtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihoYW5kbGU6IG51bWJlciwgdHlwZTogc3RyaW5nLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uKGV4dGVuc2lvbklkLnZhbHVlKTtcblx0XHRpZiAoIWV4dGVuc2lvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW01haW5UaHJlYWRDaGF0QWdlbnRzMl0gQ291bGQgbm90IGZpbmQgZXh0ZW5zaW9uIGZvciBwcm9tcHQgZmlsZSBwcm92aWRlcjogJHtleHRlbnNpb25JZC52YWx1ZX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWlzVmFsaWRQcm9tcHRUeXBlKHR5cGUpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbTWFpblRocmVhZENoYXRBZ2VudHMyXSBJbnZhbGlkIGNvbnRyaWJ1dGlvbiB0eXBlOiAke3R5cGV9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0dGhpcy5fcHJvbXB0RmlsZVByb3ZpZGVyRW1pdHRlcnMuc2V0KGhhbmRsZSwgZW1pdHRlcik7XG5cblx0XHQvLyBUcmFjayBjb250ZW50IHJlZ2lzdHJhdGlvbnMgZm9yIHRoaXMgcHJvdmlkZXIgc28gdGhleSBjYW4gYmUgZGlzcG9zZWQgd2hlbiBwcm92aWRlciBpcyB1bnJlZ2lzdGVyZWRcblx0XHRjb25zdCBjb250ZW50UmVnaXN0cmF0aW9ucyA9IG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCk7XG5cdFx0dGhpcy5fcHJvbXB0RmlsZUNvbnRlbnRSZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIGNvbnRlbnRSZWdpc3RyYXRpb25zKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9wcm9tcHRzU2VydmljZS5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb24sIHR5cGUsIHtcblx0XHRcdG9uRGlkQ2hhbmdlUHJvbXB0RmlsZXM6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRwcm92aWRlUHJvbXB0RmlsZXM6IGFzeW5jIChjb250ZXh0OiBJUHJvbXB0RmlsZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250cmlidXRpb25zID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVQcm9tcHRGaWxlcyhoYW5kbGUsIHR5cGUsIGNvbnRleHQsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFjb250cmlidXRpb25zKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBDb252ZXJ0IFVyaUNvbXBvbmVudHMgdG8gVVJJIGFuZCByZWdpc3RlciBhbnkgaW5saW5lIGNvbnRlbnRcblx0XHRcdFx0cmV0dXJuIGNvbnRyaWJ1dGlvbnMubWFwKGMgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRuYW1lOiBjLm5hbWUsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYy5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdHNlc3Npb25UeXBlczogYy5zZXNzaW9uVHlwZXMsXG5cdFx0XHRcdFx0XHR3aGVuOiBjLndoZW4sXG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5yZXZpdmUoYy51cmkpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcHJvbXB0RmlsZVByb3ZpZGVycy5zZXQoaGFuZGxlLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdCR1bnJlZ2lzdGVyUHJvbXB0RmlsZVByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvbXB0RmlsZVByb3ZpZGVycy5kZWxldGVBbmREaXNwb3NlKGhhbmRsZSk7XG5cdFx0dGhpcy5fcHJvbXB0RmlsZVByb3ZpZGVyRW1pdHRlcnMuZGVsZXRlQW5kRGlzcG9zZShoYW5kbGUpO1xuXHRcdHRoaXMuX3Byb21wdEZpbGVDb250ZW50UmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKGhhbmRsZSk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VQcm9tcHRGaWxlcyhoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSB0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJFbWl0dGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoZW1pdHRlcikge1xuXHRcdFx0ZW1pdHRlci5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHJlZ2lzdGVyQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBtZXRhZGF0YTogSUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyTWV0YWRhdGFEdG8sIGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gSW4gdGhlIHNlc3Npb25zIHdpbmRvdywgb25seSBhY2NlcHQgaGFybmVzc2VzIGZvciBzZXNzaW9uIHR5cGVzIHRoYXRcblx0XHQvLyBoYXZlIGEgcmVnaXN0ZXJlZCBjb250ZW50IHByb3ZpZGVyIChpLmUuLCBjYW4gYWN0dWFsbHkgcnVuIHNlc3Npb25zKS5cblx0XHQvLyBBSFAgcmVtb3RlIHNlcnZlcnMgcmVnaXN0ZXIgZGlyZWN0bHkgdmlhIHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzLlxuXHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdyAmJiAhdGhpcy5fY2hhdFNlc3Npb25TZXJ2aWNlLmdldENvbnRlbnRQcm92aWRlclNjaGVtZXMoKS5pbmNsdWRlcyhjaGF0U2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oZXh0ZW5zaW9uSWQudmFsdWUpO1xuXHRcdGlmICghZXh0ZW5zaW9uKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbTWFpblRocmVhZENoYXRBZ2VudHMyXSBDb3VsZCBub3QgZmluZCBleHRlbnNpb24gZm9yIGN1c3RvbWl6YXRpb24gcHJvdmlkZXI6ICR7ZXh0ZW5zaW9uSWQudmFsdWV9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0dGhpcy5fY3VzdG9taXphdGlvblByb3ZpZGVyRW1pdHRlcnMuc2V0KGhhbmRsZSwgZW1pdHRlcik7XG5cblx0XHQvLyBCdWlsZCB0aGUgaXRlbSBwcm92aWRlciB0aGF0IGNhbGxzIGJhY2sgdG8gdGhlIEV4dEhvc3Rcblx0XHRjb25zdCBpdGVtUHJvdmlkZXI6IElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKHNlc3Npb25SZXNvdXJjZSwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoaGFuZGxlLCBzZXNzaW9uUmVzb3VyY2UsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGl0ZW1zLm1hcCgoaXRlbTogSUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbkl0ZW1EdG8pOiBJQ3VzdG9taXphdGlvbkl0ZW0gPT4gKHtcblx0XHRcdFx0XHR1cmk6IFVSSS5yZXZpdmUoaXRlbS51cmkpLFxuXHRcdFx0XHRcdHR5cGU6IGl0ZW0udHlwZSxcblx0XHRcdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRcdFx0c291cmNlOiBpdGVtLnNvdXJjZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRncm91cEtleTogaXRlbS5ncm91cEtleSxcblx0XHRcdFx0XHRiYWRnZTogaXRlbS5iYWRnZSxcblx0XHRcdFx0XHRiYWRnZVRvb2x0aXA6IGl0ZW0uYmFkZ2VUb29sdGlwLFxuXHRcdFx0XHRcdGV4dGVuc2lvbklkOiBpdGVtLmV4dGVuc2lvbklkLFxuXHRcdFx0XHRcdHBsdWdpblVyaTogaXRlbS5wbHVnaW5VcmkgPyBVUkkucmV2aXZlKGl0ZW0ucGx1Z2luVXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwbHVnaW5MYWJlbDogaXRlbS5wbHVnaW5MYWJlbCxcblx0XHRcdFx0XHR1c2VySW52b2NhYmxlOiBpdGVtLnVzZXJJbnZvY2FibGUsXG5cdFx0XHRcdH0pKTtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlU291cmNlRm9sZGVyczogYXN5bmMgKHNlc3Npb25SZXNvdXJjZSwgdHlwZSwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlU291cmNlRm9sZGVycyhoYW5kbGUsIHNlc3Npb25SZXNvdXJjZSwgdHlwZSwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIWZvbGRlcnMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmb2xkZXJzLm1hcChmb2xkZXIgPT4gKHtcblx0XHRcdFx0XHR1cmk6IFVSSS5yZXZpdmUoZm9sZGVyLnVyaSksXG5cdFx0XHRcdFx0bGFiZWw6IGZvbGRlci5sYWJlbCxcblx0XHRcdFx0XHRzb3VyY2U6IGZvbGRlci5zb3VyY2UsXG5cdFx0XHRcdH0pKTtcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdC8vIENvbnZlcnQgc3VwcG9ydGVkVHlwZXMgd2hpdGVsaXN0IHRvIGhpZGRlblNlY3Rpb25zIGJsYWNrbGlzdC5cblx0XHQvLyBTZWN0aW9ucyBub3QgaW4gdGhlIHN1cHBvcnRlZCBsaXN0IGFyZSBoaWRkZW4uIFdoZW4gc3VwcG9ydGVkVHlwZXNcblx0XHQvLyBpcyBvbWl0dGVkLCBhbGwgc2VjdGlvbnMgYXJlIHNob3duLlxuXHRcdGNvbnN0IHR5cGVUb1NlY3Rpb246IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0XHQnYWdlbnQnOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMsXG5cdFx0XHQnc2tpbGwnOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMsXG5cdFx0XHQnaW5zdHJ1Y3Rpb25zJzogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zLFxuXHRcdFx0J3Byb21wdCc6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHMsXG5cdFx0XHQnaG9vayc6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLFxuXHRcdFx0J3BsdWdpbnMnOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zLFxuXHRcdH07XG5cdFx0bGV0IGhpZGRlblNlY3Rpb25zOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRpZiAobWV0YWRhdGEuc3VwcG9ydGVkVHlwZXMpIHtcblx0XHRcdGNvbnN0IHN1cHBvcnRlZFNlY3Rpb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHQgb2YgbWV0YWRhdGEuc3VwcG9ydGVkVHlwZXMpIHtcblx0XHRcdFx0Y29uc3Qgc2VjdGlvbiA9IHR5cGVUb1NlY3Rpb25bdF07XG5cdFx0XHRcdGlmIChzZWN0aW9uKSB7XG5cdFx0XHRcdFx0c3VwcG9ydGVkU2VjdGlvbnMuYWRkKHNlY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRoaWRkZW5TZWN0aW9ucyA9IE9iamVjdC52YWx1ZXModHlwZVRvU2VjdGlvbikuZmlsdGVyKHNlY3Rpb24gPT4gIXN1cHBvcnRlZFNlY3Rpb25zLmhhcyhzZWN0aW9uKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVzY3JpcHRvcjogSUhhcm5lc3NEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6IGNoYXRTZXNzaW9uVHlwZSxcblx0XHRcdGxhYmVsOiBtZXRhZGF0YS5sYWJlbCxcblx0XHRcdGljb246IG1ldGFkYXRhLmljb25JZCA/IFRoZW1lSWNvbi5mcm9tSWQobWV0YWRhdGEuaWNvbklkKSA6IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5leHRlbnNpb25zLmlkKSxcblx0XHRcdGhpZGRlblNlY3Rpb25zLFxuXHRcdFx0aXRlbVByb3ZpZGVyLFxuXHRcdH07XG5cblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSB0aGlzLl9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoZGVzY3JpcHRvcik7XG5cdFx0dGhpcy5fY3VzdG9taXphdGlvblByb3ZpZGVycy5zZXQoaGFuZGxlLCByZWdpc3RyYXRpb24pO1xuXHR9XG5cblx0JHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25Qcm92aWRlcnMuZGVsZXRlQW5kRGlzcG9zZShoYW5kbGUpO1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25Qcm92aWRlckVtaXR0ZXJzLmRlbGV0ZUFuZERpc3Bvc2UoaGFuZGxlKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHRoaXMuX2N1c3RvbWl6YXRpb25Qcm92aWRlckVtaXR0ZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmIChlbWl0dGVyKSB7XG5cdFx0XHRlbWl0dGVyLmZpcmUoKTtcblx0XHR9XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCByZWc6IFJlZ0V4cCk6IHsgaW5zZXJ0OiBSYW5nZTsgcmVwbGFjZTogUmFuZ2UgfSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHZhcldvcmQgPSBnZXRXb3JkQXRUZXh0KHBvc2l0aW9uLmNvbHVtbiwgcmVnLCBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSwgMCk7XG5cdGlmICghdmFyV29yZCAmJiBtb2RlbC5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3NpdGlvbikud29yZCkge1xuXHRcdC8vIGluc2lkZSBhIFwibm9ybWFsXCIgd29yZFxuXHRcdHJldHVybjtcblx0fVxuXG5cdGxldCBpbnNlcnQ6IFJhbmdlO1xuXHRsZXQgcmVwbGFjZTogUmFuZ2U7XG5cdGlmICghdmFyV29yZCkge1xuXHRcdGluc2VydCA9IHJlcGxhY2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKTtcblx0fSBlbHNlIHtcblx0XHRpbnNlcnQgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRyZXBsYWNlID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHZhcldvcmQuc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHZhcldvcmQuZW5kQ29sdW1uKTtcblx0fVxuXG5cdHJldHVybiB7IGluc2VydCwgcmVwbGFjZSB9O1xufVxuXG5uYW1lc3BhY2UgQ2hhdE5vdGVib29rRWRpdCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tQ2hhdEVkaXQocGFydDogSUNoYXROb3RlYm9va0VkaXREdG8pOiBJQ2hhdE5vdGVib29rRWRpdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdub3RlYm9va0VkaXQnLFxuXHRcdFx0dXJpOiBVUkkucmV2aXZlKHBhcnQudXJpKSxcblx0XHRcdGRvbmU6IHBhcnQuZG9uZSxcblx0XHRcdGVkaXRzOiBwYXJ0LmVkaXRzLm1hcChOb3RlYm9va0R0by5mcm9tQ2VsbEVkaXRPcGVyYXRpb25EdG8pXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBRS9CLFNBQVMsWUFBWSxxQkFBa0M7QUFDdkQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXFCO0FBQzlCLFNBQTRDLDBCQUEwQztBQUV0RixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyx1QkFBdUIsK0JBQStCO0FBQy9ELFNBQVMsZ0NBQTREO0FBQ3JFLFNBQThFLHlCQUF5QjtBQUN2RyxTQUFnSCxpQkFBaUIsc0JBQXNCO0FBQ3ZKLFNBQVMsbUJBQW1CLG1CQUFtQjtBQUUvQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUE2QztBQUN0RCxTQUFTLDhCQUE4QiwyQ0FBMkM7QUFDbEYsU0FBOEcsb0JBQXlFO0FBQ3ZMLFNBQVMsdUJBQXVCLDRCQUE0QjtBQUM1RCxTQUFTLG1CQUFtQixvQkFBb0I7QUFDaEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBMEIsNEJBQTRCO0FBQ3RELFNBQVMseUJBQXlCO0FBRWxDLFNBQWtDLGdCQUE0VixtQkFBK0M7QUFDN2EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxv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QVUsT0FBTyxRQUFRLFdBQVcsRUFBRTtBQUFBLE1BQ2xHO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSxVQUFNLGVBQWUsS0FBSyw2QkFBNkIsd0JBQXdCLFVBQVU7QUFDekYsU0FBSyx3QkFBd0IsSUFBSSxRQUFRLFlBQVk7QUFBQSxFQUN0RDtBQUFBLEVBRUEsNENBQTRDLFFBQXNCO0FBQ2pFLFNBQUssd0JBQXdCLGlCQUFpQixNQUFNO0FBQ3BELFNBQUssK0JBQStCLGlCQUFpQixNQUFNO0FBQUEsRUFDNUQ7QUFBQSxFQUVBLDJCQUEyQixRQUFzQjtBQUNoRCxVQUFNLFVBQVUsS0FBSywrQkFBK0IsSUFBSSxNQUFNO0FBQzlELFFBQUksU0FBUztBQUNaLGNBQVEsS0FBSztBQUFBLElBQ2Q7QUFBQSxFQUNEO0FBQ0Q7QUF6dkJhLHdCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxxQkFBcUI7QUFBQSxFQXlCcEQ7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdENVO0FBNHZCYixTQUFTLHdCQUF3QixPQUFtQixVQUFvQixLQUE0RDtBQUNuSSxRQUFNLFVBQVUsY0FBYyxTQUFTLFFBQVEsS0FBSyxNQUFNLGVBQWUsU0FBUyxVQUFVLEdBQUcsQ0FBQztBQUNoRyxNQUFJLENBQUMsV0FBVyxNQUFNLHFCQUFxQixRQUFRLEVBQUUsTUFBTTtBQUUxRDtBQUFBLEVBQ0Q7QUFFQSxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUksQ0FBQyxTQUFTO0FBQ2IsYUFBUyxVQUFVLE1BQU0sY0FBYyxRQUFRO0FBQUEsRUFDaEQsT0FBTztBQUNOLGFBQVMsSUFBSSxNQUFNLFNBQVMsWUFBWSxRQUFRLGFBQWEsU0FBUyxZQUFZLFNBQVMsTUFBTTtBQUNqRyxjQUFVLElBQUksTUFBTSxTQUFTLFlBQVksUUFBUSxhQUFhLFNBQVMsWUFBWSxRQUFRLFNBQVM7QUFBQSxFQUNyRztBQUVBLFNBQU8sRUFBRSxRQUFRLFFBQVE7QUFDMUI7QUFFQSxJQUFVO0FBQUEsQ0FBVixDQUFVQyxzQkFBVjtBQUNRLFdBQVMsYUFBYSxNQUErQztBQUMzRSxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixLQUFLLElBQUksT0FBTyxLQUFLLEdBQUc7QUFBQSxNQUN4QixNQUFNLEtBQUs7QUFBQSxNQUNYLE9BQU8sS0FBSyxNQUFNLElBQUksWUFBWSx3QkFBd0I7QUFBQSxJQUMzRDtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxrQkFBUztBQUFBLEdBRFA7IiwKICAibmFtZXMiOiBbInByb2dyZXNzIiwgIkNoYXROb3RlYm9va0VkaXQiXQp9Cg==
