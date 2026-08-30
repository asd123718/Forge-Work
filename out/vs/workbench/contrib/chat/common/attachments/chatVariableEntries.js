import { Codicon } from "../../../../../base/common/codicons.js";
import { basename } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { isLocation } from "../../../../../editor/common/languages.js";
import { localize } from "../../../../../nls.js";
import { decodeBase64, encodeBase64, VSBuffer } from "../../../../../base/common/buffer.js";
function isChatContextIconPath(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  if (ThemeIcon.isThemeIcon(value) || URI.isUri(value)) {
    return true;
  }
  const asDualPath = value;
  return URI.isUri(asDualPath.light) && URI.isUri(asDualPath.dark);
}
function resolveChatContextIcon(iconPath, useDark) {
  if (ThemeIcon.isThemeIcon(iconPath) || URI.isUri(iconPath)) {
    return iconPath;
  }
  return useDark ? iconPath.dark : iconPath.light;
}
const ChatPasteAttachmentMetadata = {
  Kind: "vscode.chat.attachment.kind",
  Language: "vscode.chat.attachment.language",
  FileName: "vscode.chat.attachment.fileName",
  PastedLines: "vscode.chat.attachment.pastedLines",
  TextArtifact: "vscode.chat.attachment.textArtifact"
};
const ChatTranscriptContextMetadataKey = "vscode.chat.transcriptContext";
const ChatTranscriptContextAttachmentDisplayKind = "transcriptContext";
var AgentHostCompletionReferenceKind = /* @__PURE__ */ ((AgentHostCompletionReferenceKind2) => {
  AgentHostCompletionReferenceKind2["Skill"] = "skill";
  AgentHostCompletionReferenceKind2["Command"] = "command";
  return AgentHostCompletionReferenceKind2;
})(AgentHostCompletionReferenceKind || {});
function agentHostCompletionVariableValue(kind) {
  return { $mid: "agentHostCompletion", kind };
}
function agentHostCompletionVariableId(kind, reference) {
  switch (kind) {
    case "skill" /* Skill */:
      return reference.toString();
    case "command" /* Command */:
      return "agent-host-command:" + reference.toString();
  }
}
function toAgentHostCompletionVariableEntry(kind, name, reference, _meta) {
  return {
    kind: "generic",
    id: reference !== void 0 ? agentHostCompletionVariableId(kind, reference) : generateUuid(),
    name,
    value: agentHostCompletionVariableValue(kind),
    _meta
  };
}
function toAgentHostCompletionVariableEntryFromMetadata(kind, name, _meta) {
  switch (kind) {
    case "skill" /* Skill */:
      return toAgentHostCompletionVariableEntry(kind, name, typeof _meta?.uri === "string" ? _meta.uri : void 0, _meta);
    case "command" /* Command */:
      return toAgentHostCompletionVariableEntry(kind, name, typeof _meta?.command === "string" ? _meta.command : void 0, _meta);
  }
}
function getAgentHostCompletionReferenceKind(entry) {
  if (entry.kind !== "generic") {
    return void 0;
  }
  return getAgentHostCompletionReferenceKindFromValue(entry.value);
}
function getAgentHostCompletionReferenceKindFromValue(value) {
  if (typeof value !== "object" || value === null) {
    return void 0;
  }
  const record = value;
  if (record.$mid !== "agentHostCompletion") {
    return void 0;
  }
  switch (record.kind) {
    case "skill" /* Skill */:
    case "command" /* Command */:
      return record.kind;
  }
  return void 0;
}
function isAgentHostCompletionVariableEntry(entry) {
  return getAgentHostCompletionReferenceKind(entry) !== void 0;
}
var OmittedState = /* @__PURE__ */ ((OmittedState2) => {
  OmittedState2[OmittedState2["NotOmitted"] = 0] = "NotOmitted";
  OmittedState2[OmittedState2["Partial"] = 1] = "Partial";
  OmittedState2[OmittedState2["Full"] = 2] = "Full";
  OmittedState2[OmittedState2["ImageLimitExceeded"] = 3] = "ImageLimitExceeded";
  return OmittedState2;
})(OmittedState || {});
const CLAUDE_MESSAGES_MAX_IMAGES_PER_REQUEST = 20;
const GEMINI_MAX_IMAGES_PER_REQUEST = 10;
function getImageAttachmentLimit(model) {
  if (!model) {
    return void 0;
  }
  const family = model.family.toLowerCase();
  if (family.startsWith("gemini")) {
    return GEMINI_MAX_IMAGES_PER_REQUEST;
  }
  if (family.startsWith("claude") || family.startsWith("anthropic")) {
    return CLAUDE_MESSAGES_MAX_IMAGES_PER_REQUEST;
  }
  return void 0;
}
function toPasteVariableEntry(name, code, options) {
  const language = options?.language ?? "markdown";
  const fileName = options?.fileName ?? name;
  const pastedLines = options?.pastedLines ?? name;
  return {
    kind: "paste",
    id: options?.id ?? `chat-paste-${generateUuid()}`,
    name,
    icon: options?.icon,
    value: code,
    code,
    language,
    pastedLines,
    fileName,
    copiedFrom: void 0,
    _meta: {
      ...options?._meta,
      [ChatPasteAttachmentMetadata.Kind]: "paste",
      [ChatPasteAttachmentMetadata.Language]: language,
      [ChatPasteAttachmentMetadata.FileName]: fileName,
      [ChatPasteAttachmentMetadata.PastedLines]: pastedLines
    }
  };
}
function restorePasteVariableEntryFromAttachment(attachment) {
  const modelRepresentation = attachment.modelRepresentation;
  if (typeof modelRepresentation !== "string" || attachment._meta?.[ChatPasteAttachmentMetadata.Kind] !== "paste") {
    return void 0;
  }
  const stringMetadata = (key, fallback) => {
    const value = attachment._meta?.[key];
    return typeof value === "string" ? value : fallback;
  };
  return toPasteVariableEntry(attachment.label, modelRepresentation, {
    language: stringMetadata(ChatPasteAttachmentMetadata.Language, "markdown"),
    fileName: stringMetadata(ChatPasteAttachmentMetadata.FileName, attachment.label),
    pastedLines: stringMetadata(ChatPasteAttachmentMetadata.PastedLines, attachment.label),
    _meta: attachment._meta
  });
}
var IDiagnosticVariableEntryFilterData;
((IDiagnosticVariableEntryFilterData2) => {
  IDiagnosticVariableEntryFilterData2.icon = Codicon.error;
  function fromMarker(marker) {
    return {
      filterUri: marker.resource,
      owner: marker.owner,
      problemMessage: marker.message,
      filterRange: { startLineNumber: marker.startLineNumber, endLineNumber: marker.endLineNumber, startColumn: marker.startColumn, endColumn: marker.endColumn }
    };
  }
  IDiagnosticVariableEntryFilterData2.fromMarker = fromMarker;
  function toEntry(data) {
    return {
      id: id(data),
      name: label(data),
      icon: IDiagnosticVariableEntryFilterData2.icon,
      value: data,
      kind: "diagnostic",
      ...data
    };
  }
  IDiagnosticVariableEntryFilterData2.toEntry = toEntry;
  function id(data) {
    return [data.filterUri, data.owner, data.filterSeverity, data.filterRange?.startLineNumber, data.filterRange?.startColumn].join(":");
  }
  IDiagnosticVariableEntryFilterData2.id = id;
  function label(data) {
    let TrimThreshold;
    ((TrimThreshold2) => {
      TrimThreshold2[TrimThreshold2["MaxChars"] = 30] = "MaxChars";
      TrimThreshold2[TrimThreshold2["MaxSpaceLookback"] = 10] = "MaxSpaceLookback";
    })(TrimThreshold || (TrimThreshold = {}));
    if (data.problemMessage) {
      if (data.problemMessage.length < 30 /* MaxChars */) {
        return data.problemMessage;
      }
      const lastSpace = data.problemMessage.lastIndexOf(" ", 30 /* MaxChars */);
      if (lastSpace === -1 || lastSpace + 10 /* MaxSpaceLookback */ < 30 /* MaxChars */) {
        return data.problemMessage.substring(0, 30 /* MaxChars */) + "\u2026";
      }
      return data.problemMessage.substring(0, lastSpace) + "\u2026";
    }
    let labelStr = localize("chat.attachment.problems.all", "All Problems");
    if (data.filterUri) {
      labelStr = localize("chat.attachment.problems.inFile", "Problems in {0}", basename(data.filterUri));
    }
    return labelStr;
  }
  IDiagnosticVariableEntryFilterData2.label = label;
})(IDiagnosticVariableEntryFilterData || (IDiagnosticVariableEntryFilterData = {}));
function isBrowserViewVariableEntry(entry) {
  return entry.kind === "browserView";
}
function isChatReferenceVariableEntry(entry) {
  return entry.kind === "chatReference";
}
function chatReferenceVariableEntryId(chatResource, endTurn) {
  return endTurn === void 0 ? `agent-host-chat:${chatResource.toString()}` : `agent-host-chat:${chatResource.toString()}\0${endTurn}`;
}
function createChatReferenceVariableEntry(chatResource, endTurn, title, _meta, range) {
  return {
    kind: "chatReference",
    id: chatReferenceVariableEntryId(chatResource, endTurn),
    name: title,
    value: chatResource,
    endTurn,
    range,
    _meta
  };
}
function toChatReferenceDynamicVariableValue(chatResource, endTurn) {
  return endTurn === void 0 ? { $mid: "agentHostChatReference", chatResource: chatResource.toString() } : { $mid: "agentHostChatReference", chatResource: chatResource.toString(), endTurn };
}
function isChatReferenceDynamicVariableValue(value) {
  return typeof value === "object" && value !== null && value.$mid === "agentHostChatReference";
}
function chatReferenceVariableEntryFromDynamicValue(value, id, name, range, _meta) {
  let chatResource;
  try {
    chatResource = URI.parse(value.chatResource);
  } catch {
    return void 0;
  }
  return {
    kind: "chatReference",
    id,
    name,
    value: chatResource,
    endTurn: value.endTurn,
    range,
    _meta
  };
}
var IChatRequestVariableEntry;
((IChatRequestVariableEntry2) => {
  function toUri(entry) {
    return URI.isUri(entry.value) ? entry.value : isLocation(entry.value) ? entry.value.uri : void 0;
  }
  IChatRequestVariableEntry2.toUri = toUri;
  function toExport(v) {
    if (v.value instanceof Uint8Array) {
      const dup = { ...v };
      dup.value = { $base64: encodeBase64(VSBuffer.wrap(v.value)) };
      return dup;
    }
    if (isElementVariableEntry(v) && v.imageData instanceof Uint8Array) {
      return {
        ...v,
        imageData: { $base64: encodeBase64(VSBuffer.wrap(v.imageData)) }
      };
    }
    return v;
  }
  IChatRequestVariableEntry2.toExport = toExport;
  function fromExport(v) {
    if (v && "values" in v && Array.isArray(v.values)) {
      return {
        kind: "generic",
        id: v.id ?? "",
        name: v.name,
        value: v.values[0]?.value,
        range: v.range,
        modelDescription: v.modelDescription,
        references: v.references
      };
    } else {
      if (v.value && typeof v.value === "object" && "$base64" in v.value && typeof v.value.$base64 === "string") {
        const dup = { ...v };
        dup.value = decodeBase64(v.value.$base64).buffer;
        return dup;
      }
      if (isElementVariableEntry(v) && v.imageData && typeof v.imageData === "object" && "$base64" in v.imageData && typeof v.imageData.$base64 === "string") {
        return {
          ...v,
          imageData: decodeBase64(v.imageData.$base64).buffer
        };
      }
      return v;
    }
  }
  IChatRequestVariableEntry2.fromExport = fromExport;
})(IChatRequestVariableEntry || (IChatRequestVariableEntry = {}));
function isImplicitVariableEntry(obj) {
  return obj.kind === "implicit";
}
function isStringVariableEntry(obj) {
  return obj.kind === "string";
}
function isChatTranscriptContextVariableEntry(obj) {
  return obj.kind === "transcriptContext";
}
function toChatTranscriptContextAttachmentMeta(entry) {
  return {
    ...entry._meta,
    [ChatTranscriptContextMetadataKey]: {
      uri: entry.uri.toString(),
      iconId: entry.icon?.id,
      tooltip: entry.tooltip,
      fullName: entry.fullName
    }
  };
}
function restoreChatTranscriptContextVariableEntry(label, value, meta) {
  const raw = meta?.[ChatTranscriptContextMetadataKey];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return void 0;
  }
  const record = raw;
  if (typeof record.uri !== "string") {
    return void 0;
  }
  return {
    kind: "transcriptContext",
    id: generateUuid(),
    name: label,
    ...typeof record.fullName === "string" ? { fullName: record.fullName } : {},
    ...typeof record.iconId === "string" ? { icon: ThemeIcon.fromId(record.iconId) } : {},
    ...typeof record.tooltip === "string" ? { tooltip: record.tooltip } : {},
    value,
    uri: URI.parse(record.uri),
    _meta: meta
  };
}
function isTerminalVariableEntry(obj) {
  return obj.kind === "terminalCommand";
}
function isDebugVariableEntry(obj) {
  return obj.kind === "debugVariable";
}
function isAgentFeedbackVariableEntry(obj) {
  return obj.kind === "agentFeedback";
}
function isPasteVariableEntry(obj) {
  return obj.kind === "paste";
}
function isPastedTextArtifact(obj) {
  return isPasteVariableEntry(obj) && obj._meta?.[ChatPasteAttachmentMetadata.TextArtifact] === true;
}
function isWorkspaceVariableEntry(obj) {
  return obj.kind === "workspace";
}
function isImageVariableEntry(obj) {
  return obj.kind === "image";
}
function isExplicitFileOrImageVariableEntry(obj) {
  return obj.kind === "file" || obj.kind === "directory" || obj.kind === "image";
}
function getExplicitFileOrImageAttachmentSummary(entries) {
  const fileOrImageEntries = entries.filter(isExplicitFileOrImageVariableEntry);
  if (!fileOrImageEntries.length) {
    return void 0;
  }
  if (fileOrImageEntries.every(isImageVariableEntry)) {
    return fileOrImageEntries.length === 1 ? localize("chat.attachmentSummary.image.one", "Attached 1 image") : localize("chat.attachmentSummary.image.many", "Attached {0} images", fileOrImageEntries.length);
  }
  return fileOrImageEntries.length === 1 ? localize("chat.attachmentSummary.file.one", "Attached 1 file") : localize("chat.attachmentSummary.file.many", "Attached {0} files", fileOrImageEntries.length);
}
function isNotebookOutputVariableEntry(obj) {
  return obj.kind === "notebookOutput";
}
function isElementVariableEntry(obj) {
  return obj.kind === "element";
}
function isDiagnosticsVariableEntry(obj) {
  return obj.kind === "diagnostic";
}
function isChatRequestFileEntry(obj) {
  return obj.kind === "file";
}
function isPromptFileVariableEntry(obj) {
  return obj.kind === "promptFile";
}
function isPromptTextVariableEntry(obj) {
  return obj.kind === "promptText";
}
function isChatRequestVariableEntry(obj) {
  const entry = obj;
  return typeof entry === "object" && entry !== null && typeof entry.id === "string" && typeof entry.name === "string";
}
function isSCMHistoryItemVariableEntry(obj) {
  return obj.kind === "scmHistoryItem";
}
function isSCMHistoryItemChangeVariableEntry(obj) {
  return obj.kind === "scmHistoryItemChange";
}
function isSCMHistoryItemChangeRangeVariableEntry(obj) {
  return obj.kind === "scmHistoryItemChangeRange";
}
function isStringImplicitContextValue(value) {
  const asStringImplicitContextValue = value;
  return typeof asStringImplicitContextValue === "object" && asStringImplicitContextValue !== null && (typeof asStringImplicitContextValue.value === "string" || typeof asStringImplicitContextValue.value === "undefined") && (typeof asStringImplicitContextValue.name === "string" || typeof asStringImplicitContextValue.name === "undefined") && (asStringImplicitContextValue.resourceUri === void 0 || URI.isUri(asStringImplicitContextValue.resourceUri)) && (typeof asStringImplicitContextValue.name === "string" || URI.isUri(asStringImplicitContextValue.resourceUri)) && (asStringImplicitContextValue.iconPath === void 0 || isChatContextIconPath(asStringImplicitContextValue.iconPath)) && URI.isUri(asStringImplicitContextValue.uri) && typeof asStringImplicitContextValue.handle === "number";
}
var PromptFileVariableKind = /* @__PURE__ */ ((PromptFileVariableKind2) => {
  PromptFileVariableKind2["Instruction"] = "vscode.instructions.file.root";
  PromptFileVariableKind2["InstructionReference"] = `vscode.instructions.file.reference`;
  PromptFileVariableKind2["PromptFile"] = "vscode.prompt.file";
  return PromptFileVariableKind2;
})(PromptFileVariableKind || {});
function toPromptFileVariableEntry(uri, kind, originLabel, automaticallyAdded = false, toolReferences) {
  return {
    id: `${kind}__${uri.toString()}`,
    name: `prompt:${basename(uri)}`,
    value: uri,
    kind: "promptFile",
    modelDescription: "Prompt instructions file",
    isRoot: kind !== "vscode.instructions.file.reference" /* InstructionReference */,
    originLabel,
    toolReferences,
    automaticallyAdded
  };
}
var PromptTextVariableKind = /* @__PURE__ */ ((PromptTextVariableKind2) => {
  PromptTextVariableKind2["CustomizationsIndex"] = "vscode.customizations.index";
  return PromptTextVariableKind2;
})(PromptTextVariableKind || {});
function toPromptTextVariableEntry(content, automaticallyAdded = false, toolReferences) {
  return {
    id: "vscode.customizations.index" /* CustomizationsIndex */,
    name: `prompt:customizationsIndex`,
    value: content,
    kind: "promptText",
    modelDescription: "Chat customizations index",
    automaticallyAdded,
    toolReferences
  };
}
function toFileVariableEntry(uri, range) {
  return {
    kind: "file",
    value: range ? { uri, range } : uri,
    id: uri.toString() + (range?.toString() ?? ""),
    name: basename(uri)
  };
}
function toToolVariableEntry(entry, range) {
  return {
    kind: "tool",
    id: entry.id,
    icon: ThemeIcon.isThemeIcon(entry.icon) ? entry.icon : void 0,
    name: entry.displayName,
    value: void 0,
    range
  };
}
function toToolSetVariableEntry(entry, range) {
  return {
    kind: "toolset",
    id: entry.id,
    icon: entry.icon,
    name: entry.referenceName,
    value: Array.from(entry.getTools()).map((t) => toToolVariableEntry(t)),
    range
  };
}
class ChatRequestVariableSet {
  constructor(entries) {
    this._ids = /* @__PURE__ */ new Set();
    this._entries = [];
    if (entries) {
      this.add(...entries);
    }
  }
  add(...entry) {
    for (const e of entry) {
      if (!this._ids.has(e.id)) {
        this._ids.add(e.id);
        this._entries.push(e);
      }
    }
  }
  insertFirst(entry) {
    if (!this._ids.has(entry.id)) {
      this._ids.add(entry.id);
      this._entries.unshift(entry);
    }
  }
  remove(entry) {
    this._ids.delete(entry.id);
    this._entries = this._entries.filter((e) => e.id !== entry.id);
  }
  has(entry) {
    return this._ids.has(entry.id);
  }
  asArray() {
    return this._entries.slice(0);
  }
  get length() {
    return this._entries.length;
  }
}
export {
  AgentHostCompletionReferenceKind,
  ChatPasteAttachmentMetadata,
  ChatRequestVariableSet,
  ChatTranscriptContextAttachmentDisplayKind,
  IChatRequestVariableEntry,
  IDiagnosticVariableEntryFilterData,
  OmittedState,
  PromptFileVariableKind,
  chatReferenceVariableEntryFromDynamicValue,
  chatReferenceVariableEntryId,
  createChatReferenceVariableEntry,
  getAgentHostCompletionReferenceKind,
  getAgentHostCompletionReferenceKindFromValue,
  getExplicitFileOrImageAttachmentSummary,
  getImageAttachmentLimit,
  isAgentFeedbackVariableEntry,
  isAgentHostCompletionVariableEntry,
  isBrowserViewVariableEntry,
  isChatContextIconPath,
  isChatReferenceDynamicVariableValue,
  isChatReferenceVariableEntry,
  isChatRequestFileEntry,
  isChatRequestVariableEntry,
  isChatTranscriptContextVariableEntry,
  isDebugVariableEntry,
  isDiagnosticsVariableEntry,
  isElementVariableEntry,
  isExplicitFileOrImageVariableEntry,
  isImageVariableEntry,
  isImplicitVariableEntry,
  isNotebookOutputVariableEntry,
  isPasteVariableEntry,
  isPastedTextArtifact,
  isPromptFileVariableEntry,
  isPromptTextVariableEntry,
  isSCMHistoryItemChangeRangeVariableEntry,
  isSCMHistoryItemChangeVariableEntry,
  isSCMHistoryItemVariableEntry,
  isStringImplicitContextValue,
  isStringVariableEntry,
  isTerminalVariableEntry,
  isWorkspaceVariableEntry,
  resolveChatContextIcon,
  restoreChatTranscriptContextVariableEntry,
  restorePasteVariableEntryFromAttachment,
  toAgentHostCompletionVariableEntry,
  toAgentHostCompletionVariableEntryFromMetadata,
  toChatReferenceDynamicVariableValue,
  toChatTranscriptContextAttachmentMeta,
  toFileVariableEntry,
  toPasteVariableEntry,
  toPromptFileVariableEntry,
  toPromptTextVariableEntry,
  toToolSetVariableEntry,
  toToolVariableEntry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcYXR0YWNobWVudHNcXGNoYXRWYXJpYWJsZUVudHJpZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IGlzTG9jYXRpb24sIExvY2F0aW9uLCBTeW1ib2xLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWFya2VyU2V2ZXJpdHksIElNYXJrZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElTQ01IaXN0b3J5SXRlbSB9IGZyb20gJy4uLy4uLy4uL3NjbS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRSZWZlcmVuY2UgfSBmcm9tICcuLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZVZhbHVlIH0gZnJvbSAnLi9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IElUb29sRGF0YSwgSVRvb2xTZXQgfSBmcm9tICcuLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfSBmcm9tICcuLi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBkZWNvZGVCYXNlNjQsIGVuY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuXG4vKipcbiAqIEFuIGljb24gZm9yIGEgY2hhdCBjb250ZXh0IGl0ZW0uIE1pcnJvcnMgdGhlIGBJY29uUGF0aGAgdHlwZSBmcm9tIHRoZSBleHRlbnNpb24gQVBJOlxuICogZWl0aGVyIGEge0BsaW5rIFRoZW1lSWNvbiB0aGVtZSBpY29ufSwgYSBzaW5nbGUge0BsaW5rIFVSSX0gb3Igc2VwYXJhdGUgbGlnaHQvZGFyayB7QGxpbmsgVVJJIHVyaXN9LlxuICovXG5leHBvcnQgdHlwZSBDaGF0Q29udGV4dEljb25QYXRoID0gVGhlbWVJY29uIHwgVVJJIHwgeyBsaWdodDogVVJJOyBkYXJrOiBVUkkgfTtcblxuLyoqXG4gKiBUeXBlIGd1YXJkIGZvciB7QGxpbmsgQ2hhdENvbnRleHRJY29uUGF0aH0uIEFjY2VwdHMgYSB7QGxpbmsgVGhlbWVJY29uIHRoZW1lIGljb259LCBhIHNpbmdsZVxuICoge0BsaW5rIFVSSX0gb3IgYW4gb2JqZWN0IHdpdGggYm90aCBgbGlnaHRgIGFuZCBgZGFya2Age0BsaW5rIFVSSSB1cmlzfS4gUmVqZWN0cyBgbnVsbGAsIGB1bmRlZmluZWRgXG4gKiBhbmQgcGFydGlhbGx5LXNwZWNpZmllZCBsaWdodC9kYXJrIG9iamVjdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NoYXRDb250ZXh0SWNvblBhdGgodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBDaGF0Q29udGV4dEljb25QYXRoIHtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24odmFsdWUpIHx8IFVSSS5pc1VyaSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBhc0R1YWxQYXRoID0gdmFsdWUgYXMgeyBsaWdodD86IHVua25vd247IGRhcms/OiB1bmtub3duIH07XG5cdHJldHVybiBVUkkuaXNVcmkoYXNEdWFsUGF0aC5saWdodCkgJiYgVVJJLmlzVXJpKGFzRHVhbFBhdGguZGFyayk7XG59XG5cbi8qKlxuICogUmVzb2x2ZSBhIHtAbGluayBDaGF0Q29udGV4dEljb25QYXRofSBpbnRvIGEgdmFsdWUgdGhhdCBjYW4gYmUgcGFzc2VkIHRvIHRoZSBgaWNvblBhdGhgXG4gKiBvcHRpb24gb2YgYW4gaWNvbiBsYWJlbCwgcGlja2luZyB0aGUgbGlnaHQgb3IgZGFyayB1cmkgYmFzZWQgb24gdGhlIGN1cnJlbnQgdGhlbWUuXG4gKlxuICogQHBhcmFtIGljb25QYXRoIFRoZSBpY29uIHBhdGggdG8gcmVzb2x2ZS5cbiAqIEBwYXJhbSB1c2VEYXJrIFdoZXRoZXIgdGhlIGN1cnJlbnQgdGhlbWUgaXMgYSBkYXJrIHRoZW1lLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNoYXRDb250ZXh0SWNvbihpY29uUGF0aDogQ2hhdENvbnRleHRJY29uUGF0aCwgdXNlRGFyazogYm9vbGVhbik6IFRoZW1lSWNvbiB8IFVSSSB7XG5cdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24oaWNvblBhdGgpIHx8IFVSSS5pc1VyaShpY29uUGF0aCkpIHtcblx0XHRyZXR1cm4gaWNvblBhdGg7XG5cdH1cblx0cmV0dXJuIHVzZURhcmsgPyBpY29uUGF0aC5kYXJrIDogaWNvblBhdGgubGlnaHQ7XG59XG5cbmludGVyZmFjZSBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZ1bGxOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGVsRGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBvZmZzZXQtcmFuZ2UgaW4gdGhlIHByb21wdC4gVGhpcyBtZWFucyB0aGlzIGVudHJ5IGhhcyBiZWVuIGV4cGxpY2l0bHkgdHlwZWQgb3V0XG5cdCAqIGJ5IHRoZSB1c2VyLlxuXHQgKi9cblx0cmVhZG9ubHkgcmFuZ2U/OiBJT2Zmc2V0UmFuZ2U7XG5cdHJlYWRvbmx5IHZhbHVlOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZVZhbHVlO1xuXHRyZWFkb25seSByZWZlcmVuY2VzPzogSUNoYXRDb250ZW50UmVmZXJlbmNlW107XG5cblx0LyoqXG5cdCAqIEltcGxlbWVudGF0aW9uLWRlZmluZWQgbWV0YWRhdGEgdGhhdCBwcm92aWRlcnMgYXR0YWNoIHRvIGEgdmFyaWFibGVcblx0ICogZW50cnkuIFVzZWQgdG8gcm91bmQtdHJpcCBwcm92aWRlci1zcGVjaWZpYyBkYXRhIChlLmcuIGFnZW50LWhvc3Rcblx0ICogYF9tZXRhYCkgd2hlbiBhbiBlbnRyeSBpcyBzZW50IGJhY2sgdG8gdGhlIHByb3ZpZGVyIGFzIHBhcnQgb2YgYVxuXHQgKiByZXF1ZXN0IGF0dGFjaG1lbnQuXG5cdCAqL1xuXHRyZWFkb25seSBfbWV0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG5cdG9taXR0ZWRTdGF0ZT86IE9taXR0ZWRTdGF0ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR2VuZXJpY0NoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0a2luZDogJ2dlbmVyaWMnO1xuXHR0b29sdGlwPzogSU1hcmtkb3duU3RyaW5nO1xuXHQvKipcblx0ICogQSBwcm92aWRlci1zdXBwbGllZCBpY29uIHRoYXQgbWF5IGJlIGEge0BsaW5rIFRoZW1lSWNvbiB0aGVtZSBpY29ufSwgYSBzaW5nbGUgdXJpIG9yIGxpZ2h0L2RhcmsgdXJpcy5cblx0ICogVGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRoZSB7QGxpbmsgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkuaWNvbiBiYXNlIHRoZW1lIGljb259IHdoZW4gcmVuZGVyaW5nLlxuXHQgKi9cblx0aWNvblBhdGg/OiBDaGF0Q29udGV4dEljb25QYXRoO1xufVxuXG5leHBvcnQgY29uc3QgQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhID0ge1xuXHRLaW5kOiAndnNjb2RlLmNoYXQuYXR0YWNobWVudC5raW5kJyxcblx0TGFuZ3VhZ2U6ICd2c2NvZGUuY2hhdC5hdHRhY2htZW50Lmxhbmd1YWdlJyxcblx0RmlsZU5hbWU6ICd2c2NvZGUuY2hhdC5hdHRhY2htZW50LmZpbGVOYW1lJyxcblx0UGFzdGVkTGluZXM6ICd2c2NvZGUuY2hhdC5hdHRhY2htZW50LnBhc3RlZExpbmVzJyxcblx0VGV4dEFydGlmYWN0OiAndnNjb2RlLmNoYXQuYXR0YWNobWVudC50ZXh0QXJ0aWZhY3QnLFxufSBhcyBjb25zdDtcblxuY29uc3QgQ2hhdFRyYW5zY3JpcHRDb250ZXh0TWV0YWRhdGFLZXkgPSAndnNjb2RlLmNoYXQudHJhbnNjcmlwdENvbnRleHQnO1xuZXhwb3J0IGNvbnN0IENoYXRUcmFuc2NyaXB0Q29udGV4dEF0dGFjaG1lbnREaXNwbGF5S2luZCA9ICd0cmFuc2NyaXB0Q29udGV4dCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc3RvcmFibGVQYXN0ZUF0dGFjaG1lbnQge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBkaXNwbGF5S2luZD86IHN0cmluZztcblx0cmVhZG9ubHkgbW9kZWxSZXByZXNlbnRhdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgX21ldGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQge1xuXHRTa2lsbCA9ICdza2lsbCcsXG5cdENvbW1hbmQgPSAnY29tbWFuZCcsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlIHtcblx0cmVhZG9ubHkgJG1pZDogJ2FnZW50SG9zdENvbXBsZXRpb24nO1xuXHRyZWFkb25seSBraW5kOiBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZDtcbn1cblxuZnVuY3Rpb24gYWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlVmFsdWUoa2luZDogQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQpOiBJQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlVmFsdWUge1xuXHRyZXR1cm4geyAkbWlkOiAnYWdlbnRIb3N0Q29tcGxldGlvbicsIGtpbmQgfTtcbn1cblxuZnVuY3Rpb24gYWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlSWQoa2luZDogQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsIHJlZmVyZW5jZTogVVJJIHwgc3RyaW5nKTogc3RyaW5nIHtcblx0c3dpdGNoIChraW5kKSB7XG5cdFx0Y2FzZSBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZC5Ta2lsbDpcblx0XHRcdHJldHVybiByZWZlcmVuY2UudG9TdHJpbmcoKTtcblx0XHRjYXNlIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLkNvbW1hbmQ6XG5cdFx0XHRyZXR1cm4gJ2FnZW50LWhvc3QtY29tbWFuZDonICsgcmVmZXJlbmNlLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoa2luZDogQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsIG5hbWU6IHN0cmluZywgcmVmZXJlbmNlOiBVUkkgfCBzdHJpbmcgfCB1bmRlZmluZWQsIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IElHZW5lcmljQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ICYgeyB2YWx1ZTogSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlIH0ge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRpZDogcmVmZXJlbmNlICE9PSB1bmRlZmluZWQgPyBhZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVJZChraW5kLCByZWZlcmVuY2UpIDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0bmFtZSxcblx0XHR2YWx1ZTogYWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlVmFsdWUoa2luZCksXG5cdFx0X21ldGEsXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5RnJvbU1ldGFkYXRhKGtpbmQ6IEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLCBuYW1lOiBzdHJpbmcsIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IElHZW5lcmljQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ICYgeyB2YWx1ZTogSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlIH0ge1xuXHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRjYXNlIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLlNraWxsOlxuXHRcdFx0cmV0dXJuIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoa2luZCwgbmFtZSwgdHlwZW9mIF9tZXRhPy51cmkgPT09ICdzdHJpbmcnID8gX21ldGEudXJpIDogdW5kZWZpbmVkLCBfbWV0YSk7XG5cdFx0Y2FzZSBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZC5Db21tYW5kOlxuXHRcdFx0cmV0dXJuIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoa2luZCwgbmFtZSwgdHlwZW9mIF9tZXRhPy5jb21tYW5kID09PSAnc3RyaW5nJyA/IF9tZXRhLmNvbW1hbmQgOiB1bmRlZmluZWQsIF9tZXRhKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQoZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCB8IHVuZGVmaW5lZCB7XG5cdGlmIChlbnRyeS5raW5kICE9PSAnZ2VuZXJpYycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBnZXRBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZEZyb21WYWx1ZShlbnRyeS52YWx1ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZEZyb21WYWx1ZSh2YWx1ZTogSUNoYXRSZXF1ZXN0VmFyaWFibGVWYWx1ZSk6IEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kIHwgdW5kZWZpbmVkIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgcmVjb3JkID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGlmIChyZWNvcmQuJG1pZCAhPT0gJ2FnZW50SG9zdENvbXBsZXRpb24nKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHN3aXRjaCAocmVjb3JkLmtpbmQpIHtcblx0XHRjYXNlIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLlNraWxsOlxuXHRcdGNhc2UgQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZDpcblx0XHRcdHJldHVybiByZWNvcmQua2luZDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeShlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IGVudHJ5IGlzIElHZW5lcmljQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5ICYgeyB2YWx1ZTogSUFnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZVZhbHVlIH0ge1xuXHRyZXR1cm4gZ2V0QWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQoZW50cnkpICE9PSB1bmRlZmluZWQ7XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3REaXJlY3RvcnlFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0a2luZDogJ2RpcmVjdG9yeSc7XG5cdGltYWdlQ291bnQ/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0RmlsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRraW5kOiAnZmlsZSc7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIE9taXR0ZWRTdGF0ZSB7XG5cdE5vdE9taXR0ZWQsXG5cdFBhcnRpYWwsXG5cdEZ1bGwsXG5cdEltYWdlTGltaXRFeGNlZWRlZCxcbn1cblxuY29uc3QgQ0xBVURFX01FU1NBR0VTX01BWF9JTUFHRVNfUEVSX1JFUVVFU1QgPSAyMDtcbmNvbnN0IEdFTUlOSV9NQVhfSU1BR0VTX1BFUl9SRVFVRVNUID0gMTA7XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaW1hZ2UtYXR0YWNobWVudCBsaW1pdCBmb3IgdGhlIHNlbGVjdGVkIG1vZGVsLlxuICpcbiAqIENsYXVkZS1mYW1pbHkgbW9kZWxzIHVzZSBhIG1heCBvZiAyMCAoTWVzc2FnZXMgQVBJKSwgR2VtaW5pLWZhbWlseSBtb2RlbHMgdXNlXG4gKiBhIG1heCBvZiAxMC4gT3RoZXIgbW9kZWxzIGRvIG5vdCBoYXZlIGEgVUktZW5mb3JjZWQgaW1hZ2UgY291bnQgbGltaXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbWFnZUF0dGFjaG1lbnRMaW1pdChtb2RlbDogUGljazxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgJ2ZhbWlseSc+IHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFtb2RlbCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBmYW1pbHkgPSBtb2RlbC5mYW1pbHkudG9Mb3dlckNhc2UoKTtcblx0aWYgKGZhbWlseS5zdGFydHNXaXRoKCdnZW1pbmknKSkge1xuXHRcdHJldHVybiBHRU1JTklfTUFYX0lNQUdFU19QRVJfUkVRVUVTVDtcblx0fVxuXG5cdGlmIChmYW1pbHkuc3RhcnRzV2l0aCgnY2xhdWRlJykgfHwgZmFtaWx5LnN0YXJ0c1dpdGgoJ2FudGhyb3BpYycpKSB7XG5cdFx0cmV0dXJuIENMQVVERV9NRVNTQUdFU19NQVhfSU1BR0VTX1BFUl9SRVFVRVNUO1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RUb29sRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICd0b29sJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RUb29sU2V0RW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICd0b29sc2V0Jztcblx0cmVhZG9ubHkgdmFsdWU6IElDaGF0UmVxdWVzdFRvb2xFbnRyeVtdO1xufVxuXG5leHBvcnQgdHlwZSBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeSA9IElDaGF0UmVxdWVzdFRvb2xFbnRyeSB8IElDaGF0UmVxdWVzdFRvb2xTZXRFbnRyeTtcblxuZXhwb3J0IGludGVyZmFjZSBTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHtcblx0dmFsdWU/OiBzdHJpbmc7XG5cdG5hbWU/OiBzdHJpbmc7XG5cdG1vZGVsRGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGljb25QYXRoPzogQ2hhdENvbnRleHRJY29uUGF0aDtcblx0dXJpOiBVUkk7XG5cdHJlc291cmNlVXJpPzogVVJJO1xuXHR0b29sdGlwPzogSU1hcmtkb3duU3RyaW5nO1xuXHQvKipcblx0ICogQ29tbWFuZCBJRCB0byBleGVjdXRlIHdoZW4gdGhpcyBjb250ZXh0IGl0ZW0gaXMgY2xpY2tlZC5cblx0ICovXG5cdHJlYWRvbmx5IGNvbW1hbmRJZD86IHN0cmluZztcblx0cmVhZG9ubHkgaGFuZGxlOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0SW1wbGljaXRWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnaW1wbGljaXQnO1xuXHRyZWFkb25seSBpc0ZpbGU6IHRydWU7XG5cdHJlYWRvbmx5IHZhbHVlOiBVUkkgfCBMb2NhdGlvbiB8IFN0cmluZ0NoYXRDb250ZXh0VmFsdWUgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpc1NlbGVjdGlvbjogYm9vbGVhbjtcblx0ZW5hYmxlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RTdHJpbmdWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnc3RyaW5nJztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbW9kZWxEZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgaWNvblBhdGg/OiBDaGF0Q29udGV4dEljb25QYXRoO1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgcmVzb3VyY2VVcmk/OiBVUkk7XG5cdHJlYWRvbmx5IHRvb2x0aXA/OiBJTWFya2Rvd25TdHJpbmc7XG5cdC8qKlxuXHQgKiBDb21tYW5kIElEIHRvIGV4ZWN1dGUgd2hlbiB0aGlzIGNvbnRleHQgaXRlbSBpcyBjbGlja2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgY29tbWFuZElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBoYW5kbGU6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RUcmFuc2NyaXB0Q29udGV4dFZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICd0cmFuc2NyaXB0Q29udGV4dCc7XG5cdHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSB0b29sdGlwPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVxdWVzdFdvcmtzcGFjZVZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICd3b3Jrc3BhY2UnO1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRyZWFkb25seSBtb2RlbERlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0UGFzdGVWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAncGFzdGUnO1xuXHRyZWFkb25seSBjb2RlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhbmd1YWdlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhc3RlZExpbmVzOiBzdHJpbmc7XG5cblx0Ly8gVGhpcyBpcyBvbmx5IHVzZWQgZm9yIG9sZCBzZXJpYWxpemVkIGRhdGEgYW5kIHNob3VsZCBiZSByZW1vdmVkIG9uY2Ugd2Ugbm8gbG9uZ2VyIHN1cHBvcnQgaXRcblx0cmVhZG9ubHkgZmlsZU5hbWU6IHN0cmluZztcblxuXHQvLyBUaGlzIGlzIG9ubHkgdW5kZWZpbmVkIG9uIG9sZCBzZXJpYWxpemVkIGRhdGFcblx0cmVhZG9ubHkgY29waWVkRnJvbToge1xuXHRcdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRcdHJlYWRvbmx5IHJhbmdlOiBJUmFuZ2U7XG5cdH0gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1Bhc3RlVmFyaWFibGVFbnRyeShcblx0bmFtZTogc3RyaW5nLFxuXHRjb2RlOiBzdHJpbmcsXG5cdG9wdGlvbnM/OiB7XG5cdFx0cmVhZG9ubHkgaWQ/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgaWNvbj86IFRoZW1lSWNvbjtcblx0XHRyZWFkb25seSBsYW5ndWFnZT86IHN0cmluZztcblx0XHRyZWFkb25seSBmaWxlTmFtZT86IHN0cmluZztcblx0XHRyZWFkb25seSBwYXN0ZWRMaW5lcz86IHN0cmluZztcblx0XHRyZWFkb25seSBfbWV0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHR9XG4pOiBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnkge1xuXHRjb25zdCBsYW5ndWFnZSA9IG9wdGlvbnM/Lmxhbmd1YWdlID8/ICdtYXJrZG93bic7XG5cdGNvbnN0IGZpbGVOYW1lID0gb3B0aW9ucz8uZmlsZU5hbWUgPz8gbmFtZTtcblx0Y29uc3QgcGFzdGVkTGluZXMgPSBvcHRpb25zPy5wYXN0ZWRMaW5lcyA/PyBuYW1lO1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdwYXN0ZScsXG5cdFx0aWQ6IG9wdGlvbnM/LmlkID8/IGBjaGF0LXBhc3RlLSR7Z2VuZXJhdGVVdWlkKCl9YCxcblx0XHRuYW1lLFxuXHRcdGljb246IG9wdGlvbnM/Lmljb24sXG5cdFx0dmFsdWU6IGNvZGUsXG5cdFx0Y29kZSxcblx0XHRsYW5ndWFnZSxcblx0XHRwYXN0ZWRMaW5lcyxcblx0XHRmaWxlTmFtZSxcblx0XHRjb3BpZWRGcm9tOiB1bmRlZmluZWQsXG5cdFx0X21ldGE6IHtcblx0XHRcdC4uLm9wdGlvbnM/Ll9tZXRhLFxuXHRcdFx0W0NoYXRQYXN0ZUF0dGFjaG1lbnRNZXRhZGF0YS5LaW5kXTogJ3Bhc3RlJyxcblx0XHRcdFtDaGF0UGFzdGVBdHRhY2htZW50TWV0YWRhdGEuTGFuZ3VhZ2VdOiBsYW5ndWFnZSxcblx0XHRcdFtDaGF0UGFzdGVBdHRhY2htZW50TWV0YWRhdGEuRmlsZU5hbWVdOiBmaWxlTmFtZSxcblx0XHRcdFtDaGF0UGFzdGVBdHRhY2htZW50TWV0YWRhdGEuUGFzdGVkTGluZXNdOiBwYXN0ZWRMaW5lcyxcblx0XHR9LFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzdG9yZVBhc3RlVmFyaWFibGVFbnRyeUZyb21BdHRhY2htZW50KGF0dGFjaG1lbnQ6IElSZXN0b3JhYmxlUGFzdGVBdHRhY2htZW50KTogSUNoYXRSZXF1ZXN0UGFzdGVWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbW9kZWxSZXByZXNlbnRhdGlvbiA9IGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbjtcblx0aWYgKHR5cGVvZiBtb2RlbFJlcHJlc2VudGF0aW9uICE9PSAnc3RyaW5nJyB8fCBhdHRhY2htZW50Ll9tZXRhPy5bQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhLktpbmRdICE9PSAncGFzdGUnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHN0cmluZ01ldGFkYXRhID0gKGtleTogc3RyaW5nLCBmYWxsYmFjazogc3RyaW5nKTogc3RyaW5nID0+IHtcblx0XHRjb25zdCB2YWx1ZSA9IGF0dGFjaG1lbnQuX21ldGE/LltrZXldO1xuXHRcdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiBmYWxsYmFjaztcblx0fTtcblx0cmV0dXJuIHRvUGFzdGVWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQubGFiZWwsIG1vZGVsUmVwcmVzZW50YXRpb24sIHtcblx0XHRsYW5ndWFnZTogc3RyaW5nTWV0YWRhdGEoQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhLkxhbmd1YWdlLCAnbWFya2Rvd24nKSxcblx0XHRmaWxlTmFtZTogc3RyaW5nTWV0YWRhdGEoQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhLkZpbGVOYW1lLCBhdHRhY2htZW50LmxhYmVsKSxcblx0XHRwYXN0ZWRMaW5lczogc3RyaW5nTWV0YWRhdGEoQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhLlBhc3RlZExpbmVzLCBhdHRhY2htZW50LmxhYmVsKSxcblx0XHRfbWV0YTogYXR0YWNobWVudC5fbWV0YSxcblx0fSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN5bWJvbFZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdzeW1ib2wnO1xuXHRyZWFkb25seSB2YWx1ZTogTG9jYXRpb247XG5cdHJlYWRvbmx5IHN5bWJvbEtpbmQ6IFN5bWJvbEtpbmQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRSZXN1bHRWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnY29tbWFuZCc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUltYWdlVmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ2ltYWdlJztcblx0cmVhZG9ubHkgaXNQYXN0ZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBpc1VSTD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1pbWVUeXBlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va091dHB1dFZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdub3RlYm9va091dHB1dCc7XG5cdHJlYWRvbmx5IG91dHB1dEluZGV4PzogbnVtYmVyO1xuXHRyZWFkb25seSBtaW1lVHlwZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhIHtcblx0cmVhZG9ubHkgb3duZXI/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb2JsZW1NZXNzYWdlPzogc3RyaW5nO1xuXHRyZWFkb25seSBmaWx0ZXJVcmk/OiBVUkk7XG5cdHJlYWRvbmx5IGZpbHRlclNldmVyaXR5PzogTWFya2VyU2V2ZXJpdHk7XG5cdHJlYWRvbmx5IGZpbHRlclJhbmdlPzogSVJhbmdlO1xufVxuXG5cblxuZXhwb3J0IG5hbWVzcGFjZSBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhIHtcblx0ZXhwb3J0IGNvbnN0IGljb24gPSBDb2RpY29uLmVycm9yO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tTWFya2VyKG1hcmtlcjogSU1hcmtlcik6IElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRmaWx0ZXJVcmk6IG1hcmtlci5yZXNvdXJjZSxcblx0XHRcdG93bmVyOiBtYXJrZXIub3duZXIsXG5cdFx0XHRwcm9ibGVtTWVzc2FnZTogbWFya2VyLm1lc3NhZ2UsXG5cdFx0XHRmaWx0ZXJSYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IG1hcmtlci5zdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXI6IG1hcmtlci5lbmRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogbWFya2VyLnN0YXJ0Q29sdW1uLCBlbmRDb2x1bW46IG1hcmtlci5lbmRDb2x1bW4gfVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG9FbnRyeShkYXRhOiBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhKTogSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGlkKGRhdGEpLFxuXHRcdFx0bmFtZTogbGFiZWwoZGF0YSksXG5cdFx0XHRpY29uLFxuXHRcdFx0dmFsdWU6IGRhdGEsXG5cdFx0XHRraW5kOiAnZGlhZ25vc3RpYycsXG5cdFx0XHQuLi5kYXRhLFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaWQoZGF0YTogSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSkge1xuXHRcdHJldHVybiBbZGF0YS5maWx0ZXJVcmksIGRhdGEub3duZXIsIGRhdGEuZmlsdGVyU2V2ZXJpdHksIGRhdGEuZmlsdGVyUmFuZ2U/LnN0YXJ0TGluZU51bWJlciwgZGF0YS5maWx0ZXJSYW5nZT8uc3RhcnRDb2x1bW5dLmpvaW4oJzonKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBsYWJlbChkYXRhOiBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhKSB7XG5cdFx0Y29uc3QgZW51bSBUcmltVGhyZXNob2xkIHtcblx0XHRcdE1heENoYXJzID0gMzAsXG5cdFx0XHRNYXhTcGFjZUxvb2tiYWNrID0gMTAsXG5cdFx0fVxuXHRcdGlmIChkYXRhLnByb2JsZW1NZXNzYWdlKSB7XG5cdFx0XHRpZiAoZGF0YS5wcm9ibGVtTWVzc2FnZS5sZW5ndGggPCBUcmltVGhyZXNob2xkLk1heENoYXJzKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLnByb2JsZW1NZXNzYWdlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcmltIHRoZSBtZXNzYWdlLCBvbiBhIHNwYWNlIGlmIGl0IHdvdWxkIG5vdCBsb3NlIHRvbyBtdWNoXG5cdFx0XHQvLyBkYXRhIChNYXhTcGFjZUxvb2tiYWNrKSBvciBqdXN0IGJsaW5kbHkgb3RoZXJ3aXNlLlxuXHRcdFx0Y29uc3QgbGFzdFNwYWNlID0gZGF0YS5wcm9ibGVtTWVzc2FnZS5sYXN0SW5kZXhPZignICcsIFRyaW1UaHJlc2hvbGQuTWF4Q2hhcnMpO1xuXHRcdFx0aWYgKGxhc3RTcGFjZSA9PT0gLTEgfHwgbGFzdFNwYWNlICsgVHJpbVRocmVzaG9sZC5NYXhTcGFjZUxvb2tiYWNrIDwgVHJpbVRocmVzaG9sZC5NYXhDaGFycykge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5wcm9ibGVtTWVzc2FnZS5zdWJzdHJpbmcoMCwgVHJpbVRocmVzaG9sZC5NYXhDaGFycykgKyAnXHUyMDI2Jztcblx0XHRcdH1cblx0XHRcdHJldHVybiBkYXRhLnByb2JsZW1NZXNzYWdlLnN1YnN0cmluZygwLCBsYXN0U3BhY2UpICsgJ1x1MjAyNic7XG5cdFx0fVxuXHRcdGxldCBsYWJlbFN0ciA9IGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQucHJvYmxlbXMuYWxsJywgXCJBbGwgUHJvYmxlbXNcIik7XG5cdFx0aWYgKGRhdGEuZmlsdGVyVXJpKSB7XG5cdFx0XHRsYWJlbFN0ciA9IGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnQucHJvYmxlbXMuaW5GaWxlJywgXCJQcm9ibGVtcyBpbiB7MH1cIiwgYmFzZW5hbWUoZGF0YS5maWx0ZXJVcmkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGFiZWxTdHI7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdkaWFnbm9zdGljJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRWxlbWVudEFuY2VzdG9yRGF0YSB7XG5cdHJlYWRvbmx5IHRhZ05hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNsYXNzTmFtZXM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRWxlbWVudFZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdlbGVtZW50Jztcblx0cmVhZG9ubHkgdmFsdWU6IHN0cmluZztcblx0cmVhZG9ubHkgaW1hZ2VEYXRhPzogSUNoYXRSZXF1ZXN0VmFyaWFibGVWYWx1ZTtcblx0cmVhZG9ubHkgaW1hZ2VNaW1lVHlwZT86IHN0cmluZztcblx0cmVhZG9ubHkgYW5jZXN0b3JzPzogSUVsZW1lbnRBbmNlc3RvckRhdGFbXTtcblx0cmVhZG9ubHkgYXR0cmlidXRlcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdHJlYWRvbmx5IGNvbXB1dGVkU3R5bGVzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblx0cmVhZG9ubHkgZGltZW5zaW9ucz86IHsgcmVhZG9ubHkgdG9wOiBudW1iZXI7IHJlYWRvbmx5IGxlZnQ6IG51bWJlcjsgcmVhZG9ubHkgd2lkdGg6IG51bWJlcjsgcmVhZG9ubHkgaGVpZ2h0OiBudW1iZXIgfTtcblx0cmVhZG9ubHkgaW5uZXJUZXh0Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9tcHRGaWxlVmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ3Byb21wdEZpbGUnO1xuXHRyZWFkb25seSB2YWx1ZTogVVJJO1xuXHRyZWFkb25seSBpc1Jvb3Q6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9yaWdpbkxhYmVsPzogc3RyaW5nO1xuXHRyZWFkb25seSBtb2RlbERlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGF1dG9tYXRpY2FsbHlBZGRlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgdG9vbFJlZmVyZW5jZXM/OiByZWFkb25seSBDaGF0UmVxdWVzdFRvb2xSZWZlcmVuY2VFbnRyeVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ3Byb21wdFRleHQnO1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRyZWFkb25seSBzZXR0aW5nSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGVsRGVzY3JpcHRpb246IHN0cmluZztcblx0cmVhZG9ubHkgYXV0b21hdGljYWxseUFkZGVkOiBib29sZWFuO1xuXHRyZWFkb25seSB0b29sUmVmZXJlbmNlcz86IHJlYWRvbmx5IENoYXRSZXF1ZXN0VG9vbFJlZmVyZW5jZUVudHJ5W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNDTUhpc3RvcnlJdGVtVmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ3NjbUhpc3RvcnlJdGVtJztcblx0cmVhZG9ubHkgdmFsdWU6IFVSSTtcblx0cmVhZG9ubHkgaGlzdG9yeUl0ZW06IElTQ01IaXN0b3J5SXRlbTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnc2NtSGlzdG9yeUl0ZW1DaGFuZ2UnO1xuXHRyZWFkb25seSB2YWx1ZTogVVJJO1xuXHRyZWFkb25seSBoaXN0b3J5SXRlbTogSVNDTUhpc3RvcnlJdGVtO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ3NjbUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2UnO1xuXHRyZWFkb25seSB2YWx1ZTogVVJJO1xuXHRyZWFkb25seSBoaXN0b3J5SXRlbUNoYW5nZVN0YXJ0OiB7XG5cdFx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdFx0cmVhZG9ubHkgaGlzdG9yeUl0ZW06IElTQ01IaXN0b3J5SXRlbTtcblx0fTtcblx0cmVhZG9ubHkgaGlzdG9yeUl0ZW1DaGFuZ2VFbmQ6IHtcblx0XHRyZWFkb25seSB1cmk6IFVSSTtcblx0XHRyZWFkb25seSBoaXN0b3J5SXRlbTogSVNDTUhpc3RvcnlJdGVtO1xuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbFZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICd0ZXJtaW5hbENvbW1hbmQnO1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBjb21tYW5kOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG91dHB1dD86IHN0cmluZztcblx0cmVhZG9ubHkgZXhpdENvZGU/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlYnVnVmFyaWFibGVFbnRyeSBleHRlbmRzIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogJ2RlYnVnVmFyaWFibGUnO1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRyZWFkb25seSBleHByZXNzaW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR5cGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnYWdlbnRGZWVkYmFjayc7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHQvKipcblx0ICogVGhlIGFnZW50LWhvc3QgYW5ub3RhdGlvbnMgY2hhbm5lbCBVUkkgdGhhdCBiYWNrcyB0aGVzZSBmZWVkYmFjayBpdGVtc1xuXHQgKiAoZWFjaCBpdGVtIGlkIGlzIGFuIGFubm90YXRpb24gaWQgb24gdGhpcyBjaGFubmVsKS4gU2V0IG9ubHkgZm9yXG5cdCAqIGFnZW50LWhvc3Qgc2Vzc2lvbnM7IHVzZWQgdG8gZW1pdCB7QGxpbmsgTWVzc2FnZUFubm90YXRpb25zQXR0YWNobWVudH1zXG5cdCAqIHJlZmVyZW5jaW5nIHRoZSBzcGVjaWZpYyBjb21tZW50cyBvbiB0aGUgd2lyZS5cblx0ICovXG5cdHJlYWRvbmx5IGFubm90YXRpb25zUmVzb3VyY2U/OiBVUkk7XG5cdHJlYWRvbmx5IGZlZWRiYWNrSXRlbXM6IFJlYWRvbmx5QXJyYXk8e1xuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IHJlc291cmNlVXJpOiBVUkk7XG5cdFx0cmVhZG9ubHkgcmFuZ2U6IElSYW5nZTtcblx0XHRyZWFkb25seSBjb2RlU2VsZWN0aW9uPzogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IGRpZmZIdW5rcz86IHN0cmluZztcblx0XHQvKiogV2hlbiB0aGlzIGl0ZW0gd2FzIGNvbnZlcnRlZCBmcm9tIGEgUFIgcmV2aWV3IGNvbW1lbnQsIHRoZSBvcmlnaW5hbCB0aHJlYWQgSUQuICovXG5cdFx0cmVhZG9ubHkgc291cmNlUFJSZXZpZXdDb21tZW50SWQ/OiBzdHJpbmc7XG5cdFx0LyoqIEFkZGl0aW9uYWwgcmVwbGllcyB0aGF0IGJlbG9uZyB0byB0aGUgc2FtZSBjb21tZW50IHRocmVhZCBhcyB7QGxpbmsgdGV4dH0uICovXG5cdFx0cmVhZG9ubHkgcmVwbGllcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHR9Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3REZWJ1Z0V2ZW50c1ZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdkZWJ1Z0V2ZW50cyc7XG5cdC8qKiBUaW1lc3RhbXAgd2hlbiB0aGUgZGVidWcgZXZlbnRzIHdlcmUgc25hcHNob3R0ZWQuICovXG5cdHJlYWRvbmx5IHNuYXBzaG90VGltZTogbnVtYmVyO1xuXHQvKiogVGhlIHNlc3Npb24gcmVzb3VyY2UgdGhlc2UgZGVidWcgZXZlbnRzIGJlbG9uZyB0by4gKi9cblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0U2Vzc2lvblJlZmVyZW5jZVZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdzZXNzaW9uUmVmZXJlbmNlJztcblx0cmVhZG9ubHkgdmFsdWU6IFVSSTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclZpZXdWYXJpYWJsZUVudHJ5IGV4dGVuZHMgSUJhc2VDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZWFkb25seSBraW5kOiAnYnJvd3NlclZpZXcnO1xuXHRyZWFkb25seSB2YWx1ZTogVVJJO1xuXHRyZWFkb25seSBicm93c2VySWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQnJvd3NlclZpZXdWYXJpYWJsZUVudHJ5KGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogZW50cnkgaXMgSUJyb3dzZXJWaWV3VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBlbnRyeS5raW5kID09PSAnYnJvd3NlclZpZXcnO1xufVxuXG4vKipcbiAqIEEgZmlyc3QtY2xhc3MgcmVmZXJlbmNlIHRvIGFub3RoZXIgYWdlbnQtaG9zdCBjaGF0LCBwcm9kdWNlZCB3aGVuIHRoZSB1c2VyXG4gKiB0eXBlcyBgI2NoYXQ6PHRpdGxlPmAgaW4gYW4gYWdlbnQtaG9zdCBjaGF0IGlucHV0IG9yIGRyb3BzIGEgY2hhdCB0YWIgb250byB0aGVcbiAqIGlucHV0LiBDYXJyaWVzIGV2ZXJ5dGhpbmcgbmVlZGVkIHRvIHJlbmRlciB0aGUgcmVmZXJlbmNlIGNoaXAgYW5kIHRvIHNlbmQgYW5cbiAqIGFnZW50LWhvc3QgY2hhdCBhdHRhY2htZW50OiB0aGUgcmVmZXJlbmNlZCBjaGF0J3Mgb3BhcXVlIGJhY2tlbmQgY2hhdCBVUklcbiAqICh7QGxpbmsgdmFsdWV9KSBhbmQsIHdoZW4gcGlubmVkLCB0aGUge0BsaW5rIGVuZFR1cm4gbGFzdCBjb21wbGV0ZWQgdHVybn1cbiAqIGluY2x1ZGVkIGluIHRoZSB0cmFuc2NyaXB0LiBUaGUgZGlzcGxheSB0aXRsZSBsaXZlcyBvblxuICoge0BsaW5rIElCYXNlQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5Lm5hbWUgbmFtZX0uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkgZXh0ZW5kcyBJQmFzZUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdjaGF0UmVmZXJlbmNlJztcblx0LyoqXG5cdCAqIFRoZSByZWZlcmVuY2VkIGNoYXQncyAqKm9wYXF1ZSBiYWNrZW5kIGNoYXQgVVJJKiogXHUyMDE0IHRoZSBleGFjdCB2YWx1ZSBjYXJyaWVkXG5cdCAqIG9uIGBNZXNzYWdlQ2hhdEF0dGFjaG1lbnQucmVzb3VyY2VgIG9uIHRoZSB3aXJlLiBJdCBpcyBwcm92aWRlci1kZWZpbmVkIGFuZFxuXHQgKiBvcGFxdWU6IGdlbmVyaWMgY29kZSBNVVNUIG9ubHkgc3RvcmUgaXQsIGNvbXBhcmUgaXQgYnkgZXF1YWxpdHksIGFuZCBwYXNzIGl0XG5cdCAqIHRvIGFnZW50LWhvc3Qtb3duZWQgaGVscGVycyAoZS5nLiB0aGUgY2hhdC1yZWZlcmVuY2Ugd2lkZ2V0J3MgbGluayBidWlsZGVyKTtcblx0ICogaXQgTVVTVCBOT1QgcGFyc2Ugb3IgY29uc3RydWN0IGl0LiBTZW5kIGFuZCByZXN0b3JlIGFyZSB0aGVyZWZvcmUgcHVyZVxuXHQgKiBpZGVudGl0eSwgYW5kIHRoZSBjbGllbnQtc2lkZSBjaGF0IGlzIHJlc29sdmVkIGxhemlseSAob25seSB3aGVuIHRoZSB1c2VyXG5cdCAqIGNsaWNrcyB0aGUgcmVmZXJlbmNlIGNoaXApLiBCZWNhdXNlIGEgcmVmZXJlbmNlIGNhbiBuZXZlciBjcm9zcyBhZ2VudCBob3N0cyxcblx0ICogdGhlIFVSSSBhbHdheXMgbmFtZXMgYSBjaGF0IG9uIGEgY29ubmVjdGVkIGhvc3QuXG5cdCAqL1xuXHRyZWFkb25seSB2YWx1ZTogVVJJO1xuXHQvKipcblx0ICogTGFzdCBjb21wbGV0ZWQgdHVybiBpbmNsdWRlZCBpbiB0aGUgcmVmZXJlbmNlZCB0cmFuc2NyaXB0LiBPbWl0dGVkIGZvclxuXHQgKiByZWZlcmVuY2VzIHRoYXQgZG8gbm90IHBpbiBhIHR1cm4gKGUuZy4gYSBkcm9wcGVkIGNoYXQvc2Vzc2lvbiksIGluIHdoaWNoXG5cdCAqIGNhc2UgdGhlIGhvc3QgcmVzb2x2ZXMgdGhlIHJlZmVyZW5jZWQgY2hhdCdzIGxhdGVzdCBjb21wbGV0ZWQgdHVybiB3aGVuIGl0XG5cdCAqIGFjY2VwdHMgdGhlIG1lc3NhZ2UuXG5cdCAqL1xuXHRyZWFkb25seSBlbmRUdXJuPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFR5cGUgZ3VhcmQgZm9yIGEge0BsaW5rIElDaGF0UmVxdWVzdENoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5IGNoYXQtcmVmZXJlbmNlIGVudHJ5fS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQ2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkoZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBlbnRyeSBpcyBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBlbnRyeS5raW5kID09PSAnY2hhdFJlZmVyZW5jZSc7XG59XG5cbi8qKlxuICogU3RhYmxlLCBkZWR1cGUtZnJpZW5kbHkgaWQgZm9yIGEgY2hhdCByZWZlcmVuY2UsIGRlcml2ZWQgZnJvbSB0aGUgcmVmZXJlbmNlZFxuICogY2hhdCByZXNvdXJjZSBhbmQgXHUyMDE0IHdoZW4gdGhlIHJlZmVyZW5jZSBwaW5zIGEgdHVybiBcdTIwMTQgdGhlIGxhc3QgY29tcGxldGVkIHR1cm4uXG4gKiBSZS1hY2NlcHRpbmcgdGhlIHNhbWUgcmVmZXJlbmNlIHRoZXJlZm9yZSBwcm9kdWNlcyB0aGUgc2FtZSBpZC4gQSBwaW5uZWRcbiAqIHJlZmVyZW5jZSAod2l0aCB7QGxpbmsgZW5kVHVybn0pIGFuZCBhbiB1bnBpbm5lZCBvbmUgdG8gdGhlIHNhbWUgY2hhdCBwcm9kdWNlXG4gKiBkaXN0aW5jdCBpZHMgc28gdGhleSBuZXZlciBjb2xsaWRlLlxuICpcbiAqIEBwYXJhbSBjaGF0UmVzb3VyY2UgVGhlIG9wYXF1ZSBiYWNrZW5kIGNoYXQgVVJJIG9mIHRoZSByZWZlcmVuY2VkIGNoYXQuIFN0b3JlZFxuICogdmVyYmF0aW0gaW4gdGhlIGlkOyBuZXZlciBwYXJzZWQuXG4gKiBAcGFyYW0gZW5kVHVybiBUaGUgbGFzdCBjb21wbGV0ZWQgdHVybiBpbmNsdWRlZCBpbiB0aGUgcmVmZXJlbmNlZCB0cmFuc2NyaXB0LCBpZiBwaW5uZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeUlkKGNoYXRSZXNvdXJjZTogVVJJLCBlbmRUdXJuPzogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGVuZFR1cm4gPT09IHVuZGVmaW5lZFxuXHRcdD8gYGFnZW50LWhvc3QtY2hhdDoke2NoYXRSZXNvdXJjZS50b1N0cmluZygpfWBcblx0XHQ6IGBhZ2VudC1ob3N0LWNoYXQ6JHtjaGF0UmVzb3VyY2UudG9TdHJpbmcoKX1cXHUwMDAwJHtlbmRUdXJufWA7XG59XG5cbi8qKlxuICogQnVpbGQgdGhlIGZpcnN0LWNsYXNzIHtAbGluayBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSBjaGF0LXJlZmVyZW5jZSBlbnRyeX1cbiAqICh0aGUgaW5wdXQgcGlsbCkgZm9yIGEgcmVmZXJlbmNlZCBjaGF0LlxuICpcbiAqIEBwYXJhbSBjaGF0UmVzb3VyY2UgVGhlIG9wYXF1ZSBiYWNrZW5kIGNoYXQgVVJJIG9mIHRoZSByZWZlcmVuY2VkIGNoYXQgKHRoZVxuICogdmFsdWUgY2FycmllZCBvbiBgTWVzc2FnZUNoYXRBdHRhY2htZW50LnJlc291cmNlYCkuIFN0b3JlZCB2ZXJiYXRpbTsgbmV2ZXIgcGFyc2VkLlxuICogQHBhcmFtIGVuZFR1cm4gVGhlIGxhc3QgY29tcGxldGVkIHR1cm4gaW5jbHVkZWQgaW4gdGhlIHJlZmVyZW5jZWQgdHJhbnNjcmlwdCwgaWYgcGlubmVkLlxuICogQHBhcmFtIHRpdGxlIFRoZSBjaGF0IHRpdGxlIHVzZWQgYXMgdGhlIGRpc3BsYXkgbGFiZWwuXG4gKiBAcGFyYW0gX21ldGEgUHJvdmlkZXItc3VwcGxpZWQgYF9tZXRhYCB0byBwcmVzZXJ2ZSBvbiB0aGUgZW50cnkuXG4gKiBAcGFyYW0gcmFuZ2UgVGhlIG9mZnNldC1yYW5nZSBvZiB0aGUgcmVmZXJlbmNlIGluIHRoZSBwcm9tcHQsIHdoZW4gdHlwZWQgb3V0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkoY2hhdFJlc291cmNlOiBVUkksIGVuZFR1cm46IHN0cmluZyB8IHVuZGVmaW5lZCwgdGl0bGU6IHN0cmluZywgX21ldGE/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgcmFuZ2U/OiBJT2Zmc2V0UmFuZ2UpOiBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2NoYXRSZWZlcmVuY2UnLFxuXHRcdGlkOiBjaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeUlkKGNoYXRSZXNvdXJjZSwgZW5kVHVybiksXG5cdFx0bmFtZTogdGl0bGUsXG5cdFx0dmFsdWU6IGNoYXRSZXNvdXJjZSxcblx0XHRlbmRUdXJuLFxuXHRcdHJhbmdlLFxuXHRcdF9tZXRhLFxuXHR9O1xufVxuXG4vKipcbiAqIFRyYW5zaWVudCB2YWx1ZSBjYXJyaWVkIG9uIGEgY2hhdC1yZWZlcmVuY2UgZHluYW1pYyB2YXJpYWJsZSAodmlhIGl0cyBgZGF0YWBcbiAqIGNoYW5uZWwpIHNvIHRoZSByZXF1ZXN0IHBhcnNlciBjYW4gcmVidWlsZCB0aGUgZmlyc3QtY2xhc3NcbiAqIHtAbGluayBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeX0gd2l0aG91dCBhbiBvdXQtb2YtYmFuZCBgX21ldGFgXG4gKiBiYWcuIFRoaXMgbmV2ZXIgYmVjb21lcyB0aGUgZW50cnkncyBgdmFsdWVgIFx1MjAxNCBzZWVcbiAqIHtAbGluayBjaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeUZyb21EeW5hbWljVmFsdWV9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVmZXJlbmNlRHluYW1pY1ZhcmlhYmxlVmFsdWUge1xuXHRyZWFkb25seSAkbWlkOiAnYWdlbnRIb3N0Q2hhdFJlZmVyZW5jZSc7XG5cdC8qKlxuXHQgKiBUaGUgcmVmZXJlbmNlZCBjaGF0J3MgKipvcGFxdWUgYmFja2VuZCBjaGF0IFVSSSoqIGFzIGEgc3RyaW5nIFx1MjAxNCB0aGUgZXhhY3Rcblx0ICogdmFsdWUgY2FycmllZCBvbiBgTWVzc2FnZUNoYXRBdHRhY2htZW50LnJlc291cmNlYC4gQmVjb21lcyB0aGUgcmVidWlsdFxuXHQgKiBlbnRyeSdzIHtAbGluayBJQ2hhdFJlcXVlc3RDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeS52YWx1ZX0uIE5ldmVyIHBhcnNlZFxuXHQgKiBieSBnZW5lcmljIGNvZGUuXG5cdCAqL1xuXHRyZWFkb25seSBjaGF0UmVzb3VyY2U6IHN0cmluZztcblx0LyoqIExhc3QgY29tcGxldGVkIHR1cm4gaW5jbHVkZWQgaW4gdGhlIHJlZmVyZW5jZWQgdHJhbnNjcmlwdCwgaWYgcGlubmVkLiAqL1xuXHRyZWFkb25seSBlbmRUdXJuPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEJ1aWxkIHRoZSB7QGxpbmsgSUNoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZSBkeW5hbWljLXZhcmlhYmxlIHRyYW5zcG9ydH1cbiAqIGZvciBhIGNoYXQgcmVmZXJlbmNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9DaGF0UmVmZXJlbmNlRHluYW1pY1ZhcmlhYmxlVmFsdWUoY2hhdFJlc291cmNlOiBVUkksIGVuZFR1cm4/OiBzdHJpbmcpOiBJQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlIHtcblx0cmV0dXJuIGVuZFR1cm4gPT09IHVuZGVmaW5lZFxuXHRcdD8geyAkbWlkOiAnYWdlbnRIb3N0Q2hhdFJlZmVyZW5jZScsIGNoYXRSZXNvdXJjZTogY2hhdFJlc291cmNlLnRvU3RyaW5nKCkgfVxuXHRcdDogeyAkbWlkOiAnYWdlbnRIb3N0Q2hhdFJlZmVyZW5jZScsIGNoYXRSZXNvdXJjZTogY2hhdFJlc291cmNlLnRvU3RyaW5nKCksIGVuZFR1cm4gfTtcbn1cblxuLyoqXG4gKiBUeXBlIGd1YXJkIGZvciBhIHtAbGluayBJQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlfS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlKHZhbHVlOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZVZhbHVlKTogdmFsdWUgaXMgSUNoYXRSZWZlcmVuY2VEeW5hbWljVmFyaWFibGVWYWx1ZSB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmICh2YWx1ZSBhcyB7ICRtaWQ/OiB1bmtub3duIH0pLiRtaWQgPT09ICdhZ2VudEhvc3RDaGF0UmVmZXJlbmNlJztcbn1cblxuLyoqXG4gKiBSZWJ1aWxkIGEgZmlyc3QtY2xhc3Mge0BsaW5rIElDaGF0UmVxdWVzdENoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5fSBmcm9tIGFcbiAqIGNoYXQtcmVmZXJlbmNlIHtAbGluayBJQ2hhdFJlZmVyZW5jZUR5bmFtaWNWYXJpYWJsZVZhbHVlIGR5bmFtaWMtdmFyaWFibGUgdmFsdWV9XG4gKiBjYXJyaWVkIHRocm91Z2ggdGhlIHJlcXVlc3QgcGFyc2VyLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIHJlc291cmNlXG4gKiBjYW5ub3QgYmUgcGFyc2VkLlxuICpcbiAqIEBwYXJhbSB2YWx1ZSBUaGUgZHluYW1pYy12YXJpYWJsZSB0cmFuc3BvcnQgdmFsdWUuXG4gKiBAcGFyYW0gaWQgVGhlIHN0YWJsZSBkeW5hbWljLXZhcmlhYmxlIGlkLlxuICogQHBhcmFtIG5hbWUgVGhlIGRpc3BsYXkgdGl0bGUgZm9yIHRoZSByZWZlcmVuY2UuXG4gKiBAcGFyYW0gcmFuZ2UgVGhlIG9mZnNldC1yYW5nZSBvZiB0aGUgcmVmZXJlbmNlIGluIHRoZSBwcm9tcHQuXG4gKiBAcGFyYW0gX21ldGEgUHJvdmlkZXItc3VwcGxpZWQgYF9tZXRhYCB0byBwcmVzZXJ2ZSBvbiB0aGUgZW50cnkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeUZyb21EeW5hbWljVmFsdWUodmFsdWU6IElDaGF0UmVmZXJlbmNlRHluYW1pY1ZhcmlhYmxlVmFsdWUsIGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgcmFuZ2U6IElPZmZzZXRSYW5nZSB8IHVuZGVmaW5lZCwgX21ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQge1xuXHRsZXQgY2hhdFJlc291cmNlOiBVUkk7XG5cdHRyeSB7XG5cdFx0Y2hhdFJlc291cmNlID0gVVJJLnBhcnNlKHZhbHVlLmNoYXRSZXNvdXJjZSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRraW5kOiAnY2hhdFJlZmVyZW5jZScsXG5cdFx0aWQsXG5cdFx0bmFtZSxcblx0XHR2YWx1ZTogY2hhdFJlc291cmNlLFxuXHRcdGVuZFR1cm46IHZhbHVlLmVuZFR1cm4sXG5cdFx0cmFuZ2UsXG5cdFx0X21ldGEsXG5cdH07XG59XG5cbmV4cG9ydCB0eXBlIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgPSBJR2VuZXJpY0NoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IElDaGF0UmVxdWVzdEltcGxpY2l0VmFyaWFibGVFbnRyeSB8IElDaGF0UmVxdWVzdFBhc3RlVmFyaWFibGVFbnRyeVxuXHR8IElTeW1ib2xWYXJpYWJsZUVudHJ5IHwgSUNvbW1hbmRSZXN1bHRWYXJpYWJsZUVudHJ5IHwgSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5IHwgSUltYWdlVmFyaWFibGVFbnRyeVxuXHR8IElDaGF0UmVxdWVzdFRvb2xFbnRyeSB8IElDaGF0UmVxdWVzdFRvb2xTZXRFbnRyeVxuXHR8IElDaGF0UmVxdWVzdERpcmVjdG9yeUVudHJ5IHwgSUNoYXRSZXF1ZXN0RmlsZUVudHJ5IHwgSU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSB8IElFbGVtZW50VmFyaWFibGVFbnRyeVxuXHR8IElQcm9tcHRGaWxlVmFyaWFibGVFbnRyeSB8IElQcm9tcHRUZXh0VmFyaWFibGVFbnRyeVxuXHR8IElTQ01IaXN0b3J5SXRlbVZhcmlhYmxlRW50cnkgfCBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWYXJpYWJsZUVudHJ5IHwgSVNDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VWYXJpYWJsZUVudHJ5IHwgSVRlcm1pbmFsVmFyaWFibGVFbnRyeVxuXHR8IElDaGF0UmVxdWVzdFN0cmluZ1ZhcmlhYmxlRW50cnkgfCBJQ2hhdFJlcXVlc3RXb3Jrc3BhY2VWYXJpYWJsZUVudHJ5IHwgSURlYnVnVmFyaWFibGVFbnRyeSB8IElBZ2VudEZlZWRiYWNrVmFyaWFibGVFbnRyeVxuXHR8IElDaGF0UmVxdWVzdERlYnVnRXZlbnRzVmFyaWFibGVFbnRyeSB8IElDaGF0UmVxdWVzdFNlc3Npb25SZWZlcmVuY2VWYXJpYWJsZUVudHJ5IHwgSUJyb3dzZXJWaWV3VmFyaWFibGVFbnRyeSB8IElDaGF0UmVxdWVzdENoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5XG5cdHwgSUNoYXRSZXF1ZXN0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5O1xuXG5leHBvcnQgbmFtZXNwYWNlIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIFVSSSBvZiB0aGUgcGFzc2VkIHZhcmlhbnQgZW50cnkuIFJldHVybiB1bmRlZmluZWQgaWYgbm90IGZvdW5kLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvVXJpKGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gVVJJLmlzVXJpKGVudHJ5LnZhbHVlKVxuXHRcdFx0PyBlbnRyeS52YWx1ZVxuXHRcdFx0OiBpc0xvY2F0aW9uKGVudHJ5LnZhbHVlKVxuXHRcdFx0XHQ/IGVudHJ5LnZhbHVlLnVyaVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0b0V4cG9ydCh2OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdFx0aWYgKHYudmFsdWUgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG5cdFx0XHQvLyAnZHVwJyBoZXJlIGlzIG5lZWRlZCBvdGhlcndpc2UgVFMgY29tcGxhaW5zIGFib3V0IHRoZSBuYXJyb3dlZCBgdmFsdWVgIGluIGEgc3ByZWFkIG9wZXJhdGlvblxuXHRcdFx0Y29uc3QgZHVwOiBNdXRhYmxlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnk+ID0geyAuLi52IH07XG5cdFx0XHRkdXAudmFsdWUgPSB7ICRiYXNlNjQ6IGVuY29kZUJhc2U2NChWU0J1ZmZlci53cmFwKHYudmFsdWUpKSB9O1xuXHRcdFx0cmV0dXJuIGR1cDtcblx0XHR9XG5cdFx0aWYgKGlzRWxlbWVudFZhcmlhYmxlRW50cnkodikgJiYgdi5pbWFnZURhdGEgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi52LFxuXHRcdFx0XHRpbWFnZURhdGE6IHsgJGJhc2U2NDogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLndyYXAodi5pbWFnZURhdGEpKSB9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB2O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21FeHBvcnQodjogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRcdC8vIE9sZCB2YXJpYWJsZXMgZm9ybWF0XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8taW4tb3BlcmF0b3Jcblx0XHRpZiAodiAmJiAndmFsdWVzJyBpbiB2ICYmIEFycmF5LmlzQXJyYXkodi52YWx1ZXMpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdGlkOiB2LmlkID8/ICcnLFxuXHRcdFx0XHRuYW1lOiB2Lm5hbWUsXG5cdFx0XHRcdHZhbHVlOiB2LnZhbHVlc1swXT8udmFsdWUsXG5cdFx0XHRcdHJhbmdlOiB2LnJhbmdlLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiB2Lm1vZGVsRGVzY3JpcHRpb24sXG5cdFx0XHRcdHJlZmVyZW5jZXM6IHYucmVmZXJlbmNlc1xuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8taW4tb3BlcmF0b3Jcblx0XHRcdGlmICh2LnZhbHVlICYmIHR5cGVvZiB2LnZhbHVlID09PSAnb2JqZWN0JyAmJiAnJGJhc2U2NCcgaW4gdi52YWx1ZSAmJiB0eXBlb2Ygdi52YWx1ZS4kYmFzZTY0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHQvLyAnZHVwJyBoZXJlIGlzIG5lZWRlZCBvdGhlcndpc2UgVFMgY29tcGxhaW5zIGFib3V0IHRoZSBuYXJyb3dlZCBgdmFsdWVgIGluIGEgc3ByZWFkIG9wZXJhdGlvblxuXHRcdFx0XHRjb25zdCBkdXA6IE11dGFibGU8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeT4gPSB7IC4uLnYgfTtcblx0XHRcdFx0ZHVwLnZhbHVlID0gZGVjb2RlQmFzZTY0KHYudmFsdWUuJGJhc2U2NCkuYnVmZmVyO1xuXHRcdFx0XHRyZXR1cm4gZHVwO1xuXHRcdFx0fVxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8taW4tb3BlcmF0b3Jcblx0XHRcdGlmIChpc0VsZW1lbnRWYXJpYWJsZUVudHJ5KHYpICYmIHYuaW1hZ2VEYXRhICYmIHR5cGVvZiB2LmltYWdlRGF0YSA9PT0gJ29iamVjdCcgJiYgJyRiYXNlNjQnIGluIHYuaW1hZ2VEYXRhICYmIHR5cGVvZiB2LmltYWdlRGF0YS4kYmFzZTY0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnYsXG5cdFx0XHRcdFx0aW1hZ2VEYXRhOiBkZWNvZGVCYXNlNjQodi5pbWFnZURhdGEuJGJhc2U2NCkuYnVmZmVyXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB2O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNJbXBsaWNpdFZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElDaGF0UmVxdWVzdEltcGxpY2l0VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2ltcGxpY2l0Jztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RyaW5nVmFyaWFibGVFbnRyeShvYmo6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBvYmogaXMgSUNoYXRSZXF1ZXN0U3RyaW5nVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ3N0cmluZyc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0NoYXRUcmFuc2NyaXB0Q29udGV4dFZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElDaGF0UmVxdWVzdFRyYW5zY3JpcHRDb250ZXh0VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ3RyYW5zY3JpcHRDb250ZXh0Jztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvQ2hhdFRyYW5zY3JpcHRDb250ZXh0QXR0YWNobWVudE1ldGEoZW50cnk6IElDaGF0UmVxdWVzdFRyYW5zY3JpcHRDb250ZXh0VmFyaWFibGVFbnRyeSk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0cmV0dXJuIHtcblx0XHQuLi5lbnRyeS5fbWV0YSxcblx0XHRbQ2hhdFRyYW5zY3JpcHRDb250ZXh0TWV0YWRhdGFLZXldOiB7XG5cdFx0XHR1cmk6IGVudHJ5LnVyaS50b1N0cmluZygpLFxuXHRcdFx0aWNvbklkOiBlbnRyeS5pY29uPy5pZCxcblx0XHRcdHRvb2x0aXA6IGVudHJ5LnRvb2x0aXAsXG5cdFx0XHRmdWxsTmFtZTogZW50cnkuZnVsbE5hbWUsXG5cdFx0fSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc3RvcmVDaGF0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5KGxhYmVsOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIG1ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogSUNoYXRSZXF1ZXN0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmF3ID0gbWV0YT8uW0NoYXRUcmFuc2NyaXB0Q29udGV4dE1ldGFkYXRhS2V5XTtcblx0aWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShyYXcpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByZWNvcmQgPSByYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGlmICh0eXBlb2YgcmVjb3JkLnVyaSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3RyYW5zY3JpcHRDb250ZXh0Jyxcblx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0bmFtZTogbGFiZWwsXG5cdFx0Li4uKHR5cGVvZiByZWNvcmQuZnVsbE5hbWUgPT09ICdzdHJpbmcnID8geyBmdWxsTmFtZTogcmVjb3JkLmZ1bGxOYW1lIH0gOiB7fSksXG5cdFx0Li4uKHR5cGVvZiByZWNvcmQuaWNvbklkID09PSAnc3RyaW5nJyA/IHsgaWNvbjogVGhlbWVJY29uLmZyb21JZChyZWNvcmQuaWNvbklkKSB9IDoge30pLFxuXHRcdC4uLih0eXBlb2YgcmVjb3JkLnRvb2x0aXAgPT09ICdzdHJpbmcnID8geyB0b29sdGlwOiByZWNvcmQudG9vbHRpcCB9IDoge30pLFxuXHRcdHZhbHVlLFxuXHRcdHVyaTogVVJJLnBhcnNlKHJlY29yZC51cmkpLFxuXHRcdF9tZXRhOiBtZXRhLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNUZXJtaW5hbFZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElUZXJtaW5hbFZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICd0ZXJtaW5hbENvbW1hbmQnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNEZWJ1Z1ZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElEZWJ1Z1ZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdkZWJ1Z1ZhcmlhYmxlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQWdlbnRGZWVkYmFja1ZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElBZ2VudEZlZWRiYWNrVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2FnZW50RmVlZGJhY2snO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQYXN0ZVZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElDaGF0UmVxdWVzdFBhc3RlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ3Bhc3RlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUGFzdGVkVGV4dEFydGlmYWN0KG9iajogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IG9iaiBpcyBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gaXNQYXN0ZVZhcmlhYmxlRW50cnkob2JqKSAmJiBvYmouX21ldGE/LltDaGF0UGFzdGVBdHRhY2htZW50TWV0YWRhdGEuVGV4dEFydGlmYWN0XSA9PT0gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzV29ya3NwYWNlVmFyaWFibGVFbnRyeShvYmo6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBvYmogaXMgSUNoYXRSZXF1ZXN0V29ya3NwYWNlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ3dvcmtzcGFjZSc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ltYWdlVmFyaWFibGVFbnRyeShvYmo6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBvYmogaXMgSUltYWdlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2ltYWdlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRXhwbGljaXRGaWxlT3JJbWFnZVZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElDaGF0UmVxdWVzdEZpbGVFbnRyeSB8IElDaGF0UmVxdWVzdERpcmVjdG9yeUVudHJ5IHwgSUltYWdlVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2ZpbGUnIHx8IG9iai5raW5kID09PSAnZGlyZWN0b3J5JyB8fCBvYmoua2luZCA9PT0gJ2ltYWdlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEV4cGxpY2l0RmlsZU9ySW1hZ2VBdHRhY2htZW50U3VtbWFyeShlbnRyaWVzOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBmaWxlT3JJbWFnZUVudHJpZXMgPSBlbnRyaWVzLmZpbHRlcihpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5KTtcblx0aWYgKCFmaWxlT3JJbWFnZUVudHJpZXMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmIChmaWxlT3JJbWFnZUVudHJpZXMuZXZlcnkoaXNJbWFnZVZhcmlhYmxlRW50cnkpKSB7XG5cdFx0cmV0dXJuIGZpbGVPckltYWdlRW50cmllcy5sZW5ndGggPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudFN1bW1hcnkuaW1hZ2Uub25lJywgXCJBdHRhY2hlZCAxIGltYWdlXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0LmF0dGFjaG1lbnRTdW1tYXJ5LmltYWdlLm1hbnknLCBcIkF0dGFjaGVkIHswfSBpbWFnZXNcIiwgZmlsZU9ySW1hZ2VFbnRyaWVzLmxlbmd0aCk7XG5cdH1cblxuXHRyZXR1cm4gZmlsZU9ySW1hZ2VFbnRyaWVzLmxlbmd0aCA9PT0gMVxuXHRcdD8gbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudFN1bW1hcnkuZmlsZS5vbmUnLCBcIkF0dGFjaGVkIDEgZmlsZVwiKVxuXHRcdDogbG9jYWxpemUoJ2NoYXQuYXR0YWNobWVudFN1bW1hcnkuZmlsZS5tYW55JywgXCJBdHRhY2hlZCB7MH0gZmlsZXNcIiwgZmlsZU9ySW1hZ2VFbnRyaWVzLmxlbmd0aCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeShvYmo6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBvYmogaXMgSU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ25vdGVib29rT3V0cHV0Jztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxlbWVudFZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElFbGVtZW50VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2VsZW1lbnQnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNEaWFnbm9zdGljc1ZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElEaWFnbm9zdGljVmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ2RpYWdub3N0aWMnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0UmVxdWVzdEZpbGVFbnRyeShvYmo6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBvYmogaXMgSUNoYXRSZXF1ZXN0RmlsZUVudHJ5IHtcblx0cmV0dXJuIG9iai5raW5kID09PSAnZmlsZSc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5KG9iajogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IG9iaiBpcyBJUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdwcm9tcHRGaWxlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUHJvbXB0VGV4dFZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiBvYmoua2luZCA9PT0gJ3Byb21wdFRleHQnO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkob2JqOiB1bmtub3duKTogb2JqIGlzIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRjb25zdCBlbnRyeSA9IG9iaiBhcyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5O1xuXHRyZXR1cm4gdHlwZW9mIGVudHJ5ID09PSAnb2JqZWN0JyAmJlxuXHRcdGVudHJ5ICE9PSBudWxsICYmXG5cdFx0dHlwZW9mIGVudHJ5LmlkID09PSAnc3RyaW5nJyAmJlxuXHRcdHR5cGVvZiBlbnRyeS5uYW1lID09PSAnc3RyaW5nJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU0NNSGlzdG9yeUl0ZW1WYXJpYWJsZUVudHJ5KG9iajogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IG9iaiBpcyBJU0NNSGlzdG9yeUl0ZW1WYXJpYWJsZUVudHJ5IHtcblx0cmV0dXJuIG9iai5raW5kID09PSAnc2NtSGlzdG9yeUl0ZW0nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnkob2JqOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogb2JqIGlzIElTQ01IaXN0b3J5SXRlbUNoYW5nZVZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdzY21IaXN0b3J5SXRlbUNoYW5nZSc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VWYXJpYWJsZUVudHJ5KG9iajogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IG9iaiBpcyBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZVZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4gb2JqLmtpbmQgPT09ICdzY21IaXN0b3J5SXRlbUNoYW5nZVJhbmdlJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBTdHJpbmdDaGF0Q29udGV4dFZhbHVlIHtcblx0Y29uc3QgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSA9IHZhbHVlIGFzIFBhcnRpYWw8U3RyaW5nQ2hhdENvbnRleHRWYWx1ZT47XG5cdHJldHVybiAoXG5cdFx0dHlwZW9mIGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUgPT09ICdvYmplY3QnICYmXG5cdFx0YXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZSAhPT0gbnVsbCAmJlxuXHRcdCh0eXBlb2YgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS52YWx1ZSA9PT0gJ3N0cmluZycgfHwgdHlwZW9mIGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUudmFsdWUgPT09ICd1bmRlZmluZWQnKSAmJlxuXHRcdCh0eXBlb2YgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS5uYW1lID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS5uYW1lID09PSAndW5kZWZpbmVkJykgJiZcblx0XHQoYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS5yZXNvdXJjZVVyaSA9PT0gdW5kZWZpbmVkIHx8IFVSSS5pc1VyaShhc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlLnJlc291cmNlVXJpKSkgJiZcblx0XHQodHlwZW9mIGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUubmFtZSA9PT0gJ3N0cmluZycgfHwgVVJJLmlzVXJpKGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUucmVzb3VyY2VVcmkpKSAmJlxuXHRcdChhc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlLmljb25QYXRoID09PSB1bmRlZmluZWQgfHwgaXNDaGF0Q29udGV4dEljb25QYXRoKGFzU3RyaW5nSW1wbGljaXRDb250ZXh0VmFsdWUuaWNvblBhdGgpKSAmJlxuXHRcdFVSSS5pc1VyaShhc1N0cmluZ0ltcGxpY2l0Q29udGV4dFZhbHVlLnVyaSkgJiZcblx0XHR0eXBlb2YgYXNTdHJpbmdJbXBsaWNpdENvbnRleHRWYWx1ZS5oYW5kbGUgPT09ICdudW1iZXInXG5cdCk7XG59XG5cbmV4cG9ydCBlbnVtIFByb21wdEZpbGVWYXJpYWJsZUtpbmQge1xuXHRJbnN0cnVjdGlvbiA9ICd2c2NvZGUuaW5zdHJ1Y3Rpb25zLmZpbGUucm9vdCcsXG5cdEluc3RydWN0aW9uUmVmZXJlbmNlID0gYHZzY29kZS5pbnN0cnVjdGlvbnMuZmlsZS5yZWZlcmVuY2VgLFxuXHRQcm9tcHRGaWxlID0gJ3ZzY29kZS5wcm9tcHQuZmlsZScsXG59XG5cbi8qKlxuICogVXRpbGl0eSB0byBjb252ZXJ0IGEge0BsaW5rIHVyaX0gdG8gYSBjaGF0IHZhcmlhYmxlIGVudHJ5LlxuICogVGhlIGBpZGAgb2YgdGhlIGNoYXQgdmFyaWFibGUgY2FuIGJlIG9uZSBvZiB0aGUgZm9sbG93aW5nOlxuICpcbiAqIC0gYHZzY29kZS5pbnN0cnVjdGlvbnMuZmlsZS5yZWZlcmVuY2VfXzxVUkk+YDogZm9yIGFsbCBub24tcm9vdCBwcm9tcHQgaW5zdHJ1Y3Rpb25zIHJlZmVyZW5jZXNcbiAqIC0gYHZzY29kZS5pbnN0cnVjdGlvbnMuZmlsZS5yb290X188VVJJPmA6IGZvciAqcm9vdCogcHJvbXB0IGluc3RydWN0aW9ucyByZWZlcmVuY2VzXG4gKiAtIGB2c2NvZGUucHJvbXB0LmZpbGVfXzxVUkk+YDogZm9yIHByb21wdCBmaWxlIHJlZmVyZW5jZXNcbiAqXG4gKiBAcGFyYW0gdXJpIEEgcmVzb3VyY2UgVVJJIHRoYXQgcG9pbnRzIHRvIGEgcHJvbXB0IGluc3RydWN0aW9ucyBmaWxlLlxuICogQHBhcmFtIGtpbmQgVGhlIGtpbmQgb2YgdGhlIHByb21wdCBmaWxlIHZhcmlhYmxlIGVudHJ5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeSh1cmk6IFVSSSwga2luZDogUHJvbXB0RmlsZVZhcmlhYmxlS2luZCwgb3JpZ2luTGFiZWw/OiBzdHJpbmcsIGF1dG9tYXRpY2FsbHlBZGRlZCA9IGZhbHNlLCB0b29sUmVmZXJlbmNlcz86IENoYXRSZXF1ZXN0VG9vbFJlZmVyZW5jZUVudHJ5W10pOiBJUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkge1xuXHQvLyAgYGlkYCBmb3IgYWxsIGBwcm9tcHQgZmlsZXNgIHN0YXJ0cyB3aXRoIHRoZSB3ZWxsLWRlZmluZWQgcGFydCB0aGF0IHRoZSBjb3BpbG90IGV4dGVuc2lvbihvciBvdGhlciBjaGF0Ym90KSBjYW4gcmVseSBvblxuXHRyZXR1cm4ge1xuXHRcdGlkOiBgJHtraW5kfV9fJHt1cmkudG9TdHJpbmcoKX1gLFxuXHRcdG5hbWU6IGBwcm9tcHQ6JHtiYXNlbmFtZSh1cmkpfWAsXG5cdFx0dmFsdWU6IHVyaSxcblx0XHRraW5kOiAncHJvbXB0RmlsZScsXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1Byb21wdCBpbnN0cnVjdGlvbnMgZmlsZScsXG5cdFx0aXNSb290OiBraW5kICE9PSBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLkluc3RydWN0aW9uUmVmZXJlbmNlLFxuXHRcdG9yaWdpbkxhYmVsLFxuXHRcdHRvb2xSZWZlcmVuY2VzLFxuXHRcdGF1dG9tYXRpY2FsbHlBZGRlZFxuXHR9O1xufVxuXG5lbnVtIFByb21wdFRleHRWYXJpYWJsZUtpbmQge1xuXHRDdXN0b21pemF0aW9uc0luZGV4ID0gJ3ZzY29kZS5jdXN0b21pemF0aW9ucy5pbmRleCcsXG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1Byb21wdFRleHRWYXJpYWJsZUVudHJ5KGNvbnRlbnQ6IHN0cmluZywgYXV0b21hdGljYWxseUFkZGVkID0gZmFsc2UsIHRvb2xSZWZlcmVuY2VzPzogQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnlbXSk6IElQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IFByb21wdFRleHRWYXJpYWJsZUtpbmQuQ3VzdG9taXphdGlvbnNJbmRleCxcblx0XHRuYW1lOiBgcHJvbXB0OmN1c3RvbWl6YXRpb25zSW5kZXhgLFxuXHRcdHZhbHVlOiBjb250ZW50LFxuXHRcdGtpbmQ6ICdwcm9tcHRUZXh0Jyxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiAnQ2hhdCBjdXN0b21pemF0aW9ucyBpbmRleCcsXG5cdFx0YXV0b21hdGljYWxseUFkZGVkLFxuXHRcdHRvb2xSZWZlcmVuY2VzXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0ZpbGVWYXJpYWJsZUVudHJ5KHVyaTogVVJJLCByYW5nZT86IElSYW5nZSk6IElDaGF0UmVxdWVzdEZpbGVFbnRyeSB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2ZpbGUnLFxuXHRcdHZhbHVlOiByYW5nZSA/IHsgdXJpLCByYW5nZSB9IDogdXJpLFxuXHRcdGlkOiB1cmkudG9TdHJpbmcoKSArIChyYW5nZT8udG9TdHJpbmcoKSA/PyAnJyksXG5cdFx0bmFtZTogYmFzZW5hbWUodXJpKSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvVG9vbFZhcmlhYmxlRW50cnkoZW50cnk6IElUb29sRGF0YSwgcmFuZ2U/OiBJT2Zmc2V0UmFuZ2UpOiBJQ2hhdFJlcXVlc3RUb29sRW50cnkge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICd0b29sJyxcblx0XHRpZDogZW50cnkuaWQsXG5cdFx0aWNvbjogVGhlbWVJY29uLmlzVGhlbWVJY29uKGVudHJ5Lmljb24pID8gZW50cnkuaWNvbiA6IHVuZGVmaW5lZCxcblx0XHRuYW1lOiBlbnRyeS5kaXNwbGF5TmFtZSxcblx0XHR2YWx1ZTogdW5kZWZpbmVkLFxuXHRcdHJhbmdlXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1Rvb2xTZXRWYXJpYWJsZUVudHJ5KGVudHJ5OiBJVG9vbFNldCwgcmFuZ2U/OiBJT2Zmc2V0UmFuZ2UpOiBJQ2hhdFJlcXVlc3RUb29sU2V0RW50cnkge1xuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICd0b29sc2V0Jyxcblx0XHRpZDogZW50cnkuaWQsXG5cdFx0aWNvbjogZW50cnkuaWNvbixcblx0XHRuYW1lOiBlbnRyeS5yZWZlcmVuY2VOYW1lLFxuXHRcdHZhbHVlOiBBcnJheS5mcm9tKGVudHJ5LmdldFRvb2xzKCkpLm1hcCh0ID0+IHRvVG9vbFZhcmlhYmxlRW50cnkodCkpLFxuXHRcdHJhbmdlXG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0IHtcblx0cHJpdmF0ZSBfaWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX2VudHJpZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKGVudHJpZXM/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pIHtcblx0XHRpZiAoZW50cmllcykge1xuXHRcdFx0dGhpcy5hZGQoLi4uZW50cmllcyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFkZCguLi5lbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlIG9mIGVudHJ5KSB7XG5cdFx0XHRpZiAoIXRoaXMuX2lkcy5oYXMoZS5pZCkpIHtcblx0XHRcdFx0dGhpcy5faWRzLmFkZChlLmlkKTtcblx0XHRcdFx0dGhpcy5fZW50cmllcy5wdXNoKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBpbnNlcnRGaXJzdChlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faWRzLmhhcyhlbnRyeS5pZCkpIHtcblx0XHRcdHRoaXMuX2lkcy5hZGQoZW50cnkuaWQpO1xuXHRcdFx0dGhpcy5fZW50cmllcy51bnNoaWZ0KGVudHJ5KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlKGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogdm9pZCB7XG5cdFx0dGhpcy5faWRzLmRlbGV0ZShlbnRyeS5pZCk7XG5cdFx0dGhpcy5fZW50cmllcyA9IHRoaXMuX2VudHJpZXMuZmlsdGVyKGUgPT4gZS5pZCAhPT0gZW50cnkuaWQpO1xuXHR9XG5cblx0cHVibGljIGhhcyhlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pZHMuaGFzKGVudHJ5LmlkKTtcblx0fVxuXG5cdHB1YmxpYyBhc0FycmF5KCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXMuc2xpY2UoMCk7IC8vIHJldHVybiBhIGNvcHlcblx0fVxuXG5cdHB1YmxpYyBnZXQgbGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJpZXMubGVuZ3RoO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFFeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBRzdCLFNBQVMsa0JBQXdDO0FBQ2pELFNBQVMsZ0JBQWdCO0FBT3pCLFNBQVMsY0FBYyxjQUFjLGdCQUFnQjtBQWU5QyxTQUFTLHNCQUFzQixPQUE4QztBQUNuRixNQUFJLENBQUMsU0FBUyxPQUFPLFVBQVUsVUFBVTtBQUN4QyxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksVUFBVSxZQUFZLEtBQUssS0FBSyxJQUFJLE1BQU0sS0FBSyxHQUFHO0FBQ3JELFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxhQUFhO0FBQ25CLFNBQU8sSUFBSSxNQUFNLFdBQVcsS0FBSyxLQUFLLElBQUksTUFBTSxXQUFXLElBQUk7QUFDaEU7QUFTTyxTQUFTLHVCQUF1QixVQUErQixTQUFtQztBQUN4RyxNQUFJLFVBQVUsWUFBWSxRQUFRLEtBQUssSUFBSSxNQUFNLFFBQVEsR0FBRztBQUMzRCxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sVUFBVSxTQUFTLE9BQU8sU0FBUztBQUMzQztBQXNDTyxNQUFNLDhCQUE4QjtBQUFBLEVBQzFDLE1BQU07QUFBQSxFQUNOLFVBQVU7QUFBQSxFQUNWLFVBQVU7QUFBQSxFQUNWLGFBQWE7QUFBQSxFQUNiLGNBQWM7QUFDZjtBQUVBLE1BQU0sbUNBQW1DO0FBQ2xDLE1BQU0sNkNBQTZDO0FBU25ELElBQVcsbUNBQVgsa0JBQVdBLHNDQUFYO0FBQ04sRUFBQUEsa0NBQUEsV0FBUTtBQUNSLEVBQUFBLGtDQUFBLGFBQVU7QUFGTyxTQUFBQTtBQUFBLEdBQUE7QUFVbEIsU0FBUyxpQ0FBaUMsTUFBMkU7QUFDcEgsU0FBTyxFQUFFLE1BQU0sdUJBQXVCLEtBQUs7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QUFZLE1BQU0sSUFBSSxJQUFJLE1BQU0sT0FBTztBQUFBLElBQ3ZELE1BQU0sTUFBTTtBQUFBLElBQ1osT0FBTztBQUFBLElBQ1A7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxTQUFTLHVCQUF1QixPQUFpQixPQUFnRDtBQUN2RyxTQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixJQUFJLE1BQU07QUFBQSxJQUNWLE1BQU0sTUFBTTtBQUFBLElBQ1osTUFBTSxNQUFNO0FBQUEsSUFDWixPQUFPLE1BQU0sS0FBSyxNQUFNLFNBQVMsQ0FBQyxFQUFFLElBQUksT0FBSyxvQkFBb0IsQ0FBQyxDQUFDO0FBQUEsSUFDbkU7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxNQUFNLHVCQUF1QjtBQUFBLEVBSW5DLFlBQVksU0FBdUM7QUFIbkQsU0FBUSxPQUFPLG9CQUFJLElBQVk7QUFDL0IsU0FBUSxXQUF3QyxDQUFDO0FBR2hELFFBQUksU0FBUztBQUNaLFdBQUssSUFBSSxHQUFHLE9BQU87QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLE9BQU8sT0FBMEM7QUFDdkQsZUFBVyxLQUFLLE9BQU87QUFDdEIsVUFBSSxDQUFDLEtBQUssS0FBSyxJQUFJLEVBQUUsRUFBRSxHQUFHO0FBQ3pCLGFBQUssS0FBSyxJQUFJLEVBQUUsRUFBRTtBQUNsQixhQUFLLFNBQVMsS0FBSyxDQUFDO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sWUFBWSxPQUF3QztBQUMxRCxRQUFJLENBQUMsS0FBSyxLQUFLLElBQUksTUFBTSxFQUFFLEdBQUc7QUFDN0IsV0FBSyxLQUFLLElBQUksTUFBTSxFQUFFO0FBQ3RCLFdBQUssU0FBUyxRQUFRLEtBQUs7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLE9BQU8sT0FBd0M7QUFDckQsU0FBSyxLQUFLLE9BQU8sTUFBTSxFQUFFO0FBQ3pCLFNBQUssV0FBVyxLQUFLLFNBQVMsT0FBTyxPQUFLLEVBQUUsT0FBTyxNQUFNLEVBQUU7QUFBQSxFQUM1RDtBQUFBLEVBRU8sSUFBSSxPQUEyQztBQUNyRCxXQUFPLEtBQUssS0FBSyxJQUFJLE1BQU0sRUFBRTtBQUFBLEVBQzlCO0FBQUEsRUFFTyxVQUF1QztBQUM3QyxXQUFPLEtBQUssU0FBUyxNQUFNLENBQUM7QUFBQSxFQUM3QjtBQUFBLEVBRUEsSUFBVyxTQUFpQjtBQUMzQixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQ0Q7IiwKICAibmFtZXMiOiBbIkFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kIiwgIk9taXR0ZWRTdGF0ZSIsICJJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhIiwgIlRyaW1UaHJlc2hvbGQiLCAiSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSIsICJQcm9tcHRGaWxlVmFyaWFibGVLaW5kIiwgIlByb21wdFRleHRWYXJpYWJsZUtpbmQiXQp9Cg==
