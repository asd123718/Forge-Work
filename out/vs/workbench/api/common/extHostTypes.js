var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _callOnDispose, _items, _DataTransfer_instances, normalizeMime_fn;
import { asArray } from "../../../base/common/arrays.js";
import { encodeBase64, VSBuffer } from "../../../base/common/buffer.js";
import { illegalArgument } from "../../../base/common/errors.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { Mimes } from "../../../base/common/mime.js";
import { nextCharLength } from "../../../base/common/strings.js";
import { isNumber, isObject, isString, isStringArray } from "../../../base/common/types.js";
import { isUriComponents, URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { TextEditorSelectionSource } from "../../../platform/editor/common/editor.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { FileSystemProviderErrorCode, markAsFileSystemProviderError } from "../../../platform/files/common/files.js";
import { RemoteAuthorityResolverErrorCode } from "../../../platform/remote/common/remoteAuthorityResolver.js";
import { es5ClassCompat } from "./extHostTypes/es5ClassCompat.js";
import { MarkdownString } from "./extHostTypes/markdownString.js";
import { Range } from "./extHostTypes/range.js";
import { CodeActionKind as CodeActionKind2 } from "./extHostTypes/codeActionKind.js";
import {
  Diagnostic as Diagnostic2,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag
} from "./extHostTypes/diagnostic.js";
import { Location as Location2 } from "./extHostTypes/location.js";
import { MarkdownString as MarkdownString2 } from "./extHostTypes/markdownString.js";
import { NotebookCellData, NotebookCellKind, NotebookCellOutput, NotebookCellOutputItem, NotebookData, NotebookEdit, NotebookRange } from "./extHostTypes/notebooks.js";
import { Position as Position2 } from "./extHostTypes/position.js";
import { Range as Range2 } from "./extHostTypes/range.js";
import { Selection } from "./extHostTypes/selection.js";
import { SnippetString as SnippetString2 } from "./extHostTypes/snippetString.js";
import { SnippetTextEdit } from "./extHostTypes/snippetTextEdit.js";
import { SymbolInformation, SymbolKind as SymbolKind2, SymbolTag as SymbolTag2 } from "./extHostTypes/symbolInformation.js";
import { EndOfLine, TextEdit as TextEdit2 } from "./extHostTypes/textEdit.js";
import { FileEditType, WorkspaceEdit as WorkspaceEdit2 } from "./extHostTypes/workspaceEdit.js";
var TerminalOutputAnchor = /* @__PURE__ */ ((TerminalOutputAnchor2) => {
  TerminalOutputAnchor2[TerminalOutputAnchor2["Top"] = 0] = "Top";
  TerminalOutputAnchor2[TerminalOutputAnchor2["Bottom"] = 1] = "Bottom";
  return TerminalOutputAnchor2;
})(TerminalOutputAnchor || {});
var TerminalQuickFixType = /* @__PURE__ */ ((TerminalQuickFixType2) => {
  TerminalQuickFixType2[TerminalQuickFixType2["TerminalCommand"] = 0] = "TerminalCommand";
  TerminalQuickFixType2[TerminalQuickFixType2["Opener"] = 1] = "Opener";
  TerminalQuickFixType2[TerminalQuickFixType2["Command"] = 3] = "Command";
  return TerminalQuickFixType2;
})(TerminalQuickFixType || {});
let Disposable = class {
  constructor(callOnDispose) {
    __privateAdd(this, _callOnDispose);
    __privateSet(this, _callOnDispose, callOnDispose);
  }
  static from(...inDisposables) {
    let disposables = inDisposables;
    return new Disposable(function() {
      if (disposables) {
        for (const disposable of disposables) {
          if (disposable && typeof disposable.dispose === "function") {
            disposable.dispose();
          }
        }
        disposables = void 0;
      }
    });
  }
  dispose() {
    if (typeof __privateGet(this, _callOnDispose) === "function") {
      __privateGet(this, _callOnDispose).call(this);
      __privateSet(this, _callOnDispose, void 0);
    }
  }
};
_callOnDispose = new WeakMap();
Disposable = __decorateClass([
  es5ClassCompat
], Disposable);
const validateConnectionToken = (connectionToken) => {
  if (typeof connectionToken !== "string" || connectionToken.length === 0 || !/^[0-9A-Za-z_\-]+$/.test(connectionToken)) {
    throw illegalArgument("connectionToken");
  }
};
class ResolvedAuthority {
  static isResolvedAuthority(resolvedAuthority) {
    return resolvedAuthority && typeof resolvedAuthority === "object" && typeof resolvedAuthority.host === "string" && typeof resolvedAuthority.port === "number" && (resolvedAuthority.connectionToken === void 0 || typeof resolvedAuthority.connectionToken === "string");
  }
  constructor(host, port, connectionToken) {
    if (typeof host !== "string" || host.length === 0) {
      throw illegalArgument("host");
    }
    if (typeof port !== "number" || port === 0 || Math.round(port) !== port) {
      throw illegalArgument("port");
    }
    if (typeof connectionToken !== "undefined") {
      validateConnectionToken(connectionToken);
    }
    this.host = host;
    this.port = Math.round(port);
    this.connectionToken = connectionToken;
  }
}
class ManagedResolvedAuthority {
  constructor(makeConnection, connectionToken) {
    this.makeConnection = makeConnection;
    this.connectionToken = connectionToken;
    if (typeof connectionToken !== "undefined") {
      validateConnectionToken(connectionToken);
    }
  }
  static isManagedResolvedAuthority(resolvedAuthority) {
    return resolvedAuthority && typeof resolvedAuthority === "object" && typeof resolvedAuthority.makeConnection === "function" && (resolvedAuthority.connectionToken === void 0 || typeof resolvedAuthority.connectionToken === "string");
  }
}
class RemoteAuthorityResolverError extends Error {
  static NotAvailable(message, handled) {
    return new RemoteAuthorityResolverError(message, RemoteAuthorityResolverErrorCode.NotAvailable, handled);
  }
  static TemporarilyNotAvailable(message) {
    return new RemoteAuthorityResolverError(message, RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable);
  }
  constructor(message, code = RemoteAuthorityResolverErrorCode.Unknown, detail) {
    super(message);
    this._message = message;
    this._code = code;
    this._detail = detail;
    Object.setPrototypeOf(this, RemoteAuthorityResolverError.prototype);
  }
}
var EnvironmentVariableMutatorType = /* @__PURE__ */ ((EnvironmentVariableMutatorType2) => {
  EnvironmentVariableMutatorType2[EnvironmentVariableMutatorType2["Replace"] = 1] = "Replace";
  EnvironmentVariableMutatorType2[EnvironmentVariableMutatorType2["Append"] = 2] = "Append";
  EnvironmentVariableMutatorType2[EnvironmentVariableMutatorType2["Prepend"] = 3] = "Prepend";
  return EnvironmentVariableMutatorType2;
})(EnvironmentVariableMutatorType || {});
let Hover = class {
  constructor(contents, range) {
    if (!contents) {
      throw new Error("Illegal argument, contents must be defined");
    }
    if (Array.isArray(contents)) {
      this.contents = contents;
    } else {
      this.contents = [contents];
    }
    this.range = range;
  }
};
Hover = __decorateClass([
  es5ClassCompat
], Hover);
let VerboseHover = class extends Hover {
  constructor(contents, range, canIncreaseVerbosity, canDecreaseVerbosity) {
    super(contents, range);
    this.canIncreaseVerbosity = canIncreaseVerbosity;
    this.canDecreaseVerbosity = canDecreaseVerbosity;
  }
};
VerboseHover = __decorateClass([
  es5ClassCompat
], VerboseHover);
var HoverVerbosityAction = /* @__PURE__ */ ((HoverVerbosityAction2) => {
  HoverVerbosityAction2[HoverVerbosityAction2["Increase"] = 0] = "Increase";
  HoverVerbosityAction2[HoverVerbosityAction2["Decrease"] = 1] = "Decrease";
  return HoverVerbosityAction2;
})(HoverVerbosityAction || {});
var DocumentHighlightKind = /* @__PURE__ */ ((DocumentHighlightKind2) => {
  DocumentHighlightKind2[DocumentHighlightKind2["Text"] = 0] = "Text";
  DocumentHighlightKind2[DocumentHighlightKind2["Read"] = 1] = "Read";
  DocumentHighlightKind2[DocumentHighlightKind2["Write"] = 2] = "Write";
  return DocumentHighlightKind2;
})(DocumentHighlightKind || {});
let DocumentHighlight = class {
  constructor(range, kind = 0 /* Text */) {
    this.range = range;
    this.kind = kind;
  }
  toJSON() {
    return {
      range: this.range,
      kind: DocumentHighlightKind[this.kind]
    };
  }
};
DocumentHighlight = __decorateClass([
  es5ClassCompat
], DocumentHighlight);
let MultiDocumentHighlight = class {
  constructor(uri, highlights) {
    this.uri = uri;
    this.highlights = highlights;
  }
  toJSON() {
    return {
      uri: this.uri,
      highlights: this.highlights.map((h) => h.toJSON())
    };
  }
};
MultiDocumentHighlight = __decorateClass([
  es5ClassCompat
], MultiDocumentHighlight);
let DocumentSymbol = class {
  static validate(candidate) {
    if (!candidate.name) {
      throw new Error("name must not be falsy");
    }
    if (!candidate.range.contains(candidate.selectionRange)) {
      throw new Error("selectionRange must be contained in fullRange");
    }
    candidate.children?.forEach(DocumentSymbol.validate);
  }
  constructor(name, detail, kind, range, selectionRange) {
    this.name = name;
    this.detail = detail;
    this.kind = kind;
    this.range = range;
    this.selectionRange = selectionRange;
    this.children = [];
    DocumentSymbol.validate(this);
  }
};
DocumentSymbol = __decorateClass([
  es5ClassCompat
], DocumentSymbol);
var CodeActionTriggerKind = /* @__PURE__ */ ((CodeActionTriggerKind2) => {
  CodeActionTriggerKind2[CodeActionTriggerKind2["Invoke"] = 1] = "Invoke";
  CodeActionTriggerKind2[CodeActionTriggerKind2["Automatic"] = 2] = "Automatic";
  return CodeActionTriggerKind2;
})(CodeActionTriggerKind || {});
let CodeAction = class {
  constructor(title, kind) {
    this.title = title;
    this.kind = kind;
  }
};
CodeAction = __decorateClass([
  es5ClassCompat
], CodeAction);
let SelectionRange = class {
  constructor(range, parent) {
    this.range = range;
    this.parent = parent;
    if (parent && !parent.range.contains(this.range)) {
      throw new Error("Invalid argument: parent must contain this range");
    }
  }
};
SelectionRange = __decorateClass([
  es5ClassCompat
], SelectionRange);
class CallHierarchyItem {
  constructor(kind, name, detail, uri, range, selectionRange) {
    this.kind = kind;
    this.name = name;
    this.detail = detail;
    this.uri = uri;
    this.range = range;
    this.selectionRange = selectionRange;
  }
}
class CallHierarchyIncomingCall {
  constructor(item, fromRanges) {
    this.fromRanges = fromRanges;
    this.from = item;
  }
}
class CallHierarchyOutgoingCall {
  constructor(item, fromRanges) {
    this.fromRanges = fromRanges;
    this.to = item;
  }
}
var LanguageStatusSeverity = /* @__PURE__ */ ((LanguageStatusSeverity2) => {
  LanguageStatusSeverity2[LanguageStatusSeverity2["Information"] = 0] = "Information";
  LanguageStatusSeverity2[LanguageStatusSeverity2["Warning"] = 1] = "Warning";
  LanguageStatusSeverity2[LanguageStatusSeverity2["Error"] = 2] = "Error";
  return LanguageStatusSeverity2;
})(LanguageStatusSeverity || {});
let CodeLens = class {
  constructor(range, command) {
    this.range = range;
    this.command = command;
  }
  get isResolved() {
    return !!this.command;
  }
};
CodeLens = __decorateClass([
  es5ClassCompat
], CodeLens);
let ParameterInformation = class {
  constructor(label, documentation) {
    this.label = label;
    this.documentation = documentation;
  }
};
ParameterInformation = __decorateClass([
  es5ClassCompat
], ParameterInformation);
let SignatureInformation = class {
  constructor(label, documentation) {
    this.label = label;
    this.documentation = documentation;
    this.parameters = [];
  }
};
SignatureInformation = __decorateClass([
  es5ClassCompat
], SignatureInformation);
let SignatureHelp = class {
  constructor() {
    this.activeSignature = 0;
    this.activeParameter = 0;
    this.signatures = [];
  }
};
SignatureHelp = __decorateClass([
  es5ClassCompat
], SignatureHelp);
var SignatureHelpTriggerKind = /* @__PURE__ */ ((SignatureHelpTriggerKind2) => {
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["Invoke"] = 1] = "Invoke";
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["TriggerCharacter"] = 2] = "TriggerCharacter";
  SignatureHelpTriggerKind2[SignatureHelpTriggerKind2["ContentChange"] = 3] = "ContentChange";
  return SignatureHelpTriggerKind2;
})(SignatureHelpTriggerKind || {});
var InlayHintKind = /* @__PURE__ */ ((InlayHintKind2) => {
  InlayHintKind2[InlayHintKind2["Type"] = 1] = "Type";
  InlayHintKind2[InlayHintKind2["Parameter"] = 2] = "Parameter";
  return InlayHintKind2;
})(InlayHintKind || {});
let InlayHintLabelPart = class {
  constructor(value) {
    this.value = value;
  }
};
InlayHintLabelPart = __decorateClass([
  es5ClassCompat
], InlayHintLabelPart);
let InlayHint = class {
  constructor(position, label, kind) {
    this.position = position;
    this.label = label;
    this.kind = kind;
  }
};
InlayHint = __decorateClass([
  es5ClassCompat
], InlayHint);
var CompletionTriggerKind = /* @__PURE__ */ ((CompletionTriggerKind2) => {
  CompletionTriggerKind2[CompletionTriggerKind2["Invoke"] = 0] = "Invoke";
  CompletionTriggerKind2[CompletionTriggerKind2["TriggerCharacter"] = 1] = "TriggerCharacter";
  CompletionTriggerKind2[CompletionTriggerKind2["TriggerForIncompleteCompletions"] = 2] = "TriggerForIncompleteCompletions";
  return CompletionTriggerKind2;
})(CompletionTriggerKind || {});
var CompletionItemKind = /* @__PURE__ */ ((CompletionItemKind2) => {
  CompletionItemKind2[CompletionItemKind2["Text"] = 0] = "Text";
  CompletionItemKind2[CompletionItemKind2["Method"] = 1] = "Method";
  CompletionItemKind2[CompletionItemKind2["Function"] = 2] = "Function";
  CompletionItemKind2[CompletionItemKind2["Constructor"] = 3] = "Constructor";
  CompletionItemKind2[CompletionItemKind2["Field"] = 4] = "Field";
  CompletionItemKind2[CompletionItemKind2["Variable"] = 5] = "Variable";
  CompletionItemKind2[CompletionItemKind2["Class"] = 6] = "Class";
  CompletionItemKind2[CompletionItemKind2["Interface"] = 7] = "Interface";
  CompletionItemKind2[CompletionItemKind2["Module"] = 8] = "Module";
  CompletionItemKind2[CompletionItemKind2["Property"] = 9] = "Property";
  CompletionItemKind2[CompletionItemKind2["Unit"] = 10] = "Unit";
  CompletionItemKind2[CompletionItemKind2["Value"] = 11] = "Value";
  CompletionItemKind2[CompletionItemKind2["Enum"] = 12] = "Enum";
  CompletionItemKind2[CompletionItemKind2["Keyword"] = 13] = "Keyword";
  CompletionItemKind2[CompletionItemKind2["Snippet"] = 14] = "Snippet";
  CompletionItemKind2[CompletionItemKind2["Color"] = 15] = "Color";
  CompletionItemKind2[CompletionItemKind2["File"] = 16] = "File";
  CompletionItemKind2[CompletionItemKind2["Reference"] = 17] = "Reference";
  CompletionItemKind2[CompletionItemKind2["Folder"] = 18] = "Folder";
  CompletionItemKind2[CompletionItemKind2["EnumMember"] = 19] = "EnumMember";
  CompletionItemKind2[CompletionItemKind2["Constant"] = 20] = "Constant";
  CompletionItemKind2[CompletionItemKind2["Struct"] = 21] = "Struct";
  CompletionItemKind2[CompletionItemKind2["Event"] = 22] = "Event";
  CompletionItemKind2[CompletionItemKind2["Operator"] = 23] = "Operator";
  CompletionItemKind2[CompletionItemKind2["TypeParameter"] = 24] = "TypeParameter";
  CompletionItemKind2[CompletionItemKind2["User"] = 25] = "User";
  CompletionItemKind2[CompletionItemKind2["Issue"] = 26] = "Issue";
  return CompletionItemKind2;
})(CompletionItemKind || {});
var CompletionItemTag = /* @__PURE__ */ ((CompletionItemTag2) => {
  CompletionItemTag2[CompletionItemTag2["Deprecated"] = 1] = "Deprecated";
  return CompletionItemTag2;
})(CompletionItemTag || {});
let CompletionItem = class {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
  }
  toJSON() {
    return {
      label: this.label,
      kind: this.kind && CompletionItemKind[this.kind],
      detail: this.detail,
      documentation: this.documentation,
      sortText: this.sortText,
      filterText: this.filterText,
      preselect: this.preselect,
      insertText: this.insertText,
      textEdit: this.textEdit
    };
  }
};
CompletionItem = __decorateClass([
  es5ClassCompat
], CompletionItem);
let CompletionList = class {
  constructor(items = [], isIncomplete = false) {
    this.items = items;
    this.isIncomplete = isIncomplete;
  }
};
CompletionList = __decorateClass([
  es5ClassCompat
], CompletionList);
let InlineSuggestion = class {
  constructor(insertText, range, command) {
    this.insertText = insertText;
    this.range = range;
    this.command = command;
  }
};
InlineSuggestion = __decorateClass([
  es5ClassCompat
], InlineSuggestion);
let InlineSuggestionList = class {
  constructor(items) {
    this.commands = void 0;
    this.suppressSuggestions = void 0;
    this.items = items;
  }
};
InlineSuggestionList = __decorateClass([
  es5ClassCompat
], InlineSuggestionList);
var PartialAcceptTriggerKind = /* @__PURE__ */ ((PartialAcceptTriggerKind2) => {
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Unknown"] = 0] = "Unknown";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Word"] = 1] = "Word";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Line"] = 2] = "Line";
  PartialAcceptTriggerKind2[PartialAcceptTriggerKind2["Suggest"] = 3] = "Suggest";
  return PartialAcceptTriggerKind2;
})(PartialAcceptTriggerKind || {});
var InlineCompletionEndOfLifeReasonKind = /* @__PURE__ */ ((InlineCompletionEndOfLifeReasonKind2) => {
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Accepted"] = 0] = "Accepted";
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Rejected"] = 1] = "Rejected";
  InlineCompletionEndOfLifeReasonKind2[InlineCompletionEndOfLifeReasonKind2["Ignored"] = 2] = "Ignored";
  return InlineCompletionEndOfLifeReasonKind2;
})(InlineCompletionEndOfLifeReasonKind || {});
var InlineCompletionDisplayLocationKind = /* @__PURE__ */ ((InlineCompletionDisplayLocationKind2) => {
  InlineCompletionDisplayLocationKind2[InlineCompletionDisplayLocationKind2["Code"] = 1] = "Code";
  InlineCompletionDisplayLocationKind2[InlineCompletionDisplayLocationKind2["Label"] = 2] = "Label";
  return InlineCompletionDisplayLocationKind2;
})(InlineCompletionDisplayLocationKind || {});
var ViewColumn = /* @__PURE__ */ ((ViewColumn2) => {
  ViewColumn2[ViewColumn2["Active"] = -1] = "Active";
  ViewColumn2[ViewColumn2["Beside"] = -2] = "Beside";
  ViewColumn2[ViewColumn2["One"] = 1] = "One";
  ViewColumn2[ViewColumn2["Two"] = 2] = "Two";
  ViewColumn2[ViewColumn2["Three"] = 3] = "Three";
  ViewColumn2[ViewColumn2["Four"] = 4] = "Four";
  ViewColumn2[ViewColumn2["Five"] = 5] = "Five";
  ViewColumn2[ViewColumn2["Six"] = 6] = "Six";
  ViewColumn2[ViewColumn2["Seven"] = 7] = "Seven";
  ViewColumn2[ViewColumn2["Eight"] = 8] = "Eight";
  ViewColumn2[ViewColumn2["Nine"] = 9] = "Nine";
  return ViewColumn2;
})(ViewColumn || {});
var StatusBarAlignment = /* @__PURE__ */ ((StatusBarAlignment2) => {
  StatusBarAlignment2[StatusBarAlignment2["Left"] = 1] = "Left";
  StatusBarAlignment2[StatusBarAlignment2["Right"] = 2] = "Right";
  return StatusBarAlignment2;
})(StatusBarAlignment || {});
function asStatusBarItemIdentifier(extension, id) {
  return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}
var TextEditorLineNumbersStyle = /* @__PURE__ */ ((TextEditorLineNumbersStyle2) => {
  TextEditorLineNumbersStyle2[TextEditorLineNumbersStyle2["Off"] = 0] = "Off";
  TextEditorLineNumbersStyle2[TextEditorLineNumbersStyle2["On"] = 1] = "On";
  TextEditorLineNumbersStyle2[TextEditorLineNumbersStyle2["Relative"] = 2] = "Relative";
  TextEditorLineNumbersStyle2[TextEditorLineNumbersStyle2["Interval"] = 3] = "Interval";
  return TextEditorLineNumbersStyle2;
})(TextEditorLineNumbersStyle || {});
var TextDocumentSaveReason = /* @__PURE__ */ ((TextDocumentSaveReason2) => {
  TextDocumentSaveReason2[TextDocumentSaveReason2["Manual"] = 1] = "Manual";
  TextDocumentSaveReason2[TextDocumentSaveReason2["AfterDelay"] = 2] = "AfterDelay";
  TextDocumentSaveReason2[TextDocumentSaveReason2["FocusOut"] = 3] = "FocusOut";
  return TextDocumentSaveReason2;
})(TextDocumentSaveReason || {});
var TextEditorRevealType = /* @__PURE__ */ ((TextEditorRevealType2) => {
  TextEditorRevealType2[TextEditorRevealType2["Default"] = 0] = "Default";
  TextEditorRevealType2[TextEditorRevealType2["InCenter"] = 1] = "InCenter";
  TextEditorRevealType2[TextEditorRevealType2["InCenterIfOutsideViewport"] = 2] = "InCenterIfOutsideViewport";
  TextEditorRevealType2[TextEditorRevealType2["AtTop"] = 3] = "AtTop";
  return TextEditorRevealType2;
})(TextEditorRevealType || {});
var TextEditorSelectionChangeKind = /* @__PURE__ */ ((TextEditorSelectionChangeKind2) => {
  TextEditorSelectionChangeKind2[TextEditorSelectionChangeKind2["Keyboard"] = 1] = "Keyboard";
  TextEditorSelectionChangeKind2[TextEditorSelectionChangeKind2["Mouse"] = 2] = "Mouse";
  TextEditorSelectionChangeKind2[TextEditorSelectionChangeKind2["Command"] = 3] = "Command";
  return TextEditorSelectionChangeKind2;
})(TextEditorSelectionChangeKind || {});
var TextEditorChangeKind = /* @__PURE__ */ ((TextEditorChangeKind2) => {
  TextEditorChangeKind2[TextEditorChangeKind2["Addition"] = 1] = "Addition";
  TextEditorChangeKind2[TextEditorChangeKind2["Deletion"] = 2] = "Deletion";
  TextEditorChangeKind2[TextEditorChangeKind2["Modification"] = 3] = "Modification";
  return TextEditorChangeKind2;
})(TextEditorChangeKind || {});
var TextDocumentChangeReason = /* @__PURE__ */ ((TextDocumentChangeReason2) => {
  TextDocumentChangeReason2[TextDocumentChangeReason2["Undo"] = 1] = "Undo";
  TextDocumentChangeReason2[TextDocumentChangeReason2["Redo"] = 2] = "Redo";
  return TextDocumentChangeReason2;
})(TextDocumentChangeReason || {});
var DecorationRangeBehavior = /* @__PURE__ */ ((DecorationRangeBehavior2) => {
  DecorationRangeBehavior2[DecorationRangeBehavior2["OpenOpen"] = 0] = "OpenOpen";
  DecorationRangeBehavior2[DecorationRangeBehavior2["ClosedClosed"] = 1] = "ClosedClosed";
  DecorationRangeBehavior2[DecorationRangeBehavior2["OpenClosed"] = 2] = "OpenClosed";
  DecorationRangeBehavior2[DecorationRangeBehavior2["ClosedOpen"] = 3] = "ClosedOpen";
  return DecorationRangeBehavior2;
})(DecorationRangeBehavior || {});
((TextEditorSelectionChangeKind2) => {
  function fromValue(s) {
    switch (s) {
      case "keyboard":
        return 1 /* Keyboard */;
      case "mouse":
        return 2 /* Mouse */;
      case TextEditorSelectionSource.PROGRAMMATIC:
      case TextEditorSelectionSource.JUMP:
      case TextEditorSelectionSource.NAVIGATION:
        return 3 /* Command */;
    }
    return void 0;
  }
  TextEditorSelectionChangeKind2.fromValue = fromValue;
})(TextEditorSelectionChangeKind || (TextEditorSelectionChangeKind = {}));
var SyntaxTokenType = /* @__PURE__ */ ((SyntaxTokenType2) => {
  SyntaxTokenType2[SyntaxTokenType2["Other"] = 0] = "Other";
  SyntaxTokenType2[SyntaxTokenType2["Comment"] = 1] = "Comment";
  SyntaxTokenType2[SyntaxTokenType2["String"] = 2] = "String";
  SyntaxTokenType2[SyntaxTokenType2["RegEx"] = 3] = "RegEx";
  return SyntaxTokenType2;
})(SyntaxTokenType || {});
((SyntaxTokenType2) => {
  function toString(v) {
    switch (v) {
      case 0 /* Other */:
        return "other";
      case 1 /* Comment */:
        return "comment";
      case 2 /* String */:
        return "string";
      case 3 /* RegEx */:
        return "regex";
    }
    return "other";
  }
  SyntaxTokenType2.toString = toString;
})(SyntaxTokenType || (SyntaxTokenType = {}));
let DocumentLink = class {
  constructor(range, target) {
    if (target && !URI.isUri(target)) {
      throw illegalArgument("target");
    }
    if (!Range.isRange(range) || range.isEmpty) {
      throw illegalArgument("range");
    }
    this.range = range;
    this.target = target;
  }
};
DocumentLink = __decorateClass([
  es5ClassCompat
], DocumentLink);
let Color = class {
  constructor(red, green, blue, alpha) {
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.alpha = alpha;
  }
};
Color = __decorateClass([
  es5ClassCompat
], Color);
let ColorInformation = class {
  constructor(range, color) {
    if (color && !(color instanceof Color)) {
      throw illegalArgument("color");
    }
    if (!Range.isRange(range) || range.isEmpty) {
      throw illegalArgument("range");
    }
    this.range = range;
    this.color = color;
  }
};
ColorInformation = __decorateClass([
  es5ClassCompat
], ColorInformation);
let ColorPresentation = class {
  constructor(label) {
    if (!label || typeof label !== "string") {
      throw illegalArgument("label");
    }
    this.label = label;
  }
};
ColorPresentation = __decorateClass([
  es5ClassCompat
], ColorPresentation);
var ColorFormat = /* @__PURE__ */ ((ColorFormat2) => {
  ColorFormat2[ColorFormat2["RGB"] = 0] = "RGB";
  ColorFormat2[ColorFormat2["HEX"] = 1] = "HEX";
  ColorFormat2[ColorFormat2["HSL"] = 2] = "HSL";
  return ColorFormat2;
})(ColorFormat || {});
var SourceControlInputBoxValidationType = /* @__PURE__ */ ((SourceControlInputBoxValidationType2) => {
  SourceControlInputBoxValidationType2[SourceControlInputBoxValidationType2["Error"] = 0] = "Error";
  SourceControlInputBoxValidationType2[SourceControlInputBoxValidationType2["Warning"] = 1] = "Warning";
  SourceControlInputBoxValidationType2[SourceControlInputBoxValidationType2["Information"] = 2] = "Information";
  return SourceControlInputBoxValidationType2;
})(SourceControlInputBoxValidationType || {});
var TerminalExitReason = /* @__PURE__ */ ((TerminalExitReason2) => {
  TerminalExitReason2[TerminalExitReason2["Unknown"] = 0] = "Unknown";
  TerminalExitReason2[TerminalExitReason2["Shutdown"] = 1] = "Shutdown";
  TerminalExitReason2[TerminalExitReason2["Process"] = 2] = "Process";
  TerminalExitReason2[TerminalExitReason2["User"] = 3] = "User";
  TerminalExitReason2[TerminalExitReason2["Extension"] = 4] = "Extension";
  return TerminalExitReason2;
})(TerminalExitReason || {});
var TerminalShellExecutionCommandLineConfidence = /* @__PURE__ */ ((TerminalShellExecutionCommandLineConfidence2) => {
  TerminalShellExecutionCommandLineConfidence2[TerminalShellExecutionCommandLineConfidence2["Low"] = 0] = "Low";
  TerminalShellExecutionCommandLineConfidence2[TerminalShellExecutionCommandLineConfidence2["Medium"] = 1] = "Medium";
  TerminalShellExecutionCommandLineConfidence2[TerminalShellExecutionCommandLineConfidence2["High"] = 2] = "High";
  return TerminalShellExecutionCommandLineConfidence2;
})(TerminalShellExecutionCommandLineConfidence || {});
var TerminalShellType = /* @__PURE__ */ ((TerminalShellType2) => {
  TerminalShellType2[TerminalShellType2["Sh"] = 1] = "Sh";
  TerminalShellType2[TerminalShellType2["Bash"] = 2] = "Bash";
  TerminalShellType2[TerminalShellType2["Fish"] = 3] = "Fish";
  TerminalShellType2[TerminalShellType2["Csh"] = 4] = "Csh";
  TerminalShellType2[TerminalShellType2["Ksh"] = 5] = "Ksh";
  TerminalShellType2[TerminalShellType2["Zsh"] = 6] = "Zsh";
  TerminalShellType2[TerminalShellType2["CommandPrompt"] = 7] = "CommandPrompt";
  TerminalShellType2[TerminalShellType2["GitBash"] = 8] = "GitBash";
  TerminalShellType2[TerminalShellType2["PowerShell"] = 9] = "PowerShell";
  TerminalShellType2[TerminalShellType2["Python"] = 10] = "Python";
  TerminalShellType2[TerminalShellType2["Julia"] = 11] = "Julia";
  TerminalShellType2[TerminalShellType2["NuShell"] = 12] = "NuShell";
  TerminalShellType2[TerminalShellType2["Node"] = 13] = "Node";
  TerminalShellType2[TerminalShellType2["Xonsh"] = 14] = "Xonsh";
  return TerminalShellType2;
})(TerminalShellType || {});
class TerminalLink {
  constructor(startIndex, length, tooltip) {
    this.startIndex = startIndex;
    this.length = length;
    this.tooltip = tooltip;
    if (typeof startIndex !== "number" || startIndex < 0) {
      throw illegalArgument("startIndex");
    }
    if (typeof length !== "number" || length < 1) {
      throw illegalArgument("length");
    }
    if (tooltip !== void 0 && typeof tooltip !== "string") {
      throw illegalArgument("tooltip");
    }
  }
}
class TerminalQuickFixOpener {
  constructor(uri) {
    this.uri = uri;
  }
}
class TerminalQuickFixCommand {
  constructor(terminalCommand) {
    this.terminalCommand = terminalCommand;
  }
}
var TerminalLocation = /* @__PURE__ */ ((TerminalLocation2) => {
  TerminalLocation2[TerminalLocation2["Panel"] = 1] = "Panel";
  TerminalLocation2[TerminalLocation2["Editor"] = 2] = "Editor";
  return TerminalLocation2;
})(TerminalLocation || {});
class TerminalProfile {
  constructor(options) {
    this.options = options;
    if (typeof options !== "object") {
      throw illegalArgument("options");
    }
  }
}
var TerminalCompletionItemKind = /* @__PURE__ */ ((TerminalCompletionItemKind2) => {
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["File"] = 0] = "File";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Folder"] = 1] = "Folder";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Method"] = 2] = "Method";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Alias"] = 3] = "Alias";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Argument"] = 4] = "Argument";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Option"] = 5] = "Option";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["OptionValue"] = 6] = "OptionValue";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["Flag"] = 7] = "Flag";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["SymbolicLinkFile"] = 8] = "SymbolicLinkFile";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["SymbolicLinkFolder"] = 9] = "SymbolicLinkFolder";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmCommit"] = 10] = "ScmCommit";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmBranch"] = 11] = "ScmBranch";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmTag"] = 12] = "ScmTag";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmStash"] = 13] = "ScmStash";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["ScmRemote"] = 14] = "ScmRemote";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["PullRequest"] = 15] = "PullRequest";
  TerminalCompletionItemKind2[TerminalCompletionItemKind2["PullRequestDone"] = 16] = "PullRequestDone";
  return TerminalCompletionItemKind2;
})(TerminalCompletionItemKind || {});
class TerminalCompletionItem {
  constructor(label, replacementRange, kind, detail, documentation, isFile, isDirectory, isKeyword) {
    this.label = label;
    this.replacementRange = replacementRange;
    this.kind = kind;
    this.detail = detail;
    this.documentation = documentation;
    this.isFile = isFile;
    this.isDirectory = isDirectory;
    this.isKeyword = isKeyword;
  }
}
class TerminalCompletionList {
  /**
   * Creates a new completion list.
   *
   * @param items The completion items.
   * @param isIncomplete The list is not complete.
   */
  constructor(items, resourceOptions) {
    this.items = items ?? [];
    this.resourceOptions = resourceOptions;
  }
}
var TaskRevealKind = /* @__PURE__ */ ((TaskRevealKind2) => {
  TaskRevealKind2[TaskRevealKind2["Always"] = 1] = "Always";
  TaskRevealKind2[TaskRevealKind2["Silent"] = 2] = "Silent";
  TaskRevealKind2[TaskRevealKind2["Never"] = 3] = "Never";
  return TaskRevealKind2;
})(TaskRevealKind || {});
var TaskEventKind = /* @__PURE__ */ ((TaskEventKind2) => {
  TaskEventKind2["Changed"] = "changed";
  TaskEventKind2["ProcessStarted"] = "processStarted";
  TaskEventKind2["ProcessEnded"] = "processEnded";
  TaskEventKind2["Terminated"] = "terminated";
  TaskEventKind2["Start"] = "start";
  TaskEventKind2["AcquiredInput"] = "acquiredInput";
  TaskEventKind2["DependsOnStarted"] = "dependsOnStarted";
  TaskEventKind2["Active"] = "active";
  TaskEventKind2["Inactive"] = "inactive";
  TaskEventKind2["End"] = "end";
  TaskEventKind2["ProblemMatcherStarted"] = "problemMatcherStarted";
  TaskEventKind2["ProblemMatcherEnded"] = "problemMatcherEnded";
  TaskEventKind2["ProblemMatcherFoundErrors"] = "problemMatcherFoundErrors";
  return TaskEventKind2;
})(TaskEventKind || {});
var TaskPanelKind = /* @__PURE__ */ ((TaskPanelKind2) => {
  TaskPanelKind2[TaskPanelKind2["Shared"] = 1] = "Shared";
  TaskPanelKind2[TaskPanelKind2["Dedicated"] = 2] = "Dedicated";
  TaskPanelKind2[TaskPanelKind2["New"] = 3] = "New";
  return TaskPanelKind2;
})(TaskPanelKind || {});
let TaskGroup = class {
  constructor(id, label) {
    this.label = label;
    if (typeof id !== "string") {
      throw illegalArgument("name");
    }
    if (typeof label !== "string") {
      throw illegalArgument("name");
    }
    this._id = id;
  }
  static from(value) {
    switch (value) {
      case "clean":
        return TaskGroup.Clean;
      case "build":
        return TaskGroup.Build;
      case "rebuild":
        return TaskGroup.Rebuild;
      case "test":
        return TaskGroup.Test;
      default:
        return void 0;
    }
  }
  get id() {
    return this._id;
  }
};
TaskGroup.Clean = new TaskGroup("clean", "Clean");
TaskGroup.Build = new TaskGroup("build", "Build");
TaskGroup.Rebuild = new TaskGroup("rebuild", "Rebuild");
TaskGroup.Test = new TaskGroup("test", "Test");
TaskGroup = __decorateClass([
  es5ClassCompat
], TaskGroup);
function computeTaskExecutionId(values) {
  let id = "";
  for (let i = 0; i < values.length; i++) {
    id += values[i].replace(/,/g, ",,") + ",";
  }
  return id;
}
let ProcessExecution = class {
  constructor(process, varg1, varg2) {
    if (typeof process !== "string") {
      throw illegalArgument("process");
    }
    this._args = [];
    this._process = process;
    if (varg1 !== void 0) {
      if (Array.isArray(varg1)) {
        this._args = varg1;
        this._options = varg2;
      } else {
        this._options = varg1;
      }
    }
  }
  get process() {
    return this._process;
  }
  set process(value) {
    if (typeof value !== "string") {
      throw illegalArgument("process");
    }
    this._process = value;
  }
  get args() {
    return this._args;
  }
  set args(value) {
    if (!Array.isArray(value)) {
      value = [];
    }
    this._args = value;
  }
  get options() {
    return this._options;
  }
  set options(value) {
    this._options = value;
  }
  computeId() {
    const props = [];
    props.push("process");
    if (this._process !== void 0) {
      props.push(this._process);
    }
    if (this._args && this._args.length > 0) {
      for (const arg of this._args) {
        props.push(arg);
      }
    }
    return computeTaskExecutionId(props);
  }
};
ProcessExecution = __decorateClass([
  es5ClassCompat
], ProcessExecution);
let ShellExecution = class {
  constructor(arg0, arg1, arg2) {
    this._args = [];
    if (Array.isArray(arg1)) {
      if (!arg0) {
        throw illegalArgument("command can't be undefined or null");
      }
      if (typeof arg0 !== "string" && typeof arg0.value !== "string") {
        throw illegalArgument("command");
      }
      this._command = arg0;
      if (arg1) {
        this._args = arg1;
      }
      this._options = arg2;
    } else {
      if (typeof arg0 !== "string") {
        throw illegalArgument("commandLine");
      }
      this._commandLine = arg0;
      this._options = arg1;
    }
  }
  get commandLine() {
    return this._commandLine;
  }
  set commandLine(value) {
    if (typeof value !== "string") {
      throw illegalArgument("commandLine");
    }
    this._commandLine = value;
  }
  get command() {
    return this._command ? this._command : "";
  }
  set command(value) {
    if (typeof value !== "string" && typeof value.value !== "string") {
      throw illegalArgument("command");
    }
    this._command = value;
  }
  get args() {
    return this._args;
  }
  set args(value) {
    this._args = value || [];
  }
  get options() {
    return this._options;
  }
  set options(value) {
    this._options = value;
  }
  computeId() {
    const props = [];
    props.push("shell");
    if (this._commandLine !== void 0) {
      props.push(this._commandLine);
    }
    if (this._command !== void 0) {
      props.push(typeof this._command === "string" ? this._command : this._command.value);
    }
    if (this._args && this._args.length > 0) {
      for (const arg of this._args) {
        props.push(typeof arg === "string" ? arg : arg.value);
      }
    }
    return computeTaskExecutionId(props);
  }
};
ShellExecution = __decorateClass([
  es5ClassCompat
], ShellExecution);
var ShellQuoting = /* @__PURE__ */ ((ShellQuoting2) => {
  ShellQuoting2[ShellQuoting2["Escape"] = 1] = "Escape";
  ShellQuoting2[ShellQuoting2["Strong"] = 2] = "Strong";
  ShellQuoting2[ShellQuoting2["Weak"] = 3] = "Weak";
  return ShellQuoting2;
})(ShellQuoting || {});
var TaskScope = /* @__PURE__ */ ((TaskScope2) => {
  TaskScope2[TaskScope2["Global"] = 1] = "Global";
  TaskScope2[TaskScope2["Workspace"] = 2] = "Workspace";
  return TaskScope2;
})(TaskScope || {});
var TaskRunOn = /* @__PURE__ */ ((TaskRunOn2) => {
  TaskRunOn2[TaskRunOn2["Default"] = 1] = "Default";
  TaskRunOn2[TaskRunOn2["FolderOpen"] = 2] = "FolderOpen";
  TaskRunOn2[TaskRunOn2["WorktreeCreated"] = 3] = "WorktreeCreated";
  return TaskRunOn2;
})(TaskRunOn || {});
class CustomExecution {
  constructor(callback) {
    this._callback = callback;
  }
  computeId() {
    return "customExecution" + generateUuid();
  }
  set callback(value) {
    this._callback = value;
  }
  get callback() {
    return this._callback;
  }
}
let Task = class {
  constructor(definition, arg2, arg3, arg4, arg5, arg6) {
    this.__deprecated = false;
    this._definition = this.definition = definition;
    let problemMatchers;
    if (typeof arg2 === "string") {
      this._name = this.name = arg2;
      this._source = this.source = arg3;
      this.execution = arg4;
      problemMatchers = arg5;
      this.__deprecated = true;
    } else if (arg2 === 1 /* Global */ || arg2 === 2 /* Workspace */) {
      this.target = arg2;
      this._name = this.name = arg3;
      this._source = this.source = arg4;
      this.execution = arg5;
      problemMatchers = arg6;
    } else {
      this.target = arg2;
      this._name = this.name = arg3;
      this._source = this.source = arg4;
      this.execution = arg5;
      problemMatchers = arg6;
    }
    if (typeof problemMatchers === "string") {
      this._problemMatchers = [problemMatchers];
      this._hasDefinedMatchers = true;
    } else if (Array.isArray(problemMatchers)) {
      this._problemMatchers = problemMatchers;
      this._hasDefinedMatchers = true;
    } else {
      this._problemMatchers = [];
      this._hasDefinedMatchers = false;
    }
    this._isBackground = false;
    this._presentationOptions = /* @__PURE__ */ Object.create(null);
    this._runOptions = /* @__PURE__ */ Object.create(null);
  }
  get _id() {
    return this.__id;
  }
  set _id(value) {
    this.__id = value;
  }
  get _deprecated() {
    return this.__deprecated;
  }
  clear() {
    if (this.__id === void 0) {
      return;
    }
    this.__id = void 0;
    this._scope = void 0;
    this.computeDefinitionBasedOnExecution();
  }
  computeDefinitionBasedOnExecution() {
    if (this._execution instanceof ProcessExecution) {
      this._definition = {
        type: Task.ProcessType,
        id: this._execution.computeId()
      };
    } else if (this._execution instanceof ShellExecution) {
      this._definition = {
        type: Task.ShellType,
        id: this._execution.computeId()
      };
    } else if (this._execution instanceof CustomExecution) {
      this._definition = {
        type: Task.ExtensionCallbackType,
        id: this._execution.computeId()
      };
    } else {
      this._definition = {
        type: Task.EmptyType,
        id: generateUuid()
      };
    }
  }
  get definition() {
    return this._definition;
  }
  set definition(value) {
    if (value === void 0 || value === null) {
      throw illegalArgument("Kind can't be undefined or null");
    }
    this.clear();
    this._definition = value;
  }
  get scope() {
    return this._scope;
  }
  set target(value) {
    this.clear();
    this._scope = value;
  }
  get name() {
    return this._name;
  }
  set name(value) {
    if (typeof value !== "string") {
      throw illegalArgument("name");
    }
    this.clear();
    this._name = value;
  }
  get execution() {
    return this._execution;
  }
  set execution(value) {
    if (value === null) {
      value = void 0;
    }
    this.clear();
    this._execution = value;
    const type = this._definition.type;
    if (Task.EmptyType === type || Task.ProcessType === type || Task.ShellType === type || Task.ExtensionCallbackType === type) {
      this.computeDefinitionBasedOnExecution();
    }
  }
  get problemMatchers() {
    return this._problemMatchers;
  }
  set problemMatchers(value) {
    if (!Array.isArray(value)) {
      this.clear();
      this._problemMatchers = [];
      this._hasDefinedMatchers = false;
      return;
    } else {
      this.clear();
      this._problemMatchers = value;
      this._hasDefinedMatchers = true;
    }
  }
  get hasDefinedMatchers() {
    return this._hasDefinedMatchers;
  }
  get isBackground() {
    return this._isBackground;
  }
  set isBackground(value) {
    if (value !== true && value !== false) {
      value = false;
    }
    this.clear();
    this._isBackground = value;
  }
  get source() {
    return this._source;
  }
  set source(value) {
    if (typeof value !== "string" || value.length === 0) {
      throw illegalArgument("source must be a string of length > 0");
    }
    this.clear();
    this._source = value;
  }
  get group() {
    return this._group;
  }
  set group(value) {
    if (value === null) {
      value = void 0;
    }
    this.clear();
    this._group = value;
  }
  get detail() {
    return this._detail;
  }
  set detail(value) {
    if (value === null) {
      value = void 0;
    }
    this._detail = value;
  }
  get presentationOptions() {
    return this._presentationOptions;
  }
  set presentationOptions(value) {
    if (value === null || value === void 0) {
      value = /* @__PURE__ */ Object.create(null);
    }
    this.clear();
    this._presentationOptions = value;
  }
  get runOptions() {
    return this._runOptions;
  }
  set runOptions(value) {
    if (value === null || value === void 0) {
      value = /* @__PURE__ */ Object.create(null);
    }
    this.clear();
    this._runOptions = value;
  }
};
Task.ExtensionCallbackType = "customExecution";
Task.ProcessType = "process";
Task.ShellType = "shell";
Task.EmptyType = "$empty";
Task = __decorateClass([
  es5ClassCompat
], Task);
var ProgressLocation = /* @__PURE__ */ ((ProgressLocation2) => {
  ProgressLocation2[ProgressLocation2["SourceControl"] = 1] = "SourceControl";
  ProgressLocation2[ProgressLocation2["Window"] = 10] = "Window";
  ProgressLocation2[ProgressLocation2["Notification"] = 15] = "Notification";
  return ProgressLocation2;
})(ProgressLocation || {});
var ViewBadge;
((ViewBadge2) => {
  function isViewBadge(thing) {
    const viewBadgeThing = thing;
    if (!isNumber(viewBadgeThing.value)) {
      console.log("INVALID view badge, invalid value", viewBadgeThing.value);
      return false;
    }
    if (viewBadgeThing.tooltip && !isString(viewBadgeThing.tooltip)) {
      console.log("INVALID view badge, invalid tooltip", viewBadgeThing.tooltip);
      return false;
    }
    return true;
  }
  ViewBadge2.isViewBadge = isViewBadge;
})(ViewBadge || (ViewBadge = {}));
let TreeItem = class {
  constructor(arg1, collapsibleState = 0 /* None */) {
    this.collapsibleState = collapsibleState;
    if (URI.isUri(arg1)) {
      this.resourceUri = arg1;
    } else {
      this.label = arg1;
    }
  }
  static isTreeItem(thing, extension) {
    const treeItemThing = thing;
    if (treeItemThing.checkboxState !== void 0) {
      const checkbox = isNumber(treeItemThing.checkboxState) ? treeItemThing.checkboxState : isObject(treeItemThing.checkboxState) && isNumber(treeItemThing.checkboxState.state) ? treeItemThing.checkboxState.state : void 0;
      const tooltip = !isNumber(treeItemThing.checkboxState) && isObject(treeItemThing.checkboxState) ? treeItemThing.checkboxState.tooltip : void 0;
      if (checkbox === void 0 || checkbox !== 1 /* Checked */ && checkbox !== 0 /* Unchecked */ || tooltip !== void 0 && !isString(tooltip)) {
        console.log("INVALID tree item, invalid checkboxState", treeItemThing.checkboxState);
        return false;
      }
    }
    if (thing instanceof TreeItem) {
      return true;
    }
    if (treeItemThing.label !== void 0 && !isString(treeItemThing.label) && !treeItemThing.label?.label) {
      console.log("INVALID tree item, invalid label", treeItemThing.label);
      return false;
    }
    if (treeItemThing.id !== void 0 && !isString(treeItemThing.id)) {
      console.log("INVALID tree item, invalid id", treeItemThing.id);
      return false;
    }
    if (treeItemThing.iconPath !== void 0 && !isString(treeItemThing.iconPath) && !URI.isUri(treeItemThing.iconPath) && (!treeItemThing.iconPath || !isString(treeItemThing.iconPath.id))) {
      const asLightAndDarkThing = treeItemThing.iconPath;
      if (!asLightAndDarkThing || !isString(asLightAndDarkThing.light) && !URI.isUri(asLightAndDarkThing.light) && !isString(asLightAndDarkThing.dark) && !URI.isUri(asLightAndDarkThing.dark)) {
        console.log("INVALID tree item, invalid iconPath", treeItemThing.iconPath);
        return false;
      }
    }
    if (treeItemThing.description !== void 0 && !isString(treeItemThing.description) && typeof treeItemThing.description !== "boolean") {
      console.log("INVALID tree item, invalid description", treeItemThing.description);
      return false;
    }
    if (treeItemThing.resourceUri !== void 0 && !URI.isUri(treeItemThing.resourceUri)) {
      console.log("INVALID tree item, invalid resourceUri", treeItemThing.resourceUri);
      return false;
    }
    if (treeItemThing.tooltip !== void 0 && !isString(treeItemThing.tooltip) && !(treeItemThing.tooltip instanceof MarkdownString)) {
      console.log("INVALID tree item, invalid tooltip", treeItemThing.tooltip);
      return false;
    }
    if (treeItemThing.command !== void 0 && !treeItemThing.command.command) {
      console.log("INVALID tree item, invalid command", treeItemThing.command);
      return false;
    }
    if (treeItemThing.collapsibleState !== void 0 && treeItemThing.collapsibleState < 0 /* None */ && treeItemThing.collapsibleState > 2 /* Expanded */) {
      console.log("INVALID tree item, invalid collapsibleState", treeItemThing.collapsibleState);
      return false;
    }
    if (treeItemThing.contextValue !== void 0 && !isString(treeItemThing.contextValue)) {
      console.log("INVALID tree item, invalid contextValue", treeItemThing.contextValue);
      return false;
    }
    if (treeItemThing.accessibilityInformation !== void 0 && !treeItemThing.accessibilityInformation?.label) {
      console.log("INVALID tree item, invalid accessibilityInformation", treeItemThing.accessibilityInformation);
      return false;
    }
    return true;
  }
};
TreeItem = __decorateClass([
  es5ClassCompat
], TreeItem);
var TreeItemCollapsibleState = /* @__PURE__ */ ((TreeItemCollapsibleState2) => {
  TreeItemCollapsibleState2[TreeItemCollapsibleState2["None"] = 0] = "None";
  TreeItemCollapsibleState2[TreeItemCollapsibleState2["Collapsed"] = 1] = "Collapsed";
  TreeItemCollapsibleState2[TreeItemCollapsibleState2["Expanded"] = 2] = "Expanded";
  return TreeItemCollapsibleState2;
})(TreeItemCollapsibleState || {});
var TreeItemCheckboxState = /* @__PURE__ */ ((TreeItemCheckboxState2) => {
  TreeItemCheckboxState2[TreeItemCheckboxState2["Unchecked"] = 0] = "Unchecked";
  TreeItemCheckboxState2[TreeItemCheckboxState2["Checked"] = 1] = "Checked";
  return TreeItemCheckboxState2;
})(TreeItemCheckboxState || {});
let DataTransferItem = class {
  constructor(value) {
    this.value = value;
  }
  async asString() {
    return typeof this.value === "string" ? this.value : JSON.stringify(this.value);
  }
  asFile() {
    return void 0;
  }
};
DataTransferItem = __decorateClass([
  es5ClassCompat
], DataTransferItem);
class InternalDataTransferItem extends DataTransferItem {
}
class InternalFileDataTransferItem extends InternalDataTransferItem {
  #file;
  constructor(file) {
    super("");
    this.#file = file;
  }
  asFile() {
    return this.#file;
  }
}
class DataTransferFile {
  constructor(name, uri, itemId, getData) {
    this.name = name;
    this.uri = uri;
    this._itemId = itemId;
    this._getData = getData;
  }
  data() {
    return this._getData();
  }
}
let DataTransfer = class {
  constructor(init) {
    __privateAdd(this, _DataTransfer_instances);
    __privateAdd(this, _items, /* @__PURE__ */ new Map());
    for (const [mime, item] of init ?? []) {
      const existing = __privateGet(this, _items).get(__privateMethod(this, _DataTransfer_instances, normalizeMime_fn).call(this, mime));
      if (existing) {
        existing.push(item);
      } else {
        __privateGet(this, _items).set(__privateMethod(this, _DataTransfer_instances, normalizeMime_fn).call(this, mime), [item]);
      }
    }
  }
  get(mimeType) {
    return __privateGet(this, _items).get(__privateMethod(this, _DataTransfer_instances, normalizeMime_fn).call(this, mimeType))?.[0];
  }
  set(mimeType, value) {
    __privateGet(this, _items).set(__privateMethod(this, _DataTransfer_instances, normalizeMime_fn).call(this, mimeType), [value]);
  }
  forEach(callbackfn, thisArg) {
    for (const [mime, items] of __privateGet(this, _items)) {
      for (const item of items) {
        callbackfn.call(thisArg, item, mime, this);
      }
    }
  }
  *[Symbol.iterator]() {
    for (const [mime, items] of __privateGet(this, _items)) {
      for (const item of items) {
        yield [mime, item];
      }
    }
  }
};
_items = new WeakMap();
_DataTransfer_instances = new WeakSet();
normalizeMime_fn = function(mimeType) {
  return mimeType.toLowerCase();
};
DataTransfer = __decorateClass([
  es5ClassCompat
], DataTransfer);
let DocumentDropEdit = class {
  constructor(insertText, title, kind) {
    this.insertText = insertText;
    this.title = title;
    this.kind = kind;
  }
};
DocumentDropEdit = __decorateClass([
  es5ClassCompat
], DocumentDropEdit);
var DocumentPasteTriggerKind = /* @__PURE__ */ ((DocumentPasteTriggerKind2) => {
  DocumentPasteTriggerKind2[DocumentPasteTriggerKind2["Automatic"] = 0] = "Automatic";
  DocumentPasteTriggerKind2[DocumentPasteTriggerKind2["PasteAs"] = 1] = "PasteAs";
  return DocumentPasteTriggerKind2;
})(DocumentPasteTriggerKind || {});
const _DocumentDropOrPasteEditKind = class _DocumentDropOrPasteEditKind {
  constructor(value) {
    this.value = value;
  }
  append(...parts) {
    return new _DocumentDropOrPasteEditKind((this.value ? [this.value, ...parts] : parts).join(_DocumentDropOrPasteEditKind.sep));
  }
  intersects(other) {
    return this.contains(other) || other.contains(this);
  }
  contains(other) {
    return this.value === other.value || other.value.startsWith(this.value + _DocumentDropOrPasteEditKind.sep);
  }
};
_DocumentDropOrPasteEditKind.sep = ".";
let DocumentDropOrPasteEditKind = _DocumentDropOrPasteEditKind;
DocumentDropOrPasteEditKind.Empty = new DocumentDropOrPasteEditKind("");
DocumentDropOrPasteEditKind.Text = new DocumentDropOrPasteEditKind("text");
DocumentDropOrPasteEditKind.TextUpdateImports = DocumentDropOrPasteEditKind.Text.append("updateImports");
class DocumentPasteEdit {
  constructor(insertText, title, kind) {
    this.title = title;
    this.insertText = insertText;
    this.kind = kind;
  }
}
let ThemeIcon = class {
  constructor(id, color) {
    this.id = id;
    this.color = color;
  }
  static isThemeIcon(thing) {
    if (typeof thing.id !== "string") {
      console.log("INVALID ThemeIcon, invalid id", thing.id);
      return false;
    }
    return true;
  }
};
ThemeIcon = __decorateClass([
  es5ClassCompat
], ThemeIcon);
ThemeIcon.File = new ThemeIcon("file");
ThemeIcon.Folder = new ThemeIcon("folder");
let ThemeColor = class {
  constructor(id) {
    this.id = id;
  }
};
ThemeColor = __decorateClass([
  es5ClassCompat
], ThemeColor);
var ConfigurationTarget = /* @__PURE__ */ ((ConfigurationTarget2) => {
  ConfigurationTarget2[ConfigurationTarget2["Global"] = 1] = "Global";
  ConfigurationTarget2[ConfigurationTarget2["Workspace"] = 2] = "Workspace";
  ConfigurationTarget2[ConfigurationTarget2["WorkspaceFolder"] = 3] = "WorkspaceFolder";
  return ConfigurationTarget2;
})(ConfigurationTarget || {});
let RelativePattern = class {
  get base() {
    return this._base;
  }
  set base(base) {
    this._base = base;
    this._baseUri = URI.file(base);
  }
  get baseUri() {
    return this._baseUri;
  }
  set baseUri(baseUri) {
    this._baseUri = baseUri;
    this._base = baseUri.fsPath;
  }
  constructor(base, pattern) {
    if (typeof base !== "string") {
      if (!base || !URI.isUri(base) && !URI.isUri(base.uri)) {
        throw illegalArgument("base");
      }
    }
    if (typeof pattern !== "string") {
      throw illegalArgument("pattern");
    }
    if (typeof base === "string") {
      this.baseUri = URI.file(base);
    } else if (URI.isUri(base)) {
      this.baseUri = base;
    } else {
      this.baseUri = base.uri;
    }
    this.pattern = pattern;
  }
  toJSON() {
    return {
      pattern: this.pattern,
      base: this.base,
      baseUri: this.baseUri.toJSON()
    };
  }
};
RelativePattern = __decorateClass([
  es5ClassCompat
], RelativePattern);
const breakpointIds = /* @__PURE__ */ new WeakMap();
function setBreakpointId(bp, id) {
  breakpointIds.set(bp, id);
}
let Breakpoint = class {
  constructor(enabled, condition, hitCondition, logMessage, mode) {
    this.enabled = typeof enabled === "boolean" ? enabled : true;
    if (typeof condition === "string") {
      this.condition = condition;
    }
    if (typeof hitCondition === "string") {
      this.hitCondition = hitCondition;
    }
    if (typeof logMessage === "string") {
      this.logMessage = logMessage;
    }
    if (typeof mode === "string") {
      this.mode = mode;
    }
  }
  get id() {
    if (!this._id) {
      this._id = breakpointIds.get(this) ?? generateUuid();
    }
    return this._id;
  }
};
Breakpoint = __decorateClass([
  es5ClassCompat
], Breakpoint);
let SourceBreakpoint = class extends Breakpoint {
  constructor(location, enabled, condition, hitCondition, logMessage, mode) {
    super(enabled, condition, hitCondition, logMessage, mode);
    if (location === null) {
      throw illegalArgument("location");
    }
    this.location = location;
  }
};
SourceBreakpoint = __decorateClass([
  es5ClassCompat
], SourceBreakpoint);
let FunctionBreakpoint = class extends Breakpoint {
  constructor(functionName, enabled, condition, hitCondition, logMessage, mode) {
    super(enabled, condition, hitCondition, logMessage, mode);
    this.functionName = functionName;
  }
};
FunctionBreakpoint = __decorateClass([
  es5ClassCompat
], FunctionBreakpoint);
let DataBreakpoint = class extends Breakpoint {
  constructor(label, dataId, canPersist, enabled, condition, hitCondition, logMessage, mode) {
    super(enabled, condition, hitCondition, logMessage, mode);
    if (!dataId) {
      throw illegalArgument("dataId");
    }
    this.label = label;
    this.dataId = dataId;
    this.canPersist = canPersist;
  }
};
DataBreakpoint = __decorateClass([
  es5ClassCompat
], DataBreakpoint);
let DebugAdapterExecutable = class {
  constructor(command, args, options) {
    this.command = command;
    this.args = args || [];
    this.options = options;
  }
};
DebugAdapterExecutable = __decorateClass([
  es5ClassCompat
], DebugAdapterExecutable);
let DebugAdapterServer = class {
  constructor(port, host) {
    this.port = port;
    this.host = host;
  }
};
DebugAdapterServer = __decorateClass([
  es5ClassCompat
], DebugAdapterServer);
let DebugAdapterNamedPipeServer = class {
  constructor(path) {
    this.path = path;
  }
};
DebugAdapterNamedPipeServer = __decorateClass([
  es5ClassCompat
], DebugAdapterNamedPipeServer);
let DebugAdapterInlineImplementation = class {
  constructor(impl) {
    this.implementation = impl;
  }
};
DebugAdapterInlineImplementation = __decorateClass([
  es5ClassCompat
], DebugAdapterInlineImplementation);
class DebugStackFrame {
  constructor(session, threadId, frameId) {
    this.session = session;
    this.threadId = threadId;
    this.frameId = frameId;
  }
}
class DebugThread {
  constructor(session, threadId) {
    this.session = session;
    this.threadId = threadId;
  }
}
let EvaluatableExpression = class {
  constructor(range, expression) {
    this.range = range;
    this.expression = expression;
  }
};
EvaluatableExpression = __decorateClass([
  es5ClassCompat
], EvaluatableExpression);
var InlineCompletionTriggerKind = /* @__PURE__ */ ((InlineCompletionTriggerKind2) => {
  InlineCompletionTriggerKind2[InlineCompletionTriggerKind2["Invoke"] = 0] = "Invoke";
  InlineCompletionTriggerKind2[InlineCompletionTriggerKind2["Automatic"] = 1] = "Automatic";
  return InlineCompletionTriggerKind2;
})(InlineCompletionTriggerKind || {});
var InlineCompletionsDisposeReasonKind = /* @__PURE__ */ ((InlineCompletionsDisposeReasonKind2) => {
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["Other"] = 0] = "Other";
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["Empty"] = 1] = "Empty";
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["TokenCancellation"] = 2] = "TokenCancellation";
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["LostRace"] = 3] = "LostRace";
  InlineCompletionsDisposeReasonKind2[InlineCompletionsDisposeReasonKind2["NotTaken"] = 4] = "NotTaken";
  return InlineCompletionsDisposeReasonKind2;
})(InlineCompletionsDisposeReasonKind || {});
let InlineValueText = class {
  constructor(range, text) {
    this.range = range;
    this.text = text;
  }
};
InlineValueText = __decorateClass([
  es5ClassCompat
], InlineValueText);
let InlineValueVariableLookup = class {
  constructor(range, variableName, caseSensitiveLookup = true) {
    this.range = range;
    this.variableName = variableName;
    this.caseSensitiveLookup = caseSensitiveLookup;
  }
};
InlineValueVariableLookup = __decorateClass([
  es5ClassCompat
], InlineValueVariableLookup);
let InlineValueEvaluatableExpression = class {
  constructor(range, expression) {
    this.range = range;
    this.expression = expression;
  }
};
InlineValueEvaluatableExpression = __decorateClass([
  es5ClassCompat
], InlineValueEvaluatableExpression);
let InlineValueContext = class {
  constructor(frameId, range) {
    this.frameId = frameId;
    this.stoppedLocation = range;
  }
};
InlineValueContext = __decorateClass([
  es5ClassCompat
], InlineValueContext);
var NewSymbolNameTag = /* @__PURE__ */ ((NewSymbolNameTag2) => {
  NewSymbolNameTag2[NewSymbolNameTag2["AIGenerated"] = 1] = "AIGenerated";
  return NewSymbolNameTag2;
})(NewSymbolNameTag || {});
var NewSymbolNameTriggerKind = /* @__PURE__ */ ((NewSymbolNameTriggerKind2) => {
  NewSymbolNameTriggerKind2[NewSymbolNameTriggerKind2["Invoke"] = 0] = "Invoke";
  NewSymbolNameTriggerKind2[NewSymbolNameTriggerKind2["Automatic"] = 1] = "Automatic";
  return NewSymbolNameTriggerKind2;
})(NewSymbolNameTriggerKind || {});
class NewSymbolName {
  constructor(newSymbolName, tags) {
    this.newSymbolName = newSymbolName;
    this.tags = tags;
  }
}
var FileChangeType = /* @__PURE__ */ ((FileChangeType2) => {
  FileChangeType2[FileChangeType2["Changed"] = 1] = "Changed";
  FileChangeType2[FileChangeType2["Created"] = 2] = "Created";
  FileChangeType2[FileChangeType2["Deleted"] = 3] = "Deleted";
  return FileChangeType2;
})(FileChangeType || {});
let FileSystemError = class extends Error {
  static FileExists(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileExists, FileSystemError.FileExists);
  }
  static FileNotFound(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotFound, FileSystemError.FileNotFound);
  }
  static FileNotADirectory(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileNotADirectory, FileSystemError.FileNotADirectory);
  }
  static FileIsADirectory(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.FileIsADirectory, FileSystemError.FileIsADirectory);
  }
  static NoPermissions(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.NoPermissions, FileSystemError.NoPermissions);
  }
  static Unavailable(messageOrUri) {
    return new FileSystemError(messageOrUri, FileSystemProviderErrorCode.Unavailable, FileSystemError.Unavailable);
  }
  constructor(uriOrMessage, code = FileSystemProviderErrorCode.Unknown, terminator) {
    super(URI.isUri(uriOrMessage) ? uriOrMessage.toString(true) : uriOrMessage);
    this.code = terminator?.name ?? "Unknown";
    markAsFileSystemProviderError(this, code);
    Object.setPrototypeOf(this, FileSystemError.prototype);
    if (typeof Error.captureStackTrace === "function" && typeof terminator === "function") {
      Error.captureStackTrace(this, terminator);
    }
  }
};
FileSystemError = __decorateClass([
  es5ClassCompat
], FileSystemError);
let FoldingRange = class {
  constructor(start, end, kind) {
    this.start = start;
    this.end = end;
    this.kind = kind;
  }
};
FoldingRange = __decorateClass([
  es5ClassCompat
], FoldingRange);
var FoldingRangeKind = /* @__PURE__ */ ((FoldingRangeKind2) => {
  FoldingRangeKind2[FoldingRangeKind2["Comment"] = 1] = "Comment";
  FoldingRangeKind2[FoldingRangeKind2["Imports"] = 2] = "Imports";
  FoldingRangeKind2[FoldingRangeKind2["Region"] = 3] = "Region";
  return FoldingRangeKind2;
})(FoldingRangeKind || {});
var CommentThreadCollapsibleState = /* @__PURE__ */ ((CommentThreadCollapsibleState2) => {
  CommentThreadCollapsibleState2[CommentThreadCollapsibleState2["Collapsed"] = 0] = "Collapsed";
  CommentThreadCollapsibleState2[CommentThreadCollapsibleState2["Expanded"] = 1] = "Expanded";
  return CommentThreadCollapsibleState2;
})(CommentThreadCollapsibleState || {});
var CommentMode = /* @__PURE__ */ ((CommentMode2) => {
  CommentMode2[CommentMode2["Editing"] = 0] = "Editing";
  CommentMode2[CommentMode2["Preview"] = 1] = "Preview";
  return CommentMode2;
})(CommentMode || {});
var CommentState = /* @__PURE__ */ ((CommentState2) => {
  CommentState2[CommentState2["Published"] = 0] = "Published";
  CommentState2[CommentState2["Draft"] = 1] = "Draft";
  return CommentState2;
})(CommentState || {});
var CommentThreadState = /* @__PURE__ */ ((CommentThreadState2) => {
  CommentThreadState2[CommentThreadState2["Unresolved"] = 0] = "Unresolved";
  CommentThreadState2[CommentThreadState2["Resolved"] = 1] = "Resolved";
  return CommentThreadState2;
})(CommentThreadState || {});
var CommentThreadApplicability = /* @__PURE__ */ ((CommentThreadApplicability2) => {
  CommentThreadApplicability2[CommentThreadApplicability2["Current"] = 0] = "Current";
  CommentThreadApplicability2[CommentThreadApplicability2["Outdated"] = 1] = "Outdated";
  return CommentThreadApplicability2;
})(CommentThreadApplicability || {});
var CommentThreadFocus = /* @__PURE__ */ ((CommentThreadFocus2) => {
  CommentThreadFocus2[CommentThreadFocus2["Reply"] = 1] = "Reply";
  CommentThreadFocus2[CommentThreadFocus2["Comment"] = 2] = "Comment";
  return CommentThreadFocus2;
})(CommentThreadFocus || {});
class SemanticTokensLegend {
  constructor(tokenTypes, tokenModifiers = []) {
    this.tokenTypes = tokenTypes;
    this.tokenModifiers = tokenModifiers;
  }
}
function isStrArrayOrUndefined(arg) {
  return typeof arg === "undefined" || isStringArray(arg);
}
class SemanticTokensBuilder {
  constructor(legend) {
    this._prevLine = 0;
    this._prevChar = 0;
    this._dataIsSortedAndDeltaEncoded = true;
    this._data = [];
    this._dataLen = 0;
    this._tokenTypeStrToInt = /* @__PURE__ */ new Map();
    this._tokenModifierStrToInt = /* @__PURE__ */ new Map();
    this._hasLegend = false;
    if (legend) {
      this._hasLegend = true;
      for (let i = 0, len = legend.tokenTypes.length; i < len; i++) {
        this._tokenTypeStrToInt.set(legend.tokenTypes[i], i);
      }
      for (let i = 0, len = legend.tokenModifiers.length; i < len; i++) {
        this._tokenModifierStrToInt.set(legend.tokenModifiers[i], i);
      }
    }
  }
  push(arg0, arg1, arg2, arg3, arg4) {
    if (typeof arg0 === "number" && typeof arg1 === "number" && typeof arg2 === "number" && typeof arg3 === "number" && (typeof arg4 === "number" || typeof arg4 === "undefined")) {
      if (typeof arg4 === "undefined") {
        arg4 = 0;
      }
      return this._pushEncoded(arg0, arg1, arg2, arg3, arg4);
    }
    if (Range.isRange(arg0) && typeof arg1 === "string" && isStrArrayOrUndefined(arg2)) {
      return this._push(arg0, arg1, arg2);
    }
    throw illegalArgument();
  }
  _push(range, tokenType, tokenModifiers) {
    if (!this._hasLegend) {
      throw new Error("Legend must be provided in constructor");
    }
    if (range.start.line !== range.end.line) {
      throw new Error("`range` cannot span multiple lines");
    }
    if (!this._tokenTypeStrToInt.has(tokenType)) {
      throw new Error("`tokenType` is not in the provided legend");
    }
    const line = range.start.line;
    const char = range.start.character;
    const length = range.end.character - range.start.character;
    const nTokenType = this._tokenTypeStrToInt.get(tokenType);
    let nTokenModifiers = 0;
    if (tokenModifiers) {
      for (const tokenModifier of tokenModifiers) {
        if (!this._tokenModifierStrToInt.has(tokenModifier)) {
          throw new Error("`tokenModifier` is not in the provided legend");
        }
        const nTokenModifier = this._tokenModifierStrToInt.get(tokenModifier);
        nTokenModifiers |= 1 << nTokenModifier >>> 0;
      }
    }
    this._pushEncoded(line, char, length, nTokenType, nTokenModifiers);
  }
  _pushEncoded(line, char, length, tokenType, tokenModifiers) {
    if (this._dataIsSortedAndDeltaEncoded && (line < this._prevLine || line === this._prevLine && char < this._prevChar)) {
      this._dataIsSortedAndDeltaEncoded = false;
      const tokenCount = this._data.length / 5 | 0;
      let prevLine = 0;
      let prevChar = 0;
      for (let i = 0; i < tokenCount; i++) {
        let line2 = this._data[5 * i];
        let char2 = this._data[5 * i + 1];
        if (line2 === 0) {
          line2 = prevLine;
          char2 += prevChar;
        } else {
          line2 += prevLine;
        }
        this._data[5 * i] = line2;
        this._data[5 * i + 1] = char2;
        prevLine = line2;
        prevChar = char2;
      }
    }
    let pushLine = line;
    let pushChar = char;
    if (this._dataIsSortedAndDeltaEncoded && this._dataLen > 0) {
      pushLine -= this._prevLine;
      if (pushLine === 0) {
        pushChar -= this._prevChar;
      }
    }
    this._data[this._dataLen++] = pushLine;
    this._data[this._dataLen++] = pushChar;
    this._data[this._dataLen++] = length;
    this._data[this._dataLen++] = tokenType;
    this._data[this._dataLen++] = tokenModifiers;
    this._prevLine = line;
    this._prevChar = char;
  }
  static _sortAndDeltaEncode(data) {
    const pos = [];
    const tokenCount = data.length / 5 | 0;
    for (let i = 0; i < tokenCount; i++) {
      pos[i] = i;
    }
    pos.sort((a, b) => {
      const aLine = data[5 * a];
      const bLine = data[5 * b];
      if (aLine === bLine) {
        const aChar = data[5 * a + 1];
        const bChar = data[5 * b + 1];
        return aChar - bChar;
      }
      return aLine - bLine;
    });
    const result = new Uint32Array(data.length);
    let prevLine = 0;
    let prevChar = 0;
    for (let i = 0; i < tokenCount; i++) {
      const srcOffset = 5 * pos[i];
      const line = data[srcOffset + 0];
      const char = data[srcOffset + 1];
      const length = data[srcOffset + 2];
      const tokenType = data[srcOffset + 3];
      const tokenModifiers = data[srcOffset + 4];
      const pushLine = line - prevLine;
      const pushChar = pushLine === 0 ? char - prevChar : char;
      const dstOffset = 5 * i;
      result[dstOffset + 0] = pushLine;
      result[dstOffset + 1] = pushChar;
      result[dstOffset + 2] = length;
      result[dstOffset + 3] = tokenType;
      result[dstOffset + 4] = tokenModifiers;
      prevLine = line;
      prevChar = char;
    }
    return result;
  }
  build(resultId) {
    if (!this._dataIsSortedAndDeltaEncoded) {
      return new SemanticTokens(SemanticTokensBuilder._sortAndDeltaEncode(this._data), resultId);
    }
    return new SemanticTokens(new Uint32Array(this._data), resultId);
  }
}
class SemanticTokens {
  constructor(data, resultId) {
    this.resultId = resultId;
    this.data = data;
  }
}
class SemanticTokensEdit {
  constructor(start, deleteCount, data) {
    this.start = start;
    this.deleteCount = deleteCount;
    this.data = data;
  }
}
class SemanticTokensEdits {
  constructor(edits, resultId) {
    this.resultId = resultId;
    this.edits = edits;
  }
}
var DebugConsoleMode = /* @__PURE__ */ ((DebugConsoleMode2) => {
  DebugConsoleMode2[DebugConsoleMode2["Separate"] = 0] = "Separate";
  DebugConsoleMode2[DebugConsoleMode2["MergeWithParent"] = 1] = "MergeWithParent";
  return DebugConsoleMode2;
})(DebugConsoleMode || {});
class DebugVisualization {
  constructor(name) {
    this.name = name;
  }
}
var QuickInputButtonLocation = /* @__PURE__ */ ((QuickInputButtonLocation2) => {
  QuickInputButtonLocation2[QuickInputButtonLocation2["Title"] = 1] = "Title";
  QuickInputButtonLocation2[QuickInputButtonLocation2["Inline"] = 2] = "Inline";
  QuickInputButtonLocation2[QuickInputButtonLocation2["Input"] = 3] = "Input";
  return QuickInputButtonLocation2;
})(QuickInputButtonLocation || {});
let QuickInputButtons = class {
  constructor() {
  }
};
QuickInputButtons.Back = { iconPath: new ThemeIcon("arrow-left") };
QuickInputButtons = __decorateClass([
  es5ClassCompat
], QuickInputButtons);
var QuickPickItemKind = /* @__PURE__ */ ((QuickPickItemKind2) => {
  QuickPickItemKind2[QuickPickItemKind2["Separator"] = -1] = "Separator";
  QuickPickItemKind2[QuickPickItemKind2["Default"] = 0] = "Default";
  return QuickPickItemKind2;
})(QuickPickItemKind || {});
var InputBoxValidationSeverity = /* @__PURE__ */ ((InputBoxValidationSeverity2) => {
  InputBoxValidationSeverity2[InputBoxValidationSeverity2["Info"] = 1] = "Info";
  InputBoxValidationSeverity2[InputBoxValidationSeverity2["Warning"] = 2] = "Warning";
  InputBoxValidationSeverity2[InputBoxValidationSeverity2["Error"] = 3] = "Error";
  return InputBoxValidationSeverity2;
})(InputBoxValidationSeverity || {});
var ExtensionKind = /* @__PURE__ */ ((ExtensionKind2) => {
  ExtensionKind2[ExtensionKind2["UI"] = 1] = "UI";
  ExtensionKind2[ExtensionKind2["Workspace"] = 2] = "Workspace";
  return ExtensionKind2;
})(ExtensionKind || {});
class FileDecoration {
  static validate(d) {
    if (typeof d.badge === "string") {
      let len = nextCharLength(d.badge, 0);
      if (len < d.badge.length) {
        len += nextCharLength(d.badge, len);
      }
      if (d.badge.length > len) {
        throw new Error(`The 'badge'-property must be undefined or a short character`);
      }
    } else if (d.badge) {
      if (!ThemeIcon.isThemeIcon(d.badge)) {
        throw new Error(`The 'badge'-property is not a valid ThemeIcon`);
      }
    }
    if (!d.color && !d.badge && !d.tooltip) {
      throw new Error(`The decoration is empty`);
    }
    return true;
  }
  constructor(badge, tooltip, color) {
    this.badge = badge;
    this.tooltip = tooltip;
    this.color = color;
  }
}
let ColorTheme = class {
  constructor(kind) {
    this.kind = kind;
  }
};
ColorTheme = __decorateClass([
  es5ClassCompat
], ColorTheme);
var ColorThemeKind = /* @__PURE__ */ ((ColorThemeKind2) => {
  ColorThemeKind2[ColorThemeKind2["Light"] = 1] = "Light";
  ColorThemeKind2[ColorThemeKind2["Dark"] = 2] = "Dark";
  ColorThemeKind2[ColorThemeKind2["HighContrast"] = 3] = "HighContrast";
  ColorThemeKind2[ColorThemeKind2["HighContrastLight"] = 4] = "HighContrastLight";
  return ColorThemeKind2;
})(ColorThemeKind || {});
class CellErrorStackFrame {
  /**
   * @param label The name of the stack frame
   * @param file The file URI of the stack frame
   * @param position The position of the stack frame within the file
   */
  constructor(label, uri, position) {
    this.label = label;
    this.uri = uri;
    this.position = position;
  }
}
var NotebookCellExecutionState = /* @__PURE__ */ ((NotebookCellExecutionState2) => {
  NotebookCellExecutionState2[NotebookCellExecutionState2["Idle"] = 1] = "Idle";
  NotebookCellExecutionState2[NotebookCellExecutionState2["Pending"] = 2] = "Pending";
  NotebookCellExecutionState2[NotebookCellExecutionState2["Executing"] = 3] = "Executing";
  return NotebookCellExecutionState2;
})(NotebookCellExecutionState || {});
var NotebookCellStatusBarAlignment = /* @__PURE__ */ ((NotebookCellStatusBarAlignment2) => {
  NotebookCellStatusBarAlignment2[NotebookCellStatusBarAlignment2["Left"] = 1] = "Left";
  NotebookCellStatusBarAlignment2[NotebookCellStatusBarAlignment2["Right"] = 2] = "Right";
  return NotebookCellStatusBarAlignment2;
})(NotebookCellStatusBarAlignment || {});
var NotebookEditorRevealType = /* @__PURE__ */ ((NotebookEditorRevealType2) => {
  NotebookEditorRevealType2[NotebookEditorRevealType2["Default"] = 0] = "Default";
  NotebookEditorRevealType2[NotebookEditorRevealType2["InCenter"] = 1] = "InCenter";
  NotebookEditorRevealType2[NotebookEditorRevealType2["InCenterIfOutsideViewport"] = 2] = "InCenterIfOutsideViewport";
  NotebookEditorRevealType2[NotebookEditorRevealType2["AtTop"] = 3] = "AtTop";
  return NotebookEditorRevealType2;
})(NotebookEditorRevealType || {});
class NotebookCellStatusBarItem {
  constructor(text, alignment) {
    this.text = text;
    this.alignment = alignment;
  }
}
var NotebookControllerAffinity = /* @__PURE__ */ ((NotebookControllerAffinity3) => {
  NotebookControllerAffinity3[NotebookControllerAffinity3["Default"] = 1] = "Default";
  NotebookControllerAffinity3[NotebookControllerAffinity3["Preferred"] = 2] = "Preferred";
  return NotebookControllerAffinity3;
})(NotebookControllerAffinity || {});
var NotebookControllerAffinity2 = /* @__PURE__ */ ((NotebookControllerAffinity22) => {
  NotebookControllerAffinity22[NotebookControllerAffinity22["Default"] = 1] = "Default";
  NotebookControllerAffinity22[NotebookControllerAffinity22["Preferred"] = 2] = "Preferred";
  NotebookControllerAffinity22[NotebookControllerAffinity22["Hidden"] = -1] = "Hidden";
  return NotebookControllerAffinity22;
})(NotebookControllerAffinity2 || {});
class NotebookRendererScript {
  constructor(uri, provides = []) {
    this.uri = uri;
    this.provides = asArray(provides);
  }
}
class NotebookKernelSourceAction {
  constructor(label) {
    this.label = label;
  }
}
var NotebookVariablesRequestKind = /* @__PURE__ */ ((NotebookVariablesRequestKind2) => {
  NotebookVariablesRequestKind2[NotebookVariablesRequestKind2["Named"] = 1] = "Named";
  NotebookVariablesRequestKind2[NotebookVariablesRequestKind2["Indexed"] = 2] = "Indexed";
  return NotebookVariablesRequestKind2;
})(NotebookVariablesRequestKind || {});
let TimelineItem = class {
  constructor(label, timestamp) {
    this.label = label;
    this.timestamp = timestamp;
  }
};
TimelineItem = __decorateClass([
  es5ClassCompat
], TimelineItem);
var ExtensionMode = /* @__PURE__ */ ((ExtensionMode2) => {
  ExtensionMode2[ExtensionMode2["Production"] = 1] = "Production";
  ExtensionMode2[ExtensionMode2["Development"] = 2] = "Development";
  ExtensionMode2[ExtensionMode2["Test"] = 3] = "Test";
  return ExtensionMode2;
})(ExtensionMode || {});
var ExtensionRuntime = /* @__PURE__ */ ((ExtensionRuntime2) => {
  ExtensionRuntime2[ExtensionRuntime2["Node"] = 1] = "Node";
  ExtensionRuntime2[ExtensionRuntime2["Webworker"] = 2] = "Webworker";
  return ExtensionRuntime2;
})(ExtensionRuntime || {});
var StandardTokenType = /* @__PURE__ */ ((StandardTokenType2) => {
  StandardTokenType2[StandardTokenType2["Other"] = 0] = "Other";
  StandardTokenType2[StandardTokenType2["Comment"] = 1] = "Comment";
  StandardTokenType2[StandardTokenType2["String"] = 2] = "String";
  StandardTokenType2[StandardTokenType2["RegEx"] = 3] = "RegEx";
  return StandardTokenType2;
})(StandardTokenType || {});
var SyntaxHighlightingTokenFontStyle = /* @__PURE__ */ ((SyntaxHighlightingTokenFontStyle2) => {
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["None"] = 0] = "None";
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["Italic"] = 1] = "Italic";
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["Bold"] = 2] = "Bold";
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["Underline"] = 4] = "Underline";
  SyntaxHighlightingTokenFontStyle2[SyntaxHighlightingTokenFontStyle2["Strikethrough"] = 8] = "Strikethrough";
  return SyntaxHighlightingTokenFontStyle2;
})(SyntaxHighlightingTokenFontStyle || {});
class LinkedEditingRanges {
  constructor(ranges, wordPattern) {
    this.ranges = ranges;
    this.wordPattern = wordPattern;
  }
}
class PortAttributes {
  constructor(autoForwardAction) {
    this._autoForwardAction = autoForwardAction;
  }
  get autoForwardAction() {
    return this._autoForwardAction;
  }
}
var TestResultState = /* @__PURE__ */ ((TestResultState2) => {
  TestResultState2[TestResultState2["Queued"] = 1] = "Queued";
  TestResultState2[TestResultState2["Running"] = 2] = "Running";
  TestResultState2[TestResultState2["Passed"] = 3] = "Passed";
  TestResultState2[TestResultState2["Failed"] = 4] = "Failed";
  TestResultState2[TestResultState2["Skipped"] = 5] = "Skipped";
  TestResultState2[TestResultState2["Errored"] = 6] = "Errored";
  return TestResultState2;
})(TestResultState || {});
var TestRunProfileKind = /* @__PURE__ */ ((TestRunProfileKind2) => {
  TestRunProfileKind2[TestRunProfileKind2["Run"] = 1] = "Run";
  TestRunProfileKind2[TestRunProfileKind2["Debug"] = 2] = "Debug";
  TestRunProfileKind2[TestRunProfileKind2["Coverage"] = 3] = "Coverage";
  return TestRunProfileKind2;
})(TestRunProfileKind || {});
class TestRunProfileBase {
  constructor(controllerId, profileId, kind) {
    this.controllerId = controllerId;
    this.profileId = profileId;
    this.kind = kind;
  }
}
let TestRunRequest = class {
  constructor(include = void 0, exclude = void 0, profile = void 0, continuous = false, preserveFocus = true) {
    this.include = include;
    this.exclude = exclude;
    this.profile = profile;
    this.continuous = continuous;
    this.preserveFocus = preserveFocus;
  }
};
TestRunRequest = __decorateClass([
  es5ClassCompat
], TestRunRequest);
let TestMessage = class {
  constructor(message) {
    this.message = message;
  }
  static diff(message, expected, actual) {
    const msg = new TestMessage(message);
    msg.expectedOutput = expected;
    msg.actualOutput = actual;
    return msg;
  }
};
TestMessage = __decorateClass([
  es5ClassCompat
], TestMessage);
let TestTag = class {
  constructor(id) {
    this.id = id;
  }
};
TestTag = __decorateClass([
  es5ClassCompat
], TestTag);
class TestMessageStackFrame {
  /**
   * @param label The name of the stack frame
   * @param file The file URI of the stack frame
   * @param position The position of the stack frame within the file
   */
  constructor(label, uri, position) {
    this.label = label;
    this.uri = uri;
    this.position = position;
  }
}
class TestCoverageCount {
  constructor(covered, total) {
    this.covered = covered;
    this.total = total;
    validateTestCoverageCount(this);
  }
}
function validateTestCoverageCount(cc) {
  if (!cc) {
    return;
  }
  if (cc.covered > cc.total) {
    throw new Error(`The total number of covered items (${cc.covered}) cannot be greater than the total (${cc.total})`);
  }
  if (cc.total < 0) {
    throw new Error(`The number of covered items (${cc.total}) cannot be negative`);
  }
}
class FileCoverage {
  constructor(uri, statementCoverage, branchCoverage, declarationCoverage, includesTests = []) {
    this.uri = uri;
    this.statementCoverage = statementCoverage;
    this.branchCoverage = branchCoverage;
    this.declarationCoverage = declarationCoverage;
    this.includesTests = includesTests;
  }
  static fromDetails(uri, details) {
    const statements = new TestCoverageCount(0, 0);
    const branches = new TestCoverageCount(0, 0);
    const decl = new TestCoverageCount(0, 0);
    for (const detail of details) {
      if ("branches" in detail) {
        statements.total += 1;
        statements.covered += detail.executed ? 1 : 0;
        for (const branch of detail.branches) {
          branches.total += 1;
          branches.covered += branch.executed ? 1 : 0;
        }
      } else {
        decl.total += 1;
        decl.covered += detail.executed ? 1 : 0;
      }
    }
    const coverage = new FileCoverage(
      uri,
      statements,
      branches.total > 0 ? branches : void 0,
      decl.total > 0 ? decl : void 0
    );
    coverage.detailedCoverage = details;
    return coverage;
  }
}
class StatementCoverage {
  constructor(executed, location, branches = []) {
    this.executed = executed;
    this.location = location;
    this.branches = branches;
  }
  // back compat until finalization:
  get executionCount() {
    return +this.executed;
  }
  set executionCount(n) {
    this.executed = n;
  }
}
class BranchCoverage {
  constructor(executed, location, label) {
    this.executed = executed;
    this.location = location;
    this.label = label;
  }
  // back compat until finalization:
  get executionCount() {
    return +this.executed;
  }
  set executionCount(n) {
    this.executed = n;
  }
}
class DeclarationCoverage {
  constructor(name, executed, location) {
    this.name = name;
    this.executed = executed;
    this.location = location;
  }
  // back compat until finalization:
  get executionCount() {
    return +this.executed;
  }
  set executionCount(n) {
    this.executed = n;
  }
}
var ExternalUriOpenerPriority = /* @__PURE__ */ ((ExternalUriOpenerPriority2) => {
  ExternalUriOpenerPriority2[ExternalUriOpenerPriority2["None"] = 0] = "None";
  ExternalUriOpenerPriority2[ExternalUriOpenerPriority2["Option"] = 1] = "Option";
  ExternalUriOpenerPriority2[ExternalUriOpenerPriority2["Default"] = 2] = "Default";
  ExternalUriOpenerPriority2[ExternalUriOpenerPriority2["Preferred"] = 3] = "Preferred";
  return ExternalUriOpenerPriority2;
})(ExternalUriOpenerPriority || {});
var WorkspaceTrustState = /* @__PURE__ */ ((WorkspaceTrustState2) => {
  WorkspaceTrustState2[WorkspaceTrustState2["Untrusted"] = 0] = "Untrusted";
  WorkspaceTrustState2[WorkspaceTrustState2["Trusted"] = 1] = "Trusted";
  WorkspaceTrustState2[WorkspaceTrustState2["Unspecified"] = 2] = "Unspecified";
  return WorkspaceTrustState2;
})(WorkspaceTrustState || {});
var PortAutoForwardAction = /* @__PURE__ */ ((PortAutoForwardAction2) => {
  PortAutoForwardAction2[PortAutoForwardAction2["Notify"] = 1] = "Notify";
  PortAutoForwardAction2[PortAutoForwardAction2["OpenBrowser"] = 2] = "OpenBrowser";
  PortAutoForwardAction2[PortAutoForwardAction2["OpenPreview"] = 3] = "OpenPreview";
  PortAutoForwardAction2[PortAutoForwardAction2["Silent"] = 4] = "Silent";
  PortAutoForwardAction2[PortAutoForwardAction2["Ignore"] = 5] = "Ignore";
  PortAutoForwardAction2[PortAutoForwardAction2["OpenBrowserOnce"] = 6] = "OpenBrowserOnce";
  return PortAutoForwardAction2;
})(PortAutoForwardAction || {});
class TypeHierarchyItem {
  constructor(kind, name, detail, uri, range, selectionRange) {
    this.kind = kind;
    this.name = name;
    this.detail = detail;
    this.uri = uri;
    this.range = range;
    this.selectionRange = selectionRange;
  }
}
class TextTabInput {
  constructor(uri) {
    this.uri = uri;
  }
}
class TextDiffTabInput {
  constructor(original, modified) {
    this.original = original;
    this.modified = modified;
  }
}
class TextMergeTabInput {
  constructor(base, input1, input2, result) {
    this.base = base;
    this.input1 = input1;
    this.input2 = input2;
    this.result = result;
  }
}
class CustomEditorTabInput {
  constructor(uri, viewType) {
    this.uri = uri;
    this.viewType = viewType;
  }
}
class WebviewEditorTabInput {
  constructor(viewType) {
    this.viewType = viewType;
  }
}
class NotebookEditorTabInput {
  constructor(uri, notebookType) {
    this.uri = uri;
    this.notebookType = notebookType;
  }
}
class NotebookDiffEditorTabInput {
  constructor(original, modified, notebookType) {
    this.original = original;
    this.modified = modified;
    this.notebookType = notebookType;
  }
}
class TerminalEditorTabInput {
  constructor() {
  }
}
class InteractiveWindowInput {
  constructor(uri, inputBoxUri) {
    this.uri = uri;
    this.inputBoxUri = inputBoxUri;
  }
}
class ChatEditorTabInput {
  constructor() {
  }
}
class TextMultiDiffTabInput {
  constructor(textDiffs) {
    this.textDiffs = textDiffs;
  }
}
var InteractiveSessionVoteDirection = /* @__PURE__ */ ((InteractiveSessionVoteDirection2) => {
  InteractiveSessionVoteDirection2[InteractiveSessionVoteDirection2["Down"] = 0] = "Down";
  InteractiveSessionVoteDirection2[InteractiveSessionVoteDirection2["Up"] = 1] = "Up";
  return InteractiveSessionVoteDirection2;
})(InteractiveSessionVoteDirection || {});
var ChatCopyKind = /* @__PURE__ */ ((ChatCopyKind2) => {
  ChatCopyKind2[ChatCopyKind2["Action"] = 1] = "Action";
  ChatCopyKind2[ChatCopyKind2["Toolbar"] = 2] = "Toolbar";
  return ChatCopyKind2;
})(ChatCopyKind || {});
var ChatVariableLevel = /* @__PURE__ */ ((ChatVariableLevel2) => {
  ChatVariableLevel2[ChatVariableLevel2["Short"] = 1] = "Short";
  ChatVariableLevel2[ChatVariableLevel2["Medium"] = 2] = "Medium";
  ChatVariableLevel2[ChatVariableLevel2["Full"] = 3] = "Full";
  return ChatVariableLevel2;
})(ChatVariableLevel || {});
class ChatCompletionItem {
  constructor(id, label, values) {
    this.id = id;
    this.label = label;
    this.values = values;
  }
}
var ChatEditingSessionActionOutcome = /* @__PURE__ */ ((ChatEditingSessionActionOutcome2) => {
  ChatEditingSessionActionOutcome2[ChatEditingSessionActionOutcome2["Accepted"] = 1] = "Accepted";
  ChatEditingSessionActionOutcome2[ChatEditingSessionActionOutcome2["Rejected"] = 2] = "Rejected";
  ChatEditingSessionActionOutcome2[ChatEditingSessionActionOutcome2["Saved"] = 3] = "Saved";
  return ChatEditingSessionActionOutcome2;
})(ChatEditingSessionActionOutcome || {});
var ChatRequestEditedFileEventKind = /* @__PURE__ */ ((ChatRequestEditedFileEventKind2) => {
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["Keep"] = 1] = "Keep";
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["Undo"] = 2] = "Undo";
  ChatRequestEditedFileEventKind2[ChatRequestEditedFileEventKind2["UserModification"] = 3] = "UserModification";
  return ChatRequestEditedFileEventKind2;
})(ChatRequestEditedFileEventKind || {});
var InteractiveEditorResponseFeedbackKind = /* @__PURE__ */ ((InteractiveEditorResponseFeedbackKind2) => {
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Unhelpful"] = 0] = "Unhelpful";
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Helpful"] = 1] = "Helpful";
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Undone"] = 2] = "Undone";
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Accepted"] = 3] = "Accepted";
  InteractiveEditorResponseFeedbackKind2[InteractiveEditorResponseFeedbackKind2["Bug"] = 4] = "Bug";
  return InteractiveEditorResponseFeedbackKind2;
})(InteractiveEditorResponseFeedbackKind || {});
var ChatResultFeedbackKind = /* @__PURE__ */ ((ChatResultFeedbackKind2) => {
  ChatResultFeedbackKind2[ChatResultFeedbackKind2["Unhelpful"] = 0] = "Unhelpful";
  ChatResultFeedbackKind2[ChatResultFeedbackKind2["Helpful"] = 1] = "Helpful";
  return ChatResultFeedbackKind2;
})(ChatResultFeedbackKind || {});
class ChatResponseMarkdownPart {
  constructor(value) {
    if (typeof value !== "string" && value.isTrusted === true) {
      throw new Error("The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.");
    }
    this.value = typeof value === "string" ? new MarkdownString(value) : value;
  }
}
class ChatResponseMarkdownWithVulnerabilitiesPart {
  constructor(value, vulnerabilities) {
    if (typeof value !== "string" && value.isTrusted === true) {
      throw new Error("The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.");
    }
    this.value = typeof value === "string" ? new MarkdownString(value) : value;
    this.vulnerabilities = vulnerabilities;
  }
}
class ChatResponseConfirmationPart {
  constructor(title, message, data, buttons) {
    this.title = title;
    this.message = message;
    this.data = data;
    this.buttons = buttons;
  }
}
class ChatResponseFileTreePart {
  constructor(value, baseUri) {
    this.value = value;
    this.baseUri = baseUri;
  }
}
class ChatResponseMultiDiffPart {
  constructor(value, title, readOnly) {
    this.value = value;
    this.title = title;
    this.readOnly = readOnly;
  }
}
class McpToolInvocationContentData {
  constructor(data, mimeType) {
    this.data = data;
    this.mimeType = mimeType;
  }
}
class ChatSubagentToolInvocationData {
  constructor(description, agentName, prompt, result) {
    this.description = description;
    this.agentName = agentName;
    this.prompt = prompt;
    this.result = result;
  }
}
class ChatResponseExternalEditPart {
  constructor(uris, callback) {
    this.uris = uris;
    this.callback = callback;
    this.applied = new Promise((resolve) => {
      this.didGetApplied = resolve;
    });
  }
}
class ChatResponseAnchorPart {
  constructor(value, title) {
    this.value = value;
    this.value2 = value;
    this.title = title;
  }
}
class ChatResponseProgressPart {
  constructor(value) {
    this.value = value;
  }
}
class ChatResponseProgressPart2 {
  constructor(value, task) {
    this.value = value;
    this.task = task;
  }
}
class ChatResponseThinkingProgressPart {
  constructor(value, id, metadata) {
    this.value = value;
    this.id = id;
    this.metadata = metadata;
  }
}
class ChatResponseHookPart {
  constructor(hookType, stopReason, systemMessage, metadata) {
    this.hookType = hookType;
    this.stopReason = stopReason;
    this.systemMessage = systemMessage;
    this.metadata = metadata;
  }
}
class ChatResponseVoiceProgressPart {
  constructor(id, value) {
    this.id = id;
    this.value = value;
  }
}
class ChatResponseAutoModeResolutionPart {
  constructor(resolvedModel, resolvedModelName, predictedLabel, confidence) {
    this.resolvedModel = resolvedModel;
    this.resolvedModelName = resolvedModelName;
    this.predictedLabel = predictedLabel;
    this.confidence = confidence;
  }
}
class ChatResponseWarningPart {
  constructor(value) {
    if (typeof value !== "string" && value.isTrusted === true) {
      throw new Error("The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.");
    }
    this.value = typeof value === "string" ? new MarkdownString(value) : value;
  }
}
class ChatResponseInfoPart {
  constructor(value) {
    if (typeof value !== "string" && value.isTrusted === true) {
      throw new Error("The boolean form of MarkdownString.isTrusted is NOT supported for chat participants.");
    }
    this.value = typeof value === "string" ? new MarkdownString(value) : value;
  }
}
class ChatResponseCommandButtonPart {
  constructor(value) {
    this.value = value;
  }
}
class ChatResponseReferencePart {
  constructor(value, iconPath, options) {
    this.value = value;
    this.iconPath = iconPath;
    this.options = options;
  }
}
class ChatResponseCodeblockUriPart {
  constructor(value, isEdit, undoStopId) {
    this.value = value;
    this.isEdit = isEdit;
    this.undoStopId = undoStopId;
  }
}
class ChatResponseCodeCitationPart {
  constructor(value, license, snippet) {
    this.value = value;
    this.license = license;
    this.snippet = snippet;
  }
}
class ChatResponseMovePart {
  constructor(uri, range) {
    this.uri = uri;
    this.range = range;
  }
}
class ChatResponseExtensionsPart {
  constructor(extensions) {
    this.extensions = extensions;
  }
}
class ChatResponsePullRequestPart {
  constructor(uriOrCommand, title, description, author, linkTag) {
    this.title = title;
    this.description = description;
    this.author = author;
    this.linkTag = linkTag;
    if (isUriComponents(uriOrCommand)) {
      this.uri = uriOrCommand;
      this.command = {
        title: "Open Pull Request",
        command: "vscode.open",
        arguments: [uriOrCommand]
      };
    } else {
      this.command = uriOrCommand;
    }
  }
  toJSON() {
    return {
      $mid: MarshalledId.ChatResponsePullRequestPart,
      uri: this.uri,
      title: this.title,
      description: this.description,
      author: this.author
    };
  }
}
var ChatQuestionType = /* @__PURE__ */ ((ChatQuestionType2) => {
  ChatQuestionType2[ChatQuestionType2["Text"] = 1] = "Text";
  ChatQuestionType2[ChatQuestionType2["SingleSelect"] = 2] = "SingleSelect";
  ChatQuestionType2[ChatQuestionType2["MultiSelect"] = 3] = "MultiSelect";
  return ChatQuestionType2;
})(ChatQuestionType || {});
class ChatQuestion {
  constructor(id, type, title, options) {
    this.id = id;
    this.type = type;
    this.title = title;
    this.message = options?.message;
    this.options = options?.options;
    this.defaultValue = options?.defaultValue;
    this.allowFreeformInput = options?.allowFreeformInput;
  }
}
class ChatResponseQuestionCarouselPart {
  constructor(questions, allowSkip = true) {
    this.questions = questions;
    this.allowSkip = allowSkip;
  }
}
class ChatResponseTextEditPart {
  constructor(uri, editsOrDone) {
    this.uri = uri;
    if (editsOrDone === true) {
      this.isDone = true;
      this.edits = [];
    } else {
      this.edits = Array.isArray(editsOrDone) ? editsOrDone : [editsOrDone];
    }
  }
}
class ChatResponseNotebookEditPart {
  constructor(uri, editsOrDone) {
    this.uri = uri;
    if (editsOrDone === true) {
      this.isDone = true;
      this.edits = [];
    } else {
      this.edits = Array.isArray(editsOrDone) ? editsOrDone : [editsOrDone];
    }
  }
}
class ChatResponseWorkspaceEditPart {
  constructor(edits) {
    this.edits = edits;
  }
}
var ChatTodoStatus = /* @__PURE__ */ ((ChatTodoStatus2) => {
  ChatTodoStatus2[ChatTodoStatus2["NotStarted"] = 1] = "NotStarted";
  ChatTodoStatus2[ChatTodoStatus2["InProgress"] = 2] = "InProgress";
  ChatTodoStatus2[ChatTodoStatus2["Completed"] = 3] = "Completed";
  return ChatTodoStatus2;
})(ChatTodoStatus || {});
var ChatDebugSubagentStatus = /* @__PURE__ */ ((ChatDebugSubagentStatus2) => {
  ChatDebugSubagentStatus2[ChatDebugSubagentStatus2["Running"] = 0] = "Running";
  ChatDebugSubagentStatus2[ChatDebugSubagentStatus2["Completed"] = 1] = "Completed";
  ChatDebugSubagentStatus2[ChatDebugSubagentStatus2["Failed"] = 2] = "Failed";
  return ChatDebugSubagentStatus2;
})(ChatDebugSubagentStatus || {});
class ChatToolInvocationPart {
  constructor(toolName, toolCallId, errorMessage) {
    this.toolName = toolName;
    this.toolCallId = toolCallId;
    this.errorMessage = errorMessage;
  }
}
class ChatRequestTurn {
  constructor(prompt, command, references, participant, toolReferences, editedFileEvents, id, modelId, modeInstructions2) {
    this.prompt = prompt;
    this.command = command;
    this.references = references;
    this.participant = participant;
    this.toolReferences = toolReferences;
    this.editedFileEvents = editedFileEvents;
    this.id = id;
    this.modelId = modelId;
    this.modeInstructions2 = modeInstructions2;
  }
}
class ChatResponseTurn {
  constructor(response, result, participant, command) {
    this.response = response;
    this.result = result;
    this.participant = participant;
    this.command = command;
  }
}
class ChatResponseTurn2 {
  constructor(response, result, participant, command) {
    this.response = response;
    this.result = result;
    this.participant = participant;
    this.command = command;
  }
}
var ChatLocation = /* @__PURE__ */ ((ChatLocation2) => {
  ChatLocation2[ChatLocation2["Panel"] = 1] = "Panel";
  ChatLocation2[ChatLocation2["Terminal"] = 2] = "Terminal";
  ChatLocation2[ChatLocation2["Notebook"] = 3] = "Notebook";
  ChatLocation2[ChatLocation2["Editor"] = 4] = "Editor";
  return ChatLocation2;
})(ChatLocation || {});
var ChatSessionStatus = /* @__PURE__ */ ((ChatSessionStatus2) => {
  ChatSessionStatus2[ChatSessionStatus2["Failed"] = 0] = "Failed";
  ChatSessionStatus2[ChatSessionStatus2["Completed"] = 1] = "Completed";
  ChatSessionStatus2[ChatSessionStatus2["InProgress"] = 2] = "InProgress";
  ChatSessionStatus2[ChatSessionStatus2["NeedsInput"] = 3] = "NeedsInput";
  return ChatSessionStatus2;
})(ChatSessionStatus || {});
const _ChatSessionCustomizationType = class _ChatSessionCustomizationType {
  constructor(id) {
    this.id = id;
  }
};
_ChatSessionCustomizationType.Agent = new _ChatSessionCustomizationType("agent");
_ChatSessionCustomizationType.Skill = new _ChatSessionCustomizationType("skill");
_ChatSessionCustomizationType.Instructions = new _ChatSessionCustomizationType("instructions");
_ChatSessionCustomizationType.Prompt = new _ChatSessionCustomizationType("prompt");
_ChatSessionCustomizationType.Hook = new _ChatSessionCustomizationType("hook");
_ChatSessionCustomizationType.Plugins = new _ChatSessionCustomizationType("plugins");
let ChatSessionCustomizationType = _ChatSessionCustomizationType;
var ChatDebugLogLevel = /* @__PURE__ */ ((ChatDebugLogLevel2) => {
  ChatDebugLogLevel2[ChatDebugLogLevel2["Trace"] = 0] = "Trace";
  ChatDebugLogLevel2[ChatDebugLogLevel2["Info"] = 1] = "Info";
  ChatDebugLogLevel2[ChatDebugLogLevel2["Warning"] = 2] = "Warning";
  ChatDebugLogLevel2[ChatDebugLogLevel2["Error"] = 3] = "Error";
  return ChatDebugLogLevel2;
})(ChatDebugLogLevel || {});
var ChatDebugToolCallResult = /* @__PURE__ */ ((ChatDebugToolCallResult2) => {
  ChatDebugToolCallResult2[ChatDebugToolCallResult2["Success"] = 0] = "Success";
  ChatDebugToolCallResult2[ChatDebugToolCallResult2["Error"] = 1] = "Error";
  return ChatDebugToolCallResult2;
})(ChatDebugToolCallResult || {});
var ChatDebugHookResult = /* @__PURE__ */ ((ChatDebugHookResult2) => {
  ChatDebugHookResult2[ChatDebugHookResult2["Success"] = 0] = "Success";
  ChatDebugHookResult2[ChatDebugHookResult2["Error"] = 1] = "Error";
  ChatDebugHookResult2[ChatDebugHookResult2["NonBlockingError"] = 2] = "NonBlockingError";
  return ChatDebugHookResult2;
})(ChatDebugHookResult || {});
class ChatDebugToolCallEvent {
  constructor(toolName, created) {
    this._kind = "toolCall";
    this.toolName = toolName;
    this.created = created;
  }
}
class ChatDebugModelTurnEvent {
  constructor(created) {
    this._kind = "modelTurn";
    this.created = created;
  }
}
class ChatDebugGenericEvent {
  constructor(name, level, created) {
    this._kind = "generic";
    this.name = name;
    this.level = level;
    this.created = created;
  }
}
class ChatDebugSubagentInvocationEvent {
  constructor(agentName, created) {
    this._kind = "subagentInvocation";
    this.agentName = agentName;
    this.created = created;
  }
}
class ChatDebugMessageSection {
  constructor(name, content) {
    this.name = name;
    this.content = content;
  }
}
class ChatDebugUserMessageEvent {
  constructor(message, created) {
    this._kind = "userMessage";
    this.message = message;
    this.created = created;
    this.sections = [];
  }
}
class ChatDebugAgentResponseEvent {
  constructor(message, created) {
    this._kind = "agentResponse";
    this.message = message;
    this.created = created;
    this.sections = [];
  }
}
class ChatDebugEventTextContent {
  constructor(value) {
    this._kind = "text";
    this.value = value;
  }
}
var ChatDebugMessageContentType = /* @__PURE__ */ ((ChatDebugMessageContentType2) => {
  ChatDebugMessageContentType2[ChatDebugMessageContentType2["User"] = 0] = "User";
  ChatDebugMessageContentType2[ChatDebugMessageContentType2["Agent"] = 1] = "Agent";
  return ChatDebugMessageContentType2;
})(ChatDebugMessageContentType || {});
class ChatDebugEventMessageContent {
  constructor(type, message, sections) {
    this._kind = "messageContent";
    this.type = type;
    this.message = message;
    this.sections = sections;
  }
}
class ChatDebugEventToolCallContent {
  constructor(toolName) {
    this._kind = "toolCallContent";
    this.toolName = toolName;
  }
}
class ChatDebugEventModelTurnContent {
  constructor(requestName) {
    this._kind = "modelTurnContent";
    this.requestName = requestName;
  }
}
class ChatDebugEventHookContent {
  constructor(hookType) {
    this._kind = "hookContent";
    this.hookType = hookType;
  }
}
class ChatSessionChangedFile {
  constructor(uri, originalUri, modifiedUri, insertions, deletions) {
    this.uri = uri;
    this.originalUri = originalUri;
    this.modifiedUri = modifiedUri;
    this.insertions = insertions;
    this.deletions = deletions;
  }
}
var ChatResponseReferencePartStatusKind = /* @__PURE__ */ ((ChatResponseReferencePartStatusKind2) => {
  ChatResponseReferencePartStatusKind2[ChatResponseReferencePartStatusKind2["Complete"] = 1] = "Complete";
  ChatResponseReferencePartStatusKind2[ChatResponseReferencePartStatusKind2["Partial"] = 2] = "Partial";
  ChatResponseReferencePartStatusKind2[ChatResponseReferencePartStatusKind2["Omitted"] = 3] = "Omitted";
  return ChatResponseReferencePartStatusKind2;
})(ChatResponseReferencePartStatusKind || {});
var ChatResponseClearToPreviousToolInvocationReason = /* @__PURE__ */ ((ChatResponseClearToPreviousToolInvocationReason2) => {
  ChatResponseClearToPreviousToolInvocationReason2[ChatResponseClearToPreviousToolInvocationReason2["NoReason"] = 0] = "NoReason";
  ChatResponseClearToPreviousToolInvocationReason2[ChatResponseClearToPreviousToolInvocationReason2["FilteredContentRetry"] = 1] = "FilteredContentRetry";
  ChatResponseClearToPreviousToolInvocationReason2[ChatResponseClearToPreviousToolInvocationReason2["CopyrightContentRetry"] = 2] = "CopyrightContentRetry";
  return ChatResponseClearToPreviousToolInvocationReason2;
})(ChatResponseClearToPreviousToolInvocationReason || {});
class ChatRequestEditorData {
  constructor(editor, document, selection, wholeRange) {
    this.editor = editor;
    this.document = document;
    this.selection = selection;
    this.wholeRange = wholeRange;
  }
}
class ChatRequestNotebookData {
  constructor(cell) {
    this.cell = cell;
  }
}
class ChatReferenceBinaryData {
  constructor(mimeType, data, reference, isPasted, isURL) {
    this.mimeType = mimeType;
    this.data = data;
    this.reference = reference;
    this.isPasted = isPasted;
    this.isURL = isURL;
  }
}
class ChatReferenceDiagnostic {
  constructor(diagnostics) {
    this.diagnostics = diagnostics;
  }
}
var LanguageModelChatMessageRole = /* @__PURE__ */ ((LanguageModelChatMessageRole2) => {
  LanguageModelChatMessageRole2[LanguageModelChatMessageRole2["User"] = 1] = "User";
  LanguageModelChatMessageRole2[LanguageModelChatMessageRole2["Assistant"] = 2] = "Assistant";
  LanguageModelChatMessageRole2[LanguageModelChatMessageRole2["System"] = 3] = "System";
  return LanguageModelChatMessageRole2;
})(LanguageModelChatMessageRole || {});
class LanguageModelToolResultPart {
  constructor(callId, content, isError) {
    this.callId = callId;
    this.content = content;
    this.isError = isError ?? false;
  }
}
var ChatErrorLevel = /* @__PURE__ */ ((ChatErrorLevel2) => {
  ChatErrorLevel2[ChatErrorLevel2["Info"] = 0] = "Info";
  ChatErrorLevel2[ChatErrorLevel2["Warning"] = 1] = "Warning";
  ChatErrorLevel2[ChatErrorLevel2["Error"] = 2] = "Error";
  return ChatErrorLevel2;
})(ChatErrorLevel || {});
var ChatInputNotificationSeverity = /* @__PURE__ */ ((ChatInputNotificationSeverity2) => {
  ChatInputNotificationSeverity2[ChatInputNotificationSeverity2["Info"] = 0] = "Info";
  ChatInputNotificationSeverity2[ChatInputNotificationSeverity2["Warning"] = 1] = "Warning";
  ChatInputNotificationSeverity2[ChatInputNotificationSeverity2["Error"] = 2] = "Error";
  return ChatInputNotificationSeverity2;
})(ChatInputNotificationSeverity || {});
class LanguageModelChatMessage {
  constructor(role, content, name) {
    this._content = [];
    this.role = role;
    this.content = content;
    this.name = name;
  }
  static User(content, name) {
    return new LanguageModelChatMessage(1 /* User */, content, name);
  }
  static Assistant(content, name) {
    return new LanguageModelChatMessage(2 /* Assistant */, content, name);
  }
  set content(value) {
    if (typeof value === "string") {
      this._content = [new LanguageModelTextPart(value)];
    } else {
      this._content = value;
    }
  }
  get content() {
    return this._content;
  }
}
class LanguageModelChatMessage2 {
  constructor(role, content, name) {
    this._content = [];
    this.role = role;
    this.content = content;
    this.name = name;
  }
  static User(content, name) {
    return new LanguageModelChatMessage2(1 /* User */, content, name);
  }
  static Assistant(content, name) {
    return new LanguageModelChatMessage2(2 /* Assistant */, content, name);
  }
  set content(value) {
    if (typeof value === "string") {
      this._content = [new LanguageModelTextPart(value)];
    } else {
      this._content = value;
    }
  }
  get content() {
    return this._content;
  }
  // Temp to avoid breaking changes
  set content2(value) {
    if (value) {
      this.content = value.map((part) => {
        if (typeof part === "string") {
          return new LanguageModelTextPart(part);
        }
        return part;
      });
    }
  }
  get content2() {
    return this.content.map((part) => {
      if (part instanceof LanguageModelTextPart) {
        return part.value;
      }
      return part;
    });
  }
}
class LanguageModelToolCallPart {
  constructor(callId, name, input) {
    this.callId = callId;
    this.name = name;
    this.input = input;
  }
}
var LanguageModelPartAudience = /* @__PURE__ */ ((LanguageModelPartAudience2) => {
  LanguageModelPartAudience2[LanguageModelPartAudience2["Assistant"] = 0] = "Assistant";
  LanguageModelPartAudience2[LanguageModelPartAudience2["User"] = 1] = "User";
  LanguageModelPartAudience2[LanguageModelPartAudience2["Extension"] = 2] = "Extension";
  return LanguageModelPartAudience2;
})(LanguageModelPartAudience || {});
class LanguageModelTextPart {
  constructor(value, audience) {
    this.value = value;
    audience = audience;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelTextPart,
      value: this.value,
      audience: this.audience
    };
  }
}
class LanguageModelDataPart {
  constructor(data, mimeType, audience) {
    this.mimeType = mimeType;
    this.data = data;
    this.audience = audience;
  }
  static image(data, mimeType) {
    return new LanguageModelDataPart(data, mimeType);
  }
  static json(value, mime = "text/x-json") {
    const rawStr = JSON.stringify(value, void 0, "	");
    return new LanguageModelDataPart(VSBuffer.fromString(rawStr).buffer, mime);
  }
  static text(value, mime = Mimes.text) {
    return new LanguageModelDataPart(VSBuffer.fromString(value).buffer, mime);
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelDataPart,
      mimeType: this.mimeType,
      data: encodeBase64(VSBuffer.wrap(this.data)),
      audience: this.audience
    };
  }
}
var ChatImageMimeType = /* @__PURE__ */ ((ChatImageMimeType2) => {
  ChatImageMimeType2["PNG"] = "image/png";
  ChatImageMimeType2["JPEG"] = "image/jpeg";
  ChatImageMimeType2["GIF"] = "image/gif";
  ChatImageMimeType2["WEBP"] = "image/webp";
  ChatImageMimeType2["BMP"] = "image/bmp";
  return ChatImageMimeType2;
})(ChatImageMimeType || {});
class LanguageModelThinkingPart {
  constructor(value, id, metadata) {
    this.value = value;
    this.id = id;
    this.metadata = metadata;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelThinkingPart,
      value: this.value,
      id: this.id,
      metadata: this.metadata
    };
  }
}
class LanguageModelPromptTsxPart {
  constructor(value) {
    this.value = value;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelPromptTsxPart,
      value: this.value
    };
  }
}
class LanguageModelChatSystemMessage {
  constructor(content) {
    this.content = content;
  }
}
class LanguageModelChatUserMessage {
  constructor(content, name) {
    this.content = content;
    this.name = name;
  }
}
class LanguageModelChatAssistantMessage {
  constructor(content, name) {
    this.content = content;
    this.name = name;
  }
}
class LanguageModelError extends Error {
  static #name = "LanguageModelError";
  static NotFound(message) {
    return new LanguageModelError(message, LanguageModelError.NotFound.name);
  }
  static NoPermissions(message) {
    return new LanguageModelError(message, LanguageModelError.NoPermissions.name);
  }
  static Blocked(message) {
    return new LanguageModelError(message, LanguageModelError.Blocked.name);
  }
  static tryDeserialize(data) {
    if (data.name !== LanguageModelError.#name) {
      return void 0;
    }
    return new LanguageModelError(data.message, data.code, data.cause);
  }
  constructor(message, code, cause) {
    super(message, { cause });
    this.name = LanguageModelError.#name;
    this.code = code ?? "";
  }
}
class LanguageModelToolResult {
  constructor(content) {
    this.content = content;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelToolResult,
      content: this.content
    };
  }
}
class LanguageModelToolResult2 {
  constructor(content) {
    this.content = content;
  }
  toJSON() {
    return {
      $mid: MarshalledId.LanguageModelToolResult,
      content: this.content
    };
  }
}
class ExtendedLanguageModelToolResult extends LanguageModelToolResult {
}
var LanguageModelChatToolMode = /* @__PURE__ */ ((LanguageModelChatToolMode2) => {
  LanguageModelChatToolMode2[LanguageModelChatToolMode2["Auto"] = 1] = "Auto";
  LanguageModelChatToolMode2[LanguageModelChatToolMode2["Required"] = 2] = "Required";
  return LanguageModelChatToolMode2;
})(LanguageModelChatToolMode || {});
class LanguageModelToolExtensionSource {
  constructor(id, label) {
    this.id = id;
    this.label = label;
  }
}
class LanguageModelToolMCPSource {
  constructor(label, name, instructions) {
    this.label = label;
    this.name = name;
    this.instructions = instructions;
  }
}
var RelatedInformationType = /* @__PURE__ */ ((RelatedInformationType2) => {
  RelatedInformationType2[RelatedInformationType2["SymbolInformation"] = 1] = "SymbolInformation";
  RelatedInformationType2[RelatedInformationType2["CommandInformation"] = 2] = "CommandInformation";
  RelatedInformationType2[RelatedInformationType2["SearchInformation"] = 3] = "SearchInformation";
  RelatedInformationType2[RelatedInformationType2["SettingInformation"] = 4] = "SettingInformation";
  return RelatedInformationType2;
})(RelatedInformationType || {});
var SettingsSearchResultKind = /* @__PURE__ */ ((SettingsSearchResultKind2) => {
  SettingsSearchResultKind2[SettingsSearchResultKind2["EMBEDDED"] = 1] = "EMBEDDED";
  SettingsSearchResultKind2[SettingsSearchResultKind2["LLM_RANKED"] = 2] = "LLM_RANKED";
  SettingsSearchResultKind2[SettingsSearchResultKind2["CANCELED"] = 3] = "CANCELED";
  return SettingsSearchResultKind2;
})(SettingsSearchResultKind || {});
var SpeechToTextStatus = /* @__PURE__ */ ((SpeechToTextStatus2) => {
  SpeechToTextStatus2[SpeechToTextStatus2["Started"] = 1] = "Started";
  SpeechToTextStatus2[SpeechToTextStatus2["Recognizing"] = 2] = "Recognizing";
  SpeechToTextStatus2[SpeechToTextStatus2["Recognized"] = 3] = "Recognized";
  SpeechToTextStatus2[SpeechToTextStatus2["Stopped"] = 4] = "Stopped";
  SpeechToTextStatus2[SpeechToTextStatus2["Error"] = 5] = "Error";
  return SpeechToTextStatus2;
})(SpeechToTextStatus || {});
var TextToSpeechStatus = /* @__PURE__ */ ((TextToSpeechStatus2) => {
  TextToSpeechStatus2[TextToSpeechStatus2["Started"] = 1] = "Started";
  TextToSpeechStatus2[TextToSpeechStatus2["Stopped"] = 2] = "Stopped";
  TextToSpeechStatus2[TextToSpeechStatus2["Error"] = 3] = "Error";
  return TextToSpeechStatus2;
})(TextToSpeechStatus || {});
var KeywordRecognitionStatus = /* @__PURE__ */ ((KeywordRecognitionStatus2) => {
  KeywordRecognitionStatus2[KeywordRecognitionStatus2["Recognized"] = 1] = "Recognized";
  KeywordRecognitionStatus2[KeywordRecognitionStatus2["Stopped"] = 2] = "Stopped";
  return KeywordRecognitionStatus2;
})(KeywordRecognitionStatus || {});
var McpToolAvailability = /* @__PURE__ */ ((McpToolAvailability2) => {
  McpToolAvailability2[McpToolAvailability2["Initial"] = 0] = "Initial";
  McpToolAvailability2[McpToolAvailability2["Dynamic"] = 1] = "Dynamic";
  return McpToolAvailability2;
})(McpToolAvailability || {});
class McpStdioServerDefinition {
  constructor(label, command, args, env = {}, version, metadata) {
    this.label = label;
    this.command = command;
    this.args = args;
    this.env = env;
    this.version = version;
    this.metadata = metadata;
  }
}
class McpHttpServerDefinition {
  constructor(label, uri, headers = {}, version, metadata, authentication) {
    this.label = label;
    this.uri = uri;
    this.headers = headers;
    this.version = version;
    this.metadata = metadata;
    this.authentication = authentication;
  }
}
export {
  BranchCoverage,
  Breakpoint,
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  CellErrorStackFrame,
  ChatCompletionItem,
  ChatCopyKind,
  ChatDebugAgentResponseEvent,
  ChatDebugEventHookContent,
  ChatDebugEventMessageContent,
  ChatDebugEventModelTurnContent,
  ChatDebugEventTextContent,
  ChatDebugEventToolCallContent,
  ChatDebugGenericEvent,
  ChatDebugHookResult,
  ChatDebugLogLevel,
  ChatDebugMessageContentType,
  ChatDebugMessageSection,
  ChatDebugModelTurnEvent,
  ChatDebugSubagentInvocationEvent,
  ChatDebugSubagentStatus,
  ChatDebugToolCallEvent,
  ChatDebugToolCallResult,
  ChatDebugUserMessageEvent,
  ChatEditingSessionActionOutcome,
  ChatEditorTabInput,
  ChatErrorLevel,
  ChatImageMimeType,
  ChatInputNotificationSeverity,
  ChatLocation,
  ChatQuestion,
  ChatQuestionType,
  ChatReferenceBinaryData,
  ChatReferenceDiagnostic,
  ChatRequestEditedFileEventKind,
  ChatRequestEditorData,
  ChatRequestNotebookData,
  ChatRequestTurn,
  ChatResponseAnchorPart,
  ChatResponseAutoModeResolutionPart,
  ChatResponseClearToPreviousToolInvocationReason,
  ChatResponseCodeCitationPart,
  ChatResponseCodeblockUriPart,
  ChatResponseCommandButtonPart,
  ChatResponseConfirmationPart,
  ChatResponseExtensionsPart,
  ChatResponseExternalEditPart,
  ChatResponseFileTreePart,
  ChatResponseHookPart,
  ChatResponseInfoPart,
  ChatResponseMarkdownPart,
  ChatResponseMarkdownWithVulnerabilitiesPart,
  ChatResponseMovePart,
  ChatResponseMultiDiffPart,
  ChatResponseNotebookEditPart,
  ChatResponseProgressPart,
  ChatResponseProgressPart2,
  ChatResponsePullRequestPart,
  ChatResponseQuestionCarouselPart,
  ChatResponseReferencePart,
  ChatResponseReferencePartStatusKind,
  ChatResponseTextEditPart,
  ChatResponseThinkingProgressPart,
  ChatResponseTurn,
  ChatResponseTurn2,
  ChatResponseVoiceProgressPart,
  ChatResponseWarningPart,
  ChatResponseWorkspaceEditPart,
  ChatResultFeedbackKind,
  ChatSessionChangedFile,
  ChatSessionCustomizationType,
  ChatSessionStatus,
  ChatSubagentToolInvocationData,
  ChatTodoStatus,
  ChatToolInvocationPart,
  ChatVariableLevel,
  CodeAction,
  CodeActionKind2 as CodeActionKind,
  CodeActionTriggerKind,
  CodeLens,
  Color,
  ColorFormat,
  ColorInformation,
  ColorPresentation,
  ColorTheme,
  ColorThemeKind,
  CommentMode,
  CommentState,
  CommentThreadApplicability,
  CommentThreadCollapsibleState,
  CommentThreadFocus,
  CommentThreadState,
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  CompletionList,
  CompletionTriggerKind,
  ConfigurationTarget,
  CustomEditorTabInput,
  CustomExecution,
  DataBreakpoint,
  DataTransfer,
  DataTransferFile,
  DataTransferItem,
  DebugAdapterExecutable,
  DebugAdapterInlineImplementation,
  DebugAdapterNamedPipeServer,
  DebugAdapterServer,
  DebugConsoleMode,
  DebugStackFrame,
  DebugThread,
  DebugVisualization,
  DeclarationCoverage,
  DecorationRangeBehavior,
  Diagnostic2 as Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag,
  Disposable,
  DocumentDropEdit,
  DocumentDropOrPasteEditKind,
  DocumentHighlight,
  DocumentHighlightKind,
  DocumentLink,
  DocumentPasteEdit,
  DocumentPasteTriggerKind,
  DocumentSymbol,
  EndOfLine,
  EnvironmentVariableMutatorType,
  EvaluatableExpression,
  ExtendedLanguageModelToolResult,
  ExtensionKind,
  ExtensionMode,
  ExtensionRuntime,
  ExternalUriOpenerPriority,
  FileChangeType,
  FileCoverage,
  FileDecoration,
  FileEditType,
  FileSystemError,
  FoldingRange,
  FoldingRangeKind,
  FunctionBreakpoint,
  Hover,
  HoverVerbosityAction,
  InlayHint,
  InlayHintKind,
  InlayHintLabelPart,
  InlineCompletionDisplayLocationKind,
  InlineCompletionEndOfLifeReasonKind,
  InlineCompletionTriggerKind,
  InlineCompletionsDisposeReasonKind,
  InlineSuggestion,
  InlineSuggestionList,
  InlineValueContext,
  InlineValueEvaluatableExpression,
  InlineValueText,
  InlineValueVariableLookup,
  InputBoxValidationSeverity,
  InteractiveEditorResponseFeedbackKind,
  InteractiveSessionVoteDirection,
  InteractiveWindowInput,
  InternalDataTransferItem,
  InternalFileDataTransferItem,
  KeywordRecognitionStatus,
  LanguageModelChatAssistantMessage,
  LanguageModelChatMessage,
  LanguageModelChatMessage2,
  LanguageModelChatMessageRole,
  LanguageModelChatSystemMessage,
  LanguageModelChatToolMode,
  LanguageModelChatUserMessage,
  LanguageModelDataPart,
  LanguageModelError,
  LanguageModelPartAudience,
  LanguageModelPromptTsxPart,
  LanguageModelTextPart,
  LanguageModelThinkingPart,
  LanguageModelToolCallPart,
  LanguageModelToolExtensionSource,
  LanguageModelToolMCPSource,
  LanguageModelToolResult,
  LanguageModelToolResult2,
  LanguageModelToolResultPart,
  LanguageStatusSeverity,
  LinkedEditingRanges,
  Location2 as Location,
  ManagedResolvedAuthority,
  MarkdownString2 as MarkdownString,
  McpHttpServerDefinition,
  McpStdioServerDefinition,
  McpToolAvailability,
  McpToolInvocationContentData,
  MultiDocumentHighlight,
  NewSymbolName,
  NewSymbolNameTag,
  NewSymbolNameTriggerKind,
  NotebookCellData,
  NotebookCellExecutionState,
  NotebookCellKind,
  NotebookCellOutput,
  NotebookCellOutputItem,
  NotebookCellStatusBarAlignment,
  NotebookCellStatusBarItem,
  NotebookControllerAffinity,
  NotebookControllerAffinity2,
  NotebookData,
  NotebookDiffEditorTabInput,
  NotebookEdit,
  NotebookEditorRevealType,
  NotebookEditorTabInput,
  NotebookKernelSourceAction,
  NotebookRange,
  NotebookRendererScript,
  NotebookVariablesRequestKind,
  ParameterInformation,
  PartialAcceptTriggerKind,
  PortAttributes,
  PortAutoForwardAction,
  Position2 as Position,
  ProcessExecution,
  ProgressLocation,
  QuickInputButtonLocation,
  QuickInputButtons,
  QuickPickItemKind,
  Range2 as Range,
  RelatedInformationType,
  RelativePattern,
  RemoteAuthorityResolverError,
  ResolvedAuthority,
  Selection,
  SelectionRange,
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensEdit,
  SemanticTokensEdits,
  SemanticTokensLegend,
  SettingsSearchResultKind,
  ShellExecution,
  ShellQuoting,
  SignatureHelp,
  SignatureHelpTriggerKind,
  SignatureInformation,
  SnippetString2 as SnippetString,
  SnippetTextEdit,
  SourceBreakpoint,
  SourceControlInputBoxValidationType,
  SpeechToTextStatus,
  StandardTokenType,
  StatementCoverage,
  StatusBarAlignment,
  SymbolInformation,
  SymbolKind2 as SymbolKind,
  SymbolTag2 as SymbolTag,
  SyntaxHighlightingTokenFontStyle,
  SyntaxTokenType,
  Task,
  TaskEventKind,
  TaskGroup,
  TaskPanelKind,
  TaskRevealKind,
  TaskRunOn,
  TaskScope,
  TerminalCompletionItem,
  TerminalCompletionItemKind,
  TerminalCompletionList,
  TerminalEditorTabInput,
  TerminalExitReason,
  TerminalLink,
  TerminalLocation,
  TerminalOutputAnchor,
  TerminalProfile,
  TerminalQuickFixCommand,
  TerminalQuickFixOpener,
  TerminalQuickFixType,
  TerminalShellExecutionCommandLineConfidence,
  TerminalShellType,
  TestCoverageCount,
  TestMessage,
  TestMessageStackFrame,
  TestResultState,
  TestRunProfileBase,
  TestRunProfileKind,
  TestRunRequest,
  TestTag,
  TextDiffTabInput,
  TextDocumentChangeReason,
  TextDocumentSaveReason,
  TextEdit2 as TextEdit,
  TextEditorChangeKind,
  TextEditorLineNumbersStyle,
  TextEditorRevealType,
  TextEditorSelectionChangeKind,
  TextMergeTabInput,
  TextMultiDiffTabInput,
  TextTabInput,
  TextToSpeechStatus,
  ThemeColor,
  ThemeIcon,
  TimelineItem,
  TreeItem,
  TreeItemCheckboxState,
  TreeItemCollapsibleState,
  TypeHierarchyItem,
  VerboseHover,
  ViewBadge,
  ViewColumn,
  WebviewEditorTabInput,
  WorkspaceEdit2 as WorkspaceEdit,
  WorkspaceTrustState,
  asStatusBarItemIdentifier,
  setBreakpointId,
  validateTestCoverageCount
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQsIFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGlsbGVnYWxBcmd1bWVudCwgU2VyaWFsaXplZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElSZWxhdGl2ZVBhdHRlcm4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBuZXh0Q2hhckxlbmd0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIsIGlzT2JqZWN0LCBpc1N0cmluZywgaXNTdHJpbmdBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGlzVXJpQ29tcG9uZW50cywgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLCBtYXJrQXNGaWxlU3lzdGVtUHJvdmlkZXJFcnJvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVJlbGF0aXZlUGF0dGVybkR0byB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uS2luZCB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL2NvZGVBY3Rpb25LaW5kLmpzJztcbmltcG9ydCB7IERpYWdub3N0aWMgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9kaWFnbm9zdGljLmpzJztcbmltcG9ydCB7IGVzNUNsYXNzQ29tcGF0IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvZXM1Q2xhc3NDb21wYXQuanMnO1xuaW1wb3J0IHsgTG9jYXRpb24gfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9sb2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL21hcmtkb3duU3RyaW5nLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0U3RyaW5nIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvc25pcHBldFN0cmluZy5qcyc7XG5pbXBvcnQgeyBTeW1ib2xLaW5kLCBTeW1ib2xUYWcgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9zeW1ib2xJbmZvcm1hdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3RleHRFZGl0LmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy93b3Jrc3BhY2VFZGl0LmpzJztcbmltcG9ydCB7IEhvb2tUeXBlVmFsdWUgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9ob29rVHlwZXMuanMnO1xuXG5leHBvcnQgeyBDb2RlQWN0aW9uS2luZCB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL2NvZGVBY3Rpb25LaW5kLmpzJztcbmV4cG9ydCB7XG5cdERpYWdub3N0aWMsIERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24sXG5cdERpYWdub3N0aWNTZXZlcml0eSwgRGlhZ25vc3RpY1RhZ1xufSBmcm9tICcuL2V4dEhvc3RUeXBlcy9kaWFnbm9zdGljLmpzJztcbmV4cG9ydCB7IExvY2F0aW9uIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvbG9jYXRpb24uanMnO1xuZXhwb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9tYXJrZG93blN0cmluZy5qcyc7XG5leHBvcnQgeyBOb3RlYm9va0NlbGxEYXRhLCBOb3RlYm9va0NlbGxLaW5kLCBOb3RlYm9va0NlbGxPdXRwdXQsIE5vdGVib29rQ2VsbE91dHB1dEl0ZW0sIE5vdGVib29rRGF0YSwgTm90ZWJvb2tFZGl0LCBOb3RlYm9va1JhbmdlIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvbm90ZWJvb2tzLmpzJztcbmV4cG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvcG9zaXRpb24uanMnO1xuZXhwb3J0IHsgUmFuZ2UgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9yYW5nZS5qcyc7XG5leHBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9zZWxlY3Rpb24uanMnO1xuZXhwb3J0IHsgU25pcHBldFN0cmluZyB9IGZyb20gJy4vZXh0SG9zdFR5cGVzL3NuaXBwZXRTdHJpbmcuanMnO1xuZXhwb3J0IHsgU25pcHBldFRleHRFZGl0IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvc25pcHBldFRleHRFZGl0LmpzJztcbmV4cG9ydCB7IFN5bWJvbEluZm9ybWF0aW9uLCBTeW1ib2xLaW5kLCBTeW1ib2xUYWcgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy9zeW1ib2xJbmZvcm1hdGlvbi5qcyc7XG5leHBvcnQgeyBFbmRPZkxpbmUsIFRleHRFZGl0IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvdGV4dEVkaXQuanMnO1xuZXhwb3J0IHsgRmlsZUVkaXRUeXBlLCBXb3Jrc3BhY2VFZGl0IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMvd29ya3NwYWNlRWRpdC5qcyc7XG5cbmV4cG9ydCBlbnVtIFRlcm1pbmFsT3V0cHV0QW5jaG9yIHtcblx0VG9wID0gMCxcblx0Qm90dG9tID0gMVxufVxuXG5leHBvcnQgZW51bSBUZXJtaW5hbFF1aWNrRml4VHlwZSB7XG5cdFRlcm1pbmFsQ29tbWFuZCA9IDAsXG5cdE9wZW5lciA9IDEsXG5cdENvbW1hbmQgPSAzXG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyBmcm9tKC4uLmluRGlzcG9zYWJsZXM6IHsgZGlzcG9zZSgpOiBhbnkgfVtdKTogRGlzcG9zYWJsZSB7XG5cdFx0bGV0IGRpc3Bvc2FibGVzOiBSZWFkb25seUFycmF5PHsgZGlzcG9zZSgpOiBhbnkgfT4gfCB1bmRlZmluZWQgPSBpbkRpc3Bvc2FibGVzO1xuXHRcdHJldHVybiBuZXcgRGlzcG9zYWJsZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAoZGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBkaXNwb3NhYmxlIG9mIGRpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdFx0aWYgKGRpc3Bvc2FibGUgJiYgdHlwZW9mIGRpc3Bvc2FibGUuZGlzcG9zZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2FibGVzID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0I2NhbGxPbkRpc3Bvc2U/OiAoKSA9PiBhbnk7XG5cblx0Y29uc3RydWN0b3IoY2FsbE9uRGlzcG9zZTogKCkgPT4gYW55KSB7XG5cdFx0dGhpcy4jY2FsbE9uRGlzcG9zZSA9IGNhbGxPbkRpc3Bvc2U7XG5cdH1cblxuXHRkaXNwb3NlKCk6IGFueSB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLiNjYWxsT25EaXNwb3NlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHR0aGlzLiNjYWxsT25EaXNwb3NlKCk7XG5cdFx0XHR0aGlzLiNjYWxsT25EaXNwb3NlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCB2YWxpZGF0ZUNvbm5lY3Rpb25Ub2tlbiA9IChjb25uZWN0aW9uVG9rZW46IHN0cmluZykgPT4ge1xuXHRpZiAodHlwZW9mIGNvbm5lY3Rpb25Ub2tlbiAhPT0gJ3N0cmluZycgfHwgY29ubmVjdGlvblRva2VuLmxlbmd0aCA9PT0gMCB8fCAhL15bMC05QS1aYS16X1xcLV0rJC8udGVzdChjb25uZWN0aW9uVG9rZW4pKSB7XG5cdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdjb25uZWN0aW9uVG9rZW4nKTtcblx0fVxufTtcblxuXG5leHBvcnQgY2xhc3MgUmVzb2x2ZWRBdXRob3JpdHkge1xuXHRwdWJsaWMgc3RhdGljIGlzUmVzb2x2ZWRBdXRob3JpdHkocmVzb2x2ZWRBdXRob3JpdHk6IGFueSk6IHJlc29sdmVkQXV0aG9yaXR5IGlzIFJlc29sdmVkQXV0aG9yaXR5IHtcblx0XHRyZXR1cm4gcmVzb2x2ZWRBdXRob3JpdHlcblx0XHRcdCYmIHR5cGVvZiByZXNvbHZlZEF1dGhvcml0eSA9PT0gJ29iamVjdCdcblx0XHRcdCYmIHR5cGVvZiByZXNvbHZlZEF1dGhvcml0eS5ob3N0ID09PSAnc3RyaW5nJ1xuXHRcdFx0JiYgdHlwZW9mIHJlc29sdmVkQXV0aG9yaXR5LnBvcnQgPT09ICdudW1iZXInXG5cdFx0XHQmJiAocmVzb2x2ZWRBdXRob3JpdHkuY29ubmVjdGlvblRva2VuID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHJlc29sdmVkQXV0aG9yaXR5LmNvbm5lY3Rpb25Ub2tlbiA9PT0gJ3N0cmluZycpO1xuXHR9XG5cblx0cmVhZG9ubHkgaG9zdDogc3RyaW5nO1xuXHRyZWFkb25seSBwb3J0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyLCBjb25uZWN0aW9uVG9rZW4/OiBzdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIGhvc3QgIT09ICdzdHJpbmcnIHx8IGhvc3QubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2hvc3QnKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBwb3J0ICE9PSAnbnVtYmVyJyB8fCBwb3J0ID09PSAwIHx8IE1hdGgucm91bmQocG9ydCkgIT09IHBvcnQpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgncG9ydCcpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGNvbm5lY3Rpb25Ub2tlbiAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHZhbGlkYXRlQ29ubmVjdGlvblRva2VuKGNvbm5lY3Rpb25Ub2tlbik7XG5cdFx0fVxuXHRcdHRoaXMuaG9zdCA9IGhvc3Q7XG5cdFx0dGhpcy5wb3J0ID0gTWF0aC5yb3VuZChwb3J0KTtcblx0XHR0aGlzLmNvbm5lY3Rpb25Ub2tlbiA9IGNvbm5lY3Rpb25Ub2tlbjtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VkUmVzb2x2ZWRBdXRob3JpdHkge1xuXG5cdHB1YmxpYyBzdGF0aWMgaXNNYW5hZ2VkUmVzb2x2ZWRBdXRob3JpdHkocmVzb2x2ZWRBdXRob3JpdHk6IGFueSk6IHJlc29sdmVkQXV0aG9yaXR5IGlzIE1hbmFnZWRSZXNvbHZlZEF1dGhvcml0eSB7XG5cdFx0cmV0dXJuIHJlc29sdmVkQXV0aG9yaXR5XG5cdFx0XHQmJiB0eXBlb2YgcmVzb2x2ZWRBdXRob3JpdHkgPT09ICdvYmplY3QnXG5cdFx0XHQmJiB0eXBlb2YgcmVzb2x2ZWRBdXRob3JpdHkubWFrZUNvbm5lY3Rpb24gPT09ICdmdW5jdGlvbidcblx0XHRcdCYmIChyZXNvbHZlZEF1dGhvcml0eS5jb25uZWN0aW9uVG9rZW4gPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgcmVzb2x2ZWRBdXRob3JpdHkuY29ubmVjdGlvblRva2VuID09PSAnc3RyaW5nJyk7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgbWFrZUNvbm5lY3Rpb246ICgpID0+IFRoZW5hYmxlPHZzY29kZS5NYW5hZ2VkTWVzc2FnZVBhc3Npbmc+LCBwdWJsaWMgcmVhZG9ubHkgY29ubmVjdGlvblRva2VuPzogc3RyaW5nKSB7XG5cdFx0aWYgKHR5cGVvZiBjb25uZWN0aW9uVG9rZW4gIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR2YWxpZGF0ZUNvbm5lY3Rpb25Ub2tlbihjb25uZWN0aW9uVG9rZW4pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvciBleHRlbmRzIEVycm9yIHtcblxuXHRzdGF0aWMgTm90QXZhaWxhYmxlKG1lc3NhZ2U/OiBzdHJpbmcsIGhhbmRsZWQ/OiBib29sZWFuKTogUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yKG1lc3NhZ2UsIFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3JDb2RlLk5vdEF2YWlsYWJsZSwgaGFuZGxlZCk7XG5cdH1cblxuXHRzdGF0aWMgVGVtcG9yYXJpbHlOb3RBdmFpbGFibGUobWVzc2FnZT86IHN0cmluZyk6IFJlbW90ZUF1dGhvcml0eVJlc29sdmVyRXJyb3Ige1xuXHRcdHJldHVybiBuZXcgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvcihtZXNzYWdlLCBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZS5UZW1wb3JhcmlseU5vdEF2YWlsYWJsZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgX21lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIHJlYWRvbmx5IF9jb2RlOiBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZTtcblx0cHVibGljIHJlYWRvbmx5IF9kZXRhaWw6IHVua25vd247XG5cblx0Y29uc3RydWN0b3IobWVzc2FnZT86IHN0cmluZywgY29kZTogUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvckNvZGUgPSBSZW1vdGVBdXRob3JpdHlSZXNvbHZlckVycm9yQ29kZS5Vbmtub3duLCBkZXRhaWw/OiB1bmtub3duKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cblx0XHR0aGlzLl9tZXNzYWdlID0gbWVzc2FnZTtcblx0XHR0aGlzLl9jb2RlID0gY29kZTtcblx0XHR0aGlzLl9kZXRhaWwgPSBkZXRhaWw7XG5cblx0XHQvLyB3b3JrYXJvdW5kIHdoZW4gZXh0ZW5kaW5nIGJ1aWx0aW4gb2JqZWN0cyBhbmQgd2hlbiBjb21waWxpbmcgdG8gRVM1LCBzZWU6XG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9UeXBlU2NyaXB0LXdpa2kvYmxvYi9tYXN0ZXIvQnJlYWtpbmctQ2hhbmdlcy5tZCNleHRlbmRpbmctYnVpbHQtaW5zLWxpa2UtZXJyb3ItYXJyYXktYW5kLW1hcC1tYXktbm8tbG9uZ2VyLXdvcmtcblx0XHRPYmplY3Quc2V0UHJvdG90eXBlT2YodGhpcywgUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJFcnJvci5wcm90b3R5cGUpO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZSB7XG5cdFJlcGxhY2UgPSAxLFxuXHRBcHBlbmQgPSAyLFxuXHRQcmVwZW5kID0gM1xufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBIb3ZlciB7XG5cblx0cHVibGljIGNvbnRlbnRzOiAodnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdnNjb2RlLk1hcmtlZFN0cmluZylbXTtcblx0cHVibGljIHJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZW50czogdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdnNjb2RlLk1hcmtlZFN0cmluZyB8ICh2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB2c2NvZGUuTWFya2VkU3RyaW5nKVtdLFxuXHRcdHJhbmdlPzogUmFuZ2Vcblx0KSB7XG5cdFx0aWYgKCFjb250ZW50cykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbGxlZ2FsIGFyZ3VtZW50LCBjb250ZW50cyBtdXN0IGJlIGRlZmluZWQnKTtcblx0XHR9XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoY29udGVudHMpKSB7XG5cdFx0XHR0aGlzLmNvbnRlbnRzID0gY29udGVudHM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29udGVudHMgPSBbY29udGVudHNdO1xuXHRcdH1cblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgVmVyYm9zZUhvdmVyIGV4dGVuZHMgSG92ZXIge1xuXG5cdHB1YmxpYyBjYW5JbmNyZWFzZVZlcmJvc2l0eTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHVibGljIGNhbkRlY3JlYXNlVmVyYm9zaXR5OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRlbnRzOiB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB2c2NvZGUuTWFya2VkU3RyaW5nIHwgKHZzY29kZS5NYXJrZG93blN0cmluZyB8IHZzY29kZS5NYXJrZWRTdHJpbmcpW10sXG5cdFx0cmFuZ2U/OiBSYW5nZSxcblx0XHRjYW5JbmNyZWFzZVZlcmJvc2l0eT86IGJvb2xlYW4sXG5cdFx0Y2FuRGVjcmVhc2VWZXJib3NpdHk/OiBib29sZWFuLFxuXHQpIHtcblx0XHRzdXBlcihjb250ZW50cywgcmFuZ2UpO1xuXHRcdHRoaXMuY2FuSW5jcmVhc2VWZXJib3NpdHkgPSBjYW5JbmNyZWFzZVZlcmJvc2l0eTtcblx0XHR0aGlzLmNhbkRlY3JlYXNlVmVyYm9zaXR5ID0gY2FuRGVjcmVhc2VWZXJib3NpdHk7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gSG92ZXJWZXJib3NpdHlBY3Rpb24ge1xuXHRJbmNyZWFzZSA9IDAsXG5cdERlY3JlYXNlID0gMVxufVxuXG5leHBvcnQgZW51bSBEb2N1bWVudEhpZ2hsaWdodEtpbmQge1xuXHRUZXh0ID0gMCxcblx0UmVhZCA9IDEsXG5cdFdyaXRlID0gMlxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBEb2N1bWVudEhpZ2hsaWdodCB7XG5cblx0cmFuZ2U6IFJhbmdlO1xuXHRraW5kOiBEb2N1bWVudEhpZ2hsaWdodEtpbmQ7XG5cblx0Y29uc3RydWN0b3IocmFuZ2U6IFJhbmdlLCBraW5kOiBEb2N1bWVudEhpZ2hsaWdodEtpbmQgPSBEb2N1bWVudEhpZ2hsaWdodEtpbmQuVGV4dCkge1xuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLmtpbmQgPSBraW5kO1xuXHR9XG5cblx0dG9KU09OKCk6IGFueSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiB0aGlzLnJhbmdlLFxuXHRcdFx0a2luZDogRG9jdW1lbnRIaWdobGlnaHRLaW5kW3RoaXMua2luZF1cblx0XHR9O1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIE11bHRpRG9jdW1lbnRIaWdobGlnaHQge1xuXG5cdHVyaTogVVJJO1xuXHRoaWdobGlnaHRzOiBEb2N1bWVudEhpZ2hsaWdodFtdO1xuXG5cdGNvbnN0cnVjdG9yKHVyaTogVVJJLCBoaWdobGlnaHRzOiBEb2N1bWVudEhpZ2hsaWdodFtdKSB7XG5cdFx0dGhpcy51cmkgPSB1cmk7XG5cdFx0dGhpcy5oaWdobGlnaHRzID0gaGlnaGxpZ2h0cztcblx0fVxuXG5cdHRvSlNPTigpOiBhbnkge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHRoaXMudXJpLFxuXHRcdFx0aGlnaGxpZ2h0czogdGhpcy5oaWdobGlnaHRzLm1hcChoID0+IGgudG9KU09OKCkpXG5cdFx0fTtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBEb2N1bWVudFN5bWJvbCB7XG5cblx0c3RhdGljIHZhbGlkYXRlKGNhbmRpZGF0ZTogRG9jdW1lbnRTeW1ib2wpOiB2b2lkIHtcblx0XHRpZiAoIWNhbmRpZGF0ZS5uYW1lKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25hbWUgbXVzdCBub3QgYmUgZmFsc3knKTtcblx0XHR9XG5cdFx0aWYgKCFjYW5kaWRhdGUucmFuZ2UuY29udGFpbnMoY2FuZGlkYXRlLnNlbGVjdGlvblJhbmdlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdzZWxlY3Rpb25SYW5nZSBtdXN0IGJlIGNvbnRhaW5lZCBpbiBmdWxsUmFuZ2UnKTtcblx0XHR9XG5cdFx0Y2FuZGlkYXRlLmNoaWxkcmVuPy5mb3JFYWNoKERvY3VtZW50U3ltYm9sLnZhbGlkYXRlKTtcblx0fVxuXG5cdG5hbWU6IHN0cmluZztcblx0ZGV0YWlsOiBzdHJpbmc7XG5cdGtpbmQ6IFN5bWJvbEtpbmQ7XG5cdHRhZ3M/OiBTeW1ib2xUYWdbXTtcblx0cmFuZ2U6IFJhbmdlO1xuXHRzZWxlY3Rpb25SYW5nZTogUmFuZ2U7XG5cdGNoaWxkcmVuOiBEb2N1bWVudFN5bWJvbFtdO1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgZGV0YWlsOiBzdHJpbmcsIGtpbmQ6IFN5bWJvbEtpbmQsIHJhbmdlOiBSYW5nZSwgc2VsZWN0aW9uUmFuZ2U6IFJhbmdlKSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmRldGFpbCA9IGRldGFpbDtcblx0XHR0aGlzLmtpbmQgPSBraW5kO1xuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLnNlbGVjdGlvblJhbmdlID0gc2VsZWN0aW9uUmFuZ2U7XG5cdFx0dGhpcy5jaGlsZHJlbiA9IFtdO1xuXG5cdFx0RG9jdW1lbnRTeW1ib2wudmFsaWRhdGUodGhpcyk7XG5cdH1cbn1cblxuXG5leHBvcnQgZW51bSBDb2RlQWN0aW9uVHJpZ2dlcktpbmQge1xuXHRJbnZva2UgPSAxLFxuXHRBdXRvbWF0aWMgPSAyLFxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBDb2RlQWN0aW9uIHtcblx0dGl0bGU6IHN0cmluZztcblxuXHRjb21tYW5kPzogdnNjb2RlLkNvbW1hbmQ7XG5cblx0ZWRpdD86IFdvcmtzcGFjZUVkaXQ7XG5cblx0ZGlhZ25vc3RpY3M/OiBEaWFnbm9zdGljW107XG5cblx0a2luZD86IENvZGVBY3Rpb25LaW5kO1xuXG5cdGlzUHJlZmVycmVkPzogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcih0aXRsZTogc3RyaW5nLCBraW5kPzogQ29kZUFjdGlvbktpbmQpIHtcblx0XHR0aGlzLnRpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5raW5kID0ga2luZDtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBTZWxlY3Rpb25SYW5nZSB7XG5cblx0cmFuZ2U6IFJhbmdlO1xuXHRwYXJlbnQ/OiBTZWxlY3Rpb25SYW5nZTtcblxuXHRjb25zdHJ1Y3RvcihyYW5nZTogUmFuZ2UsIHBhcmVudD86IFNlbGVjdGlvblJhbmdlKSB7XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMucGFyZW50ID0gcGFyZW50O1xuXG5cdFx0aWYgKHBhcmVudCAmJiAhcGFyZW50LnJhbmdlLmNvbnRhaW5zKHRoaXMucmFuZ2UpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnQ6IHBhcmVudCBtdXN0IGNvbnRhaW4gdGhpcyByYW5nZScpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2FsbEhpZXJhcmNoeUl0ZW0ge1xuXG5cdF9zZXNzaW9uSWQ/OiBzdHJpbmc7XG5cdF9pdGVtSWQ/OiBzdHJpbmc7XG5cblx0a2luZDogU3ltYm9sS2luZDtcblx0dGFncz86IFN5bWJvbFRhZ1tdO1xuXHRuYW1lOiBzdHJpbmc7XG5cdGRldGFpbD86IHN0cmluZztcblx0dXJpOiBVUkk7XG5cdHJhbmdlOiBSYW5nZTtcblx0c2VsZWN0aW9uUmFuZ2U6IFJhbmdlO1xuXG5cdGNvbnN0cnVjdG9yKGtpbmQ6IFN5bWJvbEtpbmQsIG5hbWU6IHN0cmluZywgZGV0YWlsOiBzdHJpbmcsIHVyaTogVVJJLCByYW5nZTogUmFuZ2UsIHNlbGVjdGlvblJhbmdlOiBSYW5nZSkge1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmRldGFpbCA9IGRldGFpbDtcblx0XHR0aGlzLnVyaSA9IHVyaTtcblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdFx0dGhpcy5zZWxlY3Rpb25SYW5nZSA9IHNlbGVjdGlvblJhbmdlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDYWxsSGllcmFyY2h5SW5jb21pbmdDYWxsIHtcblxuXHRmcm9tOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW07XG5cdGZyb21SYW5nZXM6IHZzY29kZS5SYW5nZVtdO1xuXG5cdGNvbnN0cnVjdG9yKGl0ZW06IHZzY29kZS5DYWxsSGllcmFyY2h5SXRlbSwgZnJvbVJhbmdlczogdnNjb2RlLlJhbmdlW10pIHtcblx0XHR0aGlzLmZyb21SYW5nZXMgPSBmcm9tUmFuZ2VzO1xuXHRcdHRoaXMuZnJvbSA9IGl0ZW07XG5cdH1cbn1cbmV4cG9ydCBjbGFzcyBDYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxsIHtcblxuXHR0bzogdnNjb2RlLkNhbGxIaWVyYXJjaHlJdGVtO1xuXHRmcm9tUmFuZ2VzOiB2c2NvZGUuUmFuZ2VbXTtcblxuXHRjb25zdHJ1Y3RvcihpdGVtOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW0sIGZyb21SYW5nZXM6IHZzY29kZS5SYW5nZVtdKSB7XG5cdFx0dGhpcy5mcm9tUmFuZ2VzID0gZnJvbVJhbmdlcztcblx0XHR0aGlzLnRvID0gaXRlbTtcblx0fVxufVxuXG5leHBvcnQgZW51bSBMYW5ndWFnZVN0YXR1c1NldmVyaXR5IHtcblx0SW5mb3JtYXRpb24gPSAwLFxuXHRXYXJuaW5nID0gMSxcblx0RXJyb3IgPSAyXG59XG5cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgQ29kZUxlbnMge1xuXG5cdHJhbmdlOiBSYW5nZTtcblxuXHRjb21tYW5kOiB2c2NvZGUuQ29tbWFuZCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihyYW5nZTogUmFuZ2UsIGNvbW1hbmQ/OiB2c2NvZGUuQ29tbWFuZCkge1xuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLmNvbW1hbmQgPSBjb21tYW5kO1xuXHR9XG5cblx0Z2V0IGlzUmVzb2x2ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5jb21tYW5kO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFBhcmFtZXRlckluZm9ybWF0aW9uIHtcblxuXHRsYWJlbDogc3RyaW5nIHwgW251bWJlciwgbnVtYmVyXTtcblx0ZG9jdW1lbnRhdGlvbj86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblxuXHRjb25zdHJ1Y3RvcihsYWJlbDogc3RyaW5nIHwgW251bWJlciwgbnVtYmVyXSwgZG9jdW1lbnRhdGlvbj86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZykge1xuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLmRvY3VtZW50YXRpb24gPSBkb2N1bWVudGF0aW9uO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFNpZ25hdHVyZUluZm9ybWF0aW9uIHtcblxuXHRsYWJlbDogc3RyaW5nO1xuXHRkb2N1bWVudGF0aW9uPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHRwYXJhbWV0ZXJzOiBQYXJhbWV0ZXJJbmZvcm1hdGlvbltdO1xuXHRhY3RpdmVQYXJhbWV0ZXI/OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IobGFiZWw6IHN0cmluZywgZG9jdW1lbnRhdGlvbj86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZykge1xuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLmRvY3VtZW50YXRpb24gPSBkb2N1bWVudGF0aW9uO1xuXHRcdHRoaXMucGFyYW1ldGVycyA9IFtdO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFNpZ25hdHVyZUhlbHAge1xuXG5cdHNpZ25hdHVyZXM6IFNpZ25hdHVyZUluZm9ybWF0aW9uW107XG5cdGFjdGl2ZVNpZ25hdHVyZTogbnVtYmVyID0gMDtcblx0YWN0aXZlUGFyYW1ldGVyOiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuc2lnbmF0dXJlcyA9IFtdO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZCB7XG5cdEludm9rZSA9IDEsXG5cdFRyaWdnZXJDaGFyYWN0ZXIgPSAyLFxuXHRDb250ZW50Q2hhbmdlID0gMyxcbn1cblxuXG5leHBvcnQgZW51bSBJbmxheUhpbnRLaW5kIHtcblx0VHlwZSA9IDEsXG5cdFBhcmFtZXRlciA9IDIsXG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIElubGF5SGludExhYmVsUGFydCB7XG5cblx0dmFsdWU6IHN0cmluZztcblx0dG9vbHRpcD86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0bG9jYXRpb24/OiBMb2NhdGlvbjtcblx0Y29tbWFuZD86IHZzY29kZS5Db21tYW5kO1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgSW5sYXlIaW50IGltcGxlbWVudHMgdnNjb2RlLklubGF5SGludCB7XG5cblx0bGFiZWw6IHN0cmluZyB8IElubGF5SGludExhYmVsUGFydFtdO1xuXHR0b29sdGlwPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHRwb3NpdGlvbjogUG9zaXRpb247XG5cdHRleHRFZGl0cz86IFRleHRFZGl0W107XG5cdGtpbmQ/OiB2c2NvZGUuSW5sYXlIaW50S2luZDtcblx0cGFkZGluZ0xlZnQ/OiBib29sZWFuO1xuXHRwYWRkaW5nUmlnaHQ/OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKHBvc2l0aW9uOiBQb3NpdGlvbiwgbGFiZWw6IHN0cmluZyB8IElubGF5SGludExhYmVsUGFydFtdLCBraW5kPzogdnNjb2RlLklubGF5SGludEtpbmQpIHtcblx0XHR0aGlzLnBvc2l0aW9uID0gcG9zaXRpb247XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gQ29tcGxldGlvblRyaWdnZXJLaW5kIHtcblx0SW52b2tlID0gMCxcblx0VHJpZ2dlckNoYXJhY3RlciA9IDEsXG5cdFRyaWdnZXJGb3JJbmNvbXBsZXRlQ29tcGxldGlvbnMgPSAyXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tcGxldGlvbkNvbnRleHQge1xuXHRyZWFkb25seSB0cmlnZ2VyS2luZDogQ29tcGxldGlvblRyaWdnZXJLaW5kO1xuXHRyZWFkb25seSB0cmlnZ2VyQ2hhcmFjdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBlbnVtIENvbXBsZXRpb25JdGVtS2luZCB7XG5cdFRleHQgPSAwLFxuXHRNZXRob2QgPSAxLFxuXHRGdW5jdGlvbiA9IDIsXG5cdENvbnN0cnVjdG9yID0gMyxcblx0RmllbGQgPSA0LFxuXHRWYXJpYWJsZSA9IDUsXG5cdENsYXNzID0gNixcblx0SW50ZXJmYWNlID0gNyxcblx0TW9kdWxlID0gOCxcblx0UHJvcGVydHkgPSA5LFxuXHRVbml0ID0gMTAsXG5cdFZhbHVlID0gMTEsXG5cdEVudW0gPSAxMixcblx0S2V5d29yZCA9IDEzLFxuXHRTbmlwcGV0ID0gMTQsXG5cdENvbG9yID0gMTUsXG5cdEZpbGUgPSAxNixcblx0UmVmZXJlbmNlID0gMTcsXG5cdEZvbGRlciA9IDE4LFxuXHRFbnVtTWVtYmVyID0gMTksXG5cdENvbnN0YW50ID0gMjAsXG5cdFN0cnVjdCA9IDIxLFxuXHRFdmVudCA9IDIyLFxuXHRPcGVyYXRvciA9IDIzLFxuXHRUeXBlUGFyYW1ldGVyID0gMjQsXG5cdFVzZXIgPSAyNSxcblx0SXNzdWUgPSAyNlxufVxuXG5leHBvcnQgZW51bSBDb21wbGV0aW9uSXRlbVRhZyB7XG5cdERlcHJlY2F0ZWQgPSAxLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbXBsZXRpb25JdGVtTGFiZWwge1xuXHRsYWJlbDogc3RyaW5nO1xuXHRkZXRhaWw/OiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBDb21wbGV0aW9uSXRlbSBpbXBsZW1lbnRzIHZzY29kZS5Db21wbGV0aW9uSXRlbSB7XG5cblx0bGFiZWw6IHN0cmluZyB8IENvbXBsZXRpb25JdGVtTGFiZWw7XG5cdGtpbmQ/OiBDb21wbGV0aW9uSXRlbUtpbmQ7XG5cdHRhZ3M/OiBDb21wbGV0aW9uSXRlbVRhZ1tdO1xuXHRkZXRhaWw/OiBzdHJpbmc7XG5cdGRvY3VtZW50YXRpb24/OiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdHNvcnRUZXh0Pzogc3RyaW5nO1xuXHRmaWx0ZXJUZXh0Pzogc3RyaW5nO1xuXHRwcmVzZWxlY3Q/OiBib29sZWFuO1xuXHRpbnNlcnRUZXh0Pzogc3RyaW5nIHwgU25pcHBldFN0cmluZztcblx0a2VlcFdoaXRlc3BhY2U/OiBib29sZWFuO1xuXHRyYW5nZT86IFJhbmdlIHwgeyBpbnNlcnRpbmc6IFJhbmdlOyByZXBsYWNpbmc6IFJhbmdlIH07XG5cdGNvbW1pdENoYXJhY3RlcnM/OiBzdHJpbmdbXTtcblx0dGV4dEVkaXQ/OiBUZXh0RWRpdDtcblx0YWRkaXRpb25hbFRleHRFZGl0cz86IFRleHRFZGl0W107XG5cdGNvbW1hbmQ/OiB2c2NvZGUuQ29tbWFuZDtcblxuXHRjb25zdHJ1Y3RvcihsYWJlbDogc3RyaW5nIHwgQ29tcGxldGlvbkl0ZW1MYWJlbCwga2luZD86IENvbXBsZXRpb25JdGVtS2luZCkge1xuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLmtpbmQgPSBraW5kO1xuXHR9XG5cblx0dG9KU09OKCk6IGFueSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsLFxuXHRcdFx0a2luZDogdGhpcy5raW5kICYmIENvbXBsZXRpb25JdGVtS2luZFt0aGlzLmtpbmRdLFxuXHRcdFx0ZGV0YWlsOiB0aGlzLmRldGFpbCxcblx0XHRcdGRvY3VtZW50YXRpb246IHRoaXMuZG9jdW1lbnRhdGlvbixcblx0XHRcdHNvcnRUZXh0OiB0aGlzLnNvcnRUZXh0LFxuXHRcdFx0ZmlsdGVyVGV4dDogdGhpcy5maWx0ZXJUZXh0LFxuXHRcdFx0cHJlc2VsZWN0OiB0aGlzLnByZXNlbGVjdCxcblx0XHRcdGluc2VydFRleHQ6IHRoaXMuaW5zZXJ0VGV4dCxcblx0XHRcdHRleHRFZGl0OiB0aGlzLnRleHRFZGl0XG5cdFx0fTtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBDb21wbGV0aW9uTGlzdCB7XG5cblx0aXNJbmNvbXBsZXRlPzogYm9vbGVhbjtcblx0aXRlbXM6IHZzY29kZS5Db21wbGV0aW9uSXRlbVtdO1xuXG5cdGNvbnN0cnVjdG9yKGl0ZW1zOiB2c2NvZGUuQ29tcGxldGlvbkl0ZW1bXSA9IFtdLCBpc0luY29tcGxldGU6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdHRoaXMuaXRlbXMgPSBpdGVtcztcblx0XHR0aGlzLmlzSW5jb21wbGV0ZSA9IGlzSW5jb21wbGV0ZTtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBJbmxpbmVTdWdnZXN0aW9uIGltcGxlbWVudHMgdnNjb2RlLklubGluZUNvbXBsZXRpb25JdGVtIHtcblxuXHRmaWx0ZXJUZXh0Pzogc3RyaW5nO1xuXHRpbnNlcnRUZXh0OiBzdHJpbmc7XG5cdHJhbmdlPzogUmFuZ2U7XG5cdGNvbW1hbmQ/OiB2c2NvZGUuQ29tbWFuZDtcblxuXHRjb25zdHJ1Y3RvcihpbnNlcnRUZXh0OiBzdHJpbmcsIHJhbmdlPzogUmFuZ2UsIGNvbW1hbmQ/OiB2c2NvZGUuQ29tbWFuZCkge1xuXHRcdHRoaXMuaW5zZXJ0VGV4dCA9IGluc2VydFRleHQ7XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMuY29tbWFuZCA9IGNvbW1hbmQ7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgSW5saW5lU3VnZ2VzdGlvbkxpc3QgaW1wbGVtZW50cyB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkxpc3Qge1xuXHRpdGVtczogdnNjb2RlLklubGluZUNvbXBsZXRpb25JdGVtW107XG5cblx0Y29tbWFuZHM6ICh2c2NvZGUuQ29tbWFuZCB8IHsgY29tbWFuZDogdnNjb2RlLkNvbW1hbmQ7IGljb246IHZzY29kZS5UaGVtZUljb24gfSlbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRzdXBwcmVzc1N1Z2dlc3Rpb25zOiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGl0ZW1zOiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkl0ZW1bXSkge1xuXHRcdHRoaXMuaXRlbXMgPSBpdGVtcztcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnRpYWxBY2NlcHRJbmZvIHtcblx0a2luZDogUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kO1xuXHRhY2NlcHRlZExlbmd0aDogbnVtYmVyO1xufVxuXG5leHBvcnQgZW51bSBQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQge1xuXHRVbmtub3duID0gMCxcblx0V29yZCA9IDEsXG5cdExpbmUgPSAyLFxuXHRTdWdnZXN0ID0gMyxcbn1cblxuZXhwb3J0IGVudW0gSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQge1xuXHRBY2NlcHRlZCA9IDAsXG5cdFJlamVjdGVkID0gMSxcblx0SWdub3JlZCA9IDIsXG59XG5cbmV4cG9ydCBlbnVtIElubGluZUNvbXBsZXRpb25EaXNwbGF5TG9jYXRpb25LaW5kIHtcblx0Q29kZSA9IDEsXG5cdExhYmVsID0gMlxufVxuXG5leHBvcnQgZW51bSBWaWV3Q29sdW1uIHtcblx0QWN0aXZlID0gLTEsXG5cdEJlc2lkZSA9IC0yLFxuXHRPbmUgPSAxLFxuXHRUd28gPSAyLFxuXHRUaHJlZSA9IDMsXG5cdEZvdXIgPSA0LFxuXHRGaXZlID0gNSxcblx0U2l4ID0gNixcblx0U2V2ZW4gPSA3LFxuXHRFaWdodCA9IDgsXG5cdE5pbmUgPSA5XG59XG5cbmV4cG9ydCBlbnVtIFN0YXR1c0JhckFsaWdubWVudCB7XG5cdExlZnQgPSAxLFxuXHRSaWdodCA9IDJcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFzU3RhdHVzQmFySXRlbUlkZW50aWZpZXIoZXh0ZW5zaW9uOiBFeHRlbnNpb25JZGVudGlmaWVyLCBpZDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke0V4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uKX0uJHtpZH1gO1xufVxuXG5leHBvcnQgZW51bSBUZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZSB7XG5cdE9mZiA9IDAsXG5cdE9uID0gMSxcblx0UmVsYXRpdmUgPSAyLFxuXHRJbnRlcnZhbCA9IDNcbn1cblxuZXhwb3J0IGVudW0gVGV4dERvY3VtZW50U2F2ZVJlYXNvbiB7XG5cdE1hbnVhbCA9IDEsXG5cdEFmdGVyRGVsYXkgPSAyLFxuXHRGb2N1c091dCA9IDNcbn1cblxuZXhwb3J0IGVudW0gVGV4dEVkaXRvclJldmVhbFR5cGUge1xuXHREZWZhdWx0ID0gMCxcblx0SW5DZW50ZXIgPSAxLFxuXHRJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0ID0gMixcblx0QXRUb3AgPSAzXG59XG5cbmV4cG9ydCBlbnVtIFRleHRFZGl0b3JTZWxlY3Rpb25DaGFuZ2VLaW5kIHtcblx0S2V5Ym9hcmQgPSAxLFxuXHRNb3VzZSA9IDIsXG5cdENvbW1hbmQgPSAzXG59XG5cbmV4cG9ydCBlbnVtIFRleHRFZGl0b3JDaGFuZ2VLaW5kIHtcblx0QWRkaXRpb24gPSAxLFxuXHREZWxldGlvbiA9IDIsXG5cdE1vZGlmaWNhdGlvbiA9IDNcbn1cblxuZXhwb3J0IGVudW0gVGV4dERvY3VtZW50Q2hhbmdlUmVhc29uIHtcblx0VW5kbyA9IDEsXG5cdFJlZG8gPSAyLFxufVxuXG4vKipcbiAqIFRoZXNlIHZhbHVlcyBtYXRjaCB2ZXJ5IGNhcmVmdWxseSB0aGUgdmFsdWVzIG9mIGBUcmFja2VkUmFuZ2VTdGlja2luZXNzYFxuICovXG5leHBvcnQgZW51bSBEZWNvcmF0aW9uUmFuZ2VCZWhhdmlvciB7XG5cdC8qKlxuXHQgKiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXNcblx0ICovXG5cdE9wZW5PcGVuID0gMCxcblx0LyoqXG5cdCAqIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzXG5cdCAqL1xuXHRDbG9zZWRDbG9zZWQgPSAxLFxuXHQvKipcblx0ICogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlXG5cdCAqL1xuXHRPcGVuQ2xvc2VkID0gMixcblx0LyoqXG5cdCAqIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyXG5cdCAqL1xuXHRDbG9zZWRPcGVuID0gM1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRleHRFZGl0b3JTZWxlY3Rpb25DaGFuZ2VLaW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21WYWx1ZShzOiBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlIHwgc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0c3dpdGNoIChzKSB7XG5cdFx0XHRjYXNlICdrZXlib2FyZCc6IHJldHVybiBUZXh0RWRpdG9yU2VsZWN0aW9uQ2hhbmdlS2luZC5LZXlib2FyZDtcblx0XHRcdGNhc2UgJ21vdXNlJzogcmV0dXJuIFRleHRFZGl0b3JTZWxlY3Rpb25DaGFuZ2VLaW5kLk1vdXNlO1xuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlLlBST0dSQU1NQVRJQzpcblx0XHRcdGNhc2UgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZS5KVU1QOlxuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlLk5BVklHQVRJT046XG5cdFx0XHRcdHJldHVybiBUZXh0RWRpdG9yU2VsZWN0aW9uQ2hhbmdlS2luZC5Db21tYW5kO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFN5bnRheFRva2VuVHlwZSB7XG5cdE90aGVyID0gMCxcblx0Q29tbWVudCA9IDEsXG5cdFN0cmluZyA9IDIsXG5cdFJlZ0V4ID0gM1xufVxuZXhwb3J0IG5hbWVzcGFjZSBTeW50YXhUb2tlblR5cGUge1xuXHRleHBvcnQgZnVuY3Rpb24gdG9TdHJpbmcodjogU3ludGF4VG9rZW5UeXBlIHwgdW5rbm93bik6ICdvdGhlcicgfCAnY29tbWVudCcgfCAnc3RyaW5nJyB8ICdyZWdleCcge1xuXHRcdHN3aXRjaCAodikge1xuXHRcdFx0Y2FzZSBTeW50YXhUb2tlblR5cGUuT3RoZXI6IHJldHVybiAnb3RoZXInO1xuXHRcdFx0Y2FzZSBTeW50YXhUb2tlblR5cGUuQ29tbWVudDogcmV0dXJuICdjb21tZW50Jztcblx0XHRcdGNhc2UgU3ludGF4VG9rZW5UeXBlLlN0cmluZzogcmV0dXJuICdzdHJpbmcnO1xuXHRcdFx0Y2FzZSBTeW50YXhUb2tlblR5cGUuUmVnRXg6IHJldHVybiAncmVnZXgnO1xuXHRcdH1cblx0XHRyZXR1cm4gJ290aGVyJztcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBEb2N1bWVudExpbmsge1xuXG5cdHJhbmdlOiBSYW5nZTtcblxuXHR0YXJnZXQ/OiBVUkk7XG5cblx0dG9vbHRpcD86IHN0cmluZztcblxuXHRjb25zdHJ1Y3RvcihyYW5nZTogUmFuZ2UsIHRhcmdldDogVVJJIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRhcmdldCAmJiAhKFVSSS5pc1VyaSh0YXJnZXQpKSkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCd0YXJnZXQnKTtcblx0XHR9XG5cdFx0aWYgKCFSYW5nZS5pc1JhbmdlKHJhbmdlKSB8fCByYW5nZS5pc0VtcHR5KSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3JhbmdlJyk7XG5cdFx0fVxuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLnRhcmdldCA9IHRhcmdldDtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBDb2xvciB7XG5cdHJlYWRvbmx5IHJlZDogbnVtYmVyO1xuXHRyZWFkb25seSBncmVlbjogbnVtYmVyO1xuXHRyZWFkb25seSBibHVlOiBudW1iZXI7XG5cdHJlYWRvbmx5IGFscGhhOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IocmVkOiBudW1iZXIsIGdyZWVuOiBudW1iZXIsIGJsdWU6IG51bWJlciwgYWxwaGE6IG51bWJlcikge1xuXHRcdHRoaXMucmVkID0gcmVkO1xuXHRcdHRoaXMuZ3JlZW4gPSBncmVlbjtcblx0XHR0aGlzLmJsdWUgPSBibHVlO1xuXHRcdHRoaXMuYWxwaGEgPSBhbHBoYTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBJQ29sb3JGb3JtYXQgPSBzdHJpbmcgfCB7IG9wYXF1ZTogc3RyaW5nOyB0cmFuc3BhcmVudDogc3RyaW5nIH07XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIENvbG9ySW5mb3JtYXRpb24ge1xuXHRyYW5nZTogUmFuZ2U7XG5cblx0Y29sb3I6IENvbG9yO1xuXG5cdGNvbnN0cnVjdG9yKHJhbmdlOiBSYW5nZSwgY29sb3I6IENvbG9yKSB7XG5cdFx0aWYgKGNvbG9yICYmICEoY29sb3IgaW5zdGFuY2VvZiBDb2xvcikpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnY29sb3InKTtcblx0XHR9XG5cdFx0aWYgKCFSYW5nZS5pc1JhbmdlKHJhbmdlKSB8fCByYW5nZS5pc0VtcHR5KSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3JhbmdlJyk7XG5cdFx0fVxuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLmNvbG9yID0gY29sb3I7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgQ29sb3JQcmVzZW50YXRpb24ge1xuXHRsYWJlbDogc3RyaW5nO1xuXHR0ZXh0RWRpdD86IFRleHRFZGl0O1xuXHRhZGRpdGlvbmFsVGV4dEVkaXRzPzogVGV4dEVkaXRbXTtcblxuXHRjb25zdHJ1Y3RvcihsYWJlbDogc3RyaW5nKSB7XG5cdFx0aWYgKCFsYWJlbCB8fCB0eXBlb2YgbGFiZWwgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2xhYmVsJyk7XG5cdFx0fVxuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcblx0fVxufVxuXG5leHBvcnQgZW51bSBDb2xvckZvcm1hdCB7XG5cdFJHQiA9IDAsXG5cdEhFWCA9IDEsXG5cdEhTTCA9IDJcbn1cblxuZXhwb3J0IGVudW0gU291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGUge1xuXHRFcnJvciA9IDAsXG5cdFdhcm5pbmcgPSAxLFxuXHRJbmZvcm1hdGlvbiA9IDJcbn1cblxuZXhwb3J0IGVudW0gVGVybWluYWxFeGl0UmVhc29uIHtcblx0VW5rbm93biA9IDAsXG5cdFNodXRkb3duID0gMSxcblx0UHJvY2VzcyA9IDIsXG5cdFVzZXIgPSAzLFxuXHRFeHRlbnNpb24gPSA0XG59XG5cbmV4cG9ydCBlbnVtIFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZUNvbmZpZGVuY2Uge1xuXHRMb3cgPSAwLFxuXHRNZWRpdW0gPSAxLFxuXHRIaWdoID0gMlxufVxuXG5leHBvcnQgZW51bSBUZXJtaW5hbFNoZWxsVHlwZSB7XG5cdFNoID0gMSxcblx0QmFzaCA9IDIsXG5cdEZpc2ggPSAzLFxuXHRDc2ggPSA0LFxuXHRLc2ggPSA1LFxuXHRac2ggPSA2LFxuXHRDb21tYW5kUHJvbXB0ID0gNyxcblx0R2l0QmFzaCA9IDgsXG5cdFBvd2VyU2hlbGwgPSA5LFxuXHRQeXRob24gPSAxMCxcblx0SnVsaWEgPSAxMSxcblx0TnVTaGVsbCA9IDEyLFxuXHROb2RlID0gMTMsXG5cdFhvbnNoID0gMTRcbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsTGluayBpbXBsZW1lbnRzIHZzY29kZS5UZXJtaW5hbExpbmsge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgc3RhcnRJbmRleDogbnVtYmVyLFxuXHRcdHB1YmxpYyBsZW5ndGg6IG51bWJlcixcblx0XHRwdWJsaWMgdG9vbHRpcD86IHN0cmluZ1xuXHQpIHtcblx0XHRpZiAodHlwZW9mIHN0YXJ0SW5kZXggIT09ICdudW1iZXInIHx8IHN0YXJ0SW5kZXggPCAwKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3N0YXJ0SW5kZXgnKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBsZW5ndGggIT09ICdudW1iZXInIHx8IGxlbmd0aCA8IDEpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnbGVuZ3RoJyk7XG5cdFx0fVxuXHRcdGlmICh0b29sdGlwICE9PSB1bmRlZmluZWQgJiYgdHlwZW9mIHRvb2x0aXAgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3Rvb2x0aXAnKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsUXVpY2tGaXhPcGVuZXIge1xuXHR1cmk6IHZzY29kZS5Vcmk7XG5cdGNvbnN0cnVjdG9yKHVyaTogdnNjb2RlLlVyaSkge1xuXHRcdHRoaXMudXJpID0gdXJpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFF1aWNrRml4Q29tbWFuZCB7XG5cdHRlcm1pbmFsQ29tbWFuZDogc3RyaW5nO1xuXHRjb25zdHJ1Y3Rvcih0ZXJtaW5hbENvbW1hbmQ6IHN0cmluZykge1xuXHRcdHRoaXMudGVybWluYWxDb21tYW5kID0gdGVybWluYWxDb21tYW5kO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFRlcm1pbmFsTG9jYXRpb24ge1xuXHRQYW5lbCA9IDEsXG5cdEVkaXRvciA9IDIsXG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFByb2ZpbGUgaW1wbGVtZW50cyB2c2NvZGUuVGVybWluYWxQcm9maWxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIG9wdGlvbnM6IHZzY29kZS5UZXJtaW5hbE9wdGlvbnMgfCB2c2NvZGUuRXh0ZW5zaW9uVGVybWluYWxPcHRpb25zXG5cdCkge1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnb3B0aW9ucycpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZW51bSBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZCB7XG5cdEZpbGUgPSAwLFxuXHRGb2xkZXIgPSAxLFxuXHRNZXRob2QgPSAyLFxuXHRBbGlhcyA9IDMsXG5cdEFyZ3VtZW50ID0gNCxcblx0T3B0aW9uID0gNSxcblx0T3B0aW9uVmFsdWUgPSA2LFxuXHRGbGFnID0gNyxcblx0U3ltYm9saWNMaW5rRmlsZSA9IDgsXG5cdFN5bWJvbGljTGlua0ZvbGRlciA9IDksXG5cdFNjbUNvbW1pdCA9IDEwLFxuXHRTY21CcmFuY2ggPSAxMSxcblx0U2NtVGFnID0gMTIsXG5cdFNjbVN0YXNoID0gMTMsXG5cdFNjbVJlbW90ZSA9IDE0LFxuXHRQdWxsUmVxdWVzdCA9IDE1LFxuXHRQdWxsUmVxdWVzdERvbmUgPSAxNixcbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsQ29tcGxldGlvbkl0ZW0gaW1wbGVtZW50cyB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uSXRlbSB7XG5cdGxhYmVsOiBzdHJpbmcgfCBDb21wbGV0aW9uSXRlbUxhYmVsO1xuXHRyZXBsYWNlbWVudFJhbmdlOiByZWFkb25seSBbbnVtYmVyLCBudW1iZXJdO1xuXHRkZXRhaWw/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGRvY3VtZW50YXRpb24/OiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGtpbmQ/OiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZCB8IHVuZGVmaW5lZDtcblx0aXNGaWxlPzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0aXNEaXJlY3Rvcnk/OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRpc0tleXdvcmQ/OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGxhYmVsOiBzdHJpbmcgfCBDb21wbGV0aW9uSXRlbUxhYmVsLCByZXBsYWNlbWVudFJhbmdlOiByZWFkb25seSBbbnVtYmVyLCBudW1iZXJdLCBraW5kPzogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQsIGRldGFpbD86IHN0cmluZywgZG9jdW1lbnRhdGlvbj86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZywgaXNGaWxlPzogYm9vbGVhbiwgaXNEaXJlY3Rvcnk/OiBib29sZWFuLCBpc0tleXdvcmQ/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMucmVwbGFjZW1lbnRSYW5nZSA9IHJlcGxhY2VtZW50UmFuZ2U7XG5cdFx0dGhpcy5raW5kID0ga2luZDtcblx0XHR0aGlzLmRldGFpbCA9IGRldGFpbDtcblx0XHR0aGlzLmRvY3VtZW50YXRpb24gPSBkb2N1bWVudGF0aW9uO1xuXHRcdHRoaXMuaXNGaWxlID0gaXNGaWxlO1xuXHRcdHRoaXMuaXNEaXJlY3RvcnkgPSBpc0RpcmVjdG9yeTtcblx0XHR0aGlzLmlzS2V5d29yZCA9IGlzS2V5d29yZDtcblx0fVxufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBjb2xsZWN0aW9uIG9mIHtAbGluayBDb21wbGV0aW9uSXRlbSBjb21wbGV0aW9uIGl0ZW1zfSB0byBiZSBwcmVzZW50ZWRcbiAqIGluIHRoZSBlZGl0b3IuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbENvbXBsZXRpb25MaXN0PFQgZXh0ZW5kcyBUZXJtaW5hbENvbXBsZXRpb25JdGVtID0gVGVybWluYWxDb21wbGV0aW9uSXRlbT4ge1xuXG5cdC8qKlxuXHQgKiBSZXNvdXJjZXMgc2hvdWxkIGJlIHNob3duIGluIHRoZSBjb21wbGV0aW9ucyBsaXN0XG5cdCAqL1xuXHRyZXNvdXJjZU9wdGlvbnM/OiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIFRoZSBjb21wbGV0aW9uIGl0ZW1zLlxuXHQgKi9cblx0aXRlbXM6IFRbXTtcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBjb21wbGV0aW9uIGxpc3QuXG5cdCAqXG5cdCAqIEBwYXJhbSBpdGVtcyBUaGUgY29tcGxldGlvbiBpdGVtcy5cblx0ICogQHBhcmFtIGlzSW5jb21wbGV0ZSBUaGUgbGlzdCBpcyBub3QgY29tcGxldGUuXG5cdCAqL1xuXHRjb25zdHJ1Y3RvcihpdGVtcz86IFRbXSwgcmVzb3VyY2VPcHRpb25zPzogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zKSB7XG5cdFx0dGhpcy5pdGVtcyA9IGl0ZW1zID8/IFtdO1xuXHRcdHRoaXMucmVzb3VyY2VPcHRpb25zID0gcmVzb3VyY2VPcHRpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zIHtcblx0c2hvd0ZpbGVzPzogYm9vbGVhbjtcblx0c2hvd0RpcmVjdG9yaWVzPzogYm9vbGVhbjtcblx0ZmlsZUV4dGVuc2lvbnM/OiBzdHJpbmdbXTtcblx0Y3dkPzogdnNjb2RlLlVyaTtcbn1cblxuZXhwb3J0IGVudW0gVGFza1JldmVhbEtpbmQge1xuXHRBbHdheXMgPSAxLFxuXG5cdFNpbGVudCA9IDIsXG5cblx0TmV2ZXIgPSAzXG59XG5cbmV4cG9ydCBlbnVtIFRhc2tFdmVudEtpbmQge1xuXHQvKiogSW5kaWNhdGVzIGEgdGFzaydzIHByb3BlcnRpZXMgb3IgY29uZmlndXJhdGlvbiBoYXZlIGNoYW5nZWQgKi9cblx0Q2hhbmdlZCA9ICdjaGFuZ2VkJyxcblxuXHQvKiogSW5kaWNhdGVzIGEgdGFzayBoYXMgYmVndW4gZXhlY3V0aW5nICovXG5cdFByb2Nlc3NTdGFydGVkID0gJ3Byb2Nlc3NTdGFydGVkJyxcblxuXHQvKiogSW5kaWNhdGVzIGEgdGFzayBwcm9jZXNzIGhhcyBjb21wbGV0ZWQgKi9cblx0UHJvY2Vzc0VuZGVkID0gJ3Byb2Nlc3NFbmRlZCcsXG5cblx0LyoqIEluZGljYXRlcyBhIHRhc2sgd2FzIHRlcm1pbmF0ZWQsIGVpdGhlciBieSB1c2VyIGFjdGlvbiBvciBieSB0aGUgc3lzdGVtICovXG5cdFRlcm1pbmF0ZWQgPSAndGVybWluYXRlZCcsXG5cblx0LyoqIEluZGljYXRlcyBhIHRhc2sgaGFzIHN0YXJ0ZWQgcnVubmluZyAqL1xuXHRTdGFydCA9ICdzdGFydCcsXG5cblx0LyoqIEluZGljYXRlcyBhIHRhc2sgaGFzIGFjcXVpcmVkIGFsbCBuZWVkZWQgaW5wdXQvdmFyaWFibGVzIHRvIGV4ZWN1dGUgKi9cblx0QWNxdWlyZWRJbnB1dCA9ICdhY3F1aXJlZElucHV0JyxcblxuXHQvKiogSW5kaWNhdGVzIGEgZGVwZW5kZW50IHRhc2sgaGFzIHN0YXJ0ZWQgKi9cblx0RGVwZW5kc09uU3RhcnRlZCA9ICdkZXBlbmRzT25TdGFydGVkJyxcblxuXHQvKiogSW5kaWNhdGVzIGEgdGFzayBpcyBhY3RpdmVseSBydW5uaW5nL3Byb2Nlc3NpbmcgKi9cblx0QWN0aXZlID0gJ2FjdGl2ZScsXG5cblx0LyoqIEluZGljYXRlcyBhIHRhc2sgaXMgcGF1c2VkL3dhaXRpbmcgYnV0IG5vdCBjb21wbGV0ZSAqL1xuXHRJbmFjdGl2ZSA9ICdpbmFjdGl2ZScsXG5cblx0LyoqIEluZGljYXRlcyBhIHRhc2sgaGFzIGNvbXBsZXRlZCBmdWxseSAqL1xuXHRFbmQgPSAnZW5kJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoZSB0YXNrJ3MgcHJvYmxlbSBtYXRjaGVyIGhhcyBzdGFydGVkICovXG5cdFByb2JsZW1NYXRjaGVyU3RhcnRlZCA9ICdwcm9ibGVtTWF0Y2hlclN0YXJ0ZWQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgdGhlIHRhc2sncyBwcm9ibGVtIG1hdGNoZXIgaGFzIGVuZGVkIHdpdGhvdXQgZXJyb3JzICovXG5cdFByb2JsZW1NYXRjaGVyRW5kZWQgPSAncHJvYmxlbU1hdGNoZXJFbmRlZCcsXG5cblx0LyoqIEluZGljYXRlcyB0aGUgdGFzaydzIHByb2JsZW0gbWF0Y2hlciBoYXMgZW5kZWQgd2l0aCBlcnJvcnMgKi9cblx0UHJvYmxlbU1hdGNoZXJGb3VuZEVycm9ycyA9ICdwcm9ibGVtTWF0Y2hlckZvdW5kRXJyb3JzJ1xufVxuXG5cbmV4cG9ydCBlbnVtIFRhc2tQYW5lbEtpbmQge1xuXHRTaGFyZWQgPSAxLFxuXG5cdERlZGljYXRlZCA9IDIsXG5cblx0TmV3ID0gM1xufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBUYXNrR3JvdXAgaW1wbGVtZW50cyB2c2NvZGUuVGFza0dyb3VwIHtcblxuXHRpc0RlZmF1bHQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lkOiBzdHJpbmc7XG5cblx0cHVibGljIHN0YXRpYyBDbGVhbjogVGFza0dyb3VwID0gbmV3IFRhc2tHcm91cCgnY2xlYW4nLCAnQ2xlYW4nKTtcblxuXHRwdWJsaWMgc3RhdGljIEJ1aWxkOiBUYXNrR3JvdXAgPSBuZXcgVGFza0dyb3VwKCdidWlsZCcsICdCdWlsZCcpO1xuXG5cdHB1YmxpYyBzdGF0aWMgUmVidWlsZDogVGFza0dyb3VwID0gbmV3IFRhc2tHcm91cCgncmVidWlsZCcsICdSZWJ1aWxkJyk7XG5cblx0cHVibGljIHN0YXRpYyBUZXN0OiBUYXNrR3JvdXAgPSBuZXcgVGFza0dyb3VwKCd0ZXN0JywgJ1Rlc3QnKTtcblxuXHRwdWJsaWMgc3RhdGljIGZyb20odmFsdWU6IHN0cmluZykge1xuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgJ2NsZWFuJzpcblx0XHRcdFx0cmV0dXJuIFRhc2tHcm91cC5DbGVhbjtcblx0XHRcdGNhc2UgJ2J1aWxkJzpcblx0XHRcdFx0cmV0dXJuIFRhc2tHcm91cC5CdWlsZDtcblx0XHRcdGNhc2UgJ3JlYnVpbGQnOlxuXHRcdFx0XHRyZXR1cm4gVGFza0dyb3VwLlJlYnVpbGQ7XG5cdFx0XHRjYXNlICd0ZXN0Jzpcblx0XHRcdFx0cmV0dXJuIFRhc2tHcm91cC5UZXN0O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZykge1xuXHRcdGlmICh0eXBlb2YgaWQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ25hbWUnKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBsYWJlbCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnbmFtZScpO1xuXHRcdH1cblx0XHR0aGlzLl9pZCA9IGlkO1xuXHR9XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2lkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVUYXNrRXhlY3V0aW9uSWQodmFsdWVzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdGxldCBpZDogc3RyaW5nID0gJyc7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWQgKz0gdmFsdWVzW2ldLnJlcGxhY2UoLywvZywgJywsJykgKyAnLCc7XG5cdH1cblx0cmV0dXJuIGlkO1xufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBQcm9jZXNzRXhlY3V0aW9uIGltcGxlbWVudHMgdnNjb2RlLlByb2Nlc3NFeGVjdXRpb24ge1xuXG5cdHByaXZhdGUgX3Byb2Nlc3M6IHN0cmluZztcblx0cHJpdmF0ZSBfYXJnczogc3RyaW5nW107XG5cdHByaXZhdGUgX29wdGlvbnM6IHZzY29kZS5Qcm9jZXNzRXhlY3V0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcm9jZXNzOiBzdHJpbmcsIG9wdGlvbnM/OiB2c2NvZGUuUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnMpO1xuXHRjb25zdHJ1Y3Rvcihwcm9jZXNzOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdLCBvcHRpb25zPzogdnNjb2RlLlByb2Nlc3NFeGVjdXRpb25PcHRpb25zKTtcblx0Y29uc3RydWN0b3IocHJvY2Vzczogc3RyaW5nLCB2YXJnMT86IHN0cmluZ1tdIHwgdnNjb2RlLlByb2Nlc3NFeGVjdXRpb25PcHRpb25zLCB2YXJnMj86IHZzY29kZS5Qcm9jZXNzRXhlY3V0aW9uT3B0aW9ucykge1xuXHRcdGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgncHJvY2VzcycpO1xuXHRcdH1cblx0XHR0aGlzLl9hcmdzID0gW107XG5cdFx0dGhpcy5fcHJvY2VzcyA9IHByb2Nlc3M7XG5cdFx0aWYgKHZhcmcxICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhcmcxKSkge1xuXHRcdFx0XHR0aGlzLl9hcmdzID0gdmFyZzE7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMgPSB2YXJnMjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMgPSB2YXJnMTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cdGdldCBwcm9jZXNzKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2Nlc3M7XG5cdH1cblxuXHRzZXQgcHJvY2Vzcyh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgncHJvY2VzcycpO1xuXHRcdH1cblx0XHR0aGlzLl9wcm9jZXNzID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgYXJncygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2FyZ3M7XG5cdH1cblxuXHRzZXQgYXJncyh2YWx1ZTogc3RyaW5nW10pIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHR2YWx1ZSA9IFtdO1xuXHRcdH1cblx0XHR0aGlzLl9hcmdzID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgb3B0aW9ucygpOiB2c2NvZGUuUHJvY2Vzc0V4ZWN1dGlvbk9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zO1xuXHR9XG5cblx0c2V0IG9wdGlvbnModmFsdWU6IHZzY29kZS5Qcm9jZXNzRXhlY3V0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX29wdGlvbnMgPSB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlSWQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcm9wczogc3RyaW5nW10gPSBbXTtcblx0XHRwcm9wcy5wdXNoKCdwcm9jZXNzJyk7XG5cdFx0aWYgKHRoaXMuX3Byb2Nlc3MgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cHJvcHMucHVzaCh0aGlzLl9wcm9jZXNzKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FyZ3MgJiYgdGhpcy5fYXJncy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFyZyBvZiB0aGlzLl9hcmdzKSB7XG5cdFx0XHRcdHByb3BzLnB1c2goYXJnKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbXB1dGVUYXNrRXhlY3V0aW9uSWQocHJvcHMpO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFNoZWxsRXhlY3V0aW9uIGltcGxlbWVudHMgdnNjb2RlLlNoZWxsRXhlY3V0aW9uIHtcblxuXHRwcml2YXRlIF9jb21tYW5kTGluZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb21tYW5kOiBzdHJpbmcgfCB2c2NvZGUuU2hlbGxRdW90ZWRTdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FyZ3M6IChzdHJpbmcgfCB2c2NvZGUuU2hlbGxRdW90ZWRTdHJpbmcpW10gPSBbXTtcblx0cHJpdmF0ZSBfb3B0aW9uczogdnNjb2RlLlNoZWxsRXhlY3V0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihjb21tYW5kTGluZTogc3RyaW5nLCBvcHRpb25zPzogdnNjb2RlLlNoZWxsRXhlY3V0aW9uT3B0aW9ucyk7XG5cdGNvbnN0cnVjdG9yKGNvbW1hbmQ6IHN0cmluZyB8IHZzY29kZS5TaGVsbFF1b3RlZFN0cmluZywgYXJnczogKHN0cmluZyB8IHZzY29kZS5TaGVsbFF1b3RlZFN0cmluZylbXSwgb3B0aW9ucz86IHZzY29kZS5TaGVsbEV4ZWN1dGlvbk9wdGlvbnMpO1xuXHRjb25zdHJ1Y3RvcihhcmcwOiBzdHJpbmcgfCB2c2NvZGUuU2hlbGxRdW90ZWRTdHJpbmcsIGFyZzE/OiB2c2NvZGUuU2hlbGxFeGVjdXRpb25PcHRpb25zIHwgKHN0cmluZyB8IHZzY29kZS5TaGVsbFF1b3RlZFN0cmluZylbXSwgYXJnMj86IHZzY29kZS5TaGVsbEV4ZWN1dGlvbk9wdGlvbnMpIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShhcmcxKSkge1xuXHRcdFx0aWYgKCFhcmcwKSB7XG5cdFx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnY29tbWFuZCBjYW5cXCd0IGJlIHVuZGVmaW5lZCBvciBudWxsJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGFyZzAgIT09ICdzdHJpbmcnICYmIHR5cGVvZiBhcmcwLnZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2NvbW1hbmQnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbW1hbmQgPSBhcmcwO1xuXHRcdFx0aWYgKGFyZzEpIHtcblx0XHRcdFx0dGhpcy5fYXJncyA9IGFyZzE7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vcHRpb25zID0gYXJnMjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHR5cGVvZiBhcmcwICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2NvbW1hbmRMaW5lJyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb21tYW5kTGluZSA9IGFyZzA7XG5cdFx0XHR0aGlzLl9vcHRpb25zID0gYXJnMTtcblx0XHR9XG5cdH1cblxuXHRnZXQgY29tbWFuZExpbmUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tbWFuZExpbmU7XG5cdH1cblxuXHRzZXQgY29tbWFuZExpbmUodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2NvbW1hbmRMaW5lJyk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbW1hbmRMaW5lID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgY29tbWFuZCgpOiBzdHJpbmcgfCB2c2NvZGUuU2hlbGxRdW90ZWRTdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9jb21tYW5kID8gdGhpcy5fY29tbWFuZCA6ICcnO1xuXHR9XG5cblx0c2V0IGNvbW1hbmQodmFsdWU6IHN0cmluZyB8IHZzY29kZS5TaGVsbFF1b3RlZFN0cmluZykge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnICYmIHR5cGVvZiB2YWx1ZS52YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnY29tbWFuZCcpO1xuXHRcdH1cblx0XHR0aGlzLl9jb21tYW5kID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgYXJncygpOiAoc3RyaW5nIHwgdnNjb2RlLlNoZWxsUXVvdGVkU3RyaW5nKVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fYXJncztcblx0fVxuXG5cdHNldCBhcmdzKHZhbHVlOiAoc3RyaW5nIHwgdnNjb2RlLlNoZWxsUXVvdGVkU3RyaW5nKVtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fYXJncyA9IHZhbHVlIHx8IFtdO1xuXHR9XG5cblx0Z2V0IG9wdGlvbnMoKTogdnNjb2RlLlNoZWxsRXhlY3V0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbnM7XG5cdH1cblxuXHRzZXQgb3B0aW9ucyh2YWx1ZTogdnNjb2RlLlNoZWxsRXhlY3V0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX29wdGlvbnMgPSB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlSWQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBwcm9wczogc3RyaW5nW10gPSBbXTtcblx0XHRwcm9wcy5wdXNoKCdzaGVsbCcpO1xuXHRcdGlmICh0aGlzLl9jb21tYW5kTGluZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRwcm9wcy5wdXNoKHRoaXMuX2NvbW1hbmRMaW5lKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbW1hbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cHJvcHMucHVzaCh0eXBlb2YgdGhpcy5fY29tbWFuZCA9PT0gJ3N0cmluZycgPyB0aGlzLl9jb21tYW5kIDogdGhpcy5fY29tbWFuZC52YWx1ZSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hcmdzICYmIHRoaXMuX2FyZ3MubGVuZ3RoID4gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBhcmcgb2YgdGhpcy5fYXJncykge1xuXHRcdFx0XHRwcm9wcy5wdXNoKHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnID8gYXJnIDogYXJnLnZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGNvbXB1dGVUYXNrRXhlY3V0aW9uSWQocHJvcHMpO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFNoZWxsUXVvdGluZyB7XG5cdEVzY2FwZSA9IDEsXG5cdFN0cm9uZyA9IDIsXG5cdFdlYWsgPSAzXG59XG5cbmV4cG9ydCBlbnVtIFRhc2tTY29wZSB7XG5cdEdsb2JhbCA9IDEsXG5cdFdvcmtzcGFjZSA9IDJcbn1cblxuZXhwb3J0IGVudW0gVGFza1J1bk9uIHtcblx0RGVmYXVsdCA9IDEsXG5cdEZvbGRlck9wZW4gPSAyLFxuXHRXb3JrdHJlZUNyZWF0ZWQgPSAzLFxufVxuXG5leHBvcnQgY2xhc3MgQ3VzdG9tRXhlY3V0aW9uIGltcGxlbWVudHMgdnNjb2RlLkN1c3RvbUV4ZWN1dGlvbiB7XG5cdHByaXZhdGUgX2NhbGxiYWNrOiAocmVzb2x2ZWREZWZpbml0aW9uOiB2c2NvZGUuVGFza0RlZmluaXRpb24pID0+IFRoZW5hYmxlPHZzY29kZS5Qc2V1ZG90ZXJtaW5hbD47XG5cdGNvbnN0cnVjdG9yKGNhbGxiYWNrOiAocmVzb2x2ZWREZWZpbml0aW9uOiB2c2NvZGUuVGFza0RlZmluaXRpb24pID0+IFRoZW5hYmxlPHZzY29kZS5Qc2V1ZG90ZXJtaW5hbD4pIHtcblx0XHR0aGlzLl9jYWxsYmFjayA9IGNhbGxiYWNrO1xuXHR9XG5cdHB1YmxpYyBjb21wdXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ2N1c3RvbUV4ZWN1dGlvbicgKyBnZW5lcmF0ZVV1aWQoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgY2FsbGJhY2sodmFsdWU6IChyZXNvbHZlZERlZmluaXRpb246IHZzY29kZS5UYXNrRGVmaW5pdGlvbikgPT4gVGhlbmFibGU8dnNjb2RlLlBzZXVkb3Rlcm1pbmFsPikge1xuXHRcdHRoaXMuX2NhbGxiYWNrID0gdmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNhbGxiYWNrKCk6ICgocmVzb2x2ZWREZWZpbml0aW9uOiB2c2NvZGUuVGFza0RlZmluaXRpb24pID0+IFRoZW5hYmxlPHZzY29kZS5Qc2V1ZG90ZXJtaW5hbD4pIHtcblx0XHRyZXR1cm4gdGhpcy5fY2FsbGJhY2s7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgVGFzayBpbXBsZW1lbnRzIHZzY29kZS5UYXNrIHtcblxuXHRwcml2YXRlIHN0YXRpYyBFeHRlbnNpb25DYWxsYmFja1R5cGU6IHN0cmluZyA9ICdjdXN0b21FeGVjdXRpb24nO1xuXHRwcml2YXRlIHN0YXRpYyBQcm9jZXNzVHlwZTogc3RyaW5nID0gJ3Byb2Nlc3MnO1xuXHRwcml2YXRlIHN0YXRpYyBTaGVsbFR5cGU6IHN0cmluZyA9ICdzaGVsbCc7XG5cdHByaXZhdGUgc3RhdGljIEVtcHR5VHlwZTogc3RyaW5nID0gJyRlbXB0eSc7XG5cblx0cHJpdmF0ZSBfX2lkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX19kZXByZWNhdGVkOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBfZGVmaW5pdGlvbjogdnNjb2RlLlRhc2tEZWZpbml0aW9uO1xuXHRwcml2YXRlIF9zY29wZTogdnNjb2RlLlRhc2tTY29wZS5HbG9iYWwgfCB2c2NvZGUuVGFza1Njb3BlLldvcmtzcGFjZSB8IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX25hbWU6IHN0cmluZztcblx0cHJpdmF0ZSBfZXhlY3V0aW9uOiBQcm9jZXNzRXhlY3V0aW9uIHwgU2hlbGxFeGVjdXRpb24gfCBDdXN0b21FeGVjdXRpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Byb2JsZW1NYXRjaGVyczogc3RyaW5nW107XG5cdHByaXZhdGUgX2hhc0RlZmluZWRNYXRjaGVyczogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaXNCYWNrZ3JvdW5kOiBib29sZWFuO1xuXHRwcml2YXRlIF9zb3VyY2U6IHN0cmluZztcblx0cHJpdmF0ZSBfZ3JvdXA6IFRhc2tHcm91cCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJlc2VudGF0aW9uT3B0aW9uczogdnNjb2RlLlRhc2tQcmVzZW50YXRpb25PcHRpb25zO1xuXHRwcml2YXRlIF9ydW5PcHRpb25zOiB2c2NvZGUuUnVuT3B0aW9ucztcblx0cHJpdmF0ZSBfZGV0YWlsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoZGVmaW5pdGlvbjogdnNjb2RlLlRhc2tEZWZpbml0aW9uLCBuYW1lOiBzdHJpbmcsIHNvdXJjZTogc3RyaW5nLCBleGVjdXRpb24/OiBQcm9jZXNzRXhlY3V0aW9uIHwgU2hlbGxFeGVjdXRpb24gfCBDdXN0b21FeGVjdXRpb24sIHByb2JsZW1NYXRjaGVycz86IHN0cmluZyB8IHN0cmluZ1tdKTtcblx0Y29uc3RydWN0b3IoZGVmaW5pdGlvbjogdnNjb2RlLlRhc2tEZWZpbml0aW9uLCBzY29wZTogdnNjb2RlLlRhc2tTY29wZS5HbG9iYWwgfCB2c2NvZGUuVGFza1Njb3BlLldvcmtzcGFjZSB8IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIsIG5hbWU6IHN0cmluZywgc291cmNlOiBzdHJpbmcsIGV4ZWN1dGlvbj86IFByb2Nlc3NFeGVjdXRpb24gfCBTaGVsbEV4ZWN1dGlvbiB8IEN1c3RvbUV4ZWN1dGlvbiwgcHJvYmxlbU1hdGNoZXJzPzogc3RyaW5nIHwgc3RyaW5nW10pO1xuXHRjb25zdHJ1Y3RvcihkZWZpbml0aW9uOiB2c2NvZGUuVGFza0RlZmluaXRpb24sIGFyZzI6IHN0cmluZyB8ICh2c2NvZGUuVGFza1Njb3BlLkdsb2JhbCB8IHZzY29kZS5UYXNrU2NvcGUuV29ya3NwYWNlKSB8IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIsIGFyZzM6IGFueSwgYXJnND86IGFueSwgYXJnNT86IGFueSwgYXJnNj86IGFueSkge1xuXHRcdHRoaXMuX2RlZmluaXRpb24gPSB0aGlzLmRlZmluaXRpb24gPSBkZWZpbml0aW9uO1xuXHRcdGxldCBwcm9ibGVtTWF0Y2hlcnM6IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRcdGlmICh0eXBlb2YgYXJnMiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuX25hbWUgPSB0aGlzLm5hbWUgPSBhcmcyO1xuXHRcdFx0dGhpcy5fc291cmNlID0gdGhpcy5zb3VyY2UgPSBhcmczO1xuXHRcdFx0dGhpcy5leGVjdXRpb24gPSBhcmc0O1xuXHRcdFx0cHJvYmxlbU1hdGNoZXJzID0gYXJnNTtcblx0XHRcdHRoaXMuX19kZXByZWNhdGVkID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGFyZzIgPT09IFRhc2tTY29wZS5HbG9iYWwgfHwgYXJnMiA9PT0gVGFza1Njb3BlLldvcmtzcGFjZSkge1xuXHRcdFx0dGhpcy50YXJnZXQgPSBhcmcyO1xuXHRcdFx0dGhpcy5fbmFtZSA9IHRoaXMubmFtZSA9IGFyZzM7XG5cdFx0XHR0aGlzLl9zb3VyY2UgPSB0aGlzLnNvdXJjZSA9IGFyZzQ7XG5cdFx0XHR0aGlzLmV4ZWN1dGlvbiA9IGFyZzU7XG5cdFx0XHRwcm9ibGVtTWF0Y2hlcnMgPSBhcmc2O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRhcmdldCA9IGFyZzI7XG5cdFx0XHR0aGlzLl9uYW1lID0gdGhpcy5uYW1lID0gYXJnMztcblx0XHRcdHRoaXMuX3NvdXJjZSA9IHRoaXMuc291cmNlID0gYXJnNDtcblx0XHRcdHRoaXMuZXhlY3V0aW9uID0gYXJnNTtcblx0XHRcdHByb2JsZW1NYXRjaGVycyA9IGFyZzY7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgcHJvYmxlbU1hdGNoZXJzID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5fcHJvYmxlbU1hdGNoZXJzID0gW3Byb2JsZW1NYXRjaGVyc107XG5cdFx0XHR0aGlzLl9oYXNEZWZpbmVkTWF0Y2hlcnMgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShwcm9ibGVtTWF0Y2hlcnMpKSB7XG5cdFx0XHR0aGlzLl9wcm9ibGVtTWF0Y2hlcnMgPSBwcm9ibGVtTWF0Y2hlcnM7XG5cdFx0XHR0aGlzLl9oYXNEZWZpbmVkTWF0Y2hlcnMgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wcm9ibGVtTWF0Y2hlcnMgPSBbXTtcblx0XHRcdHRoaXMuX2hhc0RlZmluZWRNYXRjaGVycyA9IGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9pc0JhY2tncm91bmQgPSBmYWxzZTtcblx0XHR0aGlzLl9wcmVzZW50YXRpb25PcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9ydW5PcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdGdldCBfaWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fX2lkO1xuXHR9XG5cblx0c2V0IF9pZCh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fX2lkID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgX2RlcHJlY2F0ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX19kZXByZWNhdGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fX2lkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fX2lkID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Njb3BlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY29tcHV0ZURlZmluaXRpb25CYXNlZE9uRXhlY3V0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVEZWZpbml0aW9uQmFzZWRPbkV4ZWN1dGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZXhlY3V0aW9uIGluc3RhbmNlb2YgUHJvY2Vzc0V4ZWN1dGlvbikge1xuXHRcdFx0dGhpcy5fZGVmaW5pdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogVGFzay5Qcm9jZXNzVHlwZSxcblx0XHRcdFx0aWQ6IHRoaXMuX2V4ZWN1dGlvbi5jb21wdXRlSWQoKVxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2V4ZWN1dGlvbiBpbnN0YW5jZW9mIFNoZWxsRXhlY3V0aW9uKSB7XG5cdFx0XHR0aGlzLl9kZWZpbml0aW9uID0ge1xuXHRcdFx0XHR0eXBlOiBUYXNrLlNoZWxsVHlwZSxcblx0XHRcdFx0aWQ6IHRoaXMuX2V4ZWN1dGlvbi5jb21wdXRlSWQoKVxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2V4ZWN1dGlvbiBpbnN0YW5jZW9mIEN1c3RvbUV4ZWN1dGlvbikge1xuXHRcdFx0dGhpcy5fZGVmaW5pdGlvbiA9IHtcblx0XHRcdFx0dHlwZTogVGFzay5FeHRlbnNpb25DYWxsYmFja1R5cGUsXG5cdFx0XHRcdGlkOiB0aGlzLl9leGVjdXRpb24uY29tcHV0ZUlkKClcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2RlZmluaXRpb24gPSB7XG5cdFx0XHRcdHR5cGU6IFRhc2suRW1wdHlUeXBlLFxuXHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKClcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGRlZmluaXRpb24oKTogdnNjb2RlLlRhc2tEZWZpbml0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVmaW5pdGlvbjtcblx0fVxuXG5cdHNldCBkZWZpbml0aW9uKHZhbHVlOiB2c2NvZGUuVGFza0RlZmluaXRpb24pIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCdLaW5kIGNhblxcJ3QgYmUgdW5kZWZpbmVkIG9yIG51bGwnKTtcblx0XHR9XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHRoaXMuX2RlZmluaXRpb24gPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBzY29wZSgpOiB2c2NvZGUuVGFza1Njb3BlLkdsb2JhbCB8IHZzY29kZS5UYXNrU2NvcGUuV29ya3NwYWNlIHwgdnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Njb3BlO1xuXHR9XG5cblx0c2V0IHRhcmdldCh2YWx1ZTogdnNjb2RlLlRhc2tTY29wZS5HbG9iYWwgfCB2c2NvZGUuVGFza1Njb3BlLldvcmtzcGFjZSB8IHZzY29kZS5Xb3Jrc3BhY2VGb2xkZXIpIHtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc2NvcGUgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX25hbWU7XG5cdH1cblxuXHRzZXQgbmFtZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnbmFtZScpO1xuXHRcdH1cblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0dGhpcy5fbmFtZSA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IGV4ZWN1dGlvbigpOiBQcm9jZXNzRXhlY3V0aW9uIHwgU2hlbGxFeGVjdXRpb24gfCBDdXN0b21FeGVjdXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9leGVjdXRpb247XG5cdH1cblxuXHRzZXQgZXhlY3V0aW9uKHZhbHVlOiBQcm9jZXNzRXhlY3V0aW9uIHwgU2hlbGxFeGVjdXRpb24gfCBDdXN0b21FeGVjdXRpb24gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZXhlY3V0aW9uID0gdmFsdWU7XG5cdFx0Y29uc3QgdHlwZSA9IHRoaXMuX2RlZmluaXRpb24udHlwZTtcblx0XHRpZiAoVGFzay5FbXB0eVR5cGUgPT09IHR5cGUgfHwgVGFzay5Qcm9jZXNzVHlwZSA9PT0gdHlwZSB8fCBUYXNrLlNoZWxsVHlwZSA9PT0gdHlwZSB8fCBUYXNrLkV4dGVuc2lvbkNhbGxiYWNrVHlwZSA9PT0gdHlwZSkge1xuXHRcdFx0dGhpcy5jb21wdXRlRGVmaW5pdGlvbkJhc2VkT25FeGVjdXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgcHJvYmxlbU1hdGNoZXJzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvYmxlbU1hdGNoZXJzO1xuXHR9XG5cblx0c2V0IHByb2JsZW1NYXRjaGVycyh2YWx1ZTogc3RyaW5nW10pIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9wcm9ibGVtTWF0Y2hlcnMgPSBbXTtcblx0XHRcdHRoaXMuX2hhc0RlZmluZWRNYXRjaGVycyA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9wcm9ibGVtTWF0Y2hlcnMgPSB2YWx1ZTtcblx0XHRcdHRoaXMuX2hhc0RlZmluZWRNYXRjaGVycyA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGhhc0RlZmluZWRNYXRjaGVycygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGFzRGVmaW5lZE1hdGNoZXJzO1xuXHR9XG5cblx0Z2V0IGlzQmFja2dyb3VuZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNCYWNrZ3JvdW5kO1xuXHR9XG5cblx0c2V0IGlzQmFja2dyb3VuZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICh2YWx1ZSAhPT0gdHJ1ZSAmJiB2YWx1ZSAhPT0gZmFsc2UpIHtcblx0XHRcdHZhbHVlID0gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9pc0JhY2tncm91bmQgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBzb3VyY2UoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fc291cmNlO1xuXHR9XG5cblx0c2V0IHNvdXJjZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgdmFsdWUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3NvdXJjZSBtdXN0IGJlIGEgc3RyaW5nIG9mIGxlbmd0aCA+IDAnKTtcblx0XHR9XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHRoaXMuX3NvdXJjZSA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IGdyb3VwKCk6IFRhc2tHcm91cCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2dyb3VwO1xuXHR9XG5cblx0c2V0IGdyb3VwKHZhbHVlOiBUYXNrR3JvdXAgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZ3JvdXAgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBkZXRhaWwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGV0YWlsO1xuXHR9XG5cblx0c2V0IGRldGFpbCh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHR2YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fZGV0YWlsID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgcHJlc2VudGF0aW9uT3B0aW9ucygpOiB2c2NvZGUuVGFza1ByZXNlbnRhdGlvbk9wdGlvbnMge1xuXHRcdHJldHVybiB0aGlzLl9wcmVzZW50YXRpb25PcHRpb25zO1xuXHR9XG5cblx0c2V0IHByZXNlbnRhdGlvbk9wdGlvbnModmFsdWU6IHZzY29kZS5UYXNrUHJlc2VudGF0aW9uT3B0aW9ucykge1xuXHRcdGlmICh2YWx1ZSA9PT0gbnVsbCB8fCB2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0fVxuXHRcdHRoaXMuY2xlYXIoKTtcblx0XHR0aGlzLl9wcmVzZW50YXRpb25PcHRpb25zID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgcnVuT3B0aW9ucygpOiB2c2NvZGUuUnVuT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuX3J1bk9wdGlvbnM7XG5cdH1cblxuXHRzZXQgcnVuT3B0aW9ucyh2YWx1ZTogdnNjb2RlLlJ1bk9wdGlvbnMpIHtcblx0XHRpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFsdWUgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdH1cblx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcnVuT3B0aW9ucyA9IHZhbHVlO1xuXHR9XG59XG5cblxuZXhwb3J0IGVudW0gUHJvZ3Jlc3NMb2NhdGlvbiB7XG5cdFNvdXJjZUNvbnRyb2wgPSAxLFxuXHRXaW5kb3cgPSAxMCxcblx0Tm90aWZpY2F0aW9uID0gMTVcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBWaWV3QmFkZ2Uge1xuXHRleHBvcnQgZnVuY3Rpb24gaXNWaWV3QmFkZ2UodGhpbmc6IGFueSk6IHRoaW5nIGlzIHZzY29kZS5WaWV3QmFkZ2Uge1xuXHRcdGNvbnN0IHZpZXdCYWRnZVRoaW5nID0gdGhpbmcgYXMgdnNjb2RlLlZpZXdCYWRnZTtcblxuXHRcdGlmICghaXNOdW1iZXIodmlld0JhZGdlVGhpbmcudmFsdWUpKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCB2aWV3IGJhZGdlLCBpbnZhbGlkIHZhbHVlJywgdmlld0JhZGdlVGhpbmcudmFsdWUpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodmlld0JhZGdlVGhpbmcudG9vbHRpcCAmJiAhaXNTdHJpbmcodmlld0JhZGdlVGhpbmcudG9vbHRpcCkpIHtcblx0XHRcdGNvbnNvbGUubG9nKCdJTlZBTElEIHZpZXcgYmFkZ2UsIGludmFsaWQgdG9vbHRpcCcsIHZpZXdCYWRnZVRoaW5nLnRvb2x0aXApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBUcmVlSXRlbSB7XG5cblx0bGFiZWw/OiBzdHJpbmcgfCB2c2NvZGUuVHJlZUl0ZW1MYWJlbDtcblx0cmVzb3VyY2VVcmk/OiBVUkk7XG5cdGljb25QYXRoPzogc3RyaW5nIHwgVVJJIHwgeyBsaWdodDogc3RyaW5nIHwgVVJJOyBkYXJrOiBzdHJpbmcgfCBVUkkgfSB8IFRoZW1lSWNvbjtcblx0Y29tbWFuZD86IHZzY29kZS5Db21tYW5kO1xuXHRjb250ZXh0VmFsdWU/OiBzdHJpbmc7XG5cdHRvb2x0aXA/OiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdGNoZWNrYm94U3RhdGU/OiB2c2NvZGUuVHJlZUl0ZW1DaGVja2JveFN0YXRlO1xuXG5cdHN0YXRpYyBpc1RyZWVJdGVtKHRoaW5nOiBhbnksIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogdGhpbmcgaXMgVHJlZUl0ZW0ge1xuXHRcdGNvbnN0IHRyZWVJdGVtVGhpbmcgPSB0aGluZyBhcyB2c2NvZGUuVHJlZUl0ZW07XG5cblx0XHRpZiAodHJlZUl0ZW1UaGluZy5jaGVja2JveFN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGNoZWNrYm94ID0gaXNOdW1iZXIodHJlZUl0ZW1UaGluZy5jaGVja2JveFN0YXRlKSA/IHRyZWVJdGVtVGhpbmcuY2hlY2tib3hTdGF0ZSA6XG5cdFx0XHRcdGlzT2JqZWN0KHRyZWVJdGVtVGhpbmcuY2hlY2tib3hTdGF0ZSkgJiYgaXNOdW1iZXIodHJlZUl0ZW1UaGluZy5jaGVja2JveFN0YXRlLnN0YXRlKSA/IHRyZWVJdGVtVGhpbmcuY2hlY2tib3hTdGF0ZS5zdGF0ZSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRvb2x0aXAgPSAhaXNOdW1iZXIodHJlZUl0ZW1UaGluZy5jaGVja2JveFN0YXRlKSAmJiBpc09iamVjdCh0cmVlSXRlbVRoaW5nLmNoZWNrYm94U3RhdGUpID8gdHJlZUl0ZW1UaGluZy5jaGVja2JveFN0YXRlLnRvb2x0aXAgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoY2hlY2tib3ggPT09IHVuZGVmaW5lZCB8fCAoY2hlY2tib3ggIT09IFRyZWVJdGVtQ2hlY2tib3hTdGF0ZS5DaGVja2VkICYmIGNoZWNrYm94ICE9PSBUcmVlSXRlbUNoZWNrYm94U3RhdGUuVW5jaGVja2VkKSB8fCAodG9vbHRpcCAhPT0gdW5kZWZpbmVkICYmICFpc1N0cmluZyh0b29sdGlwKSkpIHtcblx0XHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdHJlZSBpdGVtLCBpbnZhbGlkIGNoZWNrYm94U3RhdGUnLCB0cmVlSXRlbVRoaW5nLmNoZWNrYm94U3RhdGUpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaW5nIGluc3RhbmNlb2YgVHJlZUl0ZW0pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmICh0cmVlSXRlbVRoaW5nLmxhYmVsICE9PSB1bmRlZmluZWQgJiYgIWlzU3RyaW5nKHRyZWVJdGVtVGhpbmcubGFiZWwpICYmICEodHJlZUl0ZW1UaGluZy5sYWJlbD8ubGFiZWwpKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCB0cmVlIGl0ZW0sIGludmFsaWQgbGFiZWwnLCB0cmVlSXRlbVRoaW5nLmxhYmVsKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCh0cmVlSXRlbVRoaW5nLmlkICE9PSB1bmRlZmluZWQpICYmICFpc1N0cmluZyh0cmVlSXRlbVRoaW5nLmlkKSkge1xuXHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdHJlZSBpdGVtLCBpbnZhbGlkIGlkJywgdHJlZUl0ZW1UaGluZy5pZCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICgodHJlZUl0ZW1UaGluZy5pY29uUGF0aCAhPT0gdW5kZWZpbmVkKSAmJiAhaXNTdHJpbmcodHJlZUl0ZW1UaGluZy5pY29uUGF0aCkgJiYgIVVSSS5pc1VyaSh0cmVlSXRlbVRoaW5nLmljb25QYXRoKSAmJiAoIXRyZWVJdGVtVGhpbmcuaWNvblBhdGggfHwgIWlzU3RyaW5nKCh0cmVlSXRlbVRoaW5nLmljb25QYXRoIGFzIHZzY29kZS5UaGVtZUljb24pLmlkKSkpIHtcblx0XHRcdGNvbnN0IGFzTGlnaHRBbmREYXJrVGhpbmcgPSB0cmVlSXRlbVRoaW5nLmljb25QYXRoIGFzIHsgbGlnaHQ6IHN0cmluZyB8IFVSSTsgZGFyazogc3RyaW5nIHwgVVJJIH0gfCBudWxsO1xuXHRcdFx0aWYgKCFhc0xpZ2h0QW5kRGFya1RoaW5nIHx8ICghaXNTdHJpbmcoYXNMaWdodEFuZERhcmtUaGluZy5saWdodCkgJiYgIVVSSS5pc1VyaShhc0xpZ2h0QW5kRGFya1RoaW5nLmxpZ2h0KSAmJiAhaXNTdHJpbmcoYXNMaWdodEFuZERhcmtUaGluZy5kYXJrKSAmJiAhVVJJLmlzVXJpKGFzTGlnaHRBbmREYXJrVGhpbmcuZGFyaykpKSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKCdJTlZBTElEIHRyZWUgaXRlbSwgaW52YWxpZCBpY29uUGF0aCcsIHRyZWVJdGVtVGhpbmcuaWNvblBhdGgpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICgodHJlZUl0ZW1UaGluZy5kZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkKSAmJiAhaXNTdHJpbmcodHJlZUl0ZW1UaGluZy5kZXNjcmlwdGlvbikgJiYgKHR5cGVvZiB0cmVlSXRlbVRoaW5nLmRlc2NyaXB0aW9uICE9PSAnYm9vbGVhbicpKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCB0cmVlIGl0ZW0sIGludmFsaWQgZGVzY3JpcHRpb24nLCB0cmVlSXRlbVRoaW5nLmRlc2NyaXB0aW9uKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCh0cmVlSXRlbVRoaW5nLnJlc291cmNlVXJpICE9PSB1bmRlZmluZWQpICYmICFVUkkuaXNVcmkodHJlZUl0ZW1UaGluZy5yZXNvdXJjZVVyaSkpIHtcblx0XHRcdGNvbnNvbGUubG9nKCdJTlZBTElEIHRyZWUgaXRlbSwgaW52YWxpZCByZXNvdXJjZVVyaScsIHRyZWVJdGVtVGhpbmcucmVzb3VyY2VVcmkpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoKHRyZWVJdGVtVGhpbmcudG9vbHRpcCAhPT0gdW5kZWZpbmVkKSAmJiAhaXNTdHJpbmcodHJlZUl0ZW1UaGluZy50b29sdGlwKSAmJiAhKHRyZWVJdGVtVGhpbmcudG9vbHRpcCBpbnN0YW5jZW9mIE1hcmtkb3duU3RyaW5nKSkge1xuXHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdHJlZSBpdGVtLCBpbnZhbGlkIHRvb2x0aXAnLCB0cmVlSXRlbVRoaW5nLnRvb2x0aXApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoKHRyZWVJdGVtVGhpbmcuY29tbWFuZCAhPT0gdW5kZWZpbmVkKSAmJiAhdHJlZUl0ZW1UaGluZy5jb21tYW5kLmNvbW1hbmQpIHtcblx0XHRcdGNvbnNvbGUubG9nKCdJTlZBTElEIHRyZWUgaXRlbSwgaW52YWxpZCBjb21tYW5kJywgdHJlZUl0ZW1UaGluZy5jb21tYW5kKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCh0cmVlSXRlbVRoaW5nLmNvbGxhcHNpYmxlU3RhdGUgIT09IHVuZGVmaW5lZCkgJiYgKHRyZWVJdGVtVGhpbmcuY29sbGFwc2libGVTdGF0ZSA8IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lKSAmJiAodHJlZUl0ZW1UaGluZy5jb2xsYXBzaWJsZVN0YXRlID4gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkKSkge1xuXHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdHJlZSBpdGVtLCBpbnZhbGlkIGNvbGxhcHNpYmxlU3RhdGUnLCB0cmVlSXRlbVRoaW5nLmNvbGxhcHNpYmxlU3RhdGUpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoKHRyZWVJdGVtVGhpbmcuY29udGV4dFZhbHVlICE9PSB1bmRlZmluZWQpICYmICFpc1N0cmluZyh0cmVlSXRlbVRoaW5nLmNvbnRleHRWYWx1ZSkpIHtcblx0XHRcdGNvbnNvbGUubG9nKCdJTlZBTElEIHRyZWUgaXRlbSwgaW52YWxpZCBjb250ZXh0VmFsdWUnLCB0cmVlSXRlbVRoaW5nLmNvbnRleHRWYWx1ZSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICgodHJlZUl0ZW1UaGluZy5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24gIT09IHVuZGVmaW5lZCkgJiYgIXRyZWVJdGVtVGhpbmcuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uPy5sYWJlbCkge1xuXHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgdHJlZSBpdGVtLCBpbnZhbGlkIGFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbicsIHRyZWVJdGVtVGhpbmcuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKGxhYmVsOiBzdHJpbmcgfCB2c2NvZGUuVHJlZUl0ZW1MYWJlbCwgY29sbGFwc2libGVTdGF0ZT86IHZzY29kZS5UcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUpO1xuXHRjb25zdHJ1Y3RvcihyZXNvdXJjZVVyaTogVVJJLCBjb2xsYXBzaWJsZVN0YXRlPzogdnNjb2RlLlRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSk7XG5cdGNvbnN0cnVjdG9yKGFyZzE6IHN0cmluZyB8IHZzY29kZS5UcmVlSXRlbUxhYmVsIHwgVVJJLCBwdWJsaWMgY29sbGFwc2libGVTdGF0ZTogdnNjb2RlLlRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSA9IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lKSB7XG5cdFx0aWYgKFVSSS5pc1VyaShhcmcxKSkge1xuXHRcdFx0dGhpcy5yZXNvdXJjZVVyaSA9IGFyZzE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGFiZWwgPSBhcmcxO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBlbnVtIFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSB7XG5cdE5vbmUgPSAwLFxuXHRDb2xsYXBzZWQgPSAxLFxuXHRFeHBhbmRlZCA9IDJcbn1cblxuZXhwb3J0IGVudW0gVHJlZUl0ZW1DaGVja2JveFN0YXRlIHtcblx0VW5jaGVja2VkID0gMCxcblx0Q2hlY2tlZCA9IDFcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRGF0YVRyYW5zZmVySXRlbSBpbXBsZW1lbnRzIHZzY29kZS5EYXRhVHJhbnNmZXJJdGVtIHtcblxuXHRhc3luYyBhc1N0cmluZygpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0eXBlb2YgdGhpcy52YWx1ZSA9PT0gJ3N0cmluZycgPyB0aGlzLnZhbHVlIDogSlNPTi5zdHJpbmdpZnkodGhpcy52YWx1ZSk7XG5cdH1cblxuXHRhc0ZpbGUoKTogdW5kZWZpbmVkIHwgdnNjb2RlLkRhdGFUcmFuc2ZlckZpbGUge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmFsdWU6IGFueSxcblx0KSB7IH1cbn1cblxuLyoqXG4gKiBBIGRhdGEgdHJhbnNmZXIgaXRlbSB0aGF0IGhhcyBiZWVuIGNyZWF0ZWQgYnkgVlMgQ29kZSBpbnN0ZWFkIG9mIGJ5IGEgZXh0ZW5zaW9uLlxuICpcbiAqIEludGVudGlvbmFsbHkgbm90IGV4cG9ydGVkIHRvIGV4dGVuc2lvbnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBJbnRlcm5hbERhdGFUcmFuc2Zlckl0ZW0gZXh0ZW5kcyBEYXRhVHJhbnNmZXJJdGVtIHsgfVxuXG4vKipcbiAqIEEgZGF0YSB0cmFuc2ZlciBpdGVtIGZvciBhIGZpbGUuXG4gKlxuICogSW50ZW50aW9uYWxseSBub3QgZXhwb3J0ZWQgdG8gZXh0ZW5zaW9ucyBhcyBvbmx5IHdlIGNhbiBjcmVhdGUgdGhlc2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBJbnRlcm5hbEZpbGVEYXRhVHJhbnNmZXJJdGVtIGV4dGVuZHMgSW50ZXJuYWxEYXRhVHJhbnNmZXJJdGVtIHtcblxuXHRyZWFkb25seSAjZmlsZTogdnNjb2RlLkRhdGFUcmFuc2ZlckZpbGU7XG5cblx0Y29uc3RydWN0b3IoZmlsZTogdnNjb2RlLkRhdGFUcmFuc2ZlckZpbGUpIHtcblx0XHRzdXBlcignJyk7XG5cdFx0dGhpcy4jZmlsZSA9IGZpbGU7XG5cdH1cblxuXHRvdmVycmlkZSBhc0ZpbGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuI2ZpbGU7XG5cdH1cbn1cblxuLyoqXG4gKiBJbnRlbnRpb25hbGx5IG5vdCBleHBvcnRlZCB0byBleHRlbnNpb25zXG4gKi9cbmV4cG9ydCBjbGFzcyBEYXRhVHJhbnNmZXJGaWxlIGltcGxlbWVudHMgdnNjb2RlLkRhdGFUcmFuc2ZlckZpbGUge1xuXG5cdHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSB1cmk6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IF9pdGVtSWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfZ2V0RGF0YTogKCkgPT4gUHJvbWlzZTxVaW50OEFycmF5PjtcblxuXHRjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIHVyaTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZCwgaXRlbUlkOiBzdHJpbmcsIGdldERhdGE6ICgpID0+IFByb21pc2U8VWludDhBcnJheT4pIHtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHRcdHRoaXMudXJpID0gdXJpO1xuXHRcdHRoaXMuX2l0ZW1JZCA9IGl0ZW1JZDtcblx0XHR0aGlzLl9nZXREYXRhID0gZ2V0RGF0YTtcblx0fVxuXG5cdGRhdGEoKTogUHJvbWlzZTxVaW50OEFycmF5PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldERhdGEoKTtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBEYXRhVHJhbnNmZXIgaW1wbGVtZW50cyB2c2NvZGUuRGF0YVRyYW5zZmVyIHtcblx0I2l0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5EYXRhVHJhbnNmZXJJdGVtW10+KCk7XG5cblx0Y29uc3RydWN0b3IoaW5pdD86IEl0ZXJhYmxlPHJlYWRvbmx5IFtzdHJpbmcsIHZzY29kZS5EYXRhVHJhbnNmZXJJdGVtXT4pIHtcblx0XHRmb3IgKGNvbnN0IFttaW1lLCBpdGVtXSBvZiBpbml0ID8/IFtdKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuI2l0ZW1zLmdldCh0aGlzLiNub3JtYWxpemVNaW1lKG1pbWUpKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRleGlzdGluZy5wdXNoKGl0ZW0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy4jaXRlbXMuc2V0KHRoaXMuI25vcm1hbGl6ZU1pbWUobWltZSksIFtpdGVtXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0KG1pbWVUeXBlOiBzdHJpbmcpOiB2c2NvZGUuRGF0YVRyYW5zZmVySXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI2l0ZW1zLmdldCh0aGlzLiNub3JtYWxpemVNaW1lKG1pbWVUeXBlKSk/LlswXTtcblx0fVxuXG5cdHNldChtaW1lVHlwZTogc3RyaW5nLCB2YWx1ZTogdnNjb2RlLkRhdGFUcmFuc2Zlckl0ZW0pOiB2b2lkIHtcblx0XHQvLyBUaGlzIGludGVudGlvbmFsbHkgb3ZlcndyaXRlcyBhbGwgZW50cmllcyBmb3IgYSBnaXZlbiBtaW1ldHlwZS5cblx0XHQvLyBUaGlzIGlzIHNpbWlsYXIgdG8gaG93IHRoZSBET00gRGF0YVRyYW5zZmVyIHR5cGUgd29ya3Ncblx0XHR0aGlzLiNpdGVtcy5zZXQodGhpcy4jbm9ybWFsaXplTWltZShtaW1lVHlwZSksIFt2YWx1ZV0pO1xuXHR9XG5cblx0Zm9yRWFjaChjYWxsYmFja2ZuOiAodmFsdWU6IHZzY29kZS5EYXRhVHJhbnNmZXJJdGVtLCBrZXk6IHN0cmluZywgZGF0YVRyYW5zZmVyOiBEYXRhVHJhbnNmZXIpID0+IHZvaWQsIHRoaXNBcmc/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbbWltZSwgaXRlbXNdIG9mIHRoaXMuI2l0ZW1zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdFx0Y2FsbGJhY2tmbi5jYWxsKHRoaXNBcmcsIGl0ZW0sIG1pbWUsIHRoaXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdCpbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYWJsZUl0ZXJhdG9yPFttaW1lVHlwZTogc3RyaW5nLCBpdGVtOiB2c2NvZGUuRGF0YVRyYW5zZmVySXRlbV0+IHtcblx0XHRmb3IgKGNvbnN0IFttaW1lLCBpdGVtc10gb2YgdGhpcy4jaXRlbXMpIHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHR5aWVsZCBbbWltZSwgaXRlbV07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0I25vcm1hbGl6ZU1pbWUobWltZVR5cGU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG1pbWVUeXBlLnRvTG93ZXJDYXNlKCk7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRG9jdW1lbnREcm9wRWRpdCB7XG5cdHRpdGxlPzogc3RyaW5nO1xuXG5cdGlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0aW5zZXJ0VGV4dDogc3RyaW5nIHwgU25pcHBldFN0cmluZztcblxuXHRhZGRpdGlvbmFsRWRpdD86IFdvcmtzcGFjZUVkaXQ7XG5cblx0a2luZD86IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZDtcblxuXHRjb25zdHJ1Y3RvcihpbnNlcnRUZXh0OiBzdHJpbmcgfCBTbmlwcGV0U3RyaW5nLCB0aXRsZT86IHN0cmluZywga2luZD86IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZCkge1xuXHRcdHRoaXMuaW5zZXJ0VGV4dCA9IGluc2VydFRleHQ7XG5cdFx0dGhpcy50aXRsZSA9IHRpdGxlO1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gRG9jdW1lbnRQYXN0ZVRyaWdnZXJLaW5kIHtcblx0QXV0b21hdGljID0gMCxcblx0UGFzdGVBcyA9IDEsXG59XG5cbmV4cG9ydCBjbGFzcyBEb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQge1xuXHRzdGF0aWMgRW1wdHk6IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZDtcblx0c3RhdGljIFRleHQ6IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZDtcblx0c3RhdGljIFRleHRVcGRhdGVJbXBvcnRzOiBEb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgc2VwID0gJy4nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB2YWx1ZTogc3RyaW5nXG5cdCkgeyB9XG5cblx0cHVibGljIGFwcGVuZCguLi5wYXJ0czogc3RyaW5nW10pOiBEb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQge1xuXHRcdHJldHVybiBuZXcgRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kKCh0aGlzLnZhbHVlID8gW3RoaXMudmFsdWUsIC4uLnBhcnRzXSA6IHBhcnRzKS5qb2luKERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZC5zZXApKTtcblx0fVxuXG5cdHB1YmxpYyBpbnRlcnNlY3RzKG90aGVyOiBEb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb250YWlucyhvdGhlcikgfHwgb3RoZXIuY29udGFpbnModGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgY29udGFpbnMob3RoZXI6IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlID09PSBvdGhlci52YWx1ZSB8fCBvdGhlci52YWx1ZS5zdGFydHNXaXRoKHRoaXMudmFsdWUgKyBEb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQuc2VwKTtcblx0fVxufVxuRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kLkVtcHR5ID0gbmV3IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZCgnJyk7XG5Eb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQuVGV4dCA9IG5ldyBEb2N1bWVudERyb3BPclBhc3RlRWRpdEtpbmQoJ3RleHQnKTtcbkRvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZC5UZXh0VXBkYXRlSW1wb3J0cyA9IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZC5UZXh0LmFwcGVuZCgndXBkYXRlSW1wb3J0cycpO1xuXG5leHBvcnQgY2xhc3MgRG9jdW1lbnRQYXN0ZUVkaXQge1xuXG5cdHRpdGxlOiBzdHJpbmc7XG5cdGluc2VydFRleHQ6IHN0cmluZyB8IFNuaXBwZXRTdHJpbmc7XG5cdGFkZGl0aW9uYWxFZGl0PzogV29ya3NwYWNlRWRpdDtcblx0a2luZDogRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kO1xuXG5cdGNvbnN0cnVjdG9yKGluc2VydFRleHQ6IHN0cmluZyB8IFNuaXBwZXRTdHJpbmcsIHRpdGxlOiBzdHJpbmcsIGtpbmQ6IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZCkge1xuXHRcdHRoaXMudGl0bGUgPSB0aXRsZTtcblx0XHR0aGlzLmluc2VydFRleHQgPSBpbnNlcnRUZXh0O1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgVGhlbWVJY29uIHtcblxuXHRzdGF0aWMgRmlsZTogVGhlbWVJY29uO1xuXHRzdGF0aWMgRm9sZGVyOiBUaGVtZUljb247XG5cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29sb3I/OiBUaGVtZUNvbG9yO1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGNvbG9yPzogVGhlbWVDb2xvcikge1xuXHRcdHRoaXMuaWQgPSBpZDtcblx0XHR0aGlzLmNvbG9yID0gY29sb3I7XG5cdH1cblxuXHRzdGF0aWMgaXNUaGVtZUljb24odGhpbmc6IGFueSkge1xuXHRcdGlmICh0eXBlb2YgdGhpbmcuaWQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zb2xlLmxvZygnSU5WQUxJRCBUaGVtZUljb24sIGludmFsaWQgaWQnLCB0aGluZy5pZCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5UaGVtZUljb24uRmlsZSA9IG5ldyBUaGVtZUljb24oJ2ZpbGUnKTtcblRoZW1lSWNvbi5Gb2xkZXIgPSBuZXcgVGhlbWVJY29uKCdmb2xkZXInKTtcblxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBUaGVtZUNvbG9yIHtcblx0aWQ6IHN0cmluZztcblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZykge1xuXHRcdHRoaXMuaWQgPSBpZDtcblx0fVxufVxuXG5leHBvcnQgZW51bSBDb25maWd1cmF0aW9uVGFyZ2V0IHtcblx0R2xvYmFsID0gMSxcblxuXHRXb3Jrc3BhY2UgPSAyLFxuXG5cdFdvcmtzcGFjZUZvbGRlciA9IDNcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgUmVsYXRpdmVQYXR0ZXJuIGltcGxlbWVudHMgSVJlbGF0aXZlUGF0dGVybiB7XG5cblx0cGF0dGVybjogc3RyaW5nO1xuXG5cdHByaXZhdGUgX2Jhc2UhOiBzdHJpbmc7XG5cdGdldCBiYXNlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2Jhc2U7XG5cdH1cblx0c2V0IGJhc2UoYmFzZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fYmFzZSA9IGJhc2U7XG5cdFx0dGhpcy5fYmFzZVVyaSA9IFVSSS5maWxlKGJhc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmFzZVVyaSE6IFVSSTtcblx0Z2V0IGJhc2VVcmkoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fYmFzZVVyaTtcblx0fVxuXHRzZXQgYmFzZVVyaShiYXNlVXJpOiBVUkkpIHtcblx0XHR0aGlzLl9iYXNlVXJpID0gYmFzZVVyaTtcblx0XHR0aGlzLl9iYXNlID0gYmFzZVVyaS5mc1BhdGg7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihiYXNlOiB2c2NvZGUuV29ya3NwYWNlRm9sZGVyIHwgVVJJIHwgc3RyaW5nLCBwYXR0ZXJuOiBzdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIGJhc2UgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRpZiAoIWJhc2UgfHwgIVVSSS5pc1VyaShiYXNlKSAmJiAhVVJJLmlzVXJpKGJhc2UudXJpKSkge1xuXHRcdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2Jhc2UnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHBhdHRlcm4gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ3BhdHRlcm4nKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGJhc2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLmJhc2VVcmkgPSBVUkkuZmlsZShiYXNlKTtcblx0XHR9IGVsc2UgaWYgKFVSSS5pc1VyaShiYXNlKSkge1xuXHRcdFx0dGhpcy5iYXNlVXJpID0gYmFzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5iYXNlVXJpID0gYmFzZS51cmk7XG5cdFx0fVxuXG5cdFx0dGhpcy5wYXR0ZXJuID0gcGF0dGVybjtcblx0fVxuXG5cdHRvSlNPTigpOiBJUmVsYXRpdmVQYXR0ZXJuRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGF0dGVybjogdGhpcy5wYXR0ZXJuLFxuXHRcdFx0YmFzZTogdGhpcy5iYXNlLFxuXHRcdFx0YmFzZVVyaTogdGhpcy5iYXNlVXJpLnRvSlNPTigpXG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCBicmVha3BvaW50SWRzID0gbmV3IFdlYWtNYXA8QnJlYWtwb2ludCwgc3RyaW5nPigpO1xuXG4vKipcbiAqIFdlIHdhbnQgdG8gYmUgYWJsZSB0byBjb25zdHJ1Y3QgQnJlYWtwb2ludHMgaW50ZXJuYWxseSB0aGF0IGhhdmUgYSBwYXJ0aWN1bGFyIGlkLCBidXQgd2UgZG9uJ3Qgd2FudCBleHRlbnNpb25zIHRvIGJlXG4gKiBhYmxlIHRvIGRvIHRoaXMgd2l0aCB0aGUgZXhwb3NlZCBCcmVha3BvaW50IGNsYXNzZXMgaW4gZXh0ZW5zaW9uIEFQSS5cbiAqIFdlIGFsc28gd2FudCBcImluc3RhbmNlb2ZcIiB0byB3b3JrIHdpdGggZGVidWcuYnJlYWtwb2ludHMgYW5kIHRoZSBleHBvc2VkIGJyZWFrcG9pbnQgY2xhc3Nlcy5cbiAqIEFuZCBwcml2YXRlIG1lbWJlcnMgd2lsbCBiZSByZW5hbWVkIGluIHRoZSBidWlsdCBqcywgc28gY2FzdGluZyB0byBhbnkgYW5kIHNldHRpbmcgYSBwcml2YXRlIG1lbWJlciBpcyBub3Qgc2FmZS5cbiAqIFNvLCB3ZSBzdG9yZSBpbnRlcm5hbCBicmVha3BvaW50IElEcyBpbiBhIFdlYWtNYXAuIFRoaXMgZnVuY3Rpb24gbXVzdCBiZSBjYWxsZWQgYWZ0ZXIgY29uc3RydWN0aW5nIGEgQnJlYWtwb2ludFxuICogd2l0aCBhIGtub3duIGlkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0QnJlYWtwb2ludElkKGJwOiBCcmVha3BvaW50LCBpZDogc3RyaW5nKSB7XG5cdGJyZWFrcG9pbnRJZHMuc2V0KGJwLCBpZCk7XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIEJyZWFrcG9pbnQge1xuXG5cdHByaXZhdGUgX2lkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29uZGl0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBoaXRDb25kaXRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxvZ01lc3NhZ2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGU/OiBzdHJpbmc7XG5cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKGVuYWJsZWQ/OiBib29sZWFuLCBjb25kaXRpb24/OiBzdHJpbmcsIGhpdENvbmRpdGlvbj86IHN0cmluZywgbG9nTWVzc2FnZT86IHN0cmluZywgbW9kZT86IHN0cmluZykge1xuXHRcdHRoaXMuZW5hYmxlZCA9IHR5cGVvZiBlbmFibGVkID09PSAnYm9vbGVhbicgPyBlbmFibGVkIDogdHJ1ZTtcblx0XHRpZiAodHlwZW9mIGNvbmRpdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuY29uZGl0aW9uID0gY29uZGl0aW9uO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGhpdENvbmRpdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuaGl0Q29uZGl0aW9uID0gaGl0Q29uZGl0aW9uO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGxvZ01lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLmxvZ01lc3NhZ2UgPSBsb2dNZXNzYWdlO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG1vZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLm1vZGUgPSBtb2RlO1xuXHRcdH1cblx0fVxuXG5cdGdldCBpZCgpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy5faWQpIHtcblx0XHRcdHRoaXMuX2lkID0gYnJlYWtwb2ludElkcy5nZXQodGhpcykgPz8gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBTb3VyY2VCcmVha3BvaW50IGV4dGVuZHMgQnJlYWtwb2ludCB7XG5cdHJlYWRvbmx5IGxvY2F0aW9uOiBMb2NhdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihsb2NhdGlvbjogTG9jYXRpb24sIGVuYWJsZWQ/OiBib29sZWFuLCBjb25kaXRpb24/OiBzdHJpbmcsIGhpdENvbmRpdGlvbj86IHN0cmluZywgbG9nTWVzc2FnZT86IHN0cmluZywgbW9kZT86IHN0cmluZykge1xuXHRcdHN1cGVyKGVuYWJsZWQsIGNvbmRpdGlvbiwgaGl0Q29uZGl0aW9uLCBsb2dNZXNzYWdlLCBtb2RlKTtcblx0XHRpZiAobG9jYXRpb24gPT09IG51bGwpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnbG9jYXRpb24nKTtcblx0XHR9XG5cdFx0dGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIEZ1bmN0aW9uQnJlYWtwb2ludCBleHRlbmRzIEJyZWFrcG9pbnQge1xuXHRyZWFkb25seSBmdW5jdGlvbk5hbWU6IHN0cmluZztcblxuXHRjb25zdHJ1Y3RvcihmdW5jdGlvbk5hbWU6IHN0cmluZywgZW5hYmxlZD86IGJvb2xlYW4sIGNvbmRpdGlvbj86IHN0cmluZywgaGl0Q29uZGl0aW9uPzogc3RyaW5nLCBsb2dNZXNzYWdlPzogc3RyaW5nLCBtb2RlPzogc3RyaW5nKSB7XG5cdFx0c3VwZXIoZW5hYmxlZCwgY29uZGl0aW9uLCBoaXRDb25kaXRpb24sIGxvZ01lc3NhZ2UsIG1vZGUpO1xuXHRcdHRoaXMuZnVuY3Rpb25OYW1lID0gZnVuY3Rpb25OYW1lO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERhdGFCcmVha3BvaW50IGV4dGVuZHMgQnJlYWtwb2ludCB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRhdGFJZDogc3RyaW5nO1xuXHRyZWFkb25seSBjYW5QZXJzaXN0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGxhYmVsOiBzdHJpbmcsIGRhdGFJZDogc3RyaW5nLCBjYW5QZXJzaXN0OiBib29sZWFuLCBlbmFibGVkPzogYm9vbGVhbiwgY29uZGl0aW9uPzogc3RyaW5nLCBoaXRDb25kaXRpb24/OiBzdHJpbmcsIGxvZ01lc3NhZ2U/OiBzdHJpbmcsIG1vZGU/OiBzdHJpbmcpIHtcblx0XHRzdXBlcihlbmFibGVkLCBjb25kaXRpb24sIGhpdENvbmRpdGlvbiwgbG9nTWVzc2FnZSwgbW9kZSk7XG5cdFx0aWYgKCFkYXRhSWQpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnZGF0YUlkJyk7XG5cdFx0fVxuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLmRhdGFJZCA9IGRhdGFJZDtcblx0XHR0aGlzLmNhblBlcnNpc3QgPSBjYW5QZXJzaXN0O1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERlYnVnQWRhcHRlckV4ZWN1dGFibGUgaW1wbGVtZW50cyB2c2NvZGUuRGVidWdBZGFwdGVyRXhlY3V0YWJsZSB7XG5cdHJlYWRvbmx5IGNvbW1hbmQ6IHN0cmluZztcblx0cmVhZG9ubHkgYXJnczogc3RyaW5nW107XG5cdHJlYWRvbmx5IG9wdGlvbnM/OiB2c2NvZGUuRGVidWdBZGFwdGVyRXhlY3V0YWJsZU9wdGlvbnM7XG5cblx0Y29uc3RydWN0b3IoY29tbWFuZDogc3RyaW5nLCBhcmdzOiBzdHJpbmdbXSwgb3B0aW9ucz86IHZzY29kZS5EZWJ1Z0FkYXB0ZXJFeGVjdXRhYmxlT3B0aW9ucykge1xuXHRcdHRoaXMuY29tbWFuZCA9IGNvbW1hbmQ7XG5cdFx0dGhpcy5hcmdzID0gYXJncyB8fCBbXTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERlYnVnQWRhcHRlclNlcnZlciBpbXBsZW1lbnRzIHZzY29kZS5EZWJ1Z0FkYXB0ZXJTZXJ2ZXIge1xuXHRyZWFkb25seSBwb3J0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGhvc3Q/OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IocG9ydDogbnVtYmVyLCBob3N0Pzogc3RyaW5nKSB7XG5cdFx0dGhpcy5wb3J0ID0gcG9ydDtcblx0XHR0aGlzLmhvc3QgPSBob3N0O1xuXHR9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIERlYnVnQWRhcHRlck5hbWVkUGlwZVNlcnZlciBpbXBsZW1lbnRzIHZzY29kZS5EZWJ1Z0FkYXB0ZXJOYW1lZFBpcGVTZXJ2ZXIge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgcGF0aDogc3RyaW5nKSB7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRGVidWdBZGFwdGVySW5saW5lSW1wbGVtZW50YXRpb24gaW1wbGVtZW50cyB2c2NvZGUuRGVidWdBZGFwdGVySW5saW5lSW1wbGVtZW50YXRpb24ge1xuXHRyZWFkb25seSBpbXBsZW1lbnRhdGlvbjogdnNjb2RlLkRlYnVnQWRhcHRlcjtcblxuXHRjb25zdHJ1Y3RvcihpbXBsOiB2c2NvZGUuRGVidWdBZGFwdGVyKSB7XG5cdFx0dGhpcy5pbXBsZW1lbnRhdGlvbiA9IGltcGw7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgRGVidWdTdGFja0ZyYW1lIGltcGxlbWVudHMgdnNjb2RlLkRlYnVnU3RhY2tGcmFtZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzZXNzaW9uOiB2c2NvZGUuRGVidWdTZXNzaW9uLFxuXHRcdHJlYWRvbmx5IHRocmVhZElkOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgZnJhbWVJZDogbnVtYmVyKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnVGhyZWFkIGltcGxlbWVudHMgdnNjb2RlLkRlYnVnVGhyZWFkIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlc3Npb246IHZzY29kZS5EZWJ1Z1Nlc3Npb24sXG5cdFx0cmVhZG9ubHkgdGhyZWFkSWQ6IG51bWJlcikgeyB9XG59XG5cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRXZhbHVhdGFibGVFeHByZXNzaW9uIGltcGxlbWVudHMgdnNjb2RlLkV2YWx1YXRhYmxlRXhwcmVzc2lvbiB7XG5cdHJlYWRvbmx5IHJhbmdlOiB2c2NvZGUuUmFuZ2U7XG5cdHJlYWRvbmx5IGV4cHJlc3Npb24/OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IocmFuZ2U6IHZzY29kZS5SYW5nZSwgZXhwcmVzc2lvbj86IHN0cmluZykge1xuXHRcdHRoaXMucmFuZ2UgPSByYW5nZTtcblx0XHR0aGlzLmV4cHJlc3Npb24gPSBleHByZXNzaW9uO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZCB7XG5cdEludm9rZSA9IDAsXG5cdEF1dG9tYXRpYyA9IDEsXG59XG5cbmV4cG9ydCBlbnVtIElubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbktpbmQge1xuXHRPdGhlciA9IDAsXG5cdEVtcHR5ID0gMSxcblx0VG9rZW5DYW5jZWxsYXRpb24gPSAyLFxuXHRMb3N0UmFjZSA9IDMsXG5cdE5vdFRha2VuID0gNCxcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgSW5saW5lVmFsdWVUZXh0IGltcGxlbWVudHMgdnNjb2RlLklubGluZVZhbHVlVGV4dCB7XG5cdHJlYWRvbmx5IHJhbmdlOiBSYW5nZTtcblx0cmVhZG9ubHkgdGV4dDogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHJhbmdlOiBSYW5nZSwgdGV4dDogc3RyaW5nKSB7XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMudGV4dCA9IHRleHQ7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgSW5saW5lVmFsdWVWYXJpYWJsZUxvb2t1cCBpbXBsZW1lbnRzIHZzY29kZS5JbmxpbmVWYWx1ZVZhcmlhYmxlTG9va3VwIHtcblx0cmVhZG9ubHkgcmFuZ2U6IFJhbmdlO1xuXHRyZWFkb25seSB2YXJpYWJsZU5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNhc2VTZW5zaXRpdmVMb29rdXA6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IocmFuZ2U6IFJhbmdlLCB2YXJpYWJsZU5hbWU/OiBzdHJpbmcsIGNhc2VTZW5zaXRpdmVMb29rdXA6IGJvb2xlYW4gPSB0cnVlKSB7XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMudmFyaWFibGVOYW1lID0gdmFyaWFibGVOYW1lO1xuXHRcdHRoaXMuY2FzZVNlbnNpdGl2ZUxvb2t1cCA9IGNhc2VTZW5zaXRpdmVMb29rdXA7XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgSW5saW5lVmFsdWVFdmFsdWF0YWJsZUV4cHJlc3Npb24gaW1wbGVtZW50cyB2c2NvZGUuSW5saW5lVmFsdWVFdmFsdWF0YWJsZUV4cHJlc3Npb24ge1xuXHRyZWFkb25seSByYW5nZTogUmFuZ2U7XG5cdHJlYWRvbmx5IGV4cHJlc3Npb24/OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IocmFuZ2U6IFJhbmdlLCBleHByZXNzaW9uPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5yYW5nZSA9IHJhbmdlO1xuXHRcdHRoaXMuZXhwcmVzc2lvbiA9IGV4cHJlc3Npb247XG5cdH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgSW5saW5lVmFsdWVDb250ZXh0IGltcGxlbWVudHMgdnNjb2RlLklubGluZVZhbHVlQ29udGV4dCB7XG5cblx0cmVhZG9ubHkgZnJhbWVJZDogbnVtYmVyO1xuXHRyZWFkb25seSBzdG9wcGVkTG9jYXRpb246IHZzY29kZS5SYW5nZTtcblxuXHRjb25zdHJ1Y3RvcihmcmFtZUlkOiBudW1iZXIsIHJhbmdlOiB2c2NvZGUuUmFuZ2UpIHtcblx0XHR0aGlzLmZyYW1lSWQgPSBmcmFtZUlkO1xuXHRcdHRoaXMuc3RvcHBlZExvY2F0aW9uID0gcmFuZ2U7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gTmV3U3ltYm9sTmFtZVRhZyB7XG5cdEFJR2VuZXJhdGVkID0gMVxufVxuXG5leHBvcnQgZW51bSBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQge1xuXHRJbnZva2UgPSAwLFxuXHRBdXRvbWF0aWMgPSAxLFxufVxuXG5leHBvcnQgY2xhc3MgTmV3U3ltYm9sTmFtZSBpbXBsZW1lbnRzIHZzY29kZS5OZXdTeW1ib2xOYW1lIHtcblx0cmVhZG9ubHkgbmV3U3ltYm9sTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSB0YWdzPzogcmVhZG9ubHkgdnNjb2RlLk5ld1N5bWJvbE5hbWVUYWdbXSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRuZXdTeW1ib2xOYW1lOiBzdHJpbmcsXG5cdFx0dGFncz86IHJlYWRvbmx5IE5ld1N5bWJvbE5hbWVUYWdbXVxuXHQpIHtcblx0XHR0aGlzLm5ld1N5bWJvbE5hbWUgPSBuZXdTeW1ib2xOYW1lO1xuXHRcdHRoaXMudGFncyA9IHRhZ3M7XG5cdH1cbn1cblxuLy8jcmVnaW9uIGZpbGUgYXBpXG5cbmV4cG9ydCBlbnVtIEZpbGVDaGFuZ2VUeXBlIHtcblx0Q2hhbmdlZCA9IDEsXG5cdENyZWF0ZWQgPSAyLFxuXHREZWxldGVkID0gMyxcbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgRmlsZVN5c3RlbUVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXG5cdHN0YXRpYyBGaWxlRXhpc3RzKG1lc3NhZ2VPclVyaT86IHN0cmluZyB8IFVSSSk6IEZpbGVTeXN0ZW1FcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBGaWxlU3lzdGVtRXJyb3IobWVzc2FnZU9yVXJpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUV4aXN0cywgRmlsZVN5c3RlbUVycm9yLkZpbGVFeGlzdHMpO1xuXHR9XG5cdHN0YXRpYyBGaWxlTm90Rm91bmQobWVzc2FnZU9yVXJpPzogc3RyaW5nIHwgVVJJKTogRmlsZVN5c3RlbUVycm9yIHtcblx0XHRyZXR1cm4gbmV3IEZpbGVTeXN0ZW1FcnJvcihtZXNzYWdlT3JVcmksIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5GaWxlTm90Rm91bmQsIEZpbGVTeXN0ZW1FcnJvci5GaWxlTm90Rm91bmQpO1xuXHR9XG5cdHN0YXRpYyBGaWxlTm90QURpcmVjdG9yeShtZXNzYWdlT3JVcmk/OiBzdHJpbmcgfCBVUkkpOiBGaWxlU3lzdGVtRXJyb3Ige1xuXHRcdHJldHVybiBuZXcgRmlsZVN5c3RlbUVycm9yKG1lc3NhZ2VPclVyaSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLkZpbGVOb3RBRGlyZWN0b3J5LCBGaWxlU3lzdGVtRXJyb3IuRmlsZU5vdEFEaXJlY3RvcnkpO1xuXHR9XG5cdHN0YXRpYyBGaWxlSXNBRGlyZWN0b3J5KG1lc3NhZ2VPclVyaT86IHN0cmluZyB8IFVSSSk6IEZpbGVTeXN0ZW1FcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBGaWxlU3lzdGVtRXJyb3IobWVzc2FnZU9yVXJpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZUlzQURpcmVjdG9yeSwgRmlsZVN5c3RlbUVycm9yLkZpbGVJc0FEaXJlY3RvcnkpO1xuXHR9XG5cdHN0YXRpYyBOb1Blcm1pc3Npb25zKG1lc3NhZ2VPclVyaT86IHN0cmluZyB8IFVSSSk6IEZpbGVTeXN0ZW1FcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBGaWxlU3lzdGVtRXJyb3IobWVzc2FnZU9yVXJpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucywgRmlsZVN5c3RlbUVycm9yLk5vUGVybWlzc2lvbnMpO1xuXHR9XG5cdHN0YXRpYyBVbmF2YWlsYWJsZShtZXNzYWdlT3JVcmk/OiBzdHJpbmcgfCBVUkkpOiBGaWxlU3lzdGVtRXJyb3Ige1xuXHRcdHJldHVybiBuZXcgRmlsZVN5c3RlbUVycm9yKG1lc3NhZ2VPclVyaSwgRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVuYXZhaWxhYmxlLCBGaWxlU3lzdGVtRXJyb3IuVW5hdmFpbGFibGUpO1xuXHR9XG5cblx0cmVhZG9ubHkgY29kZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHVyaU9yTWVzc2FnZT86IHN0cmluZyB8IFVSSSwgY29kZTogRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlID0gRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLlVua25vd24sIHRlcm1pbmF0b3I/OiBGdW5jdGlvbikge1xuXHRcdHN1cGVyKFVSSS5pc1VyaSh1cmlPck1lc3NhZ2UpID8gdXJpT3JNZXNzYWdlLnRvU3RyaW5nKHRydWUpIDogdXJpT3JNZXNzYWdlKTtcblxuXHRcdHRoaXMuY29kZSA9IHRlcm1pbmF0b3I/Lm5hbWUgPz8gJ1Vua25vd24nO1xuXG5cdFx0Ly8gbWFyayB0aGUgZXJyb3IgYXMgZmlsZSBzeXN0ZW0gcHJvdmlkZXIgZXJyb3Igc28gdGhhdFxuXHRcdC8vIHdlIGNhbiBleHRyYWN0IHRoZSBlcnJvciBjb2RlIG9uIHRoZSByZWNlaXZpbmcgc2lkZVxuXHRcdG1hcmtBc0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yKHRoaXMsIGNvZGUpO1xuXG5cdFx0Ly8gd29ya2Fyb3VuZCB3aGVuIGV4dGVuZGluZyBidWlsdGluIG9iamVjdHMgYW5kIHdoZW4gY29tcGlsaW5nIHRvIEVTNSwgc2VlOlxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvVHlwZVNjcmlwdC13aWtpL2Jsb2IvbWFzdGVyL0JyZWFraW5nLUNoYW5nZXMubWQjZXh0ZW5kaW5nLWJ1aWx0LWlucy1saWtlLWVycm9yLWFycmF5LWFuZC1tYXAtbWF5LW5vLWxvbmdlci13b3JrXG5cdFx0T2JqZWN0LnNldFByb3RvdHlwZU9mKHRoaXMsIEZpbGVTeXN0ZW1FcnJvci5wcm90b3R5cGUpO1xuXG5cdFx0aWYgKHR5cGVvZiBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSA9PT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgdGVybWluYXRvciA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0Ly8gbmljZSBzdGFjayB0cmFjZXNcblx0XHRcdEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMsIHRlcm1pbmF0b3IpO1xuXHRcdH1cblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGZvbGRpbmcgYXBpXG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIEZvbGRpbmdSYW5nZSB7XG5cblx0c3RhcnQ6IG51bWJlcjtcblxuXHRlbmQ6IG51bWJlcjtcblxuXHRraW5kPzogRm9sZGluZ1JhbmdlS2luZDtcblxuXHRjb25zdHJ1Y3RvcihzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwga2luZD86IEZvbGRpbmdSYW5nZUtpbmQpIHtcblx0XHR0aGlzLnN0YXJ0ID0gc3RhcnQ7XG5cdFx0dGhpcy5lbmQgPSBlbmQ7XG5cdFx0dGhpcy5raW5kID0ga2luZDtcblx0fVxufVxuXG5leHBvcnQgZW51bSBGb2xkaW5nUmFuZ2VLaW5kIHtcblx0Q29tbWVudCA9IDEsXG5cdEltcG9ydHMgPSAyLFxuXHRSZWdpb24gPSAzXG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gQ29tbWVudFxuZXhwb3J0IGVudW0gQ29tbWVudFRocmVhZENvbGxhcHNpYmxlU3RhdGUge1xuXHQvKipcblx0ICogRGV0ZXJtaW5lcyBhbiBpdGVtIGlzIGNvbGxhcHNlZFxuXHQgKi9cblx0Q29sbGFwc2VkID0gMCxcblx0LyoqXG5cdCAqIERldGVybWluZXMgYW4gaXRlbSBpcyBleHBhbmRlZFxuXHQgKi9cblx0RXhwYW5kZWQgPSAxXG59XG5cbmV4cG9ydCBlbnVtIENvbW1lbnRNb2RlIHtcblx0RWRpdGluZyA9IDAsXG5cdFByZXZpZXcgPSAxXG59XG5cbmV4cG9ydCBlbnVtIENvbW1lbnRTdGF0ZSB7XG5cdFB1Ymxpc2hlZCA9IDAsXG5cdERyYWZ0ID0gMVxufVxuXG5leHBvcnQgZW51bSBDb21tZW50VGhyZWFkU3RhdGUge1xuXHRVbnJlc29sdmVkID0gMCxcblx0UmVzb2x2ZWQgPSAxXG59XG5cbmV4cG9ydCBlbnVtIENvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IHtcblx0Q3VycmVudCA9IDAsXG5cdE91dGRhdGVkID0gMVxufVxuXG5leHBvcnQgZW51bSBDb21tZW50VGhyZWFkRm9jdXMge1xuXHRSZXBseSA9IDEsXG5cdENvbW1lbnQgPSAyXG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU2VtYW50aWMgQ29sb3JpbmdcblxuZXhwb3J0IGNsYXNzIFNlbWFudGljVG9rZW5zTGVnZW5kIHtcblx0cHVibGljIHJlYWRvbmx5IHRva2VuVHlwZXM6IHN0cmluZ1tdO1xuXHRwdWJsaWMgcmVhZG9ubHkgdG9rZW5Nb2RpZmllcnM6IHN0cmluZ1tdO1xuXG5cdGNvbnN0cnVjdG9yKHRva2VuVHlwZXM6IHN0cmluZ1tdLCB0b2tlbk1vZGlmaWVyczogc3RyaW5nW10gPSBbXSkge1xuXHRcdHRoaXMudG9rZW5UeXBlcyA9IHRva2VuVHlwZXM7XG5cdFx0dGhpcy50b2tlbk1vZGlmaWVycyA9IHRva2VuTW9kaWZpZXJzO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzU3RyQXJyYXlPclVuZGVmaW5lZChhcmc6IGFueSk6IGFyZyBpcyBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiAoKHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnKSB8fCBpc1N0cmluZ0FycmF5KGFyZykpO1xufVxuXG5leHBvcnQgY2xhc3MgU2VtYW50aWNUb2tlbnNCdWlsZGVyIHtcblxuXHRwcml2YXRlIF9wcmV2TGluZTogbnVtYmVyO1xuXHRwcml2YXRlIF9wcmV2Q2hhcjogbnVtYmVyO1xuXHRwcml2YXRlIF9kYXRhSXNTb3J0ZWRBbmREZWx0YUVuY29kZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2RhdGE6IG51bWJlcltdO1xuXHRwcml2YXRlIF9kYXRhTGVuOiBudW1iZXI7XG5cdHByaXZhdGUgX3Rva2VuVHlwZVN0clRvSW50OiBNYXA8c3RyaW5nLCBudW1iZXI+O1xuXHRwcml2YXRlIF90b2tlbk1vZGlmaWVyU3RyVG9JbnQ6IE1hcDxzdHJpbmcsIG51bWJlcj47XG5cdHByaXZhdGUgX2hhc0xlZ2VuZDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihsZWdlbmQ/OiB2c2NvZGUuU2VtYW50aWNUb2tlbnNMZWdlbmQpIHtcblx0XHR0aGlzLl9wcmV2TGluZSA9IDA7XG5cdFx0dGhpcy5fcHJldkNoYXIgPSAwO1xuXHRcdHRoaXMuX2RhdGFJc1NvcnRlZEFuZERlbHRhRW5jb2RlZCA9IHRydWU7XG5cdFx0dGhpcy5fZGF0YSA9IFtdO1xuXHRcdHRoaXMuX2RhdGFMZW4gPSAwO1xuXHRcdHRoaXMuX3Rva2VuVHlwZVN0clRvSW50ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHR0aGlzLl90b2tlbk1vZGlmaWVyU3RyVG9JbnQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdHRoaXMuX2hhc0xlZ2VuZCA9IGZhbHNlO1xuXHRcdGlmIChsZWdlbmQpIHtcblx0XHRcdHRoaXMuX2hhc0xlZ2VuZCA9IHRydWU7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGVnZW5kLnRva2VuVHlwZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0dGhpcy5fdG9rZW5UeXBlU3RyVG9JbnQuc2V0KGxlZ2VuZC50b2tlblR5cGVzW2ldLCBpKTtcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsZWdlbmQudG9rZW5Nb2RpZmllcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0dGhpcy5fdG9rZW5Nb2RpZmllclN0clRvSW50LnNldChsZWdlbmQudG9rZW5Nb2RpZmllcnNbaV0sIGkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBwdXNoKGxpbmU6IG51bWJlciwgY2hhcjogbnVtYmVyLCBsZW5ndGg6IG51bWJlciwgdG9rZW5UeXBlOiBudW1iZXIsIHRva2VuTW9kaWZpZXJzPzogbnVtYmVyKTogdm9pZDtcblx0cHVibGljIHB1c2gocmFuZ2U6IFJhbmdlLCB0b2tlblR5cGU6IHN0cmluZywgdG9rZW5Nb2RpZmllcnM/OiBzdHJpbmdbXSk6IHZvaWQ7XG5cdHB1YmxpYyBwdXNoKGFyZzA6IGFueSwgYXJnMTogYW55LCBhcmcyOiBhbnksIGFyZzM/OiBhbnksIGFyZzQ/OiBhbnkpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIGFyZzAgPT09ICdudW1iZXInICYmIHR5cGVvZiBhcmcxID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgYXJnMiA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGFyZzMgPT09ICdudW1iZXInICYmICh0eXBlb2YgYXJnNCA9PT0gJ251bWJlcicgfHwgdHlwZW9mIGFyZzQgPT09ICd1bmRlZmluZWQnKSkge1xuXHRcdFx0aWYgKHR5cGVvZiBhcmc0ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRhcmc0ID0gMDtcblx0XHRcdH1cblx0XHRcdC8vIDFzdCBvdmVybG9hZFxuXHRcdFx0cmV0dXJuIHRoaXMuX3B1c2hFbmNvZGVkKGFyZzAsIGFyZzEsIGFyZzIsIGFyZzMsIGFyZzQpO1xuXHRcdH1cblx0XHRpZiAoUmFuZ2UuaXNSYW5nZShhcmcwKSAmJiB0eXBlb2YgYXJnMSA9PT0gJ3N0cmluZycgJiYgaXNTdHJBcnJheU9yVW5kZWZpbmVkKGFyZzIpKSB7XG5cdFx0XHQvLyAybmQgb3ZlcmxvYWRcblx0XHRcdHJldHVybiB0aGlzLl9wdXNoKGFyZzAsIGFyZzEsIGFyZzIpO1xuXHRcdH1cblx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3B1c2gocmFuZ2U6IHZzY29kZS5SYW5nZSwgdG9rZW5UeXBlOiBzdHJpbmcsIHRva2VuTW9kaWZpZXJzPzogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc0xlZ2VuZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdMZWdlbmQgbXVzdCBiZSBwcm92aWRlZCBpbiBjb25zdHJ1Y3RvcicpO1xuXHRcdH1cblx0XHRpZiAocmFuZ2Uuc3RhcnQubGluZSAhPT0gcmFuZ2UuZW5kLmxpbmUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignYHJhbmdlYCBjYW5ub3Qgc3BhbiBtdWx0aXBsZSBsaW5lcycpO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3Rva2VuVHlwZVN0clRvSW50Lmhhcyh0b2tlblR5cGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2B0b2tlblR5cGVgIGlzIG5vdCBpbiB0aGUgcHJvdmlkZWQgbGVnZW5kJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmUgPSByYW5nZS5zdGFydC5saW5lO1xuXHRcdGNvbnN0IGNoYXIgPSByYW5nZS5zdGFydC5jaGFyYWN0ZXI7XG5cdFx0Y29uc3QgbGVuZ3RoID0gcmFuZ2UuZW5kLmNoYXJhY3RlciAtIHJhbmdlLnN0YXJ0LmNoYXJhY3Rlcjtcblx0XHRjb25zdCBuVG9rZW5UeXBlID0gdGhpcy5fdG9rZW5UeXBlU3RyVG9JbnQuZ2V0KHRva2VuVHlwZSkhO1xuXHRcdGxldCBuVG9rZW5Nb2RpZmllcnMgPSAwO1xuXHRcdGlmICh0b2tlbk1vZGlmaWVycykge1xuXHRcdFx0Zm9yIChjb25zdCB0b2tlbk1vZGlmaWVyIG9mIHRva2VuTW9kaWZpZXJzKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fdG9rZW5Nb2RpZmllclN0clRvSW50Lmhhcyh0b2tlbk1vZGlmaWVyKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignYHRva2VuTW9kaWZpZXJgIGlzIG5vdCBpbiB0aGUgcHJvdmlkZWQgbGVnZW5kJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgblRva2VuTW9kaWZpZXIgPSB0aGlzLl90b2tlbk1vZGlmaWVyU3RyVG9JbnQuZ2V0KHRva2VuTW9kaWZpZXIpITtcblx0XHRcdFx0blRva2VuTW9kaWZpZXJzIHw9ICgxIDw8IG5Ub2tlbk1vZGlmaWVyKSA+Pj4gMDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcHVzaEVuY29kZWQobGluZSwgY2hhciwgbGVuZ3RoLCBuVG9rZW5UeXBlLCBuVG9rZW5Nb2RpZmllcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHVzaEVuY29kZWQobGluZTogbnVtYmVyLCBjaGFyOiBudW1iZXIsIGxlbmd0aDogbnVtYmVyLCB0b2tlblR5cGU6IG51bWJlciwgdG9rZW5Nb2RpZmllcnM6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kYXRhSXNTb3J0ZWRBbmREZWx0YUVuY29kZWQgJiYgKGxpbmUgPCB0aGlzLl9wcmV2TGluZSB8fCAobGluZSA9PT0gdGhpcy5fcHJldkxpbmUgJiYgY2hhciA8IHRoaXMuX3ByZXZDaGFyKSkpIHtcblx0XHRcdC8vIHB1c2ggY2FsbHMgd2VyZSBvcmRlcmVkIGFuZCBhcmUgbm8gbG9uZ2VyIG9yZGVyZWRcblx0XHRcdHRoaXMuX2RhdGFJc1NvcnRlZEFuZERlbHRhRW5jb2RlZCA9IGZhbHNlO1xuXG5cdFx0XHQvLyBSZW1vdmUgZGVsdGEgZW5jb2RpbmcgZnJvbSBkYXRhXG5cdFx0XHRjb25zdCB0b2tlbkNvdW50ID0gKHRoaXMuX2RhdGEubGVuZ3RoIC8gNSkgfCAwO1xuXHRcdFx0bGV0IHByZXZMaW5lID0gMDtcblx0XHRcdGxldCBwcmV2Q2hhciA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRva2VuQ291bnQ7IGkrKykge1xuXHRcdFx0XHRsZXQgbGluZSA9IHRoaXMuX2RhdGFbNSAqIGldO1xuXHRcdFx0XHRsZXQgY2hhciA9IHRoaXMuX2RhdGFbNSAqIGkgKyAxXTtcblxuXHRcdFx0XHRpZiAobGluZSA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIG9uIHRoZSBzYW1lIGxpbmUgYXMgcHJldmlvdXMgdG9rZW5cblx0XHRcdFx0XHRsaW5lID0gcHJldkxpbmU7XG5cdFx0XHRcdFx0Y2hhciArPSBwcmV2Q2hhcjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBvbiBhIGRpZmZlcmVudCBsaW5lIHRoYW4gcHJldmlvdXMgdG9rZW5cblx0XHRcdFx0XHRsaW5lICs9IHByZXZMaW5lO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fZGF0YVs1ICogaV0gPSBsaW5lO1xuXHRcdFx0XHR0aGlzLl9kYXRhWzUgKiBpICsgMV0gPSBjaGFyO1xuXG5cdFx0XHRcdHByZXZMaW5lID0gbGluZTtcblx0XHRcdFx0cHJldkNoYXIgPSBjaGFyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBwdXNoTGluZSA9IGxpbmU7XG5cdFx0bGV0IHB1c2hDaGFyID0gY2hhcjtcblx0XHRpZiAodGhpcy5fZGF0YUlzU29ydGVkQW5kRGVsdGFFbmNvZGVkICYmIHRoaXMuX2RhdGFMZW4gPiAwKSB7XG5cdFx0XHRwdXNoTGluZSAtPSB0aGlzLl9wcmV2TGluZTtcblx0XHRcdGlmIChwdXNoTGluZSA9PT0gMCkge1xuXHRcdFx0XHRwdXNoQ2hhciAtPSB0aGlzLl9wcmV2Q2hhcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9kYXRhW3RoaXMuX2RhdGFMZW4rK10gPSBwdXNoTGluZTtcblx0XHR0aGlzLl9kYXRhW3RoaXMuX2RhdGFMZW4rK10gPSBwdXNoQ2hhcjtcblx0XHR0aGlzLl9kYXRhW3RoaXMuX2RhdGFMZW4rK10gPSBsZW5ndGg7XG5cdFx0dGhpcy5fZGF0YVt0aGlzLl9kYXRhTGVuKytdID0gdG9rZW5UeXBlO1xuXHRcdHRoaXMuX2RhdGFbdGhpcy5fZGF0YUxlbisrXSA9IHRva2VuTW9kaWZpZXJzO1xuXG5cdFx0dGhpcy5fcHJldkxpbmUgPSBsaW5lO1xuXHRcdHRoaXMuX3ByZXZDaGFyID0gY2hhcjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zb3J0QW5kRGVsdGFFbmNvZGUoZGF0YTogbnVtYmVyW10pOiBVaW50MzJBcnJheSB7XG5cdFx0Y29uc3QgcG9zOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHRva2VuQ291bnQgPSAoZGF0YS5sZW5ndGggLyA1KSB8IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbkNvdW50OyBpKyspIHtcblx0XHRcdHBvc1tpXSA9IGk7XG5cdFx0fVxuXHRcdHBvcy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRjb25zdCBhTGluZSA9IGRhdGFbNSAqIGFdO1xuXHRcdFx0Y29uc3QgYkxpbmUgPSBkYXRhWzUgKiBiXTtcblx0XHRcdGlmIChhTGluZSA9PT0gYkxpbmUpIHtcblx0XHRcdFx0Y29uc3QgYUNoYXIgPSBkYXRhWzUgKiBhICsgMV07XG5cdFx0XHRcdGNvbnN0IGJDaGFyID0gZGF0YVs1ICogYiArIDFdO1xuXHRcdFx0XHRyZXR1cm4gYUNoYXIgLSBiQ2hhcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhTGluZSAtIGJMaW5lO1xuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50MzJBcnJheShkYXRhLmxlbmd0aCk7XG5cdFx0bGV0IHByZXZMaW5lID0gMDtcblx0XHRsZXQgcHJldkNoYXIgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5Db3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzcmNPZmZzZXQgPSA1ICogcG9zW2ldO1xuXHRcdFx0Y29uc3QgbGluZSA9IGRhdGFbc3JjT2Zmc2V0ICsgMF07XG5cdFx0XHRjb25zdCBjaGFyID0gZGF0YVtzcmNPZmZzZXQgKyAxXTtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IGRhdGFbc3JjT2Zmc2V0ICsgMl07XG5cdFx0XHRjb25zdCB0b2tlblR5cGUgPSBkYXRhW3NyY09mZnNldCArIDNdO1xuXHRcdFx0Y29uc3QgdG9rZW5Nb2RpZmllcnMgPSBkYXRhW3NyY09mZnNldCArIDRdO1xuXG5cdFx0XHRjb25zdCBwdXNoTGluZSA9IGxpbmUgLSBwcmV2TGluZTtcblx0XHRcdGNvbnN0IHB1c2hDaGFyID0gKHB1c2hMaW5lID09PSAwID8gY2hhciAtIHByZXZDaGFyIDogY2hhcik7XG5cblx0XHRcdGNvbnN0IGRzdE9mZnNldCA9IDUgKiBpO1xuXHRcdFx0cmVzdWx0W2RzdE9mZnNldCArIDBdID0gcHVzaExpbmU7XG5cdFx0XHRyZXN1bHRbZHN0T2Zmc2V0ICsgMV0gPSBwdXNoQ2hhcjtcblx0XHRcdHJlc3VsdFtkc3RPZmZzZXQgKyAyXSA9IGxlbmd0aDtcblx0XHRcdHJlc3VsdFtkc3RPZmZzZXQgKyAzXSA9IHRva2VuVHlwZTtcblx0XHRcdHJlc3VsdFtkc3RPZmZzZXQgKyA0XSA9IHRva2VuTW9kaWZpZXJzO1xuXG5cdFx0XHRwcmV2TGluZSA9IGxpbmU7XG5cdFx0XHRwcmV2Q2hhciA9IGNoYXI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBidWlsZChyZXN1bHRJZD86IHN0cmluZyk6IFNlbWFudGljVG9rZW5zIHtcblx0XHRpZiAoIXRoaXMuX2RhdGFJc1NvcnRlZEFuZERlbHRhRW5jb2RlZCkge1xuXHRcdFx0cmV0dXJuIG5ldyBTZW1hbnRpY1Rva2VucyhTZW1hbnRpY1Rva2Vuc0J1aWxkZXIuX3NvcnRBbmREZWx0YUVuY29kZSh0aGlzLl9kYXRhKSwgcmVzdWx0SWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFNlbWFudGljVG9rZW5zKG5ldyBVaW50MzJBcnJheSh0aGlzLl9kYXRhKSwgcmVzdWx0SWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZW1hbnRpY1Rva2VucyB7XG5cdHJlYWRvbmx5IHJlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRhdGE6IFVpbnQzMkFycmF5O1xuXG5cdGNvbnN0cnVjdG9yKGRhdGE6IFVpbnQzMkFycmF5LCByZXN1bHRJZD86IHN0cmluZykge1xuXHRcdHRoaXMucmVzdWx0SWQgPSByZXN1bHRJZDtcblx0XHR0aGlzLmRhdGEgPSBkYXRhO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZW1hbnRpY1Rva2Vuc0VkaXQge1xuXHRyZWFkb25seSBzdGFydDogbnVtYmVyO1xuXHRyZWFkb25seSBkZWxldGVDb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBkYXRhOiBVaW50MzJBcnJheSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBkYXRhPzogVWludDMyQXJyYXkpIHtcblx0XHR0aGlzLnN0YXJ0ID0gc3RhcnQ7XG5cdFx0dGhpcy5kZWxldGVDb3VudCA9IGRlbGV0ZUNvdW50O1xuXHRcdHRoaXMuZGF0YSA9IGRhdGE7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlbWFudGljVG9rZW5zRWRpdHMge1xuXHRyZWFkb25seSByZXN1bHRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBlZGl0czogU2VtYW50aWNUb2tlbnNFZGl0W107XG5cblx0Y29uc3RydWN0b3IoZWRpdHM6IFNlbWFudGljVG9rZW5zRWRpdFtdLCByZXN1bHRJZD86IHN0cmluZykge1xuXHRcdHRoaXMucmVzdWx0SWQgPSByZXN1bHRJZDtcblx0XHR0aGlzLmVkaXRzID0gZWRpdHM7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBkZWJ1Z1xuZXhwb3J0IGVudW0gRGVidWdDb25zb2xlTW9kZSB7XG5cdC8qKlxuXHQgKiBEZWJ1ZyBzZXNzaW9uIHNob3VsZCBoYXZlIGEgc2VwYXJhdGUgZGVidWcgY29uc29sZS5cblx0ICovXG5cdFNlcGFyYXRlID0gMCxcblxuXHQvKipcblx0ICogRGVidWcgc2Vzc2lvbiBzaG91bGQgc2hhcmUgZGVidWcgY29uc29sZSB3aXRoIGl0cyBwYXJlbnQgc2Vzc2lvbi5cblx0ICogVGhpcyB2YWx1ZSBoYXMgbm8gZWZmZWN0IGZvciBzZXNzaW9ucyB3aGljaCBkbyBub3QgaGF2ZSBhIHBhcmVudCBzZXNzaW9uLlxuXHQgKi9cblx0TWVyZ2VXaXRoUGFyZW50ID0gMVxufVxuXG5leHBvcnQgY2xhc3MgRGVidWdWaXN1YWxpemF0aW9uIHtcblx0aWNvblBhdGg/OiBVUkkgfCB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9IHwgVGhlbWVJY29uO1xuXHR2aXN1YWxpemF0aW9uPzogdnNjb2RlLkNvbW1hbmQgfCB2c2NvZGUuVHJlZURhdGFQcm92aWRlcjx1bmtub3duPjtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgbmFtZTogc3RyaW5nKSB7IH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbmV4cG9ydCBlbnVtIFF1aWNrSW5wdXRCdXR0b25Mb2NhdGlvbiB7XG5cdFRpdGxlID0gMSxcblx0SW5saW5lID0gMixcblx0SW5wdXQgPSAzXG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFF1aWNrSW5wdXRCdXR0b25zIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQmFjazogdnNjb2RlLlF1aWNrSW5wdXRCdXR0b24gPSB7IGljb25QYXRoOiBuZXcgVGhlbWVJY29uKCdhcnJvdy1sZWZ0JykgfTtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKCkgeyB9XG59XG5cbmV4cG9ydCBlbnVtIFF1aWNrUGlja0l0ZW1LaW5kIHtcblx0U2VwYXJhdG9yID0gLTEsXG5cdERlZmF1bHQgPSAwLFxufVxuXG5leHBvcnQgZW51bSBJbnB1dEJveFZhbGlkYXRpb25TZXZlcml0eSB7XG5cdEluZm8gPSAxLFxuXHRXYXJuaW5nID0gMixcblx0RXJyb3IgPSAzXG59XG5cbmV4cG9ydCBlbnVtIEV4dGVuc2lvbktpbmQge1xuXHRVSSA9IDEsXG5cdFdvcmtzcGFjZSA9IDJcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVEZWNvcmF0aW9uIHtcblxuXHRzdGF0aWMgdmFsaWRhdGUoZDogRmlsZURlY29yYXRpb24pOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIGQuYmFkZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRsZXQgbGVuID0gbmV4dENoYXJMZW5ndGgoZC5iYWRnZSwgMCk7XG5cdFx0XHRpZiAobGVuIDwgZC5iYWRnZS5sZW5ndGgpIHtcblx0XHRcdFx0bGVuICs9IG5leHRDaGFyTGVuZ3RoKGQuYmFkZ2UsIGxlbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZC5iYWRnZS5sZW5ndGggPiBsZW4pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUaGUgJ2JhZGdlJy1wcm9wZXJ0eSBtdXN0IGJlIHVuZGVmaW5lZCBvciBhIHNob3J0IGNoYXJhY3RlcmApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZC5iYWRnZSkge1xuXHRcdFx0aWYgKCFUaGVtZUljb24uaXNUaGVtZUljb24oZC5iYWRnZSkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBUaGUgJ2JhZGdlJy1wcm9wZXJ0eSBpcyBub3QgYSB2YWxpZCBUaGVtZUljb25gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFkLmNvbG9yICYmICFkLmJhZGdlICYmICFkLnRvb2x0aXApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGhlIGRlY29yYXRpb24gaXMgZW1wdHlgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRiYWRnZT86IHN0cmluZyB8IHZzY29kZS5UaGVtZUljb247XG5cdHRvb2x0aXA/OiBzdHJpbmc7XG5cdGNvbG9yPzogdnNjb2RlLlRoZW1lQ29sb3I7XG5cdHByb3BhZ2F0ZT86IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoYmFkZ2U/OiBzdHJpbmcgfCBUaGVtZUljb24sIHRvb2x0aXA/OiBzdHJpbmcsIGNvbG9yPzogVGhlbWVDb2xvcikge1xuXHRcdHRoaXMuYmFkZ2UgPSBiYWRnZTtcblx0XHR0aGlzLnRvb2x0aXAgPSB0b29sdGlwO1xuXHRcdHRoaXMuY29sb3IgPSBjb2xvcjtcblx0fVxufVxuXG4vLyNyZWdpb24gVGhlbWluZ1xuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBDb2xvclRoZW1lIGltcGxlbWVudHMgdnNjb2RlLkNvbG9yVGhlbWUge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkga2luZDogQ29sb3JUaGVtZUtpbmQpIHtcblx0fVxufVxuXG5leHBvcnQgZW51bSBDb2xvclRoZW1lS2luZCB7XG5cdExpZ2h0ID0gMSxcblx0RGFyayA9IDIsXG5cdEhpZ2hDb250cmFzdCA9IDMsXG5cdEhpZ2hDb250cmFzdExpZ2h0ID0gNFxufVxuXG4vLyNlbmRyZWdpb24gVGhlbWluZ1xuLy8jcmVnaW9uIE5vdGVib29rXG5cbmV4cG9ydCBjbGFzcyBDZWxsRXJyb3JTdGFja0ZyYW1lIHtcblx0LyoqXG5cdCAqIEBwYXJhbSBsYWJlbCBUaGUgbmFtZSBvZiB0aGUgc3RhY2sgZnJhbWVcblx0ICogQHBhcmFtIGZpbGUgVGhlIGZpbGUgVVJJIG9mIHRoZSBzdGFjayBmcmFtZVxuXHQgKiBAcGFyYW0gcG9zaXRpb24gVGhlIHBvc2l0aW9uIG9mIHRoZSBzdGFjayBmcmFtZSB3aXRoaW4gdGhlIGZpbGVcblx0ICovXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyB1cmk/OiB2c2NvZGUuVXJpLFxuXHRcdHB1YmxpYyBwb3NpdGlvbj86IFBvc2l0aW9uLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgZW51bSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZSB7XG5cdElkbGUgPSAxLFxuXHRQZW5kaW5nID0gMixcblx0RXhlY3V0aW5nID0gMyxcbn1cblxuZXhwb3J0IGVudW0gTm90ZWJvb2tDZWxsU3RhdHVzQmFyQWxpZ25tZW50IHtcblx0TGVmdCA9IDEsXG5cdFJpZ2h0ID0gMlxufVxuXG5leHBvcnQgZW51bSBOb3RlYm9va0VkaXRvclJldmVhbFR5cGUge1xuXHREZWZhdWx0ID0gMCxcblx0SW5DZW50ZXIgPSAxLFxuXHRJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0ID0gMixcblx0QXRUb3AgPSAzXG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHRleHQ6IHN0cmluZyxcblx0XHRwdWJsaWMgYWxpZ25tZW50OiBOb3RlYm9va0NlbGxTdGF0dXNCYXJBbGlnbm1lbnQpIHsgfVxufVxuXG5cbmV4cG9ydCBlbnVtIE5vdGVib29rQ29udHJvbGxlckFmZmluaXR5IHtcblx0RGVmYXVsdCA9IDEsXG5cdFByZWZlcnJlZCA9IDJcbn1cblxuZXhwb3J0IGVudW0gTm90ZWJvb2tDb250cm9sbGVyQWZmaW5pdHkyIHtcblx0RGVmYXVsdCA9IDEsXG5cdFByZWZlcnJlZCA9IDIsXG5cdEhpZGRlbiA9IC0xXG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va1JlbmRlcmVyU2NyaXB0IHtcblxuXHRwdWJsaWMgcHJvdmlkZXM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyB1cmk6IHZzY29kZS5VcmksXG5cdFx0cHJvdmlkZXM6IHN0cmluZyB8IHJlYWRvbmx5IHN0cmluZ1tdID0gW11cblx0KSB7XG5cdFx0dGhpcy5wcm92aWRlcyA9IGFzQXJyYXkocHJvdmlkZXMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbiB7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRkZXRhaWw/OiBzdHJpbmc7XG5cdGNvbW1hbmQ/OiB2c2NvZGUuQ29tbWFuZDtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGxhYmVsOiBzdHJpbmdcblx0KSB7IH1cbn1cblxuZXhwb3J0IGVudW0gTm90ZWJvb2tWYXJpYWJsZXNSZXF1ZXN0S2luZCB7XG5cdE5hbWVkID0gMSxcblx0SW5kZXhlZCA9IDJcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBUaW1lbGluZVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBUaW1lbGluZUl0ZW0gaW1wbGVtZW50cyB2c2NvZGUuVGltZWxpbmVJdGVtIHtcblx0Y29uc3RydWN0b3IocHVibGljIGxhYmVsOiBzdHJpbmcsIHB1YmxpYyB0aW1lc3RhbXA6IG51bWJlcikgeyB9XG59XG5cbi8vI2VuZHJlZ2lvbiBUaW1lbGluZVxuXG4vLyNyZWdpb24gRXh0ZW5zaW9uQ29udGV4dFxuXG5leHBvcnQgZW51bSBFeHRlbnNpb25Nb2RlIHtcblx0LyoqXG5cdCAqIFRoZSBleHRlbnNpb24gaXMgaW5zdGFsbGVkIG5vcm1hbGx5IChmb3IgZXhhbXBsZSwgZnJvbSB0aGUgbWFya2V0cGxhY2Vcblx0ICogb3IgVlNJWCkgaW4gVlMgQ29kZS5cblx0ICovXG5cdFByb2R1Y3Rpb24gPSAxLFxuXG5cdC8qKlxuXHQgKiBUaGUgZXh0ZW5zaW9uIGlzIHJ1bm5pbmcgZnJvbSBhbiBgLS1leHRlbnNpb25EZXZlbG9wbWVudFBhdGhgIHByb3ZpZGVkXG5cdCAqIHdoZW4gbGF1bmNoaW5nIFZTIENvZGUuXG5cdCAqL1xuXHREZXZlbG9wbWVudCA9IDIsXG5cblx0LyoqXG5cdCAqIFRoZSBleHRlbnNpb24gaXMgcnVubmluZyBmcm9tIGFuIGAtLWV4dGVuc2lvbkRldmVsb3BtZW50UGF0aGAgYW5kXG5cdCAqIHRoZSBleHRlbnNpb24gaG9zdCBpcyBydW5uaW5nIHVuaXQgdGVzdHMuXG5cdCAqL1xuXHRUZXN0ID0gMyxcbn1cblxuZXhwb3J0IGVudW0gRXh0ZW5zaW9uUnVudGltZSB7XG5cdC8qKlxuXHQgKiBUaGUgZXh0ZW5zaW9uIGlzIHJ1bm5pbmcgaW4gYSBOb2RlSlMgZXh0ZW5zaW9uIGhvc3QuIFJ1bnRpbWUgYWNjZXNzIHRvIE5vZGVKUyBBUElzIGlzIGF2YWlsYWJsZS5cblx0ICovXG5cdE5vZGUgPSAxLFxuXHQvKipcblx0ICogVGhlIGV4dGVuc2lvbiBpcyBydW5uaW5nIGluIGEgV2Vid29ya2VyIGV4dGVuc2lvbiBob3N0LiBSdW50aW1lIGFjY2VzcyBpcyBsaW1pdGVkIHRvIFdlYndvcmtlciBBUElzLlxuXHQgKi9cblx0V2Vid29ya2VyID0gMlxufVxuXG4vLyNlbmRyZWdpb24gRXh0ZW5zaW9uQ29udGV4dFxuXG5leHBvcnQgZW51bSBTdGFuZGFyZFRva2VuVHlwZSB7XG5cdE90aGVyID0gMCxcblx0Q29tbWVudCA9IDEsXG5cdFN0cmluZyA9IDIsXG5cdFJlZ0V4ID0gM1xufVxuXG5leHBvcnQgZW51bSBTeW50YXhIaWdobGlnaHRpbmdUb2tlbkZvbnRTdHlsZSB7XG5cdE5vbmUgPSAwLFxuXHRJdGFsaWMgPSAxLFxuXHRCb2xkID0gMixcblx0VW5kZXJsaW5lID0gNCxcblx0U3RyaWtldGhyb3VnaCA9IDgsXG59XG5cblxuZXhwb3J0IGNsYXNzIExpbmtlZEVkaXRpbmdSYW5nZXMge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgcmFuZ2VzOiBSYW5nZVtdLCBwdWJsaWMgcmVhZG9ubHkgd29yZFBhdHRlcm4/OiBSZWdFeHApIHtcblx0fVxufVxuXG4vLyNyZWdpb24gcG9ydHNcbmV4cG9ydCBjbGFzcyBQb3J0QXR0cmlidXRlcyB7XG5cdHByaXZhdGUgX2F1dG9Gb3J3YXJkQWN0aW9uOiBQb3J0QXV0b0ZvcndhcmRBY3Rpb247XG5cblx0Y29uc3RydWN0b3IoYXV0b0ZvcndhcmRBY3Rpb246IFBvcnRBdXRvRm9yd2FyZEFjdGlvbikge1xuXHRcdHRoaXMuX2F1dG9Gb3J3YXJkQWN0aW9uID0gYXV0b0ZvcndhcmRBY3Rpb247XG5cdH1cblxuXHRnZXQgYXV0b0ZvcndhcmRBY3Rpb24oKTogUG9ydEF1dG9Gb3J3YXJkQWN0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fYXV0b0ZvcndhcmRBY3Rpb247XG5cdH1cbn1cbi8vI2VuZHJlZ2lvbiBwb3J0c1xuXG4vLyNyZWdpb24gVGVzdGluZ1xuZXhwb3J0IGVudW0gVGVzdFJlc3VsdFN0YXRlIHtcblx0UXVldWVkID0gMSxcblx0UnVubmluZyA9IDIsXG5cdFBhc3NlZCA9IDMsXG5cdEZhaWxlZCA9IDQsXG5cdFNraXBwZWQgPSA1LFxuXHRFcnJvcmVkID0gNlxufVxuXG5leHBvcnQgZW51bSBUZXN0UnVuUHJvZmlsZUtpbmQge1xuXHRSdW4gPSAxLFxuXHREZWJ1ZyA9IDIsXG5cdENvdmVyYWdlID0gMyxcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RSdW5Qcm9maWxlQmFzZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBjb250cm9sbGVySWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvZmlsZUlkOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGtpbmQ6IHZzY29kZS5UZXN0UnVuUHJvZmlsZUtpbmQsXG5cdCkgeyB9XG59XG5cbkBlczVDbGFzc0NvbXBhdFxuZXhwb3J0IGNsYXNzIFRlc3RSdW5SZXF1ZXN0IGltcGxlbWVudHMgdnNjb2RlLlRlc3RSdW5SZXF1ZXN0IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGluY2x1ZGU6IHZzY29kZS5UZXN0SXRlbVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBleGNsdWRlOiB2c2NvZGUuVGVzdEl0ZW1bXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcHJvZmlsZTogdnNjb2RlLlRlc3RSdW5Qcm9maWxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBjb250aW51b3VzID0gZmFsc2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IHByZXNlcnZlRm9jdXMgPSB0cnVlLFxuXHQpIHsgfVxufVxuXG5AZXM1Q2xhc3NDb21wYXRcbmV4cG9ydCBjbGFzcyBUZXN0TWVzc2FnZSBpbXBsZW1lbnRzIHZzY29kZS5UZXN0TWVzc2FnZSB7XG5cdHB1YmxpYyBleHBlY3RlZE91dHB1dD86IHN0cmluZztcblx0cHVibGljIGFjdHVhbE91dHB1dD86IHN0cmluZztcblx0cHVibGljIGxvY2F0aW9uPzogdnNjb2RlLkxvY2F0aW9uO1xuXHRwdWJsaWMgY29udGV4dFZhbHVlPzogc3RyaW5nO1xuXG5cdC8qKiBwcm9wb3NlZDogKi9cblx0cHVibGljIHN0YWNrVHJhY2U/OiBUZXN0TWVzc2FnZVN0YWNrRnJhbWVbXTtcblxuXHRwdWJsaWMgc3RhdGljIGRpZmYobWVzc2FnZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nLCBleHBlY3RlZDogc3RyaW5nLCBhY3R1YWw6IHN0cmluZykge1xuXHRcdGNvbnN0IG1zZyA9IG5ldyBUZXN0TWVzc2FnZShtZXNzYWdlKTtcblx0XHRtc2cuZXhwZWN0ZWRPdXRwdXQgPSBleHBlY3RlZDtcblx0XHRtc2cuYWN0dWFsT3V0cHV0ID0gYWN0dWFsO1xuXHRcdHJldHVybiBtc2c7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgbWVzc2FnZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nKSB7IH1cbn1cblxuQGVzNUNsYXNzQ29tcGF0XG5leHBvcnQgY2xhc3MgVGVzdFRhZyBpbXBsZW1lbnRzIHZzY29kZS5UZXN0VGFnIHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmcpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdE1lc3NhZ2VTdGFja0ZyYW1lIHtcblx0LyoqXG5cdCAqIEBwYXJhbSBsYWJlbCBUaGUgbmFtZSBvZiB0aGUgc3RhY2sgZnJhbWVcblx0ICogQHBhcmFtIGZpbGUgVGhlIGZpbGUgVVJJIG9mIHRoZSBzdGFjayBmcmFtZVxuXHQgKiBAcGFyYW0gcG9zaXRpb24gVGhlIHBvc2l0aW9uIG9mIHRoZSBzdGFjayBmcmFtZSB3aXRoaW4gdGhlIGZpbGVcblx0ICovXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyB1cmk/OiB2c2NvZGUuVXJpLFxuXHRcdHB1YmxpYyBwb3NpdGlvbj86IFBvc2l0aW9uLFxuXHQpIHsgfVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFRlc3QgQ292ZXJhZ2VcbmV4cG9ydCBjbGFzcyBUZXN0Q292ZXJhZ2VDb3VudCBpbXBsZW1lbnRzIHZzY29kZS5UZXN0Q292ZXJhZ2VDb3VudCB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBjb3ZlcmVkOiBudW1iZXIsIHB1YmxpYyB0b3RhbDogbnVtYmVyKSB7XG5cdFx0dmFsaWRhdGVUZXN0Q292ZXJhZ2VDb3VudCh0aGlzKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVUZXN0Q292ZXJhZ2VDb3VudChjYz86IHZzY29kZS5UZXN0Q292ZXJhZ2VDb3VudCkge1xuXHRpZiAoIWNjKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0aWYgKGNjLmNvdmVyZWQgPiBjYy50b3RhbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgVGhlIHRvdGFsIG51bWJlciBvZiBjb3ZlcmVkIGl0ZW1zICgke2NjLmNvdmVyZWR9KSBjYW5ub3QgYmUgZ3JlYXRlciB0aGFuIHRoZSB0b3RhbCAoJHtjYy50b3RhbH0pYCk7XG5cdH1cblxuXHRpZiAoY2MudG90YWwgPCAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBUaGUgbnVtYmVyIG9mIGNvdmVyZWQgaXRlbXMgKCR7Y2MudG90YWx9KSBjYW5ub3QgYmUgbmVnYXRpdmVgKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmlsZUNvdmVyYWdlIGltcGxlbWVudHMgdnNjb2RlLkZpbGVDb3ZlcmFnZSB7XG5cdHB1YmxpYyBzdGF0aWMgZnJvbURldGFpbHModXJpOiB2c2NvZGUuVXJpLCBkZXRhaWxzOiB2c2NvZGUuRmlsZUNvdmVyYWdlRGV0YWlsW10pOiB2c2NvZGUuRmlsZUNvdmVyYWdlIHtcblx0XHRjb25zdCBzdGF0ZW1lbnRzID0gbmV3IFRlc3RDb3ZlcmFnZUNvdW50KDAsIDApO1xuXHRcdGNvbnN0IGJyYW5jaGVzID0gbmV3IFRlc3RDb3ZlcmFnZUNvdW50KDAsIDApO1xuXHRcdGNvbnN0IGRlY2wgPSBuZXcgVGVzdENvdmVyYWdlQ291bnQoMCwgMCk7XG5cblx0XHRmb3IgKGNvbnN0IGRldGFpbCBvZiBkZXRhaWxzKSB7XG5cdFx0XHRpZiAoJ2JyYW5jaGVzJyBpbiBkZXRhaWwpIHtcblx0XHRcdFx0c3RhdGVtZW50cy50b3RhbCArPSAxO1xuXHRcdFx0XHRzdGF0ZW1lbnRzLmNvdmVyZWQgKz0gZGV0YWlsLmV4ZWN1dGVkID8gMSA6IDA7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBicmFuY2ggb2YgZGV0YWlsLmJyYW5jaGVzKSB7XG5cdFx0XHRcdFx0YnJhbmNoZXMudG90YWwgKz0gMTtcblx0XHRcdFx0XHRicmFuY2hlcy5jb3ZlcmVkICs9IGJyYW5jaC5leGVjdXRlZCA/IDEgOiAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZWNsLnRvdGFsICs9IDE7XG5cdFx0XHRcdGRlY2wuY292ZXJlZCArPSBkZXRhaWwuZXhlY3V0ZWQgPyAxIDogMDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjb3ZlcmFnZSA9IG5ldyBGaWxlQ292ZXJhZ2UoXG5cdFx0XHR1cmksXG5cdFx0XHRzdGF0ZW1lbnRzLFxuXHRcdFx0YnJhbmNoZXMudG90YWwgPiAwID8gYnJhbmNoZXMgOiB1bmRlZmluZWQsXG5cdFx0XHRkZWNsLnRvdGFsID4gMCA/IGRlY2wgOiB1bmRlZmluZWQsXG5cdFx0KTtcblxuXHRcdGNvdmVyYWdlLmRldGFpbGVkQ292ZXJhZ2UgPSBkZXRhaWxzO1xuXG5cdFx0cmV0dXJuIGNvdmVyYWdlO1xuXHR9XG5cblx0ZGV0YWlsZWRDb3ZlcmFnZT86IHZzY29kZS5GaWxlQ292ZXJhZ2VEZXRhaWxbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdXJpOiB2c2NvZGUuVXJpLFxuXHRcdHB1YmxpYyBzdGF0ZW1lbnRDb3ZlcmFnZTogdnNjb2RlLlRlc3RDb3ZlcmFnZUNvdW50LFxuXHRcdHB1YmxpYyBicmFuY2hDb3ZlcmFnZT86IHZzY29kZS5UZXN0Q292ZXJhZ2VDb3VudCxcblx0XHRwdWJsaWMgZGVjbGFyYXRpb25Db3ZlcmFnZT86IHZzY29kZS5UZXN0Q292ZXJhZ2VDb3VudCxcblx0XHRwdWJsaWMgaW5jbHVkZXNUZXN0czogdnNjb2RlLlRlc3RJdGVtW10gPSBbXSxcblx0KSB7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0YXRlbWVudENvdmVyYWdlIGltcGxlbWVudHMgdnNjb2RlLlN0YXRlbWVudENvdmVyYWdlIHtcblx0Ly8gYmFjayBjb21wYXQgdW50aWwgZmluYWxpemF0aW9uOlxuXHRnZXQgZXhlY3V0aW9uQ291bnQoKSB7IHJldHVybiArdGhpcy5leGVjdXRlZDsgfVxuXHRzZXQgZXhlY3V0aW9uQ291bnQobjogbnVtYmVyKSB7IHRoaXMuZXhlY3V0ZWQgPSBuOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGV4ZWN1dGVkOiBudW1iZXIgfCBib29sZWFuLFxuXHRcdHB1YmxpYyBsb2NhdGlvbjogUG9zaXRpb24gfCBSYW5nZSxcblx0XHRwdWJsaWMgYnJhbmNoZXM6IHZzY29kZS5CcmFuY2hDb3ZlcmFnZVtdID0gW10sXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBCcmFuY2hDb3ZlcmFnZSBpbXBsZW1lbnRzIHZzY29kZS5CcmFuY2hDb3ZlcmFnZSB7XG5cdC8vIGJhY2sgY29tcGF0IHVudGlsIGZpbmFsaXphdGlvbjpcblx0Z2V0IGV4ZWN1dGlvbkNvdW50KCkgeyByZXR1cm4gK3RoaXMuZXhlY3V0ZWQ7IH1cblx0c2V0IGV4ZWN1dGlvbkNvdW50KG46IG51bWJlcikgeyB0aGlzLmV4ZWN1dGVkID0gbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBleGVjdXRlZDogbnVtYmVyIHwgYm9vbGVhbixcblx0XHRwdWJsaWMgbG9jYXRpb246IFBvc2l0aW9uIHwgUmFuZ2UsXG5cdFx0cHVibGljIGxhYmVsPzogc3RyaW5nLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgRGVjbGFyYXRpb25Db3ZlcmFnZSBpbXBsZW1lbnRzIHZzY29kZS5EZWNsYXJhdGlvbkNvdmVyYWdlIHtcblx0Ly8gYmFjayBjb21wYXQgdW50aWwgZmluYWxpemF0aW9uOlxuXHRnZXQgZXhlY3V0aW9uQ291bnQoKSB7IHJldHVybiArdGhpcy5leGVjdXRlZDsgfVxuXHRzZXQgZXhlY3V0aW9uQ291bnQobjogbnVtYmVyKSB7IHRoaXMuZXhlY3V0ZWQgPSBuOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZyxcblx0XHRwdWJsaWMgZXhlY3V0ZWQ6IG51bWJlciB8IGJvb2xlYW4sXG5cdFx0cHVibGljIGxvY2F0aW9uOiBQb3NpdGlvbiB8IFJhbmdlLFxuXHQpIHsgfVxufVxuLy8jZW5kcmVnaW9uXG5cbmV4cG9ydCBlbnVtIEV4dGVybmFsVXJpT3BlbmVyUHJpb3JpdHkge1xuXHROb25lID0gMCxcblx0T3B0aW9uID0gMSxcblx0RGVmYXVsdCA9IDIsXG5cdFByZWZlcnJlZCA9IDMsXG59XG5cbmV4cG9ydCBlbnVtIFdvcmtzcGFjZVRydXN0U3RhdGUge1xuXHRVbnRydXN0ZWQgPSAwLFxuXHRUcnVzdGVkID0gMSxcblx0VW5zcGVjaWZpZWQgPSAyXG59XG5cbmV4cG9ydCBlbnVtIFBvcnRBdXRvRm9yd2FyZEFjdGlvbiB7XG5cdE5vdGlmeSA9IDEsXG5cdE9wZW5Ccm93c2VyID0gMixcblx0T3BlblByZXZpZXcgPSAzLFxuXHRTaWxlbnQgPSA0LFxuXHRJZ25vcmUgPSA1LFxuXHRPcGVuQnJvd3Nlck9uY2UgPSA2XG59XG5cbmV4cG9ydCBjbGFzcyBUeXBlSGllcmFyY2h5SXRlbSB7XG5cdF9zZXNzaW9uSWQ/OiBzdHJpbmc7XG5cdF9pdGVtSWQ/OiBzdHJpbmc7XG5cblx0a2luZDogU3ltYm9sS2luZDtcblx0dGFncz86IFN5bWJvbFRhZ1tdO1xuXHRuYW1lOiBzdHJpbmc7XG5cdGRldGFpbD86IHN0cmluZztcblx0dXJpOiBVUkk7XG5cdHJhbmdlOiBSYW5nZTtcblx0c2VsZWN0aW9uUmFuZ2U6IFJhbmdlO1xuXG5cdGNvbnN0cnVjdG9yKGtpbmQ6IFN5bWJvbEtpbmQsIG5hbWU6IHN0cmluZywgZGV0YWlsOiBzdHJpbmcsIHVyaTogVVJJLCByYW5nZTogUmFuZ2UsIHNlbGVjdGlvblJhbmdlOiBSYW5nZSkge1xuXHRcdHRoaXMua2luZCA9IGtpbmQ7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmRldGFpbCA9IGRldGFpbDtcblx0XHR0aGlzLnVyaSA9IHVyaTtcblx0XHR0aGlzLnJhbmdlID0gcmFuZ2U7XG5cdFx0dGhpcy5zZWxlY3Rpb25SYW5nZSA9IHNlbGVjdGlvblJhbmdlO1xuXHR9XG59XG5cbi8vI3JlZ2lvbiBUYWIgSW5wdXRzXG5cbmV4cG9ydCBjbGFzcyBUZXh0VGFiSW5wdXQge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSB1cmk6IFVSSSkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0RGlmZlRhYklucHV0IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgb3JpZ2luYWw6IFVSSSwgcmVhZG9ubHkgbW9kaWZpZWQ6IFVSSSkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0TWVyZ2VUYWJJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IGJhc2U6IFVSSSwgcmVhZG9ubHkgaW5wdXQxOiBVUkksIHJlYWRvbmx5IGlucHV0MjogVVJJLCByZWFkb25seSByZXN1bHQ6IFVSSSkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXN0b21FZGl0b3JUYWJJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHVyaTogVVJJLCByZWFkb25seSB2aWV3VHlwZTogc3RyaW5nKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFdlYnZpZXdFZGl0b3JUYWJJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHZpZXdUeXBlOiBzdHJpbmcpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tFZGl0b3JUYWJJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHVyaTogVVJJLCByZWFkb25seSBub3RlYm9va1R5cGU6IHN0cmluZykgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0RpZmZFZGl0b3JUYWJJbnB1dCB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IG9yaWdpbmFsOiBVUkksIHJlYWRvbmx5IG1vZGlmaWVkOiBVUkksIHJlYWRvbmx5IG5vdGVib29rVHlwZTogc3RyaW5nKSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsRWRpdG9yVGFiSW5wdXQge1xuXHRjb25zdHJ1Y3RvcigpIHsgfVxufVxuZXhwb3J0IGNsYXNzIEludGVyYWN0aXZlV2luZG93SW5wdXQge1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSB1cmk6IFVSSSwgcmVhZG9ubHkgaW5wdXRCb3hVcmk6IFVSSSkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RWRpdG9yVGFiSW5wdXQge1xuXHRjb25zdHJ1Y3RvcigpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgVGV4dE11bHRpRGlmZlRhYklucHV0IHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdGV4dERpZmZzOiBUZXh0RGlmZlRhYklucHV0W10pIHsgfVxufVxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBDaGF0XG5cbmV4cG9ydCBlbnVtIEludGVyYWN0aXZlU2Vzc2lvblZvdGVEaXJlY3Rpb24ge1xuXHREb3duID0gMCxcblx0VXAgPSAxXG59XG5cbmV4cG9ydCBlbnVtIENoYXRDb3B5S2luZCB7XG5cdEFjdGlvbiA9IDEsXG5cdFRvb2xiYXIgPSAyXG59XG5cbmV4cG9ydCBlbnVtIENoYXRWYXJpYWJsZUxldmVsIHtcblx0U2hvcnQgPSAxLFxuXHRNZWRpdW0gPSAyLFxuXHRGdWxsID0gM1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdENvbXBsZXRpb25JdGVtIGltcGxlbWVudHMgdnNjb2RlLkNoYXRDb21wbGV0aW9uSXRlbSB7XG5cdGlkOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmcgfCBDb21wbGV0aW9uSXRlbUxhYmVsO1xuXHRmdWxsTmFtZT86IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0aWNvbj86IHZzY29kZS5UaGVtZUljb247XG5cdGluc2VydFRleHQ/OiBzdHJpbmc7XG5cdHZhbHVlczogdnNjb2RlLkNoYXRWYXJpYWJsZVZhbHVlW107XG5cdGRldGFpbD86IHN0cmluZztcblx0ZG9jdW1lbnRhdGlvbj86IHN0cmluZyB8IE1hcmtkb3duU3RyaW5nO1xuXHRjb21tYW5kPzogdnNjb2RlLkNvbW1hbmQ7XG5cblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZyB8IENvbXBsZXRpb25JdGVtTGFiZWwsIHZhbHVlczogdnNjb2RlLkNoYXRWYXJpYWJsZVZhbHVlW10pIHtcblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy5sYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMudmFsdWVzID0gdmFsdWVzO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIENoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbk91dGNvbWUge1xuXHRBY2NlcHRlZCA9IDEsXG5cdFJlamVjdGVkID0gMixcblx0U2F2ZWQgPSAzXG59XG5cbmV4cG9ydCBlbnVtIENoYXRSZXF1ZXN0RWRpdGVkRmlsZUV2ZW50S2luZCB7XG5cdEtlZXAgPSAxLFxuXHRVbmRvID0gMixcblx0VXNlck1vZGlmaWNhdGlvbiA9IDMsXG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gSW50ZXJhY3RpdmUgRWRpdG9yXG5cbmV4cG9ydCBlbnVtIEludGVyYWN0aXZlRWRpdG9yUmVzcG9uc2VGZWVkYmFja0tpbmQge1xuXHRVbmhlbHBmdWwgPSAwLFxuXHRIZWxwZnVsID0gMSxcblx0VW5kb25lID0gMixcblx0QWNjZXB0ZWQgPSAzLFxuXHRCdWcgPSA0XG59XG5cbmV4cG9ydCBlbnVtIENoYXRSZXN1bHRGZWVkYmFja0tpbmQge1xuXHRVbmhlbHBmdWwgPSAwLFxuXHRIZWxwZnVsID0gMSxcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZU1hcmtkb3duUGFydCB7XG5cdHZhbHVlOiB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyAmJiB2YWx1ZS5pc1RydXN0ZWQgPT09IHRydWUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhlIGJvb2xlYW4gZm9ybSBvZiBNYXJrZG93blN0cmluZy5pc1RydXN0ZWQgaXMgTk9UIHN1cHBvcnRlZCBmb3IgY2hhdCBwYXJ0aWNpcGFudHMuJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcodmFsdWUpIDogdmFsdWU7XG5cdH1cbn1cblxuLyoqXG4gKiBUT0RPIGlmICd2dWxuZXJhYmlsaXRpZXMnIGlzIGZpbmFsaXplZCwgdGhpcyBzaG91bGQgYmUgbWVyZ2VkIHdpdGggdGhlIGJhc2UgQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0LiBJIGp1c3QgZG9uJ3Qgc2VlIGhvdyB0byBkbyB0aGF0IHdoaWxlIGtlZXBpbmdcbiAqIHZ1bG5lcmFiaWxpdGllcyBpbiBhIHNlcGVyYXRlIEFQSSBwcm9wb3NhbCBpbiBhIGNsZWFuIHdheS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZU1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllc1BhcnQge1xuXHR2YWx1ZTogdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHR2dWxuZXJhYmlsaXRpZXM6IHZzY29kZS5DaGF0VnVsbmVyYWJpbGl0eVtdO1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nLCB2dWxuZXJhYmlsaXRpZXM6IHZzY29kZS5DaGF0VnVsbmVyYWJpbGl0eVtdKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgJiYgdmFsdWUuaXNUcnVzdGVkID09PSB0cnVlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoZSBib29sZWFuIGZvcm0gb2YgTWFya2Rvd25TdHJpbmcuaXNUcnVzdGVkIGlzIE5PVCBzdXBwb3J0ZWQgZm9yIGNoYXQgcGFydGljaXBhbnRzLicpO1xuXHRcdH1cblxuXHRcdHRoaXMudmFsdWUgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKHZhbHVlKSA6IHZhbHVlO1xuXHRcdHRoaXMudnVsbmVyYWJpbGl0aWVzID0gdnVsbmVyYWJpbGl0aWVzO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0IHtcblx0dGl0bGU6IHN0cmluZztcblx0bWVzc2FnZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHRkYXRhOiBhbnk7XG5cdGJ1dHRvbnM/OiBzdHJpbmdbXTtcblxuXHRjb25zdHJ1Y3Rvcih0aXRsZTogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcsIGRhdGE6IGFueSwgYnV0dG9ucz86IHN0cmluZ1tdKSB7XG5cdFx0dGhpcy50aXRsZSA9IHRpdGxlO1xuXHRcdHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0dGhpcy5kYXRhID0gZGF0YTtcblx0XHR0aGlzLmJ1dHRvbnMgPSBidXR0b25zO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VGaWxlVHJlZVBhcnQge1xuXHR2YWx1ZTogdnNjb2RlLkNoYXRSZXNwb25zZUZpbGVUcmVlW107XG5cdGJhc2VVcmk6IHZzY29kZS5Vcmk7XG5cdGNvbnN0cnVjdG9yKHZhbHVlOiB2c2NvZGUuQ2hhdFJlc3BvbnNlRmlsZVRyZWVbXSwgYmFzZVVyaTogdnNjb2RlLlVyaSkge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLmJhc2VVcmkgPSBiYXNlVXJpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VNdWx0aURpZmZQYXJ0IHtcblx0dmFsdWU6IHZzY29kZS5DaGF0UmVzcG9uc2VEaWZmRW50cnlbXTtcblx0dGl0bGU6IHN0cmluZztcblx0cmVhZE9ubHk/OiBib29sZWFuO1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogdnNjb2RlLkNoYXRSZXNwb25zZURpZmZFbnRyeVtdLCB0aXRsZTogc3RyaW5nLCByZWFkT25seT86IGJvb2xlYW4pIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy50aXRsZSA9IHRpdGxlO1xuXHRcdHRoaXMucmVhZE9ubHkgPSByZWFkT25seTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWNwVG9vbEludm9jYXRpb25Db250ZW50RGF0YSB7XG5cdG1pbWVUeXBlOiBzdHJpbmc7XG5cdGRhdGE6IFVpbnQ4QXJyYXk7XG5cdGNvbnN0cnVjdG9yKGRhdGE6IFVpbnQ4QXJyYXksIG1pbWVUeXBlOiBzdHJpbmcpIHtcblx0XHR0aGlzLmRhdGEgPSBkYXRhO1xuXHRcdHRoaXMubWltZVR5cGUgPSBtaW1lVHlwZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFN1YmFnZW50VG9vbEludm9jYXRpb25EYXRhIHtcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGFnZW50TmFtZT86IHN0cmluZztcblx0cHJvbXB0Pzogc3RyaW5nO1xuXHRyZXN1bHQ/OiBzdHJpbmc7XG5cdG1vZGVsTmFtZT86IHN0cmluZztcblx0Y29uc3RydWN0b3IoZGVzY3JpcHRpb24/OiBzdHJpbmcsIGFnZW50TmFtZT86IHN0cmluZywgcHJvbXB0Pzogc3RyaW5nLCByZXN1bHQ/OiBzdHJpbmcpIHtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0dGhpcy5hZ2VudE5hbWUgPSBhZ2VudE5hbWU7XG5cdFx0dGhpcy5wcm9tcHQgPSBwcm9tcHQ7XG5cdFx0dGhpcy5yZXN1bHQgPSByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZUV4dGVybmFsRWRpdFBhcnQge1xuXHRhcHBsaWVkOiBUaGVuYWJsZTxzdHJpbmc+O1xuXHRkaWRHZXRBcHBsaWVkITogKHZhbHVlOiBzdHJpbmcpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHVyaXM6IHZzY29kZS5VcmlbXSxcblx0XHRwdWJsaWMgY2FsbGJhY2s6ICgpID0+IFRoZW5hYmxlPHVua25vd24+LFxuXHQpIHtcblx0XHR0aGlzLmFwcGxpZWQgPSBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHR0aGlzLmRpZEdldEFwcGxpZWQgPSByZXNvbHZlO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VBbmNob3JQYXJ0IGltcGxlbWVudHMgdnNjb2RlLkNoYXRSZXNwb25zZUFuY2hvclBhcnQge1xuXHR2YWx1ZTogdnNjb2RlLlVyaSB8IHZzY29kZS5Mb2NhdGlvbjtcblx0dGl0bGU/OiBzdHJpbmc7XG5cblx0dmFsdWUyOiB2c2NvZGUuVXJpIHwgdnNjb2RlLkxvY2F0aW9uIHwgdnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uO1xuXHRyZXNvbHZlPyh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogVGhlbmFibGU8dm9pZD47XG5cblx0Y29uc3RydWN0b3IodmFsdWU6IHZzY29kZS5VcmkgfCB2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuU3ltYm9sSW5mb3JtYXRpb24sIHRpdGxlPzogc3RyaW5nKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlIGFzIGFueTtcblx0XHR0aGlzLnZhbHVlMiA9IHZhbHVlO1xuXHRcdHRoaXMudGl0bGUgPSB0aXRsZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0IHtcblx0dmFsdWU6IHN0cmluZztcblx0Y29uc3RydWN0b3IodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0MiB7XG5cdHZhbHVlOiBzdHJpbmc7XG5cdHRhc2s/OiAocHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQ+KSA9PiBUaGVuYWJsZTxzdHJpbmcgfCB2b2lkPjtcblx0Y29uc3RydWN0b3IodmFsdWU6IHN0cmluZywgdGFzaz86IChwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydD4pID0+IFRoZW5hYmxlPHN0cmluZyB8IHZvaWQ+KSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHRcdHRoaXMudGFzayA9IHRhc2s7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0IHtcblx0dmFsdWU6IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRpZD86IHN0cmluZztcblx0bWV0YWRhdGE/OiB7IHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IGFueSB9O1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogc3RyaW5nIHwgc3RyaW5nW10sIGlkPzogc3RyaW5nLCBtZXRhZGF0YT86IHsgcmVhZG9ubHkgW2tleTogc3RyaW5nXTogYW55IH0pIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHRcdHRoaXMubWV0YWRhdGEgPSBtZXRhZGF0YTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlSG9va1BhcnQge1xuXHRob29rVHlwZTogSG9va1R5cGVWYWx1ZTtcblx0c3RvcFJlYXNvbj86IHN0cmluZztcblx0c3lzdGVtTWVzc2FnZT86IHN0cmluZztcblx0bWV0YWRhdGE/OiB7IHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd24gfTtcblx0Y29uc3RydWN0b3IoaG9va1R5cGU6IEhvb2tUeXBlVmFsdWUsIHN0b3BSZWFzb24/OiBzdHJpbmcsIHN5c3RlbU1lc3NhZ2U/OiBzdHJpbmcsIG1ldGFkYXRhPzogeyByZWFkb25seSBba2V5OiBzdHJpbmddOiB1bmtub3duIH0pIHtcblx0XHR0aGlzLmhvb2tUeXBlID0gaG9va1R5cGU7XG5cdFx0dGhpcy5zdG9wUmVhc29uID0gc3RvcFJlYXNvbjtcblx0XHR0aGlzLnN5c3RlbU1lc3NhZ2UgPSBzeXN0ZW1NZXNzYWdlO1xuXHRcdHRoaXMubWV0YWRhdGEgPSBtZXRhZGF0YTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBDaGF0UmVzcG9uc2VWb2ljZVByb2dyZXNzU3RhZ2UgPSAnaW52ZXN0aWdhdGluZycgfCAncGxhbm5pbmcnIHwgJ2VkaXRpbmcnIHwgJ3ZhbGlkYXRpbmcnIHwgJ3JlY292ZXJpbmcnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQge1xuXHRyZWFkb25seSBpZDogQ2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1N0YWdlO1xuXHRyZWFkb25seSB2YWx1ZTogc3RyaW5nO1xuXHRjb25zdHJ1Y3RvcihpZDogQ2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1N0YWdlLCB2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydCB7XG5cdHJlc29sdmVkTW9kZWw6IHN0cmluZztcblx0cmVzb2x2ZWRNb2RlbE5hbWU6IHN0cmluZztcblx0cHJlZGljdGVkTGFiZWw6IHN0cmluZztcblx0Y29uZmlkZW5jZTogbnVtYmVyO1xuXHRjb25zdHJ1Y3RvcihyZXNvbHZlZE1vZGVsOiBzdHJpbmcsIHJlc29sdmVkTW9kZWxOYW1lOiBzdHJpbmcsIHByZWRpY3RlZExhYmVsOiBzdHJpbmcsIGNvbmZpZGVuY2U6IG51bWJlcikge1xuXHRcdHRoaXMucmVzb2x2ZWRNb2RlbCA9IHJlc29sdmVkTW9kZWw7XG5cdFx0dGhpcy5yZXNvbHZlZE1vZGVsTmFtZSA9IHJlc29sdmVkTW9kZWxOYW1lO1xuXHRcdHRoaXMucHJlZGljdGVkTGFiZWwgPSBwcmVkaWN0ZWRMYWJlbDtcblx0XHR0aGlzLmNvbmZpZGVuY2UgPSBjb25maWRlbmNlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VXYXJuaW5nUGFydCB7XG5cdHZhbHVlOiB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJyAmJiB2YWx1ZS5pc1RydXN0ZWQgPT09IHRydWUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGhlIGJvb2xlYW4gZm9ybSBvZiBNYXJrZG93blN0cmluZy5pc1RydXN0ZWQgaXMgTk9UIHN1cHBvcnRlZCBmb3IgY2hhdCBwYXJ0aWNpcGFudHMuJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZSA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcodmFsdWUpIDogdmFsdWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZUluZm9QYXJ0IHtcblx0dmFsdWU6IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0Y29uc3RydWN0b3IodmFsdWU6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZykge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnICYmIHZhbHVlLmlzVHJ1c3RlZCA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUaGUgYm9vbGVhbiBmb3JtIG9mIE1hcmtkb3duU3RyaW5nLmlzVHJ1c3RlZCBpcyBOT1Qgc3VwcG9ydGVkIGZvciBjaGF0IHBhcnRpY2lwYW50cy4nKTtcblx0XHR9XG5cblx0XHR0aGlzLnZhbHVlID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IG5ldyBNYXJrZG93blN0cmluZyh2YWx1ZSkgOiB2YWx1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQge1xuXHR2YWx1ZTogdnNjb2RlLkNvbW1hbmQ7XG5cdGNvbnN0cnVjdG9yKHZhbHVlOiB2c2NvZGUuQ29tbWFuZCkge1xuXHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydCB7XG5cdHZhbHVlOiB2c2NvZGUuVXJpIHwgdnNjb2RlLkxvY2F0aW9uIHwgeyB2YXJpYWJsZU5hbWU6IHN0cmluZzsgdmFsdWU/OiB2c2NvZGUuVXJpIHwgdnNjb2RlLkxvY2F0aW9uIH0gfCBzdHJpbmc7XG5cdGljb25QYXRoPzogdnNjb2RlLlVyaSB8IHZzY29kZS5UaGVtZUljb24gfCB7IGxpZ2h0OiB2c2NvZGUuVXJpOyBkYXJrOiB2c2NvZGUuVXJpIH07XG5cdG9wdGlvbnM/OiB7IHN0YXR1cz86IHsgZGVzY3JpcHRpb246IHN0cmluZzsga2luZDogdnNjb2RlLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnRTdGF0dXNLaW5kIH07IGRpZmZNZXRhPzogeyBhZGRlZDogbnVtYmVyOyByZW1vdmVkOiBudW1iZXIgfSB9O1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogdnNjb2RlLlVyaSB8IHZzY29kZS5Mb2NhdGlvbiB8IHsgdmFyaWFibGVOYW1lOiBzdHJpbmc7IHZhbHVlPzogdnNjb2RlLlVyaSB8IHZzY29kZS5Mb2NhdGlvbiB9IHwgc3RyaW5nLCBpY29uUGF0aD86IHZzY29kZS5VcmkgfCB2c2NvZGUuVGhlbWVJY29uIHwgeyBsaWdodDogdnNjb2RlLlVyaTsgZGFyazogdnNjb2RlLlVyaSB9LCBvcHRpb25zPzogeyBzdGF0dXM/OiB7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGtpbmQ6IHZzY29kZS5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0U3RhdHVzS2luZCB9IH0pIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5pY29uUGF0aCA9IGljb25QYXRoO1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQge1xuXHRpc0VkaXQ/OiBib29sZWFuO1xuXHR1bmRvU3RvcElkPzogc3RyaW5nO1xuXHR2YWx1ZTogdnNjb2RlLlVyaTtcblx0Y29uc3RydWN0b3IodmFsdWU6IHZzY29kZS5VcmksIGlzRWRpdD86IGJvb2xlYW4sIHVuZG9TdG9wSWQ/OiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5pc0VkaXQgPSBpc0VkaXQ7XG5cdFx0dGhpcy51bmRvU3RvcElkID0gdW5kb1N0b3BJZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlQ29kZUNpdGF0aW9uUGFydCB7XG5cdHZhbHVlOiB2c2NvZGUuVXJpO1xuXHRsaWNlbnNlOiBzdHJpbmc7XG5cdHNuaXBwZXQ6IHN0cmluZztcblx0Y29uc3RydWN0b3IodmFsdWU6IHZzY29kZS5VcmksIGxpY2Vuc2U6IHN0cmluZywgc25pcHBldDogc3RyaW5nKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHRcdHRoaXMubGljZW5zZSA9IGxpY2Vuc2U7XG5cdFx0dGhpcy5zbmlwcGV0ID0gc25pcHBldDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlTW92ZVBhcnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdXJpOiB2c2NvZGUuVXJpLFxuXHRcdHB1YmxpYyByZWFkb25seSByYW5nZTogdnNjb2RlLlJhbmdlLFxuXHQpIHtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlRXh0ZW5zaW9uc1BhcnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXh0ZW5zaW9uczogc3RyaW5nW10sXG5cdCkge1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgdXJpPzogdnNjb2RlLlVyaTtcblx0cHVibGljIHJlYWRvbmx5IGNvbW1hbmQ6IHZzY29kZS5Db21tYW5kO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVyaU9yQ29tbWFuZDogdnNjb2RlLlVyaSB8IHZzY29kZS5Db21tYW5kLFxuXHRcdHB1YmxpYyByZWFkb25seSB0aXRsZTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBhdXRob3I6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGlua1RhZzogc3RyaW5nXG5cdCkge1xuXHRcdGlmIChpc1VyaUNvbXBvbmVudHModXJpT3JDb21tYW5kKSkge1xuXHRcdFx0dGhpcy51cmkgPSB1cmlPckNvbW1hbmQgYXMgdnNjb2RlLlVyaTtcblx0XHRcdHRoaXMuY29tbWFuZCA9IHtcblx0XHRcdFx0dGl0bGU6ICdPcGVuIFB1bGwgUmVxdWVzdCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICd2c2NvZGUub3BlbicsXG5cdFx0XHRcdGFyZ3VtZW50czogW3VyaU9yQ29tbWFuZF1cblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29tbWFuZCA9IHVyaU9yQ29tbWFuZDtcblx0XHR9XG5cdH1cblxuXHR0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5DaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQsXG5cdFx0XHR1cmk6IHRoaXMudXJpLFxuXHRcdFx0dGl0bGU6IHRoaXMudGl0bGUsXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbixcblx0XHRcdGF1dGhvcjogdGhpcy5hdXRob3Jcblx0XHR9O1xuXHR9XG59XG5cbi8qKlxuICogVGhlIHR5cGUgb2YgcXVlc3Rpb24gZm9yIGEgY2hhdCBxdWVzdGlvbiBjYXJvdXNlbC5cbiAqL1xuZXhwb3J0IGVudW0gQ2hhdFF1ZXN0aW9uVHlwZSB7XG5cdC8qKlxuXHQgKiBBIGZyZWUtZm9ybSB0ZXh0IGlucHV0IHF1ZXN0aW9uLlxuXHQgKi9cblx0VGV4dCA9IDEsXG5cdC8qKlxuXHQgKiBBIHNpbmdsZS1zZWxlY3QgcXVlc3Rpb24gd2l0aCByYWRpbyBidXR0b25zLlxuXHQgKi9cblx0U2luZ2xlU2VsZWN0ID0gMixcblx0LyoqXG5cdCAqIEEgbXVsdGktc2VsZWN0IHF1ZXN0aW9uIHdpdGggY2hlY2tib3hlcy5cblx0ICovXG5cdE11bHRpU2VsZWN0ID0gM1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBxdWVzdGlvbiB0byBiZSBkaXNwbGF5ZWQgaW4gYSBjaGF0IHF1ZXN0aW9uIGNhcm91c2VsLlxuICogUXVlc3Rpb25zIGNhbiBiZSBvZiB0eXBlICd0ZXh0JyBmb3IgZnJlZS1mb3JtIGlucHV0LCAnc2luZ2xlU2VsZWN0JyBmb3IgcmFkaW8gYnV0dG9ucyxcbiAqIG9yICdtdWx0aVNlbGVjdCcgZm9yIGNoZWNrYm94ZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0UXVlc3Rpb24ge1xuXHQvKiogVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSBxdWVzdGlvbi4gKi9cblx0aWQ6IHN0cmluZztcblx0LyoqIFRoZSB0eXBlIG9mIHF1ZXN0aW9uOiBUZXh0IGZvciBmcmVlLWZvcm0gaW5wdXQsIFNpbmdsZVNlbGVjdCBmb3IgcmFkaW8gYnV0dG9ucywgTXVsdGlTZWxlY3QgZm9yIGNoZWNrYm94ZXMuICovXG5cdHR5cGU6IENoYXRRdWVzdGlvblR5cGU7XG5cdC8qKiBUaGUgdGl0bGUvaGVhZGVyIG9mIHRoZSBxdWVzdGlvbi4gKi9cblx0dGl0bGU6IHN0cmluZztcblx0LyoqIE9wdGlvbmFsIGRldGFpbGVkIG1lc3NhZ2Ugb3IgZGVzY3JpcHRpb24gZm9yIHRoZSBxdWVzdGlvbi4gKi9cblx0bWVzc2FnZT86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0LyoqIE9wdGlvbnMgZm9yIHNpbmdsZVNlbGVjdCBvciBtdWx0aVNlbGVjdCBxdWVzdGlvbnMuICovXG5cdG9wdGlvbnM/OiB7IGlkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IHZhbHVlOiB1bmtub3duIH1bXTtcblx0LyoqIFRoZSBpZChzKSBvZiB0aGUgZGVmYXVsdCBzZWxlY3RlZCBvcHRpb24ocykuICovXG5cdGRlZmF1bHRWYWx1ZT86IHN0cmluZyB8IHN0cmluZ1tdO1xuXHQvKiogV2hldGhlciB0byBhbGxvdyBmcmVlLWZvcm0gdGV4dCBpbnB1dCBpbiBhZGRpdGlvbiB0byBwcmVkZWZpbmVkIG9wdGlvbnMuICovXG5cdGFsbG93RnJlZWZvcm1JbnB1dD86IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHR0eXBlOiBDaGF0UXVlc3Rpb25UeXBlLFxuXHRcdHRpdGxlOiBzdHJpbmcsXG5cdFx0b3B0aW9ucz86IHtcblx0XHRcdG1lc3NhZ2U/OiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmc7XG5cdFx0XHRvcHRpb25zPzogeyBpZDogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB2YWx1ZTogdW5rbm93biB9W107XG5cdFx0XHRkZWZhdWx0VmFsdWU/OiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dD86IGJvb2xlYW47XG5cdFx0fVxuXHQpIHtcblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy50eXBlID0gdHlwZTtcblx0XHR0aGlzLnRpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5tZXNzYWdlID0gb3B0aW9ucz8ubWVzc2FnZTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zPy5vcHRpb25zO1xuXHRcdHRoaXMuZGVmYXVsdFZhbHVlID0gb3B0aW9ucz8uZGVmYXVsdFZhbHVlO1xuXHRcdHRoaXMuYWxsb3dGcmVlZm9ybUlucHV0ID0gb3B0aW9ucz8uYWxsb3dGcmVlZm9ybUlucHV0O1xuXHR9XG59XG5cbi8qKlxuICogQSBjYXJvdXNlbCB2aWV3IGZvciBwcmVzZW50aW5nIG11bHRpcGxlIHF1ZXN0aW9ucyBpbmxpbmUgaW4gdGhlIGNoYXQgcmVzcG9uc2UuXG4gKiBVc2VycyBjYW4gbmF2aWdhdGUgYmV0d2VlbiBxdWVzdGlvbnMgYW5kIHN1Ym1pdCB0aGVpciBhbnN3ZXJzLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQge1xuXHQvKiogVGhlIHF1ZXN0aW9ucyB0byBkaXNwbGF5IGluIHRoZSBjYXJvdXNlbC4gKi9cblx0cXVlc3Rpb25zOiBDaGF0UXVlc3Rpb25bXTtcblx0LyoqIFdoZXRoZXIgdXNlcnMgY2FuIHNraXAgYW5zd2VyaW5nIHRoZSBxdWVzdGlvbnMuICovXG5cdGFsbG93U2tpcDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihxdWVzdGlvbnM6IENoYXRRdWVzdGlvbltdLCBhbGxvd1NraXA6IGJvb2xlYW4gPSB0cnVlKSB7XG5cdFx0dGhpcy5xdWVzdGlvbnMgPSBxdWVzdGlvbnM7XG5cdFx0dGhpcy5hbGxvd1NraXAgPSBhbGxvd1NraXA7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZVRleHRFZGl0UGFydCBpbXBsZW1lbnRzIHZzY29kZS5DaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQge1xuXHR1cmk6IHZzY29kZS5Vcmk7XG5cdGVkaXRzOiB2c2NvZGUuVGV4dEVkaXRbXTtcblx0aXNEb25lPzogYm9vbGVhbjtcblx0Y29uc3RydWN0b3IodXJpOiB2c2NvZGUuVXJpLCBlZGl0c09yRG9uZTogdnNjb2RlLlRleHRFZGl0IHwgdnNjb2RlLlRleHRFZGl0W10gfCB0cnVlKSB7XG5cdFx0dGhpcy51cmkgPSB1cmk7XG5cdFx0aWYgKGVkaXRzT3JEb25lID09PSB0cnVlKSB7XG5cdFx0XHR0aGlzLmlzRG9uZSA9IHRydWU7XG5cdFx0XHR0aGlzLmVkaXRzID0gW107XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWRpdHMgPSBBcnJheS5pc0FycmF5KGVkaXRzT3JEb25lKSA/IGVkaXRzT3JEb25lIDogW2VkaXRzT3JEb25lXTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZU5vdGVib29rRWRpdFBhcnQgaW1wbGVtZW50cyB2c2NvZGUuQ2hhdFJlc3BvbnNlTm90ZWJvb2tFZGl0UGFydCB7XG5cdHVyaTogdnNjb2RlLlVyaTtcblx0ZWRpdHM6IHZzY29kZS5Ob3RlYm9va0VkaXRbXTtcblx0aXNEb25lPzogYm9vbGVhbjtcblx0Y29uc3RydWN0b3IodXJpOiB2c2NvZGUuVXJpLCBlZGl0c09yRG9uZTogdnNjb2RlLk5vdGVib29rRWRpdCB8IHZzY29kZS5Ob3RlYm9va0VkaXRbXSB8IHRydWUpIHtcblx0XHR0aGlzLnVyaSA9IHVyaTtcblx0XHRpZiAoZWRpdHNPckRvbmUgPT09IHRydWUpIHtcblx0XHRcdHRoaXMuaXNEb25lID0gdHJ1ZTtcblx0XHRcdHRoaXMuZWRpdHMgPSBbXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lZGl0cyA9IEFycmF5LmlzQXJyYXkoZWRpdHNPckRvbmUpID8gZWRpdHNPckRvbmUgOiBbZWRpdHNPckRvbmVdO1xuXG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VXb3Jrc3BhY2VFZGl0UGFydCBpbXBsZW1lbnRzIHZzY29kZS5DaGF0UmVzcG9uc2VXb3Jrc3BhY2VFZGl0UGFydCB7XG5cdGVkaXRzOiB2c2NvZGUuQ2hhdFdvcmtzcGFjZUZpbGVFZGl0W107XG5cdGNvbnN0cnVjdG9yKGVkaXRzOiB2c2NvZGUuQ2hhdFdvcmtzcGFjZUZpbGVFZGl0W10pIHtcblx0XHR0aGlzLmVkaXRzID0gZWRpdHM7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEyIHtcblx0Y29tbWFuZExpbmU6IHtcblx0XHRvcmlnaW5hbDogc3RyaW5nO1xuXHRcdHVzZXJFZGl0ZWQ/OiBzdHJpbmc7XG5cdFx0dG9vbEVkaXRlZD86IHN0cmluZztcblx0fTtcblx0bGFuZ3VhZ2U6IHN0cmluZztcbn1cblxuZXhwb3J0IGVudW0gQ2hhdFRvZG9TdGF0dXMge1xuXHROb3RTdGFydGVkID0gMSxcblx0SW5Qcm9ncmVzcyA9IDIsXG5cdENvbXBsZXRlZCA9IDNcbn1cblxuZXhwb3J0IGVudW0gQ2hhdERlYnVnU3ViYWdlbnRTdGF0dXMge1xuXHRSdW5uaW5nID0gMCxcblx0Q29tcGxldGVkID0gMSxcblx0RmFpbGVkID0gMlxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB7XG5cdHRvb2xOYW1lOiBzdHJpbmc7XG5cdHRvb2xDYWxsSWQ6IHN0cmluZztcblx0ZXJyb3JNZXNzYWdlPzogc3RyaW5nO1xuXHRpbnZvY2F0aW9uTWVzc2FnZT86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0b3JpZ2luTWVzc2FnZT86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0cGFzdFRlbnNlTWVzc2FnZT86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0aXNDb25maXJtZWQ/OiBib29sZWFuO1xuXHRpc0NvbXBsZXRlPzogYm9vbGVhbjtcblx0dG9vbFNwZWNpZmljRGF0YT86IENoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YTI7XG5cdHN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nO1xuXHRzdWJBZ2VudE5hbWU/OiBzdHJpbmc7XG5cdHByZXNlbnRhdGlvbj86ICdoaWRkZW4nIHwgJ2hpZGRlbkFmdGVyQ29tcGxldGUnIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHRvb2xOYW1lOiBzdHJpbmcsXG5cdFx0dG9vbENhbGxJZDogc3RyaW5nLFxuXHRcdGVycm9yTWVzc2FnZT86IHN0cmluZykge1xuXHRcdHRoaXMudG9vbE5hbWUgPSB0b29sTmFtZTtcblx0XHR0aGlzLnRvb2xDYWxsSWQgPSB0b29sQ2FsbElkO1xuXHRcdHRoaXMuZXJyb3JNZXNzYWdlID0gZXJyb3JNZXNzYWdlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVxdWVzdFR1cm4gaW1wbGVtZW50cyB2c2NvZGUuQ2hhdFJlcXVlc3RUdXJuMiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHByb21wdDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGNvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSByZWZlcmVuY2VzOiB2c2NvZGUuQ2hhdFByb21wdFJlZmVyZW5jZVtdLFxuXHRcdHJlYWRvbmx5IHBhcnRpY2lwYW50OiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgdG9vbFJlZmVyZW5jZXM6IHZzY29kZS5DaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2VbXSxcblx0XHRyZWFkb25seSBlZGl0ZWRGaWxlRXZlbnRzPzogdnNjb2RlLkNoYXRSZXF1ZXN0RWRpdGVkRmlsZUV2ZW50W10sXG5cdFx0cmVhZG9ubHkgaWQ/OiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgbW9kZWxJZD86IHN0cmluZyxcblx0XHRyZWFkb25seSBtb2RlSW5zdHJ1Y3Rpb25zMj86IHZzY29kZS5DaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMsXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVzcG9uc2VUdXJuIGltcGxlbWVudHMgdnNjb2RlLkNoYXRSZXNwb25zZVR1cm4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc3BvbnNlOiBSZWFkb25seUFycmF5PENoYXRSZXNwb25zZU1hcmtkb3duUGFydCB8IENoYXRSZXNwb25zZUZpbGVUcmVlUGFydCB8IENoYXRSZXNwb25zZUFuY2hvclBhcnQgfCBDaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydD4sXG5cdFx0cmVhZG9ubHkgcmVzdWx0OiB2c2NvZGUuQ2hhdFJlc3VsdCxcblx0XHRyZWFkb25seSBwYXJ0aWNpcGFudDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGNvbW1hbmQ/OiBzdHJpbmdcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXNwb25zZVR1cm4yIGltcGxlbWVudHMgdnNjb2RlLkNoYXRSZXNwb25zZVR1cm4yIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByZXNwb25zZTogUmVhZG9ubHlBcnJheTxDaGF0UmVzcG9uc2VNYXJrZG93blBhcnQgfCBDaGF0UmVzcG9uc2VGaWxlVHJlZVBhcnQgfCBDaGF0UmVzcG9uc2VBbmNob3JQYXJ0IHwgQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQgfCBDaGF0UmVzcG9uc2VFeHRlbnNpb25zUGFydCB8IENoYXRUb29sSW52b2NhdGlvblBhcnQ+LFxuXHRcdHJlYWRvbmx5IHJlc3VsdDogdnNjb2RlLkNoYXRSZXN1bHQsXG5cdFx0cmVhZG9ubHkgcGFydGljaXBhbnQ6IHN0cmluZyxcblx0XHRyZWFkb25seSBjb21tYW5kPzogc3RyaW5nXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBlbnVtIENoYXRMb2NhdGlvbiB7XG5cdFBhbmVsID0gMSxcblx0VGVybWluYWwgPSAyLFxuXHROb3RlYm9vayA9IDMsXG5cdEVkaXRvciA9IDQsXG59XG5cbmV4cG9ydCBlbnVtIENoYXRTZXNzaW9uU3RhdHVzIHtcblx0RmFpbGVkID0gMCxcblx0Q29tcGxldGVkID0gMSxcblx0SW5Qcm9ncmVzcyA9IDIsXG5cdE5lZWRzSW5wdXQgPSAzXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlIHtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50ID0gbmV3IENoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUoJ2FnZW50Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTa2lsbCA9IG5ldyBDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlKCdza2lsbCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSW5zdHJ1Y3Rpb25zID0gbmV3IENoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUoJ2luc3RydWN0aW9ucycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgUHJvbXB0ID0gbmV3IENoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUoJ3Byb21wdCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSG9vayA9IG5ldyBDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlKCdob29rJyk7XG5cdHN0YXRpYyByZWFkb25seSBQbHVnaW5zID0gbmV3IENoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUoJ3BsdWdpbnMnKTtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZykgeyB9XG59XG5cbmV4cG9ydCBlbnVtIENoYXREZWJ1Z0xvZ0xldmVsIHtcblx0VHJhY2UgPSAwLFxuXHRJbmZvID0gMSxcblx0V2FybmluZyA9IDIsXG5cdEVycm9yID0gM1xufVxuXG5leHBvcnQgZW51bSBDaGF0RGVidWdUb29sQ2FsbFJlc3VsdCB7XG5cdFN1Y2Nlc3MgPSAwLFxuXHRFcnJvciA9IDFcbn1cblxuZXhwb3J0IGVudW0gQ2hhdERlYnVnSG9va1Jlc3VsdCB7XG5cdFN1Y2Nlc3MgPSAwLFxuXHRFcnJvciA9IDEsXG5cdE5vbkJsb2NraW5nRXJyb3IgPSAyXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdUb29sQ2FsbEV2ZW50IHtcblx0cmVhZG9ubHkgX2tpbmQgPSAndG9vbENhbGwnO1xuXHRpZD86IHN0cmluZztcblx0c2Vzc2lvblJlc291cmNlPzogdnNjb2RlLlVyaTtcblx0Y3JlYXRlZDogRGF0ZTtcblx0cGFyZW50RXZlbnRJZD86IHN0cmluZztcblx0dG9vbE5hbWU6IHN0cmluZztcblx0dG9vbENhbGxJZD86IHN0cmluZztcblx0aW5wdXQ/OiBzdHJpbmc7XG5cdG91dHB1dD86IHN0cmluZztcblx0cmVzdWx0PzogQ2hhdERlYnVnVG9vbENhbGxSZXN1bHQ7XG5cdGR1cmF0aW9uSW5NaWxsaXM/OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IodG9vbE5hbWU6IHN0cmluZywgY3JlYXRlZDogRGF0ZSkge1xuXHRcdHRoaXMudG9vbE5hbWUgPSB0b29sTmFtZTtcblx0XHR0aGlzLmNyZWF0ZWQgPSBjcmVhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdNb2RlbFR1cm5FdmVudCB7XG5cdHJlYWRvbmx5IF9raW5kID0gJ21vZGVsVHVybic7XG5cdGlkPzogc3RyaW5nO1xuXHRzZXNzaW9uUmVzb3VyY2U/OiB2c2NvZGUuVXJpO1xuXHRjcmVhdGVkOiBEYXRlO1xuXHRwYXJlbnRFdmVudElkPzogc3RyaW5nO1xuXHRtb2RlbD86IHN0cmluZztcblx0cmVxdWVzdE5hbWU/OiBzdHJpbmc7XG5cdGlucHV0VG9rZW5zPzogbnVtYmVyO1xuXHRvdXRwdXRUb2tlbnM/OiBudW1iZXI7XG5cdGNhY2hlZFRva2Vucz86IG51bWJlcjtcblx0dG90YWxUb2tlbnM/OiBudW1iZXI7XG5cdGNvc3Q/OiBudW1iZXI7XG5cdGNvcGlsb3RVc2FnZU5hbm9BaXU/OiBudW1iZXI7XG5cdGR1cmF0aW9uSW5NaWxsaXM/OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoY3JlYXRlZDogRGF0ZSkge1xuXHRcdHRoaXMuY3JlYXRlZCA9IGNyZWF0ZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z0dlbmVyaWNFdmVudCB7XG5cdHJlYWRvbmx5IF9raW5kID0gJ2dlbmVyaWMnO1xuXHRpZD86IHN0cmluZztcblx0c2Vzc2lvblJlc291cmNlPzogdnNjb2RlLlVyaTtcblx0Y3JlYXRlZDogRGF0ZTtcblx0cGFyZW50RXZlbnRJZD86IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHRkZXRhaWxzPzogc3RyaW5nO1xuXHRsZXZlbDogQ2hhdERlYnVnTG9nTGV2ZWw7XG5cdGNhdGVnb3J5Pzogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgbGV2ZWw6IENoYXREZWJ1Z0xvZ0xldmVsLCBjcmVhdGVkOiBEYXRlKSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmxldmVsID0gbGV2ZWw7XG5cdFx0dGhpcy5jcmVhdGVkID0gY3JlYXRlZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQge1xuXHRyZWFkb25seSBfa2luZCA9ICdzdWJhZ2VudEludm9jYXRpb24nO1xuXHRpZD86IHN0cmluZztcblx0c2Vzc2lvblJlc291cmNlPzogdnNjb2RlLlVyaTtcblx0Y3JlYXRlZDogRGF0ZTtcblx0cGFyZW50RXZlbnRJZD86IHN0cmluZztcblx0YWdlbnROYW1lOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRzdGF0dXM/OiBDaGF0RGVidWdTdWJhZ2VudFN0YXR1cztcblx0ZHVyYXRpb25Jbk1pbGxpcz86IG51bWJlcjtcblx0dG9vbENhbGxDb3VudD86IG51bWJlcjtcblx0bW9kZWxUdXJuQ291bnQ/OiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoYWdlbnROYW1lOiBzdHJpbmcsIGNyZWF0ZWQ6IERhdGUpIHtcblx0XHR0aGlzLmFnZW50TmFtZSA9IGFnZW50TmFtZTtcblx0XHR0aGlzLmNyZWF0ZWQgPSBjcmVhdGVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdNZXNzYWdlU2VjdGlvbiB7XG5cdG5hbWU6IHN0cmluZztcblx0Y29udGVudDogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKG5hbWU6IHN0cmluZywgY29udGVudDogc3RyaW5nKSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmNvbnRlbnQgPSBjb250ZW50O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdVc2VyTWVzc2FnZUV2ZW50IHtcblx0cmVhZG9ubHkgX2tpbmQgPSAndXNlck1lc3NhZ2UnO1xuXHRpZD86IHN0cmluZztcblx0c2Vzc2lvblJlc291cmNlPzogdnNjb2RlLlVyaTtcblx0Y3JlYXRlZDogRGF0ZTtcblx0cGFyZW50RXZlbnRJZD86IHN0cmluZztcblx0bWVzc2FnZTogc3RyaW5nO1xuXHRzZWN0aW9uczogQ2hhdERlYnVnTWVzc2FnZVNlY3Rpb25bXTtcblxuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcsIGNyZWF0ZWQ6IERhdGUpIHtcblx0XHR0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMuY3JlYXRlZCA9IGNyZWF0ZWQ7XG5cdFx0dGhpcy5zZWN0aW9ucyA9IFtdO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0RGVidWdBZ2VudFJlc3BvbnNlRXZlbnQge1xuXHRyZWFkb25seSBfa2luZCA9ICdhZ2VudFJlc3BvbnNlJztcblx0aWQ/OiBzdHJpbmc7XG5cdHNlc3Npb25SZXNvdXJjZT86IHZzY29kZS5Vcmk7XG5cdGNyZWF0ZWQ6IERhdGU7XG5cdHBhcmVudEV2ZW50SWQ/OiBzdHJpbmc7XG5cdG1lc3NhZ2U6IHN0cmluZztcblx0c2VjdGlvbnM6IENoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uW107XG5cblx0Y29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nLCBjcmVhdGVkOiBEYXRlKSB7XG5cdFx0dGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcblx0XHR0aGlzLmNyZWF0ZWQgPSBjcmVhdGVkO1xuXHRcdHRoaXMuc2VjdGlvbnMgPSBbXTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnRXZlbnRUZXh0Q29udGVudCB7XG5cdHJlYWRvbmx5IF9raW5kID0gJ3RleHQnO1xuXHR2YWx1ZTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gQ2hhdERlYnVnTWVzc2FnZUNvbnRlbnRUeXBlIHtcblx0VXNlciA9IDAsXG5cdEFnZW50ID0gMVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnRXZlbnRNZXNzYWdlQ29udGVudCB7XG5cdHJlYWRvbmx5IF9raW5kID0gJ21lc3NhZ2VDb250ZW50Jztcblx0dHlwZTogQ2hhdERlYnVnTWVzc2FnZUNvbnRlbnRUeXBlO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdHNlY3Rpb25zOiBDaGF0RGVidWdNZXNzYWdlU2VjdGlvbltdO1xuXG5cdGNvbnN0cnVjdG9yKHR5cGU6IENoYXREZWJ1Z01lc3NhZ2VDb250ZW50VHlwZSwgbWVzc2FnZTogc3RyaW5nLCBzZWN0aW9uczogQ2hhdERlYnVnTWVzc2FnZVNlY3Rpb25bXSkge1xuXHRcdHRoaXMudHlwZSA9IHR5cGU7XG5cdFx0dGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcblx0XHR0aGlzLnNlY3Rpb25zID0gc2VjdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXREZWJ1Z0V2ZW50VG9vbENhbGxDb250ZW50IHtcblx0cmVhZG9ubHkgX2tpbmQgPSAndG9vbENhbGxDb250ZW50Jztcblx0dG9vbE5hbWU6IHN0cmluZztcblx0cmVzdWx0PzogQ2hhdERlYnVnVG9vbENhbGxSZXN1bHQ7XG5cdGR1cmF0aW9uSW5NaWxsaXM/OiBudW1iZXI7XG5cdGlucHV0Pzogc3RyaW5nO1xuXHRvdXRwdXQ/OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IodG9vbE5hbWU6IHN0cmluZykge1xuXHRcdHRoaXMudG9vbE5hbWUgPSB0b29sTmFtZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnRXZlbnRNb2RlbFR1cm5Db250ZW50IHtcblx0cmVhZG9ubHkgX2tpbmQgPSAnbW9kZWxUdXJuQ29udGVudCc7XG5cdHJlcXVlc3ROYW1lOiBzdHJpbmc7XG5cdG1vZGVsPzogc3RyaW5nO1xuXHRzdGF0dXM/OiBzdHJpbmc7XG5cdGR1cmF0aW9uSW5NaWxsaXM/OiBudW1iZXI7XG5cdHRpbWVUb0ZpcnN0VG9rZW5Jbk1pbGxpcz86IG51bWJlcjtcblx0cmVxdWVzdElkPzogc3RyaW5nO1xuXHRtYXhJbnB1dFRva2Vucz86IG51bWJlcjtcblx0bWF4T3V0cHV0VG9rZW5zPzogbnVtYmVyO1xuXHRpbnB1dFRva2Vucz86IG51bWJlcjtcblx0b3V0cHV0VG9rZW5zPzogbnVtYmVyO1xuXHRjYWNoZWRUb2tlbnM/OiBudW1iZXI7XG5cdHRvdGFsVG9rZW5zPzogbnVtYmVyO1xuXHRyZXF1ZXN0T3B0aW9ucz86IHN0cmluZztcblx0ZXJyb3JNZXNzYWdlPzogc3RyaW5nO1xuXHRzZWN0aW9ucz86IENoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uW107XG5cblx0Y29uc3RydWN0b3IocmVxdWVzdE5hbWU6IHN0cmluZykge1xuXHRcdHRoaXMucmVxdWVzdE5hbWUgPSByZXF1ZXN0TmFtZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdERlYnVnRXZlbnRIb29rQ29udGVudCB7XG5cdHJlYWRvbmx5IF9raW5kID0gJ2hvb2tDb250ZW50Jztcblx0aG9va1R5cGU6IHN0cmluZztcblx0Y29tbWFuZD86IHN0cmluZztcblx0cmVzdWx0PzogQ2hhdERlYnVnSG9va1Jlc3VsdDtcblx0ZHVyYXRpb25Jbk1pbGxpcz86IG51bWJlcjtcblx0aW5wdXQ/OiBzdHJpbmc7XG5cdG91dHB1dD86IHN0cmluZztcblx0ZXhpdENvZGU/OiBudW1iZXI7XG5cdGVycm9yTWVzc2FnZT86IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihob29rVHlwZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5ob29rVHlwZSA9IGhvb2tUeXBlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0U2Vzc2lvbkNoYW5nZWRGaWxlIHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IHVyaTogdnNjb2RlLlVyaSwgcHVibGljIHJlYWRvbmx5IG9yaWdpbmFsVXJpOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkLCBwdWJsaWMgcmVhZG9ubHkgbW9kaWZpZWRVcmk6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQsIHB1YmxpYyByZWFkb25seSBpbnNlcnRpb25zOiBudW1iZXIsIHB1YmxpYyByZWFkb25seSBkZWxldGlvbnM6IG51bWJlcikgeyB9XG59XG5cbmV4cG9ydCBlbnVtIENoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnRTdGF0dXNLaW5kIHtcblx0Q29tcGxldGUgPSAxLFxuXHRQYXJ0aWFsID0gMixcblx0T21pdHRlZCA9IDNcbn1cblxuZXhwb3J0IGVudW0gQ2hhdFJlc3BvbnNlQ2xlYXJUb1ByZXZpb3VzVG9vbEludm9jYXRpb25SZWFzb24ge1xuXHROb1JlYXNvbiA9IDAsXG5cdEZpbHRlcmVkQ29udGVudFJldHJ5ID0gMSxcblx0Q29weXJpZ2h0Q29udGVudFJldHJ5ID0gMixcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZXF1ZXN0RWRpdG9yRGF0YSBpbXBsZW1lbnRzIHZzY29kZS5DaGF0UmVxdWVzdEVkaXRvckRhdGEge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBlZGl0b3I6IHZzY29kZS5UZXh0RWRpdG9yLFxuXHRcdHJlYWRvbmx5IGRvY3VtZW50OiB2c2NvZGUuVGV4dERvY3VtZW50LFxuXHRcdHJlYWRvbmx5IHNlbGVjdGlvbjogdnNjb2RlLlNlbGVjdGlvbixcblx0XHRyZWFkb25seSB3aG9sZVJhbmdlOiB2c2NvZGUuUmFuZ2UsXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVxdWVzdE5vdGVib29rRGF0YSBpbXBsZW1lbnRzIHZzY29kZS5DaGF0UmVxdWVzdE5vdGVib29rRGF0YSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNlbGw6IHZzY29kZS5UZXh0RG9jdW1lbnRcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRSZWZlcmVuY2VCaW5hcnlEYXRhIGltcGxlbWVudHMgdnNjb2RlLkNoYXRSZWZlcmVuY2VCaW5hcnlEYXRhIHtcblx0bWltZVR5cGU6IHN0cmluZztcblx0ZGF0YTogKCkgPT4gVGhlbmFibGU8VWludDhBcnJheT47XG5cdHJlZmVyZW5jZT86IHZzY29kZS5Vcmk7XG5cdGlzUGFzdGVkPzogYm9vbGVhbjtcblx0aXNVUkw/OiBib29sZWFuO1xuXHRjb25zdHJ1Y3RvcihtaW1lVHlwZTogc3RyaW5nLCBkYXRhOiAoKSA9PiBUaGVuYWJsZTxVaW50OEFycmF5PiwgcmVmZXJlbmNlPzogdnNjb2RlLlVyaSwgaXNQYXN0ZWQ/OiBib29sZWFuLCBpc1VSTD86IGJvb2xlYW4pIHtcblx0XHR0aGlzLm1pbWVUeXBlID0gbWltZVR5cGU7XG5cdFx0dGhpcy5kYXRhID0gZGF0YTtcblx0XHR0aGlzLnJlZmVyZW5jZSA9IHJlZmVyZW5jZTtcblx0XHR0aGlzLmlzUGFzdGVkID0gaXNQYXN0ZWQ7XG5cdFx0dGhpcy5pc1VSTCA9IGlzVVJMO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVmZXJlbmNlRGlhZ25vc3RpYyBpbXBsZW1lbnRzIHZzY29kZS5DaGF0UmVmZXJlbmNlRGlhZ25vc3RpYyB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBkaWFnbm9zdGljczogW3ZzY29kZS5VcmksIHZzY29kZS5EaWFnbm9zdGljW11dW10pIHsgfVxufVxuXG5leHBvcnQgZW51bSBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlIHtcblx0VXNlciA9IDEsXG5cdEFzc2lzdGFudCA9IDIsXG5cdFN5c3RlbSA9IDNcbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCBpbXBsZW1lbnRzIHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQge1xuXG5cdGNhbGxJZDogc3RyaW5nO1xuXHRjb250ZW50OiAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQgfCB1bmtub3duKVtdO1xuXHRpc0Vycm9yOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKGNhbGxJZDogc3RyaW5nLCBjb250ZW50OiAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQgfCB1bmtub3duKVtdLCBpc0Vycm9yPzogYm9vbGVhbikge1xuXHRcdHRoaXMuY2FsbElkID0gY2FsbElkO1xuXHRcdHRoaXMuY29udGVudCA9IGNvbnRlbnQ7XG5cdFx0dGhpcy5pc0Vycm9yID0gaXNFcnJvciA/PyBmYWxzZTtcblx0fVxufVxuXG5cbmV4cG9ydCBlbnVtIENoYXRFcnJvckxldmVsIHtcblx0SW5mbyA9IDAsXG5cdFdhcm5pbmcgPSAxLFxuXHRFcnJvciA9IDJcbn1cblxuZXhwb3J0IGVudW0gQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkge1xuXHRJbmZvID0gMCxcblx0V2FybmluZyA9IDEsXG5cdEVycm9yID0gMixcbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZSBpbXBsZW1lbnRzIHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2Uge1xuXG5cdHN0YXRpYyBVc2VyKGNvbnRlbnQ6IHN0cmluZyB8IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KVtdLCBuYW1lPzogc3RyaW5nKTogTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlIHtcblx0XHRyZXR1cm4gbmV3IExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZShMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLlVzZXIsIGNvbnRlbnQsIG5hbWUpO1xuXHR9XG5cblx0c3RhdGljIEFzc2lzdGFudChjb250ZW50OiBzdHJpbmcgfCAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSwgbmFtZT86IHN0cmluZyk6IExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZSB7XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UoTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsIGNvbnRlbnQsIG5hbWUpO1xuXHR9XG5cblx0cm9sZTogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGU7XG5cblx0cHJpdmF0ZSBfY29udGVudDogKExhbmd1YWdlTW9kZWxUZXh0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpW10gPSBbXTtcblxuXHRzZXQgY29udGVudCh2YWx1ZTogc3RyaW5nIHwgKExhbmd1YWdlTW9kZWxUZXh0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpW10pIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Ly8gd2UgY2hhbmdlZCB0aGlzIGFuZCBzdGlsbCBzdXBwb3J0IHNldHRpbmcgY29udGVudCB3aXRoIGEgc3RyaW5nIHByb3BlcnR5LiB0aGlzIGtlZXAgdGhlIEFQSSBydW50aW1lIHN0YWJsZVxuXHRcdFx0Ly8gZGVzcGl0ZSB0aGUgYnJlYWtpbmcgY2hhbmdlIGluIHRoZSB0eXBlIGRlZmluaXRpb24uXG5cdFx0XHR0aGlzLl9jb250ZW50ID0gW25ldyBMYW5ndWFnZU1vZGVsVGV4dFBhcnQodmFsdWUpXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY29udGVudCA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdGdldCBjb250ZW50KCk6IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudDtcblx0fVxuXG5cdG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihyb2xlOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZSwgY29udGVudDogc3RyaW5nIHwgKExhbmd1YWdlTW9kZWxUZXh0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpW10sIG5hbWU/OiBzdHJpbmcpIHtcblx0XHR0aGlzLnJvbGUgPSByb2xlO1xuXHRcdHRoaXMuY29udGVudCA9IGNvbnRlbnQ7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMiBpbXBsZW1lbnRzIHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyIHtcblxuXHRzdGF0aWMgVXNlcihjb250ZW50OiBzdHJpbmcgfCAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSwgbmFtZT86IHN0cmluZyk6IExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIge1xuXHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMihMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLlVzZXIsIGNvbnRlbnQsIG5hbWUpO1xuXHR9XG5cblx0c3RhdGljIEFzc2lzdGFudChjb250ZW50OiBzdHJpbmcgfCAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSwgbmFtZT86IHN0cmluZyk6IExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIge1xuXHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMihMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudCwgY29udGVudCwgbmFtZSk7XG5cdH1cblxuXHRyb2xlOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZTtcblxuXHRwcml2YXRlIF9jb250ZW50OiAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydCB8IExhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQpW10gPSBbXTtcblxuXHRzZXQgY29udGVudCh2YWx1ZTogc3RyaW5nIHwgKExhbmd1YWdlTW9kZWxUZXh0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQgfCBMYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0KVtdKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdC8vIHdlIGNoYW5nZWQgdGhpcyBhbmQgc3RpbGwgc3VwcG9ydCBzZXR0aW5nIGNvbnRlbnQgd2l0aCBhIHN0cmluZyBwcm9wZXJ0eS4gdGhpcyBrZWVwIHRoZSBBUEkgcnVudGltZSBzdGFibGVcblx0XHRcdC8vIGRlc3BpdGUgdGhlIGJyZWFraW5nIGNoYW5nZSBpbiB0aGUgdHlwZSBkZWZpbml0aW9uLlxuXHRcdFx0dGhpcy5fY29udGVudCA9IFtuZXcgTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KHZhbHVlKV07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbnRlbnQgPSB2YWx1ZTtcblx0XHR9XG5cdH1cblxuXHRnZXQgY29udGVudCgpOiAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydCB8IExhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQpW10ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50O1xuXHR9XG5cblx0Ly8gVGVtcCB0byBhdm9pZCBicmVha2luZyBjaGFuZ2VzXG5cdHNldCBjb250ZW50Mih2YWx1ZTogKHN0cmluZyB8IExhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCB8IExhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpW10gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdHRoaXMuY29udGVudCA9IHZhbHVlLm1hcChwYXJ0ID0+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBwYXJ0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KHBhcnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGNvbnRlbnQyKCk6IChzdHJpbmcgfCBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQgfCBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydClbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGVudC5tYXAocGFydCA9PiB7XG5cdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIExhbmd1YWdlTW9kZWxUZXh0UGFydCkge1xuXHRcdFx0XHRyZXR1cm4gcGFydC52YWx1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdH0pO1xuXHR9XG5cblx0bmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKHJvbGU6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLCBjb250ZW50OiBzdHJpbmcgfCAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydCB8IExhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQpW10sIG5hbWU/OiBzdHJpbmcpIHtcblx0XHR0aGlzLnJvbGUgPSByb2xlO1xuXHRcdHRoaXMuY29udGVudCA9IGNvbnRlbnQ7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IGltcGxlbWVudHMgdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQge1xuXHRjYWxsSWQ6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHRpbnB1dDogYW55O1xuXG5cdGNvbnN0cnVjdG9yKGNhbGxJZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGlucHV0OiBhbnkpIHtcblx0XHR0aGlzLmNhbGxJZCA9IGNhbGxJZDtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXG5cdFx0dGhpcy5pbnB1dCA9IGlucHV0O1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIExhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2Uge1xuXHRBc3Npc3RhbnQgPSAwLFxuXHRVc2VyID0gMSxcblx0RXh0ZW5zaW9uID0gMixcbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxUZXh0UGFydCBpbXBsZW1lbnRzIHZzY29kZS5MYW5ndWFnZU1vZGVsVGV4dFBhcnQyIHtcblx0dmFsdWU6IHN0cmluZztcblx0YXVkaWVuY2U6IHZzY29kZS5MYW5ndWFnZU1vZGVsUGFydEF1ZGllbmNlW10gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IodmFsdWU6IHN0cmluZywgYXVkaWVuY2U/OiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZVtdKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHRcdGF1ZGllbmNlID0gYXVkaWVuY2U7XG5cdH1cblxuXHR0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5MYW5ndWFnZU1vZGVsVGV4dFBhcnQsXG5cdFx0XHR2YWx1ZTogdGhpcy52YWx1ZSxcblx0XHRcdGF1ZGllbmNlOiB0aGlzLmF1ZGllbmNlLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxEYXRhUGFydCBpbXBsZW1lbnRzIHZzY29kZS5MYW5ndWFnZU1vZGVsRGF0YVBhcnQyIHtcblx0bWltZVR5cGU6IHN0cmluZztcblx0ZGF0YTogVWludDhBcnJheTxBcnJheUJ1ZmZlckxpa2U+O1xuXHRhdWRpZW5jZTogdnNjb2RlLkxhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2VbXSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihkYXRhOiBVaW50OEFycmF5PEFycmF5QnVmZmVyTGlrZT4sIG1pbWVUeXBlOiBzdHJpbmcsIGF1ZGllbmNlPzogdnNjb2RlLkxhbmd1YWdlTW9kZWxQYXJ0QXVkaWVuY2VbXSkge1xuXHRcdHRoaXMubWltZVR5cGUgPSBtaW1lVHlwZTtcblx0XHR0aGlzLmRhdGEgPSBkYXRhO1xuXHRcdHRoaXMuYXVkaWVuY2UgPSBhdWRpZW5jZTtcblx0fVxuXG5cdHN0YXRpYyBpbWFnZShkYXRhOiBVaW50OEFycmF5PEFycmF5QnVmZmVyTGlrZT4sIG1pbWVUeXBlOiBzdHJpbmcpOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0IHtcblx0XHRyZXR1cm4gbmV3IExhbmd1YWdlTW9kZWxEYXRhUGFydChkYXRhLCBtaW1lVHlwZSk7XG5cdH1cblxuXHRzdGF0aWMganNvbih2YWx1ZTogb2JqZWN0LCBtaW1lOiBzdHJpbmcgPSAndGV4dC94LWpzb24nKTogdnNjb2RlLkxhbmd1YWdlTW9kZWxEYXRhUGFydCB7XG5cdFx0Y29uc3QgcmF3U3RyID0gSlNPTi5zdHJpbmdpZnkodmFsdWUsIHVuZGVmaW5lZCwgJ1xcdCcpO1xuXHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KFZTQnVmZmVyLmZyb21TdHJpbmcocmF3U3RyKS5idWZmZXIsIG1pbWUpO1xuXHR9XG5cblx0c3RhdGljIHRleHQodmFsdWU6IHN0cmluZywgbWltZTogc3RyaW5nID0gTWltZXMudGV4dCk6IHZzY29kZS5MYW5ndWFnZU1vZGVsRGF0YVBhcnQge1xuXHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KFZTQnVmZmVyLmZyb21TdHJpbmcodmFsdWUpLmJ1ZmZlciwgbWltZSk7XG5cdH1cblxuXHR0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5MYW5ndWFnZU1vZGVsRGF0YVBhcnQsXG5cdFx0XHRtaW1lVHlwZTogdGhpcy5taW1lVHlwZSxcblx0XHRcdGRhdGE6IGVuY29kZUJhc2U2NChWU0J1ZmZlci53cmFwKHRoaXMuZGF0YSkpLFxuXHRcdFx0YXVkaWVuY2U6IHRoaXMuYXVkaWVuY2Vcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIENoYXRJbWFnZU1pbWVUeXBlIHtcblx0UE5HID0gJ2ltYWdlL3BuZycsXG5cdEpQRUcgPSAnaW1hZ2UvanBlZycsXG5cdEdJRiA9ICdpbWFnZS9naWYnLFxuXHRXRUJQID0gJ2ltYWdlL3dlYnAnLFxuXHRCTVAgPSAnaW1hZ2UvYm1wJyxcbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQgaW1wbGVtZW50cyB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydCB7XG5cdHZhbHVlOiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0aWQ/OiBzdHJpbmc7XG5cdG1ldGFkYXRhPzogeyByZWFkb25seSBba2V5OiBzdHJpbmddOiBhbnkgfTtcblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogc3RyaW5nIHwgc3RyaW5nW10sIGlkPzogc3RyaW5nLCBtZXRhZGF0YT86IHsgcmVhZG9ubHkgW2tleTogc3RyaW5nXTogYW55IH0pIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHRcdHRoaXMubWV0YWRhdGEgPSBtZXRhZGF0YTtcblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQsXG5cdFx0XHR2YWx1ZTogdGhpcy52YWx1ZSxcblx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0bWV0YWRhdGE6IHRoaXMubWV0YWRhdGEsXG5cdFx0fTtcblx0fVxufVxuXG5cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxQcm9tcHRUc3hQYXJ0IHtcblx0dmFsdWU6IHVua25vd247XG5cblx0Y29uc3RydWN0b3IodmFsdWU6IHVua25vd24pIHtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHR0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5MYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCxcblx0XHRcdHZhbHVlOiB0aGlzLnZhbHVlLFxuXHRcdH07XG5cdH1cbn1cblxuLyoqXG4gKiBAZGVwcmVjYXRlZFxuICovXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbENoYXRTeXN0ZW1NZXNzYWdlIHtcblx0Y29udGVudDogc3RyaW5nO1xuXHRjb25zdHJ1Y3Rvcihjb250ZW50OiBzdHJpbmcpIHtcblx0XHR0aGlzLmNvbnRlbnQgPSBjb250ZW50O1xuXHR9XG59XG5cblxuLyoqXG4gKiBAZGVwcmVjYXRlZFxuICovXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbENoYXRVc2VyTWVzc2FnZSB7XG5cdGNvbnRlbnQ6IHN0cmluZztcblx0bmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRlbnQ6IHN0cmluZywgbmFtZT86IHN0cmluZykge1xuXHRcdHRoaXMuY29udGVudCA9IGNvbnRlbnQ7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0fVxufVxuXG4vKipcbiAqIEBkZXByZWNhdGVkXG4gKi9cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsQ2hhdEFzc2lzdGFudE1lc3NhZ2Uge1xuXHRjb250ZW50OiBzdHJpbmc7XG5cdG5hbWU/OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoY29udGVudDogc3RyaW5nLCBuYW1lPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5jb250ZW50ID0gY29udGVudDtcblx0XHR0aGlzLm5hbWUgPSBuYW1lO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cblx0c3RhdGljIHJlYWRvbmx5ICNuYW1lID0gJ0xhbmd1YWdlTW9kZWxFcnJvcic7XG5cblx0c3RhdGljIE5vdEZvdW5kKG1lc3NhZ2U/OiBzdHJpbmcpOiBMYW5ndWFnZU1vZGVsRXJyb3Ige1xuXHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbEVycm9yKG1lc3NhZ2UsIExhbmd1YWdlTW9kZWxFcnJvci5Ob3RGb3VuZC5uYW1lKTtcblx0fVxuXG5cdHN0YXRpYyBOb1Blcm1pc3Npb25zKG1lc3NhZ2U/OiBzdHJpbmcpOiBMYW5ndWFnZU1vZGVsRXJyb3Ige1xuXHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbEVycm9yKG1lc3NhZ2UsIExhbmd1YWdlTW9kZWxFcnJvci5Ob1Blcm1pc3Npb25zLm5hbWUpO1xuXHR9XG5cblx0c3RhdGljIEJsb2NrZWQobWVzc2FnZT86IHN0cmluZyk6IExhbmd1YWdlTW9kZWxFcnJvciB7XG5cdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsRXJyb3IobWVzc2FnZSwgTGFuZ3VhZ2VNb2RlbEVycm9yLkJsb2NrZWQubmFtZSk7XG5cdH1cblxuXHRzdGF0aWMgdHJ5RGVzZXJpYWxpemUoZGF0YTogU2VyaWFsaXplZEVycm9yKTogTGFuZ3VhZ2VNb2RlbEVycm9yIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZGF0YS5uYW1lICE9PSBMYW5ndWFnZU1vZGVsRXJyb3IuI25hbWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTGFuZ3VhZ2VNb2RlbEVycm9yKGRhdGEubWVzc2FnZSwgZGF0YS5jb2RlLCBkYXRhLmNhdXNlKTtcblx0fVxuXG5cdHJlYWRvbmx5IGNvZGU6IHN0cmluZztcblxuXHRjb25zdHJ1Y3RvcihtZXNzYWdlPzogc3RyaW5nLCBjb2RlPzogc3RyaW5nLCBjYXVzZT86IEVycm9yKSB7XG5cdFx0c3VwZXIobWVzc2FnZSwgeyBjYXVzZSB9KTtcblx0XHR0aGlzLm5hbWUgPSBMYW5ndWFnZU1vZGVsRXJyb3IuI25hbWU7XG5cdFx0dGhpcy5jb2RlID0gY29kZSA/PyAnJztcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdCB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBjb250ZW50OiAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpW10pIHsgfVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0LFxuXHRcdFx0Y29udGVudDogdGhpcy5jb250ZW50LFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxUb29sUmVzdWx0MiB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBjb250ZW50OiAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpW10pIHsgfVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0LFxuXHRcdFx0Y29udGVudDogdGhpcy5jb250ZW50LFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuZGVkTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQgZXh0ZW5kcyBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdCB7XG5cdHRvb2xSZXN1bHRNZXNzYWdlPzogc3RyaW5nIHwgTWFya2Rvd25TdHJpbmc7XG5cdHRvb2xSZXN1bHREZXRhaWxzPzogQXJyYXk8VVJJIHwgTG9jYXRpb24+O1xuXHR0b29sTWV0YWRhdGE/OiB1bmtub3duO1xuXHRoYXNFcnJvcj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBlbnVtIExhbmd1YWdlTW9kZWxDaGF0VG9vbE1vZGUge1xuXHRBdXRvID0gMSxcblx0UmVxdWlyZWQgPSAyXG59XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsVG9vbEV4dGVuc2lvblNvdXJjZSBpbXBsZW1lbnRzIHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEV4dGVuc2lvblNvdXJjZSB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nLCBwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZykgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsVG9vbE1DUFNvdXJjZSBpbXBsZW1lbnRzIHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbE1DUFNvdXJjZSB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBsYWJlbDogc3RyaW5nLCBwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nLCBwdWJsaWMgcmVhZG9ubHkgaW5zdHJ1Y3Rpb25zOiBzdHJpbmcgfCB1bmRlZmluZWQpIHsgfVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGFpXG5cbmV4cG9ydCBlbnVtIFJlbGF0ZWRJbmZvcm1hdGlvblR5cGUge1xuXHRTeW1ib2xJbmZvcm1hdGlvbiA9IDEsXG5cdENvbW1hbmRJbmZvcm1hdGlvbiA9IDIsXG5cdFNlYXJjaEluZm9ybWF0aW9uID0gMyxcblx0U2V0dGluZ0luZm9ybWF0aW9uID0gNFxufVxuXG5leHBvcnQgZW51bSBTZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQge1xuXHRFTUJFRERFRCA9IDEsXG5cdExMTV9SQU5LRUQgPSAyLFxuXHRDQU5DRUxFRCA9IDMsXG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gU3BlZWNoXG5cbmV4cG9ydCBlbnVtIFNwZWVjaFRvVGV4dFN0YXR1cyB7XG5cdFN0YXJ0ZWQgPSAxLFxuXHRSZWNvZ25pemluZyA9IDIsXG5cdFJlY29nbml6ZWQgPSAzLFxuXHRTdG9wcGVkID0gNCxcblx0RXJyb3IgPSA1XG59XG5cbmV4cG9ydCBlbnVtIFRleHRUb1NwZWVjaFN0YXR1cyB7XG5cdFN0YXJ0ZWQgPSAxLFxuXHRTdG9wcGVkID0gMixcblx0RXJyb3IgPSAzXG59XG5cbmV4cG9ydCBlbnVtIEtleXdvcmRSZWNvZ25pdGlvblN0YXR1cyB7XG5cdFJlY29nbml6ZWQgPSAxLFxuXHRTdG9wcGVkID0gMlxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIE1DUFxuZXhwb3J0IGVudW0gTWNwVG9vbEF2YWlsYWJpbGl0eSB7XG5cdEluaXRpYWwgPSAwLFxuXHREeW5hbWljID0gMSxcbn1cblxuZXhwb3J0IGNsYXNzIE1jcFN0ZGlvU2VydmVyRGVmaW5pdGlvbiBpbXBsZW1lbnRzIHZzY29kZS5NY3BTdGRpb1NlcnZlckRlZmluaXRpb24ge1xuXHRjd2Q/OiBVUkk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGxhYmVsOiBzdHJpbmcsXG5cdFx0cHVibGljIGNvbW1hbmQ6IHN0cmluZyxcblx0XHRwdWJsaWMgYXJnczogc3RyaW5nW10sXG5cdFx0cHVibGljIGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgbnVtYmVyIHwgbnVsbD4gPSB7fSxcblx0XHRwdWJsaWMgdmVyc2lvbj86IHN0cmluZyxcblx0XHRwdWJsaWMgbWV0YWRhdGE/OiB2c2NvZGUuTWNwU2VydmVyTWV0YWRhdGEsXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBNY3BIdHRwU2VydmVyRGVmaW5pdGlvbiBpbXBsZW1lbnRzIHZzY29kZS5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyB1cmk6IFVSSSxcblx0XHRwdWJsaWMgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9LFxuXHRcdHB1YmxpYyB2ZXJzaW9uPzogc3RyaW5nLFxuXHRcdHB1YmxpYyBtZXRhZGF0YT86IHZzY29kZS5NY3BTZXJ2ZXJNZXRhZGF0YSxcblx0XHRwdWJsaWMgYXV0aGVudGljYXRpb24/OiB7IHByb3ZpZGVySWQ6IHN0cmluZzsgc2NvcGVzOiBzdHJpbmdbXSB9LFxuXHQpIHsgfVxufVxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBDaGF0IFByb21wdCBGaWxlc1xuLy8jZW5kcmVnaW9uXG4iXSwK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IkRpYWdub3N0aWMiLCAiTG9jYXRpb24iLCAiTWFya2Rvd25TdHJpbmciLCAiUG9zaXRpb24iLCAiUmFuZ2UiLCAiU25pcHBldFN0cmluZyIsICJTeW1ib2xLaW5kIiwgIlN5bWJvbFRhZyIsICJUZXh0RWRpdCIsICJXb3Jrc3BhY2VFZGl0IiwgIlRlcm1pbmFsT3V0cHV0QW5jaG9yIiwgIlRlcm1pbmFsUXVpY2tGaXhUeXBlIiwgIkVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZSIsICJIb3ZlclZlcmJvc2l0eUFjdGlvbiIsICJEb2N1bWVudEhpZ2hsaWdodEtpbmQiLCAiQ29kZUFjdGlvblRyaWdnZXJLaW5kIiwgIkxhbmd1YWdlU3RhdHVzU2V2ZXJpdHkiLCAiU2lnbmF0dXJlSGVscFRyaWdnZXJLaW5kIiwgIklubGF5SGludEtpbmQiLCAiQ29tcGxldGlvblRyaWdnZXJLaW5kIiwgIkNvbXBsZXRpb25JdGVtS2luZCIsICJDb21wbGV0aW9uSXRlbVRhZyIsICJQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQiLCAiSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQiLCAiSW5saW5lQ29tcGxldGlvbkRpc3BsYXlMb2NhdGlvbktpbmQiLCAiVmlld0NvbHVtbiIsICJTdGF0dXNCYXJBbGlnbm1lbnQiLCAiVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUiLCAiVGV4dERvY3VtZW50U2F2ZVJlYXNvbiIsICJUZXh0RWRpdG9yUmV2ZWFsVHlwZSIsICJUZXh0RWRpdG9yU2VsZWN0aW9uQ2hhbmdlS2luZCIsICJUZXh0RWRpdG9yQ2hhbmdlS2luZCIsICJUZXh0RG9jdW1lbnRDaGFuZ2VSZWFzb24iLCAiRGVjb3JhdGlvblJhbmdlQmVoYXZpb3IiLCAiU3ludGF4VG9rZW5UeXBlIiwgIkNvbG9yRm9ybWF0IiwgIlNvdXJjZUNvbnRyb2xJbnB1dEJveFZhbGlkYXRpb25UeXBlIiwgIlRlcm1pbmFsRXhpdFJlYXNvbiIsICJUZXJtaW5hbFNoZWxsRXhlY3V0aW9uQ29tbWFuZExpbmVDb25maWRlbmNlIiwgIlRlcm1pbmFsU2hlbGxUeXBlIiwgIlRlcm1pbmFsTG9jYXRpb24iLCAiVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQiLCAiVGFza1JldmVhbEtpbmQiLCAiVGFza0V2ZW50S2luZCIsICJUYXNrUGFuZWxLaW5kIiwgIlNoZWxsUXVvdGluZyIsICJUYXNrU2NvcGUiLCAiVGFza1J1bk9uIiwgIlByb2dyZXNzTG9jYXRpb24iLCAiVmlld0JhZGdlIiwgIlRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSIsICJUcmVlSXRlbUNoZWNrYm94U3RhdGUiLCAiRG9jdW1lbnRQYXN0ZVRyaWdnZXJLaW5kIiwgIkNvbmZpZ3VyYXRpb25UYXJnZXQiLCAiSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kIiwgIklubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbktpbmQiLCAiTmV3U3ltYm9sTmFtZVRhZyIsICJOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQiLCAiRmlsZUNoYW5nZVR5cGUiLCAiRm9sZGluZ1JhbmdlS2luZCIsICJDb21tZW50VGhyZWFkQ29sbGFwc2libGVTdGF0ZSIsICJDb21tZW50TW9kZSIsICJDb21tZW50U3RhdGUiLCAiQ29tbWVudFRocmVhZFN0YXRlIiwgIkNvbW1lbnRUaHJlYWRBcHBsaWNhYmlsaXR5IiwgIkNvbW1lbnRUaHJlYWRGb2N1cyIsICJsaW5lIiwgImNoYXIiLCAiRGVidWdDb25zb2xlTW9kZSIsICJRdWlja0lucHV0QnV0dG9uTG9jYXRpb24iLCAiUXVpY2tQaWNrSXRlbUtpbmQiLCAiSW5wdXRCb3hWYWxpZGF0aW9uU2V2ZXJpdHkiLCAiRXh0ZW5zaW9uS2luZCIsICJDb2xvclRoZW1lS2luZCIsICJOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZSIsICJOb3RlYm9va0NlbGxTdGF0dXNCYXJBbGlnbm1lbnQiLCAiTm90ZWJvb2tFZGl0b3JSZXZlYWxUeXBlIiwgIk5vdGVib29rQ29udHJvbGxlckFmZmluaXR5IiwgIk5vdGVib29rQ29udHJvbGxlckFmZmluaXR5MiIsICJOb3RlYm9va1ZhcmlhYmxlc1JlcXVlc3RLaW5kIiwgIkV4dGVuc2lvbk1vZGUiLCAiRXh0ZW5zaW9uUnVudGltZSIsICJTdGFuZGFyZFRva2VuVHlwZSIsICJTeW50YXhIaWdobGlnaHRpbmdUb2tlbkZvbnRTdHlsZSIsICJUZXN0UmVzdWx0U3RhdGUiLCAiVGVzdFJ1blByb2ZpbGVLaW5kIiwgIkV4dGVybmFsVXJpT3BlbmVyUHJpb3JpdHkiLCAiV29ya3NwYWNlVHJ1c3RTdGF0ZSIsICJQb3J0QXV0b0ZvcndhcmRBY3Rpb24iLCAiSW50ZXJhY3RpdmVTZXNzaW9uVm90ZURpcmVjdGlvbiIsICJDaGF0Q29weUtpbmQiLCAiQ2hhdFZhcmlhYmxlTGV2ZWwiLCAiQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uT3V0Y29tZSIsICJDaGF0UmVxdWVzdEVkaXRlZEZpbGVFdmVudEtpbmQiLCAiSW50ZXJhY3RpdmVFZGl0b3JSZXNwb25zZUZlZWRiYWNrS2luZCIsICJDaGF0UmVzdWx0RmVlZGJhY2tLaW5kIiwgIkNoYXRRdWVzdGlvblR5cGUiLCAiQ2hhdFRvZG9TdGF0dXMiLCAiQ2hhdERlYnVnU3ViYWdlbnRTdGF0dXMiLCAiQ2hhdExvY2F0aW9uIiwgIkNoYXRTZXNzaW9uU3RhdHVzIiwgIkNoYXREZWJ1Z0xvZ0xldmVsIiwgIkNoYXREZWJ1Z1Rvb2xDYWxsUmVzdWx0IiwgIkNoYXREZWJ1Z0hvb2tSZXN1bHQiLCAiQ2hhdERlYnVnTWVzc2FnZUNvbnRlbnRUeXBlIiwgIkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnRTdGF0dXNLaW5kIiwgIkNoYXRSZXNwb25zZUNsZWFyVG9QcmV2aW91c1Rvb2xJbnZvY2F0aW9uUmVhc29uIiwgIkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUiLCAiQ2hhdEVycm9yTGV2ZWwiLCAiQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkiLCAiTGFuZ3VhZ2VNb2RlbFBhcnRBdWRpZW5jZSIsICJDaGF0SW1hZ2VNaW1lVHlwZSIsICJMYW5ndWFnZU1vZGVsQ2hhdFRvb2xNb2RlIiwgIlJlbGF0ZWRJbmZvcm1hdGlvblR5cGUiLCAiU2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kIiwgIlNwZWVjaFRvVGV4dFN0YXR1cyIsICJUZXh0VG9TcGVlY2hTdGF0dXMiLCAiS2V5d29yZFJlY29nbml0aW9uU3RhdHVzIiwgIk1jcFRvb2xBdmFpbGFiaWxpdHkiXQp9Cg==
