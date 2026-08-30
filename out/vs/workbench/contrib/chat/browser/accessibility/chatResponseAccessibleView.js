import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { Emitter } from "../../../../../base/common/event.js";
import { isMarkdownString } from "../../../../../base/common/htmlContent.js";
import { stripIcons } from "../../../../../base/common/iconLabels.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { AccessibleViewProviderId, AccessibleViewType } from "../../../../../platform/accessibility/browser/accessibleView.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { AccessibilityVerbositySettingId } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { migrateLegacyTerminalToolSpecificData } from "../../common/chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatToolInvocation, isLegacyChatTerminalToolInvocationData } from "../../common/chatService/chatService.js";
import { isResponseVM } from "../../common/model/chatViewModel.js";
import { isToolResultInputOutputDetails, isToolResultOutputDetails, toolContentToA11yString } from "../../common/tools/languageModelToolsService.js";
import { IChatWidgetService } from "../chat.js";
import { isLocation } from "../../../../../editor/common/languages.js";
class ChatResponseAccessibleView {
  constructor() {
    this.priority = 100;
    this.name = "panelChat";
    this.type = AccessibleViewType.View;
    this.when = ChatContextKeys.inChatSession;
  }
  getProvider(accessor) {
    const widgetService = accessor.get(IChatWidgetService);
    const storageService = accessor.get(IStorageService);
    const widget = widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    const chatInputFocused = widget.hasInputFocus();
    if (chatInputFocused) {
      widget.focusResponseItem();
    }
    const verifiedWidget = widget;
    let focusedItem = verifiedWidget.getFocus();
    if (!focusedItem || !isResponseVM(focusedItem)) {
      const responseItems = verifiedWidget.viewModel?.getItems().filter(isResponseVM);
      const lastResponse = responseItems?.at(-1);
      if (lastResponse) {
        focusedItem = lastResponse;
        verifiedWidget.focus(lastResponse);
      }
    }
    if (!focusedItem || !isResponseVM(focusedItem)) {
      return;
    }
    return new ChatResponseAccessibleProvider(verifiedWidget, focusedItem, chatInputFocused, storageService);
  }
}
const CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY = "chat.accessibleView.includeThinking";
const CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_DEFAULT = true;
function isThinkingContentIncludedInAccessibleView(storageService) {
  return storageService.getBoolean(CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, StorageScope.PROFILE, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_DEFAULT);
}
function isOutputDetailsSerialized(obj) {
  return typeof obj === "object" && obj !== null && "output" in obj && typeof obj.output === "object" && obj.output?.type === "data" && typeof obj.output?.base64Data === "string";
}
function getToolSpecificDataDescription(toolSpecificData) {
  if (!toolSpecificData) {
    return "";
  }
  if (isLegacyChatTerminalToolInvocationData(toolSpecificData) || toolSpecificData.kind === "terminal") {
    const terminalData = migrateLegacyTerminalToolSpecificData(toolSpecificData);
    return terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
  }
  switch (toolSpecificData.kind) {
    case "subagent": {
      const parts = [];
      if (toolSpecificData.agentName) {
        parts.push(localize("subagentName", "Agent: {0}", toolSpecificData.agentName));
      }
      if (toolSpecificData.description) {
        parts.push(toolSpecificData.description);
      }
      if (toolSpecificData.prompt) {
        parts.push(localize("subagentPrompt", "Task: {0}", toolSpecificData.prompt));
      }
      return parts.join(". ") || "";
    }
    case "extensions":
      return toolSpecificData.extensions.length > 0 ? localize("extensionsList", "Extensions: {0}", toolSpecificData.extensions.join(", ")) : "";
    case "todoList": {
      const todos = toolSpecificData.todoList;
      if (todos.length === 0) {
        return "";
      }
      const todoDescriptions = todos.map(
        (t) => localize("todoItem", "{0} ({1})", t.title, t.status)
      );
      return localize("todoListCount", "{0} items: {1}", todos.length, todoDescriptions.join("; "));
    }
    case "pullRequest":
      return localize("pullRequestInfo", "PR: {0} by {1}", toolSpecificData.title, toolSpecificData.author);
    case "input":
      return typeof toolSpecificData.rawInput === "string" ? toolSpecificData.rawInput : JSON.stringify(toolSpecificData.rawInput);
    case "resources": {
      const values = toolSpecificData.values;
      if (values.length === 0) {
        return "";
      }
      const paths = values.map((v) => {
        if ("uri" in v && "range" in v) {
          return `${v.uri.fsPath || v.uri.path}:${v.range.startLineNumber}`;
        } else {
          return v.fsPath || v.path;
        }
      }).join(", ");
      return localize("resourcesList", "Resources: {0}", paths);
    }
    case "simpleToolInvocation": {
      const inputText = toolSpecificData.input;
      const outputText = toolSpecificData.output;
      return localize("simpleToolInvocation", "Input: {0}, Output: {1}", inputText, outputText);
    }
    case "modifiedFilesConfirmation": {
      if (toolSpecificData.modifiedFiles.length === 0) {
        return "";
      }
      return localize("modifiedFilesConfirmation", "Modified files: {0}", toolSpecificData.modifiedFiles.map((file) => {
        const revivedUri = URI.revive(file.uri);
        return revivedUri.fsPath || revivedUri.path;
      }).join(", "));
    }
    case "automationConfigured":
      return toolSpecificData.operation === "created" ? localize("automationConfigured.created", "Created an automation: {0}", toolSpecificData.automationName) : localize("automationConfigured.updated", "Edited an automation: {0}", toolSpecificData.automationName);
    default:
      return "";
  }
}
function getResultDetailsDescription(resultDetails) {
  if (!resultDetails) {
    return {};
  }
  if (Array.isArray(resultDetails)) {
    const files = resultDetails.map((ref) => {
      if (URI.isUri(ref)) {
        return ref.fsPath || ref.path;
      }
      return ref.uri.fsPath || ref.uri.path;
    });
    return { files };
  }
  if (isToolResultInputOutputDetails(resultDetails)) {
    return {
      input: resultDetails.input,
      isError: resultDetails.isError
    };
  }
  if (isOutputDetailsSerialized(resultDetails)) {
    return {
      input: localize("binaryOutput", "{0} data", resultDetails.output.mimeType)
    };
  }
  if (isToolResultOutputDetails(resultDetails)) {
    return {
      input: localize("binaryOutput", "{0} data", resultDetails.output.mimeType)
    };
  }
  return {};
}
function getToolInvocationA11yDescription(invocationMessage, pastTenseMessage, toolSpecificData, resultDetails, isComplete) {
  const parts = [];
  const message = isComplete && pastTenseMessage ? pastTenseMessage : invocationMessage;
  if (message) {
    parts.push(message);
  }
  const toolDataDesc = getToolSpecificDataDescription(toolSpecificData);
  if (toolDataDesc) {
    parts.push(toolDataDesc);
  }
  if (isComplete && resultDetails) {
    const details = getResultDetailsDescription(resultDetails);
    if (details.isError) {
      parts.unshift(localize("errored", "Errored"));
    }
    if (details.input && !toolDataDesc) {
      parts.push(localize("input", "Input: {0}", details.input));
    }
    if (details.files && details.files.length > 0) {
      parts.push(localize("files", "Files: {0}", details.files.join(", ")));
    }
  }
  return parts.join(". ");
}
class ChatResponseAccessibleProvider extends Disposable {
  constructor(_widget, item, _wasOpenedFromInput, _storageService) {
    super();
    this._widget = _widget;
    this._wasOpenedFromInput = _wasOpenedFromInput;
    this._storageService = _storageService;
    this._focusedItemDisposables = this._register(new DisposableStore());
    this._storageDisposables = this._register(new DisposableStore());
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this.id = AccessibleViewProviderId.PanelChat;
    this.verbositySettingKey = AccessibilityVerbositySettingId.Chat;
    this.options = { type: AccessibleViewType.View };
    this._storageDisposables.add(this._storageService.onDidChangeValue(StorageScope.PROFILE, CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY, this._storageDisposables)(() => {
      this._onDidChangeContent.fire();
    }));
    this._setFocusedItem(item);
  }
  provideContent() {
    return this._getContent(this._focusedItem);
  }
  _setFocusedItem(item) {
    this._focusedItem = item;
    this._focusedItemDisposables.clear();
    if (isResponseVM(item)) {
      this._focusedItemDisposables.add(item.model.onDidChange(() => this._onDidChangeContent.fire()));
    }
  }
  _getContent(item) {
    if (!isResponseVM(item)) {
      return "";
    }
    const parts = getChatResponsePlaintextParts(item, this._shouldIncludeThinkingContent());
    return this._normalizeWhitespace(parts.map((part) => part.text).join("\n"));
  }
  _normalizeWhitespace(content) {
    const lines = content.split(/\r?\n/);
    const normalized = [];
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue;
      }
      normalized.push(line);
    }
    return normalized.join("\n");
  }
  _shouldIncludeThinkingContent() {
    return isThinkingContentIncludedInAccessibleView(this._storageService);
  }
  onClose() {
    this._widget.reveal(this._focusedItem);
    if (this._wasOpenedFromInput) {
      this._widget.focusInput();
    } else {
      this._widget.focus(this._focusedItem);
    }
  }
  provideNextContent() {
    const next = this._widget.getSibling(this._focusedItem, "next");
    if (next) {
      this._setFocusedItem(next);
      return this._getContent(next);
    }
    return;
  }
  providePreviousContent() {
    const previous = this._widget.getSibling(this._focusedItem, "previous");
    if (previous) {
      this._setFocusedItem(previous);
      return this._getContent(previous);
    }
    return;
  }
}
function renderChatMessageAsPlaintext(message) {
  return typeof message === "string" ? message : stripIcons(renderAsPlaintext(message, { useLinkFormatter: true }));
}
function getChatResponsePlaintextParts(item, includeThinking) {
  const contentParts = [];
  if ("errorDetails" in item && item.errorDetails) {
    contentParts.push({ partIndex: -1, text: item.errorDetails.message });
  }
  item.response.value.forEach((part, partIndex) => {
    switch (part.kind) {
      case "thinking": {
        if (!includeThinking) {
          break;
        }
        const thinkingValue = Array.isArray(part.value) ? part.value.join("") : part.value || "";
        const trimmed = thinkingValue.trim();
        if (trimmed) {
          contentParts.push({ partIndex, text: localize("thinkingContent", "Thinking: {0}", trimmed) });
        }
        break;
      }
      case "markdownContent": {
        const text = renderAsPlaintext(part.content, { includeCodeBlocksFences: true, useLinkFormatter: true });
        if (text.trim()) {
          contentParts.push({ partIndex, text });
        }
        break;
      }
      case "inlineReference": {
        const ref = part.inlineReference;
        let text;
        if (URI.isUri(ref)) {
          const name = part.name || basename(ref);
          const path = ref.scheme === "file" ? ref.path : ref.toString(true);
          text = name !== path ? `${name} (${path})` : path;
        } else if (isLocation(ref)) {
          const name = part.name || basename(ref.uri);
          const path = ref.uri.scheme === "file" ? ref.uri.path : ref.uri.toString(true);
          text = `${name} (${path}:${ref.range.startLineNumber})`;
        } else {
          const path = ref.location.uri.scheme === "file" ? ref.location.uri.fsPath || ref.location.uri.path : ref.location.uri.toString(true);
          text = `${ref.name} (${path}:${ref.location.range.startLineNumber})`;
        }
        contentParts.push({ partIndex, text });
        break;
      }
      case "elicitation2":
      case "elicitationSerialized": {
        const title = part.title;
        let elicitationContent = "";
        if (typeof title === "string") {
          elicitationContent += `${title}
`;
        } else if (isMarkdownString(title)) {
          elicitationContent += renderAsPlaintext(title, { includeCodeBlocksFences: true }) + "\n";
        }
        const message = part.message;
        if (isMarkdownString(message)) {
          elicitationContent += renderAsPlaintext(message, { includeCodeBlocksFences: true });
        } else {
          elicitationContent += message;
        }
        if (elicitationContent.trim()) {
          contentParts.push({ partIndex, text: elicitationContent });
        }
        break;
      }
      case "toolInvocation": {
        const state = part.state.get();
        if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages?.title) {
          const title = renderChatMessageAsPlaintext(state.confirmationMessages.title);
          const message = state.confirmationMessages.message ? renderChatMessageAsPlaintext(state.confirmationMessages.message) : "";
          const toolDataDesc = getToolSpecificDataDescription(part.toolSpecificData);
          let toolContent = title;
          if (toolDataDesc) {
            toolContent += `: ${toolDataDesc}`;
          }
          if (message) {
            toolContent += `
${message}`;
          }
          contentParts.push({ partIndex, text: toolContent });
        } else if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
          contentParts.push({ partIndex, text: localize("toolAuthenticationA11yView", "MCP authentication required for {0} to continue {1}.", state.server.name, part.toolId) });
        } else if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
          const postApprovalDetails = isToolResultInputOutputDetails(state.resultDetails) ? state.resultDetails.input : isToolResultOutputDetails(state.resultDetails) ? void 0 : toolContentToA11yString(state.contentForModel);
          contentParts.push({ partIndex, text: localize("toolPostApprovalA11yView", "Approve results of {0}? Result: ", part.toolId) + (postApprovalDetails ?? "") });
        } else {
          const resultDetails = IChatToolInvocation.resultDetails(part);
          const isComplete = IChatToolInvocation.isComplete(part);
          const description = getToolInvocationA11yDescription(
            renderChatMessageAsPlaintext(part.invocationMessage),
            part.pastTenseMessage ? renderChatMessageAsPlaintext(part.pastTenseMessage) : void 0,
            part.toolSpecificData,
            resultDetails,
            isComplete
          );
          if (description) {
            contentParts.push({ partIndex, text: description });
          }
        }
        break;
      }
      case "toolInvocationSerialized": {
        const description = getToolInvocationA11yDescription(
          renderChatMessageAsPlaintext(part.invocationMessage),
          part.pastTenseMessage ? renderChatMessageAsPlaintext(part.pastTenseMessage) : void 0,
          part.toolSpecificData,
          part.resultDetails,
          part.isComplete
        );
        if (description) {
          contentParts.push({ partIndex, text: description });
        }
        break;
      }
      case "autoModeResolution": {
        if (part.predictedLabel === "fallback") {
          contentParts.push({ partIndex, text: localize("autoModeResolutionA11yFallback", "Routed to {0}. Unable to resolve.", part.resolvedModelName) });
        } else {
          const label = part.predictedLabel === "needs_reasoning" ? localize("autoModeResolutionA11yReasoning", "Reasoning") : localize("autoModeResolutionA11yNonReasoning", "Non-reasoning");
          contentParts.push({ partIndex, text: localize("autoModeResolutionA11y", "Routed to {0}. {1} - Confidence {2}%", part.resolvedModelName, label, (part.confidence * 100).toFixed(0)) });
        }
        break;
      }
    }
  });
  return contentParts;
}
export {
  CHAT_ACCESSIBLE_VIEW_INCLUDE_THINKING_STORAGE_KEY,
  ChatResponseAccessibleView,
  getChatResponsePlaintextParts,
  getResultDetailsDescription,
  getToolInvocationA11yDescription,
  getToolSpecificDataDescription,
  isThinkingContentIncludedInAccessibleView,
  renderChatMessageAsPlaintext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjY2Vzc2liaWxpdHlcXGNoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLCBBY2Nlc3NpYmxlVmlld1R5cGUsIElBY2Nlc3NpYmxlVmlld0NvbnRlbnRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJsZVZpZXdJbXBsZW1lbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG1pZ3JhdGVMZWdhY3lUZXJtaW5hbFRvb2xTcGVjaWZpY0RhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29uZmlybWF0aW9uRGF0YSwgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJhdGlvbkRhdGEsIElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWREYXRhLCBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LCBJQ2hhdEdlbmVyYXRlZEltYWdlRGF0YSwgSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSwgSUNoYXRQdWxsUmVxdWVzdENvbnRlbnQsIElDaGF0U2VhcmNoVG9vbEludm9jYXRpb25EYXRhLCBJQ2hhdFNlc3Npb25DcmVhdGVkRGF0YSwgSUNoYXRTaW1wbGVUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0U3ViYWdlbnRUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0VG9kb0xpc3RDb250ZW50LCBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJQ2hhdFRvb2xSZXNvdXJjZXNJbnZvY2F0aW9uRGF0YSwgSUxlZ2FjeUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzU2VyaWFsaXplZCwgaXNMZWdhY3lDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMsIElUb29sUmVzdWx0T3V0cHV0RGV0YWlscywgaXNUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzLCBpc1Rvb2xSZXN1bHRPdXRwdXREZXRhaWxzLCB0b29sQ29udGVudFRvQTExeVN0cmluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSwgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgaXNMb2NhdGlvbiwgTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldyBpbXBsZW1lbnRzIElBY2Nlc3NpYmxlVmlld0ltcGxlbWVudGF0aW9uIHtcblx0cmVhZG9ubHkgcHJpb3JpdHkgPSAxMDA7XG5cdHJlYWRvbmx5IG5hbWUgPSAncGFuZWxDaGF0Jztcblx0cmVhZG9ubHkgdHlwZSA9IEFjY2Vzc2libGVWaWV3VHlwZS5WaWV3O1xuXHRyZWFkb25seSB3aGVuID0gQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb247XG5cdGdldFByb3ZpZGVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0SW5wdXRGb2N1c2VkID0gd2lkZ2V0Lmhhc0lucHV0Rm9jdXMoKTtcblx0XHRpZiAoY2hhdElucHV0Rm9jdXNlZCkge1xuXHRcdFx0d2lkZ2V0LmZvY3VzUmVzcG9uc2VJdGVtKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmVyaWZpZWRXaWRnZXQ6IElDaGF0V2lkZ2V0ID0gd2lkZ2V0O1xuXHRcdGxldCBmb2N1c2VkSXRlbSA9IHZlcmlmaWVkV2lkZ2V0LmdldEZvY3VzKCk7XG5cdFx0aWYgKCFmb2N1c2VkSXRlbSB8fCAhaXNSZXNwb25zZVZNKGZvY3VzZWRJdGVtKSkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VJdGVtcyA9IHZlcmlmaWVkV2lkZ2V0LnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5maWx0ZXIoaXNSZXNwb25zZVZNKTtcblx0XHRcdGNvbnN0IGxhc3RSZXNwb25zZSA9IHJlc3BvbnNlSXRlbXM/LmF0KC0xKTtcblx0XHRcdGlmIChsYXN0UmVzcG9uc2UpIHtcblx0XHRcdFx0Zm9jdXNlZEl0ZW0gPSBsYXN0UmVzcG9uc2U7XG5cdFx0XHRcdHZlcmlmaWVkV2lkZ2V0LmZvY3VzKGxhc3RSZXNwb25zZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFmb2N1c2VkSXRlbSB8fCAhaXNSZXNwb25zZVZNKGZvY3VzZWRJdGVtKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgQ2hhdFJlc3BvbnNlQWNjZXNzaWJsZVByb3ZpZGVyKHZlcmlmaWVkV2lkZ2V0LCBmb2N1c2VkSXRlbSwgY2hhdElucHV0Rm9jdXNlZCwgc3RvcmFnZVNlcnZpY2UpO1xuXHR9XG59XG5cbnR5cGUgVG9vbFNwZWNpZmljRGF0YSA9IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfCBJTGVnYWN5Q2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YSB8IElDaGF0RXh0ZW5zaW9uc0NvbnRlbnQgfCBJQ2hhdFB1bGxSZXF1ZXN0Q29udGVudCB8IElDaGF0VG9kb0xpc3RDb250ZW50IHwgSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSB8IElDaGF0U2ltcGxlVG9vbEludm9jYXRpb25EYXRhIHwgSUNoYXRTZWFyY2hUb29sSW52b2NhdGlvbkRhdGEgfCBJQ2hhdFRvb2xSZXNvdXJjZXNJbnZvY2F0aW9uRGF0YSB8IElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGEgfCBJQ2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb25EYXRhIHwgSUNoYXRTZXNzaW9uQ3JlYXRlZERhdGEgfCBJQ2hhdEdlbmVyYXRlZEltYWdlRGF0YSB8IElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyYXRpb25EYXRhIHwgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJlZERhdGE7XG50eXBlIFJlc3VsdERldGFpbHMgPSBBcnJheTxVUkkgfCBMb2NhdGlvbj4gfCBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyB8IElUb29sUmVzdWx0T3V0cHV0RGV0YWlscyB8IElUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQ7XG5cbmV4cG9ydCBjb25zdCBDSEFUX0FDQ0VTU0lCTEVfVklFV19JTkNMVURFX1RISU5LSU5HX1NUT1JBR0VfS0VZID0gJ2NoYXQuYWNjZXNzaWJsZVZpZXcuaW5jbHVkZVRoaW5raW5nJztcbmNvbnN0IENIQVRfQUNDRVNTSUJMRV9WSUVXX0lOQ0xVREVfVEhJTktJTkdfREVGQVVMVCA9IHRydWU7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1RoaW5raW5nQ29udGVudEluY2x1ZGVkSW5BY2Nlc3NpYmxlVmlldyhzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdHJldHVybiBzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKENIQVRfQUNDRVNTSUJMRV9WSUVXX0lOQ0xVREVfVEhJTktJTkdfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBDSEFUX0FDQ0VTU0lCTEVfVklFV19JTkNMVURFX1RISU5LSU5HX0RFRkFVTFQpO1xufVxuXG5mdW5jdGlvbiBpc091dHB1dERldGFpbHNTZXJpYWxpemVkKG9iajogdW5rbm93bik6IG9iaiBpcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkIHtcblx0cmV0dXJuIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCAmJiAnb3V0cHV0JyBpbiBvYmogJiZcblx0XHR0eXBlb2YgKG9iaiBhcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkKS5vdXRwdXQgPT09ICdvYmplY3QnICYmXG5cdFx0KG9iaiBhcyBJVG9vbFJlc3VsdE91dHB1dERldGFpbHNTZXJpYWxpemVkKS5vdXRwdXQ/LnR5cGUgPT09ICdkYXRhJyAmJlxuXHRcdHR5cGVvZiAob2JqIGFzIElUb29sUmVzdWx0T3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQpLm91dHB1dD8uYmFzZTY0RGF0YSA9PT0gJ3N0cmluZyc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUb29sU3BlY2lmaWNEYXRhRGVzY3JpcHRpb24odG9vbFNwZWNpZmljRGF0YTogVG9vbFNwZWNpZmljRGF0YSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmICghdG9vbFNwZWNpZmljRGF0YSkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGlmIChpc0xlZ2FjeUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSh0b29sU3BlY2lmaWNEYXRhKSB8fCB0b29sU3BlY2lmaWNEYXRhLmtpbmQgPT09ICd0ZXJtaW5hbCcpIHtcblx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSBtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhKHRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdHJldHVybiB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudXNlckVkaXRlZCA/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCA/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUub3JpZ2luYWw7XG5cdH1cblxuXHRzd2l0Y2ggKHRvb2xTcGVjaWZpY0RhdGEua2luZCkge1xuXHRcdGNhc2UgJ3N1YmFnZW50Jzoge1xuXHRcdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAodG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWUpIHtcblx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnc3ViYWdlbnROYW1lJywgXCJBZ2VudDogezB9XCIsIHRvb2xTcGVjaWZpY0RhdGEuYWdlbnROYW1lKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9vbFNwZWNpZmljRGF0YS5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKHRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRvb2xTcGVjaWZpY0RhdGEucHJvbXB0KSB7XG5cdFx0XHRcdHBhcnRzLnB1c2gobG9jYWxpemUoJ3N1YmFnZW50UHJvbXB0JywgXCJUYXNrOiB7MH1cIiwgdG9vbFNwZWNpZmljRGF0YS5wcm9tcHQpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXJ0cy5qb2luKCcuICcpIHx8ICcnO1xuXHRcdH1cblx0XHRjYXNlICdleHRlbnNpb25zJzpcblx0XHRcdHJldHVybiB0b29sU3BlY2lmaWNEYXRhLmV4dGVuc2lvbnMubGVuZ3RoID4gMFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdleHRlbnNpb25zTGlzdCcsIFwiRXh0ZW5zaW9uczogezB9XCIsIHRvb2xTcGVjaWZpY0RhdGEuZXh0ZW5zaW9ucy5qb2luKCcsICcpKVxuXHRcdFx0XHQ6ICcnO1xuXHRcdGNhc2UgJ3RvZG9MaXN0Jzoge1xuXHRcdFx0Y29uc3QgdG9kb3MgPSB0b29sU3BlY2lmaWNEYXRhLnRvZG9MaXN0O1xuXHRcdFx0aWYgKHRvZG9zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0b2RvRGVzY3JpcHRpb25zID0gdG9kb3MubWFwKHQgPT5cblx0XHRcdFx0bG9jYWxpemUoJ3RvZG9JdGVtJywgXCJ7MH0gKHsxfSlcIiwgdC50aXRsZSwgdC5zdGF0dXMpXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b2RvTGlzdENvdW50JywgXCJ7MH0gaXRlbXM6IHsxfVwiLCB0b2Rvcy5sZW5ndGgsIHRvZG9EZXNjcmlwdGlvbnMuam9pbignOyAnKSk7XG5cdFx0fVxuXHRcdGNhc2UgJ3B1bGxSZXF1ZXN0Jzpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHVsbFJlcXVlc3RJbmZvJywgXCJQUjogezB9IGJ5IHsxfVwiLCB0b29sU3BlY2lmaWNEYXRhLnRpdGxlLCB0b29sU3BlY2lmaWNEYXRhLmF1dGhvcik7XG5cdFx0Y2FzZSAnaW5wdXQnOlxuXHRcdFx0cmV0dXJuIHR5cGVvZiB0b29sU3BlY2lmaWNEYXRhLnJhd0lucHV0ID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQ/IHRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXRcblx0XHRcdFx0OiBKU09OLnN0cmluZ2lmeSh0b29sU3BlY2lmaWNEYXRhLnJhd0lucHV0KTtcblx0XHRjYXNlICdyZXNvdXJjZXMnOiB7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSB0b29sU3BlY2lmaWNEYXRhLnZhbHVlcztcblx0XHRcdGlmICh2YWx1ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhdGhzID0gdmFsdWVzLm1hcCh2ID0+IHtcblx0XHRcdFx0aWYgKCd1cmknIGluIHYgJiYgJ3JhbmdlJyBpbiB2KSB7XG5cdFx0XHRcdFx0Ly8gTG9jYXRpb25cblx0XHRcdFx0XHRyZXR1cm4gYCR7di51cmkuZnNQYXRoIHx8IHYudXJpLnBhdGh9OiR7di5yYW5nZS5zdGFydExpbmVOdW1iZXJ9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBVUklcblx0XHRcdFx0XHRyZXR1cm4gdi5mc1BhdGggfHwgdi5wYXRoO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5qb2luKCcsICcpO1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdyZXNvdXJjZXNMaXN0JywgXCJSZXNvdXJjZXM6IHswfVwiLCBwYXRocyk7XG5cdFx0fVxuXHRcdGNhc2UgJ3NpbXBsZVRvb2xJbnZvY2F0aW9uJzoge1xuXHRcdFx0Y29uc3QgaW5wdXRUZXh0ID0gdG9vbFNwZWNpZmljRGF0YS5pbnB1dDtcblx0XHRcdGNvbnN0IG91dHB1dFRleHQgPSB0b29sU3BlY2lmaWNEYXRhLm91dHB1dDtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2ltcGxlVG9vbEludm9jYXRpb24nLCBcIklucHV0OiB7MH0sIE91dHB1dDogezF9XCIsIGlucHV0VGV4dCwgb3V0cHV0VGV4dCk7XG5cdFx0fVxuXHRcdGNhc2UgJ21vZGlmaWVkRmlsZXNDb25maXJtYXRpb24nOiB7XG5cdFx0XHRpZiAodG9vbFNwZWNpZmljRGF0YS5tb2RpZmllZEZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbicsIFwiTW9kaWZpZWQgZmlsZXM6IHswfVwiLCB0b29sU3BlY2lmaWNEYXRhLm1vZGlmaWVkRmlsZXMubWFwKGZpbGUgPT4ge1xuXHRcdFx0XHRjb25zdCByZXZpdmVkVXJpID0gVVJJLnJldml2ZShmaWxlLnVyaSk7XG5cdFx0XHRcdHJldHVybiByZXZpdmVkVXJpLmZzUGF0aCB8fCByZXZpdmVkVXJpLnBhdGg7XG5cdFx0XHR9KS5qb2luKCcsICcpKTtcblx0XHR9XG5cdFx0Y2FzZSAnYXV0b21hdGlvbkNvbmZpZ3VyZWQnOlxuXHRcdFx0cmV0dXJuIHRvb2xTcGVjaWZpY0RhdGEub3BlcmF0aW9uID09PSAnY3JlYXRlZCdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnYXV0b21hdGlvbkNvbmZpZ3VyZWQuY3JlYXRlZCcsIFwiQ3JlYXRlZCBhbiBhdXRvbWF0aW9uOiB7MH1cIiwgdG9vbFNwZWNpZmljRGF0YS5hdXRvbWF0aW9uTmFtZSlcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYXV0b21hdGlvbkNvbmZpZ3VyZWQudXBkYXRlZCcsIFwiRWRpdGVkIGFuIGF1dG9tYXRpb246IHswfVwiLCB0b29sU3BlY2lmaWNEYXRhLmF1dG9tYXRpb25OYW1lKTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuICcnO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXN1bHREZXRhaWxzRGVzY3JpcHRpb24ocmVzdWx0RGV0YWlsczogUmVzdWx0RGV0YWlscyB8IHVuZGVmaW5lZCk6IHsgaW5wdXQ/OiBzdHJpbmc7IGZpbGVzPzogc3RyaW5nW107IGlzRXJyb3I/OiBib29sZWFuIH0ge1xuXHRpZiAoIXJlc3VsdERldGFpbHMpIHtcblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRpZiAoQXJyYXkuaXNBcnJheShyZXN1bHREZXRhaWxzKSkge1xuXHRcdGNvbnN0IGZpbGVzID0gcmVzdWx0RGV0YWlscy5tYXAocmVmID0+IHtcblx0XHRcdGlmIChVUkkuaXNVcmkocmVmKSkge1xuXHRcdFx0XHRyZXR1cm4gcmVmLmZzUGF0aCB8fCByZWYucGF0aDtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZWYudXJpLmZzUGF0aCB8fCByZWYudXJpLnBhdGg7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHsgZmlsZXMgfTtcblx0fVxuXG5cdGlmIChpc1Rvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMocmVzdWx0RGV0YWlscykpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5wdXQ6IHJlc3VsdERldGFpbHMuaW5wdXQsXG5cdFx0XHRpc0Vycm9yOiByZXN1bHREZXRhaWxzLmlzRXJyb3Jcblx0XHR9O1xuXHR9XG5cblx0aWYgKGlzT3V0cHV0RGV0YWlsc1NlcmlhbGl6ZWQocmVzdWx0RGV0YWlscykpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5wdXQ6IGxvY2FsaXplKCdiaW5hcnlPdXRwdXQnLCBcInswfSBkYXRhXCIsIHJlc3VsdERldGFpbHMub3V0cHV0Lm1pbWVUeXBlKVxuXHRcdH07XG5cdH1cblxuXHRpZiAoaXNUb29sUmVzdWx0T3V0cHV0RGV0YWlscyhyZXN1bHREZXRhaWxzKSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnB1dDogbG9jYWxpemUoJ2JpbmFyeU91dHB1dCcsIFwiezB9IGRhdGFcIiwgcmVzdWx0RGV0YWlscy5vdXRwdXQubWltZVR5cGUpXG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiB7fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRvb2xJbnZvY2F0aW9uQTExeURlc2NyaXB0aW9uKFxuXHRpbnZvY2F0aW9uTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRwYXN0VGVuc2VNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdHRvb2xTcGVjaWZpY0RhdGE6IFRvb2xTcGVjaWZpY0RhdGEgfCB1bmRlZmluZWQsXG5cdHJlc3VsdERldGFpbHM6IFJlc3VsdERldGFpbHMgfCB1bmRlZmluZWQsXG5cdGlzQ29tcGxldGU6IGJvb2xlYW5cbik6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdGNvbnN0IG1lc3NhZ2UgPSBpc0NvbXBsZXRlICYmIHBhc3RUZW5zZU1lc3NhZ2UgPyBwYXN0VGVuc2VNZXNzYWdlIDogaW52b2NhdGlvbk1lc3NhZ2U7XG5cdGlmIChtZXNzYWdlKSB7XG5cdFx0cGFydHMucHVzaChtZXNzYWdlKTtcblx0fVxuXG5cdGNvbnN0IHRvb2xEYXRhRGVzYyA9IGdldFRvb2xTcGVjaWZpY0RhdGFEZXNjcmlwdGlvbih0b29sU3BlY2lmaWNEYXRhKTtcblx0aWYgKHRvb2xEYXRhRGVzYykge1xuXHRcdHBhcnRzLnB1c2godG9vbERhdGFEZXNjKTtcblx0fVxuXG5cdGlmIChpc0NvbXBsZXRlICYmIHJlc3VsdERldGFpbHMpIHtcblx0XHRjb25zdCBkZXRhaWxzID0gZ2V0UmVzdWx0RGV0YWlsc0Rlc2NyaXB0aW9uKHJlc3VsdERldGFpbHMpO1xuXHRcdGlmIChkZXRhaWxzLmlzRXJyb3IpIHtcblx0XHRcdHBhcnRzLnVuc2hpZnQobG9jYWxpemUoJ2Vycm9yZWQnLCBcIkVycm9yZWRcIikpO1xuXHRcdH1cblx0XHRpZiAoZGV0YWlscy5pbnB1dCAmJiAhdG9vbERhdGFEZXNjKSB7XG5cdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdpbnB1dCcsIFwiSW5wdXQ6IHswfVwiLCBkZXRhaWxzLmlucHV0KSk7XG5cdFx0fVxuXHRcdGlmIChkZXRhaWxzLmZpbGVzICYmIGRldGFpbHMuZmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnZmlsZXMnLCBcIkZpbGVzOiB7MH1cIiwgZGV0YWlscy5maWxlcy5qb2luKCcsICcpKSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHBhcnRzLmpvaW4oJy4gJyk7XG59XG5cbmNsYXNzIENoYXRSZXNwb25zZUFjY2Vzc2libGVQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWNjZXNzaWJsZVZpZXdDb250ZW50UHJvdmlkZXIge1xuXHRwcml2YXRlIF9mb2N1c2VkSXRlbSE6IENoYXRUcmVlSXRlbTtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNlZEl0ZW1EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmV2ZW50O1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXQ6IElDaGF0V2lkZ2V0LFxuXHRcdGl0ZW06IENoYXRUcmVlSXRlbSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93YXNPcGVuZWRGcm9tSW5wdXQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0b3JhZ2VEaXNwb3NhYmxlcy5hZGQodGhpcy5fc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuUFJPRklMRSwgQ0hBVF9BQ0NFU1NJQkxFX1ZJRVdfSU5DTFVERV9USElOS0lOR19TVE9SQUdFX0tFWSwgdGhpcy5fc3RvcmFnZURpc3Bvc2FibGVzKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zZXRGb2N1c2VkSXRlbShpdGVtKTtcblx0fVxuXG5cdHJlYWRvbmx5IGlkID0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlBhbmVsQ2hhdDtcblx0cmVhZG9ubHkgdmVyYm9zaXR5U2V0dGluZ0tleSA9IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuQ2hhdDtcblx0cmVhZG9ubHkgb3B0aW9ucyA9IHsgdHlwZTogQWNjZXNzaWJsZVZpZXdUeXBlLlZpZXcgfTtcblxuXHRwcm92aWRlQ29udGVudCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9nZXRDb250ZW50KHRoaXMuX2ZvY3VzZWRJdGVtKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEZvY3VzZWRJdGVtKGl0ZW06IENoYXRUcmVlSXRlbSk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvY3VzZWRJdGVtID0gaXRlbTtcblx0XHR0aGlzLl9mb2N1c2VkSXRlbURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShpdGVtKSkge1xuXHRcdFx0dGhpcy5fZm9jdXNlZEl0ZW1EaXNwb3NhYmxlcy5hZGQoaXRlbS5tb2RlbC5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29udGVudChpdGVtOiBDaGF0VHJlZUl0ZW0pOiBzdHJpbmcge1xuXHRcdGlmICghaXNSZXNwb25zZVZNKGl0ZW0pKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFydHMgPSBnZXRDaGF0UmVzcG9uc2VQbGFpbnRleHRQYXJ0cyhpdGVtLCB0aGlzLl9zaG91bGRJbmNsdWRlVGhpbmtpbmdDb250ZW50KCkpO1xuXHRcdHJldHVybiB0aGlzLl9ub3JtYWxpemVXaGl0ZXNwYWNlKHBhcnRzLm1hcChwYXJ0ID0+IHBhcnQudGV4dCkuam9pbignXFxuJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm9ybWFsaXplV2hpdGVzcGFjZShjb250ZW50OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgvXFxyP1xcbi8pO1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRpZiAobGluZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bm9ybWFsaXplZC5wdXNoKGxpbmUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbm9ybWFsaXplZC5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZEluY2x1ZGVUaGlua2luZ0NvbnRlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzVGhpbmtpbmdDb250ZW50SW5jbHVkZWRJbkFjY2Vzc2libGVWaWV3KHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdG9uQ2xvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LnJldmVhbCh0aGlzLl9mb2N1c2VkSXRlbSk7XG5cdFx0aWYgKHRoaXMuX3dhc09wZW5lZEZyb21JbnB1dCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LmZvY3VzSW5wdXQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LmZvY3VzKHRoaXMuX2ZvY3VzZWRJdGVtKTtcblx0XHR9XG5cdH1cblxuXHRwcm92aWRlTmV4dENvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBuZXh0ID0gdGhpcy5fd2lkZ2V0LmdldFNpYmxpbmcodGhpcy5fZm9jdXNlZEl0ZW0sICduZXh0Jyk7XG5cdFx0aWYgKG5leHQpIHtcblx0XHRcdHRoaXMuX3NldEZvY3VzZWRJdGVtKG5leHQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldENvbnRlbnQobmV4dCk7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdHByb3ZpZGVQcmV2aW91c0NvbnRlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3dpZGdldC5nZXRTaWJsaW5nKHRoaXMuX2ZvY3VzZWRJdGVtLCAncHJldmlvdXMnKTtcblx0XHRpZiAocHJldmlvdXMpIHtcblx0XHRcdHRoaXMuX3NldEZvY3VzZWRJdGVtKHByZXZpb3VzKTtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRDb250ZW50KHByZXZpb3VzKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG59XG5cbi8qKlxuICogQSBzaW5nbGUgdW5pdCBvZiBwbGFpbnRleHQgZXh0cmFjdGVkIGZyb20gYSBjaGF0IHJlc3BvbnNlLCBrZXllZCB0byBpdHNcbiAqIG9yaWdpbmF0aW5nIGNvbnRlbnQgcGFydCBzbyBjYWxsZXJzIChhY2Nlc3NpYmxlIHZpZXcsIHRyYW5zY3JpcHQgRmluZCkgY2FuXG4gKiBib3RoIHJlbmRlciBhbmQgbG9jYXRlIGl0LiBgcGFydEluZGV4YCBpcyB0aGUgaW5kZXggaW50b1xuICoge0BsaW5rIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwucmVzcG9uc2UudmFsdWV9LCBvciBgLTFgIGZvciB0aGUgc3ludGhldGljXG4gKiBlcnJvci1kZXRhaWxzIHBhcnQgdGhhdCBoYXMgbm8gY29ycmVzcG9uZGluZyBjb250ZW50IHBhcnQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZVBsYWludGV4dFBhcnQge1xuXHRyZWFkb25seSBwYXJ0SW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlbmRlcnMgYSBjaGF0IG1lc3NhZ2UgKG1hcmtkb3duIG9yIHBsYWluIHN0cmluZykgYXMgcGxhaW50ZXh0LCBzdHJpcHBpbmdcbiAqIGljb25zLiBTaGFyZWQgYnkgdGhlIGFjY2Vzc2libGUgdmlldyBhbmQgY2hhdCB0cmFuc2NyaXB0IEZpbmQgc28gYm90aFxuICogcHJlc2VudCB0aGUgZXhhY3Qgc2FtZSB0ZXh0IGZvciBhIGdpdmVuIG1lc3NhZ2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDaGF0TWVzc2FnZUFzUGxhaW50ZXh0KG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogc3RyaXBJY29ucyhyZW5kZXJBc1BsYWludGV4dChtZXNzYWdlLCB7IHVzZUxpbmtGb3JtYXR0ZXI6IHRydWUgfSkpO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIHRoZSBvcmRlcmVkLCBodW1hbi1yZWFkYWJsZSBwbGFpbnRleHQgY29udGVudCBvZiBhIGNoYXQgcmVzcG9uc2VcbiAqIGl0ZW0gYXMgYSBsaXN0IG9mIHBhcnRzIChtYXJrZG93biwgcmVhc29uaW5nL3RoaW5raW5nLCB0b29sIGludm9jYXRpb25zLFxuICogY29uZmlybWF0aW9ucywgcmVmZXJlbmNlcywgZXRjLiksIG9uZSBlbnRyeSBwZXIgcmVuZGVyZWQgY29udGVudCBwYXJ0LlxuICpcbiAqIFRoaXMgaXMgdGhlIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggZm9yIFwid2hhdCB0ZXh0IGRvZXMgdGhpcyByZXNwb25zZVxuICogY29udGFpblwiIG91dHNpZGUgb2YgdGhlIERPTTogaXQgYmFja3MgYm90aCB0aGUgQ2hhdCBhY2Nlc3NpYmxlIHZpZXcgYW5kXG4gKiB0aGUgdHJhbnNjcmlwdCBGaW5kIGZlYXR1cmUsIHNvIGNvbGxhcHNlZC92aXJ0dWFsaXplZCBjb250ZW50IHJlbWFpbnNcbiAqIGZ1bGx5IHNlYXJjaGFibGUgYW5kIGJvdGggZmVhdHVyZXMgc3RheSBpbiBzeW5jLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2hhdFJlc3BvbnNlUGxhaW50ZXh0UGFydHMoaXRlbTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaW5jbHVkZVRoaW5raW5nOiBib29sZWFuKTogSUNoYXRSZXNwb25zZVBsYWludGV4dFBhcnRbXSB7XG5cdGNvbnN0IGNvbnRlbnRQYXJ0czogSUNoYXRSZXNwb25zZVBsYWludGV4dFBhcnRbXSA9IFtdO1xuXG5cdGlmICgnZXJyb3JEZXRhaWxzJyBpbiBpdGVtICYmIGl0ZW0uZXJyb3JEZXRhaWxzKSB7XG5cdFx0Y29udGVudFBhcnRzLnB1c2goeyBwYXJ0SW5kZXg6IC0xLCB0ZXh0OiBpdGVtLmVycm9yRGV0YWlscy5tZXNzYWdlIH0pO1xuXHR9XG5cblx0Ly8gUHJvY2VzcyBhbGwgcGFydHMgaW4gb3JkZXIgdG8gbWFpbnRhaW4gdGhlIG5hdHVyYWwgZmxvd1xuXHRpdGVtLnJlc3BvbnNlLnZhbHVlLmZvckVhY2goKHBhcnQsIHBhcnRJbmRleCkgPT4ge1xuXHRcdHN3aXRjaCAocGFydC5raW5kKSB7XG5cdFx0XHRjYXNlICd0aGlua2luZyc6IHtcblx0XHRcdFx0aWYgKCFpbmNsdWRlVGhpbmtpbmcpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB0aGlua2luZ1ZhbHVlID0gQXJyYXkuaXNBcnJheShwYXJ0LnZhbHVlKSA/IHBhcnQudmFsdWUuam9pbignJykgOiAocGFydC52YWx1ZSB8fCAnJyk7XG5cdFx0XHRcdGNvbnN0IHRyaW1tZWQgPSB0aGlua2luZ1ZhbHVlLnRyaW0oKTtcblx0XHRcdFx0aWYgKHRyaW1tZWQpIHtcblx0XHRcdFx0XHRjb250ZW50UGFydHMucHVzaCh7IHBhcnRJbmRleCwgdGV4dDogbG9jYWxpemUoJ3RoaW5raW5nQ29udGVudCcsIFwiVGhpbmtpbmc6IHswfVwiLCB0cmltbWVkKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ21hcmtkb3duQ29udGVudCc6IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IHJlbmRlckFzUGxhaW50ZXh0KHBhcnQuY29udGVudCwgeyBpbmNsdWRlQ29kZUJsb2Nrc0ZlbmNlczogdHJ1ZSwgdXNlTGlua0Zvcm1hdHRlcjogdHJ1ZSB9KTtcblx0XHRcdFx0aWYgKHRleHQudHJpbSgpKSB7XG5cdFx0XHRcdFx0Y29udGVudFBhcnRzLnB1c2goeyBwYXJ0SW5kZXgsIHRleHQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdpbmxpbmVSZWZlcmVuY2UnOiB7XG5cdFx0XHRcdGNvbnN0IHJlZiA9IHBhcnQuaW5saW5lUmVmZXJlbmNlO1xuXHRcdFx0XHRsZXQgdGV4dDogc3RyaW5nO1xuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKHJlZikpIHtcblx0XHRcdFx0XHRjb25zdCBuYW1lID0gcGFydC5uYW1lIHx8IGJhc2VuYW1lKHJlZik7XG5cdFx0XHRcdFx0Y29uc3QgcGF0aCA9IHJlZi5zY2hlbWUgPT09ICdmaWxlJyA/IHJlZi5wYXRoIDogcmVmLnRvU3RyaW5nKHRydWUpO1xuXHRcdFx0XHRcdHRleHQgPSBuYW1lICE9PSBwYXRoID8gYCR7bmFtZX0gKCR7cGF0aH0pYCA6IHBhdGg7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNMb2NhdGlvbihyZWYpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmFtZSA9IHBhcnQubmFtZSB8fCBiYXNlbmFtZShyZWYudXJpKTtcblx0XHRcdFx0XHRjb25zdCBwYXRoID0gcmVmLnVyaS5zY2hlbWUgPT09ICdmaWxlJyA/IHJlZi51cmkucGF0aCA6IHJlZi51cmkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdFx0dGV4dCA9IGAke25hbWV9ICgke3BhdGh9OiR7cmVmLnJhbmdlLnN0YXJ0TGluZU51bWJlcn0pYDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBJV29ya3NwYWNlU3ltYm9sXG5cdFx0XHRcdFx0Y29uc3QgcGF0aCA9IHJlZi5sb2NhdGlvbi51cmkuc2NoZW1lID09PSAnZmlsZScgPyAocmVmLmxvY2F0aW9uLnVyaS5mc1BhdGggfHwgcmVmLmxvY2F0aW9uLnVyaS5wYXRoKSA6IHJlZi5sb2NhdGlvbi51cmkudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdFx0dGV4dCA9IGAke3JlZi5uYW1lfSAoJHtwYXRofToke3JlZi5sb2NhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXJ9KWA7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGVudFBhcnRzLnB1c2goeyBwYXJ0SW5kZXgsIHRleHQgfSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnZWxpY2l0YXRpb24yJzpcblx0XHRcdGNhc2UgJ2VsaWNpdGF0aW9uU2VyaWFsaXplZCc6IHtcblx0XHRcdFx0Y29uc3QgdGl0bGUgPSBwYXJ0LnRpdGxlO1xuXHRcdFx0XHRsZXQgZWxpY2l0YXRpb25Db250ZW50ID0gJyc7XG5cdFx0XHRcdGlmICh0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0ZWxpY2l0YXRpb25Db250ZW50ICs9IGAke3RpdGxlfVxcbmA7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNNYXJrZG93blN0cmluZyh0aXRsZSkpIHtcblx0XHRcdFx0XHRlbGljaXRhdGlvbkNvbnRlbnQgKz0gcmVuZGVyQXNQbGFpbnRleHQodGl0bGUsIHsgaW5jbHVkZUNvZGVCbG9ja3NGZW5jZXM6IHRydWUgfSkgKyAnXFxuJztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gcGFydC5tZXNzYWdlO1xuXHRcdFx0XHRpZiAoaXNNYXJrZG93blN0cmluZyhtZXNzYWdlKSkge1xuXHRcdFx0XHRcdGVsaWNpdGF0aW9uQ29udGVudCArPSByZW5kZXJBc1BsYWludGV4dChtZXNzYWdlLCB7IGluY2x1ZGVDb2RlQmxvY2tzRmVuY2VzOiB0cnVlIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVsaWNpdGF0aW9uQ29udGVudCArPSBtZXNzYWdlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlbGljaXRhdGlvbkNvbnRlbnQudHJpbSgpKSB7XG5cdFx0XHRcdFx0Y29udGVudFBhcnRzLnB1c2goeyBwYXJ0SW5kZXgsIHRleHQ6IGVsaWNpdGF0aW9uQ29udGVudCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Rvb2xJbnZvY2F0aW9uJzoge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHBhcnQuc3RhdGUuZ2V0KCk7XG5cdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uICYmIHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHRpdGxlID0gcmVuZGVyQ2hhdE1lc3NhZ2VBc1BsYWludGV4dChzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcy50aXRsZSk7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2UgPyByZW5kZXJDaGF0TWVzc2FnZUFzUGxhaW50ZXh0KHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLm1lc3NhZ2UpIDogJyc7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbERhdGFEZXNjID0gZ2V0VG9vbFNwZWNpZmljRGF0YURlc2NyaXB0aW9uKHBhcnQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRcdFx0bGV0IHRvb2xDb250ZW50ID0gdGl0bGU7XG5cdFx0XHRcdFx0aWYgKHRvb2xEYXRhRGVzYykge1xuXHRcdFx0XHRcdFx0dG9vbENvbnRlbnQgKz0gYDogJHt0b29sRGF0YURlc2N9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdHRvb2xDb250ZW50ICs9IGBcXG4ke21lc3NhZ2V9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29udGVudFBhcnRzLnB1c2goeyBwYXJ0SW5kZXgsIHRleHQ6IHRvb2xDb250ZW50IH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0XHRcdGNvbnRlbnRQYXJ0cy5wdXNoKHsgcGFydEluZGV4LCB0ZXh0OiBsb2NhbGl6ZSgndG9vbEF1dGhlbnRpY2F0aW9uQTExeVZpZXcnLCBcIk1DUCBhdXRoZW50aWNhdGlvbiByZXF1aXJlZCBmb3IgezB9IHRvIGNvbnRpbnVlIHsxfS5cIiwgc3RhdGUuc2VydmVyLm5hbWUsIHBhcnQudG9vbElkKSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsKSB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zdEFwcHJvdmFsRGV0YWlscyA9IGlzVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyhzdGF0ZS5yZXN1bHREZXRhaWxzKVxuXHRcdFx0XHRcdFx0PyBzdGF0ZS5yZXN1bHREZXRhaWxzLmlucHV0XG5cdFx0XHRcdFx0XHQ6IGlzVG9vbFJlc3VsdE91dHB1dERldGFpbHMoc3RhdGUucmVzdWx0RGV0YWlscylcblx0XHRcdFx0XHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0OiB0b29sQ29udGVudFRvQTExeVN0cmluZyhzdGF0ZS5jb250ZW50Rm9yTW9kZWwpO1xuXHRcdFx0XHRcdGNvbnRlbnRQYXJ0cy5wdXNoKHsgcGFydEluZGV4LCB0ZXh0OiBsb2NhbGl6ZSgndG9vbFBvc3RBcHByb3ZhbEExMXlWaWV3JywgXCJBcHByb3ZlIHJlc3VsdHMgb2YgezB9PyBSZXN1bHQ6IFwiLCBwYXJ0LnRvb2xJZCkgKyAocG9zdEFwcHJvdmFsRGV0YWlscyA/PyAnJykgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0RGV0YWlscyA9IElDaGF0VG9vbEludm9jYXRpb24ucmVzdWx0RGV0YWlscyhwYXJ0KTtcblx0XHRcdFx0XHRjb25zdCBpc0NvbXBsZXRlID0gSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHBhcnQpO1xuXHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZ2V0VG9vbEludm9jYXRpb25BMTF5RGVzY3JpcHRpb24oXG5cdFx0XHRcdFx0XHRyZW5kZXJDaGF0TWVzc2FnZUFzUGxhaW50ZXh0KHBhcnQuaW52b2NhdGlvbk1lc3NhZ2UpLFxuXHRcdFx0XHRcdFx0cGFydC5wYXN0VGVuc2VNZXNzYWdlID8gcmVuZGVyQ2hhdE1lc3NhZ2VBc1BsYWludGV4dChwYXJ0LnBhc3RUZW5zZU1lc3NhZ2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cGFydC50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0XHRcdFx0cmVzdWx0RGV0YWlscyxcblx0XHRcdFx0XHRcdGlzQ29tcGxldGVcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0Y29udGVudFBhcnRzLnB1c2goeyBwYXJ0SW5kZXgsIHRleHQ6IGRlc2NyaXB0aW9uIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCc6IHtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBnZXRUb29sSW52b2NhdGlvbkExMXlEZXNjcmlwdGlvbihcblx0XHRcdFx0XHRyZW5kZXJDaGF0TWVzc2FnZUFzUGxhaW50ZXh0KHBhcnQuaW52b2NhdGlvbk1lc3NhZ2UpLFxuXHRcdFx0XHRcdHBhcnQucGFzdFRlbnNlTWVzc2FnZSA/IHJlbmRlckNoYXRNZXNzYWdlQXNQbGFpbnRleHQocGFydC5wYXN0VGVuc2VNZXNzYWdlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwYXJ0LnRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRcdFx0cGFydC5yZXN1bHREZXRhaWxzLFxuXHRcdFx0XHRcdHBhcnQuaXNDb21wbGV0ZVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRjb250ZW50UGFydHMucHVzaCh7IHBhcnRJbmRleCwgdGV4dDogZGVzY3JpcHRpb24gfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdhdXRvTW9kZVJlc29sdXRpb24nOiB7XG5cdFx0XHRcdGlmIChwYXJ0LnByZWRpY3RlZExhYmVsID09PSAnZmFsbGJhY2snKSB7XG5cdFx0XHRcdFx0Y29udGVudFBhcnRzLnB1c2goeyBwYXJ0SW5kZXgsIHRleHQ6IGxvY2FsaXplKCdhdXRvTW9kZVJlc29sdXRpb25BMTF5RmFsbGJhY2snLCBcIlJvdXRlZCB0byB7MH0uIFVuYWJsZSB0byByZXNvbHZlLlwiLCBwYXJ0LnJlc29sdmVkTW9kZWxOYW1lKSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IHBhcnQucHJlZGljdGVkTGFiZWwgPT09ICduZWVkc19yZWFzb25pbmcnXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhdXRvTW9kZVJlc29sdXRpb25BMTF5UmVhc29uaW5nJywgXCJSZWFzb25pbmdcIilcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2F1dG9Nb2RlUmVzb2x1dGlvbkExMXlOb25SZWFzb25pbmcnLCBcIk5vbi1yZWFzb25pbmdcIik7XG5cdFx0XHRcdFx0Y29udGVudFBhcnRzLnB1c2goeyBwYXJ0SW5kZXgsIHRleHQ6IGxvY2FsaXplKCdhdXRvTW9kZVJlc29sdXRpb25BMTF5JywgXCJSb3V0ZWQgdG8gezB9LiB7MX0gLSBDb25maWRlbmNlIHsyfSVcIiwgcGFydC5yZXNvbHZlZE1vZGVsTmFtZSwgbGFiZWwsIChwYXJ0LmNvbmZpZGVuY2UgKiAxMDApLnRvRml4ZWQoMCkpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIGNvbnRlbnRQYXJ0cztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBc0I7QUFDL0IsU0FBMEIsd0JBQXdCO0FBQ2xELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCLDBCQUEwRDtBQUc3RixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw2Q0FBNkM7QUFDdEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBK2EscUJBQWtJLDhDQUE4QztBQUMvbEIsU0FBaUMsb0JBQW9CO0FBQ3JELFNBQWtFLGdDQUFnQywyQkFBMkIsK0JBQStCO0FBQzVKLFNBQW9DLDBCQUEwQjtBQUM5RCxTQUFTLGtCQUE0QjtBQUU5QixNQUFNLDJCQUFvRTtBQUFBLEVBQTFFO0FBQ04sU0FBUyxXQUFXO0FBQ3BCLFNBQVMsT0FBTztBQUNoQixTQUFTLE9BQU8sbUJBQW1CO0FBQ25DLFNBQVMsT0FBTyxnQkFBZ0I7QUFBQTtBQUFBLEVBQ2hDLFlBQVksVUFBNEI7QUFDdkMsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGtCQUFrQjtBQUNyRCxVQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUNuRCxVQUFNLFNBQVMs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
