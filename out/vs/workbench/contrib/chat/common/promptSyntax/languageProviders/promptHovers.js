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
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { localize } from "../../../../../../nls.js";
import { ILanguageModelsService } from "../../languageModels.js";
import { ILanguageModelToolsService, isToolSet } from "../../tools/languageModelToolsService.js";
import { IChatModeService, isBuiltinChatMode } from "../../chatModes.js";
import { getPromptsTypeForLanguageId, PromptsType, Target } from "../promptTypes.js";
import { IPromptsService } from "../service/promptsService.js";
import { parseCommaSeparatedList, PromptHeaderAttributes } from "../promptFileParser.js";
import { ClaudeHeaderAttributes, getAttributeDefinition, getTarget, isVSCodeOrDefaultTarget, knownClaudeModels, knownClaudeTools } from "./promptFileAttributes.js";
import { HOOKS_BY_TARGET, HOOK_METADATA } from "../hookTypes.js";
import { HOOK_COMMAND_FIELD_DESCRIPTIONS } from "../hookSchema.js";
let PromptHoverProvider = class {
  constructor(promptsService, languageModelToolsService, languageModelsService, chatModeService) {
    this.promptsService = promptsService;
    this.languageModelToolsService = languageModelToolsService;
    this.languageModelsService = languageModelsService;
    this.chatModeService = chatModeService;
    /**
     * Debug display name for this provider.
     */
    this._debugDisplayName = "PromptHoverProvider";
  }
  createHover(contents, range) {
    return {
      contents: [new MarkdownString(contents)],
      range
    };
  }
  async provideHover(model, position, token, _context) {
    const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
    if (!promptType) {
      return void 0;
    }
    const promptAST = this.promptsService.getParsedPromptFile(model);
    const target = getTarget(promptType, promptAST.header ?? model.uri);
    if (promptAST.header?.range.containsPosition(position)) {
      return this.provideHeaderHover(position, promptType, promptAST.header, target);
    }
    if (promptAST.body?.range.containsPosition(position)) {
      return this.provideBodyHover(position, promptAST.body, target);
    }
    return void 0;
  }
  async provideBodyHover(position, body, target) {
    for (const ref of body.variableReferences) {
      if (ref.range.containsPosition(position)) {
        const toolName = ref.name;
        return this.getToolHoverByName(toolName, ref.range, target);
      }
    }
    return void 0;
  }
  async provideHeaderHover(position, promptType, header, target) {
    for (const attribute of header.attributes) {
      if (attribute.range.containsPosition(position)) {
        const description = getAttributeDefinition(attribute.key, promptType, target)?.description;
        if (description) {
          switch (attribute.key) {
            case PromptHeaderAttributes.model:
              return this.getModelHover(attribute, position, description, target);
            case PromptHeaderAttributes.tools:
            case ClaudeHeaderAttributes.disallowedTools:
              return this.getToolHover(attribute, position, description, target);
            case PromptHeaderAttributes.agent:
            case PromptHeaderAttributes.mode:
              return this.getAgentHover(attribute, position, description);
            case PromptHeaderAttributes.handOffs:
              return this.getHandsOffHover(attribute, position, target);
            case PromptHeaderAttributes.hooks:
              return this.getHooksHover(attribute, position, description, target);
            case PromptHeaderAttributes.infer:
              return this.createHover(description + "\n\n" + localize("promptHeader.attribute.infer.hover", "Deprecated: Use `user-invocable` and `disable-model-invocation` instead."), attribute.range);
            default:
              return this.createHover(description, attribute.range);
          }
        }
      }
    }
    return void 0;
  }
  getToolHover(node, position, baseMessage, target) {
    let value = node.value;
    if (value.type === "scalar") {
      value = parseCommaSeparatedList(value);
    }
    if (value.type === "sequence") {
      for (const toolName of value.items) {
        if (toolName.type === "scalar" && toolName.range.containsPosition(position)) {
          const description = this.getToolHoverByName(toolName.value, toolName.range, target);
          if (description) {
            return description;
          }
        }
      }
    }
    return this.createHover(baseMessage, node.range);
  }
  getToolHoverByName(toolName, range, target) {
    if (target === Target.Claude) {
      const description = knownClaudeTools.find((tool2) => tool2.name === toolName)?.description;
      if (description) {
        return this.createHover(description, range);
      }
      return void 0;
    }
    const tool = this.languageModelToolsService.getToolByFullReferenceName(toolName);
    if (tool !== void 0) {
      if (isToolSet(tool)) {
        return this.getToolsetHover(tool, range);
      } else {
        return this.createHover(tool.userDescription ?? tool.modelDescription, range);
      }
    }
    return void 0;
  }
  getToolsetHover(toolSet, range) {
    const lines = [];
    lines.push(localize("toolSetName", "ToolSet: {0}\n\n", toolSet.referenceName));
    if (toolSet.description) {
      lines.push(toolSet.description);
    }
    for (const tool of toolSet.getTools()) {
      lines.push(`- ${tool.toolReferenceName ?? tool.displayName}`);
    }
    return this.createHover(lines.join("\n"), range);
  }
  getModelHover(node, position, baseMessage, target) {
    if (target === Target.GitHubCopilot) {
      return this.createHover(baseMessage + "\n\n" + localize("promptHeader.agent.model.githubCopilot", "Note: This attribute is not used when target is github-copilot."), node.range);
    }
    const modelHoverContent = (modelName) => {
      const lines = [];
      lines.push(baseMessage + "\n");
      if (target === Target.Claude) {
        const claudeModel = knownClaudeModels.find((model) => model.name === modelName);
        if (!claudeModel) {
          return this.createHover(lines.join("\n"), node.range);
        }
        if (claudeModel.modelEquivalent) {
          lines.push(localize("claudeModelEquivalent", "Claude model `{0}` maps to the following model:\n", modelName));
          modelName = claudeModel.modelEquivalent;
        } else {
          lines.push(claudeModel.description);
          return this.createHover(lines.join("\n"), node.range);
        }
      }
      const result = this.languageModelsService.lookupLanguageModelByQualifiedName(modelName);
      if (result) {
        const meta = result.metadata;
        lines.push(localize("modelName", "- Name: {0}", meta.name));
        lines.push(localize("modelFamily", "- Family: {0}", meta.family));
        lines.push(localize("modelVendor", "- Vendor: {0}", meta.vendor));
        if (meta.tooltip) {
          lines.push("", "", meta.tooltip);
        }
        return this.createHover(lines.join("\n"), node.range);
      }
      return void 0;
    };
    if (node.value.type === "scalar") {
      const hover = modelHoverContent(node.value.value);
      if (hover) {
        return hover;
      }
    } else if (node.value.type === "sequence") {
      for (const item of node.value.items) {
        if (item.type === "scalar" && item.range.containsPosition(position)) {
          const hover = modelHoverContent(item.value);
          if (hover) {
            return hover;
          }
        }
      }
    }
    return this.createHover(baseMessage, node.range);
  }
  async getAgentHover(agentAttribute, position, baseMessage) {
    const lines = [];
    const value = agentAttribute.value;
    if (value.type === "scalar" && value.range.containsPosition(position)) {
      const agent = (await this.chatModeService.getLocalModes()).findModeByName(value.value);
      if (agent) {
        const description = agent.description.get() || (isBuiltinChatMode(agent) ? localize("promptHeader.prompt.agent.builtInDesc", "Built-in agent") : localize("promptHeader.prompt.agent.customDesc", "Custom agent"));
        lines.push(`\`${agent.name.get()}\`: ${description}`);
      }
    } else {
      const agents = await this.chatModeService.getLocalModes();
      lines.push(baseMessage);
      lines.push("");
      lines.push(localize("promptHeader.prompt.agent.builtin", "**Built-in agents:**"));
      for (const agent of agents.builtin) {
        lines.push(`- \`${agent.name.get()}\`: ${agent.description.get() || agent.label.get()}`);
      }
      if (agents.custom.length > 0) {
        lines.push("");
        lines.push(localize("promptHeader.prompt.agent.custom", "**Custom agents:**"));
        for (const agent of agents.custom) {
          const description = agent.description.get();
          lines.push(`- \`${agent.name.get()}\`: ${description || localize("promptHeader.prompt.agent.customDesc", "Custom agent")}`);
        }
      }
    }
    return this.createHover(lines.join("\n"), agentAttribute.range);
  }
  getHooksHover(attribute, position, baseMessage, target) {
    const value = attribute.value;
    if (value.type === "map") {
      const hooksByTarget = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];
      for (const prop of value.properties) {
        if (prop.key.range.containsPosition(position)) {
          const hookType = hooksByTarget[prop.key.value];
          if (hookType) {
            const meta = HOOK_METADATA[hookType];
            return this.createHover(`**${meta.label}**

${meta.description}`, prop.key.range);
          }
        }
        if (prop.value.type === "sequence") {
          const hover = this.getHookCommandItemHover(prop.value, position);
          if (hover) {
            return hover;
          }
        }
      }
    }
    return this.createHover(baseMessage, attribute.range);
  }
  /**
   * Recursively searches hook command items for hover information.
   * Handles both direct command objects and nested matcher format
   * (e.g., `{ matcher: "...", hooks: [{ type: command, ... }] }`).
   */
  getHookCommandItemHover(sequence, position) {
    for (const item of sequence.items) {
      if (item.type !== "map" || !item.range.containsPosition(position)) {
        continue;
      }
      const nestedHooks = item.properties.find((p) => p.key.value === "hooks");
      if (nestedHooks && nestedHooks.value.type === "sequence") {
        const hover = this.getHookCommandItemHover(nestedHooks.value, position);
        if (hover) {
          return hover;
        }
      }
      for (const field of item.properties) {
        if (field.key.range.containsPosition(position) || field.value.range.containsPosition(position)) {
          const desc = HOOK_COMMAND_FIELD_DESCRIPTIONS[field.key.value];
          if (desc) {
            return this.createHover(desc, field.key.range);
          }
        }
      }
    }
    return void 0;
  }
  getHandsOffHover(attribute, position, target) {
    const handoffsBaseMessage = getAttributeDefinition(PromptHeaderAttributes.handOffs, PromptsType.agent, target)?.description;
    if (!isVSCodeOrDefaultTarget(target)) {
      return this.createHover(handoffsBaseMessage + "\n\n" + localize("promptHeader.agent.handoffs.githubCopilot", "Note: This attribute is not used in GitHub Copilot or Claude targets."), attribute.range);
    }
    return this.createHover(handoffsBaseMessage, attribute.range);
  }
};
PromptHoverProvider = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, ILanguageModelToolsService),
  __decorateParam(2, ILanguageModelsService),
  __decorateParam(3, IChatModeService)
], PromptHoverProvider);
export {
  PromptHoverProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxsYW5ndWFnZVByb3ZpZGVyc1xccHJvbXB0SG92ZXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBIb3ZlciwgSG92ZXJDb250ZXh0LCBIb3ZlclByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBpc1Rvb2xTZXQsIElUb29sU2V0IH0gZnJvbSAnLi4vLi4vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVTZXJ2aWNlLCBpc0J1aWx0aW5DaGF0TW9kZSB9IGZyb20gJy4uLy4uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBnZXRQcm9tcHRzVHlwZUZvckxhbmd1YWdlSWQsIFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIZWFkZXJBdHRyaWJ1dGUsIElTZXF1ZW5jZVZhbHVlLCBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCwgUHJvbXB0Qm9keSwgUHJvbXB0SGVhZGVyLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzIH0gZnJvbSAnLi4vcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVIZWFkZXJBdHRyaWJ1dGVzLCBnZXRBdHRyaWJ1dGVEZWZpbml0aW9uLCBnZXRUYXJnZXQsIGlzVlNDb2RlT3JEZWZhdWx0VGFyZ2V0LCBrbm93bkNsYXVkZU1vZGVscywga25vd25DbGF1ZGVUb29scyB9IGZyb20gJy4vcHJvbXB0RmlsZUF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSE9PS1NfQllfVEFSR0VULCBIT09LX01FVEFEQVRBIH0gZnJvbSAnLi4vaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IEhPT0tfQ09NTUFORF9GSUVMRF9ERVNDUklQVElPTlMgfSBmcm9tICcuLi9ob29rU2NoZW1hLmpzJztcblxuZXhwb3J0IGNsYXNzIFByb21wdEhvdmVyUHJvdmlkZXIgaW1wbGVtZW50cyBIb3ZlclByb3ZpZGVyIHtcblx0LyoqXG5cdCAqIERlYnVnIGRpc3BsYXkgbmFtZSBmb3IgdGhpcyBwcm92aWRlci5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBfZGVidWdEaXNwbGF5TmFtZTogc3RyaW5nID0gJ1Byb21wdEhvdmVyUHJvdmlkZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1vZGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1vZGVTZXJ2aWNlOiBJQ2hhdE1vZGVTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlSG92ZXIoY29udGVudHM6IHN0cmluZywgcmFuZ2U6IFJhbmdlKTogSG92ZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50czogW25ldyBNYXJrZG93blN0cmluZyhjb250ZW50cyldLFxuXHRcdFx0cmFuZ2Vcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHByb3ZpZGVIb3Zlcihtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIF9jb250ZXh0PzogSG92ZXJDb250ZXh0KTogUHJvbWlzZTxIb3ZlciB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgcHJvbXB0VHlwZSA9IGdldFByb21wdHNUeXBlRm9yTGFuZ3VhZ2VJZChtb2RlbC5nZXRMYW5ndWFnZUlkKCkpO1xuXHRcdGlmICghcHJvbXB0VHlwZSkge1xuXHRcdFx0Ly8gaWYgdGhlIG1vZGVsIGlzIG5vdCBhIHByb21wdCwgd2UgZG9uJ3QgcHJvdmlkZSBhbnkgaG92ZXJzXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb21wdEFTVCA9IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0UGFyc2VkUHJvbXB0RmlsZShtb2RlbCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZ2V0VGFyZ2V0KHByb21wdFR5cGUsIHByb21wdEFTVC5oZWFkZXIgPz8gbW9kZWwudXJpKTtcblxuXHRcdGlmIChwcm9tcHRBU1QuaGVhZGVyPy5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZUhlYWRlckhvdmVyKHBvc2l0aW9uLCBwcm9tcHRUeXBlLCBwcm9tcHRBU1QuaGVhZGVyLCB0YXJnZXQpO1xuXHRcdH1cblx0XHRpZiAocHJvbXB0QVNULmJvZHk/LnJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcm92aWRlQm9keUhvdmVyKHBvc2l0aW9uLCBwcm9tcHRBU1QuYm9keSwgdGFyZ2V0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvdmlkZUJvZHlIb3Zlcihwb3NpdGlvbjogUG9zaXRpb24sIGJvZHk6IFByb21wdEJvZHksIHRhcmdldDogVGFyZ2V0KTogUHJvbWlzZTxIb3ZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdGZvciAoY29uc3QgcmVmIG9mIGJvZHkudmFyaWFibGVSZWZlcmVuY2VzKSB7XG5cdFx0XHRpZiAocmVmLnJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IHRvb2xOYW1lID0gcmVmLm5hbWU7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0VG9vbEhvdmVyQnlOYW1lKHRvb2xOYW1lLCByZWYucmFuZ2UsIHRhcmdldCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb3ZpZGVIZWFkZXJIb3Zlcihwb3NpdGlvbjogUG9zaXRpb24sIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBoZWFkZXI6IFByb21wdEhlYWRlciwgdGFyZ2V0OiBUYXJnZXQpOiBQcm9taXNlPEhvdmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Zm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgaGVhZGVyLmF0dHJpYnV0ZXMpIHtcblx0XHRcdGlmIChhdHRyaWJ1dGUucmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBnZXRBdHRyaWJ1dGVEZWZpbml0aW9uKGF0dHJpYnV0ZS5rZXksIHByb21wdFR5cGUsIHRhcmdldCk/LmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRzd2l0Y2ggKGF0dHJpYnV0ZS5rZXkpIHtcblx0XHRcdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlbDpcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0TW9kZWxIb3ZlcihhdHRyaWJ1dGUsIHBvc2l0aW9uLCBkZXNjcmlwdGlvbiwgdGFyZ2V0KTtcblx0XHRcdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29sczpcblx0XHRcdFx0XHRcdGNhc2UgQ2xhdWRlSGVhZGVyQXR0cmlidXRlcy5kaXNhbGxvd2VkVG9vbHM6XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmdldFRvb2xIb3ZlcihhdHRyaWJ1dGUsIHBvc2l0aW9uLCBkZXNjcmlwdGlvbiwgdGFyZ2V0KTtcblx0XHRcdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZ2VudDpcblx0XHRcdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlOlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRBZ2VudEhvdmVyKGF0dHJpYnV0ZSwgcG9zaXRpb24sIGRlc2NyaXB0aW9uKTtcblx0XHRcdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5oYW5kT2Zmczpcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0SGFuZHNPZmZIb3ZlcihhdHRyaWJ1dGUsIHBvc2l0aW9uLCB0YXJnZXQpO1xuXHRcdFx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmhvb2tzOlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRIb29rc0hvdmVyKGF0dHJpYnV0ZSwgcG9zaXRpb24sIGRlc2NyaXB0aW9uLCB0YXJnZXQpO1xuXHRcdFx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmluZmVyOlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihkZXNjcmlwdGlvbiArICdcXG5cXG4nICsgbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hdHRyaWJ1dGUuaW5mZXIuaG92ZXInLCAnRGVwcmVjYXRlZDogVXNlIGB1c2VyLWludm9jYWJsZWAgYW5kIGBkaXNhYmxlLW1vZGVsLWludm9jYXRpb25gIGluc3RlYWQuJyksIGF0dHJpYnV0ZS5yYW5nZSk7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihkZXNjcmlwdGlvbiwgYXR0cmlidXRlLnJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VG9vbEhvdmVyKG5vZGU6IElIZWFkZXJBdHRyaWJ1dGUsIHBvc2l0aW9uOiBQb3NpdGlvbiwgYmFzZU1lc3NhZ2U6IHN0cmluZywgdGFyZ2V0OiBUYXJnZXQpOiBIb3ZlciB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHZhbHVlID0gbm9kZS52YWx1ZTtcblx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdHZhbHVlID0gcGFyc2VDb21tYVNlcGFyYXRlZExpc3QodmFsdWUpO1xuXHRcdH1cblx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0Zm9yIChjb25zdCB0b29sTmFtZSBvZiB2YWx1ZS5pdGVtcykge1xuXHRcdFx0XHRpZiAodG9vbE5hbWUudHlwZSA9PT0gJ3NjYWxhcicgJiYgdG9vbE5hbWUucmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuZ2V0VG9vbEhvdmVyQnlOYW1lKHRvb2xOYW1lLnZhbHVlLCB0b29sTmFtZS5yYW5nZSwgdGFyZ2V0KTtcblx0XHRcdFx0XHRpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybiBkZXNjcmlwdGlvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIoYmFzZU1lc3NhZ2UsIG5vZGUucmFuZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUb29sSG92ZXJCeU5hbWUodG9vbE5hbWU6IHN0cmluZywgcmFuZ2U6IFJhbmdlLCB0YXJnZXQ6IFRhcmdldCk6IEhvdmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGtub3duQ2xhdWRlVG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gdG9vbE5hbWUpPy5kZXNjcmlwdGlvbjtcblx0XHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihkZXNjcmlwdGlvbiwgcmFuZ2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdG9vbCA9IHRoaXMubGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSh0b29sTmFtZSk7XG5cdFx0aWYgKHRvb2wgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKGlzVG9vbFNldCh0b29sKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRUb29sc2V0SG92ZXIodG9vbCwgcmFuZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIodG9vbC51c2VyRGVzY3JpcHRpb24gPz8gdG9vbC5tb2RlbERlc2NyaXB0aW9uLCByYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFRvb2xzZXRIb3Zlcih0b29sU2V0OiBJVG9vbFNldCwgcmFuZ2U6IFJhbmdlKTogSG92ZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ3Rvb2xTZXROYW1lJywgJ1Rvb2xTZXQ6IHswfVxcblxcbicsIHRvb2xTZXQucmVmZXJlbmNlTmFtZSkpO1xuXHRcdGlmICh0b29sU2V0LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRsaW5lcy5wdXNoKHRvb2xTZXQuZGVzY3JpcHRpb24pO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbFNldC5nZXRUb29scygpKSB7XG5cdFx0XHRsaW5lcy5wdXNoKGAtICR7dG9vbC50b29sUmVmZXJlbmNlTmFtZSA/PyB0b29sLmRpc3BsYXlOYW1lfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihsaW5lcy5qb2luKCdcXG4nKSwgcmFuZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb2RlbEhvdmVyKG5vZGU6IElIZWFkZXJBdHRyaWJ1dGUsIHBvc2l0aW9uOiBQb3NpdGlvbiwgYmFzZU1lc3NhZ2U6IHN0cmluZywgdGFyZ2V0OiBUYXJnZXQpOiBIb3ZlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkdpdEh1YkNvcGlsb3QpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGJhc2VNZXNzYWdlICsgJ1xcblxcbicgKyBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50Lm1vZGVsLmdpdGh1YkNvcGlsb3QnLCAnTm90ZTogVGhpcyBhdHRyaWJ1dGUgaXMgbm90IHVzZWQgd2hlbiB0YXJnZXQgaXMgZ2l0aHViLWNvcGlsb3QuJyksIG5vZGUucmFuZ2UpO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbEhvdmVyQ29udGVudCA9IChtb2RlbE5hbWU6IHN0cmluZyk6IEhvdmVyIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0bGluZXMucHVzaChiYXNlTWVzc2FnZSArICdcXG4nKTtcblxuXHRcdFx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdFx0XHRjb25zdCBjbGF1ZGVNb2RlbCA9IGtub3duQ2xhdWRlTW9kZWxzLmZpbmQobW9kZWwgPT4gbW9kZWwubmFtZSA9PT0gbW9kZWxOYW1lKTtcblx0XHRcdFx0aWYgKCFjbGF1ZGVNb2RlbCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGxpbmVzLmpvaW4oJ1xcbicpLCBub2RlLnJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2xhdWRlTW9kZWwubW9kZWxFcXVpdmFsZW50KSB7XG5cdFx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnY2xhdWRlTW9kZWxFcXVpdmFsZW50JywgJ0NsYXVkZSBtb2RlbCBgezB9YCBtYXBzIHRvIHRoZSBmb2xsb3dpbmcgbW9kZWw6XFxuJywgbW9kZWxOYW1lKSk7XG5cdFx0XHRcdFx0bW9kZWxOYW1lID0gY2xhdWRlTW9kZWwubW9kZWxFcXVpdmFsZW50O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxpbmVzLnB1c2goY2xhdWRlTW9kZWwuZGVzY3JpcHRpb24pO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGxpbmVzLmpvaW4oJ1xcbicpLCBub2RlLnJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsQnlRdWFsaWZpZWROYW1lKG1vZGVsTmFtZSk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvbnN0IG1ldGEgPSByZXN1bHQubWV0YWRhdGE7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ21vZGVsTmFtZScsICctIE5hbWU6IHswfScsIG1ldGEubmFtZSkpO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdtb2RlbEZhbWlseScsICctIEZhbWlseTogezB9JywgbWV0YS5mYW1pbHkpKTtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnbW9kZWxWZW5kb3InLCAnLSBWZW5kb3I6IHswfScsIG1ldGEudmVuZG9yKSk7XG5cdFx0XHRcdGlmIChtZXRhLnRvb2x0aXApIHtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKCcnLCAnJywgbWV0YS50b29sdGlwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihsaW5lcy5qb2luKCdcXG4nKSwgbm9kZS5yYW5nZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0aWYgKG5vZGUudmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdGNvbnN0IGhvdmVyID0gbW9kZWxIb3ZlckNvbnRlbnQobm9kZS52YWx1ZS52YWx1ZSk7XG5cdFx0XHRpZiAoaG92ZXIpIHtcblx0XHRcdFx0cmV0dXJuIGhvdmVyO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAobm9kZS52YWx1ZS50eXBlID09PSAnc2VxdWVuY2UnKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Ygbm9kZS52YWx1ZS5pdGVtcykge1xuXHRcdFx0XHRpZiAoaXRlbS50eXBlID09PSAnc2NhbGFyJyAmJiBpdGVtLnJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0Y29uc3QgaG92ZXIgPSBtb2RlbEhvdmVyQ29udGVudChpdGVtLnZhbHVlKTtcblx0XHRcdFx0XHRpZiAoaG92ZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBob3Zlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIoYmFzZU1lc3NhZ2UsIG5vZGUucmFuZ2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRBZ2VudEhvdmVyKGFnZW50QXR0cmlidXRlOiBJSGVhZGVyQXR0cmlidXRlLCBwb3NpdGlvbjogUG9zaXRpb24sIGJhc2VNZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPEhvdmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgdmFsdWUgPSBhZ2VudEF0dHJpYnV0ZS52YWx1ZTtcblx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NjYWxhcicgJiYgdmFsdWUucmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdGNvbnN0IGFnZW50ID0gKGF3YWl0IHRoaXMuY2hhdE1vZGVTZXJ2aWNlLmdldExvY2FsTW9kZXMoKSkuZmluZE1vZGVCeU5hbWUodmFsdWUudmFsdWUpO1xuXHRcdFx0aWYgKGFnZW50KSB7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYWdlbnQuZGVzY3JpcHRpb24uZ2V0KCkgfHwgKGlzQnVpbHRpbkNoYXRNb2RlKGFnZW50KSA/IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LmFnZW50LmJ1aWx0SW5EZXNjJywgJ0J1aWx0LWluIGFnZW50JykgOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5hZ2VudC5jdXN0b21EZXNjJywgJ0N1c3RvbSBhZ2VudCcpKTtcblx0XHRcdFx0bGluZXMucHVzaChgXFxgJHthZ2VudC5uYW1lLmdldCgpfVxcYDogJHtkZXNjcmlwdGlvbn1gKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYWdlbnRzID0gYXdhaXQgdGhpcy5jaGF0TW9kZVNlcnZpY2UuZ2V0TG9jYWxNb2RlcygpO1xuXHRcdFx0bGluZXMucHVzaChiYXNlTWVzc2FnZSk7XG5cdFx0XHRsaW5lcy5wdXNoKCcnKTtcblxuXHRcdFx0Ly8gQnVpbHQtaW4gYWdlbnRzXG5cdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LmFnZW50LmJ1aWx0aW4nLCAnKipCdWlsdC1pbiBhZ2VudHM6KionKSk7XG5cdFx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIGFnZW50cy5idWlsdGluKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2goYC0gXFxgJHthZ2VudC5uYW1lLmdldCgpfVxcYDogJHthZ2VudC5kZXNjcmlwdGlvbi5nZXQoKSB8fCBhZ2VudC5sYWJlbC5nZXQoKX1gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ3VzdG9tIGFnZW50c1xuXHRcdFx0aWYgKGFnZW50cy5jdXN0b20ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKCcnKTtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5hZ2VudC5jdXN0b20nLCAnKipDdXN0b20gYWdlbnRzOioqJykpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIGFnZW50cy5jdXN0b20pIHtcblx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGFnZW50LmRlc2NyaXB0aW9uLmdldCgpO1xuXHRcdFx0XHRcdGxpbmVzLnB1c2goYC0gXFxgJHthZ2VudC5uYW1lLmdldCgpfVxcYDogJHtkZXNjcmlwdGlvbiB8fCBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5hZ2VudC5jdXN0b21EZXNjJywgJ0N1c3RvbSBhZ2VudCcpfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGxpbmVzLmpvaW4oJ1xcbicpLCBhZ2VudEF0dHJpYnV0ZS5yYW5nZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEhvb2tzSG92ZXIoYXR0cmlidXRlOiBJSGVhZGVyQXR0cmlidXRlLCBwb3NpdGlvbjogUG9zaXRpb24sIGJhc2VNZXNzYWdlOiBzdHJpbmcsIHRhcmdldDogVGFyZ2V0KTogSG92ZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gYXR0cmlidXRlLnZhbHVlO1xuXHRcdGlmICh2YWx1ZS50eXBlID09PSAnbWFwJykge1xuXHRcdFx0Y29uc3QgaG9va3NCeVRhcmdldCA9IEhPT0tTX0JZX1RBUkdFVFt0YXJnZXRdID8/IEhPT0tTX0JZX1RBUkdFVFtUYXJnZXQuVW5kZWZpbmVkXTtcblx0XHRcdGZvciAoY29uc3QgcHJvcCBvZiB2YWx1ZS5wcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdC8vIEhvdmVyIG9uIGEgaG9vayBldmVudCBuYW1lIGtleSAoZS5nLiwgU2Vzc2lvblN0YXJ0LCBQcmVUb29sVXNlKVxuXHRcdFx0XHRpZiAocHJvcC5rZXkucmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0XHRjb25zdCBob29rVHlwZSA9IGhvb2tzQnlUYXJnZXRbcHJvcC5rZXkudmFsdWVdO1xuXHRcdFx0XHRcdGlmIChob29rVHlwZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWV0YSA9IEhPT0tfTUVUQURBVEFbaG9va1R5cGVdO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIoYCoqJHttZXRhLmxhYmVsfSoqXFxuXFxuJHttZXRhLmRlc2NyaXB0aW9ufWAsIHByb3Aua2V5LnJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSG92ZXIgaW5zaWRlIGhvb2sgY29tbWFuZCBlbnRyaWVzXG5cdFx0XHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgPT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdFx0XHRjb25zdCBob3ZlciA9IHRoaXMuZ2V0SG9va0NvbW1hbmRJdGVtSG92ZXIocHJvcC52YWx1ZSwgcG9zaXRpb24pO1xuXHRcdFx0XHRcdGlmIChob3Zlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGhvdmVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihiYXNlTWVzc2FnZSwgYXR0cmlidXRlLnJhbmdlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWN1cnNpdmVseSBzZWFyY2hlcyBob29rIGNvbW1hbmQgaXRlbXMgZm9yIGhvdmVyIGluZm9ybWF0aW9uLlxuXHQgKiBIYW5kbGVzIGJvdGggZGlyZWN0IGNvbW1hbmQgb2JqZWN0cyBhbmQgbmVzdGVkIG1hdGNoZXIgZm9ybWF0XG5cdCAqIChlLmcuLCBgeyBtYXRjaGVyOiBcIi4uLlwiLCBob29rczogW3sgdHlwZTogY29tbWFuZCwgLi4uIH1dIH1gKS5cblx0ICovXG5cdHByaXZhdGUgZ2V0SG9va0NvbW1hbmRJdGVtSG92ZXIoc2VxdWVuY2U6IElTZXF1ZW5jZVZhbHVlLCBwb3NpdGlvbjogUG9zaXRpb24pOiBIb3ZlciB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHNlcXVlbmNlLml0ZW1zKSB7XG5cdFx0XHRpZiAoaXRlbS50eXBlICE9PSAnbWFwJyB8fCAhaXRlbS5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIENoZWNrIGZvciBuZXN0ZWQgbWF0Y2hlciBmb3JtYXQ6IHsgaG9va3M6IFsuLi5dIH1cblx0XHRcdGNvbnN0IG5lc3RlZEhvb2tzID0gaXRlbS5wcm9wZXJ0aWVzLmZpbmQocCA9PiBwLmtleS52YWx1ZSA9PT0gJ2hvb2tzJyk7XG5cdFx0XHRpZiAobmVzdGVkSG9va3MgJiYgbmVzdGVkSG9va3MudmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRjb25zdCBob3ZlciA9IHRoaXMuZ2V0SG9va0NvbW1hbmRJdGVtSG92ZXIobmVzdGVkSG9va3MudmFsdWUsIHBvc2l0aW9uKTtcblx0XHRcdFx0aWYgKGhvdmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGhvdmVyO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBDaGVjayBmaWVsZHMgb2YgdGhlIGNvbW1hbmQgb2JqZWN0IGl0c2VsZlxuXHRcdFx0Zm9yIChjb25zdCBmaWVsZCBvZiBpdGVtLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0aWYgKGZpZWxkLmtleS5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSB8fCBmaWVsZC52YWx1ZS5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IGRlc2MgPSBIT09LX0NPTU1BTkRfRklFTERfREVTQ1JJUFRJT05TW2ZpZWxkLmtleS52YWx1ZV07XG5cdFx0XHRcdFx0aWYgKGRlc2MpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGRlc2MsIGZpZWxkLmtleS5yYW5nZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEhhbmRzT2ZmSG92ZXIoYXR0cmlidXRlOiBJSGVhZGVyQXR0cmlidXRlLCBwb3NpdGlvbjogUG9zaXRpb24sIHRhcmdldDogVGFyZ2V0KTogSG92ZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGhhbmRvZmZzQmFzZU1lc3NhZ2UgPSBnZXRBdHRyaWJ1dGVEZWZpbml0aW9uKFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaGFuZE9mZnMsIFByb21wdHNUeXBlLmFnZW50LCB0YXJnZXQpPy5kZXNjcmlwdGlvbiE7XG5cdFx0aWYgKCFpc1ZTQ29kZU9yRGVmYXVsdFRhcmdldCh0YXJnZXQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihoYW5kb2Zmc0Jhc2VNZXNzYWdlICsgJ1xcblxcbicgKyBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmhhbmRvZmZzLmdpdGh1YkNvcGlsb3QnLCAnTm90ZTogVGhpcyBhdHRyaWJ1dGUgaXMgbm90IHVzZWQgaW4gR2l0SHViIENvcGlsb3Qgb3IgQ2xhdWRlIHRhcmdldHMuJyksIGF0dHJpYnV0ZS5yYW5nZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGhhbmRvZmZzQmFzZU1lc3NhZ2UsIGF0dHJpYnV0ZS5yYW5nZSk7XG5cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHNCQUFzQjtBQUsvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDRCQUE0QixpQkFBMkI7QUFDaEUsU0FBUyxrQkFBa0IseUJBQXlCO0FBQ3BELFNBQVMsNkJBQTZCLGFBQWEsY0FBYztBQUNqRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUEyQyx5QkFBbUQsOEJBQThCO0FBQzVILFNBQVMsd0JBQXdCLHdCQUF3QixXQUFXLHlCQUF5QixtQkFBbUIsd0JBQXdCO0FBQ3hJLFNBQVMsaUJBQWlCLHFCQUFxQjtBQUMvQyxTQUFTLHVDQUF1QztBQUV6QyxJQUFNLHNCQUFOLE1BQW1EO0FBQUEsRUFNekQsWUFDbUMs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Z0JBQU0sUUFBUSxLQUFLLHdCQUF3QixLQUFLLE9BQU8sUUFBUTtBQUMvRCxjQUFJLE9BQU87QUFDVixtQkFBTztBQUFBLFVBQ1I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLEtBQUssWUFBWSxhQUFhLFVBQVUsS0FBSztBQUFBLEVBQ3JEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1Esd0JBQXdCLFVBQTBCLFVBQXVDO0FBQ2hHLGVBQVcsUUFBUSxTQUFTLE9BQU87QUFDbEMsVUFBSSxLQUFLLFNBQVMsU0FBUyxDQUFDLEtBQUssTUFBTSxpQkFBaUIsUUFBUSxHQUFHO0FBQ2xFO0FBQUEsTUFDRDtBQUVBLFlBQU0sY0FBYyxLQUFLLFdBQVcsS0FBSyxPQUFLLEVBQUUsSUFBSSxVQUFVLE9BQU87QUFDckUsVUFBSSxlQUFlLFlBQVksTUFBTSxTQUFTLFlBQVk7QUFDekQsY0FBTSxRQUFRLEtBQUssd0JBQXdCLFlBQVksT0FBTyxRQUFRO0FBQ3RFLFlBQUksT0FBTztBQUNWLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxTQUFTLEtBQUssWUFBWTtBQUNwQyxZQUFJLE1BQU0sSUFBSSxNQUFNLGlCQUFpQixRQUFRLEtBQUssTUFBTSxNQUFNLE1BQU0saUJBQWlCLFFBQVEsR0FBRztBQUMvRixnQkFBTSxPQUFPLGdDQUFnQyxNQUFNLElBQUksS0FBSztBQUM1RCxjQUFJLE1BQU07QUFDVCxtQkFBTyxLQUFLLFlBQVksTUFBTSxNQUFNLElBQUksS0FBSztBQUFBLFVBQzlDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGlCQUFpQixXQUE2QixVQUFvQixRQUFtQztBQUM1RyxVQUFNLHNCQUFzQix1QkFBdUIsdUJBQXVCLFVBQVUsWUFBWSxPQUFPLE1BQU0sR0FBRztBQUNoSCxRQUFJLENBQUMsd0JBQXdCLE1BQU0sR0FBRztBQUNyQyxhQUFPLEtBQUssWUFBWSxzQkFBc0IsU0FBUyxTQUFTLDZDQUE2Qyx1RUFBdUUsR0FBRyxVQUFVLEtBQUs7QUFBQSxJQUN2TTtBQUNBLFdBQU8sS0FBSyxZQUFZLHFCQUFxQixVQUFVLEtBQUs7QUFBQSxFQUU3RDtBQUNEO0FBeFJhLHNCQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbInRvb2wiXQp9Cg==
