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
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { decodeBase64, VSBuffer } from "../../../../../../base/common/buffer.js";
import {
  getByokLmAgentModelId
} from "../../../../../../platform/agentHost/common/agentHostByokLm.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { ChatEntitlementContextKeys, IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import {
  ChatImageMimeType,
  ChatMessageRole,
  ILanguageModelsService
} from "../../../common/languageModels.js";
import { SessionType } from "../../../common/chatSessionsService.js";
const STATEFUL_MARKER_MIME_TYPE = "stateful_marker";
const USAGE_MIME_TYPE = "usage";
const REASONING_METADATA_PREFIX = "vscode-reasoning-metadata:";
const VSCODE_REASONING_SUMMARY_PART_DONE = "vscode_reasoning_summary_part_done";
const CLIENT_BYOK_CONTEXT_KEYS = /* @__PURE__ */ new Set([ChatEntitlementContextKeys.clientByokEnabled.key]);
let AgentHostByokLmHandler = class extends Disposable {
  constructor(_languageModelsService, _logService, _chatEntitlementService, contextKeyService) {
    super();
    this._languageModelsService = _languageModelsService;
    this._logService = _logService;
    this._chatEntitlementService = _chatEntitlementService;
    this._onDidChangeModels = this._register(new Emitter());
    /** Fires when the renderer's BYOK models change, so the node agent host re-enumerates. */
    this.onDidChangeModels = this._onDidChangeModels.event;
    this._register(Event.debounce(this._languageModelsService.onDidChangeLanguageModels, () => void 0, 500)(() => {
      this._onDidChangeModels.fire();
    }));
    this._register(this._languageModelsService.onDidChangeModelVisibility(() => {
      this._onDidChangeModels.fire();
    }));
    this._register(Event.filter(contextKeyService.onDidChangeContext, (event) => event.affectsSome(CLIENT_BYOK_CONTEXT_KEYS))(() => {
      this._onDidChangeModels.fire();
    }));
  }
  async chat(request, token) {
    if (!this._chatEntitlementService.clientByokEnabled) {
      return { output: [], error: "BYOK models are disabled by policy." };
    }
    const modelIdentifier = this._resolveModelIdentifier(request.vendor, request.modelId);
    if (!modelIdentifier) {
      return { output: [], error: `No BYOK model found for ${request.vendor}/${request.modelId}` };
    }
    const messages = this._toChatMessages(request);
    const tools = request.tools?.length ? request.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.type === "function" ? tool.parametersSchema : { type: "object", properties: { input: { type: "string" } }, required: ["input"] }
    })) : void 0;
    const options = {
      modelOptions: request.modelOptions,
      includeEncryptedThinking: true,
      ...request.reasoningEffort ? { configuration: { reasoningEffort: request.reasoningEffort } } : {},
      ...tools ? { tools } : {}
    };
    try {
      const response = await this._languageModelsService.sendChatRequest(modelIdentifier, void 0, messages, options, token);
      const output = [];
      const customToolNames = new Set(request.tools?.filter((tool) => tool.type === "custom").map((tool) => tool.name));
      const completedReasoningSummaryParts = /* @__PURE__ */ new Set();
      let responseId;
      let usage;
      const streaming = (async () => {
        for await (const part of response.stream) {
          const parts = Array.isArray(part) ? part : [part];
          for (const p of parts) {
            if (p.type === "text") {
              this._appendTextOutput(output, p.value);
            } else if (p.type === "thinking") {
              if (p.metadata?.[VSCODE_REASONING_SUMMARY_PART_DONE] === true) {
                completedReasoningSummaryParts.add(p.id);
              } else {
                const startsNewSummaryPart = p.value.length > 0 && completedReasoningSummaryParts.delete(p.id);
                this._appendReasoningOutput(output, p, startsNewSummaryPart);
              }
            } else if (p.type === "tool_use") {
              if (customToolNames.has(p.name)) {
                output.push({
                  type: "custom_tool_call",
                  callId: p.toolCallId,
                  name: p.name,
                  input: this._customToolInput(p.parameters)
                });
              } else {
                output.push({
                  type: "function_call",
                  callId: p.toolCallId,
                  name: p.name,
                  argumentsJson: JSON.stringify(p.parameters ?? {})
                });
              }
            } else if (p.type === "data" && p.mimeType === STATEFUL_MARKER_MIME_TYPE) {
              responseId = this._decodeStatefulMarker(p.data, request.modelId);
            } else if (p.type === "data" && p.mimeType === USAGE_MIME_TYPE) {
              usage = this._decodeUsage(p.data);
            }
          }
        }
      })();
      await Promise.all([response.result, streaming]);
      return { output, responseId, usage };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._logService.warn(`[AgentHostByokLmHandler] chat request failed for ${request.vendor}/${request.modelId}: ${message}`);
      return { output: [], error: message };
    }
  }
  async listModels(_token) {
    if (!this._chatEntitlementService.clientByokEnabled) {
      return [];
    }
    const models = [];
    for (const identifier of this._languageModelsService.getLanguageModelIds()) {
      const metadata = this._languageModelsService.lookupLanguageModel(identifier);
      if (metadata?.isBYOK && !metadata.targetChatSessionType) {
        const reasoningEffortSchema = metadata.configurationSchema?.properties?.reasoningEffort;
        const supportedReasoningEfforts = reasoningEffortSchema?.enum?.filter((value) => typeof value === "string");
        const defaultReasoningEffort = typeof reasoningEffortSchema?.default === "string" ? reasoningEffortSchema.default : void 0;
        const model = {
          vendor: metadata.vendor,
          id: metadata.id,
          name: metadata.name,
          modelIdentifier: identifier,
          maxContextWindowTokens: metadata.maxInputTokens + metadata.maxOutputTokens,
          supportsVision: !!metadata.capabilities?.vision,
          ...supportedReasoningEfforts?.length ? { supportedReasoningEfforts } : {},
          ...defaultReasoningEffort !== void 0 ? { defaultReasoningEffort } : {}
        };
        const agentHostModelIdentifier = `${SessionType.AgentHostCopilot}:${getByokLmAgentModelId(model)}`;
        if (!this._languageModelsService.isModelHidden(identifier) && !this._languageModelsService.isModelHidden(agentHostModelIdentifier)) {
          models.push(model);
        }
      }
    }
    return models;
  }
  /**
   * Find the LM API identifier for a BYOK model addressed by its vendor and
   * provider-local id (the `provider/id` selection id the picker surfaced).
   */
  _resolveModelIdentifier(vendor, modelId) {
    const exactIdentifier = `${vendor}/${modelId}`;
    const exactMetadata = this._languageModelsService.lookupLanguageModel(exactIdentifier);
    if (exactMetadata?.isBYOK && exactMetadata.vendor === vendor) {
      return exactIdentifier;
    }
    for (const identifier of this._languageModelsService.getLanguageModelIds()) {
      const metadata = this._languageModelsService.lookupLanguageModel(identifier);
      if (metadata?.isBYOK && metadata.vendor === vendor && metadata.id === modelId) {
        return identifier;
      }
    }
    return void 0;
  }
  _toChatMessages(request) {
    const messages = [];
    if (request.previousResponseId) {
      messages.push({
        role: ChatMessageRole.Assistant,
        content: [{
          type: "data",
          mimeType: STATEFUL_MARKER_MIME_TYPE,
          data: VSBuffer.fromString(`${request.modelId}\\${request.previousResponseId}`)
        }]
      });
    }
    if (request.instructions) {
      messages.push({
        role: ChatMessageRole.System,
        content: [{ type: "text", value: request.instructions }]
      });
    }
    for (const item of request.input) {
      const message = this._toChatMessage(item);
      const previous = messages.at(-1);
      if (message.role === ChatMessageRole.Assistant && previous?.role === ChatMessageRole.Assistant) {
        messages[messages.length - 1] = {
          ...previous,
          content: [...previous.content, ...message.content]
        };
      } else {
        messages.push(message);
      }
    }
    return messages;
  }
  _toChatMessage(item) {
    switch (item.type) {
      case "message":
        return {
          role: this._toChatRole(item.role),
          content: this._toChatMessageParts(item.content)
        };
      case "reasoning": {
        return {
          role: ChatMessageRole.Assistant,
          content: [{
            type: "thinking",
            value: item.summary,
            id: item.id,
            metadata: {
              ...item.metadata,
              ...item.encryptedContent ? this._decodeReasoningMetadata(item.encryptedContent) : {}
            }
          }]
        };
      }
      case "function_call":
        return {
          role: ChatMessageRole.Assistant,
          content: [{
            type: "tool_use",
            name: item.name,
            toolCallId: item.callId,
            parameters: this._safeParseJson(item.argumentsJson)
          }]
        };
      case "custom_tool_call":
        return {
          role: ChatMessageRole.Assistant,
          content: [{
            type: "tool_use",
            name: item.name,
            toolCallId: item.callId,
            parameters: { input: item.input }
          }]
        };
      case "function_call_output":
      case "custom_tool_call_output":
        return {
          role: ChatMessageRole.User,
          content: [{
            type: "tool_result",
            toolCallId: item.callId,
            value: [{ type: "text", value: item.output }]
          }]
        };
    }
  }
  _toChatMessageParts(parts) {
    const result = [];
    for (const part of parts) {
      if (part.type === "text") {
        const previous = result.at(-1);
        if (previous?.type === "text") {
          previous.value += part.text;
        } else {
          result.push({ type: "text", value: part.text });
        }
      } else {
        result.push({ type: "image_url", value: { mimeType: this._toChatImageMimeType(part.mimeType), data: decodeBase64(part.data) } });
      }
    }
    return result.length ? result : [{ type: "text", value: "" }];
  }
  _toChatImageMimeType(mimeType) {
    switch (mimeType) {
      case "image/png":
        return ChatImageMimeType.PNG;
      case "image/jpeg":
        return ChatImageMimeType.JPEG;
      case "image/gif":
        return ChatImageMimeType.GIF;
      case "image/webp":
        return ChatImageMimeType.WEBP;
      case "image/bmp":
        return ChatImageMimeType.BMP;
    }
  }
  _appendTextOutput(output, value) {
    const previous = output.at(-1);
    if (previous?.type === "message") {
      output[output.length - 1] = {
        ...previous,
        content: [{ type: "text", text: previous.content.map((part) => part.text).join("") + value }]
      };
    } else {
      output.push({ type: "message", content: [{ type: "text", text: value }] });
    }
  }
  _appendReasoningOutput(output, part, startsNewSummaryPart) {
    if (part.metadata?.vscode_reasoning_done === true) {
      return;
    }
    const summary = Array.isArray(part.value) ? part.value : [part.value];
    const encryptedContent = this._encodeReasoningMetadata(part.metadata);
    const reasoning = {
      type: "reasoning",
      id: part.id,
      summary,
      encryptedContent,
      metadata: part.metadata
    };
    const previous = output.at(-1);
    if (previous?.type === "reasoning" && previous.id === reasoning.id) {
      output[output.length - 1] = {
        ...previous,
        summary: startsNewSummaryPart || Array.isArray(part.value) ? [...previous.summary, ...reasoning.summary] : this._mergeReasoningSummary(previous.summary, part.value),
        encryptedContent: reasoning.encryptedContent ?? previous.encryptedContent,
        metadata: previous.metadata || reasoning.metadata ? { ...previous.metadata, ...reasoning.metadata } : void 0
      };
    } else {
      output.push(reasoning);
    }
  }
  _mergeReasoningSummary(summary, value) {
    if (summary.length === 0) {
      return [value];
    }
    return [...summary.slice(0, -1), summary[summary.length - 1] + value];
  }
  _encodeReasoningMetadata(metadata) {
    const encryptedContent = this._stringMetadata(metadata, "encrypted_content") ?? this._stringMetadata(metadata, "encrypted");
    if (encryptedContent) {
      return encryptedContent;
    }
    const continuationMetadata = {
      ...this._stringMetadata(metadata, "signature") ? { signature: this._stringMetadata(metadata, "signature") } : {},
      ...this._stringMetadata(metadata, "_completeThinking") ? { _completeThinking: this._stringMetadata(metadata, "_completeThinking") } : {},
      ...this._stringMetadata(metadata, "redactedData") ? { redactedData: this._stringMetadata(metadata, "redactedData") } : {}
    };
    return Object.keys(continuationMetadata).length > 0 ? `${REASONING_METADATA_PREFIX}${JSON.stringify(continuationMetadata)}` : void 0;
  }
  _decodeReasoningMetadata(value) {
    if (!value.startsWith(REASONING_METADATA_PREFIX)) {
      return { encrypted_content: value };
    }
    const metadata = JSON.parse(value.slice(REASONING_METADATA_PREFIX.length));
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
      throw new Error("Invalid Agent Host BYOK reasoning metadata");
    }
    return metadata;
  }
  _customToolInput(parameters) {
    if (typeof parameters === "object" && parameters !== null) {
      const input = Object.getOwnPropertyDescriptor(parameters, "input")?.value;
      if (typeof input === "string") {
        return input;
      }
    }
    return typeof parameters === "string" ? parameters : JSON.stringify(parameters ?? {});
  }
  _decodeStatefulMarker(data, expectedModelId) {
    const decoded = data.toString();
    const separator = decoded.indexOf("\\");
    if (separator === -1 || decoded.slice(0, separator) !== expectedModelId) {
      return void 0;
    }
    return decoded.slice(separator + 1) || void 0;
  }
  _decodeUsage(data) {
    try {
      const value = JSON.parse(data.toString());
      const outputDetails = typeof value.completion_tokens_details === "object" && value.completion_tokens_details !== null ? value.completion_tokens_details : void 0;
      return {
        inputTokens: this._numberProperty(value, "prompt_tokens"),
        outputTokens: this._numberProperty(value, "completion_tokens"),
        reasoningTokens: outputDetails ? this._numberProperty(outputDetails, "reasoning_tokens") : void 0
      };
    } catch {
      return void 0;
    }
  }
  _numberProperty(value, key) {
    const property = value[key];
    return typeof property === "number" ? property : void 0;
  }
  _stringMetadata(metadata, key) {
    const value = metadata?.[key];
    return typeof value === "string" ? value : void 0;
  }
  _toChatRole(role) {
    switch (role) {
      case "system":
      case "developer":
        return ChatMessageRole.System;
      case "assistant":
        return ChatMessageRole.Assistant;
      case "user":
        return ChatMessageRole.User;
    }
  }
  _safeParseJson(json) {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }
};
AgentHostByokLmHandler = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IChatEntitlementService),
  __decorateParam(3, IContextKeyService)
], AgentHostByokLmHandler);
export {
  AgentHostByokLmHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0Qnlva0xtSGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7XG5cdEJ5b2tMbUltYWdlTWltZVR5cGUsXG5cdGdldEJ5b2tMbUFnZW50TW9kZWxJZCxcblx0SUFnZW50SG9zdEJ5b2tMbUhhbmRsZXIsXG5cdElCeW9rTG1DaGF0UmVxdWVzdCxcblx0SUJ5b2tMbUNoYXRSZXN1bHQsXG5cdElCeW9rTG1Db250ZW50UGFydCxcblx0SUJ5b2tMbUlucHV0SXRlbSxcblx0SUJ5b2tMbU1vZGVsSW5mbyxcblx0SUJ5b2tMbU91dHB1dEl0ZW0sXG5cdElCeW9rTG1SZWFzb25pbmdJdGVtLFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEJ5b2tMbS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQge1xuXHRDaGF0SW1hZ2VNaW1lVHlwZSxcblx0Q2hhdE1lc3NhZ2VSb2xlLFxuXHRJQ2hhdE1lc3NhZ2UsXG5cdElDaGF0TWVzc2FnZVBhcnQsXG5cdElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLFxuXHRJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxufSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5cbmNvbnN0IFNUQVRFRlVMX01BUktFUl9NSU1FX1RZUEUgPSAnc3RhdGVmdWxfbWFya2VyJztcbmNvbnN0IFVTQUdFX01JTUVfVFlQRSA9ICd1c2FnZSc7XG5jb25zdCBSRUFTT05JTkdfTUVUQURBVEFfUFJFRklYID0gJ3ZzY29kZS1yZWFzb25pbmctbWV0YWRhdGE6JztcbmNvbnN0IFZTQ09ERV9SRUFTT05JTkdfU1VNTUFSWV9QQVJUX0RPTkUgPSAndnNjb2RlX3JlYXNvbmluZ19zdW1tYXJ5X3BhcnRfZG9uZSc7XG5jb25zdCBDTElFTlRfQllPS19DT05URVhUX0tFWVMgPSBuZXcgU2V0KFtDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5jbGllbnRCeW9rRW5hYmxlZC5rZXldKTtcblxuLyoqXG4gKiBSZW5kZXJlci1zaWRlIHtAbGluayBJQWdlbnRIb3N0Qnlva0xtSGFuZGxlcn0uIFNlcnZpY2VzIEJZT0sgY2hhdCByZXF1ZXN0c1xuICogZm9yd2FyZGVkIGJ5IHRoZSBub2RlIGFnZW50IGhvc3QncyBPcGVuQUkgcHJveHkgYnkgY2FsbGluZyB0aGUgVlMgQ29kZSBMTVxuICogQVBJIGZvciB0aGUgbWF0Y2hpbmcgZXh0ZW5zaW9uLXJlZ2lzdGVyZWQgbW9kZWwuXG4gKlxuICogVGhlIGJyaWRnZSBEVE9zIGFyZSBwbGFpbi9zZXJpYWxpemFibGU7IHRoaXMgY2xhc3MgaXMgdGhlIHNpbmdsZSBwbGFjZSB0aGF0XG4gKiB0cmFuc2xhdGVzIHRoZW0gdG8gYW5kIGZyb20gdGhlIGB3b3JrYmVuY2gvY29udHJpYi9jaGF0YCBMTSB0eXBlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdEJ5b2tMbUhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdEJ5b2tMbUhhbmRsZXIge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWxzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdC8qKiBGaXJlcyB3aGVuIHRoZSByZW5kZXJlcidzIEJZT0sgbW9kZWxzIGNoYW5nZSwgc28gdGhlIG5vZGUgYWdlbnQgaG9zdCByZS1lbnVtZXJhdGVzLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1vZGVscyA9IHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHQvLyBSZS1lbWl0IChkZWJvdW5jZWQpIHdoZW5ldmVyIHRoZSByZW5kZXJlcidzIGxhbmd1YWdlIG1vZGVscyBjaGFuZ2UsIHNvIHRoZVxuXHRcdC8vIGFnZW50IGhvc3QgY2FuIHJlZnJlc2ggaXRzIEJZT0sgbW9kZWwgbGlzdCBcdTIwMTQgZXh0ZW5zaW9uLXByb3ZpZGVkIEJZT0sgbW9kZWxzXG5cdFx0Ly8gb2Z0ZW4gcmVnaXN0ZXIgc2hvcnRseSBhZnRlciB0aGUgYnJpZGdlIGNvbm5lY3RzLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzLCAoKSA9PiB1bmRlZmluZWQsIDUwMCkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbHMuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbHMuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIoY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCBldmVudCA9PiBldmVudC5hZmZlY3RzU29tZShDTElFTlRfQllPS19DT05URVhUX0tFWVMpKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVscy5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgY2hhdChyZXF1ZXN0OiBJQnlva0xtQ2hhdFJlcXVlc3QsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUJ5b2tMbUNoYXRSZXN1bHQ+IHtcblx0XHRpZiAoIXRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuY2xpZW50Qnlva0VuYWJsZWQpIHtcblx0XHRcdHJldHVybiB7IG91dHB1dDogW10sIGVycm9yOiAnQllPSyBtb2RlbHMgYXJlIGRpc2FibGVkIGJ5IHBvbGljeS4nIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxJZGVudGlmaWVyID0gdGhpcy5fcmVzb2x2ZU1vZGVsSWRlbnRpZmllcihyZXF1ZXN0LnZlbmRvciwgcmVxdWVzdC5tb2RlbElkKTtcblx0XHRpZiAoIW1vZGVsSWRlbnRpZmllcikge1xuXHRcdFx0cmV0dXJuIHsgb3V0cHV0OiBbXSwgZXJyb3I6IGBObyBCWU9LIG1vZGVsIGZvdW5kIGZvciAke3JlcXVlc3QudmVuZG9yfS8ke3JlcXVlc3QubW9kZWxJZH1gIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVzc2FnZXMgPSB0aGlzLl90b0NoYXRNZXNzYWdlcyhyZXF1ZXN0KTtcblx0XHRjb25zdCB0b29scyA9IHJlcXVlc3QudG9vbHM/Lmxlbmd0aFxuXHRcdFx0PyByZXF1ZXN0LnRvb2xzLm1hcCh0b29sID0+ICh7XG5cdFx0XHRcdG5hbWU6IHRvb2wubmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHRvb2wuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdGlucHV0U2NoZW1hOiB0b29sLnR5cGUgPT09ICdmdW5jdGlvbidcblx0XHRcdFx0XHQ/IHRvb2wucGFyYW1ldGVyc1NjaGVtYVxuXHRcdFx0XHRcdDogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczogeyBpbnB1dDogeyB0eXBlOiAnc3RyaW5nJyB9IH0sIHJlcXVpcmVkOiBbJ2lucHV0J10gfSxcblx0XHRcdH0pKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3B0aW9uczogSUxhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdE9wdGlvbnMgPSB7XG5cdFx0XHRtb2RlbE9wdGlvbnM6IHJlcXVlc3QubW9kZWxPcHRpb25zLFxuXHRcdFx0aW5jbHVkZUVuY3J5cHRlZFRoaW5raW5nOiB0cnVlLFxuXHRcdFx0Li4uKHJlcXVlc3QucmVhc29uaW5nRWZmb3J0ID8geyBjb25maWd1cmF0aW9uOiB7IHJlYXNvbmluZ0VmZm9ydDogcmVxdWVzdC5yZWFzb25pbmdFZmZvcnQgfSB9IDoge30pLFxuXHRcdFx0Li4uKHRvb2xzID8geyB0b29scyB9IDoge30pLFxuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VuZENoYXRSZXF1ZXN0KG1vZGVsSWRlbnRpZmllciwgdW5kZWZpbmVkLCBtZXNzYWdlcywgb3B0aW9ucywgdG9rZW4pO1xuXG5cdFx0XHRjb25zdCBvdXRwdXQ6IElCeW9rTG1PdXRwdXRJdGVtW10gPSBbXTtcblx0XHRcdGNvbnN0IGN1c3RvbVRvb2xOYW1lcyA9IG5ldyBTZXQocmVxdWVzdC50b29scz8uZmlsdGVyKHRvb2wgPT4gdG9vbC50eXBlID09PSAnY3VzdG9tJykubWFwKHRvb2wgPT4gdG9vbC5uYW1lKSk7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRSZWFzb25pbmdTdW1tYXJ5UGFydHMgPSBuZXcgU2V0PHN0cmluZyB8IHVuZGVmaW5lZD4oKTtcblx0XHRcdGxldCByZXNwb25zZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgdXNhZ2U6IElCeW9rTG1DaGF0UmVzdWx0Wyd1c2FnZSddO1xuXHRcdFx0Y29uc3Qgc3RyZWFtaW5nID0gKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBwYXJ0IG9mIHJlc3BvbnNlLnN0cmVhbSkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnRzID0gQXJyYXkuaXNBcnJheShwYXJ0KSA/IHBhcnQgOiBbcGFydF07XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBwIG9mIHBhcnRzKSB7XG5cdFx0XHRcdFx0XHRpZiAocC50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fYXBwZW5kVGV4dE91dHB1dChvdXRwdXQsIHAudmFsdWUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChwLnR5cGUgPT09ICd0aGlua2luZycpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHAubWV0YWRhdGE/LltWU0NPREVfUkVBU09OSU5HX1NVTU1BUllfUEFSVF9ET05FXSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbXBsZXRlZFJlYXNvbmluZ1N1bW1hcnlQYXJ0cy5hZGQocC5pZCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc3RhcnRzTmV3U3VtbWFyeVBhcnQgPSBwLnZhbHVlLmxlbmd0aCA+IDAgJiYgY29tcGxldGVkUmVhc29uaW5nU3VtbWFyeVBhcnRzLmRlbGV0ZShwLmlkKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9hcHBlbmRSZWFzb25pbmdPdXRwdXQob3V0cHV0LCBwLCBzdGFydHNOZXdTdW1tYXJ5UGFydCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocC50eXBlID09PSAndG9vbF91c2UnKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChjdXN0b21Ub29sTmFtZXMuaGFzKHAubmFtZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRvdXRwdXQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRjYWxsSWQ6IHAudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6IHAubmFtZSxcblx0XHRcdFx0XHRcdFx0XHRcdGlucHV0OiB0aGlzLl9jdXN0b21Ub29sSW5wdXQocC5wYXJhbWV0ZXJzKSxcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRvdXRwdXQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnZnVuY3Rpb25fY2FsbCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRjYWxsSWQ6IHAudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdFx0XHRcdG5hbWU6IHAubmFtZSxcblx0XHRcdFx0XHRcdFx0XHRcdGFyZ3VtZW50c0pzb246IEpTT04uc3RyaW5naWZ5KHAucGFyYW1ldGVycyA/PyB7fSksXG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAocC50eXBlID09PSAnZGF0YScgJiYgcC5taW1lVHlwZSA9PT0gU1RBVEVGVUxfTUFSS0VSX01JTUVfVFlQRSkge1xuXHRcdFx0XHRcdFx0XHRyZXNwb25zZUlkID0gdGhpcy5fZGVjb2RlU3RhdGVmdWxNYXJrZXIocC5kYXRhLCByZXF1ZXN0Lm1vZGVsSWQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChwLnR5cGUgPT09ICdkYXRhJyAmJiBwLm1pbWVUeXBlID09PSBVU0FHRV9NSU1FX1RZUEUpIHtcblx0XHRcdFx0XHRcdFx0dXNhZ2UgPSB0aGlzLl9kZWNvZGVVc2FnZShwLmRhdGEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3Jlc3BvbnNlLnJlc3VsdCwgc3RyZWFtaW5nXSk7XG5cdFx0XHRyZXR1cm4geyBvdXRwdXQsIHJlc3BvbnNlSWQsIHVzYWdlIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Qnlva0xtSGFuZGxlcl0gY2hhdCByZXF1ZXN0IGZhaWxlZCBmb3IgJHtyZXF1ZXN0LnZlbmRvcn0vJHtyZXF1ZXN0Lm1vZGVsSWR9OiAke21lc3NhZ2V9YCk7XG5cdFx0XHRyZXR1cm4geyBvdXRwdXQ6IFtdLCBlcnJvcjogbWVzc2FnZSB9O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGxpc3RNb2RlbHMoX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUJ5b2tMbU1vZGVsSW5mb1tdPiB7XG5cdFx0aWYgKCF0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmNsaWVudEJ5b2tFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxzOiBJQnlva0xtTW9kZWxJbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKSkge1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChpZGVudGlmaWVyKTtcblx0XHRcdC8vIE9ubHkgZ2VudWluZSByZW5kZXJlciBCWU9LIG1vZGVscyBcdTIwMTQgZXhjbHVkZSBhZ2VudC1ob3N0IGNvcGllcywgd2hpY2hcblx0XHRcdC8vIGNhcnJ5IGEgYHRhcmdldENoYXRTZXNzaW9uVHlwZWAgYW5kIHdvdWxkIG90aGVyd2lzZSByZS1lbnRlciB0aGUgYnJpZGdlLlxuXHRcdFx0aWYgKG1ldGFkYXRhPy5pc0JZT0sgJiYgIW1ldGFkYXRhLnRhcmdldENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHRjb25zdCByZWFzb25pbmdFZmZvcnRTY2hlbWEgPSBtZXRhZGF0YS5jb25maWd1cmF0aW9uU2NoZW1hPy5wcm9wZXJ0aWVzPy5yZWFzb25pbmdFZmZvcnQ7XG5cdFx0XHRcdGNvbnN0IHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHMgPSByZWFzb25pbmdFZmZvcnRTY2hlbWE/LmVudW0/LmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyk7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRSZWFzb25pbmdFZmZvcnQgPSB0eXBlb2YgcmVhc29uaW5nRWZmb3J0U2NoZW1hPy5kZWZhdWx0ID09PSAnc3RyaW5nJyA/IHJlYXNvbmluZ0VmZm9ydFNjaGVtYS5kZWZhdWx0IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBtb2RlbDogSUJ5b2tMbU1vZGVsSW5mbyA9IHtcblx0XHRcdFx0XHR2ZW5kb3I6IG1ldGFkYXRhLnZlbmRvcixcblx0XHRcdFx0XHRpZDogbWV0YWRhdGEuaWQsXG5cdFx0XHRcdFx0bmFtZTogbWV0YWRhdGEubmFtZSxcblx0XHRcdFx0XHRtb2RlbElkZW50aWZpZXI6IGlkZW50aWZpZXIsXG5cdFx0XHRcdFx0bWF4Q29udGV4dFdpbmRvd1Rva2VuczogbWV0YWRhdGEubWF4SW5wdXRUb2tlbnMgKyBtZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMsXG5cdFx0XHRcdFx0c3VwcG9ydHNWaXNpb246ICEhbWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24sXG5cdFx0XHRcdFx0Li4uKHN1cHBvcnRlZFJlYXNvbmluZ0VmZm9ydHM/Lmxlbmd0aCA/IHsgc3VwcG9ydGVkUmVhc29uaW5nRWZmb3J0cyB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihkZWZhdWx0UmVhc29uaW5nRWZmb3J0ICE9PSB1bmRlZmluZWQgPyB7IGRlZmF1bHRSZWFzb25pbmdFZmZvcnQgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgYWdlbnRIb3N0TW9kZWxJZGVudGlmaWVyID0gYCR7U2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdH06JHtnZXRCeW9rTG1BZ2VudE1vZGVsSWQobW9kZWwpfWA7XG5cdFx0XHRcdGlmICghdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmlzTW9kZWxIaWRkZW4oaWRlbnRpZmllcikgJiYgIXRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5pc01vZGVsSGlkZGVuKGFnZW50SG9zdE1vZGVsSWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHRtb2RlbHMucHVzaChtb2RlbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVscztcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIHRoZSBMTSBBUEkgaWRlbnRpZmllciBmb3IgYSBCWU9LIG1vZGVsIGFkZHJlc3NlZCBieSBpdHMgdmVuZG9yIGFuZFxuXHQgKiBwcm92aWRlci1sb2NhbCBpZCAodGhlIGBwcm92aWRlci9pZGAgc2VsZWN0aW9uIGlkIHRoZSBwaWNrZXIgc3VyZmFjZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZU1vZGVsSWRlbnRpZmllcih2ZW5kb3I6IHN0cmluZywgbW9kZWxJZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleGFjdElkZW50aWZpZXIgPSBgJHt2ZW5kb3J9LyR7bW9kZWxJZH1gO1xuXHRcdGNvbnN0IGV4YWN0TWV0YWRhdGEgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChleGFjdElkZW50aWZpZXIpO1xuXHRcdGlmIChleGFjdE1ldGFkYXRhPy5pc0JZT0sgJiYgZXhhY3RNZXRhZGF0YS52ZW5kb3IgPT09IHZlbmRvcikge1xuXHRcdFx0cmV0dXJuIGV4YWN0SWRlbnRpZmllcjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsSWRzKCkpIHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoaWRlbnRpZmllcik7XG5cdFx0XHRpZiAobWV0YWRhdGE/LmlzQllPSyAmJiBtZXRhZGF0YS52ZW5kb3IgPT09IHZlbmRvciAmJiBtZXRhZGF0YS5pZCA9PT0gbW9kZWxJZCkge1xuXHRcdFx0XHRyZXR1cm4gaWRlbnRpZmllcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3RvQ2hhdE1lc3NhZ2VzKHJlcXVlc3Q6IElCeW9rTG1DaGF0UmVxdWVzdCk6IElDaGF0TWVzc2FnZVtdIHtcblx0XHRjb25zdCBtZXNzYWdlczogSUNoYXRNZXNzYWdlW10gPSBbXTtcblx0XHRpZiAocmVxdWVzdC5wcmV2aW91c1Jlc3BvbnNlSWQpIHtcblx0XHRcdG1lc3NhZ2VzLnB1c2goe1xuXHRcdFx0XHRyb2xlOiBDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50LFxuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdHR5cGU6ICdkYXRhJyxcblx0XHRcdFx0XHRtaW1lVHlwZTogU1RBVEVGVUxfTUFSS0VSX01JTUVfVFlQRSxcblx0XHRcdFx0XHRkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGAke3JlcXVlc3QubW9kZWxJZH1cXFxcJHtyZXF1ZXN0LnByZXZpb3VzUmVzcG9uc2VJZH1gKSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0aWYgKHJlcXVlc3QuaW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRtZXNzYWdlcy5wdXNoKHtcblx0XHRcdFx0cm9sZTogQ2hhdE1lc3NhZ2VSb2xlLlN5c3RlbSxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogcmVxdWVzdC5pbnN0cnVjdGlvbnMgfV0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlcXVlc3QuaW5wdXQpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSB0aGlzLl90b0NoYXRNZXNzYWdlKGl0ZW0pO1xuXHRcdFx0Y29uc3QgcHJldmlvdXMgPSBtZXNzYWdlcy5hdCgtMSk7XG5cdFx0XHRpZiAobWVzc2FnZS5yb2xlID09PSBDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50ICYmIHByZXZpb3VzPy5yb2xlID09PSBDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50KSB7XG5cdFx0XHRcdG1lc3NhZ2VzW21lc3NhZ2VzLmxlbmd0aCAtIDFdID0ge1xuXHRcdFx0XHRcdC4uLnByZXZpb3VzLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFsuLi5wcmV2aW91cy5jb250ZW50LCAuLi5tZXNzYWdlLmNvbnRlbnRdLFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWVzc2FnZXMucHVzaChtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1lc3NhZ2VzO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9DaGF0TWVzc2FnZShpdGVtOiBJQnlva0xtSW5wdXRJdGVtKTogSUNoYXRNZXNzYWdlIHtcblx0XHRzd2l0Y2ggKGl0ZW0udHlwZSkge1xuXHRcdFx0Y2FzZSAnbWVzc2FnZSc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cm9sZTogdGhpcy5fdG9DaGF0Um9sZShpdGVtLnJvbGUpLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IHRoaXMuX3RvQ2hhdE1lc3NhZ2VQYXJ0cyhpdGVtLmNvbnRlbnQpLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAncmVhc29uaW5nJzoge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsXG5cdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICd0aGlua2luZycsXG5cdFx0XHRcdFx0XHR2YWx1ZTogaXRlbS5zdW1tYXJ5LFxuXHRcdFx0XHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0XHQuLi5pdGVtLm1ldGFkYXRhLFxuXHRcdFx0XHRcdFx0XHQuLi4oaXRlbS5lbmNyeXB0ZWRDb250ZW50ID8gdGhpcy5fZGVjb2RlUmVhc29uaW5nTWV0YWRhdGEoaXRlbS5lbmNyeXB0ZWRDb250ZW50KSA6IHt9KSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdmdW5jdGlvbl9jYWxsJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyb2xlOiBDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50LFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAndG9vbF91c2UnLFxuXHRcdFx0XHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogaXRlbS5jYWxsSWQsXG5cdFx0XHRcdFx0XHRwYXJhbWV0ZXJzOiB0aGlzLl9zYWZlUGFyc2VKc29uKGl0ZW0uYXJndW1lbnRzSnNvbiksXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdjdXN0b21fdG9vbF9jYWxsJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyb2xlOiBDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50LFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAndG9vbF91c2UnLFxuXHRcdFx0XHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogaXRlbS5jYWxsSWQsXG5cdFx0XHRcdFx0XHRwYXJhbWV0ZXJzOiB7IGlucHV0OiBpdGVtLmlucHV0IH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdmdW5jdGlvbl9jYWxsX291dHB1dCc6XG5cdFx0XHRjYXNlICdjdXN0b21fdG9vbF9jYWxsX291dHB1dCc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cm9sZTogQ2hhdE1lc3NhZ2VSb2xlLlVzZXIsXG5cdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICd0b29sX3Jlc3VsdCcsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBpdGVtLmNhbGxJZCxcblx0XHRcdFx0XHRcdHZhbHVlOiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiBpdGVtLm91dHB1dCB9XSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90b0NoYXRNZXNzYWdlUGFydHMocGFydHM6IElCeW9rTG1Db250ZW50UGFydFtdKTogSUNoYXRNZXNzYWdlUGFydFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IElDaGF0TWVzc2FnZVBhcnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiBwYXJ0cykge1xuXHRcdFx0aWYgKHBhcnQudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzID0gcmVzdWx0LmF0KC0xKTtcblx0XHRcdFx0aWYgKHByZXZpb3VzPy50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRwcmV2aW91cy52YWx1ZSArPSBwYXJ0LnRleHQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyB0eXBlOiAndGV4dCcsIHZhbHVlOiBwYXJ0LnRleHQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgdHlwZTogJ2ltYWdlX3VybCcsIHZhbHVlOiB7IG1pbWVUeXBlOiB0aGlzLl90b0NoYXRJbWFnZU1pbWVUeXBlKHBhcnQubWltZVR5cGUpLCBkYXRhOiBkZWNvZGVCYXNlNjQocGFydC5kYXRhKSB9IH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0Lmxlbmd0aCA/IHJlc3VsdCA6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6ICcnIH1dO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9DaGF0SW1hZ2VNaW1lVHlwZShtaW1lVHlwZTogQnlva0xtSW1hZ2VNaW1lVHlwZSk6IENoYXRJbWFnZU1pbWVUeXBlIHtcblx0XHRzd2l0Y2ggKG1pbWVUeXBlKSB7XG5cdFx0XHRjYXNlICdpbWFnZS9wbmcnOlxuXHRcdFx0XHRyZXR1cm4gQ2hhdEltYWdlTWltZVR5cGUuUE5HO1xuXHRcdFx0Y2FzZSAnaW1hZ2UvanBlZyc6XG5cdFx0XHRcdHJldHVybiBDaGF0SW1hZ2VNaW1lVHlwZS5KUEVHO1xuXHRcdFx0Y2FzZSAnaW1hZ2UvZ2lmJzpcblx0XHRcdFx0cmV0dXJuIENoYXRJbWFnZU1pbWVUeXBlLkdJRjtcblx0XHRcdGNhc2UgJ2ltYWdlL3dlYnAnOlxuXHRcdFx0XHRyZXR1cm4gQ2hhdEltYWdlTWltZVR5cGUuV0VCUDtcblx0XHRcdGNhc2UgJ2ltYWdlL2JtcCc6XG5cdFx0XHRcdHJldHVybiBDaGF0SW1hZ2VNaW1lVHlwZS5CTVA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwZW5kVGV4dE91dHB1dChvdXRwdXQ6IElCeW9rTG1PdXRwdXRJdGVtW10sIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IG91dHB1dC5hdCgtMSk7XG5cdFx0aWYgKHByZXZpb3VzPy50eXBlID09PSAnbWVzc2FnZScpIHtcblx0XHRcdG91dHB1dFtvdXRwdXQubGVuZ3RoIC0gMV0gPSB7XG5cdFx0XHRcdC4uLnByZXZpb3VzLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6IHByZXZpb3VzLmNvbnRlbnQubWFwKHBhcnQgPT4gcGFydC50ZXh0KS5qb2luKCcnKSArIHZhbHVlIH1dLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0b3V0cHV0LnB1c2goeyB0eXBlOiAnbWVzc2FnZScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogdmFsdWUgfV0gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXBwZW5kUmVhc29uaW5nT3V0cHV0KG91dHB1dDogSUJ5b2tMbU91dHB1dEl0ZW1bXSwgcGFydDogRXh0cmFjdDxJQ2hhdE1lc3NhZ2VQYXJ0LCB7IHR5cGU6ICd0aGlua2luZycgfT4sIHN0YXJ0c05ld1N1bW1hcnlQYXJ0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHBhcnQubWV0YWRhdGE/LnZzY29kZV9yZWFzb25pbmdfZG9uZSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdW1tYXJ5ID0gQXJyYXkuaXNBcnJheShwYXJ0LnZhbHVlKSA/IHBhcnQudmFsdWUgOiBbcGFydC52YWx1ZV07XG5cdFx0Y29uc3QgZW5jcnlwdGVkQ29udGVudCA9IHRoaXMuX2VuY29kZVJlYXNvbmluZ01ldGFkYXRhKHBhcnQubWV0YWRhdGEpO1xuXHRcdGNvbnN0IHJlYXNvbmluZzogSUJ5b2tMbVJlYXNvbmluZ0l0ZW0gPSB7XG5cdFx0XHR0eXBlOiAncmVhc29uaW5nJyxcblx0XHRcdGlkOiBwYXJ0LmlkLFxuXHRcdFx0c3VtbWFyeSxcblx0XHRcdGVuY3J5cHRlZENvbnRlbnQsXG5cdFx0XHRtZXRhZGF0YTogcGFydC5tZXRhZGF0YSxcblx0XHR9O1xuXHRcdGNvbnN0IHByZXZpb3VzID0gb3V0cHV0LmF0KC0xKTtcblx0XHRpZiAocHJldmlvdXM/LnR5cGUgPT09ICdyZWFzb25pbmcnICYmIHByZXZpb3VzLmlkID09PSByZWFzb25pbmcuaWQpIHtcblx0XHRcdG91dHB1dFtvdXRwdXQubGVuZ3RoIC0gMV0gPSB7XG5cdFx0XHRcdC4uLnByZXZpb3VzLFxuXHRcdFx0XHRzdW1tYXJ5OiBzdGFydHNOZXdTdW1tYXJ5UGFydCB8fCBBcnJheS5pc0FycmF5KHBhcnQudmFsdWUpXG5cdFx0XHRcdFx0PyBbLi4ucHJldmlvdXMuc3VtbWFyeSwgLi4ucmVhc29uaW5nLnN1bW1hcnldXG5cdFx0XHRcdFx0OiB0aGlzLl9tZXJnZVJlYXNvbmluZ1N1bW1hcnkocHJldmlvdXMuc3VtbWFyeSwgcGFydC52YWx1ZSksXG5cdFx0XHRcdGVuY3J5cHRlZENvbnRlbnQ6IHJlYXNvbmluZy5lbmNyeXB0ZWRDb250ZW50ID8/IHByZXZpb3VzLmVuY3J5cHRlZENvbnRlbnQsXG5cdFx0XHRcdG1ldGFkYXRhOiBwcmV2aW91cy5tZXRhZGF0YSB8fCByZWFzb25pbmcubWV0YWRhdGEgPyB7IC4uLnByZXZpb3VzLm1ldGFkYXRhLCAuLi5yZWFzb25pbmcubWV0YWRhdGEgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdG91dHB1dC5wdXNoKHJlYXNvbmluZyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWVyZ2VSZWFzb25pbmdTdW1tYXJ5KHN1bW1hcnk6IHJlYWRvbmx5IHN0cmluZ1tdLCB2YWx1ZTogc3RyaW5nKTogc3RyaW5nW10ge1xuXHRcdGlmIChzdW1tYXJ5Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFt2YWx1ZV07XG5cdFx0fVxuXHRcdHJldHVybiBbLi4uc3VtbWFyeS5zbGljZSgwLCAtMSksIHN1bW1hcnlbc3VtbWFyeS5sZW5ndGggLSAxXSArIHZhbHVlXTtcblx0fVxuXG5cdHByaXZhdGUgX2VuY29kZVJlYXNvbmluZ01ldGFkYXRhKG1ldGFkYXRhOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCB1bmtub3duPj4gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVuY3J5cHRlZENvbnRlbnQgPSB0aGlzLl9zdHJpbmdNZXRhZGF0YShtZXRhZGF0YSwgJ2VuY3J5cHRlZF9jb250ZW50JykgPz8gdGhpcy5fc3RyaW5nTWV0YWRhdGEobWV0YWRhdGEsICdlbmNyeXB0ZWQnKTtcblx0XHRpZiAoZW5jcnlwdGVkQ29udGVudCkge1xuXHRcdFx0cmV0dXJuIGVuY3J5cHRlZENvbnRlbnQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRpbnVhdGlvbk1ldGFkYXRhID0ge1xuXHRcdFx0Li4uKHRoaXMuX3N0cmluZ01ldGFkYXRhKG1ldGFkYXRhLCAnc2lnbmF0dXJlJykgPyB7IHNpZ25hdHVyZTogdGhpcy5fc3RyaW5nTWV0YWRhdGEobWV0YWRhdGEsICdzaWduYXR1cmUnKSB9IDoge30pLFxuXHRcdFx0Li4uKHRoaXMuX3N0cmluZ01ldGFkYXRhKG1ldGFkYXRhLCAnX2NvbXBsZXRlVGhpbmtpbmcnKSA/IHsgX2NvbXBsZXRlVGhpbmtpbmc6IHRoaXMuX3N0cmluZ01ldGFkYXRhKG1ldGFkYXRhLCAnX2NvbXBsZXRlVGhpbmtpbmcnKSB9IDoge30pLFxuXHRcdFx0Li4uKHRoaXMuX3N0cmluZ01ldGFkYXRhKG1ldGFkYXRhLCAncmVkYWN0ZWREYXRhJykgPyB7IHJlZGFjdGVkRGF0YTogdGhpcy5fc3RyaW5nTWV0YWRhdGEobWV0YWRhdGEsICdyZWRhY3RlZERhdGEnKSB9IDoge30pLFxuXHRcdH07XG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKGNvbnRpbnVhdGlvbk1ldGFkYXRhKS5sZW5ndGggPiAwXG5cdFx0XHQ/IGAke1JFQVNPTklOR19NRVRBREFUQV9QUkVGSVh9JHtKU09OLnN0cmluZ2lmeShjb250aW51YXRpb25NZXRhZGF0YSl9YFxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZWNvZGVSZWFzb25pbmdNZXRhZGF0YSh2YWx1ZTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRcdGlmICghdmFsdWUuc3RhcnRzV2l0aChSRUFTT05JTkdfTUVUQURBVEFfUFJFRklYKSkge1xuXHRcdFx0cmV0dXJuIHsgZW5jcnlwdGVkX2NvbnRlbnQ6IHZhbHVlIH07XG5cdFx0fVxuXHRcdGNvbnN0IG1ldGFkYXRhID0gSlNPTi5wYXJzZSh2YWx1ZS5zbGljZShSRUFTT05JTkdfTUVUQURBVEFfUFJFRklYLmxlbmd0aCkpO1xuXHRcdGlmICh0eXBlb2YgbWV0YWRhdGEgIT09ICdvYmplY3QnIHx8IG1ldGFkYXRhID09PSBudWxsIHx8IEFycmF5LmlzQXJyYXkobWV0YWRhdGEpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgQWdlbnQgSG9zdCBCWU9LIHJlYXNvbmluZyBtZXRhZGF0YScpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWV0YWRhdGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdH1cblxuXHRwcml2YXRlIF9jdXN0b21Ub29sSW5wdXQocGFyYW1ldGVyczogdW5rbm93bik6IHN0cmluZyB7XG5cdFx0aWYgKHR5cGVvZiBwYXJhbWV0ZXJzID09PSAnb2JqZWN0JyAmJiBwYXJhbWV0ZXJzICE9PSBudWxsKSB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IocGFyYW1ldGVycywgJ2lucHV0Jyk/LnZhbHVlO1xuXHRcdFx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmV0dXJuIGlucHV0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHlwZW9mIHBhcmFtZXRlcnMgPT09ICdzdHJpbmcnID8gcGFyYW1ldGVycyA6IEpTT04uc3RyaW5naWZ5KHBhcmFtZXRlcnMgPz8ge30pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVjb2RlU3RhdGVmdWxNYXJrZXIoZGF0YTogVlNCdWZmZXIsIGV4cGVjdGVkTW9kZWxJZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkZWNvZGVkID0gZGF0YS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNlcGFyYXRvciA9IGRlY29kZWQuaW5kZXhPZignXFxcXCcpO1xuXHRcdGlmIChzZXBhcmF0b3IgPT09IC0xIHx8IGRlY29kZWQuc2xpY2UoMCwgc2VwYXJhdG9yKSAhPT0gZXhwZWN0ZWRNb2RlbElkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZGVjb2RlZC5zbGljZShzZXBhcmF0b3IgKyAxKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZWNvZGVVc2FnZShkYXRhOiBWU0J1ZmZlcik6IElCeW9rTG1DaGF0UmVzdWx0Wyd1c2FnZSddIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBKU09OLnBhcnNlKGRhdGEudG9TdHJpbmcoKSkgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRjb25zdCBvdXRwdXREZXRhaWxzID0gdHlwZW9mIHZhbHVlLmNvbXBsZXRpb25fdG9rZW5zX2RldGFpbHMgPT09ICdvYmplY3QnICYmIHZhbHVlLmNvbXBsZXRpb25fdG9rZW5zX2RldGFpbHMgIT09IG51bGxcblx0XHRcdFx0PyB2YWx1ZS5jb21wbGV0aW9uX3Rva2Vuc19kZXRhaWxzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+XG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5wdXRUb2tlbnM6IHRoaXMuX251bWJlclByb3BlcnR5KHZhbHVlLCAncHJvbXB0X3Rva2VucycpLFxuXHRcdFx0XHRvdXRwdXRUb2tlbnM6IHRoaXMuX251bWJlclByb3BlcnR5KHZhbHVlLCAnY29tcGxldGlvbl90b2tlbnMnKSxcblx0XHRcdFx0cmVhc29uaW5nVG9rZW5zOiBvdXRwdXREZXRhaWxzID8gdGhpcy5fbnVtYmVyUHJvcGVydHkob3V0cHV0RGV0YWlscywgJ3JlYXNvbmluZ190b2tlbnMnKSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX251bWJlclByb3BlcnR5KHZhbHVlOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwga2V5OiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByb3BlcnR5ID0gdmFsdWVba2V5XTtcblx0XHRyZXR1cm4gdHlwZW9mIHByb3BlcnR5ID09PSAnbnVtYmVyJyA/IHByb3BlcnR5IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RyaW5nTWV0YWRhdGEobWV0YWRhdGE6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHVua25vd24+PiB8IHVuZGVmaW5lZCwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gbWV0YWRhdGE/LltrZXldO1xuXHRcdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF90b0NoYXRSb2xlKHJvbGU6IEV4dHJhY3Q8SUJ5b2tMbUlucHV0SXRlbSwgeyB0eXBlOiAnbWVzc2FnZScgfT5bJ3JvbGUnXSk6IENoYXRNZXNzYWdlUm9sZSB7XG5cdFx0c3dpdGNoIChyb2xlKSB7XG5cdFx0XHRjYXNlICdzeXN0ZW0nOlxuXHRcdFx0Y2FzZSAnZGV2ZWxvcGVyJzpcblx0XHRcdFx0cmV0dXJuIENoYXRNZXNzYWdlUm9sZS5TeXN0ZW07XG5cdFx0XHRjYXNlICdhc3Npc3RhbnQnOlxuXHRcdFx0XHRyZXR1cm4gQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudDtcblx0XHRcdGNhc2UgJ3VzZXInOlxuXHRcdFx0XHRyZXR1cm4gQ2hhdE1lc3NhZ2VSb2xlLlVzZXI7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2FmZVBhcnNlSnNvbihqc29uOiBzdHJpbmcpOiB1bmtub3duIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoanNvbik7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsU0FBUyxhQUFhO0FB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QkFBNkM7QUFDMUYsVUFBTSxVQUFVLEtBQUssU0FBUztBQUM5QixVQUFNLFlBQVksUUFBUSxRQUFRLElBQUk7QUFDdEMsUUFBSSxjQUFjLE1BQU0sUUFBUSxNQUFNLEdBQUcsU0FBUyxNQUFNLGlCQUFpQjtBQUN4RSxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sUUFBUSxNQUFNLFlBQVksQ0FBQyxLQUFLO0FBQUEsRUFDeEM7QUFBQSxFQUVRLGFBQWEsTUFBNEM7QUFDaEUsUUFBSTtBQUNILFlBQU0sUUFBUSxLQUFLLE1BQU0sS0FBSyxTQUFTLENBQUM7QUFDeEMsWUFBTSxnQkFBZ0IsT0FBTyxNQUFNLDhCQUE4QixZQUFZLE1BQU0sOEJBQThCLE9BQzlHLE1BQU0sNEJBQ047QUFDSCxhQUFPO0FBQUEsUUFDTixhQUFhLEtBQUssZ0JBQWdCLE9BQU8sZUFBZTtBQUFBLFFBQ3hELGNBQWMsS0FBSyxnQkFBZ0IsT0FBTyxtQkFBbUI7QUFBQSxRQUM3RCxpQkFBaUIsZ0JBQWdCLEtBQUssZ0JBQWdCLGVBQWUsa0JBQWtCLElBQUk7QUFBQSxNQUM1RjtBQUFBLElBQ0QsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLE9BQWdDLEtBQWlDO0FBQ3hGLFVBQU0sV0FBVyxNQUFNLEdBQUc7QUFDMUIsV0FBTyxPQUFPLGFBQWEsV0FBVyxXQUFXO0FBQUEsRUFDbEQ7QUFBQSxFQUVRLGdCQUFnQixVQUF5RCxLQUFpQztBQUNqSCxVQUFNLFFBQVEsV0FBVyxHQUFHO0FBQzVCLFdBQU8sT0FBTyxVQUFVLFdBQVcsUUFBUTtBQUFBLEVBQzVDO0FBQUEsRUFFUSxZQUFZLE1BQStFO0FBQ2xHLFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUNKLGVBQU8sZ0JBQWdCO0FBQUEsTUFDeEIsS0FBSztBQUNKLGVBQU8sZ0JBQWdCO0FBQUEsTUFDeEIsS0FBSztBQUNKLGVBQU8sZ0JBQWdCO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQUEsRUFFUSxlQUFlLE1BQXVCO0FBQzdDLFFBQUk7QUFDSCxhQUFPLEtBQUssTUFBTSxJQUFJO0FBQUEsSUFDdkIsUUFBUTtBQUNQLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQ0Q7QUFuYWEseUJBQU47QUFBQSxFQVNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFtdCn0K
