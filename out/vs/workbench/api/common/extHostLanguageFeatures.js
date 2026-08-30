import { asArray, coalesce, isFalsyOrEmpty, isNonEmptyArray } from "../../../base/common/arrays.js";
import { raceCancellationError } from "../../../base/common/async.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { NotImplementedError, isCancellationError } from "../../../base/common/errors.js";
import { IdGenerator } from "../../../base/common/idGenerator.js";
import { DisposableStore, Disposable as CoreDisposable } from "../../../base/common/lifecycle.js";
import { equals, mixin } from "../../../base/common/objects.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { regExpLeadsToEndlessLoop } from "../../../base/common/strings.js";
import { assertType, isObject } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { Range as EditorRange } from "../../../editor/common/core/range.js";
import { Selection } from "../../../editor/common/core/selection.js";
import * as languages from "../../../editor/common/languages.js";
import { encodeSemanticTokensDto } from "../../../editor/common/services/semanticTokensDto.js";
import { localize } from "../../../nls.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { Cache } from "./cache.js";
import * as extHostProtocol from "./extHost.protocol.js";
import * as typeConvert from "./extHostTypeConverters.js";
import { CodeAction, CodeActionKind, CompletionList, DataTransfer, Disposable, DocumentDropOrPasteEditKind, DocumentSymbol, InlineCompletionsDisposeReasonKind, InlineCompletionTriggerKind, InternalDataTransferItem, Location, NewSymbolNameTriggerKind, Range, SemanticTokens, SemanticTokensEdit, SemanticTokensEdits, SnippetString, SyntaxTokenType } from "./extHostTypes.js";
import { Emitter } from "../../../base/common/event.js";
class DocumentSymbolAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentSymbols(resource, token) {
    const doc = this._documents.getDocument(resource);
    const value = await this._provider.provideDocumentSymbols(doc, token);
    if (isFalsyOrEmpty(value)) {
      return void 0;
    } else if (value[0] instanceof DocumentSymbol) {
      return value.map(typeConvert.DocumentSymbol.from);
    } else {
      return DocumentSymbolAdapter._asDocumentSymbolTree(value);
    }
  }
  static _asDocumentSymbolTree(infos) {
    infos = infos.slice(0).sort((a, b) => {
      let res2 = a.location.range.start.compareTo(b.location.range.start);
      if (res2 === 0) {
        res2 = b.location.range.end.compareTo(a.location.range.end);
      }
      return res2;
    });
    const res = [];
    const parentStack = [];
    for (const info of infos) {
      const element = {
        name: info.name || "!!MISSING: name!!",
        kind: typeConvert.SymbolKind.from(info.kind),
        tags: info.tags?.map(typeConvert.SymbolTag.from) || [],
        detail: "",
        containerName: info.containerName,
        range: typeConvert.Range.from(info.location.range),
        selectionRange: typeConvert.Range.from(info.location.range),
        children: []
      };
      while (true) {
        if (parentStack.length === 0) {
          parentStack.push(element);
          res.push(element);
          break;
        }
        const parent = parentStack[parentStack.length - 1];
        if (EditorRange.containsRange(parent.range, element.range) && !EditorRange.equalsRange(parent.range, element.range)) {
          parent.children?.push(element);
          parentStack.push(element);
          break;
        }
        parentStack.pop();
      }
    }
    return res;
  }
}
class CodeLensAdapter {
  constructor(_documents, _commands, _provider, _extension, _extTelemetry, _logService) {
    this._documents = _documents;
    this._commands = _commands;
    this._provider = _provider;
    this._extension = _extension;
    this._extTelemetry = _extTelemetry;
    this._logService = _logService;
    this._cache = new Cache("CodeLens");
    this._disposables = /* @__PURE__ */ new Map();
  }
  async provideCodeLenses(resource, token) {
    const doc = this._documents.getDocument(resource);
    const lenses = await this._provider.provideCodeLenses(doc, token);
    if (!lenses || token.isCancellationRequested) {
      return void 0;
    }
    const cacheId = this._cache.add(lenses);
    const disposables = new DisposableStore();
    this._disposables.set(cacheId, disposables);
    const result = {
      cacheId,
      lenses: []
    };
    for (let i = 0; i < lenses.length; i++) {
      if (!Range.isRange(lenses[i].range)) {
        console.warn("INVALID code lens, range is not defined", this._extension.identifier.value);
        continue;
      }
      result.lenses.push({
        cacheId: [cacheId, i],
        range: typeConvert.Range.from(lenses[i].range),
        command: this._commands.toInternal(lenses[i].command, disposables)
      });
    }
    return result;
  }
  async resolveCodeLens(symbol, token) {
    const lens = symbol.cacheId && this._cache.get(...symbol.cacheId);
    if (!lens) {
      return void 0;
    }
    let resolvedLens;
    if (typeof this._provider.resolveCodeLens !== "function" || lens.isResolved) {
      resolvedLens = lens;
    } else {
      resolvedLens = await this._provider.resolveCodeLens(lens, token);
    }
    if (!resolvedLens) {
      resolvedLens = lens;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const disposables = symbol.cacheId && this._disposables.get(symbol.cacheId[0]);
    if (!disposables) {
      return void 0;
    }
    if (!resolvedLens.command) {
      const error = new Error("INVALID code lens resolved, lacks command: " + this._extension.identifier.value);
      this._extTelemetry.onExtensionError(this._extension.identifier, error);
      this._logService.error(error);
      return void 0;
    }
    symbol.command = this._commands.toInternal(resolvedLens.command, disposables);
    return symbol;
  }
  releaseCodeLenses(cachedId) {
    this._disposables.get(cachedId)?.dispose();
    this._disposables.delete(cachedId);
    this._cache.delete(cachedId);
  }
}
function convertToLocationLinks(value) {
  if (Array.isArray(value)) {
    return value.map(typeConvert.DefinitionLink.from);
  } else if (value) {
    return [typeConvert.DefinitionLink.from(value)];
  }
  return [];
}
class DefinitionAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDefinition(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideDefinition(doc, pos, token);
    return convertToLocationLinks(value);
  }
}
class DeclarationAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDeclaration(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideDeclaration(doc, pos, token);
    return convertToLocationLinks(value);
  }
}
class ImplementationAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideImplementation(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideImplementation(doc, pos, token);
    return convertToLocationLinks(value);
  }
}
class TypeDefinitionAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideTypeDefinition(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideTypeDefinition(doc, pos, token);
    return convertToLocationLinks(value);
  }
}
const _HoverAdapter = class _HoverAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._hoverCounter = 0;
    this._hoverMap = /* @__PURE__ */ new Map();
  }
  async provideHover(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    let value;
    if (context && context.verbosityRequest) {
      const previousHoverId = context.verbosityRequest.previousHover.id;
      const previousHover = this._hoverMap.get(previousHoverId);
      if (!previousHover) {
        throw new Error(`Hover with id ${previousHoverId} not found`);
      }
      const hoverContext = { verbosityDelta: context.verbosityRequest.verbosityDelta, previousHover };
      value = await this._provider.provideHover(doc, pos, token, hoverContext);
    } else {
      value = await this._provider.provideHover(doc, pos, token);
    }
    if (!value || isFalsyOrEmpty(value.contents)) {
      return void 0;
    }
    if (!value.range) {
      value.range = doc.getWordRangeAtPosition(pos);
    }
    if (!value.range) {
      value.range = new Range(pos, pos);
    }
    const convertedHover = typeConvert.Hover.from(value);
    const id = this._hoverCounter;
    if (this._hoverMap.size === _HoverAdapter.HOVER_MAP_MAX_SIZE) {
      const minimumId = Math.min(...this._hoverMap.keys());
      this._hoverMap.delete(minimumId);
    }
    this._hoverMap.set(id, value);
    this._hoverCounter += 1;
    const hover = {
      ...convertedHover,
      id
    };
    return hover;
  }
  releaseHover(id) {
    this._hoverMap.delete(id);
  }
};
_HoverAdapter.HOVER_MAP_MAX_SIZE = 10;
let HoverAdapter = _HoverAdapter;
class EvaluatableExpressionAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideEvaluatableExpression(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideEvaluatableExpression(doc, pos, token);
    if (value) {
      return typeConvert.EvaluatableExpression.from(value);
    }
    return void 0;
  }
}
class InlineValuesAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideInlineValues(resource, viewPort, context, token) {
    const doc = this._documents.getDocument(resource);
    const value = await this._provider.provideInlineValues(doc, typeConvert.Range.to(viewPort), typeConvert.InlineValueContext.to(context), token);
    if (Array.isArray(value)) {
      return value.map((iv) => typeConvert.InlineValue.from(iv));
    }
    return void 0;
  }
}
class DocumentHighlightAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentHighlights(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideDocumentHighlights(doc, pos, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.DocumentHighlight.from);
    }
    return void 0;
  }
}
class MultiDocumentHighlightAdapter {
  constructor(_documents, _provider, _logService) {
    this._documents = _documents;
    this._provider = _provider;
    this._logService = _logService;
  }
  async provideMultiDocumentHighlights(resource, position, otherResources, token) {
    const doc = this._documents.getDocument(resource);
    const otherDocuments = otherResources.map((r) => {
      try {
        return this._documents.getDocument(r);
      } catch (err) {
        this._logService.error("Error: Unable to retrieve document from URI: " + r + ". Error message: " + err);
        return void 0;
      }
    }).filter((doc2) => doc2 !== void 0);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideMultiDocumentHighlights(doc, pos, otherDocuments, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.MultiDocumentHighlight.from);
    }
    return void 0;
  }
}
class LinkedEditingRangeAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideLinkedEditingRanges(resource, position, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideLinkedEditingRanges(doc, pos, token);
    if (value && Array.isArray(value.ranges)) {
      return {
        ranges: coalesce(value.ranges.map(typeConvert.Range.from)),
        wordPattern: value.wordPattern
      };
    }
    return void 0;
  }
}
class ReferenceAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideReferences(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideReferences(doc, pos, context, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.location.from);
    }
    return void 0;
  }
}
const _CodeActionAdapter = class _CodeActionAdapter {
  constructor(_documents, _commands, _diagnostics, _provider, _logService, _extension, _apiDeprecation) {
    this._documents = _documents;
    this._commands = _commands;
    this._diagnostics = _diagnostics;
    this._provider = _provider;
    this._logService = _logService;
    this._extension = _extension;
    this._apiDeprecation = _apiDeprecation;
    this._cache = new Cache("CodeAction");
    this._disposables = /* @__PURE__ */ new Map();
  }
  async provideCodeActions(resource, rangeOrSelection, context, token) {
    const doc = this._documents.getDocument(resource);
    const ran = Selection.isISelection(rangeOrSelection) ? typeConvert.Selection.to(rangeOrSelection) : typeConvert.Range.to(rangeOrSelection);
    const allDiagnostics = [];
    for (const diagnostic of this._diagnostics.getDiagnostics(resource)) {
      if (ran.intersection(diagnostic.range)) {
        const newLen = allDiagnostics.push(diagnostic);
        if (newLen > _CodeActionAdapter._maxCodeActionsPerFile) {
          break;
        }
      }
    }
    const codeActionContext = {
      diagnostics: allDiagnostics,
      only: context.only ? new CodeActionKind(context.only) : void 0,
      triggerKind: typeConvert.CodeActionTriggerKind.to(context.trigger)
    };
    const commandsOrActions = await this._provider.provideCodeActions(doc, ran, codeActionContext, token);
    if (!isNonEmptyArray(commandsOrActions) || token.isCancellationRequested) {
      return void 0;
    }
    const cacheId = this._cache.add(commandsOrActions);
    const disposables = new DisposableStore();
    this._disposables.set(cacheId, disposables);
    const actions = [];
    for (let i = 0; i < commandsOrActions.length; i++) {
      const candidate = commandsOrActions[i];
      if (!candidate) {
        continue;
      }
      if (_CodeActionAdapter._isCommand(candidate) && !(candidate instanceof CodeAction)) {
        this._apiDeprecation.report(
          "CodeActionProvider.provideCodeActions - return commands",
          this._extension,
          `Return 'CodeAction' instances instead.`
        );
        actions.push({
          _isSynthetic: true,
          title: candidate.title,
          command: this._commands.toInternal(candidate, disposables)
        });
      } else {
        const toConvert = candidate;
        if (codeActionContext.only) {
          if (!toConvert.kind) {
            this._logService.warn(`${this._extension.identifier.value} - Code actions of kind '${codeActionContext.only.value}' requested but returned code action does not have a 'kind'. Code action will be dropped. Please set 'CodeAction.kind'.`);
          } else if (!codeActionContext.only.contains(toConvert.kind)) {
            this._logService.warn(`${this._extension.identifier.value} - Code actions of kind '${codeActionContext.only.value}' requested but returned code action is of kind '${toConvert.kind.value}'. Code action will be dropped. Please check 'CodeActionContext.only' to only return requested code actions.`);
          }
        }
        const range = toConvert.ranges ?? [];
        actions.push({
          cacheId: [cacheId, i],
          title: toConvert.title,
          command: toConvert.command && this._commands.toInternal(toConvert.command, disposables),
          diagnostics: toConvert.diagnostics && toConvert.diagnostics.map(typeConvert.Diagnostic.from),
          edit: toConvert.edit && typeConvert.WorkspaceEdit.from(toConvert.edit, void 0),
          kind: toConvert.kind && toConvert.kind.value,
          isPreferred: toConvert.isPreferred,
          isAI: isProposedApiEnabled(this._extension, "codeActionAI") ? toConvert.isAI : false,
          ranges: isProposedApiEnabled(this._extension, "codeActionRanges") ? coalesce(range.map(typeConvert.Range.from)) : void 0,
          disabled: toConvert.disabled?.reason
        });
      }
    }
    return { cacheId, actions };
  }
  async resolveCodeAction(id, token) {
    const [sessionId, itemId] = id;
    const item = this._cache.get(sessionId, itemId);
    if (!item || _CodeActionAdapter._isCommand(item)) {
      return {};
    }
    if (!this._provider.resolveCodeAction) {
      return {};
    }
    const resolvedItem = await this._provider.resolveCodeAction(item, token) ?? item;
    let resolvedEdit;
    if (resolvedItem.edit) {
      resolvedEdit = typeConvert.WorkspaceEdit.from(resolvedItem.edit, void 0);
    }
    let resolvedCommand;
    if (resolvedItem.command) {
      const disposables = this._disposables.get(sessionId);
      if (disposables) {
        resolvedCommand = this._commands.toInternal(resolvedItem.command, disposables);
      }
    }
    return { edit: resolvedEdit, command: resolvedCommand };
  }
  releaseCodeActions(cachedId) {
    this._disposables.get(cachedId)?.dispose();
    this._disposables.delete(cachedId);
    this._cache.delete(cachedId);
  }
  static _isCommand(thing) {
    return typeof thing.command === "string" && typeof thing.title === "string";
  }
};
_CodeActionAdapter._maxCodeActionsPerFile = 1e3;
let CodeActionAdapter = _CodeActionAdapter;
class DocumentPasteEditProvider {
  constructor(_proxy, _documents, _provider, _handle, _extension) {
    this._proxy = _proxy;
    this._documents = _documents;
    this._provider = _provider;
    this._handle = _handle;
    this._extension = _extension;
    this._editsCache = new Cache("DocumentPasteEdit.edits");
  }
  async prepareDocumentPaste(resource, ranges, dataTransferDto, token) {
    if (!this._provider.prepareDocumentPaste) {
      return;
    }
    this._cachedPrepare = void 0;
    const doc = this._documents.getDocument(resource);
    const vscodeRanges = ranges.map((range) => typeConvert.Range.to(range));
    const dataTransfer = typeConvert.DataTransfer.toDataTransfer(dataTransferDto, () => {
      throw new NotImplementedError();
    });
    await this._provider.prepareDocumentPaste(doc, vscodeRanges, dataTransfer, token);
    if (token.isCancellationRequested) {
      return;
    }
    const newEntries = Array.from(dataTransfer).filter(([, value]) => !(value instanceof InternalDataTransferItem));
    const newCache = /* @__PURE__ */ new Map();
    const items = await Promise.all(Array.from(newEntries, async ([mime, value]) => {
      const id = generateUuid();
      newCache.set(id, value);
      return [mime, await typeConvert.DataTransferItem.from(mime, value, id)];
    }));
    this._cachedPrepare = newCache;
    return { items };
  }
  async providePasteEdits(requestId, resource, ranges, dataTransferDto, context, token) {
    if (!this._provider.provideDocumentPasteEdits) {
      return [];
    }
    const doc = this._documents.getDocument(resource);
    const vscodeRanges = ranges.map((range) => typeConvert.Range.to(range));
    const items = dataTransferDto.items.map(([mime, value]) => {
      const cached = this._cachedPrepare?.get(value.id);
      if (cached) {
        return [mime, cached];
      }
      return [
        mime,
        typeConvert.DataTransferItem.to(mime, value, async (id) => {
          return (await this._proxy.$resolvePasteFileData(this._handle, requestId, id)).buffer;
        })
      ];
    });
    const dataTransfer = new DataTransfer(items);
    const edits = await this._provider.provideDocumentPasteEdits(doc, vscodeRanges, dataTransfer, {
      only: context.only ? new DocumentDropOrPasteEditKind(context.only) : void 0,
      triggerKind: context.triggerKind
    }, token);
    if (!edits || token.isCancellationRequested) {
      return [];
    }
    const cacheId = this._editsCache.add(edits);
    return edits.map((edit, i) => ({
      _cacheId: [cacheId, i],
      title: edit.title ?? localize("defaultPasteLabel", "Paste using '{0}' extension", this._extension.displayName || this._extension.name),
      kind: edit.kind,
      yieldTo: edit.yieldTo?.map((x) => x.value),
      insertText: typeof edit.insertText === "string" ? edit.insertText : { snippet: edit.insertText.value },
      additionalEdit: edit.additionalEdit ? typeConvert.WorkspaceEdit.from(edit.additionalEdit, void 0) : void 0
    }));
  }
  async resolvePasteEdit(id, token) {
    const [sessionId, itemId] = id;
    const item = this._editsCache.get(sessionId, itemId);
    if (!item || !this._provider.resolveDocumentPasteEdit) {
      return {};
    }
    const resolvedItem = await this._provider.resolveDocumentPasteEdit(item, token) ?? item;
    return {
      insertText: resolvedItem.insertText,
      additionalEdit: resolvedItem.additionalEdit ? typeConvert.WorkspaceEdit.from(resolvedItem.additionalEdit, void 0) : void 0
    };
  }
  releasePasteEdits(id) {
    this._editsCache.delete(id);
  }
}
class DocumentFormattingAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentFormattingEdits(resource, options, token) {
    const document = this._documents.getDocument(resource);
    const value = await this._provider.provideDocumentFormattingEdits(document, options, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.TextEdit.from);
    }
    return void 0;
  }
}
class RangeFormattingAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentRangeFormattingEdits(resource, range, options, token) {
    const document = this._documents.getDocument(resource);
    const ran = typeConvert.Range.to(range);
    const value = await this._provider.provideDocumentRangeFormattingEdits(document, ran, options, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.TextEdit.from);
    }
    return void 0;
  }
  async provideDocumentRangesFormattingEdits(resource, ranges, options, token) {
    assertType(typeof this._provider.provideDocumentRangesFormattingEdits === "function", "INVALID invocation of `provideDocumentRangesFormattingEdits`");
    const document = this._documents.getDocument(resource);
    const _ranges = ranges.map(typeConvert.Range.to);
    const value = await this._provider.provideDocumentRangesFormattingEdits(document, _ranges, options, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.TextEdit.from);
    }
    return void 0;
  }
}
class OnTypeFormattingAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this.autoFormatTriggerCharacters = [];
  }
  // not here
  async provideOnTypeFormattingEdits(resource, position, ch, options, token) {
    const document = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const value = await this._provider.provideOnTypeFormattingEdits(document, pos, ch, options, token);
    if (Array.isArray(value)) {
      return value.map(typeConvert.TextEdit.from);
    }
    return void 0;
  }
}
class NavigateTypeAdapter {
  constructor(_provider, _logService) {
    this._provider = _provider;
    this._logService = _logService;
    this._cache = new Cache("WorkspaceSymbols");
  }
  async provideWorkspaceSymbols(search, token) {
    const value = await this._provider.provideWorkspaceSymbols(search, token);
    if (!isNonEmptyArray(value)) {
      return { symbols: [] };
    }
    const sid = this._cache.add(value);
    const result = {
      cacheId: sid,
      symbols: []
    };
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (!item || !item.name) {
        this._logService.warn("INVALID SymbolInformation", item);
        continue;
      }
      result.symbols.push({
        ...typeConvert.WorkspaceSymbol.from(item),
        cacheId: [sid, i]
      });
    }
    return result;
  }
  async resolveWorkspaceSymbol(symbol, token) {
    if (typeof this._provider.resolveWorkspaceSymbol !== "function") {
      return symbol;
    }
    if (!symbol.cacheId) {
      return symbol;
    }
    const item = this._cache.get(...symbol.cacheId);
    if (item) {
      const value = await this._provider.resolveWorkspaceSymbol(item, token);
      return value && mixin(symbol, typeConvert.WorkspaceSymbol.from(value), true);
    }
    return void 0;
  }
  releaseWorkspaceSymbols(id) {
    this._cache.delete(id);
  }
}
class RenameAdapter {
  constructor(_documents, _provider, _logService) {
    this._documents = _documents;
    this._provider = _provider;
    this._logService = _logService;
  }
  static supportsResolving(provider) {
    return typeof provider.prepareRename === "function";
  }
  async provideRenameEdits(resource, position, newName, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    try {
      const value = await this._provider.provideRenameEdits(doc, pos, newName, token);
      if (!value) {
        return void 0;
      }
      return typeConvert.WorkspaceEdit.from(value);
    } catch (err) {
      const rejectReason = RenameAdapter._asMessage(err);
      if (rejectReason) {
        return { rejectReason, edits: void 0 };
      } else {
        return Promise.reject(err);
      }
    }
  }
  async resolveRenameLocation(resource, position, token) {
    if (typeof this._provider.prepareRename !== "function") {
      return Promise.resolve(void 0);
    }
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    try {
      const rangeOrLocation = await this._provider.prepareRename(doc, pos, token);
      let range;
      let text;
      if (Range.isRange(rangeOrLocation)) {
        range = rangeOrLocation;
        text = doc.getText(rangeOrLocation);
      } else if (isObject(rangeOrLocation)) {
        range = rangeOrLocation.range;
        text = rangeOrLocation.placeholder;
      }
      if (!range || !text) {
        return void 0;
      }
      if (range.start.line > pos.line || range.end.line < pos.line) {
        this._logService.warn("INVALID rename location: position line must be within range start/end lines");
        return void 0;
      }
      return { range: typeConvert.Range.from(range), text };
    } catch (err) {
      const rejectReason = RenameAdapter._asMessage(err);
      if (rejectReason) {
        return { rejectReason, range: void 0, text: void 0 };
      } else {
        return Promise.reject(err);
      }
    }
  }
  static _asMessage(err) {
    if (typeof err === "string") {
      return err;
    } else if (err instanceof Error && typeof err.message === "string") {
      return err.message;
    } else {
      return void 0;
    }
  }
}
const _NewSymbolNamesAdapter = class _NewSymbolNamesAdapter {
  constructor(_documents, _provider, _logService) {
    this._documents = _documents;
    this._provider = _provider;
    this._logService = _logService;
  }
  async supportsAutomaticNewSymbolNamesTriggerKind() {
    return this._provider.supportsAutomaticTriggerKind;
  }
  async provideNewSymbolNames(resource, range, triggerKind, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Range.to(range);
    try {
      const kind = _NewSymbolNamesAdapter.languageTriggerKindToVSCodeTriggerKind[triggerKind];
      const value = await this._provider.provideNewSymbolNames(doc, pos, kind, token);
      if (!value) {
        return void 0;
      }
      return value.map(
        (v) => typeof v === "string" ? { newSymbolName: v } : { newSymbolName: v.newSymbolName, tags: v.tags }
      );
    } catch (err) {
      this._logService.error(
        _NewSymbolNamesAdapter._asMessage(err) ?? JSON.stringify(err, null, "	")
        /* @ulugbekna: assuming `err` doesn't have circular references that could result in an exception when converting to JSON */
      );
      return void 0;
    }
  }
  // @ulugbekna: this method is also defined in RenameAdapter but seems OK to be duplicated
  static _asMessage(err) {
    if (typeof err === "string") {
      return err;
    } else if (err instanceof Error && typeof err.message === "string") {
      return err.message;
    } else {
      return void 0;
    }
  }
};
_NewSymbolNamesAdapter.languageTriggerKindToVSCodeTriggerKind = {
  [languages.NewSymbolNameTriggerKind.Invoke]: NewSymbolNameTriggerKind.Invoke,
  [languages.NewSymbolNameTriggerKind.Automatic]: NewSymbolNameTriggerKind.Automatic
};
let NewSymbolNamesAdapter = _NewSymbolNamesAdapter;
class SemanticTokensPreviousResult {
  constructor(resultId, tokens) {
    this.resultId = resultId;
    this.tokens = tokens;
  }
}
class DocumentSemanticTokensAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._nextResultId = 1;
    this._previousResults = /* @__PURE__ */ new Map();
  }
  async provideDocumentSemanticTokens(resource, previousResultId, token) {
    const doc = this._documents.getDocument(resource);
    const previousResult = previousResultId !== 0 ? this._previousResults.get(previousResultId) : null;
    let value = typeof previousResult?.resultId === "string" && typeof this._provider.provideDocumentSemanticTokensEdits === "function" ? await this._provider.provideDocumentSemanticTokensEdits(doc, previousResult.resultId, token) : await this._provider.provideDocumentSemanticTokens(doc, token);
    if (previousResult) {
      this._previousResults.delete(previousResultId);
    }
    if (!value) {
      return null;
    }
    value = DocumentSemanticTokensAdapter._fixProvidedSemanticTokens(value);
    return this._send(DocumentSemanticTokensAdapter._convertToEdits(previousResult, value), value);
  }
  async releaseDocumentSemanticColoring(semanticColoringResultId) {
    this._previousResults.delete(semanticColoringResultId);
  }
  static _fixProvidedSemanticTokens(v) {
    if (DocumentSemanticTokensAdapter._isSemanticTokens(v)) {
      if (DocumentSemanticTokensAdapter._isCorrectSemanticTokens(v)) {
        return v;
      }
      return new SemanticTokens(new Uint32Array(v.data), v.resultId);
    } else if (DocumentSemanticTokensAdapter._isSemanticTokensEdits(v)) {
      if (DocumentSemanticTokensAdapter._isCorrectSemanticTokensEdits(v)) {
        return v;
      }
      return new SemanticTokensEdits(v.edits.map((edit) => new SemanticTokensEdit(edit.start, edit.deleteCount, edit.data ? new Uint32Array(edit.data) : edit.data)), v.resultId);
    }
    return v;
  }
  static _isSemanticTokens(v) {
    return v && !!v.data;
  }
  static _isCorrectSemanticTokens(v) {
    return v.data instanceof Uint32Array;
  }
  static _isSemanticTokensEdits(v) {
    return v && Array.isArray(v.edits);
  }
  static _isCorrectSemanticTokensEdits(v) {
    for (const edit of v.edits) {
      if (!(edit.data instanceof Uint32Array)) {
        return false;
      }
    }
    return true;
  }
  static _convertToEdits(previousResult, newResult) {
    if (!DocumentSemanticTokensAdapter._isSemanticTokens(newResult)) {
      return newResult;
    }
    if (!previousResult || !previousResult.tokens) {
      return newResult;
    }
    const oldData = previousResult.tokens;
    const oldLength = oldData.length;
    const newData = newResult.data;
    const newLength = newData.length;
    let commonPrefixLength = 0;
    const maxCommonPrefixLength = Math.min(oldLength, newLength);
    while (commonPrefixLength < maxCommonPrefixLength && oldData[commonPrefixLength] === newData[commonPrefixLength]) {
      commonPrefixLength++;
    }
    if (commonPrefixLength === oldLength && commonPrefixLength === newLength) {
      return new SemanticTokensEdits([], newResult.resultId);
    }
    let commonSuffixLength = 0;
    const maxCommonSuffixLength = maxCommonPrefixLength - commonPrefixLength;
    while (commonSuffixLength < maxCommonSuffixLength && oldData[oldLength - commonSuffixLength - 1] === newData[newLength - commonSuffixLength - 1]) {
      commonSuffixLength++;
    }
    return new SemanticTokensEdits([{
      start: commonPrefixLength,
      deleteCount: oldLength - commonPrefixLength - commonSuffixLength,
      data: newData.subarray(commonPrefixLength, newLength - commonSuffixLength)
    }], newResult.resultId);
  }
  _send(value, original) {
    if (DocumentSemanticTokensAdapter._isSemanticTokens(value)) {
      const myId = this._nextResultId++;
      this._previousResults.set(myId, new SemanticTokensPreviousResult(value.resultId, value.data));
      return encodeSemanticTokensDto({
        id: myId,
        type: "full",
        data: value.data
      });
    }
    if (DocumentSemanticTokensAdapter._isSemanticTokensEdits(value)) {
      const myId = this._nextResultId++;
      if (DocumentSemanticTokensAdapter._isSemanticTokens(original)) {
        this._previousResults.set(myId, new SemanticTokensPreviousResult(original.resultId, original.data));
      } else {
        this._previousResults.set(myId, new SemanticTokensPreviousResult(value.resultId));
      }
      return encodeSemanticTokensDto({
        id: myId,
        type: "delta",
        deltas: (value.edits || []).map((edit) => ({ start: edit.start, deleteCount: edit.deleteCount, data: edit.data }))
      });
    }
    return null;
  }
}
class DocumentRangeSemanticTokensAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideDocumentRangeSemanticTokens(resource, range, token) {
    const doc = this._documents.getDocument(resource);
    const value = await this._provider.provideDocumentRangeSemanticTokens(doc, typeConvert.Range.to(range), token);
    if (!value) {
      return null;
    }
    return this._send(value);
  }
  _send(value) {
    return encodeSemanticTokensDto({
      id: 0,
      type: "full",
      data: value.data
    });
  }
}
class CompletionsAdapter {
  constructor(_documents, _commands, _provider, _apiDeprecation, _extension) {
    this._documents = _documents;
    this._commands = _commands;
    this._provider = _provider;
    this._apiDeprecation = _apiDeprecation;
    this._extension = _extension;
    this._cache = new Cache("CompletionItem");
    this._disposables = /* @__PURE__ */ new Map();
  }
  static supportsResolving(provider) {
    return typeof provider.resolveCompletionItem === "function";
  }
  async provideCompletionItems(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const replaceRange = doc.getWordRangeAtPosition(pos) || new Range(pos, pos);
    const insertRange = replaceRange.with({ end: pos });
    const sw = new StopWatch();
    const itemsOrList = await this._provider.provideCompletionItems(doc, pos, token, typeConvert.CompletionContext.to(context));
    if (!itemsOrList) {
      return void 0;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const list = Array.isArray(itemsOrList) ? new CompletionList(itemsOrList) : itemsOrList;
    const pid = CompletionsAdapter.supportsResolving(this._provider) ? this._cache.add(list.items) : this._cache.add([]);
    const disposables = new DisposableStore();
    this._disposables.set(pid, disposables);
    const completions = [];
    const result = {
      x: pid,
      [extHostProtocol.ISuggestResultDtoField.completions]: completions,
      [extHostProtocol.ISuggestResultDtoField.defaultRanges]: { replace: typeConvert.Range.from(replaceRange), insert: typeConvert.Range.from(insertRange) },
      [extHostProtocol.ISuggestResultDtoField.isIncomplete]: list.isIncomplete || void 0,
      [extHostProtocol.ISuggestResultDtoField.duration]: sw.elapsed()
    };
    for (let i = 0; i < list.items.length; i++) {
      const item = list.items[i];
      const dto = this._convertCompletionItem(item, [pid, i], insertRange, replaceRange);
      completions.push(dto);
    }
    return result;
  }
  async resolveCompletionItem(id, token) {
    if (typeof this._provider.resolveCompletionItem !== "function") {
      return void 0;
    }
    const item = this._cache.get(...id);
    if (!item) {
      return void 0;
    }
    const dto1 = this._convertCompletionItem(item, id);
    const resolvedItem = await this._provider.resolveCompletionItem(item, token);
    if (!resolvedItem) {
      return void 0;
    }
    const dto2 = this._convertCompletionItem(resolvedItem, id);
    if (dto1[extHostProtocol.ISuggestDataDtoField.insertText] !== dto2[extHostProtocol.ISuggestDataDtoField.insertText] || dto1[extHostProtocol.ISuggestDataDtoField.insertTextRules] !== dto2[extHostProtocol.ISuggestDataDtoField.insertTextRules]) {
      this._apiDeprecation.report("CompletionItem.insertText", this._extension, "extension MAY NOT change 'insertText' of a CompletionItem during resolve");
    }
    if (dto1[extHostProtocol.ISuggestDataDtoField.commandIdent] !== dto2[extHostProtocol.ISuggestDataDtoField.commandIdent] || dto1[extHostProtocol.ISuggestDataDtoField.commandId] !== dto2[extHostProtocol.ISuggestDataDtoField.commandId] || !equals(dto1[extHostProtocol.ISuggestDataDtoField.commandArguments], dto2[extHostProtocol.ISuggestDataDtoField.commandArguments])) {
      this._apiDeprecation.report("CompletionItem.command", this._extension, "extension MAY NOT change 'command' of a CompletionItem during resolve");
    }
    return {
      ...dto1,
      [extHostProtocol.ISuggestDataDtoField.documentation]: dto2[extHostProtocol.ISuggestDataDtoField.documentation],
      [extHostProtocol.ISuggestDataDtoField.detail]: dto2[extHostProtocol.ISuggestDataDtoField.detail],
      [extHostProtocol.ISuggestDataDtoField.additionalTextEdits]: dto2[extHostProtocol.ISuggestDataDtoField.additionalTextEdits],
      // (fishy) async insertText
      [extHostProtocol.ISuggestDataDtoField.insertText]: dto2[extHostProtocol.ISuggestDataDtoField.insertText],
      [extHostProtocol.ISuggestDataDtoField.insertTextRules]: dto2[extHostProtocol.ISuggestDataDtoField.insertTextRules],
      // (fishy) async command
      [extHostProtocol.ISuggestDataDtoField.commandIdent]: dto2[extHostProtocol.ISuggestDataDtoField.commandIdent],
      [extHostProtocol.ISuggestDataDtoField.commandId]: dto2[extHostProtocol.ISuggestDataDtoField.commandId],
      [extHostProtocol.ISuggestDataDtoField.commandArguments]: dto2[extHostProtocol.ISuggestDataDtoField.commandArguments]
    };
  }
  releaseCompletionItems(id) {
    this._disposables.get(id)?.dispose();
    this._disposables.delete(id);
    this._cache.delete(id);
  }
  _convertCompletionItem(item, id, defaultInsertRange, defaultReplaceRange) {
    const disposables = this._disposables.get(id[0]);
    if (!disposables) {
      throw Error("DisposableStore is missing...");
    }
    const command = this._commands.toInternal(item.command, disposables);
    const result = {
      //
      x: id,
      //
      [extHostProtocol.ISuggestDataDtoField.label]: item.label,
      [extHostProtocol.ISuggestDataDtoField.kind]: item.kind !== void 0 ? typeConvert.CompletionItemKind.from(item.kind) : void 0,
      [extHostProtocol.ISuggestDataDtoField.kindModifier]: item.tags && item.tags.map(typeConvert.CompletionItemTag.from),
      [extHostProtocol.ISuggestDataDtoField.detail]: item.detail,
      [extHostProtocol.ISuggestDataDtoField.documentation]: typeof item.documentation === "undefined" ? void 0 : typeConvert.MarkdownString.fromStrict(item.documentation),
      [extHostProtocol.ISuggestDataDtoField.sortText]: item.sortText !== item.label ? item.sortText : void 0,
      [extHostProtocol.ISuggestDataDtoField.filterText]: item.filterText !== item.label ? item.filterText : void 0,
      [extHostProtocol.ISuggestDataDtoField.preselect]: item.preselect || void 0,
      [extHostProtocol.ISuggestDataDtoField.insertTextRules]: item.keepWhitespace ? languages.CompletionItemInsertTextRule.KeepWhitespace : languages.CompletionItemInsertTextRule.None,
      [extHostProtocol.ISuggestDataDtoField.commitCharacters]: item.commitCharacters?.join(""),
      [extHostProtocol.ISuggestDataDtoField.additionalTextEdits]: item.additionalTextEdits && item.additionalTextEdits.map(typeConvert.TextEdit.from),
      [extHostProtocol.ISuggestDataDtoField.commandIdent]: command?.$ident,
      [extHostProtocol.ISuggestDataDtoField.commandId]: command?.id,
      [extHostProtocol.ISuggestDataDtoField.commandArguments]: command?.$ident ? void 0 : command?.arguments
      // filled in on main side from $ident
    };
    if (item.textEdit) {
      this._apiDeprecation.report("CompletionItem.textEdit", this._extension, `Use 'CompletionItem.insertText' and 'CompletionItem.range' instead.`);
      result[extHostProtocol.ISuggestDataDtoField.insertText] = item.textEdit.newText;
    } else if (typeof item.insertText === "string") {
      result[extHostProtocol.ISuggestDataDtoField.insertText] = item.insertText;
    } else if (item.insertText instanceof SnippetString) {
      result[extHostProtocol.ISuggestDataDtoField.insertText] = item.insertText.value;
      result[extHostProtocol.ISuggestDataDtoField.insertTextRules] |= languages.CompletionItemInsertTextRule.InsertAsSnippet;
    }
    let range;
    if (item.textEdit) {
      range = item.textEdit.range;
    } else if (item.range) {
      range = item.range;
    }
    if (Range.isRange(range)) {
      result[extHostProtocol.ISuggestDataDtoField.range] = typeConvert.Range.from(range);
    } else if (range && (!defaultInsertRange?.isEqual(range.inserting) || !defaultReplaceRange?.isEqual(range.replacing))) {
      result[extHostProtocol.ISuggestDataDtoField.range] = {
        insert: typeConvert.Range.from(range.inserting),
        replace: typeConvert.Range.from(range.replacing)
      };
    }
    return result;
  }
}
class InlineCompletionAdapter {
  constructor(_extension, _documents, _provider, _commands) {
    this._extension = _extension;
    this._documents = _documents;
    this._provider = _provider;
    this._commands = _commands;
    this._references = new ReferenceMap();
    this.languageTriggerKindToVSCodeTriggerKind = {
      [languages.InlineCompletionTriggerKind.Automatic]: InlineCompletionTriggerKind.Automatic,
      [languages.InlineCompletionTriggerKind.Explicit]: InlineCompletionTriggerKind.Invoke
    };
    this._isAdditionsProposedApiEnabled = isProposedApiEnabled(this._extension, "inlineCompletionsAdditions");
  }
  get supportsHandleEvents() {
    return isProposedApiEnabled(this._extension, "inlineCompletionsAdditions") && (typeof this._provider.handleDidShowCompletionItem === "function" || typeof this._provider.handleDidPartiallyAcceptCompletionItem === "function" || typeof this._provider.handleDidRejectCompletionItem === "function" || typeof this._provider.handleEndOfLifetime === "function");
  }
  get supportsSetModelId() {
    return isProposedApiEnabled(this._extension, "inlineCompletionsAdditions") && typeof this._provider.setCurrentModelId === "function";
  }
  get supportsSetProviderOption() {
    return isProposedApiEnabled(this._extension, "inlineCompletionsAdditions") && typeof this._provider.setProviderOptionValue === "function";
  }
  get modelInfo() {
    if (!this._isAdditionsProposedApiEnabled) {
      return void 0;
    }
    return this._provider.modelInfo ? {
      models: this._provider.modelInfo.models,
      currentModelId: this._provider.modelInfo.currentModelId
    } : void 0;
  }
  setCurrentModelId(modelId) {
    if (!this._isAdditionsProposedApiEnabled) {
      return;
    }
    this._provider.setCurrentModelId?.(modelId);
  }
  get providerOptions() {
    if (!this._isAdditionsProposedApiEnabled) {
      return void 0;
    }
    return this._provider.providerOptions?.map((o) => ({
      id: o.id,
      label: o.label,
      values: o.values.map((v) => ({ id: v.id, label: v.label })),
      currentValueId: o.currentValueId
    }));
  }
  setProviderOption(optionId, valueId) {
    if (!this._isAdditionsProposedApiEnabled) {
      return;
    }
    this._provider.setProviderOptionValue?.(optionId, valueId);
  }
  async provideInlineCompletions(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const result = await this._provider.provideInlineCompletionItems(doc, pos, {
      selectedCompletionInfo: context.selectedSuggestionInfo ? {
        range: typeConvert.Range.to(context.selectedSuggestionInfo.range),
        text: context.selectedSuggestionInfo.text
      } : void 0,
      triggerKind: this.languageTriggerKindToVSCodeTriggerKind[context.triggerKind],
      requestUuid: context.requestUuid,
      requestIssuedDateTime: context.requestIssuedDateTime,
      earliestShownDateTime: context.earliestShownDateTime,
      changeHint: context.changeHint
    }, token);
    if (!result) {
      return void 0;
    }
    const { resultItems, list } = Array.isArray(result) ? { resultItems: result, list: void 0 } : { resultItems: result.items, list: result };
    const commands = this._isAdditionsProposedApiEnabled ? Array.isArray(result) ? [] : result.commands || [] : [];
    const enableForwardStability = this._isAdditionsProposedApiEnabled && !Array.isArray(result) ? result.enableForwardStability : void 0;
    let disposableStore = void 0;
    const pid = this._references.createReferenceId({
      dispose() {
        disposableStore?.dispose();
      },
      items: resultItems,
      list
    });
    const items = {
      pid,
      languageId: doc.languageId,
      items: resultItems.map((item, idx) => {
        let command = void 0;
        if (item.command) {
          if (!disposableStore) {
            disposableStore = new DisposableStore();
          }
          command = this._commands.toInternal(item.command, disposableStore);
        }
        let action = void 0;
        if (item.action) {
          if (!disposableStore) {
            disposableStore = new DisposableStore();
          }
          action = this._commands.toInternal(item.action, disposableStore);
        }
        const insertText = item.insertText;
        return {
          insertText: insertText === void 0 ? void 0 : typeof insertText === "string" ? insertText : { snippet: insertText.value },
          range: item.range ? typeConvert.Range.from(item.range) : void 0,
          showRange: this._isAdditionsProposedApiEnabled && item.showRange ? typeConvert.Range.from(item.showRange) : void 0,
          command,
          gutterMenuLinkAction: action,
          pid,
          idx,
          completeBracketPairs: this._isAdditionsProposedApiEnabled ? item.completeBracketPairs : false,
          isInlineEdit: this._isAdditionsProposedApiEnabled ? item.isInlineEdit : false,
          showInlineEditMenu: this._isAdditionsProposedApiEnabled ? item.showInlineEditMenu : false,
          hint: item.displayLocation && this._isAdditionsProposedApiEnabled ? {
            range: typeConvert.Range.from(item.displayLocation.range),
            content: item.displayLocation.label,
            style: item.displayLocation.kind ? typeConvert.InlineCompletionHintStyle.from(item.displayLocation.kind) : languages.InlineCompletionHintStyle.Code
          } : void 0,
          warning: item.warning && this._isAdditionsProposedApiEnabled ? {
            message: typeConvert.MarkdownString.from(item.warning.message),
            icon: item.warning.icon ? typeConvert.IconPath.fromThemeIcon(item.warning.icon) : void 0
          } : void 0,
          correlationId: this._isAdditionsProposedApiEnabled ? item.correlationId : void 0,
          suggestionId: void 0,
          uri: this._isAdditionsProposedApiEnabled && item.uri ? item.uri : void 0,
          supportsRename: this._isAdditionsProposedApiEnabled ? item.supportsRename : false,
          jumpToPosition: this._isAdditionsProposedApiEnabled && item.jumpToPosition ? typeConvert.Position.from(item.jumpToPosition) : void 0
        };
      }),
      commands: commands.map((c) => {
        if (!disposableStore) {
          disposableStore = new DisposableStore();
        }
        return typeConvert.CompletionCommand.from(c, this._commands, disposableStore);
      }),
      suppressSuggestions: false,
      enableForwardStability
    };
    return items;
  }
  disposeCompletions(pid, reason) {
    const completionList = this._references.get(pid);
    if (this._provider.handleListEndOfLifetime && this._isAdditionsProposedApiEnabled && completionList?.list) {
      let translateReason2 = function(reason2) {
        switch (reason2.kind) {
          case "lostRace":
            return { kind: InlineCompletionsDisposeReasonKind.LostRace };
          case "tokenCancellation":
            return { kind: InlineCompletionsDisposeReasonKind.TokenCancellation };
          case "other":
            return { kind: InlineCompletionsDisposeReasonKind.Other };
          case "empty":
            return { kind: InlineCompletionsDisposeReasonKind.Empty };
          case "notTaken":
            return { kind: InlineCompletionsDisposeReasonKind.NotTaken };
          default:
            return { kind: InlineCompletionsDisposeReasonKind.Other };
        }
      };
      var translateReason = translateReason2;
      this._provider.handleListEndOfLifetime(completionList.list, translateReason2(reason));
    }
    const data = this._references.disposeReferenceId(pid);
    data?.dispose();
  }
  handleDidShowCompletionItem(pid, idx, updatedInsertText) {
    const completionItem = this._references.get(pid)?.items[idx];
    if (completionItem) {
      if (this._provider.handleDidShowCompletionItem && this._isAdditionsProposedApiEnabled) {
        this._provider.handleDidShowCompletionItem(completionItem, updatedInsertText);
      }
    }
  }
  handlePartialAccept(pid, idx, acceptedCharacters, info) {
    const completionItem = this._references.get(pid)?.items[idx];
    if (completionItem) {
      if (this._provider.handleDidPartiallyAcceptCompletionItem && this._isAdditionsProposedApiEnabled) {
        this._provider.handleDidPartiallyAcceptCompletionItem(completionItem, acceptedCharacters);
        this._provider.handleDidPartiallyAcceptCompletionItem(completionItem, typeConvert.PartialAcceptInfo.to(info));
      }
    }
  }
  handleEndOfLifetime(pid, idx, reason) {
    const completionItem = this._references.get(pid)?.items[idx];
    if (completionItem) {
      if (this._provider.handleEndOfLifetime && this._isAdditionsProposedApiEnabled) {
        const r = typeConvert.InlineCompletionEndOfLifeReason.to(reason, (ref) => this._references.get(ref.pid)?.items[ref.idx]);
        this._provider.handleEndOfLifetime(completionItem, r);
      }
    }
  }
  handleRejection(pid, idx) {
    const completionItem = this._references.get(pid)?.items[idx];
    if (completionItem) {
      if (this._provider.handleDidRejectCompletionItem && this._isAdditionsProposedApiEnabled) {
        this._provider.handleDidRejectCompletionItem(completionItem);
      }
    }
  }
}
class ReferenceMap {
  constructor() {
    this._references = /* @__PURE__ */ new Map();
    this._idPool = 1;
  }
  createReferenceId(value) {
    const id = this._idPool++;
    this._references.set(id, value);
    return id;
  }
  disposeReferenceId(referenceId) {
    const value = this._references.get(referenceId);
    this._references.delete(referenceId);
    return value;
  }
  get(referenceId) {
    return this._references.get(referenceId);
  }
}
class SignatureHelpAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._cache = new Cache("SignatureHelp");
  }
  async provideSignatureHelp(resource, position, context, token) {
    const doc = this._documents.getDocument(resource);
    const pos = typeConvert.Position.to(position);
    const vscodeContext = this.reviveContext(context);
    const value = await this._provider.provideSignatureHelp(doc, pos, token, vscodeContext);
    if (value) {
      const id = this._cache.add([value]);
      return { ...typeConvert.SignatureHelp.from(value), id };
    }
    return void 0;
  }
  reviveContext(context) {
    let activeSignatureHelp = void 0;
    if (context.activeSignatureHelp) {
      const revivedSignatureHelp = typeConvert.SignatureHelp.to(context.activeSignatureHelp);
      const saved = this._cache.get(context.activeSignatureHelp.id, 0);
      if (saved) {
        activeSignatureHelp = saved;
        activeSignatureHelp.activeSignature = revivedSignatureHelp.activeSignature;
        activeSignatureHelp.activeParameter = revivedSignatureHelp.activeParameter;
      } else {
        activeSignatureHelp = revivedSignatureHelp;
      }
    }
    return { ...context, activeSignatureHelp };
  }
  releaseSignatureHelp(id) {
    this._cache.delete(id);
  }
}
class InlayHintsAdapter {
  constructor(_documents, _commands, _provider, _logService, _extension) {
    this._documents = _documents;
    this._commands = _commands;
    this._provider = _provider;
    this._logService = _logService;
    this._extension = _extension;
    this._cache = new Cache("InlayHints");
    this._disposables = /* @__PURE__ */ new Map();
  }
  async provideInlayHints(resource, ran, token) {
    const doc = this._documents.getDocument(resource);
    const range = typeConvert.Range.to(ran);
    const hints = await this._provider.provideInlayHints(doc, range, token);
    if (!Array.isArray(hints) || hints.length === 0) {
      this._logService.trace(`[InlayHints] NO inlay hints from '${this._extension.identifier.value}' for range ${JSON.stringify(ran)}`);
      return void 0;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    const pid = this._cache.add(hints);
    this._disposables.set(pid, new DisposableStore());
    const result = { hints: [], cacheId: pid };
    for (let i = 0; i < hints.length; i++) {
      if (this._isValidInlayHint(hints[i], range)) {
        result.hints.push(this._convertInlayHint(hints[i], [pid, i]));
      }
    }
    this._logService.trace(`[InlayHints] ${result.hints.length} inlay hints from '${this._extension.identifier.value}' for range ${JSON.stringify(ran)}`);
    return result;
  }
  async resolveInlayHint(id, token) {
    if (typeof this._provider.resolveInlayHint !== "function") {
      return void 0;
    }
    const item = this._cache.get(...id);
    if (!item) {
      return void 0;
    }
    const hint = await this._provider.resolveInlayHint(item, token);
    if (!hint) {
      return void 0;
    }
    if (!this._isValidInlayHint(hint)) {
      return void 0;
    }
    return this._convertInlayHint(hint, id);
  }
  releaseHints(id) {
    this._disposables.get(id)?.dispose();
    this._disposables.delete(id);
    this._cache.delete(id);
  }
  _isValidInlayHint(hint, range) {
    if (hint.label.length === 0 || Array.isArray(hint.label) && hint.label.every((part) => part.value.length === 0)) {
      console.log("INVALID inlay hint, empty label", hint);
      return false;
    }
    if (range && !range.contains(hint.position)) {
      return false;
    }
    return true;
  }
  _convertInlayHint(hint, id) {
    const disposables = this._disposables.get(id[0]);
    if (!disposables) {
      throw Error("DisposableStore is missing...");
    }
    const result = {
      label: "",
      // fill-in below
      cacheId: id,
      tooltip: typeConvert.MarkdownString.fromStrict(hint.tooltip),
      position: typeConvert.Position.from(hint.position),
      textEdits: hint.textEdits && hint.textEdits.map(typeConvert.TextEdit.from),
      kind: hint.kind && typeConvert.InlayHintKind.from(hint.kind),
      paddingLeft: hint.paddingLeft,
      paddingRight: hint.paddingRight
    };
    if (typeof hint.label === "string") {
      result.label = hint.label;
    } else {
      const parts = [];
      result.label = parts;
      for (const part of hint.label) {
        if (!part.value) {
          console.warn("INVALID inlay hint, empty label part", this._extension.identifier.value);
          continue;
        }
        const part2 = {
          label: part.value,
          tooltip: typeConvert.MarkdownString.fromStrict(part.tooltip)
        };
        if (Location.isLocation(part.location)) {
          part2.location = typeConvert.location.from(part.location);
        }
        if (part.command) {
          part2.command = this._commands.toInternal(part.command, disposables);
        }
        parts.push(part2);
      }
    }
    return result;
  }
}
class LinkProviderAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._cache = new Cache("DocumentLink");
  }
  async provideLinks(resource, token) {
    const doc = this._documents.getDocument(resource);
    const links = await this._provider.provideDocumentLinks(doc, token);
    if (!Array.isArray(links) || links.length === 0) {
      return void 0;
    }
    if (token.isCancellationRequested) {
      return void 0;
    }
    if (typeof this._provider.resolveDocumentLink !== "function") {
      return { links: links.filter(LinkProviderAdapter._validateLink).map(typeConvert.DocumentLink.from) };
    } else {
      const pid = this._cache.add(links);
      const result = { links: [], cacheId: pid };
      for (let i = 0; i < links.length; i++) {
        if (!LinkProviderAdapter._validateLink(links[i])) {
          continue;
        }
        const dto = typeConvert.DocumentLink.from(links[i]);
        dto.cacheId = [pid, i];
        result.links.push(dto);
      }
      return result;
    }
  }
  static _validateLink(link) {
    if (link.target && link.target.path.length > 5e4) {
      console.warn("DROPPING link because it is too long");
      return false;
    }
    return true;
  }
  async resolveLink(id, token) {
    if (typeof this._provider.resolveDocumentLink !== "function") {
      return void 0;
    }
    const item = this._cache.get(...id);
    if (!item) {
      return void 0;
    }
    const link = await this._provider.resolveDocumentLink(item, token);
    if (!link || !LinkProviderAdapter._validateLink(link)) {
      return void 0;
    }
    return typeConvert.DocumentLink.from(link);
  }
  releaseLinks(id) {
    this._cache.delete(id);
  }
}
class ColorProviderAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideColors(resource, token) {
    const doc = this._documents.getDocument(resource);
    const colors = await this._provider.provideDocumentColors(doc, token);
    if (!Array.isArray(colors)) {
      return [];
    }
    const colorInfos = colors.map((ci) => {
      return {
        color: typeConvert.Color.from(ci.color),
        range: typeConvert.Range.from(ci.range)
      };
    });
    return colorInfos;
  }
  async provideColorPresentations(resource, raw, token) {
    const document = this._documents.getDocument(resource);
    const range = typeConvert.Range.to(raw.range);
    const color = typeConvert.Color.to(raw.color);
    const value = await this._provider.provideColorPresentations(color, { document, range }, token);
    if (!Array.isArray(value)) {
      return void 0;
    }
    return value.map(typeConvert.ColorPresentation.from);
  }
}
class FoldingProviderAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
  }
  async provideFoldingRanges(resource, context, token) {
    const doc = this._documents.getDocument(resource);
    const ranges = await this._provider.provideFoldingRanges(doc, context, token);
    if (!Array.isArray(ranges)) {
      return void 0;
    }
    return ranges.map(typeConvert.FoldingRange.from);
  }
}
class SelectionRangeAdapter {
  constructor(_documents, _provider, _logService) {
    this._documents = _documents;
    this._provider = _provider;
    this._logService = _logService;
  }
  async provideSelectionRanges(resource, pos, token) {
    const document = this._documents.getDocument(resource);
    const positions = pos.map(typeConvert.Position.to);
    const allProviderRanges = await this._provider.provideSelectionRanges(document, positions, token);
    if (!isNonEmptyArray(allProviderRanges)) {
      return [];
    }
    if (allProviderRanges.length !== positions.length) {
      this._logService.warn("BAD selection ranges, provider must return ranges for each position");
      return [];
    }
    const allResults = [];
    for (let i = 0; i < positions.length; i++) {
      const oneResult = [];
      allResults.push(oneResult);
      let last = positions[i];
      let selectionRange = allProviderRanges[i];
      while (true) {
        if (!selectionRange.range.contains(last)) {
          throw new Error("INVALID selection range, must contain the previous range");
        }
        oneResult.push(typeConvert.SelectionRange.from(selectionRange));
        if (!selectionRange.parent) {
          break;
        }
        last = selectionRange.range;
        selectionRange = selectionRange.parent;
      }
    }
    return allResults;
  }
}
class CallHierarchyAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._idPool = new IdGenerator("");
    this._cache = /* @__PURE__ */ new Map();
  }
  async prepareSession(uri, position, token) {
    const doc = this._documents.getDocument(uri);
    const pos = typeConvert.Position.to(position);
    const items = await this._provider.prepareCallHierarchy(doc, pos, token);
    if (!items) {
      return void 0;
    }
    const sessionId = this._idPool.nextId();
    this._cache.set(sessionId, /* @__PURE__ */ new Map());
    if (Array.isArray(items)) {
      return items.map((item) => this._cacheAndConvertItem(sessionId, item));
    } else {
      return [this._cacheAndConvertItem(sessionId, items)];
    }
  }
  async provideCallsTo(sessionId, itemId, token) {
    const item = this._itemFromCache(sessionId, itemId);
    if (!item) {
      throw new Error("missing call hierarchy item");
    }
    const calls = await this._provider.provideCallHierarchyIncomingCalls(item, token);
    if (!calls) {
      return void 0;
    }
    return calls.map((call) => {
      return {
        from: this._cacheAndConvertItem(sessionId, call.from),
        fromRanges: call.fromRanges.map((r) => typeConvert.Range.from(r))
      };
    });
  }
  async provideCallsFrom(sessionId, itemId, token) {
    const item = this._itemFromCache(sessionId, itemId);
    if (!item) {
      throw new Error("missing call hierarchy item");
    }
    const calls = await this._provider.provideCallHierarchyOutgoingCalls(item, token);
    if (!calls) {
      return void 0;
    }
    return calls.map((call) => {
      return {
        to: this._cacheAndConvertItem(sessionId, call.to),
        fromRanges: call.fromRanges.map((r) => typeConvert.Range.from(r))
      };
    });
  }
  releaseSession(sessionId) {
    this._cache.delete(sessionId);
  }
  _cacheAndConvertItem(sessionId, item) {
    const map = this._cache.get(sessionId);
    const dto = typeConvert.CallHierarchyItem.from(item, sessionId, map.size.toString(36));
    map.set(dto._itemId, item);
    return dto;
  }
  _itemFromCache(sessionId, itemId) {
    const map = this._cache.get(sessionId);
    return map?.get(itemId);
  }
}
class TypeHierarchyAdapter {
  constructor(_documents, _provider) {
    this._documents = _documents;
    this._provider = _provider;
    this._idPool = new IdGenerator("");
    this._cache = /* @__PURE__ */ new Map();
  }
  async prepareSession(uri, position, token) {
    const doc = this._documents.getDocument(uri);
    const pos = typeConvert.Position.to(position);
    const items = await this._provider.prepareTypeHierarchy(doc, pos, token);
    if (!items) {
      return void 0;
    }
    const sessionId = this._idPool.nextId();
    this._cache.set(sessionId, /* @__PURE__ */ new Map());
    if (Array.isArray(items)) {
      return items.map((item) => this._cacheAndConvertItem(sessionId, item));
    } else {
      return [this._cacheAndConvertItem(sessionId, items)];
    }
  }
  async provideSupertypes(sessionId, itemId, token) {
    const item = this._itemFromCache(sessionId, itemId);
    if (!item) {
      throw new Error("missing type hierarchy item");
    }
    const supertypes = await this._provider.provideTypeHierarchySupertypes(item, token);
    if (!supertypes) {
      return void 0;
    }
    return supertypes.map((supertype) => {
      return this._cacheAndConvertItem(sessionId, supertype);
    });
  }
  async provideSubtypes(sessionId, itemId, token) {
    const item = this._itemFromCache(sessionId, itemId);
    if (!item) {
      throw new Error("missing type hierarchy item");
    }
    const subtypes = await this._provider.provideTypeHierarchySubtypes(item, token);
    if (!subtypes) {
      return void 0;
    }
    return subtypes.map((subtype) => {
      return this._cacheAndConvertItem(sessionId, subtype);
    });
  }
  releaseSession(sessionId) {
    this._cache.delete(sessionId);
  }
  _cacheAndConvertItem(sessionId, item) {
    const map = this._cache.get(sessionId);
    const dto = typeConvert.TypeHierarchyItem.from(item, sessionId, map.size.toString(36));
    map.set(dto._itemId, item);
    return dto;
  }
  _itemFromCache(sessionId, itemId) {
    const map = this._cache.get(sessionId);
    return map?.get(itemId);
  }
}
class DocumentDropEditAdapter {
  constructor(_proxy, _documents, _provider, _handle, _extension) {
    this._proxy = _proxy;
    this._documents = _documents;
    this._provider = _provider;
    this._handle = _handle;
    this._extension = _extension;
    this._cache = new Cache("DocumentDropEdit");
  }
  async provideDocumentOnDropEdits(requestId, uri, position, dataTransferDto, token) {
    const doc = this._documents.getDocument(uri);
    const pos = typeConvert.Position.to(position);
    const dataTransfer = typeConvert.DataTransfer.toDataTransfer(dataTransferDto, async (id) => {
      return (await this._proxy.$resolveDocumentOnDropFileData(this._handle, requestId, id)).buffer;
    });
    const edits = await this._provider.provideDocumentDropEdits(doc, pos, dataTransfer, token);
    if (!edits) {
      return void 0;
    }
    const editsArray = asArray(edits);
    const cacheId = this._cache.add(editsArray);
    return editsArray.map((edit, i) => ({
      _cacheId: [cacheId, i],
      title: edit.title ?? localize("defaultDropLabel", "Drop using '{0}' extension", this._extension.displayName || this._extension.name),
      kind: edit.kind?.value,
      yieldTo: edit.yieldTo?.map((x) => x.value),
      insertText: typeof edit.insertText === "string" ? edit.insertText : { snippet: edit.insertText.value },
      additionalEdit: edit.additionalEdit ? typeConvert.WorkspaceEdit.from(edit.additionalEdit, void 0) : void 0
    }));
  }
  async resolveDropEdit(id, token) {
    const [sessionId, itemId] = id;
    const item = this._cache.get(sessionId, itemId);
    if (!item || !this._provider.resolveDocumentDropEdit) {
      return {};
    }
    const resolvedItem = await this._provider.resolveDocumentDropEdit(item, token) ?? item;
    const additionalEdit = resolvedItem.additionalEdit ? typeConvert.WorkspaceEdit.from(resolvedItem.additionalEdit, void 0) : void 0;
    return { additionalEdit };
  }
  releaseDropEdits(id) {
    this._cache.delete(id);
  }
}
class AdapterData {
  constructor(adapter, extension) {
    this.adapter = adapter;
    this.extension = extension;
  }
}
const _ExtHostLanguageFeatures = class _ExtHostLanguageFeatures extends CoreDisposable {
  constructor(mainContext, _uriTransformer, _documents, _commands, _diagnostics, _logService, _apiDeprecation, _extensionTelemetry) {
    super();
    this._uriTransformer = _uriTransformer;
    this._documents = _documents;
    this._commands = _commands;
    this._diagnostics = _diagnostics;
    this._logService = _logService;
    this._apiDeprecation = _apiDeprecation;
    this._extensionTelemetry = _extensionTelemetry;
    this._adapter = /* @__PURE__ */ new Map();
    this._onDidChangeInlineCompletionsUnificationState = this._register(new Emitter());
    this.onDidChangeInlineCompletionsUnificationState = this._onDidChangeInlineCompletionsUnificationState.event;
    this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadLanguageFeatures);
    this._inlineCompletionsUnificationState = {
      codeUnification: false,
      modelUnification: false,
      extensionUnification: false,
      expAssignments: []
    };
  }
  get inlineCompletionsUnificationState() {
    return this._inlineCompletionsUnificationState;
  }
  _transformDocumentSelector(selector, extension) {
    return typeConvert.DocumentSelector.from(selector, this._uriTransformer, extension);
  }
  _createDisposable(handle) {
    return new Disposable(() => {
      this._adapter.delete(handle);
      this._proxy.$unregister(handle);
    });
  }
  _nextHandle() {
    return _ExtHostLanguageFeatures._handlePool++;
  }
  async _withAdapter(handle, ctor, callback, fallbackValue, tokenToRaceAgainst, doNotLog = false) {
    const data = this._adapter.get(handle);
    if (!data || !(data.adapter instanceof ctor)) {
      return fallbackValue;
    }
    const t1 = Date.now();
    if (!doNotLog) {
      this._logService.trace(`[${data.extension.identifier.value}] INVOKE provider '${callback.toString().replace(/[\r\n]/g, "")}'`);
    }
    const result = callback(data.adapter, data.extension);
    Promise.resolve(result).catch((err) => {
      if (!isCancellationError(err)) {
        this._logService.error(`[${data.extension.identifier.value}] provider FAILED`);
        this._logService.error(err);
        this._extensionTelemetry.onExtensionError(data.extension.identifier, err);
      }
    }).finally(() => {
      if (!doNotLog) {
        this._logService.trace(`[${data.extension.identifier.value}] provider DONE after ${Date.now() - t1}ms`);
      }
    });
    if (CancellationToken.isCancellationToken(tokenToRaceAgainst)) {
      return raceCancellationError(result, tokenToRaceAgainst);
    }
    return result;
  }
  _addNewAdapter(adapter, extension) {
    const handle = this._nextHandle();
    this._adapter.set(handle, new AdapterData(adapter, extension));
    return handle;
  }
  static _extLabel(ext) {
    return ext.displayName || ext.name;
  }
  static _extId(ext) {
    return ext.identifier.value;
  }
  // --- outline
  registerDocumentSymbolProvider(extension, selector, provider, metadata) {
    const handle = this._addNewAdapter(new DocumentSymbolAdapter(this._documents, provider), extension);
    const displayName = metadata && metadata.label || _ExtHostLanguageFeatures._extLabel(extension);
    this._proxy.$registerDocumentSymbolProvider(handle, this._transformDocumentSelector(selector, extension), displayName);
    return this._createDisposable(handle);
  }
  $provideDocumentSymbols(handle, resource, token) {
    return this._withAdapter(handle, DocumentSymbolAdapter, (adapter) => adapter.provideDocumentSymbols(URI.revive(resource), token), void 0, token);
  }
  // --- code lens
  registerCodeLensProvider(extension, selector, provider) {
    const handle = this._nextHandle();
    const eventHandle = typeof provider.onDidChangeCodeLenses === "function" ? this._nextHandle() : void 0;
    this._adapter.set(handle, new AdapterData(new CodeLensAdapter(this._documents, this._commands.converter, provider, extension, this._extensionTelemetry, this._logService), extension));
    this._proxy.$registerCodeLensSupport(handle, this._transformDocumentSelector(selector, extension), eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle !== void 0) {
      const subscription = provider.onDidChangeCodeLenses((_) => this._proxy.$emitCodeLensEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideCodeLenses(handle, resource, token) {
    return this._withAdapter(handle, CodeLensAdapter, (adapter) => adapter.provideCodeLenses(URI.revive(resource), token), void 0, token, resource.scheme === "output");
  }
  $resolveCodeLens(handle, symbol, token) {
    return this._withAdapter(handle, CodeLensAdapter, (adapter) => adapter.resolveCodeLens(symbol, token), void 0, void 0, true);
  }
  $releaseCodeLenses(handle, cacheId) {
    this._withAdapter(handle, CodeLensAdapter, (adapter) => Promise.resolve(adapter.releaseCodeLenses(cacheId)), void 0, void 0, true);
  }
  // --- declaration
  registerDefinitionProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new DefinitionAdapter(this._documents, provider), extension);
    this._proxy.$registerDefinitionSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideDefinition(handle, resource, position, token) {
    return this._withAdapter(handle, DefinitionAdapter, (adapter) => adapter.provideDefinition(URI.revive(resource), position, token), [], token);
  }
  registerDeclarationProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new DeclarationAdapter(this._documents, provider), extension);
    this._proxy.$registerDeclarationSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideDeclaration(handle, resource, position, token) {
    return this._withAdapter(handle, DeclarationAdapter, (adapter) => adapter.provideDeclaration(URI.revive(resource), position, token), [], token);
  }
  registerImplementationProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new ImplementationAdapter(this._documents, provider), extension);
    this._proxy.$registerImplementationSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideImplementation(handle, resource, position, token) {
    return this._withAdapter(handle, ImplementationAdapter, (adapter) => adapter.provideImplementation(URI.revive(resource), position, token), [], token);
  }
  registerTypeDefinitionProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new TypeDefinitionAdapter(this._documents, provider), extension);
    this._proxy.$registerTypeDefinitionSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideTypeDefinition(handle, resource, position, token) {
    return this._withAdapter(handle, TypeDefinitionAdapter, (adapter) => adapter.provideTypeDefinition(URI.revive(resource), position, token), [], token);
  }
  // --- extra info
  registerHoverProvider(extension, selector, provider, extensionId) {
    const handle = this._addNewAdapter(new HoverAdapter(this._documents, provider), extension);
    this._proxy.$registerHoverProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideHover(handle, resource, position, context, token) {
    return this._withAdapter(handle, HoverAdapter, (adapter) => adapter.provideHover(URI.revive(resource), position, context, token), void 0, token);
  }
  $releaseHover(handle, id) {
    this._withAdapter(handle, HoverAdapter, (adapter) => Promise.resolve(adapter.releaseHover(id)), void 0, void 0);
  }
  // --- debug hover
  registerEvaluatableExpressionProvider(extension, selector, provider, extensionId) {
    const handle = this._addNewAdapter(new EvaluatableExpressionAdapter(this._documents, provider), extension);
    this._proxy.$registerEvaluatableExpressionProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideEvaluatableExpression(handle, resource, position, token) {
    return this._withAdapter(handle, EvaluatableExpressionAdapter, (adapter) => adapter.provideEvaluatableExpression(URI.revive(resource), position, token), void 0, token);
  }
  // --- debug inline values
  registerInlineValuesProvider(extension, selector, provider, extensionId) {
    const eventHandle = typeof provider.onDidChangeInlineValues === "function" ? this._nextHandle() : void 0;
    const handle = this._addNewAdapter(new InlineValuesAdapter(this._documents, provider), extension);
    this._proxy.$registerInlineValuesProvider(handle, this._transformDocumentSelector(selector, extension), eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle !== void 0) {
      const subscription = provider.onDidChangeInlineValues((_) => this._proxy.$emitInlineValuesEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideInlineValues(handle, resource, range, context, token) {
    return this._withAdapter(handle, InlineValuesAdapter, (adapter) => adapter.provideInlineValues(URI.revive(resource), range, context, token), void 0, token);
  }
  // --- occurrences
  registerDocumentHighlightProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new DocumentHighlightAdapter(this._documents, provider), extension);
    this._proxy.$registerDocumentHighlightProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  registerMultiDocumentHighlightProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new MultiDocumentHighlightAdapter(this._documents, provider, this._logService), extension);
    this._proxy.$registerMultiDocumentHighlightProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideDocumentHighlights(handle, resource, position, token) {
    return this._withAdapter(handle, DocumentHighlightAdapter, (adapter) => adapter.provideDocumentHighlights(URI.revive(resource), position, token), void 0, token);
  }
  $provideMultiDocumentHighlights(handle, resource, position, otherModels, token) {
    return this._withAdapter(handle, MultiDocumentHighlightAdapter, (adapter) => adapter.provideMultiDocumentHighlights(URI.revive(resource), position, otherModels.map((model) => URI.revive(model)), token), void 0, token);
  }
  // --- linked editing
  registerLinkedEditingRangeProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new LinkedEditingRangeAdapter(this._documents, provider), extension);
    this._proxy.$registerLinkedEditingRangeProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideLinkedEditingRanges(handle, resource, position, token) {
    return this._withAdapter(handle, LinkedEditingRangeAdapter, async (adapter) => {
      const res = await adapter.provideLinkedEditingRanges(URI.revive(resource), position, token);
      if (res) {
        return {
          ranges: res.ranges,
          wordPattern: res.wordPattern ? _ExtHostLanguageFeatures._serializeRegExp(res.wordPattern) : void 0
        };
      }
      return void 0;
    }, void 0, token);
  }
  // --- references
  registerReferenceProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new ReferenceAdapter(this._documents, provider), extension);
    this._proxy.$registerReferenceSupport(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideReferences(handle, resource, position, context, token) {
    return this._withAdapter(handle, ReferenceAdapter, (adapter) => adapter.provideReferences(URI.revive(resource), position, context, token), void 0, token);
  }
  // --- code actions
  registerCodeActionProvider(extension, selector, provider, metadata) {
    const store = new DisposableStore();
    const handle = this._addNewAdapter(new CodeActionAdapter(this._documents, this._commands.converter, this._diagnostics, provider, this._logService, extension, this._apiDeprecation), extension);
    this._proxy.$registerCodeActionSupport(handle, this._transformDocumentSelector(selector, extension), {
      providedKinds: metadata?.providedCodeActionKinds?.map((kind) => kind.value),
      documentation: metadata?.documentation?.map((x) => ({
        kind: x.kind.value,
        command: this._commands.converter.toInternal(x.command, store)
      }))
    }, _ExtHostLanguageFeatures._extLabel(extension), _ExtHostLanguageFeatures._extId(extension), Boolean(provider.resolveCodeAction));
    store.add(this._createDisposable(handle));
    return store;
  }
  $provideCodeActions(handle, resource, rangeOrSelection, context, token) {
    return this._withAdapter(handle, CodeActionAdapter, (adapter) => adapter.provideCodeActions(URI.revive(resource), rangeOrSelection, context, token), void 0, token);
  }
  $resolveCodeAction(handle, id, token) {
    return this._withAdapter(handle, CodeActionAdapter, (adapter) => adapter.resolveCodeAction(id, token), {}, void 0);
  }
  $releaseCodeActions(handle, cacheId) {
    this._withAdapter(handle, CodeActionAdapter, (adapter) => Promise.resolve(adapter.releaseCodeActions(cacheId)), void 0, void 0);
  }
  // --- formatting
  registerDocumentFormattingEditProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new DocumentFormattingAdapter(this._documents, provider), extension);
    this._proxy.$registerDocumentFormattingSupport(handle, this._transformDocumentSelector(selector, extension), extension.identifier, extension.displayName || extension.name);
    return this._createDisposable(handle);
  }
  $provideDocumentFormattingEdits(handle, resource, options, token) {
    return this._withAdapter(handle, DocumentFormattingAdapter, (adapter) => adapter.provideDocumentFormattingEdits(URI.revive(resource), options, token), void 0, token);
  }
  registerDocumentRangeFormattingEditProvider(extension, selector, provider) {
    const canFormatMultipleRanges = typeof provider.provideDocumentRangesFormattingEdits === "function";
    const handle = this._addNewAdapter(new RangeFormattingAdapter(this._documents, provider), extension);
    this._proxy.$registerRangeFormattingSupport(handle, this._transformDocumentSelector(selector, extension), extension.identifier, extension.displayName || extension.name, canFormatMultipleRanges);
    return this._createDisposable(handle);
  }
  $provideDocumentRangeFormattingEdits(handle, resource, range, options, token) {
    return this._withAdapter(handle, RangeFormattingAdapter, (adapter) => adapter.provideDocumentRangeFormattingEdits(URI.revive(resource), range, options, token), void 0, token);
  }
  $provideDocumentRangesFormattingEdits(handle, resource, ranges, options, token) {
    return this._withAdapter(handle, RangeFormattingAdapter, (adapter) => adapter.provideDocumentRangesFormattingEdits(URI.revive(resource), ranges, options, token), void 0, token);
  }
  registerOnTypeFormattingEditProvider(extension, selector, provider, triggerCharacters) {
    const handle = this._addNewAdapter(new OnTypeFormattingAdapter(this._documents, provider), extension);
    this._proxy.$registerOnTypeFormattingSupport(handle, this._transformDocumentSelector(selector, extension), triggerCharacters, extension.identifier);
    return this._createDisposable(handle);
  }
  $provideOnTypeFormattingEdits(handle, resource, position, ch, options, token) {
    return this._withAdapter(handle, OnTypeFormattingAdapter, (adapter) => adapter.provideOnTypeFormattingEdits(URI.revive(resource), position, ch, options, token), void 0, token);
  }
  // --- navigate types
  registerWorkspaceSymbolProvider(extension, provider) {
    const handle = this._addNewAdapter(new NavigateTypeAdapter(provider, this._logService), extension);
    this._proxy.$registerNavigateTypeSupport(handle, typeof provider.resolveWorkspaceSymbol === "function");
    return this._createDisposable(handle);
  }
  $provideWorkspaceSymbols(handle, search, token) {
    return this._withAdapter(handle, NavigateTypeAdapter, (adapter) => adapter.provideWorkspaceSymbols(search, token), { symbols: [] }, token);
  }
  $resolveWorkspaceSymbol(handle, symbol, token) {
    return this._withAdapter(handle, NavigateTypeAdapter, (adapter) => adapter.resolveWorkspaceSymbol(symbol, token), void 0, void 0);
  }
  $releaseWorkspaceSymbols(handle, id) {
    this._withAdapter(handle, NavigateTypeAdapter, (adapter) => adapter.releaseWorkspaceSymbols(id), void 0, void 0);
  }
  // --- rename
  registerRenameProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new RenameAdapter(this._documents, provider, this._logService), extension);
    this._proxy.$registerRenameSupport(handle, this._transformDocumentSelector(selector, extension), RenameAdapter.supportsResolving(provider));
    return this._createDisposable(handle);
  }
  $provideRenameEdits(handle, resource, position, newName, token) {
    return this._withAdapter(handle, RenameAdapter, (adapter) => adapter.provideRenameEdits(URI.revive(resource), position, newName, token), void 0, token);
  }
  $resolveRenameLocation(handle, resource, position, token) {
    return this._withAdapter(handle, RenameAdapter, (adapter) => adapter.resolveRenameLocation(URI.revive(resource), position, token), void 0, token);
  }
  registerNewSymbolNamesProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new NewSymbolNamesAdapter(this._documents, provider, this._logService), extension);
    this._proxy.$registerNewSymbolNamesProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $supportsAutomaticNewSymbolNamesTriggerKind(handle) {
    return this._withAdapter(
      handle,
      NewSymbolNamesAdapter,
      (adapter) => adapter.supportsAutomaticNewSymbolNamesTriggerKind(),
      false,
      void 0
    );
  }
  $provideNewSymbolNames(handle, resource, range, triggerKind, token) {
    return this._withAdapter(handle, NewSymbolNamesAdapter, (adapter) => adapter.provideNewSymbolNames(URI.revive(resource), range, triggerKind, token), void 0, token);
  }
  //#region semantic coloring
  registerDocumentSemanticTokensProvider(extension, selector, provider, legend) {
    const handle = this._addNewAdapter(new DocumentSemanticTokensAdapter(this._documents, provider), extension);
    const eventHandle = typeof provider.onDidChangeSemanticTokens === "function" ? this._nextHandle() : void 0;
    this._proxy.$registerDocumentSemanticTokensProvider(handle, this._transformDocumentSelector(selector, extension), legend, eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle) {
      const subscription = provider.onDidChangeSemanticTokens((_) => this._proxy.$emitDocumentSemanticTokensEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideDocumentSemanticTokens(handle, resource, previousResultId, token) {
    return this._withAdapter(handle, DocumentSemanticTokensAdapter, (adapter) => adapter.provideDocumentSemanticTokens(URI.revive(resource), previousResultId, token), null, token);
  }
  $releaseDocumentSemanticTokens(handle, semanticColoringResultId) {
    this._withAdapter(handle, DocumentSemanticTokensAdapter, (adapter) => adapter.releaseDocumentSemanticColoring(semanticColoringResultId), void 0, void 0);
  }
  registerDocumentRangeSemanticTokensProvider(extension, selector, provider, legend) {
    const handle = this._addNewAdapter(new DocumentRangeSemanticTokensAdapter(this._documents, provider), extension);
    const eventHandle = typeof provider.onDidChangeSemanticTokens === "function" ? this._nextHandle() : void 0;
    this._proxy.$registerDocumentRangeSemanticTokensProvider(handle, this._transformDocumentSelector(selector, extension), legend, eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle) {
      const subscription = provider.onDidChangeSemanticTokens((_) => this._proxy.$emitDocumentRangeSemanticTokensEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideDocumentRangeSemanticTokens(handle, resource, range, token) {
    return this._withAdapter(handle, DocumentRangeSemanticTokensAdapter, (adapter) => adapter.provideDocumentRangeSemanticTokens(URI.revive(resource), range, token), null, token);
  }
  //#endregion
  // --- suggestion
  registerCompletionItemProvider(extension, selector, provider, triggerCharacters) {
    const handle = this._addNewAdapter(new CompletionsAdapter(this._documents, this._commands.converter, provider, this._apiDeprecation, extension), extension);
    this._proxy.$registerCompletionsProvider(handle, this._transformDocumentSelector(selector, extension), triggerCharacters, CompletionsAdapter.supportsResolving(provider), extension.identifier);
    return this._createDisposable(handle);
  }
  $provideCompletionItems(handle, resource, position, context, token) {
    return this._withAdapter(handle, CompletionsAdapter, (adapter) => adapter.provideCompletionItems(URI.revive(resource), position, context, token), void 0, token);
  }
  $resolveCompletionItem(handle, id, token) {
    return this._withAdapter(handle, CompletionsAdapter, (adapter) => adapter.resolveCompletionItem(id, token), void 0, token);
  }
  $releaseCompletionItems(handle, id) {
    this._withAdapter(handle, CompletionsAdapter, (adapter) => adapter.releaseCompletionItems(id), void 0, void 0);
  }
  // --- ghost text
  registerInlineCompletionsProvider(extension, selector, provider, metadata) {
    const adapter = new InlineCompletionAdapter(extension, this._documents, provider, this._commands.converter);
    const handle = this._addNewAdapter(adapter, extension);
    let result = this._createDisposable(handle);
    const supportsOnDidChange = isProposedApiEnabled(extension, "inlineCompletionsAdditions") && typeof provider.onDidChange === "function";
    if (supportsOnDidChange) {
      const subscription = provider.onDidChange((e) => this._proxy.$emitInlineCompletionsChange(handle, e ? { data: e.data } : void 0));
      result = Disposable.from(result, subscription);
    }
    const supportsOnDidChangeModelInfo = isProposedApiEnabled(extension, "inlineCompletionsAdditions") && typeof provider.onDidChangeModelInfo === "function";
    if (supportsOnDidChangeModelInfo) {
      const subscription = provider.onDidChangeModelInfo((_) => this._proxy.$emitInlineCompletionModelInfoChange(handle, adapter.modelInfo));
      result = Disposable.from(result, subscription);
    }
    const supportsOnDidChangeProviderOptions = isProposedApiEnabled(extension, "inlineCompletionsAdditions") && typeof provider.onDidChangeProviderOptions === "function";
    if (supportsOnDidChangeProviderOptions) {
      const subscription = provider.onDidChangeProviderOptions((_) => this._proxy.$emitInlineCompletionProviderOptionsChange(handle, adapter.providerOptions));
      result = Disposable.from(result, subscription);
    }
    this._proxy.$registerInlineCompletionsSupport(
      handle,
      this._transformDocumentSelector(selector, extension),
      adapter.supportsHandleEvents,
      ExtensionIdentifier.toKey(extension.identifier.value),
      extension.version,
      metadata?.groupId ? ExtensionIdentifier.toKey(metadata.groupId) : void 0,
      metadata?.yieldTo?.map((extId) => ExtensionIdentifier.toKey(extId)) || [],
      metadata?.displayName,
      metadata?.debounceDelayMs,
      metadata?.excludes?.map((extId) => ExtensionIdentifier.toKey(extId)) || [],
      supportsOnDidChange,
      adapter.supportsSetModelId,
      adapter.modelInfo,
      supportsOnDidChangeModelInfo,
      adapter.supportsSetProviderOption,
      adapter.providerOptions,
      supportsOnDidChangeProviderOptions
    );
    return result;
  }
  $provideInlineCompletions(handle, resource, position, context, token) {
    return this._withAdapter(handle, InlineCompletionAdapter, (adapter) => adapter.provideInlineCompletions(URI.revive(resource), position, context, token), void 0, void 0);
  }
  $handleInlineCompletionDidShow(handle, pid, idx, updatedInsertText) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.handleDidShowCompletionItem(pid, idx, updatedInsertText);
    }, void 0, void 0);
  }
  $handleInlineCompletionPartialAccept(handle, pid, idx, acceptedCharacters, info) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.handlePartialAccept(pid, idx, acceptedCharacters, info);
    }, void 0, void 0);
  }
  $handleInlineCompletionEndOfLifetime(handle, pid, idx, reason) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.handleEndOfLifetime(pid, idx, reason);
    }, void 0, void 0);
  }
  $handleInlineCompletionRejection(handle, pid, idx) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.handleRejection(pid, idx);
    }, void 0, void 0);
  }
  $freeInlineCompletionsList(handle, pid, reason) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.disposeCompletions(pid, reason);
    }, void 0, void 0);
  }
  $acceptInlineCompletionsUnificationState(state) {
    this._inlineCompletionsUnificationState = state;
    this._onDidChangeInlineCompletionsUnificationState.fire();
  }
  $handleInlineCompletionSetCurrentModelId(handle, modelId) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.setCurrentModelId(modelId);
    }, void 0, void 0);
  }
  $handleInlineCompletionSetProviderOption(handle, optionId, valueId) {
    this._withAdapter(handle, InlineCompletionAdapter, async (adapter) => {
      adapter.setProviderOption(optionId, valueId);
    }, void 0, void 0);
  }
  // --- parameter hints
  registerSignatureHelpProvider(extension, selector, provider, metadataOrTriggerChars) {
    const metadata = Array.isArray(metadataOrTriggerChars) ? { triggerCharacters: metadataOrTriggerChars, retriggerCharacters: [] } : metadataOrTriggerChars;
    const handle = this._addNewAdapter(new SignatureHelpAdapter(this._documents, provider), extension);
    this._proxy.$registerSignatureHelpProvider(handle, this._transformDocumentSelector(selector, extension), metadata);
    return this._createDisposable(handle);
  }
  $provideSignatureHelp(handle, resource, position, context, token) {
    return this._withAdapter(handle, SignatureHelpAdapter, (adapter) => adapter.provideSignatureHelp(URI.revive(resource), position, context, token), void 0, token);
  }
  $releaseSignatureHelp(handle, id) {
    this._withAdapter(handle, SignatureHelpAdapter, (adapter) => adapter.releaseSignatureHelp(id), void 0, void 0);
  }
  // --- inline hints
  registerInlayHintsProvider(extension, selector, provider) {
    const eventHandle = typeof provider.onDidChangeInlayHints === "function" ? this._nextHandle() : void 0;
    const handle = this._addNewAdapter(new InlayHintsAdapter(this._documents, this._commands.converter, provider, this._logService, extension), extension);
    this._proxy.$registerInlayHintsProvider(handle, this._transformDocumentSelector(selector, extension), typeof provider.resolveInlayHint === "function", eventHandle, _ExtHostLanguageFeatures._extLabel(extension));
    let result = this._createDisposable(handle);
    if (eventHandle !== void 0) {
      const subscription = provider.onDidChangeInlayHints((uri) => this._proxy.$emitInlayHintsEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideInlayHints(handle, resource, range, token) {
    return this._withAdapter(handle, InlayHintsAdapter, (adapter) => adapter.provideInlayHints(URI.revive(resource), range, token), void 0, token);
  }
  $resolveInlayHint(handle, id, token) {
    return this._withAdapter(handle, InlayHintsAdapter, (adapter) => adapter.resolveInlayHint(id, token), void 0, token);
  }
  $releaseInlayHints(handle, id) {
    this._withAdapter(handle, InlayHintsAdapter, (adapter) => adapter.releaseHints(id), void 0, void 0);
  }
  // --- links
  registerDocumentLinkProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new LinkProviderAdapter(this._documents, provider), extension);
    this._proxy.$registerDocumentLinkProvider(handle, this._transformDocumentSelector(selector, extension), typeof provider.resolveDocumentLink === "function");
    return this._createDisposable(handle);
  }
  $provideDocumentLinks(handle, resource, token) {
    return this._withAdapter(handle, LinkProviderAdapter, (adapter) => adapter.provideLinks(URI.revive(resource), token), void 0, token, resource.scheme === "output");
  }
  $resolveDocumentLink(handle, id, token) {
    return this._withAdapter(handle, LinkProviderAdapter, (adapter) => adapter.resolveLink(id, token), void 0, void 0, true);
  }
  $releaseDocumentLinks(handle, id) {
    this._withAdapter(handle, LinkProviderAdapter, (adapter) => adapter.releaseLinks(id), void 0, void 0, true);
  }
  registerColorProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new ColorProviderAdapter(this._documents, provider), extension);
    this._proxy.$registerDocumentColorProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideDocumentColors(handle, resource, token) {
    return this._withAdapter(handle, ColorProviderAdapter, (adapter) => adapter.provideColors(URI.revive(resource), token), [], token);
  }
  $provideColorPresentations(handle, resource, colorInfo, token) {
    return this._withAdapter(handle, ColorProviderAdapter, (adapter) => adapter.provideColorPresentations(URI.revive(resource), colorInfo, token), void 0, token);
  }
  registerFoldingRangeProvider(extension, selector, provider) {
    const handle = this._nextHandle();
    const eventHandle = typeof provider.onDidChangeFoldingRanges === "function" ? this._nextHandle() : void 0;
    this._adapter.set(handle, new AdapterData(new FoldingProviderAdapter(this._documents, provider), extension));
    this._proxy.$registerFoldingRangeProvider(handle, this._transformDocumentSelector(selector, extension), extension.identifier, eventHandle);
    let result = this._createDisposable(handle);
    if (eventHandle !== void 0) {
      const subscription = provider.onDidChangeFoldingRanges(() => this._proxy.$emitFoldingRangeEvent(eventHandle));
      result = Disposable.from(result, subscription);
    }
    return result;
  }
  $provideFoldingRanges(handle, resource, context, token) {
    return this._withAdapter(
      handle,
      FoldingProviderAdapter,
      (adapter) => adapter.provideFoldingRanges(URI.revive(resource), context, token),
      void 0,
      token
    );
  }
  // --- smart select
  registerSelectionRangeProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new SelectionRangeAdapter(this._documents, provider, this._logService), extension);
    this._proxy.$registerSelectionRangeProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $provideSelectionRanges(handle, resource, positions, token) {
    return this._withAdapter(handle, SelectionRangeAdapter, (adapter) => adapter.provideSelectionRanges(URI.revive(resource), positions, token), [], token);
  }
  // --- call hierarchy
  registerCallHierarchyProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new CallHierarchyAdapter(this._documents, provider), extension);
    this._proxy.$registerCallHierarchyProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $prepareCallHierarchy(handle, resource, position, token) {
    return this._withAdapter(handle, CallHierarchyAdapter, (adapter) => Promise.resolve(adapter.prepareSession(URI.revive(resource), position, token)), void 0, token);
  }
  $provideCallHierarchyIncomingCalls(handle, sessionId, itemId, token) {
    return this._withAdapter(handle, CallHierarchyAdapter, (adapter) => adapter.provideCallsTo(sessionId, itemId, token), void 0, token);
  }
  $provideCallHierarchyOutgoingCalls(handle, sessionId, itemId, token) {
    return this._withAdapter(handle, CallHierarchyAdapter, (adapter) => adapter.provideCallsFrom(sessionId, itemId, token), void 0, token);
  }
  $releaseCallHierarchy(handle, sessionId) {
    this._withAdapter(handle, CallHierarchyAdapter, (adapter) => Promise.resolve(adapter.releaseSession(sessionId)), void 0, void 0);
  }
  // --- type hierarchy
  registerTypeHierarchyProvider(extension, selector, provider) {
    const handle = this._addNewAdapter(new TypeHierarchyAdapter(this._documents, provider), extension);
    this._proxy.$registerTypeHierarchyProvider(handle, this._transformDocumentSelector(selector, extension));
    return this._createDisposable(handle);
  }
  $prepareTypeHierarchy(handle, resource, position, token) {
    return this._withAdapter(handle, TypeHierarchyAdapter, (adapter) => Promise.resolve(adapter.prepareSession(URI.revive(resource), position, token)), void 0, token);
  }
  $provideTypeHierarchySupertypes(handle, sessionId, itemId, token) {
    return this._withAdapter(handle, TypeHierarchyAdapter, (adapter) => adapter.provideSupertypes(sessionId, itemId, token), void 0, token);
  }
  $provideTypeHierarchySubtypes(handle, sessionId, itemId, token) {
    return this._withAdapter(handle, TypeHierarchyAdapter, (adapter) => adapter.provideSubtypes(sessionId, itemId, token), void 0, token);
  }
  $releaseTypeHierarchy(handle, sessionId) {
    this._withAdapter(handle, TypeHierarchyAdapter, (adapter) => Promise.resolve(adapter.releaseSession(sessionId)), void 0, void 0);
  }
  // --- Document on drop
  registerDocumentOnDropEditProvider(extension, selector, provider, metadata) {
    const handle = this._nextHandle();
    this._adapter.set(handle, new AdapterData(new DocumentDropEditAdapter(this._proxy, this._documents, provider, handle, extension), extension));
    this._proxy.$registerDocumentOnDropEditProvider(handle, this._transformDocumentSelector(selector, extension), metadata ? {
      supportsResolve: !!provider.resolveDocumentDropEdit,
      dropMimeTypes: metadata.dropMimeTypes,
      providedDropKinds: metadata.providedDropEditKinds?.map((x) => x.value)
    } : void 0);
    return this._createDisposable(handle);
  }
  $provideDocumentOnDropEdits(handle, requestId, resource, position, dataTransferDto, token) {
    return this._withAdapter(handle, DocumentDropEditAdapter, (adapter) => Promise.resolve(adapter.provideDocumentOnDropEdits(requestId, URI.revive(resource), position, dataTransferDto, token)), void 0, void 0);
  }
  $resolveDropEdit(handle, id, token) {
    return this._withAdapter(handle, DocumentDropEditAdapter, (adapter) => adapter.resolveDropEdit(id, token), {}, void 0);
  }
  $releaseDocumentOnDropEdits(handle, cacheId) {
    this._withAdapter(handle, DocumentDropEditAdapter, (adapter) => Promise.resolve(adapter.releaseDropEdits(cacheId)), void 0, void 0);
  }
  // --- copy/paste actions
  registerDocumentPasteEditProvider(extension, selector, provider, metadata) {
    const handle = this._nextHandle();
    this._adapter.set(handle, new AdapterData(new DocumentPasteEditProvider(this._proxy, this._documents, provider, handle, extension), extension));
    this._proxy.$registerPasteEditProvider(handle, this._transformDocumentSelector(selector, extension), {
      supportsCopy: !!provider.prepareDocumentPaste,
      supportsPaste: !!provider.provideDocumentPasteEdits,
      supportsResolve: !!provider.resolveDocumentPasteEdit,
      providedPasteEditKinds: metadata.providedPasteEditKinds?.map((x) => x.value),
      copyMimeTypes: metadata.copyMimeTypes,
      pasteMimeTypes: metadata.pasteMimeTypes
    });
    return this._createDisposable(handle);
  }
  $prepareDocumentPaste(handle, resource, ranges, dataTransfer, token) {
    return this._withAdapter(handle, DocumentPasteEditProvider, (adapter) => adapter.prepareDocumentPaste(URI.revive(resource), ranges, dataTransfer, token), void 0, token);
  }
  $providePasteEdits(handle, requestId, resource, ranges, dataTransferDto, context, token) {
    return this._withAdapter(handle, DocumentPasteEditProvider, (adapter) => adapter.providePasteEdits(requestId, URI.revive(resource), ranges, dataTransferDto, context, token), void 0, token);
  }
  $resolvePasteEdit(handle, id, token) {
    return this._withAdapter(handle, DocumentPasteEditProvider, (adapter) => adapter.resolvePasteEdit(id, token), {}, void 0);
  }
  $releasePasteEdits(handle, cacheId) {
    this._withAdapter(handle, DocumentPasteEditProvider, (adapter) => Promise.resolve(adapter.releasePasteEdits(cacheId)), void 0, void 0);
  }
  // --- configuration
  static _serializeRegExp(regExp) {
    return {
      pattern: regExp.source,
      flags: regExp.flags
    };
  }
  static _serializeIndentationRule(indentationRule) {
    return {
      decreaseIndentPattern: _ExtHostLanguageFeatures._serializeRegExp(indentationRule.decreaseIndentPattern),
      increaseIndentPattern: _ExtHostLanguageFeatures._serializeRegExp(indentationRule.increaseIndentPattern),
      indentNextLinePattern: indentationRule.indentNextLinePattern ? _ExtHostLanguageFeatures._serializeRegExp(indentationRule.indentNextLinePattern) : void 0,
      unIndentedLinePattern: indentationRule.unIndentedLinePattern ? _ExtHostLanguageFeatures._serializeRegExp(indentationRule.unIndentedLinePattern) : void 0
    };
  }
  static _serializeOnEnterRule(onEnterRule) {
    return {
      beforeText: _ExtHostLanguageFeatures._serializeRegExp(onEnterRule.beforeText),
      afterText: onEnterRule.afterText ? _ExtHostLanguageFeatures._serializeRegExp(onEnterRule.afterText) : void 0,
      previousLineText: onEnterRule.previousLineText ? _ExtHostLanguageFeatures._serializeRegExp(onEnterRule.previousLineText) : void 0,
      action: onEnterRule.action
    };
  }
  static _serializeOnEnterRules(onEnterRules) {
    return onEnterRules.map(_ExtHostLanguageFeatures._serializeOnEnterRule);
  }
  static _serializeAutoClosingPair(autoClosingPair) {
    return {
      open: autoClosingPair.open,
      close: autoClosingPair.close,
      notIn: autoClosingPair.notIn ? autoClosingPair.notIn.map((v) => SyntaxTokenType.toString(v)) : void 0
    };
  }
  static _serializeAutoClosingPairs(autoClosingPairs) {
    return autoClosingPairs.map(_ExtHostLanguageFeatures._serializeAutoClosingPair);
  }
  setLanguageConfiguration(extension, languageId, configuration) {
    const { wordPattern } = configuration;
    if (wordPattern && regExpLeadsToEndlessLoop(wordPattern)) {
      throw new Error(`Invalid language configuration: wordPattern '${wordPattern}' is not allowed to match the empty string.`);
    }
    if (wordPattern) {
      this._documents.setWordDefinitionFor(languageId, wordPattern);
    } else {
      this._documents.setWordDefinitionFor(languageId, void 0);
    }
    if (configuration.__electricCharacterSupport) {
      this._apiDeprecation.report(
        "LanguageConfiguration.__electricCharacterSupport",
        extension,
        `Do not use.`
      );
    }
    if (configuration.__characterPairSupport) {
      this._apiDeprecation.report(
        "LanguageConfiguration.__characterPairSupport",
        extension,
        `Do not use.`
      );
    }
    const handle = this._nextHandle();
    const serializedConfiguration = {
      comments: configuration.comments,
      brackets: configuration.brackets,
      wordPattern: configuration.wordPattern ? _ExtHostLanguageFeatures._serializeRegExp(configuration.wordPattern) : void 0,
      indentationRules: configuration.indentationRules ? _ExtHostLanguageFeatures._serializeIndentationRule(configuration.indentationRules) : void 0,
      onEnterRules: configuration.onEnterRules ? _ExtHostLanguageFeatures._serializeOnEnterRules(configuration.onEnterRules) : void 0,
      __electricCharacterSupport: configuration.__electricCharacterSupport,
      __characterPairSupport: configuration.__characterPairSupport,
      autoClosingPairs: configuration.autoClosingPairs ? _ExtHostLanguageFeatures._serializeAutoClosingPairs(configuration.autoClosingPairs) : void 0
    };
    this._proxy.$setLanguageConfiguration(handle, languageId, serializedConfiguration);
    return this._createDisposable(handle);
  }
  $setWordDefinitions(wordDefinitions) {
    for (const wordDefinition of wordDefinitions) {
      this._documents.setWordDefinitionFor(wordDefinition.languageId, new RegExp(wordDefinition.regexSource, wordDefinition.regexFlags));
    }
  }
};
_ExtHostLanguageFeatures._handlePool = 0;
let ExtHostLanguageFeatures = _ExtHostLanguageFeatures;
export {
  ExtHostLanguageFeatures
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBhc0FycmF5LCBjb2FsZXNjZSwgaXNGYWxzeU9yRW1wdHksIGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBOb3RJbXBsZW1lbnRlZEVycm9yLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElkR2VuZXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaWRHZW5lcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBEaXNwb3NhYmxlIGFzIENvcmVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVxdWFscywgbWl4aW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyByZWdFeHBMZWFkc1RvRW5kbGVzc0xvb3AgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUsIGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElVUklUcmFuc2Zvcm1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaUlwYy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSBhcyBFZGl0b3JSYW5nZSwgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24sIFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElBdXRvQ2xvc2luZ1BhaXJDb25kaXRpb25hbCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBlbmNvZGVTZW1hbnRpY1Rva2Vuc0R0byB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvc2VtYW50aWNUb2tlbnNEdG8uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDYWNoZSB9IGZyb20gJy4vY2FjaGUuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFByb3RvY29sIGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc0NvbnZlcnRlciwgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERpYWdub3N0aWNzIH0gZnJvbSAnLi9leHRIb3N0RGlhZ25vc3RpY3MuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0VGVsZW1ldHJ5LCBJRXh0SG9zdFRlbGVtZXRyeSB9IGZyb20gJy4vZXh0SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydCBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uLCBDb2RlQWN0aW9uS2luZCwgQ29tcGxldGlvbkxpc3QsIERhdGFUcmFuc2ZlciwgRGlzcG9zYWJsZSwgRG9jdW1lbnREcm9wT3JQYXN0ZUVkaXRLaW5kLCBEb2N1bWVudFN5bWJvbCwgSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uS2luZCwgSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLCBJbnRlcm5hbERhdGFUcmFuc2Zlckl0ZW0sIExvY2F0aW9uLCBOZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIFJhbmdlLCBTZW1hbnRpY1Rva2VucywgU2VtYW50aWNUb2tlbnNFZGl0LCBTZW1hbnRpY1Rva2Vuc0VkaXRzLCBTbmlwcGV0U3RyaW5nLCBTeW1ib2xJbmZvcm1hdGlvbiwgU3ludGF4VG9rZW5UeXBlIH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElJbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9pbmxpbmVDb21wbGV0aW9ucy9jb21tb24vaW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvbi5qcyc7XG5cbi8vIC0tLSBhZGFwdGVyXG5cbmNsYXNzIERvY3VtZW50U3ltYm9sQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRTeW1ib2xQcm92aWRlclxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFN5bWJvbHMocmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuRG9jdW1lbnRTeW1ib2xbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlRG9jdW1lbnRTeW1ib2xzKGRvYywgdG9rZW4pO1xuXHRcdGlmIChpc0ZhbHN5T3JFbXB0eSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZSFbMF0gaW5zdGFuY2VvZiBEb2N1bWVudFN5bWJvbCkge1xuXHRcdFx0cmV0dXJuICg8RG9jdW1lbnRTeW1ib2xbXT52YWx1ZSkubWFwKHR5cGVDb252ZXJ0LkRvY3VtZW50U3ltYm9sLmZyb20pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gRG9jdW1lbnRTeW1ib2xBZGFwdGVyLl9hc0RvY3VtZW50U3ltYm9sVHJlZSg8U3ltYm9sSW5mb3JtYXRpb25bXT52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FzRG9jdW1lbnRTeW1ib2xUcmVlKGluZm9zOiBTeW1ib2xJbmZvcm1hdGlvbltdKTogbGFuZ3VhZ2VzLkRvY3VtZW50U3ltYm9sW10ge1xuXHRcdC8vIGZpcnN0IHNvcnQgYnkgc3RhcnQgKGFuZCBlbmQpIGFuZCB0aGVuIGxvb3Agb3ZlciBhbGwgZWxlbWVudHNcblx0XHQvLyBhbmQgYnVpbGQgYSB0cmVlIGJhc2VkIG9uIGNvbnRhaW5tZW50LlxuXHRcdGluZm9zID0gaW5mb3Muc2xpY2UoMCkuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0bGV0IHJlcyA9IGEubG9jYXRpb24ucmFuZ2Uuc3RhcnQuY29tcGFyZVRvKGIubG9jYXRpb24ucmFuZ2Uuc3RhcnQpO1xuXHRcdFx0aWYgKHJlcyA9PT0gMCkge1xuXHRcdFx0XHRyZXMgPSBiLmxvY2F0aW9uLnJhbmdlLmVuZC5jb21wYXJlVG8oYS5sb2NhdGlvbi5yYW5nZS5lbmQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9KTtcblx0XHRjb25zdCByZXM6IGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbFtdID0gW107XG5cdFx0Y29uc3QgcGFyZW50U3RhY2s6IGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBpbmZvIG9mIGluZm9zKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50OiBsYW5ndWFnZXMuRG9jdW1lbnRTeW1ib2wgPSB7XG5cdFx0XHRcdG5hbWU6IGluZm8ubmFtZSB8fCAnISFNSVNTSU5HOiBuYW1lISEnLFxuXHRcdFx0XHRraW5kOiB0eXBlQ29udmVydC5TeW1ib2xLaW5kLmZyb20oaW5mby5raW5kKSxcblx0XHRcdFx0dGFnczogaW5mby50YWdzPy5tYXAodHlwZUNvbnZlcnQuU3ltYm9sVGFnLmZyb20pIHx8IFtdLFxuXHRcdFx0XHRkZXRhaWw6ICcnLFxuXHRcdFx0XHRjb250YWluZXJOYW1lOiBpbmZvLmNvbnRhaW5lck5hbWUsXG5cdFx0XHRcdHJhbmdlOiB0eXBlQ29udmVydC5SYW5nZS5mcm9tKGluZm8ubG9jYXRpb24ucmFuZ2UpLFxuXHRcdFx0XHRzZWxlY3Rpb25SYW5nZTogdHlwZUNvbnZlcnQuUmFuZ2UuZnJvbShpbmZvLmxvY2F0aW9uLnJhbmdlKSxcblx0XHRcdFx0Y2hpbGRyZW46IFtdXG5cdFx0XHR9O1xuXG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRpZiAocGFyZW50U3RhY2subGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cGFyZW50U3RhY2sucHVzaChlbGVtZW50KTtcblx0XHRcdFx0XHRyZXMucHVzaChlbGVtZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwYXJlbnQgPSBwYXJlbnRTdGFja1twYXJlbnRTdGFjay5sZW5ndGggLSAxXTtcblx0XHRcdFx0aWYgKEVkaXRvclJhbmdlLmNvbnRhaW5zUmFuZ2UocGFyZW50LnJhbmdlLCBlbGVtZW50LnJhbmdlKSAmJiAhRWRpdG9yUmFuZ2UuZXF1YWxzUmFuZ2UocGFyZW50LnJhbmdlLCBlbGVtZW50LnJhbmdlKSkge1xuXHRcdFx0XHRcdHBhcmVudC5jaGlsZHJlbj8ucHVzaChlbGVtZW50KTtcblx0XHRcdFx0XHRwYXJlbnRTdGFjay5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBhcmVudFN0YWNrLnBvcCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG59XG5cbmNsYXNzIENvZGVMZW5zQWRhcHRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgQ2FjaGU8dnNjb2RlLkNvZGVMZW5zPignQ29kZUxlbnMnKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgTWFwPG51bWJlciwgRGlzcG9zYWJsZVN0b3JlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kczogQ29tbWFuZHNDb252ZXJ0ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Db2RlTGVuc1Byb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dFRlbGVtZXRyeTogRXh0SG9zdFRlbGVtZXRyeSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlQ29kZUxlbnNlcyhyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JQ29kZUxlbnNMaXN0RHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblxuXHRcdGNvbnN0IGxlbnNlcyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVDb2RlTGVuc2VzKGRvYywgdG9rZW4pO1xuXHRcdGlmICghbGVuc2VzIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjYWNoZUlkID0gdGhpcy5fY2FjaGUuYWRkKGxlbnNlcyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuc2V0KGNhY2hlSWQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCByZXN1bHQ6IGV4dEhvc3RQcm90b2NvbC5JQ29kZUxlbnNMaXN0RHRvID0ge1xuXHRcdFx0Y2FjaGVJZCxcblx0XHRcdGxlbnNlczogW10sXG5cdFx0fTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxlbnNlcy5sZW5ndGg7IGkrKykge1xuXG5cdFx0XHRpZiAoIVJhbmdlLmlzUmFuZ2UobGVuc2VzW2ldLnJhbmdlKSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oJ0lOVkFMSUQgY29kZSBsZW5zLCByYW5nZSBpcyBub3QgZGVmaW5lZCcsIHRoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5sZW5zZXMucHVzaCh7XG5cdFx0XHRcdGNhY2hlSWQ6IFtjYWNoZUlkLCBpXSxcblx0XHRcdFx0cmFuZ2U6IHR5cGVDb252ZXJ0LlJhbmdlLmZyb20obGVuc2VzW2ldLnJhbmdlKSxcblx0XHRcdFx0Y29tbWFuZDogdGhpcy5fY29tbWFuZHMudG9JbnRlcm5hbChsZW5zZXNbaV0uY29tbWFuZCwgZGlzcG9zYWJsZXMpXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb2RlTGVucyhzeW1ib2w6IGV4dEhvc3RQcm90b2NvbC5JQ29kZUxlbnNEdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklDb2RlTGVuc0R0byB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgbGVucyA9IHN5bWJvbC5jYWNoZUlkICYmIHRoaXMuX2NhY2hlLmdldCguLi5zeW1ib2wuY2FjaGVJZCk7XG5cdFx0aWYgKCFsZW5zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCByZXNvbHZlZExlbnM6IHZzY29kZS5Db2RlTGVucyB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9wcm92aWRlci5yZXNvbHZlQ29kZUxlbnMgIT09ICdmdW5jdGlvbicgfHwgbGVucy5pc1Jlc29sdmVkKSB7XG5cdFx0XHRyZXNvbHZlZExlbnMgPSBsZW5zO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvbHZlZExlbnMgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5yZXNvbHZlQ29kZUxlbnMobGVucywgdG9rZW4pO1xuXHRcdH1cblx0XHRpZiAoIXJlc29sdmVkTGVucykge1xuXHRcdFx0cmVzb2x2ZWRMZW5zID0gbGVucztcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gc3ltYm9sLmNhY2hlSWQgJiYgdGhpcy5fZGlzcG9zYWJsZXMuZ2V0KHN5bWJvbC5jYWNoZUlkWzBdKTtcblx0XHRpZiAoIWRpc3Bvc2FibGVzKSB7XG5cdFx0XHQvLyBkaXNwb3NlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNvbHZlZExlbnMuY29tbWFuZCkge1xuXHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ0lOVkFMSUQgY29kZSBsZW5zIHJlc29sdmVkLCBsYWNrcyBjb21tYW5kOiAnICsgdGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUpO1xuXHRcdFx0dGhpcy5fZXh0VGVsZW1ldHJ5Lm9uRXh0ZW5zaW9uRXJyb3IodGhpcy5fZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGVycm9yKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRzeW1ib2wuY29tbWFuZCA9IHRoaXMuX2NvbW1hbmRzLnRvSW50ZXJuYWwocmVzb2x2ZWRMZW5zLmNvbW1hbmQsIGRpc3Bvc2FibGVzKTtcblx0XHRyZXR1cm4gc3ltYm9sO1xuXHR9XG5cblx0cmVsZWFzZUNvZGVMZW5zZXMoY2FjaGVkSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmdldChjYWNoZWRJZCk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kZWxldGUoY2FjaGVkSWQpO1xuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShjYWNoZWRJZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29udmVydFRvTG9jYXRpb25MaW5rcyh2YWx1ZTogdnNjb2RlLkxvY2F0aW9uIHwgdnNjb2RlLkxvY2F0aW9uW10gfCB2c2NvZGUuTG9jYXRpb25MaW5rW10gfCB1bmRlZmluZWQgfCBudWxsKTogbGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdIHtcblx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmV0dXJuICg8YW55PnZhbHVlKS5tYXAodHlwZUNvbnZlcnQuRGVmaW5pdGlvbkxpbmsuZnJvbSk7XG5cdH0gZWxzZSBpZiAodmFsdWUpIHtcblx0XHRyZXR1cm4gW3R5cGVDb252ZXJ0LkRlZmluaXRpb25MaW5rLmZyb20odmFsdWUpXTtcblx0fVxuXHRyZXR1cm4gW107XG59XG5cbmNsYXNzIERlZmluaXRpb25BZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5EZWZpbml0aW9uUHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlRGVmaW5pdGlvbihyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmtbXT4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURlZmluaXRpb24oZG9jLCBwb3MsIHRva2VuKTtcblx0XHRyZXR1cm4gY29udmVydFRvTG9jYXRpb25MaW5rcyh2YWx1ZSk7XG5cdH1cbn1cblxuY2xhc3MgRGVjbGFyYXRpb25BZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5EZWNsYXJhdGlvblByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZURlY2xhcmF0aW9uKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlRGVjbGFyYXRpb24oZG9jLCBwb3MsIHRva2VuKTtcblx0XHRyZXR1cm4gY29udmVydFRvTG9jYXRpb25MaW5rcyh2YWx1ZSk7XG5cdH1cbn1cblxuY2xhc3MgSW1wbGVtZW50YXRpb25BZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5JbXBsZW1lbnRhdGlvblByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZUltcGxlbWVudGF0aW9uKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlSW1wbGVtZW50YXRpb24oZG9jLCBwb3MsIHRva2VuKTtcblx0XHRyZXR1cm4gY29udmVydFRvTG9jYXRpb25MaW5rcyh2YWx1ZSk7XG5cdH1cbn1cblxuY2xhc3MgVHlwZURlZmluaXRpb25BZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5UeXBlRGVmaW5pdGlvblByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZVR5cGVEZWZpbml0aW9uKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlVHlwZURlZmluaXRpb24oZG9jLCBwb3MsIHRva2VuKTtcblx0XHRyZXR1cm4gY29udmVydFRvTG9jYXRpb25MaW5rcyh2YWx1ZSk7XG5cdH1cbn1cblxuY2xhc3MgSG92ZXJBZGFwdGVyIHtcblxuXHRwcml2YXRlIF9ob3ZlckNvdW50ZXI6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2hvdmVyTWFwOiBNYXA8bnVtYmVyLCB2c2NvZGUuSG92ZXI+ID0gbmV3IE1hcDxudW1iZXIsIHZzY29kZS5Ib3Zlcj4oKTtcblxuXHRwcml2YXRlIHN0YXRpYyBIT1ZFUl9NQVBfTUFYX1NJWkUgPSAxMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Ib3ZlclByb3ZpZGVyLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVIb3ZlcihyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuSG92ZXJDb250ZXh0PHsgaWQ6IG51bWJlciB9PiB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSG92ZXJXaXRoSWQgfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0bGV0IHZhbHVlOiB2c2NvZGUuSG92ZXIgfCBudWxsIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjb250ZXh0ICYmIGNvbnRleHQudmVyYm9zaXR5UmVxdWVzdCkge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNIb3ZlcklkID0gY29udGV4dC52ZXJib3NpdHlSZXF1ZXN0LnByZXZpb3VzSG92ZXIuaWQ7XG5cdFx0XHRjb25zdCBwcmV2aW91c0hvdmVyID0gdGhpcy5faG92ZXJNYXAuZ2V0KHByZXZpb3VzSG92ZXJJZCk7XG5cdFx0XHRpZiAoIXByZXZpb3VzSG92ZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBIb3ZlciB3aXRoIGlkICR7cHJldmlvdXNIb3ZlcklkfSBub3QgZm91bmRgKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGhvdmVyQ29udGV4dDogdnNjb2RlLkhvdmVyQ29udGV4dCA9IHsgdmVyYm9zaXR5RGVsdGE6IGNvbnRleHQudmVyYm9zaXR5UmVxdWVzdC52ZXJib3NpdHlEZWx0YSwgcHJldmlvdXNIb3ZlciB9O1xuXHRcdFx0dmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlSG92ZXIoZG9jLCBwb3MsIHRva2VuLCBob3ZlckNvbnRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVIb3Zlcihkb2MsIHBvcywgdG9rZW4pO1xuXHRcdH1cblx0XHRpZiAoIXZhbHVlIHx8IGlzRmFsc3lPckVtcHR5KHZhbHVlLmNvbnRlbnRzKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF2YWx1ZS5yYW5nZSkge1xuXHRcdFx0dmFsdWUucmFuZ2UgPSBkb2MuZ2V0V29yZFJhbmdlQXRQb3NpdGlvbihwb3MpO1xuXHRcdH1cblx0XHRpZiAoIXZhbHVlLnJhbmdlKSB7XG5cdFx0XHR2YWx1ZS5yYW5nZSA9IG5ldyBSYW5nZShwb3MsIHBvcyk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnZlcnRlZEhvdmVyOiBsYW5ndWFnZXMuSG92ZXIgPSB0eXBlQ29udmVydC5Ib3Zlci5mcm9tKHZhbHVlKTtcblx0XHRjb25zdCBpZCA9IHRoaXMuX2hvdmVyQ291bnRlcjtcblx0XHQvLyBDaGVjayBpZiBob3ZlciBtYXAgaGFzIG1vcmUgdGhhbiAxMCBlbGVtZW50cyBhbmQgaWYgeWVzLCByZW1vdmUgb2xkZXN0IGZyb20gdGhlIG1hcFxuXHRcdGlmICh0aGlzLl9ob3Zlck1hcC5zaXplID09PSBIb3ZlckFkYXB0ZXIuSE9WRVJfTUFQX01BWF9TSVpFKSB7XG5cdFx0XHRjb25zdCBtaW5pbXVtSWQgPSBNYXRoLm1pbiguLi50aGlzLl9ob3Zlck1hcC5rZXlzKCkpO1xuXHRcdFx0dGhpcy5faG92ZXJNYXAuZGVsZXRlKG1pbmltdW1JZCk7XG5cdFx0fVxuXHRcdHRoaXMuX2hvdmVyTWFwLnNldChpZCwgdmFsdWUpO1xuXHRcdHRoaXMuX2hvdmVyQ291bnRlciArPSAxO1xuXHRcdGNvbnN0IGhvdmVyOiBleHRIb3N0UHJvdG9jb2wuSG92ZXJXaXRoSWQgPSB7XG5cdFx0XHQuLi5jb252ZXJ0ZWRIb3Zlcixcblx0XHRcdGlkXG5cdFx0fTtcblx0XHRyZXR1cm4gaG92ZXI7XG5cdH1cblxuXHRyZWxlYXNlSG92ZXIoaWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2hvdmVyTWFwLmRlbGV0ZShpZCk7XG5cdH1cbn1cblxuY2xhc3MgRXZhbHVhdGFibGVFeHByZXNzaW9uQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuRXZhbHVhdGFibGVFeHByZXNzaW9uUHJvdmlkZXIsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZUV2YWx1YXRhYmxlRXhwcmVzc2lvbihyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5FdmFsdWF0YWJsZUV4cHJlc3Npb24gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlRXZhbHVhdGFibGVFeHByZXNzaW9uKGRvYywgcG9zLCB0b2tlbik7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdHlwZUNvbnZlcnQuRXZhbHVhdGFibGVFeHByZXNzaW9uLmZyb20odmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIElubGluZVZhbHVlc0FkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLklubGluZVZhbHVlc1Byb3ZpZGVyLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVJbmxpbmVWYWx1ZXMocmVzb3VyY2U6IFVSSSwgdmlld1BvcnQ6IElSYW5nZSwgY29udGV4dDogZXh0SG9zdFByb3RvY29sLklJbmxpbmVWYWx1ZUNvbnRleHREdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLklubGluZVZhbHVlW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUlubGluZVZhbHVlcyhkb2MsIHR5cGVDb252ZXJ0LlJhbmdlLnRvKHZpZXdQb3J0KSwgdHlwZUNvbnZlcnQuSW5saW5lVmFsdWVDb250ZXh0LnRvKGNvbnRleHQpLCB0b2tlbik7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKGl2ID0+IHR5cGVDb252ZXJ0LklubGluZVZhbHVlLmZyb20oaXYpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBEb2N1bWVudEhpZ2hsaWdodEFkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkRvY3VtZW50SGlnaGxpZ2h0W10gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKGRvYywgcG9zLCB0b2tlbik7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKHR5cGVDb252ZXJ0LkRvY3VtZW50SGlnaGxpZ2h0LmZyb20pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIE11bHRpRG9jdW1lbnRIaWdobGlnaHRBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5NdWx0aURvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZU11bHRpRG9jdW1lbnRIaWdobGlnaHRzKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIG90aGVyUmVzb3VyY2VzOiBVUklbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTXVsdGlEb2N1bWVudEhpZ2hsaWdodFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBvdGhlckRvY3VtZW50cyA9IG90aGVyUmVzb3VyY2VzLm1hcChyID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocik7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignRXJyb3I6IFVuYWJsZSB0byByZXRyaWV2ZSBkb2N1bWVudCBmcm9tIFVSSTogJyArIHIgKyAnLiBFcnJvciBtZXNzYWdlOiAnICsgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KS5maWx0ZXIoZG9jID0+IGRvYyAhPT0gdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZU11bHRpRG9jdW1lbnRIaWdobGlnaHRzKGRvYywgcG9zLCBvdGhlckRvY3VtZW50cywgdG9rZW4pO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLm1hcCh0eXBlQ29udmVydC5NdWx0aURvY3VtZW50SGlnaGxpZ2h0LmZyb20pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIExpbmtlZEVkaXRpbmdSYW5nZUFkYXB0ZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5MaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlclxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVMaW5rZWRFZGl0aW5nUmFuZ2VzKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxpbmtlZEVkaXRpbmdSYW5nZXMgfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlTGlua2VkRWRpdGluZ1Jhbmdlcyhkb2MsIHBvcywgdG9rZW4pO1xuXHRcdGlmICh2YWx1ZSAmJiBBcnJheS5pc0FycmF5KHZhbHVlLnJhbmdlcykpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlczogY29hbGVzY2UodmFsdWUucmFuZ2VzLm1hcCh0eXBlQ29udmVydC5SYW5nZS5mcm9tKSksXG5cdFx0XHRcdHdvcmRQYXR0ZXJuOiB2YWx1ZS53b3JkUGF0dGVyblxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBSZWZlcmVuY2VBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5SZWZlcmVuY2VQcm92aWRlclxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVSZWZlcmVuY2VzKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5SZWZlcmVuY2VDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Mb2NhdGlvbltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVSZWZlcmVuY2VzKGRvYywgcG9zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKHR5cGVDb252ZXJ0LmxvY2F0aW9uLmZyb20pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ3VzdG9tQ29kZUFjdGlvbiBleHRlbmRzIGV4dEhvc3RQcm90b2NvbC5JQ29kZUFjdGlvbkR0byB7XG5cdF9pc1N5bnRoZXRpYz86IGJvb2xlYW47XG59XG5cbmNsYXNzIENvZGVBY3Rpb25BZGFwdGVyIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX21heENvZGVBY3Rpb25zUGVyRmlsZTogbnVtYmVyID0gMTAwMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBDYWNoZTx2c2NvZGUuQ29kZUFjdGlvbiB8IHZzY29kZS5Db21tYW5kPignQ29kZUFjdGlvbicpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBNYXA8bnVtYmVyLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBDb21tYW5kc0NvbnZlcnRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWFnbm9zdGljczogRXh0SG9zdERpYWdub3N0aWNzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuQ29kZUFjdGlvblByb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FwaURlcHJlY2F0aW9uOiBJRXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlQ29kZUFjdGlvbnMocmVzb3VyY2U6IFVSSSwgcmFuZ2VPclNlbGVjdGlvbjogSVJhbmdlIHwgSVNlbGVjdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JQ29kZUFjdGlvbkxpc3REdG8gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmFuID0gU2VsZWN0aW9uLmlzSVNlbGVjdGlvbihyYW5nZU9yU2VsZWN0aW9uKVxuXHRcdFx0PyA8dnNjb2RlLlNlbGVjdGlvbj50eXBlQ29udmVydC5TZWxlY3Rpb24udG8ocmFuZ2VPclNlbGVjdGlvbilcblx0XHRcdDogPHZzY29kZS5SYW5nZT50eXBlQ29udmVydC5SYW5nZS50byhyYW5nZU9yU2VsZWN0aW9uKTtcblx0XHRjb25zdCBhbGxEaWFnbm9zdGljczogdnNjb2RlLkRpYWdub3N0aWNbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBkaWFnbm9zdGljIG9mIHRoaXMuX2RpYWdub3N0aWNzLmdldERpYWdub3N0aWNzKHJlc291cmNlKSkge1xuXHRcdFx0aWYgKHJhbi5pbnRlcnNlY3Rpb24oZGlhZ25vc3RpYy5yYW5nZSkpIHtcblx0XHRcdFx0Y29uc3QgbmV3TGVuID0gYWxsRGlhZ25vc3RpY3MucHVzaChkaWFnbm9zdGljKTtcblx0XHRcdFx0aWYgKG5ld0xlbiA+IENvZGVBY3Rpb25BZGFwdGVyLl9tYXhDb2RlQWN0aW9uc1BlckZpbGUpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNvZGVBY3Rpb25Db250ZXh0OiB2c2NvZGUuQ29kZUFjdGlvbkNvbnRleHQgPSB7XG5cdFx0XHRkaWFnbm9zdGljczogYWxsRGlhZ25vc3RpY3MsXG5cdFx0XHRvbmx5OiBjb250ZXh0Lm9ubHkgPyBuZXcgQ29kZUFjdGlvbktpbmQoY29udGV4dC5vbmx5KSA6IHVuZGVmaW5lZCxcblx0XHRcdHRyaWdnZXJLaW5kOiB0eXBlQ29udmVydC5Db2RlQWN0aW9uVHJpZ2dlcktpbmQudG8oY29udGV4dC50cmlnZ2VyKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY29tbWFuZHNPckFjdGlvbnMgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlQ29kZUFjdGlvbnMoZG9jLCByYW4sIGNvZGVBY3Rpb25Db250ZXh0LCB0b2tlbik7XG5cdFx0aWYgKCFpc05vbkVtcHR5QXJyYXkoY29tbWFuZHNPckFjdGlvbnMpIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlSWQgPSB0aGlzLl9jYWNoZS5hZGQoY29tbWFuZHNPckFjdGlvbnMpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnNldChjYWNoZUlkLCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgYWN0aW9uczogQ3VzdG9tQ29kZUFjdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb21tYW5kc09yQWN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gY29tbWFuZHNPckFjdGlvbnNbaV07XG5cdFx0XHRpZiAoIWNhbmRpZGF0ZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKENvZGVBY3Rpb25BZGFwdGVyLl9pc0NvbW1hbmQoY2FuZGlkYXRlKSAmJiAhKGNhbmRpZGF0ZSBpbnN0YW5jZW9mIENvZGVBY3Rpb24pKSB7XG5cdFx0XHRcdC8vIG9sZCBzY2hvb2w6IHN5bnRoZXRpYyBjb2RlIGFjdGlvblxuXHRcdFx0XHR0aGlzLl9hcGlEZXByZWNhdGlvbi5yZXBvcnQoJ0NvZGVBY3Rpb25Qcm92aWRlci5wcm92aWRlQ29kZUFjdGlvbnMgLSByZXR1cm4gY29tbWFuZHMnLCB0aGlzLl9leHRlbnNpb24sXG5cdFx0XHRcdFx0YFJldHVybiAnQ29kZUFjdGlvbicgaW5zdGFuY2VzIGluc3RlYWQuYCk7XG5cblx0XHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRfaXNTeW50aGV0aWM6IHRydWUsXG5cdFx0XHRcdFx0dGl0bGU6IGNhbmRpZGF0ZS50aXRsZSxcblx0XHRcdFx0XHRjb21tYW5kOiB0aGlzLl9jb21tYW5kcy50b0ludGVybmFsKGNhbmRpZGF0ZSwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHRvQ29udmVydCA9IGNhbmRpZGF0ZSBhcyB2c2NvZGUuQ29kZUFjdGlvbjtcblxuXHRcdFx0XHQvLyBuZXcgc2Nob29sOiBjb252ZXJ0IGNvZGUgYWN0aW9uXG5cdFx0XHRcdGlmIChjb2RlQWN0aW9uQ29udGV4dC5vbmx5KSB7XG5cdFx0XHRcdFx0aWYgKCF0b0NvbnZlcnQua2luZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke3RoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfSAtIENvZGUgYWN0aW9ucyBvZiBraW5kICcke2NvZGVBY3Rpb25Db250ZXh0Lm9ubHkudmFsdWV9JyByZXF1ZXN0ZWQgYnV0IHJldHVybmVkIGNvZGUgYWN0aW9uIGRvZXMgbm90IGhhdmUgYSAna2luZCcuIENvZGUgYWN0aW9uIHdpbGwgYmUgZHJvcHBlZC4gUGxlYXNlIHNldCAnQ29kZUFjdGlvbi5raW5kJy5gKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFjb2RlQWN0aW9uQ29udGV4dC5vbmx5LmNvbnRhaW5zKHRvQ29udmVydC5raW5kKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke3RoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfSAtIENvZGUgYWN0aW9ucyBvZiBraW5kICcke2NvZGVBY3Rpb25Db250ZXh0Lm9ubHkudmFsdWV9JyByZXF1ZXN0ZWQgYnV0IHJldHVybmVkIGNvZGUgYWN0aW9uIGlzIG9mIGtpbmQgJyR7dG9Db252ZXJ0LmtpbmQudmFsdWV9Jy4gQ29kZSBhY3Rpb24gd2lsbCBiZSBkcm9wcGVkLiBQbGVhc2UgY2hlY2sgJ0NvZGVBY3Rpb25Db250ZXh0Lm9ubHknIHRvIG9ubHkgcmV0dXJuIHJlcXVlc3RlZCBjb2RlIGFjdGlvbnMuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRW5zdXJlcyB0aGF0IHRoaXMgaXMgZWl0aGVyIGEgUmFuZ2VbXSBvciBhbiBlbXB0eSBhcnJheSBzbyB3ZSBkb24ndCBnZXQgQXJyYXk8UmFuZ2UgfCB1bmRlZmluZWQ+XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gdG9Db252ZXJ0LnJhbmdlcyA/PyBbXTtcblxuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGNhY2hlSWQ6IFtjYWNoZUlkLCBpXSxcblx0XHRcdFx0XHR0aXRsZTogdG9Db252ZXJ0LnRpdGxlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHRvQ29udmVydC5jb21tYW5kICYmIHRoaXMuX2NvbW1hbmRzLnRvSW50ZXJuYWwodG9Db252ZXJ0LmNvbW1hbmQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRkaWFnbm9zdGljczogdG9Db252ZXJ0LmRpYWdub3N0aWNzICYmIHRvQ29udmVydC5kaWFnbm9zdGljcy5tYXAodHlwZUNvbnZlcnQuRGlhZ25vc3RpYy5mcm9tKSxcblx0XHRcdFx0XHRlZGl0OiB0b0NvbnZlcnQuZWRpdCAmJiB0eXBlQ29udmVydC5Xb3Jrc3BhY2VFZGl0LmZyb20odG9Db252ZXJ0LmVkaXQsIHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0a2luZDogdG9Db252ZXJ0LmtpbmQgJiYgdG9Db252ZXJ0LmtpbmQudmFsdWUsXG5cdFx0XHRcdFx0aXNQcmVmZXJyZWQ6IHRvQ29udmVydC5pc1ByZWZlcnJlZCxcblx0XHRcdFx0XHRpc0FJOiBpc1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdjb2RlQWN0aW9uQUknKSA/IHRvQ29udmVydC5pc0FJIDogZmFsc2UsXG5cdFx0XHRcdFx0cmFuZ2VzOiBpc1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdjb2RlQWN0aW9uUmFuZ2VzJykgPyBjb2FsZXNjZShyYW5nZS5tYXAodHlwZUNvbnZlcnQuUmFuZ2UuZnJvbSkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRpc2FibGVkOiB0b0NvbnZlcnQuZGlzYWJsZWQ/LnJlYXNvblxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgY2FjaGVJZCwgYWN0aW9ucyB9O1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUNvZGVBY3Rpb24oaWQ6IGV4dEhvc3RQcm90b2NvbC5DaGFpbmVkQ2FjaGVJZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGVkaXQ/OiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG87IGNvbW1hbmQ/OiBleHRIb3N0UHJvdG9jb2wuSUNvbW1hbmREdG8gfT4ge1xuXHRcdGNvbnN0IFtzZXNzaW9uSWQsIGl0ZW1JZF0gPSBpZDtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2FjaGUuZ2V0KHNlc3Npb25JZCwgaXRlbUlkKTtcblx0XHRpZiAoIWl0ZW0gfHwgQ29kZUFjdGlvbkFkYXB0ZXIuX2lzQ29tbWFuZChpdGVtKSkge1xuXHRcdFx0cmV0dXJuIHt9OyAvLyBjb2RlIGFjdGlvbnMgb25seSFcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlci5yZXNvbHZlQ29kZUFjdGlvbikge1xuXHRcdFx0cmV0dXJuIHt9OyAvLyB0aGlzIHNob3VsZCBub3QgaGFwcGVuLi4uXG5cdFx0fVxuXG5cblx0XHRjb25zdCByZXNvbHZlZEl0ZW0gPSAoYXdhaXQgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZUNvZGVBY3Rpb24oaXRlbSwgdG9rZW4pKSA/PyBpdGVtO1xuXG5cdFx0bGV0IHJlc29sdmVkRWRpdDogZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VFZGl0RHRvIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZXNvbHZlZEl0ZW0uZWRpdCkge1xuXHRcdFx0cmVzb2x2ZWRFZGl0ID0gdHlwZUNvbnZlcnQuV29ya3NwYWNlRWRpdC5mcm9tKHJlc29sdmVkSXRlbS5lZGl0LCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGxldCByZXNvbHZlZENvbW1hbmQ6IGV4dEhvc3RQcm90b2NvbC5JQ29tbWFuZER0byB8IHVuZGVmaW5lZDtcblx0XHRpZiAocmVzb2x2ZWRJdGVtLmNvbW1hbmQpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fZGlzcG9zYWJsZXMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0XHRpZiAoZGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0cmVzb2x2ZWRDb21tYW5kID0gdGhpcy5fY29tbWFuZHMudG9JbnRlcm5hbChyZXNvbHZlZEl0ZW0uY29tbWFuZCwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGVkaXQ6IHJlc29sdmVkRWRpdCwgY29tbWFuZDogcmVzb2x2ZWRDb21tYW5kIH07XG5cdH1cblxuXHRyZWxlYXNlQ29kZUFjdGlvbnMoY2FjaGVkSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmdldChjYWNoZWRJZCk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kZWxldGUoY2FjaGVkSWQpO1xuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShjYWNoZWRJZCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNDb21tYW5kKHRoaW5nOiBhbnkpOiB0aGluZyBpcyB2c2NvZGUuQ29tbWFuZCB7XG5cdFx0cmV0dXJuIHR5cGVvZiAoPHZzY29kZS5Db21tYW5kPnRoaW5nKS5jb21tYW5kID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgKDx2c2NvZGUuQ29tbWFuZD50aGluZykudGl0bGUgPT09ICdzdHJpbmcnO1xuXHR9XG59XG5cbmNsYXNzIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIge1xuXG5cdHByaXZhdGUgX2NhY2hlZFByZXBhcmU/OiBNYXA8c3RyaW5nLCB2c2NvZGUuRGF0YVRyYW5zZmVySXRlbT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdHNDYWNoZSA9IG5ldyBDYWNoZTx2c2NvZGUuRG9jdW1lbnRQYXN0ZUVkaXQ+KCdEb2N1bWVudFBhc3RlRWRpdC5lZGl0cycpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBleHRIb3N0UHJvdG9jb2wuTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXNTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hhbmRsZTogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByZXBhcmVEb2N1bWVudFBhc3RlKHJlc291cmNlOiBVUkksIHJhbmdlczogSVJhbmdlW10sIGRhdGFUcmFuc2ZlckR0bzogZXh0SG9zdFByb3RvY29sLkRhdGFUcmFuc2ZlckRUTywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuRGF0YVRyYW5zZmVyRFRPIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlci5wcmVwYXJlRG9jdW1lbnRQYXN0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NhY2hlZFByZXBhcmUgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHZzY29kZVJhbmdlcyA9IHJhbmdlcy5tYXAocmFuZ2UgPT4gdHlwZUNvbnZlcnQuUmFuZ2UudG8ocmFuZ2UpKTtcblxuXHRcdGNvbnN0IGRhdGFUcmFuc2ZlciA9IHR5cGVDb252ZXJ0LkRhdGFUcmFuc2Zlci50b0RhdGFUcmFuc2ZlcihkYXRhVHJhbnNmZXJEdG8sICgpID0+IHtcblx0XHRcdHRocm93IG5ldyBOb3RJbXBsZW1lbnRlZEVycm9yKCk7XG5cdFx0fSk7XG5cdFx0YXdhaXQgdGhpcy5fcHJvdmlkZXIucHJlcGFyZURvY3VtZW50UGFzdGUoZG9jLCB2c2NvZGVSYW5nZXMsIGRhdGFUcmFuc2ZlciwgdG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgc2VuZCBiYWNrIHZhbHVlcyB0aGF0IGhhdmUgYmVlbiBhZGRlZCB0byB0aGUgZGF0YSB0cmFuc2ZlclxuXHRcdGNvbnN0IG5ld0VudHJpZXMgPSBBcnJheS5mcm9tKGRhdGFUcmFuc2ZlcikuZmlsdGVyKChbLCB2YWx1ZV0pID0+ICEodmFsdWUgaW5zdGFuY2VvZiBJbnRlcm5hbERhdGFUcmFuc2Zlckl0ZW0pKTtcblxuXHRcdC8vIFN0b3JlIG9mZiBvcmlnaW5hbCBkYXRhIHRyYW5zZmVyIGl0ZW1zIHNvIHdlIGNhbiByZXRyaWV2ZSB0aGVtIG9uIHBhc3RlXG5cdFx0Y29uc3QgbmV3Q2FjaGUgPSBuZXcgTWFwPHN0cmluZywgdnNjb2RlLkRhdGFUcmFuc2Zlckl0ZW0+KCk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IFByb21pc2UuYWxsKEFycmF5LmZyb20obmV3RW50cmllcywgYXN5bmMgKFttaW1lLCB2YWx1ZV0pID0+IHtcblx0XHRcdGNvbnN0IGlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRuZXdDYWNoZS5zZXQoaWQsIHZhbHVlKTtcblx0XHRcdHJldHVybiBbbWltZSwgYXdhaXQgdHlwZUNvbnZlcnQuRGF0YVRyYW5zZmVySXRlbS5mcm9tKG1pbWUsIHZhbHVlLCBpZCldIGFzIGNvbnN0O1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NhY2hlZFByZXBhcmUgPSBuZXdDYWNoZTtcblxuXHRcdHJldHVybiB7IGl0ZW1zIH07XG5cdH1cblxuXHRhc3luYyBwcm92aWRlUGFzdGVFZGl0cyhyZXF1ZXN0SWQ6IG51bWJlciwgcmVzb3VyY2U6IFVSSSwgcmFuZ2VzOiBJUmFuZ2VbXSwgZGF0YVRyYW5zZmVyRHRvOiBleHRIb3N0UHJvdG9jb2wuRGF0YVRyYW5zZmVyRFRPLCBjb250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSURvY3VtZW50UGFzdGVDb250ZXh0RHRvLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JUGFzdGVFZGl0RHRvW10+IHtcblx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHZzY29kZVJhbmdlcyA9IHJhbmdlcy5tYXAocmFuZ2UgPT4gdHlwZUNvbnZlcnQuUmFuZ2UudG8ocmFuZ2UpKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gZGF0YVRyYW5zZmVyRHRvLml0ZW1zLm1hcCgoW21pbWUsIHZhbHVlXSk6IFtzdHJpbmcsIHZzY29kZS5EYXRhVHJhbnNmZXJJdGVtXSA9PiB7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9jYWNoZWRQcmVwYXJlPy5nZXQodmFsdWUuaWQpO1xuXHRcdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gW21pbWUsIGNhY2hlZF07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdG1pbWUsXG5cdFx0XHRcdHR5cGVDb252ZXJ0LkRhdGFUcmFuc2Zlckl0ZW0udG8obWltZSwgdmFsdWUsIGFzeW5jIGlkID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX3Byb3h5LiRyZXNvbHZlUGFzdGVGaWxlRGF0YSh0aGlzLl9oYW5kbGUsIHJlcXVlc3RJZCwgaWQpKS5idWZmZXI7XG5cdFx0XHRcdH0pXG5cdFx0XHRdO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGF0YVRyYW5zZmVyID0gbmV3IERhdGFUcmFuc2ZlcihpdGVtcyk7XG5cblx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMoZG9jLCB2c2NvZGVSYW5nZXMsIGRhdGFUcmFuc2Zlciwge1xuXHRcdFx0b25seTogY29udGV4dC5vbmx5ID8gbmV3IERvY3VtZW50RHJvcE9yUGFzdGVFZGl0S2luZChjb250ZXh0Lm9ubHkpIDogdW5kZWZpbmVkLFxuXHRcdFx0dHJpZ2dlcktpbmQ6IGNvbnRleHQudHJpZ2dlcktpbmQsXG5cdFx0fSwgdG9rZW4pO1xuXHRcdGlmICghZWRpdHMgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZUlkID0gdGhpcy5fZWRpdHNDYWNoZS5hZGQoZWRpdHMpO1xuXG5cdFx0cmV0dXJuIGVkaXRzLm1hcCgoZWRpdCwgaSk6IGV4dEhvc3RQcm90b2NvbC5JUGFzdGVFZGl0RHRvID0+ICh7XG5cdFx0XHRfY2FjaGVJZDogW2NhY2hlSWQsIGldLFxuXHRcdFx0dGl0bGU6IGVkaXQudGl0bGUgPz8gbG9jYWxpemUoJ2RlZmF1bHRQYXN0ZUxhYmVsJywgXCJQYXN0ZSB1c2luZyAnezB9JyBleHRlbnNpb25cIiwgdGhpcy5fZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IHRoaXMuX2V4dGVuc2lvbi5uYW1lKSxcblx0XHRcdGtpbmQ6IGVkaXQua2luZCxcblx0XHRcdHlpZWxkVG86IGVkaXQueWllbGRUbz8ubWFwKHggPT4geC52YWx1ZSksXG5cdFx0XHRpbnNlcnRUZXh0OiB0eXBlb2YgZWRpdC5pbnNlcnRUZXh0ID09PSAnc3RyaW5nJyA/IGVkaXQuaW5zZXJ0VGV4dCA6IHsgc25pcHBldDogZWRpdC5pbnNlcnRUZXh0LnZhbHVlIH0sXG5cdFx0XHRhZGRpdGlvbmFsRWRpdDogZWRpdC5hZGRpdGlvbmFsRWRpdCA/IHR5cGVDb252ZXJ0LldvcmtzcGFjZUVkaXQuZnJvbShlZGl0LmFkZGl0aW9uYWxFZGl0LCB1bmRlZmluZWQpIDogdW5kZWZpbmVkLFxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVQYXN0ZUVkaXQoaWQ6IGV4dEhvc3RQcm90b2NvbC5DaGFpbmVkQ2FjaGVJZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGluc2VydFRleHQ/OiBzdHJpbmcgfCB2c2NvZGUuU25pcHBldFN0cmluZzsgYWRkaXRpb25hbEVkaXQ/OiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG8gfT4ge1xuXHRcdGNvbnN0IFtzZXNzaW9uSWQsIGl0ZW1JZF0gPSBpZDtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fZWRpdHNDYWNoZS5nZXQoc2Vzc2lvbklkLCBpdGVtSWQpO1xuXHRcdGlmICghaXRlbSB8fCAhdGhpcy5fcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50UGFzdGVFZGl0KSB7XG5cdFx0XHRyZXR1cm4ge307IC8vIHRoaXMgc2hvdWxkIG5vdCBoYXBwZW4uLi5cblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZEl0ZW0gPSAoYXdhaXQgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50UGFzdGVFZGl0KGl0ZW0sIHRva2VuKSkgPz8gaXRlbTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5zZXJ0VGV4dDogcmVzb2x2ZWRJdGVtLmluc2VydFRleHQsXG5cdFx0XHRhZGRpdGlvbmFsRWRpdDogcmVzb2x2ZWRJdGVtLmFkZGl0aW9uYWxFZGl0ID8gdHlwZUNvbnZlcnQuV29ya3NwYWNlRWRpdC5mcm9tKHJlc29sdmVkSXRlbS5hZGRpdGlvbmFsRWRpdCwgdW5kZWZpbmVkKSA6IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cblxuXHRyZWxlYXNlUGFzdGVFZGl0cyhpZDogbnVtYmVyKTogYW55IHtcblx0XHR0aGlzLl9lZGl0c0NhY2hlLmRlbGV0ZShpZCk7XG5cdH1cbn1cblxuY2xhc3MgRG9jdW1lbnRGb3JtYXR0aW5nQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZURvY3VtZW50Rm9ybWF0dGluZ0VkaXRzKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IGxhbmd1YWdlcy5Gb3JtYXR0aW5nT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoZG9jdW1lbnQsIDxhbnk+b3B0aW9ucywgdG9rZW4pO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLm1hcCh0eXBlQ29udmVydC5UZXh0RWRpdC5mcm9tKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBSYW5nZUZvcm1hdHRpbmdBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlclxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzKHJlc291cmNlOiBVUkksIHJhbmdlOiBJUmFuZ2UsIG9wdGlvbnM6IGxhbmd1YWdlcy5Gb3JtYXR0aW5nT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJhbiA9IHR5cGVDb252ZXJ0LlJhbmdlLnRvKHJhbmdlKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdHMoZG9jdW1lbnQsIHJhbiwgPGFueT5vcHRpb25zLCB0b2tlbik7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKHR5cGVDb252ZXJ0LlRleHRFZGl0LmZyb20pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzKHJlc291cmNlOiBVUkksIHJhbmdlczogSVJhbmdlW10sIG9wdGlvbnM6IGxhbmd1YWdlcy5Gb3JtYXR0aW5nT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGFzc2VydFR5cGUodHlwZW9mIHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFJhbmdlc0Zvcm1hdHRpbmdFZGl0cyA9PT0gJ2Z1bmN0aW9uJywgJ0lOVkFMSUQgaW52b2NhdGlvbiBvZiBgcHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzYCcpO1xuXG5cdFx0Y29uc3QgZG9jdW1lbnQgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IF9yYW5nZXMgPSA8UmFuZ2VbXT5yYW5nZXMubWFwKHR5cGVDb252ZXJ0LlJhbmdlLnRvKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFJhbmdlc0Zvcm1hdHRpbmdFZGl0cyhkb2N1bWVudCwgX3JhbmdlcywgPGFueT5vcHRpb25zLCB0b2tlbik7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUubWFwKHR5cGVDb252ZXJ0LlRleHRFZGl0LmZyb20pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIE9uVHlwZUZvcm1hdHRpbmdBZGFwdGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5PblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXV0b0Zvcm1hdFRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSA9IFtdOyAvLyBub3QgaGVyZVxuXG5cdGFzeW5jIHByb3ZpZGVPblR5cGVGb3JtYXR0aW5nRWRpdHMocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgY2g6IHN0cmluZywgb3B0aW9uczogbGFuZ3VhZ2VzLkZvcm1hdHRpbmdPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlT25UeXBlRm9ybWF0dGluZ0VkaXRzKGRvY3VtZW50LCBwb3MsIGNoLCA8YW55Pm9wdGlvbnMsIHRva2VuKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5tYXAodHlwZUNvbnZlcnQuVGV4dEVkaXQuZnJvbSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgTmF2aWdhdGVUeXBlQWRhcHRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgQ2FjaGU8dnNjb2RlLlN5bWJvbEluZm9ybWF0aW9uPignV29ya3NwYWNlU3ltYm9scycpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlV29ya3NwYWNlU3ltYm9scyhzZWFyY2g6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZVN5bWJvbHNEdG8+IHtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVXb3Jrc3BhY2VTeW1ib2xzKHNlYXJjaCwgdG9rZW4pO1xuXG5cdFx0aWYgKCFpc05vbkVtcHR5QXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4geyBzeW1ib2xzOiBbXSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpZCA9IHRoaXMuX2NhY2hlLmFkZCh2YWx1ZSk7XG5cdFx0Y29uc3QgcmVzdWx0OiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZVN5bWJvbHNEdG8gPSB7XG5cdFx0XHRjYWNoZUlkOiBzaWQsXG5cdFx0XHRzeW1ib2xzOiBbXVxuXHRcdH07XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdmFsdWVbaV07XG5cdFx0XHRpZiAoIWl0ZW0gfHwgIWl0ZW0ubmFtZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0lOVkFMSUQgU3ltYm9sSW5mb3JtYXRpb24nLCBpdGVtKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQuc3ltYm9scy5wdXNoKHtcblx0XHRcdFx0Li4udHlwZUNvbnZlcnQuV29ya3NwYWNlU3ltYm9sLmZyb20oaXRlbSksXG5cdFx0XHRcdGNhY2hlSWQ6IFtzaWQsIGldXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVdvcmtzcGFjZVN5bWJvbChzeW1ib2w6IGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlU3ltYm9sRHRvLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlU3ltYm9sRHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9wcm92aWRlci5yZXNvbHZlV29ya3NwYWNlU3ltYm9sICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm4gc3ltYm9sO1xuXHRcdH1cblx0XHRpZiAoIXN5bWJvbC5jYWNoZUlkKSB7XG5cdFx0XHRyZXR1cm4gc3ltYm9sO1xuXHRcdH1cblx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2FjaGUuZ2V0KC4uLnN5bWJvbC5jYWNoZUlkKTtcblx0XHRpZiAoaXRlbSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5yZXNvbHZlV29ya3NwYWNlU3ltYm9sKGl0ZW0sIHRva2VuKTtcblx0XHRcdHJldHVybiB2YWx1ZSAmJiBtaXhpbihzeW1ib2wsIHR5cGVDb252ZXJ0LldvcmtzcGFjZVN5bWJvbC5mcm9tKHZhbHVlKSwgdHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZWxlYXNlV29ya3NwYWNlU3ltYm9scyhpZDogbnVtYmVyKTogYW55IHtcblx0XHR0aGlzLl9jYWNoZS5kZWxldGUoaWQpO1xuXHR9XG59XG5cbmNsYXNzIFJlbmFtZUFkYXB0ZXIge1xuXG5cdHN0YXRpYyBzdXBwb3J0c1Jlc29sdmluZyhwcm92aWRlcjogdnNjb2RlLlJlbmFtZVByb3ZpZGVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHR5cGVvZiBwcm92aWRlci5wcmVwYXJlUmVuYW1lID09PSAnZnVuY3Rpb24nO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuUmVuYW1lUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlUmVuYW1lRWRpdHMocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgbmV3TmFtZTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0byAmIGxhbmd1YWdlcy5SZWplY3Rpb24gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZVJlbmFtZUVkaXRzKGRvYywgcG9zLCBuZXdOYW1lLCB0b2tlbik7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHlwZUNvbnZlcnQuV29ya3NwYWNlRWRpdC5mcm9tKHZhbHVlKTtcblxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgcmVqZWN0UmVhc29uID0gUmVuYW1lQWRhcHRlci5fYXNNZXNzYWdlKGVycik7XG5cdFx0XHRpZiAocmVqZWN0UmVhc29uKSB7XG5cdFx0XHRcdHJldHVybiB7IHJlamVjdFJlYXNvbiwgZWRpdHM6IHVuZGVmaW5lZCEgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGdlbmVyaWMgZXJyb3Jcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0PGV4dEhvc3RQcm90b2NvbC5JV29ya3NwYWNlRWRpdER0bz4oZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNvbHZlUmVuYW1lTG9jYXRpb24ocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTwobGFuZ3VhZ2VzLlJlbmFtZUxvY2F0aW9uICYgbGFuZ3VhZ2VzLlJlamVjdGlvbikgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodHlwZW9mIHRoaXMuX3Byb3ZpZGVyLnByZXBhcmVSZW5hbWUgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByYW5nZU9yTG9jYXRpb24gPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcmVwYXJlUmVuYW1lKGRvYywgcG9zLCB0b2tlbik7XG5cblx0XHRcdGxldCByYW5nZTogdnNjb2RlLlJhbmdlIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChSYW5nZS5pc1JhbmdlKHJhbmdlT3JMb2NhdGlvbikpIHtcblx0XHRcdFx0cmFuZ2UgPSByYW5nZU9yTG9jYXRpb247XG5cdFx0XHRcdHRleHQgPSBkb2MuZ2V0VGV4dChyYW5nZU9yTG9jYXRpb24pO1xuXG5cdFx0XHR9IGVsc2UgaWYgKGlzT2JqZWN0KHJhbmdlT3JMb2NhdGlvbikpIHtcblx0XHRcdFx0cmFuZ2UgPSByYW5nZU9yTG9jYXRpb24ucmFuZ2U7XG5cdFx0XHRcdHRleHQgPSByYW5nZU9yTG9jYXRpb24ucGxhY2Vob2xkZXI7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghcmFuZ2UgfHwgIXRleHQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChyYW5nZS5zdGFydC5saW5lID4gcG9zLmxpbmUgfHwgcmFuZ2UuZW5kLmxpbmUgPCBwb3MubGluZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0lOVkFMSUQgcmVuYW1lIGxvY2F0aW9uOiBwb3NpdGlvbiBsaW5lIG11c3QgYmUgd2l0aGluIHJhbmdlIHN0YXJ0L2VuZCBsaW5lcycpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgcmFuZ2U6IHR5cGVDb252ZXJ0LlJhbmdlLmZyb20ocmFuZ2UpLCB0ZXh0IH07XG5cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IHJlamVjdFJlYXNvbiA9IFJlbmFtZUFkYXB0ZXIuX2FzTWVzc2FnZShlcnIpO1xuXHRcdFx0aWYgKHJlamVjdFJlYXNvbikge1xuXHRcdFx0XHRyZXR1cm4geyByZWplY3RSZWFzb24sIHJhbmdlOiB1bmRlZmluZWQhLCB0ZXh0OiB1bmRlZmluZWQhIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3Q8YW55PihlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9hc01lc3NhZ2UoZXJyOiBhbnkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgZXJyID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGVycjtcblx0XHR9IGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yICYmIHR5cGVvZiBlcnIubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBlcnIubWVzc2FnZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgTmV3U3ltYm9sTmFtZXNBZGFwdGVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyBsYW5ndWFnZVRyaWdnZXJLaW5kVG9WU0NvZGVUcmlnZ2VyS2luZDogUmVjb3JkPGxhbmd1YWdlcy5OZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIHZzY29kZS5OZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQ+ID0ge1xuXHRcdFtsYW5ndWFnZXMuTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLkludm9rZV06IE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZC5JbnZva2UsXG5cdFx0W2xhbmd1YWdlcy5OZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQuQXV0b21hdGljXTogTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLkF1dG9tYXRpYyxcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5OZXdTeW1ib2xOYW1lc1Byb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkgeyB9XG5cblx0YXN5bmMgc3VwcG9ydHNBdXRvbWF0aWNOZXdTeW1ib2xOYW1lc1RyaWdnZXJLaW5kKCkge1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlci5zdXBwb3J0c0F1dG9tYXRpY1RyaWdnZXJLaW5kO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZU5ld1N5bWJvbE5hbWVzKHJlc291cmNlOiBVUkksIHJhbmdlOiBJUmFuZ2UsIHRyaWdnZXJLaW5kOiBsYW5ndWFnZXMuTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5OZXdTeW1ib2xOYW1lW10gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUmFuZ2UudG8ocmFuZ2UpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGtpbmQgPSBOZXdTeW1ib2xOYW1lc0FkYXB0ZXIubGFuZ3VhZ2VUcmlnZ2VyS2luZFRvVlNDb2RlVHJpZ2dlcktpbmRbdHJpZ2dlcktpbmRdO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlTmV3U3ltYm9sTmFtZXMoZG9jLCBwb3MsIGtpbmQsIHRva2VuKTtcblx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWx1ZS5tYXAodiA9PlxuXHRcdFx0XHR0eXBlb2YgdiA9PT0gJ3N0cmluZycgLyogQHVsdWdiZWtuYTogZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgYmVjYXVzZSBgdmFsdWVgIHVzZWQgdG8gYmUganVzdCBgc3RyaW5nW11gICovXG5cdFx0XHRcdFx0PyB7IG5ld1N5bWJvbE5hbWU6IHYgfVxuXHRcdFx0XHRcdDogeyBuZXdTeW1ib2xOYW1lOiB2Lm5ld1N5bWJvbE5hbWUsIHRhZ3M6IHYudGFncyB9XG5cdFx0XHQpO1xuXHRcdH0gY2F0Y2ggKGVycjogdW5rbm93bikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihOZXdTeW1ib2xOYW1lc0FkYXB0ZXIuX2FzTWVzc2FnZShlcnIpID8/IEpTT04uc3RyaW5naWZ5KGVyciwgbnVsbCwgJ1xcdCcpIC8qIEB1bHVnYmVrbmE6IGFzc3VtaW5nIGBlcnJgIGRvZXNuJ3QgaGF2ZSBjaXJjdWxhciByZWZlcmVuY2VzIHRoYXQgY291bGQgcmVzdWx0IGluIGFuIGV4Y2VwdGlvbiB3aGVuIGNvbnZlcnRpbmcgdG8gSlNPTiAqLyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8vIEB1bHVnYmVrbmE6IHRoaXMgbWV0aG9kIGlzIGFsc28gZGVmaW5lZCBpbiBSZW5hbWVBZGFwdGVyIGJ1dCBzZWVtcyBPSyB0byBiZSBkdXBsaWNhdGVkXG5cdHByaXZhdGUgc3RhdGljIF9hc01lc3NhZ2UoZXJyOiBhbnkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgZXJyID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGVycjtcblx0XHR9IGVsc2UgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yICYmIHR5cGVvZiBlcnIubWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBlcnIubWVzc2FnZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgU2VtYW50aWNUb2tlbnNQcmV2aW91c1Jlc3VsdCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgdG9rZW5zPzogVWludDMyQXJyYXksXG5cdCkgeyB9XG59XG5cbnR5cGUgUmVsYXhlZFNlbWFudGljVG9rZW5zID0geyByZWFkb25seSByZXN1bHRJZD86IHN0cmluZzsgcmVhZG9ubHkgZGF0YTogbnVtYmVyW10gfTtcbnR5cGUgUmVsYXhlZFNlbWFudGljVG9rZW5zRWRpdCA9IHsgcmVhZG9ubHkgc3RhcnQ6IG51bWJlcjsgcmVhZG9ubHkgZGVsZXRlQ291bnQ6IG51bWJlcjsgcmVhZG9ubHkgZGF0YT86IG51bWJlcltdIH07XG50eXBlIFJlbGF4ZWRTZW1hbnRpY1Rva2Vuc0VkaXRzID0geyByZWFkb25seSByZXN1bHRJZD86IHN0cmluZzsgcmVhZG9ubHkgZWRpdHM6IFJlbGF4ZWRTZW1hbnRpY1Rva2Vuc0VkaXRbXSB9O1xuXG50eXBlIFByb3ZpZGVkU2VtYW50aWNUb2tlbnMgPSB2c2NvZGUuU2VtYW50aWNUb2tlbnMgfCBSZWxheGVkU2VtYW50aWNUb2tlbnM7XG50eXBlIFByb3ZpZGVkU2VtYW50aWNUb2tlbnNFZGl0cyA9IHZzY29kZS5TZW1hbnRpY1Rva2Vuc0VkaXRzIHwgUmVsYXhlZFNlbWFudGljVG9rZW5zRWRpdHM7XG5cbmNsYXNzIERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aW91c1Jlc3VsdHM6IE1hcDxudW1iZXIsIFNlbWFudGljVG9rZW5zUHJldmlvdXNSZXN1bHQ+O1xuXHRwcml2YXRlIF9uZXh0UmVzdWx0SWQgPSAxO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcixcblx0KSB7XG5cdFx0dGhpcy5fcHJldmlvdXNSZXN1bHRzID0gbmV3IE1hcDxudW1iZXIsIFNlbWFudGljVG9rZW5zUHJldmlvdXNSZXN1bHQ+KCk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2VucyhyZXNvdXJjZTogVVJJLCBwcmV2aW91c1Jlc3VsdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VlNCdWZmZXIgfCBudWxsPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwcmV2aW91c1Jlc3VsdCA9IChwcmV2aW91c1Jlc3VsdElkICE9PSAwID8gdGhpcy5fcHJldmlvdXNSZXN1bHRzLmdldChwcmV2aW91c1Jlc3VsdElkKSA6IG51bGwpO1xuXHRcdGxldCB2YWx1ZSA9IHR5cGVvZiBwcmV2aW91c1Jlc3VsdD8ucmVzdWx0SWQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiB0aGlzLl9wcm92aWRlci5wcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0VkaXRzID09PSAnZnVuY3Rpb24nXG5cdFx0XHQ/IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zRWRpdHMoZG9jLCBwcmV2aW91c1Jlc3VsdC5yZXN1bHRJZCwgdG9rZW4pXG5cdFx0XHQ6IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zKGRvYywgdG9rZW4pO1xuXG5cdFx0aWYgKHByZXZpb3VzUmVzdWx0KSB7XG5cdFx0XHR0aGlzLl9wcmV2aW91c1Jlc3VsdHMuZGVsZXRlKHByZXZpb3VzUmVzdWx0SWQpO1xuXHRcdH1cblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0dmFsdWUgPSBEb2N1bWVudFNlbWFudGljVG9rZW5zQWRhcHRlci5fZml4UHJvdmlkZWRTZW1hbnRpY1Rva2Vucyh2YWx1ZSk7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmQoRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIuX2NvbnZlcnRUb0VkaXRzKHByZXZpb3VzUmVzdWx0LCB2YWx1ZSksIHZhbHVlKTtcblx0fVxuXG5cdGFzeW5jIHJlbGVhc2VEb2N1bWVudFNlbWFudGljQ29sb3Jpbmcoc2VtYW50aWNDb2xvcmluZ1Jlc3VsdElkOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9wcmV2aW91c1Jlc3VsdHMuZGVsZXRlKHNlbWFudGljQ29sb3JpbmdSZXN1bHRJZCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZml4UHJvdmlkZWRTZW1hbnRpY1Rva2Vucyh2OiBQcm92aWRlZFNlbWFudGljVG9rZW5zIHwgUHJvdmlkZWRTZW1hbnRpY1Rva2Vuc0VkaXRzKTogdnNjb2RlLlNlbWFudGljVG9rZW5zIHwgdnNjb2RlLlNlbWFudGljVG9rZW5zRWRpdHMge1xuXHRcdGlmIChEb2N1bWVudFNlbWFudGljVG9rZW5zQWRhcHRlci5faXNTZW1hbnRpY1Rva2Vucyh2KSkge1xuXHRcdFx0aWYgKERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyLl9pc0NvcnJlY3RTZW1hbnRpY1Rva2Vucyh2KSkge1xuXHRcdFx0XHRyZXR1cm4gdjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgU2VtYW50aWNUb2tlbnMobmV3IFVpbnQzMkFycmF5KHYuZGF0YSksIHYucmVzdWx0SWQpO1xuXHRcdH0gZWxzZSBpZiAoRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIuX2lzU2VtYW50aWNUb2tlbnNFZGl0cyh2KSkge1xuXHRcdFx0aWYgKERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyLl9pc0NvcnJlY3RTZW1hbnRpY1Rva2Vuc0VkaXRzKHYpKSB7XG5cdFx0XHRcdHJldHVybiB2O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBTZW1hbnRpY1Rva2Vuc0VkaXRzKHYuZWRpdHMubWFwKGVkaXQgPT4gbmV3IFNlbWFudGljVG9rZW5zRWRpdChlZGl0LnN0YXJ0LCBlZGl0LmRlbGV0ZUNvdW50LCBlZGl0LmRhdGEgPyBuZXcgVWludDMyQXJyYXkoZWRpdC5kYXRhKSA6IGVkaXQuZGF0YSkpLCB2LnJlc3VsdElkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHY7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNTZW1hbnRpY1Rva2Vucyh2OiBQcm92aWRlZFNlbWFudGljVG9rZW5zIHwgUHJvdmlkZWRTZW1hbnRpY1Rva2Vuc0VkaXRzKTogdiBpcyBQcm92aWRlZFNlbWFudGljVG9rZW5zIHtcblx0XHRyZXR1cm4gdiAmJiAhISgodiBhcyBQcm92aWRlZFNlbWFudGljVG9rZW5zKS5kYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc0NvcnJlY3RTZW1hbnRpY1Rva2Vucyh2OiBQcm92aWRlZFNlbWFudGljVG9rZW5zKTogdiBpcyB2c2NvZGUuU2VtYW50aWNUb2tlbnMge1xuXHRcdHJldHVybiAodi5kYXRhIGluc3RhbmNlb2YgVWludDMyQXJyYXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lzU2VtYW50aWNUb2tlbnNFZGl0cyh2OiBQcm92aWRlZFNlbWFudGljVG9rZW5zIHwgUHJvdmlkZWRTZW1hbnRpY1Rva2Vuc0VkaXRzKTogdiBpcyBQcm92aWRlZFNlbWFudGljVG9rZW5zRWRpdHMge1xuXHRcdHJldHVybiB2ICYmIEFycmF5LmlzQXJyYXkoKHYgYXMgUHJvdmlkZWRTZW1hbnRpY1Rva2Vuc0VkaXRzKS5lZGl0cyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNDb3JyZWN0U2VtYW50aWNUb2tlbnNFZGl0cyh2OiBQcm92aWRlZFNlbWFudGljVG9rZW5zRWRpdHMpOiB2IGlzIHZzY29kZS5TZW1hbnRpY1Rva2Vuc0VkaXRzIHtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2Ygdi5lZGl0cykge1xuXHRcdFx0aWYgKCEoZWRpdC5kYXRhIGluc3RhbmNlb2YgVWludDMyQXJyYXkpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29udmVydFRvRWRpdHMocHJldmlvdXNSZXN1bHQ6IFNlbWFudGljVG9rZW5zUHJldmlvdXNSZXN1bHQgfCBudWxsIHwgdW5kZWZpbmVkLCBuZXdSZXN1bHQ6IHZzY29kZS5TZW1hbnRpY1Rva2VucyB8IHZzY29kZS5TZW1hbnRpY1Rva2Vuc0VkaXRzKTogdnNjb2RlLlNlbWFudGljVG9rZW5zIHwgdnNjb2RlLlNlbWFudGljVG9rZW5zRWRpdHMge1xuXHRcdGlmICghRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIuX2lzU2VtYW50aWNUb2tlbnMobmV3UmVzdWx0KSkge1xuXHRcdFx0cmV0dXJuIG5ld1Jlc3VsdDtcblx0XHR9XG5cdFx0aWYgKCFwcmV2aW91c1Jlc3VsdCB8fCAhcHJldmlvdXNSZXN1bHQudG9rZW5zKSB7XG5cdFx0XHRyZXR1cm4gbmV3UmVzdWx0O1xuXHRcdH1cblx0XHRjb25zdCBvbGREYXRhID0gcHJldmlvdXNSZXN1bHQudG9rZW5zO1xuXHRcdGNvbnN0IG9sZExlbmd0aCA9IG9sZERhdGEubGVuZ3RoO1xuXHRcdGNvbnN0IG5ld0RhdGEgPSBuZXdSZXN1bHQuZGF0YTtcblx0XHRjb25zdCBuZXdMZW5ndGggPSBuZXdEYXRhLmxlbmd0aDtcblxuXHRcdGxldCBjb21tb25QcmVmaXhMZW5ndGggPSAwO1xuXHRcdGNvbnN0IG1heENvbW1vblByZWZpeExlbmd0aCA9IE1hdGgubWluKG9sZExlbmd0aCwgbmV3TGVuZ3RoKTtcblx0XHR3aGlsZSAoY29tbW9uUHJlZml4TGVuZ3RoIDwgbWF4Q29tbW9uUHJlZml4TGVuZ3RoICYmIG9sZERhdGFbY29tbW9uUHJlZml4TGVuZ3RoXSA9PT0gbmV3RGF0YVtjb21tb25QcmVmaXhMZW5ndGhdKSB7XG5cdFx0XHRjb21tb25QcmVmaXhMZW5ndGgrKztcblx0XHR9XG5cblx0XHRpZiAoY29tbW9uUHJlZml4TGVuZ3RoID09PSBvbGRMZW5ndGggJiYgY29tbW9uUHJlZml4TGVuZ3RoID09PSBuZXdMZW5ndGgpIHtcblx0XHRcdC8vIGNvbXBsZXRlIG92ZXJsYXAhXG5cdFx0XHRyZXR1cm4gbmV3IFNlbWFudGljVG9rZW5zRWRpdHMoW10sIG5ld1Jlc3VsdC5yZXN1bHRJZCk7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbW1vblN1ZmZpeExlbmd0aCA9IDA7XG5cdFx0Y29uc3QgbWF4Q29tbW9uU3VmZml4TGVuZ3RoID0gbWF4Q29tbW9uUHJlZml4TGVuZ3RoIC0gY29tbW9uUHJlZml4TGVuZ3RoO1xuXHRcdHdoaWxlIChjb21tb25TdWZmaXhMZW5ndGggPCBtYXhDb21tb25TdWZmaXhMZW5ndGggJiYgb2xkRGF0YVtvbGRMZW5ndGggLSBjb21tb25TdWZmaXhMZW5ndGggLSAxXSA9PT0gbmV3RGF0YVtuZXdMZW5ndGggLSBjb21tb25TdWZmaXhMZW5ndGggLSAxXSkge1xuXHRcdFx0Y29tbW9uU3VmZml4TGVuZ3RoKys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBTZW1hbnRpY1Rva2Vuc0VkaXRzKFt7XG5cdFx0XHRzdGFydDogY29tbW9uUHJlZml4TGVuZ3RoLFxuXHRcdFx0ZGVsZXRlQ291bnQ6IChvbGRMZW5ndGggLSBjb21tb25QcmVmaXhMZW5ndGggLSBjb21tb25TdWZmaXhMZW5ndGgpLFxuXHRcdFx0ZGF0YTogbmV3RGF0YS5zdWJhcnJheShjb21tb25QcmVmaXhMZW5ndGgsIG5ld0xlbmd0aCAtIGNvbW1vblN1ZmZpeExlbmd0aClcblx0XHR9XSwgbmV3UmVzdWx0LnJlc3VsdElkKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbmQodmFsdWU6IHZzY29kZS5TZW1hbnRpY1Rva2VucyB8IHZzY29kZS5TZW1hbnRpY1Rva2Vuc0VkaXRzLCBvcmlnaW5hbDogdnNjb2RlLlNlbWFudGljVG9rZW5zIHwgdnNjb2RlLlNlbWFudGljVG9rZW5zRWRpdHMpOiBWU0J1ZmZlciB8IG51bGwge1xuXHRcdGlmIChEb2N1bWVudFNlbWFudGljVG9rZW5zQWRhcHRlci5faXNTZW1hbnRpY1Rva2Vucyh2YWx1ZSkpIHtcblx0XHRcdGNvbnN0IG15SWQgPSB0aGlzLl9uZXh0UmVzdWx0SWQrKztcblx0XHRcdHRoaXMuX3ByZXZpb3VzUmVzdWx0cy5zZXQobXlJZCwgbmV3IFNlbWFudGljVG9rZW5zUHJldmlvdXNSZXN1bHQodmFsdWUucmVzdWx0SWQsIHZhbHVlLmRhdGEpKTtcblx0XHRcdHJldHVybiBlbmNvZGVTZW1hbnRpY1Rva2Vuc0R0byh7XG5cdFx0XHRcdGlkOiBteUlkLFxuXHRcdFx0XHR0eXBlOiAnZnVsbCcsXG5cdFx0XHRcdGRhdGE6IHZhbHVlLmRhdGFcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChEb2N1bWVudFNlbWFudGljVG9rZW5zQWRhcHRlci5faXNTZW1hbnRpY1Rva2Vuc0VkaXRzKHZhbHVlKSkge1xuXHRcdFx0Y29uc3QgbXlJZCA9IHRoaXMuX25leHRSZXN1bHRJZCsrO1xuXHRcdFx0aWYgKERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyLl9pc1NlbWFudGljVG9rZW5zKG9yaWdpbmFsKSkge1xuXHRcdFx0XHQvLyBzdG9yZSB0aGUgb3JpZ2luYWxcblx0XHRcdFx0dGhpcy5fcHJldmlvdXNSZXN1bHRzLnNldChteUlkLCBuZXcgU2VtYW50aWNUb2tlbnNQcmV2aW91c1Jlc3VsdChvcmlnaW5hbC5yZXN1bHRJZCwgb3JpZ2luYWwuZGF0YSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fcHJldmlvdXNSZXN1bHRzLnNldChteUlkLCBuZXcgU2VtYW50aWNUb2tlbnNQcmV2aW91c1Jlc3VsdCh2YWx1ZS5yZXN1bHRJZCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGVuY29kZVNlbWFudGljVG9rZW5zRHRvKHtcblx0XHRcdFx0aWQ6IG15SWQsXG5cdFx0XHRcdHR5cGU6ICdkZWx0YScsXG5cdFx0XHRcdGRlbHRhczogKHZhbHVlLmVkaXRzIHx8IFtdKS5tYXAoZWRpdCA9PiAoeyBzdGFydDogZWRpdC5zdGFydCwgZGVsZXRlQ291bnQ6IGVkaXQuZGVsZXRlQ291bnQsIGRhdGE6IGVkaXQuZGF0YSB9KSlcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmNsYXNzIERvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnMocmVzb3VyY2U6IFVSSSwgcmFuZ2U6IElSYW5nZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxWU0J1ZmZlciB8IG51bGw+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZURvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vucyhkb2MsIHR5cGVDb252ZXJ0LlJhbmdlLnRvKHJhbmdlKSwgdG9rZW4pO1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2VuZCh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kKHZhbHVlOiB2c2NvZGUuU2VtYW50aWNUb2tlbnMpOiBWU0J1ZmZlciB7XG5cdFx0cmV0dXJuIGVuY29kZVNlbWFudGljVG9rZW5zRHRvKHtcblx0XHRcdGlkOiAwLFxuXHRcdFx0dHlwZTogJ2Z1bGwnLFxuXHRcdFx0ZGF0YTogdmFsdWUuZGF0YVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIENvbXBsZXRpb25zQWRhcHRlciB7XG5cblx0c3RhdGljIHN1cHBvcnRzUmVzb2x2aW5nKHByb3ZpZGVyOiB2c2NvZGUuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0eXBlb2YgcHJvdmlkZXIucmVzb2x2ZUNvbXBsZXRpb25JdGVtID09PSAnZnVuY3Rpb24nO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FjaGUgPSBuZXcgQ2FjaGU8dnNjb2RlLkNvbXBsZXRpb25JdGVtPignQ29tcGxldGlvbkl0ZW0nKTtcblx0cHJpdmF0ZSBfZGlzcG9zYWJsZXMgPSBuZXcgTWFwPG51bWJlciwgRGlzcG9zYWJsZVN0b3JlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kczogQ29tbWFuZHNDb252ZXJ0ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Db21wbGV0aW9uSXRlbVByb3ZpZGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FwaURlcHJlY2F0aW9uOiBJRXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlQ29tcGxldGlvbkl0ZW1zKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3RSZXN1bHREdG8gfCB1bmRlZmluZWQ+IHtcblxuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0Ly8gVGhlIGRlZmF1bHQgaW5zZXJ0L3JlcGxhY2UgcmFuZ2VzLiBJdCdzIGltcG9ydGFudCB0byBjb21wdXRlIHRoZW1cblx0XHQvLyBiZWZvcmUgYXN5bmNocm9ub3VzbHkgYXNraW5nIHRoZSBwcm92aWRlciBmb3IgaXRzIHJlc3VsdHMuIFNlZVxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy84MzQwMCNpc3N1ZWNvbW1lbnQtNTQ2ODUxNDIxXG5cdFx0Y29uc3QgcmVwbGFjZVJhbmdlID0gZG9jLmdldFdvcmRSYW5nZUF0UG9zaXRpb24ocG9zKSB8fCBuZXcgUmFuZ2UocG9zLCBwb3MpO1xuXHRcdGNvbnN0IGluc2VydFJhbmdlID0gcmVwbGFjZVJhbmdlLndpdGgoeyBlbmQ6IHBvcyB9KTtcblxuXHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdGNvbnN0IGl0ZW1zT3JMaXN0ID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcywgdG9rZW4sIHR5cGVDb252ZXJ0LkNvbXBsZXRpb25Db250ZXh0LnRvKGNvbnRleHQpKTtcblxuXHRcdGlmICghaXRlbXNPckxpc3QpIHtcblx0XHRcdC8vIHVuZGVmaW5lZCBhbmQgbnVsbCBhcmUgdmFsaWQgcmVzdWx0c1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdC8vIGNhbmNlbGxlZCAtPiByZXR1cm4gd2l0aG91dCBmdXJ0aGVyIGFkbywgZXNwIG5vIGNhY2hpbmdcblx0XHRcdC8vIG9mIHJlc3VsdHMgYXMgdGhleSB3aWxsIGxlYWtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdCA9IEFycmF5LmlzQXJyYXkoaXRlbXNPckxpc3QpID8gbmV3IENvbXBsZXRpb25MaXN0KGl0ZW1zT3JMaXN0KSA6IGl0ZW1zT3JMaXN0O1xuXG5cdFx0Ly8ga2VlcCByZXN1bHQgZm9yIHByb3ZpZGVycyB0aGF0IHN1cHBvcnQgcmVzb2x2aW5nXG5cdFx0Y29uc3QgcGlkOiBudW1iZXIgPSBDb21wbGV0aW9uc0FkYXB0ZXIuc3VwcG9ydHNSZXNvbHZpbmcodGhpcy5fcHJvdmlkZXIpID8gdGhpcy5fY2FjaGUuYWRkKGxpc3QuaXRlbXMpIDogdGhpcy5fY2FjaGUuYWRkKFtdKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5zZXQocGlkLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBjb21wbGV0aW9uczogZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b1tdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0OiBleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3RSZXN1bHREdG8gPSB7XG5cdFx0XHR4OiBwaWQsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0UmVzdWx0RHRvRmllbGQuY29tcGxldGlvbnNdOiBjb21wbGV0aW9ucyxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3RSZXN1bHREdG9GaWVsZC5kZWZhdWx0UmFuZ2VzXTogeyByZXBsYWNlOiB0eXBlQ29udmVydC5SYW5nZS5mcm9tKHJlcGxhY2VSYW5nZSksIGluc2VydDogdHlwZUNvbnZlcnQuUmFuZ2UuZnJvbShpbnNlcnRSYW5nZSkgfSxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3RSZXN1bHREdG9GaWVsZC5pc0luY29tcGxldGVdOiBsaXN0LmlzSW5jb21wbGV0ZSB8fCB1bmRlZmluZWQsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0UmVzdWx0RHRvRmllbGQuZHVyYXRpb25dOiBzdy5lbGFwc2VkKClcblx0XHR9O1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaXN0Lml0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gbGlzdC5pdGVtc1tpXTtcblx0XHRcdC8vIGNoZWNrIGZvciBiYWQgY29tcGxldGlvbiBpdGVtIGZpcnN0XG5cdFx0XHRjb25zdCBkdG8gPSB0aGlzLl9jb252ZXJ0Q29tcGxldGlvbkl0ZW0oaXRlbSwgW3BpZCwgaV0sIGluc2VydFJhbmdlLCByZXBsYWNlUmFuZ2UpO1xuXHRcdFx0Y29tcGxldGlvbnMucHVzaChkdG8pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlQ29tcGxldGlvbkl0ZW0oaWQ6IGV4dEhvc3RQcm90b2NvbC5DaGFpbmVkQ2FjaGVJZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRpZiAodHlwZW9mIHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVDb21wbGV0aW9uSXRlbSAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2FjaGUuZ2V0KC4uLmlkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHRvMSA9IHRoaXMuX2NvbnZlcnRDb21wbGV0aW9uSXRlbShpdGVtLCBpZCk7XG5cblx0XHRjb25zdCByZXNvbHZlZEl0ZW0gPSBhd2FpdCB0aGlzLl9wcm92aWRlci5yZXNvbHZlQ29tcGxldGlvbkl0ZW0oaXRlbSwgdG9rZW4pO1xuXG5cdFx0aWYgKCFyZXNvbHZlZEl0ZW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHRvMiA9IHRoaXMuX2NvbnZlcnRDb21wbGV0aW9uSXRlbShyZXNvbHZlZEl0ZW0sIGlkKTtcblxuXHRcdGlmIChkdG8xW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0XSAhPT0gZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dF1cblx0XHRcdHx8IGR0bzFbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRSdWxlc10gIT09IGR0bzJbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRSdWxlc11cblx0XHQpIHtcblx0XHRcdHRoaXMuX2FwaURlcHJlY2F0aW9uLnJlcG9ydCgnQ29tcGxldGlvbkl0ZW0uaW5zZXJ0VGV4dCcsIHRoaXMuX2V4dGVuc2lvbiwgJ2V4dGVuc2lvbiBNQVkgTk9UIGNoYW5nZSBcXCdpbnNlcnRUZXh0XFwnIG9mIGEgQ29tcGxldGlvbkl0ZW0gZHVyaW5nIHJlc29sdmUnKTtcblx0XHR9XG5cblx0XHRpZiAoZHRvMVtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkZW50XSAhPT0gZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkZW50XVxuXHRcdFx0fHwgZHRvMVtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkXSAhPT0gZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkXVxuXHRcdFx0fHwgIWVxdWFscyhkdG8xW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5jb21tYW5kQXJndW1lbnRzXSwgZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZEFyZ3VtZW50c10pXG5cdFx0KSB7XG5cdFx0XHR0aGlzLl9hcGlEZXByZWNhdGlvbi5yZXBvcnQoJ0NvbXBsZXRpb25JdGVtLmNvbW1hbmQnLCB0aGlzLl9leHRlbnNpb24sICdleHRlbnNpb24gTUFZIE5PVCBjaGFuZ2UgXFwnY29tbWFuZFxcJyBvZiBhIENvbXBsZXRpb25JdGVtIGR1cmluZyByZXNvbHZlJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmR0bzEsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmRvY3VtZW50YXRpb25dOiBkdG8yW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5kb2N1bWVudGF0aW9uXSxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuZGV0YWlsXTogZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuZGV0YWlsXSxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuYWRkaXRpb25hbFRleHRFZGl0c106IGR0bzJbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmFkZGl0aW9uYWxUZXh0RWRpdHNdLFxuXG5cdFx0XHQvLyAoZmlzaHkpIGFzeW5jIGluc2VydFRleHRcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dF06IGR0bzJbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRdLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0UnVsZXNdOiBkdG8yW2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0UnVsZXNdLFxuXG5cdFx0XHQvLyAoZmlzaHkpIGFzeW5jIGNvbW1hbmRcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkZW50XTogZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkZW50XSxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkXTogZHRvMltleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkXSxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZEFyZ3VtZW50c106IGR0bzJbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmNvbW1hbmRBcmd1bWVudHNdLFxuXHRcdH07XG5cdH1cblxuXHRyZWxlYXNlQ29tcGxldGlvbkl0ZW1zKGlkOiBudW1iZXIpOiBhbnkge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmdldChpZCk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kZWxldGUoaWQpO1xuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShpZCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb252ZXJ0Q29tcGxldGlvbkl0ZW0oaXRlbTogdnNjb2RlLkNvbXBsZXRpb25JdGVtLCBpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCBkZWZhdWx0SW5zZXJ0UmFuZ2U/OiB2c2NvZGUuUmFuZ2UsIGRlZmF1bHRSZXBsYWNlUmFuZ2U/OiB2c2NvZGUuUmFuZ2UpOiBleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvIHtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fZGlzcG9zYWJsZXMuZ2V0KGlkWzBdKTtcblx0XHRpZiAoIWRpc3Bvc2FibGVzKSB7XG5cdFx0XHR0aHJvdyBFcnJvcignRGlzcG9zYWJsZVN0b3JlIGlzIG1pc3NpbmcuLi4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fY29tbWFuZHMudG9JbnRlcm5hbChpdGVtLmNvbW1hbmQsIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCByZXN1bHQ6IGV4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG8gPSB7XG5cdFx0XHQvL1xuXHRcdFx0eDogaWQsXG5cdFx0XHQvL1xuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5sYWJlbF06IGl0ZW0ubGFiZWwsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmtpbmRdOiBpdGVtLmtpbmQgIT09IHVuZGVmaW5lZCA/IHR5cGVDb252ZXJ0LkNvbXBsZXRpb25JdGVtS2luZC5mcm9tKGl0ZW0ua2luZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmtpbmRNb2RpZmllcl06IGl0ZW0udGFncyAmJiBpdGVtLnRhZ3MubWFwKHR5cGVDb252ZXJ0LkNvbXBsZXRpb25JdGVtVGFnLmZyb20pLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5kZXRhaWxdOiBpdGVtLmRldGFpbCxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuZG9jdW1lbnRhdGlvbl06IHR5cGVvZiBpdGVtLmRvY3VtZW50YXRpb24gPT09ICd1bmRlZmluZWQnID8gdW5kZWZpbmVkIDogdHlwZUNvbnZlcnQuTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChpdGVtLmRvY3VtZW50YXRpb24pLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5zb3J0VGV4dF06IGl0ZW0uc29ydFRleHQgIT09IGl0ZW0ubGFiZWwgPyBpdGVtLnNvcnRUZXh0IDogdW5kZWZpbmVkLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5maWx0ZXJUZXh0XTogaXRlbS5maWx0ZXJUZXh0ICE9PSBpdGVtLmxhYmVsID8gaXRlbS5maWx0ZXJUZXh0IDogdW5kZWZpbmVkLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5wcmVzZWxlY3RdOiBpdGVtLnByZXNlbGVjdCB8fCB1bmRlZmluZWQsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRSdWxlc106IGl0ZW0ua2VlcFdoaXRlc3BhY2UgPyBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5LZWVwV2hpdGVzcGFjZSA6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLk5vbmUsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmNvbW1pdENoYXJhY3RlcnNdOiBpdGVtLmNvbW1pdENoYXJhY3RlcnM/LmpvaW4oJycpLFxuXHRcdFx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5hZGRpdGlvbmFsVGV4dEVkaXRzXTogaXRlbS5hZGRpdGlvbmFsVGV4dEVkaXRzICYmIGl0ZW0uYWRkaXRpb25hbFRleHRFZGl0cy5tYXAodHlwZUNvbnZlcnQuVGV4dEVkaXQuZnJvbSksXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmNvbW1hbmRJZGVudF06IGNvbW1hbmQ/LiRpZGVudCxcblx0XHRcdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkXTogY29tbWFuZD8uaWQsXG5cdFx0XHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmNvbW1hbmRBcmd1bWVudHNdOiBjb21tYW5kPy4kaWRlbnQgPyB1bmRlZmluZWQgOiBjb21tYW5kPy5hcmd1bWVudHMsIC8vIGZpbGxlZCBpbiBvbiBtYWluIHNpZGUgZnJvbSAkaWRlbnRcblx0XHR9O1xuXG5cdFx0Ly8gJ2luc2VydFRleHQnLWxvZ2ljXG5cdFx0aWYgKGl0ZW0udGV4dEVkaXQpIHtcblx0XHRcdHRoaXMuX2FwaURlcHJlY2F0aW9uLnJlcG9ydCgnQ29tcGxldGlvbkl0ZW0udGV4dEVkaXQnLCB0aGlzLl9leHRlbnNpb24sIGBVc2UgJ0NvbXBsZXRpb25JdGVtLmluc2VydFRleHQnIGFuZCAnQ29tcGxldGlvbkl0ZW0ucmFuZ2UnIGluc3RlYWQuYCk7XG5cdFx0XHRyZXN1bHRbZXh0SG9zdFByb3RvY29sLklTdWdnZXN0RGF0YUR0b0ZpZWxkLmluc2VydFRleHRdID0gaXRlbS50ZXh0RWRpdC5uZXdUZXh0O1xuXG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgaXRlbS5pbnNlcnRUZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmVzdWx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0XSA9IGl0ZW0uaW5zZXJ0VGV4dDtcblxuXHRcdH0gZWxzZSBpZiAoaXRlbS5pbnNlcnRUZXh0IGluc3RhbmNlb2YgU25pcHBldFN0cmluZykge1xuXHRcdFx0cmVzdWx0W2V4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG9GaWVsZC5pbnNlcnRUZXh0XSA9IGl0ZW0uaW5zZXJ0VGV4dC52YWx1ZTtcblx0XHRcdHJlc3VsdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dFJ1bGVzXSEgfD0gbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuSW5zZXJ0QXNTbmlwcGV0O1xuXHRcdH1cblxuXHRcdC8vICdvdmVyd3JpdGVbQmVmb3JlfEFmdGVyXSctbG9naWNcblx0XHRsZXQgcmFuZ2U6IHZzY29kZS5SYW5nZSB8IHsgaW5zZXJ0aW5nOiB2c2NvZGUuUmFuZ2U7IHJlcGxhY2luZzogdnNjb2RlLlJhbmdlIH0gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGl0ZW0udGV4dEVkaXQpIHtcblx0XHRcdHJhbmdlID0gaXRlbS50ZXh0RWRpdC5yYW5nZTtcblx0XHR9IGVsc2UgaWYgKGl0ZW0ucmFuZ2UpIHtcblx0XHRcdHJhbmdlID0gaXRlbS5yYW5nZTtcblx0XHR9XG5cblx0XHRpZiAoUmFuZ2UuaXNSYW5nZShyYW5nZSkpIHtcblx0XHRcdC8vIFwib2xkXCIgcmFuZ2Vcblx0XHRcdHJlc3VsdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQucmFuZ2VdID0gdHlwZUNvbnZlcnQuUmFuZ2UuZnJvbShyYW5nZSk7XG5cblx0XHR9IGVsc2UgaWYgKHJhbmdlICYmICghZGVmYXVsdEluc2VydFJhbmdlPy5pc0VxdWFsKHJhbmdlLmluc2VydGluZykgfHwgIWRlZmF1bHRSZXBsYWNlUmFuZ2U/LmlzRXF1YWwocmFuZ2UucmVwbGFjaW5nKSkpIHtcblx0XHRcdC8vIE9OTFkgc2VuZCByYW5nZSB3aGVuIGl0J3MgZGlmZmVyZW50IGZyb20gdGhlIGRlZmF1bHQgcmFuZ2VzIChzYWZlIGJhbmR3aWR0aClcblx0XHRcdHJlc3VsdFtleHRIb3N0UHJvdG9jb2wuSVN1Z2dlc3REYXRhRHRvRmllbGQucmFuZ2VdID0ge1xuXHRcdFx0XHRpbnNlcnQ6IHR5cGVDb252ZXJ0LlJhbmdlLmZyb20ocmFuZ2UuaW5zZXJ0aW5nKSxcblx0XHRcdFx0cmVwbGFjZTogdHlwZUNvbnZlcnQuUmFuZ2UuZnJvbShyYW5nZS5yZXBsYWNpbmcpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgSW5saW5lQ29tcGxldGlvbkFkYXB0ZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWZlcmVuY2VzID0gbmV3IFJlZmVyZW5jZU1hcDx7XG5cdFx0ZGlzcG9zZSgpOiB2b2lkO1xuXHRcdGl0ZW1zOiByZWFkb25seSB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkl0ZW1bXTtcblx0XHRsaXN0OiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkxpc3QgfCB1bmRlZmluZWQ7XG5cdH0+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkl0ZW1Qcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kczogQ29tbWFuZHNDb252ZXJ0ZXIsXG5cdCkge1xuXHRcdHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkID0gaXNQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnaW5saW5lQ29tcGxldGlvbnNBZGRpdGlvbnMnKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc3VwcG9ydHNIYW5kbGVFdmVudHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzUHJvcG9zZWRBcGlFbmFibGVkKHRoaXMuX2V4dGVuc2lvbiwgJ2lubGluZUNvbXBsZXRpb25zQWRkaXRpb25zJylcblx0XHRcdCYmICh0eXBlb2YgdGhpcy5fcHJvdmlkZXIuaGFuZGxlRGlkU2hvd0NvbXBsZXRpb25JdGVtID09PSAnZnVuY3Rpb24nXG5cdFx0XHRcdHx8IHR5cGVvZiB0aGlzLl9wcm92aWRlci5oYW5kbGVEaWRQYXJ0aWFsbHlBY2NlcHRDb21wbGV0aW9uSXRlbSA9PT0gJ2Z1bmN0aW9uJ1xuXHRcdFx0XHR8fCB0eXBlb2YgdGhpcy5fcHJvdmlkZXIuaGFuZGxlRGlkUmVqZWN0Q29tcGxldGlvbkl0ZW0gPT09ICdmdW5jdGlvbidcblx0XHRcdFx0fHwgdHlwZW9mIHRoaXMuX3Byb3ZpZGVyLmhhbmRsZUVuZE9mTGlmZXRpbWUgPT09ICdmdW5jdGlvbidcblx0XHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHN1cHBvcnRzU2V0TW9kZWxJZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNQcm9wb3NlZEFwaUVuYWJsZWQodGhpcy5fZXh0ZW5zaW9uLCAnaW5saW5lQ29tcGxldGlvbnNBZGRpdGlvbnMnKVxuXHRcdFx0JiYgdHlwZW9mIHRoaXMuX3Byb3ZpZGVyLnNldEN1cnJlbnRNb2RlbElkID09PSAnZnVuY3Rpb24nO1xuXHR9XG5cblx0cHVibGljIGdldCBzdXBwb3J0c1NldFByb3ZpZGVyT3B0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1Byb3Bvc2VkQXBpRW5hYmxlZCh0aGlzLl9leHRlbnNpb24sICdpbmxpbmVDb21wbGV0aW9uc0FkZGl0aW9ucycpXG5cdFx0XHQmJiB0eXBlb2YgdGhpcy5fcHJvdmlkZXIuc2V0UHJvdmlkZXJPcHRpb25WYWx1ZSA9PT0gJ2Z1bmN0aW9uJztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VUcmlnZ2VyS2luZFRvVlNDb2RlVHJpZ2dlcktpbmQ6IFJlY29yZDxsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLCBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQ+ID0ge1xuXHRcdFtsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvblRyaWdnZXJLaW5kLkF1dG9tYXRpY106IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5BdXRvbWF0aWMsXG5cdFx0W2xhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuRXhwbGljaXRdOiBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlLFxuXHR9O1xuXG5cdHB1YmxpYyBnZXQgbW9kZWxJbmZvKCk6IGV4dEhvc3RQcm90b2NvbC5JSW5saW5lQ29tcGxldGlvbk1vZGVsSW5mb0R0byB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVyLm1vZGVsSW5mbyA/IHtcblx0XHRcdG1vZGVsczogdGhpcy5fcHJvdmlkZXIubW9kZWxJbmZvLm1vZGVscyxcblx0XHRcdGN1cnJlbnRNb2RlbElkOiB0aGlzLl9wcm92aWRlci5tb2RlbEluZm8uY3VycmVudE1vZGVsSWRcblx0XHR9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0c2V0Q3VycmVudE1vZGVsSWQobW9kZWxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcm92aWRlci5zZXRDdXJyZW50TW9kZWxJZD8uKG1vZGVsSWQpO1xuXHR9XG5cblx0cHVibGljIGdldCBwcm92aWRlck9wdGlvbnMoKTogcmVhZG9ubHkgZXh0SG9zdFByb3RvY29sLklJbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJPcHRpb25EdG9bXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVyT3B0aW9ucz8ubWFwKG8gPT4gKHtcblx0XHRcdGlkOiBvLmlkLFxuXHRcdFx0bGFiZWw6IG8ubGFiZWwsXG5cdFx0XHR2YWx1ZXM6IG8udmFsdWVzLm1hcCh2ID0+ICh7IGlkOiB2LmlkLCBsYWJlbDogdi5sYWJlbCB9KSksXG5cdFx0XHRjdXJyZW50VmFsdWVJZDogby5jdXJyZW50VmFsdWVJZCxcblx0XHR9KSk7XG5cdH1cblxuXHRzZXRQcm92aWRlck9wdGlvbihvcHRpb25JZDogc3RyaW5nLCB2YWx1ZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3ZpZGVyLnNldFByb3ZpZGVyT3B0aW9uVmFsdWU/LihvcHRpb25JZCwgdmFsdWVJZCk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlSW5saW5lQ29tcGxldGlvbnMocmVzb3VyY2U6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9ucyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24udG8ocG9zaXRpb24pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUlubGluZUNvbXBsZXRpb25JdGVtcyhkb2MsIHBvcywge1xuXHRcdFx0c2VsZWN0ZWRDb21wbGV0aW9uSW5mbzpcblx0XHRcdFx0Y29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvXG5cdFx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0XHRyYW5nZTogdHlwZUNvbnZlcnQuUmFuZ2UudG8oY29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvLnJhbmdlKSxcblx0XHRcdFx0XHRcdHRleHQ6IGNvbnRleHQuc2VsZWN0ZWRTdWdnZXN0aW9uSW5mby50ZXh0XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0dHJpZ2dlcktpbmQ6IHRoaXMubGFuZ3VhZ2VUcmlnZ2VyS2luZFRvVlNDb2RlVHJpZ2dlcktpbmRbY29udGV4dC50cmlnZ2VyS2luZF0sXG5cdFx0XHRyZXF1ZXN0VXVpZDogY29udGV4dC5yZXF1ZXN0VXVpZCxcblx0XHRcdHJlcXVlc3RJc3N1ZWREYXRlVGltZTogY29udGV4dC5yZXF1ZXN0SXNzdWVkRGF0ZVRpbWUsXG5cdFx0XHRlYXJsaWVzdFNob3duRGF0ZVRpbWU6IGNvbnRleHQuZWFybGllc3RTaG93bkRhdGVUaW1lLFxuXHRcdFx0Y2hhbmdlSGludDogY29udGV4dC5jaGFuZ2VIaW50LFxuXHRcdH0sIHRva2VuKTtcblxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHQvLyB1bmRlZmluZWQgYW5kIG51bGwgYXJlIHZhbGlkIHJlc3VsdHNcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyByZXN1bHRJdGVtcywgbGlzdCB9ID0gQXJyYXkuaXNBcnJheShyZXN1bHQpID8geyByZXN1bHRJdGVtczogcmVzdWx0LCBsaXN0OiB1bmRlZmluZWQgfSA6IHsgcmVzdWx0SXRlbXM6IHJlc3VsdC5pdGVtcywgbGlzdDogcmVzdWx0IH07XG5cdFx0Y29uc3QgY29tbWFuZHMgPSB0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCA/IEFycmF5LmlzQXJyYXkocmVzdWx0KSA/IFtdIDogcmVzdWx0LmNvbW1hbmRzIHx8IFtdIDogW107XG5cdFx0Y29uc3QgZW5hYmxlRm9yd2FyZFN0YWJpbGl0eSA9IHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkICYmICFBcnJheS5pc0FycmF5KHJlc3VsdCkgPyByZXN1bHQuZW5hYmxlRm9yd2FyZFN0YWJpbGl0eSA6IHVuZGVmaW5lZDtcblxuXHRcdGxldCBkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwaWQgPSB0aGlzLl9yZWZlcmVuY2VzLmNyZWF0ZVJlZmVyZW5jZUlkKHtcblx0XHRcdGRpc3Bvc2UoKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVTdG9yZT8uZGlzcG9zZSgpO1xuXHRcdFx0fSxcblx0XHRcdGl0ZW1zOiByZXN1bHRJdGVtcyxcblx0XHRcdGxpc3QsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpdGVtcyA9IHtcblx0XHRcdHBpZCxcblx0XHRcdGxhbmd1YWdlSWQ6IGRvYy5sYW5ndWFnZUlkLFxuXHRcdFx0aXRlbXM6IHJlc3VsdEl0ZW1zLm1hcDxleHRIb3N0UHJvdG9jb2wuSWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbj4oKGl0ZW0sIGlkeCkgPT4ge1xuXHRcdFx0XHRsZXQgY29tbWFuZDogbGFuZ3VhZ2VzLkNvbW1hbmQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChpdGVtLmNvbW1hbmQpIHtcblx0XHRcdFx0XHRpZiAoIWRpc3Bvc2FibGVTdG9yZSkge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb21tYW5kID0gdGhpcy5fY29tbWFuZHMudG9JbnRlcm5hbChpdGVtLmNvbW1hbmQsIGRpc3Bvc2FibGVTdG9yZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgYWN0aW9uOiBsYW5ndWFnZXMuQ29tbWFuZCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGl0ZW0uYWN0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKCFkaXNwb3NhYmxlU3RvcmUpIHtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWN0aW9uID0gdGhpcy5fY29tbWFuZHMudG9JbnRlcm5hbChpdGVtLmFjdGlvbiwgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGluc2VydFRleHQgPSBpdGVtLmluc2VydFRleHQ7XG5cdFx0XHRcdHJldHVybiAoe1xuXHRcdFx0XHRcdGluc2VydFRleHQ6IGluc2VydFRleHQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6ICh0eXBlb2YgaW5zZXJ0VGV4dCA9PT0gJ3N0cmluZycgPyBpbnNlcnRUZXh0IDogeyBzbmlwcGV0OiBpbnNlcnRUZXh0LnZhbHVlIH0pLFxuXHRcdFx0XHRcdHJhbmdlOiBpdGVtLnJhbmdlID8gdHlwZUNvbnZlcnQuUmFuZ2UuZnJvbShpdGVtLnJhbmdlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzaG93UmFuZ2U6ICh0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCAmJiBpdGVtLnNob3dSYW5nZSkgPyB0eXBlQ29udmVydC5SYW5nZS5mcm9tKGl0ZW0uc2hvd1JhbmdlKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb21tYW5kLFxuXHRcdFx0XHRcdGd1dHRlck1lbnVMaW5rQWN0aW9uOiBhY3Rpb24sXG5cdFx0XHRcdFx0cGlkOiBwaWQsXG5cdFx0XHRcdFx0aWR4OiBpZHgsXG5cdFx0XHRcdFx0Y29tcGxldGVCcmFja2V0UGFpcnM6IHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkID8gaXRlbS5jb21wbGV0ZUJyYWNrZXRQYWlycyA6IGZhbHNlLFxuXHRcdFx0XHRcdGlzSW5saW5lRWRpdDogdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgPyBpdGVtLmlzSW5saW5lRWRpdCA6IGZhbHNlLFxuXHRcdFx0XHRcdHNob3dJbmxpbmVFZGl0TWVudTogdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgPyBpdGVtLnNob3dJbmxpbmVFZGl0TWVudSA6IGZhbHNlLFxuXHRcdFx0XHRcdGhpbnQ6IChpdGVtLmRpc3BsYXlMb2NhdGlvbiAmJiB0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCkgPyB7XG5cdFx0XHRcdFx0XHRyYW5nZTogdHlwZUNvbnZlcnQuUmFuZ2UuZnJvbShpdGVtLmRpc3BsYXlMb2NhdGlvbi5yYW5nZSksXG5cdFx0XHRcdFx0XHRjb250ZW50OiBpdGVtLmRpc3BsYXlMb2NhdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdHN0eWxlOiBpdGVtLmRpc3BsYXlMb2NhdGlvbi5raW5kID8gdHlwZUNvbnZlcnQuSW5saW5lQ29tcGxldGlvbkhpbnRTdHlsZS5mcm9tKGl0ZW0uZGlzcGxheUxvY2F0aW9uLmtpbmQpIDogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25IaW50U3R5bGUuQ29kZSxcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHdhcm5pbmc6IChpdGVtLndhcm5pbmcgJiYgdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQpID8ge1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogdHlwZUNvbnZlcnQuTWFya2Rvd25TdHJpbmcuZnJvbShpdGVtLndhcm5pbmcubWVzc2FnZSksXG5cdFx0XHRcdFx0XHRpY29uOiBpdGVtLndhcm5pbmcuaWNvbiA/IHR5cGVDb252ZXJ0Lkljb25QYXRoLmZyb21UaGVtZUljb24oaXRlbS53YXJuaW5nLmljb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Y29ycmVsYXRpb25JZDogdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgPyBpdGVtLmNvcnJlbGF0aW9uSWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJpOiAodGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgJiYgaXRlbS51cmkpID8gaXRlbS51cmkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c3VwcG9ydHNSZW5hbWU6IHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkID8gaXRlbS5zdXBwb3J0c1JlbmFtZSA6IGZhbHNlLFxuXHRcdFx0XHRcdGp1bXBUb1Bvc2l0aW9uOiAodGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQgJiYgaXRlbS5qdW1wVG9Qb3NpdGlvbikgPyB0eXBlQ29udmVydC5Qb3NpdGlvbi5mcm9tKGl0ZW0uanVtcFRvUG9zaXRpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pLFxuXHRcdFx0Y29tbWFuZHM6IGNvbW1hbmRzLm1hcChjID0+IHtcblx0XHRcdFx0aWYgKCFkaXNwb3NhYmxlU3RvcmUpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHR5cGVDb252ZXJ0LkNvbXBsZXRpb25Db21tYW5kLmZyb20oYywgdGhpcy5fY29tbWFuZHMsIGRpc3Bvc2FibGVTdG9yZSk7XG5cdFx0XHR9KSxcblx0XHRcdHN1cHByZXNzU3VnZ2VzdGlvbnM6IGZhbHNlLFxuXHRcdFx0ZW5hYmxlRm9yd2FyZFN0YWJpbGl0eSxcblx0XHR9IHNhdGlzZmllcyBleHRIb3N0UHJvdG9jb2wuSWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbnM7XG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblx0ZGlzcG9zZUNvbXBsZXRpb25zKHBpZDogbnVtYmVyLCByZWFzb246IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb24pIHtcblx0XHRjb25zdCBjb21wbGV0aW9uTGlzdCA9IHRoaXMuX3JlZmVyZW5jZXMuZ2V0KHBpZCk7XG5cdFx0aWYgKHRoaXMuX3Byb3ZpZGVyLmhhbmRsZUxpc3RFbmRPZkxpZmV0aW1lICYmIHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkICYmIGNvbXBsZXRpb25MaXN0Py5saXN0KSB7XG5cdFx0XHRmdW5jdGlvbiB0cmFuc2xhdGVSZWFzb24ocmVhc29uOiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uKTogdnNjb2RlLklubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbiB7XG5cdFx0XHRcdHN3aXRjaCAocmVhc29uLmtpbmQpIHtcblx0XHRcdFx0XHRjYXNlICdsb3N0UmFjZSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiBJbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb25LaW5kLkxvc3RSYWNlIH07XG5cdFx0XHRcdFx0Y2FzZSAndG9rZW5DYW5jZWxsYXRpb24nOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uS2luZC5Ub2tlbkNhbmNlbGxhdGlvbiB9O1xuXHRcdFx0XHRcdGNhc2UgJ290aGVyJzpcblx0XHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6IElubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbktpbmQuT3RoZXIgfTtcblx0XHRcdFx0XHRjYXNlICdlbXB0eSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiBJbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb25LaW5kLkVtcHR5IH07XG5cdFx0XHRcdFx0Y2FzZSAnbm90VGFrZW4nOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHsga2luZDogSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uS2luZC5Ob3RUYWtlbiB9O1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiBJbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb25LaW5kLk90aGVyIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcHJvdmlkZXIuaGFuZGxlTGlzdEVuZE9mTGlmZXRpbWUoY29tcGxldGlvbkxpc3QubGlzdCwgdHJhbnNsYXRlUmVhc29uKHJlYXNvbikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9yZWZlcmVuY2VzLmRpc3Bvc2VSZWZlcmVuY2VJZChwaWQpO1xuXHRcdGRhdGE/LmRpc3Bvc2UoKTtcblx0fVxuXG5cdGhhbmRsZURpZFNob3dDb21wbGV0aW9uSXRlbShwaWQ6IG51bWJlciwgaWR4OiBudW1iZXIsIHVwZGF0ZWRJbnNlcnRUZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wbGV0aW9uSXRlbSA9IHRoaXMuX3JlZmVyZW5jZXMuZ2V0KHBpZCk/Lml0ZW1zW2lkeF07XG5cdFx0aWYgKGNvbXBsZXRpb25JdGVtKSB7XG5cdFx0XHRpZiAodGhpcy5fcHJvdmlkZXIuaGFuZGxlRGlkU2hvd0NvbXBsZXRpb25JdGVtICYmIHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyLmhhbmRsZURpZFNob3dDb21wbGV0aW9uSXRlbShjb21wbGV0aW9uSXRlbSwgdXBkYXRlZEluc2VydFRleHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGhhbmRsZVBhcnRpYWxBY2NlcHQocGlkOiBudW1iZXIsIGlkeDogbnVtYmVyLCBhY2NlcHRlZENoYXJhY3RlcnM6IG51bWJlciwgaW5mbzogbGFuZ3VhZ2VzLlBhcnRpYWxBY2NlcHRJbmZvKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcGxldGlvbkl0ZW0gPSB0aGlzLl9yZWZlcmVuY2VzLmdldChwaWQpPy5pdGVtc1tpZHhdO1xuXHRcdGlmIChjb21wbGV0aW9uSXRlbSkge1xuXHRcdFx0aWYgKHRoaXMuX3Byb3ZpZGVyLmhhbmRsZURpZFBhcnRpYWxseUFjY2VwdENvbXBsZXRpb25JdGVtICYmIHRoaXMuX2lzQWRkaXRpb25zUHJvcG9zZWRBcGlFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyLmhhbmRsZURpZFBhcnRpYWxseUFjY2VwdENvbXBsZXRpb25JdGVtKGNvbXBsZXRpb25JdGVtLCBhY2NlcHRlZENoYXJhY3RlcnMpO1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlci5oYW5kbGVEaWRQYXJ0aWFsbHlBY2NlcHRDb21wbGV0aW9uSXRlbShjb21wbGV0aW9uSXRlbSwgdHlwZUNvbnZlcnQuUGFydGlhbEFjY2VwdEluZm8udG8oaW5mbykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGhhbmRsZUVuZE9mTGlmZXRpbWUocGlkOiBudW1iZXIsIGlkeDogbnVtYmVyLCByZWFzb246IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uPHsgcGlkOiBudW1iZXI7IGlkeDogbnVtYmVyIH0+KTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcGxldGlvbkl0ZW0gPSB0aGlzLl9yZWZlcmVuY2VzLmdldChwaWQpPy5pdGVtc1tpZHhdO1xuXHRcdGlmIChjb21wbGV0aW9uSXRlbSkge1xuXHRcdFx0aWYgKHRoaXMuX3Byb3ZpZGVyLmhhbmRsZUVuZE9mTGlmZXRpbWUgJiYgdGhpcy5faXNBZGRpdGlvbnNQcm9wb3NlZEFwaUVuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3QgciA9IHR5cGVDb252ZXJ0LklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb24udG8ocmVhc29uLCByZWYgPT4gdGhpcy5fcmVmZXJlbmNlcy5nZXQocmVmLnBpZCk/Lml0ZW1zW3JlZi5pZHhdKTtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXIuaGFuZGxlRW5kT2ZMaWZldGltZShjb21wbGV0aW9uSXRlbSwgcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aGFuZGxlUmVqZWN0aW9uKHBpZDogbnVtYmVyLCBpZHg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXBsZXRpb25JdGVtID0gdGhpcy5fcmVmZXJlbmNlcy5nZXQocGlkKT8uaXRlbXNbaWR4XTtcblx0XHRpZiAoY29tcGxldGlvbkl0ZW0pIHtcblx0XHRcdGlmICh0aGlzLl9wcm92aWRlci5oYW5kbGVEaWRSZWplY3RDb21wbGV0aW9uSXRlbSAmJiB0aGlzLl9pc0FkZGl0aW9uc1Byb3Bvc2VkQXBpRW5hYmxlZCkge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlci5oYW5kbGVEaWRSZWplY3RDb21wbGV0aW9uSXRlbShjb21wbGV0aW9uSXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFJlZmVyZW5jZU1hcDxUPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZmVyZW5jZXMgPSBuZXcgTWFwPG51bWJlciwgVD4oKTtcblx0cHJpdmF0ZSBfaWRQb29sID0gMTtcblxuXHRjcmVhdGVSZWZlcmVuY2VJZCh2YWx1ZTogVCk6IG51bWJlciB7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9pZFBvb2wrKztcblx0XHR0aGlzLl9yZWZlcmVuY2VzLnNldChpZCwgdmFsdWUpO1xuXHRcdHJldHVybiBpZDtcblx0fVxuXG5cdGRpc3Bvc2VSZWZlcmVuY2VJZChyZWZlcmVuY2VJZDogbnVtYmVyKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9yZWZlcmVuY2VzLmdldChyZWZlcmVuY2VJZCk7XG5cdFx0dGhpcy5fcmVmZXJlbmNlcy5kZWxldGUocmVmZXJlbmNlSWQpO1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdGdldChyZWZlcmVuY2VJZDogbnVtYmVyKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZmVyZW5jZXMuZ2V0KHJlZmVyZW5jZUlkKTtcblx0fVxufVxuXG5jbGFzcyBTaWduYXR1cmVIZWxwQWRhcHRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgQ2FjaGU8dnNjb2RlLlNpZ25hdHVyZUhlbHA+KCdTaWduYXR1cmVIZWxwJyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuU2lnbmF0dXJlSGVscFByb3ZpZGVyLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVTaWduYXR1cmVIZWxwKHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIGNvbnRleHQ6IGV4dEhvc3RQcm90b2NvbC5JU2lnbmF0dXJlSGVscENvbnRleHREdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklTaWduYXR1cmVIZWxwRHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZG9jID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cdFx0Y29uc3QgdnNjb2RlQ29udGV4dCA9IHRoaXMucmV2aXZlQ29udGV4dChjb250ZXh0KTtcblxuXHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZVNpZ25hdHVyZUhlbHAoZG9jLCBwb3MsIHRva2VuLCB2c2NvZGVDb250ZXh0KTtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdGNvbnN0IGlkID0gdGhpcy5fY2FjaGUuYWRkKFt2YWx1ZV0pO1xuXHRcdFx0cmV0dXJuIHsgLi4udHlwZUNvbnZlcnQuU2lnbmF0dXJlSGVscC5mcm9tKHZhbHVlKSwgaWQgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmV2aXZlQ29udGV4dChjb250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSVNpZ25hdHVyZUhlbHBDb250ZXh0RHRvKTogdnNjb2RlLlNpZ25hdHVyZUhlbHBDb250ZXh0IHtcblx0XHRsZXQgYWN0aXZlU2lnbmF0dXJlSGVscDogdnNjb2RlLlNpZ25hdHVyZUhlbHAgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbnRleHQuYWN0aXZlU2lnbmF0dXJlSGVscCkge1xuXHRcdFx0Y29uc3QgcmV2aXZlZFNpZ25hdHVyZUhlbHAgPSB0eXBlQ29udmVydC5TaWduYXR1cmVIZWxwLnRvKGNvbnRleHQuYWN0aXZlU2lnbmF0dXJlSGVscCk7XG5cdFx0XHRjb25zdCBzYXZlZCA9IHRoaXMuX2NhY2hlLmdldChjb250ZXh0LmFjdGl2ZVNpZ25hdHVyZUhlbHAuaWQsIDApO1xuXHRcdFx0aWYgKHNhdmVkKSB7XG5cdFx0XHRcdGFjdGl2ZVNpZ25hdHVyZUhlbHAgPSBzYXZlZDtcblx0XHRcdFx0YWN0aXZlU2lnbmF0dXJlSGVscC5hY3RpdmVTaWduYXR1cmUgPSByZXZpdmVkU2lnbmF0dXJlSGVscC5hY3RpdmVTaWduYXR1cmU7XG5cdFx0XHRcdGFjdGl2ZVNpZ25hdHVyZUhlbHAuYWN0aXZlUGFyYW1ldGVyID0gcmV2aXZlZFNpZ25hdHVyZUhlbHAuYWN0aXZlUGFyYW1ldGVyO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YWN0aXZlU2lnbmF0dXJlSGVscCA9IHJldml2ZWRTaWduYXR1cmVIZWxwO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyAuLi5jb250ZXh0LCBhY3RpdmVTaWduYXR1cmVIZWxwIH07XG5cdH1cblxuXHRyZWxlYXNlU2lnbmF0dXJlSGVscChpZDogbnVtYmVyKTogYW55IHtcblx0XHR0aGlzLl9jYWNoZS5kZWxldGUoaWQpO1xuXHR9XG59XG5cbmNsYXNzIElubGF5SGludHNBZGFwdGVyIHtcblxuXHRwcml2YXRlIF9jYWNoZSA9IG5ldyBDYWNoZTx2c2NvZGUuSW5sYXlIaW50PignSW5sYXlIaW50cycpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBNYXA8bnVtYmVyLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBDb21tYW5kc0NvbnZlcnRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLklubGF5SGludHNQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvblxuXHQpIHsgfVxuXG5cdGFzeW5jIHByb3ZpZGVJbmxheUhpbnRzKHJlc291cmNlOiBVUkksIHJhbjogSVJhbmdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JSW5sYXlIaW50c0R0byB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmFuZ2UgPSB0eXBlQ29udmVydC5SYW5nZS50byhyYW4pO1xuXG5cdFx0Y29uc3QgaGludHMgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlSW5sYXlIaW50cyhkb2MsIHJhbmdlLCB0b2tlbik7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KGhpbnRzKSB8fCBoaW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIGJhZCByZXN1bHRcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtJbmxheUhpbnRzXSBOTyBpbmxheSBoaW50cyBmcm9tICcke3RoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfScgZm9yIHJhbmdlICR7SlNPTi5zdHJpbmdpZnkocmFuKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0Ly8gY2FuY2VsbGVkIC0+IHJldHVybiB3aXRob3V0IGZ1cnRoZXIgYWRvLCBlc3Agbm8gY2FjaGluZ1xuXHRcdFx0Ly8gb2YgcmVzdWx0cyBhcyB0aGV5IHdpbGwgbGVha1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGlkID0gdGhpcy5fY2FjaGUuYWRkKGhpbnRzKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5zZXQocGlkLCBuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHJlc3VsdDogZXh0SG9zdFByb3RvY29sLklJbmxheUhpbnRzRHRvID0geyBoaW50czogW10sIGNhY2hlSWQ6IHBpZCB9O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaGludHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLl9pc1ZhbGlkSW5sYXlIaW50KGhpbnRzW2ldLCByYW5nZSkpIHtcblx0XHRcdFx0cmVzdWx0LmhpbnRzLnB1c2godGhpcy5fY29udmVydElubGF5SGludChoaW50c1tpXSwgW3BpZCwgaV0pKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0lubGF5SGludHNdICR7cmVzdWx0LmhpbnRzLmxlbmd0aH0gaW5sYXkgaGludHMgZnJvbSAnJHt0aGlzLl9leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0nIGZvciByYW5nZSAke0pTT04uc3RyaW5naWZ5KHJhbil9YCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVJbmxheUhpbnQoaWQ6IGV4dEhvc3RQcm90b2NvbC5DaGFpbmVkQ2FjaGVJZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl9wcm92aWRlci5yZXNvbHZlSW5sYXlIaW50ICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2FjaGUuZ2V0KC4uLmlkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGhpbnQgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5yZXNvbHZlSW5sYXlIaW50KGl0ZW0sIHRva2VuKTtcblx0XHRpZiAoIWhpbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNWYWxpZElubGF5SGludChoaW50KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnZlcnRJbmxheUhpbnQoaGludCwgaWQpO1xuXHR9XG5cblx0cmVsZWFzZUhpbnRzKGlkOiBudW1iZXIpOiBhbnkge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmdldChpZCk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kZWxldGUoaWQpO1xuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShpZCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1ZhbGlkSW5sYXlIaW50KGhpbnQ6IHZzY29kZS5JbmxheUhpbnQsIHJhbmdlPzogdnNjb2RlLlJhbmdlKTogYm9vbGVhbiB7XG5cdFx0aWYgKGhpbnQubGFiZWwubGVuZ3RoID09PSAwIHx8IEFycmF5LmlzQXJyYXkoaGludC5sYWJlbCkgJiYgaGludC5sYWJlbC5ldmVyeShwYXJ0ID0+IHBhcnQudmFsdWUubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0Y29uc29sZS5sb2coJ0lOVkFMSUQgaW5sYXkgaGludCwgZW1wdHkgbGFiZWwnLCBoaW50KTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHJhbmdlICYmICFyYW5nZS5jb250YWlucyhoaW50LnBvc2l0aW9uKSkge1xuXHRcdFx0Ly8gY29uc29sZS5sb2coJ0lOVkFMSUQgaW5sYXkgaGludCwgcG9zaXRpb24gb3V0c2lkZSByYW5nZScsIHJhbmdlLCBoaW50KTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9jb252ZXJ0SW5sYXlIaW50KGhpbnQ6IHZzY29kZS5JbmxheUhpbnQsIGlkOiBleHRIb3N0UHJvdG9jb2wuQ2hhaW5lZENhY2hlSWQpOiBleHRIb3N0UHJvdG9jb2wuSUlubGF5SGludER0byB7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuX2Rpc3Bvc2FibGVzLmdldChpZFswXSk7XG5cdFx0aWYgKCFkaXNwb3NhYmxlcykge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ0Rpc3Bvc2FibGVTdG9yZSBpcyBtaXNzaW5nLi4uJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBleHRIb3N0UHJvdG9jb2wuSUlubGF5SGludER0byA9IHtcblx0XHRcdGxhYmVsOiAnJywgLy8gZmlsbC1pbiBiZWxvd1xuXHRcdFx0Y2FjaGVJZDogaWQsXG5cdFx0XHR0b29sdGlwOiB0eXBlQ29udmVydC5NYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KGhpbnQudG9vbHRpcCksXG5cdFx0XHRwb3NpdGlvbjogdHlwZUNvbnZlcnQuUG9zaXRpb24uZnJvbShoaW50LnBvc2l0aW9uKSxcblx0XHRcdHRleHRFZGl0czogaGludC50ZXh0RWRpdHMgJiYgaGludC50ZXh0RWRpdHMubWFwKHR5cGVDb252ZXJ0LlRleHRFZGl0LmZyb20pLFxuXHRcdFx0a2luZDogaGludC5raW5kICYmIHR5cGVDb252ZXJ0LklubGF5SGludEtpbmQuZnJvbShoaW50LmtpbmQpLFxuXHRcdFx0cGFkZGluZ0xlZnQ6IGhpbnQucGFkZGluZ0xlZnQsXG5cdFx0XHRwYWRkaW5nUmlnaHQ6IGhpbnQucGFkZGluZ1JpZ2h0LFxuXHRcdH07XG5cblx0XHRpZiAodHlwZW9mIGhpbnQubGFiZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXN1bHQubGFiZWwgPSBoaW50LmxhYmVsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwYXJ0czogbGFuZ3VhZ2VzLklubGF5SGludExhYmVsUGFydFtdID0gW107XG5cdFx0XHRyZXN1bHQubGFiZWwgPSBwYXJ0cztcblxuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGhpbnQubGFiZWwpIHtcblx0XHRcdFx0aWYgKCFwYXJ0LnZhbHVlKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKCdJTlZBTElEIGlubGF5IGhpbnQsIGVtcHR5IGxhYmVsIHBhcnQnLCB0aGlzLl9leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcGFydDI6IGxhbmd1YWdlcy5JbmxheUhpbnRMYWJlbFBhcnQgPSB7XG5cdFx0XHRcdFx0bGFiZWw6IHBhcnQudmFsdWUsXG5cdFx0XHRcdFx0dG9vbHRpcDogdHlwZUNvbnZlcnQuTWFya2Rvd25TdHJpbmcuZnJvbVN0cmljdChwYXJ0LnRvb2x0aXApXG5cdFx0XHRcdH07XG5cdFx0XHRcdGlmIChMb2NhdGlvbi5pc0xvY2F0aW9uKHBhcnQubG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0cGFydDIubG9jYXRpb24gPSB0eXBlQ29udmVydC5sb2NhdGlvbi5mcm9tKHBhcnQubG9jYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwYXJ0LmNvbW1hbmQpIHtcblx0XHRcdFx0XHRwYXJ0Mi5jb21tYW5kID0gdGhpcy5fY29tbWFuZHMudG9JbnRlcm5hbChwYXJ0LmNvbW1hbmQsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwYXJ0cy5wdXNoKHBhcnQyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBMaW5rUHJvdmlkZXJBZGFwdGVyIHtcblxuXHRwcml2YXRlIF9jYWNoZSA9IG5ldyBDYWNoZTx2c2NvZGUuRG9jdW1lbnRMaW5rPignRG9jdW1lbnRMaW5rJyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRMaW5rUHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlTGlua3MocmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSUxpbmtzTGlzdER0byB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cblx0XHRjb25zdCBsaW5rcyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudExpbmtzKGRvYywgdG9rZW4pO1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShsaW5rcykgfHwgbGlua3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBiYWQgcmVzdWx0XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdC8vIGNhbmNlbGxlZCAtPiByZXR1cm4gd2l0aG91dCBmdXJ0aGVyIGFkbywgZXNwIG5vIGNhY2hpbmdcblx0XHRcdC8vIG9mIHJlc3VsdHMgYXMgdGhleSB3aWxsIGxlYWtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50TGluayAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0Ly8gbm8gcmVzb2x2ZSAtPiBubyBjYWNoaW5nXG5cdFx0XHRyZXR1cm4geyBsaW5rczogbGlua3MuZmlsdGVyKExpbmtQcm92aWRlckFkYXB0ZXIuX3ZhbGlkYXRlTGluaykubWFwKHR5cGVDb252ZXJ0LkRvY3VtZW50TGluay5mcm9tKSB9O1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGNhY2hlIGxpbmtzIGZvciBmdXR1cmUgcmVzb2x2aW5nXG5cdFx0XHRjb25zdCBwaWQgPSB0aGlzLl9jYWNoZS5hZGQobGlua3MpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBleHRIb3N0UHJvdG9jb2wuSUxpbmtzTGlzdER0byA9IHsgbGlua3M6IFtdLCBjYWNoZUlkOiBwaWQgfTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGlua3MubGVuZ3RoOyBpKyspIHtcblxuXHRcdFx0XHRpZiAoIUxpbmtQcm92aWRlckFkYXB0ZXIuX3ZhbGlkYXRlTGluayhsaW5rc1tpXSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGR0bzogZXh0SG9zdFByb3RvY29sLklMaW5rRHRvID0gdHlwZUNvbnZlcnQuRG9jdW1lbnRMaW5rLmZyb20obGlua3NbaV0pO1xuXHRcdFx0XHRkdG8uY2FjaGVJZCA9IFtwaWQsIGldO1xuXHRcdFx0XHRyZXN1bHQubGlua3MucHVzaChkdG8pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfdmFsaWRhdGVMaW5rKGxpbms6IHZzY29kZS5Eb2N1bWVudExpbmspOiBib29sZWFuIHtcblx0XHRpZiAobGluay50YXJnZXQgJiYgbGluay50YXJnZXQucGF0aC5sZW5ndGggPiA1MF8wMDApIHtcblx0XHRcdGNvbnNvbGUud2FybignRFJPUFBJTkcgbGluayBiZWNhdXNlIGl0IGlzIHRvbyBsb25nJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUxpbmsoaWQ6IGV4dEhvc3RQcm90b2NvbC5DaGFpbmVkQ2FjaGVJZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSUxpbmtEdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodHlwZW9mIHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVEb2N1bWVudExpbmsgIT09ICdmdW5jdGlvbicpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9jYWNoZS5nZXQoLi4uaWQpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbGluayA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnJlc29sdmVEb2N1bWVudExpbmsoaXRlbSwgdG9rZW4pO1xuXHRcdGlmICghbGluayB8fCAhTGlua1Byb3ZpZGVyQWRhcHRlci5fdmFsaWRhdGVMaW5rKGxpbmspKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdHlwZUNvbnZlcnQuRG9jdW1lbnRMaW5rLmZyb20obGluayk7XG5cdH1cblxuXHRyZWxlYXNlTGlua3MoaWQ6IG51bWJlcik6IGFueSB7XG5cdFx0dGhpcy5fY2FjaGUuZGVsZXRlKGlkKTtcblx0fVxufVxuXG5jbGFzcyBDb2xvclByb3ZpZGVyQWRhcHRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgX3Byb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRDb2xvclByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZUNvbG9ycyhyZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JUmF3Q29sb3JJbmZvW10+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNvbG9ycyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudENvbG9ycyhkb2MsIHRva2VuKTtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoY29sb3JzKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBjb2xvckluZm9zOiBleHRIb3N0UHJvdG9jb2wuSVJhd0NvbG9ySW5mb1tdID0gY29sb3JzLm1hcChjaSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb2xvcjogdHlwZUNvbnZlcnQuQ29sb3IuZnJvbShjaS5jb2xvciksXG5cdFx0XHRcdHJhbmdlOiB0eXBlQ29udmVydC5SYW5nZS5mcm9tKGNpLnJhbmdlKVxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHRyZXR1cm4gY29sb3JJbmZvcztcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDb2xvclByZXNlbnRhdGlvbnMocmVzb3VyY2U6IFVSSSwgcmF3OiBleHRIb3N0UHJvdG9jb2wuSVJhd0NvbG9ySW5mbywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuSUNvbG9yUHJlc2VudGF0aW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmFuZ2UgPSB0eXBlQ29udmVydC5SYW5nZS50byhyYXcucmFuZ2UpO1xuXHRcdGNvbnN0IGNvbG9yID0gdHlwZUNvbnZlcnQuQ29sb3IudG8ocmF3LmNvbG9yKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVDb2xvclByZXNlbnRhdGlvbnMoY29sb3IsIHsgZG9jdW1lbnQsIHJhbmdlIH0sIHRva2VuKTtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWUubWFwKHR5cGVDb252ZXJ0LkNvbG9yUHJlc2VudGF0aW9uLmZyb20pO1xuXHR9XG59XG5cbmNsYXNzIEZvbGRpbmdQcm92aWRlckFkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIF9wcm92aWRlcjogdnNjb2RlLkZvbGRpbmdSYW5nZVByb3ZpZGVyXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZUZvbGRpbmdSYW5nZXMocmVzb3VyY2U6IFVSSSwgY29udGV4dDogbGFuZ3VhZ2VzLkZvbGRpbmdDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudChyZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmFuZ2VzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUZvbGRpbmdSYW5nZXMoZG9jLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHJhbmdlcykpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiByYW5nZXMubWFwKHR5cGVDb252ZXJ0LkZvbGRpbmdSYW5nZS5mcm9tKTtcblx0fVxufVxuXG5jbGFzcyBTZWxlY3Rpb25SYW5nZUFkYXB0ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLlNlbGVjdGlvblJhbmdlUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlU2VsZWN0aW9uUmFuZ2VzKHJlc291cmNlOiBVUkksIHBvczogSVBvc2l0aW9uW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlNlbGVjdGlvblJhbmdlW11bXT4ge1xuXHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblx0XHRjb25zdCBwb3NpdGlvbnMgPSBwb3MubWFwKHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKTtcblxuXHRcdGNvbnN0IGFsbFByb3ZpZGVyUmFuZ2VzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZVNlbGVjdGlvblJhbmdlcyhkb2N1bWVudCwgcG9zaXRpb25zLCB0b2tlbik7XG5cdFx0aWYgKCFpc05vbkVtcHR5QXJyYXkoYWxsUHJvdmlkZXJSYW5nZXMpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmIChhbGxQcm92aWRlclJhbmdlcy5sZW5ndGggIT09IHBvc2l0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignQkFEIHNlbGVjdGlvbiByYW5nZXMsIHByb3ZpZGVyIG11c3QgcmV0dXJuIHJhbmdlcyBmb3IgZWFjaCBwb3NpdGlvbicpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBhbGxSZXN1bHRzOiBsYW5ndWFnZXMuU2VsZWN0aW9uUmFuZ2VbXVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwb3NpdGlvbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IG9uZVJlc3VsdDogbGFuZ3VhZ2VzLlNlbGVjdGlvblJhbmdlW10gPSBbXTtcblx0XHRcdGFsbFJlc3VsdHMucHVzaChvbmVSZXN1bHQpO1xuXG5cdFx0XHRsZXQgbGFzdDogdnNjb2RlLlBvc2l0aW9uIHwgdnNjb2RlLlJhbmdlID0gcG9zaXRpb25zW2ldO1xuXHRcdFx0bGV0IHNlbGVjdGlvblJhbmdlID0gYWxsUHJvdmlkZXJSYW5nZXNbaV07XG5cblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGlmICghc2VsZWN0aW9uUmFuZ2UucmFuZ2UuY29udGFpbnMobGFzdCkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lOVkFMSUQgc2VsZWN0aW9uIHJhbmdlLCBtdXN0IGNvbnRhaW4gdGhlIHByZXZpb3VzIHJhbmdlJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b25lUmVzdWx0LnB1c2godHlwZUNvbnZlcnQuU2VsZWN0aW9uUmFuZ2UuZnJvbShzZWxlY3Rpb25SYW5nZSkpO1xuXHRcdFx0XHRpZiAoIXNlbGVjdGlvblJhbmdlLnBhcmVudCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3QgPSBzZWxlY3Rpb25SYW5nZS5yYW5nZTtcblx0XHRcdFx0c2VsZWN0aW9uUmFuZ2UgPSBzZWxlY3Rpb25SYW5nZS5wYXJlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhbGxSZXN1bHRzO1xuXHR9XG59XG5cbmNsYXNzIENhbGxIaWVyYXJjaHlBZGFwdGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pZFBvb2wgPSBuZXcgSWRHZW5lcmF0b3IoJycpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW0+PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50czogRXh0SG9zdERvY3VtZW50cyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcjogdnNjb2RlLkNhbGxIaWVyYXJjaHlQcm92aWRlclxuXHQpIHsgfVxuXG5cdGFzeW5jIHByZXBhcmVTZXNzaW9uKHVyaTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JQ2FsbEhpZXJhcmNoeUl0ZW1EdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRvYyA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudCh1cmkpO1xuXHRcdGNvbnN0IHBvcyA9IHR5cGVDb252ZXJ0LlBvc2l0aW9uLnRvKHBvc2l0aW9uKTtcblxuXHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJlcGFyZUNhbGxIaWVyYXJjaHkoZG9jLCBwb3MsIHRva2VuKTtcblx0XHRpZiAoIWl0ZW1zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IHRoaXMuX2lkUG9vbC5uZXh0SWQoKTtcblx0XHR0aGlzLl9jYWNoZS5zZXQoc2Vzc2lvbklkLCBuZXcgTWFwKCkpO1xuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XG5cdFx0XHRyZXR1cm4gaXRlbXMubWFwKGl0ZW0gPT4gdGhpcy5fY2FjaGVBbmRDb252ZXJ0SXRlbShzZXNzaW9uSWQsIGl0ZW0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFt0aGlzLl9jYWNoZUFuZENvbnZlcnRJdGVtKHNlc3Npb25JZCwgaXRlbXMpXTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBwcm92aWRlQ2FsbHNUbyhzZXNzaW9uSWQ6IHN0cmluZywgaXRlbUlkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklJbmNvbWluZ0NhbGxEdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pdGVtRnJvbUNhY2hlKHNlc3Npb25JZCwgaXRlbUlkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbWlzc2luZyBjYWxsIGhpZXJhcmNoeSBpdGVtJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGNhbGxzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGxzKGl0ZW0sIHRva2VuKTtcblx0XHRpZiAoIWNhbGxzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gY2FsbHMubWFwKGNhbGwgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZnJvbTogdGhpcy5fY2FjaGVBbmRDb252ZXJ0SXRlbShzZXNzaW9uSWQsIGNhbGwuZnJvbSksXG5cdFx0XHRcdGZyb21SYW5nZXM6IGNhbGwuZnJvbVJhbmdlcy5tYXAociA9PiB0eXBlQ29udmVydC5SYW5nZS5mcm9tKHIpKVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDYWxsc0Zyb20oc2Vzc2lvbklkOiBzdHJpbmcsIGl0ZW1JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JT3V0Z29pbmdDYWxsRHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5faXRlbUZyb21DYWNoZShzZXNzaW9uSWQsIGl0ZW1JZCk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ21pc3NpbmcgY2FsbCBoaWVyYXJjaHkgaXRlbScpO1xuXHRcdH1cblx0XHRjb25zdCBjYWxscyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVDYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxscyhpdGVtLCB0b2tlbik7XG5cdFx0aWYgKCFjYWxscykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGNhbGxzLm1hcChjYWxsID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRvOiB0aGlzLl9jYWNoZUFuZENvbnZlcnRJdGVtKHNlc3Npb25JZCwgY2FsbC50byksXG5cdFx0XHRcdGZyb21SYW5nZXM6IGNhbGwuZnJvbVJhbmdlcy5tYXAociA9PiB0eXBlQ29udmVydC5SYW5nZS5mcm9tKHIpKVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHJlbGVhc2VTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FjaGUuZGVsZXRlKHNlc3Npb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIF9jYWNoZUFuZENvbnZlcnRJdGVtKHNlc3Npb25JZDogc3RyaW5nLCBpdGVtOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeUl0ZW0pOiBleHRIb3N0UHJvdG9jb2wuSUNhbGxIaWVyYXJjaHlJdGVtRHRvIHtcblx0XHRjb25zdCBtYXAgPSB0aGlzLl9jYWNoZS5nZXQoc2Vzc2lvbklkKSE7XG5cdFx0Y29uc3QgZHRvID0gdHlwZUNvbnZlcnQuQ2FsbEhpZXJhcmNoeUl0ZW0uZnJvbShpdGVtLCBzZXNzaW9uSWQsIG1hcC5zaXplLnRvU3RyaW5nKDM2KSk7XG5cdFx0bWFwLnNldChkdG8uX2l0ZW1JZCwgaXRlbSk7XG5cdFx0cmV0dXJuIGR0bztcblx0fVxuXG5cdHByaXZhdGUgX2l0ZW1Gcm9tQ2FjaGUoc2Vzc2lvbklkOiBzdHJpbmcsIGl0ZW1JZDogc3RyaW5nKTogdnNjb2RlLkNhbGxIaWVyYXJjaHlJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtYXAgPSB0aGlzLl9jYWNoZS5nZXQoc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gbWFwPy5nZXQoaXRlbUlkKTtcblx0fVxufVxuXG5jbGFzcyBUeXBlSGllcmFyY2h5QWRhcHRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaWRQb29sID0gbmV3IElkR2VuZXJhdG9yKCcnKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgdnNjb2RlLlR5cGVIaWVyYXJjaHlJdGVtPj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5UeXBlSGllcmFyY2h5UHJvdmlkZXJcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlU2Vzc2lvbih1cmk6IFVSSSwgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVR5cGVIaWVyYXJjaHlJdGVtRHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQodXJpKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByZXBhcmVUeXBlSGllcmFyY2h5KGRvYywgcG9zLCB0b2tlbik7XG5cdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLl9pZFBvb2wubmV4dElkKCk7XG5cdFx0dGhpcy5fY2FjaGUuc2V0KHNlc3Npb25JZCwgbmV3IE1hcCgpKTtcblxuXHRcdGlmIChBcnJheS5pc0FycmF5KGl0ZW1zKSkge1xuXHRcdFx0cmV0dXJuIGl0ZW1zLm1hcChpdGVtID0+IHRoaXMuX2NhY2hlQW5kQ29udmVydEl0ZW0oc2Vzc2lvbklkLCBpdGVtKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBbdGhpcy5fY2FjaGVBbmRDb252ZXJ0SXRlbShzZXNzaW9uSWQsIGl0ZW1zKV07XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcHJvdmlkZVN1cGVydHlwZXMoc2Vzc2lvbklkOiBzdHJpbmcsIGl0ZW1JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JVHlwZUhpZXJhcmNoeUl0ZW1EdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pdGVtRnJvbUNhY2hlKHNlc3Npb25JZCwgaXRlbUlkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbWlzc2luZyB0eXBlIGhpZXJhcmNoeSBpdGVtJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHN1cGVydHlwZXMgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlVHlwZUhpZXJhcmNoeVN1cGVydHlwZXMoaXRlbSwgdG9rZW4pO1xuXHRcdGlmICghc3VwZXJ0eXBlcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVydHlwZXMubWFwKHN1cGVydHlwZSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FjaGVBbmRDb252ZXJ0SXRlbShzZXNzaW9uSWQsIHN1cGVydHlwZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlU3VidHlwZXMoc2Vzc2lvbklkOiBzdHJpbmcsIGl0ZW1JZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JVHlwZUhpZXJhcmNoeUl0ZW1EdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pdGVtRnJvbUNhY2hlKHNlc3Npb25JZCwgaXRlbUlkKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbWlzc2luZyB0eXBlIGhpZXJhcmNoeSBpdGVtJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHN1YnR5cGVzID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZVR5cGVIaWVyYXJjaHlTdWJ0eXBlcyhpdGVtLCB0b2tlbik7XG5cdFx0aWYgKCFzdWJ0eXBlcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHN1YnR5cGVzLm1hcChzdWJ0eXBlID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9jYWNoZUFuZENvbnZlcnRJdGVtKHNlc3Npb25JZCwgc3VidHlwZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZWxlYXNlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FjaGVBbmRDb252ZXJ0SXRlbShzZXNzaW9uSWQ6IHN0cmluZywgaXRlbTogdnNjb2RlLlR5cGVIaWVyYXJjaHlJdGVtKTogZXh0SG9zdFByb3RvY29sLklUeXBlSGllcmFyY2h5SXRlbUR0byB7XG5cdFx0Y29uc3QgbWFwID0gdGhpcy5fY2FjaGUuZ2V0KHNlc3Npb25JZCkhO1xuXHRcdGNvbnN0IGR0byA9IHR5cGVDb252ZXJ0LlR5cGVIaWVyYXJjaHlJdGVtLmZyb20oaXRlbSwgc2Vzc2lvbklkLCBtYXAuc2l6ZS50b1N0cmluZygzNikpO1xuXHRcdG1hcC5zZXQoZHRvLl9pdGVtSWQsIGl0ZW0pO1xuXHRcdHJldHVybiBkdG87XG5cdH1cblxuXHRwcml2YXRlIF9pdGVtRnJvbUNhY2hlKHNlc3Npb25JZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZyk6IHZzY29kZS5UeXBlSGllcmFyY2h5SXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbWFwID0gdGhpcy5fY2FjaGUuZ2V0KHNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIG1hcD8uZ2V0KGl0ZW1JZCk7XG5cdH1cbn1cblxuY2xhc3MgRG9jdW1lbnREcm9wRWRpdEFkYXB0ZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlID0gbmV3IENhY2hlPHZzY29kZS5Eb2N1bWVudERyb3BFZGl0PignRG9jdW1lbnREcm9wRWRpdCcpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBleHRIb3N0UHJvdG9jb2wuTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXNTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudERyb3BFZGl0UHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZURvY3VtZW50T25Ecm9wRWRpdHMocmVxdWVzdElkOiBudW1iZXIsIHVyaTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBkYXRhVHJhbnNmZXJEdG86IGV4dEhvc3RQcm90b2NvbC5EYXRhVHJhbnNmZXJEVE8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklEb2N1bWVudERyb3BFZGl0RHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkb2MgPSB0aGlzLl9kb2N1bWVudHMuZ2V0RG9jdW1lbnQodXJpKTtcblx0XHRjb25zdCBwb3MgPSB0eXBlQ29udmVydC5Qb3NpdGlvbi50byhwb3NpdGlvbik7XG5cdFx0Y29uc3QgZGF0YVRyYW5zZmVyID0gdHlwZUNvbnZlcnQuRGF0YVRyYW5zZmVyLnRvRGF0YVRyYW5zZmVyKGRhdGFUcmFuc2ZlckR0bywgYXN5bmMgKGlkKSA9PiB7XG5cdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX3Byb3h5LiRyZXNvbHZlRG9jdW1lbnRPbkRyb3BGaWxlRGF0YSh0aGlzLl9oYW5kbGUsIHJlcXVlc3RJZCwgaWQpKS5idWZmZXI7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVEb2N1bWVudERyb3BFZGl0cyhkb2MsIHBvcywgZGF0YVRyYW5zZmVyLCB0b2tlbik7XG5cdFx0aWYgKCFlZGl0cykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0c0FycmF5ID0gYXNBcnJheShlZGl0cyk7XG5cdFx0Y29uc3QgY2FjaGVJZCA9IHRoaXMuX2NhY2hlLmFkZChlZGl0c0FycmF5KTtcblxuXHRcdHJldHVybiBlZGl0c0FycmF5Lm1hcCgoZWRpdCwgaSk6IGV4dEhvc3RQcm90b2NvbC5JRG9jdW1lbnREcm9wRWRpdER0byA9PiAoe1xuXHRcdFx0X2NhY2hlSWQ6IFtjYWNoZUlkLCBpXSxcblx0XHRcdHRpdGxlOiBlZGl0LnRpdGxlID8/IGxvY2FsaXplKCdkZWZhdWx0RHJvcExhYmVsJywgXCJEcm9wIHVzaW5nICd7MH0nIGV4dGVuc2lvblwiLCB0aGlzLl9leHRlbnNpb24uZGlzcGxheU5hbWUgfHwgdGhpcy5fZXh0ZW5zaW9uLm5hbWUpLFxuXHRcdFx0a2luZDogZWRpdC5raW5kPy52YWx1ZSxcblx0XHRcdHlpZWxkVG86IGVkaXQueWllbGRUbz8ubWFwKHggPT4geC52YWx1ZSksXG5cdFx0XHRpbnNlcnRUZXh0OiB0eXBlb2YgZWRpdC5pbnNlcnRUZXh0ID09PSAnc3RyaW5nJyA/IGVkaXQuaW5zZXJ0VGV4dCA6IHsgc25pcHBldDogZWRpdC5pbnNlcnRUZXh0LnZhbHVlIH0sXG5cdFx0XHRhZGRpdGlvbmFsRWRpdDogZWRpdC5hZGRpdGlvbmFsRWRpdCA/IHR5cGVDb252ZXJ0LldvcmtzcGFjZUVkaXQuZnJvbShlZGl0LmFkZGl0aW9uYWxFZGl0LCB1bmRlZmluZWQpIDogdW5kZWZpbmVkLFxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVEcm9wRWRpdChpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgYWRkaXRpb25hbEVkaXQ/OiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG8gfT4ge1xuXHRcdGNvbnN0IFtzZXNzaW9uSWQsIGl0ZW1JZF0gPSBpZDtcblx0XHRjb25zdCBpdGVtID0gdGhpcy5fY2FjaGUuZ2V0KHNlc3Npb25JZCwgaXRlbUlkKTtcblx0XHRpZiAoIWl0ZW0gfHwgIXRoaXMuX3Byb3ZpZGVyLnJlc29sdmVEb2N1bWVudERyb3BFZGl0KSB7XG5cdFx0XHRyZXR1cm4ge307IC8vIHRoaXMgc2hvdWxkIG5vdCBoYXBwZW4uLi5cblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZEl0ZW0gPSAoYXdhaXQgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50RHJvcEVkaXQoaXRlbSwgdG9rZW4pKSA/PyBpdGVtO1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxFZGl0ID0gcmVzb2x2ZWRJdGVtLmFkZGl0aW9uYWxFZGl0ID8gdHlwZUNvbnZlcnQuV29ya3NwYWNlRWRpdC5mcm9tKHJlc29sdmVkSXRlbS5hZGRpdGlvbmFsRWRpdCwgdW5kZWZpbmVkKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4geyBhZGRpdGlvbmFsRWRpdCB9O1xuXHR9XG5cblx0cmVsZWFzZURyb3BFZGl0cyhpZDogbnVtYmVyKTogYW55IHtcblx0XHR0aGlzLl9jYWNoZS5kZWxldGUoaWQpO1xuXHR9XG59XG5cbnR5cGUgQWRhcHRlciA9IERvY3VtZW50U3ltYm9sQWRhcHRlciB8IENvZGVMZW5zQWRhcHRlciB8IERlZmluaXRpb25BZGFwdGVyIHwgSG92ZXJBZGFwdGVyXG5cdHwgRG9jdW1lbnRIaWdobGlnaHRBZGFwdGVyIHwgTXVsdGlEb2N1bWVudEhpZ2hsaWdodEFkYXB0ZXIgfCBSZWZlcmVuY2VBZGFwdGVyIHwgQ29kZUFjdGlvbkFkYXB0ZXJcblx0fCBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyIHwgRG9jdW1lbnRGb3JtYXR0aW5nQWRhcHRlciB8IFJhbmdlRm9ybWF0dGluZ0FkYXB0ZXJcblx0fCBPblR5cGVGb3JtYXR0aW5nQWRhcHRlciB8IE5hdmlnYXRlVHlwZUFkYXB0ZXIgfCBSZW5hbWVBZGFwdGVyXG5cdHwgQ29tcGxldGlvbnNBZGFwdGVyIHwgU2lnbmF0dXJlSGVscEFkYXB0ZXIgfCBMaW5rUHJvdmlkZXJBZGFwdGVyIHwgSW1wbGVtZW50YXRpb25BZGFwdGVyXG5cdHwgVHlwZURlZmluaXRpb25BZGFwdGVyIHwgQ29sb3JQcm92aWRlckFkYXB0ZXIgfCBGb2xkaW5nUHJvdmlkZXJBZGFwdGVyIHwgRGVjbGFyYXRpb25BZGFwdGVyXG5cdHwgU2VsZWN0aW9uUmFuZ2VBZGFwdGVyIHwgQ2FsbEhpZXJhcmNoeUFkYXB0ZXIgfCBUeXBlSGllcmFyY2h5QWRhcHRlclxuXHR8IERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyIHwgRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zQWRhcHRlclxuXHR8IEV2YWx1YXRhYmxlRXhwcmVzc2lvbkFkYXB0ZXIgfCBJbmxpbmVWYWx1ZXNBZGFwdGVyXG5cdHwgTGlua2VkRWRpdGluZ1JhbmdlQWRhcHRlciB8IElubGF5SGludHNBZGFwdGVyIHwgSW5saW5lQ29tcGxldGlvbkFkYXB0ZXJcblx0fCBEb2N1bWVudERyb3BFZGl0QWRhcHRlciB8IE5ld1N5bWJvbE5hbWVzQWRhcHRlcjtcblxuY2xhc3MgQWRhcHRlckRhdGEge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBhZGFwdGVyOiBBZGFwdGVyLFxuXHRcdHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcyBleHRlbmRzIENvcmVEaXNwb3NhYmxlIGltcGxlbWVudHMgZXh0SG9zdFByb3RvY29sLkV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzU2hhcGUge1xuXG5cdHByaXZhdGUgc3RhdGljIF9oYW5kbGVQb29sOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBleHRIb3N0UHJvdG9jb2wuTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWRhcHRlciA9IG5ldyBNYXA8bnVtYmVyLCBBZGFwdGVyRGF0YT4oKTtcblxuXHRwcml2YXRlIF9pbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGU6IHZzY29kZS5JbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGU7XG5cdHB1YmxpYyBnZXQgaW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlKCk6IHZzY29kZS5JbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9pbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUlubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUlubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlSW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSU1haW5Db250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VyaVRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGlhZ25vc3RpY3M6IEV4dEhvc3REaWFnbm9zdGljcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hcGlEZXByZWNhdGlvbjogSUV4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uVGVsZW1ldHJ5OiBJRXh0SG9zdFRlbGVtZXRyeVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoZXh0SG9zdFByb3RvY29sLk1haW5Db250ZXh0Lk1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzKTtcblx0XHR0aGlzLl9pbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUgPSB7XG5cdFx0XHRjb2RlVW5pZmljYXRpb246IGZhbHNlLFxuXHRcdFx0bW9kZWxVbmlmaWNhdGlvbjogZmFsc2UsXG5cdFx0XHRleHRlbnNpb25VbmlmaWNhdGlvbjogZmFsc2UsXG5cdFx0XHRleHBBc3NpZ25tZW50czogW11cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogQXJyYXk8ZXh0SG9zdFByb3RvY29sLklEb2N1bWVudEZpbHRlckR0bz4ge1xuXHRcdHJldHVybiB0eXBlQ29udmVydC5Eb2N1bWVudFNlbGVjdG9yLmZyb20oc2VsZWN0b3IsIHRoaXMuX3VyaVRyYW5zZm9ybWVyLCBleHRlbnNpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRGlzcG9zYWJsZShoYW5kbGU6IG51bWJlcik6IERpc3Bvc2FibGUge1xuXHRcdHJldHVybiBuZXcgRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hZGFwdGVyLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXIoaGFuZGxlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX25leHRIYW5kbGUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX2hhbmRsZVBvb2wrKztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dpdGhBZGFwdGVyPEEsIFI+KFxuXHRcdGhhbmRsZTogbnVtYmVyLFxuXHRcdGN0b3I6IHsgbmV3KC4uLmFyZ3M6IGFueVtdKTogQSB9LFxuXHRcdGNhbGxiYWNrOiAoYWRhcHRlcjogQSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pID0+IFByb21pc2U8Uj4sXG5cdFx0ZmFsbGJhY2tWYWx1ZTogUixcblx0XHR0b2tlblRvUmFjZUFnYWluc3Q6IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkLFxuXHRcdGRvTm90TG9nOiBib29sZWFuID0gZmFsc2Vcblx0KTogUHJvbWlzZTxSPiB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2FkYXB0ZXIuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFkYXRhIHx8ICEoZGF0YS5hZGFwdGVyIGluc3RhbmNlb2YgY3RvcikpIHtcblx0XHRcdHJldHVybiBmYWxsYmFja1ZhbHVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHQxOiBudW1iZXIgPSBEYXRlLm5vdygpO1xuXHRcdGlmICghZG9Ob3RMb2cpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFske2RhdGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XSBJTlZPS0UgcHJvdmlkZXIgJyR7Y2FsbGJhY2sudG9TdHJpbmcoKS5yZXBsYWNlKC9bXFxyXFxuXS9nLCAnJyl9J2ApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGNhbGxiYWNrKGRhdGEuYWRhcHRlciwgZGF0YS5leHRlbnNpb24pO1xuXG5cdFx0Ly8gbG9nZ2luZyx0cmFjaW5nXG5cdFx0UHJvbWlzZS5yZXNvbHZlKHJlc3VsdCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFske2RhdGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XSBwcm92aWRlciBGQUlMRURgKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXG5cdFx0XHRcdHRoaXMuX2V4dGVuc2lvblRlbGVtZXRyeS5vbkV4dGVuc2lvbkVycm9yKGRhdGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGVycik7XG5cdFx0XHR9XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpZiAoIWRvTm90TG9nKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFske2RhdGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9XSBwcm92aWRlciBET05FIGFmdGVyICR7RGF0ZS5ub3coKSAtIHQxfW1zYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoQ2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25Ub2tlbih0b2tlblRvUmFjZUFnYWluc3QpKSB7XG5cdFx0XHRyZXR1cm4gcmFjZUNhbmNlbGxhdGlvbkVycm9yKHJlc3VsdCwgdG9rZW5Ub1JhY2VBZ2FpbnN0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2FkZE5ld0FkYXB0ZXIoYWRhcHRlcjogQWRhcHRlciwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBudW1iZXIge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX25leHRIYW5kbGUoKTtcblx0XHR0aGlzLl9hZGFwdGVyLnNldChoYW5kbGUsIG5ldyBBZGFwdGVyRGF0YShhZGFwdGVyLCBleHRlbnNpb24pKTtcblx0XHRyZXR1cm4gaGFuZGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2V4dExhYmVsKGV4dDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZXh0LmRpc3BsYXlOYW1lIHx8IGV4dC5uYW1lO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2V4dElkKGV4dDogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZXh0LmlkZW50aWZpZXIudmFsdWU7XG5cdH1cblxuXHQvLyAtLS0gb3V0bGluZVxuXG5cdHJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXIsIG1ldGFkYXRhPzogdnNjb2RlLkRvY3VtZW50U3ltYm9sUHJvdmlkZXJNZXRhZGF0YSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBEb2N1bWVudFN5bWJvbEFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSAobWV0YWRhdGEgJiYgbWV0YWRhdGEubGFiZWwpIHx8IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9leHRMYWJlbChleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCBkaXNwbGF5TmFtZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlRG9jdW1lbnRTeW1ib2xzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuRG9jdW1lbnRTeW1ib2xbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50U3ltYm9sQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVEb2N1bWVudFN5bWJvbHMoVVJJLnJldml2ZShyZXNvdXJjZSksIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQvLyAtLS0gY29kZSBsZW5zXG5cblx0cmVnaXN0ZXJDb2RlTGVuc1Byb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuQ29kZUxlbnNQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9uZXh0SGFuZGxlKCk7XG5cdFx0Y29uc3QgZXZlbnRIYW5kbGUgPSB0eXBlb2YgcHJvdmlkZXIub25EaWRDaGFuZ2VDb2RlTGVuc2VzID09PSAnZnVuY3Rpb24nID8gdGhpcy5fbmV4dEhhbmRsZSgpIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fYWRhcHRlci5zZXQoaGFuZGxlLCBuZXcgQWRhcHRlckRhdGEobmV3IENvZGVMZW5zQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlciwgcHJvdmlkZXIsIGV4dGVuc2lvbiwgdGhpcy5fZXh0ZW5zaW9uVGVsZW1ldHJ5LCB0aGlzLl9sb2dTZXJ2aWNlKSwgZXh0ZW5zaW9uKSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQ29kZUxlbnNTdXBwb3J0KGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgZXZlbnRIYW5kbGUpO1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cblx0XHRpZiAoZXZlbnRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2VDb2RlTGVuc2VzIShfID0+IHRoaXMuX3Byb3h5LiRlbWl0Q29kZUxlbnNFdmVudChldmVudEhhbmRsZSkpO1xuXHRcdFx0cmVzdWx0ID0gRGlzcG9zYWJsZS5mcm9tKHJlc3VsdCwgc3Vic2NyaXB0aW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0JHByb3ZpZGVDb2RlTGVuc2VzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSUNvZGVMZW5zTGlzdER0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENvZGVMZW5zQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVDb2RlTGVuc2VzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4sIHJlc291cmNlLnNjaGVtZSA9PT0gJ291dHB1dCcpO1xuXHR9XG5cblx0JHJlc29sdmVDb2RlTGVucyhoYW5kbGU6IG51bWJlciwgc3ltYm9sOiBleHRIb3N0UHJvdG9jb2wuSUNvZGVMZW5zRHRvLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JQ29kZUxlbnNEdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBDb2RlTGVuc0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZXNvbHZlQ29kZUxlbnMoc3ltYm9sLCB0b2tlbiksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fVxuXG5cdCRyZWxlYXNlQ29kZUxlbnNlcyhoYW5kbGU6IG51bWJlciwgY2FjaGVJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBDb2RlTGVuc0FkYXB0ZXIsIGFkYXB0ZXIgPT4gUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIucmVsZWFzZUNvZGVMZW5zZXMoY2FjaGVJZCkpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cblxuXHQvLyAtLS0gZGVjbGFyYXRpb25cblxuXHRyZWdpc3RlckRlZmluaXRpb25Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRlZmluaXRpb25Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBEZWZpbml0aW9uQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJEZWZpbml0aW9uU3VwcG9ydChoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZURlZmluaXRpb24oaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmtbXT4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERlZmluaXRpb25BZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZURlZmluaXRpb24oVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCB0b2tlbiksIFtdLCB0b2tlbik7XG5cdH1cblxuXHRyZWdpc3RlckRlY2xhcmF0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5EZWNsYXJhdGlvblByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IERlY2xhcmF0aW9uQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJEZWNsYXJhdGlvblN1cHBvcnQoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVEZWNsYXJhdGlvbihoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgRGVjbGFyYXRpb25BZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZURlY2xhcmF0aW9uKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgdG9rZW4pLCBbXSwgdG9rZW4pO1xuXHR9XG5cblx0cmVnaXN0ZXJJbXBsZW1lbnRhdGlvblByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuSW1wbGVtZW50YXRpb25Qcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBJbXBsZW1lbnRhdGlvbkFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVySW1wbGVtZW50YXRpb25TdXBwb3J0KGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlSW1wbGVtZW50YXRpb24oaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmtbXT4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIEltcGxlbWVudGF0aW9uQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVJbXBsZW1lbnRhdGlvbihVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIHRva2VuKSwgW10sIHRva2VuKTtcblx0fVxuXG5cdHJlZ2lzdGVyVHlwZURlZmluaXRpb25Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlR5cGVEZWZpbml0aW9uUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgVHlwZURlZmluaXRpb25BZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclR5cGVEZWZpbml0aW9uU3VwcG9ydChoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZVR5cGVEZWZpbml0aW9uKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcG9zaXRpb246IElQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBUeXBlRGVmaW5pdGlvbkFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlVHlwZURlZmluaXRpb24oVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCB0b2tlbiksIFtdLCB0b2tlbik7XG5cdH1cblxuXHQvLyAtLS0gZXh0cmEgaW5mb1xuXG5cdHJlZ2lzdGVySG92ZXJQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkhvdmVyUHJvdmlkZXIsIGV4dGVuc2lvbklkPzogRXh0ZW5zaW9uSWRlbnRpZmllcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBIb3ZlckFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVySG92ZXJQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZUhvdmVyKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcG9zaXRpb246IElQb3NpdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLkhvdmVyQ29udGV4dDx7IGlkOiBudW1iZXIgfT4gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwpOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5Ib3ZlcldpdGhJZCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIEhvdmVyQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVIb3ZlcihVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIGNvbnRleHQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcmVsZWFzZUhvdmVyKGhhbmRsZTogbnVtYmVyLCBpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBIb3ZlckFkYXB0ZXIsIGFkYXB0ZXIgPT4gUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIucmVsZWFzZUhvdmVyKGlkKSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBkZWJ1ZyBob3ZlclxuXG5cdHJlZ2lzdGVyRXZhbHVhdGFibGVFeHByZXNzaW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5FdmFsdWF0YWJsZUV4cHJlc3Npb25Qcm92aWRlciwgZXh0ZW5zaW9uSWQ/OiBFeHRlbnNpb25JZGVudGlmaWVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IEV2YWx1YXRhYmxlRXhwcmVzc2lvbkFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyRXZhbHVhdGFibGVFeHByZXNzaW9uUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVFdmFsdWF0YWJsZUV4cHJlc3Npb24oaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5FdmFsdWF0YWJsZUV4cHJlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBFdmFsdWF0YWJsZUV4cHJlc3Npb25BZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUV2YWx1YXRhYmxlRXhwcmVzc2lvbihVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQvLyAtLS0gZGVidWcgaW5saW5lIHZhbHVlc1xuXG5cdHJlZ2lzdGVySW5saW5lVmFsdWVzUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5JbmxpbmVWYWx1ZXNQcm92aWRlciwgZXh0ZW5zaW9uSWQ/OiBFeHRlbnNpb25JZGVudGlmaWVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXG5cdFx0Y29uc3QgZXZlbnRIYW5kbGUgPSB0eXBlb2YgcHJvdmlkZXIub25EaWRDaGFuZ2VJbmxpbmVWYWx1ZXMgPT09ICdmdW5jdGlvbicgPyB0aGlzLl9uZXh0SGFuZGxlKCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgSW5saW5lVmFsdWVzQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblxuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlcklubGluZVZhbHVlc1Byb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgZXZlbnRIYW5kbGUpO1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cblx0XHRpZiAoZXZlbnRIYW5kbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2VJbmxpbmVWYWx1ZXMhKF8gPT4gdGhpcy5fcHJveHkuJGVtaXRJbmxpbmVWYWx1ZXNFdmVudChldmVudEhhbmRsZSkpO1xuXHRcdFx0cmVzdWx0ID0gRGlzcG9zYWJsZS5mcm9tKHJlc3VsdCwgc3Vic2NyaXB0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdCRwcm92aWRlSW5saW5lVmFsdWVzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmFuZ2U6IElSYW5nZSwgY29udGV4dDogZXh0SG9zdFByb3RvY29sLklJbmxpbmVWYWx1ZUNvbnRleHREdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLklubGluZVZhbHVlW10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxpbmVWYWx1ZXNBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUlubGluZVZhbHVlcyhVUkkucmV2aXZlKHJlc291cmNlKSwgcmFuZ2UsIGNvbnRleHQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQvLyAtLS0gb2NjdXJyZW5jZXNcblxuXHRyZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IERvY3VtZW50SGlnaGxpZ2h0QWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdHJlZ2lzdGVyTXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuTXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IE11bHRpRG9jdW1lbnRIaWdobGlnaHRBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIsIHRoaXMuX2xvZ1NlcnZpY2UpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3Rlck11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZURvY3VtZW50SGlnaGxpZ2h0cyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkRvY3VtZW50SGlnaGxpZ2h0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBEb2N1bWVudEhpZ2hsaWdodEFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRwcm92aWRlTXVsdGlEb2N1bWVudEhpZ2hsaWdodHMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBvdGhlck1vZGVsczogVXJpQ29tcG9uZW50c1tdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5NdWx0aURvY3VtZW50SGlnaGxpZ2h0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBNdWx0aURvY3VtZW50SGlnaGxpZ2h0QWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVNdWx0aURvY3VtZW50SGlnaGxpZ2h0cyhVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIG90aGVyTW9kZWxzLm1hcChtb2RlbCA9PiBVUkkucmV2aXZlKG1vZGVsKSksIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQvLyAtLS0gbGlua2VkIGVkaXRpbmdcblxuXHRyZWdpc3RlckxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuTGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgTGlua2VkRWRpdGluZ1JhbmdlQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJMaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZUxpbmtlZEVkaXRpbmdSYW5nZXMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JTGlua2VkRWRpdGluZ1Jhbmdlc0R0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIExpbmtlZEVkaXRpbmdSYW5nZUFkYXB0ZXIsIGFzeW5jIGFkYXB0ZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgYWRhcHRlci5wcm92aWRlTGlua2VkRWRpdGluZ1JhbmdlcyhVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIHRva2VuKTtcblx0XHRcdGlmIChyZXMpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyYW5nZXM6IHJlcy5yYW5nZXMsXG5cdFx0XHRcdFx0d29yZFBhdHRlcm46IHJlcy53b3JkUGF0dGVybiA/IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9zZXJpYWxpemVSZWdFeHAocmVzLndvcmRQYXR0ZXJuKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9LCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdC8vIC0tLSByZWZlcmVuY2VzXG5cblx0cmVnaXN0ZXJSZWZlcmVuY2VQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlJlZmVyZW5jZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IFJlZmVyZW5jZUFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyUmVmZXJlbmNlU3VwcG9ydChoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZVJlZmVyZW5jZXMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuUmVmZXJlbmNlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIFJlZmVyZW5jZUFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlUmVmZXJlbmNlcyhVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIGNvbnRleHQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQvLyAtLS0gY29kZSBhY3Rpb25zXG5cblx0cmVnaXN0ZXJDb2RlQWN0aW9uUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Db2RlQWN0aW9uUHJvdmlkZXIsIG1ldGFkYXRhPzogdnNjb2RlLkNvZGVBY3Rpb25Qcm92aWRlck1ldGFkYXRhKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IENvZGVBY3Rpb25BZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgdGhpcy5fY29tbWFuZHMuY29udmVydGVyLCB0aGlzLl9kaWFnbm9zdGljcywgcHJvdmlkZXIsIHRoaXMuX2xvZ1NlcnZpY2UsIGV4dGVuc2lvbiwgdGhpcy5fYXBpRGVwcmVjYXRpb24pLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckNvZGVBY3Rpb25TdXBwb3J0KGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwge1xuXHRcdFx0cHJvdmlkZWRLaW5kczogbWV0YWRhdGE/LnByb3ZpZGVkQ29kZUFjdGlvbktpbmRzPy5tYXAoa2luZCA9PiBraW5kLnZhbHVlKSxcblx0XHRcdGRvY3VtZW50YXRpb246IG1ldGFkYXRhPy5kb2N1bWVudGF0aW9uPy5tYXAoeCA9PiAoe1xuXHRcdFx0XHRraW5kOiB4LmtpbmQudmFsdWUsXG5cdFx0XHRcdGNvbW1hbmQ6IHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlci50b0ludGVybmFsKHguY29tbWFuZCwgc3RvcmUpLFxuXHRcdFx0fSkpXG5cdFx0fSwgRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX2V4dExhYmVsKGV4dGVuc2lvbiksIEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9leHRJZChleHRlbnNpb24pLCBCb29sZWFuKHByb3ZpZGVyLnJlc29sdmVDb2RlQWN0aW9uKSk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKSk7XG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblxuXHQkcHJvdmlkZUNvZGVBY3Rpb25zKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmFuZ2VPclNlbGVjdGlvbjogSVJhbmdlIHwgSVNlbGVjdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JQ29kZUFjdGlvbkxpc3REdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBDb2RlQWN0aW9uQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVDb2RlQWN0aW9ucyhVUkkucmV2aXZlKHJlc291cmNlKSwgcmFuZ2VPclNlbGVjdGlvbiwgY29udGV4dCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZXNvbHZlQ29kZUFjdGlvbihoYW5kbGU6IG51bWJlciwgaWQ6IGV4dEhvc3RQcm90b2NvbC5DaGFpbmVkQ2FjaGVJZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGVkaXQ/OiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG87IGNvbW1hbmQ/OiBleHRIb3N0UHJvdG9jb2wuSUNvbW1hbmREdG8gfT4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENvZGVBY3Rpb25BZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucmVzb2x2ZUNvZGVBY3Rpb24oaWQsIHRva2VuKSwge30sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkcmVsZWFzZUNvZGVBY3Rpb25zKGhhbmRsZTogbnVtYmVyLCBjYWNoZUlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENvZGVBY3Rpb25BZGFwdGVyLCBhZGFwdGVyID0+IFByb21pc2UucmVzb2x2ZShhZGFwdGVyLnJlbGVhc2VDb2RlQWN0aW9ucyhjYWNoZUlkKSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBmb3JtYXR0aW5nXG5cblx0cmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudEZvcm1hdHRpbmdFZGl0UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgRG9jdW1lbnRGb3JtYXR0aW5nQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJEb2N1bWVudEZvcm1hdHRpbmdTdXBwb3J0KGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24ubmFtZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBvcHRpb25zOiBsYW5ndWFnZXMuRm9ybWF0dGluZ09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBEb2N1bWVudEZvcm1hdHRpbmdBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZURvY3VtZW50Rm9ybWF0dGluZ0VkaXRzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBvcHRpb25zLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0cmVnaXN0ZXJEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGNhbkZvcm1hdE11bHRpcGxlUmFuZ2VzID0gdHlwZW9mIHByb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFJhbmdlc0Zvcm1hdHRpbmdFZGl0cyA9PT0gJ2Z1bmN0aW9uJztcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBSYW5nZUZvcm1hdHRpbmdBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclJhbmdlRm9ybWF0dGluZ1N1cHBvcnQoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCBleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5uYW1lLCBjYW5Gb3JtYXRNdWx0aXBsZVJhbmdlcyk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHJhbmdlOiBJUmFuZ2UsIG9wdGlvbnM6IGxhbmd1YWdlcy5Gb3JtYXR0aW5nT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIFJhbmdlRm9ybWF0dGluZ0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0cyhVUkkucmV2aXZlKHJlc291cmNlKSwgcmFuZ2UsIG9wdGlvbnMsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcHJvdmlkZURvY3VtZW50UmFuZ2VzRm9ybWF0dGluZ0VkaXRzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmFuZ2VzOiBJUmFuZ2VbXSwgb3B0aW9uczogbGFuZ3VhZ2VzLkZvcm1hdHRpbmdPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5UZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgUmFuZ2VGb3JtYXR0aW5nQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVEb2N1bWVudFJhbmdlc0Zvcm1hdHRpbmdFZGl0cyhVUkkucmV2aXZlKHJlc291cmNlKSwgcmFuZ2VzLCBvcHRpb25zLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0cmVnaXN0ZXJPblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuT25UeXBlRm9ybWF0dGluZ0VkaXRQcm92aWRlciwgdHJpZ2dlckNoYXJhY3RlcnM6IHN0cmluZ1tdKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IE9uVHlwZUZvcm1hdHRpbmdBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3Rlck9uVHlwZUZvcm1hdHRpbmdTdXBwb3J0KGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgdHJpZ2dlckNoYXJhY3RlcnMsIGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVPblR5cGVGb3JtYXR0aW5nRWRpdHMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBjaDogc3RyaW5nLCBvcHRpb25zOiBsYW5ndWFnZXMuRm9ybWF0dGluZ09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBPblR5cGVGb3JtYXR0aW5nQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVPblR5cGVGb3JtYXR0aW5nRWRpdHMoVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCBjaCwgb3B0aW9ucywgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdC8vIC0tLSBuYXZpZ2F0ZSB0eXBlc1xuXG5cdHJlZ2lzdGVyV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHByb3ZpZGVyOiB2c2NvZGUuV29ya3NwYWNlU3ltYm9sUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgTmF2aWdhdGVUeXBlQWRhcHRlcihwcm92aWRlciwgdGhpcy5fbG9nU2VydmljZSksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyTmF2aWdhdGVUeXBlU3VwcG9ydChoYW5kbGUsIHR5cGVvZiBwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlU3ltYm9sID09PSAnZnVuY3Rpb24nKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVXb3Jrc3BhY2VTeW1ib2xzKGhhbmRsZTogbnVtYmVyLCBzZWFyY2g6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZVN5bWJvbHNEdG8+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBOYXZpZ2F0ZVR5cGVBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZVdvcmtzcGFjZVN5bWJvbHMoc2VhcmNoLCB0b2tlbiksIHsgc3ltYm9sczogW10gfSwgdG9rZW4pO1xuXHR9XG5cblx0JHJlc29sdmVXb3Jrc3BhY2VTeW1ib2woaGFuZGxlOiBudW1iZXIsIHN5bWJvbDogZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VTeW1ib2xEdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VTeW1ib2xEdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBOYXZpZ2F0ZVR5cGVBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucmVzb2x2ZVdvcmtzcGFjZVN5bWJvbChzeW1ib2wsIHRva2VuKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0JHJlbGVhc2VXb3Jrc3BhY2VTeW1ib2xzKGhhbmRsZTogbnVtYmVyLCBpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBOYXZpZ2F0ZVR5cGVBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucmVsZWFzZVdvcmtzcGFjZVN5bWJvbHMoaWQpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvLyAtLS0gcmVuYW1lXG5cblx0cmVnaXN0ZXJSZW5hbWVQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlJlbmFtZVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IFJlbmFtZUFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciwgdGhpcy5fbG9nU2VydmljZSksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyUmVuYW1lU3VwcG9ydChoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbiksIFJlbmFtZUFkYXB0ZXIuc3VwcG9ydHNSZXNvbHZpbmcocHJvdmlkZXIpKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVSZW5hbWVFZGl0cyhoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIG5ld05hbWU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBSZW5hbWVBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZVJlbmFtZUVkaXRzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgbmV3TmFtZSwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZXNvbHZlUmVuYW1lTG9jYXRpb24oaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVUkksIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlJlbmFtZUxvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgUmVuYW1lQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnJlc29sdmVSZW5hbWVMb2NhdGlvbihVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHRyZWdpc3Rlck5ld1N5bWJvbE5hbWVzUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5OZXdTeW1ib2xOYW1lc1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IE5ld1N5bWJvbE5hbWVzQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHByb3ZpZGVyLCB0aGlzLl9sb2dTZXJ2aWNlKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJOZXdTeW1ib2xOYW1lc1Byb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRzdXBwb3J0c0F1dG9tYXRpY05ld1N5bWJvbE5hbWVzVHJpZ2dlcktpbmQoaGFuZGxlOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoXG5cdFx0XHRoYW5kbGUsXG5cdFx0XHROZXdTeW1ib2xOYW1lc0FkYXB0ZXIsXG5cdFx0XHRhZGFwdGVyID0+IGFkYXB0ZXIuc3VwcG9ydHNBdXRvbWF0aWNOZXdTeW1ib2xOYW1lc1RyaWdnZXJLaW5kKCksXG5cdFx0XHRmYWxzZSxcblx0XHRcdHVuZGVmaW5lZFxuXHRcdCk7XG5cdH1cblxuXHQkcHJvdmlkZU5ld1N5bWJvbE5hbWVzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmFuZ2U6IElSYW5nZSwgdHJpZ2dlcktpbmQ6IGxhbmd1YWdlcy5OZXdTeW1ib2xOYW1lVHJpZ2dlcktpbmQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLk5ld1N5bWJvbE5hbWVbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIE5ld1N5bWJvbE5hbWVzQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVOZXdTeW1ib2xOYW1lcyhVUkkucmV2aXZlKHJlc291cmNlKSwgcmFuZ2UsIHRyaWdnZXJLaW5kLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0Ly8jcmVnaW9uIHNlbWFudGljIGNvbG9yaW5nXG5cblx0cmVnaXN0ZXJEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIsIGxlZ2VuZDogdnNjb2RlLlNlbWFudGljVG9rZW5zTGVnZW5kKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IERvY3VtZW50U2VtYW50aWNUb2tlbnNBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdGNvbnN0IGV2ZW50SGFuZGxlID0gKHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZVNlbWFudGljVG9rZW5zID09PSAnZnVuY3Rpb24nID8gdGhpcy5fbmV4dEhhbmRsZSgpIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCBsZWdlbmQsIGV2ZW50SGFuZGxlKTtcblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXG5cdFx0aWYgKGV2ZW50SGFuZGxlKSB7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBwcm92aWRlci5vbkRpZENoYW5nZVNlbWFudGljVG9rZW5zIShfID0+IHRoaXMuX3Byb3h5LiRlbWl0RG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0V2ZW50KGV2ZW50SGFuZGxlKSk7XG5cdFx0XHRyZXN1bHQgPSBEaXNwb3NhYmxlLmZyb20ocmVzdWx0LCBzdWJzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQkcHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwcmV2aW91c1Jlc3VsdElkOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VlNCdWZmZXIgfCBudWxsPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlRG9jdW1lbnRTZW1hbnRpY1Rva2VucyhVUkkucmV2aXZlKHJlc291cmNlKSwgcHJldmlvdXNSZXN1bHRJZCwgdG9rZW4pLCBudWxsLCB0b2tlbik7XG5cdH1cblxuXHQkcmVsZWFzZURvY3VtZW50U2VtYW50aWNUb2tlbnMoaGFuZGxlOiBudW1iZXIsIHNlbWFudGljQ29sb3JpbmdSZXN1bHRJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBEb2N1bWVudFNlbWFudGljVG9rZW5zQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnJlbGVhc2VEb2N1bWVudFNlbWFudGljQ29sb3Jpbmcoc2VtYW50aWNDb2xvcmluZ1Jlc3VsdElkKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cmVnaXN0ZXJEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLCBsZWdlbmQ6IHZzY29kZS5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdGNvbnN0IGV2ZW50SGFuZGxlID0gKHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZVNlbWFudGljVG9rZW5zID09PSAnZnVuY3Rpb24nID8gdGhpcy5fbmV4dEhhbmRsZSgpIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbiksIGxlZ2VuZCwgZXZlbnRIYW5kbGUpO1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cblx0XHRpZiAoZXZlbnRIYW5kbGUpIHtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2VtYW50aWNUb2tlbnMhKF8gPT4gdGhpcy5fcHJveHkuJGVtaXREb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNFdmVudChldmVudEhhbmRsZSkpO1xuXHRcdFx0cmVzdWx0ID0gRGlzcG9zYWJsZS5mcm9tKHJlc3VsdCwgc3Vic2NyaXB0aW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0JHByb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCByYW5nZTogSVJhbmdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFZTQnVmZmVyIHwgbnVsbD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zKFVSSS5yZXZpdmUocmVzb3VyY2UpLCByYW5nZSwgdG9rZW4pLCBudWxsLCB0b2tlbik7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyAtLS0gc3VnZ2VzdGlvblxuXG5cdHJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIsIHRyaWdnZXJDaGFyYWN0ZXJzOiBzdHJpbmdbXSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBDb21wbGV0aW9uc0FkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCB0aGlzLl9jb21tYW5kcy5jb252ZXJ0ZXIsIHByb3ZpZGVyLCB0aGlzLl9hcGlEZXByZWNhdGlvbiwgZXh0ZW5zaW9uKSwgZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJDb21wbGV0aW9uc1Byb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgdHJpZ2dlckNoYXJhY3RlcnMsIENvbXBsZXRpb25zQWRhcHRlci5zdXBwb3J0c1Jlc29sdmluZyhwcm92aWRlciksIGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklTdWdnZXN0UmVzdWx0RHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgQ29tcGxldGlvbnNBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhVUkkucmV2aXZlKHJlc291cmNlKSwgcG9zaXRpb24sIGNvbnRleHQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcmVzb2x2ZUNvbXBsZXRpb25JdGVtKGhhbmRsZTogbnVtYmVyLCBpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JU3VnZ2VzdERhdGFEdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBDb21wbGV0aW9uc0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZXNvbHZlQ29tcGxldGlvbkl0ZW0oaWQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcmVsZWFzZUNvbXBsZXRpb25JdGVtcyhoYW5kbGU6IG51bWJlciwgaWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgQ29tcGxldGlvbnNBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucmVsZWFzZUNvbXBsZXRpb25JdGVtcyhpZCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBnaG9zdCB0ZXh0XG5cblx0cmVnaXN0ZXJJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuSW5saW5lQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgbWV0YWRhdGE6IHZzY29kZS5JbmxpbmVDb21wbGV0aW9uSXRlbVByb3ZpZGVyTWV0YWRhdGEgfCB1bmRlZmluZWQpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBJbmxpbmVDb21wbGV0aW9uQWRhcHRlcihleHRlbnNpb24sIHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIsIHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlcik7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihhZGFwdGVyLCBleHRlbnNpb24pO1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cblx0XHRjb25zdCBzdXBwb3J0c09uRGlkQ2hhbmdlID0gaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnaW5saW5lQ29tcGxldGlvbnNBZGRpdGlvbnMnKSAmJiB0eXBlb2YgcHJvdmlkZXIub25EaWRDaGFuZ2UgPT09ICdmdW5jdGlvbic7XG5cdFx0aWYgKHN1cHBvcnRzT25EaWRDaGFuZ2UpIHtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlIShlID0+IHRoaXMuX3Byb3h5LiRlbWl0SW5saW5lQ29tcGxldGlvbnNDaGFuZ2UoaGFuZGxlLCBlID8geyBkYXRhOiBlLmRhdGEgfSA6IHVuZGVmaW5lZCkpO1xuXHRcdFx0cmVzdWx0ID0gRGlzcG9zYWJsZS5mcm9tKHJlc3VsdCwgc3Vic2NyaXB0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdXBwb3J0c09uRGlkQ2hhbmdlTW9kZWxJbmZvID0gaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnaW5saW5lQ29tcGxldGlvbnNBZGRpdGlvbnMnKSAmJiB0eXBlb2YgcHJvdmlkZXIub25EaWRDaGFuZ2VNb2RlbEluZm8gPT09ICdmdW5jdGlvbic7XG5cdFx0aWYgKHN1cHBvcnRzT25EaWRDaGFuZ2VNb2RlbEluZm8pIHtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlTW9kZWxJbmZvIShfID0+IHRoaXMuX3Byb3h5LiRlbWl0SW5saW5lQ29tcGxldGlvbk1vZGVsSW5mb0NoYW5nZShoYW5kbGUsIGFkYXB0ZXIubW9kZWxJbmZvKSk7XG5cdFx0XHRyZXN1bHQgPSBEaXNwb3NhYmxlLmZyb20ocmVzdWx0LCBzdWJzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1cHBvcnRzT25EaWRDaGFuZ2VQcm92aWRlck9wdGlvbnMgPSBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdpbmxpbmVDb21wbGV0aW9uc0FkZGl0aW9ucycpICYmIHR5cGVvZiBwcm92aWRlci5vbkRpZENoYW5nZVByb3ZpZGVyT3B0aW9ucyA9PT0gJ2Z1bmN0aW9uJztcblx0XHRpZiAoc3VwcG9ydHNPbkRpZENoYW5nZVByb3ZpZGVyT3B0aW9ucykge1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gcHJvdmlkZXIub25EaWRDaGFuZ2VQcm92aWRlck9wdGlvbnMhKF8gPT4gdGhpcy5fcHJveHkuJGVtaXRJbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJPcHRpb25zQ2hhbmdlKGhhbmRsZSwgYWRhcHRlci5wcm92aWRlck9wdGlvbnMpKTtcblx0XHRcdHJlc3VsdCA9IERpc3Bvc2FibGUuZnJvbShyZXN1bHQsIHN1YnNjcmlwdGlvbik7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlcklubGluZUNvbXBsZXRpb25zU3VwcG9ydChcblx0XHRcdGhhbmRsZSxcblx0XHRcdHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbiksXG5cdFx0XHRhZGFwdGVyLnN1cHBvcnRzSGFuZGxlRXZlbnRzLFxuXHRcdFx0RXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSksXG5cdFx0XHRleHRlbnNpb24udmVyc2lvbixcblx0XHRcdG1ldGFkYXRhPy5ncm91cElkID8gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShtZXRhZGF0YS5ncm91cElkKSA6IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhPy55aWVsZFRvPy5tYXAoZXh0SWQgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRJZCkpIHx8IFtdLFxuXHRcdFx0bWV0YWRhdGE/LmRpc3BsYXlOYW1lLFxuXHRcdFx0bWV0YWRhdGE/LmRlYm91bmNlRGVsYXlNcyxcblx0XHRcdG1ldGFkYXRhPy5leGNsdWRlcz8ubWFwKGV4dElkID0+IEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0SWQpKSB8fCBbXSxcblx0XHRcdHN1cHBvcnRzT25EaWRDaGFuZ2UsXG5cdFx0XHRhZGFwdGVyLnN1cHBvcnRzU2V0TW9kZWxJZCxcblx0XHRcdGFkYXB0ZXIubW9kZWxJbmZvLFxuXHRcdFx0c3VwcG9ydHNPbkRpZENoYW5nZU1vZGVsSW5mbyxcblx0XHRcdGFkYXB0ZXIuc3VwcG9ydHNTZXRQcm92aWRlck9wdGlvbixcblx0XHRcdGFkYXB0ZXIucHJvdmlkZXJPcHRpb25zLFxuXHRcdFx0c3VwcG9ydHNPbkRpZENoYW5nZVByb3ZpZGVyT3B0aW9ucyxcblx0XHQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQkcHJvdmlkZUlubGluZUNvbXBsZXRpb25zKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcG9zaXRpb246IElQb3NpdGlvbiwgY29udGV4dDogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9ucyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIElubGluZUNvbXBsZXRpb25BZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUlubGluZUNvbXBsZXRpb25zKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgY29udGV4dCwgdG9rZW4pLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkaGFuZGxlSW5saW5lQ29tcGxldGlvbkRpZFNob3coaGFuZGxlOiBudW1iZXIsIHBpZDogbnVtYmVyLCBpZHg6IG51bWJlciwgdXBkYXRlZEluc2VydFRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgSW5saW5lQ29tcGxldGlvbkFkYXB0ZXIsIGFzeW5jIGFkYXB0ZXIgPT4ge1xuXHRcdFx0YWRhcHRlci5oYW5kbGVEaWRTaG93Q29tcGxldGlvbkl0ZW0ocGlkLCBpZHgsIHVwZGF0ZWRJbnNlcnRUZXh0KTtcblx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkaGFuZGxlSW5saW5lQ29tcGxldGlvblBhcnRpYWxBY2NlcHQoaGFuZGxlOiBudW1iZXIsIHBpZDogbnVtYmVyLCBpZHg6IG51bWJlciwgYWNjZXB0ZWRDaGFyYWN0ZXJzOiBudW1iZXIsIGluZm86IGxhbmd1YWdlcy5QYXJ0aWFsQWNjZXB0SW5mbyk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgSW5saW5lQ29tcGxldGlvbkFkYXB0ZXIsIGFzeW5jIGFkYXB0ZXIgPT4ge1xuXHRcdFx0YWRhcHRlci5oYW5kbGVQYXJ0aWFsQWNjZXB0KHBpZCwgaWR4LCBhY2NlcHRlZENoYXJhY3RlcnMsIGluZm8pO1xuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdCRoYW5kbGVJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZldGltZShoYW5kbGU6IG51bWJlciwgcGlkOiBudW1iZXIsIGlkeDogbnVtYmVyLCByZWFzb246IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uPHsgcGlkOiBudW1iZXI7IGlkeDogbnVtYmVyIH0+KTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxpbmVDb21wbGV0aW9uQWRhcHRlciwgYXN5bmMgYWRhcHRlciA9PiB7XG5cdFx0XHRhZGFwdGVyLmhhbmRsZUVuZE9mTGlmZXRpbWUocGlkLCBpZHgsIHJlYXNvbik7XG5cdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0JGhhbmRsZUlubGluZUNvbXBsZXRpb25SZWplY3Rpb24oaGFuZGxlOiBudW1iZXIsIHBpZDogbnVtYmVyLCBpZHg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgSW5saW5lQ29tcGxldGlvbkFkYXB0ZXIsIGFzeW5jIGFkYXB0ZXIgPT4ge1xuXHRcdFx0YWRhcHRlci5oYW5kbGVSZWplY3Rpb24ocGlkLCBpZHgpO1xuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdCRmcmVlSW5saW5lQ29tcGxldGlvbnNMaXN0KGhhbmRsZTogbnVtYmVyLCBwaWQ6IG51bWJlciwgcmVhc29uOiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxpbmVDb21wbGV0aW9uQWRhcHRlciwgYXN5bmMgYWRhcHRlciA9PiB7IGFkYXB0ZXIuZGlzcG9zZUNvbXBsZXRpb25zKHBpZCwgcmVhc29uKTsgfSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0JGFjY2VwdElubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZShzdGF0ZTogSUlubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX2lubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlLmZpcmUoKTtcblx0fVxuXG5cdCRoYW5kbGVJbmxpbmVDb21wbGV0aW9uU2V0Q3VycmVudE1vZGVsSWQoaGFuZGxlOiBudW1iZXIsIG1vZGVsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgSW5saW5lQ29tcGxldGlvbkFkYXB0ZXIsIGFzeW5jIGFkYXB0ZXIgPT4ge1xuXHRcdFx0YWRhcHRlci5zZXRDdXJyZW50TW9kZWxJZChtb2RlbElkKTtcblx0XHR9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkaGFuZGxlSW5saW5lQ29tcGxldGlvblNldFByb3ZpZGVyT3B0aW9uKGhhbmRsZTogbnVtYmVyLCBvcHRpb25JZDogc3RyaW5nLCB2YWx1ZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIElubGluZUNvbXBsZXRpb25BZGFwdGVyLCBhc3luYyBhZGFwdGVyID0+IHtcblx0XHRcdGFkYXB0ZXIuc2V0UHJvdmlkZXJPcHRpb24ob3B0aW9uSWQsIHZhbHVlSWQpO1xuXHRcdH0sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBwYXJhbWV0ZXIgaGludHNcblxuXHRyZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlNpZ25hdHVyZUhlbHBQcm92aWRlciwgbWV0YWRhdGFPclRyaWdnZXJDaGFyczogc3RyaW5nW10gfCB2c2NvZGUuU2lnbmF0dXJlSGVscFByb3ZpZGVyTWV0YWRhdGEpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgbWV0YWRhdGE6IGV4dEhvc3RQcm90b2NvbC5JU2lnbmF0dXJlSGVscFByb3ZpZGVyTWV0YWRhdGFEdG8gfCB1bmRlZmluZWQgPSBBcnJheS5pc0FycmF5KG1ldGFkYXRhT3JUcmlnZ2VyQ2hhcnMpXG5cdFx0XHQ/IHsgdHJpZ2dlckNoYXJhY3RlcnM6IG1ldGFkYXRhT3JUcmlnZ2VyQ2hhcnMsIHJldHJpZ2dlckNoYXJhY3RlcnM6IFtdIH1cblx0XHRcdDogbWV0YWRhdGFPclRyaWdnZXJDaGFycztcblxuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IFNpZ25hdHVyZUhlbHBBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbiksIG1ldGFkYXRhKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVTaWduYXR1cmVIZWxwKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcG9zaXRpb246IElQb3NpdGlvbiwgY29udGV4dDogZXh0SG9zdFByb3RvY29sLklTaWduYXR1cmVIZWxwQ29udGV4dER0bywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVNpZ25hdHVyZUhlbHBEdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBTaWduYXR1cmVIZWxwQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVTaWduYXR1cmVIZWxwKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgY29udGV4dCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZWxlYXNlU2lnbmF0dXJlSGVscChoYW5kbGU6IG51bWJlciwgaWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgU2lnbmF0dXJlSGVscEFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZWxlYXNlU2lnbmF0dXJlSGVscChpZCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBpbmxpbmUgaGludHNcblxuXHRyZWdpc3RlcklubGF5SGludHNQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLklubGF5SGludHNQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblxuXHRcdGNvbnN0IGV2ZW50SGFuZGxlID0gdHlwZW9mIHByb3ZpZGVyLm9uRGlkQ2hhbmdlSW5sYXlIaW50cyA9PT0gJ2Z1bmN0aW9uJyA/IHRoaXMuX25leHRIYW5kbGUoKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBJbmxheUhpbnRzQWRhcHRlcih0aGlzLl9kb2N1bWVudHMsIHRoaXMuX2NvbW1hbmRzLmNvbnZlcnRlciwgcHJvdmlkZXIsIHRoaXMuX2xvZ1NlcnZpY2UsIGV4dGVuc2lvbiksIGV4dGVuc2lvbik7XG5cblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJJbmxheUhpbnRzUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCB0eXBlb2YgcHJvdmlkZXIucmVzb2x2ZUlubGF5SGludCA9PT0gJ2Z1bmN0aW9uJywgZXZlbnRIYW5kbGUsIEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9leHRMYWJlbChleHRlbnNpb24pKTtcblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXG5cdFx0aWYgKGV2ZW50SGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlSW5sYXlIaW50cyEodXJpID0+IHRoaXMuX3Byb3h5LiRlbWl0SW5sYXlIaW50c0V2ZW50KGV2ZW50SGFuZGxlKSk7XG5cdFx0XHRyZXN1bHQgPSBEaXNwb3NhYmxlLmZyb20ocmVzdWx0LCBzdWJzY3JpcHRpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0JHByb3ZpZGVJbmxheUhpbnRzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmFuZ2U6IElSYW5nZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSUlubGF5SGludHNEdG8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxheUhpbnRzQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVJbmxheUhpbnRzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCByYW5nZSwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZXNvbHZlSW5sYXlIaW50KGhhbmRsZTogbnVtYmVyLCBpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JSW5sYXlIaW50RHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgSW5sYXlIaW50c0FkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZXNvbHZlSW5sYXlIaW50KGlkLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHJlbGVhc2VJbmxheUhpbnRzKGhhbmRsZTogbnVtYmVyLCBpZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBJbmxheUhpbnRzQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnJlbGVhc2VIaW50cyhpZCksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBsaW5rc1xuXG5cdHJlZ2lzdGVyRG9jdW1lbnRMaW5rUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudExpbmtQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9hZGROZXdBZGFwdGVyKG5ldyBMaW5rUHJvdmlkZXJBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRvY3VtZW50TGlua1Byb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgdHlwZW9mIHByb3ZpZGVyLnJlc29sdmVEb2N1bWVudExpbmsgPT09ICdmdW5jdGlvbicpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJvdmlkZURvY3VtZW50TGlua3MoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JTGlua3NMaXN0RHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgTGlua1Byb3ZpZGVyQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVMaW5rcyhVUkkucmV2aXZlKHJlc291cmNlKSwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuLCByZXNvdXJjZS5zY2hlbWUgPT09ICdvdXRwdXQnKTtcblx0fVxuXG5cdCRyZXNvbHZlRG9jdW1lbnRMaW5rKGhhbmRsZTogbnVtYmVyLCBpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JTGlua0R0byB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIExpbmtQcm92aWRlckFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZXNvbHZlTGluayhpZCwgdG9rZW4pLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cblxuXHQkcmVsZWFzZURvY3VtZW50TGlua3MoaGFuZGxlOiBudW1iZXIsIGlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIExpbmtQcm92aWRlckFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5yZWxlYXNlTGlua3MoaWQpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cblxuXHRyZWdpc3RlckNvbG9yUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudENvbG9yUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgQ29sb3JQcm92aWRlckFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyRG9jdW1lbnRDb2xvclByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcm92aWRlRG9jdW1lbnRDb2xvcnMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JUmF3Q29sb3JJbmZvW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBDb2xvclByb3ZpZGVyQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVDb2xvcnMoVVJJLnJldml2ZShyZXNvdXJjZSksIHRva2VuKSwgW10sIHRva2VuKTtcblx0fVxuXG5cdCRwcm92aWRlQ29sb3JQcmVzZW50YXRpb25zKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgY29sb3JJbmZvOiBleHRIb3N0UHJvdG9jb2wuSVJhd0NvbG9ySW5mbywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuSUNvbG9yUHJlc2VudGF0aW9uW10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBDb2xvclByb3ZpZGVyQWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVDb2xvclByZXNlbnRhdGlvbnMoVVJJLnJldml2ZShyZXNvdXJjZSksIGNvbG9ySW5mbywgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdHJlZ2lzdGVyRm9sZGluZ1JhbmdlUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Gb2xkaW5nUmFuZ2VQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9uZXh0SGFuZGxlKCk7XG5cdFx0Y29uc3QgZXZlbnRIYW5kbGUgPSB0eXBlb2YgcHJvdmlkZXIub25EaWRDaGFuZ2VGb2xkaW5nUmFuZ2VzID09PSAnZnVuY3Rpb24nID8gdGhpcy5fbmV4dEhhbmRsZSgpIDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fYWRhcHRlci5zZXQoaGFuZGxlLCBuZXcgQWRhcHRlckRhdGEobmV3IEZvbGRpbmdQcm92aWRlckFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbikpO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckZvbGRpbmdSYW5nZVByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGV2ZW50SGFuZGxlKTtcblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXG5cdFx0aWYgKGV2ZW50SGFuZGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlRm9sZGluZ1JhbmdlcyEoKCkgPT4gdGhpcy5fcHJveHkuJGVtaXRGb2xkaW5nUmFuZ2VFdmVudChldmVudEhhbmRsZSkpO1xuXHRcdFx0cmVzdWx0ID0gRGlzcG9zYWJsZS5mcm9tKHJlc3VsdCwgc3Vic2NyaXB0aW9uKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0JHByb3ZpZGVGb2xkaW5nUmFuZ2VzKGhhbmRsZTogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgY29udGV4dDogdnNjb2RlLkZvbGRpbmdDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihcblx0XHRcdGhhbmRsZSxcblx0XHRcdEZvbGRpbmdQcm92aWRlckFkYXB0ZXIsXG5cdFx0XHQoYWRhcHRlcikgPT5cblx0XHRcdFx0YWRhcHRlci5wcm92aWRlRm9sZGluZ1JhbmdlcyhVUkkucmV2aXZlKHJlc291cmNlKSwgY29udGV4dCwgdG9rZW4pLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dG9rZW5cblx0XHQpO1xuXHR9XG5cblx0Ly8gLS0tIHNtYXJ0IHNlbGVjdFxuXG5cdHJlZ2lzdGVyU2VsZWN0aW9uUmFuZ2VQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yLCBwcm92aWRlcjogdnNjb2RlLlNlbGVjdGlvblJhbmdlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgU2VsZWN0aW9uUmFuZ2VBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIsIHRoaXMuX2xvZ1NlcnZpY2UpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclNlbGVjdGlvblJhbmdlUHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVTZWxlY3Rpb25SYW5nZXMoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbnM6IElQb3NpdGlvbltdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5TZWxlY3Rpb25SYW5nZVtdW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBTZWxlY3Rpb25SYW5nZUFkYXB0ZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcm92aWRlU2VsZWN0aW9uUmFuZ2VzKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbnMsIHRva2VuKSwgW10sIHRva2VuKTtcblx0fVxuXG5cdC8vIC0tLSBjYWxsIGhpZXJhcmNoeVxuXG5cdHJlZ2lzdGVyQ2FsbEhpZXJhcmNoeVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuQ2FsbEhpZXJhcmNoeVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FkZE5ld0FkYXB0ZXIobmV3IENhbGxIaWVyYXJjaHlBZGFwdGVyKHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIpLCBleHRlbnNpb24pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckNhbGxIaWVyYXJjaHlQcm92aWRlcihoYW5kbGUsIHRoaXMuX3RyYW5zZm9ybURvY3VtZW50U2VsZWN0b3Ioc2VsZWN0b3IsIGV4dGVuc2lvbikpO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJlcGFyZUNhbGxIaWVyYXJjaHkoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCBwb3NpdGlvbjogSVBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JQ2FsbEhpZXJhcmNoeUl0ZW1EdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENhbGxIaWVyYXJjaHlBZGFwdGVyLCBhZGFwdGVyID0+IFByb21pc2UucmVzb2x2ZShhZGFwdGVyLnByZXBhcmVTZXNzaW9uKFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgdG9rZW4pKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcHJvdmlkZUNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGxzKGhhbmRsZTogbnVtYmVyLCBzZXNzaW9uSWQ6IHN0cmluZywgaXRlbUlkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklJbmNvbWluZ0NhbGxEdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENhbGxIaWVyYXJjaHlBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUNhbGxzVG8oc2Vzc2lvbklkLCBpdGVtSWQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcHJvdmlkZUNhbGxIaWVyYXJjaHlPdXRnb2luZ0NhbGxzKGhhbmRsZTogbnVtYmVyLCBzZXNzaW9uSWQ6IHN0cmluZywgaXRlbUlkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklPdXRnb2luZ0NhbGxEdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENhbGxIaWVyYXJjaHlBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZUNhbGxzRnJvbShzZXNzaW9uSWQsIGl0ZW1JZCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZWxlYXNlQ2FsbEhpZXJhcmNoeShoYW5kbGU6IG51bWJlciwgc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIENhbGxIaWVyYXJjaHlBZGFwdGVyLCBhZGFwdGVyID0+IFByb21pc2UucmVzb2x2ZShhZGFwdGVyLnJlbGVhc2VTZXNzaW9uKHNlc3Npb25JZCkpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvLyAtLS0gdHlwZSBoaWVyYXJjaHlcblx0cmVnaXN0ZXJUeXBlSGllcmFyY2h5UHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5UeXBlSGllcmFyY2h5UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fYWRkTmV3QWRhcHRlcihuZXcgVHlwZUhpZXJhcmNoeUFkYXB0ZXIodGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciksIGV4dGVuc2lvbik7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyVHlwZUhpZXJhcmNoeVByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURpc3Bvc2FibGUoaGFuZGxlKTtcblx0fVxuXG5cdCRwcmVwYXJlVHlwZUhpZXJhcmNoeShoYW5kbGU6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLklUeXBlSGllcmFyY2h5SXRlbUR0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpdGhBZGFwdGVyKGhhbmRsZSwgVHlwZUhpZXJhcmNoeUFkYXB0ZXIsIGFkYXB0ZXIgPT4gUHJvbWlzZS5yZXNvbHZlKGFkYXB0ZXIucHJlcGFyZVNlc3Npb24oVVJJLnJldml2ZShyZXNvdXJjZSksIHBvc2l0aW9uLCB0b2tlbikpLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRwcm92aWRlVHlwZUhpZXJhcmNoeVN1cGVydHlwZXMoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25JZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVR5cGVIaWVyYXJjaHlJdGVtRHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBUeXBlSGllcmFyY2h5QWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVTdXBlcnR5cGVzKHNlc3Npb25JZCwgaXRlbUlkLCB0b2tlbiksIHVuZGVmaW5lZCwgdG9rZW4pO1xuXHR9XG5cblx0JHByb3ZpZGVUeXBlSGllcmFyY2h5U3VidHlwZXMoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25JZDogc3RyaW5nLCBpdGVtSWQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSVR5cGVIaWVyYXJjaHlJdGVtRHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBUeXBlSGllcmFyY2h5QWRhcHRlciwgYWRhcHRlciA9PiBhZGFwdGVyLnByb3ZpZGVTdWJ0eXBlcyhzZXNzaW9uSWQsIGl0ZW1JZCwgdG9rZW4pLCB1bmRlZmluZWQsIHRva2VuKTtcblx0fVxuXG5cdCRyZWxlYXNlVHlwZUhpZXJhcmNoeShoYW5kbGU6IG51bWJlciwgc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIFR5cGVIaWVyYXJjaHlBZGFwdGVyLCBhZGFwdGVyID0+IFByb21pc2UucmVzb2x2ZShhZGFwdGVyLnJlbGVhc2VTZXNzaW9uKHNlc3Npb25JZCkpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvLyAtLS0gRG9jdW1lbnQgb24gZHJvcFxuXG5cdHJlZ2lzdGVyRG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuRG9jdW1lbnRTZWxlY3RvciwgcHJvdmlkZXI6IHZzY29kZS5Eb2N1bWVudERyb3BFZGl0UHJvdmlkZXIsIG1ldGFkYXRhPzogdnNjb2RlLkRvY3VtZW50RHJvcEVkaXRQcm92aWRlck1ldGFkYXRhKSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fbmV4dEhhbmRsZSgpO1xuXHRcdHRoaXMuX2FkYXB0ZXIuc2V0KGhhbmRsZSwgbmV3IEFkYXB0ZXJEYXRhKG5ldyBEb2N1bWVudERyb3BFZGl0QWRhcHRlcih0aGlzLl9wcm94eSwgdGhpcy5fZG9jdW1lbnRzLCBwcm92aWRlciwgaGFuZGxlLCBleHRlbnNpb24pLCBleHRlbnNpb24pKTtcblxuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckRvY3VtZW50T25Ecm9wRWRpdFByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fdHJhbnNmb3JtRG9jdW1lbnRTZWxlY3RvcihzZWxlY3RvciwgZXh0ZW5zaW9uKSwgbWV0YWRhdGEgPyB7XG5cdFx0XHRzdXBwb3J0c1Jlc29sdmU6ICEhcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50RHJvcEVkaXQsXG5cdFx0XHRkcm9wTWltZVR5cGVzOiBtZXRhZGF0YS5kcm9wTWltZVR5cGVzLFxuXHRcdFx0cHJvdmlkZWREcm9wS2luZHM6IG1ldGFkYXRhLnByb3ZpZGVkRHJvcEVkaXRLaW5kcz8ubWFwKHggPT4geC52YWx1ZSksXG5cdFx0fSA6IHVuZGVmaW5lZCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHByb3ZpZGVEb2N1bWVudE9uRHJvcEVkaXRzKGhhbmRsZTogbnVtYmVyLCByZXF1ZXN0SWQ6IG51bWJlciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHBvc2l0aW9uOiBJUG9zaXRpb24sIGRhdGFUcmFuc2ZlckR0bzogZXh0SG9zdFByb3RvY29sLkRhdGFUcmFuc2ZlckRUTywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxleHRIb3N0UHJvdG9jb2wuSURvY3VtZW50RHJvcEVkaXREdG9bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50RHJvcEVkaXRBZGFwdGVyLCBhZGFwdGVyID0+XG5cdFx0XHRQcm9taXNlLnJlc29sdmUoYWRhcHRlci5wcm92aWRlRG9jdW1lbnRPbkRyb3BFZGl0cyhyZXF1ZXN0SWQsIFVSSS5yZXZpdmUocmVzb3VyY2UpLCBwb3NpdGlvbiwgZGF0YVRyYW5zZmVyRHRvLCB0b2tlbikpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQkcmVzb2x2ZURyb3BFZGl0KGhhbmRsZTogbnVtYmVyLCBpZDogZXh0SG9zdFByb3RvY29sLkNoYWluZWRDYWNoZUlkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgYWRkaXRpb25hbEVkaXQ/OiBleHRIb3N0UHJvdG9jb2wuSVdvcmtzcGFjZUVkaXREdG8gfT4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50RHJvcEVkaXRBZGFwdGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucmVzb2x2ZURyb3BFZGl0KGlkLCB0b2tlbiksIHt9LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0JHJlbGVhc2VEb2N1bWVudE9uRHJvcEVkaXRzKGhhbmRsZTogbnVtYmVyLCBjYWNoZUlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50RHJvcEVkaXRBZGFwdGVyLCBhZGFwdGVyID0+IFByb21pc2UucmVzb2x2ZShhZGFwdGVyLnJlbGVhc2VEcm9wRWRpdHMoY2FjaGVJZCkpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvLyAtLS0gY29weS9wYXN0ZSBhY3Rpb25zXG5cblx0cmVnaXN0ZXJEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkRvY3VtZW50U2VsZWN0b3IsIHByb3ZpZGVyOiB2c2NvZGUuRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciwgbWV0YWRhdGE6IHZzY29kZS5Eb2N1bWVudFBhc3RlUHJvdmlkZXJNZXRhZGF0YSk6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9uZXh0SGFuZGxlKCk7XG5cdFx0dGhpcy5fYWRhcHRlci5zZXQoaGFuZGxlLCBuZXcgQWRhcHRlckRhdGEobmV3IERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIodGhpcy5fcHJveHksIHRoaXMuX2RvY3VtZW50cywgcHJvdmlkZXIsIGhhbmRsZSwgZXh0ZW5zaW9uKSwgZXh0ZW5zaW9uKSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyUGFzdGVFZGl0UHJvdmlkZXIoaGFuZGxlLCB0aGlzLl90cmFuc2Zvcm1Eb2N1bWVudFNlbGVjdG9yKHNlbGVjdG9yLCBleHRlbnNpb24pLCB7XG5cdFx0XHRzdXBwb3J0c0NvcHk6ICEhcHJvdmlkZXIucHJlcGFyZURvY3VtZW50UGFzdGUsXG5cdFx0XHRzdXBwb3J0c1Bhc3RlOiAhIXByb3ZpZGVyLnByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMsXG5cdFx0XHRzdXBwb3J0c1Jlc29sdmU6ICEhcHJvdmlkZXIucmVzb2x2ZURvY3VtZW50UGFzdGVFZGl0LFxuXHRcdFx0cHJvdmlkZWRQYXN0ZUVkaXRLaW5kczogbWV0YWRhdGEucHJvdmlkZWRQYXN0ZUVkaXRLaW5kcz8ubWFwKHggPT4geC52YWx1ZSksXG5cdFx0XHRjb3B5TWltZVR5cGVzOiBtZXRhZGF0YS5jb3B5TWltZVR5cGVzLFxuXHRcdFx0cGFzdGVNaW1lVHlwZXM6IG1ldGFkYXRhLnBhc3RlTWltZVR5cGVzLFxuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVEaXNwb3NhYmxlKGhhbmRsZSk7XG5cdH1cblxuXHQkcHJlcGFyZURvY3VtZW50UGFzdGUoaGFuZGxlOiBudW1iZXIsIHJlc291cmNlOiBVcmlDb21wb25lbnRzLCByYW5nZXM6IElSYW5nZVtdLCBkYXRhVHJhbnNmZXI6IGV4dEhvc3RQcm90b2NvbC5EYXRhVHJhbnNmZXJEVE8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8ZXh0SG9zdFByb3RvY29sLkRhdGFUcmFuc2ZlckRUTyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl93aXRoQWRhcHRlcihoYW5kbGUsIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIsIGFkYXB0ZXIgPT4gYWRhcHRlci5wcmVwYXJlRG9jdW1lbnRQYXN0ZShVUkkucmV2aXZlKHJlc291cmNlKSwgcmFuZ2VzLCBkYXRhVHJhbnNmZXIsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcHJvdmlkZVBhc3RlRWRpdHMoaGFuZGxlOiBudW1iZXIsIHJlcXVlc3RJZDogbnVtYmVyLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmFuZ2VzOiBJUmFuZ2VbXSwgZGF0YVRyYW5zZmVyRHRvOiBleHRIb3N0UHJvdG9jb2wuRGF0YVRyYW5zZmVyRFRPLCBjb250ZXh0OiBleHRIb3N0UHJvdG9jb2wuSURvY3VtZW50UGFzdGVDb250ZXh0RHRvLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGV4dEhvc3RQcm90b2NvbC5JUGFzdGVFZGl0RHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucHJvdmlkZVBhc3RlRWRpdHMocmVxdWVzdElkLCBVUkkucmV2aXZlKHJlc291cmNlKSwgcmFuZ2VzLCBkYXRhVHJhbnNmZXJEdG8sIGNvbnRleHQsIHRva2VuKSwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHQkcmVzb2x2ZVBhc3RlRWRpdChoYW5kbGU6IG51bWJlciwgaWQ6IGV4dEhvc3RQcm90b2NvbC5DaGFpbmVkQ2FjaGVJZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGFkZGl0aW9uYWxFZGl0PzogZXh0SG9zdFByb3RvY29sLklXb3Jrc3BhY2VFZGl0RHRvIH0+IHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLCBhZGFwdGVyID0+IGFkYXB0ZXIucmVzb2x2ZVBhc3RlRWRpdChpZCwgdG9rZW4pLCB7fSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdCRyZWxlYXNlUGFzdGVFZGl0cyhoYW5kbGU6IG51bWJlciwgY2FjaGVJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aEFkYXB0ZXIoaGFuZGxlLCBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLCBhZGFwdGVyID0+IFByb21pc2UucmVzb2x2ZShhZGFwdGVyLnJlbGVhc2VQYXN0ZUVkaXRzKGNhY2hlSWQpKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Ly8gLS0tIGNvbmZpZ3VyYXRpb25cblxuXHRwcml2YXRlIHN0YXRpYyBfc2VyaWFsaXplUmVnRXhwKHJlZ0V4cDogUmVnRXhwKTogZXh0SG9zdFByb3RvY29sLklSZWdFeHBEdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXR0ZXJuOiByZWdFeHAuc291cmNlLFxuXHRcdFx0ZmxhZ3M6IHJlZ0V4cC5mbGFncyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NlcmlhbGl6ZUluZGVudGF0aW9uUnVsZShpbmRlbnRhdGlvblJ1bGU6IHZzY29kZS5JbmRlbnRhdGlvblJ1bGUpOiBleHRIb3N0UHJvdG9jb2wuSUluZGVudGF0aW9uUnVsZUR0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZVJlZ0V4cChpbmRlbnRhdGlvblJ1bGUuZGVjcmVhc2VJbmRlbnRQYXR0ZXJuKSxcblx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZVJlZ0V4cChpbmRlbnRhdGlvblJ1bGUuaW5jcmVhc2VJbmRlbnRQYXR0ZXJuKSxcblx0XHRcdGluZGVudE5leHRMaW5lUGF0dGVybjogaW5kZW50YXRpb25SdWxlLmluZGVudE5leHRMaW5lUGF0dGVybiA/IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9zZXJpYWxpemVSZWdFeHAoaW5kZW50YXRpb25SdWxlLmluZGVudE5leHRMaW5lUGF0dGVybikgOiB1bmRlZmluZWQsXG5cdFx0XHR1bkluZGVudGVkTGluZVBhdHRlcm46IGluZGVudGF0aW9uUnVsZS51bkluZGVudGVkTGluZVBhdHRlcm4gPyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplUmVnRXhwKGluZGVudGF0aW9uUnVsZS51bkluZGVudGVkTGluZVBhdHRlcm4pIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc2VyaWFsaXplT25FbnRlclJ1bGUob25FbnRlclJ1bGU6IHZzY29kZS5PbkVudGVyUnVsZSk6IGV4dEhvc3RQcm90b2NvbC5JT25FbnRlclJ1bGVEdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRiZWZvcmVUZXh0OiBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplUmVnRXhwKG9uRW50ZXJSdWxlLmJlZm9yZVRleHQpLFxuXHRcdFx0YWZ0ZXJUZXh0OiBvbkVudGVyUnVsZS5hZnRlclRleHQgPyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplUmVnRXhwKG9uRW50ZXJSdWxlLmFmdGVyVGV4dCkgOiB1bmRlZmluZWQsXG5cdFx0XHRwcmV2aW91c0xpbmVUZXh0OiBvbkVudGVyUnVsZS5wcmV2aW91c0xpbmVUZXh0ID8gRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZVJlZ0V4cChvbkVudGVyUnVsZS5wcmV2aW91c0xpbmVUZXh0KSA6IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbjogb25FbnRlclJ1bGUuYWN0aW9uXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXJpYWxpemVPbkVudGVyUnVsZXMob25FbnRlclJ1bGVzOiB2c2NvZGUuT25FbnRlclJ1bGVbXSk6IGV4dEhvc3RQcm90b2NvbC5JT25FbnRlclJ1bGVEdG9bXSB7XG5cdFx0cmV0dXJuIG9uRW50ZXJSdWxlcy5tYXAoRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZU9uRW50ZXJSdWxlKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zZXJpYWxpemVBdXRvQ2xvc2luZ1BhaXIoYXV0b0Nsb3NpbmdQYWlyOiB2c2NvZGUuQXV0b0Nsb3NpbmdQYWlyKTogSUF1dG9DbG9zaW5nUGFpckNvbmRpdGlvbmFsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3BlbjogYXV0b0Nsb3NpbmdQYWlyLm9wZW4sXG5cdFx0XHRjbG9zZTogYXV0b0Nsb3NpbmdQYWlyLmNsb3NlLFxuXHRcdFx0bm90SW46IGF1dG9DbG9zaW5nUGFpci5ub3RJbiA/IGF1dG9DbG9zaW5nUGFpci5ub3RJbi5tYXAodiA9PiBTeW50YXhUb2tlblR5cGUudG9TdHJpbmcodikpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc2VyaWFsaXplQXV0b0Nsb3NpbmdQYWlycyhhdXRvQ2xvc2luZ1BhaXJzOiB2c2NvZGUuQXV0b0Nsb3NpbmdQYWlyW10pOiBJQXV0b0Nsb3NpbmdQYWlyQ29uZGl0aW9uYWxbXSB7XG5cdFx0cmV0dXJuIGF1dG9DbG9zaW5nUGFpcnMubWFwKEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9zZXJpYWxpemVBdXRvQ2xvc2luZ1BhaXIpO1xuXHR9XG5cblx0c2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IHZzY29kZS5MYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgeyB3b3JkUGF0dGVybiB9ID0gY29uZmlndXJhdGlvbjtcblxuXHRcdC8vIGNoZWNrIGZvciBhIHZhbGlkIHdvcmQgcGF0dGVyblxuXHRcdGlmICh3b3JkUGF0dGVybiAmJiByZWdFeHBMZWFkc1RvRW5kbGVzc0xvb3Aod29yZFBhdHRlcm4pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogd29yZFBhdHRlcm4gJyR7d29yZFBhdHRlcm59JyBpcyBub3QgYWxsb3dlZCB0byBtYXRjaCB0aGUgZW1wdHkgc3RyaW5nLmApO1xuXHRcdH1cblxuXHRcdC8vIHdvcmQgZGVmaW5pdGlvblxuXHRcdGlmICh3b3JkUGF0dGVybikge1xuXHRcdFx0dGhpcy5fZG9jdW1lbnRzLnNldFdvcmREZWZpbml0aW9uRm9yKGxhbmd1YWdlSWQsIHdvcmRQYXR0ZXJuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZG9jdW1lbnRzLnNldFdvcmREZWZpbml0aW9uRm9yKGxhbmd1YWdlSWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24uX19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQpIHtcblx0XHRcdHRoaXMuX2FwaURlcHJlY2F0aW9uLnJlcG9ydCgnTGFuZ3VhZ2VDb25maWd1cmF0aW9uLl9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0JywgZXh0ZW5zaW9uLFxuXHRcdFx0XHRgRG8gbm90IHVzZS5gKTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlndXJhdGlvbi5fX2NoYXJhY3RlclBhaXJTdXBwb3J0KSB7XG5cdFx0XHR0aGlzLl9hcGlEZXByZWNhdGlvbi5yZXBvcnQoJ0xhbmd1YWdlQ29uZmlndXJhdGlvbi5fX2NoYXJhY3RlclBhaXJTdXBwb3J0JywgZXh0ZW5zaW9uLFxuXHRcdFx0XHRgRG8gbm90IHVzZS5gKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9uZXh0SGFuZGxlKCk7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZENvbmZpZ3VyYXRpb246IGV4dEhvc3RQcm90b2NvbC5JTGFuZ3VhZ2VDb25maWd1cmF0aW9uRHRvID0ge1xuXHRcdFx0Y29tbWVudHM6IGNvbmZpZ3VyYXRpb24uY29tbWVudHMsXG5cdFx0XHRicmFja2V0czogY29uZmlndXJhdGlvbi5icmFja2V0cyxcblx0XHRcdHdvcmRQYXR0ZXJuOiBjb25maWd1cmF0aW9uLndvcmRQYXR0ZXJuID8gRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZVJlZ0V4cChjb25maWd1cmF0aW9uLndvcmRQYXR0ZXJuKSA6IHVuZGVmaW5lZCxcblx0XHRcdGluZGVudGF0aW9uUnVsZXM6IGNvbmZpZ3VyYXRpb24uaW5kZW50YXRpb25SdWxlcyA/IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzLl9zZXJpYWxpemVJbmRlbnRhdGlvblJ1bGUoY29uZmlndXJhdGlvbi5pbmRlbnRhdGlvblJ1bGVzKSA6IHVuZGVmaW5lZCxcblx0XHRcdG9uRW50ZXJSdWxlczogY29uZmlndXJhdGlvbi5vbkVudGVyUnVsZXMgPyBFeHRIb3N0TGFuZ3VhZ2VGZWF0dXJlcy5fc2VyaWFsaXplT25FbnRlclJ1bGVzKGNvbmZpZ3VyYXRpb24ub25FbnRlclJ1bGVzKSA6IHVuZGVmaW5lZCxcblx0XHRcdF9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0OiBjb25maWd1cmF0aW9uLl9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0LFxuXHRcdFx0X19jaGFyYWN0ZXJQYWlyU3VwcG9ydDogY29uZmlndXJhdGlvbi5fX2NoYXJhY3RlclBhaXJTdXBwb3J0LFxuXHRcdFx0YXV0b0Nsb3NpbmdQYWlyczogY29uZmlndXJhdGlvbi5hdXRvQ2xvc2luZ1BhaXJzID8gRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMuX3NlcmlhbGl6ZUF1dG9DbG9zaW5nUGFpcnMoY29uZmlndXJhdGlvbi5hdXRvQ2xvc2luZ1BhaXJzKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0dGhpcy5fcHJveHkuJHNldExhbmd1YWdlQ29uZmlndXJhdGlvbihoYW5kbGUsIGxhbmd1YWdlSWQsIHNlcmlhbGl6ZWRDb25maWd1cmF0aW9uKTtcblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGlzcG9zYWJsZShoYW5kbGUpO1xuXHR9XG5cblx0JHNldFdvcmREZWZpbml0aW9ucyh3b3JkRGVmaW5pdGlvbnM6IGV4dEhvc3RQcm90b2NvbC5JTGFuZ3VhZ2VXb3JkRGVmaW5pdGlvbkR0b1tdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB3b3JkRGVmaW5pdGlvbiBvZiB3b3JkRGVmaW5pdGlvbnMpIHtcblx0XHRcdHRoaXMuX2RvY3VtZW50cy5zZXRXb3JkRGVmaW5pdGlvbkZvcih3b3JkRGVmaW5pdGlvbi5sYW5ndWFnZUlkLCBuZXcgUmVnRXhwKHdvcmREZWZpbml0aW9uLnJlZ2V4U291cmNlLCB3b3JkRGVmaW5pdGlvbi5yZWdleEZsYWdzKSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLFNBQVMsVUFBVSxnQkFBZ0IsdUJBQXVCO0FBQ25FLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixjQUFjLHNCQUFzQjtBQUM5RCxTQUFTLFFBQVEsYUFBYTtBQUM5QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLFlBQVksZ0JBQWdCO0FBQ3JDLFNBQVMsV0FBMEI7QUFFbkMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxTQUFTLG1CQUEyQjtBQUM3QyxTQUFxQixpQkFBaUI7QUFDdEMsWUFBWSxlQUFlO0FBRTNCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQWtEO0FBRTNELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsYUFBYTtBQUN0QixZQUFZLHFCQUFxQjtBQU1qQyxZQUFZLGlCQUFpQjtBQUM3QixTQUFTLFlBQVksZ0JBQWdCLGdCQUFnQixjQUFjLFlBQVksNkJBQTZCLGdCQUFnQixvQ0FBb0MsNkJBQTZCLDBCQUEwQixVQUFVLDBCQUEwQixPQUFPLGdCQUFnQixvQkFBb0IscUJBQXFCLGVBQWtDLHVCQUF1QjtBQUNwWCxTQUFTLGVBQWU7QUFLeEIsTUFBTSxzQkFBc0I7QUFBQSxFQUUzQixZQUNrQixZQUNBLFdBQ2hCO0FBRmdCO0FBQ0E7QUFBQSxFQUNkO0FBQUEsRUFFSixNQUFNLHVCQUF1QixVQUFlLE9BQTJFO0FBQ3RILFVBQU0sTUFBTSxLQUFLLFdBQVcsWUFBWSxRQUFRO0FBQ2hELFVBQU0sUUFBUSxNQUFNLEtBQUssVUFBVSx1QkFBdUIsS0FBSyxLQUFLO0FBQ3BFLFFB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
