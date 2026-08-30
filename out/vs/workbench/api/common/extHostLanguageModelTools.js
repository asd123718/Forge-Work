import { raceCancellation } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { CancellationError } from "../../../base/common/errors.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { revive } from "../../../base/common/marshalling.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { isToolInvocationContext } from "../../contrib/chat/common/tools/languageModelToolsService.js";
import { computeCombinationKey } from "../../contrib/chat/common/tools/languageModelToolsConfirmationService.js";
import { ExtensionEditToolId, InternalEditToolId } from "../../contrib/chat/common/tools/builtinTools/editFileTool.js";
import { InternalFetchWebPageToolId } from "../../contrib/chat/common/tools/builtinTools/tools.js";
import { SearchExtensionsToolId } from "../../contrib/extensions/common/searchExtensionsTool.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { MainContext } from "./extHost.protocol.js";
import * as typeConvert from "./extHostTypeConverters.js";
import { URI } from "../../../base/common/uri.js";
class Tool {
  constructor(data) {
    this._data = data;
  }
  update(newData) {
    this._data = newData;
    this._apiObject = void 0;
    this._apiObjectWithChatParticipantAdditions = void 0;
  }
  get data() {
    return this._data;
  }
  get apiObject() {
    if (!this._apiObject) {
      this._apiObject = Object.freeze({
        name: this._data.id,
        description: this._data.modelDescription,
        inputSchema: this._data.inputSchema,
        fullReferenceName: this._data.fullReferenceName,
        tags: this._data.tags ?? [],
        source: void 0
      });
    }
    return this._apiObject;
  }
  get apiObjectWithChatParticipantAdditions() {
    if (!this._apiObjectWithChatParticipantAdditions) {
      this._apiObjectWithChatParticipantAdditions = Object.freeze({
        name: this._data.id,
        description: this._data.modelDescription,
        inputSchema: this._data.inputSchema,
        tags: this._data.tags ?? [],
        source: typeConvert.LanguageModelToolSource.to(this._data.source),
        fullReferenceName: this._data.fullReferenceName
      });
    }
    return this._apiObjectWithChatParticipantAdditions;
  }
}
class ExtHostLanguageModelTools {
  constructor(mainContext, _languageModels) {
    this._languageModels = _languageModels;
    /** A map of tools that were registered in this EH */
    this._registeredTools = /* @__PURE__ */ new Map();
    this._tokenCountFuncs = /* @__PURE__ */ new Map();
    /** A map of all known tools, from other EHs or registered in vscode core */
    this._allTools = /* @__PURE__ */ new Map();
    this._proxy = mainContext.getProxy(MainContext.MainThreadLanguageModelTools);
    this._proxy.$getTools().then((tools) => {
      for (const tool of tools) {
        this._allTools.set(tool.id, new Tool(revive(tool)));
      }
    });
  }
  async $countTokensForInvocation(callId, input, token) {
    const fn = this._tokenCountFuncs.get(callId);
    if (!fn) {
      throw new Error(`Tool invocation call ${callId} not found`);
    }
    return await fn(input, token);
  }
  async invokeTool(extension, toolIdOrInfo, options, token) {
    const toolId = typeof toolIdOrInfo === "string" ? toolIdOrInfo : toolIdOrInfo.name;
    const callId = generateUuid();
    if (options.tokenizationOptions) {
      this._tokenCountFuncs.set(callId, options.tokenizationOptions.countTokens);
    }
    try {
      if (options.toolInvocationToken && !isToolInvocationContext(options.toolInvocationToken)) {
        throw new Error(`Invalid tool invocation token`);
      }
      if ((toolId === InternalEditToolId || toolId === ExtensionEditToolId) && !isProposedApiEnabled(extension, "chatParticipantPrivate")) {
        throw new Error(`Invalid tool: ${toolId}`);
      }
      const result = await this._proxy.$invokeTool({
        toolId,
        callId,
        parameters: options.input,
        tokenBudget: options.tokenizationOptions?.tokenBudget,
        context: options.toolInvocationToken,
        chatRequestId: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.chatRequestId : void 0,
        chatInteractionId: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.chatInteractionId : void 0,
        subAgentInvocationId: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.subAgentInvocationId : void 0,
        chatStreamToolCallId: isProposedApiEnabled(extension, "chatParticipantAdditions") ? options.chatStreamToolCallId : void 0,
        preToolUseResult: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.preToolUseResult : void 0,
        traceparent: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.traceparent : void 0,
        tracestate: isProposedApiEnabled(extension, "chatParticipantPrivate") ? options.tracestate : void 0
      }, token);
      const dto = result instanceof SerializableObjectWithBuffers ? result.value : result;
      return typeConvert.LanguageModelToolResult.to(revive(dto));
    } finally {
      this._tokenCountFuncs.delete(callId);
    }
  }
  $onDidChangeTools(tools) {
    const oldTools = new Set(this._allTools.keys());
    for (const tool of tools) {
      oldTools.delete(tool.id);
      const existing = this._allTools.get(tool.id);
      if (existing) {
        existing.update(tool);
      } else {
        this._allTools.set(tool.id, new Tool(revive(tool)));
      }
    }
    for (const id of oldTools) {
      this._allTools.delete(id);
    }
  }
  getTools(extension) {
    const hasParticipantAdditions = isProposedApiEnabled(extension, "chatParticipantPrivate");
    return Array.from(this._allTools.values()).map((tool) => hasParticipantAdditions ? tool.apiObjectWithChatParticipantAdditions : tool.apiObject).filter((tool) => {
      switch (tool.name) {
        case InternalEditToolId:
        case ExtensionEditToolId:
        case InternalFetchWebPageToolId:
        case SearchExtensionsToolId:
          return isProposedApiEnabled(extension, "chatParticipantPrivate");
        default:
          return true;
      }
    });
  }
  async $invokeTool(dto, token) {
    const item = this._registeredTools.get(dto.toolId);
    if (!item) {
      throw new Error(`Unknown tool ${dto.toolId}`);
    }
    const options = {
      input: dto.parameters,
      toolInvocationToken: revive(dto.context)
    };
    if (isProposedApiEnabled(item.extension, "chatParticipantPrivate")) {
      options.chatRequestId = dto.chatRequestId;
      options.chatInteractionId = dto.chatInteractionId;
      options.chatSessionResource = URI.revive(dto.context?.sessionResource);
      options.workingDirectory = URI.revive(dto.context?.workingDirectory);
      options.subAgentInvocationId = dto.subAgentInvocationId;
      options.traceparent = dto.traceparent;
      options.tracestate = dto.tracestate;
    }
    if (isProposedApiEnabled(item.extension, "chatParticipantAdditions") && dto.modelId) {
      options.model = await this.getModel(dto.modelId, item.extension);
    }
    if (isProposedApiEnabled(item.extension, "chatParticipantAdditions") && dto.chatStreamToolCallId) {
      options.chatStreamToolCallId = dto.chatStreamToolCallId;
    }
    if (dto.tokenBudget !== void 0) {
      options.tokenizationOptions = {
        tokenBudget: dto.tokenBudget,
        countTokens: this._tokenCountFuncs.get(dto.callId) || ((value, token2 = CancellationToken.None) => this._proxy.$countTokensForInvocation(dto.callId, value, token2))
      };
    }
    let progress;
    if (isProposedApiEnabled(item.extension, "toolProgress")) {
      let lastProgress;
      progress = {
        report: (value) => {
          if (value.increment !== void 0) {
            lastProgress = (lastProgress ?? 0) + value.increment;
          }
          this._proxy.$acceptToolProgress(dto.callId, {
            message: typeConvert.MarkdownString.fromStrict(value.message),
            progress: lastProgress === void 0 ? void 0 : lastProgress / 100
          });
        }
      };
    }
    const extensionResult = await raceCancellation(Promise.resolve(item.tool.invoke(options, token, progress)), token);
    if (!extensionResult) {
      throw new CancellationError();
    }
    return typeConvert.LanguageModelToolResult.from(extensionResult, item.extension);
  }
  async getModel(modelId, extension) {
    let model;
    if (modelId) {
      model = await this._languageModels.getLanguageModelByIdentifier(extension, modelId);
    }
    if (!model) {
      model = await this._languageModels.getDefaultLanguageModel(extension);
      if (!model) {
        throw new Error("Language model unavailable");
      }
    }
    return model;
  }
  async $handleToolStream(toolId, context, token) {
    const item = this._registeredTools.get(toolId);
    if (!item) {
      throw new Error(`Unknown tool ${toolId}`);
    }
    if (!item.tool.handleToolStream) {
      return void 0;
    }
    checkProposedApiEnabled(item.extension, "chatParticipantAdditions");
    const options = {
      rawInput: context.rawInput,
      chatRequestId: context.chatRequestId,
      chatSessionResource: context.chatSessionResource,
      chatInteractionId: context.chatInteractionId
    };
    const result = await item.tool.handleToolStream(options, token);
    if (!result) {
      return void 0;
    }
    return {
      invocationMessage: typeConvert.MarkdownString.fromStrict(result.invocationMessage)
    };
  }
  async $prepareToolInvocation(toolId, context, token) {
    const item = this._registeredTools.get(toolId);
    if (!item) {
      throw new Error(`Unknown tool ${toolId}`);
    }
    const options = {
      input: context.parameters,
      chatRequestId: context.chatRequestId,
      chatSessionResource: context.chatSessionResource,
      chatInteractionId: context.chatInteractionId,
      workingDirectory: URI.revive(context.workingDirectory),
      forceConfirmationReason: context.forceConfirmationReason
    };
    if (context.forceConfirmationReason) {
      checkProposedApiEnabled(item.extension, "chatParticipantPrivate");
    }
    if (item.tool.prepareInvocation) {
      const result = await item.tool.prepareInvocation(options, token);
      if (!result) {
        return void 0;
      }
      if (result.pastTenseMessage || result.presentation) {
        checkProposedApiEnabled(item.extension, "chatParticipantPrivate");
      }
      if (result.confirmationMessages?.approveCombination !== void 0) {
        checkProposedApiEnabled(item.extension, "toolInvocationApproveCombination");
      }
      const approveCombination = result.confirmationMessages?.approveCombination;
      const approveCombinationLabel = approveCombination ? typeConvert.MarkdownString.fromStrict(approveCombination.message) : void 0;
      const approveCombinationKey = approveCombinationLabel ? await computeCombinationKey(toolId, context.parameters) : void 0;
      return {
        confirmationMessages: result.confirmationMessages ? {
          title: typeof result.confirmationMessages.title === "string" ? result.confirmationMessages.title : typeConvert.MarkdownString.from(result.confirmationMessages.title),
          message: typeof result.confirmationMessages.message === "string" ? result.confirmationMessages.message : typeConvert.MarkdownString.from(result.confirmationMessages.message),
          approveCombination: approveCombinationLabel && approveCombinationKey ? { label: approveCombinationLabel, key: approveCombinationKey, arguments: approveCombination.arguments } : void 0
        } : void 0,
        invocationMessage: typeConvert.MarkdownString.fromStrict(result.invocationMessage),
        pastTenseMessage: typeConvert.MarkdownString.fromStrict(result.pastTenseMessage),
        presentation: result.presentation
      };
    }
    return void 0;
  }
  registerTool(extension, id, tool) {
    this._registeredTools.set(id, { extension, tool });
    this._proxy.$registerTool(id, typeof tool.handleToolStream === "function");
    return toDisposable(() => {
      this._registeredTools.delete(id);
      this._proxy.$unregisterTool(id);
    });
  }
  registerToolDefinition(extension, definition, tool) {
    checkProposedApiEnabled(extension, "languageModelToolSupportsModel");
    const id = definition.name;
    const dto = {
      id,
      displayName: definition.displayName,
      toolReferenceName: definition.toolReferenceName,
      userDescription: definition.userDescription,
      modelDescription: definition.description,
      inputSchema: definition.inputSchema,
      source: {
        type: "extension",
        label: extension.displayName ?? extension.name,
        extensionId: extension.identifier
      },
      icon: typeConvert.IconPath.from(definition.icon),
      models: definition.models,
      toolSet: definition.toolSet,
      tags: definition.tags,
      fullReferenceName: void 0
      // will be filled in on the main thread based on the extension ID and tool reference name
    };
    this._registeredTools.set(id, { extension, tool });
    this._proxy.$registerToolWithDefinition(extension.identifier, dto, typeof tool.handleToolStream === "function");
    return toDisposable(() => {
      this._registeredTools.delete(id);
      this._proxy.$unregisterTool(id);
    });
  }
}
export {
  ExtHostLanguageModelTools
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVN0cmVhbWVkVG9vbEludm9jYXRpb24sIGlzVG9vbEludm9jYXRpb25Db250ZXh0LCBJVG9vbEludm9jYXRpb24sIElUb29sSW52b2NhdGlvbkNvbnRleHQsIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgSVRvb2xJbnZvY2F0aW9uU3RyZWFtQ29udGV4dCwgSVRvb2xSZXN1bHQsIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVDb21iaW5hdGlvbktleSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25FZGl0VG9vbElkLCBJbnRlcm5hbEVkaXRUb29sSWQgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9lZGl0RmlsZVRvb2wuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxGZXRjaFdlYlBhZ2VUb29sSWQgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy90b29scy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hFeHRlbnNpb25zVG9vbElkIH0gZnJvbSAnLi4vLi4vY29udHJpYi9leHRlbnNpb25zL2NvbW1vbi9zZWFyY2hFeHRlbnNpb25zVG9vbC5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCwgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IER0bywgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgRXh0SG9zdExhbmd1YWdlTW9kZWxUb29sc1NoYXBlLCBJTWFpbkNvbnRleHQsIElUb29sRGF0YUR0bywgSVRvb2xEZWZpbml0aW9uRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZExhbmd1YWdlTW9kZWxUb29sc1NoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZU1vZGVscyB9IGZyb20gJy4vZXh0SG9zdExhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmNsYXNzIFRvb2wge1xuXG5cdHByaXZhdGUgX2RhdGE6IElUb29sRGF0YUR0bztcblx0cHJpdmF0ZSBfYXBpT2JqZWN0OiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbmZvcm1hdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYXBpT2JqZWN0V2l0aENoYXRQYXJ0aWNpcGFudEFkZGl0aW9uczogdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sSW5mb3JtYXRpb24gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoZGF0YTogSVRvb2xEYXRhRHRvKSB7XG5cdFx0dGhpcy5fZGF0YSA9IGRhdGE7XG5cdH1cblxuXHR1cGRhdGUobmV3RGF0YTogSVRvb2xEYXRhRHRvKTogdm9pZCB7XG5cdFx0dGhpcy5fZGF0YSA9IG5ld0RhdGE7XG5cdFx0dGhpcy5fYXBpT2JqZWN0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2FwaU9iamVjdFdpdGhDaGF0UGFydGljaXBhbnRBZGRpdGlvbnMgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgZGF0YSgpOiBJVG9vbERhdGFEdG8ge1xuXHRcdHJldHVybiB0aGlzLl9kYXRhO1xuXHR9XG5cblx0Z2V0IGFwaU9iamVjdCgpOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbmZvcm1hdGlvbiB7XG5cdFx0aWYgKCF0aGlzLl9hcGlPYmplY3QpIHtcblx0XHRcdHRoaXMuX2FwaU9iamVjdCA9IE9iamVjdC5mcmVlemUoe1xuXHRcdFx0XHRuYW1lOiB0aGlzLl9kYXRhLmlkLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5fZGF0YS5tb2RlbERlc2NyaXB0aW9uLFxuXHRcdFx0XHRpbnB1dFNjaGVtYTogdGhpcy5fZGF0YS5pbnB1dFNjaGVtYSxcblx0XHRcdFx0ZnVsbFJlZmVyZW5jZU5hbWU6IHRoaXMuX2RhdGEuZnVsbFJlZmVyZW5jZU5hbWUsXG5cdFx0XHRcdHRhZ3M6IHRoaXMuX2RhdGEudGFncyA/PyBbXSxcblx0XHRcdFx0c291cmNlOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYXBpT2JqZWN0O1xuXHR9XG5cblx0Z2V0IGFwaU9iamVjdFdpdGhDaGF0UGFydGljaXBhbnRBZGRpdGlvbnMoKSB7XG5cdFx0aWYgKCF0aGlzLl9hcGlPYmplY3RXaXRoQ2hhdFBhcnRpY2lwYW50QWRkaXRpb25zKSB7XG5cdFx0XHR0aGlzLl9hcGlPYmplY3RXaXRoQ2hhdFBhcnRpY2lwYW50QWRkaXRpb25zID0gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0XHRcdG5hbWU6IHRoaXMuX2RhdGEuaWQsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLl9kYXRhLm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0XHRcdGlucHV0U2NoZW1hOiB0aGlzLl9kYXRhLmlucHV0U2NoZW1hLFxuXHRcdFx0XHR0YWdzOiB0aGlzLl9kYXRhLnRhZ3MgPz8gW10sXG5cdFx0XHRcdHNvdXJjZTogdHlwZUNvbnZlcnQuTGFuZ3VhZ2VNb2RlbFRvb2xTb3VyY2UudG8odGhpcy5fZGF0YS5zb3VyY2UpLFxuXHRcdFx0XHRmdWxsUmVmZXJlbmNlTmFtZTogdGhpcy5fZGF0YS5mdWxsUmVmZXJlbmNlTmFtZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hcGlPYmplY3RXaXRoQ2hhdFBhcnRpY2lwYW50QWRkaXRpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbFRvb2xzIGltcGxlbWVudHMgRXh0SG9zdExhbmd1YWdlTW9kZWxUb29sc1NoYXBlIHtcblx0LyoqIEEgbWFwIG9mIHRvb2xzIHRoYXQgd2VyZSByZWdpc3RlcmVkIGluIHRoaXMgRUggKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0ZXJlZFRvb2xzID0gbmV3IE1hcDxzdHJpbmcsIHsgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247IHRvb2w6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbDxPYmplY3Q+IH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbFRvb2xzU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuQ291bnRGdW5jcyA9IG5ldyBNYXA8LyogY2FsbCBJRCAqL3N0cmluZywgKHRleHQ6IHN0cmluZywgdG9rZW4/OiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFRoZW5hYmxlPG51bWJlcj4+KCk7XG5cblx0LyoqIEEgbWFwIG9mIGFsbCBrbm93biB0b29scywgZnJvbSBvdGhlciBFSHMgb3IgcmVnaXN0ZXJlZCBpbiB2c2NvZGUgY29yZSAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGxUb29scyA9IG5ldyBNYXA8c3RyaW5nLCBUb29sPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBJTWFpbkNvbnRleHQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbHM6IEV4dEhvc3RMYW5ndWFnZU1vZGVscyxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbFRvb2xzKTtcblxuXHRcdHRoaXMuX3Byb3h5LiRnZXRUb29scygpLnRoZW4odG9vbHMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xzKSB7XG5cdFx0XHRcdHRoaXMuX2FsbFRvb2xzLnNldCh0b29sLmlkLCBuZXcgVG9vbChyZXZpdmUodG9vbCkpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICRjb3VudFRva2Vuc0Zvckludm9jYXRpb24oY2FsbElkOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0Y29uc3QgZm4gPSB0aGlzLl90b2tlbkNvdW50RnVuY3MuZ2V0KGNhbGxJZCk7XG5cdFx0aWYgKCFmbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUb29sIGludm9jYXRpb24gY2FsbCAke2NhbGxJZH0gbm90IGZvdW5kYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF3YWl0IGZuKGlucHV0LCB0b2tlbik7XG5cdH1cblxuXHRhc3luYyBpbnZva2VUb29sKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB0b29sSWRPckluZm86IHN0cmluZyB8IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEluZm9ybWF0aW9uLCBvcHRpb25zOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbnZvY2F0aW9uT3B0aW9uczxhbnk+LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCB0b29sSWQgPSB0eXBlb2YgdG9vbElkT3JJbmZvID09PSAnc3RyaW5nJyA/IHRvb2xJZE9ySW5mbyA6IHRvb2xJZE9ySW5mby5uYW1lO1xuXHRcdGNvbnN0IGNhbGxJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGlmIChvcHRpb25zLnRva2VuaXphdGlvbk9wdGlvbnMpIHtcblx0XHRcdHRoaXMuX3Rva2VuQ291bnRGdW5jcy5zZXQoY2FsbElkLCBvcHRpb25zLnRva2VuaXphdGlvbk9wdGlvbnMuY291bnRUb2tlbnMpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAob3B0aW9ucy50b29sSW52b2NhdGlvblRva2VuICYmICFpc1Rvb2xJbnZvY2F0aW9uQ29udGV4dChvcHRpb25zLnRvb2xJbnZvY2F0aW9uVG9rZW4pKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCB0b29sIGludm9jYXRpb24gdG9rZW5gKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCh0b29sSWQgPT09IEludGVybmFsRWRpdFRvb2xJZCB8fCB0b29sSWQgPT09IEV4dGVuc2lvbkVkaXRUb29sSWQpICYmICFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJykpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHRvb2w6ICR7dG9vbElkfWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtpbmcgdGhlIHJvdW5kIHRyaXAgaGVyZSBiZWNhdXNlIG5vdCBhbGwgdG9vbHMgd2VyZSBuZWNlc3NhcmlseSByZWdpc3RlcmVkIGluIHRoaXMgRUhcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRpbnZva2VUb29sKHtcblx0XHRcdFx0dG9vbElkLFxuXHRcdFx0XHRjYWxsSWQsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IG9wdGlvbnMuaW5wdXQsXG5cdFx0XHRcdHRva2VuQnVkZ2V0OiBvcHRpb25zLnRva2VuaXphdGlvbk9wdGlvbnM/LnRva2VuQnVkZ2V0LFxuXHRcdFx0XHRjb250ZXh0OiBvcHRpb25zLnRvb2xJbnZvY2F0aW9uVG9rZW4gYXMgSVRvb2xJbnZvY2F0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCxcblx0XHRcdFx0Y2hhdFJlcXVlc3RJZDogaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpID8gb3B0aW9ucy5jaGF0UmVxdWVzdElkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjaGF0SW50ZXJhY3Rpb25JZDogaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpID8gb3B0aW9ucy5jaGF0SW50ZXJhY3Rpb25JZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKSA/IG9wdGlvbnMuc3ViQWdlbnRJbnZvY2F0aW9uSWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNoYXRTdHJlYW1Ub29sQ2FsbElkOiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKSA/IG9wdGlvbnMuY2hhdFN0cmVhbVRvb2xDYWxsSWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByZVRvb2xVc2VSZXN1bHQ6IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKSA/IG9wdGlvbnMucHJlVG9vbFVzZVJlc3VsdCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dHJhY2VwYXJlbnQ6IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKSA/IG9wdGlvbnMudHJhY2VwYXJlbnQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRyYWNlc3RhdGU6IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKSA/IG9wdGlvbnMudHJhY2VzdGF0ZSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHRva2VuKTtcblxuXHRcdFx0Y29uc3QgZHRvOiBEdG88SVRvb2xSZXN1bHQ+ID0gcmVzdWx0IGluc3RhbmNlb2YgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgPyByZXN1bHQudmFsdWUgOiByZXN1bHQ7XG5cdFx0XHRyZXR1cm4gdHlwZUNvbnZlcnQuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQudG8ocmV2aXZlKGR0bykpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl90b2tlbkNvdW50RnVuY3MuZGVsZXRlKGNhbGxJZCk7XG5cdFx0fVxuXHR9XG5cblx0JG9uRGlkQ2hhbmdlVG9vbHModG9vbHM6IElUb29sRGF0YUR0b1tdKTogdm9pZCB7XG5cblx0XHRjb25zdCBvbGRUb29scyA9IG5ldyBTZXQodGhpcy5fYWxsVG9vbHMua2V5cygpKTtcblxuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29scykge1xuXHRcdFx0b2xkVG9vbHMuZGVsZXRlKHRvb2wuaWQpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9hbGxUb29scy5nZXQodG9vbC5pZCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0ZXhpc3RpbmcudXBkYXRlKHRvb2wpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fYWxsVG9vbHMuc2V0KHRvb2wuaWQsIG5ldyBUb29sKHJldml2ZSh0b29sKSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgaWQgb2Ygb2xkVG9vbHMpIHtcblx0XHRcdHRoaXMuX2FsbFRvb2xzLmRlbGV0ZShpZCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0VG9vbHMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbmZvcm1hdGlvbltdIHtcblx0XHRjb25zdCBoYXNQYXJ0aWNpcGFudEFkZGl0aW9ucyA9IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblxuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2FsbFRvb2xzLnZhbHVlcygpKVxuXHRcdFx0Lm1hcCh0b29sID0+IGhhc1BhcnRpY2lwYW50QWRkaXRpb25zID8gdG9vbC5hcGlPYmplY3RXaXRoQ2hhdFBhcnRpY2lwYW50QWRkaXRpb25zIDogdG9vbC5hcGlPYmplY3QpXG5cdFx0XHQuZmlsdGVyKHRvb2wgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKHRvb2wubmFtZSkge1xuXHRcdFx0XHRcdGNhc2UgSW50ZXJuYWxFZGl0VG9vbElkOlxuXHRcdFx0XHRcdGNhc2UgRXh0ZW5zaW9uRWRpdFRvb2xJZDpcblx0XHRcdFx0XHRjYXNlIEludGVybmFsRmV0Y2hXZWJQYWdlVG9vbElkOlxuXHRcdFx0XHRcdGNhc2UgU2VhcmNoRXh0ZW5zaW9uc1Rvb2xJZDpcblx0XHRcdFx0XHRcdHJldHVybiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICRpbnZva2VUb29sKGR0bzogRHRvPElUb29sSW52b2NhdGlvbj4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RHRvPElUb29sUmVzdWx0PiB8IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPER0bzxJVG9vbFJlc3VsdD4+PiB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX3JlZ2lzdGVyZWRUb29scy5nZXQoZHRvLnRvb2xJZCk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG9vbCAke2R0by50b29sSWR9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9uczogdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sSW52b2NhdGlvbk9wdGlvbnM8T2JqZWN0PiA9IHtcblx0XHRcdGlucHV0OiBkdG8ucGFyYW1ldGVycyxcblx0XHRcdHRvb2xJbnZvY2F0aW9uVG9rZW46IHJldml2ZShkdG8uY29udGV4dCkgYXMgdW5rbm93biBhcyB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50VG9vbFRva2VuIHwgdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0aWYgKGlzUHJvcG9zZWRBcGlFbmFibGVkKGl0ZW0uZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpKSB7XG5cdFx0XHRvcHRpb25zLmNoYXRSZXF1ZXN0SWQgPSBkdG8uY2hhdFJlcXVlc3RJZDtcblx0XHRcdG9wdGlvbnMuY2hhdEludGVyYWN0aW9uSWQgPSBkdG8uY2hhdEludGVyYWN0aW9uSWQ7XG5cdFx0XHRvcHRpb25zLmNoYXRTZXNzaW9uUmVzb3VyY2UgPSBVUkkucmV2aXZlKGR0by5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0b3B0aW9ucy53b3JraW5nRGlyZWN0b3J5ID0gVVJJLnJldml2ZShkdG8uY29udGV4dD8ud29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRvcHRpb25zLnN1YkFnZW50SW52b2NhdGlvbklkID0gZHRvLnN1YkFnZW50SW52b2NhdGlvbklkO1xuXHRcdFx0b3B0aW9ucy50cmFjZXBhcmVudCA9IGR0by50cmFjZXBhcmVudDtcblx0XHRcdG9wdGlvbnMudHJhY2VzdGF0ZSA9IGR0by50cmFjZXN0YXRlO1xuXHRcdH1cblxuXHRcdGlmIChpc1Byb3Bvc2VkQXBpRW5hYmxlZChpdGVtLmV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudEFkZGl0aW9ucycpICYmIGR0by5tb2RlbElkKSB7XG5cdFx0XHRvcHRpb25zLm1vZGVsID0gYXdhaXQgdGhpcy5nZXRNb2RlbChkdG8ubW9kZWxJZCwgaXRlbS5leHRlbnNpb24pO1xuXHRcdH1cblx0XHRpZiAoaXNQcm9wb3NlZEFwaUVuYWJsZWQoaXRlbS5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKSAmJiBkdG8uY2hhdFN0cmVhbVRvb2xDYWxsSWQpIHtcblx0XHRcdG9wdGlvbnMuY2hhdFN0cmVhbVRvb2xDYWxsSWQgPSBkdG8uY2hhdFN0cmVhbVRvb2xDYWxsSWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGR0by50b2tlbkJ1ZGdldCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRvcHRpb25zLnRva2VuaXphdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHRcdHRva2VuQnVkZ2V0OiBkdG8udG9rZW5CdWRnZXQsXG5cdFx0XHRcdGNvdW50VG9rZW5zOiB0aGlzLl90b2tlbkNvdW50RnVuY3MuZ2V0KGR0by5jYWxsSWQpIHx8ICgodmFsdWUsIHRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkgPT5cblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kY291bnRUb2tlbnNGb3JJbnZvY2F0aW9uKGR0by5jYWxsSWQsIHZhbHVlLCB0b2tlbikpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGxldCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHsgbWVzc2FnZT86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZzsgaW5jcmVtZW50PzogbnVtYmVyIH0+IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpc1Byb3Bvc2VkQXBpRW5hYmxlZChpdGVtLmV4dGVuc2lvbiwgJ3Rvb2xQcm9ncmVzcycpKSB7XG5cdFx0XHRsZXQgbGFzdFByb2dyZXNzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRwcm9ncmVzcyA9IHtcblx0XHRcdFx0cmVwb3J0OiB2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlLmluY3JlbWVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRsYXN0UHJvZ3Jlc3MgPSAobGFzdFByb2dyZXNzID8/IDApICsgdmFsdWUuaW5jcmVtZW50O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRUb29sUHJvZ3Jlc3MoZHRvLmNhbGxJZCwge1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogdHlwZUNvbnZlcnQuTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdCh2YWx1ZS5tZXNzYWdlKSxcblx0XHRcdFx0XHRcdHByb2dyZXNzOiBsYXN0UHJvZ3Jlc3MgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGxhc3RQcm9ncmVzcyAvIDEwMCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyB0b2RvOiAnYW55JyBjYXN0IGJlY2F1c2UgVFMgY2FuJ3QgaGFuZGxlIHRoZSBvdmVybG9hZHNcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCBleHRlbnNpb25SZXN1bHQgPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKFByb21pc2UucmVzb2x2ZSgoaXRlbS50b29sLmludm9rZSBhcyBhbnkpKG9wdGlvbnMsIHRva2VuLCBwcm9ncmVzcyEpKSwgdG9rZW4pO1xuXHRcdGlmICghZXh0ZW5zaW9uUmVzdWx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHlwZUNvbnZlcnQuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQuZnJvbShleHRlbnNpb25SZXN1bHQsIGl0ZW0uZXh0ZW5zaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TW9kZWwobW9kZWxJZDogc3RyaW5nLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IFByb21pc2U8dnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0PiB7XG5cdFx0bGV0IG1vZGVsOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1vZGVsSWQpIHtcblx0XHRcdG1vZGVsID0gYXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHMuZ2V0TGFuZ3VhZ2VNb2RlbEJ5SWRlbnRpZmllcihleHRlbnNpb24sIG1vZGVsSWQpO1xuXHRcdH1cblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRtb2RlbCA9IGF3YWl0IHRoaXMuX2xhbmd1YWdlTW9kZWxzLmdldERlZmF1bHRMYW5ndWFnZU1vZGVsKGV4dGVuc2lvbik7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTGFuZ3VhZ2UgbW9kZWwgdW5hdmFpbGFibGUnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRhc3luYyAkaGFuZGxlVG9vbFN0cmVhbSh0b29sSWQ6IHN0cmluZywgY29udGV4dDogSVRvb2xJbnZvY2F0aW9uU3RyZWFtQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU3RyZWFtZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9yZWdpc3RlcmVkVG9vbHMuZ2V0KHRvb2xJZCk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdG9vbCAke3Rvb2xJZH1gKTtcblx0XHR9XG5cblx0XHQvLyBPbmx5IGNhbGwgaGFuZGxlVG9vbFN0cmVhbSBpZiBpdCdzIGRlZmluZWQgb24gdGhlIHRvb2xcblx0XHRpZiAoIWl0ZW0udG9vbC5oYW5kbGVUb29sU3RyZWFtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEVuc3VyZSB0aGUgY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zIEFQSSBpcyBlbmFibGVkXG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoaXRlbS5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEludm9jYXRpb25TdHJlYW1PcHRpb25zPGFueT4gPSB7XG5cdFx0XHRyYXdJbnB1dDogY29udGV4dC5yYXdJbnB1dCxcblx0XHRcdGNoYXRSZXF1ZXN0SWQ6IGNvbnRleHQuY2hhdFJlcXVlc3RJZCxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IGNvbnRleHQuY2hhdFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGNoYXRJbnRlcmFjdGlvbklkOiBjb250ZXh0LmNoYXRJbnRlcmFjdGlvbklkXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGl0ZW0udG9vbC5oYW5kbGVUb29sU3RyZWFtKG9wdGlvbnMsIHRva2VuKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHR5cGVDb252ZXJ0Lk1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3QocmVzdWx0Lmludm9jYXRpb25NZXNzYWdlKVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyAkcHJlcGFyZVRvb2xJbnZvY2F0aW9uKHRvb2xJZDogc3RyaW5nLCBjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fcmVnaXN0ZXJlZFRvb2xzLmdldCh0b29sSWQpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHRvb2wgJHt0b29sSWR9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9uczogdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sSW52b2NhdGlvblByZXBhcmVPcHRpb25zPGFueT4gPSB7XG5cdFx0XHRpbnB1dDogY29udGV4dC5wYXJhbWV0ZXJzLFxuXHRcdFx0Y2hhdFJlcXVlc3RJZDogY29udGV4dC5jaGF0UmVxdWVzdElkLFxuXHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y2hhdEludGVyYWN0aW9uSWQ6IGNvbnRleHQuY2hhdEludGVyYWN0aW9uSWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkucmV2aXZlKGNvbnRleHQud29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XHRmb3JjZUNvbmZpcm1hdGlvblJlYXNvbjogY29udGV4dC5mb3JjZUNvbmZpcm1hdGlvblJlYXNvblxuXHRcdH07XG5cdFx0aWYgKGNvbnRleHQuZm9yY2VDb25maXJtYXRpb25SZWFzb24pIHtcblx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGl0ZW0uZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXHRcdH1cblx0XHRpZiAoaXRlbS50b29sLnByZXBhcmVJbnZvY2F0aW9uKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpdGVtLnRvb2wucHJlcGFyZUludm9jYXRpb24ob3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc3VsdC5wYXN0VGVuc2VNZXNzYWdlIHx8IHJlc3VsdC5wcmVzZW50YXRpb24pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoaXRlbS5leHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQuY29uZmlybWF0aW9uTWVzc2FnZXM/LmFwcHJvdmVDb21iaW5hdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGl0ZW0uZXh0ZW5zaW9uLCAndG9vbEludm9jYXRpb25BcHByb3ZlQ29tYmluYXRpb24nKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYXBwcm92ZUNvbWJpbmF0aW9uID0gcmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hcHByb3ZlQ29tYmluYXRpb247XG5cdFx0XHRjb25zdCBhcHByb3ZlQ29tYmluYXRpb25MYWJlbCA9IGFwcHJvdmVDb21iaW5hdGlvblxuXHRcdFx0XHQ/IHR5cGVDb252ZXJ0Lk1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3QoYXBwcm92ZUNvbWJpbmF0aW9uLm1lc3NhZ2UpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgYXBwcm92ZUNvbWJpbmF0aW9uS2V5ID0gYXBwcm92ZUNvbWJpbmF0aW9uTGFiZWxcblx0XHRcdFx0PyBhd2FpdCBjb21wdXRlQ29tYmluYXRpb25LZXkodG9vbElkLCBjb250ZXh0LnBhcmFtZXRlcnMpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogcmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzID8ge1xuXHRcdFx0XHRcdHRpdGxlOiB0eXBlb2YgcmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLnRpdGxlID09PSAnc3RyaW5nJyA/IHJlc3VsdC5jb25maXJtYXRpb25NZXNzYWdlcy50aXRsZSA6IHR5cGVDb252ZXJ0Lk1hcmtkb3duU3RyaW5nLmZyb20ocmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLnRpdGxlKSxcblx0XHRcdFx0XHRtZXNzYWdlOiB0eXBlb2YgcmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2UgPT09ICdzdHJpbmcnID8gcmVzdWx0LmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2UgOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tKHJlc3VsdC5jb25maXJtYXRpb25NZXNzYWdlcy5tZXNzYWdlKSxcblx0XHRcdFx0XHRhcHByb3ZlQ29tYmluYXRpb246IGFwcHJvdmVDb21iaW5hdGlvbkxhYmVsICYmIGFwcHJvdmVDb21iaW5hdGlvbktleSA/IHsgbGFiZWw6IGFwcHJvdmVDb21iaW5hdGlvbkxhYmVsLCBrZXk6IGFwcHJvdmVDb21iaW5hdGlvbktleSwgYXJndW1lbnRzOiBhcHByb3ZlQ29tYmluYXRpb24hLmFyZ3VtZW50cyB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogdHlwZUNvbnZlcnQuTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChyZXN1bHQuaW52b2NhdGlvbk1lc3NhZ2UpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KHJlc3VsdC5wYXN0VGVuc2VNZXNzYWdlKSxcblx0XHRcdFx0cHJlc2VudGF0aW9uOiByZXN1bHQucHJlc2VudGF0aW9uIGFzIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmVnaXN0ZXJUb29sKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBpZDogc3RyaW5nLCB0b29sOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2w8YW55Pik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9yZWdpc3RlcmVkVG9vbHMuc2V0KGlkLCB7IGV4dGVuc2lvbiwgdG9vbCB9KTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJUb29sKGlkLCB0eXBlb2YgdG9vbC5oYW5kbGVUb29sU3RyZWFtID09PSAnZnVuY3Rpb24nKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJlZFRvb2xzLmRlbGV0ZShpZCk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlclRvb2woaWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVnaXN0ZXJUb29sRGVmaW5pdGlvbihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgZGVmaW5pdGlvbjogdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sRGVmaW5pdGlvbiwgdG9vbDogdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sPGFueT4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbGFuZ3VhZ2VNb2RlbFRvb2xTdXBwb3J0c01vZGVsJyk7XG5cblx0XHRjb25zdCBpZCA9IGRlZmluaXRpb24ubmFtZTtcblxuXHRcdC8vIENvbnZlcnQgdGhlIGRlZmluaXRpb24gdG8gYSBEVE9cblx0XHRjb25zdCBkdG86IElUb29sRGVmaW5pdGlvbkR0byA9IHtcblx0XHRcdGlkLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGRlZmluaXRpb24uZGlzcGxheU5hbWUsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogZGVmaW5pdGlvbi50b29sUmVmZXJlbmNlTmFtZSxcblx0XHRcdHVzZXJEZXNjcmlwdGlvbjogZGVmaW5pdGlvbi51c2VyRGVzY3JpcHRpb24sXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBkZWZpbml0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0aW5wdXRTY2hlbWE6IGRlZmluaXRpb24uaW5wdXRTY2hlbWEgYXMgb2JqZWN0LFxuXHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdHR5cGU6ICdleHRlbnNpb24nLFxuXHRcdFx0XHRsYWJlbDogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogdHlwZUNvbnZlcnQuSWNvblBhdGguZnJvbShkZWZpbml0aW9uLmljb24pLFxuXHRcdFx0bW9kZWxzOiBkZWZpbml0aW9uLm1vZGVscyxcblx0XHRcdHRvb2xTZXQ6IGRlZmluaXRpb24udG9vbFNldCxcblx0XHRcdHRhZ3M6IGRlZmluaXRpb24udGFncyxcblx0XHRcdGZ1bGxSZWZlcmVuY2VOYW1lOiB1bmRlZmluZWQsIC8vIHdpbGwgYmUgZmlsbGVkIGluIG9uIHRoZSBtYWluIHRocmVhZCBiYXNlZCBvbiB0aGUgZXh0ZW5zaW9uIElEIGFuZCB0b29sIHJlZmVyZW5jZSBuYW1lXG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyZWRUb29scy5zZXQoaWQsIHsgZXh0ZW5zaW9uLCB0b29sIH0pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclRvb2xXaXRoRGVmaW5pdGlvbihleHRlbnNpb24uaWRlbnRpZmllciwgZHRvLCB0eXBlb2YgdG9vbC5oYW5kbGVUb29sU3RyZWFtID09PSAnZnVuY3Rpb24nKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXJlZFRvb2xzLmRlbGV0ZShpZCk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlclRvb2woaWQpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFzQixvQkFBb0I7QUFDMUMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQTJELCtCQUFrTDtBQUM3TyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQiwwQkFBMEI7QUFDeEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyx5QkFBeUIsNEJBQTRCO0FBQzlELFNBQWMscUNBQXFDO0FBQ25ELFNBQXlGLG1CQUFzRDtBQUUvSSxZQUFZLGlCQUFpQjtBQUM3QixTQUFTLFdBQVc7QUFFcEIsTUFBTSxLQUFLO0FBQUEsRUFNVixZQUFZLE1BQW9CO0FBQy9CLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVBLE9BQU8sU0FBNkI7QUFDbkMsU0FBSyxRQUFRO0FBQ2IsU0FBSyxhQUFhO0FBQ2xCLFNBQUsseUNBQXlDO0FBQUEs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
