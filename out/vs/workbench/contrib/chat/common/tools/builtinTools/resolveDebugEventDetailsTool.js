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
import { localize } from "../../../../../../nls.js";
import { ChatDebugHookResult, IChatDebugService } from "../../chatDebugService.js";
import { ToolDataSource } from "../languageModelToolsService.js";
const ResolveDebugEventDetailsToolId = "vscode_resolveDebugEventDetails_internal";
const ResolveDebugEventDetailsToolData = {
  id: ResolveDebugEventDetailsToolId,
  toolReferenceName: "resolveDebugEventDetails",
  displayName: localize("resolveDebugEventDetails.displayName", "Resolve Debug Event Details"),
  canBeReferencedInPrompt: false,
  modelDescription: "Resolves the full details for a specific chat debug event by its event ID. Use this tool to get detailed information about a debug event such as tool call input/output, model turn details, user message sections, or file lists. The event ID can be found in the debug event log summary provided in the conversation context.",
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      eventId: {
        type: "string",
        description: "The ID of the debug event to resolve details for."
      }
    },
    required: ["eventId"]
  }
};
function formatResolvedContent(content) {
  switch (content.kind) {
    case "text":
      return content.value;
    case "fileList": {
      const lines = [localize("formatResolvedContent.fileList", "File list ({0}):", content.discoveryType)];
      if (content.sourceFolders) {
        for (const folder of content.sourceFolders) {
          lines.push(localize("formatResolvedContent.sourceFolder", "  Source folder: {0} ({1})", folder.uri.toString(), folder.storage));
        }
      }
      for (const file of content.files) {
        const status = file.status === "loaded" ? localize("formatResolvedContent.loaded", "loaded") : file.skipReason ? localize("formatResolvedContent.skippedWithReason", "skipped: {0}", file.skipReason) : localize("formatResolvedContent.skipped", "skipped");
        lines.push(`  ${file.uri.toString()} [${status}]`);
      }
      return lines.join("\n");
    }
    case "message": {
      const messageType = content.type === "user" ? localize("formatResolvedContent.userMessage", "User message: {0}", content.message) : localize("formatResolvedContent.agentMessage", "Agent message: {0}", content.message);
      const lines = [messageType];
      for (const section of content.sections) {
        lines.push(`--- ${section.name} ---`);
        lines.push(section.content);
      }
      return lines.join("\n");
    }
    case "toolCall": {
      const lines = [localize("formatResolvedContent.toolCall", "Tool call: {0}", content.toolName)];
      if (content.result) {
        lines.push(localize("formatResolvedContent.result", "Result: {0}", content.result));
      }
      if (content.durationInMillis !== void 0) {
        lines.push(localize("formatResolvedContent.duration", "Duration: {0}ms", content.durationInMillis));
      }
      if (content.input) {
        lines.push(localize("formatResolvedContent.input", "Input:") + "\n" + content.input);
      }
      if (content.output) {
        lines.push(localize("formatResolvedContent.output", "Output:") + "\n" + content.output);
      }
      return lines.join("\n");
    }
    case "modelTurn": {
      const lines = [localize("formatResolvedContent.modelTurn", "Model turn: {0}", content.requestName)];
      if (content.model) {
        lines.push(localize("formatResolvedContent.model", "Model: {0}", content.model));
      }
      if (content.status) {
        lines.push(localize("formatResolvedContent.status", "Status: {0}", content.status));
      }
      if (content.durationInMillis !== void 0) {
        lines.push(localize("formatResolvedContent.duration", "Duration: {0}ms", content.durationInMillis));
      }
      if (content.inputTokens !== void 0 || content.outputTokens !== void 0) {
        lines.push(localize("formatResolvedContent.tokens", "Tokens: input={0}, output={1}, cached={2}, total={3}", content.inputTokens ?? "?", content.outputTokens ?? "?", content.cachedTokens ?? "?", content.totalTokens ?? "?"));
      }
      if (content.errorMessage) {
        lines.push(localize("formatResolvedContent.error", "Error: {0}", content.errorMessage));
      }
      if (content.sections) {
        for (const section of content.sections) {
          lines.push(`--- ${section.name} ---`);
          lines.push(section.content);
        }
      }
      return lines.join("\n");
    }
    case "hook": {
      const lines = [localize("formatResolvedContent.hook", "Hook: {0}", content.hookType)];
      if (content.command) {
        lines.push(localize("formatResolvedContent.command", "Command: {0}", content.command));
      }
      if (content.result !== void 0) {
        const resultText = content.result === ChatDebugHookResult.Success ? localize("formatResolvedContent.hookResult.success", "Success") : content.result === ChatDebugHookResult.Error ? localize("formatResolvedContent.hookResult.error", "Error") : localize("formatResolvedContent.hookResult.nonBlockingError", "Non-blocking Error");
        lines.push(localize("formatResolvedContent.result", "Result: {0}", resultText));
      }
      if (content.exitCode !== void 0) {
        lines.push(localize("formatResolvedContent.exitCode", "Exit Code: {0}", content.exitCode));
      }
      if (content.durationInMillis !== void 0) {
        lines.push(localize("formatResolvedContent.duration", "Duration: {0}ms", content.durationInMillis));
      }
      if (content.input) {
        lines.push(localize("formatResolvedContent.input", "Input:") + "\n" + content.input);
      }
      if (content.output) {
        lines.push(localize("formatResolvedContent.output", "Output:") + "\n" + content.output);
      }
      if (content.errorMessage) {
        lines.push(localize("formatResolvedContent.error", "Error: {0}", content.errorMessage));
      }
      return lines.join("\n");
    }
    case "customizationSummary": {
      const lines = [];
      lines.push(localize("formatResolvedContent.customizationCounts", "Customization: {0} instructions, {1} skills, {2} agents, {3} hooks, {4} skipped", content.counts.instructions, content.counts.skills, content.counts.agents, content.counts.hooks, content.counts.skipped));
      lines.push(localize("formatResolvedContent.customizationDuration", "Duration: {0}ms", content.durationInMillis.toFixed(1)));
      if (content.resolutionLogs.length > 0) {
        lines.push("");
        lines.push(localize("formatResolvedContent.resolutionLogs", "Resolution logs:"));
        for (const entry of content.resolutionLogs) {
          const detail = entry.reason ? `${entry.name} \u2014 ${entry.reason}` : entry.name;
          lines.push(`  [${entry.category}] ${detail}`);
        }
      }
      return lines.join("\n");
    }
    default: {
      const _ = content;
      return JSON.stringify(_);
    }
  }
}
function truncate(text, maxLength = 30) {
  if (text.length <= maxLength) {
    return text;
  }
  const lastSpace = text.lastIndexOf(" ", maxLength);
  const cutoff = lastSpace > maxLength / 2 ? lastSpace : maxLength;
  return text.substring(0, cutoff) + "\u2026";
}
function getEventLabel(event) {
  switch (event.kind) {
    case "generic":
      return event.name;
    case "toolCall":
      return event.toolName;
    case "modelTurn":
      return event.requestName ?? localize("debugEvent.modelTurn", "Model Turn");
    case "userMessage":
      return localize("debugEvent.userMessage", "User Message: {0}", truncate(event.message));
    case "agentResponse":
      return localize("debugEvent.agentResponse", "Agent Response: {0}", truncate(event.message));
    case "subagentInvocation":
      return event.agentName;
  }
}
let ResolveDebugEventDetailsTool = class {
  constructor(chatDebugService) {
    this.chatDebugService = chatDebugService;
  }
  async prepareToolInvocation(context, _token) {
    const eventId = context.parameters?.eventId;
    let eventLabel;
    if (typeof eventId === "string" && context.chatSessionResource) {
      const events = this.chatDebugService.getEvents(context.chatSessionResource);
      const event = events.find((e) => e.id === eventId);
      if (event) {
        eventLabel = getEventLabel(event);
      }
    }
    if (eventLabel) {
      return {
        invocationMessage: localize("resolveDebugEventDetails.invocationMessageNamed", 'Resolving details for "{0}"', eventLabel),
        pastTenseMessage: localize("resolveDebugEventDetails.pastTenseMessageNamed", 'Resolved details for "{0}"', eventLabel)
      };
    }
    return {
      invocationMessage: localize("resolveDebugEventDetails.invocationMessage", "Resolving debug event details"),
      pastTenseMessage: localize("resolveDebugEventDetails.pastTenseMessage", "Resolved debug event details")
    };
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const eventId = invocation.parameters["eventId"];
    if (typeof eventId !== "string" || !eventId) {
      return {
        content: [{ kind: "text", value: localize("resolveDebugEventDetails.errorEventIdRequired", "Error: eventId parameter is required.") }]
      };
    }
    const sessionResource = invocation.context?.sessionResource;
    if (!sessionResource) {
      return {
        content: [{ kind: "text", value: localize("resolveDebugEventDetails.errorNoSession", "Error: no chat session context available.") }]
      };
    }
    const sessionEvents = this.chatDebugService.getEvents(sessionResource);
    if (!sessionEvents.some((e) => e.id === eventId)) {
      return {
        content: [{ kind: "text", value: localize("resolveDebugEventDetails.errorEventNotFound", 'No event with ID "{0}" found in the current session.', eventId) }]
      };
    }
    const resolved = await this.chatDebugService.resolveEvent(eventId);
    if (!resolved) {
      return {
        content: [{ kind: "text", value: localize("resolveDebugEventDetails.errorNoDetails", "No details found for event ID: {0}", eventId) }]
      };
    }
    return {
      content: [{ kind: "text", value: formatResolvedContent(resolved) }]
    };
  }
};
ResolveDebugEventDetailsTool = __decorateClass([
  __decorateParam(0, IChatDebugService)
], ResolveDebugEventDetailsTool);
export {
  ResolveDebugEventDetailsTool,
  ResolveDebugEventDetailsToolData,
  ResolveDebugEventDetailsToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xccmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z0hvb2tSZXN1bHQsIElDaGF0RGVidWdFdmVudCwgSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50LCBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ291bnRUb2tlbnNDYWxsYmFjaywgSVByZXBhcmVkVG9vbEludm9jYXRpb24sIElUb29sRGF0YSwgSVRvb2xJbXBsLCBJVG9vbEludm9jYXRpb24sIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgSVRvb2xSZXN1bHQsIFRvb2xEYXRhU291cmNlLCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IFJlc29sdmVEZWJ1Z0V2ZW50RGV0YWlsc1Rvb2xJZCA9ICd2c2NvZGVfcmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzX2ludGVybmFsJztcblxuZXhwb3J0IGNvbnN0IFJlc29sdmVEZWJ1Z0V2ZW50RGV0YWlsc1Rvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiBSZXNvbHZlRGVidWdFdmVudERldGFpbHNUb29sSWQsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiAncmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzJyxcblx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdyZXNvbHZlRGVidWdFdmVudERldGFpbHMuZGlzcGxheU5hbWUnLCBcIlJlc29sdmUgRGVidWcgRXZlbnQgRGV0YWlsc1wiKSxcblx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLFxuXHRtb2RlbERlc2NyaXB0aW9uOiAnUmVzb2x2ZXMgdGhlIGZ1bGwgZGV0YWlscyBmb3IgYSBzcGVjaWZpYyBjaGF0IGRlYnVnIGV2ZW50IGJ5IGl0cyBldmVudCBJRC4gVXNlIHRoaXMgdG9vbCB0byBnZXQgZGV0YWlsZWQgaW5mb3JtYXRpb24gYWJvdXQgYSBkZWJ1ZyBldmVudCBzdWNoIGFzIHRvb2wgY2FsbCBpbnB1dC9vdXRwdXQsIG1vZGVsIHR1cm4gZGV0YWlscywgdXNlciBtZXNzYWdlIHNlY3Rpb25zLCBvciBmaWxlIGxpc3RzLiBUaGUgZXZlbnQgSUQgY2FuIGJlIGZvdW5kIGluIHRoZSBkZWJ1ZyBldmVudCBsb2cgc3VtbWFyeSBwcm92aWRlZCBpbiB0aGUgY29udmVyc2F0aW9uIGNvbnRleHQuJyxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRldmVudElkOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBJRCBvZiB0aGUgZGVidWcgZXZlbnQgdG8gcmVzb2x2ZSBkZXRhaWxzIGZvci4nLFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ2V2ZW50SWQnXSxcblx0fSxcbn07XG5cbmZ1bmN0aW9uIGZvcm1hdFJlc29sdmVkQ29udGVudChjb250ZW50OiBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGNvbnRlbnQua2luZCkge1xuXHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWU7XG5cdFx0Y2FzZSAnZmlsZUxpc3QnOiB7XG5cdFx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbbG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5maWxlTGlzdCcsIFwiRmlsZSBsaXN0ICh7MH0pOlwiLCBjb250ZW50LmRpc2NvdmVyeVR5cGUpXTtcblx0XHRcdGlmIChjb250ZW50LnNvdXJjZUZvbGRlcnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgY29udGVudC5zb3VyY2VGb2xkZXJzKSB7XG5cdFx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LnNvdXJjZUZvbGRlcicsIFwiICBTb3VyY2UgZm9sZGVyOiB7MH0gKHsxfSlcIiwgZm9sZGVyLnVyaS50b1N0cmluZygpLCBmb2xkZXIuc3RvcmFnZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgY29udGVudC5maWxlcykge1xuXHRcdFx0XHRjb25zdCBzdGF0dXMgPSBmaWxlLnN0YXR1cyA9PT0gJ2xvYWRlZCdcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQubG9hZGVkJywgXCJsb2FkZWRcIilcblx0XHRcdFx0XHQ6IGZpbGUuc2tpcFJlYXNvblxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LnNraXBwZWRXaXRoUmVhc29uJywgXCJza2lwcGVkOiB7MH1cIiwgZmlsZS5za2lwUmVhc29uKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LnNraXBwZWQnLCBcInNraXBwZWRcIik7XG5cdFx0XHRcdGxpbmVzLnB1c2goYCAgJHtmaWxlLnVyaS50b1N0cmluZygpfSBbJHtzdGF0dXN9XWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRjYXNlICdtZXNzYWdlJzoge1xuXHRcdFx0Y29uc3QgbWVzc2FnZVR5cGUgPSBjb250ZW50LnR5cGUgPT09ICd1c2VyJ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQudXNlck1lc3NhZ2UnLCBcIlVzZXIgbWVzc2FnZTogezB9XCIsIGNvbnRlbnQubWVzc2FnZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LmFnZW50TWVzc2FnZScsIFwiQWdlbnQgbWVzc2FnZTogezB9XCIsIGNvbnRlbnQubWVzc2FnZSk7XG5cdFx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbbWVzc2FnZVR5cGVdO1xuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIGNvbnRlbnQuc2VjdGlvbnMpIHtcblx0XHRcdFx0bGluZXMucHVzaChgLS0tICR7c2VjdGlvbi5uYW1lfSAtLS1gKTtcblx0XHRcdFx0bGluZXMucHVzaChzZWN0aW9uLmNvbnRlbnQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRjYXNlICd0b29sQ2FsbCc6IHtcblx0XHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LnRvb2xDYWxsJywgXCJUb29sIGNhbGw6IHswfVwiLCBjb250ZW50LnRvb2xOYW1lKV07XG5cdFx0XHRpZiAoY29udGVudC5yZXN1bHQpIHtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LnJlc3VsdCcsIFwiUmVzdWx0OiB7MH1cIiwgY29udGVudC5yZXN1bHQpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LmR1cmF0aW9uSW5NaWxsaXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuZHVyYXRpb24nLCBcIkR1cmF0aW9uOiB7MH1tc1wiLCBjb250ZW50LmR1cmF0aW9uSW5NaWxsaXMpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LmlucHV0KSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5pbnB1dCcsIFwiSW5wdXQ6XCIpICsgJ1xcbicgKyBjb250ZW50LmlucHV0KTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50Lm91dHB1dCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQub3V0cHV0JywgXCJPdXRwdXQ6XCIpICsgJ1xcbicgKyBjb250ZW50Lm91dHB1dCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdFx0fVxuXHRcdGNhc2UgJ21vZGVsVHVybic6IHtcblx0XHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50Lm1vZGVsVHVybicsIFwiTW9kZWwgdHVybjogezB9XCIsIGNvbnRlbnQucmVxdWVzdE5hbWUpXTtcblx0XHRcdGlmIChjb250ZW50Lm1vZGVsKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5tb2RlbCcsIFwiTW9kZWw6IHswfVwiLCBjb250ZW50Lm1vZGVsKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29udGVudC5zdGF0dXMpIHtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LnN0YXR1cycsIFwiU3RhdHVzOiB7MH1cIiwgY29udGVudC5zdGF0dXMpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LmR1cmF0aW9uSW5NaWxsaXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuZHVyYXRpb24nLCBcIkR1cmF0aW9uOiB7MH1tc1wiLCBjb250ZW50LmR1cmF0aW9uSW5NaWxsaXMpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LmlucHV0VG9rZW5zICE9PSB1bmRlZmluZWQgfHwgY29udGVudC5vdXRwdXRUb2tlbnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQudG9rZW5zJywgXCJUb2tlbnM6IGlucHV0PXswfSwgb3V0cHV0PXsxfSwgY2FjaGVkPXsyfSwgdG90YWw9ezN9XCIsIGNvbnRlbnQuaW5wdXRUb2tlbnMgPz8gJz8nLCBjb250ZW50Lm91dHB1dFRva2VucyA/PyAnPycsIGNvbnRlbnQuY2FjaGVkVG9rZW5zID8/ICc/JywgY29udGVudC50b3RhbFRva2VucyA/PyAnPycpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LmVycm9yTWVzc2FnZSkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuZXJyb3InLCBcIkVycm9yOiB7MH1cIiwgY29udGVudC5lcnJvck1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LnNlY3Rpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBjb250ZW50LnNlY3Rpb25zKSB7XG5cdFx0XHRcdFx0bGluZXMucHVzaChgLS0tICR7c2VjdGlvbi5uYW1lfSAtLS1gKTtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKHNlY3Rpb24uY29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0XHR9XG5cdFx0Y2FzZSAnaG9vayc6IHtcblx0XHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50Lmhvb2snLCBcIkhvb2s6IHswfVwiLCBjb250ZW50Lmhvb2tUeXBlKV07XG5cdFx0XHRpZiAoY29udGVudC5jb21tYW5kKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5jb21tYW5kJywgXCJDb21tYW5kOiB7MH1cIiwgY29udGVudC5jb21tYW5kKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29udGVudC5yZXN1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCByZXN1bHRUZXh0ID0gY29udGVudC5yZXN1bHQgPT09IENoYXREZWJ1Z0hvb2tSZXN1bHQuU3VjY2Vzc1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5ob29rUmVzdWx0LnN1Y2Nlc3MnLCBcIlN1Y2Nlc3NcIilcblx0XHRcdFx0XHQ6IGNvbnRlbnQucmVzdWx0ID09PSBDaGF0RGVidWdIb29rUmVzdWx0LkVycm9yXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuaG9va1Jlc3VsdC5lcnJvcicsIFwiRXJyb3JcIilcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5ob29rUmVzdWx0Lm5vbkJsb2NraW5nRXJyb3InLCBcIk5vbi1ibG9ja2luZyBFcnJvclwiKTtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LnJlc3VsdCcsIFwiUmVzdWx0OiB7MH1cIiwgcmVzdWx0VGV4dCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRlbnQuZXhpdENvZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuZXhpdENvZGUnLCBcIkV4aXQgQ29kZTogezB9XCIsIGNvbnRlbnQuZXhpdENvZGUpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LmR1cmF0aW9uSW5NaWxsaXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuZHVyYXRpb24nLCBcIkR1cmF0aW9uOiB7MH1tc1wiLCBjb250ZW50LmR1cmF0aW9uSW5NaWxsaXMpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50LmlucHV0KSB7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ2Zvcm1hdFJlc29sdmVkQ29udGVudC5pbnB1dCcsIFwiSW5wdXQ6XCIpICsgJ1xcbicgKyBjb250ZW50LmlucHV0KTtcblx0XHRcdH1cblx0XHRcdGlmIChjb250ZW50Lm91dHB1dCkge1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQub3V0cHV0JywgXCJPdXRwdXQ6XCIpICsgJ1xcbicgKyBjb250ZW50Lm91dHB1dCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY29udGVudC5lcnJvck1lc3NhZ2UpIHtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LmVycm9yJywgXCJFcnJvcjogezB9XCIsIGNvbnRlbnQuZXJyb3JNZXNzYWdlKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdFx0fVxuXHRcdGNhc2UgJ2N1c3RvbWl6YXRpb25TdW1tYXJ5Jzoge1xuXHRcdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQuY3VzdG9taXphdGlvbkNvdW50cycsIFwiQ3VzdG9taXphdGlvbjogezB9IGluc3RydWN0aW9ucywgezF9IHNraWxscywgezJ9IGFnZW50cywgezN9IGhvb2tzLCB7NH0gc2tpcHBlZFwiLCBjb250ZW50LmNvdW50cy5pbnN0cnVjdGlvbnMsIGNvbnRlbnQuY291bnRzLnNraWxscywgY29udGVudC5jb3VudHMuYWdlbnRzLCBjb250ZW50LmNvdW50cy5ob29rcywgY29udGVudC5jb3VudHMuc2tpcHBlZCkpO1xuXHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnZm9ybWF0UmVzb2x2ZWRDb250ZW50LmN1c3RvbWl6YXRpb25EdXJhdGlvbicsIFwiRHVyYXRpb246IHswfW1zXCIsIGNvbnRlbnQuZHVyYXRpb25Jbk1pbGxpcy50b0ZpeGVkKDEpKSk7XG5cdFx0XHRpZiAoY29udGVudC5yZXNvbHV0aW9uTG9ncy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2goJycpO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdmb3JtYXRSZXNvbHZlZENvbnRlbnQucmVzb2x1dGlvbkxvZ3MnLCBcIlJlc29sdXRpb24gbG9nczpcIikpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGNvbnRlbnQucmVzb2x1dGlvbkxvZ3MpIHtcblx0XHRcdFx0XHRjb25zdCBkZXRhaWwgPSBlbnRyeS5yZWFzb24gPyBgJHtlbnRyeS5uYW1lfSBcdTIwMTQgJHtlbnRyeS5yZWFzb259YCA6IGVudHJ5Lm5hbWU7XG5cdFx0XHRcdFx0bGluZXMucHVzaChgICBbJHtlbnRyeS5jYXRlZ29yeX1dICR7ZGV0YWlsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG5cdFx0fVxuXHRcdGRlZmF1bHQ6IHtcblx0XHRcdGNvbnN0IF86IG5ldmVyID0gY29udGVudDtcblx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShfKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gdHJ1bmNhdGUodGV4dDogc3RyaW5nLCBtYXhMZW5ndGggPSAzMCk6IHN0cmluZyB7XG5cdGlmICh0ZXh0Lmxlbmd0aCA8PSBtYXhMZW5ndGgpIHtcblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXHRjb25zdCBsYXN0U3BhY2UgPSB0ZXh0Lmxhc3RJbmRleE9mKCcgJywgbWF4TGVuZ3RoKTtcblx0Y29uc3QgY3V0b2ZmID0gbGFzdFNwYWNlID4gbWF4TGVuZ3RoIC8gMiA/IGxhc3RTcGFjZSA6IG1heExlbmd0aDtcblx0cmV0dXJuIHRleHQuc3Vic3RyaW5nKDAsIGN1dG9mZikgKyAnXFx1MjAyNic7XG59XG5cbmZ1bmN0aW9uIGdldEV2ZW50TGFiZWwoZXZlbnQ6IElDaGF0RGVidWdFdmVudCk6IHN0cmluZyB7XG5cdHN3aXRjaCAoZXZlbnQua2luZCkge1xuXHRcdGNhc2UgJ2dlbmVyaWMnOiByZXR1cm4gZXZlbnQubmFtZTtcblx0XHRjYXNlICd0b29sQ2FsbCc6IHJldHVybiBldmVudC50b29sTmFtZTtcblx0XHRjYXNlICdtb2RlbFR1cm4nOiByZXR1cm4gZXZlbnQucmVxdWVzdE5hbWUgPz8gbG9jYWxpemUoJ2RlYnVnRXZlbnQubW9kZWxUdXJuJywgXCJNb2RlbCBUdXJuXCIpO1xuXHRcdGNhc2UgJ3VzZXJNZXNzYWdlJzogcmV0dXJuIGxvY2FsaXplKCdkZWJ1Z0V2ZW50LnVzZXJNZXNzYWdlJywgXCJVc2VyIE1lc3NhZ2U6IHswfVwiLCB0cnVuY2F0ZShldmVudC5tZXNzYWdlKSk7XG5cdFx0Y2FzZSAnYWdlbnRSZXNwb25zZSc6IHJldHVybiBsb2NhbGl6ZSgnZGVidWdFdmVudC5hZ2VudFJlc3BvbnNlJywgXCJBZ2VudCBSZXNwb25zZTogezB9XCIsIHRydW5jYXRlKGV2ZW50Lm1lc3NhZ2UpKTtcblx0XHRjYXNlICdzdWJhZ2VudEludm9jYXRpb24nOiByZXR1cm4gZXZlbnQuYWdlbnROYW1lO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNvbHZlRGVidWdFdmVudERldGFpbHNUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0RGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdERlYnVnU2VydmljZTogSUNoYXREZWJ1Z1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBldmVudElkID0gY29udGV4dC5wYXJhbWV0ZXJzPy5ldmVudElkO1xuXHRcdGxldCBldmVudExhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBldmVudElkID09PSAnc3RyaW5nJyAmJiBjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IGV2ZW50cyA9IHRoaXMuY2hhdERlYnVnU2VydmljZS5nZXRFdmVudHMoY29udGV4dC5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IGV2ZW50ID0gZXZlbnRzLmZpbmQoZSA9PiBlLmlkID09PSBldmVudElkKTtcblx0XHRcdGlmIChldmVudCkge1xuXHRcdFx0XHRldmVudExhYmVsID0gZ2V0RXZlbnRMYWJlbChldmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50TGFiZWwpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgncmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzLmludm9jYXRpb25NZXNzYWdlTmFtZWQnLCAnUmVzb2x2aW5nIGRldGFpbHMgZm9yIFwiezB9XCInLCBldmVudExhYmVsKSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbG9jYWxpemUoJ3Jlc29sdmVEZWJ1Z0V2ZW50RGV0YWlscy5wYXN0VGVuc2VNZXNzYWdlTmFtZWQnLCAnUmVzb2x2ZWQgZGV0YWlscyBmb3IgXCJ7MH1cIicsIGV2ZW50TGFiZWwpLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgncmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzLmludm9jYXRpb25NZXNzYWdlJywgJ1Jlc29sdmluZyBkZWJ1ZyBldmVudCBkZXRhaWxzJyksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgncmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzLnBhc3RUZW5zZU1lc3NhZ2UnLCAnUmVzb2x2ZWQgZGVidWcgZXZlbnQgZGV0YWlscycpLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGV2ZW50SWQgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnNbJ2V2ZW50SWQnXTtcblx0XHRpZiAodHlwZW9mIGV2ZW50SWQgIT09ICdzdHJpbmcnIHx8ICFldmVudElkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBsb2NhbGl6ZSgncmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzLmVycm9yRXZlbnRJZFJlcXVpcmVkJywgXCJFcnJvcjogZXZlbnRJZCBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQuXCIpIH1dLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBpbnZvY2F0aW9uLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogbG9jYWxpemUoJ3Jlc29sdmVEZWJ1Z0V2ZW50RGV0YWlscy5lcnJvck5vU2Vzc2lvbicsIFwiRXJyb3I6IG5vIGNoYXQgc2Vzc2lvbiBjb250ZXh0IGF2YWlsYWJsZS5cIikgfV0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25FdmVudHMgPSB0aGlzLmNoYXREZWJ1Z1NlcnZpY2UuZ2V0RXZlbnRzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXNzaW9uRXZlbnRzLnNvbWUoZSA9PiBlLmlkID09PSBldmVudElkKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogbG9jYWxpemUoJ3Jlc29sdmVEZWJ1Z0V2ZW50RGV0YWlscy5lcnJvckV2ZW50Tm90Rm91bmQnLCBcIk5vIGV2ZW50IHdpdGggSUQgXFxcInswfVxcXCIgZm91bmQgaW4gdGhlIGN1cnJlbnQgc2Vzc2lvbi5cIiwgZXZlbnRJZCkgfV0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5jaGF0RGVidWdTZXJ2aWNlLnJlc29sdmVFdmVudChldmVudElkKTtcblx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiBsb2NhbGl6ZSgncmVzb2x2ZURlYnVnRXZlbnREZXRhaWxzLmVycm9yTm9EZXRhaWxzJywgXCJObyBkZXRhaWxzIGZvdW5kIGZvciBldmVudCBJRDogezB9XCIsIGV2ZW50SWQpIH1dLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogZm9ybWF0UmVzb2x2ZWRDb250ZW50KHJlc29sdmVkKSB9XSxcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXNFLHlCQUF5QjtBQUN4RyxTQUE4SSxzQkFBb0M7QUFFM0ssTUFBTSxpQ0FBaUM7QUFFdkMsTUFBTSxtQ0FBOEM7QUFBQSxFQUMxRCxJQUFJO0FBQUEsRUFDSixtQkFBbUI7QUFBQSxFQUNuQixhQUFhLFNBQVMsd0NBQXdDLDZCQUE2QjtBQUFBLEVBQzNGLHlCQUF5QjtBQUFBLEVBQ3pCLGtCQUFrQjtBQUFBLEVBQ2xCLFFBQVEsZUFBZTtBQUFBLEVBQ3ZCLGFBQWE7QUFBQSxJQUNaLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxNQUNYLFNBQVM7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUFBLElBQ0EsVUFBVSxDQUFDLFNBQVM7QUFBQSxFQUNyQjtBQUNEO0FBRUEsU0FBUyxzQkFBc0IsU0FBaUQ7QUFDL0UsVUFBUSxRQUFRLE1BQU07QUFBQSxJQUNyQixLQUFLO0FBQ0osYUFBTyxRQUFRO0FBQUEsSUFDaEIsS0FBSyxZQUFZO0FBQ2hCLFlBQU0sUUFBa0IsQ0FBQyxTQUFTLGtDQUFrQyxvQkFBb0IsUUFBUSxhQUFhLENBQUM7QUFDOUcsVUFBSSxRQUFRLGVBQWU7QUFDMUIsbUJBQVcsVUFBVSxRQUFRLGVBQWU7QUFDM0MsZ0JBQU0sS0FBSyxTQUFTLHNDQUFzQyw4QkFBOEIsT0FBTyxJQUFJLFNBQVMsR0FBRyxPQUFPLE9BQU8sQ0FBQztBQUFBLFFBQy9IO0FBQUEsTUFDRDtBQUNBLGlCQUFXLFFBQVEsUUFBUSxPQUFPO0FBQ2pDLGNBQU0sU0FBUyxLQUFLLFdBQVcsV0FDNUIsU0FBUyxnQ0FBZ0MsUUFBUSxJQUNqRCxLQUFLLGFBQ0osU0FB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
