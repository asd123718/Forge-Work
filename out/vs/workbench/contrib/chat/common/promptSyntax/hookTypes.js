import * as nls from "../../../../../nls.js";
import { Target } from "./promptTypes.js";
var HookType = /* @__PURE__ */ ((HookType2) => {
  HookType2["SessionStart"] = "SessionStart";
  HookType2["SessionEnd"] = "SessionEnd";
  HookType2["UserPromptSubmit"] = "UserPromptSubmit";
  HookType2["PreToolUse"] = "PreToolUse";
  HookType2["PostToolUse"] = "PostToolUse";
  HookType2["PreCompact"] = "PreCompact";
  HookType2["SubagentStart"] = "SubagentStart";
  HookType2["SubagentStop"] = "SubagentStop";
  HookType2["Stop"] = "Stop";
  HookType2["ErrorOccurred"] = "ErrorOccurred";
  return HookType2;
})(HookType || {});
const HOOKS_BY_TARGET = {
  // see https://code.visualstudio.com/docs/copilot/customization/hooks#_hook-lifecycle-events
  [Target.VSCode]: {
    "SessionStart": "SessionStart" /* SessionStart */,
    "UserPromptSubmit": "UserPromptSubmit" /* UserPromptSubmit */,
    "PreToolUse": "PreToolUse" /* PreToolUse */,
    "PostToolUse": "PostToolUse" /* PostToolUse */,
    "PreCompact": "PreCompact" /* PreCompact */,
    "SubagentStart": "SubagentStart" /* SubagentStart */,
    "SubagentStop": "SubagentStop" /* SubagentStop */,
    "Stop": "Stop" /* Stop */
  },
  // see https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-hooks#types-of-hooks
  [Target.GitHubCopilot]: {
    "sessionStart": "SessionStart" /* SessionStart */,
    "sessionEnd": "SessionEnd" /* SessionEnd */,
    "userPromptSubmitted": "UserPromptSubmit" /* UserPromptSubmit */,
    "preToolUse": "PreToolUse" /* PreToolUse */,
    "postToolUse": "PostToolUse" /* PostToolUse */,
    "agentStop": "Stop" /* Stop */,
    "subagentStop": "SubagentStop" /* SubagentStop */,
    "errorOccurred": "ErrorOccurred" /* ErrorOccurred */
  },
  // see https://docs.anthropic.com/en/docs/claude-code/hooks
  [Target.Claude]: {
    "SessionStart": "SessionStart" /* SessionStart */,
    "UserPromptSubmit": "UserPromptSubmit" /* UserPromptSubmit */,
    "PreToolUse": "PreToolUse" /* PreToolUse */,
    "PostToolUse": "PostToolUse" /* PostToolUse */,
    "PreCompact": "PreCompact" /* PreCompact */,
    "SubagentStart": "SubagentStart" /* SubagentStart */,
    "SubagentStop": "SubagentStop" /* SubagentStop */,
    "Stop": "Stop" /* Stop */
  },
  // if no target, just list all known hook types.
  [Target.Undefined]: Object.fromEntries(
    Object.values(HookType).map((h) => [h, h])
  )
};
const HOOK_METADATA = {
  ["SessionStart" /* SessionStart */]: {
    label: nls.localize("hookType.sessionStart.label", "Session Start"),
    description: nls.localize("hookType.sessionStart.description", "Executed when a new agent session begins.")
  },
  ["UserPromptSubmit" /* UserPromptSubmit */]: {
    label: nls.localize("hookType.userPromptSubmit.label", "User Prompt Submit"),
    description: nls.localize("hookType.userPromptSubmit.description", "Executed when the user submits a prompt to the agent.")
  },
  ["PreToolUse" /* PreToolUse */]: {
    label: nls.localize("hookType.preToolUse.label", "Pre-Tool Use"),
    description: nls.localize("hookType.preToolUse.description", "Executed before the agent uses any tool.")
  },
  ["PostToolUse" /* PostToolUse */]: {
    label: nls.localize("hookType.postToolUse.label", "Post-Tool Use"),
    description: nls.localize("hookType.postToolUse.description", "Executed after a tool completes execution successfully.")
  },
  ["PreCompact" /* PreCompact */]: {
    label: nls.localize("hookType.preCompact.label", "Pre-Compact"),
    description: nls.localize("hookType.preCompact.description", "Executed before the agent compacts the conversation context.")
  },
  ["SubagentStart" /* SubagentStart */]: {
    label: nls.localize("hookType.subagentStart.label", "Subagent Start"),
    description: nls.localize("hookType.subagentStart.description", "Executed when a subagent is started.")
  },
  ["SubagentStop" /* SubagentStop */]: {
    label: nls.localize("hookType.subagentStop.label", "Subagent Stop"),
    description: nls.localize("hookType.subagentStop.description", "Executed when a subagent stops.")
  },
  ["Stop" /* Stop */]: {
    label: nls.localize("hookType.stop.label", "Stop"),
    description: nls.localize("hookType.stop.description", "Executed when the agent stops.")
  },
  ["SessionEnd" /* SessionEnd */]: {
    label: nls.localize("hookType.sessionEnd.label", "Session End"),
    description: nls.localize("hookType.sessionEnd.description", "Executed when an agent session ends.")
  },
  ["ErrorOccurred" /* ErrorOccurred */]: {
    label: nls.localize("hookType.errorOccurred.label", "Error Occurred"),
    description: nls.localize("hookType.errorOccurred.description", "Executed when an error occurs during the agent session.")
  }
};
export {
  HOOKS_BY_TARGET,
  HOOK_METADATA,
  HookType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxob29rVHlwZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFRhcmdldCB9IGZyb20gJy4vcHJvbXB0VHlwZXMuanMnO1xuXG4vKipcbiAqIEVudW0gb2YgaG9vayB0eXBlcyBhY3Jvc3MgYWxsIHRhcmdldHMuIEZvciB0aGUgc2V0IG9mIHN1cHBvcnRlZCBob29rcyBwZXIgdGFyZ2V0LCBzZWUgSE9PS1NfQllfVEFSR0VULlxuICovXG5leHBvcnQgZW51bSBIb29rVHlwZSB7XG5cdFNlc3Npb25TdGFydCA9ICdTZXNzaW9uU3RhcnQnLFxuXHRTZXNzaW9uRW5kID0gJ1Nlc3Npb25FbmQnLFxuXHRVc2VyUHJvbXB0U3VibWl0ID0gJ1VzZXJQcm9tcHRTdWJtaXQnLFxuXHRQcmVUb29sVXNlID0gJ1ByZVRvb2xVc2UnLFxuXHRQb3N0VG9vbFVzZSA9ICdQb3N0VG9vbFVzZScsXG5cdFByZUNvbXBhY3QgPSAnUHJlQ29tcGFjdCcsXG5cdFN1YmFnZW50U3RhcnQgPSAnU3ViYWdlbnRTdGFydCcsXG5cdFN1YmFnZW50U3RvcCA9ICdTdWJhZ2VudFN0b3AnLFxuXHRTdG9wID0gJ1N0b3AnLFxuXHRFcnJvck9jY3VycmVkID0gJ0Vycm9yT2NjdXJyZWQnLFxufVxuXG4vKipcbiAqIFN0cmluZyBsaXRlcmFsIHR5cGUgZGVyaXZlZCBmcm9tIEhvb2tUeXBlIGVudW0gdmFsdWVzLlxuICovXG5leHBvcnQgdHlwZSBIb29rVHlwZVZhbHVlID0gYCR7SG9va1R5cGV9YDtcblxuZXhwb3J0IGNvbnN0IEhPT0tTX0JZX1RBUkdFVDogUmVjb3JkPFRhcmdldCwgUmVjb3JkPHN0cmluZywgSG9va1R5cGU+PiA9IHtcblx0Ly8gc2VlIGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvY29waWxvdC9jdXN0b21pemF0aW9uL2hvb2tzI19ob29rLWxpZmVjeWNsZS1ldmVudHNcblx0W1RhcmdldC5WU0NvZGVdOiB7XG5cdFx0J1Nlc3Npb25TdGFydCc6IEhvb2tUeXBlLlNlc3Npb25TdGFydCxcblx0XHQnVXNlclByb21wdFN1Ym1pdCc6IEhvb2tUeXBlLlVzZXJQcm9tcHRTdWJtaXQsXG5cdFx0J1ByZVRvb2xVc2UnOiBIb29rVHlwZS5QcmVUb29sVXNlLFxuXHRcdCdQb3N0VG9vbFVzZSc6IEhvb2tUeXBlLlBvc3RUb29sVXNlLFxuXHRcdCdQcmVDb21wYWN0JzogSG9va1R5cGUuUHJlQ29tcGFjdCxcblx0XHQnU3ViYWdlbnRTdGFydCc6IEhvb2tUeXBlLlN1YmFnZW50U3RhcnQsXG5cdFx0J1N1YmFnZW50U3RvcCc6IEhvb2tUeXBlLlN1YmFnZW50U3RvcCxcblx0XHQnU3RvcCc6IEhvb2tUeXBlLlN0b3AsXG5cdH0sXG5cdC8vIHNlZSBodHRwczovL2RvY3MuZ2l0aHViLmNvbS9lbi9jb3BpbG90L2NvbmNlcHRzL2FnZW50cy9jb2RpbmctYWdlbnQvYWJvdXQtaG9va3MjdHlwZXMtb2YtaG9va3Ncblx0W1RhcmdldC5HaXRIdWJDb3BpbG90XToge1xuXHRcdCdzZXNzaW9uU3RhcnQnOiBIb29rVHlwZS5TZXNzaW9uU3RhcnQsXG5cdFx0J3Nlc3Npb25FbmQnOiBIb29rVHlwZS5TZXNzaW9uRW5kLFxuXHRcdCd1c2VyUHJvbXB0U3VibWl0dGVkJzogSG9va1R5cGUuVXNlclByb21wdFN1Ym1pdCxcblx0XHQncHJlVG9vbFVzZSc6IEhvb2tUeXBlLlByZVRvb2xVc2UsXG5cdFx0J3Bvc3RUb29sVXNlJzogSG9va1R5cGUuUG9zdFRvb2xVc2UsXG5cdFx0J2FnZW50U3RvcCc6IEhvb2tUeXBlLlN0b3AsXG5cdFx0J3N1YmFnZW50U3RvcCc6IEhvb2tUeXBlLlN1YmFnZW50U3RvcCxcblx0XHQnZXJyb3JPY2N1cnJlZCc6IEhvb2tUeXBlLkVycm9yT2NjdXJyZWRcblx0fSxcblx0Ly8gc2VlIGh0dHBzOi8vZG9jcy5hbnRocm9waWMuY29tL2VuL2RvY3MvY2xhdWRlLWNvZGUvaG9va3Ncblx0W1RhcmdldC5DbGF1ZGVdOiB7XG5cdFx0J1Nlc3Npb25TdGFydCc6IEhvb2tUeXBlLlNlc3Npb25TdGFydCxcblx0XHQnVXNlclByb21wdFN1Ym1pdCc6IEhvb2tUeXBlLlVzZXJQcm9tcHRTdWJtaXQsXG5cdFx0J1ByZVRvb2xVc2UnOiBIb29rVHlwZS5QcmVUb29sVXNlLFxuXHRcdCdQb3N0VG9vbFVzZSc6IEhvb2tUeXBlLlBvc3RUb29sVXNlLFxuXHRcdCdQcmVDb21wYWN0JzogSG9va1R5cGUuUHJlQ29tcGFjdCxcblx0XHQnU3ViYWdlbnRTdGFydCc6IEhvb2tUeXBlLlN1YmFnZW50U3RhcnQsXG5cdFx0J1N1YmFnZW50U3RvcCc6IEhvb2tUeXBlLlN1YmFnZW50U3RvcCxcblx0XHQnU3RvcCc6IEhvb2tUeXBlLlN0b3AsXG5cdH0sXG5cdC8vIGlmIG5vIHRhcmdldCwganVzdCBsaXN0IGFsbCBrbm93biBob29rIHR5cGVzLlxuXHRbVGFyZ2V0LlVuZGVmaW5lZF06IE9iamVjdC5mcm9tRW50cmllcyhcblx0XHRPYmplY3QudmFsdWVzKEhvb2tUeXBlKS5tYXAoaCA9PiBbaCwgaF0pXG5cdCkgYXMgUmVjb3JkPHN0cmluZywgSG9va1R5cGU+XG59O1xuXG4vKipcbiAqIE1ldGFkYXRhIGZvciBhIGhvb2sgdHlwZSBpbmNsdWRpbmcgbG9jYWxpemVkIGxhYmVsIGFuZCBkZXNjcmlwdGlvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJSG9va1R5cGVNZXRhIHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcbn1cblxuLyoqXG4gKiBNZXRhZGF0YSBmb3IgaG9vayB0eXBlcyBpbmNsdWRpbmcgbG9jYWxpemVkIGxhYmVscyBhbmQgZGVzY3JpcHRpb25zXG4gKi9cbmV4cG9ydCBjb25zdCBIT09LX01FVEFEQVRBOiB7IFtrZXkgaW4gSG9va1R5cGVdOiBJSG9va1R5cGVNZXRhIH0gPSB7XG5cdFtIb29rVHlwZS5TZXNzaW9uU3RhcnRdOiB7XG5cdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnaG9va1R5cGUuc2Vzc2lvblN0YXJ0LmxhYmVsJywgXCJTZXNzaW9uIFN0YXJ0XCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvb2tUeXBlLnNlc3Npb25TdGFydC5kZXNjcmlwdGlvbicsIFwiRXhlY3V0ZWQgd2hlbiBhIG5ldyBhZ2VudCBzZXNzaW9uIGJlZ2lucy5cIilcblx0fSxcblx0W0hvb2tUeXBlLlVzZXJQcm9tcHRTdWJtaXRdOiB7XG5cdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnaG9va1R5cGUudXNlclByb21wdFN1Ym1pdC5sYWJlbCcsIFwiVXNlciBQcm9tcHQgU3VibWl0XCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvb2tUeXBlLnVzZXJQcm9tcHRTdWJtaXQuZGVzY3JpcHRpb24nLCBcIkV4ZWN1dGVkIHdoZW4gdGhlIHVzZXIgc3VibWl0cyBhIHByb21wdCB0byB0aGUgYWdlbnQuXCIpXG5cdH0sXG5cdFtIb29rVHlwZS5QcmVUb29sVXNlXToge1xuXHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2hvb2tUeXBlLnByZVRvb2xVc2UubGFiZWwnLCBcIlByZS1Ub29sIFVzZVwiKSxcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdob29rVHlwZS5wcmVUb29sVXNlLmRlc2NyaXB0aW9uJywgXCJFeGVjdXRlZCBiZWZvcmUgdGhlIGFnZW50IHVzZXMgYW55IHRvb2wuXCIpXG5cdH0sXG5cdFtIb29rVHlwZS5Qb3N0VG9vbFVzZV06IHtcblx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdob29rVHlwZS5wb3N0VG9vbFVzZS5sYWJlbCcsIFwiUG9zdC1Ub29sIFVzZVwiKSxcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdob29rVHlwZS5wb3N0VG9vbFVzZS5kZXNjcmlwdGlvbicsIFwiRXhlY3V0ZWQgYWZ0ZXIgYSB0b29sIGNvbXBsZXRlcyBleGVjdXRpb24gc3VjY2Vzc2Z1bGx5LlwiKVxuXHR9LFxuXHRbSG9va1R5cGUuUHJlQ29tcGFjdF06IHtcblx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdob29rVHlwZS5wcmVDb21wYWN0LmxhYmVsJywgXCJQcmUtQ29tcGFjdFwiKSxcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdob29rVHlwZS5wcmVDb21wYWN0LmRlc2NyaXB0aW9uJywgXCJFeGVjdXRlZCBiZWZvcmUgdGhlIGFnZW50IGNvbXBhY3RzIHRoZSBjb252ZXJzYXRpb24gY29udGV4dC5cIilcblx0fSxcblx0W0hvb2tUeXBlLlN1YmFnZW50U3RhcnRdOiB7XG5cdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnaG9va1R5cGUuc3ViYWdlbnRTdGFydC5sYWJlbCcsIFwiU3ViYWdlbnQgU3RhcnRcIiksXG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaG9va1R5cGUuc3ViYWdlbnRTdGFydC5kZXNjcmlwdGlvbicsIFwiRXhlY3V0ZWQgd2hlbiBhIHN1YmFnZW50IGlzIHN0YXJ0ZWQuXCIpXG5cdH0sXG5cdFtIb29rVHlwZS5TdWJhZ2VudFN0b3BdOiB7XG5cdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnaG9va1R5cGUuc3ViYWdlbnRTdG9wLmxhYmVsJywgXCJTdWJhZ2VudCBTdG9wXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvb2tUeXBlLnN1YmFnZW50U3RvcC5kZXNjcmlwdGlvbicsIFwiRXhlY3V0ZWQgd2hlbiBhIHN1YmFnZW50IHN0b3BzLlwiKVxuXHR9LFxuXHRbSG9va1R5cGUuU3RvcF06IHtcblx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdob29rVHlwZS5zdG9wLmxhYmVsJywgXCJTdG9wXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvb2tUeXBlLnN0b3AuZGVzY3JpcHRpb24nLCBcIkV4ZWN1dGVkIHdoZW4gdGhlIGFnZW50IHN0b3BzLlwiKVxuXHR9LFxuXHRbSG9va1R5cGUuU2Vzc2lvbkVuZF06IHtcblx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdob29rVHlwZS5zZXNzaW9uRW5kLmxhYmVsJywgXCJTZXNzaW9uIEVuZFwiKSxcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdob29rVHlwZS5zZXNzaW9uRW5kLmRlc2NyaXB0aW9uJywgXCJFeGVjdXRlZCB3aGVuIGFuIGFnZW50IHNlc3Npb24gZW5kcy5cIilcblx0fSxcblx0W0hvb2tUeXBlLkVycm9yT2NjdXJyZWRdOiB7XG5cdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnaG9va1R5cGUuZXJyb3JPY2N1cnJlZC5sYWJlbCcsIFwiRXJyb3IgT2NjdXJyZWRcIiksXG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaG9va1R5cGUuZXJyb3JPY2N1cnJlZC5kZXNjcmlwdGlvbicsIFwiRXhlY3V0ZWQgd2hlbiBhbiBlcnJvciBvY2N1cnMgZHVyaW5nIHRoZSBhZ2VudCBz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
