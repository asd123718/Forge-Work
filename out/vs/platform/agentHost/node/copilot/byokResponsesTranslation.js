import { decodeBase64 } from "../../../../base/common/buffer.js";
function isSupportedImageMimeType(mimeType) {
  switch (mimeType) {
    case "image/png":
    case "image/jpeg":
    case "image/gif":
    case "image/webp":
    case "image/bmp":
      return true;
    default:
      return false;
  }
}
class ResponsesTranslationError extends Error {
}
function toBridgeRole(role) {
  switch (role) {
    case "system":
    case "developer":
    case "assistant":
    case "user":
      return role;
    default:
      throw new ResponsesTranslationError(`Unsupported message role '${role ?? ""}'`);
  }
}
function toContentParts(content, itemIndex) {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.map((part, contentIndex) => {
    if ((part.type === "input_text" || part.type === "output_text" || part.type === "text") && typeof part.text === "string") {
      return { type: "text", text: part.text };
    }
    if (part.type === "input_image" && typeof part.image_url === "string") {
      const match = /^data:(?<mimeType>image\/[^;,]+)(?:;[^,]*)?;base64,(?<data>.*)$/.exec(part.image_url);
      if (match?.groups) {
        if (!isSupportedImageMimeType(match.groups.mimeType)) {
          throw new ResponsesTranslationError(`Unsupported input[${itemIndex}].content[${contentIndex}].image_url MIME type '${match.groups.mimeType}'`);
        }
        try {
          decodeBase64(match.groups.data);
        } catch {
          throw new ResponsesTranslationError(`Invalid input[${itemIndex}].content[${contentIndex}].image_url`);
        }
        return {
          type: "image",
          mimeType: match.groups.mimeType,
          data: match.groups.data
        };
      }
      throw new ResponsesTranslationError(`Unsupported input[${itemIndex}].content[${contentIndex}].image_url`);
    }
    throw new ResponsesTranslationError(`Unsupported input[${itemIndex}].content[${contentIndex}] type '${part.type ?? ""}'`);
  });
}
function requiredString(value, path) {
  if (!value) {
    throw new ResponsesTranslationError(`${path} is required`);
  }
  return value;
}
function toBridgeInputItem(item, index) {
  switch (item.type) {
    case "message":
      return {
        type: "message",
        role: toBridgeRole(item.role),
        content: toContentParts(item.content, index)
      };
    case "reasoning":
      return {
        type: "reasoning",
        id: item.id,
        summary: (item.summary ?? []).map((part, summaryIndex) => {
          if (part.type !== "summary_text" || typeof part.text !== "string") {
            throw new ResponsesTranslationError(`Unsupported input[${index}].summary[${summaryIndex}]`);
          }
          return part.text;
        }),
        encryptedContent: item.encrypted_content ?? void 0
      };
    case "function_call":
      return {
        type: "function_call",
        callId: requiredString(item.call_id, `input[${index}].call_id`),
        name: requiredString(item.name, `input[${index}].name`),
        argumentsJson: item.arguments ?? "{}"
      };
    case "function_call_output":
      return {
        type: "function_call_output",
        callId: requiredString(item.call_id, `input[${index}].call_id`),
        output: item.output ?? ""
      };
    case "custom_tool_call":
      return {
        type: "custom_tool_call",
        callId: requiredString(item.call_id, `input[${index}].call_id`),
        name: requiredString(item.name, `input[${index}].name`),
        input: item.input ?? ""
      };
    case "custom_tool_call_output":
      return {
        type: "custom_tool_call_output",
        callId: requiredString(item.call_id, `input[${index}].call_id`),
        output: item.output ?? ""
      };
    default:
      throw new ResponsesTranslationError(`Unsupported input[${index}] type '${item.type ?? ""}'`);
  }
}
function toBridgeTools(tools) {
  if (!tools?.length) {
    return void 0;
  }
  return tools.map((tool, index) => {
    switch (tool.type) {
      case "function":
        return {
          type: "function",
          name: requiredString(tool.name, `tools[${index}].name`),
          description: tool.description,
          parametersSchema: tool.parameters
        };
      case "custom":
        return {
          type: "custom",
          name: requiredString(tool.name, `tools[${index}].name`),
          description: tool.description
        };
      default:
        throw new ResponsesTranslationError(`Unsupported tools[${index}] type '${tool.type ?? ""}'`);
    }
  });
}
function responsesRequestToBridge(vendor, body) {
  const modelId = requiredString(body.model, "model");
  let input;
  if (typeof body.input === "string") {
    input = [{ type: "message", role: "user", content: [{ type: "text", text: body.input }] }];
  } else if (Array.isArray(body.input)) {
    input = body.input.map(toBridgeInputItem);
  } else {
    input = [];
  }
  const modelOptions = {};
  if (typeof body.temperature === "number") {
    modelOptions.temperature = body.temperature;
  }
  if (typeof body.top_p === "number") {
    modelOptions.top_p = body.top_p;
  }
  if (typeof body.max_output_tokens === "number") {
    modelOptions.max_tokens = body.max_output_tokens;
  }
  return {
    vendor,
    modelId,
    instructions: body.instructions,
    input,
    tools: toBridgeTools(body.tools),
    previousResponseId: body.previous_response_id,
    reasoningEffort: body.reasoning?.effort,
    modelOptions: Object.keys(modelOptions).length ? modelOptions : void 0
  };
}
let responseCounter = 0;
function nextId(prefix) {
  responseCounter = (responseCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}_byok_${Date.now().toString(36)}_${responseCounter.toString(36)}`;
}
function sseEvent(eventName, data) {
  return `event: ${eventName}
data: ${JSON.stringify(data)}

`;
}
function toInProgressOutputItem(item) {
  switch (item.type) {
    case "message":
      return { ...item, status: "in_progress", content: [] };
    case "reasoning":
      return { ...item, status: "in_progress", summary: [], encrypted_content: null };
    case "function_call":
      return { ...item, status: "in_progress", arguments: "" };
    case "custom_tool_call":
      return { ...item, status: "in_progress", input: "" };
  }
}
function toResponsesOutputItem(item) {
  switch (item.type) {
    case "message":
      return {
        id: nextId("msg"),
        type: "message",
        role: "assistant",
        status: "completed",
        content: item.content.map((part) => ({ type: "output_text", text: part.text, annotations: [], logprobs: [] }))
      };
    case "reasoning":
      return {
        id: item.id?.startsWith("rs") ? item.id : nextId("rs"),
        type: "reasoning",
        status: "completed",
        summary: item.summary.map((text) => ({ type: "summary_text", text })),
        encrypted_content: item.encryptedContent ?? null
      };
    case "function_call":
      return {
        id: nextId("fc"),
        type: "function_call",
        status: "completed",
        call_id: item.callId,
        name: item.name,
        arguments: item.argumentsJson
      };
    case "custom_tool_call":
      return {
        id: nextId("ctc"),
        type: "custom_tool_call",
        status: "completed",
        call_id: item.callId,
        name: item.name,
        input: item.input
      };
  }
}
function outputText(items) {
  return items.filter((item) => item.type === "message").flatMap((item) => item.content).map((part) => part.text).join("");
}
function responseEnvelope(responseId, model, status, output, usage) {
  return {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1e3),
    status,
    error: null,
    incomplete_details: null,
    instructions: null,
    model,
    output,
    output_text: outputText(output),
    parallel_tool_calls: true,
    temperature: 1,
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    usage
  };
}
function prepareResponse(result, model) {
  const responseId = result.responseId ?? nextId("resp");
  const output = result.output.map(toResponsesOutputItem);
  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;
  const usage = {
    input_tokens: inputTokens,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: outputTokens,
    output_tokens_details: { reasoning_tokens: result.usage?.reasoningTokens ?? 0 },
    total_tokens: inputTokens + outputTokens
  };
  return {
    responseId,
    output,
    completed: responseEnvelope(responseId, model, "completed", output, usage)
  };
}
function bridgeResultToResponsesBody(result, model) {
  return JSON.stringify(prepareResponse(result, model).completed);
}
function reasoningFrames(item, outputIndex, sequence) {
  const frames = [];
  item.summary.forEach((part, summaryIndex) => {
    frames.push(sseEvent("response.reasoning_summary_part.added", {
      type: "response.reasoning_summary_part.added",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      summary_index: summaryIndex,
      part: { type: "summary_text", text: "" }
    }));
    frames.push(sseEvent("response.reasoning_summary_text.delta", {
      type: "response.reasoning_summary_text.delta",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      summary_index: summaryIndex,
      delta: part.text
    }));
    frames.push(sseEvent("response.reasoning_summary_text.done", {
      type: "response.reasoning_summary_text.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      summary_index: summaryIndex,
      text: part.text
    }));
    frames.push(sseEvent("response.reasoning_summary_part.done", {
      type: "response.reasoning_summary_part.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      summary_index: summaryIndex,
      part
    }));
  });
  return frames;
}
function messageFrames(item, outputIndex, sequence) {
  const frames = [];
  item.content.forEach((part, contentIndex) => {
    frames.push(sseEvent("response.content_part.added", {
      type: "response.content_part.added",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      content_index: contentIndex,
      part: { type: "output_text", text: "", annotations: [], logprobs: [] }
    }));
    frames.push(sseEvent("response.output_text.delta", {
      type: "response.output_text.delta",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      content_index: contentIndex,
      delta: part.text,
      logprobs: []
    }));
    frames.push(sseEvent("response.output_text.done", {
      type: "response.output_text.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      content_index: contentIndex,
      text: part.text,
      logprobs: []
    }));
    frames.push(sseEvent("response.content_part.done", {
      type: "response.content_part.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      content_index: contentIndex,
      part
    }));
  });
  return frames;
}
function callFrames(item, outputIndex, sequence) {
  if (item.type === "function_call") {
    return [
      sseEvent("response.function_call_arguments.delta", {
        type: "response.function_call_arguments.delta",
        sequence_number: sequence.value++,
        item_id: item.id,
        output_index: outputIndex,
        delta: item.arguments
      }),
      sseEvent("response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        sequence_number: sequence.value++,
        item_id: item.id,
        output_index: outputIndex,
        arguments: item.arguments
      })
    ];
  }
  return [
    sseEvent("response.custom_tool_call_input.delta", {
      type: "response.custom_tool_call_input.delta",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      delta: item.input
    }),
    sseEvent("response.custom_tool_call_input.done", {
      type: "response.custom_tool_call_input.done",
      sequence_number: sequence.value++,
      item_id: item.id,
      output_index: outputIndex,
      input: item.input
    })
  ];
}
function bridgeResultToResponsesSseFrames(result, model) {
  const { responseId, output, completed } = prepareResponse(result, model);
  const sequence = { value: 0 };
  const frames = [];
  const skeleton = responseEnvelope(responseId, model, "in_progress", [], void 0);
  frames.push(sseEvent("response.created", { type: "response.created", sequence_number: sequence.value++, response: skeleton }));
  frames.push(sseEvent("response.in_progress", { type: "response.in_progress", sequence_number: sequence.value++, response: skeleton }));
  output.forEach((item, outputIndex) => {
    frames.push(sseEvent("response.output_item.added", {
      type: "response.output_item.added",
      sequence_number: sequence.value++,
      output_index: outputIndex,
      item: toInProgressOutputItem(item)
    }));
    switch (item.type) {
      case "message":
        frames.push(...messageFrames(item, outputIndex, sequence));
        break;
      case "reasoning":
        frames.push(...reasoningFrames(item, outputIndex, sequence));
        break;
      case "function_call":
      case "custom_tool_call":
        frames.push(...callFrames(item, outputIndex, sequence));
        break;
    }
    frames.push(sseEvent("response.output_item.done", {
      type: "response.output_item.done",
      sequence_number: sequence.value++,
      output_index: outputIndex,
      item
    }));
  });
  frames.push(sseEvent("response.completed", {
    type: "response.completed",
    sequence_number: sequence.value++,
    response: completed
  }));
  return frames;
}
function responsesErrorBody(message, type = "api_error") {
  return JSON.stringify({ error: { message, type } });
}
export {
  ResponsesTranslationError,
  bridgeResultToResponsesBody,
  bridgeResultToResponsesSseFrames,
  responsesErrorBody,
  responsesRequestToBridge
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxieW9rUmVzcG9uc2VzVHJhbnNsYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHtcblx0Qnlva0xtSW1hZ2VNaW1lVHlwZSxcblx0SUJ5b2tMbUNoYXRSZXF1ZXN0LFxuXHRJQnlva0xtQ2hhdFJlc3VsdCxcblx0SUJ5b2tMbUNvbnRlbnRQYXJ0LFxuXHRJQnlva0xtSW5wdXRJdGVtLFxuXHRJQnlva0xtT3V0cHV0SXRlbSxcblx0SUJ5b2tMbVRvb2wsXG59IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RCeW9rTG0uanMnO1xuXG5pbnRlcmZhY2UgSVJlc3BvbnNlc0NvbnRlbnRQYXJ0IHtcblx0cmVhZG9ubHkgdHlwZT86IHN0cmluZztcblx0cmVhZG9ubHkgdGV4dD86IHN0cmluZztcblx0cmVhZG9ubHkgaW1hZ2VfdXJsPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVJlc3BvbnNlc1N1bW1hcnlQYXJ0IHtcblx0cmVhZG9ubHkgdHlwZT86IHN0cmluZztcblx0cmVhZG9ubHkgdGV4dD86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gaXNTdXBwb3J0ZWRJbWFnZU1pbWVUeXBlKG1pbWVUeXBlOiBzdHJpbmcpOiBtaW1lVHlwZSBpcyBCeW9rTG1JbWFnZU1pbWVUeXBlIHtcblx0c3dpdGNoIChtaW1lVHlwZSkge1xuXHRcdGNhc2UgJ2ltYWdlL3BuZyc6XG5cdFx0Y2FzZSAnaW1hZ2UvanBlZyc6XG5cdFx0Y2FzZSAnaW1hZ2UvZ2lmJzpcblx0XHRjYXNlICdpbWFnZS93ZWJwJzpcblx0XHRjYXNlICdpbWFnZS9ibXAnOlxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVJlc3BvbnNlc0lucHV0SXRlbSB7XG5cdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJvbGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbnRlbnQ/OiBzdHJpbmcgfCBJUmVzcG9uc2VzQ29udGVudFBhcnRbXTtcblx0cmVhZG9ubHkgaWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1bW1hcnk/OiBJUmVzcG9uc2VzU3VtbWFyeVBhcnRbXTtcblx0cmVhZG9ubHkgZW5jcnlwdGVkX2NvbnRlbnQ/OiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBjYWxsX2lkPzogc3RyaW5nO1xuXHRyZWFkb25seSBuYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBhcmd1bWVudHM/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlucHV0Pzogc3RyaW5nO1xuXHRyZWFkb25seSBvdXRwdXQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJUmVzcG9uc2VzVG9vbCB7XG5cdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBwYXJhbWV0ZXJzPzogb2JqZWN0O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNwb25zZXNSZXF1ZXN0IHtcblx0cmVhZG9ubHkgbW9kZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGluc3RydWN0aW9ucz86IHN0cmluZztcblx0cmVhZG9ubHkgaW5wdXQ/OiBzdHJpbmcgfCBJUmVzcG9uc2VzSW5wdXRJdGVtW107XG5cdHJlYWRvbmx5IHRvb2xzPzogSVJlc3BvbnNlc1Rvb2xbXTtcblx0cmVhZG9ubHkgcHJldmlvdXNfcmVzcG9uc2VfaWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlYXNvbmluZz86IHtcblx0XHRyZWFkb25seSBlZmZvcnQ/OiBzdHJpbmc7XG5cdH07XG5cdHJlYWRvbmx5IHRlbXBlcmF0dXJlPzogbnVtYmVyO1xuXHRyZWFkb25seSB0b3BfcD86IG51bWJlcjtcblx0cmVhZG9ubHkgbWF4X291dHB1dF90b2tlbnM/OiBudW1iZXI7XG5cdHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd247XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNwb25zZXNUcmFuc2xhdGlvbkVycm9yIGV4dGVuZHMgRXJyb3IgeyB9XG5cbmZ1bmN0aW9uIHRvQnJpZGdlUm9sZShyb2xlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiAnc3lzdGVtJyB8ICdkZXZlbG9wZXInIHwgJ3VzZXInIHwgJ2Fzc2lzdGFudCcge1xuXHRzd2l0Y2ggKHJvbGUpIHtcblx0XHRjYXNlICdzeXN0ZW0nOlxuXHRcdGNhc2UgJ2RldmVsb3Blcic6XG5cdFx0Y2FzZSAnYXNzaXN0YW50Jzpcblx0XHRjYXNlICd1c2VyJzpcblx0XHRcdHJldHVybiByb2xlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHR0aHJvdyBuZXcgUmVzcG9uc2VzVHJhbnNsYXRpb25FcnJvcihgVW5zdXBwb3J0ZWQgbWVzc2FnZSByb2xlICcke3JvbGUgPz8gJyd9J2ApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvQ29udGVudFBhcnRzKGNvbnRlbnQ6IHN0cmluZyB8IElSZXNwb25zZXNDb250ZW50UGFydFtdIHwgdW5kZWZpbmVkLCBpdGVtSW5kZXg6IG51bWJlcik6IElCeW9rTG1Db250ZW50UGFydFtdIHtcblx0aWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBjb250ZW50ID8gW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiBjb250ZW50IH1dIDogW107XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQpKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdHJldHVybiBjb250ZW50Lm1hcCgocGFydCwgY29udGVudEluZGV4KSA9PiB7XG5cdFx0aWYgKChwYXJ0LnR5cGUgPT09ICdpbnB1dF90ZXh0JyB8fCBwYXJ0LnR5cGUgPT09ICdvdXRwdXRfdGV4dCcgfHwgcGFydC50eXBlID09PSAndGV4dCcpICYmIHR5cGVvZiBwYXJ0LnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiAndGV4dCcgYXMgY29uc3QsIHRleHQ6IHBhcnQudGV4dCB9O1xuXHRcdH1cblx0XHRpZiAocGFydC50eXBlID09PSAnaW5wdXRfaW1hZ2UnICYmIHR5cGVvZiBwYXJ0LmltYWdlX3VybCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IG1hdGNoID0gL15kYXRhOig/PG1pbWVUeXBlPmltYWdlXFwvW147LF0rKSg/OjtbXixdKik/O2Jhc2U2NCwoPzxkYXRhPi4qKSQvLmV4ZWMocGFydC5pbWFnZV91cmwpO1xuXHRcdFx0aWYgKG1hdGNoPy5ncm91cHMpIHtcblx0XHRcdFx0aWYgKCFpc1N1cHBvcnRlZEltYWdlTWltZVR5cGUobWF0Y2guZ3JvdXBzLm1pbWVUeXBlKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBSZXNwb25zZXNUcmFuc2xhdGlvbkVycm9yKGBVbnN1cHBvcnRlZCBpbnB1dFske2l0ZW1JbmRleH1dLmNvbnRlbnRbJHtjb250ZW50SW5kZXh9XS5pbWFnZV91cmwgTUlNRSB0eXBlICcke21hdGNoLmdyb3Vwcy5taW1lVHlwZX0nYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRkZWNvZGVCYXNlNjQobWF0Y2guZ3JvdXBzLmRhdGEpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgUmVzcG9uc2VzVHJhbnNsYXRpb25FcnJvcihgSW52YWxpZCBpbnB1dFske2l0ZW1JbmRleH1dLmNvbnRlbnRbJHtjb250ZW50SW5kZXh9XS5pbWFnZV91cmxgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICdpbWFnZScgYXMgY29uc3QsXG5cdFx0XHRcdFx0bWltZVR5cGU6IG1hdGNoLmdyb3Vwcy5taW1lVHlwZSxcblx0XHRcdFx0XHRkYXRhOiBtYXRjaC5ncm91cHMuZGF0YSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBSZXNwb25zZXNUcmFuc2xhdGlvbkVycm9yKGBVbnN1cHBvcnRlZCBpbnB1dFske2l0ZW1JbmRleH1dLmNvbnRlbnRbJHtjb250ZW50SW5kZXh9XS5pbWFnZV91cmxgKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IFJlc3BvbnNlc1RyYW5zbGF0aW9uRXJyb3IoYFVuc3VwcG9ydGVkIGlucHV0WyR7aXRlbUluZGV4fV0uY29udGVudFske2NvbnRlbnRJbmRleH1dIHR5cGUgJyR7cGFydC50eXBlID8/ICcnfSdgKTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJlcXVpcmVkU3RyaW5nKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQsIHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghdmFsdWUpIHtcblx0XHR0aHJvdyBuZXcgUmVzcG9uc2VzVHJhbnNsYXRpb25FcnJvcihgJHtwYXRofSBpcyByZXF1aXJlZGApO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gdG9CcmlkZ2VJbnB1dEl0ZW0oaXRlbTogSVJlc3BvbnNlc0lucHV0SXRlbSwgaW5kZXg6IG51bWJlcik6IElCeW9rTG1JbnB1dEl0ZW0ge1xuXHRzd2l0Y2ggKGl0ZW0udHlwZSkge1xuXHRcdGNhc2UgJ21lc3NhZ2UnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ21lc3NhZ2UnLFxuXHRcdFx0XHRyb2xlOiB0b0JyaWRnZVJvbGUoaXRlbS5yb2xlKSxcblx0XHRcdFx0Y29udGVudDogdG9Db250ZW50UGFydHMoaXRlbS5jb250ZW50LCBpbmRleCksXG5cdFx0XHR9O1xuXHRcdGNhc2UgJ3JlYXNvbmluZyc6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAncmVhc29uaW5nJyxcblx0XHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdHN1bW1hcnk6IChpdGVtLnN1bW1hcnkgPz8gW10pLm1hcCgocGFydCwgc3VtbWFyeUluZGV4KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHBhcnQudHlwZSAhPT0gJ3N1bW1hcnlfdGV4dCcgfHwgdHlwZW9mIHBhcnQudGV4dCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBSZXNwb25zZXNUcmFuc2xhdGlvbkVycm9yKGBVbnN1cHBvcnRlZCBpbnB1dFske2luZGV4fV0uc3VtbWFyeVske3N1bW1hcnlJbmRleH1dYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBwYXJ0LnRleHQ7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRlbmNyeXB0ZWRDb250ZW50OiBpdGVtLmVuY3J5cHRlZF9jb250ZW50ID8/IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0Y2FzZSAnZnVuY3Rpb25fY2FsbCc6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiAnZnVuY3Rpb25fY2FsbCcsXG5cdFx0XHRcdGNhbGxJZDogcmVxdWlyZWRTdHJpbmcoaXRlbS5jYWxsX2lkLCBgaW5wdXRbJHtpbmRleH1dLmNhbGxfaWRgKSxcblx0XHRcdFx0bmFtZTogcmVxdWlyZWRTdHJpbmcoaXRlbS5uYW1lLCBgaW5wdXRbJHtpbmRleH1dLm5hbWVgKSxcblx0XHRcdFx0YXJndW1lbnRzSnNvbjogaXRlbS5hcmd1bWVudHMgPz8gJ3t9Jyxcblx0XHRcdH07XG5cdFx0Y2FzZSAnZnVuY3Rpb25fY2FsbF9vdXRwdXQnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2Z1bmN0aW9uX2NhbGxfb3V0cHV0Jyxcblx0XHRcdFx0Y2FsbElkOiByZXF1aXJlZFN0cmluZyhpdGVtLmNhbGxfaWQsIGBpbnB1dFske2luZGV4fV0uY2FsbF9pZGApLFxuXHRcdFx0XHRvdXRwdXQ6IGl0ZW0ub3V0cHV0ID8/ICcnLFxuXHRcdFx0fTtcblx0XHRjYXNlICdjdXN0b21fdG9vbF9jYWxsJzpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJyxcblx0XHRcdFx0Y2FsbElkOiByZXF1aXJlZFN0cmluZyhpdGVtLmNhbGxfaWQsIGBpbnB1dFske2luZGV4fV0uY2FsbF9pZGApLFxuXHRcdFx0XHRuYW1lOiByZXF1aXJlZFN0cmluZyhpdGVtLm5hbWUsIGBpbnB1dFske2luZGV4fV0ubmFtZWApLFxuXHRcdFx0XHRpbnB1dDogaXRlbS5pbnB1dCA/PyAnJyxcblx0XHRcdH07XG5cdFx0Y2FzZSAnY3VzdG9tX3Rvb2xfY2FsbF9vdXRwdXQnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2N1c3RvbV90b29sX2NhbGxfb3V0cHV0Jyxcblx0XHRcdFx0Y2FsbElkOiByZXF1aXJlZFN0cmluZyhpdGVtLmNhbGxfaWQsIGBpbnB1dFske2luZGV4fV0uY2FsbF9pZGApLFxuXHRcdFx0XHRvdXRwdXQ6IGl0ZW0ub3V0cHV0ID8/ICcnLFxuXHRcdFx0fTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgbmV3IFJlc3BvbnNlc1RyYW5zbGF0aW9uRXJyb3IoYFVuc3VwcG9ydGVkIGlucHV0WyR7aW5kZXh9XSB0eXBlICcke2l0ZW0udHlwZSA/PyAnJ30nYCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9CcmlkZ2VUb29scyh0b29sczogSVJlc3BvbnNlc1Rvb2xbXSB8IHVuZGVmaW5lZCk6IElCeW9rTG1Ub29sW10gfCB1bmRlZmluZWQge1xuXHRpZiAoIXRvb2xzPy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB0b29scy5tYXAoKHRvb2wsIGluZGV4KSA9PiB7XG5cdFx0c3dpdGNoICh0b29sLnR5cGUpIHtcblx0XHRcdGNhc2UgJ2Z1bmN0aW9uJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAnZnVuY3Rpb24nLFxuXHRcdFx0XHRcdG5hbWU6IHJlcXVpcmVkU3RyaW5nKHRvb2wubmFtZSwgYHRvb2xzWyR7aW5kZXh9XS5uYW1lYCksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHRvb2wuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0cGFyYW1ldGVyc1NjaGVtYTogdG9vbC5wYXJhbWV0ZXJzLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnY3VzdG9tJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAnY3VzdG9tJyxcblx0XHRcdFx0XHRuYW1lOiByZXF1aXJlZFN0cmluZyh0b29sLm5hbWUsIGB0b29sc1ske2luZGV4fV0ubmFtZWApLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0b29sLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHR9O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgbmV3IFJlc3BvbnNlc1RyYW5zbGF0aW9uRXJyb3IoYFVuc3VwcG9ydGVkIHRvb2xzWyR7aW5kZXh9XSB0eXBlICcke3Rvb2wudHlwZSA/PyAnJ30nYCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc3BvbnNlc1JlcXVlc3RUb0JyaWRnZSh2ZW5kb3I6IHN0cmluZywgYm9keTogSVJlc3BvbnNlc1JlcXVlc3QpOiBJQnlva0xtQ2hhdFJlcXVlc3Qge1xuXHRjb25zdCBtb2RlbElkID0gcmVxdWlyZWRTdHJpbmcoYm9keS5tb2RlbCwgJ21vZGVsJyk7XG5cdGxldCBpbnB1dDogSUJ5b2tMbUlucHV0SXRlbVtdO1xuXHRpZiAodHlwZW9mIGJvZHkuaW5wdXQgPT09ICdzdHJpbmcnKSB7XG5cdFx0aW5wdXQgPSBbeyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiBib2R5LmlucHV0IH1dIH1dO1xuXHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYm9keS5pbnB1dCkpIHtcblx0XHRpbnB1dCA9IGJvZHkuaW5wdXQubWFwKHRvQnJpZGdlSW5wdXRJdGVtKTtcblx0fSBlbHNlIHtcblx0XHRpbnB1dCA9IFtdO1xuXHR9XG5cblx0Y29uc3QgbW9kZWxPcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRpZiAodHlwZW9mIGJvZHkudGVtcGVyYXR1cmUgPT09ICdudW1iZXInKSB7XG5cdFx0bW9kZWxPcHRpb25zLnRlbXBlcmF0dXJlID0gYm9keS50ZW1wZXJhdHVyZTtcblx0fVxuXHRpZiAodHlwZW9mIGJvZHkudG9wX3AgPT09ICdudW1iZXInKSB7XG5cdFx0bW9kZWxPcHRpb25zLnRvcF9wID0gYm9keS50b3BfcDtcblx0fVxuXHRpZiAodHlwZW9mIGJvZHkubWF4X291dHB1dF90b2tlbnMgPT09ICdudW1iZXInKSB7XG5cdFx0bW9kZWxPcHRpb25zLm1heF90b2tlbnMgPSBib2R5Lm1heF9vdXRwdXRfdG9rZW5zO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHR2ZW5kb3IsXG5cdFx0bW9kZWxJZCxcblx0XHRpbnN0cnVjdGlvbnM6IGJvZHkuaW5zdHJ1Y3Rpb25zLFxuXHRcdGlucHV0LFxuXHRcdHRvb2xzOiB0b0JyaWRnZVRvb2xzKGJvZHkudG9vbHMpLFxuXHRcdHByZXZpb3VzUmVzcG9uc2VJZDogYm9keS5wcmV2aW91c19yZXNwb25zZV9pZCxcblx0XHRyZWFzb25pbmdFZmZvcnQ6IGJvZHkucmVhc29uaW5nPy5lZmZvcnQsXG5cdFx0bW9kZWxPcHRpb25zOiBPYmplY3Qua2V5cyhtb2RlbE9wdGlvbnMpLmxlbmd0aCA/IG1vZGVsT3B0aW9ucyA6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxubGV0IHJlc3BvbnNlQ291bnRlciA9IDA7XG5cbmZ1bmN0aW9uIG5leHRJZChwcmVmaXg6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJlc3BvbnNlQ291bnRlciA9IChyZXNwb25zZUNvdW50ZXIgKyAxKSAlIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSO1xuXHRyZXR1cm4gYCR7cHJlZml4fV9ieW9rXyR7RGF0ZS5ub3coKS50b1N0cmluZygzNil9XyR7cmVzcG9uc2VDb3VudGVyLnRvU3RyaW5nKDM2KX1gO1xufVxuXG5mdW5jdGlvbiBzc2VFdmVudChldmVudE5hbWU6IHN0cmluZywgZGF0YTogdW5rbm93bik6IHN0cmluZyB7XG5cdHJldHVybiBgZXZlbnQ6ICR7ZXZlbnROYW1lfVxcbmRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9XFxuXFxuYDtcbn1cblxudHlwZSBSZXNwb25zZXNPdXRwdXRJdGVtID1cblx0fCB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IHR5cGU6ICdtZXNzYWdlJzsgcmVhZG9ubHkgcm9sZTogJ2Fzc2lzdGFudCc7IHJlYWRvbmx5IHN0YXR1czogJ2NvbXBsZXRlZCc7IHJlYWRvbmx5IGNvbnRlbnQ6IEFycmF5PHsgcmVhZG9ubHkgdHlwZTogJ291dHB1dF90ZXh0JzsgcmVhZG9ubHkgdGV4dDogc3RyaW5nOyByZWFkb25seSBhbm5vdGF0aW9uczogdW5rbm93bltdOyByZWFkb25seSBsb2dwcm9iczogdW5rbm93bltdIH0+IH1cblx0fCB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IHR5cGU6ICdyZWFzb25pbmcnOyByZWFkb25seSBzdGF0dXM6ICdjb21wbGV0ZWQnOyByZWFkb25seSBzdW1tYXJ5OiBBcnJheTx7IHJlYWRvbmx5IHR5cGU6ICdzdW1tYXJ5X3RleHQnOyByZWFkb25seSB0ZXh0OiBzdHJpbmcgfT47IHJlYWRvbmx5IGVuY3J5cHRlZF9jb250ZW50OiBzdHJpbmcgfCBudWxsIH1cblx0fCB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IHR5cGU6ICdmdW5jdGlvbl9jYWxsJzsgcmVhZG9ubHkgc3RhdHVzOiAnY29tcGxldGVkJzsgcmVhZG9ubHkgY2FsbF9pZDogc3RyaW5nOyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGFyZ3VtZW50czogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJzsgcmVhZG9ubHkgc3RhdHVzOiAnY29tcGxldGVkJzsgcmVhZG9ubHkgY2FsbF9pZDogc3RyaW5nOyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGlucHV0OiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gdG9JblByb2dyZXNzT3V0cHV0SXRlbShpdGVtOiBSZXNwb25zZXNPdXRwdXRJdGVtKTogb2JqZWN0IHtcblx0c3dpdGNoIChpdGVtLnR5cGUpIHtcblx0XHRjYXNlICdtZXNzYWdlJzpcblx0XHRcdHJldHVybiB7IC4uLml0ZW0sIHN0YXR1czogJ2luX3Byb2dyZXNzJywgY29udGVudDogW10gfTtcblx0XHRjYXNlICdyZWFzb25pbmcnOlxuXHRcdFx0cmV0dXJuIHsgLi4uaXRlbSwgc3RhdHVzOiAnaW5fcHJvZ3Jlc3MnLCBzdW1tYXJ5OiBbXSwgZW5jcnlwdGVkX2NvbnRlbnQ6IG51bGwgfTtcblx0XHRjYXNlICdmdW5jdGlvbl9jYWxsJzpcblx0XHRcdHJldHVybiB7IC4uLml0ZW0sIHN0YXR1czogJ2luX3Byb2dyZXNzJywgYXJndW1lbnRzOiAnJyB9O1xuXHRcdGNhc2UgJ2N1c3RvbV90b29sX2NhbGwnOlxuXHRcdFx0cmV0dXJuIHsgLi4uaXRlbSwgc3RhdHVzOiAnaW5fcHJvZ3Jlc3MnLCBpbnB1dDogJycgfTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b1Jlc3BvbnNlc091dHB1dEl0ZW0oaXRlbTogSUJ5b2tMbU91dHB1dEl0ZW0pOiBSZXNwb25zZXNPdXRwdXRJdGVtIHtcblx0c3dpdGNoIChpdGVtLnR5cGUpIHtcblx0XHRjYXNlICdtZXNzYWdlJzpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBuZXh0SWQoJ21zZycpLFxuXHRcdFx0XHR0eXBlOiAnbWVzc2FnZScsXG5cdFx0XHRcdHJvbGU6ICdhc3Npc3RhbnQnLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHRjb250ZW50OiBpdGVtLmNvbnRlbnQubWFwKHBhcnQgPT4gKHsgdHlwZTogJ291dHB1dF90ZXh0JywgdGV4dDogcGFydC50ZXh0LCBhbm5vdGF0aW9uczogW10sIGxvZ3Byb2JzOiBbXSB9KSksXG5cdFx0XHR9O1xuXHRcdGNhc2UgJ3JlYXNvbmluZyc6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogaXRlbS5pZD8uc3RhcnRzV2l0aCgncnMnKSA/IGl0ZW0uaWQgOiBuZXh0SWQoJ3JzJyksXG5cdFx0XHRcdHR5cGU6ICdyZWFzb25pbmcnLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHRzdW1tYXJ5OiBpdGVtLnN1bW1hcnkubWFwKHRleHQgPT4gKHsgdHlwZTogJ3N1bW1hcnlfdGV4dCcsIHRleHQgfSkpLFxuXHRcdFx0XHRlbmNyeXB0ZWRfY29udGVudDogaXRlbS5lbmNyeXB0ZWRDb250ZW50ID8/IG51bGwsXG5cdFx0XHR9O1xuXHRcdGNhc2UgJ2Z1bmN0aW9uX2NhbGwnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IG5leHRJZCgnZmMnKSxcblx0XHRcdFx0dHlwZTogJ2Z1bmN0aW9uX2NhbGwnLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHRjYWxsX2lkOiBpdGVtLmNhbGxJZCxcblx0XHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0XHRhcmd1bWVudHM6IGl0ZW0uYXJndW1lbnRzSnNvbixcblx0XHRcdH07XG5cdFx0Y2FzZSAnY3VzdG9tX3Rvb2xfY2FsbCc6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogbmV4dElkKCdjdGMnKSxcblx0XHRcdFx0dHlwZTogJ2N1c3RvbV90b29sX2NhbGwnLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHRjYWxsX2lkOiBpdGVtLmNhbGxJZCxcblx0XHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0XHRpbnB1dDogaXRlbS5pbnB1dCxcblx0XHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gb3V0cHV0VGV4dChpdGVtczogcmVhZG9ubHkgUmVzcG9uc2VzT3V0cHV0SXRlbVtdKTogc3RyaW5nIHtcblx0cmV0dXJuIGl0ZW1zXG5cdFx0LmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgRXh0cmFjdDxSZXNwb25zZXNPdXRwdXRJdGVtLCB7IHR5cGU6ICdtZXNzYWdlJyB9PiA9PiBpdGVtLnR5cGUgPT09ICdtZXNzYWdlJylcblx0XHQuZmxhdE1hcChpdGVtID0+IGl0ZW0uY29udGVudClcblx0XHQubWFwKHBhcnQgPT4gcGFydC50ZXh0KVxuXHRcdC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gcmVzcG9uc2VFbnZlbG9wZShyZXNwb25zZUlkOiBzdHJpbmcsIG1vZGVsOiBzdHJpbmcsIHN0YXR1czogJ2luX3Byb2dyZXNzJyB8ICdjb21wbGV0ZWQnLCBvdXRwdXQ6IHJlYWRvbmx5IFJlc3BvbnNlc091dHB1dEl0ZW1bXSwgdXNhZ2U6IHVua25vd24pIHtcblx0cmV0dXJuIHtcblx0XHRpZDogcmVzcG9uc2VJZCxcblx0XHRvYmplY3Q6ICdyZXNwb25zZScsXG5cdFx0Y3JlYXRlZF9hdDogTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCksXG5cdFx0c3RhdHVzLFxuXHRcdGVycm9yOiBudWxsLFxuXHRcdGluY29tcGxldGVfZGV0YWlsczogbnVsbCxcblx0XHRpbnN0cnVjdGlvbnM6IG51bGwsXG5cdFx0bW9kZWwsXG5cdFx0b3V0cHV0LFxuXHRcdG91dHB1dF90ZXh0OiBvdXRwdXRUZXh0KG91dHB1dCksXG5cdFx0cGFyYWxsZWxfdG9vbF9jYWxsczogdHJ1ZSxcblx0XHR0ZW1wZXJhdHVyZTogMSxcblx0XHR0b29sX2Nob2ljZTogJ2F1dG8nLFxuXHRcdHRvb2xzOiBbXSxcblx0XHR0b3BfcDogMSxcblx0XHR1c2FnZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcHJlcGFyZVJlc3BvbnNlKHJlc3VsdDogSUJ5b2tMbUNoYXRSZXN1bHQsIG1vZGVsOiBzdHJpbmcpIHtcblx0Y29uc3QgcmVzcG9uc2VJZCA9IHJlc3VsdC5yZXNwb25zZUlkID8/IG5leHRJZCgncmVzcCcpO1xuXHRjb25zdCBvdXRwdXQgPSByZXN1bHQub3V0cHV0Lm1hcCh0b1Jlc3BvbnNlc091dHB1dEl0ZW0pO1xuXHRjb25zdCBpbnB1dFRva2VucyA9IHJlc3VsdC51c2FnZT8uaW5wdXRUb2tlbnMgPz8gMDtcblx0Y29uc3Qgb3V0cHV0VG9rZW5zID0gcmVzdWx0LnVzYWdlPy5vdXRwdXRUb2tlbnMgPz8gMDtcblx0Y29uc3QgdXNhZ2UgPSB7XG5cdFx0aW5wdXRfdG9rZW5zOiBpbnB1dFRva2Vucyxcblx0XHRpbnB1dF90b2tlbnNfZGV0YWlsczogeyBjYWNoZWRfdG9rZW5zOiAwIH0sXG5cdFx0b3V0cHV0X3Rva2Vuczogb3V0cHV0VG9rZW5zLFxuXHRcdG91dHB1dF90b2tlbnNfZGV0YWlsczogeyByZWFzb25pbmdfdG9rZW5zOiByZXN1bHQudXNhZ2U/LnJlYXNvbmluZ1Rva2VucyA/PyAwIH0sXG5cdFx0dG90YWxfdG9rZW5zOiBpbnB1dFRva2VucyArIG91dHB1dFRva2Vucyxcblx0fTtcblx0cmV0dXJuIHtcblx0XHRyZXNwb25zZUlkLFxuXHRcdG91dHB1dCxcblx0XHRjb21wbGV0ZWQ6IHJlc3BvbnNlRW52ZWxvcGUocmVzcG9uc2VJZCwgbW9kZWwsICdjb21wbGV0ZWQnLCBvdXRwdXQsIHVzYWdlKSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJyaWRnZVJlc3VsdFRvUmVzcG9uc2VzQm9keShyZXN1bHQ6IElCeW9rTG1DaGF0UmVzdWx0LCBtb2RlbDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHByZXBhcmVSZXNwb25zZShyZXN1bHQsIG1vZGVsKS5jb21wbGV0ZWQpO1xufVxuXG5mdW5jdGlvbiByZWFzb25pbmdGcmFtZXMoaXRlbTogRXh0cmFjdDxSZXNwb25zZXNPdXRwdXRJdGVtLCB7IHR5cGU6ICdyZWFzb25pbmcnIH0+LCBvdXRwdXRJbmRleDogbnVtYmVyLCBzZXF1ZW5jZTogeyB2YWx1ZTogbnVtYmVyIH0pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGZyYW1lczogc3RyaW5nW10gPSBbXTtcblx0aXRlbS5zdW1tYXJ5LmZvckVhY2goKHBhcnQsIHN1bW1hcnlJbmRleCkgPT4ge1xuXHRcdGZyYW1lcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV9wYXJ0LmFkZGVkJywge1xuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3BhcnQuYWRkZWQnLFxuXHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0aXRlbV9pZDogaXRlbS5pZCxcblx0XHRcdG91dHB1dF9pbmRleDogb3V0cHV0SW5kZXgsXG5cdFx0XHRzdW1tYXJ5X2luZGV4OiBzdW1tYXJ5SW5kZXgsXG5cdFx0XHRwYXJ0OiB7IHR5cGU6ICdzdW1tYXJ5X3RleHQnLCB0ZXh0OiAnJyB9LFxuXHRcdH0pKTtcblx0XHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfdGV4dC5kZWx0YScsIHtcblx0XHRcdHR5cGU6ICdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV90ZXh0LmRlbHRhJyxcblx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0c3VtbWFyeV9pbmRleDogc3VtbWFyeUluZGV4LFxuXHRcdFx0ZGVsdGE6IHBhcnQudGV4dCxcblx0XHR9KSk7XG5cdFx0ZnJhbWVzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLnJlYXNvbmluZ19zdW1tYXJ5X3RleHQuZG9uZScsIHtcblx0XHRcdHR5cGU6ICdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV90ZXh0LmRvbmUnLFxuXHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0aXRlbV9pZDogaXRlbS5pZCxcblx0XHRcdG91dHB1dF9pbmRleDogb3V0cHV0SW5kZXgsXG5cdFx0XHRzdW1tYXJ5X2luZGV4OiBzdW1tYXJ5SW5kZXgsXG5cdFx0XHR0ZXh0OiBwYXJ0LnRleHQsXG5cdFx0fSkpO1xuXHRcdGZyYW1lcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5yZWFzb25pbmdfc3VtbWFyeV9wYXJ0LmRvbmUnLCB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2UucmVhc29uaW5nX3N1bW1hcnlfcGFydC5kb25lJyxcblx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0c3VtbWFyeV9pbmRleDogc3VtbWFyeUluZGV4LFxuXHRcdFx0cGFydCxcblx0XHR9KSk7XG5cdH0pO1xuXHRyZXR1cm4gZnJhbWVzO1xufVxuXG5mdW5jdGlvbiBtZXNzYWdlRnJhbWVzKGl0ZW06IEV4dHJhY3Q8UmVzcG9uc2VzT3V0cHV0SXRlbSwgeyB0eXBlOiAnbWVzc2FnZScgfT4sIG91dHB1dEluZGV4OiBudW1iZXIsIHNlcXVlbmNlOiB7IHZhbHVlOiBudW1iZXIgfSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgZnJhbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRpdGVtLmNvbnRlbnQuZm9yRWFjaCgocGFydCwgY29udGVudEluZGV4KSA9PiB7XG5cdFx0ZnJhbWVzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLmNvbnRlbnRfcGFydC5hZGRlZCcsIHtcblx0XHRcdHR5cGU6ICdyZXNwb25zZS5jb250ZW50X3BhcnQuYWRkZWQnLFxuXHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0aXRlbV9pZDogaXRlbS5pZCxcblx0XHRcdG91dHB1dF9pbmRleDogb3V0cHV0SW5kZXgsXG5cdFx0XHRjb250ZW50X2luZGV4OiBjb250ZW50SW5kZXgsXG5cdFx0XHRwYXJ0OiB7IHR5cGU6ICdvdXRwdXRfdGV4dCcsIHRleHQ6ICcnLCBhbm5vdGF0aW9uczogW10sIGxvZ3Byb2JzOiBbXSB9LFxuXHRcdH0pKTtcblx0XHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2Uub3V0cHV0X3RleHQuZGVsdGEnLCB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2Uub3V0cHV0X3RleHQuZGVsdGEnLFxuXHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0aXRlbV9pZDogaXRlbS5pZCxcblx0XHRcdG91dHB1dF9pbmRleDogb3V0cHV0SW5kZXgsXG5cdFx0XHRjb250ZW50X2luZGV4OiBjb250ZW50SW5kZXgsXG5cdFx0XHRkZWx0YTogcGFydC50ZXh0LFxuXHRcdFx0bG9ncHJvYnM6IFtdLFxuXHRcdH0pKTtcblx0XHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2Uub3V0cHV0X3RleHQuZG9uZScsIHtcblx0XHRcdHR5cGU6ICdyZXNwb25zZS5vdXRwdXRfdGV4dC5kb25lJyxcblx0XHRcdHNlcXVlbmNlX251bWJlcjogc2VxdWVuY2UudmFsdWUrKyxcblx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0Y29udGVudF9pbmRleDogY29udGVudEluZGV4LFxuXHRcdFx0dGV4dDogcGFydC50ZXh0LFxuXHRcdFx0bG9ncHJvYnM6IFtdLFxuXHRcdH0pKTtcblx0XHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2UuY29udGVudF9wYXJ0LmRvbmUnLCB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2UuY29udGVudF9wYXJ0LmRvbmUnLFxuXHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0aXRlbV9pZDogaXRlbS5pZCxcblx0XHRcdG91dHB1dF9pbmRleDogb3V0cHV0SW5kZXgsXG5cdFx0XHRjb250ZW50X2luZGV4OiBjb250ZW50SW5kZXgsXG5cdFx0XHRwYXJ0LFxuXHRcdH0pKTtcblx0fSk7XG5cdHJldHVybiBmcmFtZXM7XG59XG5cbmZ1bmN0aW9uIGNhbGxGcmFtZXMoaXRlbTogRXh0cmFjdDxSZXNwb25zZXNPdXRwdXRJdGVtLCB7IHR5cGU6ICdmdW5jdGlvbl9jYWxsJyB8ICdjdXN0b21fdG9vbF9jYWxsJyB9Piwgb3V0cHV0SW5kZXg6IG51bWJlciwgc2VxdWVuY2U6IHsgdmFsdWU6IG51bWJlciB9KTogc3RyaW5nW10ge1xuXHRpZiAoaXRlbS50eXBlID09PSAnZnVuY3Rpb25fY2FsbCcpIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0c3NlRXZlbnQoJ3Jlc3BvbnNlLmZ1bmN0aW9uX2NhbGxfYXJndW1lbnRzLmRlbHRhJywge1xuXHRcdFx0XHR0eXBlOiAncmVzcG9uc2UuZnVuY3Rpb25fY2FsbF9hcmd1bWVudHMuZGVsdGEnLFxuXHRcdFx0XHRzZXF1ZW5jZV9udW1iZXI6IHNlcXVlbmNlLnZhbHVlKyssXG5cdFx0XHRcdGl0ZW1faWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdG91dHB1dF9pbmRleDogb3V0cHV0SW5kZXgsXG5cdFx0XHRcdGRlbHRhOiBpdGVtLmFyZ3VtZW50cyxcblx0XHRcdH0pLFxuXHRcdFx0c3NlRXZlbnQoJ3Jlc3BvbnNlLmZ1bmN0aW9uX2NhbGxfYXJndW1lbnRzLmRvbmUnLCB7XG5cdFx0XHRcdHR5cGU6ICdyZXNwb25zZS5mdW5jdGlvbl9jYWxsX2FyZ3VtZW50cy5kb25lJyxcblx0XHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0XHRpdGVtX2lkOiBpdGVtLmlkLFxuXHRcdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0XHRhcmd1bWVudHM6IGl0ZW0uYXJndW1lbnRzLFxuXHRcdFx0fSksXG5cdFx0XTtcblx0fVxuXHRyZXR1cm4gW1xuXHRcdHNzZUV2ZW50KCdyZXNwb25zZS5jdXN0b21fdG9vbF9jYWxsX2lucHV0LmRlbHRhJywge1xuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlLmN1c3RvbV90b29sX2NhbGxfaW5wdXQuZGVsdGEnLFxuXHRcdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdFx0aXRlbV9pZDogaXRlbS5pZCxcblx0XHRcdG91dHB1dF9pbmRleDogb3V0cHV0SW5kZXgsXG5cdFx0XHRkZWx0YTogaXRlbS5pbnB1dCxcblx0XHR9KSxcblx0XHRzc2VFdmVudCgncmVzcG9uc2UuY3VzdG9tX3Rvb2xfY2FsbF9pbnB1dC5kb25lJywge1xuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlLmN1c3RvbV90b29sX2NhbGxfaW5wdXQuZG9uZScsXG5cdFx0XHRzZXF1ZW5jZV9udW1iZXI6IHNlcXVlbmNlLnZhbHVlKyssXG5cdFx0XHRpdGVtX2lkOiBpdGVtLmlkLFxuXHRcdFx0b3V0cHV0X2luZGV4OiBvdXRwdXRJbmRleCxcblx0XHRcdGlucHV0OiBpdGVtLmlucHV0LFxuXHRcdH0pLFxuXHRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnJpZGdlUmVzdWx0VG9SZXNwb25zZXNTc2VGcmFtZXMocmVzdWx0OiBJQnlva0xtQ2hhdFJlc3VsdCwgbW9kZWw6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0Y29uc3QgeyByZXNwb25zZUlkLCBvdXRwdXQsIGNvbXBsZXRlZCB9ID0gcHJlcGFyZVJlc3BvbnNlKHJlc3VsdCwgbW9kZWwpO1xuXHRjb25zdCBzZXF1ZW5jZSA9IHsgdmFsdWU6IDAgfTtcblx0Y29uc3QgZnJhbWVzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCBza2VsZXRvbiA9IHJlc3BvbnNlRW52ZWxvcGUocmVzcG9uc2VJZCwgbW9kZWwsICdpbl9wcm9ncmVzcycsIFtdLCB1bmRlZmluZWQpO1xuXHRmcmFtZXMucHVzaChzc2VFdmVudCgncmVzcG9uc2UuY3JlYXRlZCcsIHsgdHlwZTogJ3Jlc3BvbnNlLmNyZWF0ZWQnLCBzZXF1ZW5jZV9udW1iZXI6IHNlcXVlbmNlLnZhbHVlKyssIHJlc3BvbnNlOiBza2VsZXRvbiB9KSk7XG5cdGZyYW1lcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5pbl9wcm9ncmVzcycsIHsgdHlwZTogJ3Jlc3BvbnNlLmluX3Byb2dyZXNzJywgc2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLCByZXNwb25zZTogc2tlbGV0b24gfSkpO1xuXG5cdG91dHB1dC5mb3JFYWNoKChpdGVtLCBvdXRwdXRJbmRleCkgPT4ge1xuXHRcdGZyYW1lcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5vdXRwdXRfaXRlbS5hZGRlZCcsIHtcblx0XHRcdHR5cGU6ICdyZXNwb25zZS5vdXRwdXRfaXRlbS5hZGRlZCcsXG5cdFx0XHRzZXF1ZW5jZV9udW1iZXI6IHNlcXVlbmNlLnZhbHVlKyssXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0aXRlbTogdG9JblByb2dyZXNzT3V0cHV0SXRlbShpdGVtKSxcblx0XHR9KSk7XG5cdFx0c3dpdGNoIChpdGVtLnR5cGUpIHtcblx0XHRcdGNhc2UgJ21lc3NhZ2UnOlxuXHRcdFx0XHRmcmFtZXMucHVzaCguLi5tZXNzYWdlRnJhbWVzKGl0ZW0sIG91dHB1dEluZGV4LCBzZXF1ZW5jZSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3JlYXNvbmluZyc6XG5cdFx0XHRcdGZyYW1lcy5wdXNoKC4uLnJlYXNvbmluZ0ZyYW1lcyhpdGVtLCBvdXRwdXRJbmRleCwgc2VxdWVuY2UpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdmdW5jdGlvbl9jYWxsJzpcblx0XHRcdGNhc2UgJ2N1c3RvbV90b29sX2NhbGwnOlxuXHRcdFx0XHRmcmFtZXMucHVzaCguLi5jYWxsRnJhbWVzKGl0ZW0sIG91dHB1dEluZGV4LCBzZXF1ZW5jZSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0ZnJhbWVzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLm91dHB1dF9pdGVtLmRvbmUnLCB7XG5cdFx0XHR0eXBlOiAncmVzcG9uc2Uub3V0cHV0X2l0ZW0uZG9uZScsXG5cdFx0XHRzZXF1ZW5jZV9udW1iZXI6IHNlcXVlbmNlLnZhbHVlKyssXG5cdFx0XHRvdXRwdXRfaW5kZXg6IG91dHB1dEluZGV4LFxuXHRcdFx0aXRlbSxcblx0XHR9KSk7XG5cdH0pO1xuXG5cdGZyYW1lcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5jb21wbGV0ZWQnLCB7XG5cdFx0dHlwZTogJ3Jlc3BvbnNlLmNvbXBsZXRlZCcsXG5cdFx0c2VxdWVuY2VfbnVtYmVyOiBzZXF1ZW5jZS52YWx1ZSsrLFxuXHRcdHJlc3BvbnNlOiBjb21wbGV0ZWQsXG5cdH0pKTtcblx0cmV0dXJuIGZyYW1lcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc3BvbnNlc0Vycm9yQm9keShtZXNzYWdlOiBzdHJpbmcsIHR5cGUgPSAnYXBpX2Vycm9yJyk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiB7IG1lc3NhZ2UsIHR5cGUgfSB9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsb0JBQW9CO0FBc0I3QixTQUFTLHlCQUF5QixVQUFtRDtBQUNwRixVQUFRLFVBQVU7QUFBQSxJQUNqQixLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxL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
