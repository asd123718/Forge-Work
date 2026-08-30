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
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { OS } from "../../../../../base/common/platform.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { ITerminalService } from "../../../terminal/browser/terminal.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IChatService } from "../../../chat/common/chatService/chatService.js";
import { generateAutoApproveActions } from "../../chatAgentTools/browser/runInTerminalHelpers.js";
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from "../../chatAgentTools/browser/treeSitterCommandParser.js";
import { CommandLineAutoApprover } from "../../chatAgentTools/browser/tools/commandLineAnalyzer/autoApprove/commandLineAutoApprover.js";
import { TerminalChatContextKeys } from "./terminalChat.js";
import { LocalChatSessionUri } from "../../../chat/common/model/chatUri.js";
import { isNumber, isString } from "../../../../../base/common/types.js";
var StorageKeys = /* @__PURE__ */ ((StorageKeys2) => {
  StorageKeys2["ToolSessionMappings"] = "terminalChat.toolSessionMappings";
  StorageKeys2["CommandIdMappings"] = "terminalChat.commandIdMappings";
  return StorageKeys2;
})(StorageKeys || {});
let TerminalChatService = class extends Disposable {
  constructor(_logService, _terminalService, _storageService, _contextKeyService, _chatService, _instantiationService) {
    super();
    this._logService = _logService;
    this._terminalService = _terminalService;
    this._storageService = _storageService;
    this._contextKeyService = _contextKeyService;
    this._chatService = _chatService;
    this._instantiationService = _instantiationService;
    this._terminalInstancesByToolSessionId = /* @__PURE__ */ new Map();
    this._toolSessionIdByTerminalInstance = /* @__PURE__ */ new Map();
    this._chatSessionResourceByTerminalInstance = /* @__PURE__ */ new Map();
    this._terminalInstanceListenersByToolSessionId = this._register(new DisposableMap());
    this._chatSessionListenersByTerminalInstance = this._register(new DisposableMap());
    this._terminalInstancesByExecutionId = /* @__PURE__ */ new Map();
    this._terminalInstanceListenersByExecutionId = this._register(new DisposableMap());
    this._ahpCommandSources = /* @__PURE__ */ new Map();
    this._outputSources = /* @__PURE__ */ new Map();
    this._onDidContinueInBackground = this._register(new Emitter());
    this.onDidContinueInBackground = this._onDidContinueInBackground.event;
    this._onDidRegisterTerminalInstanceForToolSession = this._register(new Emitter());
    this.onDidRegisterTerminalInstanceWithToolSession = this._onDidRegisterTerminalInstanceForToolSession.event;
    this._onDidRegisterOutputSource = this._register(new Emitter());
    this.onDidRegisterOutputSource = this._onDidRegisterOutputSource.event;
    this._activeProgressParts = /* @__PURE__ */ new Set();
    /**
     * Pending mappings restored from storage that have not yet been matched to a live terminal
     * instance (we match by persistentProcessId when it becomes available after reconnection).
     * toolSessionId -> persistentProcessId
     */
    this._pendingRestoredMappings = /* @__PURE__ */ new Map();
    /**
     * Tracks chat session resources that have auto approval enabled for all commands. This is a temporary
     * approval that lasts only for the duration of the session.
     */
    this._sessionAutoApprovalEnabled = new ResourceMap();
    /**
     * Tracks session-scoped auto-approve rules per chat session. These are temporary rules that
     * last only for the duration of the chat session (not persisted to disk).
     */
    this._sessionAutoApproveRules = new ResourceMap();
    this._hasToolTerminalContext = TerminalChatContextKeys.hasChatTerminals.bindTo(this._contextKeyService);
    this._hasHiddenToolTerminalContext = TerminalChatContextKeys.hasHiddenChatTerminals.bindTo(this._contextKeyService);
    this._restoreFromStorage();
    this._register(this._chatService.onDidDisposeSession((e) => {
      for (const resource of e.sessionResources) {
        this._sessionAutoApproveRules.delete(resource);
        this._sessionAutoApprovalEnabled.delete(resource);
      }
    }));
    this._register(this._terminalService.onDidChangeInstances(() => this._updateHasToolTerminalContextKeys()));
  }
  registerTerminalInstanceWithToolSession(terminalToolSessionId, instance) {
    if (!terminalToolSessionId) {
      this._logService.warn("Attempted to register a terminal instance with an undefined tool session ID");
      return;
    }
    const existingToolSessionId = this._toolSessionIdByTerminalInstance.get(instance);
    if (existingToolSessionId === terminalToolSessionId) {
      return;
    }
    if (existingToolSessionId !== void 0) {
      this._terminalInstanceListenersByToolSessionId.deleteAndDispose(existingToolSessionId);
      this._terminalInstancesByToolSessionId.delete(existingToolSessionId);
    }
    this._terminalInstancesByToolSessionId.set(terminalToolSessionId, instance);
    this._toolSessionIdByTerminalInstance.set(instance, terminalToolSessionId);
    this._onDidRegisterTerminalInstanceForToolSession.fire(instance);
    const instanceStore = new DisposableStore();
    instanceStore.add(instance.onDisposed(() => {
      this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
      this._toolSessionIdByTerminalInstance.delete(instance);
      this._terminalInstanceListenersByToolSessionId.deleteAndDispose(terminalToolSessionId);
      this._persistToStorage();
      this._updateHasToolTerminalContextKeys();
    }));
    instanceStore.add(this._chatService.onDidDisposeSession((e) => {
      for (const resource of e.sessionResources) {
        if (LocalChatSessionUri.parseLocalSessionId(resource) === terminalToolSessionId) {
          this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
          this._toolSessionIdByTerminalInstance.delete(instance);
          this._terminalInstanceListenersByToolSessionId.deleteAndDispose(terminalToolSessionId);
          this._sessionAutoApprovalEnabled.delete(resource);
          this._persistToStorage();
          this._updateHasToolTerminalContextKeys();
        }
      }
    }));
    this._terminalInstanceListenersByToolSessionId.set(terminalToolSessionId, instanceStore);
    if (isNumber(instance.shellLaunchConfig?.attachPersistentProcess?.id) || isNumber(instance.persistentProcessId)) {
      this._persistToStorage();
    }
    this._updateHasToolTerminalContextKeys();
  }
  async getTerminalInstanceByToolSessionId(terminalToolSessionId) {
    await this._terminalService.whenConnected;
    if (!terminalToolSessionId) {
      return void 0;
    }
    const pendingAhp = this._ahpCommandSources.get(terminalToolSessionId);
    if (pendingAhp) {
      try {
        return await pendingAhp.promisedTerminal;
      } catch (error) {
        this._logService.error(`Failed to resolve AHP terminal for tool session '${terminalToolSessionId}'`, error);
        return void 0;
      }
    }
    if (this._pendingRestoredMappings.has(terminalToolSessionId)) {
      const instance = this._terminalService.instances.find((i) => i.shellLaunchConfig.attachPersistentProcess?.id === this._pendingRestoredMappings.get(terminalToolSessionId));
      if (instance) {
        this._tryAdoptRestoredMapping(instance);
        return instance;
      }
    }
    return this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
  }
  getToolSessionTerminalInstances(hiddenOnly) {
    if (hiddenOnly) {
      const foregroundInstances = new Set(this._terminalService.foregroundInstances.map((i) => i.instanceId));
      const uniqueInstances = new Set(this._terminalInstancesByToolSessionId.values());
      return Array.from(uniqueInstances).filter((i) => !foregroundInstances.has(i.instanceId));
    }
    return Array.from(new Set(this._terminalInstancesByToolSessionId.values()));
  }
  getToolSessionIdForInstance(instance) {
    return this._toolSessionIdByTerminalInstance.get(instance);
  }
  registerTerminalInstanceWithExecutionId(terminalExecutionId, instance) {
    this._terminalInstanceListenersByExecutionId.deleteAndDispose(terminalExecutionId);
    this._terminalInstancesByExecutionId.set(terminalExecutionId, instance);
    const instanceStore = new DisposableStore();
    const unregister = () => {
      if (this._terminalInstancesByExecutionId.get(terminalExecutionId) !== instance) {
        return;
      }
      this._terminalInstancesByExecutionId.delete(terminalExecutionId);
      this._terminalInstanceListenersByExecutionId.deleteAndDispose(terminalExecutionId);
    };
    instanceStore.add(instance.onDisposed(unregister));
    this._terminalInstanceListenersByExecutionId.set(terminalExecutionId, instanceStore);
    return toDisposable(unregister);
  }
  getTerminalInstanceByExecutionId(terminalExecutionId) {
    return this._terminalInstancesByExecutionId.get(terminalExecutionId);
  }
  registerTerminalInstanceWithChatSession(chatSessionResource, instance) {
    const existingResource = this._chatSessionResourceByTerminalInstance.get(instance);
    if (existingResource && existingResource.toString() === chatSessionResource.toString()) {
      return;
    }
    this._chatSessionListenersByTerminalInstance.deleteAndDispose(instance);
    this._chatSessionResourceByTerminalInstance.set(instance, chatSessionResource);
    const disposable = instance.onDisposed(() => {
      this._chatSessionResourceByTerminalInstance.delete(instance);
      this._chatSessionListenersByTerminalInstance.deleteAndDispose(instance);
    });
    this._chatSessionListenersByTerminalInstance.set(instance, disposable);
  }
  getChatSessionResourceForInstance(instance) {
    return this._chatSessionResourceByTerminalInstance.get(instance);
  }
  registerOutputSource(terminalToolSessionId, source) {
    this._outputSources.set(terminalToolSessionId, source);
    this._onDidRegisterOutputSource.fire(terminalToolSessionId);
    return toDisposable(() => {
      if (this._outputSources.get(terminalToolSessionId) === source) {
        this._outputSources.delete(terminalToolSessionId);
      }
    });
  }
  getOutputSource(terminalToolSessionId) {
    return terminalToolSessionId ? this._outputSources.get(terminalToolSessionId) : void 0;
  }
  isBackgroundTerminal(terminalToolSessionId) {
    if (!terminalToolSessionId) {
      return false;
    }
    const instance = this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
    if (!instance) {
      return false;
    }
    return this._terminalService.instances.includes(instance) && !this._terminalService.foregroundInstances.includes(instance);
  }
  registerProgressPart(part) {
    this._activeProgressParts.add(part);
    if (this._isAfter(part, this._mostRecentProgressPart)) {
      this._mostRecentProgressPart = part;
    }
    return toDisposable(() => {
      this._activeProgressParts.delete(part);
      if (this._focusedProgressPart === part) {
        this._focusedProgressPart = void 0;
      }
      if (this._mostRecentProgressPart === part) {
        this._mostRecentProgressPart = this._getLastActiveProgressPart();
      }
    });
  }
  setFocusedProgressPart(part) {
    this._focusedProgressPart = part;
  }
  clearFocusedProgressPart(part) {
    if (this._focusedProgressPart === part) {
      this._focusedProgressPart = void 0;
    }
  }
  getFocusedProgressPart() {
    return this._focusedProgressPart;
  }
  getMostRecentProgressPart() {
    if (!this._mostRecentProgressPart || !this._activeProgressParts.has(this._mostRecentProgressPart)) {
      this._mostRecentProgressPart = this._getLastActiveProgressPart();
    }
    return this._mostRecentProgressPart;
  }
  _getLastActiveProgressPart() {
    let latest;
    for (const part of this._activeProgressParts) {
      if (this._isAfter(part, latest)) {
        latest = part;
      }
    }
    return latest;
  }
  _isAfter(candidate, current) {
    if (!current) {
      return true;
    }
    if (candidate.elementIndex === current.elementIndex) {
      return candidate.contentIndex >= current.contentIndex;
    }
    return candidate.elementIndex > current.elementIndex;
  }
  _restoreFromStorage() {
    try {
      const raw = this._storageService.get("terminalChat.toolSessionMappings" /* ToolSessionMappings */, StorageScope.WORKSPACE);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      for (const [toolSessionId, persistentProcessId] of parsed) {
        if (isString(toolSessionId) && isNumber(persistentProcessId)) {
          this._pendingRestoredMappings.set(toolSessionId, persistentProcessId);
        }
      }
    } catch (err) {
      this._logService.warn("Failed to restore terminal chat tool session mappings", err);
    }
  }
  _tryAdoptRestoredMapping(instance) {
    if (this._pendingRestoredMappings.size === 0) {
      return;
    }
    for (const [toolSessionId, persistentProcessId] of this._pendingRestoredMappings) {
      if (persistentProcessId === instance.shellLaunchConfig.attachPersistentProcess?.id) {
        this._terminalInstancesByToolSessionId.set(toolSessionId, instance);
        this._toolSessionIdByTerminalInstance.set(instance, toolSessionId);
        this._onDidRegisterTerminalInstanceForToolSession.fire(instance);
        this._terminalInstanceListenersByToolSessionId.set(toolSessionId, instance.onDisposed(() => {
          this._terminalInstancesByToolSessionId.delete(toolSessionId);
          this._toolSessionIdByTerminalInstance.delete(instance);
          this._terminalInstanceListenersByToolSessionId.deleteAndDispose(toolSessionId);
          this._persistToStorage();
        }));
        this._pendingRestoredMappings.delete(toolSessionId);
        this._persistToStorage();
        break;
      }
    }
  }
  _persistToStorage() {
    this._updateHasToolTerminalContextKeys();
    try {
      const entries = [];
      for (const [toolSessionId, instance] of this._terminalInstancesByToolSessionId.entries()) {
        const persistentId = isNumber(instance.persistentProcessId) ? instance.persistentProcessId : instance.shellLaunchConfig.attachPersistentProcess?.id;
        const shouldPersist = instance.shouldPersist || instance.shellLaunchConfig.forcePersist;
        if (isNumber(persistentId) && shouldPersist) {
          entries.push([toolSessionId, persistentId]);
        }
      }
      if (entries.length > 0) {
        this._storageService.store("terminalChat.toolSessionMappings" /* ToolSessionMappings */, JSON.stringify(entries), StorageScope.WORKSPACE, StorageTarget.MACHINE);
      } else {
        this._storageService.remove("terminalChat.toolSessionMappings" /* ToolSessionMappings */, StorageScope.WORKSPACE);
      }
    } catch (err) {
      this._logService.warn("Failed to persist terminal chat tool session mappings", err);
    }
  }
  _updateHasToolTerminalContextKeys() {
    const toolCount = this._terminalInstancesByToolSessionId.size;
    this._hasToolTerminalContext.set(toolCount > 0);
    const hiddenTerminalCount = this.getToolSessionTerminalInstances(true).length;
    this._hasHiddenToolTerminalContext.set(hiddenTerminalCount > 0);
  }
  setChatSessionAutoApproval(chatSessionResource, enabled) {
    if (enabled) {
      this._sessionAutoApprovalEnabled.set(chatSessionResource, true);
    } else {
      this._sessionAutoApprovalEnabled.delete(chatSessionResource);
    }
  }
  hasChatSessionAutoApproval(chatSessionResource) {
    return this._sessionAutoApprovalEnabled.has(chatSessionResource);
  }
  addSessionAutoApproveRule(chatSessionResource, key, value) {
    let sessionRules = this._sessionAutoApproveRules.get(chatSessionResource);
    if (!sessionRules) {
      sessionRules = {};
      this._sessionAutoApproveRules.set(chatSessionResource, sessionRules);
    }
    sessionRules[key] = value;
  }
  getSessionAutoApproveRules(chatSessionResource) {
    return this._sessionAutoApproveRules.get(chatSessionResource) ?? {};
  }
  async getAutoApproveActions(commandLine, language) {
    const trimmedCommandLine = commandLine.trimStart();
    if (trimmedCommandLine.length === 0) {
      return void 0;
    }
    this._autoApproveCommandParser ??= this._register(this._instantiationService.createInstance(TreeSitterCommandParser));
    const treeSitterLanguage = language === "powershell" ? TreeSitterCommandParserLanguage.PowerShell : TreeSitterCommandParserLanguage.Bash;
    let subCommands;
    try {
      const parseResult = await this._autoApproveCommandParser.extractAutoApprovalSubCommands(treeSitterLanguage, trimmedCommandLine);
      if (parseResult.hasUnanalyzableSyntax) {
        return void 0;
      }
      subCommands = parseResult.subCommands;
    } catch (e) {
      this._logService.warn("Failed to parse sub-commands when generating auto approve actions", e);
      return void 0;
    }
    if (subCommands.length === 0) {
      return void 0;
    }
    const shell = language === "powershell" ? "pwsh" : "bash";
    const evaluator = this._autoApproveEvaluator ??= this._register(this._instantiationService.createInstance(CommandLineAutoApprover));
    const subCommandResults = await Promise.all(subCommands.map((e) => evaluator.isCommandAutoApproved(e, shell, OS, void 0)));
    const commandLineResult = evaluator.isCommandLineAutoApproved(trimmedCommandLine);
    return generateAutoApproveActions(trimmedCommandLine, subCommands, { subCommandResults, commandLineResult }, { skipSessionScoped: true });
  }
  continueInBackground(terminalToolSessionId) {
    this._onDidContinueInBackground.fire(terminalToolSessionId);
  }
  registerAhpCommandSource(terminalToolSessionId, source, promisedTerminal) {
    this._ahpCommandSources.set(terminalToolSessionId, { source, promisedTerminal });
    return toDisposable(() => {
      if (this._ahpCommandSources.get(terminalToolSessionId)?.source === source) {
        this._ahpCommandSources.delete(terminalToolSessionId);
      }
    });
  }
  getAhpCommandSource(terminalToolSessionId) {
    return this._ahpCommandSources.get(terminalToolSessionId)?.source;
  }
};
TerminalChatService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ITerminalService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IInstantiationService)
], TerminalChatService);
export {
  TerminalChatService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdFxcYnJvd3NlclxcdGVybWluYWxDaGF0U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWhwVGVybWluYWxDb21tYW5kU291cmNlLCBJQ2hhdFRlcm1pbmFsT3V0cHV0U291cmNlLCBJQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCwgSVRlcm1pbmFsQ2hhdFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBUb29sQ29uZmlybWF0aW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyB9IGZyb20gJy4uLy4uL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvcnVuSW5UZXJtaW5hbEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgVHJlZVNpdHRlckNvbW1hbmRQYXJzZXIsIFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyTGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi9jaGF0QWdlbnRUb29scy9icm93c2VyL3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLmpzJztcbmltcG9ydCB7IENvbW1hbmRMaW5lQXV0b0FwcHJvdmVyIH0gZnJvbSAnLi4vLi4vY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy9jb21tYW5kTGluZUFuYWx5emVyL2F1dG9BcHByb3ZlL2NvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi90ZXJtaW5hbENoYXQuanMnO1xuaW1wb3J0IHsgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5jb25zdCBlbnVtIFN0b3JhZ2VLZXlzIHtcblx0VG9vbFNlc3Npb25NYXBwaW5ncyA9ICd0ZXJtaW5hbENoYXQudG9vbFNlc3Npb25NYXBwaW5ncycsXG5cdENvbW1hbmRJZE1hcHBpbmdzID0gJ3Rlcm1pbmFsQ2hhdC5jb21tYW5kSWRNYXBwaW5ncydcbn1cblxuXG4vKipcbiAqIFVzZWQgdG8gbWFuYWdlIGNoYXQgdG9vbCBpbnZvY2F0aW9ucyBhbmQgdGhlIHVuZGVybHlpbmcgdGVybWluYWwgaW5zdGFuY2VzIHRoZXkgY3JlYXRlL3VzZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFRlcm1pbmFsQ2hhdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlcm1pbmFsQ2hhdFNlcnZpY2Uge1xuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEluc3RhbmNlc0J5VG9vbFNlc3Npb25JZCA9IG5ldyBNYXA8c3RyaW5nLCBJVGVybWluYWxJbnN0YW5jZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbFNlc3Npb25JZEJ5VGVybWluYWxJbnN0YW5jZSA9IG5ldyBNYXA8SVRlcm1pbmFsSW5zdGFuY2UsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25SZXNvdXJjZUJ5VGVybWluYWxJbnN0YW5jZSA9IG5ldyBNYXA8SVRlcm1pbmFsSW5zdGFuY2UsIFVSST4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxJbnN0YW5jZUxpc3RlbmVyc0J5VG9vbFNlc3Npb25JZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgSURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2Vzc2lvbkxpc3RlbmVyc0J5VGVybWluYWxJbnN0YW5jZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPElUZXJtaW5hbEluc3RhbmNlLCBJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsSW5zdGFuY2VzQnlFeGVjdXRpb25JZCA9IG5ldyBNYXA8c3RyaW5nLCBJVGVybWluYWxJbnN0YW5jZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxJbnN0YW5jZUxpc3RlbmVyc0J5RXhlY3V0aW9uSWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWhwQ29tbWFuZFNvdXJjZXMgPSBuZXcgTWFwPHN0cmluZywgeyBzb3VyY2U6IElBaHBUZXJtaW5hbENvbW1hbmRTb3VyY2U7IHByb21pc2VkVGVybWluYWw6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+IH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX291dHB1dFNvdXJjZXMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRUZXJtaW5hbE91dHB1dFNvdXJjZT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENvbnRpbnVlSW5CYWNrZ3JvdW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDb250aW51ZUluQmFja2dyb3VuZDogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkQ29udGludWVJbkJhY2tncm91bmQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlRm9yVG9vbFNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlV2l0aFRvb2xTZXNzaW9uOiBFdmVudDxJVGVybWluYWxJbnN0YW5jZT4gPSB0aGlzLl9vbkRpZFJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZUZvclRvb2xTZXNzaW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlZ2lzdGVyT3V0cHV0U291cmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWdpc3Rlck91dHB1dFNvdXJjZTogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkUmVnaXN0ZXJPdXRwdXRTb3VyY2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlUHJvZ3Jlc3NQYXJ0cyA9IG5ldyBTZXQ8SUNoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQ+KCk7XG5cdHByaXZhdGUgX2ZvY3VzZWRQcm9ncmVzc1BhcnQ6IElDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb3N0UmVjZW50UHJvZ3Jlc3NQYXJ0OiBJQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUGVuZGluZyBtYXBwaW5ncyByZXN0b3JlZCBmcm9tIHN0b3JhZ2UgdGhhdCBoYXZlIG5vdCB5ZXQgYmVlbiBtYXRjaGVkIHRvIGEgbGl2ZSB0ZXJtaW5hbFxuXHQgKiBpbnN0YW5jZSAod2UgbWF0Y2ggYnkgcGVyc2lzdGVudFByb2Nlc3NJZCB3aGVuIGl0IGJlY29tZXMgYXZhaWxhYmxlIGFmdGVyIHJlY29ubmVjdGlvbikuXG5cdCAqIHRvb2xTZXNzaW9uSWQgLT4gcGVyc2lzdGVudFByb2Nlc3NJZFxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Jlc3RvcmVkTWFwcGluZ3MgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc1Rvb2xUZXJtaW5hbENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNIaWRkZW5Ub29sVGVybWluYWxDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHQvKipcblx0ICogVHJhY2tzIGNoYXQgc2Vzc2lvbiByZXNvdXJjZXMgdGhhdCBoYXZlIGF1dG8gYXBwcm92YWwgZW5hYmxlZCBmb3IgYWxsIGNvbW1hbmRzLiBUaGlzIGlzIGEgdGVtcG9yYXJ5XG5cdCAqIGFwcHJvdmFsIHRoYXQgbGFzdHMgb25seSBmb3IgdGhlIGR1cmF0aW9uIG9mIHRoZSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkF1dG9BcHByb3ZhbEVuYWJsZWQgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblxuXHQvKipcblx0ICogVHJhY2tzIHNlc3Npb24tc2NvcGVkIGF1dG8tYXBwcm92ZSBydWxlcyBwZXIgY2hhdCBzZXNzaW9uLiBUaGVzZSBhcmUgdGVtcG9yYXJ5IHJ1bGVzIHRoYXRcblx0ICogbGFzdCBvbmx5IGZvciB0aGUgZHVyYXRpb24gb2YgdGhlIGNoYXQgc2Vzc2lvbiAobm90IHBlcnNpc3RlZCB0byBkaXNrKS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25BdXRvQXBwcm92ZVJ1bGVzID0gbmV3IFJlc291cmNlTWFwPFJlY29yZDxzdHJpbmcsIGJvb2xlYW4gfCB7IGFwcHJvdmU6IGJvb2xlYW47IG1hdGNoQ29tbWFuZExpbmU/OiBib29sZWFuIH0+PigpO1xuXG5cdC8qKlxuXHQgKiBMYXppbHkgY3JlYXRlZCBhbmFseXNpcyBoZWxwZXJzIGJhY2tpbmcge0BsaW5rIGdldEF1dG9BcHByb3ZlQWN0aW9uc30uIFRoZXNlIGFyZSBvbmx5XG5cdCAqIG5lZWRlZCBmb3IgY29uZmlybWF0aW9ucyB0aGF0IGFycml2ZSB3aXRob3V0IHByZS1jb21wdXRlZCBhY3Rpb25zIChlZy4gYWdlbnQgaG9zdFxuXHQgKiBzZXNzaW9ucyksIHNvIGF2b2lkIHBheWluZyBmb3IgdHJlZS1zaXR0ZXIgdW50aWwgZmlyc3QgdXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXV0b0FwcHJvdmVDb21tYW5kUGFyc2VyOiBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYXV0b0FwcHJvdmVFdmFsdWF0b3I6IENvbW1hbmRMaW5lQXV0b0FwcHJvdmVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faGFzVG9vbFRlcm1pbmFsQ29udGV4dCA9IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLmhhc0NoYXRUZXJtaW5hbHMuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNIaWRkZW5Ub29sVGVybWluYWxDb250ZXh0ID0gVGVybWluYWxDaGF0Q29udGV4dEtleXMuaGFzSGlkZGVuQ2hhdFRlcm1pbmFscy5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVzdG9yZUZyb21TdG9yYWdlKCk7XG5cblx0XHQvLyBDbGVhciBzZXNzaW9uIGF1dG8tYXBwcm92ZSBydWxlcyB3aGVuIGNoYXQgc2Vzc2lvbnMgZW5kXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFNlcnZpY2Uub25EaWREaXNwb3NlU2Vzc2lvbihlID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZS5zZXNzaW9uUmVzb3VyY2VzKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25BdXRvQXBwcm92ZVJ1bGVzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25BdXRvQXBwcm92YWxFbmFibGVkLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVXBkYXRlIGNvbnRleHQga2V5cyB3aGVuIHRlcm1pbmFsIGluc3RhbmNlcyBjaGFuZ2UgKHJlZ2lzdGVyZWQgb25jZSwgbm90IHBlci1yZWdpc3RyYXRpb24pXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlSW5zdGFuY2VzKCgpID0+IHRoaXMuX3VwZGF0ZUhhc1Rvb2xUZXJtaW5hbENvbnRleHRLZXlzKCkpKTtcblx0fVxuXG5cdHJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZVdpdGhUb29sU2Vzc2lvbih0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0aWYgKCF0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignQXR0ZW1wdGVkIHRvIHJlZ2lzdGVyIGEgdGVybWluYWwgaW5zdGFuY2Ugd2l0aCBhbiB1bmRlZmluZWQgdG9vbCBzZXNzaW9uIElEJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIElmIHRoZSBpbnN0YW5jZSBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQgd2l0aCB0aGUgc2FtZSB0b29sIHNlc3Npb24gaWQsIHNraXAgdG8gYXZvaWRcblx0XHQvLyBhY2N1bXVsYXRpbmcgZHVwbGljYXRlIGBvbkRpZERpc3Bvc2VTZXNzaW9uYC9gb25EaXNwb3NlZGAgbGlzdGVuZXJzIChzZWUgIzMwOTkwNikuXG5cdFx0Y29uc3QgZXhpc3RpbmdUb29sU2Vzc2lvbklkID0gdGhpcy5fdG9vbFNlc3Npb25JZEJ5VGVybWluYWxJbnN0YW5jZS5nZXQoaW5zdGFuY2UpO1xuXHRcdGlmIChleGlzdGluZ1Rvb2xTZXNzaW9uSWQgPT09IHRlcm1pbmFsVG9vbFNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUaGUgaW5zdGFuY2Ugd2FzIHByZXZpb3VzbHkgcmVnaXN0ZXJlZCB1bmRlciBhIGRpZmZlcmVudCB0b29sIHNlc3Npb24gaWQuIENsZWFuIHVwIHRoZVxuXHRcdC8vIHN0YWxlIGxpc3RlbmVyICsgbWFwcGluZyBiZWZvcmUgaW5zdGFsbGluZyB0aGUgbmV3IG9uZXMgc28gd2Uga2VlcCBhdCBtb3N0IG9uZSBzZXQgb2Zcblx0XHQvLyBsaXN0ZW5lcnMgcGVyIGluc3RhbmNlLCByZWdhcmRsZXNzIG9mIGhvdyBvZnRlbiBpdCBpcyByZS1yZWdpc3RlcmVkLlxuXHRcdGlmIChleGlzdGluZ1Rvb2xTZXNzaW9uSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZUxpc3RlbmVyc0J5VG9vbFNlc3Npb25JZC5kZWxldGVBbmREaXNwb3NlKGV4aXN0aW5nVG9vbFNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlc0J5VG9vbFNlc3Npb25JZC5kZWxldGUoZXhpc3RpbmdUb29sU2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZXNCeVRvb2xTZXNzaW9uSWQuc2V0KHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgaW5zdGFuY2UpO1xuXHRcdHRoaXMuX3Rvb2xTZXNzaW9uSWRCeVRlcm1pbmFsSW5zdGFuY2Uuc2V0KGluc3RhbmNlLCB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdHRoaXMuX29uRGlkUmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlRm9yVG9vbFNlc3Npb24uZmlyZShpbnN0YW5jZSk7XG5cdFx0Y29uc3QgaW5zdGFuY2VTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW5jZVN0b3JlLmFkZChpbnN0YW5jZS5vbkRpc3Bvc2VkKCgpID0+IHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzQnlUb29sU2Vzc2lvbklkLmRlbGV0ZSh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0dGhpcy5fdG9vbFNlc3Npb25JZEJ5VGVybWluYWxJbnN0YW5jZS5kZWxldGUoaW5zdGFuY2UpO1xuXHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZUxpc3RlbmVyc0J5VG9vbFNlc3Npb25JZC5kZWxldGVBbmREaXNwb3NlKHRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl9wZXJzaXN0VG9TdG9yYWdlKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVIYXNUb29sVGVybWluYWxDb250ZXh0S2V5cygpO1xuXHRcdH0pKTtcblx0XHRpbnN0YW5jZVN0b3JlLmFkZCh0aGlzLl9jaGF0U2VydmljZS5vbkRpZERpc3Bvc2VTZXNzaW9uKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBlLnNlc3Npb25SZXNvdXJjZXMpIHtcblx0XHRcdFx0aWYgKExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChyZXNvdXJjZSkgPT09IHRlcm1pbmFsVG9vbFNlc3Npb25JZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzQnlUb29sU2Vzc2lvbklkLmRlbGV0ZSh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0XHRcdHRoaXMuX3Rvb2xTZXNzaW9uSWRCeVRlcm1pbmFsSW5zdGFuY2UuZGVsZXRlKGluc3RhbmNlKTtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlTGlzdGVuZXJzQnlUb29sU2Vzc2lvbklkLmRlbGV0ZUFuZERpc3Bvc2UodGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRcdFx0XHQvLyBDbGVhbiB1cCBzZXNzaW9uIGF1dG8gYXBwcm92YWwgc3RhdGVcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uQXV0b0FwcHJvdmFsRW5hYmxlZC5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMuX3BlcnNpc3RUb1N0b3JhZ2UoKTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVIYXNUb29sVGVybWluYWxDb250ZXh0S2V5cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VMaXN0ZW5lcnNCeVRvb2xTZXNzaW9uSWQuc2V0KHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgaW5zdGFuY2VTdG9yZSk7XG5cblx0XHRpZiAoaXNOdW1iZXIoaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWc/LmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5pZCkgfHwgaXNOdW1iZXIoaW5zdGFuY2UucGVyc2lzdGVudFByb2Nlc3NJZCkpIHtcblx0XHRcdHRoaXMuX3BlcnNpc3RUb1N0b3JhZ2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVIYXNUb29sVGVybWluYWxDb250ZXh0S2V5cygpO1xuXHR9XG5cblx0YXN5bmMgZ2V0VGVybWluYWxJbnN0YW5jZUJ5VG9vbFNlc3Npb25JZCh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2Uud2hlbkNvbm5lY3RlZDtcblx0XHRpZiAoIXRlcm1pbmFsVG9vbFNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGVuZGluZ0FocCA9IHRoaXMuX2FocENvbW1hbmRTb3VyY2VzLmdldCh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdGlmIChwZW5kaW5nQWhwKSB7XG5cdFx0XHQvLyBJZiB0aGVyZSdzIGFuIEFIUCB0ZXJtaW5hbCBiZWluZyBjcmVhdGVkLCB0aGlzIGlzIGFzeW5jIHRvIHRoZSB0b29sXG5cdFx0XHQvLyByZXN1bHQsIHNvIHdhaXQgZm9yIGl0IHRvIHNldHRsZSBiZWZvcmUgY29udGludWluZy5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBwZW5kaW5nQWhwLnByb21pc2VkVGVybWluYWw7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gcmVzb2x2ZSBBSFAgdGVybWluYWwgZm9yIHRvb2wgc2Vzc2lvbiAnJHt0ZXJtaW5hbFRvb2xTZXNzaW9uSWR9J2AsIGVycm9yKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcGVuZGluZ1Jlc3RvcmVkTWFwcGluZ3MuaGFzKHRlcm1pbmFsVG9vbFNlc3Npb25JZCkpIHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcy5maW5kKGkgPT4gaS5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8uaWQgPT09IHRoaXMuX3BlbmRpbmdSZXN0b3JlZE1hcHBpbmdzLmdldCh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpKTtcblx0XHRcdGlmIChpbnN0YW5jZSkge1xuXHRcdFx0XHR0aGlzLl90cnlBZG9wdFJlc3RvcmVkTWFwcGluZyhpbnN0YW5jZSk7XG5cdFx0XHRcdHJldHVybiBpbnN0YW5jZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzQnlUb29sU2Vzc2lvbklkLmdldCh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHR9XG5cblx0Z2V0VG9vbFNlc3Npb25UZXJtaW5hbEluc3RhbmNlcyhoaWRkZW5Pbmx5PzogYm9vbGVhbik6IHJlYWRvbmx5IElUZXJtaW5hbEluc3RhbmNlW10ge1xuXHRcdGlmIChoaWRkZW5Pbmx5KSB7XG5cdFx0XHRjb25zdCBmb3JlZ3JvdW5kSW5zdGFuY2VzID0gbmV3IFNldCh0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZm9yZWdyb3VuZEluc3RhbmNlcy5tYXAoaSA9PiBpLmluc3RhbmNlSWQpKTtcblx0XHRcdGNvbnN0IHVuaXF1ZUluc3RhbmNlcyA9IG5ldyBTZXQodGhpcy5fdGVybWluYWxJbnN0YW5jZXNCeVRvb2xTZXNzaW9uSWQudmFsdWVzKCkpO1xuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20odW5pcXVlSW5zdGFuY2VzKS5maWx0ZXIoaSA9PiAhZm9yZWdyb3VuZEluc3RhbmNlcy5oYXMoaS5pbnN0YW5jZUlkKSk7XG5cdFx0fVxuXHRcdC8vIEVuc3VyZSB1bmlxdWUgaW5zdGFuY2VzIGluIGNhc2UgbXVsdGlwbGUgdG9vbCBzZXNzaW9ucyBtYXAgdG8gdGhlIHNhbWUgdGVybWluYWxcblx0XHRyZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzQnlUb29sU2Vzc2lvbklkLnZhbHVlcygpKSk7XG5cdH1cblxuXHRnZXRUb29sU2Vzc2lvbklkRm9ySW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9vbFNlc3Npb25JZEJ5VGVybWluYWxJbnN0YW5jZS5nZXQoaW5zdGFuY2UpO1xuXHR9XG5cblx0cmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlV2l0aEV4ZWN1dGlvbklkKHRlcm1pbmFsRXhlY3V0aW9uSWQ6IHN0cmluZywgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogSURpc3Bvc2FibGUge1xuXHRcdC8vIElmIHRoaXMgaWQgaXMgYWxyZWFkeSByZWdpc3RlcmVkIChyZS1yZWdpc3RyYXRpb24pLCBkaXNwb3NlIHRoZSBwcmV2aW91cyBsaXN0ZW5lclxuXHRcdC8vIHN0b3JlIGZpcnN0IHNvIHdlIGRvbid0IGxlYWsgbGlzdGVuZXJzLiBUaGUgbmV3IHJlZ2lzdHJhdGlvbiByZXBsYWNlcyB0aGUgbWFwcGluZ1xuXHRcdC8vIGFuZCBpbnN0YWxscyBpdHMgb3duIG9uRGlzcG9zZWQgbGlzdGVuZXIgYmVsb3cuXG5cdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZUxpc3RlbmVyc0J5RXhlY3V0aW9uSWQuZGVsZXRlQW5kRGlzcG9zZSh0ZXJtaW5hbEV4ZWN1dGlvbklkKTtcblx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlc0J5RXhlY3V0aW9uSWQuc2V0KHRlcm1pbmFsRXhlY3V0aW9uSWQsIGluc3RhbmNlKTtcblx0XHRjb25zdCBpbnN0YW5jZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHVucmVnaXN0ZXIgPSAoKSA9PiB7XG5cdFx0XHQvLyBPbmx5IHRlYXIgZG93biB0aGUgbWFwcGluZy9saXN0ZW5lciBpZiBpdCBzdGlsbCBwb2ludHMgYXQgdGhpcyBpbnN0YW5jZS5cblx0XHRcdC8vIElmIGEgbmV3ZXIgcmVnaXN0cmF0aW9uIGhhcyByZXBsYWNlZCB1cywgbGVhdmUgaXRzIHN0YXRlIGFsb25lLlxuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzQnlFeGVjdXRpb25JZC5nZXQodGVybWluYWxFeGVjdXRpb25JZCkgIT09IGluc3RhbmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzQnlFeGVjdXRpb25JZC5kZWxldGUodGVybWluYWxFeGVjdXRpb25JZCk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlTGlzdGVuZXJzQnlFeGVjdXRpb25JZC5kZWxldGVBbmREaXNwb3NlKHRlcm1pbmFsRXhlY3V0aW9uSWQpO1xuXHRcdH07XG5cdFx0aW5zdGFuY2VTdG9yZS5hZGQoaW5zdGFuY2Uub25EaXNwb3NlZCh1bnJlZ2lzdGVyKSk7XG5cdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZUxpc3RlbmVyc0J5RXhlY3V0aW9uSWQuc2V0KHRlcm1pbmFsRXhlY3V0aW9uSWQsIGluc3RhbmNlU3RvcmUpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUodW5yZWdpc3Rlcik7XG5cdH1cblxuXHRnZXRUZXJtaW5hbEluc3RhbmNlQnlFeGVjdXRpb25JZCh0ZXJtaW5hbEV4ZWN1dGlvbklkOiBzdHJpbmcpOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzQnlFeGVjdXRpb25JZC5nZXQodGVybWluYWxFeGVjdXRpb25JZCk7XG5cdH1cblxuXHRyZWdpc3RlclRlcm1pbmFsSW5zdGFuY2VXaXRoQ2hhdFNlc3Npb24oY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHQvLyBJZiBhbHJlYWR5IHJlZ2lzdGVyZWQgd2l0aCB0aGUgc2FtZSBzZXNzaW9uLCBza2lwIHRvIGF2b2lkIGR1cGxpY2F0ZSBsaXN0ZW5lcnNcblx0XHRjb25zdCBleGlzdGluZ1Jlc291cmNlID0gdGhpcy5fY2hhdFNlc3Npb25SZXNvdXJjZUJ5VGVybWluYWxJbnN0YW5jZS5nZXQoaW5zdGFuY2UpO1xuXHRcdGlmIChleGlzdGluZ1Jlc291cmNlICYmIGV4aXN0aW5nUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gY2hhdFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYW4gdXAgcHJldmlvdXMgbGlzdGVuZXIgaWYgdGhlIGluc3RhbmNlIHdhcyByZWdpc3RlcmVkIHdpdGggYSBkaWZmZXJlbnQgc2Vzc2lvblxuXHRcdHRoaXMuX2NoYXRTZXNzaW9uTGlzdGVuZXJzQnlUZXJtaW5hbEluc3RhbmNlLmRlbGV0ZUFuZERpc3Bvc2UoaW5zdGFuY2UpO1xuXG5cdFx0dGhpcy5fY2hhdFNlc3Npb25SZXNvdXJjZUJ5VGVybWluYWxJbnN0YW5jZS5zZXQoaW5zdGFuY2UsIGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdC8vIENsZWFuIHVwIHdoZW4gdGhlIGluc3RhbmNlIGlzIGRpc3Bvc2VkXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGluc3RhbmNlLm9uRGlzcG9zZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2hhdFNlc3Npb25SZXNvdXJjZUJ5VGVybWluYWxJbnN0YW5jZS5kZWxldGUoaW5zdGFuY2UpO1xuXHRcdFx0dGhpcy5fY2hhdFNlc3Npb25MaXN0ZW5lcnNCeVRlcm1pbmFsSW5zdGFuY2UuZGVsZXRlQW5kRGlzcG9zZShpbnN0YW5jZSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fY2hhdFNlc3Npb25MaXN0ZW5lcnNCeVRlcm1pbmFsSW5zdGFuY2Uuc2V0KGluc3RhbmNlLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdGdldENoYXRTZXNzaW9uUmVzb3VyY2VGb3JJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0U2Vzc2lvblJlc291cmNlQnlUZXJtaW5hbEluc3RhbmNlLmdldChpbnN0YW5jZSk7XG5cdH1cblxuXHRyZWdpc3Rlck91dHB1dFNvdXJjZSh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZywgc291cmNlOiBJQ2hhdFRlcm1pbmFsT3V0cHV0U291cmNlKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX291dHB1dFNvdXJjZXMuc2V0KHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgc291cmNlKTtcblx0XHR0aGlzLl9vbkRpZFJlZ2lzdGVyT3V0cHV0U291cmNlLmZpcmUodGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9vdXRwdXRTb3VyY2VzLmdldCh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpID09PSBzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5fb3V0cHV0U291cmNlcy5kZWxldGUodGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGdldE91dHB1dFNvdXJjZSh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElDaGF0VGVybWluYWxPdXRwdXRTb3VyY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0ZXJtaW5hbFRvb2xTZXNzaW9uSWQgPyB0aGlzLl9vdXRwdXRTb3VyY2VzLmdldCh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0aXNCYWNrZ3JvdW5kVGVybWluYWwodGVybWluYWxUb29sU2Vzc2lvbklkPzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbEluc3RhbmNlc0J5VG9vbFNlc3Npb25JZC5nZXQodGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuaW5zdGFuY2VzLmluY2x1ZGVzKGluc3RhbmNlKSAmJiAhdGhpcy5fdGVybWluYWxTZXJ2aWNlLmZvcmVncm91bmRJbnN0YW5jZXMuaW5jbHVkZXMoaW5zdGFuY2UpO1xuXHR9XG5cblx0cmVnaXN0ZXJQcm9ncmVzc1BhcnQocGFydDogSUNoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fYWN0aXZlUHJvZ3Jlc3NQYXJ0cy5hZGQocGFydCk7XG5cdFx0aWYgKHRoaXMuX2lzQWZ0ZXIocGFydCwgdGhpcy5fbW9zdFJlY2VudFByb2dyZXNzUGFydCkpIHtcblx0XHRcdHRoaXMuX21vc3RSZWNlbnRQcm9ncmVzc1BhcnQgPSBwYXJ0O1xuXHRcdH1cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2FjdGl2ZVByb2dyZXNzUGFydHMuZGVsZXRlKHBhcnQpO1xuXHRcdFx0aWYgKHRoaXMuX2ZvY3VzZWRQcm9ncmVzc1BhcnQgPT09IHBhcnQpIHtcblx0XHRcdFx0dGhpcy5fZm9jdXNlZFByb2dyZXNzUGFydCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9tb3N0UmVjZW50UHJvZ3Jlc3NQYXJ0ID09PSBwYXJ0KSB7XG5cdFx0XHRcdHRoaXMuX21vc3RSZWNlbnRQcm9ncmVzc1BhcnQgPSB0aGlzLl9nZXRMYXN0QWN0aXZlUHJvZ3Jlc3NQYXJ0KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRGb2N1c2VkUHJvZ3Jlc3NQYXJ0KHBhcnQ6IElDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0KTogdm9pZCB7XG5cdFx0dGhpcy5fZm9jdXNlZFByb2dyZXNzUGFydCA9IHBhcnQ7XG5cdH1cblxuXHRjbGVhckZvY3VzZWRQcm9ncmVzc1BhcnQocGFydDogSUNoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZm9jdXNlZFByb2dyZXNzUGFydCA9PT0gcGFydCkge1xuXHRcdFx0dGhpcy5fZm9jdXNlZFByb2dyZXNzUGFydCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRnZXRGb2N1c2VkUHJvZ3Jlc3NQYXJ0KCk6IElDaGF0VGVybWluYWxUb29sUHJvZ3Jlc3NQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXNlZFByb2dyZXNzUGFydDtcblx0fVxuXG5cdGdldE1vc3RSZWNlbnRQcm9ncmVzc1BhcnQoKTogSUNoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fbW9zdFJlY2VudFByb2dyZXNzUGFydCB8fCAhdGhpcy5fYWN0aXZlUHJvZ3Jlc3NQYXJ0cy5oYXModGhpcy5fbW9zdFJlY2VudFByb2dyZXNzUGFydCkpIHtcblx0XHRcdHRoaXMuX21vc3RSZWNlbnRQcm9ncmVzc1BhcnQgPSB0aGlzLl9nZXRMYXN0QWN0aXZlUHJvZ3Jlc3NQYXJ0KCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb3N0UmVjZW50UHJvZ3Jlc3NQYXJ0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TGFzdEFjdGl2ZVByb2dyZXNzUGFydCgpOiBJQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGxhdGVzdDogSUNoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMuX2FjdGl2ZVByb2dyZXNzUGFydHMpIHtcblx0XHRcdGlmICh0aGlzLl9pc0FmdGVyKHBhcnQsIGxhdGVzdCkpIHtcblx0XHRcdFx0bGF0ZXN0ID0gcGFydDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGxhdGVzdDtcblx0fVxuXG5cdHByaXZhdGUgX2lzQWZ0ZXIoY2FuZGlkYXRlOiBJQ2hhdFRlcm1pbmFsVG9vbFByb2dyZXNzUGFydCwgY3VycmVudDogSUNoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoY2FuZGlkYXRlLmVsZW1lbnRJbmRleCA9PT0gY3VycmVudC5lbGVtZW50SW5kZXgpIHtcblx0XHRcdHJldHVybiBjYW5kaWRhdGUuY29udGVudEluZGV4ID49IGN1cnJlbnQuY29udGVudEluZGV4O1xuXHRcdH1cblx0XHRyZXR1cm4gY2FuZGlkYXRlLmVsZW1lbnRJbmRleCA+IGN1cnJlbnQuZWxlbWVudEluZGV4O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdG9yZUZyb21TdG9yYWdlKCk6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoU3RvcmFnZUtleXMuVG9vbFNlc3Npb25NYXBwaW5ncywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRpZiAoIXJhdykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXJzZWQ6IFtzdHJpbmcsIG51bWJlcl1bXSA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdGZvciAoY29uc3QgW3Rvb2xTZXNzaW9uSWQsIHBlcnNpc3RlbnRQcm9jZXNzSWRdIG9mIHBhcnNlZCkge1xuXHRcdFx0XHRpZiAoaXNTdHJpbmcodG9vbFNlc3Npb25JZCkgJiYgaXNOdW1iZXIocGVyc2lzdGVudFByb2Nlc3NJZCkpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVzdG9yZWRNYXBwaW5ncy5zZXQodG9vbFNlc3Npb25JZCwgcGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignRmFpbGVkIHRvIHJlc3RvcmUgdGVybWluYWwgY2hhdCB0b29sIHNlc3Npb24gbWFwcGluZ3MnLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RyeUFkb3B0UmVzdG9yZWRNYXBwaW5nKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nUmVzdG9yZWRNYXBwaW5ncy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbdG9vbFNlc3Npb25JZCwgcGVyc2lzdGVudFByb2Nlc3NJZF0gb2YgdGhpcy5fcGVuZGluZ1Jlc3RvcmVkTWFwcGluZ3MpIHtcblx0XHRcdGlmIChwZXJzaXN0ZW50UHJvY2Vzc0lkID09PSBpbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8uaWQpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZXNCeVRvb2xTZXNzaW9uSWQuc2V0KHRvb2xTZXNzaW9uSWQsIGluc3RhbmNlKTtcblx0XHRcdFx0dGhpcy5fdG9vbFNlc3Npb25JZEJ5VGVybWluYWxJbnN0YW5jZS5zZXQoaW5zdGFuY2UsIHRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlZ2lzdGVyVGVybWluYWxJbnN0YW5jZUZvclRvb2xTZXNzaW9uLmZpcmUoaW5zdGFuY2UpO1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlTGlzdGVuZXJzQnlUb29sU2Vzc2lvbklkLnNldCh0b29sU2Vzc2lvbklkLCBpbnN0YW5jZS5vbkRpc3Bvc2VkKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlc0J5VG9vbFNlc3Npb25JZC5kZWxldGUodG9vbFNlc3Npb25JZCk7XG5cdFx0XHRcdFx0dGhpcy5fdG9vbFNlc3Npb25JZEJ5VGVybWluYWxJbnN0YW5jZS5kZWxldGUoaW5zdGFuY2UpO1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VMaXN0ZW5lcnNCeVRvb2xTZXNzaW9uSWQuZGVsZXRlQW5kRGlzcG9zZSh0b29sU2Vzc2lvbklkKTtcblx0XHRcdFx0XHR0aGlzLl9wZXJzaXN0VG9TdG9yYWdlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Jlc3RvcmVkTWFwcGluZ3MuZGVsZXRlKHRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0XHR0aGlzLl9wZXJzaXN0VG9TdG9yYWdlKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BlcnNpc3RUb1N0b3JhZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlSGFzVG9vbFRlcm1pbmFsQ29udGV4dEtleXMoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZW50cmllczogW3N0cmluZywgbnVtYmVyXVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IFt0b29sU2Vzc2lvbklkLCBpbnN0YW5jZV0gb2YgdGhpcy5fdGVybWluYWxJbnN0YW5jZXNCeVRvb2xTZXNzaW9uSWQuZW50cmllcygpKSB7XG5cdFx0XHRcdC8vIFVzZSB0aGUgbGl2ZSBwZXJzaXN0ZW50IHByb2Nlc3MgaWQgd2hlbiBhdmFpbGFibGUsIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gdGhlIGlkXG5cdFx0XHRcdC8vIGZyb20gdGhlIGF0dGFjaGVkIHByb2Nlc3Mgc28gbWFwcGluZ3Mgc3Vydml2ZSBlYXJseSBpbiB0aGUgdGVybWluYWwgbGlmZWN5Y2xlLlxuXHRcdFx0XHRjb25zdCBwZXJzaXN0ZW50SWQgPSBpc051bWJlcihpbnN0YW5jZS5wZXJzaXN0ZW50UHJvY2Vzc0lkKVxuXHRcdFx0XHRcdD8gaW5zdGFuY2UucGVyc2lzdGVudFByb2Nlc3NJZFxuXHRcdFx0XHRcdDogaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LmlkO1xuXHRcdFx0XHRjb25zdCBzaG91bGRQZXJzaXN0ID0gaW5zdGFuY2Uuc2hvdWxkUGVyc2lzdCB8fCBpbnN0YW5jZS5zaGVsbExhdW5jaENvbmZpZy5mb3JjZVBlcnNpc3Q7XG5cdFx0XHRcdGlmIChpc051bWJlcihwZXJzaXN0ZW50SWQpICYmIHNob3VsZFBlcnNpc3QpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goW3Rvb2xTZXNzaW9uSWQsIHBlcnNpc3RlbnRJZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFN0b3JhZ2VLZXlzLlRvb2xTZXNzaW9uTWFwcGluZ3MsIEpTT04uc3RyaW5naWZ5KGVudHJpZXMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFN0b3JhZ2VLZXlzLlRvb2xTZXNzaW9uTWFwcGluZ3MsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdGYWlsZWQgdG8gcGVyc2lzdCB0ZXJtaW5hbCBjaGF0IHRvb2wgc2Vzc2lvbiBtYXBwaW5ncycsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSGFzVG9vbFRlcm1pbmFsQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9vbENvdW50ID0gdGhpcy5fdGVybWluYWxJbnN0YW5jZXNCeVRvb2xTZXNzaW9uSWQuc2l6ZTtcblx0XHR0aGlzLl9oYXNUb29sVGVybWluYWxDb250ZXh0LnNldCh0b29sQ291bnQgPiAwKTtcblx0XHRjb25zdCBoaWRkZW5UZXJtaW5hbENvdW50ID0gdGhpcy5nZXRUb29sU2Vzc2lvblRlcm1pbmFsSW5zdGFuY2VzKHRydWUpLmxlbmd0aDtcblx0XHR0aGlzLl9oYXNIaWRkZW5Ub29sVGVybWluYWxDb250ZXh0LnNldChoaWRkZW5UZXJtaW5hbENvdW50ID4gMCk7XG5cdH1cblxuXHRzZXRDaGF0U2Vzc2lvbkF1dG9BcHByb3ZhbChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkksIGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkF1dG9BcHByb3ZhbEVuYWJsZWQuc2V0KGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uQXV0b0FwcHJvdmFsRW5hYmxlZC5kZWxldGUoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0aGFzQ2hhdFNlc3Npb25BdXRvQXBwcm92YWwoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25BdXRvQXBwcm92YWxFbmFibGVkLmhhcyhjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGFkZFNlc3Npb25BdXRvQXBwcm92ZVJ1bGUoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLCBrZXk6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4gfCB7IGFwcHJvdmU6IGJvb2xlYW47IG1hdGNoQ29tbWFuZExpbmU/OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHRsZXQgc2Vzc2lvblJ1bGVzID0gdGhpcy5fc2Vzc2lvbkF1dG9BcHByb3ZlUnVsZXMuZ2V0KGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghc2Vzc2lvblJ1bGVzKSB7XG5cdFx0XHRzZXNzaW9uUnVsZXMgPSB7fTtcblx0XHRcdHRoaXMuX3Nlc3Npb25BdXRvQXBwcm92ZVJ1bGVzLnNldChjaGF0U2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUnVsZXMpO1xuXHRcdH1cblx0XHRzZXNzaW9uUnVsZXNba2V5XSA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbkF1dG9BcHByb3ZlUnVsZXMoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJKTogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgYm9vbGVhbiB8IHsgYXBwcm92ZTogYm9vbGVhbjsgbWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW4gfT4+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbkF1dG9BcHByb3ZlUnVsZXMuZ2V0KGNoYXRTZXNzaW9uUmVzb3VyY2UpID8/IHt9O1xuXHR9XG5cblx0YXN5bmMgZ2V0QXV0b0FwcHJvdmVBY3Rpb25zKGNvbW1hbmRMaW5lOiBzdHJpbmcsIGxhbmd1YWdlOiAnc2hlbGxzY3JpcHQnIHwgJ3Bvd2Vyc2hlbGwnKTogUHJvbWlzZTxUb29sQ29uZmlybWF0aW9uQWN0aW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0cmltbWVkQ29tbWFuZExpbmUgPSBjb21tYW5kTGluZS50cmltU3RhcnQoKTtcblx0XHRpZiAodHJpbW1lZENvbW1hbmRMaW5lLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fYXV0b0FwcHJvdmVDb21tYW5kUGFyc2VyID8/PSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlU2l0dGVyQ29tbWFuZFBhcnNlcikpO1xuXHRcdGNvbnN0IHRyZWVTaXR0ZXJMYW5ndWFnZSA9IGxhbmd1YWdlID09PSAncG93ZXJzaGVsbCcgPyBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLlBvd2VyU2hlbGwgOiBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLkJhc2g7XG5cdFx0bGV0IHN1YkNvbW1hbmRzOiBzdHJpbmdbXTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VSZXN1bHQgPSBhd2FpdCB0aGlzLl9hdXRvQXBwcm92ZUNvbW1hbmRQYXJzZXIuZXh0cmFjdEF1dG9BcHByb3ZhbFN1YkNvbW1hbmRzKHRyZWVTaXR0ZXJMYW5ndWFnZSwgdHJpbW1lZENvbW1hbmRMaW5lKTtcblx0XHRcdGlmIChwYXJzZVJlc3VsdC5oYXNVbmFuYWx5emFibGVTeW50YXgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHN1YkNvbW1hbmRzID0gcGFyc2VSZXN1bHQuc3ViQ29tbWFuZHM7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdGYWlsZWQgdG8gcGFyc2Ugc3ViLWNvbW1hbmRzIHdoZW4gZ2VuZXJhdGluZyBhdXRvIGFwcHJvdmUgYWN0aW9ucycsIGUpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHN1YkNvbW1hbmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2hlbGwgPSBsYW5ndWFnZSA9PT0gJ3Bvd2Vyc2hlbGwnID8gJ3B3c2gnIDogJ2Jhc2gnO1xuXHRcdGNvbnN0IGV2YWx1YXRvciA9IHRoaXMuX2F1dG9BcHByb3ZlRXZhbHVhdG9yID8/PSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kTGluZUF1dG9BcHByb3ZlcikpO1xuXHRcdC8vIEV2YWx1YXRlIGFnYWluc3QgcGVyc2lzdGVkIGNvbmZpZ3VyYXRpb24gcnVsZXMgb25seSBcdTIwMTQgZGVsaWJlcmF0ZWx5IG5vXG5cdFx0Ly8gY2hhdCBzZXNzaW9uIHJlc291cmNlLCBzbyB3b3JrYmVuY2ggc2Vzc2lvbiBydWxlcyAod2hpY2ggdGhlIGFnZW50XG5cdFx0Ly8gaG9zdCBkb2VzIG5vdCBjb25zdW1lKSBuZWl0aGVyIHN1cHByZXNzIHN1Z2dlc3Rpb25zIG5vciBnZXQgb2ZmZXJlZFxuXHRcdC8vIChgc2tpcFNlc3Npb25TY29wZWRgKS4gU2Vzc2lvbiBydWxlcyBhcmUgbm90IGZvcndhcmRlZCB0byB0aGUgYWdlbnRcblx0XHQvLyBob3N0IHlldCwgc28gYW55dGhpbmcgc2Vzc2lvbi1zY29wZWQgd291bGQgYXBwZWFyIHRvIHdvcmsgd2hpbGVcblx0XHQvLyBsYXRlciBjb21tYW5kcyBzdGlsbCBwcm9tcHQuXG5cdFx0Y29uc3Qgc3ViQ29tbWFuZFJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChzdWJDb21tYW5kcy5tYXAoZSA9PiBldmFsdWF0b3IuaXNDb21tYW5kQXV0b0FwcHJvdmVkKGUsIHNoZWxsLCBPUywgdW5kZWZpbmVkKSkpO1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lUmVzdWx0ID0gZXZhbHVhdG9yLmlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQodHJpbW1lZENvbW1hbmRMaW5lKTtcblx0XHRyZXR1cm4gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnModHJpbW1lZENvbW1hbmRMaW5lLCBzdWJDb21tYW5kcywgeyBzdWJDb21tYW5kUmVzdWx0cywgY29tbWFuZExpbmVSZXN1bHQgfSwgeyBza2lwU2Vzc2lvblNjb3BlZDogdHJ1ZSB9KTtcblx0fVxuXG5cdGNvbnRpbnVlSW5CYWNrZ3JvdW5kKHRlcm1pbmFsVG9vbFNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDb250aW51ZUluQmFja2dyb3VuZC5maXJlKHRlcm1pbmFsVG9vbFNlc3Npb25JZCk7XG5cdH1cblxuXHRyZWdpc3RlckFocENvbW1hbmRTb3VyY2UodGVybWluYWxUb29sU2Vzc2lvbklkOiBzdHJpbmcsIHNvdXJjZTogSUFocFRlcm1pbmFsQ29tbWFuZFNvdXJjZSwgcHJvbWlzZWRUZXJtaW5hbDogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fYWhwQ29tbWFuZFNvdXJjZXMuc2V0KHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgeyBzb3VyY2UsIHByb21pc2VkVGVybWluYWwgfSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fYWhwQ29tbWFuZFNvdXJjZXMuZ2V0KHRlcm1pbmFsVG9vbFNlc3Npb25JZCk/LnNvdXJjZSA9PT0gc291cmNlKSB7XG5cdFx0XHRcdHRoaXMuX2FocENvbW1hbmRTb3VyY2VzLmRlbGV0ZSh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0QWhwQ29tbWFuZFNvdXJjZSh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ6IHN0cmluZyk6IElBaHBUZXJtaW5hbENvbW1hbmRTb3VyY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9haHBDb21tYW5kU291cmNlcy5nZXQodGVybWluYWxUb29sU2Vzc2lvbklkKT8uc291cmNlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLGVBQWUsaUJBQThCLG9CQUFvQjtBQUN0RixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFVBQVU7QUFFbkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBdUksd0JBQXdCO0FBQy9KLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHlCQUF5Qix1Q0FBdUM7QUFDekUsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxVQUFVLGdCQUFnQjtBQUVuQyxJQUFXLGNBQVgsa0JBQVdBLGlCQUFYO0FBQ0MsRUFBQUEsYUFBQSx5QkFBc0I7QUFDdEIsRUFBQUEsYUFBQSx1QkFBb0I7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
