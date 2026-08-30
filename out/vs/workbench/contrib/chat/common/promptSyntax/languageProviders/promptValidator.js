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
import { isEmptyPattern, parse, splitGlobAware } from "../../../../../../base/common/glob.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { localize } from "../../../../../../nls.js";
import { MarkerSeverity, MarkerTag } from "../../../../../../platform/markers/common/markers.js";
import { ChatMode, IChatModeService } from "../../chatModes.js";
import { ChatModeKind } from "../../constants.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../languageModels.js";
import { ILanguageModelToolsService, SpecedToolAliases } from "../../tools/languageModelToolsService.js";
import { PromptsType, Target } from "../promptTypes.js";
import { parseCommaSeparatedList, PromptHeaderAttributes } from "../promptFileParser.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IPromptsService } from "../service/promptsService.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { AGENTS_SOURCE_FOLDER, CLAUDE_AGENTS_SOURCE_FOLDER, isInClaudeRulesFolder, isSkillFilename, LEGACY_MODE_FILE_EXTENSION, VALID_SKILL_NAME_REGEX } from "../config/promptFileLocations.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { dirname } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { HOOKS_BY_TARGET } from "../hookTypes.js";
import { GithubPromptHeaderAttributes } from "./promptFileAttributes.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
const MARKERS_OWNER_ID = "prompts-diagnostics-provider";
var PromptValidatorMarkerCode = /* @__PURE__ */ ((PromptValidatorMarkerCode2) => {
  PromptValidatorMarkerCode2["MissingGithubMcpServer"] = "promptValidator.missingGithubMcpServer";
  PromptValidatorMarkerCode2["MissingPlaywrightMcpServer"] = "promptValidator.missingPlaywrightMcpServer";
  PromptValidatorMarkerCode2["UnknownExtensionReference"] = "promptValidator.unknownExtensionReference";
  PromptValidatorMarkerCode2["UnknownMcpServerReference"] = "promptValidator.unknownMcpServerReference";
  PromptValidatorMarkerCode2["UnknownExtensionOrMcpServerReference"] = "promptValidator.unknownExtensionOrMcpServerReference";
  return PromptValidatorMarkerCode2;
})(PromptValidatorMarkerCode || {});
let PromptValidator = class {
  constructor(languageModelsService, languageModelToolsService, chatModeService, fileService, labelService, promptsService, logger, configurationService) {
    this.languageModelsService = languageModelsService;
    this.languageModelToolsService = languageModelToolsService;
    this.chatModeService = chatModeService;
    this.fileService = fileService;
    this.labelService = labelService;
    this.promptsService = promptsService;
    this.logger = logger;
    this.configurationService = configurationService;
  }
  async validate(promptAST, promptType, report) {
    promptAST.header?.errors.forEach((error) => report(toMarker(error.message, error.range, MarkerSeverity.Error)));
    const target = getTarget(promptType, promptAST.header ?? promptAST.uri);
    await this.validateHeader(promptAST, promptType, target, report);
    await this.validateBody(promptAST, target, report);
    await this.validateFileName(promptAST, promptType, report);
    await this.validateSkillAttributes(promptAST, promptType, report);
  }
  async validateFileName(promptAST, promptType, report) {
    if (promptType === PromptsType.agent && promptAST.uri.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
      const location = this.promptsService.getAgentFileURIFromModeFile(promptAST.uri);
      if (location && await this.fileService.canCreateFile(location)) {
        report(toMarker(localize("promptValidator.chatModesRenamedToAgents", "Chat modes have been renamed to agents. Please move this file to {0}", location.toString()), new Range(1, 1, 1, 4), MarkerSeverity.Warning));
      } else {
        report(toMarker(localize("promptValidator.chatModesRenamedToAgentsNoMove", "Chat modes have been renamed to agents. Please move the file to {0}", AGENTS_SOURCE_FOLDER), new Range(1, 1, 1, 4), MarkerSeverity.Warning));
      }
    }
  }
  async validateSkillAttributes(promptAST, promptType, report) {
    if (promptType !== PromptsType.skill || !promptAST.header) {
      return;
    }
    const nameAttribute = promptAST.header.getAttribute(PromptHeaderAttributes.name);
    if (!nameAttribute) {
      report(toMarker(
        localize("promptValidator.skillNameMissing", "Skill should provide a name."),
        new Range(1, 1, 1, 4),
        MarkerSeverity.Warning
      ));
    } else if (nameAttribute.value.type === "scalar") {
      const skillName = nameAttribute.value.value.trim();
      if (skillName.length > 0) {
        if (!VALID_SKILL_NAME_REGEX.test(skillName)) {
          report(toMarker(
            localize("promptValidator.skillNameInvalidChars", "Skill name may only contain lowercase letters, numbers, and hyphens."),
            nameAttribute.value.range,
            MarkerSeverity.Error
          ));
        }
        const pathParts = promptAST.uri.path.split("/");
        const skillIndex = pathParts.findIndex((part) => isSkillFilename(part));
        if (skillIndex > 0) {
          const folderName = pathParts[skillIndex - 1];
          if (folderName && skillName !== folderName) {
            report(toMarker(
              localize("promptValidator.skillNameFolderMismatch", "The skill name '{0}' should match the folder name '{1}'.", skillName, folderName),
              nameAttribute.value.range,
              MarkerSeverity.Warning
            ));
          }
        }
      }
    }
    const descriptionAttribute = promptAST.header.getAttribute(PromptHeaderAttributes.description);
    if (!descriptionAttribute) {
      report(toMarker(
        localize("promptValidator.skillDescriptionMissing", "Skill should provide a description."),
        new Range(1, 1, 1, 4),
        MarkerSeverity.Warning
      ));
      if (promptAST.header.userInvocable === false) {
        const userInvocableAttr = promptAST.header.getAttribute(PromptHeaderAttributes.userInvocable);
        if (userInvocableAttr) {
          report(toMarker(
            localize("promptValidator.skillUserInvocableRequiresDescription", "A description is required when user-invocable is false, because the model needs a description to decide when to load the skill."),
            userInvocableAttr.value.range,
            MarkerSeverity.Error
          ));
        }
      }
      if (promptAST.header.disableModelInvocation === false) {
        const disableModelInvocationAttr = promptAST.header.getAttribute(PromptHeaderAttributes.disableModelInvocation);
        if (disableModelInvocationAttr) {
          report(toMarker(
            localize("promptValidator.skillModelInvocationRequiresDescription", "A description is required when model invocation is enabled, because the model needs a description to decide when to load the skill."),
            disableModelInvocationAttr.value.range,
            MarkerSeverity.Error
          ));
        }
      }
    }
    const contextAttribute = promptAST.header?.getAttribute(PromptHeaderAttributes.context);
    if (contextAttribute && contextAttribute.value.type === "scalar" && contextAttribute.value.value.trim() === "fork") {
      const skillToolEnabled = this.configurationService.getValue("github.copilot.chat.skillTool.enabled");
      if (!skillToolEnabled) {
        report(toMarker(
          localize("promptValidator.contextForkNotSupported", "The 'context: fork' attribute requires the skill tool to be enabled (github.copilot.chat.skillTool.enabled)."),
          contextAttribute.value.range,
          MarkerSeverity.Warning
        ));
      }
    }
  }
  async validateBody(promptAST, target, report) {
    const body = promptAST.body;
    if (!body) {
      return;
    }
    const fileReferenceChecks = [];
    for (const ref of body.fileReferences) {
      const resolved = body.resolveFilePath(ref.content);
      if (!resolved) {
        report(toMarker(localize("promptValidator.invalidFileReference", "Invalid file reference '{0}'.", ref.content), ref.range, MarkerSeverity.Warning));
        continue;
      }
      if (promptAST.uri.scheme === resolved.scheme) {
        fileReferenceChecks.push((async () => {
          try {
            const exists = await this.fileService.exists(resolved);
            if (!exists) {
              const loc = this.labelService.getUriLabel(resolved);
              report(toMarker(localize("promptValidator.fileNotFound", "File '{0}' not found at '{1}'.", ref.content, loc), ref.range, MarkerSeverity.Warning));
            }
          } catch (e) {
            this.logger.warn(`Error checking existence of file reference '${ref.content}' resolved to '${resolved.toString()}' in prompt file '${promptAST.uri.toString()}': ${e.message}`);
          }
        })());
      }
    }
    if (body.variableReferences.length && isVSCodeOrDefaultTarget(target)) {
      const headerTools = promptAST.header?.tools;
      const headerToolsMap = headerTools ? this.languageModelToolsService.toToolAndToolSetEnablementMap(headerTools, void 0) : void 0;
      const available = new Set(this.languageModelToolsService.getFullReferenceNames());
      const deprecatedNames = this.languageModelToolsService.getDeprecatedFullReferenceNames();
      for (const variable of body.variableReferences) {
        if (!available.has(variable.name)) {
          if (deprecatedNames.has(variable.name)) {
            const currentNames = deprecatedNames.get(variable.name);
            if (currentNames && currentNames.size > 0) {
              if (currentNames.size === 1) {
                const newName = Array.from(currentNames)[0];
                report(toMarker(localize("promptValidator.deprecatedVariableReference", "Tool or toolset '{0}' has been renamed, use '{1}' instead.", variable.name, newName), variable.range, MarkerSeverity.Info));
              } else {
                const newNames = Array.from(currentNames).sort((a, b) => a.localeCompare(b)).join(", ");
                report(toMarker(localize("promptValidator.deprecatedVariableReferenceMultipleNames", "Tool or toolset '{0}' has been renamed, use the following tools instead: {1}", variable.name, newNames), variable.range, MarkerSeverity.Info));
              }
            }
          } else {
            const missingGithubServerMarker = this.getMissingGithubMcpServerMarker(variable.name, variable.range);
            if (missingGithubServerMarker) {
              report(missingGithubServerMarker);
            } else {
              const missingPlaywrightServerMarker = this.getMissingPlaywrightMcpServerMarker(variable.name, variable.range);
              if (missingPlaywrightServerMarker) {
                report(missingPlaywrightServerMarker);
              } else {
                report(this.getUnknownToolMarker(variable.name, variable.range, true));
              }
            }
          }
        } else if (headerToolsMap) {
          const tool = this.languageModelToolsService.getToolByFullReferenceName(variable.name);
          if (tool && headerToolsMap.get(tool) === false) {
            report(toMarker(localize("promptValidator.disabledTool", "Tool or toolset '{0}' also needs to be enabled in the header.", variable.name), variable.range, MarkerSeverity.Warning));
          }
        }
      }
    }
    await Promise.all(fileReferenceChecks);
  }
  async validateHeader(promptAST, promptType, target, report) {
    const header = promptAST.header;
    if (!header) {
      return;
    }
    const attributes = header.attributes;
    this.checkForInvalidArguments(attributes, promptType, target, report);
    this.validateName(attributes, report);
    this.validateDescription(attributes, report);
    this.validateArgumentHint(attributes, report);
    switch (promptType) {
      case PromptsType.prompt: {
        const agent = await this.validateAgent(attributes, report);
        this.validateTools(attributes, agent?.kind ?? ChatModeKind.Agent, target, report);
        this.validateModel(attributes, agent?.kind ?? ChatModeKind.Agent, report);
        break;
      }
      case PromptsType.instructions:
        if (target === Target.Claude) {
          this.validatePaths(attributes, report);
        } else {
          this.validateApplyTo(attributes, report);
        }
        this.validateExcludeAgent(attributes, report);
        break;
      case PromptsType.agent: {
        this.validateTarget(attributes, report);
        this.validateInfer(attributes, report);
        this.validateUserInvocable(attributes, report);
        this.validateDisableModelInvocation(attributes, report);
        this.validateTools(attributes, ChatModeKind.Agent, target, report);
        this.validateHooks(attributes, target, report);
        if (isVSCodeOrDefaultTarget(target)) {
          this.validateModel(attributes, ChatModeKind.Agent, report);
          this.validateHandoffs(attributes, report);
          await this.validateAgentsAttribute(attributes, header, report);
          this.validateGithubPermissions(attributes, report);
        } else if (target === Target.Claude) {
          this.validateClaudeAttributes(attributes, report);
        } else if (target === Target.GitHubCopilot) {
          this.validateGithubPermissions(attributes, report);
        }
        break;
      }
      case PromptsType.skill:
        this.validateUserInvocable(attributes, report);
        this.validateDisableModelInvocation(attributes, report);
        break;
    }
  }
  checkForInvalidArguments(attributes, promptType, target, report) {
    const validAttributeNames = getValidAttributeNames(promptType, true, target);
    const validGithubCopilotAttributeNames = new Lazy(() => new Set(getValidAttributeNames(promptType, false, Target.GitHubCopilot)));
    for (const attribute of attributes) {
      if (!validAttributeNames.includes(attribute.key)) {
        const supportedNames = new Lazy(() => {
          const names = getValidAttributeNames(promptType, false, target);
          return names.sort().join(", ");
        });
        switch (promptType) {
          case PromptsType.prompt:
            report(toMarker(localize("promptValidator.unknownAttribute.prompt", "Attribute '{0}' is not supported in prompt files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            break;
          case PromptsType.agent:
            if (target === Target.GitHubCopilot) {
              report(toMarker(localize("promptValidator.unknownAttribute.github-agent", "Attribute '{0}' is not supported in custom GitHub Copilot agent files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            } else if (target === Target.Claude) {
            } else {
              if (validGithubCopilotAttributeNames.value.has(attribute.key)) {
                report(toMarker(localize("promptValidator.ignoredAttribute.vscode-agent", "Attribute '{0}' is ignored when running locally in VS Code.", attribute.key), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
              } else {
                report(toMarker(localize("promptValidator.unknownAttribute.vscode-agent", "Attribute '{0}' is not supported in VS Code agent files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
              }
            }
            break;
          case PromptsType.instructions:
            if (target === Target.Claude) {
              report(toMarker(localize("promptValidator.unknownAttribute.rules", "Attribute '{0}' is not supported in rules files by VS Code agents. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            } else {
              report(toMarker(localize("promptValidator.unknownAttribute.instructions", "Attribute '{0}' is not supported in instructions files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            }
            break;
          case PromptsType.skill:
            report(toMarker(localize("promptValidator.unknownAttribute.skill", "Attribute '{0}' is not supported by VS Code agents. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            break;
        }
      }
    }
  }
  validateName(attributes, report) {
    const nameAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.name);
    if (!nameAttribute) {
      return;
    }
    if (nameAttribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.nameMustBeString", "The 'name' attribute must be a string."), nameAttribute.range, MarkerSeverity.Error));
      return;
    }
    if (nameAttribute.value.value.trim().length === 0) {
      report(toMarker(localize("promptValidator.nameShouldNotBeEmpty", "The 'name' attribute must not be empty."), nameAttribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  validateDescription(attributes, report) {
    const descriptionAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.description);
    if (!descriptionAttribute) {
      return;
    }
    if (descriptionAttribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.descriptionMustBeString", "The 'description' attribute must be a string."), descriptionAttribute.range, MarkerSeverity.Error));
      return;
    }
    if (descriptionAttribute.value.value.trim().length === 0) {
      report(toMarker(localize("promptValidator.descriptionShouldNotBeEmpty", "The 'description' attribute should not be empty."), descriptionAttribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  validateArgumentHint(attributes, report) {
    const argumentHintAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.argumentHint);
    if (!argumentHintAttribute) {
      return;
    }
    if (argumentHintAttribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.argumentHintMustBeString", "The 'argument-hint' attribute must be a string."), argumentHintAttribute.range, MarkerSeverity.Error));
      return;
    }
    if (argumentHintAttribute.value.value.trim().length === 0) {
      report(toMarker(localize("promptValidator.argumentHintShouldNotBeEmpty", "The 'argument-hint' attribute should not be empty."), argumentHintAttribute.value.range, MarkerSeverity.Warning));
      return;
    }
  }
  validateModel(attributes, agentKind, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.model);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "scalar" && attribute.value.type !== "sequence") {
      report(toMarker(localize("promptValidator.modelMustBeStringOrArray", "The 'model' attribute must be a string or an array of strings."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const modelNames = [];
    if (attribute.value.type === "scalar") {
      const modelName = attribute.value.value.trim();
      if (modelName.length === 0) {
        report(toMarker(localize("promptValidator.modelMustBeNonEmpty", "The 'model' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
        return;
      }
      modelNames.push([modelName, attribute.value.range]);
    } else if (attribute.value.type === "sequence") {
      if (attribute.value.items.length === 0) {
        report(toMarker(localize("promptValidator.modelArrayMustNotBeEmpty", "The 'model' array must not be empty."), attribute.value.range, MarkerSeverity.Error));
        return;
      }
      for (const item of attribute.value.items) {
        if (item.type !== "scalar") {
          report(toMarker(localize("promptValidator.modelArrayMustContainStrings", "The 'model' array must contain only strings."), item.range, MarkerSeverity.Error));
          return;
        }
        const modelName = item.value.trim();
        if (modelName.length === 0) {
          report(toMarker(localize("promptValidator.modelArrayItemMustBeNonEmpty", "Model names in the array must be non-empty strings."), item.range, MarkerSeverity.Error));
          return;
        }
        modelNames.push([modelName, item.range]);
      }
    }
    const languageModels = this.languageModelsService.getLanguageModelIds();
    if (languageModels.length === 0) {
      return;
    }
    for (const [modelName, range] of modelNames) {
      const modelMetadata = this.findModelByName(modelName);
      if (!modelMetadata) {
        report(toMarker(localize("promptValidator.modelNotFound", "Unknown model '{0}' will be ignored.", modelName), range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
      } else if (agentKind === ChatModeKind.Agent && !ILanguageModelChatMetadata.suitableForAgentMode(modelMetadata)) {
        report(toMarker(localize("promptValidator.modelNotSuited", "Model '{0}' is not suited for agent mode.", modelName), range, MarkerSeverity.Warning));
      }
    }
  }
  validateClaudeAttributes(attributes, report) {
    for (const claudeAttributeName in claudeAgentAttributes) {
      const claudeAttribute = claudeAgentAttributes[claudeAttributeName];
      const enumValues = claudeAttribute.enums;
      if (enumValues) {
        const attribute = attributes.find((attr) => attr.key === claudeAttributeName);
        if (!attribute) {
          continue;
        }
        if (attribute.value.type !== "scalar") {
          report(toMarker(localize("promptValidator.claude.attributeMustBeString", "The '{0}' attribute must be a string.", claudeAttributeName), attribute.value.range, MarkerSeverity.Error));
          continue;
        } else {
          const modelName = attribute.value.value.trim();
          if (enumValues.every((model) => model.name !== modelName)) {
            const validValues = enumValues.map((model) => model.name).join(", ");
            report(toMarker(localize("promptValidator.claude.attributeNotFound", "Unknown value '{0}', valid: {1}.", modelName, validValues), attribute.value.range, MarkerSeverity.Warning));
          }
        }
      }
    }
  }
  findModelByName(modelName) {
    const metadataAndId = this.languageModelsService.lookupLanguageModelByQualifiedName(modelName);
    if (metadataAndId && metadataAndId.metadata.isUserSelectable !== false) {
      return metadataAndId.metadata;
    }
    return void 0;
  }
  async validateAgent(attributes, report) {
    const agentAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.agent);
    const modeAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.mode);
    if (modeAttribute) {
      if (agentAttribute) {
        report(toMarker(localize("promptValidator.modeDeprecated", "The 'mode' attribute has been deprecated. The 'agent' attribute is used instead."), modeAttribute.range, MarkerSeverity.Warning, [MarkerTag.Deprecated]));
      } else {
        report(toMarker(localize("promptValidator.modeDeprecated.useAgent", "The 'mode' attribute has been deprecated. Please rename it to 'agent'."), modeAttribute.range, MarkerSeverity.Warning, [MarkerTag.Deprecated]));
      }
    }
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.agent) ?? modeAttribute;
    if (!attribute) {
      return void 0;
    }
    if (attribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.attributeMustBeString", "The '{0}' attribute must be a string.", attribute.key), attribute.value.range, MarkerSeverity.Error));
      return void 0;
    }
    const agentValue = attribute.value.value;
    if (agentValue.trim().length === 0) {
      report(toMarker(localize("promptValidator.attributeMustBeNonEmpty", "The '{0}' attribute must be a non-empty string.", attribute.key), attribute.value.range, MarkerSeverity.Error));
      return void 0;
    }
    return await this.validateAgentValue(attribute.value, report);
  }
  async validateAgentValue(value, report) {
    const agents = await this.chatModeService.getLocalModes();
    const availableAgents = [];
    for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
      if (agent.name.get() === value.value) {
        return agent;
      }
      availableAgents.push(agent.name.get());
    }
    const errorMessage = localize("promptValidator.agentNotFound", "Unknown agent '{0}'. Available agents: {1}.", value.value, availableAgents.join(", "));
    report(toMarker(errorMessage, value.range, MarkerSeverity.Warning));
    return void 0;
  }
  validateTools(attributes, agentKind, target, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.tools);
    if (!attribute) {
      return;
    }
    if (agentKind !== ChatModeKind.Agent) {
      report(toMarker(localize("promptValidator.toolsOnlyInAgent", "The 'tools' attribute is only supported when using agents. Attribute will be ignored."), attribute.range, MarkerSeverity.Warning));
    }
    let value = attribute.value;
    if (value.type === "scalar") {
      value = parseCommaSeparatedList(value);
    }
    if (value.type !== "sequence") {
      report(toMarker(localize("promptValidator.toolsMustBeArrayOrMap", "The 'tools' attribute must be an array or a comma separated string."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    if (target === Target.GitHubCopilot || target === Target.Claude) {
    } else {
      this.validateVSCodeTools(value, report);
    }
  }
  validateVSCodeTools(valueItem, report) {
    if (valueItem.items.length > 0) {
      const available = new Set(this.languageModelToolsService.getFullReferenceNames());
      const deprecatedNames = this.languageModelToolsService.getDeprecatedFullReferenceNames();
      for (const item of valueItem.items) {
        if (item.type !== "scalar") {
          report(toMarker(localize("promptValidator.eachToolMustBeString", "Each tool name in the 'tools' attribute must be a string."), item.range, MarkerSeverity.Error));
        } else if (item.value) {
          if (!available.has(item.value)) {
            const currentNames = deprecatedNames.get(item.value);
            if (currentNames) {
              if (currentNames?.size === 1) {
                const newName = Array.from(currentNames)[0];
                report(toMarker(localize("promptValidator.toolDeprecated", "Tool or toolset '{0}' has been renamed, use '{1}' instead.", item.value, newName), item.range, MarkerSeverity.Info, [MarkerTag.Deprecated]));
              } else {
                const newNames = Array.from(currentNames).sort((a, b) => a.localeCompare(b)).join(", ");
                report(toMarker(localize("promptValidator.toolDeprecatedMultipleNames", "Tool or toolset '{0}' has been renamed, use the following tools instead: {1}", item.value, newNames), item.range, MarkerSeverity.Info, [MarkerTag.Deprecated]));
              }
            } else {
              const missingGithubServerMarker = this.getMissingGithubMcpServerMarker(item.value, item.range);
              if (missingGithubServerMarker) {
                report(missingGithubServerMarker);
              } else {
                const missingPlaywrightServerMarker = this.getMissingPlaywrightMcpServerMarker(item.value, item.range);
                if (missingPlaywrightServerMarker) {
                  report(missingPlaywrightServerMarker);
                } else {
                  report(this.getUnknownToolMarker(item.value, item.range, false));
                }
              }
            }
          }
        }
      }
    }
  }
  getUnknownToolMarker(toolReferenceName, range, isVariableReference) {
    const splitBySlash = toolReferenceName.split("/");
    const slashCount = splitBySlash.length - 1;
    const hasExtensionLikeName = splitBySlash[0].includes(".");
    if (slashCount >= 2) {
      return toMarker(
        localize(
          "promptValidator.unknownMcpServerReference",
          "Unknown tool '{0}'. It is likely to be a missing MCP server, please ensure it is installed and enabled.",
          toolReferenceName
        ),
        range,
        MarkerSeverity.Hint,
        [MarkerTag.Unnecessary],
        "promptValidator.unknownMcpServerReference" /* UnknownMcpServerReference */
      );
    }
    if (hasExtensionLikeName) {
      return toMarker(
        localize(
          "promptValidator.unknownExtensionReference",
          "Unknown extension tool '{0}'. It is likely to be a missing extension, please ensure it is installed and enabled.",
          toolReferenceName
        ),
        range,
        MarkerSeverity.Hint,
        [MarkerTag.Unnecessary],
        "promptValidator.unknownExtensionReference" /* UnknownExtensionReference */
      );
    }
    if (isVariableReference) {
      return toMarker(
        localize(
          "promptValidator.unknownVariableReference",
          "Unknown tool or toolset '{0}'.",
          toolReferenceName
        ),
        range,
        MarkerSeverity.Hint,
        [MarkerTag.Unnecessary],
        "promptValidator.unknownExtensionOrMcpServerReference" /* UnknownExtensionOrMcpServerReference */
      );
    } else {
      return toMarker(
        localize(
          "promptValidator.unknownToolReference",
          "Unknown tool '{0}' will be ignored.",
          toolReferenceName
        ),
        range,
        MarkerSeverity.Hint,
        [MarkerTag.Unnecessary],
        "promptValidator.unknownExtensionOrMcpServerReference" /* UnknownExtensionOrMcpServerReference */
      );
    }
  }
  getMissingGithubMcpServerMarker(toolReferenceName, range) {
    if (toolReferenceName !== "github/*") {
      return void 0;
    }
    return toMarker(
      localize(
        "promptValidator.missingGithubMcpServer",
        "Tool alias '{0}' requires the GitHub MCP server. Enable the built-in server with setting 'github.copilot.chat.githubMcpServer.enabled' or install extension 'io.github.github/github-mcp-server' from Extensions (`@mcp github`).",
        toolReferenceName
      ),
      range,
      MarkerSeverity.Hint,
      [MarkerTag.Unnecessary],
      "promptValidator.missingGithubMcpServer" /* MissingGithubMcpServer */
    );
  }
  getMissingPlaywrightMcpServerMarker(toolReferenceName, range) {
    if (toolReferenceName !== "playwright/*") {
      return void 0;
    }
    return toMarker(
      localize(
        "promptValidator.missingPlaywrightMcpServer",
        "Tool alias '{0}' requires the Playwright MCP server. Install it from Extensions (`@mcp playwright`).",
        toolReferenceName
      ),
      range,
      MarkerSeverity.Hint,
      [MarkerTag.Unnecessary],
      "promptValidator.missingPlaywrightMcpServer" /* MissingPlaywrightMcpServer */
    );
  }
  validateApplyTo(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.applyTo);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.applyToMustBeString", "The 'applyTo' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const pattern = attribute.value.value;
    try {
      const patterns = splitGlobAware(pattern, ",");
      if (patterns.length === 0) {
        report(toMarker(localize("promptValidator.applyToMustBeValidGlob", "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
        return;
      }
      for (const pattern2 of patterns) {
        const globPattern = parse(pattern2);
        if (isEmptyPattern(globPattern)) {
          report(toMarker(localize("promptValidator.applyToMustBeValidGlob", "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
          return;
        }
      }
    } catch (_error) {
      report(toMarker(localize("promptValidator.applyToMustBeValidGlob", "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
    }
  }
  validatePaths(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.paths);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "sequence") {
      report(toMarker(localize("promptValidator.pathsMustBeArray", "The 'paths' attribute must be an array of glob patterns."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    for (const item of attribute.value.items) {
      if (item.type !== "scalar") {
        report(toMarker(localize("promptValidator.eachPathMustBeString", "Each entry in the 'paths' attribute must be a string."), item.range, MarkerSeverity.Error));
        continue;
      }
      const pattern = item.value.trim();
      if (pattern.length === 0) {
        report(toMarker(localize("promptValidator.pathMustBeNonEmpty", "Path entries must be non-empty glob patterns."), item.range, MarkerSeverity.Error));
        continue;
      }
      try {
        const globPattern = parse(pattern);
        if (isEmptyPattern(globPattern)) {
          report(toMarker(localize("promptValidator.pathMustBeValidGlob", "'{0}' is not a valid glob pattern.", pattern), item.range, MarkerSeverity.Error));
        }
      } catch (_error) {
        report(toMarker(localize("promptValidator.pathMustBeValidGlob", "'{0}' is not a valid glob pattern.", pattern), item.range, MarkerSeverity.Error));
      }
    }
  }
  validateExcludeAgent(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.excludeAgent);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "sequence" && attribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.excludeAgentMustBeArray", "The 'excludeAgent' attribute must be an string or array."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  validateHooks(attributes, target, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.hooks);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "map") {
      report(toMarker(localize("promptValidator.hooksMustBeMap", "The 'hooks' attribute must be a map of hook event types to command arrays."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const validHookNames = new Set(Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]));
    for (const prop of attribute.value.properties) {
      if (!validHookNames.has(prop.key.value)) {
        report(toMarker(localize("promptValidator.unknownHookType", "Unknown hook event type '{0}'. Supported: {1}.", prop.key.value, Array.from(validHookNames).join(", ")), prop.key.range, MarkerSeverity.Warning));
      }
      if (prop.value.type !== "sequence") {
        report(toMarker(localize("promptValidator.hookValueMustBeArray", "Hook event '{0}' must have an array of command objects as its value.", prop.key.value), prop.value.range, MarkerSeverity.Error));
        continue;
      }
      for (const item of prop.value.items) {
        this.validateHookCommand(item, target, report);
      }
    }
  }
  validateHookCommand(item, target, report) {
    if (item.type !== "map") {
      report(toMarker(localize("promptValidator.hookCommandMustBeObject", "Each hook command must be an object."), item.range, MarkerSeverity.Error));
      return;
    }
    const hooksProperty = item.properties.find((p) => p.key.value === "hooks");
    if (hooksProperty) {
      for (const prop of item.properties) {
        if (prop.key.value !== "hooks" && prop.key.value !== "matcher") {
          report(toMarker(localize("promptValidator.unknownMatcherProperty", "Unknown property '{0}' in hook matcher.", prop.key.value), prop.key.range, MarkerSeverity.Warning));
        }
      }
      if (hooksProperty.value.type !== "sequence") {
        report(toMarker(localize("promptValidator.nestedHooksMustBeArray", "The 'hooks' property in a matcher must be an array of command objects."), hooksProperty.value.range, MarkerSeverity.Error));
        return;
      }
      for (const nestedItem of hooksProperty.value.items) {
        this.validateHookCommand(nestedItem, target, report);
      }
      return;
    }
    const isCopilotCli = target === Target.GitHubCopilot;
    const validCommandFields = isCopilotCli ? /* @__PURE__ */ new Set(["bash", "powershell"]) : /* @__PURE__ */ new Set(["command", "windows", "linux", "osx", "bash", "powershell"]);
    const validProperties = isCopilotCli ? /* @__PURE__ */ new Set(["type", "bash", "powershell", "cwd", "env", "timeoutSec"]) : /* @__PURE__ */ new Set(["type", "command", "windows", "linux", "osx", "bash", "powershell", "cwd", "env", "timeout"]);
    let hasType = false;
    let hasCommandField = false;
    for (const prop of item.properties) {
      const key = prop.key.value;
      if (!validProperties.has(key)) {
        report(toMarker(localize("promptValidator.unknownHookProperty", "Unknown property '{0}' in hook command.", key), prop.key.range, MarkerSeverity.Warning));
      }
      if (key === "type") {
        hasType = true;
        if (prop.value.type !== "scalar" || prop.value.value !== "command") {
          report(toMarker(localize("promptValidator.hookTypeMustBeCommand", "The 'type' property in a hook command must be 'command'."), prop.value.range, MarkerSeverity.Error));
        }
      } else if (validCommandFields.has(key)) {
        hasCommandField = true;
        if (prop.value.type !== "scalar" || prop.value.value.trim().length === 0) {
          report(toMarker(localize("promptValidator.hookCommandFieldMustBeNonEmptyString", "The '{0}' property in a hook command must be a non-empty string.", key), prop.value.range, MarkerSeverity.Error));
        }
      } else if (key === "cwd") {
        if (prop.value.type !== "scalar") {
          report(toMarker(localize("promptValidator.hookCwdMustBeString", "The 'cwd' property in a hook command must be a string."), prop.value.range, MarkerSeverity.Error));
        }
      } else if (key === "env") {
        if (prop.value.type !== "map") {
          report(toMarker(localize("promptValidator.hookEnvMustBeMap", "The 'env' property in a hook command must be a map of string values."), prop.value.range, MarkerSeverity.Error));
        } else {
          for (const envProp of prop.value.properties) {
            if (envProp.value.type !== "scalar") {
              report(toMarker(localize("promptValidator.hookEnvValueMustBeString", "Environment variable '{0}' must have a string value.", envProp.key.value), envProp.value.range, MarkerSeverity.Error));
            }
          }
        }
      } else if (key === "timeout" || key === "timeoutSec") {
        if (prop.value.type !== "scalar" || isNaN(Number(prop.value.value))) {
          report(toMarker(localize("promptValidator.hookTimeoutMustBeNumber", "The '{0}' property in a hook command must be a number.", key), prop.value.range, MarkerSeverity.Error));
        }
      }
    }
    if (!hasType) {
      report(toMarker(localize("promptValidator.hookMissingType", "Hook command is missing required property 'type'."), item.range, MarkerSeverity.Error));
    }
    if (!hasCommandField) {
      if (isCopilotCli) {
        report(toMarker(localize("promptValidator.hookMissingCopilotCommand", "Hook command must specify at least one of 'bash' or 'powershell'."), item.range, MarkerSeverity.Error));
      } else {
        report(toMarker(localize("promptValidator.hookMissingCommand", "Hook command must specify at least one of 'command', 'windows', 'linux', or 'osx'."), item.range, MarkerSeverity.Error));
      }
    }
  }
  validateHandoffs(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.handOffs);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "sequence") {
      report(toMarker(localize("promptValidator.handoffsMustBeArray", "The 'handoffs' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const seenLabels = /* @__PURE__ */ new Map();
    for (const item of attribute.value.items) {
      if (item.type !== "map") {
        report(toMarker(localize("promptValidator.eachHandoffMustBeObject", "Each handoff in the 'handoffs' attribute must be an object with 'label', 'agent', 'prompt' and optional 'send'."), item.range, MarkerSeverity.Error));
        continue;
      }
      const required = /* @__PURE__ */ new Set(["label", "agent", "prompt"]);
      for (const prop of item.properties) {
        switch (prop.key.value) {
          case "label":
            if (prop.value.type !== "scalar" || prop.value.value.trim().length === 0) {
              report(toMarker(localize("promptValidator.handoffLabelMustBeNonEmptyString", "The 'label' property in a handoff must be a non-empty string."), prop.value.range, MarkerSeverity.Error));
            } else if (!/[a-zA-Z0-9]/.test(prop.value.value)) {
              report(toMarker(localize("promptValidator.handoffLabelMustContainAlphanumeric", "The 'label' property in a handoff must contain at least one alphanumeric character."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          case "agent":
            if (prop.value.type !== "scalar" || prop.value.value.trim().length === 0) {
              report(toMarker(localize("promptValidator.handoffAgentMustBeNonEmptyString", "The 'agent' property in a handoff must be a non-empty string."), prop.value.range, MarkerSeverity.Error));
            } else {
              this.validateAgentValue(prop.value, report);
            }
            break;
          case "prompt":
            if (prop.value.type !== "scalar") {
              report(toMarker(localize("promptValidator.handoffPromptMustBeString", "The 'prompt' property in a handoff must be a string."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          case "send":
            if (!isTrueOrFalse(prop.value)) {
              report(toMarker(localize("promptValidator.handoffSendMustBeBoolean", "The 'send' property in a handoff must be a boolean."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          case "showContinueOn":
            if (!isTrueOrFalse(prop.value)) {
              report(toMarker(localize("promptValidator.handoffShowContinueOnMustBeBoolean", "The 'showContinueOn' property in a handoff must be a boolean."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          case "model":
            if (prop.value.type !== "scalar") {
              report(toMarker(localize("promptValidator.handoffModelMustBeString", "The 'model' property in a handoff must be a string."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          default:
            report(toMarker(localize("promptValidator.unknownHandoffProperty", "Unknown property '{0}' in handoff object. Supported properties are 'label', 'agent', 'prompt' and optional 'send', 'showContinueOn', 'model'.", prop.key.value), prop.value.range, MarkerSeverity.Warning));
        }
        required.delete(prop.key.value);
      }
      if (required.size > 0) {
        report(toMarker(localize("promptValidator.missingHandoffProperties", "Missing required properties {0} in handoff object.", Array.from(required).map((s) => `'${s}'`).join(", ")), item.range, MarkerSeverity.Error));
      }
      const labelProp = item.properties.find((p) => p.key.value === "label");
      if (labelProp?.value.type === "scalar") {
        const normalizedLabel = labelProp.value.value.toLowerCase();
        if (normalizedLabel && seenLabels.has(normalizedLabel)) {
          report(toMarker(localize("promptValidator.duplicateHandoffLabel", "Duplicate handoff label '{0}'. Each handoff must have a unique label.", labelProp.value.value), labelProp.value.range, MarkerSeverity.Error));
        } else if (normalizedLabel) {
          seenLabels.set(normalizedLabel, labelProp.value.range);
        }
      }
    }
  }
  validateInfer(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.infer);
    if (!attribute) {
      return;
    }
    report(toMarker(localize("promptValidator.inferDeprecated", "The 'infer' attribute is deprecated in favour of 'user-invocable' and 'disable-model-invocation'."), attribute.value.range, MarkerSeverity.Error));
  }
  validateTarget(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.target);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.targetMustBeString", "The 'target' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const targetValue = attribute.value.value.trim();
    if (targetValue.length === 0) {
      report(toMarker(localize("promptValidator.targetMustBeNonEmpty", "The 'target' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const validTargets = ["github-copilot", "vscode"];
    if (!validTargets.includes(targetValue)) {
      report(toMarker(localize("promptValidator.targetInvalidValue", "The 'target' attribute must be one of: {0}.", validTargets.join(", ")), attribute.value.range, MarkerSeverity.Error));
    }
  }
  validateUserInvocable(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.userInvocable);
    if (!attribute) {
      return;
    }
    if (!isTrueOrFalse(attribute.value)) {
      report(toMarker(localize("promptValidator.userInvocableMustBeBoolean", "The 'user-invocable' attribute must be 'true' or 'false'."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  validateDisableModelInvocation(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.disableModelInvocation);
    if (!attribute) {
      return;
    }
    if (!isTrueOrFalse(attribute.value)) {
      report(toMarker(localize("promptValidator.disableModelInvocationMustBeBoolean", "The 'disable-model-invocation' attribute must be 'true' or 'false'."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  async validateAgentsAttribute(attributes, header, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.agents);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "sequence") {
      report(toMarker(localize("promptValidator.agentsMustBeArray", "The 'agents' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const agents = (await this.promptsService.getCustomAgents(CancellationToken.None)).filter((a) => a.enabled);
    const availableAgentNames = new Set(agents.map((agent) => agent.name));
    availableAgentNames.add(ChatMode.Agent.name.get());
    const agentNames = [];
    for (const item of attribute.value.items) {
      if (item.type !== "scalar") {
        report(toMarker(localize("promptValidator.eachAgentMustBeString", "Each agent name in the 'agents' attribute must be a string."), item.range, MarkerSeverity.Error));
      } else if (item.value) {
        agentNames.push(item.value);
        if (item.value !== "*" && !availableAgentNames.has(item.value)) {
          report(toMarker(localize("promptValidator.agentInAgentsNotFound", "Unknown agent '{0}' will be ignored. Available agents: {1}.", item.value, Array.from(availableAgentNames).join(", ")), item.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
        }
      }
    }
    if (agentNames.length > 0) {
      const tools = header.tools;
      if (tools && !tools.includes(SpecedToolAliases.agent)) {
        report(toMarker(localize("promptValidator.agentsRequiresAgentTool", "When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute."), attribute.value.range, MarkerSeverity.Warning));
      }
    }
  }
  validateGithubPermissions(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === GithubPromptHeaderAttributes.github);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "map") {
      report(toMarker(localize("promptValidator.githubMustBeMap", "The 'github' attribute must be an object."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    for (const prop of attribute.value.properties) {
      if (prop.key.value !== "permissions") {
        report(toMarker(localize("promptValidator.unknownGithubProperty", "Unknown property '{0}' in 'github' object. Supported: 'permissions'.", prop.key.value), prop.key.range, MarkerSeverity.Warning));
        continue;
      }
      if (prop.value.type !== "map") {
        report(toMarker(localize("promptValidator.permissionsMustBeMap", "The 'permissions' property must be an object."), prop.value.range, MarkerSeverity.Error));
        continue;
      }
      for (const permProp of prop.value.properties) {
        const scope = permProp.key.value;
        const scopeInfo = githubPermissionScopes[scope];
        if (!scopeInfo) {
          const validScopes = Object.keys(githubPermissionScopes).sort().join(", ");
          report(toMarker(localize("promptValidator.unknownPermissionScope", "Unknown permission scope '{0}'. Valid scopes: {1}.", scope, validScopes), permProp.key.range, MarkerSeverity.Warning));
          continue;
        }
        if (permProp.value.type !== "scalar") {
          report(toMarker(localize("promptValidator.permissionValueMustBeString", "The permission value for '{0}' must be a string.", scope), permProp.value.range, MarkerSeverity.Error));
          continue;
        }
        const value = permProp.value.value;
        if (!scopeInfo.allowedValues.includes(value)) {
          report(toMarker(localize("promptValidator.invalidPermissionValue", "Invalid permission value '{0}' for scope '{1}'. Allowed values: {2}.", value, scope, scopeInfo.allowedValues.join(", ")), permProp.value.range, MarkerSeverity.Error));
        }
      }
    }
  }
};
PromptValidator = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, ILanguageModelToolsService),
  __decorateParam(2, IChatModeService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IPromptsService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService)
], PromptValidator);
const githubPermissionScopes = {
  "actions": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.actions", "Access to GitHub Actions workflows and runs") },
  "checks": { allowedValues: ["read", "none"], description: localize("githubPermission.checks", "Access to check runs and statuses") },
  "contents": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.contents", "Access to repository contents (files, commits, branches)") },
  "discussions": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.discussions", "Access to discussions") },
  "issues": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.issues", "Access to issues (read, create, update, comment)") },
  "metadata": { allowedValues: ["read"], description: localize("githubPermission.metadata", "Repository metadata (always read-only)") },
  "pull-requests": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.pullRequests", "Access to pull requests (read, create, update, review)") },
  "security-events": { allowedValues: ["read", "none"], description: localize("githubPermission.securityEvents", "Access to security-related events") },
  "workflows": { allowedValues: ["write", "none"], description: localize("githubPermission.workflows", "Access to modify workflow files") }
};
function isTrueOrFalse(value) {
  if (value.type === "scalar") {
    return (value.value === "true" || value.value === "false") && value.format === "none";
  }
  return false;
}
const allAttributeNames = {
  [PromptsType.prompt]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.model, PromptHeaderAttributes.tools, PromptHeaderAttributes.mode, PromptHeaderAttributes.agent, PromptHeaderAttributes.argumentHint],
  [PromptsType.instructions]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.applyTo, PromptHeaderAttributes.excludeAgent],
  [PromptsType.agent]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.model, PromptHeaderAttributes.tools, PromptHeaderAttributes.advancedOptions, PromptHeaderAttributes.handOffs, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.target, PromptHeaderAttributes.infer, PromptHeaderAttributes.agents, PromptHeaderAttributes.hooks, PromptHeaderAttributes.userInvocable, PromptHeaderAttributes.disableModelInvocation, GithubPromptHeaderAttributes.github],
  [PromptsType.skill]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.license, PromptHeaderAttributes.compatibility, PromptHeaderAttributes.metadata, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.userInvocable, PromptHeaderAttributes.disableModelInvocation, PromptHeaderAttributes.context],
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
function getAttributeDescription(attributeName, promptType, target) {
  if (target === Target.Claude) {
    if (promptType === PromptsType.agent) {
      return claudeAgentAttributes[attributeName]?.description;
    }
    if (promptType === PromptsType.instructions) {
      return claudeRulesAttributes[attributeName]?.description;
    }
  }
  switch (promptType) {
    case PromptsType.instructions:
      switch (attributeName) {
        case PromptHeaderAttributes.name:
          return localize("promptHeader.instructions.name", "The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.");
        case PromptHeaderAttributes.description:
          return localize("promptHeader.instructions.description", "The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.");
        case PromptHeaderAttributes.applyTo:
          return localize("promptHeader.instructions.applyToRange", "One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: `**/*.ts`, `**/*.js`, `client/**`");
      }
      break;
    case PromptsType.skill:
      switch (attributeName) {
        case PromptHeaderAttributes.name:
          return localize("promptHeader.skill.name", "The name of the skill.");
        case PromptHeaderAttributes.description:
          return localize("promptHeader.skill.description", "The description of the skill. The description is added to every request and will be used by the agent to decide when to load the skill.");
        case PromptHeaderAttributes.argumentHint:
          return localize("promptHeader.skill.argumentHint", "Hint shown during autocomplete to indicate expected arguments. Example: [issue-number] or [filename] [format]");
        case PromptHeaderAttributes.userInvocable:
          return localize("promptHeader.skill.userInvocable", "Set to false to hide from the / menu. Use for background knowledge users should not invoke directly. Default: true.");
        case PromptHeaderAttributes.disableModelInvocation:
          return localize("promptHeader.skill.disableModelInvocation", "Set to true to prevent the agent from automatically loading this skill. Use for workflows you want to trigger manually with /name. Default: false.");
      }
      break;
    case PromptsType.agent:
      switch (attributeName) {
        case PromptHeaderAttributes.name:
          return localize("promptHeader.agent.name", "The name of the agent as shown in the UI.");
        case PromptHeaderAttributes.description:
          return localize("promptHeader.agent.description", "The description of the custom agent, what it does and when to use it.");
        case PromptHeaderAttributes.argumentHint:
          return localize("promptHeader.agent.argumentHint", "The argument-hint describes what inputs the custom agent expects or supports.");
        case PromptHeaderAttributes.model:
          return localize("promptHeader.agent.model", "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.");
        case PromptHeaderAttributes.tools:
          return localize("promptHeader.agent.tools", "The set of tools that the custom agent has access to.");
        case PromptHeaderAttributes.handOffs:
          return localize("promptHeader.agent.handoffs", "Possible handoff actions when the agent has completed its task.");
        case PromptHeaderAttributes.target:
          return localize("promptHeader.agent.target", "The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`.");
        case PromptHeaderAttributes.infer:
          return localize("promptHeader.agent.infer", "Controls visibility of the agent.");
        case PromptHeaderAttributes.agents:
          return localize("promptHeader.agent.agents", "One or more agents that this agent can use as subagents. Use '*' to specify all available agents.");
        case PromptHeaderAttributes.hooks:
          return localize("promptHeader.agent.hooks", "Lifecycle hooks scoped to this agent. Define hooks that run only while this agent is active.");
        case PromptHeaderAttributes.userInvocable:
          return localize("promptHeader.agent.userInvocable", "Whether the agent can be selected and invoked by users in the UI.");
        case PromptHeaderAttributes.disableModelInvocation:
          return localize("promptHeader.agent.disableModelInvocation", "If true, prevents the agent from being invoked as a subagent.");
        case GithubPromptHeaderAttributes.github:
          return localize("promptHeader.agent.github", "GitHub-specific configuration for the agent, such as token permissions.");
      }
      break;
    case PromptsType.prompt:
      switch (attributeName) {
        case PromptHeaderAttributes.name:
          return localize("promptHeader.prompt.name", "The name of the prompt. This is also the name of the slash command that will run this prompt.");
        case PromptHeaderAttributes.description:
          return localize("promptHeader.prompt.description", "The description of the reusable prompt, what it does and when to use it.");
        case PromptHeaderAttributes.argumentHint:
          return localize("promptHeader.prompt.argumentHint", "The argument-hint describes what inputs the prompt expects or supports.");
        case PromptHeaderAttributes.model:
          return localize("promptHeader.prompt.model", "The model to use in this prompt. Can also be a list of models. The first available model will be used.");
        case PromptHeaderAttributes.tools:
          return localize("promptHeader.prompt.tools", "The tools to use in this prompt.");
        case PromptHeaderAttributes.agent:
        case PromptHeaderAttributes.mode:
          return localize("promptHeader.prompt.agent.description", "The agent to use when running this prompt.");
      }
      break;
  }
  return void 0;
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
function toMarker(message, range, severity = MarkerSeverity.Error, tags, code) {
  return { severity, message, ...tags ? { tags } : {}, ...code ? { code } : {}, ...range };
}
export {
  MARKERS_OWNER_ID,
  PromptValidator,
  PromptValidatorMarkerCode,
  claudeAgentAttributes,
  claudeRulesAttributes,
  getAttributeDescription,
  getTarget,
  getValidAttributeNames,
  githubPermissionScopes,
  isNonRecommendedAttribute,
  isVSCodeOrDefaultTarget,
  knownClaudeModels,
  knownClaudeTools,
  knownGithubCopilotTools,
  mapClaudeModels,
  mapClaudeTools
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxsYW5ndWFnZVByb3ZpZGVyc1xccHJvbXB0VmFsaWRhdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNFbXB0eVBhdHRlcm4sIHBhcnNlLCBzcGxpdEdsb2JBd2FyZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgTWFya2VyU2V2ZXJpdHksIE1hcmtlclRhZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUsIElDaGF0TW9kZSwgSUNoYXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgU3BlY2VkVG9vbEFsaWFzZXMgfSBmcm9tICcuLi8uLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJU2VxdWVuY2VWYWx1ZSwgSUhlYWRlckF0dHJpYnV0ZSwgSVNjYWxhclZhbHVlLCBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCwgUGFyc2VkUHJvbXB0RmlsZSwgUHJvbXB0SGVhZGVyLCBJVmFsdWUsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMgfSBmcm9tICcuLi9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBBR0VOVFNfU09VUkNFX0ZPTERFUiwgQ0xBVURFX0FHRU5UU19TT1VSQ0VfRk9MREVSLCBpc0luQ2xhdWRlUnVsZXNGb2xkZXIsIGlzU2tpbGxGaWxlbmFtZSwgTEVHQUNZX01PREVfRklMRV9FWFRFTlNJT04sIFZBTElEX1NLSUxMX05BTUVfUkVHRVggfSBmcm9tICcuLi9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBIT09LU19CWV9UQVJHRVQgfSBmcm9tICcuLi9ob29rVHlwZXMuanMnO1xuaW1wb3J0IHsgR2l0aHViUHJvbXB0SGVhZGVyQXR0cmlidXRlcyB9IGZyb20gJy4vcHJvbXB0RmlsZUF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBjb25zdCBNQVJLRVJTX09XTkVSX0lEID0gJ3Byb21wdHMtZGlhZ25vc3RpY3MtcHJvdmlkZXInO1xuXG5leHBvcnQgY29uc3QgZW51bSBQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlIHtcblx0TWlzc2luZ0dpdGh1Yk1jcFNlcnZlciA9ICdwcm9tcHRWYWxpZGF0b3IubWlzc2luZ0dpdGh1Yk1jcFNlcnZlcicsXG5cdE1pc3NpbmdQbGF5d3JpZ2h0TWNwU2VydmVyID0gJ3Byb21wdFZhbGlkYXRvci5taXNzaW5nUGxheXdyaWdodE1jcFNlcnZlcicsXG5cdFVua25vd25FeHRlbnNpb25SZWZlcmVuY2UgPSAncHJvbXB0VmFsaWRhdG9yLnVua25vd25FeHRlbnNpb25SZWZlcmVuY2UnLFxuXHRVbmtub3duTWNwU2VydmVyUmVmZXJlbmNlID0gJ3Byb21wdFZhbGlkYXRvci51bmtub3duTWNwU2VydmVyUmVmZXJlbmNlJyxcblx0VW5rbm93bkV4dGVuc2lvbk9yTWNwU2VydmVyUmVmZXJlbmNlID0gJ3Byb21wdFZhbGlkYXRvci51bmtub3duRXh0ZW5zaW9uT3JNY3BTZXJ2ZXJSZWZlcmVuY2UnXG59XG5cbmV4cG9ydCBjbGFzcyBQcm9tcHRWYWxpZGF0b3Ige1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUNoYXRNb2RlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRNb2RlU2VydmljZTogSUNoYXRNb2RlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVByb21wdHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dnZXI6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBhc3luYyB2YWxpZGF0ZShwcm9tcHRBU1Q6IFBhcnNlZFByb21wdEZpbGUsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHByb21wdEFTVC5oZWFkZXI/LmVycm9ycy5mb3JFYWNoKGVycm9yID0+IHJlcG9ydCh0b01hcmtlcihlcnJvci5tZXNzYWdlLCBlcnJvci5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZ2V0VGFyZ2V0KHByb21wdFR5cGUsIHByb21wdEFTVC5oZWFkZXIgPz8gcHJvbXB0QVNULnVyaSk7XG5cdFx0YXdhaXQgdGhpcy52YWxpZGF0ZUhlYWRlcihwcm9tcHRBU1QsIHByb21wdFR5cGUsIHRhcmdldCwgcmVwb3J0KTtcblx0XHRhd2FpdCB0aGlzLnZhbGlkYXRlQm9keShwcm9tcHRBU1QsIHRhcmdldCwgcmVwb3J0KTtcblx0XHRhd2FpdCB0aGlzLnZhbGlkYXRlRmlsZU5hbWUocHJvbXB0QVNULCBwcm9tcHRUeXBlLCByZXBvcnQpO1xuXHRcdGF3YWl0IHRoaXMudmFsaWRhdGVTa2lsbEF0dHJpYnV0ZXMocHJvbXB0QVNULCBwcm9tcHRUeXBlLCByZXBvcnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUZpbGVOYW1lKHByb21wdEFTVDogUGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50ICYmIHByb21wdEFTVC51cmkucGF0aC5lbmRzV2l0aChMRUdBQ1lfTU9ERV9GSUxFX0VYVEVOU0lPTikpIHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5wcm9tcHRzU2VydmljZS5nZXRBZ2VudEZpbGVVUklGcm9tTW9kZUZpbGUocHJvbXB0QVNULnVyaSk7XG5cdFx0XHRpZiAobG9jYXRpb24gJiYgYXdhaXQgdGhpcy5maWxlU2VydmljZS5jYW5DcmVhdGVGaWxlKGxvY2F0aW9uKSkge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5jaGF0TW9kZXNSZW5hbWVkVG9BZ2VudHMnLCBcIkNoYXQgbW9kZXMgaGF2ZSBiZWVuIHJlbmFtZWQgdG8gYWdlbnRzLiBQbGVhc2UgbW92ZSB0aGlzIGZpbGUgdG8gezB9XCIsIGxvY2F0aW9uLnRvU3RyaW5nKCkpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNCksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmNoYXRNb2Rlc1JlbmFtZWRUb0FnZW50c05vTW92ZScsIFwiQ2hhdCBtb2RlcyBoYXZlIGJlZW4gcmVuYW1lZCB0byBhZ2VudHMuIFBsZWFzZSBtb3ZlIHRoZSBmaWxlIHRvIHswfVwiLCBBR0VOVFNfU09VUkNFX0ZPTERFUiksIG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGVTa2lsbEF0dHJpYnV0ZXMocHJvbXB0QVNUOiBQYXJzZWRQcm9tcHRGaWxlLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocHJvbXB0VHlwZSAhPT0gUHJvbXB0c1R5cGUuc2tpbGwgfHwgIXByb21wdEFTVC5oZWFkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuYW1lQXR0cmlidXRlID0gcHJvbXB0QVNULmhlYWRlci5nZXRBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lKTtcblx0XHRpZiAoIW5hbWVBdHRyaWJ1dGUpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihcblx0XHRcdFx0bG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5za2lsbE5hbWVNaXNzaW5nJywgXCJTa2lsbCBzaG91bGQgcHJvdmlkZSBhIG5hbWUuXCIpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgNCksXG5cdFx0XHRcdE1hcmtlclNldmVyaXR5Lldhcm5pbmdcblx0XHRcdCkpO1xuXHRcdH0gZWxzZSBpZiAobmFtZUF0dHJpYnV0ZS52YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0Y29uc3Qgc2tpbGxOYW1lID0gbmFtZUF0dHJpYnV0ZS52YWx1ZS52YWx1ZS50cmltKCk7XG5cdFx0XHRpZiAoc2tpbGxOYW1lLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0aWYgKCFWQUxJRF9TS0lMTF9OQU1FX1JFR0VYLnRlc3Qoc2tpbGxOYW1lKSkge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3Iuc2tpbGxOYW1lSW52YWxpZENoYXJzJywgXCJTa2lsbCBuYW1lIG1heSBvbmx5IGNvbnRhaW4gbG93ZXJjYXNlIGxldHRlcnMsIG51bWJlcnMsIGFuZCBoeXBoZW5zLlwiKSxcblx0XHRcdFx0XHRcdG5hbWVBdHRyaWJ1dGUudmFsdWUucmFuZ2UsXG5cdFx0XHRcdFx0XHRNYXJrZXJTZXZlcml0eS5FcnJvclxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRXh0cmFjdCBmb2xkZXIgbmFtZSBmcm9tIHBhdGggKGUuZy4sIC5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kIC0+IG15LXNraWxsKVxuXHRcdFx0XHRjb25zdCBwYXRoUGFydHMgPSBwcm9tcHRBU1QudXJpLnBhdGguc3BsaXQoJy8nKTtcblx0XHRcdFx0Y29uc3Qgc2tpbGxJbmRleCA9IHBhdGhQYXJ0cy5maW5kSW5kZXgocGFydCA9PiBpc1NraWxsRmlsZW5hbWUocGFydCkpO1xuXHRcdFx0XHRpZiAoc2tpbGxJbmRleCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBmb2xkZXJOYW1lID0gcGF0aFBhcnRzW3NraWxsSW5kZXggLSAxXTtcblx0XHRcdFx0XHRpZiAoZm9sZGVyTmFtZSAmJiBza2lsbE5hbWUgIT09IGZvbGRlck5hbWUpIHtcblx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5za2lsbE5hbWVGb2xkZXJNaXNtYXRjaCcsIFwiVGhlIHNraWxsIG5hbWUgJ3swfScgc2hvdWxkIG1hdGNoIHRoZSBmb2xkZXIgbmFtZSAnezF9Jy5cIiwgc2tpbGxOYW1lLCBmb2xkZXJOYW1lKSxcblx0XHRcdFx0XHRcdFx0bmFtZUF0dHJpYnV0ZS52YWx1ZS5yYW5nZSxcblx0XHRcdFx0XHRcdFx0TWFya2VyU2V2ZXJpdHkuV2FybmluZ1xuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb25BdHRyaWJ1dGUgPSBwcm9tcHRBU1QuaGVhZGVyLmdldEF0dHJpYnV0ZShQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uKTtcblx0XHRpZiAoIWRlc2NyaXB0aW9uQXR0cmlidXRlKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIoXG5cdFx0XHRcdGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3Iuc2tpbGxEZXNjcmlwdGlvbk1pc3NpbmcnLCBcIlNraWxsIHNob3VsZCBwcm92aWRlIGEgZGVzY3JpcHRpb24uXCIpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgNCksXG5cdFx0XHRcdE1hcmtlclNldmVyaXR5Lldhcm5pbmdcblx0XHRcdCkpO1xuXG5cdFx0XHQvLyBXaXRob3V0IGEgZGVzY3JpcHRpb24sIHVzZXItaW52b2NhYmxlOiBmYWxzZSBpcyBpbnZhbGlkIGJlY2F1c2UgdGhlIHNraWxsXG5cdFx0XHQvLyB3b3VsZCBiZSBtb2RlbC1vbmx5IGJ1dCBoYXMgbm8gZGVzY3JpcHRpb24gZm9yIHRoZSBtb2RlbCB0byBkZWNpZGUgd2hlbiB0byB1c2UgaXQuXG5cdFx0XHRpZiAocHJvbXB0QVNULmhlYWRlci51c2VySW52b2NhYmxlID09PSBmYWxzZSkge1xuXHRcdFx0XHRjb25zdCB1c2VySW52b2NhYmxlQXR0ciA9IHByb21wdEFTVC5oZWFkZXIuZ2V0QXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMudXNlckludm9jYWJsZSk7XG5cdFx0XHRcdGlmICh1c2VySW52b2NhYmxlQXR0cikge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3Iuc2tpbGxVc2VySW52b2NhYmxlUmVxdWlyZXNEZXNjcmlwdGlvbicsIFwiQSBkZXNjcmlwdGlvbiBpcyByZXF1aXJlZCB3aGVuIHVzZXItaW52b2NhYmxlIGlzIGZhbHNlLCBiZWNhdXNlIHRoZSBtb2RlbCBuZWVkcyBhIGRlc2NyaXB0aW9uIHRvIGRlY2lkZSB3aGVuIHRvIGxvYWQgdGhlIHNraWxsLlwiKSxcblx0XHRcdFx0XHRcdHVzZXJJbnZvY2FibGVBdHRyLnZhbHVlLnJhbmdlLFxuXHRcdFx0XHRcdFx0TWFya2VyU2V2ZXJpdHkuRXJyb3Jcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXaXRob3V0IGEgZGVzY3JpcHRpb24sIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogZmFsc2UgKG1vZGVsIGludm9jYXRpb24gZW5hYmxlZClcblx0XHRcdC8vIGlzIHRoZSBkZWZhdWx0IGJ1dCBpZiBleHBsaWNpdGx5IHNldCwgcmVwb3J0IGFuIGVycm9yIHRoYXQgYSBkZXNjcmlwdGlvbiBpcyBuZWVkZWQuXG5cdFx0XHRpZiAocHJvbXB0QVNULmhlYWRlci5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uID09PSBmYWxzZSkge1xuXHRcdFx0XHRjb25zdCBkaXNhYmxlTW9kZWxJbnZvY2F0aW9uQXR0ciA9IHByb21wdEFTVC5oZWFkZXIuZ2V0QXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGlzYWJsZU1vZGVsSW52b2NhdGlvbik7XG5cdFx0XHRcdGlmIChkaXNhYmxlTW9kZWxJbnZvY2F0aW9uQXR0cikge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3Iuc2tpbGxNb2RlbEludm9jYXRpb25SZXF1aXJlc0Rlc2NyaXB0aW9uJywgXCJBIGRlc2NyaXB0aW9uIGlzIHJlcXVpcmVkIHdoZW4gbW9kZWwgaW52b2NhdGlvbiBpcyBlbmFibGVkLCBiZWNhdXNlIHRoZSBtb2RlbCBuZWVkcyBhIGRlc2NyaXB0aW9uIHRvIGRlY2lkZSB3aGVuIHRvIGxvYWQgdGhlIHNraWxsLlwiKSxcblx0XHRcdFx0XHRcdGRpc2FibGVNb2RlbEludm9jYXRpb25BdHRyLnZhbHVlLnJhbmdlLFxuXHRcdFx0XHRcdFx0TWFya2VyU2V2ZXJpdHkuRXJyb3Jcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIGNvbnRleHQ6IGZvcmsgXHUyMDE0IHJlcXVpcmVzIHRoZSBza2lsbCB0b29sIHRvIGJlIGVuYWJsZWRcblx0XHRjb25zdCBjb250ZXh0QXR0cmlidXRlID0gcHJvbXB0QVNULmhlYWRlcj8uZ2V0QXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMuY29udGV4dCk7XG5cdFx0aWYgKGNvbnRleHRBdHRyaWJ1dGUgJiYgY29udGV4dEF0dHJpYnV0ZS52YWx1ZS50eXBlID09PSAnc2NhbGFyJyAmJiBjb250ZXh0QXR0cmlidXRlLnZhbHVlLnZhbHVlLnRyaW0oKSA9PT0gJ2ZvcmsnKSB7XG5cdFx0XHRjb25zdCBza2lsbFRvb2xFbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZ2l0aHViLmNvcGlsb3QuY2hhdC5za2lsbFRvb2wuZW5hYmxlZCcpO1xuXHRcdFx0aWYgKCFza2lsbFRvb2xFbmFibGVkKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihcblx0XHRcdFx0XHRsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmNvbnRleHRGb3JrTm90U3VwcG9ydGVkJywgXCJUaGUgJ2NvbnRleHQ6IGZvcmsnIGF0dHJpYnV0ZSByZXF1aXJlcyB0aGUgc2tpbGwgdG9vbCB0byBiZSBlbmFibGVkIChnaXRodWIuY29waWxvdC5jaGF0LnNraWxsVG9vbC5lbmFibGVkKS5cIiksXG5cdFx0XHRcdFx0Y29udGV4dEF0dHJpYnV0ZS52YWx1ZS5yYW5nZSxcblx0XHRcdFx0XHRNYXJrZXJTZXZlcml0eS5XYXJuaW5nXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGVCb2R5KHByb21wdEFTVDogUGFyc2VkUHJvbXB0RmlsZSwgdGFyZ2V0OiBUYXJnZXQsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYm9keSA9IHByb21wdEFTVC5ib2R5O1xuXHRcdGlmICghYm9keSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIGZpbGUgcmVmZXJlbmNlc1xuXHRcdGNvbnN0IGZpbGVSZWZlcmVuY2VDaGVja3M6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVmIG9mIGJvZHkuZmlsZVJlZmVyZW5jZXMpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYm9keS5yZXNvbHZlRmlsZVBhdGgocmVmLmNvbnRlbnQpO1xuXHRcdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5pbnZhbGlkRmlsZVJlZmVyZW5jZScsIFwiSW52YWxpZCBmaWxlIHJlZmVyZW5jZSAnezB9Jy5cIiwgcmVmLmNvbnRlbnQpLCByZWYucmFuZ2UsIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvbXB0QVNULnVyaS5zY2hlbWUgPT09IHJlc29sdmVkLnNjaGVtZSkge1xuXHRcdFx0XHQvLyBvbmx5IHZhbGlkYXRlIGlmIHRoZSBsaW5rIGlzIGluIHRoZSBmaWxlIHN5c3RlbSBvZiB0aGUgcHJvbXB0IGZpbGVcblx0XHRcdFx0ZmlsZVJlZmVyZW5jZUNoZWNrcy5wdXNoKChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHJlc29sdmVkKTtcblx0XHRcdFx0XHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxvYyA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc29sdmVkKTtcblx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuZmlsZU5vdEZvdW5kJywgXCJGaWxlICd7MH0nIG5vdCBmb3VuZCBhdCAnezF9Jy5cIiwgcmVmLmNvbnRlbnQsIGxvYyksIHJlZi5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nZ2VyLndhcm4oYEVycm9yIGNoZWNraW5nIGV4aXN0ZW5jZSBvZiBmaWxlIHJlZmVyZW5jZSAnJHtyZWYuY29udGVudH0nIHJlc29sdmVkIHRvICcke3Jlc29sdmVkLnRvU3RyaW5nKCl9JyBpbiBwcm9tcHQgZmlsZSAnJHtwcm9tcHRBU1QudXJpLnRvU3RyaW5nKCl9JzogJHtlLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSgpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSB2YXJpYWJsZSByZWZlcmVuY2VzICh0b29sIG9yIHRvb2xzZXQgbmFtZXMpXG5cdFx0aWYgKGJvZHkudmFyaWFibGVSZWZlcmVuY2VzLmxlbmd0aCAmJiBpc1ZTQ29kZU9yRGVmYXVsdFRhcmdldCh0YXJnZXQpKSB7XG5cdFx0XHRjb25zdCBoZWFkZXJUb29scyA9IHByb21wdEFTVC5oZWFkZXI/LnRvb2xzO1xuXHRcdFx0Y29uc3QgaGVhZGVyVG9vbHNNYXAgPSBoZWFkZXJUb29scyA/IHRoaXMubGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS50b1Rvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcChoZWFkZXJUb29scywgdW5kZWZpbmVkKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgYXZhaWxhYmxlID0gbmV3IFNldDxzdHJpbmc+KHRoaXMubGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZXMoKSk7XG5cdFx0XHRjb25zdCBkZXByZWNhdGVkTmFtZXMgPSB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0RGVwcmVjYXRlZEZ1bGxSZWZlcmVuY2VOYW1lcygpO1xuXHRcdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiBib2R5LnZhcmlhYmxlUmVmZXJlbmNlcykge1xuXHRcdFx0XHRpZiAoIWF2YWlsYWJsZS5oYXModmFyaWFibGUubmFtZSkpIHtcblx0XHRcdFx0XHRpZiAoZGVwcmVjYXRlZE5hbWVzLmhhcyh2YXJpYWJsZS5uYW1lKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudE5hbWVzID0gZGVwcmVjYXRlZE5hbWVzLmdldCh2YXJpYWJsZS5uYW1lKTtcblx0XHRcdFx0XHRcdGlmIChjdXJyZW50TmFtZXMgJiYgY3VycmVudE5hbWVzLnNpemUgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChjdXJyZW50TmFtZXMuc2l6ZSA9PT0gMSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG5ld05hbWUgPSBBcnJheS5mcm9tKGN1cnJlbnROYW1lcylbMF07XG5cdFx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuZGVwcmVjYXRlZFZhcmlhYmxlUmVmZXJlbmNlJywgXCJUb29sIG9yIHRvb2xzZXQgJ3swfScgaGFzIGJlZW4gcmVuYW1lZCwgdXNlICd7MX0nIGluc3RlYWQuXCIsIHZhcmlhYmxlLm5hbWUsIG5ld05hbWUpLCB2YXJpYWJsZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSW5mbykpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG5ld05hbWVzID0gQXJyYXkuZnJvbShjdXJyZW50TmFtZXMpLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSkuam9pbignLCAnKTtcblx0XHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5kZXByZWNhdGVkVmFyaWFibGVSZWZlcmVuY2VNdWx0aXBsZU5hbWVzJywgXCJUb29sIG9yIHRvb2xzZXQgJ3swfScgaGFzIGJlZW4gcmVuYW1lZCwgdXNlIHRoZSBmb2xsb3dpbmcgdG9vbHMgaW5zdGVhZDogezF9XCIsIHZhcmlhYmxlLm5hbWUsIG5ld05hbWVzKSwgdmFyaWFibGUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkluZm8pKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtaXNzaW5nR2l0aHViU2VydmVyTWFya2VyID0gdGhpcy5nZXRNaXNzaW5nR2l0aHViTWNwU2VydmVyTWFya2VyKHZhcmlhYmxlLm5hbWUsIHZhcmlhYmxlLnJhbmdlKTtcblx0XHRcdFx0XHRcdGlmIChtaXNzaW5nR2l0aHViU2VydmVyTWFya2VyKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydChtaXNzaW5nR2l0aHViU2VydmVyTWFya2VyKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1pc3NpbmdQbGF5d3JpZ2h0U2VydmVyTWFya2VyID0gdGhpcy5nZXRNaXNzaW5nUGxheXdyaWdodE1jcFNlcnZlck1hcmtlcih2YXJpYWJsZS5uYW1lLCB2YXJpYWJsZS5yYW5nZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChtaXNzaW5nUGxheXdyaWdodFNlcnZlck1hcmtlcikge1xuXHRcdFx0XHRcdFx0XHRcdHJlcG9ydChtaXNzaW5nUGxheXdyaWdodFNlcnZlck1hcmtlcik7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVwb3J0KHRoaXMuZ2V0VW5rbm93blRvb2xNYXJrZXIodmFyaWFibGUubmFtZSwgdmFyaWFibGUucmFuZ2UsIHRydWUpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChoZWFkZXJUb29sc01hcCkge1xuXHRcdFx0XHRcdGNvbnN0IHRvb2wgPSB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0VG9vbEJ5RnVsbFJlZmVyZW5jZU5hbWUodmFyaWFibGUubmFtZSk7XG5cdFx0XHRcdFx0aWYgKHRvb2wgJiYgaGVhZGVyVG9vbHNNYXAuZ2V0KHRvb2wpID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuZGlzYWJsZWRUb29sJywgXCJUb29sIG9yIHRvb2xzZXQgJ3swfScgYWxzbyBuZWVkcyB0byBiZSBlbmFibGVkIGluIHRoZSBoZWFkZXIuXCIsIHZhcmlhYmxlLm5hbWUpLCB2YXJpYWJsZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2UuYWxsKGZpbGVSZWZlcmVuY2VDaGVja3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUhlYWRlcihwcm9tcHRBU1Q6IFBhcnNlZFByb21wdEZpbGUsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCB0YXJnZXQ6IFRhcmdldCwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoZWFkZXIgPSBwcm9tcHRBU1QuaGVhZGVyO1xuXHRcdGlmICghaGVhZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGF0dHJpYnV0ZXMgPSBoZWFkZXIuYXR0cmlidXRlcztcblx0XHR0aGlzLmNoZWNrRm9ySW52YWxpZEFyZ3VtZW50cyhhdHRyaWJ1dGVzLCBwcm9tcHRUeXBlLCB0YXJnZXQsIHJlcG9ydCk7XG5cblx0XHR0aGlzLnZhbGlkYXRlTmFtZShhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdHRoaXMudmFsaWRhdGVEZXNjcmlwdGlvbihhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdHRoaXMudmFsaWRhdGVBcmd1bWVudEhpbnQoYXR0cmlidXRlcywgcmVwb3J0KTtcblx0XHRzd2l0Y2ggKHByb21wdFR5cGUpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OiB7XG5cdFx0XHRcdGNvbnN0IGFnZW50ID0gYXdhaXQgdGhpcy52YWxpZGF0ZUFnZW50KGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVUb29scyhhdHRyaWJ1dGVzLCBhZ2VudD8ua2luZCA/PyBDaGF0TW9kZUtpbmQuQWdlbnQsIHRhcmdldCwgcmVwb3J0KTtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZU1vZGVsKGF0dHJpYnV0ZXMsIGFnZW50Py5raW5kID8/IENoYXRNb2RlS2luZC5BZ2VudCwgcmVwb3J0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdFx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdFx0XHRcdHRoaXMudmFsaWRhdGVQYXRocyhhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMudmFsaWRhdGVBcHBseVRvKGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy52YWxpZGF0ZUV4Y2x1ZGVBZ2VudChhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDoge1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlVGFyZ2V0KGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVJbmZlcihhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlVXNlckludm9jYWJsZShhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlRGlzYWJsZU1vZGVsSW52b2NhdGlvbihhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlVG9vbHMoYXR0cmlidXRlcywgQ2hhdE1vZGVLaW5kLkFnZW50LCB0YXJnZXQsIHJlcG9ydCk7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVIb29rcyhhdHRyaWJ1dGVzLCB0YXJnZXQsIHJlcG9ydCk7XG5cdFx0XHRcdGlmIChpc1ZTQ29kZU9yRGVmYXVsdFRhcmdldCh0YXJnZXQpKSB7XG5cdFx0XHRcdFx0dGhpcy52YWxpZGF0ZU1vZGVsKGF0dHJpYnV0ZXMsIENoYXRNb2RlS2luZC5BZ2VudCwgcmVwb3J0KTtcblx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlSGFuZG9mZnMoYXR0cmlidXRlcywgcmVwb3J0KTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnZhbGlkYXRlQWdlbnRzQXR0cmlidXRlKGF0dHJpYnV0ZXMsIGhlYWRlciwgcmVwb3J0KTtcblx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlR2l0aHViUGVybWlzc2lvbnMoYXR0cmlidXRlcywgcmVwb3J0KTtcblx0XHRcdFx0fSBlbHNlIGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUpIHtcblx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlQ2xhdWRlQXR0cmlidXRlcyhhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRhcmdldCA9PT0gVGFyZ2V0LkdpdEh1YkNvcGlsb3QpIHtcblx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlR2l0aHViUGVybWlzc2lvbnMoYXR0cmlidXRlcywgcmVwb3J0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5za2lsbDpcblx0XHRcdFx0dGhpcy52YWxpZGF0ZVVzZXJJbnZvY2FibGUoYXR0cmlidXRlcywgcmVwb3J0KTtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZURpc2FibGVNb2RlbEludm9jYXRpb24oYXR0cmlidXRlcywgcmVwb3J0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjaGVja0ZvckludmFsaWRBcmd1bWVudHMoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgdGFyZ2V0OiBUYXJnZXQsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsaWRBdHRyaWJ1dGVOYW1lcyA9IGdldFZhbGlkQXR0cmlidXRlTmFtZXMocHJvbXB0VHlwZSwgdHJ1ZSwgdGFyZ2V0KTtcblx0XHRjb25zdCB2YWxpZEdpdGh1YkNvcGlsb3RBdHRyaWJ1dGVOYW1lcyA9IG5ldyBMYXp5KCgpID0+IG5ldyBTZXQoZ2V0VmFsaWRBdHRyaWJ1dGVOYW1lcyhwcm9tcHRUeXBlLCBmYWxzZSwgVGFyZ2V0LkdpdEh1YkNvcGlsb3QpKSk7XG5cdFx0Zm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgYXR0cmlidXRlcykge1xuXHRcdFx0aWYgKCF2YWxpZEF0dHJpYnV0ZU5hbWVzLmluY2x1ZGVzKGF0dHJpYnV0ZS5rZXkpKSB7XG5cdFx0XHRcdGNvbnN0IHN1cHBvcnRlZE5hbWVzID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG5hbWVzID0gZ2V0VmFsaWRBdHRyaWJ1dGVOYW1lcyhwcm9tcHRUeXBlLCBmYWxzZSwgdGFyZ2V0KTtcblx0XHRcdFx0XHRyZXR1cm4gbmFtZXMuc29ydCgpLmpvaW4oJywgJyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzd2l0Y2ggKHByb21wdFR5cGUpIHtcblx0XHRcdFx0XHRjYXNlIFByb21wdHNUeXBlLnByb21wdDpcblx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVua25vd25BdHRyaWJ1dGUucHJvbXB0JywgXCJBdHRyaWJ1dGUgJ3swfScgaXMgbm90IHN1cHBvcnRlZCBpbiBwcm9tcHQgZmlsZXMuIFN1cHBvcnRlZDogezF9LlwiLCBhdHRyaWJ1dGUua2V5LCBzdXBwb3J0ZWROYW1lcy52YWx1ZSksIGF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSGludCwgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRcdFx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuR2l0SHViQ29waWxvdCkge1xuXHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci51bmtub3duQXR0cmlidXRlLmdpdGh1Yi1hZ2VudCcsIFwiQXR0cmlidXRlICd7MH0nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gY3VzdG9tIEdpdEh1YiBDb3BpbG90IGFnZW50IGZpbGVzLiBTdXBwb3J0ZWQ6IHsxfS5cIiwgYXR0cmlidXRlLmtleSwgc3VwcG9ydGVkTmFtZXMudmFsdWUpLCBhdHRyaWJ1dGUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkhpbnQsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdFx0XHRcdFx0XHQvLyBpZ25vcmUgZm9yIG5vdyBhcyB3ZSBkb24ndCBoYXZlIGEgZnVsbCBsaXN0IG9mIHN1cHBvcnRlZCBhdHRyaWJ1dGVzIGZvciBjbGF1ZGUgdGFyZ2V0XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRpZiAodmFsaWRHaXRodWJDb3BpbG90QXR0cmlidXRlTmFtZXMudmFsdWUuaGFzKGF0dHJpYnV0ZS5rZXkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaWdub3JlZEF0dHJpYnV0ZS52c2NvZGUtYWdlbnQnLCBcIkF0dHJpYnV0ZSAnezB9JyBpcyBpZ25vcmVkIHdoZW4gcnVubmluZyBsb2NhbGx5IGluIFZTIENvZGUuXCIsIGF0dHJpYnV0ZS5rZXkpLCBhdHRyaWJ1dGUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkhpbnQsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudW5rbm93bkF0dHJpYnV0ZS52c2NvZGUtYWdlbnQnLCBcIkF0dHJpYnV0ZSAnezB9JyBpcyBub3Qgc3VwcG9ydGVkIGluIFZTIENvZGUgYWdlbnQgZmlsZXMuIFN1cHBvcnRlZDogezF9LlwiLCBhdHRyaWJ1dGUua2V5LCBzdXBwb3J0ZWROYW1lcy52YWx1ZSksIGF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSGludCwgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRcdFx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVua25vd25BdHRyaWJ1dGUucnVsZXMnLCBcIkF0dHJpYnV0ZSAnezB9JyBpcyBub3Qgc3VwcG9ydGVkIGluIHJ1bGVzIGZpbGVzIGJ5IFZTIENvZGUgYWdlbnRzLiBTdXBwb3J0ZWQ6IHsxfS5cIiwgYXR0cmlidXRlLmtleSwgc3VwcG9ydGVkTmFtZXMudmFsdWUpLCBhdHRyaWJ1dGUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkhpbnQsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci51bmtub3duQXR0cmlidXRlLmluc3RydWN0aW9ucycsIFwiQXR0cmlidXRlICd7MH0nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gaW5zdHJ1Y3Rpb25zIGZpbGVzLiBTdXBwb3J0ZWQ6IHsxfS5cIiwgYXR0cmlidXRlLmtleSwgc3VwcG9ydGVkTmFtZXMudmFsdWUpLCBhdHRyaWJ1dGUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkhpbnQsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudW5rbm93bkF0dHJpYnV0ZS5za2lsbCcsIFwiQXR0cmlidXRlICd7MH0nIGlzIG5vdCBzdXBwb3J0ZWQgYnkgVlMgQ29kZSBhZ2VudHMuIFN1cHBvcnRlZDogezF9LlwiLCBhdHRyaWJ1dGUua2V5LCBzdXBwb3J0ZWROYW1lcy52YWx1ZSksIGF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSGludCwgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblxuXG5cdHByaXZhdGUgdmFsaWRhdGVOYW1lKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBuYW1lQXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZSk7XG5cdFx0aWYgKCFuYW1lQXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChuYW1lQXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5uYW1lTXVzdEJlU3RyaW5nJywgXCJUaGUgJ25hbWUnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgbmFtZUF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKG5hbWVBdHRyaWJ1dGUudmFsdWUudmFsdWUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IubmFtZVNob3VsZE5vdEJlRW1wdHknLCBcIlRoZSAnbmFtZScgYXR0cmlidXRlIG11c3Qgbm90IGJlIGVtcHR5LlwiKSwgbmFtZUF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlRGVzY3JpcHRpb24oYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uQXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb24pO1xuXHRcdGlmICghZGVzY3JpcHRpb25BdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGRlc2NyaXB0aW9uQXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5kZXNjcmlwdGlvbk11c3RCZVN0cmluZycsIFwiVGhlICdkZXNjcmlwdGlvbicgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcuXCIpLCBkZXNjcmlwdGlvbkF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGRlc2NyaXB0aW9uQXR0cmlidXRlLnZhbHVlLnZhbHVlLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmRlc2NyaXB0aW9uU2hvdWxkTm90QmVFbXB0eScsIFwiVGhlICdkZXNjcmlwdGlvbicgYXR0cmlidXRlIHNob3VsZCBub3QgYmUgZW1wdHkuXCIpLCBkZXNjcmlwdGlvbkF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlQXJndW1lbnRIaW50KGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBhcmd1bWVudEhpbnRBdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hcmd1bWVudEhpbnQpO1xuXHRcdGlmICghYXJndW1lbnRIaW50QXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhcmd1bWVudEhpbnRBdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmFyZ3VtZW50SGludE11c3RCZVN0cmluZycsIFwiVGhlICdhcmd1bWVudC1oaW50JyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5cIiksIGFyZ3VtZW50SGludEF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGFyZ3VtZW50SGludEF0dHJpYnV0ZS52YWx1ZS52YWx1ZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5hcmd1bWVudEhpbnRTaG91bGROb3RCZUVtcHR5JywgXCJUaGUgJ2FyZ3VtZW50LWhpbnQnIGF0dHJpYnV0ZSBzaG91bGQgbm90IGJlIGVtcHR5LlwiKSwgYXJndW1lbnRIaW50QXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZU1vZGVsKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgYWdlbnRLaW5kOiBDaGF0TW9kZUtpbmQsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMubW9kZWwpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicgJiYgYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLm1vZGVsTXVzdEJlU3RyaW5nT3JBcnJheScsIFwiVGhlICdtb2RlbCcgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcgb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncy5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbE5hbWVzOiBbc3RyaW5nLCBSYW5nZV1bXSA9IFtdO1xuXHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdGNvbnN0IG1vZGVsTmFtZSA9IGF0dHJpYnV0ZS52YWx1ZS52YWx1ZS50cmltKCk7XG5cdFx0XHRpZiAobW9kZWxOYW1lLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5tb2RlbE11c3RCZU5vbkVtcHR5JywgXCJUaGUgJ21vZGVsJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG1vZGVsTmFtZXMucHVzaChbbW9kZWxOYW1lLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2VdKTtcblx0XHR9IGVsc2UgaWYgKGF0dHJpYnV0ZS52YWx1ZS50eXBlID09PSAnc2VxdWVuY2UnKSB7XG5cdFx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLml0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5tb2RlbEFycmF5TXVzdE5vdEJlRW1wdHknLCBcIlRoZSAnbW9kZWwnIGFycmF5IG11c3Qgbm90IGJlIGVtcHR5LlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYXR0cmlidXRlLnZhbHVlLml0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IubW9kZWxBcnJheU11c3RDb250YWluU3RyaW5ncycsIFwiVGhlICdtb2RlbCcgYXJyYXkgbXVzdCBjb250YWluIG9ubHkgc3RyaW5ncy5cIiksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1vZGVsTmFtZSA9IGl0ZW0udmFsdWUudHJpbSgpO1xuXHRcdFx0XHRpZiAobW9kZWxOYW1lLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLm1vZGVsQXJyYXlJdGVtTXVzdEJlTm9uRW1wdHknLCBcIk1vZGVsIG5hbWVzIGluIHRoZSBhcnJheSBtdXN0IGJlIG5vbi1lbXB0eSBzdHJpbmdzLlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bW9kZWxOYW1lcy5wdXNoKFttb2RlbE5hbWUsIGl0ZW0ucmFuZ2VdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBsYW5ndWFnZU1vZGVscyA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKTtcblx0XHRpZiAobGFuZ3VhZ2VNb2RlbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBsaWtlbHkgdGhlIHNlcnZpY2UgaXMgbm90IGluaXRpYWxpemVkIHlldFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW21vZGVsTmFtZSwgcmFuZ2VdIG9mIG1vZGVsTmFtZXMpIHtcblx0XHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSB0aGlzLmZpbmRNb2RlbEJ5TmFtZShtb2RlbE5hbWUpO1xuXHRcdFx0aWYgKCFtb2RlbE1ldGFkYXRhKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLm1vZGVsTm90Rm91bmQnLCBcIlVua25vd24gbW9kZWwgJ3swfScgd2lsbCBiZSBpZ25vcmVkLlwiLCBtb2RlbE5hbWUpLCByYW5nZSwgTWFya2VyU2V2ZXJpdHkuSGludCwgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pKTtcblx0XHRcdH0gZWxzZSBpZiAoYWdlbnRLaW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQgJiYgIUlMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLnN1aXRhYmxlRm9yQWdlbnRNb2RlKG1vZGVsTWV0YWRhdGEpKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLm1vZGVsTm90U3VpdGVkJywgXCJNb2RlbCAnezB9JyBpcyBub3Qgc3VpdGVkIGZvciBhZ2VudCBtb2RlLlwiLCBtb2RlbE5hbWUpLCByYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVDbGF1ZGVBdHRyaWJ1dGVzKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB2b2lkIHtcblx0XHQvLyB2YWlkYXRlIGFsbCBjbGF1ZGUtc3BlY2lmaWMgYXR0cmlidXRlcyB0aGF0IGhhdmUgZW51bSB2YWx1ZXNcblx0XHRmb3IgKGNvbnN0IGNsYXVkZUF0dHJpYnV0ZU5hbWUgaW4gY2xhdWRlQWdlbnRBdHRyaWJ1dGVzKSB7XG5cdFx0XHRjb25zdCBjbGF1ZGVBdHRyaWJ1dGUgPSBjbGF1ZGVBZ2VudEF0dHJpYnV0ZXNbY2xhdWRlQXR0cmlidXRlTmFtZV07XG5cdFx0XHRjb25zdCBlbnVtVmFsdWVzID0gY2xhdWRlQXR0cmlidXRlLmVudW1zO1xuXHRcdFx0aWYgKGVudW1WYWx1ZXMpIHtcblx0XHRcdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IGNsYXVkZUF0dHJpYnV0ZU5hbWUpO1xuXHRcdFx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5jbGF1ZGUuYXR0cmlidXRlTXVzdEJlU3RyaW5nJywgXCJUaGUgJ3swfScgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcuXCIsIGNsYXVkZUF0dHJpYnV0ZU5hbWUpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWxOYW1lID0gYXR0cmlidXRlLnZhbHVlLnZhbHVlLnRyaW0oKTtcblx0XHRcdFx0XHRpZiAoZW51bVZhbHVlcy5ldmVyeShtb2RlbCA9PiBtb2RlbC5uYW1lICE9PSBtb2RlbE5hbWUpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWxpZFZhbHVlcyA9IGVudW1WYWx1ZXMubWFwKG1vZGVsID0+IG1vZGVsLm5hbWUpLmpvaW4oJywgJyk7XG5cdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5jbGF1ZGUuYXR0cmlidXRlTm90Rm91bmQnLCBcIlVua25vd24gdmFsdWUgJ3swfScsIHZhbGlkOiB7MX0uXCIsIG1vZGVsTmFtZSwgdmFsaWRWYWx1ZXMpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpbmRNb2RlbEJ5TmFtZShtb2RlbE5hbWU6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtZXRhZGF0YUFuZElkID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbEJ5UXVhbGlmaWVkTmFtZShtb2RlbE5hbWUpO1xuXHRcdGlmIChtZXRhZGF0YUFuZElkICYmIG1ldGFkYXRhQW5kSWQubWV0YWRhdGEuaXNVc2VyU2VsZWN0YWJsZSAhPT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBtZXRhZGF0YUFuZElkLm1ldGFkYXRhO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUFnZW50KGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiBQcm9taXNlPElDaGF0TW9kZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFnZW50QXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnQpO1xuXHRcdGNvbnN0IG1vZGVBdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlKTtcblx0XHRpZiAobW9kZUF0dHJpYnV0ZSkge1xuXHRcdFx0aWYgKGFnZW50QXR0cmlidXRlKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLm1vZGVEZXByZWNhdGVkJywgXCJUaGUgJ21vZGUnIGF0dHJpYnV0ZSBoYXMgYmVlbiBkZXByZWNhdGVkLiBUaGUgJ2FnZW50JyBhdHRyaWJ1dGUgaXMgdXNlZCBpbnN0ZWFkLlwiKSwgbW9kZUF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZywgW01hcmtlclRhZy5EZXByZWNhdGVkXSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IubW9kZURlcHJlY2F0ZWQudXNlQWdlbnQnLCBcIlRoZSAnbW9kZScgYXR0cmlidXRlIGhhcyBiZWVuIGRlcHJlY2F0ZWQuIFBsZWFzZSByZW5hbWUgaXQgdG8gJ2FnZW50Jy5cIiksIG1vZGVBdHRyaWJ1dGUucmFuZ2UsIE1hcmtlclNldmVyaXR5Lldhcm5pbmcsIFtNYXJrZXJUYWcuRGVwcmVjYXRlZF0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZ2VudCkgPz8gbW9kZUF0dHJpYnV0ZTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gZGVmYXVsdCBhZ2VudCBmb3IgcHJvbXB0cyBpcyBBZ2VudFxuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5hdHRyaWJ1dGVNdXN0QmVTdHJpbmcnLCBcIlRoZSAnezB9JyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5cIiwgYXR0cmlidXRlLmtleSksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFnZW50VmFsdWUgPSBhdHRyaWJ1dGUudmFsdWUudmFsdWU7XG5cdFx0aWYgKGFnZW50VmFsdWUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuYXR0cmlidXRlTXVzdEJlTm9uRW1wdHknLCBcIlRoZSAnezB9JyBhdHRyaWJ1dGUgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuXCIsIGF0dHJpYnV0ZS5rZXkpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy52YWxpZGF0ZUFnZW50VmFsdWUoYXR0cmlidXRlLnZhbHVlLCByZXBvcnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUFnZW50VmFsdWUodmFsdWU6IElTY2FsYXJWYWx1ZSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiBQcm9taXNlPElDaGF0TW9kZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFnZW50cyA9IGF3YWl0IHRoaXMuY2hhdE1vZGVTZXJ2aWNlLmdldExvY2FsTW9kZXMoKTtcblx0XHRjb25zdCBhdmFpbGFibGVBZ2VudHMgPSBbXTtcblxuXHRcdC8vIENoZWNrIGlmIGFnZW50IGV4aXN0cyBpbiBidWlsdGluIG9yIGN1c3RvbSBhZ2VudHNcblx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIEl0ZXJhYmxlLmNvbmNhdChhZ2VudHMuYnVpbHRpbiwgYWdlbnRzLmN1c3RvbSkpIHtcblx0XHRcdGlmIChhZ2VudC5uYW1lLmdldCgpID09PSB2YWx1ZS52YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gYWdlbnQ7XG5cdFx0XHR9XG5cdFx0XHRhdmFpbGFibGVBZ2VudHMucHVzaChhZ2VudC5uYW1lLmdldCgpKTsgLy8gY29sbGVjdCBhbGwgYXZhaWxhYmxlIGFnZW50IG5hbWVzXG5cdFx0fVxuXG5cdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gbG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5hZ2VudE5vdEZvdW5kJywgXCJVbmtub3duIGFnZW50ICd7MH0nLiBBdmFpbGFibGUgYWdlbnRzOiB7MX0uXCIsIHZhbHVlLnZhbHVlLCBhdmFpbGFibGVBZ2VudHMuam9pbignLCAnKSk7XG5cdFx0cmVwb3J0KHRvTWFya2VyKGVycm9yTWVzc2FnZSwgdmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZVRvb2xzKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgYWdlbnRLaW5kOiBDaGF0TW9kZUtpbmQsIHRhcmdldDogVGFyZ2V0LCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMudG9vbHMpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhZ2VudEtpbmQgIT09IENoYXRNb2RlS2luZC5BZ2VudCkge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudG9vbHNPbmx5SW5BZ2VudCcsIFwiVGhlICd0b29scycgYXR0cmlidXRlIGlzIG9ubHkgc3VwcG9ydGVkIHdoZW4gdXNpbmcgYWdlbnRzLiBBdHRyaWJ1dGUgd2lsbCBiZSBpZ25vcmVkLlwiKSwgYXR0cmlidXRlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0fVxuXHRcdGxldCB2YWx1ZSA9IGF0dHJpYnV0ZS52YWx1ZTtcblx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdHZhbHVlID0gcGFyc2VDb21tYVNlcGFyYXRlZExpc3QodmFsdWUpO1xuXHRcdH1cblx0XHRpZiAodmFsdWUudHlwZSAhPT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudG9vbHNNdXN0QmVBcnJheU9yTWFwJywgXCJUaGUgJ3Rvb2xzJyBhdHRyaWJ1dGUgbXVzdCBiZSBhbiBhcnJheSBvciBhIGNvbW1hIHNlcGFyYXRlZCBzdHJpbmcuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5HaXRIdWJDb3BpbG90IHx8IHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdFx0Ly8gbm8gdmFsaWRhdGlvbiBmb3IgZ2l0aHViLWNvcGlsb3QgdGFyZ2V0IGFuZCBjbGF1ZGVcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy52YWxpZGF0ZVZTQ29kZVRvb2xzKHZhbHVlLCByZXBvcnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVWU0NvZGVUb29scyh2YWx1ZUl0ZW06IElTZXF1ZW5jZVZhbHVlLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCkge1xuXHRcdGlmICh2YWx1ZUl0ZW0uaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgYXZhaWxhYmxlID0gbmV3IFNldDxzdHJpbmc+KHRoaXMubGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZXMoKSk7XG5cdFx0XHRjb25zdCBkZXByZWNhdGVkTmFtZXMgPSB0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0RGVwcmVjYXRlZEZ1bGxSZWZlcmVuY2VOYW1lcygpO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHZhbHVlSXRlbS5pdGVtcykge1xuXHRcdFx0XHRpZiAoaXRlbS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmVhY2hUb29sTXVzdEJlU3RyaW5nJywgXCJFYWNoIHRvb2wgbmFtZSBpbiB0aGUgJ3Rvb2xzJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5cIiksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXRlbS52YWx1ZSkge1xuXHRcdFx0XHRcdGlmICghYXZhaWxhYmxlLmhhcyhpdGVtLnZhbHVlKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudE5hbWVzID0gZGVwcmVjYXRlZE5hbWVzLmdldChpdGVtLnZhbHVlKTtcblx0XHRcdFx0XHRcdGlmIChjdXJyZW50TmFtZXMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGN1cnJlbnROYW1lcz8uc2l6ZSA9PT0gMSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG5ld05hbWUgPSBBcnJheS5mcm9tKGN1cnJlbnROYW1lcylbMF07XG5cdFx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudG9vbERlcHJlY2F0ZWQnLCBcIlRvb2wgb3IgdG9vbHNldCAnezB9JyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ3sxfScgaW5zdGVhZC5cIiwgaXRlbS52YWx1ZSwgbmV3TmFtZSksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkluZm8sIFtNYXJrZXJUYWcuRGVwcmVjYXRlZF0pKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBuZXdOYW1lcyA9IEFycmF5LmZyb20oY3VycmVudE5hbWVzKS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpLmpvaW4oJywgJyk7XG5cdFx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudG9vbERlcHJlY2F0ZWRNdWx0aXBsZU5hbWVzJywgXCJUb29sIG9yIHRvb2xzZXQgJ3swfScgaGFzIGJlZW4gcmVuYW1lZCwgdXNlIHRoZSBmb2xsb3dpbmcgdG9vbHMgaW5zdGVhZDogezF9XCIsIGl0ZW0udmFsdWUsIG5ld05hbWVzKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSW5mbywgW01hcmtlclRhZy5EZXByZWNhdGVkXSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBtaXNzaW5nR2l0aHViU2VydmVyTWFya2VyID0gdGhpcy5nZXRNaXNzaW5nR2l0aHViTWNwU2VydmVyTWFya2VyKGl0ZW0udmFsdWUsIGl0ZW0ucmFuZ2UpO1xuXHRcdFx0XHRcdFx0XHRpZiAobWlzc2luZ0dpdGh1YlNlcnZlck1hcmtlcikge1xuXHRcdFx0XHRcdFx0XHRcdHJlcG9ydChtaXNzaW5nR2l0aHViU2VydmVyTWFya2VyKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBtaXNzaW5nUGxheXdyaWdodFNlcnZlck1hcmtlciA9IHRoaXMuZ2V0TWlzc2luZ1BsYXl3cmlnaHRNY3BTZXJ2ZXJNYXJrZXIoaXRlbS52YWx1ZSwgaXRlbS5yYW5nZSk7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKG1pc3NpbmdQbGF5d3JpZ2h0U2VydmVyTWFya2VyKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXBvcnQobWlzc2luZ1BsYXl3cmlnaHRTZXJ2ZXJNYXJrZXIpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXBvcnQodGhpcy5nZXRVbmtub3duVG9vbE1hcmtlcihpdGVtLnZhbHVlLCBpdGVtLnJhbmdlLCBmYWxzZSkpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0VW5rbm93blRvb2xNYXJrZXIodG9vbFJlZmVyZW5jZU5hbWU6IHN0cmluZywgcmFuZ2U6IFJhbmdlLCBpc1ZhcmlhYmxlUmVmZXJlbmNlOiBib29sZWFuKTogSU1hcmtlckRhdGEge1xuXHRcdGNvbnN0IHNwbGl0QnlTbGFzaCA9IHRvb2xSZWZlcmVuY2VOYW1lLnNwbGl0KCcvJyk7XG5cdFx0Y29uc3Qgc2xhc2hDb3VudCA9IHNwbGl0QnlTbGFzaC5sZW5ndGggLSAxO1xuXHRcdGNvbnN0IGhhc0V4dGVuc2lvbkxpa2VOYW1lID0gc3BsaXRCeVNsYXNoWzBdLmluY2x1ZGVzKCcuJyk7XG5cdFx0aWYgKHNsYXNoQ291bnQgPj0gMikge1xuXHRcdFx0cmV0dXJuIHRvTWFya2VyKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQncHJvbXB0VmFsaWRhdG9yLnVua25vd25NY3BTZXJ2ZXJSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFwiVW5rbm93biB0b29sICd7MH0nLiBJdCBpcyBsaWtlbHkgdG8gYmUgYSBtaXNzaW5nIE1DUCBzZXJ2ZXIsIHBsZWFzZSBlbnN1cmUgaXQgaXMgaW5zdGFsbGVkIGFuZCBlbmFibGVkLlwiLFxuXHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lXG5cdFx0XHRcdCksXG5cdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0XHRbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdFx0UHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZS5Vbmtub3duTWNwU2VydmVyUmVmZXJlbmNlXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoaGFzRXh0ZW5zaW9uTGlrZU5hbWUpIHtcblx0XHRcdHJldHVybiB0b01hcmtlcihcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3Byb21wdFZhbGlkYXRvci51bmtub3duRXh0ZW5zaW9uUmVmZXJlbmNlJyxcblx0XHRcdFx0XHRcIlVua25vd24gZXh0ZW5zaW9uIHRvb2wgJ3swfScuIEl0IGlzIGxpa2VseSB0byBiZSBhIG1pc3NpbmcgZXh0ZW5zaW9uLCBwbGVhc2UgZW5zdXJlIGl0IGlzIGluc3RhbGxlZCBhbmQgZW5hYmxlZC5cIixcblx0XHRcdFx0XHR0b29sUmVmZXJlbmNlTmFtZVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0TWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFx0W01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHRcdFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuVW5rbm93bkV4dGVuc2lvblJlZmVyZW5jZVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKGlzVmFyaWFibGVSZWZlcmVuY2UpIHtcblx0XHRcdHJldHVybiB0b01hcmtlcihcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3Byb21wdFZhbGlkYXRvci51bmtub3duVmFyaWFibGVSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFwiVW5rbm93biB0b29sIG9yIHRvb2xzZXQgJ3swfScuXCIsXG5cdFx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWVcblx0XHRcdFx0KSxcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRcdFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldLFxuXHRcdFx0XHRQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlLlVua25vd25FeHRlbnNpb25Pck1jcFNlcnZlclJlZmVyZW5jZVxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRvTWFya2VyKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQncHJvbXB0VmFsaWRhdG9yLnVua25vd25Ub29sUmVmZXJlbmNlJyxcblx0XHRcdFx0XHRcIlVua25vd24gdG9vbCAnezB9JyB3aWxsIGJlIGlnbm9yZWQuXCIsXG5cdFx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWVcblx0XHRcdFx0KSxcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRcdFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldLFxuXHRcdFx0XHRQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlLlVua25vd25FeHRlbnNpb25Pck1jcFNlcnZlclJlZmVyZW5jZVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE1pc3NpbmdHaXRodWJNY3BTZXJ2ZXJNYXJrZXIodG9vbFJlZmVyZW5jZU5hbWU6IHN0cmluZywgcmFuZ2U6IFJhbmdlKTogSU1hcmtlckRhdGEgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0b29sUmVmZXJlbmNlTmFtZSAhPT0gJ2dpdGh1Yi8qJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRvTWFya2VyKFxuXHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdCdwcm9tcHRWYWxpZGF0b3IubWlzc2luZ0dpdGh1Yk1jcFNlcnZlcicsXG5cdFx0XHRcdFwiVG9vbCBhbGlhcyAnezB9JyByZXF1aXJlcyB0aGUgR2l0SHViIE1DUCBzZXJ2ZXIuIEVuYWJsZSB0aGUgYnVpbHQtaW4gc2VydmVyIHdpdGggc2V0dGluZyAnZ2l0aHViLmNvcGlsb3QuY2hhdC5naXRodWJNY3BTZXJ2ZXIuZW5hYmxlZCcgb3IgaW5zdGFsbCBleHRlbnNpb24gJ2lvLmdpdGh1Yi5naXRodWIvZ2l0aHViLW1jcC1zZXJ2ZXInIGZyb20gRXh0ZW5zaW9ucyAoYEBtY3AgZ2l0aHViYCkuXCIsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lXG5cdFx0XHQpLFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0W01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHRQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlLk1pc3NpbmdHaXRodWJNY3BTZXJ2ZXJcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNaXNzaW5nUGxheXdyaWdodE1jcFNlcnZlck1hcmtlcih0b29sUmVmZXJlbmNlTmFtZTogc3RyaW5nLCByYW5nZTogUmFuZ2UpOiBJTWFya2VyRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRvb2xSZWZlcmVuY2VOYW1lICE9PSAncGxheXdyaWdodC8qJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRvTWFya2VyKFxuXHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdCdwcm9tcHRWYWxpZGF0b3IubWlzc2luZ1BsYXl3cmlnaHRNY3BTZXJ2ZXInLFxuXHRcdFx0XHRcIlRvb2wgYWxpYXMgJ3swfScgcmVxdWlyZXMgdGhlIFBsYXl3cmlnaHQgTUNQIHNlcnZlci4gSW5zdGFsbCBpdCBmcm9tIEV4dGVuc2lvbnMgKGBAbWNwIHBsYXl3cmlnaHRgKS5cIixcblx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWVcblx0XHRcdCksXG5cdFx0XHRyYW5nZSxcblx0XHRcdE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuTWlzc2luZ1BsYXl3cmlnaHRNY3BTZXJ2ZXJcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUFwcGx5VG8oYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXBwbHlUbyk7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZS52YWx1ZS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuYXBwbHlUb011c3RCZVN0cmluZycsIFwiVGhlICdhcHBseVRvJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGF0dGVybiA9IGF0dHJpYnV0ZS52YWx1ZS52YWx1ZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSBzcGxpdEdsb2JBd2FyZShwYXR0ZXJuLCAnLCcpO1xuXHRcdFx0aWYgKHBhdHRlcm5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5hcHBseVRvTXVzdEJlVmFsaWRHbG9iJywgXCJUaGUgJ2FwcGx5VG8nIGF0dHJpYnV0ZSBtdXN0IGJlIGEgdmFsaWQgZ2xvYiBwYXR0ZXJuLlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHBhdHRlcm4gb2YgcGF0dGVybnMpIHtcblx0XHRcdFx0Y29uc3QgZ2xvYlBhdHRlcm4gPSBwYXJzZShwYXR0ZXJuKTtcblx0XHRcdFx0aWYgKGlzRW1wdHlQYXR0ZXJuKGdsb2JQYXR0ZXJuKSkge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmFwcGx5VG9NdXN0QmVWYWxpZEdsb2InLCBcIlRoZSAnYXBwbHlUbycgYXR0cmlidXRlIG11c3QgYmUgYSB2YWxpZCBnbG9iIHBhdHRlcm4uXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoX2Vycm9yKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5hcHBseVRvTXVzdEJlVmFsaWRHbG9iJywgXCJUaGUgJ2FwcGx5VG8nIGF0dHJpYnV0ZSBtdXN0IGJlIGEgdmFsaWQgZ2xvYiBwYXR0ZXJuLlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVQYXRocyhhdHRyaWJ1dGVzOiBJSGVhZGVyQXR0cmlidXRlW10sIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5wYXRocyk7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZS52YWx1ZS50eXBlICE9PSAnc2VxdWVuY2UnKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5wYXRoc011c3RCZUFycmF5JywgXCJUaGUgJ3BhdGhzJyBhdHRyaWJ1dGUgbXVzdCBiZSBhbiBhcnJheSBvZiBnbG9iIHBhdHRlcm5zLlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYXR0cmlidXRlLnZhbHVlLml0ZW1zKSB7XG5cdFx0XHRpZiAoaXRlbS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5lYWNoUGF0aE11c3RCZVN0cmluZycsIFwiRWFjaCBlbnRyeSBpbiB0aGUgJ3BhdGhzJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5cIiksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGF0dGVybiA9IGl0ZW0udmFsdWUudHJpbSgpO1xuXHRcdFx0aWYgKHBhdHRlcm4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnBhdGhNdXN0QmVOb25FbXB0eScsIFwiUGF0aCBlbnRyaWVzIG11c3QgYmUgbm9uLWVtcHR5IGdsb2IgcGF0dGVybnMuXCIpLCBpdGVtLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGdsb2JQYXR0ZXJuID0gcGFyc2UocGF0dGVybik7XG5cdFx0XHRcdGlmIChpc0VtcHR5UGF0dGVybihnbG9iUGF0dGVybikpIHtcblx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5wYXRoTXVzdEJlVmFsaWRHbG9iJywgXCInezB9JyBpcyBub3QgYSB2YWxpZCBnbG9iIHBhdHRlcm4uXCIsIHBhdHRlcm4pLCBpdGVtLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChfZXJyb3IpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IucGF0aE11c3RCZVZhbGlkR2xvYicsIFwiJ3swfScgaXMgbm90IGEgdmFsaWQgZ2xvYiBwYXR0ZXJuLlwiLCBwYXR0ZXJuKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlRXhjbHVkZUFnZW50KGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmV4Y2x1ZGVBZ2VudCk7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZS52YWx1ZS50eXBlICE9PSAnc2VxdWVuY2UnICYmIGF0dHJpYnV0ZS52YWx1ZS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuZXhjbHVkZUFnZW50TXVzdEJlQXJyYXknLCBcIlRoZSAnZXhjbHVkZUFnZW50JyBhdHRyaWJ1dGUgbXVzdCBiZSBhbiBzdHJpbmcgb3IgYXJyYXkuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUhvb2tzKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgdGFyZ2V0OiBUYXJnZXQsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5ob29rcyk7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZS52YWx1ZS50eXBlICE9PSAnbWFwJykge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaG9va3NNdXN0QmVNYXAnLCBcIlRoZSAnaG9va3MnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgbWFwIG9mIGhvb2sgZXZlbnQgdHlwZXMgdG8gY29tbWFuZCBhcnJheXMuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZhbGlkSG9va05hbWVzID0gbmV3IFNldChPYmplY3Qua2V5cyhIT09LU19CWV9UQVJHRVRbdGFyZ2V0XSA/PyBIT09LU19CWV9UQVJHRVRbVGFyZ2V0LlVuZGVmaW5lZF0pKTtcblx0XHRmb3IgKGNvbnN0IHByb3Agb2YgYXR0cmlidXRlLnZhbHVlLnByb3BlcnRpZXMpIHtcblx0XHRcdGlmICghdmFsaWRIb29rTmFtZXMuaGFzKHByb3Aua2V5LnZhbHVlKSkge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci51bmtub3duSG9va1R5cGUnLCBcIlVua25vd24gaG9vayBldmVudCB0eXBlICd7MH0nLiBTdXBwb3J0ZWQ6IHsxfS5cIiwgcHJvcC5rZXkudmFsdWUsIEFycmF5LmZyb20odmFsaWRIb29rTmFtZXMpLmpvaW4oJywgJykpLCBwcm9wLmtleS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5ob29rVmFsdWVNdXN0QmVBcnJheScsIFwiSG9vayBldmVudCAnezB9JyBtdXN0IGhhdmUgYW4gYXJyYXkgb2YgY29tbWFuZCBvYmplY3RzIGFzIGl0cyB2YWx1ZS5cIiwgcHJvcC5rZXkudmFsdWUpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBwcm9wLnZhbHVlLml0ZW1zKSB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVIb29rQ29tbWFuZChpdGVtLCB0YXJnZXQsIHJlcG9ydCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUhvb2tDb21tYW5kKGl0ZW06IElWYWx1ZSwgdGFyZ2V0OiBUYXJnZXQsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKGl0ZW0udHlwZSAhPT0gJ21hcCcpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tDb21tYW5kTXVzdEJlT2JqZWN0JywgXCJFYWNoIGhvb2sgY29tbWFuZCBtdXN0IGJlIGFuIG9iamVjdC5cIiksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZWN0IG5lc3RlZCBtYXRjaGVyIGZvcm1hdDogeyBtYXRjaGVyPzogXCIuLi5cIiwgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJy4uLicgfV0gfVxuXHRcdGNvbnN0IGhvb2tzUHJvcGVydHkgPSBpdGVtLnByb3BlcnRpZXMuZmluZChwID0+IHAua2V5LnZhbHVlID09PSAnaG9va3MnKTtcblx0XHRpZiAoaG9va3NQcm9wZXJ0eSkge1xuXHRcdFx0Ly8gVmFsaWRhdGUgdGhhdCBvbmx5IGtub3duIG1hdGNoZXIgcHJvcGVydGllcyBhcmUgcHJlc2VudFxuXHRcdFx0Zm9yIChjb25zdCBwcm9wIG9mIGl0ZW0ucHJvcGVydGllcykge1xuXHRcdFx0XHRpZiAocHJvcC5rZXkudmFsdWUgIT09ICdob29rcycgJiYgcHJvcC5rZXkudmFsdWUgIT09ICdtYXRjaGVyJykge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVua25vd25NYXRjaGVyUHJvcGVydHknLCBcIlVua25vd24gcHJvcGVydHkgJ3swfScgaW4gaG9vayBtYXRjaGVyLlwiLCBwcm9wLmtleS52YWx1ZSksIHByb3Aua2V5LnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChob29rc1Byb3BlcnR5LnZhbHVlLnR5cGUgIT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IubmVzdGVkSG9va3NNdXN0QmVBcnJheScsIFwiVGhlICdob29rcycgcHJvcGVydHkgaW4gYSBtYXRjaGVyIG11c3QgYmUgYW4gYXJyYXkgb2YgY29tbWFuZCBvYmplY3RzLlwiKSwgaG9va3NQcm9wZXJ0eS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBuZXN0ZWRJdGVtIG9mIGhvb2tzUHJvcGVydHkudmFsdWUuaXRlbXMpIHtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUhvb2tDb21tYW5kKG5lc3RlZEl0ZW0sIHRhcmdldCwgcmVwb3J0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0NvcGlsb3RDbGkgPSB0YXJnZXQgPT09IFRhcmdldC5HaXRIdWJDb3BpbG90O1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIHZhbGlkIGFuZCBjb21tYW5kLXByb3ZpZGluZyBwcm9wZXJ0aWVzIGJhc2VkIG9uIHRhcmdldFxuXHRcdGNvbnN0IHZhbGlkQ29tbWFuZEZpZWxkcyA9IGlzQ29waWxvdENsaVxuXHRcdFx0PyBuZXcgU2V0KFsnYmFzaCcsICdwb3dlcnNoZWxsJ10pXG5cdFx0XHQ6IG5ldyBTZXQoWydjb21tYW5kJywgJ3dpbmRvd3MnLCAnbGludXgnLCAnb3N4JywgJ2Jhc2gnLCAncG93ZXJzaGVsbCddKTtcblxuXHRcdGNvbnN0IHZhbGlkUHJvcGVydGllcyA9IGlzQ29waWxvdENsaVxuXHRcdFx0PyBuZXcgU2V0KFsndHlwZScsICdiYXNoJywgJ3Bvd2Vyc2hlbGwnLCAnY3dkJywgJ2VudicsICd0aW1lb3V0U2VjJ10pXG5cdFx0XHQ6IG5ldyBTZXQoWyd0eXBlJywgJ2NvbW1hbmQnLCAnd2luZG93cycsICdsaW51eCcsICdvc3gnLCAnYmFzaCcsICdwb3dlcnNoZWxsJywgJ2N3ZCcsICdlbnYnLCAndGltZW91dCddKTtcblxuXHRcdGxldCBoYXNUeXBlID0gZmFsc2U7XG5cdFx0bGV0IGhhc0NvbW1hbmRGaWVsZCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBwcm9wIG9mIGl0ZW0ucHJvcGVydGllcykge1xuXHRcdFx0Y29uc3Qga2V5ID0gcHJvcC5rZXkudmFsdWU7XG5cblx0XHRcdGlmICghdmFsaWRQcm9wZXJ0aWVzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVua25vd25Ib29rUHJvcGVydHknLCBcIlVua25vd24gcHJvcGVydHkgJ3swfScgaW4gaG9vayBjb21tYW5kLlwiLCBrZXkpLCBwcm9wLmtleS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoa2V5ID09PSAndHlwZScpIHtcblx0XHRcdFx0aGFzVHlwZSA9IHRydWU7XG5cdFx0XHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInIHx8IHByb3AudmFsdWUudmFsdWUgIT09ICdjb21tYW5kJykge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tUeXBlTXVzdEJlQ29tbWFuZCcsIFwiVGhlICd0eXBlJyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlICdjb21tYW5kJy5cIiksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodmFsaWRDb21tYW5kRmllbGRzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdGhhc0NvbW1hbmRGaWVsZCA9IHRydWU7XG5cdFx0XHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInIHx8IHByb3AudmFsdWUudmFsdWUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tDb21tYW5kRmllbGRNdXN0QmVOb25FbXB0eVN0cmluZycsIFwiVGhlICd7MH0nIHByb3BlcnR5IGluIGEgaG9vayBjb21tYW5kIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nLlwiLCBrZXkpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGtleSA9PT0gJ2N3ZCcpIHtcblx0XHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5ob29rQ3dkTXVzdEJlU3RyaW5nJywgXCJUaGUgJ2N3ZCcgcHJvcGVydHkgaW4gYSBob29rIGNvbW1hbmQgbXVzdCBiZSBhIHN0cmluZy5cIiksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoa2V5ID09PSAnZW52Jykge1xuXHRcdFx0XHRpZiAocHJvcC52YWx1ZS50eXBlICE9PSAnbWFwJykge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tFbnZNdXN0QmVNYXAnLCBcIlRoZSAnZW52JyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlIGEgbWFwIG9mIHN0cmluZyB2YWx1ZXMuXCIpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZW52UHJvcCBvZiBwcm9wLnZhbHVlLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRcdGlmIChlbnZQcm9wLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tFbnZWYWx1ZU11c3RCZVN0cmluZycsIFwiRW52aXJvbm1lbnQgdmFyaWFibGUgJ3swfScgbXVzdCBoYXZlIGEgc3RyaW5nIHZhbHVlLlwiLCBlbnZQcm9wLmtleS52YWx1ZSksIGVudlByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGtleSA9PT0gJ3RpbWVvdXQnIHx8IGtleSA9PT0gJ3RpbWVvdXRTZWMnKSB7XG5cdFx0XHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInIHx8IGlzTmFOKE51bWJlcihwcm9wLnZhbHVlLnZhbHVlKSkpIHtcblx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5ob29rVGltZW91dE11c3RCZU51bWJlcicsIFwiVGhlICd7MH0nIHByb3BlcnR5IGluIGEgaG9vayBjb21tYW5kIG11c3QgYmUgYSBudW1iZXIuXCIsIGtleSksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWhhc1R5cGUpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tNaXNzaW5nVHlwZScsIFwiSG9vayBjb21tYW5kIGlzIG1pc3NpbmcgcmVxdWlyZWQgcHJvcGVydHkgJ3R5cGUnLlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHR9XG5cdFx0aWYgKCFoYXNDb21tYW5kRmllbGQpIHtcblx0XHRcdGlmIChpc0NvcGlsb3RDbGkpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaG9va01pc3NpbmdDb3BpbG90Q29tbWFuZCcsIFwiSG9vayBjb21tYW5kIG11c3Qgc3BlY2lmeSBhdCBsZWFzdCBvbmUgb2YgJ2Jhc2gnIG9yICdwb3dlcnNoZWxsJy5cIiksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5ob29rTWlzc2luZ0NvbW1hbmQnLCBcIkhvb2sgY29tbWFuZCBtdXN0IHNwZWNpZnkgYXQgbGVhc3Qgb25lIG9mICdjb21tYW5kJywgJ3dpbmRvd3MnLCAnbGludXgnLCBvciAnb3N4Jy5cIiksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUhhbmRvZmZzKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmhhbmRPZmZzKTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhhbmRvZmZzTXVzdEJlQXJyYXknLCBcIlRoZSAnaGFuZG9mZnMnIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIGFycmF5LlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZWVuTGFiZWxzID0gbmV3IE1hcDxzdHJpbmcsIFJhbmdlPigpO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBhdHRyaWJ1dGUudmFsdWUuaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdtYXAnKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmVhY2hIYW5kb2ZmTXVzdEJlT2JqZWN0JywgXCJFYWNoIGhhbmRvZmYgaW4gdGhlICdoYW5kb2ZmcycgYXR0cmlidXRlIG11c3QgYmUgYW4gb2JqZWN0IHdpdGggJ2xhYmVsJywgJ2FnZW50JywgJ3Byb21wdCcgYW5kIG9wdGlvbmFsICdzZW5kJy5cIiksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVxdWlyZWQgPSBuZXcgU2V0KFsnbGFiZWwnLCAnYWdlbnQnLCAncHJvbXB0J10pO1xuXHRcdFx0Zm9yIChjb25zdCBwcm9wIG9mIGl0ZW0ucHJvcGVydGllcykge1xuXHRcdFx0XHRzd2l0Y2ggKHByb3Aua2V5LnZhbHVlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnbGFiZWwnOlxuXHRcdFx0XHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicgfHwgcHJvcC52YWx1ZS52YWx1ZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhhbmRvZmZMYWJlbE11c3RCZU5vbkVtcHR5U3RyaW5nJywgXCJUaGUgJ2xhYmVsJyBwcm9wZXJ0eSBpbiBhIGhhbmRvZmYgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuXCIpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICghL1thLXpBLVowLTldLy50ZXN0KHByb3AudmFsdWUudmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhhbmRvZmZMYWJlbE11c3RDb250YWluQWxwaGFudW1lcmljJywgXCJUaGUgJ2xhYmVsJyBwcm9wZXJ0eSBpbiBhIGhhbmRvZmYgbXVzdCBjb250YWluIGF0IGxlYXN0IG9uZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVyLlwiKSwgcHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2FnZW50Jzpcblx0XHRcdFx0XHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInIHx8IHByb3AudmFsdWUudmFsdWUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5oYW5kb2ZmQWdlbnRNdXN0QmVOb25FbXB0eVN0cmluZycsIFwiVGhlICdhZ2VudCcgcHJvcGVydHkgaW4gYSBoYW5kb2ZmIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nLlwiKSwgcHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudmFsaWRhdGVBZ2VudFZhbHVlKHByb3AudmFsdWUsIHJlcG9ydCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdwcm9tcHQnOlxuXHRcdFx0XHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaGFuZG9mZlByb21wdE11c3RCZVN0cmluZycsIFwiVGhlICdwcm9tcHQnIHByb3BlcnR5IGluIGEgaGFuZG9mZiBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgcHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3NlbmQnOlxuXHRcdFx0XHRcdFx0aWYgKCFpc1RydWVPckZhbHNlKHByb3AudmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhhbmRvZmZTZW5kTXVzdEJlQm9vbGVhbicsIFwiVGhlICdzZW5kJyBwcm9wZXJ0eSBpbiBhIGhhbmRvZmYgbXVzdCBiZSBhIGJvb2xlYW4uXCIpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnc2hvd0NvbnRpbnVlT24nOlxuXHRcdFx0XHRcdFx0aWYgKCFpc1RydWVPckZhbHNlKHByb3AudmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhhbmRvZmZTaG93Q29udGludWVPbk11c3RCZUJvb2xlYW4nLCBcIlRoZSAnc2hvd0NvbnRpbnVlT24nIHByb3BlcnR5IGluIGEgaGFuZG9mZiBtdXN0IGJlIGEgYm9vbGVhbi5cIiksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdtb2RlbCc6XG5cdFx0XHRcdFx0XHRpZiAocHJvcC52YWx1ZS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5oYW5kb2ZmTW9kZWxNdXN0QmVTdHJpbmcnLCBcIlRoZSAnbW9kZWwnIHByb3BlcnR5IGluIGEgaGFuZG9mZiBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgcHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci51bmtub3duSGFuZG9mZlByb3BlcnR5JywgXCJVbmtub3duIHByb3BlcnR5ICd7MH0nIGluIGhhbmRvZmYgb2JqZWN0LiBTdXBwb3J0ZWQgcHJvcGVydGllcyBhcmUgJ2xhYmVsJywgJ2FnZW50JywgJ3Byb21wdCcgYW5kIG9wdGlvbmFsICdzZW5kJywgJ3Nob3dDb250aW51ZU9uJywgJ21vZGVsJy5cIiwgcHJvcC5rZXkudmFsdWUpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVxdWlyZWQuZGVsZXRlKHByb3Aua2V5LnZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXF1aXJlZC5zaXplID4gMCkge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5taXNzaW5nSGFuZG9mZlByb3BlcnRpZXMnLCBcIk1pc3NpbmcgcmVxdWlyZWQgcHJvcGVydGllcyB7MH0gaW4gaGFuZG9mZiBvYmplY3QuXCIsIEFycmF5LmZyb20ocmVxdWlyZWQpLm1hcChzID0+IGAnJHtzfSdgKS5qb2luKCcsICcpKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRGV0ZWN0IGR1cGxpY2F0ZSBsYWJlbHMgKGNhc2UtaW5zZW5zaXRpdmUsIGNvbnNpc3RlbnQgd2l0aCBFeGVjdXRlSGFuZG9mZkFjdGlvbiBsb29rdXApXG5cdFx0XHRjb25zdCBsYWJlbFByb3AgPSBpdGVtLnByb3BlcnRpZXMuZmluZChwID0+IHAua2V5LnZhbHVlID09PSAnbGFiZWwnKTtcblx0XHRcdGlmIChsYWJlbFByb3A/LnZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRMYWJlbCA9IGxhYmVsUHJvcC52YWx1ZS52YWx1ZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRpZiAobm9ybWFsaXplZExhYmVsICYmIHNlZW5MYWJlbHMuaGFzKG5vcm1hbGl6ZWRMYWJlbCkpIHtcblx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5kdXBsaWNhdGVIYW5kb2ZmTGFiZWwnLCBcIkR1cGxpY2F0ZSBoYW5kb2ZmIGxhYmVsICd7MH0nLiBFYWNoIGhhbmRvZmYgbXVzdCBoYXZlIGEgdW5pcXVlIGxhYmVsLlwiLCBsYWJlbFByb3AudmFsdWUudmFsdWUpLCBsYWJlbFByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAobm9ybWFsaXplZExhYmVsKSB7XG5cdFx0XHRcdFx0c2VlbkxhYmVscy5zZXQobm9ybWFsaXplZExhYmVsLCBsYWJlbFByb3AudmFsdWUucmFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUluZmVyKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmluZmVyKTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5pbmZlckRlcHJlY2F0ZWQnLCBcIlRoZSAnaW5mZXInIGF0dHJpYnV0ZSBpcyBkZXByZWNhdGVkIGluIGZhdm91ciBvZiAndXNlci1pbnZvY2FibGUnIGFuZCAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uJy5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVUYXJnZXQoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMudGFyZ2V0KTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci50YXJnZXRNdXN0QmVTdHJpbmcnLCBcIlRoZSAndGFyZ2V0JyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0VmFsdWUgPSBhdHRyaWJ1dGUudmFsdWUudmFsdWUudHJpbSgpO1xuXHRcdGlmICh0YXJnZXRWYWx1ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnRhcmdldE11c3RCZU5vbkVtcHR5JywgXCJUaGUgJ3RhcmdldCcgYXR0cmlidXRlIG11c3QgYmUgYSBub24tZW1wdHkgc3RyaW5nLlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2YWxpZFRhcmdldHMgPSBbJ2dpdGh1Yi1jb3BpbG90JywgJ3ZzY29kZSddO1xuXHRcdGlmICghdmFsaWRUYXJnZXRzLmluY2x1ZGVzKHRhcmdldFZhbHVlKSkge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudGFyZ2V0SW52YWxpZFZhbHVlJywgXCJUaGUgJ3RhcmdldCcgYXR0cmlidXRlIG11c3QgYmUgb25lIG9mOiB7MH0uXCIsIHZhbGlkVGFyZ2V0cy5qb2luKCcsICcpKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVVc2VySW52b2NhYmxlKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnVzZXJJbnZvY2FibGUpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghaXNUcnVlT3JGYWxzZShhdHRyaWJ1dGUudmFsdWUpKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci51c2VySW52b2NhYmxlTXVzdEJlQm9vbGVhbicsIFwiVGhlICd1c2VyLWludm9jYWJsZScgYXR0cmlidXRlIG11c3QgYmUgJ3RydWUnIG9yICdmYWxzZScuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZURpc2FibGVNb2RlbEludm9jYXRpb24oYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGlzYWJsZU1vZGVsSW52b2NhdGlvbik7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFpc1RydWVPckZhbHNlKGF0dHJpYnV0ZS52YWx1ZSkpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmRpc2FibGVNb2RlbEludm9jYXRpb25NdXN0QmVCb29sZWFuJywgXCJUaGUgJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbicgYXR0cmlidXRlIG11c3QgYmUgJ3RydWUnIG9yICdmYWxzZScuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUFnZW50c0F0dHJpYnV0ZShhdHRyaWJ1dGVzOiBJSGVhZGVyQXR0cmlidXRlW10sIGhlYWRlcjogUHJvbXB0SGVhZGVyLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnRzKTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmFnZW50c011c3RCZUFycmF5JywgXCJUaGUgJ2FnZW50cycgYXR0cmlidXRlIG11c3QgYmUgYW4gYXJyYXkuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ29sbGVjdCBhdmFpbGFibGUgYWdlbnQgbmFtZXNcblx0XHRjb25zdCBhZ2VudHMgPSAoYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmZpbHRlcihhID0+IGEuZW5hYmxlZCk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlQWdlbnROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPihhZ2VudHMubWFwKGFnZW50ID0+IGFnZW50Lm5hbWUpKTtcblx0XHRhdmFpbGFibGVBZ2VudE5hbWVzLmFkZChDaGF0TW9kZS5BZ2VudC5uYW1lLmdldCgpKTsgLy8gaW5jbHVkZSBkZWZhdWx0IGFnZW50XG5cblx0XHQvLyBDaGVjayBlYWNoIGl0ZW0gaXMgYSBzdHJpbmcgYW5kIGFnZW50IGV4aXN0c1xuXHRcdGNvbnN0IGFnZW50TmFtZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGF0dHJpYnV0ZS52YWx1ZS5pdGVtcykge1xuXHRcdFx0aWYgKGl0ZW0udHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuZWFjaEFnZW50TXVzdEJlU3RyaW5nJywgXCJFYWNoIGFnZW50IG5hbWUgaW4gdGhlICdhZ2VudHMnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdH0gZWxzZSBpZiAoaXRlbS52YWx1ZSkge1xuXHRcdFx0XHRhZ2VudE5hbWVzLnB1c2goaXRlbS52YWx1ZSk7XG5cdFx0XHRcdGlmIChpdGVtLnZhbHVlICE9PSAnKicgJiYgIWF2YWlsYWJsZUFnZW50TmFtZXMuaGFzKGl0ZW0udmFsdWUpKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuYWdlbnRJbkFnZW50c05vdEZvdW5kJywgXCJVbmtub3duIGFnZW50ICd7MH0nIHdpbGwgYmUgaWdub3JlZC4gQXZhaWxhYmxlIGFnZW50czogezF9LlwiLCBpdGVtLnZhbHVlLCBBcnJheS5mcm9tKGF2YWlsYWJsZUFnZW50TmFtZXMpLmpvaW4oJywgJykpLCBpdGVtLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5IaW50LCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgbm90IHdpbGRjYXJkIGFuZCBub3QgZW1wdHksIGNoZWNrIHRoYXQgJ2FnZW50JyB0b29sIGlzIGF2YWlsYWJsZVxuXHRcdGlmIChhZ2VudE5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHRvb2xzID0gaGVhZGVyLnRvb2xzO1xuXHRcdFx0aWYgKHRvb2xzICYmICF0b29scy5pbmNsdWRlcyhTcGVjZWRUb29sQWxpYXNlcy5hZ2VudCkpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuYWdlbnRzUmVxdWlyZXNBZ2VudFRvb2wnLCBcIldoZW4gJ2FnZW50cycgYW5kICd0b29scycgYXJlIHNwZWNpZmllZCwgdGhlICdhZ2VudCcgdG9vbCBtdXN0IGJlIGluY2x1ZGVkIGluIHRoZSAndG9vbHMnIGF0dHJpYnV0ZS5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVHaXRodWJQZXJtaXNzaW9ucyhhdHRyaWJ1dGVzOiBJSGVhZGVyQXR0cmlidXRlW10sIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IEdpdGh1YlByb21wdEhlYWRlckF0dHJpYnV0ZXMuZ2l0aHViKTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdtYXAnKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5naXRodWJNdXN0QmVNYXAnLCBcIlRoZSAnZ2l0aHViJyBhdHRyaWJ1dGUgbXVzdCBiZSBhbiBvYmplY3QuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcHJvcCBvZiBhdHRyaWJ1dGUudmFsdWUucHJvcGVydGllcykge1xuXHRcdFx0aWYgKHByb3Aua2V5LnZhbHVlICE9PSAncGVybWlzc2lvbnMnKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVua25vd25HaXRodWJQcm9wZXJ0eScsIFwiVW5rbm93biBwcm9wZXJ0eSAnezB9JyBpbiAnZ2l0aHViJyBvYmplY3QuIFN1cHBvcnRlZDogJ3Blcm1pc3Npb25zJy5cIiwgcHJvcC5rZXkudmFsdWUpLCBwcm9wLmtleS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgIT09ICdtYXAnKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnBlcm1pc3Npb25zTXVzdEJlTWFwJywgXCJUaGUgJ3Blcm1pc3Npb25zJyBwcm9wZXJ0eSBtdXN0IGJlIGFuIG9iamVjdC5cIiksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBwZXJtUHJvcCBvZiBwcm9wLnZhbHVlLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0Y29uc3Qgc2NvcGUgPSBwZXJtUHJvcC5rZXkudmFsdWU7XG5cdFx0XHRcdGNvbnN0IHNjb3BlSW5mbyA9IGdpdGh1YlBlcm1pc3Npb25TY29wZXNbc2NvcGVdO1xuXHRcdFx0XHRpZiAoIXNjb3BlSW5mbykge1xuXHRcdFx0XHRcdGNvbnN0IHZhbGlkU2NvcGVzID0gT2JqZWN0LmtleXMoZ2l0aHViUGVybWlzc2lvblNjb3Blcykuc29ydCgpLmpvaW4oJywgJyk7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudW5rbm93blBlcm1pc3Npb25TY29wZScsIFwiVW5rbm93biBwZXJtaXNzaW9uIHNjb3BlICd7MH0nLiBWYWxpZCBzY29wZXM6IHsxfS5cIiwgc2NvcGUsIHZhbGlkU2NvcGVzKSwgcGVybVByb3Aua2V5LnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBlcm1Qcm9wLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IucGVybWlzc2lvblZhbHVlTXVzdEJlU3RyaW5nJywgXCJUaGUgcGVybWlzc2lvbiB2YWx1ZSBmb3IgJ3swfScgbXVzdCBiZSBhIHN0cmluZy5cIiwgc2NvcGUpLCBwZXJtUHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHBlcm1Qcm9wLnZhbHVlLnZhbHVlO1xuXHRcdFx0XHRpZiAoIXNjb3BlSW5mby5hbGxvd2VkVmFsdWVzLmluY2x1ZGVzKHZhbHVlKSkge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmludmFsaWRQZXJtaXNzaW9uVmFsdWUnLCBcIkludmFsaWQgcGVybWlzc2lvbiB2YWx1ZSAnezB9JyBmb3Igc2NvcGUgJ3sxfScuIEFsbG93ZWQgdmFsdWVzOiB7Mn0uXCIsIHZhbHVlLCBzY29wZSwgc2NvcGVJbmZvLmFsbG93ZWRWYWx1ZXMuam9pbignLCAnKSksIHBlcm1Qcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBnaXRodWJQZXJtaXNzaW9uU2NvcGVzOiBSZWNvcmQ8c3RyaW5nLCB7IGFsbG93ZWRWYWx1ZXM6IHN0cmluZ1tdOyBkZXNjcmlwdGlvbjogc3RyaW5nIH0+ID0ge1xuXHQnYWN0aW9ucyc6IHsgYWxsb3dlZFZhbHVlczogWydyZWFkJywgJ3dyaXRlJywgJ25vbmUnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJQZXJtaXNzaW9uLmFjdGlvbnMnLCBcIkFjY2VzcyB0byBHaXRIdWIgQWN0aW9ucyB3b3JrZmxvd3MgYW5kIHJ1bnNcIikgfSxcblx0J2NoZWNrcyc6IHsgYWxsb3dlZFZhbHVlczogWydyZWFkJywgJ25vbmUnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJQZXJtaXNzaW9uLmNoZWNrcycsIFwiQWNjZXNzIHRvIGNoZWNrIHJ1bnMgYW5kIHN0YXR1c2VzXCIpIH0sXG5cdCdjb250ZW50cyc6IHsgYWxsb3dlZFZhbHVlczogWydyZWFkJywgJ3dyaXRlJywgJ25vbmUnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJQZXJtaXNzaW9uLmNvbnRlbnRzJywgXCJBY2Nlc3MgdG8gcmVwb3NpdG9yeSBjb250ZW50cyAoZmlsZXMsIGNvbW1pdHMsIGJyYW5jaGVzKVwiKSB9LFxuXHQnZGlzY3Vzc2lvbnMnOiB7IGFsbG93ZWRWYWx1ZXM6IFsncmVhZCcsICd3cml0ZScsICdub25lJ10sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViUGVybWlzc2lvbi5kaXNjdXNzaW9ucycsIFwiQWNjZXNzIHRvIGRpc2N1c3Npb25zXCIpIH0sXG5cdCdpc3N1ZXMnOiB7IGFsbG93ZWRWYWx1ZXM6IFsncmVhZCcsICd3cml0ZScsICdub25lJ10sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViUGVybWlzc2lvbi5pc3N1ZXMnLCBcIkFjY2VzcyB0byBpc3N1ZXMgKHJlYWQsIGNyZWF0ZSwgdXBkYXRlLCBjb21tZW50KVwiKSB9LFxuXHQnbWV0YWRhdGEnOiB7IGFsbG93ZWRWYWx1ZXM6IFsncmVhZCddLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YlBlcm1pc3Npb24ubWV0YWRhdGEnLCBcIlJlcG9zaXRvcnkgbWV0YWRhdGEgKGFsd2F5cyByZWFkLW9ubHkpXCIpIH0sXG5cdCdwdWxsLXJlcXVlc3RzJzogeyBhbGxvd2VkVmFsdWVzOiBbJ3JlYWQnLCAnd3JpdGUnLCAnbm9uZSddLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YlBlcm1pc3Npb24ucHVsbFJlcXVlc3RzJywgXCJBY2Nlc3MgdG8gcHVsbCByZXF1ZXN0cyAocmVhZCwgY3JlYXRlLCB1cGRhdGUsIHJldmlldylcIikgfSxcblx0J3NlY3VyaXR5LWV2ZW50cyc6IHsgYWxsb3dlZFZhbHVlczogWydyZWFkJywgJ25vbmUnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJQZXJtaXNzaW9uLnNlY3VyaXR5RXZlbnRzJywgXCJBY2Nlc3MgdG8gc2VjdXJpdHktcmVsYXRlZCBldmVudHNcIikgfSxcblx0J3dvcmtmbG93cyc6IHsgYWxsb3dlZFZhbHVlczogWyd3cml0ZScsICdub25lJ10sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViUGVybWlzc2lvbi53b3JrZmxvd3MnLCBcIkFjY2VzcyB0byBtb2RpZnkgd29ya2Zsb3cgZmlsZXNcIikgfSxcbn07XG5cbmZ1bmN0aW9uIGlzVHJ1ZU9yRmFsc2UodmFsdWU6IElWYWx1ZSk6IGJvb2xlYW4ge1xuXHRpZiAodmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRyZXR1cm4gKHZhbHVlLnZhbHVlID09PSAndHJ1ZScgfHwgdmFsdWUudmFsdWUgPT09ICdmYWxzZScpICYmIHZhbHVlLmZvcm1hdCA9PT0gJ25vbmUnO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuY29uc3QgYWxsQXR0cmlidXRlTmFtZXM6IFJlY29yZDxQcm9tcHRzVHlwZSwgc3RyaW5nW10+ID0ge1xuXHRbUHJvbXB0c1R5cGUucHJvbXB0XTogW1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZSwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kZXNjcmlwdGlvbiwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlbCwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29scywgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFnZW50LCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFyZ3VtZW50SGludF0sXG5cdFtQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnNdOiBbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFwcGx5VG8sIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZXhjbHVkZUFnZW50XSxcblx0W1Byb21wdHNUeXBlLmFnZW50XTogW1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZSwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kZXNjcmlwdGlvbiwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlbCwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29scywgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZHZhbmNlZE9wdGlvbnMsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaGFuZE9mZnMsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXJndW1lbnRIaW50LCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRhcmdldCwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5pbmZlciwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZ2VudHMsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaG9va3MsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMudXNlckludm9jYWJsZSwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uLCBHaXRodWJQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmdpdGh1Yl0sXG5cdFtQcm9tcHRzVHlwZS5za2lsbF06IFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWUsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb24sIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubGljZW5zZSwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5jb21wYXRpYmlsaXR5LCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1ldGFkYXRhLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFyZ3VtZW50SGludCwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy51c2VySW52b2NhYmxlLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRpc2FibGVNb2RlbEludm9jYXRpb24sIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuY29udGV4dF0sXG5cdFtQcm9tcHRzVHlwZS5ob29rXTogW10sIC8vIGhvb2tzIGFyZSBKU09OIGZpbGVzLCBub3QgbWFya2Rvd24gd2l0aCBZQU1MIGZyb250bWF0dGVyXG59O1xuY29uc3QgZ2l0aHViQ29waWxvdEFnZW50QXR0cmlidXRlTmFtZXMgPSBbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRvb2xzLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRhcmdldCwgR2l0aHViUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tY3BTZXJ2ZXJzLCBHaXRodWJQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmdpdGh1YiwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5pbmZlcl07XG5jb25zdCByZWNvbW1lbmRlZEF0dHJpYnV0ZU5hbWVzOiBSZWNvcmQ8UHJvbXB0c1R5cGUsIHN0cmluZ1tdPiA9IHtcblx0W1Byb21wdHNUeXBlLnByb21wdF06IGFsbEF0dHJpYnV0ZU5hbWVzW1Byb21wdHNUeXBlLnByb21wdF0uZmlsdGVyKG5hbWUgPT4gIWlzTm9uUmVjb21tZW5kZWRBdHRyaWJ1dGUobmFtZSkpLFxuXHRbUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zXTogYWxsQXR0cmlidXRlTmFtZXNbUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zXS5maWx0ZXIobmFtZSA9PiAhaXNOb25SZWNvbW1lbmRlZEF0dHJpYnV0ZShuYW1lKSksXG5cdFtQcm9tcHRzVHlwZS5hZ2VudF06IGFsbEF0dHJpYnV0ZU5hbWVzW1Byb21wdHNUeXBlLmFnZW50XS5maWx0ZXIobmFtZSA9PiAhaXNOb25SZWNvbW1lbmRlZEF0dHJpYnV0ZShuYW1lKSksXG5cdFtQcm9tcHRzVHlwZS5za2lsbF06IGFsbEF0dHJpYnV0ZU5hbWVzW1Byb21wdHNUeXBlLnNraWxsXS5maWx0ZXIobmFtZSA9PiAhaXNOb25SZWNvbW1lbmRlZEF0dHJpYnV0ZShuYW1lKSksXG5cdFtQcm9tcHRzVHlwZS5ob29rXTogW10sIC8vIGhvb2tzIGFyZSBKU09OIGZpbGVzLCBub3QgbWFya2Rvd24gd2l0aCBZQU1MIGZyb250bWF0dGVyXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmFsaWRBdHRyaWJ1dGVOYW1lcyhwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgaW5jbHVkZU5vblJlY29tbWVuZGVkOiBib29sZWFuLCB0YXJnZXQ6IFRhcmdldCk6IHN0cmluZ1tdIHtcblx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpIHtcblx0XHRcdHJldHVybiBPYmplY3Qua2V5cyhjbGF1ZGVSdWxlc0F0dHJpYnV0ZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmtleXMoY2xhdWRlQWdlbnRBdHRyaWJ1dGVzKTtcblx0fSBlbHNlIGlmICh0YXJnZXQgPT09IFRhcmdldC5HaXRIdWJDb3BpbG90KSB7XG5cdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KSB7XG5cdFx0XHRyZXR1cm4gZ2l0aHViQ29waWxvdEFnZW50QXR0cmlidXRlTmFtZXM7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBpbmNsdWRlTm9uUmVjb21tZW5kZWQgPyBhbGxBdHRyaWJ1dGVOYW1lc1twcm9tcHRUeXBlXSA6IHJlY29tbWVuZGVkQXR0cmlidXRlTmFtZXNbcHJvbXB0VHlwZV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05vblJlY29tbWVuZGVkQXR0cmlidXRlKGF0dHJpYnV0ZU5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYXR0cmlidXRlTmFtZSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZHZhbmNlZE9wdGlvbnMgfHwgYXR0cmlidXRlTmFtZSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5leGNsdWRlQWdlbnQgfHwgYXR0cmlidXRlTmFtZSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlIHx8IGF0dHJpYnV0ZU5hbWUgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaW5mZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBdHRyaWJ1dGVEZXNjcmlwdGlvbihhdHRyaWJ1dGVOYW1lOiBzdHJpbmcsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCB0YXJnZXQ6IFRhcmdldCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUpIHtcblx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpIHtcblx0XHRcdHJldHVybiBjbGF1ZGVBZ2VudEF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV0/LmRlc2NyaXB0aW9uO1xuXHRcdH1cblx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRyZXR1cm4gY2xhdWRlUnVsZXNBdHRyaWJ1dGVzW2F0dHJpYnV0ZU5hbWVdPy5kZXNjcmlwdGlvbjtcblx0XHR9XG5cdH1cblx0c3dpdGNoIChwcm9tcHRUeXBlKSB7XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRzd2l0Y2ggKGF0dHJpYnV0ZU5hbWUpIHtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWU6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuaW5zdHJ1Y3Rpb25zLm5hbWUnLCAnVGhlIG5hbWUgb2YgdGhlIGluc3RydWN0aW9uIGZpbGUgYXMgc2hvd24gaW4gdGhlIFVJLiBJZiBub3Qgc2V0LCB0aGUgbmFtZSBpcyBkZXJpdmVkIGZyb20gdGhlIGZpbGUgbmFtZS4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmluc3RydWN0aW9ucy5kZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIGluc3RydWN0aW9uIGZpbGUuIEl0IGNhbiBiZSB1c2VkIHRvIHByb3ZpZGUgYWRkaXRpb25hbCBjb250ZXh0IG9yIGluZm9ybWF0aW9uIGFib3V0IHRoZSBpbnN0cnVjdGlvbnMgYW5kIGlzIHBhc3NlZCB0byB0aGUgbGFuZ3VhZ2UgbW9kZWwgYXMgcGFydCBvZiB0aGUgcHJvbXB0LicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXBwbHlUbzpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5pbnN0cnVjdGlvbnMuYXBwbHlUb1JhbmdlJywgJ09uZSBvciBtb3JlIGdsb2IgcGF0dGVybiAoc2VwYXJhdGVkIGJ5IGNvbW1hKSB0aGF0IGRlc2NyaWJlIGZvciB3aGljaCBmaWxlcyB0aGUgaW5zdHJ1Y3Rpb25zIGFwcGx5IHRvLiBCYXNlZCBvbiB0aGVzZSBwYXR0ZXJucywgdGhlIGZpbGUgaXMgYXV0b21hdGljYWxseSBpbmNsdWRlZCBpbiB0aGUgcHJvbXB0LCB3aGVuIHRoZSBjb250ZXh0IGNvbnRhaW5zIGEgZmlsZSB0aGF0IG1hdGNoZXMgb25lIG9yIG1vcmUgb2YgdGhlc2UgcGF0dGVybnMuIFVzZSBgKipgIHdoZW4geW91IHdhbnQgdGhpcyBmaWxlIHRvIGFsd2F5cyBiZSBhZGRlZC5cXG5FeGFtcGxlOiBgKiovKi50c2AsIGAqKi8qLmpzYCwgYGNsaWVudC8qKmAnKTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6XG5cdFx0XHRzd2l0Y2ggKGF0dHJpYnV0ZU5hbWUpIHtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWU6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuc2tpbGwubmFtZScsICdUaGUgbmFtZSBvZiB0aGUgc2tpbGwuJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kZXNjcmlwdGlvbjpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC5kZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIHNraWxsLiBUaGUgZGVzY3JpcHRpb24gaXMgYWRkZWQgdG8gZXZlcnkgcmVxdWVzdCBhbmQgd2lsbCBiZSB1c2VkIGJ5IHRoZSBhZ2VudCB0byBkZWNpZGUgd2hlbiB0byBsb2FkIHRoZSBza2lsbC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFyZ3VtZW50SGludDpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC5hcmd1bWVudEhpbnQnLCAnSGludCBzaG93biBkdXJpbmcgYXV0b2NvbXBsZXRlIHRvIGluZGljYXRlIGV4cGVjdGVkIGFyZ3VtZW50cy4gRXhhbXBsZTogW2lzc3VlLW51bWJlcl0gb3IgW2ZpbGVuYW1lXSBbZm9ybWF0XScpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMudXNlckludm9jYWJsZTpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC51c2VySW52b2NhYmxlJywgJ1NldCB0byBmYWxzZSB0byBoaWRlIGZyb20gdGhlIC8gbWVudS4gVXNlIGZvciBiYWNrZ3JvdW5kIGtub3dsZWRnZSB1c2VycyBzaG91bGQgbm90IGludm9rZSBkaXJlY3RseS4gRGVmYXVsdDogdHJ1ZS4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRpc2FibGVNb2RlbEludm9jYXRpb246XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuc2tpbGwuZGlzYWJsZU1vZGVsSW52b2NhdGlvbicsICdTZXQgdG8gdHJ1ZSB0byBwcmV2ZW50IHRoZSBhZ2VudCBmcm9tIGF1dG9tYXRpY2FsbHkgbG9hZGluZyB0aGlzIHNraWxsLiBVc2UgZm9yIHdvcmtmbG93cyB5b3Ugd2FudCB0byB0cmlnZ2VyIG1hbnVhbGx5IHdpdGggL25hbWUuIERlZmF1bHQ6IGZhbHNlLicpO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdHN3aXRjaCAoYXR0cmlidXRlTmFtZSkge1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZTpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5uYW1lJywgJ1RoZSBuYW1lIG9mIHRoZSBhZ2VudCBhcyBzaG93biBpbiB0aGUgVUkuJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kZXNjcmlwdGlvbjpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5kZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIGN1c3RvbSBhZ2VudCwgd2hhdCBpdCBkb2VzIGFuZCB3aGVuIHRvIHVzZSBpdC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFyZ3VtZW50SGludDpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5hcmd1bWVudEhpbnQnLCAnVGhlIGFyZ3VtZW50LWhpbnQgZGVzY3JpYmVzIHdoYXQgaW5wdXRzIHRoZSBjdXN0b20gYWdlbnQgZXhwZWN0cyBvciBzdXBwb3J0cy4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGVsOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50Lm1vZGVsJywgJ1NwZWNpZnkgdGhlIG1vZGVsIHRoYXQgcnVucyB0aGlzIGN1c3RvbSBhZ2VudC4gQ2FuIGFsc28gYmUgYSBsaXN0IG9mIG1vZGVscy4gVGhlIGZpcnN0IGF2YWlsYWJsZSBtb2RlbCB3aWxsIGJlIHVzZWQuJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29sczpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC50b29scycsICdUaGUgc2V0IG9mIHRvb2xzIHRoYXQgdGhlIGN1c3RvbSBhZ2VudCBoYXMgYWNjZXNzIHRvLicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaGFuZE9mZnM6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuaGFuZG9mZnMnLCAnUG9zc2libGUgaGFuZG9mZiBhY3Rpb25zIHdoZW4gdGhlIGFnZW50IGhhcyBjb21wbGV0ZWQgaXRzIHRhc2suJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50YXJnZXQ6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQudGFyZ2V0JywgJ1RoZSB0YXJnZXQgdG8gd2hpY2ggdGhlIGhlYWRlciBhdHRyaWJ1dGVzIGxpa2UgdG9vbHMgYXBwbHkgdG8uIFBvc3NpYmxlIHZhbHVlcyBhcmUgYGdpdGh1Yi1jb3BpbG90YCBhbmQgYHZzY29kZWAuJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5pbmZlcjpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5pbmZlcicsICdDb250cm9scyB2aXNpYmlsaXR5IG9mIHRoZSBhZ2VudC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFnZW50czpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5hZ2VudHMnLCAnT25lIG9yIG1vcmUgYWdlbnRzIHRoYXQgdGhpcyBhZ2VudCBjYW4gdXNlIGFzIHN1YmFnZW50cy4gVXNlIFxcJypcXCcgdG8gc3BlY2lmeSBhbGwgYXZhaWxhYmxlIGFnZW50cy4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmhvb2tzOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50Lmhvb2tzJywgJ0xpZmVjeWNsZSBob29rcyBzY29wZWQgdG8gdGhpcyBhZ2VudC4gRGVmaW5lIGhvb2tzIHRoYXQgcnVuIG9ubHkgd2hpbGUgdGhpcyBhZ2VudCBpcyBhY3RpdmUuJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy51c2VySW52b2NhYmxlOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LnVzZXJJbnZvY2FibGUnLCAnV2hldGhlciB0aGUgYWdlbnQgY2FuIGJlIHNlbGVjdGVkIGFuZCBpbnZva2VkIGJ5IHVzZXJzIGluIHRoZSBVSS4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRpc2FibGVNb2RlbEludm9jYXRpb246XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuZGlzYWJsZU1vZGVsSW52b2NhdGlvbicsICdJZiB0cnVlLCBwcmV2ZW50cyB0aGUgYWdlbnQgZnJvbSBiZWluZyBpbnZva2VkIGFzIGEgc3ViYWdlbnQuJyk7XG5cdFx0XHRcdGNhc2UgR2l0aHViUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5naXRodWI6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuZ2l0aHViJywgJ0dpdEh1Yi1zcGVjaWZpYyBjb25maWd1cmF0aW9uIGZvciB0aGUgYWdlbnQsIHN1Y2ggYXMgdG9rZW4gcGVybWlzc2lvbnMuJyk7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFByb21wdHNUeXBlLnByb21wdDpcblx0XHRcdHN3aXRjaCAoYXR0cmlidXRlTmFtZSkge1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZTpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQubmFtZScsICdUaGUgbmFtZSBvZiB0aGUgcHJvbXB0LiBUaGlzIGlzIGFsc28gdGhlIG5hbWUgb2YgdGhlIHNsYXNoIGNvbW1hbmQgdGhhdCB3aWxsIHJ1biB0aGlzIHByb21wdC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5kZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIHJldXNhYmxlIHByb21wdCwgd2hhdCBpdCBkb2VzIGFuZCB3aGVuIHRvIHVzZSBpdC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFyZ3VtZW50SGludDpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQuYXJndW1lbnRIaW50JywgJ1RoZSBhcmd1bWVudC1oaW50IGRlc2NyaWJlcyB3aGF0IGlucHV0cyB0aGUgcHJvbXB0IGV4cGVjdHMgb3Igc3VwcG9ydHMuJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlbDpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQubW9kZWwnLCAnVGhlIG1vZGVsIHRvIHVzZSBpbiB0aGlzIHByb21wdC4gQ2FuIGFsc28gYmUgYSBsaXN0IG9mIG1vZGVscy4gVGhlIGZpcnN0IGF2YWlsYWJsZSBtb2RlbCB3aWxsIGJlIHVzZWQuJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29sczpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQudG9vbHMnLCAnVGhlIHRvb2xzIHRvIHVzZSBpbiB0aGlzIHByb21wdC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFnZW50OlxuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubW9kZTpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQuYWdlbnQuZGVzY3JpcHRpb24nLCAnVGhlIGFnZW50IHRvIHVzZSB3aGVuIHJ1bm5pbmcgdGhpcyBwcm9tcHQuJyk7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vLyBUaGUgbGlzdCBvZiB0b29scyBrbm93biB0byBiZSB1c2VkIGJ5IEdpdEh1YiBDb3BpbG90IGN1c3RvbSBhZ2VudHNcbmV4cG9ydCBjb25zdCBrbm93bkdpdGh1YkNvcGlsb3RUb29scyA9IFtcblx0eyBuYW1lOiBTcGVjZWRUb29sQWxpYXNlcy5leGVjdXRlLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YkNvcGlsb3QuZXhlY3V0ZScsICdFeGVjdXRlIGNvbW1hbmRzJykgfSxcblx0eyBuYW1lOiBTcGVjZWRUb29sQWxpYXNlcy5yZWFkLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YkNvcGlsb3QucmVhZCcsICdSZWFkIGZpbGVzJykgfSxcblx0eyBuYW1lOiBTcGVjZWRUb29sQWxpYXNlcy5lZGl0LCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YkNvcGlsb3QuZWRpdCcsICdFZGl0IGZpbGVzJykgfSxcblx0eyBuYW1lOiBTcGVjZWRUb29sQWxpYXNlcy5zZWFyY2gsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViQ29waWxvdC5zZWFyY2gnLCAnU2VhcmNoIGZpbGVzJykgfSxcblx0eyBuYW1lOiBTcGVjZWRUb29sQWxpYXNlcy5hZ2VudCwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJDb3BpbG90LmFnZW50JywgJ1VzZSBzdWJhZ2VudHMnKSB9LFxuXTtcblxuZXhwb3J0IGludGVyZmFjZSBJVmFsdWVFbnRyeSB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBrbm93bkNsYXVkZVRvb2xzID0gW1xuXHR7IG5hbWU6ICdCYXNoJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuYmFzaCcsICdFeGVjdXRlIHNoZWxsIGNvbW1hbmRzJyksIHRvb2xFcXVpdmFsZW50OiBbU3BlY2VkVG9vbEFsaWFzZXMuZXhlY3V0ZV0gfSxcblx0eyBuYW1lOiAnRWRpdCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmVkaXQnLCAnTWFrZSB0YXJnZXRlZCBmaWxlIGVkaXRzJyksIHRvb2xFcXVpdmFsZW50OiBbJ2VkaXQvZWRpdE5vdGVib29rJywgJ2VkaXQvZWRpdEZpbGVzJ10gfSxcblx0eyBuYW1lOiAnR2xvYicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmdsb2InLCAnRmluZCBmaWxlcyBieSBwYXR0ZXJuJyksIHRvb2xFcXVpdmFsZW50OiBbJ3NlYXJjaC9maWxlU2VhcmNoJ10gfSxcblx0eyBuYW1lOiAnR3JlcCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmdyZXAnLCAnU2VhcmNoIGZpbGUgY29udGVudHMgd2l0aCByZWdleCcpLCB0b29sRXF1aXZhbGVudDogWydzZWFyY2gvdGV4dFNlYXJjaCddIH0sXG5cdHsgbmFtZTogJ1JlYWQnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5yZWFkJywgJ1JlYWQgZmlsZSBjb250ZW50cycpLCB0b29sRXF1aXZhbGVudDogWydyZWFkL3JlYWRGaWxlJywgJ3JlYWQvZ2V0Tm90ZWJvb2tTdW1tYXJ5J10gfSxcblx0eyBuYW1lOiAnV3JpdGUnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS53cml0ZScsICdDcmVhdGUvb3ZlcndyaXRlIGZpbGVzJyksIHRvb2xFcXVpdmFsZW50OiBbJ2VkaXQvY3JlYXRlRGlyZWN0b3J5JywgJ2VkaXQvY3JlYXRlRmlsZScsICdlZGl0L2NyZWF0ZUp1cHl0ZXJOb3RlYm9vayddIH0sXG5cdHsgbmFtZTogJ1dlYkZldGNoJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUud2ViRmV0Y2gnLCAnRmV0Y2ggVVJMIGNvbnRlbnQnKSwgdG9vbEVxdWl2YWxlbnQ6IFtTcGVjZWRUb29sQWxpYXNlcy53ZWJdIH0sXG5cdHsgbmFtZTogJ1dlYlNlYXJjaCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLndlYlNlYXJjaCcsICdQZXJmb3JtIHdlYiBzZWFyY2hlcycpLCB0b29sRXF1aXZhbGVudDogW1NwZWNlZFRvb2xBbGlhc2VzLndlYl0gfSxcblx0eyBuYW1lOiAnVGFzaycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnRhc2snLCAnUnVuIHN1YmFnZW50cyBmb3IgY29tcGxleCB0YXNrcycpLCB0b29sRXF1aXZhbGVudDogW1NwZWNlZFRvb2xBbGlhc2VzLmFnZW50XSB9LFxuXHR7IG5hbWU6ICdTa2lsbCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnNraWxsJywgJ0V4ZWN1dGUgc2tpbGxzJyksIHRvb2xFcXVpdmFsZW50OiBbXSB9LFxuXHR7IG5hbWU6ICdMU1AnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5sc3AnLCAnQ29kZSBpbnRlbGxpZ2VuY2UgKHJlcXVpcmVzIHBsdWdpbiknKSwgdG9vbEVxdWl2YWxlbnQ6IFtdIH0sXG5cdHsgbmFtZTogJ05vdGVib29rRWRpdCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLm5vdGVib29rRWRpdCcsICdNb2RpZnkgSnVweXRlciBub3RlYm9va3MnKSwgdG9vbEVxdWl2YWxlbnQ6IFsnZWRpdC9lZGl0Tm90ZWJvb2snXSB9LFxuXHR7IG5hbWU6ICdBc2tVc2VyUXVlc3Rpb24nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5hc2tVc2VyUXVlc3Rpb24nLCAnQXNrIG11bHRpcGxlLWNob2ljZSBxdWVzdGlvbnMnKSwgdG9vbEVxdWl2YWxlbnQ6IFsndnNjb2RlL2Fza1F1ZXN0aW9ucyddIH0sXG5cdHsgbmFtZTogJ01DUFNlYXJjaCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLm1jcFNlYXJjaCcsICdTZWFyY2hlcyBmb3IgTUNQIHRvb2xzIHdoZW4gdG9vbCBzZWFyY2ggaXMgZW5hYmxlZCcpLCB0b29sRXF1aXZhbGVudDogW10gfVxuXTtcblxuZXhwb3J0IGNvbnN0IGtub3duQ2xhdWRlTW9kZWxzID0gW1xuXHR7IG5hbWU6ICdzb25uZXQnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5zb25uZXQnLCAnTGF0ZXN0IENsYXVkZSBTb25uZXQnKSwgbW9kZWxFcXVpdmFsZW50OiAnQ2xhdWRlIFNvbm5ldCA0LjUgKGNvcGlsb3QpJyB9LFxuXHR7IG5hbWU6ICdvcHVzJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUub3B1cycsICdMYXRlc3QgQ2xhdWRlIE9wdXMnKSwgbW9kZWxFcXVpdmFsZW50OiAnQ2xhdWRlIE9wdXMgNC42IChjb3BpbG90KScgfSxcblx0eyBuYW1lOiAnaGFpa3UnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5oYWlrdScsICdMYXRlc3QgQ2xhdWRlIEhhaWt1LCBmYXN0IGZvciBzaW1wbGUgdGFza3MnKSwgbW9kZWxFcXVpdmFsZW50OiAnQ2xhdWRlIEhhaWt1IDQuNSAoY29waWxvdCknIH0sXG5cdHsgbmFtZTogJ2luaGVyaXQnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5pbmhlcml0JywgJ0luaGVyaXQgbW9kZWwgZnJvbSBwYXJlbnQgYWdlbnQgb3IgcHJvbXB0JyksIG1vZGVsRXF1aXZhbGVudDogdW5kZWZpbmVkIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gbWFwQ2xhdWRlTW9kZWxzKGNsYXVkZU1vZGVsTmFtZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRjb25zdCByZXN1bHQgPSBbXTtcblx0Zm9yIChjb25zdCBuYW1lIG9mIGNsYXVkZU1vZGVsTmFtZXMpIHtcblx0XHRjb25zdCBjbGF1ZGVNb2RlbCA9IGtub3duQ2xhdWRlTW9kZWxzLmZpbmQobW9kZWwgPT4gbW9kZWwubmFtZSA9PT0gbmFtZSk7XG5cdFx0aWYgKGNsYXVkZU1vZGVsICYmIGNsYXVkZU1vZGVsLm1vZGVsRXF1aXZhbGVudCkge1xuXHRcdFx0cmVzdWx0LnB1c2goY2xhdWRlTW9kZWwubW9kZWxFcXVpdmFsZW50KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBNYXBzIENsYXVkZSB0b29sIG5hbWVzIHRvIHRoZWlyIFZTIENvZGUgdG9vbCBlcXVpdmFsZW50cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcENsYXVkZVRvb2xzKGNsYXVkZVRvb2xOYW1lczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBuYW1lIG9mIGNsYXVkZVRvb2xOYW1lcykge1xuXHRcdGNvbnN0IGNsYXVkZVRvb2wgPSBrbm93bkNsYXVkZVRvb2xzLmZpbmQodG9vbCA9PiB0b29sLm5hbWUgPT09IG5hbWUpO1xuXHRcdGlmIChjbGF1ZGVUb29sKSB7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5jbGF1ZGVUb29sLnRvb2xFcXVpdmFsZW50KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGNvbnN0IGNsYXVkZUFnZW50QXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgeyB0eXBlOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGRlZmF1bHRzPzogc3RyaW5nW107IGl0ZW1zPzogSVZhbHVlRW50cnlbXTsgZW51bXM/OiBJVmFsdWVFbnRyeVtdIH0+ID0ge1xuXHQnbmFtZSc6IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5uYW1lJywgXCJVbmlxdWUgaWRlbnRpZmllciB1c2luZyBsb3dlcmNhc2UgbGV0dGVycyBhbmQgaHlwaGVucyAocmVxdWlyZWQpXCIpLFxuXHR9LFxuXHQnZGVzY3JpcHRpb24nOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUuZGVzY3JpcHRpb24nLCBcIldoZW4gdG8gZGVsZWdhdGUgdG8gdGhpcyBzdWJhZ2VudCAocmVxdWlyZWQpXCIpLFxuXHR9LFxuXHQndG9vbHMnOiB7XG5cdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS50b29scycsIFwiQXJyYXkgb2YgdG9vbHMgdGhlIHN1YmFnZW50IGNhbiB1c2UuIEluaGVyaXRzIGFsbCB0b29scyBpZiBvbWl0dGVkXCIpLFxuXHRcdGRlZmF1bHRzOiBbJ1JlYWQsIEVkaXQsIEJhc2gnXSxcblx0XHRpdGVtczoga25vd25DbGF1ZGVUb29sc1xuXHR9LFxuXHQnZGlzYWxsb3dlZFRvb2xzJzoge1xuXHRcdHR5cGU6ICdzZXF1ZW5jZScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUuZGlzYWxsb3dlZFRvb2xzJywgXCJUb29scyB0byBkZW55LCByZW1vdmVkIGZyb20gaW5oZXJpdGVkIG9yIHNwZWNpZmllZCBsaXN0XCIpLFxuXHRcdGRlZmF1bHRzOiBbJ1dyaXRlLCBFZGl0LCBCYXNoJ10sXG5cdFx0aXRlbXM6IGtub3duQ2xhdWRlVG9vbHNcblx0fSxcblx0J21vZGVsJzoge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLm1vZGVsJywgXCJNb2RlbCB0byB1c2U6IHNvbm5ldCwgb3B1cywgaGFpa3UsIG9yIGluaGVyaXQuIERlZmF1bHRzIHRvIGluaGVyaXQuXCIpLFxuXHRcdGRlZmF1bHRzOiBbJ3Nvbm5ldCcsICdvcHVzJywgJ2hhaWt1JywgJ2luaGVyaXQnXSxcblx0XHRlbnVtczoga25vd25DbGF1ZGVNb2RlbHNcblx0fSxcblx0J3Blcm1pc3Npb25Nb2RlJzoge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLnBlcm1pc3Npb25Nb2RlJywgXCJQZXJtaXNzaW9uIG1vZGU6IGRlZmF1bHQsIGFjY2VwdEVkaXRzLCBkb250QXNrLCBieXBhc3NQZXJtaXNzaW9ucywgb3IgcGxhbi5cIiksXG5cdFx0ZGVmYXVsdHM6IFsnZGVmYXVsdCcsICdhY2NlcHRFZGl0cycsICdkb250QXNrJywgJ2J5cGFzc1Blcm1pc3Npb25zJywgJ3BsYW4nXSxcblx0XHRlbnVtczogW1xuXHRcdFx0eyBuYW1lOiAnZGVmYXVsdCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb25Nb2RlLmRlZmF1bHQnLCAnU3RhbmRhcmQgYmVoYXZpb3I6IHByb21wdHMgZm9yIHBlcm1pc3Npb24gb24gZmlyc3QgdXNlIG9mIGVhY2ggdG9vbC4nKSB9LFxuXHRcdFx0eyBuYW1lOiAnYWNjZXB0RWRpdHMnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uTW9kZS5hY2NlcHRFZGl0cycsICdBdXRvbWF0aWNhbGx5IGFjY2VwdHMgZmlsZSBlZGl0IHBlcm1pc3Npb25zIGZvciB0aGUgc2Vzc2lvbi4nKSB9LFxuXHRcdFx0eyBuYW1lOiAncGxhbicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb25Nb2RlLnBsYW4nLCAnUGxhbiBNb2RlOiBDbGF1ZGUgY2FuIGFuYWx5emUgYnV0IG5vdCBtb2RpZnkgZmlsZXMgb3IgZXhlY3V0ZSBjb21tYW5kcy4nKSB9LFxuXHRcdFx0eyBuYW1lOiAnZGVsZWdhdGUnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uTW9kZS5kZWxlZ2F0ZScsICdDb29yZGluYXRpb24tb25seSBtb2RlIGZvciBhZ2VudCB0ZWFtIGxlYWRzLiBPbmx5IGF2YWlsYWJsZSB3aGVuIGFuIGFnZW50IHRlYW0gaXMgYWN0aXZlLicpIH0sXG5cdFx0XHR7IG5hbWU6ICdkb250QXNrJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbk1vZGUuZG9udEFzaycsICdBdXRvLWRlbmllcyB0b29scyB1bmxlc3MgcHJlLWFwcHJvdmVkIHZpYSAvcGVybWlzc2lvbnMgb3IgcGVybWlzc2lvbnMuYWxsb3cgcnVsZXMuJykgfSxcblx0XHRcdHsgbmFtZTogJ2J5cGFzc1Blcm1pc3Npb25zJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbk1vZGUuYnlwYXNzUGVybWlzc2lvbnMnLCAnU2tpcHMgYWxsIHBlcm1pc3Npb24gcHJvbXB0cyAocmVxdWlyZXMgc2FmZSBlbnZpcm9ubWVudCBsaWtlIGNvbnRhaW5lcnMpLicpIH1cblx0XHRdXG5cdH0sXG5cdCdza2lsbHMnOiB7XG5cdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5za2lsbHMnLCBcIlNraWxscyB0byBsb2FkIGludG8gdGhlIHN1YmFnZW50J3MgY29udGV4dCBhdCBzdGFydHVwLlwiKSxcblx0fSxcblx0J21jcFNlcnZlcnMnOiB7XG5cdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5tY3BTZXJ2ZXJzJywgXCJNQ1Agc2VydmVycyBhdmFpbGFibGUgdG8gdGhpcyBzdWJhZ2VudC5cIiksXG5cdH0sXG5cdCdob29rcyc6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5ob29rcycsIFwiTGlmZWN5Y2xlIGhvb2tzIHNjb3BlZCB0byB0aGlzIHN1YmFnZW50LlwiKSxcblx0fSxcblx0J21lbW9yeSc6IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5tZW1vcnknLCBcIlBlcnNpc3RlbnQgbWVtb3J5IHNjb3BlOiB1c2VyLCBwcm9qZWN0LCBvciBsb2NhbC4gRW5hYmxlcyBjcm9zcy1zZXNzaW9uIGxlYXJuaW5nLlwiKSxcblx0XHRkZWZhdWx0czogWyd1c2VyJywgJ3Byb2plY3QnLCAnbG9jYWwnXSxcblx0XHRlbnVtczogW1xuXHRcdFx0eyBuYW1lOiAndXNlcicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLm1lbW9yeS51c2VyJywgXCJSZW1lbWJlciBsZWFybmluZ3MgYWNyb3NzIGFsbCBwcm9qZWN0cy5cIikgfSxcblx0XHRcdHsgbmFtZTogJ3Byb2plY3QnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5tZW1vcnkucHJvamVjdCcsIFwiVGhlIHN1YmFnZW50J3Mga25vd2xlZGdlIGlzIHByb2plY3Qtc3BlY2lmaWMgYW5kIHNoYXJlYWJsZSB2aWEgdmVyc2lvbiBjb250cm9sLlwiKSB9LFxuXHRcdFx0eyBuYW1lOiAnbG9jYWwnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5tZW1vcnkubG9jYWwnLCBcIlRoZSBzdWJhZ2VudCdzIGtub3dsZWRnZSBpcyBwcm9qZWN0LXNwZWNpZmljIGJ1dCBzaG91bGQgbm90IGJlIGNoZWNrZWQgaW50byB2ZXJzaW9uIGNvbnRyb2wuXCIpIH1cblx0XHRdXG5cdH1cbn07XG5cbi8qKlxuICogQXR0cmlidXRlcyBzdXBwb3J0ZWQgaW4gQ2xhdWRlIHJ1bGVzIGZpbGVzIChgLmNsYXVkZS9ydWxlcy8qLm1kYCkuXG4gKiBDbGF1ZGUgcnVsZXMgdXNlIGBwYXRoc2AgaW5zdGVhZCBvZiBgYXBwbHlUb2AgZm9yIGdsb2IgcGF0dGVybnMuXG4gKi9cbmV4cG9ydCBjb25zdCBjbGF1ZGVSdWxlc0F0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIHsgdHlwZTogc3RyaW5nOyBkZXNjcmlwdGlvbjogc3RyaW5nOyBkZWZhdWx0cz86IHN0cmluZ1tdOyBpdGVtcz86IElWYWx1ZUVudHJ5W107IGVudW1zPzogSVZhbHVlRW50cnlbXSB9PiA9IHtcblx0J2Rlc2NyaXB0aW9uJzoge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLnJ1bGVzLmRlc2NyaXB0aW9uJywgXCJBIGRlc2NyaXB0aW9uIG9mIHdoYXQgdGhpcyBydWxlIGNvdmVycywgdXNlZCB0byBwcm92aWRlIGNvbnRleHQgYWJvdXQgd2hlbiBpdCBhcHBsaWVzLlwiKSxcblx0fSxcblx0J3BhdGhzJzoge1xuXHRcdHR5cGU6ICdzZXF1ZW5jZScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUucnVsZXMucGF0aHMnLCBcIkFycmF5IG9mIGdsb2IgcGF0dGVybnMgdGhhdCBkZXNjcmliZSBmb3Igd2hpY2ggZmlsZXMgdGhlIHJ1bGUgYXBwbGllcy4gQmFzZWQgb24gdGhlc2UgcGF0dGVybnMsIHRoZSBmaWxlIGlzIGF1dG9tYXRpY2FsbHkgaW5jbHVkZWQgaW4gdGhlIHByb21wdCB3aGVuIHRoZSBjb250ZXh0IGNvbnRhaW5zIGEgZmlsZSB0aGF0IG1hdGNoZXMuXFxuRXhhbXBsZTogYFsnc3JjLyoqLyoudHMnLCAndGVzdC8qKiddYFwiKSxcblx0fSxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1ZTQ29kZU9yRGVmYXVsdFRhcmdldCh0YXJnZXQ6IFRhcmdldCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdGFyZ2V0ID09PSBUYXJnZXQuVlNDb2RlIHx8IHRhcmdldCA9PT0gVGFyZ2V0LlVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRhcmdldChwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgaGVhZGVyOiBQcm9tcHRIZWFkZXIgfCBVUkkpOiBUYXJnZXQge1xuXHRjb25zdCB1cmkgPSBoZWFkZXIgaW5zdGFuY2VvZiBVUkkgPyBoZWFkZXIgOiBoZWFkZXIudXJpO1xuXHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpIHtcblx0XHRjb25zdCBwYXJlbnREaXIgPSBkaXJuYW1lKHVyaSk7XG5cdFx0aWYgKHBhcmVudERpci5wYXRoLmVuZHNXaXRoKGAvJHtDTEFVREVfQUdFTlRTX1NPVVJDRV9GT0xERVJ9YCkpIHtcblx0XHRcdHJldHVybiBUYXJnZXQuQ2xhdWRlO1xuXHRcdH1cblx0XHRpZiAoIShoZWFkZXIgaW5zdGFuY2VvZiBVUkkpKSB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBoZWFkZXIudGFyZ2V0O1xuXHRcdFx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkdpdEh1YkNvcGlsb3QgfHwgdGFyZ2V0ID09PSBUYXJnZXQuVlNDb2RlKSB7XG5cdFx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBUYXJnZXQuVW5kZWZpbmVkO1xuXHR9IGVsc2UgaWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucykge1xuXHRcdGlmIChpc0luQ2xhdWRlUnVsZXNGb2xkZXIodXJpKSkge1xuXHRcdFx0cmV0dXJuIFRhcmdldC5DbGF1ZGU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBUYXJnZXQuVW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB0b01hcmtlcihtZXNzYWdlOiBzdHJpbmcsIHJhbmdlOiBSYW5nZSwgc2V2ZXJpdHkgPSBNYXJrZXJTZXZlcml0eS5FcnJvciwgdGFncz86IE1hcmtlclRhZ1tdLCBjb2RlPzogc3RyaW5nKTogSU1hcmtlckRhdGEge1xuXHRyZXR1cm4geyBzZXZlcml0eSwgbWVzc2FnZSwgLi4uKHRhZ3MgPyB7IHRhZ3MgfSA6IHt9KSwgLi4uKGNvZGUgPyB7IGNvZGUgfSA6IHt9KSwgLi4ucmFuZ2UgfTtcbn1cbiJdLAog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
