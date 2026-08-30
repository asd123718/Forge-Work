function parseSseEvents(body) {
  const events = [];
  for (const block of body.split(/\r?\n\r?\n/)) {
    if (!block.trim()) {
      continue;
    }
    let dataPayload;
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith("data:")) {
        continue;
      }
      const value = line.slice(5).replace(/^ /, "");
      dataPayload = dataPayload === void 0 ? value : `${dataPayload}
${value}`;
    }
    if (dataPayload === void 0 || dataPayload === "[DONE]") {
      continue;
    }
    try {
      const parsed = JSON.parse(dataPayload);
      if (typeof parsed.type === "string") {
        events.push(parsed);
      }
    } catch {
    }
  }
  return events;
}
const ANTHROPIC_MESSAGES_PATH = "/v1/messages";
function aggregateAnthropicSse(sseBody) {
  const events = parseSseEvents(sseBody);
  let started = false;
  let stopReason = null;
  let inputTokens;
  let outputTokens;
  const blocks = [];
  const toolInputBuffers = [];
  for (const evt of events) {
    switch (evt.type) {
      case "message_start": {
        started = true;
        const message = evt["message"];
        inputTokens = message?.usage?.input_tokens;
        break;
      }
      case "content_block_start": {
        const index = evt["index"];
        const block = evt["content_block"];
        if (block.type === "text") {
          blocks[index] = { type: "text", text: block.text ?? "" };
        } else if (block.type === "tool_use") {
          blocks[index] = { type: "tool_use", id: block.id ?? "", name: block.name ?? "", input: {} };
          toolInputBuffers[index] = "";
        }
        break;
      }
      case "content_block_delta": {
        const index = evt["index"];
        const delta = evt["delta"];
        const block = blocks[index];
        if (!block) {
          break;
        }
        if (delta.type === "text_delta" && block.type === "text") {
          block.text += delta.text ?? "";
        } else if (delta.type === "input_json_delta" && block.type === "tool_use") {
          toolInputBuffers[index] = (toolInputBuffers[index] ?? "") + (delta.partial_json ?? "");
        }
        break;
      }
      case "content_block_stop": {
        const index = evt["index"];
        const block = blocks[index];
        if (block?.type === "tool_use") {
          block.input = safeParseJson(toolInputBuffers[index] ?? "{}");
        }
        break;
      }
      case "message_delta": {
        const delta = evt["delta"];
        const usage = evt["usage"];
        if (delta?.stop_reason !== void 0) {
          stopReason = delta.stop_reason;
        }
        if (usage?.output_tokens !== void 0) {
          outputTokens = usage.output_tokens;
        }
        break;
      }
    }
  }
  if (!started) {
    return void 0;
  }
  return {
    content: blocks.filter((b) => !!b),
    stopReason,
    usage: inputTokens !== void 0 || outputTokens !== void 0 ? { inputTokens, outputTokens } : void 0
  };
}
function anthropicMessageToSse(message) {
  const id = `msg_replay_${randomHex()}`;
  const chunks = [];
  chunks.push(sseEvent("message_start", {
    type: "message_start",
    message: {
      id,
      type: "message",
      role: "assistant",
      content: [],
      model: "replay",
      stop_reason: null,
      stop_sequence: null,
      // Real Anthropic emits output_tokens=1 here; corrected by message_delta.
      usage: { input_tokens: message.usage?.inputTokens ?? 1, output_tokens: 1 }
    }
  }));
  message.content.forEach((block, index) => {
    if (block.type === "text") {
      chunks.push(sseEvent("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }));
      chunks.push(sseEvent("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }));
      chunks.push(sseEvent("content_block_stop", { type: "content_block_stop", index }));
    } else {
      chunks.push(sseEvent("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } }));
      chunks.push(sseEvent("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input ?? {}) } }));
      chunks.push(sseEvent("content_block_stop", { type: "content_block_stop", index }));
    }
  });
  chunks.push(sseEvent("message_delta", {
    type: "message_delta",
    delta: { stop_reason: message.stopReason, stop_sequence: null },
    usage: { output_tokens: message.usage?.outputTokens ?? 1 }
  }));
  chunks.push(sseEvent("message_stop", { type: "message_stop" }));
  return chunks.join("");
}
const SYSTEM_PLACEHOLDER = "${system}";
function summarizeAnthropicRequest(requestBody) {
  let parsed;
  try {
    parsed = JSON.parse(requestBody);
  } catch {
    return void 0;
  }
  if (typeof parsed.model !== "string" || !Array.isArray(parsed.messages)) {
    return void 0;
  }
  const messages = parsed.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role ?? "user", content: summarizeContent(m.content) })).filter((m) => !isEmptyContent(m.content));
  return {
    model: parsed.model,
    system: parsed.system !== void 0 ? SYSTEM_PLACEHOLDER : "",
    messages
  };
}
function isEmptyContent(content) {
  return content === "" || Array.isArray(content) && content.length === 0;
}
function summarizeContent(content) {
  if (typeof content === "string") {
    return normalizeVolatileText(content);
  }
  if (!Array.isArray(content)) {
    return content;
  }
  const blocks = content.map((block) => {
    const b = block;
    switch (b.type) {
      case "text":
        return { type: "text", text: normalizeVolatileText(b.text ?? "") };
      case "tool_use":
        return { type: "tool_use", name: b.name, input: b.input };
      case "tool_result":
        return { type: "tool_result", tool_use_id: b.tool_use_id, content: summarizeContent(b.content) };
      default:
        return { type: b.type };
    }
  }).filter((b) => !(b.type === "text" && b.text === ""));
  return collapseSingleText(blocks);
}
function collapseSingleText(blocks) {
  if (blocks.length === 1) {
    const only = blocks[0];
    if (only.type === "text" && typeof only.text === "string") {
      return only.text;
    }
  }
  return blocks;
}
function serializeAnthropicContent(content) {
  if (content.length === 1 && content[0].type === "text") {
    return content[0].text;
  }
  return content;
}
function deserializeAnthropicContent(content) {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}
const CURRENT_DATETIME_RE = /<current_datetime>.*?<\/current_datetime>/gs;
const SYSTEM_REMINDER_RE = /<system[-_]reminder>.*?<\/system[-_]reminder>/gs;
const ENVIRONMENT_CONTEXT_RE = /<environment_context>.*?<\/environment_context>/gs;
function normalizeVolatileText(text) {
  return text.replace(CURRENT_DATETIME_RE, "").replace(SYSTEM_REMINDER_RE, "").replace(ENVIRONMENT_CONTEXT_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}
const RESPONSES_PATH = "/responses";
function aggregateResponsesSse(sseBody) {
  const events = parseSseEvents(sseBody);
  const blocks = [];
  let usage;
  let seen = false;
  for (const evt of events) {
    if (evt.type === "response.output_item.done") {
      seen = true;
      const item = evt["item"];
      if (item.type === "message") {
        const text = (item.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
        if (text) {
          blocks.push({ type: "text", text });
        }
      } else if (item.type === "function_call") {
        blocks.push({ type: "tool_use", id: item.call_id ?? item.id ?? "", name: item.name ?? "", input: safeParseJson(item.arguments ?? "{}") });
      }
    } else if (evt.type === "response.completed") {
      usage = usageFromResponsesEvent(evt);
    }
  }
  if (!seen) {
    return void 0;
  }
  const stopReason = blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
  return { content: blocks, stopReason, usage: usage && (usage.inputTokens !== void 0 || usage.outputTokens !== void 0) ? usage : void 0 };
}
function usageFromResponsesEvent(evt) {
  const response = evt["response"];
  if (response?.usage && (response.usage.input_tokens !== void 0 || response.usage.output_tokens !== void 0)) {
    return { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  }
  const details = evt["copilot_usage"]?.token_details;
  if (Array.isArray(details)) {
    let inputTokens;
    let outputTokens;
    for (const d of details) {
      if (d.token_type === "input") {
        inputTokens = d.token_count;
      } else if (d.token_type === "output") {
        outputTokens = d.token_count;
      }
    }
    return { inputTokens, outputTokens };
  }
  return {};
}
function summarizeResponsesRequest(requestBody) {
  let parsed;
  try {
    parsed = JSON.parse(requestBody);
  } catch {
    return void 0;
  }
  if (typeof parsed.model !== "string") {
    return void 0;
  }
  return {
    model: parsed.model,
    system: parsed.instructions !== void 0 ? SYSTEM_PLACEHOLDER : "",
    messages: responsesInputToMessages(parsed.input)
  };
}
function responsesInputToMessages(input) {
  if (typeof input === "string") {
    const text = normalizeVolatileText(input);
    return text ? [{ role: "user", content: text }] : [];
  }
  if (!Array.isArray(input)) {
    return [];
  }
  const messages = [];
  for (const raw of input) {
    const item = raw;
    switch (item.type) {
      case "message": {
        if (item.role === "system" || item.role === "developer") {
          break;
        }
        const content = summarizeContent(responsesTextParts(item.content));
        if (!isEmptyContent(content)) {
          messages.push({ role: item.role ?? "user", content });
        }
        break;
      }
      case "function_call":
        messages.push({ role: "assistant", content: [{ type: "tool_use", name: item.name, input: safeParseJson(item.arguments ?? "{}") }] });
        break;
      case "function_call_output":
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: item.call_id, content: summarizeResponsesOutput(item.output) }] });
        break;
    }
  }
  return messages;
}
function responsesTextParts(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return content;
  }
  return content.map((part) => {
    const p = part;
    return { type: "text", text: p.text ?? "" };
  });
}
function summarizeResponsesOutput(output) {
  if (typeof output === "string") {
    return normalizeVolatileText(output);
  }
  return summarizeContent(output);
}
function responsesMessageToSse(message) {
  const responseId = `resp_replay_${randomHex()}`;
  let seq = 0;
  const outputItems = message.content.map((block, index) => {
    const id = `item_${index}`;
    return block.type === "text" ? { id, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: block.text, annotations: [], logprobs: [] }] } : { id, type: "function_call", name: block.name, call_id: block.id, arguments: JSON.stringify(block.input ?? {}), status: "completed" };
  });
  const outputText = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const usage = {
    input_tokens: message.usage?.inputTokens ?? 1,
    output_tokens: message.usage?.outputTokens ?? 1,
    total_tokens: (message.usage?.inputTokens ?? 1) + (message.usage?.outputTokens ?? 1)
  };
  const envelope = (status, output, text, use) => ({
    id: responseId,
    object: "response",
    created_at: 0,
    status,
    error: null,
    incomplete_details: null,
    instructions: null,
    model: "replay",
    output,
    output_text: text,
    parallel_tool_calls: true,
    temperature: 1,
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    usage: use
  });
  const chunks = [];
  const skeleton = envelope("in_progress", [], "", void 0);
  chunks.push(sseEvent("response.created", { type: "response.created", sequence_number: seq++, response: skeleton }));
  chunks.push(sseEvent("response.in_progress", { type: "response.in_progress", sequence_number: seq++, response: skeleton }));
  outputItems.forEach((item, index) => {
    const addedItem = item.type === "message" ? { ...item, status: "in_progress", content: [] } : { ...item, status: "in_progress", arguments: "" };
    chunks.push(sseEvent("response.output_item.added", { type: "response.output_item.added", sequence_number: seq++, output_index: index, item: addedItem }));
    if (item.type === "message") {
      const text = item.content[0].text;
      const part = { type: "output_text", text, annotations: [], logprobs: [] };
      chunks.push(sseEvent("response.content_part.added", { type: "response.content_part.added", sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, part: { type: "output_text", text: "", annotations: [], logprobs: [] } }));
      chunks.push(sseEvent("response.output_text.delta", { type: "response.output_text.delta", sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, delta: text, logprobs: [] }));
      chunks.push(sseEvent("response.output_text.done", { type: "response.output_text.done", sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, text, logprobs: [] }));
      chunks.push(sseEvent("response.content_part.done", { type: "response.content_part.done", sequence_number: seq++, item_id: item.id, output_index: index, content_index: 0, part }));
    } else {
      chunks.push(sseEvent("response.function_call_arguments.delta", { type: "response.function_call_arguments.delta", sequence_number: seq++, item_id: item.id, output_index: index, delta: item.arguments }));
      chunks.push(sseEvent("response.function_call_arguments.done", { type: "response.function_call_arguments.done", sequence_number: seq++, item_id: item.id, output_index: index, arguments: item.arguments }));
    }
    chunks.push(sseEvent("response.output_item.done", { type: "response.output_item.done", sequence_number: seq++, output_index: index, item }));
  });
  chunks.push(sseEvent("response.completed", { type: "response.completed", sequence_number: seq++, response: envelope("completed", outputItems, outputText, usage) }));
  return chunks.join("");
}
function sseEvent(eventName, data) {
  return `event: ${eventName}
data: ${JSON.stringify(data)}

`;
}
function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
function randomHex() {
  return Math.floor(Math.random() * 4294967295).toString(16).padStart(8, "0");
}
export {
  ANTHROPIC_MESSAGES_PATH,
  RESPONSES_PATH,
  aggregateAnthropicSse,
  aggregateResponsesSse,
  anthropicMessageToSse,
  deserializeAnthropicContent,
  parseSseEvents,
  responsesMessageToSse,
  serializeAnthropicContent,
  summarizeAnthropicRequest,
  summarizeResponsesRequest
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXGhhcm5lc3NcXGNhcGlXaXJlQ29kZWMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKipcbiAqIFdpcmUgY29kZWNzIGZvciB0aGUgQ0FQSSByZWNvcmQvcmVwbGF5IHByb3h5LiBFYWNoIGRpYWxlY3QgdGhlIGFnZW50IGhvc3Qnc1xuICogYnVuZGxlZCBTREsvQ0xJIHNwZWFrcyBjYW4gYmUgcGFyc2VkIGZyb20gaXRzIHN0cmVhbWVkIFNTRSBmb3JtIGludG8gYSBzbWFsbCxcbiAqIGh1bWFuLXJlYWRhYmxlIG1lc3NhZ2Ugb2JqZWN0IChmb3IgYSBjbGVhbiBZQU1MIGNhcHR1cmUpIGFuZCByZWdlbmVyYXRlZCBiYWNrXG4gKiBpbnRvIGFuIFNTRSBzdHJlYW0gb24gcmVwbGF5LlxuICpcbiAqIFBvcnRlZCAobGVhbikgZnJvbSB0aGUgQ29waWxvdCBDTEkgZTJlIGhhcm5lc3MncyBkaWFsZWN0IGFkYXB0ZXJzIFx1MjAxNCB3ZSBrZWVwXG4gKiB0aGUgbWVzc2FnZXMgaW4gdGhlaXIgbmF0aXZlIGRpYWxlY3Qgc2hhcGUgcmF0aGVyIHRoYW4gbm9ybWFsaXppbmcgdG8gT3BlbkFJXG4gKiBjaGF0LWNvbXBsZXRpb25zLCB3aGljaCBpcyBlbm91Z2ggZm9yIHJlYWRhYmxlIGNhcHR1cmVzICsgZmFpdGhmdWwgcmVwbGF5LlxuICpcbiAqIEN1cnJlbnRseSBzdXBwb3J0cyB0aGUgQW50aHJvcGljIE1lc3NhZ2VzIGRpYWxlY3QgKGBQT1NUIC92MS9tZXNzYWdlc2ApLFxuICogd2hpY2ggaXMgd2hhdCB0aGUgQ29waWxvdCBhbmQgQ2xhdWRlIHByb3ZpZGVycyB1c2UuXG4gKi9cblxuLy8gI3JlZ2lvbiBTU0UgcGFyc2luZ1xuXG5leHBvcnQgaW50ZXJmYWNlIElTc2VFdmVudCB7XG5cdHJlYWRvbmx5IHR5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgW2tleTogc3RyaW5nXTogdW5rbm93bjtcbn1cblxuLyoqXG4gKiBQYXJzZSBhbiBTU0UgYm9keSBpbnRvIHR5cGVkIEpTT04gZXZlbnRzLiBUb2xlcmFudCBvZiBgXFxyP1xcbmAgbGluZSBlbmRpbmdzIGFuZFxuICogbXVsdGlwbGUgYGRhdGE6YCBsaW5lcyBwZXIgZXZlbnQgKGpvaW5lZCB3aXRoIGBcXG5gIHBlciB0aGUgU1NFIHNwZWMpLiBTa2lwc1xuICogYFtET05FXWAgc2VudGluZWxzIGFuZCBldmVudHMgd2l0aG91dCBhIHN0cmluZyBgdHlwZWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNzZUV2ZW50cyhib2R5OiBzdHJpbmcpOiBJU3NlRXZlbnRbXSB7XG5cdGNvbnN0IGV2ZW50czogSVNzZUV2ZW50W10gPSBbXTtcblx0Zm9yIChjb25zdCBibG9jayBvZiBib2R5LnNwbGl0KC9cXHI/XFxuXFxyP1xcbi8pKSB7XG5cdFx0aWYgKCFibG9jay50cmltKCkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRsZXQgZGF0YVBheWxvYWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgYmxvY2suc3BsaXQoL1xccj9cXG4vKSkge1xuXHRcdFx0aWYgKCFsaW5lLnN0YXJ0c1dpdGgoJ2RhdGE6JykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGxpbmUuc2xpY2UoNSkucmVwbGFjZSgvXiAvLCAnJyk7XG5cdFx0XHRkYXRhUGF5bG9hZCA9IGRhdGFQYXlsb2FkID09PSB1bmRlZmluZWQgPyB2YWx1ZSA6IGAke2RhdGFQYXlsb2FkfVxcbiR7dmFsdWV9YDtcblx0XHR9XG5cdFx0aWYgKGRhdGFQYXlsb2FkID09PSB1bmRlZmluZWQgfHwgZGF0YVBheWxvYWQgPT09ICdbRE9ORV0nKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZGF0YVBheWxvYWQpIGFzIHsgdHlwZT86IHVua25vd24gfTtcblx0XHRcdGlmICh0eXBlb2YgcGFyc2VkLnR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKHBhcnNlZCBhcyBJU3NlRXZlbnQpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gc2tpcCBtYWxmb3JtZWQgZXZlbnRzXG5cdFx0fVxuXHR9XG5cdHJldHVybiBldmVudHM7XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBBbnRocm9waWMgTWVzc2FnZXMgZGlhbGVjdFxuXG4vKiogQSBjb250ZW50IGJsb2NrIGluIGFuIEFudGhyb3BpYyBhc3Npc3RhbnQgbWVzc2FnZSAodGhlIHN1YnNldCB3ZSBjYXB0dXJlKS4gKi9cbmV4cG9ydCB0eXBlIEFudGhyb3BpY0NvbnRlbnRCbG9jayA9XG5cdHwgeyByZWFkb25seSB0eXBlOiAndGV4dCc7IHRleHQ6IHN0cmluZyB9XG5cdHwgeyByZWFkb25seSB0eXBlOiAndG9vbF91c2UnOyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBuYW1lOiBzdHJpbmc7IGlucHV0OiB1bmtub3duIH07XG5cbi8qKiBUaGUgY2FwdHVyZWQvcmVwbGF5ZWQgc2hhcGUgb2YgYW4gQW50aHJvcGljIGAvdjEvbWVzc2FnZXNgIGFzc2lzdGFudCByZXBseS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFudGhyb3BpY01lc3NhZ2Uge1xuXHRyZWFkb25seSBjb250ZW50OiBBbnRocm9waWNDb250ZW50QmxvY2tbXTtcblx0cmVhZG9ubHkgc3RvcFJlYXNvbjogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgdXNhZ2U/OiB7IHJlYWRvbmx5IGlucHV0VG9rZW5zPzogbnVtYmVyOyByZWFkb25seSBvdXRwdXRUb2tlbnM/OiBudW1iZXIgfTtcbn1cblxuZXhwb3J0IGNvbnN0IEFOVEhST1BJQ19NRVNTQUdFU19QQVRIID0gJy92MS9tZXNzYWdlcyc7XG5cbmludGVyZmFjZSBJTXV0YWJsZVRleHRCbG9jayB7IHR5cGU6ICd0ZXh0JzsgdGV4dDogc3RyaW5nIH1cbmludGVyZmFjZSBJTXV0YWJsZVRvb2xVc2VCbG9jayB7IHR5cGU6ICd0b29sX3VzZSc7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgaW5wdXQ6IHVua25vd24gfVxudHlwZSBNdXRhYmxlQmxvY2sgPSBJTXV0YWJsZVRleHRCbG9jayB8IElNdXRhYmxlVG9vbFVzZUJsb2NrO1xuXG4vKipcbiAqIEFnZ3JlZ2F0ZSBhIHN0cmVhbWVkIEFudGhyb3BpYyBgL3YxL21lc3NhZ2VzYCBTU0UgYm9keSBpbnRvIGEgc2luZ2xlIG1lc3NhZ2VcbiAqIChjb250ZW50IGJsb2NrcyArIHN0b3AgcmVhc29uICsgdXNhZ2UpLiBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGUgc3RyZWFtIGhhZFxuICogbm8gYG1lc3NhZ2Vfc3RhcnRgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYWdncmVnYXRlQW50aHJvcGljU3NlKHNzZUJvZHk6IHN0cmluZyk6IElBbnRocm9waWNNZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZXZlbnRzID0gcGFyc2VTc2VFdmVudHMoc3NlQm9keSk7XG5cdGxldCBzdGFydGVkID0gZmFsc2U7XG5cdGxldCBzdG9wUmVhc29uOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0bGV0IGlucHV0VG9rZW5zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGxldCBvdXRwdXRUb2tlbnM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0Y29uc3QgYmxvY2tzOiBNdXRhYmxlQmxvY2tbXSA9IFtdO1xuXHRjb25zdCB0b29sSW5wdXRCdWZmZXJzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgZXZ0IG9mIGV2ZW50cykge1xuXHRcdHN3aXRjaCAoZXZ0LnR5cGUpIHtcblx0XHRcdGNhc2UgJ21lc3NhZ2Vfc3RhcnQnOiB7XG5cdFx0XHRcdHN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZXZ0WydtZXNzYWdlJ10gYXMgeyB1c2FnZT86IHsgaW5wdXRfdG9rZW5zPzogbnVtYmVyIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aW5wdXRUb2tlbnMgPSBtZXNzYWdlPy51c2FnZT8uaW5wdXRfdG9rZW5zO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2NvbnRlbnRfYmxvY2tfc3RhcnQnOiB7XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gZXZ0WydpbmRleCddIGFzIG51bWJlcjtcblx0XHRcdFx0Y29uc3QgYmxvY2sgPSBldnRbJ2NvbnRlbnRfYmxvY2snXSBhcyB7IHR5cGU6IHN0cmluZzsgaWQ/OiBzdHJpbmc7IG5hbWU/OiBzdHJpbmc7IHRleHQ/OiBzdHJpbmcgfTtcblx0XHRcdFx0aWYgKGJsb2NrLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdGJsb2Nrc1tpbmRleF0gPSB7IHR5cGU6ICd0ZXh0JywgdGV4dDogYmxvY2sudGV4dCA/PyAnJyB9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGJsb2NrLnR5cGUgPT09ICd0b29sX3VzZScpIHtcblx0XHRcdFx0XHRibG9ja3NbaW5kZXhdID0geyB0eXBlOiAndG9vbF91c2UnLCBpZDogYmxvY2suaWQgPz8gJycsIG5hbWU6IGJsb2NrLm5hbWUgPz8gJycsIGlucHV0OiB7fSB9O1xuXHRcdFx0XHRcdHRvb2xJbnB1dEJ1ZmZlcnNbaW5kZXhdID0gJyc7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdjb250ZW50X2Jsb2NrX2RlbHRhJzoge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IGV2dFsnaW5kZXgnXSBhcyBudW1iZXI7XG5cdFx0XHRcdGNvbnN0IGRlbHRhID0gZXZ0WydkZWx0YSddIGFzIHsgdHlwZTogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nOyBwYXJ0aWFsX2pzb24/OiBzdHJpbmcgfTtcblx0XHRcdFx0Y29uc3QgYmxvY2sgPSBibG9ja3NbaW5kZXhdO1xuXHRcdFx0XHRpZiAoIWJsb2NrKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGRlbHRhLnR5cGUgPT09ICd0ZXh0X2RlbHRhJyAmJiBibG9jay50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRibG9jay50ZXh0ICs9IGRlbHRhLnRleHQgPz8gJyc7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZGVsdGEudHlwZSA9PT0gJ2lucHV0X2pzb25fZGVsdGEnICYmIGJsb2NrLnR5cGUgPT09ICd0b29sX3VzZScpIHtcblx0XHRcdFx0XHR0b29sSW5wdXRCdWZmZXJzW2luZGV4XSA9ICh0b29sSW5wdXRCdWZmZXJzW2luZGV4XSA/PyAnJykgKyAoZGVsdGEucGFydGlhbF9qc29uID8/ICcnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2NvbnRlbnRfYmxvY2tfc3RvcCc6IHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBldnRbJ2luZGV4J10gYXMgbnVtYmVyO1xuXHRcdFx0XHRjb25zdCBibG9jayA9IGJsb2Nrc1tpbmRleF07XG5cdFx0XHRcdGlmIChibG9jaz8udHlwZSA9PT0gJ3Rvb2xfdXNlJykge1xuXHRcdFx0XHRcdGJsb2NrLmlucHV0ID0gc2FmZVBhcnNlSnNvbih0b29sSW5wdXRCdWZmZXJzW2luZGV4XSA/PyAne30nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ21lc3NhZ2VfZGVsdGEnOiB7XG5cdFx0XHRcdGNvbnN0IGRlbHRhID0gZXZ0WydkZWx0YSddIGFzIHsgc3RvcF9yZWFzb24/OiBzdHJpbmcgfCBudWxsIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHVzYWdlID0gZXZ0Wyd1c2FnZSddIGFzIHsgb3V0cHV0X3Rva2Vucz86IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoZGVsdGE/LnN0b3BfcmVhc29uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRzdG9wUmVhc29uID0gZGVsdGEuc3RvcF9yZWFzb247XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHVzYWdlPy5vdXRwdXRfdG9rZW5zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRvdXRwdXRUb2tlbnMgPSB1c2FnZS5vdXRwdXRfdG9rZW5zO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmICghc3RhcnRlZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRjb250ZW50OiBibG9ja3MuZmlsdGVyKChiKTogYiBpcyBNdXRhYmxlQmxvY2sgPT4gISFiKSxcblx0XHRzdG9wUmVhc29uLFxuXHRcdHVzYWdlOiAoaW5wdXRUb2tlbnMgIT09IHVuZGVmaW5lZCB8fCBvdXRwdXRUb2tlbnMgIT09IHVuZGVmaW5lZCkgPyB7IGlucHV0VG9rZW5zLCBvdXRwdXRUb2tlbnMgfSA6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuLyoqXG4gKiBSZWdlbmVyYXRlIGFuIEFudGhyb3BpYyBgL3YxL21lc3NhZ2VzYCBTU0Ugc3RyZWFtIGZyb20gYSBjYXB0dXJlZCBtZXNzYWdlLlxuICogRW1pdHMgdGhlIGZ1bGwgZXZlbnQgc2VxdWVuY2UgKGBtZXNzYWdlX3N0YXJ0YCAtPiBwZXItYmxvY2tcbiAqIHN0YXJ0L2RlbHRhL3N0b3AgLT4gYG1lc3NhZ2VfZGVsdGFgIC0+IGBtZXNzYWdlX3N0b3BgKSB0aGUgU0RLIGV4cGVjdHMuIFRleHRcbiAqIGFuZCB0b29sIGlucHV0cyBhcmUgZWFjaCBlbWl0dGVkIGFzIGEgc2luZ2xlIGRlbHRhLCB3aGljaCB0aGUgcnVudGltZSBjbGllbnRcbiAqIHRvbGVyYXRlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFudGhyb3BpY01lc3NhZ2VUb1NzZShtZXNzYWdlOiBJQW50aHJvcGljTWVzc2FnZSk6IHN0cmluZyB7XG5cdGNvbnN0IGlkID0gYG1zZ19yZXBsYXlfJHtyYW5kb21IZXgoKX1gO1xuXHRjb25zdCBjaHVua3M6IHN0cmluZ1tdID0gW107XG5cblx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ21lc3NhZ2Vfc3RhcnQnLCB7XG5cdFx0dHlwZTogJ21lc3NhZ2Vfc3RhcnQnLFxuXHRcdG1lc3NhZ2U6IHtcblx0XHRcdGlkLFxuXHRcdFx0dHlwZTogJ21lc3NhZ2UnLFxuXHRcdFx0cm9sZTogJ2Fzc2lzdGFudCcsXG5cdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdG1vZGVsOiAncmVwbGF5Jyxcblx0XHRcdHN0b3BfcmVhc29uOiBudWxsLFxuXHRcdFx0c3RvcF9zZXF1ZW5jZTogbnVsbCxcblx0XHRcdC8vIFJlYWwgQW50aHJvcGljIGVtaXRzIG91dHB1dF90b2tlbnM9MSBoZXJlOyBjb3JyZWN0ZWQgYnkgbWVzc2FnZV9kZWx0YS5cblx0XHRcdHVzYWdlOiB7IGlucHV0X3Rva2VuczogbWVzc2FnZS51c2FnZT8uaW5wdXRUb2tlbnMgPz8gMSwgb3V0cHV0X3Rva2VuczogMSB9LFxuXHRcdH0sXG5cdH0pKTtcblxuXHRtZXNzYWdlLmNvbnRlbnQuZm9yRWFjaCgoYmxvY2ssIGluZGV4KSA9PiB7XG5cdFx0aWYgKGJsb2NrLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ2NvbnRlbnRfYmxvY2tfc3RhcnQnLCB7IHR5cGU6ICdjb250ZW50X2Jsb2NrX3N0YXJ0JywgaW5kZXgsIGNvbnRlbnRfYmxvY2s6IHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnJyB9IH0pKTtcblx0XHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdjb250ZW50X2Jsb2NrX2RlbHRhJywgeyB0eXBlOiAnY29udGVudF9ibG9ja19kZWx0YScsIGluZGV4LCBkZWx0YTogeyB0eXBlOiAndGV4dF9kZWx0YScsIHRleHQ6IGJsb2NrLnRleHQgfSB9KSk7XG5cdFx0XHRjaHVua3MucHVzaChzc2VFdmVudCgnY29udGVudF9ibG9ja19zdG9wJywgeyB0eXBlOiAnY29udGVudF9ibG9ja19zdG9wJywgaW5kZXggfSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjaHVua3MucHVzaChzc2VFdmVudCgnY29udGVudF9ibG9ja19zdGFydCcsIHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RhcnQnLCBpbmRleCwgY29udGVudF9ibG9jazogeyB0eXBlOiAndG9vbF91c2UnLCBpZDogYmxvY2suaWQsIG5hbWU6IGJsb2NrLm5hbWUsIGlucHV0OiB7fSB9IH0pKTtcblx0XHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdjb250ZW50X2Jsb2NrX2RlbHRhJywgeyB0eXBlOiAnY29udGVudF9ibG9ja19kZWx0YScsIGluZGV4LCBkZWx0YTogeyB0eXBlOiAnaW5wdXRfanNvbl9kZWx0YScsIHBhcnRpYWxfanNvbjogSlNPTi5zdHJpbmdpZnkoYmxvY2suaW5wdXQgPz8ge30pIH0gfSkpO1xuXHRcdFx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ2NvbnRlbnRfYmxvY2tfc3RvcCcsIHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RvcCcsIGluZGV4IH0pKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdtZXNzYWdlX2RlbHRhJywge1xuXHRcdHR5cGU6ICdtZXNzYWdlX2RlbHRhJyxcblx0XHRkZWx0YTogeyBzdG9wX3JlYXNvbjogbWVzc2FnZS5zdG9wUmVhc29uLCBzdG9wX3NlcXVlbmNlOiBudWxsIH0sXG5cdFx0dXNhZ2U6IHsgb3V0cHV0X3Rva2VuczogbWVzc2FnZS51c2FnZT8ub3V0cHV0VG9rZW5zID8/IDEgfSxcblx0fSkpO1xuXHRjaHVua3MucHVzaChzc2VFdmVudCgnbWVzc2FnZV9zdG9wJywgeyB0eXBlOiAnbWVzc2FnZV9zdG9wJyB9KSk7XG5cblx0cmV0dXJuIGNodW5rcy5qb2luKCcnKTtcbn1cblxuLyoqXG4gKiBBIGNvbXBhY3QsIGh1bWFuLXJlYWRhYmxlIHZpZXcgb2YgYW4gQW50aHJvcGljIGAvdjEvbWVzc2FnZXNgIHJlcXVlc3QsIGZvclxuICogdGhlIFlBTUwgY2FwdHVyZS4gVGhlIChsYXJnZSwgbW9kZWwtY2F0YWxvZy1iZWFyaW5nKSBzeXN0ZW0gcHJvbXB0IGlzXG4gKiByZXBsYWNlZCB3aXRoIGEgcGxhY2Vob2xkZXIuIE1lc3NhZ2UgY29udGVudCBpcyBjb2xsYXBzZWQgdG8gYSBiYXJlIHN0cmluZ1xuICogd2hlbiBpdCBpcyBhIHNpbmdsZSB0ZXh0IGJsb2NrIChzZWUge0BsaW5rIGNvbGxhcHNlU2luZ2xlVGV4dH0pLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElSZWFkYWJsZUFudGhyb3BpY1JlcXVlc3Qge1xuXHRyZWFkb25seSBtb2RlbDogc3RyaW5nO1xuXHRyZWFkb25seSBzeXN0ZW06IHN0cmluZztcblx0cmVhZG9ubHkgbWVzc2FnZXM6IFJlYWRvbmx5QXJyYXk8eyByZWFkb25seSByb2xlOiBzdHJpbmc7IHJlYWRvbmx5IGNvbnRlbnQ6IHVua25vd24gfT47XG59XG5cbmNvbnN0IFNZU1RFTV9QTEFDRUhPTERFUiA9ICcke3N5c3RlbX0nO1xuXG5leHBvcnQgZnVuY3Rpb24gc3VtbWFyaXplQW50aHJvcGljUmVxdWVzdChyZXF1ZXN0Qm9keTogc3RyaW5nKTogSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdCB8IHVuZGVmaW5lZCB7XG5cdGxldCBwYXJzZWQ6IHsgbW9kZWw/OiBzdHJpbmc7IHN5c3RlbT86IHVua25vd247IG1lc3NhZ2VzPzogQXJyYXk8eyByb2xlPzogc3RyaW5nOyBjb250ZW50PzogdW5rbm93biB9PiB9O1xuXHR0cnkge1xuXHRcdHBhcnNlZCA9IEpTT04ucGFyc2UocmVxdWVzdEJvZHkpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0eXBlb2YgcGFyc2VkLm1vZGVsICE9PSAnc3RyaW5nJyB8fCAhQXJyYXkuaXNBcnJheShwYXJzZWQubWVzc2FnZXMpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHQvLyBEcm9wIGhhcm5lc3MtaW5qZWN0ZWQgYHN5c3RlbWAtcm9sZSBtZXNzYWdlcyAoZS5nLiBDbGF1ZGUgQ29kZSdzIGF2YWlsYWJsZVxuXHQvLyAtc2tpbGxzIGxpc3RpbmcpIFx1MjAxNCB0aGV5IGFyZSBlbnZpcm9ubWVudC1zcGVjaWZpYyBib2lsZXJwbGF0ZSwgbm90IHBhcnQgb2Zcblx0Ly8gdGhlIGNvbnZlcnNhdGlvbiwgYW5kIHRoZSByZWFsIHN5c3RlbSBwcm9tcHQgaXMgYWxyZWFkeSBhIHBsYWNlaG9sZGVyLlxuXHRjb25zdCBtZXNzYWdlcyA9IHBhcnNlZC5tZXNzYWdlc1xuXHRcdC5maWx0ZXIobSA9PiBtLnJvbGUgIT09ICdzeXN0ZW0nKVxuXHRcdC5tYXAobSA9PiAoeyByb2xlOiBtLnJvbGUgPz8gJ3VzZXInLCBjb250ZW50OiBzdW1tYXJpemVDb250ZW50KG0uY29udGVudCkgfSkpXG5cdFx0LmZpbHRlcihtID0+ICFpc0VtcHR5Q29udGVudChtLmNvbnRlbnQpKTtcblx0cmV0dXJuIHtcblx0XHRtb2RlbDogcGFyc2VkLm1vZGVsLFxuXHRcdHN5c3RlbTogcGFyc2VkLnN5c3RlbSAhPT0gdW5kZWZpbmVkID8gU1lTVEVNX1BMQUNFSE9MREVSIDogJycsXG5cdFx0bWVzc2FnZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGlzRW1wdHlDb250ZW50KGNvbnRlbnQ6IHVua25vd24pOiBib29sZWFuIHtcblx0cmV0dXJuIGNvbnRlbnQgPT09ICcnIHx8IChBcnJheS5pc0FycmF5KGNvbnRlbnQpICYmIGNvbnRlbnQubGVuZ3RoID09PSAwKTtcbn1cblxuLyoqIFJlZHVjZSBtZXNzYWdlIGNvbnRlbnQgdG8gc29tZXRoaW5nIHJlYWRhYmxlOiBwbGFpbiBzdHJpbmdzIHN0YXksIGJsb2NrXG4gKiBhcnJheXMga2VlcCB0eXBlICsgdGhlIHNhbGllbnQgZmllbGQgKHRleHQgLyB0b29sIG5hbWUgLyB0b29sX3VzZV9pZCkuIEFcbiAqIGxvbmUgdGV4dCBibG9jayBjb2xsYXBzZXMgdG8gYSBiYXJlIHN0cmluZy4gVm9sYXRpbGUgcGVyLXJ1biB2YWx1ZXMgKGUuZy4gdGhlXG4gKiBpbmplY3RlZCB3YWxsIGNsb2NrKSBhcmUgbm9ybWFsaXplZCBzbyBjYXB0dXJlcyBzdGF5IGRldGVybWluaXN0aWMuICovXG5mdW5jdGlvbiBzdW1tYXJpemVDb250ZW50KGNvbnRlbnQ6IHVua25vd24pOiB1bmtub3duIHtcblx0aWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBub3JtYWxpemVWb2xhdGlsZVRleHQoY29udGVudCk7XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQpKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdH1cblx0Y29uc3QgYmxvY2tzID0gY29udGVudC5tYXAoYmxvY2sgPT4ge1xuXHRcdGNvbnN0IGIgPSBibG9jayBhcyB7IHR5cGU/OiBzdHJpbmc7IHRleHQ/OiBzdHJpbmc7IG5hbWU/OiBzdHJpbmc7IGlucHV0PzogdW5rbm93bjsgdG9vbF91c2VfaWQ/OiBzdHJpbmc7IGNvbnRlbnQ/OiB1bmtub3duIH07XG5cdFx0c3dpdGNoIChiLnR5cGUpIHtcblx0XHRcdGNhc2UgJ3RleHQnOiByZXR1cm4geyB0eXBlOiAndGV4dCcsIHRleHQ6IG5vcm1hbGl6ZVZvbGF0aWxlVGV4dChiLnRleHQgPz8gJycpIH07XG5cdFx0XHRjYXNlICd0b29sX3VzZSc6IHJldHVybiB7IHR5cGU6ICd0b29sX3VzZScsIG5hbWU6IGIubmFtZSwgaW5wdXQ6IGIuaW5wdXQgfTtcblx0XHRcdGNhc2UgJ3Rvb2xfcmVzdWx0JzogcmV0dXJuIHsgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbF91c2VfaWQ6IGIudG9vbF91c2VfaWQsIGNvbnRlbnQ6IHN1bW1hcml6ZUNvbnRlbnQoYi5jb250ZW50KSB9O1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIHsgdHlwZTogYi50eXBlIH07XG5cdFx0fVxuXHR9KS5maWx0ZXIoYiA9PiAhKGIudHlwZSA9PT0gJ3RleHQnICYmIChiIGFzIHsgdGV4dD86IHN0cmluZyB9KS50ZXh0ID09PSAnJykpO1xuXHRyZXR1cm4gY29sbGFwc2VTaW5nbGVUZXh0KGJsb2Nrcyk7XG59XG5cbi8qKiBDb2xsYXBzZSBhIGNvbnRlbnQgYXJyYXkgaG9sZGluZyBleGFjdGx5IG9uZSB0ZXh0IGJsb2NrIHRvIGl0cyBiYXJlIHN0cmluZyxcbiAqIHNvIGEgcGxhaW4gbWVzc2FnZSByZWFkcyBgY29udGVudDogaGVsbG9gIGluc3RlYWQgb2YgYSBzaW5nbGUtZW50cnkgbGlzdC4gKi9cbmZ1bmN0aW9uIGNvbGxhcHNlU2luZ2xlVGV4dChibG9ja3M6IHJlYWRvbmx5IHVua25vd25bXSk6IHVua25vd24ge1xuXHRpZiAoYmxvY2tzLmxlbmd0aCA9PT0gMSkge1xuXHRcdGNvbnN0IG9ubHkgPSBibG9ja3NbMF0gYXMgeyB0eXBlPzogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nIH07XG5cdFx0aWYgKG9ubHkudHlwZSA9PT0gJ3RleHQnICYmIHR5cGVvZiBvbmx5LnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gb25seS50ZXh0O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gYmxvY2tzO1xufVxuXG4vKipcbiAqIFNlcmlhbGl6ZSBhbiBhc3Npc3RhbnQgcmVwbHkncyBjb250ZW50IGZvciBzdG9yYWdlOiBhIGxvbmUgdGV4dCBibG9jayBiZWNvbWVzXG4gKiBhIGJhcmUgc3RyaW5nIChgY29udGVudDogaGVsbG9gKTsgYW55dGhpbmcgcmljaGVyIHN0YXlzIGFuIGV4cGxpY2l0IGJsb2NrXG4gKiBsaXN0LiBJbnZlcnNlIG9mIHtAbGluayBkZXNlcmlhbGl6ZUFudGhyb3BpY0NvbnRlbnR9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2VyaWFsaXplQW50aHJvcGljQ29udGVudChjb250ZW50OiBBbnRocm9waWNDb250ZW50QmxvY2tbXSk6IHN0cmluZyB8IEFudGhyb3BpY0NvbnRlbnRCbG9ja1tdIHtcblx0aWYgKGNvbnRlbnQubGVuZ3RoID09PSAxICYmIGNvbnRlbnRbMF0udHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnRbMF0udGV4dDtcblx0fVxuXHRyZXR1cm4gY29udGVudDtcbn1cblxuLyoqIEV4cGFuZCBhIHN0b3JlZCBhc3Npc3RhbnQgcmVwbHkncyBjb250ZW50IGJhY2sgaW50byBhbiBleHBsaWNpdCBibG9jayBsaXN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlc2VyaWFsaXplQW50aHJvcGljQ29udGVudChjb250ZW50OiBzdHJpbmcgfCBBbnRocm9waWNDb250ZW50QmxvY2tbXSk6IEFudGhyb3BpY0NvbnRlbnRCbG9ja1tdIHtcblx0cmV0dXJuIHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJyA/IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogY29udGVudCB9XSA6IGNvbnRlbnQ7XG59XG5cbmNvbnN0IENVUlJFTlRfREFURVRJTUVfUkUgPSAvPGN1cnJlbnRfZGF0ZXRpbWU+Lio/PFxcL2N1cnJlbnRfZGF0ZXRpbWU+L2dzO1xuY29uc3QgU1lTVEVNX1JFTUlOREVSX1JFID0gLzxzeXN0ZW1bLV9dcmVtaW5kZXI+Lio/PFxcL3N5c3RlbVstX11yZW1pbmRlcj4vZ3M7XG5jb25zdCBFTlZJUk9OTUVOVF9DT05URVhUX1JFID0gLzxlbnZpcm9ubWVudF9jb250ZXh0Pi4qPzxcXC9lbnZpcm9ubWVudF9jb250ZXh0Pi9ncztcblxuLyoqIFN0cmlwIHZvbGF0aWxlIC8gYm9pbGVycGxhdGUgd3JhcHBlcnMgdGhlIHJ1bnRpbWUgaW5qZWN0cyBhcm91bmQgdGhlIHJlYWxcbiAqIHVzZXIgdGV4dCAodGhlIGA8Y3VycmVudF9kYXRldGltZT5gIHdhbGwgY2xvY2ssIGA8c3lzdGVtLXJlbWluZGVyPmAgYmxvY2tzLFxuICogYW5kIENvZGV4J3MgYDxlbnZpcm9ubWVudF9jb250ZXh0PmAgY3dkL2RhdGUgcHJlYW1ibGUpIHNvIGNhcHR1cmVzIHNob3cganVzdFxuICogdGhlIG1lYW5pbmdmdWwgbWVzc2FnZSBhbmQgc3RheSBkZXRlcm1pbmlzdGljIGFjcm9zcyByZS1yZWNvcmRzLiBNaXJyb3JzIHRoZVxuICogQ29waWxvdCBDTEkgaGFybmVzcywgd2hpY2ggbm9ybWFsaXplcyB0aGUgc2FtZSBpbmplY3RlZCBibG9ja3MuICovXG5mdW5jdGlvbiBub3JtYWxpemVWb2xhdGlsZVRleHQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHRleHRcblx0XHQucmVwbGFjZShDVVJSRU5UX0RBVEVUSU1FX1JFLCAnJylcblx0XHQucmVwbGFjZShTWVNURU1fUkVNSU5ERVJfUkUsICcnKVxuXHRcdC5yZXBsYWNlKEVOVklST05NRU5UX0NPTlRFWFRfUkUsICcnKVxuXHRcdC5yZXBsYWNlKC9cXG57Myx9L2csICdcXG5cXG4nKVxuXHRcdC50cmltKCk7XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBPcGVuQUkgUmVzcG9uc2VzIGRpYWxlY3RcblxuLyoqXG4gKiBUaGUgT3BlbkFJIFJlc3BvbnNlcyBBUEkgKGBQT1NUIC9yZXNwb25zZXNgKSB1c2VkIGJ5IHRoZSBDb2RleCBwcm92aWRlci4gV2VcbiAqIHJldXNlIHRoZSBBbnRocm9waWMgcmVhZGFibGUgc2hhcGVzICh7QGxpbmsgSVJlYWRhYmxlQW50aHJvcGljUmVxdWVzdH0gL1xuICoge0BsaW5rIElBbnRocm9waWNNZXNzYWdlfSkgc2luY2UgYm90aCBkaWFsZWN0cyBtYXAgY2xlYW5seSB0byB0ZXh0IC8gdG9vbF91c2VcbiAqIC8gdG9vbF9yZXN1bHQgYmxvY2tzIFx1MjAxNCBvbmx5IHRoZSB3aXJlIChTU0UpIHBhcnNlIGFuZCByZWdlbmVyYXRpb24gZGlmZmVyLlxuICovXG5leHBvcnQgY29uc3QgUkVTUE9OU0VTX1BBVEggPSAnL3Jlc3BvbnNlcyc7XG5cbi8qKlxuICogQWdncmVnYXRlIGEgc3RyZWFtZWQgYC9yZXNwb25zZXNgIFNTRSBib2R5IGludG8gYSBtZXNzYWdlLiBSZWFkcyB0aGVcbiAqIGF1dGhvcml0YXRpdmUgYHJlc3BvbnNlLm91dHB1dF9pdGVtLmRvbmVgIGl0ZW1zIChtZXNzYWdlICsgZnVuY3Rpb25fY2FsbCkgYW5kXG4gKiB0aGUgZmluYWwgdXNhZ2U7IHJlYXNvbmluZyBpdGVtcyAob3BhcXVlIGVuY3J5cHRlZCBjb250ZW50KSBhcmUgZHJvcHBlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFnZ3JlZ2F0ZVJlc3BvbnNlc1NzZShzc2VCb2R5OiBzdHJpbmcpOiBJQW50aHJvcGljTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGV2ZW50cyA9IHBhcnNlU3NlRXZlbnRzKHNzZUJvZHkpO1xuXHRjb25zdCBibG9ja3M6IE11dGFibGVCbG9ja1tdID0gW107XG5cdGxldCB1c2FnZTogeyBpbnB1dFRva2Vucz86IG51bWJlcjsgb3V0cHV0VG9rZW5zPzogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdGxldCBzZWVuID0gZmFsc2U7XG5cblx0Zm9yIChjb25zdCBldnQgb2YgZXZlbnRzKSB7XG5cdFx0aWYgKGV2dC50eXBlID09PSAncmVzcG9uc2Uub3V0cHV0X2l0ZW0uZG9uZScpIHtcblx0XHRcdHNlZW4gPSB0cnVlO1xuXHRcdFx0Y29uc3QgaXRlbSA9IGV2dFsnaXRlbSddIGFzIHsgdHlwZT86IHN0cmluZzsgY29udGVudD86IEFycmF5PHsgdHlwZT86IHN0cmluZzsgdGV4dD86IHN0cmluZyB9PjsgbmFtZT86IHN0cmluZzsgYXJndW1lbnRzPzogc3RyaW5nOyBjYWxsX2lkPzogc3RyaW5nOyBpZD86IHN0cmluZyB9O1xuXHRcdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ21lc3NhZ2UnKSB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSAoaXRlbS5jb250ZW50ID8/IFtdKS5maWx0ZXIoYyA9PiBjLnR5cGUgPT09ICdvdXRwdXRfdGV4dCcpLm1hcChjID0+IGMudGV4dCA/PyAnJykuam9pbignJyk7XG5cdFx0XHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRcdFx0YmxvY2tzLnB1c2goeyB0eXBlOiAndGV4dCcsIHRleHQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXRlbS50eXBlID09PSAnZnVuY3Rpb25fY2FsbCcpIHtcblx0XHRcdFx0YmxvY2tzLnB1c2goeyB0eXBlOiAndG9vbF91c2UnLCBpZDogaXRlbS5jYWxsX2lkID8/IGl0ZW0uaWQgPz8gJycsIG5hbWU6IGl0ZW0ubmFtZSA/PyAnJywgaW5wdXQ6IHNhZmVQYXJzZUpzb24oaXRlbS5hcmd1bWVudHMgPz8gJ3t9JykgfSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChldnQudHlwZSA9PT0gJ3Jlc3BvbnNlLmNvbXBsZXRlZCcpIHtcblx0XHRcdHVzYWdlID0gdXNhZ2VGcm9tUmVzcG9uc2VzRXZlbnQoZXZ0KTtcblx0XHR9XG5cdH1cblxuXHRpZiAoIXNlZW4pIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHN0b3BSZWFzb24gPSBibG9ja3Muc29tZShiID0+IGIudHlwZSA9PT0gJ3Rvb2xfdXNlJykgPyAndG9vbF91c2UnIDogJ2VuZF90dXJuJztcblx0cmV0dXJuIHsgY29udGVudDogYmxvY2tzLCBzdG9wUmVhc29uLCB1c2FnZTogKHVzYWdlICYmICh1c2FnZS5pbnB1dFRva2VucyAhPT0gdW5kZWZpbmVkIHx8IHVzYWdlLm91dHB1dFRva2VucyAhPT0gdW5kZWZpbmVkKSkgPyB1c2FnZSA6IHVuZGVmaW5lZCB9O1xufVxuXG4vKiogRXh0cmFjdCB0b2tlbiB1c2FnZSBmcm9tIGEgYHJlc3BvbnNlLmNvbXBsZXRlZGAgZXZlbnQgKG5hdGl2ZSBgdXNhZ2VgIGZpZWxkXG4gKiBvciBDb3BpbG90J3MgYGNvcGlsb3RfdXNhZ2UudG9rZW5fZGV0YWlsc2ApLiAqL1xuZnVuY3Rpb24gdXNhZ2VGcm9tUmVzcG9uc2VzRXZlbnQoZXZ0OiBJU3NlRXZlbnQpOiB7IGlucHV0VG9rZW5zPzogbnVtYmVyOyBvdXRwdXRUb2tlbnM/OiBudW1iZXIgfSB7XG5cdGNvbnN0IHJlc3BvbnNlID0gZXZ0WydyZXNwb25zZSddIGFzIHsgdXNhZ2U/OiB7IGlucHV0X3Rva2Vucz86IG51bWJlcjsgb3V0cHV0X3Rva2Vucz86IG51bWJlciB9IH0gfCB1bmRlZmluZWQ7XG5cdGlmIChyZXNwb25zZT8udXNhZ2UgJiYgKHJlc3BvbnNlLnVzYWdlLmlucHV0X3Rva2VucyAhPT0gdW5kZWZpbmVkIHx8IHJlc3BvbnNlLnVzYWdlLm91dHB1dF90b2tlbnMgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRyZXR1cm4geyBpbnB1dFRva2VuczogcmVzcG9uc2UudXNhZ2UuaW5wdXRfdG9rZW5zLCBvdXRwdXRUb2tlbnM6IHJlc3BvbnNlLnVzYWdlLm91dHB1dF90b2tlbnMgfTtcblx0fVxuXHRjb25zdCBkZXRhaWxzID0gKGV2dFsnY29waWxvdF91c2FnZSddIGFzIHsgdG9rZW5fZGV0YWlscz86IEFycmF5PHsgdG9rZW5fdHlwZT86IHN0cmluZzsgdG9rZW5fY291bnQ/OiBudW1iZXIgfT4gfSB8IHVuZGVmaW5lZCk/LnRva2VuX2RldGFpbHM7XG5cdGlmIChBcnJheS5pc0FycmF5KGRldGFpbHMpKSB7XG5cdFx0bGV0IGlucHV0VG9rZW5zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG91dHB1dFRva2VuczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgZCBvZiBkZXRhaWxzKSB7XG5cdFx0XHRpZiAoZC50b2tlbl90eXBlID09PSAnaW5wdXQnKSB7IGlucHV0VG9rZW5zID0gZC50b2tlbl9jb3VudDsgfVxuXHRcdFx0ZWxzZSBpZiAoZC50b2tlbl90eXBlID09PSAnb3V0cHV0JykgeyBvdXRwdXRUb2tlbnMgPSBkLnRva2VuX2NvdW50OyB9XG5cdFx0fVxuXHRcdHJldHVybiB7IGlucHV0VG9rZW5zLCBvdXRwdXRUb2tlbnMgfTtcblx0fVxuXHRyZXR1cm4ge307XG59XG5cbi8qKiBTdW1tYXJpemUgYSBgL3Jlc3BvbnNlc2AgcmVxdWVzdCBpbnRvIHRoZSBzaGFyZWQgcmVhZGFibGUgcmVxdWVzdCBzaGFwZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdW1tYXJpemVSZXNwb25zZXNSZXF1ZXN0KHJlcXVlc3RCb2R5OiBzdHJpbmcpOiBJUmVhZGFibGVBbnRocm9waWNSZXF1ZXN0IHwgdW5kZWZpbmVkIHtcblx0bGV0IHBhcnNlZDogeyBtb2RlbD86IHN0cmluZzsgaW5zdHJ1Y3Rpb25zPzogdW5rbm93bjsgaW5wdXQ/OiB1bmtub3duIH07XG5cdHRyeSB7XG5cdFx0cGFyc2VkID0gSlNPTi5wYXJzZShyZXF1ZXN0Qm9keSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHR5cGVvZiBwYXJzZWQubW9kZWwgIT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdG1vZGVsOiBwYXJzZWQubW9kZWwsXG5cdFx0c3lzdGVtOiBwYXJzZWQuaW5zdHJ1Y3Rpb25zICE9PSB1bmRlZmluZWQgPyBTWVNURU1fUExBQ0VIT0xERVIgOiAnJyxcblx0XHRtZXNzYWdlczogcmVzcG9uc2VzSW5wdXRUb01lc3NhZ2VzKHBhcnNlZC5pbnB1dCksXG5cdH07XG59XG5cbi8qKiBNYXAgYSBgL3Jlc3BvbnNlc2AgcmVxdWVzdCBgaW5wdXRgIChzdHJpbmcgb3IgaXRlbSBsaXN0KSB0byByZWFkYWJsZSBtZXNzYWdlcy4gKi9cbmZ1bmN0aW9uIHJlc3BvbnNlc0lucHV0VG9NZXNzYWdlcyhpbnB1dDogdW5rbm93bik6IEFycmF5PHsgcm9sZTogc3RyaW5nOyBjb250ZW50OiB1bmtub3duIH0+IHtcblx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRjb25zdCB0ZXh0ID0gbm9ybWFsaXplVm9sYXRpbGVUZXh0KGlucHV0KTtcblx0XHRyZXR1cm4gdGV4dCA/IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogdGV4dCB9XSA6IFtdO1xuXHR9XG5cdGlmICghQXJyYXkuaXNBcnJheShpbnB1dCkpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgbWVzc2FnZXM6IEFycmF5PHsgcm9sZTogc3RyaW5nOyBjb250ZW50OiB1bmtub3duIH0+ID0gW107XG5cdGZvciAoY29uc3QgcmF3IG9mIGlucHV0KSB7XG5cdFx0Y29uc3QgaXRlbSA9IHJhdyBhcyB7IHR5cGU/OiBzdHJpbmc7IHJvbGU/OiBzdHJpbmc7IGNvbnRlbnQ/OiB1bmtub3duOyBuYW1lPzogc3RyaW5nOyBhcmd1bWVudHM/OiBzdHJpbmc7IGNhbGxfaWQ/OiBzdHJpbmc7IG91dHB1dD86IHVua25vd24gfTtcblx0XHRzd2l0Y2ggKGl0ZW0udHlwZSkge1xuXHRcdFx0Y2FzZSAnbWVzc2FnZSc6IHtcblx0XHRcdFx0Ly8gU2tpcCBoYXJuZXNzLWluamVjdGVkIGluc3RydWN0aW9uIG1lc3NhZ2VzIChDb2RleCB1c2VzIHRoZVxuXHRcdFx0XHQvLyBgZGV2ZWxvcGVyYCAvIGBzeXN0ZW1gIHJvbGVzIGZvciBpdHMgcGVybWlzc2lvbnMgKyBlbnZpcm9ubWVudFxuXHRcdFx0XHQvLyBwcmVhbWJsZSk7IHRoZSByZWFsIHN5c3RlbSBwcm9tcHQgaXMgYWxyZWFkeSBhIHBsYWNlaG9sZGVyLlxuXHRcdFx0XHRpZiAoaXRlbS5yb2xlID09PSAnc3lzdGVtJyB8fCBpdGVtLnJvbGUgPT09ICdkZXZlbG9wZXInKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHN1bW1hcml6ZUNvbnRlbnQocmVzcG9uc2VzVGV4dFBhcnRzKGl0ZW0uY29udGVudCkpO1xuXHRcdFx0XHRpZiAoIWlzRW1wdHlDb250ZW50KGNvbnRlbnQpKSB7XG5cdFx0XHRcdFx0bWVzc2FnZXMucHVzaCh7IHJvbGU6IGl0ZW0ucm9sZSA/PyAndXNlcicsIGNvbnRlbnQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdmdW5jdGlvbl9jYWxsJzpcblx0XHRcdFx0bWVzc2FnZXMucHVzaCh7IHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiBpdGVtLm5hbWUsIGlucHV0OiBzYWZlUGFyc2VKc29uKGl0ZW0uYXJndW1lbnRzID8/ICd7fScpIH1dIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2Z1bmN0aW9uX2NhbGxfb3V0cHV0Jzpcblx0XHRcdFx0bWVzc2FnZXMucHVzaCh7IHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbF91c2VfaWQ6IGl0ZW0uY2FsbF9pZCwgY29udGVudDogc3VtbWFyaXplUmVzcG9uc2VzT3V0cHV0KGl0ZW0ub3V0cHV0KSB9XSB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHQvLyByZWFzb25pbmcgLyBvdGhlciBpdGVtcyBhcmUgZHJvcHBlZCBmcm9tIHRoZSByZWFkYWJsZSBjYXB0dXJlXG5cdFx0fVxuXHR9XG5cdHJldHVybiBtZXNzYWdlcztcbn1cblxuLyoqIEZsYXR0ZW4gUmVzcG9uc2VzIGBjb250ZW50YCBwYXJ0cyAoYGlucHV0X3RleHRgIC8gYG91dHB1dF90ZXh0YCkgdG8gdGV4dCBibG9ja3MuICovXG5mdW5jdGlvbiByZXNwb25zZXNUZXh0UGFydHMoY29udGVudDogdW5rbm93bik6IHVua25vd24ge1xuXHRpZiAodHlwZW9mIGNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQpKSB7XG5cdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdH1cblx0cmV0dXJuIGNvbnRlbnQubWFwKHBhcnQgPT4ge1xuXHRcdGNvbnN0IHAgPSBwYXJ0IGFzIHsgdHlwZT86IHN0cmluZzsgdGV4dD86IHN0cmluZyB9O1xuXHRcdHJldHVybiB7IHR5cGU6ICd0ZXh0JywgdGV4dDogcC50ZXh0ID8/ICcnIH07XG5cdH0pO1xufVxuXG4vKiogTm9ybWFsaXplIGEgYGZ1bmN0aW9uX2NhbGxfb3V0cHV0YCBgb3V0cHV0YCB0byByZWFkYWJsZSB0ZXh0LiAqL1xuZnVuY3Rpb24gc3VtbWFyaXplUmVzcG9uc2VzT3V0cHV0KG91dHB1dDogdW5rbm93bik6IHVua25vd24ge1xuXHRpZiAodHlwZW9mIG91dHB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gbm9ybWFsaXplVm9sYXRpbGVUZXh0KG91dHB1dCk7XG5cdH1cblx0cmV0dXJuIHN1bW1hcml6ZUNvbnRlbnQob3V0cHV0KTtcbn1cblxuLyoqXG4gKiBSZWdlbmVyYXRlIGEgYC9yZXNwb25zZXNgIFNTRSBzdHJlYW0gZnJvbSBhIGNhcHR1cmVkIG1lc3NhZ2UuIEVtaXRzIHRoZSBldmVudFxuICogc2VxdWVuY2UgdGhlIENvZGV4IGFwcC1zZXJ2ZXIgZXhwZWN0cyAoYHJlc3BvbnNlLmNyZWF0ZWRgIC0+IHBlci1pdGVtXG4gKiBhZGRlZC9kZWx0YS9kb25lIC0+IGByZXNwb25zZS5jb21wbGV0ZWRgKSB3aXRoIHN5bnRoZXRpYywgc3RhYmxlIGl0ZW0gaWRzLlxuICogVGhlIGByZXNwb25zZWAgZW52ZWxvcGUgY2FycmllcyB0aGUgZnVsbCBzZXQgb2YgcmVxdWlyZWQgT3BlbkFJIFJlc3BvbnNlc1xuICogZmllbGRzIHNvIHRoZSBjbGllbnQgYWNjZXB0cyB0aGUgdHVybiBhcyBjb21wbGV0ZSAoYSBwYXJ0aWFsIGVudmVsb3BlIG1ha2VzXG4gKiBpdCByZXRyeSkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNwb25zZXNNZXNzYWdlVG9Tc2UobWVzc2FnZTogSUFudGhyb3BpY01lc3NhZ2UpOiBzdHJpbmcge1xuXHRjb25zdCByZXNwb25zZUlkID0gYHJlc3BfcmVwbGF5XyR7cmFuZG9tSGV4KCl9YDtcblx0bGV0IHNlcSA9IDA7XG5cblx0Y29uc3Qgb3V0cHV0SXRlbXM6IFJlc3BvbnNlc091dHB1dEl0ZW1bXSA9IG1lc3NhZ2UuY29udGVudC5tYXAoKGJsb2NrLCBpbmRleCk6IFJlc3BvbnNlc091dHB1dEl0ZW0gPT4ge1xuXHRcdGNvbnN0IGlkID0gYGl0ZW1fJHtpbmRleH1gO1xuXHRcdHJldHVybiBibG9jay50eXBlID09PSAndGV4dCdcblx0XHRcdD8geyBpZCwgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAnYXNzaXN0YW50Jywgc3RhdHVzOiAnY29tcGxldGVkJywgY29udGVudDogW3sgdHlwZTogJ291dHB1dF90ZXh0JywgdGV4dDogYmxvY2sudGV4dCwgYW5ub3RhdGlvbnM6IFtdLCBsb2dwcm9iczogW10gfV0gfVxuXHRcdFx0OiB7IGlkLCB0eXBlOiAnZnVuY3Rpb25fY2FsbCcsIG5hbWU6IGJsb2NrLm5hbWUsIGNhbGxfaWQ6IGJsb2NrLmlkLCBhcmd1bWVudHM6IEpTT04uc3RyaW5naWZ5KGJsb2NrLmlucHV0ID8/IHt9KSwgc3RhdHVzOiAnY29tcGxldGVkJyB9O1xuXHR9KTtcblx0Y29uc3Qgb3V0cHV0VGV4dCA9IG1lc3NhZ2UuY29udGVudC5maWx0ZXIoKGIpOiBiIGlzIEV4dHJhY3Q8QW50aHJvcGljQ29udGVudEJsb2NrLCB7IHR5cGU6ICd0ZXh0JyB9PiA9PiBiLnR5cGUgPT09ICd0ZXh0JykubWFwKGIgPT4gYi50ZXh0KS5qb2luKCcnKTtcblx0Y29uc3QgdXNhZ2UgPSB7XG5cdFx0aW5wdXRfdG9rZW5zOiBtZXNzYWdlLnVzYWdlPy5pbnB1dFRva2VucyA/PyAxLFxuXHRcdG91dHB1dF90b2tlbnM6IG1lc3NhZ2UudXNhZ2U/Lm91dHB1dFRva2VucyA/PyAxLFxuXHRcdHRvdGFsX3Rva2VuczogKG1lc3NhZ2UudXNhZ2U/LmlucHV0VG9rZW5zID8/IDEpICsgKG1lc3NhZ2UudXNhZ2U/Lm91dHB1dFRva2VucyA/PyAxKSxcblx0fTtcblx0Y29uc3QgZW52ZWxvcGUgPSAoc3RhdHVzOiBzdHJpbmcsIG91dHB1dDogcmVhZG9ubHkgUmVzcG9uc2VzT3V0cHV0SXRlbVtdLCB0ZXh0OiBzdHJpbmcsIHVzZTogdW5rbm93bikgPT4gKHtcblx0XHRpZDogcmVzcG9uc2VJZCwgb2JqZWN0OiAncmVzcG9uc2UnLCBjcmVhdGVkX2F0OiAwLCBzdGF0dXMsIGVycm9yOiBudWxsLCBpbmNvbXBsZXRlX2RldGFpbHM6IG51bGwsXG5cdFx0aW5zdHJ1Y3Rpb25zOiBudWxsLCBtb2RlbDogJ3JlcGxheScsIG91dHB1dCwgb3V0cHV0X3RleHQ6IHRleHQsIHBhcmFsbGVsX3Rvb2xfY2FsbHM6IHRydWUsXG5cdFx0dGVtcGVyYXR1cmU6IDEsIHRvb2xfY2hvaWNlOiAnYXV0bycsIHRvb2xzOiBbXSwgdG9wX3A6IDEsIHVzYWdlOiB1c2UsXG5cdH0pO1xuXG5cdGNvbnN0IGNodW5rczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3Qgc2tlbGV0b24gPSBlbnZlbG9wZSgnaW5fcHJvZ3Jlc3MnLCBbXSwgJycsIHVuZGVmaW5lZCk7XG5cdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5jcmVhdGVkJywgeyB0eXBlOiAncmVzcG9uc2UuY3JlYXRlZCcsIHNlcXVlbmNlX251bWJlcjogc2VxKyssIHJlc3BvbnNlOiBza2VsZXRvbiB9KSk7XG5cdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5pbl9wcm9ncmVzcycsIHsgdHlwZTogJ3Jlc3BvbnNlLmluX3Byb2dyZXNzJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgcmVzcG9uc2U6IHNrZWxldG9uIH0pKTtcblxuXHRvdXRwdXRJdGVtcy5mb3JFYWNoKChpdGVtLCBpbmRleCkgPT4ge1xuXHRcdC8vIEFuIGl0ZW0gaXMgKmFubm91bmNlZCogaGVyZSBhbmQgc3RyZWFtZWQgYmVsb3csIHNvIGl0IG11c3QgYXJyaXZlXG5cdFx0Ly8gZW1wdHk6IGEgY29uc3VtZXIgdGhhdCBhY2N1bXVsYXRlcyB0aGlzIGNvbnRlbnQgYW5kIHRoZW4gdGhlIGRlbHRhc1xuXHRcdC8vIHdvdWxkIG90aGVyd2lzZSBjb3VudCB0aGUgc2FtZSB0ZXh0IHR3aWNlIChgU0hFTExfVkFMVUVfNzNgIHJlcGxheWVkXG5cdFx0Ly8gYXMgYFNIRUxMX1ZBTFVFXzczU0hFTExfVkFMVUVfNzNgKS5cblx0XHRjb25zdCBhZGRlZEl0ZW0gPSBpdGVtLnR5cGUgPT09ICdtZXNzYWdlJ1xuXHRcdFx0PyB7IC4uLml0ZW0sIHN0YXR1czogJ2luX3Byb2dyZXNzJyBhcyBjb25zdCwgY29udGVudDogW10gfVxuXHRcdFx0OiB7IC4uLml0ZW0sIHN0YXR1czogJ2luX3Byb2dyZXNzJyBhcyBjb25zdCwgYXJndW1lbnRzOiAnJyB9O1xuXHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5vdXRwdXRfaXRlbS5hZGRlZCcsIHsgdHlwZTogJ3Jlc3BvbnNlLm91dHB1dF9pdGVtLmFkZGVkJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgb3V0cHV0X2luZGV4OiBpbmRleCwgaXRlbTogYWRkZWRJdGVtIH0pKTtcblx0XHRpZiAoaXRlbS50eXBlID09PSAnbWVzc2FnZScpIHtcblx0XHRcdGNvbnN0IHRleHQgPSBpdGVtLmNvbnRlbnRbMF0udGV4dDtcblx0XHRcdGNvbnN0IHBhcnQgPSB7IHR5cGU6ICdvdXRwdXRfdGV4dCcsIHRleHQsIGFubm90YXRpb25zOiBbXSwgbG9ncHJvYnM6IFtdIH07XG5cdFx0XHRjaHVua3MucHVzaChzc2VFdmVudCgncmVzcG9uc2UuY29udGVudF9wYXJ0LmFkZGVkJywgeyB0eXBlOiAncmVzcG9uc2UuY29udGVudF9wYXJ0LmFkZGVkJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgaXRlbV9pZDogaXRlbS5pZCwgb3V0cHV0X2luZGV4OiBpbmRleCwgY29udGVudF9pbmRleDogMCwgcGFydDogeyB0eXBlOiAnb3V0cHV0X3RleHQnLCB0ZXh0OiAnJywgYW5ub3RhdGlvbnM6IFtdLCBsb2dwcm9iczogW10gfSB9KSk7XG5cdFx0XHRjaHVua3MucHVzaChzc2VFdmVudCgncmVzcG9uc2Uub3V0cHV0X3RleHQuZGVsdGEnLCB7IHR5cGU6ICdyZXNwb25zZS5vdXRwdXRfdGV4dC5kZWx0YScsIHNlcXVlbmNlX251bWJlcjogc2VxKyssIGl0ZW1faWQ6IGl0ZW0uaWQsIG91dHB1dF9pbmRleDogaW5kZXgsIGNvbnRlbnRfaW5kZXg6IDAsIGRlbHRhOiB0ZXh0LCBsb2dwcm9iczogW10gfSkpO1xuXHRcdFx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLm91dHB1dF90ZXh0LmRvbmUnLCB7IHR5cGU6ICdyZXNwb25zZS5vdXRwdXRfdGV4dC5kb25lJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgaXRlbV9pZDogaXRlbS5pZCwgb3V0cHV0X2luZGV4OiBpbmRleCwgY29udGVudF9pbmRleDogMCwgdGV4dCwgbG9ncHJvYnM6IFtdIH0pKTtcblx0XHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5jb250ZW50X3BhcnQuZG9uZScsIHsgdHlwZTogJ3Jlc3BvbnNlLmNvbnRlbnRfcGFydC5kb25lJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgaXRlbV9pZDogaXRlbS5pZCwgb3V0cHV0X2luZGV4OiBpbmRleCwgY29udGVudF9pbmRleDogMCwgcGFydCB9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5mdW5jdGlvbl9jYWxsX2FyZ3VtZW50cy5kZWx0YScsIHsgdHlwZTogJ3Jlc3BvbnNlLmZ1bmN0aW9uX2NhbGxfYXJndW1lbnRzLmRlbHRhJywgc2VxdWVuY2VfbnVtYmVyOiBzZXErKywgaXRlbV9pZDogaXRlbS5pZCwgb3V0cHV0X2luZGV4OiBpbmRleCwgZGVsdGE6IGl0ZW0uYXJndW1lbnRzIH0pKTtcblx0XHRcdGNodW5rcy5wdXNoKHNzZUV2ZW50KCdyZXNwb25zZS5mdW5jdGlvbl9jYWxsX2FyZ3VtZW50cy5kb25lJywgeyB0eXBlOiAncmVzcG9uc2UuZnVuY3Rpb25fY2FsbF9hcmd1bWVudHMuZG9uZScsIHNlcXVlbmNlX251bWJlcjogc2VxKyssIGl0ZW1faWQ6IGl0ZW0uaWQsIG91dHB1dF9pbmRleDogaW5kZXgsIGFyZ3VtZW50czogaXRlbS5hcmd1bWVudHMgfSkpO1xuXHRcdH1cblx0XHRjaHVua3MucHVzaChzc2VFdmVudCgncmVzcG9uc2Uub3V0cHV0X2l0ZW0uZG9uZScsIHsgdHlwZTogJ3Jlc3BvbnNlLm91dHB1dF9pdGVtLmRvbmUnLCBzZXF1ZW5jZV9udW1iZXI6IHNlcSsrLCBvdXRwdXRfaW5kZXg6IGluZGV4LCBpdGVtIH0pKTtcblx0fSk7XG5cblx0Y2h1bmtzLnB1c2goc3NlRXZlbnQoJ3Jlc3BvbnNlLmNvbXBsZXRlZCcsIHsgdHlwZTogJ3Jlc3BvbnNlLmNvbXBsZXRlZCcsIHNlcXVlbmNlX251bWJlcjogc2VxKyssIHJlc3BvbnNlOiBlbnZlbG9wZSgnY29tcGxldGVkJywgb3V0cHV0SXRlbXMsIG91dHB1dFRleHQsIHVzYWdlKSB9KSk7XG5cdHJldHVybiBjaHVua3Muam9pbignJyk7XG59XG5cbnR5cGUgUmVzcG9uc2VzT3V0cHV0SXRlbSA9XG5cdHwgeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSB0eXBlOiAnbWVzc2FnZSc7IHJlYWRvbmx5IHJvbGU6ICdhc3Npc3RhbnQnOyByZWFkb25seSBzdGF0dXM6ICdjb21wbGV0ZWQnOyByZWFkb25seSBjb250ZW50OiBBcnJheTx7IHR5cGU6ICdvdXRwdXRfdGV4dCc7IHRleHQ6IHN0cmluZzsgYW5ub3RhdGlvbnM6IHVua25vd25bXTsgbG9ncHJvYnM6IHVua25vd25bXSB9PiB9XG5cdHwgeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSB0eXBlOiAnZnVuY3Rpb25fY2FsbCc7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgY2FsbF9pZDogc3RyaW5nOyByZWFkb25seSBhcmd1bWVudHM6IHN0cmluZzsgcmVhZG9ubHkgc3RhdHVzOiAnY29tcGxldGVkJyB9O1xuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gaGVscGVyc1xuXG5mdW5jdGlvbiBzc2VFdmVudChldmVudE5hbWU6IHN0cmluZywgZGF0YTogdW5rbm93bik6IHN0cmluZyB7XG5cdHJldHVybiBgZXZlbnQ6ICR7ZXZlbnROYW1lfVxcbmRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9XFxuXFxuYDtcbn1cblxuZnVuY3Rpb24gc2FmZVBhcnNlSnNvbih2YWx1ZTogc3RyaW5nKTogdW5rbm93biB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2UodmFsdWUpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4ge307XG5cdH1cbn1cblxuZnVuY3Rpb24gcmFuZG9tSGV4KCk6IHN0cmluZyB7XG5cdHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAweGZmZmZmZmZmKS50b1N0cmluZygxNikucGFkU3RhcnQoOCwgJzAnKTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBK0JPLFNBQVMsZUFBZSxNQUEyQjtBQUN6RCxRQUFNLFNBQXNCLENBQUM7QUFDN0IsYUFBVyxTQUFTLEtBQUssTUFBTSxZQUFZLEdBQUc7QUFDN0MsUUFBSSxDQUFDLE1BQU0sS0FBSyxHQUFHO0FBQ2xCO0FBQUEsSUFDRDtBQUNBLFFBQUk7QUFDSixlQUFXLFFBQVEsTUFBTSxNQUFNLE9BQU8sR0FBRztBQUN4QyxVQUFJLENBQUMs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
