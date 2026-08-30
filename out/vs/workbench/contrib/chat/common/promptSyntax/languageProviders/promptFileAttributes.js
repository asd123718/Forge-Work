import { dirname } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { SpecedToolAliases } from "../../tools/languageModelToolsService.js";
import { CLAUDE_AGENTS_SOURCE_FOLDER, isInClaudeRulesFolder } from "../config/promptFileLocations.js";
import { PromptHeaderAttributes } from "../promptFileParser.js";
import { PromptsType, Target } from "../promptTypes.js";
var GithubPromptHeaderAttributes;
((GithubPromptHeaderAttributes2) => {
  GithubPromptHeaderAttributes2.mcpServers = "mcp-servers";
  GithubPromptHeaderAttributes2.github = "github";
})(GithubPromptHeaderAttributes || (GithubPromptHeaderAttributes = {}));
var ClaudeHeaderAttributes;
((ClaudeHeaderAttributes2) => {
  ClaudeHeaderAttributes2.disallowedTools = "disallowedTools";
})(ClaudeHeaderAttributes || (ClaudeHeaderAttributes = {}));
function isTarget(value) {
  return value === Target.VSCode || value === Target.GitHubCopilot || value === Target.Claude || value === Target.Undefined;
}
const booleanAttributeEnumValues = [
  { name: "true" },
  { name: "false" }
];
const targetAttributeEnumValues = [
  { name: "vscode" },
  { name: "github-copilot" }
];
const promptFileAttributes = {
  [PromptHeaderAttributes.name]: {
    type: "scalar",
    description: localize("promptHeader.prompt.name", "The name of the prompt. This is also the name of the slash command that will run this prompt.")
  },
  [PromptHeaderAttributes.description]: {
    type: "scalar",
    description: localize("promptHeader.prompt.description", "The description of the reusable prompt, what it does and when to use it.")
  },
  [PromptHeaderAttributes.argumentHint]: {
    type: "scalar",
    description: localize("promptHeader.prompt.argumentHint", "The argument-hint describes what inputs the prompt expects or supports.")
  },
  [PromptHeaderAttributes.model]: {
    type: "scalar | sequence",
    description: localize("promptHeader.prompt.model", "The model to use in this prompt. Can also be a list of models. The first available model will be used.")
  },
  [PromptHeaderAttributes.tools]: {
    type: "scalar | sequence",
    description: localize("promptHeader.prompt.tools", "The tools to use in this prompt."),
    defaults: ["[]", "['search', 'edit', 'web']"]
  },
  [PromptHeaderAttributes.agent]: {
    type: "scalar",
    description: localize("promptHeader.prompt.agent.description", "The agent to use when running this prompt.")
  },
  [PromptHeaderAttributes.mode]: {
    type: "scalar",
    description: localize("promptHeader.prompt.agent.description", "The agent to use when running this prompt.")
  }
};
const instructionAttributes = {
  [PromptHeaderAttributes.name]: {
    type: "scalar",
    description: localize("promptHeader.instructions.name", "The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.")
  },
  [PromptHeaderAttributes.description]: {
    type: "scalar",
    description: localize("promptHeader.instructions.description", "The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.")
  },
  [PromptHeaderAttributes.applyTo]: {
    type: "scalar",
    description: localize("promptHeader.instructions.applyToRange", "One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: `**/*.ts`, `**/*.js`, `client/**`"),
    defaults: [
      "'**'",
      "'**/*.ts, **/*.js'",
      "'**/*.php'",
      "'**/*.py'"
    ]
  },
  [PromptHeaderAttributes.excludeAgent]: {
    type: "scalar | sequence",
    description: localize("promptHeader.instructions.excludeAgent", "One or more agents to exclude from using this instruction file.")
  }
};
const customAgentAttributes = {
  [PromptHeaderAttributes.name]: {
    type: "scalar",
    description: localize("promptHeader.agent.name", "The name of the agent as shown in the UI.")
  },
  [PromptHeaderAttributes.description]: {
    type: "scalar",
    description: localize("promptHeader.agent.description", "The description of the custom agent, what it does and when to use it.")
  },
  [PromptHeaderAttributes.argumentHint]: {
    type: "scalar",
    description: localize("promptHeader.agent.argumentHint", "The argument-hint describes what inputs the custom agent expects or supports.")
  },
  [PromptHeaderAttributes.model]: {
    type: "scalar | sequence",
    description: localize("promptHeader.agent.model", "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.")
  },
  [PromptHeaderAttributes.tools]: {
    type: "scalar | sequence",
    description: localize("promptHeader.agent.tools", "The set of tools that the custom agent has access to."),
    defaults: ["[]", "[search, edit, web]"]
  },
  [PromptHeaderAttributes.handOffs]: {
    type: "sequence",
    description: localize("promptHeader.agent.handoffs", "Possible handoff actions when the agent has completed its task.")
  },
  [PromptHeaderAttributes.target]: {
    type: "scalar",
    description: localize("promptHeader.agent.target", "The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`."),
    enums: targetAttributeEnumValues
  },
  [PromptHeaderAttributes.infer]: {
    type: "scalar",
    description: localize("promptHeader.agent.infer", "Controls visibility of the agent."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.agents]: {
    type: "sequence",
    description: localize("promptHeader.agent.agents", "One or more agents that this agent can use as subagents. Use '*' to specify all available agents."),
    defaults: ['["*"]']
  },
  [PromptHeaderAttributes.userInvocable]: {
    type: "scalar",
    description: localize("promptHeader.agent.userInvocable", "Whether the agent can be selected and invoked by users in the UI."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.disableModelInvocation]: {
    type: "scalar",
    description: localize("promptHeader.agent.disableModelInvocation", "If true, prevents the agent from being invoked as a subagent."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.advancedOptions]: {
    type: "map",
    description: localize("promptHeader.agent.advancedOptions", "Advanced options for custom agent behavior.")
  },
  [GithubPromptHeaderAttributes.github]: {
    type: "map",
    description: localize("promptHeader.agent.github", "GitHub-specific configuration for the agent, such as token permissions.")
  },
  [PromptHeaderAttributes.hooks]: {
    type: "map",
    description: localize("promptHeader.agent.hooks", "Lifecycle hooks scoped to this agent. Define hooks that run only while this agent is active.")
  }
};
const skillAttributes = {
  [PromptHeaderAttributes.name]: {
    type: "scalar",
    description: localize("promptHeader.skill.name", "The name of the skill.")
  },
  [PromptHeaderAttributes.description]: {
    type: "scalar",
    description: localize("promptHeader.skill.description", "The description of the skill. The description is added to every request and will be used by the agent to decide when to load the skill.")
  },
  [PromptHeaderAttributes.argumentHint]: {
    type: "scalar",
    description: localize("promptHeader.skill.argumentHint", "Hint shown during autocomplete to indicate expected arguments. Example: [issue-number] or [filename] [format]")
  },
  [PromptHeaderAttributes.userInvocable]: {
    type: "scalar",
    description: localize("promptHeader.skill.userInvocable", "Set to false to hide from the / menu. Use for background knowledge users should not invoke directly. Default: true."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.disableModelInvocation]: {
    type: "scalar",
    description: localize("promptHeader.skill.disableModelInvocation", "Set to true to prevent the agent from automatically loading this skill. Use for workflows you want to trigger manually with /name. Default: false."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.license]: {
    type: "scalar | map",
    description: localize("promptHeader.skill.license", "License information for the skill.")
  },
  [PromptHeaderAttributes.compatibility]: {
    type: "scalar | map",
    description: localize("promptHeader.skill.compatibility", "Compatibility metadata for environments or runtimes.")
  },
  [PromptHeaderAttributes.metadata]: {
    type: "map",
    description: localize("promptHeader.skill.metadata", "Additional metadata for the skill.")
  },
  [PromptHeaderAttributes.context]: {
    type: "scalar",
    description: localize("promptHeader.skill.context", "Controls how the skill is loaded. Set to 'fork' to spawn a subagent with the skill instructions instead of returning them inline."),
    enums: [{ name: "fork", description: localize("promptHeader.skill.context.fork", "Spawn a subagent with the skill instructions injected as system context.") }]
  }
};
const allAttributeNames = {
  [PromptsType.prompt]: Object.keys(promptFileAttributes),
  [PromptsType.instructions]: Object.keys(instructionAttributes),
  [PromptsType.agent]: Object.keys(customAgentAttributes),
  [PromptsType.skill]: Object.keys(skillAttributes),
  [PromptsType.hook]: []
  // hooks are JSON files, not markdown with YAML frontmatter
};
const githubCopilotAgentAttributeNames = [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.tools, PromptHeaderAttributes.target, GithubPromptHeaderAttributes.mcpServers, GithubPromptHeaderAttributes.github, PromptHeaderAttributes.infer];
const recommendedAttributeNames = {
  [PromptsType.prompt]: allAttributeNames[PromptsType.prompt].filter((name) => !isNonRecommendedAttribute(name)),
  [PromptsType.instructions]: allAttributeNames[PromptsType.instructions].filter((name) => !isNonRecommendedAttribute(name)),
  [PromptsType.agent]: allAttributeNames[PromptsType.agent].filter((name) => !isNonRecommendedAttribute(name)),
  [PromptsType.skill]: allAttributeNames[PromptsType.skill].filter((name) => !isNonRecommendedAttribute(name)),
  [PromptsType.hook]: []
  // hooks are JSON files, not markdown with YAML frontmatter
};
function getValidAttributeNames(promptType, includeNonRecommended, target) {
  if (target === Target.Claude) {
    if (promptType === PromptsType.instructions) {
      return Object.keys(claudeRulesAttributes);
    }
    return Object.keys(claudeAgentAttributes);
  } else if (target === Target.GitHubCopilot) {
    if (promptType === PromptsType.agent) {
      return githubCopilotAgentAttributeNames;
    }
  }
  return includeNonRecommended ? allAttributeNames[promptType] : recommendedAttributeNames[promptType];
}
function isNonRecommendedAttribute(attributeName) {
  return attributeName === PromptHeaderAttributes.advancedOptions || attributeName === PromptHeaderAttributes.excludeAgent || attributeName === PromptHeaderAttributes.mode || attributeName === PromptHeaderAttributes.infer;
}
function getAttributeDefinition(attributeName, promptType, target) {
  switch (promptType) {
    case PromptsType.instructions:
      if (target === Target.Claude) {
        return claudeRulesAttributes[attributeName];
      }
      return instructionAttributes[attributeName];
    case PromptsType.skill:
      return skillAttributes[attributeName];
    case PromptsType.agent:
      if (target === Target.Claude) {
        return claudeAgentAttributes[attributeName];
      }
      return customAgentAttributes[attributeName];
    case PromptsType.prompt:
      return promptFileAttributes[attributeName];
    default:
      return void 0;
  }
}
const knownGithubCopilotTools = [
  { name: SpecedToolAliases.execute, description: localize("githubCopilot.execute", "Execute commands") },
  { name: SpecedToolAliases.read, description: localize("githubCopilot.read", "Read files") },
  { name: SpecedToolAliases.edit, description: localize("githubCopilot.edit", "Edit files") },
  { name: SpecedToolAliases.search, description: localize("githubCopilot.search", "Search files") },
  { name: SpecedToolAliases.agent, description: localize("githubCopilot.agent", "Use subagents") }
];
const knownClaudeTools = [
  { name: "Bash", description: localize("claude.bash", "Execute shell commands"), toolEquivalent: [SpecedToolAliases.execute] },
  { name: "Edit", description: localize("claude.edit", "Make targeted file edits"), toolEquivalent: ["edit/editNotebook", "edit/editFiles"] },
  { name: "Glob", description: localize("claude.glob", "Find files by pattern"), toolEquivalent: ["search/fileSearch"] },
  { name: "Grep", description: localize("claude.grep", "Search file contents with regex"), toolEquivalent: ["search/textSearch"] },
  { name: "Read", description: localize("claude.read", "Read file contents"), toolEquivalent: ["read/readFile", "read/getNotebookSummary"] },
  { name: "Write", description: localize("claude.write", "Create/overwrite files"), toolEquivalent: ["edit/createDirectory", "edit/createFile", "edit/createJupyterNotebook"] },
  { name: "WebFetch", description: localize("claude.webFetch", "Fetch URL content"), toolEquivalent: [SpecedToolAliases.web] },
  { name: "WebSearch", description: localize("claude.webSearch", "Perform web searches"), toolEquivalent: [SpecedToolAliases.web] },
  { name: "Task", description: localize("claude.task", "Run subagents for complex tasks"), toolEquivalent: [SpecedToolAliases.agent] },
  { name: "Skill", description: localize("claude.skill", "Execute skills"), toolEquivalent: [] },
  { name: "LSP", description: localize("claude.lsp", "Code intelligence (requires plugin)"), toolEquivalent: [] },
  { name: "NotebookEdit", description: localize("claude.notebookEdit", "Modify Jupyter notebooks"), toolEquivalent: ["edit/editNotebook"] },
  { name: "AskUserQuestion", description: localize("claude.askUserQuestion", "Ask multiple-choice questions"), toolEquivalent: ["vscode/askQuestions"] },
  { name: "MCPSearch", description: localize("claude.mcpSearch", "Searches for MCP tools when tool search is enabled"), toolEquivalent: [] }
];
const knownClaudeModels = [
  { name: "sonnet", description: localize("claude.sonnet", "Latest Claude Sonnet"), modelEquivalent: "Claude Sonnet 4.5 (copilot)" },
  { name: "opus", description: localize("claude.opus", "Latest Claude Opus"), modelEquivalent: "Claude Opus 4.6 (copilot)" },
  { name: "haiku", description: localize("claude.haiku", "Latest Claude Haiku, fast for simple tasks"), modelEquivalent: "Claude Haiku 4.5 (copilot)" },
  { name: "inherit", description: localize("claude.inherit", "Inherit model from parent agent or prompt"), modelEquivalent: void 0 }
];
function mapClaudeModels(claudeModelNames) {
  const result = [];
  for (const name of claudeModelNames) {
    const claudeModel = knownClaudeModels.find((model) => model.name === name);
    if (claudeModel && claudeModel.modelEquivalent) {
      result.push(claudeModel.modelEquivalent);
    }
  }
  return result;
}
function mapClaudeTools(claudeToolNames) {
  const result = [];
  for (const name of claudeToolNames) {
    const claudeTool = knownClaudeTools.find((tool) => tool.name === name);
    if (claudeTool) {
      result.push(...claudeTool.toolEquivalent);
    }
  }
  return result;
}
const claudeAgentAttributes = {
  "name": {
    type: "scalar",
    description: localize("attribute.name", "Unique identifier using lowercase letters and hyphens (required)")
  },
  "description": {
    type: "scalar",
    description: localize("attribute.description", "When to delegate to this subagent (required)")
  },
  "tools": {
    type: "sequence",
    description: localize("attribute.tools", "Array of tools the subagent can use. Inherits all tools if omitted"),
    defaults: ["Read, Edit, Bash"],
    items: knownClaudeTools
  },
  "disallowedTools": {
    type: "sequence",
    description: localize("attribute.disallowedTools", "Tools to deny, removed from inherited or specified list"),
    defaults: ["Write, Edit, Bash"],
    items: knownClaudeTools
  },
  "model": {
    type: "scalar",
    description: localize("attribute.model", "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit."),
    defaults: ["sonnet", "opus", "haiku", "inherit"],
    enums: knownClaudeModels
  },
  "permissionMode": {
    type: "scalar",
    description: localize("attribute.permissionMode", "Permission mode: default, acceptEdits, dontAsk, bypassPermissions, or plan."),
    defaults: ["default", "acceptEdits", "dontAsk", "bypassPermissions", "plan"],
    enums: [
      { name: "default", description: localize("claude.permissionMode.default", "Standard behavior: prompts for permission on first use of each tool.") },
      { name: "acceptEdits", description: localize("claude.permissionMode.acceptEdits", "Automatically accepts file edit permissions for the session.") },
      { name: "plan", description: localize("claude.permissionMode.plan", "Plan Mode: Claude can analyze but not modify files or execute commands.") },
      { name: "delegate", description: localize("claude.permissionMode.delegate", "Coordination-only mode for agent team leads. Only available when an agent team is active.") },
      { name: "dontAsk", description: localize("claude.permissionMode.dontAsk", "Auto-denies tools unless pre-approved via /permissions or permissions.allow rules.") },
      { name: "bypassPermissions", description: localize("claude.permissionMode.bypassPermissions", "Skips all permission prompts (requires safe environment like containers).") }
    ]
  },
  "skills": {
    type: "sequence",
    description: localize("attribute.skills", "Skills to load into the subagent's context at startup.")
  },
  "mcpServers": {
    type: "sequence",
    description: localize("attribute.mcpServers", "MCP servers available to this subagent.")
  },
  "hooks": {
    type: "object",
    description: localize("attribute.hooks", "Lifecycle hooks scoped to this subagent.")
  },
  "memory": {
    type: "scalar",
    description: localize("attribute.memory", "Persistent memory scope: user, project, or local. Enables cross-session learning."),
    defaults: ["user", "project", "local"],
    enums: [
      { name: "user", description: localize("claude.memory.user", "Remember learnings across all projects.") },
      { name: "project", description: localize("claude.memory.project", "The subagent's knowledge is project-specific and shareable via version control.") },
      { name: "local", description: localize("claude.memory.local", "The subagent's knowledge is project-specific but should not be checked into version control.") }
    ]
  }
};
const claudeRulesAttributes = {
  "description": {
    type: "scalar",
    description: localize("attribute.rules.description", "A description of what this rule covers, used to provide context about when it applies.")
  },
  "paths": {
    type: "sequence",
    description: localize("attribute.rules.paths", "Array of glob patterns that describe for which files the rule applies. Based on these patterns, the file is automatically included in the prompt when the context contains a file that matches.\nExample: `['src/**/*.ts', 'test/**']`")
  }
};
function isVSCodeOrDefaultTarget(target) {
  return target === Target.VSCode || target === Target.Undefined;
}
function getTarget(promptType, header) {
  const uri = header instanceof URI ? header : header.uri;
  if (promptType === PromptsType.agent) {
    const parentDir = dirname(uri);
    if (parentDir.path.endsWith(`/${CLAUDE_AGENTS_SOURCE_FOLDER}`)) {
      return Target.Claude;
    }
    if (!(header instanceof URI)) {
      const target = header.target;
      if (target === Target.GitHubCopilot || target === Target.VSCode) {
        return target;
      }
    }
    return Target.Undefined;
  } else if (promptType === PromptsType.instructions) {
    if (isInClaudeRulesFolder(uri)) {
      return Target.Claude;
    }
  }
  return Target.Undefined;
}
export {
  ClaudeHeaderAttributes,
  GithubPromptHeaderAttributes,
  claudeAgentAttributes,
  claudeRulesAttributes,
  customAgentAttributes,
  getAttributeDefinition,
  getTarget,
  getValidAttributeNames,
  instructionAttributes,
  isNonRecommendedAttribute,
  isTarget,
  isVSCodeOrDefaultTarget,
  knownClaudeModels,
  knownClaudeTools,
  knownGithubCopilotTools,
  mapClaudeModels,
  mapClaudeTools,
  promptFileAttributes,
  skillAttributes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxsYW5ndWFnZVByb3ZpZGVyc1xccHJvbXB0RmlsZUF0dHJpYnV0ZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBTcGVjZWRUb29sQWxpYXNlcyB9IGZyb20gJy4uLy4uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0xBVURFX0FHRU5UU19TT1VSQ0VfRk9MREVSLCBpc0luQ2xhdWRlUnVsZXNGb2xkZXIgfSBmcm9tICcuLi9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRIZWFkZXIsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMgfSBmcm9tICcuLi9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi9wcm9tcHRUeXBlcy5qcyc7XG5cbmV4cG9ydCBuYW1lc3BhY2UgR2l0aHViUHJvbXB0SGVhZGVyQXR0cmlidXRlcyB7XG5cdGV4cG9ydCBjb25zdCBtY3BTZXJ2ZXJzID0gJ21jcC1zZXJ2ZXJzJztcblx0ZXhwb3J0IGNvbnN0IGdpdGh1YiA9ICdnaXRodWInO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIENsYXVkZUhlYWRlckF0dHJpYnV0ZXMge1xuXHRleHBvcnQgY29uc3QgZGlzYWxsb3dlZFRvb2xzID0gJ2Rpc2FsbG93ZWRUb29scyc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1RhcmdldCh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFRhcmdldCB7XG5cdHJldHVybiB2YWx1ZSA9PT0gVGFyZ2V0LlZTQ29kZSB8fCB2YWx1ZSA9PT0gVGFyZ2V0LkdpdEh1YkNvcGlsb3QgfHwgdmFsdWUgPT09IFRhcmdldC5DbGF1ZGUgfHwgdmFsdWUgPT09IFRhcmdldC5VbmRlZmluZWQ7XG59XG5cblxuaW50ZXJmYWNlIElBdHRyaWJ1dGVEZWZpbml0aW9uIHtcblx0cmVhZG9ubHkgdHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRyZWFkb25seSBkZWZhdWx0cz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBpdGVtcz86IHJlYWRvbmx5IHsgbmFtZTogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZyB9W107XG5cdHJlYWRvbmx5IGVudW1zPzogcmVhZG9ubHkgeyBuYW1lOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH1bXTtcbn1cblxuY29uc3QgYm9vbGVhbkF0dHJpYnV0ZUVudW1WYWx1ZXM6IHJlYWRvbmx5IElWYWx1ZUVudHJ5W10gPSBbXG5cdHsgbmFtZTogJ3RydWUnIH0sXG5cdHsgbmFtZTogJ2ZhbHNlJyB9XG5dO1xuXG5jb25zdCB0YXJnZXRBdHRyaWJ1dGVFbnVtVmFsdWVzOiByZWFkb25seSBJVmFsdWVFbnRyeVtdID0gW1xuXHR7IG5hbWU6ICd2c2NvZGUnIH0sXG5cdHsgbmFtZTogJ2dpdGh1Yi1jb3BpbG90JyB9LFxuXTtcblxuLy8gQXR0cmlidXRlIG1ldGFkYXRhIGZvciBwcm9tcHQgZmlsZXMgKGAqLnByb21wdC5tZGApLlxuZXhwb3J0IGNvbnN0IHByb21wdEZpbGVBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBJQXR0cmlidXRlRGVmaW5pdGlvbj4gPSB7XG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWVdOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0Lm5hbWUnLCAnVGhlIG5hbWUgb2YgdGhlIHByb21wdC4gVGhpcyBpcyBhbHNvIHRoZSBuYW1lIG9mIHRoZSBzbGFzaCBjb21tYW5kIHRoYXQgd2lsbCBydW4gdGhpcyBwcm9tcHQuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5kZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIHJldXNhYmxlIHByb21wdCwgd2hhdCBpdCBkb2VzIGFuZCB3aGVuIHRvIHVzZSBpdC4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuYXJndW1lbnRIaW50XToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5hcmd1bWVudEhpbnQnLCAnVGhlIGFyZ3VtZW50LWhpbnQgZGVzY3JpYmVzIHdoYXQgaW5wdXRzIHRoZSBwcm9tcHQgZXhwZWN0cyBvciBzdXBwb3J0cy4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubW9kZWxdOiB7XG5cdFx0dHlwZTogJ3NjYWxhciB8IHNlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQubW9kZWwnLCAnVGhlIG1vZGVsIHRvIHVzZSBpbiB0aGlzIHByb21wdC4gQ2FuIGFsc28gYmUgYSBsaXN0IG9mIG1vZGVscy4gVGhlIGZpcnN0IGF2YWlsYWJsZSBtb2RlbCB3aWxsIGJlIHVzZWQuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRvb2xzXToge1xuXHRcdHR5cGU6ICdzY2FsYXIgfCBzZXF1ZW5jZScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LnRvb2xzJywgJ1RoZSB0b29scyB0byB1c2UgaW4gdGhpcyBwcm9tcHQuJyksXG5cdFx0ZGVmYXVsdHM6IFsnW10nLCAnW1xcJ3NlYXJjaFxcJywgXFwnZWRpdFxcJywgXFwnd2ViXFwnXSddLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZ2VudF06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQuYWdlbnQuZGVzY3JpcHRpb24nLCAnVGhlIGFnZW50IHRvIHVzZSB3aGVuIHJ1bm5pbmcgdGhpcyBwcm9tcHQuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGVdOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LmFnZW50LmRlc2NyaXB0aW9uJywgJ1RoZSBhZ2VudCB0byB1c2Ugd2hlbiBydW5uaW5nIHRoaXMgcHJvbXB0LicpLFxuXHR9LFxufTtcblxuLy8gQXR0cmlidXRlIG1ldGFkYXRhIGZvciBpbnN0cnVjdGlvbnMgZmlsZXMgKGAqLmluc3RydWN0aW9ucy5tZGApLlxuZXhwb3J0IGNvbnN0IGluc3RydWN0aW9uQXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgSUF0dHJpYnV0ZURlZmluaXRpb24+ID0ge1xuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmluc3RydWN0aW9ucy5uYW1lJywgJ1RoZSBuYW1lIG9mIHRoZSBpbnN0cnVjdGlvbiBmaWxlIGFzIHNob3duIGluIHRoZSBVSS4gSWYgbm90IHNldCwgdGhlIG5hbWUgaXMgZGVyaXZlZCBmcm9tIHRoZSBmaWxlIG5hbWUuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmluc3RydWN0aW9ucy5kZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIGluc3RydWN0aW9uIGZpbGUuIEl0IGNhbiBiZSB1c2VkIHRvIHByb3ZpZGUgYWRkaXRpb25hbCBjb250ZXh0IG9yIGluZm9ybWF0aW9uIGFib3V0IHRoZSBpbnN0cnVjdGlvbnMgYW5kIGlzIHBhc3NlZCB0byB0aGUgbGFuZ3VhZ2UgbW9kZWwgYXMgcGFydCBvZiB0aGUgcHJvbXB0LicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hcHBseVRvXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmluc3RydWN0aW9ucy5hcHBseVRvUmFuZ2UnLCAnT25lIG9yIG1vcmUgZ2xvYiBwYXR0ZXJuIChzZXBhcmF0ZWQgYnkgY29tbWEpIHRoYXQgZGVzY3JpYmUgZm9yIHdoaWNoIGZpbGVzIHRoZSBpbnN0cnVjdGlvbnMgYXBwbHkgdG8uIEJhc2VkIG9uIHRoZXNlIHBhdHRlcm5zLCB0aGUgZmlsZSBpcyBhdXRvbWF0aWNhbGx5IGluY2x1ZGVkIGluIHRoZSBwcm9tcHQsIHdoZW4gdGhlIGNvbnRleHQgY29udGFpbnMgYSBmaWxlIHRoYXQgbWF0Y2hlcyBvbmUgb3IgbW9yZSBvZiB0aGVzZSBwYXR0ZXJucy4gVXNlIGAqKmAgd2hlbiB5b3Ugd2FudCB0aGlzIGZpbGUgdG8gYWx3YXlzIGJlIGFkZGVkLlxcbkV4YW1wbGU6IGAqKi8qLnRzYCwgYCoqLyouanNgLCBgY2xpZW50LyoqYCcpLFxuXHRcdGRlZmF1bHRzOiBbXG5cdFx0XHQnXFwnKipcXCcnLFxuXHRcdFx0J1xcJyoqLyoudHMsICoqLyouanNcXCcnLFxuXHRcdFx0J1xcJyoqLyoucGhwXFwnJyxcblx0XHRcdCdcXCcqKi8qLnB5XFwnJ1xuXHRcdF0sXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmV4Y2x1ZGVBZ2VudF06IHtcblx0XHR0eXBlOiAnc2NhbGFyIHwgc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmluc3RydWN0aW9ucy5leGNsdWRlQWdlbnQnLCAnT25lIG9yIG1vcmUgYWdlbnRzIHRvIGV4Y2x1ZGUgZnJvbSB1c2luZyB0aGlzIGluc3RydWN0aW9uIGZpbGUuJyksXG5cdH0sXG59O1xuXG4vLyBBdHRyaWJ1dGUgbWV0YWRhdGEgZm9yIGN1c3RvbSBhZ2VudCBmaWxlcyAoYCouYWdlbnQubWRgKS5cbmV4cG9ydCBjb25zdCBjdXN0b21BZ2VudEF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIElBdHRyaWJ1dGVEZWZpbml0aW9uPiA9IHtcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZV06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5uYW1lJywgJ1RoZSBuYW1lIG9mIHRoZSBhZ2VudCBhcyBzaG93biBpbiB0aGUgVUkuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgY3VzdG9tIGFnZW50LCB3aGF0IGl0IGRvZXMgYW5kIHdoZW4gdG8gdXNlIGl0LicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hcmd1bWVudEhpbnRdOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuYXJndW1lbnRIaW50JywgJ1RoZSBhcmd1bWVudC1oaW50IGRlc2NyaWJlcyB3aGF0IGlucHV0cyB0aGUgY3VzdG9tIGFnZW50IGV4cGVjdHMgb3Igc3VwcG9ydHMuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGVsXToge1xuXHRcdHR5cGU6ICdzY2FsYXIgfCBzZXF1ZW5jZScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQubW9kZWwnLCAnU3BlY2lmeSB0aGUgbW9kZWwgdGhhdCBydW5zIHRoaXMgY3VzdG9tIGFnZW50LiBDYW4gYWxzbyBiZSBhIGxpc3Qgb2YgbW9kZWxzLiBUaGUgZmlyc3QgYXZhaWxhYmxlIG1vZGVsIHdpbGwgYmUgdXNlZC4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMudG9vbHNdOiB7XG5cdFx0dHlwZTogJ3NjYWxhciB8IHNlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC50b29scycsICdUaGUgc2V0IG9mIHRvb2xzIHRoYXQgdGhlIGN1c3RvbSBhZ2VudCBoYXMgYWNjZXNzIHRvLicpLFxuXHRcdGRlZmF1bHRzOiBbJ1tdJywgJ1tzZWFyY2gsIGVkaXQsIHdlYl0nXSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuaGFuZE9mZnNdOiB7XG5cdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5oYW5kb2ZmcycsICdQb3NzaWJsZSBoYW5kb2ZmIGFjdGlvbnMgd2hlbiB0aGUgYWdlbnQgaGFzIGNvbXBsZXRlZCBpdHMgdGFzay4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMudGFyZ2V0XToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LnRhcmdldCcsICdUaGUgdGFyZ2V0IHRvIHdoaWNoIHRoZSBoZWFkZXIgYXR0cmlidXRlcyBsaWtlIHRvb2xzIGFwcGx5IHRvLiBQb3NzaWJsZSB2YWx1ZXMgYXJlIGBnaXRodWItY29waWxvdGAgYW5kIGB2c2NvZGVgLicpLFxuXHRcdGVudW1zOiB0YXJnZXRBdHRyaWJ1dGVFbnVtVmFsdWVzLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5pbmZlcl06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5pbmZlcicsICdDb250cm9scyB2aXNpYmlsaXR5IG9mIHRoZSBhZ2VudC4nKSxcblx0XHRlbnVtczogYm9vbGVhbkF0dHJpYnV0ZUVudW1WYWx1ZXMsXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFnZW50c106IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmFnZW50cycsICdPbmUgb3IgbW9yZSBhZ2VudHMgdGhhdCB0aGlzIGFnZW50IGNhbiB1c2UgYXMgc3ViYWdlbnRzLiBVc2UgXFwnKlxcJyB0byBzcGVjaWZ5IGFsbCBhdmFpbGFibGUgYWdlbnRzLicpLFxuXHRcdGRlZmF1bHRzOiBbJ1tcIipcIl0nXSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMudXNlckludm9jYWJsZV06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC51c2VySW52b2NhYmxlJywgJ1doZXRoZXIgdGhlIGFnZW50IGNhbiBiZSBzZWxlY3RlZCBhbmQgaW52b2tlZCBieSB1c2VycyBpbiB0aGUgVUkuJyksXG5cdFx0ZW51bXM6IGJvb2xlYW5BdHRyaWJ1dGVFbnVtVmFsdWVzLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmRpc2FibGVNb2RlbEludm9jYXRpb24nLCAnSWYgdHJ1ZSwgcHJldmVudHMgdGhlIGFnZW50IGZyb20gYmVpbmcgaW52b2tlZCBhcyBhIHN1YmFnZW50LicpLFxuXHRcdGVudW1zOiBib29sZWFuQXR0cmlidXRlRW51bVZhbHVlcyxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuYWR2YW5jZWRPcHRpb25zXToge1xuXHRcdHR5cGU6ICdtYXAnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmFkdmFuY2VkT3B0aW9ucycsICdBZHZhbmNlZCBvcHRpb25zIGZvciBjdXN0b20gYWdlbnQgYmVoYXZpb3IuJyksXG5cdH0sXG5cdFtHaXRodWJQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmdpdGh1Yl06IHtcblx0XHR0eXBlOiAnbWFwJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5naXRodWInLCAnR2l0SHViLXNwZWNpZmljIGNvbmZpZ3VyYXRpb24gZm9yIHRoZSBhZ2VudCwgc3VjaCBhcyB0b2tlbiBwZXJtaXNzaW9ucy4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuaG9va3NdOiB7XG5cdFx0dHlwZTogJ21hcCcsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuaG9va3MnLCAnTGlmZWN5Y2xlIGhvb2tzIHNjb3BlZCB0byB0aGlzIGFnZW50LiBEZWZpbmUgaG9va3MgdGhhdCBydW4gb25seSB3aGlsZSB0aGlzIGFnZW50IGlzIGFjdGl2ZS4nKSxcblx0fSxcbn07XG5cbi8vIEF0dHJpYnV0ZSBtZXRhZGF0YSBmb3Igc2tpbGwgZmlsZXMgKGBTS0lMTC5tZGApLlxuZXhwb3J0IGNvbnN0IHNraWxsQXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgSUF0dHJpYnV0ZURlZmluaXRpb24+ID0ge1xuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLm5hbWUnLCAnVGhlIG5hbWUgb2YgdGhlIHNraWxsLicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kZXNjcmlwdGlvbl06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC5kZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIHNraWxsLiBUaGUgZGVzY3JpcHRpb24gaXMgYWRkZWQgdG8gZXZlcnkgcmVxdWVzdCBhbmQgd2lsbCBiZSB1c2VkIGJ5IHRoZSBhZ2VudCB0byBkZWNpZGUgd2hlbiB0byBsb2FkIHRoZSBza2lsbC4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuYXJndW1lbnRIaW50XToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLmFyZ3VtZW50SGludCcsICdIaW50IHNob3duIGR1cmluZyBhdXRvY29tcGxldGUgdG8gaW5kaWNhdGUgZXhwZWN0ZWQgYXJndW1lbnRzLiBFeGFtcGxlOiBbaXNzdWUtbnVtYmVyXSBvciBbZmlsZW5hbWVdIFtmb3JtYXRdJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnVzZXJJbnZvY2FibGVdOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuc2tpbGwudXNlckludm9jYWJsZScsICdTZXQgdG8gZmFsc2UgdG8gaGlkZSBmcm9tIHRoZSAvIG1lbnUuIFVzZSBmb3IgYmFja2dyb3VuZCBrbm93bGVkZ2UgdXNlcnMgc2hvdWxkIG5vdCBpbnZva2UgZGlyZWN0bHkuIERlZmF1bHQ6IHRydWUuJyksXG5cdFx0ZW51bXM6IGJvb2xlYW5BdHRyaWJ1dGVFbnVtVmFsdWVzLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLmRpc2FibGVNb2RlbEludm9jYXRpb24nLCAnU2V0IHRvIHRydWUgdG8gcHJldmVudCB0aGUgYWdlbnQgZnJvbSBhdXRvbWF0aWNhbGx5IGxvYWRpbmcgdGhpcyBza2lsbC4gVXNlIGZvciB3b3JrZmxvd3MgeW91IHdhbnQgdG8gdHJpZ2dlciBtYW51YWxseSB3aXRoIC9uYW1lLiBEZWZhdWx0OiBmYWxzZS4nKSxcblx0XHRlbnVtczogYm9vbGVhbkF0dHJpYnV0ZUVudW1WYWx1ZXMsXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmxpY2Vuc2VdOiB7XG5cdFx0dHlwZTogJ3NjYWxhciB8IG1hcCcsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuc2tpbGwubGljZW5zZScsICdMaWNlbnNlIGluZm9ybWF0aW9uIGZvciB0aGUgc2tpbGwuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmNvbXBhdGliaWxpdHldOiB7XG5cdFx0dHlwZTogJ3NjYWxhciB8IG1hcCcsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuc2tpbGwuY29tcGF0aWJpbGl0eScsICdDb21wYXRpYmlsaXR5IG1ldGFkYXRhIGZvciBlbnZpcm9ubWVudHMgb3IgcnVudGltZXMuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1ldGFkYXRhXToge1xuXHRcdHR5cGU6ICdtYXAnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLm1ldGFkYXRhJywgJ0FkZGl0aW9uYWwgbWV0YWRhdGEgZm9yIHRoZSBza2lsbC4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuY29udGV4dF06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC5jb250ZXh0JywgJ0NvbnRyb2xzIGhvdyB0aGUgc2tpbGwgaXMgbG9hZGVkLiBTZXQgdG8gXFwnZm9ya1xcJyB0byBzcGF3biBhIHN1YmFnZW50IHdpdGggdGhlIHNraWxsIGluc3RydWN0aW9ucyBpbnN0ZWFkIG9mIHJldHVybmluZyB0aGVtIGlubGluZS4nKSxcblx0XHRlbnVtczogW3sgbmFtZTogJ2ZvcmsnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC5jb250ZXh0LmZvcmsnLCAnU3Bhd24gYSBzdWJhZ2VudCB3aXRoIHRoZSBza2lsbCBpbnN0cnVjdGlvbnMgaW5qZWN0ZWQgYXMgc3lzdGVtIGNvbnRleHQuJykgfV0sXG5cdH0sXG59O1xuXG5jb25zdCBhbGxBdHRyaWJ1dGVOYW1lczogUmVjb3JkPFByb21wdHNUeXBlLCBzdHJpbmdbXT4gPSB7XG5cdFtQcm9tcHRzVHlwZS5wcm9tcHRdOiBPYmplY3Qua2V5cyhwcm9tcHRGaWxlQXR0cmlidXRlcyksXG5cdFtQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnNdOiBPYmplY3Qua2V5cyhpbnN0cnVjdGlvbkF0dHJpYnV0ZXMpLFxuXHRbUHJvbXB0c1R5cGUuYWdlbnRdOiBPYmplY3Qua2V5cyhjdXN0b21BZ2VudEF0dHJpYnV0ZXMpLFxuXHRbUHJvbXB0c1R5cGUuc2tpbGxdOiBPYmplY3Qua2V5cyhza2lsbEF0dHJpYnV0ZXMpLFxuXHRbUHJvbXB0c1R5cGUuaG9va106IFtdLCAvLyBob29rcyBhcmUgSlNPTiBmaWxlcywgbm90IG1hcmtkb3duIHdpdGggWUFNTCBmcm9udG1hdHRlclxufTtcbmNvbnN0IGdpdGh1YkNvcGlsb3RBZ2VudEF0dHJpYnV0ZU5hbWVzID0gW1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZSwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kZXNjcmlwdGlvbiwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29scywgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50YXJnZXQsIEdpdGh1YlByb21wdEhlYWRlckF0dHJpYnV0ZXMubWNwU2VydmVycywgR2l0aHViUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5naXRodWIsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaW5mZXJdO1xuY29uc3QgcmVjb21tZW5kZWRBdHRyaWJ1dGVOYW1lczogUmVjb3JkPFByb21wdHNUeXBlLCBzdHJpbmdbXT4gPSB7XG5cdFtQcm9tcHRzVHlwZS5wcm9tcHRdOiBhbGxBdHRyaWJ1dGVOYW1lc1tQcm9tcHRzVHlwZS5wcm9tcHRdLmZpbHRlcihuYW1lID0+ICFpc05vblJlY29tbWVuZGVkQXR0cmlidXRlKG5hbWUpKSxcblx0W1Byb21wdHNUeXBlLmluc3RydWN0aW9uc106IGFsbEF0dHJpYnV0ZU5hbWVzW1Byb21wdHNUeXBlLmluc3RydWN0aW9uc10uZmlsdGVyKG5hbWUgPT4gIWlzTm9uUmVjb21tZW5kZWRBdHRyaWJ1dGUobmFtZSkpLFxuXHRbUHJvbXB0c1R5cGUuYWdlbnRdOiBhbGxBdHRyaWJ1dGVOYW1lc1tQcm9tcHRzVHlwZS5hZ2VudF0uZmlsdGVyKG5hbWUgPT4gIWlzTm9uUmVjb21tZW5kZWRBdHRyaWJ1dGUobmFtZSkpLFxuXHRbUHJvbXB0c1R5cGUuc2tpbGxdOiBhbGxBdHRyaWJ1dGVOYW1lc1tQcm9tcHRzVHlwZS5za2lsbF0uZmlsdGVyKG5hbWUgPT4gIWlzTm9uUmVjb21tZW5kZWRBdHRyaWJ1dGUobmFtZSkpLFxuXHRbUHJvbXB0c1R5cGUuaG9va106IFtdLCAvLyBob29rcyBhcmUgSlNPTiBmaWxlcywgbm90IG1hcmtkb3duIHdpdGggWUFNTCBmcm9udG1hdHRlclxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkQXR0cmlidXRlTmFtZXMocHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIGluY2x1ZGVOb25SZWNvbW1lbmRlZDogYm9vbGVhbiwgdGFyZ2V0OiBUYXJnZXQpOiBzdHJpbmdbXSB7XG5cdGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUpIHtcblx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRyZXR1cm4gT2JqZWN0LmtleXMoY2xhdWRlUnVsZXNBdHRyaWJ1dGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKGNsYXVkZUFnZW50QXR0cmlidXRlcyk7XG5cdH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUYXJnZXQuR2l0SHViQ29waWxvdCkge1xuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdFx0cmV0dXJuIGdpdGh1YkNvcGlsb3RBZ2VudEF0dHJpYnV0ZU5hbWVzO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gaW5jbHVkZU5vblJlY29tbWVuZGVkID8gYWxsQXR0cmlidXRlTmFtZXNbcHJvbXB0VHlwZV0gOiByZWNvbW1lbmRlZEF0dHJpYnV0ZU5hbWVzW3Byb21wdFR5cGVdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNOb25SZWNvbW1lbmRlZEF0dHJpYnV0ZShhdHRyaWJ1dGVOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGF0dHJpYnV0ZU5hbWUgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWR2YW5jZWRPcHRpb25zIHx8IGF0dHJpYnV0ZU5hbWUgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZXhjbHVkZUFnZW50IHx8IGF0dHJpYnV0ZU5hbWUgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMubW9kZSB8fCBhdHRyaWJ1dGVOYW1lID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmluZmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXR0cmlidXRlRGVmaW5pdGlvbihhdHRyaWJ1dGVOYW1lOiBzdHJpbmcsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCB0YXJnZXQ6IFRhcmdldCk6IElBdHRyaWJ1dGVEZWZpbml0aW9uIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChwcm9tcHRUeXBlKSB7XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRcdHJldHVybiBjbGF1ZGVSdWxlc0F0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5zdHJ1Y3Rpb25BdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdO1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6XG5cdFx0XHRyZXR1cm4gc2tpbGxBdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdO1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRcdHJldHVybiBjbGF1ZGVBZ2VudEF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gY3VzdG9tQWdlbnRBdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdO1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0cmV0dXJuIHByb21wdEZpbGVBdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8vIFRoZSBsaXN0IG9mIHRvb2xzIGtub3duIHRvIGJlIHVzZWQgYnkgR2l0SHViIENvcGlsb3QgY3VzdG9tIGFnZW50c1xuZXhwb3J0IGNvbnN0IGtub3duR2l0aHViQ29waWxvdFRvb2xzID0gW1xuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLmV4ZWN1dGUsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViQ29waWxvdC5leGVjdXRlJywgJ0V4ZWN1dGUgY29tbWFuZHMnKSB9LFxuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLnJlYWQsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViQ29waWxvdC5yZWFkJywgJ1JlYWQgZmlsZXMnKSB9LFxuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLmVkaXQsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViQ29waWxvdC5lZGl0JywgJ0VkaXQgZmlsZXMnKSB9LFxuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLnNlYXJjaCwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJDb3BpbG90LnNlYXJjaCcsICdTZWFyY2ggZmlsZXMnKSB9LFxuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLmFnZW50LCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YkNvcGlsb3QuYWdlbnQnLCAnVXNlIHN1YmFnZW50cycpIH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIElWYWx1ZUVudHJ5IHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGtub3duQ2xhdWRlVG9vbHMgPSBbXG5cdHsgbmFtZTogJ0Jhc2gnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5iYXNoJywgJ0V4ZWN1dGUgc2hlbGwgY29tbWFuZHMnKSwgdG9vbEVxdWl2YWxlbnQ6IFtTcGVjZWRUb29sQWxpYXNlcy5leGVjdXRlXSB9LFxuXHR7IG5hbWU6ICdFZGl0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuZWRpdCcsICdNYWtlIHRhcmdldGVkIGZpbGUgZWRpdHMnKSwgdG9vbEVxdWl2YWxlbnQ6IFsnZWRpdC9lZGl0Tm90ZWJvb2snLCAnZWRpdC9lZGl0RmlsZXMnXSB9LFxuXHR7IG5hbWU6ICdHbG9iJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuZ2xvYicsICdGaW5kIGZpbGVzIGJ5IHBhdHRlcm4nKSwgdG9vbEVxdWl2YWxlbnQ6IFsnc2VhcmNoL2ZpbGVTZWFyY2gnXSB9LFxuXHR7IG5hbWU6ICdHcmVwJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuZ3JlcCcsICdTZWFyY2ggZmlsZSBjb250ZW50cyB3aXRoIHJlZ2V4JyksIHRvb2xFcXVpdmFsZW50OiBbJ3NlYXJjaC90ZXh0U2VhcmNoJ10gfSxcblx0eyBuYW1lOiAnUmVhZCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnJlYWQnLCAnUmVhZCBmaWxlIGNvbnRlbnRzJyksIHRvb2xFcXVpdmFsZW50OiBbJ3JlYWQvcmVhZEZpbGUnLCAncmVhZC9nZXROb3RlYm9va1N1bW1hcnknXSB9LFxuXHR7IG5hbWU6ICdXcml0ZScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLndyaXRlJywgJ0NyZWF0ZS9vdmVyd3JpdGUgZmlsZXMnKSwgdG9vbEVxdWl2YWxlbnQ6IFsnZWRpdC9jcmVhdGVEaXJlY3RvcnknLCAnZWRpdC9jcmVhdGVGaWxlJywgJ2VkaXQvY3JlYXRlSnVweXRlck5vdGVib29rJ10gfSxcblx0eyBuYW1lOiAnV2ViRmV0Y2gnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS53ZWJGZXRjaCcsICdGZXRjaCBVUkwgY29udGVudCcpLCB0b29sRXF1aXZhbGVudDogW1NwZWNlZFRvb2xBbGlhc2VzLndlYl0gfSxcblx0eyBuYW1lOiAnV2ViU2VhcmNoJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUud2ViU2VhcmNoJywgJ1BlcmZvcm0gd2ViIHNlYXJjaGVzJyksIHRvb2xFcXVpdmFsZW50OiBbU3BlY2VkVG9vbEFsaWFzZXMud2ViXSB9LFxuXHR7IG5hbWU6ICdUYXNrJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUudGFzaycsICdSdW4gc3ViYWdlbnRzIGZvciBjb21wbGV4IHRhc2tzJyksIHRvb2xFcXVpdmFsZW50OiBbU3BlY2VkVG9vbEFsaWFzZXMuYWdlbnRdIH0sXG5cdHsgbmFtZTogJ1NraWxsJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuc2tpbGwnLCAnRXhlY3V0ZSBza2lsbHMnKSwgdG9vbEVxdWl2YWxlbnQ6IFtdIH0sXG5cdHsgbmFtZTogJ0xTUCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmxzcCcsICdDb2RlIGludGVsbGlnZW5jZSAocmVxdWlyZXMgcGx1Z2luKScpLCB0b29sRXF1aXZhbGVudDogW10gfSxcblx0eyBuYW1lOiAnTm90ZWJvb2tFZGl0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUubm90ZWJvb2tFZGl0JywgJ01vZGlmeSBKdXB5dGVyIG5vdGVib29rcycpLCB0b29sRXF1aXZhbGVudDogWydlZGl0L2VkaXROb3RlYm9vayddIH0sXG5cdHsgbmFtZTogJ0Fza1VzZXJRdWVzdGlvbicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmFza1VzZXJRdWVzdGlvbicsICdBc2sgbXVsdGlwbGUtY2hvaWNlIHF1ZXN0aW9ucycpLCB0b29sRXF1aXZhbGVudDogWyd2c2NvZGUvYXNrUXVlc3Rpb25zJ10gfSxcblx0eyBuYW1lOiAnTUNQU2VhcmNoJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUubWNwU2VhcmNoJywgJ1NlYXJjaGVzIGZvciBNQ1AgdG9vbHMgd2hlbiB0b29sIHNlYXJjaCBpcyBlbmFibGVkJyksIHRvb2xFcXVpdmFsZW50OiBbXSB9XG5dO1xuXG5leHBvcnQgY29uc3Qga25vd25DbGF1ZGVNb2RlbHMgPSBbXG5cdHsgbmFtZTogJ3Nvbm5ldCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnNvbm5ldCcsICdMYXRlc3QgQ2xhdWRlIFNvbm5ldCcpLCBtb2RlbEVxdWl2YWxlbnQ6ICdDbGF1ZGUgU29ubmV0IDQuNSAoY29waWxvdCknIH0sXG5cdHsgbmFtZTogJ29wdXMnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5vcHVzJywgJ0xhdGVzdCBDbGF1ZGUgT3B1cycpLCBtb2RlbEVxdWl2YWxlbnQ6ICdDbGF1ZGUgT3B1cyA0LjYgKGNvcGlsb3QpJyB9LFxuXHR7IG5hbWU6ICdoYWlrdScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmhhaWt1JywgJ0xhdGVzdCBDbGF1ZGUgSGFpa3UsIGZhc3QgZm9yIHNpbXBsZSB0YXNrcycpLCBtb2RlbEVxdWl2YWxlbnQ6ICdDbGF1ZGUgSGFpa3UgNC41IChjb3BpbG90KScgfSxcblx0eyBuYW1lOiAnaW5oZXJpdCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmluaGVyaXQnLCAnSW5oZXJpdCBtb2RlbCBmcm9tIHBhcmVudCBhZ2VudCBvciBwcm9tcHQnKSwgbW9kZWxFcXVpdmFsZW50OiB1bmRlZmluZWQgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBDbGF1ZGVNb2RlbHMoY2xhdWRlTW9kZWxOYW1lczogcmVhZG9ubHkgc3RyaW5nW10pOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRmb3IgKGNvbnN0IG5hbWUgb2YgY2xhdWRlTW9kZWxOYW1lcykge1xuXHRcdGNvbnN0IGNsYXVkZU1vZGVsID0ga25vd25DbGF1ZGVNb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5uYW1lID09PSBuYW1lKTtcblx0XHRpZiAoY2xhdWRlTW9kZWwgJiYgY2xhdWRlTW9kZWwubW9kZWxFcXVpdmFsZW50KSB7XG5cdFx0XHRyZXN1bHQucHVzaChjbGF1ZGVNb2RlbC5tb2RlbEVxdWl2YWxlbnQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIE1hcHMgQ2xhdWRlIHRvb2wgbmFtZXMgdG8gdGhlaXIgVlMgQ29kZSB0b29sIGVxdWl2YWxlbnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwQ2xhdWRlVG9vbHMoY2xhdWRlVG9vbE5hbWVzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IG5hbWUgb2YgY2xhdWRlVG9vbE5hbWVzKSB7XG5cdFx0Y29uc3QgY2xhdWRlVG9vbCA9IGtub3duQ2xhdWRlVG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gbmFtZSk7XG5cdFx0aWYgKGNsYXVkZVRvb2wpIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmNsYXVkZVRvb2wudG9vbEVxdWl2YWxlbnQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY29uc3QgY2xhdWRlQWdlbnRBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBJQXR0cmlidXRlRGVmaW5pdGlvbj4gPSB7XG5cdCduYW1lJzoge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLm5hbWUnLCBcIlVuaXF1ZSBpZGVudGlmaWVyIHVzaW5nIGxvd2VyY2FzZSBsZXR0ZXJzIGFuZCBoeXBoZW5zIChyZXF1aXJlZClcIiksXG5cdH0sXG5cdCdkZXNjcmlwdGlvbic6IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5kZXNjcmlwdGlvbicsIFwiV2hlbiB0byBkZWxlZ2F0ZSB0byB0aGlzIHN1YmFnZW50IChyZXF1aXJlZClcIiksXG5cdH0sXG5cdCd0b29scyc6IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLnRvb2xzJywgXCJBcnJheSBvZiB0b29scyB0aGUgc3ViYWdlbnQgY2FuIHVzZS4gSW5oZXJpdHMgYWxsIHRvb2xzIGlmIG9taXR0ZWRcIiksXG5cdFx0ZGVmYXVsdHM6IFsnUmVhZCwgRWRpdCwgQmFzaCddLFxuXHRcdGl0ZW1zOiBrbm93bkNsYXVkZVRvb2xzXG5cdH0sXG5cdCdkaXNhbGxvd2VkVG9vbHMnOiB7XG5cdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5kaXNhbGxvd2VkVG9vbHMnLCBcIlRvb2xzIHRvIGRlbnksIHJlbW92ZWQgZnJvbSBpbmhlcml0ZWQgb3Igc3BlY2lmaWVkIGxpc3RcIiksXG5cdFx0ZGVmYXVsdHM6IFsnV3JpdGUsIEVkaXQsIEJhc2gnXSxcblx0XHRpdGVtczoga25vd25DbGF1ZGVUb29sc1xuXHR9LFxuXHQnbW9kZWwnOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUubW9kZWwnLCBcIk1vZGVsIHRvIHVzZTogc29ubmV0LCBvcHVzLCBoYWlrdSwgb3IgaW5oZXJpdC4gRGVmYXVsdHMgdG8gaW5oZXJpdC5cIiksXG5cdFx0ZGVmYXVsdHM6IFsnc29ubmV0JywgJ29wdXMnLCAnaGFpa3UnLCAnaW5oZXJpdCddLFxuXHRcdGVudW1zOiBrbm93bkNsYXVkZU1vZGVsc1xuXHR9LFxuXHQncGVybWlzc2lvbk1vZGUnOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUucGVybWlzc2lvbk1vZGUnLCBcIlBlcm1pc3Npb24gbW9kZTogZGVmYXVsdCwgYWNjZXB0RWRpdHMsIGRvbnRBc2ssIGJ5cGFzc1Blcm1pc3Npb25zLCBvciBwbGFuLlwiKSxcblx0XHRkZWZhdWx0czogWydkZWZhdWx0JywgJ2FjY2VwdEVkaXRzJywgJ2RvbnRBc2snLCAnYnlwYXNzUGVybWlzc2lvbnMnLCAncGxhbiddLFxuXHRcdGVudW1zOiBbXG5cdFx0XHR7IG5hbWU6ICdkZWZhdWx0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbk1vZGUuZGVmYXVsdCcsICdTdGFuZGFyZCBiZWhhdmlvcjogcHJvbXB0cyBmb3IgcGVybWlzc2lvbiBvbiBmaXJzdCB1c2Ugb2YgZWFjaCB0b29sLicpIH0sXG5cdFx0XHR7IG5hbWU6ICdhY2NlcHRFZGl0cycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb25Nb2RlLmFjY2VwdEVkaXRzJywgJ0F1dG9tYXRpY2FsbHkgYWNjZXB0cyBmaWxlIGVkaXQgcGVybWlzc2lvbnMgZm9yIHRoZSBzZXNzaW9uLicpIH0sXG5cdFx0XHR7IG5hbWU6ICdwbGFuJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbk1vZGUucGxhbicsICdQbGFuIE1vZGU6IENsYXVkZSBjYW4gYW5hbHl6ZSBidXQgbm90IG1vZGlmeSBmaWxlcyBvciBleGVjdXRlIGNvbW1hbmRzLicpIH0sXG5cdFx0XHR7IG5hbWU6ICdkZWxlZ2F0ZScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb25Nb2RlLmRlbGVnYXRlJywgJ0Nvb3JkaW5hdGlvbi1vbmx5IG1vZGUgZm9yIGFnZW50IHRlYW0gbGVhZHMuIE9ubHkgYXZhaWxhYmxlIHdoZW4gYW4gYWdlbnQgdGVhbSBpcyBhY3RpdmUuJykgfSxcblx0XHRcdHsgbmFtZTogJ2RvbnRBc2snLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uTW9kZS5kb250QXNrJywgJ0F1dG8tZGVuaWVzIHRvb2xzIHVubGVzcyBwcmUtYXBwcm92ZWQgdmlhIC9wZXJtaXNzaW9ucyBvciBwZXJtaXNzaW9ucy5hbGxvdyBydWxlcy4nKSB9LFxuXHRcdFx0eyBuYW1lOiAnYnlwYXNzUGVybWlzc2lvbnMnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uTW9kZS5ieXBhc3NQZXJtaXNzaW9ucycsICdTa2lwcyBhbGwgcGVybWlzc2lvbiBwcm9tcHRzIChyZXF1aXJlcyBzYWZlIGVudmlyb25tZW50IGxpa2UgY29udGFpbmVycykuJykgfVxuXHRcdF1cblx0fSxcblx0J3NraWxscyc6IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLnNraWxscycsIFwiU2tpbGxzIHRvIGxvYWQgaW50byB0aGUgc3ViYWdlbnQncyBjb250ZXh0IGF0IHN0YXJ0dXAuXCIpLFxuXHR9LFxuXHQnbWNwU2VydmVycyc6IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLm1jcFNlcnZlcnMnLCBcIk1DUCBzZXJ2ZXJzIGF2YWlsYWJsZSB0byB0aGlzIHN1YmFnZW50LlwiKSxcblx0fSxcblx0J2hvb2tzJzoge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLmhvb2tzJywgXCJMaWZlY3ljbGUgaG9va3Mgc2NvcGVkIHRvIHRoaXMgc3ViYWdlbnQuXCIpLFxuXHR9LFxuXHQnbWVtb3J5Jzoge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLm1lbW9yeScsIFwiUGVyc2lzdGVudCBtZW1vcnkgc2NvcGU6IHVzZXIsIHByb2plY3QsIG9yIGxvY2FsLiBFbmFibGVzIGNyb3NzLXNlc3Npb24gbGVhcm5pbmcuXCIpLFxuXHRcdGRlZmF1bHRzOiBbJ3VzZXInLCAncHJvamVjdCcsICdsb2NhbCddLFxuXHRcdGVudW1zOiBbXG5cdFx0XHR7IG5hbWU6ICd1c2VyJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUubWVtb3J5LnVzZXInLCBcIlJlbWVtYmVyIGxlYXJuaW5ncyBhY3Jvc3MgYWxsIHByb2plY3RzLlwiKSB9LFxuXHRcdFx0eyBuYW1lOiAncHJvamVjdCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLm1lbW9yeS5wcm9qZWN0JywgXCJUaGUgc3ViYWdlbnQncyBrbm93bGVkZ2UgaXMgcHJvamVjdC1zcGVjaWZpYyBhbmQgc2hhcmVhYmxlIHZpYSB2ZXJzaW9uIGNvbnRyb2wuXCIpIH0sXG5cdFx0XHR7IG5hbWU6ICdsb2NhbCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLm1lbW9yeS5sb2NhbCcsIFwiVGhlIHN1YmFnZW50J3Mga25vd2xlZGdlIGlzIHByb2plY3Qtc3BlY2lmaWMgYnV0IHNob3VsZCBub3QgYmUgY2hlY2tlZCBpbnRvIHZlcnNpb24gY29udHJvbC5cIikgfVxuXHRcdF1cblx0fVxufTtcblxuLyoqXG4gKiBBdHRyaWJ1dGVzIHN1cHBvcnRlZCBpbiBDbGF1ZGUgcnVsZXMgZmlsZXMgKGAuY2xhdWRlL3J1bGVzLyoubWRgKS5cbiAqIENsYXVkZSBydWxlcyB1c2UgYHBhdGhzYCBpbnN0ZWFkIG9mIGBhcHBseVRvYCBmb3IgZ2xvYiBwYXR0ZXJucy5cbiAqL1xuZXhwb3J0IGNvbnN0IGNsYXVkZVJ1bGVzQXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgSUF0dHJpYnV0ZURlZmluaXRpb24+ID0ge1xuXHQnZGVzY3JpcHRpb24nOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUucnVsZXMuZGVzY3JpcHRpb24nLCBcIkEgZGVzY3JpcHRpb24gb2Ygd2hhdCB0aGlzIHJ1bGUgY292ZXJzLCB1c2VkIHRvIHByb3ZpZGUgY29udGV4dCBhYm91dCB3aGVuIGl0IGFwcGxpZXMuXCIpLFxuXHR9LFxuXHQncGF0aHMnOiB7XG5cdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5ydWxlcy5wYXRocycsIFwiQXJyYXkgb2YgZ2xvYiBwYXR0ZXJucyB0aGF0IGRlc2NyaWJlIGZvciB3aGljaCBmaWxlcyB0aGUgcnVsZSBhcHBsaWVzLiBCYXNlZCBvbiB0aGVzZSBwYXR0ZXJucywgdGhlIGZpbGUgaXMgYXV0b21hdGljYWxseSBpbmNsdWRlZCBpbiB0aGUgcHJvbXB0IHdoZW4gdGhlIGNvbnRleHQgY29udGFpbnMgYSBmaWxlIHRoYXQgbWF0Y2hlcy5cXG5FeGFtcGxlOiBgWydzcmMvKiovKi50cycsICd0ZXN0LyoqJ11gXCIpLFxuXHR9LFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzVlNDb2RlT3JEZWZhdWx0VGFyZ2V0KHRhcmdldDogVGFyZ2V0KTogYm9vbGVhbiB7XG5cdHJldHVybiB0YXJnZXQgPT09IFRhcmdldC5WU0NvZGUgfHwgdGFyZ2V0ID09PSBUYXJnZXQuVW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGFyZ2V0KHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBoZWFkZXI6IFByb21wdEhlYWRlciB8IFVSSSk6IFRhcmdldCB7XG5cdGNvbnN0IHVyaSA9IGhlYWRlciBpbnN0YW5jZW9mIFVSSSA/IGhlYWRlciA6IGhlYWRlci51cmk7XG5cdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdGNvbnN0IHBhcmVudERpciA9IGRpcm5hbWUodXJpKTtcblx0XHRpZiAocGFyZW50RGlyLnBhdGguZW5kc1dpdGgoYC8ke0NMQVVERV9BR0VOVFNfU09VUkNFX0ZPTERFUn1gKSkge1xuXHRcdFx0cmV0dXJuIFRhcmdldC5DbGF1ZGU7XG5cdFx0fVxuXHRcdGlmICghKGhlYWRlciBpbnN0YW5jZW9mIFVSSSkpIHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGhlYWRlci50YXJnZXQ7XG5cdFx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuR2l0SHViQ29waWxvdCB8fCB0YXJnZXQgPT09IFRhcmdldC5WU0NvZGUpIHtcblx0XHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFRhcmdldC5VbmRlZmluZWQ7XG5cdH0gZWxzZSBpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSB7XG5cdFx0aWYgKGlzSW5DbGF1ZGVSdWxlc0ZvbGRlcih1cmkpKSB7XG5cdFx0XHRyZXR1cm4gVGFyZ2V0LkNsYXVkZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFRhcmdldC5VbmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCLDZCQUE2QjtBQUNuRSxTQUF1Qiw4QkFBOEI7QUFDckQsU0FBUyxhQUFhLGNBQWM7QUFFN0IsSUFBVTtBQUFBLENBQVYsQ0FBVUEsa0NBQVY7QUFDQyxFQUFNQSw4QkFBQSxhQUFhO0FBQ25CLEVBQU1BLDhCQUFBLFNBQVM7QUFBQSxHQUZOO0FBS1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsNEJBQVY7QUFDQyxFQUFNQSx3QkFBQSxrQkFBa0I7QUFBQSxHQURmO0FBSVYsU0FBUyxTQUFTLE9BQWlDO0FBQ3pELFNBQU8sVUFBVSxPQUFPLFVBQVUsVUFBVSxPQUFPLGlCQUFpQixVQUFVLE9BQU8sVUFBVSxVQUFVLE9BQU87QUFDakg7QUFXQSxNQUFNLDZCQUFxRDtBQUFBLEVBQzFELEVBQUUsTUFBTSxPQUFPO0FBQUEsRUFDZixFQUFFLE1BQU0sUUFBUTtBQUNqQjtBQUVBLE1BQU0sNEJBQW9EO0FBQUEsRUFDekQsRUFBRSxNQUFNLFNBQVM7QUFBQSxF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TTtBQUFBLElBQ04sYUFBYSxTQUFTLHlCQUF5Qix3T0FBd087QUFBQSxFQUN4UjtBQUNEO0FBRU8sU0FBUyx3QkFBd0IsUUFBeUI7QUFDaEUsU0FBTyxXQUFXLE9BQU8sVUFBVSxXQUFXLE9BQU87QUFDdEQ7QUFFTyxTQUFTLFVBQVUsWUFBeUIsUUFBb0M7QUFDdEYsUUFBTSxNQUFNLGtCQUFrQixNQUFNLFNBQVMsT0FBTztBQUNwRCxNQUFJLGVBQWUsWUFBWSxPQUFPO0FBQ3JDLFVBQU0sWUFBWSxRQUFRLEdBQUc7QUFDN0IsUUFBSSxVQUFVLEtBQUssU0FBUyxJQUFJLDJCQUEyQixFQUFFLEdBQUc7QUFDL0QsYUFBTyxPQUFPO0FBQUEsSUFDZjtBQUNBLFFBQUksRUFBRSxrQkFBa0IsTUFBTTtBQUM3QixZQUFNLFNBQVMsT0FBTztBQUN0QixVQUFJLFdBQVcsT0FBTyxpQkFBaUIsV0FBVyxPQUFPLFFBQVE7QUFDaEUsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTyxPQUFPO0FBQUEsRUFDZixXQUFXLGVBQWUsWUFBWSxjQUFjO0FBQ25ELFFBQUksc0JBQXNCLEdBQUcsR0FBRztBQUMvQixhQUFPLE9BQU87QUFBQSxJQUNmO0FBQUEsRUFDRDtBQUNBLFNBQU8sT0FBTztBQUNmOyIsCiAgIm5hbWVzIjogWyJHaXRodWJQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzIiwgIkNsYXVkZUhlYWRlckF0dHJpYnV0ZXMiXQp9Cg==
