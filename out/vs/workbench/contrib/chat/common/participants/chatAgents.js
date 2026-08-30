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
import { findLast } from "../../../../../base/common/arraysFind.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { revive } from "../../../../../base/common/marshalling.js";
import { equalsIgnoreCase } from "../../../../../base/common/strings.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { ChatContextKeys } from "../actions/chatContextKeys.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../constants.js";
import { ILanguageModelsService } from "../languageModels.js";
import { ChatPerfMark, markChat } from "../chatPerf.js";
const IChatAgentService = createDecorator("chatAgentService");
let ChatAgentService = class extends Disposable {
  constructor(contextKeyService, configurationService) {
    super();
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this._agents = /* @__PURE__ */ new Map();
    this._onDidChangeAgents = this._register(new Emitter());
    this.onDidChangeAgents = this._onDidChangeAgents.event;
    this._onWillInvokeAgent = this._register(new Emitter());
    this.onWillInvokeAgent = this._onWillInvokeAgent.event;
    this._agentsContextKeys = /* @__PURE__ */ new Set();
    this._hasToolsAgent = false;
    this._chatParticipantDetectionProviders = /* @__PURE__ */ new Map();
    this._agentCompletionProviders = /* @__PURE__ */ new Map();
    this._hasDefaultAgent = ChatContextKeys.enabled.bindTo(this.contextKeyService);
    this._extensionAgentRegistered = ChatContextKeys.extensionParticipantRegistered.bindTo(this.contextKeyService);
    this._defaultAgentRegistered = ChatContextKeys.panelParticipantRegistered.bindTo(this.contextKeyService);
    this._register(contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this._agentsContextKeys)) {
        this._updateContextKeys();
      }
    }));
  }
  registerAgent(id, data) {
    const existingAgent = this.getAgent(id);
    if (existingAgent) {
      throw new Error(`Agent already registered: ${JSON.stringify(id)}`);
    }
    const that = this;
    const commands = data.slashCommands;
    data = {
      ...data,
      get slashCommands() {
        return commands.filter((c) => !c.when || that.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(c.when)));
      }
    };
    const entry = { data };
    this._agents.set(id, entry);
    this._updateAgentsContextKeys();
    this._updateContextKeys();
    this._onDidChangeAgents.fire(void 0);
    return toDisposable(() => {
      this._agents.delete(id);
      this._updateAgentsContextKeys();
      this._updateContextKeys();
      this._onDidChangeAgents.fire(void 0);
    });
  }
  _updateAgentsContextKeys() {
    this._agentsContextKeys.clear();
    for (const agent of this._agents.values()) {
      if (agent.data.when) {
        const expr = ContextKeyExpr.deserialize(agent.data.when);
        for (const key of expr?.keys() || []) {
          this._agentsContextKeys.add(key);
        }
      }
    }
  }
  _updateContextKeys() {
    let extensionAgentRegistered = false;
    let defaultAgentRegistered = false;
    let toolsAgentRegistered = false;
    for (const agent of this.getAgents()) {
      if (agent.isDefault) {
        if (!agent.isCore) {
          extensionAgentRegistered = true;
        }
        if (agent.id === "chat.setup" || agent.id === "github.copilot.editsAgent") {
          toolsAgentRegistered = true;
        } else {
          defaultAgentRegistered = true;
        }
      }
    }
    this._defaultAgentRegistered.set(defaultAgentRegistered);
    this._extensionAgentRegistered.set(extensionAgentRegistered);
    if (toolsAgentRegistered !== this._hasToolsAgent) {
      this._hasToolsAgent = toolsAgentRegistered;
      this._onDidChangeAgents.fire(this.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Agent));
    }
  }
  registerAgentImplementation(id, agentImpl) {
    const entry = this._agents.get(id);
    if (!entry) {
      throw new Error(`Unknown agent: ${JSON.stringify(id)}`);
    }
    if (entry.impl) {
      throw new Error(`Agent already has implementation: ${JSON.stringify(id)}`);
    }
    if (entry.data.isDefault) {
      this._hasDefaultAgent.set(true);
    }
    entry.impl = agentImpl;
    this._onDidChangeAgents.fire(new MergedChatAgent(entry.data, agentImpl));
    return toDisposable(() => {
      entry.impl = void 0;
      this._onDidChangeAgents.fire(void 0);
      if (entry.data.isDefault) {
        this._hasDefaultAgent.set(Iterable.some(this._agents.values(), (agent) => agent.data.isDefault && !!agent.impl));
      }
    });
  }
  registerDynamicAgent(data, agentImpl) {
    data.isDynamic = true;
    const agent = { data, impl: agentImpl };
    this._agents.set(data.id, agent);
    this._onDidChangeAgents.fire(new MergedChatAgent(data, agentImpl));
    return toDisposable(() => {
      this._agents.delete(data.id);
      this._onDidChangeAgents.fire(void 0);
    });
  }
  registerAgentCompletionProvider(id, provider) {
    this._agentCompletionProviders.set(id, provider);
    return {
      dispose: () => {
        this._agentCompletionProviders.delete(id);
      }
    };
  }
  async getAgentCompletionItems(id, query, token) {
    return await this._agentCompletionProviders.get(id)?.(query, token) ?? [];
  }
  updateAgent(id, updateMetadata) {
    const agent = this._agents.get(id);
    if (!agent?.impl) {
      throw new Error(`No activated agent with id ${JSON.stringify(id)} registered`);
    }
    agent.data.metadata = { ...agent.data.metadata, ...updateMetadata };
    this._onDidChangeAgents.fire(new MergedChatAgent(agent.data, agent.impl));
  }
  getDefaultAgent(location, mode = ChatModeKind.Ask) {
    return this._preferExtensionAgent(this.getActivatedAgents().filter((a) => {
      if (mode && !a.modes.includes(mode)) {
        return false;
      }
      return !!a.isDefault && a.locations.includes(location);
    }));
  }
  get hasToolsAgent() {
    return !!this.configurationService.getValue(ChatConfiguration.AgentEnabled);
  }
  getContributedDefaultAgent(location) {
    return this._preferExtensionAgent(this.getAgents().filter((a) => !!a.isDefault && a.locations.includes(location)));
  }
  _preferExtensionAgent(agents) {
    return findLast(agents, (agent) => !agent.isCore) ?? agents.at(-1);
  }
  getAgent(id, includeDisabled = false) {
    if (!this._agentIsEnabled(id) && !includeDisabled) {
      return;
    }
    return this._agents.get(id)?.data;
  }
  _agentIsEnabled(idOrAgent) {
    const entry = typeof idOrAgent === "string" ? this._agents.get(idOrAgent) : idOrAgent;
    return !entry?.data.when || this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(entry.data.when));
  }
  getAgentByFullyQualifiedId(id) {
    const agent = Iterable.find(this._agents.values(), (a) => getFullyQualifiedId(a.data) === id)?.data;
    if (agent && !this._agentIsEnabled(agent.id)) {
      return;
    }
    return agent;
  }
  /**
   * Returns all agent datas that exist- static registered and dynamic ones.
   */
  getAgents() {
    return Array.from(this._agents.values()).map((entry) => entry.data).filter((a) => this._agentIsEnabled(a.id));
  }
  getActivatedAgents() {
    return Array.from(this._agents.values()).filter((a) => !!a.impl).filter((a) => this._agentIsEnabled(a.data.id)).map((a) => new MergedChatAgent(a.data, a.impl));
  }
  getAgentsByName(name) {
    return this._preferExtensionAgents(this.getAgents().filter((a) => a.name === name));
  }
  _preferExtensionAgents(agents) {
    const extensionAgents = agents.filter((a) => !a.isCore);
    return extensionAgents.length > 0 ? extensionAgents : agents;
  }
  agentHasDupeName(id) {
    const agent = this.getAgent(id);
    if (!agent) {
      return false;
    }
    return this.getAgentsByName(agent.name).filter((a) => a.extensionId.value !== agent.extensionId.value).length > 0;
  }
  async invokeAgent(id, request, progress, history, token) {
    markChat(request.sessionResource, ChatPerfMark.AgentWillInvoke);
    const data = this._agents.get(id);
    if (!data?.impl) {
      throw new Error(`No activated agent with id "${id}"`);
    }
    this._onWillInvokeAgent.fire({ agentId: id, request });
    const result = await data.impl.invoke(request, progress, history, token);
    markChat(request.sessionResource, ChatPerfMark.AgentDidInvoke);
    return result;
  }
  setRequestTools(id, requestId, tools) {
    const data = this._agents.get(id);
    if (!data?.impl) {
      return;
    }
    data.impl.setRequestTools?.(requestId, tools);
  }
  setYieldRequested(id, requestId, value) {
    const data = this._agents.get(id);
    if (!data?.impl) {
      return;
    }
    data.impl.setYieldRequested?.(requestId, value);
  }
  async getFollowups(id, request, result, history, token) {
    const data = this._agents.get(id);
    if (!data?.impl?.provideFollowups) {
      return [];
    }
    return data.impl.provideFollowups(request, result, history, token);
  }
  async getChatTitle(id, history, token) {
    const data = this._agents.get(id);
    if (!data?.impl?.provideChatTitle) {
      return void 0;
    }
    return data.impl.provideChatTitle(history, token);
  }
  async getChatSummary(id, history, token) {
    const data = this._agents.get(id);
    if (!data?.impl?.provideChatSummary) {
      return void 0;
    }
    return data.impl.provideChatSummary(history, token);
  }
  registerChatParticipantDetectionProvider(handle, provider) {
    this._chatParticipantDetectionProviders.set(handle, provider);
    return toDisposable(() => {
      this._chatParticipantDetectionProviders.delete(handle);
    });
  }
  hasChatParticipantDetectionProviders() {
    return this._chatParticipantDetectionProviders.size > 0;
  }
  async detectAgentOrCommand(request, history, options, token) {
    const provider = Iterable.first(this._chatParticipantDetectionProviders.values());
    if (!provider) {
      return;
    }
    const participants = this.getAgents().reduce((acc, a) => {
      if (a.locations.includes(options.location)) {
        acc.push({ participant: a.id, disambiguation: a.disambiguation ?? [] });
        for (const command2 of a.slashCommands) {
          acc.push({ participant: a.id, command: command2.name, disambiguation: command2.disambiguation ?? [] });
        }
      }
      return acc;
    }, []);
    const result = await provider.provideParticipantDetection(request, history, { ...options, participants }, token);
    if (!result) {
      return;
    }
    const agent = this.getAgent(result.participant);
    if (!agent) {
      return;
    }
    if (!result.command) {
      return { agent };
    }
    const command = agent?.slashCommands.find((c) => c.name === result.command);
    if (!command) {
      return;
    }
    return { agent, command };
  }
};
ChatAgentService.AGENT_LEADER = "@";
ChatAgentService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IConfigurationService)
], ChatAgentService);
class MergedChatAgent {
  constructor(data, impl) {
    this.data = data;
    this.impl = impl;
  }
  get id() {
    return this.data.id;
  }
  get name() {
    return this.data.name ?? "";
  }
  get fullName() {
    return this.data.fullName ?? "";
  }
  get description() {
    return this.data.description ?? "";
  }
  get extensionId() {
    return this.data.extensionId;
  }
  get extensionVersion() {
    return this.data.extensionVersion;
  }
  get extensionPublisherId() {
    return this.data.extensionPublisherId;
  }
  get extensionPublisherDisplayName() {
    return this.data.publisherDisplayName;
  }
  get extensionDisplayName() {
    return this.data.extensionDisplayName;
  }
  get isDefault() {
    return this.data.isDefault;
  }
  get isCore() {
    return this.data.isCore;
  }
  get metadata() {
    return this.data.metadata;
  }
  get slashCommands() {
    return this.data.slashCommands;
  }
  get locations() {
    return this.data.locations;
  }
  get modes() {
    return this.data.modes;
  }
  get disambiguation() {
    return this.data.disambiguation;
  }
  async invoke(request, progress, history, token) {
    return this.impl.invoke(request, progress, history, token);
  }
  setRequestTools(requestId, tools) {
    this.impl.setRequestTools?.(requestId, tools);
  }
  setYieldRequested(requestId, value) {
    this.impl.setYieldRequested?.(requestId, value);
  }
  async provideFollowups(request, result, history, token) {
    if (this.impl.provideFollowups) {
      return this.impl.provideFollowups(request, result, history, token);
    }
    return [];
  }
  toJSON() {
    return this.data;
  }
}
const IChatAgentNameService = createDecorator("chatAgentNameService");
let ChatAgentNameService = class {
  constructor(languageModelsService) {
    this.languageModelsService = languageModelsService;
  }
  /**
   * Returns true if the agent is allowed to use this name
   */
  getAgentNameRestriction(chatAgentData) {
    if (chatAgentData.isCore) {
      return true;
    }
    const nameAllowed = this.checkAgentNameRestriction(chatAgentData.name, chatAgentData).get();
    const fullNameAllowed = !chatAgentData.fullName || this.checkAgentNameRestriction(chatAgentData.fullName.replace(/\s/g, ""), chatAgentData).get();
    return nameAllowed && fullNameAllowed;
  }
  checkAgentNameRestriction(name, chatAgentData) {
    const allowList = this.languageModelsService.restrictedChatParticipants.map((registry) => registry[name.toLowerCase()]);
    return allowList.map((allowList2) => {
      if (!allowList2) {
        return true;
      }
      return allowList2.some((id) => equalsIgnoreCase(id, id.includes(".") ? chatAgentData.extensionId.value : chatAgentData.extensionPublisherId));
    });
  }
};
ChatAgentNameService = __decorateClass([
  __decorateParam(0, ILanguageModelsService)
], ChatAgentNameService);
function getFullyQualifiedId(chatAgentData) {
  return `${chatAgentData.extensionId.value}.${chatAgentData.id}`;
}
function isSerializableChatAgentData(obj) {
  return obj.name !== void 0;
}
function reviveSerializedAgent(raw) {
  const normalized = isSerializableChatAgentData(raw) ? raw : {
    ...raw,
    name: raw.id
  };
  if (!normalized.extensionPublisherId) {
    normalized.extensionPublisherId = raw.extensionPublisher ?? "";
  }
  if (!normalized.extensionDisplayName) {
    normalized.extensionDisplayName = "";
  }
  if (!normalized.extensionId) {
    normalized.extensionId = new ExtensionIdentifier("");
  }
  return revive(normalized);
}
export {
  ChatAgentNameService,
  ChatAgentService,
  IChatAgentNameService,
  IChatAgentService,
  MergedChatAgent,
  getFullyQualifiedId,
  reviveSerializedAgent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccGFydGljaXBhbnRzXFxjaGF0QWdlbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZmluZExhc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmV2aXZlLCBSZXZpdmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVxdWFsc0lnbm9yZUNhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudEVkaXRlZEZpbGVFdmVudCwgSUNoYXRQcm9ncmVzc0hpc3RvcnlSZXNwb25zZUNvbnRlbnQsIElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMsIElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSwgSVNlcmlhbGl6YWJsZUNoYXRBZ2VudERhdGEgfSBmcm9tICcuLi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RIb29rcyB9IGZyb20gJy4uL3Byb21wdFN5bnRheC9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IElSYXdDaGF0Q29tbWFuZENvbnRyaWJ1dGlvbiB9IGZyb20gJy4vY2hhdFBhcnRpY2lwYW50Q29udHJpYlR5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0Rm9sbG93dXAsIElDaGF0TG9jYXRpb25EYXRhLCBJQ2hhdFByb2dyZXNzLCBJQ2hhdFJlc3BvbnNlRXJyb3JEZXRhaWxzLCBJQ2hhdFRhc2tEdG8gfSBmcm9tICcuLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCwgQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdFBlcmZNYXJrLCBtYXJrQ2hhdCB9IGZyb20gJy4uL2NoYXRQZXJmLmpzJztcblxuLy8jcmVnaW9uIGFnZW50IHNlcnZpY2UsIGNvbW1hbmRzIGV0Y1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0QWdlbnRIaXN0b3J5RW50cnkge1xuXHRyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdDtcblx0cmVzcG9uc2U6IFJlYWRvbmx5QXJyYXk8SUNoYXRQcm9ncmVzc0hpc3RvcnlSZXNwb25zZUNvbnRlbnQgfCBJQ2hhdFRhc2tEdG8+O1xuXHRyZXN1bHQ6IElDaGF0QWdlbnRSZXN1bHQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRBZ2VudEF0dGFjaG1lbnRDYXBhYmlsaXRpZXMge1xuXHRzdXBwb3J0c0ZpbGVBdHRhY2htZW50cz86IGJvb2xlYW47XG5cdHN1cHBvcnRzVG9vbEF0dGFjaG1lbnRzPzogYm9vbGVhbjtcblx0c3VwcG9ydHNNQ1BBdHRhY2htZW50cz86IGJvb2xlYW47XG5cdHN1cHBvcnRzSW1hZ2VBdHRhY2htZW50cz86IGJvb2xlYW47XG5cdHN1cHBvcnRzU2VhcmNoUmVzdWx0QXR0YWNobWVudHM/OiBib29sZWFuO1xuXHRzdXBwb3J0c0luc3RydWN0aW9uQXR0YWNobWVudHM/OiBib29sZWFuO1xuXHRzdXBwb3J0c1NvdXJjZUNvbnRyb2xBdHRhY2htZW50cz86IGJvb2xlYW47XG5cdHN1cHBvcnRzUHJvYmxlbUF0dGFjaG1lbnRzPzogYm9vbGVhbjtcblx0c3VwcG9ydHNTeW1ib2xBdHRhY2htZW50cz86IGJvb2xlYW47XG5cdHN1cHBvcnRzVGVybWluYWxBdHRhY2htZW50cz86IGJvb2xlYW47XG5cdHN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHM/OiBib29sZWFuO1xuXHRzdXBwb3J0c0hhbmRPZmZzPzogYm9vbGVhbjtcblx0c3VwcG9ydHNDaGVja3BvaW50cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBUaGUgcHJlZml4IChlLmcuIGAhYCkgdGhhdCBtYXJrcyBhIG1lc3NhZ2UgaW4gdGhpc1xuXHQgKiBzZXNzaW9uIHR5cGUgYXMgYSB0ZXJtaW5hbCBjb21tYW5kIHJhdGhlciB0aGFuIGEgbWVzc2FnZSB0byB0aGUgYWdlbnQuXG5cdCAqIFVuZGVmaW5lZCB3aGVuIHRoZSBzZXNzaW9uIHR5cGUgaGFzIG5vIHRlcm1pbmFsIGNvbW1hbmQgc3VwcG9ydC5cblx0ICovXG5cdHRlcm1pbmFsQ29tbWFuZFByZWZpeD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEFnZW50RGF0YSB7XG5cdGlkOiBzdHJpbmc7XG5cdG5hbWU6IHN0cmluZztcblx0ZnVsbE5hbWU/OiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHQvKiogVGhpcyBpcyBzdHJpbmcsIG5vdCBDb250ZXh0S2V5RXhwcmVzc2lvbiwgYmVjYXVzZSBkZWFsaW5nIHdpdGggc2VyaWFsaXppbmcvZGVzZXJpYWxpemluZyBpcyBoYXJkIGFuZCBuZWVkIGEgYmV0dGVyIHBhdHRlcm4gZm9yIHRoaXMgKi9cblx0d2hlbj86IHN0cmluZztcblx0ZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cdGV4dGVuc2lvblZlcnNpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0ZXh0ZW5zaW9uUHVibGlzaGVySWQ6IHN0cmluZztcblx0LyoqIFRoaXMgaXMgdGhlIGV4dGVuc2lvbiBwdWJsaXNoZXIgaWQsIG9yLCBpbiB0aGUgY2FzZSBvZiBhIGR5bmFtaWNhbGx5IHJlZ2lzdGVyZWQgcGFydGljaXBhbnQgKHJlbW90ZSBhZ2VudCksIHdoYXRldmVyIHB1Ymxpc2hlciBuYW1lIHdlIGhhdmUgZm9yIGl0ICovXG5cdHB1Ymxpc2hlckRpc3BsYXlOYW1lPzogc3RyaW5nO1xuXHRleHRlbnNpb25EaXNwbGF5TmFtZTogc3RyaW5nO1xuXHQvKiogVGhlIGFnZW50IGludm9rZWQgd2hlbiBubyBhZ2VudCBpcyBzcGVjaWZpZWQgKi9cblx0aXNEZWZhdWx0PzogYm9vbGVhbjtcblx0LyoqIFRoaXMgYWdlbnQgaXMgbm90IGNvbnRyaWJ1dGVkIGluIHBhY2thZ2UuanNvbiwgYnV0IGlzIHJlZ2lzdGVyZWQgZHluYW1pY2FsbHkgKi9cblx0aXNEeW5hbWljPzogYm9vbGVhbjtcblx0LyoqIFRoaXMgYWdlbnQgaXMgY29udHJpYnV0ZWQgZnJvbSBjb3JlIGFuZCBub3QgZnJvbSBhbiBleHRlbnNpb24gKi9cblx0aXNDb3JlPzogYm9vbGVhbjtcblx0Y2FuQWNjZXNzUHJldmlvdXNDaGF0SGlzdG9yeT86IGJvb2xlYW47XG5cdG1ldGFkYXRhOiBJQ2hhdEFnZW50TWV0YWRhdGE7XG5cdHNsYXNoQ29tbWFuZHM6IElDaGF0QWdlbnRDb21tYW5kW107XG5cdGxvY2F0aW9uczogQ2hhdEFnZW50TG9jYXRpb25bXTtcblx0LyoqIFRoaXMgaXMgb25seSByZWxldmFudCBmb3IgaXNEZWZhdWx0IGFnZW50cy4gT3RoZXJzIHNob3VsZCBoYXZlIGFsbCBtb2RlcyBhdmFpbGFibGUuICovXG5cdG1vZGVzOiBDaGF0TW9kZUtpbmRbXTtcblx0ZGlzYW1iaWd1YXRpb246IHsgY2F0ZWdvcnk6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZzsgZXhhbXBsZXM6IHN0cmluZ1tdIH1bXTtcblx0Y2FwYWJpbGl0aWVzPzogSUNoYXRBZ2VudEF0dGFjaG1lbnRDYXBhYmlsaXRpZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRXZWxjb21lTWVzc2FnZUNvbnRlbnQge1xuXHRpY29uOiBUaGVtZUljb247XG5cdHRpdGxlOiBzdHJpbmc7XG5cdG1lc3NhZ2U6IElNYXJrZG93blN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24ge1xuXHRpbnZva2UocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIHByb2dyZXNzOiAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4gdm9pZCwgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0QWdlbnRSZXN1bHQ+O1xuXHRzZXRSZXF1ZXN0VG9vbHM/KHJlcXVlc3RJZDogc3RyaW5nLCB0b29sczogVXNlclNlbGVjdGVkVG9vbHMpOiB2b2lkO1xuXHRzZXRZaWVsZFJlcXVlc3RlZD8ocmVxdWVzdElkOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogdm9pZDtcblx0cHJvdmlkZUZvbGxvd3Vwcz8ocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCwgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0Rm9sbG93dXBbXT47XG5cdHByb3ZpZGVDaGF0VGl0bGU/OiAoaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJvdmlkZUNoYXRTdW1tYXJ5PzogKGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRQYXJ0aWNpcGFudERldGVjdGlvblJlc3VsdCB7XG5cdHBhcnRpY2lwYW50OiBzdHJpbmc7XG5cdGNvbW1hbmQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRQYXJ0aWNpcGFudE1ldGFkYXRhIHtcblx0cGFydGljaXBhbnQ6IHN0cmluZztcblx0Y29tbWFuZD86IHN0cmluZztcblx0ZGlzYW1iaWd1YXRpb246IHsgY2F0ZWdvcnk6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZzsgZXhhbXBsZXM6IHN0cmluZ1tdIH1bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIge1xuXHRwcm92aWRlUGFydGljaXBhbnREZXRlY3Rpb24ocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgb3B0aW9uczogeyBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb247IHBhcnRpY2lwYW50czogSUNoYXRQYXJ0aWNpcGFudE1ldGFkYXRhW10gfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUmVzdWx0IHwgbnVsbCB8IHVuZGVmaW5lZD47XG59XG5cbmV4cG9ydCB0eXBlIElDaGF0QWdlbnQgPSBJQ2hhdEFnZW50RGF0YSAmIElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbjtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEFnZW50Q29tbWFuZCBleHRlbmRzIElSYXdDaGF0Q29tbWFuZENvbnRyaWJ1dGlvbiB7XG5cdGZvbGxvd3VwUGxhY2Vob2xkZXI/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRBZ2VudE1ldGFkYXRhIHtcblx0aGVscFRleHRQcmVmaXg/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdGhlbHBUZXh0UG9zdGZpeD86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0aWNvbj86IFVSSTtcblx0aWNvbkRhcms/OiBVUkk7XG5cdHRoZW1lSWNvbj86IFRoZW1lSWNvbjtcblx0c2FtcGxlUmVxdWVzdD86IHN0cmluZztcblx0c3VwcG9ydElzc3VlUmVwb3J0aW5nPzogYm9vbGVhbjtcblx0Zm9sbG93dXBQbGFjZWhvbGRlcj86IHN0cmluZztcblx0aXNTdGlja3k/OiBib29sZWFuO1xuXHRhZGRpdGlvbmFsV2VsY29tZU1lc3NhZ2U/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIFVzZXJTZWxlY3RlZFRvb2xzID0gUmVjb3JkPHN0cmluZywgYm9vbGVhbj47XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEFnZW50UmVxdWVzdCB7XG5cdHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZXF1ZXN0SWQ6IHN0cmluZztcblx0YWdlbnRJZDogc3RyaW5nO1xuXHRjb21tYW5kPzogc3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdGF0dGVtcHQ/OiBudW1iZXI7XG5cdGVuYWJsZUNvbW1hbmREZXRlY3Rpb24/OiBib29sZWFuO1xuXHRpc1BhcnRpY2lwYW50RGV0ZWN0ZWQ/OiBib29sZWFuO1xuXHR2YXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YTtcblx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uO1xuXHRsb2NhdGlvbkRhdGE/OiBSZXZpdmVkPElDaGF0TG9jYXRpb25EYXRhPjtcblx0YWNjZXB0ZWRDb25maXJtYXRpb25EYXRhPzogdW5rbm93bltdO1xuXHRyZWplY3RlZENvbmZpcm1hdGlvbkRhdGE/OiB1bmtub3duW107XG5cdGFnZW50SG9zdFNlc3Npb25Db25maWc/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0dXNlclNlbGVjdGVkTW9kZWxJZD86IHN0cmluZztcblx0bW9kZWxDb25maWd1cmF0aW9uPzogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj47XG5cdHVzZXJTZWxlY3RlZFRvb2xzPzogVXNlclNlbGVjdGVkVG9vbHM7XG5cdG1vZGVJbnN0cnVjdGlvbnM/OiBJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zO1xuXHRlZGl0ZWRGaWxlRXZlbnRzPzogSUNoYXRBZ2VudEVkaXRlZEZpbGVFdmVudFtdO1xuXHQvKipcblx0ICogVGhlIHdvcmtpbmcgZGlyZWN0b3J5IFVSSSBmb3IgdGhlIHNlc3Npb24sIGlmIHNldC5cblx0ICogSW4gdGhlIGFnZW50cyB3aW5kb3csIGVhY2ggc2Vzc2lvbiBjYW4gaGF2ZSBpdHMgb3duIHdvcmtpbmcgZGlyZWN0b3J5XG5cdCAqIHRoYXQgZGlmZmVycyBmcm9tIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBmb2xkZXJzLlxuXHQgKi9cblx0d29ya2luZ0RpcmVjdG9yeT86IFVSSTtcblx0LyoqXG5cdCAqIENvbGxlY3RlZCBob29rcyBjb25maWd1cmF0aW9uIGZvciB0aGlzIHJlcXVlc3QuXG5cdCAqIENvbnRhaW5zIGFsbCBob29rcyBkZWZpbmVkIGluIGhvb2tzIC5qc29uIGZpbGVzLCBvcmdhbml6ZWQgYnkgaG9vayB0eXBlLlxuXHQgKi9cblx0aG9va3M/OiBDaGF0UmVxdWVzdEhvb2tzO1xuXHQvKipcblx0ICogV2hldGhlciBhbnkgaG9va3MgYXJlIGVuYWJsZWQgZm9yIHRoaXMgcmVxdWVzdC5cblx0ICovXG5cdGhhc0hvb2tzRW5hYmxlZD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgcmVxdWVzdCB3YXMgc3VibWl0dGVkIHRocm91Z2ggQWdlbnRzIFZvaWNlIE1vZGUuXG5cdCAqL1xuXHRpc1ZvaWNlTW9kZUlucHV0PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoZSBwZXJtaXNzaW9uIGxldmVsIGZvciB0b29sIGF1dG8tYXBwcm92YWwgaW4gdGhpcyByZXF1ZXN0LlxuXHQgKiAtIGAnYXV0b0FwcHJvdmUnYDogQXV0by1hcHByb3ZlIGFsbCB0b29sIGNhbGxzIGFuZCByZXRyeSBvbiBlcnJvcnMuXG5cdCAqIC0gYCdhdXRvcGlsb3QnYDogRXZlcnl0aGluZyBhdXRvQXBwcm92ZSBkb2VzIHBsdXMgY29udGludWVzIHVudGlsIHRoZSB0YXNrIGlzIGRvbmUuXG5cdCAqL1xuXHRwZXJtaXNzaW9uTGV2ZWw/OiBDaGF0UGVybWlzc2lvbkxldmVsO1xuXHQvKipcblx0ICogVW5pcXVlIElEIGZvciB0aGUgc3ViYWdlbnQgaW52b2NhdGlvbiwgdXNlZCB0byBncm91cCB0b29sIGNhbGxzIGZyb20gdGhlIHNhbWUgc3ViYWdlbnQgcnVuIHRvZ2V0aGVyLlxuXHQgKi9cblx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBEaXNwbGF5IG5hbWUgb2YgdGhlIHN1YmFnZW50IHRoYXQgaXMgaW52b2tpbmcgdGhpcyByZXF1ZXN0LlxuXHQgKi9cblx0c3ViQWdlbnROYW1lPzogc3RyaW5nO1xuXHQvKipcblx0ICogVGhlIHJlcXVlc3QgSUQgb2YgdGhlIHBhcmVudCByZXF1ZXN0IHRoYXQgaW52b2tlZCB0aGlzIHN1YmFnZW50LlxuXHQgKi9cblx0cGFyZW50UmVxdWVzdElkPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHRydWUsIHRoaXMgcmVxdWVzdCB3YXMgaW5pdGlhdGVkIGJ5IHRoZSBzeXN0ZW0gcmF0aGVyIHRoYW4gdGhlIHVzZXIuXG5cdCAqL1xuXHRpc1N5c3RlbUluaXRpYXRlZD86IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRoZSByZXF1ZXN0IGFuZCByZXNwb25zZSBzaG91bGQgYmUgaGlkZGVuIGZyb20gdGhlIHRyYW5zY3JpcHQuICovXG5cdGhpZGVGcm9tVHJhbnNjcmlwdD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRRdWVzdGlvbiB7XG5cdHJlYWRvbmx5IHByb21wdDogc3RyaW5nO1xuXHRyZWFkb25seSBwYXJ0aWNpcGFudD86IHN0cmluZztcblx0cmVhZG9ubHkgY29tbWFuZD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEFnZW50UmVzdWx0VGltaW5ncyB7XG5cdGZpcnN0UHJvZ3Jlc3M/OiBudW1iZXI7XG5cdHRvdGFsRWxhcHNlZDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0QWdlbnRSZXN1bHQge1xuXHRlcnJvckRldGFpbHM/OiBJQ2hhdFJlc3BvbnNlRXJyb3JEZXRhaWxzO1xuXHR0aW1pbmdzPzogSUNoYXRBZ2VudFJlc3VsdFRpbWluZ3M7XG5cdC8qKiBFeHRyYSBwcm9wZXJ0aWVzIHRoYXQgdGhlIGFnZW50IGNhbiB1c2UgdG8gaWRlbnRpZnkgYSByZXN1bHQgKi9cblx0cmVhZG9ubHkgbWV0YWRhdGE/OiB7IHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd24gfTtcblx0cmVhZG9ubHkgZGV0YWlscz86IHN0cmluZztcblx0bmV4dFF1ZXN0aW9uPzogSUNoYXRRdWVzdGlvbjtcbn1cblxuZXhwb3J0IGNvbnN0IElDaGF0QWdlbnRTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDaGF0QWdlbnRTZXJ2aWNlPignY2hhdEFnZW50U2VydmljZScpO1xuXG5pbnRlcmZhY2UgSUNoYXRBZ2VudEVudHJ5IHtcblx0ZGF0YTogSUNoYXRBZ2VudERhdGE7XG5cdGltcGw/OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRBZ2VudENvbXBsZXRpb25JdGVtIHtcblx0aWQ6IHN0cmluZztcblx0bmFtZT86IHN0cmluZztcblx0ZnVsbE5hbWU/OiBzdHJpbmc7XG5cdGljb24/OiBUaGVtZUljb247XG5cdHZhbHVlOiB1bmtub3duO1xuXHRjb21tYW5kPzogQ29tbWFuZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEFnZW50SW52b2NhdGlvbkV2ZW50IHtcblx0cmVhZG9ubHkgYWdlbnRJZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXF1ZXN0OiBSZWFkb25seTxJQ2hhdEFnZW50UmVxdWVzdD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRBZ2VudFNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiB1bmRlZmluZWQgd2hlbiBhbiBhZ2VudCB3YXMgcmVtb3ZlZFxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBZ2VudHM6IEV2ZW50PElDaGF0QWdlbnQgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBvbldpbGxJbnZva2VBZ2VudDogRXZlbnQ8SUNoYXRBZ2VudEludm9jYXRpb25FdmVudD47XG5cdHJlYWRvbmx5IGhhc1Rvb2xzQWdlbnQ6IGJvb2xlYW47XG5cdHJlZ2lzdGVyQWdlbnQoaWQ6IHN0cmluZywgZGF0YTogSUNoYXRBZ2VudERhdGEpOiBJRGlzcG9zYWJsZTtcblx0cmVnaXN0ZXJBZ2VudEltcGxlbWVudGF0aW9uKGlkOiBzdHJpbmcsIGFnZW50OiBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24pOiBJRGlzcG9zYWJsZTtcblx0cmVnaXN0ZXJEeW5hbWljQWdlbnQoZGF0YTogSUNoYXRBZ2VudERhdGEsIGFnZW50SW1wbDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uKTogSURpc3Bvc2FibGU7XG5cdHJlZ2lzdGVyQWdlbnRDb21wbGV0aW9uUHJvdmlkZXIoaWQ6IHN0cmluZywgcHJvdmlkZXI6IChxdWVyeTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8SUNoYXRBZ2VudENvbXBsZXRpb25JdGVtW10+KTogSURpc3Bvc2FibGU7XG5cdGdldEFnZW50Q29tcGxldGlvbkl0ZW1zKGlkOiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRBZ2VudENvbXBsZXRpb25JdGVtW10+O1xuXHRyZWdpc3RlckNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBwcm92aWRlcjogSUNoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVyKTogSURpc3Bvc2FibGU7XG5cdGRldGVjdEFnZW50T3JDb21tYW5kKHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBoaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5W10sIG9wdGlvbnM6IHsgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uIH0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBhZ2VudDogSUNoYXRBZ2VudERhdGE7IGNvbW1hbmQ/OiBJQ2hhdEFnZW50Q29tbWFuZCB9IHwgdW5kZWZpbmVkPjtcblx0aGFzQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXJzKCk6IGJvb2xlYW47XG5cdGludm9rZUFnZW50KGFnZW50OiBzdHJpbmcsIHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBwcm9ncmVzczogKHBhcnRzOiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0Pjtcblx0c2V0UmVxdWVzdFRvb2xzKGFnZW50OiBzdHJpbmcsIHJlcXVlc3RJZDogc3RyaW5nLCB0b29sczogVXNlclNlbGVjdGVkVG9vbHMpOiB2b2lkO1xuXHRzZXRZaWVsZFJlcXVlc3RlZChhZ2VudDogc3RyaW5nLCByZXF1ZXN0SWQ6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiB2b2lkO1xuXHRnZXRGb2xsb3d1cHMoaWQ6IHN0cmluZywgcmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCwgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0Rm9sbG93dXBbXT47XG5cdGdldENoYXRUaXRsZShpZDogc3RyaW5nLCBoaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5W10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0Z2V0Q2hhdFN1bW1hcnkoaWQ6IHN0cmluZywgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdGdldEFnZW50KGlkOiBzdHJpbmcsIGluY2x1ZGVEaXNhYmxlZD86IGJvb2xlYW4pOiBJQ2hhdEFnZW50RGF0YSB8IHVuZGVmaW5lZDtcblx0Z2V0QWdlbnRCeUZ1bGx5UXVhbGlmaWVkSWQoaWQ6IHN0cmluZyk6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkO1xuXHRnZXRBZ2VudHMoKTogSUNoYXRBZ2VudERhdGFbXTtcblx0Z2V0QWN0aXZhdGVkQWdlbnRzKCk6IEFycmF5PElDaGF0QWdlbnQ+O1xuXHRnZXRBZ2VudHNCeU5hbWUobmFtZTogc3RyaW5nKTogSUNoYXRBZ2VudERhdGFbXTtcblx0YWdlbnRIYXNEdXBlTmFtZShpZDogc3RyaW5nKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogR2V0IHRoZSBkZWZhdWx0IGFnZW50IChvbmx5IGlmIGFjdGl2YXRlZClcblx0ICovXG5cdGdldERlZmF1bHRBZ2VudChsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIG1vZGU/OiBDaGF0TW9kZUtpbmQpOiBJQ2hhdEFnZW50IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGRlZmF1bHQgYWdlbnQgZGF0YSB0aGF0IGhhcyBiZWVuIGNvbnRyaWJ1dGVkIChtYXkgbm90IGJlIGFjdGl2YXRlZCB5ZXQpXG5cdCAqL1xuXHRnZXRDb250cmlidXRlZERlZmF1bHRBZ2VudChsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24pOiBJQ2hhdEFnZW50RGF0YSB8IHVuZGVmaW5lZDtcblx0dXBkYXRlQWdlbnQoaWQ6IHN0cmluZywgdXBkYXRlTWV0YWRhdGE6IElDaGF0QWdlbnRNZXRhZGF0YSk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0QWdlbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0QWdlbnRTZXJ2aWNlIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEFHRU5UX0xFQURFUiA9ICdAJztcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9hZ2VudHMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRBZ2VudEVudHJ5PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWdlbnRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRBZ2VudCB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWdlbnRzOiBFdmVudDxJQ2hhdEFnZW50IHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQWdlbnRzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxJbnZva2VBZ2VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0QWdlbnRJbnZvY2F0aW9uRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxJbnZva2VBZ2VudDogRXZlbnQ8SUNoYXRBZ2VudEludm9jYXRpb25FdmVudD4gPSB0aGlzLl9vbldpbGxJbnZva2VBZ2VudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hZ2VudHNDb250ZXh0S2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNEZWZhdWx0QWdlbnQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25BZ2VudFJlZ2lzdGVyZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0QWdlbnRSZWdpc3RlcmVkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfaGFzVG9vbHNBZ2VudCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2NoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVycyA9IG5ldyBNYXA8bnVtYmVyLCBJQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faGFzRGVmYXVsdEFnZW50ID0gQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2V4dGVuc2lvbkFnZW50UmVnaXN0ZXJlZCA9IENoYXRDb250ZXh0S2V5cy5leHRlbnNpb25QYXJ0aWNpcGFudFJlZ2lzdGVyZWQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2RlZmF1bHRBZ2VudFJlZ2lzdGVyZWQgPSBDaGF0Q29udGV4dEtleXMucGFuZWxQYXJ0aWNpcGFudFJlZ2lzdGVyZWQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCgoZSkgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUodGhpcy5fYWdlbnRzQ29udGV4dEtleXMpKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUNvbnRleHRLZXlzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cmVnaXN0ZXJBZ2VudChpZDogc3RyaW5nLCBkYXRhOiBJQ2hhdEFnZW50RGF0YSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBleGlzdGluZ0FnZW50ID0gdGhpcy5nZXRBZ2VudChpZCk7XG5cdFx0aWYgKGV4aXN0aW5nQWdlbnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQWdlbnQgYWxyZWFkeSByZWdpc3RlcmVkOiAke0pTT04uc3RyaW5naWZ5KGlkKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBjb21tYW5kcyA9IGRhdGEuc2xhc2hDb21tYW5kcztcblx0XHRkYXRhID0ge1xuXHRcdFx0Li4uZGF0YSxcblx0XHRcdGdldCBzbGFzaENvbW1hbmRzKCkge1xuXHRcdFx0XHRyZXR1cm4gY29tbWFuZHMuZmlsdGVyKGMgPT4gIWMud2hlbiB8fCB0aGF0LmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUoYy53aGVuKSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgZW50cnkgPSB7IGRhdGEgfTtcblx0XHR0aGlzLl9hZ2VudHMuc2V0KGlkLCBlbnRyeSk7XG5cdFx0dGhpcy5fdXBkYXRlQWdlbnRzQ29udGV4dEtleXMoKTtcblx0XHR0aGlzLl91cGRhdGVDb250ZXh0S2V5cygpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWdlbnRzLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYWdlbnRzLmRlbGV0ZShpZCk7XG5cdFx0XHR0aGlzLl91cGRhdGVBZ2VudHNDb250ZXh0S2V5cygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29udGV4dEtleXMoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWdlbnRzLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFnZW50c0NvbnRleHRLZXlzKCk6IHZvaWQge1xuXHRcdC8vIFVwZGF0ZSB0aGUgc2V0IG9mIGNvbnRleHQga2V5cyB1c2VkIGJ5IGFsbCBhZ2VudHNcblx0XHR0aGlzLl9hZ2VudHNDb250ZXh0S2V5cy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgYWdlbnQgb2YgdGhpcy5fYWdlbnRzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoYWdlbnQuZGF0YS53aGVuKSB7XG5cdFx0XHRcdGNvbnN0IGV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShhZ2VudC5kYXRhLndoZW4pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBleHByPy5rZXlzKCkgfHwgW10pIHtcblx0XHRcdFx0XHR0aGlzLl9hZ2VudHNDb250ZXh0S2V5cy5hZGQoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbnRleHRLZXlzKCk6IHZvaWQge1xuXHRcdGxldCBleHRlbnNpb25BZ2VudFJlZ2lzdGVyZWQgPSBmYWxzZTtcblx0XHRsZXQgZGVmYXVsdEFnZW50UmVnaXN0ZXJlZCA9IGZhbHNlO1xuXHRcdGxldCB0b29sc0FnZW50UmVnaXN0ZXJlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgYWdlbnQgb2YgdGhpcy5nZXRBZ2VudHMoKSkge1xuXHRcdFx0aWYgKGFnZW50LmlzRGVmYXVsdCkge1xuXHRcdFx0XHRpZiAoIWFnZW50LmlzQ29yZSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbkFnZW50UmVnaXN0ZXJlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFnZW50LmlkID09PSAnY2hhdC5zZXR1cCcgfHwgYWdlbnQuaWQgPT09ICdnaXRodWIuY29waWxvdC5lZGl0c0FnZW50Jykge1xuXHRcdFx0XHRcdC8vIFRPRE9Acm9ibG91cmVucyBmaXJpbmcgdGhlIGV2ZW50IGJlbG93IHByb2JhYmx5IGlzbid0IG5lY2Vzc2FyeSBidXQgbGVhdmUgaXQgYWxvbmUgZm9yIG5vd1xuXHRcdFx0XHRcdHRvb2xzQWdlbnRSZWdpc3RlcmVkID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZWZhdWx0QWdlbnRSZWdpc3RlcmVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9kZWZhdWx0QWdlbnRSZWdpc3RlcmVkLnNldChkZWZhdWx0QWdlbnRSZWdpc3RlcmVkKTtcblx0XHR0aGlzLl9leHRlbnNpb25BZ2VudFJlZ2lzdGVyZWQuc2V0KGV4dGVuc2lvbkFnZW50UmVnaXN0ZXJlZCk7XG5cdFx0aWYgKHRvb2xzQWdlbnRSZWdpc3RlcmVkICE9PSB0aGlzLl9oYXNUb29sc0FnZW50KSB7XG5cdFx0XHR0aGlzLl9oYXNUb29sc0FnZW50ID0gdG9vbHNBZ2VudFJlZ2lzdGVyZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFnZW50cy5maXJlKHRoaXMuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENoYXRNb2RlS2luZC5BZ2VudCkpO1xuXHRcdH1cblx0fVxuXG5cdHJlZ2lzdGVyQWdlbnRJbXBsZW1lbnRhdGlvbihpZDogc3RyaW5nLCBhZ2VudEltcGw6IElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2FnZW50cy5nZXQoaWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBhZ2VudDogJHtKU09OLnN0cmluZ2lmeShpZCl9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKGVudHJ5LmltcGwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQWdlbnQgYWxyZWFkeSBoYXMgaW1wbGVtZW50YXRpb246ICR7SlNPTi5zdHJpbmdpZnkoaWQpfWApO1xuXHRcdH1cblxuXHRcdGlmIChlbnRyeS5kYXRhLmlzRGVmYXVsdCkge1xuXHRcdFx0dGhpcy5faGFzRGVmYXVsdEFnZW50LnNldCh0cnVlKTtcblx0XHR9XG5cblx0XHRlbnRyeS5pbXBsID0gYWdlbnRJbXBsO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWdlbnRzLmZpcmUobmV3IE1lcmdlZENoYXRBZ2VudChlbnRyeS5kYXRhLCBhZ2VudEltcGwpKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZW50cnkuaW1wbCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWdlbnRzLmZpcmUodW5kZWZpbmVkKTtcblxuXHRcdFx0aWYgKGVudHJ5LmRhdGEuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHRoaXMuX2hhc0RlZmF1bHRBZ2VudC5zZXQoSXRlcmFibGUuc29tZSh0aGlzLl9hZ2VudHMudmFsdWVzKCksIGFnZW50ID0+IGFnZW50LmRhdGEuaXNEZWZhdWx0ICYmICEhYWdlbnQuaW1wbCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cmVnaXN0ZXJEeW5hbWljQWdlbnQoZGF0YTogSUNoYXRBZ2VudERhdGEsIGFnZW50SW1wbDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uKTogSURpc3Bvc2FibGUge1xuXHRcdGRhdGEuaXNEeW5hbWljID0gdHJ1ZTtcblx0XHRjb25zdCBhZ2VudCA9IHsgZGF0YSwgaW1wbDogYWdlbnRJbXBsIH07XG5cdFx0dGhpcy5fYWdlbnRzLnNldChkYXRhLmlkLCBhZ2VudCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBZ2VudHMuZmlyZShuZXcgTWVyZ2VkQ2hhdEFnZW50KGRhdGEsIGFnZW50SW1wbCkpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hZ2VudHMuZGVsZXRlKGRhdGEuaWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBZ2VudHMuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWdlbnRDb21wbGV0aW9uUHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIChxdWVyeTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8SUNoYXRBZ2VudENvbXBsZXRpb25JdGVtW10+PigpO1xuXG5cdHJlZ2lzdGVyQWdlbnRDb21wbGV0aW9uUHJvdmlkZXIoaWQ6IHN0cmluZywgcHJvdmlkZXI6IChxdWVyeTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8SUNoYXRBZ2VudENvbXBsZXRpb25JdGVtW10+KSB7XG5cdFx0dGhpcy5fYWdlbnRDb21wbGV0aW9uUHJvdmlkZXJzLnNldChpZCwgcHJvdmlkZXIpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IHRoaXMuX2FnZW50Q29tcGxldGlvblByb3ZpZGVycy5kZWxldGUoaWQpOyB9XG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGdldEFnZW50Q29tcGxldGlvbkl0ZW1zKGlkOiBzdHJpbmcsIHF1ZXJ5OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdHJldHVybiBhd2FpdCB0aGlzLl9hZ2VudENvbXBsZXRpb25Qcm92aWRlcnMuZ2V0KGlkKT8uKHF1ZXJ5LCB0b2tlbikgPz8gW107XG5cdH1cblxuXHR1cGRhdGVBZ2VudChpZDogc3RyaW5nLCB1cGRhdGVNZXRhZGF0YTogSUNoYXRBZ2VudE1ldGFkYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9hZ2VudHMuZ2V0KGlkKTtcblx0XHRpZiAoIWFnZW50Py5pbXBsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGFjdGl2YXRlZCBhZ2VudCB3aXRoIGlkICR7SlNPTi5zdHJpbmdpZnkoaWQpfSByZWdpc3RlcmVkYCk7XG5cdFx0fVxuXHRcdGFnZW50LmRhdGEubWV0YWRhdGEgPSB7IC4uLmFnZW50LmRhdGEubWV0YWRhdGEsIC4uLnVwZGF0ZU1ldGFkYXRhIH07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBZ2VudHMuZmlyZShuZXcgTWVyZ2VkQ2hhdEFnZW50KGFnZW50LmRhdGEsIGFnZW50LmltcGwpKTtcblx0fVxuXG5cdGdldERlZmF1bHRBZ2VudChsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIG1vZGU6IENoYXRNb2RlS2luZCA9IENoYXRNb2RlS2luZC5Bc2spOiBJQ2hhdEFnZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJlZmVyRXh0ZW5zaW9uQWdlbnQodGhpcy5nZXRBY3RpdmF0ZWRBZ2VudHMoKS5maWx0ZXIoYSA9PiB7XG5cdFx0XHRpZiAobW9kZSAmJiAhYS5tb2Rlcy5pbmNsdWRlcyhtb2RlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAhIWEuaXNEZWZhdWx0ICYmIGEubG9jYXRpb25zLmluY2x1ZGVzKGxvY2F0aW9uKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGhhc1Rvb2xzQWdlbnQoKTogYm9vbGVhbiB7XG5cdFx0Ly8gVGhlIGNoYXQgcGFydGljaXBhbnQgZW5hYmxlbWVudCBpcyBqdXN0IGJhc2VkIG9uIHRoaXMgc2V0dGluZy4gRG9uJ3Qgd2FpdCBmb3IgdGhlIGV4dGVuc2lvbiB0byBiZSBsb2FkZWQuXG5cdFx0cmV0dXJuICEhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQpO1xuXHR9XG5cblx0Z2V0Q29udHJpYnV0ZWREZWZhdWx0QWdlbnQobG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uKTogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wcmVmZXJFeHRlbnNpb25BZ2VudCh0aGlzLmdldEFnZW50cygpLmZpbHRlcihhID0+ICEhYS5pc0RlZmF1bHQgJiYgYS5sb2NhdGlvbnMuaW5jbHVkZXMobG9jYXRpb24pKSk7XG5cdH1cblxuXHRwcml2YXRlIF9wcmVmZXJFeHRlbnNpb25BZ2VudDxUIGV4dGVuZHMgSUNoYXRBZ2VudERhdGE+KGFnZW50czogVFtdKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gV2UgcG90ZW50aWFsbHkgaGF2ZSBtdWx0aXBsZSBhZ2VudHMgb24gdGhlIHNhbWUgbG9jYXRpb24sXG5cdFx0Ly8gY29udHJpYnV0ZWQgZnJvbSBjb3JlIGFuZCBmcm9tIGV4dGVuc2lvbnMuXG5cdFx0Ly8gVGhpcyBtZXRob2Qgd2lsbCBwcmVmZXIgdGhlIGxhc3QgZXh0ZW5zaW9ucyBwcm92aWRlZCBhZ2VudFxuXHRcdC8vIGZhbGxpbmcgYmFjayB0byB0aGUgbGFzdCBjb3JlIGFnZW50IGlmIG5vIGV4dGVuc2lvbiBhZ2VudCBpcyBmb3VuZC5cblx0XHRyZXR1cm4gZmluZExhc3QoYWdlbnRzLCBhZ2VudCA9PiAhYWdlbnQuaXNDb3JlKSA/PyBhZ2VudHMuYXQoLTEpO1xuXHR9XG5cblx0Z2V0QWdlbnQoaWQ6IHN0cmluZywgaW5jbHVkZURpc2FibGVkID0gZmFsc2UpOiBJQ2hhdEFnZW50RGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9hZ2VudElzRW5hYmxlZChpZCkgJiYgIWluY2x1ZGVEaXNhYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9hZ2VudHMuZ2V0KGlkKT8uZGF0YTtcblx0fVxuXG5cdHByaXZhdGUgX2FnZW50SXNFbmFibGVkKGlkT3JBZ2VudDogc3RyaW5nIHwgSUNoYXRBZ2VudEVudHJ5KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0eXBlb2YgaWRPckFnZW50ID09PSAnc3RyaW5nJyA/IHRoaXMuX2FnZW50cy5nZXQoaWRPckFnZW50KSA6IGlkT3JBZ2VudDtcblx0XHRyZXR1cm4gIWVudHJ5Py5kYXRhLndoZW4gfHwgdGhpcy5jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGVudHJ5LmRhdGEud2hlbikpO1xuXHR9XG5cblx0Z2V0QWdlbnRCeUZ1bGx5UXVhbGlmaWVkSWQoaWQ6IHN0cmluZyk6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhZ2VudCA9IEl0ZXJhYmxlLmZpbmQodGhpcy5fYWdlbnRzLnZhbHVlcygpLCBhID0+IGdldEZ1bGx5UXVhbGlmaWVkSWQoYS5kYXRhKSA9PT0gaWQpPy5kYXRhO1xuXHRcdGlmIChhZ2VudCAmJiAhdGhpcy5fYWdlbnRJc0VuYWJsZWQoYWdlbnQuaWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFnZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIGFnZW50IGRhdGFzIHRoYXQgZXhpc3QtIHN0YXRpYyByZWdpc3RlcmVkIGFuZCBkeW5hbWljIG9uZXMuXG5cdCAqL1xuXHRnZXRBZ2VudHMoKTogSUNoYXRBZ2VudERhdGFbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fYWdlbnRzLnZhbHVlcygpKVxuXHRcdFx0Lm1hcChlbnRyeSA9PiBlbnRyeS5kYXRhKVxuXHRcdFx0LmZpbHRlcihhID0+IHRoaXMuX2FnZW50SXNFbmFibGVkKGEuaWQpKTtcblx0fVxuXG5cdGdldEFjdGl2YXRlZEFnZW50cygpOiBJQ2hhdEFnZW50W10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2FnZW50cy52YWx1ZXMoKSlcblx0XHRcdC5maWx0ZXIoYSA9PiAhIWEuaW1wbClcblx0XHRcdC5maWx0ZXIoYSA9PiB0aGlzLl9hZ2VudElzRW5hYmxlZChhLmRhdGEuaWQpKVxuXHRcdFx0Lm1hcChhID0+IG5ldyBNZXJnZWRDaGF0QWdlbnQoYS5kYXRhLCBhLmltcGwhKSk7XG5cdH1cblxuXHRnZXRBZ2VudHNCeU5hbWUobmFtZTogc3RyaW5nKTogSUNoYXRBZ2VudERhdGFbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZWZlckV4dGVuc2lvbkFnZW50cyh0aGlzLmdldEFnZW50cygpLmZpbHRlcihhID0+IGEubmFtZSA9PT0gbmFtZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJlZmVyRXh0ZW5zaW9uQWdlbnRzPFQgZXh0ZW5kcyBJQ2hhdEFnZW50RGF0YT4oYWdlbnRzOiBUW10pOiBUW10ge1xuXHRcdC8vIFdlIHBvdGVudGlhbGx5IGhhdmUgbXVsdGlwbGUgYWdlbnRzIG9uIHRoZSBzYW1lIGxvY2F0aW9uLFxuXHRcdC8vIGNvbnRyaWJ1dGVkIGZyb20gY29yZSBhbmQgZnJvbSBleHRlbnNpb25zLlxuXHRcdC8vIFRoaXMgbWV0aG9kIHdpbGwgcHJlZmVyIHRoZSBleHRlbnNpb25zIHByb3ZpZGVkIGFnZW50c1xuXHRcdC8vIGZhbGxpbmcgYmFjayB0byB0aGUgb3JpZ2luYWwgYWdlbnRzIGFycmF5IGV4dGVuc2lvbiBhZ2VudCBpcyBmb3VuZC5cblx0XHRjb25zdCBleHRlbnNpb25BZ2VudHMgPSBhZ2VudHMuZmlsdGVyKGEgPT4gIWEuaXNDb3JlKTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uQWdlbnRzLmxlbmd0aCA+IDAgPyBleHRlbnNpb25BZ2VudHMgOiBhZ2VudHM7XG5cdH1cblxuXHRhZ2VudEhhc0R1cGVOYW1lKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuZ2V0QWdlbnQoaWQpO1xuXHRcdGlmICghYWdlbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRBZ2VudHNCeU5hbWUoYWdlbnQubmFtZSlcblx0XHRcdC5maWx0ZXIoYSA9PiBhLmV4dGVuc2lvbklkLnZhbHVlICE9PSBhZ2VudC5leHRlbnNpb25JZC52YWx1ZSkubGVuZ3RoID4gMDtcblx0fVxuXG5cdGFzeW5jIGludm9rZUFnZW50KGlkOiBzdHJpbmcsIHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBwcm9ncmVzczogKHBhcnRzOiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0PiB7XG5cdFx0bWFya0NoYXQocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsIENoYXRQZXJmTWFyay5BZ2VudFdpbGxJbnZva2UpO1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9hZ2VudHMuZ2V0KGlkKTtcblx0XHRpZiAoIWRhdGE/LmltcGwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gYWN0aXZhdGVkIGFnZW50IHdpdGggaWQgXCIke2lkfVwiYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25XaWxsSW52b2tlQWdlbnQuZmlyZSh7IGFnZW50SWQ6IGlkLCByZXF1ZXN0IH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRhdGEuaW1wbC5pbnZva2UocmVxdWVzdCwgcHJvZ3Jlc3MsIGhpc3RvcnksIHRva2VuKTtcblx0XHRtYXJrQ2hhdChyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSwgQ2hhdFBlcmZNYXJrLkFnZW50RGlkSW52b2tlKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0c2V0UmVxdWVzdFRvb2xzKGlkOiBzdHJpbmcsIHJlcXVlc3RJZDogc3RyaW5nLCB0b29sczogVXNlclNlbGVjdGVkVG9vbHMpOiB2b2lkIHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fYWdlbnRzLmdldChpZCk7XG5cdFx0aWYgKCFkYXRhPy5pbXBsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZGF0YS5pbXBsLnNldFJlcXVlc3RUb29scz8uKHJlcXVlc3RJZCwgdG9vbHMpO1xuXHR9XG5cblx0c2V0WWllbGRSZXF1ZXN0ZWQoaWQ6IHN0cmluZywgcmVxdWVzdElkOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2FnZW50cy5nZXQoaWQpO1xuXHRcdGlmICghZGF0YT8uaW1wbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGRhdGEuaW1wbC5zZXRZaWVsZFJlcXVlc3RlZD8uKHJlcXVlc3RJZCwgdmFsdWUpO1xuXHR9XG5cblx0YXN5bmMgZ2V0Rm9sbG93dXBzKGlkOiBzdHJpbmcsIHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCByZXN1bHQ6IElDaGF0QWdlbnRSZXN1bHQsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdEZvbGxvd3VwW10+IHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fYWdlbnRzLmdldChpZCk7XG5cdFx0aWYgKCFkYXRhPy5pbXBsPy5wcm92aWRlRm9sbG93dXBzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRhdGEuaW1wbC5wcm92aWRlRm9sbG93dXBzKHJlcXVlc3QsIHJlc3VsdCwgaGlzdG9yeSwgdG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hhdFRpdGxlKGlkOiBzdHJpbmcsIGhpc3Rvcnk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fYWdlbnRzLmdldChpZCk7XG5cdFx0aWYgKCFkYXRhPy5pbXBsPy5wcm92aWRlQ2hhdFRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBkYXRhLmltcGwucHJvdmlkZUNoYXRUaXRsZShoaXN0b3J5LCB0b2tlbik7XG5cdH1cblxuXHRhc3luYyBnZXRDaGF0U3VtbWFyeShpZDogc3RyaW5nLCBoaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5W10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2FnZW50cy5nZXQoaWQpO1xuXHRcdGlmICghZGF0YT8uaW1wbD8ucHJvdmlkZUNoYXRTdW1tYXJ5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBkYXRhLmltcGwucHJvdmlkZUNoYXRTdW1tYXJ5KGhpc3RvcnksIHRva2VuKTtcblx0fVxuXG5cdHJlZ2lzdGVyQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHByb3ZpZGVyOiBJQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXIpIHtcblx0XHR0aGlzLl9jaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcnMuc2V0KGhhbmRsZSwgcHJvdmlkZXIpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXJzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0aGFzQ2hhdFBhcnRpY2lwYW50RGV0ZWN0aW9uUHJvdmlkZXJzKCkge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0UGFydGljaXBhbnREZXRlY3Rpb25Qcm92aWRlcnMuc2l6ZSA+IDA7XG5cdH1cblxuXHRhc3luYyBkZXRlY3RBZ2VudE9yQ29tbWFuZChyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCwgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCBvcHRpb25zOiB7IGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbiB9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgYWdlbnQ6IElDaGF0QWdlbnREYXRhOyBjb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFRPRE9Aam95Y2VlcmhsIHNob3VsZCB3ZSBoYXZlIGEgc2VsZWN0b3IgdG8gYmUgYWJsZSB0byBuYXJyb3cgZG93biB3aGljaCBwcm92aWRlciB0byB1c2Vcblx0XHRjb25zdCBwcm92aWRlciA9IEl0ZXJhYmxlLmZpcnN0KHRoaXMuX2NoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVycy52YWx1ZXMoKSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnRpY2lwYW50cyA9IHRoaXMuZ2V0QWdlbnRzKCkucmVkdWNlPElDaGF0UGFydGljaXBhbnRNZXRhZGF0YVtdPigoYWNjLCBhKSA9PiB7XG5cdFx0XHRpZiAoYS5sb2NhdGlvbnMuaW5jbHVkZXMob3B0aW9ucy5sb2NhdGlvbikpIHtcblx0XHRcdFx0YWNjLnB1c2goeyBwYXJ0aWNpcGFudDogYS5pZCwgZGlzYW1iaWd1YXRpb246IGEuZGlzYW1iaWd1YXRpb24gPz8gW10gfSk7XG5cdFx0XHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBhLnNsYXNoQ29tbWFuZHMpIHtcblx0XHRcdFx0XHRhY2MucHVzaCh7IHBhcnRpY2lwYW50OiBhLmlkLCBjb21tYW5kOiBjb21tYW5kLm5hbWUsIGRpc2FtYmlndWF0aW9uOiBjb21tYW5kLmRpc2FtYmlndWF0aW9uID8/IFtdIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYWNjO1xuXHRcdH0sIFtdKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVQYXJ0aWNpcGFudERldGVjdGlvbihyZXF1ZXN0LCBoaXN0b3J5LCB7IC4uLm9wdGlvbnMsIHBhcnRpY2lwYW50cyB9LCB0b2tlbik7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuZ2V0QWdlbnQocmVzdWx0LnBhcnRpY2lwYW50KTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHQvLyBDb3VsZG4ndCBmaW5kIGEgcGFydGljaXBhbnQgbWF0Y2hpbmcgdGhlIHBhcnRpY2lwYW50IGRldGVjdGlvbiByZXN1bHRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXJlc3VsdC5jb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4geyBhZ2VudCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmQgPSBhZ2VudD8uc2xhc2hDb21tYW5kcy5maW5kKGMgPT4gYy5uYW1lID09PSByZXN1bHQuY29tbWFuZCk7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHQvLyBDb3VsZG4ndCBmaW5kIGEgc2xhc2ggY29tbWFuZCBtYXRjaGluZyB0aGUgcGFydGljaXBhbnQgZGV0ZWN0aW9uIHJlc3VsdFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGFnZW50LCBjb21tYW5kIH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1lcmdlZENoYXRBZ2VudCBpbXBsZW1lbnRzIElDaGF0QWdlbnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRhdGE6IElDaGF0QWdlbnREYXRhLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW1wbDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uXG5cdCkgeyB9XG5cdHdoZW4/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1Ymxpc2hlckRpc3BsYXlOYW1lPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRpc0R5bmFtaWM/OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBpZCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5kYXRhLmlkOyB9XG5cdGdldCBuYW1lKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLmRhdGEubmFtZSA/PyAnJzsgfVxuXHRnZXQgZnVsbE5hbWUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuZGF0YS5mdWxsTmFtZSA/PyAnJzsgfVxuXHRnZXQgZGVzY3JpcHRpb24oKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuZGF0YS5kZXNjcmlwdGlvbiA/PyAnJzsgfVxuXHRnZXQgZXh0ZW5zaW9uSWQoKTogRXh0ZW5zaW9uSWRlbnRpZmllciB7IHJldHVybiB0aGlzLmRhdGEuZXh0ZW5zaW9uSWQ7IH1cblx0Z2V0IGV4dGVuc2lvblZlcnNpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuZGF0YS5leHRlbnNpb25WZXJzaW9uOyB9XG5cdGdldCBleHRlbnNpb25QdWJsaXNoZXJJZCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5kYXRhLmV4dGVuc2lvblB1Ymxpc2hlcklkOyB9XG5cdGdldCBleHRlbnNpb25QdWJsaXNoZXJEaXNwbGF5TmFtZSgpIHsgcmV0dXJuIHRoaXMuZGF0YS5wdWJsaXNoZXJEaXNwbGF5TmFtZTsgfVxuXHRnZXQgZXh0ZW5zaW9uRGlzcGxheU5hbWUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuZGF0YS5leHRlbnNpb25EaXNwbGF5TmFtZTsgfVxuXHRnZXQgaXNEZWZhdWx0KCk6IGJvb2xlYW4gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5kYXRhLmlzRGVmYXVsdDsgfVxuXHRnZXQgaXNDb3JlKCk6IGJvb2xlYW4gfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5kYXRhLmlzQ29yZTsgfVxuXHRnZXQgbWV0YWRhdGEoKTogSUNoYXRBZ2VudE1ldGFkYXRhIHsgcmV0dXJuIHRoaXMuZGF0YS5tZXRhZGF0YTsgfVxuXHRnZXQgc2xhc2hDb21tYW5kcygpOiBJQ2hhdEFnZW50Q29tbWFuZFtdIHsgcmV0dXJuIHRoaXMuZGF0YS5zbGFzaENvbW1hbmRzOyB9XG5cdGdldCBsb2NhdGlvbnMoKTogQ2hhdEFnZW50TG9jYXRpb25bXSB7IHJldHVybiB0aGlzLmRhdGEubG9jYXRpb25zOyB9XG5cdGdldCBtb2RlcygpOiBDaGF0TW9kZUtpbmRbXSB7IHJldHVybiB0aGlzLmRhdGEubW9kZXM7IH1cblx0Z2V0IGRpc2FtYmlndWF0aW9uKCk6IHsgY2F0ZWdvcnk6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZzsgZXhhbXBsZXM6IHN0cmluZ1tdIH1bXSB7IHJldHVybiB0aGlzLmRhdGEuZGlzYW1iaWd1YXRpb247IH1cblxuXHRhc3luYyBpbnZva2UocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIHByb2dyZXNzOiAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4gdm9pZCwgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0QWdlbnRSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5pbXBsLmludm9rZShyZXF1ZXN0LCBwcm9ncmVzcywgaGlzdG9yeSwgdG9rZW4pO1xuXHR9XG5cblx0c2V0UmVxdWVzdFRvb2xzKHJlcXVlc3RJZDogc3RyaW5nLCB0b29sczogVXNlclNlbGVjdGVkVG9vbHMpOiB2b2lkIHtcblx0XHR0aGlzLmltcGwuc2V0UmVxdWVzdFRvb2xzPy4ocmVxdWVzdElkLCB0b29scyk7XG5cdH1cblxuXHRzZXRZaWVsZFJlcXVlc3RlZChyZXF1ZXN0SWQ6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmltcGwuc2V0WWllbGRSZXF1ZXN0ZWQ/LihyZXF1ZXN0SWQsIHZhbHVlKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVGb2xsb3d1cHMocmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCwgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0Rm9sbG93dXBbXT4ge1xuXHRcdGlmICh0aGlzLmltcGwucHJvdmlkZUZvbGxvd3Vwcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW1wbC5wcm92aWRlRm9sbG93dXBzKHJlcXVlc3QsIHJlc3VsdCwgaGlzdG9yeSwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHRvSlNPTigpOiBJQ2hhdEFnZW50RGF0YSB7XG5cdFx0cmV0dXJuIHRoaXMuZGF0YTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgSUNoYXRBZ2VudE5hbWVTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElDaGF0QWdlbnROYW1lU2VydmljZT4oJ2NoYXRBZ2VudE5hbWVTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRBZ2VudE5hbWVTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRnZXRBZ2VudE5hbWVSZXN0cmljdGlvbihjaGF0QWdlbnREYXRhOiBJQ2hhdEFnZW50RGF0YSk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0QWdlbnROYW1lU2VydmljZSBpbXBsZW1lbnRzIElDaGF0QWdlbnROYW1lU2VydmljZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgYWdlbnQgaXMgYWxsb3dlZCB0byB1c2UgdGhpcyBuYW1lXG5cdCAqL1xuXHRnZXRBZ2VudE5hbWVSZXN0cmljdGlvbihjaGF0QWdlbnREYXRhOiBJQ2hhdEFnZW50RGF0YSk6IGJvb2xlYW4ge1xuXHRcdGlmIChjaGF0QWdlbnREYXRhLmlzQ29yZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIGNvcmUgYWdlbnRzIGFyZSBhbHdheXMgYWxsb3dlZCB0byB1c2UgYW55IG5hbWVcblx0XHR9XG5cblx0XHQvLyBUT0RPIHdvdWxkIGxpa2UgdG8gdXNlIG9ic2VydmFibGVzIGhlcmUgYnV0IG5vdGhpbmcgdXNlcyBpdCBkb3duc3RyZWFtIGFuZCBJJ20gbm90IHN1cmUgaG93IHRvIGNvbWJpbmUgdGhlc2UgdHdvXG5cdFx0Y29uc3QgbmFtZUFsbG93ZWQgPSB0aGlzLmNoZWNrQWdlbnROYW1lUmVzdHJpY3Rpb24oY2hhdEFnZW50RGF0YS5uYW1lLCBjaGF0QWdlbnREYXRhKS5nZXQoKTtcblx0XHRjb25zdCBmdWxsTmFtZUFsbG93ZWQgPSAhY2hhdEFnZW50RGF0YS5mdWxsTmFtZSB8fCB0aGlzLmNoZWNrQWdlbnROYW1lUmVzdHJpY3Rpb24oY2hhdEFnZW50RGF0YS5mdWxsTmFtZS5yZXBsYWNlKC9cXHMvZywgJycpLCBjaGF0QWdlbnREYXRhKS5nZXQoKTtcblx0XHRyZXR1cm4gbmFtZUFsbG93ZWQgJiYgZnVsbE5hbWVBbGxvd2VkO1xuXHR9XG5cblx0cHJpdmF0ZSBjaGVja0FnZW50TmFtZVJlc3RyaWN0aW9uKG5hbWU6IHN0cmluZywgY2hhdEFnZW50RGF0YTogSUNoYXRBZ2VudERhdGEpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdFx0Ly8gUmVnaXN0cnkgaXMgYSBtYXAgb2YgbmFtZSB0byBhbiBhcnJheSBvZiBleHRlbnNpb24gcHVibGlzaGVyIElEcyBvciBleHRlbnNpb24gSURzIHRoYXQgYXJlIGFsbG93ZWQgdG8gdXNlIGl0LlxuXHRcdC8vIExvb2sgdXAgdGhlIGxpc3Qgb2YgZXh0ZW5zaW9ucyB0aGF0IGFyZSBhbGxvd2VkIHRvIHVzZSB0aGlzIG5hbWVcblx0XHRjb25zdCBhbGxvd0xpc3QgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5yZXN0cmljdGVkQ2hhdFBhcnRpY2lwYW50cy5tYXA8c3RyaW5nW10gfCB1bmRlZmluZWQ+KHJlZ2lzdHJ5ID0+IHJlZ2lzdHJ5W25hbWUudG9Mb3dlckNhc2UoKV0pO1xuXHRcdHJldHVybiBhbGxvd0xpc3QubWFwKGFsbG93TGlzdCA9PiB7XG5cdFx0XHRpZiAoIWFsbG93TGlzdCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGFsbG93TGlzdC5zb21lKGlkID0+IGVxdWFsc0lnbm9yZUNhc2UoaWQsIGlkLmluY2x1ZGVzKCcuJykgPyBjaGF0QWdlbnREYXRhLmV4dGVuc2lvbklkLnZhbHVlIDogY2hhdEFnZW50RGF0YS5leHRlbnNpb25QdWJsaXNoZXJJZCkpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGdWxseVF1YWxpZmllZElkKGNoYXRBZ2VudERhdGE6IElDaGF0QWdlbnREYXRhKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke2NoYXRBZ2VudERhdGEuZXh0ZW5zaW9uSWQudmFsdWV9LiR7Y2hhdEFnZW50RGF0YS5pZH1gO1xufVxuXG4vKipcbiAqIFRoZXJlIHdhcyBhIHBlcmlvZCB3aGVyZSBzZXJpYWxpemVkIGNoYXQgYWdlbnQgZGF0YSB1c2VkICdpZCcgaW5zdGVhZCBvZiAnbmFtZScuXG4gKiBEb24ndCBjb3B5IHRoaXMgcGF0dGVybiwgc2VyaWFsaXplZCBkYXRhIGdvaW5nIGZvcndhcmQgc2hvdWxkIGJlIHZlcnNpb25lZCB3aXRoIHN0cmljdCBpbnRlcmZhY2VzLlxuICovXG5pbnRlcmZhY2UgSU9sZFNlcmlhbGl6ZWRDaGF0QWdlbnREYXRhIGV4dGVuZHMgT21pdDxJU2VyaWFsaXphYmxlQ2hhdEFnZW50RGF0YSwgJ25hbWUnPiB7XG5cdGlkOiBzdHJpbmc7XG5cdGV4dGVuc2lvblB1Ymxpc2hlcj86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gaXNTZXJpYWxpemFibGVDaGF0QWdlbnREYXRhKG9iajogSVNlcmlhbGl6YWJsZUNoYXRBZ2VudERhdGEgfCBJT2xkU2VyaWFsaXplZENoYXRBZ2VudERhdGEpOiBvYmogaXMgSVNlcmlhbGl6YWJsZUNoYXRBZ2VudERhdGEge1xuXHRyZXR1cm4gKG9iaiBhcyBJU2VyaWFsaXphYmxlQ2hhdEFnZW50RGF0YSkubmFtZSAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmV2aXZlU2VyaWFsaXplZEFnZW50KHJhdzogSVNlcmlhbGl6YWJsZUNoYXRBZ2VudERhdGEgfCBJT2xkU2VyaWFsaXplZENoYXRBZ2VudERhdGEpOiBJQ2hhdEFnZW50RGF0YSB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQ6IElTZXJpYWxpemFibGVDaGF0QWdlbnREYXRhID0gaXNTZXJpYWxpemFibGVDaGF0QWdlbnREYXRhKHJhdykgP1xuXHRcdHJhdyA6XG5cdFx0e1xuXHRcdFx0Li4ucmF3LFxuXHRcdFx0bmFtZTogcmF3LmlkLFxuXHRcdH07XG5cblx0Ly8gRmlsbCBpbiByZXF1aXJlZCBmaWVsZHMgdGhhdCBtYXkgYmUgbWlzc2luZyBmcm9tIG9sZCBkYXRhXG5cdGlmICghbm9ybWFsaXplZC5leHRlbnNpb25QdWJsaXNoZXJJZCkge1xuXHRcdG5vcm1hbGl6ZWQuZXh0ZW5zaW9uUHVibGlzaGVySWQgPSAocmF3IGFzIElPbGRTZXJpYWxpemVkQ2hhdEFnZW50RGF0YSkuZXh0ZW5zaW9uUHVibGlzaGVyID8/ICcnO1xuXHR9XG5cblx0aWYgKCFub3JtYWxpemVkLmV4dGVuc2lvbkRpc3BsYXlOYW1lKSB7XG5cdFx0bm9ybWFsaXplZC5leHRlbnNpb25EaXNwbGF5TmFtZSA9ICcnO1xuXHR9XG5cblx0aWYgKCFub3JtYWxpemVkLmV4dGVuc2lvbklkKSB7XG5cdFx0bm9ybWFsaXplZC5leHRlbnNpb25JZCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCcnKTtcblx0fVxuXG5cdHJldHVybiByZXZpdmUobm9ybWFsaXplZCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxjQUF1QjtBQUVoQyxTQUFTLHdCQUF3QjtBQUlqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFLaEMsU0FBUyxtQkFBbUIsbUJBQW1CLG9CQUF5QztBQUN4RixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGNBQWMsZ0JBQWdCO0FBdU1oQyxNQUFNLG9CQUFvQixnQkFBbUMsa0JBQWtCO0FBOEQvRSxJQUFNLG1CQUFOLGNBQStCLFdBQXdDO0FBQUEsRUFxQjdFLFlBQ3NDLG1CQUNHLHNCQUN2QztBQUNELFVBQU07QUFIK0I7QUFDRztBQWpCekMsU0FBUSxVQUFVLG9CQUFJLElBQTZCO0FBRW5ELFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxRQUFnQyxDQUFDO0FBQzFGLFNBQVMsb0JBQW1ELEtBQUssbUJBQW1CO0FBQ3BGLFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxRQUFtQyxDQUFDO0FBQzdGLFNBQVMsb0JBQXNELEtBQUssbUJBQW1CO0FBRXZGLFNBQWlCLHFCQUFxQixvQkFBSSxJQUFZO0FBSXRELFNBQVEsaUJBQWlCO0FBRXpCLFNBQVEscUNBQXFDLG9CQUFJLElBQStDO0FBMEhoRyxTQUFRLDRCQUE0QixvQkFBSSxJQUE4RjtBQW5IckksU0FBSyxtQkFBbUIsZ0JBQWdCLFFBQVEsT0FBTyxLQUFLLGlCQUFpQjtBQUM3RSxTQUFLLDRCQUE0QixnQkFBZ0IsK0JBQStCLE9BQU8sS0FBSyxpQkFBaUI7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
