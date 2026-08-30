import { asArray, coalesce, isNonEmptyArray } from "../../../base/common/arrays.js";
import { VSBuffer, decodeBase64, encodeBase64 } from "../../../base/common/buffer.js";
import { UriList } from "../../../base/common/dataTransfer.js";
import { createSingleCallFunction } from "../../../base/common/functional.js";
import * as htmlContent from "../../../base/common/htmlContent.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import * as marked from "../../../base/common/marked/marked.js";
import { parse, revive } from "../../../base/common/marshalling.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { Mimes } from "../../../base/common/mime.js";
import { cloneAndChange } from "../../../base/common/objects.js";
import { OS } from "../../../base/common/platform.js";
import { WellDefinedPrefixTree } from "../../../base/common/prefixTree.js";
import { basename } from "../../../base/common/resources.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { isDefined, isEmptyObject, isNumber, isString, isUndefinedOrNull } from "../../../base/common/types.js";
import { URI, isUriComponents } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { RenderLineNumbersType } from "../../../editor/common/config/editorOptions.js";
import * as editorRange from "../../../editor/common/core/range.js";
import * as encodedTokenAttributes from "../../../editor/common/encodedTokenAttributes.js";
import * as languages from "../../../editor/common/languages.js";
import { EndOfLineSequence, TrackedRangeStickiness } from "../../../editor/common/model.js";
import { MarkerSeverity, MarkerTag } from "../../../platform/markers/common/markers.js";
import { ProgressLocation as MainProgressLocation } from "../../../platform/progress/common/progress.js";
import { DEFAULT_EDITOR_ASSOCIATION, SaveReason } from "../../common/editor.js";
import { LocalChatSessionUri } from "../../contrib/chat/common/model/chatUri.js";
import { isElementVariableEntry, isImageVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry } from "../../contrib/chat/common/attachments/chatVariableEntries.js";
import { coerceImageBuffer } from "../../contrib/chat/common/chatImageExtraction.js";
import { ChatSessionStatus } from "../../contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation } from "../../contrib/chat/common/constants.js";
import { resolveEffectiveCommand } from "../../contrib/chat/common/promptSyntax/hookSchema.js";
import { ToolDataSource, ToolInvocationPresentation } from "../../contrib/chat/common/tools/languageModelToolsService.js";
import * as chatProvider from "../../contrib/chat/common/languageModels.js";
import { DebugTreeItemCollapsibleState } from "../../contrib/debug/common/debug.js";
import { McpServerLaunch, McpServerTransportType } from "../../contrib/mcp/common/mcpTypes.js";
import * as notebooks from "../../contrib/notebook/common/notebookCommon.js";
import { CellEditType } from "../../contrib/notebook/common/notebookCommon.js";
import { InputValidationType } from "../../contrib/scm/common/scm.js";
import { TestId } from "../../contrib/testing/common/testId.js";
import { DetailType, TestMessageType, TestRunProfileBitset, denamespaceTestTag, namespaceTestTag } from "../../contrib/testing/common/testTypes.js";
import { AiSettingsSearchResultKind } from "../../services/aiSettingsSearch/common/aiSettingsSearch.js";
import { ACTIVE_GROUP, SIDE_GROUP } from "../../services/editor/common/editorService.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { getPrivateApiFor } from "./extHostTestingPrivateApi.js";
import * as types from "./extHostTypes.js";
import { LanguageModelTextPart } from "./extHostTypes.js";
var Selection;
((Selection2) => {
  function to(selection) {
    const { selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn } = selection;
    const start = new types.Position(selectionStartLineNumber - 1, selectionStartColumn - 1);
    const end = new types.Position(positionLineNumber - 1, positionColumn - 1);
    return new types.Selection(start, end);
  }
  Selection2.to = to;
  function from(selection) {
    const { anchor, active } = selection;
    return {
      selectionStartLineNumber: anchor.line + 1,
      selectionStartColumn: anchor.character + 1,
      positionLineNumber: active.line + 1,
      positionColumn: active.character + 1
    };
  }
  Selection2.from = from;
})(Selection || (Selection = {}));
var Range;
((Range2) => {
  function from(range) {
    if (!range) {
      return void 0;
    }
    const { start, end } = range;
    return {
      startLineNumber: start.line + 1,
      startColumn: start.character + 1,
      endLineNumber: end.line + 1,
      endColumn: end.character + 1
    };
  }
  Range2.from = from;
  function to(range) {
    if (!range) {
      return void 0;
    }
    const { startLineNumber, startColumn, endLineNumber, endColumn } = range;
    return new types.Range(startLineNumber - 1, startColumn - 1, endLineNumber - 1, endColumn - 1);
  }
  Range2.to = to;
})(Range || (Range = {}));
var Location;
((Location2) => {
  function from(location2) {
    return {
      uri: location2.uri,
      range: Range.from(location2.range)
    };
  }
  Location2.from = from;
  function to(location2) {
    return new types.Location(URI.revive(location2.uri), Range.to(location2.range));
  }
  Location2.to = to;
})(Location || (Location = {}));
var TokenType;
((TokenType2) => {
  function to(type) {
    switch (type) {
      case encodedTokenAttributes.StandardTokenType.Comment:
        return types.StandardTokenType.Comment;
      case encodedTokenAttributes.StandardTokenType.Other:
        return types.StandardTokenType.Other;
      case encodedTokenAttributes.StandardTokenType.RegEx:
        return types.StandardTokenType.RegEx;
      case encodedTokenAttributes.StandardTokenType.String:
        return types.StandardTokenType.String;
    }
  }
  TokenType2.to = to;
})(TokenType || (TokenType = {}));
var Position;
((Position2) => {
  function to(position) {
    return new types.Position(position.lineNumber - 1, position.column - 1);
  }
  Position2.to = to;
  function from(position) {
    return { lineNumber: position.line + 1, column: position.character + 1 };
  }
  Position2.from = from;
})(Position || (Position = {}));
var DocumentSelector;
((DocumentSelector2) => {
  function from(value, uriTransformer, extension) {
    return coalesce(asArray(value).map((sel) => _doTransformDocumentSelector(sel, uriTransformer, extension)));
  }
  DocumentSelector2.from = from;
  function _doTransformDocumentSelector(selector, uriTransformer, extension) {
    if (typeof selector === "string") {
      return {
        $serialized: true,
        language: selector,
        isBuiltin: extension?.isBuiltin
      };
    }
    if (selector) {
      return {
        $serialized: true,
        language: selector.language,
        scheme: _transformScheme(selector.scheme, uriTransformer),
        pattern: GlobPattern.from(selector.pattern) ?? void 0,
        exclusive: selector.exclusive,
        notebookType: selector.notebookType,
        isBuiltin: extension?.isBuiltin
      };
    }
    return void 0;
  }
  function _transformScheme(scheme, uriTransformer) {
    if (uriTransformer && typeof scheme === "string") {
      return uriTransformer.transformOutgoingScheme(scheme);
    }
    return scheme;
  }
})(DocumentSelector || (DocumentSelector = {}));
var TabSelector;
((TabSelector2) => {
  function isViewTypeSelector(value) {
    return value.viewType !== void 0;
  }
  function from(value, uriTransformer, extension) {
    if (isViewTypeSelector(value)) {
      return { viewType: value.viewType };
    }
    return { uri: DocumentSelector.from(value.uri, uriTransformer, extension) };
  }
  TabSelector2.from = from;
})(TabSelector || (TabSelector = {}));
var DiagnosticTag;
((DiagnosticTag2) => {
  function from(value) {
    switch (value) {
      case types.DiagnosticTag.Unnecessary:
        return MarkerTag.Unnecessary;
      case types.DiagnosticTag.Deprecated:
        return MarkerTag.Deprecated;
    }
    return void 0;
  }
  DiagnosticTag2.from = from;
  function to(value) {
    switch (value) {
      case MarkerTag.Unnecessary:
        return types.DiagnosticTag.Unnecessary;
      case MarkerTag.Deprecated:
        return types.DiagnosticTag.Deprecated;
      default:
        return void 0;
    }
  }
  DiagnosticTag2.to = to;
})(DiagnosticTag || (DiagnosticTag = {}));
var Diagnostic;
((Diagnostic2) => {
  function from(value) {
    let code;
    if (value.code) {
      if (isString(value.code) || isNumber(value.code)) {
        code = String(value.code);
      } else {
        code = {
          value: String(value.code.value),
          target: value.code.target
        };
      }
    }
    return {
      ...Range.from(value.range),
      message: value.message,
      source: value.source,
      code,
      severity: DiagnosticSeverity.from(value.severity),
      relatedInformation: value.relatedInformation && value.relatedInformation.map(DiagnosticRelatedInformation.from),
      tags: Array.isArray(value.tags) ? coalesce(value.tags.map(DiagnosticTag.from)) : void 0
    };
  }
  Diagnostic2.from = from;
  function to(value) {
    const res = new types.Diagnostic(Range.to(value), value.message, DiagnosticSeverity.to(value.severity));
    res.source = value.source;
    res.code = isString(value.code) ? value.code : value.code?.value;
    res.relatedInformation = value.relatedInformation && value.relatedInformation.map(DiagnosticRelatedInformation.to);
    res.tags = value.tags && coalesce(value.tags.map(DiagnosticTag.to));
    return res;
  }
  Diagnostic2.to = to;
})(Diagnostic || (Diagnostic = {}));
var DiagnosticRelatedInformation;
((DiagnosticRelatedInformation2) => {
  function from(value) {
    return {
      ...Range.from(value.location.range),
      message: value.message,
      resource: value.location.uri
    };
  }
  DiagnosticRelatedInformation2.from = from;
  function to(value) {
    return new types.DiagnosticRelatedInformation(new types.Location(value.resource, Range.to(value)), value.message);
  }
  DiagnosticRelatedInformation2.to = to;
})(DiagnosticRelatedInformation || (DiagnosticRelatedInformation = {}));
var DiagnosticSeverity;
((DiagnosticSeverity2) => {
  function from(value) {
    switch (value) {
      case types.DiagnosticSeverity.Error:
        return MarkerSeverity.Error;
      case types.DiagnosticSeverity.Warning:
        return MarkerSeverity.Warning;
      case types.DiagnosticSeverity.Information:
        return MarkerSeverity.Info;
      case types.DiagnosticSeverity.Hint:
        return MarkerSeverity.Hint;
    }
    return MarkerSeverity.Error;
  }
  DiagnosticSeverity2.from = from;
  function to(value) {
    switch (value) {
      case MarkerSeverity.Info:
        return types.DiagnosticSeverity.Information;
      case MarkerSeverity.Warning:
        return types.DiagnosticSeverity.Warning;
      case MarkerSeverity.Error:
        return types.DiagnosticSeverity.Error;
      case MarkerSeverity.Hint:
        return types.DiagnosticSeverity.Hint;
      default:
        return types.DiagnosticSeverity.Error;
    }
  }
  DiagnosticSeverity2.to = to;
})(DiagnosticSeverity || (DiagnosticSeverity = {}));
var ViewColumn;
((ViewColumn2) => {
  function from(column) {
    if (typeof column === "number" && column >= types.ViewColumn.One) {
      return column - 1;
    }
    if (column === types.ViewColumn.Beside) {
      return SIDE_GROUP;
    }
    return ACTIVE_GROUP;
  }
  ViewColumn2.from = from;
  function to(position) {
    if (typeof position === "number" && position >= 0) {
      return position + 1;
    }
    throw new Error(`invalid 'EditorGroupColumn'`);
  }
  ViewColumn2.to = to;
})(ViewColumn || (ViewColumn = {}));
function isDecorationOptions(something) {
  return typeof something.range !== "undefined";
}
function isDecorationOptionsArr(something) {
  if (something.length === 0) {
    return true;
  }
  return isDecorationOptions(something[0]) ? true : false;
}
var MarkdownString;
((MarkdownString2) => {
  function fromMany(markup) {
    return markup.map(MarkdownString2.from);
  }
  MarkdownString2.fromMany = fromMany;
  function isCodeblock(thing) {
    return thing && typeof thing === "object" && typeof thing.language === "string" && typeof thing.value === "string";
  }
  function from(markup) {
    let res;
    if (isCodeblock(markup)) {
      const { language, value } = markup;
      res = { value: "```" + language + "\n" + value + "\n```\n" };
    } else if (types.MarkdownString.isMarkdownString(markup)) {
      res = { value: markup.value, isTrusted: markup.isTrusted, supportThemeIcons: markup.supportThemeIcons, supportHtml: markup.supportHtml, supportAlertSyntax: markup.supportAlertSyntax, baseUri: markup.baseUri };
    } else if (typeof markup === "string") {
      res = { value: markup };
    } else {
      res = { value: "" };
    }
    const resUris = /* @__PURE__ */ Object.create(null);
    res.uris = resUris;
    const collectUri = ({ href }) => {
      try {
        let uri = URI.parse(href, true);
        uri = uri.with({ query: _uriMassage(uri.query, resUris) });
        resUris[href] = uri;
      } catch (e) {
      }
      return "";
    };
    marked.marked.walkTokens(marked.marked.lexer(res.value), (token) => {
      if (token.type === "link") {
        collectUri({ href: token.href });
      } else if (token.type === "image") {
        if (typeof token.href === "string") {
          collectUri(htmlContent.parseHrefAndDimensions(token.href));
        }
      }
    });
    return res;
  }
  MarkdownString2.from = from;
  function _uriMassage(part, bucket) {
    if (!part) {
      return part;
    }
    let data;
    try {
      data = parse(part);
    } catch (e) {
    }
    if (!data) {
      return part;
    }
    let changed = false;
    data = cloneAndChange(data, (value) => {
      if (URI.isUri(value)) {
        const key = `__uri_${Math.random().toString(16).slice(2, 8)}`;
        bucket[key] = value;
        changed = true;
        return key;
      } else {
        return void 0;
      }
    });
    if (!changed) {
      return part;
    }
    return JSON.stringify(data);
  }
  function to(value) {
    const result = new types.MarkdownString(value.value, value.supportThemeIcons);
    result.isTrusted = value.isTrusted;
    result.supportHtml = value.supportHtml;
    result.supportAlertSyntax = value.supportAlertSyntax;
    result.baseUri = value.baseUri ? URI.from(value.baseUri) : void 0;
    return result;
  }
  MarkdownString2.to = to;
  function fromStrict(value) {
    if (!value) {
      return void 0;
    }
    return typeof value === "string" ? value : MarkdownString2.from(value);
  }
  MarkdownString2.fromStrict = fromStrict;
})(MarkdownString || (MarkdownString = {}));
function fromRangeOrRangeWithMessage(ranges) {
  if (isDecorationOptionsArr(ranges)) {
    return ranges.map((r) => {
      return {
        range: Range.from(r.range),
        hoverMessage: Array.isArray(r.hoverMessage) ? MarkdownString.fromMany(r.hoverMessage) : r.hoverMessage ? MarkdownString.from(r.hoverMessage) : void 0,
        // eslint-disable-next-line local/code-no-any-casts
        renderOptions: (
          /* URI vs Uri */
          r.renderOptions
        )
      };
    });
  } else {
    return ranges.map((r) => {
      return {
        range: Range.from(r)
      };
    });
  }
}
function pathOrURIToURI(value) {
  if (typeof value === "undefined") {
    return value;
  }
  if (typeof value === "string") {
    return URI.file(value);
  } else {
    return value;
  }
}
var ThemableDecorationAttachmentRenderOptions;
((ThemableDecorationAttachmentRenderOptions2) => {
  function from(options) {
    if (typeof options === "undefined") {
      return options;
    }
    return {
      contentText: options.contentText,
      contentIconPath: options.contentIconPath ? pathOrURIToURI(options.contentIconPath) : void 0,
      border: options.border,
      borderColor: options.borderColor,
      fontStyle: options.fontStyle,
      fontWeight: options.fontWeight,
      textDecoration: options.textDecoration,
      color: options.color,
      backgroundColor: options.backgroundColor,
      margin: options.margin,
      width: options.width,
      height: options.height
    };
  }
  ThemableDecorationAttachmentRenderOptions2.from = from;
})(ThemableDecorationAttachmentRenderOptions || (ThemableDecorationAttachmentRenderOptions = {}));
var ThemableDecorationRenderOptions;
((ThemableDecorationRenderOptions2) => {
  function from(options) {
    if (typeof options === "undefined") {
      return options;
    }
    return {
      backgroundColor: options.backgroundColor,
      outline: options.outline,
      outlineColor: options.outlineColor,
      outlineStyle: options.outlineStyle,
      outlineWidth: options.outlineWidth,
      border: options.border,
      borderColor: options.borderColor,
      borderRadius: options.borderRadius,
      borderSpacing: options.borderSpacing,
      borderStyle: options.borderStyle,
      borderWidth: options.borderWidth,
      fontStyle: options.fontStyle,
      fontWeight: options.fontWeight,
      textDecoration: options.textDecoration,
      cursor: options.cursor,
      color: options.color,
      opacity: options.opacity,
      letterSpacing: options.letterSpacing,
      gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : void 0,
      gutterIconSize: options.gutterIconSize,
      overviewRulerColor: options.overviewRulerColor,
      before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : void 0,
      after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : void 0
    };
  }
  ThemableDecorationRenderOptions2.from = from;
})(ThemableDecorationRenderOptions || (ThemableDecorationRenderOptions = {}));
var DecorationRangeBehavior;
((DecorationRangeBehavior2) => {
  function from(value) {
    if (typeof value === "undefined") {
      return value;
    }
    switch (value) {
      case types.DecorationRangeBehavior.OpenOpen:
        return TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
      case types.DecorationRangeBehavior.ClosedClosed:
        return TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
      case types.DecorationRangeBehavior.OpenClosed:
        return TrackedRangeStickiness.GrowsOnlyWhenTypingBefore;
      case types.DecorationRangeBehavior.ClosedOpen:
        return TrackedRangeStickiness.GrowsOnlyWhenTypingAfter;
    }
  }
  DecorationRangeBehavior2.from = from;
})(DecorationRangeBehavior || (DecorationRangeBehavior = {}));
var DecorationRenderOptions;
((DecorationRenderOptions2) => {
  function from(options) {
    return {
      isWholeLine: options.isWholeLine,
      rangeBehavior: options.rangeBehavior ? DecorationRangeBehavior.from(options.rangeBehavior) : void 0,
      overviewRulerLane: options.overviewRulerLane,
      light: options.light ? ThemableDecorationRenderOptions.from(options.light) : void 0,
      dark: options.dark ? ThemableDecorationRenderOptions.from(options.dark) : void 0,
      backgroundColor: options.backgroundColor,
      outline: options.outline,
      outlineColor: options.outlineColor,
      outlineStyle: options.outlineStyle,
      outlineWidth: options.outlineWidth,
      border: options.border,
      borderColor: options.borderColor,
      borderRadius: options.borderRadius,
      borderSpacing: options.borderSpacing,
      borderStyle: options.borderStyle,
      borderWidth: options.borderWidth,
      fontStyle: options.fontStyle,
      fontWeight: options.fontWeight,
      textDecoration: options.textDecoration,
      cursor: options.cursor,
      color: options.color,
      opacity: options.opacity,
      letterSpacing: options.letterSpacing,
      gutterIconPath: options.gutterIconPath ? pathOrURIToURI(options.gutterIconPath) : void 0,
      gutterIconSize: options.gutterIconSize,
      overviewRulerColor: options.overviewRulerColor,
      before: options.before ? ThemableDecorationAttachmentRenderOptions.from(options.before) : void 0,
      after: options.after ? ThemableDecorationAttachmentRenderOptions.from(options.after) : void 0
    };
  }
  DecorationRenderOptions2.from = from;
})(DecorationRenderOptions || (DecorationRenderOptions = {}));
var TextEdit;
((TextEdit2) => {
  function from(edit) {
    return {
      text: edit.newText,
      eol: edit.newEol && EndOfLine.from(edit.newEol),
      range: Range.from(edit.range)
    };
  }
  TextEdit2.from = from;
  function to(edit) {
    const result = new types.TextEdit(Range.to(edit.range), edit.text);
    result.newEol = typeof edit.eol === "undefined" ? void 0 : EndOfLine.to(edit.eol);
    return result;
  }
  TextEdit2.to = to;
})(TextEdit || (TextEdit = {}));
var WorkspaceEdit;
((WorkspaceEdit2) => {
  function from(value, versionInfo) {
    const result = {
      edits: []
    };
    if (value instanceof types.WorkspaceEdit) {
      const toCreate = new ResourceSet();
      for (const entry of value._allEntries()) {
        if (entry._type === types.FileEditType.File && URI.isUri(entry.to) && entry.from === void 0) {
          toCreate.add(entry.to);
        }
      }
      for (const entry of value._allEntries()) {
        if (entry._type === types.FileEditType.File) {
          let contents;
          if (entry.options?.contents) {
            if (ArrayBuffer.isView(entry.options.contents)) {
              contents = { type: "base64", value: encodeBase64(VSBuffer.wrap(entry.options.contents)) };
            } else {
              contents = { type: "dataTransferItem", id: entry.options.contents._itemId };
            }
          }
          result.edits.push({
            oldResource: entry.from,
            newResource: entry.to,
            options: { ...entry.options, contents },
            metadata: entry.metadata
          });
        } else if (entry._type === types.FileEditType.Text) {
          result.edits.push({
            resource: entry.uri,
            textEdit: TextEdit.from(entry.edit),
            versionId: !toCreate.has(entry.uri) ? versionInfo?.getTextDocumentVersion(entry.uri) : void 0,
            metadata: entry.metadata
          });
        } else if (entry._type === types.FileEditType.Snippet) {
          result.edits.push({
            resource: entry.uri,
            textEdit: {
              range: Range.from(entry.range),
              text: entry.edit.value,
              insertAsSnippet: true,
              keepWhitespace: entry.keepWhitespace
            },
            versionId: !toCreate.has(entry.uri) ? versionInfo?.getTextDocumentVersion(entry.uri) : void 0,
            metadata: entry.metadata
          });
        } else if (entry._type === types.FileEditType.Cell) {
          result.edits.push({
            metadata: entry.metadata,
            resource: entry.uri,
            cellEdit: entry.edit,
            notebookVersionId: versionInfo?.getNotebookDocumentVersion(entry.uri)
          });
        } else if (entry._type === types.FileEditType.CellReplace) {
          result.edits.push({
            metadata: entry.metadata,
            resource: entry.uri,
            notebookVersionId: versionInfo?.getNotebookDocumentVersion(entry.uri),
            cellEdit: {
              editType: notebooks.CellEditType.Replace,
              index: entry.index,
              count: entry.count,
              cells: entry.cells.map(NotebookCellData.from)
            }
          });
        }
      }
    }
    return result;
  }
  WorkspaceEdit2.from = from;
  function to(value) {
    const result = new types.WorkspaceEdit();
    const edits = new ResourceMap();
    for (const edit of value.edits) {
      if (edit.textEdit) {
        const item = edit;
        const uri = URI.revive(item.resource);
        const range = Range.to(item.textEdit.range);
        const text = item.textEdit.text;
        const isSnippet = item.textEdit.insertAsSnippet;
        let editOrSnippetTest;
        if (isSnippet) {
          editOrSnippetTest = types.SnippetTextEdit.replace(range, new types.SnippetString(text));
        } else {
          editOrSnippetTest = types.TextEdit.replace(range, text);
        }
        const array = edits.get(uri);
        if (!array) {
          edits.set(uri, [editOrSnippetTest]);
        } else {
          array.push(editOrSnippetTest);
        }
      } else {
        result.renameFile(
          URI.revive(edit.oldResource),
          URI.revive(edit.newResource),
          edit.options
        );
      }
    }
    for (const [uri, array] of edits) {
      result.set(uri, array);
    }
    return result;
  }
  WorkspaceEdit2.to = to;
})(WorkspaceEdit || (WorkspaceEdit = {}));
var SymbolKind;
((SymbolKind2) => {
  const _fromMapping = /* @__PURE__ */ Object.create(null);
  _fromMapping[types.SymbolKind.File] = languages.SymbolKind.File;
  _fromMapping[types.SymbolKind.Module] = languages.SymbolKind.Module;
  _fromMapping[types.SymbolKind.Namespace] = languages.SymbolKind.Namespace;
  _fromMapping[types.SymbolKind.Package] = languages.SymbolKind.Package;
  _fromMapping[types.SymbolKind.Class] = languages.SymbolKind.Class;
  _fromMapping[types.SymbolKind.Method] = languages.SymbolKind.Method;
  _fromMapping[types.SymbolKind.Property] = languages.SymbolKind.Property;
  _fromMapping[types.SymbolKind.Field] = languages.SymbolKind.Field;
  _fromMapping[types.SymbolKind.Constructor] = languages.SymbolKind.Constructor;
  _fromMapping[types.SymbolKind.Enum] = languages.SymbolKind.Enum;
  _fromMapping[types.SymbolKind.Interface] = languages.SymbolKind.Interface;
  _fromMapping[types.SymbolKind.Function] = languages.SymbolKind.Function;
  _fromMapping[types.SymbolKind.Variable] = languages.SymbolKind.Variable;
  _fromMapping[types.SymbolKind.Constant] = languages.SymbolKind.Constant;
  _fromMapping[types.SymbolKind.String] = languages.SymbolKind.String;
  _fromMapping[types.SymbolKind.Number] = languages.SymbolKind.Number;
  _fromMapping[types.SymbolKind.Boolean] = languages.SymbolKind.Boolean;
  _fromMapping[types.SymbolKind.Array] = languages.SymbolKind.Array;
  _fromMapping[types.SymbolKind.Object] = languages.SymbolKind.Object;
  _fromMapping[types.SymbolKind.Key] = languages.SymbolKind.Key;
  _fromMapping[types.SymbolKind.Null] = languages.SymbolKind.Null;
  _fromMapping[types.SymbolKind.EnumMember] = languages.SymbolKind.EnumMember;
  _fromMapping[types.SymbolKind.Struct] = languages.SymbolKind.Struct;
  _fromMapping[types.SymbolKind.Event] = languages.SymbolKind.Event;
  _fromMapping[types.SymbolKind.Operator] = languages.SymbolKind.Operator;
  _fromMapping[types.SymbolKind.TypeParameter] = languages.SymbolKind.TypeParameter;
  function from(kind) {
    return typeof _fromMapping[kind] === "number" ? _fromMapping[kind] : languages.SymbolKind.Property;
  }
  SymbolKind2.from = from;
  function to(kind) {
    for (const k in _fromMapping) {
      if (_fromMapping[k] === kind) {
        return Number(k);
      }
    }
    return types.SymbolKind.Property;
  }
  SymbolKind2.to = to;
})(SymbolKind || (SymbolKind = {}));
var SymbolTag;
((SymbolTag2) => {
  function from(kind) {
    switch (kind) {
      case types.SymbolTag.Deprecated:
        return languages.SymbolTag.Deprecated;
    }
  }
  SymbolTag2.from = from;
  function to(kind) {
    switch (kind) {
      case languages.SymbolTag.Deprecated:
        return types.SymbolTag.Deprecated;
    }
  }
  SymbolTag2.to = to;
})(SymbolTag || (SymbolTag = {}));
var WorkspaceSymbol;
((WorkspaceSymbol2) => {
  function from(info) {
    return {
      name: info.name,
      kind: SymbolKind.from(info.kind),
      tags: info.tags && info.tags.map(SymbolTag.from),
      containerName: info.containerName,
      location: location.from(info.location)
    };
  }
  WorkspaceSymbol2.from = from;
  function to(info) {
    const result = new types.SymbolInformation(
      info.name,
      SymbolKind.to(info.kind),
      info.containerName,
      location.to(info.location)
    );
    result.tags = info.tags && info.tags.map(SymbolTag.to);
    return result;
  }
  WorkspaceSymbol2.to = to;
})(WorkspaceSymbol || (WorkspaceSymbol = {}));
var DocumentSymbol;
((DocumentSymbol2) => {
  function from(info) {
    const result = {
      name: info.name || "!!MISSING: name!!",
      detail: info.detail,
      range: Range.from(info.range),
      selectionRange: Range.from(info.selectionRange),
      kind: SymbolKind.from(info.kind),
      tags: info.tags?.map(SymbolTag.from) ?? []
    };
    if (info.children) {
      result.children = info.children.map(from);
    }
    return result;
  }
  DocumentSymbol2.from = from;
  function to(info) {
    const result = new types.DocumentSymbol(
      info.name,
      info.detail,
      SymbolKind.to(info.kind),
      Range.to(info.range),
      Range.to(info.selectionRange)
    );
    if (isNonEmptyArray(info.tags)) {
      result.tags = info.tags.map(SymbolTag.to);
    }
    if (info.children) {
      result.children = info.children.map(to);
    }
    return result;
  }
  DocumentSymbol2.to = to;
})(DocumentSymbol || (DocumentSymbol = {}));
var CallHierarchyItem;
((CallHierarchyItem2) => {
  function to(item) {
    const result = new types.CallHierarchyItem(
      SymbolKind.to(item.kind),
      item.name,
      item.detail || "",
      URI.revive(item.uri),
      Range.to(item.range),
      Range.to(item.selectionRange)
    );
    result._sessionId = item._sessionId;
    result._itemId = item._itemId;
    return result;
  }
  CallHierarchyItem2.to = to;
  function from(item, sessionId, itemId) {
    sessionId = sessionId ?? item._sessionId;
    itemId = itemId ?? item._itemId;
    if (sessionId === void 0 || itemId === void 0) {
      throw new Error("invalid item");
    }
    return {
      _sessionId: sessionId,
      _itemId: itemId,
      name: item.name,
      detail: item.detail,
      kind: SymbolKind.from(item.kind),
      uri: item.uri,
      range: Range.from(item.range),
      selectionRange: Range.from(item.selectionRange),
      tags: item.tags?.map(SymbolTag.from)
    };
  }
  CallHierarchyItem2.from = from;
})(CallHierarchyItem || (CallHierarchyItem = {}));
var CallHierarchyIncomingCall;
((CallHierarchyIncomingCall2) => {
  function to(item) {
    return new types.CallHierarchyIncomingCall(
      CallHierarchyItem.to(item.from),
      item.fromRanges.map((r) => Range.to(r))
    );
  }
  CallHierarchyIncomingCall2.to = to;
})(CallHierarchyIncomingCall || (CallHierarchyIncomingCall = {}));
var CallHierarchyOutgoingCall;
((CallHierarchyOutgoingCall2) => {
  function to(item) {
    return new types.CallHierarchyOutgoingCall(
      CallHierarchyItem.to(item.to),
      item.fromRanges.map((r) => Range.to(r))
    );
  }
  CallHierarchyOutgoingCall2.to = to;
})(CallHierarchyOutgoingCall || (CallHierarchyOutgoingCall = {}));
var location;
((location2) => {
  function from(value) {
    return {
      range: value.range && Range.from(value.range),
      uri: value.uri
    };
  }
  location2.from = from;
  function to(value) {
    return new types.Location(URI.revive(value.uri), Range.to(value.range));
  }
  location2.to = to;
})(location || (location = {}));
var DefinitionLink;
((DefinitionLink2) => {
  function from(value) {
    const definitionLink = value;
    const location2 = value;
    return {
      originSelectionRange: definitionLink.originSelectionRange ? Range.from(definitionLink.originSelectionRange) : void 0,
      uri: definitionLink.targetUri ? definitionLink.targetUri : location2.uri,
      range: Range.from(definitionLink.targetRange ? definitionLink.targetRange : location2.range),
      targetSelectionRange: definitionLink.targetSelectionRange ? Range.from(definitionLink.targetSelectionRange) : void 0
    };
  }
  DefinitionLink2.from = from;
  function to(value) {
    return {
      targetUri: URI.revive(value.uri),
      targetRange: Range.to(value.range),
      targetSelectionRange: value.targetSelectionRange ? Range.to(value.targetSelectionRange) : void 0,
      originSelectionRange: value.originSelectionRange ? Range.to(value.originSelectionRange) : void 0
    };
  }
  DefinitionLink2.to = to;
})(DefinitionLink || (DefinitionLink = {}));
var Hover;
((Hover2) => {
  function from(hover) {
    const convertedHover = {
      range: Range.from(hover.range),
      contents: MarkdownString.fromMany(hover.contents),
      canIncreaseVerbosity: hover.canIncreaseVerbosity,
      canDecreaseVerbosity: hover.canDecreaseVerbosity
    };
    return convertedHover;
  }
  Hover2.from = from;
  function to(info) {
    const contents = info.contents.map(MarkdownString.to);
    const range = Range.to(info.range);
    const canIncreaseVerbosity = info.canIncreaseVerbosity;
    const canDecreaseVerbosity = info.canDecreaseVerbosity;
    return new types.VerboseHover(contents, range, canIncreaseVerbosity, canDecreaseVerbosity);
  }
  Hover2.to = to;
})(Hover || (Hover = {}));
var EvaluatableExpression;
((EvaluatableExpression2) => {
  function from(expression) {
    return {
      range: Range.from(expression.range),
      expression: expression.expression
    };
  }
  EvaluatableExpression2.from = from;
  function to(info) {
    return new types.EvaluatableExpression(Range.to(info.range), info.expression);
  }
  EvaluatableExpression2.to = to;
})(EvaluatableExpression || (EvaluatableExpression = {}));
var InlineValue;
((InlineValue2) => {
  function from(inlineValue) {
    if (inlineValue instanceof types.InlineValueText) {
      return {
        type: "text",
        range: Range.from(inlineValue.range),
        text: inlineValue.text
      };
    } else if (inlineValue instanceof types.InlineValueVariableLookup) {
      return {
        type: "variable",
        range: Range.from(inlineValue.range),
        variableName: inlineValue.variableName,
        caseSensitiveLookup: inlineValue.caseSensitiveLookup
      };
    } else if (inlineValue instanceof types.InlineValueEvaluatableExpression) {
      return {
        type: "expression",
        range: Range.from(inlineValue.range),
        expression: inlineValue.expression
      };
    } else {
      throw new Error(`Unknown 'InlineValue' type`);
    }
  }
  InlineValue2.from = from;
  function to(inlineValue) {
    switch (inlineValue.type) {
      case "text":
        return {
          range: Range.to(inlineValue.range),
          text: inlineValue.text
        };
      case "variable":
        return {
          range: Range.to(inlineValue.range),
          variableName: inlineValue.variableName,
          caseSensitiveLookup: inlineValue.caseSensitiveLookup
        };
      case "expression":
        return {
          range: Range.to(inlineValue.range),
          expression: inlineValue.expression
        };
    }
  }
  InlineValue2.to = to;
})(InlineValue || (InlineValue = {}));
var InlineValueContext;
((InlineValueContext2) => {
  function from(inlineValueContext) {
    return {
      frameId: inlineValueContext.frameId,
      stoppedLocation: Range.from(inlineValueContext.stoppedLocation)
    };
  }
  InlineValueContext2.from = from;
  function to(inlineValueContext) {
    return new types.InlineValueContext(inlineValueContext.frameId, Range.to(inlineValueContext.stoppedLocation));
  }
  InlineValueContext2.to = to;
})(InlineValueContext || (InlineValueContext = {}));
var DocumentHighlight;
((DocumentHighlight2) => {
  function from(documentHighlight) {
    return {
      range: Range.from(documentHighlight.range),
      kind: documentHighlight.kind
    };
  }
  DocumentHighlight2.from = from;
  function to(occurrence) {
    return new types.DocumentHighlight(Range.to(occurrence.range), occurrence.kind);
  }
  DocumentHighlight2.to = to;
})(DocumentHighlight || (DocumentHighlight = {}));
var MultiDocumentHighlight;
((MultiDocumentHighlight2) => {
  function from(multiDocumentHighlight) {
    return {
      uri: multiDocumentHighlight.uri,
      highlights: multiDocumentHighlight.highlights.map(DocumentHighlight.from)
    };
  }
  MultiDocumentHighlight2.from = from;
  function to(multiDocumentHighlight) {
    return new types.MultiDocumentHighlight(URI.revive(multiDocumentHighlight.uri), multiDocumentHighlight.highlights.map(DocumentHighlight.to));
  }
  MultiDocumentHighlight2.to = to;
})(MultiDocumentHighlight || (MultiDocumentHighlight = {}));
var CompletionTriggerKind;
((CompletionTriggerKind2) => {
  function to(kind) {
    switch (kind) {
      case languages.CompletionTriggerKind.TriggerCharacter:
        return types.CompletionTriggerKind.TriggerCharacter;
      case languages.CompletionTriggerKind.TriggerForIncompleteCompletions:
        return types.CompletionTriggerKind.TriggerForIncompleteCompletions;
      case languages.CompletionTriggerKind.Invoke:
      default:
        return types.CompletionTriggerKind.Invoke;
    }
  }
  CompletionTriggerKind2.to = to;
})(CompletionTriggerKind || (CompletionTriggerKind = {}));
var CompletionContext;
((CompletionContext2) => {
  function to(context) {
    return {
      triggerKind: CompletionTriggerKind.to(context.triggerKind),
      triggerCharacter: context.triggerCharacter
    };
  }
  CompletionContext2.to = to;
})(CompletionContext || (CompletionContext = {}));
var CompletionItemTag;
((CompletionItemTag2) => {
  function from(kind) {
    switch (kind) {
      case types.CompletionItemTag.Deprecated:
        return languages.CompletionItemTag.Deprecated;
    }
  }
  CompletionItemTag2.from = from;
  function to(kind) {
    switch (kind) {
      case languages.CompletionItemTag.Deprecated:
        return types.CompletionItemTag.Deprecated;
    }
  }
  CompletionItemTag2.to = to;
})(CompletionItemTag || (CompletionItemTag = {}));
var CompletionCommand;
((CompletionCommand2) => {
  function from(c, converter, disposables) {
    if ("icon" in c && "command" in c) {
      return {
        command: converter.toInternal(c.command, disposables),
        icon: IconPath.fromThemeIcon(c.icon)
      };
    }
    return { command: converter.toInternal(c, disposables) };
  }
  CompletionCommand2.from = from;
})(CompletionCommand || (CompletionCommand = {}));
var CompletionItemKind;
((CompletionItemKind2) => {
  const _from = /* @__PURE__ */ new Map([
    [types.CompletionItemKind.Method, languages.CompletionItemKind.Method],
    [types.CompletionItemKind.Function, languages.CompletionItemKind.Function],
    [types.CompletionItemKind.Constructor, languages.CompletionItemKind.Constructor],
    [types.CompletionItemKind.Field, languages.CompletionItemKind.Field],
    [types.CompletionItemKind.Variable, languages.CompletionItemKind.Variable],
    [types.CompletionItemKind.Class, languages.CompletionItemKind.Class],
    [types.CompletionItemKind.Interface, languages.CompletionItemKind.Interface],
    [types.CompletionItemKind.Struct, languages.CompletionItemKind.Struct],
    [types.CompletionItemKind.Module, languages.CompletionItemKind.Module],
    [types.CompletionItemKind.Property, languages.CompletionItemKind.Property],
    [types.CompletionItemKind.Unit, languages.CompletionItemKind.Unit],
    [types.CompletionItemKind.Value, languages.CompletionItemKind.Value],
    [types.CompletionItemKind.Constant, languages.CompletionItemKind.Constant],
    [types.CompletionItemKind.Enum, languages.CompletionItemKind.Enum],
    [types.CompletionItemKind.EnumMember, languages.CompletionItemKind.EnumMember],
    [types.CompletionItemKind.Keyword, languages.CompletionItemKind.Keyword],
    [types.CompletionItemKind.Snippet, languages.CompletionItemKind.Snippet],
    [types.CompletionItemKind.Text, languages.CompletionItemKind.Text],
    [types.CompletionItemKind.Color, languages.CompletionItemKind.Color],
    [types.CompletionItemKind.File, languages.CompletionItemKind.File],
    [types.CompletionItemKind.Reference, languages.CompletionItemKind.Reference],
    [types.CompletionItemKind.Folder, languages.CompletionItemKind.Folder],
    [types.CompletionItemKind.Event, languages.CompletionItemKind.Event],
    [types.CompletionItemKind.Operator, languages.CompletionItemKind.Operator],
    [types.CompletionItemKind.TypeParameter, languages.CompletionItemKind.TypeParameter],
    [types.CompletionItemKind.Issue, languages.CompletionItemKind.Issue],
    [types.CompletionItemKind.User, languages.CompletionItemKind.User]
  ]);
  function from(kind) {
    return _from.get(kind) ?? languages.CompletionItemKind.Property;
  }
  CompletionItemKind2.from = from;
  const _to = /* @__PURE__ */ new Map([
    [languages.CompletionItemKind.Method, types.CompletionItemKind.Method],
    [languages.CompletionItemKind.Function, types.CompletionItemKind.Function],
    [languages.CompletionItemKind.Constructor, types.CompletionItemKind.Constructor],
    [languages.CompletionItemKind.Field, types.CompletionItemKind.Field],
    [languages.CompletionItemKind.Variable, types.CompletionItemKind.Variable],
    [languages.CompletionItemKind.Class, types.CompletionItemKind.Class],
    [languages.CompletionItemKind.Interface, types.CompletionItemKind.Interface],
    [languages.CompletionItemKind.Struct, types.CompletionItemKind.Struct],
    [languages.CompletionItemKind.Module, types.CompletionItemKind.Module],
    [languages.CompletionItemKind.Property, types.CompletionItemKind.Property],
    [languages.CompletionItemKind.Unit, types.CompletionItemKind.Unit],
    [languages.CompletionItemKind.Value, types.CompletionItemKind.Value],
    [languages.CompletionItemKind.Constant, types.CompletionItemKind.Constant],
    [languages.CompletionItemKind.Enum, types.CompletionItemKind.Enum],
    [languages.CompletionItemKind.EnumMember, types.CompletionItemKind.EnumMember],
    [languages.CompletionItemKind.Keyword, types.CompletionItemKind.Keyword],
    [languages.CompletionItemKind.Snippet, types.CompletionItemKind.Snippet],
    [languages.CompletionItemKind.Text, types.CompletionItemKind.Text],
    [languages.CompletionItemKind.Color, types.CompletionItemKind.Color],
    [languages.CompletionItemKind.File, types.CompletionItemKind.File],
    [languages.CompletionItemKind.Reference, types.CompletionItemKind.Reference],
    [languages.CompletionItemKind.Folder, types.CompletionItemKind.Folder],
    [languages.CompletionItemKind.Event, types.CompletionItemKind.Event],
    [languages.CompletionItemKind.Operator, types.CompletionItemKind.Operator],
    [languages.CompletionItemKind.TypeParameter, types.CompletionItemKind.TypeParameter],
    [languages.CompletionItemKind.User, types.CompletionItemKind.User],
    [languages.CompletionItemKind.Issue, types.CompletionItemKind.Issue]
  ]);
  function to(kind) {
    return _to.get(kind) ?? types.CompletionItemKind.Property;
  }
  CompletionItemKind2.to = to;
})(CompletionItemKind || (CompletionItemKind = {}));
var CompletionItem;
((CompletionItem2) => {
  function to(suggestion, converter) {
    const result = new types.CompletionItem(suggestion.label);
    result.insertText = suggestion.insertText;
    result.kind = CompletionItemKind.to(suggestion.kind);
    result.tags = suggestion.tags?.map(CompletionItemTag.to);
    result.detail = suggestion.detail;
    result.documentation = htmlContent.isMarkdownString(suggestion.documentation) ? MarkdownString.to(suggestion.documentation) : suggestion.documentation;
    result.sortText = suggestion.sortText;
    result.filterText = suggestion.filterText;
    result.preselect = suggestion.preselect;
    result.commitCharacters = suggestion.commitCharacters;
    if (editorRange.Range.isIRange(suggestion.range)) {
      result.range = Range.to(suggestion.range);
    } else if (typeof suggestion.range === "object") {
      result.range = { inserting: Range.to(suggestion.range.insert), replacing: Range.to(suggestion.range.replace) };
    }
    result.keepWhitespace = typeof suggestion.insertTextRules === "undefined" ? false : Boolean(suggestion.insertTextRules & languages.CompletionItemInsertTextRule.KeepWhitespace);
    if (typeof suggestion.insertTextRules !== "undefined" && suggestion.insertTextRules & languages.CompletionItemInsertTextRule.InsertAsSnippet) {
      result.insertText = new types.SnippetString(suggestion.insertText);
    } else {
      result.insertText = suggestion.insertText;
      result.textEdit = result.range instanceof types.Range ? new types.TextEdit(result.range, result.insertText) : void 0;
    }
    if (suggestion.additionalTextEdits && suggestion.additionalTextEdits.length > 0) {
      result.additionalTextEdits = suggestion.additionalTextEdits.map((e) => TextEdit.to(e));
    }
    result.command = converter && suggestion.command ? converter.fromInternal(suggestion.command) : void 0;
    return result;
  }
  CompletionItem2.to = to;
})(CompletionItem || (CompletionItem = {}));
var ParameterInformation;
((ParameterInformation2) => {
  function from(info) {
    if (typeof info.label !== "string" && !Array.isArray(info.label)) {
      throw new TypeError("Invalid label");
    }
    return {
      label: info.label,
      documentation: MarkdownString.fromStrict(info.documentation)
    };
  }
  ParameterInformation2.from = from;
  function to(info) {
    return {
      label: info.label,
      documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation
    };
  }
  ParameterInformation2.to = to;
})(ParameterInformation || (ParameterInformation = {}));
var SignatureInformation;
((SignatureInformation2) => {
  function from(info) {
    return {
      label: info.label,
      documentation: MarkdownString.fromStrict(info.documentation),
      parameters: Array.isArray(info.parameters) ? info.parameters.map(ParameterInformation.from) : [],
      activeParameter: info.activeParameter
    };
  }
  SignatureInformation2.from = from;
  function to(info) {
    return {
      label: info.label,
      documentation: htmlContent.isMarkdownString(info.documentation) ? MarkdownString.to(info.documentation) : info.documentation,
      parameters: Array.isArray(info.parameters) ? info.parameters.map(ParameterInformation.to) : [],
      activeParameter: info.activeParameter
    };
  }
  SignatureInformation2.to = to;
})(SignatureInformation || (SignatureInformation = {}));
var SignatureHelp;
((SignatureHelp2) => {
  function from(help) {
    return {
      activeSignature: help.activeSignature,
      activeParameter: help.activeParameter,
      signatures: Array.isArray(help.signatures) ? help.signatures.map(SignatureInformation.from) : []
    };
  }
  SignatureHelp2.from = from;
  function to(help) {
    return {
      activeSignature: help.activeSignature,
      activeParameter: help.activeParameter,
      signatures: Array.isArray(help.signatures) ? help.signatures.map(SignatureInformation.to) : []
    };
  }
  SignatureHelp2.to = to;
})(SignatureHelp || (SignatureHelp = {}));
var InlayHint;
((InlayHint2) => {
  function to(converter, hint) {
    const res = new types.InlayHint(
      Position.to(hint.position),
      typeof hint.label === "string" ? hint.label : hint.label.map(InlayHintLabelPart.to.bind(void 0, converter)),
      hint.kind && InlayHintKind.to(hint.kind)
    );
    res.textEdits = hint.textEdits && hint.textEdits.map(TextEdit.to);
    res.tooltip = htmlContent.isMarkdownString(hint.tooltip) ? MarkdownString.to(hint.tooltip) : hint.tooltip;
    res.paddingLeft = hint.paddingLeft;
    res.paddingRight = hint.paddingRight;
    return res;
  }
  InlayHint2.to = to;
})(InlayHint || (InlayHint = {}));
var InlayHintLabelPart;
((InlayHintLabelPart2) => {
  function to(converter, part) {
    const result = new types.InlayHintLabelPart(part.label);
    result.tooltip = htmlContent.isMarkdownString(part.tooltip) ? MarkdownString.to(part.tooltip) : part.tooltip;
    if (languages.Command.is(part.command)) {
      result.command = converter.fromInternal(part.command);
    }
    if (part.location) {
      result.location = location.to(part.location);
    }
    return result;
  }
  InlayHintLabelPart2.to = to;
})(InlayHintLabelPart || (InlayHintLabelPart = {}));
var InlayHintKind;
((InlayHintKind2) => {
  function from(kind) {
    return kind;
  }
  InlayHintKind2.from = from;
  function to(kind) {
    return kind;
  }
  InlayHintKind2.to = to;
})(InlayHintKind || (InlayHintKind = {}));
var DocumentLink;
((DocumentLink2) => {
  function from(link) {
    return {
      range: Range.from(link.range),
      url: link.target,
      tooltip: link.tooltip
    };
  }
  DocumentLink2.from = from;
  function to(link) {
    let target = void 0;
    if (link.url) {
      try {
        target = typeof link.url === "string" ? URI.parse(link.url, true) : URI.revive(link.url);
      } catch (err) {
      }
    }
    const result = new types.DocumentLink(Range.to(link.range), target);
    result.tooltip = link.tooltip;
    return result;
  }
  DocumentLink2.to = to;
})(DocumentLink || (DocumentLink = {}));
var ColorPresentation;
((ColorPresentation2) => {
  function to(colorPresentation) {
    const cp = new types.ColorPresentation(colorPresentation.label);
    if (colorPresentation.textEdit) {
      cp.textEdit = TextEdit.to(colorPresentation.textEdit);
    }
    if (colorPresentation.additionalTextEdits) {
      cp.additionalTextEdits = colorPresentation.additionalTextEdits.map((value) => TextEdit.to(value));
    }
    return cp;
  }
  ColorPresentation2.to = to;
  function from(colorPresentation) {
    return {
      label: colorPresentation.label,
      textEdit: colorPresentation.textEdit ? TextEdit.from(colorPresentation.textEdit) : void 0,
      additionalTextEdits: colorPresentation.additionalTextEdits ? colorPresentation.additionalTextEdits.map((value) => TextEdit.from(value)) : void 0
    };
  }
  ColorPresentation2.from = from;
})(ColorPresentation || (ColorPresentation = {}));
var Color;
((Color2) => {
  function to(c) {
    return new types.Color(c[0], c[1], c[2], c[3]);
  }
  Color2.to = to;
  function from(color) {
    return [color.red, color.green, color.blue, color.alpha];
  }
  Color2.from = from;
})(Color || (Color = {}));
var SelectionRange;
((SelectionRange2) => {
  function from(obj) {
    return { range: Range.from(obj.range) };
  }
  SelectionRange2.from = from;
  function to(obj) {
    return new types.SelectionRange(Range.to(obj.range));
  }
  SelectionRange2.to = to;
})(SelectionRange || (SelectionRange = {}));
var TextDocumentSaveReason;
((TextDocumentSaveReason2) => {
  function to(reason) {
    switch (reason) {
      case SaveReason.AUTO:
        return types.TextDocumentSaveReason.AfterDelay;
      case SaveReason.EXPLICIT:
        return types.TextDocumentSaveReason.Manual;
      case SaveReason.FOCUS_CHANGE:
      case SaveReason.WINDOW_CHANGE:
        return types.TextDocumentSaveReason.FocusOut;
    }
  }
  TextDocumentSaveReason2.to = to;
})(TextDocumentSaveReason || (TextDocumentSaveReason = {}));
var TextEditorLineNumbersStyle;
((TextEditorLineNumbersStyle2) => {
  function from(style) {
    switch (style) {
      case types.TextEditorLineNumbersStyle.Off:
        return RenderLineNumbersType.Off;
      case types.TextEditorLineNumbersStyle.Relative:
        return RenderLineNumbersType.Relative;
      case types.TextEditorLineNumbersStyle.Interval:
        return RenderLineNumbersType.Interval;
      case types.TextEditorLineNumbersStyle.On:
      default:
        return RenderLineNumbersType.On;
    }
  }
  TextEditorLineNumbersStyle2.from = from;
  function to(style) {
    switch (style) {
      case RenderLineNumbersType.Off:
        return types.TextEditorLineNumbersStyle.Off;
      case RenderLineNumbersType.Relative:
        return types.TextEditorLineNumbersStyle.Relative;
      case RenderLineNumbersType.Interval:
        return types.TextEditorLineNumbersStyle.Interval;
      case RenderLineNumbersType.On:
      default:
        return types.TextEditorLineNumbersStyle.On;
    }
  }
  TextEditorLineNumbersStyle2.to = to;
})(TextEditorLineNumbersStyle || (TextEditorLineNumbersStyle = {}));
var EndOfLine;
((EndOfLine2) => {
  function from(eol) {
    if (eol === types.EndOfLine.CRLF) {
      return EndOfLineSequence.CRLF;
    } else if (eol === types.EndOfLine.LF) {
      return EndOfLineSequence.LF;
    }
    return void 0;
  }
  EndOfLine2.from = from;
  function to(eol) {
    if (eol === EndOfLineSequence.CRLF) {
      return types.EndOfLine.CRLF;
    } else if (eol === EndOfLineSequence.LF) {
      return types.EndOfLine.LF;
    }
    return void 0;
  }
  EndOfLine2.to = to;
})(EndOfLine || (EndOfLine = {}));
var ProgressLocation;
((ProgressLocation2) => {
  function from(loc) {
    if (typeof loc === "object") {
      return loc.viewId;
    }
    switch (loc) {
      case types.ProgressLocation.SourceControl:
        return MainProgressLocation.Scm;
      case types.ProgressLocation.Window:
        return MainProgressLocation.Window;
      case types.ProgressLocation.Notification:
        return MainProgressLocation.Notification;
    }
    throw new Error(`Unknown 'ProgressLocation'`);
  }
  ProgressLocation2.from = from;
})(ProgressLocation || (ProgressLocation = {}));
var FoldingRange;
((FoldingRange2) => {
  function from(r) {
    const range = { start: r.start + 1, end: r.end + 1 };
    if (r.kind) {
      range.kind = FoldingRangeKind.from(r.kind);
    }
    return range;
  }
  FoldingRange2.from = from;
  function to(r) {
    const range = { start: r.start - 1, end: r.end - 1 };
    if (r.kind) {
      range.kind = FoldingRangeKind.to(r.kind);
    }
    return range;
  }
  FoldingRange2.to = to;
})(FoldingRange || (FoldingRange = {}));
var FoldingRangeKind;
((FoldingRangeKind2) => {
  function from(kind) {
    if (kind) {
      switch (kind) {
        case types.FoldingRangeKind.Comment:
          return languages.FoldingRangeKind.Comment;
        case types.FoldingRangeKind.Imports:
          return languages.FoldingRangeKind.Imports;
        case types.FoldingRangeKind.Region:
          return languages.FoldingRangeKind.Region;
      }
    }
    return void 0;
  }
  FoldingRangeKind2.from = from;
  function to(kind) {
    if (kind) {
      switch (kind.value) {
        case languages.FoldingRangeKind.Comment.value:
          return types.FoldingRangeKind.Comment;
        case languages.FoldingRangeKind.Imports.value:
          return types.FoldingRangeKind.Imports;
        case languages.FoldingRangeKind.Region.value:
          return types.FoldingRangeKind.Region;
      }
    }
    return void 0;
  }
  FoldingRangeKind2.to = to;
})(FoldingRangeKind || (FoldingRangeKind = {}));
var TextEditorOpenOptions;
((TextEditorOpenOptions2) => {
  function from(options) {
    if (options) {
      return {
        pinned: typeof options.preview === "boolean" ? !options.preview : void 0,
        inactive: options.background,
        preserveFocus: options.preserveFocus,
        selection: typeof options.selection === "object" ? Range.from(options.selection) : void 0,
        override: typeof options.override === "boolean" ? DEFAULT_EDITOR_ASSOCIATION.id : void 0
      };
    }
    return void 0;
  }
  TextEditorOpenOptions2.from = from;
})(TextEditorOpenOptions || (TextEditorOpenOptions = {}));
var GlobPattern;
((GlobPattern2) => {
  function from(pattern) {
    if (pattern instanceof types.RelativePattern) {
      return pattern.toJSON();
    }
    if (typeof pattern === "string") {
      return pattern;
    }
    if (isRelativePatternShape(pattern) || isLegacyRelativePatternShape(pattern)) {
      return new types.RelativePattern(pattern.baseUri ?? pattern.base, pattern.pattern).toJSON();
    }
    return pattern;
  }
  GlobPattern2.from = from;
  function isRelativePatternShape(obj) {
    const rp = obj;
    if (!rp) {
      return false;
    }
    return URI.isUri(rp.baseUri) && typeof rp.pattern === "string";
  }
  function isLegacyRelativePatternShape(obj) {
    const rp = obj;
    if (!rp) {
      return false;
    }
    return typeof rp.base === "string" && typeof rp.pattern === "string";
  }
  function to(pattern) {
    if (typeof pattern === "string") {
      return pattern;
    }
    return new types.RelativePattern(URI.revive(pattern.baseUri), pattern.pattern);
  }
  GlobPattern2.to = to;
})(GlobPattern || (GlobPattern = {}));
var LanguageSelector;
((LanguageSelector2) => {
  function from(selector) {
    if (!selector) {
      return void 0;
    } else if (Array.isArray(selector)) {
      return selector.map(from);
    } else if (typeof selector === "string") {
      return selector;
    } else {
      const filter = selector;
      return {
        language: filter.language,
        scheme: filter.scheme,
        pattern: GlobPattern.from(filter.pattern) ?? void 0,
        exclusive: filter.exclusive,
        notebookType: filter.notebookType
      };
    }
  }
  LanguageSelector2.from = from;
})(LanguageSelector || (LanguageSelector = {}));
var NotebookRange;
((NotebookRange2) => {
  function from(range) {
    return { start: range.start, end: range.end };
  }
  NotebookRange2.from = from;
  function to(range) {
    return new types.NotebookRange(range.start, range.end);
  }
  NotebookRange2.to = to;
})(NotebookRange || (NotebookRange = {}));
var NotebookCellExecutionSummary;
((NotebookCellExecutionSummary2) => {
  function to(data) {
    return {
      timing: typeof data.runStartTime === "number" && typeof data.runEndTime === "number" ? { startTime: data.runStartTime, endTime: data.runEndTime } : void 0,
      executionOrder: data.executionOrder,
      success: data.lastRunSuccess
    };
  }
  NotebookCellExecutionSummary2.to = to;
  function from(data) {
    return {
      lastRunSuccess: data.success,
      runStartTime: data.timing?.startTime,
      runEndTime: data.timing?.endTime,
      executionOrder: data.executionOrder
    };
  }
  NotebookCellExecutionSummary2.from = from;
})(NotebookCellExecutionSummary || (NotebookCellExecutionSummary = {}));
var NotebookCellKind;
((NotebookCellKind2) => {
  function from(data) {
    switch (data) {
      case types.NotebookCellKind.Markup:
        return notebooks.CellKind.Markup;
      case types.NotebookCellKind.Code:
      default:
        return notebooks.CellKind.Code;
    }
  }
  NotebookCellKind2.from = from;
  function to(data) {
    switch (data) {
      case notebooks.CellKind.Markup:
        return types.NotebookCellKind.Markup;
      case notebooks.CellKind.Code:
      default:
        return types.NotebookCellKind.Code;
    }
  }
  NotebookCellKind2.to = to;
})(NotebookCellKind || (NotebookCellKind = {}));
var NotebookData;
((NotebookData2) => {
  function from(data) {
    const res = {
      metadata: data.metadata ?? /* @__PURE__ */ Object.create(null),
      cells: []
    };
    for (const cell of data.cells) {
      types.NotebookCellData.validate(cell);
      res.cells.push(NotebookCellData.from(cell));
    }
    return res;
  }
  NotebookData2.from = from;
  function to(data) {
    const res = new types.NotebookData(
      data.cells.map(NotebookCellData.to)
    );
    if (!isEmptyObject(data.metadata)) {
      res.metadata = data.metadata;
    }
    return res;
  }
  NotebookData2.to = to;
})(NotebookData || (NotebookData = {}));
var NotebookCellData;
((NotebookCellData2) => {
  function from(data) {
    return {
      cellKind: NotebookCellKind.from(data.kind),
      language: data.languageId,
      mime: data.mime,
      source: data.value,
      metadata: data.metadata,
      internalMetadata: NotebookCellExecutionSummary.from(data.executionSummary ?? {}),
      outputs: data.outputs ? data.outputs.map(NotebookCellOutput.from) : []
    };
  }
  NotebookCellData2.from = from;
  function to(data) {
    return new types.NotebookCellData(
      NotebookCellKind.to(data.cellKind),
      data.source,
      data.language,
      data.mime,
      data.outputs ? data.outputs.map(NotebookCellOutput.to) : void 0,
      data.metadata,
      data.internalMetadata ? NotebookCellExecutionSummary.to(data.internalMetadata) : void 0
    );
  }
  NotebookCellData2.to = to;
})(NotebookCellData || (NotebookCellData = {}));
var NotebookCellOutputItem;
((NotebookCellOutputItem2) => {
  function from(item) {
    return {
      mime: item.mime,
      valueBytes: VSBuffer.wrap(item.data)
    };
  }
  NotebookCellOutputItem2.from = from;
  function to(item) {
    return new types.NotebookCellOutputItem(item.valueBytes.buffer, item.mime);
  }
  NotebookCellOutputItem2.to = to;
})(NotebookCellOutputItem || (NotebookCellOutputItem = {}));
var NotebookCellOutput;
((NotebookCellOutput2) => {
  function from(output) {
    return {
      outputId: output.id,
      items: output.items.map(NotebookCellOutputItem.from),
      metadata: output.metadata
    };
  }
  NotebookCellOutput2.from = from;
  function to(output) {
    const items = output.items.map(NotebookCellOutputItem.to);
    return new types.NotebookCellOutput(items, output.outputId, output.metadata);
  }
  NotebookCellOutput2.to = to;
})(NotebookCellOutput || (NotebookCellOutput = {}));
var NotebookExclusiveDocumentPattern;
((NotebookExclusiveDocumentPattern2) => {
  function from(pattern) {
    if (isExclusivePattern(pattern)) {
      return {
        include: GlobPattern.from(pattern.include) ?? void 0,
        exclude: GlobPattern.from(pattern.exclude) ?? void 0
      };
    }
    return GlobPattern.from(pattern) ?? void 0;
  }
  NotebookExclusiveDocumentPattern2.from = from;
  function to(pattern) {
    if (isExclusivePattern(pattern)) {
      return {
        include: GlobPattern.to(pattern.include),
        exclude: GlobPattern.to(pattern.exclude)
      };
    }
    return GlobPattern.to(pattern);
  }
  NotebookExclusiveDocumentPattern2.to = to;
  function isExclusivePattern(obj) {
    const ep = obj;
    if (!ep) {
      return false;
    }
    return !isUndefinedOrNull(ep.include) && !isUndefinedOrNull(ep.exclude);
  }
})(NotebookExclusiveDocumentPattern || (NotebookExclusiveDocumentPattern = {}));
var NotebookStatusBarItem;
((NotebookStatusBarItem2) => {
  function from(item, commandsConverter, disposables) {
    const command = typeof item.command === "string" ? { title: "", command: item.command } : item.command;
    return {
      alignment: item.alignment === types.NotebookCellStatusBarAlignment.Left ? notebooks.CellStatusbarAlignment.Left : notebooks.CellStatusbarAlignment.Right,
      command: commandsConverter.toInternal(command, disposables),
      // TODO@roblou
      text: item.text,
      tooltip: item.tooltip,
      accessibilityInformation: item.accessibilityInformation,
      priority: item.priority
    };
  }
  NotebookStatusBarItem2.from = from;
})(NotebookStatusBarItem || (NotebookStatusBarItem = {}));
var NotebookKernelSourceAction;
((NotebookKernelSourceAction2) => {
  function from(item, commandsConverter, disposables) {
    const command = typeof item.command === "string" ? { title: "", command: item.command } : item.command;
    return {
      command: commandsConverter.toInternal(command, disposables),
      label: item.label,
      description: item.description,
      detail: item.detail,
      documentation: item.documentation
    };
  }
  NotebookKernelSourceAction2.from = from;
})(NotebookKernelSourceAction || (NotebookKernelSourceAction = {}));
var NotebookDocumentContentOptions;
((NotebookDocumentContentOptions2) => {
  function from(options) {
    return {
      transientOutputs: options?.transientOutputs ?? false,
      transientCellMetadata: options?.transientCellMetadata ?? {},
      transientDocumentMetadata: options?.transientDocumentMetadata ?? {},
      cellContentMetadata: options?.cellContentMetadata ?? {}
    };
  }
  NotebookDocumentContentOptions2.from = from;
})(NotebookDocumentContentOptions || (NotebookDocumentContentOptions = {}));
var NotebookRendererScript;
((NotebookRendererScript2) => {
  function from(preload) {
    return {
      uri: preload.uri,
      provides: preload.provides
    };
  }
  NotebookRendererScript2.from = from;
  function to(preload) {
    return new types.NotebookRendererScript(URI.revive(preload.uri), preload.provides);
  }
  NotebookRendererScript2.to = to;
})(NotebookRendererScript || (NotebookRendererScript = {}));
var TestMessage;
((TestMessage2) => {
  function from(message) {
    return {
      message: MarkdownString.fromStrict(message.message) || "",
      type: TestMessageType.Error,
      expected: message.expectedOutput,
      actual: message.actualOutput,
      contextValue: message.contextValue,
      location: message.location && { range: Range.from(message.location.range), uri: message.location.uri },
      stackTrace: message.stackTrace?.map((s) => ({
        label: s.label,
        position: s.position && Position.from(s.position),
        uri: s.uri && URI.revive(s.uri).toJSON()
      }))
    };
  }
  TestMessage2.from = from;
  function to(item) {
    const message = new types.TestMessage(typeof item.message === "string" ? item.message : MarkdownString.to(item.message));
    message.actualOutput = item.actual;
    message.expectedOutput = item.expected;
    message.contextValue = item.contextValue;
    message.location = item.location ? location.to(item.location) : void 0;
    return message;
  }
  TestMessage2.to = to;
})(TestMessage || (TestMessage = {}));
var TestTag;
((TestTag2) => {
  TestTag2.namespace = namespaceTestTag;
  TestTag2.denamespace = denamespaceTestTag;
})(TestTag || (TestTag = {}));
var TestRunProfile;
((TestRunProfile2) => {
  function from(item) {
    return {
      controllerId: item.controllerId,
      profileId: item.profileId,
      group: TestRunProfileKind.from(item.kind)
    };
  }
  TestRunProfile2.from = from;
})(TestRunProfile || (TestRunProfile = {}));
var TestRunProfileKind;
((TestRunProfileKind2) => {
  const profileGroupToBitset = {
    [types.TestRunProfileKind.Coverage]: TestRunProfileBitset.Coverage,
    [types.TestRunProfileKind.Debug]: TestRunProfileBitset.Debug,
    [types.TestRunProfileKind.Run]: TestRunProfileBitset.Run
  };
  function from(kind) {
    return profileGroupToBitset.hasOwnProperty(kind) ? profileGroupToBitset[kind] : TestRunProfileBitset.Run;
  }
  TestRunProfileKind2.from = from;
})(TestRunProfileKind || (TestRunProfileKind = {}));
var TestItem;
((TestItem2) => {
  function from(item) {
    const ctrlId = getPrivateApiFor(item).controllerId;
    return {
      extId: TestId.fromExtHostTestItem(item, ctrlId).toString(),
      label: item.label,
      uri: URI.revive(item.uri),
      busy: item.busy,
      tags: item.tags.map((t) => TestTag.namespace(ctrlId, t.id)),
      range: editorRange.Range.lift(Range.from(item.range)),
      description: item.description || null,
      sortText: item.sortText || null,
      error: item.error ? MarkdownString.fromStrict(item.error) || null : null
    };
  }
  TestItem2.from = from;
  function toPlain(item) {
    return {
      parent: void 0,
      error: void 0,
      id: TestId.fromString(item.extId).localId,
      label: item.label,
      uri: URI.revive(item.uri),
      tags: (item.tags || []).map((t) => {
        const { tagId } = TestTag.denamespace(t);
        return new types.TestTag(tagId);
      }),
      children: {
        add: () => {
        },
        delete: () => {
        },
        forEach: () => {
        },
        *[Symbol.iterator]() {
        },
        get: () => void 0,
        replace: () => {
        },
        size: 0
      },
      range: Range.to(item.range || void 0),
      canResolveChildren: false,
      busy: item.busy,
      description: item.description || void 0,
      sortText: item.sortText || void 0
    };
  }
  TestItem2.toPlain = toPlain;
})(TestItem || (TestItem = {}));
((TestTag2) => {
  function from(tag) {
    return { id: tag.id };
  }
  TestTag2.from = from;
  function to(tag) {
    return new types.TestTag(tag.id);
  }
  TestTag2.to = to;
})(TestTag || (TestTag = {}));
var TestResults;
((TestResults2) => {
  const convertTestResultItem = (node, parent) => {
    const item = node.value;
    if (!item) {
      return void 0;
    }
    const snapshot = {
      ...TestItem.toPlain(item.item),
      parent,
      taskStates: item.tasks.map((t) => ({
        state: t.state,
        duration: t.duration,
        messages: t.messages.filter((m) => m.type === TestMessageType.Error).map(TestMessage.to)
      })),
      children: []
    };
    if (node.children) {
      for (const child of node.children.values()) {
        const c = convertTestResultItem(child, snapshot);
        if (c) {
          snapshot.children.push(c);
        }
      }
    }
    return snapshot;
  };
  function to(serialized) {
    const tree = new WellDefinedPrefixTree();
    for (const item of serialized.items) {
      tree.insert(TestId.fromString(item.item.extId).path, item);
    }
    const queue = [tree.nodes];
    const roots = [];
    while (queue.length) {
      for (const node of queue.pop()) {
        if (node.value) {
          roots.push(node);
        } else if (node.children) {
          queue.push(node.children.values());
        }
      }
    }
    return {
      completedAt: serialized.completedAt,
      results: roots.map((r) => convertTestResultItem(r)).filter(isDefined)
    };
  }
  TestResults2.to = to;
})(TestResults || (TestResults = {}));
var TestCoverage;
((TestCoverage2) => {
  function fromCoverageCount(count) {
    return { covered: count.covered, total: count.total };
  }
  function fromLocation(location2) {
    return "line" in location2 ? Position.from(location2) : Range.from(location2);
  }
  function toLocation(location2) {
    if (!location2) {
      return void 0;
    }
    return "endLineNumber" in location2 ? Range.to(location2) : Position.to(location2);
  }
  function to(serialized) {
    if (serialized.type === DetailType.Statement) {
      const branches = [];
      if (serialized.branches) {
        for (const branch of serialized.branches) {
          branches.push({
            executed: branch.count,
            location: toLocation(branch.location),
            label: branch.label
          });
        }
      }
      return new types.StatementCoverage(
        serialized.count,
        toLocation(serialized.location),
        serialized.branches?.map((b) => new types.BranchCoverage(
          b.count,
          toLocation(b.location),
          b.label
        ))
      );
    } else {
      return new types.DeclarationCoverage(
        serialized.name,
        serialized.count,
        toLocation(serialized.location)
      );
    }
  }
  TestCoverage2.to = to;
  function fromDetails(coverage) {
    if (typeof coverage.executed === "number" && coverage.executed < 0) {
      throw new Error(`Invalid coverage count ${coverage.executed}`);
    }
    if ("branches" in coverage) {
      return {
        count: coverage.executed,
        location: fromLocation(coverage.location),
        type: DetailType.Statement,
        branches: coverage.branches.length ? coverage.branches.map((b) => ({ count: b.executed, location: b.location && fromLocation(b.location), label: b.label })) : void 0
      };
    } else {
      return {
        type: DetailType.Declaration,
        name: coverage.name,
        count: coverage.executed,
        location: fromLocation(coverage.location)
      };
    }
  }
  TestCoverage2.fromDetails = fromDetails;
  function fromFile(controllerId, id, coverage) {
    types.validateTestCoverageCount(coverage.statementCoverage);
    types.validateTestCoverageCount(coverage.branchCoverage);
    types.validateTestCoverageCount(coverage.declarationCoverage);
    return {
      id,
      uri: coverage.uri,
      statement: fromCoverageCount(coverage.statementCoverage),
      branch: coverage.branchCoverage && fromCoverageCount(coverage.branchCoverage),
      declaration: coverage.declarationCoverage && fromCoverageCount(coverage.declarationCoverage),
      testIds: coverage instanceof types.FileCoverage && coverage.includesTests.length ? coverage.includesTests.map((t) => TestId.fromExtHostTestItem(t, controllerId).toString()) : void 0
    };
  }
  TestCoverage2.fromFile = fromFile;
})(TestCoverage || (TestCoverage = {}));
var CodeActionTriggerKind;
((CodeActionTriggerKind2) => {
  function to(value) {
    switch (value) {
      case languages.CodeActionTriggerType.Invoke:
        return types.CodeActionTriggerKind.Invoke;
      case languages.CodeActionTriggerType.Auto:
        return types.CodeActionTriggerKind.Automatic;
    }
  }
  CodeActionTriggerKind2.to = to;
})(CodeActionTriggerKind || (CodeActionTriggerKind = {}));
var TypeHierarchyItem;
((TypeHierarchyItem2) => {
  function to(item) {
    const result = new types.TypeHierarchyItem(
      SymbolKind.to(item.kind),
      item.name,
      item.detail || "",
      URI.revive(item.uri),
      Range.to(item.range),
      Range.to(item.selectionRange)
    );
    result._sessionId = item._sessionId;
    result._itemId = item._itemId;
    return result;
  }
  TypeHierarchyItem2.to = to;
  function from(item, sessionId, itemId) {
    sessionId = sessionId ?? item._sessionId;
    itemId = itemId ?? item._itemId;
    if (sessionId === void 0 || itemId === void 0) {
      throw new Error("invalid item");
    }
    return {
      _sessionId: sessionId,
      _itemId: itemId,
      kind: SymbolKind.from(item.kind),
      name: item.name,
      detail: item.detail ?? "",
      uri: item.uri,
      range: Range.from(item.range),
      selectionRange: Range.from(item.selectionRange),
      tags: item.tags?.map(SymbolTag.from)
    };
  }
  TypeHierarchyItem2.from = from;
})(TypeHierarchyItem || (TypeHierarchyItem = {}));
var ViewBadge;
((ViewBadge2) => {
  function from(badge) {
    if (!badge) {
      return void 0;
    }
    return {
      value: badge.value,
      tooltip: badge.tooltip
    };
  }
  ViewBadge2.from = from;
})(ViewBadge || (ViewBadge = {}));
var DataTransferItem;
((DataTransferItem2) => {
  function to(mime, item, resolveFileData) {
    const file = item.fileData;
    if (file) {
      return new types.InternalFileDataTransferItem(
        new types.DataTransferFile(file.name, URI.revive(file.uri), file.id, createSingleCallFunction(() => resolveFileData(file.id)))
      );
    }
    if (mime === Mimes.uriList && item.uriListData) {
      return new types.InternalDataTransferItem(reviveUriList(item.uriListData));
    }
    return new types.InternalDataTransferItem(item.asString);
  }
  DataTransferItem2.to = to;
  async function from(mime, item, id = generateUuid()) {
    const stringValue = await item.asString();
    if (mime === Mimes.uriList) {
      return {
        id,
        asString: stringValue,
        fileData: void 0,
        uriListData: serializeUriList(stringValue)
      };
    }
    const fileValue = item.asFile();
    return {
      id,
      asString: stringValue,
      fileData: fileValue ? {
        name: fileValue.name,
        uri: fileValue.uri,
        id: fileValue._itemId ?? fileValue.id
      } : void 0
    };
  }
  DataTransferItem2.from = from;
  function serializeUriList(stringValue) {
    return UriList.split(stringValue).map((part) => {
      if (part.startsWith("#")) {
        return part;
      }
      try {
        return URI.parse(part);
      } catch {
      }
      return part;
    });
  }
  function reviveUriList(parts) {
    return UriList.create(parts.map((part) => {
      return typeof part === "string" ? part : URI.revive(part);
    }));
  }
})(DataTransferItem || (DataTransferItem = {}));
var DataTransfer;
((DataTransfer2) => {
  function toDataTransfer(value, resolveFileData) {
    const init = value.items.map(([type, item]) => {
      return [type, DataTransferItem.to(type, item, resolveFileData)];
    });
    return new types.DataTransfer(init);
  }
  DataTransfer2.toDataTransfer = toDataTransfer;
  async function from(dataTransfer) {
    const items = await Promise.all(Array.from(dataTransfer, async ([mime, value]) => {
      return [mime, await DataTransferItem.from(mime, value)];
    }));
    return { items };
  }
  DataTransfer2.from = from;
  async function fromList(dataTransfer) {
    const items = await Promise.all(Array.from(dataTransfer, async ([mime, value]) => {
      return [mime, await DataTransferItem.from(mime, value, value.id)];
    }));
    return { items };
  }
  DataTransfer2.fromList = fromList;
})(DataTransfer || (DataTransfer = {}));
var ChatFollowup;
((ChatFollowup2) => {
  function from(followup, request) {
    return {
      kind: "reply",
      agentId: followup.participant ?? request?.agentId ?? "",
      subCommand: followup.command ?? request?.command,
      message: followup.prompt,
      title: followup.label
    };
  }
  ChatFollowup2.from = from;
  function to(followup) {
    return {
      prompt: followup.message,
      label: followup.title,
      participant: followup.agentId,
      command: followup.subCommand
    };
  }
  ChatFollowup2.to = to;
})(ChatFollowup || (ChatFollowup = {}));
var LanguageModelChatMessageRole;
((LanguageModelChatMessageRole2) => {
  function to(role) {
    switch (role) {
      case chatProvider.ChatMessageRole.System:
        return types.LanguageModelChatMessageRole.System;
      case chatProvider.ChatMessageRole.User:
        return types.LanguageModelChatMessageRole.User;
      case chatProvider.ChatMessageRole.Assistant:
        return types.LanguageModelChatMessageRole.Assistant;
    }
  }
  LanguageModelChatMessageRole2.to = to;
  function from(role) {
    switch (role) {
      case types.LanguageModelChatMessageRole.System:
        return chatProvider.ChatMessageRole.System;
      case types.LanguageModelChatMessageRole.User:
        return chatProvider.ChatMessageRole.User;
      case types.LanguageModelChatMessageRole.Assistant:
        return chatProvider.ChatMessageRole.Assistant;
    }
    return chatProvider.ChatMessageRole.User;
  }
  LanguageModelChatMessageRole2.from = from;
})(LanguageModelChatMessageRole || (LanguageModelChatMessageRole = {}));
var LanguageModelChatMessage;
((LanguageModelChatMessage3) => {
  function to(message) {
    const content = message.content.map((c) => {
      if (c.type === "text") {
        return new LanguageModelTextPart(c.value, c.audience);
      } else if (c.type === "tool_result") {
        const content2 = coalesce(c.value.map((part) => {
          if (part.type === "text") {
            return new types.LanguageModelTextPart(part.value, part.audience);
          } else if (part.type === "data") {
            return new types.LanguageModelDataPart(part.data.buffer, part.mimeType);
          } else if (part.type === "prompt_tsx") {
            return new types.LanguageModelPromptTsxPart(part.value);
          } else {
            return void 0;
          }
        }));
        return new types.LanguageModelToolResultPart(c.toolCallId, content2, c.isError);
      } else if (c.type === "image_url") {
        return new types.LanguageModelDataPart(c.value.data.buffer, c.value.mimeType);
      } else if (c.type === "data") {
        return new types.LanguageModelDataPart(c.data.buffer, c.mimeType);
      } else if (c.type === "tool_use") {
        return new types.LanguageModelToolCallPart(c.toolCallId, c.name, c.parameters);
      }
      return void 0;
    }).filter((c) => c !== void 0);
    const role = LanguageModelChatMessageRole.to(message.role);
    const result = new types.LanguageModelChatMessage(role, content, message.name);
    return result;
  }
  LanguageModelChatMessage3.to = to;
  function from(message) {
    const role = LanguageModelChatMessageRole.from(message.role);
    const name = message.name;
    let messageContent = message.content;
    if (typeof messageContent === "string") {
      messageContent = [new types.LanguageModelTextPart(messageContent)];
    }
    const content = messageContent.map((c) => {
      if (c instanceof types.LanguageModelToolResultPart) {
        return {
          type: "tool_result",
          toolCallId: c.callId,
          value: coalesce(c.content.map((part) => {
            if (part instanceof types.LanguageModelTextPart) {
              return {
                type: "text",
                value: part.value,
                audience: part.audience
              };
            } else if (part instanceof types.LanguageModelPromptTsxPart) {
              return {
                type: "prompt_tsx",
                value: part.value
              };
            } else if (part instanceof types.LanguageModelDataPart) {
              return {
                type: "data",
                mimeType: part.mimeType,
                data: VSBuffer.wrap(part.data),
                audience: part.audience
              };
            } else {
              return void 0;
            }
          })),
          isError: c.isError
        };
      } else if (c instanceof types.LanguageModelDataPart) {
        if (isImageDataPart(c)) {
          const value = {
            mimeType: c.mimeType,
            data: VSBuffer.wrap(c.data)
          };
          return {
            type: "image_url",
            value
          };
        } else {
          return {
            type: "data",
            mimeType: c.mimeType,
            data: VSBuffer.wrap(c.data),
            audience: c.audience
          };
        }
      } else if (c instanceof types.LanguageModelToolCallPart) {
        return {
          type: "tool_use",
          toolCallId: c.callId,
          name: c.name,
          parameters: c.input
        };
      } else if (c instanceof types.LanguageModelTextPart) {
        return {
          type: "text",
          value: c.value
        };
      } else {
        if (typeof c !== "string") {
          throw new Error("Unexpected chat message content type");
        }
        return {
          type: "text",
          value: c
        };
      }
    });
    return {
      role,
      name,
      content
    };
  }
  LanguageModelChatMessage3.from = from;
})(LanguageModelChatMessage || (LanguageModelChatMessage = {}));
var LanguageModelChatMessage2;
((LanguageModelChatMessage22) => {
  function to(message) {
    const content = message.content.map((c) => {
      if (c.type === "text") {
        return new LanguageModelTextPart(c.value, c.audience);
      } else if (c.type === "tool_result") {
        const content2 = c.value.map((part) => {
          if (part.type === "text") {
            return new types.LanguageModelTextPart(part.value, part.audience);
          } else if (part.type === "data") {
            return new types.LanguageModelDataPart(part.data.buffer, part.mimeType);
          } else {
            return new types.LanguageModelPromptTsxPart(part.value);
          }
        });
        return new types.LanguageModelToolResultPart(c.toolCallId, content2, c.isError);
      } else if (c.type === "image_url") {
        return new types.LanguageModelDataPart(c.value.data.buffer, c.value.mimeType);
      } else if (c.type === "data") {
        return new types.LanguageModelDataPart(c.data.buffer, c.mimeType);
      } else if (c.type === "thinking") {
        return new types.LanguageModelThinkingPart(c.value, c.id, c.metadata);
      } else {
        return new types.LanguageModelToolCallPart(c.toolCallId, c.name, c.parameters);
      }
    });
    const role = LanguageModelChatMessageRole.to(message.role);
    const result = new types.LanguageModelChatMessage2(role, content, message.name);
    return result;
  }
  LanguageModelChatMessage22.to = to;
  function from(message) {
    const role = LanguageModelChatMessageRole.from(message.role);
    const name = message.name;
    let messageContent = message.content;
    if (typeof messageContent === "string") {
      messageContent = [new types.LanguageModelTextPart(messageContent)];
    }
    const content = messageContent.map((c) => {
      if (c instanceof types.LanguageModelToolResultPart) {
        return {
          type: "tool_result",
          toolCallId: c.callId,
          value: coalesce(c.content.map((part) => {
            if (part instanceof types.LanguageModelTextPart) {
              return {
                type: "text",
                value: part.value,
                audience: part.audience
              };
            } else if (part instanceof types.LanguageModelPromptTsxPart) {
              return {
                type: "prompt_tsx",
                value: part.value
              };
            } else if (part instanceof types.LanguageModelDataPart) {
              return {
                type: "data",
                mimeType: part.mimeType,
                data: VSBuffer.wrap(part.data),
                audience: part.audience
              };
            } else {
              return void 0;
            }
          })),
          isError: c.isError
        };
      } else if (c instanceof types.LanguageModelDataPart) {
        if (isImageDataPart(c)) {
          const value = {
            mimeType: c.mimeType,
            data: VSBuffer.wrap(c.data)
          };
          return {
            type: "image_url",
            value
          };
        } else {
          return {
            type: "data",
            mimeType: c.mimeType,
            data: VSBuffer.wrap(c.data),
            audience: c.audience
          };
        }
      } else if (c instanceof types.LanguageModelToolCallPart) {
        return {
          type: "tool_use",
          toolCallId: c.callId,
          name: c.name,
          parameters: c.input
        };
      } else if (c instanceof types.LanguageModelTextPart) {
        return {
          type: "text",
          value: c.value
        };
      } else if (c instanceof types.LanguageModelThinkingPart) {
        return {
          type: "thinking",
          value: c.value,
          id: c.id,
          metadata: c.metadata
        };
      } else {
        if (typeof c !== "string") {
          throw new Error("Unexpected chat message content type llm 2");
        }
        return {
          type: "text",
          value: c
        };
      }
    });
    return {
      role,
      name,
      content
    };
  }
  LanguageModelChatMessage22.from = from;
})(LanguageModelChatMessage2 || (LanguageModelChatMessage2 = {}));
function isImageDataPart(part) {
  const mime = typeof part.mimeType === "string" ? part.mimeType.toLowerCase() : "";
  switch (mime) {
    case "image/png":
    case "image/jpeg":
    case "image/jpg":
    case "image/gif":
    case "image/webp":
    case "image/bmp":
      return true;
    default:
      return false;
  }
}
var ChatResponseMarkdownPart;
((ChatResponseMarkdownPart2) => {
  function from(part) {
    return {
      kind: "markdownContent",
      content: MarkdownString.from(part.value)
    };
  }
  ChatResponseMarkdownPart2.from = from;
  function to(part) {
    return new types.ChatResponseMarkdownPart(MarkdownString.to(part.content));
  }
  ChatResponseMarkdownPart2.to = to;
})(ChatResponseMarkdownPart || (ChatResponseMarkdownPart = {}));
var ChatResponseCodeblockUriPart;
((ChatResponseCodeblockUriPart2) => {
  function from(part) {
    return {
      kind: "codeblockUri",
      uri: part.value,
      isEdit: part.isEdit,
      undoStopId: part.undoStopId
    };
  }
  ChatResponseCodeblockUriPart2.from = from;
  function to(part) {
    return new types.ChatResponseCodeblockUriPart(URI.revive(part.uri), part.isEdit, part.undoStopId);
  }
  ChatResponseCodeblockUriPart2.to = to;
})(ChatResponseCodeblockUriPart || (ChatResponseCodeblockUriPart = {}));
var ChatResponseMarkdownWithVulnerabilitiesPart;
((ChatResponseMarkdownWithVulnerabilitiesPart2) => {
  function from(part) {
    return {
      kind: "markdownVuln",
      content: MarkdownString.from(part.value),
      vulnerabilities: part.vulnerabilities
    };
  }
  ChatResponseMarkdownWithVulnerabilitiesPart2.from = from;
  function to(part) {
    return new types.ChatResponseMarkdownWithVulnerabilitiesPart(MarkdownString.to(part.content), part.vulnerabilities);
  }
  ChatResponseMarkdownWithVulnerabilitiesPart2.to = to;
})(ChatResponseMarkdownWithVulnerabilitiesPart || (ChatResponseMarkdownWithVulnerabilitiesPart = {}));
var ChatResponseConfirmationPart;
((ChatResponseConfirmationPart2) => {
  function from(part) {
    return {
      kind: "confirmation",
      title: part.title,
      message: MarkdownString.from(part.message),
      data: part.data,
      buttons: part.buttons
    };
  }
  ChatResponseConfirmationPart2.from = from;
})(ChatResponseConfirmationPart || (ChatResponseConfirmationPart = {}));
var ChatResponseQuestionCarouselPart;
((ChatResponseQuestionCarouselPart2) => {
  function questionTypeToString(type) {
    switch (type) {
      case types.ChatQuestionType.Text:
        return "text";
      case types.ChatQuestionType.SingleSelect:
        return "singleSelect";
      case types.ChatQuestionType.MultiSelect:
        return "multiSelect";
      default:
        return "text";
    }
  }
  function stringToQuestionType(type) {
    switch (type) {
      case "text":
        return types.ChatQuestionType.Text;
      case "singleSelect":
        return types.ChatQuestionType.SingleSelect;
      case "multiSelect":
        return types.ChatQuestionType.MultiSelect;
      default:
        return types.ChatQuestionType.Text;
    }
  }
  function from(part) {
    return {
      kind: "questionCarousel",
      questions: part.questions.map((q) => ({
        id: q.id,
        type: questionTypeToString(q.type),
        title: q.title,
        message: q.message ? MarkdownString.from(q.message) : void 0,
        options: q.options?.map((opt) => ({ id: opt.id, label: opt.label, value: String(opt.value) })),
        defaultValue: q.defaultValue,
        allowFreeformInput: q.allowFreeformInput
      })),
      allowSkip: part.allowSkip
    };
  }
  ChatResponseQuestionCarouselPart2.from = from;
  function to(part) {
    const questions = part.questions.map((q) => new types.ChatQuestion(
      q.id,
      stringToQuestionType(q.type),
      q.title,
      {
        message: q.message ? typeof q.message === "string" ? new types.MarkdownString(q.message) : MarkdownString.to(q.message) : void 0,
        options: q.options?.map((opt) => ({
          id: opt.id,
          label: opt.label,
          value: opt.value
        })),
        defaultValue: q.defaultValue,
        allowFreeformInput: q.allowFreeformInput
      }
    ));
    return new types.ChatResponseQuestionCarouselPart(questions, part.allowSkip);
  }
  ChatResponseQuestionCarouselPart2.to = to;
})(ChatResponseQuestionCarouselPart || (ChatResponseQuestionCarouselPart = {}));
var ChatResponseFilesPart;
((ChatResponseFilesPart2) => {
  function from(part) {
    const { value, baseUri } = part;
    function convert(items, baseUri2) {
      return items.map((item) => {
        const myUri = URI.joinPath(baseUri2, item.name);
        return {
          label: item.name,
          uri: myUri,
          children: item.children && convert(item.children, myUri)
        };
      });
    }
    return {
      kind: "treeData",
      treeData: {
        label: basename(baseUri),
        uri: baseUri,
        children: convert(value, baseUri)
      }
    };
  }
  ChatResponseFilesPart2.from = from;
  function to(part) {
    const treeData = revive(part.treeData);
    function convert(items2) {
      return items2.map((item) => {
        return {
          name: item.label,
          children: item.children && convert(item.children)
        };
      });
    }
    const baseUri = treeData.uri;
    const items = treeData.children ? convert(treeData.children) : [];
    return new types.ChatResponseFileTreePart(items, baseUri);
  }
  ChatResponseFilesPart2.to = to;
})(ChatResponseFilesPart || (ChatResponseFilesPart = {}));
var ChatResponseMultiDiffPart;
((ChatResponseMultiDiffPart2) => {
  function from(part) {
    return {
      kind: "multiDiffData",
      multiDiffData: {
        title: part.title,
        resources: part.value.map((entry) => ({
          originalUri: entry.originalUri,
          modifiedUri: entry.modifiedUri,
          goToFileUri: entry.goToFileUri,
          added: entry.added,
          removed: entry.removed
        }))
      },
      readOnly: part.readOnly
    };
  }
  ChatResponseMultiDiffPart2.from = from;
  function to(part) {
    const resources = part.multiDiffData.resources.map((resource) => ({
      originalUri: resource.originalUri ? URI.revive(resource.originalUri) : void 0,
      modifiedUri: resource.modifiedUri ? URI.revive(resource.modifiedUri) : void 0,
      goToFileUri: resource.goToFileUri ? URI.revive(resource.goToFileUri) : void 0,
      added: resource.added,
      removed: resource.removed
    }));
    return new types.ChatResponseMultiDiffPart(resources, part.multiDiffData.title, part.readOnly);
  }
  ChatResponseMultiDiffPart2.to = to;
})(ChatResponseMultiDiffPart || (ChatResponseMultiDiffPart = {}));
var ChatResponseAnchorPart;
((ChatResponseAnchorPart2) => {
  function from(part) {
    const isUri = (thing) => URI.isUri(thing);
    const isSymbolInformation = (thing) => "name" in thing;
    return {
      kind: "inlineReference",
      name: part.title,
      inlineReference: isUri(part.value) ? part.value : isSymbolInformation(part.value) ? WorkspaceSymbol.from(part.value) : Location.from(part.value)
    };
  }
  ChatResponseAnchorPart2.from = from;
  function to(part) {
    const value = revive(part);
    return new types.ChatResponseAnchorPart(
      URI.isUri(value.inlineReference) ? value.inlineReference : "location" in value.inlineReference ? WorkspaceSymbol.to(value.inlineReference) : Location.to(value.inlineReference),
      part.name
    );
  }
  ChatResponseAnchorPart2.to = to;
})(ChatResponseAnchorPart || (ChatResponseAnchorPart = {}));
var ChatResponseProgressPart;
((ChatResponseProgressPart2) => {
  function from(part) {
    return {
      kind: "progressMessage",
      content: MarkdownString.from(part.value)
    };
  }
  ChatResponseProgressPart2.from = from;
  function to(part) {
    return new types.ChatResponseProgressPart(part.content.value);
  }
  ChatResponseProgressPart2.to = to;
})(ChatResponseProgressPart || (ChatResponseProgressPart = {}));
var ChatResponseThinkingProgressPart;
((ChatResponseThinkingProgressPart2) => {
  function from(part) {
    return {
      kind: "thinking",
      value: part.value,
      id: part.id,
      metadata: part.metadata
    };
  }
  ChatResponseThinkingProgressPart2.from = from;
  function to(part) {
    return new types.ChatResponseThinkingProgressPart(part.value ?? "", part.id, part.metadata);
  }
  ChatResponseThinkingProgressPart2.to = to;
})(ChatResponseThinkingProgressPart || (ChatResponseThinkingProgressPart = {}));
var ChatResponseHookPart;
((ChatResponseHookPart2) => {
  function from(part) {
    return {
      kind: "hook",
      hookType: part.hookType,
      stopReason: part.stopReason,
      systemMessage: part.systemMessage,
      metadata: part.metadata
    };
  }
  ChatResponseHookPart2.from = from;
  function to(part) {
    return new types.ChatResponseHookPart(part.hookType, part.stopReason, part.systemMessage, part.metadata);
  }
  ChatResponseHookPart2.to = to;
})(ChatResponseHookPart || (ChatResponseHookPart = {}));
var ChatResponseVoiceProgressPart;
((ChatResponseVoiceProgressPart2) => {
  function from(part) {
    return {
      kind: "voiceProgress",
      id: part.id,
      value: part.value
    };
  }
  ChatResponseVoiceProgressPart2.from = from;
})(ChatResponseVoiceProgressPart || (ChatResponseVoiceProgressPart = {}));
var ChatResponseAutoModeResolutionPart;
((ChatResponseAutoModeResolutionPart2) => {
  const validLabels = /* @__PURE__ */ new Set(["needs_reasoning", "no_reasoning", "fallback"]);
  function from(part) {
    const label = validLabels.has(part.predictedLabel) ? part.predictedLabel : "fallback";
    return {
      kind: "autoModeResolution",
      resolvedModel: part.resolvedModel,
      resolvedModelName: part.resolvedModelName,
      predictedLabel: label,
      confidence: Math.max(0, Math.min(1, part.confidence))
    };
  }
  ChatResponseAutoModeResolutionPart2.from = from;
  function to(part) {
    return new types.ChatResponseAutoModeResolutionPart(part.resolvedModel, part.resolvedModelName, part.predictedLabel, part.confidence);
  }
  ChatResponseAutoModeResolutionPart2.to = to;
})(ChatResponseAutoModeResolutionPart || (ChatResponseAutoModeResolutionPart = {}));
var ChatResponseWarningPart;
((ChatResponseWarningPart2) => {
  function from(part) {
    return {
      kind: "warning",
      content: MarkdownString.from(part.value)
    };
  }
  ChatResponseWarningPart2.from = from;
  function to(part) {
    return new types.ChatResponseWarningPart(part.content.value);
  }
  ChatResponseWarningPart2.to = to;
})(ChatResponseWarningPart || (ChatResponseWarningPart = {}));
var ChatResponseInfoPart;
((ChatResponseInfoPart2) => {
  function from(part) {
    return {
      kind: "info",
      content: MarkdownString.from(part.value)
    };
  }
  ChatResponseInfoPart2.from = from;
  function to(part) {
    return new types.ChatResponseInfoPart(part.content.value);
  }
  ChatResponseInfoPart2.to = to;
})(ChatResponseInfoPart || (ChatResponseInfoPart = {}));
var ChatResponseExtensionsPart;
((ChatResponseExtensionsPart2) => {
  function from(part) {
    return {
      kind: "extensions",
      extensions: part.extensions
    };
  }
  ChatResponseExtensionsPart2.from = from;
})(ChatResponseExtensionsPart || (ChatResponseExtensionsPart = {}));
var ChatResponsePullRequestPart;
((ChatResponsePullRequestPart2) => {
  function from(part, commandsConverter, commandDisposables) {
    let command;
    if (!part.command) {
      if (!part.uri) {
        throw new Error("Pull request part must have a command if URI is provided");
      }
      command = {
        title: "Open Pull Request",
        id: "vscode.open",
        arguments: [part.uri]
      };
    } else {
      command = commandsConverter.toInternal(part.command, commandDisposables);
    }
    return {
      kind: "pullRequest",
      author: part.author,
      title: part.title,
      description: part.description,
      uri: part.uri,
      linkTag: part.linkTag,
      command
    };
  }
  ChatResponsePullRequestPart2.from = from;
})(ChatResponsePullRequestPart || (ChatResponsePullRequestPart = {}));
var ChatResponseMovePart;
((ChatResponseMovePart2) => {
  function from(part) {
    return {
      kind: "move",
      uri: part.uri,
      range: Range.from(part.range)
    };
  }
  ChatResponseMovePart2.from = from;
  function to(part) {
    return new types.ChatResponseMovePart(URI.revive(part.uri), Range.to(part.range));
  }
  ChatResponseMovePart2.to = to;
})(ChatResponseMovePart || (ChatResponseMovePart = {}));
var ChatToolInvocationPart;
((ChatToolInvocationPart2) => {
  function from(part) {
    let resultDetails;
    let toolSpecificData;
    if (part.toolSpecificData && isChatMcpToolInvocationData(part.toolSpecificData)) {
      resultDetails = convertMcpToResultDetails(part.toolSpecificData, part.isError);
      toolSpecificData = void 0;
    } else {
      toolSpecificData = part.toolSpecificData ? convertToolSpecificData(part.toolSpecificData) : void 0;
    }
    const presentation = part.presentation === "hidden" ? ToolInvocationPresentation.Hidden : part.presentation === "hiddenAfterComplete" ? ToolInvocationPresentation.HiddenAfterComplete : void 0;
    if (part.enablePartialUpdate) {
      return {
        kind: "externalToolInvocationUpdate",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        isComplete: !!part.isComplete,
        invocationMessage: part.invocationMessage ? MarkdownString.from(part.invocationMessage) : void 0,
        pastTenseMessage: part.pastTenseMessage ? MarkdownString.from(part.pastTenseMessage) : void 0,
        toolSpecificData,
        subagentInvocationId: part.subAgentInvocationId,
        resultDetails
      };
    }
    return {
      kind: "toolInvocationSerialized",
      toolCallId: part.toolCallId,
      toolId: part.toolName,
      invocationMessage: part.invocationMessage ? MarkdownString.from(part.invocationMessage) : part.toolName,
      originMessage: part.originMessage ? MarkdownString.from(part.originMessage) : void 0,
      pastTenseMessage: part.pastTenseMessage ? MarkdownString.from(part.pastTenseMessage) : void 0,
      isConfirmed: part.isConfirmed,
      isComplete: true,
      source: ToolDataSource.External,
      // isError: part.isError ?? false,
      toolSpecificData,
      resultDetails,
      presentation,
      subAgentInvocationId: part.subAgentInvocationId
    };
  }
  ChatToolInvocationPart2.from = from;
  function isChatMcpToolInvocationData(data) {
    return data !== null && typeof data === "object" && "input" in data && typeof data.input === "string" && "output" in data && Array.isArray(data.output);
  }
  function convertMcpToResultDetails(data, isError) {
    return {
      input: data.input,
      output: data.output.map((o) => {
        const isText = o.mimeType.startsWith("text/");
        return {
          type: "embed",
          mimeType: o.mimeType,
          value: isText ? VSBuffer.wrap(o.data).toString() : encodeBase64(VSBuffer.wrap(o.data)),
          isText
        };
      }),
      isError: isError ?? false
    };
  }
  function convertToolSpecificData(data) {
    if ("command" in data && "language" in data) {
      return {
        kind: "terminal",
        command: data.command,
        language: data.language
      };
    } else if ("commandLine" in data && "language" in data) {
      const presentationOverrides = data.presentationOverrides && typeof data.presentationOverrides.commandLine === "string" ? {
        commandLine: data.presentationOverrides.commandLine,
        language: data.presentationOverrides.language
      } : void 0;
      const result = {
        kind: "terminal",
        presentationOverrides,
        commandLine: data.commandLine,
        language: data.language,
        terminalCommandOutput: typeof data.output?.text === "string" ? {
          text: data.output.text
        } : void 0,
        terminalCommandState: data.state ? {
          exitCode: data.state.exitCode,
          duration: data.state.duration
        } : void 0
      };
      return result;
    } else if ("todoList" in data && Array.isArray(data.todoList)) {
      return {
        kind: "todoList",
        todoList: data.todoList.map((todo) => ({
          id: String(todo.id),
          title: todo.title,
          status: todoStatusEnumToString(todo.status)
        }))
      };
    } else if ("input" in data && "output" in data && !Array.isArray(data.output)) {
      return {
        kind: "simpleToolInvocation",
        input: typeof data.input === "string" ? data.input : "",
        output: typeof data.output === "string" ? data.output : ""
      };
    } else if (data && "values" in data && Array.isArray(data.values)) {
      return {
        kind: "resources",
        values: data.values.map((v) => {
          if (v instanceof types.Location) {
            return Location.from(v);
          } else {
            return URI.revive(v);
          }
        })
      };
    } else if (data instanceof types.ChatSubagentToolInvocationData) {
      return {
        kind: "subagent",
        description: data.description,
        agentName: data.agentName,
        prompt: data.prompt,
        result: data.result,
        modelName: data.modelName
      };
    }
    return data;
  }
  function todoStatusEnumToString(status) {
    switch (status) {
      case types.ChatTodoStatus.NotStarted:
        return "not-started";
      case types.ChatTodoStatus.InProgress:
        return "in-progress";
      case types.ChatTodoStatus.Completed:
        return "completed";
      default:
        return "not-started";
    }
  }
  function todoStatusStringToEnum(status) {
    switch (status) {
      case "not-started":
        return types.ChatTodoStatus.NotStarted;
      case "in-progress":
        return types.ChatTodoStatus.InProgress;
      case "completed":
        return types.ChatTodoStatus.Completed;
      default:
        return types.ChatTodoStatus.NotStarted;
    }
  }
  function to(part) {
    const toolInvocation = new types.ChatToolInvocationPart(
      part.toolId || part.toolName,
      part.toolCallId,
      part.errorMessage
    );
    if (part.invocationMessage) {
      toolInvocation.invocationMessage = part.invocationMessage;
    }
    if (part.originMessage) {
      toolInvocation.originMessage = part.originMessage;
    }
    if (part.pastTenseMessage) {
      toolInvocation.pastTenseMessage = part.pastTenseMessage;
    }
    if (part.isConfirmed !== void 0) {
      toolInvocation.isConfirmed = part.isConfirmed;
    }
    if (part.isComplete !== void 0) {
      toolInvocation.isComplete = part.isComplete;
    }
    if (part.toolSpecificData) {
      toolInvocation.toolSpecificData = convertFromInternalToolSpecificData(part.toolSpecificData);
    }
    toolInvocation.subAgentInvocationId = part.subAgentInvocationId;
    toolInvocation.subAgentName = part.subAgentName;
    return toolInvocation;
  }
  ChatToolInvocationPart2.to = to;
  function convertFromInternalToolSpecificData(data) {
    if (data.kind === "terminal") {
      if (data.commandLine) {
        const result = {
          commandLine: data.commandLine,
          language: data.language
        };
        if (data.terminalCommandOutput) {
          result.output = {
            text: data.terminalCommandOutput.text,
            truncated: data.terminalCommandOutput.truncated,
            lineCount: data.terminalCommandOutput.lineCount
          };
        }
        if (data.terminalCommandState) {
          result.state = {
            exitCode: data.terminalCommandState.exitCode,
            duration: data.terminalCommandState.duration
          };
        }
        return result;
      } else {
        return {
          command: data.command,
          language: data.language
        };
      }
    } else if (data.kind === "terminal2") {
      return {
        commandLine: data.commandLine,
        language: data.language
      };
    } else if (data.kind === "todoList") {
      return {
        todoList: data.todoList.map((todo, index) => {
          const parsed = Number(todo.id);
          const id = Number.isFinite(parsed) ? parsed : index;
          return {
            id,
            title: todo.title,
            status: todoStatusStringToEnum(todo.status)
          };
        })
      };
    }
    return data;
  }
})(ChatToolInvocationPart || (ChatToolInvocationPart = {}));
var ChatTask;
((ChatTask2) => {
  function from(part) {
    return {
      kind: "progressTask",
      content: MarkdownString.from(part.value)
    };
  }
  ChatTask2.from = from;
})(ChatTask || (ChatTask = {}));
var ChatTaskResult;
((ChatTaskResult2) => {
  function from(part) {
    return {
      kind: "progressTaskResult",
      content: typeof part === "string" ? MarkdownString.from(part) : void 0
    };
  }
  ChatTaskResult2.from = from;
})(ChatTaskResult || (ChatTaskResult = {}));
var ChatResponseCommandButtonPart;
((ChatResponseCommandButtonPart2) => {
  function from(part, commandsConverter, commandDisposables) {
    const command = commandsConverter.toInternal(part.value, commandDisposables) ?? { command: part.value.command, title: part.value.title };
    return {
      kind: "command",
      command
    };
  }
  ChatResponseCommandButtonPart2.from = from;
  function to(part, commandsConverter) {
    return new types.ChatResponseCommandButtonPart(commandsConverter.fromInternal(part.command) ?? { command: part.command.id, title: part.command.title });
  }
  ChatResponseCommandButtonPart2.to = to;
})(ChatResponseCommandButtonPart || (ChatResponseCommandButtonPart = {}));
var ChatResponseTextEditPart;
((ChatResponseTextEditPart2) => {
  function from(part) {
    return {
      kind: "textEdit",
      uri: part.uri,
      edits: part.edits.map((e) => TextEdit.from(e)),
      done: part.isDone
    };
  }
  ChatResponseTextEditPart2.from = from;
  function to(part) {
    const result = new types.ChatResponseTextEditPart(URI.revive(part.uri), part.edits.map((e) => TextEdit.to(e)));
    result.isDone = part.done;
    return result;
  }
  ChatResponseTextEditPart2.to = to;
})(ChatResponseTextEditPart || (ChatResponseTextEditPart = {}));
var NotebookEdit;
((NotebookEdit2) => {
  function from(edit) {
    if (edit.newCellMetadata) {
      return {
        editType: CellEditType.Metadata,
        index: edit.range.start,
        metadata: edit.newCellMetadata
      };
    } else if (edit.newNotebookMetadata) {
      return {
        editType: CellEditType.DocumentMetadata,
        metadata: edit.newNotebookMetadata
      };
    } else {
      return {
        editType: CellEditType.Replace,
        index: edit.range.start,
        count: edit.range.end - edit.range.start,
        cells: edit.newCells.map(NotebookCellData.from)
      };
    }
  }
  NotebookEdit2.from = from;
})(NotebookEdit || (NotebookEdit = {}));
var ChatResponseNotebookEditPart;
((ChatResponseNotebookEditPart2) => {
  function from(part) {
    return {
      kind: "notebookEdit",
      uri: part.uri,
      edits: part.edits.map(NotebookEdit.from),
      done: part.isDone
    };
  }
  ChatResponseNotebookEditPart2.from = from;
})(ChatResponseNotebookEditPart || (ChatResponseNotebookEditPart = {}));
var ChatResponseWorkspaceEditPart;
((ChatResponseWorkspaceEditPart2) => {
  function from(part) {
    return {
      kind: "workspaceEdit",
      edits: part.edits.map((e) => ({
        oldResource: e.oldResource,
        newResource: e.newResource
      }))
    };
  }
  ChatResponseWorkspaceEditPart2.from = from;
})(ChatResponseWorkspaceEditPart || (ChatResponseWorkspaceEditPart = {}));
var ChatResponseReferencePart;
((ChatResponseReferencePart2) => {
  function from(part) {
    const iconPath = ThemeIcon.isThemeIcon(part.iconPath) ? part.iconPath : URI.isUri(part.iconPath) ? { light: URI.revive(part.iconPath) } : part.iconPath && "light" in part.iconPath && "dark" in part.iconPath && URI.isUri(part.iconPath.light) && URI.isUri(part.iconPath.dark) ? { light: URI.revive(part.iconPath.light), dark: URI.revive(part.iconPath.dark) } : void 0;
    if (typeof part.value === "object" && "variableName" in part.value) {
      return {
        kind: "reference",
        reference: {
          variableName: part.value.variableName,
          value: URI.isUri(part.value.value) || !part.value.value ? part.value.value : Location.from(part.value.value)
        },
        iconPath,
        options: part.options
      };
    }
    return {
      kind: "reference",
      reference: URI.isUri(part.value) || typeof part.value === "string" ? part.value : Location.from(part.value),
      iconPath,
      options: part.options
    };
  }
  ChatResponseReferencePart2.from = from;
  function to(part) {
    const value = revive(part);
    const mapValue = (value2) => URI.isUri(value2) ? value2 : Location.to(value2);
    return new types.ChatResponseReferencePart(
      typeof value.reference === "string" ? value.reference : "variableName" in value.reference ? {
        variableName: value.reference.variableName,
        value: value.reference.value && mapValue(value.reference.value)
      } : mapValue(value.reference)
    );
  }
  ChatResponseReferencePart2.to = to;
})(ChatResponseReferencePart || (ChatResponseReferencePart = {}));
var ChatResponseCodeCitationPart;
((ChatResponseCodeCitationPart2) => {
  function from(part) {
    return {
      kind: "codeCitation",
      value: part.value,
      license: part.license,
      snippet: part.snippet
    };
  }
  ChatResponseCodeCitationPart2.from = from;
})(ChatResponseCodeCitationPart || (ChatResponseCodeCitationPart = {}));
var ChatResponsePart;
((ChatResponsePart2) => {
  function from(part, commandsConverter, commandDisposables) {
    if (part instanceof types.ChatResponseMarkdownPart) {
      return ChatResponseMarkdownPart.from(part);
    } else if (part instanceof types.ChatResponseAnchorPart) {
      return ChatResponseAnchorPart.from(part);
    } else if (part instanceof types.ChatResponseReferencePart) {
      return ChatResponseReferencePart.from(part);
    } else if (part instanceof types.ChatResponseProgressPart) {
      return ChatResponseProgressPart.from(part);
    } else if (part instanceof types.ChatResponseThinkingProgressPart) {
      return ChatResponseThinkingProgressPart.from(part);
    } else if (part instanceof types.ChatResponseHookPart) {
      return ChatResponseHookPart.from(part);
    } else if (part instanceof types.ChatResponseVoiceProgressPart) {
      return ChatResponseVoiceProgressPart.from(part);
    } else if (part instanceof types.ChatResponseFileTreePart) {
      return ChatResponseFilesPart.from(part);
    } else if (part instanceof types.ChatResponseMultiDiffPart) {
      return ChatResponseMultiDiffPart.from(part);
    } else if (part instanceof types.ChatResponseCommandButtonPart) {
      return ChatResponseCommandButtonPart.from(part, commandsConverter, commandDisposables);
    } else if (part instanceof types.ChatResponseTextEditPart) {
      return ChatResponseTextEditPart.from(part);
    } else if (part instanceof types.ChatResponseNotebookEditPart) {
      return ChatResponseNotebookEditPart.from(part);
    } else if (part instanceof types.ChatResponseMarkdownWithVulnerabilitiesPart) {
      return ChatResponseMarkdownWithVulnerabilitiesPart.from(part);
    } else if (part instanceof types.ChatResponseCodeblockUriPart) {
      return ChatResponseCodeblockUriPart.from(part);
    } else if (part instanceof types.ChatResponseWarningPart) {
      return ChatResponseWarningPart.from(part);
    } else if (part instanceof types.ChatResponseInfoPart) {
      return ChatResponseInfoPart.from(part);
    } else if (part instanceof types.ChatResponseConfirmationPart) {
      return ChatResponseConfirmationPart.from(part);
    } else if (part instanceof types.ChatResponseQuestionCarouselPart) {
      return ChatResponseQuestionCarouselPart.from(part);
    } else if (part instanceof types.ChatResponseCodeCitationPart) {
      return ChatResponseCodeCitationPart.from(part);
    } else if (part instanceof types.ChatResponseMovePart) {
      return ChatResponseMovePart.from(part);
    } else if (part instanceof types.ChatResponseExtensionsPart) {
      return ChatResponseExtensionsPart.from(part);
    } else if (part instanceof types.ChatResponsePullRequestPart) {
      return ChatResponsePullRequestPart.from(part, commandsConverter, commandDisposables);
    } else if (part instanceof types.ChatToolInvocationPart) {
      return ChatToolInvocationPart.from(part);
    } else if (part instanceof types.ChatResponseWorkspaceEditPart) {
      return ChatResponseWorkspaceEditPart.from(part);
    } else if (part instanceof types.ChatResponseAutoModeResolutionPart) {
      return ChatResponseAutoModeResolutionPart.from(part);
    }
    return {
      kind: "markdownContent",
      content: MarkdownString.from("")
    };
  }
  ChatResponsePart2.from = from;
  function to(part, commandsConverter) {
    switch (part.kind) {
      case "reference":
        return ChatResponseReferencePart.to(part);
      case "markdownContent":
      case "inlineReference":
      case "progressMessage":
      case "treeData":
      case "command":
        return toContent(part, commandsConverter);
    }
    return void 0;
  }
  ChatResponsePart2.to = to;
  function toContent(part, commandsConverter) {
    switch (part.kind) {
      case "markdownContent":
        return ChatResponseMarkdownPart.to(part);
      case "inlineReference":
        return ChatResponseAnchorPart.to(part);
      case "progressMessage":
        return void 0;
      case "treeData":
        return ChatResponseFilesPart.to(part);
      case "command":
        return ChatResponseCommandButtonPart.to(part, commandsConverter);
    }
    return void 0;
  }
  ChatResponsePart2.toContent = toContent;
})(ChatResponsePart || (ChatResponsePart = {}));
var ChatAgentRequest;
((ChatAgentRequest2) => {
  function to(request, location2, model, modelConfiguration, diagnostics, tools, extension, logService) {
    const toolReferences = [];
    const variableReferences = [];
    for (const v of request.variables.variables) {
      if (v.kind === "tool") {
        toolReferences.push(v);
      } else if (v.kind === "toolset") {
        toolReferences.push(...v.value);
      } else {
        variableReferences.push(v);
      }
    }
    const sessionId = LocalChatSessionUri.parseLocalSessionId(request.sessionResource) ?? request.sessionResource.toString();
    const requestWithAllProps = {
      id: request.requestId,
      prompt: request.message,
      command: request.command,
      attempt: request.attempt ?? 0,
      enableCommandDetection: request.enableCommandDetection ?? true,
      isParticipantDetected: request.isParticipantDetected ?? false,
      isVoiceModeInput: request.isVoiceModeInput,
      sessionId,
      sessionResource: request.sessionResource,
      references: variableReferences.flatMap((v) => ChatPromptReference.toReferences(v, diagnostics, logService)),
      toolReferences: toolReferences.map(ChatLanguageModelToolReference.to),
      location: ChatLocation.to(request.location),
      acceptedConfirmationData: request.acceptedConfirmationData,
      rejectedConfirmationData: request.rejectedConfirmationData,
      location2,
      toolInvocationToken: Object.freeze({ sessionResource: request.sessionResource, workingDirectory: URI.revive(request.workingDirectory) }),
      tools,
      model,
      modelConfiguration,
      editedFileEvents: request.editedFileEvents,
      modeInstructions: request.modeInstructions?.content,
      modeInstructions2: ChatRequestModeInstructions.to(request.modeInstructions),
      permissionLevel: request.permissionLevel,
      subAgentInvocationId: request.subAgentInvocationId,
      subAgentName: request.subAgentName,
      parentRequestId: request.parentRequestId,
      hasHooksEnabled: request.hasHooksEnabled ?? false,
      hooks: request.hooks ? ChatRequestHooksConverter.to(request.hooks) : void 0,
      isSystemInitiated: request.isSystemInitiated
    };
    if (!isProposedApiEnabled(extension, "chatParticipantPrivate")) {
      delete requestWithAllProps.id;
      delete requestWithAllProps.attempt;
      delete requestWithAllProps.enableCommandDetection;
      delete requestWithAllProps.isParticipantDetected;
      delete requestWithAllProps.isVoiceModeInput;
      delete requestWithAllProps.location;
      delete requestWithAllProps.location2;
      delete requestWithAllProps.editedFileEvents;
      delete requestWithAllProps.sessionId;
      delete requestWithAllProps.subAgentInvocationId;
      delete requestWithAllProps.subAgentName;
      delete requestWithAllProps.parentRequestId;
      delete requestWithAllProps.hasHooksEnabled;
      delete requestWithAllProps.hooks;
    }
    if (!isProposedApiEnabled(extension, "chatParticipantAdditions")) {
      delete requestWithAllProps.acceptedConfirmationData;
      delete requestWithAllProps.rejectedConfirmationData;
      delete requestWithAllProps.tools;
    }
    return requestWithAllProps;
  }
  ChatAgentRequest2.to = to;
})(ChatAgentRequest || (ChatAgentRequest = {}));
var ChatLocation;
((ChatLocation2) => {
  function to(loc) {
    switch (loc) {
      case ChatAgentLocation.Notebook:
        return types.ChatLocation.Notebook;
      case ChatAgentLocation.Terminal:
        return types.ChatLocation.Terminal;
      case ChatAgentLocation.Chat:
        return types.ChatLocation.Panel;
      case ChatAgentLocation.EditorInline:
        return types.ChatLocation.Editor;
    }
  }
  ChatLocation2.to = to;
  function from(loc) {
    switch (loc) {
      case types.ChatLocation.Notebook:
        return ChatAgentLocation.Notebook;
      case types.ChatLocation.Terminal:
        return ChatAgentLocation.Terminal;
      case types.ChatLocation.Panel:
        return ChatAgentLocation.Chat;
      case types.ChatLocation.Editor:
        return ChatAgentLocation.EditorInline;
    }
  }
  ChatLocation2.from = from;
})(ChatLocation || (ChatLocation = {}));
var ChatSessionCustomizationType;
((ChatSessionCustomizationType2) => {
  function from(type) {
    return type.id;
  }
  ChatSessionCustomizationType2.from = from;
  function to(id) {
    switch (id) {
      case "agent":
        return types.ChatSessionCustomizationType.Agent;
      case "skill":
        return types.ChatSessionCustomizationType.Skill;
      case "instructions":
        return types.ChatSessionCustomizationType.Instructions;
      case "prompt":
        return types.ChatSessionCustomizationType.Prompt;
      case "hook":
        return types.ChatSessionCustomizationType.Hook;
      case "plugins":
        return types.ChatSessionCustomizationType.Plugins;
      default:
        return new types.ChatSessionCustomizationType(id);
    }
  }
  ChatSessionCustomizationType2.to = to;
})(ChatSessionCustomizationType || (ChatSessionCustomizationType = {}));
var ChatPromptReference;
((ChatPromptReference2) => {
  function toReferences(variable, diagnostics, logService) {
    const reference = to(variable, diagnostics, logService);
    if (!reference) {
      return [];
    }
    const element = isElementVariableEntry(variable) ? variable : void 0;
    if (!element) {
      return [reference];
    }
    const imageData = coerceImageBuffer(element.imageData);
    if (!imageData) {
      return [reference];
    }
    return [
      reference,
      {
        id: `${variable.id}-screenshot`,
        name: `${variable.name} screenshot`,
        value: new types.ChatReferenceBinaryData(
          element.imageMimeType ?? "image/png",
          () => Promise.resolve(imageData)
        )
      }
    ];
  }
  ChatPromptReference2.toReferences = toReferences;
  function to(variable, diagnostics, logService) {
    let value = variable.value;
    if (!value) {
      let varStr;
      try {
        varStr = JSON.stringify(variable);
      } catch {
        varStr = `kind=${variable.kind}, id=${variable.id}, name=${variable.name}`;
      }
      logService.error(`[ChatPromptReference] Ignoring invalid reference in variable: ${varStr}`);
      return void 0;
    }
    if (isUriComponents(value)) {
      value = URI.revive(value);
    } else if (value && typeof value === "object" && "uri" in value && "range" in value && isUriComponents(value.uri)) {
      value = Location.to(revive(value));
    } else if (isImageVariableEntry(variable)) {
      const ref = variable.references?.[0]?.reference;
      value = new types.ChatReferenceBinaryData(
        variable.mimeType ?? "image/png",
        () => Promise.resolve(new Uint8Array(Object.values(variable.value))),
        ref && URI.isUri(ref) ? ref : void 0,
        variable.isPasted,
        variable.isURL
      );
    } else if (variable.kind === "diagnostic") {
      const filterSeverity = variable.filterSeverity && DiagnosticSeverity.to(variable.filterSeverity);
      const filterUri = variable.filterUri && URI.revive(variable.filterUri).toString();
      value = new types.ChatReferenceDiagnostic(diagnostics.map(([uri, d]) => {
        if (variable.filterUri && uri.toString() !== filterUri) {
          return [uri, []];
        }
        return [uri, d.filter((d2) => {
          if (filterSeverity && d2.severity > filterSeverity) {
            return false;
          }
          if (variable.filterRange && !editorRange.Range.areIntersectingOrTouching(variable.filterRange, Range.from(d2.range))) {
            return false;
          }
          return true;
        })];
      }).filter(([, d]) => d.length > 0));
    }
    let toolReferences;
    if (isPromptFileVariableEntry(variable) || isPromptTextVariableEntry(variable)) {
      if (variable.toolReferences) {
        toolReferences = ChatLanguageModelToolReferences.to(variable.toolReferences);
      }
    }
    return {
      id: variable.id,
      name: variable.name,
      range: variable.range && [variable.range.start, variable.range.endExclusive],
      toolReferences,
      value,
      modelDescription: variable.modelDescription
    };
  }
  ChatPromptReference2.to = to;
})(ChatPromptReference || (ChatPromptReference = {}));
var ChatLanguageModelToolReference;
((ChatLanguageModelToolReference2) => {
  function to(variable) {
    const value = variable.value;
    if (value) {
      throw new Error("Invalid tool reference");
    }
    return {
      name: variable.id,
      range: variable.range && [variable.range.start, variable.range.endExclusive]
    };
  }
  ChatLanguageModelToolReference2.to = to;
})(ChatLanguageModelToolReference || (ChatLanguageModelToolReference = {}));
var ChatLanguageModelToolReferences;
((ChatLanguageModelToolReferences2) => {
  function to(variables) {
    const toolReferences = [];
    for (const v of variables) {
      if (v.kind === "tool") {
        toolReferences.push(ChatLanguageModelToolReference.to(v));
      } else if (v.kind === "toolset") {
        toolReferences.push(...v.value.map(ChatLanguageModelToolReference.to));
      } else {
        throw new Error("Invalid tool reference in prompt variables");
      }
    }
    return toolReferences;
  }
  ChatLanguageModelToolReferences2.to = to;
})(ChatLanguageModelToolReferences || (ChatLanguageModelToolReferences = {}));
var ChatRequestModeInstructions;
((ChatRequestModeInstructions2) => {
  function to(mode) {
    if (mode) {
      return {
        uri: URI.revive(mode.uri),
        name: mode.name,
        content: mode.content,
        toolReferences: ChatLanguageModelToolReferences.to(revive(mode.toolReferences)),
        allowedSubagents: mode.allowedSubagents,
        metadata: mode.metadata,
        isBuiltin: mode.isBuiltin
      };
    }
    return void 0;
  }
  ChatRequestModeInstructions2.to = to;
  function from(mode) {
    if (mode) {
      return {
        uri: mode.uri,
        name: mode.name,
        content: mode.content,
        toolReferences: mode.toolReferences?.map((ref) => ({
          kind: "tool",
          id: ref.name,
          name: ref.name,
          value: void 0,
          range: ref.range ? { start: ref.range[0], endExclusive: ref.range[1] } : void 0
        })) ?? [],
        allowedSubagents: mode.allowedSubagents,
        metadata: mode.metadata,
        isBuiltin: mode.isBuiltin
      };
    }
    return void 0;
  }
  ChatRequestModeInstructions2.from = from;
})(ChatRequestModeInstructions || (ChatRequestModeInstructions = {}));
var ChatAgentCompletionItem;
((ChatAgentCompletionItem2) => {
  function from(item, commandsConverter, disposables) {
    return {
      id: item.id,
      label: item.label,
      fullName: item.fullName,
      icon: item.icon?.id,
      value: item.values[0].value,
      insertText: item.insertText,
      detail: item.detail,
      documentation: item.documentation,
      command: commandsConverter.toInternal(item.command, disposables)
    };
  }
  ChatAgentCompletionItem2.from = from;
})(ChatAgentCompletionItem || (ChatAgentCompletionItem = {}));
var ChatAgentResult;
((ChatAgentResult2) => {
  function to(result) {
    return {
      errorDetails: result.errorDetails,
      metadata: reviveMetadata(result.metadata),
      nextQuestion: result.nextQuestion,
      details: result.details
    };
  }
  ChatAgentResult2.to = to;
  function from(result) {
    return {
      errorDetails: result.errorDetails,
      metadata: result.metadata,
      nextQuestion: result.nextQuestion,
      details: result.details
    };
  }
  ChatAgentResult2.from = from;
  function reviveMetadata(metadata) {
    return cloneAndChange(metadata, (value) => {
      if (value.$mid === MarshalledId.LanguageModelToolResult) {
        return new types.LanguageModelToolResult(cloneAndChange(value.content, reviveMetadata));
      } else if (value.$mid === MarshalledId.LanguageModelTextPart) {
        return new types.LanguageModelTextPart(value.value);
      } else if (value.$mid === MarshalledId.LanguageModelThinkingPart) {
        return new types.LanguageModelThinkingPart(value.value, value.id, value.metadata);
      } else if (value.$mid === MarshalledId.LanguageModelPromptTsxPart) {
        return new types.LanguageModelPromptTsxPart(value.value);
      } else if (value.$mid === MarshalledId.LanguageModelDataPart) {
        let buffer;
        if (value.data && typeof value.data === "object" && value.data.type === "Buffer" && Array.isArray(value.data.data)) {
          buffer = new Uint8Array(value.data.data);
        } else if (typeof value.data === "string") {
          try {
            buffer = decodeBase64(value.data).buffer;
          } catch {
            buffer = new Uint8Array(0);
          }
        } else {
          buffer = new Uint8Array(0);
        }
        return new types.LanguageModelDataPart(buffer, value.mimeType, value.audience);
      }
      return void 0;
    });
  }
})(ChatAgentResult || (ChatAgentResult = {}));
var ChatAgentUserActionEvent;
((ChatAgentUserActionEvent2) => {
  function to(result, event, commandsConverter) {
    if (event.action.kind === "vote") {
      return;
    }
    const ehResult = ChatAgentResult.to(result);
    if (event.action.kind === "command") {
      const command = event.action.commandButton.command;
      const commandButton = {
        command: commandsConverter.fromInternal(command) ?? { command: command.id, title: command.title }
      };
      const commandAction = { kind: "command", commandButton };
      return { action: commandAction, result: ehResult };
    } else if (event.action.kind === "followUp") {
      const followupAction = { kind: "followUp", followup: ChatFollowup.to(event.action.followup) };
      return { action: followupAction, result: ehResult };
    } else if (event.action.kind === "inlineChat") {
      return { action: { kind: "editor", accepted: event.action.action === "accepted" }, result: ehResult };
    } else if (event.action.kind === "chatEditingSessionAction") {
      const outcomes = /* @__PURE__ */ new Map([
        ["accepted", types.ChatEditingSessionActionOutcome.Accepted],
        ["rejected", types.ChatEditingSessionActionOutcome.Rejected],
        ["saved", types.ChatEditingSessionActionOutcome.Saved]
      ]);
      return {
        action: {
          kind: "chatEditingSessionAction",
          outcome: outcomes.get(event.action.outcome) ?? types.ChatEditingSessionActionOutcome.Rejected,
          uri: URI.revive(event.action.uri),
          hasRemainingEdits: event.action.hasRemainingEdits
        },
        result: ehResult
      };
    } else if (event.action.kind === "chatEditingHunkAction") {
      const outcomes = /* @__PURE__ */ new Map([
        ["accepted", types.ChatEditingSessionActionOutcome.Accepted],
        ["rejected", types.ChatEditingSessionActionOutcome.Rejected]
      ]);
      return {
        action: {
          kind: "chatEditingHunkAction",
          outcome: outcomes.get(event.action.outcome) ?? types.ChatEditingSessionActionOutcome.Rejected,
          uri: URI.revive(event.action.uri),
          hasRemainingEdits: event.action.hasRemainingEdits,
          lineCount: event.action.lineCount,
          linesAdded: event.action.linesAdded,
          linesRemoved: event.action.linesRemoved
        },
        result: ehResult
      };
    } else {
      return { action: event.action, result: ehResult };
    }
  }
  ChatAgentUserActionEvent2.to = to;
})(ChatAgentUserActionEvent || (ChatAgentUserActionEvent = {}));
var TerminalQuickFix;
((TerminalQuickFix2) => {
  function from(quickFix, converter, disposables) {
    if ("terminalCommand" in quickFix) {
      return { terminalCommand: quickFix.terminalCommand, shouldExecute: quickFix.shouldExecute };
    }
    if ("uri" in quickFix) {
      return { uri: quickFix.uri };
    }
    return converter.toInternal(quickFix, disposables);
  }
  TerminalQuickFix2.from = from;
})(TerminalQuickFix || (TerminalQuickFix = {}));
var TerminalCompletionItemDto;
((TerminalCompletionItemDto2) => {
  function from(item) {
    return {
      ...item,
      documentation: MarkdownString.fromStrict(item.documentation)
    };
  }
  TerminalCompletionItemDto2.from = from;
})(TerminalCompletionItemDto || (TerminalCompletionItemDto = {}));
var TerminalCompletionList;
((TerminalCompletionList2) => {
  function from(completions, pathSeparator) {
    if (Array.isArray(completions)) {
      return {
        items: completions.map((i) => TerminalCompletionItemDto.from(i))
      };
    }
    return {
      items: completions.items.map((i) => TerminalCompletionItemDto.from(i)),
      resourceOptions: completions.resourceOptions ? TerminalCompletionResourceOptions.from(completions.resourceOptions, pathSeparator) : void 0
    };
  }
  TerminalCompletionList2.from = from;
})(TerminalCompletionList || (TerminalCompletionList = {}));
var TerminalCompletionResourceOptions;
((TerminalCompletionResourceOptions2) => {
  function from(resourceOptions, pathSeparator) {
    return {
      ...resourceOptions,
      pathSeparator,
      cwd: resourceOptions.cwd,
      globPattern: GlobPattern.from(resourceOptions.globPattern) ?? void 0
    };
  }
  TerminalCompletionResourceOptions2.from = from;
})(TerminalCompletionResourceOptions || (TerminalCompletionResourceOptions = {}));
var PartialAcceptInfo;
((PartialAcceptInfo2) => {
  function to(info) {
    return {
      kind: PartialAcceptTriggerKind.to(info.kind),
      acceptedLength: info.acceptedLength
    };
  }
  PartialAcceptInfo2.to = to;
})(PartialAcceptInfo || (PartialAcceptInfo = {}));
var PartialAcceptTriggerKind;
((PartialAcceptTriggerKind2) => {
  function to(kind) {
    switch (kind) {
      case languages.PartialAcceptTriggerKind.Word:
        return types.PartialAcceptTriggerKind.Word;
      case languages.PartialAcceptTriggerKind.Line:
        return types.PartialAcceptTriggerKind.Line;
      case languages.PartialAcceptTriggerKind.Suggest:
        return types.PartialAcceptTriggerKind.Suggest;
      default:
        return types.PartialAcceptTriggerKind.Unknown;
    }
  }
  PartialAcceptTriggerKind2.to = to;
})(PartialAcceptTriggerKind || (PartialAcceptTriggerKind = {}));
var InlineCompletionEndOfLifeReason;
((InlineCompletionEndOfLifeReason2) => {
  function to(reason, convertFn) {
    if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Ignored) {
      const supersededBy = reason.supersededBy ? convertFn(reason.supersededBy) : void 0;
      return {
        kind: types.InlineCompletionEndOfLifeReasonKind.Ignored,
        supersededBy,
        userTypingDisagreed: reason.userTypingDisagreed
      };
    } else if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Accepted) {
      return {
        kind: types.InlineCompletionEndOfLifeReasonKind.Accepted
      };
    }
    return {
      kind: types.InlineCompletionEndOfLifeReasonKind.Rejected
    };
  }
  InlineCompletionEndOfLifeReason2.to = to;
})(InlineCompletionEndOfLifeReason || (InlineCompletionEndOfLifeReason = {}));
var InlineCompletionHintStyle;
((InlineCompletionHintStyle2) => {
  function from(value) {
    if (value === types.InlineCompletionDisplayLocationKind.Label) {
      return languages.InlineCompletionHintStyle.Label;
    } else {
      return languages.InlineCompletionHintStyle.Code;
    }
  }
  InlineCompletionHintStyle2.from = from;
  function to(kind) {
    switch (kind) {
      case languages.InlineCompletionHintStyle.Label:
        return types.InlineCompletionDisplayLocationKind.Label;
      default:
        return types.InlineCompletionDisplayLocationKind.Code;
    }
  }
  InlineCompletionHintStyle2.to = to;
})(InlineCompletionHintStyle || (InlineCompletionHintStyle = {}));
var DebugTreeItem;
((DebugTreeItem2) => {
  function from(item, id) {
    return {
      id,
      label: item.label,
      description: item.description,
      canEdit: item.canEdit,
      collapsibleState: item.collapsibleState || DebugTreeItemCollapsibleState.None,
      contextValue: item.contextValue
    };
  }
  DebugTreeItem2.from = from;
})(DebugTreeItem || (DebugTreeItem = {}));
var LanguageModelToolSource;
((LanguageModelToolSource2) => {
  function to(source) {
    if (source.type === "mcp") {
      return new types.LanguageModelToolMCPSource(source.label, source.serverLabel || source.label, source.instructions);
    } else if (source.type === "extension") {
      return new types.LanguageModelToolExtensionSource(source.extensionId.value, source.label);
    } else {
      return void 0;
    }
  }
  LanguageModelToolSource2.to = to;
})(LanguageModelToolSource || (LanguageModelToolSource = {}));
var LanguageModelToolResult;
((LanguageModelToolResult2) => {
  function to(result) {
    const toolResult = new types.LanguageModelToolResult(result.content.map((item) => {
      if (item.kind === "text") {
        return new types.LanguageModelTextPart(item.value, item.audience);
      } else if (item.kind === "data") {
        return new types.LanguageModelDataPart(item.value.data.buffer, item.value.mimeType, item.audience);
      } else {
        return new types.LanguageModelPromptTsxPart(item.value);
      }
    }));
    if (result.toolMetadata !== void 0) {
      toolResult.toolMetadata = result.toolMetadata;
    }
    if (result.toolResultError) {
      toolResult.hasError = !!result.toolResultError;
    }
    return toolResult;
  }
  LanguageModelToolResult2.to = to;
  function from(result, extension) {
    if (result.toolResultMessage) {
      checkProposedApiEnabled(extension, "chatParticipantPrivate");
    }
    const checkAudienceApi = (item) => {
      if (item.audience) {
        checkProposedApiEnabled(extension, "languageModelToolResultAudience");
      }
    };
    let hasBuffers = false;
    let detailsDto = void 0;
    if (Array.isArray(result.toolResultDetails)) {
      detailsDto = result.toolResultDetails?.map((detail) => {
        return URI.isUri(detail) ? detail : Location.from(detail);
      });
    } else {
      if (result.toolResultDetails2) {
        detailsDto = {
          output: {
            type: "data",
            mimeType: result.toolResultDetails2.mime,
            value: VSBuffer.wrap(result.toolResultDetails2.value)
          }
        };
        hasBuffers = true;
      }
    }
    const dto = {
      content: result.content.map((item) => {
        if (item instanceof types.LanguageModelTextPart) {
          checkAudienceApi(item);
          return {
            kind: "text",
            value: item.value,
            audience: item.audience
          };
        } else if (item instanceof types.LanguageModelPromptTsxPart) {
          return {
            kind: "promptTsx",
            value: item.value
          };
        } else if (item instanceof types.LanguageModelDataPart) {
          checkAudienceApi(item);
          hasBuffers = true;
          return {
            kind: "data",
            value: {
              mimeType: item.mimeType,
              data: VSBuffer.wrap(item.data)
            },
            audience: item.audience
          };
        } else {
          throw new Error("Unknown LanguageModelToolResult part type");
        }
      }),
      toolResultMessage: MarkdownString.fromStrict(result.toolResultMessage),
      toolResultDetails: detailsDto,
      toolMetadata: result.toolMetadata,
      toolResultError: result.hasError
    };
    return hasBuffers ? new SerializableObjectWithBuffers(dto) : dto;
  }
  LanguageModelToolResult2.from = from;
})(LanguageModelToolResult || (LanguageModelToolResult = {}));
var IconPath;
((IconPath2) => {
  function fromThemeIcon(iconPath) {
    return iconPath;
  }
  IconPath2.fromThemeIcon = fromThemeIcon;
  function from(value) {
    if (!value) {
      return void 0;
    } else if (ThemeIcon.isThemeIcon(value)) {
      return value;
    } else if (URI.isUri(value)) {
      return value;
    } else if (typeof value === "string") {
      return URI.file(value);
    } else if (typeof value === "object" && value !== null && "dark" in value) {
      const dark = typeof value.dark === "string" ? URI.file(value.dark) : value.dark;
      const light = typeof value.light === "string" ? URI.file(value.light) : value.light;
      return !dark ? void 0 : { dark, light: light ?? dark };
    } else {
      return void 0;
    }
  }
  IconPath2.from = from;
  function to(value) {
    if (!value) {
      return void 0;
    } else if (ThemeIcon.isThemeIcon(value)) {
      return value;
    } else if (isUriComponents(value)) {
      return URI.revive(value);
    } else {
      const icon = value;
      return {
        light: URI.revive(icon.light),
        dark: URI.revive(icon.dark)
      };
    }
  }
  IconPath2.to = to;
})(IconPath || (IconPath = {}));
var AiSettingsSearch;
((AiSettingsSearch2) => {
  function fromSettingsSearchResult(result) {
    return {
      query: result.query,
      kind: fromSettingsSearchResultKind(result.kind),
      settings: result.settings
    };
  }
  AiSettingsSearch2.fromSettingsSearchResult = fromSettingsSearchResult;
  function fromSettingsSearchResultKind(kind) {
    switch (kind) {
      case AiSettingsSearchResultKind.EMBEDDED:
        return AiSettingsSearchResultKind.EMBEDDED;
      case AiSettingsSearchResultKind.LLM_RANKED:
        return AiSettingsSearchResultKind.LLM_RANKED;
      case AiSettingsSearchResultKind.CANCELED:
        return AiSettingsSearchResultKind.CANCELED;
      default:
        throw new Error("Unknown AiSettingsSearchResultKind");
    }
  }
})(AiSettingsSearch || (AiSettingsSearch = {}));
var McpServerDefinition;
((McpServerDefinition2) => {
  function isHttpConfig(candidate) {
    return !!candidate.uri;
  }
  function from(item) {
    return McpServerLaunch.toSerialized(
      isHttpConfig(item) ? {
        type: McpServerTransportType.HTTP,
        uri: item.uri,
        headers: Object.entries(item.headers),
        authentication: item.authentication ? {
          providerId: item.authentication.providerId,
          scopes: item.authentication.scopes
        } : void 0
      } : {
        type: McpServerTransportType.Stdio,
        cwd: item.cwd?.fsPath,
        args: item.args,
        command: item.command,
        env: item.env,
        envFile: void 0,
        sandbox: void 0
      }
    );
  }
  McpServerDefinition2.from = from;
  function to(dto) {
    const launch = McpServerLaunch.fromSerialized(dto.launch);
    if (launch.type === McpServerTransportType.HTTP) {
      return new types.McpHttpServerDefinition(
        dto.label,
        launch.uri,
        Object.fromEntries(launch.headers),
        dto.cacheNonce === "$$NONE" ? void 0 : dto.cacheNonce
      );
    } else {
      const result = new types.McpStdioServerDefinition(
        dto.label,
        launch.command,
        [...launch.args],
        Object.fromEntries(Object.entries(launch.env).map(([key, value]) => [key, value === null ? null : String(value)])),
        dto.cacheNonce === "$$NONE" ? void 0 : dto.cacheNonce
      );
      if (launch.cwd) {
        result.cwd = URI.file(launch.cwd);
      }
      return result;
    }
  }
  McpServerDefinition2.to = to;
})(McpServerDefinition || (McpServerDefinition = {}));
var SourceControlInputBoxValidationType;
((SourceControlInputBoxValidationType2) => {
  function from(type) {
    switch (type) {
      case types.SourceControlInputBoxValidationType.Error:
        return InputValidationType.Error;
      case types.SourceControlInputBoxValidationType.Warning:
        return InputValidationType.Warning;
      case types.SourceControlInputBoxValidationType.Information:
        return InputValidationType.Information;
      default:
        throw new Error("Unknown SourceControlInputBoxValidationType");
    }
  }
  SourceControlInputBoxValidationType2.from = from;
})(SourceControlInputBoxValidationType || (SourceControlInputBoxValidationType = {}));
var ChatRequestHooksConverter;
((ChatRequestHooksConverter2) => {
  function to(hooks) {
    const result = {};
    for (const [hookType, commands] of Object.entries(hooks)) {
      if (!commands || commands.length === 0) {
        continue;
      }
      const converted = [];
      for (const cmd of commands) {
        const resolved = ChatHookCommand.to(cmd);
        if (resolved) {
          converted.push(resolved);
        }
      }
      if (converted.length > 0) {
        result[hookType] = converted;
      }
    }
    return result;
  }
  ChatRequestHooksConverter2.to = to;
})(ChatRequestHooksConverter || (ChatRequestHooksConverter = {}));
var ChatHookCommand;
((ChatHookCommand2) => {
  function to(hook) {
    const command = resolveEffectiveCommand(hook, OS);
    if (!command) {
      return void 0;
    }
    return {
      command,
      cwd: hook.cwd,
      env: hook.env,
      timeout: hook.timeout
    };
  }
  ChatHookCommand2.to = to;
})(ChatHookCommand || (ChatHookCommand = {}));
var ChatSessionItem;
((ChatSessionItem2) => {
  function convertStatus(status) {
    if (status === void 0) {
      return void 0;
    }
    switch (status) {
      case 0:
        return ChatSessionStatus.Failed;
      case 1:
        return ChatSessionStatus.Completed;
      case 2:
        return ChatSessionStatus.InProgress;
      case 3:
        return ChatSessionStatus.NeedsInput;
      default:
        return void 0;
    }
  }
  function from(sessionContent) {
    const timing = sessionContent.timing;
    const created = timing?.created ?? timing?.startTime ?? 0;
    const lastRequestStarted = timing?.lastRequestStarted ?? timing?.startTime;
    const lastRequestEnded = timing?.lastRequestEnded ?? timing?.endTime;
    return {
      resource: sessionContent.resource,
      label: sessionContent.label,
      description: sessionContent.description ? MarkdownString.from(sessionContent.description) : void 0,
      badge: sessionContent.badge ? MarkdownString.from(sessionContent.badge) : void 0,
      status: convertStatus(sessionContent.status),
      archived: sessionContent.archived,
      tooltip: MarkdownString.fromStrict(sessionContent.tooltip),
      timing: {
        created,
        lastRequestStarted,
        lastRequestEnded
      },
      changes: sessionContent.changes instanceof Array ? sessionContent.changes : void 0,
      metadata: sessionContent.metadata,
      legacyResource: sessionContent.legacyResource
    };
  }
  ChatSessionItem2.from = from;
})(ChatSessionItem || (ChatSessionItem = {}));
export {
  AiSettingsSearch,
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  ChatAgentCompletionItem,
  ChatAgentRequest,
  ChatAgentResult,
  ChatAgentUserActionEvent,
  ChatFollowup,
  ChatHookCommand,
  ChatLanguageModelToolReference,
  ChatLocation,
  ChatPromptReference,
  ChatRequestHooksConverter,
  ChatRequestModeInstructions,
  ChatResponseAnchorPart,
  ChatResponseAutoModeResolutionPart,
  ChatResponseCodeCitationPart,
  ChatResponseCodeblockUriPart,
  ChatResponseCommandButtonPart,
  ChatResponseConfirmationPart,
  ChatResponseExtensionsPart,
  ChatResponseFilesPart,
  ChatResponseHookPart,
  ChatResponseInfoPart,
  ChatResponseMarkdownPart,
  ChatResponseMarkdownWithVulnerabilitiesPart,
  ChatResponseMovePart,
  ChatResponseMultiDiffPart,
  ChatResponseNotebookEditPart,
  ChatResponsePart,
  ChatResponseProgressPart,
  ChatResponsePullRequestPart,
  ChatResponseQuestionCarouselPart,
  ChatResponseReferencePart,
  ChatResponseTextEditPart,
  ChatResponseThinkingProgressPart,
  ChatResponseVoiceProgressPart,
  ChatResponseWarningPart,
  ChatResponseWorkspaceEditPart,
  ChatSessionCustomizationType,
  ChatSessionItem,
  ChatTask,
  ChatTaskResult,
  ChatToolInvocationPart,
  CodeActionTriggerKind,
  Color,
  ColorPresentation,
  CompletionCommand,
  CompletionContext,
  CompletionItem,
  CompletionItemKind,
  CompletionItemTag,
  CompletionTriggerKind,
  DataTransfer,
  DataTransferItem,
  DebugTreeItem,
  DecorationRangeBehavior,
  DecorationRenderOptions,
  DefinitionLink,
  Diagnostic,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag,
  DocumentHighlight,
  DocumentLink,
  DocumentSelector,
  DocumentSymbol,
  EndOfLine,
  EvaluatableExpression,
  FoldingRange,
  FoldingRangeKind,
  GlobPattern,
  Hover,
  IconPath,
  InlayHint,
  InlayHintKind,
  InlayHintLabelPart,
  InlineCompletionEndOfLifeReason,
  InlineCompletionHintStyle,
  InlineValue,
  InlineValueContext,
  LanguageModelChatMessage,
  LanguageModelChatMessage2,
  LanguageModelChatMessageRole,
  LanguageModelToolResult,
  LanguageModelToolSource,
  LanguageSelector,
  Location,
  MarkdownString,
  McpServerDefinition,
  MultiDocumentHighlight,
  NotebookCellData,
  NotebookCellExecutionSummary,
  NotebookCellKind,
  NotebookCellOutput,
  NotebookCellOutputItem,
  NotebookData,
  NotebookDocumentContentOptions,
  NotebookEdit,
  NotebookExclusiveDocumentPattern,
  NotebookKernelSourceAction,
  NotebookRange,
  NotebookRendererScript,
  NotebookStatusBarItem,
  ParameterInformation,
  PartialAcceptInfo,
  PartialAcceptTriggerKind,
  Position,
  ProgressLocation,
  Range,
  Selection,
  SelectionRange,
  SignatureHelp,
  SignatureInformation,
  SourceControlInputBoxValidationType,
  SymbolKind,
  SymbolTag,
  TabSelector,
  TerminalCompletionItemDto,
  TerminalCompletionList,
  TerminalCompletionResourceOptions,
  TerminalQuickFix,
  TestCoverage,
  TestItem,
  TestMessage,
  TestResults,
  TestRunProfile,
  TestRunProfileKind,
  TestTag,
  TextDocumentSaveReason,
  TextEdit,
  TextEditorLineNumbersStyle,
  TextEditorOpenOptions,
  ThemableDecorationAttachmentRenderOptions,
  ThemableDecorationRenderOptions,
  TokenType,
  TypeHierarchyItem,
  ViewBadge,
  ViewColumn,
  WorkspaceEdit,
  WorkspaceSymbol,
  fromRangeOrRangeWithMessage,
  isDecorationOptionsArr,
  location,
  pathOrURIToURI
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0VHlwZUNvbnZlcnRlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgYXNBcnJheSwgY29hbGVzY2UsIGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciwgZGVjb2RlQmFzZTY0LCBlbmNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGF0YVRyYW5zZmVyRmlsZSwgSURhdGFUcmFuc2Zlckl0ZW0sIFVyaUxpc3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRhVHJhbnNmZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZnVuY3Rpb25hbC5qcyc7XG5pbXBvcnQgKiBhcyBodG1sQ29udGVudCBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCAqIGFzIG1hcmtlZCBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IHBhcnNlLCByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgY2xvbmVBbmRDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVByZWZpeFRyZWVOb2RlLCBXZWxsRGVmaW5lZFByZWZpeFRyZWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcmVmaXhUcmVlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIGlzRW1wdHlPYmplY3QsIGlzTnVtYmVyLCBpc1N0cmluZywgaXNVbmRlZmluZWRPck51bGwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMsIGlzVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVVJJVHJhbnNmb3JtZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmlJcGMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBSZW5kZXJMaW5lTnVtYmVyc1R5cGUgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBlZGl0b3JSYW5nZSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRlbnREZWNvcmF0aW9uUmVuZGVyT3B0aW9ucywgSURlY29yYXRpb25PcHRpb25zLCBJRGVjb3JhdGlvblJlbmRlck9wdGlvbnMsIElUaGVtZURlY29yYXRpb25SZW5kZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0ICogYXMgZW5jb2RlZFRva2VuQXR0cmlidXRlcyBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VTZWxlY3RvciBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlU2VsZWN0b3IuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVNlcXVlbmNlLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1hcmtlckRhdGEsIElSZWxhdGVkSW5mb3JtYXRpb24sIE1hcmtlclNldmVyaXR5LCBNYXJrZXJUYWcgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IFByb2dyZXNzTG9jYXRpb24gYXMgTWFpblByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04sIFNhdmVSZWFzb24gfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElWaWV3QmFkZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFJlcXVlc3QsIElDaGF0QWdlbnRSZXN1bHQgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50TWFya2Rvd25Db250ZW50V2l0aFZ1bG5lcmFiaWxpdHksIElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydCwgSUNoYXRDb2RlQ2l0YXRpb24sIElDaGF0Q29tbWFuZEJ1dHRvbiwgSUNoYXRDb25maXJtYXRpb24sIElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZSwgSUNoYXRDb250ZW50UmVmZXJlbmNlLCBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LCBJQ2hhdEV4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUsIElDaGF0Rm9sbG93dXAsIElDaGF0SG9va1BhcnQsIElDaGF0TWFya2Rvd25Db250ZW50LCBJQ2hhdE1vdmVNZXNzYWdlLCBJQ2hhdE11bHRpRGlmZkRhdGFTZXJpYWxpemVkLCBJQ2hhdFByb2dyZXNzTWVzc2FnZSwgSUNoYXRQdWxsUmVxdWVzdENvbnRlbnQsIElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgSUNoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQsIElDaGF0VGFza0R0bywgSUNoYXRUYXNrUmVzdWx0LCBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLCBJQ2hhdFRleHRFZGl0LCBJQ2hhdFRoaW5raW5nUGFydCwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIElDaGF0VHJlZURhdGEsIElDaGF0VXNlckFjdGlvbkV2ZW50LCBJQ2hhdFZvaWNlUHJvZ3Jlc3NQYXJ0LCBJQ2hhdFdhcm5pbmdNZXNzYWdlLCBJQ2hhdEluZm9NZXNzYWdlLCBJQ2hhdFdvcmtzcGFjZUVkaXQgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzRWxlbWVudFZhcmlhYmxlRW50cnksIGlzSW1hZ2VWYXJpYWJsZUVudHJ5LCBpc1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5LCBpc1Byb21wdFRleHRWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IGNvZXJjZUltYWdlQnVmZmVyIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0SW1hZ2VFeHRyYWN0aW9uLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uU3RhdHVzLCBJQ2hhdFNlc3Npb25JdGVtIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RIb29rcywgcmVzb2x2ZUVmZmVjdGl2ZUNvbW1hbmQgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IHR5cGUgSVBhcnNlZEhvb2tDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcbmltcG9ydCB7IElUb29sSW52b2NhdGlvbkNvbnRleHQsIElUb29sUmVzdWx0LCBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscywgSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzLCBUb29sRGF0YVNvdXJjZSwgVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0ICogYXMgY2hhdFByb3ZpZGVyIGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNZXNzYWdlRGF0YVBhcnQsIElDaGF0UmVzcG9uc2VEYXRhUGFydCwgSUNoYXRSZXNwb25zZVByb21wdFRzeFBhcnQsIElDaGF0UmVzcG9uc2VUZXh0UGFydCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgRGVidWdUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUsIElEZWJ1Z1Zpc3VhbGl6YXRpb25UcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvZGVidWcvY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlckRlZmluaXRpb24gYXMgTWNwU2VydmVyRGVmaW5pdGlvblR5cGUsIE1jcFNlcnZlckxhdW5jaCwgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBub3RlYm9va3MgZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUNlbGxSYW5nZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rUmFuZ2UuanMnO1xuaW1wb3J0IHsgSW5wdXRWYWxpZGF0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2NtL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0ICogYXMgc2VhcmNoIGZyb20gJy4uLy4uL2NvbnRyaWIvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgVGVzdElkIH0gZnJvbSAnLi4vLi4vY29udHJpYi90ZXN0aW5nL2NvbW1vbi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgQ292ZXJhZ2VEZXRhaWxzLCBEZXRhaWxUeXBlLCBJQ292ZXJhZ2VDb3VudCwgSUZpbGVDb3ZlcmFnZSwgSVNlcmlhbGl6ZWRUZXN0UmVzdWx0cywgSVRlc3RFcnJvck1lc3NhZ2UsIElUZXN0SXRlbSwgSVRlc3RSdW5Qcm9maWxlUmVmZXJlbmNlLCBJVGVzdFRhZywgVGVzdE1lc3NhZ2VUeXBlLCBUZXN0UmVzdWx0SXRlbSwgVGVzdFJ1blByb2ZpbGVCaXRzZXQsIGRlbmFtZXNwYWNlVGVzdFRhZywgbmFtZXNwYWNlVGVzdFRhZyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGVzdGluZy9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCB7IEFpU2V0dGluZ3NTZWFyY2hSZXN1bHQsIEFpU2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYWlTZXR0aW5nc1NlYXJjaC9jb21tb24vYWlTZXR0aW5nc1NlYXJjaC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cENvbHVtbiB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBDb2x1bW4uanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkLCBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRHRvLCBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0UHJvdG9jb2wgZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENvbW1hbmRzQ29udmVydGVyIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgZ2V0UHJpdmF0ZUFwaUZvciB9IGZyb20gJy4vZXh0SG9zdFRlc3RpbmdQcml2YXRlQXBpLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxEYXRhUGFydCwgTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQsIExhbmd1YWdlTW9kZWxUZXh0UGFydCB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcblxuZXhwb3J0IG5hbWVzcGFjZSBDb21tYW5kIHtcblxuXHRleHBvcnQgaW50ZXJmYWNlIElDb21tYW5kc0NvbnZlcnRlciB7XG5cdFx0ZnJvbUludGVybmFsKGNvbW1hbmQ6IGV4dEhvc3RQcm90b2NvbC5JQ29tbWFuZER0byk6IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkO1xuXHRcdHRvSW50ZXJuYWwoY29tbWFuZDogdnNjb2RlLkNvbW1hbmQgfCB1bmRlZmluZWQsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBleHRIb3N0UHJvdG9jb2wuSUNvbW1hbmREdG8gfCB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBQb3NpdGlvbkxpa2Uge1xuXHRsaW5lOiBudW1iZXI7XG5cdGNoYXJhY3RlcjogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJhbmdlTGlrZSB7XG5cdHN0YXJ0OiBQb3NpdGlvbkxpa2U7XG5cdGVuZDogUG9zaXRpb25MaWtlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGlvbkxpa2UgZXh0ZW5kcyBSYW5nZUxpa2Uge1xuXHRhbmNob3I6IFBvc2l0aW9uTGlrZTtcblx0YWN0aXZlOiBQb3NpdGlvbkxpa2U7XG59XG5leHBvcnQgbmFtZXNwYWNlIFNlbGVjdGlvbiB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHNlbGVjdGlvbjogSVNlbGVjdGlvbik6IHR5cGVzLlNlbGVjdGlvbiB7XG5cdFx0Y29uc3QgeyBzZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsIHNlbGVjdGlvblN0YXJ0Q29sdW1uLCBwb3NpdGlvbkxpbmVOdW1iZXIsIHBvc2l0aW9uQ29sdW1uIH0gPSBzZWxlY3Rpb247XG5cdFx0Y29uc3Qgc3RhcnQgPSBuZXcgdHlwZXMuUG9zaXRpb24oc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyIC0gMSwgc2VsZWN0aW9uU3RhcnRDb2x1bW4gLSAxKTtcblx0XHRjb25zdCBlbmQgPSBuZXcgdHlwZXMuUG9zaXRpb24ocG9zaXRpb25MaW5lTnVtYmVyIC0gMSwgcG9zaXRpb25Db2x1bW4gLSAxKTtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLlNlbGVjdGlvbihzdGFydCwgZW5kKTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHNlbGVjdGlvbjogU2VsZWN0aW9uTGlrZSk6IElTZWxlY3Rpb24ge1xuXHRcdGNvbnN0IHsgYW5jaG9yLCBhY3RpdmUgfSA9IHNlbGVjdGlvbjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyOiBhbmNob3IubGluZSArIDEsXG5cdFx0XHRzZWxlY3Rpb25TdGFydENvbHVtbjogYW5jaG9yLmNoYXJhY3RlciArIDEsXG5cdFx0XHRwb3NpdGlvbkxpbmVOdW1iZXI6IGFjdGl2ZS5saW5lICsgMSxcblx0XHRcdHBvc2l0aW9uQ29sdW1uOiBhY3RpdmUuY2hhcmFjdGVyICsgMVxuXHRcdH07XG5cdH1cbn1cbmV4cG9ydCBuYW1lc3BhY2UgUmFuZ2Uge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHJhbmdlOiB1bmRlZmluZWQpOiB1bmRlZmluZWQ7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHJhbmdlOiBSYW5nZUxpa2UpOiBlZGl0b3JSYW5nZS5JUmFuZ2U7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHJhbmdlOiBSYW5nZUxpa2UgfCB1bmRlZmluZWQpOiBlZGl0b3JSYW5nZS5JUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHJhbmdlOiBSYW5nZUxpa2UgfCB1bmRlZmluZWQpOiBlZGl0b3JSYW5nZS5JUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHsgc3RhcnQsIGVuZCB9ID0gcmFuZ2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnQubGluZSArIDEsXG5cdFx0XHRzdGFydENvbHVtbjogc3RhcnQuY2hhcmFjdGVyICsgMSxcblx0XHRcdGVuZExpbmVOdW1iZXI6IGVuZC5saW5lICsgMSxcblx0XHRcdGVuZENvbHVtbjogZW5kLmNoYXJhY3RlciArIDFcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJhbmdlOiB1bmRlZmluZWQpOiB0eXBlcy5SYW5nZTtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJhbmdlOiBlZGl0b3JSYW5nZS5JUmFuZ2UpOiB0eXBlcy5SYW5nZTtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJhbmdlOiBlZGl0b3JSYW5nZS5JUmFuZ2UgfCB1bmRlZmluZWQpOiB0eXBlcy5SYW5nZSB8IHVuZGVmaW5lZDtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJhbmdlOiBlZGl0b3JSYW5nZS5JUmFuZ2UgfCB1bmRlZmluZWQpOiB0eXBlcy5SYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgeyBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4gfSA9IHJhbmdlO1xuXHRcdHJldHVybiBuZXcgdHlwZXMuUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyIC0gMSwgc3RhcnRDb2x1bW4gLSAxLCBlbmRMaW5lTnVtYmVyIC0gMSwgZW5kQ29sdW1uIC0gMSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBMb2NhdGlvbiB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20obG9jYXRpb246IHZzY29kZS5Mb2NhdGlvbik6IER0bzxsYW5ndWFnZXMuTG9jYXRpb24+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBsb2NhdGlvbi51cmksXG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShsb2NhdGlvbi5yYW5nZSlcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGxvY2F0aW9uOiBEdG88bGFuZ3VhZ2VzLkxvY2F0aW9uPik6IHZzY29kZS5Mb2NhdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihVUkkucmV2aXZlKGxvY2F0aW9uLnVyaSksIFJhbmdlLnRvKGxvY2F0aW9uLnJhbmdlKSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUb2tlblR5cGUge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8odHlwZTogZW5jb2RlZFRva2VuQXR0cmlidXRlcy5TdGFuZGFyZFRva2VuVHlwZSk6IHR5cGVzLlN0YW5kYXJkVG9rZW5UeXBlIHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgZW5jb2RlZFRva2VuQXR0cmlidXRlcy5TdGFuZGFyZFRva2VuVHlwZS5Db21tZW50OiByZXR1cm4gdHlwZXMuU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudDtcblx0XHRcdGNhc2UgZW5jb2RlZFRva2VuQXR0cmlidXRlcy5TdGFuZGFyZFRva2VuVHlwZS5PdGhlcjogcmV0dXJuIHR5cGVzLlN0YW5kYXJkVG9rZW5UeXBlLk90aGVyO1xuXHRcdFx0Y2FzZSBlbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLlN0YW5kYXJkVG9rZW5UeXBlLlJlZ0V4OiByZXR1cm4gdHlwZXMuU3RhbmRhcmRUb2tlblR5cGUuUmVnRXg7XG5cdFx0XHRjYXNlIGVuY29kZWRUb2tlbkF0dHJpYnV0ZXMuU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nOiByZXR1cm4gdHlwZXMuU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFBvc2l0aW9uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBvc2l0aW9uOiBJUG9zaXRpb24pOiB0eXBlcy5Qb3NpdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5Qb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyIC0gMSwgcG9zaXRpb24uY29sdW1uIC0gMSk7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocG9zaXRpb246IHR5cGVzLlBvc2l0aW9uIHwgdnNjb2RlLlBvc2l0aW9uKTogSVBvc2l0aW9uIHtcblx0XHRyZXR1cm4geyBsaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lICsgMSwgY29sdW1uOiBwb3NpdGlvbi5jaGFyYWN0ZXIgKyAxIH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBEb2N1bWVudFNlbGVjdG9yIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHVyaVRyYW5zZm9ybWVyPzogSVVSSVRyYW5zZm9ybWVyLCBleHRlbnNpb24/OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBleHRIb3N0UHJvdG9jb2wuSURvY3VtZW50RmlsdGVyRHRvW10ge1xuXHRcdHJldHVybiBjb2FsZXNjZShhc0FycmF5KHZhbHVlKS5tYXAoc2VsID0+IF9kb1RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsLCB1cmlUcmFuc2Zvcm1lciwgZXh0ZW5zaW9uKSkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gX2RvVHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3Rvcjogc3RyaW5nIHwgdnNjb2RlLkRvY3VtZW50RmlsdGVyLCB1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgdW5kZWZpbmVkLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZCk6IGV4dEhvc3RQcm90b2NvbC5JRG9jdW1lbnRGaWx0ZXJEdG8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2Ygc2VsZWN0b3IgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQkc2VyaWFsaXplZDogdHJ1ZSxcblx0XHRcdFx0bGFuZ3VhZ2U6IHNlbGVjdG9yLFxuXHRcdFx0XHRpc0J1aWx0aW46IGV4dGVuc2lvbj8uaXNCdWlsdGluLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoc2VsZWN0b3IpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdCRzZXJpYWxpemVkOiB0cnVlLFxuXHRcdFx0XHRsYW5ndWFnZTogc2VsZWN0b3IubGFuZ3VhZ2UsXG5cdFx0XHRcdHNjaGVtZTogX3RyYW5zZm9ybVNjaGVtZShzZWxlY3Rvci5zY2hlbWUsIHVyaVRyYW5zZm9ybWVyKSxcblx0XHRcdFx0cGF0dGVybjogR2xvYlBhdHRlcm4uZnJvbShzZWxlY3Rvci5wYXR0ZXJuKSA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdGV4Y2x1c2l2ZTogc2VsZWN0b3IuZXhjbHVzaXZlLFxuXHRcdFx0XHRub3RlYm9va1R5cGU6IHNlbGVjdG9yLm5vdGVib29rVHlwZSxcblx0XHRcdFx0aXNCdWlsdGluOiBleHRlbnNpb24/LmlzQnVpbHRpblxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZnVuY3Rpb24gX3RyYW5zZm9ybVNjaGVtZShzY2hlbWU6IHN0cmluZyB8IHVuZGVmaW5lZCwgdXJpVHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lciB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHVyaVRyYW5zZm9ybWVyICYmIHR5cGVvZiBzY2hlbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtT3V0Z29pbmdTY2hlbWUoc2NoZW1lKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNjaGVtZTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRhYlNlbGVjdG9yIHtcblxuXHRmdW5jdGlvbiBpc1ZpZXdUeXBlU2VsZWN0b3IodmFsdWU6IHZzY29kZS5UYWJTZWxlY3Rvcik6IHZhbHVlIGlzIHsgdmlld1R5cGU6IHN0cmluZyB9IHtcblx0XHRyZXR1cm4gKHZhbHVlIGFzIHsgdmlld1R5cGU/OiBzdHJpbmcgfSkudmlld1R5cGUgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuVGFiU2VsZWN0b3IsIHVyaVRyYW5zZm9ybWVyPzogSVVSSVRyYW5zZm9ybWVyLCBleHRlbnNpb24/OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBleHRIb3N0UHJvdG9jb2wuSVRhYlNlbGVjdG9yRHRvIHtcblx0XHRpZiAoaXNWaWV3VHlwZVNlbGVjdG9yKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHsgdmlld1R5cGU6IHZhbHVlLnZpZXdUeXBlIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHVyaTogRG9jdW1lbnRTZWxlY3Rvci5mcm9tKHZhbHVlLnVyaSwgdXJpVHJhbnNmb3JtZXIsIGV4dGVuc2lvbikgfTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIERpYWdub3N0aWNUYWcge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLkRpYWdub3N0aWNUYWcpOiBNYXJrZXJUYWcgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgdHlwZXMuRGlhZ25vc3RpY1RhZy5Vbm5lY2Vzc2FyeTpcblx0XHRcdFx0cmV0dXJuIE1hcmtlclRhZy5Vbm5lY2Vzc2FyeTtcblx0XHRcdGNhc2UgdHlwZXMuRGlhZ25vc3RpY1RhZy5EZXByZWNhdGVkOlxuXHRcdFx0XHRyZXR1cm4gTWFya2VyVGFnLkRlcHJlY2F0ZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBNYXJrZXJUYWcpOiB2c2NvZGUuRGlhZ25vc3RpY1RhZyB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSBNYXJrZXJUYWcuVW5uZWNlc3Nhcnk6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5EaWFnbm9zdGljVGFnLlVubmVjZXNzYXJ5O1xuXHRcdFx0Y2FzZSBNYXJrZXJUYWcuRGVwcmVjYXRlZDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkRpYWdub3N0aWNUYWcuRGVwcmVjYXRlZDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRGlhZ25vc3RpYyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuRGlhZ25vc3RpYyk6IElNYXJrZXJEYXRhIHtcblx0XHRsZXQgY29kZTogc3RyaW5nIHwgeyB2YWx1ZTogc3RyaW5nOyB0YXJnZXQ6IFVSSSB9IHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHZhbHVlLmNvZGUpIHtcblx0XHRcdGlmIChpc1N0cmluZyh2YWx1ZS5jb2RlKSB8fCBpc051bWJlcih2YWx1ZS5jb2RlKSkge1xuXHRcdFx0XHRjb2RlID0gU3RyaW5nKHZhbHVlLmNvZGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29kZSA9IHtcblx0XHRcdFx0XHR2YWx1ZTogU3RyaW5nKHZhbHVlLmNvZGUudmFsdWUpLFxuXHRcdFx0XHRcdHRhcmdldDogdmFsdWUuY29kZS50YXJnZXQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLlJhbmdlLmZyb20odmFsdWUucmFuZ2UpLFxuXHRcdFx0bWVzc2FnZTogdmFsdWUubWVzc2FnZSxcblx0XHRcdHNvdXJjZTogdmFsdWUuc291cmNlLFxuXHRcdFx0Y29kZSxcblx0XHRcdHNldmVyaXR5OiBEaWFnbm9zdGljU2V2ZXJpdHkuZnJvbSh2YWx1ZS5zZXZlcml0eSksXG5cdFx0XHRyZWxhdGVkSW5mb3JtYXRpb246IHZhbHVlLnJlbGF0ZWRJbmZvcm1hdGlvbiAmJiB2YWx1ZS5yZWxhdGVkSW5mb3JtYXRpb24ubWFwKERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24uZnJvbSksXG5cdFx0XHR0YWdzOiBBcnJheS5pc0FycmF5KHZhbHVlLnRhZ3MpID8gY29hbGVzY2UodmFsdWUudGFncy5tYXAoRGlhZ25vc3RpY1RhZy5mcm9tKSkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogSU1hcmtlckRhdGEpOiB2c2NvZGUuRGlhZ25vc3RpYyB7XG5cdFx0Y29uc3QgcmVzID0gbmV3IHR5cGVzLkRpYWdub3N0aWMoUmFuZ2UudG8odmFsdWUpLCB2YWx1ZS5tZXNzYWdlLCBEaWFnbm9zdGljU2V2ZXJpdHkudG8odmFsdWUuc2V2ZXJpdHkpKTtcblx0XHRyZXMuc291cmNlID0gdmFsdWUuc291cmNlO1xuXHRcdHJlcy5jb2RlID0gaXNTdHJpbmcodmFsdWUuY29kZSkgPyB2YWx1ZS5jb2RlIDogdmFsdWUuY29kZT8udmFsdWU7XG5cdFx0cmVzLnJlbGF0ZWRJbmZvcm1hdGlvbiA9IHZhbHVlLnJlbGF0ZWRJbmZvcm1hdGlvbiAmJiB2YWx1ZS5yZWxhdGVkSW5mb3JtYXRpb24ubWFwKERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24udG8pO1xuXHRcdHJlcy50YWdzID0gdmFsdWUudGFncyAmJiBjb2FsZXNjZSh2YWx1ZS50YWdzLm1hcChEaWFnbm9zdGljVGFnLnRvKSk7XG5cdFx0cmV0dXJuIHJlcztcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIERpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLkRpYWdub3N0aWNSZWxhdGVkSW5mb3JtYXRpb24pOiBJUmVsYXRlZEluZm9ybWF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uUmFuZ2UuZnJvbSh2YWx1ZS5sb2NhdGlvbi5yYW5nZSksXG5cdFx0XHRtZXNzYWdlOiB2YWx1ZS5tZXNzYWdlLFxuXHRcdFx0cmVzb3VyY2U6IHZhbHVlLmxvY2F0aW9uLnVyaVxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJUmVsYXRlZEluZm9ybWF0aW9uKTogdHlwZXMuRGlhZ25vc3RpY1JlbGF0ZWRJbmZvcm1hdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5EaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uKG5ldyB0eXBlcy5Mb2NhdGlvbih2YWx1ZS5yZXNvdXJjZSwgUmFuZ2UudG8odmFsdWUpKSwgdmFsdWUubWVzc2FnZSk7XG5cdH1cbn1cbmV4cG9ydCBuYW1lc3BhY2UgRGlhZ25vc3RpY1NldmVyaXR5IHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogbnVtYmVyKTogTWFya2VyU2V2ZXJpdHkge1xuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgdHlwZXMuRGlhZ25vc3RpY1NldmVyaXR5LkVycm9yOlxuXHRcdFx0XHRyZXR1cm4gTWFya2VyU2V2ZXJpdHkuRXJyb3I7XG5cdFx0XHRjYXNlIHR5cGVzLkRpYWdub3N0aWNTZXZlcml0eS5XYXJuaW5nOlxuXHRcdFx0XHRyZXR1cm4gTWFya2VyU2V2ZXJpdHkuV2FybmluZztcblx0XHRcdGNhc2UgdHlwZXMuRGlhZ25vc3RpY1NldmVyaXR5LkluZm9ybWF0aW9uOlxuXHRcdFx0XHRyZXR1cm4gTWFya2VyU2V2ZXJpdHkuSW5mbztcblx0XHRcdGNhc2UgdHlwZXMuRGlhZ25vc3RpY1NldmVyaXR5LkhpbnQ6XG5cdFx0XHRcdHJldHVybiBNYXJrZXJTZXZlcml0eS5IaW50O1xuXHRcdH1cblx0XHRyZXR1cm4gTWFya2VyU2V2ZXJpdHkuRXJyb3I7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IE1hcmtlclNldmVyaXR5KTogdHlwZXMuRGlhZ25vc3RpY1NldmVyaXR5IHtcblx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRjYXNlIE1hcmtlclNldmVyaXR5LkluZm86XG5cdFx0XHRcdHJldHVybiB0eXBlcy5EaWFnbm9zdGljU2V2ZXJpdHkuSW5mb3JtYXRpb247XG5cdFx0XHRjYXNlIE1hcmtlclNldmVyaXR5Lldhcm5pbmc6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5EaWFnbm9zdGljU2V2ZXJpdHkuV2FybmluZztcblx0XHRcdGNhc2UgTWFya2VyU2V2ZXJpdHkuRXJyb3I6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5EaWFnbm9zdGljU2V2ZXJpdHkuRXJyb3I7XG5cdFx0XHRjYXNlIE1hcmtlclNldmVyaXR5LkhpbnQ6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5EaWFnbm9zdGljU2V2ZXJpdHkuSGludDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5EaWFnbm9zdGljU2V2ZXJpdHkuRXJyb3I7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVmlld0NvbHVtbiB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGNvbHVtbj86IHZzY29kZS5WaWV3Q29sdW1uKTogRWRpdG9yR3JvdXBDb2x1bW4ge1xuXHRcdGlmICh0eXBlb2YgY29sdW1uID09PSAnbnVtYmVyJyAmJiBjb2x1bW4gPj0gdHlwZXMuVmlld0NvbHVtbi5PbmUpIHtcblx0XHRcdHJldHVybiBjb2x1bW4gLSAxOyAvLyBhZGp1c3QgemVybyBpbmRleCAoVmlld0NvbHVtbi5PTkUgPT4gMClcblx0XHR9XG5cblx0XHRpZiAoY29sdW1uID09PSB0eXBlcy5WaWV3Q29sdW1uLkJlc2lkZSkge1xuXHRcdFx0cmV0dXJuIFNJREVfR1JPVVA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEFDVElWRV9HUk9VUDsgLy8gZGVmYXVsdCBpcyBhbHdheXMgdGhlIGFjdGl2ZSBncm91cFxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBvc2l0aW9uOiBFZGl0b3JHcm91cENvbHVtbik6IHZzY29kZS5WaWV3Q29sdW1uIHtcblx0XHRpZiAodHlwZW9mIHBvc2l0aW9uID09PSAnbnVtYmVyJyAmJiBwb3NpdGlvbiA+PSAwKSB7XG5cdFx0XHRyZXR1cm4gcG9zaXRpb24gKyAxOyAvLyBhZGp1c3QgdG8gaW5kZXggKFZpZXdDb2x1bW4uT05FID0+IDEpXG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBpbnZhbGlkICdFZGl0b3JHcm91cENvbHVtbidgKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0RlY29yYXRpb25PcHRpb25zKHNvbWV0aGluZzogYW55KTogc29tZXRoaW5nIGlzIHZzY29kZS5EZWNvcmF0aW9uT3B0aW9ucyB7XG5cdHJldHVybiAodHlwZW9mIHNvbWV0aGluZy5yYW5nZSAhPT0gJ3VuZGVmaW5lZCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNEZWNvcmF0aW9uT3B0aW9uc0Fycihzb21ldGhpbmc6IHZzY29kZS5SYW5nZVtdIHwgdnNjb2RlLkRlY29yYXRpb25PcHRpb25zW10pOiBzb21ldGhpbmcgaXMgdnNjb2RlLkRlY29yYXRpb25PcHRpb25zW10ge1xuXHRpZiAoc29tZXRoaW5nLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBpc0RlY29yYXRpb25PcHRpb25zKHNvbWV0aGluZ1swXSkgPyB0cnVlIDogZmFsc2U7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTWFya2Rvd25TdHJpbmcge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tTWFueShtYXJrdXA6ICh2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB2c2NvZGUuTWFya2VkU3RyaW5nKVtdKTogaHRtbENvbnRlbnQuSU1hcmtkb3duU3RyaW5nW10ge1xuXHRcdHJldHVybiBtYXJrdXAubWFwKE1hcmtkb3duU3RyaW5nLmZyb20pO1xuXHR9XG5cblx0aW50ZXJmYWNlIENvZGVibG9jayB7XG5cdFx0bGFuZ3VhZ2U6IHN0cmluZztcblx0XHR2YWx1ZTogc3RyaW5nO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNDb2RlYmxvY2sodGhpbmc6IGFueSk6IHRoaW5nIGlzIENvZGVibG9jayB7XG5cdFx0cmV0dXJuIHRoaW5nICYmIHR5cGVvZiB0aGluZyA9PT0gJ29iamVjdCdcblx0XHRcdCYmIHR5cGVvZiAoPENvZGVibG9jaz50aGluZykubGFuZ3VhZ2UgPT09ICdzdHJpbmcnXG5cdFx0XHQmJiB0eXBlb2YgKDxDb2RlYmxvY2s+dGhpbmcpLnZhbHVlID09PSAnc3RyaW5nJztcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKG1hcmt1cDogdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdnNjb2RlLk1hcmtlZFN0cmluZyk6IGh0bWxDb250ZW50LklNYXJrZG93blN0cmluZyB7XG5cdFx0bGV0IHJlczogaHRtbENvbnRlbnQuSU1hcmtkb3duU3RyaW5nO1xuXHRcdGlmIChpc0NvZGVibG9jayhtYXJrdXApKSB7XG5cdFx0XHRjb25zdCB7IGxhbmd1YWdlLCB2YWx1ZSB9ID0gbWFya3VwO1xuXHRcdFx0cmVzID0geyB2YWx1ZTogJ2BgYCcgKyBsYW5ndWFnZSArICdcXG4nICsgdmFsdWUgKyAnXFxuYGBgXFxuJyB9O1xuXHRcdH0gZWxzZSBpZiAodHlwZXMuTWFya2Rvd25TdHJpbmcuaXNNYXJrZG93blN0cmluZyhtYXJrdXApKSB7XG5cdFx0XHRyZXMgPSB7IHZhbHVlOiBtYXJrdXAudmFsdWUsIGlzVHJ1c3RlZDogbWFya3VwLmlzVHJ1c3RlZCwgc3VwcG9ydFRoZW1lSWNvbnM6IG1hcmt1cC5zdXBwb3J0VGhlbWVJY29ucywgc3VwcG9ydEh0bWw6IG1hcmt1cC5zdXBwb3J0SHRtbCwgc3VwcG9ydEFsZXJ0U3ludGF4OiBtYXJrdXAuc3VwcG9ydEFsZXJ0U3ludGF4LCBiYXNlVXJpOiBtYXJrdXAuYmFzZVVyaSB9O1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIG1hcmt1cCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJlcyA9IHsgdmFsdWU6IG1hcmt1cCB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXMgPSB7IHZhbHVlOiAnJyB9O1xuXHRcdH1cblxuXHRcdC8vIGV4dHJhY3QgdXJpcyBpbnRvIGEgc2VwYXJhdGUgb2JqZWN0XG5cdFx0Y29uc3QgcmVzVXJpczogeyBbaHJlZjogc3RyaW5nXTogVXJpQ29tcG9uZW50cyB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRyZXMudXJpcyA9IHJlc1VyaXM7XG5cblx0XHRjb25zdCBjb2xsZWN0VXJpID0gKHsgaHJlZiB9OiB7IGhyZWY6IHN0cmluZyB9KTogc3RyaW5nID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGxldCB1cmkgPSBVUkkucGFyc2UoaHJlZiwgdHJ1ZSk7XG5cdFx0XHRcdHVyaSA9IHVyaS53aXRoKHsgcXVlcnk6IF91cmlNYXNzYWdlKHVyaS5xdWVyeSwgcmVzVXJpcykgfSk7XG5cdFx0XHRcdHJlc1VyaXNbaHJlZl0gPSB1cmk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH07XG5cblx0XHRtYXJrZWQubWFya2VkLndhbGtUb2tlbnMobWFya2VkLm1hcmtlZC5sZXhlcihyZXMudmFsdWUpLCB0b2tlbiA9PiB7XG5cdFx0XHRpZiAodG9rZW4udHlwZSA9PT0gJ2xpbmsnKSB7XG5cdFx0XHRcdGNvbGxlY3RVcmkoeyBocmVmOiB0b2tlbi5ocmVmIH0pO1xuXHRcdFx0fSBlbHNlIGlmICh0b2tlbi50eXBlID09PSAnaW1hZ2UnKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgdG9rZW4uaHJlZiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjb2xsZWN0VXJpKGh0bWxDb250ZW50LnBhcnNlSHJlZkFuZERpbWVuc2lvbnModG9rZW4uaHJlZikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0ZnVuY3Rpb24gX3VyaU1hc3NhZ2UocGFydDogc3RyaW5nLCBidWNrZXQ6IHsgW246IHN0cmluZ106IFVyaUNvbXBvbmVudHMgfSk6IHN0cmluZyB7XG5cdFx0aWYgKCFwYXJ0KSB7XG5cdFx0XHRyZXR1cm4gcGFydDtcblx0XHR9XG5cdFx0bGV0IGRhdGE6IHVua25vd247XG5cdFx0dHJ5IHtcblx0XHRcdGRhdGEgPSBwYXJzZShwYXJ0KTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHR9XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gcGFydDtcblx0XHR9XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRkYXRhID0gY2xvbmVBbmRDaGFuZ2UoZGF0YSwgdmFsdWUgPT4ge1xuXHRcdFx0aWYgKFVSSS5pc1VyaSh2YWx1ZSkpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gYF9fdXJpXyR7TWF0aC5yYW5kb20oKS50b1N0cmluZygxNikuc2xpY2UoMiwgOCl9YDtcblx0XHRcdFx0YnVja2V0W2tleV0gPSB2YWx1ZTtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBrZXk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFjaGFuZ2VkKSB7XG5cdFx0XHRyZXR1cm4gcGFydDtcblx0XHR9XG5cblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoZGF0YSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IGh0bWxDb250ZW50LklNYXJrZG93blN0cmluZyk6IHZzY29kZS5NYXJrZG93blN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IHR5cGVzLk1hcmtkb3duU3RyaW5nKHZhbHVlLnZhbHVlLCB2YWx1ZS5zdXBwb3J0VGhlbWVJY29ucyk7XG5cdFx0cmVzdWx0LmlzVHJ1c3RlZCA9IHZhbHVlLmlzVHJ1c3RlZDtcblx0XHRyZXN1bHQuc3VwcG9ydEh0bWwgPSB2YWx1ZS5zdXBwb3J0SHRtbDtcblx0XHRyZXN1bHQuc3VwcG9ydEFsZXJ0U3ludGF4ID0gdmFsdWUuc3VwcG9ydEFsZXJ0U3ludGF4O1xuXHRcdHJlc3VsdC5iYXNlVXJpID0gdmFsdWUuYmFzZVVyaSA/IFVSSS5mcm9tKHZhbHVlLmJhc2VVcmkpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVN0cmljdCh2YWx1ZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHwgbnVsbCk6IHVuZGVmaW5lZCB8IHN0cmluZyB8IGh0bWxDb250ZW50LklNYXJrZG93blN0cmluZyB7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6IE1hcmtkb3duU3RyaW5nLmZyb20odmFsdWUpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmcm9tUmFuZ2VPclJhbmdlV2l0aE1lc3NhZ2UocmFuZ2VzOiB2c2NvZGUuUmFuZ2VbXSB8IHZzY29kZS5EZWNvcmF0aW9uT3B0aW9uc1tdKTogSURlY29yYXRpb25PcHRpb25zW10ge1xuXHRpZiAoaXNEZWNvcmF0aW9uT3B0aW9uc0FycihyYW5nZXMpKSB7XG5cdFx0cmV0dXJuIHJhbmdlcy5tYXAoKHIpOiBJRGVjb3JhdGlvbk9wdGlvbnMgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb20oci5yYW5nZSksXG5cdFx0XHRcdGhvdmVyTWVzc2FnZTogQXJyYXkuaXNBcnJheShyLmhvdmVyTWVzc2FnZSlcblx0XHRcdFx0XHQ/IE1hcmtkb3duU3RyaW5nLmZyb21NYW55KHIuaG92ZXJNZXNzYWdlKVxuXHRcdFx0XHRcdDogKHIuaG92ZXJNZXNzYWdlID8gTWFya2Rvd25TdHJpbmcuZnJvbShyLmhvdmVyTWVzc2FnZSkgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0cmVuZGVyT3B0aW9uczogPGFueT4gLyogVVJJIHZzIFVyaSAqL3IucmVuZGVyT3B0aW9uc1xuXHRcdFx0fTtcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gcmFuZ2VzLm1hcCgocik6IElEZWNvcmF0aW9uT3B0aW9ucyA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShyKVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGF0aE9yVVJJVG9VUkkodmFsdWU6IHN0cmluZyB8IFVSSSk6IFVSSSB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIFVSSS5maWxlKHZhbHVlKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUaGVtYWJsZURlY29yYXRpb25BdHRhY2htZW50UmVuZGVyT3B0aW9ucyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKG9wdGlvbnM6IHZzY29kZS5UaGVtYWJsZURlY29yYXRpb25BdHRhY2htZW50UmVuZGVyT3B0aW9ucyk6IElDb250ZW50RGVjb3JhdGlvblJlbmRlck9wdGlvbnMge1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiBvcHRpb25zO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudFRleHQ6IG9wdGlvbnMuY29udGVudFRleHQsXG5cdFx0XHRjb250ZW50SWNvblBhdGg6IG9wdGlvbnMuY29udGVudEljb25QYXRoID8gcGF0aE9yVVJJVG9VUkkob3B0aW9ucy5jb250ZW50SWNvblBhdGgpIDogdW5kZWZpbmVkLFxuXHRcdFx0Ym9yZGVyOiBvcHRpb25zLmJvcmRlcixcblx0XHRcdGJvcmRlckNvbG9yOiA8c3RyaW5nIHwgdHlwZXMuVGhlbWVDb2xvcj5vcHRpb25zLmJvcmRlckNvbG9yLFxuXHRcdFx0Zm9udFN0eWxlOiBvcHRpb25zLmZvbnRTdHlsZSxcblx0XHRcdGZvbnRXZWlnaHQ6IG9wdGlvbnMuZm9udFdlaWdodCxcblx0XHRcdHRleHREZWNvcmF0aW9uOiBvcHRpb25zLnRleHREZWNvcmF0aW9uLFxuXHRcdFx0Y29sb3I6IDxzdHJpbmcgfCB0eXBlcy5UaGVtZUNvbG9yPm9wdGlvbnMuY29sb3IsXG5cdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IDxzdHJpbmcgfCB0eXBlcy5UaGVtZUNvbG9yPm9wdGlvbnMuYmFja2dyb3VuZENvbG9yLFxuXHRcdFx0bWFyZ2luOiBvcHRpb25zLm1hcmdpbixcblx0XHRcdHdpZHRoOiBvcHRpb25zLndpZHRoLFxuXHRcdFx0aGVpZ2h0OiBvcHRpb25zLmhlaWdodCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGhlbWFibGVEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKG9wdGlvbnM6IHZzY29kZS5UaGVtYWJsZURlY29yYXRpb25SZW5kZXJPcHRpb25zKTogSVRoZW1lRGVjb3JhdGlvblJlbmRlck9wdGlvbnMge1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiBvcHRpb25zO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0YmFja2dyb3VuZENvbG9yOiA8c3RyaW5nIHwgdHlwZXMuVGhlbWVDb2xvcj5vcHRpb25zLmJhY2tncm91bmRDb2xvcixcblx0XHRcdG91dGxpbmU6IG9wdGlvbnMub3V0bGluZSxcblx0XHRcdG91dGxpbmVDb2xvcjogPHN0cmluZyB8IHR5cGVzLlRoZW1lQ29sb3I+b3B0aW9ucy5vdXRsaW5lQ29sb3IsXG5cdFx0XHRvdXRsaW5lU3R5bGU6IG9wdGlvbnMub3V0bGluZVN0eWxlLFxuXHRcdFx0b3V0bGluZVdpZHRoOiBvcHRpb25zLm91dGxpbmVXaWR0aCxcblx0XHRcdGJvcmRlcjogb3B0aW9ucy5ib3JkZXIsXG5cdFx0XHRib3JkZXJDb2xvcjogPHN0cmluZyB8IHR5cGVzLlRoZW1lQ29sb3I+b3B0aW9ucy5ib3JkZXJDb2xvcixcblx0XHRcdGJvcmRlclJhZGl1czogb3B0aW9ucy5ib3JkZXJSYWRpdXMsXG5cdFx0XHRib3JkZXJTcGFjaW5nOiBvcHRpb25zLmJvcmRlclNwYWNpbmcsXG5cdFx0XHRib3JkZXJTdHlsZTogb3B0aW9ucy5ib3JkZXJTdHlsZSxcblx0XHRcdGJvcmRlcldpZHRoOiBvcHRpb25zLmJvcmRlcldpZHRoLFxuXHRcdFx0Zm9udFN0eWxlOiBvcHRpb25zLmZvbnRTdHlsZSxcblx0XHRcdGZvbnRXZWlnaHQ6IG9wdGlvbnMuZm9udFdlaWdodCxcblx0XHRcdHRleHREZWNvcmF0aW9uOiBvcHRpb25zLnRleHREZWNvcmF0aW9uLFxuXHRcdFx0Y3Vyc29yOiBvcHRpb25zLmN1cnNvcixcblx0XHRcdGNvbG9yOiA8c3RyaW5nIHwgdHlwZXMuVGhlbWVDb2xvcj5vcHRpb25zLmNvbG9yLFxuXHRcdFx0b3BhY2l0eTogb3B0aW9ucy5vcGFjaXR5LFxuXHRcdFx0bGV0dGVyU3BhY2luZzogb3B0aW9ucy5sZXR0ZXJTcGFjaW5nLFxuXHRcdFx0Z3V0dGVySWNvblBhdGg6IG9wdGlvbnMuZ3V0dGVySWNvblBhdGggPyBwYXRoT3JVUklUb1VSSShvcHRpb25zLmd1dHRlckljb25QYXRoKSA6IHVuZGVmaW5lZCxcblx0XHRcdGd1dHRlckljb25TaXplOiBvcHRpb25zLmd1dHRlckljb25TaXplLFxuXHRcdFx0b3ZlcnZpZXdSdWxlckNvbG9yOiA8c3RyaW5nIHwgdHlwZXMuVGhlbWVDb2xvcj5vcHRpb25zLm92ZXJ2aWV3UnVsZXJDb2xvcixcblx0XHRcdGJlZm9yZTogb3B0aW9ucy5iZWZvcmUgPyBUaGVtYWJsZURlY29yYXRpb25BdHRhY2htZW50UmVuZGVyT3B0aW9ucy5mcm9tKG9wdGlvbnMuYmVmb3JlKSA6IHVuZGVmaW5lZCxcblx0XHRcdGFmdGVyOiBvcHRpb25zLmFmdGVyID8gVGhlbWFibGVEZWNvcmF0aW9uQXR0YWNobWVudFJlbmRlck9wdGlvbnMuZnJvbShvcHRpb25zLmFmdGVyKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRGVjb3JhdGlvblJhbmdlQmVoYXZpb3Ige1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdHlwZXMuRGVjb3JhdGlvblJhbmdlQmVoYXZpb3IpOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRjYXNlIHR5cGVzLkRlY29yYXRpb25SYW5nZUJlaGF2aW9yLk9wZW5PcGVuOlxuXHRcdFx0XHRyZXR1cm4gVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzO1xuXHRcdFx0Y2FzZSB0eXBlcy5EZWNvcmF0aW9uUmFuZ2VCZWhhdmlvci5DbG9zZWRDbG9zZWQ6XG5cdFx0XHRcdHJldHVybiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcztcblx0XHRcdGNhc2UgdHlwZXMuRGVjb3JhdGlvblJhbmdlQmVoYXZpb3IuT3BlbkNsb3NlZDpcblx0XHRcdFx0cmV0dXJuIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0JlZm9yZTtcblx0XHRcdGNhc2UgdHlwZXMuRGVjb3JhdGlvblJhbmdlQmVoYXZpb3IuQ2xvc2VkT3Blbjpcblx0XHRcdFx0cmV0dXJuIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIERlY29yYXRpb25SZW5kZXJPcHRpb25zIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ob3B0aW9uczogdnNjb2RlLkRlY29yYXRpb25SZW5kZXJPcHRpb25zKTogSURlY29yYXRpb25SZW5kZXJPcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNXaG9sZUxpbmU6IG9wdGlvbnMuaXNXaG9sZUxpbmUsXG5cdFx0XHRyYW5nZUJlaGF2aW9yOiBvcHRpb25zLnJhbmdlQmVoYXZpb3IgPyBEZWNvcmF0aW9uUmFuZ2VCZWhhdmlvci5mcm9tKG9wdGlvbnMucmFuZ2VCZWhhdmlvcikgOiB1bmRlZmluZWQsXG5cdFx0XHRvdmVydmlld1J1bGVyTGFuZTogb3B0aW9ucy5vdmVydmlld1J1bGVyTGFuZSxcblx0XHRcdGxpZ2h0OiBvcHRpb25zLmxpZ2h0ID8gVGhlbWFibGVEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucy5mcm9tKG9wdGlvbnMubGlnaHQpIDogdW5kZWZpbmVkLFxuXHRcdFx0ZGFyazogb3B0aW9ucy5kYXJrID8gVGhlbWFibGVEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucy5mcm9tKG9wdGlvbnMuZGFyaykgOiB1bmRlZmluZWQsXG5cblx0XHRcdGJhY2tncm91bmRDb2xvcjogPHN0cmluZyB8IHR5cGVzLlRoZW1lQ29sb3I+b3B0aW9ucy5iYWNrZ3JvdW5kQ29sb3IsXG5cdFx0XHRvdXRsaW5lOiBvcHRpb25zLm91dGxpbmUsXG5cdFx0XHRvdXRsaW5lQ29sb3I6IDxzdHJpbmcgfCB0eXBlcy5UaGVtZUNvbG9yPm9wdGlvbnMub3V0bGluZUNvbG9yLFxuXHRcdFx0b3V0bGluZVN0eWxlOiBvcHRpb25zLm91dGxpbmVTdHlsZSxcblx0XHRcdG91dGxpbmVXaWR0aDogb3B0aW9ucy5vdXRsaW5lV2lkdGgsXG5cdFx0XHRib3JkZXI6IG9wdGlvbnMuYm9yZGVyLFxuXHRcdFx0Ym9yZGVyQ29sb3I6IDxzdHJpbmcgfCB0eXBlcy5UaGVtZUNvbG9yPm9wdGlvbnMuYm9yZGVyQ29sb3IsXG5cdFx0XHRib3JkZXJSYWRpdXM6IG9wdGlvbnMuYm9yZGVyUmFkaXVzLFxuXHRcdFx0Ym9yZGVyU3BhY2luZzogb3B0aW9ucy5ib3JkZXJTcGFjaW5nLFxuXHRcdFx0Ym9yZGVyU3R5bGU6IG9wdGlvbnMuYm9yZGVyU3R5bGUsXG5cdFx0XHRib3JkZXJXaWR0aDogb3B0aW9ucy5ib3JkZXJXaWR0aCxcblx0XHRcdGZvbnRTdHlsZTogb3B0aW9ucy5mb250U3R5bGUsXG5cdFx0XHRmb250V2VpZ2h0OiBvcHRpb25zLmZvbnRXZWlnaHQsXG5cdFx0XHR0ZXh0RGVjb3JhdGlvbjogb3B0aW9ucy50ZXh0RGVjb3JhdGlvbixcblx0XHRcdGN1cnNvcjogb3B0aW9ucy5jdXJzb3IsXG5cdFx0XHRjb2xvcjogPHN0cmluZyB8IHR5cGVzLlRoZW1lQ29sb3I+b3B0aW9ucy5jb2xvcixcblx0XHRcdG9wYWNpdHk6IG9wdGlvbnMub3BhY2l0eSxcblx0XHRcdGxldHRlclNwYWNpbmc6IG9wdGlvbnMubGV0dGVyU3BhY2luZyxcblx0XHRcdGd1dHRlckljb25QYXRoOiBvcHRpb25zLmd1dHRlckljb25QYXRoID8gcGF0aE9yVVJJVG9VUkkob3B0aW9ucy5ndXR0ZXJJY29uUGF0aCkgOiB1bmRlZmluZWQsXG5cdFx0XHRndXR0ZXJJY29uU2l6ZTogb3B0aW9ucy5ndXR0ZXJJY29uU2l6ZSxcblx0XHRcdG92ZXJ2aWV3UnVsZXJDb2xvcjogPHN0cmluZyB8IHR5cGVzLlRoZW1lQ29sb3I+b3B0aW9ucy5vdmVydmlld1J1bGVyQ29sb3IsXG5cdFx0XHRiZWZvcmU6IG9wdGlvbnMuYmVmb3JlID8gVGhlbWFibGVEZWNvcmF0aW9uQXR0YWNobWVudFJlbmRlck9wdGlvbnMuZnJvbShvcHRpb25zLmJlZm9yZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRhZnRlcjogb3B0aW9ucy5hZnRlciA/IFRoZW1hYmxlRGVjb3JhdGlvbkF0dGFjaG1lbnRSZW5kZXJPcHRpb25zLmZyb20ob3B0aW9ucy5hZnRlcikgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRleHRFZGl0IHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShlZGl0OiB2c2NvZGUuVGV4dEVkaXQpOiBsYW5ndWFnZXMuVGV4dEVkaXQge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0ZXh0OiBlZGl0Lm5ld1RleHQsXG5cdFx0XHRlb2w6IGVkaXQubmV3RW9sICYmIEVuZE9mTGluZS5mcm9tKGVkaXQubmV3RW9sKSxcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGVkaXQucmFuZ2UpXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhlZGl0OiBsYW5ndWFnZXMuVGV4dEVkaXQpOiB0eXBlcy5UZXh0RWRpdCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IHR5cGVzLlRleHRFZGl0KFJhbmdlLnRvKGVkaXQucmFuZ2UpLCBlZGl0LnRleHQpO1xuXHRcdHJlc3VsdC5uZXdFb2wgPSAodHlwZW9mIGVkaXQuZW9sID09PSAndW5kZWZpbmVkJyA/IHVuZGVmaW5lZCA6IEVuZE9mTGluZS50byhlZGl0LmVvbCkpITtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgV29ya3NwYWNlRWRpdCB7XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJVmVyc2lvbkluZm9ybWF0aW9uUHJvdmlkZXIge1xuXHRcdGdldFRleHREb2N1bWVudFZlcnNpb24odXJpOiBVUkkpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0Z2V0Tm90ZWJvb2tEb2N1bWVudFZlcnNpb24odXJpOiBVUkkpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLldvcmtzcGFjZUVkaXQsIHZlcnNpb25JbmZvPzogSVZlcnNpb25JbmZvcm1hdGlvblByb3ZpZGVyKTogZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VFZGl0RHRvIHtcblx0XHRjb25zdCByZXN1bHQ6IGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0byA9IHtcblx0XHRcdGVkaXRzOiBbXVxuXHRcdH07XG5cblx0XHRpZiAodmFsdWUgaW5zdGFuY2VvZiB0eXBlcy5Xb3Jrc3BhY2VFZGl0KSB7XG5cblx0XHRcdC8vIGNvbGxlY3QgYWxsIGZpbGVzIHRoYXQgYXJlIHRvIGJlIGNyZWF0ZWQgc28gdGhhdCB0aGVpciB2ZXJzaW9uXG5cdFx0XHQvLyBpbmZvcm1hdGlvbiAoaW4gY2FzZSB0aGV5IGV4aXN0IGFzIHRleHQgbW9kZWwgYWxyZWFkeSkgY2FuIGJlIGlnbm9yZWRcblx0XHRcdGNvbnN0IHRvQ3JlYXRlID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHZhbHVlLl9hbGxFbnRyaWVzKCkpIHtcblx0XHRcdFx0aWYgKGVudHJ5Ll90eXBlID09PSB0eXBlcy5GaWxlRWRpdFR5cGUuRmlsZSAmJiBVUkkuaXNVcmkoZW50cnkudG8pICYmIGVudHJ5LmZyb20gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHRvQ3JlYXRlLmFkZChlbnRyeS50byk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB2YWx1ZS5fYWxsRW50cmllcygpKSB7XG5cblx0XHRcdFx0aWYgKGVudHJ5Ll90eXBlID09PSB0eXBlcy5GaWxlRWRpdFR5cGUuRmlsZSkge1xuXHRcdFx0XHRcdGxldCBjb250ZW50czogeyB0eXBlOiAnYmFzZTY0JzsgdmFsdWU6IHN0cmluZyB9IHwgeyB0eXBlOiAnZGF0YVRyYW5zZmVySXRlbSc7IGlkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoZW50cnkub3B0aW9ucz8uY29udGVudHMpIHtcblx0XHRcdFx0XHRcdGlmIChBcnJheUJ1ZmZlci5pc1ZpZXcoZW50cnkub3B0aW9ucy5jb250ZW50cykpIHtcblx0XHRcdFx0XHRcdFx0Y29udGVudHMgPSB7IHR5cGU6ICdiYXNlNjQnLCB2YWx1ZTogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLndyYXAoZW50cnkub3B0aW9ucy5jb250ZW50cykpIH07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50cyA9IHsgdHlwZTogJ2RhdGFUcmFuc2Zlckl0ZW0nLCBpZDogKGVudHJ5Lm9wdGlvbnMuY29udGVudHMgYXMgdHlwZXMuRGF0YVRyYW5zZmVyRmlsZSkuX2l0ZW1JZCB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGZpbGUgb3BlcmF0aW9uXG5cdFx0XHRcdFx0cmVzdWx0LmVkaXRzLnB1c2goe1xuXHRcdFx0XHRcdFx0b2xkUmVzb3VyY2U6IGVudHJ5LmZyb20sXG5cdFx0XHRcdFx0XHRuZXdSZXNvdXJjZTogZW50cnkudG8sXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IC4uLmVudHJ5Lm9wdGlvbnMsIGNvbnRlbnRzIH0sXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogZW50cnkubWV0YWRhdGFcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKGVudHJ5Ll90eXBlID09PSB0eXBlcy5GaWxlRWRpdFR5cGUuVGV4dCkge1xuXHRcdFx0XHRcdC8vIHRleHQgZWRpdHNcblx0XHRcdFx0XHRyZXN1bHQuZWRpdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogZW50cnkudXJpLFxuXHRcdFx0XHRcdFx0dGV4dEVkaXQ6IFRleHRFZGl0LmZyb20oZW50cnkuZWRpdCksXG5cdFx0XHRcdFx0XHR2ZXJzaW9uSWQ6ICF0b0NyZWF0ZS5oYXMoZW50cnkudXJpKSA/IHZlcnNpb25JbmZvPy5nZXRUZXh0RG9jdW1lbnRWZXJzaW9uKGVudHJ5LnVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YTogZW50cnkubWV0YWRhdGFcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChlbnRyeS5fdHlwZSA9PT0gdHlwZXMuRmlsZUVkaXRUeXBlLlNuaXBwZXQpIHtcblx0XHRcdFx0XHRyZXN1bHQuZWRpdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogZW50cnkudXJpLFxuXHRcdFx0XHRcdFx0dGV4dEVkaXQ6IHtcblx0XHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb20oZW50cnkucmFuZ2UpLFxuXHRcdFx0XHRcdFx0XHR0ZXh0OiBlbnRyeS5lZGl0LnZhbHVlLFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRBc1NuaXBwZXQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGtlZXBXaGl0ZXNwYWNlOiBlbnRyeS5rZWVwV2hpdGVzcGFjZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHZlcnNpb25JZDogIXRvQ3JlYXRlLmhhcyhlbnRyeS51cmkpID8gdmVyc2lvbkluZm8/LmdldFRleHREb2N1bWVudFZlcnNpb24oZW50cnkudXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiBlbnRyeS5tZXRhZGF0YVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoZW50cnkuX3R5cGUgPT09IHR5cGVzLkZpbGVFZGl0VHlwZS5DZWxsKSB7XG5cdFx0XHRcdFx0Ly8gY2VsbCBlZGl0XG5cdFx0XHRcdFx0cmVzdWx0LmVkaXRzLnB1c2goe1xuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IGVudHJ5Lm1ldGFkYXRhLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IGVudHJ5LnVyaSxcblx0XHRcdFx0XHRcdGNlbGxFZGl0OiBlbnRyeS5lZGl0LFxuXHRcdFx0XHRcdFx0bm90ZWJvb2tWZXJzaW9uSWQ6IHZlcnNpb25JbmZvPy5nZXROb3RlYm9va0RvY3VtZW50VmVyc2lvbihlbnRyeS51cmkpXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0fSBlbHNlIGlmIChlbnRyeS5fdHlwZSA9PT0gdHlwZXMuRmlsZUVkaXRUeXBlLkNlbGxSZXBsYWNlKSB7XG5cdFx0XHRcdFx0Ly8gY2VsbCByZXBsYWNlXG5cdFx0XHRcdFx0cmVzdWx0LmVkaXRzLnB1c2goe1xuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IGVudHJ5Lm1ldGFkYXRhLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IGVudHJ5LnVyaSxcblx0XHRcdFx0XHRcdG5vdGVib29rVmVyc2lvbklkOiB2ZXJzaW9uSW5mbz8uZ2V0Tm90ZWJvb2tEb2N1bWVudFZlcnNpb24oZW50cnkudXJpKSxcblx0XHRcdFx0XHRcdGNlbGxFZGl0OiB7XG5cdFx0XHRcdFx0XHRcdGVkaXRUeXBlOiBub3RlYm9va3MuQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0XHRcdGluZGV4OiBlbnRyeS5pbmRleCxcblx0XHRcdFx0XHRcdFx0Y291bnQ6IGVudHJ5LmNvdW50LFxuXHRcdFx0XHRcdFx0XHRjZWxsczogZW50cnkuY2VsbHMubWFwKE5vdGVib29rQ2VsbERhdGEuZnJvbSlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG8pIHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuV29ya3NwYWNlRWRpdCgpO1xuXHRcdGNvbnN0IGVkaXRzID0gbmV3IFJlc291cmNlTWFwPCh0eXBlcy5UZXh0RWRpdCB8IHR5cGVzLlNuaXBwZXRUZXh0RWRpdClbXT4oKTtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdmFsdWUuZWRpdHMpIHtcblx0XHRcdGlmICgoPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlVGV4dEVkaXREdG8+ZWRpdCkudGV4dEVkaXQpIHtcblxuXHRcdFx0XHRjb25zdCBpdGVtID0gPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlVGV4dEVkaXREdG8+ZWRpdDtcblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShpdGVtLnJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS50byhpdGVtLnRleHRFZGl0LnJhbmdlKTtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGl0ZW0udGV4dEVkaXQudGV4dDtcblx0XHRcdFx0Y29uc3QgaXNTbmlwcGV0ID0gaXRlbS50ZXh0RWRpdC5pbnNlcnRBc1NuaXBwZXQ7XG5cblx0XHRcdFx0bGV0IGVkaXRPclNuaXBwZXRUZXN0OiB0eXBlcy5UZXh0RWRpdCB8IHR5cGVzLlNuaXBwZXRUZXh0RWRpdDtcblx0XHRcdFx0aWYgKGlzU25pcHBldCkge1xuXHRcdFx0XHRcdGVkaXRPclNuaXBwZXRUZXN0ID0gdHlwZXMuU25pcHBldFRleHRFZGl0LnJlcGxhY2UocmFuZ2UsIG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKHRleHQpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlZGl0T3JTbmlwcGV0VGVzdCA9IHR5cGVzLlRleHRFZGl0LnJlcGxhY2UocmFuZ2UsIHRleHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYXJyYXkgPSBlZGl0cy5nZXQodXJpKTtcblx0XHRcdFx0aWYgKCFhcnJheSkge1xuXHRcdFx0XHRcdGVkaXRzLnNldCh1cmksIFtlZGl0T3JTbmlwcGV0VGVzdF0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFycmF5LnB1c2goZWRpdE9yU25pcHBldFRlc3QpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5yZW5hbWVGaWxlKFxuXHRcdFx0XHRcdFVSSS5yZXZpdmUoKDxleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUZpbGVFZGl0RHRvPmVkaXQpLm9sZFJlc291cmNlISksXG5cdFx0XHRcdFx0VVJJLnJldml2ZSgoPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRmlsZUVkaXREdG8+ZWRpdCkubmV3UmVzb3VyY2UhKSxcblx0XHRcdFx0XHQoPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRmlsZUVkaXREdG8+ZWRpdCkub3B0aW9uc1xuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW3VyaSwgYXJyYXldIG9mIGVkaXRzKSB7XG5cdFx0XHRyZXN1bHQuc2V0KHVyaSwgYXJyYXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cblxuZXhwb3J0IG5hbWVzcGFjZSBTeW1ib2xLaW5kIHtcblxuXHRjb25zdCBfZnJvbU1hcHBpbmc6IHsgW2tpbmQ6IG51bWJlcl06IGxhbmd1YWdlcy5TeW1ib2xLaW5kIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5GaWxlXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLkZpbGU7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLk1vZHVsZV0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5Nb2R1bGU7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLk5hbWVzcGFjZV0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5OYW1lc3BhY2U7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLlBhY2thZ2VdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuUGFja2FnZTtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuQ2xhc3NdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuQ2xhc3M7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLk1ldGhvZF0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5NZXRob2Q7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLlByb3BlcnR5XSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLlByb3BlcnR5O1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5GaWVsZF0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5GaWVsZDtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuQ29uc3RydWN0b3JdID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuQ29uc3RydWN0b3I7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLkVudW1dID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuRW51bTtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuSW50ZXJmYWNlXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLkludGVyZmFjZTtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuRnVuY3Rpb25dID0gbGFuZ3VhZ2VzLlN5bWJvbEtpbmQuRnVuY3Rpb247XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLlZhcmlhYmxlXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLlZhcmlhYmxlO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5Db25zdGFudF0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5Db25zdGFudDtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuU3RyaW5nXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLlN0cmluZztcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuTnVtYmVyXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLk51bWJlcjtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuQm9vbGVhbl0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5Cb29sZWFuO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5BcnJheV0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5BcnJheTtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuT2JqZWN0XSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLk9iamVjdDtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuS2V5XSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLktleTtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuTnVsbF0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5OdWxsO1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5FbnVtTWVtYmVyXSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLkVudW1NZW1iZXI7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLlN0cnVjdF0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5TdHJ1Y3Q7XG5cdF9mcm9tTWFwcGluZ1t0eXBlcy5TeW1ib2xLaW5kLkV2ZW50XSA9IGxhbmd1YWdlcy5TeW1ib2xLaW5kLkV2ZW50O1xuXHRfZnJvbU1hcHBpbmdbdHlwZXMuU3ltYm9sS2luZC5PcGVyYXRvcl0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5PcGVyYXRvcjtcblx0X2Zyb21NYXBwaW5nW3R5cGVzLlN5bWJvbEtpbmQuVHlwZVBhcmFtZXRlcl0gPSBsYW5ndWFnZXMuU3ltYm9sS2luZC5UeXBlUGFyYW1ldGVyO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGtpbmQ6IHZzY29kZS5TeW1ib2xLaW5kKTogbGFuZ3VhZ2VzLlN5bWJvbEtpbmQge1xuXHRcdHJldHVybiB0eXBlb2YgX2Zyb21NYXBwaW5nW2tpbmRdID09PSAnbnVtYmVyJyA/IF9mcm9tTWFwcGluZ1traW5kXSA6IGxhbmd1YWdlcy5TeW1ib2xLaW5kLlByb3BlcnR5O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGtpbmQ6IGxhbmd1YWdlcy5TeW1ib2xLaW5kKTogdnNjb2RlLlN5bWJvbEtpbmQge1xuXHRcdGZvciAoY29uc3QgayBpbiBfZnJvbU1hcHBpbmcpIHtcblx0XHRcdGlmIChfZnJvbU1hcHBpbmdba10gPT09IGtpbmQpIHtcblx0XHRcdFx0cmV0dXJuIE51bWJlcihrKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVzLlN5bWJvbEtpbmQuUHJvcGVydHk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBTeW1ib2xUYWcge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGtpbmQ6IHR5cGVzLlN5bWJvbFRhZyk6IGxhbmd1YWdlcy5TeW1ib2xUYWcge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSB0eXBlcy5TeW1ib2xUYWcuRGVwcmVjYXRlZDogcmV0dXJuIGxhbmd1YWdlcy5TeW1ib2xUYWcuRGVwcmVjYXRlZDtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oa2luZDogbGFuZ3VhZ2VzLlN5bWJvbFRhZyk6IHR5cGVzLlN5bWJvbFRhZyB7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlIGxhbmd1YWdlcy5TeW1ib2xUYWcuRGVwcmVjYXRlZDogcmV0dXJuIHR5cGVzLlN5bWJvbFRhZy5EZXByZWNhdGVkO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFdvcmtzcGFjZVN5bWJvbCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGluZm86IHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbik6IHNlYXJjaC5JV29ya3NwYWNlU3ltYm9sIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogaW5mby5uYW1lLFxuXHRcdFx0a2luZDogU3ltYm9sS2luZC5mcm9tKGluZm8ua2luZCksXG5cdFx0XHR0YWdzOiBpbmZvLnRhZ3MgJiYgaW5mby50YWdzLm1hcChTeW1ib2xUYWcuZnJvbSksXG5cdFx0XHRjb250YWluZXJOYW1lOiBpbmZvLmNvbnRhaW5lck5hbWUsXG5cdFx0XHRsb2NhdGlvbjogbG9jYXRpb24uZnJvbShpbmZvLmxvY2F0aW9uKVxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGluZm86IHNlYXJjaC5JV29ya3NwYWNlU3ltYm9sKTogdHlwZXMuU3ltYm9sSW5mb3JtYXRpb24ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5TeW1ib2xJbmZvcm1hdGlvbihcblx0XHRcdGluZm8ubmFtZSxcblx0XHRcdFN5bWJvbEtpbmQudG8oaW5mby5raW5kKSxcblx0XHRcdGluZm8uY29udGFpbmVyTmFtZSxcblx0XHRcdGxvY2F0aW9uLnRvKGluZm8ubG9jYXRpb24pXG5cdFx0KTtcblx0XHRyZXN1bHQudGFncyA9IGluZm8udGFncyAmJiBpbmZvLnRhZ3MubWFwKFN5bWJvbFRhZy50byk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIERvY3VtZW50U3ltYm9sIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaW5mbzogdnNjb2RlLkRvY3VtZW50U3ltYm9sKTogbGFuZ3VhZ2VzLkRvY3VtZW50U3ltYm9sIHtcblx0XHRjb25zdCByZXN1bHQ6IGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbCA9IHtcblx0XHRcdG5hbWU6IGluZm8ubmFtZSB8fCAnISFNSVNTSU5HOiBuYW1lISEnLFxuXHRcdFx0ZGV0YWlsOiBpbmZvLmRldGFpbCxcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGluZm8ucmFuZ2UpLFxuXHRcdFx0c2VsZWN0aW9uUmFuZ2U6IFJhbmdlLmZyb20oaW5mby5zZWxlY3Rpb25SYW5nZSksXG5cdFx0XHRraW5kOiBTeW1ib2xLaW5kLmZyb20oaW5mby5raW5kKSxcblx0XHRcdHRhZ3M6IGluZm8udGFncz8ubWFwKFN5bWJvbFRhZy5mcm9tKSA/PyBbXVxuXHRcdH07XG5cdFx0aWYgKGluZm8uY2hpbGRyZW4pIHtcblx0XHRcdHJlc3VsdC5jaGlsZHJlbiA9IGluZm8uY2hpbGRyZW4ubWFwKGZyb20pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhpbmZvOiBsYW5ndWFnZXMuRG9jdW1lbnRTeW1ib2wpOiB2c2NvZGUuRG9jdW1lbnRTeW1ib2wge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5Eb2N1bWVudFN5bWJvbChcblx0XHRcdGluZm8ubmFtZSxcblx0XHRcdGluZm8uZGV0YWlsLFxuXHRcdFx0U3ltYm9sS2luZC50byhpbmZvLmtpbmQpLFxuXHRcdFx0UmFuZ2UudG8oaW5mby5yYW5nZSksXG5cdFx0XHRSYW5nZS50byhpbmZvLnNlbGVjdGlvblJhbmdlKSxcblx0XHQpO1xuXHRcdGlmIChpc05vbkVtcHR5QXJyYXkoaW5mby50YWdzKSkge1xuXHRcdFx0cmVzdWx0LnRhZ3MgPSBpbmZvLnRhZ3MubWFwKFN5bWJvbFRhZy50byk7XG5cdFx0fVxuXHRcdGlmIChpbmZvLmNoaWxkcmVuKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJlc3VsdC5jaGlsZHJlbiA9IGluZm8uY2hpbGRyZW4ubWFwKHRvKSBhcyBhbnk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDYWxsSGllcmFyY2h5SXRlbSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGl0ZW06IGV4dEhvc3RQcm90b2NvbC5JQ2FsbEhpZXJhcmNoeUl0ZW1EdG8pOiB0eXBlcy5DYWxsSGllcmFyY2h5SXRlbSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IHR5cGVzLkNhbGxIaWVyYXJjaHlJdGVtKFxuXHRcdFx0U3ltYm9sS2luZC50byhpdGVtLmtpbmQpLFxuXHRcdFx0aXRlbS5uYW1lLFxuXHRcdFx0aXRlbS5kZXRhaWwgfHwgJycsXG5cdFx0XHRVUkkucmV2aXZlKGl0ZW0udXJpKSxcblx0XHRcdFJhbmdlLnRvKGl0ZW0ucmFuZ2UpLFxuXHRcdFx0UmFuZ2UudG8oaXRlbS5zZWxlY3Rpb25SYW5nZSlcblx0XHQpO1xuXG5cdFx0cmVzdWx0Ll9zZXNzaW9uSWQgPSBpdGVtLl9zZXNzaW9uSWQ7XG5cdFx0cmVzdWx0Ll9pdGVtSWQgPSBpdGVtLl9pdGVtSWQ7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaXRlbTogdnNjb2RlLkNhbGxIaWVyYXJjaHlJdGVtLCBzZXNzaW9uSWQ/OiBzdHJpbmcsIGl0ZW1JZD86IHN0cmluZyk6IGV4dEhvc3RQcm90b2NvbC5JQ2FsbEhpZXJhcmNoeUl0ZW1EdG8ge1xuXG5cdFx0c2Vzc2lvbklkID0gc2Vzc2lvbklkID8/ICg8dHlwZXMuQ2FsbEhpZXJhcmNoeUl0ZW0+aXRlbSkuX3Nlc3Npb25JZDtcblx0XHRpdGVtSWQgPSBpdGVtSWQgPz8gKDx0eXBlcy5DYWxsSGllcmFyY2h5SXRlbT5pdGVtKS5faXRlbUlkO1xuXG5cdFx0aWYgKHNlc3Npb25JZCA9PT0gdW5kZWZpbmVkIHx8IGl0ZW1JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgaXRlbScpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRfc2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRfaXRlbUlkOiBpdGVtSWQsXG5cdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRkZXRhaWw6IGl0ZW0uZGV0YWlsLFxuXHRcdFx0a2luZDogU3ltYm9sS2luZC5mcm9tKGl0ZW0ua2luZCksXG5cdFx0XHR1cmk6IGl0ZW0udXJpLFxuXHRcdFx0cmFuZ2U6IFJhbmdlLmZyb20oaXRlbS5yYW5nZSksXG5cdFx0XHRzZWxlY3Rpb25SYW5nZTogUmFuZ2UuZnJvbShpdGVtLnNlbGVjdGlvblJhbmdlKSxcblx0XHRcdHRhZ3M6IGl0ZW0udGFncz8ubWFwKFN5bWJvbFRhZy5mcm9tKVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDYWxsSGllcmFyY2h5SW5jb21pbmdDYWxsIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaXRlbTogZXh0SG9zdFByb3RvY29sLklJbmNvbWluZ0NhbGxEdG8pOiB0eXBlcy5DYWxsSGllcmFyY2h5SW5jb21pbmdDYWxsIHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGwoXG5cdFx0XHRDYWxsSGllcmFyY2h5SXRlbS50byhpdGVtLmZyb20pLFxuXHRcdFx0aXRlbS5mcm9tUmFuZ2VzLm1hcChyID0+IFJhbmdlLnRvKHIpKVxuXHRcdCk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxsIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaXRlbTogZXh0SG9zdFByb3RvY29sLklPdXRnb2luZ0NhbGxEdG8pOiB0eXBlcy5DYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxsIHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGwoXG5cdFx0XHRDYWxsSGllcmFyY2h5SXRlbS50byhpdGVtLnRvKSxcblx0XHRcdGl0ZW0uZnJvbVJhbmdlcy5tYXAociA9PiBSYW5nZS50byhyKSlcblx0XHQpO1xuXHR9XG59XG5cblxuZXhwb3J0IG5hbWVzcGFjZSBsb2NhdGlvbiB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuTG9jYXRpb24pOiBsYW5ndWFnZXMuTG9jYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogdmFsdWUucmFuZ2UgJiYgUmFuZ2UuZnJvbSh2YWx1ZS5yYW5nZSksXG5cdFx0XHR1cmk6IHZhbHVlLnVyaVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IGV4dEhvc3RQcm90b2NvbC5JTG9jYXRpb25EdG8pOiB0eXBlcy5Mb2NhdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5Mb2NhdGlvbihVUkkucmV2aXZlKHZhbHVlLnVyaSksIFJhbmdlLnRvKHZhbHVlLnJhbmdlKSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBEZWZpbml0aW9uTGluayB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuTG9jYXRpb24gfCB2c2NvZGUuRGVmaW5pdGlvbkxpbmspOiBsYW5ndWFnZXMuTG9jYXRpb25MaW5rIHtcblx0XHRjb25zdCBkZWZpbml0aW9uTGluayA9IDx2c2NvZGUuRGVmaW5pdGlvbkxpbms+dmFsdWU7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSA8dnNjb2RlLkxvY2F0aW9uPnZhbHVlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRvcmlnaW5TZWxlY3Rpb25SYW5nZTogZGVmaW5pdGlvbkxpbmsub3JpZ2luU2VsZWN0aW9uUmFuZ2Vcblx0XHRcdFx0PyBSYW5nZS5mcm9tKGRlZmluaXRpb25MaW5rLm9yaWdpblNlbGVjdGlvblJhbmdlKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdHVyaTogZGVmaW5pdGlvbkxpbmsudGFyZ2V0VXJpID8gZGVmaW5pdGlvbkxpbmsudGFyZ2V0VXJpIDogbG9jYXRpb24udXJpLFxuXHRcdFx0cmFuZ2U6IFJhbmdlLmZyb20oZGVmaW5pdGlvbkxpbmsudGFyZ2V0UmFuZ2UgPyBkZWZpbml0aW9uTGluay50YXJnZXRSYW5nZSA6IGxvY2F0aW9uLnJhbmdlKSxcblx0XHRcdHRhcmdldFNlbGVjdGlvblJhbmdlOiBkZWZpbml0aW9uTGluay50YXJnZXRTZWxlY3Rpb25SYW5nZVxuXHRcdFx0XHQ/IFJhbmdlLmZyb20oZGVmaW5pdGlvbkxpbmsudGFyZ2V0U2VsZWN0aW9uUmFuZ2UpXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBleHRIb3N0UHJvdG9jb2wuSUxvY2F0aW9uTGlua0R0byk6IHZzY29kZS5Mb2NhdGlvbkxpbmsge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0YXJnZXRVcmk6IFVSSS5yZXZpdmUodmFsdWUudXJpKSxcblx0XHRcdHRhcmdldFJhbmdlOiBSYW5nZS50byh2YWx1ZS5yYW5nZSksXG5cdFx0XHR0YXJnZXRTZWxlY3Rpb25SYW5nZTogdmFsdWUudGFyZ2V0U2VsZWN0aW9uUmFuZ2Vcblx0XHRcdFx0PyBSYW5nZS50byh2YWx1ZS50YXJnZXRTZWxlY3Rpb25SYW5nZSlcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRvcmlnaW5TZWxlY3Rpb25SYW5nZTogdmFsdWUub3JpZ2luU2VsZWN0aW9uUmFuZ2Vcblx0XHRcdFx0PyBSYW5nZS50byh2YWx1ZS5vcmlnaW5TZWxlY3Rpb25SYW5nZSlcblx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSG92ZXIge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShob3ZlcjogdnNjb2RlLlZlcmJvc2VIb3Zlcik6IGxhbmd1YWdlcy5Ib3ZlciB7XG5cdFx0Y29uc3QgY29udmVydGVkSG92ZXI6IGxhbmd1YWdlcy5Ib3ZlciA9IHtcblx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGhvdmVyLnJhbmdlKSxcblx0XHRcdGNvbnRlbnRzOiBNYXJrZG93blN0cmluZy5mcm9tTWFueShob3Zlci5jb250ZW50cyksXG5cdFx0XHRjYW5JbmNyZWFzZVZlcmJvc2l0eTogaG92ZXIuY2FuSW5jcmVhc2VWZXJib3NpdHksXG5cdFx0XHRjYW5EZWNyZWFzZVZlcmJvc2l0eTogaG92ZXIuY2FuRGVjcmVhc2VWZXJib3NpdHksXG5cdFx0fTtcblx0XHRyZXR1cm4gY29udmVydGVkSG92ZXI7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaW5mbzogbGFuZ3VhZ2VzLkhvdmVyKTogdHlwZXMuVmVyYm9zZUhvdmVyIHtcblx0XHRjb25zdCBjb250ZW50cyA9IGluZm8uY29udGVudHMubWFwKE1hcmtkb3duU3RyaW5nLnRvKTtcblx0XHRjb25zdCByYW5nZSA9IFJhbmdlLnRvKGluZm8ucmFuZ2UpO1xuXHRcdGNvbnN0IGNhbkluY3JlYXNlVmVyYm9zaXR5ID0gaW5mby5jYW5JbmNyZWFzZVZlcmJvc2l0eTtcblx0XHRjb25zdCBjYW5EZWNyZWFzZVZlcmJvc2l0eSA9IGluZm8uY2FuRGVjcmVhc2VWZXJib3NpdHk7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5WZXJib3NlSG92ZXIoY29udGVudHMsIHJhbmdlLCBjYW5JbmNyZWFzZVZlcmJvc2l0eSwgY2FuRGVjcmVhc2VWZXJib3NpdHkpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRXZhbHVhdGFibGVFeHByZXNzaW9uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oZXhwcmVzc2lvbjogdnNjb2RlLkV2YWx1YXRhYmxlRXhwcmVzc2lvbik6IGxhbmd1YWdlcy5FdmFsdWF0YWJsZUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShleHByZXNzaW9uLnJhbmdlKSxcblx0XHRcdGV4cHJlc3Npb246IGV4cHJlc3Npb24uZXhwcmVzc2lvblxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaW5mbzogbGFuZ3VhZ2VzLkV2YWx1YXRhYmxlRXhwcmVzc2lvbik6IHR5cGVzLkV2YWx1YXRhYmxlRXhwcmVzc2lvbiB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5FdmFsdWF0YWJsZUV4cHJlc3Npb24oUmFuZ2UudG8oaW5mby5yYW5nZSksIGluZm8uZXhwcmVzc2lvbik7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJbmxpbmVWYWx1ZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGlubGluZVZhbHVlOiB2c2NvZGUuSW5saW5lVmFsdWUpOiBsYW5ndWFnZXMuSW5saW5lVmFsdWUge1xuXHRcdGlmIChpbmxpbmVWYWx1ZSBpbnN0YW5jZW9mIHR5cGVzLklubGluZVZhbHVlVGV4dCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ3RleHQnLFxuXHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShpbmxpbmVWYWx1ZS5yYW5nZSksXG5cdFx0XHRcdHRleHQ6IGlubGluZVZhbHVlLnRleHRcblx0XHRcdH0gc2F0aXNmaWVzIGxhbmd1YWdlcy5JbmxpbmVWYWx1ZVRleHQ7XG5cdFx0fSBlbHNlIGlmIChpbmxpbmVWYWx1ZSBpbnN0YW5jZW9mIHR5cGVzLklubGluZVZhbHVlVmFyaWFibGVMb29rdXApIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICd2YXJpYWJsZScsXG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tKGlubGluZVZhbHVlLnJhbmdlKSxcblx0XHRcdFx0dmFyaWFibGVOYW1lOiBpbmxpbmVWYWx1ZS52YXJpYWJsZU5hbWUsXG5cdFx0XHRcdGNhc2VTZW5zaXRpdmVMb29rdXA6IGlubGluZVZhbHVlLmNhc2VTZW5zaXRpdmVMb29rdXBcblx0XHRcdH0gc2F0aXNmaWVzIGxhbmd1YWdlcy5JbmxpbmVWYWx1ZVZhcmlhYmxlTG9va3VwO1xuXHRcdH0gZWxzZSBpZiAoaW5saW5lVmFsdWUgaW5zdGFuY2VvZiB0eXBlcy5JbmxpbmVWYWx1ZUV2YWx1YXRhYmxlRXhwcmVzc2lvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2V4cHJlc3Npb24nLFxuXHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShpbmxpbmVWYWx1ZS5yYW5nZSksXG5cdFx0XHRcdGV4cHJlc3Npb246IGlubGluZVZhbHVlLmV4cHJlc3Npb25cblx0XHRcdH0gc2F0aXNmaWVzIGxhbmd1YWdlcy5JbmxpbmVWYWx1ZUV4cHJlc3Npb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biAnSW5saW5lVmFsdWUnIHR5cGVgKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaW5saW5lVmFsdWU6IGxhbmd1YWdlcy5JbmxpbmVWYWx1ZSk6IHZzY29kZS5JbmxpbmVWYWx1ZSB7XG5cdFx0c3dpdGNoIChpbmxpbmVWYWx1ZS50eXBlKSB7XG5cdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyYW5nZTogUmFuZ2UudG8oaW5saW5lVmFsdWUucmFuZ2UpLFxuXHRcdFx0XHRcdHRleHQ6IGlubGluZVZhbHVlLnRleHRcblx0XHRcdFx0fSBzYXRpc2ZpZXMgdnNjb2RlLklubGluZVZhbHVlVGV4dDtcblx0XHRcdGNhc2UgJ3ZhcmlhYmxlJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyYW5nZTogUmFuZ2UudG8oaW5saW5lVmFsdWUucmFuZ2UpLFxuXHRcdFx0XHRcdHZhcmlhYmxlTmFtZTogaW5saW5lVmFsdWUudmFyaWFibGVOYW1lLFxuXHRcdFx0XHRcdGNhc2VTZW5zaXRpdmVMb29rdXA6IGlubGluZVZhbHVlLmNhc2VTZW5zaXRpdmVMb29rdXBcblx0XHRcdFx0fSBzYXRpc2ZpZXMgdnNjb2RlLklubGluZVZhbHVlVmFyaWFibGVMb29rdXA7XG5cdFx0XHRjYXNlICdleHByZXNzaW9uJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyYW5nZTogUmFuZ2UudG8oaW5saW5lVmFsdWUucmFuZ2UpLFxuXHRcdFx0XHRcdGV4cHJlc3Npb246IGlubGluZVZhbHVlLmV4cHJlc3Npb25cblx0XHRcdFx0fSBzYXRpc2ZpZXMgdnNjb2RlLklubGluZVZhbHVlRXZhbHVhdGFibGVFeHByZXNzaW9uO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIElubGluZVZhbHVlQ29udGV4dCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGlubGluZVZhbHVlQ29udGV4dDogdnNjb2RlLklubGluZVZhbHVlQ29udGV4dCk6IGV4dEhvc3RQcm90b2NvbC5JSW5saW5lVmFsdWVDb250ZXh0RHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZnJhbWVJZDogaW5saW5lVmFsdWVDb250ZXh0LmZyYW1lSWQsXG5cdFx0XHRzdG9wcGVkTG9jYXRpb246IFJhbmdlLmZyb20oaW5saW5lVmFsdWVDb250ZXh0LnN0b3BwZWRMb2NhdGlvbilcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGlubGluZVZhbHVlQ29udGV4dDogZXh0SG9zdFByb3RvY29sLklJbmxpbmVWYWx1ZUNvbnRleHREdG8pOiB0eXBlcy5JbmxpbmVWYWx1ZUNvbnRleHQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuSW5saW5lVmFsdWVDb250ZXh0KGlubGluZVZhbHVlQ29udGV4dC5mcmFtZUlkLCBSYW5nZS50byhpbmxpbmVWYWx1ZUNvbnRleHQuc3RvcHBlZExvY2F0aW9uKSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBEb2N1bWVudEhpZ2hsaWdodCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGRvY3VtZW50SGlnaGxpZ2h0OiB2c2NvZGUuRG9jdW1lbnRIaWdobGlnaHQpOiBsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShkb2N1bWVudEhpZ2hsaWdodC5yYW5nZSksXG5cdFx0XHRraW5kOiBkb2N1bWVudEhpZ2hsaWdodC5raW5kXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8ob2NjdXJyZW5jZTogbGFuZ3VhZ2VzLkRvY3VtZW50SGlnaGxpZ2h0KTogdHlwZXMuRG9jdW1lbnRIaWdobGlnaHQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuRG9jdW1lbnRIaWdobGlnaHQoUmFuZ2UudG8ob2NjdXJyZW5jZS5yYW5nZSksIG9jY3VycmVuY2Uua2luZCk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBNdWx0aURvY3VtZW50SGlnaGxpZ2h0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20obXVsdGlEb2N1bWVudEhpZ2hsaWdodDogdnNjb2RlLk11bHRpRG9jdW1lbnRIaWdobGlnaHQpOiBsYW5ndWFnZXMuTXVsdGlEb2N1bWVudEhpZ2hsaWdodCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogbXVsdGlEb2N1bWVudEhpZ2hsaWdodC51cmksXG5cdFx0XHRoaWdobGlnaHRzOiBtdWx0aURvY3VtZW50SGlnaGxpZ2h0LmhpZ2hsaWdodHMubWFwKERvY3VtZW50SGlnaGxpZ2h0LmZyb20pXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhtdWx0aURvY3VtZW50SGlnaGxpZ2h0OiBsYW5ndWFnZXMuTXVsdGlEb2N1bWVudEhpZ2hsaWdodCk6IHR5cGVzLk11bHRpRG9jdW1lbnRIaWdobGlnaHQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuTXVsdGlEb2N1bWVudEhpZ2hsaWdodChVUkkucmV2aXZlKG11bHRpRG9jdW1lbnRIaWdobGlnaHQudXJpKSwgbXVsdGlEb2N1bWVudEhpZ2hsaWdodC5oaWdobGlnaHRzLm1hcChEb2N1bWVudEhpZ2hsaWdodC50bykpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29tcGxldGlvblRyaWdnZXJLaW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGtpbmQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQpIHtcblx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdGNhc2UgbGFuZ3VhZ2VzLkNvbXBsZXRpb25UcmlnZ2VyS2luZC5UcmlnZ2VyQ2hhcmFjdGVyOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXI7XG5cdFx0XHRjYXNlIGxhbmd1YWdlcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckZvckluY29tcGxldGVDb21wbGV0aW9uczpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkNvbXBsZXRpb25UcmlnZ2VyS2luZC5UcmlnZ2VyRm9ySW5jb21wbGV0ZUNvbXBsZXRpb25zO1xuXHRcdFx0Y2FzZSBsYW5ndWFnZXMuQ29tcGxldGlvblRyaWdnZXJLaW5kLkludm9rZTpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENvbXBsZXRpb25Db250ZXh0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGNvbnRleHQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uQ29udGV4dCk6IHR5cGVzLkNvbXBsZXRpb25Db250ZXh0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC50byhjb250ZXh0LnRyaWdnZXJLaW5kKSxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXI6IGNvbnRleHQudHJpZ2dlckNoYXJhY3RlclxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDb21wbGV0aW9uSXRlbVRhZyB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oa2luZDogdHlwZXMuQ29tcGxldGlvbkl0ZW1UYWcpOiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1UYWcge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSB0eXBlcy5Db21wbGV0aW9uSXRlbVRhZy5EZXByZWNhdGVkOiByZXR1cm4gbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtVGFnLkRlcHJlY2F0ZWQ7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGtpbmQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVRhZyk6IHR5cGVzLkNvbXBsZXRpb25JdGVtVGFnIHtcblx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdGNhc2UgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtVGFnLkRlcHJlY2F0ZWQ6IHJldHVybiB0eXBlcy5Db21wbGV0aW9uSXRlbVRhZy5EZXByZWNhdGVkO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENvbXBsZXRpb25Db21tYW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oYzogdnNjb2RlLkNvbW1hbmQgfCB7IGNvbW1hbmQ6IHZzY29kZS5Db21tYW5kOyBpY29uOiB2c2NvZGUuVGhlbWVJY29uIH0sIGNvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB7IGNvbW1hbmQ6IGV4dEhvc3RQcm90b2NvbC5JQ29tbWFuZER0bzsgaWNvbj86IGxhbmd1YWdlcy5JY29uUGF0aCB9IHtcblx0XHRpZiAoJ2ljb24nIGluIGMgJiYgJ2NvbW1hbmQnIGluIGMpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvbW1hbmQ6IGNvbnZlcnRlci50b0ludGVybmFsKGMuY29tbWFuZCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRpY29uOiBJY29uUGF0aC5mcm9tVGhlbWVJY29uKGMuaWNvbilcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7IGNvbW1hbmQ6IGNvbnZlcnRlci50b0ludGVybmFsKGMsIGRpc3Bvc2FibGVzKSB9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29tcGxldGlvbkl0ZW1LaW5kIHtcblxuXHRjb25zdCBfZnJvbSA9IG5ldyBNYXA8dHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kPihbXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5NZXRob2QsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuTWV0aG9kXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZ1bmN0aW9uLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZ1bmN0aW9uXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0cnVjdG9yLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0cnVjdG9yXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZpZWxkLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZpZWxkXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlZhcmlhYmxlLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlZhcmlhYmxlXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNsYXNzLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNsYXNzXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkludGVyZmFjZSwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5JbnRlcmZhY2VdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuU3RydWN0LCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlN0cnVjdF0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Nb2R1bGUsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuTW9kdWxlXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5LCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5XSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlVuaXQsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuVW5pdF0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5WYWx1ZSwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5WYWx1ZV0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Db25zdGFudCwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Db25zdGFudF0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5FbnVtLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkVudW1dLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRW51bU1lbWJlciwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5FbnVtTWVtYmVyXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLktleXdvcmQsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuS2V5d29yZF0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0LCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXRdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuVGV4dCwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5UZXh0XSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbG9yLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbG9yXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuRmlsZV0sXG5cdFx0W3R5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5SZWZlcmVuY2UsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuUmVmZXJlbmNlXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlciwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXJdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRXZlbnQsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuRXZlbnRdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuT3BlcmF0b3IsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuT3BlcmF0b3JdLFxuXHRcdFt0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuVHlwZVBhcmFtZXRlciwgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5UeXBlUGFyYW1ldGVyXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLklzc3VlLCBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLklzc3VlXSxcblx0XHRbdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXIsIGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuVXNlcl0sXG5cdF0pO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGtpbmQ6IHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZCk6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQge1xuXHRcdHJldHVybiBfZnJvbS5nZXQoa2luZCkgPz8gbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eTtcblx0fVxuXG5cdGNvbnN0IF90byA9IG5ldyBNYXA8bGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZCwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kPihbXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuTWV0aG9kLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuTWV0aG9kXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5GdW5jdGlvbiwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZ1bmN0aW9uXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Db25zdHJ1Y3RvciwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbnN0cnVjdG9yXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5GaWVsZCwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkZpZWxkXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5WYXJpYWJsZSwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlZhcmlhYmxlXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5DbGFzcywgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNsYXNzXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5JbnRlcmZhY2UsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5JbnRlcmZhY2VdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlN0cnVjdCwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlN0cnVjdF0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuTW9kdWxlLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuTW9kdWxlXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlByb3BlcnR5XSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Vbml0LCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuVW5pdF0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuVmFsdWUsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5WYWx1ZV0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuQ29uc3RhbnQsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Db25zdGFudF0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuRW51bSwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkVudW1dLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkVudW1NZW1iZXIsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5FbnVtTWVtYmVyXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5LZXl3b3JkLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuS2V5d29yZF0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXRdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5UZXh0XSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Db2xvciwgdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkNvbG9yXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5GaWxlLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRmlsZV0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuUmVmZXJlbmNlLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuUmVmZXJlbmNlXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXJdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLkV2ZW50LCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuRXZlbnRdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLk9wZXJhdG9yLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuT3BlcmF0b3JdLFxuXHRcdFtsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlR5cGVQYXJhbWV0ZXIsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5UeXBlUGFyYW1ldGVyXSxcblx0XHRbbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Vc2VyLCB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuVXNlcl0sXG5cdFx0W2xhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuSXNzdWUsIHR5cGVzLkNvbXBsZXRpb25JdGVtS2luZC5Jc3N1ZV0sXG5cdF0pO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhraW5kOiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kKTogdHlwZXMuQ29tcGxldGlvbkl0ZW1LaW5kIHtcblx0XHRyZXR1cm4gX3RvLmdldChraW5kKSA/PyB0eXBlcy5Db21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDb21wbGV0aW9uSXRlbSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHN1Z2dlc3Rpb246IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbSwgY29udmVydGVyPzogQ29tbWFuZC5JQ29tbWFuZHNDb252ZXJ0ZXIpOiB0eXBlcy5Db21wbGV0aW9uSXRlbSB7XG5cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuQ29tcGxldGlvbkl0ZW0oc3VnZ2VzdGlvbi5sYWJlbCk7XG5cdFx0cmVzdWx0Lmluc2VydFRleHQgPSBzdWdnZXN0aW9uLmluc2VydFRleHQ7XG5cdFx0cmVzdWx0LmtpbmQgPSBDb21wbGV0aW9uSXRlbUtpbmQudG8oc3VnZ2VzdGlvbi5raW5kKTtcblx0XHRyZXN1bHQudGFncyA9IHN1Z2dlc3Rpb24udGFncz8ubWFwKENvbXBsZXRpb25JdGVtVGFnLnRvKTtcblx0XHRyZXN1bHQuZGV0YWlsID0gc3VnZ2VzdGlvbi5kZXRhaWw7XG5cdFx0cmVzdWx0LmRvY3VtZW50YXRpb24gPSBodG1sQ29udGVudC5pc01hcmtkb3duU3RyaW5nKHN1Z2dlc3Rpb24uZG9jdW1lbnRhdGlvbikgPyBNYXJrZG93blN0cmluZy50byhzdWdnZXN0aW9uLmRvY3VtZW50YXRpb24pIDogc3VnZ2VzdGlvbi5kb2N1bWVudGF0aW9uO1xuXHRcdHJlc3VsdC5zb3J0VGV4dCA9IHN1Z2dlc3Rpb24uc29ydFRleHQ7XG5cdFx0cmVzdWx0LmZpbHRlclRleHQgPSBzdWdnZXN0aW9uLmZpbHRlclRleHQ7XG5cdFx0cmVzdWx0LnByZXNlbGVjdCA9IHN1Z2dlc3Rpb24ucHJlc2VsZWN0O1xuXHRcdHJlc3VsdC5jb21taXRDaGFyYWN0ZXJzID0gc3VnZ2VzdGlvbi5jb21taXRDaGFyYWN0ZXJzO1xuXG5cdFx0Ly8gcmFuZ2Vcblx0XHRpZiAoZWRpdG9yUmFuZ2UuUmFuZ2UuaXNJUmFuZ2Uoc3VnZ2VzdGlvbi5yYW5nZSkpIHtcblx0XHRcdHJlc3VsdC5yYW5nZSA9IFJhbmdlLnRvKHN1Z2dlc3Rpb24ucmFuZ2UpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHN1Z2dlc3Rpb24ucmFuZ2UgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXN1bHQucmFuZ2UgPSB7IGluc2VydGluZzogUmFuZ2UudG8oc3VnZ2VzdGlvbi5yYW5nZS5pbnNlcnQpLCByZXBsYWNpbmc6IFJhbmdlLnRvKHN1Z2dlc3Rpb24ucmFuZ2UucmVwbGFjZSkgfTtcblx0XHR9XG5cblx0XHRyZXN1bHQua2VlcFdoaXRlc3BhY2UgPSB0eXBlb2Ygc3VnZ2VzdGlvbi5pbnNlcnRUZXh0UnVsZXMgPT09ICd1bmRlZmluZWQnID8gZmFsc2UgOiBCb29sZWFuKHN1Z2dlc3Rpb24uaW5zZXJ0VGV4dFJ1bGVzICYgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuS2VlcFdoaXRlc3BhY2UpO1xuXHRcdC8vICdpbnNlcnRUZXh0Jy1sb2dpY1xuXHRcdGlmICh0eXBlb2Ygc3VnZ2VzdGlvbi5pbnNlcnRUZXh0UnVsZXMgIT09ICd1bmRlZmluZWQnICYmIHN1Z2dlc3Rpb24uaW5zZXJ0VGV4dFJ1bGVzICYgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuSW5zZXJ0QXNTbmlwcGV0KSB7XG5cdFx0XHRyZXN1bHQuaW5zZXJ0VGV4dCA9IG5ldyB0eXBlcy5TbmlwcGV0U3RyaW5nKHN1Z2dlc3Rpb24uaW5zZXJ0VGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdC5pbnNlcnRUZXh0ID0gc3VnZ2VzdGlvbi5pbnNlcnRUZXh0O1xuXHRcdFx0cmVzdWx0LnRleHRFZGl0ID0gcmVzdWx0LnJhbmdlIGluc3RhbmNlb2YgdHlwZXMuUmFuZ2UgPyBuZXcgdHlwZXMuVGV4dEVkaXQocmVzdWx0LnJhbmdlLCByZXN1bHQuaW5zZXJ0VGV4dCkgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChzdWdnZXN0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMgJiYgc3VnZ2VzdGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlc3VsdC5hZGRpdGlvbmFsVGV4dEVkaXRzID0gc3VnZ2VzdGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzLm1hcChlID0+IFRleHRFZGl0LnRvKGUgYXMgbGFuZ3VhZ2VzLlRleHRFZGl0KSk7XG5cdFx0fVxuXHRcdHJlc3VsdC5jb21tYW5kID0gY29udmVydGVyICYmIHN1Z2dlc3Rpb24uY29tbWFuZCA/IGNvbnZlcnRlci5mcm9tSW50ZXJuYWwoc3VnZ2VzdGlvbi5jb21tYW5kKSA6IHVuZGVmaW5lZDtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBQYXJhbWV0ZXJJbmZvcm1hdGlvbiB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGluZm86IHR5cGVzLlBhcmFtZXRlckluZm9ybWF0aW9uKTogbGFuZ3VhZ2VzLlBhcmFtZXRlckluZm9ybWF0aW9uIHtcblx0XHRpZiAodHlwZW9mIGluZm8ubGFiZWwgIT09ICdzdHJpbmcnICYmICFBcnJheS5pc0FycmF5KGluZm8ubGFiZWwpKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdJbnZhbGlkIGxhYmVsJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiBpbmZvLmxhYmVsLFxuXHRcdFx0ZG9jdW1lbnRhdGlvbjogTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChpbmZvLmRvY3VtZW50YXRpb24pXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaW5mbzogbGFuZ3VhZ2VzLlBhcmFtZXRlckluZm9ybWF0aW9uKTogdHlwZXMuUGFyYW1ldGVySW5mb3JtYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogaW5mby5sYWJlbCxcblx0XHRcdGRvY3VtZW50YXRpb246IGh0bWxDb250ZW50LmlzTWFya2Rvd25TdHJpbmcoaW5mby5kb2N1bWVudGF0aW9uKSA/IE1hcmtkb3duU3RyaW5nLnRvKGluZm8uZG9jdW1lbnRhdGlvbikgOiBpbmZvLmRvY3VtZW50YXRpb25cblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgU2lnbmF0dXJlSW5mb3JtYXRpb24ge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGluZm86IHR5cGVzLlNpZ25hdHVyZUluZm9ybWF0aW9uKTogbGFuZ3VhZ2VzLlNpZ25hdHVyZUluZm9ybWF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGluZm8ubGFiZWwsXG5cdFx0XHRkb2N1bWVudGF0aW9uOiBNYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KGluZm8uZG9jdW1lbnRhdGlvbiksXG5cdFx0XHRwYXJhbWV0ZXJzOiBBcnJheS5pc0FycmF5KGluZm8ucGFyYW1ldGVycykgPyBpbmZvLnBhcmFtZXRlcnMubWFwKFBhcmFtZXRlckluZm9ybWF0aW9uLmZyb20pIDogW10sXG5cdFx0XHRhY3RpdmVQYXJhbWV0ZXI6IGluZm8uYWN0aXZlUGFyYW1ldGVyLFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oaW5mbzogbGFuZ3VhZ2VzLlNpZ25hdHVyZUluZm9ybWF0aW9uKTogdHlwZXMuU2lnbmF0dXJlSW5mb3JtYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogaW5mby5sYWJlbCxcblx0XHRcdGRvY3VtZW50YXRpb246IGh0bWxDb250ZW50LmlzTWFya2Rvd25TdHJpbmcoaW5mby5kb2N1bWVudGF0aW9uKSA/IE1hcmtkb3duU3RyaW5nLnRvKGluZm8uZG9jdW1lbnRhdGlvbikgOiBpbmZvLmRvY3VtZW50YXRpb24sXG5cdFx0XHRwYXJhbWV0ZXJzOiBBcnJheS5pc0FycmF5KGluZm8ucGFyYW1ldGVycykgPyBpbmZvLnBhcmFtZXRlcnMubWFwKFBhcmFtZXRlckluZm9ybWF0aW9uLnRvKSA6IFtdLFxuXHRcdFx0YWN0aXZlUGFyYW1ldGVyOiBpbmZvLmFjdGl2ZVBhcmFtZXRlcixcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgU2lnbmF0dXJlSGVscCB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaGVscDogdHlwZXMuU2lnbmF0dXJlSGVscCk6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YWN0aXZlU2lnbmF0dXJlOiBoZWxwLmFjdGl2ZVNpZ25hdHVyZSxcblx0XHRcdGFjdGl2ZVBhcmFtZXRlcjogaGVscC5hY3RpdmVQYXJhbWV0ZXIsXG5cdFx0XHRzaWduYXR1cmVzOiBBcnJheS5pc0FycmF5KGhlbHAuc2lnbmF0dXJlcykgPyBoZWxwLnNpZ25hdHVyZXMubWFwKFNpZ25hdHVyZUluZm9ybWF0aW9uLmZyb20pIDogW10sXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhoZWxwOiBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscCk6IHR5cGVzLlNpZ25hdHVyZUhlbHAge1xuXHRcdHJldHVybiB7XG5cdFx0XHRhY3RpdmVTaWduYXR1cmU6IGhlbHAuYWN0aXZlU2lnbmF0dXJlLFxuXHRcdFx0YWN0aXZlUGFyYW1ldGVyOiBoZWxwLmFjdGl2ZVBhcmFtZXRlcixcblx0XHRcdHNpZ25hdHVyZXM6IEFycmF5LmlzQXJyYXkoaGVscC5zaWduYXR1cmVzKSA/IGhlbHAuc2lnbmF0dXJlcy5tYXAoU2lnbmF0dXJlSW5mb3JtYXRpb24udG8pIDogW10sXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIElubGF5SGludCB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGNvbnZlcnRlcjogQ29tbWFuZC5JQ29tbWFuZHNDb252ZXJ0ZXIsIGhpbnQ6IGxhbmd1YWdlcy5JbmxheUhpbnQpOiB2c2NvZGUuSW5sYXlIaW50IHtcblx0XHRjb25zdCByZXMgPSBuZXcgdHlwZXMuSW5sYXlIaW50KFxuXHRcdFx0UG9zaXRpb24udG8oaGludC5wb3NpdGlvbiksXG5cdFx0XHR0eXBlb2YgaGludC5sYWJlbCA9PT0gJ3N0cmluZycgPyBoaW50LmxhYmVsIDogaGludC5sYWJlbC5tYXAoSW5sYXlIaW50TGFiZWxQYXJ0LnRvLmJpbmQodW5kZWZpbmVkLCBjb252ZXJ0ZXIpKSxcblx0XHRcdGhpbnQua2luZCAmJiBJbmxheUhpbnRLaW5kLnRvKGhpbnQua2luZClcblx0XHQpO1xuXHRcdHJlcy50ZXh0RWRpdHMgPSBoaW50LnRleHRFZGl0cyAmJiBoaW50LnRleHRFZGl0cy5tYXAoVGV4dEVkaXQudG8pO1xuXHRcdHJlcy50b29sdGlwID0gaHRtbENvbnRlbnQuaXNNYXJrZG93blN0cmluZyhoaW50LnRvb2x0aXApID8gTWFya2Rvd25TdHJpbmcudG8oaGludC50b29sdGlwKSA6IGhpbnQudG9vbHRpcDtcblx0XHRyZXMucGFkZGluZ0xlZnQgPSBoaW50LnBhZGRpbmdMZWZ0O1xuXHRcdHJlcy5wYWRkaW5nUmlnaHQgPSBoaW50LnBhZGRpbmdSaWdodDtcblx0XHRyZXR1cm4gcmVzO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgSW5sYXlIaW50TGFiZWxQYXJ0IHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oY29udmVydGVyOiBDb21tYW5kLklDb21tYW5kc0NvbnZlcnRlciwgcGFydDogbGFuZ3VhZ2VzLklubGF5SGludExhYmVsUGFydCk6IHR5cGVzLklubGF5SGludExhYmVsUGFydCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IHR5cGVzLklubGF5SGludExhYmVsUGFydChwYXJ0LmxhYmVsKTtcblx0XHRyZXN1bHQudG9vbHRpcCA9IGh0bWxDb250ZW50LmlzTWFya2Rvd25TdHJpbmcocGFydC50b29sdGlwKVxuXHRcdFx0PyBNYXJrZG93blN0cmluZy50byhwYXJ0LnRvb2x0aXApXG5cdFx0XHQ6IHBhcnQudG9vbHRpcDtcblx0XHRpZiAobGFuZ3VhZ2VzLkNvbW1hbmQuaXMocGFydC5jb21tYW5kKSkge1xuXHRcdFx0cmVzdWx0LmNvbW1hbmQgPSBjb252ZXJ0ZXIuZnJvbUludGVybmFsKHBhcnQuY29tbWFuZCk7XG5cdFx0fVxuXHRcdGlmIChwYXJ0LmxvY2F0aW9uKSB7XG5cdFx0XHRyZXN1bHQubG9jYXRpb24gPSBsb2NhdGlvbi50byhwYXJ0LmxvY2F0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIElubGF5SGludEtpbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShraW5kOiB2c2NvZGUuSW5sYXlIaW50S2luZCk6IGxhbmd1YWdlcy5JbmxheUhpbnRLaW5kIHtcblx0XHRyZXR1cm4ga2luZDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8oa2luZDogbGFuZ3VhZ2VzLklubGF5SGludEtpbmQpOiB2c2NvZGUuSW5sYXlIaW50S2luZCB7XG5cdFx0cmV0dXJuIGtpbmQ7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBEb2N1bWVudExpbmsge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGxpbms6IHZzY29kZS5Eb2N1bWVudExpbmspOiBsYW5ndWFnZXMuSUxpbmsge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShsaW5rLnJhbmdlKSxcblx0XHRcdHVybDogbGluay50YXJnZXQsXG5cdFx0XHR0b29sdGlwOiBsaW5rLnRvb2x0aXBcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGxpbms6IGxhbmd1YWdlcy5JTGluayk6IHZzY29kZS5Eb2N1bWVudExpbmsge1xuXHRcdGxldCB0YXJnZXQ6IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAobGluay51cmwpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRhcmdldCA9IHR5cGVvZiBsaW5rLnVybCA9PT0gJ3N0cmluZycgPyBVUkkucGFyc2UobGluay51cmwsIHRydWUpIDogVVJJLnJldml2ZShsaW5rLnVybCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5Eb2N1bWVudExpbmsoUmFuZ2UudG8obGluay5yYW5nZSksIHRhcmdldCk7XG5cdFx0cmVzdWx0LnRvb2x0aXAgPSBsaW5rLnRvb2x0aXA7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENvbG9yUHJlc2VudGF0aW9uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGNvbG9yUHJlc2VudGF0aW9uOiBsYW5ndWFnZXMuSUNvbG9yUHJlc2VudGF0aW9uKTogdHlwZXMuQ29sb3JQcmVzZW50YXRpb24ge1xuXHRcdGNvbnN0IGNwID0gbmV3IHR5cGVzLkNvbG9yUHJlc2VudGF0aW9uKGNvbG9yUHJlc2VudGF0aW9uLmxhYmVsKTtcblx0XHRpZiAoY29sb3JQcmVzZW50YXRpb24udGV4dEVkaXQpIHtcblx0XHRcdGNwLnRleHRFZGl0ID0gVGV4dEVkaXQudG8oY29sb3JQcmVzZW50YXRpb24udGV4dEVkaXQpO1xuXHRcdH1cblx0XHRpZiAoY29sb3JQcmVzZW50YXRpb24uYWRkaXRpb25hbFRleHRFZGl0cykge1xuXHRcdFx0Y3AuYWRkaXRpb25hbFRleHRFZGl0cyA9IGNvbG9yUHJlc2VudGF0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMubWFwKHZhbHVlID0+IFRleHRFZGl0LnRvKHZhbHVlKSk7XG5cdFx0fVxuXHRcdHJldHVybiBjcDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGNvbG9yUHJlc2VudGF0aW9uOiB2c2NvZGUuQ29sb3JQcmVzZW50YXRpb24pOiBsYW5ndWFnZXMuSUNvbG9yUHJlc2VudGF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGNvbG9yUHJlc2VudGF0aW9uLmxhYmVsLFxuXHRcdFx0dGV4dEVkaXQ6IGNvbG9yUHJlc2VudGF0aW9uLnRleHRFZGl0ID8gVGV4dEVkaXQuZnJvbShjb2xvclByZXNlbnRhdGlvbi50ZXh0RWRpdCkgOiB1bmRlZmluZWQsXG5cdFx0XHRhZGRpdGlvbmFsVGV4dEVkaXRzOiBjb2xvclByZXNlbnRhdGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzID8gY29sb3JQcmVzZW50YXRpb24uYWRkaXRpb25hbFRleHRFZGl0cy5tYXAodmFsdWUgPT4gVGV4dEVkaXQuZnJvbSh2YWx1ZSkpIDogdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENvbG9yIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGM6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXJdKTogdHlwZXMuQ29sb3Ige1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ29sb3IoY1swXSwgY1sxXSwgY1syXSwgY1szXSk7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oY29sb3I6IHR5cGVzLkNvbG9yKTogW251bWJlciwgbnVtYmVyLCBudW1iZXIsIG51bWJlcl0ge1xuXHRcdHJldHVybiBbY29sb3IucmVkLCBjb2xvci5ncmVlbiwgY29sb3IuYmx1ZSwgY29sb3IuYWxwaGFdO1xuXHR9XG59XG5cblxuZXhwb3J0IG5hbWVzcGFjZSBTZWxlY3Rpb25SYW5nZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKG9iajogdnNjb2RlLlNlbGVjdGlvblJhbmdlKTogbGFuZ3VhZ2VzLlNlbGVjdGlvblJhbmdlIHtcblx0XHRyZXR1cm4geyByYW5nZTogUmFuZ2UuZnJvbShvYmoucmFuZ2UpIH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ob2JqOiBsYW5ndWFnZXMuU2VsZWN0aW9uUmFuZ2UpOiB2c2NvZGUuU2VsZWN0aW9uUmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuU2VsZWN0aW9uUmFuZ2UoUmFuZ2UudG8ob2JqLnJhbmdlKSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXh0RG9jdW1lbnRTYXZlUmVhc29uIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocmVhc29uOiBTYXZlUmVhc29uKTogdnNjb2RlLlRleHREb2N1bWVudFNhdmVSZWFzb24ge1xuXHRcdHN3aXRjaCAocmVhc29uKSB7XG5cdFx0XHRjYXNlIFNhdmVSZWFzb24uQVVUTzpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLlRleHREb2N1bWVudFNhdmVSZWFzb24uQWZ0ZXJEZWxheTtcblx0XHRcdGNhc2UgU2F2ZVJlYXNvbi5FWFBMSUNJVDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLlRleHREb2N1bWVudFNhdmVSZWFzb24uTWFudWFsO1xuXHRcdFx0Y2FzZSBTYXZlUmVhc29uLkZPQ1VTX0NIQU5HRTpcblx0XHRcdGNhc2UgU2F2ZVJlYXNvbi5XSU5ET1dfQ0hBTkdFOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuVGV4dERvY3VtZW50U2F2ZVJlYXNvbi5Gb2N1c091dDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHN0eWxlOiB2c2NvZGUuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUpOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUge1xuXHRcdHN3aXRjaCAoc3R5bGUpIHtcblx0XHRcdGNhc2UgdHlwZXMuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuT2ZmOlxuXHRcdFx0XHRyZXR1cm4gUmVuZGVyTGluZU51bWJlcnNUeXBlLk9mZjtcblx0XHRcdGNhc2UgdHlwZXMuVGV4dEVkaXRvckxpbmVOdW1iZXJzU3R5bGUuUmVsYXRpdmU6XG5cdFx0XHRcdHJldHVybiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuUmVsYXRpdmU7XG5cdFx0XHRjYXNlIHR5cGVzLlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLkludGVydmFsOlxuXHRcdFx0XHRyZXR1cm4gUmVuZGVyTGluZU51bWJlcnNUeXBlLkludGVydmFsO1xuXHRcdFx0Y2FzZSB0eXBlcy5UZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZS5Pbjpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT247XG5cdFx0fVxuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhzdHlsZTogUmVuZGVyTGluZU51bWJlcnNUeXBlKTogdnNjb2RlLlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlIHtcblx0XHRzd2l0Y2ggKHN0eWxlKSB7XG5cdFx0XHRjYXNlIFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PZmY6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5UZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZS5PZmY7XG5cdFx0XHRjYXNlIFJlbmRlckxpbmVOdW1iZXJzVHlwZS5SZWxhdGl2ZTpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLlJlbGF0aXZlO1xuXHRcdFx0Y2FzZSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuSW50ZXJ2YWw6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5UZXh0RWRpdG9yTGluZU51bWJlcnNTdHlsZS5JbnRlcnZhbDtcblx0XHRcdGNhc2UgUmVuZGVyTGluZU51bWJlcnNUeXBlLk9uOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlLk9uO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIEVuZE9mTGluZSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oZW9sOiB2c2NvZGUuRW5kT2ZMaW5lKTogRW5kT2ZMaW5lU2VxdWVuY2UgfCB1bmRlZmluZWQge1xuXHRcdGlmIChlb2wgPT09IHR5cGVzLkVuZE9mTGluZS5DUkxGKSB7XG5cdFx0XHRyZXR1cm4gRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRjtcblx0XHR9IGVsc2UgaWYgKGVvbCA9PT0gdHlwZXMuRW5kT2ZMaW5lLkxGKSB7XG5cdFx0XHRyZXR1cm4gRW5kT2ZMaW5lU2VxdWVuY2UuTEY7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oZW9sOiBFbmRPZkxpbmVTZXF1ZW5jZSk6IHZzY29kZS5FbmRPZkxpbmUgfCB1bmRlZmluZWQge1xuXHRcdGlmIChlb2wgPT09IEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpIHtcblx0XHRcdHJldHVybiB0eXBlcy5FbmRPZkxpbmUuQ1JMRjtcblx0XHR9IGVsc2UgaWYgKGVvbCA9PT0gRW5kT2ZMaW5lU2VxdWVuY2UuTEYpIHtcblx0XHRcdHJldHVybiB0eXBlcy5FbmRPZkxpbmUuTEY7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBQcm9ncmVzc0xvY2F0aW9uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20obG9jOiB2c2NvZGUuUHJvZ3Jlc3NMb2NhdGlvbiB8IHsgdmlld0lkOiBzdHJpbmcgfSk6IE1haW5Qcm9ncmVzc0xvY2F0aW9uIHwgc3RyaW5nIHtcblx0XHRpZiAodHlwZW9mIGxvYyA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBsb2Mudmlld0lkO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAobG9jKSB7XG5cdFx0XHRjYXNlIHR5cGVzLlByb2dyZXNzTG9jYXRpb24uU291cmNlQ29udHJvbDogcmV0dXJuIE1haW5Qcm9ncmVzc0xvY2F0aW9uLlNjbTtcblx0XHRcdGNhc2UgdHlwZXMuUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3c6IHJldHVybiBNYWluUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3c7XG5cdFx0XHRjYXNlIHR5cGVzLlByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uOiByZXR1cm4gTWFpblByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gJ1Byb2dyZXNzTG9jYXRpb24nYCk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBGb2xkaW5nUmFuZ2Uge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShyOiB2c2NvZGUuRm9sZGluZ1JhbmdlKTogbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZSB7XG5cdFx0Y29uc3QgcmFuZ2U6IGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2UgPSB7IHN0YXJ0OiByLnN0YXJ0ICsgMSwgZW5kOiByLmVuZCArIDEgfTtcblx0XHRpZiAoci5raW5kKSB7XG5cdFx0XHRyYW5nZS5raW5kID0gRm9sZGluZ1JhbmdlS2luZC5mcm9tKHIua2luZCk7XG5cdFx0fVxuXHRcdHJldHVybiByYW5nZTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocjogbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZSk6IHZzY29kZS5Gb2xkaW5nUmFuZ2Uge1xuXHRcdGNvbnN0IHJhbmdlOiB2c2NvZGUuRm9sZGluZ1JhbmdlID0geyBzdGFydDogci5zdGFydCAtIDEsIGVuZDogci5lbmQgLSAxIH07XG5cdFx0aWYgKHIua2luZCkge1xuXHRcdFx0cmFuZ2Uua2luZCA9IEZvbGRpbmdSYW5nZUtpbmQudG8oci5raW5kKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJhbmdlO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRm9sZGluZ1JhbmdlS2luZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGtpbmQ6IHZzY29kZS5Gb2xkaW5nUmFuZ2VLaW5kIHwgdW5kZWZpbmVkKTogbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZUtpbmQgfCB1bmRlZmluZWQge1xuXHRcdGlmIChraW5kKSB7XG5cdFx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdFx0Y2FzZSB0eXBlcy5Gb2xkaW5nUmFuZ2VLaW5kLkNvbW1lbnQ6XG5cdFx0XHRcdFx0cmV0dXJuIGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VLaW5kLkNvbW1lbnQ7XG5cdFx0XHRcdGNhc2UgdHlwZXMuRm9sZGluZ1JhbmdlS2luZC5JbXBvcnRzOlxuXHRcdFx0XHRcdHJldHVybiBsYW5ndWFnZXMuRm9sZGluZ1JhbmdlS2luZC5JbXBvcnRzO1xuXHRcdFx0XHRjYXNlIHR5cGVzLkZvbGRpbmdSYW5nZUtpbmQuUmVnaW9uOlxuXHRcdFx0XHRcdHJldHVybiBsYW5ndWFnZXMuRm9sZGluZ1JhbmdlS2luZC5SZWdpb247XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGtpbmQ6IGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VLaW5kIHwgdW5kZWZpbmVkKTogdnNjb2RlLkZvbGRpbmdSYW5nZUtpbmQgfCB1bmRlZmluZWQge1xuXHRcdGlmIChraW5kKSB7XG5cdFx0XHRzd2l0Y2ggKGtpbmQudmFsdWUpIHtcblx0XHRcdFx0Y2FzZSBsYW5ndWFnZXMuRm9sZGluZ1JhbmdlS2luZC5Db21tZW50LnZhbHVlOlxuXHRcdFx0XHRcdHJldHVybiB0eXBlcy5Gb2xkaW5nUmFuZ2VLaW5kLkNvbW1lbnQ7XG5cdFx0XHRcdGNhc2UgbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZUtpbmQuSW1wb3J0cy52YWx1ZTpcblx0XHRcdFx0XHRyZXR1cm4gdHlwZXMuRm9sZGluZ1JhbmdlS2luZC5JbXBvcnRzO1xuXHRcdFx0XHRjYXNlIGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VLaW5kLlJlZ2lvbi52YWx1ZTpcblx0XHRcdFx0XHRyZXR1cm4gdHlwZXMuRm9sZGluZ1JhbmdlS2luZC5SZWdpb247XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBUZXh0RWRpdG9yT3Blbk9wdGlvbnMgZXh0ZW5kcyB2c2NvZGUuVGV4dERvY3VtZW50U2hvd09wdGlvbnMge1xuXHRiYWNrZ3JvdW5kPzogYm9vbGVhbjtcblx0b3ZlcnJpZGU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRleHRFZGl0b3JPcGVuT3B0aW9ucyB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ob3B0aW9ucz86IFRleHRFZGl0b3JPcGVuT3B0aW9ucyk6IElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKG9wdGlvbnMpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHBpbm5lZDogdHlwZW9mIG9wdGlvbnMucHJldmlldyA9PT0gJ2Jvb2xlYW4nID8gIW9wdGlvbnMucHJldmlldyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5hY3RpdmU6IG9wdGlvbnMuYmFja2dyb3VuZCxcblx0XHRcdFx0cHJlc2VydmVGb2N1czogb3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0XHRzZWxlY3Rpb246IHR5cGVvZiBvcHRpb25zLnNlbGVjdGlvbiA9PT0gJ29iamVjdCcgPyBSYW5nZS5mcm9tKG9wdGlvbnMuc2VsZWN0aW9uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0b3ZlcnJpZGU6IHR5cGVvZiBvcHRpb25zLm92ZXJyaWRlID09PSAnYm9vbGVhbicgPyBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCA6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBHbG9iUGF0dGVybiB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGF0dGVybjogdnNjb2RlLkdsb2JQYXR0ZXJuKTogc3RyaW5nIHwgZXh0SG9zdFByb3RvY29sLklSZWxhdGl2ZVBhdHRlcm5EdG87XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhdHRlcm46IHVuZGVmaW5lZCk6IHVuZGVmaW5lZDtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGF0dGVybjogbnVsbCk6IG51bGw7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhdHRlcm46IHZzY29kZS5HbG9iUGF0dGVybiB8IHVuZGVmaW5lZCB8IG51bGwpOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0byB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhdHRlcm46IHZzY29kZS5HbG9iUGF0dGVybiB8IHVuZGVmaW5lZCB8IG51bGwpOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0byB8IHVuZGVmaW5lZCB8IG51bGwge1xuXHRcdGlmIChwYXR0ZXJuIGluc3RhbmNlb2YgdHlwZXMuUmVsYXRpdmVQYXR0ZXJuKSB7XG5cdFx0XHRyZXR1cm4gcGF0dGVybi50b0pTT04oKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHBhdHRlcm4gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gcGF0dGVybjtcblx0XHR9XG5cblx0XHQvLyBUaGlzIGlzIHNsaWdodGx5IGJvZ3VzIGJlY2F1c2Ugd2UgZGVjbGFyZSB0aGlzIG1ldGhvZCB0byBhY2NlcHRcblx0XHQvLyBgdnNjb2RlLkdsb2JQYXR0ZXJuYCB3aGljaCBjYW4gYmUgYHZzY29kZS5SZWxhdGl2ZVBhdHRlcm5gIGNsYXNzLFxuXHRcdC8vIGJ1dCBnaXZlbiB3ZSBjYW5ub3QgZW5mb3JjZSBjbGFzc2VzIGZyb20gb3VyIHZzY29kZS5kLnRzLCB3ZSBoYXZlXG5cdFx0Ly8gdG8gcHJvYmUgZm9yIG9iamVjdHMgdG9vXG5cdFx0Ly8gUmVmczogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE0MDc3MVxuXHRcdGlmIChpc1JlbGF0aXZlUGF0dGVyblNoYXBlKHBhdHRlcm4pIHx8IGlzTGVnYWN5UmVsYXRpdmVQYXR0ZXJuU2hhcGUocGF0dGVybikpIHtcblx0XHRcdHJldHVybiBuZXcgdHlwZXMuUmVsYXRpdmVQYXR0ZXJuKHBhdHRlcm4uYmFzZVVyaSA/PyBwYXR0ZXJuLmJhc2UsIHBhdHRlcm4ucGF0dGVybikudG9KU09OKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhdHRlcm47IC8vIHByZXNlcnZlIGB1bmRlZmluZWRgIGFuZCBgbnVsbGBcblx0fVxuXG5cdGZ1bmN0aW9uIGlzUmVsYXRpdmVQYXR0ZXJuU2hhcGUob2JqOiB1bmtub3duKTogb2JqIGlzIHsgYmFzZTogc3RyaW5nOyBiYXNlVXJpOiBVUkk7IHBhdHRlcm46IHN0cmluZyB9IHtcblx0XHRjb25zdCBycCA9IG9iaiBhcyB7IGJhc2U6IHN0cmluZzsgYmFzZVVyaTogVVJJOyBwYXR0ZXJuOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdFx0aWYgKCFycCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBVUkkuaXNVcmkocnAuYmFzZVVyaSkgJiYgdHlwZW9mIHJwLnBhdHRlcm4gPT09ICdzdHJpbmcnO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNMZWdhY3lSZWxhdGl2ZVBhdHRlcm5TaGFwZShvYmo6IHVua25vd24pOiBvYmogaXMgeyBiYXNlOiBzdHJpbmc7IHBhdHRlcm46IHN0cmluZyB9IHtcblxuXHRcdC8vIEJlZm9yZSAxLjY0LngsIGBSZWxhdGl2ZVBhdHRlcm5gIGRpZCBub3QgaGF2ZSBhbnkgYGJhc2VVcmk6IFVyaWBcblx0XHQvLyBwcm9wZXJ0eS4gVG8gcHJlc2VydmUgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkgd2l0aCBvbGRlciBleHRlbnNpb25zXG5cdFx0Ly8gd2UgYWxsb3cgdGhpcyBvbGQgZm9ybWF0IHdoZW4gY3JlYXRpbmcgdGhlIGB2c2NvZGUuUmVsYXRpdmVQYXR0ZXJuYC5cblxuXHRcdGNvbnN0IHJwID0gb2JqIGFzIHsgYmFzZTogc3RyaW5nOyBwYXR0ZXJuOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdFx0aWYgKCFycCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0eXBlb2YgcnAuYmFzZSA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIHJwLnBhdHRlcm4gPT09ICdzdHJpbmcnO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhdHRlcm46IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvKTogdnNjb2RlLkdsb2JQYXR0ZXJuIHtcblx0XHRpZiAodHlwZW9mIHBhdHRlcm4gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gcGF0dGVybjtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IHR5cGVzLlJlbGF0aXZlUGF0dGVybihVUkkucmV2aXZlKHBhdHRlcm4uYmFzZVVyaSksIHBhdHRlcm4ucGF0dGVybik7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBMYW5ndWFnZVNlbGVjdG9yIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShzZWxlY3RvcjogdW5kZWZpbmVkKTogdW5kZWZpbmVkO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IpOiBsYW5ndWFnZVNlbGVjdG9yLkxhbmd1YWdlU2VsZWN0b3I7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciB8IHVuZGVmaW5lZCk6IGxhbmd1YWdlU2VsZWN0b3IuTGFuZ3VhZ2VTZWxlY3RvciB8IHVuZGVmaW5lZDtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yIHwgdW5kZWZpbmVkKTogbGFuZ3VhZ2VTZWxlY3Rvci5MYW5ndWFnZVNlbGVjdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXNlbGVjdG9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShzZWxlY3RvcikpIHtcblx0XHRcdHJldHVybiA8bGFuZ3VhZ2VTZWxlY3Rvci5MYW5ndWFnZVNlbGVjdG9yPnNlbGVjdG9yLm1hcChmcm9tKTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBzZWxlY3RvciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBzZWxlY3Rvcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gc2VsZWN0b3IgYXMgdnNjb2RlLkRvY3VtZW50RmlsdGVyOyAvLyBUT0RPOiBtaWNyb3NvZnQvVHlwZVNjcmlwdCM0Mjc2OFxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFuZ3VhZ2U6IGZpbHRlci5sYW5ndWFnZSxcblx0XHRcdFx0c2NoZW1lOiBmaWx0ZXIuc2NoZW1lLFxuXHRcdFx0XHRwYXR0ZXJuOiBHbG9iUGF0dGVybi5mcm9tKGZpbHRlci5wYXR0ZXJuKSA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdGV4Y2x1c2l2ZTogZmlsdGVyLmV4Y2x1c2l2ZSxcblx0XHRcdFx0bm90ZWJvb2tUeXBlOiBmaWx0ZXIubm90ZWJvb2tUeXBlXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rUmFuZ2Uge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHJhbmdlOiB2c2NvZGUuTm90ZWJvb2tSYW5nZSk6IElDZWxsUmFuZ2Uge1xuXHRcdHJldHVybiB7IHN0YXJ0OiByYW5nZS5zdGFydCwgZW5kOiByYW5nZS5lbmQgfTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhyYW5nZTogSUNlbGxSYW5nZSk6IHR5cGVzLk5vdGVib29rUmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuTm90ZWJvb2tSYW5nZShyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rQ2VsbEV4ZWN1dGlvblN1bW1hcnkge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8oZGF0YTogbm90ZWJvb2tzLk5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEpOiB2c2NvZGUuTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3VtbWFyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRpbWluZzogdHlwZW9mIGRhdGEucnVuU3RhcnRUaW1lID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgZGF0YS5ydW5FbmRUaW1lID09PSAnbnVtYmVyJyA/IHsgc3RhcnRUaW1lOiBkYXRhLnJ1blN0YXJ0VGltZSwgZW5kVGltZTogZGF0YS5ydW5FbmRUaW1lIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRleGVjdXRpb25PcmRlcjogZGF0YS5leGVjdXRpb25PcmRlcixcblx0XHRcdHN1Y2Nlc3M6IGRhdGEubGFzdFJ1blN1Y2Nlc3Ncblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oZGF0YTogdnNjb2RlLk5vdGVib29rQ2VsbEV4ZWN1dGlvblN1bW1hcnkpOiBQYXJ0aWFsPG5vdGVib29rcy5Ob3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhc3RSdW5TdWNjZXNzOiBkYXRhLnN1Y2Nlc3MsXG5cdFx0XHRydW5TdGFydFRpbWU6IGRhdGEudGltaW5nPy5zdGFydFRpbWUsXG5cdFx0XHRydW5FbmRUaW1lOiBkYXRhLnRpbWluZz8uZW5kVGltZSxcblx0XHRcdGV4ZWN1dGlvbk9yZGVyOiBkYXRhLmV4ZWN1dGlvbk9yZGVyXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rQ2VsbEtpbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShkYXRhOiB2c2NvZGUuTm90ZWJvb2tDZWxsS2luZCk6IG5vdGVib29rcy5DZWxsS2luZCB7XG5cdFx0c3dpdGNoIChkYXRhKSB7XG5cdFx0XHRjYXNlIHR5cGVzLk5vdGVib29rQ2VsbEtpbmQuTWFya3VwOlxuXHRcdFx0XHRyZXR1cm4gbm90ZWJvb2tzLkNlbGxLaW5kLk1hcmt1cDtcblx0XHRcdGNhc2UgdHlwZXMuTm90ZWJvb2tDZWxsS2luZC5Db2RlOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIG5vdGVib29rcy5DZWxsS2luZC5Db2RlO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhkYXRhOiBub3RlYm9va3MuQ2VsbEtpbmQpOiB2c2NvZGUuTm90ZWJvb2tDZWxsS2luZCB7XG5cdFx0c3dpdGNoIChkYXRhKSB7XG5cdFx0XHRjYXNlIG5vdGVib29rcy5DZWxsS2luZC5NYXJrdXA6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5Ob3RlYm9va0NlbGxLaW5kLk1hcmt1cDtcblx0XHRcdGNhc2Ugbm90ZWJvb2tzLkNlbGxLaW5kLkNvZGU6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuTm90ZWJvb2tDZWxsS2luZC5Db2RlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rRGF0YSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oZGF0YTogdnNjb2RlLk5vdGVib29rRGF0YSk6IGV4dEhvc3RQcm90b2NvbC5Ob3RlYm9va0RhdGFEdG8ge1xuXHRcdGNvbnN0IHJlczogZXh0SG9zdFByb3RvY29sLk5vdGVib29rRGF0YUR0byA9IHtcblx0XHRcdG1ldGFkYXRhOiBkYXRhLm1ldGFkYXRhID8/IE9iamVjdC5jcmVhdGUobnVsbCksXG5cdFx0XHRjZWxsczogW10sXG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgZGF0YS5jZWxscykge1xuXHRcdFx0dHlwZXMuTm90ZWJvb2tDZWxsRGF0YS52YWxpZGF0ZShjZWxsKTtcblx0XHRcdHJlcy5jZWxscy5wdXNoKE5vdGVib29rQ2VsbERhdGEuZnJvbShjZWxsKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXM7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oZGF0YTogZXh0SG9zdFByb3RvY29sLk5vdGVib29rRGF0YUR0byk6IHZzY29kZS5Ob3RlYm9va0RhdGEge1xuXHRcdGNvbnN0IHJlcyA9IG5ldyB0eXBlcy5Ob3RlYm9va0RhdGEoXG5cdFx0XHRkYXRhLmNlbGxzLm1hcChOb3RlYm9va0NlbGxEYXRhLnRvKSxcblx0XHQpO1xuXHRcdGlmICghaXNFbXB0eU9iamVjdChkYXRhLm1ldGFkYXRhKSkge1xuXHRcdFx0cmVzLm1ldGFkYXRhID0gZGF0YS5tZXRhZGF0YTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlcztcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rQ2VsbERhdGEge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGRhdGE6IHZzY29kZS5Ob3RlYm9va0NlbGxEYXRhKTogZXh0SG9zdFByb3RvY29sLk5vdGVib29rQ2VsbERhdGFEdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjZWxsS2luZDogTm90ZWJvb2tDZWxsS2luZC5mcm9tKGRhdGEua2luZCksXG5cdFx0XHRsYW5ndWFnZTogZGF0YS5sYW5ndWFnZUlkLFxuXHRcdFx0bWltZTogZGF0YS5taW1lLFxuXHRcdFx0c291cmNlOiBkYXRhLnZhbHVlLFxuXHRcdFx0bWV0YWRhdGE6IGRhdGEubWV0YWRhdGEsXG5cdFx0XHRpbnRlcm5hbE1ldGFkYXRhOiBOb3RlYm9va0NlbGxFeGVjdXRpb25TdW1tYXJ5LmZyb20oZGF0YS5leGVjdXRpb25TdW1tYXJ5ID8/IHt9KSxcblx0XHRcdG91dHB1dHM6IGRhdGEub3V0cHV0cyA/IGRhdGEub3V0cHV0cy5tYXAoTm90ZWJvb2tDZWxsT3V0cHV0LmZyb20pIDogW11cblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGRhdGE6IGV4dEhvc3RQcm90b2NvbC5Ob3RlYm9va0NlbGxEYXRhRHRvKTogdnNjb2RlLk5vdGVib29rQ2VsbERhdGEge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuTm90ZWJvb2tDZWxsRGF0YShcblx0XHRcdE5vdGVib29rQ2VsbEtpbmQudG8oZGF0YS5jZWxsS2luZCksXG5cdFx0XHRkYXRhLnNvdXJjZSxcblx0XHRcdGRhdGEubGFuZ3VhZ2UsXG5cdFx0XHRkYXRhLm1pbWUsXG5cdFx0XHRkYXRhLm91dHB1dHMgPyBkYXRhLm91dHB1dHMubWFwKE5vdGVib29rQ2VsbE91dHB1dC50bykgOiB1bmRlZmluZWQsXG5cdFx0XHRkYXRhLm1ldGFkYXRhLFxuXHRcdFx0ZGF0YS5pbnRlcm5hbE1ldGFkYXRhID8gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3VtbWFyeS50byhkYXRhLmludGVybmFsTWV0YWRhdGEpIDogdW5kZWZpbmVkXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rQ2VsbE91dHB1dEl0ZW0ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpdGVtOiB0eXBlcy5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtKTogZXh0SG9zdFByb3RvY29sLk5vdGVib29rT3V0cHV0SXRlbUR0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG1pbWU6IGl0ZW0ubWltZSxcblx0XHRcdHZhbHVlQnl0ZXM6IFZTQnVmZmVyLndyYXAoaXRlbS5kYXRhKSxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGl0ZW06IGV4dEhvc3RQcm90b2NvbC5Ob3RlYm9va091dHB1dEl0ZW1EdG8pOiB0eXBlcy5Ob3RlYm9va0NlbGxPdXRwdXRJdGVtIHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLk5vdGVib29rQ2VsbE91dHB1dEl0ZW0oaXRlbS52YWx1ZUJ5dGVzLmJ1ZmZlciwgaXRlbS5taW1lKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rQ2VsbE91dHB1dCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKG91dHB1dDogdnNjb2RlLk5vdGVib29rQ2VsbE91dHB1dCk6IGV4dEhvc3RQcm90b2NvbC5Ob3RlYm9va091dHB1dER0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG91dHB1dElkOiBvdXRwdXQuaWQsXG5cdFx0XHRpdGVtczogb3V0cHV0Lml0ZW1zLm1hcChOb3RlYm9va0NlbGxPdXRwdXRJdGVtLmZyb20pLFxuXHRcdFx0bWV0YWRhdGE6IG91dHB1dC5tZXRhZGF0YVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ob3V0cHV0OiBleHRIb3N0UHJvdG9jb2wuTm90ZWJvb2tPdXRwdXREdG8pOiB2c2NvZGUuTm90ZWJvb2tDZWxsT3V0cHV0IHtcblx0XHRjb25zdCBpdGVtcyA9IG91dHB1dC5pdGVtcy5tYXAoTm90ZWJvb2tDZWxsT3V0cHV0SXRlbS50byk7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5Ob3RlYm9va0NlbGxPdXRwdXQoaXRlbXMsIG91dHB1dC5vdXRwdXRJZCwgb3V0cHV0Lm1ldGFkYXRhKTtcblx0fVxufVxuXG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tFeGNsdXNpdmVEb2N1bWVudFBhdHRlcm4ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXR0ZXJuOiB7IGluY2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB8IHVuZGVmaW5lZDsgZXhjbHVkZTogdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkIH0pOiB7IGluY2x1ZGU6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvIHwgdW5kZWZpbmVkOyBleGNsdWRlOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0byB8IHVuZGVmaW5lZCB9O1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXR0ZXJuOiB2c2NvZGUuR2xvYlBhdHRlcm4pOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0bztcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGF0dGVybjogdW5kZWZpbmVkKTogdW5kZWZpbmVkO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXR0ZXJuOiB7IGluY2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB8IHVuZGVmaW5lZCB8IG51bGw7IGV4Y2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB8IHVuZGVmaW5lZCB9IHwgdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgZXh0SG9zdFByb3RvY29sLklSZWxhdGl2ZVBhdHRlcm5EdG8gfCB7IGluY2x1ZGU6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvIHwgdW5kZWZpbmVkOyBleGNsdWRlOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0byB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXR0ZXJuOiB7IGluY2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB8IHVuZGVmaW5lZCB8IG51bGw7IGV4Y2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB8IHVuZGVmaW5lZCB9IHwgdnNjb2RlLkdsb2JQYXR0ZXJuIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgZXh0SG9zdFByb3RvY29sLklSZWxhdGl2ZVBhdHRlcm5EdG8gfCB7IGluY2x1ZGU6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvIHwgdW5kZWZpbmVkOyBleGNsdWRlOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0byB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNFeGNsdXNpdmVQYXR0ZXJuKHBhdHRlcm4pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbmNsdWRlOiBHbG9iUGF0dGVybi5mcm9tKHBhdHRlcm4uaW5jbHVkZSkgPz8gdW5kZWZpbmVkLFxuXHRcdFx0XHRleGNsdWRlOiBHbG9iUGF0dGVybi5mcm9tKHBhdHRlcm4uZXhjbHVkZSkgPz8gdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gR2xvYlBhdHRlcm4uZnJvbShwYXR0ZXJuKSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGF0dGVybjogc3RyaW5nIHwgZXh0SG9zdFByb3RvY29sLklSZWxhdGl2ZVBhdHRlcm5EdG8gfCB7IGluY2x1ZGU6IHN0cmluZyB8IGV4dEhvc3RQcm90b2NvbC5JUmVsYXRpdmVQYXR0ZXJuRHRvOyBleGNsdWRlOiBzdHJpbmcgfCBleHRIb3N0UHJvdG9jb2wuSVJlbGF0aXZlUGF0dGVybkR0byB9KTogeyBpbmNsdWRlOiB2c2NvZGUuR2xvYlBhdHRlcm47IGV4Y2x1ZGU6IHZzY29kZS5HbG9iUGF0dGVybiB9IHwgdnNjb2RlLkdsb2JQYXR0ZXJuIHtcblx0XHRpZiAoaXNFeGNsdXNpdmVQYXR0ZXJuKHBhdHRlcm4pKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpbmNsdWRlOiBHbG9iUGF0dGVybi50byhwYXR0ZXJuLmluY2x1ZGUpLFxuXHRcdFx0XHRleGNsdWRlOiBHbG9iUGF0dGVybi50byhwYXR0ZXJuLmV4Y2x1ZGUpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBHbG9iUGF0dGVybi50byhwYXR0ZXJuKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzRXhjbHVzaXZlUGF0dGVybjxUPihvYmo6IGFueSk6IG9iaiBpcyB7IGluY2x1ZGU/OiBUOyBleGNsdWRlPzogVCB9IHtcblx0XHRjb25zdCBlcCA9IG9iaiBhcyB7IGluY2x1ZGU/OiBUOyBleGNsdWRlPzogVCB9IHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0XHRpZiAoIWVwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAhaXNVbmRlZmluZWRPck51bGwoZXAuaW5jbHVkZSkgJiYgIWlzVW5kZWZpbmVkT3JOdWxsKGVwLmV4Y2x1ZGUpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tTdGF0dXNCYXJJdGVtIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaXRlbTogdnNjb2RlLk5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW0sIGNvbW1hbmRzQ29udmVydGVyOiBDb21tYW5kLklDb21tYW5kc0NvbnZlcnRlciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IG5vdGVib29rcy5JTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IHR5cGVvZiBpdGVtLmNvbW1hbmQgPT09ICdzdHJpbmcnID8geyB0aXRsZTogJycsIGNvbW1hbmQ6IGl0ZW0uY29tbWFuZCB9IDogaXRlbS5jb21tYW5kO1xuXHRcdHJldHVybiB7XG5cdFx0XHRhbGlnbm1lbnQ6IGl0ZW0uYWxpZ25tZW50ID09PSB0eXBlcy5Ob3RlYm9va0NlbGxTdGF0dXNCYXJBbGlnbm1lbnQuTGVmdCA/IG5vdGVib29rcy5DZWxsU3RhdHVzYmFyQWxpZ25tZW50LkxlZnQgOiBub3RlYm9va3MuQ2VsbFN0YXR1c2JhckFsaWdubWVudC5SaWdodCxcblx0XHRcdGNvbW1hbmQ6IGNvbW1hbmRzQ29udmVydGVyLnRvSW50ZXJuYWwoY29tbWFuZCwgZGlzcG9zYWJsZXMpLCAvLyBUT0RPQHJvYmxvdVxuXHRcdFx0dGV4dDogaXRlbS50ZXh0LFxuXHRcdFx0dG9vbHRpcDogaXRlbS50b29sdGlwLFxuXHRcdFx0YWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uOiBpdGVtLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbixcblx0XHRcdHByaW9yaXR5OiBpdGVtLnByaW9yaXR5XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE5vdGVib29rS2VybmVsU291cmNlQWN0aW9uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaXRlbTogdnNjb2RlLk5vdGVib29rS2VybmVsU291cmNlQWN0aW9uLCBjb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZC5JQ29tbWFuZHNDb252ZXJ0ZXIsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBub3RlYm9va3MuSU5vdGVib29rS2VybmVsU291cmNlQWN0aW9uIHtcblx0XHRjb25zdCBjb21tYW5kID0gdHlwZW9mIGl0ZW0uY29tbWFuZCA9PT0gJ3N0cmluZycgPyB7IHRpdGxlOiAnJywgY29tbWFuZDogaXRlbS5jb21tYW5kIH0gOiBpdGVtLmNvbW1hbmQ7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tbWFuZDogY29tbWFuZHNDb252ZXJ0ZXIudG9JbnRlcm5hbChjb21tYW5kLCBkaXNwb3NhYmxlcyksXG5cdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0ZGV0YWlsOiBpdGVtLmRldGFpbCxcblx0XHRcdGRvY3VtZW50YXRpb246IGl0ZW0uZG9jdW1lbnRhdGlvblxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBOb3RlYm9va0RvY3VtZW50Q29udGVudE9wdGlvbnMge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShvcHRpb25zOiB2c2NvZGUuTm90ZWJvb2tEb2N1bWVudENvbnRlbnRPcHRpb25zIHwgdW5kZWZpbmVkKTogbm90ZWJvb2tzLlRyYW5zaWVudE9wdGlvbnMge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0cmFuc2llbnRPdXRwdXRzOiBvcHRpb25zPy50cmFuc2llbnRPdXRwdXRzID8/IGZhbHNlLFxuXHRcdFx0dHJhbnNpZW50Q2VsbE1ldGFkYXRhOiBvcHRpb25zPy50cmFuc2llbnRDZWxsTWV0YWRhdGEgPz8ge30sXG5cdFx0XHR0cmFuc2llbnREb2N1bWVudE1ldGFkYXRhOiBvcHRpb25zPy50cmFuc2llbnREb2N1bWVudE1ldGFkYXRhID8/IHt9LFxuXHRcdFx0Y2VsbENvbnRlbnRNZXRhZGF0YTogb3B0aW9ucz8uY2VsbENvbnRlbnRNZXRhZGF0YSA/PyB7fVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBOb3RlYm9va1JlbmRlcmVyU2NyaXB0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocHJlbG9hZDogdnNjb2RlLk5vdGVib29rUmVuZGVyZXJTY3JpcHQpOiB7IHVyaTogVXJpQ29tcG9uZW50czsgcHJvdmlkZXM6IHJlYWRvbmx5IHN0cmluZ1tdIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHByZWxvYWQudXJpLFxuXHRcdFx0cHJvdmlkZXM6IHByZWxvYWQucHJvdmlkZXNcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHByZWxvYWQ6IHsgdXJpOiBVcmlDb21wb25lbnRzOyBwcm92aWRlczogcmVhZG9ubHkgc3RyaW5nW10gfSk6IHZzY29kZS5Ob3RlYm9va1JlbmRlcmVyU2NyaXB0IHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLk5vdGVib29rUmVuZGVyZXJTY3JpcHQoVVJJLnJldml2ZShwcmVsb2FkLnVyaSksIHByZWxvYWQucHJvdmlkZXMpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGVzdE1lc3NhZ2Uge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShtZXNzYWdlOiB2c2NvZGUuVGVzdE1lc3NhZ2UpOiBJVGVzdEVycm9yTWVzc2FnZS5TZXJpYWxpemVkIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bWVzc2FnZTogTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChtZXNzYWdlLm1lc3NhZ2UpIHx8ICcnLFxuXHRcdFx0dHlwZTogVGVzdE1lc3NhZ2VUeXBlLkVycm9yLFxuXHRcdFx0ZXhwZWN0ZWQ6IG1lc3NhZ2UuZXhwZWN0ZWRPdXRwdXQsXG5cdFx0XHRhY3R1YWw6IG1lc3NhZ2UuYWN0dWFsT3V0cHV0LFxuXHRcdFx0Y29udGV4dFZhbHVlOiBtZXNzYWdlLmNvbnRleHRWYWx1ZSxcblx0XHRcdGxvY2F0aW9uOiBtZXNzYWdlLmxvY2F0aW9uICYmICh7IHJhbmdlOiBSYW5nZS5mcm9tKG1lc3NhZ2UubG9jYXRpb24ucmFuZ2UpLCB1cmk6IG1lc3NhZ2UubG9jYXRpb24udXJpIH0pLFxuXHRcdFx0c3RhY2tUcmFjZTogbWVzc2FnZS5zdGFja1RyYWNlPy5tYXAocyA9PiAoe1xuXHRcdFx0XHRsYWJlbDogcy5sYWJlbCxcblx0XHRcdFx0cG9zaXRpb246IHMucG9zaXRpb24gJiYgUG9zaXRpb24uZnJvbShzLnBvc2l0aW9uKSxcblx0XHRcdFx0dXJpOiBzLnVyaSAmJiBVUkkucmV2aXZlKHMudXJpKS50b0pTT04oKSxcblx0XHRcdH0pKSxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGl0ZW06IElUZXN0RXJyb3JNZXNzYWdlLlNlcmlhbGl6ZWQpOiB2c2NvZGUuVGVzdE1lc3NhZ2Uge1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBuZXcgdHlwZXMuVGVzdE1lc3NhZ2UodHlwZW9mIGl0ZW0ubWVzc2FnZSA9PT0gJ3N0cmluZycgPyBpdGVtLm1lc3NhZ2UgOiBNYXJrZG93blN0cmluZy50byhpdGVtLm1lc3NhZ2UpKTtcblx0XHRtZXNzYWdlLmFjdHVhbE91dHB1dCA9IGl0ZW0uYWN0dWFsO1xuXHRcdG1lc3NhZ2UuZXhwZWN0ZWRPdXRwdXQgPSBpdGVtLmV4cGVjdGVkO1xuXHRcdG1lc3NhZ2UuY29udGV4dFZhbHVlID0gaXRlbS5jb250ZXh0VmFsdWU7XG5cdFx0bWVzc2FnZS5sb2NhdGlvbiA9IGl0ZW0ubG9jYXRpb24gPyBsb2NhdGlvbi50byhpdGVtLmxvY2F0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gbWVzc2FnZTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRlc3RUYWcge1xuXHRleHBvcnQgY29uc3QgbmFtZXNwYWNlID0gbmFtZXNwYWNlVGVzdFRhZztcblxuXHRleHBvcnQgY29uc3QgZGVuYW1lc3BhY2UgPSBkZW5hbWVzcGFjZVRlc3RUYWc7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGVzdFJ1blByb2ZpbGUge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpdGVtOiB0eXBlcy5UZXN0UnVuUHJvZmlsZUJhc2UpOiBJVGVzdFJ1blByb2ZpbGVSZWZlcmVuY2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250cm9sbGVySWQ6IGl0ZW0uY29udHJvbGxlcklkLFxuXHRcdFx0cHJvZmlsZUlkOiBpdGVtLnByb2ZpbGVJZCxcblx0XHRcdGdyb3VwOiBUZXN0UnVuUHJvZmlsZUtpbmQuZnJvbShpdGVtLmtpbmQpLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXN0UnVuUHJvZmlsZUtpbmQge1xuXHRjb25zdCBwcm9maWxlR3JvdXBUb0JpdHNldDogeyBbSyBpbiB2c2NvZGUuVGVzdFJ1blByb2ZpbGVLaW5kXTogVGVzdFJ1blByb2ZpbGVCaXRzZXQgfSA9IHtcblx0XHRbdHlwZXMuVGVzdFJ1blByb2ZpbGVLaW5kLkNvdmVyYWdlXTogVGVzdFJ1blByb2ZpbGVCaXRzZXQuQ292ZXJhZ2UsXG5cdFx0W3R5cGVzLlRlc3RSdW5Qcm9maWxlS2luZC5EZWJ1Z106IFRlc3RSdW5Qcm9maWxlQml0c2V0LkRlYnVnLFxuXHRcdFt0eXBlcy5UZXN0UnVuUHJvZmlsZUtpbmQuUnVuXTogVGVzdFJ1blByb2ZpbGVCaXRzZXQuUnVuLFxuXHR9O1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGtpbmQ6IHR5cGVzLlRlc3RSdW5Qcm9maWxlS2luZCk6IFRlc3RSdW5Qcm9maWxlQml0c2V0IHtcblx0XHRyZXR1cm4gcHJvZmlsZUdyb3VwVG9CaXRzZXQuaGFzT3duUHJvcGVydHkoa2luZCkgPyBwcm9maWxlR3JvdXBUb0JpdHNldFtraW5kXSA6IFRlc3RSdW5Qcm9maWxlQml0c2V0LlJ1bjtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRlc3RJdGVtIHtcblx0ZXhwb3J0IHR5cGUgUmF3ID0gdnNjb2RlLlRlc3RJdGVtO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGl0ZW06IHZzY29kZS5UZXN0SXRlbSk6IElUZXN0SXRlbSB7XG5cdFx0Y29uc3QgY3RybElkID0gZ2V0UHJpdmF0ZUFwaUZvcihpdGVtKS5jb250cm9sbGVySWQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGV4dElkOiBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbShpdGVtLCBjdHJsSWQpLnRvU3RyaW5nKCksXG5cdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdHVyaTogVVJJLnJldml2ZShpdGVtLnVyaSksXG5cdFx0XHRidXN5OiBpdGVtLmJ1c3ksXG5cdFx0XHR0YWdzOiBpdGVtLnRhZ3MubWFwKHQgPT4gVGVzdFRhZy5uYW1lc3BhY2UoY3RybElkLCB0LmlkKSksXG5cdFx0XHRyYW5nZTogZWRpdG9yUmFuZ2UuUmFuZ2UubGlmdChSYW5nZS5mcm9tKGl0ZW0ucmFuZ2UpKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uIHx8IG51bGwsXG5cdFx0XHRzb3J0VGV4dDogaXRlbS5zb3J0VGV4dCB8fCBudWxsLFxuXHRcdFx0ZXJyb3I6IGl0ZW0uZXJyb3IgPyAoTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChpdGVtLmVycm9yKSB8fCBudWxsKSA6IG51bGwsXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0b1BsYWluKGl0ZW06IElUZXN0SXRlbS5TZXJpYWxpemVkKTogdnNjb2RlLlRlc3RJdGVtIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFyZW50OiB1bmRlZmluZWQsXG5cdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0aWQ6IFRlc3RJZC5mcm9tU3RyaW5nKGl0ZW0uZXh0SWQpLmxvY2FsSWQsXG5cdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdHVyaTogVVJJLnJldml2ZShpdGVtLnVyaSksXG5cdFx0XHR0YWdzOiAoaXRlbS50YWdzIHx8IFtdKS5tYXAodCA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgdGFnSWQgfSA9IFRlc3RUYWcuZGVuYW1lc3BhY2UodCk7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuVGVzdFRhZyh0YWdJZCk7XG5cdFx0XHR9KSxcblx0XHRcdGNoaWxkcmVuOiB7XG5cdFx0XHRcdGFkZDogKCkgPT4geyB9LFxuXHRcdFx0XHRkZWxldGU6ICgpID0+IHsgfSxcblx0XHRcdFx0Zm9yRWFjaDogKCkgPT4geyB9LFxuXHRcdFx0XHQqW1N5bWJvbC5pdGVyYXRvcl0oKSB7IH0sXG5cdFx0XHRcdGdldDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXBsYWNlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHNpemU6IDAsXG5cdFx0XHR9LFxuXHRcdFx0cmFuZ2U6IFJhbmdlLnRvKGl0ZW0ucmFuZ2UgfHwgdW5kZWZpbmVkKSxcblx0XHRcdGNhblJlc29sdmVDaGlsZHJlbjogZmFsc2UsXG5cdFx0XHRidXN5OiBpdGVtLmJ1c3ksXG5cdFx0XHRkZXNjcmlwdGlvbjogaXRlbS5kZXNjcmlwdGlvbiB8fCB1bmRlZmluZWQsXG5cdFx0XHRzb3J0VGV4dDogaXRlbS5zb3J0VGV4dCB8fCB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRlc3RUYWcge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0YWc6IHZzY29kZS5UZXN0VGFnKTogSVRlc3RUYWcge1xuXHRcdHJldHVybiB7IGlkOiB0YWcuaWQgfTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byh0YWc6IElUZXN0VGFnKTogdnNjb2RlLlRlc3RUYWcge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuVGVzdFRhZyh0YWcuaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGVzdFJlc3VsdHMge1xuXHRjb25zdCBjb252ZXJ0VGVzdFJlc3VsdEl0ZW0gPSAobm9kZTogSVByZWZpeFRyZWVOb2RlPFRlc3RSZXN1bHRJdGVtLlNlcmlhbGl6ZWQ+LCBwYXJlbnQ/OiB2c2NvZGUuVGVzdFJlc3VsdFNuYXBzaG90KTogdnNjb2RlLlRlc3RSZXN1bHRTbmFwc2hvdCB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0Y29uc3QgaXRlbSA9IG5vZGUudmFsdWU7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBzaG91bGQgYmUgdW5yZWFjaGFibGVcblx0XHR9XG5cblx0XHRjb25zdCBzbmFwc2hvdDogdnNjb2RlLlRlc3RSZXN1bHRTbmFwc2hvdCA9ICh7XG5cdFx0XHQuLi5UZXN0SXRlbS50b1BsYWluKGl0ZW0uaXRlbSksXG5cdFx0XHRwYXJlbnQsXG5cdFx0XHR0YXNrU3RhdGVzOiBpdGVtLnRhc2tzLm1hcCh0ID0+ICh7XG5cdFx0XHRcdHN0YXRlOiB0LnN0YXRlIGFzIG51bWJlciBhcyB0eXBlcy5UZXN0UmVzdWx0U3RhdGUsXG5cdFx0XHRcdGR1cmF0aW9uOiB0LmR1cmF0aW9uLFxuXHRcdFx0XHRtZXNzYWdlczogdC5tZXNzYWdlc1xuXHRcdFx0XHRcdC5maWx0ZXIoKG0pOiBtIGlzIElUZXN0RXJyb3JNZXNzYWdlLlNlcmlhbGl6ZWQgPT4gbS50eXBlID09PSBUZXN0TWVzc2FnZVR5cGUuRXJyb3IpXG5cdFx0XHRcdFx0Lm1hcChUZXN0TWVzc2FnZS50byksXG5cdFx0XHR9KSksXG5cdFx0XHRjaGlsZHJlbjogW10sXG5cdFx0fSk7XG5cblx0XHRpZiAobm9kZS5jaGlsZHJlbikge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBub2RlLmNoaWxkcmVuLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNvbnN0IGMgPSBjb252ZXJ0VGVzdFJlc3VsdEl0ZW0oY2hpbGQsIHNuYXBzaG90KTtcblx0XHRcdFx0aWYgKGMpIHtcblx0XHRcdFx0XHRzbmFwc2hvdC5jaGlsZHJlbi5wdXNoKGMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNuYXBzaG90O1xuXHR9O1xuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhzZXJpYWxpemVkOiBJU2VyaWFsaXplZFRlc3RSZXN1bHRzKTogdnNjb2RlLlRlc3RSdW5SZXN1bHQge1xuXHRcdGNvbnN0IHRyZWUgPSBuZXcgV2VsbERlZmluZWRQcmVmaXhUcmVlPFRlc3RSZXN1bHRJdGVtLlNlcmlhbGl6ZWQ+KCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHNlcmlhbGl6ZWQuaXRlbXMpIHtcblx0XHRcdHRyZWUuaW5zZXJ0KFRlc3RJZC5mcm9tU3RyaW5nKGl0ZW0uaXRlbS5leHRJZCkucGF0aCwgaXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IHRoZSBmaXJzdCBub2RlIHdpdGggYSB2YWx1ZSBpbiBlYWNoIHN1YnRyZWUgb2YgSURzLlxuXHRcdGNvbnN0IHF1ZXVlID0gW3RyZWUubm9kZXNdO1xuXHRcdGNvbnN0IHJvb3RzOiBJUHJlZml4VHJlZU5vZGU8VGVzdFJlc3VsdEl0ZW0uU2VyaWFsaXplZD5bXSA9IFtdO1xuXHRcdHdoaWxlIChxdWV1ZS5sZW5ndGgpIHtcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBxdWV1ZS5wb3AoKSEpIHtcblx0XHRcdFx0aWYgKG5vZGUudmFsdWUpIHtcblx0XHRcdFx0XHRyb290cy5wdXNoKG5vZGUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRxdWV1ZS5wdXNoKG5vZGUuY2hpbGRyZW4udmFsdWVzKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbXBsZXRlZEF0OiBzZXJpYWxpemVkLmNvbXBsZXRlZEF0LFxuXHRcdFx0cmVzdWx0czogcm9vdHMubWFwKHIgPT4gY29udmVydFRlc3RSZXN1bHRJdGVtKHIpKS5maWx0ZXIoaXNEZWZpbmVkKSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGVzdENvdmVyYWdlIHtcblx0ZnVuY3Rpb24gZnJvbUNvdmVyYWdlQ291bnQoY291bnQ6IHZzY29kZS5UZXN0Q292ZXJhZ2VDb3VudCk6IElDb3ZlcmFnZUNvdW50IHtcblx0XHRyZXR1cm4geyBjb3ZlcmVkOiBjb3VudC5jb3ZlcmVkLCB0b3RhbDogY291bnQudG90YWwgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZyb21Mb2NhdGlvbihsb2NhdGlvbjogdnNjb2RlLlJhbmdlIHwgdnNjb2RlLlBvc2l0aW9uKSB7XG5cdFx0cmV0dXJuICdsaW5lJyBpbiBsb2NhdGlvbiA/IFBvc2l0aW9uLmZyb20obG9jYXRpb24pIDogUmFuZ2UuZnJvbShsb2NhdGlvbik7XG5cdH1cblxuXHRmdW5jdGlvbiB0b0xvY2F0aW9uKGxvY2F0aW9uOiBJUG9zaXRpb24gfCBlZGl0b3JSYW5nZS5JUmFuZ2UpOiB0eXBlcy5Qb3NpdGlvbiB8IHR5cGVzLlJhbmdlO1xuXHRmdW5jdGlvbiB0b0xvY2F0aW9uKGxvY2F0aW9uOiBJUG9zaXRpb24gfCBlZGl0b3JSYW5nZS5JUmFuZ2UgfCB1bmRlZmluZWQpOiB0eXBlcy5Qb3NpdGlvbiB8IHR5cGVzLlJhbmdlIHwgdW5kZWZpbmVkO1xuXHRmdW5jdGlvbiB0b0xvY2F0aW9uKGxvY2F0aW9uOiBJUG9zaXRpb24gfCBlZGl0b3JSYW5nZS5JUmFuZ2UgfCB1bmRlZmluZWQpOiB0eXBlcy5Qb3NpdGlvbiB8IHR5cGVzLlJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWxvY2F0aW9uKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRyZXR1cm4gJ2VuZExpbmVOdW1iZXInIGluIGxvY2F0aW9uID8gUmFuZ2UudG8obG9jYXRpb24pIDogUG9zaXRpb24udG8obG9jYXRpb24pO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHNlcmlhbGl6ZWQ6IENvdmVyYWdlRGV0YWlscy5TZXJpYWxpemVkKTogdnNjb2RlLkZpbGVDb3ZlcmFnZURldGFpbCB7XG5cdFx0aWYgKHNlcmlhbGl6ZWQudHlwZSA9PT0gRGV0YWlsVHlwZS5TdGF0ZW1lbnQpIHtcblx0XHRcdGNvbnN0IGJyYW5jaGVzOiB2c2NvZGUuQnJhbmNoQ292ZXJhZ2VbXSA9IFtdO1xuXHRcdFx0aWYgKHNlcmlhbGl6ZWQuYnJhbmNoZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBicmFuY2ggb2Ygc2VyaWFsaXplZC5icmFuY2hlcykge1xuXHRcdFx0XHRcdGJyYW5jaGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0ZXhlY3V0ZWQ6IGJyYW5jaC5jb3VudCxcblx0XHRcdFx0XHRcdGxvY2F0aW9uOiB0b0xvY2F0aW9uKGJyYW5jaC5sb2NhdGlvbiksXG5cdFx0XHRcdFx0XHRsYWJlbDogYnJhbmNoLmxhYmVsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgdHlwZXMuU3RhdGVtZW50Q292ZXJhZ2UoXG5cdFx0XHRcdHNlcmlhbGl6ZWQuY291bnQsXG5cdFx0XHRcdHRvTG9jYXRpb24oc2VyaWFsaXplZC5sb2NhdGlvbiksXG5cdFx0XHRcdHNlcmlhbGl6ZWQuYnJhbmNoZXM/Lm1hcChiID0+IG5ldyB0eXBlcy5CcmFuY2hDb3ZlcmFnZShcblx0XHRcdFx0XHRiLmNvdW50LFxuXHRcdFx0XHRcdHRvTG9jYXRpb24oYi5sb2NhdGlvbikhLFxuXHRcdFx0XHRcdGIubGFiZWwsXG5cdFx0XHRcdCkpXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkRlY2xhcmF0aW9uQ292ZXJhZ2UoXG5cdFx0XHRcdHNlcmlhbGl6ZWQubmFtZSxcblx0XHRcdFx0c2VyaWFsaXplZC5jb3VudCxcblx0XHRcdFx0dG9Mb2NhdGlvbihzZXJpYWxpemVkLmxvY2F0aW9uKSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21EZXRhaWxzKGNvdmVyYWdlOiB2c2NvZGUuRmlsZUNvdmVyYWdlRGV0YWlsKTogQ292ZXJhZ2VEZXRhaWxzLlNlcmlhbGl6ZWQge1xuXHRcdGlmICh0eXBlb2YgY292ZXJhZ2UuZXhlY3V0ZWQgPT09ICdudW1iZXInICYmIGNvdmVyYWdlLmV4ZWN1dGVkIDwgMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGNvdmVyYWdlIGNvdW50ICR7Y292ZXJhZ2UuZXhlY3V0ZWR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKCdicmFuY2hlcycgaW4gY292ZXJhZ2UpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvdW50OiBjb3ZlcmFnZS5leGVjdXRlZCxcblx0XHRcdFx0bG9jYXRpb246IGZyb21Mb2NhdGlvbihjb3ZlcmFnZS5sb2NhdGlvbiksXG5cdFx0XHRcdHR5cGU6IERldGFpbFR5cGUuU3RhdGVtZW50LFxuXHRcdFx0XHRicmFuY2hlczogY292ZXJhZ2UuYnJhbmNoZXMubGVuZ3RoXG5cdFx0XHRcdFx0PyBjb3ZlcmFnZS5icmFuY2hlcy5tYXAoYiA9PiAoeyBjb3VudDogYi5leGVjdXRlZCwgbG9jYXRpb246IGIubG9jYXRpb24gJiYgZnJvbUxvY2F0aW9uKGIubG9jYXRpb24pLCBsYWJlbDogYi5sYWJlbCB9KSlcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IERldGFpbFR5cGUuRGVjbGFyYXRpb24sXG5cdFx0XHRcdG5hbWU6IGNvdmVyYWdlLm5hbWUsXG5cdFx0XHRcdGNvdW50OiBjb3ZlcmFnZS5leGVjdXRlZCxcblx0XHRcdFx0bG9jYXRpb246IGZyb21Mb2NhdGlvbihjb3ZlcmFnZS5sb2NhdGlvbiksXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tRmlsZShjb250cm9sbGVySWQ6IHN0cmluZywgaWQ6IHN0cmluZywgY292ZXJhZ2U6IHZzY29kZS5GaWxlQ292ZXJhZ2UpOiBJRmlsZUNvdmVyYWdlLlNlcmlhbGl6ZWQge1xuXHRcdHR5cGVzLnZhbGlkYXRlVGVzdENvdmVyYWdlQ291bnQoY292ZXJhZ2Uuc3RhdGVtZW50Q292ZXJhZ2UpO1xuXHRcdHR5cGVzLnZhbGlkYXRlVGVzdENvdmVyYWdlQ291bnQoY292ZXJhZ2UuYnJhbmNoQ292ZXJhZ2UpO1xuXHRcdHR5cGVzLnZhbGlkYXRlVGVzdENvdmVyYWdlQ291bnQoY292ZXJhZ2UuZGVjbGFyYXRpb25Db3ZlcmFnZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQsXG5cdFx0XHR1cmk6IGNvdmVyYWdlLnVyaSxcblx0XHRcdHN0YXRlbWVudDogZnJvbUNvdmVyYWdlQ291bnQoY292ZXJhZ2Uuc3RhdGVtZW50Q292ZXJhZ2UpLFxuXHRcdFx0YnJhbmNoOiBjb3ZlcmFnZS5icmFuY2hDb3ZlcmFnZSAmJiBmcm9tQ292ZXJhZ2VDb3VudChjb3ZlcmFnZS5icmFuY2hDb3ZlcmFnZSksXG5cdFx0XHRkZWNsYXJhdGlvbjogY292ZXJhZ2UuZGVjbGFyYXRpb25Db3ZlcmFnZSAmJiBmcm9tQ292ZXJhZ2VDb3VudChjb3ZlcmFnZS5kZWNsYXJhdGlvbkNvdmVyYWdlKSxcblx0XHRcdHRlc3RJZHM6IGNvdmVyYWdlIGluc3RhbmNlb2YgdHlwZXMuRmlsZUNvdmVyYWdlICYmIGNvdmVyYWdlLmluY2x1ZGVzVGVzdHMubGVuZ3RoID9cblx0XHRcdFx0Y292ZXJhZ2UuaW5jbHVkZXNUZXN0cy5tYXAodCA9PiBUZXN0SWQuZnJvbUV4dEhvc3RUZXN0SXRlbSh0LCBjb250cm9sbGVySWQpLnRvU3RyaW5nKCkpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDb2RlQWN0aW9uVHJpZ2dlcktpbmQge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25UcmlnZ2VyVHlwZSk6IHR5cGVzLkNvZGVBY3Rpb25UcmlnZ2VyS2luZCB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSBsYW5ndWFnZXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZTpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLkNvZGVBY3Rpb25UcmlnZ2VyS2luZC5JbnZva2U7XG5cblx0XHRcdGNhc2UgbGFuZ3VhZ2VzLkNvZGVBY3Rpb25UcmlnZ2VyVHlwZS5BdXRvOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuQ29kZUFjdGlvblRyaWdnZXJLaW5kLkF1dG9tYXRpYztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUeXBlSGllcmFyY2h5SXRlbSB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGl0ZW06IGV4dEhvc3RQcm90b2NvbC5JVHlwZUhpZXJhcmNoeUl0ZW1EdG8pOiB0eXBlcy5UeXBlSGllcmFyY2h5SXRlbSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IHR5cGVzLlR5cGVIaWVyYXJjaHlJdGVtKFxuXHRcdFx0U3ltYm9sS2luZC50byhpdGVtLmtpbmQpLFxuXHRcdFx0aXRlbS5uYW1lLFxuXHRcdFx0aXRlbS5kZXRhaWwgfHwgJycsXG5cdFx0XHRVUkkucmV2aXZlKGl0ZW0udXJpKSxcblx0XHRcdFJhbmdlLnRvKGl0ZW0ucmFuZ2UpLFxuXHRcdFx0UmFuZ2UudG8oaXRlbS5zZWxlY3Rpb25SYW5nZSlcblx0XHQpO1xuXG5cdFx0cmVzdWx0Ll9zZXNzaW9uSWQgPSBpdGVtLl9zZXNzaW9uSWQ7XG5cdFx0cmVzdWx0Ll9pdGVtSWQgPSBpdGVtLl9pdGVtSWQ7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaXRlbTogdnNjb2RlLlR5cGVIaWVyYXJjaHlJdGVtLCBzZXNzaW9uSWQ/OiBzdHJpbmcsIGl0ZW1JZD86IHN0cmluZyk6IGV4dEhvc3RQcm90b2NvbC5JVHlwZUhpZXJhcmNoeUl0ZW1EdG8ge1xuXG5cdFx0c2Vzc2lvbklkID0gc2Vzc2lvbklkID8/ICg8dHlwZXMuVHlwZUhpZXJhcmNoeUl0ZW0+aXRlbSkuX3Nlc3Npb25JZDtcblx0XHRpdGVtSWQgPSBpdGVtSWQgPz8gKDx0eXBlcy5UeXBlSGllcmFyY2h5SXRlbT5pdGVtKS5faXRlbUlkO1xuXG5cdFx0aWYgKHNlc3Npb25JZCA9PT0gdW5kZWZpbmVkIHx8IGl0ZW1JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgaXRlbScpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRfc2Vzc2lvbklkOiBzZXNzaW9uSWQsXG5cdFx0XHRfaXRlbUlkOiBpdGVtSWQsXG5cdFx0XHRraW5kOiBTeW1ib2xLaW5kLmZyb20oaXRlbS5raW5kKSxcblx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdGRldGFpbDogaXRlbS5kZXRhaWwgPz8gJycsXG5cdFx0XHR1cmk6IGl0ZW0udXJpLFxuXHRcdFx0cmFuZ2U6IFJhbmdlLmZyb20oaXRlbS5yYW5nZSksXG5cdFx0XHRzZWxlY3Rpb25SYW5nZTogUmFuZ2UuZnJvbShpdGVtLnNlbGVjdGlvblJhbmdlKSxcblx0XHRcdHRhZ3M6IGl0ZW0udGFncz8ubWFwKFN5bWJvbFRhZy5mcm9tKVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBWaWV3QmFkZ2Uge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShiYWRnZTogdnNjb2RlLlZpZXdCYWRnZSB8IHVuZGVmaW5lZCk6IElWaWV3QmFkZ2UgfCB1bmRlZmluZWQge1xuXHRcdGlmICghYmFkZ2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHZhbHVlOiBiYWRnZS52YWx1ZSxcblx0XHRcdHRvb2x0aXA6IGJhZGdlLnRvb2x0aXBcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRGF0YVRyYW5zZmVySXRlbSB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhtaW1lOiBzdHJpbmcsIGl0ZW06IGV4dEhvc3RQcm90b2NvbC5EYXRhVHJhbnNmZXJJdGVtRFRPLCByZXNvbHZlRmlsZURhdGE6IChpZDogc3RyaW5nKSA9PiBQcm9taXNlPFVpbnQ4QXJyYXk+KTogdHlwZXMuRGF0YVRyYW5zZmVySXRlbSB7XG5cdFx0Y29uc3QgZmlsZSA9IGl0ZW0uZmlsZURhdGE7XG5cdFx0aWYgKGZpbGUpIHtcblx0XHRcdHJldHVybiBuZXcgdHlwZXMuSW50ZXJuYWxGaWxlRGF0YVRyYW5zZmVySXRlbShcblx0XHRcdFx0bmV3IHR5cGVzLkRhdGFUcmFuc2ZlckZpbGUoZmlsZS5uYW1lLCBVUkkucmV2aXZlKGZpbGUudXJpKSwgZmlsZS5pZCwgY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKCgpID0+IHJlc29sdmVGaWxlRGF0YShmaWxlLmlkKSkpKTtcblx0XHR9XG5cblx0XHRpZiAobWltZSA9PT0gTWltZXMudXJpTGlzdCAmJiBpdGVtLnVyaUxpc3REYXRhKSB7XG5cdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkludGVybmFsRGF0YVRyYW5zZmVySXRlbShyZXZpdmVVcmlMaXN0KGl0ZW0udXJpTGlzdERhdGEpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IHR5cGVzLkludGVybmFsRGF0YVRyYW5zZmVySXRlbShpdGVtLmFzU3RyaW5nKTtcblx0fVxuXG5cdGV4cG9ydCBhc3luYyBmdW5jdGlvbiBmcm9tKG1pbWU6IHN0cmluZywgaXRlbTogdnNjb2RlLkRhdGFUcmFuc2Zlckl0ZW0gfCBJRGF0YVRyYW5zZmVySXRlbSwgaWQ6IHN0cmluZyA9IGdlbmVyYXRlVXVpZCgpKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuRGF0YVRyYW5zZmVySXRlbURUTz4ge1xuXHRcdGNvbnN0IHN0cmluZ1ZhbHVlID0gYXdhaXQgaXRlbS5hc1N0cmluZygpO1xuXG5cdFx0aWYgKG1pbWUgPT09IE1pbWVzLnVyaUxpc3QpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRhc1N0cmluZzogc3RyaW5nVmFsdWUsXG5cdFx0XHRcdGZpbGVEYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVyaUxpc3REYXRhOiBzZXJpYWxpemVVcmlMaXN0KHN0cmluZ1ZhbHVlKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZVZhbHVlID0gaXRlbS5hc0ZpbGUoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQsXG5cdFx0XHRhc1N0cmluZzogc3RyaW5nVmFsdWUsXG5cdFx0XHRmaWxlRGF0YTogZmlsZVZhbHVlID8ge1xuXHRcdFx0XHRuYW1lOiBmaWxlVmFsdWUubmFtZSxcblx0XHRcdFx0dXJpOiBmaWxlVmFsdWUudXJpLFxuXHRcdFx0XHRpZDogKGZpbGVWYWx1ZSBhcyB0eXBlcy5EYXRhVHJhbnNmZXJGaWxlKS5faXRlbUlkID8/IChmaWxlVmFsdWUgYXMgSURhdGFUcmFuc2ZlckZpbGUpLmlkLFxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2VyaWFsaXplVXJpTGlzdChzdHJpbmdWYWx1ZTogc3RyaW5nKTogUmVhZG9ubHlBcnJheTxzdHJpbmcgfCBVUkk+IHtcblx0XHRyZXR1cm4gVXJpTGlzdC5zcGxpdChzdHJpbmdWYWx1ZSkubWFwKHBhcnQgPT4ge1xuXHRcdFx0aWYgKHBhcnQuc3RhcnRzV2l0aCgnIycpKSB7XG5cdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gVVJJLnBhcnNlKHBhcnQpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIG5vb3Bcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiByZXZpdmVVcmlMaXN0KHBhcnRzOiBSZWFkb25seUFycmF5PHN0cmluZyB8IFVyaUNvbXBvbmVudHM+KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gVXJpTGlzdC5jcmVhdGUocGFydHMubWFwKHBhcnQgPT4ge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiBwYXJ0ID09PSAnc3RyaW5nJyA/IHBhcnQgOiBVUkkucmV2aXZlKHBhcnQpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIERhdGFUcmFuc2ZlciB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0b0RhdGFUcmFuc2Zlcih2YWx1ZTogZXh0SG9zdFByb3RvY29sLkRhdGFUcmFuc2ZlckRUTywgcmVzb2x2ZUZpbGVEYXRhOiAoaXRlbUlkOiBzdHJpbmcpID0+IFByb21pc2U8VWludDhBcnJheT4pOiB0eXBlcy5EYXRhVHJhbnNmZXIge1xuXHRcdGNvbnN0IGluaXQgPSB2YWx1ZS5pdGVtcy5tYXAoKFt0eXBlLCBpdGVtXSkgPT4ge1xuXHRcdFx0cmV0dXJuIFt0eXBlLCBEYXRhVHJhbnNmZXJJdGVtLnRvKHR5cGUsIGl0ZW0sIHJlc29sdmVGaWxlRGF0YSldIGFzIGNvbnN0O1xuXHRcdH0pO1xuXHRcdHJldHVybiBuZXcgdHlwZXMuRGF0YVRyYW5zZmVyKGluaXQpO1xuXHR9XG5cblx0ZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZyb20oZGF0YVRyYW5zZmVyOiB2c2NvZGUuRGF0YVRyYW5zZmVyKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuRGF0YVRyYW5zZmVyRFRPPiB7XG5cdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBQcm9taXNlLmFsbChBcnJheS5mcm9tKGRhdGFUcmFuc2ZlciwgYXN5bmMgKFttaW1lLCB2YWx1ZV0pID0+IHtcblx0XHRcdHJldHVybiBbbWltZSwgYXdhaXQgRGF0YVRyYW5zZmVySXRlbS5mcm9tKG1pbWUsIHZhbHVlKV0gYXMgY29uc3Q7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHsgaXRlbXMgfTtcblx0fVxuXG5cdGV4cG9ydCBhc3luYyBmdW5jdGlvbiBmcm9tTGlzdChkYXRhVHJhbnNmZXI6IEl0ZXJhYmxlPHJlYWRvbmx5IFtzdHJpbmcsIElEYXRhVHJhbnNmZXJJdGVtXT4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5EYXRhVHJhbnNmZXJEVE8+IHtcblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IFByb21pc2UuYWxsKEFycmF5LmZyb20oZGF0YVRyYW5zZmVyLCBhc3luYyAoW21pbWUsIHZhbHVlXSkgPT4ge1xuXHRcdFx0cmV0dXJuIFttaW1lLCBhd2FpdCBEYXRhVHJhbnNmZXJJdGVtLmZyb20obWltZSwgdmFsdWUsIHZhbHVlLmlkKV0gYXMgY29uc3Q7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHsgaXRlbXMgfTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRGb2xsb3d1cCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGZvbGxvd3VwOiB2c2NvZGUuQ2hhdEZvbGxvd3VwLCByZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCB8IHVuZGVmaW5lZCk6IElDaGF0Rm9sbG93dXAge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAncmVwbHknLFxuXHRcdFx0YWdlbnRJZDogZm9sbG93dXAucGFydGljaXBhbnQgPz8gcmVxdWVzdD8uYWdlbnRJZCA/PyAnJyxcblx0XHRcdHN1YkNvbW1hbmQ6IGZvbGxvd3VwLmNvbW1hbmQgPz8gcmVxdWVzdD8uY29tbWFuZCxcblx0XHRcdG1lc3NhZ2U6IGZvbGxvd3VwLnByb21wdCxcblx0XHRcdHRpdGxlOiBmb2xsb3d1cC5sYWJlbFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8oZm9sbG93dXA6IElDaGF0Rm9sbG93dXApOiB2c2NvZGUuQ2hhdEZvbGxvd3VwIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJvbXB0OiBmb2xsb3d1cC5tZXNzYWdlLFxuXHRcdFx0bGFiZWw6IGZvbGxvd3VwLnRpdGxlLFxuXHRcdFx0cGFydGljaXBhbnQ6IGZvbGxvd3VwLmFnZW50SWQsXG5cdFx0XHRjb21tYW5kOiBmb2xsb3d1cC5zdWJDb21tYW5kLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJvbGU6IGNoYXRQcm92aWRlci5DaGF0TWVzc2FnZVJvbGUpOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZSB7XG5cdFx0c3dpdGNoIChyb2xlKSB7XG5cdFx0XHRjYXNlIGNoYXRQcm92aWRlci5DaGF0TWVzc2FnZVJvbGUuU3lzdGVtOiByZXR1cm4gdHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZS5TeXN0ZW07XG5cdFx0XHRjYXNlIGNoYXRQcm92aWRlci5DaGF0TWVzc2FnZVJvbGUuVXNlcjogcmV0dXJuIHR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUuVXNlcjtcblx0XHRcdGNhc2UgY2hhdFByb3ZpZGVyLkNoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQ6IHJldHVybiB0eXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudDtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShyb2xlOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZSk6IGNoYXRQcm92aWRlci5DaGF0TWVzc2FnZVJvbGUge1xuXHRcdHN3aXRjaCAocm9sZSkge1xuXHRcdFx0Y2FzZSB0eXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLlN5c3RlbTogcmV0dXJuIGNoYXRQcm92aWRlci5DaGF0TWVzc2FnZVJvbGUuU3lzdGVtO1xuXHRcdFx0Y2FzZSB0eXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLlVzZXI6IHJldHVybiBjaGF0UHJvdmlkZXIuQ2hhdE1lc3NhZ2VSb2xlLlVzZXI7XG5cdFx0XHRjYXNlIHR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUuQXNzaXN0YW50OiByZXR1cm4gY2hhdFByb3ZpZGVyLkNoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQ7XG5cdFx0fVxuXHRcdHJldHVybiBjaGF0UHJvdmlkZXIuQ2hhdE1lc3NhZ2VSb2xlLlVzZXI7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2Uge1xuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhtZXNzYWdlOiBjaGF0UHJvdmlkZXIuSUNoYXRNZXNzYWdlKTogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZSB7XG5cdFx0Y29uc3QgY29udGVudCA9IG1lc3NhZ2UuY29udGVudC5tYXAoYyA9PiB7XG5cdFx0XHRpZiAoYy50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBMYW5ndWFnZU1vZGVsVGV4dFBhcnQoYy52YWx1ZSwgYy5hdWRpZW5jZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGMudHlwZSA9PT0gJ3Rvb2xfcmVzdWx0Jykge1xuXHRcdFx0XHRjb25zdCBjb250ZW50OiAoTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpW10gPSBjb2FsZXNjZShjLnZhbHVlLm1hcChwYXJ0ID0+IHtcblx0XHRcdFx0XHRpZiAocGFydC50eXBlID09PSAndGV4dCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KHBhcnQudmFsdWUsIHBhcnQuYXVkaWVuY2UpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydC50eXBlID09PSAnZGF0YScpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KHBhcnQuZGF0YS5idWZmZXIsIHBhcnQubWltZVR5cGUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydC50eXBlID09PSAncHJvbXB0X3RzeCcpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQocGFydC52YWx1ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIFN0cmlwIHVua25vd24gcGFydHNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQoYy50b29sQ2FsbElkLCBjb250ZW50LCBjLmlzRXJyb3IpO1xuXHRcdFx0fSBlbHNlIGlmIChjLnR5cGUgPT09ICdpbWFnZV91cmwnKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KGMudmFsdWUuZGF0YS5idWZmZXIsIGMudmFsdWUubWltZVR5cGUpO1xuXHRcdFx0fSBlbHNlIGlmIChjLnR5cGUgPT09ICdkYXRhJykge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydChjLmRhdGEuYnVmZmVyLCBjLm1pbWVUeXBlKTtcblx0XHRcdH0gZWxzZSBpZiAoYy50eXBlID09PSAndG9vbF91c2UnKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydChjLnRvb2xDYWxsSWQsIGMubmFtZSwgYy5wYXJhbWV0ZXJzKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9KS5maWx0ZXIoYyA9PiBjICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgcm9sZSA9IExhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZVJvbGUudG8obWVzc2FnZS5yb2xlKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlKHJvbGUsIGNvbnRlbnQsIG1lc3NhZ2UubmFtZSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKG1lc3NhZ2U6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UpOiBjaGF0UHJvdmlkZXIuSUNoYXRNZXNzYWdlIHtcblxuXHRcdGNvbnN0IHJvbGUgPSBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLmZyb20obWVzc2FnZS5yb2xlKTtcblx0XHRjb25zdCBuYW1lID0gbWVzc2FnZS5uYW1lO1xuXG5cdFx0bGV0IG1lc3NhZ2VDb250ZW50ID0gbWVzc2FnZS5jb250ZW50O1xuXHRcdGlmICh0eXBlb2YgbWVzc2FnZUNvbnRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRtZXNzYWdlQ29udGVudCA9IFtuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KG1lc3NhZ2VDb250ZW50KV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudCA9IG1lc3NhZ2VDb250ZW50Lm1hcCgoYyk6IGNoYXRQcm92aWRlci5JQ2hhdE1lc3NhZ2VQYXJ0ID0+IHtcblx0XHRcdGlmIChjIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHRQYXJ0KSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2xfcmVzdWx0Jyxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBjLmNhbGxJZCxcblx0XHRcdFx0XHR2YWx1ZTogY29hbGVzY2UoYy5jb250ZW50Lm1hcChwYXJ0ID0+IHtcblx0XHRcdFx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3RleHQnLFxuXHRcdFx0XHRcdFx0XHRcdHZhbHVlOiBwYXJ0LnZhbHVlLFxuXHRcdFx0XHRcdFx0XHRcdGF1ZGllbmNlOiBwYXJ0LmF1ZGllbmNlLFxuXHRcdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFJlc3BvbnNlVGV4dFBhcnQ7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdwcm9tcHRfdHN4Jyxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogcGFydC52YWx1ZSxcblx0XHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRSZXNwb25zZVByb21wdFRzeFBhcnQ7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnZGF0YScsXG5cdFx0XHRcdFx0XHRcdFx0bWltZVR5cGU6IHBhcnQubWltZVR5cGUsXG5cdFx0XHRcdFx0XHRcdFx0ZGF0YTogVlNCdWZmZXIud3JhcChwYXJ0LmRhdGEpLFxuXHRcdFx0XHRcdFx0XHRcdGF1ZGllbmNlOiBwYXJ0LmF1ZGllbmNlXG5cdFx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0UmVzcG9uc2VEYXRhUGFydDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIFN0cmlwIHVua25vd24gcGFydHNcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0aXNFcnJvcjogYy5pc0Vycm9yXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKGMgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQpIHtcblx0XHRcdFx0aWYgKGlzSW1hZ2VEYXRhUGFydChjKSkge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlOiBjaGF0UHJvdmlkZXIuSUNoYXRJbWFnZVVSTFBhcnQgPSB7XG5cdFx0XHRcdFx0XHRtaW1lVHlwZTogYy5taW1lVHlwZSBhcyBjaGF0UHJvdmlkZXIuQ2hhdEltYWdlTWltZVR5cGUsXG5cdFx0XHRcdFx0XHRkYXRhOiBWU0J1ZmZlci53cmFwKGMuZGF0YSksXG5cdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnaW1hZ2VfdXJsJyxcblx0XHRcdFx0XHRcdHZhbHVlOiB2YWx1ZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdkYXRhJyxcblx0XHRcdFx0XHRcdG1pbWVUeXBlOiBjLm1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0ZGF0YTogVlNCdWZmZXIud3JhcChjLmRhdGEpLFxuXHRcdFx0XHRcdFx0YXVkaWVuY2U6IGMuYXVkaWVuY2Vcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdE1lc3NhZ2VEYXRhUGFydDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChjIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sX3VzZScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogYy5jYWxsSWQsXG5cdFx0XHRcdFx0bmFtZTogYy5uYW1lLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IGMuaW5wdXRcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoYyBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogYy52YWx1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBjICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBjaGF0IG1lc3NhZ2UgY29udGVudCB0eXBlJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogY1xuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJvbGUsXG5cdFx0XHRuYW1lLFxuXHRcdFx0Y29udGVudFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyIHtcblxuXHRleHBvcnQgZnVuY3Rpb24gdG8obWVzc2FnZTogY2hhdFByb3ZpZGVyLklDaGF0TWVzc2FnZSk6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyIHtcblx0XHRjb25zdCBjb250ZW50ID0gbWVzc2FnZS5jb250ZW50Lm1hcChjID0+IHtcblx0XHRcdGlmIChjLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRyZXR1cm4gbmV3IExhbmd1YWdlTW9kZWxUZXh0UGFydChjLnZhbHVlLCBjLmF1ZGllbmNlKTtcblx0XHRcdH0gZWxzZSBpZiAoYy50eXBlID09PSAndG9vbF9yZXN1bHQnKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQ6IChMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsUHJvbXB0VHN4UGFydCB8IExhbmd1YWdlTW9kZWxEYXRhUGFydClbXSA9IGMudmFsdWUubWFwKHBhcnQgPT4ge1xuXHRcdFx0XHRcdGlmIChwYXJ0LnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQocGFydC52YWx1ZSwgcGFydC5hdWRpZW5jZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0LnR5cGUgPT09ICdkYXRhJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQocGFydC5kYXRhLmJ1ZmZlciwgcGFydC5taW1lVHlwZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQocGFydC52YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVG9vbFJlc3VsdFBhcnQoYy50b29sQ2FsbElkLCBjb250ZW50LCBjLmlzRXJyb3IpO1xuXHRcdFx0fSBlbHNlIGlmIChjLnR5cGUgPT09ICdpbWFnZV91cmwnKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KGMudmFsdWUuZGF0YS5idWZmZXIsIGMudmFsdWUubWltZVR5cGUpO1xuXHRcdFx0fSBlbHNlIGlmIChjLnR5cGUgPT09ICdkYXRhJykge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydChjLmRhdGEuYnVmZmVyLCBjLm1pbWVUeXBlKTtcblx0XHRcdH0gZWxzZSBpZiAoYy50eXBlID09PSAndGhpbmtpbmcnKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydChjLnZhbHVlLCBjLmlkLCBjLm1ldGFkYXRhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydChjLnRvb2xDYWxsSWQsIGMubmFtZSwgYy5wYXJhbWV0ZXJzKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCByb2xlID0gTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZS50byhtZXNzYWdlLnJvbGUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyKHJvbGUsIGNvbnRlbnQsIG1lc3NhZ2UubmFtZSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKG1lc3NhZ2U6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyKTogY2hhdFByb3ZpZGVyLklDaGF0TWVzc2FnZSB7XG5cblx0XHRjb25zdCByb2xlID0gTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZS5mcm9tKG1lc3NhZ2Uucm9sZSk7XG5cdFx0Y29uc3QgbmFtZSA9IG1lc3NhZ2UubmFtZTtcblxuXHRcdGxldCBtZXNzYWdlQ29udGVudCA9IG1lc3NhZ2UuY29udGVudDtcblx0XHRpZiAodHlwZW9mIG1lc3NhZ2VDb250ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdFx0bWVzc2FnZUNvbnRlbnQgPSBbbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydChtZXNzYWdlQ29udGVudCldO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBtZXNzYWdlQ29udGVudC5tYXAoKGMpOiBjaGF0UHJvdmlkZXIuSUNoYXRNZXNzYWdlUGFydCA9PiB7XG5cdFx0XHRpZiAoYyBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0UGFydCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sX3Jlc3VsdCcsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogYy5jYWxsSWQsXG5cdFx0XHRcdFx0dmFsdWU6IGNvYWxlc2NlKGMuY29udGVudC5tYXAocGFydCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHRcdFx0XHR2YWx1ZTogcGFydC52YWx1ZSxcblx0XHRcdFx0XHRcdFx0XHRhdWRpZW5jZTogcGFydC5hdWRpZW5jZSxcblx0XHRcdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRSZXNwb25zZVRleHRQYXJ0O1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAncHJvbXB0X3RzeCcsXG5cdFx0XHRcdFx0XHRcdFx0dmFsdWU6IHBhcnQudmFsdWUsXG5cdFx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0UmVzcG9uc2VQcm9tcHRUc3hQYXJ0O1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2RhdGEnLFxuXHRcdFx0XHRcdFx0XHRcdG1pbWVUeXBlOiBwYXJ0Lm1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0XHRcdGRhdGE6IFZTQnVmZmVyLndyYXAocGFydC5kYXRhKSxcblx0XHRcdFx0XHRcdFx0XHRhdWRpZW5jZTogcGFydC5hdWRpZW5jZVxuXHRcdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFJlc3BvbnNlRGF0YVBhcnQ7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBTdHJpcCB1bmtub3duIHBhcnRzXG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpLFxuXHRcdFx0XHRcdGlzRXJyb3I6IGMuaXNFcnJvclxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIGlmIChjIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KSB7XG5cdFx0XHRcdGlmIChpc0ltYWdlRGF0YVBhcnQoYykpIHtcblx0XHRcdFx0XHRjb25zdCB2YWx1ZTogY2hhdFByb3ZpZGVyLklDaGF0SW1hZ2VVUkxQYXJ0ID0ge1xuXHRcdFx0XHRcdFx0bWltZVR5cGU6IGMubWltZVR5cGUgYXMgY2hhdFByb3ZpZGVyLkNoYXRJbWFnZU1pbWVUeXBlLFxuXHRcdFx0XHRcdFx0ZGF0YTogVlNCdWZmZXIud3JhcChjLmRhdGEpLFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2ltYWdlX3VybCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogdmFsdWVcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZGF0YScsXG5cdFx0XHRcdFx0XHRtaW1lVHlwZTogYy5taW1lVHlwZSxcblx0XHRcdFx0XHRcdGRhdGE6IFZTQnVmZmVyLndyYXAoYy5kYXRhKSxcblx0XHRcdFx0XHRcdGF1ZGllbmNlOiBjLmF1ZGllbmNlXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRNZXNzYWdlRGF0YVBhcnQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoYyBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbF91c2UnLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGMuY2FsbElkLFxuXHRcdFx0XHRcdG5hbWU6IGMubmFtZSxcblx0XHRcdFx0XHRwYXJhbWV0ZXJzOiBjLmlucHV0XG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKGMgaW5zdGFuY2VvZiB0eXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IGMudmFsdWVcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoYyBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAndGhpbmtpbmcnLFxuXHRcdFx0XHRcdHZhbHVlOiBjLnZhbHVlLFxuXHRcdFx0XHRcdGlkOiBjLmlkLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiBjLm1ldGFkYXRhXG5cdFx0XHRcdH07XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgYyAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgY2hhdCBtZXNzYWdlIGNvbnRlbnQgdHlwZSBsbG0gMicpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IGNcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRyb2xlLFxuXHRcdFx0bmFtZSxcblx0XHRcdGNvbnRlbnRcblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzSW1hZ2VEYXRhUGFydChwYXJ0OiB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQpOiBib29sZWFuIHtcblx0Y29uc3QgbWltZSA9IHR5cGVvZiBwYXJ0Lm1pbWVUeXBlID09PSAnc3RyaW5nJyA/IHBhcnQubWltZVR5cGUudG9Mb3dlckNhc2UoKSA6ICcnO1xuXHRzd2l0Y2ggKG1pbWUpIHtcblx0XHRjYXNlICdpbWFnZS9wbmcnOlxuXHRcdGNhc2UgJ2ltYWdlL2pwZWcnOlxuXHRcdGNhc2UgJ2ltYWdlL2pwZyc6XG5cdFx0Y2FzZSAnaW1hZ2UvZ2lmJzpcblx0XHRjYXNlICdpbWFnZS93ZWJwJzpcblx0XHRjYXNlICdpbWFnZS9ibXAnOlxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZU1hcmtkb3duUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VNYXJrZG93blBhcnQpOiBEdG88SUNoYXRNYXJrZG93bkNvbnRlbnQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ21hcmtkb3duQ29udGVudCcsXG5cdFx0XHRjb250ZW50OiBNYXJrZG93blN0cmluZy5mcm9tKHBhcnQudmFsdWUpXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGFydDogRHRvPElDaGF0TWFya2Rvd25Db250ZW50Pik6IHZzY29kZS5DaGF0UmVzcG9uc2VNYXJrZG93blBhcnQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0KE1hcmtkb3duU3RyaW5nLnRvKHBhcnQuY29udGVudCkpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0KTogRHRvPElDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdjb2RlYmxvY2tVcmknLFxuXHRcdFx0dXJpOiBwYXJ0LnZhbHVlLFxuXHRcdFx0aXNFZGl0OiBwYXJ0LmlzRWRpdCxcblx0XHRcdHVuZG9TdG9wSWQ6IHBhcnQudW5kb1N0b3BJZFxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydD4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0KFVSSS5yZXZpdmUocGFydC51cmkpLCBwYXJ0LmlzRWRpdCwgcGFydC51bmRvU3RvcElkKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZU1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllc1BhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlTWFya2Rvd25XaXRoVnVsbmVyYWJpbGl0aWVzUGFydCk6IER0bzxJQ2hhdEFnZW50TWFya2Rvd25Db250ZW50V2l0aFZ1bG5lcmFiaWxpdHk+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ21hcmtkb3duVnVsbicsXG5cdFx0XHRjb250ZW50OiBNYXJrZG93blN0cmluZy5mcm9tKHBhcnQudmFsdWUpLFxuXHRcdFx0dnVsbmVyYWJpbGl0aWVzOiBwYXJ0LnZ1bG5lcmFiaWxpdGllcyxcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRBZ2VudE1hcmtkb3duQ29udGVudFdpdGhWdWxuZXJhYmlsaXR5Pik6IHZzY29kZS5DaGF0UmVzcG9uc2VNYXJrZG93bldpdGhWdWxuZXJhYmlsaXRpZXNQYXJ0IHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZU1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllc1BhcnQoTWFya2Rvd25TdHJpbmcudG8ocGFydC5jb250ZW50KSwgcGFydC52dWxuZXJhYmlsaXRpZXMpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlQ29uZmlybWF0aW9uUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0KTogRHRvPElDaGF0Q29uZmlybWF0aW9uPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0dGl0bGU6IHBhcnQudGl0bGUsXG5cdFx0XHRtZXNzYWdlOiBNYXJrZG93blN0cmluZy5mcm9tKHBhcnQubWVzc2FnZSksXG5cdFx0XHRkYXRhOiBwYXJ0LmRhdGEsXG5cdFx0XHRidXR0b25zOiBwYXJ0LmJ1dHRvbnNcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQge1xuXHRmdW5jdGlvbiBxdWVzdGlvblR5cGVUb1N0cmluZyh0eXBlOiB2c2NvZGUuQ2hhdFF1ZXN0aW9uVHlwZSk6ICd0ZXh0JyB8ICdzaW5nbGVTZWxlY3QnIHwgJ211bHRpU2VsZWN0JyB7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIHR5cGVzLkNoYXRRdWVzdGlvblR5cGUuVGV4dDogcmV0dXJuICd0ZXh0Jztcblx0XHRcdGNhc2UgdHlwZXMuQ2hhdFF1ZXN0aW9uVHlwZS5TaW5nbGVTZWxlY3Q6IHJldHVybiAnc2luZ2xlU2VsZWN0Jztcblx0XHRcdGNhc2UgdHlwZXMuQ2hhdFF1ZXN0aW9uVHlwZS5NdWx0aVNlbGVjdDogcmV0dXJuICdtdWx0aVNlbGVjdCc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gJ3RleHQnO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHN0cmluZ1RvUXVlc3Rpb25UeXBlKHR5cGU6ICd0ZXh0JyB8ICdzaW5nbGVTZWxlY3QnIHwgJ211bHRpU2VsZWN0Jyk6IHZzY29kZS5DaGF0UXVlc3Rpb25UeXBlIHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgJ3RleHQnOiByZXR1cm4gdHlwZXMuQ2hhdFF1ZXN0aW9uVHlwZS5UZXh0O1xuXHRcdFx0Y2FzZSAnc2luZ2xlU2VsZWN0JzogcmV0dXJuIHR5cGVzLkNoYXRRdWVzdGlvblR5cGUuU2luZ2xlU2VsZWN0O1xuXHRcdFx0Y2FzZSAnbXVsdGlTZWxlY3QnOiByZXR1cm4gdHlwZXMuQ2hhdFF1ZXN0aW9uVHlwZS5NdWx0aVNlbGVjdDtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiB0eXBlcy5DaGF0UXVlc3Rpb25UeXBlLlRleHQ7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZVF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0KTogRHRvPElDaGF0UXVlc3Rpb25DYXJvdXNlbD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAncXVlc3Rpb25DYXJvdXNlbCcsXG5cdFx0XHRxdWVzdGlvbnM6IHBhcnQucXVlc3Rpb25zLm1hcChxID0+ICh7XG5cdFx0XHRcdGlkOiBxLmlkLFxuXHRcdFx0XHR0eXBlOiBxdWVzdGlvblR5cGVUb1N0cmluZyhxLnR5cGUpLFxuXHRcdFx0XHR0aXRsZTogcS50aXRsZSxcblx0XHRcdFx0bWVzc2FnZTogcS5tZXNzYWdlID8gTWFya2Rvd25TdHJpbmcuZnJvbShxLm1lc3NhZ2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRvcHRpb25zOiBxLm9wdGlvbnM/Lm1hcChvcHQgPT4gKHsgaWQ6IG9wdC5pZCwgbGFiZWw6IG9wdC5sYWJlbCwgdmFsdWU6IFN0cmluZyhvcHQudmFsdWUpIH0pKSxcblx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBxLmRlZmF1bHRWYWx1ZSxcblx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBxLmFsbG93RnJlZWZvcm1JbnB1dFxuXHRcdFx0fSkpLFxuXHRcdFx0YWxsb3dTa2lwOiBwYXJ0LmFsbG93U2tpcFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGFydDogRHRvPElDaGF0UXVlc3Rpb25DYXJvdXNlbD4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQge1xuXHRcdGNvbnN0IHF1ZXN0aW9ucyA9IHBhcnQucXVlc3Rpb25zLm1hcChxID0+IG5ldyB0eXBlcy5DaGF0UXVlc3Rpb24oXG5cdFx0XHRxLmlkLFxuXHRcdFx0c3RyaW5nVG9RdWVzdGlvblR5cGUocS50eXBlKSxcblx0XHRcdHEudGl0bGUsXG5cdFx0XHR7XG5cdFx0XHRcdG1lc3NhZ2U6IHEubWVzc2FnZSA/ICh0eXBlb2YgcS5tZXNzYWdlID09PSAnc3RyaW5nJyA/IG5ldyB0eXBlcy5NYXJrZG93blN0cmluZyhxLm1lc3NhZ2UpIDogTWFya2Rvd25TdHJpbmcudG8ocS5tZXNzYWdlKSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9wdGlvbnM6IHEub3B0aW9ucz8ubWFwKG9wdCA9PiAoe1xuXHRcdFx0XHRcdGlkOiBvcHQuaWQsXG5cdFx0XHRcdFx0bGFiZWw6IG9wdC5sYWJlbCxcblx0XHRcdFx0XHR2YWx1ZTogb3B0LnZhbHVlXG5cdFx0XHRcdH0pKSxcblx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBxLmRlZmF1bHRWYWx1ZSxcblx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBxLmFsbG93RnJlZWZvcm1JbnB1dFxuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQocXVlc3Rpb25zLCBwYXJ0LmFsbG93U2tpcCk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VGaWxlc1BhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlRmlsZVRyZWVQYXJ0KTogSUNoYXRUcmVlRGF0YSB7XG5cdFx0Y29uc3QgeyB2YWx1ZSwgYmFzZVVyaSB9ID0gcGFydDtcblx0XHRmdW5jdGlvbiBjb252ZXJ0KGl0ZW1zOiB2c2NvZGUuQ2hhdFJlc3BvbnNlRmlsZVRyZWVbXSwgYmFzZVVyaTogVVJJKTogZXh0SG9zdFByb3RvY29sLklDaGF0UmVzcG9uc2VQcm9ncmVzc0ZpbGVUcmVlRGF0YVtdIHtcblx0XHRcdHJldHVybiBpdGVtcy5tYXAoaXRlbSA9PiB7XG5cdFx0XHRcdGNvbnN0IG15VXJpID0gVVJJLmpvaW5QYXRoKGJhc2VVcmksIGl0ZW0ubmFtZSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IGl0ZW0ubmFtZSxcblx0XHRcdFx0XHR1cmk6IG15VXJpLFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBpdGVtLmNoaWxkcmVuICYmIGNvbnZlcnQoaXRlbS5jaGlsZHJlbiwgbXlVcmkpXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICd0cmVlRGF0YScsXG5cdFx0XHR0cmVlRGF0YToge1xuXHRcdFx0XHRsYWJlbDogYmFzZW5hbWUoYmFzZVVyaSksXG5cdFx0XHRcdHVyaTogYmFzZVVyaSxcblx0XHRcdFx0Y2hpbGRyZW46IGNvbnZlcnQodmFsdWUsIGJhc2VVcmkpXG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGFydDogRHRvPElDaGF0VHJlZURhdGE+KTogdnNjb2RlLkNoYXRSZXNwb25zZUZpbGVUcmVlUGFydCB7XG5cdFx0Y29uc3QgdHJlZURhdGEgPSByZXZpdmU8ZXh0SG9zdFByb3RvY29sLklDaGF0UmVzcG9uc2VQcm9ncmVzc0ZpbGVUcmVlRGF0YT4ocGFydC50cmVlRGF0YSk7XG5cdFx0ZnVuY3Rpb24gY29udmVydChpdGVtczogZXh0SG9zdFByb3RvY29sLklDaGF0UmVzcG9uc2VQcm9ncmVzc0ZpbGVUcmVlRGF0YVtdKTogdnNjb2RlLkNoYXRSZXNwb25zZUZpbGVUcmVlW10ge1xuXHRcdFx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRuYW1lOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBpdGVtLmNoaWxkcmVuICYmIGNvbnZlcnQoaXRlbS5jaGlsZHJlbilcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJhc2VVcmkgPSB0cmVlRGF0YS51cmk7XG5cdFx0Y29uc3QgaXRlbXMgPSB0cmVlRGF0YS5jaGlsZHJlbiA/IGNvbnZlcnQodHJlZURhdGEuY2hpbGRyZW4pIDogW107XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VGaWxlVHJlZVBhcnQoaXRlbXMsIGJhc2VVcmkpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlTXVsdGlEaWZmUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VNdWx0aURpZmZQYXJ0KTogSUNoYXRNdWx0aURpZmZEYXRhU2VyaWFsaXplZCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdtdWx0aURpZmZEYXRhJyxcblx0XHRcdG11bHRpRGlmZkRhdGE6IHtcblx0XHRcdFx0dGl0bGU6IHBhcnQudGl0bGUsXG5cdFx0XHRcdHJlc291cmNlczogcGFydC52YWx1ZS5tYXAoZW50cnkgPT4gKHtcblx0XHRcdFx0XHRvcmlnaW5hbFVyaTogZW50cnkub3JpZ2luYWxVcmksXG5cdFx0XHRcdFx0bW9kaWZpZWRVcmk6IGVudHJ5Lm1vZGlmaWVkVXJpLFxuXHRcdFx0XHRcdGdvVG9GaWxlVXJpOiBlbnRyeS5nb1RvRmlsZVVyaSxcblx0XHRcdFx0XHRhZGRlZDogZW50cnkuYWRkZWQsXG5cdFx0XHRcdFx0cmVtb3ZlZDogZW50cnkucmVtb3ZlZCxcblx0XHRcdFx0fSkpXG5cdFx0XHR9LFxuXHRcdFx0cmVhZE9ubHk6IHBhcnQucmVhZE9ubHlcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBJQ2hhdE11bHRpRGlmZkRhdGFTZXJpYWxpemVkKTogdnNjb2RlLkNoYXRSZXNwb25zZU11bHRpRGlmZlBhcnQge1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IHBhcnQubXVsdGlEaWZmRGF0YS5yZXNvdXJjZXMubWFwKHJlc291cmNlID0+ICh7XG5cdFx0XHRvcmlnaW5hbFVyaTogcmVzb3VyY2Uub3JpZ2luYWxVcmkgPyBVUkkucmV2aXZlKHJlc291cmNlLm9yaWdpbmFsVXJpKSA6IHVuZGVmaW5lZCxcblx0XHRcdG1vZGlmaWVkVXJpOiByZXNvdXJjZS5tb2RpZmllZFVyaSA/IFVSSS5yZXZpdmUocmVzb3VyY2UubW9kaWZpZWRVcmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0Z29Ub0ZpbGVVcmk6IHJlc291cmNlLmdvVG9GaWxlVXJpID8gVVJJLnJldml2ZShyZXNvdXJjZS5nb1RvRmlsZVVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRhZGRlZDogcmVzb3VyY2UuYWRkZWQsXG5cdFx0XHRyZW1vdmVkOiByZXNvdXJjZS5yZW1vdmVkLFxuXHRcdH0pKTtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZU11bHRpRGlmZlBhcnQocmVzb3VyY2VzLCBwYXJ0Lm11bHRpRGlmZkRhdGEudGl0bGUsIHBhcnQucmVhZE9ubHkpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlQW5jaG9yUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VBbmNob3JQYXJ0KTogRHRvPElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZT4ge1xuXHRcdC8vIFdvcmsgYXJvdW5kIHR5cGUtbmFycm93aW5nIGNvbmZ1c2lvbiBiZXR3ZWVuIHZzY29kZS5VcmkgYW5kIFVSSVxuXHRcdGNvbnN0IGlzVXJpID0gKHRoaW5nOiB1bmtub3duKTogdGhpbmcgaXMgdnNjb2RlLlVyaSA9PiBVUkkuaXNVcmkodGhpbmcpO1xuXHRcdGNvbnN0IGlzU3ltYm9sSW5mb3JtYXRpb24gPSAodGhpbmc6IG9iamVjdCk6IHRoaW5nIGlzIHZzY29kZS5TeW1ib2xJbmZvcm1hdGlvbiA9PiAnbmFtZScgaW4gdGhpbmc7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2lubGluZVJlZmVyZW5jZScsXG5cdFx0XHRuYW1lOiBwYXJ0LnRpdGxlLFxuXHRcdFx0aW5saW5lUmVmZXJlbmNlOiBpc1VyaShwYXJ0LnZhbHVlKVxuXHRcdFx0XHQ/IHBhcnQudmFsdWVcblx0XHRcdFx0OiBpc1N5bWJvbEluZm9ybWF0aW9uKHBhcnQudmFsdWUpXG5cdFx0XHRcdFx0PyBXb3Jrc3BhY2VTeW1ib2wuZnJvbShwYXJ0LnZhbHVlKVxuXHRcdFx0XHRcdDogTG9jYXRpb24uZnJvbShwYXJ0LnZhbHVlKVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGFydDogRHRvPElDaGF0Q29udGVudElubGluZVJlZmVyZW5jZT4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlQW5jaG9yUGFydCB7XG5cdFx0Y29uc3QgdmFsdWUgPSByZXZpdmU8SUNoYXRDb250ZW50SW5saW5lUmVmZXJlbmNlPihwYXJ0KTtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZUFuY2hvclBhcnQoXG5cdFx0XHRVUkkuaXNVcmkodmFsdWUuaW5saW5lUmVmZXJlbmNlKVxuXHRcdFx0XHQ/IHZhbHVlLmlubGluZVJlZmVyZW5jZVxuXHRcdFx0XHQ6ICdsb2NhdGlvbicgaW4gdmFsdWUuaW5saW5lUmVmZXJlbmNlXG5cdFx0XHRcdFx0PyBXb3Jrc3BhY2VTeW1ib2wudG8odmFsdWUuaW5saW5lUmVmZXJlbmNlKSBhcyB2c2NvZGUuU3ltYm9sSW5mb3JtYXRpb25cblx0XHRcdFx0XHQ6IExvY2F0aW9uLnRvKHZhbHVlLmlubGluZVJlZmVyZW5jZSksXG5cdFx0XHRwYXJ0Lm5hbWVcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZVByb2dyZXNzUGFydCk6IER0bzxJQ2hhdFByb2dyZXNzTWVzc2FnZT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJyxcblx0XHRcdGNvbnRlbnQ6IE1hcmtkb3duU3RyaW5nLmZyb20ocGFydC52YWx1ZSlcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRQcm9ncmVzc01lc3NhZ2U+KTogdnNjb2RlLkNoYXRSZXNwb25zZVByb2dyZXNzUGFydCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQocGFydC5jb250ZW50LnZhbHVlKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0KTogRHRvPElDaGF0VGhpbmtpbmdQYXJ0PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICd0aGlua2luZycsXG5cdFx0XHR2YWx1ZTogcGFydC52YWx1ZSxcblx0XHRcdGlkOiBwYXJ0LmlkLFxuXHRcdFx0bWV0YWRhdGE6IHBhcnQubWV0YWRhdGFcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRUaGlua2luZ1BhcnQ+KTogdnNjb2RlLkNoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0IHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0KHBhcnQudmFsdWUgPz8gJycsIHBhcnQuaWQsIHBhcnQubWV0YWRhdGEpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlSG9va1BhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlSG9va1BhcnQpOiBEdG88SUNoYXRIb29rUGFydD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnaG9vaycsXG5cdFx0XHRob29rVHlwZTogcGFydC5ob29rVHlwZSxcblx0XHRcdHN0b3BSZWFzb246IHBhcnQuc3RvcFJlYXNvbixcblx0XHRcdHN5c3RlbU1lc3NhZ2U6IHBhcnQuc3lzdGVtTWVzc2FnZSxcblx0XHRcdG1ldGFkYXRhOiBwYXJ0Lm1ldGFkYXRhXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGFydDogRHRvPElDaGF0SG9va1BhcnQ+KTogdnNjb2RlLkNoYXRSZXNwb25zZUhvb2tQYXJ0IHtcblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZUhvb2tQYXJ0KHBhcnQuaG9va1R5cGUsIHBhcnQuc3RvcFJlYXNvbiwgcGFydC5zeXN0ZW1NZXNzYWdlLCBwYXJ0Lm1ldGFkYXRhKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NQYXJ0KTogRHRvPElDaGF0Vm9pY2VQcm9ncmVzc1BhcnQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3ZvaWNlUHJvZ3Jlc3MnLFxuXHRcdFx0aWQ6IHBhcnQuaWQsXG5cdFx0XHR2YWx1ZTogcGFydC52YWx1ZSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydCB7XG5cdGNvbnN0IHZhbGlkTGFiZWxzID0gbmV3IFNldDxJQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvblBhcnRbJ3ByZWRpY3RlZExhYmVsJ10+KFsnbmVlZHNfcmVhc29uaW5nJywgJ25vX3JlYXNvbmluZycsICdmYWxsYmFjayddKTtcblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydCk6IER0bzxJQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvblBhcnQ+IHtcblx0XHRjb25zdCBsYWJlbCA9IHZhbGlkTGFiZWxzLmhhcyhwYXJ0LnByZWRpY3RlZExhYmVsIGFzIElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydFsncHJlZGljdGVkTGFiZWwnXSlcblx0XHRcdD8gcGFydC5wcmVkaWN0ZWRMYWJlbCBhcyBJQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvblBhcnRbJ3ByZWRpY3RlZExhYmVsJ11cblx0XHRcdDogJ2ZhbGxiYWNrJztcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2F1dG9Nb2RlUmVzb2x1dGlvbicsXG5cdFx0XHRyZXNvbHZlZE1vZGVsOiBwYXJ0LnJlc29sdmVkTW9kZWwsXG5cdFx0XHRyZXNvbHZlZE1vZGVsTmFtZTogcGFydC5yZXNvbHZlZE1vZGVsTmFtZSxcblx0XHRcdHByZWRpY3RlZExhYmVsOiBsYWJlbCxcblx0XHRcdGNvbmZpZGVuY2U6IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIHBhcnQuY29uZmlkZW5jZSkpLFxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvblBhcnQ+KTogdnNjb2RlLkNoYXRSZXNwb25zZUF1dG9Nb2RlUmVzb2x1dGlvblBhcnQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydChwYXJ0LnJlc29sdmVkTW9kZWwsIHBhcnQucmVzb2x2ZWRNb2RlbE5hbWUsIHBhcnQucHJlZGljdGVkTGFiZWwsIHBhcnQuY29uZmlkZW5jZSk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VXYXJuaW5nUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydCk6IER0bzxJQ2hhdFdhcm5pbmdNZXNzYWdlPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICd3YXJuaW5nJyxcblx0XHRcdGNvbnRlbnQ6IE1hcmtkb3duU3RyaW5nLmZyb20ocGFydC52YWx1ZSlcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRXYXJuaW5nTWVzc2FnZT4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQocGFydC5jb250ZW50LnZhbHVlKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZUluZm9QYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZUluZm9QYXJ0KTogRHRvPElDaGF0SW5mb01lc3NhZ2U+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2luZm8nLFxuXHRcdFx0Y29udGVudDogTWFya2Rvd25TdHJpbmcuZnJvbShwYXJ0LnZhbHVlKVxuXHRcdH07XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHBhcnQ6IER0bzxJQ2hhdEluZm9NZXNzYWdlPik6IHZzY29kZS5DaGF0UmVzcG9uc2VJbmZvUGFydCB7XG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VJbmZvUGFydChwYXJ0LmNvbnRlbnQudmFsdWUpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlRXh0ZW5zaW9uc1BhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlRXh0ZW5zaW9uc1BhcnQpOiBEdG88SUNoYXRFeHRlbnNpb25zQ29udGVudD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnZXh0ZW5zaW9ucycsXG5cdFx0XHRleHRlbnNpb25zOiBwYXJ0LmV4dGVuc2lvbnNcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlUHVsbFJlcXVlc3RQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogT21pdDx2c2NvZGUuQ2hhdFJlc3BvbnNlUHVsbFJlcXVlc3RQYXJ0LCAnY29tbWFuZCc+ICYgeyBjb21tYW5kPzogdnNjb2RlLkNvbW1hbmQgfSwgY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyLCBjb21tYW5kRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IER0bzxJQ2hhdFB1bGxSZXF1ZXN0Q29udGVudD4ge1xuXHRcdC8vIElmIHRoZSBjb21tYW5kIGlzbid0IGluIHRoZSBjb252ZXJ0ZXIsIHRoZW4gdGhpcyBzZXNzaW9uIG1heSBoYXZlIGJlZW4gcmVzdG9yZWQsIGFuZCB0aGUgY29tbWFuZCBhcmdzIGRvbid0IGV4aXN0IGFueW1vcmVcblx0XHRsZXQgY29tbWFuZDogZXh0SG9zdFByb3RvY29sLklDb21tYW5kRHRvO1xuXHRcdGlmICghcGFydC5jb21tYW5kKSB7XG5cdFx0XHRpZiAoIXBhcnQudXJpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignUHVsbCByZXF1ZXN0IHBhcnQgbXVzdCBoYXZlIGEgY29tbWFuZCBpZiBVUkkgaXMgcHJvdmlkZWQnKTtcblx0XHRcdH1cblx0XHRcdGNvbW1hbmQgPSB7XG5cdFx0XHRcdHRpdGxlOiAnT3BlbiBQdWxsIFJlcXVlc3QnLFxuXHRcdFx0XHRpZDogJ3ZzY29kZS5vcGVuJyxcblx0XHRcdFx0YXJndW1lbnRzOiBbcGFydC51cmldXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb21tYW5kID0gY29tbWFuZHNDb252ZXJ0ZXIudG9JbnRlcm5hbChwYXJ0LmNvbW1hbmQsIGNvbW1hbmREaXNwb3NhYmxlcyk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAncHVsbFJlcXVlc3QnLFxuXHRcdFx0YXV0aG9yOiBwYXJ0LmF1dGhvcixcblx0XHRcdHRpdGxlOiBwYXJ0LnRpdGxlLFxuXHRcdFx0ZGVzY3JpcHRpb246IHBhcnQuZGVzY3JpcHRpb24sXG5cdFx0XHR1cmk6IHBhcnQudXJpLFxuXHRcdFx0bGlua1RhZzogcGFydC5saW5rVGFnLFxuXHRcdFx0Y29tbWFuZFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VNb3ZlUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VNb3ZlUGFydCk6IER0bzxJQ2hhdE1vdmVNZXNzYWdlPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdtb3ZlJyxcblx0XHRcdHVyaTogcGFydC51cmksXG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbShwYXJ0LnJhbmdlKSxcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRNb3ZlTWVzc2FnZT4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlTW92ZVBhcnQge1xuXHRcdHJldHVybiBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlTW92ZVBhcnQoVVJJLnJldml2ZShwYXJ0LnVyaSksIFJhbmdlLnRvKHBhcnQucmFuZ2UpKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRUb29sSW52b2NhdGlvblBhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCk6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkIHwgSUNoYXRFeHRlcm5hbFRvb2xJbnZvY2F0aW9uVXBkYXRlIHtcblx0XHQvLyBDaGVjayBpZiB0b29sU3BlY2lmaWNEYXRhIGlzIENoYXRNY3BUb29sSW52b2NhdGlvbkRhdGEgKGhhcyBpbnB1dCBhbmQgb3V0cHV0KVxuXHRcdC8vIElmIHNvLCBjb252ZXJ0IHRvIHJlc3VsdERldGFpbHMgZm9yIHJlbmRlcmluZyB2aWEgQ2hhdElucHV0T3V0cHV0TWFya2Rvd25Qcm9ncmVzc1BhcnRcblx0XHRsZXQgcmVzdWx0RGV0YWlsczogSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHRvb2xTcGVjaWZpY0RhdGE6IGFueTtcblxuXHRcdGlmIChwYXJ0LnRvb2xTcGVjaWZpY0RhdGEgJiYgaXNDaGF0TWNwVG9vbEludm9jYXRpb25EYXRhKHBhcnQudG9vbFNwZWNpZmljRGF0YSkpIHtcblx0XHRcdC8vIENvbnZlcnQgQ2hhdE1jcFRvb2xJbnZvY2F0aW9uRGF0YSB0byBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlsc1xuXHRcdFx0cmVzdWx0RGV0YWlscyA9IGNvbnZlcnRNY3BUb1Jlc3VsdERldGFpbHMocGFydC50b29sU3BlY2lmaWNEYXRhLCBwYXJ0LmlzRXJyb3IpO1xuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSA9IHVuZGVmaW5lZDsgLy8gTUNQIGRhdGEgZ29lcyB0byByZXN1bHREZXRhaWxzLCBub3QgdG9vbFNwZWNpZmljRGF0YVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhID0gcGFydC50b29sU3BlY2lmaWNEYXRhID8gY29udmVydFRvb2xTcGVjaWZpY0RhdGEocGFydC50b29sU3BlY2lmaWNEYXRhKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSBwYXJ0LnByZXNlbnRhdGlvbiA9PT0gJ2hpZGRlbidcblx0XHRcdD8gVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuXG5cdFx0XHQ6IHBhcnQucHJlc2VudGF0aW9uID09PSAnaGlkZGVuQWZ0ZXJDb21wbGV0ZSdcblx0XHRcdFx0PyBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5BZnRlckNvbXBsZXRlXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gV2hlbiBpc0NvbXBsZXRlIGlzIGV4cGxpY2l0bHkgc2V0IChub3QgdW5kZWZpbmVkKSwgdXNlIHRoZSB1cGRhdGUgRFRPIHRvIGVuYWJsZVxuXHRcdC8vIGxpdmUgdG9vbCBpbnZvY2F0aW9uIHVwZGF0ZXMuIEV4dGVuc2lvbnMgY2FuIHB1c2ggd2l0aCBpc0NvbXBsZXRlOiBmYWxzZSB0byBzdGFydFxuXHRcdC8vIGFuIGluLXByb2dyZXNzIGludm9jYXRpb24sIHRoZW4gcHVzaCBhZ2FpbiB3aXRoIGlzQ29tcGxldGU6IHRydWUgdG8gY29tcGxldGUgaXQuXG5cdFx0aWYgKHBhcnQuZW5hYmxlUGFydGlhbFVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2V4dGVybmFsVG9vbEludm9jYXRpb25VcGRhdGUnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBwYXJ0LnRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiBwYXJ0LnRvb2xOYW1lLFxuXHRcdFx0XHRpc0NvbXBsZXRlOiAhIXBhcnQuaXNDb21wbGV0ZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHBhcnQuaW52b2NhdGlvbk1lc3NhZ2UgPyBNYXJrZG93blN0cmluZy5mcm9tKHBhcnQuaW52b2NhdGlvbk1lc3NhZ2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBwYXJ0LnBhc3RUZW5zZU1lc3NhZ2UgPyBNYXJrZG93blN0cmluZy5mcm9tKHBhcnQucGFzdFRlbnNlTWVzc2FnZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiBwYXJ0LnN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0XHRyZXN1bHREZXRhaWxzXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIENvbnZlcnQgZXh0ZW5zaW9uIEFQSSBDaGF0VG9vbEludm9jYXRpb25QYXJ0IHRvIGludGVybmFsIHNlcmlhbGl6ZWQgZm9ybWF0IChsZWdhY3kgcGF0aClcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHR0b29sQ2FsbElkOiBwYXJ0LnRvb2xDYWxsSWQsXG5cdFx0XHR0b29sSWQ6IHBhcnQudG9vbE5hbWUsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcGFydC5pbnZvY2F0aW9uTWVzc2FnZSA/IE1hcmtkb3duU3RyaW5nLmZyb20ocGFydC5pbnZvY2F0aW9uTWVzc2FnZSkgOiBwYXJ0LnRvb2xOYW1lLFxuXHRcdFx0b3JpZ2luTWVzc2FnZTogcGFydC5vcmlnaW5NZXNzYWdlID8gTWFya2Rvd25TdHJpbmcuZnJvbShwYXJ0Lm9yaWdpbk1lc3NhZ2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogcGFydC5wYXN0VGVuc2VNZXNzYWdlID8gTWFya2Rvd25TdHJpbmcuZnJvbShwYXJ0LnBhc3RUZW5zZU1lc3NhZ2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0aXNDb25maXJtZWQ6IHBhcnQuaXNDb25maXJtZWQsXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCxcblx0XHRcdC8vIGlzRXJyb3I6IHBhcnQuaXNFcnJvciA/PyBmYWxzZSxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHRyZXN1bHREZXRhaWxzLFxuXHRcdFx0cHJlc2VudGF0aW9uLFxuXHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHBhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWRcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNDaGF0TWNwVG9vbEludm9jYXRpb25EYXRhKGRhdGE6IGFueSk6IGRhdGEgaXMgdnNjb2RlLkNoYXRNY3BUb29sSW52b2NhdGlvbkRhdGEge1xuXHRcdHJldHVybiBkYXRhICE9PSBudWxsICYmIHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJlxuXHRcdFx0J2lucHV0JyBpbiBkYXRhICYmIHR5cGVvZiBkYXRhLmlucHV0ID09PSAnc3RyaW5nJyAmJlxuXHRcdFx0J291dHB1dCcgaW4gZGF0YSAmJiBBcnJheS5pc0FycmF5KGRhdGEub3V0cHV0KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNvbnZlcnRNY3BUb1Jlc3VsdERldGFpbHMoZGF0YTogdnNjb2RlLkNoYXRNY3BUb29sSW52b2NhdGlvbkRhdGEsIGlzRXJyb3I/OiBib29sZWFuKTogSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnB1dDogZGF0YS5pbnB1dCxcblx0XHRcdG91dHB1dDogZGF0YS5vdXRwdXQubWFwKChvKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzVGV4dCA9IG8ubWltZVR5cGUuc3RhcnRzV2l0aCgndGV4dC8nKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiAnZW1iZWQnIGFzIGNvbnN0LFxuXHRcdFx0XHRcdG1pbWVUeXBlOiBvLm1pbWVUeXBlLFxuXHRcdFx0XHRcdHZhbHVlOiBpc1RleHQgPyBWU0J1ZmZlci53cmFwKG8uZGF0YSkudG9TdHJpbmcoKSA6IGVuY29kZUJhc2U2NChWU0J1ZmZlci53cmFwKG8uZGF0YSkpLFxuXHRcdFx0XHRcdGlzVGV4dDogaXNUZXh0LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSksXG5cdFx0XHRpc0Vycm9yOiBpc0Vycm9yID8/IGZhbHNlLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjb252ZXJ0VG9vbFNwZWNpZmljRGF0YShkYXRhOiBhbnkpOiBhbnkge1xuXHRcdC8vIENvbnZlcnQgZXh0ZW5zaW9uIEFQSSB0ZXJtaW5hbCB0b29sIGRhdGEgdG8gaW50ZXJuYWwgZm9ybWF0XG5cdFx0aWYgKCdjb21tYW5kJyBpbiBkYXRhICYmICdsYW5ndWFnZScgaW4gZGF0YSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ3Rlcm1pbmFsJyxcblx0XHRcdFx0Y29tbWFuZDogZGF0YS5jb21tYW5kLFxuXHRcdFx0XHRsYW5ndWFnZTogZGF0YS5sYW5ndWFnZVxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKCdjb21tYW5kTGluZScgaW4gZGF0YSAmJiAnbGFuZ3VhZ2UnIGluIGRhdGEpIHtcblx0XHRcdGNvbnN0IHByZXNlbnRhdGlvbk92ZXJyaWRlcyA9IGRhdGEucHJlc2VudGF0aW9uT3ZlcnJpZGVzICYmIHR5cGVvZiBkYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcy5jb21tYW5kTGluZSA9PT0gJ3N0cmluZycgPyB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lOiBkYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcy5jb21tYW5kTGluZSxcblx0XHRcdFx0bGFuZ3VhZ2U6IGRhdGEucHJlc2VudGF0aW9uT3ZlcnJpZGVzLmxhbmd1YWdlXG5cdFx0XHR9IDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhID0ge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRwcmVzZW50YXRpb25PdmVycmlkZXMsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiBkYXRhLmNvbW1hbmRMaW5lLFxuXHRcdFx0XHRsYW5ndWFnZTogZGF0YS5sYW5ndWFnZSxcblx0XHRcdFx0dGVybWluYWxDb21tYW5kT3V0cHV0OiB0eXBlb2YgZGF0YS5vdXRwdXQ/LnRleHQgPT09ICdzdHJpbmcnID8ge1xuXHRcdFx0XHRcdHRleHQ6IGRhdGEub3V0cHV0LnRleHQsXG5cdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdHRlcm1pbmFsQ29tbWFuZFN0YXRlOiBkYXRhLnN0YXRlID8ge1xuXHRcdFx0XHRcdGV4aXRDb2RlOiBkYXRhLnN0YXRlLmV4aXRDb2RlLFxuXHRcdFx0XHRcdGR1cmF0aW9uOiBkYXRhLnN0YXRlLmR1cmF0aW9uLFxuXHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGVsc2UgaWYgKCd0b2RvTGlzdCcgaW4gZGF0YSAmJiBBcnJheS5pc0FycmF5KGRhdGEudG9kb0xpc3QpKSB7XG5cdFx0XHQvLyBDb252ZXJ0IGV4dGVuc2lvbiBBUEkgdG9kbyB0b29sIGRhdGEgdG8gaW50ZXJuYWwgZm9ybWF0XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAndG9kb0xpc3QnLFxuXHRcdFx0XHR0b2RvTGlzdDogZGF0YS50b2RvTGlzdC5tYXAoKHRvZG86IGFueSkgPT4gKHtcblx0XHRcdFx0XHRpZDogU3RyaW5nKHRvZG8uaWQpLFxuXHRcdFx0XHRcdHRpdGxlOiB0b2RvLnRpdGxlLFxuXHRcdFx0XHRcdHN0YXR1czogdG9kb1N0YXR1c0VudW1Ub1N0cmluZyh0b2RvLnN0YXR1cylcblx0XHRcdFx0fSkpXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoJ2lucHV0JyBpbiBkYXRhICYmICdvdXRwdXQnIGluIGRhdGEgJiYgIUFycmF5LmlzQXJyYXkoZGF0YS5vdXRwdXQpKSB7XG5cdFx0XHQvLyBDb252ZXJ0IGV4dGVuc2lvbiBBUEkgc2ltcGxlIHRvb2wgaW52b2NhdGlvbiBkYXRhIHRvIGludGVybmFsIGZvcm1hdFxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ3NpbXBsZVRvb2xJbnZvY2F0aW9uJyxcblx0XHRcdFx0aW5wdXQ6IHR5cGVvZiBkYXRhLmlucHV0ID09PSAnc3RyaW5nJyA/IGRhdGEuaW5wdXQgOiAnJyxcblx0XHRcdFx0b3V0cHV0OiB0eXBlb2YgZGF0YS5vdXRwdXQgPT09ICdzdHJpbmcnID8gZGF0YS5vdXRwdXQgOiAnJ1xuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGRhdGEgJiYgJ3ZhbHVlcycgaW4gZGF0YSAmJiBBcnJheS5pc0FycmF5KGRhdGEudmFsdWVzKSkge1xuXHRcdFx0Ly8gQ29udmVydCBleHRlbnNpb24gQVBJIHJlc291cmNlcyB0b29sIGRhdGEgdG8gaW50ZXJuYWwgZm9ybWF0XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAncmVzb3VyY2VzJyxcblx0XHRcdFx0dmFsdWVzOiBkYXRhLnZhbHVlcy5tYXAoKHY6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGlmICh2IGluc3RhbmNlb2YgdHlwZXMuTG9jYXRpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybiBMb2NhdGlvbi5mcm9tKHYpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gVVJJLnJldml2ZSh2KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoZGF0YSBpbnN0YW5jZW9mIHR5cGVzLkNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSkge1xuXHRcdFx0Ly8gQ29udmVydCBleHRlbnNpb24gQVBJIHN1YmFnZW50IHRvb2wgZGF0YSB0byBpbnRlcm5hbCBmb3JtYXRcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBkYXRhLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRhZ2VudE5hbWU6IGRhdGEuYWdlbnROYW1lLFxuXHRcdFx0XHRwcm9tcHQ6IGRhdGEucHJvbXB0LFxuXHRcdFx0XHRyZXN1bHQ6IGRhdGEucmVzdWx0LFxuXHRcdFx0XHRtb2RlbE5hbWU6IGRhdGEubW9kZWxOYW1lLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRmdW5jdGlvbiB0b2RvU3RhdHVzRW51bVRvU3RyaW5nKHN0YXR1czogdHlwZXMuQ2hhdFRvZG9TdGF0dXMgfCBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdC8vIEhhbmRsZSBlbnVtIHZhbHVlc1xuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlIHR5cGVzLkNoYXRUb2RvU3RhdHVzLk5vdFN0YXJ0ZWQ6XG5cdFx0XHRcdHJldHVybiAnbm90LXN0YXJ0ZWQnO1xuXHRcdFx0Y2FzZSB0eXBlcy5DaGF0VG9kb1N0YXR1cy5JblByb2dyZXNzOlxuXHRcdFx0XHRyZXR1cm4gJ2luLXByb2dyZXNzJztcblx0XHRcdGNhc2UgdHlwZXMuQ2hhdFRvZG9TdGF0dXMuQ29tcGxldGVkOlxuXHRcdFx0XHRyZXR1cm4gJ2NvbXBsZXRlZCc7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gJ25vdC1zdGFydGVkJztcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiB0b2RvU3RhdHVzU3RyaW5nVG9FbnVtKHN0YXR1czogc3RyaW5nKTogdHlwZXMuQ2hhdFRvZG9TdGF0dXMge1xuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlICdub3Qtc3RhcnRlZCc6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5DaGF0VG9kb1N0YXR1cy5Ob3RTdGFydGVkO1xuXHRcdFx0Y2FzZSAnaW4tcHJvZ3Jlc3MnOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuQ2hhdFRvZG9TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHRcdGNhc2UgJ2NvbXBsZXRlZCc6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5DaGF0VG9kb1N0YXR1cy5Db21wbGV0ZWQ7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuQ2hhdFRvZG9TdGF0dXMuTm90U3RhcnRlZDtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8ocGFydDogYW55KTogdnNjb2RlLkNoYXRUb29sSW52b2NhdGlvblBhcnQge1xuXHRcdGNvbnN0IHRvb2xJbnZvY2F0aW9uID0gbmV3IHR5cGVzLkNoYXRUb29sSW52b2NhdGlvblBhcnQoXG5cdFx0XHRwYXJ0LnRvb2xJZCB8fCBwYXJ0LnRvb2xOYW1lLFxuXHRcdFx0cGFydC50b29sQ2FsbElkLFxuXHRcdFx0cGFydC5lcnJvck1lc3NhZ2Vcblx0XHQpO1xuXG5cdFx0aWYgKHBhcnQuaW52b2NhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdHRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlID0gcGFydC5pbnZvY2F0aW9uTWVzc2FnZTtcblx0XHR9XG5cdFx0aWYgKHBhcnQub3JpZ2luTWVzc2FnZSkge1xuXHRcdFx0dG9vbEludm9jYXRpb24ub3JpZ2luTWVzc2FnZSA9IHBhcnQub3JpZ2luTWVzc2FnZTtcblx0XHR9XG5cdFx0aWYgKHBhcnQucGFzdFRlbnNlTWVzc2FnZSkge1xuXHRcdFx0dG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA9IHBhcnQucGFzdFRlbnNlTWVzc2FnZTtcblx0XHR9XG5cdFx0aWYgKHBhcnQuaXNDb25maXJtZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dG9vbEludm9jYXRpb24uaXNDb25maXJtZWQgPSBwYXJ0LmlzQ29uZmlybWVkO1xuXHRcdH1cblx0XHRpZiAocGFydC5pc0NvbXBsZXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUgPSBwYXJ0LmlzQ29tcGxldGU7XG5cdFx0fVxuXHRcdGlmIChwYXJ0LnRvb2xTcGVjaWZpY0RhdGEpIHtcblx0XHRcdHRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSBjb252ZXJ0RnJvbUludGVybmFsVG9vbFNwZWNpZmljRGF0YShwYXJ0LnRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdH1cblx0XHR0b29sSW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZCA9IHBhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdFx0dG9vbEludm9jYXRpb24uc3ViQWdlbnROYW1lID0gcGFydC5zdWJBZ2VudE5hbWU7XG5cblx0XHRyZXR1cm4gdG9vbEludm9jYXRpb247XG5cdH1cblxuXHRmdW5jdGlvbiBjb252ZXJ0RnJvbUludGVybmFsVG9vbFNwZWNpZmljRGF0YShkYXRhOiBhbnkpOiBhbnkge1xuXHRcdC8vIENvbnZlcnQgaW50ZXJuYWwgdGVybWluYWwgdG9vbCBkYXRhIHRvIGV4dGVuc2lvbiBBUEkgZm9ybWF0XG5cdFx0aWYgKGRhdGEua2luZCA9PT0gJ3Rlcm1pbmFsJykge1xuXHRcdFx0aWYgKGRhdGEuY29tbWFuZExpbmUpIHtcblx0XHRcdFx0Ly8gTmV3IGZvcm1hdCB3aXRoIGNvbW1hbmRMaW5lXG5cdFx0XHRcdGNvbnN0IHJlc3VsdDogYW55ID0ge1xuXHRcdFx0XHRcdGNvbW1hbmRMaW5lOiBkYXRhLmNvbW1hbmRMaW5lLFxuXHRcdFx0XHRcdGxhbmd1YWdlOiBkYXRhLmxhbmd1YWdlXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Ly8gTWFwIGludGVybmFsICd0ZXJtaW5hbENvbW1hbmRPdXRwdXQnIC0+IGV4dGVuc2lvbiAnb3V0cHV0J1xuXHRcdFx0XHRpZiAoZGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQpIHtcblx0XHRcdFx0XHRyZXN1bHQub3V0cHV0ID0ge1xuXHRcdFx0XHRcdFx0dGV4dDogZGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQudGV4dCxcblx0XHRcdFx0XHRcdHRydW5jYXRlZDogZGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQudHJ1bmNhdGVkLFxuXHRcdFx0XHRcdFx0bGluZUNvdW50OiBkYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dC5saW5lQ291bnRcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gTWFwIGludGVybmFsICd0ZXJtaW5hbENvbW1hbmRTdGF0ZScgLT4gZXh0ZW5zaW9uICdzdGF0ZSdcblx0XHRcdFx0aWYgKGRhdGEudGVybWluYWxDb21tYW5kU3RhdGUpIHtcblx0XHRcdFx0XHRyZXN1bHQuc3RhdGUgPSB7XG5cdFx0XHRcdFx0XHRleGl0Q29kZTogZGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZS5leGl0Q29kZSxcblx0XHRcdFx0XHRcdGR1cmF0aW9uOiBkYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlLmR1cmF0aW9uXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBMZWdhY3kgZm9ybWF0IHdpdGggY29tbWFuZFxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IGRhdGEuY29tbWFuZCxcblx0XHRcdFx0XHRsYW5ndWFnZTogZGF0YS5sYW5ndWFnZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZGF0YS5raW5kID09PSAndGVybWluYWwyJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29tbWFuZExpbmU6IGRhdGEuY29tbWFuZExpbmUsXG5cdFx0XHRcdGxhbmd1YWdlOiBkYXRhLmxhbmd1YWdlXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoZGF0YS5raW5kID09PSAndG9kb0xpc3QnKSB7XG5cdFx0XHQvLyBDb252ZXJ0IGludGVybmFsIHRvZG8gdG9vbCBkYXRhIHRvIGV4dGVuc2lvbiBBUEkgZm9ybWF0XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b2RvTGlzdDogZGF0YS50b2RvTGlzdC5tYXAoKHRvZG86IGFueSwgaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnNlZCA9IE51bWJlcih0b2RvLmlkKTtcblx0XHRcdFx0XHRjb25zdCBpZCA9IE51bWJlci5pc0Zpbml0ZShwYXJzZWQpID8gcGFyc2VkIDogaW5kZXg7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0dGl0bGU6IHRvZG8udGl0bGUsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IHRvZG9TdGF0dXNTdHJpbmdUb0VudW0odG9kby5zdGF0dXMpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSlcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFRhc2sge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0Mik6IElDaGF0VGFza0R0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdwcm9ncmVzc1Rhc2snLFxuXHRcdFx0Y29udGVudDogTWFya2Rvd25TdHJpbmcuZnJvbShwYXJ0LnZhbHVlKSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFRhc2tSZXN1bHQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiBzdHJpbmcgfCB2b2lkKTogRHRvPElDaGF0VGFza1Jlc3VsdD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAncHJvZ3Jlc3NUYXNrUmVzdWx0Jyxcblx0XHRcdGNvbnRlbnQ6IHR5cGVvZiBwYXJ0ID09PSAnc3RyaW5nJyA/IE1hcmtkb3duU3RyaW5nLmZyb20ocGFydCkgOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShwYXJ0OiB2c2NvZGUuQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQsIGNvbW1hbmRzQ29udmVydGVyOiBDb21tYW5kc0NvbnZlcnRlciwgY29tbWFuZERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBEdG88SUNoYXRDb21tYW5kQnV0dG9uPiB7XG5cdFx0Ly8gSWYgdGhlIGNvbW1hbmQgaXNuJ3QgaW4gdGhlIGNvbnZlcnRlciwgdGhlbiB0aGlzIHNlc3Npb24gbWF5IGhhdmUgYmVlbiByZXN0b3JlZCwgYW5kIHRoZSBjb21tYW5kIGFyZ3MgZG9uJ3QgZXhpc3QgYW55bW9yZVxuXHRcdGNvbnN0IGNvbW1hbmQgPSBjb21tYW5kc0NvbnZlcnRlci50b0ludGVybmFsKHBhcnQudmFsdWUsIGNvbW1hbmREaXNwb3NhYmxlcykgPz8geyBjb21tYW5kOiBwYXJ0LnZhbHVlLmNvbW1hbmQsIHRpdGxlOiBwYXJ0LnZhbHVlLnRpdGxlIH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdjb21tYW5kJyxcblx0XHRcdGNvbW1hbmRcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRDb21tYW5kQnV0dG9uPiwgY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyKTogdnNjb2RlLkNoYXRSZXNwb25zZUNvbW1hbmRCdXR0b25QYXJ0IHtcblx0XHQvLyBJZiB0aGUgY29tbWFuZCBpc24ndCBpbiB0aGUgY29udmVydGVyLCB0aGVuIHRoaXMgc2Vzc2lvbiBtYXkgaGF2ZSBiZWVuIHJlc3RvcmVkLCBhbmQgdGhlIGNvbW1hbmQgYXJncyBkb24ndCBleGlzdCBhbnltb3JlXG5cdFx0cmV0dXJuIG5ldyB0eXBlcy5DaGF0UmVzcG9uc2VDb21tYW5kQnV0dG9uUGFydChjb21tYW5kc0NvbnZlcnRlci5mcm9tSW50ZXJuYWwocGFydC5jb21tYW5kKSA/PyB7IGNvbW1hbmQ6IHBhcnQuY29tbWFuZC5pZCwgdGl0bGU6IHBhcnQuY29tbWFuZC50aXRsZSB9KTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZVRleHRFZGl0UGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQpOiBEdG88SUNoYXRUZXh0RWRpdD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAndGV4dEVkaXQnLFxuXHRcdFx0dXJpOiBwYXJ0LnVyaSxcblx0XHRcdGVkaXRzOiBwYXJ0LmVkaXRzLm1hcChlID0+IFRleHRFZGl0LmZyb20oZSkpLFxuXHRcdFx0ZG9uZTogcGFydC5pc0RvbmVcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRUZXh0RWRpdD4pOiB2c2NvZGUuQ2hhdFJlc3BvbnNlVGV4dEVkaXRQYXJ0IHtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuQ2hhdFJlc3BvbnNlVGV4dEVkaXRQYXJ0KFVSSS5yZXZpdmUocGFydC51cmkpLCBwYXJ0LmVkaXRzLm1hcChlID0+IFRleHRFZGl0LnRvKGUpKSk7XG5cdFx0cmVzdWx0LmlzRG9uZSA9IHBhcnQuZG9uZTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBOb3RlYm9va0VkaXQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShlZGl0OiB2c2NvZGUuTm90ZWJvb2tFZGl0KTogZXh0SG9zdFByb3RvY29sLklDZWxsRWRpdE9wZXJhdGlvbkR0byB7XG5cdFx0aWYgKGVkaXQubmV3Q2VsbE1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLFxuXHRcdFx0XHRpbmRleDogZWRpdC5yYW5nZS5zdGFydCxcblx0XHRcdFx0bWV0YWRhdGE6IGVkaXQubmV3Q2VsbE1ldGFkYXRhXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoZWRpdC5uZXdOb3RlYm9va01ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLkRvY3VtZW50TWV0YWRhdGEsXG5cdFx0XHRcdG1ldGFkYXRhOiBlZGl0Lm5ld05vdGVib29rTWV0YWRhdGFcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSxcblx0XHRcdFx0aW5kZXg6IGVkaXQucmFuZ2Uuc3RhcnQsXG5cdFx0XHRcdGNvdW50OiBlZGl0LnJhbmdlLmVuZCAtIGVkaXQucmFuZ2Uuc3RhcnQsXG5cdFx0XHRcdGNlbGxzOiBlZGl0Lm5ld0NlbGxzLm1hcChOb3RlYm9va0NlbGxEYXRhLmZyb20pXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxufVxuXG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlTm90ZWJvb2tFZGl0UGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VOb3RlYm9va0VkaXRQYXJ0KTogZXh0SG9zdFByb3RvY29sLklDaGF0Tm90ZWJvb2tFZGl0RHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ25vdGVib29rRWRpdCcsXG5cdFx0XHR1cmk6IHBhcnQudXJpLFxuXHRcdFx0ZWRpdHM6IHBhcnQuZWRpdHMubWFwKE5vdGVib29rRWRpdC5mcm9tKSxcblx0XHRcdGRvbmU6IHBhcnQuaXNEb25lXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRSZXNwb25zZVdvcmtzcGFjZUVkaXRQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkNoYXRSZXNwb25zZVdvcmtzcGFjZUVkaXRQYXJ0KTogSUNoYXRXb3Jrc3BhY2VFZGl0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3dvcmtzcGFjZUVkaXQnLFxuXHRcdFx0ZWRpdHM6IHBhcnQuZWRpdHMubWFwKGUgPT4gKHtcblx0XHRcdFx0b2xkUmVzb3VyY2U6IGUub2xkUmVzb3VyY2UsXG5cdFx0XHRcdG5ld1Jlc291cmNlOiBlLm5ld1Jlc291cmNlLFxuXHRcdFx0fSkpLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdHlwZXMuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydCk6IER0bzxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+IHtcblx0XHRjb25zdCBpY29uUGF0aCA9IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihwYXJ0Lmljb25QYXRoKSA/IHBhcnQuaWNvblBhdGhcblx0XHRcdDogVVJJLmlzVXJpKHBhcnQuaWNvblBhdGgpID8geyBsaWdodDogVVJJLnJldml2ZShwYXJ0Lmljb25QYXRoKSB9XG5cdFx0XHRcdDogKHBhcnQuaWNvblBhdGggJiYgJ2xpZ2h0JyBpbiBwYXJ0Lmljb25QYXRoICYmICdkYXJrJyBpbiBwYXJ0Lmljb25QYXRoICYmIFVSSS5pc1VyaShwYXJ0Lmljb25QYXRoLmxpZ2h0KSAmJiBVUkkuaXNVcmkocGFydC5pY29uUGF0aC5kYXJrKSA/IHsgbGlnaHQ6IFVSSS5yZXZpdmUocGFydC5pY29uUGF0aC5saWdodCksIGRhcms6IFVSSS5yZXZpdmUocGFydC5pY29uUGF0aC5kYXJrKSB9XG5cdFx0XHRcdFx0OiB1bmRlZmluZWQpO1xuXG5cdFx0aWYgKHR5cGVvZiBwYXJ0LnZhbHVlID09PSAnb2JqZWN0JyAmJiAndmFyaWFibGVOYW1lJyBpbiBwYXJ0LnZhbHVlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAncmVmZXJlbmNlJyxcblx0XHRcdFx0cmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0dmFyaWFibGVOYW1lOiBwYXJ0LnZhbHVlLnZhcmlhYmxlTmFtZSxcblx0XHRcdFx0XHR2YWx1ZTogVVJJLmlzVXJpKHBhcnQudmFsdWUudmFsdWUpIHx8ICFwYXJ0LnZhbHVlLnZhbHVlID9cblx0XHRcdFx0XHRcdHBhcnQudmFsdWUudmFsdWUgOlxuXHRcdFx0XHRcdFx0TG9jYXRpb24uZnJvbShwYXJ0LnZhbHVlLnZhbHVlIGFzIHZzY29kZS5Mb2NhdGlvbilcblx0XHRcdFx0fSxcblx0XHRcdFx0aWNvblBhdGgsXG5cdFx0XHRcdG9wdGlvbnM6IHBhcnQub3B0aW9uc1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3JlZmVyZW5jZScsXG5cdFx0XHRyZWZlcmVuY2U6IFVSSS5pc1VyaShwYXJ0LnZhbHVlKSB8fCB0eXBlb2YgcGFydC52YWx1ZSA9PT0gJ3N0cmluZycgP1xuXHRcdFx0XHRwYXJ0LnZhbHVlIDpcblx0XHRcdFx0TG9jYXRpb24uZnJvbSg8dnNjb2RlLkxvY2F0aW9uPnBhcnQudmFsdWUpLFxuXHRcdFx0aWNvblBhdGgsXG5cdFx0XHRvcHRpb25zOiBwYXJ0Lm9wdGlvbnNcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBEdG88SUNoYXRDb250ZW50UmVmZXJlbmNlPik6IHZzY29kZS5DaGF0UmVzcG9uc2VSZWZlcmVuY2VQYXJ0IHtcblx0XHRjb25zdCB2YWx1ZSA9IHJldml2ZTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+KHBhcnQpO1xuXG5cdFx0Y29uc3QgbWFwVmFsdWUgPSAodmFsdWU6IFVSSSB8IGxhbmd1YWdlcy5Mb2NhdGlvbik6IHZzY29kZS5VcmkgfCB2c2NvZGUuTG9jYXRpb24gPT4gVVJJLmlzVXJpKHZhbHVlKSA/XG5cdFx0XHR2YWx1ZSA6XG5cdFx0XHRMb2NhdGlvbi50byh2YWx1ZSk7XG5cblx0XHRyZXR1cm4gbmV3IHR5cGVzLkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQoXG5cdFx0XHR0eXBlb2YgdmFsdWUucmVmZXJlbmNlID09PSAnc3RyaW5nJyA/IHZhbHVlLnJlZmVyZW5jZSA6ICd2YXJpYWJsZU5hbWUnIGluIHZhbHVlLnJlZmVyZW5jZSA/IHtcblx0XHRcdFx0dmFyaWFibGVOYW1lOiB2YWx1ZS5yZWZlcmVuY2UudmFyaWFibGVOYW1lLFxuXHRcdFx0XHR2YWx1ZTogdmFsdWUucmVmZXJlbmNlLnZhbHVlICYmIG1hcFZhbHVlKHZhbHVlLnJlZmVyZW5jZS52YWx1ZSlcblx0XHRcdH0gOlxuXHRcdFx0XHRtYXBWYWx1ZSh2YWx1ZS5yZWZlcmVuY2UpXG5cdFx0KSBhcyB2c2NvZGUuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydDsgLy8gJ3ZhbHVlJyBpcyBleHRlbmRlZCB3aXRoIHZhcmlhYmxlTmFtZVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlQ29kZUNpdGF0aW9uUGFydCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHBhcnQ6IHZzY29kZS5DaGF0UmVzcG9uc2VDb2RlQ2l0YXRpb25QYXJ0KTogRHRvPElDaGF0Q29kZUNpdGF0aW9uPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICdjb2RlQ2l0YXRpb24nLFxuXHRcdFx0dmFsdWU6IHBhcnQudmFsdWUsXG5cdFx0XHRsaWNlbnNlOiBwYXJ0LmxpY2Vuc2UsXG5cdFx0XHRzbmlwcGV0OiBwYXJ0LnNuaXBwZXRcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlc3BvbnNlUGFydCB7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocGFydDogdnNjb2RlLkV4dGVuZGVkQ2hhdFJlc3BvbnNlUGFydCwgY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyLCBjb21tYW5kRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IGV4dEhvc3RQcm90b2NvbC5JQ2hhdFByb2dyZXNzRHRvIHtcblx0XHRpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZU1hcmtkb3duUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZU1hcmtkb3duUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZUFuY2hvclBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VBbmNob3JQYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VQcm9ncmVzc1BhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VUaGlua2luZ1Byb2dyZXNzUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlSG9va1BhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VIb29rUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlVm9pY2VQcm9ncmVzc1BhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VGaWxlVHJlZVBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VGaWxlc1BhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VNdWx0aURpZmZQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlTXVsdGlEaWZmUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZUNvbW1hbmRCdXR0b25QYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQuZnJvbShwYXJ0LCBjb21tYW5kc0NvbnZlcnRlciwgY29tbWFuZERpc3Bvc2FibGVzKTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VUZXh0RWRpdFBhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VOb3RlYm9va0VkaXRQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlTm90ZWJvb2tFZGl0UGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZU1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllc1BhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VNYXJrZG93bldpdGhWdWxuZXJhYmlsaXRpZXNQYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlQ29kZWJsb2NrVXJpUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZUNvZGVibG9ja1VyaVBhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VXYXJuaW5nUGFydCkge1xuXHRcdFx0cmV0dXJuIENoYXRSZXNwb25zZVdhcm5pbmdQYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlSW5mb1BhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VJbmZvUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZUNvbmZpcm1hdGlvblBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VDb25maXJtYXRpb25QYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlUXVlc3Rpb25DYXJvdXNlbFBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZUNvZGVDaXRhdGlvblBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VDb2RlQ2l0YXRpb25QYXJ0LmZyb20ocGFydCk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0IGluc3RhbmNlb2YgdHlwZXMuQ2hhdFJlc3BvbnNlTW92ZVBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VNb3ZlUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZUV4dGVuc2lvbnNQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlRXh0ZW5zaW9uc1BhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQpIHtcblx0XHRcdHJldHVybiBDaGF0UmVzcG9uc2VQdWxsUmVxdWVzdFBhcnQuZnJvbShwYXJ0LCBjb21tYW5kc0NvbnZlcnRlciwgY29tbWFuZERpc3Bvc2FibGVzKTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0VG9vbEludm9jYXRpb25QYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFRvb2xJbnZvY2F0aW9uUGFydC5mcm9tKHBhcnQpO1xuXHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIHR5cGVzLkNoYXRSZXNwb25zZVdvcmtzcGFjZUVkaXRQYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlV29ya3NwYWNlRWRpdFBhcnQuZnJvbShwYXJ0KTtcblx0XHR9IGVsc2UgaWYgKHBhcnQgaW5zdGFuY2VvZiB0eXBlcy5DaGF0UmVzcG9uc2VBdXRvTW9kZVJlc29sdXRpb25QYXJ0KSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFJlc3BvbnNlQXV0b01vZGVSZXNvbHV0aW9uUGFydC5mcm9tKHBhcnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdGNvbnRlbnQ6IE1hcmtkb3duU3RyaW5nLmZyb20oJycpXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byhwYXJ0OiBleHRIb3N0UHJvdG9jb2wuSUNoYXRQcm9ncmVzc0R0bywgY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyKTogdnNjb2RlLkNoYXRSZXNwb25zZVBhcnQgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAocGFydC5raW5kKSB7XG5cdFx0XHRjYXNlICdyZWZlcmVuY2UnOiByZXR1cm4gQ2hhdFJlc3BvbnNlUmVmZXJlbmNlUGFydC50byhwYXJ0KTtcblx0XHRcdGNhc2UgJ21hcmtkb3duQ29udGVudCc6XG5cdFx0XHRjYXNlICdpbmxpbmVSZWZlcmVuY2UnOlxuXHRcdFx0Y2FzZSAncHJvZ3Jlc3NNZXNzYWdlJzpcblx0XHRcdGNhc2UgJ3RyZWVEYXRhJzpcblx0XHRcdGNhc2UgJ2NvbW1hbmQnOlxuXHRcdFx0XHRyZXR1cm4gdG9Db250ZW50KHBhcnQsIGNvbW1hbmRzQ29udmVydGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0b0NvbnRlbnQocGFydDogZXh0SG9zdFByb3RvY29sLklDaGF0Q29udGVudFByb2dyZXNzRHRvLCBjb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIpOiB2c2NvZGUuQ2hhdFJlc3BvbnNlTWFya2Rvd25QYXJ0IHwgdnNjb2RlLkNoYXRSZXNwb25zZUZpbGVUcmVlUGFydCB8IHZzY29kZS5DaGF0UmVzcG9uc2VBbmNob3JQYXJ0IHwgdnNjb2RlLkNoYXRSZXNwb25zZUNvbW1hbmRCdXR0b25QYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHBhcnQua2luZCkge1xuXHRcdFx0Y2FzZSAnbWFya2Rvd25Db250ZW50JzogcmV0dXJuIENoYXRSZXNwb25zZU1hcmtkb3duUGFydC50byhwYXJ0KTtcblx0XHRcdGNhc2UgJ2lubGluZVJlZmVyZW5jZSc6IHJldHVybiBDaGF0UmVzcG9uc2VBbmNob3JQYXJ0LnRvKHBhcnQpO1xuXHRcdFx0Y2FzZSAncHJvZ3Jlc3NNZXNzYWdlJzogcmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdGNhc2UgJ3RyZWVEYXRhJzogcmV0dXJuIENoYXRSZXNwb25zZUZpbGVzUGFydC50byhwYXJ0KTtcblx0XHRcdGNhc2UgJ2NvbW1hbmQnOiByZXR1cm4gQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQudG8ocGFydCwgY29tbWFuZHNDb252ZXJ0ZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0QWdlbnRSZXF1ZXN0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBsb2NhdGlvbjI6IHZzY29kZS5DaGF0UmVxdWVzdEVkaXRvckRhdGEgfCB2c2NvZGUuQ2hhdFJlcXVlc3ROb3RlYm9va0RhdGEgfCB1bmRlZmluZWQsIG1vZGVsOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQsIG1vZGVsQ29uZmlndXJhdGlvbjogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQsIGRpYWdub3N0aWNzOiByZWFkb25seSBbdnNjb2RlLlVyaSwgcmVhZG9ubHkgdnNjb2RlLkRpYWdub3N0aWNbXV1bXSwgdG9vbHM6IE1hcDx2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xJbmZvcm1hdGlvbiwgYm9vbGVhbj4sIGV4dGVuc2lvbjogSVJlbGF4ZWRFeHRlbnNpb25EZXNjcmlwdGlvbiwgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiB2c2NvZGUuQ2hhdFJlcXVlc3Qge1xuXG5cdFx0Y29uc3QgdG9vbFJlZmVyZW5jZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdGNvbnN0IHZhcmlhYmxlUmVmZXJlbmNlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCB2IG9mIHJlcXVlc3QudmFyaWFibGVzLnZhcmlhYmxlcykge1xuXHRcdFx0aWYgKHYua2luZCA9PT0gJ3Rvb2wnKSB7XG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzLnB1c2godik7XG5cdFx0XHR9IGVsc2UgaWYgKHYua2luZCA9PT0gJ3Rvb2xzZXQnKSB7XG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzLnB1c2goLi4udi52YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXJpYWJsZVJlZmVyZW5jZXMucHVzaCh2KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpID8/IHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcmVxdWVzdFdpdGhBbGxQcm9wczogdnNjb2RlLkNoYXRSZXF1ZXN0ID0ge1xuXHRcdFx0aWQ6IHJlcXVlc3QucmVxdWVzdElkLFxuXHRcdFx0cHJvbXB0OiByZXF1ZXN0Lm1lc3NhZ2UsXG5cdFx0XHRjb21tYW5kOiByZXF1ZXN0LmNvbW1hbmQsXG5cdFx0XHRhdHRlbXB0OiByZXF1ZXN0LmF0dGVtcHQgPz8gMCxcblx0XHRcdGVuYWJsZUNvbW1hbmREZXRlY3Rpb246IHJlcXVlc3QuZW5hYmxlQ29tbWFuZERldGVjdGlvbiA/PyB0cnVlLFxuXHRcdFx0aXNQYXJ0aWNpcGFudERldGVjdGVkOiByZXF1ZXN0LmlzUGFydGljaXBhbnREZXRlY3RlZCA/PyBmYWxzZSxcblx0XHRcdGlzVm9pY2VNb2RlSW5wdXQ6IHJlcXVlc3QuaXNWb2ljZU1vZGVJbnB1dCxcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRyZWZlcmVuY2VzOiB2YXJpYWJsZVJlZmVyZW5jZXNcblx0XHRcdFx0LmZsYXRNYXAodiA9PiBDaGF0UHJvbXB0UmVmZXJlbmNlLnRvUmVmZXJlbmNlcyh2LCBkaWFnbm9zdGljcywgbG9nU2VydmljZSkpLFxuXHRcdFx0dG9vbFJlZmVyZW5jZXM6IHRvb2xSZWZlcmVuY2VzLm1hcChDaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2UudG8pLFxuXHRcdFx0bG9jYXRpb246IENoYXRMb2NhdGlvbi50byhyZXF1ZXN0LmxvY2F0aW9uKSxcblx0XHRcdGFjY2VwdGVkQ29uZmlybWF0aW9uRGF0YTogcmVxdWVzdC5hY2NlcHRlZENvbmZpcm1hdGlvbkRhdGEsXG5cdFx0XHRyZWplY3RlZENvbmZpcm1hdGlvbkRhdGE6IHJlcXVlc3QucmVqZWN0ZWRDb25maXJtYXRpb25EYXRhLFxuXHRcdFx0bG9jYXRpb24yLFxuXHRcdFx0dG9vbEludm9jYXRpb25Ub2tlbjogT2JqZWN0LmZyZWV6ZTxJVG9vbEludm9jYXRpb25Db250ZXh0Pih7IHNlc3Npb25SZXNvdXJjZTogcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5yZXZpdmUocmVxdWVzdC53b3JraW5nRGlyZWN0b3J5KSB9KSBhcyBuZXZlcixcblx0XHRcdHRvb2xzLFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRtb2RlbENvbmZpZ3VyYXRpb24sXG5cdFx0XHRlZGl0ZWRGaWxlRXZlbnRzOiByZXF1ZXN0LmVkaXRlZEZpbGVFdmVudHMsXG5cdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiByZXF1ZXN0Lm1vZGVJbnN0cnVjdGlvbnM/LmNvbnRlbnQsXG5cdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zMjogQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zLnRvKHJlcXVlc3QubW9kZUluc3RydWN0aW9ucyksXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHJlcXVlc3QucGVybWlzc2lvbkxldmVsLFxuXHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHJlcXVlc3Quc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRzdWJBZ2VudE5hbWU6IHJlcXVlc3Quc3ViQWdlbnROYW1lLFxuXHRcdFx0cGFyZW50UmVxdWVzdElkOiByZXF1ZXN0LnBhcmVudFJlcXVlc3RJZCxcblx0XHRcdGhhc0hvb2tzRW5hYmxlZDogcmVxdWVzdC5oYXNIb29rc0VuYWJsZWQgPz8gZmFsc2UsXG5cdFx0XHRob29rczogcmVxdWVzdC5ob29rcyA/IENoYXRSZXF1ZXN0SG9va3NDb252ZXJ0ZXIudG8ocmVxdWVzdC5ob29rcykgOiB1bmRlZmluZWQsXG5cdFx0XHRpc1N5c3RlbUluaXRpYXRlZDogcmVxdWVzdC5pc1N5c3RlbUluaXRpYXRlZCxcblx0XHR9O1xuXG5cdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJykpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuaWQ7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGRlbGV0ZSAocmVxdWVzdFdpdGhBbGxQcm9wcyBhcyBhbnkpLmF0dGVtcHQ7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGRlbGV0ZSAocmVxdWVzdFdpdGhBbGxQcm9wcyBhcyBhbnkpLmVuYWJsZUNvbW1hbmREZXRlY3Rpb247XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGRlbGV0ZSAocmVxdWVzdFdpdGhBbGxQcm9wcyBhcyBhbnkpLmlzUGFydGljaXBhbnREZXRlY3RlZDtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuaXNWb2ljZU1vZGVJbnB1dDtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkubG9jYXRpb247XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGRlbGV0ZSAocmVxdWVzdFdpdGhBbGxQcm9wcyBhcyBhbnkpLmxvY2F0aW9uMjtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuZWRpdGVkRmlsZUV2ZW50cztcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuc2Vzc2lvbklkO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS5zdWJBZ2VudEludm9jYXRpb25JZDtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuc3ViQWdlbnROYW1lO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS5wYXJlbnRSZXF1ZXN0SWQ7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGRlbGV0ZSAocmVxdWVzdFdpdGhBbGxQcm9wcyBhcyBhbnkpLmhhc0hvb2tzRW5hYmxlZDtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0ZGVsZXRlIChyZXF1ZXN0V2l0aEFsbFByb3BzIGFzIGFueSkuaG9va3M7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKSkge1xuXHRcdFx0ZGVsZXRlIHJlcXVlc3RXaXRoQWxsUHJvcHMuYWNjZXB0ZWRDb25maXJtYXRpb25EYXRhO1xuXHRcdFx0ZGVsZXRlIHJlcXVlc3RXaXRoQWxsUHJvcHMucmVqZWN0ZWRDb25maXJtYXRpb25EYXRhO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRkZWxldGUgKHJlcXVlc3RXaXRoQWxsUHJvcHMgYXMgYW55KS50b29scztcblx0XHR9XG5cblxuXHRcdHJldHVybiByZXF1ZXN0V2l0aEFsbFByb3BzO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdExvY2F0aW9uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGxvYzogQ2hhdEFnZW50TG9jYXRpb24pOiB0eXBlcy5DaGF0TG9jYXRpb24ge1xuXHRcdHN3aXRjaCAobG9jKSB7XG5cdFx0XHRjYXNlIENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rOiByZXR1cm4gdHlwZXMuQ2hhdExvY2F0aW9uLk5vdGVib29rO1xuXHRcdFx0Y2FzZSBDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbDogcmV0dXJuIHR5cGVzLkNoYXRMb2NhdGlvbi5UZXJtaW5hbDtcblx0XHRcdGNhc2UgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdDogcmV0dXJuIHR5cGVzLkNoYXRMb2NhdGlvbi5QYW5lbDtcblx0XHRcdGNhc2UgQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lOiByZXR1cm4gdHlwZXMuQ2hhdExvY2F0aW9uLkVkaXRvcjtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShsb2M6IHR5cGVzLkNoYXRMb2NhdGlvbik6IENoYXRBZ2VudExvY2F0aW9uIHtcblx0XHRzd2l0Y2ggKGxvYykge1xuXHRcdFx0Y2FzZSB0eXBlcy5DaGF0TG9jYXRpb24uTm90ZWJvb2s6IHJldHVybiBDaGF0QWdlbnRMb2NhdGlvbi5Ob3RlYm9vaztcblx0XHRcdGNhc2UgdHlwZXMuQ2hhdExvY2F0aW9uLlRlcm1pbmFsOiByZXR1cm4gQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWw7XG5cdFx0XHRjYXNlIHR5cGVzLkNoYXRMb2NhdGlvbi5QYW5lbDogcmV0dXJuIENoYXRBZ2VudExvY2F0aW9uLkNoYXQ7XG5cdFx0XHRjYXNlIHR5cGVzLkNoYXRMb2NhdGlvbi5FZGl0b3I6IHJldHVybiBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHR5cGU6IHR5cGVzLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0eXBlLmlkO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGlkOiBzdHJpbmcpOiB0eXBlcy5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlIHtcblx0XHRzd2l0Y2ggKGlkKSB7XG5cdFx0XHRjYXNlICdhZ2VudCc6IHJldHVybiB0eXBlcy5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlLkFnZW50O1xuXHRcdFx0Y2FzZSAnc2tpbGwnOiByZXR1cm4gdHlwZXMuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZS5Ta2lsbDtcblx0XHRcdGNhc2UgJ2luc3RydWN0aW9ucyc6IHJldHVybiB0eXBlcy5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlLkluc3RydWN0aW9ucztcblx0XHRcdGNhc2UgJ3Byb21wdCc6IHJldHVybiB0eXBlcy5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlLlByb21wdDtcblx0XHRcdGNhc2UgJ2hvb2snOiByZXR1cm4gdHlwZXMuQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uVHlwZS5Ib29rO1xuXHRcdFx0Y2FzZSAncGx1Z2lucyc6IHJldHVybiB0eXBlcy5DaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbnM7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gbmV3IHR5cGVzLkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUoaWQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRQcm9tcHRSZWZlcmVuY2Uge1xuXHRleHBvcnQgZnVuY3Rpb24gdG9SZWZlcmVuY2VzKHZhcmlhYmxlOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBkaWFnbm9zdGljczogcmVhZG9ubHkgW3ZzY29kZS5VcmksIHJlYWRvbmx5IHZzY29kZS5EaWFnbm9zdGljW11dW10sIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogdnNjb2RlLkNoYXRQcm9tcHRSZWZlcmVuY2VbXSB7XG5cdFx0Y29uc3QgcmVmZXJlbmNlID0gdG8odmFyaWFibGUsIGRpYWdub3N0aWNzLCBsb2dTZXJ2aWNlKTtcblx0XHRpZiAoIXJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnQgPSBpc0VsZW1lbnRWYXJpYWJsZUVudHJ5KHZhcmlhYmxlKSA/IHZhcmlhYmxlIDogdW5kZWZpbmVkO1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIFtyZWZlcmVuY2VdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGltYWdlRGF0YSA9IGNvZXJjZUltYWdlQnVmZmVyKGVsZW1lbnQuaW1hZ2VEYXRhKTtcblx0XHRpZiAoIWltYWdlRGF0YSkge1xuXHRcdFx0cmV0dXJuIFtyZWZlcmVuY2VdO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXG5cdFx0XHRyZWZlcmVuY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBgJHt2YXJpYWJsZS5pZH0tc2NyZWVuc2hvdGAsXG5cdFx0XHRcdG5hbWU6IGAke3ZhcmlhYmxlLm5hbWV9IHNjcmVlbnNob3RgLFxuXHRcdFx0XHR2YWx1ZTogbmV3IHR5cGVzLkNoYXRSZWZlcmVuY2VCaW5hcnlEYXRhKFxuXHRcdFx0XHRcdGVsZW1lbnQuaW1hZ2VNaW1lVHlwZSA/PyAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0XHQoKSA9PiBQcm9taXNlLnJlc29sdmUoaW1hZ2VEYXRhKSxcblx0XHRcdFx0KSxcblx0XHRcdH1cblx0XHRdO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhcmlhYmxlOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBkaWFnbm9zdGljczogcmVhZG9ubHkgW3ZzY29kZS5VcmksIHJlYWRvbmx5IHZzY29kZS5EaWFnbm9zdGljW11dW10sIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogdnNjb2RlLkNoYXRQcm9tcHRSZWZlcmVuY2UgfCB1bmRlZmluZWQge1xuXHRcdGxldCB2YWx1ZTogdnNjb2RlLkNoYXRQcm9tcHRSZWZlcmVuY2VbJ3ZhbHVlJ10gPSB2YXJpYWJsZS52YWx1ZTtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRsZXQgdmFyU3RyOiBzdHJpbmc7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR2YXJTdHIgPSBKU09OLnN0cmluZ2lmeSh2YXJpYWJsZSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dmFyU3RyID0gYGtpbmQ9JHt2YXJpYWJsZS5raW5kfSwgaWQ9JHt2YXJpYWJsZS5pZH0sIG5hbWU9JHt2YXJpYWJsZS5uYW1lfWA7XG5cdFx0XHR9XG5cblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYFtDaGF0UHJvbXB0UmVmZXJlbmNlXSBJZ25vcmluZyBpbnZhbGlkIHJlZmVyZW5jZSBpbiB2YXJpYWJsZTogJHt2YXJTdHJ9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChpc1VyaUNvbXBvbmVudHModmFsdWUpKSB7XG5cdFx0XHR2YWx1ZSA9IFVSSS5yZXZpdmUodmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiAndXJpJyBpbiB2YWx1ZSAmJiAncmFuZ2UnIGluIHZhbHVlICYmIGlzVXJpQ29tcG9uZW50cyh2YWx1ZS51cmkpKSB7XG5cdFx0XHR2YWx1ZSA9IExvY2F0aW9uLnRvKHJldml2ZSh2YWx1ZSkpO1xuXHRcdH0gZWxzZSBpZiAoaXNJbWFnZVZhcmlhYmxlRW50cnkodmFyaWFibGUpKSB7XG5cdFx0XHRjb25zdCByZWYgPSB2YXJpYWJsZS5yZWZlcmVuY2VzPy5bMF0/LnJlZmVyZW5jZTtcblx0XHRcdHZhbHVlID0gbmV3IHR5cGVzLkNoYXRSZWZlcmVuY2VCaW5hcnlEYXRhKFxuXHRcdFx0XHR2YXJpYWJsZS5taW1lVHlwZSA/PyAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0KCkgPT4gUHJvbWlzZS5yZXNvbHZlKG5ldyBVaW50OEFycmF5KE9iamVjdC52YWx1ZXModmFyaWFibGUudmFsdWUgYXMgbnVtYmVyW10pKSksXG5cdFx0XHRcdHJlZiAmJiBVUkkuaXNVcmkocmVmKSA/IHJlZiA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dmFyaWFibGUuaXNQYXN0ZWQsXG5cdFx0XHRcdHZhcmlhYmxlLmlzVVJMXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSBpZiAodmFyaWFibGUua2luZCA9PT0gJ2RpYWdub3N0aWMnKSB7XG5cdFx0XHRjb25zdCBmaWx0ZXJTZXZlcml0eSA9IHZhcmlhYmxlLmZpbHRlclNldmVyaXR5ICYmIERpYWdub3N0aWNTZXZlcml0eS50byh2YXJpYWJsZS5maWx0ZXJTZXZlcml0eSk7XG5cdFx0XHRjb25zdCBmaWx0ZXJVcmkgPSB2YXJpYWJsZS5maWx0ZXJVcmkgJiYgVVJJLnJldml2ZSh2YXJpYWJsZS5maWx0ZXJVcmkpLnRvU3RyaW5nKCk7XG5cdFx0XHR2YWx1ZSA9IG5ldyB0eXBlcy5DaGF0UmVmZXJlbmNlRGlhZ25vc3RpYyhkaWFnbm9zdGljcy5tYXAoKFt1cmksIGRdKTogW3ZzY29kZS5VcmksIHZzY29kZS5EaWFnbm9zdGljW11dID0+IHtcblx0XHRcdFx0aWYgKHZhcmlhYmxlLmZpbHRlclVyaSAmJiB1cmkudG9TdHJpbmcoKSAhPT0gZmlsdGVyVXJpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFt1cmksIFtdXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBbdXJpLCBkLmZpbHRlcihkID0+IHtcblx0XHRcdFx0XHRpZiAoZmlsdGVyU2V2ZXJpdHkgJiYgZC5zZXZlcml0eSA+IGZpbHRlclNldmVyaXR5KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh2YXJpYWJsZS5maWx0ZXJSYW5nZSAmJiAhZWRpdG9yUmFuZ2UuUmFuZ2UuYXJlSW50ZXJzZWN0aW5nT3JUb3VjaGluZyh2YXJpYWJsZS5maWx0ZXJSYW5nZSwgUmFuZ2UuZnJvbShkLnJhbmdlKSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSldO1xuXHRcdFx0fSkuZmlsdGVyKChbLCBkXSkgPT4gZC5sZW5ndGggPiAwKSk7XG5cdFx0fVxuXHRcdGxldCB0b29sUmVmZXJlbmNlcztcblx0XHRpZiAoaXNQcm9tcHRGaWxlVmFyaWFibGVFbnRyeSh2YXJpYWJsZSkgfHwgaXNQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSh2YXJpYWJsZSkpIHtcblx0XHRcdGlmICh2YXJpYWJsZS50b29sUmVmZXJlbmNlcykge1xuXHRcdFx0XHR0b29sUmVmZXJlbmNlcyA9IENoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZXMudG8odmFyaWFibGUudG9vbFJlZmVyZW5jZXMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdmFyaWFibGUuaWQsXG5cdFx0XHRuYW1lOiB2YXJpYWJsZS5uYW1lLFxuXHRcdFx0cmFuZ2U6IHZhcmlhYmxlLnJhbmdlICYmIFt2YXJpYWJsZS5yYW5nZS5zdGFydCwgdmFyaWFibGUucmFuZ2UuZW5kRXhjbHVzaXZlXSxcblx0XHRcdHRvb2xSZWZlcmVuY2VzLFxuXHRcdFx0dmFsdWUsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiB2YXJpYWJsZS5tb2RlbERlc2NyaXB0aW9uLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2Uge1xuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFyaWFibGU6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiB2c2NvZGUuQ2hhdExhbmd1YWdlTW9kZWxUb29sUmVmZXJlbmNlIHtcblx0XHRjb25zdCB2YWx1ZSA9IHZhcmlhYmxlLnZhbHVlO1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRvb2wgcmVmZXJlbmNlJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IHZhcmlhYmxlLmlkLFxuXHRcdFx0cmFuZ2U6IHZhcmlhYmxlLnJhbmdlICYmIFt2YXJpYWJsZS5yYW5nZS5zdGFydCwgdmFyaWFibGUucmFuZ2UuZW5kRXhjbHVzaXZlXSxcblx0XHR9O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBDaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2VzIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhcmlhYmxlczogcmVhZG9ubHkgQ2hhdFJlcXVlc3RUb29sUmVmZXJlbmNlRW50cnlbXSk6IHZzY29kZS5DaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2VbXSB7XG5cdFx0Y29uc3QgdG9vbFJlZmVyZW5jZXMgPSBbXTtcblx0XHRmb3IgKGNvbnN0IHYgb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRpZiAodi5raW5kID09PSAndG9vbCcpIHtcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXMucHVzaChDaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2UudG8odikpO1xuXHRcdFx0fSBlbHNlIGlmICh2LmtpbmQgPT09ICd0b29sc2V0Jykge1xuXHRcdFx0XHR0b29sUmVmZXJlbmNlcy5wdXNoKC4uLnYudmFsdWUubWFwKENoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZS50bykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRvb2wgcmVmZXJlbmNlIGluIHByb21wdCB2YXJpYWJsZXMnKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRvb2xSZWZlcmVuY2VzO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKG1vZGU6IElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMgfCBEdG88SUNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucz4gfCB1bmRlZmluZWQpOiB2c2NvZGUuQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAobW9kZSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiBVUkkucmV2aXZlKG1vZGUudXJpKSxcblx0XHRcdFx0bmFtZTogbW9kZS5uYW1lLFxuXHRcdFx0XHRjb250ZW50OiBtb2RlLmNvbnRlbnQsXG5cdFx0XHRcdHRvb2xSZWZlcmVuY2VzOiBDaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2VzLnRvKHJldml2ZShtb2RlLnRvb2xSZWZlcmVuY2VzKSksXG5cdFx0XHRcdGFsbG93ZWRTdWJhZ2VudHM6IG1vZGUuYWxsb3dlZFN1YmFnZW50cyxcblx0XHRcdFx0bWV0YWRhdGE6IG1vZGUubWV0YWRhdGEsXG5cdFx0XHRcdGlzQnVpbHRpbjogbW9kZS5pc0J1aWx0aW4sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20obW9kZTogdnNjb2RlLkNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyB8IHVuZGVmaW5lZCk6IElDaGF0UmVxdWVzdE1vZGVJbnN0cnVjdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGlmIChtb2RlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IG1vZGUudXJpLFxuXHRcdFx0XHRuYW1lOiBtb2RlLm5hbWUsXG5cdFx0XHRcdGNvbnRlbnQ6IG1vZGUuY29udGVudCxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IG1vZGUudG9vbFJlZmVyZW5jZXM/Lm1hcChyZWYgPT4gKHtcblx0XHRcdFx0XHRraW5kOiAndG9vbCcgYXMgY29uc3QsXG5cdFx0XHRcdFx0aWQ6IHJlZi5uYW1lLFxuXHRcdFx0XHRcdG5hbWU6IHJlZi5uYW1lLFxuXHRcdFx0XHRcdHZhbHVlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cmFuZ2U6IHJlZi5yYW5nZSA/IHsgc3RhcnQ6IHJlZi5yYW5nZVswXSwgZW5kRXhjbHVzaXZlOiByZWYucmFuZ2VbMV0gfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSkpID8/IFtdLFxuXHRcdFx0XHRhbGxvd2VkU3ViYWdlbnRzOiBtb2RlLmFsbG93ZWRTdWJhZ2VudHMsXG5cdFx0XHRcdG1ldGFkYXRhOiBtb2RlLm1ldGFkYXRhLFxuXHRcdFx0XHRpc0J1aWx0aW46IG1vZGUuaXNCdWlsdGluLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENoYXRBZ2VudENvbXBsZXRpb25JdGVtIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20oaXRlbTogdnNjb2RlLkNoYXRDb21wbGV0aW9uSXRlbSwgY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogZXh0SG9zdFByb3RvY29sLklDaGF0QWdlbnRDb21wbGV0aW9uSXRlbSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBpdGVtLmlkLFxuXHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRmdWxsTmFtZTogaXRlbS5mdWxsTmFtZSxcblx0XHRcdGljb246IGl0ZW0uaWNvbj8uaWQsXG5cdFx0XHR2YWx1ZTogaXRlbS52YWx1ZXNbMF0udmFsdWUsXG5cdFx0XHRpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsXG5cdFx0XHRkZXRhaWw6IGl0ZW0uZGV0YWlsLFxuXHRcdFx0ZG9jdW1lbnRhdGlvbjogaXRlbS5kb2N1bWVudGF0aW9uLFxuXHRcdFx0Y29tbWFuZDogY29tbWFuZHNDb252ZXJ0ZXIudG9JbnRlcm5hbChpdGVtLmNvbW1hbmQsIGRpc3Bvc2FibGVzKSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdEFnZW50UmVzdWx0IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCk6IHZzY29kZS5DaGF0UmVzdWx0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXJyb3JEZXRhaWxzOiByZXN1bHQuZXJyb3JEZXRhaWxzLFxuXHRcdFx0bWV0YWRhdGE6IHJldml2ZU1ldGFkYXRhKHJlc3VsdC5tZXRhZGF0YSksXG5cdFx0XHRuZXh0UXVlc3Rpb246IHJlc3VsdC5uZXh0UXVlc3Rpb24sXG5cdFx0XHRkZXRhaWxzOiByZXN1bHQuZGV0YWlscyxcblx0XHR9O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHJlc3VsdDogdnNjb2RlLkNoYXRSZXN1bHQpOiBEdG88SUNoYXRBZ2VudFJlc3VsdD4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRlcnJvckRldGFpbHM6IHJlc3VsdC5lcnJvckRldGFpbHMsXG5cdFx0XHRtZXRhZGF0YTogcmVzdWx0Lm1ldGFkYXRhLFxuXHRcdFx0bmV4dFF1ZXN0aW9uOiByZXN1bHQubmV4dFF1ZXN0aW9uLFxuXHRcdFx0ZGV0YWlsczogcmVzdWx0LmRldGFpbHMsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJldml2ZU1ldGFkYXRhKG1ldGFkYXRhOiBJQ2hhdEFnZW50UmVzdWx0WydtZXRhZGF0YSddKSB7XG5cdFx0cmV0dXJuIGNsb25lQW5kQ2hhbmdlKG1ldGFkYXRhLCB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAodmFsdWUuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxUb29sUmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQoY2xvbmVBbmRDaGFuZ2UodmFsdWUuY29udGVudCwgcmV2aXZlTWV0YWRhdGEpKTtcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxUZXh0UGFydCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydCh2YWx1ZS52YWx1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5MYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydCh2YWx1ZS52YWx1ZSwgdmFsdWUuaWQsIHZhbHVlLm1ldGFkYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUuJG1pZCA9PT0gTWFyc2hhbGxlZElkLkxhbmd1YWdlTW9kZWxQcm9tcHRUc3hQYXJ0KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQodmFsdWUudmFsdWUpO1xuXHRcdFx0fSBlbHNlIGlmICh2YWx1ZS4kbWlkID09PSBNYXJzaGFsbGVkSWQuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KSB7XG5cdFx0XHRcdGxldCBidWZmZXI6IFVpbnQ4QXJyYXk7XG5cdFx0XHRcdC8vIGNvcnJlY3Rpb24gZm9yIG9sZCBkYXRhIHNlcmlhbGl6ZWQgcHJlLTMwMzE1MVxuXHRcdFx0XHRpZiAodmFsdWUuZGF0YSAmJiB0eXBlb2YgdmFsdWUuZGF0YSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuZGF0YS50eXBlID09PSAnQnVmZmVyJyAmJiBBcnJheS5pc0FycmF5KHZhbHVlLmRhdGEuZGF0YSkpIHtcblx0XHRcdFx0XHRidWZmZXIgPSBuZXcgVWludDhBcnJheSh2YWx1ZS5kYXRhLmRhdGEpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZS5kYXRhID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRidWZmZXIgPSBkZWNvZGVCYXNlNjQodmFsdWUuZGF0YSkuYnVmZmVyO1xuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0YnVmZmVyID0gbmV3IFVpbnQ4QXJyYXkoMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJ1ZmZlciA9IG5ldyBVaW50OEFycmF5KDApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQoYnVmZmVyLCB2YWx1ZS5taW1lVHlwZSwgdmFsdWUuYXVkaWVuY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdEFnZW50VXNlckFjdGlvbkV2ZW50IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCwgZXZlbnQ6IElDaGF0VXNlckFjdGlvbkV2ZW50LCBjb21tYW5kc0NvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIpOiB2c2NvZGUuQ2hhdFVzZXJBY3Rpb25FdmVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGV2ZW50LmFjdGlvbi5raW5kID09PSAndm90ZScpIHtcblx0XHRcdC8vIElzIHRoZSBcImZlZWRiYWNrXCIgdHlwZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVoUmVzdWx0ID0gQ2hhdEFnZW50UmVzdWx0LnRvKHJlc3VsdCk7XG5cdFx0aWYgKGV2ZW50LmFjdGlvbi5raW5kID09PSAnY29tbWFuZCcpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBldmVudC5hY3Rpb24uY29tbWFuZEJ1dHRvbi5jb21tYW5kO1xuXHRcdFx0Y29uc3QgY29tbWFuZEJ1dHRvbiA9IHtcblx0XHRcdFx0Y29tbWFuZDogY29tbWFuZHNDb252ZXJ0ZXIuZnJvbUludGVybmFsKGNvbW1hbmQpID8/IHsgY29tbWFuZDogY29tbWFuZC5pZCwgdGl0bGU6IGNvbW1hbmQudGl0bGUgfSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBjb21tYW5kQWN0aW9uOiB2c2NvZGUuQ2hhdENvbW1hbmRBY3Rpb24gPSB7IGtpbmQ6ICdjb21tYW5kJywgY29tbWFuZEJ1dHRvbiB9O1xuXHRcdFx0cmV0dXJuIHsgYWN0aW9uOiBjb21tYW5kQWN0aW9uLCByZXN1bHQ6IGVoUmVzdWx0IH07XG5cdFx0fSBlbHNlIGlmIChldmVudC5hY3Rpb24ua2luZCA9PT0gJ2ZvbGxvd1VwJykge1xuXHRcdFx0Y29uc3QgZm9sbG93dXBBY3Rpb246IHZzY29kZS5DaGF0Rm9sbG93dXBBY3Rpb24gPSB7IGtpbmQ6ICdmb2xsb3dVcCcsIGZvbGxvd3VwOiBDaGF0Rm9sbG93dXAudG8oZXZlbnQuYWN0aW9uLmZvbGxvd3VwKSB9O1xuXHRcdFx0cmV0dXJuIHsgYWN0aW9uOiBmb2xsb3d1cEFjdGlvbiwgcmVzdWx0OiBlaFJlc3VsdCB9O1xuXHRcdH0gZWxzZSBpZiAoZXZlbnQuYWN0aW9uLmtpbmQgPT09ICdpbmxpbmVDaGF0Jykge1xuXHRcdFx0cmV0dXJuIHsgYWN0aW9uOiB7IGtpbmQ6ICdlZGl0b3InLCBhY2NlcHRlZDogZXZlbnQuYWN0aW9uLmFjdGlvbiA9PT0gJ2FjY2VwdGVkJyB9LCByZXN1bHQ6IGVoUmVzdWx0IH07XG5cdFx0fSBlbHNlIGlmIChldmVudC5hY3Rpb24ua2luZCA9PT0gJ2NoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbicpIHtcblxuXHRcdFx0Y29uc3Qgb3V0Y29tZXMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydhY2NlcHRlZCcsIHR5cGVzLkNoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbk91dGNvbWUuQWNjZXB0ZWRdLFxuXHRcdFx0XHRbJ3JlamVjdGVkJywgdHlwZXMuQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uT3V0Y29tZS5SZWplY3RlZF0sXG5cdFx0XHRcdFsnc2F2ZWQnLCB0eXBlcy5DaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb25PdXRjb21lLlNhdmVkXSxcblx0XHRcdF0pO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRraW5kOiAnY2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uJyxcblx0XHRcdFx0XHRvdXRjb21lOiBvdXRjb21lcy5nZXQoZXZlbnQuYWN0aW9uLm91dGNvbWUpID8/IHR5cGVzLkNoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbk91dGNvbWUuUmVqZWN0ZWQsXG5cdFx0XHRcdFx0dXJpOiBVUkkucmV2aXZlKGV2ZW50LmFjdGlvbi51cmkpLFxuXHRcdFx0XHRcdGhhc1JlbWFpbmluZ0VkaXRzOiBldmVudC5hY3Rpb24uaGFzUmVtYWluaW5nRWRpdHNcblx0XHRcdFx0fSwgcmVzdWx0OiBlaFJlc3VsdFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGV2ZW50LmFjdGlvbi5raW5kID09PSAnY2hhdEVkaXRpbmdIdW5rQWN0aW9uJykge1xuXHRcdFx0Y29uc3Qgb3V0Y29tZXMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydhY2NlcHRlZCcsIHR5cGVzLkNoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbk91dGNvbWUuQWNjZXB0ZWRdLFxuXHRcdFx0XHRbJ3JlamVjdGVkJywgdHlwZXMuQ2hhdEVkaXRpbmdTZXNzaW9uQWN0aW9uT3V0Y29tZS5SZWplY3RlZF0sXG5cdFx0XHRdKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0a2luZDogJ2NoYXRFZGl0aW5nSHVua0FjdGlvbicsXG5cdFx0XHRcdFx0b3V0Y29tZTogb3V0Y29tZXMuZ2V0KGV2ZW50LmFjdGlvbi5vdXRjb21lKSA/PyB0eXBlcy5DaGF0RWRpdGluZ1Nlc3Npb25BY3Rpb25PdXRjb21lLlJlamVjdGVkLFxuXHRcdFx0XHRcdHVyaTogVVJJLnJldml2ZShldmVudC5hY3Rpb24udXJpKSxcblx0XHRcdFx0XHRoYXNSZW1haW5pbmdFZGl0czogZXZlbnQuYWN0aW9uLmhhc1JlbWFpbmluZ0VkaXRzLFxuXHRcdFx0XHRcdGxpbmVDb3VudDogZXZlbnQuYWN0aW9uLmxpbmVDb3VudCxcblx0XHRcdFx0XHRsaW5lc0FkZGVkOiBldmVudC5hY3Rpb24ubGluZXNBZGRlZCxcblx0XHRcdFx0XHRsaW5lc1JlbW92ZWQ6IGV2ZW50LmFjdGlvbi5saW5lc1JlbW92ZWRcblx0XHRcdFx0fSwgcmVzdWx0OiBlaFJlc3VsdFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHsgYWN0aW9uOiBldmVudC5hY3Rpb24sIHJlc3VsdDogZWhSZXN1bHQgfTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUZXJtaW5hbFF1aWNrRml4IHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocXVpY2tGaXg6IHZzY29kZS5UZXJtaW5hbFF1aWNrRml4VGVybWluYWxDb21tYW5kIHwgdnNjb2RlLlRlcm1pbmFsUXVpY2tGaXhPcGVuZXIgfCB2c2NvZGUuQ29tbWFuZCwgY29udmVydGVyOiBDb21tYW5kLklDb21tYW5kc0NvbnZlcnRlciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IGV4dEhvc3RQcm90b2NvbC5JVGVybWluYWxRdWlja0ZpeFRlcm1pbmFsQ29tbWFuZER0byB8IGV4dEhvc3RQcm90b2NvbC5JVGVybWluYWxRdWlja0ZpeE9wZW5lckR0byB8IGV4dEhvc3RQcm90b2NvbC5JQ29tbWFuZER0byB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCd0ZXJtaW5hbENvbW1hbmQnIGluIHF1aWNrRml4KSB7XG5cdFx0XHRyZXR1cm4geyB0ZXJtaW5hbENvbW1hbmQ6IHF1aWNrRml4LnRlcm1pbmFsQ29tbWFuZCwgc2hvdWxkRXhlY3V0ZTogcXVpY2tGaXguc2hvdWxkRXhlY3V0ZSB9O1xuXHRcdH1cblx0XHRpZiAoJ3VyaScgaW4gcXVpY2tGaXgpIHtcblx0XHRcdHJldHVybiB7IHVyaTogcXVpY2tGaXgudXJpIH07XG5cdFx0fVxuXHRcdHJldHVybiBjb252ZXJ0ZXIudG9JbnRlcm5hbChxdWlja0ZpeCwgZGlzcG9zYWJsZXMpO1xuXHR9XG59XG5leHBvcnQgbmFtZXNwYWNlIFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1EdG8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpdGVtOiB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uSXRlbSk6IGV4dEhvc3RQcm90b2NvbC5JVGVybWluYWxDb21wbGV0aW9uSXRlbUR0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLml0ZW0sXG5cdFx0XHRkb2N1bWVudGF0aW9uOiBNYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KGl0ZW0uZG9jdW1lbnRhdGlvbiksXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRlcm1pbmFsQ29tcGxldGlvbkxpc3Qge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShjb21wbGV0aW9uczogdnNjb2RlLlRlcm1pbmFsQ29tcGxldGlvbkxpc3QgfCB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uSXRlbVtdLCBwYXRoU2VwYXJhdG9yOiBzdHJpbmcpOiBleHRIb3N0UHJvdG9jb2wuVGVybWluYWxDb21wbGV0aW9uTGlzdER0byB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoY29tcGxldGlvbnMpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpdGVtczogY29tcGxldGlvbnMubWFwKGkgPT4gVGVybWluYWxDb21wbGV0aW9uSXRlbUR0by5mcm9tKGkpKSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRpdGVtczogY29tcGxldGlvbnMuaXRlbXMubWFwKGkgPT4gVGVybWluYWxDb21wbGV0aW9uSXRlbUR0by5mcm9tKGkpKSxcblx0XHRcdHJlc291cmNlT3B0aW9uczogY29tcGxldGlvbnMucmVzb3VyY2VPcHRpb25zID8gVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zLmZyb20oY29tcGxldGlvbnMucmVzb3VyY2VPcHRpb25zLCBwYXRoU2VwYXJhdG9yKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocmVzb3VyY2VPcHRpb25zOiB2c2NvZGUuVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zLCBwYXRoU2VwYXJhdG9yOiBzdHJpbmcpOiBleHRIb3N0UHJvdG9jb2wuVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zRHRvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4ucmVzb3VyY2VPcHRpb25zLFxuXHRcdFx0cGF0aFNlcGFyYXRvcixcblx0XHRcdGN3ZDogcmVzb3VyY2VPcHRpb25zLmN3ZCxcblx0XHRcdGdsb2JQYXR0ZXJuOiBHbG9iUGF0dGVybi5mcm9tKHJlc291cmNlT3B0aW9ucy5nbG9iUGF0dGVybikgPz8gdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFBhcnRpYWxBY2NlcHRJbmZvIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGluZm86IGxhbmd1YWdlcy5QYXJ0aWFsQWNjZXB0SW5mbyk6IHR5cGVzLlBhcnRpYWxBY2NlcHRJbmZvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLnRvKGluZm8ua2luZCksXG5cdFx0XHRhY2NlcHRlZExlbmd0aDogaW5mby5hY2NlcHRlZExlbmd0aCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGtpbmQ6IGxhbmd1YWdlcy5QYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQpOiB0eXBlcy5QYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSBsYW5ndWFnZXMuUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLldvcmQ6XG5cdFx0XHRcdHJldHVybiB0eXBlcy5QYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQuV29yZDtcblx0XHRcdGNhc2UgbGFuZ3VhZ2VzLlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZC5MaW5lOlxuXHRcdFx0XHRyZXR1cm4gdHlwZXMuUGFydGlhbEFjY2VwdFRyaWdnZXJLaW5kLkxpbmU7XG5cdFx0XHRjYXNlIGxhbmd1YWdlcy5QYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQuU3VnZ2VzdDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZC5TdWdnZXN0O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLlBhcnRpYWxBY2NlcHRUcmlnZ2VyS2luZC5Vbmtub3duO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gdG88VD4ocmVhc29uOiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbjxUPiwgY29udmVydEZuOiAoaXRlbTogVCkgPT4gdnNjb2RlLklubGluZUNvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkKTogdnNjb2RlLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb24ge1xuXHRcdGlmIChyZWFzb24ua2luZCA9PT0gbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLklnbm9yZWQpIHtcblx0XHRcdGNvbnN0IHN1cGVyc2VkZWRCeSA9IHJlYXNvbi5zdXBlcnNlZGVkQnkgPyBjb252ZXJ0Rm4ocmVhc29uLnN1cGVyc2VkZWRCeSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiB0eXBlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5JZ25vcmVkLFxuXHRcdFx0XHRzdXBlcnNlZGVkQnk6IHN1cGVyc2VkZWRCeSxcblx0XHRcdFx0dXNlclR5cGluZ0Rpc2FncmVlZDogcmVhc29uLnVzZXJUeXBpbmdEaXNhZ3JlZWQsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAocmVhc29uLmtpbmQgPT09IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5BY2NlcHRlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogdHlwZXMuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuQWNjZXB0ZWQsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogdHlwZXMuSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuUmVqZWN0ZWQsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIElubGluZUNvbXBsZXRpb25IaW50U3R5bGUge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLklubGluZUNvbXBsZXRpb25EaXNwbGF5TG9jYXRpb25LaW5kKTogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25IaW50U3R5bGUge1xuXHRcdGlmICh2YWx1ZSA9PT0gdHlwZXMuSW5saW5lQ29tcGxldGlvbkRpc3BsYXlMb2NhdGlvbktpbmQuTGFiZWwpIHtcblx0XHRcdHJldHVybiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkhpbnRTdHlsZS5MYWJlbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uSGludFN0eWxlLkNvZGU7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGtpbmQ6IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uSGludFN0eWxlKTogdHlwZXMuSW5saW5lQ29tcGxldGlvbkRpc3BsYXlMb2NhdGlvbktpbmQge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbkhpbnRTdHlsZS5MYWJlbDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLklubGluZUNvbXBsZXRpb25EaXNwbGF5TG9jYXRpb25LaW5kLkxhYmVsO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHR5cGVzLklubGluZUNvbXBsZXRpb25EaXNwbGF5TG9jYXRpb25LaW5kLkNvZGU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRGVidWdUcmVlSXRlbSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKGl0ZW06IHZzY29kZS5EZWJ1Z1RyZWVJdGVtLCBpZDogbnVtYmVyKTogSURlYnVnVmlzdWFsaXphdGlvblRyZWVJdGVtIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQsXG5cdFx0XHRsYWJlbDogaXRlbS5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0Y2FuRWRpdDogaXRlbS5jYW5FZGl0LFxuXHRcdFx0Y29sbGFwc2libGVTdGF0ZTogKGl0ZW0uY29sbGFwc2libGVTdGF0ZSB8fCBEZWJ1Z1RyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lKSBhcyBEZWJ1Z1RyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSxcblx0XHRcdGNvbnRleHRWYWx1ZTogaXRlbS5jb250ZXh0VmFsdWUsXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIExhbmd1YWdlTW9kZWxUb29sU291cmNlIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHNvdXJjZTogRHRvPFRvb2xEYXRhU291cmNlPik6IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbEluZm9ybWF0aW9uWydzb3VyY2UnXSB7XG5cdFx0aWYgKHNvdXJjZS50eXBlID09PSAnbWNwJykge1xuXHRcdFx0cmV0dXJuIG5ldyB0eXBlcy5MYW5ndWFnZU1vZGVsVG9vbE1DUFNvdXJjZShzb3VyY2UubGFiZWwsIHNvdXJjZS5zZXJ2ZXJMYWJlbCB8fCBzb3VyY2UubGFiZWwsIHNvdXJjZS5pbnN0cnVjdGlvbnMpO1xuXHRcdH0gZWxzZSBpZiAoc291cmNlLnR5cGUgPT09ICdleHRlbnNpb24nKSB7XG5cdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxUb29sRXh0ZW5zaW9uU291cmNlKHNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSwgc291cmNlLmxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdCB7XG5cdGV4cG9ydCBmdW5jdGlvbiB0byhyZXN1bHQ6IElUb29sUmVzdWx0KTogdnNjb2RlLkV4dGVuZGVkTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQge1xuXHRcdGNvbnN0IHRvb2xSZXN1bHQgPSBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQocmVzdWx0LmNvbnRlbnQubWFwKGl0ZW0gPT4ge1xuXHRcdFx0aWYgKGl0ZW0ua2luZCA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KGl0ZW0udmFsdWUsIGl0ZW0uYXVkaWVuY2UpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydChpdGVtLnZhbHVlLmRhdGEuYnVmZmVyLCBpdGVtLnZhbHVlLm1pbWVUeXBlLCBpdGVtLmF1ZGllbmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuZXcgdHlwZXMuTGFuZ3VhZ2VNb2RlbFByb21wdFRzeFBhcnQoaXRlbS52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpIGFzIHZzY29kZS5FeHRlbmRlZExhbmd1YWdlTW9kZWxUb29sUmVzdWx0O1xuXHRcdGlmIChyZXN1bHQudG9vbE1ldGFkYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRvb2xSZXN1bHQudG9vbE1ldGFkYXRhID0gcmVzdWx0LnRvb2xNZXRhZGF0YTtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC50b29sUmVzdWx0RXJyb3IpIHtcblx0XHRcdHRvb2xSZXN1bHQuaGFzRXJyb3IgPSAhIXJlc3VsdC50b29sUmVzdWx0RXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB0b29sUmVzdWx0O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20ocmVzdWx0OiB2c2NvZGUuRXh0ZW5kZWRMYW5ndWFnZU1vZGVsVG9vbFJlc3VsdDIsIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogRHRvPElUb29sUmVzdWx0PiB8IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPER0bzxJVG9vbFJlc3VsdD4+IHtcblx0XHRpZiAocmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlKSB7XG5cdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hlY2tBdWRpZW5jZUFwaSA9IChpdGVtOiBMYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCBMYW5ndWFnZU1vZGVsRGF0YVBhcnQpID0+IHtcblx0XHRcdGlmIChpdGVtLmF1ZGllbmNlKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2xhbmd1YWdlTW9kZWxUb29sUmVzdWx0QXVkaWVuY2UnKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bGV0IGhhc0J1ZmZlcnMgPSBmYWxzZTtcblx0XHRsZXQgZGV0YWlsc0R0bzogRHRvPEFycmF5PFVSSSB8IHR5cGVzLkxvY2F0aW9uPiB8IElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzIHwgSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzIHwgdW5kZWZpbmVkPiA9IHVuZGVmaW5lZDtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShyZXN1bHQudG9vbFJlc3VsdERldGFpbHMpKSB7XG5cdFx0XHRkZXRhaWxzRHRvID0gcmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzPy5tYXAoZGV0YWlsID0+IHtcblx0XHRcdFx0cmV0dXJuIFVSSS5pc1VyaShkZXRhaWwpID8gZGV0YWlsIDogTG9jYXRpb24uZnJvbShkZXRhaWwgYXMgdnNjb2RlLkxvY2F0aW9uKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAocmVzdWx0LnRvb2xSZXN1bHREZXRhaWxzMikge1xuXHRcdFx0XHRkZXRhaWxzRHRvID0ge1xuXHRcdFx0XHRcdG91dHB1dDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2RhdGEnLFxuXHRcdFx0XHRcdFx0bWltZVR5cGU6IChyZXN1bHQudG9vbFJlc3VsdERldGFpbHMyIGFzIHZzY29kZS5Ub29sUmVzdWx0RGF0YU91dHB1dCkubWltZSxcblx0XHRcdFx0XHRcdHZhbHVlOiBWU0J1ZmZlci53cmFwKChyZXN1bHQudG9vbFJlc3VsdERldGFpbHMyIGFzIHZzY29kZS5Ub29sUmVzdWx0RGF0YU91dHB1dCkudmFsdWUpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVRvb2xSZXN1bHRPdXRwdXREZXRhaWxzO1xuXHRcdFx0XHRoYXNCdWZmZXJzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBkdG86IER0bzxJVG9vbFJlc3VsdD4gPSB7XG5cdFx0XHRjb250ZW50OiByZXN1bHQuY29udGVudC5tYXAoaXRlbSA9PiB7XG5cdFx0XHRcdGlmIChpdGVtIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KSB7XG5cdFx0XHRcdFx0Y2hlY2tBdWRpZW5jZUFwaShpdGVtKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGl0ZW0udmFsdWUsXG5cdFx0XHRcdFx0XHRhdWRpZW5jZTogaXRlbS5hdWRpZW5jZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXRlbSBpbnN0YW5jZW9mIHR5cGVzLkxhbmd1YWdlTW9kZWxQcm9tcHRUc3hQYXJ0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdwcm9tcHRUc3gnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGl0ZW0udmFsdWUsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIGlmIChpdGVtIGluc3RhbmNlb2YgdHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KSB7XG5cdFx0XHRcdFx0Y2hlY2tBdWRpZW5jZUFwaShpdGVtKTtcblx0XHRcdFx0XHRoYXNCdWZmZXJzID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0a2luZDogJ2RhdGEnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdFx0bWltZVR5cGU6IGl0ZW0ubWltZVR5cGUsXG5cdFx0XHRcdFx0XHRcdGRhdGE6IFZTQnVmZmVyLndyYXAoaXRlbS5kYXRhKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGF1ZGllbmNlOiBpdGVtLmF1ZGllbmNlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQgcGFydCB0eXBlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0dG9vbFJlc3VsdE1lc3NhZ2U6IE1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3QocmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlKSxcblx0XHRcdHRvb2xSZXN1bHREZXRhaWxzOiBkZXRhaWxzRHRvLFxuXHRcdFx0dG9vbE1ldGFkYXRhOiByZXN1bHQudG9vbE1ldGFkYXRhLFxuXHRcdFx0dG9vbFJlc3VsdEVycm9yOiByZXN1bHQuaGFzRXJyb3IsXG5cdFx0fTtcblxuXHRcdHJldHVybiBoYXNCdWZmZXJzID8gbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKGR0bykgOiBkdG87XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJY29uUGF0aCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tVGhlbWVJY29uKGljb25QYXRoOiB2c2NvZGUuVGhlbWVJY29uKTogbGFuZ3VhZ2VzLkljb25QYXRoIHtcblx0XHRyZXR1cm4gaWNvblBhdGg7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSB7QGxpbmsgdnNjb2RlLkljb25QYXRofSB0byBhbiB7QGxpbmsgZXh0SG9zdFByb3RvY29sLkljb25QYXRoRHRvfS5cblx0ICogQG5vdGUgVGhpcyBmdW5jdGlvbiB3aWxsIHRvbGVyYXRlIHN0cmluZ3Mgc3BlY2lmaWVkIGluc3RlYWQgb2YgVVJJcyBpbiBJY29uUGF0aCBmb3IgaGlzdG9yaWNhbCByZWFzb25zLlxuXHQgKiBTdWNoIHN0cmluZ3MgYXJlIHRyZWF0ZWQgYXMgZmlsZSBwYXRocyBhbmQgY29udmVydGVkIHVzaW5nIHtAbGluayBVUkkuZmlsZX0gZnVuY3Rpb24sIG5vdCB7QGxpbmsgVVJJLmZyb219LlxuXHQgKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExMDQzMiNpc3N1ZWNvbW1lbnQtNzI2MTQ0NTU2IGZvciBjb250ZXh0LlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHVuZGVmaW5lZCk6IHVuZGVmaW5lZDtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5JY29uUGF0aCk6IGV4dEhvc3RQcm90b2NvbC5JY29uUGF0aER0bztcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5JY29uUGF0aCB8IHVuZGVmaW5lZCk6IGV4dEhvc3RQcm90b2NvbC5JY29uUGF0aER0byB8IHVuZGVmaW5lZDtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5JY29uUGF0aCB8IHVuZGVmaW5lZCk6IGV4dEhvc3RQcm90b2NvbC5JY29uUGF0aER0byB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbih2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9IGVsc2UgaWYgKFVSSS5pc1VyaSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBVUkkuZmlsZSh2YWx1ZSk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsICYmICdkYXJrJyBpbiB2YWx1ZSkge1xuXHRcdFx0Y29uc3QgZGFyayA9IHR5cGVvZiB2YWx1ZS5kYXJrID09PSAnc3RyaW5nJyA/IFVSSS5maWxlKHZhbHVlLmRhcmspIDogdmFsdWUuZGFyaztcblx0XHRcdGNvbnN0IGxpZ2h0ID0gdHlwZW9mIHZhbHVlLmxpZ2h0ID09PSAnc3RyaW5nJyA/IFVSSS5maWxlKHZhbHVlLmxpZ2h0KSA6IHZhbHVlLmxpZ2h0O1xuXHRcdFx0cmV0dXJuICFkYXJrID8gdW5kZWZpbmVkIDogeyBkYXJrLCBsaWdodDogbGlnaHQgPz8gZGFyayB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIHtAbGluayBleHRIb3N0UHJvdG9jb2wuSWNvblBhdGhEdG99IHRvIGEge0BsaW5rIHZzY29kZS5JY29uUGF0aH0uXG5cdCAqIEBub3RlIFRoaXMgaXMgYSBzdHJpY3QgY29udmVyc2lvbiBhbmQgd2UgYXNzdW1lIHR5cGVzIGFyZSBjb3JyZWN0IGluIHRoaXMgY2FzZS5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogdW5kZWZpbmVkKTogdW5kZWZpbmVkO1xuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IGV4dEhvc3RQcm90b2NvbC5JY29uUGF0aER0byk6IHZzY29kZS5JY29uUGF0aDtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBleHRIb3N0UHJvdG9jb2wuSWNvblBhdGhEdG8gfCB1bmRlZmluZWQpOiB2c2NvZGUuSWNvblBhdGggfCB1bmRlZmluZWQ7XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogZXh0SG9zdFByb3RvY29sLkljb25QYXRoRHRvIHwgdW5kZWZpbmVkKTogdnNjb2RlLkljb25QYXRoIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0gZWxzZSBpZiAoaXNVcmlDb21wb25lbnRzKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIFVSSS5yZXZpdmUodmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBpY29uID0gdmFsdWUgYXMgeyBsaWdodDogVXJpQ29tcG9uZW50czsgZGFyazogVXJpQ29tcG9uZW50cyB9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGlnaHQ6IFVSSS5yZXZpdmUoaWNvbi5saWdodCksXG5cdFx0XHRcdGRhcms6IFVSSS5yZXZpdmUoaWNvbi5kYXJrKVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBBaVNldHRpbmdzU2VhcmNoIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TZXR0aW5nc1NlYXJjaFJlc3VsdChyZXN1bHQ6IHZzY29kZS5TZXR0aW5nc1NlYXJjaFJlc3VsdCk6IEFpU2V0dGluZ3NTZWFyY2hSZXN1bHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRxdWVyeTogcmVzdWx0LnF1ZXJ5LFxuXHRcdFx0a2luZDogZnJvbVNldHRpbmdzU2VhcmNoUmVzdWx0S2luZChyZXN1bHQua2luZCksXG5cdFx0XHRzZXR0aW5nczogcmVzdWx0LnNldHRpbmdzXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGZyb21TZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQoa2luZDogbnVtYmVyKTogQWlTZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQge1xuXHRcdHN3aXRjaCAoa2luZCkge1xuXHRcdFx0Y2FzZSBBaVNldHRpbmdzU2VhcmNoUmVzdWx0S2luZC5FTUJFRERFRDpcblx0XHRcdFx0cmV0dXJuIEFpU2V0dGluZ3NTZWFyY2hSZXN1bHRLaW5kLkVNQkVEREVEO1xuXHRcdFx0Y2FzZSBBaVNldHRpbmdzU2VhcmNoUmVzdWx0S2luZC5MTE1fUkFOS0VEOlxuXHRcdFx0XHRyZXR1cm4gQWlTZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQuTExNX1JBTktFRDtcblx0XHRcdGNhc2UgQWlTZXR0aW5nc1NlYXJjaFJlc3VsdEtpbmQuQ0FOQ0VMRUQ6XG5cdFx0XHRcdHJldHVybiBBaVNldHRpbmdzU2VhcmNoUmVzdWx0S2luZC5DQU5DRUxFRDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBBaVNldHRpbmdzU2VhcmNoUmVzdWx0S2luZCcpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE1jcFNlcnZlckRlZmluaXRpb24ge1xuXHRmdW5jdGlvbiBpc0h0dHBDb25maWcoY2FuZGlkYXRlOiB2c2NvZGUuTWNwU2VydmVyRGVmaW5pdGlvbik6IGNhbmRpZGF0ZSBpcyB2c2NvZGUuTWNwSHR0cFNlcnZlckRlZmluaXRpb24ge1xuXHRcdHJldHVybiAhIShjYW5kaWRhdGUgYXMgdnNjb2RlLk1jcEh0dHBTZXJ2ZXJEZWZpbml0aW9uKS51cmk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbShpdGVtOiB2c2NvZGUuTWNwU2VydmVyRGVmaW5pdGlvbik6IE1jcFNlcnZlckxhdW5jaC5TZXJpYWxpemVkIHtcblx0XHRyZXR1cm4gTWNwU2VydmVyTGF1bmNoLnRvU2VyaWFsaXplZChcblx0XHRcdGlzSHR0cENvbmZpZyhpdGVtKVxuXHRcdFx0XHQ/IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFAsXG5cdFx0XHRcdFx0dXJpOiBpdGVtLnVyaSxcblx0XHRcdFx0XHRoZWFkZXJzOiBPYmplY3QuZW50cmllcyhpdGVtLmhlYWRlcnMpLFxuXHRcdFx0XHRcdGF1dGhlbnRpY2F0aW9uOiAoaXRlbSBhcyB2c2NvZGUuTWNwSHR0cFNlcnZlckRlZmluaXRpb24yKS5hdXRoZW50aWNhdGlvbiA/IHtcblx0XHRcdFx0XHRcdHByb3ZpZGVySWQ6IChpdGVtIGFzIHZzY29kZS5NY3BIdHRwU2VydmVyRGVmaW5pdGlvbjIpLmF1dGhlbnRpY2F0aW9uIS5wcm92aWRlcklkLFxuXHRcdFx0XHRcdFx0c2NvcGVzOiAoaXRlbSBhcyB2c2NvZGUuTWNwSHR0cFNlcnZlckRlZmluaXRpb24yKS5hdXRoZW50aWNhdGlvbiEuc2NvcGVzXG5cdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0XHQ6IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvLFxuXHRcdFx0XHRcdGN3ZDogaXRlbS5jd2Q/LmZzUGF0aCxcblx0XHRcdFx0XHRhcmdzOiBpdGVtLmFyZ3MsXG5cdFx0XHRcdFx0Y29tbWFuZDogaXRlbS5jb21tYW5kLFxuXHRcdFx0XHRcdGVudjogaXRlbS5lbnYsXG5cdFx0XHRcdFx0ZW52RmlsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNhbmRib3g6IHVuZGVmaW5lZFxuXHRcdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdC8qKiBDb252ZXJ0cyBmcm9tIHRoZSBJUEMgRFRPIHRvIHRoZSBBUEkgdHlwZS4gKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGR0bzogTWNwU2VydmVyRGVmaW5pdGlvblR5cGUuU2VyaWFsaXplZCk6IHZzY29kZS5NY3BTZXJ2ZXJEZWZpbml0aW9uIHtcblx0XHRjb25zdCBsYXVuY2ggPSBNY3BTZXJ2ZXJMYXVuY2guZnJvbVNlcmlhbGl6ZWQoZHRvLmxhdW5jaCk7XG5cdFx0aWYgKGxhdW5jaC50eXBlID09PSBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFApIHtcblx0XHRcdHJldHVybiBuZXcgdHlwZXMuTWNwSHR0cFNlcnZlckRlZmluaXRpb24oXG5cdFx0XHRcdGR0by5sYWJlbCxcblx0XHRcdFx0bGF1bmNoLnVyaSxcblx0XHRcdFx0T2JqZWN0LmZyb21FbnRyaWVzKGxhdW5jaC5oZWFkZXJzKSxcblx0XHRcdFx0ZHRvLmNhY2hlTm9uY2UgPT09ICckJE5PTkUnID8gdW5kZWZpbmVkIDogZHRvLmNhY2hlTm9uY2UsXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgdHlwZXMuTWNwU3RkaW9TZXJ2ZXJEZWZpbml0aW9uKFxuXHRcdFx0XHRkdG8ubGFiZWwsXG5cdFx0XHRcdGxhdW5jaC5jb21tYW5kLFxuXHRcdFx0XHRbLi4ubGF1bmNoLmFyZ3NdLFxuXHRcdFx0XHRPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMobGF1bmNoLmVudikubWFwKChba2V5LCB2YWx1ZV0pID0+IFtrZXksIHZhbHVlID09PSBudWxsID8gbnVsbCA6IFN0cmluZyh2YWx1ZSldKSksXG5cdFx0XHRcdGR0by5jYWNoZU5vbmNlID09PSAnJCROT05FJyA/IHVuZGVmaW5lZCA6IGR0by5jYWNoZU5vbmNlLFxuXHRcdFx0KTtcblx0XHRcdGlmIChsYXVuY2guY3dkKSB7XG5cdFx0XHRcdHJlc3VsdC5jd2QgPSBVUkkuZmlsZShsYXVuY2guY3dkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgU291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGUge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh0eXBlOiBudW1iZXIpOiBJbnB1dFZhbGlkYXRpb25UeXBlIHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgdHlwZXMuU291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGUuRXJyb3I6XG5cdFx0XHRcdHJldHVybiBJbnB1dFZhbGlkYXRpb25UeXBlLkVycm9yO1xuXHRcdFx0Y2FzZSB0eXBlcy5Tb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZS5XYXJuaW5nOlxuXHRcdFx0XHRyZXR1cm4gSW5wdXRWYWxpZGF0aW9uVHlwZS5XYXJuaW5nO1xuXHRcdFx0Y2FzZSB0eXBlcy5Tb3VyY2VDb250cm9sSW5wdXRCb3hWYWxpZGF0aW9uVHlwZS5JbmZvcm1hdGlvbjpcblx0XHRcdFx0cmV0dXJuIElucHV0VmFsaWRhdGlvblR5cGUuSW5mb3JtYXRpb247XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gU291cmNlQ29udHJvbElucHV0Qm94VmFsaWRhdGlvblR5cGUnKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVxdWVzdEhvb2tzQ29udmVydGVyIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGhvb2tzOiBDaGF0UmVxdWVzdEhvb2tzKTogdnNjb2RlLkNoYXRSZXF1ZXN0SG9va3Mge1xuXHRcdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgdnNjb2RlLkNoYXRIb29rQ29tbWFuZFtdPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2hvb2tUeXBlLCBjb21tYW5kc10gb2YgT2JqZWN0LmVudHJpZXMoaG9va3MpKSB7XG5cdFx0XHRpZiAoIWNvbW1hbmRzIHx8IGNvbW1hbmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnZlcnRlZDogdnNjb2RlLkNoYXRIb29rQ29tbWFuZFtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGNtZCBvZiBjb21tYW5kcykge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IENoYXRIb29rQ29tbWFuZC50byhjbWQpO1xuXHRcdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRjb252ZXJ0ZWQucHVzaChyZXNvbHZlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChjb252ZXJ0ZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXN1bHRbaG9va1R5cGVdID0gY29udmVydGVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2hhdEhvb2tDb21tYW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKGhvb2s6IElQYXJzZWRIb29rQ29tbWFuZCk6IHZzY29kZS5DaGF0SG9va0NvbW1hbmQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSByZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBPUyk7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29tbWFuZCxcblx0XHRcdGN3ZDogaG9vay5jd2QsXG5cdFx0XHRlbnY6IGhvb2suZW52LFxuXHRcdFx0dGltZW91dDogaG9vay50aW1lb3V0LFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0U2Vzc2lvbkl0ZW0ge1xuXG5cdGZ1bmN0aW9uIGNvbnZlcnRTdGF0dXMoc3RhdHVzOiB2c2NvZGUuQ2hhdFNlc3Npb25TdGF0dXMgfCB1bmRlZmluZWQpOiBDaGF0U2Vzc2lvblN0YXR1cyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHN0YXR1cyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoc3RhdHVzKSB7XG5cdFx0XHRjYXNlIDA6IC8vIHZzY29kZS5DaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWRcblx0XHRcdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLkZhaWxlZDtcblx0XHRcdGNhc2UgMTogLy8gdnNjb2RlLkNoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZFxuXHRcdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXHRcdFx0Y2FzZSAyOiAvLyB2c2NvZGUuQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzc1xuXHRcdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHRcdGNhc2UgMzogLy8gdnNjb2RlLkNoYXRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXRcblx0XHRcdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHNlc3Npb25Db250ZW50OiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtKTogRHRvPElDaGF0U2Vzc2lvbkl0ZW0+IHtcblx0XHQvLyBTdXBwb3J0IGJvdGggbmV3IChjcmVhdGVkLCBsYXN0UmVxdWVzdFN0YXJ0ZWQsIGxhc3RSZXF1ZXN0RW5kZWQpIGFuZCBvbGQgKHN0YXJ0VGltZSwgZW5kVGltZSkgdGltaW5nIHByb3BlcnRpZXNcblx0XHRjb25zdCB0aW1pbmcgPSBzZXNzaW9uQ29udGVudC50aW1pbmc7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IHRpbWluZz8uY3JlYXRlZCA/PyB0aW1pbmc/LnN0YXJ0VGltZSA/PyAwO1xuXHRcdGNvbnN0IGxhc3RSZXF1ZXN0U3RhcnRlZCA9IHRpbWluZz8ubGFzdFJlcXVlc3RTdGFydGVkID8/IHRpbWluZz8uc3RhcnRUaW1lO1xuXHRcdGNvbnN0IGxhc3RSZXF1ZXN0RW5kZWQgPSB0aW1pbmc/Lmxhc3RSZXF1ZXN0RW5kZWQgPz8gdGltaW5nPy5lbmRUaW1lO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uQ29udGVudC5yZXNvdXJjZSxcblx0XHRcdGxhYmVsOiBzZXNzaW9uQ29udGVudC5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBzZXNzaW9uQ29udGVudC5kZXNjcmlwdGlvbiA/IE1hcmtkb3duU3RyaW5nLmZyb20oc2Vzc2lvbkNvbnRlbnQuZGVzY3JpcHRpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0YmFkZ2U6IHNlc3Npb25Db250ZW50LmJhZGdlID8gTWFya2Rvd25TdHJpbmcuZnJvbShzZXNzaW9uQ29udGVudC5iYWRnZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0dXM6IGNvbnZlcnRTdGF0dXMoc2Vzc2lvbkNvbnRlbnQuc3RhdHVzKSxcblx0XHRcdGFyY2hpdmVkOiBzZXNzaW9uQ29udGVudC5hcmNoaXZlZCxcblx0XHRcdHRvb2x0aXA6IE1hcmtkb3duU3RyaW5nLmZyb21TdHJpY3Qoc2Vzc2lvbkNvbnRlbnQudG9vbHRpcCksXG5cdFx0XHR0aW1pbmc6IHtcblx0XHRcdFx0Y3JlYXRlZCxcblx0XHRcdFx0bGFzdFJlcXVlc3RTdGFydGVkLFxuXHRcdFx0XHRsYXN0UmVxdWVzdEVuZGVkLFxuXHRcdFx0fSxcblx0XHRcdGNoYW5nZXM6IHNlc3Npb25Db250ZW50LmNoYW5nZXMgaW5zdGFuY2VvZiBBcnJheSA/IHNlc3Npb25Db250ZW50LmNoYW5nZXMgOiB1bmRlZmluZWQsXG5cdFx0XHRtZXRhZGF0YTogc2Vzc2lvbkNvbnRlbnQubWV0YWRhdGEsXG5cdFx0XHRsZWdhY3lSZXNvdXJjZTogc2Vzc2lvbkNvbnRlbnQubGVnYWN5UmVzb3VyY2UsXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxTQUFTLFVBQVUsdUJBQXVCO0FBQ25ELFNBQVMsVUFBVSxjQUFjLG9CQUFvQjtBQUVyRCxTQUErQyxlQUFlO0FBQzlELFNBQVMsZ0NBQWdDO0FBQ3pDLFlBQVksaUJBQWlCO0FBRTdCLFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsT0FBTyxjQUFjO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFVBQVU7QUFDbkIsU0FBMEIsNkJBQTZCO0FBQ3ZELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVyxlQUFlLFVBQVUsVUFBVSx5QkFBeUI7QUFDaEYsU0FBUyxLQUFvQix1QkFBdUI7QUFFcEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFFdEMsWUFBWSxpQkFBaUI7QUFHN0IsWUFBWSw0QkFBNEI7QUFFeEMsWUFBWSxlQUFlO0FBQzNCLFNBQVMsbUJBQW1CLDhCQUE4QjtBQUkxRCxTQUEyQyxnQkFBZ0IsaUJBQWlCO0FBQzVFLFNBQVMsb0JBQW9CLDRCQUE0QjtBQUN6RCxTQUFTLDRCQUE0QixrQkFBa0I7QUFLdkQsU0FBUywyQkFBMkI7QUFDcEMsU0FBbUUsd0JBQXdCLHNCQUFzQiwyQkFBMkIsaUNBQWlDO0FBQzdLLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQTJDO0FBQ3BELFNBQVMseUJBQXlCO0FBQ2xDLFNBQTJCLCtCQUErQjtBQUUxRCxTQUF1RyxnQkFBZ0Isa0NBQWtDO0FBQ3pKLFlBQVksa0JBQWtCO0FBRTlCLFNBQVMscUNBQWtFO0FBQzNFLFNBQXlELGlCQUFpQiw4QkFBOEI7QUFDeEcsWUFBWSxlQUFlO0FBQzNCLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsY0FBYztBQUN2QixTQUEwQixZQUFxSSxpQkFBaUMsc0JBQXNCLG9CQUFvQix3QkFBd0I7QUFDbFEsU0FBaUMsa0NBQWtDO0FBRW5FLFNBQVMsY0FBYyxrQkFBa0I7QUFDekMsU0FBUyx5QkFBeUIsNEJBQTRCO0FBQzlELFNBQWMscUNBQXFDO0FBR25ELFNBQVMsd0JBQXdCO0FBQ2pDLFlBQVksV0FBVztBQUN2QixTQUE0RCw2QkFBNkI7QUF3QmxGLElBQVU7QUFBQSxDQUFWLENBQVVBLGVBQVY7QUFFQyxXQUFTLEdBQUcsV0FBd0M7QUFDMUQsVUFBTSxFQUFFLDBCQUEwQixzQkFBc0Isb0JBQW9CLGVBQWUsSUFBSTtBQUMvRixVQUFNLFFBQVEsSUFBSSxNQUFNLFNBQVMsMkJBQTJCLEdBQUcsdUJBQXVCLENBQUM7QUFDdkYsVUFBTSxNQUFNLElBQUksTUFBTSxTQUFTLHFCQUFxQixHQUFHLGlCQUFpQixDQUFDO0FBQ3pFLFdBQU8sSUFBSSxNQUFNLFVBQVUsT0FBTyxHQUFHO0FBQUEsRUFDdEM7QUFMTyxFQUFBQSxXQUFTO0FBT1QsV0FBUyxLQUFLLFdBQXNDO0FBQzFELFVBQU0sRUFBRSxRQUFRLE9BQU8sSUFBSTtBQUMzQixXQUFPO0FBQUEsTUFDTiwwQkFBMEIsT0FBTyxPQUFPO0FBQUEsTUFDeEMsc0JBQXNCLE9BQU8sWUFBWTtBQUFBLE1BQ3pDLG9CQUFvQixPQUFPLE9BQU87QUFBQSxNQUNsQyxnQkFBZ0IsT0FBTyxZQUFZO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBUk8sRUFBQUEsV0FBUztBQUFBLEdBVEE7QUFtQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsV0FBVjtBQUtDLFdBQVMsS0FBSyxPQUE4RDtBQUNsRixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxFQUFFLE9BQU8sSUFBSSxJQUFJO0FBQ3ZCLFdBQU87QUFBQSxNQUNOLGlCQUFpQixNQUFNLE9BQU87QUFBQSxNQUM5QixhQUFhLE1BQU0sWUFBWTtBQUFBLE1BQy9CLGVBQWUsSUFBSSxPQUFPO0FBQUEsTUFDMUIsV0FBVyxJQUFJLFlBQVk7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFYTyxFQUFBQSxPQUFTO0FBZ0JULFdBQVMsR0FBRyxPQUFnRTtBQUNsRixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxFQUFFLGlCQUFpQixhQUFhLGVBQWUsVUFBVSxJQUFJO0FBQ25FLFdBQU8sSUFBSSxNQUFNLE1BQU0sa0JBQWtCLEdBQUcsY0FBYyxHQUFHLGdCQUFnQixHQUFHLFlBQVksQ0FBQztBQUFBLEVBQzlGO0FBTk8sRUFBQUEsT0FBUztBQUFBLEdBckJBO0FBOEJWLElBQVU7QUFBQSxDQUFWLENBQVVDLGNBQVY7QUFFQyxXQUFTLEtBQUtDLFdBQW9EO0FBQ3hFLFdBQU87QUFBQSxNQUNOLEtBQUtBLFVBQVM7QUFBQSxNQUNkLE9BQU8sTUFBTSxLQUFLQSxVQUFTLEtBQUs7QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFMTyxFQUFBRCxVQUFTO0FBT1QsV0FBUyxHQUFHQyxXQUFvRDtBQUN0RSxXQUFPLElBQUksTUFBTSxTQUFTLElBQUksT0FBT0EsVUFBUyxHQUFHLEdBQUcsTUFBTSxHQUFHQSxVQUFTLEtBQUssQ0FBQztBQUFBLEVBQzdFO0FBRk8sRUFBQUQsVUFBUztBQUFBLEdBVEE7QUFjVixJQUFVO0FBQUEsQ0FBVixDQUFVRSxlQUFWO0FBQ0MsV0FBUyxHQUFHLE1BQXlFO0FBQzNGLFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSyx1QkFBdUIsa0JBQWtCO0FBQVMsZUFBTyxNQUFNLGtCQUFrQjtBQUFBLE1BQ3RGLEtBQUssdUJBQXVCLGtCQUFrQjtBQUFPLGVBQU8sTUFBTSxrQkFBa0I7QUFBQSxNQUNwRixLQUFLLHVCQUF1QixrQkFBa0I7QUFBTyxlQUFPLE1BQU0sa0JBQWtCO0FBQUEsTUFDcEYsS0FBSyx1QkFBdUIsa0JBQWtCO0FBQVEsZUFBTyxNQUFNLGtCQUFrQjtBQUFBLElBQ3RGO0FBQUEsRUFDRDtBQVBPLEVBQUFBLFdBQVM7QUFBQSxHQURBO0FBV1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsY0FBVjtBQUNDLFdBQVMsR0FBRyxVQUFxQztBQUN2RCxXQUFPLElBQUksTUFBTSxTQUFTLFNBQVMsYUFBYSxHQUFHLFNBQVMsU0FBUyxDQUFDO0FBQUEsRUFDdkU7QUFGTyxFQUFBQSxVQUFTO0FBR1QsV0FBUyxLQUFLLFVBQXVEO0FBQzNFLFdBQU8sRUFBRSxZQUFZLFNBQVMsT0FBTyxHQUFHLFFBQVEsU0FBUyxZQUFZLEVBQUU7QUFBQSxFQUN4RTtBQUZPLEVBQUFBLFVBQVM7QUFBQSxHQUpBO0FBU1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsc0JBQVY7QUFFQyxXQUFTLEtBQUssT0FBZ0MsZ0JBQWtDLFdBQXlFO0FBQy9KLFdBQU8sU0FBUyxRQUFRLEtBQUssRUFBRSxJQUFJLFNBQU8sNkJBQTZCLEtBQUssZ0JBQWdCLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDeEc7QUFGTyxFQUFBQSxrQkFBUztBQUloQixXQUFTLDZCQUE2QixVQUEwQyxnQkFBNkMsV0FBOEY7QUFDMU4sUUFBSSxPQUFPLGFBQWEsVUFBVTtBQUNqQyxhQUFPO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixVQUFVO0FBQUEsUUFDVixXQUFXLFdBQVc7QUFBQSxNQUN2QjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFVBQVU7QUFDYixhQUFPO0FBQUEsUUFDTixhQUFhO0FBQUEsUUFDYixVQUFVLFNBQVM7QUFBQSxRQUNuQixRQUFRLGlCQUFpQixTQUFTLFFBQVEsY0FBYztBQUFBLFFBQ3hELFNBQVMsWUFBWSxLQUFLLFNBQVMsT0FBTyxLQUFLO0FBQUEsUUFDL0MsV0FBVyxTQUFTO0FBQUEsUUFDcEIsY0FBYyxTQUFTO0FBQUEsUUFDdkIsV0FBVyxXQUFXO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFFQSxXQUFTLGlCQUFpQixRQUE0QixnQkFBaUU7QUFDdEgsUUFBSSxrQkFBa0IsT0FBTyxXQUFXLFVBQVU7QUFDakQsYUFBTyxlQUFlLHdCQUF3QixNQUFNO0FBQUEsSUFDckQ7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEdBbkNnQjtBQXNDVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxpQkFBVjtBQUVOLFdBQVMsbUJBQW1CLE9BQTBEO0FBQ3JGLFdBQVEsTUFBZ0MsYUFBYTtBQUFBLEVBQ3REO0FBRU8sV0FBUyxLQUFLLE9BQTJCLGdCQUFrQyxXQUFvRTtBQUNySixRQUFJLG1CQUFtQixLQUFLLEdBQUc7QUFDOUIsYUFBTyxFQUFFLFVBQVUsTUFBTSxTQUFTO0FBQUEsSUFDbkM7QUFDQSxXQUFPLEVBQUUsS0FBSyxpQkFBaUIsS0FBSyxNQUFNLEtBQUssZ0JBQWdCLFNBQVMsRUFBRTtBQUFBLEVBQzNFO0FBTE8sRUFBQUEsYUFBUztBQUFBLEdBTkE7QUFjVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxtQkFBVjtBQUNDLFdBQVMsS0FBSyxPQUFvRDtBQUN4RSxZQUFRLE9BQU87QUFBQSxNQUNkLEtBQUssTUFBTSxjQUFjO0FBQ3hCLGVBQU8sVUFBVTtBQUFBLE1BQ2xCLEtBQUssTUFBTSxjQUFjO0FBQ3hCLGVBQU8sVUFBVTtBQUFBLElBQ25CO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFSTyxFQUFBQSxlQUFTO0FBU1QsV0FBUyxHQUFHLE9BQW9EO0FBQ3RFLFlBQVEsT0FBTztBQUFBLE1BQ2QsS0FBSyxVQUFVO0FBQ2QsZUFBTyxNQUFNLGNBQWM7QUFBQSxNQUM1QixLQUFLLFVBQVU7QUFDZCxlQUFPLE1BQU0sY0FBYztBQUFBLE1BQzVCO0FBQ0MsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBVE8sRUFBQUEsZUFBUztBQUFBLEdBVkE7QUFzQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsZ0JBQVY7QUFDQyxXQUFTLEtBQUssT0FBdUM7QUFDM0QsUUFBSTtBQUVKLFFBQUksTUFBTSxNQUFNO0FBQ2YsVUFBSSxTQUFTLE1BQU0sSUFBSSxLQUFLLFNBQVMsTUFBTSxJQUFJLEdBQUc7QUFDakQsZUFBTyxPQUFPLE1BQU0sSUFBSTtBQUFBLE1BQ3pCLE9BQU87QUFDTixlQUFPO0FBQUEsVUFDTixPQUFPLE9BQU8sTUFBTSxLQUFLLEtBQUs7QUFBQSxVQUM5QixRQUFRLE1BQU0sS0FBSztBQUFBLFFBQ3BCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsTUFDTixHQUFHLE1BQU0sS0FBSyxNQUFNLEtBQUs7QUFBQSxNQUN6QixTQUFTLE1BQU07QUFBQSxNQUNmLFFBQVEsTUFBTTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLFVBQVUsbUJBQW1CLEtBQUssTUFBTSxRQUFRO0FBQUEsTUFDaEQsb0JBQW9CLE1BQU0sc0JBQXNCLE1BQU0sbUJBQW1CLElBQUksNkJBQTZCLElBQUk7QUFBQSxNQUM5RyxNQUFNLE1BQU0sUUFBUSxNQUFNLElBQUksSUFBSSxTQUFTLE1BQU0sS0FBSyxJQUFJLGNBQWMsSUFBSSxDQUFDLElBQUk7QUFBQSxJQUNsRjtBQUFBLEVBQ0Q7QUF2Qk8sRUFBQUEsWUFBUztBQXlCVCxXQUFTLEdBQUcsT0FBdUM7QUFDekQsVUFBTSxNQUFNLElBQUksTUFBTSxXQUFXLE1BQU0sR0FBRyxLQUFLLEdBQUcsTUFBTSxTQUFTLG1CQUFtQixHQUFHLE1BQU0sUUFBUSxDQUFDO0FBQ3RHLFFBQUksU0FBUyxNQUFNO0FBQ25CLFFBQUksT0FBTyxTQUFTLE1BQU0sSUFBSSxJQUFJLE1BQU0sT0FBTyxNQUFNLE1BQU07QUFDM0QsUUFBSSxxQkFBcUIsTUFBTSxzQkFBc0IsTUFBTSxtQkFBbUIsSUFBSSw2QkFBNkIsRUFBRTtBQUNqSCxRQUFJLE9BQU8sTUFBTSxRQUFRLFNBQVMsTUFBTSxLQUFLLElBQUksY0FBYyxFQUFFLENBQUM7QUFDbEUsV0FBTztBQUFBLEVBQ1I7QUFQTyxFQUFBQSxZQUFTO0FBQUEsR0ExQkE7QUFvQ1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsa0NBQVY7QUFDQyxXQUFTLEtBQUssT0FBaUU7QUFDckYsV0FBTztBQUFBLE1BQ04sR0FBRyxNQUFNLEtBQUssTUFBTSxTQUFTLEtBQUs7QUFBQSxNQUNsQyxTQUFTLE1BQU07QUFBQSxNQUNmLFVBQVUsTUFBTSxTQUFTO0FBQUEsSUFDMUI7QUFBQSxFQUNEO0FBTk8sRUFBQUEsOEJBQVM7QUFPVCxXQUFTLEdBQUcsT0FBZ0U7QUFDbEYsV0FBTyxJQUFJLE1BQU0sNkJBQTZCLElBQUksTUFBTSxTQUFTLE1BQU0sVUFBVSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsTUFBTSxPQUFPO0FBQUEsRUFDakg7QUFGTyxFQUFBQSw4QkFBUztBQUFBLEdBUkE7QUFZVixJQUFVO0FBQUEsQ0FBVixDQUFVQyx3QkFBVjtBQUVDLFdBQVMsS0FBSyxPQUErQjtBQUNuRCxZQUFRLE9BQU87QUFBQSxNQUNkLEtBQUssTUFBTSxtQkFBbUI7QUFDN0IsZUFBTyxlQUFlO0FBQUEsTUFDdkIsS0FBSyxNQUFNLG1CQUFtQjtBQUM3QixlQUFPLGVBQWU7QUFBQSxNQUN2QixLQUFLLE1BQU0sbUJBQW1CO0FBQzdCLGVBQU8sZUFBZTtBQUFBLE1BQ3ZCLEtBQUssTUFBTSxtQkFBbUI7QUFDN0IsZUFBTyxlQUFlO0FBQUEsSUFDeEI7QUFDQSxXQUFPLGVBQWU7QUFBQSxFQUN2QjtBQVpPLEVBQUFBLG9CQUFTO0FBY1QsV0FBUyxHQUFHLE9BQWlEO0FBQ25FLFlBQVEsT0FBTztBQUFBLE1BQ2QsS0FBSyxlQUFlO0FBQ25CLGVBQU8sTUFBTSxtQkFBbUI7QUFBQSxNQUNqQyxLQUFLLGVBQWU7QUFDbkIsZUFBTyxNQUFNLG1CQUFtQjtBQUFBLE1BQ2pDLEtBQUssZUFBZTtBQUNuQixlQUFPLE1BQU0sbUJBQW1CO0FBQUEsTUFDakMsS0FBSyxlQUFlO0FBQ25CLGVBQU8sTUFBTSxtQkFBbUI7QUFBQSxNQUNqQztBQUNDLGVBQU8sTUFBTSxtQkFBbUI7QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFiTyxFQUFBQSxvQkFBUztBQUFBLEdBaEJBO0FBZ0NWLElBQVU7QUFBQSxDQUFWLENBQVVDLGdCQUFWO0FBQ0MsV0FBUyxLQUFLLFFBQStDO0FBQ25FLFFBQUksT0FBTyxXQUFXLFlBQVksVUFBVSxNQUFNLFdBQVcsS0FBSztBQUNqRSxhQUFPLFNBQVM7QUFBQSxJQUNqQjtBQUVBLFFBQUksV0FBVyxNQUFNLFdBQVcsUUFBUTtBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBVk8sRUFBQUEsWUFBUztBQVlULFdBQVMsR0FBRyxVQUFnRDtBQUNsRSxRQUFJLE9BQU8sYUFBYSxZQUFZLFlBQVksR0FBRztBQUNsRCxhQUFPLFdBQVc7QUFBQSxJQUNuQjtBQUVBLFVBQU0sSUFBSSxNQUFNLDZCQUE2QjtBQUFBLEVBQzlDO0FBTk8sRUFBQUEsWUFBUztBQUFBLEdBYkE7QUFzQmpCLFNBQVMsb0JBQW9CLFdBQXVEO0FBQ25GLFNBQVEsT0FBTyxVQUFVLFVBQVU7QUFDcEM7QUFFTyxTQUFTLHVCQUF1QixXQUFpRztBQUN2SSxNQUFJLFVBQVUsV0FBVyxHQUFHO0FBQzNCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxvQkFBb0IsVUFBVSxDQUFDLENBQUMsSUFBSSxPQUFPO0FBQ25EO0FBRU8sSUFBVTtBQUFBLENBQVYsQ0FBVUMsb0JBQVY7QUFFQyxXQUFTLFNBQVMsUUFBd0Y7QUFDaEgsV0FBTyxPQUFPLElBQUlBLGdCQUFlLElBQUk7QUFBQSxFQUN0QztBQUZPLEVBQUFBLGdCQUFTO0FBU2hCLFdBQVMsWUFBWSxPQUFnQztBQUNwRCxXQUFPLFNBQVMsT0FBTyxVQUFVLFlBQzdCLE9BQW1CLE1BQU8sYUFBYSxZQUN2QyxPQUFtQixNQUFPLFVBQVU7QUFBQSxFQUN6QztBQUVPLFdBQVMsS0FBSyxRQUFrRjtBQUN0RyxRQUFJO0FBQ0osUUFBSSxZQUFZLE1BQU0sR0FBRztBQUN4QixZQUFNLEVBQUUsVUFBVSxNQUFNLElBQUk7QUFDNUIsWUFBTSxFQUFFLE9BQU8sUUFBUSxXQUFXLE9BQU8sUUFBUSxVQUFVO0FBQUEsSUFDNUQsV0FBVyxNQUFNLGVBQWUsaUJBQWlCLE1BQU0sR0FBRztBQUN6RCxZQUFNLEVBQUUsT0FBTyxPQUFPLE9BQU8sV0FBVyxPQUFPLFdBQVcsbUJBQW1CLE9BQU8sbUJBQW1CLGFBQWEsT0FBTyxhQUFhLG9CQUFvQixPQUFPLG9CQUFvQixTQUFTLE9BQU8sUUFBUTtBQUFBLElBQ2hOLFdBQVcsT0FBTyxXQUFXLFVBQVU7QUFDdEMsWUFBTSxFQUFFLE9BQU8sT0FBTztBQUFBLElBQ3ZCLE9BQU87QUFDTixZQUFNLEVBQUUsT0FBTyxHQUFHO0FBQUEsSUFDbkI7QUFHQSxVQUFNLFVBQTZDLHVCQUFPLE9BQU8sSUFBSTtBQUNyRSxRQUFJLE9BQU87QUFFWCxVQUFNLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBZ0M7QUFDMUQsVUFBSTtBQUNILFlBQUksTUFBTSxJQUFJLE1BQU0sTUFBTSxJQUFJO0FBQzlCLGNBQU0sSUFBSSxLQUFLLEVBQUUsT0FBTyxZQUFZLElBQUksT0FBTyxPQUFPLEVBQUUsQ0FBQztBQUN6RCxnQkFBUSxJQUFJLElBQUk7QUFBQSxNQUNqQixTQUFTLEdBQUc7QUFBQSxNQUVaO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLE9BQU8sV0FBVyxPQUFPLE9BQU8sTUFBTSxJQUFJLEtBQUssR0FBRyxXQUFTO0FBQ2pFLFVBQUksTUFBTSxTQUFTLFFBQVE7QUFDMUIsbUJBQVcsRUFBRSxNQUFNLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDaEMsV0FBVyxNQUFNLFNBQVMsU0FBUztBQUNsQyxZQUFJLE9BQU8sTUFBTSxTQUFTLFVBQVU7QUFDbkMscUJBQVcsWUFBWSx1QkFBdUIsTUFBTSxJQUFJLENBQUM7QUFBQSxRQUMxRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPO0FBQUEsRUFDUjtBQXZDTyxFQUFBQSxnQkFBUztBQXlDaEIsV0FBUyxZQUFZLE1BQWMsUUFBZ0Q7QUFDbEYsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUk7QUFDSixRQUFJO0FBQ0gsYUFBTyxNQUFNLElBQUk7QUFBQSxJQUNsQixTQUFTLEdBQUc7QUFBQSxJQUVaO0FBQ0EsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksVUFBVTtBQUNkLFdBQU8sZUFBZSxNQUFNLFdBQVM7QUFDcEMsVUFBSSxJQUFJLE1BQU0sS0FBSyxHQUFHO0FBQ3JCLGNBQU0sTUFBTSxTQUFTLEtBQUssT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDM0QsZUFBTyxHQUFHLElBQUk7QUFDZCxrQkFBVTtBQUNWLGVBQU87QUFBQSxNQUNSLE9BQU87QUFDTixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssVUFBVSxJQUFJO0FBQUEsRUFDM0I7QUFFTyxXQUFTLEdBQUcsT0FBMkQ7QUFDN0UsVUFBTSxTQUFTLElBQUksTUFBTSxlQUFlLE1BQU0sT0FBTyxNQUFNLGlCQUFpQjtBQUM1RSxXQUFPLFlBQVksTUFBTTtBQUN6QixXQUFPLGNBQWMsTUFBTTtBQUMzQixXQUFPLHFCQUFxQixNQUFNO0FBQ2xDLFdBQU8sVUFBVSxNQUFNLFVBQVUsSUFBSSxLQUFLLE1BQU0sT0FBTyxJQUFJO0FBQzNELFdBQU87QUFBQSxFQUNSO0FBUE8sRUFBQUEsZ0JBQVM7QUFTVCxXQUFTLFdBQVcsT0FBNEc7QUFDdEksUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sT0FBTyxVQUFVLFdBQVcsUUFBUUEsZ0JBQWUsS0FBSyxLQUFLO0FBQUEsRUFDckU7QUFMTyxFQUFBQSxnQkFBUztBQUFBLEdBbkdBO0FBMkdWLFNBQVMsNEJBQTRCLFFBQTJFO0FBQ3RILE1BQUksdUJBQXVCLE1BQU0sR0FBRztBQUNuQyxXQUFPLE9BQU8sSUFBSSxDQUFDLE1BQTBCO0FBQzVDLGFBQU87QUFBQSxRQUNOLE9BQU8sTUFBTSxLQUFLLEVBQUUsS0FBSztBQUFBLFFBQ3pCLGNBQWMsTUFBTSxRQUFRLEVBQUUsWUFBWSxJQUN2QyxlQUFlLFNBQVMsRUFBRSxZQUFZLElBQ3JDLEVBQUUsZUFBZSxlQUFlLEtBQUssRUFBRSxZQUFZLElBQUk7QUFBQTtBQUFBLFFBRTNEO0FBQUE7QUFBQSxVQUFxQyxFQUFFO0FBQUE7QUFBQSxNQUN4QztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsT0FBTztBQUNOLFdBQU8sT0FBTyxJQUFJLENBQUMsTUFBMEI7QUFDNUMsYUFBTztBQUFBLFFBQ04sT0FBTyxNQUFNLEtBQUssQ0FBQztBQUFBLE1BQ3BCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBRU8sU0FBUyxlQUFlLE9BQTBCO0FBQ3hELE1BQUksT0FBTyxVQUFVLGFBQWE7QUFDakMsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLFdBQU8sSUFBSSxLQUFLLEtBQUs7QUFBQSxFQUN0QixPQUFPO0FBQ04sV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVPLElBQVU7QUFBQSxDQUFWLENBQVVDLCtDQUFWO0FBQ0MsV0FBUyxLQUFLLFNBQTRGO0FBQ2hILFFBQUksT0FBTyxZQUFZLGFBQWE7QUFDbkMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsTUFDTixhQUFhLFFBQVE7QUFBQSxNQUNyQixpQkFBaUIsUUFBUSxrQkFBa0IsZUFBZSxRQUFRLGVBQWUsSUFBSTtBQUFBLE1BQ3JGLFFBQVEsUUFBUTtBQUFBLE1BQ2hCLGFBQXdDLFFBQVE7QUFBQSxNQUNoRCxXQUFXLFFBQVE7QUFBQSxNQUNuQixZQUFZLFFBQVE7QUFBQSxNQUNwQixnQkFBZ0IsUUFBUTtBQUFBLE1BQ3hCLE9BQWtDLFFBQVE7QUFBQSxNQUMxQyxpQkFBNEMsUUFBUTtBQUFBLE1BQ3BELFFBQVEsUUFBUTtBQUFBLE1BQ2hCLE9BQU8sUUFBUTtBQUFBLE1BQ2YsUUFBUSxRQUFRO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBbEJPLEVBQUFBLDJDQUFTO0FBQUEsR0FEQTtBQXNCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxxQ0FBVjtBQUNDLFdBQVMsS0FBSyxTQUFnRjtBQUNwRyxRQUFJLE9BQU8sWUFBWSxhQUFhO0FBQ25DLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLE1BQ04saUJBQTRDLFFBQVE7QUFBQSxNQUNwRCxTQUFTLFFBQVE7QUFBQSxNQUNqQixjQUF5QyxRQUFRO0FBQUEsTUFDakQsY0FBYyxRQUFRO0FBQUEsTUFDdEIsY0FBYyxRQUFRO0FBQUEsTUFDdEIsUUFBUSxRQUFRO0FBQUEsTUFDaEIsYUFBd0MsUUFBUTtBQUFBLE1BQ2hELGNBQWMsUUFBUTtBQUFBLE1BQ3RCLGVBQWUsUUFBUTtBQUFBLE1BQ3ZCLGFBQWEsUUFBUTtBQUFBLE1BQ3JCLGFBQWEsUUFBUTtBQUFBLE1BQ3JCLFdBQVcsUUFBUTtBQUFBLE1BQ25CLFlBQVksUUFBUTtBQUFBLE1BQ3BCLGdCQUFnQixRQUFRO0FBQUEsTUFDeEIsUUFBUSxRQUFRO0FBQUEsTUFDaEIsT0FBa0MsUUFBUTtBQUFBLE1BQzFDLFNBQVMsUUFBUTtBQUFBLE1BQ2pCLGVBQWUsUUFBUTtBQUFBLE1BQ3ZCLGdCQUFnQixRQUFRLGlCQUFpQixlQUFlLFFBQVEsY0FBYyxJQUFJO0FBQUEsTUFDbEYsZ0JBQWdCLFFBQVE7QUFBQSxNQUN4QixvQkFBK0MsUUFBUTtBQUFBLE1BQ3ZELFFBQVEsUUFBUSxTQUFTLDBDQUEwQyxLQUFLLFFBQVEsTUFBTSxJQUFJO0FBQUEsTUFDMUYsT0FBTyxRQUFRLFFBQVEsMENBQTBDLEtBQUssUUFBUSxLQUFLLElBQUk7QUFBQSxJQUN4RjtBQUFBLEVBQ0Q7QUE3Qk8sRUFBQUEsaUNBQVM7QUFBQSxHQURBO0FBaUNWLElBQVU7QUFBQSxDQUFWLENBQVVDLDZCQUFWO0FBQ0MsV0FBUyxLQUFLLE9BQThEO0FBQ2xGLFFBQUksT0FBTyxVQUFVLGFBQWE7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFDQSxZQUFRLE9BQU87QUFBQSxNQUNkLEtBQUssTUFBTSx3QkFBd0I7QUFDbEMsZUFBTyx1QkFBdUI7QUFBQSxNQUMvQixLQUFLLE1BQU0sd0JBQXdCO0FBQ2xDLGVBQU8sdUJBQXVCO0FBQUEsTUFDL0IsS0FBSyxNQUFNLHdCQUF3QjtBQUNsQyxlQUFPLHVCQUF1QjtBQUFBLE1BQy9CLEtBQUssTUFBTSx3QkFBd0I7QUFDbEMsZUFBTyx1QkFBdUI7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUFkTyxFQUFBQSx5QkFBUztBQUFBLEdBREE7QUFrQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsNkJBQVY7QUFDQyxXQUFTLEtBQUssU0FBbUU7QUFDdkYsV0FBTztBQUFBLE1BQ04sYUFBYSxRQUFRO0FBQUEsTUFDckIsZUFBZSxRQUFRLGdCQUFnQix3QkFBd0IsS0FBSyxRQUFRLGFBQWEsSUFBSTtBQUFBLE1BQzdGLG1CQUFtQixRQUFRO0FBQUEsTUFDM0IsT0FBTyxRQUFRLFFBQVEsZ0NBQWdDLEtBQUssUUFBUSxLQUFLLElBQUk7QUFBQSxNQUM3RSxNQUFNLFFBQVEsT0FBTyxnQ0FBZ0MsS0FBSyxRQUFRLElBQUksSUFBSTtBQUFBLE1BRTFFLGlCQUE0QyxRQUFRO0FBQUEsTUFDcEQsU0FBUyxRQUFRO0FBQUEsTUFDakIsY0FBeUMsUUFBUTtBQUFBLE1BQ2pELGNBQWMsUUFBUTtBQUFBLE1BQ3RCLGNBQWMsUUFBUTtBQUFBLE1BQ3RCLFFBQVEsUUFBUTtBQUFBLE1BQ2hCLGFBQXdDLFFBQVE7QUFBQSxNQUNoRCxjQUFjLFFBQVE7QUFBQSxNQUN0QixlQUFlLFFBQVE7QUFBQSxNQUN2QixhQUFhLFFBQVE7QUFBQSxNQUNyQixhQUFhLFFBQVE7QUFBQSxNQUNyQixXQUFXLFFBQVE7QUFBQSxNQUNuQixZQUFZLFFBQVE7QUFBQSxNQUNwQixnQkFBZ0IsUUFBUTtBQUFBLE1BQ3hCLFFBQVEsUUFBUTtBQUFBLE1BQ2hCLE9BQWtDLFFBQVE7QUFBQSxNQUMxQyxTQUFTLFFBQVE7QUFBQSxNQUNqQixlQUFlLFFBQVE7QUFBQSxNQUN2QixnQkFBZ0IsUUFBUSxpQkFBaUIsZUFBZSxRQUFRLGNBQWMsSUFBSTtBQUFBLE1BQ2xGLGdCQUFnQixRQUFRO0FBQUEsTUFDeEIsb0JBQStDLFFBQVE7QUFBQSxNQUN2RCxRQUFRLFFBQVEsU0FBUywwQ0FBMEMsS0FBSyxRQUFRLE1BQU0sSUFBSTtBQUFBLE1BQzFGLE9BQU8sUUFBUSxRQUFRLDBDQUEwQyxLQUFLLFFBQVEsS0FBSyxJQUFJO0FBQUEsSUFDeEY7QUFBQSxFQUNEO0FBaENPLEVBQUFBLHlCQUFTO0FBQUEsR0FEQTtBQW9DVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxjQUFWO0FBRUMsV0FBUyxLQUFLLE1BQTJDO0FBQy9ELFdBQU87QUFBQSxNQUNOLE1BQU0sS0FBSztBQUFBLE1BQ1gsS0FBSyxLQUFLLFVBQVUsVUFBVSxLQUFLLEtBQUssTUFBTTtBQUFBLE1BQzlDLE9BQU8sTUFBTSxLQUFLLEtBQUssS0FBSztBQUFBLElBQzdCO0FBQUEsRUFDRDtBQU5PLEVBQUFBLFVBQVM7QUFRVCxXQUFTLEdBQUcsTUFBMEM7QUFDNUQsVUFBTSxTQUFTLElBQUksTUFBTSxTQUFTLE1BQU0sR0FBRyxLQUFLLEtBQUssR0FBRyxLQUFLLElBQUk7QUFDakUsV0FBTyxTQUFVLE9BQU8sS0FBSyxRQUFRLGNBQWMsU0FBWSxVQUFVLEdBQUcsS0FBSyxHQUFHO0FBQ3BGLFdBQU87QUFBQSxFQUNSO0FBSk8sRUFBQUEsVUFBUztBQUFBLEdBVkE7QUFpQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsbUJBQVY7QUFPQyxXQUFTLEtBQUssT0FBNkIsYUFBOEU7QUFDL0gsVUFBTSxTQUE0QztBQUFBLE1BQ2pELE9BQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxRQUFJLGlCQUFpQixNQUFNLGVBQWU7QUFJekMsWUFBTSxXQUFXLElBQUksWUFBWTtBQUNqQyxpQkFBVyxTQUFTLE1BQU0sWUFBWSxHQUFHO0FBQ3hDLFlBQUksTUFBTSxVQUFVLE1BQU0sYUFBYSxRQUFRLElBQUksTUFBTSxNQUFNLEVBQUUsS0FBSyxNQUFNLFNBQVMsUUFBVztBQUMvRixtQkFBUyxJQUFJLE1BQU0sRUFBRTtBQUFBLFFBQ3RCO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFNBQVMsTUFBTSxZQUFZLEdBQUc7QUFFeEMsWUFBSSxNQUFNLFVBQVUsTUFBTSxhQUFhLE1BQU07QUFDNUMsY0FBSTtBQUNKLGNBQUksTUFBTSxTQUFTLFVBQVU7QUFDNUIsZ0JBQUksWUFBWSxPQUFPLE1BQU0sUUFBUSxRQUFRLEdBQUc7QUFDL0MseUJBQVcsRUFBRSxNQUFNLFVBQVUsT0FBTyxhQUFhLFNBQVMsS0FBSyxNQUFNLFFBQVEsUUFBUSxDQUFDLEVBQUU7QUFBQSxZQUN6RixPQUFPO0FBQ04seUJBQVcsRUFBRSxNQUFNLG9CQUFvQixJQUFLLE1BQU0sUUFBUSxTQUFvQyxRQUFRO0FBQUEsWUFDdkc7QUFBQSxVQUNEO0FBR0EsaUJBQU8sTUFBTSxLQUFLO0FBQUEsWUFDakIsYUFBYSxNQUFNO0FBQUEsWUFDbkIsYUFBYSxNQUFNO0FBQUEsWUFDbkIsU0FBUyxFQUFFLEdBQUcsTUFBTSxTQUFTLFNBQVM7QUFBQSxZQUN0QyxVQUFVLE1BQU07QUFBQSxVQUNqQixDQUFDO0FBQUEsUUFFRixXQUFXLE1BQU0sVUFBVSxNQUFNLGFBQWEsTUFBTTtBQUVuRCxpQkFBTyxNQUFNLEtBQUs7QUFBQSxZQUNqQixVQUFVLE1BQU07QUFBQSxZQUNoQixVQUFVLFNBQVMsS0FBSyxNQUFNLElBQUk7QUFBQSxZQUNsQyxXQUFXLENBQUMsU0FBUyxJQUFJLE1BQU0sR0FBRyxJQUFJLGFBQWEsdUJBQXVCLE1BQU0sR0FBRyxJQUFJO0FBQUEsWUFDdkYsVUFBVSxNQUFNO0FBQUEsVUFDakIsQ0FBQztBQUFBLFFBQ0YsV0FBVyxNQUFNLFVBQVUsTUFBTSxhQUFhLFNBQVM7QUFDdEQsaUJBQU8sTUFBTSxLQUFLO0FBQUEsWUFDakIsVUFBVSxNQUFNO0FBQUEsWUFDaEIsVUFBVTtBQUFBLGNBQ1QsT0FBTyxNQUFNLEtBQUssTUFBTSxLQUFLO0FBQUEsY0FDN0IsTUFBTSxNQUFNLEtBQUs7QUFBQSxjQUNqQixpQkFBaUI7QUFBQSxjQUNqQixnQkFBZ0IsTUFBTTtBQUFBLFlBQ3ZCO0FBQUEsWUFDQSxXQUFXLENBQUMsU0FBUyxJQUFJLE1BQU0sR0FBRyxJQUFJLGFBQWEsdUJBQXVCLE1BQU0sR0FBRyxJQUFJO0FBQUEsWUFDdkYsVUFBVSxNQUFNO0FBQUEsVUFDakIsQ0FBQztBQUFBLFFBRUYsV0FBVyxNQUFNLFVBQVUsTUFBTSxhQUFhLE1BQU07QUFFbkQsaUJBQU8sTUFBTSxLQUFLO0FBQUEsWUFDakIsVUFBVSxNQUFNO0FBQUEsWUFDaEIsVUFBVSxNQUFNO0FBQUEsWUFDaEIsVUFBVSxNQUFNO0FBQUEsWUFDaEIsbUJBQW1CLGFBQWEsMkJBQTJCLE1BQU0sR0FBRztBQUFBLFVBQ3JFLENBQUM7QUFBQSxRQUVGLFdBQVcsTUFBTSxVQUFVLE1BQU0sYUFBYSxhQUFhO0FBRTFELGlCQUFPLE1BQU0sS0FBSztBQUFBLFlBQ2pCLFVBQVUsTUFBTTtBQUFBLFlBQ2hCLFVBQVUsTUFBTTtBQUFBLFlBQ2hCLG1CQUFtQixhQUFhLDJCQUEyQixNQUFNLEdBQUc7QUFBQSxZQUNwRSxVQUFVO0FBQUEsY0FDVCxVQUFVLFVBQVUsYUFBYTtBQUFBLGNBQ2pDLE9BQU8sTUFBTTtBQUFBLGNBQ2IsT0FBTyxNQUFNO0FBQUEsY0FDYixPQUFPLE1BQU0sTUFBTSxJQUFJLGlCQUFpQixJQUFJO0FBQUEsWUFDN0M7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQW5GTyxFQUFBQSxlQUFTO0FBcUZULFdBQVMsR0FBRyxPQUEwQztBQUM1RCxVQUFNLFNBQVMsSUFBSSxNQUFNLGNBQWM7QUFDdkMsVUFBTSxRQUFRLElBQUksWUFBd0Q7QUFDMUUsZUFBVyxRQUFRLE1BQU0sT0FBTztBQUMvQixVQUE0QyxLQUFNLFVBQVU7QUFFM0QsY0FBTSxPQUE4QztBQUNwRCxjQUFNLE1BQU0sSUFBSSxPQUFPLEtBQUssUUFBUTtBQUNwQyxjQUFNLFFBQVEsTUFBTSxHQUFHLEtBQUssU0FBUyxLQUFLO0FBQzFDLGNBQU0sT0FBTyxLQUFLLFNBQVM7QUFDM0IsY0FBTSxZQUFZLEtBQUssU0FBUztBQUVoQyxZQUFJO0FBQ0osWUFBSSxXQUFXO0FBQ2QsOEJBQW9CLE1BQU0sZ0JBQWdCLFFBQVEsT0FBTyxJQUFJLE1BQU0sY0FBYyxJQUFJLENBQUM7QUFBQSxRQUN2RixPQUFPO0FBQ04sOEJBQW9CLE1BQU0sU0FBUyxRQUFRLE9BQU8sSUFBSTtBQUFBLFFBQ3ZEO0FBRUEsY0FBTSxRQUFRLE1BQU0sSUFBSSxHQUFHO0FBQzNCLFlBQUksQ0FBQyxPQUFPO0FBQ1gsZ0JBQU0sSUFBSSxLQUFLLENBQUMsaUJBQWlCLENBQUM7QUFBQSxRQUNuQyxPQUFPO0FBQ04sZ0JBQU0sS0FBSyxpQkFBaUI7QUFBQSxRQUM3QjtBQUFBLE1BRUQsT0FBTztBQUNOLGVBQU87QUFBQSxVQUNOLElBQUksT0FBK0MsS0FBTSxXQUFZO0FBQUEsVUFDckUsSUFBSSxPQUErQyxLQUFNLFdBQVk7QUFBQSxVQUM3QixLQUFNO0FBQUEsUUFDL0M7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLGVBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPO0FBQ2pDLGFBQU8sSUFBSSxLQUFLLEtBQUs7QUFBQSxJQUN0QjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBdkNPLEVBQUFBLGVBQVM7QUFBQSxHQTVGQTtBQXVJVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxnQkFBVjtBQUVOLFFBQU0sZUFBeUQsdUJBQU8sT0FBTyxJQUFJO0FBQ2pGLGVBQWEsTUFBTSxXQUFXLElBQUksSUFBSSxVQUFVLFdBQVc7QUFDM0QsZUFBYSxNQUFNLFdBQVcsTUFBTSxJQUFJLFVBQVUsV0FBVztBQUM3RCxlQUFhLE1BQU0sV0FBVyxTQUFTLElBQUksVUFBVSxXQUFXO0FBQ2hFLGVBQWEsTUFBTSxXQUFXLE9BQU8sSUFBSSxVQUFVLFdBQVc7QUFDOUQsZUFBYSxNQUFNLFdBQVcsS0FBSyxJQUFJLFVBQVUsV0FBVztBQUM1RCxlQUFhLE1BQU0sV0FBVyxNQUFNLElBQUksVUFBVSxXQUFXO0FBQzdELGVBQWEsTUFBTSxXQUFXLFFBQVEsSUFBSSxVQUFVLFdBQVc7QUFDL0QsZUFBYSxNQUFNLFdBQVcsS0FBSyxJQUFJLFVBQVUsV0FBVztBQUM1RCxlQUFhLE1BQU0sV0FBVyxXQUFXLElBQUksVUFBVSxXQUFXO0FBQ2xFLGVBQWEsTUFBTSxXQUFXLElBQUksSUFBSSxVQUFVLFdBQVc7QUFDM0QsZUFBYSxNQUFNLFdBQVcsU0FBUyxJQUFJLFVBQVUsV0FBVztBQUNoRSxlQUFhLE1BQU0sV0FBVyxRQUFRLElBQUksVUFBVSxXQUFXO0FBQy9ELGVBQWEsTUFBTSxXQUFXLFFBQVEsSUFBSSxVQUFVLFdBQVc7QUFDL0QsZUFBYSxNQUFNLFdBQVcsUUFBUSxJQUFJLFVBQVUsV0FBVztBQUMvRCxlQUFhLE1BQU0sV0FBVyxNQUFNLElBQUksVUFBVSxXQUFXO0FBQzdELGVBQWEsTUFBTSxXQUFXLE1BQU0sSUFBSSxVQUFVLFdBQVc7QUFDN0QsZUFBYSxNQUFNLFdBQVcsT0FBTyxJQUFJLFVBQVUsV0FBVztBQUM5RCxlQUFhLE1BQU0sV0FBVyxLQUFLLElBQUksVUFBVSxXQUFXO0FBQzVELGVBQWEsTUFBTSxXQUFXLE1BQU0sSUFBSSxVQUFVLFdBQVc7QUFDN0QsZUFBYSxNQUFNLFdBQVcsR0FBRyxJQUFJLFVBQVUsV0FBVztBQUMxRCxlQUFhLE1BQU0sV0FBVyxJQUFJLElBQUksVUFBVSxXQUFXO0FBQzNELGVBQWEsTUFBTSxXQUFXLFVBQVUsSUFBSSxVQUFVLFdBQVc7QUFDakUsZUFBYSxNQUFNLFdBQVcsTUFBTSxJQUFJLFVBQVUsV0FBVztBQUM3RCxlQUFhLE1BQU0sV0FBVyxLQUFLLElBQUksVUFBVSxXQUFXO0FBQzVELGVBQWEsTUFBTSxXQUFXLFFBQVEsSUFBSSxVQUFVLFdBQVc7QUFDL0QsZUFBYSxNQUFNLFdBQVcsYUFBYSxJQUFJLFVBQVUsV0FBVztBQUU3RCxXQUFTLEtBQUssTUFBK0M7QUFDbkUsV0FBTyxPQUFPLGFBQWEsSUFBSSxNQUFNLFdBQVcsYUFBYSxJQUFJLElBQUksVUFBVSxXQUFXO0FBQUEsRUFDM0Y7QUFGTyxFQUFBQSxZQUFTO0FBSVQsV0FBUyxHQUFHLE1BQStDO0FBQ2pFLGVBQVcsS0FBSyxjQUFjO0FBQzdCLFVBQUksYUFBYSxDQUFDLE1BQU0sTUFBTTtBQUM3QixlQUFPLE9BQU8sQ0FBQztBQUFBLE1BQ2hCO0FBQUEsSUFDRDtBQUNBLFdBQU8sTUFBTSxXQUFXO0FBQUEsRUFDekI7QUFQTyxFQUFBQSxZQUFTO0FBQUEsR0FsQ0E7QUE0Q1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsZUFBVjtBQUVDLFdBQVMsS0FBSyxNQUE0QztBQUNoRSxZQUFRLE1BQU07QUFBQSxNQUNiLEtBQUssTUFBTSxVQUFVO0FBQVksZUFBTyxVQUFVLFVBQVU7QUFBQSxJQUM3RDtBQUFBLEVBQ0Q7QUFKTyxFQUFBQSxXQUFTO0FBTVQsV0FBUyxHQUFHLE1BQTRDO0FBQzlELFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSyxVQUFVLFVBQVU7QUFBWSxlQUFPLE1BQU0sVUFBVTtBQUFBLElBQzdEO0FBQUEsRUFDRDtBQUpPLEVBQUFBLFdBQVM7QUFBQSxHQVJBO0FBZVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMscUJBQVY7QUFDQyxXQUFTLEtBQUssTUFBeUQ7QUFDN0UsV0FBTztBQUFBLE1BQ04sTUFBTSxLQUFLO0FBQUEsTUFDWCxNQUFNLFdBQVcsS0FBSyxLQUFLLElBQUk7QUFBQSxNQUMvQixNQUFNLEtBQUssUUFBUSxLQUFLLEtBQUssSUFBSSxVQUFVLElBQUk7QUFBQSxNQUMvQyxlQUFlLEtBQUs7QUFBQSxNQUNwQixVQUFVLFNBQVMsS0FBSyxLQUFLLFFBQVE7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFSTyxFQUFBQSxpQkFBUztBQVNULFdBQVMsR0FBRyxNQUF3RDtBQUMxRSxVQUFNLFNBQVMsSUFBSSxNQUFNO0FBQUEsTUFDeEIsS0FBSztBQUFBLE1BQ0wsV0FBVyxHQUFHLEtBQUssSUFBSTtBQUFBLE1BQ3ZCLEtBQUs7QUFBQSxNQUNMLFNBQVMsR0FBRyxLQUFLLFFBQVE7QUFBQSxJQUMxQjtBQUNBLFdBQU8sT0FBTyxLQUFLLFFBQVEsS0FBSyxLQUFLLElBQUksVUFBVSxFQUFFO0FBQ3JELFdBQU87QUFBQSxFQUNSO0FBVE8sRUFBQUEsaUJBQVM7QUFBQSxHQVZBO0FBc0JWLElBQVU7QUFBQSxDQUFWLENBQVVDLG9CQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQXVEO0FBQzNFLFVBQU0sU0FBbUM7QUFBQSxNQUN4QyxNQUFNLEtBQUssUUFBUTtBQUFBLE1BQ25CLFFBQVEsS0FBSztBQUFBLE1BQ2IsT0FBTyxNQUFNLEtBQUssS0FBSyxLQUFLO0FBQUEsTUFDNUIsZ0JBQWdCLE1BQU0sS0FBSyxLQUFLLGNBQWM7QUFBQSxNQUM5QyxNQUFNLFdBQVcsS0FBSyxLQUFLLElBQUk7QUFBQSxNQUMvQixNQUFNLEtBQUssTUFBTSxJQUFJLFVBQVUsSUFBSSxLQUFLLENBQUM7QUFBQSxJQUMxQztBQUNBLFFBQUksS0FBSyxVQUFVO0FBQ2xCLGFBQU8sV0FBVyxLQUFLLFNBQVMsSUFBSSxJQUFJO0FBQUEsSUFDekM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQWJPLEVBQUFBLGdCQUFTO0FBY1QsV0FBUyxHQUFHLE1BQXVEO0FBQ3pFLFVBQU0sU0FBUyxJQUFJLE1BQU07QUFBQSxNQUN4QixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxXQUFXLEdBQUcsS0FBSyxJQUFJO0FBQUEsTUFDdkIsTUFBTSxHQUFHLEtBQUssS0FBSztBQUFBLE1BQ25CLE1BQU0sR0FBRyxLQUFLLGNBQWM7QUFBQSxJQUM3QjtBQUNBLFFBQUksZ0JBQWdCLEtBQUssSUFBSSxHQUFHO0FBQy9CLGFBQU8sT0FBTyxLQUFLLEtBQUssSUFBSSxVQUFVLEVBQUU7QUFBQSxJQUN6QztBQUNBLFFBQUksS0FBSyxVQUFVO0FBRWxCLGFBQU8sV0FBVyxLQUFLLFNBQVMsSUFBSSxFQUFFO0FBQUEsSUFDdkM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQWhCTyxFQUFBQSxnQkFBUztBQUFBLEdBZkE7QUFrQ1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsdUJBQVY7QUFFQyxXQUFTLEdBQUcsTUFBc0U7QUFDeEYsVUFBTSxTQUFTLElBQUksTUFBTTtBQUFBLE1BQ3hCLFdBQVcsR0FBRyxLQUFLLElBQUk7QUFBQSxNQUN2QixLQUFLO0FBQUEsTUFDTCxLQUFLLFVBQVU7QUFBQSxNQUNmLElBQUksT0FBTyxLQUFLLEdBQUc7QUFBQSxNQUNuQixNQUFNLEdBQUcsS0FBSyxLQUFLO0FBQUEsTUFDbkIsTUFBTSxHQUFHLEtBQUssY0FBYztBQUFBLElBQzdCO0FBRUEsV0FBTyxhQUFhLEtBQUs7QUFDekIsV0FBTyxVQUFVLEtBQUs7QUFFdEIsV0FBTztBQUFBLEVBQ1I7QUFkTyxFQUFBQSxtQkFBUztBQWdCVCxXQUFTLEtBQUssTUFBZ0MsV0FBb0IsUUFBd0Q7QUFFaEksZ0JBQVksYUFBdUMsS0FBTTtBQUN6RCxhQUFTLFVBQW9DLEtBQU07QUFFbkQsUUFBSSxjQUFjLFVBQWEsV0FBVyxRQUFXO0FBQ3BELFlBQU0sSUFBSSxNQUFNLGNBQWM7QUFBQSxJQUMvQjtBQUVBLFdBQU87QUFBQSxNQUNOLFlBQVk7QUFBQSxNQUNaLFNBQVM7QUFBQSxNQUNULE1BQU0sS0FBSztBQUFBLE1BQ1gsUUFBUSxLQUFLO0FBQUEsTUFDYixNQUFNLFdBQVcsS0FBSyxLQUFLLElBQUk7QUFBQSxNQUMvQixLQUFLLEtBQUs7QUFBQSxNQUNWLE9BQU8sTUFBTSxLQUFLLEtBQUssS0FBSztBQUFBLE1BQzVCLGdCQUFnQixNQUFNLEtBQUssS0FBSyxjQUFjO0FBQUEsTUFDOUMsTUFBTSxLQUFLLE1BQU0sSUFBSSxVQUFVLElBQUk7QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFwQk8sRUFBQUEsbUJBQVM7QUFBQSxHQWxCQTtBQXlDVixJQUFVO0FBQUEsQ0FBVixDQUFVQywrQkFBVjtBQUVDLFdBQVMsR0FBRyxNQUF5RTtBQUMzRixXQUFPLElBQUksTUFBTTtBQUFBLE1BQ2hCLGtCQUFrQixHQUFHLEtBQUssSUFBSTtBQUFBLE1BQzlCLEtBQUssV0FBVyxJQUFJLE9BQUssTUFBTSxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQUxPLEVBQUFBLDJCQUFTO0FBQUEsR0FGQTtBQVVWLElBQVU7QUFBQSxDQUFWLENBQVVDLCtCQUFWO0FBRUMsV0FBUyxHQUFHLE1BQXlFO0FBQzNGLFdBQU8sSUFBSSxNQUFNO0FBQUEsTUFDaEIsa0JBQWtCLEdBQUcsS0FBSyxFQUFFO0FBQUEsTUFDNUIsS0FBSyxXQUFXLElBQUksT0FBSyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBTE8sRUFBQUEsMkJBQVM7QUFBQSxHQUZBO0FBV1YsSUFBVTtBQUFBLENBQVYsQ0FBVXZCLGNBQVY7QUFDQyxXQUFTLEtBQUssT0FBNEM7QUFDaEUsV0FBTztBQUFBLE1BQ04sT0FBTyxNQUFNLFNBQVMsTUFBTSxLQUFLLE1BQU0sS0FBSztBQUFBLE1BQzVDLEtBQUssTUFBTTtBQUFBLElBQ1o7QUFBQSxFQUNEO0FBTE8sRUFBQUEsVUFBUztBQU9ULFdBQVMsR0FBRyxPQUFxRDtBQUN2RSxXQUFPLElBQUksTUFBTSxTQUFTLElBQUksT0FBTyxNQUFNLEdBQUcsR0FBRyxNQUFNLEdBQUcsTUFBTSxLQUFLLENBQUM7QUFBQSxFQUN2RTtBQUZPLEVBQUFBLFVBQVM7QUFBQSxHQVJBO0FBYVYsSUFBVTtBQUFBLENBQVYsQ0FBVXdCLG9CQUFWO0FBQ0MsV0FBUyxLQUFLLE9BQXdFO0FBQzVGLFVBQU0saUJBQXdDO0FBQzlDLFVBQU14QixZQUE0QjtBQUNsQyxXQUFPO0FBQUEsTUFDTixzQkFBc0IsZUFBZSx1QkFDbEMsTUFBTSxLQUFLLGVBQWUsb0JBQW9CLElBQzlDO0FBQUEsTUFDSCxLQUFLLGVBQWUsWUFBWSxlQUFlLFlBQVlBLFVBQVM7QUFBQSxNQUNwRSxPQUFPLE1BQU0sS0FBSyxlQUFlLGNBQWMsZUFBZSxjQUFjQSxVQUFTLEtBQUs7QUFBQSxNQUMxRixzQkFBc0IsZUFBZSx1QkFDbEMsTUFBTSxLQUFLLGVBQWUsb0JBQW9CLElBQzlDO0FBQUEsSUFDSjtBQUFBLEVBQ0Q7QUFiTyxFQUFBd0IsZ0JBQVM7QUFjVCxXQUFTLEdBQUcsT0FBOEQ7QUFDaEYsV0FBTztBQUFBLE1BQ04sV0FBVyxJQUFJLE9BQU8sTUFBTSxHQUFHO0FBQUEsTUFDL0IsYUFBYSxNQUFNLEdBQUcsTUFBTSxLQUFLO0FBQUEsTUFDakMsc0JBQXNCLE1BQU0sdUJBQ3pCLE1BQU0sR0FBRyxNQUFNLG9CQUFvQixJQUNuQztBQUFBLE1BQ0gsc0JBQXNCLE1BQU0sdUJBQ3pCLE1BQU0sR0FBRyxNQUFNLG9CQUFvQixJQUNuQztBQUFBLElBQ0o7QUFBQSxFQUNEO0FBWE8sRUFBQUEsZ0JBQVM7QUFBQSxHQWZBO0FBNkJWLElBQVU7QUFBQSxDQUFWLENBQVVDLFdBQVY7QUFDQyxXQUFTLEtBQUssT0FBNkM7QUFDakUsVUFBTSxpQkFBa0M7QUFBQSxNQUN2QyxPQUFPLE1BQU0sS0FBSyxNQUFNLEtBQUs7QUFBQSxNQUM3QixVQUFVLGVBQWUsU0FBUyxNQUFNLFFBQVE7QUFBQSxNQUNoRCxzQkFBc0IsTUFBTTtBQUFBLE1BQzVCLHNCQUFzQixNQUFNO0FBQUEsSUFDN0I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQVJPLEVBQUFBLE9BQVM7QUFVVCxXQUFTLEdBQUcsTUFBMkM7QUFDN0QsVUFBTSxXQUFXLEtBQUssU0FBUyxJQUFJLGVBQWUsRUFBRTtBQUNwRCxVQUFNLFFBQVEsTUFBTSxHQUFHLEtBQUssS0FBSztBQUNqQyxVQUFNLHVCQUF1QixLQUFLO0FBQ2xDLFVBQU0sdUJBQXVCLEtBQUs7QUFDbEMsV0FBTyxJQUFJLE1BQU0sYUFBYSxVQUFVLE9BQU8sc0JBQXNCLG9CQUFvQjtBQUFBLEVBQzFGO0FBTk8sRUFBQUEsT0FBUztBQUFBLEdBWEE7QUFvQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsMkJBQVY7QUFDQyxXQUFTLEtBQUssWUFBMkU7QUFDL0YsV0FBTztBQUFBLE1BQ04sT0FBTyxNQUFNLEtBQUssV0FBVyxLQUFLO0FBQUEsTUFDbEMsWUFBWSxXQUFXO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBTE8sRUFBQUEsdUJBQVM7QUFPVCxXQUFTLEdBQUcsTUFBb0U7QUFDdEYsV0FBTyxJQUFJLE1BQU0sc0JBQXNCLE1BQU0sR0FBRyxLQUFLLEtBQUssR0FBRyxLQUFLLFVBQVU7QUFBQSxFQUM3RTtBQUZPLEVBQUFBLHVCQUFTO0FBQUEsR0FSQTtBQWFWLElBQVU7QUFBQSxDQUFWLENBQVVDLGlCQUFWO0FBQ0MsV0FBUyxLQUFLLGFBQXdEO0FBQzVFLFFBQUksdUJBQXVCLE1BQU0saUJBQWlCO0FBQ2pELGFBQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLE9BQU8sTUFBTSxLQUFLLFlBQVksS0FBSztBQUFBLFFBQ25DLE1BQU0sWUFBWTtBQUFBLE1BQ25CO0FBQUEsSUFDRCxXQUFXLHVCQUF1QixNQUFNLDJCQUEyQjtBQUNsRSxhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixPQUFPLE1BQU0sS0FBSyxZQUFZLEtBQUs7QUFBQSxRQUNuQyxjQUFjLFlBQVk7QUFBQSxRQUMxQixxQkFBcUIsWUFBWTtBQUFBLE1BQ2xDO0FBQUEsSUFDRCxXQUFXLHVCQUF1QixNQUFNLGtDQUFrQztBQUN6RSxhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixPQUFPLE1BQU0sS0FBSyxZQUFZLEtBQUs7QUFBQSxRQUNuQyxZQUFZLFlBQVk7QUFBQSxNQUN6QjtBQUFBLElBQ0QsT0FBTztBQUNOLFlBQU0sSUFBSSxNQUFNLDRCQUE0QjtBQUFBLElBQzdDO0FBQUEsRUFDRDtBQXZCTyxFQUFBQSxhQUFTO0FBeUJULFdBQVMsR0FBRyxhQUF3RDtBQUMxRSxZQUFRLFlBQVksTUFBTTtBQUFBLE1BQ3pCLEtBQUs7QUFDSixlQUFPO0FBQUEsVUFDTixPQUFPLE1BQU0sR0FBRyxZQUFZLEtBQUs7QUFBQSxVQUNqQyxNQUFNLFlBQVk7QUFBQSxRQUNuQjtBQUFBLE1BQ0QsS0FBSztBQUNKLGVBQU87QUFBQSxVQUNOLE9BQU8sTUFBTSxHQUFHLFlBQVksS0FBSztBQUFBLFVBQ2pDLGNBQWMsWUFBWTtBQUFBLFVBQzFCLHFCQUFxQixZQUFZO0FBQUEsUUFDbEM7QUFBQSxNQUNELEtBQUs7QUFDSixlQUFPO0FBQUEsVUFDTixPQUFPLE1BQU0sR0FBRyxZQUFZLEtBQUs7QUFBQSxVQUNqQyxZQUFZLFlBQVk7QUFBQSxRQUN6QjtBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBbkJPLEVBQUFBLGFBQVM7QUFBQSxHQTFCQTtBQWdEVixJQUFVO0FBQUEsQ0FBVixDQUFVQyx3QkFBVjtBQUNDLFdBQVMsS0FBSyxvQkFBdUY7QUFDM0csV0FBTztBQUFBLE1BQ04sU0FBUyxtQkFBbUI7QUFBQSxNQUM1QixpQkFBaUIsTUFBTSxLQUFLLG1CQUFtQixlQUFlO0FBQUEsSUFDL0Q7QUFBQSxFQUNEO0FBTE8sRUFBQUEsb0JBQVM7QUFPVCxXQUFTLEdBQUcsb0JBQXNGO0FBQ3hHLFdBQU8sSUFBSSxNQUFNLG1CQUFtQixtQkFBbUIsU0FBUyxNQUFNLEdBQUcsbUJBQW1CLGVBQWUsQ0FBQztBQUFBLEVBQzdHO0FBRk8sRUFBQUEsb0JBQVM7QUFBQSxHQVJBO0FBYVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsdUJBQVY7QUFDQyxXQUFTLEtBQUssbUJBQTBFO0FBQzlGLFdBQU87QUFBQSxNQUNOLE9BQU8sTUFBTSxLQUFLLGtCQUFrQixLQUFLO0FBQUEsTUFDekMsTUFBTSxrQkFBa0I7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFMTyxFQUFBQSxtQkFBUztBQU1ULFdBQVMsR0FBRyxZQUFrRTtBQUNwRixXQUFPLElBQUksTUFBTSxrQkFBa0IsTUFBTSxHQUFHLFdBQVcsS0FBSyxHQUFHLFdBQVcsSUFBSTtBQUFBLEVBQy9FO0FBRk8sRUFBQUEsbUJBQVM7QUFBQSxHQVBBO0FBWVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsNEJBQVY7QUFDQyxXQUFTLEtBQUssd0JBQXlGO0FBQzdHLFdBQU87QUFBQSxNQUNOLEtBQUssdUJBQXVCO0FBQUEsTUFDNUIsWUFBWSx1QkFBdUIsV0FBVyxJQUFJLGtCQUFrQixJQUFJO0FBQUEsSUFDekU7QUFBQSxFQUNEO0FBTE8sRUFBQUEsd0JBQVM7QUFPVCxXQUFTLEdBQUcsd0JBQXdGO0FBQzFHLFdBQU8sSUFBSSxNQUFNLHVCQUF1QixJQUFJLE9BQU8sdUJBQXVCLEdBQUcsR0FBRyx1QkFBdUIsV0FBVyxJQUFJLGtCQUFrQixFQUFFLENBQUM7QUFBQSxFQUM1STtBQUZPLEVBQUFBLHdCQUFTO0FBQUEsR0FSQTtBQWFWLElBQVU7QUFBQSxDQUFWLENBQVVDLDJCQUFWO0FBQ0MsV0FBUyxHQUFHLE1BQXVDO0FBQ3pELFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSyxVQUFVLHNCQUFzQjtBQUNwQyxlQUFPLE1BQU0sc0JBQXNCO0FBQUEsTUFDcEMsS0FBSyxVQUFVLHNCQUFzQjtBQUNwQyxlQUFPLE1BQU0sc0JBQXNCO0FBQUEsTUFDcEMsS0FBSyxVQUFVLHNCQUFzQjtBQUFBLE1BQ3JDO0FBQ0MsZUFBTyxNQUFNLHNCQUFzQjtBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQVZPLEVBQUFBLHVCQUFTO0FBQUEsR0FEQTtBQWNWLElBQVU7QUFBQSxDQUFWLENBQVVDLHVCQUFWO0FBQ0MsV0FBUyxHQUFHLFNBQStEO0FBQ2pGLFdBQU87QUFBQSxNQUNOLGFBQWEsc0JBQXNCLEdBQUcsUUFBUSxXQUFXO0FBQUEsTUFDekQsa0JBQWtCLFFBQVE7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFMTyxFQUFBQSxtQkFBUztBQUFBLEdBREE7QUFTVixJQUFVO0FBQUEsQ0FBVixDQUFVQyx1QkFBVjtBQUVDLFdBQVMsS0FBSyxNQUE0RDtBQUNoRixZQUFRLE1BQU07QUFBQSxNQUNiLEtBQUssTUFBTSxrQkFBa0I7QUFBWSxlQUFPLFVBQVUsa0JBQWtCO0FBQUEsSUFDN0U7QUFBQSxFQUNEO0FBSk8sRUFBQUEsbUJBQVM7QUFNVCxXQUFTLEdBQUcsTUFBNEQ7QUFDOUUsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLLFVBQVUsa0JBQWtCO0FBQVksZUFBTyxNQUFNLGtCQUFrQjtBQUFBLElBQzdFO0FBQUEsRUFDRDtBQUpPLEVBQUFBLG1CQUFTO0FBQUEsR0FSQTtBQWVWLElBQVU7QUFBQSxDQUFWLENBQVVDLHVCQUFWO0FBQ0MsV0FBUyxLQUFLLEdBQXlFLFdBQThCLGFBQW1HO0FBQzlOLFFBQUksVUFBVSxLQUFLLGFBQWEsR0FBRztBQUNsQyxhQUFPO0FBQUEsUUFDTixTQUFTLFVBQVUsV0FBVyxFQUFFLFNBQVMsV0FBVztBQUFBLFFBQ3BELE1BQU0sU0FBUyxjQUFjLEVBQUUsSUFBSTtBQUFBLE1BQ3BDO0FBQUEsSUFDRDtBQUNBLFdBQU8sRUFBRSxTQUFTLFVBQVUsV0FBVyxHQUFHLFdBQVcsRUFBRTtBQUFBLEVBQ3hEO0FBUk8sRUFBQUEsbUJBQVM7QUFBQSxHQURBO0FBWVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsd0JBQVY7QUFFTixRQUFNLFFBQVEsb0JBQUksSUFBNEQ7QUFBQSxJQUM3RSxDQUFDLE1BQU0sbUJBQW1CLFFBQVEsVUFBVSxtQkFBbUIsTUFBTTtBQUFBLElBQ3JFLENBQUMsTUFBTSxtQkFBbUIsVUFBVSxVQUFVLG1CQUFtQixRQUFRO0FBQUEsSUFDekUsQ0FBQyxNQUFNLG1CQUFtQixhQUFhLFVBQVUsbUJBQW1CLFdBQVc7QUFBQSxJQUMvRSxDQUFDLE1BQU0sbUJBQW1CLE9BQU8sVUFBVSxtQkFBbUIsS0FBSztBQUFBLElBQ25FLENBQUMsTUFBTSxtQkFBbUIsVUFBVSxVQUFVLG1CQUFtQixRQUFRO0FBQUEsSUFDekUsQ0FBQyxNQUFNLG1CQUFtQixPQUFPLFVBQVUsbUJBQW1CLEtBQUs7QUFBQSxJQUNuRSxDQUFDLE1BQU0sbUJBQW1CLFdBQVcsVUFBVSxtQkFBbUIsU0FBUztBQUFBLElBQzNFLENBQUMsTUFBTSxtQkFBbUIsUUFBUSxVQUFVLG1CQUFtQixNQUFNO0FBQUEsSUFDckUsQ0FBQyxNQUFNLG1CQUFtQixRQUFRLFVBQVUsbUJBQW1CLE1BQU07QUFBQSxJQUNyRSxDQUFDLE1BQU0sbUJBQW1CLFVBQVUsVUFBVSxtQkFBbUIsUUFBUTtBQUFBLElBQ3pFLENBQUMsTUFBTSxtQkFBbUIsTUFBTSxVQUFVLG1CQUFtQixJQUFJO0FBQUEsSUFDakUsQ0FBQyxNQUFNLG1CQUFtQixPQUFPLFVBQVUsbUJBQW1CLEtBQUs7QUFBQSxJQUNuRSxDQUFDLE1BQU0sbUJBQW1CLFVBQVUsVUFBVSxtQkFBbUIsUUFBUTtBQUFBLElBQ3pFLENBQUMsTUFBTSxtQkFBbUIsTUFBTSxVQUFVLG1CQUFtQixJQUFJO0FBQUEsSUFDakUsQ0FBQyxNQUFNLG1CQUFtQixZQUFZLFVBQVUsbUJBQW1CLFVBQVU7QUFBQSxJQUM3RSxDQUFDLE1BQU0sbUJBQW1CLFNBQVMsVUFBVSxtQkFBbUIsT0FBTztBQUFBLElBQ3ZFLENBQUMsTUFBTSxtQkFBbUIsU0FBUyxVQUFVLG1CQUFtQixPQUFPO0FBQUEsSUFDdkUsQ0FBQyxNQUFNLG1CQUFtQixNQUFNLFVBQVUsbUJBQW1CLElBQUk7QUFBQSxJQUNqRSxDQUFDLE1BQU0sbUJBQW1CLE9BQU8sVUFBVSxtQkFBbUIsS0FBSztBQUFBLElBQ25FLENBQUMsTUFBTSxtQkFBbUIsTUFBTSxVQUFVLG1CQUFtQixJQUFJO0FBQUEsSUFDakUsQ0FBQyxNQUFNLG1CQUFtQixXQUFXLFVBQVUsbUJBQW1CLFNBQVM7QUFBQSxJQUMzRSxDQUFDLE1BQU0sbUJBQW1CLFFBQVEsVUFBVSxtQkFBbUIsTUFBTTtBQUFBLElBQ3JFLENBQUMsTUFBTSxtQkFBbUIsT0FBTyxVQUFVLG1CQUFtQixLQUFLO0FBQUEsSUFDbkUsQ0FBQyxNQUFNLG1CQUFtQixVQUFVLFVBQVUsbUJBQW1CLFFBQVE7QUFBQSxJQUN6RSxDQUFDLE1BQU0sbUJBQW1CLGVBQWUsVUFBVSxtQkFBbUIsYUFBYTtBQUFBLElBQ25GLENBQUMsTUFBTSxtQkFBbUIsT0FBTyxVQUFVLG1CQUFtQixLQUFLO0FBQUEsSUFDbkUsQ0FBQyxNQUFNLG1CQUFtQixNQUFNLFVBQVUsbUJBQW1CLElBQUk7QUFBQSxFQUNsRSxDQUFDO0FBRU0sV0FBUyxLQUFLLE1BQThEO0FBQ2xGLFdBQU8sTUFBTSxJQUFJLElBQUksS0FBSyxVQUFVLG1CQUFtQjtBQUFBLEVBQ3hEO0FBRk8sRUFBQUEsb0JBQVM7QUFJaEIsUUFBTSxNQUFNLG9CQUFJLElBQTREO0FBQUEsSUFDM0UsQ0FBQyxVQUFVLG1CQUFtQixRQUFRLE1BQU0sbUJBQW1CLE1BQU07QUFBQSxJQUNyRSxDQUFDLFVBQVUsbUJBQW1CLFVBQVUsTUFBTSxtQkFBbUIsUUFBUTtBQUFBLElBQ3pFLENBQUMsVUFBVSxtQkFBbUIsYUFBYSxNQUFNLG1CQUFtQixXQUFXO0FBQUEsSUFDL0UsQ0FBQyxVQUFVLG1CQUFtQixPQUFPLE1BQU0sbUJBQW1CLEtBQUs7QUFBQSxJQUNuRSxDQUFDLFVBQVUsbUJBQW1CLFVBQVUsTUFBTSxtQkFBbUIsUUFBUTtBQUFBLElBQ3pFLENBQUMsVUFBVSxtQkFBbUIsT0FBTyxNQUFNLG1CQUFtQixLQUFLO0FBQUEsSUFDbkUsQ0FBQyxVQUFVLG1CQUFtQixXQUFXLE1BQU0sbUJBQW1CLFNBQVM7QUFBQSxJQUMzRSxDQUFDLFVBQVUsbUJBQW1CLFFBQVEsTUFBTSxtQkFBbUIsTUFBTTtBQUFBLElBQ3JFLENBQUMsVUFBVSxtQkFBbUIsUUFBUSxNQUFNLG1CQUFtQixNQUFNO0FBQUEsSUFDckUsQ0FBQyxVQUFVLG1CQUFtQixVQUFVLE1BQU0sbUJBQW1CLFFBQVE7QUFBQSxJQUN6RSxDQUFDLFVBQVUsbUJBQW1CLE1BQU0sTUFBTSxtQkFBbUIsSUFBSTtBQUFBLElBQ2pFLENBQUMsVUFBVSxtQkFBbUIsT0FBTyxNQUFNLG1CQUFtQixLQUFLO0FBQUEsSUFDbkUsQ0FBQyxVQUFVLG1CQUFtQixVQUFVLE1BQU0sbUJBQW1CLFFBQVE7QUFBQSxJQUN6RSxDQUFDLFVBQVUsbUJBQW1CLE1BQU0sTUFBTSxtQkFBbUIsSUFBSTtBQUFBLElBQ2pFLENBQUMsVUFBVSxtQkFBbUIsWUFBWSxNQUFNLG1CQUFtQixVQUFVO0FBQUEsSUFDN0UsQ0FBQyxVQUFVLG1CQUFtQixTQUFTLE1BQU0sbUJBQW1CLE9BQU87QUFBQSxJQUN2RSxDQUFDLFVBQVUsbUJBQW1CLFNBQVMsTUFBTSxtQkFBbUIsT0FBTztBQUFBLElBQ3ZFLENBQUMsVUFBVSxtQkFBbUIsTUFBTSxNQUFNLG1CQUFtQixJQUFJO0FBQUEsSUFDakUsQ0FBQyxVQUFVLG1CQUFtQixPQUFPLE1BQU0sbUJBQW1CLEtBQUs7QUFBQSxJQUNuRSxDQUFDLFVBQVUsbUJBQW1CLE1BQU0sTUFBTSxtQkFBbUIsSUFBSTtBQUFBLElBQ2pFLENBQUMsVUFBVSxtQkFBbUIsV0FBVyxNQUFNLG1CQUFtQixTQUFTO0FBQUEsSUFDM0UsQ0FBQyxVQUFVLG1CQUFtQixRQUFRLE1BQU0sbUJBQW1CLE1BQU07QUFBQSxJQUNyRSxDQUFDLFVBQVUsbUJBQW1CLE9BQU8sTUFBTSxtQkFBbUIsS0FBSztBQUFBLElBQ25FLENBQUMsVUFBVSxtQkFBbUIsVUFBVSxNQUFNLG1CQUFtQixRQUFRO0FBQUEsSUFDekUsQ0FBQyxVQUFVLG1CQUFtQixlQUFlLE1BQU0sbUJBQW1CLGFBQWE7QUFBQSxJQUNuRixDQUFDLFVBQVUsbUJBQW1CLE1BQU0sTUFBTSxtQkFBbUIsSUFBSTtBQUFBLElBQ2pFLENBQUMsVUFBVSxtQkFBbUIsT0FBTyxNQUFNLG1CQUFtQixLQUFLO0FBQUEsRUFDcEUsQ0FBQztBQUVNLFdBQVMsR0FBRyxNQUE4RDtBQUNoRixXQUFPLElBQUksSUFBSSxJQUFJLEtBQUssTUFBTSxtQkFBbUI7QUFBQSxFQUNsRDtBQUZPLEVBQUFBLG9CQUFTO0FBQUEsR0FsRUE7QUF1RVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsb0JBQVY7QUFFQyxXQUFTLEdBQUcsWUFBc0MsV0FBOEQ7QUFFdEgsVUFBTSxTQUFTLElBQUksTUFBTSxlQUFlLFdBQVcsS0FBSztBQUN4RCxXQUFPLGFBQWEsV0FBVztBQUMvQixXQUFPLE9BQU8sbUJBQW1CLEdBQUcsV0FBVyxJQUFJO0FBQ25ELFdBQU8sT0FBTyxXQUFXLE1BQU0sSUFBSSxrQkFBa0IsRUFBRTtBQUN2RCxXQUFPLFNBQVMsV0FBVztBQUMzQixXQUFPLGdCQUFnQixZQUFZLGlCQUFpQixXQUFXLGFBQWEsSUFBSSxlQUFlLEdBQUcsV0FBVyxhQUFhLElBQUksV0FBVztBQUN6SSxXQUFPLFdBQVcsV0FBVztBQUM3QixXQUFPLGFBQWEsV0FBVztBQUMvQixXQUFPLFlBQVksV0FBVztBQUM5QixXQUFPLG1CQUFtQixXQUFXO0FBR3JDLFFBQUksWUFBWSxNQUFNLFNBQVMsV0FBVyxLQUFLLEdBQUc7QUFDakQsYUFBTyxRQUFRLE1BQU0sR0FBRyxXQUFXLEtBQUs7QUFBQSxJQUN6QyxXQUFXLE9BQU8sV0FBVyxVQUFVLFVBQVU7QUFDaEQsYUFBTyxRQUFRLEVBQUUsV0FBVyxNQUFNLEdBQUcsV0FBVyxNQUFNLE1BQU0sR0FBRyxXQUFXLE1BQU0sR0FBRyxXQUFXLE1BQU0sT0FBTyxFQUFFO0FBQUEsSUFDOUc7QUFFQSxXQUFPLGlCQUFpQixPQUFPLFdBQVcsb0JBQW9CLGNBQWMsUUFBUSxRQUFRLFdBQVcsa0JBQWtCLFVBQVUsNkJBQTZCLGNBQWM7QUFFOUssUUFBSSxPQUFPLFdBQVcsb0JBQW9CLGVBQWUsV0FBVyxrQkFBa0IsVUFBVSw2QkFBNkIsaUJBQWlCO0FBQzdJLGFBQU8sYUFBYSxJQUFJLE1BQU0sY0FBYyxXQUFXLFVBQVU7QUFBQSxJQUNsRSxPQUFPO0FBQ04sYUFBTyxhQUFhLFdBQVc7QUFDL0IsYUFBTyxXQUFXLE9BQU8saUJBQWlCLE1BQU0sUUFBUSxJQUFJLE1BQU0sU0FBUyxPQUFPLE9BQU8sT0FBTyxVQUFVLElBQUk7QUFBQSxJQUMvRztBQUNBLFFBQUksV0FBVyx1QkFBdUIsV0FBVyxvQkFBb0IsU0FBUyxHQUFHO0FBQ2hGLGFBQU8sc0JBQXNCLFdBQVcsb0JBQW9CLElBQUksT0FBSyxTQUFTLEdBQUcsQ0FBdUIsQ0FBQztBQUFBLElBQzFHO0FBQ0EsV0FBTyxVQUFVLGFBQWEsV0FBVyxVQUFVLFVBQVUsYUFBYSxXQUFXLE9BQU8sSUFBSTtBQUVoRyxXQUFPO0FBQUEsRUFDUjtBQWxDTyxFQUFBQSxnQkFBUztBQUFBLEdBRkE7QUF1Q1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsMEJBQVY7QUFDQyxXQUFTLEtBQUssTUFBa0U7QUFDdEYsUUFBSSxPQUFPLEtBQUssVUFBVSxZQUFZLENBQUMsTUFBTSxRQUFRLEtBQUssS0FBSyxHQUFHO0FBQ2pFLFlBQU0sSUFBSSxVQUFVLGVBQWU7QUFBQSxJQUNwQztBQUVBLFdBQU87QUFBQSxNQUNOLE9BQU8sS0FBSztBQUFBLE1BQ1osZUFBZSxlQUFlLFdBQVcsS0FBSyxhQUFhO0FBQUEsSUFDNUQ7QUFBQSxFQUNEO0FBVE8sRUFBQUEsc0JBQVM7QUFVVCxXQUFTLEdBQUcsTUFBa0U7QUFDcEYsV0FBTztBQUFBLE1BQ04sT0FBTyxLQUFLO0FBQUEsTUFDWixlQUFlLFlBQVksaUJBQWlCLEtBQUssYUFBYSxJQUFJLGVBQWUsR0FBRyxLQUFLLGFBQWEsSUFBSSxLQUFLO0FBQUEsSUFDaEg7QUFBQSxFQUNEO0FBTE8sRUFBQUEsc0JBQVM7QUFBQSxHQVhBO0FBbUJWLElBQVU7QUFBQSxDQUFWLENBQVVDLDBCQUFWO0FBRUMsV0FBUyxLQUFLLE1BQWtFO0FBQ3RGLFdBQU87QUFBQSxNQUNOLE9BQU8sS0FBSztBQUFBLE1BQ1osZUFBZSxlQUFlLFdBQVcsS0FBSyxhQUFhO0FBQUEsTUFDM0QsWUFBWSxNQUFNLFFBQVEsS0FBSyxVQUFVLElBQUksS0FBSyxXQUFXLElBQUkscUJBQXFCLElBQUksSUFBSSxDQUFDO0FBQUEsTUFDL0YsaUJBQWlCLEtBQUs7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxzQkFBUztBQVNULFdBQVMsR0FBRyxNQUFrRTtBQUNwRixXQUFPO0FBQUEsTUFDTixPQUFPLEtBQUs7QUFBQSxNQUNaLGVBQWUsWUFBWSxpQkFBaUIsS0FBSyxhQUFhLElBQUksZUFBZSxHQUFHLEtBQUssYUFBYSxJQUFJLEtBQUs7QUFBQSxNQUMvRyxZQUFZLE1BQU0sUUFBUSxLQUFLLFVBQVUsSUFBSSxLQUFLLFdBQVcsSUFBSSxxQkFBcUIsRUFBRSxJQUFJLENBQUM7QUFBQSxNQUM3RixpQkFBaUIsS0FBSztBQUFBLElBQ3ZCO0FBQUEsRUFDRDtBQVBPLEVBQUFBLHNCQUFTO0FBQUEsR0FYQTtBQXFCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxtQkFBVjtBQUVDLFdBQVMsS0FBSyxNQUFvRDtBQUN4RSxXQUFPO0FBQUEsTUFDTixpQkFBaUIsS0FBSztBQUFBLE1BQ3RCLGlCQUFpQixLQUFLO0FBQUEsTUFDdEIsWUFBWSxNQUFNLFFBQVEsS0FBSyxVQUFVLElBQUksS0FBSyxXQUFXLElBQUkscUJBQXFCLElBQUksSUFBSSxDQUFDO0FBQUEsSUFDaEc7QUFBQSxFQUNEO0FBTk8sRUFBQUEsZUFBUztBQVFULFdBQVMsR0FBRyxNQUFvRDtBQUN0RSxXQUFPO0FBQUEsTUFDTixpQkFBaUIsS0FBSztBQUFBLE1BQ3RCLGlCQUFpQixLQUFLO0FBQUEsTUFDdEIsWUFBWSxNQUFNLFFBQVEsS0FBSyxVQUFVLElBQUksS0FBSyxXQUFXLElBQUkscUJBQXFCLEVBQUUsSUFBSSxDQUFDO0FBQUEsSUFDOUY7QUFBQSxFQUNEO0FBTk8sRUFBQUEsZUFBUztBQUFBLEdBVkE7QUFtQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsZUFBVjtBQUVDLFdBQVMsR0FBRyxXQUF1QyxNQUE2QztBQUN0RyxVQUFNLE1BQU0sSUFBSSxNQUFNO0FBQUEsTUFDckIsU0FBUyxHQUFHLEtBQUssUUFBUTtBQUFBLE1BQ3pCLE9BQU8sS0FBSyxVQUFVLFdBQVcsS0FBSyxRQUFRLEtBQUssTUFBTSxJQUFJLG1CQUFtQixHQUFHLEtBQUssUUFBVyxTQUFTLENBQUM7QUFBQSxNQUM3RyxLQUFLLFFBQVEsY0FBYyxHQUFHLEtBQUssSUFBSTtBQUFBLElBQ3hDO0FBQ0EsUUFBSSxZQUFZLEtBQUssYUFBYSxLQUFLLFVBQVUsSUFBSSxTQUFTLEVBQUU7QUFDaEUsUUFBSSxVQUFVLFlBQVksaUJBQWlCLEtBQUssT0FBTyxJQUFJLGVBQWUsR0FBRyxLQUFLLE9BQU8sSUFBSSxLQUFLO0FBQ2xHLFFBQUksY0FBYyxLQUFLO0FBQ3ZCLFFBQUksZUFBZSxLQUFLO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBWE8sRUFBQUEsV0FBUztBQUFBLEdBRkE7QUFnQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsd0JBQVY7QUFFQyxXQUFTLEdBQUcsV0FBdUMsTUFBOEQ7QUFDdkgsVUFBTSxTQUFTLElBQUksTUFBTSxtQkFBbUIsS0FBSyxLQUFLO0FBQ3RELFdBQU8sVUFBVSxZQUFZLGlCQUFpQixLQUFLLE9BQU8sSUFDdkQsZUFBZSxHQUFHLEtBQUssT0FBTyxJQUM5QixLQUFLO0FBQ1IsUUFBSSxVQUFVLFFBQVEsR0FBRyxLQUFLLE9BQU8sR0FBRztBQUN2QyxhQUFPLFVBQVUsVUFBVSxhQUFhLEtBQUssT0FBTztBQUFBLElBQ3JEO0FBQ0EsUUFBSSxLQUFLLFVBQVU7QUFDbEIsYUFBTyxXQUFXLFNBQVMsR0FBRyxLQUFLLFFBQVE7QUFBQSxJQUM1QztBQUNBLFdBQU87QUFBQSxFQUNSO0FBWk8sRUFBQUEsb0JBQVM7QUFBQSxHQUZBO0FBaUJWLElBQVU7QUFBQSxDQUFWLENBQVVDLG1CQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQXFEO0FBQ3pFLFdBQU87QUFBQSxFQUNSO0FBRk8sRUFBQUEsZUFBUztBQUdULFdBQVMsR0FBRyxNQUFxRDtBQUN2RSxXQUFPO0FBQUEsRUFDUjtBQUZPLEVBQUFBLGVBQVM7QUFBQSxHQUpBO0FBU1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsa0JBQVY7QUFFQyxXQUFTLEtBQUssTUFBNEM7QUFDaEUsV0FBTztBQUFBLE1BQ04sT0FBTyxNQUFNLEtBQUssS0FBSyxLQUFLO0FBQUEsTUFDNUIsS0FBSyxLQUFLO0FBQUEsTUFDVixTQUFTLEtBQUs7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQU5PLEVBQUFBLGNBQVM7QUFRVCxXQUFTLEdBQUcsTUFBNEM7QUFDOUQsUUFBSSxTQUEwQjtBQUM5QixRQUFJLEtBQUssS0FBSztBQUNiLFVBQUk7QUFDSCxpQkFBUyxPQUFPLEtBQUssUUFBUSxXQUFXLElBQUksTUFBTSxLQUFLLEtBQUssSUFBSSxJQUFJLElBQUksT0FBTyxLQUFLLEdBQUc7QUFBQSxNQUN4RixTQUFTLEtBQUs7QUFBQSxNQUVkO0FBQUEsSUFDRDtBQUNBLFVBQU0sU0FBUyxJQUFJLE1BQU0sYUFBYSxNQUFNLEdBQUcsS0FBSyxLQUFLLEdBQUcsTUFBTTtBQUNsRSxXQUFPLFVBQVUsS0FBSztBQUN0QixXQUFPO0FBQUEsRUFDUjtBQVpPLEVBQUFBLGNBQVM7QUFBQSxHQVZBO0FBeUJWLElBQVU7QUFBQSxDQUFWLENBQVVDLHVCQUFWO0FBQ0MsV0FBUyxHQUFHLG1CQUEwRTtBQUM1RixVQUFNLEtBQUssSUFBSSxNQUFNLGtCQUFrQixrQkFBa0IsS0FBSztBQUM5RCxRQUFJLGtCQUFrQixVQUFVO0FBQy9CLFNBQUcsV0FBVyxTQUFTLEdBQUcsa0JBQWtCLFFBQVE7QUFBQSxJQUNyRDtBQUNBLFFBQUksa0JBQWtCLHFCQUFxQjtBQUMxQyxTQUFHLHNCQUFzQixrQkFBa0Isb0JBQW9CLElBQUksV0FBUyxTQUFTLEdBQUcsS0FBSyxDQUFDO0FBQUEsSUFDL0Y7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQVRPLEVBQUFBLG1CQUFTO0FBV1QsV0FBUyxLQUFLLG1CQUEyRTtBQUMvRixXQUFPO0FBQUEsTUFDTixPQUFPLGtCQUFrQjtBQUFBLE1BQ3pCLFVBQVUsa0JBQWtCLFdBQVcsU0FBUyxLQUFLLGtCQUFrQixRQUFRLElBQUk7QUFBQSxNQUNuRixxQkFBcUIsa0JBQWtCLHNCQUFzQixrQkFBa0Isb0JBQW9CLElBQUksV0FBUyxTQUFTLEtBQUssS0FBSyxDQUFDLElBQUk7QUFBQSxJQUN6STtBQUFBLEVBQ0Q7QUFOTyxFQUFBQSxtQkFBUztBQUFBLEdBWkE7QUFxQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsV0FBVjtBQUNDLFdBQVMsR0FBRyxHQUFrRDtBQUNwRSxXQUFPLElBQUksTUFBTSxNQUFNLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQUEsRUFDOUM7QUFGTyxFQUFBQSxPQUFTO0FBR1QsV0FBUyxLQUFLLE9BQXNEO0FBQzFFLFdBQU8sQ0FBQyxNQUFNLEtBQUssTUFBTSxPQUFPLE1BQU0sTUFBTSxNQUFNLEtBQUs7QUFBQSxFQUN4RDtBQUZPLEVBQUFBLE9BQVM7QUFBQSxHQUpBO0FBVVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsb0JBQVY7QUFDQyxXQUFTLEtBQUssS0FBc0Q7QUFDMUUsV0FBTyxFQUFFLE9BQU8sTUFBTSxLQUFLLElBQUksS0FBSyxFQUFFO0FBQUEsRUFDdkM7QUFGTyxFQUFBQSxnQkFBUztBQUlULFdBQVMsR0FBRyxLQUFzRDtBQUN4RSxXQUFPLElBQUksTUFBTSxlQUFlLE1BQU0sR0FBRyxJQUFJLEtBQUssQ0FBQztBQUFBLEVBQ3BEO0FBRk8sRUFBQUEsZ0JBQVM7QUFBQSxHQUxBO0FBVVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsNEJBQVY7QUFFQyxXQUFTLEdBQUcsUUFBbUQ7QUFDckUsWUFBUSxRQUFRO0FBQUEsTUFDZixLQUFLLFdBQVc7QUFDZixlQUFPLE1BQU0sdUJBQXVCO0FBQUEsTUFDckMsS0FBSyxXQUFXO0FBQ2YsZUFBTyxNQUFNLHVCQUF1QjtBQUFBLE1BQ3JDLEtBQUssV0FBVztBQUFBLE1BQ2hCLEtBQUssV0FBVztBQUNmLGVBQU8sTUFBTSx1QkFBdUI7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFWTyxFQUFBQSx3QkFBUztBQUFBLEdBRkE7QUFlVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxnQ0FBVjtBQUNDLFdBQVMsS0FBSyxPQUFpRTtBQUNyRixZQUFRLE9BQU87QUFBQSxNQUNkLEtBQUssTUFBTSwyQkFBMkI7QUFDckMsZUFBTyxzQkFBc0I7QUFBQSxNQUM5QixLQUFLLE1BQU0sMkJBQTJCO0FBQ3JDLGVBQU8sc0JBQXNCO0FBQUEsTUFDOUIsS0FBSyxNQUFNLDJCQUEyQjtBQUNyQyxlQUFPLHNCQUFzQjtBQUFBLE1BQzlCLEtBQUssTUFBTSwyQkFBMkI7QUFBQSxNQUN0QztBQUNDLGVBQU8sc0JBQXNCO0FBQUEsSUFDL0I7QUFBQSxFQUNEO0FBWk8sRUFBQUEsNEJBQVM7QUFhVCxXQUFTLEdBQUcsT0FBaUU7QUFDbkYsWUFBUSxPQUFPO0FBQUEsTUFDZCxLQUFLLHNCQUFzQjtBQUMxQixlQUFPLE1BQU0sMkJBQTJCO0FBQUEsTUFDekMsS0FBSyxzQkFBc0I7QUFDMUIsZUFBTyxNQUFNLDJCQUEyQjtBQUFBLE1BQ3pDLEtBQUssc0JBQXNCO0FBQzFCLGVBQU8sTUFBTSwyQkFBMkI7QUFBQSxNQUN6QyxLQUFLLHNCQUFzQjtBQUFBLE1BQzNCO0FBQ0MsZUFBTyxNQUFNLDJCQUEyQjtBQUFBLElBQzFDO0FBQUEsRUFDRDtBQVpPLEVBQUFBLDRCQUFTO0FBQUEsR0FkQTtBQTZCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxlQUFWO0FBRUMsV0FBUyxLQUFLLEtBQXNEO0FBQzFFLFFBQUksUUFBUSxNQUFNLFVBQVUsTUFBTTtBQUNqQyxhQUFPLGtCQUFrQjtBQUFBLElBQzFCLFdBQVcsUUFBUSxNQUFNLFVBQVUsSUFBSTtBQUN0QyxhQUFPLGtCQUFrQjtBQUFBLElBQzFCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFQTyxFQUFBQSxXQUFTO0FBU1QsV0FBUyxHQUFHLEtBQXNEO0FBQ3hFLFFBQUksUUFBUSxrQkFBa0IsTUFBTTtBQUNuQyxhQUFPLE1BQU0sVUFBVTtBQUFBLElBQ3hCLFdBQVcsUUFBUSxrQkFBa0IsSUFBSTtBQUN4QyxhQUFPLE1BQU0sVUFBVTtBQUFBLElBQ3hCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFQTyxFQUFBQSxXQUFTO0FBQUEsR0FYQTtBQXFCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxzQkFBVjtBQUNDLFdBQVMsS0FBSyxLQUFrRjtBQUN0RyxRQUFJLE9BQU8sUUFBUSxVQUFVO0FBQzVCLGFBQU8sSUFBSTtBQUFBLElBQ1o7QUFFQSxZQUFRLEtBQUs7QUFBQSxNQUNaLEtBQUssTUFBTSxpQkFBaUI7QUFBZSxlQUFPLHFCQUFxQjtBQUFBLE1BQ3ZFLEtBQUssTUFBTSxpQkFBaUI7QUFBUSxlQUFPLHFCQUFxQjtBQUFBLE1BQ2hFLEtBQUssTUFBTSxpQkFBaUI7QUFBYyxlQUFPLHFCQUFxQjtBQUFBLElBQ3ZFO0FBQ0EsVUFBTSxJQUFJLE1BQU0sNEJBQTRCO0FBQUEsRUFDN0M7QUFYTyxFQUFBQSxrQkFBUztBQUFBLEdBREE7QUFlVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxrQkFBVjtBQUNDLFdBQVMsS0FBSyxHQUFnRDtBQUNwRSxVQUFNLFFBQWdDLEVBQUUsT0FBTyxFQUFFLFFBQVEsR0FBRyxLQUFLLEVBQUUsTUFBTSxFQUFFO0FBQzNFLFFBQUksRUFBRSxNQUFNO0FBQ1gsWUFBTSxPQUFPLGlCQUFpQixLQUFLLEVBQUUsSUFBSTtBQUFBLElBQzFDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFOTyxFQUFBQSxjQUFTO0FBT1QsV0FBUyxHQUFHLEdBQWdEO0FBQ2xFLFVBQU0sUUFBNkIsRUFBRSxPQUFPLEVBQUUsUUFBUSxHQUFHLEtBQUssRUFBRSxNQUFNLEVBQUU7QUFDeEUsUUFBSSxFQUFFLE1BQU07QUFDWCxZQUFNLE9BQU8saUJBQWlCLEdBQUcsRUFBRSxJQUFJO0FBQUEsSUFDeEM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQU5PLEVBQUFBLGNBQVM7QUFBQSxHQVJBO0FBaUJWLElBQVU7QUFBQSxDQUFWLENBQVVDLHNCQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQW1GO0FBQ3ZHLFFBQUksTUFBTTtBQUNULGNBQVEsTUFBTTtBQUFBLFFBQ2IsS0FBSyxNQUFNLGlCQUFpQjtBQUMzQixpQkFBTyxVQUFVLGlCQUFpQjtBQUFBLFFBQ25DLEtBQUssTUFBTSxpQkFBaUI7QUFDM0IsaUJBQU8sVUFBVSxpQkFBaUI7QUFBQSxRQUNuQyxLQUFLLE1BQU0saUJBQWlCO0FBQzNCLGlCQUFPLFVBQVUsaUJBQWlCO0FBQUEsTUFDcEM7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFaTyxFQUFBQSxrQkFBUztBQWFULFdBQVMsR0FBRyxNQUFtRjtBQUNyRyxRQUFJLE1BQU07QUFDVCxjQUFRLEtBQUssT0FBTztBQUFBLFFBQ25CLEtBQUssVUFBVSxpQkFBaUIsUUFBUTtBQUN2QyxpQkFBTyxNQUFNLGlCQUFpQjtBQUFBLFFBQy9CLEtBQUssVUFBVSxpQkFBaUIsUUFBUTtBQUN2QyxpQkFBTyxNQUFNLGlCQUFpQjtBQUFBLFFBQy9CLEtBQUssVUFBVSxpQkFBaUIsT0FBTztBQUN0QyxpQkFBTyxNQUFNLGlCQUFpQjtBQUFBLE1BQ2hDO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBWk8sRUFBQUEsa0JBQVM7QUFBQSxHQWRBO0FBa0NWLElBQVU7QUFBQSxDQUFWLENBQVVDLDJCQUFWO0FBRUMsV0FBUyxLQUFLLFNBQWlFO0FBQ3JGLFFBQUksU0FBUztBQUNaLGFBQU87QUFBQSxRQUNOLFFBQVEsT0FBTyxRQUFRLFlBQVksWUFBWSxDQUFDLFFBQVEsVUFBVTtBQUFBLFFBQ2xFLFVBQVUsUUFBUTtBQUFBLFFBQ2xCLGVBQWUsUUFBUTtBQUFBLFFBQ3ZCLFdBQVcsT0FBTyxRQUFRLGNBQWMsV0FBVyxNQUFNLEtBQUssUUFBUSxTQUFTLElBQUk7QUFBQSxRQUNuRixVQUFVLE9BQU8sUUFBUSxhQUFhLFlBQVksMkJBQTJCLEtBQUs7QUFBQSxNQUNuRjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQVpPLEVBQUFBLHVCQUFTO0FBQUEsR0FGQTtBQWtCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxpQkFBVjtBQU1DLFdBQVMsS0FBSyxTQUFpSDtBQUNySSxRQUFJLG1CQUFtQixNQUFNLGlCQUFpQjtBQUM3QyxhQUFPLFFBQVEsT0FBTztBQUFBLElBQ3ZCO0FBRUEsUUFBSSxPQUFPLFlBQVksVUFBVTtBQUNoQyxhQUFPO0FBQUEsSUFDUjtBQU9BLFFBQUksdUJBQXVCLE9BQU8sS0FBSyw2QkFBNkIsT0FBTyxHQUFHO0FBQzdFLGFBQU8sSUFBSSxNQUFNLGdCQUFnQixRQUFRLFdBQVcsUUFBUSxNQUFNLFFBQVEsT0FBTyxFQUFFLE9BQU87QUFBQSxJQUMzRjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBbkJPLEVBQUFBLGFBQVM7QUFxQmhCLFdBQVMsdUJBQXVCLEtBQXNFO0FBQ3JHLFVBQU0sS0FBSztBQUNYLFFBQUksQ0FBQyxJQUFJO0FBQ1IsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLElBQUksTUFBTSxHQUFHLE9BQU8sS0FBSyxPQUFPLEdBQUcsWUFBWTtBQUFBLEVBQ3ZEO0FBRUEsV0FBUyw2QkFBNkIsS0FBd0Q7QUFNN0YsVUFBTSxLQUFLO0FBQ1gsUUFBSSxDQUFDLElBQUk7QUFDUixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sT0FBTyxHQUFHLFNBQVMsWUFBWSxPQUFPLEdBQUcsWUFBWTtBQUFBLEVBQzdEO0FBRU8sV0FBUyxHQUFHLFNBQTJFO0FBQzdGLFFBQUksT0FBTyxZQUFZLFVBQVU7QUFDaEMsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLElBQUksTUFBTSxnQkFBZ0IsSUFBSSxPQUFPLFFBQVEsT0FBTyxHQUFHLFFBQVEsT0FBTztBQUFBLEVBQzlFO0FBTk8sRUFBQUEsYUFBUztBQUFBLEdBbERBO0FBMkRWLElBQVU7QUFBQSxDQUFWLENBQVVDLHNCQUFWO0FBS0MsV0FBUyxLQUFLLFVBQThGO0FBQ2xILFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1IsV0FBVyxNQUFNLFFBQVEsUUFBUSxHQUFHO0FBQ25DLGFBQTBDLFNBQVMsSUFBSSxJQUFJO0FBQUEsSUFDNUQsV0FBVyxPQUFPLGFBQWEsVUFBVTtBQUN4QyxhQUFPO0FBQUEsSUFDUixPQUFPO0FBQ04sWUFBTSxTQUFTO0FBQ2YsYUFBTztBQUFBLFFBQ04sVUFBVSxPQUFPO0FBQUEsUUFDakIsUUFBUSxPQUFPO0FBQUEsUUFDZixTQUFTLFlBQVksS0FBSyxPQUFPLE9BQU8sS0FBSztBQUFBLFFBQzdDLFdBQVcsT0FBTztBQUFBLFFBQ2xCLGNBQWMsT0FBTztBQUFBLE1BQ3RCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFqQk8sRUFBQUEsa0JBQVM7QUFBQSxHQUxBO0FBeUJWLElBQVU7QUFBQSxDQUFWLENBQVVDLG1CQUFWO0FBRUMsV0FBUyxLQUFLLE9BQXlDO0FBQzdELFdBQU8sRUFBRSxPQUFPLE1BQU0sT0FBTyxLQUFLLE1BQU0sSUFBSTtBQUFBLEVBQzdDO0FBRk8sRUFBQUEsZUFBUztBQUlULFdBQVMsR0FBRyxPQUF3QztBQUMxRCxXQUFPLElBQUksTUFBTSxjQUFjLE1BQU0sT0FBTyxNQUFNLEdBQUc7QUFBQSxFQUN0RDtBQUZPLEVBQUFBLGVBQVM7QUFBQSxHQU5BO0FBV1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsa0NBQVY7QUFDQyxXQUFTLEdBQUcsTUFBbUY7QUFDckcsV0FBTztBQUFBLE1BQ04sUUFBUSxPQUFPLEtBQUssaUJBQWlCLFlBQVksT0FBTyxLQUFLLGVBQWUsV0FBVyxFQUFFLFdBQVcsS0FBSyxjQUFjLFNBQVMsS0FBSyxXQUFXLElBQUk7QUFBQSxNQUNwSixnQkFBZ0IsS0FBSztBQUFBLE1BQ3JCLFNBQVMsS0FBSztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBTk8sRUFBQUEsOEJBQVM7QUFRVCxXQUFTLEtBQUssTUFBNEY7QUFDaEgsV0FBTztBQUFBLE1BQ04sZ0JBQWdCLEtBQUs7QUFBQSxNQUNyQixjQUFjLEtBQUssUUFBUTtBQUFBLE1BQzNCLFlBQVksS0FBSyxRQUFRO0FBQUEsTUFDekIsZ0JBQWdCLEtBQUs7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSw4QkFBUztBQUFBLEdBVEE7QUFtQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsc0JBQVY7QUFDQyxXQUFTLEtBQUssTUFBbUQ7QUFDdkUsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLLE1BQU0saUJBQWlCO0FBQzNCLGVBQU8sVUFBVSxTQUFTO0FBQUEsTUFDM0IsS0FBSyxNQUFNLGlCQUFpQjtBQUFBLE1BQzVCO0FBQ0MsZUFBTyxVQUFVLFNBQVM7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFSTyxFQUFBQSxrQkFBUztBQVVULFdBQVMsR0FBRyxNQUFtRDtBQUNyRSxZQUFRLE1BQU07QUFBQSxNQUNiLEtBQUssVUFBVSxTQUFTO0FBQ3ZCLGVBQU8sTUFBTSxpQkFBaUI7QUFBQSxNQUMvQixLQUFLLFVBQVUsU0FBUztBQUFBLE1BQ3hCO0FBQ0MsZUFBTyxNQUFNLGlCQUFpQjtBQUFBLElBQ2hDO0FBQUEsRUFDRDtBQVJPLEVBQUFBLGtCQUFTO0FBQUEsR0FYQTtBQXNCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxrQkFBVjtBQUVDLFdBQVMsS0FBSyxNQUE0RDtBQUNoRixVQUFNLE1BQXVDO0FBQUEsTUFDNUMsVUFBVSxLQUFLLFlBQVksdUJBQU8sT0FBTyxJQUFJO0FBQUEsTUFDN0MsT0FBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLGVBQVcsUUFBUSxLQUFLLE9BQU87QUFDOUIsWUFBTSxpQkFBaUIsU0FBUyxJQUFJO0FBQ3BDLFVBQUksTUFBTSxLQUFLLGlCQUFpQixLQUFLLElBQUksQ0FBQztBQUFBLElBQzNDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFWTyxFQUFBQSxjQUFTO0FBWVQsV0FBUyxHQUFHLE1BQTREO0FBQzlFLFVBQU0sTUFBTSxJQUFJLE1BQU07QUFBQSxNQUNyQixLQUFLLE1BQU0sSUFBSSxpQkFBaUIsRUFBRTtBQUFBLElBQ25DO0FBQ0EsUUFBSSxDQUFDLGNBQWMsS0FBSyxRQUFRLEdBQUc7QUFDbEMsVUFBSSxXQUFXLEtBQUs7QUFBQSxJQUNyQjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBUk8sRUFBQUEsY0FBUztBQUFBLEdBZEE7QUF5QlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsc0JBQVY7QUFFQyxXQUFTLEtBQUssTUFBb0U7QUFDeEYsV0FBTztBQUFBLE1BQ04sVUFBVSxpQkFBaUIsS0FBSyxLQUFLLElBQUk7QUFBQSxNQUN6QyxVQUFVLEtBQUs7QUFBQSxNQUNmLE1BQU0sS0FBSztBQUFBLE1BQ1gsUUFBUSxLQUFLO0FBQUEsTUFDYixVQUFVLEtBQUs7QUFBQSxNQUNmLGtCQUFrQiw2QkFBNkIsS0FBSyxLQUFLLG9CQUFvQixDQUFDLENBQUM7QUFBQSxNQUMvRSxTQUFTLEtBQUssVUFBVSxLQUFLLFFBQVEsSUFBSSxtQkFBbUIsSUFBSSxJQUFJLENBQUM7QUFBQSxJQUN0RTtBQUFBLEVBQ0Q7QUFWTyxFQUFBQSxrQkFBUztBQVlULFdBQVMsR0FBRyxNQUFvRTtBQUN0RixXQUFPLElBQUksTUFBTTtBQUFBLE1BQ2hCLGlCQUFpQixHQUFHLEtBQUssUUFBUTtBQUFBLE1BQ2pDLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEtBQUssVUFBVSxLQUFLLFFBQVEsSUFBSSxtQkFBbUIsRUFBRSxJQUFJO0FBQUEsTUFDekQsS0FBSztBQUFBLE1BQ0wsS0FBSyxtQkFBbUIsNkJBQTZCLEdBQUcsS0FBSyxnQkFBZ0IsSUFBSTtBQUFBLElBQ2xGO0FBQUEsRUFDRDtBQVZPLEVBQUFBLGtCQUFTO0FBQUEsR0FkQTtBQTJCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw0QkFBVjtBQUNDLFdBQVMsS0FBSyxNQUEyRTtBQUMvRixXQUFPO0FBQUEsTUFDTixNQUFNLEtBQUs7QUFBQSxNQUNYLFlBQVksU0FBUyxLQUFLLEtBQUssSUFBSTtBQUFBLElBQ3BDO0FBQUEsRUFDRDtBQUxPLEVBQUFBLHdCQUFTO0FBT1QsV0FBUyxHQUFHLE1BQTJFO0FBQzdGLFdBQU8sSUFBSSxNQUFNLHVCQUF1QixLQUFLLFdBQVcsUUFBUSxLQUFLLElBQUk7QUFBQSxFQUMxRTtBQUZPLEVBQUFBLHdCQUFTO0FBQUEsR0FSQTtBQWFWLElBQVU7QUFBQSxDQUFWLENBQVVDLHdCQUFWO0FBQ0MsV0FBUyxLQUFLLFFBQXNFO0FBQzFGLFdBQU87QUFBQSxNQUNOLFVBQVUsT0FBTztBQUFBLE1BQ2pCLE9BQU8sT0FBTyxNQUFNLElBQUksdUJBQXVCLElBQUk7QUFBQSxNQUNuRCxVQUFVLE9BQU87QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFOTyxFQUFBQSxvQkFBUztBQVFULFdBQVMsR0FBRyxRQUFzRTtBQUN4RixVQUFNLFFBQVEsT0FBTyxNQUFNLElBQUksdUJBQXVCLEVBQUU7QUFDeEQsV0FBTyxJQUFJLE1BQU0sbUJBQW1CLE9BQU8sT0FBTyxVQUFVLE9BQU8sUUFBUTtBQUFBLEVBQzVFO0FBSE8sRUFBQUEsb0JBQVM7QUFBQSxHQVRBO0FBZ0JWLElBQVU7QUFBQSxDQUFWLENBQVVDLHNDQUFWO0FBS0MsV0FBUyxLQUFLLFNBQTRVO0FBQ2hXLFFBQUksbUJBQW1CLE9BQU8sR0FBRztBQUNoQyxhQUFPO0FBQUEsUUFDTixTQUFTLFlBQVksS0FBSyxRQUFRLE9BQU8sS0FBSztBQUFBLFFBQzlDLFNBQVMsWUFBWSxLQUFLLFFBQVEsT0FBTyxLQUFLO0FBQUEsTUFDL0M7QUFBQSxJQUNEO0FBRUEsV0FBTyxZQUFZLEtBQUssT0FBTyxLQUFLO0FBQUEsRUFDckM7QUFUTyxFQUFBQSxrQ0FBUztBQVdULFdBQVMsR0FBRyxTQUE2UDtBQUMvUSxRQUFJLG1CQUFtQixPQUFPLEdBQUc7QUFDaEMsYUFBTztBQUFBLFFBQ04sU0FBUyxZQUFZLEdBQUcsUUFBUSxPQUFPO0FBQUEsUUFDdkMsU0FBUyxZQUFZLEdBQUcsUUFBUSxPQUFPO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBRUEsV0FBTyxZQUFZLEdBQUcsT0FBTztBQUFBLEVBQzlCO0FBVE8sRUFBQUEsa0NBQVM7QUFXaEIsV0FBUyxtQkFBc0IsS0FBK0M7QUFDN0UsVUFBTSxLQUFLO0FBQ1gsUUFBSSxDQUFDLElBQUk7QUFDUixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sQ0FBQyxrQkFBa0IsR0FBRyxPQUFPLEtBQUssQ0FBQyxrQkFBa0IsR0FBRyxPQUFPO0FBQUEsRUFDdkU7QUFBQSxHQWpDZ0I7QUFvQ1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsMkJBQVY7QUFDQyxXQUFTLEtBQUssTUFBd0MsbUJBQStDLGFBQW9FO0FBQy9LLFVBQU0sVUFBVSxPQUFPLEtBQUssWUFBWSxXQUFXLEVBQUUsT0FBTyxJQUFJLFNBQVMsS0FBSyxRQUFRLElBQUksS0FBSztBQUMvRixXQUFPO0FBQUEsTUFDTixXQUFXLEtBQUssY0FBYyxNQUFNLCtCQUErQixPQUFPLFVBQVUsdUJBQXVCLE9BQU8sVUFBVSx1QkFBdUI7QUFBQSxNQUNuSixTQUFTLGtCQUFrQixXQUFXLFNBQVMsV0FBVztBQUFBO0FBQUEsTUFDMUQsTUFBTSxLQUFLO0FBQUEsTUFDWCxTQUFTLEtBQUs7QUFBQSxNQUNkLDBCQUEwQixLQUFLO0FBQUEsTUFDL0IsVUFBVSxLQUFLO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBVk8sRUFBQUEsdUJBQVM7QUFBQSxHQURBO0FBY1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsZ0NBQVY7QUFDQyxXQUFTLEtBQUssTUFBeUMsbUJBQStDLGFBQXFFO0FBQ2pMLFVBQU0sVUFBVSxPQUFPLEtBQUssWUFBWSxXQUFXLEVBQUUsT0FBTyxJQUFJLFNBQVMsS0FBSyxRQUFRLElBQUksS0FBSztBQUUvRixXQUFPO0FBQUEsTUFDTixTQUFTLGtCQUFrQixXQUFXLFNBQVMsV0FBVztBQUFBLE1BQzFELE9BQU8sS0FBSztBQUFBLE1BQ1osYUFBYSxLQUFLO0FBQUEsTUFDbEIsUUFBUSxLQUFLO0FBQUEsTUFDYixlQUFlLEtBQUs7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFWTyxFQUFBQSw0QkFBUztBQUFBLEdBREE7QUFjVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxvQ0FBVjtBQUNDLFdBQVMsS0FBSyxTQUF3RjtBQUM1RyxXQUFPO0FBQUEsTUFDTixrQkFBa0IsU0FBUyxvQkFBb0I7QUFBQSxNQUMvQyx1QkFBdUIsU0FBUyx5QkFBeUIsQ0FBQztBQUFBLE1BQzFELDJCQUEyQixTQUFTLDZCQUE2QixDQUFDO0FBQUEsTUFDbEUscUJBQXFCLFNBQVMsdUJBQXVCLENBQUM7QUFBQSxJQUN2RDtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxnQ0FBUztBQUFBLEdBREE7QUFXVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw0QkFBVjtBQUNDLFdBQVMsS0FBSyxTQUE2RjtBQUNqSCxXQUFPO0FBQUEsTUFDTixLQUFLLFFBQVE7QUFBQSxNQUNiLFVBQVUsUUFBUTtBQUFBLElBQ25CO0FBQUEsRUFDRDtBQUxPLEVBQUFBLHdCQUFTO0FBT1QsV0FBUyxHQUFHLFNBQTZGO0FBQy9HLFdBQU8sSUFBSSxNQUFNLHVCQUF1QixJQUFJLE9BQU8sUUFBUSxHQUFHLEdBQUcsUUFBUSxRQUFRO0FBQUEsRUFDbEY7QUFGTyxFQUFBQSx3QkFBUztBQUFBLEdBUkE7QUFhVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxpQkFBVjtBQUNDLFdBQVMsS0FBSyxTQUEyRDtBQUMvRSxXQUFPO0FBQUEsTUFDTixTQUFTLGVBQWUsV0FBVyxRQUFRLE9BQU8sS0FBSztBQUFBLE1BQ3ZELE1BQU0sZ0JBQWdCO0FBQUEsTUFDdEIsVUFBVSxRQUFRO0FBQUEsTUFDbEIsUUFBUSxRQUFRO0FBQUEsTUFDaEIsY0FBYyxRQUFRO0FBQUEsTUFDdEIsVUFBVSxRQUFRLFlBQWEsRUFBRSxPQUFPLE1BQU0sS0FBSyxRQUFRLFNBQVMsS0FBSyxHQUFHLEtBQUssUUFBUSxTQUFTLElBQUk7QUFBQSxNQUN0RyxZQUFZLFFBQVEsWUFBWSxJQUFJLFFBQU07QUFBQSxRQUN6QyxPQUFPLEVBQUU7QUFBQSxRQUNULFVBQVUsRUFBRSxZQUFZLFNBQVMsS0FBSyxFQUFFLFFBQVE7QUFBQSxRQUNoRCxLQUFLLEVBQUUsT0FBTyxJQUFJLE9BQU8sRUFBRSxHQUFHLEVBQUUsT0FBTztBQUFBLE1BQ3hDLEVBQUU7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQWRPLEVBQUFBLGFBQVM7QUFnQlQsV0FBUyxHQUFHLE1BQXdEO0FBQzFFLFVBQU0sVUFBVSxJQUFJLE1BQU0sWUFBWSxPQUFPLEtBQUssWUFBWSxXQUFXLEtBQUssVUFBVSxlQUFlLEdBQUcsS0FBSyxPQUFPLENBQUM7QUFDdkgsWUFBUSxlQUFlLEtBQUs7QUFDNUIsWUFBUSxpQkFBaUIsS0FBSztBQUM5QixZQUFRLGVBQWUsS0FBSztBQUM1QixZQUFRLFdBQVcsS0FBSyxXQUFXLFNBQVMsR0FBRyxLQUFLLFFBQVEsSUFBSTtBQUNoRSxXQUFPO0FBQUEsRUFDUjtBQVBPLEVBQUFBLGFBQVM7QUFBQSxHQWpCQTtBQTJCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxhQUFWO0FBQ0MsRUFBTUEsU0FBQSxZQUFZO0FBRWxCLEVBQU1BLFNBQUEsY0FBYztBQUFBLEdBSFg7QUFNVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxvQkFBVjtBQUNDLFdBQVMsS0FBSyxNQUEwRDtBQUM5RSxXQUFPO0FBQUEsTUFDTixjQUFjLEtBQUs7QUFBQSxNQUNuQixXQUFXLEtBQUs7QUFBQSxNQUNoQixPQUFPLG1CQUFtQixLQUFLLEtBQUssSUFBSTtBQUFBLElBQ3pDO0FBQUEsRUFDRDtBQU5PLEVBQUFBLGdCQUFTO0FBQUEsR0FEQTtBQVVWLElBQVU7QUFBQSxDQUFWLENBQVVDLHdCQUFWO0FBQ04sUUFBTSx1QkFBbUY7QUFBQSxJQUN4RixDQUFDLE1BQU0sbUJBQW1CLFFBQVEsR0FBRyxxQkFBcUI7QUFBQSxJQUMxRCxDQUFDLE1BQU0sbUJBQW1CLEtBQUssR0FBRyxxQkFBcUI7QUFBQSxJQUN2RCxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxxQkFBcUI7QUFBQSxFQUN0RDtBQUVPLFdBQVMsS0FBSyxNQUFzRDtBQUMxRSxXQUFPLHFCQUFxQixlQUFlLElBQUksSUFBSSxxQkFBcUIsSUFBSSxJQUFJLHFCQUFxQjtBQUFBLEVBQ3RHO0FBRk8sRUFBQUEsb0JBQVM7QUFBQSxHQVBBO0FBWVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsY0FBVjtBQUdDLFdBQVMsS0FBSyxNQUFrQztBQUN0RCxVQUFNLFNBQVMsaUJBQWlCLElBQUksRUFBRTtBQUN0QyxXQUFPO0FBQUEsTUFDTixPQUFPLE9BQU8sb0JBQW9CLE1BQU0sTUFBTSxFQUFFLFNBQVM7QUFBQSxNQUN6RCxPQUFPLEtBQUs7QUFBQSxNQUNaLEtBQUssSUFBSSxPQUFPLEtBQUssR0FBRztBQUFBLE1BQ3hCLE1BQU0sS0FBSztBQUFBLE1BQ1gsTUFBTSxLQUFLLEtBQUssSUFBSSxPQUFLLFFBQVEsVUFBVSxRQUFRLEVBQUUsRUFBRSxDQUFDO0FBQUEsTUFDeEQsT0FBTyxZQUFZLE1BQU0sS0FBSyxNQUFNLEtBQUssS0FBSyxLQUFLLENBQUM7QUFBQSxNQUNwRCxhQUFhLEtBQUssZUFBZTtBQUFBLE1BQ2pDLFVBQVUsS0FBSyxZQUFZO0FBQUEsTUFDM0IsT0FBTyxLQUFLLFFBQVMsZUFBZSxXQUFXLEtBQUssS0FBSyxLQUFLLE9BQVE7QUFBQSxJQUN2RTtBQUFBLEVBQ0Q7QUFiTyxFQUFBQSxVQUFTO0FBZVQsV0FBUyxRQUFRLE1BQTZDO0FBQ3BFLFdBQU87QUFBQSxNQUNOLFFBQVE7QUFBQSxNQUNSLE9BQU87QUFBQSxNQUNQLElBQUksT0FBTyxXQUFXLEtBQUssS0FBSyxFQUFFO0FBQUEsTUFDbEMsT0FBTyxLQUFLO0FBQUEsTUFDWixLQUFLLElBQUksT0FBTyxLQUFLLEdBQUc7QUFBQSxNQUN4QixPQUFPLEtBQUssUUFBUSxDQUFDLEdBQUcsSUFBSSxPQUFLO0FBQ2hDLGNBQU0sRUFBRSxNQUFNLElBQUksUUFBUSxZQUFZLENBQUM7QUFDdkMsZUFBTyxJQUFJLE1BQU0sUUFBUSxLQUFLO0FBQUEsTUFDL0IsQ0FBQztBQUFBLE1BQ0QsVUFBVTtBQUFBLFFBQ1QsS0FBSyxNQUFNO0FBQUEsUUFBRTtBQUFBLFFBQ2IsUUFBUSxNQUFNO0FBQUEsUUFBRTtBQUFBLFFBQ2hCLFNBQVMsTUFBTTtBQUFBLFFBQUU7QUFBQSxRQUNqQixFQUFFLE9BQU8sUUFBUSxJQUFJO0FBQUEsUUFBRTtBQUFBLFFBQ3ZCLEtBQUssTUFBTTtBQUFBLFFBQ1gsU0FBUyxNQUFNO0FBQUEsUUFBRTtBQUFBLFFBQ2pCLE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxPQUFPLE1BQU0sR0FBRyxLQUFLLFNBQVMsTUFBUztBQUFBLE1BQ3ZDLG9CQUFvQjtBQUFBLE1BQ3BCLE1BQU0sS0FBSztBQUFBLE1BQ1gsYUFBYSxLQUFLLGVBQWU7QUFBQSxNQUNqQyxVQUFVLEtBQUssWUFBWTtBQUFBLElBQzVCO0FBQUEsRUFDRDtBQTFCTyxFQUFBQSxVQUFTO0FBQUEsR0FsQkE7QUFBQSxDQStDVixDQUFVSCxhQUFWO0FBQ0MsV0FBUyxLQUFLLEtBQStCO0FBQ25ELFdBQU8sRUFBRSxJQUFJLElBQUksR0FBRztBQUFBLEVBQ3JCO0FBRk8sRUFBQUEsU0FBUztBQUlULFdBQVMsR0FBRyxLQUErQjtBQUNqRCxXQUFPLElBQUksTUFBTSxRQUFRLElBQUksRUFBRTtBQUFBLEVBQ2hDO0FBRk8sRUFBQUEsU0FBUztBQUFBLEdBTEE7QUFVVixJQUFVO0FBQUEsQ0FBVixDQUFVSSxpQkFBVjtBQUNOLFFBQU0sd0JBQXdCLENBQUMsTUFBa0QsV0FBOEU7QUFDOUosVUFBTSxPQUFPLEtBQUs7QUFDbEIsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sV0FBdUM7QUFBQSxNQUM1QyxHQUFHLFNBQVMsUUFBUSxLQUFLLElBQUk7QUFBQSxNQUM3QjtBQUFBLE1BQ0EsWUFBWSxLQUFLLE1BQU0sSUFBSSxRQUFNO0FBQUEsUUFDaEMsT0FBTyxFQUFFO0FBQUEsUUFDVCxVQUFVLEVBQUU7QUFBQSxRQUNaLFVBQVUsRUFBRSxTQUNWLE9BQU8sQ0FBQyxNQUF5QyxFQUFFLFNBQVMsZ0JBQWdCLEtBQUssRUFDakYsSUFBSSxZQUFZLEVBQUU7QUFBQSxNQUNyQixFQUFFO0FBQUEsTUFDRixVQUFVLENBQUM7QUFBQSxJQUNaO0FBRUEsUUFBSSxLQUFLLFVBQVU7QUFDbEIsaUJBQVcsU0FBUyxLQUFLLFNBQVMsT0FBTyxHQUFHO0FBQzNDLGNBQU0sSUFBSSxzQkFBc0IsT0FBTyxRQUFRO0FBQy9DLFlBQUksR0FBRztBQUNOLG1CQUFTLFNBQVMsS0FBSyxDQUFDO0FBQUEsUUFDekI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBRU8sV0FBUyxHQUFHLFlBQTBEO0FBQzVFLFVBQU0sT0FBTyxJQUFJLHNCQUFpRDtBQUNsRSxlQUFXLFFBQVEsV0FBVyxPQUFPO0FBQ3BDLFdBQUssT0FBTyxPQUFPLFdBQVcsS0FBSyxLQUFLLEtBQUssRUFBRSxNQUFNLElBQUk7QUFBQSxJQUMxRDtBQUdBLFVBQU0sUUFBUSxDQUFDLEtBQUssS0FBSztBQUN6QixVQUFNLFFBQXNELENBQUM7QUFDN0QsV0FBTyxNQUFNLFFBQVE7QUFDcEIsaUJBQVcsUUFBUSxNQUFNLElBQUksR0FBSTtBQUNoQyxZQUFJLEtBQUssT0FBTztBQUNmLGdCQUFNLEtBQUssSUFBSTtBQUFBLFFBQ2hCLFdBQVcsS0FBSyxVQUFVO0FBQ3pCLGdCQUFNLEtBQUssS0FBSyxTQUFTLE9BQU8sQ0FBQztBQUFBLFFBQ2xDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsTUFDTixhQUFhLFdBQVc7QUFBQSxNQUN4QixTQUFTLE1BQU0sSUFBSSxPQUFLLHNCQUFzQixDQUFDLENBQUMsRUFBRSxPQUFPLFNBQVM7QUFBQSxJQUNuRTtBQUFBLEVBQ0Q7QUF2Qk8sRUFBQUEsYUFBUztBQUFBLEdBaENBO0FBMERWLElBQVU7QUFBQSxDQUFWLENBQVVDLGtCQUFWO0FBQ04sV0FBUyxrQkFBa0IsT0FBaUQ7QUFDM0UsV0FBTyxFQUFFLFNBQVMsTUFBTSxTQUFTLE9BQU8sTUFBTSxNQUFNO0FBQUEsRUFDckQ7QUFFQSxXQUFTLGFBQWExRSxXQUEwQztBQUMvRCxXQUFPLFVBQVVBLFlBQVcsU0FBUyxLQUFLQSxTQUFRLElBQUksTUFBTSxLQUFLQSxTQUFRO0FBQUEsRUFDMUU7QUFJQSxXQUFTLFdBQVdBLFdBQWdHO0FBQ25ILFFBQUksQ0FBQ0EsV0FBVTtBQUFFLGFBQU87QUFBQSxJQUFXO0FBQ25DLFdBQU8sbUJBQW1CQSxZQUFXLE1BQU0sR0FBR0EsU0FBUSxJQUFJLFNBQVMsR0FBR0EsU0FBUTtBQUFBLEVBQy9FO0FBRU8sV0FBUyxHQUFHLFlBQW1FO0FBQ3JGLFFBQUksV0FBVyxTQUFTLFdBQVcsV0FBVztBQUM3QyxZQUFNLFdBQW9DLENBQUM7QUFDM0MsVUFBSSxXQUFXLFVBQVU7QUFDeEIsbUJBQVcsVUFBVSxXQUFXLFVBQVU7QUFDekMsbUJBQVMsS0FBSztBQUFBLFlBQ2IsVUFBVSxPQUFPO0FBQUEsWUFDakIsVUFBVSxXQUFXLE9BQU8sUUFBUTtBQUFBLFlBQ3BDLE9BQU8sT0FBTztBQUFBLFVBQ2YsQ0FBQztBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQ0EsYUFBTyxJQUFJLE1BQU07QUFBQSxRQUNoQixXQUFXO0FBQUEsUUFDWCxXQUFXLFdBQVcsUUFBUTtBQUFBLFFBQzlCLFdBQVcsVUFBVSxJQUFJLE9BQUssSUFBSSxNQUFNO0FBQUEsVUFDdkMsRUFBRTtBQUFBLFVBQ0YsV0FBVyxFQUFFLFFBQVE7QUFBQSxVQUNyQixFQUFFO0FBQUEsUUFDSCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsT0FBTztBQUNOLGFBQU8sSUFBSSxNQUFNO0FBQUEsUUFDaEIsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLFFBQ1gsV0FBVyxXQUFXLFFBQVE7QUFBQSxNQUMvQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBNUJPLEVBQUEwRSxjQUFTO0FBOEJULFdBQVMsWUFBWSxVQUFpRTtBQUM1RixRQUFJLE9BQU8sU0FBUyxhQUFhLFlBQVksU0FBUyxXQUFXLEdBQUc7QUFDbkUsWUFBTSxJQUFJLE1BQU0sMEJBQTBCLFNBQVMsUUFBUSxFQUFFO0FBQUEsSUFDOUQ7QUFFQSxRQUFJLGNBQWMsVUFBVTtBQUMzQixhQUFPO0FBQUEsUUFDTixPQUFPLFNBQVM7QUFBQSxRQUNoQixVQUFVLGFBQWEsU0FBUyxRQUFRO0FBQUEsUUFDeEMsTUFBTSxXQUFXO0FBQUEsUUFDakIsVUFBVSxTQUFTLFNBQVMsU0FDekIsU0FBUyxTQUFTLElBQUksUUFBTSxFQUFFLE9BQU8sRUFBRSxVQUFVLFVBQVUsRUFBRSxZQUFZLGFBQWEsRUFBRSxRQUFRLEdBQUcsT0FBTyxFQUFFLE1BQU0sRUFBRSxJQUNwSDtBQUFBLE1BQ0o7QUFBQSxJQUNELE9BQU87QUFDTixhQUFPO0FBQUEsUUFDTixNQUFNLFdBQVc7QUFBQSxRQUNqQixNQUFNLFNBQVM7QUFBQSxRQUNmLE9BQU8sU0FBUztBQUFBLFFBQ2hCLFVBQVUsYUFBYSxTQUFTLFFBQVE7QUFBQSxNQUN6QztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBdEJPLEVBQUFBLGNBQVM7QUF3QlQsV0FBUyxTQUFTLGNBQXNCLElBQVksVUFBeUQ7QUFDbkgsVUFBTSwwQkFBMEIsU0FBUyxpQkFBaUI7QUFDMUQsVUFBTSwwQkFBMEIsU0FBUyxjQUFjO0FBQ3ZELFVBQU0sMEJBQTBCLFNBQVMsbUJBQW1CO0FBRTVELFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxLQUFLLFNBQVM7QUFBQSxNQUNkLFdBQVcsa0JBQWtCLFNBQVMsaUJBQWlCO0FBQUEsTUFDdkQsUUFBUSxTQUFTLGtCQUFrQixrQkFBa0IsU0FBUyxjQUFjO0FBQUEsTUFDNUUsYUFBYSxTQUFTLHVCQUF1QixrQkFBa0IsU0FBUyxtQkFBbUI7QUFBQSxNQUMzRixTQUFTLG9CQUFvQixNQUFNLGdCQUFnQixTQUFTLGNBQWMsU0FDekUsU0FBUyxjQUFjLElBQUksT0FBSyxPQUFPLG9CQUFvQixHQUFHLFlBQVksRUFBRSxTQUFTLENBQUMsSUFBSTtBQUFBLElBQzVGO0FBQUEsRUFDRDtBQWRPLEVBQUFBLGNBQVM7QUFBQSxHQXRFQTtBQXVGVixJQUFVO0FBQUEsQ0FBVixDQUFVQywyQkFBVjtBQUVDLFdBQVMsR0FBRyxPQUFxRTtBQUN2RixZQUFRLE9BQU87QUFBQSxNQUNkLEtBQUssVUFBVSxzQkFBc0I7QUFDcEMsZUFBTyxNQUFNLHNCQUFzQjtBQUFBLE1BRXBDLEtBQUssVUFBVSxzQkFBc0I7QUFDcEMsZUFBTyxNQUFNLHNCQUFzQjtBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQVJPLEVBQUFBLHVCQUFTO0FBQUEsR0FGQTtBQWFWLElBQVU7QUFBQSxDQUFWLENBQVVDLHVCQUFWO0FBRUMsV0FBUyxHQUFHLE1BQXNFO0FBQ3hGLFVBQU0sU0FBUyxJQUFJLE1BQU07QUFBQSxNQUN4QixXQUFXLEdBQUcsS0FBSyxJQUFJO0FBQUEsTUFDdkIsS0FBSztBQUFBLE1BQ0wsS0FBSyxVQUFVO0FBQUEsTUFDZixJQUFJLE9BQU8sS0FBSyxHQUFHO0FBQUEsTUFDbkIsTUFBTSxHQUFHLEtBQUssS0FBSztBQUFBLE1BQ25CLE1BQU0sR0FBRyxLQUFLLGNBQWM7QUFBQSxJQUM3QjtBQUVBLFdBQU8sYUFBYSxLQUFLO0FBQ3pCLFdBQU8sVUFBVSxLQUFLO0FBRXRCLFdBQU87QUFBQSxFQUNSO0FBZE8sRUFBQUEsbUJBQVM7QUFnQlQsV0FBUyxLQUFLLE1BQWdDLFdBQW9CLFFBQXdEO0FBRWhJLGdCQUFZLGFBQXVDLEtBQU07QUFDekQsYUFBUyxVQUFvQyxLQUFNO0FBRW5ELFFBQUksY0FBYyxVQUFhLFdBQVcsUUFBVztBQUNwRCxZQUFNLElBQUksTUFBTSxjQUFjO0FBQUEsSUFDL0I7QUFFQSxXQUFPO0FBQUEsTUFDTixZQUFZO0FBQUEsTUFDWixTQUFTO0FBQUEsTUFDVCxNQUFNLFdBQVcsS0FBSyxLQUFLLElBQUk7QUFBQSxNQUMvQixNQUFNLEtBQUs7QUFBQSxNQUNYLFFBQVEsS0FBSyxVQUFVO0FBQUEsTUFDdkIsS0FBSyxLQUFLO0FBQUEsTUFDVixPQUFPLE1BQU0sS0FBSyxLQUFLLEtBQUs7QUFBQSxNQUM1QixnQkFBZ0IsTUFBTSxLQUFLLEtBQUssY0FBYztBQUFBLE1BQzlDLE1BQU0sS0FBSyxNQUFNLElBQUksVUFBVSxJQUFJO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBcEJPLEVBQUFBLG1CQUFTO0FBQUEsR0FsQkE7QUF5Q1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsZUFBVjtBQUNDLFdBQVMsS0FBSyxPQUE2RDtBQUNqRixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLE1BQ04sT0FBTyxNQUFNO0FBQUEsTUFDYixTQUFTLE1BQU07QUFBQSxJQUNoQjtBQUFBLEVBQ0Q7QUFUTyxFQUFBQSxXQUFTO0FBQUEsR0FEQTtBQWFWLElBQVU7QUFBQSxDQUFWLENBQVVDLHNCQUFWO0FBQ0MsV0FBUyxHQUFHLE1BQWMsTUFBMkMsaUJBQThFO0FBQ3pKLFVBQU0sT0FBTyxLQUFLO0FBQ2xCLFFBQUksTUFBTTtBQUNULGFBQU8sSUFBSSxNQUFNO0FBQUEsUUFDaEIsSUFBSSxNQUFNLGlCQUFpQixLQUFLLE1BQU0sSUFBSSxPQUFPLEtBQUssR0FBRyxHQUFHLEtBQUssSUFBSSx5QkFBeUIsTUFBTSxnQkFBZ0IsS0FBSyxFQUFFLENBQUMsQ0FBQztBQUFBLE1BQUM7QUFBQSxJQUNoSTtBQUVBLFFBQUksU0FBUyxNQUFNLFdBQVcsS0FBSyxhQUFhO0FBQy9DLGFBQU8sSUFBSSxNQUFNLHlCQUF5QixjQUFjLEtBQUssV0FBVyxDQUFDO0FBQUEsSUFDMUU7QUFFQSxXQUFPLElBQUksTUFBTSx5QkFBeUIsS0FBSyxRQUFRO0FBQUEsRUFDeEQ7QUFaTyxFQUFBQSxrQkFBUztBQWNoQixpQkFBc0IsS0FBSyxNQUFjLE1BQW1ELEtBQWEsYUFBYSxHQUFpRDtBQUN0SyxVQUFNLGNBQWMsTUFBTSxLQUFLLFNBQVM7QUFFeEMsUUFBSSxTQUFTLE1BQU0sU0FBUztBQUMzQixhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0EsVUFBVTtBQUFBLFFBQ1YsVUFBVTtBQUFBLFFBQ1YsYUFBYSxpQkFBaUIsV0FBVztBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUVBLFVBQU0sWUFBWSxLQUFLLE9BQU87QUFDOUIsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUNWLFVBQVUsWUFBWTtBQUFBLFFBQ3JCLE1BQU0sVUFBVTtBQUFBLFFBQ2hCLEtBQUssVUFBVTtBQUFBLFFBQ2YsSUFBSyxVQUFxQyxXQUFZLFVBQWdDO0FBQUEsTUFDdkYsSUFBSTtBQUFBLElBQ0w7QUFBQSxFQUNEO0FBdEJBLEVBQUFBLGtCQUFzQjtBQXdCdEIsV0FBUyxpQkFBaUIsYUFBa0Q7QUFDM0UsV0FBTyxRQUFRLE1BQU0sV0FBVyxFQUFFLElBQUksVUFBUTtBQUM3QyxVQUFJLEtBQUssV0FBVyxHQUFHLEdBQUc7QUFDekIsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJO0FBQ0gsZUFBTyxJQUFJLE1BQU0sSUFBSTtBQUFBLE1BQ3RCLFFBQVE7QUFBQSxNQUVSO0FBRUEsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxXQUFTLGNBQWMsT0FBc0Q7QUFDNUUsV0FBTyxRQUFRLE9BQU8sTUFBTSxJQUFJLFVBQVE7QUFDdkMsYUFBTyxPQUFPLFNBQVMsV0FBVyxPQUFPLElBQUksT0FBTyxJQUFJO0FBQUEsSUFDekQsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEdBM0RnQjtBQThEVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxrQkFBVjtBQUNDLFdBQVMsZUFBZSxPQUF3QyxpQkFBOEU7QUFDcEosVUFBTSxPQUFPLE1BQU0sTUFBTSxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksTUFBTTtBQUM5QyxhQUFPLENBQUMsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLE1BQU0sZUFBZSxDQUFDO0FBQUEsSUFDL0QsQ0FBQztBQUNELFdBQU8sSUFBSSxNQUFNLGFBQWEsSUFBSTtBQUFBLEVBQ25DO0FBTE8sRUFBQUEsY0FBUztBQU9oQixpQkFBc0IsS0FBSyxjQUE2RTtBQUN2RyxVQUFNLFFBQVEsTUFBTSxRQUFRLElBQUksTUFBTSxLQUFLLGNBQWMsT0FBTyxDQUFDLE1BQU0sS0FBSyxNQUFNO0FBQ2pGLGFBQU8sQ0FBQyxNQUFNLE1BQU0saUJBQWlCLEtBQUssTUFBTSxLQUFLLENBQUM7QUFBQSxJQUN2RCxDQUFDLENBQUM7QUFFRixXQUFPLEVBQUUsTUFBTTtBQUFBLEVBQ2hCO0FBTkEsRUFBQUEsY0FBc0I7QUFRdEIsaUJBQXNCLFNBQVMsY0FBd0c7QUFDdEksVUFBTSxRQUFRLE1BQU0sUUFBUSxJQUFJLE1BQU0sS0FBSyxjQUFjLE9BQU8sQ0FBQyxNQUFNLEtBQUssTUFBTTtBQUNqRixhQUFPLENBQUMsTUFBTSxNQUFNLGlCQUFpQixLQUFLLE1BQU0sT0FBTyxNQUFNLEVBQUUsQ0FBQztBQUFBLElBQ2pFLENBQUMsQ0FBQztBQUVGLFdBQU8sRUFBRSxNQUFNO0FBQUEsRUFDaEI7QUFOQSxFQUFBQSxjQUFzQjtBQUFBLEdBaEJOO0FBeUJWLElBQVU7QUFBQSxDQUFWLENBQVVDLGtCQUFWO0FBQ0MsV0FBUyxLQUFLLFVBQStCLFNBQXVEO0FBQzFHLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFNBQVMsU0FBUyxlQUFlLFNBQVMsV0FBVztBQUFBLE1BQ3JELFlBQVksU0FBUyxXQUFXLFNBQVM7QUFBQSxNQUN6QyxTQUFTLFNBQVM7QUFBQSxNQUNsQixPQUFPLFNBQVM7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFSTyxFQUFBQSxjQUFTO0FBVVQsV0FBUyxHQUFHLFVBQThDO0FBQ2hFLFdBQU87QUFBQSxNQUNOLFFBQVEsU0FBUztBQUFBLE1BQ2pCLE9BQU8sU0FBUztBQUFBLE1BQ2hCLGFBQWEsU0FBUztBQUFBLE1BQ3RCLFNBQVMsU0FBUztBQUFBLElBQ25CO0FBQUEsRUFDRDtBQVBPLEVBQUFBLGNBQVM7QUFBQSxHQVhBO0FBcUJWLElBQVU7QUFBQSxDQUFWLENBQVVDLGtDQUFWO0FBQ0MsV0FBUyxHQUFHLE1BQXlFO0FBQzNGLFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSyxhQUFhLGdCQUFnQjtBQUFRLGVBQU8sTUFBTSw2QkFBNkI7QUFBQSxNQUNwRixLQUFLLGFBQWEsZ0JBQWdCO0FBQU0sZUFBTyxNQUFNLDZCQUE2QjtBQUFBLE1BQ2xGLEtBQUssYUFBYSxnQkFBZ0I7QUFBVyxlQUFPLE1BQU0sNkJBQTZCO0FBQUEsSUFDeEY7QUFBQSxFQUNEO0FBTk8sRUFBQUEsOEJBQVM7QUFRVCxXQUFTLEtBQUssTUFBeUU7QUFDN0YsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLLE1BQU0sNkJBQTZCO0FBQVEsZUFBTyxhQUFhLGdCQUFnQjtBQUFBLE1BQ3BGLEtBQUssTUFBTSw2QkFBNkI7QUFBTSxlQUFPLGFBQWEsZ0JBQWdCO0FBQUEsTUFDbEYsS0FBSyxNQUFNLDZCQUE2QjtBQUFXLGVBQU8sYUFBYSxnQkFBZ0I7QUFBQSxJQUN4RjtBQUNBLFdBQU8sYUFBYSxnQkFBZ0I7QUFBQSxFQUNyQztBQVBPLEVBQUFBLDhCQUFTO0FBQUEsR0FUQTtBQW1CVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw4QkFBVjtBQUVDLFdBQVMsR0FBRyxTQUFxRTtBQUN2RixVQUFNLFVBQVUsUUFBUSxRQUFRLElBQUksT0FBSztBQUN4QyxVQUFJLEVBQUUsU0FBUyxRQUFRO0FBQ3RCLGVBQU8sSUFBSSxzQkFBc0IsRUFBRSxPQUFPLEVBQUUsUUFBUTtBQUFBLE1BQ3JELFdBQVcsRUFBRSxTQUFTLGVBQWU7QUFDcEMsY0FBTUMsV0FBMEYsU0FBUyxFQUFFLE1BQU0sSUFBSSxVQUFRO0FBQzVILGNBQUksS0FBSyxTQUFTLFFBQVE7QUFDekIsbUJBQU8sSUFBSSxNQUFNLHNCQUFzQixLQUFLLE9BQU8sS0FBSyxRQUFRO0FBQUEsVUFDakUsV0FBVyxLQUFLLFNBQVMsUUFBUTtBQUNoQyxtQkFBTyxJQUFJLE1BQU0sc0JBQXNCLEtBQUssS0FBSyxRQUFRLEtBQUssUUFBUTtBQUFBLFVBQ3ZFLFdBQVcsS0FBSyxTQUFTLGNBQWM7QUFDdEMsbUJBQU8sSUFBSSxNQUFNLDJCQUEyQixLQUFLLEtBQUs7QUFBQSxVQUN2RCxPQUFPO0FBQ04sbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRCxDQUFDLENBQUM7QUFDRixlQUFPLElBQUksTUFBTSw0QkFBNEIsRUFBRSxZQUFZQSxVQUFTLEVBQUUsT0FBTztBQUFBLE1BQzlFLFdBQVcsRUFBRSxTQUFTLGFBQWE7QUFDbEMsZUFBTyxJQUFJLE1BQU0sc0JBQXNCLEVBQUUsTUFBTSxLQUFLLFFBQVEsRUFBRSxNQUFNLFFBQVE7QUFBQSxNQUM3RSxXQUFXLEVBQUUsU0FBUyxRQUFRO0FBQzdCLGVBQU8sSUFBSSxNQUFNLHNCQUFzQixFQUFFLEtBQUssUUFBUSxFQUFFLFFBQVE7QUFBQSxNQUNqRSxXQUFXLEVBQUUsU0FBUyxZQUFZO0FBQ2pDLGVBQU8sSUFBSSxNQUFNLDBCQUEwQixFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsVUFBVTtBQUFBLE1BQzlFO0FBRUEsYUFBTztBQUFBLElBQ1IsQ0FBQyxFQUFFLE9BQU8sT0FBSyxNQUFNLE1BQVM7QUFFOUIsVUFBTSxPQUFPLDZCQUE2QixHQUFHLFFBQVEsSUFBSTtBQUN6RCxVQUFNLFNBQVMsSUFBSSxNQUFNLHlCQUF5QixNQUFNLFNBQVMsUUFBUSxJQUFJO0FBQzdFLFdBQU87QUFBQSxFQUNSO0FBL0JPLEVBQUFELDBCQUFTO0FBaUNULFdBQVMsS0FBSyxTQUFxRTtBQUV6RixVQUFNLE9BQU8sNkJBQTZCLEtBQUssUUFBUSxJQUFJO0FBQzNELFVBQU0sT0FBTyxRQUFRO0FBRXJCLFFBQUksaUJBQWlCLFFBQVE7QUFDN0IsUUFBSSxPQUFPLG1CQUFtQixVQUFVO0FBQ3ZDLHVCQUFpQixDQUFDLElBQUksTUFBTSxzQkFBc0IsY0FBYyxDQUFDO0FBQUEsSUFDbEU7QUFFQSxVQUFNLFVBQVUsZUFBZSxJQUFJLENBQUMsTUFBcUM7QUFDeEUsVUFBSSxhQUFhLE1BQU0sNkJBQTZCO0FBQ25ELGVBQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLFlBQVksRUFBRTtBQUFBLFVBQ2QsT0FBTyxTQUFTLEVBQUUsUUFBUSxJQUFJLFVBQVE7QUFDckMsZ0JBQUksZ0JBQWdCLE1BQU0sdUJBQXVCO0FBQ2hELHFCQUFPO0FBQUEsZ0JBQ04sTUFBTTtBQUFBLGdCQUNOLE9BQU8sS0FBSztBQUFBLGdCQUNaLFVBQVUsS0FBSztBQUFBLGNBQ2hCO0FBQUEsWUFDRCxXQUFXLGdCQUFnQixNQUFNLDRCQUE0QjtBQUM1RCxxQkFBTztBQUFBLGdCQUNOLE1BQU07QUFBQSxnQkFDTixPQUFPLEtBQUs7QUFBQSxjQUNiO0FBQUEsWUFDRCxXQUFXLGdCQUFnQixNQUFNLHVCQUF1QjtBQUN2RCxxQkFBTztBQUFBLGdCQUNOLE1BQU07QUFBQSxnQkFDTixVQUFVLEtBQUs7QUFBQSxnQkFDZixNQUFNLFNBQVMsS0FBSyxLQUFLLElBQUk7QUFBQSxnQkFDN0IsVUFBVSxLQUFLO0FBQUEsY0FDaEI7QUFBQSxZQUNELE9BQU87QUFFTixxQkFBTztBQUFBLFlBQ1I7QUFBQSxVQUNELENBQUMsQ0FBQztBQUFBLFVBQ0YsU0FBUyxFQUFFO0FBQUEsUUFDWjtBQUFBLE1BQ0QsV0FBVyxhQUFhLE1BQU0sdUJBQXVCO0FBQ3BELFlBQUksZ0JBQWdCLENBQUMsR0FBRztBQUN2QixnQkFBTSxRQUF3QztBQUFBLFlBQzdDLFVBQVUsRUFBRTtBQUFBLFlBQ1osTUFBTSxTQUFTLEtBQUssRUFBRSxJQUFJO0FBQUEsVUFDM0I7QUFFQSxpQkFBTztBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ047QUFBQSxVQUNEO0FBQUEsUUFDRCxPQUFPO0FBQ04saUJBQU87QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLFVBQVUsRUFBRTtBQUFBLFlBQ1osTUFBTSxTQUFTLEtBQUssRUFBRSxJQUFJO0FBQUEsWUFDMUIsVUFBVSxFQUFFO0FBQUEsVUFDYjtBQUFBLFFBQ0Q7QUFBQSxNQUNELFdBQVcsYUFBYSxNQUFNLDJCQUEyQjtBQUN4RCxlQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixZQUFZLEVBQUU7QUFBQSxVQUNkLE1BQU0sRUFBRTtBQUFBLFVBQ1IsWUFBWSxFQUFFO0FBQUEsUUFDZjtBQUFBLE1BQ0QsV0FBVyxhQUFhLE1BQU0sdUJBQXVCO0FBQ3BELGVBQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLE9BQU8sRUFBRTtBQUFBLFFBQ1Y7QUFBQSxNQUNELE9BQU87QUFDTixZQUFJLE9BQU8sTUFBTSxVQUFVO0FBQzFCLGdCQUFNLElBQUksTUFBTSxzQ0FBc0M7QUFBQSxRQUN2RDtBQUVBLGVBQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQXpGTyxFQUFBQSwwQkFBUztBQUFBLEdBbkNBO0FBK0hWLElBQVU7QUFBQSxDQUFWLENBQVVFLCtCQUFWO0FBRUMsV0FBUyxHQUFHLFNBQXNFO0FBQ3hGLFVBQU0sVUFBVSxRQUFRLFFBQVEsSUFBSSxPQUFLO0FBQ3hDLFVBQUksRUFBRSxTQUFTLFFBQVE7QUFDdEIsZUFBTyxJQUFJLHNCQUFzQixFQUFFLE9BQU8sRUFBRSxRQUFRO0FBQUEsTUFDckQsV0FBVyxFQUFFLFNBQVMsZUFBZTtBQUNwQyxjQUFNRCxXQUEwRixFQUFFLE1BQU0sSUFBSSxVQUFRO0FBQ25ILGNBQUksS0FBSyxTQUFTLFFBQVE7QUFDekIsbUJBQU8sSUFBSSxNQUFNLHNCQUFzQixLQUFLLE9BQU8sS0FBSyxRQUFRO0FBQUEsVUFDakUsV0FBVyxLQUFLLFNBQVMsUUFBUTtBQUNoQyxtQkFBTyxJQUFJLE1BQU0sc0JBQXNCLEtBQUssS0FBSyxRQUFRLEtBQUssUUFBUTtBQUFBLFVBQ3ZFLE9BQU87QUFDTixtQkFBTyxJQUFJLE1BQU0sMkJBQTJCLEtBQUssS0FBSztBQUFBLFVBQ3ZEO0FBQUEsUUFDRCxDQUFDO0FBQ0QsZUFBTyxJQUFJLE1BQU0sNEJBQTRCLEVBQUUsWUFBWUEsVUFBUyxFQUFFLE9BQU87QUFBQSxNQUM5RSxXQUFXLEVBQUUsU0FBUyxhQUFhO0FBQ2xDLGVBQU8sSUFBSSxNQUFNLHNCQUFzQixFQUFFLE1BQU0sS0FBSyxRQUFRLEVBQUUsTUFBTSxRQUFRO0FBQUEsTUFDN0UsV0FBVyxFQUFFLFNBQVMsUUFBUTtBQUM3QixlQUFPLElBQUksTUFBTSxzQkFBc0IsRUFBRSxLQUFLLFFBQVEsRUFBRSxRQUFRO0FBQUEsTUFDakUsV0FBVyxFQUFFLFNBQVMsWUFBWTtBQUNqQyxlQUFPLElBQUksTUFBTSwwQkFBMEIsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLFFBQVE7QUFBQSxNQUNyRSxPQUFPO0FBQ04sZUFBTyxJQUFJLE1BQU0sMEJBQTBCLEVBQUUsWUFBWSxFQUFFLE1BQU0sRUFBRSxVQUFVO0FBQUEsTUFDOUU7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLE9BQU8sNkJBQTZCLEdBQUcsUUFBUSxJQUFJO0FBQ3pELFVBQU0sU0FBUyxJQUFJLE1BQU0sMEJBQTBCLE1BQU0sU0FBUyxRQUFRLElBQUk7QUFDOUUsV0FBTztBQUFBLEVBQ1I7QUE1Qk8sRUFBQUMsMkJBQVM7QUE4QlQsV0FBUyxLQUFLLFNBQXNFO0FBRTFGLFVBQU0sT0FBTyw2QkFBNkIsS0FBSyxRQUFRLElBQUk7QUFDM0QsVUFBTSxPQUFPLFFBQVE7QUFFckIsUUFBSSxpQkFBaUIsUUFBUTtBQUM3QixRQUFJLE9BQU8sbUJBQW1CLFVBQVU7QUFDdkMsdUJBQWlCLENBQUMsSUFBSSxNQUFNLHNCQUFzQixjQUFjLENBQUM7QUFBQSxJQUNsRTtBQUVBLFVBQU0sVUFBVSxlQUFlLElBQUksQ0FBQyxNQUFxQztBQUN4RSxVQUFJLGFBQWEsTUFBTSw2QkFBNkI7QUFDbkQsZUFBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sWUFBWSxFQUFFO0FBQUEsVUFDZCxPQUFPLFNBQVMsRUFBRSxRQUFRLElBQUksVUFBUTtBQUNyQyxnQkFBSSxnQkFBZ0IsTUFBTSx1QkFBdUI7QUFDaEQscUJBQU87QUFBQSxnQkFDTixNQUFNO0FBQUEsZ0JBQ04sT0FBTyxLQUFLO0FBQUEsZ0JBQ1osVUFBVSxLQUFLO0FBQUEsY0FDaEI7QUFBQSxZQUNELFdBQVcsZ0JBQWdCLE1BQU0sNEJBQTRCO0FBQzVELHFCQUFPO0FBQUEsZ0JBQ04sTUFBTTtBQUFBLGdCQUNOLE9BQU8sS0FBSztBQUFBLGNBQ2I7QUFBQSxZQUNELFdBQVcsZ0JBQWdCLE1BQU0sdUJBQXVCO0FBQ3ZELHFCQUFPO0FBQUEsZ0JBQ04sTUFBTTtBQUFBLGdCQUNOLFVBQVUsS0FBSztBQUFBLGdCQUNmLE1BQU0sU0FBUyxLQUFLLEtBQUssSUFBSTtBQUFBLGdCQUM3QixVQUFVLEtBQUs7QUFBQSxjQUNoQjtBQUFBLFlBQ0QsT0FBTztBQUVOLHFCQUFPO0FBQUEsWUFDUjtBQUFBLFVBQ0QsQ0FBQyxDQUFDO0FBQUEsVUFDRixTQUFTLEVBQUU7QUFBQSxRQUNaO0FBQUEsTUFDRCxXQUFXLGFBQWEsTUFBTSx1QkFBdUI7QUFDcEQsWUFBSSxnQkFBZ0IsQ0FBQyxHQUFHO0FBQ3ZCLGdCQUFNLFFBQXdDO0FBQUEsWUFDN0MsVUFBVSxFQUFFO0FBQUEsWUFDWixNQUFNLFNBQVMsS0FBSyxFQUFFLElBQUk7QUFBQSxVQUMzQjtBQUVBLGlCQUFPO0FBQUEsWUFDTixNQUFNO0FBQUEsWUFDTjtBQUFBLFVBQ0Q7QUFBQSxRQUNELE9BQU87QUFDTixpQkFBTztBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sVUFBVSxFQUFFO0FBQUEsWUFDWixNQUFNLFNBQVMsS0FBSyxFQUFFLElBQUk7QUFBQSxZQUMxQixVQUFVLEVBQUU7QUFBQSxVQUNiO0FBQUEsUUFDRDtBQUFBLE1BQ0QsV0FBVyxhQUFhLE1BQU0sMkJBQTJCO0FBQ3hELGVBQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLFlBQVksRUFBRTtBQUFBLFVBQ2QsTUFBTSxFQUFFO0FBQUEsVUFDUixZQUFZLEVBQUU7QUFBQSxRQUNmO0FBQUEsTUFDRCxXQUFXLGFBQWEsTUFBTSx1QkFBdUI7QUFDcEQsZUFBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sT0FBTyxFQUFFO0FBQUEsUUFDVjtBQUFBLE1BQ0QsV0FBVyxhQUFhLE1BQU0sMkJBQTJCO0FBQ3hELGVBQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLE9BQU8sRUFBRTtBQUFBLFVBQ1QsSUFBSSxFQUFFO0FBQUEsVUFDTixVQUFVLEVBQUU7QUFBQSxRQUNiO0FBQUEsTUFFRCxPQUFPO0FBQ04sWUFBSSxPQUFPLE1BQU0sVUFBVTtBQUMxQixnQkFBTSxJQUFJLE1BQU0sNENBQTRDO0FBQUEsUUFDN0Q7QUFFQSxlQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFqR08sRUFBQUEsMkJBQVM7QUFBQSxHQWhDQTtBQW9JakIsU0FBUyxnQkFBZ0IsTUFBNEM7QUFDcEUsUUFBTSxPQUFPLE9BQU8sS0FBSyxhQUFhLFdBQVcsS0FBSyxTQUFTLFlBQVksSUFBSTtBQUMvRSxVQUFRLE1BQU07QUFBQSxJQUNiLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUjtBQUNDLGFBQU87QUFBQSxFQUNUO0FBQ0Q7QUFFTyxJQUFVO0FBQUEsQ0FBVixDQUFVQyw4QkFBVjtBQUNDLFdBQVMsS0FBSyxNQUFrRTtBQUN0RixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixTQUFTLGVBQWUsS0FBSyxLQUFLLEtBQUs7QUFBQSxJQUN4QztBQUFBLEVBQ0Q7QUFMTyxFQUFBQSwwQkFBUztBQU1ULFdBQVMsR0FBRyxNQUFrRTtBQUNwRixXQUFPLElBQUksTUFBTSx5QkFBeUIsZUFBZSxHQUFHLEtBQUssT0FBTyxDQUFDO0FBQUEsRUFDMUU7QUFGTyxFQUFBQSwwQkFBUztBQUFBLEdBUEE7QUFZVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxrQ0FBVjtBQUNDLFdBQVMsS0FBSyxNQUErRTtBQUNuRyxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixLQUFLLEtBQUs7QUFBQSxNQUNWLFFBQVEsS0FBSztBQUFBLE1BQ2IsWUFBWSxLQUFLO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBUE8sRUFBQUEsOEJBQVM7QUFRVCxXQUFTLEdBQUcsTUFBK0U7QUFDakcsV0FBTyxJQUFJLE1BQU0sNkJBQTZCLElBQUksT0FBTyxLQUFLLEdBQUcsR0FBRyxLQUFLLFFBQVEsS0FBSyxVQUFVO0FBQUEsRUFDakc7QUFGTyxFQUFBQSw4QkFBUztBQUFBLEdBVEE7QUFjVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxpREFBVjtBQUNDLFdBQVMsS0FBSyxNQUEyRztBQUMvSCxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixTQUFTLGVBQWUsS0FBSyxLQUFLLEtBQUs7QUFBQSxNQUN2QyxpQkFBaUIsS0FBSztBQUFBLElBQ3ZCO0FBQUEsRUFDRDtBQU5PLEVBQUFBLDZDQUFTO0FBT1QsV0FBUyxHQUFHLE1BQTJHO0FBQzdILFdBQU8sSUFBSSxNQUFNLDRDQUE0QyxlQUFlLEdBQUcsS0FBSyxPQUFPLEdBQUcsS0FBSyxlQUFlO0FBQUEsRUFDbkg7QUFGTyxFQUFBQSw2Q0FBUztBQUFBLEdBUkE7QUFhVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxrQ0FBVjtBQUNDLFdBQVMsS0FBSyxNQUFtRTtBQUN2RixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixPQUFPLEtBQUs7QUFBQSxNQUNaLFNBQVMsZUFBZSxLQUFLLEtBQUssT0FBTztBQUFBLE1BQ3pDLE1BQU0sS0FBSztBQUFBLE1BQ1gsU0FBUyxLQUFLO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFSTyxFQUFBQSw4QkFBUztBQUFBLEdBREE7QUFZVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxzQ0FBVjtBQUNOLFdBQVMscUJBQXFCLE1BQXdFO0FBQ3JHLFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSyxNQUFNLGlCQUFpQjtBQUFNLGVBQU87QUFBQSxNQUN6QyxLQUFLLE1BQU0saUJBQWlCO0FBQWMsZUFBTztBQUFBLE1BQ2pELEtBQUssTUFBTSxpQkFBaUI7QUFBYSxlQUFPO0FBQUEsTUFDaEQ7QUFBUyxlQUFPO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBRUEsV0FBUyxxQkFBcUIsTUFBd0U7QUFDckcsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLO0FBQVEsZUFBTyxNQUFNLGlCQUFpQjtBQUFBLE1BQzNDLEtBQUs7QUFBZ0IsZUFBTyxNQUFNLGlCQUFpQjtBQUFBLE1BQ25ELEtBQUs7QUFBZSxlQUFPLE1BQU0saUJBQWlCO0FBQUEsTUFDbEQ7QUFBUyxlQUFPLE1BQU0saUJBQWlCO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBRU8sV0FBUyxLQUFLLE1BQTJFO0FBQy9GLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFdBQVcsS0FBSyxVQUFVLElBQUksUUFBTTtBQUFBLFFBQ25DLElBQUksRUFBRTtBQUFBLFFBQ04sTUFBTSxxQkFBcUIsRUFBRSxJQUFJO0FBQUEsUUFDakMsT0FBTyxFQUFFO0FBQUEsUUFDVCxTQUFTLEVBQUUsVUFBVSxlQUFlLEtBQUssRUFBRSxPQUFPLElBQUk7QUFBQSxRQUN0RCxTQUFTLEVBQUUsU0FBUyxJQUFJLFVBQVEsRUFBRSxJQUFJLElBQUksSUFBSSxPQUFPLElBQUksT0FBTyxPQUFPLE9BQU8sSUFBSSxLQUFLLEVBQUUsRUFBRTtBQUFBLFFBQzNGLGNBQWMsRUFBRTtBQUFBLFFBQ2hCLG9CQUFvQixFQUFFO0FBQUEsTUFDdkIsRUFBRTtBQUFBLE1BQ0YsV0FBVyxLQUFLO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBZE8sRUFBQUEsa0NBQVM7QUFnQlQsV0FBUyxHQUFHLE1BQTJFO0FBQzdGLFVBQU0sWUFBWSxLQUFLLFVBQVUsSUFBSSxPQUFLLElBQUksTUFBTTtBQUFBLE1BQ25ELEVBQUU7QUFBQSxNQUNGLHFCQUFxQixFQUFFLElBQUk7QUFBQSxNQUMzQixFQUFFO0FBQUEsTUFDRjtBQUFBLFFBQ0MsU0FBUyxFQUFFLFVBQVcsT0FBTyxFQUFFLFlBQVksV0FBVyxJQUFJLE1BQU0sZUFBZSxFQUFFLE9BQU8sSUFBSSxlQUFlLEdBQUcsRUFBRSxPQUFPLElBQUs7QUFBQSxRQUM1SCxTQUFTLEVBQUUsU0FBUyxJQUFJLFVBQVE7QUFBQSxVQUMvQixJQUFJLElBQUk7QUFBQSxVQUNSLE9BQU8sSUFBSTtBQUFBLFVBQ1gsT0FBTyxJQUFJO0FBQUEsUUFDWixFQUFFO0FBQUEsUUFDRixjQUFjLEVBQUU7QUFBQSxRQUNoQixvQkFBb0IsRUFBRTtBQUFBLE1BQ3ZCO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxJQUFJLE1BQU0saUNBQWlDLFdBQVcsS0FBSyxTQUFTO0FBQUEsRUFDNUU7QUFqQk8sRUFBQUEsa0NBQVM7QUFBQSxHQW5DQTtBQXVEVixJQUFVO0FBQUEsQ0FBVixDQUFVQywyQkFBVjtBQUNDLFdBQVMsS0FBSyxNQUFzRDtBQUMxRSxVQUFNLEVBQUUsT0FBTyxRQUFRLElBQUk7QUFDM0IsYUFBUyxRQUFRLE9BQXNDQyxVQUFtRTtBQUN6SCxhQUFPLE1BQU0sSUFBSSxVQUFRO0FBQ3hCLGNBQU0sUUFBUSxJQUFJLFNBQVNBLFVBQVMsS0FBSyxJQUFJO0FBQzdDLGVBQU87QUFBQSxVQUNOLE9BQU8sS0FBSztBQUFBLFVBQ1osS0FBSztBQUFBLFVBQ0wsVUFBVSxLQUFLLFlBQVksUUFBUSxLQUFLLFVBQVUsS0FBSztBQUFBLFFBQ3hEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUNBLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxRQUNULE9BQU8sU0FBUyxPQUFPO0FBQUEsUUFDdkIsS0FBSztBQUFBLFFBQ0wsVUFBVSxRQUFRLE9BQU8sT0FBTztBQUFBLE1BQ2pDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFwQk8sRUFBQUQsdUJBQVM7QUFxQlQsV0FBUyxHQUFHLE1BQTJEO0FBQzdFLFVBQU0sV0FBVyxPQUEwRCxLQUFLLFFBQVE7QUFDeEYsYUFBUyxRQUFRRSxRQUEyRjtBQUMzRyxhQUFPQSxPQUFNLElBQUksVUFBUTtBQUN4QixlQUFPO0FBQUEsVUFDTixNQUFNLEtBQUs7QUFBQSxVQUNYLFVBQVUsS0FBSyxZQUFZLFFBQVEsS0FBSyxRQUFRO0FBQUEsUUFDakQ7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBRUEsVUFBTSxVQUFVLFNBQVM7QUFDekIsVUFBTSxRQUFRLFNBQVMsV0FBVyxRQUFRLFNBQVMsUUFBUSxJQUFJLENBQUM7QUFDaEUsV0FBTyxJQUFJLE1BQU0seUJBQXlCLE9BQU8sT0FBTztBQUFBLEVBQ3pEO0FBZE8sRUFBQUYsdUJBQVM7QUFBQSxHQXRCQTtBQXVDVixJQUFVO0FBQUEsQ0FBVixDQUFVRywrQkFBVjtBQUNDLFdBQVMsS0FBSyxNQUFzRTtBQUMxRixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixlQUFlO0FBQUEsUUFDZCxPQUFPLEtBQUs7QUFBQSxRQUNaLFdBQVcsS0FBSyxNQUFNLElBQUksWUFBVTtBQUFBLFVBQ25DLGFBQWEsTUFBTTtBQUFBLFVBQ25CLGFBQWEsTUFBTTtBQUFBLFVBQ25CLGFBQWEsTUFBTTtBQUFBLFVBQ25CLE9BQU8sTUFBTTtBQUFBLFVBQ2IsU0FBUyxNQUFNO0FBQUEsUUFDaEIsRUFBRTtBQUFBLE1BQ0g7QUFBQSxNQUNBLFVBQVUsS0FBSztBQUFBLElBQ2hCO0FBQUEsRUFDRDtBQWZPLEVBQUFBLDJCQUFTO0FBZ0JULFdBQVMsR0FBRyxNQUFzRTtBQUN4RixVQUFNLFlBQVksS0FBSyxjQUFjLFVBQVUsSUFBSSxlQUFhO0FBQUEsTUFDL0QsYUFBYSxTQUFTLGNBQWMsSUFBSSxPQUFPLFNBQVMsV0FBVyxJQUFJO0FBQUEsTUFDdkUsYUFBYSxTQUFTLGNBQWMsSUFBSSxPQUFPLFNBQVMsV0FBVyxJQUFJO0FBQUEsTUFDdkUsYUFBYSxTQUFTLGNBQWMsSUFBSSxPQUFPLFNBQVMsV0FBVyxJQUFJO0FBQUEsTUFDdkUsT0FBTyxTQUFTO0FBQUEsTUFDaEIsU0FBUyxTQUFTO0FBQUEsSUFDbkIsRUFBRTtBQUNGLFdBQU8sSUFBSSxNQUFNLDBCQUEwQixXQUFXLEtBQUssY0FBYyxPQUFPLEtBQUssUUFBUTtBQUFBLEVBQzlGO0FBVE8sRUFBQUEsMkJBQVM7QUFBQSxHQWpCQTtBQTZCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw0QkFBVjtBQUNDLFdBQVMsS0FBSyxNQUF1RTtBQUUzRixVQUFNLFFBQVEsQ0FBQyxVQUF3QyxJQUFJLE1BQU0sS0FBSztBQUN0RSxVQUFNLHNCQUFzQixDQUFDLFVBQXFELFVBQVU7QUFFNUYsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sTUFBTSxLQUFLO0FBQUEsTUFDWCxpQkFBaUIsTUFBTSxLQUFLLEtBQUssSUFDOUIsS0FBSyxRQUNMLG9CQUFvQixLQUFLLEtBQUssSUFDN0IsZ0JBQWdCLEtBQUssS0FBSyxLQUFLLElBQy9CLFNBQVMsS0FBSyxLQUFLLEtBQUs7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFkTyxFQUFBQSx3QkFBUztBQWdCVCxXQUFTLEdBQUcsTUFBdUU7QUFDekYsVUFBTSxRQUFRLE9BQW9DLElBQUk7QUFDdEQsV0FBTyxJQUFJLE1BQU07QUFBQSxNQUNoQixJQUFJLE1BQU0sTUFBTSxlQUFlLElBQzVCLE1BQU0sa0JBQ04sY0FBYyxNQUFNLGtCQUNuQixnQkFBZ0IsR0FBRyxNQUFNLGVBQWUsSUFDeEMsU0FBUyxHQUFHLE1BQU0sZUFBZTtBQUFBLE1BQ3JDLEtBQUs7QUFBQSxJQUNOO0FBQUEsRUFDRDtBQVZPLEVBQUFBLHdCQUFTO0FBQUEsR0FqQkE7QUE4QlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsOEJBQVY7QUFDQyxXQUFTLEtBQUssTUFBa0U7QUFDdEYsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sU0FBUyxlQUFlLEtBQUssS0FBSyxLQUFLO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBTE8sRUFBQUEsMEJBQVM7QUFNVCxXQUFTLEdBQUcsTUFBa0U7QUFDcEYsV0FBTyxJQUFJLE1BQU0seUJBQXlCLEtBQUssUUFBUSxLQUFLO0FBQUEsRUFDN0Q7QUFGTyxFQUFBQSwwQkFBUztBQUFBLEdBUEE7QUFZVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxzQ0FBVjtBQUNDLFdBQVMsS0FBSyxNQUF1RTtBQUMzRixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixPQUFPLEtBQUs7QUFBQSxNQUNaLElBQUksS0FBSztBQUFBLE1BQ1QsVUFBVSxLQUFLO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBUE8sRUFBQUEsa0NBQVM7QUFRVCxXQUFTLEdBQUcsTUFBdUU7QUFDekYsV0FBTyxJQUFJLE1BQU0saUNBQWlDLEtBQUssU0FBUyxJQUFJLEtBQUssSUFBSSxLQUFLLFFBQVE7QUFBQSxFQUMzRjtBQUZPLEVBQUFBLGtDQUFTO0FBQUEsR0FUQTtBQWNWLElBQVU7QUFBQSxDQUFWLENBQVVDLDBCQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQXVEO0FBQzNFLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFVBQVUsS0FBSztBQUFBLE1BQ2YsWUFBWSxLQUFLO0FBQUEsTUFDakIsZUFBZSxLQUFLO0FBQUEsTUFDcEIsVUFBVSxLQUFLO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBUk8sRUFBQUEsc0JBQVM7QUFTVCxXQUFTLEdBQUcsTUFBdUQ7QUFDekUsV0FBTyxJQUFJLE1BQU0scUJBQXFCLEtBQUssVUFBVSxLQUFLLFlBQVksS0FBSyxlQUFlLEtBQUssUUFBUTtBQUFBLEVBQ3hHO0FBRk8sRUFBQUEsc0JBQVM7QUFBQSxHQVZBO0FBZVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsbUNBQVY7QUFDQyxXQUFTLEtBQUssTUFBeUU7QUFDN0YsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sSUFBSSxLQUFLO0FBQUEsTUFDVCxPQUFPLEtBQUs7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQU5PLEVBQUFBLCtCQUFTO0FBQUEsR0FEQTtBQVVWLElBQVU7QUFBQSxDQUFWLENBQVVDLHdDQUFWO0FBQ04sUUFBTSxjQUFjLG9CQUFJLElBQW1ELENBQUMsbUJBQW1CLGdCQUFnQixVQUFVLENBQUM7QUFFbkgsV0FBUyxLQUFLLE1BQW1GO0FBQ3ZHLFVBQU0sUUFBUSxZQUFZLElBQUksS0FBSyxjQUErRCxJQUMvRixLQUFLLGlCQUNMO0FBQ0gsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sZUFBZSxLQUFLO0FBQUEsTUFDcEIsbUJBQW1CLEtBQUs7QUFBQSxNQUN4QixnQkFBZ0I7QUFBQSxNQUNoQixZQUFZLEtBQUssSUFBSSxHQUFHLEtBQUssSUFBSSxHQUFHLEtBQUssVUFBVSxDQUFDO0FBQUEsSUFDckQ7QUFBQSxFQUNEO0FBWE8sRUFBQUEsb0NBQVM7QUFZVCxXQUFTLEdBQUcsTUFBbUY7QUFDckcsV0FBTyxJQUFJLE1BQU0sbUNBQW1DLEtBQUssZUFBZSxLQUFLLG1CQUFtQixLQUFLLGdCQUFnQixLQUFLLFVBQVU7QUFBQSxFQUNySTtBQUZPLEVBQUFBLG9DQUFTO0FBQUEsR0FmQTtBQW9CVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw2QkFBVjtBQUNDLFdBQVMsS0FBSyxNQUFnRTtBQUNwRixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixTQUFTLGVBQWUsS0FBSyxLQUFLLEtBQUs7QUFBQSxJQUN4QztBQUFBLEVBQ0Q7QUFMTyxFQUFBQSx5QkFBUztBQU1ULFdBQVMsR0FBRyxNQUFnRTtBQUNsRixXQUFPLElBQUksTUFBTSx3QkFBd0IsS0FBSyxRQUFRLEtBQUs7QUFBQSxFQUM1RDtBQUZPLEVBQUFBLHlCQUFTO0FBQUEsR0FQQTtBQVlWLElBQVU7QUFBQSxDQUFWLENBQVVDLDBCQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQTBEO0FBQzlFLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFNBQVMsZUFBZSxLQUFLLEtBQUssS0FBSztBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQUxPLEVBQUFBLHNCQUFTO0FBTVQsV0FBUyxHQUFHLE1BQTBEO0FBQzVFLFdBQU8sSUFBSSxNQUFNLHFCQUFxQixLQUFLLFFBQVEsS0FBSztBQUFBLEVBQ3pEO0FBRk8sRUFBQUEsc0JBQVM7QUFBQSxHQVBBO0FBWVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsZ0NBQVY7QUFDQyxXQUFTLEtBQUssTUFBc0U7QUFDMUYsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sWUFBWSxLQUFLO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBTE8sRUFBQUEsNEJBQVM7QUFBQSxHQURBO0FBU1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsaUNBQVY7QUFDQyxXQUFTLEtBQUssTUFBMEYsbUJBQXNDLG9CQUFtRTtBQUV2TixRQUFJO0FBQ0osUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixVQUFJLENBQUMsS0FBSyxLQUFLO0FBQ2QsY0FBTSxJQUFJLE1BQU0sMERBQTBEO0FBQUEsTUFDM0U7QUFDQSxnQkFBVTtBQUFBLFFBQ1QsT0FBTztBQUFBLFFBQ1AsSUFBSTtBQUFBLFFBQ0osV0FBVyxDQUFDLEtBQUssR0FBRztBQUFBLE1BQ3JCO0FBQUEsSUFDRCxPQUFPO0FBQ04sZ0JBQVUsa0JBQWtCLFdBQVcsS0FBSyxTQUFTLGtCQUFrQjtBQUFBLElBQ3hFO0FBQ0EsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sUUFBUSxLQUFLO0FBQUEsTUFDYixPQUFPLEtBQUs7QUFBQSxNQUNaLGFBQWEsS0FBSztBQUFBLE1BQ2xCLEtBQUssS0FBSztBQUFBLE1BQ1YsU0FBUyxLQUFLO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBeEJPLEVBQUFBLDZCQUFTO0FBQUEsR0FEQTtBQTRCVixJQUFVO0FBQUEsQ0FBVixDQUFVQywwQkFBVjtBQUNDLFdBQVMsS0FBSyxNQUEwRDtBQUM5RSxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixLQUFLLEtBQUs7QUFBQSxNQUNWLE9BQU8sTUFBTSxLQUFLLEtBQUssS0FBSztBQUFBLElBQzdCO0FBQUEsRUFDRDtBQU5PLEVBQUFBLHNCQUFTO0FBT1QsV0FBUyxHQUFHLE1BQTBEO0FBQzVFLFdBQU8sSUFBSSxNQUFNLHFCQUFxQixJQUFJLE9BQU8sS0FBSyxHQUFHLEdBQUcsTUFBTSxHQUFHLEtBQUssS0FBSyxDQUFDO0FBQUEsRUFDakY7QUFGTyxFQUFBQSxzQkFBUztBQUFBLEdBUkE7QUFhVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw0QkFBVjtBQUNDLFdBQVMsS0FBSyxNQUF3RztBQUc1SCxRQUFJO0FBQ0osUUFBSTtBQUVKLFFBQUksS0FBSyxvQkFBb0IsNEJBQTRCLEtBQUssZ0JBQWdCLEdBQUc7QUFFaEYsc0JBQWdCLDBCQUEwQixLQUFLLGtCQUFrQixLQUFLLE9BQU87QUFDN0UseUJBQW1CO0FBQUEsSUFDcEIsT0FBTztBQUNOLHlCQUFtQixLQUFLLG1CQUFtQix3QkFBd0IsS0FBSyxnQkFBZ0IsSUFBSTtBQUFBLElBQzdGO0FBRUEsVUFBTSxlQUFlLEtBQUssaUJBQWlCLFdBQ3hDLDJCQUEyQixTQUMzQixLQUFLLGlCQUFpQix3QkFDckIsMkJBQTJCLHNCQUMzQjtBQUtKLFFBQUksS0FBSyxxQkFBcUI7QUFDN0IsYUFBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sWUFBWSxLQUFLO0FBQUEsUUFDakIsVUFBVSxLQUFLO0FBQUEsUUFDZixZQUFZLENBQUMsQ0FBQyxLQUFLO0FBQUEsUUFDbkIsbUJBQW1CLEtBQUssb0JBQW9CLGVBQWUsS0FBSyxLQUFLLGlCQUFpQixJQUFJO0FBQUEsUUFDMUYsa0JBQWtCLEtBQUssbUJBQW1CLGVBQWUsS0FBSyxLQUFLLGdCQUFnQixJQUFJO0FBQUEsUUFDdkY7QUFBQSxRQUNBLHNCQUFzQixLQUFLO0FBQUEsUUFDM0I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFlBQVksS0FBSztBQUFBLE1BQ2pCLFFBQVEsS0FBSztBQUFBLE1BQ2IsbUJBQW1CLEtBQUssb0JBQW9CLGVBQWUsS0FBSyxLQUFLLGlCQUFpQixJQUFJLEtBQUs7QUFBQSxNQUMvRixlQUFlLEtBQUssZ0JBQWdCLGVBQWUsS0FBSyxLQUFLLGFBQWEsSUFBSTtBQUFBLE1BQzlFLGtCQUFrQixLQUFLLG1CQUFtQixlQUFlLEtBQUssS0FBSyxnQkFBZ0IsSUFBSTtBQUFBLE1BQ3ZGLGFBQWEsS0FBSztBQUFBLE1BQ2xCLFlBQVk7QUFBQSxNQUNaLFFBQVEsZUFBZTtBQUFBO0FBQUEsTUFFdkI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0Esc0JBQXNCLEtBQUs7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUF0RE8sRUFBQUEsd0JBQVM7QUF3RGhCLFdBQVMsNEJBQTRCLE1BQXFEO0FBQ3pGLFdBQU8sU0FBUyxRQUFRLE9BQU8sU0FBUyxZQUN2QyxXQUFXLFFBQVEsT0FBTyxLQUFLLFVBQVUsWUFDekMsWUFBWSxRQUFRLE1BQU0sUUFBUSxLQUFLLE1BQU07QUFBQSxFQUMvQztBQUVBLFdBQVMsMEJBQTBCLE1BQXdDLFNBQWtEO0FBQzVILFdBQU87QUFBQSxNQUNOLE9BQU8sS0FBSztBQUFBLE1BQ1osUUFBUSxLQUFLLE9BQU8sSUFBSSxDQUFDLE1BQU07QUFDOUIsY0FBTSxTQUFTLEVBQUUsU0FBUyxXQUFXLE9BQU87QUFDNUMsZUFBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sVUFBVSxFQUFFO0FBQUEsVUFDWixPQUFPLFNBQVMsU0FBUyxLQUFLLEVBQUUsSUFBSSxFQUFFLFNBQVMsSUFBSSxhQUFhLFNBQVMsS0FBSyxFQUFFLElBQUksQ0FBQztBQUFBLFVBQ3JGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLE1BQ0QsU0FBUyxXQUFXO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBRUEsV0FBUyx3QkFBd0IsTUFBZ0I7QUFFaEQsUUFBSSxhQUFhLFFBQVEsY0FBYyxNQUFNO0FBQzVDLGFBQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLFNBQVMsS0FBSztBQUFBLFFBQ2QsVUFBVSxLQUFLO0FBQUEsTUFDaEI7QUFBQSxJQUNELFdBQVcsaUJBQWlCLFFBQVEsY0FBYyxNQUFNO0FBQ3ZELFlBQU0sd0JBQXdCLEtBQUsseUJBQXlCLE9BQU8sS0FBSyxzQkFBc0IsZ0JBQWdCLFdBQVc7QUFBQSxRQUN4SCxhQUFhLEtBQUssc0JBQXNCO0FBQUEsUUFDeEMsVUFBVSxLQUFLLHNCQUFzQjtBQUFBLE1BQ3RDLElBQUk7QUFDSixZQUFNLFNBQTBDO0FBQUEsUUFDL0MsTUFBTTtBQUFBLFFBQ047QUFBQSxRQUNBLGFBQWEsS0FBSztBQUFBLFFBQ2xCLFVBQVUsS0FBSztBQUFBLFFBQ2YsdUJBQXVCLE9BQU8sS0FBSyxRQUFRLFNBQVMsV0FBVztBQUFBLFVBQzlELE1BQU0sS0FBSyxPQUFPO0FBQUEsUUFDbkIsSUFBSTtBQUFBLFFBQ0osc0JBQXNCLEtBQUssUUFBUTtBQUFBLFVBQ2xDLFVBQVUsS0FBSyxNQUFNO0FBQUEsVUFDckIsVUFBVSxLQUFLLE1BQU07QUFBQSxRQUN0QixJQUFJO0FBQUEsTUFDTDtBQUVBLGFBQU87QUFBQSxJQUNSLFdBQVcsY0FBYyxRQUFRLE1BQU0sUUFBUSxLQUFLLFFBQVEsR0FBRztBQUU5RCxhQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsUUFDTixVQUFVLEtBQUssU0FBUyxJQUFJLENBQUMsVUFBZTtBQUFBLFVBQzNDLElBQUksT0FBTyxLQUFLLEVBQUU7QUFBQSxVQUNsQixPQUFPLEtBQUs7QUFBQSxVQUNaLFFBQVEsdUJBQXVCLEtBQUssTUFBTTtBQUFBLFFBQzNDLEVBQUU7QUFBQSxNQUNIO0FBQUEsSUFDRCxXQUFXLFdBQVcsUUFBUSxZQUFZLFFBQVEsQ0FBQyxNQUFNLFFBQVEsS0FBSyxNQUFNLEdBQUc7QUFFOUUsYUFBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sT0FBTyxPQUFPLEtBQUssVUFBVSxXQUFXLEtBQUssUUFBUTtBQUFBLFFBQ3JELFFBQVEsT0FBTyxLQUFLLFdBQVcsV0FBVyxLQUFLLFNBQVM7QUFBQSxNQUN6RDtBQUFBLElBQ0QsV0FBVyxRQUFRLFlBQVksUUFBUSxNQUFNLFFBQVEsS0FBSyxNQUFNLEdBQUc7QUFFbEUsYUFBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sUUFBUSxLQUFLLE9BQU8sSUFBSSxDQUFDLE1BQVc7QUFDbkMsY0FBSSxhQUFhLE1BQU0sVUFBVTtBQUNoQyxtQkFBTyxTQUFTLEtBQUssQ0FBQztBQUFBLFVBQ3ZCLE9BQU87QUFDTixtQkFBTyxJQUFJLE9BQU8sQ0FBQztBQUFBLFVBQ3BCO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsV0FBVyxnQkFBZ0IsTUFBTSxnQ0FBZ0M7QUFFaEUsYUFBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sYUFBYSxLQUFLO0FBQUEsUUFDbEIsV0FBVyxLQUFLO0FBQUEsUUFDaEIsUUFBUSxLQUFLO0FBQUEsUUFDYixRQUFRLEtBQUs7QUFBQSxRQUNiLFdBQVcsS0FBSztBQUFBLE1BQ2pCO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyx1QkFBdUIsUUFBK0M7QUFFOUUsWUFBUSxRQUFRO0FBQUEsTUFDZixLQUFLLE1BQU0sZUFBZTtBQUN6QixlQUFPO0FBQUEsTUFDUixLQUFLLE1BQU0sZUFBZTtBQUN6QixlQUFPO0FBQUEsTUFDUixLQUFLLE1BQU0sZUFBZTtBQUN6QixlQUFPO0FBQUEsTUFDUjtBQUNDLGVBQU87QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUVBLFdBQVMsdUJBQXVCLFFBQXNDO0FBQ3JFLFlBQVEsUUFBUTtBQUFBLE1BQ2YsS0FBSztBQUNKLGVBQU8sTUFBTSxlQUFlO0FBQUEsTUFDN0IsS0FBSztBQUNKLGVBQU8sTUFBTSxlQUFlO0FBQUEsTUFDN0IsS0FBSztBQUNKLGVBQU8sTUFBTSxlQUFlO0FBQUEsTUFDN0I7QUFDQyxlQUFPLE1BQU0sZUFBZTtBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUVPLFdBQVMsR0FBRyxNQUEwQztBQUM1RCxVQUFNLGlCQUFpQixJQUFJLE1BQU07QUFBQSxNQUNoQyxLQUFLLFVBQVUsS0FBSztBQUFBLE1BQ3BCLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxJQUNOO0FBRUEsUUFBSSxLQUFLLG1CQUFtQjtBQUMzQixxQkFBZSxvQkFBb0IsS0FBSztBQUFBLElBQ3pDO0FBQ0EsUUFBSSxLQUFLLGVBQWU7QUFDdkIscUJBQWUsZ0JBQWdCLEtBQUs7QUFBQSxJQUNyQztBQUNBLFFBQUksS0FBSyxrQkFBa0I7QUFDMUIscUJBQWUsbUJBQW1CLEtBQUs7QUFBQSxJQUN4QztBQUNBLFFBQUksS0FBSyxnQkFBZ0IsUUFBVztBQUNuQyxxQkFBZSxjQUFjLEtBQUs7QUFBQSxJQUNuQztBQUNBLFFBQUksS0FBSyxlQUFlLFFBQVc7QUFDbEMscUJBQWUsYUFBYSxLQUFLO0FBQUEsSUFDbEM7QUFDQSxRQUFJLEtBQUssa0JBQWtCO0FBQzFCLHFCQUFlLG1CQUFtQixvQ0FBb0MsS0FBSyxnQkFBZ0I7QUFBQSxJQUM1RjtBQUNBLG1CQUFlLHVCQUF1QixLQUFLO0FBQzNDLG1CQUFlLGVBQWUsS0FBSztBQUVuQyxXQUFPO0FBQUEsRUFDUjtBQTdCTyxFQUFBQSx3QkFBUztBQStCaEIsV0FBUyxvQ0FBb0MsTUFBZ0I7QUFFNUQsUUFBSSxLQUFLLFNBQVMsWUFBWTtBQUM3QixVQUFJLEtBQUssYUFBYTtBQUVyQixjQUFNLFNBQWM7QUFBQSxVQUNuQixhQUFhLEtBQUs7QUFBQSxVQUNsQixVQUFVLEtBQUs7QUFBQSxRQUNoQjtBQUdBLFlBQUksS0FBSyx1QkFBdUI7QUFDL0IsaUJBQU8sU0FBUztBQUFBLFlBQ2YsTUFBTSxLQUFLLHNCQUFzQjtBQUFBLFlBQ2pDLFdBQVcsS0FBSyxzQkFBc0I7QUFBQSxZQUN0QyxXQUFXLEtBQUssc0JBQXNCO0FBQUEsVUFDdkM7QUFBQSxRQUNEO0FBR0EsWUFBSSxLQUFLLHNCQUFzQjtBQUM5QixpQkFBTyxRQUFRO0FBQUEsWUFDZCxVQUFVLEtBQUsscUJBQXFCO0FBQUEsWUFDcEMsVUFBVSxLQUFLLHFCQUFxQjtBQUFBLFVBQ3JDO0FBQUEsUUFDRDtBQUVBLGVBQU87QUFBQSxNQUNSLE9BQU87QUFFTixlQUFPO0FBQUEsVUFDTixTQUFTLEtBQUs7QUFBQSxVQUNkLFVBQVUsS0FBSztBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUFBLElBQ0QsV0FBVyxLQUFLLFNBQVMsYUFBYTtBQUNyQyxhQUFPO0FBQUEsUUFDTixhQUFhLEtBQUs7QUFBQSxRQUNsQixVQUFVLEtBQUs7QUFBQSxNQUNoQjtBQUFBLElBQ0QsV0FBVyxLQUFLLFNBQVMsWUFBWTtBQUVwQyxhQUFPO0FBQUEsUUFDTixVQUFVLEtBQUssU0FBUyxJQUFJLENBQUMsTUFBVyxVQUFrQjtBQUN6RCxnQkFBTSxTQUFTLE9BQU8sS0FBSyxFQUFFO0FBQzdCLGdCQUFNLEtBQUssT0FBTyxTQUFTLE1BQU0sSUFBSSxTQUFTO0FBQzlDLGlCQUFPO0FBQUEsWUFDTjtBQUFBLFlBQ0EsT0FBTyxLQUFLO0FBQUEsWUFDWixRQUFRLHVCQUF1QixLQUFLLE1BQU07QUFBQSxVQUMzQztBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxHQXZRZ0I7QUEwUVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsY0FBVjtBQUNDLFdBQVMsS0FBSyxNQUFzRDtBQUMxRSxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixTQUFTLGVBQWUsS0FBSyxLQUFLLEtBQUs7QUFBQSxJQUN4QztBQUFBLEVBQ0Q7QUFMTyxFQUFBQSxVQUFTO0FBQUEsR0FEQTtBQVNWLElBQVU7QUFBQSxDQUFWLENBQVVDLG9CQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQTJDO0FBQy9ELFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFNBQVMsT0FBTyxTQUFTLFdBQVcsZUFBZSxLQUFLLElBQUksSUFBSTtBQUFBLElBQ2pFO0FBQUEsRUFDRDtBQUxPLEVBQUFBLGdCQUFTO0FBQUEsR0FEQTtBQVNWLElBQVU7QUFBQSxDQUFWLENBQVVDLG1DQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQTRDLG1CQUFzQyxvQkFBOEQ7QUFFcEssVUFBTSxVQUFVLGtCQUFrQixXQUFXLEtBQUssT0FBTyxrQkFBa0IsS0FBSyxFQUFFLFNBQVMsS0FBSyxNQUFNLFNBQVMsT0FBTyxLQUFLLE1BQU0sTUFBTTtBQUN2SSxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBUE8sRUFBQUEsK0JBQVM7QUFRVCxXQUFTLEdBQUcsTUFBK0IsbUJBQTRFO0FBRTdILFdBQU8sSUFBSSxNQUFNLDhCQUE4QixrQkFBa0IsYUFBYSxLQUFLLE9BQU8sS0FBSyxFQUFFLFNBQVMsS0FBSyxRQUFRLElBQUksT0FBTyxLQUFLLFFBQVEsTUFBTSxDQUFDO0FBQUEsRUFDdko7QUFITyxFQUFBQSwrQkFBUztBQUFBLEdBVEE7QUFlVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw4QkFBVjtBQUNDLFdBQVMsS0FBSyxNQUEyRDtBQUMvRSxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixLQUFLLEtBQUs7QUFBQSxNQUNWLE9BQU8sS0FBSyxNQUFNLElBQUksT0FBSyxTQUFTLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDM0MsTUFBTSxLQUFLO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSwwQkFBUztBQVFULFdBQVMsR0FBRyxNQUEyRDtBQUM3RSxVQUFNLFNBQVMsSUFBSSxNQUFNLHlCQUF5QixJQUFJLE9BQU8sS0FBSyxHQUFHLEdBQUcsS0FBSyxNQUFNLElBQUksT0FBSyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDM0csV0FBTyxTQUFTLEtBQUs7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFKTyxFQUFBQSwwQkFBUztBQUFBLEdBVEE7QUFpQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsa0JBQVY7QUFDQyxXQUFTLEtBQUssTUFBa0U7QUFDdEYsUUFBSSxLQUFLLGlCQUFpQjtBQUN6QixhQUFPO0FBQUEsUUFDTixVQUFVLGFBQWE7QUFBQSxRQUN2QixPQUFPLEtBQUssTUFBTTtBQUFBLFFBQ2xCLFVBQVUsS0FBSztBQUFBLE1BQ2hCO0FBQUEsSUFDRCxXQUFXLEtBQUsscUJBQXFCO0FBQ3BDLGFBQU87QUFBQSxRQUNOLFVBQVUsYUFBYTtBQUFBLFFBQ3ZCLFVBQVUsS0FBSztBQUFBLE1BQ2hCO0FBQUEsSUFDRCxPQUFPO0FBQ04sYUFBTztBQUFBLFFBQ04sVUFBVSxhQUFhO0FBQUEsUUFDdkIsT0FBTyxLQUFLLE1BQU07QUFBQSxRQUNsQixPQUFPLEtBQUssTUFBTSxNQUFNLEtBQUssTUFBTTtBQUFBLFFBQ25DLE9BQU8sS0FBSyxTQUFTLElBQUksaUJBQWlCLElBQUk7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBcEJPLEVBQUFBLGNBQVM7QUFBQSxHQURBO0FBeUJWLElBQVU7QUFBQSxDQUFWLENBQVVDLGtDQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQWlGO0FBQ3JHLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLEtBQUssS0FBSztBQUFBLE1BQ1YsT0FBTyxLQUFLLE1BQU0sSUFBSSxhQUFhLElBQUk7QUFBQSxNQUN2QyxNQUFNLEtBQUs7QUFBQSxJQUNaO0FBQUEsRUFDRDtBQVBPLEVBQUFBLDhCQUFTO0FBQUEsR0FEQTtBQVdWLElBQVU7QUFBQSxDQUFWLENBQVVDLG1DQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQWdFO0FBQ3BGLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE9BQU8sS0FBSyxNQUFNLElBQUksUUFBTTtBQUFBLFFBQzNCLGFBQWEsRUFBRTtBQUFBLFFBQ2YsYUFBYSxFQUFFO0FBQUEsTUFDaEIsRUFBRTtBQUFBLElBQ0g7QUFBQSxFQUNEO0FBUk8sRUFBQUEsK0JBQVM7QUFBQSxHQURBO0FBWVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsK0JBQVY7QUFDQyxXQUFTLEtBQUssTUFBbUU7QUFDdkYsVUFBTSxXQUFXLFVBQVUsWUFBWSxLQUFLLFFBQVEsSUFBSSxLQUFLLFdBQzFELElBQUksTUFBTSxLQUFLLFFBQVEsSUFBSSxFQUFFLE9BQU8sSUFBSSxPQUFPLEtBQUssUUFBUSxFQUFFLElBQzVELEtBQUssWUFBWSxXQUFXLEtBQUssWUFBWSxVQUFVLEtBQUssWUFBWSxJQUFJLE1BQU0sS0FBSyxTQUFTLEtBQUssS0FBSyxJQUFJLE1BQU0sS0FBSyxTQUFTLElBQUksSUFBSSxFQUFFLE9BQU8sSUFBSSxPQUFPLEtBQUssU0FBUyxLQUFLLEdBQUcsTUFBTSxJQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksRUFBRSxJQUN6TjtBQUVMLFFBQUksT0FBTyxLQUFLLFVBQVUsWUFBWSxrQkFBa0IsS0FBSyxPQUFPO0FBQ25FLGFBQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLFdBQVc7QUFBQSxVQUNWLGNBQWMsS0FBSyxNQUFNO0FBQUEsVUFDekIsT0FBTyxJQUFJLE1BQU0sS0FBSyxNQUFNLEtBQUssS0FBSyxDQUFDLEtBQUssTUFBTSxRQUNqRCxLQUFLLE1BQU0sUUFDWCxTQUFTLEtBQUssS0FBSyxNQUFNLEtBQXdCO0FBQUEsUUFDbkQ7QUFBQSxRQUNBO0FBQUEsUUFDQSxTQUFTLEtBQUs7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFdBQVcsSUFBSSxNQUFNLEtBQUssS0FBSyxLQUFLLE9BQU8sS0FBSyxVQUFVLFdBQ3pELEtBQUssUUFDTCxTQUFTLEtBQXNCLEtBQUssS0FBSztBQUFBLE1BQzFDO0FBQUEsTUFDQSxTQUFTLEtBQUs7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQTVCTyxFQUFBQSwyQkFBUztBQTZCVCxXQUFTLEdBQUcsTUFBb0U7QUFDdEYsVUFBTSxRQUFRLE9BQThCLElBQUk7QUFFaEQsVUFBTSxXQUFXLENBQUNDLFdBQWtFLElBQUksTUFBTUEsTUFBSyxJQUNsR0EsU0FDQSxTQUFTLEdBQUdBLE1BQUs7QUFFbEIsV0FBTyxJQUFJLE1BQU07QUFBQSxNQUNoQixPQUFPLE1BQU0sY0FBYyxXQUFXLE1BQU0sWUFBWSxrQkFBa0IsTUFBTSxZQUFZO0FBQUEsUUFDM0YsY0FBYyxNQUFNLFVBQVU7QUFBQSxRQUM5QixPQUFPLE1BQU0sVUFBVSxTQUFTLFNBQVMsTUFBTSxVQUFVLEtBQUs7QUFBQSxNQUMvRCxJQUNDLFNBQVMsTUFBTSxTQUFTO0FBQUEsSUFDMUI7QUFBQSxFQUNEO0FBZE8sRUFBQUQsMkJBQVM7QUFBQSxHQTlCQTtBQStDVixJQUFVO0FBQUEsQ0FBVixDQUFVRSxrQ0FBVjtBQUNDLFdBQVMsS0FBSyxNQUFtRTtBQUN2RixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixPQUFPLEtBQUs7QUFBQSxNQUNaLFNBQVMsS0FBSztBQUFBLE1BQ2QsU0FBUyxLQUFLO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSw4QkFBUztBQUFBLEdBREE7QUFXVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxzQkFBVjtBQUVDLFdBQVMsS0FBSyxNQUF1QyxtQkFBc0Msb0JBQXVFO0FBQ3hLLFFBQUksZ0JBQWdCLE1BQU0sMEJBQTBCO0FBQ25ELGFBQU8seUJBQXlCLEtBQUssSUFBSTtBQUFBLElBQzFDLFdBQVcsZ0JBQWdCLE1BQU0sd0JBQXdCO0FBQ3hELGFBQU8sdUJBQXVCLEtBQUssSUFBSTtBQUFBLElBQ3hDLFdBQVcsZ0JBQWdCLE1BQU0sMkJBQTJCO0FBQzNELGFBQU8sMEJBQTBCLEtBQUssSUFBSTtBQUFBLElBQzNDLFdBQVcsZ0JBQWdCLE1BQU0sMEJBQTBCO0FBQzFELGFBQU8seUJBQXlCLEtBQUssSUFBSTtBQUFBLElBQzFDLFdBQVcsZ0JBQWdCLE1BQU0sa0NBQWtDO0FBQ2xFLGFBQU8saUNBQWlDLEtBQUssSUFBSTtBQUFBLElBQ2xELFdBQVcsZ0JBQWdCLE1BQU0sc0JBQXNCO0FBQ3RELGFBQU8scUJBQXFCLEtBQUssSUFBSTtBQUFBLElBQ3RDLFdBQVcsZ0JBQWdCLE1BQU0sK0JBQStCO0FBQy9ELGFBQU8sOEJBQThCLEtBQUssSUFBSTtBQUFBLElBQy9DLFdBQVcsZ0JBQWdCLE1BQU0sMEJBQTBCO0FBQzFELGFBQU8sc0JBQXNCLEtBQUssSUFBSTtBQUFBLElBQ3ZDLFdBQVcsZ0JBQWdCLE1BQU0sMkJBQTJCO0FBQzNELGFBQU8sMEJBQTBCLEtBQUssSUFBSTtBQUFBLElBQzNDLFdBQVcsZ0JBQWdCLE1BQU0sK0JBQStCO0FBQy9ELGFBQU8sOEJBQThCLEtBQUssTUFBTSxtQkFBbUIsa0JBQWtCO0FBQUEsSUFDdEYsV0FBVyxnQkFBZ0IsTUFBTSwwQkFBMEI7QUFDMUQsYUFBTyx5QkFBeUIsS0FBSyxJQUFJO0FBQUEsSUFDMUMsV0FBVyxnQkFBZ0IsTUFBTSw4QkFBOEI7QUFDOUQsYUFBTyw2QkFBNkIsS0FBSyxJQUFJO0FBQUEsSUFDOUMsV0FBVyxnQkFBZ0IsTUFBTSw2Q0FBNkM7QUFDN0UsYUFBTyw0Q0FBNEMsS0FBSyxJQUFJO0FBQUEsSUFDN0QsV0FBVyxnQkFBZ0IsTUFBTSw4QkFBOEI7QUFDOUQsYUFBTyw2QkFBNkIsS0FBSyxJQUFJO0FBQUEsSUFDOUMsV0FBVyxnQkFBZ0IsTUFBTSx5QkFBeUI7QUFDekQsYUFBTyx3QkFBd0IsS0FBSyxJQUFJO0FBQUEsSUFDekMsV0FBVyxnQkFBZ0IsTUFBTSxzQkFBc0I7QUFDdEQsYUFBTyxxQkFBcUIsS0FBSyxJQUFJO0FBQUEsSUFDdEMsV0FBVyxnQkFBZ0IsTUFBTSw4QkFBOEI7QUFDOUQsYUFBTyw2QkFBNkIsS0FBSyxJQUFJO0FBQUEsSUFDOUMsV0FBVyxnQkFBZ0IsTUFBTSxrQ0FBa0M7QUFDbEUsYUFBTyxpQ0FBaUMsS0FBSyxJQUFJO0FBQUEsSUFDbEQsV0FBVyxnQkFBZ0IsTUFBTSw4QkFBOEI7QUFDOUQsYUFBTyw2QkFBNkIsS0FBSyxJQUFJO0FBQUEsSUFDOUMsV0FBVyxnQkFBZ0IsTUFBTSxzQkFBc0I7QUFDdEQsYUFBTyxxQkFBcUIsS0FBSyxJQUFJO0FBQUEsSUFDdEMsV0FBVyxnQkFBZ0IsTUFBTSw0QkFBNEI7QUFDNUQsYUFBTywyQkFBMkIsS0FBSyxJQUFJO0FBQUEsSUFDNUMsV0FBVyxnQkFBZ0IsTUFBTSw2QkFBNkI7QUFDN0QsYUFBTyw0QkFBNEIsS0FBSyxNQUFNLG1CQUFtQixrQkFBa0I7QUFBQSxJQUNwRixXQUFXLGdCQUFnQixNQUFNLHdCQUF3QjtBQUN4RCxhQUFPLHVCQUF1QixLQUFLLElBQUk7QUFBQSxJQUN4QyxXQUFXLGdCQUFnQixNQUFNLCtCQUErQjtBQUMvRCxhQUFPLDhCQUE4QixLQUFLLElBQUk7QUFBQSxJQUMvQyxXQUFXLGdCQUFnQixNQUFNLG9DQUFvQztBQUNwRSxhQUFPLG1DQUFtQyxLQUFLLElBQUk7QUFBQSxJQUNwRDtBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLFNBQVMsZUFBZSxLQUFLLEVBQUU7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUF6RE8sRUFBQUEsa0JBQVM7QUEyRFQsV0FBUyxHQUFHLE1BQXdDLG1CQUEyRTtBQUNySSxZQUFRLEtBQUssTUFBTTtBQUFBLE1BQ2xCLEtBQUs7QUFBYSxlQUFPLDBCQUEwQixHQUFHLElBQUk7QUFBQSxNQUMxRCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0osZUFBTyxVQUFVLE1BQU0saUJBQWlCO0FBQUEsSUFDMUM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQVhPLEVBQUFBLGtCQUFTO0FBYVQsV0FBUyxVQUFVLE1BQStDLG1CQUE0TDtBQUNwUSxZQUFRLEtBQUssTUFBTTtBQUFBLE1BQ2xCLEtBQUs7QUFBbUIsZUFBTyx5QkFBeUIsR0FBRyxJQUFJO0FBQUEsTUFDL0QsS0FBSztBQUFtQixlQUFPLHVCQUF1QixHQUFHLElBQUk7QUFBQSxNQUM3RCxLQUFLO0FBQW1CLGVBQU87QUFBQSxNQUMvQixLQUFLO0FBQVksZUFBTyxzQkFBc0IsR0FBRyxJQUFJO0FBQUEsTUFDckQsS0FBSztBQUFXLGVBQU8sOEJBQThCLEdBQUcsTUFBTSxpQkFBaUI7QUFBQSxJQUNoRjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBVk8sRUFBQUEsa0JBQVM7QUFBQSxHQTFFQTtBQXVGVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxzQkFBVjtBQUNDLFdBQVMsR0FBRyxTQUE0QixXQUFzRixPQUFpQyxvQkFBNEQsYUFBb0UsT0FBMEQsV0FBeUMsWUFBNkM7QUFFcmIsVUFBTSxpQkFBOEMsQ0FBQztBQUNyRCxVQUFNLHFCQUFrRCxDQUFDO0FBQ3pELGVBQVcsS0FBSyxRQUFRLFVBQVUsV0FBVztBQUM1QyxVQUFJLEVBQUUsU0FBUyxRQUFRO0FBQ3RCLHVCQUFlLEtBQUssQ0FBQztBQUFBLE1BQ3RCLFdBQVcsRUFBRSxTQUFTLFdBQVc7QUFDaEMsdUJBQWUsS0FBSyxHQUFHLEVBQUUsS0FBSztBQUFBLE1BQy9CLE9BQU87QUFDTiwyQkFBbUIsS0FBSyxDQUFDO0FBQUEsTUFDMUI7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLG9CQUFvQixvQkFBb0IsUUFBUSxlQUFlLEtBQUssUUFBUSxnQkFBZ0IsU0FBUztBQUN2SCxVQUFNLHNCQUEwQztBQUFBLE1BQy9DLElBQUksUUFBUTtBQUFBLE1BQ1osUUFBUSxRQUFRO0FBQUEsTUFDaEIsU0FBUyxRQUFRO0FBQUEsTUFDakIsU0FBUyxRQUFRLFdBQVc7QUFBQSxNQUM1Qix3QkFBd0IsUUFBUSwwQkFBMEI7QUFBQSxNQUMxRCx1QkFBdUIsUUFBUSx5QkFBeUI7QUFBQSxNQUN4RCxrQkFBa0IsUUFBUTtBQUFBLE1BQzFCO0FBQUEsTUFDQSxpQkFBaUIsUUFBUTtBQUFBLE1BQ3pCLFlBQVksbUJBQ1YsUUFBUSxPQUFLLG9CQUFvQixhQUFhLEdBQUcsYUFBYSxVQUFVLENBQUM7QUFBQSxNQUMzRSxnQkFBZ0IsZUFBZSxJQUFJLCtCQUErQixFQUFFO0FBQUEsTUFDcEUsVUFBVSxhQUFhLEdBQUcsUUFBUSxRQUFRO0FBQUEsTUFDMUMsMEJBQTBCLFFBQVE7QUFBQSxNQUNsQywwQkFBMEIsUUFBUTtBQUFBLE1BQ2xDO0FBQUEsTUFDQSxxQkFBcUIsT0FBTyxPQUErQixFQUFFLGlCQUFpQixRQUFRLGlCQUFpQixrQkFBa0IsSUFBSSxPQUFPLFFBQVEsZ0JBQWdCLEVBQUUsQ0FBQztBQUFBLE1BQy9KO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLGtCQUFrQixRQUFRO0FBQUEsTUFDMUIsa0JBQWtCLFFBQVEsa0JBQWtCO0FBQUEsTUFDNUMsbUJBQW1CLDRCQUE0QixHQUFHLFFBQVEsZ0JBQWdCO0FBQUEsTUFDMUUsaUJBQWlCLFFBQVE7QUFBQSxNQUN6QixzQkFBc0IsUUFBUTtBQUFBLE1BQzlCLGNBQWMsUUFBUTtBQUFBLE1BQ3RCLGlCQUFpQixRQUFRO0FBQUEsTUFDekIsaUJBQWlCLFFBQVEsbUJBQW1CO0FBQUEsTUFDNUMsT0FBTyxRQUFRLFFBQVEsMEJBQTBCLEdBQUcsUUFBUSxLQUFLLElBQUk7QUFBQSxNQUNyRSxtQkFBbUIsUUFBUTtBQUFBLElBQzVCO0FBRUEsUUFBSSxDQUFDLHFCQUFxQixXQUFXLHdCQUF3QixHQUFHO0FBRS9ELGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBRXBDLGFBQVEsb0JBQTRCO0FBQUEsSUFDckM7QUFFQSxRQUFJLENBQUMscUJBQXFCLFdBQVcsMEJBQTBCLEdBQUc7QUFDakUsYUFBTyxvQkFBb0I7QUFDM0IsYUFBTyxvQkFBb0I7QUFFM0IsYUFBUSxvQkFBNEI7QUFBQSxJQUNyQztBQUdBLFdBQU87QUFBQSxFQUNSO0FBeEZPLEVBQUFBLGtCQUFTO0FBQUEsR0FEQTtBQTRGVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxrQkFBVjtBQUNDLFdBQVMsR0FBRyxLQUE0QztBQUM5RCxZQUFRLEtBQUs7QUFBQSxNQUNaLEtBQUssa0JBQWtCO0FBQVUsZUFBTyxNQUFNLGFBQWE7QUFBQSxNQUMzRCxLQUFLLGtCQUFrQjtBQUFVLGVBQU8sTUFBTSxhQUFhO0FBQUEsTUFDM0QsS0FBSyxrQkFBa0I7QUFBTSxlQUFPLE1BQU0sYUFBYTtBQUFBLE1BQ3ZELEtBQUssa0JBQWtCO0FBQWMsZUFBTyxNQUFNLGFBQWE7QUFBQSxJQUNoRTtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxjQUFTO0FBU1QsV0FBUyxLQUFLLEtBQTRDO0FBQ2hFLFlBQVEsS0FBSztBQUFBLE1BQ1osS0FBSyxNQUFNLGFBQWE7QUFBVSxlQUFPLGtCQUFrQjtBQUFBLE1BQzNELEtBQUssTUFBTSxhQUFhO0FBQVUsZUFBTyxrQkFBa0I7QUFBQSxNQUMzRCxLQUFLLE1BQU0sYUFBYTtBQUFPLGVBQU8sa0JBQWtCO0FBQUEsTUFDeEQsS0FBSyxNQUFNLGFBQWE7QUFBUSxlQUFPLGtCQUFrQjtBQUFBLElBQzFEO0FBQUEsRUFDRDtBQVBPLEVBQUFBLGNBQVM7QUFBQSxHQVZBO0FBb0JWLElBQVU7QUFBQSxDQUFWLENBQVVDLGtDQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQWtEO0FBQ3RFLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFGTyxFQUFBQSw4QkFBUztBQUlULFdBQVMsR0FBRyxJQUFnRDtBQUNsRSxZQUFRLElBQUk7QUFBQSxNQUNYLEtBQUs7QUFBUyxlQUFPLE1BQU0sNkJBQTZCO0FBQUEsTUFDeEQsS0FBSztBQUFTLGVBQU8sTUFBTSw2QkFBNkI7QUFBQSxNQUN4RCxLQUFLO0FBQWdCLGVBQU8sTUFBTSw2QkFBNkI7QUFBQSxNQUMvRCxLQUFLO0FBQVUsZUFBTyxNQUFNLDZCQUE2QjtBQUFBLE1BQ3pELEtBQUs7QUFBUSxlQUFPLE1BQU0sNkJBQTZCO0FBQUEsTUFDdkQsS0FBSztBQUFXLGVBQU8sTUFBTSw2QkFBNkI7QUFBQSxNQUMxRDtBQUFTLGVBQU8sSUFBSSxNQUFNLDZCQUE2QixFQUFFO0FBQUEsSUFDMUQ7QUFBQSxFQUNEO0FBVk8sRUFBQUEsOEJBQVM7QUFBQSxHQUxBO0FBa0JWLElBQVU7QUFBQSxDQUFWLENBQVVDLHlCQUFWO0FBQ0MsV0FBUyxhQUFhLFVBQXFDLGFBQW9FLFlBQXVEO0FBQzVMLFVBQU0sWUFBWSxHQUFHLFVBQVUsYUFBYSxVQUFVO0FBQ3RELFFBQUksQ0FBQyxXQUFXO0FBQ2YsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sVUFBVSx1QkFBdUIsUUFBUSxJQUFJLFdBQVc7QUFDOUQsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPLENBQUMsU0FBUztBQUFBLElBQ2xCO0FBRUEsVUFBTSxZQUFZLGtCQUFrQixRQUFRLFNBQVM7QUFDckQsUUFBSSxDQUFDLFdBQVc7QUFDZixhQUFPLENBQUMsU0FBUztBQUFBLElBQ2xCO0FBRUEsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLEdBQUcsU0FBUyxFQUFFO0FBQUEsUUFDbEIsTUFBTSxHQUFHLFNBQVMsSUFBSTtBQUFBLFFBQ3RCLE9BQU8sSUFBSSxNQUFNO0FBQUEsVUFDaEIsUUFBUSxpQkFBaUI7QUFBQSxVQUN6QixNQUFNLFFBQVEsUUFBUSxTQUFTO0FBQUEsUUFDaEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUEzQk8sRUFBQUEscUJBQVM7QUE2QlQsV0FBUyxHQUFHLFVBQXFDLGFBQW9FLFlBQWlFO0FBQzVMLFFBQUksUUFBNkMsU0FBUztBQUMxRCxRQUFJLENBQUMsT0FBTztBQUNYLFVBQUk7QUFDSixVQUFJO0FBQ0gsaUJBQVMsS0FBSyxVQUFVLFFBQVE7QUFBQSxNQUNqQyxRQUFRO0FBQ1AsaUJBQVMsUUFBUSxTQUFTLElBQUksUUFBUSxTQUFTLEVBQUUsVUFBVSxTQUFTLElBQUk7QUFBQSxNQUN6RTtBQUVBLGlCQUFXLE1BQU0saUVBQWlFLE1BQU0sRUFBRTtBQUMxRixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksZ0JBQWdCLEtBQUssR0FBRztBQUMzQixjQUFRLElBQUksT0FBTyxLQUFLO0FBQUEsSUFDekIsV0FBVyxTQUFTLE9BQU8sVUFBVSxZQUFZLFNBQVMsU0FBUyxXQUFXLFNBQVMsZ0JBQWdCLE1BQU0sR0FBRyxHQUFHO0FBQ2xILGNBQVEsU0FBUyxHQUFHLE9BQU8sS0FBSyxDQUFDO0FBQUEsSUFDbEMsV0FBVyxxQkFBcUIsUUFBUSxHQUFHO0FBQzFDLFlBQU0sTUFBTSxTQUFTLGFBQWEsQ0FBQyxHQUFHO0FBQ3RDLGNBQVEsSUFBSSxNQUFNO0FBQUEsUUFDakIsU0FBUyxZQUFZO0FBQUEsUUFDckIsTUFBTSxRQUFRLFFBQVEsSUFBSSxXQUFXLE9BQU8sT0FBTyxTQUFTLEtBQWlCLENBQUMsQ0FBQztBQUFBLFFBQy9FLE9BQU8sSUFBSSxNQUFNLEdBQUcsSUFBSSxNQUFNO0FBQUEsUUFDOUIsU0FBUztBQUFBLFFBQ1QsU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUNELFdBQVcsU0FBUyxTQUFTLGNBQWM7QUFDMUMsWUFBTSxpQkFBaUIsU0FBUyxrQkFBa0IsbUJBQW1CLEdBQUcsU0FBUyxjQUFjO0FBQy9GLFlBQU0sWUFBWSxTQUFTLGFBQWEsSUFBSSxPQUFPLFNBQVMsU0FBUyxFQUFFLFNBQVM7QUFDaEYsY0FBUSxJQUFJLE1BQU0sd0JBQXdCLFlBQVksSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQXlDO0FBQzFHLFlBQUksU0FBUyxhQUFhLElBQUksU0FBUyxNQUFNLFdBQVc7QUFDdkQsaUJBQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUFBLFFBQ2hCO0FBRUEsZUFBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUFDLE9BQUs7QUFDMUIsY0FBSSxrQkFBa0JBLEdBQUUsV0FBVyxnQkFBZ0I7QUFDbEQsbUJBQU87QUFBQSxVQUNSO0FBQ0EsY0FBSSxTQUFTLGVBQWUsQ0FBQyxZQUFZLE1BQU0sMEJBQTBCLFNBQVMsYUFBYSxNQUFNLEtBQUtBLEdBQUUsS0FBSyxDQUFDLEdBQUc7QUFDcEgsbUJBQU87QUFBQSxVQUNSO0FBRUEsaUJBQU87QUFBQSxRQUNSLENBQUMsQ0FBQztBQUFBLE1BQ0gsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFBQSxJQUNuQztBQUNBLFFBQUk7QUFDSixRQUFJLDBCQUEwQixRQUFRLEtBQUssMEJBQTBCLFFBQVEsR0FBRztBQUMvRSxVQUFJLFNBQVMsZ0JBQWdCO0FBQzVCLHlCQUFpQixnQ0FBZ0MsR0FBRyxTQUFTLGNBQWM7QUFBQSxNQUM1RTtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsTUFDTixJQUFJLFNBQVM7QUFBQSxNQUNiLE1BQU0sU0FBUztBQUFBLE1BQ2YsT0FBTyxTQUFTLFNBQVMsQ0FBQyxTQUFTLE1BQU0sT0FBTyxTQUFTLE1BQU0sWUFBWTtBQUFBLE1BQzNFO0FBQUEsTUFDQTtBQUFBLE1BQ0Esa0JBQWtCLFNBQVM7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUE5RE8sRUFBQUQscUJBQVM7QUFBQSxHQTlCQTtBQStGVixJQUFVO0FBQUEsQ0FBVixDQUFVRSxvQ0FBVjtBQUNDLFdBQVMsR0FBRyxVQUE0RTtBQUM5RixVQUFNLFFBQVEsU0FBUztBQUN2QixRQUFJLE9BQU87QUFDVixZQUFNLElBQUksTUFBTSx3QkFBd0I7QUFBQSxJQUN6QztBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU0sU0FBUztBQUFBLE1BQ2YsT0FBTyxTQUFTLFNBQVMsQ0FBQyxTQUFTLE1BQU0sT0FBTyxTQUFTLE1BQU0sWUFBWTtBQUFBLElBQzVFO0FBQUEsRUFDRDtBQVZPLEVBQUFBLGdDQUFTO0FBQUEsR0FEQTtBQWNqQixJQUFVO0FBQUEsQ0FBVixDQUFVQyxxQ0FBVjtBQUNRLFdBQVMsR0FBRyxXQUE4RjtBQUNoSCxVQUFNLGlCQUFpQixDQUFDO0FBQ3hCLGVBQVcsS0FBSyxXQUFXO0FBQzFCLFVBQUksRUFBRSxTQUFTLFFBQVE7QUFDdEIsdUJBQWUsS0FBSywrQkFBK0IsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN6RCxXQUFXLEVBQUUsU0FBUyxXQUFXO0FBQ2hDLHVCQUFlLEtBQUssR0FBRyxFQUFFLE1BQU0sSUFBSSwrQkFBK0IsRUFBRSxDQUFDO0FBQUEsTUFDdEUsT0FBTztBQUNOLGNBQU0sSUFBSSxNQUFNLDRDQUE0QztBQUFBLE1BQzdEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBWk8sRUFBQUEsaUNBQVM7QUFBQSxHQURQO0FBZ0JILElBQVU7QUFBQSxDQUFWLENBQVVDLGlDQUFWO0FBQ0MsV0FBUyxHQUFHLE1BQW9JO0FBQ3RKLFFBQUksTUFBTTtBQUNULGFBQU87QUFBQSxRQUNOLEtBQUssSUFBSSxPQUFPLEtBQUssR0FBRztBQUFBLFFBQ3hCLE1BQU0sS0FBSztBQUFBLFFBQ1gsU0FBUyxLQUFLO0FBQUEsUUFDZCxnQkFBZ0IsZ0NBQWdDLEdBQUcsT0FBTyxLQUFLLGNBQWMsQ0FBQztBQUFBLFFBQzlFLGtCQUFrQixLQUFLO0FBQUEsUUFDdkIsVUFBVSxLQUFLO0FBQUEsUUFDZixXQUFXLEtBQUs7QUFBQSxNQUNqQjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQWJPLEVBQUFBLDZCQUFTO0FBZVQsV0FBUyxLQUFLLE1BQWdHO0FBQ3BILFFBQUksTUFBTTtBQUNULGFBQU87QUFBQSxRQUNOLEtBQUssS0FBSztBQUFBLFFBQ1YsTUFBTSxLQUFLO0FBQUEsUUFDWCxTQUFTLEtBQUs7QUFBQSxRQUNkLGdCQUFnQixLQUFLLGdCQUFnQixJQUFJLFVBQVE7QUFBQSxVQUNoRCxNQUFNO0FBQUEsVUFDTixJQUFJLElBQUk7QUFBQSxVQUNSLE1BQU0sSUFBSTtBQUFBLFVBQ1YsT0FBTztBQUFBLFVBQ1AsT0FBTyxJQUFJLFFBQVEsRUFBRSxPQUFPLElBQUksTUFBTSxDQUFDLEdBQUcsY0FBYyxJQUFJLE1BQU0sQ0FBQyxFQUFFLElBQUk7QUFBQSxRQUMxRSxFQUFFLEtBQUssQ0FBQztBQUFBLFFBQ1Isa0JBQWtCLEtBQUs7QUFBQSxRQUN2QixVQUFVLEtBQUs7QUFBQSxRQUNmLFdBQVcsS0FBSztBQUFBLE1BQ2pCO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBbkJPLEVBQUFBLDZCQUFTO0FBQUEsR0FoQkE7QUFzQ1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsNkJBQVY7QUFDQyxXQUFTLEtBQUssTUFBaUMsbUJBQXNDLGFBQXdFO0FBQ25LLFdBQU87QUFBQSxNQUNOLElBQUksS0FBSztBQUFBLE1BQ1QsT0FBTyxLQUFLO0FBQUEsTUFDWixVQUFVLEtBQUs7QUFBQSxNQUNmLE1BQU0sS0FBSyxNQUFNO0FBQUEsTUFDakIsT0FBTyxLQUFLLE9BQU8sQ0FBQyxFQUFFO0FBQUEsTUFDdEIsWUFBWSxLQUFLO0FBQUEsTUFDakIsUUFBUSxLQUFLO0FBQUEsTUFDYixlQUFlLEtBQUs7QUFBQSxNQUNwQixTQUFTLGtCQUFrQixXQUFXLEtBQUssU0FBUyxXQUFXO0FBQUEsSUFDaEU7QUFBQSxFQUNEO0FBWk8sRUFBQUEseUJBQVM7QUFBQSxHQURBO0FBZ0JWLElBQVU7QUFBQSxDQUFWLENBQVVDLHFCQUFWO0FBQ0MsV0FBUyxHQUFHLFFBQTZDO0FBQy9ELFdBQU87QUFBQSxNQUNOLGNBQWMsT0FBTztBQUFBLE1BQ3JCLFVBQVUsZUFBZSxPQUFPLFFBQVE7QUFBQSxNQUN4QyxjQUFjLE9BQU87QUFBQSxNQUNyQixTQUFTLE9BQU87QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxpQkFBUztBQVFULFdBQVMsS0FBSyxRQUFrRDtBQUN0RSxXQUFPO0FBQUEsTUFDTixjQUFjLE9BQU87QUFBQSxNQUNyQixVQUFVLE9BQU87QUFBQSxNQUNqQixjQUFjLE9BQU87QUFBQSxNQUNyQixTQUFTLE9BQU87QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxpQkFBUztBQVNoQixXQUFTLGVBQWUsVUFBd0M7QUFDL0QsV0FBTyxlQUFlLFVBQVUsV0FBUztBQUN4QyxVQUFJLE1BQU0sU0FBUyxhQUFhLHlCQUF5QjtBQUN4RCxlQUFPLElBQUksTUFBTSx3QkFBd0IsZUFBZSxNQUFNLFNBQVMsY0FBYyxDQUFDO0FBQUEsTUFDdkYsV0FBVyxNQUFNLFNBQVMsYUFBYSx1QkFBdUI7QUFDN0QsZUFBTyxJQUFJLE1BQU0sc0JBQXNCLE1BQU0sS0FBSztBQUFBLE1BQ25ELFdBQVcsTUFBTSxTQUFTLGFBQWEsMkJBQTJCO0FBQ2pFLGVBQU8sSUFBSSxNQUFNLDBCQUEwQixNQUFNLE9BQU8sTUFBTSxJQUFJLE1BQU0sUUFBUTtBQUFBLE1BQ2pGLFdBQVcsTUFBTSxTQUFTLGFBQWEsNEJBQTRCO0FBQ2xFLGVBQU8sSUFBSSxNQUFNLDJCQUEyQixNQUFNLEtBQUs7QUFBQSxNQUN4RCxXQUFXLE1BQU0sU0FBUyxhQUFhLHVCQUF1QjtBQUM3RCxZQUFJO0FBRUosWUFBSSxNQUFNLFFBQVEsT0FBTyxNQUFNLFNBQVMsWUFBWSxNQUFNLEtBQUssU0FBUyxZQUFZLE1BQU0sUUFBUSxNQUFNLEtBQUssSUFBSSxHQUFHO0FBQ25ILG1CQUFTLElBQUksV0FBVyxNQUFNLEtBQUssSUFBSTtBQUFBLFFBQ3hDLFdBQVcsT0FBTyxNQUFNLFNBQVMsVUFBVTtBQUMxQyxjQUFJO0FBQ0gscUJBQVMsYUFBYSxNQUFNLElBQUksRUFBRTtBQUFBLFVBQ25DLFFBQVE7QUFDUCxxQkFBUyxJQUFJLFdBQVcsQ0FBQztBQUFBLFVBQzFCO0FBQUEsUUFDRCxPQUFPO0FBQ04sbUJBQVMsSUFBSSxXQUFXLENBQUM7QUFBQSxRQUMxQjtBQUVBLGVBQU8sSUFBSSxNQUFNLHNCQUFzQixRQUFRLE1BQU0sVUFBVSxNQUFNLFFBQVE7QUFBQSxNQUM5RTtBQUVBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQUEsR0FoRGdCO0FBbURWLElBQVU7QUFBQSxDQUFWLENBQVVDLDhCQUFWO0FBQ0MsV0FBUyxHQUFHLFFBQTBCLE9BQTZCLG1CQUE4RTtBQUN2SixRQUFJLE1BQU0sT0FBTyxTQUFTLFFBQVE7QUFFakM7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLGdCQUFnQixHQUFHLE1BQU07QUFDMUMsUUFBSSxNQUFNLE9BQU8sU0FBUyxXQUFXO0FBQ3BDLFlBQU0sVUFBVSxNQUFNLE9BQU8sY0FBYztBQUMzQyxZQUFNLGdCQUFnQjtBQUFBLFFBQ3JCLFNBQVMsa0JBQWtCLGFBQWEsT0FBTyxLQUFLLEVBQUUsU0FBUyxRQUFRLElBQUksT0FBTyxRQUFRLE1BQU07QUFBQSxNQUNqRztBQUNBLFlBQU0sZ0JBQTBDLEVBQUUsTUFBTSxXQUFXLGNBQWM7QUFDakYsYUFBTyxFQUFFLFFBQVEsZUFBZSxRQUFRLFNBQVM7QUFBQSxJQUNsRCxXQUFXLE1BQU0sT0FBTyxTQUFTLFlBQVk7QUFDNUMsWUFBTSxpQkFBNEMsRUFBRSxNQUFNLFlBQVksVUFBVSxhQUFhLEdBQUcsTUFBTSxPQUFPLFFBQVEsRUFBRTtBQUN2SCxhQUFPLEVBQUUsUUFBUSxnQkFBZ0IsUUFBUSxTQUFTO0FBQUEsSUFDbkQsV0FBVyxNQUFNLE9BQU8sU0FBUyxjQUFjO0FBQzlDLGFBQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxVQUFVLFVBQVUsTUFBTSxPQUFPLFdBQVcsV0FBVyxHQUFHLFFBQVEsU0FBUztBQUFBLElBQ3JHLFdBQVcsTUFBTSxPQUFPLFNBQVMsNEJBQTRCO0FBRTVELFlBQU0sV0FBVyxvQkFBSSxJQUFJO0FBQUEsUUFDeEIsQ0FBQyxZQUFZLE1BQU0sZ0NBQWdDLFFBQVE7QUFBQSxRQUMzRCxDQUFDLFlBQVksTUFBTSxnQ0FBZ0MsUUFBUTtBQUFBLFFBQzNELENBQUMsU0FBUyxNQUFNLGdDQUFnQyxLQUFLO0FBQUEsTUFDdEQsQ0FBQztBQUVELGFBQU87QUFBQSxRQUNOLFFBQVE7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLFNBQVMsU0FBUyxJQUFJLE1BQU0sT0FBTyxPQUFPLEtBQUssTUFBTSxnQ0FBZ0M7QUFBQSxVQUNyRixLQUFLLElBQUksT0FBTyxNQUFNLE9BQU8sR0FBRztBQUFBLFVBQ2hDLG1CQUFtQixNQUFNLE9BQU87QUFBQSxRQUNqQztBQUFBLFFBQUcsUUFBUTtBQUFBLE1BQ1o7QUFBQSxJQUNELFdBQVcsTUFBTSxPQUFPLFNBQVMseUJBQXlCO0FBQ3pELFlBQU0sV0FBVyxvQkFBSSxJQUFJO0FBQUEsUUFDeEIsQ0FBQyxZQUFZLE1BQU0sZ0NBQWdDLFFBQVE7QUFBQSxRQUMzRCxDQUFDLFlBQVksTUFBTSxnQ0FBZ0MsUUFBUTtBQUFBLE1BQzVELENBQUM7QUFFRCxhQUFPO0FBQUEsUUFDTixRQUFRO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixTQUFTLFNBQVMsSUFBSSxNQUFNLE9BQU8sT0FBTyxLQUFLLE1BQU0sZ0NBQWdDO0FBQUEsVUFDckYsS0FBSyxJQUFJLE9BQU8sTUFBTSxPQUFPLEdBQUc7QUFBQSxVQUNoQyxtQkFBbUIsTUFBTSxPQUFPO0FBQUEsVUFDaEMsV0FBVyxNQUFNLE9BQU87QUFBQSxVQUN4QixZQUFZLE1BQU0sT0FBTztBQUFBLFVBQ3pCLGNBQWMsTUFBTSxPQUFPO0FBQUEsUUFDNUI7QUFBQSxRQUFHLFFBQVE7QUFBQSxNQUNaO0FBQUEsSUFDRCxPQUFPO0FBQ04sYUFBTyxFQUFFLFFBQVEsTUFBTSxRQUFRLFFBQVEsU0FBUztBQUFBLElBQ2pEO0FBQUEsRUFDRDtBQXZETyxFQUFBQSwwQkFBUztBQUFBLEdBREE7QUEyRFYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsc0JBQVY7QUFDQyxXQUFTLEtBQUssVUFBbUcsV0FBdUMsYUFBMEs7QUFDeFUsUUFBSSxxQkFBcUIsVUFBVTtBQUNsQyxhQUFPLEVBQUUsaUJBQWlCLFNBQVMsaUJBQWlCLGVBQWUsU0FBUyxjQUFjO0FBQUEsSUFDM0Y7QUFDQSxRQUFJLFNBQVMsVUFBVTtBQUN0QixhQUFPLEVBQUUsS0FBSyxTQUFTLElBQUk7QUFBQSxJQUM1QjtBQUNBLFdBQU8sVUFBVSxXQUFXLFVBQVUsV0FBVztBQUFBLEVBQ2xEO0FBUk8sRUFBQUEsa0JBQVM7QUFBQSxHQURBO0FBV1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsK0JBQVY7QUFDQyxXQUFTLEtBQUssTUFBaUY7QUFDckcsV0FBTztBQUFBLE1BQ04sR0FBRztBQUFBLE1BQ0gsZUFBZSxlQUFlLFdBQVcsS0FBSyxhQUFhO0FBQUEsSUFDNUQ7QUFBQSxFQUNEO0FBTE8sRUFBQUEsMkJBQVM7QUFBQSxHQURBO0FBU1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsNEJBQVY7QUFDQyxXQUFTLEtBQUssYUFBOEUsZUFBa0U7QUFDcEssUUFBSSxNQUFNLFFBQVEsV0FBVyxHQUFHO0FBQy9CLGFBQU87QUFBQSxRQUNOLE9BQU8sWUFBWSxJQUFJLE9BQUssMEJBQTBCLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDOUQ7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLE1BQ04sT0FBTyxZQUFZLE1BQU0sSUFBSSxPQUFLLDBCQUEwQixLQUFLLENBQUMsQ0FBQztBQUFBLE1BQ25FLGlCQUFpQixZQUFZLGtCQUFrQixrQ0FBa0MsS0FBSyxZQUFZLGlCQUFpQixhQUFhLElBQUk7QUFBQSxJQUNySTtBQUFBLEVBQ0Q7QUFWTyxFQUFBQSx3QkFBUztBQUFBLEdBREE7QUFjVixJQUFVO0FBQUEsQ0FBVixDQUFVQyx1Q0FBVjtBQUNDLFdBQVMsS0FBSyxpQkFBMkQsZUFBNkU7QUFDNUosV0FBTztBQUFBLE1BQ04sR0FBRztBQUFBLE1BQ0g7QUFBQSxNQUNBLEtBQUssZ0JBQWdCO0FBQUEsTUFDckIsYUFBYSxZQUFZLEtBQUssZ0JBQWdCLFdBQVcsS0FBSztBQUFBLElBQy9EO0FBQUEsRUFDRDtBQVBPLEVBQUFBLG1DQUFTO0FBQUEsR0FEQTtBQVdWLElBQVU7QUFBQSxDQUFWLENBQVVDLHVCQUFWO0FBQ0MsV0FBUyxHQUFHLE1BQTREO0FBQzlFLFdBQU87QUFBQSxNQUNOLE1BQU0seUJBQXlCLEdBQUcsS0FBSyxJQUFJO0FBQUEsTUFDM0MsZ0JBQWdCLEtBQUs7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFMTyxFQUFBQSxtQkFBUztBQUFBLEdBREE7QUFTVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw4QkFBVjtBQUNDLFdBQVMsR0FBRyxNQUEwRTtBQUM1RixZQUFRLE1BQU07QUFBQSxNQUNiLEtBQUssVUFBVSx5QkFBeUI7QUFDdkMsZUFBTyxNQUFNLHlCQUF5QjtBQUFBLE1BQ3ZDLEtBQUssVUFBVSx5QkFBeUI7QUFDdkMsZUFBTyxNQUFNLHlCQUF5QjtBQUFBLE1BQ3ZDLEtBQUssVUFBVSx5QkFBeUI7QUFDdkMsZUFBTyxNQUFNLHlCQUF5QjtBQUFBLE1BQ3ZDO0FBQ0MsZUFBTyxNQUFNLHlCQUF5QjtBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQVhPLEVBQUFBLDBCQUFTO0FBQUEsR0FEQTtBQWVWLElBQVU7QUFBQSxDQUFWLENBQVVDLHFDQUFWO0FBQ0MsV0FBUyxHQUFNLFFBQXNELFdBQXlHO0FBQ3BMLFFBQUksT0FBTyxTQUFTLFVBQVUsb0NBQW9DLFNBQVM7QUFDMUUsWUFBTSxlQUFlLE9BQU8sZUFBZSxVQUFVLE9BQU8sWUFBWSxJQUFJO0FBQzVFLGFBQU87QUFBQSxRQUNOLE1BQU0sTUFBTSxvQ0FBb0M7QUFBQSxRQUNoRDtBQUFBLFFBQ0EscUJBQXFCLE9BQU87QUFBQSxNQUM3QjtBQUFBLElBQ0QsV0FBVyxPQUFPLFNBQVMsVUFBVSxvQ0FBb0MsVUFBVTtBQUNsRixhQUFPO0FBQUEsUUFDTixNQUFNLE1BQU0sb0NBQW9DO0FBQUEsTUFDakQ7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLE1BQ04sTUFBTSxNQUFNLG9DQUFvQztBQUFBLElBQ2pEO0FBQUEsRUFDRDtBQWhCTyxFQUFBQSxpQ0FBUztBQUFBLEdBREE7QUFvQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsK0JBQVY7QUFDQyxXQUFTLEtBQUssT0FBd0Y7QUFDNUcsUUFBSSxVQUFVLE1BQU0sb0NBQW9DLE9BQU87QUFDOUQsYUFBTyxVQUFVLDBCQUEwQjtBQUFBLElBQzVDLE9BQU87QUFDTixhQUFPLFVBQVUsMEJBQTBCO0FBQUEsSUFDNUM7QUFBQSxFQUNEO0FBTk8sRUFBQUEsMkJBQVM7QUFRVCxXQUFTLEdBQUcsTUFBc0Y7QUFDeEcsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLLFVBQVUsMEJBQTBCO0FBQ3hDLGVBQU8sTUFBTSxvQ0FBb0M7QUFBQSxNQUNsRDtBQUNDLGVBQU8sTUFBTSxvQ0FBb0M7QUFBQSxJQUNuRDtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSwyQkFBUztBQUFBLEdBVEE7QUFtQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsbUJBQVY7QUFDQyxXQUFTLEtBQUssTUFBNEIsSUFBeUM7QUFDekYsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBLE9BQU8sS0FBSztBQUFBLE1BQ1osYUFBYSxLQUFLO0FBQUEsTUFDbEIsU0FBUyxLQUFLO0FBQUEsTUFDZCxrQkFBbUIsS0FBSyxvQkFBb0IsOEJBQThCO0FBQUEsTUFDMUUsY0FBYyxLQUFLO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBVE8sRUFBQUEsZUFBUztBQUFBLEdBREE7QUFhVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw2QkFBVjtBQUNDLFdBQVMsR0FBRyxRQUE0RTtBQUM5RixRQUFJLE9BQU8sU0FBUyxPQUFPO0FBQzFCLGFBQU8sSUFBSSxNQUFNLDJCQUEyQixPQUFPLE9BQU8sT0FBTyxlQUFlLE9BQU8sT0FBTyxPQUFPLFlBQVk7QUFBQSxJQUNsSCxXQUFXLE9BQU8sU0FBUyxhQUFhO0FBQ3ZDLGFBQU8sSUFBSSxNQUFNLGlDQUFpQyxPQUFPLFlBQVksT0FBTyxPQUFPLEtBQUs7QUFBQSxJQUN6RixPQUFPO0FBQ04sYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBUk8sRUFBQUEseUJBQVM7QUFBQSxHQURBO0FBWVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsNkJBQVY7QUFDQyxXQUFTLEdBQUcsUUFBNkQ7QUFDL0UsVUFBTSxhQUFhLElBQUksTUFBTSx3QkFBd0IsT0FBTyxRQUFRLElBQUksVUFBUTtBQUMvRSxVQUFJLEtBQUssU0FBUyxRQUFRO0FBQ3pCLGVBQU8sSUFBSSxNQUFNLHNCQUFzQixLQUFLLE9BQU8sS0FBSyxRQUFRO0FBQUEsTUFDakUsV0FBVyxLQUFLLFNBQVMsUUFBUTtBQUNoQyxlQUFPLElBQUksTUFBTSxzQkFBc0IsS0FBSyxNQUFNLEtBQUssUUFBUSxLQUFLLE1BQU0sVUFBVSxLQUFLLFFBQVE7QUFBQSxNQUNsRyxPQUFPO0FBQ04sZUFBTyxJQUFJLE1BQU0sMkJBQTJCLEtBQUssS0FBSztBQUFBLE1BQ3ZEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixRQUFJLE9BQU8saUJBQWlCLFFBQVc7QUFDdEMsaUJBQVcsZUFBZSxPQUFPO0FBQUEsSUFDbEM7QUFDQSxRQUFJLE9BQU8saUJBQWlCO0FBQzNCLGlCQUFXLFdBQVcsQ0FBQyxDQUFDLE9BQU87QUFBQSxJQUNoQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBakJPLEVBQUFBLHlCQUFTO0FBbUJULFdBQVMsS0FBSyxRQUFpRCxXQUFzRztBQUMzSyxRQUFJLE9BQU8sbUJBQW1CO0FBQzdCLDhCQUF3QixXQUFXLHdCQUF3QjtBQUFBLElBQzVEO0FBRUEsVUFBTSxtQkFBbUIsQ0FBQyxTQUF3RDtBQUNqRixVQUFJLEtBQUssVUFBVTtBQUNsQixnQ0FBd0IsV0FBVyxpQ0FBaUM7QUFBQSxNQUNyRTtBQUFBLElBQ0Q7QUFFQSxRQUFJLGFBQWE7QUFDakIsUUFBSSxhQUFzSDtBQUMxSCxRQUFJLE1BQU0sUUFBUSxPQUFPLGlCQUFpQixHQUFHO0FBQzVDLG1CQUFhLE9BQU8sbUJBQW1CLElBQUksWUFBVTtBQUNwRCxlQUFPLElBQUksTUFBTSxNQUFNLElBQUksU0FBUyxTQUFTLEtBQUssTUFBeUI7QUFBQSxNQUM1RSxDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sVUFBSSxPQUFPLG9CQUFvQjtBQUM5QixxQkFBYTtBQUFBLFVBQ1osUUFBUTtBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sVUFBVyxPQUFPLG1CQUFtRDtBQUFBLFlBQ3JFLE9BQU8sU0FBUyxLQUFNLE9BQU8sbUJBQW1ELEtBQUs7QUFBQSxVQUN0RjtBQUFBLFFBQ0Q7QUFDQSxxQkFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxNQUF3QjtBQUFBLE1BQzdCLFNBQVMsT0FBTyxRQUFRLElBQUksVUFBUTtBQUNuQyxZQUFJLGdCQUFnQixNQUFNLHVCQUF1QjtBQUNoRCwyQkFBaUIsSUFBSTtBQUNyQixpQkFBTztBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sT0FBTyxLQUFLO0FBQUEsWUFDWixVQUFVLEtBQUs7QUFBQSxVQUNoQjtBQUFBLFFBQ0QsV0FBVyxnQkFBZ0IsTUFBTSw0QkFBNEI7QUFDNUQsaUJBQU87QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLE9BQU8sS0FBSztBQUFBLFVBQ2I7QUFBQSxRQUNELFdBQVcsZ0JBQWdCLE1BQU0sdUJBQXVCO0FBQ3ZELDJCQUFpQixJQUFJO0FBQ3JCLHVCQUFhO0FBQ2IsaUJBQU87QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxjQUNOLFVBQVUsS0FBSztBQUFBLGNBQ2YsTUFBTSxTQUFTLEtBQUssS0FBSyxJQUFJO0FBQUEsWUFDOUI7QUFBQSxZQUNBLFVBQVUsS0FBSztBQUFBLFVBQ2hCO0FBQUEsUUFDRCxPQUFPO0FBQ04sZ0JBQU0sSUFBSSxNQUFNLDJDQUEyQztBQUFBLFFBQzVEO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxtQkFBbUIsZUFBZSxXQUFXLE9BQU8saUJBQWlCO0FBQUEsTUFDckUsbUJBQW1CO0FBQUEsTUFDbkIsY0FBYyxPQUFPO0FBQUEsTUFDckIsaUJBQWlCLE9BQU87QUFBQSxJQUN6QjtBQUVBLFdBQU8sYUFBYSxJQUFJLDhCQUE4QixHQUFHLElBQUk7QUFBQSxFQUM5RDtBQWxFTyxFQUFBQSx5QkFBUztBQUFBLEdBcEJBO0FBeUZWLElBQVU7QUFBQSxDQUFWLENBQVVDLGNBQVY7QUFDQyxXQUFTLGNBQWMsVUFBZ0Q7QUFDN0UsV0FBTztBQUFBLEVBQ1I7QUFGTyxFQUFBQSxVQUFTO0FBYVQsV0FBUyxLQUFLLE9BQTZFO0FBQ2pHLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1IsV0FBVyxVQUFVLFlBQVksS0FBSyxHQUFHO0FBQ3hDLGFBQU87QUFBQSxJQUNSLFdBQVcsSUFBSSxNQUFNLEtBQUssR0FBRztBQUM1QixhQUFPO0FBQUEsSUFDUixXQUFXLE9BQU8sVUFBVSxVQUFVO0FBQ3JDLGFBQU8sSUFBSSxLQUFLLEtBQUs7QUFBQSxJQUN0QixXQUFXLE9BQU8sVUFBVSxZQUFZLFVBQVUsUUFBUSxVQUFVLE9BQU87QUFDMUUsWUFBTSxPQUFPLE9BQU8sTUFBTSxTQUFTLFdBQVcsSUFBSSxLQUFLLE1BQU0sSUFBSSxJQUFJLE1BQU07QUFDM0UsWUFBTSxRQUFRLE9BQU8sTUFBTSxVQUFVLFdBQVcsSUFBSSxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU07QUFDOUUsYUFBTyxDQUFDLE9BQU8sU0FBWSxFQUFFLE1BQU0sT0FBTyxTQUFTLEtBQUs7QUFBQSxJQUN6RCxPQUFPO0FBQ04sYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBaEJPLEVBQUFBLFVBQVM7QUF5QlQsV0FBUyxHQUFHLE9BQTZFO0FBQy9GLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1IsV0FBVyxVQUFVLFlBQVksS0FBSyxHQUFHO0FBQ3hDLGFBQU87QUFBQSxJQUNSLFdBQVcsZ0JBQWdCLEtBQUssR0FBRztBQUNsQyxhQUFPLElBQUksT0FBTyxLQUFLO0FBQUEsSUFDeEIsT0FBTztBQUNOLFlBQU0sT0FBTztBQUNiLGFBQU87QUFBQSxRQUNOLE9BQU8sSUFBSSxPQUFPLEtBQUssS0FBSztBQUFBLFFBQzVCLE1BQU0sSUFBSSxPQUFPLEtBQUssSUFBSTtBQUFBLE1BQzNCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFkTyxFQUFBQSxVQUFTO0FBQUEsR0F2Q0E7QUF3RFYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsc0JBQVY7QUFDQyxXQUFTLHlCQUF5QixRQUE2RDtBQUNyRyxXQUFPO0FBQUEsTUFDTixPQUFPLE9BQU87QUFBQSxNQUNkLE1BQU0sNkJBQTZCLE9BQU8sSUFBSTtBQUFBLE1BQzlDLFVBQVUsT0FBTztBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQU5PLEVBQUFBLGtCQUFTO0FBUWhCLFdBQVMsNkJBQTZCLE1BQTBDO0FBQy9FLFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSywyQkFBMkI7QUFDL0IsZUFBTywyQkFBMkI7QUFBQSxNQUNuQyxLQUFLLDJCQUEyQjtBQUMvQixlQUFPLDJCQUEyQjtBQUFBLE1BQ25DLEtBQUssMkJBQTJCO0FBQy9CLGVBQU8sMkJBQTJCO0FBQUEsTUFDbkM7QUFDQyxjQUFNLElBQUksTUFBTSxvQ0FBb0M7QUFBQSxJQUN0RDtBQUFBLEVBQ0Q7QUFBQSxHQXBCZ0I7QUF1QlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMseUJBQVY7QUFDTixXQUFTLGFBQWEsV0FBb0Y7QUFDekcsV0FBTyxDQUFDLENBQUUsVUFBNkM7QUFBQSxFQUN4RDtBQUVPLFdBQVMsS0FBSyxNQUE4RDtBQUNsRixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGFBQWEsSUFBSSxJQUNkO0FBQUEsUUFDRCxNQUFNLHVCQUF1QjtBQUFBLFFBQzdCLEtBQUssS0FBSztBQUFBLFFBQ1YsU0FBUyxPQUFPLFFBQVEsS0FBSyxPQUFPO0FBQUEsUUFDcEMsZ0JBQWlCLEtBQXlDLGlCQUFpQjtBQUFBLFVBQzFFLFlBQWEsS0FBeUMsZUFBZ0I7QUFBQSxVQUN0RSxRQUFTLEtBQXlDLGVBQWdCO0FBQUEsUUFDbkUsSUFBSTtBQUFBLE1BQ0wsSUFDRTtBQUFBLFFBQ0QsTUFBTSx1QkFBdUI7QUFBQSxRQUM3QixLQUFLLEtBQUssS0FBSztBQUFBLFFBQ2YsTUFBTSxLQUFLO0FBQUEsUUFDWCxTQUFTLEtBQUs7QUFBQSxRQUNkLEtBQUssS0FBSztBQUFBLFFBQ1YsU0FBUztBQUFBLFFBQ1QsU0FBUztBQUFBLE1BQ1Y7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQXRCTyxFQUFBQSxxQkFBUztBQXlCVCxXQUFTLEdBQUcsS0FBcUU7QUFDdkYsVUFBTSxTQUFTLGdCQUFnQixlQUFlLElBQUksTUFBTTtBQUN4RCxRQUFJLE9BQU8sU0FBUyx1QkFBdUIsTUFBTTtBQUNoRCxhQUFPLElBQUksTUFBTTtBQUFBLFFBQ2hCLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLE9BQU8sWUFBWSxPQUFPLE9BQU87QUFBQSxRQUNqQyxJQUFJLGVBQWUsV0FBVyxTQUFZLElBQUk7QUFBQSxNQUMvQztBQUFBLElBQ0QsT0FBTztBQUNOLFlBQU0sU0FBUyxJQUFJLE1BQU07QUFBQSxRQUN4QixJQUFJO0FBQUEsUUFDSixPQUFPO0FBQUEsUUFDUCxDQUFDLEdBQUcsT0FBTyxJQUFJO0FBQUEsUUFDZixPQUFPLFlBQVksT0FBTyxRQUFRLE9BQU8sR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLEtBQUssS0FBSyxNQUFNLENBQUMsS0FBSyxVQUFVLE9BQU8sT0FBTyxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxRQUNqSCxJQUFJLGVBQWUsV0FBVyxTQUFZLElBQUk7QUFBQSxNQUMvQztBQUNBLFVBQUksT0FBTyxLQUFLO0FBQ2YsZUFBTyxNQUFNLElBQUksS0FBSyxPQUFPLEdBQUc7QUFBQSxNQUNqQztBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQXRCTyxFQUFBQSxxQkFBUztBQUFBLEdBOUJBO0FBdURWLElBQVU7QUFBQSxDQUFWLENBQVVDLHlDQUFWO0FBQ0MsV0FBUyxLQUFLLE1BQW1DO0FBQ3ZELFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSyxNQUFNLG9DQUFvQztBQUM5QyxlQUFPLG9CQUFvQjtBQUFBLE1BQzVCLEtBQUssTUFBTSxvQ0FBb0M7QUFDOUMsZUFBTyxvQkFBb0I7QUFBQSxNQUM1QixLQUFLLE1BQU0sb0NBQW9DO0FBQzlDLGVBQU8sb0JBQW9CO0FBQUEsTUFDNUI7QUFDQyxjQUFNLElBQUksTUFBTSw2Q0FBNkM7QUFBQSxJQUMvRDtBQUFBLEVBQ0Q7QUFYTyxFQUFBQSxxQ0FBUztBQUFBLEdBREE7QUFlVixJQUFVO0FBQUEsQ0FBVixDQUFVQywrQkFBVjtBQUNDLFdBQVMsR0FBRyxPQUFrRDtBQUNwRSxVQUFNLFNBQW1ELENBQUM7QUFDMUQsZUFBVyxDQUFDLFVBQVUsUUFBUSxLQUFLLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFDekQsVUFBSSxDQUFDLFlBQVksU0FBUyxXQUFXLEdBQUc7QUFDdkM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxZQUFzQyxDQUFDO0FBQzdDLGlCQUFXLE9BQU8sVUFBVTtBQUMzQixjQUFNLFdBQVcsZ0JBQWdCLEdBQUcsR0FBRztBQUN2QyxZQUFJLFVBQVU7QUFDYixvQkFBVSxLQUFLLFFBQVE7QUFBQSxRQUN4QjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLFVBQVUsU0FBUyxHQUFHO0FBQ3pCLGVBQU8sUUFBUSxJQUFJO0FBQUEsTUFDcEI7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFsQk8sRUFBQUEsMkJBQVM7QUFBQSxHQURBO0FBc0JWLElBQVU7QUFBQSxDQUFWLENBQVVDLHFCQUFWO0FBQ0MsV0FBUyxHQUFHLE1BQThEO0FBQ2hGLFVBQU0sVUFBVSx3QkFBd0IsTUFBTSxFQUFFO0FBQ2hELFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsS0FBSyxLQUFLO0FBQUEsTUFDVixLQUFLLEtBQUs7QUFBQSxNQUNWLFNBQVMsS0FBSztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBWE8sRUFBQUEsaUJBQVM7QUFBQSxHQURBO0FBZVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMscUJBQVY7QUFFTixXQUFTLGNBQWMsUUFBNkU7QUFDbkcsUUFBSSxXQUFXLFFBQVc7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFFQSxZQUFRLFFBQVE7QUFBQSxNQUNmLEtBQUs7QUFDSixlQUFPLGtCQUFrQjtBQUFBLE1BQzFCLEtBQUs7QUFDSixlQUFPLGtCQUFrQjtBQUFBLE1BQzFCLEtBQUs7QUFDSixlQUFPLGtCQUFrQjtBQUFBLE1BQzFCLEtBQUs7QUFDSixlQUFPLGtCQUFrQjtBQUFBLE1BQzFCO0FBQ0MsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBRU8sV0FBUyxLQUFLLGdCQUErRDtBQUVuRixVQUFNLFNBQVMsZUFBZTtBQUM5QixVQUFNLFVBQVUsUUFBUSxXQUFXLFFBQVEsYUFBYTtBQUN4RCxVQUFNLHFCQUFxQixRQUFRLHNCQUFzQixRQUFRO0FBQ2pFLFVBQU0sbUJBQW1CLFFBQVEsb0JBQW9CLFFBQVE7QUFFN0QsV0FBTztBQUFBLE1BQ04sVUFBVSxlQUFlO0FBQUEsTUFDekIsT0FBTyxlQUFlO0FBQUEsTUFDdEIsYUFBYSxlQUFlLGNBQWMsZUFBZSxLQUFLLGVBQWUsV0FBVyxJQUFJO0FBQUEsTUFDNUYsT0FBTyxlQUFlLFFBQVEsZUFBZSxLQUFLLGVBQWUsS0FBSyxJQUFJO0FBQUEsTUFDMUUsUUFBUSxjQUFjLGVBQWUsTUFBTTtBQUFBLE1BQzNDLFVBQVUsZUFBZTtBQUFBLE1BQ3pCLFNBQVMsZUFBZSxXQUFXLGVBQWUsT0FBTztBQUFBLE1BQ3pELFFBQVE7QUFBQSxRQUNQO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTLGVBQWUsbUJBQW1CLFFBQVEsZUFBZSxVQUFVO0FBQUEsTUFDNUUsVUFBVSxlQUFlO0FBQUEsTUFDekIsZ0JBQWdCLGVBQWU7QUFBQSxJQUNoQztBQUFBLEVBQ0Q7QUF4Qk8sRUFBQUEsaUJBQVM7QUFBQSxHQXJCQTsiLAogICJuYW1lcyI6IFsiU2VsZWN0aW9uIiwgIlJhbmdlIiwgIkxvY2F0aW9uIiwgImxvY2F0aW9uIiwgIlRva2VuVHlwZSIsICJQb3NpdGlvbiIsICJEb2N1bWVudFNlbGVjdG9yIiwgIlRhYlNlbGVjdG9yIiwgIkRpYWdub3N0aWNUYWciLCAiRGlhZ25vc3RpYyIsICJEaWFnbm9zdGljUmVsYXRlZEluZm9ybWF0aW9uIiwgIkRpYWdub3N0aWNTZXZlcml0eSIsICJWaWV3Q29sdW1uIiwgIk1hcmtkb3duU3RyaW5nIiwgIlRoZW1hYmxlRGVjb3JhdGlvbkF0dGFjaG1lbnRSZW5kZXJPcHRpb25zIiwgIlRoZW1hYmxlRGVjb3JhdGlvblJlbmRlck9wdGlvbnMiLCAiRGVjb3JhdGlvblJhbmdlQmVoYXZpb3IiLCAiRGVjb3JhdGlvblJlbmRlck9wdGlvbnMiLCAiVGV4dEVkaXQiLCAiV29ya3NwYWNlRWRpdCIsICJTeW1ib2xLaW5kIiwgIlN5bWJvbFRhZyIsICJXb3Jrc3BhY2VTeW1ib2wiLCAiRG9jdW1lbnRTeW1ib2wiLCAiQ2FsbEhpZXJhcmNoeUl0ZW0iLCAiQ2FsbEhpZXJhcmNoeUluY29taW5nQ2FsbCIsICJDYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxsIiwgIkRlZmluaXRpb25MaW5rIiwgIkhvdmVyIiwgIkV2YWx1YXRhYmxlRXhwcmVzc2lvbiIsICJJbmxpbmVWYWx1ZSIsICJJbmxpbmVWYWx1ZUNvbnRleHQiLCAiRG9jdW1lbnRIaWdobGlnaHQiLCAiTXVsdGlEb2N1bWVudEhpZ2hsaWdodCIsICJDb21wbGV0aW9uVHJpZ2dlcktpbmQiLCAiQ29tcGxldGlvbkNvbnRleHQiLCAiQ29tcGxldGlvbkl0ZW1UYWciLCAiQ29tcGxldGlvbkNvbW1hbmQiLCAiQ29tcGxldGlvbkl0ZW1LaW5kIiwgIkNvbXBsZXRpb25JdGVtIiwgIlBhcmFtZXRlckluZm9ybWF0aW9uIiwgIlNpZ25hdHVyZUluZm9ybWF0aW9uIiwgIlNpZ25hdHVyZUhlbHAiLCAiSW5sYXlIaW50IiwgIklubGF5SGludExhYmVsUGFydCIsICJJbmxheUhpbnRLaW5kIiwgIkRvY3VtZW50TGluayIsICJDb2xvclByZXNlbnRhdGlvbiIsICJDb2xvciIsICJTZWxlY3Rpb25SYW5nZSIsICJUZXh0RG9jdW1lbnRTYXZlUmVhc29uIiwgIlRleHRFZGl0b3JMaW5lTnVtYmVyc1N0eWxlIiwgIkVuZE9mTGluZSIsICJQcm9ncmVzc0xvY2F0aW9uIiwgIkZvbGRpbmdSYW5nZSIsICJGb2xkaW5nUmFuZ2VLaW5kIiwgIlRleHRFZGl0b3JPcGVuT3B0aW9ucyIsICJHbG9iUGF0dGVybiIsICJMYW5ndWFnZVNlbGVjdG9yIiwgIk5vdGVib29rUmFuZ2UiLCAiTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3VtbWFyeSIsICJOb3RlYm9va0NlbGxLaW5kIiwgIk5vdGVib29rRGF0YSIsICJOb3RlYm9va0NlbGxEYXRhIiwgIk5vdGVib29rQ2VsbE91dHB1dEl0ZW0iLCAiTm90ZWJvb2tDZWxsT3V0cHV0IiwgIk5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRQYXR0ZXJuIiwgIk5vdGVib29rU3RhdHVzQmFySXRlbSIsICJOb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbiIsICJOb3RlYm9va0RvY3VtZW50Q29udGVudE9wdGlvbnMiLCAiTm90ZWJvb2tSZW5kZXJlclNjcmlwdCIsICJUZXN0TWVzc2FnZSIsICJUZXN0VGFnIiwgIlRlc3RSdW5Qcm9maWxlIiwgIlRlc3RSdW5Qcm9maWxlS2luZCIsICJUZXN0SXRlbSIsICJUZXN0UmVzdWx0cyIsICJUZXN0Q292ZXJhZ2UiLCAiQ29kZUFjdGlvblRyaWdnZXJLaW5kIiwgIlR5cGVIaWVyYXJjaHlJdGVtIiwgIlZpZXdCYWRnZSIsICJEYXRhVHJhbnNmZXJJdGVtIiwgIkRhdGFUcmFuc2ZlciIsICJDaGF0Rm9sbG93dXAiLCAiTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZSIsICJMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UiLCAiY29udGVudCIsICJMYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyIiwgIkNoYXRSZXNwb25zZU1hcmtkb3duUGFydCIsICJDaGF0UmVzcG9uc2VDb2RlYmxvY2tVcmlQYXJ0IiwgIkNoYXRSZXNwb25zZU1hcmtkb3duV2l0aFZ1bG5lcmFiaWxpdGllc1BhcnQiLCAiQ2hhdFJlc3BvbnNlQ29uZmlybWF0aW9uUGFydCIsICJDaGF0UmVzcG9uc2VRdWVzdGlvbkNhcm91c2VsUGFydCIsICJDaGF0UmVzcG9uc2VGaWxlc1BhcnQiLCAiYmFzZVVyaSIsICJpdGVtcyIsICJDaGF0UmVzcG9uc2VNdWx0aURpZmZQYXJ0IiwgIkNoYXRSZXNwb25zZUFuY2hvclBhcnQiLCAiQ2hhdFJlc3BvbnNlUHJvZ3Jlc3NQYXJ0IiwgIkNoYXRSZXNwb25zZVRoaW5raW5nUHJvZ3Jlc3NQYXJ0IiwgIkNoYXRSZXNwb25zZUhvb2tQYXJ0IiwgIkNoYXRSZXNwb25zZVZvaWNlUHJvZ3Jlc3NQYXJ0IiwgIkNoYXRSZXNwb25zZUF1dG9Nb2RlUmVzb2x1dGlvblBhcnQiLCAiQ2hhdFJlc3BvbnNlV2FybmluZ1BhcnQiLCAiQ2hhdFJlc3BvbnNlSW5mb1BhcnQiLCAiQ2hhdFJlc3BvbnNlRXh0ZW5zaW9uc1BhcnQiLCAiQ2hhdFJlc3BvbnNlUHVsbFJlcXVlc3RQYXJ0IiwgIkNoYXRSZXNwb25zZU1vdmVQYXJ0IiwgIkNoYXRUb29sSW52b2NhdGlvblBhcnQiLCAiQ2hhdFRhc2siLCAiQ2hhdFRhc2tSZXN1bHQiLCAiQ2hhdFJlc3BvbnNlQ29tbWFuZEJ1dHRvblBhcnQiLCAiQ2hhdFJlc3BvbnNlVGV4dEVkaXRQYXJ0IiwgIk5vdGVib29rRWRpdCIsICJDaGF0UmVzcG9uc2VOb3RlYm9va0VkaXRQYXJ0IiwgIkNoYXRSZXNwb25zZVdvcmtzcGFjZUVkaXRQYXJ0IiwgIkNoYXRSZXNwb25zZVJlZmVyZW5jZVBhcnQiLCAidmFsdWUiLCAiQ2hhdFJlc3BvbnNlQ29kZUNpdGF0aW9uUGFydCIsICJDaGF0UmVzcG9uc2VQYXJ0IiwgIkNoYXRBZ2VudFJlcXVlc3QiLCAiQ2hhdExvY2F0aW9uIiwgIkNoYXRTZXNzaW9uQ3VzdG9taXphdGlvblR5cGUiLCAiQ2hhdFByb21wdFJlZmVyZW5jZSIsICJkIiwgIkNoYXRMYW5ndWFnZU1vZGVsVG9vbFJlZmVyZW5jZSIsICJDaGF0TGFuZ3VhZ2VNb2RlbFRvb2xSZWZlcmVuY2VzIiwgIkNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucyIsICJDaGF0QWdlbnRDb21wbGV0aW9uSXRlbSIsICJDaGF0QWdlbnRSZXN1bHQiLCAiQ2hhdEFnZW50VXNlckFjdGlvbkV2ZW50IiwgIlRlcm1pbmFsUXVpY2tGaXgiLCAiVGVybWluYWxDb21wbGV0aW9uSXRlbUR0byIsICJUZXJtaW5hbENvbXBsZXRpb25MaXN0IiwgIlRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyIsICJQYXJ0aWFsQWNjZXB0SW5mbyIsICJQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQiLCAiSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbiIsICJJbmxpbmVDb21wbGV0aW9uSGludFN0eWxlIiwgIkRlYnVnVHJlZUl0ZW0iLCAiTGFuZ3VhZ2VNb2RlbFRvb2xTb3VyY2UiLCAiTGFuZ3VhZ2VNb2RlbFRvb2xSZXN1bHQiLCAiSWNvblBhdGgiLCAiQWlTZXR0aW5nc1NlYXJjaCIsICJNY3BTZXJ2ZXJEZWZpbml0aW9uIiwgIlNvdXJjZUNvbnRyb2xJbnB1dEJveFZhbGlkYXRpb25UeXBlIiwgIkNoYXRSZXF1ZXN0SG9va3NDb252ZXJ0ZXIiLCAiQ2hhdEhvb2tDb21tYW5kIiwgIkNoYXRTZXNzaW9uSXRlbSJdCn0K
