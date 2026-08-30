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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { CharCode } from "../../../../../../base/common/charCode.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { CompletionItemInsertTextRule, CompletionItemKind } from "../../../../../../editor/common/languages.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../languageModels.js";
import { ILanguageModelToolsService } from "../../tools/languageModelToolsService.js";
import { IChatModeService } from "../../chatModes.js";
import { getPromptsTypeForLanguageId, PromptsType, Target } from "../promptTypes.js";
import { IPromptsService } from "../service/promptsService.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { parseCommaSeparatedList, PromptHeaderAttributes } from "../promptFileParser.js";
import { getAttributeDefinition, getTarget, getValidAttributeNames, knownClaudeTools, knownGithubCopilotTools, ClaudeHeaderAttributes } from "./promptFileAttributes.js";
import { localize } from "../../../../../../nls.js";
import { formatArrayValue, getQuotePreference } from "../utils/promptEditHelper.js";
import { HOOKS_BY_TARGET, HOOK_METADATA } from "../hookTypes.js";
import { HOOK_COMMAND_FIELD_DESCRIPTIONS } from "../hookSchema.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
let PromptHeaderAutocompletion = class {
  constructor(promptsService, languageModelsService, languageModelToolsService, chatModeService, environmentService) {
    this.promptsService = promptsService;
    this.languageModelsService = languageModelsService;
    this.languageModelToolsService = languageModelToolsService;
    this.chatModeService = chatModeService;
    this.environmentService = environmentService;
    /**
     * Debug display name for this provider.
     */
    this._debugDisplayName = "PromptHeaderAutocompletion";
    /**
     * List of trigger characters handled by this provider.
     */
    this.triggerCharacters = [":"];
  }
  /**
   * The main function of this provider that calculates
   * completion items based on the provided arguments.
   */
  async provideCompletionItems(model, position, context, token) {
    const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
    if (!promptType) {
      return void 0;
    }
    if (/^\s*$/.test(model.getValue())) {
      return {
        suggestions: [{
          label: localize("promptHeaderAutocompletion.addHeader", "Add Prompt Header"),
          kind: CompletionItemKind.Snippet,
          insertText: [
            `---`,
            `description: $1`,
            `---`,
            `$0`
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          range: model.getFullModelRange()
        }]
      };
    }
    const parsedAST = this.promptsService.getParsedPromptFile(model);
    const header = parsedAST.header;
    if (!header) {
      return void 0;
    }
    const headerRange = parsedAST.header.range;
    if (position.lineNumber < headerRange.startLineNumber || position.lineNumber >= headerRange.endLineNumber) {
      return void 0;
    }
    const lineText = model.getLineContent(position.lineNumber);
    const colonIndex = lineText.indexOf(":");
    const colonPosition = colonIndex !== -1 ? new Position(position.lineNumber, colonIndex + 1) : void 0;
    if (!colonPosition || position.isBeforeOrEqual(colonPosition)) {
      let containingAttribute = header.attributes.find(({ range }) => range.startLineNumber < position.lineNumber && position.lineNumber <= range.endLineNumber);
      if (!containingAttribute) {
        for (let i = header.attributes.length - 1; i >= 0; i--) {
          const attr = header.attributes[i];
          if (attr.range.endLineNumber < position.lineNumber && attr.value.type === "map") {
            const nextAttr = header.attributes[i + 1];
            const nextStartLine = nextAttr ? nextAttr.range.startLineNumber : headerRange.endLineNumber;
            if (position.lineNumber < nextStartLine) {
              containingAttribute = attr;
            }
            break;
          }
        }
      }
      if (containingAttribute) {
        const attrLineText = model.getLineContent(containingAttribute.range.startLineNumber);
        const attrColonIndex = attrLineText.indexOf(":");
        if (attrColonIndex !== -1) {
          return this.provideValueCompletions(model, position, header, new Position(containingAttribute.range.startLineNumber, attrColonIndex + 1), promptType, containingAttribute);
        }
      }
      return this.provideAttributeNameCompletions(model, position, header, colonPosition, promptType);
    } else if (colonPosition && colonPosition.isBefore(position)) {
      return this.provideValueCompletions(model, position, header, colonPosition, promptType);
    }
    return void 0;
  }
  async provideAttributeNameCompletions(model, position, header, colonPosition, promptType) {
    const suggestions = [];
    const target = getTarget(promptType, header);
    const attributesToPropose = new Set(getValidAttributeNames(promptType, false, target));
    for (const attr of header.attributes) {
      attributesToPropose.delete(attr.key);
    }
    const getInsertText = async (key) => {
      if (colonPosition) {
        return key;
      }
      if (key === PromptHeaderAttributes.hooks && promptType === PromptsType.agent && target !== Target.Claude) {
        const hookNames = Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]);
        return `${key}:
  \${1|${hookNames.join(",")}|}:
    - type: command
      command: "$2"`;
      }
      const valueSuggestions = await this.getValueSuggestions(promptType, key, target);
      if (valueSuggestions.length > 0) {
        return `${key}: \${0:${valueSuggestions[0].name}}`;
      } else {
        return `${key}: $0`;
      }
    };
    for (const attribute of attributesToPropose) {
      const item = {
        label: attribute,
        documentation: getAttributeDefinition(attribute, promptType, target)?.description,
        kind: CompletionItemKind.Property,
        insertText: await getInsertText(attribute),
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        range: new Range(position.lineNumber, 1, position.lineNumber, !colonPosition ? model.getLineMaxColumn(position.lineNumber) : colonPosition.column)
      };
      suggestions.push(item);
    }
    return { suggestions };
  }
  async provideValueCompletions(model, position, header, colonPosition, promptType, preFoundAttribute) {
    const suggestions = [];
    const posLineNumber = position.lineNumber;
    const attribute = preFoundAttribute ?? header.attributes.find(({ range }) => range.startLineNumber <= posLineNumber && posLineNumber <= range.endLineNumber);
    if (!attribute) {
      return void 0;
    }
    const target = getTarget(promptType, header);
    if (!getValidAttributeNames(promptType, true, target).includes(attribute.key)) {
      return void 0;
    }
    if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
      if (attribute.key === PromptHeaderAttributes.model) {
        if (attribute.value.type === "sequence") {
          const getValues = async () => {
            if (target === Target.Claude) {
              return knownClaudeTools;
            } else {
              return this.getModelNames(promptType === PromptsType.agent);
            }
          };
          return this.provideArrayCompletions(model, position, attribute.value, getValues);
        }
      }
      if (attribute.key === PromptHeaderAttributes.tools || attribute.key === ClaudeHeaderAttributes.disallowedTools) {
        let value = attribute.value;
        if (value.type === "scalar") {
          value = parseCommaSeparatedList(value);
        }
        if (value.type === "sequence") {
          const getValues = async () => {
            if (target === Target.GitHubCopilot || this.environmentService.isSessionsWindow) {
              return knownGithubCopilotTools;
            } else if (target === Target.Claude) {
              return knownClaudeTools;
            } else {
              return Array.from(this.languageModelToolsService.getFullReferenceNames()).map((name) => ({ name }));
            }
          };
          return this.provideArrayCompletions(model, position, value, getValues);
        }
      }
    }
    if (attribute.key === PromptHeaderAttributes.agents) {
      if (attribute.value.type === "sequence") {
        return this.provideArrayCompletions(model, position, attribute.value, async () => {
          return (await this.promptsService.getCustomAgents(CancellationToken.None)).filter((a) => a.enabled);
        });
      }
    }
    if (attribute.key === PromptHeaderAttributes.hooks) {
      if (attribute.value.type === "map") {
        return this.provideHookEventCompletions(model, position, attribute.value, target);
      }
      if (position.lineNumber !== attribute.range.startLineNumber) {
        const emptyMap = { type: "map", properties: [], range: attribute.value.range };
        return this.provideHookEventCompletions(model, position, emptyMap, target);
      }
    }
    const lineContent = model.getLineContent(attribute.range.startLineNumber);
    const whilespaceAfterColon = lineContent.substring(colonPosition.column).match(/^\s*/)?.[0].length ?? 0;
    const entries = await this.getValueSuggestions(promptType, attribute.key, target);
    for (const entry of entries) {
      const item = {
        label: entry.name,
        documentation: entry.description,
        kind: CompletionItemKind.Value,
        insertText: whilespaceAfterColon === 0 ? ` ${entry.name}` : entry.name,
        range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
      };
      suggestions.push(item);
    }
    if (attribute.key === PromptHeaderAttributes.handOffs) {
      const value = [
        "",
        "  - label: Start Implementation",
        "    agent: agent",
        "    prompt: Implement the plan",
        "    send: true"
      ].join("\n");
      const item = {
        label: localize("promptHeaderAutocompletion.handoffsExample", "Handoff Example"),
        kind: CompletionItemKind.Value,
        insertText: whilespaceAfterColon === 0 ? ` ${value}` : value,
        range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
      };
      suggestions.push(item);
    }
    if (attribute.key === PromptHeaderAttributes.hooks && promptType === PromptsType.agent) {
      const hookSnippet = [
        "",
        "  ${1|" + Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]).join(",") + "|}:",
        "    - type: command",
        '      command: "$2"'
      ].join("\n");
      const item = {
        label: localize("promptHeaderAutocompletion.newHook", "New Hook"),
        kind: CompletionItemKind.Snippet,
        insertText: whilespaceAfterColon === 0 ? ` ${hookSnippet}` : hookSnippet,
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
      };
      suggestions.push(item);
    }
    return { suggestions };
  }
  /**
   * Provides completions inside the `hooks:` map.
   * Determines what to suggest based on nesting depth:
   * - At hook event level: suggest event names (SessionStart, PreToolUse, etc.)
   * - Inside a command object: suggest command fields (type, command, timeout, etc.)
   */
  provideHookEventCompletions(model, position, hooksMap, target) {
    const hookEventOnLine = hooksMap.properties.find((p) => p.key.range.startLineNumber === position.lineNumber);
    if (hookEventOnLine) {
      const lineText2 = model.getLineContent(position.lineNumber);
      const colonIdx = lineText2.indexOf(":");
      if (colonIdx !== -1 && position.column > colonIdx + 1) {
        const whilespaceAfterColon = lineText2.substring(colonIdx + 1).match(/^\s*/)?.[0].length ?? 0;
        const commandSnippet = [
          "",
          "  - type: command",
          '    command: "$1"'
        ].join("\n");
        return {
          suggestions: [{
            label: localize("promptHeaderAutocompletion.newCommand", "New Command"),
            documentation: localize("promptHeaderAutocompletion.newCommand.description", "Add a new command entry to this hook."),
            kind: CompletionItemKind.Snippet,
            insertText: whilespaceAfterColon === 0 ? ` ${commandSnippet}` : commandSnippet,
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            range: new Range(position.lineNumber, colonIdx + 1 + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
          }]
        };
      }
    }
    const commandFieldCompletions = this.provideHookCommandFieldCompletions(model, position, hooksMap, target);
    if (commandFieldCompletions) {
      return commandFieldCompletions;
    }
    const suggestions = [];
    const hooksByTarget = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];
    const lineText = model.getLineContent(position.lineNumber);
    const firstNonWhitespace = lineText.search(/\S/);
    const isEmptyLine = firstNonWhitespace === -1;
    const rangeStartColumn = isEmptyLine ? position.column : firstNonWhitespace + 1;
    const existingKeys = new Set(
      hooksMap.properties.filter((p) => p.key.range.startLineNumber !== position.lineNumber).map((p) => p.key.value)
    );
    const expectedIndent = hooksMap.properties.length > 0 ? hooksMap.properties[0].key.range.startColumn - 1 : -1;
    if (expectedIndent >= 0) {
      const scanEnd = model.getLineCount();
      for (let lineNum = hooksMap.range.endLineNumber + 1; lineNum <= scanEnd; lineNum++) {
        if (lineNum === position.lineNumber) {
          continue;
        }
        const lt = model.getLineContent(lineNum);
        const lineIndent = lt.search(/\S/);
        if (lineIndent === -1) {
          continue;
        }
        if (lineIndent < expectedIndent) {
          break;
        }
        if (lineIndent === expectedIndent) {
          const match = lt.match(/^\s+(\S+)\s*:/);
          if (match) {
            existingKeys.add(match[1]);
          }
        }
      }
    }
    const lineHasColon = lineText.indexOf(":") !== -1;
    for (const [hookName, hookType] of Object.entries(hooksByTarget)) {
      if (existingKeys.has(hookName)) {
        continue;
      }
      const meta = HOOK_METADATA[hookType];
      let insertText;
      if (isEmptyLine) {
        insertText = [
          `${hookName}:`,
          `  - type: command`,
          `    command: "$1"`
        ].join("\n");
      } else if (lineHasColon) {
        insertText = `${hookName}:`;
      } else {
        insertText = hookName;
      }
      suggestions.push({
        label: hookName,
        documentation: meta?.description,
        kind: CompletionItemKind.Property,
        insertText,
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        range: new Range(position.lineNumber, rangeStartColumn, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
      });
    }
    return { suggestions };
  }
  /**
   * Provides completions for hook command fields (type, command, windows, etc.)
   * when the cursor is inside a command object within the hooks map.
   * Detects nesting by checking if the position falls within a sequence item
   * of a hook event's value.
   */
  provideHookCommandFieldCompletions(model, position, hooksMap, target) {
    const containingCommandMap = this.findContainingCommandMap(model, position, hooksMap);
    if (!containingCommandMap) {
      return void 0;
    }
    const isCopilotCli = target === Target.GitHubCopilot;
    const validFields = isCopilotCli ? ["type", "bash", "powershell", "cwd", "env", "timeoutSec"] : ["type", "command", "windows", "linux", "osx", "bash", "powershell", "cwd", "env", "timeout"];
    const existingFields = new Set(
      containingCommandMap.properties.filter((p) => p.key.range.startLineNumber !== position.lineNumber).map((p) => p.key.value)
    );
    const lineText = model.getLineContent(position.lineNumber);
    const firstNonWhitespace = lineText.search(/\S/);
    const isEmptyLine = firstNonWhitespace === -1;
    const dashPrefixMatch = lineText.match(/^(\s*-\s+)/);
    const fieldStart = dashPrefixMatch ? dashPrefixMatch[1].length : firstNonWhitespace;
    const rangeStartColumn = isEmptyLine ? position.column : fieldStart + 1;
    const colonIndex = lineText.indexOf(":");
    const suggestions = [];
    for (const fieldName of validFields) {
      if (existingFields.has(fieldName)) {
        continue;
      }
      const desc = HOOK_COMMAND_FIELD_DESCRIPTIONS[fieldName];
      const insertText = colonIndex !== -1 ? fieldName : `${fieldName}: $0`;
      suggestions.push({
        label: fieldName,
        documentation: desc,
        kind: CompletionItemKind.Property,
        insertText,
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        range: new Range(position.lineNumber, rangeStartColumn, position.lineNumber, colonIndex !== -1 ? colonIndex + 1 : model.getLineMaxColumn(position.lineNumber))
      });
    }
    return suggestions.length > 0 ? { suggestions } : void 0;
  }
  /**
   * Walks the hooks map AST to find the command map object containing the position.
   * Handles both direct command objects and nested matcher format.
   * Also handles trailing lines after the last parsed property of a command map.
   */
  findContainingCommandMap(model, position, hooksMap) {
    for (let i = 0; i < hooksMap.properties.length; i++) {
      const prop = hooksMap.properties[i];
      if (prop.value.type !== "sequence") {
        continue;
      }
      const seqRange = prop.value.range;
      const nextProp = hooksMap.properties[i + 1];
      const isInSeq = seqRange.containsPosition(position);
      const isTrailingSeq = !isInSeq && seqRange.endLineNumber < position.lineNumber && (!nextProp || nextProp.key.range.startLineNumber > position.lineNumber);
      if (isInSeq || isTrailingSeq) {
        if (isTrailingSeq) {
          const lineText = model.getLineContent(position.lineNumber);
          const firstNonWs = lineText.search(/\S/);
          const effectiveIndent = firstNonWs === -1 ? position.column - 1 : firstNonWs;
          const hookKeyIndent = prop.key.range.startColumn - 1;
          if (effectiveIndent <= hookKeyIndent) {
            continue;
          }
        }
        const result = this.findCommandMapInSequence(position, prop.value);
        if (result) {
          return result;
        }
      }
    }
    return void 0;
  }
  findCommandMapInSequence(position, sequence) {
    for (let i = 0; i < sequence.items.length; i++) {
      const item = sequence.items[i];
      if (item.type !== "map") {
        if (item.type === "scalar" && item.range.startLineNumber === position.lineNumber) {
          return { type: "map", properties: [], range: item.range };
        }
        continue;
      }
      const isInRange = item.range.containsPosition(position);
      const isTrailing = !isInRange && item.range.endLineNumber < position.lineNumber && (i + 1 >= sequence.items.length || sequence.items[i + 1].range.startLineNumber > position.lineNumber);
      if (!isInRange && !isTrailing) {
        continue;
      }
      const nestedHooks = item.properties.find((p) => p.key.value === "hooks");
      if (nestedHooks?.value.type === "sequence") {
        const result = this.findCommandMapInSequence(position, nestedHooks.value);
        if (result) {
          return result;
        }
      }
      return item;
    }
    return void 0;
  }
  async getValueSuggestions(promptType, attribute, target) {
    const attributeDesc = getAttributeDefinition(attribute, promptType, target);
    if (attributeDesc?.enums) {
      return attributeDesc.enums;
    }
    if (attributeDesc?.defaults) {
      return attributeDesc.defaults.map((value) => ({ name: value }));
    }
    switch (attribute) {
      case PromptHeaderAttributes.agent:
      case PromptHeaderAttributes.mode:
        if (promptType === PromptsType.prompt) {
          const agents = await this.chatModeService.getLocalModes();
          const suggestions = [];
          for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
            suggestions.push({ name: agent.name.get(), description: agent.label.get() });
          }
          return suggestions;
        }
        break;
      case PromptHeaderAttributes.model:
        if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
          return this.getModelNames(promptType === PromptsType.agent);
        }
        break;
    }
    return [];
  }
  getModelNames(agentModeOnly) {
    const result = [];
    for (const model of this.languageModelsService.getLanguageModelIds()) {
      const metadata = this.languageModelsService.lookupLanguageModel(model);
      if (metadata && metadata.isUserSelectable !== false && !metadata.targetChatSessionType) {
        if (!agentModeOnly || ILanguageModelChatMetadata.suitableForAgentMode(metadata)) {
          result.push({
            name: ILanguageModelChatMetadata.asQualifiedName(metadata),
            description: metadata.tooltip
          });
        }
      }
    }
    return result;
  }
  async provideArrayCompletions(model, position, arrayValue, getValues) {
    const getSuggestions = async (toolRange, currentItem) => {
      const suggestions = [];
      const entries = await getValues();
      const quotePreference = getQuotePreference(arrayValue, model);
      const existingValues = new Set(arrayValue.items.filter((item) => item !== currentItem).filter((item) => item.type === "scalar").map((item) => item.value));
      for (const entry of entries) {
        const entryName = entry.name;
        if (existingValues.has(entryName)) {
          continue;
        }
        let insertText;
        if (!toolRange.isEmpty()) {
          const firstChar = model.getValueInRange(toolRange).charCodeAt(0);
          insertText = firstChar === CharCode.SingleQuote ? `'${entryName}'` : firstChar === CharCode.DoubleQuote ? `"${entryName}"` : entryName;
        } else {
          insertText = formatArrayValue(entryName, quotePreference);
        }
        suggestions.push({
          label: entryName,
          documentation: entry.description,
          kind: CompletionItemKind.Value,
          filterText: insertText,
          insertText,
          range: toolRange
        });
      }
      return { suggestions };
    };
    for (const item of arrayValue.items) {
      if (item.range.containsPosition(position)) {
        return await getSuggestions(item.range, item);
      }
    }
    const prefix = model.getValueInRange(new Range(position.lineNumber, 1, position.lineNumber, position.column));
    if (prefix.match(/[:,[]\s*$/)) {
      return await getSuggestions(new Range(position.lineNumber, position.column, position.lineNumber, position.column));
    }
    return void 0;
  }
};
PromptHeaderAutocompletion = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, ILanguageModelsService),
  __decorateParam(2, ILanguageModelToolsService),
  __decorateParam(3, IChatModeService),
  __decorateParam(4, IWorkbenchEnvironmentService)
], PromptHeaderAutocompletion);
export {
  PromptHeaderAutocompletion
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxsYW5ndWFnZVByb3ZpZGVyc1xccHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25Db250ZXh0LCBDb21wbGV0aW9uSXRlbSwgQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZSwgQ29tcGxldGlvbkl0ZW1LaW5kLCBDb21wbGV0aW9uSXRlbVByb3ZpZGVyLCBDb21wbGV0aW9uTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgZ2V0UHJvbXB0c1R5cGVGb3JMYW5ndWFnZUlkLCBQcm9tcHRzVHlwZSwgVGFyZ2V0IH0gZnJvbSAnLi4vcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElNYXBWYWx1ZSwgSVNlcXVlbmNlVmFsdWUsIElWYWx1ZSwgSUhlYWRlckF0dHJpYnV0ZSwgcGFyc2VDb21tYVNlcGFyYXRlZExpc3QsIFByb21wdEhlYWRlciwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcyB9IGZyb20gJy4uL3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgZ2V0QXR0cmlidXRlRGVmaW5pdGlvbiwgZ2V0VGFyZ2V0LCBnZXRWYWxpZEF0dHJpYnV0ZU5hbWVzLCBrbm93bkNsYXVkZVRvb2xzLCBrbm93bkdpdGh1YkNvcGlsb3RUb29scywgSVZhbHVlRW50cnksIENsYXVkZUhlYWRlckF0dHJpYnV0ZXMsIH0gZnJvbSAnLi9wcm9tcHRGaWxlQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBmb3JtYXRBcnJheVZhbHVlLCBnZXRRdW90ZVByZWZlcmVuY2UgfSBmcm9tICcuLi91dGlscy9wcm9tcHRFZGl0SGVscGVyLmpzJztcbmltcG9ydCB7IEhPT0tTX0JZX1RBUkdFVCwgSE9PS19NRVRBREFUQSB9IGZyb20gJy4uL2hvb2tUeXBlcy5qcyc7XG5pbXBvcnQgeyBIT09LX0NPTU1BTkRfRklFTERfREVTQ1JJUFRJT05TIH0gZnJvbSAnLi4vaG9va1NjaGVtYS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBQcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbiBpbXBsZW1lbnRzIENvbXBsZXRpb25JdGVtUHJvdmlkZXIge1xuXHQvKipcblx0ICogRGVidWcgZGlzcGxheSBuYW1lIGZvciB0aGlzIHByb3ZpZGVyLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IF9kZWJ1Z0Rpc3BsYXlOYW1lOiBzdHJpbmcgPSAnUHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24nO1xuXG5cdC8qKlxuXHQgKiBMaXN0IG9mIHRyaWdnZXIgY2hhcmFjdGVycyBoYW5kbGVkIGJ5IHRoaXMgcHJvdmlkZXIuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgdHJpZ2dlckNoYXJhY3RlcnMgPSBbJzonXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb21wdHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUNoYXRNb2RlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRNb2RlU2VydmljZTogSUNoYXRNb2RlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG1haW4gZnVuY3Rpb24gb2YgdGhpcyBwcm92aWRlciB0aGF0IGNhbGN1bGF0ZXNcblx0ICogY29tcGxldGlvbiBpdGVtcyBiYXNlZCBvbiB0aGUgcHJvdmlkZWQgYXJndW1lbnRzLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cG9zaXRpb246IFBvc2l0aW9uLFxuXHRcdGNvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTxDb21wbGV0aW9uTGlzdCB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgcHJvbXB0VHlwZSA9IGdldFByb21wdHNUeXBlRm9yTGFuZ3VhZ2VJZChtb2RlbC5nZXRMYW5ndWFnZUlkKCkpO1xuXHRcdGlmICghcHJvbXB0VHlwZSkge1xuXHRcdFx0Ly8gaWYgdGhlIG1vZGVsIGlzIG5vdCBhIHByb21wdCwgd2UgZG9uJ3QgcHJvdmlkZSBhbnkgY29tcGxldGlvbnNcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKC9eXFxzKiQvLnRlc3QobW9kZWwuZ2V0VmFsdWUoKSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24uYWRkSGVhZGVyJywgXCJBZGQgUHJvbXB0IEhlYWRlclwiKSxcblx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCxcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiBbXG5cdFx0XHRcdFx0XHRgLS0tYCxcblx0XHRcdFx0XHRcdGBkZXNjcmlwdGlvbjogJDFgLFxuXHRcdFx0XHRcdFx0YC0tLWAsXG5cdFx0XHRcdFx0XHRgJDBgXG5cdFx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdFx0XHRpbnNlcnRUZXh0UnVsZXM6IENvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuSW5zZXJ0QXNTbmlwcGV0LFxuXHRcdFx0XHRcdHJhbmdlOiBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLFxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblx0XHR9XG5cblxuXHRcdGNvbnN0IHBhcnNlZEFTVCA9IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0UGFyc2VkUHJvbXB0RmlsZShtb2RlbCk7XG5cdFx0Y29uc3QgaGVhZGVyID0gcGFyc2VkQVNULmhlYWRlcjtcblx0XHRpZiAoIWhlYWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJSYW5nZSA9IHBhcnNlZEFTVC5oZWFkZXIucmFuZ2U7XG5cdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPCBoZWFkZXJSYW5nZS5zdGFydExpbmVOdW1iZXIgfHwgcG9zaXRpb24ubGluZU51bWJlciA+PSBoZWFkZXJSYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBpZiB0aGUgcG9zaXRpb24gaXMgbm90IGluc2lkZSB0aGUgaGVhZGVyLCB3ZSBkb24ndCBwcm92aWRlIGFueSBjb21wbGV0aW9uc1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGNvbG9uSW5kZXggPSBsaW5lVGV4dC5pbmRleE9mKCc6Jyk7XG5cdFx0Y29uc3QgY29sb25Qb3NpdGlvbiA9IGNvbG9uSW5kZXggIT09IC0xID8gbmV3IFBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIGNvbG9uSW5kZXggKyAxKSA6IHVuZGVmaW5lZDtcblxuXHRcdGlmICghY29sb25Qb3NpdGlvbiB8fCBwb3NpdGlvbi5pc0JlZm9yZU9yRXF1YWwoY29sb25Qb3NpdGlvbikpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoZSBwb3NpdGlvbiBpcyBpbnNpZGUgYSBtdWx0aS1saW5lIGF0dHJpYnV0ZSAoZS5nLiwgaG9va3MgbWFwKS5cblx0XHRcdC8vIEluIHRoYXQgY2FzZSwgcHJvdmlkZSB2YWx1ZSBjb21wbGV0aW9ucyBmb3IgdGhhdCBhdHRyaWJ1dGUgaW5zdGVhZCBvZiBhdHRyaWJ1dGUgbmFtZSBjb21wbGV0aW9ucy5cblx0XHRcdGxldCBjb250YWluaW5nQXR0cmlidXRlID0gaGVhZGVyLmF0dHJpYnV0ZXMuZmluZCgoeyByYW5nZSB9KSA9PlxuXHRcdFx0XHRyYW5nZS5zdGFydExpbmVOdW1iZXIgPCBwb3NpdGlvbi5saW5lTnVtYmVyICYmIHBvc2l0aW9uLmxpbmVOdW1iZXIgPD0gcmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRpZiAoIWNvbnRhaW5pbmdBdHRyaWJ1dGUpIHtcblx0XHRcdFx0Ly8gSGFuZGxlIHRyYWlsaW5nIGVtcHR5IGxpbmVzIGFmdGVyIGEgbWFwLXZhbHVlZCBhdHRyaWJ1dGU6XG5cdFx0XHRcdC8vIFRoZSBZQU1MIHBhcnNlcidzIHJhbmdlIGVuZHMgYXQgdGhlIGxhc3QgcGFyc2VkIGNoaWxkLCBidXQgbG9naWNhbGx5XG5cdFx0XHRcdC8vIGFuIGVtcHR5IGxpbmUgYmVmb3JlIHRoZSBuZXh0IGF0dHJpYnV0ZSBzdGlsbCBiZWxvbmdzIHRvIHRoZSBtYXAuXG5cdFx0XHRcdGZvciAobGV0IGkgPSBoZWFkZXIuYXR0cmlidXRlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdGNvbnN0IGF0dHIgPSBoZWFkZXIuYXR0cmlidXRlc1tpXTtcblx0XHRcdFx0XHRpZiAoYXR0ci5yYW5nZS5lbmRMaW5lTnVtYmVyIDwgcG9zaXRpb24ubGluZU51bWJlciAmJiBhdHRyLnZhbHVlLnR5cGUgPT09ICdtYXAnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXh0QXR0ciA9IGhlYWRlci5hdHRyaWJ1dGVzW2kgKyAxXTtcblx0XHRcdFx0XHRcdGNvbnN0IG5leHRTdGFydExpbmUgPSBuZXh0QXR0ciA/IG5leHRBdHRyLnJhbmdlLnN0YXJ0TGluZU51bWJlciA6IGhlYWRlclJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA8IG5leHRTdGFydExpbmUpIHtcblx0XHRcdFx0XHRcdFx0Y29udGFpbmluZ0F0dHJpYnV0ZSA9IGF0dHI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChjb250YWluaW5nQXR0cmlidXRlKSB7XG5cdFx0XHRcdGNvbnN0IGF0dHJMaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KGNvbnRhaW5pbmdBdHRyaWJ1dGUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3QgYXR0ckNvbG9uSW5kZXggPSBhdHRyTGluZVRleHQuaW5kZXhPZignOicpO1xuXHRcdFx0XHRpZiAoYXR0ckNvbG9uSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZVZhbHVlQ29tcGxldGlvbnMobW9kZWwsIHBvc2l0aW9uLCBoZWFkZXIsIG5ldyBQb3NpdGlvbihjb250YWluaW5nQXR0cmlidXRlLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgYXR0ckNvbG9uSW5kZXggKyAxKSwgcHJvbXB0VHlwZSwgY29udGFpbmluZ0F0dHJpYnV0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLnByb3ZpZGVBdHRyaWJ1dGVOYW1lQ29tcGxldGlvbnMobW9kZWwsIHBvc2l0aW9uLCBoZWFkZXIsIGNvbG9uUG9zaXRpb24sIHByb21wdFR5cGUpO1xuXHRcdH0gZWxzZSBpZiAoY29sb25Qb3NpdGlvbiAmJiBjb2xvblBvc2l0aW9uLmlzQmVmb3JlKHBvc2l0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZVZhbHVlQ29tcGxldGlvbnMobW9kZWwsIHBvc2l0aW9uLCBoZWFkZXIsIGNvbG9uUG9zaXRpb24sIHByb21wdFR5cGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHByaXZhdGUgYXN5bmMgcHJvdmlkZUF0dHJpYnV0ZU5hbWVDb21wbGV0aW9ucyhcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRwb3NpdGlvbjogUG9zaXRpb24sXG5cdFx0aGVhZGVyOiBQcm9tcHRIZWFkZXIsXG5cdFx0Y29sb25Qb3NpdGlvbjogUG9zaXRpb24gfCB1bmRlZmluZWQsXG5cdFx0cHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsXG5cdCk6IFByb21pc2U8Q29tcGxldGlvbkxpc3QgfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdID0gW107XG5cblx0XHRjb25zdCB0YXJnZXQgPSBnZXRUYXJnZXQocHJvbXB0VHlwZSwgaGVhZGVyKTtcblx0XHRjb25zdCBhdHRyaWJ1dGVzVG9Qcm9wb3NlID0gbmV3IFNldChnZXRWYWxpZEF0dHJpYnV0ZU5hbWVzKHByb21wdFR5cGUsIGZhbHNlLCB0YXJnZXQpKTtcblx0XHRmb3IgKGNvbnN0IGF0dHIgb2YgaGVhZGVyLmF0dHJpYnV0ZXMpIHtcblx0XHRcdGF0dHJpYnV0ZXNUb1Byb3Bvc2UuZGVsZXRlKGF0dHIua2V5KTtcblx0XHR9XG5cdFx0Y29uc3QgZ2V0SW5zZXJ0VGV4dCA9IGFzeW5jIChrZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG5cdFx0XHRpZiAoY29sb25Qb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4ga2V5O1xuXHRcdFx0fVxuXHRcdFx0Ly8gRm9yIG1hcC12YWx1ZWQgYXR0cmlidXRlcywgaW5zZXJ0IGEgc25pcHBldCB3aXRoIHRoZSBuZXN0ZWQgc3RydWN0dXJlXG5cdFx0XHRpZiAoa2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmhvb2tzICYmIHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50ICYmIHRhcmdldCAhPT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdFx0XHRjb25zdCBob29rTmFtZXMgPSBPYmplY3Qua2V5cyhIT09LU19CWV9UQVJHRVRbdGFyZ2V0XSA/PyBIT09LU19CWV9UQVJHRVRbVGFyZ2V0LlVuZGVmaW5lZF0pO1xuXHRcdFx0XHRyZXR1cm4gYCR7a2V5fTpcXG4gIFxcJHsxfCR7aG9va05hbWVzLmpvaW4oJywnKX18fTpcXG4gICAgLSB0eXBlOiBjb21tYW5kXFxuICAgICAgY29tbWFuZDogXCIkMlwiYDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZhbHVlU3VnZ2VzdGlvbnMgPSBhd2FpdCB0aGlzLmdldFZhbHVlU3VnZ2VzdGlvbnMocHJvbXB0VHlwZSwga2V5LCB0YXJnZXQpO1xuXHRcdFx0aWYgKHZhbHVlU3VnZ2VzdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gYCR7a2V5fTogXFwkezA6JHt2YWx1ZVN1Z2dlc3Rpb25zWzBdLm5hbWV9fWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gYCR7a2V5fTogXFwkMGA7XG5cdFx0XHR9XG5cdFx0fTtcblxuXG5cdFx0Zm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgYXR0cmlidXRlc1RvUHJvcG9zZSkge1xuXHRcdFx0Y29uc3QgaXRlbTogQ29tcGxldGlvbkl0ZW0gPSB7XG5cdFx0XHRcdGxhYmVsOiBhdHRyaWJ1dGUsXG5cdFx0XHRcdGRvY3VtZW50YXRpb246IGdldEF0dHJpYnV0ZURlZmluaXRpb24oYXR0cmlidXRlLCBwcm9tcHRUeXBlLCB0YXJnZXQpPy5kZXNjcmlwdGlvbixcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5LFxuXHRcdFx0XHRpbnNlcnRUZXh0OiBhd2FpdCBnZXRJbnNlcnRUZXh0KGF0dHJpYnV0ZSksXG5cdFx0XHRcdGluc2VydFRleHRSdWxlczogQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgMSwgcG9zaXRpb24ubGluZU51bWJlciwgIWNvbG9uUG9zaXRpb24gPyBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpIDogY29sb25Qb3NpdGlvbi5jb2x1bW4pLFxuXHRcdFx0fTtcblx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goaXRlbSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgc3VnZ2VzdGlvbnMgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvdmlkZVZhbHVlQ29tcGxldGlvbnMoXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cG9zaXRpb246IFBvc2l0aW9uLFxuXHRcdGhlYWRlcjogUHJvbXB0SGVhZGVyLFxuXHRcdGNvbG9uUG9zaXRpb246IFBvc2l0aW9uLFxuXHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLFxuXHRcdHByZUZvdW5kQXR0cmlidXRlPzogSUhlYWRlckF0dHJpYnV0ZSxcblx0KTogUHJvbWlzZTxDb21wbGV0aW9uTGlzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdFx0Y29uc3QgcG9zTGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gcHJlRm91bmRBdHRyaWJ1dGUgPz8gaGVhZGVyLmF0dHJpYnV0ZXMuZmluZCgoeyByYW5nZSB9KSA9PiByYW5nZS5zdGFydExpbmVOdW1iZXIgPD0gcG9zTGluZU51bWJlciAmJiBwb3NMaW5lTnVtYmVyIDw9IHJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0YXJnZXQgPSBnZXRUYXJnZXQocHJvbXB0VHlwZSwgaGVhZGVyKTtcblx0XHRpZiAoIWdldFZhbGlkQXR0cmlidXRlTmFtZXMocHJvbXB0VHlwZSwgdHJ1ZSwgdGFyZ2V0KS5pbmNsdWRlcyhhdHRyaWJ1dGUua2V5KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0IHx8IHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KSB7XG5cdFx0XHRpZiAoYXR0cmlidXRlLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlbCkge1xuXHRcdFx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgPT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdFx0XHQvLyBpZiB0aGUgcG9zaXRpb24gaXMgaW5zaWRlIHRoZSB0b29scyBtZXRhZGF0YSwgd2UgcHJvdmlkZSB0b29sIG5hbWUgY29tcGxldGlvbnNcblx0XHRcdFx0XHRjb25zdCBnZXRWYWx1ZXMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBrbm93bkNsYXVkZVRvb2xzO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0TW9kZWxOYW1lcyhwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5wcm92aWRlQXJyYXlDb21wbGV0aW9ucyhtb2RlbCwgcG9zaXRpb24sIGF0dHJpYnV0ZS52YWx1ZSwgZ2V0VmFsdWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGF0dHJpYnV0ZS5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMudG9vbHMgfHwgYXR0cmlidXRlLmtleSA9PT0gQ2xhdWRlSGVhZGVyQXR0cmlidXRlcy5kaXNhbGxvd2VkVG9vbHMpIHtcblx0XHRcdFx0bGV0IHZhbHVlID0gYXR0cmlidXRlLnZhbHVlO1xuXHRcdFx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0XHR2YWx1ZSA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRcdC8vIGlmIHRoZSBwb3NpdGlvbiBpcyBpbnNpZGUgdGhlIHRvb2xzIG1ldGFkYXRhLCB3ZSBwcm92aWRlIHRvb2wgbmFtZSBjb21wbGV0aW9uc1xuXHRcdFx0XHRcdGNvbnN0IGdldFZhbHVlcyA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5HaXRIdWJDb3BpbG90IHx8IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0XHRcdFx0Ly8gZm9yIEdpdEh1YiBDb3BpbG90IHRhcmdldHMgYW5kIHRoZSBTZXNzaW9ucyBXaW5kb3csIHdlIG9ubHkgc3VnZ2VzdCB0aGUga25vd24gc2V0IG9mIHRvb2xzIHRoYXQgYXJlIHN1cHBvcnRlZCBieSBHaXRIdWIgQ29waWxvdCwgaW5zdGVhZCBvZiBhbGwgdG9vbHMgdGhhdCB0aGUgdXNlciBoYXMgZGVmaW5lZCwgYmVjYXVzZSBtYW55IHRvb2xzIHdvbid0IHdvcmsgaW4gdGhlc2UgY29udGV4dHMgYW5kIGl0IHdvdWxkIGJlIGZydXN0cmF0aW5nIGZvciB1c2VycyB0byBzZWxlY3QgYSB0b29sIHRoYXQgZG9lc24ndCB3b3JrXG5cdFx0XHRcdFx0XHRcdHJldHVybiBrbm93bkdpdGh1YkNvcGlsb3RUb29scztcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBrbm93bkNsYXVkZVRvb2xzO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lcygpKS5tYXAobmFtZSA9PiAoeyBuYW1lIH0pKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnByb3ZpZGVBcnJheUNvbXBsZXRpb25zKG1vZGVsLCBwb3NpdGlvbiwgdmFsdWUsIGdldFZhbHVlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZS5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnRzKSB7XG5cdFx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgPT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZUFycmF5Q29tcGxldGlvbnMobW9kZWwsIHBvc2l0aW9uLCBhdHRyaWJ1dGUudmFsdWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5maWx0ZXIoYSA9PiBhLmVuYWJsZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZS5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaG9va3MpIHtcblx0XHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSA9PT0gJ21hcCcpIHtcblx0XHRcdFx0Ly8gSW5zaWRlIHRoZSBob29rcyBtYXAgXHUyMDE0IHN1Z2dlc3QgaG9vayBldmVudCB0eXBlIG5hbWVzIGFzIHN1Yi1rZXlzXG5cdFx0XHRcdHJldHVybiB0aGlzLnByb3ZpZGVIb29rRXZlbnRDb21wbGV0aW9ucyhtb2RlbCwgcG9zaXRpb24sIGF0dHJpYnV0ZS52YWx1ZSwgdGFyZ2V0KTtcblx0XHRcdH1cblx0XHRcdC8vIFdoZW4gaG9va3MgdmFsdWUgaXMgbm90IHlldCBhIG1hcCAoZS5nLiwgdXNlciBpcyBtaWQtZWRpdCBvbiBhIG5lc3RlZCBsaW5lKSxcblx0XHRcdC8vIHN0aWxsIHByb3ZpZGUgaG9vayBldmVudCBjb21wbGV0aW9ucyB3aXRoIG5vIGV4aXN0aW5nIGtleXMuXG5cdFx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciAhPT0gYXR0cmlidXRlLnJhbmdlLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0XHRjb25zdCBlbXB0eU1hcDogSU1hcFZhbHVlID0geyB0eXBlOiAnbWFwJywgcHJvcGVydGllczogW10sIHJhbmdlOiBhdHRyaWJ1dGUudmFsdWUucmFuZ2UgfTtcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZUhvb2tFdmVudENvbXBsZXRpb25zKG1vZGVsLCBwb3NpdGlvbiwgZW1wdHlNYXAsIHRhcmdldCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoYXR0cmlidXRlLnJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3Qgd2hpbGVzcGFjZUFmdGVyQ29sb24gPSAobGluZUNvbnRlbnQuc3Vic3RyaW5nKGNvbG9uUG9zaXRpb24uY29sdW1uKS5tYXRjaCgvXlxccyovKT8uWzBdLmxlbmd0aCkgPz8gMDtcblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgdGhpcy5nZXRWYWx1ZVN1Z2dlc3Rpb25zKHByb21wdFR5cGUsIGF0dHJpYnV0ZS5rZXksIHRhcmdldCk7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBpdGVtOiBDb21wbGV0aW9uSXRlbSA9IHtcblx0XHRcdFx0bGFiZWw6IGVudHJ5Lm5hbWUsXG5cdFx0XHRcdGRvY3VtZW50YXRpb246IGVudHJ5LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVmFsdWUsXG5cdFx0XHRcdGluc2VydFRleHQ6IHdoaWxlc3BhY2VBZnRlckNvbG9uID09PSAwID8gYCAke2VudHJ5Lm5hbWV9YCA6IGVudHJ5Lm5hbWUsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgY29sb25Qb3NpdGlvbi5jb2x1bW4gKyB3aGlsZXNwYWNlQWZ0ZXJDb2xvbiArIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcikpLFxuXHRcdFx0fTtcblx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goaXRlbSk7XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGUua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmhhbmRPZmZzKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgIC0gbGFiZWw6IFN0YXJ0IEltcGxlbWVudGF0aW9uJyxcblx0XHRcdFx0JyAgICBhZ2VudDogYWdlbnQnLFxuXHRcdFx0XHQnICAgIHByb21wdDogSW1wbGVtZW50IHRoZSBwbGFuJyxcblx0XHRcdFx0JyAgICBzZW5kOiB0cnVlJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGl0ZW06IENvbXBsZXRpb25JdGVtID0ge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Byb21wdEhlYWRlckF1dG9jb21wbGV0aW9uLmhhbmRvZmZzRXhhbXBsZScsIFwiSGFuZG9mZiBFeGFtcGxlXCIpLFxuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVmFsdWUsXG5cdFx0XHRcdGluc2VydFRleHQ6IHdoaWxlc3BhY2VBZnRlckNvbG9uID09PSAwID8gYCAke3ZhbHVlfWAgOiB2YWx1ZSxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBjb2xvblBvc2l0aW9uLmNvbHVtbiArIHdoaWxlc3BhY2VBZnRlckNvbG9uICsgMSwgcG9zaXRpb24ubGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKSksXG5cdFx0XHR9O1xuXHRcdFx0c3VnZ2VzdGlvbnMucHVzaChpdGVtKTtcblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZS5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaG9va3MgJiYgcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpIHtcblx0XHRcdGNvbnN0IGhvb2tTbmlwcGV0ID0gW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgJHsxfCcgKyBPYmplY3Qua2V5cyhIT09LU19CWV9UQVJHRVRbdGFyZ2V0XSA/PyBIT09LU19CWV9UQVJHRVRbVGFyZ2V0LlVuZGVmaW5lZF0pLmpvaW4oJywnKSArICd8fTonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBcIiQyXCInXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaXRlbTogQ29tcGxldGlvbkl0ZW0gPSB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24ubmV3SG9vaycsIFwiTmV3IEhvb2tcIiksXG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0LFxuXHRcdFx0XHRpbnNlcnRUZXh0OiB3aGlsZXNwYWNlQWZ0ZXJDb2xvbiA9PT0gMCA/IGAgJHtob29rU25pcHBldH1gIDogaG9va1NuaXBwZXQsXG5cdFx0XHRcdGluc2VydFRleHRSdWxlczogQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgY29sb25Qb3NpdGlvbi5jb2x1bW4gKyB3aGlsZXNwYWNlQWZ0ZXJDb2xvbiArIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcikpLFxuXHRcdFx0fTtcblx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goaXRlbSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHN1Z2dlc3Rpb25zIH07XG5cdH1cblxuXHQvKipcblx0ICogUHJvdmlkZXMgY29tcGxldGlvbnMgaW5zaWRlIHRoZSBgaG9va3M6YCBtYXAuXG5cdCAqIERldGVybWluZXMgd2hhdCB0byBzdWdnZXN0IGJhc2VkIG9uIG5lc3RpbmcgZGVwdGg6XG5cdCAqIC0gQXQgaG9vayBldmVudCBsZXZlbDogc3VnZ2VzdCBldmVudCBuYW1lcyAoU2Vzc2lvblN0YXJ0LCBQcmVUb29sVXNlLCBldGMuKVxuXHQgKiAtIEluc2lkZSBhIGNvbW1hbmQgb2JqZWN0OiBzdWdnZXN0IGNvbW1hbmQgZmllbGRzICh0eXBlLCBjb21tYW5kLCB0aW1lb3V0LCBldGMuKVxuXHQgKi9cblx0cHJpdmF0ZSBwcm92aWRlSG9va0V2ZW50Q29tcGxldGlvbnMoXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cG9zaXRpb246IFBvc2l0aW9uLFxuXHRcdGhvb2tzTWFwOiBJTWFwVmFsdWUsXG5cdFx0dGFyZ2V0OiBUYXJnZXQsXG5cdCk6IENvbXBsZXRpb25MaXN0IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBDaGVjayBpZiB0aGUgY3Vyc29yIGlzIG9uIHRoZSB2YWx1ZSBzaWRlIG9mIGFuIGV4aXN0aW5nIGhvb2sgZXZlbnQga2V5IChlLmcuLCBcIlNlc3Npb25FbmQ6fFwiKVxuXHRcdC8vIEluIHRoYXQgY2FzZSwgb2ZmZXIgYSBjb21tYW5kIGVudHJ5IHNuaXBwZXQgaW5zdGVhZCBvZiBldmVudCBuYW1lIGNvbXBsZXRpb25zLlxuXHRcdGNvbnN0IGhvb2tFdmVudE9uTGluZSA9IGhvb2tzTWFwLnByb3BlcnRpZXMuZmluZChwID0+IHAua2V5LnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gcG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0aWYgKGhvb2tFdmVudE9uTGluZSkge1xuXHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGNvbG9uSWR4ID0gbGluZVRleHQuaW5kZXhPZignOicpO1xuXHRcdFx0aWYgKGNvbG9uSWR4ICE9PSAtMSAmJiBwb3NpdGlvbi5jb2x1bW4gPiBjb2xvbklkeCArIDEpIHtcblx0XHRcdFx0Y29uc3Qgd2hpbGVzcGFjZUFmdGVyQ29sb24gPSAobGluZVRleHQuc3Vic3RyaW5nKGNvbG9uSWR4ICsgMSkubWF0Y2goL15cXHMqLyk/LlswXS5sZW5ndGgpID8/IDA7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTbmlwcGV0ID0gW1xuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCcgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdFx0JyAgICBjb21tYW5kOiBcIiQxXCInLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbi5uZXdDb21tYW5kJywgXCJOZXcgQ29tbWFuZFwiKSxcblx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbi5uZXdDb21tYW5kLmRlc2NyaXB0aW9uJywgXCJBZGQgYSBuZXcgY29tbWFuZCBlbnRyeSB0byB0aGlzIGhvb2suXCIpLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiB3aGlsZXNwYWNlQWZ0ZXJDb2xvbiA9PT0gMCA/IGAgJHtjb21tYW5kU25pcHBldH1gIDogY29tbWFuZFNuaXBwZXQsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0UnVsZXM6IENvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuSW5zZXJ0QXNTbmlwcGV0LFxuXHRcdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBjb2xvbklkeCArIDEgKyB3aGlsZXNwYWNlQWZ0ZXJDb2xvbiArIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcikpLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IHRvIHByb3ZpZGUgY29tbWFuZCBmaWVsZCBjb21wbGV0aW9ucyBpZiBjdXJzb3IgaXMgaW5zaWRlIGEgY29tbWFuZCBvYmplY3Rcblx0XHRjb25zdCBjb21tYW5kRmllbGRDb21wbGV0aW9ucyA9IHRoaXMucHJvdmlkZUhvb2tDb21tYW5kRmllbGRDb21wbGV0aW9ucyhtb2RlbCwgcG9zaXRpb24sIGhvb2tzTWFwLCB0YXJnZXQpO1xuXHRcdGlmIChjb21tYW5kRmllbGRDb21wbGV0aW9ucykge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRGaWVsZENvbXBsZXRpb25zO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBwcm92aWRlIGhvb2sgZXZlbnQgbmFtZSBjb21wbGV0aW9uc1xuXHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdFx0Y29uc3QgaG9va3NCeVRhcmdldCA9IEhPT0tTX0JZX1RBUkdFVFt0YXJnZXRdID8/IEhPT0tTX0JZX1RBUkdFVFtUYXJnZXQuVW5kZWZpbmVkXTtcblxuXHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgZmlyc3ROb25XaGl0ZXNwYWNlID0gbGluZVRleHQuc2VhcmNoKC9cXFMvKTtcblx0XHRjb25zdCBpc0VtcHR5TGluZSA9IGZpcnN0Tm9uV2hpdGVzcGFjZSA9PT0gLTE7XG5cdFx0Ly8gU3RhcnQgdGhlIHJhbmdlIGFmdGVyIGxlYWRpbmcgd2hpdGVzcGFjZSBzbyBWUyBDb2RlJ3MgY29tcGxldGlvblxuXHRcdC8vIGZpbHRlcmluZyBtYXRjaGVzIHRoZSBob29rIG5hbWUgcHJlZml4IHRoZSB1c2VyIGhhcyB0eXBlZC5cblx0XHRjb25zdCByYW5nZVN0YXJ0Q29sdW1uID0gaXNFbXB0eUxpbmUgPyBwb3NpdGlvbi5jb2x1bW4gOiBmaXJzdE5vbldoaXRlc3BhY2UgKyAxO1xuXG5cdFx0Ly8gRXhjbHVkZSBob29rIGtleXMgb24gdGhlIGN1cnJlbnQgbGluZSBzbyB0aGUgdXNlciBzZWVzIGFsbCBvcHRpb25zIHdoaWxlIGVkaXRpbmcgYSBrZXlcblx0XHRjb25zdCBleGlzdGluZ0tleXMgPSBuZXcgU2V0KFxuXHRcdFx0aG9va3NNYXAucHJvcGVydGllc1xuXHRcdFx0XHQuZmlsdGVyKHAgPT4gcC5rZXkucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICE9PSBwb3NpdGlvbi5saW5lTnVtYmVyKVxuXHRcdFx0XHQubWFwKHAgPT4gcC5rZXkudmFsdWUpXG5cdFx0KTtcblxuXHRcdC8vIFN1cHBsZW1lbnQgd2l0aCB0ZXh0LWJhc2VkIHNjYW5uaW5nOiB3aGVuIGluY29tcGxldGUgWUFNTCBjYXVzZXMgdGhlXG5cdFx0Ly8gcGFyc2VyIHRvIGRyb3Agc3Vic2VxdWVudCBrZXlzLCBzY2FuIHRoZSBtb2RlbCBmb3IgbGluZXMgdGhhdCBsb29rXG5cdFx0Ly8gbGlrZSBob29rIGV2ZW50IGVudHJpZXMgKGUuZy4sIFwiICBVc2VyUHJvbXB0U3VibWl0OlwiKSBhdCB0aGUgZXhwZWN0ZWRcblx0XHQvLyBpbmRlbnRhdGlvbi5cblx0XHRjb25zdCBleHBlY3RlZEluZGVudCA9IGhvb2tzTWFwLnByb3BlcnRpZXMubGVuZ3RoID4gMFxuXHRcdFx0PyBob29rc01hcC5wcm9wZXJ0aWVzWzBdLmtleS5yYW5nZS5zdGFydENvbHVtbiAtIDFcblx0XHRcdDogLTE7XG5cdFx0aWYgKGV4cGVjdGVkSW5kZW50ID49IDApIHtcblx0XHRcdGNvbnN0IHNjYW5FbmQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGZvciAobGV0IGxpbmVOdW0gPSBob29rc01hcC5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMTsgbGluZU51bSA8PSBzY2FuRW5kOyBsaW5lTnVtKyspIHtcblx0XHRcdFx0aWYgKGxpbmVOdW0gPT09IHBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBsdCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW0pO1xuXHRcdFx0XHRjb25zdCBsaW5lSW5kZW50ID0gbHQuc2VhcmNoKC9cXFMvKTtcblx0XHRcdFx0aWYgKGxpbmVJbmRlbnQgPT09IC0xKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGxpbmVJbmRlbnQgPCBleHBlY3RlZEluZGVudCkge1xuXHRcdFx0XHRcdGJyZWFrOyAvLyBMZWZ0IHRoZSBob29rcyBtYXAgc2NvcGVcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobGluZUluZGVudCA9PT0gZXhwZWN0ZWRJbmRlbnQpIHtcblx0XHRcdFx0XHRjb25zdCBtYXRjaCA9IGx0Lm1hdGNoKC9eXFxzKyhcXFMrKVxccyo6Lyk7XG5cdFx0XHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdFx0XHRleGlzdGluZ0tleXMuYWRkKG1hdGNoWzFdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayB3aGV0aGVyIHRoZSBjdXJyZW50IGxpbmUgYWxyZWFkeSBoYXMgYSBjb2xvbiAoZWRpdGluZyBhbiBleGlzdGluZyBrZXkpXG5cdFx0Y29uc3QgbGluZUhhc0NvbG9uID0gbGluZVRleHQuaW5kZXhPZignOicpICE9PSAtMTtcblxuXHRcdGZvciAoY29uc3QgW2hvb2tOYW1lLCBob29rVHlwZV0gb2YgT2JqZWN0LmVudHJpZXMoaG9va3NCeVRhcmdldCkpIHtcblx0XHRcdGlmIChleGlzdGluZ0tleXMuaGFzKGhvb2tOYW1lKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1ldGEgPSBIT09LX01FVEFEQVRBW2hvb2tUeXBlXTtcblx0XHRcdGxldCBpbnNlcnRUZXh0OiBzdHJpbmc7XG5cdFx0XHRpZiAoaXNFbXB0eUxpbmUpIHtcblx0XHRcdFx0Ly8gT24gZW1wdHkgbGluZXMsIGluc2VydCBhIGZ1bGwgaG9vayBzbmlwcGV0IHdpdGggY29tbWFuZCBwbGFjZWhvbGRlclxuXHRcdFx0XHRpbnNlcnRUZXh0ID0gW1xuXHRcdFx0XHRcdGAke2hvb2tOYW1lfTpgLFxuXHRcdFx0XHRcdGAgIC0gdHlwZTogY29tbWFuZGAsXG5cdFx0XHRcdFx0YCAgICBjb21tYW5kOiBcIiQxXCJgLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0fSBlbHNlIGlmIChsaW5lSGFzQ29sb24pIHtcblx0XHRcdFx0Ly8gT24gZXhpc3Rpbmcga2V5IGxpbmVzLCBvbmx5IHJlcGxhY2UgdGhlIGtleSBuYW1lIHRvIHByZXNlcnZlIG5lc3RlZCBjb250ZW50XG5cdFx0XHRcdGluc2VydFRleHQgPSBgJHtob29rTmFtZX06YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFR5cGluZyBhIG5ldyBldmVudCBuYW1lIFx1MjAxNCBvbWl0IHRoZSBjb2xvbiBzbyB0aGUgdXNlciBjYW5cblx0XHRcdFx0Ly8gdHJpZ2dlciB0aGUgbmV4dCBjb21wbGV0aW9uIChlLmcuLCBOZXcgQ29tbWFuZCBzbmlwcGV0KSBieSB0eXBpbmcgJzonXG5cdFx0XHRcdGluc2VydFRleHQgPSBob29rTmFtZTtcblx0XHRcdH1cblx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogaG9va05hbWUsXG5cdFx0XHRcdGRvY3VtZW50YXRpb246IG1ldGE/LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHksXG5cdFx0XHRcdGluc2VydFRleHQsXG5cdFx0XHRcdGluc2VydFRleHRSdWxlczogQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcmFuZ2VTdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKSksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBzdWdnZXN0aW9ucyB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb3ZpZGVzIGNvbXBsZXRpb25zIGZvciBob29rIGNvbW1hbmQgZmllbGRzICh0eXBlLCBjb21tYW5kLCB3aW5kb3dzLCBldGMuKVxuXHQgKiB3aGVuIHRoZSBjdXJzb3IgaXMgaW5zaWRlIGEgY29tbWFuZCBvYmplY3Qgd2l0aGluIHRoZSBob29rcyBtYXAuXG5cdCAqIERldGVjdHMgbmVzdGluZyBieSBjaGVja2luZyBpZiB0aGUgcG9zaXRpb24gZmFsbHMgd2l0aGluIGEgc2VxdWVuY2UgaXRlbVxuXHQgKiBvZiBhIGhvb2sgZXZlbnQncyB2YWx1ZS5cblx0ICovXG5cdHByaXZhdGUgcHJvdmlkZUhvb2tDb21tYW5kRmllbGRDb21wbGV0aW9ucyhcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRwb3NpdGlvbjogUG9zaXRpb24sXG5cdFx0aG9va3NNYXA6IElNYXBWYWx1ZSxcblx0XHR0YXJnZXQ6IFRhcmdldCxcblx0KTogQ29tcGxldGlvbkxpc3QgfCB1bmRlZmluZWQge1xuXHRcdC8vIEZpbmQgd2hpY2ggaG9vayBldmVudCdzIGNvbW1hbmQgbGlzdCB0aGUgY3Vyc29yIGlzIGluXG5cdFx0Y29uc3QgY29udGFpbmluZ0NvbW1hbmRNYXAgPSB0aGlzLmZpbmRDb250YWluaW5nQ29tbWFuZE1hcChtb2RlbCwgcG9zaXRpb24sIGhvb2tzTWFwKTtcblx0XHRpZiAoIWNvbnRhaW5pbmdDb21tYW5kTWFwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ29waWxvdENsaSA9IHRhcmdldCA9PT0gVGFyZ2V0LkdpdEh1YkNvcGlsb3Q7XG5cdFx0Y29uc3QgdmFsaWRGaWVsZHMgPSBpc0NvcGlsb3RDbGlcblx0XHRcdD8gWyd0eXBlJywgJ2Jhc2gnLCAncG93ZXJzaGVsbCcsICdjd2QnLCAnZW52JywgJ3RpbWVvdXRTZWMnXVxuXHRcdFx0OiBbJ3R5cGUnLCAnY29tbWFuZCcsICd3aW5kb3dzJywgJ2xpbnV4JywgJ29zeCcsICdiYXNoJywgJ3Bvd2Vyc2hlbGwnLCAnY3dkJywgJ2VudicsICd0aW1lb3V0J107XG5cblx0XHRjb25zdCBleGlzdGluZ0ZpZWxkcyA9IG5ldyBTZXQoXG5cdFx0XHRjb250YWluaW5nQ29tbWFuZE1hcC5wcm9wZXJ0aWVzXG5cdFx0XHRcdC5maWx0ZXIocCA9PiBwLmtleS5yYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IHBvc2l0aW9uLmxpbmVOdW1iZXIpXG5cdFx0XHRcdC5tYXAocCA9PiBwLmtleS52YWx1ZSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBmaXJzdE5vbldoaXRlc3BhY2UgPSBsaW5lVGV4dC5zZWFyY2goL1xcUy8pO1xuXHRcdGNvbnN0IGlzRW1wdHlMaW5lID0gZmlyc3ROb25XaGl0ZXNwYWNlID09PSAtMTtcblx0XHQvLyBTa2lwIHBhc3QgdGhlIFlBTUwgc2VxdWVuY2UgaW5kaWNhdG9yIGAtIGAgc28gdGhlIHJhbmdlIHN0YXJ0cyBhdCB0aGVcblx0XHQvLyBhY3R1YWwgZmllbGQgbmFtZTsgb3RoZXJ3aXNlIFZTIENvZGUncyBjb21wbGV0aW9uIGZpbHRlciB3b3VsZCBzZWUgdGhlXG5cdFx0Ly8gYC0gYCBwcmVmaXggYW5kIHJlamVjdCB2YWxpZCBmaWVsZCBuYW1lcy5cblx0XHRjb25zdCBkYXNoUHJlZml4TWF0Y2ggPSBsaW5lVGV4dC5tYXRjaCgvXihcXHMqLVxccyspLyk7XG5cdFx0Y29uc3QgZmllbGRTdGFydCA9IGRhc2hQcmVmaXhNYXRjaCA/IGRhc2hQcmVmaXhNYXRjaFsxXS5sZW5ndGggOiBmaXJzdE5vbldoaXRlc3BhY2U7XG5cdFx0Y29uc3QgcmFuZ2VTdGFydENvbHVtbiA9IGlzRW1wdHlMaW5lID8gcG9zaXRpb24uY29sdW1uIDogZmllbGRTdGFydCArIDE7XG5cdFx0Y29uc3QgY29sb25JbmRleCA9IGxpbmVUZXh0LmluZGV4T2YoJzonKTtcblxuXHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBmaWVsZE5hbWUgb2YgdmFsaWRGaWVsZHMpIHtcblx0XHRcdGlmIChleGlzdGluZ0ZpZWxkcy5oYXMoZmllbGROYW1lKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlc2MgPSBIT09LX0NPTU1BTkRfRklFTERfREVTQ1JJUFRJT05TW2ZpZWxkTmFtZV07XG5cdFx0XHRjb25zdCBpbnNlcnRUZXh0ID0gY29sb25JbmRleCAhPT0gLTEgPyBmaWVsZE5hbWUgOiBgJHtmaWVsZE5hbWV9OiAkMGA7XG5cdFx0XHRzdWdnZXN0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGZpZWxkTmFtZSxcblx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogZGVzYyxcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5LFxuXHRcdFx0XHRpbnNlcnRUZXh0LFxuXHRcdFx0XHRpbnNlcnRUZXh0UnVsZXM6IENvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuSW5zZXJ0QXNTbmlwcGV0LFxuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHJhbmdlU3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIGNvbG9uSW5kZXggIT09IC0xID8gY29sb25JbmRleCArIDEgOiBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpKSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdWdnZXN0aW9ucy5sZW5ndGggPiAwID8geyBzdWdnZXN0aW9ucyB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhbGtzIHRoZSBob29rcyBtYXAgQVNUIHRvIGZpbmQgdGhlIGNvbW1hbmQgbWFwIG9iamVjdCBjb250YWluaW5nIHRoZSBwb3NpdGlvbi5cblx0ICogSGFuZGxlcyBib3RoIGRpcmVjdCBjb21tYW5kIG9iamVjdHMgYW5kIG5lc3RlZCBtYXRjaGVyIGZvcm1hdC5cblx0ICogQWxzbyBoYW5kbGVzIHRyYWlsaW5nIGxpbmVzIGFmdGVyIHRoZSBsYXN0IHBhcnNlZCBwcm9wZXJ0eSBvZiBhIGNvbW1hbmQgbWFwLlxuXHQgKi9cblx0cHJpdmF0ZSBmaW5kQ29udGFpbmluZ0NvbW1hbmRNYXAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgaG9va3NNYXA6IElNYXBWYWx1ZSk6IElNYXBWYWx1ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBob29rc01hcC5wcm9wZXJ0aWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwcm9wID0gaG9va3NNYXAucHJvcGVydGllc1tpXTtcblx0XHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgIT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBDaGVjayBpZiBjdXJzb3IgaXMgd2l0aGluIHRoZSBzZXF1ZW5jZSdzIHJhbmdlLCBvciBvbiBhIHRyYWlsaW5nIGxpbmUgYWZ0ZXIgaXRcblx0XHRcdGNvbnN0IHNlcVJhbmdlID0gcHJvcC52YWx1ZS5yYW5nZTtcblx0XHRcdGNvbnN0IG5leHRQcm9wID0gaG9va3NNYXAucHJvcGVydGllc1tpICsgMV07XG5cdFx0XHRjb25zdCBpc0luU2VxID0gc2VxUmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRjb25zdCBpc1RyYWlsaW5nU2VxID0gIWlzSW5TZXFcblx0XHRcdFx0JiYgc2VxUmFuZ2UuZW5kTGluZU51bWJlciA8IHBvc2l0aW9uLmxpbmVOdW1iZXJcblx0XHRcdFx0JiYgKCFuZXh0UHJvcCB8fCBuZXh0UHJvcC5rZXkucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gcG9zaXRpb24ubGluZU51bWJlcik7XG5cblx0XHRcdGlmIChpc0luU2VxIHx8IGlzVHJhaWxpbmdTZXEpIHtcblx0XHRcdFx0Ly8gRm9yIHRyYWlsaW5nIGxpbmVzLCB2ZXJpZnkgdGhlIGN1cnNvciBpcyBpbmRlbnRlZCBkZWVwZXIgdGhhblxuXHRcdFx0XHQvLyB0aGUgaG9vayBldmVudCBrZXkgXHUyMDE0IG90aGVyd2lzZSBpdCBiZWxvbmdzIHRvIHRoZSBwYXJlbnQgbWFwLlxuXHRcdFx0XHRpZiAoaXNUcmFpbGluZ1NlcSkge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdFx0Y29uc3QgZmlyc3ROb25XcyA9IGxpbmVUZXh0LnNlYXJjaCgvXFxTLyk7XG5cdFx0XHRcdFx0Y29uc3QgZWZmZWN0aXZlSW5kZW50ID0gZmlyc3ROb25XcyA9PT0gLTEgPyBwb3NpdGlvbi5jb2x1bW4gLSAxIDogZmlyc3ROb25Xcztcblx0XHRcdFx0XHRjb25zdCBob29rS2V5SW5kZW50ID0gcHJvcC5rZXkucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxO1xuXHRcdFx0XHRcdGlmIChlZmZlY3RpdmVJbmRlbnQgPD0gaG9va0tleUluZGVudCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuZmluZENvbW1hbmRNYXBJblNlcXVlbmNlKHBvc2l0aW9uLCBwcm9wLnZhbHVlKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZmluZENvbW1hbmRNYXBJblNlcXVlbmNlKHBvc2l0aW9uOiBQb3NpdGlvbiwgc2VxdWVuY2U6IElTZXF1ZW5jZVZhbHVlKTogSU1hcFZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlcXVlbmNlLml0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gc2VxdWVuY2UuaXRlbXNbaV07XG5cdFx0XHRpZiAoaXRlbS50eXBlICE9PSAnbWFwJykge1xuXHRcdFx0XHQvLyBIYW5kbGUgcGFydGlhbCB0eXBpbmc6IGEgc2NhbGFyIG9uIHRoZSBjdXJzb3IgbGluZSBtZWFucyB0aGUgdXNlclxuXHRcdFx0XHQvLyBpcyBzdGFydGluZyB0byB0eXBlIGEgY29tbWFuZCBlbnRyeSAoZS5nLiwgXCItIHRcIikuXG5cdFx0XHRcdGlmIChpdGVtLnR5cGUgPT09ICdzY2FsYXInICYmIGl0ZW0ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBwb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ21hcCcsIHByb3BlcnRpZXM6IFtdLCByYW5nZTogaXRlbS5yYW5nZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpZiBwb3NpdGlvbiBpcyB3aXRoaW4gb3IganVzdCBhZnRlciB0aGlzIG1hcCBpdGVtJ3MgcGFyc2VkIHJhbmdlLlxuXHRcdFx0Ly8gVGhlIHBhcnNlcidzIHJhbmdlIG1heSBub3QgaW5jbHVkZSBhIHRyYWlsaW5nIGxpbmUgYmVpbmcgdHlwZWQuXG5cdFx0XHRjb25zdCBpc0luUmFuZ2UgPSBpdGVtLnJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0Y29uc3QgaXNUcmFpbGluZyA9ICFpc0luUmFuZ2Vcblx0XHRcdFx0JiYgaXRlbS5yYW5nZS5lbmRMaW5lTnVtYmVyIDwgcG9zaXRpb24ubGluZU51bWJlclxuXHRcdFx0XHQmJiAoaSArIDEgPj0gc2VxdWVuY2UuaXRlbXMubGVuZ3RoIHx8IHNlcXVlbmNlLml0ZW1zW2kgKyAxXS5yYW5nZS5zdGFydExpbmVOdW1iZXIgPiBwb3NpdGlvbi5saW5lTnVtYmVyKTtcblxuXHRcdFx0aWYgKCFpc0luUmFuZ2UgJiYgIWlzVHJhaWxpbmcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGZvciBuZXN0ZWQgbWF0Y2hlciBmb3JtYXQ6IHsgaG9va3M6IFsuLi5dIH1cblx0XHRcdGNvbnN0IG5lc3RlZEhvb2tzID0gaXRlbS5wcm9wZXJ0aWVzLmZpbmQocCA9PiBwLmtleS52YWx1ZSA9PT0gJ2hvb2tzJyk7XG5cdFx0XHRpZiAobmVzdGVkSG9va3M/LnZhbHVlLnR5cGUgPT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5maW5kQ29tbWFuZE1hcEluU2VxdWVuY2UocG9zaXRpb24sIG5lc3RlZEhvb2tzLnZhbHVlKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBpdGVtO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRWYWx1ZVN1Z2dlc3Rpb25zKHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBhdHRyaWJ1dGU6IHN0cmluZywgdGFyZ2V0OiBUYXJnZXQpOiBQcm9taXNlPHJlYWRvbmx5IElWYWx1ZUVudHJ5W10+IHtcblx0XHRjb25zdCBhdHRyaWJ1dGVEZXNjID0gZ2V0QXR0cmlidXRlRGVmaW5pdGlvbihhdHRyaWJ1dGUsIHByb21wdFR5cGUsIHRhcmdldCk7XG5cdFx0aWYgKGF0dHJpYnV0ZURlc2M/LmVudW1zKSB7XG5cdFx0XHRyZXR1cm4gYXR0cmlidXRlRGVzYy5lbnVtcztcblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZURlc2M/LmRlZmF1bHRzKSB7XG5cdFx0XHRyZXR1cm4gYXR0cmlidXRlRGVzYy5kZWZhdWx0cy5tYXAodmFsdWUgPT4gKHsgbmFtZTogdmFsdWUgfSkpO1xuXHRcdH1cblx0XHRzd2l0Y2ggKGF0dHJpYnV0ZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFnZW50OlxuXHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGU6XG5cdFx0XHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQpIHtcblx0XHRcdFx0XHQvLyBHZXQgYWxsIGF2YWlsYWJsZSBhZ2VudHMgKGJ1aWx0aW4gKyBjdXN0b20pXG5cdFx0XHRcdFx0Y29uc3QgYWdlbnRzID0gYXdhaXQgdGhpcy5jaGF0TW9kZVNlcnZpY2UuZ2V0TG9jYWxNb2RlcygpO1xuXHRcdFx0XHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBJVmFsdWVFbnRyeVtdID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBhZ2VudCBvZiBJdGVyYWJsZS5jb25jYXQoYWdlbnRzLmJ1aWx0aW4sIGFnZW50cy5jdXN0b20pKSB7XG5cdFx0XHRcdFx0XHRzdWdnZXN0aW9ucy5wdXNoKHsgbmFtZTogYWdlbnQubmFtZS5nZXQoKSwgZGVzY3JpcHRpb246IGFnZW50LmxhYmVsLmdldCgpIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gc3VnZ2VzdGlvbnM7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubW9kZWw6XG5cdFx0XHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQgfHwgcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRNb2RlbE5hbWVzKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIGdldE1vZGVsTmFtZXMoYWdlbnRNb2RlT25seTogYm9vbGVhbik6IElWYWx1ZUVudHJ5W10ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpKSB7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWwpO1xuXHRcdFx0aWYgKG1ldGFkYXRhICYmIG1ldGFkYXRhLmlzVXNlclNlbGVjdGFibGUgIT09IGZhbHNlICYmICFtZXRhZGF0YS50YXJnZXRDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0aWYgKCFhZ2VudE1vZGVPbmx5IHx8IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLnN1aXRhYmxlRm9yQWdlbnRNb2RlKG1ldGFkYXRhKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdG5hbWU6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLmFzUXVhbGlmaWVkTmFtZShtZXRhZGF0YSksXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbWV0YWRhdGEudG9vbHRpcFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb3ZpZGVBcnJheUNvbXBsZXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIGFycmF5VmFsdWU6IElTZXF1ZW5jZVZhbHVlLCBnZXRWYWx1ZXM6ICgpID0+IFByb21pc2U8UmVhZG9ubHlBcnJheTxJVmFsdWVFbnRyeT4+KTogUHJvbWlzZTxDb21wbGV0aW9uTGlzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGdldFN1Z2dlc3Rpb25zID0gYXN5bmMgKHRvb2xSYW5nZTogUmFuZ2UsIGN1cnJlbnRJdGVtPzogSVZhbHVlKSA9PiB7XG5cdFx0XHRjb25zdCBzdWdnZXN0aW9uczogQ29tcGxldGlvbkl0ZW1bXSA9IFtdO1xuXHRcdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IGdldFZhbHVlcygpO1xuXHRcdFx0Y29uc3QgcXVvdGVQcmVmZXJlbmNlID0gZ2V0UXVvdGVQcmVmZXJlbmNlKGFycmF5VmFsdWUsIG1vZGVsKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nVmFsdWVzID0gbmV3IFNldDxzdHJpbmc+KGFycmF5VmFsdWUuaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gY3VycmVudEl0ZW0pLmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSA9PT0gJ3NjYWxhcicpLm1hcChpdGVtID0+IGl0ZW0udmFsdWUpKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0XHRjb25zdCBlbnRyeU5hbWUgPSBlbnRyeS5uYW1lO1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdWYWx1ZXMuaGFzKGVudHJ5TmFtZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgaW5zZXJ0VGV4dDogc3RyaW5nO1xuXHRcdFx0XHRpZiAoIXRvb2xSYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRjb25zdCBmaXJzdENoYXIgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UodG9vbFJhbmdlKS5jaGFyQ29kZUF0KDApO1xuXHRcdFx0XHRcdGluc2VydFRleHQgPSBmaXJzdENoYXIgPT09IENoYXJDb2RlLlNpbmdsZVF1b3RlID8gYCcke2VudHJ5TmFtZX0nYCA6IGZpcnN0Q2hhciA9PT0gQ2hhckNvZGUuRG91YmxlUXVvdGUgPyBgXCIke2VudHJ5TmFtZX1cImAgOiBlbnRyeU5hbWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dCA9IGZvcm1hdEFycmF5VmFsdWUoZW50cnlOYW1lLCBxdW90ZVByZWZlcmVuY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBlbnRyeU5hbWUsXG5cdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogZW50cnkuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlZhbHVlLFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IGluc2VydFRleHQsXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRyYW5nZTogdG9vbFJhbmdlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHN1Z2dlc3Rpb25zIH07XG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBhcnJheVZhbHVlLml0ZW1zKSB7XG5cdFx0XHRpZiAoaXRlbS5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHQvLyBpZiB0aGUgcG9zaXRpb24gaXMgaW5zaWRlIGEgaXRlbSByYW5nZSwgd2UgcHJvdmlkZSBpdGVtIGNvbXBsZXRpb25zXG5cdFx0XHRcdHJldHVybiBhd2FpdCBnZXRTdWdnZXN0aW9ucyhpdGVtLnJhbmdlLCBpdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcHJlZml4ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pKTtcblx0XHRpZiAocHJlZml4Lm1hdGNoKC9bOixbXVxccyokLykpIHtcblx0XHRcdC8vIGlmIHRoZSBwb3NpdGlvbiBpcyBhZnRlciBhIGNvbW1hIG9yIGJyYWNrZXRcblx0XHRcdHJldHVybiBhd2FpdCBnZXRTdWdnZXN0aW9ucyhuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUE0Qyw4QkFBOEIsMEJBQWtFO0FBRTVJLFNBQVMsNEJBQTRCLDhCQUE4QjtBQUNuRSxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QixhQUFhLGNBQWM7QUFDakUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBOEQseUJBQXVDLDhCQUE4QjtBQUNuSSxTQUFTLHdCQUF3QixXQUFXLHdCQUF3QixrQkFBa0IseUJBQXNDLDhCQUErQjtBQUMzSixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQiww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RUEsTUFBYyx3QkFBd0IsT0FBbUIsVUFBb0IsWUFBNEIsV0FBMkY7QUFDbk0sVUFBTSxpQkFBaUIsT0FBTyxXQUFrQixnQkFBeUI7QUFDeEUsWUFBTSxjQUFnQyxDQUFDO0FBQ3ZDLFlBQU0sVUFBVSxNQUFNLFVBQVU7QUFDaEMsWUFBTSxrQkFBa0IsbUJBQW1CLFlBQVksS0FBSztBQUM1RCxZQUFNLGlCQUFpQixJQUFJLElBQVksV0FBVyxNQUFNLE9BQU8sVUFBUSxTQUFTLFdBQVcsRUFBRSxPQUFPLFVBQVEsS0FBSyxTQUFTLFFBQVEsRUFBRSxJQUFJLFVBQVEsS0FBSyxLQUFLLENBQUM7QUFDM0osaUJBQVcsU0FBUyxTQUFTO0FBQzVCLGNBQU0sWUFBWSxNQUFNO0FBQ3hCLFlBQUksZUFBZSxJQUFJLFNBQVMsR0FBRztBQUNsQztBQUFBLFFBQ0Q7QUFDQSxZQUFJO0FBQ0osWUFBSSxDQUFDLFVBQVUsUUFBUSxHQUFHO0FBQ3pCLGdCQUFNLFlBQVksTUFBTSxnQkFBZ0IsU0FBUyxFQUFFLFdBQVcsQ0FBQztBQUMvRCx1QkFBYSxjQUFjLFNBQVMsY0FBYyxJQUFJLFNBQVMsTUFBTSxjQUFjLFNBQVMsY0FBYyxJQUFJLFNBQVMsTUFBTTtBQUFBLFFBQzlILE9BQU87QUFDTix1QkFBYSxpQkFBaUIsV0FBVyxlQUFlO0FBQUEsUUFDekQ7QUFDQSxvQkFBWSxLQUFLO0FBQUEsVUFDaEIsT0FBTztBQUFBLFVBQ1AsZUFBZSxNQUFNO0FBQUEsVUFDckIsTUFBTSxtQkFBbUI7QUFBQSxVQUN6QixZQUFZO0FBQUEsVUFDWjtBQUFBLFVBQ0EsT0FBTztBQUFBLFFBQ1IsQ0FBQztBQUFBLE1BQ0Y7QUFDQSxhQUFPLEVBQUUsWUFBWTtBQUFBLElBQ3RCO0FBRUEsZUFBVyxRQUFRLFdBQVcsT0FBTztBQUNwQyxVQUFJLEtBQUssTUFBTSxpQkFBaUIsUUFBUSxHQUFHO0FBRTFDLGVBQU8sTUFBTSxlQUFlLEtBQUssT0FBTyxJQUFJO0FBQUEsTUFDN0M7QUFBQSxJQUNEO0FBQ0EsVUFBTSxTQUFTLE1BQU0sZ0JBQWdCLElBQUksTUFBTSxTQUFTLFlBQVksR0FBRyxTQUFTLFlBQVksU0FBUyxNQUFNLENBQUM7QUFDNUcsUUFBSSxPQUFPLE1BQU0sV0FBVyxHQUFHO0FBRTlCLGFBQU8sTUFBTSxlQUFlLElBQUksTUFBTSxTQUFTLFlBQVksU0FBUyxRQUFRLFNBQVMsWUFBWSxTQUFTLE1BQU0sQ0FBQztBQUFBLElBQ2xIO0FBQ0EsV0FBTztBQUFBLEVBRVI7QUFDRDtBQXRuQmEsNkJBQU47QUFBQSxFQVlKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBaEJVOyIsCiAgIm5hbWVzIjogWyJsaW5lVGV4dCJdCn0K
