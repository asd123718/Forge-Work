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
import { asArray } from "../../../../../base/common/arrays.js";
import { softAssertNever } from "../../../../../base/common/assert.js";
import { VSBuffer, decodeHex, encodeHex } from "../../../../../base/common/buffer.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { appendEscapedMarkdownInlineCode, MarkdownString, isMarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { revive } from "../../../../../base/common/marshalling.js";
import { Schemas } from "../../../../../base/common/network.js";
import { equals } from "../../../../../base/common/objects.js";
import { autorun, constObservable, derived, observableFromEvent, observableSignalFromEvent, observableValue, observableValueOpts, registerAutorunSelfDisposable } from "../../../../../base/common/observable.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { hasKey } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { localize } from "../../../../../nls.js";
import { canLog, ILogService, LogLevel } from "../../../../../platform/log/common/log.js";
import { CellUri } from "../../../notebook/common/notebookCommon.js";
import { IChatRequestVariableEntry, isImplicitVariableEntry, isStringImplicitContextValue, isStringVariableEntry } from "../attachments/chatVariableEntries.js";
import { migrateLegacyTerminalToolSpecificData } from "../chat.js";
import { reviveChatRequestOrigin, serializeChatRequestOrigin } from "../chatRequestOrigin.js";
import { ChatPerfMark, markChat } from "../chatPerf.js";
import { ChatRequestQueueKind, ChatResponseClearToPreviousToolInvocationReason, ElicitationState, IChatService, IChatToolInvocation, ResponseModelState, ToolConfirmKind, isIUsedContext } from "../chatService/chatService.js";
import { ChatAgentLocation, ChatModeKind } from "../constants.js";
import { ChatToolInvocation } from "./chatProgressTypes/chatToolInvocation.js";
import { ChatPlanReviewData } from "./chatProgressTypes/chatPlanReviewData.js";
import { ChatQuestionCarouselData } from "./chatProgressTypes/chatQuestionCarouselData.js";
import { ToolDataSource } from "../tools/languageModelToolsService.js";
import { IChatEditingService, ModifiedFileEntryState } from "../editing/chatEditingService.js";
import { IChatAgentService, reviveSerializedAgent } from "../participants/chatAgents.js";
import { ChatRequestTextPart, reviveParsedChatRequest } from "../requestParser/chatParserTypes.js";
import { chatSessionResourceToId, LocalChatSessionUri } from "./chatUri.js";
const CHAT_ATTACHABLE_IMAGE_MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp"
};
function getAttachableImageExtension(mimeType) {
  return Object.entries(CHAT_ATTACHABLE_IMAGE_MIME_TYPES).find(([_, value]) => value === mimeType)?.[0];
}
var IChatRequestVariableData;
((IChatRequestVariableData2) => {
  function toExport(data) {
    return { variables: data.variables.map(IChatRequestVariableEntry.toExport) };
  }
  IChatRequestVariableData2.toExport = toExport;
})(IChatRequestVariableData || (IChatRequestVariableData = {}));
function isCellTextEditOperation(value) {
  const candidate = value;
  return !!candidate && !!candidate.edit && !!candidate.uri && URI.isUri(candidate.uri);
}
function isCellTextEditOperationArray(value) {
  return value.some(isCellTextEditOperation);
}
const nonHistoryKinds = /* @__PURE__ */ new Set(["toolInvocation", "toolInvocationSerialized", "undoStop", "voiceProgress"]);
function isChatProgressHistoryResponseContent(content) {
  return !nonHistoryKinds.has(content.kind);
}
function toChatHistoryContent(content) {
  return content.filter(isChatProgressHistoryResponseContent);
}
const defaultChatResponseModelChangeReason = { reason: "other" };
class ChatRequestModel {
  constructor(params) {
    this._shouldBeBlocked = observableValue(this, false);
    this._version = 0;
    this._session = params.session;
    this.message = params.message;
    this._variableData = params.variableData;
    this.requestTimestamp = params.timestamp;
    this.timestamp = params.timestamp ?? params.fallbackTimestamp ?? Date.now();
    this._attempt = params.attempt ?? 0;
    this.modeInfo = params.modeInfo;
    this._confirmation = params.confirmation;
    this._locationData = params.locationData;
    this._attachedContext = params.attachedContext;
    this.isCompleteAddedRequest = params.isCompleteAddedRequest ?? false;
    this.modelId = params.modelId;
    this.id = params.restoredId ?? "request_" + generateUuid();
    this._editedFileEvents = params.editedFileEvents;
    this.userSelectedTools = params.userSelectedTools;
    this.isSystemInitiated = params.isSystemInitiated;
    this.isHiddenFromTranscript = params.isHiddenFromTranscript ?? false;
    this.systemInitiatedLabel = params.systemInitiatedLabel;
    this.terminalExecutionId = params.terminalExecutionId;
    this.isTerminalCommand = params.isTerminalCommand ?? false;
    this.origin = params.origin;
  }
  get shouldBeBlocked() {
    return this._shouldBeBlocked;
  }
  setShouldBeBlocked(value) {
    this._shouldBeBlocked.set(value, void 0);
  }
  get session() {
    return this._session;
  }
  get attempt() {
    return this._attempt;
  }
  get variableData() {
    return this._variableData;
  }
  set variableData(v) {
    this._version++;
    this._variableData = v;
  }
  get confirmation() {
    return this._confirmation;
  }
  get locationData() {
    return this._locationData;
  }
  get attachedContext() {
    return this._attachedContext;
  }
  get editedFileEvents() {
    return this._editedFileEvents;
  }
  get version() {
    return this._version;
  }
  adoptTo(session) {
    this._session = session;
  }
}
class AbstractResponse {
  get value() {
    return this._responseParts;
  }
  constructor(value) {
    this._responseParts = value;
  }
  toString() {
    if (this._responseRepr === void 0) {
      this._responseRepr = this.computeRepr();
    }
    return this._responseRepr;
  }
  /**
   * _Just_ the content of markdown parts in the response
   */
  getMarkdown() {
    if (this._markdownContent === void 0) {
      this._markdownContent = this.computeMarkdownContent();
    }
    return this._markdownContent;
  }
  /**
   * The trailing contiguous markdown/inline-reference content of the response,
   * skipping any trailing tool calls or empty markdown parts.
   */
  getFinalResponse() {
    const parts = this._responseParts;
    let i = parts.length - 1;
    while (i >= 0) {
      const part = parts[i];
      if (part.kind === "markdownContent" || part.kind === "markdownVuln") {
        if (part.content.value.length > 0) {
          break;
        }
      } else if (part.kind === "inlineReference") {
        break;
      }
      i--;
    }
    if (i < 0) {
      return "";
    }
    const end = i;
    while (i >= 0) {
      const part = parts[i];
      if (part.kind === "markdownContent" || part.kind === "markdownVuln" || part.kind === "inlineReference") {
        i--;
      } else {
        break;
      }
    }
    const start = i + 1;
    const segments = [];
    for (let j = start; j <= end; j++) {
      const part = parts[j];
      if (part.kind === "inlineReference") {
        segments.push(this.inlineRefToRepr(part));
      } else if (part.kind === "markdownContent" || part.kind === "markdownVuln") {
        if (part.content.value.length > 0) {
          segments.push(part.content.value);
        }
      }
    }
    return segments.join("");
  }
  /**
   * Invalidate cached representations so they are recomputed on next access.
   */
  _invalidateRepr() {
    this._responseRepr = void 0;
    this._markdownContent = void 0;
  }
  computeMarkdownContent() {
    const segments = [];
    for (const part of this._responseParts) {
      if (part.kind === "inlineReference") {
        segments.push(this.inlineRefToRepr(part));
      } else if (part.kind === "markdownContent" || part.kind === "markdownVuln") {
        if (part.content.value.length > 0) {
          segments.push(part.content.value);
        }
      }
    }
    return segments.join("");
  }
  computeRepr() {
    return this.partsToRepr(this._responseParts);
  }
  partsToRepr(parts) {
    const blocks = [];
    let currentBlockSegments = [];
    let hasEditGroupsAfterLastClear = false;
    for (const part of parts) {
      let segment;
      switch (part.kind) {
        case "clearToPreviousToolInvocation":
          currentBlockSegments = [];
          blocks.length = 0;
          hasEditGroupsAfterLastClear = false;
          continue;
        case "treeData":
        case "progressMessage":
        case "codeblockUri":
        case "extensions":
        case "pullRequest":
        case "undoStop":
        case "workspaceEdit":
        case "externalEdit":
        case "elicitation2":
        case "elicitationSerialized":
        case "thinking":
        case "hook":
        case "voiceProgress":
        case "multiDiffData":
        case "mcpServersStarting":
        case "mcpAuthenticationRequired":
        case "mcpServersStartingSlow":
        case "questionCarousel":
        case "planReview":
        case "disabledClaudeHooks":
        case "autoModeResolution":
          continue;
        case "systemNotification":
          segment = { text: part.content.value, isBlock: true };
          break;
        case "toolInvocation":
        case "toolInvocationSerialized":
          segment = this.getToolInvocationText(part);
          break;
        case "inlineReference":
          segment = { text: this.inlineRefToRepr(part) };
          break;
        case "command":
          segment = { text: part.command.title, isBlock: true };
          break;
        case "textEditGroup":
        case "notebookEditGroup":
          hasEditGroupsAfterLastClear = true;
          continue;
        case "confirmation":
          if (part.message instanceof MarkdownString) {
            segment = { text: `${part.title}
${part.message.value}`, isBlock: true };
            break;
          }
          segment = { text: `${part.title}
${part.message}`, isBlock: true };
          break;
        case "markdownContent":
        case "markdownVuln":
        case "progressTask":
        case "progressTaskSerialized":
        case "warning":
        case "info":
          segment = { text: part.content.value };
          break;
        default:
          softAssertNever(part);
          continue;
      }
      if (segment.isBlock) {
        if (currentBlockSegments.length) {
          blocks.push(currentBlockSegments.join(""));
          currentBlockSegments = [];
        }
        blocks.push(segment.text);
      } else {
        currentBlockSegments.push(segment.text);
      }
    }
    if (currentBlockSegments.length) {
      blocks.push(currentBlockSegments.join(""));
    }
    if (hasEditGroupsAfterLastClear) {
      blocks.push(localize("editsSummary", "Made changes."));
    }
    return blocks.join("\n\n");
  }
  inlineRefToRepr(part) {
    if ("uri" in part.inlineReference) {
      return this.uriToRepr(part.inlineReference.uri, part.inlineReference.range);
    }
    return "name" in part.inlineReference ? appendEscapedMarkdownInlineCode(part.inlineReference.name) : this.uriToRepr(part.inlineReference);
  }
  getToolInvocationText(toolInvocation) {
    const getTerminalDisplayInput = (terminalData) => terminalData.presentationOverrides?.commandLine ?? terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
    let message = "";
    let input = "";
    if (toolInvocation.pastTenseMessage) {
      message = typeof toolInvocation.pastTenseMessage === "string" ? toolInvocation.pastTenseMessage : toolInvocation.pastTenseMessage.value;
    } else {
      message = typeof toolInvocation.invocationMessage === "string" ? toolInvocation.invocationMessage : toolInvocation.invocationMessage.value;
    }
    if (toolInvocation.toolSpecificData) {
      if (toolInvocation.toolSpecificData.kind === "terminal") {
        message = "Ran terminal command";
        const terminalData = migrateLegacyTerminalToolSpecificData(toolInvocation.toolSpecificData);
        input = getTerminalDisplayInput(terminalData);
      }
    }
    let text = message;
    if (input) {
      text += `: ${input}`;
    }
    if (toolInvocation.kind === "toolInvocationSerialized" || toolInvocation.kind === "toolInvocation" && IChatToolInvocation.isComplete(toolInvocation)) {
      const resultDetails = IChatToolInvocation.resultDetails(toolInvocation);
      if (resultDetails && "input" in resultDetails) {
        const resultPrefix = toolInvocation.kind === "toolInvocationSerialized" || IChatToolInvocation.isComplete(toolInvocation) ? "Completed" : "Errored";
        const resultInput = toolInvocation.toolSpecificData?.kind === "terminal" ? getTerminalDisplayInput(migrateLegacyTerminalToolSpecificData(toolInvocation.toolSpecificData)) : resultDetails.input;
        text += `
${resultPrefix} with input: ${resultInput}`;
      }
    }
    return { text, isBlock: true };
  }
  /**
   * Renders a reference the way the response showed it — the file name plus any line suffix —
   * as code, so a name containing `*` or `_` survives being pasted into another document.
   */
  uriToRepr(uri, range) {
    if (uri.scheme === Schemas.http || uri.scheme === Schemas.https) {
      return uri.toString(false);
    }
    const suffix = !range ? "" : range.startLineNumber === range.endLineNumber ? `:${range.startLineNumber}` : `:${range.startLineNumber}-${range.endLineNumber}`;
    return appendEscapedMarkdownInlineCode(basename(uri) + suffix);
  }
}
class ResponseView extends AbstractResponse {
  constructor(_response, undoStop) {
    let idx = _response.value.findIndex((v) => v.kind === "undoStop" && v.id === undoStop);
    if (_response.value[idx + 1]?.kind === "codeblockUri" && _response.value[idx - 1]?.kind === "markdownContent") {
      idx--;
    }
    super(idx === -1 ? _response.value.slice() : _response.value.slice(0, idx));
    this.undoStop = undoStop;
  }
}
class Response extends AbstractResponse {
  constructor(value) {
    super(asArray(value).map((v) => "kind" in v ? v : isMarkdownString(v) ? { content: v, kind: "markdownContent" } : { kind: "treeData", treeData: v }));
    this._store = new DisposableStore();
    this._onDidChangeValue = this._store.add(new Emitter());
    this._citations = [];
  }
  get onDidChangeValue() {
    return this._onDidChangeValue.event;
  }
  dispose() {
    this._store.dispose();
  }
  clear() {
    this.finalizeReasoningDuration();
    this._responseParts = [];
    this._contentChanged(true);
  }
  clearToPreviousToolInvocation(message) {
    this.finalizeReasoningDuration();
    let lastToolInvocationIndex = -1;
    for (let i = this._responseParts.length - 1; i >= 0; i--) {
      const part = this._responseParts[i];
      if (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") {
        lastToolInvocationIndex = i;
        break;
      }
    }
    if (lastToolInvocationIndex !== -1) {
      this._responseParts = this._responseParts.slice(0, lastToolInvocationIndex + 1);
    } else {
      this._responseParts = [];
    }
    if (message) {
      this._responseParts.push({ kind: "warning", content: new MarkdownString(message) });
    }
    this._contentChanged(true);
  }
  updateContent(progress, quiet) {
    if (progress.kind !== "thinking") {
      this.finalizeReasoningDuration();
    }
    if (progress.kind === "clearToPreviousToolInvocation") {
      if (progress.reason === ChatResponseClearToPreviousToolInvocationReason.CopyrightContentRetry) {
        this.clearToPreviousToolInvocation(localize("copyrightContentRetry", "Response cleared due to possible match to public code, retrying with modified prompt."));
      } else if (progress.reason === ChatResponseClearToPreviousToolInvocationReason.FilteredContentRetry) {
        this.clearToPreviousToolInvocation(localize("filteredContentRetry", "Response cleared due to content safety filters, retrying with modified prompt."));
      } else {
        this.clearToPreviousToolInvocation();
      }
      return;
    } else if (progress.kind === "markdownContent") {
      const lastResponsePart = this._responseParts.filter((p) => p.kind !== "textEditGroup" && !isNestedSubagentResponsePart(p)).at(-1);
      if (!lastResponsePart || lastResponsePart.kind !== "markdownContent" || !canMergeMarkdownStrings(lastResponsePart.content, progress.content)) {
        this._responseParts.push(progress);
      } else {
        const idx = this._responseParts.indexOf(lastResponsePart);
        this._responseParts[idx] = { ...lastResponsePart, content: appendMarkdownString(lastResponsePart.content, progress.content) };
      }
      this._contentChanged(quiet);
    } else if (progress.kind === "systemNotification") {
      const lastResponsePart = this._responseParts.at(-1);
      if (lastResponsePart?.kind === "toolInvocation" && IChatToolInvocation.isStreaming(lastResponsePart) && !IChatToolInvocation.isEffectivelyHidden(lastResponsePart)) {
        this._responseParts.splice(this._responseParts.length - 1, 0, progress);
      } else {
        this._responseParts.push(progress);
      }
      this._contentChanged(quiet);
    } else if (progress.kind === "thinking") {
      const lastResponsePart = this._responseParts.filter((p) => p.kind !== "textEditGroup").at(-1);
      const lastText = lastResponsePart && lastResponsePart.kind === "thinking" ? Array.isArray(lastResponsePart.value) ? lastResponsePart.value.join("") : lastResponsePart.value || "" : "";
      const currText = Array.isArray(progress.value) ? progress.value.join("") : progress.value || "";
      const isEmpty = (s) => s.length === 0;
      if (isEmpty(currText)) {
        this.finalizeReasoningDuration();
      } else if (!this._activeReasoning) {
        this._activeReasoning = { part: progress, startedAt: Date.now() };
      }
      if (!lastResponsePart || lastResponsePart.kind !== "thinking" || isEmpty(currText) || isEmpty(lastText) || !canMergeMarkdownStrings(new MarkdownString(lastText), new MarkdownString(currText))) {
        this._responseParts.push(progress);
      } else {
        const idx = this._responseParts.indexOf(lastResponsePart);
        const mergedPart = {
          ...lastResponsePart,
          value: appendMarkdownString(new MarkdownString(lastText), new MarkdownString(currText)).value
        };
        this._responseParts[idx] = mergedPart;
        if (this._activeReasoning?.part === lastResponsePart) {
          this._activeReasoning.part = mergedPart;
        }
      }
      this._contentChanged(quiet);
    } else if (progress.kind === "textEdit" || progress.kind === "notebookEdit") {
      const notebookUri = CellUri.parse(progress.uri)?.notebook;
      const uri = notebookUri ?? progress.uri;
      const isExternalEdit = progress.isExternalEdit;
      if (progress.kind === "textEdit" && !notebookUri) {
        this._mergeOrPushTextEditGroup(uri, progress.edits, progress.done, isExternalEdit);
      } else if (progress.kind === "textEdit") {
        const cellEdits = progress.edits.map((edit) => ({ uri: progress.uri, edit }));
        this._mergeOrPushNotebookEditGroup(uri, cellEdits, progress.done, isExternalEdit);
      } else {
        this._mergeOrPushNotebookEditGroup(uri, progress.edits, progress.done, isExternalEdit);
      }
      this._contentChanged(quiet);
    } else if (progress.kind === "progressTask") {
      const responsePosition = this._responseParts.push(progress) - 1;
      this._contentChanged(quiet);
      const disp = progress.onDidAddProgress(() => {
        this._contentChanged(false);
      });
      progress.task?.().then((content) => {
        disp.dispose();
        if (typeof content === "string") {
          this._responseParts[responsePosition].content = new MarkdownString(content);
        }
        this._contentChanged(false);
      });
    } else if (progress.kind === "toolInvocation") {
      registerAutorunSelfDisposable(this._store, (reader) => {
        progress.state.read(reader);
        this._contentChanged(false);
        if (IChatToolInvocation.isComplete(progress, reader)) {
          reader.dispose();
        }
      });
      this._responseParts.push(progress);
      this._contentChanged(quiet);
    } else if (progress.kind === "externalToolInvocationUpdate") {
      this._handleExternalToolInvocationUpdate(progress);
      this._contentChanged(quiet);
    } else if (progress.kind === "progressMessage" && progress.id !== void 0) {
      const idx = this._responseParts.findIndex((p) => p.kind === "progressMessage" && p.id === progress.id);
      if (idx === -1) {
        this._responseParts.push(progress);
      } else {
        this._responseParts[idx] = progress;
      }
      this._contentChanged(quiet);
    } else {
      this._responseParts.push(progress);
      this._contentChanged(quiet);
    }
  }
  /**
   * Persists the duration of the active reasoning interval.
   */
  finalizeReasoningDuration() {
    if (!this._activeReasoning) {
      return;
    }
    this._activeReasoning.part.reasoningDurationMs = Math.max(0, Date.now() - this._activeReasoning.startedAt);
    this._activeReasoning = void 0;
  }
  addCitation(citation) {
    this._citations.push(citation);
    this._contentChanged();
  }
  resolveInlineReference(resolveId, resolvedReference) {
    for (let i = 0; i < this._responseParts.length; i++) {
      const current = this._responseParts[i];
      if (current.kind !== "inlineReference" || current.resolveId !== resolveId) {
        continue;
      }
      this._responseParts[i] = {
        ...current,
        inlineReference: resolvedReference.inlineReference,
        name: resolvedReference.name ?? current.name
      };
      this._contentChanged();
      return true;
    }
    return false;
  }
  _mergeOrPushTextEditGroup(uri, edits, done, isExternalEdit) {
    for (const candidate of this._responseParts) {
      if (candidate.kind === "textEditGroup" && !candidate.done && isEqual(candidate.uri, uri)) {
        candidate.edits.push(edits);
        candidate.done = done;
        return;
      }
    }
    this._responseParts.push({ kind: "textEditGroup", uri, edits: [edits], done, isExternalEdit });
  }
  _mergeOrPushNotebookEditGroup(uri, edits, done, isExternalEdit) {
    for (const candidate of this._responseParts) {
      if (candidate.kind === "notebookEditGroup" && !candidate.done && isEqual(candidate.uri, uri)) {
        candidate.edits.push(edits);
        candidate.done = done;
        return;
      }
    }
    this._responseParts.push({ kind: "notebookEditGroup", uri, edits: [edits], done, isExternalEdit });
  }
  _handleExternalToolInvocationUpdate(progress) {
    const existingInvocation = this._responseParts.findLast(
      (part) => part.kind === "toolInvocation" && part.toolCallId === progress.toolCallId
    );
    if (existingInvocation) {
      if (progress.toolSpecificData !== void 0) {
        existingInvocation.toolSpecificData = progress.toolSpecificData;
      }
      if (progress.isComplete) {
        existingInvocation.didExecuteTool({
          content: [],
          toolResultMessage: progress.pastTenseMessage,
          toolResultError: progress.errorMessage,
          toolResultDetails: progress.resultDetails
        });
      }
      return;
    }
    const toolData = {
      id: progress.toolName,
      source: ToolDataSource.External,
      displayName: progress.toolName,
      modelDescription: progress.toolName
    };
    const invocation = new ChatToolInvocation(
      {
        invocationMessage: progress.invocationMessage,
        pastTenseMessage: progress.pastTenseMessage,
        toolSpecificData: progress.toolSpecificData
      },
      toolData,
      progress.toolCallId,
      progress.subagentInvocationId,
      void 0,
      // parameters
      {},
      void 0
      // chatRequestId
    );
    if (progress.isComplete) {
      if (progress.toolSpecificData !== void 0) {
        invocation.toolSpecificData = progress.toolSpecificData;
      }
      invocation.didExecuteTool({
        content: [],
        toolResultMessage: progress.pastTenseMessage,
        toolResultError: progress.errorMessage,
        toolResultDetails: progress.resultDetails
      });
    }
    this._responseParts.push(invocation);
  }
  computeRepr() {
    let repr = super.computeRepr();
    if (this._citations.length) {
      repr += "\n\n" + getCodeCitationsMessage(this._citations);
    }
    return repr;
  }
  _contentChanged(quiet) {
    this._invalidateRepr();
    if (!quiet) {
      this._onDidChangeValue.fire();
    }
  }
}
function sumModelOutputTokens(modelTotals) {
  return modelTotals?.reduce((total, entry) => total + entry.outputTokens, 0);
}
class ChatResponseModel extends Disposable {
  constructor(params) {
    super();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._modelState = observableValue(this, { value: ResponseModelState.Pending });
    this._usageObs = observableValue(this, void 0);
    this._subagentCopilotCredits = /* @__PURE__ */ new Map();
    this._completionTokenCountObs = observableValue(this, void 0);
    this._shouldBeBlocked = observableValue(this, false);
    this._contentReferences = [];
    this._codeCitations = [];
    this._progressMessages = [];
    this._isStale = false;
    this._session = params.session;
    this._agent = params.agent;
    this._slashCommand = params.slashCommand;
    this.requestId = params.requestId;
    this._timestamp = params.timestamp || Date.now();
    if (params.modelState) {
      this._modelState.set(params.modelState, void 0);
    }
    this._completionTimestamp = params.completionTimestamp === null ? void 0 : params.completionTimestamp ?? (params.modelState && "completedAt" in params.modelState ? params.modelState.completedAt : void 0);
    this._timeSpentWaitingAccumulator = params.timeSpentWaiting || 0;
    this._elapsedMs = params.elapsedMs;
    this._vote = params.vote;
    this._result = params.result;
    this._followups = params.followups ? [...params.followups] : void 0;
    this.isCompleteAddedRequest = params.isCompleteAddedRequest ?? false;
    this._shouldBeRemovedOnSend = params.shouldBeRemovedOnSend;
    this._shouldBeBlocked.set(params.shouldBeBlocked ?? false, void 0);
    this._isStale = Array.isArray(params.responseContent) && (params.responseContent.length !== 0 || isMarkdownString(params.responseContent) && params.responseContent.value.length !== 0);
    this._response = this._register(new Response(params.responseContent));
    this._codeBlockInfos = params.codeBlockInfos ? [...params.codeBlockInfos] : void 0;
    const signal = observableSignalFromEvent(this, this.onDidChange);
    const _pendingInfo = signal.map((_value, r) => {
      signal.read(r);
      for (const part of this._response.value) {
        if (part.kind === "toolInvocation") {
          const state = part.state.read(r);
          if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
            const title = state.confirmationMessages?.title;
            return title ? isMarkdownString(title) ? title.value : title : void 0;
          }
          if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
            return localize("waitingForPostApproval", "Approve tool result?");
          }
          if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
            return localize("waitingForToolAuthentication", "Authenticate {0} to continue...", state.server.name);
          }
        }
        if (part.kind === "confirmation" && !part.isUsed) {
          return part.title;
        }
        if (part.kind === "questionCarousel" && !part.isUsed) {
          return localize("waitingAnswer", "Answer questions to continue...");
        }
        if (part.kind === "planReview" && !part.isUsed) {
          return localize("waitingPlanReview", "Review the plan to continue...");
        }
        if (part.kind === "elicitation2" && part.state.read(r) === ElicitationState.Pending) {
          const title = part.title;
          return isMarkdownString(title) ? title.value : title;
        }
      }
      return void 0;
    });
    const _startedWaitingAt = _pendingInfo.map((p) => !!p).map((p) => p ? Date.now() : void 0);
    this.isPendingConfirmation = _startedWaitingAt.map((waiting, r) => waiting ? { startedWaitingAt: waiting, detail: _pendingInfo.read(r) } : void 0);
    this.isInProgress = signal.map((_value, r) => {
      signal.read(r);
      return !_pendingInfo.read(r) && !this.shouldBeRemovedOnSend && (this._modelState.read(r).value === ResponseModelState.Pending || this._modelState.read(r).value === ResponseModelState.NeedsInput);
    });
    this.isIncomplete = this._modelState.map((state) => {
      return state.value === ResponseModelState.Pending || state.value === ResponseModelState.NeedsInput;
    });
    this._register(this._response.onDidChangeValue(() => this._onDidChange.fire(defaultChatResponseModelChangeReason)));
    this.id = params.restoredId ?? "response_" + generateUuid();
    let lastStartedWaitingAt = void 0;
    this.confirmationAdjustedTimestamp = derived((reader) => {
      const pending = this.isPendingConfirmation.read(reader);
      if (pending) {
        this._modelState.set({ value: ResponseModelState.NeedsInput }, void 0);
        if (!lastStartedWaitingAt) {
          lastStartedWaitingAt = pending.startedWaitingAt;
        }
      } else if (lastStartedWaitingAt) {
        if (this._modelState.read(reader).value === ResponseModelState.NeedsInput) {
          this._modelState.set({ value: ResponseModelState.Pending }, void 0);
        }
        this._timeSpentWaitingAccumulator += Date.now() - lastStartedWaitingAt;
        lastStartedWaitingAt = void 0;
      }
      return this._timestamp + this._timeSpentWaitingAccumulator;
    }).recomputeInitiallyAndOnChange(this._store);
  }
  get shouldBeBlocked() {
    return this._shouldBeBlocked;
  }
  get request() {
    return this.session.getRequests().find((r) => r.id === this.requestId);
  }
  get session() {
    return this._session;
  }
  get shouldBeRemovedOnSend() {
    return this._shouldBeRemovedOnSend;
  }
  get isHiddenFromTranscript() {
    return this.request?.isHiddenFromTranscript ?? false;
  }
  get isComplete() {
    return this._modelState.get().value !== ResponseModelState.Pending && this._modelState.get().value !== ResponseModelState.NeedsInput;
  }
  get timestamp() {
    return this._timestamp;
  }
  set shouldBeRemovedOnSend(disablement) {
    if (this._shouldBeRemovedOnSend === disablement) {
      return;
    }
    this._shouldBeRemovedOnSend = disablement;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  get isCanceled() {
    return this._modelState.get().value === ResponseModelState.Cancelled;
  }
  get completedAt() {
    const state = this._modelState.get();
    if (state.value === ResponseModelState.Complete || state.value === ResponseModelState.Cancelled || state.value === ResponseModelState.Failed) {
      return state.completedAt;
    }
    return void 0;
  }
  get completionTimestamp() {
    return this._completionTimestamp;
  }
  get state() {
    const state = this._modelState.get().value;
    if (state === ResponseModelState.Complete && !!this._result?.errorDetails && this.result?.errorDetails?.code !== "canceled") {
      return ResponseModelState.Failed;
    }
    return state;
  }
  get stateT() {
    return this._modelState.get();
  }
  get vote() {
    return this._vote;
  }
  get followups() {
    return this._followups;
  }
  get entireResponse() {
    return this._finalizedResponse || this._response;
  }
  get result() {
    return this._result;
  }
  get usage() {
    return this._usageObs.get();
  }
  get usageObs() {
    return this._usageObs;
  }
  get completionTokenCount() {
    return this._completionTokenCountObs.get();
  }
  get completionTokenCountObs() {
    return this._completionTokenCountObs;
  }
  get elapsedMs() {
    return this._elapsedMs;
  }
  get username() {
    return this.session.responderUsername;
  }
  get agent() {
    return this._agent;
  }
  get slashCommand() {
    return this._slashCommand;
  }
  get agentOrSlashCommandDetected() {
    return this._agentOrSlashCommandDetected ?? false;
  }
  get usedContext() {
    return this._usedContext;
  }
  get contentReferences() {
    return Array.from(this._contentReferences);
  }
  get codeCitations() {
    return this._codeCitations;
  }
  get progressMessages() {
    return this._progressMessages;
  }
  get isStale() {
    return this._isStale;
  }
  get response() {
    const undoStop = this._shouldBeRemovedOnSend?.afterUndoStop;
    if (!undoStop) {
      return this._finalizedResponse || this._response;
    }
    if (this._responseView?.undoStop !== undoStop) {
      this._responseView = new ResponseView(this._response, undoStop);
    }
    return this._responseView;
  }
  get codeBlockInfos() {
    return this._codeBlockInfos;
  }
  initializeCodeBlockInfos(codeBlockInfo) {
    if (this._codeBlockInfos) {
      throw new BugIndicatingError("Code block infos have already been initialized");
    }
    this._codeBlockInfos = [...codeBlockInfo];
  }
  setBlockedState(isBlocked) {
    this._shouldBeBlocked.set(isBlocked, void 0);
  }
  /**
   * Apply a progress update to the actual response content.
   */
  updateContent(responsePart, quiet) {
    this._response.updateContent(responsePart, quiet);
  }
  resolveInlineReference(resolveId, resolvedReference) {
    return this._response.resolveInlineReference(resolveId, resolvedReference);
  }
  /**
   * Adds an undo stop at the current position in the stream.
   */
  addUndoStop(undoStop) {
    this._onDidChange.fire({ reason: "undoStop", id: undoStop.id });
    this._response.updateContent(undoStop, true);
  }
  /**
   * Apply one of the progress updates that are not part of the actual response content.
   */
  applyReference(progress) {
    if (progress.kind === "usedContext") {
      this._usedContext = progress;
    } else if (progress.kind === "reference") {
      this._contentReferences.push(progress);
      this._onDidChange.fire(defaultChatResponseModelChangeReason);
    }
  }
  applyCodeCitation(progress) {
    this._codeCitations.push(progress);
    this._response.addCitation(progress);
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setAgent(agent, slashCommand) {
    this._agent = agent;
    this._slashCommand = slashCommand;
    this._agentOrSlashCommandDetected = !agent.isDefault || !!slashCommand;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setResult(result) {
    if (this.isCanceled && result.errorDetails) {
      const { errorDetails: _errorDetails, ...rest } = result;
      this._result = rest;
    } else {
      this._result = result;
    }
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setUsage(usage) {
    this._parentUsage = usage;
    this._setUsage(this._withSubagentCopilotCredits(usage), true);
  }
  setSubagentCopilotCredits(subagentCallId, copilotCredits) {
    const currentCredits = this._subagentCopilotCredits.get(subagentCallId);
    if (!Number.isFinite(copilotCredits) || copilotCredits < 0 || currentCredits !== void 0 && copilotCredits <= currentCredits) {
      return;
    }
    this._subagentCopilotCredits.set(subagentCallId, copilotCredits);
    const usage = this._parentUsage ?? { kind: "usage", promptTokens: 0, completionTokens: 0 };
    this._setUsage(this._withSubagentCopilotCredits(usage), false);
  }
  _withSubagentCopilotCredits(usage) {
    let subagentCopilotCredits = 0;
    for (const credits of this._subagentCopilotCredits.values()) {
      subagentCopilotCredits += credits;
    }
    return subagentCopilotCredits === 0 ? usage : { ...usage, copilotCredits: (usage.copilotCredits ?? 0) + subagentCopilotCredits };
  }
  _setUsage(usage, countCompletionTokens) {
    const currentUsage = this._usageObs.get();
    if (currentUsage && this.isSameUsage(currentUsage, usage)) {
      return;
    }
    const isNewCall = !currentUsage || currentUsage.promptTokens !== usage.promptTokens || currentUsage.completionTokens !== usage.completionTokens || currentUsage.outputBuffer !== usage.outputBuffer;
    this._usageObs.set(usage, void 0);
    const reportedOutputTokens = sumModelOutputTokens(usage.modelTotals);
    if (reportedOutputTokens !== void 0) {
      this._completionTokenCountObs.set(reportedOutputTokens, void 0);
    } else if (countCompletionTokens && isNewCall) {
      const previousCompletionTokens = this._completionTokenCountObs.get() ?? 0;
      this._completionTokenCountObs.set(previousCompletionTokens + usage.completionTokens, void 0);
    }
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setElapsedMs(elapsedMs) {
    this._elapsedMs = Math.max(0, elapsedMs);
  }
  isSameUsage(currentUsage, usage) {
    return currentUsage.promptTokens === usage.promptTokens && currentUsage.completionTokens === usage.completionTokens && currentUsage.outputBuffer === usage.outputBuffer && currentUsage.copilotCredits === usage.copilotCredits && currentUsage.sessionCopilotCredits === usage.sessionCopilotCredits && equals(currentUsage.promptTokenDetails, usage.promptTokenDetails) && equals(currentUsage.modelTotals, usage.modelTotals);
  }
  complete(completedAt = Date.now()) {
    this._complete(completedAt, completedAt);
  }
  completeWithoutTimestamp() {
    this._complete(Date.now(), void 0);
  }
  _complete(completedAt, completionTimestamp) {
    if (this.isComplete) {
      return;
    }
    if (this._result?.errorDetails?.responseIsRedacted) {
      this._response.clear();
    }
    this._response.finalizeReasoningDuration();
    this._elapsedMs ??= Math.max(0, completedAt - this.confirmationAdjustedTimestamp.get());
    const state = !!this._result?.errorDetails && this._result.errorDetails.code !== "canceled" ? ResponseModelState.Failed : ResponseModelState.Complete;
    this._completionTimestamp = completionTimestamp;
    this._modelState.set({ value: state, completedAt }, void 0);
    this._onDidChange.fire({ reason: "completedRequest" });
  }
  cancel() {
    this._response.finalizeReasoningDuration();
    for (const part of this._response.value) {
      if (part.kind === "toolInvocation" && part instanceof ChatToolInvocation) {
        part.cancelFromStreaming(ToolConfirmKind.Skipped);
      } else if (part instanceof ChatPlanReviewData) {
        part.dismiss();
      } else if (part instanceof ChatQuestionCarouselData) {
        part.dismiss(void 0);
      }
    }
    const completedAt = Date.now();
    this._elapsedMs ??= Math.max(0, completedAt - this.confirmationAdjustedTimestamp.get());
    this._completionTimestamp = completedAt;
    this._modelState.set({ value: ResponseModelState.Cancelled, completedAt }, void 0);
    this._onDidChange.fire({ reason: "completedRequest" });
  }
  setFollowups(followups) {
    this._followups = followups;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setVote(vote) {
    this._vote = vote;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  setEditApplied(edit, editCount) {
    if (!this.response.value.includes(edit)) {
      return false;
    }
    if (!edit.state) {
      return false;
    }
    edit.state.applied = editCount;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
    return true;
  }
  adoptTo(session) {
    this._session = session;
    this._onDidChange.fire(defaultChatResponseModelChangeReason);
  }
  finalizeUndoState() {
    this._finalizedResponse = this.response;
    this._responseView = void 0;
    this._shouldBeRemovedOnSend = void 0;
  }
  dispose() {
    super.dispose();
    this._response.clear();
    if (this._codeBlockInfos) {
      this._codeBlockInfos.length = 0;
    }
  }
  toJSON() {
    const modelState = this._modelState.get();
    const pendingConfirmation = this.isPendingConfirmation.get();
    return {
      responseId: this.id,
      result: this.result,
      responseMarkdownInfo: this.codeBlockInfos?.map((info) => ({ suggestionId: info.suggestionId })),
      followups: this.followups,
      modelState: modelState.value === ResponseModelState.Pending || modelState.value === ResponseModelState.NeedsInput ? { value: ResponseModelState.Cancelled, completedAt: Date.now() } : modelState,
      vote: this.vote,
      slashCommand: this.slashCommand,
      usedContext: this.usedContext,
      contentReferences: this.contentReferences,
      codeCitations: this.codeCitations,
      responseTimestamp: this._timestamp,
      timeSpentWaiting: (pendingConfirmation ? Date.now() - pendingConfirmation.startedWaitingAt : 0) + this._timeSpentWaitingAccumulator,
      promptTokens: this.usage?.promptTokens,
      completionTokens: this.completionTokenCount,
      outputBuffer: this.usage?.outputBuffer,
      promptTokenDetails: this.usage?.promptTokenDetails,
      copilotCredits: this.usage?.copilotCredits,
      modelTotals: this.usage?.modelTotals,
      sessionCopilotCredits: this.usage?.sessionCopilotCredits,
      elapsedMs: this.elapsedMs ?? (this.completedAt ? Math.max(0, this.completedAt - this.confirmationAdjustedTimestamp.get()) : void 0)
    };
  }
}
class IntendedModelSlot {
  setIntendedModel(selection) {
    this.intendedModel = selection;
  }
}
var ChatInputStateOrigin = /* @__PURE__ */ ((ChatInputStateOrigin2) => {
  ChatInputStateOrigin2["Remote"] = "remote";
  return ChatInputStateOrigin2;
})(ChatInputStateOrigin || {});
function reviveSerializableInputState(state) {
  return {
    attachments: (state.attachments ?? []).map(IChatRequestVariableEntry.fromExport),
    mode: state.mode,
    selectedModel: state.selectedModel && {
      identifier: state.selectedModel.identifier,
      metadata: state.selectedModel.metadata
    },
    modelConfiguration: state.selectedModel ? state.selectedModel.modelConfiguration ?? state.modelConfiguration : void 0,
    contrib: state.contrib,
    inputText: state.inputText,
    selections: state.selections,
    permissionLevel: state.permissionLevel
  };
}
function normalizeSerializableChatData(raw) {
  normalizeOldFields(raw);
  if (!("version" in raw)) {
    return {
      version: 3,
      ...raw,
      customTitle: void 0
    };
  }
  if (raw.version === 2) {
    return {
      ...raw,
      version: 3,
      customTitle: raw.computedTitle
    };
  }
  return raw;
}
function normalizeOldFields(raw) {
  if (!raw.sessionId) {
    raw.sessionId = generateUuid();
  }
  if (!raw.creationDate) {
    raw.creationDate = getLastYearDate();
  }
  if (raw.initialLocation === "editing-session") {
    raw.initialLocation = ChatAgentLocation.Chat;
  }
}
function getLastYearDate() {
  const lastYearDate = /* @__PURE__ */ new Date();
  lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
  return lastYearDate.getTime();
}
function isExportableSessionData(obj) {
  return !!obj && Array.isArray(obj.requests) && typeof obj.responderUsername === "string";
}
function extractExportableSessionData(data) {
  return {
    initialLocation: data.initialLocation,
    requests: data.requests,
    responderUsername: data.responderUsername
  };
}
function isSerializableSessionData(obj) {
  const data = obj;
  return isExportableSessionData(obj) && typeof data.creationDate === "number" && typeof data.sessionId === "string" && obj.requests.every(
    (request) => !request.usedContext || isIUsedContext(request.usedContext)
  );
}
var ChatRequestRemovalReason = /* @__PURE__ */ ((ChatRequestRemovalReason2) => {
  ChatRequestRemovalReason2[ChatRequestRemovalReason2["Removal"] = 0] = "Removal";
  ChatRequestRemovalReason2[ChatRequestRemovalReason2["Resend"] = 1] = "Resend";
  ChatRequestRemovalReason2[ChatRequestRemovalReason2["Adoption"] = 2] = "Adoption";
  return ChatRequestRemovalReason2;
})(ChatRequestRemovalReason || {});
class InputModel {
  constructor(initialState, logger, sessionId) {
    this.logger = logger;
    this.sessionId = sessionId;
    this._state = observableValueOpts({ debugName: "inputModelState", equalsFn: equals }, initialState);
    this.state = this._state;
  }
  get intendedModel() {
    return this._intendedModel;
  }
  setIntendedModel(selection) {
    this._intendedModel = selection;
  }
  setState(state) {
    const current = this._state.get();
    _logChangesToStateModel(state, current, this.logger, this.sessionId);
    this._state.set({
      // If current is undefined, provide defaults for required fields
      attachments: [],
      mode: { id: "agent", kind: ChatModeKind.Agent },
      selectedModel: void 0,
      inputText: "",
      selections: [],
      contrib: {},
      ...current,
      ...state,
      origin: state.origin
    }, void 0);
  }
  clearState() {
    this._state.set(void 0, void 0);
  }
  toJSON() {
    const value = this.state.get();
    if (!value) {
      return void 0;
    }
    const persistableAttachments = value.attachments.filter((attachment) => {
      if (isStringVariableEntry(attachment)) {
        return false;
      }
      if (isImplicitVariableEntry(attachment) && isStringImplicitContextValue(attachment.value)) {
        return false;
      }
      return true;
    });
    return {
      contrib: value.contrib,
      attachments: persistableAttachments.map(IChatRequestVariableEntry.toExport),
      mode: value.mode,
      selectedModel: value.selectedModel ? {
        identifier: value.selectedModel.identifier,
        metadata: value.selectedModel.metadata,
        modelConfiguration: value.modelConfiguration
      } : void 0,
      inputText: value.inputText,
      selections: value.selections,
      permissionLevel: value.permissionLevel
    };
  }
}
let ChatModel = class extends Disposable {
  constructor(dataRef, initialModelProps, logService, chatAgentService, chatEditingService, chatService) {
    super();
    this.logService = logService;
    this.chatAgentService = chatAgentService;
    this.chatEditingService = chatEditingService;
    this.chatService = chatService;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._pendingRequests = [];
    this._onDidChangePendingRequests = this._register(new Emitter());
    this.onDidChangePendingRequests = this._onDidChangePendingRequests.event;
    this._isImported = false;
    this._isDeleted = false;
    this._canUseTools = true;
    this.currentEditedFileEvents = new ResourceMap();
    this._checkpoint = void 0;
    const initialData = dataRef?.value;
    const isValidExportedData = isExportableSessionData(initialData);
    const isValidFullData = isValidExportedData && isSerializableSessionData(initialData);
    if (initialData && !isValidExportedData) {
      this.logService.warn(`ChatModel#constructor: Loaded malformed session data: ${JSON.stringify(initialData)}`);
    }
    this._isImported = !!initialData && isValidExportedData && !isValidFullData;
    if (initialModelProps.resource) {
      this._sessionId = chatSessionResourceToId(initialModelProps.resource);
      this._sessionResource = initialModelProps.resource;
    } else if (isValidFullData) {
      this._sessionId = initialData.sessionId;
      this._sessionResource = LocalChatSessionUri.forSession(initialData.sessionId);
    } else {
      this._sessionId = generateUuid();
      this._sessionResource = LocalChatSessionUri.forSession(this._sessionId);
    }
    this._disableBackgroundKeepAlive = initialModelProps.disableBackgroundKeepAlive ?? false;
    this._timestamp = isValidFullData && initialData.creationDate || Date.now();
    this._requests = initialData ? this._deserialize(initialData) : [];
    this._customTitle = isValidFullData ? initialData.customTitle : void 0;
    const serializedInputState = initialModelProps.inputState || (isValidFullData && initialData.inputState ? initialData.inputState : void 0);
    this.inputModel = new InputModel(serializedInputState && reviveSerializableInputState(serializedInputState), this.logService, this._sessionId);
    this.dataSerializer = dataRef?.serializer;
    this._initialResponderUsername = initialData?.responderUsername;
    this._repoData = isValidFullData && initialData.repoData ? initialData.repoData : void 0;
    this._workingDirectory = isValidFullData && initialData.workingDirectory ? URI.parse(initialData.workingDirectory) : void 0;
    if (isValidFullData && initialData.pendingRequests) {
      this._pendingRequests = this._deserializePendingRequests(initialData.pendingRequests);
    }
    this._initialLocation = initialData?.initialLocation ?? initialModelProps.initialLocation;
    this._canUseTools = initialModelProps.canUseTools;
    this.isReadOnly = initialModelProps.isReadOnly ?? constObservable(false);
    this.lastRequestObs = observableFromEvent(this, this.onDidChange, () => this._requests.at(-1));
    this._register(autorun((reader) => {
      const request = this.lastRequestObs.read(reader);
      if (!request?.response) {
        return;
      }
      reader.store.add(request.response.onDidChange(async (ev) => {
        if (!this._editingSession || ev.reason !== "completedRequest") {
          return;
        }
        this._onDidChange.fire({ kind: "completedRequest", request });
      }));
    }));
    this.requestInProgress = this.lastRequestObs.map((request, r) => {
      return request?.response?.isInProgress.read(r) ?? false;
    });
    this.hasActiveRequest = this.lastRequestObs.map((request, r) => {
      return request?.response?.isIncomplete.read(r) ?? false;
    });
    this.requestNeedsInput = this.lastRequestObs.map((request, r) => {
      const pendingInfo = request?.response?.isPendingConfirmation.read(r);
      if (!pendingInfo) {
        return void 0;
      }
      return {
        title: this.title,
        detail: pendingInfo.detail
      };
    });
    if (this.initialLocation === ChatAgentLocation.Chat && !initialModelProps.disableBackgroundKeepAlive) {
      const selfRef = this._register(new MutableDisposable());
      this._register(autorun((r) => {
        const inProgress = this.requestInProgress.read(r);
        const needsInput = this.requestNeedsInput.read(r);
        const shouldStayAlive = inProgress || !!needsInput;
        if (shouldStayAlive && !selfRef.value) {
          selfRef.value = chatService.acquireExistingSession(this._sessionResource, "ChatModel#requestInProgressKeepAlive");
        } else if (!shouldStayAlive && selfRef.value) {
          selfRef.clear();
        }
      }));
    }
  }
  static getDefaultTitle(requests) {
    const firstRequestMessage = requests.at(0)?.message ?? "";
    const message = typeof firstRequestMessage === "string" ? firstRequestMessage : firstRequestMessage.text;
    return message.split("\n")[0].substring(0, 200);
  }
  get repoData() {
    return this._repoData;
  }
  setRepoData(data) {
    this._repoData = data;
  }
  get workingDirectory() {
    return this._workingDirectory;
  }
  setWorkingDirectory(uri) {
    this._workingDirectory = uri;
  }
  getPendingRequests() {
    return this._pendingRequests;
  }
  setPendingRequests(requests) {
    const existingMap = new Map(this._pendingRequests.map((p) => [p.request.id, p]));
    const newPending = [];
    for (const { requestId, kind } of requests) {
      const existing = existingMap.get(requestId);
      if (existing) {
        newPending.push(existing.kind === kind ? existing : { request: existing.request, kind, sendOptions: existing.sendOptions });
      }
    }
    this._pendingRequests.length = 0;
    this._pendingRequests.push(...newPending);
    this._onDidChangePendingRequests.fire();
  }
  /**
   * @internal Used by ChatService to atomically replace the pending request queue.
   */
  replacePendingRequests(requests) {
    if (this._pendingRequests.length === requests.length && requests.every((request, index) => this._pendingRequests[index] === request)) {
      return;
    }
    this._pendingRequests.length = 0;
    this._pendingRequests.push(...requests);
    this._onDidChangePendingRequests.fire();
  }
  /**
   * @internal Used by ChatService to add a request to the queue.
   * Steering messages are placed before queued messages.
   */
  addPendingRequest(request, kind, sendOptions) {
    const pendingRequest = {
      request,
      kind,
      sendOptions
    };
    if (kind === ChatRequestQueueKind.Steering) {
      let insertIndex = 0;
      for (let i = 0; i < this._pendingRequests.length; i++) {
        if (this._pendingRequests[i].kind === ChatRequestQueueKind.Steering) {
          insertIndex = i + 1;
        } else {
          break;
        }
      }
      this._pendingRequests.splice(insertIndex, 0, pendingRequest);
    } else {
      this._pendingRequests.push(pendingRequest);
    }
    this._onDidChangePendingRequests.fire();
    return pendingRequest;
  }
  /**
   * @internal Used by ChatService to remove a pending request
   */
  removePendingRequest(id) {
    const index = this._pendingRequests.findIndex((r) => r.request.id === id);
    if (index !== -1) {
      this._pendingRequests.splice(index, 1);
      this._onDidChangePendingRequests.fire();
    }
  }
  /**
   * @internal Used by ChatService to dequeue the next pending request
   */
  dequeuePendingRequest() {
    const request = this._pendingRequests.shift();
    if (request) {
      this._onDidChangePendingRequests.fire();
    }
    return request;
  }
  /**
   * @internal Used by ChatService to dequeue all consecutive steering requests at the front of the queue.
   * Returns an empty array if the first pending request is not a steering request.
   */
  dequeueAllSteeringRequests() {
    const steeringRequests = [];
    while (this._pendingRequests.at(0)?.kind === ChatRequestQueueKind.Steering) {
      steeringRequests.push(this._pendingRequests.shift());
    }
    if (steeringRequests.length > 0) {
      this._onDidChangePendingRequests.fire();
    }
    return steeringRequests;
  }
  /**
   * @internal Used by ChatService to clear all pending requests
   */
  clearPendingRequests() {
    if (this._pendingRequests.length > 0) {
      this._pendingRequests.length = 0;
      this._onDidChangePendingRequests.fire();
    }
  }
  /** @deprecated Use {@link sessionResource} instead */
  get sessionId() {
    return this._sessionId;
  }
  get sessionResource() {
    return this._sessionResource;
  }
  get hasRequests() {
    return this._requests.length > 0;
  }
  get lastRequest() {
    return this._requests.at(-1);
  }
  get sessionCost() {
    let summedCredits = 0;
    let reportedSessionCredits = 0;
    for (const request of this._requests) {
      const usage = request.response?.usage;
      if (typeof usage?.copilotCredits === "number") {
        summedCredits += usage.copilotCredits;
      }
      if (typeof usage?.sessionCopilotCredits === "number") {
        reportedSessionCredits = Math.max(reportedSessionCredits, usage.sessionCopilotCredits);
      }
    }
    return Math.max(summedCredits, reportedSessionCredits);
  }
  get timestamp() {
    return this._timestamp;
  }
  get timing() {
    const lastRequest = this._requests.at(-1);
    const lastResponse = lastRequest?.response;
    const lastRequestStarted = lastRequest?.timestamp;
    const lastRequestEnded = lastResponse?.completedAt ?? lastResponse?.timestamp;
    return {
      created: this._timestamp,
      lastRequestStarted,
      lastRequestEnded
    };
  }
  get lastMessageDate() {
    return this._requests.at(-1)?.timestamp ?? this._timestamp;
  }
  get _defaultAgent() {
    return this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, ChatModeKind.Ask);
  }
  get responderUsername() {
    return this._defaultAgent?.fullName ?? this._initialResponderUsername ?? "";
  }
  get isImported() {
    return this._isImported;
  }
  get isDeleted() {
    return this._isDeleted;
  }
  markDeleted() {
    this._isDeleted = true;
  }
  get customTitle() {
    return this._customTitle;
  }
  get title() {
    return this._customTitle || ChatModel.getDefaultTitle(this._requests);
  }
  get hasCustomTitle() {
    return this._customTitle !== void 0;
  }
  get editingSession() {
    return this._editingSession;
  }
  get initialLocation() {
    return this._initialLocation;
  }
  get canUseTools() {
    return this._canUseTools;
  }
  get willKeepAlive() {
    return !this._disableBackgroundKeepAlive;
  }
  startEditingSession(isGlobalEditingSession, transferFromSession) {
    const session = this._editingSession ??= this._register(
      transferFromSession ? this.chatEditingService.transferEditingSession(this, transferFromSession) : isGlobalEditingSession ? this.chatEditingService.startOrContinueGlobalEditingSession(this) : this.chatEditingService.createEditingSession(this)
    );
    if (!this._disableBackgroundKeepAlive) {
      const selfRef = this._register(new MutableDisposable());
      this._register(autorun((r) => {
        const hasModified = session.entries.read(r).some((e) => e.state.read(r) === ModifiedFileEntryState.Modified);
        if (hasModified && !selfRef.value) {
          selfRef.value = this.chatService.acquireExistingSession(this._sessionResource, "ChatModel#modifiedEditsKeepAlive");
        } else if (!hasModified && selfRef.value) {
          selfRef.clear();
        }
      }));
    }
    this._register(autorun((reader) => {
      this._setDisabledRequests(session.requestDisablement.read(reader));
    }));
  }
  notifyEditingAction(action) {
    const state = action.outcome === "accepted" ? 1 /* Keep */ : action.outcome === "rejected" ? 2 /* Undo */ : action.outcome === "userModified" ? 3 /* UserModification */ : null;
    if (state === null) {
      return;
    }
    if (!this.currentEditedFileEvents.has(action.uri) || this.currentEditedFileEvents.get(action.uri)?.eventKind === 1 /* Keep */) {
      this.currentEditedFileEvents.set(action.uri, { eventKind: state, uri: action.uri });
    }
  }
  _deserialize(obj) {
    const requests = hasKey(obj, { serializer: true }) ? obj.value.requests : obj.requests;
    if (!Array.isArray(requests)) {
      this.logService.error(`Ignoring malformed session data: ${JSON.stringify(obj)}`);
      return [];
    }
    try {
      return requests.map((r) => this._deserializeRequest(r));
    } catch (error) {
      this.logService.error("Failed to parse chat data", error);
      return [];
    }
  }
  _deserializeRequest(raw) {
    const parsedRequest = typeof raw.message === "string" ? this.getParsedRequestFromString(raw.message) : reviveParsedChatRequest(raw.message);
    const variableData = this.reviveVariableData(raw.variableData);
    const requestTimestamp = typeof raw.timestamp === "number" && raw.timestamp > 0 ? raw.timestamp : void 0;
    const request = new ChatRequestModel({
      session: this,
      message: parsedRequest,
      variableData,
      timestamp: requestTimestamp,
      fallbackTimestamp: this._timestamp,
      restoredId: raw.requestId,
      confirmation: raw.confirmation,
      editedFileEvents: raw.editedFileEvents,
      modelId: raw.modelId,
      modeInfo: raw.modeInfo,
      isSystemInitiated: raw.isSystemInitiated,
      isHiddenFromTranscript: raw.hiddenFromTranscript,
      systemInitiatedLabel: raw.systemInitiatedLabel,
      terminalExecutionId: raw.terminalExecutionId,
      origin: reviveChatRequestOrigin(raw.origin)
    });
    request.shouldBeRemovedOnSend = raw.isHidden ? { requestId: raw.requestId } : raw.shouldBeRemovedOnSend;
    if (raw.response || raw.result || raw.responseErrorDetails) {
      const agent = raw.agent && "metadata" in raw.agent ? (
        // Check for the new format, ignore entries in the old format
        reviveSerializedAgent(raw.agent)
      ) : void 0;
      const result = "responseErrorDetails" in raw ? (
        // eslint-disable-next-line local/code-no-dangerous-type-assertions
        { errorDetails: raw.responseErrorDetails }
      ) : raw.result;
      let modelState = raw.modelState || { value: raw.isCanceled ? ResponseModelState.Cancelled : ResponseModelState.Complete, completedAt: Date.now() };
      if (modelState.value === ResponseModelState.Pending || modelState.value === ResponseModelState.NeedsInput) {
        modelState = { value: ResponseModelState.Cancelled, completedAt: Date.now() };
      }
      if (raw.response) {
        for (const part of raw.response) {
          if (hasKey(part, { kind: true }) && (part.kind === "questionCarousel" || part.kind === "planReview")) {
            part.isUsed = true;
          }
        }
      }
      request.response = new ChatResponseModel({
        responseContent: raw.response ?? [new MarkdownString(raw.response)],
        session: this,
        agent,
        slashCommand: raw.slashCommand,
        requestId: request.id,
        modelState,
        completionTimestamp: raw.modelState && "completedAt" in raw.modelState && Number.isFinite(raw.modelState.completedAt) && raw.modelState.completedAt > 0 ? raw.modelState.completedAt : null,
        vote: raw.vote,
        timestamp: typeof raw.responseTimestamp === "number" && raw.responseTimestamp > 0 ? raw.responseTimestamp : requestTimestamp,
        result,
        followups: raw.followups,
        restoredId: raw.responseId,
        timeSpentWaiting: raw.timeSpentWaiting,
        elapsedMs: raw.elapsedMs,
        shouldBeBlocked: request.shouldBeBlocked.get(),
        codeBlockInfos: raw.responseMarkdownInfo?.map((info) => ({ suggestionId: info.suggestionId }))
      });
      request.response.shouldBeRemovedOnSend = raw.isHidden ? { requestId: raw.requestId } : raw.shouldBeRemovedOnSend;
      if (typeof raw.completionTokens === "number" || typeof raw.promptTokens === "number" || typeof raw.copilotCredits === "number" || typeof raw.sessionCopilotCredits === "number") {
        request.response.setUsage({
          kind: "usage",
          promptTokens: raw.promptTokens ?? 0,
          completionTokens: raw.completionTokens ?? 0,
          outputBuffer: raw.outputBuffer,
          promptTokenDetails: raw.promptTokenDetails,
          copilotCredits: raw.copilotCredits,
          modelTotals: raw.modelTotals,
          sessionCopilotCredits: raw.sessionCopilotCredits
        });
      }
      if (raw.usedContext) {
        request.response.applyReference(revive(raw.usedContext));
      }
      raw.contentReferences?.forEach((r) => request.response.applyReference(revive(r)));
      raw.codeCitations?.forEach((c) => request.response.applyCodeCitation(revive(c)));
    }
    return request;
  }
  reviveVariableData(raw) {
    const variableData = raw && Array.isArray(raw.variables) ? raw : { variables: [] };
    variableData.variables = variableData.variables.map(IChatRequestVariableEntry.fromExport);
    return variableData;
  }
  getParsedRequestFromString(message) {
    const parts = [new ChatRequestTextPart(new OffsetRange(0, message.length), { startColumn: 1, startLineNumber: 1, endColumn: 1, endLineNumber: 1 }, message)];
    return {
      text: message,
      parts
    };
  }
  /**
   * Hydrates pending requests from serialized data.
   * For each serialized pending request, finds the matching request model and adds it to the pending queue.
   */
  _deserializePendingRequests(pendingRequests) {
    try {
      return pendingRequests.map((pending) => ({
        id: pending.id,
        request: this._deserializeRequest(pending.request),
        kind: pending.kind,
        sendOptions: {
          ...pending.sendOptions,
          userSelectedTools: pending.sendOptions.userSelectedTools ? constObservable(pending.sendOptions.userSelectedTools) : void 0
        }
      }));
    } catch (e) {
      this.logService.error("Failed to parse pending chat requests", e);
      return [];
    }
  }
  getRequests() {
    return this._requests;
  }
  resetCheckpoint() {
    for (const request of this._requests) {
      request.setShouldBeBlocked(false);
      if (request.response) {
        request.response.setBlockedState(false);
      }
    }
  }
  setCheckpoint(requestId) {
    let checkpoint;
    let checkpointIndex = -1;
    if (requestId !== void 0) {
      this._requests.forEach((request, index) => {
        if (request.id === requestId) {
          checkpointIndex = index;
          checkpoint = request;
          request.setShouldBeBlocked(true);
        }
      });
      if (!checkpoint) {
        return;
      }
    }
    for (let i = this._requests.length - 1; i >= 0; i -= 1) {
      const request = this._requests[i];
      if (this._checkpoint && !checkpoint) {
        request.setShouldBeBlocked(false);
        if (request.response) {
          request.response.setBlockedState(false);
        }
      } else if (checkpoint && i >= checkpointIndex) {
        request.setShouldBeBlocked(true);
        if (request.response) {
          request.response.setBlockedState(true);
        }
      } else if (checkpoint && i < checkpointIndex) {
        request.setShouldBeBlocked(false);
        if (request.response) {
          request.response.setBlockedState(false);
        }
      }
    }
    this._checkpoint = checkpoint;
  }
  get checkpoint() {
    return this._checkpoint;
  }
  _setDisabledRequests(requestIds) {
    this._requests.forEach((request) => {
      const shouldBeRemovedOnSend = requestIds.find((r) => r.requestId === request.id);
      request.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
      if (request.response) {
        request.response.shouldBeRemovedOnSend = shouldBeRemovedOnSend;
      }
    });
    this._onDidChange.fire({ kind: "setHidden" });
  }
  addRequest(message, variableData, attempt, modeInfo, chatAgent, slashCommand, confirmation, locationData, attachments, isCompleteAddedRequest, modelId, userSelectedTools, id, isSystemInitiated, systemInitiatedLabel, terminalExecutionId, isTerminalCommand, timestamp, hideFromTranscript, origin) {
    const editedFileEvents = [...this.currentEditedFileEvents.values()];
    this.currentEditedFileEvents.clear();
    const requestTimestamp = timestamp === void 0 ? Date.now() : typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0 ? timestamp : void 0;
    const request = new ChatRequestModel({
      restoredId: id,
      session: this,
      message,
      variableData,
      timestamp: requestTimestamp,
      fallbackTimestamp: this._timestamp,
      attempt,
      modeInfo,
      confirmation,
      locationData,
      attachedContext: attachments,
      isCompleteAddedRequest,
      modelId,
      editedFileEvents: editedFileEvents.length ? editedFileEvents : void 0,
      userSelectedTools,
      isSystemInitiated,
      isHiddenFromTranscript: hideFromTranscript,
      systemInitiatedLabel,
      terminalExecutionId,
      isTerminalCommand,
      origin
    });
    request.response = new ChatResponseModel({
      responseContent: [],
      session: this,
      agent: chatAgent,
      slashCommand,
      requestId: request.id,
      isCompleteAddedRequest,
      codeBlockInfos: void 0
    });
    this._requests.push(request);
    markChat(this.sessionResource, ChatPerfMark.RequestUiUpdated);
    this._onDidChange.fire({ kind: "addRequest", request });
    return request;
  }
  setCustomTitle(title) {
    this._customTitle = title;
    this._onDidChange.fire({ kind: "setCustomTitle", title });
  }
  updateRequest(request, variableData) {
    request.variableData = variableData;
    this._onDidChange.fire({ kind: "changedRequest", request });
  }
  adoptRequest(request) {
    const oldOwner = request.session;
    const index = oldOwner._requests.findIndex((candidate) => candidate.id === request.id);
    if (index === -1) {
      return;
    }
    oldOwner._requests.splice(index, 1);
    request.adoptTo(this);
    request.response?.adoptTo(this);
    this._requests.push(request);
    oldOwner._onDidChange.fire({ kind: "removeRequest", requestId: request.id, responseId: request.response?.id, reason: 2 /* Adoption */ });
    this._onDidChange.fire({ kind: "addRequest", request });
  }
  acceptResponseProgress(request, progress, quiet) {
    if (!request.response) {
      request.response = new ChatResponseModel({
        responseContent: [],
        session: this,
        requestId: request.id,
        codeBlockInfos: void 0
      });
    }
    if (request.response.isComplete) {
      throw new Error("acceptResponseProgress: Adding progress to a completed response");
    }
    if (progress.kind === "usage") {
      request.response.setUsage(progress);
    } else if (progress.kind === "usedContext" || progress.kind === "reference") {
      request.response.applyReference(progress);
    } else if (progress.kind === "codeCitation") {
      request.response.applyCodeCitation(progress);
    } else if (progress.kind === "move") {
      this._onDidChange.fire({ kind: "move", target: progress.uri, range: progress.range });
    } else if (progress.kind === "codeblockUri" && progress.isEdit) {
      request.response.addUndoStop({ id: progress.undoStopId ?? generateUuid(), kind: "undoStop" });
      request.response.updateContent(progress, quiet);
    } else if (progress.kind === "progressTaskResult") {
      this.logService.error(`Couldn't handle progress: ${JSON.stringify(progress)}`);
    } else {
      request.response.updateContent(progress, quiet);
    }
  }
  removeRequest(id, reason = 0 /* Removal */) {
    const index = this._requests.findIndex((request2) => request2.id === id);
    const request = this._requests[index];
    if (index !== -1) {
      this._onDidChange.fire({ kind: "removeRequest", requestId: request.id, responseId: request.response?.id, reason });
      this._requests.splice(index, 1);
      request.response?.dispose();
    }
  }
  cancelRequest(request) {
    if (request.response) {
      request.response.cancel();
    }
  }
  setResponse(request, result) {
    if (!request.response) {
      request.response = new ChatResponseModel({
        responseContent: [],
        session: this,
        requestId: request.id,
        codeBlockInfos: void 0
      });
    }
    request.response.setResult(result);
  }
  setFollowups(request, followups) {
    if (!request.response) {
      return;
    }
    request.response.setFollowups(followups);
  }
  setResponseModel(request, response) {
    request.response = response;
    this._onDidChange.fire({ kind: "addResponse", response });
  }
  toExport() {
    return {
      responderUsername: this.responderUsername,
      initialLocation: this.initialLocation,
      requests: this._requests.map((r) => {
        const message = {
          ...r.message,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          parts: r.message.parts.map((p) => p && "toJSON" in p ? p.toJSON() : p)
        };
        const agent = r.response?.agent;
        const agentJson = agent && "toJSON" in agent ? agent.toJSON() : agent ? { ...agent } : void 0;
        return {
          requestId: r.id,
          message,
          variableData: IChatRequestVariableData.toExport(r.variableData),
          response: r.response ? r.response.entireResponse.value.filter((item) => item.kind !== "voiceProgress").map((item) => {
            if (item.kind === "treeData") {
              return item.treeData;
            } else if (item.kind === "markdownContent") {
              return item.content;
            } else {
              return item;
            }
          }) : void 0,
          shouldBeRemovedOnSend: r.shouldBeRemovedOnSend,
          agent: agentJson,
          timestamp: r.requestTimestamp,
          confirmation: r.confirmation,
          editedFileEvents: r.editedFileEvents,
          modelId: r.modelId,
          modeInfo: r.modeInfo,
          isSystemInitiated: r.isSystemInitiated || void 0,
          hiddenFromTranscript: r.isHiddenFromTranscript || void 0,
          systemInitiatedLabel: r.systemInitiatedLabel,
          terminalExecutionId: r.terminalExecutionId,
          origin: r.origin ? serializeChatRequestOrigin(r.origin) : void 0,
          ...r.response?.toJSON()
        };
      })
    };
  }
  toJSON() {
    return {
      version: 3,
      ...this.toExport(),
      sessionId: this.sessionId,
      creationDate: this._timestamp,
      customTitle: this._customTitle,
      inputState: this.inputModel.toJSON(),
      workingDirectory: this._workingDirectory?.toString()
    };
  }
  dispose() {
    this._requests.forEach((r) => r.response?.dispose());
    this._onDidDispose.fire();
    super.dispose();
    this._requests.length = 0;
    this.dataSerializer = void 0;
    this._editingSession = void 0;
  }
};
ChatModel = __decorateClass([
  __decorateParam(2, ILogService),
  __decorateParam(3, IChatAgentService),
  __decorateParam(4, IChatEditingService),
  __decorateParam(5, IChatService)
], ChatModel);
function updateRanges(variableData, diff) {
  return {
    variables: variableData.variables.map((v) => ({
      ...v,
      range: v.range && {
        start: v.range.start - diff,
        endExclusive: v.range.endExclusive - diff
      }
    }))
  };
}
function canMergeMarkdownStrings(md1, md2) {
  if (md1.baseUri && md2.baseUri) {
    const baseUriEquals = md1.baseUri.scheme === md2.baseUri.scheme && md1.baseUri.authority === md2.baseUri.authority && md1.baseUri.path === md2.baseUri.path && md1.baseUri.query === md2.baseUri.query && md1.baseUri.fragment === md2.baseUri.fragment;
    if (!baseUriEquals) {
      return false;
    }
  } else if (md1.baseUri || md2.baseUri) {
    return false;
  }
  return equals(md1.isTrusted, md2.isTrusted) && md1.supportHtml === md2.supportHtml && md1.supportThemeIcons === md2.supportThemeIcons;
}
function isNestedSubagentResponsePart(part) {
  return "subAgentInvocationId" in part && !!part.subAgentInvocationId;
}
function appendMarkdownString(md1, md2) {
  const appendedValue = typeof md2 === "string" ? md2 : md2.value;
  return {
    value: md1.value + appendedValue,
    isTrusted: md1.isTrusted,
    supportThemeIcons: md1.supportThemeIcons,
    supportHtml: md1.supportHtml,
    baseUri: md1.baseUri
  };
}
function getCodeCitationsMessage(citations) {
  if (citations.length === 0) {
    return "";
  }
  const licenseTypes = citations.reduce((set, c) => set.add(c.license), /* @__PURE__ */ new Set());
  const label = licenseTypes.size === 1 ? localize("codeCitation", "Similar code found with 1 license type", licenseTypes.size) : localize("codeCitations", "Similar code found with {0} license types", licenseTypes.size);
  return label;
}
function serializeSendOptions(options) {
  return {
    modeInfo: options.modeInfo,
    userSelectedModelId: options.userSelectedModelId,
    userSelectedModelConfiguration: options.userSelectedModelConfiguration,
    userSelectedTools: options.userSelectedTools?.get(),
    instructionContext: options.instructionContext,
    location: options.location,
    locationData: options.locationData,
    attempt: options.attempt,
    noCommandDetection: options.noCommandDetection,
    isVoiceModeInput: options.isVoiceModeInput,
    agentId: options.agentId,
    agentIdSilent: options.agentIdSilent,
    slashCommand: options.slashCommand,
    confirmation: options.confirmation,
    isSystemInitiated: options.isSystemInitiated,
    hideFromTranscript: options.hideFromTranscript,
    systemInitiatedLabel: options.systemInitiatedLabel,
    terminalExecutionId: options.terminalExecutionId
  };
}
var ChatRequestEditedFileEventKind = /* @__PURE__ */ ((ChatRequestEditedFileEventKind2) => {
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["Keep"] = 1] = "Keep";
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["Undo"] = 2] = "Undo";
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["UserModification"] = 3] = "UserModification";
  return ChatRequestEditedFileEventKind2;
})(ChatRequestEditedFileEventKind || {});
var ChatResponseResource;
((ChatResponseResource2) => {
  ChatResponseResource2.scheme = Schemas.vscodeChatResponseResource;
  function createUri(sessionResource, toolCallId, index, basename2) {
    return URI.from({
      scheme: ChatResponseResource2.scheme,
      authority: encodeHex(VSBuffer.fromString(sessionResource.toString())),
      path: `/tool/${toolCallId}/${index}` + (basename2 ? `/${basename2}` : "")
    });
  }
  ChatResponseResource2.createUri = createUri;
  function parseUri(uri) {
    if (uri.scheme !== ChatResponseResource2.scheme) {
      return void 0;
    }
    const parts = uri.path.split("/");
    if (parts.length < 4) {
      return void 0;
    }
    const [, kind, toolCallId, index] = parts;
    if (kind !== "tool") {
      return void 0;
    }
    let sessionResource;
    try {
      sessionResource = URI.parse(decodeHex(uri.authority).toString());
    } catch (e) {
      if (e instanceof SyntaxError) {
        sessionResource = LocalChatSessionUri.forSession(uri.authority);
      } else {
        throw e;
      }
    }
    return {
      sessionResource,
      toolCallId,
      index: Number(index)
    };
  }
  ChatResponseResource2.parseUri = parseUri;
})(ChatResponseResource || (ChatResponseResource = {}));
function _logChangesToStateModel(newState, oldState, logger, sessionId) {
  if (!canLog(logger.getLevel(), LogLevel.Debug) || newState?.selectedModel?.identifier === oldState?.selectedModel?.identifier) {
    return;
  }
  const stack = new Error().stack;
  const message = `[ChatModelChanged] ChatModel Input State model changed: ${newState?.selectedModel?.identifier} (was: ${oldState?.selectedModel?.identifier}) in session ${sessionId} ${stack}`;
  logger.debug(message);
}
function logChangesToStateModel(model, message, newState, oldState, logger) {
  if (!canLog(logger.getLevel(), LogLevel.Debug)) {
    return;
  }
  message = [
    message,
    `model.selectedModel: ${model?.state.get()?.selectedModel?.identifier}`,
    `new state: ${newState?.selectedModel?.identifier}`,
    `old state: ${oldState?.selectedModel?.identifier}`,
    new Error().stack
  ].join(", ");
  logger.debug(`[ChatModelChanged] Chat Model Changed,${message}`);
}
export {
  CHAT_ATTACHABLE_IMAGE_MIME_TYPES,
  ChatInputStateOrigin,
  ChatModel,
  ChatRequestEditedFileEventKind,
  ChatRequestModel,
  ChatRequestRemovalReason,
  ChatResponseModel,
  ChatResponseResource,
  IChatRequestVariableData,
  IntendedModelSlot,
  Response,
  appendMarkdownString,
  canMergeMarkdownStrings,
  defaultChatResponseModelChangeReason,
  extractExportableSessionData,
  getAttachableImageExtension,
  getCodeCitationsMessage,
  isCellTextEditOperation,
  isCellTextEditOperationArray,
  isExportableSessionData,
  isSerializableSessionData,
  logChangesToStateModel,
  normalizeSerializableChatData,
  reviveSerializableInputState,
  serializeSendOptions,
  toChatHistoryContent,
  updateRanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcbW9kZWxcXGNoYXRNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgc29mdEFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IFZTQnVmZmVyLCBkZWNvZGVIZXgsIGVuY29kZUhleCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUsIElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcsIGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZVZhbHVlT3B0cywgcmVnaXN0ZXJBdXRvcnVuU2VsZkRpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGhhc0tleSwgV2l0aERlZmluZWRQcm9wcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpRHRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IEVkaXRTdWdnZXN0aW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY2FuTG9nLCBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpLCBJQ2VsbEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzSW1wbGljaXRWYXJpYWJsZUVudHJ5LCBpc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlLCBpc1N0cmluZ1ZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IG1pZ3JhdGVMZWdhY3lUZXJtaW5hbFRvb2xTcGVjaWZpY0RhdGEgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdE9yaWdpbiwgSVNlcmlhbGl6YWJsZUNoYXRSZXF1ZXN0T3JpZ2luLCByZXZpdmVDaGF0UmVxdWVzdE9yaWdpbiwgc2VyaWFsaXplQ2hhdFJlcXVlc3RPcmlnaW4gfSBmcm9tICcuLi9jaGF0UmVxdWVzdE9yaWdpbi5qcyc7XG5pbXBvcnQgeyBDaGF0UGVyZk1hcmssIG1hcmtDaGF0IH0gZnJvbSAnLi4vY2hhdFBlcmYuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50Vm90ZURpcmVjdGlvbiwgQ2hhdFJlcXVlc3RRdWV1ZUtpbmQsIENoYXRSZXNwb25zZUNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uUmVhc29uLCBFbGljaXRhdGlvblN0YXRlLCBJQ2hhdEFnZW50TWFya2Rvd25Db250ZW50V2l0aFZ1bG5lcmFiaWxpdHksIElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydCwgSUNoYXRDbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvbiwgSUNoYXRDb2RlQ2l0YXRpb24sIElDaGF0Q29tbWFuZEJ1dHRvbiwgSUNoYXRDb25maXJtYXRpb24sIElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSwgSUNoYXRDb250ZW50UmVmZXJlbmNlLCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0LCBJQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uLCBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdCwgSUNoYXRFbGljaXRhdGlvblJlcXVlc3RTZXJpYWxpemVkLCBJQ2hhdEV4dGVybmFsRWRpdCwgSUNoYXRFeHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlLCBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LCBJQ2hhdEZvbGxvd3VwLCBJQ2hhdEhvb2tQYXJ0LCBJQ2hhdEluZm9NZXNzYWdlLCBJQ2hhdExvY2F0aW9uRGF0YSwgSUNoYXRNYXJrZG93bkNvbnRlbnQsIElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZCwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmcsIElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nU2VyaWFsaXplZCwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdTbG93LCBJQ2hhdE1vZGVsUmVmZXJlbmNlLCBJQ2hhdE11bHRpRGlmZkRhdGEsIElDaGF0TXVsdGlEaWZmRGF0YVNlcmlhbGl6ZWQsIElDaGF0Tm90ZWJvb2tFZGl0LCBJQ2hhdFBsYW5SZXZpZXcsIElDaGF0UHJvZ3Jlc3MsIElDaGF0UHJvZ3Jlc3NNZXNzYWdlLCBJQ2hhdFB1bGxSZXF1ZXN0Q29udGVudCwgSUNoYXRRdWVzdGlvbkNhcm91c2VsLCBJQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydCwgSUNoYXRSZXNwb25zZVByb2dyZXNzRmlsZVRyZWVEYXRhLCBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgSUNoYXRTZXJ2aWNlLCBJQ2hhdFNlc3Npb25UaW1pbmcsIElDaGF0U3lzdGVtTm90aWZpY2F0aW9uUGFydCwgSUNoYXRUYXNrLCBJQ2hhdFRhc2tTZXJpYWxpemVkLCBJQ2hhdFRleHRFZGl0LCBJQ2hhdFRoaW5raW5nUGFydCwgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIElDaGF0VHJlZURhdGEsIElDaGF0VW5kb1N0b3AsIElDaGF0VXNhZ2UsIElDaGF0VXNhZ2VNb2RlbFRvdGFsLCBJQ2hhdFVzYWdlUHJvbXB0VG9rZW5EZXRhaWwsIElDaGF0VXNlZENvbnRleHQsIElDaGF0Vm9pY2VQcm9ncmVzc1BhcnQsIElDaGF0V2FybmluZ01lc3NhZ2UsIElDaGF0V29ya3NwYWNlRWRpdCwgUmVzcG9uc2VNb2RlbFN0YXRlLCBUb29sQ29uZmlybUtpbmQsIGlzSVVzZWRDb250ZXh0IH0gZnJvbSAnLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCwgQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRUb29sSW52b2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0UGxhblJldmlld0RhdGEgfSBmcm9tICcuL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRQbGFuUmV2aWV3RGF0YS5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEgfSBmcm9tICcuL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRRdWVzdGlvbkNhcm91c2VsRGF0YS5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSwgSVRvb2xEYXRhIH0gZnJvbSAnLi4vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElJbnRlbmRlZE1vZGVsU2VsZWN0aW9uIH0gZnJvbSAnLi4vbW9kZWxTZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudENvbW1hbmQsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50UmVzdWx0LCBJQ2hhdEFnZW50U2VydmljZSwgVXNlclNlbGVjdGVkVG9vbHMsIHJldml2ZVNlcmlhbGl6ZWRBZ2VudCB9IGZyb20gJy4uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0VGV4dFBhcnQsIElQYXJzZWRDaGF0UmVxdWVzdCwgcmV2aXZlUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBjaGF0U2Vzc2lvblJlc291cmNlVG9JZCwgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4vY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBPYmplY3RNdXRhdGlvbkxvZyB9IGZyb20gJy4vb2JqZWN0TXV0YXRpb25Mb2cuanMnO1xuXG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHF1ZXVlZCBjaGF0IHJlcXVlc3Qgd2FpdGluZyB0byBiZSBwcm9jZXNzZWQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRQZW5kaW5nUmVxdWVzdCB7XG5cdHJlYWRvbmx5IHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsO1xuXHRyZWFkb25seSBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZDtcblx0LyoqXG5cdCAqIFRoZSBvcHRpb25zIHRoYXQgd2VyZSBwYXNzZWQgdG8gc2VuZFJlcXVlc3Qgd2hlbiB0aGlzIHJlcXVlc3Qgd2FzIHF1ZXVlZC5cblx0ICogdXNlclNlbGVjdGVkVG9vbHMgaXMgc25hcHNob3R0ZWQgdG8gYSBzdGF0aWMgb2JzZXJ2YWJsZSBhdCBxdWV1ZSB0aW1lLlxuXHQgKi9cblx0cmVhZG9ubHkgc2VuZE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zO1xufVxuXG4vKipcbiAqIFNlcmlhbGl6YWJsZSB2ZXJzaW9uIG9mIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zIGZvciBwZW5kaW5nIHJlcXVlc3RzLlxuICogRXhjbHVkZXMgb2JzZXJ2YWJsZXMgYW5kIG5vbi1zZXJpYWxpemFibGUgZmllbGRzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVTZW5kT3B0aW9ucyB7XG5cdG1vZGVJbmZvPzogSUNoYXRSZXF1ZXN0TW9kZUluZm87XG5cdHVzZXJTZWxlY3RlZE1vZGVsSWQ/OiBzdHJpbmc7XG5cdHVzZXJTZWxlY3RlZE1vZGVsQ29uZmlndXJhdGlvbj86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xuXHQvKiogU3RhdGljIHNuYXBzaG90IG9mIHVzZXItc2VsZWN0ZWQgdG9vbHMgKG5vdCBhbiBvYnNlcnZhYmxlKSAqL1xuXHR1c2VyU2VsZWN0ZWRUb29scz86IFVzZXJTZWxlY3RlZFRvb2xzO1xuXHRpbnN0cnVjdGlvbkNvbnRleHQ/OiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9uc1snaW5zdHJ1Y3Rpb25Db250ZXh0J107XG5cdGxvY2F0aW9uPzogQ2hhdEFnZW50TG9jYXRpb247XG5cdGxvY2F0aW9uRGF0YT86IElDaGF0TG9jYXRpb25EYXRhO1xuXHRhdHRlbXB0PzogbnVtYmVyO1xuXHRub0NvbW1hbmREZXRlY3Rpb24/OiBib29sZWFuO1xuXHRpc1ZvaWNlTW9kZUlucHV0PzogYm9vbGVhbjtcblx0YWdlbnRJZD86IHN0cmluZztcblx0YWdlbnRJZFNpbGVudD86IHN0cmluZztcblx0c2xhc2hDb21tYW5kPzogc3RyaW5nO1xuXHRjb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdGlzU3lzdGVtSW5pdGlhdGVkPzogYm9vbGVhbjtcblx0aGlkZUZyb21UcmFuc2NyaXB0PzogYm9vbGVhbjtcblx0c3lzdGVtSW5pdGlhdGVkTGFiZWw/OiBzdHJpbmc7XG5cdHRlcm1pbmFsRXhlY3V0aW9uSWQ/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogU2VyaWFsaXphYmxlIHJlcHJlc2VudGF0aW9uIG9mIGEgcGVuZGluZyBjaGF0IHJlcXVlc3QuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6YWJsZVBlbmRpbmdSZXF1ZXN0RGF0YSB7XG5cdGlkOiBzdHJpbmc7XG5cdHJlcXVlc3Q6IElTZXJpYWxpemFibGVDaGF0UmVxdWVzdERhdGE7XG5cdGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kO1xuXHRzZW5kT3B0aW9uczogSVNlcmlhbGl6YWJsZVNlbmRPcHRpb25zO1xufVxuXG5leHBvcnQgY29uc3QgQ0hBVF9BVFRBQ0hBQkxFX0lNQUdFX01JTUVfVFlQRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdHBuZzogJ2ltYWdlL3BuZycsXG5cdGpwZzogJ2ltYWdlL2pwZWcnLFxuXHRqcGVnOiAnaW1hZ2UvanBlZycsXG5cdGdpZjogJ2ltYWdlL2dpZicsXG5cdHdlYnA6ICdpbWFnZS93ZWJwJyxcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBdHRhY2hhYmxlSW1hZ2VFeHRlbnNpb24obWltZVR5cGU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBPYmplY3QuZW50cmllcyhDSEFUX0FUVEFDSEFCTEVfSU1BR0VfTUlNRV9UWVBFUykuZmluZCgoW18sIHZhbHVlXSkgPT4gdmFsdWUgPT09IG1pbWVUeXBlKT8uWzBdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB7XG5cdHZhcmlhYmxlczogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0b0V4cG9ydChkYXRhOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEge1xuXHRcdHJldHVybiB7IHZhcmlhYmxlczogZGF0YS52YXJpYWJsZXMubWFwKElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkudG9FeHBvcnQpIH07XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RNb2RlbCB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyO1xuXHRyZWFkb25seSByZXF1ZXN0VGltZXN0YW1wOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHZlcnNpb246IG51bWJlcjtcblx0cmVhZG9ubHkgbW9kZUluZm8/OiBJQ2hhdFJlcXVlc3RNb2RlSW5mbztcblx0cmVhZG9ubHkgc2Vzc2lvbjogSUNoYXRNb2RlbDtcblx0cmVhZG9ubHkgbWVzc2FnZTogSVBhcnNlZENoYXRSZXF1ZXN0O1xuXHRyZWFkb25seSBhdHRlbXB0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhO1xuXHRyZWFkb25seSBjb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxvY2F0aW9uRGF0YT86IElDaGF0TG9jYXRpb25EYXRhO1xuXHRyZWFkb25seSBhdHRhY2hlZENvbnRleHQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG5cdHJlYWRvbmx5IGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVGVybWluYWxDb21tYW5kOiBib29sZWFuO1xuXHRyZWFkb25seSByZXNwb25zZT86IElDaGF0UmVzcG9uc2VNb2RlbDtcblx0cmVhZG9ubHkgZWRpdGVkRmlsZUV2ZW50cz86IElDaGF0QWdlbnRFZGl0ZWRGaWxlRXZlbnRbXTtcblx0c2hvdWxkQmVSZW1vdmVkT25TZW5kOiBJQ2hhdFJlcXVlc3REaXNhYmxlbWVudCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2hvdWxkQmVCbG9ja2VkOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0c2V0U2hvdWxkQmVCbG9ja2VkKHZhbHVlOiBib29sZWFuKTogdm9pZDtcblx0cmVhZG9ubHkgbW9kZWxJZD86IHN0cmluZztcblx0cmVhZG9ubHkgdXNlclNlbGVjdGVkVG9vbHM/OiBVc2VyU2VsZWN0ZWRUb29scztcblx0cmVhZG9ubHkgaXNTeXN0ZW1Jbml0aWF0ZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBpc0hpZGRlbkZyb21UcmFuc2NyaXB0OiBib29sZWFuO1xuXHRyZWFkb25seSBzeXN0ZW1Jbml0aWF0ZWRMYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgdGVybWluYWxFeGVjdXRpb25JZD86IHN0cmluZztcblx0cmVhZG9ubHkgb3JpZ2luPzogSUNoYXRSZXF1ZXN0T3JpZ2luO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RlQmxvY2tJbmZvIHtcblx0cmVhZG9ubHkgc3VnZ2VzdGlvbklkOiBFZGl0U3VnZ2VzdGlvbklkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VGV4dEVkaXRHcm91cFN0YXRlIHtcblx0c2hhMTogc3RyaW5nO1xuXHRhcHBsaWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRUZXh0RWRpdEdyb3VwIHtcblx0dXJpOiBVUkk7XG5cdGVkaXRzOiBUZXh0RWRpdFtdW107XG5cdHN0YXRlPzogSUNoYXRUZXh0RWRpdEdyb3VwU3RhdGU7XG5cdGtpbmQ6ICd0ZXh0RWRpdEdyb3VwJztcblx0ZG9uZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0aXNFeHRlcm5hbEVkaXQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDZWxsVGV4dEVkaXRPcGVyYXRpb24odmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJQ2VsbFRleHRFZGl0T3BlcmF0aW9uIHtcblx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWUgYXMgSUNlbGxUZXh0RWRpdE9wZXJhdGlvbjtcblx0cmV0dXJuICEhY2FuZGlkYXRlICYmICEhY2FuZGlkYXRlLmVkaXQgJiYgISFjYW5kaWRhdGUudXJpICYmIFVSSS5pc1VyaShjYW5kaWRhdGUudXJpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ2VsbFRleHRFZGl0T3BlcmF0aW9uQXJyYXkodmFsdWU6IElDZWxsVGV4dEVkaXRPcGVyYXRpb25bXSB8IElDZWxsRWRpdE9wZXJhdGlvbltdKTogdmFsdWUgaXMgSUNlbGxUZXh0RWRpdE9wZXJhdGlvbltdIHtcblx0cmV0dXJuIHZhbHVlLnNvbWUoaXNDZWxsVGV4dEVkaXRPcGVyYXRpb24pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsVGV4dEVkaXRPcGVyYXRpb24ge1xuXHRlZGl0OiBUZXh0RWRpdDtcblx0dXJpOiBVUkk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXROb3RlYm9va0VkaXRHcm91cCB7XG5cdHVyaTogVVJJO1xuXHRlZGl0czogKElDZWxsVGV4dEVkaXRPcGVyYXRpb25bXSB8IElDZWxsRWRpdE9wZXJhdGlvbltdKVtdO1xuXHRzdGF0ZT86IElDaGF0VGV4dEVkaXRHcm91cFN0YXRlO1xuXHRraW5kOiAnbm90ZWJvb2tFZGl0R3JvdXAnO1xuXHRkb25lOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRpc0V4dGVybmFsRWRpdD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogUHJvZ3Jlc3Mga2luZHMgdGhhdCBhcmUgaW5jbHVkZWQgaW4gdGhlIGhpc3Rvcnkgb2YgYSByZXNwb25zZS5cbiAqIEV4Y2x1ZGVzIFwiaW50ZXJuYWxcIiB0eXBlcyB0aGF0IGFyZSBpbmNsdWRlZCBpbiBoaXN0b3J5LlxuICovXG5leHBvcnQgdHlwZSBJQ2hhdFByb2dyZXNzSGlzdG9yeVJlc3BvbnNlQ29udGVudCA9XG5cdHwgSUNoYXRNYXJrZG93bkNvbnRlbnRcblx0fCBJQ2hhdEFnZW50TWFya2Rvd25Db250ZW50V2l0aFZ1bG5lcmFiaWxpdHlcblx0fCBJQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydFxuXHR8IElDaGF0VHJlZURhdGFcblx0fCBJQ2hhdE11bHRpRGlmZkRhdGFTZXJpYWxpemVkXG5cdHwgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlXG5cdHwgSUNoYXRQcm9ncmVzc01lc3NhZ2Vcblx0fCBJQ2hhdFN5c3RlbU5vdGlmaWNhdGlvblBhcnRcblx0fCBJQ2hhdENvbW1hbmRCdXR0b25cblx0fCBJQ2hhdFdhcm5pbmdNZXNzYWdlXG5cdHwgSUNoYXRJbmZvTWVzc2FnZVxuXHR8IElDaGF0VGFza1xuXHR8IElDaGF0VGFza1NlcmlhbGl6ZWRcblx0fCBJQ2hhdFRleHRFZGl0R3JvdXBcblx0fCBJQ2hhdE5vdGVib29rRWRpdEdyb3VwXG5cdHwgSUNoYXRDb25maXJtYXRpb25cblx0fCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxcblx0fCBJQ2hhdFBsYW5SZXZpZXdcblx0fCBJQ2hhdEV4dGVuc2lvbnNDb250ZW50XG5cdHwgSUNoYXRUaGlua2luZ1BhcnRcblx0fCBJQ2hhdEhvb2tQYXJ0XG5cdHwgSUNoYXRQdWxsUmVxdWVzdENvbnRlbnRcblx0fCBJQ2hhdFdvcmtzcGFjZUVkaXRcblx0fCBJQ2hhdEV4dGVybmFsRWRpdFxuXHR8IElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydDtcblxuLyoqXG4gKiBcIk5vcm1hbFwiIHByb2dyZXNzIGtpbmRzIHRoYXQgYXJlIHJlbmRlcmVkIGFzIHBhcnRzIG9mIHRoZSBzdHJlYW0gb2YgY29udGVudC5cbiAqL1xuZXhwb3J0IHR5cGUgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCA9XG5cdHwgSUNoYXRQcm9ncmVzc0hpc3RvcnlSZXNwb25zZUNvbnRlbnRcblx0fCBJQ2hhdFRvb2xJbnZvY2F0aW9uXG5cdHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWRcblx0fCBJQ2hhdE11bHRpRGlmZkRhdGFcblx0fCBJQ2hhdFVuZG9TdG9wXG5cdHwgSUNoYXRFbGljaXRhdGlvblJlcXVlc3Rcblx0fCBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFNlcmlhbGl6ZWRcblx0fCBJQ2hhdENsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uXG5cdHwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdcblx0fCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1NlcmlhbGl6ZWRcblx0fCBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRcblx0fCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1Nsb3dcblx0fCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0XG5cdHwgSUNoYXRWb2ljZVByb2dyZXNzUGFydDtcblxuZXhwb3J0IHR5cGUgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudFNlcmlhbGl6ZWQgPSBFeGNsdWRlPElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQsXG5cdHwgSUNoYXRUb29sSW52b2NhdGlvblxuXHR8IElDaGF0RWxpY2l0YXRpb25SZXF1ZXN0XG5cdHwgSUNoYXRUYXNrXG5cdHwgSUNoYXRNdWx0aURpZmZEYXRhXG5cdHwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdcblx0fCBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRcblx0fCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1Nsb3dcblx0fCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0XG5cdHwgSUNoYXRWb2ljZVByb2dyZXNzUGFydFxuPjtcblxuY29uc3Qgbm9uSGlzdG9yeUtpbmRzID0gbmV3IFNldChbJ3Rvb2xJbnZvY2F0aW9uJywgJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsICd1bmRvU3RvcCcsICd2b2ljZVByb2dyZXNzJ10pO1xuZnVuY3Rpb24gaXNDaGF0UHJvZ3Jlc3NIaXN0b3J5UmVzcG9uc2VDb250ZW50KGNvbnRlbnQ6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQpOiBjb250ZW50IGlzIElDaGF0UHJvZ3Jlc3NIaXN0b3J5UmVzcG9uc2VDb250ZW50IHtcblx0cmV0dXJuICFub25IaXN0b3J5S2luZHMuaGFzKGNvbnRlbnQua2luZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0NoYXRIaXN0b3J5Q29udGVudChjb250ZW50OiBSZWFkb25seUFycmF5PElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQ+KTogSUNoYXRQcm9ncmVzc0hpc3RvcnlSZXNwb25zZUNvbnRlbnRbXSB7XG5cdHJldHVybiBjb250ZW50LmZpbHRlcihpc0NoYXRQcm9ncmVzc0hpc3RvcnlSZXNwb25zZUNvbnRlbnQpO1xufVxuXG5leHBvcnQgdHlwZSBJQ2hhdFByb2dyZXNzUmVuZGVyYWJsZVJlc3BvbnNlQ29udGVudCA9IEV4Y2x1ZGU8SUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCwgSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlIHwgSUNoYXRBZ2VudE1hcmtkb3duQ29udGVudFdpdGhWdWxuZXJhYmlsaXR5IHwgSUNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQgfCBJQ2hhdFZvaWNlUHJvZ3Jlc3NQYXJ0PjtcblxuZXhwb3J0IGludGVyZmFjZSBJUmVzcG9uc2Uge1xuXHRyZWFkb25seSB2YWx1ZTogUmVhZG9ubHlBcnJheTxJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50Pjtcblx0Z2V0TWFya2Rvd24oKTogc3RyaW5nO1xuXHRnZXRGaW5hbFJlc3BvbnNlKCk6IHN0cmluZztcblx0dG9TdHJpbmcoKTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVzcG9uc2VNb2RlbCB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbj47XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdXNlcm5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvbjogSUNoYXRNb2RlbDtcblx0cmVhZG9ubHkgYWdlbnQ/OiBJQ2hhdEFnZW50RGF0YTtcblx0cmVhZG9ubHkgdXNlZENvbnRleHQ6IElDaGF0VXNlZENvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbnRlbnRSZWZlcmVuY2VzOiBSZWFkb25seUFycmF5PElDaGF0Q29udGVudFJlZmVyZW5jZT47XG5cdHJlYWRvbmx5IGNvZGVDaXRhdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb2RlQ2l0YXRpb24+O1xuXHRyZWFkb25seSBwcm9ncmVzc01lc3NhZ2VzOiBSZWFkb25seUFycmF5PElDaGF0UHJvZ3Jlc3NNZXNzYWdlPjtcblx0cmVhZG9ubHkgc2xhc2hDb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQ7XG5cdHJlYWRvbmx5IGFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZDogYm9vbGVhbjtcblx0LyoqIFZpZXcgb2YgdGhlIHJlc3BvbnNlIHNob3duIHRvIHRoZSB1c2VyLCBtYXkgaGF2ZSBwYXJ0cyBvbWl0dGVkIGZyb20gdW5kbyBzdG9wcy4gKi9cblx0cmVhZG9ubHkgcmVzcG9uc2U6IElSZXNwb25zZTtcblx0LyoqIEVudGlyZSByZXNwb25zZSBmcm9tIHRoZSBtb2RlbC4gKi9cblx0cmVhZG9ubHkgZW50aXJlUmVzcG9uc2U6IElSZXNwb25zZTtcblx0LyoqIE1pbGxpc2Vjb25kcyB0aW1lc3RhbXAgd2hlbiB0aGlzIGNoYXQgcmVzcG9uc2Ugd2FzIGNyZWF0ZWQuICovXG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyO1xuXHQvKiogTWlsbGlzZWNvbmRzIHRpbWVzdGFtcCB3aGVuIHRoaXMgY2hhdCByZXNwb25zZSB3YXMgY29tcGxldGVkIG9yIGNhbmNlbGxlZC4gKi9cblx0cmVhZG9ubHkgY29tcGxldGVkQXQ/OiBudW1iZXI7XG5cdC8qKiBLbm93biBjb21wbGV0aW9uIHRpbWVzdGFtcCBmb3IgZGlzcGxheS4gVW5kZWZpbmVkIGZvciBsZWdhY3kgcmVzcG9uc2VzIHdob3NlIGNvbXBsZXRpb24gdGltZSB3YXMgc3ludGhlc2l6ZWQgZHVyaW5nIHJlc3RvcmUuICovXG5cdHJlYWRvbmx5IGNvbXBsZXRpb25UaW1lc3RhbXA/OiBudW1iZXI7XG5cdC8qKiBUaGUgc3RhdGUgb2YgdGhpcyByZXNwb25zZSAqL1xuXHRyZWFkb25seSBzdGF0ZTogUmVzcG9uc2VNb2RlbFN0YXRlO1xuXHQvKiogQGludGVybmFsICovXG5cdHJlYWRvbmx5IHN0YXRlVDogUmVzcG9uc2VNb2RlbFN0YXRlVDtcblx0LyoqXG5cdCAqIEFkanVzdGVkIG1pbGxpc2Vjb25kIHRpbWVzdGFtcCB0aGF0IGV4Y2x1ZGVzIHRoZSBkdXJhdGlvbiBkdXJpbmcgd2hpY2hcblx0ICogdGhlIG1vZGVsIHdhcyBwZW5kaW5nIHVzZXIgY29uZmlybWF0aW9uLiBgRGF0ZS5ub3coKSAtIGNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wYFxuXHQgKiB3aWxsIHJldHVybiB0aGUgYW1vdW50IG9mIHRpbWUgdGhlIHJlc3BvbnNlIHdhcyBidXN5IGdlbmVyYXRpbmcgY29udGVudC5cblx0ICogVGhpcyBpcyB1cGRhdGVkIG9ubHkgd2hlbiBgaXNQZW5kaW5nQ29uZmlybWF0aW9uYCBjaGFuZ2VzIHN0YXRlLlxuXHQgKi9cblx0cmVhZG9ubHkgY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXA6IElPYnNlcnZhYmxlPG51bWJlcj47XG5cdHJlYWRvbmx5IGlzQ29tcGxldGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzQ2FuY2VsZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzUGVuZGluZ0NvbmZpcm1hdGlvbjogSU9ic2VydmFibGU8eyBzdGFydGVkV2FpdGluZ0F0OiBudW1iZXI7IGRldGFpbD86IHN0cmluZyB9IHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgaXNJblByb2dyZXNzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqXG5cdCAqIFRydWUgd2hlbmV2ZXIgdGhpcyByZXNwb25zZSBoYXMgbm90IHJlYWNoZWQgYSB0ZXJtaW5hbCBzdGF0ZSB5ZXQuXG5cdCAqIFVubGlrZSB7QGxpbmsgaXNJblByb2dyZXNzfSwgdGhpcyByZW1haW5zIHRydWUgZHVyaW5nIHRvb2wgY29uZmlybWF0aW9ucyxcblx0ICogZWxpY2l0YXRpb25zLCBhbmQgYW55IG90aGVyIGludGVybWVkaWF0ZSBzdGF0ZS5cblx0ICovXG5cdHJlYWRvbmx5IGlzSW5jb21wbGV0ZTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IHNob3VsZEJlUmVtb3ZlZE9uU2VuZDogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzSGlkZGVuRnJvbVRyYW5zY3JpcHQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3VsZEJlQmxvY2tlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q6IGJvb2xlYW47XG5cdC8qKiBBIHN0YWxlIHJlc3BvbnNlIGlzIG9uZSB0aGF0IGhhcyBiZWVuIHBlcnNpc3RlZCBhbmQgcmVoeWRyYXRlZCwgc28gZS5nLiBDb21tYW5kcyB0aGF0IGhhdmUgdGhlaXIgYXJndW1lbnRzIHN0b3JlZCBpbiB0aGUgRUggYXJlIGdvbmUuICovXG5cdHJlYWRvbmx5IGlzU3RhbGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZvdGU6IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGZvbGxvd3Vwcz86IElDaGF0Rm9sbG93dXBbXSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcmVzdWx0PzogSUNoYXRBZ2VudFJlc3VsdDtcblx0cmVhZG9ubHkgdXNhZ2U/OiBJQ2hhdFVzYWdlO1xuXHRyZWFkb25seSB1c2FnZU9iczogSU9ic2VydmFibGU8SUNoYXRVc2FnZSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGNvbXBsZXRpb25Ub2tlbkNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbXBsZXRpb25Ub2tlbkNvdW50T2JzOiBJT2JzZXJ2YWJsZTxudW1iZXIgfCB1bmRlZmluZWQ+O1xuXHQvKiogRWxhcHNlZCBnZW5lcmF0aW9uIHRpbWUgaW4gbXMgKGV4Y2x1ZGluZyBjb25maXJtYXRpb24gd2FpdHMpLiBTZXQgb24gY29tcGxldGlvbiBhbmQgc2VyaWFsaXplZC4gKi9cblx0cmVhZG9ubHkgZWxhcHNlZE1zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvZGVCbG9ja0luZm9zOiBJQ29kZUJsb2NrSW5mb1tdIHwgdW5kZWZpbmVkO1xuXG5cdGluaXRpYWxpemVDb2RlQmxvY2tJbmZvcyhjb2RlQmxvY2tJbmZvOiBJQ29kZUJsb2NrSW5mb1tdKTogdm9pZDtcblx0YWRkVW5kb1N0b3AodW5kb1N0b3A6IElDaGF0VW5kb1N0b3ApOiB2b2lkO1xuXHRzZXRWb3RlKHZvdGU6IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24pOiB2b2lkO1xuXHRzZXRVc2FnZSh1c2FnZTogSUNoYXRVc2FnZSk6IHZvaWQ7XG5cdHNldEVsYXBzZWRNcyhlbGFwc2VkTXM6IG51bWJlcik6IHZvaWQ7XG5cdHNldEVkaXRBcHBsaWVkKGVkaXQ6IElDaGF0VGV4dEVkaXRHcm91cCwgZWRpdENvdW50OiBudW1iZXIpOiBib29sZWFuO1xuXHRyZXNvbHZlSW5saW5lUmVmZXJlbmNlKHJlc29sdmVJZDogc3RyaW5nLCByZXNvbHZlZFJlZmVyZW5jZTogSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlKTogYm9vbGVhbjtcblx0dXBkYXRlQ29udGVudChwcm9ncmVzczogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCB8IElDaGF0VGV4dEVkaXQgfCBJQ2hhdE5vdGVib29rRWRpdCB8IElDaGF0VGFzayB8IElDaGF0RXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZSwgcXVpZXQ/OiBib29sZWFuKTogdm9pZDtcblx0LyoqXG5cdCAqIEFkb3B0cyBhbnkgcGFydGlhbGx5LXVuZG8ge0BsaW5rIHJlc3BvbnNlfSBhcyB0aGUge0BsaW5rIGVudGlyZVJlc3BvbnNlfS5cblx0ICogT25seSB2YWxpZCB3aGVuIHtAbGluayBpc0NvbXBsZXRlfS4gVGhpcyBpcyBuZWVkZWQgYmVjYXVzZSBvdGhlcndpc2UgYW5cblx0ICogdW5kb25lIGFuZCB0aGVuIGRpdmVyZ2VkIHN0YXRlIHdvdWxkIHN0YXJ0IHNob3dpbmcgb2xkIGRhdGEgYmVjYXVzZSB0aGVcblx0ICogdW5kbyBzdG9wcyB3b3VsZCBubyBsb25nZXIgZXhpc3QgaW4gdGhlIG1vZGVsLlxuXHQgKi9cblx0ZmluYWxpemVVbmRvU3RhdGUoKTogdm9pZDtcbn1cblxuZXhwb3J0IHR5cGUgQ2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24gPVxuXHR8IHsgcmVhc29uOiAnb3RoZXInIH1cblx0fCB7IHJlYXNvbjogJ2NvbXBsZXRlZFJlcXVlc3QnIH1cblx0fCB7IHJlYXNvbjogJ3VuZG9TdG9wJzsgaWQ6IHN0cmluZyB9O1xuXG5leHBvcnQgY29uc3QgZGVmYXVsdENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uOiBDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbiA9IHsgcmVhc29uOiAnb3RoZXInIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0TW9kZUluZm8ge1xuXHRraW5kOiBDaGF0TW9kZUtpbmQgfCB1bmRlZmluZWQ7IC8vIGlzIHVuZGVmaW5lZCBpbiBjYXNlIG9mIHRlbGVtZXRyeU1vZGVJZCA9PT0gJ2FwcGx5Q29kZUJsb2NrJ1xuXHRpc0J1aWx0aW46IGJvb2xlYW47XG5cdG1vZGVJbnN0cnVjdGlvbnM6IElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHRlbGVtZXRyeU1vZGVJZDogJ2FzaycgfCAnYWdlbnQnIHwgJ2VkaXQnIHwgJ2N1c3RvbScgfCAnYXBwbHlDb2RlQmxvY2snIHwgdW5kZWZpbmVkO1xuXHR0ZWxlbWV0cnlNb2RlTmFtZT86IHN0cmluZztcblx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IEVkaXRTdWdnZXN0aW9uSWQgfCB1bmRlZmluZWQ7XG5cdHBlcm1pc3Npb25MZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB7XG5cdHJlYWRvbmx5IHVyaT86IFVSSTtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xSZWZlcmVuY2VzOiByZWFkb25seSBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeVtdO1xuXHRyZWFkb25seSBhbGxvd2VkU3ViYWdlbnRzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgYm9vbGVhbiB8IHN0cmluZyB8IG51bWJlcj47XG5cdHJlYWRvbmx5IGlzQnVpbHRpbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0TW9kZWxQYXJhbWV0ZXJzIHtcblx0c2Vzc2lvbjogQ2hhdE1vZGVsO1xuXHRtZXNzYWdlOiBJUGFyc2VkQ2hhdFJlcXVlc3Q7XG5cdHZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhO1xuXHR0aW1lc3RhbXA/OiBudW1iZXI7XG5cdGZhbGxiYWNrVGltZXN0YW1wPzogbnVtYmVyO1xuXHRhdHRlbXB0PzogbnVtYmVyO1xuXHRtb2RlSW5mbz86IElDaGF0UmVxdWVzdE1vZGVJbmZvO1xuXHRjb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdGxvY2F0aW9uRGF0YT86IElDaGF0TG9jYXRpb25EYXRhO1xuXHRhdHRhY2hlZENvbnRleHQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG5cdGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q/OiBib29sZWFuO1xuXHRtb2RlbElkPzogc3RyaW5nO1xuXHRyZXN0b3JlZElkPzogc3RyaW5nO1xuXHRlZGl0ZWRGaWxlRXZlbnRzPzogSUNoYXRBZ2VudEVkaXRlZEZpbGVFdmVudFtdO1xuXHR1c2VyU2VsZWN0ZWRUb29scz86IFVzZXJTZWxlY3RlZFRvb2xzO1xuXHRpc1N5c3RlbUluaXRpYXRlZD86IGJvb2xlYW47XG5cdGlzSGlkZGVuRnJvbVRyYW5zY3JpcHQ/OiBib29sZWFuO1xuXHRzeXN0ZW1Jbml0aWF0ZWRMYWJlbD86IHN0cmluZztcblx0dGVybWluYWxFeGVjdXRpb25JZD86IHN0cmluZztcblx0b3JpZ2luPzogSUNoYXRSZXF1ZXN0T3JpZ2luO1xuXHQvKiogV2hldGhlciB0aGlzIHJlcXVlc3QgcnVucyBhcyBhIHRlcm1pbmFsIGNvbW1hbmQgKGFnZW50IGhvc3QgYCFgIHByZWZpeCkuICovXG5cdGlzVGVybWluYWxDb21tYW5kPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXF1ZXN0TW9kZWwgaW1wbGVtZW50cyBJQ2hhdFJlcXVlc3RNb2RlbCB7XG5cdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nO1xuXHRwdWJsaWMgcmVzcG9uc2U6IENoYXRSZXNwb25zZU1vZGVsIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgc2hvdWxkQmVSZW1vdmVkT25TZW5kOiBJQ2hhdFJlcXVlc3REaXNhYmxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVxdWVzdFRpbWVzdGFtcDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgbWVzc2FnZTogSVBhcnNlZENoYXRSZXF1ZXN0O1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNDb21wbGV0ZUFkZGVkUmVxdWVzdDogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IG1vZGVsSWQ/OiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBtb2RlSW5mbz86IElDaGF0UmVxdWVzdE1vZGVJbmZvO1xuXHRwdWJsaWMgcmVhZG9ubHkgdXNlclNlbGVjdGVkVG9vbHM/OiBVc2VyU2VsZWN0ZWRUb29scztcblx0cHVibGljIHJlYWRvbmx5IGlzU3lzdGVtSW5pdGlhdGVkPzogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IGlzSGlkZGVuRnJvbVRyYW5zY3JpcHQ6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBzeXN0ZW1Jbml0aWF0ZWRMYWJlbD86IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHRlcm1pbmFsRXhlY3V0aW9uSWQ/OiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBpc1Rlcm1pbmFsQ29tbWFuZDogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IG9yaWdpbj86IElDaGF0UmVxdWVzdE9yaWdpbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRCZUJsb2NrZWQgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRwdWJsaWMgZ2V0IHNob3VsZEJlQmxvY2tlZCgpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3VsZEJlQmxvY2tlZDtcblx0fVxuXG5cdHB1YmxpYyBzZXRTaG91bGRCZUJsb2NrZWQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zaG91bGRCZUJsb2NrZWQuc2V0KHZhbHVlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Vzc2lvbjogQ2hhdE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRlbXB0OiBudW1iZXI7XG5cdHByaXZhdGUgX3ZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2F0aW9uRGF0YT86IElDaGF0TG9jYXRpb25EYXRhO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRhY2hlZENvbnRleHQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRlZEZpbGVFdmVudHM/OiBJQ2hhdEFnZW50RWRpdGVkRmlsZUV2ZW50W107XG5cblx0cHVibGljIGdldCBzZXNzaW9uKCk6IENoYXRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb247XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGF0dGVtcHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fYXR0ZW1wdDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdmFyaWFibGVEYXRhKCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhcmlhYmxlRGF0YTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgdmFyaWFibGVEYXRhKHY6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSkge1xuXHRcdHRoaXMuX3ZlcnNpb24rKztcblx0XHR0aGlzLl92YXJpYWJsZURhdGEgPSB2O1xuXHR9XG5cblx0cHVibGljIGdldCBjb25maXJtYXRpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlybWF0aW9uO1xuXHR9XG5cblx0cHVibGljIGdldCBsb2NhdGlvbkRhdGEoKTogSUNoYXRMb2NhdGlvbkRhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sb2NhdGlvbkRhdGE7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGF0dGFjaGVkQ29udGV4dCgpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hdHRhY2hlZENvbnRleHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGVkaXRlZEZpbGVFdmVudHMoKTogSUNoYXRBZ2VudEVkaXRlZEZpbGVFdmVudFtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdGVkRmlsZUV2ZW50cztcblx0fVxuXG5cdHByaXZhdGUgX3ZlcnNpb24gPSAwO1xuXHRwdWJsaWMgZ2V0IHZlcnNpb24oKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdmVyc2lvbjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHBhcmFtczogSUNoYXRSZXF1ZXN0TW9kZWxQYXJhbWV0ZXJzKSB7XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHBhcmFtcy5zZXNzaW9uO1xuXHRcdHRoaXMubWVzc2FnZSA9IHBhcmFtcy5tZXNzYWdlO1xuXHRcdHRoaXMuX3ZhcmlhYmxlRGF0YSA9IHBhcmFtcy52YXJpYWJsZURhdGE7XG5cdFx0dGhpcy5yZXF1ZXN0VGltZXN0YW1wID0gcGFyYW1zLnRpbWVzdGFtcDtcblx0XHR0aGlzLnRpbWVzdGFtcCA9IHBhcmFtcy50aW1lc3RhbXAgPz8gcGFyYW1zLmZhbGxiYWNrVGltZXN0YW1wID8/IERhdGUubm93KCk7XG5cdFx0dGhpcy5fYXR0ZW1wdCA9IHBhcmFtcy5hdHRlbXB0ID8/IDA7XG5cdFx0dGhpcy5tb2RlSW5mbyA9IHBhcmFtcy5tb2RlSW5mbztcblx0XHR0aGlzLl9jb25maXJtYXRpb24gPSBwYXJhbXMuY29uZmlybWF0aW9uO1xuXHRcdHRoaXMuX2xvY2F0aW9uRGF0YSA9IHBhcmFtcy5sb2NhdGlvbkRhdGE7XG5cdFx0dGhpcy5fYXR0YWNoZWRDb250ZXh0ID0gcGFyYW1zLmF0dGFjaGVkQ29udGV4dDtcblx0XHR0aGlzLmlzQ29tcGxldGVBZGRlZFJlcXVlc3QgPSBwYXJhbXMuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCA/PyBmYWxzZTtcblx0XHR0aGlzLm1vZGVsSWQgPSBwYXJhbXMubW9kZWxJZDtcblx0XHR0aGlzLmlkID0gcGFyYW1zLnJlc3RvcmVkSWQgPz8gJ3JlcXVlc3RfJyArIGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuX2VkaXRlZEZpbGVFdmVudHMgPSBwYXJhbXMuZWRpdGVkRmlsZUV2ZW50cztcblx0XHR0aGlzLnVzZXJTZWxlY3RlZFRvb2xzID0gcGFyYW1zLnVzZXJTZWxlY3RlZFRvb2xzO1xuXHRcdHRoaXMuaXNTeXN0ZW1Jbml0aWF0ZWQgPSBwYXJhbXMuaXNTeXN0ZW1Jbml0aWF0ZWQ7XG5cdFx0dGhpcy5pc0hpZGRlbkZyb21UcmFuc2NyaXB0ID0gcGFyYW1zLmlzSGlkZGVuRnJvbVRyYW5zY3JpcHQgPz8gZmFsc2U7XG5cdFx0dGhpcy5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCA9IHBhcmFtcy5zeXN0ZW1Jbml0aWF0ZWRMYWJlbDtcblx0XHR0aGlzLnRlcm1pbmFsRXhlY3V0aW9uSWQgPSBwYXJhbXMudGVybWluYWxFeGVjdXRpb25JZDtcblx0XHR0aGlzLmlzVGVybWluYWxDb21tYW5kID0gcGFyYW1zLmlzVGVybWluYWxDb21tYW5kID8/IGZhbHNlO1xuXHRcdHRoaXMub3JpZ2luID0gcGFyYW1zLm9yaWdpbjtcblx0fVxuXG5cdGFkb3B0VG8oc2Vzc2lvbjogQ2hhdE1vZGVsKSB7XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHNlc3Npb247XG5cdH1cbn1cblxuY2xhc3MgQWJzdHJhY3RSZXNwb25zZSBpbXBsZW1lbnRzIElSZXNwb25zZSB7XG5cdHByb3RlY3RlZCBfcmVzcG9uc2VQYXJ0czogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudFtdO1xuXG5cdC8qKlxuXHQgKiBBIHN0cmluZ2lmaWVkIHJlcHJlc2VudGF0aW9uIG9mIHJlc3BvbnNlIGRhdGEgd2hpY2ggbWlnaHQgYmUgcHJlc2VudGVkIHRvIGEgc2NyZWVucmVhZGVyIG9yIHVzZWQgd2hlbiBjb3B5aW5nIGEgcmVzcG9uc2UuXG5cdCAqIENvbXB1dGVkIGxhemlseSBvbiBkZW1hbmQgdG8gYXZvaWQgZXhwZW5zaXZlIHN0cmluZyByZWJ1aWxkaW5nIGR1cmluZyBzdHJlYW1pbmcuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNwb25zZVJlcHI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogSnVzdCB0aGUgbWFya2Rvd24gY29udGVudCBvZiB0aGUgcmVzcG9uc2UsIHVzZWQgZm9yIGRldGVybWluaW5nIHRoZSByZW5kZXJpbmcgcmF0ZSBvZiBtYXJrZG93bi5cblx0ICogQ29tcHV0ZWQgbGF6aWx5IG9uIGRlbWFuZCB0byBhdm9pZCBleHBlbnNpdmUgc3RyaW5nIHJlYnVpbGRpbmcgZHVyaW5nIHN0cmVhbWluZy5cblx0ICovXG5cdHByaXZhdGUgX21hcmtkb3duQ29udGVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGdldCB2YWx1ZSgpOiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50W10ge1xuXHRcdHJldHVybiB0aGlzLl9yZXNwb25zZVBhcnRzO1xuXHR9XG5cblx0Y29uc3RydWN0b3IodmFsdWU6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnRbXSkge1xuXHRcdHRoaXMuX3Jlc3BvbnNlUGFydHMgPSB2YWx1ZTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX3Jlc3BvbnNlUmVwciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9yZXNwb25zZVJlcHIgPSB0aGlzLmNvbXB1dGVSZXByKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNwb25zZVJlcHI7XG5cdH1cblxuXHQvKipcblx0ICogX0p1c3RfIHRoZSBjb250ZW50IG9mIG1hcmtkb3duIHBhcnRzIGluIHRoZSByZXNwb25zZVxuXHQgKi9cblx0Z2V0TWFya2Rvd24oKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fbWFya2Rvd25Db250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX21hcmtkb3duQ29udGVudCA9IHRoaXMuY29tcHV0ZU1hcmtkb3duQ29udGVudCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWFya2Rvd25Db250ZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSB0cmFpbGluZyBjb250aWd1b3VzIG1hcmtkb3duL2lubGluZS1yZWZlcmVuY2UgY29udGVudCBvZiB0aGUgcmVzcG9uc2UsXG5cdCAqIHNraXBwaW5nIGFueSB0cmFpbGluZyB0b29sIGNhbGxzIG9yIGVtcHR5IG1hcmtkb3duIHBhcnRzLlxuXHQgKi9cblx0Z2V0RmluYWxSZXNwb25zZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHBhcnRzID0gdGhpcy5fcmVzcG9uc2VQYXJ0cztcblx0XHQvLyBXYWxrIGJhY2t3YXJkcyB0byBmaW5kIHdoZXJlIHRoZSBsYXN0IGNvbnRpZ3VvdXMgbWFya2Rvd24gYmxvY2sgc3RhcnRzLlxuXHRcdC8vIFBoYXNlIDE6IHNraXAgdHJhaWxpbmcgbm9uLW1hcmtkb3duIHBhcnRzIGFuZCBlbXB0eSBtYXJrZG93bi5cblx0XHRsZXQgaSA9IHBhcnRzLmxlbmd0aCAtIDE7XG5cdFx0d2hpbGUgKGkgPj0gMCkge1xuXHRcdFx0Y29uc3QgcGFydCA9IHBhcnRzW2ldO1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgfHwgcGFydC5raW5kID09PSAnbWFya2Rvd25WdWxuJykge1xuXHRcdFx0XHRpZiAocGFydC5jb250ZW50LnZhbHVlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdpbmxpbmVSZWZlcmVuY2UnKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aS0tO1xuXHRcdH1cblxuXHRcdGlmIChpIDwgMCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdC8vIFBoYXNlIDI6IGNvbGxlY3QgY29udGlndW91cyBtYXJrZG93bi9pbmxpbmUtcmVmZXJlbmNlIHBhcnRzIGdvaW5nIGJhY2t3YXJkcy5cblx0XHRjb25zdCBlbmQgPSBpO1xuXHRcdHdoaWxlIChpID49IDApIHtcblx0XHRcdGNvbnN0IHBhcnQgPSBwYXJ0c1tpXTtcblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnIHx8IHBhcnQua2luZCA9PT0gJ21hcmtkb3duVnVsbicgfHwgcGFydC5raW5kID09PSAnaW5saW5lUmVmZXJlbmNlJykge1xuXHRcdFx0XHRpLS07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc3RhcnQgPSBpICsgMTtcblxuXHRcdC8vIENvbWJpbmUgdGhlIGNvbGxlY3RlZCBwYXJ0cy5cblx0XHRjb25zdCBzZWdtZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBqID0gc3RhcnQ7IGogPD0gZW5kOyBqKyspIHtcblx0XHRcdGNvbnN0IHBhcnQgPSBwYXJ0c1tqXTtcblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdpbmxpbmVSZWZlcmVuY2UnKSB7XG5cdFx0XHRcdHNlZ21lbnRzLnB1c2godGhpcy5pbmxpbmVSZWZUb1JlcHIocGFydCkpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnIHx8IHBhcnQua2luZCA9PT0gJ21hcmtkb3duVnVsbicpIHtcblx0XHRcdFx0aWYgKHBhcnQuY29udGVudC52YWx1ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0c2VnbWVudHMucHVzaChwYXJ0LmNvbnRlbnQudmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzZWdtZW50cy5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnZhbGlkYXRlIGNhY2hlZCByZXByZXNlbnRhdGlvbnMgc28gdGhleSBhcmUgcmVjb21wdXRlZCBvbiBuZXh0IGFjY2Vzcy5cblx0ICovXG5cdHByb3RlY3RlZCBfaW52YWxpZGF0ZVJlcHIoKSB7XG5cdFx0dGhpcy5fcmVzcG9uc2VSZXByID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX21hcmtkb3duQ29udGVudCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZU1hcmtkb3duQ29udGVudCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHNlZ21lbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLl9yZXNwb25zZVBhcnRzKSB7XG5cdFx0XHRpZiAocGFydC5raW5kID09PSAnaW5saW5lUmVmZXJlbmNlJykge1xuXHRcdFx0XHRzZWdtZW50cy5wdXNoKHRoaXMuaW5saW5lUmVmVG9SZXByKHBhcnQpKTtcblx0XHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAnbWFya2Rvd25Db250ZW50JyB8fCBwYXJ0LmtpbmQgPT09ICdtYXJrZG93blZ1bG4nKSB7XG5cdFx0XHRcdGlmIChwYXJ0LmNvbnRlbnQudmFsdWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHNlZ21lbnRzLnB1c2gocGFydC5jb250ZW50LnZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2VnbWVudHMuam9pbignJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY29tcHV0ZVJlcHIoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5wYXJ0c1RvUmVwcih0aGlzLl9yZXNwb25zZVBhcnRzKTtcblx0fVxuXG5cdHByaXZhdGUgcGFydHNUb1JlcHIocGFydHM6IHJlYWRvbmx5IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnRbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgYmxvY2tzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBjdXJyZW50QmxvY2tTZWdtZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgaGFzRWRpdEdyb3Vwc0FmdGVyTGFzdENsZWFyID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHtcblx0XHRcdGxldCBzZWdtZW50OiB7IHRleHQ6IHN0cmluZzsgaXNCbG9jaz86IGJvb2xlYW4gfSB8IHVuZGVmaW5lZDtcblx0XHRcdHN3aXRjaCAocGFydC5raW5kKSB7XG5cdFx0XHRcdGNhc2UgJ2NsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uJzpcblx0XHRcdFx0XHRjdXJyZW50QmxvY2tTZWdtZW50cyA9IFtdO1xuXHRcdFx0XHRcdGJsb2Nrcy5sZW5ndGggPSAwO1xuXHRcdFx0XHRcdGhhc0VkaXRHcm91cHNBZnRlckxhc3RDbGVhciA9IGZhbHNlOyAvLyBSZXNldCBlZGl0IGdyb3VwcyBmbGFnIHdoZW4gY2xlYXJpbmdcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0Y2FzZSAndHJlZURhdGEnOlxuXHRcdFx0XHRjYXNlICdwcm9ncmVzc01lc3NhZ2UnOlxuXHRcdFx0XHRjYXNlICdjb2RlYmxvY2tVcmknOlxuXHRcdFx0XHRjYXNlICdleHRlbnNpb25zJzpcblx0XHRcdFx0Y2FzZSAncHVsbFJlcXVlc3QnOlxuXHRcdFx0XHRjYXNlICd1bmRvU3RvcCc6XG5cdFx0XHRcdGNhc2UgJ3dvcmtzcGFjZUVkaXQnOlxuXHRcdFx0XHRjYXNlICdleHRlcm5hbEVkaXQnOlxuXHRcdFx0XHRjYXNlICdlbGljaXRhdGlvbjInOlxuXHRcdFx0XHRjYXNlICdlbGljaXRhdGlvblNlcmlhbGl6ZWQnOlxuXHRcdFx0XHRjYXNlICd0aGlua2luZyc6XG5cdFx0XHRcdGNhc2UgJ2hvb2snOlxuXHRcdFx0XHRjYXNlICd2b2ljZVByb2dyZXNzJzpcblx0XHRcdFx0Y2FzZSAnbXVsdGlEaWZmRGF0YSc6XG5cdFx0XHRcdGNhc2UgJ21jcFNlcnZlcnNTdGFydGluZyc6XG5cdFx0XHRcdGNhc2UgJ21jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQnOlxuXHRcdFx0XHRjYXNlICdtY3BTZXJ2ZXJzU3RhcnRpbmdTbG93Jzpcblx0XHRcdFx0Y2FzZSAncXVlc3Rpb25DYXJvdXNlbCc6XG5cdFx0XHRcdGNhc2UgJ3BsYW5SZXZpZXcnOlxuXHRcdFx0XHRjYXNlICdkaXNhYmxlZENsYXVkZUhvb2tzJzpcblx0XHRcdFx0Y2FzZSAnYXV0b01vZGVSZXNvbHV0aW9uJzpcblx0XHRcdFx0XHQvLyBJZ25vcmVcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0Y2FzZSAnc3lzdGVtTm90aWZpY2F0aW9uJzpcblx0XHRcdFx0XHRzZWdtZW50ID0geyB0ZXh0OiBwYXJ0LmNvbnRlbnQudmFsdWUsIGlzQmxvY2s6IHRydWUgfTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAndG9vbEludm9jYXRpb24nOlxuXHRcdFx0XHRjYXNlICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnOlxuXHRcdFx0XHRcdC8vIEluY2x1ZGUgdG9vbCBpbnZvY2F0aW9ucyBpbiB0aGUgY29weSB0ZXh0XG5cdFx0XHRcdFx0c2VnbWVudCA9IHRoaXMuZ2V0VG9vbEludm9jYXRpb25UZXh0KHBhcnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdpbmxpbmVSZWZlcmVuY2UnOlxuXHRcdFx0XHRcdHNlZ21lbnQgPSB7IHRleHQ6IHRoaXMuaW5saW5lUmVmVG9SZXByKHBhcnQpIH07XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2NvbW1hbmQnOlxuXHRcdFx0XHRcdHNlZ21lbnQgPSB7IHRleHQ6IHBhcnQuY29tbWFuZC50aXRsZSwgaXNCbG9jazogdHJ1ZSB9O1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICd0ZXh0RWRpdEdyb3VwJzpcblx0XHRcdFx0Y2FzZSAnbm90ZWJvb2tFZGl0R3JvdXAnOlxuXHRcdFx0XHRcdC8vIE1hcmsgdGhhdCB3ZSBoYXZlIGVkaXQgZ3JvdXBzIGFmdGVyIHRoZSBsYXN0IGNsZWFyXG5cdFx0XHRcdFx0aGFzRWRpdEdyb3Vwc0FmdGVyTGFzdENsZWFyID0gdHJ1ZTtcblx0XHRcdFx0XHQvLyBTa2lwIGluZGl2aWR1YWwgZWRpdCBncm91cHMgdG8gYXZvaWQgZHVwbGljYXRpb25cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0Y2FzZSAnY29uZmlybWF0aW9uJzpcblx0XHRcdFx0XHRpZiAocGFydC5tZXNzYWdlIGluc3RhbmNlb2YgTWFya2Rvd25TdHJpbmcpIHtcblx0XHRcdFx0XHRcdHNlZ21lbnQgPSB7IHRleHQ6IGAke3BhcnQudGl0bGV9XFxuJHtwYXJ0Lm1lc3NhZ2UudmFsdWV9YCwgaXNCbG9jazogdHJ1ZSB9O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNlZ21lbnQgPSB7IHRleHQ6IGAke3BhcnQudGl0bGV9XFxuJHtwYXJ0Lm1lc3NhZ2V9YCwgaXNCbG9jazogdHJ1ZSB9O1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdtYXJrZG93bkNvbnRlbnQnOlxuXHRcdFx0XHRjYXNlICdtYXJrZG93blZ1bG4nOlxuXHRcdFx0XHRjYXNlICdwcm9ncmVzc1Rhc2snOlxuXHRcdFx0XHRjYXNlICdwcm9ncmVzc1Rhc2tTZXJpYWxpemVkJzpcblx0XHRcdFx0Y2FzZSAnd2FybmluZyc6XG5cdFx0XHRcdGNhc2UgJ2luZm8nOlxuXHRcdFx0XHRcdHNlZ21lbnQgPSB7IHRleHQ6IHBhcnQuY29udGVudC52YWx1ZSB9O1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdC8vIElnbm9yZSBhbnkgdW5rbm93bi9vYnNvbGV0ZSBwYXJ0cywgYnV0IGFzc2VydCB0aGF0IGFsbCBhcmUgaGFuZGxlZDpcblx0XHRcdFx0XHRzb2Z0QXNzZXJ0TmV2ZXIocGFydCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZWdtZW50LmlzQmxvY2spIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRCbG9ja1NlZ21lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGJsb2Nrcy5wdXNoKGN1cnJlbnRCbG9ja1NlZ21lbnRzLmpvaW4oJycpKTtcblx0XHRcdFx0XHRjdXJyZW50QmxvY2tTZWdtZW50cyA9IFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJsb2Nrcy5wdXNoKHNlZ21lbnQudGV4dCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjdXJyZW50QmxvY2tTZWdtZW50cy5wdXNoKHNlZ21lbnQudGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGN1cnJlbnRCbG9ja1NlZ21lbnRzLmxlbmd0aCkge1xuXHRcdFx0YmxvY2tzLnB1c2goY3VycmVudEJsb2NrU2VnbWVudHMuam9pbignJykpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCBjb25zb2xpZGF0ZWQgZWRpdCBzdW1tYXJ5IGF0IHRoZSBlbmQgaWYgdGhlcmUgd2VyZSBhbnkgZWRpdCBncm91cHMgYWZ0ZXIgdGhlIGxhc3QgY2xlYXJcblx0XHRpZiAoaGFzRWRpdEdyb3Vwc0FmdGVyTGFzdENsZWFyKSB7XG5cdFx0XHRibG9ja3MucHVzaChsb2NhbGl6ZSgnZWRpdHNTdW1tYXJ5JywgXCJNYWRlIGNoYW5nZXMuXCIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYmxvY2tzLmpvaW4oJ1xcblxcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbmxpbmVSZWZUb1JlcHIocGFydDogSUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlKSB7XG5cdFx0aWYgKCd1cmknIGluIHBhcnQuaW5saW5lUmVmZXJlbmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy51cmlUb1JlcHIocGFydC5pbmxpbmVSZWZlcmVuY2UudXJpLCBwYXJ0LmlubGluZVJlZmVyZW5jZS5yYW5nZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICduYW1lJyBpbiBwYXJ0LmlubGluZVJlZmVyZW5jZVxuXHRcdFx0PyBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKHBhcnQuaW5saW5lUmVmZXJlbmNlLm5hbWUpXG5cdFx0XHQ6IHRoaXMudXJpVG9SZXByKHBhcnQuaW5saW5lUmVmZXJlbmNlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VG9vbEludm9jYXRpb25UZXh0KHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiB7IHRleHQ6IHN0cmluZzsgaXNCbG9jaz86IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3QgZ2V0VGVybWluYWxEaXNwbGF5SW5wdXQgPSAodGVybWluYWxEYXRhOiBSZXR1cm5UeXBlPHR5cGVvZiBtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhPikgPT4gdGVybWluYWxEYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcz8uY29tbWFuZExpbmVcblx0XHRcdD8/IHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5mb3JEaXNwbGF5XG5cdFx0XHQ/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudXNlckVkaXRlZFxuXHRcdFx0Pz8gdGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWRcblx0XHRcdD8/IHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbDtcblxuXHRcdC8vIEV4dHJhY3QgdGhlIG1lc3NhZ2UgYW5kIGlucHV0IGRldGFpbHNcblx0XHRsZXQgbWVzc2FnZSA9ICcnO1xuXHRcdGxldCBpbnB1dCA9ICcnO1xuXG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UpIHtcblx0XHRcdG1lc3NhZ2UgPSB0eXBlb2YgdG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0PyB0b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlXG5cdFx0XHRcdDogdG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZS52YWx1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZSA9IHR5cGVvZiB0b29sSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0PyB0b29sSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZVxuXHRcdFx0XHQ6IHRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLnZhbHVlO1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBkaWZmZXJlbnQgdHlwZXMgb2YgdG9vbCBpbnZvY2F0aW9uc1xuXHRcdGlmICh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhKSB7XG5cdFx0XHRpZiAodG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5raW5kID09PSAndGVybWluYWwnKSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSAnUmFuIHRlcm1pbmFsIGNvbW1hbmQnO1xuXHRcdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSBtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdFx0XHRpbnB1dCA9IGdldFRlcm1pbmFsRGlzcGxheUlucHV0KHRlcm1pbmFsRGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRm9ybWF0IHRoZSB0b29sIGludm9jYXRpb24gdGV4dFxuXHRcdGxldCB0ZXh0ID0gbWVzc2FnZTtcblx0XHRpZiAoaW5wdXQpIHtcblx0XHRcdHRleHQgKz0gYDogJHtpbnB1dH1gO1xuXHRcdH1cblxuXHRcdC8vIEZvciBjb21wbGV0ZWQgdG9vbCBpbnZvY2F0aW9ucywgYWxzbyBpbmNsdWRlIHRoZSByZXN1bHQgZGV0YWlscyBpZiBhdmFpbGFibGVcblx0XHRpZiAodG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcgfHwgKHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHRvb2xJbnZvY2F0aW9uKSkpIHtcblx0XHRcdGNvbnN0IHJlc3VsdERldGFpbHMgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLnJlc3VsdERldGFpbHModG9vbEludm9jYXRpb24pO1xuXHRcdFx0aWYgKHJlc3VsdERldGFpbHMgJiYgJ2lucHV0JyBpbiByZXN1bHREZXRhaWxzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdFByZWZpeCA9IHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnIHx8IElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbikgPyAnQ29tcGxldGVkJyA6ICdFcnJvcmVkJztcblx0XHRcdFx0Y29uc3QgcmVzdWx0SW5wdXQgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnXG5cdFx0XHRcdFx0PyBnZXRUZXJtaW5hbERpc3BsYXlJbnB1dChtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhKHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpKVxuXHRcdFx0XHRcdDogcmVzdWx0RGV0YWlscy5pbnB1dDtcblx0XHRcdFx0dGV4dCArPSBgXFxuJHtyZXN1bHRQcmVmaXh9IHdpdGggaW5wdXQ6ICR7cmVzdWx0SW5wdXR9YDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyB0ZXh0LCBpc0Jsb2NrOiB0cnVlIH07XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyBhIHJlZmVyZW5jZSB0aGUgd2F5IHRoZSByZXNwb25zZSBzaG93ZWQgaXQgXHUyMDE0IHRoZSBmaWxlIG5hbWUgcGx1cyBhbnkgbGluZSBzdWZmaXggXHUyMDE0XG5cdCAqIGFzIGNvZGUsIHNvIGEgbmFtZSBjb250YWluaW5nIGAqYCBvciBgX2Agc3Vydml2ZXMgYmVpbmcgcGFzdGVkIGludG8gYW5vdGhlciBkb2N1bWVudC5cblx0ICovXG5cdHByaXZhdGUgdXJpVG9SZXByKHVyaTogVVJJLCByYW5nZT86IElSYW5nZSk6IHN0cmluZyB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgPT09IFNjaGVtYXMuaHR0cCB8fCB1cmkuc2NoZW1lID09PSBTY2hlbWFzLmh0dHBzKSB7XG5cdFx0XHRyZXR1cm4gdXJpLnRvU3RyaW5nKGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdWZmaXggPSAhcmFuZ2UgPyAnJ1xuXHRcdFx0OiByYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIgPyBgOiR7cmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfWBcblx0XHRcdFx0OiBgOiR7cmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfS0ke3JhbmdlLmVuZExpbmVOdW1iZXJ9YDtcblx0XHRyZXR1cm4gYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZShiYXNlbmFtZSh1cmkpICsgc3VmZml4KTtcblx0fVxufVxuXG4vKiogQSB2aWV3IG9mIGEgc3Vic2V0IG9mIGEgcmVzcG9uc2UgKi9cbmNsYXNzIFJlc3BvbnNlVmlldyBleHRlbmRzIEFic3RyYWN0UmVzcG9uc2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRfcmVzcG9uc2U6IElSZXNwb25zZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdW5kb1N0b3A6IHN0cmluZyxcblx0KSB7XG5cdFx0bGV0IGlkeCA9IF9yZXNwb25zZS52YWx1ZS5maW5kSW5kZXgodiA9PiB2LmtpbmQgPT09ICd1bmRvU3RvcCcgJiYgdi5pZCA9PT0gdW5kb1N0b3ApO1xuXHRcdC8vIFVuZG8gc3RvcHMgYXJlIGluc2VydGVkIGJlZm9yZSBgY29kZWJsb2NrVXJpYCdzLCB3aGljaCBhcmUgcHJlY2VlZGVkIGJ5IGFcblx0XHQvLyBtYXJrZG93bkNvbnRlbnQgY29udGFpbmluZyB0aGUgb3BlbmluZyBjb2RlIGZlbmNlLiBBZGp1c3QgdGhlIGluZGV4XG5cdFx0Ly8gYmFja3dhcmRzIHRvIGF2b2lkIGEgYnVnZ3kgcmVzcG9uc2UgaWYgaXQgbG9va2VkIGxpa2UgdGhpcyBoYXBwZW5lZC5cblx0XHRpZiAoX3Jlc3BvbnNlLnZhbHVlW2lkeCArIDFdPy5raW5kID09PSAnY29kZWJsb2NrVXJpJyAmJiBfcmVzcG9uc2UudmFsdWVbaWR4IC0gMV0/LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRpZHgtLTtcblx0XHR9XG5cblx0XHRzdXBlcihpZHggPT09IC0xID8gX3Jlc3BvbnNlLnZhbHVlLnNsaWNlKCkgOiBfcmVzcG9uc2UudmFsdWUuc2xpY2UoMCwgaWR4KSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlc3BvbnNlIGV4dGVuZHMgQWJzdHJhY3RSZXNwb25zZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVmFsdWUgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHByaXZhdGUgX2FjdGl2ZVJlYXNvbmluZzogeyBwYXJ0OiBJQ2hhdFRoaW5raW5nUGFydDsgc3RhcnRlZEF0OiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCBvbkRpZENoYW5nZVZhbHVlKCkge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZENoYW5nZVZhbHVlLmV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfY2l0YXRpb25zOiBJQ2hhdENvZGVDaXRhdGlvbltdID0gW107XG5cblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogSU1hcmtkb3duU3RyaW5nIHwgUmVhZG9ubHlBcnJheTxTZXJpYWxpemVkQ2hhdFJlc3BvbnNlUGFydD4pIHtcblx0XHRzdXBlcihhc0FycmF5KHZhbHVlKS5tYXAoKHYpID0+IChcblx0XHRcdCdraW5kJyBpbiB2ID8gdiA6XG5cdFx0XHRcdGlzTWFya2Rvd25TdHJpbmcodikgPyB7IGNvbnRlbnQ6IHYsIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0gc2F0aXNmaWVzIElDaGF0TWFya2Rvd25Db250ZW50IDpcblx0XHRcdFx0XHR7IGtpbmQ6ICd0cmVlRGF0YScsIHRyZWVEYXRhOiB2IH1cblx0XHQpKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0fVxuXG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5maW5hbGl6ZVJlYXNvbmluZ0R1cmF0aW9uKCk7XG5cdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cyA9IFtdO1xuXHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKHRydWUpO1xuXHR9XG5cblx0Y2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb24obWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZmluYWxpemVSZWFzb25pbmdEdXJhdGlvbigpO1xuXHRcdC8vIGxvb2sgdGhyb3VnaCB0aGUgcmVzcG9uc2UgcGFydHMgYW5kIGZpbmQgdGhlIGxhc3QgdG9vbCBpbnZvY2F0aW9uLCB0aGVuIHNsaWNlIHRoZSByZXNwb25zZSBwYXJ0cyB0byB0aGF0IHBvaW50XG5cdFx0bGV0IGxhc3RUb29sSW52b2NhdGlvbkluZGV4ID0gLTE7XG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX3Jlc3BvbnNlUGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLl9yZXNwb25zZVBhcnRzW2ldO1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSB7XG5cdFx0XHRcdGxhc3RUb29sSW52b2NhdGlvbkluZGV4ID0gaTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChsYXN0VG9vbEludm9jYXRpb25JbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuX3Jlc3BvbnNlUGFydHMgPSB0aGlzLl9yZXNwb25zZVBhcnRzLnNsaWNlKDAsIGxhc3RUb29sSW52b2NhdGlvbkluZGV4ICsgMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Jlc3BvbnNlUGFydHMgPSBbXTtcblx0XHR9XG5cdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdHRoaXMuX3Jlc3BvbnNlUGFydHMucHVzaCh7IGtpbmQ6ICd3YXJuaW5nJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKG1lc3NhZ2UpIH0pO1xuXHRcdH1cblx0XHR0aGlzLl9jb250ZW50Q2hhbmdlZCh0cnVlKTtcblx0fVxuXG5cdHVwZGF0ZUNvbnRlbnQocHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQgfCBJQ2hhdFRleHRFZGl0IHwgSUNoYXROb3RlYm9va0VkaXQgfCBJQ2hhdFRhc2sgfCBJQ2hhdEV4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUsIHF1aWV0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChwcm9ncmVzcy5raW5kICE9PSAndGhpbmtpbmcnKSB7XG5cdFx0XHR0aGlzLmZpbmFsaXplUmVhc29uaW5nRHVyYXRpb24oKTtcblx0XHR9XG5cblx0XHRpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ2NsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0aWYgKHByb2dyZXNzLnJlYXNvbiA9PT0gQ2hhdFJlc3BvbnNlQ2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb25SZWFzb24uQ29weXJpZ2h0Q29udGVudFJldHJ5KSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb24obG9jYWxpemUoJ2NvcHlyaWdodENvbnRlbnRSZXRyeScsIFwiUmVzcG9uc2UgY2xlYXJlZCBkdWUgdG8gcG9zc2libGUgbWF0Y2ggdG8gcHVibGljIGNvZGUsIHJldHJ5aW5nIHdpdGggbW9kaWZpZWQgcHJvbXB0LlwiKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLnJlYXNvbiA9PT0gQ2hhdFJlc3BvbnNlQ2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb25SZWFzb24uRmlsdGVyZWRDb250ZW50UmV0cnkpIHtcblx0XHRcdFx0dGhpcy5jbGVhclRvUHJldmlvdXNUb29sSW52b2NhdGlvbihsb2NhbGl6ZSgnZmlsdGVyZWRDb250ZW50UmV0cnknLCBcIlJlc3BvbnNlIGNsZWFyZWQgZHVlIHRvIGNvbnRlbnQgc2FmZXR5IGZpbHRlcnMsIHJldHJ5aW5nIHdpdGggbW9kaWZpZWQgcHJvbXB0LlwiKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXG5cdFx0XHQvLyBOZXN0ZWQgc3ViYWdlbnQgcGFydHMgcmVuZGVyIGluc2lkZSB0aGVpciBwYXJlbnQgY2FyZCBhbmQgbXVzdCBub3Qgc3BsaXQgcGFyZW50IG1hcmtkb3duLlxuXHRcdFx0Y29uc3QgbGFzdFJlc3BvbnNlUGFydCA9IHRoaXMuX3Jlc3BvbnNlUGFydHNcblx0XHRcdFx0LmZpbHRlcihwID0+IHAua2luZCAhPT0gJ3RleHRFZGl0R3JvdXAnICYmICFpc05lc3RlZFN1YmFnZW50UmVzcG9uc2VQYXJ0KHApKVxuXHRcdFx0XHQuYXQoLTEpO1xuXG5cdFx0XHRpZiAoIWxhc3RSZXNwb25zZVBhcnQgfHwgbGFzdFJlc3BvbnNlUGFydC5raW5kICE9PSAnbWFya2Rvd25Db250ZW50JyB8fCAhY2FuTWVyZ2VNYXJrZG93blN0cmluZ3MobGFzdFJlc3BvbnNlUGFydC5jb250ZW50LCBwcm9ncmVzcy5jb250ZW50KSkge1xuXHRcdFx0XHQvLyBUaGUgbGFzdCBwYXJ0IGNhbid0IGJlIG1lcmdlZCB3aXRoLSBub3QgbWFya2Rvd24sIG9yIG1hcmtkb3duIHdpdGggZGlmZmVyZW50IHBlcm1pc3Npb25zXG5cdFx0XHRcdHRoaXMuX3Jlc3BvbnNlUGFydHMucHVzaChwcm9ncmVzcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBEb24ndCBtb2RpZnkgdGhlIGN1cnJlbnQgb2JqZWN0LCBzaW5jZSBpdCdzIGJlaW5nIGRpZmZlZCBieSB0aGUgcmVuZGVyZXJcblx0XHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fcmVzcG9uc2VQYXJ0cy5pbmRleE9mKGxhc3RSZXNwb25zZVBhcnQpO1xuXHRcdFx0XHR0aGlzLl9yZXNwb25zZVBhcnRzW2lkeF0gPSB7IC4uLmxhc3RSZXNwb25zZVBhcnQsIGNvbnRlbnQ6IGFwcGVuZE1hcmtkb3duU3RyaW5nKGxhc3RSZXNwb25zZVBhcnQuY29udGVudCwgcHJvZ3Jlc3MuY29udGVudCkgfTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKHF1aWV0KTtcblx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLmtpbmQgPT09ICdzeXN0ZW1Ob3RpZmljYXRpb24nKSB7XG5cdFx0XHRjb25zdCBsYXN0UmVzcG9uc2VQYXJ0ID0gdGhpcy5fcmVzcG9uc2VQYXJ0cy5hdCgtMSk7XG5cdFx0XHRpZiAobGFzdFJlc3BvbnNlUGFydD8ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzU3RyZWFtaW5nKGxhc3RSZXNwb25zZVBhcnQpICYmICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzRWZmZWN0aXZlbHlIaWRkZW4obGFzdFJlc3BvbnNlUGFydCkpIHtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cy5zcGxpY2UodGhpcy5fcmVzcG9uc2VQYXJ0cy5sZW5ndGggLSAxLCAwLCBwcm9ncmVzcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2gocHJvZ3Jlc3MpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQocXVpZXQpO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ3RoaW5raW5nJykge1xuXG5cdFx0XHQvLyB0cmllcyB0byBzcGxpdCB0aGlua2luZyBjaHVua3MgaWYgaXQgaXMgYW4gYXJyYXkuIG9ubHkgd2hpbGUgY2VydGFpbiBtb2RlbHMgZ2l2ZSB1cyBhcnJheSBjaHVua3MuXG5cdFx0XHRjb25zdCBsYXN0UmVzcG9uc2VQYXJ0ID0gdGhpcy5fcmVzcG9uc2VQYXJ0c1xuXHRcdFx0XHQuZmlsdGVyKHAgPT4gcC5raW5kICE9PSAndGV4dEVkaXRHcm91cCcpXG5cdFx0XHRcdC5hdCgtMSk7XG5cblx0XHRcdGNvbnN0IGxhc3RUZXh0ID0gbGFzdFJlc3BvbnNlUGFydCAmJiBsYXN0UmVzcG9uc2VQYXJ0LmtpbmQgPT09ICd0aGlua2luZydcblx0XHRcdFx0PyAoQXJyYXkuaXNBcnJheShsYXN0UmVzcG9uc2VQYXJ0LnZhbHVlKSA/IGxhc3RSZXNwb25zZVBhcnQudmFsdWUuam9pbignJykgOiAobGFzdFJlc3BvbnNlUGFydC52YWx1ZSB8fCAnJykpXG5cdFx0XHRcdDogJyc7XG5cdFx0XHRjb25zdCBjdXJyVGV4dCA9IEFycmF5LmlzQXJyYXkocHJvZ3Jlc3MudmFsdWUpID8gcHJvZ3Jlc3MudmFsdWUuam9pbignJykgOiAocHJvZ3Jlc3MudmFsdWUgfHwgJycpO1xuXHRcdFx0Y29uc3QgaXNFbXB0eSA9IChzOiBzdHJpbmcpID0+IHMubGVuZ3RoID09PSAwO1xuXHRcdFx0aWYgKGlzRW1wdHkoY3VyclRleHQpKSB7XG5cdFx0XHRcdHRoaXMuZmluYWxpemVSZWFzb25pbmdEdXJhdGlvbigpO1xuXHRcdFx0fSBlbHNlIGlmICghdGhpcy5fYWN0aXZlUmVhc29uaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVJlYXNvbmluZyA9IHsgcGFydDogcHJvZ3Jlc3MsIHN0YXJ0ZWRBdDogRGF0ZS5ub3coKSB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEbyBub3QgbWVyZ2UgaWYgZWl0aGVyIHRoZSBjdXJyZW50IG9yIGxhc3QgdGhpbmtpbmcgY2h1bmsgaXMgZW1wdHk7IGVtcHR5IGNodW5rcyBzZXBhcmF0ZSB0aGlua2luZ1xuXHRcdFx0aWYgKCFsYXN0UmVzcG9uc2VQYXJ0XG5cdFx0XHRcdHx8IGxhc3RSZXNwb25zZVBhcnQua2luZCAhPT0gJ3RoaW5raW5nJ1xuXHRcdFx0XHR8fCBpc0VtcHR5KGN1cnJUZXh0KVxuXHRcdFx0XHR8fCBpc0VtcHR5KGxhc3RUZXh0KVxuXHRcdFx0XHR8fCAhY2FuTWVyZ2VNYXJrZG93blN0cmluZ3MobmV3IE1hcmtkb3duU3RyaW5nKGxhc3RUZXh0KSwgbmV3IE1hcmtkb3duU3RyaW5nKGN1cnJUZXh0KSkpIHtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cy5wdXNoKHByb2dyZXNzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IHRoaXMuX3Jlc3BvbnNlUGFydHMuaW5kZXhPZihsYXN0UmVzcG9uc2VQYXJ0KTtcblx0XHRcdFx0Y29uc3QgbWVyZ2VkUGFydDogSUNoYXRUaGlua2luZ1BhcnQgPSB7XG5cdFx0XHRcdFx0Li4ubGFzdFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XHR2YWx1ZTogYXBwZW5kTWFya2Rvd25TdHJpbmcobmV3IE1hcmtkb3duU3RyaW5nKGxhc3RUZXh0KSwgbmV3IE1hcmtkb3duU3RyaW5nKGN1cnJUZXh0KSkudmFsdWVcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0c1tpZHhdID0gbWVyZ2VkUGFydDtcblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVJlYXNvbmluZz8ucGFydCA9PT0gbGFzdFJlc3BvbnNlUGFydCkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVJlYXNvbmluZy5wYXJ0ID0gbWVyZ2VkUGFydDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQocXVpZXQpO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ3RleHRFZGl0JyB8fCBwcm9ncmVzcy5raW5kID09PSAnbm90ZWJvb2tFZGl0Jykge1xuXHRcdFx0Ly8gbWVyZ2UgZWRpdHMgZm9yIHRoZSBzYW1lIGZpbGUgbm8gbWF0dGVyIHdoZW4gdGhleSBjb21lIGluXG5cdFx0XHRjb25zdCBub3RlYm9va1VyaSA9IENlbGxVcmkucGFyc2UocHJvZ3Jlc3MudXJpKT8ubm90ZWJvb2s7XG5cdFx0XHRjb25zdCB1cmkgPSBub3RlYm9va1VyaSA/PyBwcm9ncmVzcy51cmk7XG5cdFx0XHRjb25zdCBpc0V4dGVybmFsRWRpdCA9IHByb2dyZXNzLmlzRXh0ZXJuYWxFZGl0O1xuXG5cdFx0XHRpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ3RleHRFZGl0JyAmJiAhbm90ZWJvb2tVcmkpIHtcblx0XHRcdFx0Ly8gVGV4dCBlZGl0cyB0byBhIHJlZ3VsYXIgKG5vbi1ub3RlYm9vaykgZmlsZVxuXHRcdFx0XHR0aGlzLl9tZXJnZU9yUHVzaFRleHRFZGl0R3JvdXAodXJpLCBwcm9ncmVzcy5lZGl0cywgcHJvZ3Jlc3MuZG9uZSwgaXNFeHRlcm5hbEVkaXQpO1xuXHRcdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAndGV4dEVkaXQnKSB7XG5cdFx0XHRcdC8vIFRleHQgZWRpdHMgdG8gYSBub3RlYm9vayBjZWxsIC0gY29udmVydCB0byBJQ2VsbFRleHRFZGl0T3BlcmF0aW9uXG5cdFx0XHRcdGNvbnN0IGNlbGxFZGl0cyA9IHByb2dyZXNzLmVkaXRzLm1hcChlZGl0ID0+ICh7IHVyaTogcHJvZ3Jlc3MudXJpLCBlZGl0IH0pKTtcblx0XHRcdFx0dGhpcy5fbWVyZ2VPclB1c2hOb3RlYm9va0VkaXRHcm91cCh1cmksIGNlbGxFZGl0cywgcHJvZ3Jlc3MuZG9uZSwgaXNFeHRlcm5hbEVkaXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm90ZWJvb2sgY2VsbCBlZGl0cyAoSUNlbGxFZGl0T3BlcmF0aW9uKVxuXHRcdFx0XHR0aGlzLl9tZXJnZU9yUHVzaE5vdGVib29rRWRpdEdyb3VwKHVyaSwgcHJvZ3Jlc3MuZWRpdHMsIHByb2dyZXNzLmRvbmUsIGlzRXh0ZXJuYWxFZGl0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKHF1aWV0KTtcblx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLmtpbmQgPT09ICdwcm9ncmVzc1Rhc2snKSB7XG5cdFx0XHQvLyBBZGQgYSBuZXcgcmVzb2x2aW5nIHBhcnRcblx0XHRcdGNvbnN0IHJlc3BvbnNlUG9zaXRpb24gPSB0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2gocHJvZ3Jlc3MpIC0gMTtcblx0XHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKHF1aWV0KTtcblxuXHRcdFx0Y29uc3QgZGlzcCA9IHByb2dyZXNzLm9uRGlkQWRkUHJvZ3Jlc3MoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb250ZW50Q2hhbmdlZChmYWxzZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cHJvZ3Jlc3MudGFzaz8uKCkudGhlbigoY29udGVudCkgPT4ge1xuXHRcdFx0XHQvLyBTdG9wIGxpc3RlbmluZyBmb3IgcHJvZ3Jlc3MgdXBkYXRlcyBvbmNlIHRoZSB0YXNrIHNldHRsZXNcblx0XHRcdFx0ZGlzcC5kaXNwb3NlKCk7XG5cblx0XHRcdFx0Ly8gUmVwbGFjZSB0aGUgcmVzb2x2aW5nIHBhcnQncyBjb250ZW50IHdpdGggdGhlIHJlc29sdmVkIHJlc3BvbnNlXG5cdFx0XHRcdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHQodGhpcy5fcmVzcG9uc2VQYXJ0c1tyZXNwb25zZVBvc2l0aW9uXSBhcyBJQ2hhdFRhc2spLmNvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQoZmFsc2UpO1xuXHRcdFx0fSk7XG5cblx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdHJlZ2lzdGVyQXV0b3J1blNlbGZEaXNwb3NhYmxlKHRoaXMuX3N0b3JlLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRwcm9ncmVzcy5zdGF0ZS5yZWFkKHJlYWRlcik7IC8vIHVwZGF0ZSByZXByIHdoZW4gc3RhdGUgY2hhbmdlc1xuXHRcdFx0XHR0aGlzLl9jb250ZW50Q2hhbmdlZChmYWxzZSk7XG5cblx0XHRcdFx0aWYgKElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShwcm9ncmVzcywgcmVhZGVyKSkge1xuXHRcdFx0XHRcdHJlYWRlci5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cy5wdXNoKHByb2dyZXNzKTtcblx0XHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKHF1aWV0KTtcblx0XHR9IGVsc2UgaWYgKHByb2dyZXNzLmtpbmQgPT09ICdleHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlJykge1xuXHRcdFx0dGhpcy5faGFuZGxlRXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZShwcm9ncmVzcyk7XG5cdFx0XHR0aGlzLl9jb250ZW50Q2hhbmdlZChxdWlldCk7XG5cdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAncHJvZ3Jlc3NNZXNzYWdlJyAmJiBwcm9ncmVzcy5pZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBpZHggPSB0aGlzLl9yZXNwb25zZVBhcnRzLmZpbmRJbmRleChwID0+IHAua2luZCA9PT0gJ3Byb2dyZXNzTWVzc2FnZScgJiYgcC5pZCA9PT0gcHJvZ3Jlc3MuaWQpO1xuXHRcdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdFx0dGhpcy5fcmVzcG9uc2VQYXJ0cy5wdXNoKHByb2dyZXNzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3BvbnNlUGFydHNbaWR4XSA9IHByb2dyZXNzO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQocXVpZXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2gocHJvZ3Jlc3MpO1xuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQocXVpZXQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQZXJzaXN0cyB0aGUgZHVyYXRpb24gb2YgdGhlIGFjdGl2ZSByZWFzb25pbmcgaW50ZXJ2YWwuXG5cdCAqL1xuXHRmaW5hbGl6ZVJlYXNvbmluZ0R1cmF0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlUmVhc29uaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWN0aXZlUmVhc29uaW5nLnBhcnQucmVhc29uaW5nRHVyYXRpb25NcyA9IE1hdGgubWF4KDAsIERhdGUubm93KCkgLSB0aGlzLl9hY3RpdmVSZWFzb25pbmcuc3RhcnRlZEF0KTtcblx0XHR0aGlzLl9hY3RpdmVSZWFzb25pbmcgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYWRkQ2l0YXRpb24oY2l0YXRpb246IElDaGF0Q29kZUNpdGF0aW9uKSB7XG5cdFx0dGhpcy5fY2l0YXRpb25zLnB1c2goY2l0YXRpb24pO1xuXHRcdHRoaXMuX2NvbnRlbnRDaGFuZ2VkKCk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZUlubGluZVJlZmVyZW5jZShyZXNvbHZlSWQ6IHN0cmluZywgcmVzb2x2ZWRSZWZlcmVuY2U6IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSk6IGJvb2xlYW4ge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fcmVzcG9uc2VQYXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3Jlc3BvbnNlUGFydHNbaV07XG5cdFx0XHRpZiAoY3VycmVudC5raW5kICE9PSAnaW5saW5lUmVmZXJlbmNlJyB8fCBjdXJyZW50LnJlc29sdmVJZCAhPT0gcmVzb2x2ZUlkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZXNwb25zZVBhcnRzW2ldID0ge1xuXHRcdFx0XHQuLi5jdXJyZW50LFxuXHRcdFx0XHRpbmxpbmVSZWZlcmVuY2U6IHJlc29sdmVkUmVmZXJlbmNlLmlubGluZVJlZmVyZW5jZSxcblx0XHRcdFx0bmFtZTogcmVzb2x2ZWRSZWZlcmVuY2UubmFtZSA/PyBjdXJyZW50Lm5hbWUsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fY29udGVudENoYW5nZWQoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX21lcmdlT3JQdXNoVGV4dEVkaXRHcm91cCh1cmk6IFVSSSwgZWRpdHM6IFRleHRFZGl0W10sIGRvbmU6IGJvb2xlYW4gfCB1bmRlZmluZWQsIGlzRXh0ZXJuYWxFZGl0OiBib29sZWFuIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgdGhpcy5fcmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0aWYgKGNhbmRpZGF0ZS5raW5kID09PSAndGV4dEVkaXRHcm91cCcgJiYgIWNhbmRpZGF0ZS5kb25lICYmIGlzRXF1YWwoY2FuZGlkYXRlLnVyaSwgdXJpKSkge1xuXHRcdFx0XHRjYW5kaWRhdGUuZWRpdHMucHVzaChlZGl0cyk7XG5cdFx0XHRcdGNhbmRpZGF0ZS5kb25lID0gZG9uZTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2goeyBraW5kOiAndGV4dEVkaXRHcm91cCcsIHVyaSwgZWRpdHM6IFtlZGl0c10sIGRvbmUsIGlzRXh0ZXJuYWxFZGl0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWVyZ2VPclB1c2hOb3RlYm9va0VkaXRHcm91cCh1cmk6IFVSSSwgZWRpdHM6IElDZWxsVGV4dEVkaXRPcGVyYXRpb25bXSB8IElDZWxsRWRpdE9wZXJhdGlvbltdLCBkb25lOiBib29sZWFuIHwgdW5kZWZpbmVkLCBpc0V4dGVybmFsRWRpdDogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHRoaXMuX3Jlc3BvbnNlUGFydHMpIHtcblx0XHRcdGlmIChjYW5kaWRhdGUua2luZCA9PT0gJ25vdGVib29rRWRpdEdyb3VwJyAmJiAhY2FuZGlkYXRlLmRvbmUgJiYgaXNFcXVhbChjYW5kaWRhdGUudXJpLCB1cmkpKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZS5lZGl0cy5wdXNoKGVkaXRzKTtcblx0XHRcdFx0Y2FuZGlkYXRlLmRvbmUgPSBkb25lO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc3BvbnNlUGFydHMucHVzaCh7IGtpbmQ6ICdub3RlYm9va0VkaXRHcm91cCcsIHVyaSwgZWRpdHM6IFtlZGl0c10sIGRvbmUsIGlzRXh0ZXJuYWxFZGl0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlRXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZShwcm9ncmVzczogSUNoYXRFeHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlKTogdm9pZCB7XG5cdFx0Ly8gTG9vayBmb3IgZXhpc3RpbmcgaW52b2NhdGlvbiBpbiB0aGUgcmVzcG9uc2UgcGFydHNcblx0XHRjb25zdCBleGlzdGluZ0ludm9jYXRpb24gPSB0aGlzLl9yZXNwb25zZVBhcnRzLmZpbmRMYXN0KFxuXHRcdFx0KHBhcnQpOiBwYXJ0IGlzIENoYXRUb29sSW52b2NhdGlvbiA9PiBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgcGFydC50b29sQ2FsbElkID09PSBwcm9ncmVzcy50b29sQ2FsbElkXG5cdFx0KTtcblxuXHRcdGlmIChleGlzdGluZ0ludm9jYXRpb24pIHtcblx0XHRcdGlmIChwcm9ncmVzcy50b29sU3BlY2lmaWNEYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZXhpc3RpbmdJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSBwcm9ncmVzcy50b29sU3BlY2lmaWNEYXRhO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2dyZXNzLmlzQ29tcGxldGUpIHtcblx0XHRcdFx0ZXhpc3RpbmdJbnZvY2F0aW9uLmRpZEV4ZWN1dGVUb29sKHtcblx0XHRcdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZTogcHJvZ3Jlc3MucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0XHR0b29sUmVzdWx0RXJyb3I6IHByb2dyZXNzLmVycm9yTWVzc2FnZSxcblx0XHRcdFx0XHR0b29sUmVzdWx0RGV0YWlsczogcHJvZ3Jlc3MucmVzdWx0RGV0YWlsc1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgYSBuZXcgZXh0ZXJuYWwgdG9vbCBpbnZvY2F0aW9uXG5cdFx0Y29uc3QgdG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiBwcm9ncmVzcy50b29sTmFtZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsXG5cdFx0XHRkaXNwbGF5TmFtZTogcHJvZ3Jlc3MudG9vbE5hbWUsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBwcm9ncmVzcy50b29sTmFtZSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW52b2NhdGlvbiA9IG5ldyBDaGF0VG9vbEludm9jYXRpb24oXG5cdFx0XHR7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBwcm9ncmVzcy5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogcHJvZ3Jlc3MucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogcHJvZ3Jlc3MudG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdH0sXG5cdFx0XHR0b29sRGF0YSxcblx0XHRcdHByb2dyZXNzLnRvb2xDYWxsSWQsXG5cdFx0XHRwcm9ncmVzcy5zdWJhZ2VudEludm9jYXRpb25JZCxcblx0XHRcdHVuZGVmaW5lZCwgLy8gcGFyYW1ldGVyc1xuXHRcdFx0e30sXG5cdFx0XHR1bmRlZmluZWQgLy8gY2hhdFJlcXVlc3RJZFxuXHRcdCk7XG5cblx0XHRpZiAocHJvZ3Jlc3MuaXNDb21wbGV0ZSkge1xuXHRcdFx0Ly8gQWxyZWFkeSBjb21wbGV0ZWQgb24gZmlyc3QgcHVzaFxuXHRcdFx0aWYgKHByb2dyZXNzLnRvb2xTcGVjaWZpY0RhdGEgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSBwcm9ncmVzcy50b29sU3BlY2lmaWNEYXRhO1xuXHRcdFx0fVxuXHRcdFx0aW52b2NhdGlvbi5kaWRFeGVjdXRlVG9vbCh7XG5cdFx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0XHR0b29sUmVzdWx0TWVzc2FnZTogcHJvZ3Jlc3MucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0dG9vbFJlc3VsdEVycm9yOiBwcm9ncmVzcy5lcnJvck1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xSZXN1bHREZXRhaWxzOiBwcm9ncmVzcy5yZXN1bHREZXRhaWxzXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXNwb25zZVBhcnRzLnB1c2goaW52b2NhdGlvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcHV0ZVJlcHIoKTogc3RyaW5nIHtcblx0XHRsZXQgcmVwciA9IHN1cGVyLmNvbXB1dGVSZXByKCk7XG5cdFx0aWYgKHRoaXMuX2NpdGF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJlcHIgKz0gJ1xcblxcbicgKyBnZXRDb2RlQ2l0YXRpb25zTWVzc2FnZSh0aGlzLl9jaXRhdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVwcjtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnRlbnRDaGFuZ2VkKHF1aWV0PzogYm9vbGVhbikge1xuXHRcdHRoaXMuX2ludmFsaWRhdGVSZXByKCk7XG5cdFx0aWYgKCFxdWlldCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWYWx1ZS5maXJlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXNwb25zZU1vZGVsUGFyYW1ldGVycyB7XG5cdHJlc3BvbnNlQ29udGVudDogSU1hcmtkb3duU3RyaW5nIHwgUmVhZG9ubHlBcnJheTxTZXJpYWxpemVkQ2hhdFJlc3BvbnNlUGFydD47XG5cdHNlc3Npb246IENoYXRNb2RlbDtcblx0YWdlbnQ/OiBJQ2hhdEFnZW50RGF0YTtcblx0c2xhc2hDb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQ7XG5cdHJlcXVlc3RJZDogc3RyaW5nO1xuXHR0aW1lc3RhbXA/OiBudW1iZXI7XG5cdHZvdGU/OiBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uO1xuXHRyZXN1bHQ/OiBJQ2hhdEFnZW50UmVzdWx0O1xuXHRmb2xsb3d1cHM/OiBSZWFkb25seUFycmF5PElDaGF0Rm9sbG93dXA+O1xuXHRpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0PzogYm9vbGVhbjtcblx0c2hvdWxkQmVSZW1vdmVkT25TZW5kPzogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQ7XG5cdHNob3VsZEJlQmxvY2tlZD86IGJvb2xlYW47XG5cdHJlc3RvcmVkSWQ/OiBzdHJpbmc7XG5cdG1vZGVsU3RhdGU/OiBSZXNwb25zZU1vZGVsU3RhdGVUO1xuXHRjb21wbGV0aW9uVGltZXN0YW1wPzogbnVtYmVyIHwgbnVsbDtcblx0dGltZVNwZW50V2FpdGluZz86IG51bWJlcjtcblx0ZWxhcHNlZE1zPzogbnVtYmVyO1xuXHQvKipcblx0ICogdW5kZWZpbmVkIG1lYW5zIGl0IHdpbGwgYmUgc2V0IGxhdGVyLlxuXHQqL1xuXHRjb2RlQmxvY2tJbmZvczogSUNvZGVCbG9ja0luZm9bXSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IHR5cGUgUmVzcG9uc2VNb2RlbFN0YXRlVCA9XG5cdHwgeyB2YWx1ZTogUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgfVxuXHR8IHsgdmFsdWU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5OZWVkc0lucHV0IH1cblx0fCB7IHZhbHVlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUgfCBSZXNwb25zZU1vZGVsU3RhdGUuQ2FuY2VsbGVkIHwgUmVzcG9uc2VNb2RlbFN0YXRlLkZhaWxlZDsgY29tcGxldGVkQXQ6IG51bWJlciB9O1xuXG4vKipcbiAqIFRvdGFsIG91dHB1dCB0b2tlbnMgYWNyb3NzIGV2ZXJ5IG1vZGVsIGEgcmVzcG9uc2UgdXNlZCwgb3IgYHVuZGVmaW5lZGAgd2hlblxuICogdGhlIHByb3ZpZGVyIHJlcG9ydGVkIG5vIHdob2xlLXR1cm4gdG90YWxzLlxuICovXG5mdW5jdGlvbiBzdW1Nb2RlbE91dHB1dFRva2Vucyhtb2RlbFRvdGFsczogcmVhZG9ubHkgSUNoYXRVc2FnZU1vZGVsVG90YWxbXSB8IHVuZGVmaW5lZCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBtb2RlbFRvdGFscz8ucmVkdWNlKCh0b3RhbCwgZW50cnkpID0+IHRvdGFsICsgZW50cnkub3V0cHV0VG9rZW5zLCAwKTtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZU1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0UmVzcG9uc2VNb2RlbCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7XG5cdHByaXZhdGUgX3Nlc3Npb246IENoYXRNb2RlbDtcblx0cHJpdmF0ZSBfYWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zbGFzaENvbW1hbmQ6IElDaGF0QWdlbnRDb21tYW5kIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb2RlbFN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPFJlc3BvbnNlTW9kZWxTdGF0ZVQ+KHRoaXMsIHsgdmFsdWU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5QZW5kaW5nIH0pO1xuXHRwcml2YXRlIF92b3RlPzogQ2hhdEFnZW50Vm90ZURpcmVjdGlvbjtcblx0cHJpdmF0ZSBfcmVzdWx0PzogSUNoYXRBZ2VudFJlc3VsdDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXNhZ2VPYnMgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRVc2FnZSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSBfcGFyZW50VXNhZ2U6IElDaGF0VXNhZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1YmFnZW50Q29waWxvdENyZWRpdHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0aW9uVG9rZW5Db3VudE9icyA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXIgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgX3Nob3VsZEJlUmVtb3ZlZE9uU2VuZDogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRCZUJsb2NrZWQgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4odGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aW1lc3RhbXA6IG51bWJlcjtcblx0cHJpdmF0ZSBfY29tcGxldGlvblRpbWVzdGFtcDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90aW1lU3BlbnRXYWl0aW5nQWNjdW11bGF0b3I6IG51bWJlcjtcblx0cHJpdmF0ZSBfZWxhcHNlZE1zOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIGNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wOiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXG5cdHB1YmxpYyBnZXQgc2hvdWxkQmVCbG9ja2VkKCk6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2hvdWxkQmVCbG9ja2VkO1xuXHR9XG5cblx0cHVibGljIGdldCByZXF1ZXN0KCk6IElDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLmdldFJlcXVlc3RzKCkuZmluZChyID0+IHIuaWQgPT09IHRoaXMucmVxdWVzdElkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc2Vzc2lvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbjtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc2hvdWxkQmVSZW1vdmVkT25TZW5kKCkge1xuXHRcdHJldHVybiB0aGlzLl9zaG91bGRCZVJlbW92ZWRPblNlbmQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzSGlkZGVuRnJvbVRyYW5zY3JpcHQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVxdWVzdD8uaXNIaWRkZW5Gcm9tVHJhbnNjcmlwdCA/PyBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNDb21wbGV0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxTdGF0ZS5nZXQoKS52YWx1ZSAhPT0gUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgJiYgdGhpcy5fbW9kZWxTdGF0ZS5nZXQoKS52YWx1ZSAhPT0gUmVzcG9uc2VNb2RlbFN0YXRlLk5lZWRzSW5wdXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRpbWVzdGFtcCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90aW1lc3RhbXA7XG5cdH1cblxuXHRwdWJsaWMgc2V0IHNob3VsZEJlUmVtb3ZlZE9uU2VuZChkaXNhYmxlbWVudDogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5fc2hvdWxkQmVSZW1vdmVkT25TZW5kID09PSBkaXNhYmxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Nob3VsZEJlUmVtb3ZlZE9uU2VuZCA9IGRpc2FibGVtZW50O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGVmYXVsdENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNDYW5jZWxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxTdGF0ZS5nZXQoKS52YWx1ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29tcGxldGVkQXQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX21vZGVsU3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnZhbHVlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuQ29tcGxldGUgfHwgc3RhdGUudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5DYW5jZWxsZWQgfHwgc3RhdGUudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5GYWlsZWQpIHtcblx0XHRcdHJldHVybiBzdGF0ZS5jb21wbGV0ZWRBdDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29tcGxldGlvblRpbWVzdGFtcCgpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb21wbGV0aW9uVGltZXN0YW1wO1xuXHR9XG5cblx0cHVibGljIGdldCBzdGF0ZSgpOiBSZXNwb25zZU1vZGVsU3RhdGUge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fbW9kZWxTdGF0ZS5nZXQoKS52YWx1ZTtcblx0XHRpZiAoc3RhdGUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSAmJiAhIXRoaXMuX3Jlc3VsdD8uZXJyb3JEZXRhaWxzICYmIHRoaXMucmVzdWx0Py5lcnJvckRldGFpbHM/LmNvZGUgIT09ICdjYW5jZWxlZCcpIHtcblx0XHRcdC8vIFRoaXMgY2hlY2sgY292ZXJzIHNlc3Npb25zIGNyZWF0ZWQgaW4gcHJldmlvdXMgdnNjb2RlIHZlcnNpb25zIHdoaWNoIHNhdmVkIGEgZmFpbGVkIHJlc3BvbnNlIGFzICdDb21wbGV0ZSdcblx0XHRcdHJldHVybiBSZXNwb25zZU1vZGVsU3RhdGUuRmFpbGVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc3RhdGVUKCk6IFJlc3BvbnNlTW9kZWxTdGF0ZVQge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbFN0YXRlLmdldCgpO1xuXHR9XG5cblx0cHVibGljIGdldCB2b3RlKCk6IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl92b3RlO1xuXHR9XG5cblx0cHVibGljIGdldCBmb2xsb3d1cHMoKTogSUNoYXRGb2xsb3d1cFtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9sbG93dXBzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzcG9uc2U6IFJlc3BvbnNlO1xuXHRwcml2YXRlIF9maW5hbGl6ZWRSZXNwb25zZT86IElSZXNwb25zZTtcblx0cHVibGljIGdldCBlbnRpcmVSZXNwb25zZSgpOiBJUmVzcG9uc2Uge1xuXHRcdHJldHVybiB0aGlzLl9maW5hbGl6ZWRSZXNwb25zZSB8fCB0aGlzLl9yZXNwb25zZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgcmVzdWx0KCk6IElDaGF0QWdlbnRSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHVzYWdlKCk6IElDaGF0VXNhZ2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl91c2FnZU9icy5nZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdXNhZ2VPYnMoKTogSU9ic2VydmFibGU8SUNoYXRVc2FnZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl91c2FnZU9icztcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29tcGxldGlvblRva2VuQ291bnQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tcGxldGlvblRva2VuQ291bnRPYnMuZ2V0KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvbXBsZXRpb25Ub2tlbkNvdW50T2JzKCk6IElPYnNlcnZhYmxlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb21wbGV0aW9uVG9rZW5Db3VudE9icztcblx0fVxuXG5cdHB1YmxpYyBnZXQgZWxhcHNlZE1zKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsYXBzZWRNcztcblx0fVxuXG5cdHB1YmxpYyBnZXQgdXNlcm5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uLnJlc3BvbmRlclVzZXJuYW1lO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9sbG93dXBzPzogSUNoYXRGb2xsb3d1cFtdO1xuXG5cdHB1YmxpYyBnZXQgYWdlbnQoKTogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hZ2VudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc2xhc2hDb21tYW5kKCk6IElDaGF0QWdlbnRDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2xhc2hDb21tYW5kO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWdlbnRPclNsYXNoQ29tbWFuZERldGVjdGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYWdlbnRPclNsYXNoQ29tbWFuZERldGVjdGVkID8/IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXNlZENvbnRleHQ6IElDaGF0VXNlZENvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgdXNlZENvbnRleHQoKTogSUNoYXRVc2VkQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3VzZWRDb250ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudFJlZmVyZW5jZXM6IElDaGF0Q29udGVudFJlZmVyZW5jZVtdID0gW107XG5cdHB1YmxpYyBnZXQgY29udGVudFJlZmVyZW5jZXMoKTogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+IHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9jb250ZW50UmVmZXJlbmNlcyk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2RlQ2l0YXRpb25zOiBJQ2hhdENvZGVDaXRhdGlvbltdID0gW107XG5cdHB1YmxpYyBnZXQgY29kZUNpdGF0aW9ucygpOiBSZWFkb25seUFycmF5PElDaGF0Q29kZUNpdGF0aW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvZGVDaXRhdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc01lc3NhZ2VzOiBJQ2hhdFByb2dyZXNzTWVzc2FnZVtdID0gW107XG5cdHB1YmxpYyBnZXQgcHJvZ3Jlc3NNZXNzYWdlcygpOiBSZWFkb25seUFycmF5PElDaGF0UHJvZ3Jlc3NNZXNzYWdlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2dyZXNzTWVzc2FnZXM7XG5cdH1cblxuXHRwcml2YXRlIF9pc1N0YWxlOiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpYyBnZXQgaXNTdGFsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNTdGFsZTtcblx0fVxuXG5cblx0cmVhZG9ubHkgaXNQZW5kaW5nQ29uZmlybWF0aW9uOiBJT2JzZXJ2YWJsZTx7IHN0YXJ0ZWRXYWl0aW5nQXQ6IG51bWJlcjsgZGV0YWlsPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ+O1xuXG5cdHJlYWRvbmx5IGlzSW5Qcm9ncmVzczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIFRydWUgd2hlbmV2ZXIgdGhpcyByZXNwb25zZSBoYXMgbm90IHJlYWNoZWQgYSB0ZXJtaW5hbCBzdGF0ZSB5ZXQuXG5cdCAqIFVubGlrZSB7QGxpbmsgaXNJblByb2dyZXNzfSwgdGhpcyByZW1haW5zIHRydWUgZHVyaW5nIHRvb2wgY29uZmlybWF0aW9ucyxcblx0ICogZWxpY2l0YXRpb25zLCBhbmQgYW55IG90aGVyIGludGVybWVkaWF0ZSBzdGF0ZS4gSXQgb25seSBiZWNvbWVzIGZhbHNlIHdoZW5cblx0ICogdGhlIHJlc3BvbnNlIGNvbXBsZXRlcywgaXMgY2FuY2VsbGVkLCBvciBmYWlscy5cblx0ICovXG5cdHJlYWRvbmx5IGlzSW5jb21wbGV0ZTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBfcmVzcG9uc2VWaWV3PzogUmVzcG9uc2VWaWV3O1xuXHRwdWJsaWMgZ2V0IHJlc3BvbnNlKCk6IElSZXNwb25zZSB7XG5cdFx0Y29uc3QgdW5kb1N0b3AgPSB0aGlzLl9zaG91bGRCZVJlbW92ZWRPblNlbmQ/LmFmdGVyVW5kb1N0b3A7XG5cdFx0aWYgKCF1bmRvU3RvcCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpbmFsaXplZFJlc3BvbnNlIHx8IHRoaXMuX3Jlc3BvbnNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9yZXNwb25zZVZpZXc/LnVuZG9TdG9wICE9PSB1bmRvU3RvcCkge1xuXHRcdFx0dGhpcy5fcmVzcG9uc2VWaWV3ID0gbmV3IFJlc3BvbnNlVmlldyh0aGlzLl9yZXNwb25zZSwgdW5kb1N0b3ApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZXNwb25zZVZpZXc7XG5cdH1cblxuXHRwcml2YXRlIF9jb2RlQmxvY2tJbmZvczogSUNvZGVCbG9ja0luZm9bXSB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCBjb2RlQmxvY2tJbmZvcygpOiBJQ29kZUJsb2NrSW5mb1tdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29kZUJsb2NrSW5mb3M7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihwYXJhbXM6IElDaGF0UmVzcG9uc2VNb2RlbFBhcmFtZXRlcnMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHBhcmFtcy5zZXNzaW9uO1xuXHRcdHRoaXMuX2FnZW50ID0gcGFyYW1zLmFnZW50O1xuXHRcdHRoaXMuX3NsYXNoQ29tbWFuZCA9IHBhcmFtcy5zbGFzaENvbW1hbmQ7XG5cdFx0dGhpcy5yZXF1ZXN0SWQgPSBwYXJhbXMucmVxdWVzdElkO1xuXHRcdHRoaXMuX3RpbWVzdGFtcCA9IHBhcmFtcy50aW1lc3RhbXAgfHwgRGF0ZS5ub3coKTtcblx0XHRpZiAocGFyYW1zLm1vZGVsU3RhdGUpIHtcblx0XHRcdHRoaXMuX21vZGVsU3RhdGUuc2V0KHBhcmFtcy5tb2RlbFN0YXRlLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR0aGlzLl9jb21wbGV0aW9uVGltZXN0YW1wID0gcGFyYW1zLmNvbXBsZXRpb25UaW1lc3RhbXAgPT09IG51bGxcblx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHQ6IHBhcmFtcy5jb21wbGV0aW9uVGltZXN0YW1wID8/IChwYXJhbXMubW9kZWxTdGF0ZSAmJiAnY29tcGxldGVkQXQnIGluIHBhcmFtcy5tb2RlbFN0YXRlID8gcGFyYW1zLm1vZGVsU3RhdGUuY29tcGxldGVkQXQgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3RpbWVTcGVudFdhaXRpbmdBY2N1bXVsYXRvciA9IHBhcmFtcy50aW1lU3BlbnRXYWl0aW5nIHx8IDA7XG5cdFx0dGhpcy5fZWxhcHNlZE1zID0gcGFyYW1zLmVsYXBzZWRNcztcblx0XHR0aGlzLl92b3RlID0gcGFyYW1zLnZvdGU7XG5cdFx0dGhpcy5fcmVzdWx0ID0gcGFyYW1zLnJlc3VsdDtcblx0XHR0aGlzLl9mb2xsb3d1cHMgPSBwYXJhbXMuZm9sbG93dXBzID8gWy4uLnBhcmFtcy5mb2xsb3d1cHNdIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCA9IHBhcmFtcy5pc0NvbXBsZXRlQWRkZWRSZXF1ZXN0ID8/IGZhbHNlO1xuXHRcdHRoaXMuX3Nob3VsZEJlUmVtb3ZlZE9uU2VuZCA9IHBhcmFtcy5zaG91bGRCZVJlbW92ZWRPblNlbmQ7XG5cdFx0dGhpcy5fc2hvdWxkQmVCbG9ja2VkLnNldChwYXJhbXMuc2hvdWxkQmVCbG9ja2VkID8/IGZhbHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gSWYgd2UgYXJlIGNyZWF0aW5nIGEgcmVzcG9uc2Ugd2l0aCBzb21lIGV4aXN0aW5nIGNvbnRlbnQsIGNvbnNpZGVyIGl0IHN0YWxlXG5cdFx0dGhpcy5faXNTdGFsZSA9IEFycmF5LmlzQXJyYXkocGFyYW1zLnJlc3BvbnNlQ29udGVudCkgJiYgKHBhcmFtcy5yZXNwb25zZUNvbnRlbnQubGVuZ3RoICE9PSAwIHx8IGlzTWFya2Rvd25TdHJpbmcocGFyYW1zLnJlc3BvbnNlQ29udGVudCkgJiYgcGFyYW1zLnJlc3BvbnNlQ29udGVudC52YWx1ZS5sZW5ndGggIT09IDApO1xuXG5cdFx0dGhpcy5fcmVzcG9uc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzcG9uc2UocGFyYW1zLnJlc3BvbnNlQ29udGVudCkpO1xuXHRcdHRoaXMuX2NvZGVCbG9ja0luZm9zID0gcGFyYW1zLmNvZGVCbG9ja0luZm9zID8gWy4uLnBhcmFtcy5jb2RlQmxvY2tJbmZvc10gOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBzaWduYWwgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIHRoaXMub25EaWRDaGFuZ2UpO1xuXG5cdFx0Y29uc3QgX3BlbmRpbmdJbmZvID0gc2lnbmFsLm1hcCgoX3ZhbHVlLCByKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdHNpZ25hbC5yZWFkKHIpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5fcmVzcG9uc2UudmFsdWUpIHtcblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gcGFydC5zdGF0ZS5yZWFkKHIpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0aXRsZSA9IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZTtcblx0XHRcdFx0XHRcdHJldHVybiB0aXRsZSA/IChpc01hcmtkb3duU3RyaW5nKHRpdGxlKSA/IHRpdGxlLnZhbHVlIDogdGl0bGUpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd3YWl0aW5nRm9yUG9zdEFwcHJvdmFsJywgXCJBcHByb3ZlIHRvb2wgcmVzdWx0P1wiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd3YWl0aW5nRm9yVG9vbEF1dGhlbnRpY2F0aW9uJywgXCJBdXRoZW50aWNhdGUgezB9IHRvIGNvbnRpbnVlLi4uXCIsIHN0YXRlLnNlcnZlci5uYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ2NvbmZpcm1hdGlvbicgJiYgIXBhcnQuaXNVc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnQudGl0bGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnICYmICFwYXJ0LmlzVXNlZCkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnd2FpdGluZ0Fuc3dlcicsIFwiQW5zd2VyIHF1ZXN0aW9ucyB0byBjb250aW51ZS4uLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGFydC5raW5kID09PSAncGxhblJldmlldycgJiYgIXBhcnQuaXNVc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd3YWl0aW5nUGxhblJldmlldycsIFwiUmV2aWV3IHRoZSBwbGFuIHRvIGNvbnRpbnVlLi4uXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdlbGljaXRhdGlvbjInICYmIHBhcnQuc3RhdGUucmVhZChyKSA9PT0gRWxpY2l0YXRpb25TdGF0ZS5QZW5kaW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGl0bGUgPSBwYXJ0LnRpdGxlO1xuXHRcdFx0XHRcdHJldHVybiBpc01hcmtkb3duU3RyaW5nKHRpdGxlKSA/IHRpdGxlLnZhbHVlIDogdGl0bGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IF9zdGFydGVkV2FpdGluZ0F0ID0gX3BlbmRpbmdJbmZvLm1hcChwID0+ICEhcCkubWFwKHAgPT4gcCA/IERhdGUubm93KCkgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuaXNQZW5kaW5nQ29uZmlybWF0aW9uID0gX3N0YXJ0ZWRXYWl0aW5nQXQubWFwKCh3YWl0aW5nLCByKSA9PiB3YWl0aW5nID8geyBzdGFydGVkV2FpdGluZ0F0OiB3YWl0aW5nLCBkZXRhaWw6IF9wZW5kaW5nSW5mby5yZWFkKHIpIH0gOiB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy5pc0luUHJvZ3Jlc3MgPSBzaWduYWwubWFwKChfdmFsdWUsIHIpID0+IHtcblxuXHRcdFx0c2lnbmFsLnJlYWQocik7XG5cblx0XHRcdHJldHVybiAhX3BlbmRpbmdJbmZvLnJlYWQocilcblx0XHRcdFx0JiYgIXRoaXMuc2hvdWxkQmVSZW1vdmVkT25TZW5kXG5cdFx0XHRcdCYmICh0aGlzLl9tb2RlbFN0YXRlLnJlYWQocikudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5QZW5kaW5nIHx8IHRoaXMuX21vZGVsU3RhdGUucmVhZChyKS52YWx1ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLk5lZWRzSW5wdXQpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5pc0luY29tcGxldGUgPSB0aGlzLl9tb2RlbFN0YXRlLm1hcChzdGF0ZSA9PiB7XG5cdFx0XHRyZXR1cm4gc3RhdGUudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5QZW5kaW5nIHx8IHN0YXRlLnZhbHVlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuTmVlZHNJbnB1dDtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Jlc3BvbnNlLm9uRGlkQ2hhbmdlVmFsdWUoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShkZWZhdWx0Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24pKSk7XG5cdFx0dGhpcy5pZCA9IHBhcmFtcy5yZXN0b3JlZElkID8/ICdyZXNwb25zZV8nICsgZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHRsZXQgbGFzdFN0YXJ0ZWRXYWl0aW5nQXQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuaXNQZW5kaW5nQ29uZmlybWF0aW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsU3RhdGUuc2V0KHsgdmFsdWU6IFJlc3BvbnNlTW9kZWxTdGF0ZS5OZWVkc0lucHV0IH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmICghbGFzdFN0YXJ0ZWRXYWl0aW5nQXQpIHtcblx0XHRcdFx0XHRsYXN0U3RhcnRlZFdhaXRpbmdBdCA9IHBlbmRpbmcuc3RhcnRlZFdhaXRpbmdBdDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChsYXN0U3RhcnRlZFdhaXRpbmdBdCkge1xuXHRcdFx0XHQvLyBSZXN0b3JlIHN0YXRlIHRvIFBlbmRpbmcgaWYgaXQgd2FzIHNldCB0byBOZWVkc0lucHV0IGJ5IHRoaXMgb2JzZXJ2YWJsZVxuXHRcdFx0XHRpZiAodGhpcy5fbW9kZWxTdGF0ZS5yZWFkKHJlYWRlcikudmFsdWUgPT09IFJlc3BvbnNlTW9kZWxTdGF0ZS5OZWVkc0lucHV0KSB7XG5cdFx0XHRcdFx0dGhpcy5fbW9kZWxTdGF0ZS5zZXQoeyB2YWx1ZTogUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgfSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl90aW1lU3BlbnRXYWl0aW5nQWNjdW11bGF0b3IgKz0gRGF0ZS5ub3coKSAtIGxhc3RTdGFydGVkV2FpdGluZ0F0O1xuXHRcdFx0XHRsYXN0U3RhcnRlZFdhaXRpbmdBdCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuX3RpbWVzdGFtcCArIHRoaXMuX3RpbWVTcGVudFdhaXRpbmdBY2N1bXVsYXRvcjtcblx0XHR9KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cdH1cblxuXHRpbml0aWFsaXplQ29kZUJsb2NrSW5mb3MoY29kZUJsb2NrSW5mbzogSUNvZGVCbG9ja0luZm9bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb2RlQmxvY2tJbmZvcykge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQ29kZSBibG9jayBpbmZvcyBoYXZlIGFscmVhZHkgYmVlbiBpbml0aWFsaXplZCcpO1xuXHRcdH1cblx0XHR0aGlzLl9jb2RlQmxvY2tJbmZvcyA9IFsuLi5jb2RlQmxvY2tJbmZvXTtcblx0fVxuXG5cdHNldEJsb2NrZWRTdGF0ZShpc0Jsb2NrZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zaG91bGRCZUJsb2NrZWQuc2V0KGlzQmxvY2tlZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBseSBhIHByb2dyZXNzIHVwZGF0ZSB0byB0aGUgYWN0dWFsIHJlc3BvbnNlIGNvbnRlbnQuXG5cdCAqL1xuXHR1cGRhdGVDb250ZW50KHJlc3BvbnNlUGFydDogSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudCB8IElDaGF0VGV4dEVkaXQgfCBJQ2hhdE5vdGVib29rRWRpdCB8IElDaGF0RXh0ZXJuYWxUb29sSW52b2NhdGlvblVwZGF0ZSwgcXVpZXQ/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fcmVzcG9uc2UudXBkYXRlQ29udGVudChyZXNwb25zZVBhcnQsIHF1aWV0KTtcblx0fVxuXG5cdHJlc29sdmVJbmxpbmVSZWZlcmVuY2UocmVzb2x2ZUlkOiBzdHJpbmcsIHJlc29sdmVkUmVmZXJlbmNlOiBJQ2hhdENvbnRlbnRJbmxpbmVSZWZlcmVuY2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzcG9uc2UucmVzb2x2ZUlubGluZVJlZmVyZW5jZShyZXNvbHZlSWQsIHJlc29sdmVkUmVmZXJlbmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBZGRzIGFuIHVuZG8gc3RvcCBhdCB0aGUgY3VycmVudCBwb3NpdGlvbiBpbiB0aGUgc3RyZWFtLlxuXHQgKi9cblx0YWRkVW5kb1N0b3AodW5kb1N0b3A6IElDaGF0VW5kb1N0b3ApIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgcmVhc29uOiAndW5kb1N0b3AnLCBpZDogdW5kb1N0b3AuaWQgfSk7XG5cdFx0dGhpcy5fcmVzcG9uc2UudXBkYXRlQ29udGVudCh1bmRvU3RvcCwgdHJ1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogQXBwbHkgb25lIG9mIHRoZSBwcm9ncmVzcyB1cGRhdGVzIHRoYXQgYXJlIG5vdCBwYXJ0IG9mIHRoZSBhY3R1YWwgcmVzcG9uc2UgY29udGVudC5cblx0ICovXG5cdGFwcGx5UmVmZXJlbmNlKHByb2dyZXNzOiBJQ2hhdFVzZWRDb250ZXh0IHwgSUNoYXRDb250ZW50UmVmZXJlbmNlKSB7XG5cdFx0aWYgKHByb2dyZXNzLmtpbmQgPT09ICd1c2VkQ29udGV4dCcpIHtcblx0XHRcdHRoaXMuX3VzZWRDb250ZXh0ID0gcHJvZ3Jlc3M7XG5cdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAncmVmZXJlbmNlJykge1xuXHRcdFx0dGhpcy5fY29udGVudFJlZmVyZW5jZXMucHVzaChwcm9ncmVzcyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKGRlZmF1bHRDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbik7XG5cdFx0fVxuXHR9XG5cblx0YXBwbHlDb2RlQ2l0YXRpb24ocHJvZ3Jlc3M6IElDaGF0Q29kZUNpdGF0aW9uKSB7XG5cdFx0dGhpcy5fY29kZUNpdGF0aW9ucy5wdXNoKHByb2dyZXNzKTtcblx0XHR0aGlzLl9yZXNwb25zZS5hZGRDaXRhdGlvbihwcm9ncmVzcyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShkZWZhdWx0Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24pO1xuXHR9XG5cblx0c2V0QWdlbnQoYWdlbnQ6IElDaGF0QWdlbnREYXRhLCBzbGFzaENvbW1hbmQ/OiBJQ2hhdEFnZW50Q29tbWFuZCkge1xuXHRcdHRoaXMuX2FnZW50ID0gYWdlbnQ7XG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kID0gc2xhc2hDb21tYW5kO1xuXHRcdHRoaXMuX2FnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCA9ICFhZ2VudC5pc0RlZmF1bHQgfHwgISFzbGFzaENvbW1hbmQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShkZWZhdWx0Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24pO1xuXHR9XG5cblx0c2V0UmVzdWx0KHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCk6IHZvaWQge1xuXHRcdC8vIElmIGFscmVhZHkgY2FuY2VsbGVkLCBkaXNjYXJkIGVycm9yIGRldGFpbHMgZnJvbSBsYXRlLWFycml2aW5nIGFnZW50IHJlc3BvbnNlcy5cblx0XHRpZiAodGhpcy5pc0NhbmNlbGVkICYmIHJlc3VsdC5lcnJvckRldGFpbHMpIHtcblx0XHRcdGNvbnN0IHsgZXJyb3JEZXRhaWxzOiBfZXJyb3JEZXRhaWxzLCAuLi5yZXN0IH0gPSByZXN1bHQ7XG5cdFx0XHR0aGlzLl9yZXN1bHQgPSByZXN0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZXN1bHQgPSByZXN1bHQ7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGVmYXVsdENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uKTtcblx0fVxuXG5cdHNldFVzYWdlKHVzYWdlOiBJQ2hhdFVzYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5fcGFyZW50VXNhZ2UgPSB1c2FnZTtcblx0XHR0aGlzLl9zZXRVc2FnZSh0aGlzLl93aXRoU3ViYWdlbnRDb3BpbG90Q3JlZGl0cyh1c2FnZSksIHRydWUpO1xuXHR9XG5cblx0c2V0U3ViYWdlbnRDb3BpbG90Q3JlZGl0cyhzdWJhZ2VudENhbGxJZDogc3RyaW5nLCBjb3BpbG90Q3JlZGl0czogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudENyZWRpdHMgPSB0aGlzLl9zdWJhZ2VudENvcGlsb3RDcmVkaXRzLmdldChzdWJhZ2VudENhbGxJZCk7XG5cdFx0aWYgKCFOdW1iZXIuaXNGaW5pdGUoY29waWxvdENyZWRpdHMpIHx8IGNvcGlsb3RDcmVkaXRzIDwgMCB8fCAoY3VycmVudENyZWRpdHMgIT09IHVuZGVmaW5lZCAmJiBjb3BpbG90Q3JlZGl0cyA8PSBjdXJyZW50Q3JlZGl0cykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3ViYWdlbnRDb3BpbG90Q3JlZGl0cy5zZXQoc3ViYWdlbnRDYWxsSWQsIGNvcGlsb3RDcmVkaXRzKTtcblx0XHRjb25zdCB1c2FnZSA9IHRoaXMuX3BhcmVudFVzYWdlID8/IHsga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAwLCBjb21wbGV0aW9uVG9rZW5zOiAwIH07XG5cdFx0dGhpcy5fc2V0VXNhZ2UodGhpcy5fd2l0aFN1YmFnZW50Q29waWxvdENyZWRpdHModXNhZ2UpLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF93aXRoU3ViYWdlbnRDb3BpbG90Q3JlZGl0cyh1c2FnZTogSUNoYXRVc2FnZSk6IElDaGF0VXNhZ2Uge1xuXHRcdGxldCBzdWJhZ2VudENvcGlsb3RDcmVkaXRzID0gMDtcblx0XHRmb3IgKGNvbnN0IGNyZWRpdHMgb2YgdGhpcy5fc3ViYWdlbnRDb3BpbG90Q3JlZGl0cy52YWx1ZXMoKSkge1xuXHRcdFx0c3ViYWdlbnRDb3BpbG90Q3JlZGl0cyArPSBjcmVkaXRzO1xuXHRcdH1cblx0XHRyZXR1cm4gc3ViYWdlbnRDb3BpbG90Q3JlZGl0cyA9PT0gMFxuXHRcdFx0PyB1c2FnZVxuXHRcdFx0OiB7IC4uLnVzYWdlLCBjb3BpbG90Q3JlZGl0czogKHVzYWdlLmNvcGlsb3RDcmVkaXRzID8/IDApICsgc3ViYWdlbnRDb3BpbG90Q3JlZGl0cyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VXNhZ2UodXNhZ2U6IElDaGF0VXNhZ2UsIGNvdW50Q29tcGxldGlvblRva2VuczogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRVc2FnZSA9IHRoaXMuX3VzYWdlT2JzLmdldCgpO1xuXHRcdGlmIChjdXJyZW50VXNhZ2UgJiYgdGhpcy5pc1NhbWVVc2FnZShjdXJyZW50VXNhZ2UsIHVzYWdlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgYSByZXBvcnQgZGVzY3JpYmluZyBhICpkaWZmZXJlbnQqIG1vZGVsIGNhbGwgYWRkcyB0byB0aGUgcnVubmluZ1xuXHRcdC8vIGNvbXBsZXRpb24tdG9rZW4gdG90YWwuIEEgYmFja2VuZCBjYW4gcmUtcmVwb3J0IG9uZSBjYWxsIHNldmVyYWwgdGltZXMgYXNcblx0XHQvLyBzbG93ZXItYXJyaXZpbmcgZGV0YWlsIHJlc29sdmVzIFx1MjAxNCB0aGUgYWdlbnQgaG9zdCByZS1lbWl0cyB3aXRoIHRoZSBjb250ZXh0XG5cdFx0Ly8gYXR0cmlidXRpb24gYW5kIHRoZSBzZXNzaW9uIGNvc3Qgb25jZSBpdHMgUlBDcyByZXR1cm4gXHUyMDE0IGFuZCB0aG9zZVxuXHRcdC8vIHJlZmluZW1lbnRzIG11c3QgdXBkYXRlIHRoZSBzdG9yZWQgdXNhZ2Ugd2l0aG91dCBiZWluZyBjb3VudGVkIGFnYWluLlxuXHRcdC8vXG5cdFx0Ly8gVHdvIGNvbnNlY3V0aXZlIGNhbGxzIHJlcG9ydGluZyBpZGVudGljYWwgdG9rZW5zIGFyZSBpbmRpc3Rpbmd1aXNoYWJsZSBoZXJlXG5cdFx0Ly8gYW5kIHRoZSBzZWNvbmQgaXMgdHJlYXRlZCBhcyBhIHJlZmluZW1lbnQuIFRoYXQgaXMgcHJlLWV4aXN0aW5nOiB0aGVcblx0XHQvLyBgaXNTYW1lVXNhZ2VgIGd1YXJkIGFscmVhZHkgZGlzY2FyZGVkIHN1Y2ggYSByZXBvcnQgd2hvbGVzYWxlLlxuXHRcdGNvbnN0IGlzTmV3Q2FsbCA9ICFjdXJyZW50VXNhZ2Vcblx0XHRcdHx8IGN1cnJlbnRVc2FnZS5wcm9tcHRUb2tlbnMgIT09IHVzYWdlLnByb21wdFRva2Vuc1xuXHRcdFx0fHwgY3VycmVudFVzYWdlLmNvbXBsZXRpb25Ub2tlbnMgIT09IHVzYWdlLmNvbXBsZXRpb25Ub2tlbnNcblx0XHRcdHx8IGN1cnJlbnRVc2FnZS5vdXRwdXRCdWZmZXIgIT09IHVzYWdlLm91dHB1dEJ1ZmZlcjtcblxuXHRcdHRoaXMuX3VzYWdlT2JzLnNldCh1c2FnZSwgdW5kZWZpbmVkKTtcblx0XHQvLyBgY29tcGxldGlvblRva2Vuc2AgZGVzY3JpYmVzIGEgc2luZ2xlIG1vZGVsIGNhbGwsIHNvIHRoZSBydW5uaW5nIGNvdW50IGlzXG5cdFx0Ly8gYnVpbHQgdXAgY2FsbCBieSBjYWxsLiBUaGF0IG92ZXItY291bnRzIHdoZW5ldmVyIGEgcmVwb3J0IGlzIHJlLWVtaXR0ZWRcblx0XHQvLyB3aXRoIHVuY2hhbmdlZCBjb3VudHMgXHUyMDE0IGFzIGhhcHBlbnMgd2hlbiBhIHN1YmFnZW50J3MgY2FsbCByZWZyZXNoZXMgdGhlXG5cdFx0Ly8gcGFyZW50IHR1cm4ncyBhZ2dyZWdhdGUuIFdoZW4gdGhlIHByb3ZpZGVyIHJlcG9ydHMgd2hvbGUtdHVybiB0b3RhbHMgdGhleVxuXHRcdC8vIGFyZSBhdXRob3JpdGF0aXZlLCBzbyB0YWtlIHRoZW0gaW5zdGVhZCBvZiBhZGRpbmcgdG8gdGhlIHRhbGx5LlxuXHRcdGNvbnN0IHJlcG9ydGVkT3V0cHV0VG9rZW5zID0gc3VtTW9kZWxPdXRwdXRUb2tlbnModXNhZ2UubW9kZWxUb3RhbHMpO1xuXHRcdGlmIChyZXBvcnRlZE91dHB1dFRva2VucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uVG9rZW5Db3VudE9icy5zZXQocmVwb3J0ZWRPdXRwdXRUb2tlbnMsIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIGlmIChjb3VudENvbXBsZXRpb25Ub2tlbnMgJiYgaXNOZXdDYWxsKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c0NvbXBsZXRpb25Ub2tlbnMgPSB0aGlzLl9jb21wbGV0aW9uVG9rZW5Db3VudE9icy5nZXQoKSA/PyAwO1xuXHRcdFx0dGhpcy5fY29tcGxldGlvblRva2VuQ291bnRPYnMuc2V0KHByZXZpb3VzQ29tcGxldGlvblRva2VucyArIHVzYWdlLmNvbXBsZXRpb25Ub2tlbnMsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGVmYXVsdENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uKTtcblx0fVxuXG5cdHNldEVsYXBzZWRNcyhlbGFwc2VkTXM6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2VsYXBzZWRNcyA9IE1hdGgubWF4KDAsIGVsYXBzZWRNcyk7XG5cdH1cblxuXHRwcml2YXRlIGlzU2FtZVVzYWdlKGN1cnJlbnRVc2FnZTogSUNoYXRVc2FnZSwgdXNhZ2U6IElDaGF0VXNhZ2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY3VycmVudFVzYWdlLnByb21wdFRva2VucyA9PT0gdXNhZ2UucHJvbXB0VG9rZW5zXG5cdFx0XHQmJiBjdXJyZW50VXNhZ2UuY29tcGxldGlvblRva2VucyA9PT0gdXNhZ2UuY29tcGxldGlvblRva2Vuc1xuXHRcdFx0JiYgY3VycmVudFVzYWdlLm91dHB1dEJ1ZmZlciA9PT0gdXNhZ2Uub3V0cHV0QnVmZmVyXG5cdFx0XHQmJiBjdXJyZW50VXNhZ2UuY29waWxvdENyZWRpdHMgPT09IHVzYWdlLmNvcGlsb3RDcmVkaXRzXG5cdFx0XHQmJiBjdXJyZW50VXNhZ2Uuc2Vzc2lvbkNvcGlsb3RDcmVkaXRzID09PSB1c2FnZS5zZXNzaW9uQ29waWxvdENyZWRpdHNcblx0XHRcdCYmIGVxdWFscyhjdXJyZW50VXNhZ2UucHJvbXB0VG9rZW5EZXRhaWxzLCB1c2FnZS5wcm9tcHRUb2tlbkRldGFpbHMpXG5cdFx0XHQmJiBlcXVhbHMoY3VycmVudFVzYWdlLm1vZGVsVG90YWxzLCB1c2FnZS5tb2RlbFRvdGFscyk7XG5cdH1cblxuXHRjb21wbGV0ZShjb21wbGV0ZWRBdCA9IERhdGUubm93KCkpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21wbGV0ZShjb21wbGV0ZWRBdCwgY29tcGxldGVkQXQpO1xuXHR9XG5cblx0Y29tcGxldGVXaXRob3V0VGltZXN0YW1wKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbXBsZXRlKERhdGUubm93KCksIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wbGV0ZShjb21wbGV0ZWRBdDogbnVtYmVyLCBjb21wbGV0aW9uVGltZXN0YW1wOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBOby1vcCBpZiBpdCdzIGFscmVhZHkgY29tcGxldGVcblx0XHRpZiAodGhpcy5pc0NvbXBsZXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZXN1bHQ/LmVycm9yRGV0YWlscz8ucmVzcG9uc2VJc1JlZGFjdGVkKSB7XG5cdFx0XHR0aGlzLl9yZXNwb25zZS5jbGVhcigpO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNwb25zZS5maW5hbGl6ZVJlYXNvbmluZ0R1cmF0aW9uKCk7XG5cblx0XHQvLyBDb21wdXRlIGVsYXBzZWQgZ2VuZXJhdGlvbiB0aW1lIGJlZm9yZSBzZXR0aW5nIHRlcm1pbmFsIHN0YXRlXG5cdFx0dGhpcy5fZWxhcHNlZE1zID8/PSBNYXRoLm1heCgwLCBjb21wbGV0ZWRBdCAtIHRoaXMuY29uZmlybWF0aW9uQWRqdXN0ZWRUaW1lc3RhbXAuZ2V0KCkpO1xuXG5cdFx0Ly8gQ2FuY2VsZWQgc2Vzc2lvbnMgY2FuIGJlIGNvbnNpZGVyZWQgJ0NvbXBsZXRlJ1xuXHRcdGNvbnN0IHN0YXRlID0gISF0aGlzLl9yZXN1bHQ/LmVycm9yRGV0YWlscyAmJiB0aGlzLl9yZXN1bHQuZXJyb3JEZXRhaWxzLmNvZGUgIT09ICdjYW5jZWxlZCcgPyBSZXNwb25zZU1vZGVsU3RhdGUuRmFpbGVkIDogUmVzcG9uc2VNb2RlbFN0YXRlLkNvbXBsZXRlO1xuXHRcdHRoaXMuX2NvbXBsZXRpb25UaW1lc3RhbXAgPSBjb21wbGV0aW9uVGltZXN0YW1wO1xuXHRcdHRoaXMuX21vZGVsU3RhdGUuc2V0KHsgdmFsdWU6IHN0YXRlLCBjb21wbGV0ZWRBdCB9LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyByZWFzb246ICdjb21wbGV0ZWRSZXF1ZXN0JyB9KTtcblx0fVxuXG5cdGNhbmNlbCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXNwb25zZS5maW5hbGl6ZVJlYXNvbmluZ0R1cmF0aW9uKCk7XG5cdFx0Ly8gVHJhbnNpdGlvbiBhbnkgdG9vbCBpbnZvY2F0aW9ucyB0aGF0IGFyZSBzdGlsbCBzdHJlYW1pbmcgcGFydGlhbFxuXHRcdC8vIGlucHV0IGZyb20gdGhlIExNIGludG8gdGhlIENhbmNlbGxlZCBzdGF0ZSBzbyB0aGF0IFVJIGNvbnN1bWVyc1xuXHRcdC8vIChlLmcuIHRoZSB0aGlua2luZyBjb250ZW50IHBhcnQpIHN0b3Agc2hvd2luZyB0aGVpciBpbi1wcm9ncmVzc1xuXHRcdC8vIHNwaW5uZXIvXCJFZGl0aW5nIGZpbGVzXCIgbGFiZWwuIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjg4NzAxLlxuXHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLl9yZXNwb25zZS52YWx1ZSkge1xuXHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiBwYXJ0IGluc3RhbmNlb2YgQ2hhdFRvb2xJbnZvY2F0aW9uKSB7XG5cdFx0XHRcdHBhcnQuY2FuY2VsRnJvbVN0cmVhbWluZyhUb29sQ29uZmlybUtpbmQuU2tpcHBlZCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiBDaGF0UGxhblJldmlld0RhdGEpIHtcblx0XHRcdFx0cGFydC5kaXNtaXNzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEpIHtcblx0XHRcdFx0cGFydC5kaXNtaXNzKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tcGxldGVkQXQgPSBEYXRlLm5vdygpO1xuXHRcdHRoaXMuX2VsYXBzZWRNcyA/Pz0gTWF0aC5tYXgoMCwgY29tcGxldGVkQXQgLSB0aGlzLmNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wLmdldCgpKTtcblx0XHR0aGlzLl9jb21wbGV0aW9uVGltZXN0YW1wID0gY29tcGxldGVkQXQ7XG5cdFx0dGhpcy5fbW9kZWxTdGF0ZS5zZXQoeyB2YWx1ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZCwgY29tcGxldGVkQXQgfSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgcmVhc29uOiAnY29tcGxldGVkUmVxdWVzdCcgfSk7XG5cdH1cblxuXHRzZXRGb2xsb3d1cHMoZm9sbG93dXBzOiBJQ2hhdEZvbGxvd3VwW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9mb2xsb3d1cHMgPSBmb2xsb3d1cHM7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShkZWZhdWx0Q2hhdFJlc3BvbnNlTW9kZWxDaGFuZ2VSZWFzb24pOyAvLyBGaXJlIHNvIHRoYXQgY29tbWFuZCBmb2xsb3d1cHMgZ2V0IHJlbmRlcmVkIG9uIHRoZSByb3dcblx0fVxuXG5cdHNldFZvdGUodm90ZTogQ2hhdEFnZW50Vm90ZURpcmVjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX3ZvdGUgPSB2b3RlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGVmYXVsdENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uKTtcblx0fVxuXG5cdHNldEVkaXRBcHBsaWVkKGVkaXQ6IElDaGF0VGV4dEVkaXRHcm91cCwgZWRpdENvdW50OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMucmVzcG9uc2UudmFsdWUuaW5jbHVkZXMoZWRpdCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFlZGl0LnN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGVkaXQuc3RhdGUuYXBwbGllZCA9IGVkaXRDb3VudDsgLy8gbXVzdCBub3QgYmUgZWRpdC5lZGl0cy5sZW5ndGhcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKGRlZmF1bHRDaGF0UmVzcG9uc2VNb2RlbENoYW5nZVJlYXNvbik7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRhZG9wdFRvKHNlc3Npb246IENoYXRNb2RlbCkge1xuXHRcdHRoaXMuX3Nlc3Npb24gPSBzZXNzaW9uO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGVmYXVsdENoYXRSZXNwb25zZU1vZGVsQ2hhbmdlUmVhc29uKTtcblx0fVxuXG5cblx0ZmluYWxpemVVbmRvU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZmluYWxpemVkUmVzcG9uc2UgPSB0aGlzLnJlc3BvbnNlO1xuXHRcdHRoaXMuX3Jlc3BvbnNlVmlldyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zaG91bGRCZVJlbW92ZWRPblNlbmQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZXNwb25zZS5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl9jb2RlQmxvY2tJbmZvcykge1xuXHRcdFx0dGhpcy5fY29kZUJsb2NrSW5mb3MubGVuZ3RoID0gMDtcblx0XHR9XG5cdH1cblxuXHR0b0pTT04oKTogT21pdDxJU2VyaWFsaXphYmxlQ2hhdFJlc3BvbnNlRGF0YSwgJ3RpbWVzdGFtcCc+IHtcblx0XHRjb25zdCBtb2RlbFN0YXRlID0gdGhpcy5fbW9kZWxTdGF0ZS5nZXQoKTtcblx0XHRjb25zdCBwZW5kaW5nQ29uZmlybWF0aW9uID0gdGhpcy5pc1BlbmRpbmdDb25maXJtYXRpb24uZ2V0KCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzcG9uc2VJZDogdGhpcy5pZCxcblx0XHRcdHJlc3VsdDogdGhpcy5yZXN1bHQsXG5cdFx0XHRyZXNwb25zZU1hcmtkb3duSW5mbzogdGhpcy5jb2RlQmxvY2tJbmZvcz8ubWFwPElTZXJpYWxpemFibGVNYXJrZG93bkluZm8+KGluZm8gPT4gKHsgc3VnZ2VzdGlvbklkOiBpbmZvLnN1Z2dlc3Rpb25JZCB9KSksXG5cdFx0XHRmb2xsb3d1cHM6IHRoaXMuZm9sbG93dXBzLFxuXHRcdFx0bW9kZWxTdGF0ZTogbW9kZWxTdGF0ZS52YWx1ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcgfHwgbW9kZWxTdGF0ZS52YWx1ZSA9PT0gUmVzcG9uc2VNb2RlbFN0YXRlLk5lZWRzSW5wdXQgPyB7IHZhbHVlOiBSZXNwb25zZU1vZGVsU3RhdGUuQ2FuY2VsbGVkLCBjb21wbGV0ZWRBdDogRGF0ZS5ub3coKSB9IDogbW9kZWxTdGF0ZSxcblx0XHRcdHZvdGU6IHRoaXMudm90ZSxcblx0XHRcdHNsYXNoQ29tbWFuZDogdGhpcy5zbGFzaENvbW1hbmQsXG5cdFx0XHR1c2VkQ29udGV4dDogdGhpcy51c2VkQ29udGV4dCxcblx0XHRcdGNvbnRlbnRSZWZlcmVuY2VzOiB0aGlzLmNvbnRlbnRSZWZlcmVuY2VzLFxuXHRcdFx0Y29kZUNpdGF0aW9uczogdGhpcy5jb2RlQ2l0YXRpb25zLFxuXHRcdFx0cmVzcG9uc2VUaW1lc3RhbXA6IHRoaXMuX3RpbWVzdGFtcCxcblx0XHRcdHRpbWVTcGVudFdhaXRpbmc6IChwZW5kaW5nQ29uZmlybWF0aW9uID8gRGF0ZS5ub3coKSAtIHBlbmRpbmdDb25maXJtYXRpb24uc3RhcnRlZFdhaXRpbmdBdCA6IDApICsgdGhpcy5fdGltZVNwZW50V2FpdGluZ0FjY3VtdWxhdG9yLFxuXHRcdFx0cHJvbXB0VG9rZW5zOiB0aGlzLnVzYWdlPy5wcm9tcHRUb2tlbnMsXG5cdFx0XHRjb21wbGV0aW9uVG9rZW5zOiB0aGlzLmNvbXBsZXRpb25Ub2tlbkNvdW50LFxuXHRcdFx0b3V0cHV0QnVmZmVyOiB0aGlzLnVzYWdlPy5vdXRwdXRCdWZmZXIsXG5cdFx0XHRwcm9tcHRUb2tlbkRldGFpbHM6IHRoaXMudXNhZ2U/LnByb21wdFRva2VuRGV0YWlscyxcblx0XHRcdGNvcGlsb3RDcmVkaXRzOiB0aGlzLnVzYWdlPy5jb3BpbG90Q3JlZGl0cyxcblx0XHRcdG1vZGVsVG90YWxzOiB0aGlzLnVzYWdlPy5tb2RlbFRvdGFscyxcblx0XHRcdHNlc3Npb25Db3BpbG90Q3JlZGl0czogdGhpcy51c2FnZT8uc2Vzc2lvbkNvcGlsb3RDcmVkaXRzLFxuXHRcdFx0ZWxhcHNlZE1zOiB0aGlzLmVsYXBzZWRNcyA/PyAodGhpcy5jb21wbGV0ZWRBdCA/IE1hdGgubWF4KDAsIHRoaXMuY29tcGxldGVkQXQgLSB0aGlzLmNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wLmdldCgpKSA6IHVuZGVmaW5lZCksXG5cdFx0fSBzYXRpc2ZpZXMgV2l0aERlZmluZWRQcm9wczxPbWl0PElTZXJpYWxpemFibGVDaGF0UmVzcG9uc2VEYXRhLCAndGltZXN0YW1wJz4+O1xuXHR9XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3REaXNhYmxlbWVudCB7XG5cdHJlcXVlc3RJZDogc3RyaW5nO1xuXHRhZnRlclVuZG9TdG9wPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEluZm9ybWF0aW9uIGFib3V0IGEgY2hhdCByZXF1ZXN0IHRoYXQgbmVlZHMgdXNlciBpbnB1dCB0byBjb250aW51ZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3ROZWVkc0lucHV0SW5mbyB7XG5cdC8qKiBUaGUgY2hhdCBzZXNzaW9uIHRpdGxlICovXG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmc7XG5cdC8qKiBPcHRpb25hbCBkZXRhaWwgbWVzc2FnZSwgZS5nLiwgXCI8dG9vbG5hbWU+IG5lZWRzIGFwcHJvdmFsIHRvIHJ1bi5cIiAqL1xuXHRyZWFkb25seSBkZXRhaWw/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNb2RlbCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PElDaGF0Q2hhbmdlRXZlbnQ+O1xuXG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHQvKiogQGRlcHJlY2F0ZWQgVXNlIHtAbGluayBzZXNzaW9uUmVzb3VyY2V9IGluc3RlYWQgKi9cblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cblx0LyoqIE1pbGxpc2Vjb25kcyB0aW1lc3RhbXAgdGhpcyBjaGF0IG1vZGVsIHdhcyBjcmVhdGVkLiAqL1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0cmVhZG9ubHkgbGFzdE1lc3NhZ2VEYXRlOiBudW1iZXI7XG5cdHJlYWRvbmx5IHRpbWluZzogSUNoYXRTZXNzaW9uVGltaW5nO1xuXHRyZWFkb25seSBpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uO1xuXHRyZWFkb25seSB0aXRsZTogc3RyaW5nO1xuXHRyZWFkb25seSBoYXNDdXN0b21UaXRsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVzcG9uZGVyVXNlcm5hbWU6IHN0cmluZztcblx0LyoqIFRydWUgd2hlbmV2ZXIgYSByZXF1ZXN0IGlzIGN1cnJlbnRseSBydW5uaW5nICovXG5cdHJlYWRvbmx5IHJlcXVlc3RJblByb2dyZXNzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0LyoqIFRydWUgd2hlbmV2ZXIgdGhlIGxhc3QgcmVxdWVzdCBoYXMgbm90IHJlYWNoZWQgYSB0ZXJtaW5hbCBzdGF0ZSwgcmVnYXJkbGVzcyBvZiBpbnRlcm1lZGlhdGUgc3RhdGVzIGxpa2UgdG9vbCBjYWxscyBvciBlbGljaXRhdGlvbnMgKi9cblx0cmVhZG9ubHkgaGFzQWN0aXZlUmVxdWVzdDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdC8qKiBQcm92aWRlcyBzZXNzaW9uIGluZm9ybWF0aW9uIHdoZW4gYSByZXF1ZXN0IG5lZWRzIHVzZXIgaW50ZXJhY3Rpb24gdG8gY29udGludWUgKi9cblx0cmVhZG9ubHkgcmVxdWVzdE5lZWRzSW5wdXQ6IElPYnNlcnZhYmxlPElDaGF0UmVxdWVzdE5lZWRzSW5wdXRJbmZvIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgaXNSZWFkT25seTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGlucHV0UGxhY2Vob2xkZXI/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVkaXRpbmdTZXNzaW9uPzogSUNoYXRFZGl0aW5nU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2hlY2twb2ludDogSUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHN0YXJ0RWRpdGluZ1Nlc3Npb24oaXNHbG9iYWxFZGl0aW5nU2Vzc2lvbj86IGJvb2xlYW4sIHRyYW5zZmVyRnJvbVNlc3Npb24/OiBJQ2hhdEVkaXRpbmdTZXNzaW9uKTogdm9pZDtcblx0LyoqIElucHV0IG1vZGVsIGZvciBtYW5hZ2luZyBpbnB1dCBzdGF0ZSAqL1xuXHRyZWFkb25seSBpbnB1dE1vZGVsOiBJSW5wdXRNb2RlbDtcblx0cmVhZG9ubHkgaGFzUmVxdWVzdHM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxhc3RSZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIgdGhpcyBtb2RlbCB3aWxsIGJlIGtlcHQgYWxpdmUgd2hpbGUgaXQgaXMgcnVubmluZyBvciBoYXMgZWRpdHMgKi9cblx0cmVhZG9ubHkgd2lsbEtlZXBBbGl2ZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGFzdFJlcXVlc3RPYnM6IElPYnNlcnZhYmxlPElDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkPjtcblx0LyoqIFRvdGFsIGNvcGlsb3QgY3JlZGl0cyBjb25zdW1lZCBhY3Jvc3MgYWxsIHR1cm5zIGluIHRoaXMgc2Vzc2lvbi4gKi9cblx0cmVhZG9ubHkgc2Vzc2lvbkNvc3Q6IG51bWJlcjtcblx0Z2V0UmVxdWVzdHMoKTogSUNoYXRSZXF1ZXN0TW9kZWxbXTtcblx0c2V0Q2hlY2twb2ludChyZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0dG9FeHBvcnQoKTogSUV4cG9ydGFibGVDaGF0RGF0YTtcblx0dG9KU09OKCk6IElTZXJpYWxpemFibGVDaGF0RGF0YTtcblxuXHRyZWFkb25seSByZXBvRGF0YTogSUV4cG9ydGFibGVSZXBvRGF0YSB8IHVuZGVmaW5lZDtcblx0c2V0UmVwb0RhdGEoZGF0YTogSUV4cG9ydGFibGVSZXBvRGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFRoZSB3b3JraW5nIGRpcmVjdG9yeSBVUkkgYXNzb2NpYXRlZCB3aXRoIHRoaXMgc2Vzc2lvbi5cblx0ICogT25seSBzZXQgaW4gdGhlIHNlc3Npb25zL2FnZW50cyB3aW5kb3cgY29udGV4dC5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblx0c2V0V29ya2luZ0RpcmVjdG9yeSh1cmk6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHM6IEV2ZW50PHZvaWQ+O1xuXHRnZXRQZW5kaW5nUmVxdWVzdHMoKTogcmVhZG9ubHkgSUNoYXRQZW5kaW5nUmVxdWVzdFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVDaGF0c0RhdGEge1xuXHRbc2Vzc2lvbklkOiBzdHJpbmddOiBJU2VyaWFsaXphYmxlQ2hhdERhdGE7XG59XG5cbmV4cG9ydCB0eXBlIElTZXJpYWxpemFibGVDaGF0QWdlbnREYXRhID0gVXJpRHRvPElDaGF0QWdlbnREYXRhPjtcblxuaW50ZXJmYWNlIElTZXJpYWxpemFibGVDaGF0UmVzcG9uc2VEYXRhIHtcblx0cmVzcG9uc2VJZD86IHN0cmluZztcblx0cmVzdWx0PzogSUNoYXRBZ2VudFJlc3VsdDsgLy8gT3B0aW9uYWwgZm9yIGJhY2tjb21wYXRcblx0cmVzcG9uc2VNYXJrZG93bkluZm8/OiBJU2VyaWFsaXphYmxlTWFya2Rvd25JbmZvW107XG5cdGZvbGxvd3Vwcz86IFJlYWRvbmx5QXJyYXk8SUNoYXRGb2xsb3d1cD47XG5cdG1vZGVsU3RhdGU/OiBSZXNwb25zZU1vZGVsU3RhdGVUO1xuXHR2b3RlPzogQ2hhdEFnZW50Vm90ZURpcmVjdGlvbjtcblx0dGltZXN0YW1wPzogbnVtYmVyO1xuXHRyZXNwb25zZVRpbWVzdGFtcD86IG51bWJlcjtcblx0c2xhc2hDb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQ7XG5cdC8qKiBGb3IgYmFja3dhcmQgY29tcGF0OiBzaG91bGQgYmUgb3B0aW9uYWwgKi9cblx0dXNlZENvbnRleHQ/OiBJQ2hhdFVzZWRDb250ZXh0O1xuXHRjb250ZW50UmVmZXJlbmNlcz86IFJlYWRvbmx5QXJyYXk8SUNoYXRDb250ZW50UmVmZXJlbmNlPjtcblx0Y29kZUNpdGF0aW9ucz86IFJlYWRvbmx5QXJyYXk8SUNoYXRDb2RlQ2l0YXRpb24+O1xuXHR0aW1lU3BlbnRXYWl0aW5nPzogbnVtYmVyO1xuXHRwcm9tcHRUb2tlbnM/OiBudW1iZXI7XG5cdGNvbXBsZXRpb25Ub2tlbnM/OiBudW1iZXI7XG5cdG91dHB1dEJ1ZmZlcj86IG51bWJlcjtcblx0cHJvbXB0VG9rZW5EZXRhaWxzPzogcmVhZG9ubHkgSUNoYXRVc2FnZVByb21wdFRva2VuRGV0YWlsW107XG5cdGNvcGlsb3RDcmVkaXRzPzogbnVtYmVyO1xuXHRtb2RlbFRvdGFscz86IHJlYWRvbmx5IElDaGF0VXNhZ2VNb2RlbFRvdGFsW107XG5cdHNlc3Npb25Db3BpbG90Q3JlZGl0cz86IG51bWJlcjtcblx0ZWxhcHNlZE1zPzogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBTZXJpYWxpemVkQ2hhdFJlc3BvbnNlUGFydCA9IElNYXJrZG93blN0cmluZyB8IElDaGF0UmVzcG9uc2VQcm9ncmVzc0ZpbGVUcmVlRGF0YSB8IElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSB8IElDaGF0QWdlbnRNYXJrZG93bkNvbnRlbnRXaXRoVnVsbmVyYWJpbGl0eSB8IElDaGF0VGhpbmtpbmdQYXJ0IHwgSUNoYXRQcm9ncmVzc1Jlc3BvbnNlQ29udGVudFNlcmlhbGl6ZWQgfCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwgfCBJQ2hhdFBsYW5SZXZpZXcgfCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0O1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemFibGVDaGF0UmVxdWVzdERhdGEgZXh0ZW5kcyBJU2VyaWFsaXphYmxlQ2hhdFJlc3BvbnNlRGF0YSB7XG5cdHJlcXVlc3RJZDogc3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmcgfCBJUGFyc2VkQ2hhdFJlcXVlc3Q7IC8vIHN0cmluZyA9PiBvbGQgZm9ybWF0XG5cdC8qKiBJcyByZWFsbHkgbGlrZSBcInByb21wdCBkYXRhXCIuIFRoaXMgaXMgdGhlIG1lc3NhZ2UgaW4gdGhlIGZvcm1hdCBpbiB3aGljaCB0aGUgYWdlbnQgZ2V0cyBpdCArIHZhcmlhYmxlIHZhbHVlcy4gKi9cblx0dmFyaWFibGVEYXRhOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGE7XG5cdHJlc3BvbnNlOiBSZWFkb25seUFycmF5PFNlcmlhbGl6ZWRDaGF0UmVzcG9uc2VQYXJ0PiB8IHVuZGVmaW5lZDtcblxuXHQvKipPbGQsIHBlcnNpc3RlZCBuYW1lIGZvciBzaG91bGRCZVJlbW92ZWRPblNlbmQgKi9cblx0aXNIaWRkZW4/OiBib29sZWFuO1xuXHRoaWRkZW5Gcm9tVHJhbnNjcmlwdD86IGJvb2xlYW47XG5cdHNob3VsZEJlUmVtb3ZlZE9uU2VuZD86IElDaGF0UmVxdWVzdERpc2FibGVtZW50O1xuXHRhZ2VudD86IElTZXJpYWxpemFibGVDaGF0QWdlbnREYXRhO1xuXHQvLyByZXNwb25zZUVycm9yRGV0YWlsczogSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscyB8IHVuZGVmaW5lZDtcblx0LyoqIEBkZXByZWNhdGVkIG1vZGVsU3RhdGUgaXMgdXNlZCBpbnN0ZWFkIG5vdyAqL1xuXHRpc0NhbmNlbGVkPzogYm9vbGVhbjtcblx0dGltZXN0YW1wPzogbnVtYmVyO1xuXHRjb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdGVkaXRlZEZpbGVFdmVudHM/OiBJQ2hhdEFnZW50RWRpdGVkRmlsZUV2ZW50W107XG5cdG1vZGVsSWQ/OiBzdHJpbmc7XG5cdG1vZGVJbmZvPzogSUNoYXRSZXF1ZXN0TW9kZUluZm87XG5cdGlzU3lzdGVtSW5pdGlhdGVkPzogYm9vbGVhbjtcblx0c3lzdGVtSW5pdGlhdGVkTGFiZWw/OiBzdHJpbmc7XG5cdHRlcm1pbmFsRXhlY3V0aW9uSWQ/OiBzdHJpbmc7XG5cdG9yaWdpbj86IElTZXJpYWxpemFibGVDaGF0UmVxdWVzdE9yaWdpbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXphYmxlTWFya2Rvd25JbmZvIHtcblx0cmVhZG9ubHkgc3VnZ2VzdGlvbklkOiBFZGl0U3VnZ2VzdGlvbklkO1xufVxuXG4vKipcbiAqIFJlcG9zaXRvcnkgc3RhdGUgY2FwdHVyZWQgZm9yIGNoYXQgc2Vzc2lvbiBleHBvcnQuXG4gKiBFbmFibGVzIHJlcHJvZHVjaW5nIHRoZSB3b3Jrc3BhY2Ugc3RhdGUgYnkgY2xvbmluZywgY2hlY2tpbmcgb3V0IHRoZSBjb21taXQsIGFuZCBhcHBseWluZyBkaWZmcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRXhwb3J0YWJsZVJlcG9EYXRhIHtcblx0LyoqXG5cdCAqIENsYXNzaWZpY2F0aW9uIG9mIHRoZSB3b3Jrc3BhY2UncyB2ZXJzaW9uIGNvbnRyb2wgc3RhdGUuXG5cdCAqIC0gYHJlbW90ZS1naXRgOiBHaXQgcmVwbyB3aXRoIGEgY29uZmlndXJlZCByZW1vdGUgVVJMXG5cdCAqIC0gYGxvY2FsLWdpdGA6IEdpdCByZXBvIHdpdGhvdXQgYW55IHJlbW90ZSAobG9jYWwgb25seSlcblx0ICogLSBgcGxhaW4tZm9sZGVyYDogTm90IGEgZ2l0IHJlcG9zaXRvcnlcblx0ICovXG5cdHdvcmtzcGFjZVR5cGU6ICdyZW1vdGUtZ2l0JyB8ICdsb2NhbC1naXQnIHwgJ3BsYWluLWZvbGRlcic7XG5cblx0LyoqXG5cdCAqIFN5bmMgc3RhdHVzIGJldHdlZW4gbG9jYWwgYW5kIHJlbW90ZS5cblx0ICogLSBgc3luY2VkYDogTG9jYWwgSEVBRCBtYXRjaGVzIHJlbW90ZSB0cmFja2luZyBicmFuY2ggKGZ1bGx5IHB1c2hlZClcblx0ICogLSBgdW5wdXNoZWRgOiBMb2NhbCBoYXMgY29tbWl0cyBub3QgcHVzaGVkIHRvIHRoZSByZW1vdGUgdHJhY2tpbmcgYnJhbmNoXG5cdCAqIC0gYHVucHVibGlzaGVkYDogTG9jYWwgYnJhbmNoIGhhcyBubyByZW1vdGUgdHJhY2tpbmcgYnJhbmNoIGNvbmZpZ3VyZWRcblx0ICogLSBgbG9jYWwtb25seWA6IE5vIHJlbW90ZSBjb25maWd1cmVkIChsb2NhbCBnaXQgcmVwbyBvbmx5KVxuXHQgKiAtIGBuby1naXRgOiBOb3QgYSBnaXQgcmVwb3NpdG9yeVxuXHQgKi9cblx0c3luY1N0YXR1czogJ3N5bmNlZCcgfCAndW5wdXNoZWQnIHwgJ3VucHVibGlzaGVkJyB8ICdsb2NhbC1vbmx5JyB8ICduby1naXQnO1xuXG5cdC8qKlxuXHQgKiBSZW1vdGUgVVJMIG9mIHRoZSByZXBvc2l0b3J5IChlLmcuLCBodHRwczovL2dpdGh1Yi5jb20vb3JnL3JlcG8uZ2l0KS5cblx0ICogVW5kZWZpbmVkIGlmIG5vIHJlbW90ZSBpcyBjb25maWd1cmVkLlxuXHQgKi9cblx0cmVtb3RlVXJsPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBWZW5kb3IvaG9zdCBvZiB0aGUgcmVtb3RlIHJlcG9zaXRvcnkuXG5cdCAqIFVuZGVmaW5lZCBpZiBubyByZW1vdGUgaXMgY29uZmlndXJlZC5cblx0ICovXG5cdHJlbW90ZVZlbmRvcj86ICdnaXRodWInIHwgJ2FkbycgfCAnb3RoZXInO1xuXG5cdC8qKlxuXHQgKiBSZW1vdGUgdHJhY2tpbmcgYnJhbmNoIGZvciB0aGUgY3VycmVudCBicmFuY2ggKGUuZy4sIFwib3JpZ2luL2ZlYXR1cmUvbXktd29ya1wiKS5cblx0ICogVW5kZWZpbmVkIGlmIGJyYW5jaCBpcyB1bnB1Ymxpc2hlZCBvciBubyByZW1vdGUuXG5cdCAqL1xuXHRyZW1vdGVUcmFja2luZ0JyYW5jaD86IHN0cmluZztcblxuXHQvKipcblx0ICogRGVmYXVsdCByZW1vdGUgYnJhbmNoIHVzZWQgYXMgYmFzZSBmb3IgdW5wdWJsaXNoZWQgYnJhbmNoZXMgKGUuZy4sIFwib3JpZ2luL21haW5cIikuXG5cdCAqIEhlbHBmdWwgZm9yIGNvbXB1dGluZyBtZXJnZS1iYXNlIHdoZW4gYnJhbmNoIGhhcyBubyB0cmFja2luZy5cblx0ICovXG5cdHJlbW90ZUJhc2VCcmFuY2g/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIENvbW1pdCBoYXNoIG9mIHRoZSByZW1vdGUgdHJhY2tpbmcgYnJhbmNoIEhFQUQuXG5cdCAqIFVuZGVmaW5lZCBpZiBicmFuY2ggaGFzIG5vIHJlbW90ZSB0cmFja2luZyBicmFuY2guXG5cdCAqL1xuXHRyZW1vdGVIZWFkQ29tbWl0Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBOYW1lIG9mIHRoZSBjdXJyZW50IGxvY2FsIGJyYW5jaCAoZS5nLiwgXCJmZWF0dXJlL215LXdvcmtcIikuXG5cdCAqL1xuXHRsb2NhbEJyYW5jaD86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29tbWl0IGhhc2ggb2YgdGhlIGxvY2FsIEhFQUQgd2hlbiBjYXB0dXJlZC5cblx0ICovXG5cdGxvY2FsSGVhZENvbW1pdD86IHN0cmluZztcblxuXHQvKipcblx0ICogV29ya2luZyB0cmVlIGRpZmZzICh1bmNvbW1pdHRlZCBjaGFuZ2VzKS5cblx0ICovXG5cdGRpZmZzPzogSUV4cG9ydGFibGVSZXBvRGlmZltdO1xuXG5cdC8qKlxuXHQgKiBTdGF0dXMgb2YgdGhlIGRpZmZzIGNvbGxlY3Rpb24uXG5cdCAqIC0gYGluY2x1ZGVkYDogRGlmZnMgd2VyZSBzdWNjZXNzZnVsbHkgY2FwdHVyZWQgYW5kIGluY2x1ZGVkXG5cdCAqIC0gYHRvb01hbnlDaGFuZ2VzYDogRGlmZnMgc2tpcHBlZCBiZWNhdXNlID4xMDAgZmlsZXMgY2hhbmdlZCAoZGVnZW5lcmF0ZSBjYXNlIGxpa2UgbWFzcyByZW5hbWVzKVxuXHQgKiAtIGB0b29MYXJnZWA6IERpZmZzIHNraXBwZWQgYmVjYXVzZSB0b3RhbCBzaXplIGV4Y2VlZGVkIDkwMEtCXG5cdCAqIC0gYHRyaW1tZWRGb3JTdG9yYWdlYDogRGlmZnMgd2VyZSB0cmltbWVkIHRvIHNhdmUgc3RvcmFnZSAob2xkZXIgc2Vzc2lvbilcblx0ICogLSBgbm9DaGFuZ2VzYDogTm8gd29ya2luZyB0cmVlIGNoYW5nZXMgZGV0ZWN0ZWRcblx0ICogLSBgbm90Q2FwdHVyZWRgOiBEaWZmcyBub3QgY2FwdHVyZWQgKGRlZmF1bHQvdW5kZWZpbmVkIGNhc2UpXG5cdCAqL1xuXHRkaWZmc1N0YXR1cz86ICdpbmNsdWRlZCcgfCAndG9vTWFueUNoYW5nZXMnIHwgJ3Rvb0xhcmdlJyB8ICd0cmltbWVkRm9yU3RvcmFnZScgfCAnbm9DaGFuZ2VzJyB8ICdub3RDYXB0dXJlZCc7XG5cblx0LyoqXG5cdCAqIE51bWJlciBvZiBjaGFuZ2VkIGZpbGVzIGRldGVjdGVkLCBldmVuIGlmIGRpZmZzIHdlcmUgbm90IGluY2x1ZGVkLlxuXHQgKi9cblx0Y2hhbmdlZEZpbGVDb3VudD86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIGZpbGUgY2hhbmdlIGV4cG9ydGVkIGFzIGEgdW5pZmllZCBkaWZmIHBhdGNoIGNvbXBhdGlibGUgd2l0aCBgZ2l0IGFwcGx5YC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRXhwb3J0YWJsZVJlcG9EaWZmIHtcblx0cmVsYXRpdmVQYXRoOiBzdHJpbmc7XG5cdGNoYW5nZVR5cGU6ICdhZGRlZCcgfCAnbW9kaWZpZWQnIHwgJ2RlbGV0ZWQnIHwgJ3JlbmFtZWQnO1xuXHRvbGRSZWxhdGl2ZVBhdGg/OiBzdHJpbmc7XG5cdHVuaWZpZWREaWZmPzogc3RyaW5nO1xuXHRzdGF0dXM6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXhwb3J0YWJsZUNoYXREYXRhIHtcblx0aW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbiB8IHVuZGVmaW5lZDtcblx0cmVxdWVzdHM6IElTZXJpYWxpemFibGVDaGF0UmVxdWVzdERhdGFbXTtcblx0cmVzcG9uZGVyVXNlcm5hbWU6IHN0cmluZztcbn1cblxuLypcblx0Tk9URTogZXZlcnkgdGltZSB0aGUgc2VyaWFsaXplZCBkYXRhIGZvcm1hdCBpcyB1cGRhdGVkLCB3ZSBuZWVkIHRvIGNyZWF0ZSBhIG5ldyBpbnRlcmZhY2UsIGJlY2F1c2Ugd2UgbWF5IG5lZWQgdG8gaGFuZGxlIGFueSBvbGQgZGF0YSBmb3JtYXQgd2hlbiBwYXJzaW5nLlxuKi9cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXphYmxlQ2hhdERhdGExIGV4dGVuZHMgSUV4cG9ydGFibGVDaGF0RGF0YSB7XG5cdHNlc3Npb25JZDogc3RyaW5nO1xuXHRjcmVhdGlvbkRhdGU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXphYmxlQ2hhdERhdGEyIGV4dGVuZHMgSVNlcmlhbGl6YWJsZUNoYXREYXRhMSB7XG5cdHZlcnNpb246IDI7XG5cdGNvbXB1dGVkVGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VyaWFsaXphYmxlQ2hhdERhdGEzIGV4dGVuZHMgT21pdDxJU2VyaWFsaXphYmxlQ2hhdERhdGEyLCAndmVyc2lvbicgfCAnY29tcHV0ZWRUaXRsZSc+IHtcblx0dmVyc2lvbjogMztcblx0Y3VzdG9tVGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIgdGhlIHNlc3Npb24gaGFkIHBlbmRpbmcgZWRpdHMgd2hlbiBpdCB3YXMgc3RvcmVkLiAqL1xuXHRoYXNQZW5kaW5nRWRpdHM/OiBib29sZWFuO1xuXHQvKiogQ3VycmVudCBkcmFmdCBpbnB1dCBzdGF0ZSAoYWRkZWQgbGF0ZXIsIGZ1bGx5IGJhY2t3YXJkcyBjb21wYXRpYmxlKSAqL1xuXHRpbnB1dFN0YXRlPzogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGU7XG5cdHJlcG9EYXRhPzogSUV4cG9ydGFibGVSZXBvRGF0YTtcblx0LyoqIFBlbmRpbmcgcmVxdWVzdHMgdGhhdCB3ZXJlIHF1ZXVlZCBidXQgbm90IHlldCBwcm9jZXNzZWQgKi9cblx0cGVuZGluZ1JlcXVlc3RzPzogSVNlcmlhbGl6YWJsZVBlbmRpbmdSZXF1ZXN0RGF0YVtdO1xuXHQvKiogVGhlIHdvcmtpbmcgZGlyZWN0b3J5IFVSSSBhc3NvY2lhdGVkIHdpdGggdGhpcyBzZXNzaW9uIChzZXNzaW9ucy9hZ2VudHMgd2luZG93KS4gKi9cblx0d29ya2luZ0RpcmVjdG9yeT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBJbnB1dCBtb2RlbCBmb3IgbWFuYWdpbmcgY2hhdCBpbnB1dCBzdGF0ZSBpbmRlcGVuZGVudGx5IGZyb20gdGhlIGNoYXQgbW9kZWwuXG4gKiBUaGlzIGtlZXBzIGRpc3BsYXkgbG9naWMgc2VwYXJhdGVkIGZyb20gdGhlIGNvcmUgY2hhdCBtb2RlbC5cbiAqXG4gKiBUaGUgaW5wdXQgbW9kZWw6XG4gKiAtIE1hbmFnZXMgdGhlIGN1cnJlbnQgZHJhZnQgc3RhdGUgKHRleHQsIGF0dGFjaG1lbnRzLCBtb2RlLCBtb2RlbCBzZWxlY3Rpb24sIGN1cnNvci9zZWxlY3Rpb24pXG4gKiAtIFByb3ZpZGVzIGFuIG9ic2VydmFibGUgaW50ZXJmYWNlIGZvciByZWFjdGl2ZSBVSSB1cGRhdGVzXG4gKiAtIEF1dG9tYXRpY2FsbHkgcGVyc2lzdHMgdGhyb3VnaCB0aGUgY2hhdCBtb2RlbCdzIHNlcmlhbGl6YXRpb25cbiAqIC0gRW5hYmxlcyBiaWRpcmVjdGlvbmFsIHN5bmMgYmV0d2VlbiB0aGUgVUkgKENoYXRJbnB1dFBhcnQpIGFuZCB0aGUgbW9kZWxcbiAqIC0gVXNlcyBgdW5kZWZpbmVkYCBzdGF0ZSB0byBpbmRpY2F0ZSBubyBwZXJzaXN0ZWQgc3RhdGUgKG5ldy9lbXB0eSBjaGF0KVxuICpcbiAqIFRoaXMgYXJjaGl0ZWN0dXJlIGVuc3VyZXMgdGhhdDpcbiAqIC0gSW5wdXQgc3RhdGUgaXMgcHJlc2VydmVkIHdoZW4gbW92aW5nIGNoYXRzIGJldHdlZW4gZWRpdG9yL3NpZGViYXIvd2luZG93XG4gKiAtIE5vIG1hbnVhbCBzdGF0ZSB0cmFuc2ZlciBpcyBuZWVkZWQgd2hlbiBzd2l0Y2hpbmcgY29udGV4dHNcbiAqIC0gVGhlIFVJIHN0YXlzIGluIHN5bmMgd2l0aCB0aGUgcGVyc2lzdGVkIHN0YXRlXG4gKiAtIE5ldyBjaGF0cyB1c2UgVUkgZGVmYXVsdHMgKHBlcnNpc3RlZCBwcmVmZXJlbmNlcykgaW5zdGVhZCBvZiBoYXJkY29kZWQgdmFsdWVzXG4gKi9cbi8qKlxuICogSG9sZHMgdGhlIG1vZGVsIGEgY29udmVyc2F0aW9uIGlzIG1lYW50IHRvIHJ1biBvbi4gSW1wbGVtZW50ZWQgYnkgdGhlIGNvbnZlcnNhdGlvbidzXG4gKiB7QGxpbmsgSUlucHV0TW9kZWx9LCBhbmQgYnkgYW4gaW5wdXQgcGFydCB0aGF0IGhhcyBubyBjb252ZXJzYXRpb24gYm91bmQgdG8gc3BlYWsgZm9yLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElJbnRlbmRlZE1vZGVsSG9sZGVyIHtcblx0LyoqXG5cdCAqIFRoZSBtb2RlbCB0aGlzIGNvbnZlcnNhdGlvbiBpcyBtZWFudCB0byBydW4gb24sIHdoYXRldmVyIHRoZSBjYXRhbG9nIGNhbiBvZmZlciByaWdodCBub3cuXG5cdCAqXG5cdCAqIERpc3RpbmN0IGZyb20ge0BsaW5rIElDaGF0TW9kZWxJbnB1dFN0YXRlLnNlbGVjdGVkTW9kZWx9LCB3aGljaCBpcyBzaGFyZWQgZHJhZnQgY29udGVudDogaXQgaXNcblx0ICogc3luY2VkIHRvIHBlZXJzIGFuZCB0aGUgYWdlbnQgaG9zdCBhbmQgc2hvd3Mgd2hhdCB0aGUgY29tcG9zZXIgY3VycmVudGx5IGRpc3BsYXlzLiBUaGlzIGlzXG5cdCAqIGxvY2FsIHJlY29uY2lsaWF0aW9uIHN0YXRlIFx1MjAxNCBuZXZlciBzZXJpYWxpemVkLCBuZXZlciBzeW5jZWQgXHUyMDE0IHJlY29yZGluZyB3aGF0IHNob3VsZCBiZVxuXHQgKiBkaXNwbGF5ZWQgb25jZSB0aGUgY2F0YWxvZyBjYW4gb2ZmZXIgaXQsIGFuZCBpdCBkZWxpYmVyYXRlbHkgb3V0bGl2ZXMge0BsaW5rIElJbnB1dE1vZGVsLmNsZWFyU3RhdGV9LlxuXHQgKi9cblx0cmVhZG9ubHkgaW50ZW5kZWRNb2RlbDogSUludGVuZGVkTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cblx0LyoqIFNldHMge0BsaW5rIGludGVuZGVkTW9kZWx9LiAqL1xuXHRzZXRJbnRlbmRlZE1vZGVsKHNlbGVjdGlvbjogSUludGVuZGVkTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkO1xufVxuXG4vKiogQW4ge0BsaW5rIElJbnRlbmRlZE1vZGVsSG9sZGVyfSBmb3IgYW4gaW5wdXQgdGhhdCBoYXMgbm8gY29udmVyc2F0aW9uIHRvIHNwZWFrIGZvciBpdC4gKi9cbmV4cG9ydCBjbGFzcyBJbnRlbmRlZE1vZGVsU2xvdCBpbXBsZW1lbnRzIElJbnRlbmRlZE1vZGVsSG9sZGVyIHtcblx0aW50ZW5kZWRNb2RlbDogSUludGVuZGVkTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cblx0c2V0SW50ZW5kZWRNb2RlbChzZWxlY3Rpb246IElJbnRlbmRlZE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5pbnRlbmRlZE1vZGVsID0gc2VsZWN0aW9uO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUlucHV0TW9kZWwgZXh0ZW5kcyBJSW50ZW5kZWRNb2RlbEhvbGRlciB7XG5cdC8qKiBPYnNlcnZhYmxlIGZvciBjdXJyZW50IGlucHV0IHN0YXRlICh1bmRlZmluZWQgZm9yIG5ldy91bmluaXRpYWxpemVkIGNoYXRzKSAqL1xuXHRyZWFkb25seSBzdGF0ZTogSU9ic2VydmFibGU8SUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBVcGRhdGUgdGhlIGlucHV0IHN0YXRlIChwYXJ0aWFsIHVwZGF0ZSkgKi9cblx0c2V0U3RhdGUoc3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+KTogdm9pZDtcblxuXHQvKiogQ2xlYXIgaW5wdXQgc3RhdGUgKGFmdGVyIHNlbmRpbmcgb3IgY2xlYXJpbmcpICovXG5cdGNsZWFyU3RhdGUoKTogdm9pZDtcblxuXHQvKiogU2VyaWFsaXplcyB0aGUgc3RhdGUgKi9cblx0dG9KU09OKCk6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBDaGF0SW5wdXRTdGF0ZU9yaWdpbiB7XG5cdC8qKiBQdXNoZWQgaW4gYnkgYSBkcmFmdCBzeW5jIGZyb20gYW5vdGhlciBjbGllbnQuIE5vdCBhIGxvY2FsIHVzZXIgZWRpdC4gKi9cblx0UmVtb3RlID0gJ3JlbW90ZScsXG59XG5cbi8qKlxuICogUmVwcmVzZW50cyB0aGUgY3VycmVudCBzdGF0ZSBvZiB0aGUgY2hhdCBpbnB1dCB0aGF0IGhhc24ndCBiZWVuIHNlbnQgeWV0LlxuICogVGhpcyBpcyB0aGUgXCJkcmFmdFwiIHN0YXRlIHRoYXQgc2hvdWxkIGJlIHByZXNlcnZlZCBhY3Jvc3Mgc2Vzc2lvbnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNb2RlbElucHV0U3RhdGUge1xuXHQvKiogQ3VycmVudCBhdHRhY2htZW50cyBpbiB0aGUgaW5wdXQgKi9cblx0YXR0YWNobWVudHM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTtcblxuXHQvKiogQ3VycmVudGx5IHNlbGVjdGVkIGNoYXQgbW9kZSAqL1xuXHRtb2RlOiB7XG5cdFx0LyoqIE1vZGUgSUQgKGUuZy4sICdhc2snLCAnZWRpdCcsICdhZ2VudCcsIG9yIGN1c3RvbSBtb2RlIElEKSAqL1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0LyoqIE1vZGUga2luZCBmb3IgYnVpbHRpbiBtb2RlcyAqL1xuXHRcdGtpbmQ6IENoYXRNb2RlS2luZCB8IHVuZGVmaW5lZDtcblx0fTtcblxuXHQvKipcblx0ICogQ3VycmVudGx5IHNlbGVjdGVkIGxhbmd1YWdlIG1vZGVsLCBpZiBhbnkuIFNoYXJlZCBkcmFmdCBjb250ZW50OiBzeW5jZWQgdG8gcGVlcnMgYW5kIHRoZVxuXHQgKiBhZ2VudCBob3N0LiBTZWUge0BsaW5rIElJbnRlbmRlZE1vZGVsSG9sZGVyLmludGVuZGVkTW9kZWx9IGZvciB0aGUgbW9kZWwgdGhpcyBjb252ZXJzYXRpb24gaXNcblx0ICogbWVhbnQgdG8gcnVuIG9uLCB3aGljaCBtYXkgZGlmZmVyIHdoaWxlIHRoZSBjYXRhbG9nIGNhbm5vdCBvZmZlciBpdC5cblx0ICovXG5cdHNlbGVjdGVkTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQ29uZmlndXJhdGlvbiAoZS5nLiBjb250ZXh0IHNpemUsIHRoaW5raW5nIGVmZm9ydCkgZm9yIHRoZSBzZWxlY3RlZFxuXHQgKiBtb2RlbCwgY2FwdHVyZWQgc28gaXQgY2FuIGJlIHJlc3RvcmVkIGFsb25nc2lkZSB0aGUgbW9kZWwgd2hlbiB0aGVcblx0ICogc2Vzc2lvbiBpcyByZW9wZW5lZC5cblx0ICovXG5cdG1vZGVsQ29uZmlndXJhdGlvbj86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xuXG5cdC8qKiBDdXJyZW50IGlucHV0IHRleHQgKi9cblx0aW5wdXRUZXh0OiBzdHJpbmc7XG5cblx0LyoqIEN1cnJlbnQgc2VsZWN0aW9uIHJhbmdlcyAqL1xuXHRzZWxlY3Rpb25zOiBJU2VsZWN0aW9uW107XG5cblx0LyoqIEN1cnJlbnQgcGVybWlzc2lvbiBsZXZlbCBmb3IgdG9vbCBhdXRvLWFwcHJvdmFsICovXG5cdHBlcm1pc3Npb25MZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWw7XG5cblx0LyoqXG5cdCAqIFdoZXJlIHRoaXMgc3RhdGUgY2FtZSBmcm9tLCB3aGVuIGl0IHdhcyBub3QgYXV0aG9yZWQgYnkgdGhlIGxvY2FsIHVzZXIuXG5cdCAqIEFic2VudCBtZWFucyBhIGxvY2FsIHVzZXIgZWRpdC4gTGV0cyBjb25zdW1lcnMgdGhhdCBzeW5jIGlucHV0IHN0YXRlXG5cdCAqIGVsc2V3aGVyZSByZWNvZ25pemUgdGhlaXIgb3duIHdyaXRlcyBpbnN0ZWFkIG9mIHRyZWF0aW5nIHRoZW0gYXMgZWRpdHMuXG5cdCAqL1xuXHRvcmlnaW4/OiBDaGF0SW5wdXRTdGF0ZU9yaWdpbjtcblxuXHQvKiogQ29udHJpYnV0ZWQgc3RvcmVkIHN0YXRlICovXG5cdGNvbnRyaWI6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xufVxuXG4vKipcbiAqIFNlcmlhbGl6YWJsZSB2ZXJzaW9uIG9mIElDaGF0TW9kZWxJbnB1dFN0YXRlXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUge1xuXHRhdHRhY2htZW50czogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xuXHRtb2RlOiB7XG5cdFx0aWQ6IHN0cmluZztcblx0XHRraW5kOiBDaGF0TW9kZUtpbmQgfCB1bmRlZmluZWQ7XG5cdH07XG5cdHNlbGVjdGVkTW9kZWw6IHtcblx0XHRpZGVudGlmaWVyOiBzdHJpbmc7XG5cdFx0bWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhO1xuXHRcdC8qKlxuXHRcdCAqIENvbmZpZ3VyYXRpb24gKGUuZy4gY29udGV4dCBzaXplLCB0aGlua2luZyBlZmZvcnQpIGZvciB0aGUgc2VsZWN0ZWRcblx0XHQgKiBtb2RlbCwgY2FwdHVyZWQgc28gaXQgY2FuIGJlIHJlc3RvcmVkIGFsb25nc2lkZSB0aGUgbW9kZWwgd2hlbiB0aGVcblx0XHQgKiBzZXNzaW9uIGlzIHJlb3BlbmVkLlxuXHRcdCAqL1xuXHRcdG1vZGVsQ29uZmlndXJhdGlvbj86IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+O1xuXHR9IHwgdW5kZWZpbmVkO1xuXHRpbnB1dFRleHQ6IHN0cmluZztcblx0c2VsZWN0aW9uczogSVNlbGVjdGlvbltdO1xuXHRwZXJtaXNzaW9uTGV2ZWw/OiBDaGF0UGVybWlzc2lvbkxldmVsO1xuXHRjb250cmliOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbn1cblxuLyoqXG4gKiBMZWdhY3kgc2hhcGUgb2Yge0BsaW5rIElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlfSBhcyBwZXJzaXN0ZWQgYnkgb2xkZXJcbiAqIHZlcnNpb25zLCB3aGVyZSB0aGUgc2VsZWN0ZWQgbW9kZWwncyBjb25maWd1cmF0aW9uIHdhcyBzdG9yZWQgYXMgYSBzaWJsaW5nXG4gKiBgbW9kZWxDb25maWd1cmF0aW9uYCBmaWVsZCBpbnN0ZWFkIG9mIG5lc3RlZCBpbnNpZGUgYHNlbGVjdGVkTW9kZWxgLiBSZXRhaW5lZFxuICogc28gc2Vzc2lvbnMgc2VyaWFsaXplZCBpbiB0aGUgb2xkIGZvcm1hdCBjYW4gc3RpbGwgYmUgcmVhZC5cbiAqL1xuaW50ZXJmYWNlIElMZWdhY3lTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlIGV4dGVuZHMgSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUge1xuXHRtb2RlbENvbmZpZ3VyYXRpb24/OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPjtcbn1cblxuLyoqXG4gKiBSZXZpdmVzIHBlcnNpc3RlZCBvciB0cmFuc2ZlcnJlZCBpbnB1dCBzdGF0ZSBpbnRvIGl0cyBsaXZlIHNoYXBlLCBpbmNsdWRpbmcgdGhlIGxlZ2FjeSBtb2RlbCBjb25maWd1cmF0aW9uIGZhbGxiYWNrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmV2aXZlU2VyaWFsaXphYmxlSW5wdXRTdGF0ZShzdGF0ZTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUpOiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0YXR0YWNobWVudHM6IChzdGF0ZS5hdHRhY2htZW50cyA/PyBbXSkubWFwKElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkuZnJvbUV4cG9ydCksXG5cdFx0bW9kZTogc3RhdGUubW9kZSxcblx0XHRzZWxlY3RlZE1vZGVsOiBzdGF0ZS5zZWxlY3RlZE1vZGVsICYmIHtcblx0XHRcdGlkZW50aWZpZXI6IHN0YXRlLnNlbGVjdGVkTW9kZWwuaWRlbnRpZmllcixcblx0XHRcdG1ldGFkYXRhOiBzdGF0ZS5zZWxlY3RlZE1vZGVsLm1ldGFkYXRhXG5cdFx0fSxcblx0XHRtb2RlbENvbmZpZ3VyYXRpb246IHN0YXRlLnNlbGVjdGVkTW9kZWwgPyAoc3RhdGUuc2VsZWN0ZWRNb2RlbC5tb2RlbENvbmZpZ3VyYXRpb24gPz8gKHN0YXRlIGFzIElMZWdhY3lTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlKS5tb2RlbENvbmZpZ3VyYXRpb24pIDogdW5kZWZpbmVkLFxuXHRcdGNvbnRyaWI6IHN0YXRlLmNvbnRyaWIsXG5cdFx0aW5wdXRUZXh0OiBzdGF0ZS5pbnB1dFRleHQsXG5cdFx0c2VsZWN0aW9uczogc3RhdGUuc2VsZWN0aW9ucyxcblx0XHRwZXJtaXNzaW9uTGV2ZWw6IHN0YXRlLnBlcm1pc3Npb25MZXZlbCxcblx0fTtcbn1cblxuLyoqXG4qIENoYXQgZGF0YSB0aGF0IGhhcyBiZWVuIHBhcnNlZCBhbmQgbm9ybWFsaXplZCB0byB0aGUgY3VycmVudCBmb3JtYXQuXG4qL1xuZXhwb3J0IHR5cGUgSVNlcmlhbGl6YWJsZUNoYXREYXRhID0gSVNlcmlhbGl6YWJsZUNoYXREYXRhMztcblxuZXhwb3J0IHR5cGUgSUNoYXREYXRhU2VyaWFsaXplckxvZyA9IE9iamVjdE11dGF0aW9uTG9nPElDaGF0TW9kZWwsIElTZXJpYWxpemFibGVDaGF0RGF0YT47XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRDaGF0RGF0YVJlZmVyZW5jZSB7XG5cdHZhbHVlOiBJU2VyaWFsaXphYmxlQ2hhdERhdGEgfCBJRXhwb3J0YWJsZUNoYXREYXRhO1xuXHRzZXJpYWxpemVyOiBJQ2hhdERhdGFTZXJpYWxpemVyTG9nO1xufVxuXG4vKipcbiAqIENoYXQgZGF0YSB0aGF0IGhhcyBiZWVuIGxvYWRlZCBidXQgbm90IG5vcm1hbGl6ZWQsIGFuZCBjb3VsZCBiZSBhbnkgZm9ybWF0XG4gKi9cbmV4cG9ydCB0eXBlIElTZXJpYWxpemFibGVDaGF0RGF0YUluID0gSVNlcmlhbGl6YWJsZUNoYXREYXRhMSB8IElTZXJpYWxpemFibGVDaGF0RGF0YTIgfCBJU2VyaWFsaXphYmxlQ2hhdERhdGEzO1xuXG4vKipcbiAqIE5vcm1hbGl6ZSBjaGF0IGRhdGEgZnJvbSBzdG9yYWdlIHRvIHRoZSBjdXJyZW50IGZvcm1hdC5cbiAqIFRPRE8tIENoYXRNb2RlbCNfZGVzZXJpYWxpemUgYW5kIHJldml2ZVNlcmlhbGl6ZWRBZ2VudCBhbHNvIHN0aWxsIGRvIHNvbWUgbm9ybWFsaXphdGlvbiBhbmQgbWF5YmUgdGhhdCBzaG91bGQgYmUgZG9uZSBpbiBoZXJlIHRvby5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZVNlcmlhbGl6YWJsZUNoYXREYXRhKHJhdzogSVNlcmlhbGl6YWJsZUNoYXREYXRhSW4pOiBJU2VyaWFsaXphYmxlQ2hhdERhdGEge1xuXHRub3JtYWxpemVPbGRGaWVsZHMocmF3KTtcblxuXHRpZiAoISgndmVyc2lvbicgaW4gcmF3KSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0Li4ucmF3LFxuXHRcdFx0Y3VzdG9tVGl0bGU6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0aWYgKHJhdy52ZXJzaW9uID09PSAyKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnJhdyxcblx0XHRcdHZlcnNpb246IDMsXG5cdFx0XHRjdXN0b21UaXRsZTogcmF3LmNvbXB1dGVkVGl0bGVcblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIHJhdztcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplT2xkRmllbGRzKHJhdzogSVNlcmlhbGl6YWJsZUNoYXREYXRhSW4pOiB2b2lkIHtcblx0Ly8gRmlsbCBpbiBmaWVsZHMgdGhhdCB2ZXJ5IG9sZCBjaGF0IGRhdGEgbWF5IGJlIG1pc3Npbmdcblx0aWYgKCFyYXcuc2Vzc2lvbklkKSB7XG5cdFx0cmF3LnNlc3Npb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHR9XG5cblx0aWYgKCFyYXcuY3JlYXRpb25EYXRlKSB7XG5cdFx0cmF3LmNyZWF0aW9uRGF0ZSA9IGdldExhc3RZZWFyRGF0ZSgpO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnksIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdGlmICgocmF3LmluaXRpYWxMb2NhdGlvbiBhcyBhbnkpID09PSAnZWRpdGluZy1zZXNzaW9uJykge1xuXHRcdHJhdy5pbml0aWFsTG9jYXRpb24gPSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldExhc3RZZWFyRGF0ZSgpOiBudW1iZXIge1xuXHRjb25zdCBsYXN0WWVhckRhdGUgPSBuZXcgRGF0ZSgpO1xuXHRsYXN0WWVhckRhdGUuc2V0RnVsbFllYXIobGFzdFllYXJEYXRlLmdldEZ1bGxZZWFyKCkgLSAxKTtcblx0cmV0dXJuIGxhc3RZZWFyRGF0ZS5nZXRUaW1lKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0V4cG9ydGFibGVTZXNzaW9uRGF0YShvYmo6IHVua25vd24pOiBvYmogaXMgSUV4cG9ydGFibGVDaGF0RGF0YSB7XG5cdHJldHVybiAhIW9iaiAmJlxuXHRcdEFycmF5LmlzQXJyYXkoKG9iaiBhcyBJRXhwb3J0YWJsZUNoYXREYXRhKS5yZXF1ZXN0cykgJiZcblx0XHR0eXBlb2YgKG9iaiBhcyBJRXhwb3J0YWJsZUNoYXREYXRhKS5yZXNwb25kZXJVc2VybmFtZSA9PT0gJ3N0cmluZyc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0RXhwb3J0YWJsZVNlc3Npb25EYXRhKGRhdGE6IElFeHBvcnRhYmxlQ2hhdERhdGEpOiBJRXhwb3J0YWJsZUNoYXREYXRhIHtcblx0cmV0dXJuIHtcblx0XHRpbml0aWFsTG9jYXRpb246IGRhdGEuaW5pdGlhbExvY2F0aW9uLFxuXHRcdHJlcXVlc3RzOiBkYXRhLnJlcXVlc3RzLFxuXHRcdHJlc3BvbmRlclVzZXJuYW1lOiBkYXRhLnJlc3BvbmRlclVzZXJuYW1lLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTZXJpYWxpemFibGVTZXNzaW9uRGF0YShvYmo6IHVua25vd24pOiBvYmogaXMgSVNlcmlhbGl6YWJsZUNoYXREYXRhIHtcblx0Y29uc3QgZGF0YSA9IG9iaiBhcyBJU2VyaWFsaXphYmxlQ2hhdERhdGE7XG5cdHJldHVybiBpc0V4cG9ydGFibGVTZXNzaW9uRGF0YShvYmopICYmXG5cdFx0dHlwZW9mIGRhdGEuY3JlYXRpb25EYXRlID09PSAnbnVtYmVyJyAmJlxuXHRcdHR5cGVvZiBkYXRhLnNlc3Npb25JZCA9PT0gJ3N0cmluZycgJiZcblx0XHRvYmoucmVxdWVzdHMuZXZlcnkoKHJlcXVlc3Q6IElTZXJpYWxpemFibGVDaGF0UmVxdWVzdERhdGEpID0+XG5cdFx0XHQhcmVxdWVzdC51c2VkQ29udGV4dCAvKiBmb3IgYmFja3dhcmQgY29tcGF0IGFsbG93IG1pc3NpbmcgdXNlZENvbnRleHQgKi8gfHwgaXNJVXNlZENvbnRleHQocmVxdWVzdC51c2VkQ29udGV4dClcblx0XHQpO1xufVxuXG5leHBvcnQgdHlwZSBJQ2hhdENoYW5nZUV2ZW50ID1cblx0fCBJQ2hhdEluaXRFdmVudFxuXHR8IElDaGF0QWRkUmVxdWVzdEV2ZW50IHwgSUNoYXRDaGFuZ2VkUmVxdWVzdEV2ZW50IHwgSUNoYXRSZW1vdmVSZXF1ZXN0RXZlbnRcblx0fCBJQ2hhdEFkZFJlc3BvbnNlRXZlbnRcblx0fCBJQ2hhdFNldEFnZW50RXZlbnRcblx0fCBJQ2hhdE1vdmVFdmVudFxuXHR8IElDaGF0U2V0SGlkZGVuRXZlbnRcblx0fCBJQ2hhdENvbXBsZXRlZFJlcXVlc3RFdmVudFxuXHR8IElDaGF0U2V0Q3VzdG9tVGl0bGVFdmVudFxuXHQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRBZGRSZXF1ZXN0RXZlbnQge1xuXHRraW5kOiAnYWRkUmVxdWVzdCc7XG5cdHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q2hhbmdlZFJlcXVlc3RFdmVudCB7XG5cdGtpbmQ6ICdjaGFuZ2VkUmVxdWVzdCc7XG5cdHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29tcGxldGVkUmVxdWVzdEV2ZW50IHtcblx0a2luZDogJ2NvbXBsZXRlZFJlcXVlc3QnO1xuXHRyZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEFkZFJlc3BvbnNlRXZlbnQge1xuXHRraW5kOiAnYWRkUmVzcG9uc2UnO1xuXHRyZXNwb25zZTogSUNoYXRSZXNwb25zZU1vZGVsO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBDaGF0UmVxdWVzdFJlbW92YWxSZWFzb24ge1xuXHQvKipcblx0ICogXCJOb3JtYWxcIiByZW1vdmVcblx0ICovXG5cdFJlbW92YWwsXG5cblx0LyoqXG5cdCAqIFJlbW92ZWQgYmVjYXVzZSB0aGUgcmVxdWVzdCB3aWxsIGJlIHJlc2VudFxuXHQgKi9cblx0UmVzZW5kLFxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgYmVjYXVzZSB0aGUgcmVxdWVzdCBpcyBtb3ZpbmcgdG8gYW5vdGhlciBtb2RlbFxuXHQgKi9cblx0QWRvcHRpb25cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlbW92ZVJlcXVlc3RFdmVudCB7XG5cdGtpbmQ6ICdyZW1vdmVSZXF1ZXN0Jztcblx0cmVxdWVzdElkOiBzdHJpbmc7XG5cdHJlc3BvbnNlSWQ/OiBzdHJpbmc7XG5cdHJlYXNvbjogQ2hhdFJlcXVlc3RSZW1vdmFsUmVhc29uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2V0SGlkZGVuRXZlbnQge1xuXHRraW5kOiAnc2V0SGlkZGVuJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1vdmVFdmVudCB7XG5cdGtpbmQ6ICdtb3ZlJztcblx0dGFyZ2V0OiBVUkk7XG5cdHJhbmdlOiBJUmFuZ2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRTZXRBZ2VudEV2ZW50IHtcblx0a2luZDogJ3NldEFnZW50Jztcblx0YWdlbnQ6IElDaGF0QWdlbnREYXRhO1xuXHRjb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRTZXRDdXN0b21UaXRsZUV2ZW50IHtcblx0a2luZDogJ3NldEN1c3RvbVRpdGxlJztcblx0dGl0bGU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEluaXRFdmVudCB7XG5cdGtpbmQ6ICdpbml0aWFsaXplJztcbn1cblxuLyoqXG4gKiBJbnRlcm5hbCBpbXBsZW1lbnRhdGlvbiBvZiBJSW5wdXRNb2RlbFxuICovXG5jbGFzcyBJbnB1dE1vZGVsIGltcGxlbWVudHMgSUlucHV0TW9kZWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPElDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IHN0YXRlOiBJT2JzZXJ2YWJsZTxJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZD47XG5cblx0LyoqXG5cdCAqIFN1cnZpdmVzIHtAbGluayBjbGVhclN0YXRlfTogc2VuZGluZyBhIG1lc3NhZ2Ugb3IgY2xlYXJpbmcgdGhlIGRyYWZ0IHNheXMgbm90aGluZyBhYm91dCB3aGljaFxuXHQgKiBtb2RlbCB0aGUgY29udmVyc2F0aW9uIGlzIG1lYW50IHRvIHJ1biBvbi5cblx0ICovXG5cdHByaXZhdGUgX2ludGVuZGVkTW9kZWw6IElJbnRlbmRlZE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGluaXRpYWxTdGF0ZTogSUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQsIHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyOiBJTG9nU2VydmljZSwgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uSWQ6IHN0cmluZykge1xuXHRcdHRoaXMuX3N0YXRlID0gb2JzZXJ2YWJsZVZhbHVlT3B0cyh7IGRlYnVnTmFtZTogJ2lucHV0TW9kZWxTdGF0ZScsIGVxdWFsc0ZuOiBlcXVhbHMgfSwgaW5pdGlhbFN0YXRlKTtcblx0XHR0aGlzLnN0YXRlID0gdGhpcy5fc3RhdGU7XG5cdH1cblxuXHRnZXQgaW50ZW5kZWRNb2RlbCgpOiBJSW50ZW5kZWRNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ludGVuZGVkTW9kZWw7XG5cdH1cblxuXHRzZXRJbnRlbmRlZE1vZGVsKHNlbGVjdGlvbjogSUludGVuZGVkTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnRlbmRlZE1vZGVsID0gc2VsZWN0aW9uO1xuXHR9XG5cblx0c2V0U3RhdGUoc3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+KTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdF9sb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHN0YXRlLCBjdXJyZW50LCB0aGlzLmxvZ2dlciwgdGhpcy5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHQvLyBJZiBjdXJyZW50IGlzIHVuZGVmaW5lZCwgcHJvdmlkZSBkZWZhdWx0cyBmb3IgcmVxdWlyZWQgZmllbGRzXG5cdFx0XHRhdHRhY2htZW50czogW10sXG5cdFx0XHRtb2RlOiB7IGlkOiAnYWdlbnQnLCBraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQgfSxcblx0XHRcdHNlbGVjdGVkTW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdGlucHV0VGV4dDogJycsXG5cdFx0XHRzZWxlY3Rpb25zOiBbXSxcblx0XHRcdGNvbnRyaWI6IHt9LFxuXHRcdFx0Li4uY3VycmVudCxcblx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0b3JpZ2luOiBzdGF0ZS5vcmlnaW5cblx0XHR9LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Y2xlYXJTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZS5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0dG9KU09OKCk6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBGaWx0ZXIgb3V0IGV4dGVuc2lvbi1jb250cmlidXRlZCBjb250ZXh0IGl0ZW1zIChraW5kOiAnc3RyaW5nJyBvciBpbXBsaWNpdCBlbnRyaWVzIHdpdGggU3RyaW5nQ2hhdENvbnRleHRWYWx1ZSlcblx0XHQvLyBUaGVzZSBoYXZlIGhhbmRsZXMgdGhhdCBiZWNvbWUgaW52YWxpZCBhZnRlciB3aW5kb3cgcmVsb2FkIGFuZCBjYW5ub3QgYmUgcHJvcGVybHkgcmVzdG9yZWQuXG5cdFx0Y29uc3QgcGVyc2lzdGFibGVBdHRhY2htZW50cyA9IHZhbHVlLmF0dGFjaG1lbnRzLmZpbHRlcihhdHRhY2htZW50ID0+IHtcblx0XHRcdGlmIChpc1N0cmluZ1ZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzSW1wbGljaXRWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpICYmIGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUoYXR0YWNobWVudC52YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udHJpYjogdmFsdWUuY29udHJpYixcblx0XHRcdGF0dGFjaG1lbnRzOiBwZXJzaXN0YWJsZUF0dGFjaG1lbnRzLm1hcChJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LnRvRXhwb3J0KSxcblx0XHRcdG1vZGU6IHZhbHVlLm1vZGUsXG5cdFx0XHRzZWxlY3RlZE1vZGVsOiB2YWx1ZS5zZWxlY3RlZE1vZGVsID8ge1xuXHRcdFx0XHRpZGVudGlmaWVyOiB2YWx1ZS5zZWxlY3RlZE1vZGVsLmlkZW50aWZpZXIsXG5cdFx0XHRcdG1ldGFkYXRhOiB2YWx1ZS5zZWxlY3RlZE1vZGVsLm1ldGFkYXRhLFxuXHRcdFx0XHRtb2RlbENvbmZpZ3VyYXRpb246IHZhbHVlLm1vZGVsQ29uZmlndXJhdGlvblxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdGlucHV0VGV4dDogdmFsdWUuaW5wdXRUZXh0LFxuXHRcdFx0c2VsZWN0aW9uczogdmFsdWUuc2VsZWN0aW9ucyxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogdmFsdWUucGVybWlzc2lvbkxldmVsLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdE1vZGVsIHtcblx0c3RhdGljIGdldERlZmF1bHRUaXRsZShyZXF1ZXN0czogKElTZXJpYWxpemFibGVDaGF0UmVxdWVzdERhdGEgfCBJQ2hhdFJlcXVlc3RNb2RlbClbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZmlyc3RSZXF1ZXN0TWVzc2FnZSA9IHJlcXVlc3RzLmF0KDApPy5tZXNzYWdlID8/ICcnO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSB0eXBlb2YgZmlyc3RSZXF1ZXN0TWVzc2FnZSA9PT0gJ3N0cmluZycgP1xuXHRcdFx0Zmlyc3RSZXF1ZXN0TWVzc2FnZSA6XG5cdFx0XHRmaXJzdFJlcXVlc3RNZXNzYWdlLnRleHQ7XG5cdFx0cmV0dXJuIG1lc3NhZ2Uuc3BsaXQoJ1xcbicpWzBdLnN1YnN0cmluZygwLCAyMDApO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZSA9IHRoaXMuX29uRGlkRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0Q2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdSZXF1ZXN0czogSUNoYXRQZW5kaW5nUmVxdWVzdFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzID0gdGhpcy5fb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfcmVxdWVzdHM6IENoYXRSZXF1ZXN0TW9kZWxbXTtcblxuXHRwcml2YXRlIF9yZXBvRGF0YTogSUV4cG9ydGFibGVSZXBvRGF0YSB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCByZXBvRGF0YSgpOiBJRXhwb3J0YWJsZVJlcG9EYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVwb0RhdGE7XG5cdH1cblx0cHVibGljIHNldFJlcG9EYXRhKGRhdGE6IElFeHBvcnRhYmxlUmVwb0RhdGEgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXBvRGF0YSA9IGRhdGE7XG5cdH1cblxuXHRwcml2YXRlIF93b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgd29ya2luZ0RpcmVjdG9yeSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3JraW5nRGlyZWN0b3J5O1xuXHR9XG5cdHB1YmxpYyBzZXRXb3JraW5nRGlyZWN0b3J5KHVyaTogVVJJIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya2luZ0RpcmVjdG9yeSA9IHVyaTtcblx0fVxuXG5cdGdldFBlbmRpbmdSZXF1ZXN0cygpOiByZWFkb25seSBJQ2hhdFBlbmRpbmdSZXF1ZXN0W10ge1xuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nUmVxdWVzdHM7XG5cdH1cblxuXHRzZXRQZW5kaW5nUmVxdWVzdHMocmVxdWVzdHM6IHJlYWRvbmx5IHsgcmVxdWVzdElkOiBzdHJpbmc7IGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kIH1bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4aXN0aW5nTWFwID0gbmV3IE1hcCh0aGlzLl9wZW5kaW5nUmVxdWVzdHMubWFwKHAgPT4gW3AucmVxdWVzdC5pZCwgcF0pKTtcblx0XHRjb25zdCBuZXdQZW5kaW5nOiBJQ2hhdFBlbmRpbmdSZXF1ZXN0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHsgcmVxdWVzdElkLCBraW5kIH0gb2YgcmVxdWVzdHMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gZXhpc3RpbmdNYXAuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0Ly8gVXBkYXRlIGtpbmQgaWYgY2hhbmdlZCwga2VlcCBleGlzdGluZyByZXF1ZXN0IGFuZCBzZW5kT3B0aW9uc1xuXHRcdFx0XHRuZXdQZW5kaW5nLnB1c2goZXhpc3Rpbmcua2luZCA9PT0ga2luZCA/IGV4aXN0aW5nIDogeyByZXF1ZXN0OiBleGlzdGluZy5yZXF1ZXN0LCBraW5kLCBzZW5kT3B0aW9uczogZXhpc3Rpbmcuc2VuZE9wdGlvbnMgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5wdXNoKC4uLm5ld1BlbmRpbmcpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzLmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW50ZXJuYWwgVXNlZCBieSBDaGF0U2VydmljZSB0byBhdG9taWNhbGx5IHJlcGxhY2UgdGhlIHBlbmRpbmcgcmVxdWVzdCBxdWV1ZS5cblx0ICovXG5cdHJlcGxhY2VQZW5kaW5nUmVxdWVzdHMocmVxdWVzdHM6IHJlYWRvbmx5IElDaGF0UGVuZGluZ1JlcXVlc3RbXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nUmVxdWVzdHMubGVuZ3RoID09PSByZXF1ZXN0cy5sZW5ndGggJiYgcmVxdWVzdHMuZXZlcnkoKHJlcXVlc3QsIGluZGV4KSA9PiB0aGlzLl9wZW5kaW5nUmVxdWVzdHNbaW5kZXhdID09PSByZXF1ZXN0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMucHVzaCguLi5yZXF1ZXN0cyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMuZmlyZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbnRlcm5hbCBVc2VkIGJ5IENoYXRTZXJ2aWNlIHRvIGFkZCBhIHJlcXVlc3QgdG8gdGhlIHF1ZXVlLlxuXHQgKiBTdGVlcmluZyBtZXNzYWdlcyBhcmUgcGxhY2VkIGJlZm9yZSBxdWV1ZWQgbWVzc2FnZXMuXG5cdCAqL1xuXHRhZGRQZW5kaW5nUmVxdWVzdChyZXF1ZXN0OiBDaGF0UmVxdWVzdE1vZGVsLCBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZCwgc2VuZE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zKTogSUNoYXRQZW5kaW5nUmVxdWVzdCB7XG5cdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3Q6IElDaGF0UGVuZGluZ1JlcXVlc3QgPSB7XG5cdFx0XHRyZXF1ZXN0LFxuXHRcdFx0a2luZCxcblx0XHRcdHNlbmRPcHRpb25zLFxuXHRcdH07XG5cblx0XHRpZiAoa2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpIHtcblx0XHRcdC8vIEluc2VydCBhZnRlciB0aGUgbGFzdCBzdGVlcmluZyBtZXNzYWdlLCBvciBhdCB0aGUgYmVnaW5uaW5nIGlmIHRoZXJlIGlzIG5vbmVcblx0XHRcdGxldCBpbnNlcnRJbmRleCA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAodGhpcy5fcGVuZGluZ1JlcXVlc3RzW2ldLmtpbmQgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKSB7XG5cdFx0XHRcdFx0aW5zZXJ0SW5kZXggPSBpICsgMTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnNwbGljZShpbnNlcnRJbmRleCwgMCwgcGVuZGluZ1JlcXVlc3QpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBRdWV1ZWQgbWVzc2FnZXMgYWx3YXlzIGdvIGF0IHRoZSBlbmRcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5wdXNoKHBlbmRpbmdSZXF1ZXN0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cy5maXJlKCk7XG5cdFx0cmV0dXJuIHBlbmRpbmdSZXF1ZXN0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbnRlcm5hbCBVc2VkIGJ5IENoYXRTZXJ2aWNlIHRvIHJlbW92ZSBhIHBlbmRpbmcgcmVxdWVzdFxuXHQgKi9cblx0cmVtb3ZlUGVuZGluZ1JlcXVlc3QoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmZpbmRJbmRleChyID0+IHIucmVxdWVzdC5pZCA9PT0gaWQpO1xuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAaW50ZXJuYWwgVXNlZCBieSBDaGF0U2VydmljZSB0byBkZXF1ZXVlIHRoZSBuZXh0IHBlbmRpbmcgcmVxdWVzdFxuXHQgKi9cblx0ZGVxdWV1ZVBlbmRpbmdSZXF1ZXN0KCk6IElDaGF0UGVuZGluZ1JlcXVlc3QgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuc2hpZnQoKTtcblx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMuZmlyZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVxdWVzdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBAaW50ZXJuYWwgVXNlZCBieSBDaGF0U2VydmljZSB0byBkZXF1ZXVlIGFsbCBjb25zZWN1dGl2ZSBzdGVlcmluZyByZXF1ZXN0cyBhdCB0aGUgZnJvbnQgb2YgdGhlIHF1ZXVlLlxuXHQgKiBSZXR1cm5zIGFuIGVtcHR5IGFycmF5IGlmIHRoZSBmaXJzdCBwZW5kaW5nIHJlcXVlc3QgaXMgbm90IGEgc3RlZXJpbmcgcmVxdWVzdC5cblx0ICovXG5cdGRlcXVldWVBbGxTdGVlcmluZ1JlcXVlc3RzKCk6IElDaGF0UGVuZGluZ1JlcXVlc3RbXSB7XG5cdFx0Y29uc3Qgc3RlZXJpbmdSZXF1ZXN0czogSUNoYXRQZW5kaW5nUmVxdWVzdFtdID0gW107XG5cdFx0d2hpbGUgKHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5hdCgwKT8ua2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpIHtcblx0XHRcdHN0ZWVyaW5nUmVxdWVzdHMucHVzaCh0aGlzLl9wZW5kaW5nUmVxdWVzdHMuc2hpZnQoKSEpO1xuXHRcdH1cblx0XHRpZiAoc3RlZXJpbmdSZXF1ZXN0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVBlbmRpbmdSZXF1ZXN0cy5maXJlKCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdGVlcmluZ1JlcXVlc3RzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbnRlcm5hbCBVc2VkIGJ5IENoYXRTZXJ2aWNlIHRvIGNsZWFyIGFsbCBwZW5kaW5nIHJlcXVlc3RzXG5cdCAqL1xuXHRjbGVhclBlbmRpbmdSZXF1ZXN0cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ1JlcXVlc3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5sZW5ndGggPSAwO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHJlYWRvbmx5IGxhc3RSZXF1ZXN0T2JzOiBJT2JzZXJ2YWJsZTxJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZD47XG5cblx0Ly8gVE9ETyB0byBiZSBjbGVhciwgdGhpcyBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGlkIGZyb20gdGhlIHNlc3Npb24gb2JqZWN0LCB3aGljaCBiZWxvbmdzIHRvIHRoZSBwcm92aWRlci5cblx0Ly8gSXQncyBlYXNpZXIgdG8gYmUgYWJsZSB0byBpZGVudGlmeSB0aGlzIG1vZGVsIGJlZm9yZSBpdHMgYXN5bmMgaW5pdGlhbGl6YXRpb24gaXMgY29tcGxldGVcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbklkOiBzdHJpbmc7XG5cdC8qKiBAZGVwcmVjYXRlZCBVc2Uge0BsaW5rIHNlc3Npb25SZXNvdXJjZX0gaW5zdGVhZCAqL1xuXHRnZXQgc2Vzc2lvbklkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25JZDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRnZXQgc2Vzc2lvblJlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cdHJlYWRvbmx5IHJlcXVlc3RJblByb2dyZXNzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgaGFzQWN0aXZlUmVxdWVzdDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IHJlcXVlc3ROZWVkc0lucHV0OiBJT2JzZXJ2YWJsZTxJQ2hhdFJlcXVlc3ROZWVkc0lucHV0SW5mbyB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGlzUmVhZE9ubHk6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdC8qKiBJbnB1dCBtb2RlbCBmb3IgbWFuYWdpbmcgaW5wdXQgc3RhdGUgKi9cblx0cmVhZG9ubHkgaW5wdXRNb2RlbDogSW5wdXRNb2RlbDtcblxuXHRnZXQgaGFzUmVxdWVzdHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVlc3RzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRnZXQgbGFzdFJlcXVlc3QoKTogQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcXVlc3RzLmF0KC0xKTtcblx0fVxuXG5cdGdldCBzZXNzaW9uQ29zdCgpOiBudW1iZXIge1xuXHRcdGxldCBzdW1tZWRDcmVkaXRzID0gMDtcblx0XHRsZXQgcmVwb3J0ZWRTZXNzaW9uQ3JlZGl0cyA9IDA7XG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHRoaXMuX3JlcXVlc3RzKSB7XG5cdFx0XHRjb25zdCB1c2FnZSA9IHJlcXVlc3QucmVzcG9uc2U/LnVzYWdlO1xuXHRcdFx0aWYgKHR5cGVvZiB1c2FnZT8uY29waWxvdENyZWRpdHMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHN1bW1lZENyZWRpdHMgKz0gdXNhZ2UuY29waWxvdENyZWRpdHM7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIHVzYWdlPy5zZXNzaW9uQ29waWxvdENyZWRpdHMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHJlcG9ydGVkU2Vzc2lvbkNyZWRpdHMgPSBNYXRoLm1heChyZXBvcnRlZFNlc3Npb25DcmVkaXRzLCB1c2FnZS5zZXNzaW9uQ29waWxvdENyZWRpdHMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBBIGJhY2tlbmQgdGhhdCByZXBvcnRzIHRoZSBzZXNzaW9uIHRvdGFsIGNvdmVycyB3b3JrIGJpbGxlZCBvdXRzaWRlIGFueVxuXHRcdC8vIHR1cm4sIHdoaWNoIHN1bW1pbmcgdGhlIHR1cm5zIHdvdWxkIG1pc3MuIFN1bW1pbmcgY292ZXJzIHR1cm5zIHdob3NlXG5cdFx0Ly8gYmFja2VuZCByZXBvcnRzIG5vIHNlc3Npb24gdG90YWwsIGFuZCBhbnkgYmlsbGVkIGFmdGVyIHRoZSBtb3N0IHJlY2VudFxuXHRcdC8vIHJlcG9ydGVkIHRvdGFsLiBOZWl0aGVyIGlzIGEgc3VwZXJzZXQsIHNvIHRha2Ugd2hpY2hldmVyIGlzIGxhcmdlciBcdTIwMTRcblx0XHQvLyB3aGljaCBpcyBhbHNvIGluZGVwZW5kZW50IG9mIHRoZSBvcmRlciB0aGUgdHdvIGtpbmRzIGFyZSBpbnRlcmxlYXZlZCBpbi5cblx0XHRyZXR1cm4gTWF0aC5tYXgoc3VtbWVkQ3JlZGl0cywgcmVwb3J0ZWRTZXNzaW9uQ3JlZGl0cyk7XG5cdH1cblxuXHRwcml2YXRlIF90aW1lc3RhbXA6IG51bWJlcjtcblx0Z2V0IHRpbWVzdGFtcCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl90aW1lc3RhbXA7XG5cdH1cblxuXHRnZXQgdGltaW5nKCk6IElDaGF0U2Vzc2lvblRpbWluZyB7XG5cdFx0Y29uc3QgbGFzdFJlcXVlc3QgPSB0aGlzLl9yZXF1ZXN0cy5hdCgtMSk7XG5cdFx0Y29uc3QgbGFzdFJlc3BvbnNlID0gbGFzdFJlcXVlc3Q/LnJlc3BvbnNlO1xuXHRcdGNvbnN0IGxhc3RSZXF1ZXN0U3RhcnRlZCA9IGxhc3RSZXF1ZXN0Py50aW1lc3RhbXA7XG5cdFx0Y29uc3QgbGFzdFJlcXVlc3RFbmRlZCA9IGxhc3RSZXNwb25zZT8uY29tcGxldGVkQXQgPz8gbGFzdFJlc3BvbnNlPy50aW1lc3RhbXA7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNyZWF0ZWQ6IHRoaXMuX3RpbWVzdGFtcCxcblx0XHRcdGxhc3RSZXF1ZXN0U3RhcnRlZCxcblx0XHRcdGxhc3RSZXF1ZXN0RW5kZWQsXG5cdFx0fTtcblx0fVxuXG5cdGdldCBsYXN0TWVzc2FnZURhdGUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdHMuYXQoLTEpPy50aW1lc3RhbXAgPz8gdGhpcy5fdGltZXN0YW1wO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2RlZmF1bHRBZ2VudCgpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDaGF0TW9kZUtpbmQuQXNrKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxSZXNwb25kZXJVc2VybmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgcmVzcG9uZGVyVXNlcm5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdEFnZW50Py5mdWxsTmFtZSA/P1xuXHRcdFx0dGhpcy5faW5pdGlhbFJlc3BvbmRlclVzZXJuYW1lID8/ICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNJbXBvcnRlZCA9IGZhbHNlO1xuXHRnZXQgaXNJbXBvcnRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNJbXBvcnRlZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzRGVsZXRlZCA9IGZhbHNlO1xuXHRnZXQgaXNEZWxldGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0RlbGV0ZWQ7XG5cdH1cblx0bWFya0RlbGV0ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEZWxldGVkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2N1c3RvbVRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldCBjdXN0b21UaXRsZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21UaXRsZTtcblx0fVxuXG5cdGdldCB0aXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9jdXN0b21UaXRsZSB8fCBDaGF0TW9kZWwuZ2V0RGVmYXVsdFRpdGxlKHRoaXMuX3JlcXVlc3RzKTtcblx0fVxuXG5cdGdldCBoYXNDdXN0b21UaXRsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VzdG9tVGl0bGUgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2VkaXRpbmdTZXNzaW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBlZGl0aW5nU2Vzc2lvbigpOiBJQ2hhdEVkaXRpbmdTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdGluZ1Nlc3Npb247XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uO1xuXHRnZXQgaW5pdGlhbExvY2F0aW9uKCk6IENoYXRBZ2VudExvY2F0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5faW5pdGlhbExvY2F0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2FuVXNlVG9vbHM6IGJvb2xlYW4gPSB0cnVlO1xuXHRnZXQgY2FuVXNlVG9vbHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhblVzZVRvb2xzO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmU6IGJvb2xlYW47XG5cdGdldCB3aWxsS2VlcEFsaXZlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmU7XG5cdH1cblxuXHRwdWJsaWMgZGF0YVNlcmlhbGl6ZXI/OiBJQ2hhdERhdGFTZXJpYWxpemVyTG9nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGRhdGFSZWY6IElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UgfCB1bmRlZmluZWQsXG5cdFx0aW5pdGlhbE1vZGVsUHJvcHM6IHsgaW5pdGlhbExvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbjsgY2FuVXNlVG9vbHM6IGJvb2xlYW47IGlucHV0U3RhdGU/OiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZTsgcmVzb3VyY2U/OiBVUkk7IGRpc2FibGVCYWNrZ3JvdW5kS2VlcEFsaXZlPzogYm9vbGVhbjsgaXNSZWFkT25seT86IElPYnNlcnZhYmxlPGJvb2xlYW4+IH0sXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDaGF0RWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RWRpdGluZ1NlcnZpY2U6IElDaGF0RWRpdGluZ1NlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBpbml0aWFsRGF0YSA9IGRhdGFSZWY/LnZhbHVlO1xuXHRcdGNvbnN0IGlzVmFsaWRFeHBvcnRlZERhdGEgPSBpc0V4cG9ydGFibGVTZXNzaW9uRGF0YShpbml0aWFsRGF0YSk7XG5cdFx0Y29uc3QgaXNWYWxpZEZ1bGxEYXRhID0gaXNWYWxpZEV4cG9ydGVkRGF0YSAmJiBpc1NlcmlhbGl6YWJsZVNlc3Npb25EYXRhKGluaXRpYWxEYXRhKTtcblx0XHRpZiAoaW5pdGlhbERhdGEgJiYgIWlzVmFsaWRFeHBvcnRlZERhdGEpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBDaGF0TW9kZWwjY29uc3RydWN0b3I6IExvYWRlZCBtYWxmb3JtZWQgc2Vzc2lvbiBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGluaXRpYWxEYXRhKX1gKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pc0ltcG9ydGVkID0gISFpbml0aWFsRGF0YSAmJiBpc1ZhbGlkRXhwb3J0ZWREYXRhICYmICFpc1ZhbGlkRnVsbERhdGE7XG5cblx0XHQvLyBTZXQgdGhlIHNlc3Npb24gcmVzb3VyY2UgYW5kIGlkXG5cdFx0aWYgKGluaXRpYWxNb2RlbFByb3BzLnJlc291cmNlKSB7XG5cdFx0XHQvLyBwcmVmZXIgdXNpbmcgdGhlIHByb3ZpZGVkIHJlc291cmNlIGlmIHByb3ZpZGVkXG5cdFx0XHR0aGlzLl9zZXNzaW9uSWQgPSBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChpbml0aWFsTW9kZWxQcm9wcy5yZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSBpbml0aWFsTW9kZWxQcm9wcy5yZXNvdXJjZTtcblx0XHR9IGVsc2UgaWYgKGlzVmFsaWRGdWxsRGF0YSkge1xuXHRcdFx0Ly8gT3RoZXJ3aXNlIHVzZSB0aGUgc2VyaWFsaXplZCBpZC4gVGhpcyBpcyBvbmx5IHZhbGlkIGZvciBsb2NhbCBjaGF0IHNlc3Npb25zXG5cdFx0XHR0aGlzLl9zZXNzaW9uSWQgPSBpbml0aWFsRGF0YS5zZXNzaW9uSWQ7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oaW5pdGlhbERhdGEuc2Vzc2lvbklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRmluYWxseSBmYWxsIGJhY2sgdG8gZ2VuZXJhdGluZyBhIG5ldyBpZCBmb3IgYSBsb2NhbCBzZXNzaW9uLiBUaGlzIGlzIHVzZWQgaW4gdGhlIGNhc2Ugd2hlcmUgYVxuXHRcdFx0Ly8gY2hhdCBoYXMgYmVlbiBleHBvcnRlZCAoYnV0IG5vdCBzZXJpYWxpemVkKVxuXHRcdFx0dGhpcy5fc2Vzc2lvbklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24odGhpcy5fc2Vzc2lvbklkKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kaXNhYmxlQmFja2dyb3VuZEtlZXBBbGl2ZSA9IGluaXRpYWxNb2RlbFByb3BzLmRpc2FibGVCYWNrZ3JvdW5kS2VlcEFsaXZlID8/IGZhbHNlO1xuXG5cdFx0dGhpcy5fdGltZXN0YW1wID0gKGlzVmFsaWRGdWxsRGF0YSAmJiBpbml0aWFsRGF0YS5jcmVhdGlvbkRhdGUpIHx8IERhdGUubm93KCk7XG5cdFx0dGhpcy5fcmVxdWVzdHMgPSBpbml0aWFsRGF0YSA/IHRoaXMuX2Rlc2VyaWFsaXplKGluaXRpYWxEYXRhKSA6IFtdO1xuXHRcdHRoaXMuX2N1c3RvbVRpdGxlID0gaXNWYWxpZEZ1bGxEYXRhID8gaW5pdGlhbERhdGEuY3VzdG9tVGl0bGUgOiB1bmRlZmluZWQ7XG5cblx0XHQvLyBJbml0aWFsaXplIGlucHV0IG1vZGVsIGZyb20gc2VyaWFsaXplZCBkYXRhICh1bmRlZmluZWQgZm9yIG5ldyBjaGF0cylcblx0XHRjb25zdCBzZXJpYWxpemVkSW5wdXRTdGF0ZSA9IGluaXRpYWxNb2RlbFByb3BzLmlucHV0U3RhdGUgfHwgKGlzVmFsaWRGdWxsRGF0YSAmJiBpbml0aWFsRGF0YS5pbnB1dFN0YXRlID8gaW5pdGlhbERhdGEuaW5wdXRTdGF0ZSA6IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5pbnB1dE1vZGVsID0gbmV3IElucHV0TW9kZWwoc2VyaWFsaXplZElucHV0U3RhdGUgJiYgcmV2aXZlU2VyaWFsaXphYmxlSW5wdXRTdGF0ZShzZXJpYWxpemVkSW5wdXRTdGF0ZSksIHRoaXMubG9nU2VydmljZSwgdGhpcy5fc2Vzc2lvbklkKTtcblxuXHRcdHRoaXMuZGF0YVNlcmlhbGl6ZXIgPSBkYXRhUmVmPy5zZXJpYWxpemVyO1xuXHRcdHRoaXMuX2luaXRpYWxSZXNwb25kZXJVc2VybmFtZSA9IGluaXRpYWxEYXRhPy5yZXNwb25kZXJVc2VybmFtZTtcblxuXHRcdHRoaXMuX3JlcG9EYXRhID0gaXNWYWxpZEZ1bGxEYXRhICYmIGluaXRpYWxEYXRhLnJlcG9EYXRhID8gaW5pdGlhbERhdGEucmVwb0RhdGEgOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3J5ID0gaXNWYWxpZEZ1bGxEYXRhICYmIGluaXRpYWxEYXRhLndvcmtpbmdEaXJlY3RvcnkgPyBVUkkucGFyc2UoaW5pdGlhbERhdGEud29ya2luZ0RpcmVjdG9yeSkgOiB1bmRlZmluZWQ7XG5cblx0XHQvLyBIeWRyYXRlIHBlbmRpbmcgcmVxdWVzdHMgZnJvbSBzZXJpYWxpemVkIGRhdGFcblx0XHRpZiAoaXNWYWxpZEZ1bGxEYXRhICYmIGluaXRpYWxEYXRhLnBlbmRpbmdSZXF1ZXN0cykge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzID0gdGhpcy5fZGVzZXJpYWxpemVQZW5kaW5nUmVxdWVzdHMoaW5pdGlhbERhdGEucGVuZGluZ1JlcXVlc3RzKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pbml0aWFsTG9jYXRpb24gPSBpbml0aWFsRGF0YT8uaW5pdGlhbExvY2F0aW9uID8/IGluaXRpYWxNb2RlbFByb3BzLmluaXRpYWxMb2NhdGlvbjtcblxuXHRcdHRoaXMuX2NhblVzZVRvb2xzID0gaW5pdGlhbE1vZGVsUHJvcHMuY2FuVXNlVG9vbHM7XG5cdFx0dGhpcy5pc1JlYWRPbmx5ID0gaW5pdGlhbE1vZGVsUHJvcHMuaXNSZWFkT25seSA/PyBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXG5cdFx0dGhpcy5sYXN0UmVxdWVzdE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgdGhpcy5vbkRpZENoYW5nZSwgKCkgPT4gdGhpcy5fcmVxdWVzdHMuYXQoLTEpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSB0aGlzLmxhc3RSZXF1ZXN0T2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghcmVxdWVzdD8ucmVzcG9uc2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJlcXVlc3QucmVzcG9uc2Uub25EaWRDaGFuZ2UoYXN5bmMgZXYgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2VkaXRpbmdTZXNzaW9uIHx8IGV2LnJlYXNvbiAhPT0gJ2NvbXBsZXRlZFJlcXVlc3QnKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdjb21wbGV0ZWRSZXF1ZXN0JywgcmVxdWVzdCB9KTtcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlcXVlc3RJblByb2dyZXNzID0gdGhpcy5sYXN0UmVxdWVzdE9icy5tYXAoKHJlcXVlc3QsIHIpID0+IHtcblx0XHRcdHJldHVybiByZXF1ZXN0Py5yZXNwb25zZT8uaXNJblByb2dyZXNzLnJlYWQocikgPz8gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmhhc0FjdGl2ZVJlcXVlc3QgPSB0aGlzLmxhc3RSZXF1ZXN0T2JzLm1hcCgocmVxdWVzdCwgcikgPT4ge1xuXHRcdFx0cmV0dXJuIHJlcXVlc3Q/LnJlc3BvbnNlPy5pc0luY29tcGxldGUucmVhZChyKSA/PyBmYWxzZTtcblx0XHR9KTtcblxuXHRcdHRoaXMucmVxdWVzdE5lZWRzSW5wdXQgPSB0aGlzLmxhc3RSZXF1ZXN0T2JzLm1hcCgocmVxdWVzdCwgcikgPT4ge1xuXHRcdFx0Y29uc3QgcGVuZGluZ0luZm8gPSByZXF1ZXN0Py5yZXNwb25zZT8uaXNQZW5kaW5nQ29uZmlybWF0aW9uLnJlYWQocik7XG5cdFx0XHRpZiAoIXBlbmRpbmdJbmZvKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0aXRsZTogdGhpcy50aXRsZSxcblx0XHRcdFx0ZGV0YWlsOiBwZW5kaW5nSW5mby5kZXRhaWwsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0Ly8gUmV0YWluIGEgcmVmZXJlbmNlIHRvIGl0c2VsZiB3aGVuIGEgcmVxdWVzdCBpcyBpbiBwcm9ncmVzcywgc28gdGhlIENoYXRNb2RlbCBzdGF5cyBhbGl2ZSBpbiB0aGUgYmFja2dyb3VuZFxuXHRcdC8vIG9ubHkgd2hpbGUgcnVubmluZyBhIHJlcXVlc3QuIFRPRE8gYWxzbyBrZWVwIGl0IGFsaXZlIGZvciA1bWluIG9yIHNvIHNvIHdlIGRvbid0IGhhdmUgdG8gZGlzcG9zZS9yZXN0b3JlIHRvbyBvZnRlbj9cblx0XHRpZiAodGhpcy5pbml0aWFsTG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQgJiYgIWluaXRpYWxNb2RlbFByb3BzLmRpc2FibGVCYWNrZ3JvdW5kS2VlcEFsaXZlKSB7XG5cdFx0XHRjb25zdCBzZWxmUmVmID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElDaGF0TW9kZWxSZWZlcmVuY2U+KCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdFx0Y29uc3QgaW5Qcm9ncmVzcyA9IHRoaXMucmVxdWVzdEluUHJvZ3Jlc3MucmVhZChyKTtcblx0XHRcdFx0Y29uc3QgbmVlZHNJbnB1dCA9IHRoaXMucmVxdWVzdE5lZWRzSW5wdXQucmVhZChyKTtcblx0XHRcdFx0Y29uc3Qgc2hvdWxkU3RheUFsaXZlID0gaW5Qcm9ncmVzcyB8fCAhIW5lZWRzSW5wdXQ7XG5cdFx0XHRcdGlmIChzaG91bGRTdGF5QWxpdmUgJiYgIXNlbGZSZWYudmFsdWUpIHtcblx0XHRcdFx0XHRzZWxmUmVmLnZhbHVlID0gY2hhdFNlcnZpY2UuYWNxdWlyZUV4aXN0aW5nU2Vzc2lvbih0aGlzLl9zZXNzaW9uUmVzb3VyY2UsICdDaGF0TW9kZWwjcmVxdWVzdEluUHJvZ3Jlc3NLZWVwQWxpdmUnKTtcblx0XHRcdFx0fSBlbHNlIGlmICghc2hvdWxkU3RheUFsaXZlICYmIHNlbGZSZWYudmFsdWUpIHtcblx0XHRcdFx0XHRzZWxmUmVmLmNsZWFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRzdGFydEVkaXRpbmdTZXNzaW9uKGlzR2xvYmFsRWRpdGluZ1Nlc3Npb24/OiBib29sZWFuLCB0cmFuc2ZlckZyb21TZXNzaW9uPzogSUNoYXRFZGl0aW5nU2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9lZGl0aW5nU2Vzc2lvbiA/Pz0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHR0cmFuc2ZlckZyb21TZXNzaW9uXG5cdFx0XHRcdD8gdGhpcy5jaGF0RWRpdGluZ1NlcnZpY2UudHJhbnNmZXJFZGl0aW5nU2Vzc2lvbih0aGlzLCB0cmFuc2ZlckZyb21TZXNzaW9uKVxuXHRcdFx0XHQ6IGlzR2xvYmFsRWRpdGluZ1Nlc3Npb25cblx0XHRcdFx0XHQ/IHRoaXMuY2hhdEVkaXRpbmdTZXJ2aWNlLnN0YXJ0T3JDb250aW51ZUdsb2JhbEVkaXRpbmdTZXNzaW9uKHRoaXMpXG5cdFx0XHRcdFx0OiB0aGlzLmNoYXRFZGl0aW5nU2VydmljZS5jcmVhdGVFZGl0aW5nU2Vzc2lvbih0aGlzKVxuXHRcdCk7XG5cblx0XHRpZiAoIXRoaXMuX2Rpc2FibGVCYWNrZ3JvdW5kS2VlcEFsaXZlKSB7XG5cdFx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IGhvbGQgb250byBhIHJlZmVyZW5jZSBzbyBiYWNrZ3JvdW5kIHNlc3Npb25zIGRvbid0XG5cdFx0XHQvLyB0cmlnZ2VyIGVhcmx5IGRpc3Bvc2FsLiBUaGlzIHdpbGwgYmUgY2xlYW5lZCB1cCB3aXRoIHRoZSBnbG9iYWxpemF0aW9uIG9mIGVkaXRzLlxuXHRcdFx0Y29uc3Qgc2VsZlJlZiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJQ2hhdE1vZGVsUmVmZXJlbmNlPigpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRcdGNvbnN0IGhhc01vZGlmaWVkID0gc2Vzc2lvbi5lbnRyaWVzLnJlYWQocikuc29tZShlID0+IGUuc3RhdGUucmVhZChyKSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCk7XG5cdFx0XHRcdGlmIChoYXNNb2RpZmllZCAmJiAhc2VsZlJlZi52YWx1ZSkge1xuXHRcdFx0XHRcdHNlbGZSZWYudmFsdWUgPSB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVFeGlzdGluZ1Nlc3Npb24odGhpcy5fc2Vzc2lvblJlc291cmNlLCAnQ2hhdE1vZGVsI21vZGlmaWVkRWRpdHNLZWVwQWxpdmUnKTtcblx0XHRcdFx0fSBlbHNlIGlmICghaGFzTW9kaWZpZWQgJiYgc2VsZlJlZi52YWx1ZSkge1xuXHRcdFx0XHRcdHNlbGZSZWYuY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3NldERpc2FibGVkUmVxdWVzdHMoc2Vzc2lvbi5yZXF1ZXN0RGlzYWJsZW1lbnQucmVhZChyZWFkZXIpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGN1cnJlbnRFZGl0ZWRGaWxlRXZlbnRzID0gbmV3IFJlc291cmNlTWFwPElDaGF0QWdlbnRFZGl0ZWRGaWxlRXZlbnQ+KCk7XG5cdG5vdGlmeUVkaXRpbmdBY3Rpb24oYWN0aW9uOiBJQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBhY3Rpb24ub3V0Y29tZSA9PT0gJ2FjY2VwdGVkJyA/IENoYXRSZXF1ZXN0RWRpdGVkRmlsZUV2ZW50S2luZC5LZWVwIDpcblx0XHRcdGFjdGlvbi5vdXRjb21lID09PSAncmVqZWN0ZWQnID8gQ2hhdFJlcXVlc3RFZGl0ZWRGaWxlRXZlbnRLaW5kLlVuZG8gOlxuXHRcdFx0XHRhY3Rpb24ub3V0Y29tZSA9PT0gJ3VzZXJNb2RpZmllZCcgPyBDaGF0UmVxdWVzdEVkaXRlZEZpbGVFdmVudEtpbmQuVXNlck1vZGlmaWNhdGlvbiA6IG51bGw7XG5cdFx0aWYgKHN0YXRlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRFZGl0ZWRGaWxlRXZlbnRzLmhhcyhhY3Rpb24udXJpKSB8fCB0aGlzLmN1cnJlbnRFZGl0ZWRGaWxlRXZlbnRzLmdldChhY3Rpb24udXJpKT8uZXZlbnRLaW5kID09PSBDaGF0UmVxdWVzdEVkaXRlZEZpbGVFdmVudEtpbmQuS2VlcCkge1xuXHRcdFx0dGhpcy5jdXJyZW50RWRpdGVkRmlsZUV2ZW50cy5zZXQoYWN0aW9uLnVyaSwgeyBldmVudEtpbmQ6IHN0YXRlLCB1cmk6IGFjdGlvbi51cmkgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVzZXJpYWxpemUob2JqOiBJRXhwb3J0YWJsZUNoYXREYXRhIHwgSVNlcmlhbGl6ZWRDaGF0RGF0YVJlZmVyZW5jZSk6IENoYXRSZXF1ZXN0TW9kZWxbXSB7XG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBoYXNLZXkob2JqLCB7IHNlcmlhbGl6ZXI6IHRydWUgfSkgPyBvYmoudmFsdWUucmVxdWVzdHMgOiBvYmoucmVxdWVzdHM7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHJlcXVlc3RzKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBJZ25vcmluZyBtYWxmb3JtZWQgc2Vzc2lvbiBkYXRhOiAke0pTT04uc3RyaW5naWZ5KG9iail9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiByZXF1ZXN0cy5tYXAociA9PiB0aGlzLl9kZXNlcmlhbGl6ZVJlcXVlc3QocikpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBwYXJzZSBjaGF0IGRhdGEnLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVzZXJpYWxpemVSZXF1ZXN0KHJhdzogSVNlcmlhbGl6YWJsZUNoYXRSZXF1ZXN0RGF0YSk6IENoYXRSZXF1ZXN0TW9kZWwge1xuXHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPVxuXHRcdFx0dHlwZW9mIHJhdy5tZXNzYWdlID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQ/IHRoaXMuZ2V0UGFyc2VkUmVxdWVzdEZyb21TdHJpbmcocmF3Lm1lc3NhZ2UpXG5cdFx0XHRcdDogcmV2aXZlUGFyc2VkQ2hhdFJlcXVlc3QocmF3Lm1lc3NhZ2UpO1xuXG5cdFx0Ly8gT2xkIG1lc3NhZ2VzIGRvbid0IGhhdmUgdmFyaWFibGVEYXRhLCBvciBoYXZlIGl0IGluIHRoZSB3cm9uZyAobm9uLWFycmF5KSBzaGFwZVxuXHRcdGNvbnN0IHZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhID0gdGhpcy5yZXZpdmVWYXJpYWJsZURhdGEocmF3LnZhcmlhYmxlRGF0YSk7XG5cdFx0Y29uc3QgcmVxdWVzdFRpbWVzdGFtcCA9IHR5cGVvZiByYXcudGltZXN0YW1wID09PSAnbnVtYmVyJyAmJiByYXcudGltZXN0YW1wID4gMCA/IHJhdy50aW1lc3RhbXAgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG5ldyBDaGF0UmVxdWVzdE1vZGVsKHtcblx0XHRcdHNlc3Npb246IHRoaXMsXG5cdFx0XHRtZXNzYWdlOiBwYXJzZWRSZXF1ZXN0LFxuXHRcdFx0dmFyaWFibGVEYXRhLFxuXHRcdFx0dGltZXN0YW1wOiByZXF1ZXN0VGltZXN0YW1wLFxuXHRcdFx0ZmFsbGJhY2tUaW1lc3RhbXA6IHRoaXMuX3RpbWVzdGFtcCxcblx0XHRcdHJlc3RvcmVkSWQ6IHJhdy5yZXF1ZXN0SWQsXG5cdFx0XHRjb25maXJtYXRpb246IHJhdy5jb25maXJtYXRpb24sXG5cdFx0XHRlZGl0ZWRGaWxlRXZlbnRzOiByYXcuZWRpdGVkRmlsZUV2ZW50cyxcblx0XHRcdG1vZGVsSWQ6IHJhdy5tb2RlbElkLFxuXHRcdFx0bW9kZUluZm86IHJhdy5tb2RlSW5mbyxcblx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkOiByYXcuaXNTeXN0ZW1Jbml0aWF0ZWQsXG5cdFx0XHRpc0hpZGRlbkZyb21UcmFuc2NyaXB0OiByYXcuaGlkZGVuRnJvbVRyYW5zY3JpcHQsXG5cdFx0XHRzeXN0ZW1Jbml0aWF0ZWRMYWJlbDogcmF3LnN5c3RlbUluaXRpYXRlZExhYmVsLFxuXHRcdFx0dGVybWluYWxFeGVjdXRpb25JZDogcmF3LnRlcm1pbmFsRXhlY3V0aW9uSWQsXG5cdFx0XHRvcmlnaW46IHJldml2ZUNoYXRSZXF1ZXN0T3JpZ2luKHJhdy5vcmlnaW4pLFxuXHRcdH0pO1xuXHRcdHJlcXVlc3Quc2hvdWxkQmVSZW1vdmVkT25TZW5kID0gcmF3LmlzSGlkZGVuID8geyByZXF1ZXN0SWQ6IHJhdy5yZXF1ZXN0SWQgfSA6IHJhdy5zaG91bGRCZVJlbW92ZWRPblNlbmQ7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnksIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0aWYgKHJhdy5yZXNwb25zZSB8fCByYXcucmVzdWx0IHx8IChyYXcgYXMgYW55KS5yZXNwb25zZUVycm9yRGV0YWlscykge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSAocmF3LmFnZW50ICYmICdtZXRhZGF0YScgaW4gcmF3LmFnZW50KSA/IC8vIENoZWNrIGZvciB0aGUgbmV3IGZvcm1hdCwgaWdub3JlIGVudHJpZXMgaW4gdGhlIG9sZCBmb3JtYXRcblx0XHRcdFx0cmV2aXZlU2VyaWFsaXplZEFnZW50KHJhdy5hZ2VudCkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIFBvcnQgZW50cmllcyBmcm9tIG9sZCBmb3JtYXRcblx0XHRcdGNvbnN0IHJlc3VsdCA9ICdyZXNwb25zZUVycm9yRGV0YWlscycgaW4gcmF3ID9cblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0XHR7IGVycm9yRGV0YWlsczogcmF3LnJlc3BvbnNlRXJyb3JEZXRhaWxzIH0gYXMgSUNoYXRBZ2VudFJlc3VsdCA6IHJhdy5yZXN1bHQ7XG5cdFx0XHRsZXQgbW9kZWxTdGF0ZSA9IHJhdy5tb2RlbFN0YXRlIHx8IHsgdmFsdWU6IHJhdy5pc0NhbmNlbGVkID8gUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZCA6IFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZSwgY29tcGxldGVkQXQ6IERhdGUubm93KCkgfTtcblx0XHRcdGlmIChtb2RlbFN0YXRlLnZhbHVlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuUGVuZGluZyB8fCBtb2RlbFN0YXRlLnZhbHVlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuTmVlZHNJbnB1dCkge1xuXHRcdFx0XHRtb2RlbFN0YXRlID0geyB2YWx1ZTogUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZCwgY29tcGxldGVkQXQ6IERhdGUubm93KCkgfTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFyayBxdWVzdGlvbiBjYXJvdXNlbHMgYXMgdXNlZCBhZnRlclxuXHRcdFx0Ly8gZGVzZXJpYWxpemF0aW9uLiBBZnRlciBhIHJlbG9hZCwgdGhlIGV4dGVuc2lvbiBpcyBubyBsb25nZXIgbGlzdGVuaW5nIGZvclxuXHRcdFx0Ly8gdGhlaXIgcmVzcG9uc2VzLCBzbyB0aGV5IGNhbm5vdCBiZSBpbnRlcmFjdGVkIHdpdGguXG5cdFx0XHRpZiAocmF3LnJlc3BvbnNlKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcGFydCBvZiByYXcucmVzcG9uc2UpIHtcblx0XHRcdFx0XHRpZiAoaGFzS2V5KHBhcnQsIHsga2luZDogdHJ1ZSB9KSAmJiAocGFydC5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcgfHwgcGFydC5raW5kID09PSAncGxhblJldmlldycpKSB7XG5cdFx0XHRcdFx0XHRwYXJ0LmlzVXNlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJlcXVlc3QucmVzcG9uc2UgPSBuZXcgQ2hhdFJlc3BvbnNlTW9kZWwoe1xuXHRcdFx0XHRyZXNwb25zZUNvbnRlbnQ6IHJhdy5yZXNwb25zZSA/PyBbbmV3IE1hcmtkb3duU3RyaW5nKHJhdy5yZXNwb25zZSldLFxuXHRcdFx0XHRzZXNzaW9uOiB0aGlzLFxuXHRcdFx0XHRhZ2VudCxcblx0XHRcdFx0c2xhc2hDb21tYW5kOiByYXcuc2xhc2hDb21tYW5kLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRcdG1vZGVsU3RhdGUsXG5cdFx0XHRcdGNvbXBsZXRpb25UaW1lc3RhbXA6IHJhdy5tb2RlbFN0YXRlICYmICdjb21wbGV0ZWRBdCcgaW4gcmF3Lm1vZGVsU3RhdGUgJiYgTnVtYmVyLmlzRmluaXRlKHJhdy5tb2RlbFN0YXRlLmNvbXBsZXRlZEF0KSAmJiByYXcubW9kZWxTdGF0ZS5jb21wbGV0ZWRBdCA+IDBcblx0XHRcdFx0XHQ/IHJhdy5tb2RlbFN0YXRlLmNvbXBsZXRlZEF0XG5cdFx0XHRcdFx0OiBudWxsLFxuXHRcdFx0XHR2b3RlOiByYXcudm90ZSxcblx0XHRcdFx0dGltZXN0YW1wOiB0eXBlb2YgcmF3LnJlc3BvbnNlVGltZXN0YW1wID09PSAnbnVtYmVyJyAmJiByYXcucmVzcG9uc2VUaW1lc3RhbXAgPiAwID8gcmF3LnJlc3BvbnNlVGltZXN0YW1wIDogcmVxdWVzdFRpbWVzdGFtcCxcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRmb2xsb3d1cHM6IHJhdy5mb2xsb3d1cHMsXG5cdFx0XHRcdHJlc3RvcmVkSWQ6IHJhdy5yZXNwb25zZUlkLFxuXHRcdFx0XHR0aW1lU3BlbnRXYWl0aW5nOiByYXcudGltZVNwZW50V2FpdGluZyxcblx0XHRcdFx0ZWxhcHNlZE1zOiByYXcuZWxhcHNlZE1zLFxuXHRcdFx0XHRzaG91bGRCZUJsb2NrZWQ6IHJlcXVlc3Quc2hvdWxkQmVCbG9ja2VkLmdldCgpLFxuXHRcdFx0XHRjb2RlQmxvY2tJbmZvczogcmF3LnJlc3BvbnNlTWFya2Rvd25JbmZvPy5tYXA8SUNvZGVCbG9ja0luZm8+KGluZm8gPT4gKHsgc3VnZ2VzdGlvbklkOiBpbmZvLnN1Z2dlc3Rpb25JZCB9KSksXG5cdFx0XHR9KTtcblx0XHRcdHJlcXVlc3QucmVzcG9uc2Uuc2hvdWxkQmVSZW1vdmVkT25TZW5kID0gcmF3LmlzSGlkZGVuID8geyByZXF1ZXN0SWQ6IHJhdy5yZXF1ZXN0SWQgfSA6IHJhdy5zaG91bGRCZVJlbW92ZWRPblNlbmQ7XG5cdFx0XHRpZiAodHlwZW9mIHJhdy5jb21wbGV0aW9uVG9rZW5zID09PSAnbnVtYmVyJyB8fCB0eXBlb2YgcmF3LnByb21wdFRva2VucyA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHJhdy5jb3BpbG90Q3JlZGl0cyA9PT0gJ251bWJlcicgfHwgdHlwZW9mIHJhdy5zZXNzaW9uQ29waWxvdENyZWRpdHMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHJlcXVlc3QucmVzcG9uc2Uuc2V0VXNhZ2Uoe1xuXHRcdFx0XHRcdGtpbmQ6ICd1c2FnZScsXG5cdFx0XHRcdFx0cHJvbXB0VG9rZW5zOiByYXcucHJvbXB0VG9rZW5zID8/IDAsXG5cdFx0XHRcdFx0Y29tcGxldGlvblRva2VuczogcmF3LmNvbXBsZXRpb25Ub2tlbnMgPz8gMCxcblx0XHRcdFx0XHRvdXRwdXRCdWZmZXI6IHJhdy5vdXRwdXRCdWZmZXIsXG5cdFx0XHRcdFx0cHJvbXB0VG9rZW5EZXRhaWxzOiByYXcucHJvbXB0VG9rZW5EZXRhaWxzLFxuXHRcdFx0XHRcdGNvcGlsb3RDcmVkaXRzOiByYXcuY29waWxvdENyZWRpdHMsXG5cdFx0XHRcdFx0bW9kZWxUb3RhbHM6IHJhdy5tb2RlbFRvdGFscyxcblx0XHRcdFx0XHRzZXNzaW9uQ29waWxvdENyZWRpdHM6IHJhdy5zZXNzaW9uQ29waWxvdENyZWRpdHMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJhdy51c2VkQ29udGV4dCkgeyAvLyBAdWx1Z2Jla25hOiBpZiB0aGlzJ3MgYSBuZXcgdnNjb2RlIHNlc3Npb25zLCBkb2MgdmVyc2lvbnMgYXJlIGluY29ycmVjdCBhbnl3YXk/XG5cdFx0XHRcdHJlcXVlc3QucmVzcG9uc2UuYXBwbHlSZWZlcmVuY2UocmV2aXZlKHJhdy51c2VkQ29udGV4dCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyYXcuY29udGVudFJlZmVyZW5jZXM/LmZvckVhY2gociA9PiByZXF1ZXN0LnJlc3BvbnNlIS5hcHBseVJlZmVyZW5jZShyZXZpdmUocikpKTtcblx0XHRcdHJhdy5jb2RlQ2l0YXRpb25zPy5mb3JFYWNoKGMgPT4gcmVxdWVzdC5yZXNwb25zZSEuYXBwbHlDb2RlQ2l0YXRpb24ocmV2aXZlKGMpKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXF1ZXN0O1xuXHR9XG5cblx0cHJpdmF0ZSByZXZpdmVWYXJpYWJsZURhdGEocmF3OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEpOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEge1xuXHRcdGNvbnN0IHZhcmlhYmxlRGF0YSA9IHJhdyAmJiBBcnJheS5pc0FycmF5KHJhdy52YXJpYWJsZXMpXG5cdFx0XHQ/IHJhdyA6XG5cdFx0XHR7IHZhcmlhYmxlczogW10gfTtcblxuXHRcdHZhcmlhYmxlRGF0YS52YXJpYWJsZXMgPSB2YXJpYWJsZURhdGEudmFyaWFibGVzLm1hcDxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5PihJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LmZyb21FeHBvcnQpO1xuXG5cdFx0cmV0dXJuIHZhcmlhYmxlRGF0YTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGFyc2VkUmVxdWVzdEZyb21TdHJpbmcobWVzc2FnZTogc3RyaW5nKTogSVBhcnNlZENoYXRSZXF1ZXN0IHtcblx0XHQvLyBUT0RPIFRoZXNlIG9mZnNldHMgd29uJ3QgYmUgdXNlZCwgYnV0IGNoYXQgcmVwbGllcyBuZWVkIHRvIGdvIHRocm91Z2ggdGhlIHBhcnNlciBhcyB3ZWxsXG5cdFx0Y29uc3QgcGFydHMgPSBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQobmV3IE9mZnNldFJhbmdlKDAsIG1lc3NhZ2UubGVuZ3RoKSwgeyBzdGFydENvbHVtbjogMSwgc3RhcnRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEgfSwgbWVzc2FnZSldO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0ZXh0OiBtZXNzYWdlLFxuXHRcdFx0cGFydHNcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEh5ZHJhdGVzIHBlbmRpbmcgcmVxdWVzdHMgZnJvbSBzZXJpYWxpemVkIGRhdGEuXG5cdCAqIEZvciBlYWNoIHNlcmlhbGl6ZWQgcGVuZGluZyByZXF1ZXN0LCBmaW5kcyB0aGUgbWF0Y2hpbmcgcmVxdWVzdCBtb2RlbCBhbmQgYWRkcyBpdCB0byB0aGUgcGVuZGluZyBxdWV1ZS5cblx0ICovXG5cdHByaXZhdGUgX2Rlc2VyaWFsaXplUGVuZGluZ1JlcXVlc3RzKHBlbmRpbmdSZXF1ZXN0czogSVNlcmlhbGl6YWJsZVBlbmRpbmdSZXF1ZXN0RGF0YVtdKTogSUNoYXRQZW5kaW5nUmVxdWVzdFtdIHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHBlbmRpbmdSZXF1ZXN0cy5tYXAocGVuZGluZyA9PiAoe1xuXHRcdFx0XHRpZDogcGVuZGluZy5pZCxcblx0XHRcdFx0cmVxdWVzdDogdGhpcy5fZGVzZXJpYWxpemVSZXF1ZXN0KHBlbmRpbmcucmVxdWVzdCksXG5cdFx0XHRcdGtpbmQ6IHBlbmRpbmcua2luZCxcblx0XHRcdFx0c2VuZE9wdGlvbnM6IHtcblx0XHRcdFx0XHQuLi5wZW5kaW5nLnNlbmRPcHRpb25zLFxuXHRcdFx0XHRcdHVzZXJTZWxlY3RlZFRvb2xzOiBwZW5kaW5nLnNlbmRPcHRpb25zLnVzZXJTZWxlY3RlZFRvb2xzXG5cdFx0XHRcdFx0XHQ/IGNvbnN0T2JzZXJ2YWJsZShwZW5kaW5nLnNlbmRPcHRpb25zLnVzZXJTZWxlY3RlZFRvb2xzKVxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBwYXJzZSBwZW5kaW5nIGNoYXQgcmVxdWVzdHMnLCBlKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXG5cblx0Z2V0UmVxdWVzdHMoKTogQ2hhdFJlcXVlc3RNb2RlbFtdIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdHM7XG5cdH1cblxuXHRyZXNldENoZWNrcG9pbnQoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHRoaXMuX3JlcXVlc3RzKSB7XG5cdFx0XHRyZXF1ZXN0LnNldFNob3VsZEJlQmxvY2tlZChmYWxzZSk7XG5cdFx0XHRpZiAocmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRyZXF1ZXN0LnJlc3BvbnNlLnNldEJsb2NrZWRTdGF0ZShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0c2V0Q2hlY2twb2ludChyZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGxldCBjaGVja3BvaW50OiBDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjaGVja3BvaW50SW5kZXggPSAtMTtcblx0XHRpZiAocmVxdWVzdElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3JlcXVlc3RzLmZvckVhY2goKHJlcXVlc3QsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGlmIChyZXF1ZXN0LmlkID09PSByZXF1ZXN0SWQpIHtcblx0XHRcdFx0XHRjaGVja3BvaW50SW5kZXggPSBpbmRleDtcblx0XHRcdFx0XHRjaGVja3BvaW50ID0gcmVxdWVzdDtcblx0XHRcdFx0XHRyZXF1ZXN0LnNldFNob3VsZEJlQmxvY2tlZCh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghY2hlY2twb2ludCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIEludmFsaWQgcmVxdWVzdCBJRFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9yZXF1ZXN0cy5sZW5ndGggLSAxOyBpID49IDA7IGkgLT0gMSkge1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHRoaXMuX3JlcXVlc3RzW2ldO1xuXHRcdFx0aWYgKHRoaXMuX2NoZWNrcG9pbnQgJiYgIWNoZWNrcG9pbnQpIHtcblx0XHRcdFx0cmVxdWVzdC5zZXRTaG91bGRCZUJsb2NrZWQoZmFsc2UpO1xuXHRcdFx0XHRpZiAocmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRcdHJlcXVlc3QucmVzcG9uc2Uuc2V0QmxvY2tlZFN0YXRlKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChjaGVja3BvaW50ICYmIGkgPj0gY2hlY2twb2ludEluZGV4KSB7XG5cdFx0XHRcdHJlcXVlc3Quc2V0U2hvdWxkQmVCbG9ja2VkKHRydWUpO1xuXHRcdFx0XHRpZiAocmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRcdHJlcXVlc3QucmVzcG9uc2Uuc2V0QmxvY2tlZFN0YXRlKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGNoZWNrcG9pbnQgJiYgaSA8IGNoZWNrcG9pbnRJbmRleCkge1xuXHRcdFx0XHRyZXF1ZXN0LnNldFNob3VsZEJlQmxvY2tlZChmYWxzZSk7XG5cdFx0XHRcdGlmIChyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZS5zZXRCbG9ja2VkU3RhdGUoZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2hlY2twb2ludCA9IGNoZWNrcG9pbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9jaGVja3BvaW50OiBDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IGNoZWNrcG9pbnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoZWNrcG9pbnQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXREaXNhYmxlZFJlcXVlc3RzKHJlcXVlc3RJZHM6IElDaGF0UmVxdWVzdERpc2FibGVtZW50W10pIHtcblx0XHR0aGlzLl9yZXF1ZXN0cy5mb3JFYWNoKChyZXF1ZXN0KSA9PiB7XG5cdFx0XHRjb25zdCBzaG91bGRCZVJlbW92ZWRPblNlbmQgPSByZXF1ZXN0SWRzLmZpbmQociA9PiByLnJlcXVlc3RJZCA9PT0gcmVxdWVzdC5pZCk7XG5cdFx0XHRyZXF1ZXN0LnNob3VsZEJlUmVtb3ZlZE9uU2VuZCA9IHNob3VsZEJlUmVtb3ZlZE9uU2VuZDtcblx0XHRcdGlmIChyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRcdHJlcXVlc3QucmVzcG9uc2Uuc2hvdWxkQmVSZW1vdmVkT25TZW5kID0gc2hvdWxkQmVSZW1vdmVkT25TZW5kO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdzZXRIaWRkZW4nIH0pO1xuXHR9XG5cblx0YWRkUmVxdWVzdChcblx0XHRtZXNzYWdlOiBJUGFyc2VkQ2hhdFJlcXVlc3QsXG5cdFx0dmFyaWFibGVEYXRhOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEsXG5cdFx0YXR0ZW1wdDogbnVtYmVyLFxuXHRcdG1vZGVJbmZvPzogSUNoYXRSZXF1ZXN0TW9kZUluZm8sXG5cdFx0Y2hhdEFnZW50PzogSUNoYXRBZ2VudERhdGEsXG5cdFx0c2xhc2hDb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQsXG5cdFx0Y29uZmlybWF0aW9uPzogc3RyaW5nLFxuXHRcdGxvY2F0aW9uRGF0YT86IElDaGF0TG9jYXRpb25EYXRhLFxuXHRcdGF0dGFjaG1lbnRzPzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdLFxuXHRcdGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q/OiBib29sZWFuLFxuXHRcdG1vZGVsSWQ/OiBzdHJpbmcsXG5cdFx0dXNlclNlbGVjdGVkVG9vbHM/OiBVc2VyU2VsZWN0ZWRUb29scyxcblx0XHRpZD86IHN0cmluZyxcblx0XHRpc1N5c3RlbUluaXRpYXRlZD86IGJvb2xlYW4sXG5cdFx0c3lzdGVtSW5pdGlhdGVkTGFiZWw/OiBzdHJpbmcsXG5cdFx0dGVybWluYWxFeGVjdXRpb25JZD86IHN0cmluZyxcblx0XHRpc1Rlcm1pbmFsQ29tbWFuZD86IGJvb2xlYW4sXG5cdFx0dGltZXN0YW1wPzogbnVtYmVyIHwgbnVsbCxcblx0XHRoaWRlRnJvbVRyYW5zY3JpcHQ/OiBib29sZWFuLFxuXHRcdG9yaWdpbj86IElDaGF0UmVxdWVzdE9yaWdpbixcblx0KTogQ2hhdFJlcXVlc3RNb2RlbCB7XG5cdFx0Y29uc3QgZWRpdGVkRmlsZUV2ZW50cyA9IFsuLi50aGlzLmN1cnJlbnRFZGl0ZWRGaWxlRXZlbnRzLnZhbHVlcygpXTtcblx0XHR0aGlzLmN1cnJlbnRFZGl0ZWRGaWxlRXZlbnRzLmNsZWFyKCk7XG5cdFx0Y29uc3QgcmVxdWVzdFRpbWVzdGFtcCA9IHRpbWVzdGFtcCA9PT0gdW5kZWZpbmVkXG5cdFx0XHQ/IERhdGUubm93KClcblx0XHRcdDogdHlwZW9mIHRpbWVzdGFtcCA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHRpbWVzdGFtcCkgJiYgdGltZXN0YW1wID4gMFxuXHRcdFx0XHQ/IHRpbWVzdGFtcFxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXF1ZXN0ID0gbmV3IENoYXRSZXF1ZXN0TW9kZWwoe1xuXHRcdFx0cmVzdG9yZWRJZDogaWQsXG5cdFx0XHRzZXNzaW9uOiB0aGlzLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHZhcmlhYmxlRGF0YSxcblx0XHRcdHRpbWVzdGFtcDogcmVxdWVzdFRpbWVzdGFtcCxcblx0XHRcdGZhbGxiYWNrVGltZXN0YW1wOiB0aGlzLl90aW1lc3RhbXAsXG5cdFx0XHRhdHRlbXB0LFxuXHRcdFx0bW9kZUluZm8sXG5cdFx0XHRjb25maXJtYXRpb24sXG5cdFx0XHRsb2NhdGlvbkRhdGEsXG5cdFx0XHRhdHRhY2hlZENvbnRleHQ6IGF0dGFjaG1lbnRzLFxuXHRcdFx0aXNDb21wbGV0ZUFkZGVkUmVxdWVzdCxcblx0XHRcdG1vZGVsSWQsXG5cdFx0XHRlZGl0ZWRGaWxlRXZlbnRzOiBlZGl0ZWRGaWxlRXZlbnRzLmxlbmd0aCA/IGVkaXRlZEZpbGVFdmVudHMgOiB1bmRlZmluZWQsXG5cdFx0XHR1c2VyU2VsZWN0ZWRUb29scyxcblx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkLFxuXHRcdFx0aXNIaWRkZW5Gcm9tVHJhbnNjcmlwdDogaGlkZUZyb21UcmFuc2NyaXB0LFxuXHRcdFx0c3lzdGVtSW5pdGlhdGVkTGFiZWwsXG5cdFx0XHR0ZXJtaW5hbEV4ZWN1dGlvbklkLFxuXHRcdFx0aXNUZXJtaW5hbENvbW1hbmQsXG5cdFx0XHRvcmlnaW4sXG5cdFx0fSk7XG5cdFx0cmVxdWVzdC5yZXNwb25zZSA9IG5ldyBDaGF0UmVzcG9uc2VNb2RlbCh7XG5cdFx0XHRyZXNwb25zZUNvbnRlbnQ6IFtdLFxuXHRcdFx0c2Vzc2lvbjogdGhpcyxcblx0XHRcdGFnZW50OiBjaGF0QWdlbnQsXG5cdFx0XHRzbGFzaENvbW1hbmQsXG5cdFx0XHRyZXF1ZXN0SWQ6IHJlcXVlc3QuaWQsXG5cdFx0XHRpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0LFxuXHRcdFx0Y29kZUJsb2NrSW5mb3M6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHR0aGlzLl9yZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdG1hcmtDaGF0KHRoaXMuc2Vzc2lvblJlc291cmNlLCBDaGF0UGVyZk1hcmsuUmVxdWVzdFVpVXBkYXRlZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdhZGRSZXF1ZXN0JywgcmVxdWVzdCB9KTtcblx0XHRyZXR1cm4gcmVxdWVzdDtcblx0fVxuXG5cdHB1YmxpYyBzZXRDdXN0b21UaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VzdG9tVGl0bGUgPSB0aXRsZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsga2luZDogJ3NldEN1c3RvbVRpdGxlJywgdGl0bGUgfSk7XG5cdH1cblxuXHR1cGRhdGVSZXF1ZXN0KHJlcXVlc3Q6IENoYXRSZXF1ZXN0TW9kZWwsIHZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhKSB7XG5cdFx0cmVxdWVzdC52YXJpYWJsZURhdGEgPSB2YXJpYWJsZURhdGE7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdjaGFuZ2VkUmVxdWVzdCcsIHJlcXVlc3QgfSk7XG5cdH1cblxuXHRhZG9wdFJlcXVlc3QocmVxdWVzdDogQ2hhdFJlcXVlc3RNb2RlbCk6IHZvaWQge1xuXHRcdC8vIHRoaXMgZG9lc24ndCB1c2UgYHJlbW92ZVJlcXVlc3RgIGJlY2F1c2UgaXQgbXVzdCBub3QgZGlzcG9zZSB0aGUgcmVxdWVzdCBvYmplY3Rcblx0XHRjb25zdCBvbGRPd25lciA9IHJlcXVlc3Quc2Vzc2lvbjtcblx0XHRjb25zdCBpbmRleCA9IG9sZE93bmVyLl9yZXF1ZXN0cy5maW5kSW5kZXgoKGNhbmRpZGF0ZTogQ2hhdFJlcXVlc3RNb2RlbCkgPT4gY2FuZGlkYXRlLmlkID09PSByZXF1ZXN0LmlkKTtcblxuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRvbGRPd25lci5fcmVxdWVzdHMuc3BsaWNlKGluZGV4LCAxKTtcblxuXHRcdHJlcXVlc3QuYWRvcHRUbyh0aGlzKTtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5hZG9wdFRvKHRoaXMpO1xuXHRcdHRoaXMuX3JlcXVlc3RzLnB1c2gocmVxdWVzdCk7XG5cblx0XHRvbGRPd25lci5fb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdyZW1vdmVSZXF1ZXN0JywgcmVxdWVzdElkOiByZXF1ZXN0LmlkLCByZXNwb25zZUlkOiByZXF1ZXN0LnJlc3BvbnNlPy5pZCwgcmVhc29uOiBDaGF0UmVxdWVzdFJlbW92YWxSZWFzb24uQWRvcHRpb24gfSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGtpbmQ6ICdhZGRSZXF1ZXN0JywgcmVxdWVzdCB9KTtcblx0fVxuXG5cdGFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdDogQ2hhdFJlcXVlc3RNb2RlbCwgcHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3MsIHF1aWV0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghcmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0cmVxdWVzdC5yZXNwb25zZSA9IG5ldyBDaGF0UmVzcG9uc2VNb2RlbCh7XG5cdFx0XHRcdHJlc3BvbnNlQ29udGVudDogW10sXG5cdFx0XHRcdHNlc3Npb246IHRoaXMsXG5cdFx0XHRcdHJlcXVlc3RJZDogcmVxdWVzdC5pZCxcblx0XHRcdFx0Y29kZUJsb2NrSW5mb3M6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChyZXF1ZXN0LnJlc3BvbnNlLmlzQ29tcGxldGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignYWNjZXB0UmVzcG9uc2VQcm9ncmVzczogQWRkaW5nIHByb2dyZXNzIHRvIGEgY29tcGxldGVkIHJlc3BvbnNlJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHByb2dyZXNzLmtpbmQgPT09ICd1c2FnZScpIHtcblx0XHRcdHJlcXVlc3QucmVzcG9uc2Uuc2V0VXNhZ2UocHJvZ3Jlc3MpO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ3VzZWRDb250ZXh0JyB8fCBwcm9ncmVzcy5raW5kID09PSAncmVmZXJlbmNlJykge1xuXHRcdFx0cmVxdWVzdC5yZXNwb25zZS5hcHBseVJlZmVyZW5jZShwcm9ncmVzcyk7XG5cdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAnY29kZUNpdGF0aW9uJykge1xuXHRcdFx0cmVxdWVzdC5yZXNwb25zZS5hcHBseUNvZGVDaXRhdGlvbihwcm9ncmVzcyk7XG5cdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAnbW92ZScpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAnbW92ZScsIHRhcmdldDogcHJvZ3Jlc3MudXJpLCByYW5nZTogcHJvZ3Jlc3MucmFuZ2UgfSk7XG5cdFx0fSBlbHNlIGlmIChwcm9ncmVzcy5raW5kID09PSAnY29kZWJsb2NrVXJpJyAmJiBwcm9ncmVzcy5pc0VkaXQpIHtcblx0XHRcdHJlcXVlc3QucmVzcG9uc2UuYWRkVW5kb1N0b3AoeyBpZDogcHJvZ3Jlc3MudW5kb1N0b3BJZCA/PyBnZW5lcmF0ZVV1aWQoKSwga2luZDogJ3VuZG9TdG9wJyB9KTtcblx0XHRcdHJlcXVlc3QucmVzcG9uc2UudXBkYXRlQ29udGVudChwcm9ncmVzcywgcXVpZXQpO1xuXHRcdH0gZWxzZSBpZiAocHJvZ3Jlc3Mua2luZCA9PT0gJ3Byb2dyZXNzVGFza1Jlc3VsdCcpIHtcblx0XHRcdC8vIFNob3VsZCBoYXZlIGJlZW4gaGFuZGxlZCB1cHN0cmVhbSwgbm90IHNlbnQgdG8gbW9kZWxcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgQ291bGRuJ3QgaGFuZGxlIHByb2dyZXNzOiAke0pTT04uc3RyaW5naWZ5KHByb2dyZXNzKX1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVxdWVzdC5yZXNwb25zZS51cGRhdGVDb250ZW50KHByb2dyZXNzLCBxdWlldCk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlUmVxdWVzdChpZDogc3RyaW5nLCByZWFzb246IENoYXRSZXF1ZXN0UmVtb3ZhbFJlYXNvbiA9IENoYXRSZXF1ZXN0UmVtb3ZhbFJlYXNvbi5SZW1vdmFsKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9yZXF1ZXN0cy5maW5kSW5kZXgocmVxdWVzdCA9PiByZXF1ZXN0LmlkID09PSBpZCk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IHRoaXMuX3JlcXVlc3RzW2luZGV4XTtcblxuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAncmVtb3ZlUmVxdWVzdCcsIHJlcXVlc3RJZDogcmVxdWVzdC5pZCwgcmVzcG9uc2VJZDogcmVxdWVzdC5yZXNwb25zZT8uaWQsIHJlYXNvbiB9KTtcblx0XHRcdHRoaXMuX3JlcXVlc3RzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Y2FuY2VsUmVxdWVzdChyZXF1ZXN0OiBDaGF0UmVxdWVzdE1vZGVsKTogdm9pZCB7XG5cdFx0aWYgKHJlcXVlc3QucmVzcG9uc2UpIHtcblx0XHRcdHJlcXVlc3QucmVzcG9uc2UuY2FuY2VsKCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0UmVzcG9uc2UocmVxdWVzdDogQ2hhdFJlcXVlc3RNb2RlbCwgcmVzdWx0OiBJQ2hhdEFnZW50UmVzdWx0KTogdm9pZCB7XG5cdFx0aWYgKCFyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRyZXF1ZXN0LnJlc3BvbnNlID0gbmV3IENoYXRSZXNwb25zZU1vZGVsKHtcblx0XHRcdFx0cmVzcG9uc2VDb250ZW50OiBbXSxcblx0XHRcdFx0c2Vzc2lvbjogdGhpcyxcblx0XHRcdFx0cmVxdWVzdElkOiByZXF1ZXN0LmlkLFxuXHRcdFx0XHRjb2RlQmxvY2tJbmZvczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmVxdWVzdC5yZXNwb25zZS5zZXRSZXN1bHQocmVzdWx0KTtcblx0fVxuXG5cdHNldEZvbGxvd3VwcyhyZXF1ZXN0OiBDaGF0UmVxdWVzdE1vZGVsLCBmb2xsb3d1cHM6IElDaGF0Rm9sbG93dXBbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghcmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0Ly8gTWF5YmUgc29tZXRoaW5nIHdlbnQgd3Jvbmc/XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJlcXVlc3QucmVzcG9uc2Uuc2V0Rm9sbG93dXBzKGZvbGxvd3Vwcyk7XG5cdH1cblxuXHRzZXRSZXNwb25zZU1vZGVsKHJlcXVlc3Q6IENoYXRSZXF1ZXN0TW9kZWwsIHJlc3BvbnNlOiBDaGF0UmVzcG9uc2VNb2RlbCk6IHZvaWQge1xuXHRcdHJlcXVlc3QucmVzcG9uc2UgPSByZXNwb25zZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsga2luZDogJ2FkZFJlc3BvbnNlJywgcmVzcG9uc2UgfSk7XG5cdH1cblxuXHR0b0V4cG9ydCgpOiBJRXhwb3J0YWJsZUNoYXREYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzcG9uZGVyVXNlcm5hbWU6IHRoaXMucmVzcG9uZGVyVXNlcm5hbWUsXG5cdFx0XHRpbml0aWFsTG9jYXRpb246IHRoaXMuaW5pdGlhbExvY2F0aW9uLFxuXHRcdFx0cmVxdWVzdHM6IHRoaXMuX3JlcXVlc3RzLm1hcCgocik6IElTZXJpYWxpemFibGVDaGF0UmVxdWVzdERhdGEgPT4ge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0ge1xuXHRcdFx0XHRcdC4uLnIubWVzc2FnZSxcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0XHRcdHBhcnRzOiByLm1lc3NhZ2UucGFydHMubWFwKChwOiBhbnkpID0+IHAgJiYgJ3RvSlNPTicgaW4gcCA/IChwLnRvSlNPTiBhcyBGdW5jdGlvbikoKSA6IHApXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGFnZW50ID0gci5yZXNwb25zZT8uYWdlbnQ7XG5cdFx0XHRcdGNvbnN0IGFnZW50SnNvbiA9IGFnZW50ICYmICd0b0pTT04nIGluIGFnZW50ID8gKGFnZW50LnRvSlNPTiBhcyBGdW5jdGlvbikoKSA6XG5cdFx0XHRcdFx0YWdlbnQgPyB7IC4uLmFnZW50IH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVxdWVzdElkOiByLmlkLFxuXHRcdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdFx0dmFyaWFibGVEYXRhOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEudG9FeHBvcnQoci52YXJpYWJsZURhdGEpLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiByLnJlc3BvbnNlID9cblx0XHRcdFx0XHRcdHIucmVzcG9uc2UuZW50aXJlUmVzcG9uc2UudmFsdWUuZmlsdGVyKGl0ZW0gPT4gaXRlbS5raW5kICE9PSAndm9pY2VQcm9ncmVzcycpLm1hcChpdGVtID0+IHtcblx0XHRcdFx0XHRcdFx0Ly8gS2VlcGluZyB0aGUgc2hhcGUgb2YgdGhlIHBlcnNpc3RlZCBkYXRhIHRoZSBzYW1lIGZvciBiYWNrIGNvbXBhdFxuXHRcdFx0XHRcdFx0XHRpZiAoaXRlbS5raW5kID09PSAndHJlZURhdGEnKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGl0ZW0udHJlZURhdGE7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXRlbS5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBpdGVtLmNvbnRlbnQ7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGl0ZW0gYXMgYW55OyAvLyBUT0RPXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzaG91bGRCZVJlbW92ZWRPblNlbmQ6IHIuc2hvdWxkQmVSZW1vdmVkT25TZW5kLFxuXHRcdFx0XHRcdGFnZW50OiBhZ2VudEpzb24sXG5cdFx0XHRcdFx0dGltZXN0YW1wOiByLnJlcXVlc3RUaW1lc3RhbXAsXG5cdFx0XHRcdFx0Y29uZmlybWF0aW9uOiByLmNvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRlZGl0ZWRGaWxlRXZlbnRzOiByLmVkaXRlZEZpbGVFdmVudHMsXG5cdFx0XHRcdFx0bW9kZWxJZDogci5tb2RlbElkLFxuXHRcdFx0XHRcdG1vZGVJbmZvOiByLm1vZGVJbmZvLFxuXHRcdFx0XHRcdGlzU3lzdGVtSW5pdGlhdGVkOiByLmlzU3lzdGVtSW5pdGlhdGVkIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRoaWRkZW5Gcm9tVHJhbnNjcmlwdDogci5pc0hpZGRlbkZyb21UcmFuc2NyaXB0IHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzeXN0ZW1Jbml0aWF0ZWRMYWJlbDogci5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCxcblx0XHRcdFx0XHR0ZXJtaW5hbEV4ZWN1dGlvbklkOiByLnRlcm1pbmFsRXhlY3V0aW9uSWQsXG5cdFx0XHRcdFx0b3JpZ2luOiByLm9yaWdpbiA/IHNlcmlhbGl6ZUNoYXRSZXF1ZXN0T3JpZ2luKHIub3JpZ2luKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHQuLi5yLnJlc3BvbnNlPy50b0pTT04oKSxcblx0XHRcdFx0fTtcblx0XHRcdH0pLFxuXHRcdH07XG5cdH1cblxuXHR0b0pTT04oKTogSVNlcmlhbGl6YWJsZUNoYXREYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dmVyc2lvbjogMyxcblx0XHRcdC4uLnRoaXMudG9FeHBvcnQoKSxcblx0XHRcdHNlc3Npb25JZDogdGhpcy5zZXNzaW9uSWQsXG5cdFx0XHRjcmVhdGlvbkRhdGU6IHRoaXMuX3RpbWVzdGFtcCxcblx0XHRcdGN1c3RvbVRpdGxlOiB0aGlzLl9jdXN0b21UaXRsZSxcblx0XHRcdGlucHV0U3RhdGU6IHRoaXMuaW5wdXRNb2RlbC50b0pTT04oKSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHRoaXMuX3dvcmtpbmdEaXJlY3Rvcnk/LnRvU3RyaW5nKCksXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fcmVxdWVzdHMuZm9yRWFjaChyID0+IHIucmVzcG9uc2U/LmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5fb25EaWREaXNwb3NlLmZpcmUoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdC8vIE51bGwgb3V0IGhlYXZ5IGZpZWxkcyB0byBicmVhayByZXRlbnRpb24gY2hhaW5zLiBFdmVuIGFmdGVyIGRpc3Bvc2FsLFxuXHRcdC8vIHN0YWxlIHJlZmVyZW5jZXMgKGNsb3N1cmVzLCBjYWNoZWQgdGVtcGxhdGVzLCBldGMuKSBtYXkgcHJldmVudCBHQ1xuXHRcdC8vIGZyb20gY29sbGVjdGluZyB0aGlzIG9iamVjdC4gQ2xlYXJpbmcgdGhlc2UgZmllbGRzIGVuc3VyZXMgdGhlXG5cdFx0Ly8gY29udmVyc2F0aW9uIGRhdGEsIHNlcmlhbGl6YXRpb24gc25hcHNob3QsIGFuZCBlZGl0aW5nIHNlc3Npb24gYXJlXG5cdFx0Ly8gZnJlZWQgcmVnYXJkbGVzcy5cblx0XHR0aGlzLl9yZXF1ZXN0cy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuZGF0YVNlcmlhbGl6ZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZWRpdGluZ1Nlc3Npb24gPSB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVJhbmdlcyh2YXJpYWJsZURhdGE6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSwgZGlmZjogbnVtYmVyKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhIHtcblx0cmV0dXJuIHtcblx0XHR2YXJpYWJsZXM6IHZhcmlhYmxlRGF0YS52YXJpYWJsZXMubWFwKHYgPT4gKHtcblx0XHRcdC4uLnYsXG5cdFx0XHRyYW5nZTogdi5yYW5nZSAmJiB7XG5cdFx0XHRcdHN0YXJ0OiB2LnJhbmdlLnN0YXJ0IC0gZGlmZixcblx0XHRcdFx0ZW5kRXhjbHVzaXZlOiB2LnJhbmdlLmVuZEV4Y2x1c2l2ZSAtIGRpZmZcblx0XHRcdH1cblx0XHR9KSlcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNhbk1lcmdlTWFya2Rvd25TdHJpbmdzKG1kMTogSU1hcmtkb3duU3RyaW5nLCBtZDI6IElNYXJrZG93blN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAobWQxLmJhc2VVcmkgJiYgbWQyLmJhc2VVcmkpIHtcblx0XHRjb25zdCBiYXNlVXJpRXF1YWxzID0gbWQxLmJhc2VVcmkuc2NoZW1lID09PSBtZDIuYmFzZVVyaS5zY2hlbWVcblx0XHRcdCYmIG1kMS5iYXNlVXJpLmF1dGhvcml0eSA9PT0gbWQyLmJhc2VVcmkuYXV0aG9yaXR5XG5cdFx0XHQmJiBtZDEuYmFzZVVyaS5wYXRoID09PSBtZDIuYmFzZVVyaS5wYXRoXG5cdFx0XHQmJiBtZDEuYmFzZVVyaS5xdWVyeSA9PT0gbWQyLmJhc2VVcmkucXVlcnlcblx0XHRcdCYmIG1kMS5iYXNlVXJpLmZyYWdtZW50ID09PSBtZDIuYmFzZVVyaS5mcmFnbWVudDtcblx0XHRpZiAoIWJhc2VVcmlFcXVhbHMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH0gZWxzZSBpZiAobWQxLmJhc2VVcmkgfHwgbWQyLmJhc2VVcmkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gZXF1YWxzKG1kMS5pc1RydXN0ZWQsIG1kMi5pc1RydXN0ZWQpICYmXG5cdFx0bWQxLnN1cHBvcnRIdG1sID09PSBtZDIuc3VwcG9ydEh0bWwgJiZcblx0XHRtZDEuc3VwcG9ydFRoZW1lSWNvbnMgPT09IG1kMi5zdXBwb3J0VGhlbWVJY29ucztcbn1cblxuZnVuY3Rpb24gaXNOZXN0ZWRTdWJhZ2VudFJlc3BvbnNlUGFydChwYXJ0OiBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiAnc3ViQWdlbnRJbnZvY2F0aW9uSWQnIGluIHBhcnQgJiYgISFwYXJ0LnN1YkFnZW50SW52b2NhdGlvbklkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kTWFya2Rvd25TdHJpbmcobWQxOiBJTWFya2Rvd25TdHJpbmcsIG1kMjogSU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nKTogSU1hcmtkb3duU3RyaW5nIHtcblx0Y29uc3QgYXBwZW5kZWRWYWx1ZSA9IHR5cGVvZiBtZDIgPT09ICdzdHJpbmcnID8gbWQyIDogbWQyLnZhbHVlO1xuXHRyZXR1cm4ge1xuXHRcdHZhbHVlOiBtZDEudmFsdWUgKyBhcHBlbmRlZFZhbHVlLFxuXHRcdGlzVHJ1c3RlZDogbWQxLmlzVHJ1c3RlZCxcblx0XHRzdXBwb3J0VGhlbWVJY29uczogbWQxLnN1cHBvcnRUaGVtZUljb25zLFxuXHRcdHN1cHBvcnRIdG1sOiBtZDEuc3VwcG9ydEh0bWwsXG5cdFx0YmFzZVVyaTogbWQxLmJhc2VVcmlcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvZGVDaXRhdGlvbnNNZXNzYWdlKGNpdGF0aW9uczogUmVhZG9ubHlBcnJheTxJQ2hhdENvZGVDaXRhdGlvbj4pOiBzdHJpbmcge1xuXHRpZiAoY2l0YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdGNvbnN0IGxpY2Vuc2VUeXBlcyA9IGNpdGF0aW9ucy5yZWR1Y2UoKHNldCwgYykgPT4gc2V0LmFkZChjLmxpY2Vuc2UpLCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdGNvbnN0IGxhYmVsID0gbGljZW5zZVR5cGVzLnNpemUgPT09IDEgP1xuXHRcdGxvY2FsaXplKCdjb2RlQ2l0YXRpb24nLCBcIlNpbWlsYXIgY29kZSBmb3VuZCB3aXRoIDEgbGljZW5zZSB0eXBlXCIsIGxpY2Vuc2VUeXBlcy5zaXplKSA6XG5cdFx0bG9jYWxpemUoJ2NvZGVDaXRhdGlvbnMnLCBcIlNpbWlsYXIgY29kZSBmb3VuZCB3aXRoIHswfSBsaWNlbnNlIHR5cGVzXCIsIGxpY2Vuc2VUeXBlcy5zaXplKTtcblx0cmV0dXJuIGxhYmVsO1xufVxuXG4vKipcbiAqIENvbnZlcnRzIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zIHRvIGEgc2VyaWFsaXphYmxlIGZvcm1hdCBieSBleHRyYWN0aW5nIG9ubHlcbiAqIHNlcmlhbGl6YWJsZSBmaWVsZHMgYW5kIGNvbnZlcnRpbmcgb2JzZXJ2YWJsZXMgdG8gc3RhdGljIHZhbHVlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlcmlhbGl6ZVNlbmRPcHRpb25zKG9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zKTogSVNlcmlhbGl6YWJsZVNlbmRPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHRtb2RlSW5mbzogb3B0aW9ucy5tb2RlSW5mbyxcblx0XHR1c2VyU2VsZWN0ZWRNb2RlbElkOiBvcHRpb25zLnVzZXJTZWxlY3RlZE1vZGVsSWQsXG5cdFx0dXNlclNlbGVjdGVkTW9kZWxDb25maWd1cmF0aW9uOiBvcHRpb25zLnVzZXJTZWxlY3RlZE1vZGVsQ29uZmlndXJhdGlvbixcblx0XHR1c2VyU2VsZWN0ZWRUb29sczogb3B0aW9ucy51c2VyU2VsZWN0ZWRUb29scz8uZ2V0KCksXG5cdFx0aW5zdHJ1Y3Rpb25Db250ZXh0OiBvcHRpb25zLmluc3RydWN0aW9uQ29udGV4dCxcblx0XHRsb2NhdGlvbjogb3B0aW9ucy5sb2NhdGlvbixcblx0XHRsb2NhdGlvbkRhdGE6IG9wdGlvbnMubG9jYXRpb25EYXRhLFxuXHRcdGF0dGVtcHQ6IG9wdGlvbnMuYXR0ZW1wdCxcblx0XHRub0NvbW1hbmREZXRlY3Rpb246IG9wdGlvbnMubm9Db21tYW5kRGV0ZWN0aW9uLFxuXHRcdGlzVm9pY2VNb2RlSW5wdXQ6IG9wdGlvbnMuaXNWb2ljZU1vZGVJbnB1dCxcblx0XHRhZ2VudElkOiBvcHRpb25zLmFnZW50SWQsXG5cdFx0YWdlbnRJZFNpbGVudDogb3B0aW9ucy5hZ2VudElkU2lsZW50LFxuXHRcdHNsYXNoQ29tbWFuZDogb3B0aW9ucy5zbGFzaENvbW1hbmQsXG5cdFx0Y29uZmlybWF0aW9uOiBvcHRpb25zLmNvbmZpcm1hdGlvbixcblx0XHRpc1N5c3RlbUluaXRpYXRlZDogb3B0aW9ucy5pc1N5c3RlbUluaXRpYXRlZCxcblx0XHRoaWRlRnJvbVRyYW5zY3JpcHQ6IG9wdGlvbnMuaGlkZUZyb21UcmFuc2NyaXB0LFxuXHRcdHN5c3RlbUluaXRpYXRlZExhYmVsOiBvcHRpb25zLnN5c3RlbUluaXRpYXRlZExhYmVsLFxuXHRcdHRlcm1pbmFsRXhlY3V0aW9uSWQ6IG9wdGlvbnMudGVybWluYWxFeGVjdXRpb25JZCxcblx0fTtcbn1cblxuZXhwb3J0IGVudW0gQ2hhdFJlcXVlc3RFZGl0ZWRGaWxlRXZlbnRLaW5kIHtcblx0S2VlcCA9IDEsXG5cdFVuZG8gPSAyLFxuXHRVc2VyTW9kaWZpY2F0aW9uID0gMyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEFnZW50RWRpdGVkRmlsZUV2ZW50IHtcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IGV2ZW50S2luZDogQ2hhdFJlcXVlc3RFZGl0ZWRGaWxlRXZlbnRLaW5kO1xufVxuXG4vKiogVVJJIGZvciBhIHJlc291cmNlIGVtYmVkZGVkIGluIGEgY2hhdCByZXF1ZXN0L3Jlc3BvbnNlICovXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZVJlc291cmNlIHtcblx0ZXhwb3J0IGNvbnN0IHNjaGVtZSA9IFNjaGVtYXMudnNjb2RlQ2hhdFJlc3BvbnNlUmVzb3VyY2U7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVVyaShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCBpbmRleDogbnVtYmVyLCBiYXNlbmFtZT86IHN0cmluZyk6IFVSSSB7XG5cdFx0cmV0dXJuIFVSSS5mcm9tKHtcblx0XHRcdHNjaGVtZTogQ2hhdFJlc3BvbnNlUmVzb3VyY2Uuc2NoZW1lLFxuXHRcdFx0YXV0aG9yaXR5OiBlbmNvZGVIZXgoVlNCdWZmZXIuZnJvbVN0cmluZyhzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkpLFxuXHRcdFx0cGF0aDogYC90b29sLyR7dG9vbENhbGxJZH0vJHtpbmRleH1gICsgKGJhc2VuYW1lID8gYC8ke2Jhc2VuYW1lfWAgOiAnJyksXG5cdFx0fSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gcGFyc2VVcmkodXJpOiBVUkkpOiB1bmRlZmluZWQgfCB7IHNlc3Npb25SZXNvdXJjZTogVVJJOyB0b29sQ2FsbElkOiBzdHJpbmc7IGluZGV4OiBudW1iZXIgfSB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgIT09IENoYXRSZXNwb25zZVJlc291cmNlLnNjaGVtZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0cyA9IHVyaS5wYXRoLnNwbGl0KCcvJyk7XG5cdFx0aWYgKHBhcnRzLmxlbmd0aCA8IDQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgWywga2luZCwgdG9vbENhbGxJZCwgaW5kZXhdID0gcGFydHM7XG5cdFx0aWYgKGtpbmQgIT09ICd0b29sJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZShkZWNvZGVIZXgodXJpLmF1dGhvcml0eSkudG9TdHJpbmcoKSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikgeyAvLyBwcmUtMS4xMDggbG9jYWwgc2Vzc2lvbiBJRFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24odXJpLmF1dGhvcml0eSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHR0b29sQ2FsbElkOiB0b29sQ2FsbElkLFxuXHRcdFx0aW5kZXg6IE51bWJlcihpbmRleCksXG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiBfbG9nQ2hhbmdlc1RvU3RhdGVNb2RlbChuZXdTdGF0ZTogUGFydGlhbDxJQ2hhdE1vZGVsSW5wdXRTdGF0ZT4gfCB1bmRlZmluZWQsIG9sZFN0YXRlOiBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPiB8IHVuZGVmaW5lZCwgbG9nZ2VyOiBJTG9nU2VydmljZSwgc2Vzc2lvbklkOiBzdHJpbmcpIHtcblx0aWYgKCFjYW5Mb2cobG9nZ2VyLmdldExldmVsKCksIExvZ0xldmVsLkRlYnVnKSB8fCBuZXdTdGF0ZT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllciA9PT0gb2xkU3RhdGU/LnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXIpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3Qgc3RhY2sgPSBuZXcgRXJyb3IoKS5zdGFjaztcblx0Y29uc3QgbWVzc2FnZSA9IGBbQ2hhdE1vZGVsQ2hhbmdlZF0gQ2hhdE1vZGVsIElucHV0IFN0YXRlIG1vZGVsIGNoYW5nZWQ6ICR7bmV3U3RhdGU/LnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXJ9ICh3YXM6ICR7b2xkU3RhdGU/LnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXJ9KSBpbiBzZXNzaW9uICR7c2Vzc2lvbklkfSAke3N0YWNrfWA7XG5cdGxvZ2dlci5kZWJ1ZyhtZXNzYWdlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwobW9kZWw6IElJbnB1dE1vZGVsIHwgdW5kZWZpbmVkLCBtZXNzYWdlOiBzdHJpbmcsIG5ld1N0YXRlOiBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPiB8IHVuZGVmaW5lZCwgb2xkU3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+IHwgdW5kZWZpbmVkLCBsb2dnZXI6IElMb2dTZXJ2aWNlKSB7XG5cdGlmICghY2FuTG9nKGxvZ2dlci5nZXRMZXZlbCgpLCBMb2dMZXZlbC5EZWJ1ZykpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0bWVzc2FnZSA9IFttZXNzYWdlLFxuXHRcdGBtb2RlbC5zZWxlY3RlZE1vZGVsOiAke21vZGVsPy5zdGF0ZS5nZXQoKT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcn1gLFxuXHRcdGBuZXcgc3RhdGU6ICR7bmV3U3RhdGU/LnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXJ9YCxcblx0XHRgb2xkIHN0YXRlOiAke29sZFN0YXRlPy5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyfWAsXG5cdFx0bmV3IEVycm9yKCkuc3RhY2tcblx0XS5qb2luKCcsICcpO1xuXG5cdGxvZ2dlci5kZWJ1ZyhgW0NoYXRNb2RlbENoYW5nZWRdIENoYXQgTW9kZWwgQ2hhbmdlZCwke21lc3NhZ2V9YCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFVBQVUsV0FBVyxpQkFBaUI7QUFFL0MsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGlDQUFrRCxnQkFBZ0Isd0JBQXdCO0FBQ25HLFNBQVMsWUFBWSxpQkFBOEIseUJBQXlCO0FBQzVFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQXNCLFNBQVMsaUJBQWlCLFNBQVMscUJBQXFCLDJCQUEyQixpQkFBaUIscUJBQXFCLHFDQUFxQztBQUNwTCxTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLGNBQWdDO0FBQ3pDLFNBQVMsV0FBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxtQkFBbUI7QUFJNUIsU0FB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Q0Q7QUEvQk8sRUFBQUEsc0JBQVM7QUFBQSxHQVhBO0FBNkNqQixTQUFTLHdCQUF3QixVQUFxRCxVQUFxRCxRQUFxQixXQUFtQjtBQUNsTCxNQUFJLENBQUMsT0FBTyxPQUFPLFNBQVMsR0FBRyxTQUFTLEtBQUssS0FBSyxVQUFVLGVBQWUsZUFBZSxVQUFVLGVBQWUsWUFBWTtBQUM5SDtBQUFBLEVBQ0Q7QUFDQSxRQUFNLFFBQVEsSUFBSSxNQUFNLEVBQUU7QUFDMUIsUUFBTSxVQUFVLDJEQUEyRCxVQUFVLGVBQWUsVUFBVSxVQUFVLFVBQVUsZUFBZSxVQUFVLGdCQUFnQixTQUFTLElBQUksS0FBSztBQUM3TCxTQUFPLE1BQU0sT0FBTztBQUNyQjtBQUVPLFNBQVMsdUJBQXVCLE9BQWdDLFNBQWlCLFVBQXFELFVBQXFELFFBQXFCO0FBQ3ROLE1BQUksQ0FBQyxPQUFPLE9BQU8sU0FBUyxHQUFHLFNBQVMsS0FBSyxHQUFHO0FBQy9DO0FBQUEsRUFDRDtBQUNBLFlBQVU7QUFBQSxJQUFDO0FBQUEsSUFDVix3QkFBd0IsT0FBTyxNQUFNLElBQUksR0FBRyxlQUFlLFVBQVU7QUFBQSxJQUNyRSxjQUFjLFVBQVUsZUFBZSxVQUFVO0FBQUEsSUFDakQsY0FBYyxVQUFVLGVBQWUsVUFBVTtBQUFBLElBQ2pELElBQUksTUFBTSxFQUFFO0FBQUEsRUFDYixFQUFFLEtBQUssSUFBSTtBQUVYLFNBQU8sTUFBTSx5Q0FBeUMsT0FBTyxFQUFFO0FBQ2hFOyIsCiAgIm5hbWVzIjogWyJJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEiLCAiQ2hhdElucHV0U3RhdGVPcmlnaW4iLCAiQ2hhdFJlcXVlc3RSZW1vdmFsUmVhc29uIiwgInJlcXVlc3QiLCAiQ2hhdFJlcXVlc3RFZGl0ZWRGaWxlRXZlbnRLaW5kIiwgIkNoYXRSZXNwb25zZVJlc291cmNlIiwgImJhc2VuYW1lIl0KfQo=
