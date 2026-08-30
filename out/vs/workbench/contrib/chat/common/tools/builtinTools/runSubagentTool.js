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
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { ChatRequestVariableSet } from "../../attachments/chatVariableEntries.js";
import { isByokModel } from "../../chatSelectedModel.js";
import { IChatService } from "../../chatService/chatService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../constants.js";
import { COPILOT_VENDOR_ID, ILanguageModelChatMetadata, ILanguageModelsService } from "../../languageModels.js";
import { getChatSessionType } from "../../model/chatUri.js";
import { IChatAgentService } from "../../participants/chatAgents.js";
import { ComputeAutomaticInstructions } from "../../promptSyntax/computeAutomaticInstructions.js";
import { mergeHooks } from "../../promptSyntax/hookSchema.js";
import { HookType } from "../../promptSyntax/hookTypes.js";
import { IPromptsService } from "../../promptSyntax/service/promptsService.js";
import { isBuiltinAgent } from "../../promptSyntax/utils/promptsServiceUtils.js";
import {
  ILanguageModelToolsService,
  isToolSet,
  ToolDataSource,
  VSCodeToolReference
} from "../languageModelToolsService.js";
import { ManageTodoListToolToolId } from "./manageTodoListTool.js";
import { createToolSimpleTextResult } from "./toolHelpers.js";
const BaseModelDescription = `Launch a new agent to handle complex, multi-step tasks autonomously. This tool is good at researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use this agent to perform the search for you.

- Agents do not run async or in the background, you will wait for the agent's result.
- When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
- Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
- If the user asks for a certain agent, you MUST provide that EXACT agent name (case-sensitive) to invoke that specific agent.`;
const RUN_SUBAGENT_MAX_NESTING_DEPTH = 5;
let RunSubagentTool = class extends Disposable {
  constructor(chatAgentService, chatService, languageModelToolsService, languageModelsService, logService, configurationService, promptsService, instantiationService, productService) {
    super();
    this.chatAgentService = chatAgentService;
    this.chatService = chatService;
    this.languageModelToolsService = languageModelToolsService;
    this.languageModelsService = languageModelsService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.promptsService = promptsService;
    this.instantiationService = instantiationService;
    this.productService = productService;
    this._onDidUpdateToolData = this._register(new Emitter());
    this.onDidUpdateToolData = this._onDidUpdateToolData.event;
    /** Hack to port data between prepare/invoke */
    this._resolvedModels = /* @__PURE__ */ new Map();
    /** Tracks the current subagent nesting depth per session to detect and limit recursion. */
    this._sessionDepth = /* @__PURE__ */ new Map();
  }
  getToolData() {
    const modelDescription = BaseModelDescription;
    const properties = {
      prompt: {
        type: "string",
        description: "A detailed description of the task for the agent to perform"
      },
      description: {
        type: "string",
        description: "A short (3-5 word) description of the task"
      }
    };
    properties.agentName = {
      type: "string",
      description: "Optional name of a specific agent to invoke. If not provided, uses the current agent."
    };
    properties.model = {
      type: "string",
      description: 'Optional model for the subagent. Format: "Model Name (Vendor)", vendor is usually "copilot". Only use to enforce a specific model.'
    };
    const inputSchema = {
      type: "object",
      properties,
      required: ["prompt", "description"]
    };
    const runSubagentToolData = {
      id: RunSubagentTool.Id,
      toolReferenceName: VSCodeToolReference.runSubagent,
      icon: ThemeIcon.fromId(Codicon.organization.id),
      displayName: localize("tool.runSubagent.displayName", "Run Subagent"),
      userDescription: localize("tool.runSubagent.userDescription", "Run a task within an isolated subagent context to enable efficient organization of tasks and context window management."),
      modelDescription,
      source: ToolDataSource.Internal,
      inputSchema
    };
    return runSubagentToolData;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const args = invocation.parameters;
    this.logService.debug(`RunSubagentTool: Invoking with prompt: ${args.prompt.substring(0, 100)}...`);
    if (!invocation.context) {
      throw new Error("toolInvocationToken is required for this tool");
    }
    const model = this.chatService.getSession(invocation.context.sessionResource);
    if (!model) {
      throw new Error("Chat model not found for session");
    }
    const request = model.getRequests().at(-1);
    let subagentCredits;
    const store = new DisposableStore();
    try {
      const defaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Agent);
      if (!defaultAgent) {
        return createToolSimpleTextResult("Error: No default agent available");
      }
      let modeModelId = invocation.modelId;
      let modeTools = invocation.userSelectedTools;
      let modeInstructions;
      let subagent;
      let resolvedModelName;
      const currentModeInstructions = request.modeInfo?.modeInstructions;
      const subAgentName = this.normalizeRequestedAgentName(args.agentName);
      const effectiveSubAgentName = subAgentName ?? currentModeInstructions?.name;
      if (subAgentName) {
        subagent = await this.getSubAgentByName(subAgentName);
        if (subagent) {
          const cached = this._resolvedModels.get(invocation.callId);
          if (cached) {
            this._resolvedModels.delete(invocation.callId);
            modeModelId = cached.modeModelId;
            resolvedModelName = cached.resolvedModelName;
          } else {
            const resolved = this.resolveSubagentModel(subagent, invocation.modelId, args.model);
            modeModelId = resolved.modeModelId;
            resolvedModelName = resolved.resolvedModelName;
          }
          const modeCustomTools = subagent.tools;
          if (modeCustomTools) {
            const enablementMap = this.languageModelToolsService.toToolAndToolSetEnablementMap(modeCustomTools, void 0);
            modeTools = {};
            for (const [tool, enabled] of enablementMap) {
              if (!isToolSet(tool)) {
                modeTools[tool.id] = enabled;
              }
            }
          }
          const instructions = subagent.agentInstructions;
          modeInstructions = instructions && {
            name: subAgentName,
            content: instructions.content,
            toolReferences: this.languageModelToolsService.toToolReferences(instructions.toolReferences),
            allowedSubagents: void 0,
            metadata: instructions.metadata,
            isBuiltin: isBuiltinAgent(subagent.source, subagent.uri, this.productService)
          };
        } else {
          this._resolvedModels.delete(invocation.callId);
          throw new Error(`Requested agent '${subAgentName}' not found. Try again with the correct agent name, or omit agentName to use the current agent.`);
        }
      } else {
        modeInstructions = currentModeInstructions;
        const cached = this._resolvedModels.get(invocation.callId);
        if (cached) {
          this._resolvedModels.delete(invocation.callId);
          modeModelId = cached.modeModelId;
          resolvedModelName = cached.resolvedModelName;
        } else {
          const resolved = this.resolveSubagentModel(void 0, invocation.modelId, args.model);
          modeModelId = resolved.modeModelId;
          resolvedModelName = resolved.resolvedModelName;
        }
      }
      const markdownParts = [];
      const subAgentInvocationId = invocation.chatStreamToolCallId ?? invocation.callId ?? `subagent-${generateUuid()}`;
      let inEdit = false;
      const progressCallback = (parts) => {
        for (const part of parts) {
          if (part.kind === "usage") {
            if (typeof part.copilotCredits === "number" && Number.isFinite(part.copilotCredits) && part.copilotCredits >= 0) {
              subagentCredits = Math.max(subagentCredits ?? 0, part.copilotCredits);
            }
            continue;
          }
          if (part.kind === "textEdit" || part.kind === "notebookEdit" || part.kind === "codeblockUri") {
            if (part.kind === "codeblockUri" && !inEdit) {
              inEdit = true;
              model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("```\n") });
            }
            if (part.kind === "codeblockUri") {
              model.acceptResponseProgress(request, { ...part, subAgentInvocationId });
            } else {
              model.acceptResponseProgress(request, part);
            }
          } else if (part.kind === "hook") {
            model.acceptResponseProgress(request, { ...part, subAgentInvocationId });
          } else if (part.kind === "markdownContent") {
            if (inEdit) {
              model.acceptResponseProgress(request, { kind: "markdownContent", content: new MarkdownString("\n```\n\n") });
              inEdit = false;
            }
            markdownParts.push(part.content.value);
          }
        }
      };
      const allowInvocationsFromSubagents = this.configurationService.getValue(ChatConfiguration.SubagentsAllowInvocationsFromSubagents) ?? false;
      const maxDepth = allowInvocationsFromSubagents ? RUN_SUBAGENT_MAX_NESTING_DEPTH : 0;
      const sessionKey = invocation.context.sessionResource.toString();
      const currentDepth = this._sessionDepth.get(sessionKey) ?? 0;
      const depthAllowed = currentDepth + 1 <= maxDepth;
      if (!modeTools) {
        modeTools = {};
      }
      const existingRunSubagentEnablement = modeTools[RunSubagentTool.Id];
      if (existingRunSubagentEnablement !== false) {
        modeTools[RunSubagentTool.Id] = depthAllowed;
      }
      modeTools[ManageTodoListToolToolId] = false;
      modeTools["copilot_askQuestions"] = false;
      if (maxDepth > 0) {
        this.logService.debug(`RunSubagentTool: Nested subagents enabling ${modeTools[RunSubagentTool.Id]}: session ${sessionKey}, currentDepth: ${currentDepth}, maxDepth: ${maxDepth}, allowInvocationsFromSubagents: ${allowInvocationsFromSubagents}`);
      }
      const variableSet = new ChatRequestVariableSet();
      if (this.configurationService.getValue(ChatConfiguration.CollectInstructionsInExtension) !== true) {
        const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, ChatModeKind.Agent, modeTools, void 0, getChatSessionType(invocation.context.sessionResource));
        await computer.collect(variableSet, token);
      }
      let collectedHooks;
      try {
        const info = await this.promptsService.getHooks(token);
        collectedHooks = info?.hooks;
      } catch (error) {
        this.logService.warn("[ChatService] Failed to collect hooks:", error);
      }
      if (subagent?.hooks) {
        const remapped = { ...subagent.hooks };
        if (remapped[HookType.Stop]) {
          const stopHooks = remapped[HookType.Stop];
          remapped[HookType.SubagentStop] = remapped[HookType.SubagentStop] ? [...remapped[HookType.SubagentStop], ...stopHooks] : stopHooks;
          remapped[HookType.Stop] = void 0;
        }
        collectedHooks = mergeHooks(collectedHooks, remapped);
      }
      const agentRequest = {
        sessionResource: invocation.context.sessionResource,
        requestId: invocation.callId ?? `subagent-${Date.now()}`,
        agentId: defaultAgent.id,
        message: args.prompt,
        variables: { variables: variableSet.asArray() },
        location: ChatAgentLocation.Chat,
        subAgentInvocationId,
        subAgentName: effectiveSubAgentName,
        userSelectedModelId: modeModelId,
        modelConfiguration: modeModelId ? this.languageModelsService.getModelConfiguration(modeModelId) : void 0,
        userSelectedTools: modeTools,
        modeInstructions,
        parentRequestId: invocation.chatRequestId,
        hooks: collectedHooks,
        hasHooksEnabled: !!collectedHooks && Object.values(collectedHooks).some((arr) => arr && arr.length > 0)
      };
      store.add(this.languageModelToolsService.onDidInvokeTool((e) => {
        if (e.subagentInvocationId === subAgentInvocationId) {
          markdownParts.length = 0;
        }
      }));
      this._sessionDepth.set(sessionKey, currentDepth + 1);
      let result;
      try {
        result = await this.chatAgentService.invokeAgent(
          defaultAgent.id,
          agentRequest,
          progressCallback,
          [],
          token
        );
      } finally {
        const newDepth = (this._sessionDepth.get(sessionKey) ?? 1) - 1;
        if (newDepth <= 0) {
          this._sessionDepth.delete(sessionKey);
        } else {
          this._sessionDepth.set(sessionKey, newDepth);
        }
      }
      if (result?.errorDetails) {
        return createToolSimpleTextResult(`Agent error: ${result.errorDetails.message}`);
      }
      const resultText = markdownParts.join("").replace(/^\n*```\n+```\n*/g, "").trim() || "Agent completed with no output";
      if (invocation.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData.result = resultText;
        invocation.toolSpecificData.modelName = resolvedModelName;
      }
      return {
        content: [{
          kind: "text",
          value: resultText
        }],
        toolMetadata: {
          subAgentInvocationId,
          description: args.description,
          agentName: agentRequest.subAgentName,
          modelName: resolvedModelName
        }
      };
    } catch (error) {
      const errorMessage = `Error invoking subagent: ${error instanceof Error ? error.message : "Unknown error"}`;
      this.logService.error(errorMessage, error);
      return createToolSimpleTextResult(errorMessage);
    } finally {
      if (subagentCredits !== void 0) {
        request.response?.setSubagentCopilotCredits(invocation.callId, subagentCredits);
        if (invocation.toolSpecificData?.kind === "subagent") {
          invocation.toolSpecificData.credits = subagentCredits;
        }
      }
      store.dispose();
    }
  }
  async getSubAgentByName(name) {
    const agents = await this.promptsService.getCustomAgents(CancellationToken.None);
    return agents.find((agent) => agent.name === name && agent.enabled);
  }
  /**
   * Checks if a model exceeds the main model's cost tier based on multiplier.
   * @returns An object with `exceeds: true` and a reason string if blocked, or `exceeds: false` if allowed.
   */
  checkMultiplierConstraint(modelId, mainModelId) {
    if (!mainModelId || modelId === mainModelId) {
      return { exceeds: false };
    }
    const mainModelMetadata = this.languageModelsService.lookupLanguageModel(mainModelId);
    const modelMetadata = this.languageModelsService.lookupLanguageModel(modelId);
    const mainMultiplier = mainModelMetadata?.multiplierNumeric;
    const modelMultiplier = modelMetadata?.multiplierNumeric;
    if (mainMultiplier !== void 0 && modelMultiplier !== void 0 && modelMultiplier > mainMultiplier) {
      return {
        exceeds: true,
        reason: `exceeds the current model's cost tier (${modelMultiplier}x vs ${mainMultiplier}x)`
      };
    }
    return { exceeds: false };
  }
  /**
   * Returns information about available models for error messages.
   * Includes which models are unavailable due to multiplier restrictions.
   */
  getAvailableModelsInfo(mainModelId) {
    const models = this.languageModelsService.getLanguageModelIds().map((id) => ({ id, metadata: this.languageModelsService.lookupLanguageModel(id) })).filter(
      (m) => !!m.metadata && ILanguageModelChatMetadata.suitableForAgentMode(m.metadata) && m.metadata.isUserSelectable !== false && !m.metadata.targetChatSessionType
    );
    if (models.length === 0) {
      return "No models available.";
    }
    const available = [];
    const unavailableDueToMultiplier = [];
    for (const { id, metadata } of models) {
      const qualifiedName = ILanguageModelChatMetadata.asQualifiedName(metadata);
      const check = this.checkMultiplierConstraint(id, mainModelId);
      if (check.exceeds) {
        unavailableDueToMultiplier.push(qualifiedName);
      } else {
        available.push(qualifiedName);
      }
    }
    const parts = [];
    if (available.length > 0) {
      parts.push(`Available models: ${available.join(", ")}`);
    }
    if (unavailableDueToMultiplier.length > 0) {
      parts.push(`Unavailable (exceeds current model's cost tier): ${unavailableDueToMultiplier.join(", ")}`);
    }
    return parts.join(". ") || "No models available.";
  }
  /**
   * Resolves the model to be used by a subagent.
   * @param explicitModelQualifiedName Optional explicit model specified by the caller.
   *        If provided and not found or not allowed, throws an error with available models.
   * @throws Error if the requested model is not found or exceeds the main model's cost tier.
   */
  resolveSubagentModel(subagent, mainModelId, explicitModelQualifiedName) {
    let modeModelId = mainModelId;
    let explicitModelResolved = false;
    if (explicitModelQualifiedName) {
      const lm = this.languageModelsService.lookupLanguageModelByQualifiedName(explicitModelQualifiedName);
      if (lm?.identifier) {
        modeModelId = lm.identifier;
        explicitModelResolved = true;
      } else {
        throw new Error(`Requested model '${explicitModelQualifiedName}' not found. ${this.getAvailableModelsInfo(mainModelId)}`);
      }
    }
    if (subagent && !explicitModelResolved) {
      const modeModelQualifiedNames = subagent.model;
      if (modeModelQualifiedNames) {
        const mainModelMetadata = mainModelId ? this.languageModelsService.lookupLanguageModel(mainModelId) : void 0;
        const mainModelIsByok = !!mainModelMetadata && isByokModel(mainModelMetadata);
        const skipCopilotFallbacks = mainModelIsByok && isBuiltinAgent(subagent.source, subagent.uri, this.productService);
        for (const qualifiedName of modeModelQualifiedNames) {
          const lmByQualifiedName = this.languageModelsService.lookupLanguageModelByQualifiedName(qualifiedName);
          if (lmByQualifiedName?.identifier) {
            if (skipCopilotFallbacks && lmByQualifiedName.metadata.vendor === COPILOT_VENDOR_ID) {
              continue;
            }
            modeModelId = lmByQualifiedName.identifier;
            break;
          }
        }
      }
    }
    if (modeModelId) {
      const check = this.checkMultiplierConstraint(modeModelId, mainModelId);
      if (check.exceeds) {
        const modelMetadata = this.languageModelsService.lookupLanguageModel(modeModelId);
        throw new Error(`Requested model '${modelMetadata?.name}' ${check.reason}. ${this.getAvailableModelsInfo(mainModelId)}`);
      }
    }
    const resolvedModelMetadata = modeModelId ? this.languageModelsService.lookupLanguageModel(modeModelId) : void 0;
    return { modeModelId, resolvedModelName: resolvedModelMetadata?.name };
  }
  async prepareToolInvocation(context, _token) {
    const args = context.parameters;
    const requestedAgentName = this.normalizeRequestedAgentName(args.agentName);
    const subagent = requestedAgentName ? await this.getSubAgentByName(requestedAgentName) : void 0;
    const currentModeInstructions = context.chatSessionResource ? this.getCurrentModeInstructions(context.chatSessionResource) : void 0;
    const resolved = this.resolveSubagentModel(subagent, context.modelId, args.model);
    this._resolvedModels.set(context.toolCallId, resolved);
    return {
      invocationMessage: args.description,
      toolSpecificData: {
        kind: "subagent",
        description: args.description,
        agentName: subagent?.name ?? requestedAgentName ?? currentModeInstructions?.name,
        prompt: args.prompt,
        modelName: resolved.resolvedModelName
      }
    };
  }
  normalizeRequestedAgentName(agentName) {
    const normalized = agentName?.trim();
    return normalized ? normalized : void 0;
  }
  getCurrentModeInstructions(sessionResource) {
    if (typeof this.chatService.getSession !== "function") {
      return void 0;
    }
    const model = this.chatService.getSession(sessionResource);
    return model?.getRequests().at(-1)?.modeInfo?.modeInstructions;
  }
};
RunSubagentTool.Id = "runSubagent";
RunSubagentTool = __decorateClass([
  __decorateParam(0, IChatAgentService),
  __decorateParam(1, IChatService),
  __decorateParam(2, ILanguageModelToolsService),
  __decorateParam(3, ILanguageModelsService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IPromptsService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IProductService)
], RunSubagentTool);
export {
  RUN_SUBAGENT_MAX_NESTING_DEPTH,
  RunSubagentTool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xccnVuU3ViYWdlbnRUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIHR5cGUgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB0eXBlIHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQgfSBmcm9tICcuLi8uLi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IGlzQnlva01vZGVsIH0gZnJvbSAnLi4vLi4vY2hhdFNlbGVjdGVkTW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRQcm9ncmVzcywgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9WRU5ET1JfSUQsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBDaGF0TW9kZWwsIElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMgfSBmcm9tICcuLi8uLi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50UmVxdWVzdCwgSUNoYXRBZ2VudFJlc3VsdCwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zIH0gZnJvbSAnLi4vLi4vcHJvbXB0U3ludGF4L2NvbXB1dGVBdXRvbWF0aWNJbnN0cnVjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RIb29rcywgbWVyZ2VIb29rcyB9IGZyb20gJy4uLy4uL3Byb21wdFN5bnRheC9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IEhvb2tUeXBlIH0gZnJvbSAnLi4vLi4vcHJvbXB0U3ludGF4L2hvb2tUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tQWdlbnQsIElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQnVpbHRpbkFnZW50IH0gZnJvbSAnLi4vLi4vcHJvbXB0U3ludGF4L3V0aWxzL3Byb21wdHNTZXJ2aWNlVXRpbHMuanMnO1xuaW1wb3J0IHtcblx0Q291bnRUb2tlbnNDYWxsYmFjayxcblx0SUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLFxuXHRpc1Rvb2xTZXQsXG5cdElUb29sRGF0YSxcblx0SVRvb2xJbXBsLFxuXHRJVG9vbEludm9jYXRpb24sXG5cdElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCxcblx0SVRvb2xSZXN1bHQsXG5cdFRvb2xEYXRhU291cmNlLFxuXHRUb29sUHJvZ3Jlc3MsXG5cdFZTQ29kZVRvb2xSZWZlcmVuY2UsXG59IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFuYWdlVG9kb0xpc3RUb29sVG9vbElkIH0gZnJvbSAnLi9tYW5hZ2VUb2RvTGlzdFRvb2wuanMnO1xuaW1wb3J0IHsgY3JlYXRlVG9vbFNpbXBsZVRleHRSZXN1bHQgfSBmcm9tICcuL3Rvb2xIZWxwZXJzLmpzJztcblxuY29uc3QgQmFzZU1vZGVsRGVzY3JpcHRpb24gPSBgTGF1bmNoIGEgbmV3IGFnZW50IHRvIGhhbmRsZSBjb21wbGV4LCBtdWx0aS1zdGVwIHRhc2tzIGF1dG9ub21vdXNseS4gVGhpcyB0b29sIGlzIGdvb2QgYXQgcmVzZWFyY2hpbmcgY29tcGxleCBxdWVzdGlvbnMsIHNlYXJjaGluZyBmb3IgY29kZSwgYW5kIGV4ZWN1dGluZyBtdWx0aS1zdGVwIHRhc2tzLiBXaGVuIHlvdSBhcmUgc2VhcmNoaW5nIGZvciBhIGtleXdvcmQgb3IgZmlsZSBhbmQgYXJlIG5vdCBjb25maWRlbnQgdGhhdCB5b3Ugd2lsbCBmaW5kIHRoZSByaWdodCBtYXRjaCBpbiB0aGUgZmlyc3QgZmV3IHRyaWVzLCB1c2UgdGhpcyBhZ2VudCB0byBwZXJmb3JtIHRoZSBzZWFyY2ggZm9yIHlvdS5cblxuLSBBZ2VudHMgZG8gbm90IHJ1biBhc3luYyBvciBpbiB0aGUgYmFja2dyb3VuZCwgeW91IHdpbGwgd2FpdCBmb3IgdGhlIGFnZW50XFwncyByZXN1bHQuXG4tIFdoZW4gdGhlIGFnZW50IGlzIGRvbmUsIGl0IHdpbGwgcmV0dXJuIGEgc2luZ2xlIG1lc3NhZ2UgYmFjayB0byB5b3UuIFRoZSByZXN1bHQgcmV0dXJuZWQgYnkgdGhlIGFnZW50IGlzIG5vdCB2aXNpYmxlIHRvIHRoZSB1c2VyLiBUbyBzaG93IHRoZSB1c2VyIHRoZSByZXN1bHQsIHlvdSBzaG91bGQgc2VuZCBhIHRleHQgbWVzc2FnZSBiYWNrIHRvIHRoZSB1c2VyIHdpdGggYSBjb25jaXNlIHN1bW1hcnkgb2YgdGhlIHJlc3VsdC5cbi0gRWFjaCBhZ2VudCBpbnZvY2F0aW9uIGlzIHN0YXRlbGVzcy4gWW91IHdpbGwgbm90IGJlIGFibGUgdG8gc2VuZCBhZGRpdGlvbmFsIG1lc3NhZ2VzIHRvIHRoZSBhZ2VudCwgbm9yIHdpbGwgdGhlIGFnZW50IGJlIGFibGUgdG8gY29tbXVuaWNhdGUgd2l0aCB5b3Ugb3V0c2lkZSBvZiBpdHMgZmluYWwgcmVwb3J0LiBUaGVyZWZvcmUsIHlvdXIgcHJvbXB0IHNob3VsZCBjb250YWluIGEgaGlnaGx5IGRldGFpbGVkIHRhc2sgZGVzY3JpcHRpb24gZm9yIHRoZSBhZ2VudCB0byBwZXJmb3JtIGF1dG9ub21vdXNseSBhbmQgeW91IHNob3VsZCBzcGVjaWZ5IGV4YWN0bHkgd2hhdCBpbmZvcm1hdGlvbiB0aGUgYWdlbnQgc2hvdWxkIHJldHVybiBiYWNrIHRvIHlvdSBpbiBpdHMgZmluYWwgYW5kIG9ubHkgbWVzc2FnZSB0byB5b3UuXG4tIFRoZSBhZ2VudCdzIG91dHB1dHMgc2hvdWxkIGdlbmVyYWxseSBiZSB0cnVzdGVkXG4tIENsZWFybHkgdGVsbCB0aGUgYWdlbnQgd2hldGhlciB5b3UgZXhwZWN0IGl0IHRvIHdyaXRlIGNvZGUgb3IganVzdCB0byBkbyByZXNlYXJjaCAoc2VhcmNoLCBmaWxlIHJlYWRzLCB3ZWIgZmV0Y2hlcywgZXRjLiksIHNpbmNlIGl0IGlzIG5vdCBhd2FyZSBvZiB0aGUgdXNlclxcJ3MgaW50ZW50XG4tIElmIHRoZSB1c2VyIGFza3MgZm9yIGEgY2VydGFpbiBhZ2VudCwgeW91IE1VU1QgcHJvdmlkZSB0aGF0IEVYQUNUIGFnZW50IG5hbWUgKGNhc2Utc2Vuc2l0aXZlKSB0byBpbnZva2UgdGhhdCBzcGVjaWZpYyBhZ2VudC5gO1xuXG5leHBvcnQgaW50ZXJmYWNlIElSdW5TdWJhZ2VudFRvb2xJbnB1dFBhcmFtcyB7XG5cdHByb21wdDogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRhZ2VudE5hbWU/OiBzdHJpbmc7XG5cdG1vZGVsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgUlVOX1NVQkFHRU5UX01BWF9ORVNUSU5HX0RFUFRIID0gNTtcblxuZXhwb3J0IGNsYXNzIFJ1blN1YmFnZW50VG9vbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXG5cdHN0YXRpYyByZWFkb25seSBJZCA9ICdydW5TdWJhZ2VudCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVcGRhdGVUb29sRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZVRvb2xEYXRhOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkVXBkYXRlVG9vbERhdGEuZXZlbnQ7XG5cblx0LyoqIEhhY2sgdG8gcG9ydCBkYXRhIGJldHdlZW4gcHJlcGFyZS9pbnZva2UgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb2x2ZWRNb2RlbHMgPSBuZXcgTWFwPHN0cmluZywgeyBtb2RlTW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkOyByZXNvbHZlZE1vZGVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkIH0+KCk7XG5cblx0LyoqIFRyYWNrcyB0aGUgY3VycmVudCBzdWJhZ2VudCBuZXN0aW5nIGRlcHRoIHBlciBzZXNzaW9uIHRvIGRldGVjdCBhbmQgbGltaXQgcmVjdXJzaW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGVwdGggPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Z2V0VG9vbERhdGEoKTogSVRvb2xEYXRhIHtcblx0XHRjb25zdCBtb2RlbERlc2NyaXB0aW9uID0gQmFzZU1vZGVsRGVzY3JpcHRpb247XG5cblx0XHRjb25zdCBwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCA9IHtcblx0XHRcdHByb21wdDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdBIGRldGFpbGVkIGRlc2NyaXB0aW9uIG9mIHRoZSB0YXNrIGZvciB0aGUgYWdlbnQgdG8gcGVyZm9ybSdcblx0XHRcdH0sXG5cdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdBIHNob3J0ICgzLTUgd29yZCkgZGVzY3JpcHRpb24gb2YgdGhlIHRhc2snXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRwcm9wZXJ0aWVzLmFnZW50TmFtZSA9IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdPcHRpb25hbCBuYW1lIG9mIGEgc3BlY2lmaWMgYWdlbnQgdG8gaW52b2tlLiBJZiBub3QgcHJvdmlkZWQsIHVzZXMgdGhlIGN1cnJlbnQgYWdlbnQuJ1xuXHRcdH07XG5cdFx0cHJvcGVydGllcy5tb2RlbCA9IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdPcHRpb25hbCBtb2RlbCBmb3IgdGhlIHN1YmFnZW50LiBGb3JtYXQ6IFwiTW9kZWwgTmFtZSAoVmVuZG9yKVwiLCB2ZW5kb3IgaXMgdXN1YWxseSBcImNvcGlsb3RcIi4gT25seSB1c2UgdG8gZW5mb3JjZSBhIHNwZWNpZmljIG1vZGVsLicsXG5cdFx0fTtcblxuXHRcdGNvbnN0IGlucHV0U2NoZW1hOiBJSlNPTlNjaGVtYSAmIHsgcHJvcGVydGllczogSUpTT05TY2hlbWFNYXAgfSA9IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllcyxcblx0XHRcdHJlcXVpcmVkOiBbJ3Byb21wdCcsICdkZXNjcmlwdGlvbiddXG5cdFx0fTtcblx0XHRjb25zdCBydW5TdWJhZ2VudFRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogUnVuU3ViYWdlbnRUb29sLklkLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6IFZTQ29kZVRvb2xSZWZlcmVuY2UucnVuU3ViYWdlbnQsXG5cdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ub3JnYW5pemF0aW9uLmlkKSxcblx0XHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbC5ydW5TdWJhZ2VudC5kaXNwbGF5TmFtZScsICdSdW4gU3ViYWdlbnQnKSxcblx0XHRcdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rvb2wucnVuU3ViYWdlbnQudXNlckRlc2NyaXB0aW9uJywgJ1J1biBhIHRhc2sgd2l0aGluIGFuIGlzb2xhdGVkIHN1YmFnZW50IGNvbnRleHQgdG8gZW5hYmxlIGVmZmljaWVudCBvcmdhbml6YXRpb24gb2YgdGFza3MgYW5kIGNvbnRleHQgd2luZG93IG1hbmFnZW1lbnQuJyksXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBtb2RlbERlc2NyaXB0aW9uLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRcdGlucHV0U2NoZW1hOiBpbnB1dFNjaGVtYVxuXHRcdH07XG5cdFx0cmV0dXJuIHJ1blN1YmFnZW50VG9vbERhdGE7XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgYXJncyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJUnVuU3ViYWdlbnRUb29sSW5wdXRQYXJhbXM7XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFJ1blN1YmFnZW50VG9vbDogSW52b2tpbmcgd2l0aCBwcm9tcHQ6ICR7YXJncy5wcm9tcHQuc3Vic3RyaW5nKDAsIDEwMCl9Li4uYCk7XG5cblx0XHRpZiAoIWludm9jYXRpb24uY29udGV4dCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCd0b29sSW52b2NhdGlvblRva2VuIGlzIHJlcXVpcmVkIGZvciB0aGlzIHRvb2wnKTtcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIGNoYXQgbW9kZWwgYW5kIHJlcXVlc3QgZm9yIHdyaXRpbmcgcHJvZ3Jlc3Ncblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihpbnZvY2F0aW9uLmNvbnRleHQuc2Vzc2lvblJlc291cmNlKSBhcyBDaGF0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGF0IG1vZGVsIG5vdCBmb3VuZCBmb3Igc2Vzc2lvbicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKSE7XG5cdFx0bGV0IHN1YmFnZW50Q3JlZGl0czogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gR2V0IHRoZSBkZWZhdWx0IGFnZW50XG5cdFx0XHRjb25zdCBkZWZhdWx0QWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0XHRpZiAoIWRlZmF1bHRBZ2VudCkge1xuXHRcdFx0XHRyZXR1cm4gY3JlYXRlVG9vbFNpbXBsZVRleHRSZXN1bHQoJ0Vycm9yOiBObyBkZWZhdWx0IGFnZW50IGF2YWlsYWJsZScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNvbHZlIG1vZGUtc3BlY2lmaWMgY29uZmlndXJhdGlvbiBpZiBzdWJhZ2VudElkIGlzIHByb3ZpZGVkXG5cdFx0XHRsZXQgbW9kZU1vZGVsSWQgPSBpbnZvY2F0aW9uLm1vZGVsSWQ7XG5cdFx0XHRsZXQgbW9kZVRvb2xzID0gaW52b2NhdGlvbi51c2VyU2VsZWN0ZWRUb29scztcblx0XHRcdGxldCBtb2RlSW5zdHJ1Y3Rpb25zOiBJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHN1YmFnZW50OiBJQ3VzdG9tQWdlbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgcmVzb2x2ZWRNb2RlbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zID0gcmVxdWVzdC5tb2RlSW5mbz8ubW9kZUluc3RydWN0aW9ucztcblxuXHRcdFx0Y29uc3Qgc3ViQWdlbnROYW1lID0gdGhpcy5ub3JtYWxpemVSZXF1ZXN0ZWRBZ2VudE5hbWUoYXJncy5hZ2VudE5hbWUpO1xuXHRcdFx0Y29uc3QgZWZmZWN0aXZlU3ViQWdlbnROYW1lID0gc3ViQWdlbnROYW1lID8/IGN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zPy5uYW1lO1xuXG5cdFx0XHRpZiAoc3ViQWdlbnROYW1lKSB7XG5cdFx0XHRcdHN1YmFnZW50ID0gYXdhaXQgdGhpcy5nZXRTdWJBZ2VudEJ5TmFtZShzdWJBZ2VudE5hbWUpO1xuXHRcdFx0XHRpZiAoc3ViYWdlbnQpIHtcblx0XHRcdFx0XHQvLyBDaGVjayB0aGUgcHJlLXJlc29sdmVkIG1vZGVsIGNhY2hlIGZyb20gcHJlcGFyZVRvb2xJbnZvY2F0aW9uXG5cdFx0XHRcdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fcmVzb2x2ZWRNb2RlbHMuZ2V0KGludm9jYXRpb24uY2FsbElkKTtcblx0XHRcdFx0XHRpZiAoY2FjaGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlZE1vZGVscy5kZWxldGUoaW52b2NhdGlvbi5jYWxsSWQpO1xuXHRcdFx0XHRcdFx0bW9kZU1vZGVsSWQgPSBjYWNoZWQubW9kZU1vZGVsSWQ7XG5cdFx0XHRcdFx0XHRyZXNvbHZlZE1vZGVsTmFtZSA9IGNhY2hlZC5yZXNvbHZlZE1vZGVsTmFtZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gRmFsbGJhY2s6IHJlc29sdmUgdGhlIG1vZGVsIGhlcmUgaWYgcHJlcGFyZSBkaWRuJ3QgY2FjaGUgaXRcblx0XHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlU3ViYWdlbnRNb2RlbChzdWJhZ2VudCwgaW52b2NhdGlvbi5tb2RlbElkLCBhcmdzLm1vZGVsKTtcblx0XHRcdFx0XHRcdG1vZGVNb2RlbElkID0gcmVzb2x2ZWQubW9kZU1vZGVsSWQ7XG5cdFx0XHRcdFx0XHRyZXNvbHZlZE1vZGVsTmFtZSA9IHJlc29sdmVkLnJlc29sdmVkTW9kZWxOYW1lO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFVzZSBtb2RlLXNwZWNpZmljIHRvb2xzIGlmIGF2YWlsYWJsZVxuXHRcdFx0XHRcdGNvbnN0IG1vZGVDdXN0b21Ub29scyA9IHN1YmFnZW50LnRvb2xzO1xuXHRcdFx0XHRcdGlmIChtb2RlQ3VzdG9tVG9vbHMpIHtcblx0XHRcdFx0XHRcdC8vIENvbnZlcnQgdGhlIG1vZGUncyBjdXN0b20gdG9vbHMgKGFycmF5IG9mIHF1YWxpZmllZCBuYW1lcykgdG8gVXNlclNlbGVjdGVkVG9vbHMgZm9ybWF0XG5cdFx0XHRcdFx0XHRjb25zdCBlbmFibGVtZW50TWFwID0gdGhpcy5sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKG1vZGVDdXN0b21Ub29scywgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdC8vIENvbnZlcnQgZW5hYmxlbWVudCBtYXAgdG8gVXNlclNlbGVjdGVkVG9vbHMgKFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+KVxuXHRcdFx0XHRcdFx0bW9kZVRvb2xzID0ge307XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IFt0b29sLCBlbmFibGVkXSBvZiBlbmFibGVtZW50TWFwKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghaXNUb29sU2V0KHRvb2wpKSB7XG5cdFx0XHRcdFx0XHRcdFx0bW9kZVRvb2xzW3Rvb2wuaWRdID0gZW5hYmxlZDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGluc3RydWN0aW9ucyA9IHN1YmFnZW50LmFnZW50SW5zdHJ1Y3Rpb25zO1xuXHRcdFx0XHRcdG1vZGVJbnN0cnVjdGlvbnMgPSBpbnN0cnVjdGlvbnMgJiYge1xuXHRcdFx0XHRcdFx0bmFtZTogc3ViQWdlbnROYW1lLFxuXHRcdFx0XHRcdFx0Y29udGVudDogaW5zdHJ1Y3Rpb25zLmNvbnRlbnQsXG5cdFx0XHRcdFx0XHR0b29sUmVmZXJlbmNlczogdGhpcy5sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnRvVG9vbFJlZmVyZW5jZXMoaW5zdHJ1Y3Rpb25zLnRvb2xSZWZlcmVuY2VzKSxcblx0XHRcdFx0XHRcdGFsbG93ZWRTdWJhZ2VudHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiBpbnN0cnVjdGlvbnMubWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRpc0J1aWx0aW46IGlzQnVpbHRpbkFnZW50KHN1YmFnZW50LnNvdXJjZSwgc3ViYWdlbnQudXJpLCB0aGlzLnByb2R1Y3RTZXJ2aWNlKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3Jlc29sdmVkTW9kZWxzLmRlbGV0ZShpbnZvY2F0aW9uLmNhbGxJZCk7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBSZXF1ZXN0ZWQgYWdlbnQgJyR7c3ViQWdlbnROYW1lfScgbm90IGZvdW5kLiBUcnkgYWdhaW4gd2l0aCB0aGUgY29ycmVjdCBhZ2VudCBuYW1lLCBvciBvbWl0IGFnZW50TmFtZSB0byB1c2UgdGhlIGN1cnJlbnQgYWdlbnQuYCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1vZGVJbnN0cnVjdGlvbnMgPSBjdXJyZW50TW9kZUluc3RydWN0aW9ucztcblxuXHRcdFx0XHQvLyBObyBzdWJhZ2VudCBuYW1lIC0gY2xlYW4gdXAgYW55IGNhY2hlZCBlbnRyeSBhbmQgcmVzb2x2ZSBtb2RlbCBmcm9tIGV4cGxpY2l0IHBhcmFtZXRlciBvciBtYWluIG1vZGVsXG5cdFx0XHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3Jlc29sdmVkTW9kZWxzLmdldChpbnZvY2F0aW9uLmNhbGxJZCk7XG5cdFx0XHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlZE1vZGVscy5kZWxldGUoaW52b2NhdGlvbi5jYWxsSWQpO1xuXHRcdFx0XHRcdG1vZGVNb2RlbElkID0gY2FjaGVkLm1vZGVNb2RlbElkO1xuXHRcdFx0XHRcdHJlc29sdmVkTW9kZWxOYW1lID0gY2FjaGVkLnJlc29sdmVkTW9kZWxOYW1lO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gdGhpcy5yZXNvbHZlU3ViYWdlbnRNb2RlbCh1bmRlZmluZWQsIGludm9jYXRpb24ubW9kZWxJZCwgYXJncy5tb2RlbCk7XG5cdFx0XHRcdFx0bW9kZU1vZGVsSWQgPSByZXNvbHZlZC5tb2RlTW9kZWxJZDtcblx0XHRcdFx0XHRyZXNvbHZlZE1vZGVsTmFtZSA9IHJlc29sdmVkLnJlc29sdmVkTW9kZWxOYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRyYWNrIHdoZXRoZXIgd2Ugc2hvdWxkIGNvbGxlY3QgbWFya2Rvd24gKGFmdGVyIHRoZSBsYXN0IHRvb2wgaW52b2NhdGlvbilcblx0XHRcdGNvbnN0IG1hcmtkb3duUGFydHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdC8vIEdlbmVyYXRlIGEgc3RhYmxlIHN1YkFnZW50SW52b2NhdGlvbklkIGZvciByb3V0aW5nIGVkaXRzIHRvIHRoaXMgc3ViYWdlbnQncyBjb250ZW50IHBhcnQuXG5cdFx0XHQvLyBVc2UgY2hhdFN0cmVhbVRvb2xDYWxsSWQgd2hlbiBhdmFpbGFibGUgYmVjYXVzZSB0aGF0IGlzIHdoYXQgQ2hhdFRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWRcblx0XHRcdC8vIHVzZXMgaW4gdGhlIHJlbmRlcmVyIChzZWUgUFIgIzMwMjg2MyksIGFuZCB0aGUgc3ViYWdlbnQgZ3JvdXBpbmcgbWF0Y2hlcyBvbiB0b29sQ2FsbElkLlxuXHRcdFx0Y29uc3Qgc3ViQWdlbnRJbnZvY2F0aW9uSWQgPSBpbnZvY2F0aW9uLmNoYXRTdHJlYW1Ub29sQ2FsbElkID8/IGludm9jYXRpb24uY2FsbElkID8/IGBzdWJhZ2VudC0ke2dlbmVyYXRlVXVpZCgpfWA7XG5cblx0XHRcdGxldCBpbkVkaXQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHByb2dyZXNzQ2FsbGJhY2sgPSAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHtcblx0XHRcdFx0XHQvLyBVc2FnZSBldmVudHMgY2FycnkgdGhlIHN1YmFnZW50J3MgcnVubmluZyBjcmVkaXQgdG90YWw7IGtlZXAgdGhlXG5cdFx0XHRcdFx0Ly8gbGF0ZXN0IGZvciBpdHMgaG92ZXIgYW5kIGZvbGQgaXQgaW50byB0aGUgcGFyZW50IHJlc3BvbnNlIHRvdGFsLlxuXHRcdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICd1c2FnZScpIHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcGFydC5jb3BpbG90Q3JlZGl0cyA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHBhcnQuY29waWxvdENyZWRpdHMpICYmIHBhcnQuY29waWxvdENyZWRpdHMgPj0gMCkge1xuXHRcdFx0XHRcdFx0XHRzdWJhZ2VudENyZWRpdHMgPSBNYXRoLm1heChzdWJhZ2VudENyZWRpdHMgPz8gMCwgcGFydC5jb3BpbG90Q3JlZGl0cyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gV3JpdGUgY2VydGFpbiBwYXJ0cyBpbW1lZGlhdGVseSB0byB0aGUgbW9kZWxcblx0XHRcdFx0XHRpZiAocGFydC5raW5kID09PSAndGV4dEVkaXQnIHx8IHBhcnQua2luZCA9PT0gJ25vdGVib29rRWRpdCcgfHwgcGFydC5raW5kID09PSAnY29kZWJsb2NrVXJpJykge1xuXHRcdFx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ2NvZGVibG9ja1VyaScgJiYgIWluRWRpdCkge1xuXHRcdFx0XHRcdFx0XHRpbkVkaXQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnYGBgXFxuJykgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyBBdHRhY2ggc3ViQWdlbnRJbnZvY2F0aW9uSWQgdG8gY29kZWJsb2NrVXJpIHBhcnRzIHNvIHRoZXkgY2FuIGJlIHJvdXRlZCB0byB0aGUgc3ViYWdlbnQgY29udGVudCBwYXJ0XG5cdFx0XHRcdFx0XHRpZiAocGFydC5raW5kID09PSAnY29kZWJsb2NrVXJpJykge1xuXHRcdFx0XHRcdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHsgLi4ucGFydCwgc3ViQWdlbnRJbnZvY2F0aW9uSWQgfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKHJlcXVlc3QsIHBhcnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAnaG9vaycpIHtcblx0XHRcdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgeyAuLi5wYXJ0LCBzdWJBZ2VudEludm9jYXRpb25JZCB9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcpIHtcblx0XHRcdFx0XHRcdGlmIChpbkVkaXQpIHtcblx0XHRcdFx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1xcbmBgYFxcblxcbicpIH0pO1xuXHRcdFx0XHRcdFx0XHRpbkVkaXQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gQ29sbGVjdCBtYXJrZG93biBjb250ZW50IGZvciB0aGUgdG9vbCByZXN1bHRcblx0XHRcdFx0XHRcdG1hcmtkb3duUGFydHMucHVzaChwYXJ0LmNvbnRlbnQudmFsdWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRGV0ZXJtaW5lIHdoZXRoZXIgdGhlIHN1YmFnZW50IHNob3VsZCBiZSBhbGxvd2VkIHRvIHNwYXduIGl0cyBvd24gc3ViYWdlbnRzLlxuXHRcdFx0Y29uc3QgYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlN1YmFnZW50c0FsbG93SW52b2NhdGlvbnNGcm9tU3ViYWdlbnRzKSA/PyBmYWxzZTtcblx0XHRcdGNvbnN0IG1heERlcHRoID0gYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHMgPyBSVU5fU1VCQUdFTlRfTUFYX05FU1RJTkdfREVQVEggOiAwO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbktleSA9IGludm9jYXRpb24uY29udGV4dC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGN1cnJlbnREZXB0aCA9IHRoaXMuX3Nlc3Npb25EZXB0aC5nZXQoc2Vzc2lvbktleSkgPz8gMDtcblx0XHRcdGNvbnN0IGRlcHRoQWxsb3dlZCA9IGN1cnJlbnREZXB0aCArIDEgPD0gbWF4RGVwdGg7XG5cblx0XHRcdGlmICghbW9kZVRvb2xzKSB7XG5cdFx0XHRcdC8vIEluaXRpYWxpemUgbW9kZVRvb2xzIHNvIHRoYXQgd2UgY2FuIHN0aWxsIGVuZm9yY2UgdGhlIG1heCBkZXB0aCByZXN0cmljdGlvblxuXHRcdFx0XHRtb2RlVG9vbHMgPSB7fTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSBmdXJ0aGVyLXJlc3RyaWN0IFJ1blN1YmFnZW50VG9vbDogZG8gbm90IHJlLWVuYWJsZSBpdCBpZiBpdCB3YXMgZXhwbGljaXRseSBkaXNhYmxlZC5cblx0XHRcdGNvbnN0IGV4aXN0aW5nUnVuU3ViYWdlbnRFbmFibGVtZW50ID0gbW9kZVRvb2xzW1J1blN1YmFnZW50VG9vbC5JZF07XG5cdFx0XHRpZiAoZXhpc3RpbmdSdW5TdWJhZ2VudEVuYWJsZW1lbnQgIT09IGZhbHNlKSB7XG5cdFx0XHRcdG1vZGVUb29sc1tSdW5TdWJhZ2VudFRvb2wuSWRdID0gZGVwdGhBbGxvd2VkOyAvLyBvbmx5IGVuYWJsZSB0aGUgUnVuIFN1YmFnZW50IHRvb2wgaWYgd2UgYXJlIHVuZGVyIHRoZSBtYXggZGVwdGggbGltaXRcblx0XHRcdH1cblxuXHRcdFx0bW9kZVRvb2xzW01hbmFnZVRvZG9MaXN0VG9vbFRvb2xJZF0gPSBmYWxzZTtcblx0XHRcdG1vZGVUb29sc1snY29waWxvdF9hc2tRdWVzdGlvbnMnXSA9IGZhbHNlO1xuXG5cdFx0XHRpZiAobWF4RGVwdGggPiAwKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgUnVuU3ViYWdlbnRUb29sOiBOZXN0ZWQgc3ViYWdlbnRzIGVuYWJsaW5nICR7bW9kZVRvb2xzW1J1blN1YmFnZW50VG9vbC5JZF19OiBzZXNzaW9uICR7c2Vzc2lvbktleX0sIGN1cnJlbnREZXB0aDogJHtjdXJyZW50RGVwdGh9LCBtYXhEZXB0aDogJHttYXhEZXB0aH0sIGFsbG93SW52b2NhdGlvbnNGcm9tU3ViYWdlbnRzOiAke2FsbG93SW52b2NhdGlvbnNGcm9tU3ViYWdlbnRzfWApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2YXJpYWJsZVNldCA9IG5ldyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0KCk7XG5cdFx0XHQvLyBXaGVuIHRoZSBleHRlbnNpb24gaXMgcmVzcG9uc2libGUgZm9yIGluc3RydWN0aW9uIGNvbGxlY3Rpb24sIHNraXAgdGhlIGNvcmUgcGF0aCBlbnRpcmVseS5cblx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNvbGxlY3RJbnN0cnVjdGlvbnNJbkV4dGVuc2lvbikgIT09IHRydWUpIHtcblx0XHRcdFx0Y29uc3QgY29tcHV0ZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbXB1dGVBdXRvbWF0aWNJbnN0cnVjdGlvbnMsIENoYXRNb2RlS2luZC5BZ2VudCwgbW9kZVRvb2xzLCB1bmRlZmluZWQsIGdldENoYXRTZXNzaW9uVHlwZShpbnZvY2F0aW9uLmNvbnRleHQuc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0XHRcdGF3YWl0IGNvbXB1dGVyLmNvbGxlY3QodmFyaWFibGVTZXQsIHRva2VuKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29sbGVjdCBob29rcyBmcm9tIGhvb2sgLmpzb24gZmlsZXNcblx0XHRcdGxldCBjb2xsZWN0ZWRIb29rczogQ2hhdFJlcXVlc3RIb29rcyB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmdldEhvb2tzKHRva2VuKTtcblx0XHRcdFx0Y29sbGVjdGVkSG9va3MgPSBpbmZvPy5ob29rcztcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQ2hhdFNlcnZpY2VdIEZhaWxlZCB0byBjb2xsZWN0IGhvb2tzOicsIGVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWVyZ2Ugc3ViYWdlbnQtbGV2ZWwgaG9va3MgKGZyb20gdGhlIGFnZW50J3MgZnJvbnRtYXR0ZXIpIHdpdGggZ2xvYmFsIGhvb2tzLlxuXHRcdFx0Ly8gUmVtYXAgU3RvcCBob29rcyB0byBTdWJhZ2VudFN0b3Agc2luY2UgdGhlIGFnZW50IGlzIHJ1bm5pbmcgYXMgYSBzdWJhZ2VudC5cblx0XHRcdGlmIChzdWJhZ2VudD8uaG9va3MpIHtcblx0XHRcdFx0Y29uc3QgcmVtYXBwZWQ6IENoYXRSZXF1ZXN0SG9va3MgPSB7IC4uLnN1YmFnZW50Lmhvb2tzIH07XG5cdFx0XHRcdGlmIChyZW1hcHBlZFtIb29rVHlwZS5TdG9wXSkge1xuXHRcdFx0XHRcdGNvbnN0IHN0b3BIb29rcyA9IHJlbWFwcGVkW0hvb2tUeXBlLlN0b3BdO1xuXHRcdFx0XHRcdChyZW1hcHBlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbSG9va1R5cGUuU3ViYWdlbnRTdG9wXSA9IHJlbWFwcGVkW0hvb2tUeXBlLlN1YmFnZW50U3RvcF1cblx0XHRcdFx0XHRcdD8gWy4uLnJlbWFwcGVkW0hvb2tUeXBlLlN1YmFnZW50U3RvcF0sIC4uLnN0b3BIb29rc11cblx0XHRcdFx0XHRcdDogc3RvcEhvb2tzO1xuXHRcdFx0XHRcdChyZW1hcHBlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbSG9va1R5cGUuU3RvcF0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29sbGVjdGVkSG9va3MgPSBtZXJnZUhvb2tzKGNvbGxlY3RlZEhvb2tzLCByZW1hcHBlZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEJ1aWxkIHRoZSBhZ2VudCByZXF1ZXN0XG5cdFx0XHRjb25zdCBhZ2VudFJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0ID0ge1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGludm9jYXRpb24uY29udGV4dC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogaW52b2NhdGlvbi5jYWxsSWQgPz8gYHN1YmFnZW50LSR7RGF0ZS5ub3coKX1gLFxuXHRcdFx0XHRhZ2VudElkOiBkZWZhdWx0QWdlbnQuaWQsXG5cdFx0XHRcdG1lc3NhZ2U6IGFyZ3MucHJvbXB0LFxuXHRcdFx0XHR2YXJpYWJsZXM6IHsgdmFyaWFibGVzOiB2YXJpYWJsZVNldC5hc0FycmF5KCkgfSxcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkOiBzdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdFx0c3ViQWdlbnROYW1lOiBlZmZlY3RpdmVTdWJBZ2VudE5hbWUsXG5cdFx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6IG1vZGVNb2RlbElkLFxuXHRcdFx0XHRtb2RlbENvbmZpZ3VyYXRpb246IG1vZGVNb2RlbElkID8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TW9kZWxDb25maWd1cmF0aW9uKG1vZGVNb2RlbElkKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXNlclNlbGVjdGVkVG9vbHM6IG1vZGVUb29scyxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9ucyxcblx0XHRcdFx0cGFyZW50UmVxdWVzdElkOiBpbnZvY2F0aW9uLmNoYXRSZXF1ZXN0SWQsXG5cdFx0XHRcdGhvb2tzOiBjb2xsZWN0ZWRIb29rcyxcblx0XHRcdFx0aGFzSG9va3NFbmFibGVkOiAhIWNvbGxlY3RlZEhvb2tzICYmIE9iamVjdC52YWx1ZXMoY29sbGVjdGVkSG9va3MpLnNvbWUoYXJyID0+IGFyciAmJiBhcnIubGVuZ3RoID4gMCksXG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBTdWJzY3JpYmUgdG8gdG9vbCBpbnZvY2F0aW9ucyB0byBjbGVhciBtYXJrZG93biBwYXJ0cyB3aGVuIGEgdG9vbCBpcyBpbnZva2VkXG5cdFx0XHRzdG9yZS5hZGQodGhpcy5sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLm9uRGlkSW52b2tlVG9vbChlID0+IHtcblx0XHRcdFx0aWYgKGUuc3ViYWdlbnRJbnZvY2F0aW9uSWQgPT09IHN1YkFnZW50SW52b2NhdGlvbklkKSB7XG5cdFx0XHRcdFx0bWFya2Rvd25QYXJ0cy5sZW5ndGggPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEludm9rZSB0aGUgYWdlbnQsIHRyYWNraW5nIG5lc3RpbmcgZGVwdGggZm9yIHJlY3Vyc2lvbiBkZXRlY3Rpb25cblx0XHRcdHRoaXMuX3Nlc3Npb25EZXB0aC5zZXQoc2Vzc2lvbktleSwgY3VycmVudERlcHRoICsgMSk7XG5cdFx0XHRsZXQgcmVzdWx0OiBJQ2hhdEFnZW50UmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmludm9rZUFnZW50KFxuXHRcdFx0XHRcdGRlZmF1bHRBZ2VudC5pZCxcblx0XHRcdFx0XHRhZ2VudFJlcXVlc3QsXG5cdFx0XHRcdFx0cHJvZ3Jlc3NDYWxsYmFjayxcblx0XHRcdFx0XHRbXSxcblx0XHRcdFx0XHR0b2tlblxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0Y29uc3QgbmV3RGVwdGggPSAodGhpcy5fc2Vzc2lvbkRlcHRoLmdldChzZXNzaW9uS2V5KSA/PyAxKSAtIDE7XG5cdFx0XHRcdGlmIChuZXdEZXB0aCA8PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbkRlcHRoLmRlbGV0ZShzZXNzaW9uS2V5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uRGVwdGguc2V0KHNlc3Npb25LZXksIG5ld0RlcHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBmb3IgZXJyb3JzXG5cdFx0XHRpZiAocmVzdWx0Py5lcnJvckRldGFpbHMpIHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZVRvb2xTaW1wbGVUZXh0UmVzdWx0KGBBZ2VudCBlcnJvcjogJHtyZXN1bHQuZXJyb3JEZXRhaWxzLm1lc3NhZ2V9YCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoaXMgaXMgYSBoYWNrIGR1ZSB0byB0aGUgZmFjdCB0aGF0IGVkaXRzIGFyZSByZXByZXNlbnRlZCBhcyBlbXB0eSBjb2RlYmxvY2tzIHdpdGggVVJJcy4gVGhhdCBuZWVkcyB0byBiZSBjbGVhbmVkIHVwLFxuXHRcdFx0Ly8gaW4gdGhlIG1lYW50aW1lLCBqdXN0IHN0cmlwIGFuIGVtcHR5IGNvZGVibG9jayBsZWZ0IGJlaGluZC5cblx0XHRcdGNvbnN0IHJlc3VsdFRleHQgPSBtYXJrZG93blBhcnRzLmpvaW4oJycpLnJlcGxhY2UoL15cXG4qYGBgXFxuK2BgYFxcbiovZywgJycpLnRyaW0oKSB8fCAnQWdlbnQgY29tcGxldGVkIHdpdGggbm8gb3V0cHV0JztcblxuXHRcdFx0Ly8gU3RvcmUgcmVzdWx0IGluIHRvb2xTcGVjaWZpY0RhdGEgZm9yIHNlcmlhbGl6YXRpb25cblx0XHRcdGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnJlc3VsdCA9IHJlc3VsdFRleHQ7XG5cdFx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5tb2RlbE5hbWUgPSByZXNvbHZlZE1vZGVsTmFtZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmV0dXJuIHJlc3VsdCB3aXRoIHRvb2xNZXRhZGF0YSBjb250YWluaW5nIHN1YkFnZW50SW52b2NhdGlvbklkIGZvciB0cmFqZWN0b3J5IHRyYWNraW5nXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogcmVzdWx0VGV4dFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dG9vbE1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGFyZ3MuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0YWdlbnROYW1lOiBhZ2VudFJlcXVlc3Quc3ViQWdlbnROYW1lLFxuXHRcdFx0XHRcdG1vZGVsTmFtZTogcmVzb2x2ZWRNb2RlbE5hbWUsXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gYEVycm9yIGludm9raW5nIHN1YmFnZW50OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InfWA7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3JNZXNzYWdlLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gY3JlYXRlVG9vbFNpbXBsZVRleHRSZXN1bHQoZXJyb3JNZXNzYWdlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHN1YmFnZW50Q3JlZGl0cyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJlcXVlc3QucmVzcG9uc2U/LnNldFN1YmFnZW50Q29waWxvdENyZWRpdHMoaW52b2NhdGlvbi5jYWxsSWQsIHN1YmFnZW50Q3JlZGl0cyk7XG5cdFx0XHRcdGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyA9IHN1YmFnZW50Q3JlZGl0cztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0U3ViQWdlbnRCeU5hbWUobmFtZTogc3RyaW5nKTogUHJvbWlzZTxJQ3VzdG9tQWdlbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhZ2VudHMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gYWdlbnRzLmZpbmQoYWdlbnQgPT4gYWdlbnQubmFtZSA9PT0gbmFtZSAmJiBhZ2VudC5lbmFibGVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVja3MgaWYgYSBtb2RlbCBleGNlZWRzIHRoZSBtYWluIG1vZGVsJ3MgY29zdCB0aWVyIGJhc2VkIG9uIG11bHRpcGxpZXIuXG5cdCAqIEByZXR1cm5zIEFuIG9iamVjdCB3aXRoIGBleGNlZWRzOiB0cnVlYCBhbmQgYSByZWFzb24gc3RyaW5nIGlmIGJsb2NrZWQsIG9yIGBleGNlZWRzOiBmYWxzZWAgaWYgYWxsb3dlZC5cblx0ICovXG5cdHByaXZhdGUgY2hlY2tNdWx0aXBsaWVyQ29uc3RyYWludChtb2RlbElkOiBzdHJpbmcsIG1haW5Nb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7IGV4Y2VlZHM6IGZhbHNlIH0gfCB7IGV4Y2VlZHM6IHRydWU7IHJlYXNvbjogc3RyaW5nIH0ge1xuXHRcdGlmICghbWFpbk1vZGVsSWQgfHwgbW9kZWxJZCA9PT0gbWFpbk1vZGVsSWQpIHtcblx0XHRcdHJldHVybiB7IGV4Y2VlZHM6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFpbk1vZGVsTWV0YWRhdGEgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG1haW5Nb2RlbElkKTtcblx0XHRjb25zdCBtb2RlbE1ldGFkYXRhID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlbElkKTtcblx0XHRjb25zdCBtYWluTXVsdGlwbGllciA9IG1haW5Nb2RlbE1ldGFkYXRhPy5tdWx0aXBsaWVyTnVtZXJpYztcblx0XHRjb25zdCBtb2RlbE11bHRpcGxpZXIgPSBtb2RlbE1ldGFkYXRhPy5tdWx0aXBsaWVyTnVtZXJpYztcblxuXHRcdGlmIChtYWluTXVsdGlwbGllciAhPT0gdW5kZWZpbmVkICYmIG1vZGVsTXVsdGlwbGllciAhPT0gdW5kZWZpbmVkICYmIG1vZGVsTXVsdGlwbGllciA+IG1haW5NdWx0aXBsaWVyKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleGNlZWRzOiB0cnVlLFxuXHRcdFx0XHRyZWFzb246IGBleGNlZWRzIHRoZSBjdXJyZW50IG1vZGVsJ3MgY29zdCB0aWVyICgke21vZGVsTXVsdGlwbGllcn14IHZzICR7bWFpbk11bHRpcGxpZXJ9eClgXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGV4Y2VlZHM6IGZhbHNlIH07XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBpbmZvcm1hdGlvbiBhYm91dCBhdmFpbGFibGUgbW9kZWxzIGZvciBlcnJvciBtZXNzYWdlcy5cblx0ICogSW5jbHVkZXMgd2hpY2ggbW9kZWxzIGFyZSB1bmF2YWlsYWJsZSBkdWUgdG8gbXVsdGlwbGllciByZXN0cmljdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIGdldEF2YWlsYWJsZU1vZGVsc0luZm8obWFpbk1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpXG5cdFx0XHQubWFwKGlkID0+ICh7IGlkLCBtZXRhZGF0YTogdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChpZCkgfSkpXG5cdFx0XHQuZmlsdGVyKChtKTogbSBpcyB7IGlkOiBzdHJpbmc7IG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB9ID0+XG5cdFx0XHRcdCEhbS5tZXRhZGF0YVxuXHRcdFx0XHQmJiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5zdWl0YWJsZUZvckFnZW50TW9kZShtLm1ldGFkYXRhKVxuXHRcdFx0XHQmJiBtLm1ldGFkYXRhLmlzVXNlclNlbGVjdGFibGUgIT09IGZhbHNlXG5cdFx0XHRcdCYmICFtLm1ldGFkYXRhLnRhcmdldENoYXRTZXNzaW9uVHlwZVxuXHRcdFx0KTtcblxuXHRcdGlmIChtb2RlbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJ05vIG1vZGVscyBhdmFpbGFibGUuJztcblx0XHR9XG5cblx0XHRjb25zdCBhdmFpbGFibGU6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgdW5hdmFpbGFibGVEdWVUb011bHRpcGxpZXI6IHN0cmluZ1tdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHsgaWQsIG1ldGFkYXRhIH0gb2YgbW9kZWxzKSB7XG5cdFx0XHRjb25zdCBxdWFsaWZpZWROYW1lID0gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuYXNRdWFsaWZpZWROYW1lKG1ldGFkYXRhKTtcblx0XHRcdGNvbnN0IGNoZWNrID0gdGhpcy5jaGVja011bHRpcGxpZXJDb25zdHJhaW50KGlkLCBtYWluTW9kZWxJZCk7XG5cblx0XHRcdGlmIChjaGVjay5leGNlZWRzKSB7XG5cdFx0XHRcdHVuYXZhaWxhYmxlRHVlVG9NdWx0aXBsaWVyLnB1c2gocXVhbGlmaWVkTmFtZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhdmFpbGFibGUucHVzaChxdWFsaWZpZWROYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoYXZhaWxhYmxlLmxlbmd0aCA+IDApIHtcblx0XHRcdHBhcnRzLnB1c2goYEF2YWlsYWJsZSBtb2RlbHM6ICR7YXZhaWxhYmxlLmpvaW4oJywgJyl9YCk7XG5cdFx0fVxuXHRcdGlmICh1bmF2YWlsYWJsZUR1ZVRvTXVsdGlwbGllci5sZW5ndGggPiAwKSB7XG5cdFx0XHRwYXJ0cy5wdXNoKGBVbmF2YWlsYWJsZSAoZXhjZWVkcyBjdXJyZW50IG1vZGVsJ3MgY29zdCB0aWVyKTogJHt1bmF2YWlsYWJsZUR1ZVRvTXVsdGlwbGllci5qb2luKCcsICcpfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXJ0cy5qb2luKCcuICcpIHx8ICdObyBtb2RlbHMgYXZhaWxhYmxlLic7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIG1vZGVsIHRvIGJlIHVzZWQgYnkgYSBzdWJhZ2VudC5cblx0ICogQHBhcmFtIGV4cGxpY2l0TW9kZWxRdWFsaWZpZWROYW1lIE9wdGlvbmFsIGV4cGxpY2l0IG1vZGVsIHNwZWNpZmllZCBieSB0aGUgY2FsbGVyLlxuXHQgKiAgICAgICAgSWYgcHJvdmlkZWQgYW5kIG5vdCBmb3VuZCBvciBub3QgYWxsb3dlZCwgdGhyb3dzIGFuIGVycm9yIHdpdGggYXZhaWxhYmxlIG1vZGVscy5cblx0ICogQHRocm93cyBFcnJvciBpZiB0aGUgcmVxdWVzdGVkIG1vZGVsIGlzIG5vdCBmb3VuZCBvciBleGNlZWRzIHRoZSBtYWluIG1vZGVsJ3MgY29zdCB0aWVyLlxuXHQgKi9cblx0cHJpdmF0ZSByZXNvbHZlU3ViYWdlbnRNb2RlbChzdWJhZ2VudDogSUN1c3RvbUFnZW50IHwgdW5kZWZpbmVkLCBtYWluTW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBleHBsaWNpdE1vZGVsUXVhbGlmaWVkTmFtZT86IHN0cmluZyk6IHsgbW9kZU1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVzb2x2ZWRNb2RlbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHtcblx0XHRsZXQgbW9kZU1vZGVsSWQgPSBtYWluTW9kZWxJZDtcblx0XHRsZXQgZXhwbGljaXRNb2RlbFJlc29sdmVkID0gZmFsc2U7XG5cblx0XHQvLyBFeHBsaWNpdCBtb2RlbCBwYXJhbWV0ZXIgdGFrZXMgaGlnaGVzdCBwcmlvcml0eVxuXHRcdGlmIChleHBsaWNpdE1vZGVsUXVhbGlmaWVkTmFtZSkge1xuXHRcdFx0Y29uc3QgbG0gPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsQnlRdWFsaWZpZWROYW1lKGV4cGxpY2l0TW9kZWxRdWFsaWZpZWROYW1lKTtcblx0XHRcdGlmIChsbT8uaWRlbnRpZmllcikge1xuXHRcdFx0XHRtb2RlTW9kZWxJZCA9IGxtLmlkZW50aWZpZXI7XG5cdFx0XHRcdGV4cGxpY2l0TW9kZWxSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBNb2RlbCBub3QgZm91bmQgLSB0aHJvdyBlcnJvciB3aXRoIGF2YWlsYWJsZSBtb2RlbHNcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBSZXF1ZXN0ZWQgbW9kZWwgJyR7ZXhwbGljaXRNb2RlbFF1YWxpZmllZE5hbWV9JyBub3QgZm91bmQuICR7dGhpcy5nZXRBdmFpbGFibGVNb2RlbHNJbmZvKG1haW5Nb2RlbElkKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc3ViYWdlbnQgJiYgIWV4cGxpY2l0TW9kZWxSZXNvbHZlZCkge1xuXHRcdFx0Y29uc3QgbW9kZU1vZGVsUXVhbGlmaWVkTmFtZXMgPSBzdWJhZ2VudC5tb2RlbDtcblx0XHRcdGlmIChtb2RlTW9kZWxRdWFsaWZpZWROYW1lcykge1xuXHRcdFx0XHQvLyBXaGVuIHRoZSBtYWluIG1vZGVsIGlzIEJZT0sgKGZsYWdnZWQgdmlhIGBtZXRhZGF0YS5pc0JZT0tgKSwgc2tpcCBDb3BpbG90L0NBUEkgZmFsbGJhY2sgbW9kZWxzXG5cdFx0XHRcdC8vIGZvciBidWlsdC1pbiBhZ2VudHMgKGUuZy4gRXhwbG9yZSksIHdob3NlIG1vZGVsIGxpc3QgaXMgYSBjdXJhdGVkIGNvbnZlbmllbmNlIGZhbGxiYWNrLiBBXG5cdFx0XHRcdC8vIHVzZXItYXV0aG9yZWQgYWdlbnQncyBtb2RlbCBsaXN0IGlzIGEgZGVsaWJlcmF0ZSBjaG9pY2UgYW5kIGlzIGFsd2F5cyBob25vcmVkIGFzLWlzLlxuXHRcdFx0XHRjb25zdCBtYWluTW9kZWxNZXRhZGF0YSA9IG1haW5Nb2RlbElkID8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtYWluTW9kZWxJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IG1haW5Nb2RlbElzQnlvayA9ICEhbWFpbk1vZGVsTWV0YWRhdGEgJiYgaXNCeW9rTW9kZWwobWFpbk1vZGVsTWV0YWRhdGEpO1xuXHRcdFx0XHRjb25zdCBza2lwQ29waWxvdEZhbGxiYWNrcyA9IG1haW5Nb2RlbElzQnlvayAmJiBpc0J1aWx0aW5BZ2VudChzdWJhZ2VudC5zb3VyY2UsIHN1YmFnZW50LnVyaSwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0XHRcdC8vIEZpbmQgdGhlIGFjdHVhbCBtb2RlbCBpZGVudGlmaWVyIGZyb20gdGhlIHF1YWxpZmllZCBuYW1lKHMpXG5cdFx0XHRcdGZvciAoY29uc3QgcXVhbGlmaWVkTmFtZSBvZiBtb2RlTW9kZWxRdWFsaWZpZWROYW1lcykge1xuXHRcdFx0XHRcdGNvbnN0IGxtQnlRdWFsaWZpZWROYW1lID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbEJ5UXVhbGlmaWVkTmFtZShxdWFsaWZpZWROYW1lKTtcblx0XHRcdFx0XHRpZiAobG1CeVF1YWxpZmllZE5hbWU/LmlkZW50aWZpZXIpIHtcblx0XHRcdFx0XHRcdGlmIChza2lwQ29waWxvdEZhbGxiYWNrcyAmJiBsbUJ5UXVhbGlmaWVkTmFtZS5tZXRhZGF0YS52ZW5kb3IgPT09IENPUElMT1RfVkVORE9SX0lEKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bW9kZU1vZGVsSWQgPSBsbUJ5UXVhbGlmaWVkTmFtZS5pZGVudGlmaWVyO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgbXVsdGlwbGllciBjb25zdHJhaW50IC0gdGhyb3cgZXJyb3IgaWYgcmVxdWVzdGVkIG1vZGVsIGV4Y2VlZHMgbWFpbiBtb2RlbCdzIGNvc3QgdGllclxuXHRcdGlmIChtb2RlTW9kZWxJZCkge1xuXHRcdFx0Y29uc3QgY2hlY2sgPSB0aGlzLmNoZWNrTXVsdGlwbGllckNvbnN0cmFpbnQobW9kZU1vZGVsSWQsIG1haW5Nb2RlbElkKTtcblx0XHRcdGlmIChjaGVjay5leGNlZWRzKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsTWV0YWRhdGEgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVNb2RlbElkKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBSZXF1ZXN0ZWQgbW9kZWwgJyR7bW9kZWxNZXRhZGF0YT8ubmFtZX0nICR7Y2hlY2sucmVhc29ufS4gJHt0aGlzLmdldEF2YWlsYWJsZU1vZGVsc0luZm8obWFpbk1vZGVsSWQpfWApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkTW9kZWxNZXRhZGF0YSA9IG1vZGVNb2RlbElkID8gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlTW9kZWxJZCkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHsgbW9kZU1vZGVsSWQsIHJlc29sdmVkTW9kZWxOYW1lOiByZXNvbHZlZE1vZGVsTWV0YWRhdGE/Lm5hbWUgfTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYXJncyA9IGNvbnRleHQucGFyYW1ldGVycyBhcyBJUnVuU3ViYWdlbnRUb29sSW5wdXRQYXJhbXM7XG5cdFx0Y29uc3QgcmVxdWVzdGVkQWdlbnROYW1lID0gdGhpcy5ub3JtYWxpemVSZXF1ZXN0ZWRBZ2VudE5hbWUoYXJncy5hZ2VudE5hbWUpO1xuXG5cdFx0Y29uc3Qgc3ViYWdlbnQgPSByZXF1ZXN0ZWRBZ2VudE5hbWUgPyBhd2FpdCB0aGlzLmdldFN1YkFnZW50QnlOYW1lKHJlcXVlc3RlZEFnZW50TmFtZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY3VycmVudE1vZGVJbnN0cnVjdGlvbnMgPSBjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UgPyB0aGlzLmdldEN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zKGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cblx0XHQvLyBSZXNvbHZlIHRoZSBtb2RlbCBlYXJseSBhbmQgY2FjaGUgaXQgZm9yIGludm9rZSgpXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLnJlc29sdmVTdWJhZ2VudE1vZGVsKHN1YmFnZW50LCBjb250ZXh0Lm1vZGVsSWQsIGFyZ3MubW9kZWwpO1xuXHRcdHRoaXMuX3Jlc29sdmVkTW9kZWxzLnNldChjb250ZXh0LnRvb2xDYWxsSWQsIHJlc29sdmVkKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogYXJncy5kZXNjcmlwdGlvbixcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGFyZ3MuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGFnZW50TmFtZTogc3ViYWdlbnQ/Lm5hbWUgPz8gcmVxdWVzdGVkQWdlbnROYW1lID8/IGN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zPy5uYW1lLFxuXHRcdFx0XHRwcm9tcHQ6IGFyZ3MucHJvbXB0LFxuXHRcdFx0XHRtb2RlbE5hbWU6IHJlc29sdmVkLnJlc29sdmVkTW9kZWxOYW1lLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBub3JtYWxpemVSZXF1ZXN0ZWRBZ2VudE5hbWUoYWdlbnROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSBhZ2VudE5hbWU/LnRyaW0oKTtcblx0XHRyZXR1cm4gbm9ybWFsaXplZCA/IG5vcm1hbGl6ZWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zKHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24gIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdHJldHVybiBtb2RlbD8uZ2V0UmVxdWVzdHMoKS5hdCgtMSk/Lm1vZGVJbmZvPy5tb2RlSW5zdHJ1Y3Rpb25zO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsWUFBWSx1QkFBdUI7QUFFNUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBd0Isb0JBQW9CO0FBQzVDLFNBQVMsbUJBQW1CLG1CQUFtQixvQkFBb0I7QUFDbkUsU0FBUyxtQkFBbUIsNEJBQTRCLDhCQUE4QjtBQUV0RixTQUFTLDBCQUEwQjtBQUNuQyxTQUE4Qyx5QkFBeUI7QUFDdkUsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBMkIs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
