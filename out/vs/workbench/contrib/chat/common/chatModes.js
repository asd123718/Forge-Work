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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { constObservable, observableValue, transaction } from "../../../../base/common/observable.js";
import { isUriComponents, URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IChatAgentService } from "./participants/chatAgents.js";
import { ChatContextKeys } from "./actions/chatContextKeys.js";
import { getChatSessionType, LocalChatSessionUri } from "./model/chatUri.js";
import { ChatConfiguration, ChatModeKind } from "./constants.js";
import { IAgentSource, isCustomAgentVisibility, PromptsStorage } from "./promptSyntax/service/promptsService.js";
import { ICustomizationHarnessService } from "./customizationHarnessService.js";
import { Target } from "./promptSyntax/promptTypes.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { hash } from "../../../../base/common/hash.js";
import { isString } from "../../../../base/common/types.js";
import { isTarget } from "./promptSyntax/languageProviders/promptFileAttributes.js";
import { equals as arraysEqual } from "../../../../base/common/arrays.js";
import { isEqual as isURLEquals } from "../../../../base/common/resources.js";
import { equals as objectEquals } from "../../../../base/common/objects.js";
import { Delayer } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
const IChatModeService = createDecorator("chatModeService");
let ChatModes = class extends Disposable {
  constructor(sessionResource, chatAgentService, contextKeyService, logService, storageService, configurationService, customizationHarnessService) {
    super();
    this.sessionResource = sessionResource;
    this.chatAgentService = chatAgentService;
    this.logService = logService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.customizationHarnessService = customizationHarnessService;
    this._customModeInstances = /* @__PURE__ */ new Map();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    /** Tracks the most recent refresh of custom prompt modes. */
    this._pendingRefresh = Promise.resolve();
    this._refreshThrottler = this._register(new Delayer(100));
    const sessionType = getChatSessionType(sessionResource);
    this._storageKey = ChatModes.CUSTOM_MODES_STORAGE_KEY_PREFIX + sessionType;
    this.hasCustomModes = ChatContextKeys.Modes.hasCustomChatModes.bindTo(contextKeyService);
    this.loadCachedModes();
    this._pendingRefresh = this.triggerRefresh();
    this._register(this.customizationHarnessService.onDidChangeCustomAgents((e) => {
      if (e.sessionType === sessionType) {
        this._pendingRefresh = this.triggerRefresh();
      }
    }));
    this._register(this.storageService.onWillSaveState(() => this.saveCachedModes()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
        this._onDidChange.fire();
      }
    }));
    let didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
    this._register(this.chatAgentService.onDidChangeAgents(() => {
      if (didHaveToolsAgent !== this.chatAgentService.hasToolsAgent) {
        didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
        this._onDidChange.fire();
      }
    }));
  }
  get builtin() {
    return this.getBuiltinModes();
  }
  get custom() {
    return this.getCustomModes();
  }
  findModeById(id) {
    return this.getBuiltinModes().find((mode) => mode.id === id) ?? this._customModeInstances.get(id);
  }
  findModeByName(name) {
    return this.getBuiltinModes().find((mode) => mode.name.get() === name) ?? this.getCustomModes().find((mode) => mode.name.get() === name || mode.id === name);
  }
  waitForPendingUpdates() {
    return this._pendingRefresh;
  }
  loadCachedModes() {
    try {
      const cachedCustomModes = this.storageService.getObject(this._storageKey, StorageScope.WORKSPACE);
      if (cachedCustomModes) {
        this.deserializeCachedModes(cachedCustomModes);
      }
    } catch (error) {
      this.logService.error(error, "Failed to load cached custom agents");
    }
  }
  deserializeCachedModes(cachedCustomModes) {
    if (!Array.isArray(cachedCustomModes)) {
      this.logService.error("Invalid cached custom modes data: expected array");
      return;
    }
    for (const cachedMode of cachedCustomModes) {
      if (isCachedChatModeData(cachedMode) && cachedMode.uri) {
        try {
          const visibility = cachedMode.visibility ?? { userInvocable: true, agentInvocable: cachedMode.infer !== false };
          if (!visibility.userInvocable) {
            continue;
          }
          const uri = URI.revive(cachedMode.uri);
          const customChatMode = {
            id: cachedMode.id,
            uri,
            name: cachedMode.name,
            description: cachedMode.description,
            tools: cachedMode.customTools,
            model: isString(cachedMode.model) ? [cachedMode.model] : cachedMode.model,
            argumentHint: cachedMode.argumentHint,
            agentInstructions: cachedMode.modeInstructions ?? { content: cachedMode.body ?? "", toolReferences: [] },
            handOffs: cachedMode.handOffs,
            target: cachedMode.target ?? Target.Undefined,
            visibility,
            agents: cachedMode.agents,
            sessionTypes: cachedMode.sessionTypes,
            source: reviveChatModeSource(cachedMode.source) ?? { storage: PromptsStorage.local },
            enabled: true
          };
          const instance = new CustomChatMode(customChatMode);
          this._customModeInstances.set(uri.toString(), instance);
        } catch (error) {
          this.logService.error(error, "Failed to revive cached custom agent");
        }
      }
    }
    this.hasCustomModes.set(this._customModeInstances.size > 0);
  }
  saveCachedModes() {
    try {
      const modesToCache = Array.from(this._customModeInstances.values());
      this.storageService.store(this._storageKey, modesToCache, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } catch (error) {
      this.logService.warn("Failed to save cached custom agents", error);
    }
  }
  triggerRefresh() {
    this._refreshCancellationSource?.cancel();
    this._refreshCancellationSource?.dispose();
    const refreshCancellationSource = this._refreshCancellationSource = new CancellationTokenSource();
    return this._refreshThrottler.trigger(async () => {
      try {
        await this.refreshCustomPromptModes(refreshCancellationSource.token);
      } finally {
        if (this._refreshCancellationSource === refreshCancellationSource) {
          this._refreshCancellationSource = void 0;
        }
        refreshCancellationSource.dispose();
      }
    });
  }
  dispose() {
    this._refreshCancellationSource?.cancel();
    this._refreshCancellationSource?.dispose();
    this._refreshCancellationSource = void 0;
    super.dispose();
  }
  async refreshCustomPromptModes(token) {
    let hasChanges = false;
    try {
      if (token.isCancellationRequested) {
        return;
      }
      const customModes = await this.customizationHarnessService.getCustomAgents(this.sessionResource, token);
      if (token.isCancellationRequested) {
        return;
      }
      const seenUris = /* @__PURE__ */ new Set();
      for (const customMode of customModes) {
        if (!customMode.visibility.userInvocable || !customMode.enabled) {
          continue;
        }
        const uriString = customMode.uri.toString();
        seenUris.add(uriString);
        let modeInstance = this._customModeInstances.get(uriString);
        if (modeInstance) {
          if (modeInstance.updateData(customMode)) {
            hasChanges = true;
          }
        } else {
          modeInstance = new CustomChatMode(customMode);
          this._customModeInstances.set(uriString, modeInstance);
          hasChanges = true;
        }
      }
      for (const [uriString] of this._customModeInstances.entries()) {
        if (!seenUris.has(uriString)) {
          this._customModeInstances.delete(uriString);
          hasChanges = true;
        }
      }
      this.hasCustomModes.set(this._customModeInstances.size > 0);
    } catch (error) {
      if (isCancellationError(error)) {
        return;
      }
      this.logService.error(error, "Failed to load custom agents");
      this._customModeInstances.clear();
      this.hasCustomModes.set(false);
      hasChanges = true;
    }
    if (hasChanges) {
      this._onDidChange.fire();
    }
  }
  getBuiltinModes() {
    const builtinModes = [
      ChatMode.Ask
    ];
    if (this.chatAgentService.hasToolsAgent || this.isAgentModeDisabledByPolicy()) {
      builtinModes.unshift(ChatMode.Agent);
    }
    builtinModes.push(ChatMode.Edit);
    return builtinModes;
  }
  getCustomModes() {
    return this.chatAgentService.hasToolsAgent || this.isAgentModeDisabledByPolicy() ? Array.from(this._customModeInstances.values()) : [];
  }
  isAgentModeDisabledByPolicy() {
    return this.configurationService.inspect(ChatConfiguration.AgentEnabled).policyValue === false;
  }
};
ChatModes.CUSTOM_MODES_STORAGE_KEY_PREFIX = "chat.customModes.";
ChatModes = __decorateClass([
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ICustomizationHarnessService)
], ChatModes);
let ChatModeService = class extends Disposable {
  constructor(instantiationService, contextKeyService, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.agentModeDisabledByPolicy = ChatContextKeys.Modes.agentModeDisabledByPolicy.bindTo(contextKeyService);
    this.updateAgentModePolicyContextKey();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
        this.updateAgentModePolicyContextKey();
      }
    }));
  }
  createModes(sessionResource) {
    return this.instantiationService.createInstance(ChatModes, sessionResource);
  }
  async getLocalModes() {
    if (!this.localMode) {
      this.localMode = (async () => {
        const modes = this._register(this.createModes(LocalChatSessionUri.getNewSessionUri()));
        await modes.waitForPendingUpdates();
        return modes;
      })();
    }
    return this.localMode;
  }
  updateAgentModePolicyContextKey() {
    this.agentModeDisabledByPolicy.set(this.isAgentModeDisabledByPolicy());
  }
  isAgentModeDisabledByPolicy() {
    return this.configurationService.inspect(ChatConfiguration.AgentEnabled).policyValue === false;
  }
};
ChatModeService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService)
], ChatModeService);
var IChatModeInstructions;
((IChatModeInstructions2) => {
  function isEquals(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.content === b.content && objectEquals(a.toolReferences, b.toolReferences) && objectEquals(a.metadata, b.metadata);
  }
  IChatModeInstructions2.isEquals = isEquals;
})(IChatModeInstructions || (IChatModeInstructions = {}));
function isCachedChatModeData(data) {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const mode = data;
  return typeof mode.id === "string" && typeof mode.name === "string" && typeof mode.kind === "string" && (mode.description === void 0 || typeof mode.description === "string") && (mode.customTools === void 0 || Array.isArray(mode.customTools)) && (mode.modeInstructions === void 0 || typeof mode.modeInstructions === "object" && mode.modeInstructions !== null) && (mode.model === void 0 || typeof mode.model === "string" || Array.isArray(mode.model)) && (mode.argumentHint === void 0 || typeof mode.argumentHint === "string") && (mode.handOffs === void 0 || Array.isArray(mode.handOffs)) && (mode.uri === void 0 || typeof mode.uri === "object" && mode.uri !== null) && (mode.source === void 0 || isChatModeSourceData(mode.source)) && (mode.target === void 0 || isTarget(mode.target)) && (mode.visibility === void 0 || isCustomAgentVisibility(mode.visibility)) && (mode.agents === void 0 || Array.isArray(mode.agents)) && (mode.sessionTypes === void 0 || Array.isArray(mode.sessionTypes));
}
class CustomChatMode {
  constructor(customChatMode) {
    this.kind = ChatModeKind.Agent;
    this.id = customChatMode.uri.toString();
    this._nameObservable = observableValue("name", customChatMode.name);
    this._descriptionObservable = observableValue("description", customChatMode.description);
    this._customToolsObservable = observableValue("customTools", customChatMode.tools);
    this._modelObservable = observableValue("model", customChatMode.model);
    this._argumentHintObservable = observableValue("argumentHint", customChatMode.argumentHint);
    this._handoffsObservable = observableValue("handOffs", customChatMode.handOffs);
    this._targetObservable = observableValue("target", customChatMode.target);
    this._visibilityObservable = observableValue("visibility", customChatMode.visibility);
    this._agentsObservable = observableValue("agents", customChatMode.agents);
    this._modeInstructions = observableValue("_modeInstructions", customChatMode.agentInstructions);
    this._uriObservable = observableValue("uri", customChatMode.uri);
    this._source = customChatMode.source;
    this._sessionTypes = customChatMode.sessionTypes;
  }
  get name() {
    return this._nameObservable;
  }
  get description() {
    return this._descriptionObservable;
  }
  get icon() {
    return constObservable(void 0);
  }
  get isBuiltin() {
    return isBuiltinChatMode(this);
  }
  get customTools() {
    return this._customToolsObservable;
  }
  get model() {
    return this._modelObservable;
  }
  get argumentHint() {
    return this._argumentHintObservable;
  }
  get modeInstructions() {
    return this._modeInstructions;
  }
  get uri() {
    return this._uriObservable;
  }
  get label() {
    return this.name;
  }
  get handOffs() {
    return this._handoffsObservable;
  }
  get source() {
    return this._source;
  }
  get target() {
    return this._targetObservable;
  }
  get visibility() {
    return this._visibilityObservable;
  }
  get agents() {
    return this._agentsObservable;
  }
  get sessionTypes() {
    return this._sessionTypes;
  }
  /**
   * Updates the underlying data and triggers observable changes
   */
  updateData(newData) {
    let hasChanges = false;
    transaction((tx) => {
      const update = (observable, newValue, equals = (a, b) => a === b) => {
        if (!equals(observable.get(), newValue)) {
          observable.set(newValue, tx);
          hasChanges = true;
        }
      };
      update(this._nameObservable, newData.name);
      update(this._descriptionObservable, newData.description);
      update(this._customToolsObservable, newData.tools, arraysEqual);
      update(this._modelObservable, newData.model, arraysEqual);
      update(this._argumentHintObservable, newData.argumentHint);
      update(this._modeInstructions, newData.agentInstructions, IChatModeInstructions.isEquals);
      update(this._uriObservable, newData.uri, isURLEquals);
      update(this._handoffsObservable, newData.handOffs, objectEquals);
      update(this._targetObservable, newData.target);
      update(this._visibilityObservable, newData.visibility, objectEquals);
      update(this._agentsObservable, newData.agents, arraysEqual);
      if (!IAgentSource.isEquals(this._source, newData.source)) {
        this._source = newData.source;
        hasChanges = true;
      }
      if (!arraysEqual(this._sessionTypes, newData.sessionTypes)) {
        this._sessionTypes = newData.sessionTypes;
        hasChanges = true;
      }
    });
    return hasChanges;
  }
  toJSON() {
    return {
      id: this.id,
      name: this.name.get(),
      description: this.description.get(),
      kind: this.kind,
      customTools: this.customTools.get(),
      model: this.model.get(),
      argumentHint: this.argumentHint.get(),
      modeInstructions: this.modeInstructions.get(),
      uri: this.uri.get(),
      handOffs: this.handOffs.get(),
      source: serializeChatModeSource(this._source),
      target: this.target.get(),
      visibility: this.visibility.get(),
      agents: this.agents.get(),
      sessionTypes: this.sessionTypes
    };
  }
}
function isChatModeSourceData(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const data = value;
  if (data.storage === PromptsStorage.extension) {
    return typeof data.extensionId === "string";
  }
  if (data.storage === PromptsStorage.plugin) {
    return isUriComponents(data.pluginUri);
  }
  return data.storage === PromptsStorage.local || data.storage === PromptsStorage.user || data.storage === PromptsStorage.builtIn;
}
function serializeChatModeSource(source) {
  if (!source) {
    return void 0;
  }
  if (source.storage === PromptsStorage.extension) {
    return { storage: PromptsStorage.extension, extensionId: source.extensionId.value };
  }
  if (source.storage === PromptsStorage.plugin) {
    return { storage: PromptsStorage.plugin, pluginUri: source.pluginUri };
  }
  return { storage: source.storage };
}
function reviveChatModeSource(data) {
  if (!data) {
    return void 0;
  }
  if (data.storage === PromptsStorage.extension) {
    return { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(data.extensionId) };
  }
  if (data.storage === PromptsStorage.plugin) {
    return { storage: PromptsStorage.plugin, pluginUri: URI.revive(data.pluginUri) };
  }
  return { storage: data.storage };
}
class BuiltinChatMode {
  constructor(kind, label, description, icon) {
    this.kind = kind;
    this.name = constObservable(kind);
    this.label = constObservable(label);
    this.description = observableValue("description", description);
    this.icon = constObservable(icon);
    this.target = constObservable(Target.Undefined);
  }
  get isBuiltin() {
    return isBuiltinChatMode(this);
  }
  get id() {
    return this.kind;
  }
  /**
   * Getters are not json-stringified
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name.get(),
      description: this.description.get(),
      kind: this.kind
    };
  }
}
var ChatMode;
((ChatMode2) => {
  ChatMode2.Ask = new BuiltinChatMode(ChatModeKind.Ask, "Ask", localize("chatDescription", "Explore and understand your code"), Codicon.question);
  ChatMode2.Edit = new BuiltinChatMode(ChatModeKind.Edit, "Edit", localize("editsDescription", "Edit or refactor selected code"), Codicon.edit);
  ChatMode2.Agent = new BuiltinChatMode(ChatModeKind.Agent, "Agent", localize("agentDescription", "Describe what to build"), Codicon.agent);
})(ChatMode || (ChatMode = {}));
function isBuiltinChatMode(mode) {
  return mode.id === ChatMode.Ask.id || mode.id === ChatMode.Edit.id || mode.id === ChatMode.Agent.id;
}
function getModeNameForTelemetry(mode) {
  const modeStorage = mode.source?.storage;
  if (modeStorage === PromptsStorage.local || modeStorage === PromptsStorage.user) {
    return String(hash(mode.name.get()));
  }
  return mode.name.get();
}
function getHandoffId(handoff) {
  const slug = handoff.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${handoff.agent}:${slug}`;
}
function buildCustomAgentHandoffsInfo(modes) {
  return modes.map((mode) => {
    const handoffs = mode.handOffs?.get() ?? [];
    const visibility = mode.visibility?.get();
    return {
      id: mode.id,
      name: mode.name.get(),
      isBuiltin: mode.isBuiltin,
      visibility: {
        userInvocable: visibility?.userInvocable ?? true,
        agentInvocable: visibility?.agentInvocable ?? true
      },
      handoffs: handoffs.map((h) => ({
        id: getHandoffId(h),
        label: h.label,
        agent: h.agent,
        prompt: h.prompt,
        ...h.send !== void 0 ? { send: h.send } : {},
        ...h.showContinueOn !== void 0 ? { showContinueOn: h.showContinueOn } : {},
        ...h.model !== void 0 ? { model: h.model } : {}
      }))
    };
  });
}
export {
  BuiltinChatMode,
  ChatMode,
  ChatModeService,
  CustomChatMode,
  IChatModeInstructions,
  IChatModeService,
  buildCustomAgentHandoffsInfo,
  getHandoffId,
  getModeNameForTelemetry,
  isBuiltinChatMode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcY2hhdE1vZGVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNVcmlDb21wb25lbnRzLCBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUsIExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElIYW5kT2ZmIH0gZnJvbSAnLi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTb3VyY2UsIElDdXN0b21BZ2VudCwgSUN1c3RvbUFnZW50VmlzaWJpbGl0eSwgaXNDdXN0b21BZ2VudFZpc2liaWxpdHksIFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIH0gZnJvbSAnLi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0RmlsZVNvdXJjZSwgVGFyZ2V0IH0gZnJvbSAnLi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGlzVGFyZ2V0IH0gZnJvbSAnLi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0RmlsZUF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgZXF1YWxzIGFzIGFycmF5c0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgYXMgaXNVUkxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZXF1YWxzIGFzIG9iamVjdEVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5cbmV4cG9ydCBjb25zdCBJQ2hhdE1vZGVTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDaGF0TW9kZVNlcnZpY2U+KCdjaGF0TW9kZVNlcnZpY2UnKTtcbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNb2RlU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY2hhdCBtb2RlcyBhdmFpbGFibGUgZm9yIHRoZSBnaXZlbiBzZXNzaW9uIHJlc291cmNlLlxuXHQgKlxuXHQgKiBJbnN0YW5jZXMgbmVlZCB0byBiZSBkaXNwb3NlZCBieSB0aGUgY2FsbGVyIHdoZW4gbm8gbG9uZ2VyIG5lZWRlZFxuXHQgKi9cblx0Y3JlYXRlTW9kZXMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQ2hhdE1vZGVzICYgSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGxvY2FsIGNoYXQgbW9kZXMgYWZ0ZXIgYXdhaXRpbmcgYW55IGluLWZsaWdodCByZWZyZXNoLlxuXHQgKi9cblx0Z2V0TG9jYWxNb2RlcygpOiBQcm9taXNlPElDaGF0TW9kZXM+O1xufVxuXG4vKipcbiAqIFRoZSBzZXQgb2YgY2hhdCBtb2RlcyBhdmFpbGFibGUgZm9yIGEgcGFydGljdWxhciBzZXNzaW9uIHR5cGUsIHBhcnRpdGlvbmVkXG4gKiBpbnRvIGJ1aWx0aW4gYW5kIGN1c3RvbSBtb2Rlcywgd2l0aCBoZWxwZXJzIGZvciBsb29rdXAgYnkgaWQgb3IgbmFtZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1vZGVzIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBidWlsdGluOiByZWFkb25seSBJQ2hhdE1vZGVbXTtcblx0cmVhZG9ubHkgY3VzdG9tOiByZWFkb25seSBJQ2hhdE1vZGVbXTtcblx0ZmluZE1vZGVCeUlkKGlkOiBzdHJpbmcpOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQ7XG5cdGZpbmRNb2RlQnlOYW1lKG5hbWU6IHN0cmluZyk6IElDaGF0TW9kZSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQXdhaXRzIHRoZSBtb3N0IHJlY2VudGx5IHNjaGVkdWxlZCB1cGRhdGUgb2YgY3VzdG9tIHByb21wdCBtb2Rlcy5cblx0ICogQWZ0ZXIgdGhpcyByZXNvbHZlcywge0BsaW5rIGN1c3RvbX0gcmVmbGVjdHMgdGhlIGxhdGVzdCBkYXRhIGZyb20gdGhlXG5cdCAqIHByb21wdHMgc2VydmljZS5cblx0ICovXG5cdHdhaXRGb3JQZW5kaW5nVXBkYXRlcygpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5jbGFzcyBDaGF0TW9kZXMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRNb2RlcyB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ1VTVE9NX01PREVTX1NUT1JBR0VfS0VZX1BSRUZJWCA9ICdjaGF0LmN1c3RvbU1vZGVzLic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBoYXNDdXN0b21Nb2RlczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbU1vZGVJbnN0YW5jZXMgPSBuZXcgTWFwPHN0cmluZywgQ3VzdG9tQ2hhdE1vZGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VLZXk6IHN0cmluZztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdC8qKiBUcmFja3MgdGhlIG1vc3QgcmVjZW50IHJlZnJlc2ggb2YgY3VzdG9tIHByb21wdCBtb2Rlcy4gKi9cblx0cHJpdmF0ZSBfcGVuZGluZ1JlZnJlc2g6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRwcml2YXRlIF9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVmcmVzaFRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDEwMCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlOiBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdHRoaXMuX3N0b3JhZ2VLZXkgPSBDaGF0TW9kZXMuQ1VTVE9NX01PREVTX1NUT1JBR0VfS0VZX1BSRUZJWCArIHNlc3Npb25UeXBlO1xuXHRcdHRoaXMuaGFzQ3VzdG9tTW9kZXMgPSBDaGF0Q29udGV4dEtleXMuTW9kZXMuaGFzQ3VzdG9tQ2hhdE1vZGVzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyBMb2FkIGNhY2hlZCBtb2RlcyBmcm9tIHN0b3JhZ2UgZmlyc3Rcblx0XHR0aGlzLmxvYWRDYWNoZWRNb2RlcygpO1xuXG5cdFx0dGhpcy5fcGVuZGluZ1JlZnJlc2ggPSB0aGlzLnRyaWdnZXJSZWZyZXNoKCk7XG5cdFx0Ly8gV2hlbiB0aGUgaGFybmVzcyBzZXJ2aWNlIGlzIHRoZSBzb3VyY2UsIGFsc28gcmVhY3QgdG8gaXRzIGNoYW5nZSBldmVudHMgZm9yIG91ciBzZXNzaW9uIHR5cGUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2Uub25EaWRDaGFuZ2VDdXN0b21BZ2VudHMoZSA9PiB7XG5cdFx0XHRpZiAoZS5zZXNzaW9uVHlwZSA9PT0gc2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1JlZnJlc2ggPSB0aGlzLnRyaWdnZXJSZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHRoaXMuc2F2ZUNhY2hlZE1vZGVzKCkpKTtcblxuXHRcdC8vIEJ1aWx0aW4gbW9kZSBhdmFpbGFiaWxpdHkgZGVwZW5kcyBvbiBjb25maWd1cmF0aW9uIHBvbGljeSBhbmQgdG9vbHMtYWdlbnQgYXZhaWxhYmlsaXR5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGxldCBkaWRIYXZlVG9vbHNBZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5oYXNUb29sc0FnZW50O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEFnZW50U2VydmljZS5vbkRpZENoYW5nZUFnZW50cygoKSA9PiB7XG5cdFx0XHRpZiAoZGlkSGF2ZVRvb2xzQWdlbnQgIT09IHRoaXMuY2hhdEFnZW50U2VydmljZS5oYXNUb29sc0FnZW50KSB7XG5cdFx0XHRcdGRpZEhhdmVUb29sc0FnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmhhc1Rvb2xzQWdlbnQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXQgYnVpbHRpbigpOiByZWFkb25seSBJQ2hhdE1vZGVbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QnVpbHRpbk1vZGVzKCk7XG5cdH1cblxuXHRnZXQgY3VzdG9tKCk6IHJlYWRvbmx5IElDaGF0TW9kZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRDdXN0b21Nb2RlcygpO1xuXHR9XG5cblx0ZmluZE1vZGVCeUlkKGlkOiBzdHJpbmcgfCBDaGF0TW9kZUtpbmQpOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldEJ1aWx0aW5Nb2RlcygpLmZpbmQobW9kZSA9PiBtb2RlLmlkID09PSBpZCkgPz8gdGhpcy5fY3VzdG9tTW9kZUluc3RhbmNlcy5nZXQoaWQpO1xuXHR9XG5cblx0ZmluZE1vZGVCeU5hbWUobmFtZTogc3RyaW5nKTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRCdWlsdGluTW9kZXMoKS5maW5kKG1vZGUgPT4gbW9kZS5uYW1lLmdldCgpID09PSBuYW1lKSA/PyB0aGlzLmdldEN1c3RvbU1vZGVzKCkuZmluZChtb2RlID0+IG1vZGUubmFtZS5nZXQoKSA9PT0gbmFtZSB8fCBtb2RlLmlkID09PSBuYW1lKTtcblx0fVxuXG5cdHdhaXRGb3JQZW5kaW5nVXBkYXRlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ1JlZnJlc2g7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRDYWNoZWRNb2RlcygpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2FjaGVkQ3VzdG9tTW9kZXMgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdCh0aGlzLl9zdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRcdGlmIChjYWNoZWRDdXN0b21Nb2Rlcykge1xuXHRcdFx0XHR0aGlzLmRlc2VyaWFsaXplQ2FjaGVkTW9kZXMoY2FjaGVkQ3VzdG9tTW9kZXMpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsICdGYWlsZWQgdG8gbG9hZCBjYWNoZWQgY3VzdG9tIGFnZW50cycpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZGVzZXJpYWxpemVDYWNoZWRNb2RlcyhjYWNoZWRDdXN0b21Nb2RlczogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShjYWNoZWRDdXN0b21Nb2RlcykpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignSW52YWxpZCBjYWNoZWQgY3VzdG9tIG1vZGVzIGRhdGE6IGV4cGVjdGVkIGFycmF5Jyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjYWNoZWRNb2RlIG9mIGNhY2hlZEN1c3RvbU1vZGVzKSB7XG5cdFx0XHRpZiAoaXNDYWNoZWRDaGF0TW9kZURhdGEoY2FjaGVkTW9kZSkgJiYgY2FjaGVkTW9kZS51cmkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCB2aXNpYmlsaXR5ID0gY2FjaGVkTW9kZS52aXNpYmlsaXR5ID8/IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IGNhY2hlZE1vZGUuaW5mZXIgIT09IGZhbHNlIH07XG5cdFx0XHRcdFx0aWYgKCF2aXNpYmlsaXR5LnVzZXJJbnZvY2FibGUpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKGNhY2hlZE1vZGUudXJpKTtcblx0XHRcdFx0XHRjb25zdCBjdXN0b21DaGF0TW9kZTogSUN1c3RvbUFnZW50ID0ge1xuXHRcdFx0XHRcdFx0aWQ6IGNhY2hlZE1vZGUuaWQsXG5cdFx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0XHRuYW1lOiBjYWNoZWRNb2RlLm5hbWUsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY2FjaGVkTW9kZS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdHRvb2xzOiBjYWNoZWRNb2RlLmN1c3RvbVRvb2xzLFxuXHRcdFx0XHRcdFx0bW9kZWw6IGlzU3RyaW5nKGNhY2hlZE1vZGUubW9kZWwpID8gW2NhY2hlZE1vZGUubW9kZWxdIDogY2FjaGVkTW9kZS5tb2RlbCxcblx0XHRcdFx0XHRcdGFyZ3VtZW50SGludDogY2FjaGVkTW9kZS5hcmd1bWVudEhpbnQsXG5cdFx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczogY2FjaGVkTW9kZS5tb2RlSW5zdHJ1Y3Rpb25zID8/IHsgY29udGVudDogY2FjaGVkTW9kZS5ib2R5ID8/ICcnLCB0b29sUmVmZXJlbmNlczogW10gfSxcblx0XHRcdFx0XHRcdGhhbmRPZmZzOiBjYWNoZWRNb2RlLmhhbmRPZmZzLFxuXHRcdFx0XHRcdFx0dGFyZ2V0OiBjYWNoZWRNb2RlLnRhcmdldCA/PyBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dmlzaWJpbGl0eSxcblx0XHRcdFx0XHRcdGFnZW50czogY2FjaGVkTW9kZS5hZ2VudHMsXG5cdFx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IGNhY2hlZE1vZGUuc2Vzc2lvblR5cGVzLFxuXHRcdFx0XHRcdFx0c291cmNlOiByZXZpdmVDaGF0TW9kZVNvdXJjZShjYWNoZWRNb2RlLnNvdXJjZSkgPz8geyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBuZXcgQ3VzdG9tQ2hhdE1vZGUoY3VzdG9tQ2hhdE1vZGUpO1xuXHRcdFx0XHRcdHRoaXMuX2N1c3RvbU1vZGVJbnN0YW5jZXMuc2V0KHVyaS50b1N0cmluZygpLCBpbnN0YW5jZSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yLCAnRmFpbGVkIHRvIHJldml2ZSBjYWNoZWQgY3VzdG9tIGFnZW50Jyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmhhc0N1c3RvbU1vZGVzLnNldCh0aGlzLl9jdXN0b21Nb2RlSW5zdGFuY2VzLnNpemUgPiAwKTtcblx0fVxuXG5cdHByaXZhdGUgc2F2ZUNhY2hlZE1vZGVzKCk6IHZvaWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtb2Rlc1RvQ2FjaGUgPSBBcnJheS5mcm9tKHRoaXMuX2N1c3RvbU1vZGVJbnN0YW5jZXMudmFsdWVzKCkpO1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLl9zdG9yYWdlS2V5LCBtb2Rlc1RvQ2FjaGUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdGYWlsZWQgdG8gc2F2ZSBjYWNoZWQgY3VzdG9tIGFnZW50cycsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRyaWdnZXJSZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2U/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2U/LmRpc3Bvc2UoKTtcblx0XHRjb25zdCByZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlID0gdGhpcy5fcmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHJldHVybiB0aGlzLl9yZWZyZXNoVGhyb3R0bGVyLnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoQ3VzdG9tUHJvbXB0TW9kZXMocmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZS50b2tlbik7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRpZiAodGhpcy5fcmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZSA9PT0gcmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2U/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2U/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlID0gdW5kZWZpbmVkO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaEN1c3RvbVByb21wdE1vZGVzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBoYXNDaGFuZ2VzID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXN0b21Nb2RlcyA9IGF3YWl0IHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyh0aGlzLnNlc3Npb25SZXNvdXJjZSwgdG9rZW4pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ3JlYXRlIGEgbmV3IHNldCBvZiBtb2RlIGluc3RhbmNlcywgcmV1c2luZyBleGlzdGluZyBvbmVzIHdoZXJlIHBvc3NpYmxlXG5cdFx0XHRjb25zdCBzZWVuVXJpcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Zm9yIChjb25zdCBjdXN0b21Nb2RlIG9mIGN1c3RvbU1vZGVzKSB7XG5cdFx0XHRcdGlmICghY3VzdG9tTW9kZS52aXNpYmlsaXR5LnVzZXJJbnZvY2FibGUgfHwgIWN1c3RvbU1vZGUuZW5hYmxlZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdXJpU3RyaW5nID0gY3VzdG9tTW9kZS51cmkudG9TdHJpbmcoKTtcblx0XHRcdFx0c2VlblVyaXMuYWRkKHVyaVN0cmluZyk7XG5cblx0XHRcdFx0bGV0IG1vZGVJbnN0YW5jZSA9IHRoaXMuX2N1c3RvbU1vZGVJbnN0YW5jZXMuZ2V0KHVyaVN0cmluZyk7XG5cdFx0XHRcdGlmIChtb2RlSW5zdGFuY2UpIHtcblx0XHRcdFx0XHQvLyBVcGRhdGUgZXhpc3RpbmcgaW5zdGFuY2Ugd2l0aCBuZXcgZGF0YVxuXHRcdFx0XHRcdGlmIChtb2RlSW5zdGFuY2UudXBkYXRlRGF0YShjdXN0b21Nb2RlKSkge1xuXHRcdFx0XHRcdFx0aGFzQ2hhbmdlcyA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIENyZWF0ZSBuZXcgaW5zdGFuY2Vcblx0XHRcdFx0XHRtb2RlSW5zdGFuY2UgPSBuZXcgQ3VzdG9tQ2hhdE1vZGUoY3VzdG9tTW9kZSk7XG5cdFx0XHRcdFx0dGhpcy5fY3VzdG9tTW9kZUluc3RhbmNlcy5zZXQodXJpU3RyaW5nLCBtb2RlSW5zdGFuY2UpO1xuXHRcdFx0XHRcdGhhc0NoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENsZWFuIHVwIGluc3RhbmNlcyBmb3IgbW9kZXMgdGhhdCBubyBsb25nZXIgZXhpc3Rcblx0XHRcdGZvciAoY29uc3QgW3VyaVN0cmluZ10gb2YgdGhpcy5fY3VzdG9tTW9kZUluc3RhbmNlcy5lbnRyaWVzKCkpIHtcblx0XHRcdFx0aWYgKCFzZWVuVXJpcy5oYXModXJpU3RyaW5nKSkge1xuXHRcdFx0XHRcdHRoaXMuX2N1c3RvbU1vZGVJbnN0YW5jZXMuZGVsZXRlKHVyaVN0cmluZyk7XG5cdFx0XHRcdFx0aGFzQ2hhbmdlcyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5oYXNDdXN0b21Nb2Rlcy5zZXQodGhpcy5fY3VzdG9tTW9kZUluc3RhbmNlcy5zaXplID4gMCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsICdGYWlsZWQgdG8gbG9hZCBjdXN0b20gYWdlbnRzJyk7XG5cdFx0XHR0aGlzLl9jdXN0b21Nb2RlSW5zdGFuY2VzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmhhc0N1c3RvbU1vZGVzLnNldChmYWxzZSk7XG5cdFx0XHRoYXNDaGFuZ2VzID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGhhc0NoYW5nZXMpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEJ1aWx0aW5Nb2RlcygpOiBJQ2hhdE1vZGVbXSB7XG5cdFx0Y29uc3QgYnVpbHRpbk1vZGVzOiBJQ2hhdE1vZGVbXSA9IFtcblx0XHRcdENoYXRNb2RlLkFzayxcblx0XHRdO1xuXG5cdFx0Ly8gSW5jbHVkZSBBZ2VudCBtb2RlIGlmOlxuXHRcdC8vIC0gSXQncyBlbmFibGVkIChoYXNUb29sc0FnZW50IGlzIHRydWUpLCBPUlxuXHRcdC8vIC0gSXQncyBkaXNhYmxlZCBieSBwb2xpY3kgKHNvIHdlIGNhbiBzaG93IGl0IHdpdGggYSBsb2NrIGljb24pXG5cdFx0Ly8gQnV0IGhpZGUgaXQgaWYgdGhlIHVzZXIgbWFudWFsbHkgZGlzYWJsZWQgaXQgdmlhIHNldHRpbmdzXG5cdFx0aWYgKHRoaXMuY2hhdEFnZW50U2VydmljZS5oYXNUb29sc0FnZW50IHx8IHRoaXMuaXNBZ2VudE1vZGVEaXNhYmxlZEJ5UG9saWN5KCkpIHtcblx0XHRcdGJ1aWx0aW5Nb2Rlcy51bnNoaWZ0KENoYXRNb2RlLkFnZW50KTtcblx0XHR9XG5cdFx0YnVpbHRpbk1vZGVzLnB1c2goQ2hhdE1vZGUuRWRpdCk7XG5cdFx0cmV0dXJuIGJ1aWx0aW5Nb2Rlcztcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VzdG9tTW9kZXMoKTogSUNoYXRNb2RlW10ge1xuXHRcdC8vIFNob3cgY3VzdG9tIG1vZGVzIHdoZW4gYWdlbnQgbW9kZSBpcyBlbmFibGVkIE9SIHdoZW4gZGlzYWJsZWQgYnkgcG9saWN5ICh0byBzaG93IHRoZW0gaW4gdGhlIHBvbGljeS1tYW5hZ2VkIGdyb3VwKVxuXHRcdHJldHVybiB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuaGFzVG9vbHNBZ2VudCB8fCB0aGlzLmlzQWdlbnRNb2RlRGlzYWJsZWRCeVBvbGljeSgpID8gQXJyYXkuZnJvbSh0aGlzLl9jdXN0b21Nb2RlSW5zdGFuY2VzLnZhbHVlcygpKSA6IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0FnZW50TW9kZURpc2FibGVkQnlQb2xpY3koKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQpLnBvbGljeVZhbHVlID09PSBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdE1vZGVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0TW9kZVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFnZW50TW9kZURpc2FibGVkQnlQb2xpY3k6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGxvY2FsTW9kZTogUHJvbWlzZTxJQ2hhdE1vZGVzPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmFnZW50TW9kZURpc2FibGVkQnlQb2xpY3kgPSBDaGF0Q29udGV4dEtleXMuTW9kZXMuYWdlbnRNb2RlRGlzYWJsZWRCeVBvbGljeS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSB0aGUgcG9saWN5IGNvbnRleHQga2V5XG5cdFx0dGhpcy51cGRhdGVBZ2VudE1vZGVQb2xpY3lDb250ZXh0S2V5KCk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGNvbmZpZ3VyYXRpb24gY2hhbmdlcyB0aGF0IGFmZmVjdCBhZ2VudCBtb2RlIHBvbGljeVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFnZW50TW9kZVBvbGljeUNvbnRleHRLZXkoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRjcmVhdGVNb2RlcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElDaGF0TW9kZXMgJiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVzLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TG9jYWxNb2RlcygpOiBQcm9taXNlPElDaGF0TW9kZXM+IHtcblx0XHRpZiAoIXRoaXMubG9jYWxNb2RlKSB7XG5cdFx0XHR0aGlzLmxvY2FsTW9kZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVNb2RlcyhMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKSkpOyAvLyB3ZSBtYWtlIHVwIGEgbmV3IHNlc3Npb24uIExvY2FsIG1kZXMgZmFsbCBiYWNrIHRvIHRoZSBwcm9tcHRTZXJ2aWNlIGFuZCBhcmUgbm90IGFjdHVhbGx5IHRpZWQgdG8gdGhlIHNlc3Npb24sIHNvIGl0IGRvZXNuJ3QgbWF0dGVyIHdoaWNoIG9uZSB3ZSB1c2UgaGVyZS5cblx0XHRcdFx0YXdhaXQgbW9kZXMud2FpdEZvclBlbmRpbmdVcGRhdGVzKCk7XG5cdFx0XHRcdHJldHVybiBtb2Rlcztcblx0XHRcdH0pKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmxvY2FsTW9kZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWdlbnRNb2RlUG9saWN5Q29udGV4dEtleSgpOiB2b2lkIHtcblx0XHR0aGlzLmFnZW50TW9kZURpc2FibGVkQnlQb2xpY3kuc2V0KHRoaXMuaXNBZ2VudE1vZGVEaXNhYmxlZEJ5UG9saWN5KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0FnZW50TW9kZURpc2FibGVkQnlQb2xpY3koKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQpLnBvbGljeVZhbHVlID09PSBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TW9kZURhdGEge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBraW5kOiBDaGF0TW9kZUtpbmQ7XG5cdHJlYWRvbmx5IGN1c3RvbVRvb2xzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IG1vZGVsPzogcmVhZG9ubHkgc3RyaW5nW10gfCBzdHJpbmc7XG5cdHJlYWRvbmx5IGFyZ3VtZW50SGludD86IHN0cmluZztcblx0cmVhZG9ubHkgbW9kZUluc3RydWN0aW9ucz86IElDaGF0TW9kZUluc3RydWN0aW9ucztcblx0cmVhZG9ubHkgYm9keT86IHN0cmluZzsgLyogZGVwcmVjYXRlZCAqL1xuXHRyZWFkb25seSBoYW5kT2Zmcz86IHJlYWRvbmx5IElIYW5kT2ZmW107XG5cdHJlYWRvbmx5IHVyaT86IFVSSTtcblx0cmVhZG9ubHkgc291cmNlPzogSUNoYXRNb2RlU291cmNlRGF0YTtcblx0cmVhZG9ubHkgdGFyZ2V0PzogVGFyZ2V0O1xuXHRyZWFkb25seSB2aXNpYmlsaXR5PzogSUN1c3RvbUFnZW50VmlzaWJpbGl0eTtcblx0cmVhZG9ubHkgYWdlbnRzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBpbmZlcj86IGJvb2xlYW47IC8vIGRlcHJlY2F0ZWQsIG9ubHkgYXZhaWxhYmxlIGluIG9sZCBjYWNoZWQgZGF0YVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TW9kZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IElPYnNlcnZhYmxlPHN0cmluZz47XG5cdHJlYWRvbmx5IGxhYmVsOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRyZWFkb25seSBpY29uOiBJT2JzZXJ2YWJsZTxUaGVtZUljb24gfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgaXNCdWlsdGluOiBib29sZWFuO1xuXHRyZWFkb25seSBraW5kOiBDaGF0TW9kZUtpbmQ7XG5cdHJlYWRvbmx5IGN1c3RvbVRvb2xzPzogSU9ic2VydmFibGU8cmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBoYW5kT2Zmcz86IElPYnNlcnZhYmxlPHJlYWRvbmx5IElIYW5kT2ZmW10gfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBtb2RlbD86IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgYXJndW1lbnRIaW50PzogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgbW9kZUluc3RydWN0aW9ucz86IElPYnNlcnZhYmxlPElDaGF0TW9kZUluc3RydWN0aW9ucz47XG5cdHJlYWRvbmx5IHVyaT86IElPYnNlcnZhYmxlPFVSST47XG5cdHJlYWRvbmx5IHNvdXJjZT86IElBZ2VudFNvdXJjZTtcblx0cmVhZG9ubHkgdGFyZ2V0OiBJT2JzZXJ2YWJsZTxUYXJnZXQ+O1xuXHRyZWFkb25seSB2aXNpYmlsaXR5PzogSU9ic2VydmFibGU8SUN1c3RvbUFnZW50VmlzaWJpbGl0eSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGFnZW50cz86IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgc2Vzc2lvblR5cGVzPzogcmVhZG9ubHkgc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZhcmlhYmxlUmVmZXJlbmNlIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSByYW5nZTogSU9mZnNldFJhbmdlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TW9kZUluc3RydWN0aW9ucyB7XG5cdHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbFJlZmVyZW5jZXM6IHJlYWRvbmx5IElWYXJpYWJsZVJlZmVyZW5jZVtdO1xuXHRyZWFkb25seSBtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4gfCBzdHJpbmcgfCBudW1iZXI+O1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElDaGF0TW9kZUluc3RydWN0aW9ucyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpc0VxdWFscyhhOiBJQ2hhdE1vZGVJbnN0cnVjdGlvbnMgfCB1bmRlZmluZWQsIGI6IElDaGF0TW9kZUluc3RydWN0aW9ucyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChhID09PSBiKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBhLmNvbnRlbnQgPT09IGIuY29udGVudCAmJlxuXHRcdFx0b2JqZWN0RXF1YWxzKGEudG9vbFJlZmVyZW5jZXMsIGIudG9vbFJlZmVyZW5jZXMpICYmXG5cdFx0XHRvYmplY3RFcXVhbHMoYS5tZXRhZGF0YSwgYi5tZXRhZGF0YSk7XG5cdH1cblxufVxuXG5mdW5jdGlvbiBpc0NhY2hlZENoYXRNb2RlRGF0YShkYXRhOiB1bmtub3duKTogZGF0YSBpcyBJQ2hhdE1vZGVEYXRhIHtcblx0aWYgKHR5cGVvZiBkYXRhICE9PSAnb2JqZWN0JyB8fCBkYXRhID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgbW9kZSA9IGRhdGEgYXMgSUNoYXRNb2RlRGF0YTtcblx0cmV0dXJuIHR5cGVvZiBtb2RlLmlkID09PSAnc3RyaW5nJyAmJlxuXHRcdHR5cGVvZiBtb2RlLm5hbWUgPT09ICdzdHJpbmcnICYmXG5cdFx0dHlwZW9mIG1vZGUua2luZCA9PT0gJ3N0cmluZycgJiZcblx0XHQobW9kZS5kZXNjcmlwdGlvbiA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBtb2RlLmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJykgJiZcblx0XHQobW9kZS5jdXN0b21Ub29scyA9PT0gdW5kZWZpbmVkIHx8IEFycmF5LmlzQXJyYXkobW9kZS5jdXN0b21Ub29scykpICYmXG5cdFx0KG1vZGUubW9kZUluc3RydWN0aW9ucyA9PT0gdW5kZWZpbmVkIHx8ICh0eXBlb2YgbW9kZS5tb2RlSW5zdHJ1Y3Rpb25zID09PSAnb2JqZWN0JyAmJiBtb2RlLm1vZGVJbnN0cnVjdGlvbnMgIT09IG51bGwpKSAmJlxuXHRcdChtb2RlLm1vZGVsID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIG1vZGUubW9kZWwgPT09ICdzdHJpbmcnIHx8IEFycmF5LmlzQXJyYXkobW9kZS5tb2RlbCkpICYmXG5cdFx0KG1vZGUuYXJndW1lbnRIaW50ID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIG1vZGUuYXJndW1lbnRIaW50ID09PSAnc3RyaW5nJykgJiZcblx0XHQobW9kZS5oYW5kT2ZmcyA9PT0gdW5kZWZpbmVkIHx8IEFycmF5LmlzQXJyYXkobW9kZS5oYW5kT2ZmcykpICYmXG5cdFx0KG1vZGUudXJpID09PSB1bmRlZmluZWQgfHwgKHR5cGVvZiBtb2RlLnVyaSA9PT0gJ29iamVjdCcgJiYgbW9kZS51cmkgIT09IG51bGwpKSAmJlxuXHRcdChtb2RlLnNvdXJjZSA9PT0gdW5kZWZpbmVkIHx8IGlzQ2hhdE1vZGVTb3VyY2VEYXRhKG1vZGUuc291cmNlKSkgJiZcblx0XHQobW9kZS50YXJnZXQgPT09IHVuZGVmaW5lZCB8fCBpc1RhcmdldChtb2RlLnRhcmdldCkpICYmXG5cdFx0KG1vZGUudmlzaWJpbGl0eSA9PT0gdW5kZWZpbmVkIHx8IGlzQ3VzdG9tQWdlbnRWaXNpYmlsaXR5KG1vZGUudmlzaWJpbGl0eSkpICYmXG5cdFx0KG1vZGUuYWdlbnRzID09PSB1bmRlZmluZWQgfHwgQXJyYXkuaXNBcnJheShtb2RlLmFnZW50cykpICYmXG5cdFx0KG1vZGUuc2Vzc2lvblR5cGVzID09PSB1bmRlZmluZWQgfHwgQXJyYXkuaXNBcnJheShtb2RlLnNlc3Npb25UeXBlcykpO1xufVxuXG5leHBvcnQgY2xhc3MgQ3VzdG9tQ2hhdE1vZGUgaW1wbGVtZW50cyBJQ2hhdE1vZGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9uYW1lT2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZXNjcmlwdGlvbk9ic2VydmFibGU6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VzdG9tVG9vbHNPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZUluc3RydWN0aW9uczogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ2hhdE1vZGVJbnN0cnVjdGlvbnM+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cmlPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPFVSST47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsT2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FyZ3VtZW50SGludE9ic2VydmFibGU6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFuZG9mZnNPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElIYW5kT2ZmW10gfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YXJnZXRPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPFRhcmdldD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2liaWxpdHlPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPElDdXN0b21BZ2VudFZpc2liaWxpdHkgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZ2VudHNPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBfc291cmNlOiBJQWdlbnRTb3VyY2U7XG5cdHByaXZhdGUgX3Nlc3Npb25UeXBlczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cblx0Z2V0IG5hbWUoKTogSU9ic2VydmFibGU8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX25hbWVPYnNlcnZhYmxlO1xuXHR9XG5cblx0Z2V0IGRlc2NyaXB0aW9uKCk6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9kZXNjcmlwdGlvbk9ic2VydmFibGU7XG5cdH1cblxuXHRnZXQgaWNvbigpOiBJT2JzZXJ2YWJsZTxUaGVtZUljb24gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzQnVpbHRpbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNCdWlsdGluQ2hhdE1vZGUodGhpcyk7XG5cdH1cblxuXHRnZXQgY3VzdG9tVG9vbHMoKTogSU9ic2VydmFibGU8cmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY3VzdG9tVG9vbHNPYnNlcnZhYmxlO1xuXHR9XG5cblx0Z2V0IG1vZGVsKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsT2JzZXJ2YWJsZTtcblx0fVxuXG5cdGdldCBhcmd1bWVudEhpbnQoKTogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FyZ3VtZW50SGludE9ic2VydmFibGU7XG5cdH1cblxuXHRnZXQgbW9kZUluc3RydWN0aW9ucygpOiBJT2JzZXJ2YWJsZTxJQ2hhdE1vZGVJbnN0cnVjdGlvbnM+IHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZUluc3RydWN0aW9ucztcblx0fVxuXG5cdGdldCB1cmkoKTogSU9ic2VydmFibGU8VVJJPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VyaU9ic2VydmFibGU7XG5cdH1cblxuXHRnZXQgbGFiZWwoKTogSU9ic2VydmFibGU8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMubmFtZTtcblx0fVxuXG5cdGdldCBoYW5kT2ZmcygpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJSGFuZE9mZltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhbmRvZmZzT2JzZXJ2YWJsZTtcblx0fVxuXG5cdGdldCBzb3VyY2UoKTogSUFnZW50U291cmNlIHtcblx0XHRyZXR1cm4gdGhpcy5fc291cmNlO1xuXHR9XG5cblx0Z2V0IHRhcmdldCgpOiBJT2JzZXJ2YWJsZTxUYXJnZXQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdGFyZ2V0T2JzZXJ2YWJsZTtcblx0fVxuXG5cdGdldCB2aXNpYmlsaXR5KCk6IElPYnNlcnZhYmxlPElDdXN0b21BZ2VudFZpc2liaWxpdHkgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJpbGl0eU9ic2VydmFibGU7XG5cdH1cblxuXHRnZXQgYWdlbnRzKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FnZW50c09ic2VydmFibGU7XG5cdH1cblxuXHRnZXQgc2Vzc2lvblR5cGVzKCk6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblR5cGVzO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGtpbmQgPSBDaGF0TW9kZUtpbmQuQWdlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y3VzdG9tQ2hhdE1vZGU6IElDdXN0b21BZ2VudFxuXHQpIHtcblx0XHR0aGlzLmlkID0gY3VzdG9tQ2hhdE1vZGUudXJpLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fbmFtZU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ25hbWUnLCBjdXN0b21DaGF0TW9kZS5uYW1lKTtcblx0XHR0aGlzLl9kZXNjcmlwdGlvbk9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ2Rlc2NyaXB0aW9uJywgY3VzdG9tQ2hhdE1vZGUuZGVzY3JpcHRpb24pO1xuXHRcdHRoaXMuX2N1c3RvbVRvb2xzT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnY3VzdG9tVG9vbHMnLCBjdXN0b21DaGF0TW9kZS50b29scyk7XG5cdFx0dGhpcy5fbW9kZWxPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdtb2RlbCcsIGN1c3RvbUNoYXRNb2RlLm1vZGVsKTtcblx0XHR0aGlzLl9hcmd1bWVudEhpbnRPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdhcmd1bWVudEhpbnQnLCBjdXN0b21DaGF0TW9kZS5hcmd1bWVudEhpbnQpO1xuXHRcdHRoaXMuX2hhbmRvZmZzT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnaGFuZE9mZnMnLCBjdXN0b21DaGF0TW9kZS5oYW5kT2Zmcyk7XG5cdFx0dGhpcy5fdGFyZ2V0T2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgndGFyZ2V0JywgY3VzdG9tQ2hhdE1vZGUudGFyZ2V0KTtcblx0XHR0aGlzLl92aXNpYmlsaXR5T2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgndmlzaWJpbGl0eScsIGN1c3RvbUNoYXRNb2RlLnZpc2liaWxpdHkpO1xuXHRcdHRoaXMuX2FnZW50c09ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ2FnZW50cycsIGN1c3RvbUNoYXRNb2RlLmFnZW50cyk7XG5cdFx0dGhpcy5fbW9kZUluc3RydWN0aW9ucyA9IG9ic2VydmFibGVWYWx1ZSgnX21vZGVJbnN0cnVjdGlvbnMnLCBjdXN0b21DaGF0TW9kZS5hZ2VudEluc3RydWN0aW9ucyk7XG5cdFx0dGhpcy5fdXJpT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgndXJpJywgY3VzdG9tQ2hhdE1vZGUudXJpKTtcblx0XHR0aGlzLl9zb3VyY2UgPSBjdXN0b21DaGF0TW9kZS5zb3VyY2U7XG5cdFx0dGhpcy5fc2Vzc2lvblR5cGVzID0gY3VzdG9tQ2hhdE1vZGUuc2Vzc2lvblR5cGVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHVuZGVybHlpbmcgZGF0YSBhbmQgdHJpZ2dlcnMgb2JzZXJ2YWJsZSBjaGFuZ2VzXG5cdCAqL1xuXHR1cGRhdGVEYXRhKG5ld0RhdGE6IElDdXN0b21BZ2VudCk6IGJvb2xlYW4ge1xuXHRcdGxldCBoYXNDaGFuZ2VzID0gZmFsc2U7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRjb25zdCB1cGRhdGUgPSA8VD4ob2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxUIHwgdW5kZWZpbmVkPiwgbmV3VmFsdWU6IFQgfCB1bmRlZmluZWQsIGVxdWFsczogKGE6IFQgfCB1bmRlZmluZWQsIGI6IFQgfCB1bmRlZmluZWQpID0+IGJvb2xlYW4gPSAoYSwgYikgPT4gYSA9PT0gYikgPT4ge1xuXHRcdFx0XHRpZiAoIWVxdWFscyhvYnNlcnZhYmxlLmdldCgpLCBuZXdWYWx1ZSkpIHtcblx0XHRcdFx0XHRvYnNlcnZhYmxlLnNldChuZXdWYWx1ZSwgdHgpO1xuXHRcdFx0XHRcdGhhc0NoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0dXBkYXRlKHRoaXMuX25hbWVPYnNlcnZhYmxlLCBuZXdEYXRhLm5hbWUpO1xuXHRcdFx0dXBkYXRlKHRoaXMuX2Rlc2NyaXB0aW9uT2JzZXJ2YWJsZSwgbmV3RGF0YS5kZXNjcmlwdGlvbik7XG5cdFx0XHR1cGRhdGUodGhpcy5fY3VzdG9tVG9vbHNPYnNlcnZhYmxlLCBuZXdEYXRhLnRvb2xzLCBhcnJheXNFcXVhbCk7XG5cdFx0XHR1cGRhdGUodGhpcy5fbW9kZWxPYnNlcnZhYmxlLCBuZXdEYXRhLm1vZGVsLCBhcnJheXNFcXVhbCk7XG5cdFx0XHR1cGRhdGUodGhpcy5fYXJndW1lbnRIaW50T2JzZXJ2YWJsZSwgbmV3RGF0YS5hcmd1bWVudEhpbnQpO1xuXHRcdFx0dXBkYXRlKHRoaXMuX21vZGVJbnN0cnVjdGlvbnMsIG5ld0RhdGEuYWdlbnRJbnN0cnVjdGlvbnMsIElDaGF0TW9kZUluc3RydWN0aW9ucy5pc0VxdWFscyk7XG5cdFx0XHR1cGRhdGUodGhpcy5fdXJpT2JzZXJ2YWJsZSwgbmV3RGF0YS51cmksIGlzVVJMRXF1YWxzKTtcblx0XHRcdHVwZGF0ZSh0aGlzLl9oYW5kb2Zmc09ic2VydmFibGUsIG5ld0RhdGEuaGFuZE9mZnMsIG9iamVjdEVxdWFscyk7XG5cdFx0XHR1cGRhdGUodGhpcy5fdGFyZ2V0T2JzZXJ2YWJsZSwgbmV3RGF0YS50YXJnZXQpO1xuXHRcdFx0dXBkYXRlKHRoaXMuX3Zpc2liaWxpdHlPYnNlcnZhYmxlLCBuZXdEYXRhLnZpc2liaWxpdHksIG9iamVjdEVxdWFscyk7XG5cdFx0XHR1cGRhdGUodGhpcy5fYWdlbnRzT2JzZXJ2YWJsZSwgbmV3RGF0YS5hZ2VudHMsIGFycmF5c0VxdWFsKTtcblx0XHRcdGlmICghSUFnZW50U291cmNlLmlzRXF1YWxzKHRoaXMuX3NvdXJjZSwgbmV3RGF0YS5zb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX3NvdXJjZSA9IG5ld0RhdGEuc291cmNlO1xuXHRcdFx0XHRoYXNDaGFuZ2VzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghYXJyYXlzRXF1YWwodGhpcy5fc2Vzc2lvblR5cGVzLCBuZXdEYXRhLnNlc3Npb25UeXBlcykpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblR5cGVzID0gbmV3RGF0YS5zZXNzaW9uVHlwZXM7XG5cdFx0XHRcdGhhc0NoYW5nZXMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBoYXNDaGFuZ2VzO1xuXHR9XG5cblx0dG9KU09OKCk6IElDaGF0TW9kZURhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdG5hbWU6IHRoaXMubmFtZS5nZXQoKSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uLmdldCgpLFxuXHRcdFx0a2luZDogdGhpcy5raW5kLFxuXHRcdFx0Y3VzdG9tVG9vbHM6IHRoaXMuY3VzdG9tVG9vbHMuZ2V0KCksXG5cdFx0XHRtb2RlbDogdGhpcy5tb2RlbC5nZXQoKSxcblx0XHRcdGFyZ3VtZW50SGludDogdGhpcy5hcmd1bWVudEhpbnQuZ2V0KCksXG5cdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiB0aGlzLm1vZGVJbnN0cnVjdGlvbnMuZ2V0KCksXG5cdFx0XHR1cmk6IHRoaXMudXJpLmdldCgpLFxuXHRcdFx0aGFuZE9mZnM6IHRoaXMuaGFuZE9mZnMuZ2V0KCksXG5cdFx0XHRzb3VyY2U6IHNlcmlhbGl6ZUNoYXRNb2RlU291cmNlKHRoaXMuX3NvdXJjZSksXG5cdFx0XHR0YXJnZXQ6IHRoaXMudGFyZ2V0LmdldCgpLFxuXHRcdFx0dmlzaWJpbGl0eTogdGhpcy52aXNpYmlsaXR5LmdldCgpLFxuXHRcdFx0YWdlbnRzOiB0aGlzLmFnZW50cy5nZXQoKSxcblx0XHRcdHNlc3Npb25UeXBlczogdGhpcy5zZXNzaW9uVHlwZXMsXG5cdFx0fTtcblx0fVxufVxuXG50eXBlIElDaGF0TW9kZVNvdXJjZURhdGEgPVxuXHR8IHsgcmVhZG9ubHkgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uOyByZWFkb25seSBleHRlbnNpb25JZDogc3RyaW5nOyB0eXBlPzogUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25Db250cmlidXRpb24gfCBQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkFQSSB9XG5cdHwgeyByZWFkb25seSBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB8IFByb21wdHNTdG9yYWdlLnVzZXIgfCBQcm9tcHRzU3RvcmFnZS5idWlsdEluIH1cblx0fCB7IHJlYWRvbmx5IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnBsdWdpbjsgcmVhZG9ubHkgcGx1Z2luVXJpOiBVUkkgfTtcblxuZnVuY3Rpb24gaXNDaGF0TW9kZVNvdXJjZURhdGEodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJQ2hhdE1vZGVTb3VyY2VEYXRhIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgZGF0YSA9IHZhbHVlIGFzIHsgc3RvcmFnZT86IHVua25vd247IGV4dGVuc2lvbklkPzogdW5rbm93bjsgcGx1Z2luVXJpPzogdW5rbm93biB9O1xuXHRpZiAoZGF0YS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pIHtcblx0XHRyZXR1cm4gdHlwZW9mIGRhdGEuZXh0ZW5zaW9uSWQgPT09ICdzdHJpbmcnO1xuXHR9XG5cdGlmIChkYXRhLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbikge1xuXHRcdHJldHVybiBpc1VyaUNvbXBvbmVudHMoZGF0YS5wbHVnaW5VcmkpO1xuXHR9XG5cdHJldHVybiBkYXRhLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsIHx8IGRhdGEuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlciB8fCBkYXRhLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmJ1aWx0SW47XG59XG5cbmZ1bmN0aW9uIHNlcmlhbGl6ZUNoYXRNb2RlU291cmNlKHNvdXJjZTogSUFnZW50U291cmNlIHwgdW5kZWZpbmVkKTogSUNoYXRNb2RlU291cmNlRGF0YSB8IHVuZGVmaW5lZCB7XG5cdGlmICghc291cmNlKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbikge1xuXHRcdHJldHVybiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgZXh0ZW5zaW9uSWQ6IHNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSB9O1xuXHR9XG5cdGlmIChzb3VyY2Uuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UucGx1Z2luKSB7XG5cdFx0cmV0dXJuIHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UucGx1Z2luLCBwbHVnaW5Vcmk6IHNvdXJjZS5wbHVnaW5VcmkgfTtcblx0fVxuXHRyZXR1cm4geyBzdG9yYWdlOiBzb3VyY2Uuc3RvcmFnZSB9O1xufVxuXG5mdW5jdGlvbiByZXZpdmVDaGF0TW9kZVNvdXJjZShkYXRhOiBJQ2hhdE1vZGVTb3VyY2VEYXRhIHwgdW5kZWZpbmVkKTogSUFnZW50U291cmNlIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFkYXRhKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoZGF0YS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pIHtcblx0XHRyZXR1cm4geyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIGV4dGVuc2lvbklkOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihkYXRhLmV4dGVuc2lvbklkKSB9O1xuXHR9XG5cdGlmIChkYXRhLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbikge1xuXHRcdHJldHVybiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnBsdWdpbiwgcGx1Z2luVXJpOiBVUkkucmV2aXZlKGRhdGEucGx1Z2luVXJpKSB9O1xuXHR9XG5cdHJldHVybiB7IHN0b3JhZ2U6IGRhdGEuc3RvcmFnZSB9O1xufVxuXG5leHBvcnQgY2xhc3MgQnVpbHRpbkNoYXRNb2RlIGltcGxlbWVudHMgSUNoYXRNb2RlIHtcblx0cHVibGljIHJlYWRvbmx5IG5hbWU6IElPYnNlcnZhYmxlPHN0cmluZz47XG5cdHB1YmxpYyByZWFkb25seSBsYWJlbDogSU9ic2VydmFibGU8c3RyaW5nPjtcblx0cHVibGljIHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRwdWJsaWMgcmVhZG9ubHkgaWNvbjogSU9ic2VydmFibGU8VGhlbWVJY29uPjtcblx0cHVibGljIHJlYWRvbmx5IHRhcmdldDogSU9ic2VydmFibGU8VGFyZ2V0PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkga2luZDogQ2hhdE1vZGVLaW5kLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0ZGVzY3JpcHRpb246IHN0cmluZyxcblx0XHRpY29uOiBUaGVtZUljb24sXG5cdCkge1xuXHRcdHRoaXMubmFtZSA9IGNvbnN0T2JzZXJ2YWJsZShraW5kKTtcblx0XHR0aGlzLmxhYmVsID0gY29uc3RPYnNlcnZhYmxlKGxhYmVsKTtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gb2JzZXJ2YWJsZVZhbHVlKCdkZXNjcmlwdGlvbicsIGRlc2NyaXB0aW9uKTtcblx0XHR0aGlzLmljb24gPSBjb25zdE9ic2VydmFibGUoaWNvbik7XG5cdFx0dGhpcy50YXJnZXQgPSBjb25zdE9ic2VydmFibGUoVGFyZ2V0LlVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzQnVpbHRpbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNCdWlsdGluQ2hhdE1vZGUodGhpcyk7XG5cdH1cblxuXHRnZXQgaWQoKTogc3RyaW5nIHtcblx0XHQvLyBOZWVkIGEgZGlmZmVyZW50aWF0b3I/XG5cdFx0cmV0dXJuIHRoaXMua2luZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXR0ZXJzIGFyZSBub3QganNvbi1zdHJpbmdpZmllZFxuXHQgKi9cblx0dG9KU09OKCk6IElDaGF0TW9kZURhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdG5hbWU6IHRoaXMubmFtZS5nZXQoKSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uLmdldCgpLFxuXHRcdFx0a2luZDogdGhpcy5raW5kXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRNb2RlIHtcblx0ZXhwb3J0IGNvbnN0IEFzayA9IG5ldyBCdWlsdGluQ2hhdE1vZGUoQ2hhdE1vZGVLaW5kLkFzaywgJ0FzaycsIGxvY2FsaXplKCdjaGF0RGVzY3JpcHRpb24nLCBcIkV4cGxvcmUgYW5kIHVuZGVyc3RhbmQgeW91ciBjb2RlXCIpLCBDb2RpY29uLnF1ZXN0aW9uKTtcblx0ZXhwb3J0IGNvbnN0IEVkaXQgPSBuZXcgQnVpbHRpbkNoYXRNb2RlKENoYXRNb2RlS2luZC5FZGl0LCAnRWRpdCcsIGxvY2FsaXplKCdlZGl0c0Rlc2NyaXB0aW9uJywgXCJFZGl0IG9yIHJlZmFjdG9yIHNlbGVjdGVkIGNvZGVcIiksIENvZGljb24uZWRpdCk7XG5cdGV4cG9ydCBjb25zdCBBZ2VudCA9IG5ldyBCdWlsdGluQ2hhdE1vZGUoQ2hhdE1vZGVLaW5kLkFnZW50LCAnQWdlbnQnLCBsb2NhbGl6ZSgnYWdlbnREZXNjcmlwdGlvbicsIFwiRGVzY3JpYmUgd2hhdCB0byBidWlsZFwiKSwgQ29kaWNvbi5hZ2VudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0J1aWx0aW5DaGF0TW9kZShtb2RlOiBJQ2hhdE1vZGUpOiBib29sZWFuIHtcblx0cmV0dXJuIG1vZGUuaWQgPT09IENoYXRNb2RlLkFzay5pZCB8fFxuXHRcdG1vZGUuaWQgPT09IENoYXRNb2RlLkVkaXQuaWQgfHxcblx0XHRtb2RlLmlkID09PSBDaGF0TW9kZS5BZ2VudC5pZDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgdGVsZW1ldHJ5LXNhZmUgbW9kZSBuYW1lLiBVc2VyL2xvY2FsIG1vZGUgbmFtZXMgYXJlIGhhc2hlZFxuICogdG8gYXZvaWQgbGVha2luZyBQSUk7IGJ1aWx0aW4gYW5kIGV4dGVuc2lvbiBtb2RlIG5hbWVzIGFyZSByZXR1cm5lZCBhcy1pcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldE1vZGVOYW1lRm9yVGVsZW1ldHJ5KG1vZGU6IElDaGF0TW9kZSk6IHN0cmluZyB7XG5cdGNvbnN0IG1vZGVTdG9yYWdlID0gbW9kZS5zb3VyY2U/LnN0b3JhZ2U7XG5cdGlmIChtb2RlU3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwgfHwgbW9kZVN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpIHtcblx0XHRyZXR1cm4gU3RyaW5nKGhhc2gobW9kZS5uYW1lLmdldCgpKSk7XG5cdH1cblx0cmV0dXJuIG1vZGUubmFtZS5nZXQoKTtcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBzdGFibGUgaWRlbnRpZmllciBmb3IgYSBoYW5kb2ZmIGJ5IGNvbWJpbmluZyB0aGUgdGFyZ2V0IGFnZW50XG4gKiBuYW1lIHdpdGggYSBzbHVnaWZpZWQgdmVyc2lvbiBvZiB0aGUgZGlzcGxheSBsYWJlbC5cbiAqXG4gKiBXaXRoaW4gYSBzaW5nbGUgc291cmNlIGFnZW50LCB0aGUgY29tYmluYXRpb24gb2YgYGFnZW50YCArIGBsYWJlbGAgbXVzdCBiZVxuICogdW5pcXVlIGZvciBJRHMgdG8gYmUgdW5hbWJpZ3VvdXMuXG4gKlxuICogQGV4YW1wbGVcbiAqIGBgYFxuICogZ2V0SGFuZG9mZklkKHsgYWdlbnQ6ICdhZ2VudCcsIGxhYmVsOiAnQ29udGludWUnLCBwcm9tcHQ6ICcuLi4nIH0pXG4gKiAvLyA9PiAnYWdlbnQ6Y29udGludWUnXG4gKiBgYGBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldEhhbmRvZmZJZChoYW5kb2ZmOiBJSGFuZE9mZik6IHN0cmluZyB7XG5cdGNvbnN0IHNsdWcgPSBoYW5kb2ZmLmxhYmVsLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvW15hLXowLTldKy9nLCAnLScpLnJlcGxhY2UoL14tfC0kL2csICcnKTtcblx0cmV0dXJuIGAke2hhbmRvZmYuYWdlbnR9OiR7c2x1Z31gO1xufVxuXG4vKipcbiAqIERlc2NyaWJlcyBhIHNpbmdsZSBoYW5kb2ZmIGRlZmluZWQgaW4gYSBjdXN0b20gYWdlbnQncyBgLmFnZW50Lm1kYCBmaWxlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElIYW5kb2ZmSW5mbyB7XG5cdC8qKiBTdGFibGUgaWRlbnRpZmllciBmb3IgcHJvZ3JhbW1hdGljIG1hdGNoaW5nIChmb3JtYXQ6IGA8YWdlbnQ+OjxzbHVnaWZpZWQtbGFiZWw+YCkuICovXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFnZW50OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb21wdDogc3RyaW5nO1xuXHRyZWFkb25seSBzZW5kPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvd0NvbnRpbnVlT24/OiBib29sZWFuO1xuXHRyZWFkb25seSBtb2RlbD86IHN0cmluZztcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgYSBjdXN0b20gYWdlbnQgKG9yIGJ1aWx0LWluIG1vZGUpIGFuZCB0aGUgaGFuZG9mZnMgaXQgZGVmaW5lcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ3VzdG9tQWdlbnRJbmZvIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBpc0J1aWx0aW46IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZpc2liaWxpdHk6IHtcblx0XHRyZWFkb25seSB1c2VySW52b2NhYmxlOiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IGFnZW50SW52b2NhYmxlOiBib29sZWFuO1xuXHR9O1xuXHRyZWFkb25seSBoYW5kb2ZmczogSUhhbmRvZmZJbmZvW107XG59XG5cbi8qKlxuICogQnVpbGRzIGFuIGFycmF5IG9mIHtAbGluayBJQ3VzdG9tQWdlbnRJbmZvfSB3aXRoIGhhbmRvZmYgbWV0YWRhdGEgZm9yIHRoZSBnaXZlbiBhZ2VudHMvbW9kZXMuXG4gKlxuICogQHBhcmFtIG1vZGVzIC0gVGhlIHNldCBvZiBhZ2VudHMvbW9kZXMgdG8gaW5jbHVkZS4gUGFzcyBhbGwgbW9kZXMgdG8gZ2V0IGFcbiAqICAgY29tcGxldGUgcGljdHVyZSwgb3IgYSBmaWx0ZXJlZCBzdWJzZXQgdG8gc2NvcGUgdGhlIHJlc3VsdC5cbiAqIEByZXR1cm5zIE9uZSBlbnRyeSBwZXIgYWdlbnQvbW9kZSwgZWFjaCBjb250YWluaW5nIHRoZSBhZ2VudCdzIG1ldGFkYXRhIGFuZFxuICogICBpdHMgZGVjbGFyZWQgaGFuZG9mZnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEN1c3RvbUFnZW50SGFuZG9mZnNJbmZvKG1vZGVzOiByZWFkb25seSBJQ2hhdE1vZGVbXSk6IElDdXN0b21BZ2VudEluZm9bXSB7XG5cdHJldHVybiBtb2Rlcy5tYXAobW9kZSA9PiB7XG5cdFx0Y29uc3QgaGFuZG9mZnMgPSBtb2RlLmhhbmRPZmZzPy5nZXQoKSA/PyBbXTtcblx0XHRjb25zdCB2aXNpYmlsaXR5ID0gbW9kZS52aXNpYmlsaXR5Py5nZXQoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IG1vZGUuaWQsXG5cdFx0XHRuYW1lOiBtb2RlLm5hbWUuZ2V0KCksXG5cdFx0XHRpc0J1aWx0aW46IG1vZGUuaXNCdWlsdGluLFxuXHRcdFx0dmlzaWJpbGl0eToge1xuXHRcdFx0XHR1c2VySW52b2NhYmxlOiB2aXNpYmlsaXR5Py51c2VySW52b2NhYmxlID8/IHRydWUsXG5cdFx0XHRcdGFnZW50SW52b2NhYmxlOiB2aXNpYmlsaXR5Py5hZ2VudEludm9jYWJsZSA/PyB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdGhhbmRvZmZzOiBoYW5kb2Zmcy5tYXAoaCA9PiAoe1xuXHRcdFx0XHRpZDogZ2V0SGFuZG9mZklkKGgpLFxuXHRcdFx0XHRsYWJlbDogaC5sYWJlbCxcblx0XHRcdFx0YWdlbnQ6IGguYWdlbnQsXG5cdFx0XHRcdHByb21wdDogaC5wcm9tcHQsXG5cdFx0XHRcdC4uLihoLnNlbmQgIT09IHVuZGVmaW5lZCA/IHsgc2VuZDogaC5zZW5kIH0gOiB7fSksXG5cdFx0XHRcdC4uLihoLnNob3dDb250aW51ZU9uICE9PSB1bmRlZmluZWQgPyB7IHNob3dDb250aW51ZU9uOiBoLnNob3dDb250aW51ZU9uIH0gOiB7fSksXG5cdFx0XHRcdC4uLihoLm1vZGVsICE9PSB1bmRlZmluZWQgPyB7IG1vZGVsOiBoLm1vZGVsIH0gOiB7fSksXG5cdFx0XHR9KSksXG5cdFx0fTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsaUJBQW1ELGlCQUFpQixtQkFBbUI7QUFDaEcsU0FBUyxpQkFBaUIsV0FBVztBQUVyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUIsNkJBQTZCO0FBQ3ZELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0JBQW9CLDJCQUEyQjtBQUN4RCxTQUFTLG1CQUFtQixvQkFBb0I7QUFFaEQsU0FBUyxjQUFvRCx5QkFBeUIsc0JBQXNCO0FBQzVHLFNBQVMsb0NBQW9DO0FBQzdDLFNBQTJCLGNBQWM7QUFFekMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFVBQVUsbUJBQW1CO0FBQ3RDLFNBQVMsV0FBVyxtQkFBbUI7QUFDdkMsU0FBUyxVQUFVLG9CQUFvQjtBQUN2QyxTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFHN0IsTUFBTSxtQkFBbUIsZ0JBQWtDLGlCQUFpQjtBQW9DbkYsSUFBTSxZQUFOLGNBQXdCLFdBQWlDO0FBQUEsRUFpQnhELFlBQ2tCLGlCQUNtQixrQkFDaEIsbUJBQ1UsWUFDSSxnQkFDTSxzQkFDTyw2QkFDOUM7QUFDRCxVQUFNO0FBUlc7QUFDbUI7QUFFTjtBQUNJO0FBQ007QUFDTztBQW5CaEQsU0FBaUIsdUJBQXVCLG9CQUFJLElBQTRCO0FBR3hFLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2xFLFNBQVMsY0FBYyxLQUFLLGFBQWE7QUFHekM7QUFBQSxTQUFRLGtCQUFpQyxRQUFRLFFBQVE7QUFHekQsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLFFBQWMsR0FBRyxDQUFDO0FBYXpFLFVBQU0sY0FBYyxtQkFBbUIsZUFBZTtBQUV0RCxTQUFLLGNBQWMsVUFBVSxrQ0FBa0M7QUFDL0QsU0FBSyxpQkFBaUIsZ0JBQWdCLE1BQU0sbUJBQW1CLE9BQU8saUJBQWlCO0FBR3ZGLFNBQUssZ0JBQWdCO0FBRXJCLFNBQUssa0JBQWtCLEtBQUssZUFBZTtBQUUzQyxTQUFLLFVBQVUsS0FBSyw0QkFBNEIsd0JBQXdCLE9BQUs7QUFDNUUsVUFBSSxFQUFFLGdCQUFnQixhQUFhO0FBQ2xDLGFBQUssa0JBQWtCLEtBQUssZUFBZTtBQUFBLE1BQzVDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxlQUFlLGdCQUFnQixNQUFNLEtBQUssZ0JBQWdCLENBQUMsQ0FBQztBQUdoRixTQUFLLFVBQVUsS0FBSyxxQkFBcUIseUJBQXlCLE9BQUs7QUFDdEUsVUFBSSxFQUFFLHFCQUFxQixrQkFBa0IsWUFBWSxHQUFHO0FBQzNELGFBQUssYUFBYSxLQUFLO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFFBQUksb0JBQW9CLEtBQUssaUJBQWlCO0FBQzlDLFNBQUssVUFBVSxLQUFLLGlCQUFpQixrQkFBa0IsTUFBTTtBQUM1RCxVQUFJLHNCQUFzQixLQUFLLGlCQUFpQixlQUFlO0FBQzlELDRCQUFvQixLQUFLLGlCQUFpQjtBQUMxQyxhQUFLLGFBQWEsS0FBSztBQUFBLE1BQ3hCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxJQUFJLFVBQWdDO0FBQ25DLFdBQU8sS0FBSyxnQkFBZ0I7QUFBQSxFQUM3QjtBQUFBLEVBRUEsSUFBSSxTQUErQjtBQUNsQyxXQUFPLEtBQUssZUFBZTtBQUFBLEVBQzVCO0FBQUEsRUFFQSxhQUFhLElBQWtEO0FBQzlELFdBQU8sS0FBSyxnQkFBZ0IsRUFBRSxLQUFLLFVBQVEsS0FBSyxPQUFPLEVBQUUsS0FBSyxLQUFLLHFCQUFxQixJQUFJLEVBQUU7QUFBQSxFQUMvRjtBQUFBLEVBRUEsZUFBZSxNQUFxQztBQUNuRCxXQUFPLEtBQUssZ0JBQWdCLEVBQUUsS0FBSyxVQUFRLEtBQUssS0FBSyxJQUFJLE1BQU0sSUFBSSxLQUFLLEtBQUssZUFBZSxFQUFFLEtBQUssVUFBUSxLQUFLLEtBQUssSUFBSSxNQUFNLFFBQVEsS0FBSyxPQUFPLElBQUk7QUFBQSxFQUN4SjtBQUFBLEVBRUEsd0JBQXVDO0FBQ3RDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVRLGtCQUF3QjtBQUMvQixRQUFJO0FBQ0gsWUFBTSxvQkFBb0IsS0FBSyxlQUFlLFVBQVUsS0FBSyxhQUFhLGFBQWEsU0FBUztBQUNoRyxVQUFJLG1CQUFtQjtBQUN0QixhQUFLLHVCQUF1QixpQkFBaUI7QUFBQSxNQUM5QztBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLE1BQU0sT0FBTyxxQ0FBcUM7QUFBQSxJQUNuRTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUF1QixtQkFBa0M7QUFDaEUsUUFBSSxDQUFDLE1BQU0sUUFBUSxpQkFBaUIsR0FBRztBQUN0QyxXQUFLLFdBQVcsTUFBTSxrREFBa0Q7QUFDeEU7QUFBQSxJQUNEO0FBRUEsZUFBVyxjQUFjLG1CQUFtQjtBQUMzQyxVQUFJLHFCQUFxQixVQUFVLEtBQUssV0FBVyxLQUFLO0FBQ3ZELFlBQUk7QUFDSCxnQkFBTSxhQUFhLFdBQVcsY0FBYyxFQUFFLGVBQWUsTUFBTSxnQkFBZ0IsV0FBVyxVQUFVLE1BQU07QUFDOUcsY0FBSSxDQUFDLFdBQVcsZUFBZTtBQUM5QjtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxNQUFNLElBQUksT0FBTyxXQUFXLEdBQUc7QUFDckMsZ0JBQU0saUJBQStCO0FBQUEsWUFDcEMsSUFBSSxXQUFXO0FBQUEsWUFDZjtBQUFBLFlBQ0EsTUFBTSxXQUFXO0FBQUEsWUFDakIsYUFBYSxXQUFXO0FBQUEsWUFDeEIsT0FBTyxXQUFXO0FBQUEsWUFDbEIsT0FBTyxTQUFTLFdBQVcsS0FBSyxJQUFJLENBQUMsV0FBVyxLQUFLLElBQUksV0FBVztBQUFBLFlBQ3BFLGNBQWMsV0FBVztBQUFBLFlBQ3pCLG1CQUFtQixXQUFXLG9CQUFvQixFQUFFLFNBQVMsV0FBVyxRQUFRLElBQUksZ0JBQWdCLENBQUMsRUFBRTtBQUFBLFlBQ3ZHLFVBQVUsV0FBVztBQUFBLFlBQ3JCLFFBQVEsV0FBVyxVQUFVLE9BQU87QUFBQSxZQUNwQztBQUFBLFlBQ0EsUUFBUSxXQUFXO0FBQUEsWUFDbkIsY0FBYyxXQUFXO0FBQUEsWUFDekIsUUFBUSxxQkFBcUIsV0FBVyxNQUFNLEtBQUssRUFBRSxTQUFTLGVBQWUsTUFBTTtBQUFBLFlBQ25GLFNBQVM7QUFBQSxVQUNWO0FBQ0EsZ0JBQU0sV0FBVyxJQUFJLGVBQWUsY0FBYztBQUNsRCxlQUFLLHFCQUFxQixJQUFJLElBQUksU0FBUyxHQUFHLFFBQVE7QUFBQSxRQUN2RCxTQUFTLE9BQU87QUFDZixlQUFLLFdBQVcsTUFBTSxPQUFPLHNDQUFzQztBQUFBLFFBQ3BFO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLGVBQWUsSUFBSSxLQUFLLHFCQUFxQixPQUFPLENBQUM7QUFBQSxFQUMzRDtBQUFBLEVBRVEsa0JBQXdCO0FBQy9CLFFBQUk7QUFDSCxZQUFNLGVBQWUsTUFBTSxLQUFLLEtBQUsscUJBQXFCLE9BQU8sQ0FBQztBQUNsRSxXQUFLLGVBQWUsTUFBTSxLQUFLLGFBQWEsY0FBYyxhQUFhLFdBQVcsY0FBYyxPQUFPO0FBQUEsSUFDeEcsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLEtBQUssdUNBQXVDLEtBQUs7QUFBQSxJQUNsRTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlCQUFnQztBQUN2QyxTQUFLLDRCQUE0QixPQUFPO0FBQ3hDLFNBQUssNEJBQTRCLFFBQVE7QUFDekMsVUFBTSw0QkFBNEIsS0FBSyw2QkFBNkIsSUFBSSx3QkFBd0I7QUFDaEcsV0FBTyxLQUFLLGtCQUFrQixRQUFRLFlBQVk7QUFDakQsVUFBSTtBQUNILGNBQU0sS0FBSyx5QkFBeUIsMEJBQTBCLEtBQUs7QUFBQSxNQUNwRSxVQUFFO0FBQ0QsWUFBSSxLQUFLLCtCQUErQiwyQkFBMkI7QUFDbEUsZUFBSyw2QkFBNkI7QUFBQSxRQUNuQztBQUNBLGtDQUEwQixRQUFRO0FBQUEsTUFDbkM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixTQUFLLDRCQUE0QixPQUFPO0FBQ3hDLFNBQUssNEJBQTRCLFFBQVE7QUFDekMsU0FBSyw2QkFBNkI7QUFDbEMsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRUEsTUFBYyx5QkFBeUIsT0FBeUM7QUFDL0UsUUFBSSxhQUFhO0FBQ2pCLFFBQUk7QUFDSCxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDO0FBQUEsTUFDRDtBQUNBLFlBQU0sY0FBYyxNQUFNLEtBQUssNEJBQTRCLGdCQUFnQixLQUFLLGlCQUFpQixLQUFLO0FBQ3RHLFVBQUksTUFBTSx5QkFBeUI7QUFDbEM7QUFBQSxNQUNEO0FBR0EsWUFBTSxXQUFXLG9CQUFJLElBQVk7QUFDakMsaUJBQVcsY0FBYyxhQUFhO0FBQ3JDLFlBQUksQ0FBQyxXQUFXLFdBQVcsaUJBQWlCLENBQUMsV0FBVyxTQUFTO0FBQ2hFO0FBQUEsUUFDRDtBQUVBLGNBQU0sWUFBWSxXQUFXLElBQUksU0FBUztBQUMxQyxpQkFBUyxJQUFJLFNBQVM7QUFFdEIsWUFBSSxlQUFlLEtBQUsscUJBQXFCLElBQUksU0FBUztBQUMxRCxZQUFJLGNBQWM7QUFFakIsY0FBSSxhQUFhLFdBQVcsVUFBVSxHQUFHO0FBQ3hDLHlCQUFhO0FBQUEsVUFDZDtBQUFBLFFBQ0QsT0FBTztBQUVOLHlCQUFlLElBQUksZUFBZSxVQUFVO0FBQzVDLGVBQUsscUJBQXFCLElBQUksV0FBVyxZQUFZO0FBQ3JELHVCQUFhO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFHQSxpQkFBVyxDQUFDLFNBQVMsS0FBSyxLQUFLLHFCQUFxQixRQUFRLEdBQUc7QUFDOUQsWUFBSSxDQUFDLFNBQVMsSUFBSSxTQUFTLEdBQUc7QUFDN0IsZUFBSyxxQkFBcUIsT0FBTyxTQUFTO0FBQzFDLHVCQUFhO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGVBQWUsSUFBSSxLQUFLLHFCQUFxQixPQUFPLENBQUM7QUFBQSxJQUMzRCxTQUFTLE9BQU87QUFDZixVQUFJLG9CQUFvQixLQUFLLEdBQUc7QUFDL0I7QUFBQSxNQUNEO0FBQ0EsV0FBSyxXQUFXLE1BQU0sT0FBTyw4QkFBOEI7QUFDM0QsV0FBSyxxQkFBcUIsTUFBTTtBQUNoQyxXQUFLLGVBQWUsSUFBSSxLQUFLO0FBQzdCLG1CQUFhO0FBQUEsSUFDZDtBQUNBLFFBQUksWUFBWTtBQUNmLFdBQUssYUFBYSxLQUFLO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBK0I7QUFDdEMsVUFBTSxlQUE0QjtBQUFBLE1BQ2pDLFNBQVM7QUFBQSxJQUNWO0FBTUEsUUFBSSxLQUFLLGlCQUFpQixpQkFBaUIsS0FBSyw0QkFBNEIsR0FBRztBQUM5RSxtQkFBYSxRQUFRLFNBQVMsS0FBSztBQUFBLElBQ3BDO0FBQ0EsaUJBQWEsS0FBSyxTQUFTLElBQUk7QUFDL0IsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGlCQUE4QjtBQUVyQyxXQUFPLEtBQUssaUJBQWlCLGlCQUFpQixLQUFLLDRCQUE0QixJQUFJLE1BQU0sS0FBSyxLQUFLLHFCQUFxQixPQUFPLENBQUMsSUFBSSxDQUFDO0FBQUEsRUFDdEk7QUFBQSxFQUVRLDhCQUF1QztBQUM5QyxXQUFPLEtBQUsscUJBQXFCLFFBQWlCLGtCQUFrQixZQUFZLEVBQUUsZ0JBQWdCO0FBQUEsRUFDbkc7QUFDRDtBQXZQTSxVQUVtQixrQ0FBa0M7QUFGckQsWUFBTjtBQUFBLEVBbUJHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXhCRztBQXlQQyxJQUFNLGtCQUFOLGNBQThCLFdBQXVDO0FBQUEsRUFNM0UsWUFDeUMsc0JBQ3BCLG1CQUNvQixzQkFDdkM7QUFDRCxVQUFNO0FBSmtDO0FBRUE7QUFJeEMsU0FBSyw0QkFBNEIsZ0JBQWdCLE1BQU0sMEJBQTBCLE9BQU8saUJBQWlCO0FBR3pHLFNBQUssZ0NBQWdDO0FBR3JDLFNBQUssVUFBVSxLQUFLLHFCQUFxQix5QkFBeUIsT0FBSztBQUN0RSxVQUFJLEVBQUUscUJBQXFCLGtCQUFrQixZQUFZLEdBQUc7QUFDM0QsYUFBSyxnQ0FBZ0M7QUFBQSxNQUN0QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsWUFBWSxpQkFBZ0Q7QUFDM0QsV0FBTyxLQUFLLHFCQUFxQixlQUFlLFdBQVcsZUFBZTtBQUFBLEVBQzNFO0FBQUEsRUFFQSxNQUFNLGdCQUFxQztBQUMxQyxRQUFJLENBQUMsS0FBSyxXQUFXO0FBQ3BCLFdBQUssYUFBYSxZQUFZO0FBQzdCLGNBQU0sUUFBUSxLQUFLLFVBQVUsS0FBSyxZQUFZLG9CQUFvQixpQkFBaUIsQ0FBQyxDQUFDO0FBQ3JGLGNBQU0sTUFBTSxzQkFBc0I7QUFDbEMsZUFBTztBQUFBLE1BQ1IsR0FBRztBQUFBLElBQ0o7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUSxrQ0FBd0M7QUFDL0MsU0FBSywwQkFBMEIsSUFBSSxLQUFLLDRCQUE0QixDQUFDO0FBQUEsRUFDdEU7QUFBQSxFQUVRLDhCQUF1QztBQUM5QyxXQUFPLEtBQUsscUJBQXFCLFFBQWlCLGtCQUFrQixZQUFZLEVBQUUsZ0JBQWdCO0FBQUEsRUFDbkc7QUFDRDtBQWhEYSxrQkFBTjtBQUFBLEVBT0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVFU7QUFzR04sSUFBVTtBQUFBLENBQVYsQ0FBVUEsMkJBQVY7QUFDQyxXQUFTLFNBQVMsR0FBc0MsR0FBK0M7QUFDN0csUUFBSSxNQUFNLEdBQUc7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxLQUFLLENBQUMsR0FBRztBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxFQUFFLFlBQVksRUFBRSxXQUN0QixhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsY0FBYyxLQUMvQyxhQUFhLEVBQUUsVUFBVSxFQUFFLFFBQVE7QUFBQSxFQUNyQztBQVZPLEVBQUFBLHVCQUFTO0FBQUEsR0FEQTtBQWVqQixTQUFTLHFCQUFxQixNQUFzQztBQUNuRSxNQUFJLE9BQU8sU0FBUyxZQUFZLFNBQVMsTUFBTTtBQUM5QyxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sT0FBTztBQUNiLFNBQU8sT0FBTyxLQUFLLE9BQU8sWUFDekIsT0FBTyxLQUFLLFNBQVMsWUFDckIsT0FBTyxLQUFLLFNBQVMsYUFDcEIsS0FBSyxnQkFBZ0IsVUFBYSxPQUFPLEtBQUssZ0JBQWdCLGNBQzlELEtBQUssZ0JBQWdCLFVBQWEsTUFBTSxRQUFRLEtBQUssV0FBVyxPQUNoRSxLQUFLLHFCQUFxQixVQUFjLE9BQU8sS0FBSyxxQkFBcUIsWUFBWSxLQUFLLHFCQUFxQixVQUMvRyxLQUFLLFVBQVUsVUFBYSxPQUFPLEtBQUssVUFBVSxZQUFZLE1BQU0sUUFBUSxLQUFLLEtBQUssT0FDdEYsS0FBSyxpQkFBaUIsVUFBYSxPQUFPLEtBQUssaUJBQWlCLGNBQ2hFLEtBQUssYUFBYSxVQUFhLE1BQU0sUUFBUSxLQUFLLFFBQVEsT0FDMUQsS0FBSyxRQUFRLFVBQWMsT0FBTyxLQUFLLFFBQVEsWUFBWSxLQUFLLFFBQVEsVUFDeEUsS0FBSyxXQUFXLFVBQWEscUJBQXFCLEtBQUssTUFBTSxPQUM3RCxLQUFLLFdBQVcsVUFBYSxTQUFTLEtBQUssTUFBTSxPQUNqRCxLQUFLLGVBQWUsVUFBYSx3QkFBd0IsS0FBSyxVQUFVLE9BQ3hFLEtBQUssV0FBVyxVQUFhLE1BQU0sUUFBUSxLQUFLLE1BQU0sT0FDdEQsS0FBSyxpQkFBaUIsVUFBYSxNQUFNLFFBQVEsS0FBSyxZQUFZO0FBQ3JFO0FBRU8sTUFBTSxlQUFvQztBQUFBLEVBbUZoRCxZQUNDLGdCQUNDO0FBSkYsU0FBZ0IsT0FBTyxhQUFhO0FBS25DLFNBQUssS0FBSyxlQUFlLElBQUksU0FBUztBQUN0QyxTQUFLLGtCQUFrQixnQkFBZ0IsUUFBUSxlQUFlLElBQUk7QUFDbEUsU0FBSyx5QkFBeUIsZ0JBQWdCLGVBQWUsZUFBZSxXQUFXO0FBQ3ZGLFNBQUsseUJBQXlCLGdCQUFnQixlQUFlLGVBQWUsS0FBSztBQUNqRixTQUFLLG1CQUFtQixnQkFBZ0IsU0FBUyxlQUFlLEtBQUs7QUFDckUsU0FBSywwQkFBMEIsZ0JBQWdCLGdCQUFnQixlQUFlLFlBQVk7QUFDMUYsU0FBSyxzQkFBc0IsZ0JBQWdCLFlBQVksZUFBZSxRQUFRO0FBQzlFLFNBQUssb0JBQW9CLGdCQUFnQixVQUFVLGVBQWUsTUFBTTtBQUN4RSxTQUFLLHdCQUF3QixnQkFBZ0IsY0FBYyxlQUFlLFVBQVU7QUFDcEYsU0FBSyxvQkFBb0IsZ0JBQWdCLFVBQVUsZUFBZSxNQUFNO0FBQ3hFLFNBQUssb0JBQW9CLGdCQUFnQixxQkFBcUIsZUFBZSxpQkFBaUI7QUFDOUYsU0FBSyxpQkFBaUIsZ0JBQWdCLE9BQU8sZUFBZSxHQUFHO0FBQy9ELFNBQUssVUFBVSxlQUFlO0FBQzlCLFNBQUssZ0JBQWdCLGVBQWU7QUFBQSxFQUNyQztBQUFBLEVBbkZBLElBQUksT0FBNEI7QUFDL0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxjQUErQztBQUNsRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLE9BQTJDO0FBQzlDLFdBQU8sZ0JBQWdCLE1BQVM7QUFBQSxFQUNqQztBQUFBLEVBRUEsSUFBVyxZQUFxQjtBQUMvQixXQUFPLGtCQUFrQixJQUFJO0FBQUEsRUFDOUI7QUFBQSxFQUVBLElBQUksY0FBMEQ7QUFDN0QsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxRQUFvRDtBQUN2RCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLGVBQWdEO0FBQ25ELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksbUJBQXVEO0FBQzFELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksTUFBd0I7QUFDM0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxRQUE2QjtBQUNoQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFdBQXlEO0FBQzVELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksU0FBdUI7QUFDMUIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxTQUE4QjtBQUNqQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLGFBQThEO0FBQ2pFLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksU0FBcUQ7QUFDeEQsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxlQUE4QztBQUNqRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUEwQkEsV0FBVyxTQUFnQztBQUMxQyxRQUFJLGFBQWE7QUFFakIsZ0JBQVksUUFBTTtBQUNqQixZQUFNLFNBQVMsQ0FBSSxZQUFnRCxVQUF5QixTQUEwRCxDQUFDLEdBQUcsTUFBTSxNQUFNLE1BQU07QUFDM0ssWUFBSSxDQUFDLE9BQU8sV0FBVyxJQUFJLEdBQUcsUUFBUSxHQUFHO0FBQ3hDLHFCQUFXLElBQUksVUFBVSxFQUFFO0FBQzNCLHVCQUFhO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFDQSxhQUFPLEtBQUssaUJBQWlCLFFBQVEsSUFBSTtBQUN6QyxhQUFPLEtBQUssd0JBQXdCLFFBQVEsV0FBVztBQUN2RCxhQUFPLEtBQUssd0JBQXdCLFFBQVEsT0FBTyxXQUFXO0FBQzlELGFBQU8sS0FBSyxrQkFBa0IsUUFBUSxPQUFPLFdBQVc7QUFDeEQsYUFBTyxLQUFLLHlCQUF5QixRQUFRLFlBQVk7QUFDekQsYUFBTyxLQUFLLG1CQUFtQixRQUFRLG1CQUFtQixzQkFBc0IsUUFBUTtBQUN4RixhQUFPLEtBQUssZ0JBQWdCLFFBQVEsS0FBSyxXQUFXO0FBQ3BELGFBQU8sS0FBSyxxQkFBcUIsUUFBUSxVQUFVLFlBQVk7QUFDL0QsYUFBTyxLQUFLLG1CQUFtQixRQUFRLE1BQU07QUFDN0MsYUFBTyxLQUFLLHVCQUF1QixRQUFRLFlBQVksWUFBWTtBQUNuRSxhQUFPLEtBQUssbUJBQW1CLFFBQVEsUUFBUSxXQUFXO0FBQzFELFVBQUksQ0FBQyxhQUFhLFNBQVMsS0FBSyxTQUFTLFFBQVEsTUFBTSxHQUFHO0FBQ3pELGFBQUssVUFBVSxRQUFRO0FBQ3ZCLHFCQUFhO0FBQUEsTUFDZDtBQUNBLFVBQUksQ0FBQyxZQUFZLEtBQUssZUFBZSxRQUFRLFlBQVksR0FBRztBQUMzRCxhQUFLLGdCQUFnQixRQUFRO0FBQzdCLHFCQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0QsQ0FBQztBQUNELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxTQUF3QjtBQUN2QixXQUFPO0FBQUEsTUFDTixJQUFJLEtBQUs7QUFBQSxNQUNULE1BQU0sS0FBSyxLQUFLLElBQUk7QUFBQSxNQUNwQixhQUFhLEtBQUssWUFBWSxJQUFJO0FBQUEsTUFDbEMsTUFBTSxLQUFLO0FBQUEsTUFDWCxhQUFhLEtBQUssWUFBWSxJQUFJO0FBQUEsTUFDbEMsT0FBTyxLQUFLLE1BQU0sSUFBSTtBQUFBLE1BQ3RCLGNBQWMsS0FBSyxhQUFhLElBQUk7QUFBQSxNQUNwQyxrQkFBa0IsS0FBSyxpQkFBaUIsSUFBSTtBQUFBLE1BQzVDLEtBQUssS0FBSyxJQUFJLElBQUk7QUFBQSxNQUNsQixVQUFVLEtBQUssU0FBUyxJQUFJO0FBQUEsTUFDNUIsUUFBUSx3QkFBd0IsS0FBSyxPQUFPO0FBQUEsTUFDNUMsUUFBUSxLQUFLLE9BQU8sSUFBSTtBQUFBLE1BQ3hCLFlBQVksS0FBSyxXQUFXLElBQUk7QUFBQSxNQUNoQyxRQUFRLEtBQUssT0FBTyxJQUFJO0FBQUEsTUFDeEIsY0FBYyxLQUFLO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQ0Q7QUFPQSxTQUFTLHFCQUFxQixPQUE4QztBQUMzRSxNQUFJLE9BQU8sVUFBVSxZQUFZLFVBQVUsTUFBTTtBQUNoRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sT0FBTztBQUNiLE1BQUksS0FBSyxZQUFZLGVBQWUsV0FBVztBQUM5QyxXQUFPLE9BQU8sS0FBSyxnQkFBZ0I7QUFBQSxFQUNwQztBQUNBLE1BQUksS0FBSyxZQUFZLGVBQWUsUUFBUTtBQUMzQyxXQUFPLGdCQUFnQixLQUFLLFNBQVM7QUFBQSxFQUN0QztBQUNBLFNBQU8sS0FBSyxZQUFZLGVBQWUsU0FBUyxLQUFLLFlBQVksZUFBZSxRQUFRLEtBQUssWUFBWSxlQUFlO0FBQ3pIO0FBRUEsU0FBUyx3QkFBd0IsUUFBbUU7QUFDbkcsTUFBSSxDQUFDLFFBQVE7QUFDWixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksT0FBTyxZQUFZLGVBQWUsV0FBVztBQUNoRCxXQUFPLEVBQUUsU0FBUyxlQUFlLFdBQVcsYUFBYSxPQUFPLFlBQVksTUFBTTtBQUFBLEVBQ25GO0FBQ0EsTUFBSSxPQUFPLFlBQVksZUFBZSxRQUFRO0FBQzdDLFdBQU8sRUFBRSxTQUFTLGVBQWUsUUFBUSxXQUFXLE9BQU8sVUFBVTtBQUFBLEVBQ3RFO0FBQ0EsU0FBTyxFQUFFLFNBQVMsT0FBTyxRQUFRO0FBQ2xDO0FBRUEsU0FBUyxxQkFBcUIsTUFBaUU7QUFDOUYsTUFBSSxDQUFDLE1BQU07QUFDVixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksS0FBSyxZQUFZLGVBQWUsV0FBVztBQUM5QyxXQUFPLEVBQUUsU0FBUyxlQUFlLFdBQVcsYUFBYSxJQUFJLG9CQUFvQixLQUFLLFdBQVcsRUFBRTtBQUFBLEVBQ3BHO0FBQ0EsTUFBSSxLQUFLLFlBQVksZUFBZSxRQUFRO0FBQzNDLFdBQU8sRUFBRSxTQUFTLGVBQWUsUUFBUSxXQUFXLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRTtBQUFBLEVBQ2hGO0FBQ0EsU0FBTyxFQUFFLFNBQVMsS0FBSyxRQUFRO0FBQ2hDO0FBRU8sTUFBTSxnQkFBcUM7QUFBQSxFQU9qRCxZQUNpQixNQUNoQixPQUNBLGFBQ0EsTUFDQztBQUplO0FBS2hCLFNBQUssT0FBTyxnQkFBZ0IsSUFBSTtBQUNoQyxTQUFLLFFBQVEsZ0JBQWdCLEtBQUs7QUFDbEMsU0FBSyxjQUFjLGdCQUFnQixlQUFlLFdBQVc7QUFDN0QsU0FBSyxPQUFPLGdCQUFnQixJQUFJO0FBQ2hDLFNBQUssU0FBUyxnQkFBZ0IsT0FBTyxTQUFTO0FBQUEsRUFDL0M7QUFBQSxFQUVBLElBQVcsWUFBcUI7QUFDL0IsV0FBTyxrQkFBa0IsSUFBSTtBQUFBLEVBQzlCO0FBQUEsRUFFQSxJQUFJLEtBQWE7QUFFaEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsU0FBd0I7QUFDdkIsV0FBTztBQUFBLE1BQ04sSUFBSSxLQUFLO0FBQUEsTUFDVCxNQUFNLEtBQUssS0FBSyxJQUFJO0FBQUEsTUFDcEIsYUFBYSxLQUFLLFlBQVksSUFBSTtBQUFBLE1BQ2xDLE1BQU0sS0FBSztBQUFBLElBQ1o7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxJQUFVO0FBQUEsQ0FBVixDQUFVQyxjQUFWO0FBQ0MsRUFBTUEsVUFBQSxNQUFNLElBQUksZ0JBQWdCLGFBQWEsS0FBSyxPQUFPLFNBQVMsbUJBQW1CLGtDQUFrQyxHQUFHLFFBQVEsUUFBUTtBQUMxSSxFQUFNQSxVQUFBLE9BQU8sSUFBSSxnQkFBZ0IsYUFBYSxNQUFNLFFBQVEsU0FBUyxvQkFBb0IsZ0NBQWdDLEdBQUcsUUFBUSxJQUFJO0FBQ3hJLEVBQU1BLFVBQUEsUUFBUSxJQUFJLGdCQUFnQixhQUFhLE9BQU8sU0FBUyxTQUFTLG9CQUFvQix3QkFBd0IsR0FBRyxRQUFRLEtBQUs7QUFBQSxHQUgzSDtBQU1WLFNBQVMsa0JBQWtCLE1BQTBCO0FBQzNELFNBQU8sS0FBSyxPQUFPLFNBQVMsSUFBSSxNQUMvQixLQUFLLE9BQU8sU0FBUyxLQUFLLE1BQzFCLEtBQUssT0FBTyxTQUFTLE1BQU07QUFDN0I7QUFNTyxTQUFTLHdCQUF3QixNQUF5QjtBQUNoRSxRQUFNLGNBQWMsS0FBSyxRQUFRO0FBQ2pDLE1BQUksZ0JBQWdCLGVBQWUsU0FBUyxnQkFBZ0IsZUFBZSxNQUFNO0FBQ2hGLFdBQU8sT0FBTyxLQUFLLEtBQUssS0FBSyxJQUFJLENBQUMsQ0FBQztBQUFBLEVBQ3BDO0FBQ0EsU0FBTyxLQUFLLEtBQUssSUFBSTtBQUN0QjtBQWVPLFNBQVMsYUFBYSxTQUEyQjtBQUN2RCxRQUFNLE9BQU8sUUFBUSxNQUFNLFlBQVksRUFBRSxRQUFRLGVBQWUsR0FBRyxFQUFFLFFBQVEsVUFBVSxFQUFFO0FBQ3pGLFNBQU8sR0FBRyxRQUFRLEtBQUssSUFBSSxJQUFJO0FBQ2hDO0FBc0NPLFNBQVMsNkJBQTZCLE9BQWlEO0FBQzdGLFNBQU8sTUFBTSxJQUFJLFVBQVE7QUFDeEIsVUFBTSxXQUFXLEtBQUssVUFBVSxJQUFJLEtBQUssQ0FBQztBQUMxQyxVQUFNLGFBQWEsS0FBSyxZQUFZLElBQUk7QUFDeEMsV0FBTztBQUFBLE1BQ04sSUFBSSxLQUFLO0FBQUEsTUFDVCxNQUFNLEtBQUssS0FBSyxJQUFJO0FBQUEsTUFDcEIsV0FBVyxLQUFLO0FBQUEsTUFDaEIsWUFBWTtBQUFBLFFBQ1gsZUFBZSxZQUFZLGlCQUFpQjtBQUFBLFFBQzVDLGdCQUFnQixZQUFZLGtCQUFrQjtBQUFBLE1BQy9DO0FBQUEsTUFDQSxVQUFVLFNBQVMsSUFBSSxRQUFNO0FBQUEsUUFDNUIsSUFBSSxhQUFhLENBQUM7QUFBQSxRQUNsQixPQUFPLEVBQUU7QUFBQSxRQUNULE9BQU8sRUFBRTtBQUFBLFFBQ1QsUUFBUSxFQUFFO0FBQUEsUUFDVixHQUFJLEVBQUUsU0FBUyxTQUFZLEVBQUUsTUFBTSxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsUUFDL0MsR0FBSSxFQUFFLG1CQUFtQixTQUFZLEVBQUUsZ0JBQWdCLEVBQUUsZUFBZSxJQUFJLENBQUM7QUFBQSxRQUM3RSxHQUFJLEVBQUUsVUFBVSxTQUFZLEVBQUUsT0FBTyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFDbkQsRUFBRTtBQUFBLElBQ0g7QUFBQSxFQUNELENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFsiSUNoYXRNb2RlSW5zdHJ1Y3Rpb25zIiwgIkNoYXRNb2RlIl0KfQo=
