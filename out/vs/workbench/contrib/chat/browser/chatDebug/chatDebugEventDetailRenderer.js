import { localize } from "../../../../../nls.js";
import { safeIntl } from "../../../../../base/common/date.js";
const numberFormatter = safeIntl.NumberFormat();
function formatEventDetail(event) {
  switch (event.kind) {
    case "toolCall": {
      const parts = [localize("chatDebug.detail.tool", "Tool: {0}", event.toolName)];
      if (event.toolCallId) {
        parts.push(localize("chatDebug.detail.callId", "Call ID: {0}", event.toolCallId));
      }
      if (event.result) {
        parts.push(localize("chatDebug.detail.result", "Result: {0}", event.result));
      }
      if (event.durationInMillis !== void 0) {
        parts.push(localize("chatDebug.detail.durationMs", "Duration: {0}ms", numberFormatter.value.format(event.durationInMillis)));
      }
      if (event.input) {
        parts.push(`
${localize("chatDebug.detail.input", "Input:")}
${event.input}`);
      }
      if (event.output) {
        parts.push(`
${localize("chatDebug.detail.output", "Output:")}
${event.output}`);
      }
      return parts.join("\n");
    }
    case "modelTurn": {
      const parts = [event.model ?? localize("chatDebug.detail.modelTurn", "Model Turn")];
      if (event.inputTokens !== void 0) {
        parts.push(localize("chatDebug.detail.inputTokens", "Input tokens: {0}", numberFormatter.value.format(event.inputTokens)));
      }
      if (event.outputTokens !== void 0) {
        parts.push(localize("chatDebug.detail.outputTokens", "Output tokens: {0}", numberFormatter.value.format(event.outputTokens)));
      }
      if (event.cachedTokens !== void 0) {
        parts.push(localize("chatDebug.detail.cachedTokens", "Cached tokens: {0}", numberFormatter.value.format(event.cachedTokens)));
      }
      if (event.totalTokens !== void 0) {
        parts.push(localize("chatDebug.detail.totalTokens", "Total tokens: {0}", numberFormatter.value.format(event.totalTokens)));
      }
      if (event.durationInMillis !== void 0) {
        parts.push(localize("chatDebug.detail.durationMs", "Duration: {0}ms", numberFormatter.value.format(event.durationInMillis)));
      }
      return parts.join("\n");
    }
    case "generic":
      return `${event.name}
${event.details ?? ""}`;
    case "subagentInvocation": {
      const parts = [localize("chatDebug.detail.agent", "Agent: {0}", event.agentName)];
      if (event.description) {
        parts.push(localize("chatDebug.detail.description", "Description: {0}", event.description));
      }
      if (event.status) {
        parts.push(localize("chatDebug.detail.status", "Status: {0}", event.status));
      }
      if (event.durationInMillis !== void 0) {
        parts.push(localize("chatDebug.detail.durationMs", "Duration: {0}ms", numberFormatter.value.format(event.durationInMillis)));
      }
      if (event.toolCallCount !== void 0) {
        parts.push(localize("chatDebug.detail.toolCallCount", "Tool calls: {0}", numberFormatter.value.format(event.toolCallCount)));
      }
      if (event.modelTurnCount !== void 0) {
        parts.push(localize("chatDebug.detail.modelTurnCount", "Model turns: {0}", numberFormatter.value.format(event.modelTurnCount)));
      }
      return parts.join("\n");
    }
    case "userMessage": {
      const parts = [localize("chatDebug.detail.userMessage", "User Message: {0}", event.message)];
      for (const section of event.sections) {
        parts.push(`
--- ${section.name} ---
${section.content}`);
      }
      return parts.join("\n");
    }
    case "agentResponse": {
      const parts = [localize("chatDebug.detail.agentResponse", "Agent Response: {0}", event.message)];
      for (const section of event.sections) {
        parts.push(`
--- ${section.name} ---
${section.content}`);
      }
      return parts.join("\n");
    }
  }
}
export {
  formatEventDetail
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXREZWJ1Z1xcY2hhdERlYnVnRXZlbnREZXRhaWxSZW5kZXJlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDaGF0RGVidWdFdmVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHNhZmVJbnRsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5cbmNvbnN0IG51bWJlckZvcm1hdHRlciA9IHNhZmVJbnRsLk51bWJlckZvcm1hdCgpO1xuXG4vKipcbiAqIEZvcm1hdCB0aGUgZGV0YWlsIHRleHQgZm9yIGEgZGVidWcgZXZlbnQgKHVzZWQgd2hlbiBubyByZXNvbHZlZCBjb250ZW50IGlzIGF2YWlsYWJsZSkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRFdmVudERldGFpbChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogc3RyaW5nIHtcblx0c3dpdGNoIChldmVudC5raW5kKSB7XG5cdFx0Y2FzZSAndG9vbENhbGwnOiB7XG5cdFx0XHRjb25zdCBwYXJ0cyA9IFtsb2NhbGl6ZSgnY2hhdERlYnVnLmRldGFpbC50b29sJywgXCJUb29sOiB7MH1cIiwgZXZlbnQudG9vbE5hbWUpXTtcblx0XHRcdGlmIChldmVudC50b29sQ2FsbElkKSB7IHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwuY2FsbElkJywgXCJDYWxsIElEOiB7MH1cIiwgZXZlbnQudG9vbENhbGxJZCkpOyB9XG5cdFx0XHRpZiAoZXZlbnQucmVzdWx0KSB7IHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwucmVzdWx0JywgXCJSZXN1bHQ6IHswfVwiLCBldmVudC5yZXN1bHQpKTsgfVxuXHRcdFx0aWYgKGV2ZW50LmR1cmF0aW9uSW5NaWxsaXMgIT09IHVuZGVmaW5lZCkgeyBwYXJ0cy5wdXNoKGxvY2FsaXplKCdjaGF0RGVidWcuZGV0YWlsLmR1cmF0aW9uTXMnLCBcIkR1cmF0aW9uOiB7MH1tc1wiLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KGV2ZW50LmR1cmF0aW9uSW5NaWxsaXMpKSk7IH1cblx0XHRcdGlmIChldmVudC5pbnB1dCkgeyBwYXJ0cy5wdXNoKGBcXG4ke2xvY2FsaXplKCdjaGF0RGVidWcuZGV0YWlsLmlucHV0JywgXCJJbnB1dDpcIil9XFxuJHtldmVudC5pbnB1dH1gKTsgfVxuXHRcdFx0aWYgKGV2ZW50Lm91dHB1dCkgeyBwYXJ0cy5wdXNoKGBcXG4ke2xvY2FsaXplKCdjaGF0RGVidWcuZGV0YWlsLm91dHB1dCcsIFwiT3V0cHV0OlwiKX1cXG4ke2V2ZW50Lm91dHB1dH1gKTsgfVxuXHRcdFx0cmV0dXJuIHBhcnRzLmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRjYXNlICdtb2RlbFR1cm4nOiB7XG5cdFx0XHRjb25zdCBwYXJ0cyA9IFtldmVudC5tb2RlbCA/PyBsb2NhbGl6ZSgnY2hhdERlYnVnLmRldGFpbC5tb2RlbFR1cm4nLCBcIk1vZGVsIFR1cm5cIildO1xuXHRcdFx0aWYgKGV2ZW50LmlucHV0VG9rZW5zICE9PSB1bmRlZmluZWQpIHsgcGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLmRldGFpbC5pbnB1dFRva2VucycsIFwiSW5wdXQgdG9rZW5zOiB7MH1cIiwgbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChldmVudC5pbnB1dFRva2VucykpKTsgfVxuXHRcdFx0aWYgKGV2ZW50Lm91dHB1dFRva2VucyAhPT0gdW5kZWZpbmVkKSB7IHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwub3V0cHV0VG9rZW5zJywgXCJPdXRwdXQgdG9rZW5zOiB7MH1cIiwgbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChldmVudC5vdXRwdXRUb2tlbnMpKSk7IH1cblx0XHRcdGlmIChldmVudC5jYWNoZWRUb2tlbnMgIT09IHVuZGVmaW5lZCkgeyBwYXJ0cy5wdXNoKGxvY2FsaXplKCdjaGF0RGVidWcuZGV0YWlsLmNhY2hlZFRva2VucycsIFwiQ2FjaGVkIHRva2VuczogezB9XCIsIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoZXZlbnQuY2FjaGVkVG9rZW5zKSkpOyB9XG5cdFx0XHRpZiAoZXZlbnQudG90YWxUb2tlbnMgIT09IHVuZGVmaW5lZCkgeyBwYXJ0cy5wdXNoKGxvY2FsaXplKCdjaGF0RGVidWcuZGV0YWlsLnRvdGFsVG9rZW5zJywgXCJUb3RhbCB0b2tlbnM6IHswfVwiLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KGV2ZW50LnRvdGFsVG9rZW5zKSkpOyB9XG5cdFx0XHRpZiAoZXZlbnQuZHVyYXRpb25Jbk1pbGxpcyAhPT0gdW5kZWZpbmVkKSB7IHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwuZHVyYXRpb25NcycsIFwiRHVyYXRpb246IHswfW1zXCIsIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoZXZlbnQuZHVyYXRpb25Jbk1pbGxpcykpKTsgfVxuXHRcdFx0cmV0dXJuIHBhcnRzLmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRjYXNlICdnZW5lcmljJzpcblx0XHRcdHJldHVybiBgJHtldmVudC5uYW1lfVxcbiR7ZXZlbnQuZGV0YWlscyA/PyAnJ31gO1xuXHRcdGNhc2UgJ3N1YmFnZW50SW52b2NhdGlvbic6IHtcblx0XHRcdGNvbnN0IHBhcnRzID0gW2xvY2FsaXplKCdjaGF0RGVidWcuZGV0YWlsLmFnZW50JywgXCJBZ2VudDogezB9XCIsIGV2ZW50LmFnZW50TmFtZSldO1xuXHRcdFx0aWYgKGV2ZW50LmRlc2NyaXB0aW9uKSB7IHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwuZGVzY3JpcHRpb24nLCBcIkRlc2NyaXB0aW9uOiB7MH1cIiwgZXZlbnQuZGVzY3JpcHRpb24pKTsgfVxuXHRcdFx0aWYgKGV2ZW50LnN0YXR1cykgeyBwYXJ0cy5wdXNoKGxvY2FsaXplKCdjaGF0RGVidWcuZGV0YWlsLnN0YXR1cycsIFwiU3RhdHVzOiB7MH1cIiwgZXZlbnQuc3RhdHVzKSk7IH1cblx0XHRcdGlmIChldmVudC5kdXJhdGlvbkluTWlsbGlzICE9PSB1bmRlZmluZWQpIHsgcGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLmRldGFpbC5kdXJhdGlvbk1zJywgXCJEdXJhdGlvbjogezB9bXNcIiwgbnVtYmVyRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChldmVudC5kdXJhdGlvbkluTWlsbGlzKSkpOyB9XG5cdFx0XHRpZiAoZXZlbnQudG9vbENhbGxDb3VudCAhPT0gdW5kZWZpbmVkKSB7IHBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwudG9vbENhbGxDb3VudCcsIFwiVG9vbCBjYWxsczogezB9XCIsIG51bWJlckZvcm1hdHRlci52YWx1ZS5mb3JtYXQoZXZlbnQudG9vbENhbGxDb3VudCkpKTsgfVxuXHRcdFx0aWYgKGV2ZW50Lm1vZGVsVHVybkNvdW50ICE9PSB1bmRlZmluZWQpIHsgcGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdERlYnVnLmRldGFpbC5tb2RlbFR1cm5Db3VudCcsIFwiTW9kZWwgdHVybnM6IHswfVwiLCBudW1iZXJGb3JtYXR0ZXIudmFsdWUuZm9ybWF0KGV2ZW50Lm1vZGVsVHVybkNvdW50KSkpOyB9XG5cdFx0XHRyZXR1cm4gcGFydHMuam9pbignXFxuJyk7XG5cdFx0fVxuXHRcdGNhc2UgJ3VzZXJNZXNzYWdlJzoge1xuXHRcdFx0Y29uc3QgcGFydHMgPSBbbG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwudXNlck1lc3NhZ2UnLCBcIlVzZXIgTWVzc2FnZTogezB9XCIsIGV2ZW50Lm1lc3NhZ2UpXTtcblx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBldmVudC5zZWN0aW9ucykge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGBcXG4tLS0gJHtzZWN0aW9uLm5hbWV9IC0tLVxcbiR7c2VjdGlvbi5jb250ZW50fWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhcnRzLmpvaW4oJ1xcbicpO1xuXHRcdH1cblx0XHRjYXNlICdhZ2VudFJlc3BvbnNlJzoge1xuXHRcdFx0Y29uc3QgcGFydHMgPSBbbG9jYWxpemUoJ2NoYXREZWJ1Zy5kZXRhaWwuYWdlbnRSZXNwb25zZScsIFwiQWdlbnQgUmVzcG9uc2U6IHswfVwiLCBldmVudC5tZXNzYWdlKV07XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZXZlbnQuc2VjdGlvbnMpIHtcblx0XHRcdFx0cGFydHMucHVzaChgXFxuLS0tICR7c2VjdGlvbi5uYW1lfSAtLS1cXG4ke3NlY3Rpb24uY29udGVudH1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXJ0cy5qb2luKCdcXG4nKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsZ0JBQWdCO0FBRXpC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
