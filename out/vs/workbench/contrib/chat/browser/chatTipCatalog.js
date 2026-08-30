import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { localize } from "../../../../nls.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ChatConfiguration, ChatModeKind, OPEN_AGENTS_WINDOW_COMMAND_ID, OPEN_AGENTS_WINDOW_PRECONDITION, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from "../common/constants.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { localChatSessionType } from "../common/chatSessionsService.js";
import { TipTrackingCommands } from "./chatTipStorageKeys.js";
import {
  GENERATE_AGENT_COMMAND_ID,
  GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
  GENERATE_PROMPT_COMMAND_ID,
  GENERATE_SKILL_COMMAND_ID,
  INSERT_FORK_CONVERSATION_COMMAND_ID,
  INSERT_TROUBLESHOOT_COMMAND_ID
} from "./actions/chatActions.js";
var ChatTipTier = /* @__PURE__ */ ((ChatTipTier2) => {
  ChatTipTier2["Foundational"] = "foundational";
  ChatTipTier2["Qol"] = "qol";
  return ChatTipTier2;
})(ChatTipTier || {});
var ChatTipExperiment = /* @__PURE__ */ ((ChatTipExperiment2) => {
  ChatTipExperiment2["OpenAgentsWindowTip"] = "openagentswindowtip";
  return ChatTipExperiment2;
})(ChatTipExperiment || {});
function getCommandLabel(commandId) {
  const command = MenuRegistry.getCommand(commandId);
  if (command?.title) {
    return typeof command.title === "string" ? command.title : command.title.value;
  }
  const parts = commandId.split(".");
  return parts[parts.length - 1];
}
function formatKeybinding(ctx, commandId) {
  const kb = ctx.keybindingService.lookupKeybinding(commandId);
  return kb ? ` (${kb.getLabel()})` : "";
}
function extractCommandIds(markdown) {
  const commandPattern = /\[.*?\]\(command:([^?\s)]+)/g;
  const commands = /* @__PURE__ */ new Set();
  let match;
  while ((match = commandPattern.exec(markdown)) !== null) {
    commands.add(match[1]);
  }
  return [...commands];
}
const TIP_CATALOG = [
  {
    id: "tip.switchToAuto",
    tier: "foundational" /* Foundational */,
    priority: 0,
    buildMessage(_ctx) {
      return new MarkdownString(
        localize(
          "tip.switchToAuto",
          'Using GPT-4.1? Try switching to [Auto](command:workbench.action.chat.openModelPicker "Open Model Picker") in the model picker for better coding performance.'
        )
      );
    },
    onlyWhenModelIds: ["gpt-4.1"]
  },
  {
    id: "tip.init",
    tier: "foundational" /* Foundational */,
    priority: 50,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.init",
          'Use [{0}](command:{1} "Run /init"){2} to generate or update a workspace instructions file for AI coding agents.',
          "/init",
          GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenCommandsExecuted: [
      GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
      TipTrackingCommands.CreateAgentInstructionsUsed
    ]
  },
  {
    id: "tip.createPrompt",
    tier: "foundational" /* Foundational */,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, GENERATE_PROMPT_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.createPrompt",
          'Use [{0}](command:{1} "Run /create-prompt"){2} to generate a reusable prompt file with the agent.',
          "/create-prompt",
          GENERATE_PROMPT_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenCommandsExecuted: [
      GENERATE_PROMPT_COMMAND_ID,
      TipTrackingCommands.CreatePromptUsed
    ]
  },
  {
    id: "tip.createAgent",
    tier: "foundational" /* Foundational */,
    priority: 30,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, GENERATE_AGENT_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.createAgent",
          'Use [{0}](command:{1} "Run /create-agent"){2} to scaffold a custom agent for your workflow.',
          "/create-agent",
          GENERATE_AGENT_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenCommandsExecuted: [
      GENERATE_AGENT_COMMAND_ID,
      TipTrackingCommands.CreateAgentUsed
    ]
  },
  {
    id: "tip.createSkill",
    tier: "foundational" /* Foundational */,
    priority: 40,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, GENERATE_SKILL_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.createSkill",
          'Use [{0}](command:{1} "Run /create-skill"){2} to create a skill the agent can load when relevant.',
          "/create-skill",
          GENERATE_SKILL_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenCommandsExecuted: [
      GENERATE_SKILL_COMMAND_ID,
      TipTrackingCommands.CreateSkillUsed
    ]
  },
  {
    id: "tip.planMode",
    tier: "foundational" /* Foundational */,
    priority: 20,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, "workbench.action.chat.openPlan");
      return new MarkdownString(
        localize(
          "tip.planMode",
          'Try the [{0}](command:workbench.action.chat.open?%5B%7B%22mode%22%3A%22Plan%22%7D%5D "Start Plan Mode"){1} to research and plan before implementing changes.',
          "Plan agent",
          kb
        )
      );
    },
    when: ChatContextKeys.chatModeName.notEqualsTo("Plan"),
    requiresModeNames: ["Plan"],
    excludeWhenCommandsExecuted: ["workbench.action.chat.openPlan"],
    excludeWhenModesUsed: ["Plan"]
  },
  {
    id: "tip.attachFiles",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.attachFiles", "Reference files or folders with # to give the agent more context about the task.")
      );
    },
    excludeWhenCommandsExecuted: [
      "workbench.action.chat.attachContext",
      "workbench.action.chat.attachFile",
      "workbench.action.chat.attachFolder",
      "workbench.action.chat.attachSelection",
      TipTrackingCommands.AttachFilesReferenceUsed
    ]
  },
  {
    id: "tip.codeActions",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.codeActions", "Select a code block in the editor and right-click to access more AI actions.")
      );
    },
    when: IsSessionsWindowContext.negate(),
    excludeWhenCommandsExecuted: ["inlineChat.start"]
  },
  {
    id: "tip.undoChanges",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.undoChanges", 'Hover a previous request and select "Restore Checkpoint" to undo changes after that point in the chat conversation.')
      );
    },
    when: ContextKeyExpr.and(
      ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
      ContextKeyExpr.or(
        ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
        ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit)
      )
    ),
    excludeWhenCommandsExecuted: ["workbench.action.chat.restoreCheckpoint", "workbench.action.chat.restoreLastCheckpoint"]
  },
  {
    id: "tip.messageQueueing",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.messageQueueing", "Steer the agent mid-task by sending follow-up messages. They queue and apply in order.")
      );
    },
    when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
    excludeWhenCommandsExecuted: ["workbench.action.chat.queueMessage", "workbench.action.chat.steerWithMessage"]
  },
  {
    id: "tip.forkConversation",
    tier: "qol" /* Qol */,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, INSERT_FORK_CONVERSATION_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.forkConversation",
          'Use [{0}](command:{1} "Run /fork"){2} to branch the conversation. Explore a different approach without losing the original context.',
          "/fork",
          INSERT_FORK_CONVERSATION_COMMAND_ID,
          kb
        )
      );
    },
    excludeWhenCommandsExecuted: [
      INSERT_FORK_CONVERSATION_COMMAND_ID,
      "workbench.action.chat.forkConversation",
      TipTrackingCommands.ForkConversationUsed
    ]
  },
  {
    id: "tip.mermaid",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.mermaid", "Ask the agent to draw an architectural diagram or flow chart. It can render Mermaid diagrams directly in chat.")
      );
    },
    when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
    excludeWhenToolsInvoked: ["renderMermaidDiagram"]
  },
  {
    id: "tip.subagents",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize("tip.subagents", "Have another task to work on? Start a new session to run multiple agents at once.")
      );
    },
    when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
    excludeWhenToolsInvoked: ["runSubagent"]
  },
  {
    id: "tip.thinkingPhrases",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize(
          "tip.thinkingPhrases",
          'Customize the loading messages shown while the agent works with [{0}](command:workbench.action.openSettings?%5B%22{1}%22%5D "Open Settings").',
          "thinking phrases",
          ChatConfiguration.ThinkingPhrases
        )
      );
    },
    when: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
    excludeWhenSettingsChanged: [ChatConfiguration.ThinkingPhrases],
    dismissWhenCommandsClicked: ["workbench.action.openSettings"]
  },
  {
    id: "tip.autoAcceptDelay",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize(
          "tip.autoAcceptDelay",
          'Configure [{0}](command:workbench.action.openSettings?%5B%22chat.editing.autoAcceptDelay%22%5D "Open Settings") to automatically accept changes from the agent after a short countdown.',
          "auto-accept delay"
        )
      );
    },
    when: ContextKeyExpr.and(
      IsSessionsWindowContext.negate(),
      ContextKeyExpr.or(
        ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
        ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit)
      )
    ),
    excludeWhenSettingsChanged: ["chat.editing.autoAcceptDelay"],
    dismissWhenCommandsClicked: ["workbench.action.openSettings"]
  },
  {
    id: "tip.troubleshoot",
    tier: "qol" /* Qol */,
    buildMessage(ctx) {
      const kb = formatKeybinding(ctx, INSERT_TROUBLESHOOT_COMMAND_ID);
      return new MarkdownString(
        localize(
          "tip.troubleshoot",
          'Something not working? Type [{0}](command:{1} "Run /troubleshoot"){2} <question> to diagnose issues from debug logs.',
          "/troubleshoot",
          INSERT_TROUBLESHOOT_COMMAND_ID,
          kb
        )
      );
    },
    when: ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
    excludeWhenToolsInvoked: ["listDebugEvents"]
  },
  {
    id: "tip.agentsWindow",
    tier: "qol" /* Qol */,
    buildMessage(ctx) {
      const defaultMessage = localize(
        "tip.agentsWindow",
        'Work across multiple projects at once in the [Agents window](command:{0} "Open Agents Window").',
        OPEN_AGENTS_WINDOW_COMMAND_ID
      );
      const experimentalTemplate = ctx.experimentalTipMessages.get("openagentswindowtip" /* OpenAgentsWindowTip */);
      const message = experimentalTemplate ? experimentalTemplate.replace(/\{0\}/g, OPEN_AGENTS_WINDOW_COMMAND_ID) : defaultMessage;
      return new MarkdownString(message);
    },
    when: ContextKeyExpr.and(IsWebContext.negate(), OPEN_AGENTS_WINDOW_PRECONDITION),
    excludeWhenCommandsExecuted: [
      OPEN_AGENTS_WINDOW_COMMAND_ID,
      OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID
    ]
  },
  {
    id: "tip.copilotCli",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize(
          "tip.copilotCli",
          'Run agents in parallel with [Copilot CLI](command:workbench.action.chat.openNewChatSessionInPlace.copilotcli?%5B%22sidebar%22%5D "Switch to Copilot CLI").'
        )
      );
    },
    when: ContextKeyExpr.and(
      IsSessionsWindowContext.negate(),
      ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType),
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
      ChatContextKeys.hasCanDelegateProviders
    ),
    excludeWhenCommandsExecuted: ["workbench.action.chat.openNewChatSessionInPlace.copilotcli"]
  },
  {
    id: "tip.defaultPermissions",
    tier: "qol" /* Qol */,
    buildMessage() {
      return new MarkdownString(
        localize(
          "tip.defaultPermissions",
          'Configure [{0}](command:workbench.action.openSettings?%5B%22{1}%22%5D "Open Settings") to start new sessions in Bypass Approvals or Autopilot mode.',
          "default permissions",
          ChatConfiguration.DefaultPermissionLevel
        )
      );
    },
    when: ContextKeyExpr.or(
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Edit)
    ),
    excludeWhenSettingsChanged: [ChatConfiguration.DefaultPermissionLevel],
    dismissWhenCommandsClicked: ["workbench.action.openSettings"]
  }
];
export {
  ChatTipExperiment,
  ChatTipTier,
  TIP_CATALOG,
  extractCommandIds,
  getCommandLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRUaXBDYXRhbG9nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElzV2ViQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kLCBPUEVOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRCwgT1BFTl9BR0VOVFNfV0lORE9XX1BSRUNPTkRJVElPTiwgT1BFTl9XT1JLU1BBQ0VfSU5fQUdFTlRTX1dJTkRPV19DT01NQU5EX0lEIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGlwRXhjbHVzaW9uQ29uZmlnIH0gZnJvbSAnLi9jaGF0VGlwRWxpZ2liaWxpdHlUcmFja2VyLmpzJztcbmltcG9ydCB7IFRpcFRyYWNraW5nQ29tbWFuZHMgfSBmcm9tICcuL2NoYXRUaXBTdG9yYWdlS2V5cy5qcyc7XG5pbXBvcnQge1xuXHRHRU5FUkFURV9BR0VOVF9DT01NQU5EX0lELFxuXHRHRU5FUkFURV9BR0VOVF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCxcblx0R0VORVJBVEVfUFJPTVBUX0NPTU1BTkRfSUQsXG5cdEdFTkVSQVRFX1NLSUxMX0NPTU1BTkRfSUQsXG5cdElOU0VSVF9GT1JLX0NPTlZFUlNBVElPTl9DT01NQU5EX0lELFxuXHRJTlNFUlRfVFJPVUJMRVNIT09UX0NPTU1BTkRfSUQsXG59IGZyb20gJy4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIENoYXRUaXBUaWVyIHtcblx0Rm91bmRhdGlvbmFsID0gJ2ZvdW5kYXRpb25hbCcsXG5cdFFvbCA9ICdxb2wnLFxufVxuXG4vKipcbiAqIFRyZWF0bWVudCBuYW1lcyBmb3IgdGlwIG1lc3NhZ2VzIG92ZXJyaWRhYmxlIHZpYSB0aGUgd29ya2JlbmNoIGFzc2lnbm1lbnQgc2VydmljZS5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gQ2hhdFRpcEV4cGVyaW1lbnQge1xuXHRPcGVuQWdlbnRzV2luZG93VGlwID0gJ29wZW5hZ2VudHN3aW5kb3d0aXAnLFxufVxuXG4vKipcbiAqIENvbnRleHQgcHJvdmlkZWQgdG8gdGlwIGJ1aWxkZXJzIGZvciBkeW5hbWljIG1lc3NhZ2UgY29uc3RydWN0aW9uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUaXBCdWlsZENvbnRleHQge1xuXHQvKipcblx0ICogS2V5YmluZGluZyBzZXJ2aWNlIGZvciBsb29raW5nIHVwIGtleWJvYXJkIHNob3J0Y3V0cy5cblx0ICovXG5cdHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2U7XG5cdC8qKlxuXHQgKiBFeHBlcmltZW50YWwgdGlwIG1lc3NhZ2Ugb3ZlcnJpZGVzIGtleWVkIGJ5IHRyZWF0bWVudCBuYW1lIChzZWUge0BsaW5rIENoYXRUaXBFeHBlcmltZW50fSkuXG5cdCAqIEJ1aWxkZXJzIHNob3VsZCBmYWxsIGJhY2sgdG8gdGhlaXIgZGVmYXVsdCBsb2NhbGl6ZWQgc3RyaW5ncyB3aGVuIGEgdHJlYXRtZW50IGlzIG5vdCBzZXQuXG5cdCAqL1xuXHRyZWFkb25seSBleHBlcmltZW50YWxUaXBNZXNzYWdlczogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG4vKipcbiAqIEdldHMgdGhlIGRpc3BsYXkgbGFiZWwgZm9yIGEgY29tbWFuZCwgbG9va2luZyBpdCB1cCBmcm9tIE1lbnVSZWdpc3RyeS5cbiAqIEZhbGxzIGJhY2sgdG8gZXh0cmFjdGluZyBhIHJlYWRhYmxlIG5hbWUgZnJvbSB0aGUgY29tbWFuZCBJRC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENvbW1hbmRMYWJlbChjb21tYW5kSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGNvbW1hbmQgPSBNZW51UmVnaXN0cnkuZ2V0Q29tbWFuZChjb21tYW5kSWQpO1xuXHRpZiAoY29tbWFuZD8udGl0bGUpIHtcblx0XHQvLyBIYW5kbGUgYm90aCBzdHJpbmcgYW5kIElMb2NhbGl6ZWRTdHJpbmcgZm9ybWF0c1xuXHRcdHJldHVybiB0eXBlb2YgY29tbWFuZC50aXRsZSA9PT0gJ3N0cmluZycgPyBjb21tYW5kLnRpdGxlIDogY29tbWFuZC50aXRsZS52YWx1ZTtcblx0fVxuXHQvLyBGYWxsYmFjazogZXh0cmFjdCByZWFkYWJsZSBuYW1lIGZyb20gY29tbWFuZCBJRFxuXHQvLyBlLmcuLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5FZGl0U2Vzc2lvbicgLT4gJ29wZW5FZGl0U2Vzc2lvbidcblx0Y29uc3QgcGFydHMgPSBjb21tYW5kSWQuc3BsaXQoJy4nKTtcblx0cmV0dXJuIHBhcnRzW3BhcnRzLmxlbmd0aCAtIDFdO1xufVxuXG4vKipcbiAqIEZvcm1hdHMgYSBrZXliaW5kaW5nIGZvciBkaXNwbGF5IGluIGEgdGlwIG1lc3NhZ2UuXG4gKiBSZXR1cm5zIGVtcHR5IHN0cmluZyBpZiBubyBrZXliaW5kaW5nIGlzIGJvdW5kLlxuICovXG5mdW5jdGlvbiBmb3JtYXRLZXliaW5kaW5nKGN0eDogSVRpcEJ1aWxkQ29udGV4dCwgY29tbWFuZElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBrYiA9IGN0eC5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmRJZCk7XG5cdHJldHVybiBrYiA/IGAgKCR7a2IuZ2V0TGFiZWwoKX0pYCA6ICcnO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIGNvbW1hbmQgSURzIGZyb20gY29tbWFuZDogbGlua3MgaW4gYSBtYXJrZG93biBzdHJpbmcuXG4gKiBVc2VkIHRvIGF1dG9tYXRpY2FsbHkgcG9wdWxhdGUgZW5hYmxlZENvbW1hbmRzIGZvciB0cnVzdGVkIG1hcmtkb3duLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdENvbW1hbmRJZHMobWFya2Rvd246IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0Y29uc3QgY29tbWFuZFBhdHRlcm4gPSAvXFxbLio/XFxdXFwoY29tbWFuZDooW14/XFxzKV0rKS9nO1xuXHRjb25zdCBjb21tYW5kcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRsZXQgbWF0Y2g7XG5cdHdoaWxlICgobWF0Y2ggPSBjb21tYW5kUGF0dGVybi5leGVjKG1hcmtkb3duKSkgIT09IG51bGwpIHtcblx0XHRjb21tYW5kcy5hZGQobWF0Y2hbMV0pO1xuXHR9XG5cdHJldHVybiBbLi4uY29tbWFuZHNdO1xufVxuXG4vKipcbiAqIEludGVyZmFjZSBmb3IgdGlwIGRlZmluaXRpb25zIGluIHRoZSBjYXRhbG9nLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUaXBEZWZpbml0aW9uIGV4dGVuZHMgSVRpcEV4Y2x1c2lvbkNvbmZpZyB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpZXI6IENoYXRUaXBUaWVyO1xuXHQvKipcblx0ICogT3B0aW9uYWwgcHJpb3JpdHkgZm9yIG9yZGVyaW5nIHRpcHMgd2l0aGluIHRoZSBzYW1lIHRpZXIuXG5cdCAqIExvd2VyIHZhbHVlcyBhcmUgc2hvd24gZmlyc3QuXG5cdCAqL1xuXHRyZWFkb25seSBwcmlvcml0eT86IG51bWJlcjtcblx0LyoqXG5cdCAqIEJ1aWxkcyB0aGUgdGlwIG1lc3NhZ2UgZHluYW1pY2FsbHkgYXQgcnVudGltZS5cblx0ICogVGhpcyBlbmFibGVzIGtleWJpbmRpbmdzIGFuZCBjb21tYW5kIGxhYmVscyB0byBiZSBsb29rZWQgdXAgZnJlc2guXG5cdCAqIFRoZSByZXR1cm5lZCBNYXJrZG93blN0cmluZyBzaG91bGQgTk9UIGluY2x1ZGUgdGhlIFwiVGlwOlwiIHByZWZpeC5cblx0ICovXG5cdGJ1aWxkTWVzc2FnZShjdHg6IElUaXBCdWlsZENvbnRleHQpOiBNYXJrZG93blN0cmluZztcblx0LyoqXG5cdCAqIFdoZW4gY2xhdXNlIGV4cHJlc3Npb24gdGhhdCBkZXRlcm1pbmVzIGlmIHRoaXMgdGlwIGlzIGVsaWdpYmxlIHRvIGJlIHNob3duLlxuXHQgKi9cblx0cmVhZG9ubHkgd2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHQvKipcblx0ICogQ29tbWFuZCBJRHMgdGhhdCBtdXN0IGJlIHJlZ2lzdGVyZWQgZm9yIHRoaXMgdGlwIHRvIGJlIGVsaWdpYmxlLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVxdWlyZXNDb21tYW5kcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHQvKipcblx0ICogQ2hhdCBtb2RlIG5hbWVzIHRoYXQgbXVzdCBiZSBhdmFpbGFibGUgaW4gdGhlIGN1cnJlbnQgd2lkZ2V0IGZvciB0aGlzIHRpcCB0b1xuXHQgKiBiZSBlbGlnaWJsZS5cblx0ICovXG5cdHJlYWRvbmx5IHJlcXVpcmVzTW9kZU5hbWVzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKlxuXHQgKiBDaGF0IG1vZGVsIElEcyBmb3Igd2hpY2ggdGhpcyB0aXAgaXMgZWxpZ2libGUgKGxvd2VyY2FzZSkuXG5cdCAqL1xuXHRyZWFkb25seSBvbmx5V2hlbk1vZGVsSWRzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKlxuXHQgKiBTZXR0aW5nIGtleXMgdGhhdCwgaWYgY2hhbmdlZCBmcm9tIGRlZmF1bHQsIG1ha2UgdGhpcyB0aXAgaW5lbGlnaWJsZS5cblx0ICovXG5cdHJlYWRvbmx5IGV4Y2x1ZGVXaGVuU2V0dGluZ3NDaGFuZ2VkPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKlxuXHQgKiBDb21tYW5kIElEcyB0aGF0IGRpc21pc3MgdGhpcyB0aXAgd2hlbiBjbGlja2VkIGZyb20gdGhlIHRpcCBtYXJrZG93bi5cblx0ICovXG5cdHJlYWRvbmx5IGRpc21pc3NXaGVuQ29tbWFuZHNDbGlja2VkPzogcmVhZG9ubHkgc3RyaW5nW107XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBUaXAgQ2F0YWxvZ1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBTdGF0aWMgY2F0YWxvZyBvZiB0aXBzLiBUaXBzIGFyZSBidWlsdCBkeW5hbWljYWxseSBhdCBydW50aW1lIHRvIGVuYWJsZVxuICoga2V5YmluZGluZ3MgYW5kIGNvbW1hbmQgbGFiZWxzIHRvIGJlIHJlc29sdmVkIGZyZXNoLlxuICovXG5leHBvcnQgY29uc3QgVElQX0NBVEFMT0c6IHJlYWRvbmx5IElUaXBEZWZpbml0aW9uW10gPSBbXG5cdHtcblx0XHRpZDogJ3RpcC5zd2l0Y2hUb0F1dG8nLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLkZvdW5kYXRpb25hbCxcblx0XHRwcmlvcml0eTogMCxcblx0XHRidWlsZE1lc3NhZ2UoX2N0eCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC5zd2l0Y2hUb0F1dG8nLFxuXHRcdFx0XHRcdFwiVXNpbmcgR1BULTQuMT8gVHJ5IHN3aXRjaGluZyB0byBbQXV0b10oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk1vZGVsUGlja2VyIFxcXCJPcGVuIE1vZGVsIFBpY2tlclxcXCIpIGluIHRoZSBtb2RlbCBwaWNrZXIgZm9yIGJldHRlciBjb2RpbmcgcGVyZm9ybWFuY2UuXCJcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdG9ubHlXaGVuTW9kZWxJZHM6IFsnZ3B0LTQuMSddLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAuaW5pdCcsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuRm91bmRhdGlvbmFsLFxuXHRcdHByaW9yaXR5OiA1MCxcblx0XHRidWlsZE1lc3NhZ2UoY3R4KSB7XG5cdFx0XHRjb25zdCBrYiA9IGZvcm1hdEtleWJpbmRpbmcoY3R4LCBHRU5FUkFURV9BR0VOVF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCk7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQndGlwLmluaXQnLFxuXHRcdFx0XHRcdFwiVXNlIFt7MH1dKGNvbW1hbmQ6ezF9IFxcXCJSdW4gL2luaXRcXFwiKXsyfSB0byBnZW5lcmF0ZSBvciB1cGRhdGUgYSB3b3Jrc3BhY2UgaW5zdHJ1Y3Rpb25zIGZpbGUgZm9yIEFJIGNvZGluZyBhZ2VudHMuXCIsXG5cdFx0XHRcdFx0Jy9pbml0Jyxcblx0XHRcdFx0XHRHRU5FUkFURV9BR0VOVF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCxcblx0XHRcdFx0XHRrYlxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5pc0VxdWFsVG8obG9jYWxDaGF0U2Vzc2lvblR5cGUpLFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogW1xuXHRcdFx0R0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsXG5cdFx0XHRUaXBUcmFja2luZ0NvbW1hbmRzLkNyZWF0ZUFnZW50SW5zdHJ1Y3Rpb25zVXNlZCxcblx0XHRdLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAuY3JlYXRlUHJvbXB0Jyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Gb3VuZGF0aW9uYWwsXG5cdFx0YnVpbGRNZXNzYWdlKGN0eCkge1xuXHRcdFx0Y29uc3Qga2IgPSBmb3JtYXRLZXliaW5kaW5nKGN0eCwgR0VORVJBVEVfUFJPTVBUX0NPTU1BTkRfSUQpO1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC5jcmVhdGVQcm9tcHQnLFxuXHRcdFx0XHRcdFwiVXNlIFt7MH1dKGNvbW1hbmQ6ezF9IFxcXCJSdW4gL2NyZWF0ZS1wcm9tcHRcXFwiKXsyfSB0byBnZW5lcmF0ZSBhIHJldXNhYmxlIHByb21wdCBmaWxlIHdpdGggdGhlIGFnZW50LlwiLFxuXHRcdFx0XHRcdCcvY3JlYXRlLXByb21wdCcsXG5cdFx0XHRcdFx0R0VORVJBVEVfUFJPTVBUX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0a2Jcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKGxvY2FsQ2hhdFNlc3Npb25UeXBlKSxcblx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFtcblx0XHRcdEdFTkVSQVRFX1BST01QVF9DT01NQU5EX0lELFxuXHRcdFx0VGlwVHJhY2tpbmdDb21tYW5kcy5DcmVhdGVQcm9tcHRVc2VkLFxuXHRcdF0sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5jcmVhdGVBZ2VudCcsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuRm91bmRhdGlvbmFsLFxuXHRcdHByaW9yaXR5OiAzMCxcblx0XHRidWlsZE1lc3NhZ2UoY3R4KSB7XG5cdFx0XHRjb25zdCBrYiA9IGZvcm1hdEtleWJpbmRpbmcoY3R4LCBHRU5FUkFURV9BR0VOVF9DT01NQU5EX0lEKTtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdCd0aXAuY3JlYXRlQWdlbnQnLFxuXHRcdFx0XHRcdFwiVXNlIFt7MH1dKGNvbW1hbmQ6ezF9IFxcXCJSdW4gL2NyZWF0ZS1hZ2VudFxcXCIpezJ9IHRvIHNjYWZmb2xkIGEgY3VzdG9tIGFnZW50IGZvciB5b3VyIHdvcmtmbG93LlwiLFxuXHRcdFx0XHRcdCcvY3JlYXRlLWFnZW50Jyxcblx0XHRcdFx0XHRHRU5FUkFURV9BR0VOVF9DT01NQU5EX0lELFxuXHRcdFx0XHRcdGtiXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fSxcblx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmlzRXF1YWxUbyhsb2NhbENoYXRTZXNzaW9uVHlwZSksXG5cdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbXG5cdFx0XHRHRU5FUkFURV9BR0VOVF9DT01NQU5EX0lELFxuXHRcdFx0VGlwVHJhY2tpbmdDb21tYW5kcy5DcmVhdGVBZ2VudFVzZWQsXG5cdFx0XSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLmNyZWF0ZVNraWxsJyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Gb3VuZGF0aW9uYWwsXG5cdFx0cHJpb3JpdHk6IDQwLFxuXHRcdGJ1aWxkTWVzc2FnZShjdHgpIHtcblx0XHRcdGNvbnN0IGtiID0gZm9ybWF0S2V5YmluZGluZyhjdHgsIEdFTkVSQVRFX1NLSUxMX0NPTU1BTkRfSUQpO1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC5jcmVhdGVTa2lsbCcsXG5cdFx0XHRcdFx0XCJVc2UgW3swfV0oY29tbWFuZDp7MX0gXFxcIlJ1biAvY3JlYXRlLXNraWxsXFxcIil7Mn0gdG8gY3JlYXRlIGEgc2tpbGwgdGhlIGFnZW50IGNhbiBsb2FkIHdoZW4gcmVsZXZhbnQuXCIsXG5cdFx0XHRcdFx0Jy9jcmVhdGUtc2tpbGwnLFxuXHRcdFx0XHRcdEdFTkVSQVRFX1NLSUxMX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0a2Jcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKGxvY2FsQ2hhdFNlc3Npb25UeXBlKSxcblx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFtcblx0XHRcdEdFTkVSQVRFX1NLSUxMX0NPTU1BTkRfSUQsXG5cdFx0XHRUaXBUcmFja2luZ0NvbW1hbmRzLkNyZWF0ZVNraWxsVXNlZCxcblx0XHRdLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAucGxhbk1vZGUnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLkZvdW5kYXRpb25hbCxcblx0XHRwcmlvcml0eTogMjAsXG5cdFx0YnVpbGRNZXNzYWdlKGN0eCkge1xuXHRcdFx0Y29uc3Qga2IgPSBmb3JtYXRLZXliaW5kaW5nKGN0eCwgJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuUGxhbicpO1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC5wbGFuTW9kZScsXG5cdFx0XHRcdFx0XCJUcnkgdGhlIFt7MH1dKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4/JTVCJTdCJTIybW9kZSUyMiUzQSUyMlBsYW4lMjIlN0QlNUQgXFxcIlN0YXJ0IFBsYW4gTW9kZVxcXCIpezF9IHRvIHJlc2VhcmNoIGFuZCBwbGFuIGJlZm9yZSBpbXBsZW1lbnRpbmcgY2hhbmdlcy5cIixcblx0XHRcdFx0XHQnUGxhbiBhZ2VudCcsXG5cdFx0XHRcdFx0a2Jcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZU5hbWUubm90RXF1YWxzVG8oJ1BsYW4nKSxcblx0XHRyZXF1aXJlc01vZGVOYW1lczogWydQbGFuJ10sXG5cdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuUGxhbiddLFxuXHRcdGV4Y2x1ZGVXaGVuTW9kZXNVc2VkOiBbJ1BsYW4nXSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLmF0dGFjaEZpbGVzJyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0YnVpbGRNZXNzYWdlKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoJ3RpcC5hdHRhY2hGaWxlcycsIFwiUmVmZXJlbmNlIGZpbGVzIG9yIGZvbGRlcnMgd2l0aCAjIHRvIGdpdmUgdGhlIGFnZW50IG1vcmUgY29udGV4dCBhYm91dCB0aGUgdGFzay5cIilcblx0XHRcdCk7XG5cdFx0fSxcblx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFtcblx0XHRcdCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYXR0YWNoQ29udGV4dCcsXG5cdFx0XHQnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmF0dGFjaEZpbGUnLFxuXHRcdFx0J3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hGb2xkZXInLFxuXHRcdFx0J3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hdHRhY2hTZWxlY3Rpb24nLFxuXHRcdFx0VGlwVHJhY2tpbmdDb21tYW5kcy5BdHRhY2hGaWxlc1JlZmVyZW5jZVVzZWQsXG5cdFx0XSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLmNvZGVBY3Rpb25zJyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0YnVpbGRNZXNzYWdlKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoJ3RpcC5jb2RlQWN0aW9ucycsIFwiU2VsZWN0IGEgY29kZSBibG9jayBpbiB0aGUgZWRpdG9yIGFuZCByaWdodC1jbGljayB0byBhY2Nlc3MgbW9yZSBBSSBhY3Rpb25zLlwiKVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogWydpbmxpbmVDaGF0LnN0YXJ0J10sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC51bmRvQ2hhbmdlcycsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuUW9sLFxuXHRcdGJ1aWxkTWVzc2FnZSgpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKCd0aXAudW5kb0NoYW5nZXMnLCBcIkhvdmVyIGEgcHJldmlvdXMgcmVxdWVzdCBhbmQgc2VsZWN0IFxcXCJSZXN0b3JlIENoZWNrcG9pbnRcXFwiIHRvIHVuZG8gY2hhbmdlcyBhZnRlciB0aGF0IHBvaW50IGluIHRoZSBjaGF0IGNvbnZlcnNhdGlvbi5cIilcblx0XHRcdCk7XG5cdFx0fSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmlzRXF1YWxUbyhsb2NhbENoYXRTZXNzaW9uVHlwZSksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFnZW50KSxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkVkaXQpLFxuXHRcdFx0KSxcblx0XHQpLFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogWyd3b3JrYmVuY2guYWN0aW9uLmNoYXQucmVzdG9yZUNoZWNrcG9pbnQnLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc3RvcmVMYXN0Q2hlY2twb2ludCddLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAubWVzc2FnZVF1ZXVlaW5nJyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0YnVpbGRNZXNzYWdlKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoJ3RpcC5tZXNzYWdlUXVldWVpbmcnLCBcIlN0ZWVyIHRoZSBhZ2VudCBtaWQtdGFzayBieSBzZW5kaW5nIGZvbGxvdy11cCBtZXNzYWdlcy4gVGhleSBxdWV1ZSBhbmQgYXBwbHkgaW4gb3JkZXIuXCIpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFnZW50KSxcblx0XHRleGNsdWRlV2hlbkNvbW1hbmRzRXhlY3V0ZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnF1ZXVlTWVzc2FnZScsICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3RlZXJXaXRoTWVzc2FnZSddLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAuZm9ya0NvbnZlcnNhdGlvbicsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuUW9sLFxuXHRcdGJ1aWxkTWVzc2FnZShjdHgpIHtcblx0XHRcdGNvbnN0IGtiID0gZm9ybWF0S2V5YmluZGluZyhjdHgsIElOU0VSVF9GT1JLX0NPTlZFUlNBVElPTl9DT01NQU5EX0lEKTtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdCd0aXAuZm9ya0NvbnZlcnNhdGlvbicsXG5cdFx0XHRcdFx0XCJVc2UgW3swfV0oY29tbWFuZDp7MX0gXFxcIlJ1biAvZm9ya1xcXCIpezJ9IHRvIGJyYW5jaCB0aGUgY29udmVyc2F0aW9uLiBFeHBsb3JlIGEgZGlmZmVyZW50IGFwcHJvYWNoIHdpdGhvdXQgbG9zaW5nIHRoZSBvcmlnaW5hbCBjb250ZXh0LlwiLFxuXHRcdFx0XHRcdCcvZm9yaycsXG5cdFx0XHRcdFx0SU5TRVJUX0ZPUktfQ09OVkVSU0FUSU9OX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0a2Jcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogW1xuXHRcdFx0SU5TRVJUX0ZPUktfQ09OVkVSU0FUSU9OX0NPTU1BTkRfSUQsXG5cdFx0XHQnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmZvcmtDb252ZXJzYXRpb24nLFxuXHRcdFx0VGlwVHJhY2tpbmdDb21tYW5kcy5Gb3JrQ29udmVyc2F0aW9uVXNlZCxcblx0XHRdLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAubWVybWFpZCcsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuUW9sLFxuXHRcdGJ1aWxkTWVzc2FnZSgpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKCd0aXAubWVybWFpZCcsIFwiQXNrIHRoZSBhZ2VudCB0byBkcmF3IGFuIGFyY2hpdGVjdHVyYWwgZGlhZ3JhbSBvciBmbG93IGNoYXJ0LiBJdCBjYW4gcmVuZGVyIE1lcm1haWQgZGlhZ3JhbXMgZGlyZWN0bHkgaW4gY2hhdC5cIilcblx0XHRcdCk7XG5cdFx0fSxcblx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpLFxuXHRcdGV4Y2x1ZGVXaGVuVG9vbHNJbnZva2VkOiBbJ3JlbmRlck1lcm1haWREaWFncmFtJ10sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5zdWJhZ2VudHMnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLlFvbCxcblx0XHRidWlsZE1lc3NhZ2UoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZSgndGlwLnN1YmFnZW50cycsIFwiSGF2ZSBhbm90aGVyIHRhc2sgdG8gd29yayBvbj8gU3RhcnQgYSBuZXcgc2Vzc2lvbiB0byBydW4gbXVsdGlwbGUgYWdlbnRzIGF0IG9uY2UuXCIpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFnZW50KSxcblx0XHRleGNsdWRlV2hlblRvb2xzSW52b2tlZDogWydydW5TdWJhZ2VudCddLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAudGhpbmtpbmdQaHJhc2VzJyxcblx0XHR0aWVyOiBDaGF0VGlwVGllci5Rb2wsXG5cdFx0YnVpbGRNZXNzYWdlKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdFx0J3RpcC50aGlua2luZ1BocmFzZXMnLFxuXHRcdFx0XHRcdFwiQ3VzdG9taXplIHRoZSBsb2FkaW5nIG1lc3NhZ2VzIHNob3duIHdoaWxlIHRoZSBhZ2VudCB3b3JrcyB3aXRoIFt7MH1dKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JTVCJTIyezF9JTIyJTVEIFxcXCJPcGVuIFNldHRpbmdzXFxcIikuXCIsXG5cdFx0XHRcdFx0J3RoaW5raW5nIHBocmFzZXMnLFxuXHRcdFx0XHRcdENoYXRDb25maWd1cmF0aW9uLlRoaW5raW5nUGhyYXNlc1xuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFnZW50KSxcblx0XHRleGNsdWRlV2hlblNldHRpbmdzQ2hhbmdlZDogW0NoYXRDb25maWd1cmF0aW9uLlRoaW5raW5nUGhyYXNlc10sXG5cdFx0ZGlzbWlzc1doZW5Db21tYW5kc0NsaWNrZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnXSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLmF1dG9BY2NlcHREZWxheScsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuUW9sLFxuXHRcdGJ1aWxkTWVzc2FnZSgpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdCd0aXAuYXV0b0FjY2VwdERlbGF5Jyxcblx0XHRcdFx0XHRcIkNvbmZpZ3VyZSBbezB9XShjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzPyU1QiUyMmNoYXQuZWRpdGluZy5hdXRvQWNjZXB0RGVsYXklMjIlNUQgXFxcIk9wZW4gU2V0dGluZ3NcXFwiKSB0byBhdXRvbWF0aWNhbGx5IGFjY2VwdCBjaGFuZ2VzIGZyb20gdGhlIGFnZW50IGFmdGVyIGEgc2hvcnQgY291bnRkb3duLlwiLFxuXHRcdFx0XHRcdCdhdXRvLWFjY2VwdCBkZWxheSdcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQuaXNFcXVhbFRvKENoYXRNb2RlS2luZC5BZ2VudCksXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQuaXNFcXVhbFRvKENoYXRNb2RlS2luZC5FZGl0KSxcblx0XHRcdCksXG5cdFx0KSxcblx0XHRleGNsdWRlV2hlblNldHRpbmdzQ2hhbmdlZDogWydjaGF0LmVkaXRpbmcuYXV0b0FjY2VwdERlbGF5J10sXG5cdFx0ZGlzbWlzc1doZW5Db21tYW5kc0NsaWNrZWQ6IFsnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnXSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLnRyb3VibGVzaG9vdCcsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuUW9sLFxuXHRcdGJ1aWxkTWVzc2FnZShjdHgpIHtcblx0XHRcdGNvbnN0IGtiID0gZm9ybWF0S2V5YmluZGluZyhjdHgsIElOU0VSVF9UUk9VQkxFU0hPT1RfQ09NTUFORF9JRCk7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQndGlwLnRyb3VibGVzaG9vdCcsXG5cdFx0XHRcdFx0XCJTb21ldGhpbmcgbm90IHdvcmtpbmc/IFR5cGUgW3swfV0oY29tbWFuZDp7MX0gXFxcIlJ1biAvdHJvdWJsZXNob290XFxcIil7Mn0gPHF1ZXN0aW9uPiB0byBkaWFnbm9zZSBpc3N1ZXMgZnJvbSBkZWJ1ZyBsb2dzLlwiLFxuXHRcdFx0XHRcdCcvdHJvdWJsZXNob290Jyxcblx0XHRcdFx0XHRJTlNFUlRfVFJPVUJMRVNIT09UX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0a2Jcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKGxvY2FsQ2hhdFNlc3Npb25UeXBlKSxcblx0XHRleGNsdWRlV2hlblRvb2xzSW52b2tlZDogWydsaXN0RGVidWdFdmVudHMnXSxcblx0fSxcblx0e1xuXHRcdGlkOiAndGlwLmFnZW50c1dpbmRvdycsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuUW9sLFxuXHRcdGJ1aWxkTWVzc2FnZShjdHgpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRNZXNzYWdlID0gbG9jYWxpemUoXG5cdFx0XHRcdCd0aXAuYWdlbnRzV2luZG93Jyxcblx0XHRcdFx0XCJXb3JrIGFjcm9zcyBtdWx0aXBsZSBwcm9qZWN0cyBhdCBvbmNlIGluIHRoZSBbQWdlbnRzIHdpbmRvd10oY29tbWFuZDp7MH0gXFxcIk9wZW4gQWdlbnRzIFdpbmRvd1xcXCIpLlwiLFxuXHRcdFx0XHRPUEVOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGV4cGVyaW1lbnRhbFRlbXBsYXRlID0gY3R4LmV4cGVyaW1lbnRhbFRpcE1lc3NhZ2VzLmdldChDaGF0VGlwRXhwZXJpbWVudC5PcGVuQWdlbnRzV2luZG93VGlwKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBleHBlcmltZW50YWxUZW1wbGF0ZVxuXHRcdFx0XHQ/IGV4cGVyaW1lbnRhbFRlbXBsYXRlLnJlcGxhY2UoL1xcezBcXH0vZywgT1BFTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQpXG5cdFx0XHRcdDogZGVmYXVsdE1lc3NhZ2U7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UpO1xuXHRcdH0sXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzV2ViQ29udGV4dC5uZWdhdGUoKSwgT1BFTl9BR0VOVFNfV0lORE9XX1BSRUNPTkRJVElPTiksXG5cdFx0ZXhjbHVkZVdoZW5Db21tYW5kc0V4ZWN1dGVkOiBbXG5cdFx0XHRPUEVOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRCxcblx0XHRcdE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRCxcblx0XHRdLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0aXAuY29waWxvdENsaScsXG5cdFx0dGllcjogQ2hhdFRpcFRpZXIuUW9sLFxuXHRcdGJ1aWxkTWVzc2FnZSgpIHtcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdCd0aXAuY29waWxvdENsaScsXG5cdFx0XHRcdFx0XCJSdW4gYWdlbnRzIGluIHBhcmFsbGVsIHdpdGggW0NvcGlsb3QgQ0xJXShjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTmV3Q2hhdFNlc3Npb25JblBsYWNlLmNvcGlsb3RjbGk/JTVCJTIyc2lkZWJhciUyMiU1RCBcXFwiU3dpdGNoIHRvIENvcGlsb3QgQ0xJXFxcIikuXCJcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9LFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5pc0VxdWFsVG8obG9jYWxDaGF0U2Vzc2lvblR5cGUpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFnZW50KSxcblx0XHRcdENoYXRDb250ZXh0S2V5cy5oYXNDYW5EZWxlZ2F0ZVByb3ZpZGVycyxcblx0XHQpLFxuXHRcdGV4Y2x1ZGVXaGVuQ29tbWFuZHNFeGVjdXRlZDogWyd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk5ld0NoYXRTZXNzaW9uSW5QbGFjZS5jb3BpbG90Y2xpJ10sXG5cdH0sXG5cdHtcblx0XHRpZDogJ3RpcC5kZWZhdWx0UGVybWlzc2lvbnMnLFxuXHRcdHRpZXI6IENoYXRUaXBUaWVyLlFvbCxcblx0XHRidWlsZE1lc3NhZ2UoKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQndGlwLmRlZmF1bHRQZXJtaXNzaW9ucycsXG5cdFx0XHRcdFx0XCJDb25maWd1cmUgW3swfV0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncz8lNUIlMjJ7MX0lMjIlNUQgXFxcIk9wZW4gU2V0dGluZ3NcXFwiKSB0byBzdGFydCBuZXcgc2Vzc2lvbnMgaW4gQnlwYXNzIEFwcHJvdmFscyBvciBBdXRvcGlsb3QgbW9kZS5cIixcblx0XHRcdFx0XHQnZGVmYXVsdCBwZXJtaXNzaW9ucycsXG5cdFx0XHRcdFx0Q2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFBlcm1pc3Npb25MZXZlbFxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH0sXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkVkaXQpLFxuXHRcdCksXG5cdFx0ZXhjbHVkZVdoZW5TZXR0aW5nc0NoYW5nZWQ6IFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0UGVybWlzc2lvbkxldmVsXSxcblx0XHRkaXNtaXNzV2hlbkNvbW1hbmRzQ2xpY2tlZDogWyd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncyddLFxuXHR9LFxuXTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JB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
