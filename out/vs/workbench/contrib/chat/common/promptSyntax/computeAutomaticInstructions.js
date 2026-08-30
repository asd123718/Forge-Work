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
import { match, splitGlobAware } from "../../../../../base/common/glob.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { escape as escapeXml } from "../../../../../base/common/strings.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { ChatRequestVariableSet, IChatRequestVariableEntry, isPromptFileVariableEntry, toPromptFileVariableEntry, toPromptTextVariableEntry, PromptFileVariableKind, toToolVariableEntry } from "../attachments/chatVariableEntries.js";
import { ILanguageModelToolsService, VSCodeToolReference } from "../tools/languageModelToolsService.js";
import { PromptsConfig } from "./config/config.js";
import { isInClaudeAgentsFolder, isInClaudeRulesFolder, isPromptOrInstructionsFile } from "./config/promptFileLocations.js";
import { AgentInstructionFileType, IPromptsService, matchesSessionType, newInstructionsCollectionEvent, newInstructionsCollectionDebugInfo } from "./service/promptsService.js";
import { newInstructionsCollectionEvent as newInstructionsCollectionEvent2, newInstructionsCollectionDebugInfo as newInstructionsCollectionDebugInfo2 } from "./service/promptsService.js";
import { AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, TROUBLESHOOT_SKILL_PATH } from "./promptTypes.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { ChatModeKind } from "../constants.js";
import { hash } from "../../../../../base/common/hash.js";
import { IAgentPluginService } from "../plugins/agentPluginService.js";
let lastInstructionsCollectionResult;
let ComputeAutomaticInstructions = class {
  constructor(_modeKind, _enabledTools, _enabledSubagents, _currentSessionType, _promptsService, _logService, _labelService, _configurationService, _workspaceService, _fileService, _remoteAgentService, _telemetryService, _languageModelToolsService, _agentPluginService) {
    this._modeKind = _modeKind;
    this._enabledTools = _enabledTools;
    this._enabledSubagents = _enabledSubagents;
    this._currentSessionType = _currentSessionType;
    this._promptsService = _promptsService;
    this._logService = _logService;
    this._labelService = _labelService;
    this._configurationService = _configurationService;
    this._workspaceService = _workspaceService;
    this._fileService = _fileService;
    this._remoteAgentService = _remoteAgentService;
    this._telemetryService = _telemetryService;
    this._languageModelToolsService = _languageModelToolsService;
    this._agentPluginService = _agentPluginService;
    this._parseResults = new ResourceMap();
  }
  async _parseInstructionsFile(uri, token) {
    if (this._parseResults.has(uri)) {
      return this._parseResults.get(uri);
    }
    try {
      const result = await this._promptsService.parseNew(uri, token);
      this._parseResults.set(uri, result);
      return result;
    } catch (error) {
      this._logService.error(`[InstructionsContextComputer] Failed to parse instruction file: ${uri}`, error);
      return void 0;
    }
  }
  async collect(variables, token) {
    const startTime = performance.now();
    const instructionFiles = await this._promptsService.getInstructionFiles(token);
    this._logService.trace(`[InstructionsContextComputer] ${instructionFiles.length} instruction files available.`);
    const telemetryEvent = newInstructionsCollectionEvent();
    const debugInfo = newInstructionsCollectionDebugInfo();
    const context = this._getContext(variables);
    await this.addApplyingInstructions(instructionFiles, context, variables, telemetryEvent, debugInfo, token);
    await this._addReferencedInstructions(variables, telemetryEvent, debugInfo, token);
    await this._addAgentInstructions(variables, telemetryEvent, debugInfo, token);
    const customizationsIndexVariable = await this._getCustomizationsIndex(instructionFiles, variables, telemetryEvent, debugInfo, token);
    if (customizationsIndexVariable) {
      variables.add(customizationsIndexVariable);
      telemetryEvent.listedInstructionsCount++;
    }
    debugInfo.durationInMillis = performance.now() - startTime;
    this.sendTelemetry(telemetryEvent);
    lastInstructionsCollectionResult = { telemetryEvent, debugInfo };
  }
  sendTelemetry(telemetryEvent) {
    telemetryEvent.totalInstructionsCount = telemetryEvent.agentInstructionsCount + telemetryEvent.referencedInstructionsCount + telemetryEvent.applyingInstructionsCount + telemetryEvent.listedInstructionsCount;
    this._telemetryService.publicLog2("instructionsCollected", telemetryEvent);
  }
  async _logSkillLoadedTelemetry(skills) {
    try {
      const pluginByUri = new ResourceMap();
      const allPlugins = this._agentPluginService.plugins.get();
      for (const plugin of allPlugins) {
        pluginByUri.set(plugin.uri, plugin);
      }
      const hashOrEmpty = (value) => {
        return value !== void 0 ? String(hash(value)) : "";
      };
      for (const skill of skills) {
        const skillPlugin = skill.pluginUri ? pluginByUri.get(skill.pluginUri) : void 0;
        this._telemetryService.publicLog2("skillLoadedIntoContext", {
          skillNameHash: hashOrEmpty(skill.name),
          skillStorage: skill.storage,
          extensionIdHash: hashOrEmpty(skill.extension?.identifier.value),
          extensionVersion: skill.extension?.version ?? "",
          pluginNameHash: hashOrEmpty(skillPlugin?.label),
          pluginVersion: skillPlugin?.fromMarketplace?.version ?? ""
        });
      }
    } catch (err) {
      this._logService.error("[InstructionsContextComputer] Failed to log skill telemetry", err);
    }
  }
  /** public for testing */
  async addApplyingInstructions(instructionFiles, context, variables, telemetryEvent, debugInfo, token) {
    const includeApplyingInstructions = this._configurationService.getValue(PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS);
    if (!includeApplyingInstructions && this._modeKind !== ChatModeKind.Edit) {
      this._logService.trace(`[InstructionsContextComputer] includeApplyingInstructions is disabled and agent kind is not Edit. No applying instructions will be added.`);
      return;
    }
    const currentSessionType = this._currentSessionType;
    for (const instructionFile of instructionFiles) {
      if (token.isCancellationRequested) {
        return;
      }
      const { uri, pattern } = instructionFile;
      if (!matchesSessionType(instructionFile.sessionTypes, currentSessionType)) {
        continue;
      }
      if (!pattern) {
        this._logService.trace(`[InstructionsContextComputer] No pattern (applyTo / paths) found: ${uri}`);
        debugInfo.debugDetails.push({ category: "skipped", name: basename(uri).toString(), uri, reason: localize("debugDetail.noPattern", "no applyTo pattern") });
        continue;
      }
      const isClaudeRules = isInClaudeRulesFolder(uri);
      if (context.instructions.has(uri)) {
        this._logService.trace(`[InstructionsContextComputer] Skipping already processed instruction file: ${uri}`);
        debugInfo.debugDetails.push({ category: "skipped", name: basename(uri).toString(), uri, reason: localize("debugDetail.alreadyProcessed", "already processed") });
        continue;
      }
      const match2 = this._matches(context.files, pattern);
      if (match2) {
        this._logService.trace(`[InstructionsContextComputer] Match for ${uri} with ${match2.pattern}${match2.file ? ` for file ${match2.file}` : ""}`);
        const reason = !match2.file ? localize("instruction.file.reason.allFiles", "automatically attached as pattern is **") : localize("instruction.file.reason.specificFile", "automatically attached as pattern {0} matches {1}", pattern, this._labelService.getUriLabel(match2.file, { relative: true }));
        variables.add(toPromptFileVariableEntry(uri, PromptFileVariableKind.Instruction, reason, true));
        telemetryEvent.applyingInstructionsCount++;
        debugInfo.debugDetails.push({ category: "applying", name: basename(uri).toString(), uri, reason });
        if (isClaudeRules) {
          telemetryEvent.claudeRulesCount++;
        }
      } else {
        this._logService.trace(`[InstructionsContextComputer] No match for ${uri} with ${pattern}`);
        debugInfo.debugDetails.push({ category: "skipped", name: basename(uri).toString(), uri, reason: localize("debugDetail.noMatch", "applyTo '{0}' did not match any attached files", pattern) });
      }
    }
  }
  _getContext(attachedContext) {
    const files = new ResourceSet();
    const instructions = new ResourceSet();
    for (const variable of attachedContext.asArray()) {
      if (isPromptFileVariableEntry(variable)) {
        instructions.add(variable.value);
      } else {
        const uri = IChatRequestVariableEntry.toUri(variable);
        if (uri) {
          files.add(uri);
        }
      }
    }
    return { files, instructions };
  }
  async _addAgentInstructions(variables, telemetryEvent, debugInfo, token) {
    const logger = {
      logInfo: (message) => this._logService.trace(`[InstructionsContextComputer] ${message}`)
    };
    const allCandidates = await this._promptsService.listAgentInstructions(token, logger);
    const entries = new ChatRequestVariableSet();
    const copilotEntries = new ChatRequestVariableSet();
    for (const { uri, type } of allCandidates) {
      const varEntry = toPromptFileVariableEntry(uri, PromptFileVariableKind.Instruction, void 0, true);
      entries.add(varEntry);
      if (type === AgentInstructionFileType.copilotInstructionsMd) {
        copilotEntries.add(varEntry);
      }
      telemetryEvent.agentInstructionsCount++;
      if (type === AgentInstructionFileType.claudeMd) {
        telemetryEvent.claudeMdCount++;
      }
      debugInfo.debugDetails.push({ category: "applying", name: basename(uri).toString(), uri, reason: localize("debugDetail.agentInstruction", "always added") });
      logger.logInfo(`Agent instruction file added: ${uri.toString()}`);
    }
    if (copilotEntries.length > 0) {
      await this._addReferencedInstructions(copilotEntries, telemetryEvent, debugInfo, token);
      for (const entry of copilotEntries.asArray()) {
        variables.add(entry);
      }
    }
    for (const entry of entries.asArray()) {
      variables.add(entry);
    }
  }
  _matches(files, applyToPattern) {
    const patterns = splitGlobAware(applyToPattern, ",");
    const patterMatches = (pattern) => {
      pattern = pattern.trim();
      if (pattern.length === 0) {
        return void 0;
      }
      if (pattern === "**" || pattern === "**/*" || pattern === "*") {
        return { pattern };
      }
      if (!pattern.startsWith("/") && !pattern.startsWith("**/")) {
        pattern = "**/" + pattern;
      }
      for (const file of files) {
        if (match(pattern, file.path, { ignoreCase: true })) {
          return { pattern, file };
        }
      }
      return void 0;
    };
    for (const pattern of patterns) {
      const matchResult = patterMatches(pattern);
      if (matchResult) {
        return matchResult;
      }
    }
    return void 0;
  }
  _getTool(referenceName) {
    if (!this._enabledTools) {
      return void 0;
    }
    const tool = this._languageModelToolsService.getToolByName(referenceName);
    if (tool && this._enabledTools[tool.id]) {
      return { tool, variable: `#tool:${this._languageModelToolsService.getFullReferenceName(tool)}` };
    }
    return void 0;
  }
  async _getCustomizationsIndex(instructionFiles, _existingVariables, telemetryEvent, debugInfo, token) {
    const readTool = this._getTool("readFile");
    const runInTerminalTool = this._getTool("runInTerminal");
    const fileReadTool = readTool ?? runInTerminalTool;
    const runSubagentTool = this._getTool(VSCodeToolReference.runSubagent);
    const skillTool = this._getTool("skill");
    const currentSessionType = this._currentSessionType;
    const remoteEnv = await this._remoteAgentService.getEnvironment();
    const remoteOS = remoteEnv?.os;
    const isRemote = this._remoteAgentService.getConnection() !== null;
    const filePath = (uri) => getFilePath(uri, remoteOS, isRemote);
    const entries = [];
    if (fileReadTool) {
      const searchNestedAgentMd = this._configurationService.getValue(PromptsConfig.USE_NESTED_AGENT_MD);
      const agentsMdPromise = searchNestedAgentMd ? this._promptsService.listNestedAgentMDs(token) : Promise.resolve([]);
      entries.push("<instructions>");
      entries.push("Here is a list of instruction files that contain rules for working with this codebase.");
      entries.push("These files are important for understanding the codebase structure, conventions, and best practices.");
      entries.push("When an instruction file applies to your task (based on its description or applyTo pattern), follow the rules specified in it.");
      entries.push(`If the file content is not already included in the context, use the ${fileReadTool.variable} tool to read it before proceeding. Use the exact value from the <file> element as-is with the tool; do not add or remove prefixes or otherwise modify it.`);
      entries.push("Only load instruction files when they are relevant to the current task. Do not eagerly load all instructions upfront.");
      entries.push("When modifying or creating files, check for instructions whose applyTo pattern matches the file path and follow them.");
      let hasContent = false;
      for (const instruction of instructionFiles) {
        if (!matchesSessionType(instruction.sessionTypes, currentSessionType)) {
          continue;
        }
        entries.push("<instruction>");
        entries.push(`<file>${filePath(instruction.uri)}</file>`);
        if (instruction.description) {
          entries.push(`<description>${escapeXml(instruction.description)}</description>`);
        }
        if (instruction.pattern) {
          entries.push(`<applyTo>${escapeXml(instruction.pattern)}</applyTo>`);
        }
        entries.push("</instruction>");
        hasContent = true;
      }
      const agentsMdFiles = await agentsMdPromise;
      for (const { uri } of agentsMdFiles) {
        const folderName = this._labelService.getUriLabel(dirname(uri), { relative: true });
        const description = folderName.trim().length === 0 ? localize("instruction.file.description.agentsmd.root", "Instructions for the workspace") : localize("instruction.file.description.agentsmd.folder", "Instructions for folder '{0}'", folderName);
        entries.push("<instruction>");
        entries.push(`<file>${filePath(uri)}</file>`);
        entries.push(`<description>${escapeXml(description)}</description>`);
        entries.push("</instruction>");
        hasContent = true;
      }
      if (!hasContent) {
        entries.length = 0;
      } else {
        entries.push("</instructions>", "", "");
      }
      const agentSkills = await this._promptsService.findAgentSkills(token);
      const isFileLoggingEnabled = this._configurationService.getValue(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING);
      const modelInvocableSkills = agentSkills?.filter((skill) => {
        if (!skill.description) {
          debugInfo.debugDetails.push({ category: "skipped", name: skill.name, uri: skill.uri, reason: localize("debugDetail.skillNoDescription", "no description for model invocation") });
          return false;
        }
        if (skill.disableModelInvocation) {
          debugInfo.debugDetails.push({ category: "skipped", name: skill.name, uri: skill.uri, reason: localize("debugDetail.skillNotModelInvocable", "model invocation disabled") });
          return false;
        }
        if (!matchesSessionType(skill.sessionTypes, currentSessionType)) {
          debugInfo.debugDetails.push({ category: "skipped", name: skill.name, uri: skill.uri, reason: localize("debugDetail.skillSessionType", "session type not matched") });
          return false;
        }
        if (!isFileLoggingEnabled && skill.uri.path.includes(TROUBLESHOOT_SKILL_PATH)) {
          debugInfo.debugDetails.push({ category: "skipped", name: skill.name, uri: skill.uri, reason: localize("debugDetail.skillDebugDisabled", "debug logging disabled") });
          return false;
        }
        return true;
      });
      if (modelInvocableSkills && modelInvocableSkills.length > 0) {
        this._logSkillLoadedTelemetry(modelInvocableSkills);
        for (const skill of modelInvocableSkills) {
          debugInfo.debugDetails.push({ category: "skill", name: skill.name, uri: skill.uri, reason: skill.storage });
        }
        const useSkillAdherencePrompt = this._configurationService.getValue(PromptsConfig.USE_SKILL_ADHERENCE_PROMPT);
        const skillLoadTool = skillTool ?? fileReadTool;
        entries.push("<skills>");
        if (useSkillAdherencePrompt) {
          entries.push("Skills provide specialized capabilities, domain knowledge, and refined workflows for producing high-quality outputs. Each skill folder contains tested instructions for specific domains like testing strategies, API design, or performance optimization. Multiple skills can be combined when a task spans different domains.");
          if (skillTool) {
            entries.push(`BLOCKING REQUIREMENT: When a skill applies to the user's request, you MUST invoke it IMMEDIATELY as your first action, BEFORE generating any other response or taking action on the task. Use ${skillTool.variable} with the skill name to load the relevant skill(s).`);
          } else {
            entries.push(`BLOCKING REQUIREMENT: When a skill applies to the user's request, you MUST load and read the SKILL.md file IMMEDIATELY as your first action, BEFORE generating any other response or taking action on the task. Use ${fileReadTool.variable} to load the relevant skill(s).`);
          }
          entries.push("NEVER just mention or reference a skill in your response without actually loading it first. If a skill is relevant, load it before proceeding.");
          entries.push("How to determine if a skill applies:");
          entries.push("1. Review the available skills below and match their descriptions against the user's request");
          entries.push("2. If any skill's domain overlaps with the task, load that skill immediately");
          entries.push("3. When multiple skills apply (e.g., a flowchart in documentation), load all relevant skills");
          entries.push("Examples:");
          entries.push(`- "Help me write unit tests for this module" -> Load the testing skill via ${skillLoadTool.variable} FIRST, then proceed`);
          entries.push(`- "Optimize this slow function" -> Load the performance-profiling skill via ${skillLoadTool.variable} FIRST, then proceed`);
          entries.push(`- "Add a discount code field to checkout" -> Load both the checkout-flow and form-validation skills FIRST`);
          entries.push("Available skills:");
        } else {
          if (skillTool) {
            entries.push("Here is a list of skills that contain domain specific knowledge on a variety of topics.");
            entries.push(`When a user asks you to perform a task that falls within the domain of a skill, use the ${skillTool.variable} tool with the skill name to load it.`);
          } else {
            entries.push("Here is a list of skills that contain domain specific knowledge on a variety of topics.");
            entries.push("Each skill comes with a description of the topic and a file path that contains the detailed instructions.");
            entries.push(`When a user asks you to perform a task that falls within the domain of a skill, use the ${fileReadTool.variable} tool to acquire the full instructions from the file URI.`);
          }
        }
        const SKILL_DESCRIPTION_CHAR_BUDGET = 15e3;
        const TRUNCATED_NAMES_CHAR_BUDGET = 5e3;
        let skillCharCount = 0;
        let truncatedAtIndex = modelInvocableSkills.length;
        for (let i = 0; i < modelInvocableSkills.length; i++) {
          const skill = modelInvocableSkills[i];
          const skillEntry = [`<skill>`, `<name>${escapeXml(skill.name)}</name>`];
          if (skill.description) {
            skillEntry.push(`<description>${escapeXml(skill.description)}</description>`);
          }
          skillEntry.push(`<file>${filePath(skill.uri)}</file>`);
          skillEntry.push(`</skill>`);
          const entryLength = skillEntry.join("\n").length + 1;
          if (skillTool && skillCharCount + entryLength > SKILL_DESCRIPTION_CHAR_BUDGET) {
            truncatedAtIndex = i;
            break;
          }
          skillCharCount += entryLength;
          entries.push(...skillEntry);
        }
        if (truncatedAtIndex < modelInvocableSkills.length) {
          const truncatedSkills = modelInvocableSkills.slice(truncatedAtIndex);
          const names = [];
          let nameListLength = 0;
          for (const skill of truncatedSkills) {
            const escapedName = escapeXml(skill.name);
            const addition = (names.length > 0 ? 2 : 0) + escapedName.length;
            if (nameListLength + addition > TRUNCATED_NAMES_CHAR_BUDGET) {
              break;
            }
            nameListLength += addition;
            names.push(escapedName);
          }
          const remaining = truncatedSkills.length - names.length;
          const nameList = names.join(", ");
          entries.push(remaining > 0 ? `Additional skills available (invoke by name): ${nameList}... and ${remaining} more` : `Additional skills available (invoke by name): ${nameList}`);
        }
        entries.push("</skills>", "", "");
      }
    }
    if (runSubagentTool) {
      const canUseAgent = (() => {
        if (!this._enabledSubagents || this._enabledSubagents.includes("*")) {
          return (agent) => agent.visibility.agentInvocable && matchesSessionType(agent.sessionTypes, currentSessionType);
        } else {
          const subagents = this._enabledSubagents;
          return (agent) => subagents.includes(agent.name) && matchesSessionType(agent.sessionTypes, currentSessionType);
        }
      })();
      const agents = (await this._promptsService.getCustomAgents(token)).filter((a) => a.enabled);
      if (agents.length > 0) {
        entries.push("<agents>");
        entries.push("Here is a list of agents that can be used when running a subagent.");
        entries.push("Each agent has optionally a description with the agent's purpose and expertise. When asked to run a subagent, choose the most appropriate agent from this list.");
        entries.push(`Use the ${runSubagentTool.variable} tool with the agent name to run the subagent.`);
        for (const agent of agents) {
          if (canUseAgent(agent)) {
            entries.push("<agent>");
            entries.push(`<name>${escapeXml(agent.name)}</name>`);
            if (agent.description) {
              entries.push(`<description>${escapeXml(agent.description)}</description>`);
            }
            if (agent.argumentHint) {
              entries.push(`<argumentHint>${escapeXml(agent.argumentHint)}</argumentHint>`);
            }
            entries.push("</agent>");
            debugInfo.debugDetails.push({ category: "custom-agent", name: agent.name, uri: agent.uri });
            if (isInClaudeAgentsFolder(agent.uri)) {
              telemetryEvent.claudeAgentsCount++;
            }
          } else {
            debugInfo.debugDetails.push({ category: "skipped", name: agent.name, uri: agent.uri, reason: localize("debugDetail.agentNotInvocable", "not invocable by model") });
          }
        }
        entries.push("</agents>", "", "");
      }
    }
    if (entries.length === 0) {
      return void 0;
    }
    const content = entries.join("\n");
    const toolReferences = [];
    const collectToolReference = (tool) => {
      if (tool) {
        let offset = content.indexOf(tool.variable);
        while (offset >= 0) {
          toolReferences.push(toToolVariableEntry(tool.tool, new OffsetRange(offset, offset + tool.variable.length)));
          offset = content.indexOf(tool.variable, offset + 1);
        }
      }
    };
    collectToolReference(fileReadTool);
    collectToolReference(runSubagentTool);
    collectToolReference(skillTool);
    return toPromptTextVariableEntry(content, true, toolReferences);
  }
  async _addReferencedInstructions(attachedContext, telemetryEvent, debugInfo, token) {
    const includeReferencedInstructions = this._configurationService.getValue(PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS);
    if (!includeReferencedInstructions && this._modeKind !== ChatModeKind.Edit) {
      this._logService.trace(`[InstructionsContextComputer] includeReferencedInstructions is disabled and agent kind is not Edit. No referenced instructions will be added.`);
      return;
    }
    const seen = new ResourceSet();
    const todo = [];
    for (const variable of attachedContext.asArray()) {
      if (isPromptFileVariableEntry(variable)) {
        if (!seen.has(variable.value)) {
          todo.push(variable.value);
          seen.add(variable.value);
        }
      }
    }
    let next = todo.pop();
    while (next) {
      const result = await this._parseInstructionsFile(next, token);
      if (result && result.body) {
        const refsToCheck = [];
        for (const ref of result.body.fileReferences) {
          const url = result.body.resolveFilePath(ref.content);
          if (url && !seen.has(url) && (isPromptOrInstructionsFile(url) || this._workspaceService.getWorkspaceFolder(url) !== void 0)) {
            refsToCheck.push({ resource: url });
            seen.add(url);
          }
        }
        if (refsToCheck.length > 0) {
          const stats = await this._fileService.resolveAll(refsToCheck);
          for (let i = 0; i < stats.length; i++) {
            const stat = stats[i];
            const uri = refsToCheck[i].resource;
            if (stat.success && stat.stat?.isFile) {
              if (isPromptOrInstructionsFile(uri)) {
                todo.push(uri);
              }
              const reason = localize("instruction.file.reason.referenced", "Referenced by {0}", basename(next));
              attachedContext.add(toPromptFileVariableEntry(uri, PromptFileVariableKind.InstructionReference, reason, true));
              telemetryEvent.referencedInstructionsCount++;
              debugInfo.debugDetails.push({ category: "referenced", name: basename(uri).toString(), uri, reason });
              this._logService.trace(`[InstructionsContextComputer] ${uri.toString()} added, referenced by ${next.toString()}`);
            }
          }
        }
      }
      next = todo.pop();
    }
  }
};
ComputeAutomaticInstructions = __decorateClass([
  __decorateParam(4, IPromptsService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IFileService),
  __decorateParam(10, IRemoteAgentService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, ILanguageModelToolsService),
  __decorateParam(13, IAgentPluginService)
], ComputeAutomaticInstructions);
function getFilePath(uri, remoteOS, isRemote = false) {
  if (isRemote && uri.scheme === Schemas.file) {
    return uri.with({ scheme: "vscode-local" }).toString();
  }
  if (uri.scheme === Schemas.file || uri.scheme === Schemas.vscodeRemote) {
    const fsPath = uri.fsPath;
    if (remoteOS !== void 0) {
      if (remoteOS === OperatingSystem.Windows) {
        return fsPath.replace(/\//g, "\\");
      }
      return fsPath.replace(/\\/g, "/");
    }
    return fsPath;
  }
  return uri.toString();
}
export {
  ComputeAutomaticInstructions,
  getFilePath,
  lastInstructionsCollectionResult,
  newInstructionsCollectionDebugInfo2 as newInstructionsCollectionDebugInfo,
  newInstructionsCollectionEvent2 as newInstructionsCollectionEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxjb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbWF0Y2gsIHNwbGl0R2xvYkF3YXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZXNjYXBlIGFzIGVzY2FwZVhtbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0LCBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5LCB0b1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5LCB0b1Byb21wdFRleHRWYXJpYWJsZUVudHJ5LCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLCBJUHJvbXB0VGV4dFZhcmlhYmxlRW50cnksIENoYXRSZXF1ZXN0VG9vbFJlZmVyZW5jZUVudHJ5LCB0b1Rvb2xWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBWU0NvZGVUb29sUmVmZXJlbmNlIH0gZnJvbSAnLi4vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzQ29uZmlnIH0gZnJvbSAnLi9jb25maWcvY29uZmlnLmpzJztcbmltcG9ydCB7IGlzSW5DbGF1ZGVBZ2VudHNGb2xkZXIsIGlzSW5DbGF1ZGVSdWxlc0ZvbGRlciwgaXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUgfSBmcm9tICcuL2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFBhcnNlZFByb21wdEZpbGUgfSBmcm9tICcuL3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLCBJQWdlbnRTa2lsbCwgSUN1c3RvbUFnZW50LCBJSW5zdHJ1Y3Rpb25GaWxlLCBJUHJvbXB0c1NlcnZpY2UsIG1hdGNoZXNTZXNzaW9uVHlwZSwgbmV3SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkV2ZW50LCBuZXdJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRGVidWdJbmZvLCB0eXBlIEluc3RydWN0aW9uc0NvbGxlY3Rpb25FdmVudCwgdHlwZSBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRGVidWdJbmZvIH0gZnJvbSAnLi9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmV4cG9ydCB0eXBlIHsgSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkV2ZW50LCBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRGVidWdJbmZvIH0gZnJvbSAnLi9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmV4cG9ydCB7IG5ld0luc3RydWN0aW9uc0NvbGxlY3Rpb25FdmVudCwgbmV3SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkRlYnVnSW5mbyB9IGZyb20gJy4vc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBR0VOVF9ERUJVR19MT0dfRklMRV9MT0dHSU5HX0VOQUJMRURfU0VUVElORywgVFJPVUJMRVNIT09UX1NLSUxMX1BBVEggfSBmcm9tICcuL3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgVXNlclNlbGVjdGVkVG9vbHMgfSBmcm9tICcuLi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW4sIElBZ2VudFBsdWdpblNlcnZpY2UgfSBmcm9tICcuLi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvblJlc3VsdCB7XG5cdHJlYWRvbmx5IHRlbGVtZXRyeUV2ZW50OiBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRXZlbnQ7XG5cdHJlYWRvbmx5IGRlYnVnSW5mbzogSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkRlYnVnSW5mbztcbn1cblxuLyoqXG4gKiBUaGUgcmVzdWx0IG9mIHRoZSBtb3N0IHJlY2VudCB7QGxpbmsgQ29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucy5jb2xsZWN0fSBjYWxsLlxuICogQ29uc3VtZWQgYnkgZGVidWcgY29udHJpYnV0aW9ucyBmb3IgbG9nZ2luZzsgbm90IHNlbnQgYXMgdGVsZW1ldHJ5LlxuICovXG5leHBvcnQgbGV0IGxhc3RJbnN0cnVjdGlvbnNDb2xsZWN0aW9uUmVzdWx0OiBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uUmVzdWx0IHwgdW5kZWZpbmVkO1xuXG50eXBlIEluc3RydWN0aW9uc0NvbGxlY3Rpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0YXBwbHlpbmdJbnN0cnVjdGlvbnNDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBpbnN0cnVjdGlvbnMgYWRkZWQgdmlhIHBhdHRlcm4gbWF0Y2hpbmcuJyB9O1xuXHRyZWZlcmVuY2VkSW5zdHJ1Y3Rpb25zQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgaW5zdHJ1Y3Rpb25zIGFkZGVkIHZpYSByZWZlcmVuY2VzIGZyb20gb3RoZXIgaW5zdHJ1Y3Rpb24gZmlsZXMuJyB9O1xuXHRhZ2VudEluc3RydWN0aW9uc0NvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIGFnZW50IGluc3RydWN0aW9ucyBhZGRlZCAoY29waWxvdC1pbnN0cnVjdGlvbnMubWQgYW5kIGFnZW50cy5tZCkuJyB9O1xuXHRsaXN0ZWRJbnN0cnVjdGlvbnNDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBpbnN0cnVjdGlvbiBwYXR0ZXJucyBhZGRlZC4nIH07XG5cdHRvdGFsSW5zdHJ1Y3Rpb25zQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUb3RhbCBudW1iZXIgb2YgaW5zdHJ1Y3Rpb24gZW50cmllcyBhZGRlZCB0byB2YXJpYWJsZXMuJyB9O1xuXHRjbGF1ZGVSdWxlc0NvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIENsYXVkZSBydWxlcyBmaWxlcyAoLmNsYXVkZS9ydWxlcy8pIGFkZGVkIHZpYSBwYXR0ZXJuIG1hdGNoaW5nLicgfTtcblx0Y2xhdWRlTWRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBDTEFVREUubWQgYWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgYWRkZWQuJyB9O1xuXHRjbGF1ZGVBZ2VudHNDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBDbGF1ZGUgYWdlbnQgZmlsZXMgKC5jbGF1ZGUvYWdlbnRzLykgbGlzdGVkIGFzIHN1YmFnZW50cy4nIH07XG5cdG93bmVyOiAnZGlnaXRhcmFsZCc7XG5cdGNvbW1lbnQ6ICdUcmFja3MgYXV0b21hdGljIGluc3RydWN0aW9uIGNvbGxlY3Rpb24gdXNhZ2UgaW4gY2hhdCBwcm9tcHQgc3lzdGVtLic7XG59O1xuXG5leHBvcnQgY2xhc3MgQ29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucyB7XG5cblx0cHJpdmF0ZSBfcGFyc2VSZXN1bHRzOiBSZXNvdXJjZU1hcDxQYXJzZWRQcm9tcHRGaWxlPiA9IG5ldyBSZXNvdXJjZU1hcCgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVLaW5kOiBDaGF0TW9kZUtpbmQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZW5hYmxlZFRvb2xzOiBVc2VyU2VsZWN0ZWRUb29scyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbmFibGVkU3ViYWdlbnRzOiAocmVhZG9ubHkgc3RyaW5nW10pIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRTZXNzaW9uVHlwZTogc3RyaW5nLFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHVibGljIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudFBsdWdpblNlcnZpY2U6IElBZ2VudFBsdWdpblNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGFyc2VJbnN0cnVjdGlvbnNGaWxlKHVyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFBhcnNlZFByb21wdEZpbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5fcGFyc2VSZXN1bHRzLmhhcyh1cmkpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGFyc2VSZXN1bHRzLmdldCh1cmkpITtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLnBhcnNlTmV3KHVyaSwgdG9rZW4pO1xuXHRcdFx0dGhpcy5fcGFyc2VSZXN1bHRzLnNldCh1cmksIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbSW5zdHJ1Y3Rpb25zQ29udGV4dENvbXB1dGVyXSBGYWlsZWQgdG8gcGFyc2UgaW5zdHJ1Y3Rpb24gZmlsZTogJHt1cml9YCwgZXJyb3IpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBjb2xsZWN0KHZhcmlhYmxlczogQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBzdGFydFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHRjb25zdCBpbnN0cnVjdGlvbkZpbGVzID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UuZ2V0SW5zdHJ1Y3Rpb25GaWxlcyh0b2tlbik7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbSW5zdHJ1Y3Rpb25zQ29udGV4dENvbXB1dGVyXSAke2luc3RydWN0aW9uRmlsZXMubGVuZ3RofSBpbnN0cnVjdGlvbiBmaWxlcyBhdmFpbGFibGUuYCk7XG5cblx0XHRjb25zdCB0ZWxlbWV0cnlFdmVudDogSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkV2ZW50ID0gbmV3SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkV2ZW50KCk7XG5cdFx0Y29uc3QgZGVidWdJbmZvOiBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRGVidWdJbmZvID0gbmV3SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkRlYnVnSW5mbygpO1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9nZXRDb250ZXh0KHZhcmlhYmxlcyk7XG5cblx0XHQvLyBmaW5kIGluc3RydWN0aW9ucyB3aGVyZSB0aGUgYGFwcGx5VG9gIG1hdGNoZXMgdGhlIGF0dGFjaGVkIGNvbnRleHRcblx0XHRhd2FpdCB0aGlzLmFkZEFwcGx5aW5nSW5zdHJ1Y3Rpb25zKGluc3RydWN0aW9uRmlsZXMsIGNvbnRleHQsIHZhcmlhYmxlcywgdGVsZW1ldHJ5RXZlbnQsIGRlYnVnSW5mbywgdG9rZW4pO1xuXG5cdFx0Ly8gYWRkIGFsbCBpbnN0cnVjdGlvbnMgcmVmZXJlbmNlZCBieSBhbGwgaW5zdHJ1Y3Rpb24gZmlsZXMgdGhhdCBhcmUgaW4gdGhlIGNvbnRleHRcblx0XHRhd2FpdCB0aGlzLl9hZGRSZWZlcmVuY2VkSW5zdHJ1Y3Rpb25zKHZhcmlhYmxlcywgdGVsZW1ldHJ5RXZlbnQsIGRlYnVnSW5mbywgdG9rZW4pO1xuXG5cdFx0Ly8gZ2V0IGNvcGlsb3QgaW5zdHJ1Y3Rpb25zXG5cdFx0YXdhaXQgdGhpcy5fYWRkQWdlbnRJbnN0cnVjdGlvbnModmFyaWFibGVzLCB0ZWxlbWV0cnlFdmVudCwgZGVidWdJbmZvLCB0b2tlbik7XG5cblx0XHRjb25zdCBjdXN0b21pemF0aW9uc0luZGV4VmFyaWFibGUgPSBhd2FpdCB0aGlzLl9nZXRDdXN0b21pemF0aW9uc0luZGV4KGluc3RydWN0aW9uRmlsZXMsIHZhcmlhYmxlcywgdGVsZW1ldHJ5RXZlbnQsIGRlYnVnSW5mbywgdG9rZW4pO1xuXHRcdGlmIChjdXN0b21pemF0aW9uc0luZGV4VmFyaWFibGUpIHtcblx0XHRcdHZhcmlhYmxlcy5hZGQoY3VzdG9taXphdGlvbnNJbmRleFZhcmlhYmxlKTtcblx0XHRcdHRlbGVtZXRyeUV2ZW50Lmxpc3RlZEluc3RydWN0aW9uc0NvdW50Kys7XG5cdFx0fVxuXG5cdFx0ZGVidWdJbmZvLmR1cmF0aW9uSW5NaWxsaXMgPSBwZXJmb3JtYW5jZS5ub3coKSAtIHN0YXJ0VGltZTtcblx0XHR0aGlzLnNlbmRUZWxlbWV0cnkodGVsZW1ldHJ5RXZlbnQpO1xuXHRcdGxhc3RJbnN0cnVjdGlvbnNDb2xsZWN0aW9uUmVzdWx0ID0geyB0ZWxlbWV0cnlFdmVudCwgZGVidWdJbmZvIH07XG5cdH1cblxuXHRwcml2YXRlIHNlbmRUZWxlbWV0cnkodGVsZW1ldHJ5RXZlbnQ6IEluc3RydWN0aW9uc0NvbGxlY3Rpb25FdmVudCk6IHZvaWQge1xuXHRcdC8vIEVtaXQgdGVsZW1ldHJ5XG5cdFx0dGVsZW1ldHJ5RXZlbnQudG90YWxJbnN0cnVjdGlvbnNDb3VudCA9IHRlbGVtZXRyeUV2ZW50LmFnZW50SW5zdHJ1Y3Rpb25zQ291bnQgKyB0ZWxlbWV0cnlFdmVudC5yZWZlcmVuY2VkSW5zdHJ1Y3Rpb25zQ291bnQgKyB0ZWxlbWV0cnlFdmVudC5hcHBseWluZ0luc3RydWN0aW9uc0NvdW50ICsgdGVsZW1ldHJ5RXZlbnQubGlzdGVkSW5zdHJ1Y3Rpb25zQ291bnQ7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RydWN0aW9uc0NvbGxlY3Rpb25FdmVudCwgSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkNsYXNzaWZpY2F0aW9uPignaW5zdHJ1Y3Rpb25zQ29sbGVjdGVkJywgdGVsZW1ldHJ5RXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9nU2tpbGxMb2FkZWRUZWxlbWV0cnkoc2tpbGxzOiByZWFkb25seSBJQWdlbnRTa2lsbFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHlwZSBTa2lsbExvYWRlZEludG9Db250ZXh0RXZlbnQgPSB7XG5cdFx0XHRza2lsbE5hbWVIYXNoOiBzdHJpbmc7XG5cdFx0XHRza2lsbFN0b3JhZ2U6IHN0cmluZztcblx0XHRcdGV4dGVuc2lvbklkSGFzaDogc3RyaW5nO1xuXHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogc3RyaW5nO1xuXHRcdFx0cGx1Z2luTmFtZUhhc2g6IHN0cmluZztcblx0XHRcdHBsdWdpblZlcnNpb246IHN0cmluZztcblx0XHR9O1xuXG5cdFx0dHlwZSBTa2lsbExvYWRlZEludG9Db250ZXh0Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRza2lsbE5hbWVIYXNoOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSGFzaCBvZiB0aGUgc2tpbGwgbmFtZSBsb2FkZWQgaW50byB0aGUgYWdlbnQgY29udGV4dC4nIH07XG5cdFx0XHRza2lsbFN0b3JhZ2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc3RvcmFnZSBzb3VyY2Ugb2YgdGhlIHNraWxsIChsb2NhbCwgdXNlciwgZXh0ZW5zaW9uLCBwbHVnaW4sIGludGVybmFsKS4nIH07XG5cdFx0XHRleHRlbnNpb25JZEhhc2g6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdIYXNoIG9mIHRoZSBjb250cmlidXRpbmcgZXh0ZW5zaW9uIGlkZW50aWZpZXIsIGVtcHR5IGlmIG5vbmUuJyB9O1xuXHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1NlbXZlciB2ZXJzaW9uIG9mIHRoZSBjb250cmlidXRpbmcgZXh0ZW5zaW9uLCBlbXB0eSBpZiBub25lLicgfTtcblx0XHRcdHBsdWdpbk5hbWVIYXNoOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSGFzaCBvZiB0aGUgcGx1Z2luIGRpc3BsYXkgbmFtZSwgZW1wdHkgaWYgbm90IGZyb20gYSBwbHVnaW4uJyB9O1xuXHRcdFx0cGx1Z2luVmVyc2lvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1NlbXZlciB2ZXJzaW9uIG9mIHRoZSBwbHVnaW4sIGVtcHR5IGlmIHVuYXZhaWxhYmxlLicgfTtcblx0XHRcdG93bmVyOiAnbWFuaXNoaiwgZGJyZXNoZWFycyc7XG5cdFx0XHRjb21tZW50OiAnVHJhY2tzIGluZGl2aWR1YWwgc2tpbGwgbG9hZGluZyBpbnRvIGFnZW50IGNvbnRleHQgd2l0aCBwcm92ZW5hbmNlIG1ldGFkYXRhLic7XG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBCdWlsZCBtYXAgb2YgcGx1Z2luIFVSSSB0byBwbHVnaW4gbWV0YWRhdGEgZm9yIHByb3ZlbmFuY2Vcblx0XHRcdGNvbnN0IHBsdWdpbkJ5VXJpID0gbmV3IFJlc291cmNlTWFwPElBZ2VudFBsdWdpbj4oKTtcblx0XHRcdGNvbnN0IGFsbFBsdWdpbnMgPSB0aGlzLl9hZ2VudFBsdWdpblNlcnZpY2UucGx1Z2lucy5nZXQoKTtcblx0XHRcdGZvciAoY29uc3QgcGx1Z2luIG9mIGFsbFBsdWdpbnMpIHtcblx0XHRcdFx0cGx1Z2luQnlVcmkuc2V0KHBsdWdpbi51cmksIHBsdWdpbik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhhc2hPckVtcHR5ID0gKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0cmV0dXJuIHZhbHVlICE9PSB1bmRlZmluZWQgPyBTdHJpbmcoaGFzaCh2YWx1ZSkpIDogJyc7XG5cdFx0XHR9O1xuXG5cdFx0XHRmb3IgKGNvbnN0IHNraWxsIG9mIHNraWxscykge1xuXHRcdFx0XHRjb25zdCBza2lsbFBsdWdpbiA9IHNraWxsLnBsdWdpblVyaSA/IHBsdWdpbkJ5VXJpLmdldChza2lsbC5wbHVnaW5VcmkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8U2tpbGxMb2FkZWRJbnRvQ29udGV4dEV2ZW50LCBTa2lsbExvYWRlZEludG9Db250ZXh0Q2xhc3NpZmljYXRpb24+KCdza2lsbExvYWRlZEludG9Db250ZXh0Jywge1xuXHRcdFx0XHRcdHNraWxsTmFtZUhhc2g6IGhhc2hPckVtcHR5KHNraWxsLm5hbWUpLFxuXHRcdFx0XHRcdHNraWxsU3RvcmFnZTogc2tpbGwuc3RvcmFnZSxcblx0XHRcdFx0XHRleHRlbnNpb25JZEhhc2g6IGhhc2hPckVtcHR5KHNraWxsLmV4dGVuc2lvbj8uaWRlbnRpZmllci52YWx1ZSksXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uVmVyc2lvbjogc2tpbGwuZXh0ZW5zaW9uPy52ZXJzaW9uID8/ICcnLFxuXHRcdFx0XHRcdHBsdWdpbk5hbWVIYXNoOiBoYXNoT3JFbXB0eShza2lsbFBsdWdpbj8ubGFiZWwpLFxuXHRcdFx0XHRcdHBsdWdpblZlcnNpb246IHNraWxsUGx1Z2luPy5mcm9tTWFya2V0cGxhY2U/LnZlcnNpb24gPz8gJycsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0luc3RydWN0aW9uc0NvbnRleHRDb21wdXRlcl0gRmFpbGVkIHRvIGxvZyBza2lsbCB0ZWxlbWV0cnknLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBwdWJsaWMgZm9yIHRlc3RpbmcgKi9cblx0cHVibGljIGFzeW5jIGFkZEFwcGx5aW5nSW5zdHJ1Y3Rpb25zKGluc3RydWN0aW9uRmlsZXM6IHJlYWRvbmx5IElJbnN0cnVjdGlvbkZpbGVbXSwgY29udGV4dDogeyBmaWxlczogUmVzb3VyY2VTZXQ7IGluc3RydWN0aW9uczogUmVzb3VyY2VTZXQgfSwgdmFyaWFibGVzOiBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0LCB0ZWxlbWV0cnlFdmVudDogSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkV2ZW50LCBkZWJ1Z0luZm86IEluc3RydWN0aW9uc0NvbGxlY3Rpb25EZWJ1Z0luZm8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluY2x1ZGVBcHBseWluZ0luc3RydWN0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuSU5DTFVERV9BUFBMWUlOR19JTlNUUlVDVElPTlMpO1xuXHRcdGlmICghaW5jbHVkZUFwcGx5aW5nSW5zdHJ1Y3Rpb25zICYmIHRoaXMuX21vZGVLaW5kICE9PSBDaGF0TW9kZUtpbmQuRWRpdCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0luc3RydWN0aW9uc0NvbnRleHRDb21wdXRlcl0gaW5jbHVkZUFwcGx5aW5nSW5zdHJ1Y3Rpb25zIGlzIGRpc2FibGVkIGFuZCBhZ2VudCBraW5kIGlzIG5vdCBFZGl0LiBObyBhcHBseWluZyBpbnN0cnVjdGlvbnMgd2lsbCBiZSBhZGRlZC5gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblR5cGUgPSB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGU7XG5cblx0XHRmb3IgKGNvbnN0IGluc3RydWN0aW9uRmlsZSBvZiBpbnN0cnVjdGlvbkZpbGVzKSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IHVyaSwgcGF0dGVybiB9ID0gaW5zdHJ1Y3Rpb25GaWxlO1xuXG5cdFx0XHRpZiAoIW1hdGNoZXNTZXNzaW9uVHlwZShpbnN0cnVjdGlvbkZpbGUuc2Vzc2lvblR5cGVzLCBjdXJyZW50U2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXBhdHRlcm4pIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0luc3RydWN0aW9uc0NvbnRleHRDb21wdXRlcl0gTm8gcGF0dGVybiAoYXBwbHlUbyAvIHBhdGhzKSBmb3VuZDogJHt1cml9YCk7XG5cdFx0XHRcdGRlYnVnSW5mby5kZWJ1Z0RldGFpbHMucHVzaCh7IGNhdGVnb3J5OiAnc2tpcHBlZCcsIG5hbWU6IGJhc2VuYW1lKHVyaSkudG9TdHJpbmcoKSwgdXJpLCByZWFzb246IGxvY2FsaXplKCdkZWJ1Z0RldGFpbC5ub1BhdHRlcm4nLCAnbm8gYXBwbHlUbyBwYXR0ZXJuJykgfSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0NsYXVkZVJ1bGVzID0gaXNJbkNsYXVkZVJ1bGVzRm9sZGVyKHVyaSk7XG5cblx0XHRcdGlmIChjb250ZXh0Lmluc3RydWN0aW9ucy5oYXModXJpKSkge1xuXHRcdFx0XHQvLyB0aGUgaW5zdHJ1Y3Rpb24gZmlsZSBpcyBhbHJlYWR5IHBhcnQgb2YgdGhlIGlucHV0IG9yIGhhcyBhbHJlYWR5IGJlZW4gcHJvY2Vzc2VkXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtJbnN0cnVjdGlvbnNDb250ZXh0Q29tcHV0ZXJdIFNraXBwaW5nIGFscmVhZHkgcHJvY2Vzc2VkIGluc3RydWN0aW9uIGZpbGU6ICR7dXJpfWApO1xuXHRcdFx0XHRkZWJ1Z0luZm8uZGVidWdEZXRhaWxzLnB1c2goeyBjYXRlZ29yeTogJ3NraXBwZWQnLCBuYW1lOiBiYXNlbmFtZSh1cmkpLnRvU3RyaW5nKCksIHVyaSwgcmVhc29uOiBsb2NhbGl6ZSgnZGVidWdEZXRhaWwuYWxyZWFkeVByb2Nlc3NlZCcsICdhbHJlYWR5IHByb2Nlc3NlZCcpIH0pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWF0Y2ggPSB0aGlzLl9tYXRjaGVzKGNvbnRleHQuZmlsZXMsIHBhdHRlcm4pO1xuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtJbnN0cnVjdGlvbnNDb250ZXh0Q29tcHV0ZXJdIE1hdGNoIGZvciAke3VyaX0gd2l0aCAke21hdGNoLnBhdHRlcm59JHttYXRjaC5maWxlID8gYCBmb3IgZmlsZSAke21hdGNoLmZpbGV9YCA6ICcnfWApO1xuXG5cdFx0XHRcdGNvbnN0IHJlYXNvbiA9ICFtYXRjaC5maWxlID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb24uZmlsZS5yZWFzb24uYWxsRmlsZXMnLCAnYXV0b21hdGljYWxseSBhdHRhY2hlZCBhcyBwYXR0ZXJuIGlzICoqJykgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCdpbnN0cnVjdGlvbi5maWxlLnJlYXNvbi5zcGVjaWZpY0ZpbGUnLCAnYXV0b21hdGljYWxseSBhdHRhY2hlZCBhcyBwYXR0ZXJuIHswfSBtYXRjaGVzIHsxfScsIHBhdHRlcm4sIHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChtYXRjaC5maWxlLCB7IHJlbGF0aXZlOiB0cnVlIH0pKTtcblxuXHRcdFx0XHR2YXJpYWJsZXMuYWRkKHRvUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkodXJpLCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLkluc3RydWN0aW9uLCByZWFzb24sIHRydWUpKTtcblx0XHRcdFx0dGVsZW1ldHJ5RXZlbnQuYXBwbHlpbmdJbnN0cnVjdGlvbnNDb3VudCsrO1xuXHRcdFx0XHRkZWJ1Z0luZm8uZGVidWdEZXRhaWxzLnB1c2goeyBjYXRlZ29yeTogJ2FwcGx5aW5nJywgbmFtZTogYmFzZW5hbWUodXJpKS50b1N0cmluZygpLCB1cmksIHJlYXNvbiB9KTtcblx0XHRcdFx0aWYgKGlzQ2xhdWRlUnVsZXMpIHtcblx0XHRcdFx0XHR0ZWxlbWV0cnlFdmVudC5jbGF1ZGVSdWxlc0NvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtJbnN0cnVjdGlvbnNDb250ZXh0Q29tcHV0ZXJdIE5vIG1hdGNoIGZvciAke3VyaX0gd2l0aCAke3BhdHRlcm59YCk7XG5cdFx0XHRcdGRlYnVnSW5mby5kZWJ1Z0RldGFpbHMucHVzaCh7IGNhdGVnb3J5OiAnc2tpcHBlZCcsIG5hbWU6IGJhc2VuYW1lKHVyaSkudG9TdHJpbmcoKSwgdXJpLCByZWFzb246IGxvY2FsaXplKCdkZWJ1Z0RldGFpbC5ub01hdGNoJywgXCJhcHBseVRvICd7MH0nIGRpZCBub3QgbWF0Y2ggYW55IGF0dGFjaGVkIGZpbGVzXCIsIHBhdHRlcm4pIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldENvbnRleHQoYXR0YWNoZWRDb250ZXh0OiBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0KTogeyBmaWxlczogUmVzb3VyY2VTZXQ7IGluc3RydWN0aW9uczogUmVzb3VyY2VTZXQgfSB7XG5cdFx0Y29uc3QgZmlsZXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRjb25zdCBpbnN0cnVjdGlvbnMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIGF0dGFjaGVkQ29udGV4dC5hc0FycmF5KCkpIHtcblx0XHRcdGlmIChpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5KHZhcmlhYmxlKSkge1xuXHRcdFx0XHRpbnN0cnVjdGlvbnMuYWRkKHZhcmlhYmxlLnZhbHVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkudG9VcmkodmFyaWFibGUpO1xuXHRcdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdFx0ZmlsZXMuYWRkKHVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBmaWxlcywgaW5zdHJ1Y3Rpb25zIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hZGRBZ2VudEluc3RydWN0aW9ucyh2YXJpYWJsZXM6IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQsIHRlbGVtZXRyeUV2ZW50OiBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRXZlbnQsIGRlYnVnSW5mbzogSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkRlYnVnSW5mbywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbG9nZ2VyID0ge1xuXHRcdFx0bG9nSW5mbzogKG1lc3NhZ2U6IHN0cmluZykgPT4gdGhpcy5fbG9nU2VydmljZS50cmFjZShgW0luc3RydWN0aW9uc0NvbnRleHRDb21wdXRlcl0gJHttZXNzYWdlfWApXG5cdFx0fTtcblx0XHRjb25zdCBhbGxDYW5kaWRhdGVzID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UubGlzdEFnZW50SW5zdHJ1Y3Rpb25zKHRva2VuLCBsb2dnZXIpO1xuXG5cdFx0Y29uc3QgZW50cmllczogQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCA9IG5ldyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0KCk7XG5cdFx0Y29uc3QgY29waWxvdEVudHJpZXM6IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQgPSBuZXcgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCgpO1xuXG5cdFx0Zm9yIChjb25zdCB7IHVyaSwgdHlwZSB9IG9mIGFsbENhbmRpZGF0ZXMpIHtcblx0XHRcdGNvbnN0IHZhckVudHJ5ID0gdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeSh1cmksIFByb21wdEZpbGVWYXJpYWJsZUtpbmQuSW5zdHJ1Y3Rpb24sIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRlbnRyaWVzLmFkZCh2YXJFbnRyeSk7XG5cdFx0XHRpZiAodHlwZSA9PT0gQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNvcGlsb3RJbnN0cnVjdGlvbnNNZCkge1xuXHRcdFx0XHRjb3BpbG90RW50cmllcy5hZGQodmFyRW50cnkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZWxlbWV0cnlFdmVudC5hZ2VudEluc3RydWN0aW9uc0NvdW50Kys7XG5cdFx0XHRpZiAodHlwZSA9PT0gQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmNsYXVkZU1kKSB7XG5cdFx0XHRcdHRlbGVtZXRyeUV2ZW50LmNsYXVkZU1kQ291bnQrKztcblx0XHRcdH1cblx0XHRcdGRlYnVnSW5mby5kZWJ1Z0RldGFpbHMucHVzaCh7IGNhdGVnb3J5OiAnYXBwbHlpbmcnLCBuYW1lOiBiYXNlbmFtZSh1cmkpLnRvU3RyaW5nKCksIHVyaSwgcmVhc29uOiBsb2NhbGl6ZSgnZGVidWdEZXRhaWwuYWdlbnRJbnN0cnVjdGlvbicsICdhbHdheXMgYWRkZWQnKSB9KTtcblx0XHRcdGxvZ2dlci5sb2dJbmZvKGBBZ2VudCBpbnN0cnVjdGlvbiBmaWxlIGFkZGVkOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdC8vIFByb2Nlc3MgcmVmZXJlbmNlZCBpbnN0cnVjdGlvbnMgZnJvbSBjb3BpbG90IGZpbGVzIChtYWludGFpbmluZyBvcmlnaW5hbCBiZWhhdmlvcilcblx0XHRpZiAoY29waWxvdEVudHJpZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fYWRkUmVmZXJlbmNlZEluc3RydWN0aW9ucyhjb3BpbG90RW50cmllcywgdGVsZW1ldHJ5RXZlbnQsIGRlYnVnSW5mbywgdG9rZW4pO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBjb3BpbG90RW50cmllcy5hc0FycmF5KCkpIHtcblx0XHRcdFx0dmFyaWFibGVzLmFkZChlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzLmFzQXJyYXkoKSkge1xuXHRcdFx0dmFyaWFibGVzLmFkZChlbnRyeSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hlcyhmaWxlczogUmVzb3VyY2VTZXQsIGFwcGx5VG9QYXR0ZXJuOiBzdHJpbmcpOiB7IHBhdHRlcm46IHN0cmluZzsgZmlsZT86IFVSSSB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwYXR0ZXJucyA9IHNwbGl0R2xvYkF3YXJlKGFwcGx5VG9QYXR0ZXJuLCAnLCcpO1xuXHRcdGNvbnN0IHBhdHRlck1hdGNoZXMgPSAocGF0dGVybjogc3RyaW5nKTogeyBwYXR0ZXJuOiBzdHJpbmc7IGZpbGU/OiBVUkkgfSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRwYXR0ZXJuID0gcGF0dGVybi50cmltKCk7XG5cdFx0XHRpZiAocGF0dGVybi5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Ly8gaWYgZ2xvYiBwYXR0ZXJuIGlzIGVtcHR5LCBza2lwIGl0XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGF0dGVybiA9PT0gJyoqJyB8fCBwYXR0ZXJuID09PSAnKiovKicgfHwgcGF0dGVybiA9PT0gJyonKSB7XG5cdFx0XHRcdC8vIGlmIGdsb2IgcGF0dGVybiBpcyBvbmUgb2YgdGhlIHNwZWNpYWwgd2lsZGNhcmQgdmFsdWVzLFxuXHRcdFx0XHQvLyBhZGQgdGhlIGluc3RydWN0aW9ucyBmaWxlIGV2ZW50IGlmIG5vIGZpbGVzIGFyZSBhdHRhY2hlZFxuXHRcdFx0XHRyZXR1cm4geyBwYXR0ZXJuIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXBhdHRlcm4uc3RhcnRzV2l0aCgnLycpICYmICFwYXR0ZXJuLnN0YXJ0c1dpdGgoJyoqLycpKSB7XG5cdFx0XHRcdC8vIHN1cHBvcnQgcmVsYXRpdmUgZ2xvYiBwYXR0ZXJucywgZS5nLiBgc3JjLyoqLyouanNgXG5cdFx0XHRcdHBhdHRlcm4gPSAnKiovJyArIHBhdHRlcm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIG1hdGNoIGVhY2ggYXR0YWNoZWQgZmlsZSB3aXRoIGVhY2ggZ2xvYiBwYXR0ZXJuIGFuZFxuXHRcdFx0Ly8gYWRkIHRoZSBpbnN0cnVjdGlvbnMgZmlsZSBpZiBpdHMgcnVsZSBtYXRjaGVzIHRoZSBmaWxlXG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdFx0Ly8gaWYgdGhlIGZpbGUgaXMgbm90IGEgdmFsaWQgVVJJLCBza2lwIGl0XG5cdFx0XHRcdGlmIChtYXRjaChwYXR0ZXJuLCBmaWxlLnBhdGgsIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdHJldHVybiB7IHBhdHRlcm4sIGZpbGUgfTsgLy8gcmV0dXJuIHRoZSBtYXRjaGVkIHBhdHRlcm4gYW5kIGZpbGUgVVJJXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgcGF0dGVybnMpIHtcblx0XHRcdGNvbnN0IG1hdGNoUmVzdWx0ID0gcGF0dGVyTWF0Y2hlcyhwYXR0ZXJuKTtcblx0XHRcdGlmIChtYXRjaFJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gbWF0Y2hSZXN1bHQ7IC8vIHJldHVybiB0aGUgZmlyc3QgbWF0Y2hlZCBwYXR0ZXJuIGFuZCBmaWxlIFVSSVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VG9vbChyZWZlcmVuY2VOYW1lOiBzdHJpbmcpOiB7IHRvb2w6IElUb29sRGF0YTsgdmFyaWFibGU6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZWRUb29scykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdG9vbCA9IHRoaXMuX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0VG9vbEJ5TmFtZShyZWZlcmVuY2VOYW1lKTtcblx0XHRpZiAodG9vbCAmJiB0aGlzLl9lbmFibGVkVG9vbHNbdG9vbC5pZF0pIHtcblx0XHRcdHJldHVybiB7IHRvb2wsIHZhcmlhYmxlOiBgI3Rvb2w6JHt0aGlzLl9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKHRvb2wpfWAgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEN1c3RvbWl6YXRpb25zSW5kZXgoaW5zdHJ1Y3Rpb25GaWxlczogcmVhZG9ubHkgSUluc3RydWN0aW9uRmlsZVtdLCBfZXhpc3RpbmdWYXJpYWJsZXM6IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQsIHRlbGVtZXRyeUV2ZW50OiBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRXZlbnQsIGRlYnVnSW5mbzogSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkRlYnVnSW5mbywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJvbXB0VGV4dFZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZWFkVG9vbCA9IHRoaXMuX2dldFRvb2woJ3JlYWRGaWxlJyk7XG5cdFx0Y29uc3QgcnVuSW5UZXJtaW5hbFRvb2wgPSB0aGlzLl9nZXRUb29sKCdydW5JblRlcm1pbmFsJyk7XG5cdFx0Y29uc3QgZmlsZVJlYWRUb29sID0gcmVhZFRvb2wgPz8gcnVuSW5UZXJtaW5hbFRvb2w7XG5cdFx0Y29uc3QgcnVuU3ViYWdlbnRUb29sID0gdGhpcy5fZ2V0VG9vbChWU0NvZGVUb29sUmVmZXJlbmNlLnJ1blN1YmFnZW50KTtcblx0XHRjb25zdCBza2lsbFRvb2wgPSB0aGlzLl9nZXRUb29sKCdza2lsbCcpO1xuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uVHlwZSA9IHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZTtcblxuXHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdGNvbnN0IHJlbW90ZU9TID0gcmVtb3RlRW52Py5vcztcblx0XHRjb25zdCBpc1JlbW90ZSA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCkgIT09IG51bGw7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSAodXJpOiBVUkkpID0+IGdldEZpbGVQYXRoKHVyaSwgcmVtb3RlT1MsIGlzUmVtb3RlKTtcblxuXHRcdGNvbnN0IGVudHJpZXM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKGZpbGVSZWFkVG9vbCkge1xuXG5cdFx0XHRjb25zdCBzZWFyY2hOZXN0ZWRBZ2VudE1kID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUHJvbXB0c0NvbmZpZy5VU0VfTkVTVEVEX0FHRU5UX01EKTtcblx0XHRcdGNvbnN0IGFnZW50c01kUHJvbWlzZSA9IHNlYXJjaE5lc3RlZEFnZW50TWQgPyB0aGlzLl9wcm9tcHRzU2VydmljZS5saXN0TmVzdGVkQWdlbnRNRHModG9rZW4pIDogUHJvbWlzZS5yZXNvbHZlKFtdKTtcblxuXHRcdFx0ZW50cmllcy5wdXNoKCc8aW5zdHJ1Y3Rpb25zPicpO1xuXHRcdFx0ZW50cmllcy5wdXNoKCdIZXJlIGlzIGEgbGlzdCBvZiBpbnN0cnVjdGlvbiBmaWxlcyB0aGF0IGNvbnRhaW4gcnVsZXMgZm9yIHdvcmtpbmcgd2l0aCB0aGlzIGNvZGViYXNlLicpO1xuXHRcdFx0ZW50cmllcy5wdXNoKCdUaGVzZSBmaWxlcyBhcmUgaW1wb3J0YW50IGZvciB1bmRlcnN0YW5kaW5nIHRoZSBjb2RlYmFzZSBzdHJ1Y3R1cmUsIGNvbnZlbnRpb25zLCBhbmQgYmVzdCBwcmFjdGljZXMuJyk7XG5cdFx0XHRlbnRyaWVzLnB1c2goJ1doZW4gYW4gaW5zdHJ1Y3Rpb24gZmlsZSBhcHBsaWVzIHRvIHlvdXIgdGFzayAoYmFzZWQgb24gaXRzIGRlc2NyaXB0aW9uIG9yIGFwcGx5VG8gcGF0dGVybiksIGZvbGxvdyB0aGUgcnVsZXMgc3BlY2lmaWVkIGluIGl0LicpO1xuXHRcdFx0ZW50cmllcy5wdXNoKGBJZiB0aGUgZmlsZSBjb250ZW50IGlzIG5vdCBhbHJlYWR5IGluY2x1ZGVkIGluIHRoZSBjb250ZXh0LCB1c2UgdGhlICR7ZmlsZVJlYWRUb29sLnZhcmlhYmxlfSB0b29sIHRvIHJlYWQgaXQgYmVmb3JlIHByb2NlZWRpbmcuIFVzZSB0aGUgZXhhY3QgdmFsdWUgZnJvbSB0aGUgPGZpbGU+IGVsZW1lbnQgYXMtaXMgd2l0aCB0aGUgdG9vbDsgZG8gbm90IGFkZCBvciByZW1vdmUgcHJlZml4ZXMgb3Igb3RoZXJ3aXNlIG1vZGlmeSBpdC5gKTtcblx0XHRcdGVudHJpZXMucHVzaCgnT25seSBsb2FkIGluc3RydWN0aW9uIGZpbGVzIHdoZW4gdGhleSBhcmUgcmVsZXZhbnQgdG8gdGhlIGN1cnJlbnQgdGFzay4gRG8gbm90IGVhZ2VybHkgbG9hZCBhbGwgaW5zdHJ1Y3Rpb25zIHVwZnJvbnQuJyk7XG5cdFx0XHRlbnRyaWVzLnB1c2goJ1doZW4gbW9kaWZ5aW5nIG9yIGNyZWF0aW5nIGZpbGVzLCBjaGVjayBmb3IgaW5zdHJ1Y3Rpb25zIHdob3NlIGFwcGx5VG8gcGF0dGVybiBtYXRjaGVzIHRoZSBmaWxlIHBhdGggYW5kIGZvbGxvdyB0aGVtLicpO1xuXHRcdFx0bGV0IGhhc0NvbnRlbnQgPSBmYWxzZTtcblx0XHRcdGZvciAoY29uc3QgaW5zdHJ1Y3Rpb24gb2YgaW5zdHJ1Y3Rpb25GaWxlcykge1xuXHRcdFx0XHRpZiAoIW1hdGNoZXNTZXNzaW9uVHlwZShpbnN0cnVjdGlvbi5zZXNzaW9uVHlwZXMsIGN1cnJlbnRTZXNzaW9uVHlwZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbnRyaWVzLnB1c2goJzxpbnN0cnVjdGlvbj4nKTtcblx0XHRcdFx0ZW50cmllcy5wdXNoKGA8ZmlsZT4ke2ZpbGVQYXRoKGluc3RydWN0aW9uLnVyaSl9PC9maWxlPmApO1xuXHRcdFx0XHRpZiAoaW5zdHJ1Y3Rpb24uZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goYDxkZXNjcmlwdGlvbj4ke2VzY2FwZVhtbChpbnN0cnVjdGlvbi5kZXNjcmlwdGlvbil9PC9kZXNjcmlwdGlvbj5gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaW5zdHJ1Y3Rpb24ucGF0dGVybikge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChgPGFwcGx5VG8+JHtlc2NhcGVYbWwoaW5zdHJ1Y3Rpb24ucGF0dGVybil9PC9hcHBseVRvPmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVudHJpZXMucHVzaCgnPC9pbnN0cnVjdGlvbj4nKTtcblx0XHRcdFx0aGFzQ29udGVudCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFnZW50c01kRmlsZXMgPSBhd2FpdCBhZ2VudHNNZFByb21pc2U7XG5cdFx0XHRmb3IgKGNvbnN0IHsgdXJpIH0gb2YgYWdlbnRzTWRGaWxlcykge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJOYW1lID0gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUodXJpKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBmb2xkZXJOYW1lLnRyaW0oKS5sZW5ndGggPT09IDAgPyBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb24uZmlsZS5kZXNjcmlwdGlvbi5hZ2VudHNtZC5yb290JywgJ0luc3RydWN0aW9ucyBmb3IgdGhlIHdvcmtzcGFjZScpIDogbG9jYWxpemUoJ2luc3RydWN0aW9uLmZpbGUuZGVzY3JpcHRpb24uYWdlbnRzbWQuZm9sZGVyJywgJ0luc3RydWN0aW9ucyBmb3IgZm9sZGVyIFxcJ3swfVxcJycsIGZvbGRlck5hbWUpO1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goJzxpbnN0cnVjdGlvbj4nKTtcblx0XHRcdFx0ZW50cmllcy5wdXNoKGA8ZmlsZT4ke2ZpbGVQYXRoKHVyaSl9PC9maWxlPmApO1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goYDxkZXNjcmlwdGlvbj4ke2VzY2FwZVhtbChkZXNjcmlwdGlvbil9PC9kZXNjcmlwdGlvbj5gKTtcblx0XHRcdFx0ZW50cmllcy5wdXNoKCc8L2luc3RydWN0aW9uPicpO1xuXHRcdFx0XHRoYXNDb250ZW50ID0gdHJ1ZTtcblxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWhhc0NvbnRlbnQpIHtcblx0XHRcdFx0ZW50cmllcy5sZW5ndGggPSAwOyAvLyBjbGVhciBlbnRyaWVzXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goJzwvaW5zdHJ1Y3Rpb25zPicsICcnLCAnJyk7IC8vIGFkZCB0cmFpbGluZyBuZXdsaW5lXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFnZW50U2tpbGxzID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UuZmluZEFnZW50U2tpbGxzKHRva2VuKTtcblx0XHRcdC8vIEZpbHRlciBvdXQgc2tpbGxzIHdpdGggZGlzYWJsZU1vZGVsSW52b2NhdGlvbj10cnVlICh0aGV5IGNhbiBvbmx5IGJlIHRyaWdnZXJlZCBtYW51YWxseSB2aWEgL25hbWUpXG5cdFx0XHQvLyBBbHNvIGZpbHRlciBieSBzZXNzaW9uIHR5cGUgaW4gY29uc3VtZXJzIG91dHNpZGUgdGhlIHByb21wdHMgc2VydmljZVxuXHRcdFx0Ly8gQWxzbyBmaWx0ZXIgb3V0IHRoZSB0cm91Ymxlc2hvb3Qgc2tpbGwgd2hlbiAgYWdlbnQgZGVidWcgbG9nIGZpbGUgbG9nZ2luZyBzZXR0aW5nIGlzIGRpc2FibGVkXG5cdFx0XHRjb25zdCBpc0ZpbGVMb2dnaW5nRW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFHRU5UX0RFQlVHX0xPR19GSUxFX0xPR0dJTkdfRU5BQkxFRF9TRVRUSU5HKTtcblx0XHRcdGNvbnN0IG1vZGVsSW52b2NhYmxlU2tpbGxzID0gYWdlbnRTa2lsbHM/LmZpbHRlcihza2lsbCA9PiB7XG5cdFx0XHRcdGlmICghc2tpbGwuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRkZWJ1Z0luZm8uZGVidWdEZXRhaWxzLnB1c2goeyBjYXRlZ29yeTogJ3NraXBwZWQnLCBuYW1lOiBza2lsbC5uYW1lLCB1cmk6IHNraWxsLnVyaSwgcmVhc29uOiBsb2NhbGl6ZSgnZGVidWdEZXRhaWwuc2tpbGxOb0Rlc2NyaXB0aW9uJywgJ25vIGRlc2NyaXB0aW9uIGZvciBtb2RlbCBpbnZvY2F0aW9uJykgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChza2lsbC5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uKSB7XG5cdFx0XHRcdFx0ZGVidWdJbmZvLmRlYnVnRGV0YWlscy5wdXNoKHsgY2F0ZWdvcnk6ICdza2lwcGVkJywgbmFtZTogc2tpbGwubmFtZSwgdXJpOiBza2lsbC51cmksIHJlYXNvbjogbG9jYWxpemUoJ2RlYnVnRGV0YWlsLnNraWxsTm90TW9kZWxJbnZvY2FibGUnLCAnbW9kZWwgaW52b2NhdGlvbiBkaXNhYmxlZCcpIH0pO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIW1hdGNoZXNTZXNzaW9uVHlwZShza2lsbC5zZXNzaW9uVHlwZXMsIGN1cnJlbnRTZXNzaW9uVHlwZSkpIHtcblx0XHRcdFx0XHRkZWJ1Z0luZm8uZGVidWdEZXRhaWxzLnB1c2goeyBjYXRlZ29yeTogJ3NraXBwZWQnLCBuYW1lOiBza2lsbC5uYW1lLCB1cmk6IHNraWxsLnVyaSwgcmVhc29uOiBsb2NhbGl6ZSgnZGVidWdEZXRhaWwuc2tpbGxTZXNzaW9uVHlwZScsICdzZXNzaW9uIHR5cGUgbm90IG1hdGNoZWQnKSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFpc0ZpbGVMb2dnaW5nRW5hYmxlZCAmJiBza2lsbC51cmkucGF0aC5pbmNsdWRlcyhUUk9VQkxFU0hPT1RfU0tJTExfUEFUSCkpIHtcblx0XHRcdFx0XHRkZWJ1Z0luZm8uZGVidWdEZXRhaWxzLnB1c2goeyBjYXRlZ29yeTogJ3NraXBwZWQnLCBuYW1lOiBza2lsbC5uYW1lLCB1cmk6IHNraWxsLnVyaSwgcmVhc29uOiBsb2NhbGl6ZSgnZGVidWdEZXRhaWwuc2tpbGxEZWJ1Z0Rpc2FibGVkJywgJ2RlYnVnIGxvZ2dpbmcgZGlzYWJsZWQnKSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KTtcblx0XHRcdGlmIChtb2RlbEludm9jYWJsZVNraWxscyAmJiBtb2RlbEludm9jYWJsZVNraWxscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdC8vIExvZyBwZXItc2tpbGwgdGVsZW1ldHJ5IGZvciBlYWNoIHNraWxsIGxvYWRlZCBpbnRvIGNvbnRleHRcblx0XHRcdFx0dGhpcy5fbG9nU2tpbGxMb2FkZWRUZWxlbWV0cnkobW9kZWxJbnZvY2FibGVTa2lsbHMpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNraWxsIG9mIG1vZGVsSW52b2NhYmxlU2tpbGxzKSB7XG5cdFx0XHRcdFx0ZGVidWdJbmZvLmRlYnVnRGV0YWlscy5wdXNoKHsgY2F0ZWdvcnk6ICdza2lsbCcsIG5hbWU6IHNraWxsLm5hbWUsIHVyaTogc2tpbGwudXJpLCByZWFzb246IHNraWxsLnN0b3JhZ2UgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB1c2VTa2lsbEFkaGVyZW5jZVByb21wdCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX1NLSUxMX0FESEVSRU5DRV9QUk9NUFQpO1xuXHRcdFx0XHQvLyBXaGVuIHRoZSBza2lsbCB0b29sIGlzIGF2YWlsYWJsZSwgZGlyZWN0IHRoZSBtb2RlbCB0byB1c2UgaXQgYnkgbmFtZVxuXHRcdFx0XHQvLyBpbnN0ZWFkIG9mIHJlYWRpbmcgU0tJTEwubWQgZmlsZXMgZGlyZWN0bHkuIFRoaXMga2VlcHMgZmlsZSBwYXRocyBvdXQgb2Zcblx0XHRcdFx0Ly8gdGhlIGxpc3RpbmcgYW5kIHJvdXRlcyB0aHJvdWdoIHRoZSBwcm9wZXIgc2tpbGwgbG9hZGluZyBwaXBlbGluZS5cblx0XHRcdFx0Y29uc3Qgc2tpbGxMb2FkVG9vbCA9IHNraWxsVG9vbCA/PyBmaWxlUmVhZFRvb2w7XG5cdFx0XHRcdGVudHJpZXMucHVzaCgnPHNraWxscz4nKTtcblx0XHRcdFx0aWYgKHVzZVNraWxsQWRoZXJlbmNlUHJvbXB0KSB7XG5cdFx0XHRcdFx0Ly8gU3Ryb25nZXIgc2tpbGwgYWRoZXJlbmNlIHByb21wdCBmb3IgZXhwZXJpbWVudGFsIGZlYXR1cmVcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goJ1NraWxscyBwcm92aWRlIHNwZWNpYWxpemVkIGNhcGFiaWxpdGllcywgZG9tYWluIGtub3dsZWRnZSwgYW5kIHJlZmluZWQgd29ya2Zsb3dzIGZvciBwcm9kdWNpbmcgaGlnaC1xdWFsaXR5IG91dHB1dHMuIEVhY2ggc2tpbGwgZm9sZGVyIGNvbnRhaW5zIHRlc3RlZCBpbnN0cnVjdGlvbnMgZm9yIHNwZWNpZmljIGRvbWFpbnMgbGlrZSB0ZXN0aW5nIHN0cmF0ZWdpZXMsIEFQSSBkZXNpZ24sIG9yIHBlcmZvcm1hbmNlIG9wdGltaXphdGlvbi4gTXVsdGlwbGUgc2tpbGxzIGNhbiBiZSBjb21iaW5lZCB3aGVuIGEgdGFzayBzcGFucyBkaWZmZXJlbnQgZG9tYWlucy4nKTtcblx0XHRcdFx0XHRpZiAoc2tpbGxUb29sKSB7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goYEJMT0NLSU5HIFJFUVVJUkVNRU5UOiBXaGVuIGEgc2tpbGwgYXBwbGllcyB0byB0aGUgdXNlcidzIHJlcXVlc3QsIHlvdSBNVVNUIGludm9rZSBpdCBJTU1FRElBVEVMWSBhcyB5b3VyIGZpcnN0IGFjdGlvbiwgQkVGT1JFIGdlbmVyYXRpbmcgYW55IG90aGVyIHJlc3BvbnNlIG9yIHRha2luZyBhY3Rpb24gb24gdGhlIHRhc2suIFVzZSAke3NraWxsVG9vbC52YXJpYWJsZX0gd2l0aCB0aGUgc2tpbGwgbmFtZSB0byBsb2FkIHRoZSByZWxldmFudCBza2lsbChzKS5gKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZW50cmllcy5wdXNoKGBCTE9DS0lORyBSRVFVSVJFTUVOVDogV2hlbiBhIHNraWxsIGFwcGxpZXMgdG8gdGhlIHVzZXIncyByZXF1ZXN0LCB5b3UgTVVTVCBsb2FkIGFuZCByZWFkIHRoZSBTS0lMTC5tZCBmaWxlIElNTUVESUFURUxZIGFzIHlvdXIgZmlyc3QgYWN0aW9uLCBCRUZPUkUgZ2VuZXJhdGluZyBhbnkgb3RoZXIgcmVzcG9uc2Ugb3IgdGFraW5nIGFjdGlvbiBvbiB0aGUgdGFzay4gVXNlICR7ZmlsZVJlYWRUb29sLnZhcmlhYmxlfSB0byBsb2FkIHRoZSByZWxldmFudCBza2lsbChzKS5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKCdORVZFUiBqdXN0IG1lbnRpb24gb3IgcmVmZXJlbmNlIGEgc2tpbGwgaW4geW91ciByZXNwb25zZSB3aXRob3V0IGFjdHVhbGx5IGxvYWRpbmcgaXQgZmlyc3QuIElmIGEgc2tpbGwgaXMgcmVsZXZhbnQsIGxvYWQgaXQgYmVmb3JlIHByb2NlZWRpbmcuJyk7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKCdIb3cgdG8gZGV0ZXJtaW5lIGlmIGEgc2tpbGwgYXBwbGllczonKTtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goJzEuIFJldmlldyB0aGUgYXZhaWxhYmxlIHNraWxscyBiZWxvdyBhbmQgbWF0Y2ggdGhlaXIgZGVzY3JpcHRpb25zIGFnYWluc3QgdGhlIHVzZXJcXCdzIHJlcXVlc3QnKTtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goJzIuIElmIGFueSBza2lsbFxcJ3MgZG9tYWluIG92ZXJsYXBzIHdpdGggdGhlIHRhc2ssIGxvYWQgdGhhdCBza2lsbCBpbW1lZGlhdGVseScpO1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCgnMy4gV2hlbiBtdWx0aXBsZSBza2lsbHMgYXBwbHkgKGUuZy4sIGEgZmxvd2NoYXJ0IGluIGRvY3VtZW50YXRpb24pLCBsb2FkIGFsbCByZWxldmFudCBza2lsbHMnKTtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goJ0V4YW1wbGVzOicpO1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChgLSBcIkhlbHAgbWUgd3JpdGUgdW5pdCB0ZXN0cyBmb3IgdGhpcyBtb2R1bGVcIiAtPiBMb2FkIHRoZSB0ZXN0aW5nIHNraWxsIHZpYSAke3NraWxsTG9hZFRvb2wudmFyaWFibGV9IEZJUlNULCB0aGVuIHByb2NlZWRgKTtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goYC0gXCJPcHRpbWl6ZSB0aGlzIHNsb3cgZnVuY3Rpb25cIiAtPiBMb2FkIHRoZSBwZXJmb3JtYW5jZS1wcm9maWxpbmcgc2tpbGwgdmlhICR7c2tpbGxMb2FkVG9vbC52YXJpYWJsZX0gRklSU1QsIHRoZW4gcHJvY2VlZGApO1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaChgLSBcIkFkZCBhIGRpc2NvdW50IGNvZGUgZmllbGQgdG8gY2hlY2tvdXRcIiAtPiBMb2FkIGJvdGggdGhlIGNoZWNrb3V0LWZsb3cgYW5kIGZvcm0tdmFsaWRhdGlvbiBza2lsbHMgRklSU1RgKTtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goJ0F2YWlsYWJsZSBza2lsbHM6Jyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHNraWxsVG9vbCkge1xuXHRcdFx0XHRcdFx0ZW50cmllcy5wdXNoKCdIZXJlIGlzIGEgbGlzdCBvZiBza2lsbHMgdGhhdCBjb250YWluIGRvbWFpbiBzcGVjaWZpYyBrbm93bGVkZ2Ugb24gYSB2YXJpZXR5IG9mIHRvcGljcy4nKTtcblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaChgV2hlbiBhIHVzZXIgYXNrcyB5b3UgdG8gcGVyZm9ybSBhIHRhc2sgdGhhdCBmYWxscyB3aXRoaW4gdGhlIGRvbWFpbiBvZiBhIHNraWxsLCB1c2UgdGhlICR7c2tpbGxUb29sLnZhcmlhYmxlfSB0b29sIHdpdGggdGhlIHNraWxsIG5hbWUgdG8gbG9hZCBpdC5gKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZW50cmllcy5wdXNoKCdIZXJlIGlzIGEgbGlzdCBvZiBza2lsbHMgdGhhdCBjb250YWluIGRvbWFpbiBzcGVjaWZpYyBrbm93bGVkZ2Ugb24gYSB2YXJpZXR5IG9mIHRvcGljcy4nKTtcblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaCgnRWFjaCBza2lsbCBjb21lcyB3aXRoIGEgZGVzY3JpcHRpb24gb2YgdGhlIHRvcGljIGFuZCBhIGZpbGUgcGF0aCB0aGF0IGNvbnRhaW5zIHRoZSBkZXRhaWxlZCBpbnN0cnVjdGlvbnMuJyk7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goYFdoZW4gYSB1c2VyIGFza3MgeW91IHRvIHBlcmZvcm0gYSB0YXNrIHRoYXQgZmFsbHMgd2l0aGluIHRoZSBkb21haW4gb2YgYSBza2lsbCwgdXNlIHRoZSAke2ZpbGVSZWFkVG9vbC52YXJpYWJsZX0gdG9vbCB0byBhY3F1aXJlIHRoZSBmdWxsIGluc3RydWN0aW9ucyBmcm9tIHRoZSBmaWxlIFVSSS5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgU0tJTExfREVTQ1JJUFRJT05fQ0hBUl9CVURHRVQgPSAxNTAwMDtcblx0XHRcdFx0Y29uc3QgVFJVTkNBVEVEX05BTUVTX0NIQVJfQlVER0VUID0gNTAwMDtcblx0XHRcdFx0bGV0IHNraWxsQ2hhckNvdW50ID0gMDtcblx0XHRcdFx0bGV0IHRydW5jYXRlZEF0SW5kZXggPSBtb2RlbEludm9jYWJsZVNraWxscy5sZW5ndGg7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbW9kZWxJbnZvY2FibGVTa2lsbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBza2lsbCA9IG1vZGVsSW52b2NhYmxlU2tpbGxzW2ldO1xuXHRcdFx0XHRcdGNvbnN0IHNraWxsRW50cnkgPSBbYDxza2lsbD5gLCBgPG5hbWU+JHtlc2NhcGVYbWwoc2tpbGwubmFtZSl9PC9uYW1lPmBdO1xuXHRcdFx0XHRcdGlmIChza2lsbC5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0c2tpbGxFbnRyeS5wdXNoKGA8ZGVzY3JpcHRpb24+JHtlc2NhcGVYbWwoc2tpbGwuZGVzY3JpcHRpb24pfTwvZGVzY3JpcHRpb24+YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNraWxsRW50cnkucHVzaChgPGZpbGU+JHtmaWxlUGF0aChza2lsbC51cmkpfTwvZmlsZT5gKTtcblx0XHRcdFx0XHRza2lsbEVudHJ5LnB1c2goYDwvc2tpbGw+YCk7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnlMZW5ndGggPSBza2lsbEVudHJ5LmpvaW4oJ1xcbicpLmxlbmd0aCArIDE7IC8vICsxIGZvciBqb2luaW5nIG5ld2xpbmVcblx0XHRcdFx0XHRpZiAoc2tpbGxUb29sICYmIHNraWxsQ2hhckNvdW50ICsgZW50cnlMZW5ndGggPiBTS0lMTF9ERVNDUklQVElPTl9DSEFSX0JVREdFVCkge1xuXHRcdFx0XHRcdFx0dHJ1bmNhdGVkQXRJbmRleCA9IGk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c2tpbGxDaGFyQ291bnQgKz0gZW50cnlMZW5ndGg7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKC4uLnNraWxsRW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFdoZW4gc2tpbGxzIGFyZSB0cnVuY2F0ZWQgYnkgdGhlIGNoYXJhY3RlciBidWRnZXQsIGluY2x1ZGUgcmVtYWluaW5nXG5cdFx0XHRcdC8vIHNraWxsIG5hbWVzIHNvIHRoZSBtb2RlbCBjYW4gc3RpbGwgZGlzY292ZXIgYW5kIGludm9rZSB0aGVtLlxuXHRcdFx0XHRpZiAodHJ1bmNhdGVkQXRJbmRleCA8IG1vZGVsSW52b2NhYmxlU2tpbGxzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IHRydW5jYXRlZFNraWxscyA9IG1vZGVsSW52b2NhYmxlU2tpbGxzLnNsaWNlKHRydW5jYXRlZEF0SW5kZXgpO1xuXHRcdFx0XHRcdGNvbnN0IG5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdGxldCBuYW1lTGlzdExlbmd0aCA9IDA7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBza2lsbCBvZiB0cnVuY2F0ZWRTa2lsbHMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVzY2FwZWROYW1lID0gZXNjYXBlWG1sKHNraWxsLm5hbWUpO1xuXHRcdFx0XHRcdFx0Y29uc3QgYWRkaXRpb24gPSAobmFtZXMubGVuZ3RoID4gMCA/IDIgOiAwKSArIGVzY2FwZWROYW1lLmxlbmd0aDtcblx0XHRcdFx0XHRcdGlmIChuYW1lTGlzdExlbmd0aCArIGFkZGl0aW9uID4gVFJVTkNBVEVEX05BTUVTX0NIQVJfQlVER0VUKSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bmFtZUxpc3RMZW5ndGggKz0gYWRkaXRpb247XG5cdFx0XHRcdFx0XHRuYW1lcy5wdXNoKGVzY2FwZWROYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcmVtYWluaW5nID0gdHJ1bmNhdGVkU2tpbGxzLmxlbmd0aCAtIG5hbWVzLmxlbmd0aDtcblx0XHRcdFx0XHRjb25zdCBuYW1lTGlzdCA9IG5hbWVzLmpvaW4oJywgJyk7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHJlbWFpbmluZyA+IDBcblx0XHRcdFx0XHRcdD8gYEFkZGl0aW9uYWwgc2tpbGxzIGF2YWlsYWJsZSAoaW52b2tlIGJ5IG5hbWUpOiAke25hbWVMaXN0fS4uLiBhbmQgJHtyZW1haW5pbmd9IG1vcmVgXG5cdFx0XHRcdFx0XHQ6IGBBZGRpdGlvbmFsIHNraWxscyBhdmFpbGFibGUgKGludm9rZSBieSBuYW1lKTogJHtuYW1lTGlzdH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbnRyaWVzLnB1c2goJzwvc2tpbGxzPicsICcnLCAnJyk7IC8vIGFkZCB0cmFpbGluZyBuZXdsaW5lXG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChydW5TdWJhZ2VudFRvb2wpIHtcblx0XHRcdGNvbnN0IGNhblVzZUFnZW50ID0gKCgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9lbmFibGVkU3ViYWdlbnRzIHx8IHRoaXMuX2VuYWJsZWRTdWJhZ2VudHMuaW5jbHVkZXMoJyonKSkge1xuXHRcdFx0XHRcdHJldHVybiAoYWdlbnQ6IElDdXN0b21BZ2VudCkgPT4gYWdlbnQudmlzaWJpbGl0eS5hZ2VudEludm9jYWJsZSAmJiBtYXRjaGVzU2Vzc2lvblR5cGUoYWdlbnQuc2Vzc2lvblR5cGVzLCBjdXJyZW50U2Vzc2lvblR5cGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHN1YmFnZW50cyA9IHRoaXMuX2VuYWJsZWRTdWJhZ2VudHM7XG5cdFx0XHRcdFx0cmV0dXJuIChhZ2VudDogSUN1c3RvbUFnZW50KSA9PiBzdWJhZ2VudHMuaW5jbHVkZXMoYWdlbnQubmFtZSkgJiYgbWF0Y2hlc1Nlc3Npb25UeXBlKGFnZW50LnNlc3Npb25UeXBlcywgY3VycmVudFNlc3Npb25UeXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHRcdGNvbnN0IGFnZW50cyA9IChhd2FpdCB0aGlzLl9wcm9tcHRzU2VydmljZS5nZXRDdXN0b21BZ2VudHModG9rZW4pKS5maWx0ZXIoYSA9PiBhLmVuYWJsZWQpO1xuXG5cdFx0XHRpZiAoYWdlbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKCc8YWdlbnRzPicpO1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goJ0hlcmUgaXMgYSBsaXN0IG9mIGFnZW50cyB0aGF0IGNhbiBiZSB1c2VkIHdoZW4gcnVubmluZyBhIHN1YmFnZW50LicpO1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goJ0VhY2ggYWdlbnQgaGFzIG9wdGlvbmFsbHkgYSBkZXNjcmlwdGlvbiB3aXRoIHRoZSBhZ2VudFxcJ3MgcHVycG9zZSBhbmQgZXhwZXJ0aXNlLiBXaGVuIGFza2VkIHRvIHJ1biBhIHN1YmFnZW50LCBjaG9vc2UgdGhlIG1vc3QgYXBwcm9wcmlhdGUgYWdlbnQgZnJvbSB0aGlzIGxpc3QuJyk7XG5cdFx0XHRcdGVudHJpZXMucHVzaChgVXNlIHRoZSAke3J1blN1YmFnZW50VG9vbC52YXJpYWJsZX0gdG9vbCB3aXRoIHRoZSBhZ2VudCBuYW1lIHRvIHJ1biB0aGUgc3ViYWdlbnQuYCk7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBhZ2VudCBvZiBhZ2VudHMpIHtcblx0XHRcdFx0XHRpZiAoY2FuVXNlQWdlbnQoYWdlbnQpKSB7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goJzxhZ2VudD4nKTtcblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaChgPG5hbWU+JHtlc2NhcGVYbWwoYWdlbnQubmFtZSl9PC9uYW1lPmApO1xuXHRcdFx0XHRcdFx0aWYgKGFnZW50LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGVudHJpZXMucHVzaChgPGRlc2NyaXB0aW9uPiR7ZXNjYXBlWG1sKGFnZW50LmRlc2NyaXB0aW9uKX08L2Rlc2NyaXB0aW9uPmApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGFnZW50LmFyZ3VtZW50SGludCkge1xuXHRcdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goYDxhcmd1bWVudEhpbnQ+JHtlc2NhcGVYbWwoYWdlbnQuYXJndW1lbnRIaW50KX08L2FyZ3VtZW50SGludD5gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVudHJpZXMucHVzaCgnPC9hZ2VudD4nKTtcblx0XHRcdFx0XHRcdGRlYnVnSW5mby5kZWJ1Z0RldGFpbHMucHVzaCh7IGNhdGVnb3J5OiAnY3VzdG9tLWFnZW50JywgbmFtZTogYWdlbnQubmFtZSwgdXJpOiBhZ2VudC51cmkgfSk7XG5cdFx0XHRcdFx0XHRpZiAoaXNJbkNsYXVkZUFnZW50c0ZvbGRlcihhZ2VudC51cmkpKSB7XG5cdFx0XHRcdFx0XHRcdHRlbGVtZXRyeUV2ZW50LmNsYXVkZUFnZW50c0NvdW50Kys7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGRlYnVnSW5mby5kZWJ1Z0RldGFpbHMucHVzaCh7IGNhdGVnb3J5OiAnc2tpcHBlZCcsIG5hbWU6IGFnZW50Lm5hbWUsIHVyaTogYWdlbnQudXJpLCByZWFzb246IGxvY2FsaXplKCdkZWJ1Z0RldGFpbC5hZ2VudE5vdEludm9jYWJsZScsICdub3QgaW52b2NhYmxlIGJ5IG1vZGVsJykgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGVudHJpZXMucHVzaCgnPC9hZ2VudHM+JywgJycsICcnKTsgLy8gYWRkIHRyYWlsaW5nIG5ld2xpbmVcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBlbnRyaWVzLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IHRvb2xSZWZlcmVuY2VzOiBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeVtdID0gW107XG5cdFx0Y29uc3QgY29sbGVjdFRvb2xSZWZlcmVuY2UgPSAodG9vbDogeyB0b29sOiBJVG9vbERhdGE7IHZhcmlhYmxlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKHRvb2wpIHtcblx0XHRcdFx0bGV0IG9mZnNldCA9IGNvbnRlbnQuaW5kZXhPZih0b29sLnZhcmlhYmxlKTtcblx0XHRcdFx0d2hpbGUgKG9mZnNldCA+PSAwKSB7XG5cdFx0XHRcdFx0dG9vbFJlZmVyZW5jZXMucHVzaCh0b1Rvb2xWYXJpYWJsZUVudHJ5KHRvb2wudG9vbCwgbmV3IE9mZnNldFJhbmdlKG9mZnNldCwgb2Zmc2V0ICsgdG9vbC52YXJpYWJsZS5sZW5ndGgpKSk7XG5cdFx0XHRcdFx0b2Zmc2V0ID0gY29udGVudC5pbmRleE9mKHRvb2wudmFyaWFibGUsIG9mZnNldCArIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb2xsZWN0VG9vbFJlZmVyZW5jZShmaWxlUmVhZFRvb2wpO1xuXHRcdGNvbGxlY3RUb29sUmVmZXJlbmNlKHJ1blN1YmFnZW50VG9vbCk7XG5cdFx0Y29sbGVjdFRvb2xSZWZlcmVuY2Uoc2tpbGxUb29sKTtcblx0XHRyZXR1cm4gdG9Qcm9tcHRUZXh0VmFyaWFibGVFbnRyeShjb250ZW50LCB0cnVlLCB0b29sUmVmZXJlbmNlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hZGRSZWZlcmVuY2VkSW5zdHJ1Y3Rpb25zKGF0dGFjaGVkQ29udGV4dDogQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCwgdGVsZW1ldHJ5RXZlbnQ6IEluc3RydWN0aW9uc0NvbGxlY3Rpb25FdmVudCwgZGVidWdJbmZvOiBJbnN0cnVjdGlvbnNDb2xsZWN0aW9uRGVidWdJbmZvLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbmNsdWRlUmVmZXJlbmNlZEluc3RydWN0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuSU5DTFVERV9SRUZFUkVOQ0VEX0lOU1RSVUNUSU9OUyk7XG5cdFx0aWYgKCFpbmNsdWRlUmVmZXJlbmNlZEluc3RydWN0aW9ucyAmJiB0aGlzLl9tb2RlS2luZCAhPT0gQ2hhdE1vZGVLaW5kLkVkaXQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtJbnN0cnVjdGlvbnNDb250ZXh0Q29tcHV0ZXJdIGluY2x1ZGVSZWZlcmVuY2VkSW5zdHJ1Y3Rpb25zIGlzIGRpc2FibGVkIGFuZCBhZ2VudCBraW5kIGlzIG5vdCBFZGl0LiBObyByZWZlcmVuY2VkIGluc3RydWN0aW9ucyB3aWxsIGJlIGFkZGVkLmApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlZW4gPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRjb25zdCB0b2RvOiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdmFyaWFibGUgb2YgYXR0YWNoZWRDb250ZXh0LmFzQXJyYXkoKSkge1xuXHRcdFx0aWYgKGlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkodmFyaWFibGUpKSB7XG5cdFx0XHRcdGlmICghc2Vlbi5oYXModmFyaWFibGUudmFsdWUpKSB7XG5cdFx0XHRcdFx0dG9kby5wdXNoKHZhcmlhYmxlLnZhbHVlKTtcblx0XHRcdFx0XHRzZWVuLmFkZCh2YXJpYWJsZS52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0bGV0IG5leHQgPSB0b2RvLnBvcCgpO1xuXHRcdHdoaWxlIChuZXh0KSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wYXJzZUluc3RydWN0aW9uc0ZpbGUobmV4dCwgdG9rZW4pO1xuXHRcdFx0aWYgKHJlc3VsdCAmJiByZXN1bHQuYm9keSkge1xuXHRcdFx0XHRjb25zdCByZWZzVG9DaGVjazogeyByZXNvdXJjZTogVVJJIH1bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlZiBvZiByZXN1bHQuYm9keS5maWxlUmVmZXJlbmNlcykge1xuXHRcdFx0XHRcdGNvbnN0IHVybCA9IHJlc3VsdC5ib2R5LnJlc29sdmVGaWxlUGF0aChyZWYuY29udGVudCk7XG5cdFx0XHRcdFx0aWYgKHVybCAmJiAhc2Vlbi5oYXModXJsKSAmJiAoaXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUodXJsKSB8fCB0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcih1cmwpICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0XHQvLyBvbmx5IGFkZCByZWZlcmVuY2VzIHRoYXQgYXJlIGVpdGhlciBwcm9tcHQgb3IgaW5zdHJ1Y3Rpb24gZmlsZXMgb3IgYXJlIHBhcnQgb2YgdGhlIHdvcmtzcGFjZVxuXHRcdFx0XHRcdFx0cmVmc1RvQ2hlY2sucHVzaCh7IHJlc291cmNlOiB1cmwgfSk7XG5cdFx0XHRcdFx0XHRzZWVuLmFkZCh1cmwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmVmc1RvQ2hlY2subGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZUFsbChyZWZzVG9DaGVjayk7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhdCA9IHN0YXRzW2ldO1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gcmVmc1RvQ2hlY2tbaV0ucmVzb3VyY2U7XG5cdFx0XHRcdFx0XHRpZiAoc3RhdC5zdWNjZXNzICYmIHN0YXQuc3RhdD8uaXNGaWxlKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZSh1cmkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gb25seSByZWN1cnNpdmVseSBwYXJzZSBpbnN0cnVjdGlvbiBmaWxlc1xuXHRcdFx0XHRcdFx0XHRcdHRvZG8ucHVzaCh1cmkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlYXNvbiA9IGxvY2FsaXplKCdpbnN0cnVjdGlvbi5maWxlLnJlYXNvbi5yZWZlcmVuY2VkJywgJ1JlZmVyZW5jZWQgYnkgezB9JywgYmFzZW5hbWUobmV4dCkpO1xuXHRcdFx0XHRcdFx0XHRhdHRhY2hlZENvbnRleHQuYWRkKHRvUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkodXJpLCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLkluc3RydWN0aW9uUmVmZXJlbmNlLCByZWFzb24sIHRydWUpKTtcblx0XHRcdFx0XHRcdFx0dGVsZW1ldHJ5RXZlbnQucmVmZXJlbmNlZEluc3RydWN0aW9uc0NvdW50Kys7XG5cdFx0XHRcdFx0XHRcdGRlYnVnSW5mby5kZWJ1Z0RldGFpbHMucHVzaCh7IGNhdGVnb3J5OiAncmVmZXJlbmNlZCcsIG5hbWU6IGJhc2VuYW1lKHVyaSkudG9TdHJpbmcoKSwgdXJpLCByZWFzb24gfSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtJbnN0cnVjdGlvbnNDb250ZXh0Q29tcHV0ZXJdICR7dXJpLnRvU3RyaW5nKCl9IGFkZGVkLCByZWZlcmVuY2VkIGJ5ICR7bmV4dC50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0bmV4dCA9IHRvZG8ucG9wKCk7XG5cdFx0fVxuXHR9XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZpbGVQYXRoKHVyaTogVVJJLCByZW1vdGVPUzogT3BlcmF0aW5nU3lzdGVtIHwgdW5kZWZpbmVkLCBpc1JlbW90ZSA9IGZhbHNlKTogc3RyaW5nIHtcblx0Ly8gV2hlbiBjb25uZWN0ZWQgdG8gYSByZW1vdGUsIGxvY2FsIGZpbGU6Ly8gVVJJcyBtdXN0IGJlIHJlcHJlc2VudGVkIHVzaW5nXG5cdC8vIHRoZSB2c2NvZGUtbG9jYWwgc2NoZW1lIHNvIHRoZSByZW1vdGUgZXh0ZW5zaW9uIGhvc3QgY2FuIHJlYWQgdGhlbSB2aWEgdGhlXG5cdC8vIGxvY2FsIGZpbGUgYnJpZGdlLiBUaGlzIHdvcmtzIGZvciBXU0wsIFNTSCwgYW5kIGRldiBjb250YWluZXJzIHdpdGhvdXRcblx0Ly8gYW55IGNhY2hlIG1pZ3JhdGlvbi5cblx0aWYgKGlzUmVtb3RlICYmIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkge1xuXHRcdHJldHVybiB1cmkud2l0aCh7IHNjaGVtZTogJ3ZzY29kZS1sb2NhbCcgfSkudG9TdHJpbmcoKTtcblx0fVxuXHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlIHx8IHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cdFx0Y29uc3QgZnNQYXRoID0gdXJpLmZzUGF0aDtcblx0XHQvLyB1cmkuZnNQYXRoIHVzZXMgdGhlIGxvY2FsIE9TJ3MgcGF0aCBzZXBhcmF0b3JzLCBidXQgdGhlIHBhdGhcblx0XHQvLyBtYXkgYmVsb25nIHRvIGEgcmVtb3RlIHdpdGggYSBkaWZmZXJlbnQgT1MuIE5vcm1hbGl6ZSBzZXBhcmF0b3JzXG5cdFx0Ly8gdG8gbWF0Y2ggdGhlIHJlbW90ZSBPUyAoaWRlbXBvdGVudCB3aGVuIGxvY2FsIGFuZCByZW1vdGUgbWF0Y2gpLlxuXHRcdGlmIChyZW1vdGVPUyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAocmVtb3RlT1MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRcdHJldHVybiBmc1BhdGgucmVwbGFjZSgvXFwvL2csICdcXFxcJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZnNQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZzUGF0aDtcblx0fVxuXHRyZXR1cm4gdXJpLnRvU3RyaW5nKCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsT0FBTyxzQkFBc0I7QUFDdEMsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxVQUFVLGVBQWU7QUFDbEMsU0FBUyxVQUFVLGlCQUFpQjtBQUVwQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFx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
