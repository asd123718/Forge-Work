import { coalesce } from "../../../base/common/arrays.js";
import { DeferredPromise, raceCancellation, raceCancellationError, timeout } from "../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { revive } from "../../../base/common/marshalling.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { assertType } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { packErrorForTelemetry } from "../../../platform/telemetry/common/errorTelemetry.js";
import { isChatViewTitleActionContext } from "../../contrib/chat/common/actions/chatActions.js";
import { ChatAgentVoteDirection } from "../../contrib/chat/common/chatService/chatService.js";
import { LocalChatSessionUri } from "../../contrib/chat/common/model/chatUri.js";
import { ChatAgentLocation } from "../../contrib/chat/common/constants.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { MainContext } from "./extHost.protocol.js";
import * as typeConvert from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { PromptsType } from "../../contrib/chat/common/promptSyntax/promptTypes.js";
class ChatAgentResponseStream {
  constructor(_extension, _request, _proxy, _commandsConverter, _sessionDisposables, _pendingCarouselResolvers, _token) {
    this._extension = _extension;
    this._request = _request;
    this._proxy = _proxy;
    this._commandsConverter = _commandsConverter;
    this._sessionDisposables = _sessionDisposables;
    this._pendingCarouselResolvers = _pendingCarouselResolvers;
    this._token = _token;
    this._stopWatch = StopWatch.create(false);
    this._isClosed = false;
  }
  close() {
    this._isClosed = true;
  }
  get timings() {
    return {
      firstProgress: this._firstProgress,
      totalElapsed: this._stopWatch.elapsed()
    };
  }
  get apiObject() {
    if (!this._apiObject) {
      let throwIfDone2 = function(source) {
        if (that._isClosed) {
          const err = new Error("Response stream has been closed");
          Error.captureStackTrace(err, source);
          throw err;
        }
      }, send2 = function(chunk, handle) {
        const newLen = sendQueue.push(handle !== void 0 ? [chunk, handle] : chunk);
        if (newLen === 1) {
          queueMicrotask(() => {
            const toNotify = notify;
            notify = [];
            that._proxy.$handleProgressChunk(that._request.requestId, sendQueue).finally(() => {
              toNotify.forEach((f) => f());
            });
            sendQueue.length = 0;
          });
        }
        if (handle !== void 0) {
          return new Promise((resolve) => {
            notify.push(resolve);
          });
        }
        return;
      };
      var throwIfDone = throwIfDone2, send = send2;
      const that = this;
      this._stopWatch.reset();
      let taskHandlePool = 0;
      const sendQueue = [];
      let notify = [];
      const _report = (progress, task) => {
        if (typeof this._firstProgress === "undefined" && (progress.kind === "markdownContent" || progress.kind === "markdownVuln" || progress.kind === "beginToolInvocation")) {
          this._firstProgress = this._stopWatch.elapsed();
        }
        if (task) {
          const myHandle = taskHandlePool++;
          const progressReporterPromise = send2(progress, myHandle);
          const progressReporter = {
            report: (p) => {
              progressReporterPromise.then(() => {
                if (extHostTypes.MarkdownString.isMarkdownString(p.value)) {
                  send2(typeConvert.ChatResponseWarningPart.from(p), myHandle);
                } else {
                  send2(typeConvert.ChatResponseReferencePart.from(p), myHandle);
                }
              });
            }
          };
          Promise.all([progressReporterPromise, task(progressReporter)]).then(([_void, res]) => {
            send2(typeConvert.ChatTaskResult.from(res), myHandle);
          });
        } else {
          send2(progress);
        }
      };
      this._apiObject = Object.freeze({
        clearToPreviousToolInvocation(reason) {
          throwIfDone2(this.markdown);
          send2({ kind: "clearToPreviousToolInvocation", reason });
          return this;
        },
        markdown(value) {
          throwIfDone2(this.markdown);
          const part = new extHostTypes.ChatResponseMarkdownPart(value);
          const dto = typeConvert.ChatResponseMarkdownPart.from(part);
          _report(dto);
          return this;
        },
        markdownWithVulnerabilities(value, vulnerabilities) {
          throwIfDone2(this.markdown);
          if (vulnerabilities) {
            checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          }
          const part = new extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart(value, vulnerabilities);
          const dto = typeConvert.ChatResponseMarkdownWithVulnerabilitiesPart.from(part);
          _report(dto);
          return this;
        },
        codeblockUri(value, isEdit) {
          throwIfDone2(this.codeblockUri);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseCodeblockUriPart(value, isEdit);
          const dto = typeConvert.ChatResponseCodeblockUriPart.from(part);
          _report(dto);
          return this;
        },
        filetree(value, baseUri) {
          throwIfDone2(this.filetree);
          const part = new extHostTypes.ChatResponseFileTreePart(value, baseUri);
          const dto = typeConvert.ChatResponseFilesPart.from(part);
          _report(dto);
          return this;
        },
        anchor(value, title) {
          const part = new extHostTypes.ChatResponseAnchorPart(value, title);
          return this.push(part);
        },
        button(value) {
          throwIfDone2(this.anchor);
          const part = new extHostTypes.ChatResponseCommandButtonPart(value);
          const dto = typeConvert.ChatResponseCommandButtonPart.from(part, that._commandsConverter, that._sessionDisposables);
          _report(dto);
          return this;
        },
        progress(value, task) {
          throwIfDone2(this.progress);
          const part = new extHostTypes.ChatResponseProgressPart2(value, task);
          const dto = task ? typeConvert.ChatTask.from(part) : typeConvert.ChatResponseProgressPart.from(part);
          _report(dto, task);
          return this;
        },
        thinkingProgress(thinkingDelta) {
          throwIfDone2(this.thinkingProgress);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseThinkingProgressPart(thinkingDelta.text ?? "", thinkingDelta.id, thinkingDelta.metadata);
          const dto = typeConvert.ChatResponseThinkingProgressPart.from(part);
          _report(dto);
          return this;
        },
        hookProgress(hookType, stopReason, systemMessage) {
          throwIfDone2(this.hookProgress);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseHookPart(hookType, stopReason, systemMessage);
          const dto = typeConvert.ChatResponseHookPart.from(part);
          _report(dto);
          return this;
        },
        voiceProgress(id, value) {
          throwIfDone2(this.voiceProgress);
          checkProposedApiEnabled(that._extension, "chatParticipantPrivate");
          const part = new extHostTypes.ChatResponseVoiceProgressPart(id, value);
          _report(typeConvert.ChatResponseVoiceProgressPart.from(part));
          return this;
        },
        warning(value) {
          throwIfDone2(this.progress);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseWarningPart(value);
          const dto = typeConvert.ChatResponseWarningPart.from(part);
          _report(dto);
          return this;
        },
        info(value) {
          throwIfDone2(this.progress);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseInfoPart(value);
          const dto = typeConvert.ChatResponseInfoPart.from(part);
          _report(dto);
          return this;
        },
        reference(value, iconPath) {
          return this.reference2(value, iconPath);
        },
        reference2(value, iconPath, options) {
          throwIfDone2(this.reference);
          if (typeof value === "object" && "variableName" in value) {
            checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          }
          if (typeof value === "object" && "variableName" in value && !value.value) {
            const matchingVarData = that._request.variables.variables.find((v) => v.name === value.variableName);
            if (matchingVarData) {
              let references;
              if (matchingVarData.references?.length) {
                references = matchingVarData.references.map((r) => ({
                  kind: "reference",
                  reference: { variableName: value.variableName, value: r.reference }
                }));
              } else {
                const part = new extHostTypes.ChatResponseReferencePart(value, iconPath, options);
                const dto = typeConvert.ChatResponseReferencePart.from(part);
                references = [dto];
              }
              references.forEach((r) => _report(r));
              return this;
            } else {
            }
          } else {
            const part = new extHostTypes.ChatResponseReferencePart(value, iconPath, options);
            const dto = typeConvert.ChatResponseReferencePart.from(part);
            _report(dto);
          }
          return this;
        },
        codeCitation(value, license, snippet) {
          throwIfDone2(this.codeCitation);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseCodeCitationPart(value, license, snippet);
          const dto = typeConvert.ChatResponseCodeCitationPart.from(part);
          _report(dto);
        },
        textEdit(target, edits) {
          throwIfDone2(this.textEdit);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseTextEditPart(target, edits);
          part.isDone = edits === true ? true : void 0;
          const dto = typeConvert.ChatResponseTextEditPart.from(part);
          _report(dto);
          return this;
        },
        notebookEdit(target, edits) {
          throwIfDone2(this.notebookEdit);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseNotebookEditPart(target, edits);
          const dto = typeConvert.ChatResponseNotebookEditPart.from(part);
          _report(dto);
          return this;
        },
        workspaceEdit(edits) {
          throwIfDone2(this.workspaceEdit);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseWorkspaceEditPart(edits);
          const dto = typeConvert.ChatResponseWorkspaceEditPart.from(part);
          _report(dto);
          return this;
        },
        async externalEdit(target, callback) {
          throwIfDone2(this.externalEdit);
          const resources = Array.isArray(target) ? target : [target];
          const operationId = taskHandlePool++;
          const undoStopId = generateUuid();
          await send2({ kind: "externalEdits", start: true, resources, undoStopId }, operationId);
          try {
            await callback();
            return undoStopId;
          } finally {
            await send2({ kind: "externalEdits", start: false, resources, undoStopId }, operationId);
          }
        },
        confirmation(title, message, data, buttons) {
          throwIfDone2(this.confirmation);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const part = new extHostTypes.ChatResponseConfirmationPart(title, message, data, buttons);
          const dto = typeConvert.ChatResponseConfirmationPart.from(part);
          _report(dto);
          return this;
        },
        async questionCarousel(questions, allowSkip = true) {
          throwIfDone2(this.questionCarousel);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const resolveId = generateUuid();
          const part = new extHostTypes.ChatResponseQuestionCarouselPart(questions, allowSkip);
          const dto = typeConvert.ChatResponseQuestionCarouselPart.from(part);
          dto.resolveId = resolveId;
          const deferred = new DeferredPromise();
          if (!that._pendingCarouselResolvers.has(that._request.requestId)) {
            that._pendingCarouselResolvers.set(that._request.requestId, /* @__PURE__ */ new Map());
          }
          that._pendingCarouselResolvers.get(that._request.requestId).set(resolveId, deferred);
          _report(dto);
          return raceCancellation(deferred.p, that._token);
        },
        beginToolInvocation(toolCallId, toolName, streamData) {
          throwIfDone2(this.beginToolInvocation);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const dto = {
            kind: "beginToolInvocation",
            toolCallId,
            toolName,
            streamData: streamData ? {
              partialInput: streamData.partialInput
            } : void 0,
            subagentInvocationId: streamData?.subagentInvocationId
          };
          _report(dto);
          return this;
        },
        updateToolInvocation(toolCallId, streamData) {
          throwIfDone2(this.updateToolInvocation);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const dto = {
            kind: "updateToolInvocation",
            toolCallId,
            streamData: {
              partialInput: streamData.partialInput
            }
          };
          _report(dto);
          return this;
        },
        push(part) {
          throwIfDone2(this.push);
          if (part instanceof extHostTypes.ChatResponseTextEditPart || part instanceof extHostTypes.ChatResponseNotebookEditPart || part instanceof extHostTypes.ChatResponseMarkdownWithVulnerabilitiesPart || part instanceof extHostTypes.ChatResponseWarningPart || part instanceof extHostTypes.ChatResponseConfirmationPart || part instanceof extHostTypes.ChatResponseQuestionCarouselPart || part instanceof extHostTypes.ChatResponseCodeCitationPart || part instanceof extHostTypes.ChatResponseMovePart || part instanceof extHostTypes.ChatResponseExtensionsPart || part instanceof extHostTypes.ChatResponseExternalEditPart || part instanceof extHostTypes.ChatResponseThinkingProgressPart || part instanceof extHostTypes.ChatResponsePullRequestPart || part instanceof extHostTypes.ChatResponseAutoModeResolutionPart || part instanceof extHostTypes.ChatResponseProgressPart2) {
            checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          }
          if (part instanceof extHostTypes.ChatResponseReferencePart) {
            this.reference2(part.value, part.iconPath, part.options);
          } else if (part instanceof extHostTypes.ChatResponseProgressPart2) {
            const dto = part.task ? typeConvert.ChatTask.from(part) : typeConvert.ChatResponseProgressPart.from(part);
            _report(dto, part.task);
          } else if (part instanceof extHostTypes.ChatResponseThinkingProgressPart) {
            const dto = typeConvert.ChatResponseThinkingProgressPart.from(part);
            _report(dto);
          } else if (part instanceof extHostTypes.ChatResponseAutoModeResolutionPart) {
            const dto = typeConvert.ChatResponseAutoModeResolutionPart.from(part);
            _report(dto);
          } else if (part instanceof extHostTypes.ChatResponseAnchorPart) {
            const dto = typeConvert.ChatResponseAnchorPart.from(part);
            if (part.resolve) {
              checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
              dto.resolveId = generateUuid();
            }
            _report(dto);
            if (part.resolve) {
              const cts = new CancellationTokenSource();
              part.resolve(cts.token).then(() => {
                const resolvedDto = typeConvert.ChatResponseAnchorPart.from(part);
                that._proxy.$handleAnchorResolve(that._request.requestId, dto.resolveId, resolvedDto);
              }).then(() => cts.dispose(), () => cts.dispose());
              that._sessionDisposables.add(toDisposable(() => cts.dispose(true)));
            }
          } else if (part instanceof extHostTypes.ChatResponseExternalEditPart) {
            const p = this.externalEdit(part.uris, part.callback);
            p.then((value) => part.didGetApplied(value));
            return this;
          } else {
            const dto = typeConvert.ChatResponsePart.from(part, that._commandsConverter, that._sessionDisposables);
            _report(dto);
          }
          return this;
        },
        usage(usage) {
          throwIfDone2(this.usage);
          checkProposedApiEnabled(that._extension, "chatParticipantAdditions");
          const dto = {
            kind: "usage",
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            outputBuffer: usage.outputBuffer,
            copilotCredits: usage.copilotCredits,
            promptTokenDetails: usage.promptTokenDetails
          };
          _report(dto);
          return this;
        }
      });
    }
    return this._apiObject;
  }
}
const _ExtHostChatAgents2 = class _ExtHostChatAgents2 extends Disposable {
  constructor(mainContext, _logService, _commands, _documents, _editorsAndDocuments, _languageModels, _diagnostics, _tools, _chatSessions) {
    super();
    this._logService = _logService;
    this._commands = _commands;
    this._documents = _documents;
    this._editorsAndDocuments = _editorsAndDocuments;
    this._languageModels = _languageModels;
    this._diagnostics = _diagnostics;
    this._tools = _tools;
    this._chatSessions = _chatSessions;
    this._agents = /* @__PURE__ */ new Map();
    this._participantDetectionProviders = /* @__PURE__ */ new Map();
    this._promptFileProviders = /* @__PURE__ */ new Map();
    this._customizationProviders = /* @__PURE__ */ new Map();
    this._sessionDisposables = this._register(new DisposableResourceMap());
    this._completionDisposables = this._register(new DisposableMap());
    this._inFlightRequests = /* @__PURE__ */ new Set();
    // Map of requestId -> resolveId -> deferred promise for question carousel answers
    this._pendingCarouselResolvers = /* @__PURE__ */ new Map();
    this._onDidChangeChatRequestTools = this._register(new Emitter());
    this.onDidChangeChatRequestTools = this._onDidChangeChatRequestTools.event;
    this._onDidDisposeChatSession = this._register(new Emitter());
    this.onDidDisposeChatSession = this._onDidDisposeChatSession.event;
    this._onDidChangeCustomAgents = this._register(new Emitter());
    this.onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;
    this._onDidChangeInstructions = this._register(new Emitter());
    this.onDidChangeInstructions = this._onDidChangeInstructions.event;
    this._onDidChangeSkills = this._register(new Emitter());
    this.onDidChangeSkills = this._onDidChangeSkills.event;
    this._onDidChangeSlashCommands = this._register(new Emitter());
    this.onDidChangeSlashCommands = this._onDidChangeSlashCommands.event;
    this._onDidChangeHooks = this._register(new Emitter());
    this.onDidChangeHooks = this._onDidChangeHooks.event;
    this._onDidChangePlugins = this._register(new Emitter());
    this.onDidChangePlugins = this._onDidChangePlugins.event;
    this._customAgents = new CachedPromise(() => this._proxy.$provideCustomAgents(CancellationToken.None).then((agents) => agents.map((agent) => this.toCustomAgent(agent))));
    this._instructions = new CachedPromise(() => this._proxy.$provideInstructions(CancellationToken.None).then((instructions) => instructions.map((instruction) => this.toInstruction(instruction))));
    this._skills = new CachedPromise(() => this._proxy.$provideSkills(CancellationToken.None).then((skills) => skills.map((skill) => this.toSkill(skill))));
    this._slashCommands = new CachedPromise(() => this._proxy.$provideSlashCommands(CancellationToken.None).then((slashCommands) => slashCommands.map((slashCommand) => this.toSlashCommand(slashCommand))));
    this._hooks = new CachedPromise(() => this._proxy.$provideHooks(CancellationToken.None).then((hooks) => hooks.map((hook) => this.toHook(hook))));
    this._plugins = new CachedPromise(() => this._proxy.$providePlugins(CancellationToken.None).then((plugins) => plugins.map((plugin) => this.toPlugin(plugin))));
    this._onDidChangeActiveChatPanelSessionResource = this._register(new Emitter());
    this.onDidChangeActiveChatPanelSessionResource = this._onDidChangeActiveChatPanelSessionResource.event;
    this._proxy = mainContext.getProxy(MainContext.MainThreadChatAgents2);
    _commands.registerArgumentProcessor({
      processArgument: (arg) => {
        if (isChatViewTitleActionContext(arg)) {
          return null;
        }
        return arg;
      }
    });
  }
  get activeChatPanelSessionResource() {
    return this._activeChatPanelSessionResource;
  }
  toCustomAgent(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      name: dto.name,
      description: dto.description,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0,
      sessionTypes: dto.sessionTypes,
      argumentHint: dto.argumentHint,
      tools: dto.tools,
      model: dto.model,
      userInvocable: dto.userInvocable,
      disableModelInvocation: dto.disableModelInvocation,
      enabled: dto.enabled
    });
  }
  toInstruction(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      name: dto.name,
      description: dto.description,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0,
      sessionTypes: dto.sessionTypes,
      pattern: dto.pattern
    });
  }
  toSkill(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      name: dto.name,
      description: dto.description,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0,
      sessionTypes: dto.sessionTypes,
      userInvocable: dto.userInvocable,
      disableModelInvocation: dto.disableModelInvocation
    });
  }
  toSlashCommand(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      name: dto.name,
      description: dto.description,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0,
      sessionTypes: dto.sessionTypes,
      argumentHint: dto.argumentHint,
      userInvocable: dto.userInvocable
    });
  }
  toHook(dto) {
    return Object.freeze({
      uri: URI.revive(dto.uri),
      sessionTypes: dto.sessionTypes,
      source: dto.source,
      extensionId: dto.extensionId,
      pluginUri: dto.pluginUri ? URI.revive(dto.pluginUri) : void 0
    });
  }
  toPlugin(dto) {
    return Object.freeze({ uri: URI.revive(dto.uri) });
  }
  provideCustomAgents(token) {
    return this._customAgents.get(token);
  }
  provideInstructions(token) {
    return this._instructions.get(token);
  }
  provideSkills(token) {
    return this._skills.get(token);
  }
  provideSlashCommands(token) {
    return this._slashCommands.get(token);
  }
  provideHooks(token) {
    return this._hooks.get(token);
  }
  providePlugins(token) {
    return this._plugins.get(token);
  }
  $onDidChangeCustomAgents() {
    this._customAgents.clear();
    this._onDidChangeCustomAgents.fire();
  }
  $onDidChangeInstructions() {
    this._instructions.clear();
    this._onDidChangeInstructions.fire();
  }
  $onDidChangeSkills() {
    this._skills.clear();
    this._onDidChangeSkills.fire();
  }
  $onDidChangeSlashCommands() {
    this._slashCommands.clear();
    this._onDidChangeSlashCommands.fire();
  }
  $onDidChangeHooks() {
    this._hooks.clear();
    this._onDidChangeHooks.fire();
  }
  $onDidChangePlugins() {
    this._plugins.clear();
    this._onDidChangePlugins.fire();
  }
  async transferActiveChat(newWorkspace) {
    await this._proxy.$transferActiveChatSession(newWorkspace);
  }
  createChatAgent(extension, id, handler) {
    const handle = _ExtHostChatAgents2._idPool++;
    const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
    this._agents.set(handle, agent);
    this._proxy.$registerAgent(handle, extension.identifier, id, {}, void 0);
    return agent.apiAgent;
  }
  createDynamicChatAgent(extension, id, dynamicProps, handler) {
    const handle = _ExtHostChatAgents2._idPool++;
    const agent = new ExtHostChatAgent(extension, id, this._proxy, handle, handler);
    this._agents.set(handle, agent);
    this._proxy.$registerAgent(handle, extension.identifier, id, { isSticky: true }, dynamicProps);
    return agent.apiAgent;
  }
  registerChatParticipantDetectionProvider(extension, provider) {
    const handle = _ExtHostChatAgents2._participantDetectionProviderIdPool++;
    this._participantDetectionProviders.set(handle, new ExtHostParticipantDetector(extension, provider));
    this._proxy.$registerChatParticipantDetectionProvider(handle);
    return toDisposable(() => {
      this._participantDetectionProviders.delete(handle);
      this._proxy.$unregisterChatParticipantDetectionProvider(handle);
    });
  }
  /**
   * Internal method that handles all prompt file provider types.
   * Routes custom agents, instructions, prompt files, and skills to the unified internal implementation.
   */
  registerPromptFileProvider(extension, type, provider) {
    const handle = _ExtHostChatAgents2._contributionsProviderIdPool++;
    this._promptFileProviders.set(handle, { extension, provider });
    this._proxy.$registerPromptFileProvider(handle, type, extension.identifier);
    const disposables = new DisposableStore();
    let changeEvent;
    switch (type) {
      case PromptsType.agent:
        changeEvent = provider.onDidChangeCustomAgents;
        break;
      case PromptsType.instructions:
        changeEvent = provider.onDidChangeInstructions;
        break;
      case PromptsType.prompt:
        changeEvent = provider.onDidChangePromptFiles;
        break;
      case PromptsType.skill:
        changeEvent = provider.onDidChangeSkills;
        break;
      case PromptsType.hook:
        changeEvent = provider.onDidChangeHooks;
        break;
    }
    if (changeEvent) {
      disposables.add(changeEvent(() => {
        this._proxy.$onDidChangePromptFiles(handle);
      }));
    }
    disposables.add(toDisposable(() => {
      this._promptFileProviders.delete(handle);
      this._proxy.$unregisterPromptFileProvider(handle);
    }));
    return disposables;
  }
  async $providePromptFiles(handle, type, context, token) {
    const providerData = this._promptFileProviders.get(handle);
    if (!providerData) {
      return void 0;
    }
    const provider = providerData.provider;
    let resources;
    switch (type) {
      case PromptsType.agent:
        resources = await provider.provideCustomAgents(context, token) ?? void 0;
        break;
      case PromptsType.instructions:
        resources = await provider.provideInstructions(context, token) ?? void 0;
        break;
      case PromptsType.prompt:
        resources = await provider.providePromptFiles(context, token) ?? void 0;
        break;
      case PromptsType.skill:
        resources = await provider.provideSkills(context, token) ?? void 0;
        break;
      case PromptsType.hook:
        resources = await provider.provideHooks(context, token) ?? void 0;
        break;
    }
    return resources;
  }
  registerChatSessionCustomizationProvider(extension, chatSessionType, metadata, provider) {
    const handle = _ExtHostChatAgents2._customizationProviderIdPool++;
    this._customizationProviders.set(handle, { extension, provider });
    const metadataDto = {
      label: metadata.label,
      iconId: metadata.iconId,
      supportedTypes: metadata.supportedTypes?.map((t) => typeConvert.ChatSessionCustomizationType.from(t))
    };
    this._proxy.$registerChatSessionCustomizationProvider(handle, chatSessionType, metadataDto, extension.identifier);
    const disposables = new DisposableStore();
    if (provider.onDidChange) {
      disposables.add(provider.onDidChange(() => {
        this._proxy.$onDidChangeCustomizations(handle);
      }));
    }
    disposables.add(toDisposable(() => {
      this._customizationProviders.delete(handle);
      this._proxy.$unregisterChatSessionCustomizationProvider(handle);
    }));
    return disposables;
  }
  async $provideChatSessionCustomizations(handle, sessionResource, token) {
    const providerData = this._customizationProviders.get(handle);
    if (!providerData) {
      return void 0;
    }
    if (!sessionResource) {
      return void 0;
    }
    try {
      const items = await providerData.provider.provideChatSessionCustomizations(URI.revive(sessionResource), token);
      if (!items) {
        return void 0;
      }
      return items.map((item) => ({
        uri: item.uri,
        type: typeConvert.ChatSessionCustomizationType.from(item.type),
        name: item.name,
        description: item.description,
        source: item.source,
        groupKey: item.groupKey,
        badge: item.badge,
        badgeTooltip: item.badgeTooltip,
        extensionId: item.extensionId,
        pluginUri: item.pluginUri,
        pluginLabel: item.pluginLabel,
        userInvocable: item.userInvocable
      }));
    } catch (err) {
      return void 0;
    }
  }
  async $provideSourceFolders(handle, sessionResource, type, token) {
    const providerData = this._customizationProviders.get(handle);
    if (!providerData?.provider.provideSourceFolders) {
      return void 0;
    }
    try {
      const folders = await providerData.provider.provideSourceFolders(URI.revive(sessionResource), typeConvert.ChatSessionCustomizationType.to(type), token);
      if (!folders) {
        return void 0;
      }
      return folders.map((folder) => ({
        uri: folder.uri,
        label: folder.label,
        source: folder.source
      }));
    } catch (err) {
      return void 0;
    }
  }
  async $detectChatParticipant(handle, requestDto, context, options, token) {
    const detector = this._participantDetectionProviders.get(handle);
    if (!detector) {
      return void 0;
    }
    const { request, location, history } = await this._createRequest(requestDto, context, detector.extension);
    const model = await this.getModelForRequest(request, detector.extension);
    const tools = await this.getToolsForRequest(detector.extension, request.userSelectedTools, model.id, token);
    const extRequest = typeConvert.ChatAgentRequest.to(
      request,
      location,
      model,
      request.modelConfiguration,
      this.getDiagnosticsWhenEnabled(detector.extension),
      tools,
      detector.extension,
      this._logService
    );
    return detector.provider.provideParticipantDetection(
      extRequest,
      { history, yieldRequested: false },
      { participants: options.participants, location: typeConvert.ChatLocation.to(options.location) },
      token
    );
  }
  async _createRequest(requestDto, context, extension) {
    const request = revive(requestDto);
    const convertedHistory = await this.prepareHistoryTurns(extension, request.agentId, context);
    let location;
    if (request.locationData?.type === ChatAgentLocation.EditorInline) {
      const document = this._documents.getDocument(request.locationData.document);
      const editor = this._editorsAndDocuments.getEditor(request.locationData.id);
      location = new extHostTypes.ChatRequestEditorData(editor.value, document, typeConvert.Selection.to(request.locationData.selection), typeConvert.Range.to(request.locationData.wholeRange));
    } else if (request.locationData?.type === ChatAgentLocation.Notebook) {
      const cell = this._documents.getDocument(request.locationData.sessionInputUri);
      location = new extHostTypes.ChatRequestNotebookData(cell);
    } else if (request.locationData?.type === ChatAgentLocation.Terminal) {
    }
    return { request, location, history: convertedHistory };
  }
  async getModelForRequest(request, extension) {
    let model;
    if (request.userSelectedModelId) {
      model = await this._languageModels.getLanguageModelByIdentifier(extension, request.userSelectedModelId);
    }
    if (!model) {
      model = await this._languageModels.getDefaultLanguageModel(extension);
      if (!model) {
        throw new Error("Language model unavailable");
      }
    }
    return model;
  }
  async $setRequestTools(requestId, tools) {
    const request = [...this._inFlightRequests].find((r) => r.requestId === requestId);
    if (!request) {
      return;
    }
    request.extRequest.tools.clear();
    const toolsMap = await this.getToolsForRequest(request.extension, tools, request.extRequest.model.id, CancellationToken.None);
    for (const [k, v] of toolsMap) {
      request.extRequest.tools.set(k, v);
    }
    this._onDidChangeChatRequestTools.fire(request.extRequest);
  }
  $setYieldRequested(requestId, value) {
    const request = [...this._inFlightRequests].find((r) => r.requestId === requestId);
    if (request) {
      request.yieldRequested = value;
    }
  }
  async $invokeAgent(handle, requestDto, context, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      throw new Error(`[CHAT](${handle}) CANNOT invoke agent because the agent is not registered`);
    }
    let stream;
    let inFlightRequest;
    try {
      const { request, location, history } = await this._createRequest(requestDto, context, agent.extension);
      let sessionDisposables = this._sessionDisposables.get(request.sessionResource);
      if (!sessionDisposables) {
        sessionDisposables = new DisposableStore();
        this._sessionDisposables.set(request.sessionResource, sessionDisposables);
      }
      stream = new ChatAgentResponseStream(agent.extension, request, this._proxy, this._commands.converter, sessionDisposables, this._pendingCarouselResolvers, token);
      const model = await this.getModelForRequest(request, agent.extension);
      const tools = await this.getToolsForRequest(agent.extension, request.userSelectedTools, model.id, token);
      const extRequest = typeConvert.ChatAgentRequest.to(
        request,
        location,
        model,
        request.modelConfiguration,
        this.getDiagnosticsWhenEnabled(agent.extension),
        tools,
        agent.extension,
        this._logService
      );
      inFlightRequest = { requestId: requestDto.requestId, extRequest, extension: agent.extension, hooks: request.hooks, yieldRequested: false };
      this._inFlightRequests.add(inFlightRequest);
      let chatSessionContext;
      if (context.chatSessionContext) {
        const sessionResource = URI.revive(context.chatSessionContext.chatSessionResource);
        const inputState = await this._chatSessions.getInputStateForSession(
          sessionResource,
          context.chatSessionContext.initialSessionOptions,
          token
        );
        chatSessionContext = {
          chatSessionItem: {
            resource: sessionResource,
            label: context.chatSessionContext.isUntitled ? "Untitled Session" : "Session"
          },
          isUntitled: context.chatSessionContext.isUntitled,
          initialSessionOptions: context.chatSessionContext.initialSessionOptions,
          inputState
        };
      }
      const chatContext = {
        history,
        chatSessionContext,
        get yieldRequested() {
          return inFlightRequest?.yieldRequested ?? false;
        }
      };
      const task = agent.invoke(
        extRequest,
        chatContext,
        stream.apiObject,
        token
      );
      return await raceCancellationWithTimeout(1e3, Promise.resolve(task).then((result) => {
        if (result?.metadata) {
          try {
            JSON.stringify(result.metadata);
          } catch (err) {
            const msg = `result.metadata MUST be JSON.stringify-able. Got error: ${err.message}`;
            this._logService.error(`[${agent.extension.identifier.value}] [@${agent.id}] ${msg}`, agent.extension);
            return { errorDetails: { message: msg }, timings: stream?.timings, nextQuestion: result.nextQuestion };
          }
        }
        let errorDetails;
        if (result?.errorDetails) {
          errorDetails = {
            ...result.errorDetails,
            responseIsIncomplete: true
          };
        }
        if (errorDetails?.responseIsRedacted || errorDetails?.isQuotaExceeded || errorDetails?.isRateLimited || errorDetails?.isExpectedError || errorDetails?.confirmationButtons || errorDetails?.code) {
          checkProposedApiEnabled(agent.extension, "chatParticipantPrivate");
        }
        return { errorDetails, timings: stream?.timings, metadata: result?.metadata, nextQuestion: result?.nextQuestion, details: result?.details };
      }), token);
    } catch (e) {
      this._logService.error(e, agent.extension);
      if (e instanceof extHostTypes.LanguageModelError && e.cause) {
        e = e.cause;
      }
      const isQuotaExceeded = e instanceof Error && e.name === "ChatQuotaExceeded";
      const isRateLimited = e instanceof Error && e.name === "ChatRateLimited";
      const isExpectedError = e instanceof Error && e.name === "ChatExpectedError";
      const { callstack: errorCallstack } = packErrorForTelemetry(e);
      const errorName = e instanceof Error ? e.name : void 0;
      return { errorDetails: { message: toErrorMessage(e), responseIsIncomplete: true, isQuotaExceeded, isRateLimited, isExpectedError }, errorCallstack, errorName };
    } finally {
      if (inFlightRequest) {
        this._inFlightRequests.delete(inFlightRequest);
      }
      const pendingResolvers = this._pendingCarouselResolvers.get(requestDto.requestId);
      if (pendingResolvers) {
        for (const deferred of pendingResolvers.values()) {
          deferred.complete(void 0);
        }
        this._pendingCarouselResolvers.delete(requestDto.requestId);
      }
      stream?.close();
    }
  }
  getDiagnosticsWhenEnabled(extension) {
    if (!isProposedApiEnabled(extension, "chatReferenceDiagnostic")) {
      return [];
    }
    return this._diagnostics.getDiagnostics();
  }
  async getToolsForRequest(extension, tools, modelId, token) {
    if (!tools) {
      return /* @__PURE__ */ new Map();
    }
    const result = /* @__PURE__ */ new Map();
    for (const tool of this._tools.getTools(extension)) {
      if (typeof tools[tool.name] === "boolean") {
        result.set(tool, tools[tool.name]);
      }
    }
    return result;
  }
  async prepareHistoryTurns(extension, agentId, context) {
    const res = [];
    for (const h of context.history) {
      const ehResult = typeConvert.ChatAgentResult.to(h.result);
      const result = agentId === h.request.agentId || isBuiltinParticipant(h.request.agentId) && isBuiltinParticipant(agentId) ? ehResult : { ...ehResult, metadata: void 0 };
      const varsWithoutTools = [];
      const toolReferences = [];
      for (const v of h.request.variables.variables) {
        if (v.kind === "tool") {
          toolReferences.push(typeConvert.ChatLanguageModelToolReference.to(v));
        } else if (v.kind === "toolset") {
          toolReferences.push(...v.value.map(typeConvert.ChatLanguageModelToolReference.to));
        } else {
          varsWithoutTools.push(...typeConvert.ChatPromptReference.toReferences(v, this.getDiagnosticsWhenEnabled(extension), this._logService));
        }
      }
      const editedFileEvents = isProposedApiEnabled(extension, "chatParticipantPrivate") ? h.request.editedFileEvents : void 0;
      const modeInstructions2 = isProposedApiEnabled(extension, "chatParticipantPrivate") && h.request.modeInstructions ? typeConvert.ChatRequestModeInstructions.to(h.request.modeInstructions) : void 0;
      const turn = new extHostTypes.ChatRequestTurn(h.request.message, h.request.command, varsWithoutTools, h.request.agentId, toolReferences, editedFileEvents, h.request.requestId, void 0, modeInstructions2);
      res.push(turn);
      const parts = coalesce(h.response.map((r) => typeConvert.ChatResponsePart.toContent(r, this._commands.converter)));
      res.push(new extHostTypes.ChatResponseTurn(parts, result, h.request.agentId, h.request.command));
    }
    return res;
  }
  $releaseSession(sessionResourceDto) {
    const sessionResource = URI.revive(sessionResourceDto);
    this._sessionDisposables.deleteAndDispose(sessionResource);
    const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    if (sessionId) {
      this._onDidDisposeChatSession.fire(sessionId);
    }
  }
  $acceptActiveChatSession(sessionResourceDto) {
    const sessionResource = sessionResourceDto ? URI.revive(sessionResourceDto) : void 0;
    if (this._activeChatPanelSessionResource?.toString() === sessionResource?.toString()) {
      return;
    }
    this._activeChatPanelSessionResource = sessionResource;
    this._onDidChangeActiveChatPanelSessionResource.fire(sessionResource);
  }
  async $provideFollowups(requestDto, handle, result, context, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return Promise.resolve([]);
    }
    const request = revive(requestDto);
    const convertedHistory = await this.prepareHistoryTurns(agent.extension, agent.id, context);
    const ehResult = typeConvert.ChatAgentResult.to(result);
    return (await agent.provideFollowups(ehResult, { history: convertedHistory, yieldRequested: false }, token)).filter((f) => {
      const isValid = !f.participant || Iterable.some(
        this._agents.values(),
        (a) => a.id === f.participant && ExtensionIdentifier.equals(a.extension.identifier, agent.extension.identifier)
      );
      if (!isValid) {
        this._logService.warn(`[@${agent.id}] ChatFollowup refers to an unknown participant: ${f.participant}`);
      }
      return isValid;
    }).map((f) => typeConvert.ChatFollowup.from(f, request));
  }
  $acceptFeedback(handle, result, voteAction) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return;
    }
    const ehResult = typeConvert.ChatAgentResult.to(result);
    let kind;
    switch (voteAction.direction) {
      case ChatAgentVoteDirection.Down:
        kind = extHostTypes.ChatResultFeedbackKind.Unhelpful;
        break;
      case ChatAgentVoteDirection.Up:
        kind = extHostTypes.ChatResultFeedbackKind.Helpful;
        break;
    }
    const feedback = {
      result: ehResult,
      kind
    };
    agent.acceptFeedback(Object.freeze(feedback));
  }
  $handleQuestionCarouselAnswer(requestId, resolveId, answers) {
    const requestResolvers = this._pendingCarouselResolvers.get(requestId);
    if (!requestResolvers) {
      return;
    }
    const deferred = requestResolvers.get(resolveId);
    if (deferred) {
      deferred.complete(answers);
      requestResolvers.delete(resolveId);
    }
    if (requestResolvers.size === 0) {
      this._pendingCarouselResolvers.delete(requestId);
    }
  }
  $acceptAction(handle, result, event) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return;
    }
    if (event.action.kind === "vote") {
      return;
    }
    const ehAction = typeConvert.ChatAgentUserActionEvent.to(result, event, this._commands.converter);
    if (ehAction) {
      agent.acceptAction(Object.freeze(ehAction));
    }
  }
  async $invokeCompletionProvider(handle, query, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return [];
    }
    let disposables = this._completionDisposables.get(handle);
    if (disposables) {
      disposables.clear();
    } else {
      disposables = new DisposableStore();
      this._completionDisposables.set(handle, disposables);
    }
    const items = await agent.invokeCompletionProvider(query, token);
    return items.map((i) => typeConvert.ChatAgentCompletionItem.from(i, this._commands.converter, disposables));
  }
  async $provideChatTitle(handle, context, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return;
    }
    const history = await this.prepareHistoryTurns(agent.extension, agent.id, { history: context });
    const sessionResource = context[0]?.request.sessionResource ? URI.revive(context[0].request.sessionResource) : void 0;
    return await agent.provideTitle({ history, sessionResource, yieldRequested: false }, token);
  }
  async $provideChatSummary(handle, context, token) {
    const agent = this._agents.get(handle);
    if (!agent) {
      return;
    }
    const history = await this.prepareHistoryTurns(agent.extension, agent.id, { history: context });
    const sessionResource = context[0]?.request.sessionResource ? URI.revive(context[0].request.sessionResource) : void 0;
    return await agent.provideSummary({ history, sessionResource, yieldRequested: false }, token);
  }
};
_ExtHostChatAgents2._idPool = 0;
_ExtHostChatAgents2._participantDetectionProviderIdPool = 0;
_ExtHostChatAgents2._contributionsProviderIdPool = 0;
_ExtHostChatAgents2._customizationProviderIdPool = 0;
let ExtHostChatAgents2 = _ExtHostChatAgents2;
class ExtHostParticipantDetector {
  constructor(extension, provider) {
    this.extension = extension;
    this.provider = provider;
  }
}
class ExtHostChatAgent {
  constructor(extension, id, _proxy, _handle, _requestHandler) {
    this.extension = extension;
    this.id = id;
    this._proxy = _proxy;
    this._handle = _handle;
    this._requestHandler = _requestHandler;
    this._onDidReceiveFeedback = new Emitter();
    this._onDidPerformAction = new Emitter();
    this._pauseStateEmitter = new Emitter();
  }
  acceptFeedback(feedback) {
    this._onDidReceiveFeedback.fire(feedback);
  }
  acceptAction(event) {
    this._onDidPerformAction.fire(event);
  }
  setChatRequestPauseState(pauseState) {
    this._pauseStateEmitter.fire(pauseState);
  }
  async invokeCompletionProvider(query, token) {
    if (!this._agentVariableProvider) {
      return [];
    }
    return await this._agentVariableProvider.provider.provideCompletionItems(query, token) ?? [];
  }
  async provideFollowups(result, context, token) {
    if (!this._followupProvider) {
      return [];
    }
    const followups = await this._followupProvider.provideFollowups(result, context, token);
    if (!followups) {
      return [];
    }
    return followups.filter((f) => !(f && "commandId" in f)).filter((f) => !(f && "message" in f));
  }
  async provideTitle(context, token) {
    if (!this._titleProvider) {
      return;
    }
    return await this._titleProvider.provideChatTitle(context, token) ?? void 0;
  }
  async provideSummary(context, token) {
    if (!this._summarizer) {
      return;
    }
    return await this._summarizer.provideChatSummary(context, token) ?? void 0;
  }
  get apiAgent() {
    let disposed = false;
    let updateScheduled = false;
    const updateMetadataSoon = () => {
      if (disposed) {
        return;
      }
      if (updateScheduled) {
        return;
      }
      updateScheduled = true;
      queueMicrotask(() => {
        this._proxy.$updateAgent(this._handle, {
          icon: !this._iconPath ? void 0 : this._iconPath instanceof URI ? this._iconPath : "light" in this._iconPath ? this._iconPath.light : void 0,
          iconDark: !this._iconPath ? void 0 : "dark" in this._iconPath ? this._iconPath.dark : void 0,
          themeIcon: this._iconPath instanceof extHostTypes.ThemeIcon ? this._iconPath : void 0,
          hasFollowups: this._followupProvider !== void 0,
          helpTextPrefix: !this._helpTextPrefix || typeof this._helpTextPrefix === "string" ? this._helpTextPrefix : typeConvert.MarkdownString.from(this._helpTextPrefix),
          helpTextPostfix: !this._helpTextPostfix || typeof this._helpTextPostfix === "string" ? this._helpTextPostfix : typeConvert.MarkdownString.from(this._helpTextPostfix),
          supportIssueReporting: this._supportIssueReporting,
          additionalWelcomeMessage: !this._additionalWelcomeMessage || typeof this._additionalWelcomeMessage === "string" ? this._additionalWelcomeMessage : typeConvert.MarkdownString.from(this._additionalWelcomeMessage)
        });
        updateScheduled = false;
      });
    };
    const that = this;
    return {
      get id() {
        return that.id;
      },
      get iconPath() {
        return that._iconPath;
      },
      set iconPath(v) {
        that._iconPath = v;
        updateMetadataSoon();
      },
      get requestHandler() {
        return that._requestHandler;
      },
      set requestHandler(v) {
        assertType(typeof v === "function", "Invalid request handler");
        that._requestHandler = v;
      },
      get followupProvider() {
        return that._followupProvider;
      },
      set followupProvider(v) {
        that._followupProvider = v;
        updateMetadataSoon();
      },
      get helpTextPrefix() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._helpTextPrefix;
      },
      set helpTextPrefix(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._helpTextPrefix = v;
        updateMetadataSoon();
      },
      get helpTextPostfix() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._helpTextPostfix;
      },
      set helpTextPostfix(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._helpTextPostfix = v;
        updateMetadataSoon();
      },
      get supportIssueReporting() {
        checkProposedApiEnabled(that.extension, "chatParticipantPrivate");
        return that._supportIssueReporting;
      },
      set supportIssueReporting(v) {
        checkProposedApiEnabled(that.extension, "chatParticipantPrivate");
        that._supportIssueReporting = v;
        updateMetadataSoon();
      },
      get onDidReceiveFeedback() {
        return that._onDidReceiveFeedback.event;
      },
      set participantVariableProvider(v) {
        checkProposedApiEnabled(that.extension, "chatParticipantAdditions");
        that._agentVariableProvider = v;
        if (v) {
          if (!v.triggerCharacters.length) {
            throw new Error("triggerCharacters are required");
          }
          that._proxy.$registerAgentCompletionsProvider(that._handle, that.id, v.triggerCharacters);
        } else {
          that._proxy.$unregisterAgentCompletionsProvider(that._handle, that.id);
        }
      },
      get participantVariableProvider() {
        checkProposedApiEnabled(that.extension, "chatParticipantAdditions");
        return that._agentVariableProvider;
      },
      set additionalWelcomeMessage(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._additionalWelcomeMessage = v;
        updateMetadataSoon();
      },
      get additionalWelcomeMessage() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._additionalWelcomeMessage;
      },
      set titleProvider(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._titleProvider = v;
        updateMetadataSoon();
      },
      get titleProvider() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._titleProvider;
      },
      set summarizer(v) {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        that._summarizer = v;
      },
      get summarizer() {
        checkProposedApiEnabled(that.extension, "defaultChatParticipant");
        return that._summarizer;
      },
      get onDidChangePauseState() {
        checkProposedApiEnabled(that.extension, "chatParticipantAdditions");
        return that._pauseStateEmitter.event;
      },
      onDidPerformAction: !isProposedApiEnabled(this.extension, "chatParticipantAdditions") ? void 0 : this._onDidPerformAction.event,
      dispose() {
        disposed = true;
        that._followupProvider = void 0;
        that._onDidReceiveFeedback.dispose();
        that._onDidPerformAction.dispose();
        that._pauseStateEmitter.dispose();
        that._proxy.$unregisterAgent(that._handle);
      }
    };
  }
  invoke(request, context, response, token) {
    return this._requestHandler(request, context, response, token);
  }
}
function raceCancellationWithTimeout(cancelWait, promise, token) {
  return new Promise((resolve, reject) => {
    const ref = token.onCancellationRequested(async () => {
      ref.dispose();
      await timeout(cancelWait);
      resolve(void 0);
    });
    promise.then(resolve, reject).finally(() => ref.dispose());
  });
}
class CachedPromise {
  constructor(computeFn) {
    this.computeFn = computeFn;
  }
  get(token) {
    if (!this.cachedPromise) {
      const promise = this.computeFn().catch((err) => {
        if (this.cachedPromise === promise) {
          this.cachedPromise = void 0;
        }
        throw err;
      });
      this.cachedPromise = promise;
    }
    return raceCancellationError(this.cachedPromise, token);
  }
  clear() {
    this.cachedPromise = void 0;
  }
}
function isBuiltinParticipant(agentId) {
  return agentId.startsWith("github.copilot");
}
export {
  ChatAgentResponseStream,
  ExtHostChatAgents2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Q2hhdEFnZW50czIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCByYWNlQ2FuY2VsbGF0aW9uLCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVJlc291cmNlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgYXNzZXJ0VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBJUmVsYXhlZEV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHBhY2tFcnJvckZvclRlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vZXJyb3JUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgaXNDaGF0Vmlld1RpdGxlQWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50UmVxdWVzdCwgSUNoYXRBZ2VudFJlc3VsdCwgSUNoYXRBZ2VudFJlc3VsdFRpbWluZ3MsIFVzZXJTZWxlY3RlZFRvb2xzIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uLCBJQ2hhdENvbnRlbnRSZWZlcmVuY2UsIElDaGF0Rm9sbG93dXAsIElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHMsIElDaGF0VXNlckFjdGlvbkV2ZW50LCBJQ2hhdFZvdGVBY3Rpb24gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0SG9va3MgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCwgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IER0byB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q2hhdEFnZW50c1NoYXBlMiwgSUNoYXRBZ2VudENvbXBsZXRpb25JdGVtLCBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5RHRvLCBJQ2hhdEFnZW50SW52b2tlUmVzdWx0LCBJQ2hhdEFnZW50UHJvZ3Jlc3NTaGFwZSwgSUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbkl0ZW1EdG8sIElDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlck1ldGFkYXRhRHRvLCBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uU291cmNlRm9sZGVyRHRvLCBJQ2hhdFByb2dyZXNzRHRvLCBJQ2hhdFNlc3Npb25Db250ZXh0RHRvLCBJQ3VzdG9tQWdlbnREdG8sIElFeHRlbnNpb25DaGF0QWdlbnRNZXRhZGF0YSwgSUhvb2tEdG8sIElJbnN0cnVjdGlvbkR0bywgSU1haW5Db250ZXh0LCBJUGx1Z2luRHRvLCBJU2tpbGxEdG8sIElTbGFzaENvbW1hbmREdG8sIE1haW5Db250ZXh0LCBNYWluVGhyZWFkQ2hhdEFnZW50c1NoYXBlMiB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc0NvbnZlcnRlciwgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERpYWdub3N0aWNzIH0gZnJvbSAnLi9leHRIb3N0RGlhZ25vc3RpY3MuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMgfSBmcm9tICcuL2V4dEhvc3RMYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzIH0gZnJvbSAnLi9leHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlcyBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0RmlsZUNvbnRleHQsIElQcm9tcHRGaWxlUmVzb3VyY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXRTZXNzaW9ucyB9IGZyb20gJy4vZXh0SG9zdENoYXRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdEFnZW50UmVzcG9uc2VTdHJlYW0ge1xuXG5cdHByaXZhdGUgX3N0b3BXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRwcml2YXRlIF9pc0Nsb3NlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9maXJzdFByb2dyZXNzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FwaU9iamVjdDogdnNjb2RlLkNoYXRSZXNwb25zZVN0cmVhbSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogSUNoYXRBZ2VudFByb2dyZXNzU2hhcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdDYXJvdXNlbFJlc29sdmVyczogTWFwPC8qIHJlcXVlc3RJZCAqL3N0cmluZywgTWFwPC8qIHJlc29sdmVJZCAqLyBzdHJpbmcsIERlZmVycmVkUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZD4+Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW5cblx0KSB7IH1cblxuXHRjbG9zZSgpIHtcblx0XHR0aGlzLl9pc0Nsb3NlZCA9IHRydWU7XG5cdH1cblxuXHRnZXQgdGltaW5ncygpOiBJQ2hhdEFnZW50UmVzdWx0VGltaW5ncyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZpcnN0UHJvZ3Jlc3M6IHRoaXMuX2ZpcnN0UHJvZ3Jlc3MsXG5cdFx0XHR0b3RhbEVsYXBzZWQ6IHRoaXMuX3N0b3BXYXRjaC5lbGFwc2VkKClcblx0XHR9O1xuXHR9XG5cblx0Z2V0IGFwaU9iamVjdCgpIHtcblxuXHRcdGlmICghdGhpcy5fYXBpT2JqZWN0KSB7XG5cblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0dGhpcy5fc3RvcFdhdGNoLnJlc2V0KCk7XG5cblxuXHRcdFx0bGV0IHRhc2tIYW5kbGVQb29sID0gMDtcblxuXG5cdFx0XHRmdW5jdGlvbiB0aHJvd0lmRG9uZShzb3VyY2U6IEZ1bmN0aW9uIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmICh0aGF0Ll9pc0Nsb3NlZCkge1xuXHRcdFx0XHRcdGNvbnN0IGVyciA9IG5ldyBFcnJvcignUmVzcG9uc2Ugc3RyZWFtIGhhcyBiZWVuIGNsb3NlZCcpO1xuXHRcdFx0XHRcdEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKGVyciwgc291cmNlKTtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXG5cdFx0XHRjb25zdCBzZW5kUXVldWU6IChJQ2hhdFByb2dyZXNzRHRvIHwgW0lDaGF0UHJvZ3Jlc3NEdG8sIG51bWJlcl0pW10gPSBbXTtcblx0XHRcdGxldCBub3RpZnk6IEZ1bmN0aW9uW10gPSBbXTtcblxuXHRcdFx0ZnVuY3Rpb24gc2VuZChjaHVuazogSUNoYXRQcm9ncmVzc0R0byk6IHZvaWQ7XG5cdFx0XHRmdW5jdGlvbiBzZW5kKGNodW5rOiBJQ2hhdFByb2dyZXNzRHRvLCBoYW5kbGU6IG51bWJlcik6IFByb21pc2U8dm9pZD47XG5cdFx0XHRmdW5jdGlvbiBzZW5kKGNodW5rOiBJQ2hhdFByb2dyZXNzRHRvLCBoYW5kbGU/OiBudW1iZXIpIHtcblx0XHRcdFx0Ly8gcHVzaCBkYXRhIGludG8gc2VuZCBxdWV1ZS4gdGhlIGZpcnN0IGVudHJ5IHNjaGVkdWxlcyB0aGUgbWljcm8gdGFzayB3aGljaFxuXHRcdFx0XHQvLyBkb2VzIHRoZSBhY3R1YWwgc2VuZCB0byB0aGUgbWFpbiB0aHJlYWRcblx0XHRcdFx0Y29uc3QgbmV3TGVuID0gc2VuZFF1ZXVlLnB1c2goaGFuZGxlICE9PSB1bmRlZmluZWQgPyBbY2h1bmssIGhhbmRsZV0gOiBjaHVuayk7XG5cdFx0XHRcdGlmIChuZXdMZW4gPT09IDEpIHtcblx0XHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b05vdGlmeSA9IG5vdGlmeTtcblx0XHRcdFx0XHRcdG5vdGlmeSA9IFtdO1xuXHRcdFx0XHRcdFx0dGhhdC5fcHJveHkuJGhhbmRsZVByb2dyZXNzQ2h1bmsodGhhdC5fcmVxdWVzdC5yZXF1ZXN0SWQsIHNlbmRRdWV1ZSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRvTm90aWZ5LmZvckVhY2goZiA9PiBmKCkpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRzZW5kUXVldWUubGVuZ3RoID0gMDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IG5vdGlmeS5wdXNoKHJlc29sdmUpOyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IF9yZXBvcnQgPSAocHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NEdG8sIHRhc2s/OiAocHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQgfCB2c2NvZGUuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydD4pID0+IFRoZW5hYmxlPHN0cmluZyB8IHZvaWQ+KSA9PiB7XG5cdFx0XHRcdC8vIE1lYXN1cmUgdGhlIHRpbWUgdG8gdGhlIGZpcnN0IHByb2dyZXNzIHVwZGF0ZSB3aXRoIHJlYWwgbWFya2Rvd24gY29udGVudFxuXHRcdFx0XHRpZiAodHlwZW9mIHRoaXMuX2ZpcnN0UHJvZ3Jlc3MgPT09ICd1bmRlZmluZWQnICYmIChwcm9ncmVzcy5raW5kID09PSAnbWFya2Rvd25Db250ZW50JyB8fCBwcm9ncmVzcy5raW5kID09PSAnbWFya2Rvd25WdWxuJyB8fCBwcm9ncmVzcy5raW5kID09PSAnYmVnaW5Ub29sSW52b2NhdGlvbicpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlyc3RQcm9ncmVzcyA9IHRoaXMuX3N0b3BXYXRjaC5lbGFwc2VkKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGFzaykge1xuXHRcdFx0XHRcdGNvbnN0IG15SGFuZGxlID0gdGFza0hhbmRsZVBvb2wrKztcblx0XHRcdFx0XHRjb25zdCBwcm9ncmVzc1JlcG9ydGVyUHJvbWlzZSA9IHNlbmQocHJvZ3Jlc3MsIG15SGFuZGxlKTtcblx0XHRcdFx0XHRjb25zdCBwcm9ncmVzc1JlcG9ydGVyID0ge1xuXHRcdFx0XHRcdFx0cmVwb3J0OiAocDogdnNjb2RlLkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0IHwgdnNjb2RlLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQpID0+IHtcblx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3NSZXBvcnRlclByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGV4dEhvc3RUeXBlcy5NYXJrZG93blN0cmluZy5pc01hcmtkb3duU3RyaW5nKHAudmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzZW5kKHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0LmZyb20oPHZzY29kZS5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydD5wKSwgbXlIYW5kbGUpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzZW5kKHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQuZnJvbSg8dnNjb2RlLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQ+cCksIG15SGFuZGxlKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRQcm9taXNlLmFsbChbcHJvZ3Jlc3NSZXBvcnRlclByb21pc2UsIHRhc2socHJvZ3Jlc3NSZXBvcnRlcildKS50aGVuKChbX3ZvaWQsIHJlc10pID0+IHtcblx0XHRcdFx0XHRcdHNlbmQodHlwZUNvbnZlcnQuQ2hhdFRhc2tSZXN1bHQuZnJvbShyZXMpLCBteUhhbmRsZSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2VuZChwcm9ncmVzcyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHRoaXMuX2FwaU9iamVjdCA9IE9iamVjdC5mcmVlemU8dnNjb2RlLkNoYXRSZXNwb25zZVN0cmVhbT4oe1xuXHRcdFx0XHRjbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvbihyZWFzb24pIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLm1hcmtkb3duKTtcblx0XHRcdFx0XHRzZW5kKHsga2luZDogJ2NsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uJywgcmVhc29uOiByZWFzb24gfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1hcmtkb3duKHZhbHVlKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5tYXJrZG93bik7XG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0KHZhbHVlKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VNYXJrZG93blBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllcyh2YWx1ZSwgdnVsbmVyYWJpbGl0aWVzKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5tYXJrZG93bik7XG5cdFx0XHRcdFx0aWYgKHZ1bG5lcmFiaWxpdGllcykge1xuXHRcdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzUGFydCh2YWx1ZSwgdnVsbmVyYWJpbGl0aWVzKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VNYXJrZG93bldpdGhWdWxuZXJhYmlsaXRpZXNQYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb2RlYmxvY2tVcmkodmFsdWUsIGlzRWRpdCkge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMuY29kZWJsb2NrVXJpKTtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0KHZhbHVlLCBpc0VkaXQpO1xuXHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZpbGV0cmVlKHZhbHVlLCBiYXNlVXJpKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5maWxldHJlZSk7XG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlRmlsZVRyZWVQYXJ0KHZhbHVlLCBiYXNlVXJpKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VGaWxlc1BhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFuY2hvcih2YWx1ZSwgdGl0bGU/OiBzdHJpbmcpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VBbmNob3JQYXJ0KHZhbHVlLCB0aXRsZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucHVzaChwYXJ0KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0YnV0dG9uKHZhbHVlKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5hbmNob3IpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUNvbW1hbmRCdXR0b25QYXJ0KHZhbHVlKTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydC5mcm9tKHBhcnQsIHRoYXQuX2NvbW1hbmRzQ29udmVydGVyLCB0aGF0Ll9zZXNzaW9uRGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJvZ3Jlc3ModmFsdWUsIHRhc2s/OiAoKHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLkNoYXRSZXNwb25zZVdhcm5pbmdQYXJ0PikgPT4gVGhlbmFibGU8c3RyaW5nIHwgdm9pZD4pKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5wcm9ncmVzcyk7XG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0Mih2YWx1ZSwgdGFzayk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdGFzayA/IHR5cGVDb252ZXJ0LkNoYXRUYXNrLmZyb20ocGFydCkgOiB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0bywgdGFzayk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRoaW5raW5nUHJvZ3Jlc3ModGhpbmtpbmdEZWx0YTogdnNjb2RlLlRoaW5raW5nRGVsdGEpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLnRoaW5raW5nUHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0KHRoaW5raW5nRGVsdGEudGV4dCA/PyAnJywgdGhpbmtpbmdEZWx0YS5pZCwgdGhpbmtpbmdEZWx0YS5tZXRhZGF0YSk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhvb2tQcm9ncmVzcyhob29rVHlwZTogdnNjb2RlLkNoYXRIb29rVHlwZSwgc3RvcFJlYXNvbj86IHN0cmluZywgc3lzdGVtTWVzc2FnZT86IHN0cmluZykge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMuaG9va1Byb2dyZXNzKTtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VIb29rUGFydChob29rVHlwZSwgc3RvcFJlYXNvbiwgc3lzdGVtTWVzc2FnZSk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlSG9va1BhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZvaWNlUHJvZ3Jlc3MoaWQ6IHZzY29kZS5DaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzU3RhZ2UsIHZhbHVlOiBzdHJpbmcpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLnZvaWNlUHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzUGFydChpZCwgdmFsdWUpO1xuXHRcdFx0XHRcdF9yZXBvcnQodHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQuZnJvbShwYXJ0KSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdhcm5pbmcodmFsdWUpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLnByb2dyZXNzKTtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluZm8odmFsdWUpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLnByb2dyZXNzKTtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VJbmZvUGFydCh2YWx1ZSk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlSW5mb1BhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlZmVyZW5jZSh2YWx1ZSwgaWNvblBhdGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5yZWZlcmVuY2UyKHZhbHVlLCBpY29uUGF0aCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlZmVyZW5jZTIodmFsdWUsIGljb25QYXRoLCBvcHRpb25zKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5yZWZlcmVuY2UpO1xuXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgJ3ZhcmlhYmxlTmFtZScgaW4gdmFsdWUpIHtcblx0XHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICd2YXJpYWJsZU5hbWUnIGluIHZhbHVlICYmICF2YWx1ZS52YWx1ZSkge1xuXHRcdFx0XHRcdFx0Ly8gVGhlIHBhcnRpY2lwYW50IHVzZWQgdGhpcyB2YXJpYWJsZS4gRG9lcyB0aGF0IHZhcmlhYmxlIGhhdmUgYW55IHJlZmVyZW5jZXMgdG8gcHVsbCBpbj9cblx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoaW5nVmFyRGF0YSA9IHRoYXQuX3JlcXVlc3QudmFyaWFibGVzLnZhcmlhYmxlcy5maW5kKHYgPT4gdi5uYW1lID09PSB2YWx1ZS52YXJpYWJsZU5hbWUpO1xuXHRcdFx0XHRcdFx0aWYgKG1hdGNoaW5nVmFyRGF0YSkge1xuXHRcdFx0XHRcdFx0XHRsZXQgcmVmZXJlbmNlczogRHRvPElDaGF0Q29udGVudFJlZmVyZW5jZT5bXSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKG1hdGNoaW5nVmFyRGF0YS5yZWZlcmVuY2VzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdFx0XHRyZWZlcmVuY2VzID0gbWF0Y2hpbmdWYXJEYXRhLnJlZmVyZW5jZXMubWFwKHIgPT4gKHtcblx0XHRcdFx0XHRcdFx0XHRcdGtpbmQ6ICdyZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cmVmZXJlbmNlOiB7IHZhcmlhYmxlTmFtZTogdmFsdWUudmFyaWFibGVOYW1lLCB2YWx1ZTogci5yZWZlcmVuY2UgYXMgVVJJIHwgTG9jYXRpb24gfVxuXHRcdFx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0Q29udGVudFJlZmVyZW5jZSkpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFBhcnRpY2lwYW50IHNlbnQgYSB2YXJpYWJsZU5hbWUgcmVmZXJlbmNlIGJ1dCB0aGUgdmFyaWFibGUgcHJvZHVjZWQgbm8gcmVmZXJlbmNlcy4gU2hvdyB2YXJpYWJsZSByZWZlcmVuY2Ugd2l0aCBubyB2YWx1ZVxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQodmFsdWUsIGljb25QYXRoLCBvcHRpb25zKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0XHRcdFx0cmVmZXJlbmNlcyA9IFtkdG9dO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0cmVmZXJlbmNlcy5mb3JFYWNoKHIgPT4gX3JlcG9ydChyKSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gU29tZXRoaW5nIHdlbnQgd3JvbmctIHRoYXQgdmFyaWFibGUgZG9lc24ndCBhY3R1YWxseSBleGlzdFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0KHZhbHVlLCBpY29uUGF0aCwgb3B0aW9ucyk7XG5cdFx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvZGVDaXRhdGlvbih2YWx1ZTogdnNjb2RlLlVyaSwgbGljZW5zZTogc3RyaW5nLCBzbmlwcGV0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLmNvZGVDaXRhdGlvbik7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VDb2RlQ2l0YXRpb25QYXJ0KHZhbHVlLCBsaWNlbnNlLCBzbmlwcGV0KTtcblx0XHRcdFx0XHRjb25zdCBkdG8gPSB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VDb2RlQ2l0YXRpb25QYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZXh0RWRpdCh0YXJnZXQsIGVkaXRzKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy50ZXh0RWRpdCk7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQodGFyZ2V0LCBlZGl0cyk7XG5cdFx0XHRcdFx0cGFydC5pc0RvbmUgPSBlZGl0cyA9PT0gdHJ1ZSA/IHRydWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlVGV4dEVkaXRQYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRub3RlYm9va0VkaXQodGFyZ2V0LCBlZGl0cykge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMubm90ZWJvb2tFZGl0KTtcblx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblxuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZU5vdGVib29rRWRpdFBhcnQodGFyZ2V0LCBlZGl0cyk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlTm90ZWJvb2tFZGl0UGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0d29ya3NwYWNlRWRpdChlZGl0cykge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMud29ya3NwYWNlRWRpdCk7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5fZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VXb3Jrc3BhY2VFZGl0UGFydChlZGl0cyk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlV29ya3NwYWNlRWRpdFBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFzeW5jIGV4dGVybmFsRWRpdCh0YXJnZXQsIGNhbGxiYWNrKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5leHRlcm5hbEVkaXQpO1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlcyA9IEFycmF5LmlzQXJyYXkodGFyZ2V0KSA/IHRhcmdldCA6IFt0YXJnZXRdO1xuXHRcdFx0XHRcdGNvbnN0IG9wZXJhdGlvbklkID0gdGFza0hhbmRsZVBvb2wrKztcblx0XHRcdFx0XHRjb25zdCB1bmRvU3RvcElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRcdFx0YXdhaXQgc2VuZCh7IGtpbmQ6ICdleHRlcm5hbEVkaXRzJywgc3RhcnQ6IHRydWUsIHJlc291cmNlcywgdW5kb1N0b3BJZCB9LCBvcGVyYXRpb25JZCk7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IGNhbGxiYWNrKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kb1N0b3BJZDtcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0YXdhaXQgc2VuZCh7IGtpbmQ6ICdleHRlcm5hbEVkaXRzJywgc3RhcnQ6IGZhbHNlLCByZXNvdXJjZXMsIHVuZG9TdG9wSWQgfSwgb3BlcmF0aW9uSWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Y29uZmlybWF0aW9uKHRpdGxlLCBtZXNzYWdlLCBkYXRhLCBidXR0b25zKSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5jb25maXJtYXRpb24pO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQ29uZmlybWF0aW9uUGFydCh0aXRsZSwgbWVzc2FnZSwgZGF0YSwgYnV0dG9ucyk7XG5cdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlQ29uZmlybWF0aW9uUGFydC5mcm9tKHBhcnQpO1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0YXN5bmMgcXVlc3Rpb25DYXJvdXNlbChxdWVzdGlvbnM6IHZzY29kZS5DaGF0UXVlc3Rpb25bXSwgYWxsb3dTa2lwID0gdHJ1ZSk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ+IHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLnF1ZXN0aW9uQ2Fyb3VzZWwpO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXG5cdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZUlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQocXVlc3Rpb25zLCBhbGxvd1NraXApO1xuXHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZVF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0ZHRvLnJlc29sdmVJZCA9IHJlc29sdmVJZDtcblxuXHRcdFx0XHRcdC8vIENyZWF0ZSBhIGRlZmVycmVkIHByb21pc2UgdG8gd2FpdCBmb3IgdGhlIGFuc3dlclxuXHRcdFx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZD4oKTtcblxuXHRcdFx0XHRcdC8vIFN0b3JlIHRoZSBkZWZlcnJlZCBwcm9taXNlIGZvciBsYXRlciByZXNvbHV0aW9uXG5cdFx0XHRcdFx0aWYgKCF0aGF0Ll9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMuaGFzKHRoYXQuX3JlcXVlc3QucmVxdWVzdElkKSkge1xuXHRcdFx0XHRcdFx0dGhhdC5fcGVuZGluZ0Nhcm91c2VsUmVzb2x2ZXJzLnNldCh0aGF0Ll9yZXF1ZXN0LnJlcXVlc3RJZCwgbmV3IE1hcCgpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhhdC5fcGVuZGluZ0Nhcm91c2VsUmVzb2x2ZXJzLmdldCh0aGF0Ll9yZXF1ZXN0LnJlcXVlc3RJZCkhLnNldChyZXNvbHZlSWQsIGRlZmVycmVkKTtcblxuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblxuXHRcdFx0XHRcdC8vIFdhaXQgZm9yIHRoZSB1c2VyIHRvIHN1Ym1pdCBhbnN3ZXJzLCBidXQgcmVzcGVjdCBjYW5jZWxsYXRpb25cblx0XHRcdFx0XHRyZXR1cm4gcmFjZUNhbmNlbGxhdGlvbihkZWZlcnJlZC5wLCB0aGF0Ll90b2tlbik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJlZ2luVG9vbEludm9jYXRpb24odG9vbENhbGxJZCwgdG9vbE5hbWUsIHN0cmVhbURhdGEpIHtcblx0XHRcdFx0XHR0aHJvd0lmRG9uZSh0aGlzLmJlZ2luVG9vbEludm9jYXRpb24pO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZHRvOiBJQ2hhdFByb2dyZXNzRHRvID0ge1xuXHRcdFx0XHRcdFx0a2luZDogJ2JlZ2luVG9vbEludm9jYXRpb24nLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRcdFx0c3RyZWFtRGF0YTogc3RyZWFtRGF0YSA/IHtcblx0XHRcdFx0XHRcdFx0cGFydGlhbElucHV0OiBzdHJlYW1EYXRhLnBhcnRpYWxJbnB1dFxuXHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiBzdHJlYW1EYXRhPy5zdWJhZ2VudEludm9jYXRpb25JZCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0dXBkYXRlVG9vbEludm9jYXRpb24odG9vbENhbGxJZCwgc3RyZWFtRGF0YSkge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMudXBkYXRlVG9vbEludm9jYXRpb24pO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZHRvOiBJQ2hhdFByb2dyZXNzRHRvID0ge1xuXHRcdFx0XHRcdFx0a2luZDogJ3VwZGF0ZVRvb2xJbnZvY2F0aW9uJyxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRzdHJlYW1EYXRhOiB7XG5cdFx0XHRcdFx0XHRcdHBhcnRpYWxJbnB1dDogc3RyZWFtRGF0YS5wYXJ0aWFsSW5wdXRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdFx0cHVzaChwYXJ0KSB7XG5cdFx0XHRcdFx0dGhyb3dJZkRvbmUodGhpcy5wdXNoKTtcblxuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlVGV4dEVkaXRQYXJ0IHx8XG5cdFx0XHRcdFx0XHRwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZU5vdGVib29rRWRpdFBhcnQgfHxcblx0XHRcdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzUGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0IHx8XG5cdFx0XHRcdFx0XHRwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0IHx8XG5cdFx0XHRcdFx0XHRwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUNvZGVDaXRhdGlvblBhcnQgfHxcblx0XHRcdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlTW92ZVBhcnQgfHxcblx0XHRcdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlRXh0ZW5zaW9uc1BhcnQgfHxcblx0XHRcdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlRXh0ZXJuYWxFZGl0UGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VUaGlua2luZ1Byb2dyZXNzUGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQgfHxcblx0XHRcdFx0XHRcdHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydCB8fFxuXHRcdFx0XHRcdFx0cGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQyXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0Ll9leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0KSB7XG5cdFx0XHRcdFx0XHQvLyBFbnN1cmUgdmFyaWFibGUgcmVmZXJlbmNlIHZhbHVlcyBnZXQgZml4ZWQgdXBcblx0XHRcdFx0XHRcdHRoaXMucmVmZXJlbmNlMihwYXJ0LnZhbHVlLCBwYXJ0Lmljb25QYXRoLCBwYXJ0Lm9wdGlvbnMpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkdG8gPSBwYXJ0LnRhc2sgPyB0eXBlQ29udmVydC5DaGF0VGFzay5mcm9tKHBhcnQpIDogdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0XHRfcmVwb3J0KGR0bywgcGFydC50YXNrKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlVGhpbmtpbmdQcm9ncmVzc1BhcnQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0LmZyb20ocGFydCk7XG5cdFx0XHRcdFx0XHRfcmVwb3J0KGR0byk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUF1dG9Nb2RlUmVzb2x1dGlvblBhcnQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZUF1dG9Nb2RlUmVzb2x1dGlvblBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlQW5jaG9yUGFydCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlQW5jaG9yUGFydC5mcm9tKHBhcnQpO1xuXG5cdFx0XHRcdFx0XHRpZiAocGFydC5yZXNvbHZlKSB7XG5cdFx0XHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXG5cdFx0XHRcdFx0XHRcdGR0by5yZXNvbHZlSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblxuXHRcdFx0XHRcdFx0aWYgKHBhcnQucmVzb2x2ZSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdFx0XHRcdFx0cGFydC5yZXNvbHZlKGN0cy50b2tlbilcblx0XHRcdFx0XHRcdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCByZXNvbHZlZER0byA9IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZUFuY2hvclBhcnQuZnJvbShwYXJ0KTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoYXQuX3Byb3h5LiRoYW5kbGVBbmNob3JSZXNvbHZlKHRoYXQuX3JlcXVlc3QucmVxdWVzdElkLCBkdG8ucmVzb2x2ZUlkISwgcmVzb2x2ZWREdG8pO1xuXHRcdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRcdFx0LnRoZW4oKCkgPT4gY3RzLmRpc3Bvc2UoKSwgKCkgPT4gY3RzLmRpc3Bvc2UoKSk7XG5cdFx0XHRcdFx0XHRcdHRoYXQuX3Nlc3Npb25EaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZUV4dGVybmFsRWRpdFBhcnQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHAgPSB0aGlzLmV4dGVybmFsRWRpdChwYXJ0LnVyaXMsIHBhcnQuY2FsbGJhY2spO1xuXHRcdFx0XHRcdFx0cC50aGVuKCh2YWx1ZSkgPT4gcGFydC5kaWRHZXRBcHBsaWVkKHZhbHVlKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2hhdFJlc3BvbnNlUGFydC5mcm9tKHBhcnQsIHRoYXQuX2NvbW1hbmRzQ29udmVydGVyLCB0aGF0Ll9zZXNzaW9uRGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdFx0X3JlcG9ydChkdG8pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB0aGlzO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR1c2FnZSh1c2FnZSkge1xuXHRcdFx0XHRcdHRocm93SWZEb25lKHRoaXMudXNhZ2UpO1xuXHRcdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuX2V4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZHRvOiBJQ2hhdFByb2dyZXNzRHRvID0ge1xuXHRcdFx0XHRcdFx0a2luZDogJ3VzYWdlJyxcblx0XHRcdFx0XHRcdHByb21wdFRva2VuczogdXNhZ2UucHJvbXB0VG9rZW5zLFxuXHRcdFx0XHRcdFx0Y29tcGxldGlvblRva2VuczogdXNhZ2UuY29tcGxldGlvblRva2Vucyxcblx0XHRcdFx0XHRcdG91dHB1dEJ1ZmZlcjogdXNhZ2Uub3V0cHV0QnVmZmVyLFxuXHRcdFx0XHRcdFx0Y29waWxvdENyZWRpdHM6IHVzYWdlLmNvcGlsb3RDcmVkaXRzLFxuXHRcdFx0XHRcdFx0cHJvbXB0VG9rZW5EZXRhaWxzOiB1c2FnZS5wcm9tcHRUb2tlbkRldGFpbHNcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdF9yZXBvcnQoZHRvKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9hcGlPYmplY3Q7XG5cdH1cbn1cblxuaW50ZXJmYWNlIEluRmxpZ2h0Q2hhdFJlcXVlc3Qge1xuXHRyZXF1ZXN0SWQ6IHN0cmluZztcblx0ZXh0UmVxdWVzdDogdnNjb2RlLkNoYXRSZXF1ZXN0O1xuXHRleHRlbnNpb246IElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdGhvb2tzPzogQ2hhdFJlcXVlc3RIb29rcztcblx0eWllbGRSZXF1ZXN0ZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Q2hhdEFnZW50czIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgRXh0SG9zdENoYXRBZ2VudHNTaGFwZTIge1xuXG5cdHByaXZhdGUgc3RhdGljIF9pZFBvb2wgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50cyA9IG5ldyBNYXA8bnVtYmVyLCBFeHRIb3N0Q2hhdEFnZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZENoYXRBZ2VudHNTaGFwZTI7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3BhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXJJZFBvb2wgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVycyA9IG5ldyBNYXA8bnVtYmVyLCBFeHRIb3N0UGFydGljaXBhbnREZXRlY3Rvcj4oKTtcblxuXHRwcml2YXRlIHN0YXRpYyBfY29udHJpYnV0aW9uc1Byb3ZpZGVySWRQb29sID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvbXB0RmlsZVByb3ZpZGVycyA9IG5ldyBNYXA8bnVtYmVyLCB7IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uOyBwcm92aWRlcjogdnNjb2RlLkNoYXRDdXN0b21BZ2VudFByb3ZpZGVyIHwgdnNjb2RlLkNoYXRJbnN0cnVjdGlvbnNQcm92aWRlciB8IHZzY29kZS5DaGF0UHJvbXB0RmlsZVByb3ZpZGVyIHwgdnNjb2RlLkNoYXRTa2lsbFByb3ZpZGVyIHwgdnNjb2RlLkNoYXRIb29rUHJvdmlkZXIgfT4oKTtcblxuXHRwcml2YXRlIHN0YXRpYyBfY3VzdG9taXphdGlvblByb3ZpZGVySWRQb29sID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvblByb3ZpZGVycyA9IG5ldyBNYXA8bnVtYmVyLCB7IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uOyBwcm92aWRlcjogdnNjb2RlLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyIH0+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlUmVzb3VyY2VNYXA8RGlzcG9zYWJsZVN0b3JlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzb3VyY2VNYXAoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbXBsZXRpb25EaXNwb3NhYmxlczogRGlzcG9zYWJsZU1hcDxudW1iZXIsIERpc3Bvc2FibGVTdG9yZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcCgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbkZsaWdodFJlcXVlc3RzID0gbmV3IFNldDxJbkZsaWdodENoYXRSZXF1ZXN0PigpO1xuXG5cdC8vIE1hcCBvZiByZXF1ZXN0SWQgLT4gcmVzb2x2ZUlkIC0+IGRlZmVycmVkIHByb21pc2UgZm9yIHF1ZXN0aW9uIGNhcm91c2VsIGFuc3dlcnNcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0Nhcm91c2VsUmVzb2x2ZXJzID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIERlZmVycmVkUHJvbWlzZTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZD4+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2hhdFJlcXVlc3RUb29scyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5DaGF0UmVxdWVzdD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2hhdFJlcXVlc3RUb29scyA9IHRoaXMuX29uRGlkQ2hhbmdlQ2hhdFJlcXVlc3RUb29scy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2VDaGF0U2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZUNoYXRTZXNzaW9uID0gdGhpcy5fb25EaWREaXNwb3NlQ2hhdFNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgPSB0aGlzLl9vbkRpZENoYW5nZUN1c3RvbUFnZW50cy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUluc3RydWN0aW9ucy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTa2lsbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTa2lsbHMgPSB0aGlzLl9vbkRpZENoYW5nZVNraWxscy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcyA9IHRoaXMuX29uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIb29rcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhvb2tzID0gdGhpcy5fb25EaWRDaGFuZ2VIb29rcy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQbHVnaW5zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGx1Z2lucyA9IHRoaXMuX29uRGlkQ2hhbmdlUGx1Z2lucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21BZ2VudHMgPSBuZXcgQ2FjaGVkUHJvbWlzZSgoKSA9PiB0aGlzLl9wcm94eS4kcHJvdmlkZUN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKGFnZW50cyA9PiBhZ2VudHMubWFwKGFnZW50ID0+IHRoaXMudG9DdXN0b21BZ2VudChhZ2VudCkpKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RydWN0aW9ucyA9IG5ldyBDYWNoZWRQcm9taXNlKCgpID0+IHRoaXMuX3Byb3h5LiRwcm92aWRlSW5zdHJ1Y3Rpb25zKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4oaW5zdHJ1Y3Rpb25zID0+IGluc3RydWN0aW9ucy5tYXAoaW5zdHJ1Y3Rpb24gPT4gdGhpcy50b0luc3RydWN0aW9uKGluc3RydWN0aW9uKSkpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2tpbGxzID0gbmV3IENhY2hlZFByb21pc2UoKCkgPT4gdGhpcy5fcHJveHkuJHByb3ZpZGVTa2lsbHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihza2lsbHMgPT4gc2tpbGxzLm1hcChza2lsbCA9PiB0aGlzLnRvU2tpbGwoc2tpbGwpKSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGFzaENvbW1hbmRzID0gbmV3IENhY2hlZFByb21pc2UoKCkgPT4gdGhpcy5fcHJveHkuJHByb3ZpZGVTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4oc2xhc2hDb21tYW5kcyA9PiBzbGFzaENvbW1hbmRzLm1hcChzbGFzaENvbW1hbmQgPT4gdGhpcy50b1NsYXNoQ29tbWFuZChzbGFzaENvbW1hbmQpKSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob29rcyA9IG5ldyBDYWNoZWRQcm9taXNlKCgpID0+IHRoaXMuX3Byb3h5LiRwcm92aWRlSG9va3MoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihob29rcyA9PiBob29rcy5tYXAoaG9vayA9PiB0aGlzLnRvSG9vayhob29rKSkpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGx1Z2lucyA9IG5ldyBDYWNoZWRQcm9taXNlKCgpID0+IHRoaXMuX3Byb3h5LiRwcm92aWRlUGx1Z2lucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS50aGVuKHBsdWdpbnMgPT4gcGx1Z2lucy5tYXAocGx1Z2luID0+IHRoaXMudG9QbHVnaW4ocGx1Z2luKSkpKTtcblxuXHRwcml2YXRlIF9hY3RpdmVDaGF0UGFuZWxTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSSSB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlQ2hhdFBhbmVsU2Vzc2lvblJlc291cmNlID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDaGF0UGFuZWxTZXNzaW9uUmVzb3VyY2UuZXZlbnQ7XG5cblx0Z2V0IGFjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVDaGF0UGFuZWxTZXNzaW9uUmVzb3VyY2U7XG5cdH1cblxuXG5cdHByaXZhdGUgdG9DdXN0b21BZ2VudChkdG86IElDdXN0b21BZ2VudER0byk6IHZzY29kZS5DaGF0Q3VzdG9tQWdlbnQge1xuXHRcdHJldHVybiBPYmplY3QuZnJlZXplPHZzY29kZS5DaGF0Q3VzdG9tQWdlbnQ+KHtcblx0XHRcdHVyaTogVVJJLnJldml2ZShkdG8udXJpKSxcblx0XHRcdG5hbWU6IGR0by5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGR0by5kZXNjcmlwdGlvbixcblx0XHRcdHNvdXJjZTogZHRvLnNvdXJjZSxcblx0XHRcdGV4dGVuc2lvbklkOiBkdG8uZXh0ZW5zaW9uSWQsXG5cdFx0XHRwbHVnaW5Vcmk6IGR0by5wbHVnaW5VcmkgPyBVUkkucmV2aXZlKGR0by5wbHVnaW5VcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBkdG8uc2Vzc2lvblR5cGVzLFxuXHRcdFx0YXJndW1lbnRIaW50OiBkdG8uYXJndW1lbnRIaW50LFxuXHRcdFx0dG9vbHM6IGR0by50b29scyxcblx0XHRcdG1vZGVsOiBkdG8ubW9kZWwsXG5cdFx0XHR1c2VySW52b2NhYmxlOiBkdG8udXNlckludm9jYWJsZSxcblx0XHRcdGRpc2FibGVNb2RlbEludm9jYXRpb246IGR0by5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uLFxuXHRcdFx0ZW5hYmxlZDogZHRvLmVuYWJsZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHRvSW5zdHJ1Y3Rpb24oZHRvOiBJSW5zdHJ1Y3Rpb25EdG8pOiB2c2NvZGUuQ2hhdEluc3RydWN0aW9uIHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZTx2c2NvZGUuQ2hhdEluc3RydWN0aW9uPih7XG5cdFx0XHR1cmk6IFVSSS5yZXZpdmUoZHRvLnVyaSksXG5cdFx0XHRuYW1lOiBkdG8ubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBkdG8uZGVzY3JpcHRpb24sXG5cdFx0XHRzb3VyY2U6IGR0by5zb3VyY2UsXG5cdFx0XHRleHRlbnNpb25JZDogZHRvLmV4dGVuc2lvbklkLFxuXHRcdFx0cGx1Z2luVXJpOiBkdG8ucGx1Z2luVXJpID8gVVJJLnJldml2ZShkdG8ucGx1Z2luVXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdHNlc3Npb25UeXBlczogZHRvLnNlc3Npb25UeXBlcyxcblx0XHRcdHBhdHRlcm46IGR0by5wYXR0ZXJuLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1NraWxsKGR0bzogSVNraWxsRHRvKTogdnNjb2RlLkNoYXRTa2lsbCB7XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemU8dnNjb2RlLkNoYXRTa2lsbD4oe1xuXHRcdFx0dXJpOiBVUkkucmV2aXZlKGR0by51cmkpLFxuXHRcdFx0bmFtZTogZHRvLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZHRvLmRlc2NyaXB0aW9uLFxuXHRcdFx0c291cmNlOiBkdG8uc291cmNlLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGR0by5leHRlbnNpb25JZCxcblx0XHRcdHBsdWdpblVyaTogZHRvLnBsdWdpblVyaSA/IFVSSS5yZXZpdmUoZHRvLnBsdWdpblVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IGR0by5zZXNzaW9uVHlwZXMsXG5cdFx0XHR1c2VySW52b2NhYmxlOiBkdG8udXNlckludm9jYWJsZSxcblx0XHRcdGRpc2FibGVNb2RlbEludm9jYXRpb246IGR0by5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1NsYXNoQ29tbWFuZChkdG86IElTbGFzaENvbW1hbmREdG8pOiB2c2NvZGUuQ2hhdFNsYXNoQ29tbWFuZCB7XG5cdFx0cmV0dXJuIE9iamVjdC5mcmVlemU8dnNjb2RlLkNoYXRTbGFzaENvbW1hbmQ+KHtcblx0XHRcdHVyaTogVVJJLnJldml2ZShkdG8udXJpKSxcblx0XHRcdG5hbWU6IGR0by5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGR0by5kZXNjcmlwdGlvbixcblx0XHRcdHNvdXJjZTogZHRvLnNvdXJjZSxcblx0XHRcdGV4dGVuc2lvbklkOiBkdG8uZXh0ZW5zaW9uSWQsXG5cdFx0XHRwbHVnaW5Vcmk6IGR0by5wbHVnaW5VcmkgPyBVUkkucmV2aXZlKGR0by5wbHVnaW5VcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBkdG8uc2Vzc2lvblR5cGVzLFxuXHRcdFx0YXJndW1lbnRIaW50OiBkdG8uYXJndW1lbnRIaW50LFxuXHRcdFx0dXNlckludm9jYWJsZTogZHRvLnVzZXJJbnZvY2FibGUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHRvSG9vayhkdG86IElIb29rRHRvKTogdnNjb2RlLkNoYXRIb29rIHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHR1cmk6IFVSSS5yZXZpdmUoZHRvLnVyaSksXG5cdFx0XHRzZXNzaW9uVHlwZXM6IGR0by5zZXNzaW9uVHlwZXMsXG5cdFx0XHRzb3VyY2U6IGR0by5zb3VyY2UsXG5cdFx0XHRleHRlbnNpb25JZDogZHRvLmV4dGVuc2lvbklkLFxuXHRcdFx0cGx1Z2luVXJpOiBkdG8ucGx1Z2luVXJpID8gVVJJLnJldml2ZShkdG8ucGx1Z2luVXJpKSA6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdG9QbHVnaW4oZHRvOiBJUGx1Z2luRHRvKTogdnNjb2RlLkNoYXRQbHVnaW4ge1xuXHRcdHJldHVybiBPYmplY3QuZnJlZXplKHsgdXJpOiBVUkkucmV2aXZlKGR0by51cmkpIH0pO1xuXHR9XG5cblx0cHJvdmlkZUN1c3RvbUFnZW50cyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogVGhlbmFibGU8cmVhZG9ubHkgdnNjb2RlLkNoYXRDdXN0b21BZ2VudFtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbUFnZW50cy5nZXQodG9rZW4pO1xuXHR9XG5cblx0cHJvdmlkZUluc3RydWN0aW9ucyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogVGhlbmFibGU8cmVhZG9ubHkgdnNjb2RlLkNoYXRJbnN0cnVjdGlvbltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RydWN0aW9ucy5nZXQodG9rZW4pO1xuXHR9XG5cblx0cHJvdmlkZVNraWxscyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogVGhlbmFibGU8cmVhZG9ubHkgdnNjb2RlLkNoYXRTa2lsbFtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NraWxscy5nZXQodG9rZW4pO1xuXHR9XG5cblx0cHJvdmlkZVNsYXNoQ29tbWFuZHModG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFRoZW5hYmxlPHJlYWRvbmx5IHZzY29kZS5DaGF0U2xhc2hDb21tYW5kW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2xhc2hDb21tYW5kcy5nZXQodG9rZW4pO1xuXHR9XG5cblx0cHJvdmlkZUhvb2tzKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBUaGVuYWJsZTxyZWFkb25seSB2c2NvZGUuQ2hhdEhvb2tbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9ob29rcy5nZXQodG9rZW4pO1xuXHR9XG5cblx0cHJvdmlkZVBsdWdpbnModG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFRoZW5hYmxlPHJlYWRvbmx5IHZzY29kZS5DaGF0UGx1Z2luW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcGx1Z2lucy5nZXQodG9rZW4pO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2N1c3RvbUFnZW50cy5jbGVhcigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzLmZpcmUoKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZUluc3RydWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnN0cnVjdGlvbnMuY2xlYXIoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RydWN0aW9ucy5maXJlKCk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VTa2lsbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2tpbGxzLmNsZWFyKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTa2lsbHMuZmlyZSgpO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcygpOiB2b2lkIHtcblx0XHR0aGlzLl9zbGFzaENvbW1hbmRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzLmZpcmUoKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZUhvb2tzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2hvb2tzLmNsZWFyKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIb29rcy5maXJlKCk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VQbHVnaW5zKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BsdWdpbnMuY2xlYXIoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVBsdWdpbnMuZmlyZSgpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkNvbnRleHQ6IElNYWluQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kczogRXh0SG9zdENvbW1hbmRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JzQW5kRG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsczogRXh0SG9zdExhbmd1YWdlTW9kZWxzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RpYWdub3N0aWNzOiBFeHRIb3N0RGlhZ25vc3RpY3MsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdG9vbHM6IEV4dEhvc3RMYW5ndWFnZU1vZGVsVG9vbHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25zOiBFeHRIb3N0Q2hhdFNlc3Npb25zLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZENoYXRBZ2VudHMyKTtcblxuXHRcdF9jb21tYW5kcy5yZWdpc3RlckFyZ3VtZW50UHJvY2Vzc29yKHtcblx0XHRcdHByb2Nlc3NBcmd1bWVudDogKGFyZykgPT4ge1xuXHRcdFx0XHQvLyBEb24ndCBzZW5kIHRoaXMgYXJndW1lbnQgdG8gZXh0ZW5zaW9uIGNvbW1hbmRzXG5cdFx0XHRcdGlmIChpc0NoYXRWaWV3VGl0bGVBY3Rpb25Db250ZXh0KGFyZykpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyB0cmFuc2ZlckFjdGl2ZUNoYXQobmV3V29ya3NwYWNlOiB2c2NvZGUuVXJpKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcHJveHkuJHRyYW5zZmVyQWN0aXZlQ2hhdFNlc3Npb24obmV3V29ya3NwYWNlKTtcblx0fVxuXG5cdGNyZWF0ZUNoYXRBZ2VudChleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgaGFuZGxlcjogdnNjb2RlLkNoYXRFeHRlbmRlZFJlcXVlc3RIYW5kbGVyKTogdnNjb2RlLkNoYXRQYXJ0aWNpcGFudCB7XG5cdFx0Y29uc3QgaGFuZGxlID0gRXh0SG9zdENoYXRBZ2VudHMyLl9pZFBvb2wrKztcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBFeHRIb3N0Q2hhdEFnZW50KGV4dGVuc2lvbiwgaWQsIHRoaXMuX3Byb3h5LCBoYW5kbGUsIGhhbmRsZXIpO1xuXHRcdHRoaXMuX2FnZW50cy5zZXQoaGFuZGxlLCBhZ2VudCk7XG5cblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJBZ2VudChoYW5kbGUsIGV4dGVuc2lvbi5pZGVudGlmaWVyLCBpZCwge30sIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIGFnZW50LmFwaUFnZW50O1xuXHR9XG5cblx0Y3JlYXRlRHluYW1pY0NoYXRBZ2VudChleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgZHluYW1pY1Byb3BzOiB2c2NvZGUuRHluYW1pY0NoYXRQYXJ0aWNpcGFudFByb3BzLCBoYW5kbGVyOiB2c2NvZGUuQ2hhdEV4dGVuZGVkUmVxdWVzdEhhbmRsZXIpOiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50IHtcblx0XHRjb25zdCBoYW5kbGUgPSBFeHRIb3N0Q2hhdEFnZW50czIuX2lkUG9vbCsrO1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IEV4dEhvc3RDaGF0QWdlbnQoZXh0ZW5zaW9uLCBpZCwgdGhpcy5fcHJveHksIGhhbmRsZSwgaGFuZGxlcik7XG5cdFx0dGhpcy5fYWdlbnRzLnNldChoYW5kbGUsIGFnZW50KTtcblxuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckFnZW50KGhhbmRsZSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGlkLCB7IGlzU3RpY2t5OiB0cnVlIH0gc2F0aXNmaWVzIElFeHRlbnNpb25DaGF0QWdlbnRNZXRhZGF0YSwgZHluYW1pY1Byb3BzKTtcblx0XHRyZXR1cm4gYWdlbnQuYXBpQWdlbnQ7XG5cdH1cblxuXHRyZWdpc3RlckNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBwcm92aWRlcjogdnNjb2RlLkNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IEV4dEhvc3RDaGF0QWdlbnRzMi5fcGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcklkUG9vbCsrO1xuXHRcdHRoaXMuX3BhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXJzLnNldChoYW5kbGUsIG5ldyBFeHRIb3N0UGFydGljaXBhbnREZXRlY3RvcihleHRlbnNpb24sIHByb3ZpZGVyKSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIoaGFuZGxlKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3BhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXJzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJDaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcihoYW5kbGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEludGVybmFsIG1ldGhvZCB0aGF0IGhhbmRsZXMgYWxsIHByb21wdCBmaWxlIHByb3ZpZGVyIHR5cGVzLlxuXHQgKiBSb3V0ZXMgY3VzdG9tIGFnZW50cywgaW5zdHJ1Y3Rpb25zLCBwcm9tcHQgZmlsZXMsIGFuZCBza2lsbHMgdG8gdGhlIHVuaWZpZWQgaW50ZXJuYWwgaW1wbGVtZW50YXRpb24uXG5cdCAqL1xuXHRyZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdHlwZTogUHJvbXB0c1R5cGUsIHByb3ZpZGVyOiB2c2NvZGUuQ2hhdEN1c3RvbUFnZW50UHJvdmlkZXIgfCB2c2NvZGUuQ2hhdEluc3RydWN0aW9uc1Byb3ZpZGVyIHwgdnNjb2RlLkNoYXRQcm9tcHRGaWxlUHJvdmlkZXIgfCB2c2NvZGUuQ2hhdFNraWxsUHJvdmlkZXIgfCB2c2NvZGUuQ2hhdEhvb2tQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSBFeHRIb3N0Q2hhdEFnZW50czIuX2NvbnRyaWJ1dGlvbnNQcm92aWRlcklkUG9vbCsrO1xuXHRcdHRoaXMuX3Byb21wdEZpbGVQcm92aWRlcnMuc2V0KGhhbmRsZSwgeyBleHRlbnNpb24sIHByb3ZpZGVyIH0pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihoYW5kbGUsIHR5cGUsIGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIHByb3ZpZGVyIGNoYW5nZSBldmVudHMgYW5kIG5vdGlmeSBtYWluIHRocmVhZFxuXHRcdC8vIENoZWNrIGZvciB0aGUgYXBwcm9wcmlhdGUgZXZlbnQgYmFzZWQgb24gdGhlIHByb3ZpZGVyIHR5cGVcblx0XHRsZXQgY2hhbmdlRXZlbnQ6IHZzY29kZS5FdmVudDx2b2lkPiB8IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRcdGNoYW5nZUV2ZW50ID0gKHByb3ZpZGVyIGFzIHZzY29kZS5DaGF0Q3VzdG9tQWdlbnRQcm92aWRlcikub25EaWRDaGFuZ2VDdXN0b21BZ2VudHM7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRcdGNoYW5nZUV2ZW50ID0gKHByb3ZpZGVyIGFzIHZzY29kZS5DaGF0SW5zdHJ1Y3Rpb25zUHJvdmlkZXIpLm9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0XHRjaGFuZ2VFdmVudCA9IChwcm92aWRlciBhcyB2c2NvZGUuQ2hhdFByb21wdEZpbGVQcm92aWRlcikub25EaWRDaGFuZ2VQcm9tcHRGaWxlcztcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHRjaGFuZ2VFdmVudCA9IChwcm92aWRlciBhcyB2c2NvZGUuQ2hhdFNraWxsUHJvdmlkZXIpLm9uRGlkQ2hhbmdlU2tpbGxzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaG9vazpcblx0XHRcdFx0Y2hhbmdlRXZlbnQgPSAocHJvdmlkZXIgYXMgdnNjb2RlLkNoYXRIb29rUHJvdmlkZXIpLm9uRGlkQ2hhbmdlSG9va3M7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmIChjaGFuZ2VFdmVudCkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNoYW5nZUV2ZW50KCgpID0+IHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlUHJvbXB0RmlsZXMoaGFuZGxlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb21wdEZpbGVQcm92aWRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihoYW5kbGUpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlUHJvbXB0RmlsZXMoaGFuZGxlOiBudW1iZXIsIHR5cGU6IFByb21wdHNUeXBlLCBjb250ZXh0OiBJUHJvbXB0RmlsZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByb21wdEZpbGVSZXNvdXJjZVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gdGhpcy5fcHJvbXB0RmlsZVByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIXByb3ZpZGVyRGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHByb3ZpZGVyRGF0YS5wcm92aWRlcjtcblx0XHRsZXQgcmVzb3VyY2VzOiB2c2NvZGUuQ2hhdFJlc291cmNlW10gfCB1bmRlZmluZWQ7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OlxuXHRcdFx0XHRyZXNvdXJjZXMgPSBhd2FpdCAocHJvdmlkZXIgYXMgdnNjb2RlLkNoYXRDdXN0b21BZ2VudFByb3ZpZGVyKS5wcm92aWRlQ3VzdG9tQWdlbnRzKGNvbnRleHQsIHRva2VuKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRcdHJlc291cmNlcyA9IGF3YWl0IChwcm92aWRlciBhcyB2c2NvZGUuQ2hhdEluc3RydWN0aW9uc1Byb3ZpZGVyKS5wcm92aWRlSW5zdHJ1Y3Rpb25zKGNvbnRleHQsIHRva2VuKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6XG5cdFx0XHRcdHJlc291cmNlcyA9IGF3YWl0IChwcm92aWRlciBhcyB2c2NvZGUuQ2hhdFByb21wdEZpbGVQcm92aWRlcikucHJvdmlkZVByb21wdEZpbGVzKGNvbnRleHQsIHRva2VuKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5za2lsbDpcblx0XHRcdFx0cmVzb3VyY2VzID0gYXdhaXQgKHByb3ZpZGVyIGFzIHZzY29kZS5DaGF0U2tpbGxQcm92aWRlcikucHJvdmlkZVNraWxscyhjb250ZXh0LCB0b2tlbikgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaG9vazpcblx0XHRcdFx0cmVzb3VyY2VzID0gYXdhaXQgKHByb3ZpZGVyIGFzIHZzY29kZS5DaGF0SG9va1Byb3ZpZGVyKS5wcm92aWRlSG9va3MoY29udGV4dCwgdG9rZW4pID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc291cmNlcztcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBtZXRhZGF0YTogdnNjb2RlLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyTWV0YWRhdGEsIHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gRXh0SG9zdENoYXRBZ2VudHMyLl9jdXN0b21pemF0aW9uUHJvdmlkZXJJZFBvb2wrKztcblx0XHR0aGlzLl9jdXN0b21pemF0aW9uUHJvdmlkZXJzLnNldChoYW5kbGUsIHsgZXh0ZW5zaW9uLCBwcm92aWRlciB9KTtcblxuXHRcdGNvbnN0IG1ldGFkYXRhRHRvOiBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXJNZXRhZGF0YUR0byA9IHtcblx0XHRcdGxhYmVsOiBtZXRhZGF0YS5sYWJlbCxcblx0XHRcdGljb25JZDogbWV0YWRhdGEuaWNvbklkLFxuXHRcdFx0c3VwcG9ydGVkVHlwZXM6IG1ldGFkYXRhLnN1cHBvcnRlZFR5cGVzPy5tYXAodCA9PiB0eXBlQ29udmVydC5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlLmZyb20odCkpLFxuXHRcdH07XG5cblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcihoYW5kbGUsIGNoYXRTZXNzaW9uVHlwZSwgbWV0YWRhdGFEdG8sIGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0aWYgKHByb3ZpZGVyLm9uRGlkQ2hhbmdlKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucyhoYW5kbGUpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY3VzdG9taXphdGlvblByb3ZpZGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uUHJvdmlkZXIoaGFuZGxlKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZTogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uSXRlbUR0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gdGhpcy5fY3VzdG9taXphdGlvblByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIXByb3ZpZGVyRGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBUaGUgcHJvcG9zZWQgQVBJIHJlcXVpcmVzIGEgcmVhbCBzZXNzaW9uIFVSSTsgYmFpbCBvdXQgd2hlbiB0aGVcblx0XHQvLyBpbnRlcm5hbCBjYWxsZXIgKGUuZy4gdGhlIG1hbmFnZW1lbnQgVUkgcG9wdWxhdGluZyBhIGdsb2JhbCBsaXN0KVxuXHRcdC8vIGhhcyBub3RoaW5nIHNjb3BlZCB0byBmb3J3YXJkLlxuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHByb3ZpZGVyRGF0YS5wcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyhVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZSksIHRva2VuKTtcblx0XHRcdGlmICghaXRlbXMpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+ICh7XG5cdFx0XHRcdHVyaTogaXRlbS51cmksXG5cdFx0XHRcdHR5cGU6IHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUuZnJvbShpdGVtLnR5cGUpLFxuXHRcdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRzb3VyY2U6IGl0ZW0uc291cmNlLFxuXHRcdFx0XHRncm91cEtleTogaXRlbS5ncm91cEtleSxcblx0XHRcdFx0YmFkZ2U6IGl0ZW0uYmFkZ2UsXG5cdFx0XHRcdGJhZGdlVG9vbHRpcDogaXRlbS5iYWRnZVRvb2x0aXAsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiBpdGVtLmV4dGVuc2lvbklkLFxuXHRcdFx0XHRwbHVnaW5Vcmk6IGl0ZW0ucGx1Z2luVXJpLFxuXHRcdFx0XHRwbHVnaW5MYWJlbDogaXRlbS5wbHVnaW5MYWJlbCxcblx0XHRcdFx0dXNlckludm9jYWJsZTogaXRlbS51c2VySW52b2NhYmxlLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbkl0ZW1EdG8pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVTb3VyY2VGb2xkZXJzKGhhbmRsZTogbnVtYmVyLCBzZXNzaW9uUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHR5cGU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uU291cmNlRm9sZGVyRHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlckRhdGEgPSB0aGlzLl9jdXN0b21pemF0aW9uUHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghcHJvdmlkZXJEYXRhPy5wcm92aWRlci5wcm92aWRlU291cmNlRm9sZGVycykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZm9sZGVycyA9IGF3YWl0IHByb3ZpZGVyRGF0YS5wcm92aWRlci5wcm92aWRlU291cmNlRm9sZGVycyhVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZSksIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUudG8odHlwZSksIHRva2VuKTtcblx0XHRcdGlmICghZm9sZGVycykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZm9sZGVycy5tYXAoZm9sZGVyID0+ICh7XG5cdFx0XHRcdHVyaTogZm9sZGVyLnVyaSxcblx0XHRcdFx0bGFiZWw6IGZvbGRlci5sYWJlbCxcblx0XHRcdFx0c291cmNlOiBmb2xkZXIuc291cmNlLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblNvdXJjZUZvbGRlckR0bykpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkZGV0ZWN0Q2hhdFBhcnRpY2lwYW50KGhhbmRsZTogbnVtYmVyLCByZXF1ZXN0RHRvOiBEdG88SUNoYXRBZ2VudFJlcXVlc3Q+LCBjb250ZXh0OiB7IGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlEdG9bXSB9LCBvcHRpb25zOiB7IGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbjsgcGFydGljaXBhbnRzPzogdnNjb2RlLkNoYXRQYXJ0aWNpcGFudE1ldGFkYXRhW10gfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUmVzdWx0IHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRldGVjdG9yID0gdGhpcy5fcGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFkZXRlY3Rvcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB7IHJlcXVlc3QsIGxvY2F0aW9uLCBoaXN0b3J5IH0gPSBhd2FpdCB0aGlzLl9jcmVhdGVSZXF1ZXN0KHJlcXVlc3REdG8sIGNvbnRleHQsIGRldGVjdG9yLmV4dGVuc2lvbik7XG5cblx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuZ2V0TW9kZWxGb3JSZXF1ZXN0KHJlcXVlc3QsIGRldGVjdG9yLmV4dGVuc2lvbik7XG5cdFx0Y29uc3QgdG9vbHMgPSBhd2FpdCB0aGlzLmdldFRvb2xzRm9yUmVxdWVzdChkZXRlY3Rvci5leHRlbnNpb24sIHJlcXVlc3QudXNlclNlbGVjdGVkVG9vbHMsIG1vZGVsLmlkLCB0b2tlbik7XG5cdFx0Y29uc3QgZXh0UmVxdWVzdCA9IHR5cGVDb252ZXJ0LkNoYXRBZ2VudFJlcXVlc3QudG8oXG5cdFx0XHRyZXF1ZXN0LFxuXHRcdFx0bG9jYXRpb24sXG5cdFx0XHRtb2RlbCxcblx0XHRcdHJlcXVlc3QubW9kZWxDb25maWd1cmF0aW9uLFxuXHRcdFx0dGhpcy5nZXREaWFnbm9zdGljc1doZW5FbmFibGVkKGRldGVjdG9yLmV4dGVuc2lvbiksXG5cdFx0XHR0b29scyxcblx0XHRcdGRldGVjdG9yLmV4dGVuc2lvbixcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIGRldGVjdG9yLnByb3ZpZGVyLnByb3ZpZGVQYXJ0aWNpcGFudERldGVjdGlvbihcblx0XHRcdGV4dFJlcXVlc3QsXG5cdFx0XHR7IGhpc3RvcnksIHlpZWxkUmVxdWVzdGVkOiBmYWxzZSB9LFxuXHRcdFx0eyBwYXJ0aWNpcGFudHM6IG9wdGlvbnMucGFydGljaXBhbnRzLCBsb2NhdGlvbjogdHlwZUNvbnZlcnQuQ2hhdExvY2F0aW9uLnRvKG9wdGlvbnMubG9jYXRpb24pIH0sXG5cdFx0XHR0b2tlblxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVSZXF1ZXN0KHJlcXVlc3REdG86IER0bzxJQ2hhdEFnZW50UmVxdWVzdD4sIGNvbnRleHQ6IHsgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeUR0b1tdIH0sIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKSB7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHJldml2ZTxJQ2hhdEFnZW50UmVxdWVzdD4ocmVxdWVzdER0byk7XG5cdFx0Y29uc3QgY29udmVydGVkSGlzdG9yeSA9IGF3YWl0IHRoaXMucHJlcGFyZUhpc3RvcnlUdXJucyhleHRlbnNpb24sIHJlcXVlc3QuYWdlbnRJZCwgY29udGV4dCk7XG5cblx0XHQvLyBpbi1wbGFjZSBjb252ZXJ0aW5nIGZvciBsb2NhdGlvbi1kYXRhXG5cdFx0bGV0IGxvY2F0aW9uOiB2c2NvZGUuQ2hhdFJlcXVlc3RFZGl0b3JEYXRhIHwgdnNjb2RlLkNoYXRSZXF1ZXN0Tm90ZWJvb2tEYXRhIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZXF1ZXN0LmxvY2F0aW9uRGF0YT8udHlwZSA9PT0gQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKSB7XG5cdFx0XHQvLyBlZGl0b3IgZGF0YVxuXHRcdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVxdWVzdC5sb2NhdGlvbkRhdGEuZG9jdW1lbnQpO1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yc0FuZERvY3VtZW50cy5nZXRFZGl0b3IocmVxdWVzdC5sb2NhdGlvbkRhdGEuaWQpITtcblx0XHRcdGxvY2F0aW9uID0gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdEVkaXRvckRhdGEoZWRpdG9yLnZhbHVlLCBkb2N1bWVudCwgdHlwZUNvbnZlcnQuU2VsZWN0aW9uLnRvKHJlcXVlc3QubG9jYXRpb25EYXRhLnNlbGVjdGlvbiksIHR5cGVDb252ZXJ0LlJhbmdlLnRvKHJlcXVlc3QubG9jYXRpb25EYXRhLndob2xlUmFuZ2UpKTtcblxuXHRcdH0gZWxzZSBpZiAocmVxdWVzdC5sb2NhdGlvbkRhdGE/LnR5cGUgPT09IENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rKSB7XG5cdFx0XHQvLyBub3RlYm9vayBkYXRhXG5cdFx0XHRjb25zdCBjZWxsID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlcXVlc3QubG9jYXRpb25EYXRhLnNlc3Npb25JbnB1dFVyaSk7XG5cdFx0XHRsb2NhdGlvbiA9IG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlcXVlc3ROb3RlYm9va0RhdGEoY2VsbCk7XG5cblx0XHR9IGVsc2UgaWYgKHJlcXVlc3QubG9jYXRpb25EYXRhPy50eXBlID09PSBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCkge1xuXHRcdFx0Ly8gVEJEXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgcmVxdWVzdCwgbG9jYXRpb24sIGhpc3Rvcnk6IGNvbnZlcnRlZEhpc3RvcnkgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TW9kZWxGb3JSZXF1ZXN0KHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IFByb21pc2U8dnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0PiB7XG5cdFx0bGV0IG1vZGVsOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJlcXVlc3QudXNlclNlbGVjdGVkTW9kZWxJZCkge1xuXHRcdFx0bW9kZWwgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVscy5nZXRMYW5ndWFnZU1vZGVsQnlJZGVudGlmaWVyKGV4dGVuc2lvbiwgcmVxdWVzdC51c2VyU2VsZWN0ZWRNb2RlbElkKTtcblx0XHR9XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVscy5nZXREZWZhdWx0TGFuZ3VhZ2VNb2RlbChleHRlbnNpb24pO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xhbmd1YWdlIG1vZGVsIHVuYXZhaWxhYmxlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblxuXHRhc3luYyAkc2V0UmVxdWVzdFRvb2xzKHJlcXVlc3RJZDogc3RyaW5nLCB0b29sczogVXNlclNlbGVjdGVkVG9vbHMpIHtcblx0XHRjb25zdCByZXF1ZXN0ID0gWy4uLnRoaXMuX2luRmxpZ2h0UmVxdWVzdHNdLmZpbmQociA9PiByLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKTtcblx0XHRpZiAoIXJlcXVlc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXF1ZXN0LmV4dFJlcXVlc3QudG9vbHMuY2xlYXIoKTtcblx0XHRjb25zdCB0b29sc01hcCA9IGF3YWl0IHRoaXMuZ2V0VG9vbHNGb3JSZXF1ZXN0KHJlcXVlc3QuZXh0ZW5zaW9uLCB0b29scywgcmVxdWVzdC5leHRSZXF1ZXN0Lm1vZGVsLmlkLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRmb3IgKGNvbnN0IFtrLCB2XSBvZiB0b29sc01hcCkge1xuXHRcdFx0cmVxdWVzdC5leHRSZXF1ZXN0LnRvb2xzLnNldChrLCB2KTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDaGF0UmVxdWVzdFRvb2xzLmZpcmUocmVxdWVzdC5leHRSZXF1ZXN0KTtcblx0fVxuXG5cdCRzZXRZaWVsZFJlcXVlc3RlZChyZXF1ZXN0SWQ6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCByZXF1ZXN0ID0gWy4uLnRoaXMuX2luRmxpZ2h0UmVxdWVzdHNdLmZpbmQociA9PiByLnJlcXVlc3RJZCA9PT0gcmVxdWVzdElkKTtcblx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0cmVxdWVzdC55aWVsZFJlcXVlc3RlZCA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRpbnZva2VBZ2VudChoYW5kbGU6IG51bWJlciwgcmVxdWVzdER0bzogRHRvPElDaGF0QWdlbnRSZXF1ZXN0PiwgY29udGV4dDogeyBoaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5RHRvW107IGNoYXRTZXNzaW9uQ29udGV4dD86IElDaGF0U2Vzc2lvbkNvbnRleHREdG8gfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdEFnZW50SW52b2tlUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9hZ2VudHMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQ0hBVF0oJHtoYW5kbGV9KSBDQU5OT1QgaW52b2tlIGFnZW50IGJlY2F1c2UgdGhlIGFnZW50IGlzIG5vdCByZWdpc3RlcmVkYCk7XG5cdFx0fVxuXG5cdFx0bGV0IHN0cmVhbTogQ2hhdEFnZW50UmVzcG9uc2VTdHJlYW0gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGluRmxpZ2h0UmVxdWVzdDogSW5GbGlnaHRDaGF0UmVxdWVzdCB8IHVuZGVmaW5lZDtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB7IHJlcXVlc3QsIGxvY2F0aW9uLCBoaXN0b3J5IH0gPSBhd2FpdCB0aGlzLl9jcmVhdGVSZXF1ZXN0KHJlcXVlc3REdG8sIGNvbnRleHQsIGFnZW50LmV4dGVuc2lvbik7XG5cblx0XHRcdC8vIEluaXQgc2Vzc2lvbiBkaXNwb3NhYmxlc1xuXHRcdFx0bGV0IHNlc3Npb25EaXNwb3NhYmxlcyA9IHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5nZXQocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFzZXNzaW9uRGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0c2Vzc2lvbkRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuc2V0KHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uRGlzcG9zYWJsZXMpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdHJlYW0gPSBuZXcgQ2hhdEFnZW50UmVzcG9uc2VTdHJlYW0oYWdlbnQuZXh0ZW5zaW9uLCByZXF1ZXN0LCB0aGlzLl9wcm94eSwgdGhpcy5fY29tbWFuZHMuY29udmVydGVyLCBzZXNzaW9uRGlzcG9zYWJsZXMsIHRoaXMuX3BlbmRpbmdDYXJvdXNlbFJlc29sdmVycywgdG9rZW4pO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuZ2V0TW9kZWxGb3JSZXF1ZXN0KHJlcXVlc3QsIGFnZW50LmV4dGVuc2lvbik7XG5cdFx0XHRjb25zdCB0b29scyA9IGF3YWl0IHRoaXMuZ2V0VG9vbHNGb3JSZXF1ZXN0KGFnZW50LmV4dGVuc2lvbiwgcmVxdWVzdC51c2VyU2VsZWN0ZWRUb29scywgbW9kZWwuaWQsIHRva2VuKTtcblx0XHRcdGNvbnN0IGV4dFJlcXVlc3QgPSB0eXBlQ29udmVydC5DaGF0QWdlbnRSZXF1ZXN0LnRvKFxuXHRcdFx0XHRyZXF1ZXN0LFxuXHRcdFx0XHRsb2NhdGlvbixcblx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdHJlcXVlc3QubW9kZWxDb25maWd1cmF0aW9uLFxuXHRcdFx0XHR0aGlzLmdldERpYWdub3N0aWNzV2hlbkVuYWJsZWQoYWdlbnQuZXh0ZW5zaW9uKSxcblx0XHRcdFx0dG9vbHMsXG5cdFx0XHRcdGFnZW50LmV4dGVuc2lvbixcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZVxuXHRcdFx0KTtcblx0XHRcdGluRmxpZ2h0UmVxdWVzdCA9IHsgcmVxdWVzdElkOiByZXF1ZXN0RHRvLnJlcXVlc3RJZCwgZXh0UmVxdWVzdCwgZXh0ZW5zaW9uOiBhZ2VudC5leHRlbnNpb24sIGhvb2tzOiByZXF1ZXN0Lmhvb2tzLCB5aWVsZFJlcXVlc3RlZDogZmFsc2UgfTtcblx0XHRcdHRoaXMuX2luRmxpZ2h0UmVxdWVzdHMuYWRkKGluRmxpZ2h0UmVxdWVzdCk7XG5cblxuXHRcdFx0Ly8gSWYgdGhpcyByZXF1ZXN0IG9yaWdpbmF0ZXMgZnJvbSBhIGNvbnRyaWJ1dGVkIGNoYXQgc2Vzc2lvbiBlZGl0b3IsIGF0dGVtcHQgdG8gcmVzb2x2ZSB0aGUgQ2hhdFNlc3Npb24gQVBJIG9iamVjdFxuXHRcdFx0bGV0IGNoYXRTZXNzaW9uQ29udGV4dDogdnNjb2RlLkNoYXRTZXNzaW9uQ29udGV4dCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjb250ZXh0LmNoYXRTZXNzaW9uQ29udGV4dCkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucmV2aXZlKGNvbnRleHQuY2hhdFNlc3Npb25Db250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBpbnB1dFN0YXRlID0gYXdhaXQgdGhpcy5fY2hhdFNlc3Npb25zLmdldElucHV0U3RhdGVGb3JTZXNzaW9uKFxuXHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRjb250ZXh0LmNoYXRTZXNzaW9uQ29udGV4dC5pbml0aWFsU2Vzc2lvbk9wdGlvbnMsXG5cdFx0XHRcdFx0dG9rZW4sXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNoYXRTZXNzaW9uQ29udGV4dCA9IHtcblx0XHRcdFx0XHRjaGF0U2Vzc2lvbkl0ZW06IHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRsYWJlbDogY29udGV4dC5jaGF0U2Vzc2lvbkNvbnRleHQuaXNVbnRpdGxlZCA/ICdVbnRpdGxlZCBTZXNzaW9uJyA6ICdTZXNzaW9uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGlzVW50aXRsZWQ6IGNvbnRleHQuY2hhdFNlc3Npb25Db250ZXh0LmlzVW50aXRsZWQsXG5cdFx0XHRcdFx0aW5pdGlhbFNlc3Npb25PcHRpb25zOiBjb250ZXh0LmNoYXRTZXNzaW9uQ29udGV4dC5pbml0aWFsU2Vzc2lvbk9wdGlvbnMsXG5cdFx0XHRcdFx0aW5wdXRTdGF0ZSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hhdENvbnRleHQ6IHZzY29kZS5DaGF0Q29udGV4dCA9IHtcblx0XHRcdFx0aGlzdG9yeSxcblx0XHRcdFx0Y2hhdFNlc3Npb25Db250ZXh0LFxuXHRcdFx0XHRnZXQgeWllbGRSZXF1ZXN0ZWQoKSB7IHJldHVybiBpbkZsaWdodFJlcXVlc3Q/LnlpZWxkUmVxdWVzdGVkID8/IGZhbHNlOyB9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdGFzayA9IGFnZW50Lmludm9rZShcblx0XHRcdFx0ZXh0UmVxdWVzdCxcblx0XHRcdFx0Y2hhdENvbnRleHQsXG5cdFx0XHRcdHN0cmVhbS5hcGlPYmplY3QsXG5cdFx0XHRcdHRva2VuXG5cdFx0XHQpO1xuXG5cdFx0XHRyZXR1cm4gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbldpdGhUaW1lb3V0KDEwMDAsIFByb21pc2UucmVzb2x2ZSh0YXNrKS50aGVuKChyZXN1bHQpID0+IHtcblx0XHRcdFx0aWYgKHJlc3VsdD8ubWV0YWRhdGEpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0SlNPTi5zdHJpbmdpZnkocmVzdWx0Lm1ldGFkYXRhKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1zZyA9IGByZXN1bHQubWV0YWRhdGEgTVVTVCBiZSBKU09OLnN0cmluZ2lmeS1hYmxlLiBHb3QgZXJyb3I6ICR7ZXJyLm1lc3NhZ2V9YDtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFske2FnZW50LmV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfV0gW0Ake2FnZW50LmlkfV0gJHttc2d9YCwgYWdlbnQuZXh0ZW5zaW9uKTtcblx0XHRcdFx0XHRcdHJldHVybiB7IGVycm9yRGV0YWlsczogeyBtZXNzYWdlOiBtc2cgfSwgdGltaW5nczogc3RyZWFtPy50aW1pbmdzLCBuZXh0UXVlc3Rpb246IHJlc3VsdC5uZXh0UXVlc3Rpb24sIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBlcnJvckRldGFpbHM6IElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHMgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChyZXN1bHQ/LmVycm9yRGV0YWlscykge1xuXHRcdFx0XHRcdGVycm9yRGV0YWlscyA9IHtcblx0XHRcdFx0XHRcdC4uLnJlc3VsdC5lcnJvckRldGFpbHMsXG5cdFx0XHRcdFx0XHRyZXNwb25zZUlzSW5jb21wbGV0ZTogdHJ1ZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVycm9yRGV0YWlscz8ucmVzcG9uc2VJc1JlZGFjdGVkIHx8IGVycm9yRGV0YWlscz8uaXNRdW90YUV4Y2VlZGVkIHx8IGVycm9yRGV0YWlscz8uaXNSYXRlTGltaXRlZCB8fCBlcnJvckRldGFpbHM/LmlzRXhwZWN0ZWRFcnJvciB8fCBlcnJvckRldGFpbHM/LmNvbmZpcm1hdGlvbkJ1dHRvbnMgfHwgZXJyb3JEZXRhaWxzPy5jb2RlKSB7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoYWdlbnQuZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHsgZXJyb3JEZXRhaWxzLCB0aW1pbmdzOiBzdHJlYW0/LnRpbWluZ3MsIG1ldGFkYXRhOiByZXN1bHQ/Lm1ldGFkYXRhLCBuZXh0UXVlc3Rpb246IHJlc3VsdD8ubmV4dFF1ZXN0aW9uLCBkZXRhaWxzOiByZXN1bHQ/LmRldGFpbHMgfSBzYXRpc2ZpZXMgSUNoYXRBZ2VudFJlc3VsdDtcblx0XHRcdH0pLCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlLCBhZ2VudC5leHRlbnNpb24pO1xuXG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsRXJyb3IgJiYgZS5jYXVzZSkge1xuXHRcdFx0XHRlID0gZS5jYXVzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNRdW90YUV4Y2VlZGVkID0gZSBpbnN0YW5jZW9mIEVycm9yICYmIGUubmFtZSA9PT0gJ0NoYXRRdW90YUV4Y2VlZGVkJztcblx0XHRcdGNvbnN0IGlzUmF0ZUxpbWl0ZWQgPSBlIGluc3RhbmNlb2YgRXJyb3IgJiYgZS5uYW1lID09PSAnQ2hhdFJhdGVMaW1pdGVkJztcblx0XHRcdGNvbnN0IGlzRXhwZWN0ZWRFcnJvciA9IGUgaW5zdGFuY2VvZiBFcnJvciAmJiBlLm5hbWUgPT09ICdDaGF0RXhwZWN0ZWRFcnJvcic7XG5cdFx0XHRjb25zdCB7IGNhbGxzdGFjazogZXJyb3JDYWxsc3RhY2sgfSA9IHBhY2tFcnJvckZvclRlbGVtZXRyeShlKTtcblx0XHRcdGNvbnN0IGVycm9yTmFtZSA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubmFtZSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB7IGVycm9yRGV0YWlsczogeyBtZXNzYWdlOiB0b0Vycm9yTWVzc2FnZShlKSwgcmVzcG9uc2VJc0luY29tcGxldGU6IHRydWUsIGlzUXVvdGFFeGNlZWRlZCwgaXNSYXRlTGltaXRlZCwgaXNFeHBlY3RlZEVycm9yIH0sIGVycm9yQ2FsbHN0YWNrLCBlcnJvck5hbWUgfTtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoaW5GbGlnaHRSZXF1ZXN0KSB7XG5cdFx0XHRcdHRoaXMuX2luRmxpZ2h0UmVxdWVzdHMuZGVsZXRlKGluRmxpZ2h0UmVxdWVzdCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDbGVhbiB1cCBhbnkgcGVuZGluZyBjYXJvdXNlbCByZXNvbHZlcnMgZm9yIHRoaXMgcmVxdWVzdFxuXHRcdFx0Y29uc3QgcGVuZGluZ1Jlc29sdmVycyA9IHRoaXMuX3BlbmRpbmdDYXJvdXNlbFJlc29sdmVycy5nZXQocmVxdWVzdER0by5yZXF1ZXN0SWQpO1xuXHRcdFx0aWYgKHBlbmRpbmdSZXNvbHZlcnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBkZWZlcnJlZCBvZiBwZW5kaW5nUmVzb2x2ZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0ZGVmZXJyZWQuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMuZGVsZXRlKHJlcXVlc3REdG8ucmVxdWVzdElkKTtcblx0XHRcdH1cblx0XHRcdHN0cmVhbT8uY2xvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldERpYWdub3N0aWNzV2hlbkVuYWJsZWQoZXh0ZW5zaW9uOiBSZWFkb25seTxJUmVsYXhlZEV4dGVuc2lvbkRlc2NyaXB0aW9uPikge1xuXHRcdGlmICghaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFJlZmVyZW5jZURpYWdub3N0aWMnKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGlhZ25vc3RpY3MuZ2V0RGlhZ25vc3RpY3MoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VG9vbHNGb3JSZXF1ZXN0KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB0b29sczogVXNlclNlbGVjdGVkVG9vbHMgfCB1bmRlZmluZWQsIG1vZGVsSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNYXA8dnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sSW5mb3JtYXRpb24sIGJvb2xlYW4+PiB7XG5cdFx0aWYgKCF0b29scykge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXAoKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IE1hcDx2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbmZvcm1hdGlvbiwgYm9vbGVhbj4oKTtcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdGhpcy5fdG9vbHMuZ2V0VG9vbHMoZXh0ZW5zaW9uKSkge1xuXHRcdFx0aWYgKHR5cGVvZiB0b29sc1t0b29sLm5hbWVdID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0cmVzdWx0LnNldCh0b29sLCB0b29sc1t0b29sLm5hbWVdKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJlcGFyZUhpc3RvcnlUdXJucyhleHRlbnNpb246IFJlYWRvbmx5PElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24+LCBhZ2VudElkOiBzdHJpbmcsIGNvbnRleHQ6IHsgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeUR0b1tdIH0pOiBQcm9taXNlPCh2c2NvZGUuQ2hhdFJlcXVlc3RUdXJuIHwgdnNjb2RlLkNoYXRSZXNwb25zZVR1cm4pW10+IHtcblx0XHRjb25zdCByZXM6ICh2c2NvZGUuQ2hhdFJlcXVlc3RUdXJuIHwgdnNjb2RlLkNoYXRSZXNwb25zZVR1cm4pW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgaCBvZiBjb250ZXh0Lmhpc3RvcnkpIHtcblx0XHRcdGNvbnN0IGVoUmVzdWx0ID0gdHlwZUNvbnZlcnQuQ2hhdEFnZW50UmVzdWx0LnRvKGgucmVzdWx0KTtcblx0XHRcdGNvbnN0IHJlc3VsdDogdnNjb2RlLkNoYXRSZXN1bHQgPSBhZ2VudElkID09PSBoLnJlcXVlc3QuYWdlbnRJZCB8fCAoaXNCdWlsdGluUGFydGljaXBhbnQoaC5yZXF1ZXN0LmFnZW50SWQpICYmIGlzQnVpbHRpblBhcnRpY2lwYW50KGFnZW50SWQpKSA/XG5cdFx0XHRcdGVoUmVzdWx0IDpcblx0XHRcdFx0eyAuLi5laFJlc3VsdCwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9O1xuXG5cdFx0XHQvLyBSRVFVRVNUIHR1cm5cblx0XHRcdGNvbnN0IHZhcnNXaXRob3V0VG9vbHM6IHZzY29kZS5DaGF0UHJvbXB0UmVmZXJlbmNlW10gPSBbXTtcblx0XHRcdGNvbnN0IHRvb2xSZWZlcmVuY2VzOiB2c2NvZGUuQ2hhdExhbmd1YWdlTW9kZWxUb29sUmVmZXJlbmNlW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgdiBvZiBoLnJlcXVlc3QudmFyaWFibGVzLnZhcmlhYmxlcykge1xuXHRcdFx0XHRpZiAodi5raW5kID09PSAndG9vbCcpIHtcblx0XHRcdFx0XHR0b29sUmVmZXJlbmNlcy5wdXNoKHR5cGVDb252ZXJ0LkNoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZS50byh2KSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodi5raW5kID09PSAndG9vbHNldCcpIHtcblx0XHRcdFx0XHR0b29sUmVmZXJlbmNlcy5wdXNoKC4uLnYudmFsdWUubWFwKHR5cGVDb252ZXJ0LkNoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZS50bykpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZhcnNXaXRob3V0VG9vbHMucHVzaCguLi50eXBlQ29udmVydC5DaGF0UHJvbXB0UmVmZXJlbmNlLnRvUmVmZXJlbmNlcyh2LCB0aGlzLmdldERpYWdub3N0aWNzV2hlbkVuYWJsZWQoZXh0ZW5zaW9uKSwgdGhpcy5fbG9nU2VydmljZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVkaXRlZEZpbGVFdmVudHMgPSBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJykgPyBoLnJlcXVlc3QuZWRpdGVkRmlsZUV2ZW50cyA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IG1vZGVJbnN0cnVjdGlvbnMyID0gaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpICYmIGgucmVxdWVzdC5tb2RlSW5zdHJ1Y3Rpb25zID8gdHlwZUNvbnZlcnQuQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zLnRvKGgucmVxdWVzdC5tb2RlSW5zdHJ1Y3Rpb25zKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHR1cm4gPSBuZXcgZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0VHVybihoLnJlcXVlc3QubWVzc2FnZSwgaC5yZXF1ZXN0LmNvbW1hbmQsIHZhcnNXaXRob3V0VG9vbHMsIGgucmVxdWVzdC5hZ2VudElkLCB0b29sUmVmZXJlbmNlcywgZWRpdGVkRmlsZUV2ZW50cywgaC5yZXF1ZXN0LnJlcXVlc3RJZCwgdW5kZWZpbmVkLCBtb2RlSW5zdHJ1Y3Rpb25zMik7XG5cdFx0XHRyZXMucHVzaCh0dXJuKTtcblxuXHRcdFx0Ly8gUkVTUE9OU0UgdHVyblxuXHRcdFx0Y29uc3QgcGFydHMgPSBjb2FsZXNjZShoLnJlc3BvbnNlLm1hcChyID0+IHR5cGVDb252ZXJ0LkNoYXRSZXNwb25zZVBhcnQudG9Db250ZW50KHIsIHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlcikpKTtcblx0XHRcdHJlcy5wdXNoKG5ldyBleHRIb3N0VHlwZXMuQ2hhdFJlc3BvbnNlVHVybihwYXJ0cywgcmVzdWx0LCBoLnJlcXVlc3QuYWdlbnRJZCwgaC5yZXF1ZXN0LmNvbW1hbmQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0JHJlbGVhc2VTZXNzaW9uKHNlc3Npb25SZXNvdXJjZUR0bzogVXJpQ29tcG9uZW50cyk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlRHRvKTtcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChzZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX29uRGlkRGlzcG9zZUNoYXRTZXNzaW9uLmZpcmUoc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHQkYWNjZXB0QWN0aXZlQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlRHRvOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlRHRvID8gVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2VEdG8pIDogdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9hY3RpdmVDaGF0UGFuZWxTZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUNoYXRQYW5lbFNlc3Npb25SZXNvdXJjZS5maXJlKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUZvbGxvd3VwcyhyZXF1ZXN0RHRvOiBEdG88SUNoYXRBZ2VudFJlcXVlc3Q+LCBoYW5kbGU6IG51bWJlciwgcmVzdWx0OiBJQ2hhdEFnZW50UmVzdWx0LCBjb250ZXh0OiB7IGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlEdG9bXSB9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0Rm9sbG93dXBbXT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fYWdlbnRzLmdldChoYW5kbGUpO1xuXHRcdGlmICghYWdlbnQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3QgPSByZXZpdmU8SUNoYXRBZ2VudFJlcXVlc3Q+KHJlcXVlc3REdG8pO1xuXHRcdGNvbnN0IGNvbnZlcnRlZEhpc3RvcnkgPSBhd2FpdCB0aGlzLnByZXBhcmVIaXN0b3J5VHVybnMoYWdlbnQuZXh0ZW5zaW9uLCBhZ2VudC5pZCwgY29udGV4dCk7XG5cblx0XHRjb25zdCBlaFJlc3VsdCA9IHR5cGVDb252ZXJ0LkNoYXRBZ2VudFJlc3VsdC50byhyZXN1bHQpO1xuXHRcdHJldHVybiAoYXdhaXQgYWdlbnQucHJvdmlkZUZvbGxvd3VwcyhlaFJlc3VsdCwgeyBoaXN0b3J5OiBjb252ZXJ0ZWRIaXN0b3J5LCB5aWVsZFJlcXVlc3RlZDogZmFsc2UgfSwgdG9rZW4pKVxuXHRcdFx0LmZpbHRlcihmID0+IHtcblx0XHRcdFx0Ly8gVGhlIGZvbGxvd3VwIG11c3QgcmVmZXIgdG8gYSBwYXJ0aWNpcGFudCB0aGF0IGV4aXN0cyBmcm9tIHRoZSBzYW1lIGV4dGVuc2lvblxuXHRcdFx0XHRjb25zdCBpc1ZhbGlkID0gIWYucGFydGljaXBhbnQgfHwgSXRlcmFibGUuc29tZShcblx0XHRcdFx0XHR0aGlzLl9hZ2VudHMudmFsdWVzKCksXG5cdFx0XHRcdFx0YSA9PiBhLmlkID09PSBmLnBhcnRpY2lwYW50ICYmIEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGFnZW50LmV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdGlmICghaXNWYWxpZCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0Ake2FnZW50LmlkfV0gQ2hhdEZvbGxvd3VwIHJlZmVycyB0byBhbiB1bmtub3duIHBhcnRpY2lwYW50OiAke2YucGFydGljaXBhbnR9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGlzVmFsaWQ7XG5cdFx0XHR9KVxuXHRcdFx0Lm1hcChmID0+IHR5cGVDb252ZXJ0LkNoYXRGb2xsb3d1cC5mcm9tKGYsIHJlcXVlc3QpKTtcblx0fVxuXG5cdCRhY2NlcHRGZWVkYmFjayhoYW5kbGU6IG51bWJlciwgcmVzdWx0OiBJQ2hhdEFnZW50UmVzdWx0LCB2b3RlQWN0aW9uOiBJQ2hhdFZvdGVBY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX2FnZW50cy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWhSZXN1bHQgPSB0eXBlQ29udmVydC5DaGF0QWdlbnRSZXN1bHQudG8ocmVzdWx0KTtcblx0XHRsZXQga2luZDogZXh0SG9zdFR5cGVzLkNoYXRSZXN1bHRGZWVkYmFja0tpbmQ7XG5cdFx0c3dpdGNoICh2b3RlQWN0aW9uLmRpcmVjdGlvbikge1xuXHRcdFx0Y2FzZSBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uLkRvd246XG5cdFx0XHRcdGtpbmQgPSBleHRIb3N0VHlwZXMuQ2hhdFJlc3VsdEZlZWRiYWNrS2luZC5VbmhlbHBmdWw7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uLlVwOlxuXHRcdFx0XHRraW5kID0gZXh0SG9zdFR5cGVzLkNoYXRSZXN1bHRGZWVkYmFja0tpbmQuSGVscGZ1bDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmVlZGJhY2s6IHZzY29kZS5DaGF0UmVzdWx0RmVlZGJhY2sgPSB7XG5cdFx0XHRyZXN1bHQ6IGVoUmVzdWx0LFxuXHRcdFx0a2luZCxcblx0XHR9O1xuXHRcdGFnZW50LmFjY2VwdEZlZWRiYWNrKE9iamVjdC5mcmVlemUoZmVlZGJhY2spKTtcblx0fVxuXG5cdCRoYW5kbGVRdWVzdGlvbkNhcm91c2VsQW5zd2VyKHJlcXVlc3RJZDogc3RyaW5nLCByZXNvbHZlSWQ6IHN0cmluZywgYW5zd2VyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZXF1ZXN0UmVzb2x2ZXJzID0gdGhpcy5fcGVuZGluZ0Nhcm91c2VsUmVzb2x2ZXJzLmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmICghcmVxdWVzdFJlc29sdmVycykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmVycmVkID0gcmVxdWVzdFJlc29sdmVycy5nZXQocmVzb2x2ZUlkKTtcblx0XHRpZiAoZGVmZXJyZWQpIHtcblx0XHRcdGRlZmVycmVkLmNvbXBsZXRlKGFuc3dlcnMpO1xuXHRcdFx0cmVxdWVzdFJlc29sdmVycy5kZWxldGUocmVzb2x2ZUlkKTtcblx0XHR9XG5cblx0XHQvLyBDbGVhbiB1cCBpZiBubyBtb3JlIHJlc29sdmVycyBmb3IgdGhpcyByZXF1ZXN0XG5cdFx0aWYgKHJlcXVlc3RSZXNvbHZlcnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0Nhcm91c2VsUmVzb2x2ZXJzLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdH1cblx0fVxuXG5cdCRhY2NlcHRBY3Rpb24oaGFuZGxlOiBudW1iZXIsIHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCwgZXZlbnQ6IElDaGF0VXNlckFjdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9hZ2VudHMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZXZlbnQuYWN0aW9uLmtpbmQgPT09ICd2b3RlJykge1xuXHRcdFx0Ly8gaGFuZGxlZCBieSAkYWNjZXB0RmVlZGJhY2tcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlaEFjdGlvbiA9IHR5cGVDb252ZXJ0LkNoYXRBZ2VudFVzZXJBY3Rpb25FdmVudC50byhyZXN1bHQsIGV2ZW50LCB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIpO1xuXHRcdGlmIChlaEFjdGlvbikge1xuXHRcdFx0YWdlbnQuYWNjZXB0QWN0aW9uKE9iamVjdC5mcmVlemUoZWhBY3Rpb24pKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkaW52b2tlQ29tcGxldGlvblByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBxdWVyeTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0QWdlbnRDb21wbGV0aW9uSXRlbVtdPiB7XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9hZ2VudHMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGxldCBkaXNwb3NhYmxlcyA9IHRoaXMuX2NvbXBsZXRpb25EaXNwb3NhYmxlcy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoZGlzcG9zYWJsZXMpIHtcblx0XHRcdC8vIENsZWFyIGFueSBkaXNwb3NhYmxlcyBmcm9tIHRoZSBsYXN0IGludm9jYXRpb24gb2YgdGhpcyBjb21wbGV0aW9uIHByb3ZpZGVyXG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHRoaXMuX2NvbXBsZXRpb25EaXNwb3NhYmxlcy5zZXQoaGFuZGxlLCBkaXNwb3NhYmxlcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBhZ2VudC5pbnZva2VDb21wbGV0aW9uUHJvdmlkZXIocXVlcnksIHRva2VuKTtcblxuXHRcdHJldHVybiBpdGVtcy5tYXAoKGkpID0+IHR5cGVDb252ZXJ0LkNoYXRBZ2VudENvbXBsZXRpb25JdGVtLmZyb20oaSwgdGhpcy5fY29tbWFuZHMuY29udmVydGVyLCBkaXNwb3NhYmxlcykpO1xuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVDaGF0VGl0bGUoaGFuZGxlOiBudW1iZXIsIGNvbnRleHQ6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlEdG9bXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX2FnZW50cy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeSA9IGF3YWl0IHRoaXMucHJlcGFyZUhpc3RvcnlUdXJucyhhZ2VudC5leHRlbnNpb24sIGFnZW50LmlkLCB7IGhpc3Rvcnk6IGNvbnRleHQgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gY29udGV4dFswXT8ucmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UgPyBVUkkucmV2aXZlKGNvbnRleHRbMF0ucmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBhd2FpdCBhZ2VudC5wcm92aWRlVGl0bGUoeyBoaXN0b3J5LCBzZXNzaW9uUmVzb3VyY2UsIHlpZWxkUmVxdWVzdGVkOiBmYWxzZSB9LCB0b2tlbik7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUNoYXRTdW1tYXJ5KGhhbmRsZTogbnVtYmVyLCBjb250ZXh0OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5RHRvW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9hZ2VudHMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhpc3RvcnkgPSBhd2FpdCB0aGlzLnByZXBhcmVIaXN0b3J5VHVybnMoYWdlbnQuZXh0ZW5zaW9uLCBhZ2VudC5pZCwgeyBoaXN0b3J5OiBjb250ZXh0IH0pO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGNvbnRleHRbMF0/LnJlcXVlc3Quc2Vzc2lvblJlc291cmNlID8gVVJJLnJldml2ZShjb250ZXh0WzBdLnJlcXVlc3Quc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gYXdhaXQgYWdlbnQucHJvdmlkZVN1bW1hcnkoeyBoaXN0b3J5LCBzZXNzaW9uUmVzb3VyY2UsIHlpZWxkUmVxdWVzdGVkOiBmYWxzZSB9LCB0b2tlbik7XG5cdH1cbn1cblxuY2xhc3MgRXh0SG9zdFBhcnRpY2lwYW50RGV0ZWN0b3Ige1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIsXG5cdCkgeyB9XG59XG5cbmNsYXNzIEV4dEhvc3RDaGF0QWdlbnQge1xuXG5cdHByaXZhdGUgX2ZvbGxvd3VwUHJvdmlkZXI6IHZzY29kZS5DaGF0Rm9sbG93dXBQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaWNvblBhdGg6IHZzY29kZS5VcmkgfCB7IGxpZ2h0OiB2c2NvZGUuVXJpOyBkYXJrOiB2c2NvZGUuVXJpIH0gfCB2c2NvZGUuVGhlbWVJY29uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9oZWxwVGV4dFByZWZpeDogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9oZWxwVGV4dFBvc3RmaXg6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfb25EaWRSZWNlaXZlRmVlZGJhY2sgPSBuZXcgRW1pdHRlcjx2c2NvZGUuQ2hhdFJlc3VsdEZlZWRiYWNrPigpO1xuXHRwcml2YXRlIF9vbkRpZFBlcmZvcm1BY3Rpb24gPSBuZXcgRW1pdHRlcjx2c2NvZGUuQ2hhdFVzZXJBY3Rpb25FdmVudD4oKTtcblx0cHJpdmF0ZSBfc3VwcG9ydElzc3VlUmVwb3J0aW5nOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hZ2VudFZhcmlhYmxlUHJvdmlkZXI/OiB7IHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50Q29tcGxldGlvbkl0ZW1Qcm92aWRlcjsgdHJpZ2dlckNoYXJhY3RlcnM6IHN0cmluZ1tdIH07XG5cdHByaXZhdGUgX2FkZGl0aW9uYWxXZWxjb21lTWVzc2FnZT86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGl0bGVQcm92aWRlcj86IHZzY29kZS5DaGF0VGl0bGVQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3VtbWFyaXplcj86IHZzY29kZS5DaGF0U3VtbWFyaXplciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcGF1c2VTdGF0ZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2c2NvZGUuQ2hhdFBhcnRpY2lwYW50UGF1c2VTdGF0ZUV2ZW50PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZENoYXRBZ2VudHNTaGFwZTIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfcmVxdWVzdEhhbmRsZXI6IHZzY29kZS5DaGF0RXh0ZW5kZWRSZXF1ZXN0SGFuZGxlcixcblx0KSB7IH1cblxuXHRhY2NlcHRGZWVkYmFjayhmZWVkYmFjazogdnNjb2RlLkNoYXRSZXN1bHRGZWVkYmFjaykge1xuXHRcdHRoaXMuX29uRGlkUmVjZWl2ZUZlZWRiYWNrLmZpcmUoZmVlZGJhY2spO1xuXHR9XG5cblx0YWNjZXB0QWN0aW9uKGV2ZW50OiB2c2NvZGUuQ2hhdFVzZXJBY3Rpb25FdmVudCkge1xuXHRcdHRoaXMuX29uRGlkUGVyZm9ybUFjdGlvbi5maXJlKGV2ZW50KTtcblx0fVxuXG5cdHNldENoYXRSZXF1ZXN0UGF1c2VTdGF0ZShwYXVzZVN0YXRlOiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50UGF1c2VTdGF0ZUV2ZW50KSB7XG5cdFx0dGhpcy5fcGF1c2VTdGF0ZUVtaXR0ZXIuZmlyZShwYXVzZVN0YXRlKTtcblx0fVxuXG5cdGFzeW5jIGludm9rZUNvbXBsZXRpb25Qcm92aWRlcihxdWVyeTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5DaGF0Q29tcGxldGlvbkl0ZW1bXT4ge1xuXHRcdGlmICghdGhpcy5fYWdlbnRWYXJpYWJsZVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2FnZW50VmFyaWFibGVQcm92aWRlci5wcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKHF1ZXJ5LCB0b2tlbikgPz8gW107XG5cdH1cblxuXHRhc3luYyBwcm92aWRlRm9sbG93dXBzKHJlc3VsdDogdnNjb2RlLkNoYXRSZXN1bHQsIGNvbnRleHQ6IHZzY29kZS5DaGF0Q29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuQ2hhdEZvbGxvd3VwW10+IHtcblx0XHRpZiAoIXRoaXMuX2ZvbGxvd3VwUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xsb3d1cHMgPSBhd2FpdCB0aGlzLl9mb2xsb3d1cFByb3ZpZGVyLnByb3ZpZGVGb2xsb3d1cHMocmVzdWx0LCBjb250ZXh0LCB0b2tlbik7XG5cdFx0aWYgKCFmb2xsb3d1cHMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIGZvbGxvd3Vwc1xuXHRcdFx0Ly8gRmlsdGVyIG91dCBcImNvbW1hbmQgZm9sbG93dXBzXCIgZnJvbSBvbGRlciBwcm92aWRlcnNcblx0XHRcdC5maWx0ZXIoZiA9PiAhKGYgJiYgJ2NvbW1hbmRJZCcgaW4gZikpXG5cdFx0XHQvLyBGaWx0ZXIgb3V0IGZvbGxvd3VwcyBmcm9tIG9sZGVyIHByb3ZpZGVycyBiZWZvcmUgJ21lc3NhZ2UnIGNoYW5nZWQgdG8gJ3Byb21wdCdcblx0XHRcdC5maWx0ZXIoZiA9PiAhKGYgJiYgJ21lc3NhZ2UnIGluIGYpKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVUaXRsZShjb250ZXh0OiB2c2NvZGUuQ2hhdENvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl90aXRsZVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3RpdGxlUHJvdmlkZXIucHJvdmlkZUNoYXRUaXRsZShjb250ZXh0LCB0b2tlbikgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZVN1bW1hcnkoY29udGV4dDogdnNjb2RlLkNoYXRDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fc3VtbWFyaXplcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBhd2FpdCB0aGlzLl9zdW1tYXJpemVyLnByb3ZpZGVDaGF0U3VtbWFyeShjb250ZXh0LCB0b2tlbikgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IGFwaUFnZW50KCk6IHZzY29kZS5DaGF0UGFydGljaXBhbnQge1xuXHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGxldCB1cGRhdGVTY2hlZHVsZWQgPSBmYWxzZTtcblx0XHRjb25zdCB1cGRhdGVNZXRhZGF0YVNvb24gPSAoKSA9PiB7XG5cdFx0XHRpZiAoZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVwZGF0ZVNjaGVkdWxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR1cGRhdGVTY2hlZHVsZWQgPSB0cnVlO1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kdXBkYXRlQWdlbnQodGhpcy5faGFuZGxlLCB7XG5cdFx0XHRcdFx0aWNvbjogIXRoaXMuX2ljb25QYXRoID8gdW5kZWZpbmVkIDpcblx0XHRcdFx0XHRcdHRoaXMuX2ljb25QYXRoIGluc3RhbmNlb2YgVVJJID8gdGhpcy5faWNvblBhdGggOlxuXHRcdFx0XHRcdFx0XHQnbGlnaHQnIGluIHRoaXMuX2ljb25QYXRoID8gdGhpcy5faWNvblBhdGgubGlnaHQgOlxuXHRcdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpY29uRGFyazogIXRoaXMuX2ljb25QYXRoID8gdW5kZWZpbmVkIDpcblx0XHRcdFx0XHRcdCdkYXJrJyBpbiB0aGlzLl9pY29uUGF0aCA/IHRoaXMuX2ljb25QYXRoLmRhcmsgOlxuXHRcdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0dGhlbWVJY29uOiB0aGlzLl9pY29uUGF0aCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5UaGVtZUljb24gPyB0aGlzLl9pY29uUGF0aCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRoYXNGb2xsb3d1cHM6IHRoaXMuX2ZvbGxvd3VwUHJvdmlkZXIgIT09IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRoZWxwVGV4dFByZWZpeDogKCF0aGlzLl9oZWxwVGV4dFByZWZpeCB8fCB0eXBlb2YgdGhpcy5faGVscFRleHRQcmVmaXggPT09ICdzdHJpbmcnKSA/IHRoaXMuX2hlbHBUZXh0UHJlZml4IDogdHlwZUNvbnZlcnQuTWFya2Rvd25TdHJpbmcuZnJvbSh0aGlzLl9oZWxwVGV4dFByZWZpeCksXG5cdFx0XHRcdFx0aGVscFRleHRQb3N0Zml4OiAoIXRoaXMuX2hlbHBUZXh0UG9zdGZpeCB8fCB0eXBlb2YgdGhpcy5faGVscFRleHRQb3N0Zml4ID09PSAnc3RyaW5nJykgPyB0aGlzLl9oZWxwVGV4dFBvc3RmaXggOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tKHRoaXMuX2hlbHBUZXh0UG9zdGZpeCksXG5cdFx0XHRcdFx0c3VwcG9ydElzc3VlUmVwb3J0aW5nOiB0aGlzLl9zdXBwb3J0SXNzdWVSZXBvcnRpbmcsXG5cdFx0XHRcdFx0YWRkaXRpb25hbFdlbGNvbWVNZXNzYWdlOiAoIXRoaXMuX2FkZGl0aW9uYWxXZWxjb21lTWVzc2FnZSB8fCB0eXBlb2YgdGhpcy5fYWRkaXRpb25hbFdlbGNvbWVNZXNzYWdlID09PSAnc3RyaW5nJykgPyB0aGlzLl9hZGRpdGlvbmFsV2VsY29tZU1lc3NhZ2UgOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tKHRoaXMuX2FkZGl0aW9uYWxXZWxjb21lTWVzc2FnZSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR1cGRhdGVTY2hlZHVsZWQgPSBmYWxzZTtcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IGlkKCkge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5pZDtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaWNvblBhdGgoKSB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9pY29uUGF0aDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgaWNvblBhdGgodikge1xuXHRcdFx0XHR0aGF0Ll9pY29uUGF0aCA9IHY7XG5cdFx0XHRcdHVwZGF0ZU1ldGFkYXRhU29vbigpO1xuXHRcdFx0fSxcblx0XHRcdGdldCByZXF1ZXN0SGFuZGxlcigpIHtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3JlcXVlc3RIYW5kbGVyO1xuXHRcdFx0fSxcblx0XHRcdHNldCByZXF1ZXN0SGFuZGxlcih2KSB7XG5cdFx0XHRcdGFzc2VydFR5cGUodHlwZW9mIHYgPT09ICdmdW5jdGlvbicsICdJbnZhbGlkIHJlcXVlc3QgaGFuZGxlcicpO1xuXHRcdFx0XHR0aGF0Ll9yZXF1ZXN0SGFuZGxlciA9IHY7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGZvbGxvd3VwUHJvdmlkZXIoKSB7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9mb2xsb3d1cFByb3ZpZGVyO1xuXHRcdFx0fSxcblx0XHRcdHNldCBmb2xsb3d1cFByb3ZpZGVyKHYpIHtcblx0XHRcdFx0dGhhdC5fZm9sbG93dXBQcm92aWRlciA9IHY7XG5cdFx0XHRcdHVwZGF0ZU1ldGFkYXRhU29vbigpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBoZWxwVGV4dFByZWZpeCgpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdkZWZhdWx0Q2hhdFBhcnRpY2lwYW50Jyk7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9oZWxwVGV4dFByZWZpeDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgaGVscFRleHRQcmVmaXgodikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKTtcblx0XHRcdFx0dGhhdC5faGVscFRleHRQcmVmaXggPSB2O1xuXHRcdFx0XHR1cGRhdGVNZXRhZGF0YVNvb24oKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaGVscFRleHRQb3N0Zml4KCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2hlbHBUZXh0UG9zdGZpeDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgaGVscFRleHRQb3N0Zml4KHYpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdkZWZhdWx0Q2hhdFBhcnRpY2lwYW50Jyk7XG5cdFx0XHRcdHRoYXQuX2hlbHBUZXh0UG9zdGZpeCA9IHY7XG5cdFx0XHRcdHVwZGF0ZU1ldGFkYXRhU29vbigpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBzdXBwb3J0SXNzdWVSZXBvcnRpbmcoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fc3VwcG9ydElzc3VlUmVwb3J0aW5nO1xuXHRcdFx0fSxcblx0XHRcdHNldCBzdXBwb3J0SXNzdWVSZXBvcnRpbmcodikge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblx0XHRcdFx0dGhhdC5fc3VwcG9ydElzc3VlUmVwb3J0aW5nID0gdjtcblx0XHRcdFx0dXBkYXRlTWV0YWRhdGFTb29uKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkUmVjZWl2ZUZlZWRiYWNrKCkge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fb25EaWRSZWNlaXZlRmVlZGJhY2suZXZlbnQ7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHBhcnRpY2lwYW50VmFyaWFibGVQcm92aWRlcih2KSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cdFx0XHRcdHRoYXQuX2FnZW50VmFyaWFibGVQcm92aWRlciA9IHY7XG5cdFx0XHRcdGlmICh2KSB7XG5cdFx0XHRcdFx0aWYgKCF2LnRyaWdnZXJDaGFyYWN0ZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCd0cmlnZ2VyQ2hhcmFjdGVycyBhcmUgcmVxdWlyZWQnKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGF0Ll9wcm94eS4kcmVnaXN0ZXJBZ2VudENvbXBsZXRpb25zUHJvdmlkZXIodGhhdC5faGFuZGxlLCB0aGF0LmlkLCB2LnRyaWdnZXJDaGFyYWN0ZXJzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGF0Ll9wcm94eS4kdW5yZWdpc3RlckFnZW50Q29tcGxldGlvbnNQcm92aWRlcih0aGF0Ll9oYW5kbGUsIHRoYXQuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHBhcnRpY2lwYW50VmFyaWFibGVQcm92aWRlcigpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX2FnZW50VmFyaWFibGVQcm92aWRlcjtcblx0XHRcdH0sXG5cdFx0XHRzZXQgYWRkaXRpb25hbFdlbGNvbWVNZXNzYWdlKHYpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdkZWZhdWx0Q2hhdFBhcnRpY2lwYW50Jyk7XG5cdFx0XHRcdHRoYXQuX2FkZGl0aW9uYWxXZWxjb21lTWVzc2FnZSA9IHY7XG5cdFx0XHRcdHVwZGF0ZU1ldGFkYXRhU29vbigpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBhZGRpdGlvbmFsV2VsY29tZU1lc3NhZ2UoKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKHRoYXQuZXh0ZW5zaW9uLCAnZGVmYXVsdENoYXRQYXJ0aWNpcGFudCcpO1xuXHRcdFx0XHRyZXR1cm4gdGhhdC5fYWRkaXRpb25hbFdlbGNvbWVNZXNzYWdlO1xuXHRcdFx0fSxcblx0XHRcdHNldCB0aXRsZVByb3ZpZGVyKHYpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdkZWZhdWx0Q2hhdFBhcnRpY2lwYW50Jyk7XG5cdFx0XHRcdHRoYXQuX3RpdGxlUHJvdmlkZXIgPSB2O1xuXHRcdFx0XHR1cGRhdGVNZXRhZGF0YVNvb24oKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdGl0bGVQcm92aWRlcigpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdkZWZhdWx0Q2hhdFBhcnRpY2lwYW50Jyk7XG5cdFx0XHRcdHJldHVybiB0aGF0Ll90aXRsZVByb3ZpZGVyO1xuXHRcdFx0fSxcblx0XHRcdHNldCBzdW1tYXJpemVyKHYpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdkZWZhdWx0Q2hhdFBhcnRpY2lwYW50Jyk7XG5cdFx0XHRcdHRoYXQuX3N1bW1hcml6ZXIgPSB2O1xuXHRcdFx0fSxcblx0XHRcdGdldCBzdW1tYXJpemVyKCkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGF0LmV4dGVuc2lvbiwgJ2RlZmF1bHRDaGF0UGFydGljaXBhbnQnKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3N1bW1hcml6ZXI7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlUGF1c2VTdGF0ZSgpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQodGhhdC5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblx0XHRcdFx0cmV0dXJuIHRoYXQuX3BhdXNlU3RhdGVFbWl0dGVyLmV2ZW50O1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkUGVyZm9ybUFjdGlvbjogIWlzUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJylcblx0XHRcdFx0PyB1bmRlZmluZWQhXG5cdFx0XHRcdDogdGhpcy5fb25EaWRQZXJmb3JtQWN0aW9uLmV2ZW50XG5cdFx0XHQsXG5cdFx0XHRkaXNwb3NlKCkge1xuXHRcdFx0XHRkaXNwb3NlZCA9IHRydWU7XG5cdFx0XHRcdHRoYXQuX2ZvbGxvd3VwUHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoYXQuX29uRGlkUmVjZWl2ZUZlZWRiYWNrLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhhdC5fb25EaWRQZXJmb3JtQWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhhdC5fcGF1c2VTdGF0ZUVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGF0Ll9wcm94eS4kdW5yZWdpc3RlckFnZW50KHRoYXQuX2hhbmRsZSk7XG5cdFx0XHR9LFxuXHRcdH0gc2F0aXNmaWVzIHZzY29kZS5DaGF0UGFydGljaXBhbnQ7XG5cdH1cblxuXHRpbnZva2UocmVxdWVzdDogdnNjb2RlLkNoYXRSZXF1ZXN0LCBjb250ZXh0OiB2c2NvZGUuQ2hhdENvbnRleHQsIHJlc3BvbnNlOiB2c2NvZGUuQ2hhdFJlc3BvbnNlU3RyZWFtLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiB2c2NvZGUuUHJvdmlkZXJSZXN1bHQ8dnNjb2RlLkNoYXRSZXN1bHQgfCB2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVlc3RIYW5kbGVyKHJlcXVlc3QsIGNvbnRleHQsIHJlc3BvbnNlLCB0b2tlbik7XG5cdH1cbn1cblxuLyoqXG4gKiByYWNlQ2FuY2VsbGF0aW9uLCBidXQgZ2l2ZSB0aGUgcHJvbWlzZSBhIGxpdHRsZSB0aW1lIHRvIGNvbXBsZXRlIHRvIHNlZSBpZiB3ZSBjYW4gZ2V0IGEgcmVhbCByZXN1bHQgcXVpY2tseS5cbiAqL1xuZnVuY3Rpb24gcmFjZUNhbmNlbGxhdGlvbldpdGhUaW1lb3V0PFQ+KGNhbmNlbFdhaXQ6IG51bWJlciwgcHJvbWlzZTogUHJvbWlzZTxUPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgcmVmID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoY2FuY2VsV2FpdCk7XG5cdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdFx0cHJvbWlzZS50aGVuKHJlc29sdmUsIHJlamVjdCkuZmluYWxseSgoKSA9PiByZWYuZGlzcG9zZSgpKTtcblx0fSk7XG59XG5cbi8qKlxuICogTGF6aWx5IGNvbXB1dGVzIGFuZCBjYWNoZXMgYSBwcm9taXNlIHJlc3VsdCB1bnRpbCBleHBsaWNpdGx5IGNsZWFyZWQuXG4gKiBGYWlsZWQgY29tcHV0YXRpb25zIGFyZSBub3QgcmV0YWluZWQgc28gbGF0ZXIgY2FsbGVycyBjYW4gcmV0cnkuXG4gKi9cbmNsYXNzIENhY2hlZFByb21pc2U8VD4ge1xuXG5cdHByaXZhdGUgY2FjaGVkUHJvbWlzZTogUHJvbWlzZTxyZWFkb25seSBUW10+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgY29tcHV0ZUZuOiAoKSA9PiBQcm9taXNlPHJlYWRvbmx5IFRbXT4pIHsgfVxuXG5cdGdldCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IFRbXT4ge1xuXHRcdGlmICghdGhpcy5jYWNoZWRQcm9taXNlKSB7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5jb21wdXRlRm4oKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jYWNoZWRQcm9taXNlID09PSBwcm9taXNlKSB7XG5cdFx0XHRcdFx0dGhpcy5jYWNoZWRQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5jYWNoZWRQcm9taXNlID0gcHJvbWlzZTtcblx0XHR9XG5cblx0XHQvLyBFYWNoIGNhbGxlciBvYnNlcnZlcyB0aGUgc2hhcmVkIGNvbXB1dGF0aW9uIHRocm91Z2ggaXRzIG93biB0b2tlbiBzbyB0aGF0XG5cdFx0Ly8gb25lIGNhbGxlciBjYW5jZWxsaW5nIGRvZXMgbm90IGFmZmVjdCBjb25jdXJyZW50IGNhbGxlcnMuXG5cdFx0cmV0dXJuIHJhY2VDYW5jZWxsYXRpb25FcnJvcih0aGlzLmNhY2hlZFByb21pc2UsIHRva2VuKTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FjaGVkUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0J1aWx0aW5QYXJ0aWNpcGFudChhZ2VudElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGFnZW50SWQuc3RhcnRzV2l0aCgnZ2l0aHViLmNvcGlsb3QnKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLGtCQUFrQix1QkFBdUIsZUFBZTtBQUNsRixTQUFTLG1CQUFtQiwr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
