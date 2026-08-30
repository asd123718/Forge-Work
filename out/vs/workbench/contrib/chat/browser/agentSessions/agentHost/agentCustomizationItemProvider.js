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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { extUriBiasedIgnorePathCase } from "../../../../../../base/common/resources.js";
import { getCustomizationDisabledReason, isCustomizationEnabled } from "../../../../../../platform/agentHost/common/customizationEnablement.js";
import { CustomizationLoadStatus, CustomizationType } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../../../../services/agentHost/common/agentHostFileSystemService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { toAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { readAgentCustomizationMeta } from "../../../../../../platform/agentHost/common/meta/agentCustomizationMeta.js";
import { AICustomizationSources } from "../../../common/aiCustomizationWorkspaceService.js";
import { PromptsType, Target } from "../../../common/promptSyntax/promptTypes.js";
import { AgentCustomizationContentExpander } from "./agentCustomizationContentExpander.js";
import { IAgentHostCustomizationService } from "./agentHostCustomizationService.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
import { localize } from "../../../../../../nls.js";
import { getAgentHostPluginEnablementActions } from "../../agentPluginActions.js";
const REMOTE_HOST_GROUP = "remote-host";
const REMOTE_CLIENT_GROUP = "remote-client";
let AgentCustomizationItemProvider = class extends Disposable {
  constructor(_connectionAuthority, _getItemActions, _resolveSyncedOrigin, _fileService, _logService, _customAgentsService) {
    super();
    this._connectionAuthority = _connectionAuthority;
    this._getItemActions = _getItemActions;
    this._resolveSyncedOrigin = _resolveSyncedOrigin;
    this._fileService = _fileService;
    this._logService = _logService;
    this._customAgentsService = _customAgentsService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    /** Cache: pluginUri → last expansion (keyed by nonce and label so we re-fetch on content or display-name changes). */
    this._expansionCache = new ResourceMap();
    this._contentExpander = new AgentCustomizationContentExpander(this._fileService, this._logService);
    this._register(this._customAgentsService.onDidChangeCustomizations(() => {
      this._onDidChange.fire();
    }));
  }
  setDraftCustomAgents(customAgents) {
    this._draftCustomAgents = customAgents;
    this._register(autorun((reader) => {
      customAgents.read(reader);
      this._onDidChange.fire();
    }));
  }
  setDraftCustomizations(customizations) {
    this._draftCustomizations = customizations;
    this._register(autorun((reader) => {
      customizations.read(reader);
      this._onDidChange.fire();
    }));
  }
  toRemoteUri(customizationUri) {
    const original = URI.parse(customizationUri);
    if (original.scheme === SYNCED_CUSTOMIZATION_SCHEME) {
      return original;
    }
    return toAgentHostUri(original, this._connectionAuthority);
  }
  toBadge(customization, fromClient) {
    if (fromClient) {
      return {
        groupKey: REMOTE_CLIENT_GROUP
      };
    }
    return {
      groupKey: REMOTE_HOST_GROUP
    };
  }
  toItem(sessionResource, customization, source) {
    const clientId = customization.clientId;
    const badge = this.toBadge(customization, clientId !== void 0);
    const uri = this.toRemoteUri(customization.uri);
    return {
      itemKey: customizationItemKey(customization, clientId),
      uri,
      type: "plugin",
      name: customization.name,
      description: void 0,
      source,
      status: toStatusString(customization.load),
      statusMessage: toStatusMessage(customization.load),
      enabled: isCustomizationEnabled(customization),
      disabledReason: getCustomizationDisabledReason(customization),
      badge: badge.badge,
      badgeTooltip: badge.badgeTooltip,
      groupKey: badge.groupKey,
      extensionId: void 0,
      pluginUri: uri,
      userInvocable: void 0,
      actions: [
        ...clientId === void 0 ? getAgentHostPluginEnablementActions(this._customAgentsService, void 0, sessionResource, customization, this._customAgentsService.getWorkingDirectories(sessionResource).length > 0) : [],
        ...this._getItemActions?.(customization, clientId) ?? []
      ]
    };
  }
  toDirectoryItems(customization, source, isRemote) {
    const items = [];
    for (const child of customization.children ?? []) {
      const item = this.toDirectoryChildItem(child, source, isRemote);
      if (item) {
        items.push(item);
      }
    }
    return items;
  }
  toDirectoryChildItem(child, source, isRemote) {
    const type = toPromptsType(child.type);
    if (!type) {
      return void 0;
    }
    let userInvocable = void 0;
    if (child.type === CustomizationType.Agent) {
      userInvocable = readAgentCustomizationMeta(child).userInvocable !== false;
    }
    let groupKey = isRemote ? REMOTE_CLIENT_GROUP : void 0;
    let badge = void 0;
    let badgeTooltip = void 0;
    if (!groupKey && child.type === CustomizationType.Rule) {
      const pattern = child.globs?.[0];
      if (child.globs && child.globs.length > 0) {
        groupKey = "context-instructions";
        badge = pattern === "**" ? localize("alwaysAdded", "always added") : pattern;
        badgeTooltip = pattern === "**" ? localize("alwaysIncluded", "This instruction is automatically included in every interaction.") : localize("contextInstructions", "This instruction is automatically included when files matching '{0}' are in context.", pattern);
      } else if (child.alwaysApply) {
        groupKey = "agent-instructions";
      } else {
        groupKey = "on-demand-instructions";
      }
    }
    return {
      itemKey: child.id,
      uri: this.toRemoteUri(child.uri),
      type,
      name: child.name,
      description: getChildDescription(child),
      source,
      groupKey,
      badge,
      badgeTooltip,
      extensionId: void 0,
      pluginUri: void 0,
      userInvocable
    };
  }
  async provideSourceFolders(sessionResource, type, _token) {
    const workingDirectories = this._customAgentsService.getWorkingDirectories(sessionResource);
    const folders = [];
    for (const customization of this._customAgentsService.getCustomizations(sessionResource)) {
      if (!isDirectoryCustomization(customization) || !customization.writable) {
        continue;
      }
      if (toPromptsType(customization.contents) !== type) {
        continue;
      }
      const source = isUnderAnyRoot(workingDirectories, customization.uri) ? AICustomizationSources.local : AICustomizationSources.user;
      folders.push({
        uri: this.toRemoteUri(customization.uri),
        label: customization.name,
        source
      });
    }
    return folders;
  }
  async provideCustomAgents(sessionResource) {
    const agents = this.getCustomAgents(sessionResource);
    const sessionTypes = [getChatSessionType(sessionResource)];
    return agents.map((agent) => ({
      id: agent.uri,
      uri: this.toRemoteUri(agent.uri),
      name: agent.name,
      description: agent.description,
      sessionTypes,
      enabled: true,
      // fill default/empty values for all other properties they will not be used by the UI
      // when making a request, all that's needed is the agent id.
      source: { storage: PromptsStorage.local },
      tools: void 0,
      agents: void 0,
      argumentHint: void 0,
      handOffs: void 0,
      hooks: void 0,
      model: void 0,
      agentInstructions: { content: "", toolReferences: [] },
      visibility: {
        agentInvocable: true,
        userInvocable: readAgentCustomizationMeta(agent).userInvocable !== false
      },
      target: Target.Undefined
    }));
  }
  async provideChatSessionCustomizations(sessionResource, token) {
    const items = /* @__PURE__ */ new Map();
    const workingDirectories = this._customAgentsService.getWorkingDirectories(sessionResource);
    for (const agent of this.getCustomAgents(sessionResource)) {
      const source = isUnderAnyRoot(workingDirectories, agent.uri) ? AICustomizationSources.local : AICustomizationSources.user;
      items.set(agent.id, {
        itemKey: agent.id,
        uri: this.toRemoteUri(agent.uri),
        type: PromptsType.agent,
        name: agent.name,
        description: agent.description,
        source,
        extensionId: void 0,
        pluginUri: void 0,
        enabled: agent.enabled !== false,
        userInvocable: readAgentCustomizationMeta(agent).userInvocable !== false
      });
    }
    const plugins = [];
    const expandPromises = [];
    const customizations = this.getCustomizations(sessionResource);
    const directoryCustomizations = [];
    for (const sessionCustomization of customizations) {
      if (isDirectoryCustomization(sessionCustomization)) {
        directoryCustomizations.push(sessionCustomization);
      } else if (sessionCustomization.type === CustomizationType.McpServer) {
        continue;
      } else {
        const isBundleItem = isSyntheticBundle(sessionCustomization);
        const isClientSynced = sessionCustomization.clientId !== void 0;
        const childGroupKey = isClientSynced ? REMOTE_CLIENT_GROUP : REMOTE_HOST_GROUP;
        let item;
        if (!isBundleItem) {
          item = this.toItem(sessionResource, sessionCustomization, AICustomizationSources.plugin);
          items.set(customizationItemKey(sessionCustomization, sessionCustomization.clientId), item);
        } else {
          item = { uri: this.toRemoteUri(sessionCustomization.uri), type: "plugin", source: AICustomizationSources.plugin, name: "", groupKey: childGroupKey, extensionId: void 0, pluginUri: void 0 };
        }
        const pluginMeta = {
          item,
          nonce: sessionCustomization.nonce,
          status: toStatusString(sessionCustomization.load),
          statusMessage: toStatusMessage(sessionCustomization.load),
          enabled: isCustomizationEnabled(sessionCustomization),
          disabledReason: getCustomizationDisabledReason(sessionCustomization),
          childGroupKey,
          isBundleItem,
          pluginLabel: isBundleItem ? void 0 : item.name
        };
        plugins.push(pluginMeta);
        expandPromises.push(this._expandPluginContents(pluginMeta, token));
      }
    }
    const expansions = await Promise.all(expandPromises);
    if (token.isCancellationRequested) {
      return [];
    }
    for (let i = 0; i < plugins.length; i++) {
      const p = plugins[i];
      for (const child of expansions[i]) {
        const enriched = p.isBundleItem ? this._applySyncedOrigin(child) : child;
        items.set(enriched.uri.toString(), {
          ...enriched,
          status: p.status,
          statusMessage: p.statusMessage,
          enabled: p.enabled,
          disabledReason: p.disabledReason
        });
      }
    }
    for (const sessionCustomization of directoryCustomizations) {
      const source = isUnderAnyRoot(workingDirectories, sessionCustomization.uri) ? AICustomizationSources.local : AICustomizationSources.user;
      const isRemote = sessionCustomization.clientId !== void 0;
      for (const child of this.toDirectoryItems(sessionCustomization, source, isRemote)) {
        items.set(child.itemKey ?? child.uri.toString(), {
          ...child,
          status: toStatusString(sessionCustomization.load),
          statusMessage: toStatusMessage(sessionCustomization.load),
          enabled: sessionCustomization.enabled
        });
      }
    }
    return [...items.values()];
  }
  getCustomAgents(sessionResource) {
    const sessionAgents = this._customAgentsService.getCustomAgents(sessionResource);
    return sessionAgents.length > 0 ? sessionAgents : this._draftCustomAgents?.get() ?? [];
  }
  getCustomizations(sessionResource) {
    const sessionCustomizations = this._customAgentsService.getCustomizations(sessionResource);
    const draftCustomizations = this._draftCustomizations?.get() ?? [];
    if (draftCustomizations.length === 0) {
      return sessionCustomizations;
    }
    const sessionKeys = new Set(sessionCustomizations.map((customization) => `${customization.type}:${customization.uri}`));
    return [
      ...sessionCustomizations,
      ...draftCustomizations.filter((customization) => !sessionKeys.has(`${customization.type}:${customization.uri}`))
    ];
  }
  /**
   * Rewrites a bundle child item to reflect the original source location of
   * the flattened file, when it can be recovered from the synthetic bundle's
   * reverse map. The synced (in-memory) URI is replaced with the real local
   * URI so the item points at its true origin, and the source/extension/plugin
   * metadata is restored. Returns the item unchanged when no origin is known.
   */
  _applySyncedOrigin(child) {
    const origin = this._resolveSyncedOrigin?.(child.uri);
    if (!origin) {
      return child;
    }
    return {
      ...child,
      uri: origin.uri,
      source: origin.source,
      extensionId: origin.extensionId,
      pluginUri: origin.pluginUri,
      groupKey: origin.source === AICustomizationSources.user ? child.groupKey : void 0
    };
  }
  /**
   * Reads a plugin's directory contents through the agent-host
   * filesystem provider and returns one {@link ICustomizationItem} per
   * supported file (agents/skills/instructions/prompts).
   */
  async _expandPluginContents(plugin, token) {
    const cached = this._expansionCache.get(plugin.item.uri);
    if (cached && cached.nonce === plugin.nonce && cached.pluginLabel === plugin.pluginLabel) {
      return cached.children;
    }
    const children = await this._contentExpander.expandPluginContents(plugin.item.uri, plugin.childGroupKey, plugin.isBundleItem, plugin.item.source, plugin.pluginLabel, token);
    this._expansionCache.set(plugin.item.uri, { nonce: plugin.nonce, pluginLabel: plugin.pluginLabel, children });
    return children;
  }
};
AgentCustomizationItemProvider = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IAgentHostCustomizationService)
], AgentCustomizationItemProvider);
function isParentOrEqual(folderURI, childURI) {
  try {
    return extUriBiasedIgnorePathCase.isEqualOrParent(URI.parse(childURI), URI.parse(folderURI));
  } catch {
    return childURI === folderURI || childURI.startsWith(folderURI + "/");
  }
}
function isUnderAnyRoot(roots, childURI) {
  return roots.some((root) => isParentOrEqual(root, childURI));
}
function toStatusString(load) {
  return load?.kind;
}
function toStatusMessage(load) {
  if (load?.kind === CustomizationLoadStatus.Degraded || load?.kind === CustomizationLoadStatus.Error) {
    return load.message;
  }
  return void 0;
}
function customizationKey(customization) {
  return customization.id;
}
function customizationItemKey(customization, clientId) {
  return clientId !== void 0 ? `${customizationKey(customization)}::${clientId}` : customizationKey(customization);
}
function isDirectoryCustomization(customization) {
  return customization.type === CustomizationType.Directory;
}
function toPromptsType(type) {
  switch (type) {
    case CustomizationType.Agent:
      return PromptsType.agent;
    case CustomizationType.Skill:
      return PromptsType.skill;
    case CustomizationType.Rule:
      return PromptsType.instructions;
    case CustomizationType.Prompt:
      return PromptsType.prompt;
    case CustomizationType.Hook:
      return PromptsType.hook;
    default:
      return void 0;
  }
}
function getChildDescription(child) {
  switch (child.type) {
    case CustomizationType.Agent:
    case CustomizationType.Skill:
    case CustomizationType.Prompt:
    case CustomizationType.Rule:
      return child.description;
    default:
      return void 0;
  }
}
function isSyntheticBundle(customization) {
  try {
    return URI.parse(customization.uri).scheme === SYNCED_CUSTOMIZATION_SCHEME;
  } catch {
    return false;
  }
}
export {
  AgentCustomizationItemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIHR5cGUgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBnZXRDdXN0b21pemF0aW9uRGlzYWJsZWRSZWFzb24sIGlzQ3VzdG9taXphdGlvbkVuYWJsZWQsIHR5cGUgQ3VzdG9taXphdGlvbkRpc2FibGVkUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jdXN0b21pemF0aW9uRW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgQ3VzdG9taXphdGlvblR5cGUsIHR5cGUgQWdlbnRDdXN0b21pemF0aW9uLCB0eXBlIENoaWxkQ3VzdG9taXphdGlvbiwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgQ3VzdG9taXphdGlvbkxvYWRTdGF0ZSwgdHlwZSBEaXJlY3RvcnlDdXN0b21pemF0aW9uLCBQbHVnaW5DdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkl0ZW0sIElDdXN0b21pemF0aW9uSXRlbUFjdGlvbiwgSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIsIElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTWU5DRURfQ1VTVE9NSVpBVElPTl9TQ0hFTUUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyB0b0FnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IHJlYWRBZ2VudEN1c3RvbWl6YXRpb25NZXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9tZXRhL2FnZW50Q3VzdG9taXphdGlvbk1ldGEuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uU291cmNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUsIFRhcmdldCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyIH0gZnJvbSAnLi9hZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIElTeW5jZWRDdXN0b21pemF0aW9uT3JpZ2luIH0gZnJvbSAnLi9zeW5jZWRDdXN0b21pemF0aW9uQnVuZGxlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTb3VyY2UsIElDdXN0b21BZ2VudCwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRIb3N0UGx1Z2luRW5hYmxlbWVudEFjdGlvbnMgfSBmcm9tICcuLi8uLi9hZ2VudFBsdWdpbkFjdGlvbnMuanMnO1xuXG5cbmNvbnN0IFJFTU9URV9IT1NUX0dST1VQID0gJ3JlbW90ZS1ob3N0JztcbmNvbnN0IFJFTU9URV9DTElFTlRfR1JPVVAgPSAncmVtb3RlLWNsaWVudCc7XG5cblxudHlwZSBQbHVnaW5NZXRhID0geyBpdGVtOiBJQ3VzdG9taXphdGlvbkl0ZW07IG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHN0YXR1czogUmV0dXJuVHlwZTx0eXBlb2YgdG9TdGF0dXNTdHJpbmc+OyBzdGF0dXNNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGVuYWJsZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7IGRpc2FibGVkUmVhc29uOiBDdXN0b21pemF0aW9uRGlzYWJsZWRSZWFzb24gfCB1bmRlZmluZWQ7IGNoaWxkR3JvdXBLZXk6IHN0cmluZzsgaXNCdW5kbGVJdGVtOiBib29sZWFuOyBwbHVnaW5MYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cblxuZXhwb3J0IGNsYXNzIEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdC8qKiBDYWNoZTogcGx1Z2luVXJpIFx1MjE5MiBsYXN0IGV4cGFuc2lvbiAoa2V5ZWQgYnkgbm9uY2UgYW5kIGxhYmVsIHNvIHdlIHJlLWZldGNoIG9uIGNvbnRlbnQgb3IgZGlzcGxheS1uYW1lIGNoYW5nZXMpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHBhbnNpb25DYWNoZSA9IG5ldyBSZXNvdXJjZU1hcDx7IG5vbmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHBsdWdpbkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGNoaWxkcmVuOiByZWFkb25seSBJQ3VzdG9taXphdGlvbkl0ZW1bXSB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZW50RXhwYW5kZXI6IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcjtcblx0cHJpdmF0ZSBfZHJhZnRDdXN0b21BZ2VudHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZHJhZnRDdXN0b21pemF0aW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0SXRlbUFjdGlvbnM6ICgoY3VzdG9taXphdGlvbjogUGx1Z2luQ3VzdG9taXphdGlvbiwgY2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4gSUN1c3RvbWl6YXRpb25JdGVtQWN0aW9uW10gfCB1bmRlZmluZWQpIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVTeW5jZWRPcmlnaW46ICgoc3luY2VkVXJpOiBVUkkpID0+IElTeW5jZWRDdXN0b21pemF0aW9uT3JpZ2luIHwgdW5kZWZpbmVkKSB8IHVuZGVmaW5lZCxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3VzdG9tQWdlbnRzU2VydmljZTogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbnRlbnRFeHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIodGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY3VzdG9tQWdlbnRzU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRzZXREcmFmdEN1c3RvbUFnZW50cyhjdXN0b21BZ2VudHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdPik6IHZvaWQge1xuXHRcdHRoaXMuX2RyYWZ0Q3VzdG9tQWdlbnRzID0gY3VzdG9tQWdlbnRzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGN1c3RvbUFnZW50cy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0RHJhZnRDdXN0b21pemF0aW9ucyhjdXN0b21pemF0aW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdPik6IHZvaWQge1xuXHRcdHRoaXMuX2RyYWZ0Q3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucztcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjdXN0b21pemF0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1JlbW90ZVVyaShjdXN0b21pemF0aW9uVXJpOiBzdHJpbmcpOiBVUkkge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gVVJJLnBhcnNlKGN1c3RvbWl6YXRpb25VcmkpO1xuXHRcdC8vIFRoZSBzeW50aGV0aWMgc3luY2VkLWN1c3RvbWl6YXRpb24gYnVuZGxlIGxpdmVzIGluIHRoZSBjbGllbnQnc1xuXHRcdC8vIGluLW1lbW9yeSBmaWxlc3lzdGVtLiBEb24ndCB3cmFwIGl0IGFzIGFuIGFnZW50LWhvc3Q6Ly8gVVJJIFx1MjAxNFxuXHRcdC8vIHRoZSBzZXJ2ZXIgZG9lc24ndCBoYXZlIHRoaXMgc2NoZW1lIHJlZ2lzdGVyZWQsIHNvIHdyYXBwaW5nIGl0XG5cdFx0Ly8gd291bGQgbWFrZSBleHBhbnNpb24gKGFuZCBhbnkgZGlyZWN0IHJlYWQpIGZhaWwuXG5cdFx0aWYgKG9yaWdpbmFsLnNjaGVtZSA9PT0gU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FKSB7XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWw7XG5cdFx0fVxuXHRcdHJldHVybiB0b0FnZW50SG9zdFVyaShvcmlnaW5hbCwgdGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdH1cblxuXHRwcml2YXRlIHRvQmFkZ2UoY3VzdG9taXphdGlvbjogUGx1Z2luQ3VzdG9taXphdGlvbiwgZnJvbUNsaWVudDogYm9vbGVhbik6IHsgYmFkZ2U/OiBzdHJpbmc7IGJhZGdlVG9vbHRpcD86IHN0cmluZzsgZ3JvdXBLZXk/OiBzdHJpbmcgfSB7XG5cdFx0aWYgKGZyb21DbGllbnQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGdyb3VwS2V5OiBSRU1PVEVfQ0xJRU5UX0dST1VQLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Z3JvdXBLZXk6IFJFTU9URV9IT1NUX0dST1VQLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHRvSXRlbShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgY3VzdG9taXphdGlvbjogUGx1Z2luQ3VzdG9taXphdGlvbiwgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UpOiBJQ3VzdG9taXphdGlvbkl0ZW0ge1xuXHRcdGNvbnN0IGNsaWVudElkID0gY3VzdG9taXphdGlvbi5jbGllbnRJZDsgLy8gc2V0IGlmIHRoZSBjb25maWd1cmF0aW9uIGNhbWUgZnJvbSB0aGUgY2xpZW50XG5cdFx0Y29uc3QgYmFkZ2UgPSB0aGlzLnRvQmFkZ2UoY3VzdG9taXphdGlvbiwgY2xpZW50SWQgIT09IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy50b1JlbW90ZVVyaShjdXN0b21pemF0aW9uLnVyaSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGl0ZW1LZXk6IGN1c3RvbWl6YXRpb25JdGVtS2V5KGN1c3RvbWl6YXRpb24sIGNsaWVudElkKSxcblx0XHRcdHVyaTogdXJpLFxuXHRcdFx0dHlwZTogJ3BsdWdpbicsXG5cdFx0XHRuYW1lOiBjdXN0b21pemF0aW9uLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0c291cmNlLFxuXHRcdFx0c3RhdHVzOiB0b1N0YXR1c1N0cmluZyhjdXN0b21pemF0aW9uLmxvYWQpLFxuXHRcdFx0c3RhdHVzTWVzc2FnZTogdG9TdGF0dXNNZXNzYWdlKGN1c3RvbWl6YXRpb24ubG9hZCksXG5cdFx0XHRlbmFibGVkOiBpc0N1c3RvbWl6YXRpb25FbmFibGVkKGN1c3RvbWl6YXRpb24pLFxuXHRcdFx0ZGlzYWJsZWRSZWFzb246IGdldEN1c3RvbWl6YXRpb25EaXNhYmxlZFJlYXNvbihjdXN0b21pemF0aW9uKSxcblx0XHRcdGJhZGdlOiBiYWRnZS5iYWRnZSxcblx0XHRcdGJhZGdlVG9vbHRpcDogYmFkZ2UuYmFkZ2VUb29sdGlwLFxuXHRcdFx0Z3JvdXBLZXk6IGJhZGdlLmdyb3VwS2V5LFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHBsdWdpblVyaTogdXJpLFxuXHRcdFx0dXNlckludm9jYWJsZTogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uczogW1xuXHRcdFx0XHQuLi4oY2xpZW50SWQgPT09IHVuZGVmaW5lZCA/IGdldEFnZW50SG9zdFBsdWdpbkVuYWJsZW1lbnRBY3Rpb25zKHRoaXMuX2N1c3RvbUFnZW50c1NlcnZpY2UsIHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlLCBjdXN0b21pemF0aW9uLCB0aGlzLl9jdXN0b21BZ2VudHNTZXJ2aWNlLmdldFdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uUmVzb3VyY2UpLmxlbmd0aCA+IDApIDogW10pLFxuXHRcdFx0XHQuLi4odGhpcy5fZ2V0SXRlbUFjdGlvbnM/LihjdXN0b21pemF0aW9uLCBjbGllbnRJZCkgPz8gW10pLFxuXHRcdFx0XSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSB0b0RpcmVjdG9yeUl0ZW1zKGN1c3RvbWl6YXRpb246IERpcmVjdG9yeUN1c3RvbWl6YXRpb24sIHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlLCBpc1JlbW90ZTogYm9vbGVhbik6IElDdXN0b21pemF0aW9uSXRlbVtdIHtcblx0XHRjb25zdCBpdGVtczogSUN1c3RvbWl6YXRpb25JdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGN1c3RvbWl6YXRpb24uY2hpbGRyZW4gPz8gW10pIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLnRvRGlyZWN0b3J5Q2hpbGRJdGVtKGNoaWxkLCBzb3VyY2UsIGlzUmVtb3RlKTtcblx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdHByaXZhdGUgdG9EaXJlY3RvcnlDaGlsZEl0ZW0oY2hpbGQ6IENoaWxkQ3VzdG9taXphdGlvbiwgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UsIGlzUmVtb3RlOiBib29sZWFuKTogSUN1c3RvbWl6YXRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0eXBlID0gdG9Qcm9tcHRzVHlwZShjaGlsZC50eXBlKTtcblx0XHRpZiAoIXR5cGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCB1c2VySW52b2NhYmxlOiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCkge1xuXHRcdFx0dXNlckludm9jYWJsZSA9IHJlYWRBZ2VudEN1c3RvbWl6YXRpb25NZXRhKGNoaWxkKS51c2VySW52b2NhYmxlICE9PSBmYWxzZTtcblx0XHR9XG5cdFx0bGV0IGdyb3VwS2V5ID0gaXNSZW1vdGUgPyBSRU1PVEVfQ0xJRU5UX0dST1VQIDogdW5kZWZpbmVkO1xuXHRcdGxldCBiYWRnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBiYWRnZVRvb2x0aXA6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoIWdyb3VwS2V5ICYmIGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUpIHtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSBjaGlsZC5nbG9icz8uWzBdO1xuXHRcdFx0aWYgKGNoaWxkLmdsb2JzICYmIGNoaWxkLmdsb2JzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXBLZXkgPSAnY29udGV4dC1pbnN0cnVjdGlvbnMnO1xuXHRcdFx0XHRiYWRnZSA9IHBhdHRlcm4gPT09ICcqKidcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhbHdheXNBZGRlZCcsICdhbHdheXMgYWRkZWQnKVxuXHRcdFx0XHRcdDogcGF0dGVybjtcblx0XHRcdFx0YmFkZ2VUb29sdGlwID0gcGF0dGVybiA9PT0gJyoqJ1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Fsd2F5c0luY2x1ZGVkJywgJ1RoaXMgaW5zdHJ1Y3Rpb24gaXMgYXV0b21hdGljYWxseSBpbmNsdWRlZCBpbiBldmVyeSBpbnRlcmFjdGlvbi4nKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NvbnRleHRJbnN0cnVjdGlvbnMnLCAnVGhpcyBpbnN0cnVjdGlvbiBpcyBhdXRvbWF0aWNhbGx5IGluY2x1ZGVkIHdoZW4gZmlsZXMgbWF0Y2hpbmcgXFwnezB9XFwnIGFyZSBpbiBjb250ZXh0LicsIHBhdHRlcm4pO1xuXHRcdFx0fSBlbHNlIGlmIChjaGlsZC5hbHdheXNBcHBseSkge1xuXHRcdFx0XHRncm91cEtleSA9ICdhZ2VudC1pbnN0cnVjdGlvbnMnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z3JvdXBLZXkgPSAnb24tZGVtYW5kLWluc3RydWN0aW9ucyc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGl0ZW1LZXk6IGNoaWxkLmlkLFxuXHRcdFx0dXJpOiB0aGlzLnRvUmVtb3RlVXJpKGNoaWxkLnVyaSksXG5cdFx0XHR0eXBlLFxuXHRcdFx0bmFtZTogY2hpbGQubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBnZXRDaGlsZERlc2NyaXB0aW9uKGNoaWxkKSxcblx0XHRcdHNvdXJjZSxcblx0XHRcdGdyb3VwS2V5LFxuXHRcdFx0YmFkZ2UsXG5cdFx0XHRiYWRnZVRvb2x0aXAsXG5cdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHR1c2VySW52b2NhYmxlLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBwcm92aWRlU291cmNlRm9sZGVycyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdHlwZTogUHJvbXB0c1R5cGUsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyW10+IHtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSB0aGlzLl9jdXN0b21BZ2VudHNTZXJ2aWNlLmdldFdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgZm9sZGVyczogSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXJbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiB0aGlzLl9jdXN0b21BZ2VudHNTZXJ2aWNlLmdldEN1c3RvbWl6YXRpb25zKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdGlmICghaXNEaXJlY3RvcnlDdXN0b21pemF0aW9uKGN1c3RvbWl6YXRpb24pIHx8ICFjdXN0b21pemF0aW9uLndyaXRhYmxlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRvUHJvbXB0c1R5cGUoY3VzdG9taXphdGlvbi5jb250ZW50cykgIT09IHR5cGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBpc1VuZGVyQW55Um9vdCh3b3JraW5nRGlyZWN0b3JpZXMsIGN1c3RvbWl6YXRpb24udXJpKSA/IEFJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWwgOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXI7XG5cdFx0XHRmb2xkZXJzLnB1c2goe1xuXHRcdFx0XHR1cmk6IHRoaXMudG9SZW1vdGVVcmkoY3VzdG9taXphdGlvbi51cmkpLFxuXHRcdFx0XHRsYWJlbDogY3VzdG9taXphdGlvbi5uYW1lLFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGZvbGRlcnM7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlQ3VzdG9tQWdlbnRzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9tQWdlbnRbXT4ge1xuXHRcdGNvbnN0IGFnZW50cyA9IHRoaXMuZ2V0Q3VzdG9tQWdlbnRzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVzID0gW2dldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpXTtcblx0XHRyZXR1cm4gYWdlbnRzLm1hcChhZ2VudCA9PiAoe1xuXHRcdFx0aWQ6IGFnZW50LnVyaSxcblx0XHRcdHVyaTogdGhpcy50b1JlbW90ZVVyaShhZ2VudC51cmkpLFxuXHRcdFx0bmFtZTogYWdlbnQubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbixcblx0XHRcdHNlc3Npb25UeXBlczogc2Vzc2lvblR5cGVzLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdC8vIGZpbGwgZGVmYXVsdC9lbXB0eSB2YWx1ZXMgZm9yIGFsbCBvdGhlciBwcm9wZXJ0aWVzIHRoZXkgd2lsbCBub3QgYmUgdXNlZCBieSB0aGUgVUlcblx0XHRcdC8vIHdoZW4gbWFraW5nIGEgcmVxdWVzdCwgYWxsIHRoYXQncyBuZWVkZWQgaXMgdGhlIGFnZW50IGlkLlxuXHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0gc2F0aXNmaWVzIElBZ2VudFNvdXJjZSxcblx0XHRcdHRvb2xzOiB1bmRlZmluZWQsXG5cdFx0XHRhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdGFyZ3VtZW50SGludDogdW5kZWZpbmVkLFxuXHRcdFx0aGFuZE9mZnM6IHVuZGVmaW5lZCxcblx0XHRcdGhvb2tzOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlbDogdW5kZWZpbmVkLFxuXHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHsgY29udGVudDogJycsIHRvb2xSZWZlcmVuY2VzOiBbXSB9LFxuXHRcdFx0dmlzaWJpbGl0eToge1xuXHRcdFx0XHRhZ2VudEludm9jYWJsZTogdHJ1ZSxcblx0XHRcdFx0dXNlckludm9jYWJsZTogcmVhZEFnZW50Q3VzdG9taXphdGlvbk1ldGEoYWdlbnQpLnVzZXJJbnZvY2FibGUgIT09IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkXG5cdFx0fSBzYXRpc2ZpZXMgSUN1c3RvbUFnZW50KSk7XG5cblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDdXN0b21pemF0aW9uSXRlbVtdPiB7XG5cdFx0Y29uc3QgaXRlbXMgPSBuZXcgTWFwPHN0cmluZywgSUN1c3RvbWl6YXRpb25JdGVtPigpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX2N1c3RvbUFnZW50c1NlcnZpY2UuZ2V0V29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIHRoaXMuZ2V0Q3VzdG9tQWdlbnRzKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGlzVW5kZXJBbnlSb290KHdvcmtpbmdEaXJlY3RvcmllcywgYWdlbnQudXJpKSA/IEFJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWwgOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXI7XG5cdFx0XHRpdGVtcy5zZXQoYWdlbnQuaWQsIHtcblx0XHRcdFx0aXRlbUtleTogYWdlbnQuaWQsXG5cdFx0XHRcdHVyaTogdGhpcy50b1JlbW90ZVVyaShhZ2VudC51cmkpLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHRcdFx0bmFtZTogYWdlbnQubmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGFnZW50LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRlbmFibGVkOiBhZ2VudC5lbmFibGVkICE9PSBmYWxzZSxcblx0XHRcdFx0dXNlckludm9jYWJsZTogcmVhZEFnZW50Q3VzdG9taXphdGlvbk1ldGEoYWdlbnQpLnVzZXJJbnZvY2FibGUgIT09IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgcGFyZW50IHBsdWdpbiBpdGVtcyBrZXllZCBieSBjdXN0b21pemF0aW9uIHJlZlxuXHRcdGNvbnN0IHBsdWdpbnM6IFBsdWdpbk1ldGFbXSA9IFtdO1xuXHRcdGNvbnN0IGV4cGFuZFByb21pc2VzOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbVtdPltdID0gW107XG5cblxuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gdGhpcy5nZXRDdXN0b21pemF0aW9ucyhzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgZGlyZWN0b3J5Q3VzdG9taXphdGlvbnMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb25DdXN0b21pemF0aW9uIG9mIGN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRpZiAoaXNEaXJlY3RvcnlDdXN0b21pemF0aW9uKHNlc3Npb25DdXN0b21pemF0aW9uKSkge1xuXHRcdFx0XHRkaXJlY3RvcnlDdXN0b21pemF0aW9ucy5wdXNoKHNlc3Npb25DdXN0b21pemF0aW9uKTtcblx0XHRcdH0gZWxzZSBpZiAoc2Vzc2lvbkN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyKSB7XG5cdFx0XHRcdC8vIEJhcmUgTUNQIHNlcnZlciBlbnRyaWVzIGFyZW4ndCBzaG93biBhcyBwbHVnaW4gaXRlbXMgaW4gdGhpcyB2aWV3LlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGlzQnVuZGxlSXRlbSA9IGlzU3ludGhldGljQnVuZGxlKHNlc3Npb25DdXN0b21pemF0aW9uKTtcblx0XHRcdFx0Y29uc3QgaXNDbGllbnRTeW5jZWQgPSBzZXNzaW9uQ3VzdG9taXphdGlvbi5jbGllbnRJZCAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBjaGlsZEdyb3VwS2V5ID0gaXNDbGllbnRTeW5jZWQgPyBSRU1PVEVfQ0xJRU5UX0dST1VQIDogUkVNT1RFX0hPU1RfR1JPVVA7XG5cblx0XHRcdFx0Ly8gQWx3YXlzIHNob3cgc2Vzc2lvbiBjdXN0b21pemF0aW9ucyBhcyBkaXN0aW5jdCBwbHVnaW4gZW50cmllcyBcdTIwMTRcblx0XHRcdFx0Ly8gY2xpZW50LXN5bmNlZCBpdGVtcyBhcHBlYXIgaW4gdGhlIFwiTG9jYWxcIiBncm91cCwgaG9zdC1vd25lZCBpblxuXHRcdFx0XHQvLyB0aGUgXCJSZW1vdGVcIiBncm91cC4gVGhlIHN5bnRoZXRpYyBidW5kbGUgaXMgYW4gaW1wbGVtZW50YXRpb25cblx0XHRcdFx0Ly8gZGV0YWlsIGFuZCBpcyBub3Qgc2hvd24gYXMgYSBzdGFuZGFsb25lIGVudHJ5LCBidXQgaXMgc3RpbGxcblx0XHRcdFx0Ly8gZXhwYW5kZWQgYmVsb3cgc28gaW5kaXZpZHVhbCB1c2VyIGZpbGVzIGFwcGVhciBpbiBwZXItdHlwZSB0YWJzLlxuXHRcdFx0XHRsZXQgaXRlbTogSUN1c3RvbWl6YXRpb25JdGVtO1xuXHRcdFx0XHRpZiAoIWlzQnVuZGxlSXRlbSkge1xuXHRcdFx0XHRcdGl0ZW0gPSB0aGlzLnRvSXRlbShzZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25DdXN0b21pemF0aW9uLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbik7XG5cdFx0XHRcdFx0aXRlbXMuc2V0KGN1c3RvbWl6YXRpb25JdGVtS2V5KHNlc3Npb25DdXN0b21pemF0aW9uLCBzZXNzaW9uQ3VzdG9taXphdGlvbi5jbGllbnRJZCksIGl0ZW0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIGNyZWF0ZSBhIGR1bW15IHBhcmVudCBpdGVtIGZvciB0aGUgc3ludGhldGljIGJ1bmRsZSwgaXQgZG9lcyBub3QgZ28gaW50byB0aGUgaXRlbXMgbWFwLCBqdXN0IG5lZWQgaXQgdG8gZXhwYW5kLlxuXHRcdFx0XHRcdGl0ZW0gPSB7IHVyaTogdGhpcy50b1JlbW90ZVVyaShzZXNzaW9uQ3VzdG9taXphdGlvbi51cmkpLCB0eXBlOiAncGx1Z2luJywgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgbmFtZTogJycsIGdyb3VwS2V5OiBjaGlsZEdyb3VwS2V5LCBleHRlbnNpb25JZDogdW5kZWZpbmVkLCBwbHVnaW5Vcmk6IHVuZGVmaW5lZCB9IHNhdGlzZmllcyBJQ3VzdG9taXphdGlvbkl0ZW07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcGx1Z2luTWV0YSA9IHtcblx0XHRcdFx0XHRpdGVtLFxuXHRcdFx0XHRcdG5vbmNlOiAoc2Vzc2lvbkN1c3RvbWl6YXRpb24gYXMgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbikubm9uY2UsXG5cdFx0XHRcdFx0c3RhdHVzOiB0b1N0YXR1c1N0cmluZyhzZXNzaW9uQ3VzdG9taXphdGlvbi5sb2FkKSxcblx0XHRcdFx0XHRzdGF0dXNNZXNzYWdlOiB0b1N0YXR1c01lc3NhZ2Uoc2Vzc2lvbkN1c3RvbWl6YXRpb24ubG9hZCksXG5cdFx0XHRcdFx0ZW5hYmxlZDogaXNDdXN0b21pemF0aW9uRW5hYmxlZChzZXNzaW9uQ3VzdG9taXphdGlvbiksXG5cdFx0XHRcdFx0ZGlzYWJsZWRSZWFzb246IGdldEN1c3RvbWl6YXRpb25EaXNhYmxlZFJlYXNvbihzZXNzaW9uQ3VzdG9taXphdGlvbiksXG5cdFx0XHRcdFx0Y2hpbGRHcm91cEtleSxcblx0XHRcdFx0XHRpc0J1bmRsZUl0ZW0sXG5cdFx0XHRcdFx0cGx1Z2luTGFiZWw6IGlzQnVuZGxlSXRlbSA/IHVuZGVmaW5lZCA6IGl0ZW0ubmFtZSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgUGx1Z2luTWV0YTtcblx0XHRcdFx0cGx1Z2lucy5wdXNoKHBsdWdpbk1ldGEpO1xuXHRcdFx0XHRleHBhbmRQcm9taXNlcy5wdXNoKHRoaXMuX2V4cGFuZFBsdWdpbkNvbnRlbnRzKHBsdWdpbk1ldGEsIHRva2VuKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRXhwYW5kIGVhY2ggcGx1Z2luIGRpcmVjdG9yeSBpbiBwYXJhbGxlbCB0byBkaXNjb3ZlciBpbmRpdmlkdWFsIHNraWxscywgYWdlbnRzLCBpbnN0cnVjdGlvbnMsIGFuZCBwcm9tcHRzIGluc2lkZS5cblx0XHRjb25zdCBleHBhbnNpb25zID0gYXdhaXQgUHJvbWlzZS5hbGwoZXhwYW5kUHJvbWlzZXMpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwbHVnaW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwID0gcGx1Z2luc1tpXTtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgZXhwYW5zaW9uc1tpXSkge1xuXHRcdFx0XHQvLyBGaWxlcyBmbGF0dGVuZWQgaW50byB0aGUgc3ludGhldGljIGJ1bmRsZSBsb3N0IHRoZWlyIG9yaWdpbmFsXG5cdFx0XHRcdC8vIHByb3ZlbmFuY2U7IHJlY292ZXIgaXQgKGV4dGVuc2lvbi9wbHVnaW4vYnVpbHQtaW4gYW5kIHNvdXJjZVxuXHRcdFx0XHQvLyBsb2NhdGlvbikgc28gdGhlIGl0ZW0gcmVmbGVjdHMgd2hlcmUgaXQgYWN0dWFsbHkgY2FtZSBmcm9tLlxuXHRcdFx0XHRjb25zdCBlbnJpY2hlZCA9IHAuaXNCdW5kbGVJdGVtID8gdGhpcy5fYXBwbHlTeW5jZWRPcmlnaW4oY2hpbGQpIDogY2hpbGQ7XG5cdFx0XHRcdC8vIENoaWxkcmVuIGluaGVyaXQgdGhlIHBhcmVudCBwbHVnaW4ncyBzdGF0dXMvZW5hYmxlZCBzdGF0ZS5cblx0XHRcdFx0aXRlbXMuc2V0KGVucmljaGVkLnVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdFx0Li4uZW5yaWNoZWQsXG5cdFx0XHRcdFx0c3RhdHVzOiBwLnN0YXR1cyxcblx0XHRcdFx0XHRzdGF0dXNNZXNzYWdlOiBwLnN0YXR1c01lc3NhZ2UsXG5cdFx0XHRcdFx0ZW5hYmxlZDogcC5lbmFibGVkLFxuXHRcdFx0XHRcdGRpc2FibGVkUmVhc29uOiBwLmRpc2FibGVkUmVhc29uLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNlc3Npb25DdXN0b21pemF0aW9uIG9mIGRpcmVjdG9yeUN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSBpc1VuZGVyQW55Um9vdCh3b3JraW5nRGlyZWN0b3JpZXMsIHNlc3Npb25DdXN0b21pemF0aW9uLnVyaSkgPyBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmxvY2FsIDogQUlDdXN0b21pemF0aW9uU291cmNlcy51c2VyO1xuXHRcdFx0Y29uc3QgaXNSZW1vdGUgPSBzZXNzaW9uQ3VzdG9taXphdGlvbi5jbGllbnRJZCAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLnRvRGlyZWN0b3J5SXRlbXMoc2Vzc2lvbkN1c3RvbWl6YXRpb24sIHNvdXJjZSwgaXNSZW1vdGUpKSB7XG5cdFx0XHRcdGl0ZW1zLnNldChjaGlsZC5pdGVtS2V5ID8/IGNoaWxkLnVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdFx0Li4uY2hpbGQsXG5cdFx0XHRcdFx0c3RhdHVzOiB0b1N0YXR1c1N0cmluZyhzZXNzaW9uQ3VzdG9taXphdGlvbi5sb2FkKSxcblx0XHRcdFx0XHRzdGF0dXNNZXNzYWdlOiB0b1N0YXR1c01lc3NhZ2Uoc2Vzc2lvbkN1c3RvbWl6YXRpb24ubG9hZCksXG5cdFx0XHRcdFx0ZW5hYmxlZDogc2Vzc2lvbkN1c3RvbWl6YXRpb24uZW5hYmxlZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbLi4uaXRlbXMudmFsdWVzKCldO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXN0b21BZ2VudHMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBBZ2VudEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkFnZW50cyA9IHRoaXMuX2N1c3RvbUFnZW50c1NlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0cmV0dXJuIHNlc3Npb25BZ2VudHMubGVuZ3RoID4gMCA/IHNlc3Npb25BZ2VudHMgOiB0aGlzLl9kcmFmdEN1c3RvbUFnZW50cz8uZ2V0KCkgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIGdldEN1c3RvbWl6YXRpb25zKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHtcblx0XHRjb25zdCBzZXNzaW9uQ3VzdG9taXphdGlvbnMgPSB0aGlzLl9jdXN0b21BZ2VudHNTZXJ2aWNlLmdldEN1c3RvbWl6YXRpb25zKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgZHJhZnRDdXN0b21pemF0aW9ucyA9IHRoaXMuX2RyYWZ0Q3VzdG9taXphdGlvbnM/LmdldCgpID8/IFtdO1xuXHRcdGlmIChkcmFmdEN1c3RvbWl6YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25DdXN0b21pemF0aW9ucztcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uS2V5cyA9IG5ldyBTZXQoc2Vzc2lvbkN1c3RvbWl6YXRpb25zLm1hcChjdXN0b21pemF0aW9uID0+IGAke2N1c3RvbWl6YXRpb24udHlwZX06JHtjdXN0b21pemF0aW9uLnVyaX1gKSk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLnNlc3Npb25DdXN0b21pemF0aW9ucyxcblx0XHRcdC4uLmRyYWZ0Q3VzdG9taXphdGlvbnMuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gIXNlc3Npb25LZXlzLmhhcyhgJHtjdXN0b21pemF0aW9uLnR5cGV9OiR7Y3VzdG9taXphdGlvbi51cml9YCkpLFxuXHRcdF07XG5cdH1cblxuXHQvKipcblx0ICogUmV3cml0ZXMgYSBidW5kbGUgY2hpbGQgaXRlbSB0byByZWZsZWN0IHRoZSBvcmlnaW5hbCBzb3VyY2UgbG9jYXRpb24gb2Zcblx0ICogdGhlIGZsYXR0ZW5lZCBmaWxlLCB3aGVuIGl0IGNhbiBiZSByZWNvdmVyZWQgZnJvbSB0aGUgc3ludGhldGljIGJ1bmRsZSdzXG5cdCAqIHJldmVyc2UgbWFwLiBUaGUgc3luY2VkIChpbi1tZW1vcnkpIFVSSSBpcyByZXBsYWNlZCB3aXRoIHRoZSByZWFsIGxvY2FsXG5cdCAqIFVSSSBzbyB0aGUgaXRlbSBwb2ludHMgYXQgaXRzIHRydWUgb3JpZ2luLCBhbmQgdGhlIHNvdXJjZS9leHRlbnNpb24vcGx1Z2luXG5cdCAqIG1ldGFkYXRhIGlzIHJlc3RvcmVkLiBSZXR1cm5zIHRoZSBpdGVtIHVuY2hhbmdlZCB3aGVuIG5vIG9yaWdpbiBpcyBrbm93bi5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5U3luY2VkT3JpZ2luKGNoaWxkOiBJQ3VzdG9taXphdGlvbkl0ZW0pOiBJQ3VzdG9taXphdGlvbkl0ZW0ge1xuXHRcdGNvbnN0IG9yaWdpbiA9IHRoaXMuX3Jlc29sdmVTeW5jZWRPcmlnaW4/LihjaGlsZC51cmkpO1xuXHRcdGlmICghb3JpZ2luKSB7XG5cdFx0XHRyZXR1cm4gY2hpbGQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jaGlsZCxcblx0XHRcdHVyaTogb3JpZ2luLnVyaSxcblx0XHRcdHNvdXJjZTogb3JpZ2luLnNvdXJjZSxcblx0XHRcdGV4dGVuc2lvbklkOiBvcmlnaW4uZXh0ZW5zaW9uSWQsXG5cdFx0XHRwbHVnaW5Vcmk6IG9yaWdpbi5wbHVnaW5VcmksXG5cdFx0XHRncm91cEtleTogb3JpZ2luLnNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy51c2VyID8gY2hpbGQuZ3JvdXBLZXkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBhIHBsdWdpbidzIGRpcmVjdG9yeSBjb250ZW50cyB0aHJvdWdoIHRoZSBhZ2VudC1ob3N0XG5cdCAqIGZpbGVzeXN0ZW0gcHJvdmlkZXIgYW5kIHJldHVybnMgb25lIHtAbGluayBJQ3VzdG9taXphdGlvbkl0ZW19IHBlclxuXHQgKiBzdXBwb3J0ZWQgZmlsZSAoYWdlbnRzL3NraWxscy9pbnN0cnVjdGlvbnMvcHJvbXB0cykuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9leHBhbmRQbHVnaW5Db250ZW50cyhwbHVnaW46IFBsdWdpbk1ldGEsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgSUN1c3RvbWl6YXRpb25JdGVtW10+IHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9leHBhbnNpb25DYWNoZS5nZXQocGx1Z2luLml0ZW0udXJpKTtcblx0XHRpZiAoY2FjaGVkICYmIGNhY2hlZC5ub25jZSA9PT0gcGx1Z2luLm5vbmNlICYmIGNhY2hlZC5wbHVnaW5MYWJlbCA9PT0gcGx1Z2luLnBsdWdpbkxhYmVsKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkLmNoaWxkcmVuO1xuXHRcdH1cblx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IHRoaXMuX2NvbnRlbnRFeHBhbmRlci5leHBhbmRQbHVnaW5Db250ZW50cyhwbHVnaW4uaXRlbS51cmksIHBsdWdpbi5jaGlsZEdyb3VwS2V5LCBwbHVnaW4uaXNCdW5kbGVJdGVtLCBwbHVnaW4uaXRlbS5zb3VyY2UsIHBsdWdpbi5wbHVnaW5MYWJlbCwgdG9rZW4pO1xuXHRcdHRoaXMuX2V4cGFuc2lvbkNhY2hlLnNldChwbHVnaW4uaXRlbS51cmksIHsgbm9uY2U6IHBsdWdpbi5ub25jZSwgcGx1Z2luTGFiZWw6IHBsdWdpbi5wbHVnaW5MYWJlbCwgY2hpbGRyZW4gfSk7XG5cdFx0cmV0dXJuIGNoaWxkcmVuO1xuXHR9XG59XG5mdW5jdGlvbiBpc1BhcmVudE9yRXF1YWwoZm9sZGVyVVJJOiBzdHJpbmcsIGNoaWxkVVJJOiBzdHJpbmcpOiBib29sZWFuIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KFVSSS5wYXJzZShjaGlsZFVSSSksIFVSSS5wYXJzZShmb2xkZXJVUkkpKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGNoaWxkVVJJID09PSBmb2xkZXJVUkkgfHwgY2hpbGRVUkkuc3RhcnRzV2l0aChmb2xkZXJVUkkgKyAnLycpO1xuXHR9XG59XG5cbi8qKiBUcnVlIHdoZW4gYGNoaWxkVVJJYCBpcyBjb250YWluZWQgYnkgKG9yIGVxdWFsIHRvKSBhbnkgb2YgdGhlIHdvcmtzcGFjZSByb290cy4gKi9cbmZ1bmN0aW9uIGlzVW5kZXJBbnlSb290KHJvb3RzOiByZWFkb25seSBzdHJpbmdbXSwgY2hpbGRVUkk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcm9vdHMuc29tZShyb290ID0+IGlzUGFyZW50T3JFcXVhbChyb290LCBjaGlsZFVSSSkpO1xufVxuXG5mdW5jdGlvbiB0b1N0YXR1c1N0cmluZyhsb2FkOiBDdXN0b21pemF0aW9uTG9hZFN0YXRlIHwgdW5kZWZpbmVkKTogJ2xvYWRpbmcnIHwgJ2xvYWRlZCcgfCAnZGVncmFkZWQnIHwgJ2Vycm9yJyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBsb2FkPy5raW5kO1xufVxuXG5mdW5jdGlvbiB0b1N0YXR1c01lc3NhZ2UobG9hZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0ZSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChsb2FkPy5raW5kID09PSBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5EZWdyYWRlZCB8fCBsb2FkPy5raW5kID09PSBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5FcnJvcikge1xuXHRcdHJldHVybiBsb2FkLm1lc3NhZ2U7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gY3VzdG9taXphdGlvbktleShjdXN0b21pemF0aW9uOiBDdXN0b21pemF0aW9uKTogc3RyaW5nIHtcblx0cmV0dXJuIGN1c3RvbWl6YXRpb24uaWQ7XG59XG5cbmZ1bmN0aW9uIGN1c3RvbWl6YXRpb25JdGVtS2V5KGN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24sIGNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRyZXR1cm4gY2xpZW50SWQgIT09IHVuZGVmaW5lZFxuXHRcdD8gYCR7Y3VzdG9taXphdGlvbktleShjdXN0b21pemF0aW9uKX06OiR7Y2xpZW50SWR9YFxuXHRcdDogY3VzdG9taXphdGlvbktleShjdXN0b21pemF0aW9uKTtcbn1cblxuZnVuY3Rpb24gaXNEaXJlY3RvcnlDdXN0b21pemF0aW9uKGN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24pOiBjdXN0b21pemF0aW9uIGlzIERpcmVjdG9yeUN1c3RvbWl6YXRpb24ge1xuXHRyZXR1cm4gY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3Rvcnk7XG59XG5cbmZ1bmN0aW9uIHRvUHJvbXB0c1R5cGUodHlwZTogQ2hpbGRDdXN0b21pemF0aW9uWyd0eXBlJ10pOiBQcm9tcHRzVHlwZSB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuQWdlbnQ6XG5cdFx0XHRyZXR1cm4gUHJvbXB0c1R5cGUuYWdlbnQ7XG5cdFx0Y2FzZSBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbDpcblx0XHRcdHJldHVybiBQcm9tcHRzVHlwZS5za2lsbDtcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLlJ1bGU6XG5cdFx0XHRyZXR1cm4gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zO1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuUHJvbXB0OlxuXHRcdFx0cmV0dXJuIFByb21wdHNUeXBlLnByb21wdDtcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLkhvb2s6XG5cdFx0XHRyZXR1cm4gUHJvbXB0c1R5cGUuaG9vaztcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRDaGlsZERlc2NyaXB0aW9uKGNoaWxkOiBDaGlsZEN1c3RvbWl6YXRpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKGNoaWxkLnR5cGUpIHtcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLkFnZW50OlxuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuU2tpbGw6XG5cdFx0Y2FzZSBDdXN0b21pemF0aW9uVHlwZS5Qcm9tcHQ6XG5cdFx0Y2FzZSBDdXN0b21pemF0aW9uVHlwZS5SdWxlOlxuXHRcdFx0cmV0dXJuIGNoaWxkLmRlc2NyaXB0aW9uO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogUmV0dXJucyBgdHJ1ZWAgZm9yIHRoZSBzeW50aGV0aWMgXCJWUyBDb2RlIFN5bmNlZCBEYXRhXCIgYnVuZGxlIHBsdWdpbixcbiAqIHdoaWNoIGlzIGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBvZiB0aGUgY3VzdG9taXphdGlvbiBzeW5jIHBpcGVsaW5lXG4gKiBhbmQgc2hvdWxkIG5vdCBiZSBzdXJmYWNlZCBhcyBhIHN0YW5kYWxvbmUgaXRlbSBpbiB0aGUgVUkuXG4gKi9cbmZ1bmN0aW9uIGlzU3ludGhldGljQnVuZGxlKGN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24pOiBib29sZWFuIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGN1c3RvbWl6YXRpb24udXJpKS5zY2hlbWUgPT09IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsa0JB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
