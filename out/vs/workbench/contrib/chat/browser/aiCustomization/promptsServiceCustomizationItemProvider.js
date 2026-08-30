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
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Event } from "../../../../../base/common/event.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { OS } from "../../../../../base/common/platform.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { localize } from "../../../../../nls.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IAICustomizationWorkspaceService, AICustomizationSources } from "../../common/aiCustomizationWorkspaceService.js";
import { HookType, HOOK_METADATA } from "../../common/promptSyntax/hookTypes.js";
import { formatHookCommandLabel } from "../../common/promptSyntax/hookSchema.js";
import { PromptsType, getSourceDescription } from "../../common/promptSyntax/promptTypes.js";
import { IPromptsService, matchesSessionType, PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { BUILTIN_STORAGE } from "./aiCustomizationManagement.js";
import { getFriendlyName, isChatExtensionItem } from "./aiCustomizationItemSource.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
let PromptsServiceCustomizationItemProvider = class {
  constructor(promptsService, workspaceService, productService) {
    this.promptsService = promptsService;
    this.workspaceService = workspaceService;
    this.productService = productService;
    this.onDidChange = Event.any(
      this.promptsService.onDidChangeCustomAgents,
      this.promptsService.onDidChangeSlashCommands,
      this.promptsService.onDidChangeSkills,
      this.promptsService.onDidChangeHooks,
      this.promptsService.onDidChangeInstructions,
      this.promptsService.onDidChangeAgentInstructions
    );
  }
  async provideChatSessionCustomizations(_sessionResource, token) {
    const itemSets = await Promise.all([
      this.provideCustomizations(PromptsType.agent, token),
      this.provideCustomizations(PromptsType.skill, token),
      this.provideCustomizations(PromptsType.instructions, token),
      this.provideCustomizations(PromptsType.hook, token),
      this.provideCustomizations(PromptsType.prompt, token)
    ]);
    return itemSets.flat();
  }
  async provideCustomAgents(sessionResource, token) {
    const sessionType = getChatSessionType(sessionResource);
    const agents = await this.promptsService.getCustomAgents(token);
    return agents.filter((agent) => matchesSessionType(agent.sessionTypes, sessionType));
  }
  async provideSourceFolders(_sessionResource, type, _token) {
    const folders = await this.promptsService.getSourceFolders(type);
    return folders.map((folder) => ({
      uri: folder.uri,
      // Prefer the source-specific description (e.g. "Global (only used by
      // Copilot agents)") over the generic "User Data" label so personal
      // folders like ~/.copilot/skills read naturally. Only folders that
      // carry a source (currently skills) use this; others fall back.
      label: (folder.source !== void 0 ? getSourceDescription(folder.source) : void 0) ?? this.promptsService.getPromptLocationLabel(folder),
      source: folder.storage
    }));
  }
  async provideCustomizations(promptType, token = CancellationToken.None) {
    const items = [];
    const disabledUris = this.promptsService.getDisabledPromptFiles(promptType);
    const extensionInfoByUri = new ResourceMap();
    if (promptType === PromptsType.agent) {
      const agents = await this.promptsService.getCustomAgents(token);
      const allAgentFiles = await this.promptsService.listPromptFiles(PromptsType.agent, token);
      for (const file of allAgentFiles) {
        if (file.extension) {
          extensionInfoByUri.set(file.uri, { id: file.extension.identifier, displayName: file.extension.displayName });
        }
      }
      for (const agent of agents) {
        items.push({
          uri: agent.uri,
          type: promptType,
          name: agent.name,
          description: agent.description,
          source: agent.source.storage,
          enabled: agent.enabled,
          extensionId: agent.source.storage === PromptsStorage.extension ? agent.source.extensionId.value : void 0,
          pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : void 0,
          userInvocable: agent.visibility.userInvocable
        });
        if (agent.source.storage === PromptsStorage.extension && !extensionInfoByUri.has(agent.uri)) {
          extensionInfoByUri.set(agent.uri, { id: agent.source.extensionId });
        }
      }
    } else if (promptType === PromptsType.skill) {
      const skills = await this.promptsService.findAgentSkills(token);
      const allSkillFiles = await this.promptsService.listPromptFiles(PromptsType.skill, token);
      for (const file of allSkillFiles) {
        if (file.extension) {
          extensionInfoByUri.set(file.uri, { id: file.extension.identifier, displayName: file.extension.displayName });
        }
      }
      const uiIntegrations = this.workspaceService.getSkillUIIntegrations();
      const seenUris = new ResourceSet();
      for (const skill of skills || []) {
        const skillName = skill.name || basename(dirname(skill.uri)) || basename(skill.uri);
        seenUris.add(skill.uri);
        const skillFolderName = basename(dirname(skill.uri));
        const uiTooltip = uiIntegrations.get(skillFolderName);
        items.push({
          uri: skill.uri,
          type: promptType,
          name: skillName,
          description: skill.description,
          source: skill.storage,
          enabled: true,
          badge: uiTooltip ? localize("uiIntegrationBadge", "UI Integration") : void 0,
          badgeTooltip: uiTooltip,
          extensionId: skill.extension?.identifier.value,
          pluginUri: skill.pluginUri,
          pluginLabel: skill.pluginLabel,
          userInvocable: skill.userInvocable
        });
      }
      if (disabledUris.size > 0) {
        for (const file of allSkillFiles) {
          if (!seenUris.has(file.uri) && disabledUris.has(file.uri)) {
            const disabledName = file.name || basename(dirname(file.uri)) || basename(file.uri);
            const disabledFolderName = basename(dirname(file.uri));
            const uiTooltip = uiIntegrations.get(disabledFolderName);
            items.push({
              uri: file.uri,
              type: promptType,
              name: disabledName,
              description: file.description,
              source: file.storage,
              enabled: false,
              badge: uiTooltip ? localize("uiIntegrationBadge", "UI Integration") : void 0,
              badgeTooltip: uiTooltip,
              extensionId: file.extension?.identifier.value,
              pluginUri: file.pluginUri,
              pluginLabel: file.pluginLabel,
              userInvocable: false
            });
          }
        }
      }
    } else if (promptType === PromptsType.prompt) {
      const commands = await this.promptsService.getPromptSlashCommands(token);
      for (const command of commands) {
        if (command.type === PromptsType.skill) {
          continue;
        }
        items.push({
          uri: command.uri,
          type: promptType,
          name: command.name,
          description: command.description,
          source: command.storage,
          enabled: !disabledUris.has(command.uri),
          extensionId: command.extension?.identifier.value,
          pluginUri: command.pluginUri,
          pluginLabel: command.pluginLabel,
          userInvocable: command.userInvocable
        });
        if (command.extension) {
          extensionInfoByUri.set(command.uri, { id: command.extension.identifier, displayName: command.extension.displayName });
        }
      }
    } else if (promptType === PromptsType.hook) {
      await this.fetchPromptServiceHooks(items, disabledUris, promptType);
    } else {
      await this.fetchPromptServiceInstructions(items, extensionInfoByUri, disabledUris, promptType);
    }
    return this.applyBuiltinGroupKeys(items, extensionInfoByUri);
  }
  async fetchPromptServiceHooks(items, disabledUris, promptType) {
    const hookFiles = await this.promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None);
    for (const f of hookFiles) {
      items.push({
        uri: f.uri,
        type: promptType,
        name: f.name || getFriendlyName(basename(f.uri)),
        source: f.storage,
        enabled: !disabledUris.has(f.uri),
        extensionId: f.extension?.identifier.value,
        pluginUri: f.pluginUri,
        userInvocable: void 0
      });
    }
    const agents = !this.workspaceService.isSessionsWindow ? await this.promptsService.getCustomAgents(CancellationToken.None) : [];
    for (const agent of agents) {
      if (!agent.hooks || !agent.enabled) {
        continue;
      }
      for (const hookType of Object.values(HookType)) {
        const hookCommands = agent.hooks[hookType];
        if (!hookCommands || hookCommands.length === 0) {
          continue;
        }
        const hookMeta = HOOK_METADATA[hookType];
        for (let i = 0; i < hookCommands.length; i++) {
          const hook = hookCommands[i];
          const cmdLabel = formatHookCommandLabel(hook, OS);
          const truncatedCmd = cmdLabel.length > 60 ? cmdLabel.substring(0, 57) + "..." : cmdLabel;
          items.push({
            uri: agent.uri,
            type: promptType,
            name: hookMeta?.label ?? hookType,
            description: `${agent.name}: ${truncatedCmd || localize("hookUnset", "(unset)")}`,
            source: agent.source.storage,
            groupKey: "agents",
            enabled: !disabledUris.has(agent.uri),
            extensionId: agent.source.storage === PromptsStorage.extension ? agent.source.extensionId.value : void 0,
            pluginUri: agent.source.storage === PromptsStorage.plugin ? agent.source.pluginUri : void 0,
            userInvocable: void 0
          });
        }
      }
    }
  }
  async fetchPromptServiceInstructions(items, extensionInfoByUri, disabledUris, promptType) {
    const instructionFiles = await this.promptsService.getInstructionFiles(CancellationToken.None);
    for (const file of instructionFiles) {
      if (file.extension) {
        extensionInfoByUri.set(file.uri, { id: file.extension.identifier, displayName: file.extension.displayName });
      }
    }
    const agentInstructionFiles = await this.promptsService.listAgentInstructions(CancellationToken.None, void 0);
    const agentInstructionUris = new ResourceSet(agentInstructionFiles.map((f) => f.uri));
    for (const file of agentInstructionFiles) {
      const storage = PromptsStorage.local;
      const filename = basename(file.uri);
      items.push({
        uri: file.uri,
        type: promptType,
        name: filename,
        source: storage,
        groupKey: "agent-instructions",
        enabled: !disabledUris.has(file.uri),
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: void 0
      });
    }
    for (const { uri, pattern, name, description, storage, extension, pluginUri } of instructionFiles) {
      if (agentInstructionUris.has(uri)) {
        continue;
      }
      const friendlyName = getFriendlyName(name);
      if (pattern !== void 0) {
        const badge = pattern === "**" ? localize("alwaysAdded", "always added") : pattern;
        const badgeTooltip = pattern === "**" ? localize("alwaysAddedTooltip", "This instruction is automatically included in every interaction.") : localize("onContextTooltip", "This instruction is automatically included when files matching '{0}' are in context.", pattern);
        items.push({
          uri,
          type: promptType,
          name: friendlyName,
          badge,
          badgeTooltip,
          description,
          source: storage,
          groupKey: "context-instructions",
          enabled: !disabledUris.has(uri),
          extensionId: extension?.identifier.value,
          pluginUri,
          userInvocable: void 0
        });
      } else {
        items.push({
          uri,
          type: promptType,
          name: friendlyName,
          description,
          source: storage,
          groupKey: "on-demand-instructions",
          enabled: !disabledUris.has(uri),
          extensionId: extension?.identifier.value,
          pluginUri,
          userInvocable: void 0
        });
      }
    }
  }
  applyBuiltinGroupKeys(items, extensionInfoByUri) {
    return items.map((item) => {
      if (item.source !== AICustomizationSources.extension) {
        return item;
      }
      const extInfo = extensionInfoByUri.get(item.uri);
      if (!extInfo) {
        return item;
      }
      if (isChatExtensionItem(extInfo.id, this.productService)) {
        return {
          ...item,
          groupKey: item.groupKey ?? BUILTIN_STORAGE
        };
      }
      return {
        ...item,
        extensionLabel: extInfo.displayName || extInfo.id.value
      };
    });
  }
};
PromptsServiceCustomizationItemProvider = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, IAICustomizationWorkspaceService),
  __decorateParam(2, IProductService)
], PromptsServiceCustomizationItemProvider);
export {
  PromptsServiceCustomizationItemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxccHJvbXB0c1NlcnZpY2VDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSwgSE9PS19NRVRBREFUQSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IGZvcm1hdEhvb2tDb21tYW5kTGFiZWwgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tTY2hlbWEuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUsIGdldFNvdXJjZURlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tQWdlbnQsIElQcm9tcHRzU2VydmljZSwgbWF0Y2hlc1Nlc3Npb25UeXBlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkl0ZW0sIElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLCBJQ3VzdG9taXphdGlvblNvdXJjZUZvbGRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQlVJTFRJTl9TVE9SQUdFIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGdldEZyaWVuZGx5TmFtZSwgaXNDaGF0RXh0ZW5zaW9uSXRlbSB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uSXRlbVNvdXJjZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5cbi8qKlxuICogQWRhcHRzIHRoZSByaWNoIHByb21wdHNTZXJ2aWNlIG1vZGVsIHRvIHRoZSBzYW1lIHByb3ZpZGVyLXNoYXBlZCBpdGVtc1xuICogY29udHJpYnV0ZWQgYnkgZXh0ZXJuYWwgY3VzdG9taXphdGlvbiBwcm92aWRlcnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm9tcHRzU2VydmljZUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgaW1wbGVtZW50cyBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciB7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlID0gRXZlbnQuYW55KFxuXHRcdFx0dGhpcy5wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbUFnZW50cyxcblx0XHRcdHRoaXMucHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzLFxuXHRcdFx0dGhpcy5wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZVNraWxscyxcblx0XHRcdHRoaXMucHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VIb29rcyxcblx0XHRcdHRoaXMucHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VJbnN0cnVjdGlvbnMsXG5cdFx0XHR0aGlzLnByb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRJbnN0cnVjdGlvbnMsXG5cdFx0KTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ3VzdG9taXphdGlvbkl0ZW1bXT4ge1xuXHRcdGNvbnN0IGl0ZW1TZXRzID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5wcm92aWRlQ3VzdG9taXphdGlvbnMoUHJvbXB0c1R5cGUuYWdlbnQsIHRva2VuKSxcblx0XHRcdHRoaXMucHJvdmlkZUN1c3RvbWl6YXRpb25zKFByb21wdHNUeXBlLnNraWxsLCB0b2tlbiksXG5cdFx0XHR0aGlzLnByb3ZpZGVDdXN0b21pemF0aW9ucyhQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHRva2VuKSxcblx0XHRcdHRoaXMucHJvdmlkZUN1c3RvbWl6YXRpb25zKFByb21wdHNUeXBlLmhvb2ssIHRva2VuKSxcblx0XHRcdHRoaXMucHJvdmlkZUN1c3RvbWl6YXRpb25zKFByb21wdHNUeXBlLnByb21wdCwgdG9rZW4pLFxuXHRcdF0pO1xuXHRcdHJldHVybiBpdGVtU2V0cy5mbGF0KCk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlQ3VzdG9tQWdlbnRzKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21BZ2VudFtdPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBhZ2VudHMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyh0b2tlbik7XG5cdFx0cmV0dXJuIGFnZW50cy5maWx0ZXIoYWdlbnQgPT4gbWF0Y2hlc1Nlc3Npb25UeXBlKGFnZW50LnNlc3Npb25UeXBlcywgc2Vzc2lvblR5cGUpKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVTb3VyY2VGb2xkZXJzKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgdHlwZTogUHJvbXB0c1R5cGUsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyW10+IHtcblx0XHRjb25zdCBmb2xkZXJzID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5nZXRTb3VyY2VGb2xkZXJzKHR5cGUpO1xuXHRcdHJldHVybiBmb2xkZXJzLm1hcChmb2xkZXIgPT4gKHtcblx0XHRcdHVyaTogZm9sZGVyLnVyaSxcblx0XHRcdC8vIFByZWZlciB0aGUgc291cmNlLXNwZWNpZmljIGRlc2NyaXB0aW9uIChlLmcuIFwiR2xvYmFsIChvbmx5IHVzZWQgYnlcblx0XHRcdC8vIENvcGlsb3QgYWdlbnRzKVwiKSBvdmVyIHRoZSBnZW5lcmljIFwiVXNlciBEYXRhXCIgbGFiZWwgc28gcGVyc29uYWxcblx0XHRcdC8vIGZvbGRlcnMgbGlrZSB+Ly5jb3BpbG90L3NraWxscyByZWFkIG5hdHVyYWxseS4gT25seSBmb2xkZXJzIHRoYXRcblx0XHRcdC8vIGNhcnJ5IGEgc291cmNlIChjdXJyZW50bHkgc2tpbGxzKSB1c2UgdGhpczsgb3RoZXJzIGZhbGwgYmFjay5cblx0XHRcdGxhYmVsOiAoZm9sZGVyLnNvdXJjZSAhPT0gdW5kZWZpbmVkID8gZ2V0U291cmNlRGVzY3JpcHRpb24oZm9sZGVyLnNvdXJjZSkgOiB1bmRlZmluZWQpID8/IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0UHJvbXB0TG9jYXRpb25MYWJlbChmb2xkZXIpLFxuXHRcdFx0c291cmNlOiBmb2xkZXIuc3RvcmFnZVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvdmlkZUN1c3RvbWl6YXRpb25zKHByb21wdFR5cGU6IFByb21wdHNUeXBlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9taXphdGlvbkl0ZW1bXT4ge1xuXHRcdGNvbnN0IGl0ZW1zOiBJQ3VzdG9taXphdGlvbkl0ZW1bXSA9IFtdO1xuXHRcdGNvbnN0IGRpc2FibGVkVXJpcyA9IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0RGlzYWJsZWRQcm9tcHRGaWxlcyhwcm9tcHRUeXBlKTtcblx0XHRjb25zdCBleHRlbnNpb25JbmZvQnlVcmkgPSBuZXcgUmVzb3VyY2VNYXA8eyBpZDogRXh0ZW5zaW9uSWRlbnRpZmllcjsgZGlzcGxheU5hbWU/OiBzdHJpbmcgfT4oKTtcblxuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdFx0Y29uc3QgYWdlbnRzID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5nZXRDdXN0b21BZ2VudHModG9rZW4pO1xuXHRcdFx0Y29uc3QgYWxsQWdlbnRGaWxlcyA9IGF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmFnZW50LCB0b2tlbik7XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgYWxsQWdlbnRGaWxlcykge1xuXHRcdFx0XHRpZiAoZmlsZS5leHRlbnNpb24pIHtcblx0XHRcdFx0XHRleHRlbnNpb25JbmZvQnlVcmkuc2V0KGZpbGUudXJpLCB7IGlkOiBmaWxlLmV4dGVuc2lvbi5pZGVudGlmaWVyLCBkaXNwbGF5TmFtZTogZmlsZS5leHRlbnNpb24uZGlzcGxheU5hbWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnRzKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdHVyaTogYWdlbnQudXJpLFxuXHRcdFx0XHRcdHR5cGU6IHByb21wdFR5cGUsXG5cdFx0XHRcdFx0bmFtZTogYWdlbnQubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYWdlbnQuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0c291cmNlOiBhZ2VudC5zb3VyY2Uuc3RvcmFnZSxcblx0XHRcdFx0XHRlbmFibGVkOiBhZ2VudC5lbmFibGVkLFxuXHRcdFx0XHRcdGV4dGVuc2lvbklkOiBhZ2VudC5zb3VyY2Uuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uID8gYWdlbnQuc291cmNlLmV4dGVuc2lvbklkLnZhbHVlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBsdWdpblVyaTogYWdlbnQuc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbiA/IGFnZW50LnNvdXJjZS5wbHVnaW5VcmkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXNlckludm9jYWJsZTogYWdlbnQudmlzaWJpbGl0eS51c2VySW52b2NhYmxlXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoYWdlbnQuc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiAmJiAhZXh0ZW5zaW9uSW5mb0J5VXJpLmhhcyhhZ2VudC51cmkpKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSW5mb0J5VXJpLnNldChhZ2VudC51cmksIHsgaWQ6IGFnZW50LnNvdXJjZS5leHRlbnNpb25JZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdGNvbnN0IHNraWxscyA9IGF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UuZmluZEFnZW50U2tpbGxzKHRva2VuKTtcblx0XHRcdGNvbnN0IGFsbFNraWxsRmlsZXMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgdG9rZW4pO1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGFsbFNraWxsRmlsZXMpIHtcblx0XHRcdFx0aWYgKGZpbGUuZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSW5mb0J5VXJpLnNldChmaWxlLnVyaSwgeyBpZDogZmlsZS5leHRlbnNpb24uaWRlbnRpZmllciwgZGlzcGxheU5hbWU6IGZpbGUuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1aUludGVncmF0aW9ucyA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRTa2lsbFVJSW50ZWdyYXRpb25zKCk7XG5cdFx0XHRjb25zdCBzZWVuVXJpcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdFx0Zm9yIChjb25zdCBza2lsbCBvZiBza2lsbHMgfHwgW10pIHtcblx0XHRcdFx0Y29uc3Qgc2tpbGxOYW1lID0gc2tpbGwubmFtZSB8fCBiYXNlbmFtZShkaXJuYW1lKHNraWxsLnVyaSkpIHx8IGJhc2VuYW1lKHNraWxsLnVyaSk7XG5cdFx0XHRcdHNlZW5VcmlzLmFkZChza2lsbC51cmkpO1xuXHRcdFx0XHRjb25zdCBza2lsbEZvbGRlck5hbWUgPSBiYXNlbmFtZShkaXJuYW1lKHNraWxsLnVyaSkpO1xuXHRcdFx0XHRjb25zdCB1aVRvb2x0aXAgPSB1aUludGVncmF0aW9ucy5nZXQoc2tpbGxGb2xkZXJOYW1lKTtcblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0dXJpOiBza2lsbC51cmksXG5cdFx0XHRcdFx0dHlwZTogcHJvbXB0VHlwZSxcblx0XHRcdFx0XHRuYW1lOiBza2lsbE5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHNraWxsLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHNvdXJjZTogc2tpbGwuc3RvcmFnZSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGJhZGdlOiB1aVRvb2x0aXAgPyBsb2NhbGl6ZSgndWlJbnRlZ3JhdGlvbkJhZGdlJywgXCJVSSBJbnRlZ3JhdGlvblwiKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRiYWRnZVRvb2x0aXA6IHVpVG9vbHRpcCxcblx0XHRcdFx0XHRleHRlbnNpb25JZDogc2tpbGwuZXh0ZW5zaW9uPy5pZGVudGlmaWVyLnZhbHVlLFxuXHRcdFx0XHRcdHBsdWdpblVyaTogc2tpbGwucGx1Z2luVXJpLFxuXHRcdFx0XHRcdHBsdWdpbkxhYmVsOiBza2lsbC5wbHVnaW5MYWJlbCxcblx0XHRcdFx0XHR1c2VySW52b2NhYmxlOiBza2lsbC51c2VySW52b2NhYmxlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRpc2FibGVkVXJpcy5zaXplID4gMCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgYWxsU2tpbGxGaWxlcykge1xuXHRcdFx0XHRcdGlmICghc2VlblVyaXMuaGFzKGZpbGUudXJpKSAmJiBkaXNhYmxlZFVyaXMuaGFzKGZpbGUudXJpKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzYWJsZWROYW1lID0gZmlsZS5uYW1lIHx8IGJhc2VuYW1lKGRpcm5hbWUoZmlsZS51cmkpKSB8fCBiYXNlbmFtZShmaWxlLnVyaSk7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNhYmxlZEZvbGRlck5hbWUgPSBiYXNlbmFtZShkaXJuYW1lKGZpbGUudXJpKSk7XG5cdFx0XHRcdFx0XHRjb25zdCB1aVRvb2x0aXAgPSB1aUludGVncmF0aW9ucy5nZXQoZGlzYWJsZWRGb2xkZXJOYW1lKTtcblx0XHRcdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR1cmk6IGZpbGUudXJpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiBwcm9tcHRUeXBlLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBkaXNhYmxlZE5hbWUsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBmaWxlLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRzb3VyY2U6IGZpbGUuc3RvcmFnZSxcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdGJhZGdlOiB1aVRvb2x0aXAgPyBsb2NhbGl6ZSgndWlJbnRlZ3JhdGlvbkJhZGdlJywgXCJVSSBJbnRlZ3JhdGlvblwiKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0YmFkZ2VUb29sdGlwOiB1aVRvb2x0aXAsXG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbklkOiBmaWxlLmV4dGVuc2lvbj8uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdFx0XHRcdFx0cGx1Z2luVXJpOiBmaWxlLnBsdWdpblVyaSxcblx0XHRcdFx0XHRcdFx0cGx1Z2luTGFiZWw6IGZpbGUucGx1Z2luTGFiZWwsXG5cdFx0XHRcdFx0XHRcdHVzZXJJbnZvY2FibGU6IGZhbHNlXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCkge1xuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmdldFByb21wdFNsYXNoQ29tbWFuZHModG9rZW4pO1xuXHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmRzKSB7XG5cdFx0XHRcdGlmIChjb21tYW5kLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0dXJpOiBjb21tYW5kLnVyaSxcblx0XHRcdFx0XHR0eXBlOiBwcm9tcHRUeXBlLFxuXHRcdFx0XHRcdG5hbWU6IGNvbW1hbmQubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY29tbWFuZC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRzb3VyY2U6IGNvbW1hbmQuc3RvcmFnZSxcblx0XHRcdFx0XHRlbmFibGVkOiAhZGlzYWJsZWRVcmlzLmhhcyhjb21tYW5kLnVyaSksXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGNvbW1hbmQuZXh0ZW5zaW9uPy5pZGVudGlmaWVyLnZhbHVlLFxuXHRcdFx0XHRcdHBsdWdpblVyaTogY29tbWFuZC5wbHVnaW5VcmksXG5cdFx0XHRcdFx0cGx1Z2luTGFiZWw6IGNvbW1hbmQucGx1Z2luTGFiZWwsXG5cdFx0XHRcdFx0dXNlckludm9jYWJsZTogY29tbWFuZC51c2VySW52b2NhYmxlXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoY29tbWFuZC5leHRlbnNpb24pIHtcblx0XHRcdFx0XHRleHRlbnNpb25JbmZvQnlVcmkuc2V0KGNvbW1hbmQudXJpLCB7IGlkOiBjb21tYW5kLmV4dGVuc2lvbi5pZGVudGlmaWVyLCBkaXNwbGF5TmFtZTogY29tbWFuZC5leHRlbnNpb24uZGlzcGxheU5hbWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmhvb2spIHtcblx0XHRcdGF3YWl0IHRoaXMuZmV0Y2hQcm9tcHRTZXJ2aWNlSG9va3MoaXRlbXMsIGRpc2FibGVkVXJpcywgcHJvbXB0VHlwZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMuZmV0Y2hQcm9tcHRTZXJ2aWNlSW5zdHJ1Y3Rpb25zKGl0ZW1zLCBleHRlbnNpb25JbmZvQnlVcmksIGRpc2FibGVkVXJpcywgcHJvbXB0VHlwZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuYXBwbHlCdWlsdGluR3JvdXBLZXlzKGl0ZW1zLCBleHRlbnNpb25JbmZvQnlVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmZXRjaFByb21wdFNlcnZpY2VIb29rcyhpdGVtczogSUN1c3RvbWl6YXRpb25JdGVtW10sIGRpc2FibGVkVXJpczogUmVzb3VyY2VTZXQsIHByb21wdFR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaG9va0ZpbGVzID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaG9vaywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBOb24tcGx1Z2luIGhvb2tzOiByZXR1cm4gcmF3IGZpbGUgaXRlbXMgXHUyMDE0IGV4cGFuc2lvbiBpbnRvIGluZGl2aWR1YWxcblx0XHQvLyBob29rIGVudHJpZXMgaXMgaGFuZGxlZCBieSBJdGVtUHJvdmlkZXJJdGVtU291cmNlLmZldGNoSXRlbXMoKS5cblx0XHQvLyBQbHVnaW4gaG9va3M6IGFkZCBkaXJlY3RseSBhcy1pcyBzaW5jZSB0aGV5J3JlIHByZS1leHBhbmRlZCBieVxuXHRcdC8vIHBsdWdpbiBtYW5pZmVzdHMgYW5kIG11c3QgTk9UIGJlIHJlLXBhcnNlZCBieSBleHBhbmRIb29rRmlsZUl0ZW1zLlxuXHRcdGZvciAoY29uc3QgZiBvZiBob29rRmlsZXMpIHtcblx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHR1cmk6IGYudXJpLFxuXHRcdFx0XHR0eXBlOiBwcm9tcHRUeXBlLFxuXHRcdFx0XHRuYW1lOiBmLm5hbWUgfHwgZ2V0RnJpZW5kbHlOYW1lKGJhc2VuYW1lKGYudXJpKSksXG5cdFx0XHRcdHNvdXJjZTogZi5zdG9yYWdlLFxuXHRcdFx0XHRlbmFibGVkOiAhZGlzYWJsZWRVcmlzLmhhcyhmLnVyaSksXG5cdFx0XHRcdGV4dGVuc2lvbklkOiBmLmV4dGVuc2lvbj8uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdFx0cGx1Z2luVXJpOiBmLnBsdWdpblVyaSxcblx0XHRcdFx0dXNlckludm9jYWJsZTogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBBZ2VudC1lbWJlZGRlZCBob29rcyAobm90IGluIHNlc3Npb25zIHdpbmRvdykuXG5cdFx0Y29uc3QgYWdlbnRzID0gIXRoaXMud29ya3NwYWNlU2VydmljZS5pc1Nlc3Npb25zV2luZG93ID8gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgOiBbXTtcblx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIGFnZW50cykge1xuXHRcdFx0aWYgKCFhZ2VudC5ob29rcyB8fCAhYWdlbnQuZW5hYmxlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgaG9va1R5cGUgb2YgT2JqZWN0LnZhbHVlcyhIb29rVHlwZSkpIHtcblx0XHRcdFx0Y29uc3QgaG9va0NvbW1hbmRzID0gYWdlbnQuaG9va3NbaG9va1R5cGVdO1xuXHRcdFx0XHRpZiAoIWhvb2tDb21tYW5kcyB8fCBob29rQ29tbWFuZHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaG9va01ldGEgPSBIT09LX01FVEFEQVRBW2hvb2tUeXBlXTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBob29rQ29tbWFuZHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBob29rID0gaG9va0NvbW1hbmRzW2ldO1xuXHRcdFx0XHRcdGNvbnN0IGNtZExhYmVsID0gZm9ybWF0SG9va0NvbW1hbmRMYWJlbChob29rLCBPUyk7XG5cdFx0XHRcdFx0Y29uc3QgdHJ1bmNhdGVkQ21kID0gY21kTGFiZWwubGVuZ3RoID4gNjAgPyBjbWRMYWJlbC5zdWJzdHJpbmcoMCwgNTcpICsgJy4uLicgOiBjbWRMYWJlbDtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdHVyaTogYWdlbnQudXJpLFxuXHRcdFx0XHRcdFx0dHlwZTogcHJvbXB0VHlwZSxcblx0XHRcdFx0XHRcdG5hbWU6IGhvb2tNZXRhPy5sYWJlbCA/PyBob29rVHlwZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBgJHthZ2VudC5uYW1lfTogJHt0cnVuY2F0ZWRDbWQgfHwgbG9jYWxpemUoJ2hvb2tVbnNldCcsIFwiKHVuc2V0KVwiKX1gLFxuXHRcdFx0XHRcdFx0c291cmNlOiBhZ2VudC5zb3VyY2Uuc3RvcmFnZSxcblx0XHRcdFx0XHRcdGdyb3VwS2V5OiAnYWdlbnRzJyxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6ICFkaXNhYmxlZFVyaXMuaGFzKGFnZW50LnVyaSksXG5cdFx0XHRcdFx0XHRleHRlbnNpb25JZDogYWdlbnQuc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiA/IGFnZW50LnNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBsdWdpblVyaTogYWdlbnQuc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbiA/IGFnZW50LnNvdXJjZS5wbHVnaW5VcmkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR1c2VySW52b2NhYmxlOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZmV0Y2hQcm9tcHRTZXJ2aWNlSW5zdHJ1Y3Rpb25zKGl0ZW1zOiBJQ3VzdG9taXphdGlvbkl0ZW1bXSwgZXh0ZW5zaW9uSW5mb0J5VXJpOiBSZXNvdXJjZU1hcDx7IGlkOiBFeHRlbnNpb25JZGVudGlmaWVyOyBkaXNwbGF5TmFtZT86IHN0cmluZyB9PiwgZGlzYWJsZWRVcmlzOiBSZXNvdXJjZVNldCwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbnN0cnVjdGlvbkZpbGVzID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5nZXRJbnN0cnVjdGlvbkZpbGVzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBpbnN0cnVjdGlvbkZpbGVzKSB7XG5cdFx0XHRpZiAoZmlsZS5leHRlbnNpb24pIHtcblx0XHRcdFx0ZXh0ZW5zaW9uSW5mb0J5VXJpLnNldChmaWxlLnVyaSwgeyBpZDogZmlsZS5leHRlbnNpb24uaWRlbnRpZmllciwgZGlzcGxheU5hbWU6IGZpbGUuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBhZ2VudEluc3RydWN0aW9uRmlsZXMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmxpc3RBZ2VudEluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGFnZW50SW5zdHJ1Y3Rpb25VcmlzID0gbmV3IFJlc291cmNlU2V0KGFnZW50SW5zdHJ1Y3Rpb25GaWxlcy5tYXAoZiA9PiBmLnVyaSkpO1xuXG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGFnZW50SW5zdHJ1Y3Rpb25GaWxlcykge1xuXHRcdFx0Y29uc3Qgc3RvcmFnZSA9IFByb21wdHNTdG9yYWdlLmxvY2FsO1xuXHRcdFx0Y29uc3QgZmlsZW5hbWUgPSBiYXNlbmFtZShmaWxlLnVyaSk7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0dXJpOiBmaWxlLnVyaSxcblx0XHRcdFx0dHlwZTogcHJvbXB0VHlwZSxcblx0XHRcdFx0bmFtZTogZmlsZW5hbWUsXG5cdFx0XHRcdHNvdXJjZTogc3RvcmFnZSxcblx0XHRcdFx0Z3JvdXBLZXk6ICdhZ2VudC1pbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHRlbmFibGVkOiAhZGlzYWJsZWRVcmlzLmhhcyhmaWxlLnVyaSksXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2VySW52b2NhYmxlOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgeyB1cmksIHBhdHRlcm4sIG5hbWUsIGRlc2NyaXB0aW9uLCBzdG9yYWdlLCBleHRlbnNpb24sIHBsdWdpblVyaSB9IG9mIGluc3RydWN0aW9uRmlsZXMpIHtcblx0XHRcdGlmIChhZ2VudEluc3RydWN0aW9uVXJpcy5oYXModXJpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZnJpZW5kbHlOYW1lID0gZ2V0RnJpZW5kbHlOYW1lKG5hbWUpO1xuXG5cdFx0XHRpZiAocGF0dGVybiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGJhZGdlID0gcGF0dGVybiA9PT0gJyoqJ1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Fsd2F5c0FkZGVkJywgXCJhbHdheXMgYWRkZWRcIilcblx0XHRcdFx0XHQ6IHBhdHRlcm47XG5cdFx0XHRcdGNvbnN0IGJhZGdlVG9vbHRpcCA9IHBhdHRlcm4gPT09ICcqKidcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhbHdheXNBZGRlZFRvb2x0aXAnLCBcIlRoaXMgaW5zdHJ1Y3Rpb24gaXMgYXV0b21hdGljYWxseSBpbmNsdWRlZCBpbiBldmVyeSBpbnRlcmFjdGlvbi5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdvbkNvbnRleHRUb29sdGlwJywgXCJUaGlzIGluc3RydWN0aW9uIGlzIGF1dG9tYXRpY2FsbHkgaW5jbHVkZWQgd2hlbiBmaWxlcyBtYXRjaGluZyAnezB9JyBhcmUgaW4gY29udGV4dC5cIiwgcGF0dGVybik7XG5cdFx0XHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHR0eXBlOiBwcm9tcHRUeXBlLFxuXHRcdFx0XHRcdG5hbWU6IGZyaWVuZGx5TmFtZSxcblx0XHRcdFx0XHRiYWRnZSxcblx0XHRcdFx0XHRiYWRnZVRvb2x0aXAsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0c291cmNlOiBzdG9yYWdlLFxuXHRcdFx0XHRcdGdyb3VwS2V5OiAnY29udGV4dC1pbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHRcdGVuYWJsZWQ6ICFkaXNhYmxlZFVyaXMuaGFzKHVyaSksXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbj8uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdFx0XHRwbHVnaW5VcmksXG5cdFx0XHRcdFx0dXNlckludm9jYWJsZTogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdHR5cGU6IHByb21wdFR5cGUsXG5cdFx0XHRcdFx0bmFtZTogZnJpZW5kbHlOYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHNvdXJjZTogc3RvcmFnZSxcblx0XHRcdFx0XHRncm91cEtleTogJ29uLWRlbWFuZC1pbnN0cnVjdGlvbnMnLFxuXHRcdFx0XHRcdGVuYWJsZWQ6ICFkaXNhYmxlZFVyaXMuaGFzKHVyaSksXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbj8uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdFx0XHRwbHVnaW5VcmksXG5cdFx0XHRcdFx0dXNlckludm9jYWJsZTogdW5kZWZpbmVkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwbHlCdWlsdGluR3JvdXBLZXlzKGl0ZW1zOiBJQ3VzdG9taXphdGlvbkl0ZW1bXSwgZXh0ZW5zaW9uSW5mb0J5VXJpOiBSZXNvdXJjZU1hcDx7IGlkOiBFeHRlbnNpb25JZGVudGlmaWVyOyBkaXNwbGF5TmFtZT86IHN0cmluZyB9Pik6IElDdXN0b21pemF0aW9uSXRlbVtdIHtcblx0XHRyZXR1cm4gaXRlbXMubWFwKGl0ZW0gPT4ge1xuXHRcdFx0aWYgKGl0ZW0uc291cmNlICE9PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmV4dGVuc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4dEluZm8gPSBleHRlbnNpb25JbmZvQnlVcmkuZ2V0KGl0ZW0udXJpKTtcblx0XHRcdGlmICghZXh0SW5mbykge1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0NoYXRFeHRlbnNpb25JdGVtKGV4dEluZm8uaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UpKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uaXRlbSxcblx0XHRcdFx0XHRncm91cEtleTogaXRlbS5ncm91cEtleSA/PyBCVUlMVElOX1NUT1JBR0UsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5pdGVtLFxuXHRcdFx0XHRleHRlbnNpb25MYWJlbDogZXh0SW5mby5kaXNwbGF5TmFtZSB8fCBleHRJbmZvLmlkLnZhbHVlLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsVUFBVTtBQUVuQixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtDQUFrQyw4QkFBOEI7QUFDekUsU0FBUyxVQUFVLHFCQUFxQjtBQUN4QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGFBQWEsNEJBQTRCO0FBQ2xELFNBQXVCLGlCQUFpQixvQkFBb0Isc0JBQXNCO0FBRWxGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLDJCQUEyQjtBQUNyRCxTQUFTLDBCQUEwQjtBQU01QixJQUFNLDBDQUFOLE1BQW9GO0FBQUEsRUFJMUYsWUFDbUMsZ0JBQ2lCLGtCQUNqQixnQkFDakM7QUFIaUM7QUFDaUI7QUFDakI7QUFFbEMsU0FBSyxjQUFjLE1BQU07QUFBQSxNQUN4QixLQUFLLGVBQWU7QUFBQSxNQUNwQixLQUFLLGVBQWU7QUFBQSxNQUNwQixL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
