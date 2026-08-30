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
import { timeout } from "../../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { appendEscapedMarkdownInlineCode, createCommandUri, isMarkdownString, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { CommandsRegistry } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { IChatService } from "../../../../chat/common/chatService/chatService.js";
import { ToolDataSource } from "../../../../chat/common/tools/languageModelToolsService.js";
import { ITerminalChatService, ITerminalService } from "../../../../terminal/browser/terminal.js";
import { getOutput } from "../outputHelpers.js";
import { buildCommandDisplayText, isMultilineCommand, normalizeCommandForExecution } from "../runInTerminalHelpers.js";
import { RunInTerminalTool } from "./runInTerminalTool.js";
import { isSessionAutoApproveLevel } from "./terminalToolAutoApprove.js";
import { TerminalToolId } from "./toolIds.js";
const SendToTerminalToolData = {
  id: TerminalToolId.SendToTerminal,
  toolReferenceName: "sendToTerminal",
  displayName: localize("sendToTerminalTool.displayName", "Send to Terminal"),
  modelDescription: `Send input text to an active terminal execution (identified by the \`id\` returned from ${TerminalToolId.RunInTerminal}). The 'command' field may be empty or whitespace to press Enter (useful for interactive prompts). By default, returns the last 20 lines of terminal output captured shortly after sending. Set 'waitForOutput' to true for interactive programs (games, REPLs, etc.) to wait until the terminal becomes idle before returning output \u2014 this gives you the program's response to your input.`,
  icon: Codicon.terminal,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: `The ID of an active terminal execution to send a command to (returned by ${TerminalToolId.RunInTerminal} for async executions, or for sync executions that timed out and were moved to the background).`,
        pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
      },
      command: {
        type: "string",
        description: "The input text to send to the terminal. The text is sent followed by Enter. Provide an empty or whitespace string to send just Enter (for interactive prompts)."
      },
      waitForOutput: {
        type: "boolean",
        description: "When true, waits for the terminal to become idle (no new output for a short period) before returning, instead of returning immediately. Use this for interactive programs where you need to see the full response to your input. Defaults to false."
      }
    },
    required: [
      "id",
      "command"
    ]
  }
};
function isCancelSignal(command) {
  return /^[\u0003\u0004\u001c]$/.test(command.trim());
}
const FocusTerminalByIdCommandId = "workbench.action.terminal.chat.focusTerminalById";
CommandsRegistry.registerCommand(FocusTerminalByIdCommandId, async (accessor, instanceId) => {
  const terminalService = accessor.get(ITerminalService);
  const instance = terminalService.getInstanceFromId(instanceId);
  if (instance) {
    terminalService.setActiveInstance(instance);
    await terminalService.revealActiveTerminal();
    instance.focus();
  }
});
const FocusTerminalByExecutionIdCommandId = "workbench.action.terminal.chat.focusTerminalByExecutionId";
CommandsRegistry.registerCommand(FocusTerminalByExecutionIdCommandId, async (accessor, executionId) => {
  const execution = RunInTerminalTool.getExecution(executionId);
  if (execution) {
    const terminalService = accessor.get(ITerminalService);
    terminalService.setActiveInstance(execution.instance);
    await terminalService.revealActiveTerminal();
    execution.instance.focus();
  }
});
let SendToTerminalTool = class extends Disposable {
  constructor(_configurationService, _chatService, _chatWidgetService, _terminalChatService) {
    super();
    this._configurationService = _configurationService;
    this._chatService = _chatService;
    this._chatWidgetService = _chatWidgetService;
    this._terminalChatService = _terminalChatService;
  }
  async prepareToolInvocation(context, _token) {
    const args = context.parameters;
    const isEmptyInput = !args.command || !args.command.trim();
    const terminalLabel = this._getTerminalLabel(args);
    const invocationMessage = new MarkdownString();
    const pastTenseMessage = new MarkdownString();
    const questionText = this._getQuestionContextForTerminal(context.chatSessionResource, args);
    if (isEmptyInput) {
      invocationMessage.appendMarkdown(localize("send.progressive.enter", "Pressing `Enter` in terminal"));
      pastTenseMessage.appendMarkdown(localize("send.past.enter", "Pressed `Enter` in terminal"));
    } else {
      const displayCommand = buildCommandDisplayText(args.command);
      const safeInlineCode = appendEscapedMarkdownInlineCode(displayCommand);
      invocationMessage.appendMarkdown(localize("send.progressive", "Sending {0} to terminal", safeInlineCode));
      pastTenseMessage.appendMarkdown(localize("send.past", "Sent {0} to terminal", safeInlineCode));
    }
    if (questionText) {
      const replyPrefix = ` (${localize("send.replyingTo", "replying to: ")}`;
      invocationMessage.appendMarkdown(replyPrefix);
      invocationMessage.appendText(questionText);
      invocationMessage.appendMarkdown(")");
      pastTenseMessage.appendMarkdown(replyPrefix);
      pastTenseMessage.appendText(questionText);
      pastTenseMessage.appendMarkdown(")");
    }
    const instanceId = this._getTerminalInstanceId(args);
    const confirmationMessage = new MarkdownString("", { isTrusted: { enabledCommands: [FocusTerminalByIdCommandId] } });
    const safeTerminalLabel = appendEscapedMarkdownInlineCode(terminalLabel);
    const baseMessage = isEmptyInput ? localize("send.confirm.message.enter", "Press `Enter` in terminal {0}", safeTerminalLabel) : localize("send.confirm.message", "Run {0} in terminal {1}", appendEscapedMarkdownInlineCode(buildCommandDisplayText(args.command)), safeTerminalLabel);
    if (instanceId !== void 0) {
      const focusUri = createCommandUri(FocusTerminalByIdCommandId, instanceId);
      confirmationMessage.appendMarkdown(`${baseMessage} \u2014 [${localize("focusTerminal", "Focus Terminal")}](${focusUri})`);
    } else {
      confirmationMessage.appendMarkdown(baseMessage);
    }
    const chatSessionResource = context.chatSessionResource;
    const isSessionAutoApproved = chatSessionResource && (isSessionAutoApproveLevel(chatSessionResource, this._configurationService, this._chatWidgetService, this._chatService) || this._terminalChatService.hasChatSessionAutoApproval(chatSessionResource));
    const isAnsweringQuestion = questionText !== void 0;
    const shouldShowConfirmation = !isSessionAutoApproved && !isAnsweringQuestion || context.forceConfirmationReason !== void 0;
    const confirmationMessages = shouldShowConfirmation ? {
      title: localize("send.confirm.title", "Send to Terminal"),
      message: confirmationMessage,
      allowAutoConfirm: void 0
    } : void 0;
    return {
      invocationMessage,
      pastTenseMessage,
      confirmationMessages
    };
  }
  /**
   * Returns a human-friendly label for the target terminal, using the
   * terminal instance title (which reflects the running process) instead
   * of the raw UUID or numeric id.
   */
  _getTerminalLabel(args) {
    if (args.id) {
      const execution = RunInTerminalTool.getExecution(args.id);
      if (execution) {
        return execution.instance.title;
      }
    }
    return args.id ?? "";
  }
  /**
   * Returns the numeric terminal instanceId for the target terminal, used
   * to build command URIs for the "Focus Terminal" link.
   */
  _getTerminalInstanceId(args) {
    if (args.id) {
      const execution = RunInTerminalTool.getExecution(args.id);
      if (execution) {
        return execution.instance.instanceId;
      }
    }
    return void 0;
  }
  /**
   * Searches the current session's responses for the most recent question
   * carousel associated with the target terminal, then uses positional
   * matching to return the specific question that this send_to_terminal
   * call is answering.
   *
   * When a carousel contains multiple questions, the model calls
   * send_to_terminal once per answer in order. This method counts prior
   * send_to_terminal invocations since the carousel to determine the
   * current question index, then verifies the command matches the answer
   * at that position.
   */
  _getQuestionContextForTerminal(chatSessionResource, args) {
    if (!chatSessionResource) {
      return void 0;
    }
    const model = this._chatService.getSession(chatSessionResource);
    if (!model) {
      return void 0;
    }
    if (!args.id) {
      return void 0;
    }
    const commandText = args.command?.trim();
    const requests = model.getRequests();
    for (let i = requests.length - 1; i >= 0; i--) {
      const response = requests[i].response;
      if (!response) {
        continue;
      }
      const parts = response.response.value;
      let carouselIndex = -1;
      let carousel;
      for (let j = parts.length - 1; j >= 0; j--) {
        const part = parts[j];
        if (part.kind === "questionCarousel") {
          const candidate = part;
          if (!candidate.terminalId || candidate.questions.length === 0) {
            continue;
          }
          if (candidate.terminalId === args.id) {
            carouselIndex = j;
            carousel = candidate;
            break;
          }
        }
      }
      if (!carousel || carouselIndex === -1) {
        continue;
      }
      let sendCount = 0;
      for (let j = carouselIndex + 1; j < parts.length; j++) {
        if (parts[j].kind === "toolInvocation" && parts[j].toolId === TerminalToolId.SendToTerminal) {
          sendCount++;
        }
      }
      const questionIndex = sendCount;
      if (questionIndex >= carousel.questions.length) {
        return void 0;
      }
      const question = carousel.questions[questionIndex];
      if (carousel.data) {
        const answer = carousel.data[question.id];
        if (this._answerMatchesCommand(answer, commandText)) {
          return this._getQuestionText(question);
        }
      }
      return void 0;
    }
    return void 0;
  }
  _getQuestionText(question) {
    const text = question.message ?? question.title;
    return isMarkdownString(text) ? text.value : text;
  }
  /**
   * Checks whether a carousel answer value matches the command text being sent.
   * An empty/unprovided answer matches an empty command (i.e. pressing Enter to
   * accept the default), since that is the expected way to skip a question.
   */
  _answerMatchesCommand(answer, commandText) {
    if (answer === void 0) {
      return commandText === "";
    }
    if (typeof answer === "string") {
      return answer.trim() === commandText;
    }
    if (hasKey(answer, { selectedValues: true })) {
      const multi = answer;
      if (multi.selectedValues.some((v) => v.trim() === commandText)) {
        return true;
      }
      if (multi.freeformValue?.trim() === commandText) {
        return true;
      }
      return commandText === "" && multi.selectedValues.length === 0 && !multi.freeformValue?.trim();
    }
    if (hasKey(answer, { selectedValue: true })) {
      const single = answer;
      if (single.selectedValue?.trim() === commandText || single.freeformValue?.trim() === commandText) {
        return true;
      }
      return commandText === "" && !single.selectedValue?.trim() && !single.freeformValue?.trim();
    }
    return false;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const args = invocation.parameters;
    if (!args.id) {
      return {
        content: [{
          kind: "text",
          value: `Error: 'id' (the active terminal execution UUID returned by ${TerminalToolId.RunInTerminal}) must be provided.`
        }]
      };
    }
    const execution = RunInTerminalTool.getExecution(args.id);
    if (!execution) {
      return {
        content: [{
          kind: "text",
          value: `Error: No active terminal execution found with ID ${args.id}. The terminal may have already been killed or the ID is invalid. The ID must be the exact value returned by ${TerminalToolId.RunInTerminal}.`
        }]
      };
    }
    const startMarker = execution.instance.registerMarker?.();
    if (isMultilineCommand(args.command)) {
      await execution.instance.sendText(args.command, true, true);
    } else {
      await execution.instance.sendText(normalizeCommandForExecution(args.command), true);
    }
    let recentOutput;
    if (args.waitForOutput) {
      recentOutput = await this._waitForIdleOutput(execution, startMarker, token);
    } else {
      await timeout(2e3, token);
      recentOutput = getOutput(execution.instance, startMarker ?? void 0, { lastNLines: 20 });
    }
    const steering = isCancelSignal(args.command) ? `

Note: The input you sent was a cancel signal (Ctrl-C / Ctrl-D / Ctrl-\\). The previously running command was interrupted, not completed. This is not a signal to end the turn \u2014 if you intend to run a recovery or follow-up command, issue it now in this same turn. Call ${TerminalToolId.GetTerminalOutput} first if you need to verify the shell is back at a prompt.` : "";
    return {
      content: [{
        kind: "text",
        value: `Successfully sent command to terminal ${args.id}.${recentOutput ? `

Terminal output:
${recentOutput}` : ""}${steering}`
      }]
    };
  }
  /**
   * Waits for the terminal to become idle (no new output for a sustained period)
   * and returns the output produced since the given marker.
   */
  async _waitForIdleOutput(execution, startMarker, token) {
    const maxWaitMs = 3e4;
    const idleThresholdMs = 2e3;
    const pollIntervalMs = 500;
    let waited = 0;
    let lastDataTime = Date.now();
    const cts = new CancellationTokenSource(token);
    const dataListener = execution.instance.onData(() => {
      lastDataTime = Date.now();
    });
    try {
      while (!cts.token.isCancellationRequested && waited < maxWaitMs) {
        await timeout(pollIntervalMs, cts.token);
        waited += pollIntervalMs;
        const timeSinceLastData = Date.now() - lastDataTime;
        if (timeSinceLastData >= idleThresholdMs) {
          break;
        }
      }
    } finally {
      dataListener.dispose();
      cts.dispose();
    }
    return getOutput(execution.instance, startMarker ?? void 0);
  }
};
SendToTerminalTool = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IChatService),
  __decorateParam(2, IChatWidgetService),
  __decorateParam(3, ITerminalChatService)
], SendToTerminalTool);
export {
  SendToTerminalTool,
  SendToTerminalToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxzZW5kVG9UZXJtaW5hbFRvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlLCBjcmVhdGVDb21tYW5kVXJpLCBpc01hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSwgSUNoYXRNdWx0aVNlbGVjdEFuc3dlciwgSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlLCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIElDaGF0U2luZ2xlU2VsZWN0QW5zd2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UsIHR5cGUgQ291bnRUb2tlbnNDYWxsYmFjaywgdHlwZSBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgdHlwZSBJVG9vbERhdGEsIHR5cGUgSVRvb2xJbXBsLCB0eXBlIElUb29sSW52b2NhdGlvbiwgdHlwZSBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHR5cGUgSVRvb2xSZXN1bHQsIHR5cGUgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBnZXRPdXRwdXQgfSBmcm9tICcuLi9vdXRwdXRIZWxwZXJzLmpzJztcbmltcG9ydCB7IGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0LCBpc011bHRpbGluZUNvbW1hbmQsIG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24gfSBmcm9tICcuLi9ydW5JblRlcm1pbmFsSGVscGVycy5qcyc7XG5pbXBvcnQgeyBSdW5JblRlcm1pbmFsVG9vbCB9IGZyb20gJy4vcnVuSW5UZXJtaW5hbFRvb2wuanMnO1xuaW1wb3J0IHsgaXNTZXNzaW9uQXV0b0FwcHJvdmVMZXZlbCB9IGZyb20gJy4vdGVybWluYWxUb29sQXV0b0FwcHJvdmUuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUb29sSWQgfSBmcm9tICcuL3Rvb2xJZHMuanMnO1xuXG5leHBvcnQgY29uc3QgU2VuZFRvVGVybWluYWxUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogVGVybWluYWxUb29sSWQuU2VuZFRvVGVybWluYWwsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiAnc2VuZFRvVGVybWluYWwnLFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3NlbmRUb1Rlcm1pbmFsVG9vbC5kaXNwbGF5TmFtZScsICdTZW5kIHRvIFRlcm1pbmFsJyksXG5cdG1vZGVsRGVzY3JpcHRpb246IGBTZW5kIGlucHV0IHRleHQgdG8gYW4gYWN0aXZlIHRlcm1pbmFsIGV4ZWN1dGlvbiAoaWRlbnRpZmllZCBieSB0aGUgXFxgaWRcXGAgcmV0dXJuZWQgZnJvbSAke1Rlcm1pbmFsVG9vbElkLlJ1bkluVGVybWluYWx9KS4gVGhlICdjb21tYW5kJyBmaWVsZCBtYXkgYmUgZW1wdHkgb3Igd2hpdGVzcGFjZSB0byBwcmVzcyBFbnRlciAodXNlZnVsIGZvciBpbnRlcmFjdGl2ZSBwcm9tcHRzKS4gQnkgZGVmYXVsdCwgcmV0dXJucyB0aGUgbGFzdCAyMCBsaW5lcyBvZiB0ZXJtaW5hbCBvdXRwdXQgY2FwdHVyZWQgc2hvcnRseSBhZnRlciBzZW5kaW5nLiBTZXQgJ3dhaXRGb3JPdXRwdXQnIHRvIHRydWUgZm9yIGludGVyYWN0aXZlIHByb2dyYW1zIChnYW1lcywgUkVQTHMsIGV0Yy4pIHRvIHdhaXQgdW50aWwgdGhlIHRlcm1pbmFsIGJlY29tZXMgaWRsZSBiZWZvcmUgcmV0dXJuaW5nIG91dHB1dCBcdTIwMTQgdGhpcyBnaXZlcyB5b3UgdGhlIHByb2dyYW0ncyByZXNwb25zZSB0byB5b3VyIGlucHV0LmAsXG5cdGljb246IENvZGljb24udGVybWluYWwsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGlucHV0U2NoZW1hOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0aWQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgVGhlIElEIG9mIGFuIGFjdGl2ZSB0ZXJtaW5hbCBleGVjdXRpb24gdG8gc2VuZCBhIGNvbW1hbmQgdG8gKHJldHVybmVkIGJ5ICR7VGVybWluYWxUb29sSWQuUnVuSW5UZXJtaW5hbH0gZm9yIGFzeW5jIGV4ZWN1dGlvbnMsIG9yIGZvciBzeW5jIGV4ZWN1dGlvbnMgdGhhdCB0aW1lZCBvdXQgYW5kIHdlcmUgbW92ZWQgdG8gdGhlIGJhY2tncm91bmQpLmAsXG5cdFx0XHRcdHBhdHRlcm46ICdeWzAtOWEtZkEtRl17OH0tWzAtOWEtZkEtRl17NH0tWzEtNV1bMC05YS1mQS1GXXszfS1bODlhYkFCXVswLTlhLWZBLUZdezN9LVswLTlhLWZBLUZdezEyfSQnXG5cdFx0XHR9LFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaGUgaW5wdXQgdGV4dCB0byBzZW5kIHRvIHRoZSB0ZXJtaW5hbC4gVGhlIHRleHQgaXMgc2VudCBmb2xsb3dlZCBieSBFbnRlci4gUHJvdmlkZSBhbiBlbXB0eSBvciB3aGl0ZXNwYWNlIHN0cmluZyB0byBzZW5kIGp1c3QgRW50ZXIgKGZvciBpbnRlcmFjdGl2ZSBwcm9tcHRzKS4nXG5cdFx0XHR9LFxuXHRcdFx0d2FpdEZvck91dHB1dDoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV2hlbiB0cnVlLCB3YWl0cyBmb3IgdGhlIHRlcm1pbmFsIHRvIGJlY29tZSBpZGxlIChubyBuZXcgb3V0cHV0IGZvciBhIHNob3J0IHBlcmlvZCkgYmVmb3JlIHJldHVybmluZywgaW5zdGVhZCBvZiByZXR1cm5pbmcgaW1tZWRpYXRlbHkuIFVzZSB0aGlzIGZvciBpbnRlcmFjdGl2ZSBwcm9ncmFtcyB3aGVyZSB5b3UgbmVlZCB0byBzZWUgdGhlIGZ1bGwgcmVzcG9uc2UgdG8geW91ciBpbnB1dC4gRGVmYXVsdHMgdG8gZmFsc2UuJ1xuXHRcdFx0fSxcblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbXG5cdFx0XHQnaWQnLFxuXHRcdFx0J2NvbW1hbmQnLFxuXHRcdF1cblx0fVxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJU2VuZFRvVGVybWluYWxJbnB1dFBhcmFtcyB7XG5cdGlkOiBzdHJpbmc7XG5cdGNvbW1hbmQ6IHN0cmluZztcblx0d2FpdEZvck91dHB1dD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQ2FuY2VsL0VPRiBzaWduYWxzOiBDdHJsLUMgKEVUWCwgMHgwMyksIEN0cmwtRCAoRU9ULCAweDA0KSwgQ3RybC1cXCAoRlMsIDB4MWMpLlxuICogV2hlbiBzZW50IG9uIHRoZWlyIG93biB0aGVzZSBpbnRlcnJ1cHQgb3IgY2xvc2UgdGhlIGZvcmVncm91bmQgcHJvY2VzcyByYXRoZXJcbiAqIHRoYW4gY29tcGxldGluZyBpdCwgc28gdGhlIG1vZGVsIG5lZWRzIGFuIGV4dHJhIG51ZGdlIHRoYXQgdGhlIHR1cm4gaXMgbm90IGRvbmUuXG4gKi9cbmZ1bmN0aW9uIGlzQ2FuY2VsU2lnbmFsKGNvbW1hbmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gL15bXFx1MDAwM1xcdTAwMDRcXHUwMDFjXSQvLnRlc3QoY29tbWFuZC50cmltKCkpO1xufVxuXG5jb25zdCBGb2N1c1Rlcm1pbmFsQnlJZENvbW1hbmRJZCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQuZm9jdXNUZXJtaW5hbEJ5SWQnO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoRm9jdXNUZXJtaW5hbEJ5SWRDb21tYW5kSWQsIGFzeW5jIChhY2Nlc3NvciwgaW5zdGFuY2VJZDogbnVtYmVyKSA9PiB7XG5cdGNvbnN0IHRlcm1pbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxTZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFuY2UgPSB0ZXJtaW5hbFNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tSWQoaW5zdGFuY2VJZCk7XG5cdGlmIChpbnN0YW5jZSkge1xuXHRcdHRlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0YXdhaXQgdGVybWluYWxTZXJ2aWNlLnJldmVhbEFjdGl2ZVRlcm1pbmFsKCk7XG5cdFx0aW5zdGFuY2UuZm9jdXMoKTtcblx0fVxufSk7XG5cbmNvbnN0IEZvY3VzVGVybWluYWxCeUV4ZWN1dGlvbklkQ29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhdC5mb2N1c1Rlcm1pbmFsQnlFeGVjdXRpb25JZCc7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChGb2N1c1Rlcm1pbmFsQnlFeGVjdXRpb25JZENvbW1hbmRJZCwgYXN5bmMgKGFjY2Vzc29yLCBleGVjdXRpb25JZDogc3RyaW5nKSA9PiB7XG5cdGNvbnN0IGV4ZWN1dGlvbiA9IFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbihleGVjdXRpb25JZCk7XG5cdGlmIChleGVjdXRpb24pIHtcblx0XHRjb25zdCB0ZXJtaW5hbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsU2VydmljZSk7XG5cdFx0dGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGV4ZWN1dGlvbi5pbnN0YW5jZSk7XG5cdFx0YXdhaXQgdGVybWluYWxTZXJ2aWNlLnJldmVhbEFjdGl2ZVRlcm1pbmFsKCk7XG5cdFx0ZXhlY3V0aW9uLmluc3RhbmNlLmZvY3VzKCk7XG5cdH1cbn0pO1xuXG5leHBvcnQgY2xhc3MgU2VuZFRvVGVybWluYWxUb29sIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ2hhdFNlcnZpY2U6IElUZXJtaW5hbENoYXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcmdzID0gY29udGV4dC5wYXJhbWV0ZXJzIGFzIElTZW5kVG9UZXJtaW5hbElucHV0UGFyYW1zO1xuXHRcdGNvbnN0IGlzRW1wdHlJbnB1dCA9ICFhcmdzLmNvbW1hbmQgfHwgIWFyZ3MuY29tbWFuZC50cmltKCk7XG5cblx0XHQvLyBSZXNvbHZlIGEgaHVtYW4tZnJpZW5kbHkgdGVybWluYWwgbGFiZWwgZnJvbSB0aGUgaW5zdGFuY2UgdGl0bGVcblx0XHRjb25zdCB0ZXJtaW5hbExhYmVsID0gdGhpcy5fZ2V0VGVybWluYWxMYWJlbChhcmdzKTtcblxuXHRcdGNvbnN0IGludm9jYXRpb25NZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0Y29uc3QgcGFzdFRlbnNlTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXG5cdFx0Ly8gTG9vayBmb3IgdGhlIHF1ZXN0aW9uIHRoYXQgcHJvbXB0ZWQgdGhpcyBzZW5kX3RvX3Rlcm1pbmFsIGNhbGxcblx0XHRjb25zdCBxdWVzdGlvblRleHQgPSB0aGlzLl9nZXRRdWVzdGlvbkNvbnRleHRGb3JUZXJtaW5hbChjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2UsIGFyZ3MpO1xuXG5cdFx0aWYgKGlzRW1wdHlJbnB1dCkge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ3NlbmQucHJvZ3Jlc3NpdmUuZW50ZXInLCBcIlByZXNzaW5nIGBFbnRlcmAgaW4gdGVybWluYWxcIikpO1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZS5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnc2VuZC5wYXN0LmVudGVyJywgXCJQcmVzc2VkIGBFbnRlcmAgaW4gdGVybWluYWxcIikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBkaXNwbGF5Q29tbWFuZCA9IGJ1aWxkQ29tbWFuZERpc3BsYXlUZXh0KGFyZ3MuY29tbWFuZCk7XG5cdFx0XHRjb25zdCBzYWZlSW5saW5lQ29kZSA9IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoZGlzcGxheUNvbW1hbmQpO1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UuYXBwZW5kTWFya2Rvd24obG9jYWxpemUoJ3NlbmQucHJvZ3Jlc3NpdmUnLCBcIlNlbmRpbmcgezB9IHRvIHRlcm1pbmFsXCIsIHNhZmVJbmxpbmVDb2RlKSk7XG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdzZW5kLnBhc3QnLCBcIlNlbnQgezB9IHRvIHRlcm1pbmFsXCIsIHNhZmVJbmxpbmVDb2RlKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHF1ZXN0aW9uVGV4dCkge1xuXHRcdFx0Y29uc3QgcmVwbHlQcmVmaXggPSBgICgke2xvY2FsaXplKCdzZW5kLnJlcGx5aW5nVG8nLCBcInJlcGx5aW5nIHRvOiBcIil9YDtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlLmFwcGVuZE1hcmtkb3duKHJlcGx5UHJlZml4KTtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlLmFwcGVuZFRleHQocXVlc3Rpb25UZXh0KTtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlLmFwcGVuZE1hcmtkb3duKCcpJyk7XG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlLmFwcGVuZE1hcmtkb3duKHJlcGx5UHJlZml4KTtcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2UuYXBwZW5kVGV4dChxdWVzdGlvblRleHQpO1xuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZS5hcHBlbmRNYXJrZG93bignKScpO1xuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIHRoZSBjb25maXJtYXRpb24gbWVzc2FnZSB3aXRoIGEgXCJGb2N1cyBUZXJtaW5hbFwiIGNvbW1hbmQgbGlua1xuXHRcdGNvbnN0IGluc3RhbmNlSWQgPSB0aGlzLl9nZXRUZXJtaW5hbEluc3RhbmNlSWQoYXJncyk7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHsgZW5hYmxlZENvbW1hbmRzOiBbRm9jdXNUZXJtaW5hbEJ5SWRDb21tYW5kSWRdIH0gfSk7XG5cdFx0Y29uc3Qgc2FmZVRlcm1pbmFsTGFiZWwgPSBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHRlcm1pbmFsTGFiZWwpO1xuXHRcdGNvbnN0IGJhc2VNZXNzYWdlID0gaXNFbXB0eUlucHV0XG5cdFx0XHQ/IGxvY2FsaXplKCdzZW5kLmNvbmZpcm0ubWVzc2FnZS5lbnRlcicsIFwiUHJlc3MgYEVudGVyYCBpbiB0ZXJtaW5hbCB7MH1cIiwgc2FmZVRlcm1pbmFsTGFiZWwpXG5cdFx0XHQ6IGxvY2FsaXplKCdzZW5kLmNvbmZpcm0ubWVzc2FnZScsIFwiUnVuIHswfSBpbiB0ZXJtaW5hbCB7MX1cIiwgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZShidWlsZENvbW1hbmREaXNwbGF5VGV4dChhcmdzLmNvbW1hbmQpKSwgc2FmZVRlcm1pbmFsTGFiZWwpO1xuXHRcdGlmIChpbnN0YW5jZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGZvY3VzVXJpID0gY3JlYXRlQ29tbWFuZFVyaShGb2N1c1Rlcm1pbmFsQnlJZENvbW1hbmRJZCwgaW5zdGFuY2VJZCk7XG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlLmFwcGVuZE1hcmtkb3duKGAke2Jhc2VNZXNzYWdlfSBcdTIwMTQgWyR7bG9jYWxpemUoJ2ZvY3VzVGVybWluYWwnLCBcIkZvY3VzIFRlcm1pbmFsXCIpfV0oJHtmb2N1c1VyaX0pYCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2UuYXBwZW5kTWFya2Rvd24oYmFzZU1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSBhdXRvLWFwcHJvdmFsLCBhbGlnbmVkIHdpdGggcnVuSW5UZXJtaW5hbFxuXHRcdGNvbnN0IGNoYXRTZXNzaW9uUmVzb3VyY2UgPSBjb250ZXh0LmNoYXRTZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgaXNTZXNzaW9uQXV0b0FwcHJvdmVkID0gY2hhdFNlc3Npb25SZXNvdXJjZSAmJiAoXG5cdFx0XHRpc1Nlc3Npb25BdXRvQXBwcm92ZUxldmVsKGNoYXRTZXNzaW9uUmVzb3VyY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZSwgdGhpcy5fY2hhdFNlcnZpY2UpIHx8XG5cdFx0XHR0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmhhc0NoYXRTZXNzaW9uQXV0b0FwcHJvdmFsKGNoYXRTZXNzaW9uUmVzb3VyY2UpXG5cdFx0KTtcblxuXHRcdC8vIHNlbmRfdG9fdGVybWluYWwgbm9ybWFsbHkgcmVxdWlyZXMgY29uZmlybWF0aW9uIGluIGRlZmF1bHQgcGVybWlzc2lvbnMgbW9kZVxuXHRcdC8vIGJlY2F1c2UgdGhlIHRleHQgbWF5IGJlIGFyYml0cmFyeSBpbnB1dCAocGFzc3dvcmRzLCBjb25maXJtYXRpb25zLCBldGMuKVxuXHRcdC8vIHRoYXQgdGhlIGNvbW1hbmQtbGluZSBhdXRvLWFwcHJvdmUgYW5hbHl6ZXIgY2Fubm90IGFzc2Vzcy4gSG93ZXZlciwgd2hlblxuXHRcdC8vIHRoZSB0ZXh0IGJlaW5nIHNlbnQgd2FzIGp1c3QgY29sbGVjdGVkIHZpYSBhc2tRdWVzdGlvbnMgZm9yIHRoZSBzYW1lXG5cdFx0Ly8gdGVybWluYWwsIHRoZSB1c2VyIGFscmVhZHkgZXhwbGljaXRseSBwcm92aWRlZCB0aGUgYW5zd2VyIHNvIGEgc2Vjb25kXG5cdFx0Ly8gY29uZmlybWF0aW9uIGlzIHJlZHVuZGFudC5cblx0XHRjb25zdCBpc0Fuc3dlcmluZ1F1ZXN0aW9uID0gcXVlc3Rpb25UZXh0ICE9PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0NvbmZpcm1hdGlvbiA9ICghaXNTZXNzaW9uQXV0b0FwcHJvdmVkICYmICFpc0Fuc3dlcmluZ1F1ZXN0aW9uKSB8fCBjb250ZXh0LmZvcmNlQ29uZmlybWF0aW9uUmVhc29uICE9PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZXMgPSBzaG91bGRTaG93Q29uZmlybWF0aW9uID8ge1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZW5kLmNvbmZpcm0udGl0bGUnLCBcIlNlbmQgdG8gVGVybWluYWxcIiksXG5cdFx0XHRtZXNzYWdlOiBjb25maXJtYXRpb25NZXNzYWdlLFxuXHRcdFx0YWxsb3dBdXRvQ29uZmlybTogdW5kZWZpbmVkLFxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgaHVtYW4tZnJpZW5kbHkgbGFiZWwgZm9yIHRoZSB0YXJnZXQgdGVybWluYWwsIHVzaW5nIHRoZVxuXHQgKiB0ZXJtaW5hbCBpbnN0YW5jZSB0aXRsZSAod2hpY2ggcmVmbGVjdHMgdGhlIHJ1bm5pbmcgcHJvY2VzcykgaW5zdGVhZFxuXHQgKiBvZiB0aGUgcmF3IFVVSUQgb3IgbnVtZXJpYyBpZC5cblx0ICovXG5cdHByaXZhdGUgX2dldFRlcm1pbmFsTGFiZWwoYXJnczogSVNlbmRUb1Rlcm1pbmFsSW5wdXRQYXJhbXMpOiBzdHJpbmcge1xuXHRcdGlmIChhcmdzLmlkKSB7XG5cdFx0XHRjb25zdCBleGVjdXRpb24gPSBSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24oYXJncy5pZCk7XG5cdFx0XHRpZiAoZXhlY3V0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBleGVjdXRpb24uaW5zdGFuY2UudGl0bGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhcmdzLmlkID8/ICcnO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIG51bWVyaWMgdGVybWluYWwgaW5zdGFuY2VJZCBmb3IgdGhlIHRhcmdldCB0ZXJtaW5hbCwgdXNlZFxuXHQgKiB0byBidWlsZCBjb21tYW5kIFVSSXMgZm9yIHRoZSBcIkZvY3VzIFRlcm1pbmFsXCIgbGluay5cblx0ICovXG5cdHByaXZhdGUgX2dldFRlcm1pbmFsSW5zdGFuY2VJZChhcmdzOiBJU2VuZFRvVGVybWluYWxJbnB1dFBhcmFtcyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGFyZ3MuaWQpIHtcblx0XHRcdGNvbnN0IGV4ZWN1dGlvbiA9IFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbihhcmdzLmlkKTtcblx0XHRcdGlmIChleGVjdXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGV4ZWN1dGlvbi5pbnN0YW5jZS5pbnN0YW5jZUlkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlYXJjaGVzIHRoZSBjdXJyZW50IHNlc3Npb24ncyByZXNwb25zZXMgZm9yIHRoZSBtb3N0IHJlY2VudCBxdWVzdGlvblxuXHQgKiBjYXJvdXNlbCBhc3NvY2lhdGVkIHdpdGggdGhlIHRhcmdldCB0ZXJtaW5hbCwgdGhlbiB1c2VzIHBvc2l0aW9uYWxcblx0ICogbWF0Y2hpbmcgdG8gcmV0dXJuIHRoZSBzcGVjaWZpYyBxdWVzdGlvbiB0aGF0IHRoaXMgc2VuZF90b190ZXJtaW5hbFxuXHQgKiBjYWxsIGlzIGFuc3dlcmluZy5cblx0ICpcblx0ICogV2hlbiBhIGNhcm91c2VsIGNvbnRhaW5zIG11bHRpcGxlIHF1ZXN0aW9ucywgdGhlIG1vZGVsIGNhbGxzXG5cdCAqIHNlbmRfdG9fdGVybWluYWwgb25jZSBwZXIgYW5zd2VyIGluIG9yZGVyLiBUaGlzIG1ldGhvZCBjb3VudHMgcHJpb3Jcblx0ICogc2VuZF90b190ZXJtaW5hbCBpbnZvY2F0aW9ucyBzaW5jZSB0aGUgY2Fyb3VzZWwgdG8gZGV0ZXJtaW5lIHRoZVxuXHQgKiBjdXJyZW50IHF1ZXN0aW9uIGluZGV4LCB0aGVuIHZlcmlmaWVzIHRoZSBjb21tYW5kIG1hdGNoZXMgdGhlIGFuc3dlclxuXHQgKiBhdCB0aGF0IHBvc2l0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0UXVlc3Rpb25Db250ZXh0Rm9yVGVybWluYWwoY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBhcmdzOiBJU2VuZFRvVGVybWluYWxJbnB1dFBhcmFtcyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGhlIHRlcm1pbmFsIElEIHRoYXQgd2lsbCBtYXRjaCB0aGUgY2Fyb3VzZWwncyB0ZXJtaW5hbElkXG5cdFx0aWYgKCFhcmdzLmlkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRUZXh0ID0gYXJncy5jb21tYW5kPy50cmltKCk7XG5cblx0XHQvLyBXYWxrIHJlcXVlc3RzIGluIHJldmVyc2UgdG8gZmluZCB0aGUgbW9zdCByZWNlbnQgY2Fyb3VzZWwgZm9yIHRoaXMgdGVybWluYWxcblx0XHRjb25zdCByZXF1ZXN0cyA9IG1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0Zm9yIChsZXQgaSA9IHJlcXVlc3RzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IHJlcXVlc3RzW2ldLnJlc3BvbnNlO1xuXHRcdFx0aWYgKCFyZXNwb25zZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnRzID0gcmVzcG9uc2UucmVzcG9uc2UudmFsdWU7XG5cblx0XHRcdC8vIEZpcnN0LCBmaW5kIHRoZSBjYXJvdXNlbCBmb3IgdGhpcyB0ZXJtaW5hbCAoc2VhcmNoaW5nIGJhY2t3YXJkcylcblx0XHRcdGxldCBjYXJvdXNlbEluZGV4ID0gLTE7XG5cdFx0XHRsZXQgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAobGV0IGogPSBwYXJ0cy5sZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xuXHRcdFx0XHRjb25zdCBwYXJ0ID0gcGFydHNbal07XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJykge1xuXHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHBhcnQgYXMgSUNoYXRRdWVzdGlvbkNhcm91c2VsO1xuXHRcdFx0XHRcdGlmICghY2FuZGlkYXRlLnRlcm1pbmFsSWQgfHwgY2FuZGlkYXRlLnF1ZXN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY2FuZGlkYXRlLnRlcm1pbmFsSWQgPT09IGFyZ3MuaWQpIHtcblx0XHRcdFx0XHRcdGNhcm91c2VsSW5kZXggPSBqO1xuXHRcdFx0XHRcdFx0Y2Fyb3VzZWwgPSBjYW5kaWRhdGU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFjYXJvdXNlbCB8fCBjYXJvdXNlbEluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ291bnQgc2VuZF90b190ZXJtaW5hbCB0b29sIGludm9jYXRpb25zIGFmdGVyIHRoZSBjYXJvdXNlbCB0b1xuXHRcdFx0Ly8gZGV0ZXJtaW5lIHdoaWNoIHF1ZXN0aW9uIHRoaXMgY2FsbCBjb3JyZXNwb25kcyB0byAocG9zaXRpb25hbCkuXG5cdFx0XHRsZXQgc2VuZENvdW50ID0gMDtcblx0XHRcdGZvciAobGV0IGogPSBjYXJvdXNlbEluZGV4ICsgMTsgaiA8IHBhcnRzLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRcdGlmIChwYXJ0c1tqXS5raW5kID09PSAndG9vbEludm9jYXRpb24nICYmIChwYXJ0c1tqXSBhcyB7IHRvb2xJZD86IHN0cmluZyB9KS50b29sSWQgPT09IFRlcm1pbmFsVG9vbElkLlNlbmRUb1Rlcm1pbmFsKSB7XG5cdFx0XHRcdFx0c2VuZENvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVlc3Rpb25JbmRleCA9IHNlbmRDb3VudDtcblx0XHRcdGlmIChxdWVzdGlvbkluZGV4ID49IGNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcXVlc3Rpb24gPSBjYXJvdXNlbC5xdWVzdGlvbnNbcXVlc3Rpb25JbmRleF07XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgY29tbWFuZCBtYXRjaGVzIHRoZSBhbnN3ZXIgYXQgdGhpcyBwb3NpdGlvbiBzbyB0aGF0XG5cdFx0XHQvLyB1bnJlbGF0ZWQgc2VuZF90b190ZXJtaW5hbCBjYWxscyBkb24ndCBza2lwIGNvbmZpcm1hdGlvbi5cblx0XHRcdGlmIChjYXJvdXNlbC5kYXRhKSB7XG5cdFx0XHRcdGNvbnN0IGFuc3dlciA9IGNhcm91c2VsLmRhdGFbcXVlc3Rpb24uaWRdO1xuXHRcdFx0XHRpZiAodGhpcy5fYW5zd2VyTWF0Y2hlc0NvbW1hbmQoYW5zd2VyLCBjb21tYW5kVGV4dCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0UXVlc3Rpb25UZXh0KHF1ZXN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UXVlc3Rpb25UZXh0KHF1ZXN0aW9uOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxbJ3F1ZXN0aW9ucyddWzBdKTogc3RyaW5nIHtcblx0XHRjb25zdCB0ZXh0ID0gcXVlc3Rpb24ubWVzc2FnZSA/PyBxdWVzdGlvbi50aXRsZTtcblx0XHRyZXR1cm4gaXNNYXJrZG93blN0cmluZyh0ZXh0KSA/IHRleHQudmFsdWUgOiB0ZXh0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyB3aGV0aGVyIGEgY2Fyb3VzZWwgYW5zd2VyIHZhbHVlIG1hdGNoZXMgdGhlIGNvbW1hbmQgdGV4dCBiZWluZyBzZW50LlxuXHQgKiBBbiBlbXB0eS91bnByb3ZpZGVkIGFuc3dlciBtYXRjaGVzIGFuIGVtcHR5IGNvbW1hbmQgKGkuZS4gcHJlc3NpbmcgRW50ZXIgdG9cblx0ICogYWNjZXB0IHRoZSBkZWZhdWx0KSwgc2luY2UgdGhhdCBpcyB0aGUgZXhwZWN0ZWQgd2F5IHRvIHNraXAgYSBxdWVzdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2Fuc3dlck1hdGNoZXNDb21tYW5kKGFuc3dlcjogSUNoYXRRdWVzdGlvbkFuc3dlclZhbHVlIHwgdW5kZWZpbmVkLCBjb21tYW5kVGV4dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKGFuc3dlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZFRleHQgPT09ICcnO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGFuc3dlciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBhbnN3ZXIudHJpbSgpID09PSBjb21tYW5kVGV4dDtcblx0XHR9XG5cdFx0Ly8gYW5zd2VyIGlzIG5vdyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlciB8IElDaGF0TXVsdGlTZWxlY3RBbnN3ZXJcblx0XHRpZiAoaGFzS2V5KGFuc3dlciwgeyBzZWxlY3RlZFZhbHVlczogdHJ1ZSB9KSkge1xuXHRcdFx0Y29uc3QgbXVsdGkgPSBhbnN3ZXIgYXMgSUNoYXRNdWx0aVNlbGVjdEFuc3dlcjtcblx0XHRcdGlmIChtdWx0aS5zZWxlY3RlZFZhbHVlcy5zb21lKHYgPT4gdi50cmltKCkgPT09IGNvbW1hbmRUZXh0KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChtdWx0aS5mcmVlZm9ybVZhbHVlPy50cmltKCkgPT09IGNvbW1hbmRUZXh0KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbW1hbmRUZXh0ID09PSAnJyAmJiBtdWx0aS5zZWxlY3RlZFZhbHVlcy5sZW5ndGggPT09IDAgJiYgIW11bHRpLmZyZWVmb3JtVmFsdWU/LnRyaW0oKTtcblx0XHR9XG5cdFx0aWYgKGhhc0tleShhbnN3ZXIsIHsgc2VsZWN0ZWRWYWx1ZTogdHJ1ZSB9KSkge1xuXHRcdFx0Y29uc3Qgc2luZ2xlID0gYW5zd2VyIGFzIElDaGF0U2luZ2xlU2VsZWN0QW5zd2VyO1xuXHRcdFx0aWYgKHNpbmdsZS5zZWxlY3RlZFZhbHVlPy50cmltKCkgPT09IGNvbW1hbmRUZXh0IHx8IHNpbmdsZS5mcmVlZm9ybVZhbHVlPy50cmltKCkgPT09IGNvbW1hbmRUZXh0KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbW1hbmRUZXh0ID09PSAnJyAmJiAhc2luZ2xlLnNlbGVjdGVkVmFsdWU/LnRyaW0oKSAmJiAhc2luZ2xlLmZyZWVmb3JtVmFsdWU/LnRyaW0oKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSVNlbmRUb1Rlcm1pbmFsSW5wdXRQYXJhbXM7XG5cblx0XHRpZiAoIWFyZ3MuaWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdHZhbHVlOiBgRXJyb3I6ICdpZCcgKHRoZSBhY3RpdmUgdGVybWluYWwgZXhlY3V0aW9uIFVVSUQgcmV0dXJuZWQgYnkgJHtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsfSkgbXVzdCBiZSBwcm92aWRlZC5gXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IFJ1bkluVGVybWluYWxUb29sLmdldEV4ZWN1dGlvbihhcmdzLmlkKTtcblx0XHRpZiAoIWV4ZWN1dGlvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IGBFcnJvcjogTm8gYWN0aXZlIHRlcm1pbmFsIGV4ZWN1dGlvbiBmb3VuZCB3aXRoIElEICR7YXJncy5pZH0uIFRoZSB0ZXJtaW5hbCBtYXkgaGF2ZSBhbHJlYWR5IGJlZW4ga2lsbGVkIG9yIHRoZSBJRCBpcyBpbnZhbGlkLiBUaGUgSUQgbXVzdCBiZSB0aGUgZXhhY3QgdmFsdWUgcmV0dXJuZWQgYnkgJHtUZXJtaW5hbFRvb2xJZC5SdW5JblRlcm1pbmFsfS5gXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIFJlZ2lzdGVyIGEgbWFya2VyIGJlZm9yZSBzZW5kaW5nIHNvIHdlIGNhbiBzY29wZSBvdXRwdXQgdG8ganVzdCB0aGUgcmVzcG9uc2Vcblx0XHRjb25zdCBzdGFydE1hcmtlciA9IGV4ZWN1dGlvbi5pbnN0YW5jZS5yZWdpc3Rlck1hcmtlcj8uKCk7XG5cblx0XHRpZiAoaXNNdWx0aWxpbmVDb21tYW5kKGFyZ3MuY29tbWFuZCkpIHtcblx0XHRcdC8vIE11bHRpbGluZSBjb21tYW5kcyAoZS5nLiBoZXJlZG9jcykgbXVzdCBwcmVzZXJ2ZSBuZXdsaW5lcyBhbmQgdXNlXG5cdFx0XHQvLyBicmFja2V0ZWQgcGFzdGUgbW9kZSBzbyB0aGUgc2hlbGwgdHJlYXRzIHRoZSBpbnB1dCBhcyBhIHNpbmdsZSBwYXN0ZVxuXHRcdFx0Ly8gcmF0aGVyIHRoYW4gZXhlY3V0aW5nIGVhY2ggbGluZSBpbmRlcGVuZGVudGx5LiBJbnRlbnRpb25hbGx5IHNraXBcblx0XHRcdC8vIG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24gaGVyZSBzbyBuZWl0aGVyIG5ld2xpbmVzIG5vciB0aGVcblx0XHRcdC8vIHRyYWlsaW5nL2xlYWRpbmcgd2hpdGVzcGFjZSBgLnRyaW0oKWAgaXQgcGVyZm9ybXMgYXJlIHN0cmlwcGVkLlxuXHRcdFx0YXdhaXQgZXhlY3V0aW9uLmluc3RhbmNlLnNlbmRUZXh0KGFyZ3MuY29tbWFuZCwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IGV4ZWN1dGlvbi5pbnN0YW5jZS5zZW5kVGV4dChub3JtYWxpemVDb21tYW5kRm9yRXhlY3V0aW9uKGFyZ3MuY29tbWFuZCksIHRydWUpO1xuXHRcdH1cblxuXHRcdGxldCByZWNlbnRPdXRwdXQ6IHN0cmluZztcblx0XHRpZiAoYXJncy53YWl0Rm9yT3V0cHV0KSB7XG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgdGVybWluYWwgdG8gYmVjb21lIGlkbGUgKG5vIG5ldyBkYXRhKSBiZWZvcmUgcmV0dXJuaW5nLlxuXHRcdFx0Ly8gVGhpcyBpcyBjcml0aWNhbCBmb3IgaW50ZXJhY3RpdmUgcHJvZ3JhbXMgKGdhbWVzLCBSRVBMcywgZXRjLikgd2hlcmVcblx0XHRcdC8vIHRoZSByZXNwb25zZSBhcnJpdmVzIGFzeW5jaHJvbm91c2x5IGFmdGVyIHRoZSBpbnB1dC5cblx0XHRcdHJlY2VudE91dHB1dCA9IGF3YWl0IHRoaXMuX3dhaXRGb3JJZGxlT3V0cHV0KGV4ZWN1dGlvbiwgc3RhcnRNYXJrZXIsIHRva2VuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGltZW91dCgyMDAwLCB0b2tlbik7XG5cdFx0XHRyZWNlbnRPdXRwdXQgPSBnZXRPdXRwdXQoZXhlY3V0aW9uLmluc3RhbmNlLCBzdGFydE1hcmtlciA/PyB1bmRlZmluZWQsIHsgbGFzdE5MaW5lczogMjAgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RlZXJpbmcgPSBpc0NhbmNlbFNpZ25hbChhcmdzLmNvbW1hbmQpXG5cdFx0XHQ/IGBcXG5cXG5Ob3RlOiBUaGUgaW5wdXQgeW91IHNlbnQgd2FzIGEgY2FuY2VsIHNpZ25hbCAoQ3RybC1DIC8gQ3RybC1EIC8gQ3RybC1cXFxcKS4gVGhlIHByZXZpb3VzbHkgcnVubmluZyBjb21tYW5kIHdhcyBpbnRlcnJ1cHRlZCwgbm90IGNvbXBsZXRlZC4gVGhpcyBpcyBub3QgYSBzaWduYWwgdG8gZW5kIHRoZSB0dXJuIFx1MjAxNCBpZiB5b3UgaW50ZW5kIHRvIHJ1biBhIHJlY292ZXJ5IG9yIGZvbGxvdy11cCBjb21tYW5kLCBpc3N1ZSBpdCBub3cgaW4gdGhpcyBzYW1lIHR1cm4uIENhbGwgJHtUZXJtaW5hbFRvb2xJZC5HZXRUZXJtaW5hbE91dHB1dH0gZmlyc3QgaWYgeW91IG5lZWQgdG8gdmVyaWZ5IHRoZSBzaGVsbCBpcyBiYWNrIGF0IGEgcHJvbXB0LmBcblx0XHRcdDogJyc7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHR2YWx1ZTogYFN1Y2Nlc3NmdWxseSBzZW50IGNvbW1hbmQgdG8gdGVybWluYWwgJHthcmdzLmlkfS4ke3JlY2VudE91dHB1dCA/IGBcXG5cXG5UZXJtaW5hbCBvdXRwdXQ6XFxuJHtyZWNlbnRPdXRwdXR9YCA6ICcnfSR7c3RlZXJpbmd9YFxuXHRcdFx0fV1cblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhaXRzIGZvciB0aGUgdGVybWluYWwgdG8gYmVjb21lIGlkbGUgKG5vIG5ldyBvdXRwdXQgZm9yIGEgc3VzdGFpbmVkIHBlcmlvZClcblx0ICogYW5kIHJldHVybnMgdGhlIG91dHB1dCBwcm9kdWNlZCBzaW5jZSB0aGUgZ2l2ZW4gbWFya2VyLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvcklkbGVPdXRwdXQoXG5cdFx0ZXhlY3V0aW9uOiBSZXR1cm5UeXBlPHR5cGVvZiBSdW5JblRlcm1pbmFsVG9vbC5nZXRFeGVjdXRpb24+ICYge30sXG5cdFx0c3RhcnRNYXJrZXI6IFJldHVyblR5cGU8SVRlcm1pbmFsSW5zdGFuY2VbJ3JlZ2lzdGVyTWFya2VyJ10+IHwgdW5kZWZpbmVkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBtYXhXYWl0TXMgPSAzMF8wMDA7IC8vIDMwIHNlY29uZHMgbWF4aW11bSB3YWl0XG5cdFx0Y29uc3QgaWRsZVRocmVzaG9sZE1zID0gMl8wMDA7IC8vIENvbnNpZGVyIGlkbGUgYWZ0ZXIgMnMgb2Ygbm8gZGF0YVxuXHRcdGNvbnN0IHBvbGxJbnRlcnZhbE1zID0gNTAwO1xuXHRcdGxldCB3YWl0ZWQgPSAwO1xuXHRcdGxldCBsYXN0RGF0YVRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHRjb25zdCBkYXRhTGlzdGVuZXIgPSBleGVjdXRpb24uaW5zdGFuY2Uub25EYXRhKCgpID0+IHtcblx0XHRcdGxhc3REYXRhVGltZSA9IERhdGUubm93KCk7XG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0d2hpbGUgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgd2FpdGVkIDwgbWF4V2FpdE1zKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQocG9sbEludGVydmFsTXMsIGN0cy50b2tlbik7XG5cdFx0XHRcdHdhaXRlZCArPSBwb2xsSW50ZXJ2YWxNcztcblxuXHRcdFx0XHRjb25zdCB0aW1lU2luY2VMYXN0RGF0YSA9IERhdGUubm93KCkgLSBsYXN0RGF0YVRpbWU7XG5cdFx0XHRcdGlmICh0aW1lU2luY2VMYXN0RGF0YSA+PSBpZGxlVGhyZXNob2xkTXMpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkYXRhTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ2V0T3V0cHV0KGV4ZWN1dGlvbi5pbnN0YW5jZSwgc3RhcnRNYXJrZXIgPz8gdW5kZWZpbmVkKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlDQUFpQyxrQkFBa0Isa0JBQWtCLHNCQUFzQjtBQUNwRyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBc0g7QUFDL0gsU0FBUyxzQkFBaU47QUFFMU4sU0FBUyxzQkFBeUMsd0JBQXdCO0FBQzFFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMseUJBQXlCLG9CQUFvQixvQ0FBb0M7QUFDMUYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSx5QkFBb0M7QUFBQSxFQUNoRCxJQUFJLGVBQWU7QUFBQSxFQUNuQixtQkFBbUI7QUFBQSxFQUNuQixhQUFhLFNBQVMsa0NBQWtDLGtCQUFrQjtBQUFBLEVBQzFFLGtCQUFrQiwyRkFBMkYsZUFBZSxhQUFhO0FBQUEsRUFDekksTUFBTSxRQUFRO0FBQUEsRUFDZCxRQUFRLGVBQWU7QUFBQSxFQUN2QixhQUFhO0FBQUEsSUFDWixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsTUFDWCxJQUFJO0FB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QUFJO0FBQUEsSUFDbkY7QUFFQSxRQUFJO0FBQ0osUUFBSSxLQUFLLGVBQWU7QUFJdkIscUJBQWUsTUFBTSxLQUFLLG1CQUFtQixXQUFXLGFBQWEsS0FBSztBQUFBLElBQzNFLE9BQU87QUFDTixZQUFNLFFBQVEsS0FBTSxLQUFLO0FBQ3pCLHFCQUFlLFVBQVUsVUFBVSxVQUFVLGVBQWUsUUFBVyxFQUFFLFlBQVksR0FBRyxDQUFDO0FBQUEsSUFDMUY7QUFFQSxVQUFNLFdBQVcsZUFBZSxLQUFLLE9BQU8sSUFDekM7QUFBQTtBQUFBLGtSQUFrUixlQUFlLGlCQUFpQixnRUFDbFQ7QUFFSCxXQUFPO0FBQUEsTUFDTixTQUFTLENBQUM7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLE9BQU8seUNBQXlDLEtBQUssRUFBRSxJQUFJLGVBQWU7QUFBQTtBQUFBO0FBQUEsRUFBeUIsWUFBWSxLQUFLLEVBQUUsR0FBRyxRQUFRO0FBQUEsTUFDbEksQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsbUJBQ2IsV0FDQSxhQUNBLE9BQ2tCO0FBQ2xCLFVBQU0sWUFBWTtBQUNsQixVQUFNLGtCQUFrQjtBQUN4QixVQUFNLGlCQUFpQjtBQUN2QixRQUFJLFNBQVM7QUFDYixRQUFJLGVBQWUsS0FBSyxJQUFJO0FBRTVCLFVBQU0sTUFBTSxJQUFJLHdCQUF3QixLQUFLO0FBQzdDLFVBQU0sZUFBZSxVQUFVLFNBQVMsT0FBTyxNQUFNO0FBQ3BELHFCQUFlLEtBQUssSUFBSTtBQUFBLElBQ3pCLENBQUM7QUFFRCxRQUFJO0FBQ0gsYUFBTyxDQUFDLElBQUksTUFBTSwyQkFBMkIsU0FBUyxXQUFXO0FBQ2hFLGNBQU0sUUFBUSxnQkFBZ0IsSUFBSSxLQUFLO0FBQ3ZDLGtCQUFVO0FBRVYsY0FBTSxvQkFBb0IsS0FBSyxJQUFJLElBQUk7QUFDdkMsWUFBSSxxQkFBcUIsaUJBQWlCO0FBQ3pDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELFVBQUU7QUFDRCxtQkFBYSxRQUFRO0FBQ3JCLFVBQUksUUFBUTtBQUFBLElBQ2I7QUFFQSxXQUFPLFVBQVUsVUFBVSxVQUFVLGVBQWUsTUFBUztBQUFBLEVBQzlEO0FBQ0Q7QUFuVmEscUJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
