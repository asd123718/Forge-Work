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
import { createStringDataTransferItem, VSDataTransfer } from "../../../base/common/dataTransfer.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { HierarchicalKind } from "../../../base/common/hierarchicalKind.js";
import { combinedDisposable, Disposable, DisposableMap, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { revive } from "../../../base/common/marshalling.js";
import { mixin } from "../../../base/common/objects.js";
import { URI } from "../../../base/common/uri.js";
import * as languages from "../../../editor/common/languages.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../editor/common/languages/languageConfigurationRegistry.js";
import { ILanguageFeaturesService } from "../../../editor/common/services/languageFeatures.js";
import { decodeSemanticTokensDto } from "../../../editor/common/services/semanticTokensDto.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { reviveWorkspaceEditDto } from "./mainThreadBulkEdits.js";
import * as typeConvert from "../common/extHostTypeConverters.js";
import { DataTransferFileCache } from "../common/shared/dataTransferCache.js";
import * as callh from "../../contrib/callHierarchy/common/callHierarchy.js";
import * as search from "../../contrib/search/common/search.js";
import * as typeh from "../../contrib/typeHierarchy/common/typeHierarchy.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, ISuggestDataDtoField, ISuggestResultDtoField, MainContext } from "../common/extHost.protocol.js";
import { InlineCompletionEndOfLifeReasonKind } from "../common/extHostTypes.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { DataChannelForwardingTelemetryService, forwardToChannelIf, isCopilotLikeExtension } from "../../../platform/dataChannel/browser/forwardingTelemetryService.js";
import { IAiEditTelemetryService } from "../../contrib/editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { EditDeltaInfo } from "../../../editor/common/textModelEditSource.js";
import { IInlineCompletionsUnificationService } from "../../services/inlineCompletions/common/inlineCompletionsUnification.js";
import { sendInlineCompletionsEndOfLifeTelemetry } from "../../../editor/contrib/inlineCompletions/browser/telemetry.js";
let MainThreadLanguageFeatures = class extends Disposable {
  constructor(extHostContext, _languageService, _languageConfigurationService, _languageFeaturesService, _uriIdentService, _instantiationService, _inlineCompletionsUnificationService) {
    super();
    this._languageService = _languageService;
    this._languageConfigurationService = _languageConfigurationService;
    this._languageFeaturesService = _languageFeaturesService;
    this._uriIdentService = _uriIdentService;
    this._instantiationService = _instantiationService;
    this._inlineCompletionsUnificationService = _inlineCompletionsUnificationService;
    this._registrations = this._register(new DisposableMap());
    // --- copy paste action provider
    this._pasteEditProviders = /* @__PURE__ */ new Map();
    // --- document drop Edits
    this._documentOnDropEditProviders = /* @__PURE__ */ new Map();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLanguageFeatures);
    if (this._languageService) {
      const updateAllWordDefinitions = () => {
        const wordDefinitionDtos = [];
        for (const languageId of _languageService.getRegisteredLanguageIds()) {
          const wordDefinition = this._languageConfigurationService.getLanguageConfiguration(languageId).getWordDefinition();
          wordDefinitionDtos.push({
            languageId,
            regexSource: wordDefinition.source,
            regexFlags: wordDefinition.flags
          });
        }
        this._proxy.$setWordDefinitions(wordDefinitionDtos);
      };
      this._register(this._languageConfigurationService.onDidChange((e) => {
        if (!e.languageId) {
          updateAllWordDefinitions();
        } else {
          const wordDefinition = this._languageConfigurationService.getLanguageConfiguration(e.languageId).getWordDefinition();
          this._proxy.$setWordDefinitions([{
            languageId: e.languageId,
            regexSource: wordDefinition.source,
            regexFlags: wordDefinition.flags
          }]);
        }
      }));
      updateAllWordDefinitions();
    }
    if (this._inlineCompletionsUnificationService) {
      this._register(this._inlineCompletionsUnificationService.onDidStateChange(() => {
        this._proxy.$acceptInlineCompletionsUnificationState(this._inlineCompletionsUnificationService.state);
      }));
      this._proxy.$acceptInlineCompletionsUnificationState(this._inlineCompletionsUnificationService.state);
    }
  }
  $unregister(handle) {
    this._registrations.deleteAndDispose(handle);
  }
  static _reviveLocationDto(data) {
    if (!data) {
      return data;
    } else if (Array.isArray(data)) {
      data.forEach((l) => MainThreadLanguageFeatures._reviveLocationDto(l));
      return data;
    } else {
      data.uri = URI.revive(data.uri);
      return data;
    }
  }
  static _reviveLocationLinkDto(data) {
    if (!data) {
      return data;
    } else if (Array.isArray(data)) {
      data.forEach((l) => MainThreadLanguageFeatures._reviveLocationLinkDto(l));
      return data;
    } else {
      data.uri = URI.revive(data.uri);
      return data;
    }
  }
  static _reviveWorkspaceSymbolDto(data) {
    if (!data) {
      return data;
    } else if (Array.isArray(data)) {
      data.forEach(MainThreadLanguageFeatures._reviveWorkspaceSymbolDto);
      return data;
    } else {
      data.location = MainThreadLanguageFeatures._reviveLocationDto(data.location);
      return data;
    }
  }
  static _reviveCodeActionDto(data, uriIdentService) {
    data?.forEach((code) => reviveWorkspaceEditDto(code.edit, uriIdentService));
    return data;
  }
  static _reviveLinkDTO(data) {
    if (data.url && typeof data.url !== "string") {
      data.url = URI.revive(data.url);
    }
    return data;
  }
  static _reviveCallHierarchyItemDto(data) {
    if (data) {
      data.uri = URI.revive(data.uri);
    }
    return data;
  }
  static _reviveTypeHierarchyItemDto(data) {
    if (data) {
      data.uri = URI.revive(data.uri);
    }
    return data;
  }
  //#endregion
  // --- outline
  $registerDocumentSymbolProvider(handle, selector, displayName) {
    this._registrations.set(handle, this._languageFeaturesService.documentSymbolProvider.register(selector, {
      displayName,
      provideDocumentSymbols: (model, token) => {
        return this._proxy.$provideDocumentSymbols(handle, model.uri, token);
      }
    }));
  }
  // --- code lens
  $registerCodeLensSupport(handle, selector, eventHandle) {
    const provider = {
      provideCodeLenses: async (model, token) => {
        const listDto = await this._proxy.$provideCodeLenses(handle, model.uri, token);
        if (!listDto) {
          return void 0;
        }
        return {
          lenses: listDto.lenses,
          dispose: () => listDto.cacheId && this._proxy.$releaseCodeLenses(handle, listDto.cacheId)
        };
      },
      resolveCodeLens: async (model, codeLens, token) => {
        const result = await this._proxy.$resolveCodeLens(handle, codeLens, token);
        if (!result || token.isCancellationRequested) {
          return void 0;
        }
        return {
          ...result,
          range: model.validateRange(result.range)
        };
      }
    };
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      provider.onDidChange = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.codeLensProvider.register(selector, provider));
  }
  $emitCodeLensEvent(eventHandle, event) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(event);
    }
  }
  // --- declaration
  $registerDefinitionSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.definitionProvider.register(selector, {
      provideDefinition: (model, position, token) => {
        return this._proxy.$provideDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
      }
    }));
  }
  $registerDeclarationSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.declarationProvider.register(selector, {
      provideDeclaration: (model, position, token) => {
        return this._proxy.$provideDeclaration(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
      }
    }));
  }
  $registerImplementationSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.implementationProvider.register(selector, {
      provideImplementation: (model, position, token) => {
        return this._proxy.$provideImplementation(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
      }
    }));
  }
  $registerTypeDefinitionSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.typeDefinitionProvider.register(selector, {
      provideTypeDefinition: (model, position, token) => {
        return this._proxy.$provideTypeDefinition(handle, model.uri, position, token).then(MainThreadLanguageFeatures._reviveLocationLinkDto);
      }
    }));
  }
  // --- extra info
  $registerHoverProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.hoverProvider.register(selector, {
      provideHover: async (model, position, token, context) => {
        const serializedContext = {
          verbosityRequest: context?.verbosityRequest ? {
            verbosityDelta: context.verbosityRequest.verbosityDelta,
            previousHover: { id: context.verbosityRequest.previousHover.id }
          } : void 0
        };
        const hover = await this._proxy.$provideHover(handle, model.uri, position, serializedContext, token);
        return hover;
      }
    }));
  }
  // --- debug hover
  $registerEvaluatableExpressionProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.evaluatableExpressionProvider.register(selector, {
      provideEvaluatableExpression: (model, position, token) => {
        return this._proxy.$provideEvaluatableExpression(handle, model.uri, position, token);
      }
    }));
  }
  // --- inline values
  $registerInlineValuesProvider(handle, selector, eventHandle) {
    const provider = {
      provideInlineValues: (model, viewPort, context, token) => {
        return this._proxy.$provideInlineValues(handle, model.uri, viewPort, context, token);
      }
    };
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      provider.onDidChangeInlineValues = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.inlineValuesProvider.register(selector, provider));
  }
  $emitInlineValuesEvent(eventHandle, event) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(event);
    }
  }
  // --- occurrences
  $registerDocumentHighlightProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.documentHighlightProvider.register(selector, {
      provideDocumentHighlights: (model, position, token) => {
        return this._proxy.$provideDocumentHighlights(handle, model.uri, position, token);
      }
    }));
  }
  $registerMultiDocumentHighlightProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.multiDocumentHighlightProvider.register(selector, {
      selector,
      provideMultiDocumentHighlights: (model, position, otherModels, token) => {
        return this._proxy.$provideMultiDocumentHighlights(handle, model.uri, position, otherModels.map((model2) => model2.uri), token).then((dto) => {
          if (dto === void 0 || dto === null) {
            return void 0;
          }
          const result = new ResourceMap();
          dto?.forEach((value) => {
            const uri = URI.revive(value.uri);
            if (result.has(uri)) {
              result.get(uri).push(...value.highlights);
            } else {
              result.set(uri, value.highlights);
            }
          });
          return result;
        });
      }
    }));
  }
  // --- linked editing
  $registerLinkedEditingRangeProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.linkedEditingRangeProvider.register(selector, {
      provideLinkedEditingRanges: async (model, position, token) => {
        const res = await this._proxy.$provideLinkedEditingRanges(handle, model.uri, position, token);
        if (res) {
          return {
            ranges: res.ranges,
            wordPattern: res.wordPattern ? MainThreadLanguageFeatures._reviveRegExp(res.wordPattern) : void 0
          };
        }
        return void 0;
      }
    }));
  }
  // --- references
  $registerReferenceSupport(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.referenceProvider.register(selector, {
      provideReferences: (model, position, context, token) => {
        return this._proxy.$provideReferences(handle, model.uri, position, context, token).then(MainThreadLanguageFeatures._reviveLocationDto);
      }
    }));
  }
  // --- code actions
  $registerCodeActionSupport(handle, selector, metadata, displayName, extensionId, supportsResolve) {
    const provider = {
      provideCodeActions: async (model, rangeOrSelection, context, token) => {
        const listDto = await this._proxy.$provideCodeActions(handle, model.uri, rangeOrSelection, context, token);
        if (!listDto) {
          return void 0;
        }
        return {
          actions: MainThreadLanguageFeatures._reviveCodeActionDto(listDto.actions, this._uriIdentService),
          dispose: () => {
            if (typeof listDto.cacheId === "number") {
              this._proxy.$releaseCodeActions(handle, listDto.cacheId);
            }
          }
        };
      },
      providedCodeActionKinds: metadata.providedKinds,
      documentation: metadata.documentation,
      displayName,
      extensionId
    };
    if (supportsResolve) {
      provider.resolveCodeAction = async (codeAction, token) => {
        const resolved = await this._proxy.$resolveCodeAction(handle, codeAction.cacheId, token);
        if (resolved.edit) {
          codeAction.edit = reviveWorkspaceEditDto(resolved.edit, this._uriIdentService);
        }
        if (resolved.command) {
          codeAction.command = resolved.command;
        }
        return codeAction;
      };
    }
    this._registrations.set(handle, this._languageFeaturesService.codeActionProvider.register(selector, provider));
  }
  $registerPasteEditProvider(handle, selector, metadata) {
    const provider = new MainThreadPasteEditProvider(handle, this._proxy, metadata, this._uriIdentService);
    this._pasteEditProviders.set(handle, provider);
    this._registrations.set(handle, combinedDisposable(
      this._languageFeaturesService.documentPasteEditProvider.register(selector, provider),
      toDisposable(() => this._pasteEditProviders.delete(handle))
    ));
  }
  $resolvePasteFileData(handle, requestId, dataId) {
    const provider = this._pasteEditProviders.get(handle);
    if (!provider) {
      throw new Error("Could not find provider");
    }
    return provider.resolveFileData(requestId, dataId);
  }
  // --- formatting
  $registerDocumentFormattingSupport(handle, selector, extensionId, displayName) {
    this._registrations.set(handle, this._languageFeaturesService.documentFormattingEditProvider.register(selector, {
      extensionId,
      displayName,
      provideDocumentFormattingEdits: (model, options, token) => {
        return this._proxy.$provideDocumentFormattingEdits(handle, model.uri, options, token);
      }
    }));
  }
  $registerRangeFormattingSupport(handle, selector, extensionId, displayName, supportsRanges) {
    this._registrations.set(handle, this._languageFeaturesService.documentRangeFormattingEditProvider.register(selector, {
      extensionId,
      displayName,
      provideDocumentRangeFormattingEdits: (model, range, options, token) => {
        return this._proxy.$provideDocumentRangeFormattingEdits(handle, model.uri, range, options, token);
      },
      provideDocumentRangesFormattingEdits: !supportsRanges ? void 0 : (model, ranges, options, token) => {
        return this._proxy.$provideDocumentRangesFormattingEdits(handle, model.uri, ranges, options, token);
      }
    }));
  }
  $registerOnTypeFormattingSupport(handle, selector, autoFormatTriggerCharacters, extensionId) {
    this._registrations.set(handle, this._languageFeaturesService.onTypeFormattingEditProvider.register(selector, {
      extensionId,
      autoFormatTriggerCharacters,
      provideOnTypeFormattingEdits: (model, position, ch, options, token) => {
        return this._proxy.$provideOnTypeFormattingEdits(handle, model.uri, position, ch, options, token);
      }
    }));
  }
  // --- navigate type
  $registerNavigateTypeSupport(handle, supportsResolve) {
    let lastResultId;
    const provider = {
      provideWorkspaceSymbols: async (search2, token) => {
        const result = await this._proxy.$provideWorkspaceSymbols(handle, search2, token);
        if (lastResultId !== void 0) {
          this._proxy.$releaseWorkspaceSymbols(handle, lastResultId);
        }
        lastResultId = result.cacheId;
        return MainThreadLanguageFeatures._reviveWorkspaceSymbolDto(result.symbols);
      }
    };
    if (supportsResolve) {
      provider.resolveWorkspaceSymbol = async (item, token) => {
        const resolvedItem = await this._proxy.$resolveWorkspaceSymbol(handle, item, token);
        return resolvedItem && MainThreadLanguageFeatures._reviveWorkspaceSymbolDto(resolvedItem);
      };
    }
    this._registrations.set(handle, search.WorkspaceSymbolProviderRegistry.register(provider));
  }
  // --- rename
  $registerRenameSupport(handle, selector, supportResolveLocation) {
    this._registrations.set(handle, this._languageFeaturesService.renameProvider.register(selector, {
      provideRenameEdits: (model, position, newName, token) => {
        return this._proxy.$provideRenameEdits(handle, model.uri, position, newName, token).then((data) => reviveWorkspaceEditDto(data, this._uriIdentService));
      },
      resolveRenameLocation: supportResolveLocation ? (model, position, token) => this._proxy.$resolveRenameLocation(handle, model.uri, position, token) : void 0
    }));
  }
  $registerNewSymbolNamesProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.newSymbolNamesProvider.register(selector, {
      supportsAutomaticNewSymbolNamesTriggerKind: this._proxy.$supportsAutomaticNewSymbolNamesTriggerKind(handle),
      provideNewSymbolNames: (model, range, triggerKind, token) => {
        return this._proxy.$provideNewSymbolNames(handle, model.uri, range, triggerKind, token);
      }
    }));
  }
  // --- semantic tokens
  $registerDocumentSemanticTokensProvider(handle, selector, legend, eventHandle) {
    let event = void 0;
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      event = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.documentSemanticTokensProvider.register(selector, new MainThreadDocumentSemanticTokensProvider(this._proxy, handle, legend, event)));
  }
  $emitDocumentSemanticTokensEvent(eventHandle) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(void 0);
    }
  }
  $emitDocumentRangeSemanticTokensEvent(eventHandle) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(void 0);
    }
  }
  $registerDocumentRangeSemanticTokensProvider(handle, selector, legend, eventHandle) {
    let event = void 0;
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      event = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.documentRangeSemanticTokensProvider.register(selector, new MainThreadDocumentRangeSemanticTokensProvider(this._proxy, handle, legend, event)));
  }
  // --- suggest
  static _inflateSuggestDto(defaultRange, data, extensionId) {
    const label = data[ISuggestDataDtoField.label];
    const commandId = data[ISuggestDataDtoField.commandId];
    const commandIdent = data[ISuggestDataDtoField.commandIdent];
    const commitChars = data[ISuggestDataDtoField.commitCharacters];
    let command;
    if (commandId) {
      command = {
        $ident: commandIdent,
        id: commandId,
        title: "",
        arguments: commandIdent ? [commandIdent] : data[ISuggestDataDtoField.commandArguments]
        // Automatically fill in ident as first argument
      };
    }
    return {
      label,
      extensionId,
      kind: data[ISuggestDataDtoField.kind] ?? languages.CompletionItemKind.Property,
      tags: data[ISuggestDataDtoField.kindModifier],
      detail: data[ISuggestDataDtoField.detail],
      documentation: data[ISuggestDataDtoField.documentation],
      sortText: data[ISuggestDataDtoField.sortText],
      filterText: data[ISuggestDataDtoField.filterText],
      preselect: data[ISuggestDataDtoField.preselect],
      insertText: data[ISuggestDataDtoField.insertText] ?? (typeof label === "string" ? label : label.label),
      range: data[ISuggestDataDtoField.range] ?? defaultRange,
      insertTextRules: data[ISuggestDataDtoField.insertTextRules],
      commitCharacters: commitChars ? Array.from(commitChars) : void 0,
      additionalTextEdits: data[ISuggestDataDtoField.additionalTextEdits],
      command,
      // not-standard
      _id: data.x
    };
  }
  $registerCompletionsProvider(handle, selector, triggerCharacters, supportsResolveDetails, extensionId) {
    const provider = {
      triggerCharacters,
      _debugDisplayName: `${extensionId.value}(${triggerCharacters.join("")})`,
      provideCompletionItems: async (model, position, context, token) => {
        const result = await this._proxy.$provideCompletionItems(handle, model.uri, position, context, token);
        if (!result) {
          return result;
        }
        return {
          suggestions: result[ISuggestResultDtoField.completions].map((d) => MainThreadLanguageFeatures._inflateSuggestDto(result[ISuggestResultDtoField.defaultRanges], d, extensionId)),
          incomplete: result[ISuggestResultDtoField.isIncomplete] || false,
          duration: result[ISuggestResultDtoField.duration],
          dispose: () => {
            if (typeof result.x === "number") {
              this._proxy.$releaseCompletionItems(handle, result.x);
            }
          }
        };
      }
    };
    if (supportsResolveDetails) {
      provider.resolveCompletionItem = (suggestion, token) => {
        return this._proxy.$resolveCompletionItem(handle, suggestion._id, token).then((result) => {
          if (!result) {
            return suggestion;
          }
          const newSuggestion = MainThreadLanguageFeatures._inflateSuggestDto(suggestion.range, result, extensionId);
          return mixin(suggestion, newSuggestion, true);
        });
      };
    }
    this._registrations.set(handle, this._languageFeaturesService.completionProvider.register(selector, provider));
  }
  $registerInlineCompletionsSupport(handle, selector, supportsHandleEvents, extensionId, extensionVersion, groupId, yieldsToExtensionIds, displayName, debounceDelayMs, excludesExtensionIds, supportsOnDidChange, supportsSetModelId, initialModelInfo, supportsOnDidChangeModelInfo, supportsSetProviderOption, initialProviderOptions, supportsOnDidChangeProviderOptions) {
    const providerId = new languages.ProviderId(extensionId, extensionVersion, groupId);
    const provider = this._instantiationService.createInstance(
      ExtensionBackedInlineCompletionsProvider,
      handle,
      groupId ?? extensionId,
      providerId,
      yieldsToExtensionIds,
      excludesExtensionIds,
      debounceDelayMs,
      displayName,
      initialModelInfo,
      supportsHandleEvents,
      supportsSetModelId,
      supportsOnDidChange,
      supportsOnDidChangeModelInfo,
      initialProviderOptions,
      supportsSetProviderOption,
      supportsOnDidChangeProviderOptions,
      selector,
      this._proxy
    );
    this._registrations.set(handle, provider);
  }
  $emitInlineCompletionsChange(handle, changeHint) {
    const obj = this._registrations.get(handle);
    if (obj instanceof ExtensionBackedInlineCompletionsProvider) {
      obj._emitDidChange(changeHint);
    }
  }
  $emitInlineCompletionModelInfoChange(handle, data) {
    const obj = this._registrations.get(handle);
    if (obj instanceof ExtensionBackedInlineCompletionsProvider) {
      obj._setModelInfo(data);
    }
  }
  $emitInlineCompletionProviderOptionsChange(handle, data) {
    const obj = this._registrations.get(handle);
    if (obj instanceof ExtensionBackedInlineCompletionsProvider) {
      obj._setProviderOptions(data);
    }
  }
  // --- parameter hints
  $registerSignatureHelpProvider(handle, selector, metadata) {
    this._registrations.set(handle, this._languageFeaturesService.signatureHelpProvider.register(selector, {
      signatureHelpTriggerCharacters: metadata.triggerCharacters,
      signatureHelpRetriggerCharacters: metadata.retriggerCharacters,
      provideSignatureHelp: async (model, position, token, context) => {
        const result = await this._proxy.$provideSignatureHelp(handle, model.uri, position, context, token);
        if (!result) {
          return void 0;
        }
        return {
          value: result,
          dispose: () => {
            this._proxy.$releaseSignatureHelp(handle, result.id);
          }
        };
      }
    }));
  }
  // --- inline hints
  $registerInlayHintsProvider(handle, selector, supportsResolve, eventHandle, displayName) {
    const provider = {
      displayName,
      provideInlayHints: async (model, range, token) => {
        const result = await this._proxy.$provideInlayHints(handle, model.uri, range, token);
        if (!result) {
          return;
        }
        return {
          hints: revive(result.hints),
          dispose: () => {
            if (result.cacheId) {
              this._proxy.$releaseInlayHints(handle, result.cacheId);
            }
          }
        };
      }
    };
    if (supportsResolve) {
      provider.resolveInlayHint = async (hint, token) => {
        const dto = hint;
        if (!dto.cacheId) {
          return hint;
        }
        const result = await this._proxy.$resolveInlayHint(handle, dto.cacheId, token);
        if (token.isCancellationRequested) {
          throw new CancellationError();
        }
        if (!result) {
          return hint;
        }
        return {
          ...hint,
          tooltip: result.tooltip,
          label: revive(result.label),
          textEdits: result.textEdits
        };
      };
    }
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      provider.onDidChangeInlayHints = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.inlayHintsProvider.register(selector, provider));
  }
  $emitInlayHintsEvent(eventHandle) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(void 0);
    }
  }
  // --- links
  $registerDocumentLinkProvider(handle, selector, supportsResolve) {
    const provider = {
      provideLinks: (model, token) => {
        return this._proxy.$provideDocumentLinks(handle, model.uri, token).then((dto) => {
          if (!dto) {
            return void 0;
          }
          return {
            links: dto.links.map(MainThreadLanguageFeatures._reviveLinkDTO),
            dispose: () => {
              if (typeof dto.cacheId === "number") {
                this._proxy.$releaseDocumentLinks(handle, dto.cacheId);
              }
            }
          };
        });
      }
    };
    if (supportsResolve) {
      provider.resolveLink = (link, token) => {
        const dto = link;
        if (!dto.cacheId) {
          return link;
        }
        return this._proxy.$resolveDocumentLink(handle, dto.cacheId, token).then((obj) => {
          return obj && MainThreadLanguageFeatures._reviveLinkDTO(obj);
        });
      };
    }
    this._registrations.set(handle, this._languageFeaturesService.linkProvider.register(selector, provider));
  }
  // --- colors
  $registerDocumentColorProvider(handle, selector) {
    const proxy = this._proxy;
    this._registrations.set(handle, this._languageFeaturesService.colorProvider.register(selector, {
      provideDocumentColors: (model, token) => {
        return proxy.$provideDocumentColors(handle, model.uri, token).then((documentColors) => {
          return documentColors.map((documentColor) => {
            const [red, green, blue, alpha] = documentColor.color;
            const color = {
              red,
              green,
              blue,
              alpha
            };
            return {
              color,
              range: documentColor.range
            };
          });
        });
      },
      provideColorPresentations: (model, colorInfo, token) => {
        return proxy.$provideColorPresentations(handle, model.uri, {
          color: [colorInfo.color.red, colorInfo.color.green, colorInfo.color.blue, colorInfo.color.alpha],
          range: colorInfo.range
        }, token);
      }
    }));
  }
  // --- folding
  $registerFoldingRangeProvider(handle, selector, extensionId, eventHandle) {
    const provider = {
      id: extensionId.value,
      provideFoldingRanges: (model, context, token) => {
        return this._proxy.$provideFoldingRanges(handle, model.uri, context, token);
      }
    };
    if (typeof eventHandle === "number") {
      const emitter = new Emitter();
      this._registrations.set(eventHandle, emitter);
      provider.onDidChange = emitter.event;
    }
    this._registrations.set(handle, this._languageFeaturesService.foldingRangeProvider.register(selector, provider));
  }
  $emitFoldingRangeEvent(eventHandle, event) {
    const obj = this._registrations.get(eventHandle);
    if (obj instanceof Emitter) {
      obj.fire(event);
    }
  }
  // -- smart select
  $registerSelectionRangeProvider(handle, selector) {
    this._registrations.set(handle, this._languageFeaturesService.selectionRangeProvider.register(selector, {
      provideSelectionRanges: (model, positions, token) => {
        return this._proxy.$provideSelectionRanges(handle, model.uri, positions, token);
      }
    }));
  }
  // --- call hierarchy
  $registerCallHierarchyProvider(handle, selector) {
    this._registrations.set(handle, callh.CallHierarchyProviderRegistry.register(selector, {
      prepareCallHierarchy: async (document, position, token) => {
        const items = await this._proxy.$prepareCallHierarchy(handle, document.uri, position, token);
        if (!items || items.length === 0) {
          return void 0;
        }
        return {
          dispose: () => {
            for (const item of items) {
              this._proxy.$releaseCallHierarchy(handle, item._sessionId);
            }
          },
          roots: items.map(MainThreadLanguageFeatures._reviveCallHierarchyItemDto)
        };
      },
      provideOutgoingCalls: async (item, token) => {
        const outgoing = await this._proxy.$provideCallHierarchyOutgoingCalls(handle, item._sessionId, item._itemId, token);
        if (!outgoing) {
          return outgoing;
        }
        outgoing.forEach((value) => {
          value.to = MainThreadLanguageFeatures._reviveCallHierarchyItemDto(value.to);
        });
        return outgoing;
      },
      provideIncomingCalls: async (item, token) => {
        const incoming = await this._proxy.$provideCallHierarchyIncomingCalls(handle, item._sessionId, item._itemId, token);
        if (!incoming) {
          return incoming;
        }
        incoming.forEach((value) => {
          value.from = MainThreadLanguageFeatures._reviveCallHierarchyItemDto(value.from);
        });
        return incoming;
      }
    }));
  }
  // --- configuration
  static _reviveRegExp(regExp) {
    return new RegExp(regExp.pattern, regExp.flags);
  }
  static _reviveIndentationRule(indentationRule) {
    return {
      decreaseIndentPattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.decreaseIndentPattern),
      increaseIndentPattern: MainThreadLanguageFeatures._reviveRegExp(indentationRule.increaseIndentPattern),
      indentNextLinePattern: indentationRule.indentNextLinePattern ? MainThreadLanguageFeatures._reviveRegExp(indentationRule.indentNextLinePattern) : void 0,
      unIndentedLinePattern: indentationRule.unIndentedLinePattern ? MainThreadLanguageFeatures._reviveRegExp(indentationRule.unIndentedLinePattern) : void 0
    };
  }
  static _reviveOnEnterRule(onEnterRule) {
    return {
      beforeText: MainThreadLanguageFeatures._reviveRegExp(onEnterRule.beforeText),
      afterText: onEnterRule.afterText ? MainThreadLanguageFeatures._reviveRegExp(onEnterRule.afterText) : void 0,
      previousLineText: onEnterRule.previousLineText ? MainThreadLanguageFeatures._reviveRegExp(onEnterRule.previousLineText) : void 0,
      action: onEnterRule.action
    };
  }
  static _reviveOnEnterRules(onEnterRules) {
    return onEnterRules.map(MainThreadLanguageFeatures._reviveOnEnterRule);
  }
  $setLanguageConfiguration(handle, languageId, _configuration) {
    const configuration = {
      comments: _configuration.comments,
      brackets: _configuration.brackets,
      wordPattern: _configuration.wordPattern ? MainThreadLanguageFeatures._reviveRegExp(_configuration.wordPattern) : void 0,
      indentationRules: _configuration.indentationRules ? MainThreadLanguageFeatures._reviveIndentationRule(_configuration.indentationRules) : void 0,
      onEnterRules: _configuration.onEnterRules ? MainThreadLanguageFeatures._reviveOnEnterRules(_configuration.onEnterRules) : void 0,
      autoClosingPairs: void 0,
      surroundingPairs: void 0,
      __electricCharacterSupport: void 0
    };
    if (_configuration.autoClosingPairs) {
      configuration.autoClosingPairs = _configuration.autoClosingPairs;
    } else if (_configuration.__characterPairSupport) {
      configuration.autoClosingPairs = _configuration.__characterPairSupport.autoClosingPairs;
    }
    if (_configuration.__electricCharacterSupport && _configuration.__electricCharacterSupport.docComment) {
      configuration.__electricCharacterSupport = {
        docComment: {
          open: _configuration.__electricCharacterSupport.docComment.open,
          close: _configuration.__electricCharacterSupport.docComment.close
        }
      };
    }
    if (this._languageService.isRegisteredLanguageId(languageId)) {
      this._registrations.set(handle, this._languageConfigurationService.register(languageId, configuration, 100));
    }
  }
  // --- type hierarchy
  $registerTypeHierarchyProvider(handle, selector) {
    this._registrations.set(handle, typeh.TypeHierarchyProviderRegistry.register(selector, {
      prepareTypeHierarchy: async (document, position, token) => {
        const items = await this._proxy.$prepareTypeHierarchy(handle, document.uri, position, token);
        if (!items) {
          return void 0;
        }
        return {
          dispose: () => {
            for (const item of items) {
              this._proxy.$releaseTypeHierarchy(handle, item._sessionId);
            }
          },
          roots: items.map(MainThreadLanguageFeatures._reviveTypeHierarchyItemDto)
        };
      },
      provideSupertypes: async (item, token) => {
        const supertypes = await this._proxy.$provideTypeHierarchySupertypes(handle, item._sessionId, item._itemId, token);
        if (!supertypes) {
          return supertypes;
        }
        return supertypes.map(MainThreadLanguageFeatures._reviveTypeHierarchyItemDto);
      },
      provideSubtypes: async (item, token) => {
        const subtypes = await this._proxy.$provideTypeHierarchySubtypes(handle, item._sessionId, item._itemId, token);
        if (!subtypes) {
          return subtypes;
        }
        return subtypes.map(MainThreadLanguageFeatures._reviveTypeHierarchyItemDto);
      }
    }));
  }
  $registerDocumentOnDropEditProvider(handle, selector, metadata) {
    const provider = new MainThreadDocumentOnDropEditProvider(handle, this._proxy, metadata, this._uriIdentService);
    this._documentOnDropEditProviders.set(handle, provider);
    this._registrations.set(handle, combinedDisposable(
      this._languageFeaturesService.documentDropEditProvider.register(selector, provider),
      toDisposable(() => this._documentOnDropEditProviders.delete(handle))
    ));
  }
  async $resolveDocumentOnDropFileData(handle, requestId, dataId) {
    const provider = this._documentOnDropEditProviders.get(handle);
    if (!provider) {
      throw new Error("Could not find provider");
    }
    return provider.resolveDocumentOnDropFileData(requestId, dataId);
  }
};
MainThreadLanguageFeatures = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadLanguageFeatures),
  __decorateParam(1, ILanguageService),
  __decorateParam(2, ILanguageConfigurationService),
  __decorateParam(3, ILanguageFeaturesService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IInlineCompletionsUnificationService)
], MainThreadLanguageFeatures);
let MainThreadPasteEditProvider = class {
  constructor(_handle, _proxy, metadata, _uriIdentService) {
    this._handle = _handle;
    this._proxy = _proxy;
    this._uriIdentService = _uriIdentService;
    this.dataTransfers = new DataTransferFileCache();
    this.copyMimeTypes = metadata.copyMimeTypes ?? [];
    this.pasteMimeTypes = metadata.pasteMimeTypes ?? [];
    this.providedPasteEditKinds = metadata.providedPasteEditKinds?.map((kind) => new HierarchicalKind(kind)) ?? [];
    if (metadata.supportsCopy) {
      this.prepareDocumentPaste = async (model, selections, dataTransfer, token) => {
        const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
        if (token.isCancellationRequested) {
          return void 0;
        }
        const newDataTransfer = await this._proxy.$prepareDocumentPaste(_handle, model.uri, selections, dataTransferDto, token);
        if (!newDataTransfer) {
          return void 0;
        }
        const dataTransferOut = new VSDataTransfer();
        for (const [type, item] of newDataTransfer.items) {
          dataTransferOut.replace(type, createStringDataTransferItem(item.asString, item.id));
        }
        return dataTransferOut;
      };
    }
    if (metadata.supportsPaste) {
      this.provideDocumentPasteEdits = async (model, selections, dataTransfer, context, token) => {
        const request = this.dataTransfers.add(dataTransfer);
        try {
          const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
          if (token.isCancellationRequested) {
            return;
          }
          const edits = await this._proxy.$providePasteEdits(this._handle, request.id, model.uri, selections, dataTransferDto, {
            only: context.only?.value,
            triggerKind: context.triggerKind
          }, token);
          if (!edits) {
            return;
          }
          return {
            edits: edits.map((edit) => {
              return {
                ...edit,
                kind: edit.kind ? new HierarchicalKind(edit.kind.value) : new HierarchicalKind(""),
                yieldTo: edit.yieldTo?.map((x) => ({ kind: new HierarchicalKind(x) })),
                additionalEdit: edit.additionalEdit ? reviveWorkspaceEditDto(edit.additionalEdit, this._uriIdentService, (dataId) => this.resolveFileData(request.id, dataId)) : void 0
              };
            }),
            dispose: () => {
              this._proxy.$releasePasteEdits(this._handle, request.id);
            }
          };
        } finally {
          request.dispose();
        }
      };
    }
    if (metadata.supportsResolve) {
      this.resolveDocumentPasteEdit = async (edit, token) => {
        const resolved = await this._proxy.$resolvePasteEdit(this._handle, edit._cacheId, token);
        if (typeof resolved.insertText !== "undefined") {
          edit.insertText = resolved.insertText;
        }
        if (resolved.additionalEdit) {
          edit.additionalEdit = reviveWorkspaceEditDto(resolved.additionalEdit, this._uriIdentService);
        }
        return edit;
      };
    }
  }
  resolveFileData(requestId, dataId) {
    return this.dataTransfers.resolveFileData(requestId, dataId);
  }
};
MainThreadPasteEditProvider = __decorateClass([
  __decorateParam(3, IUriIdentityService)
], MainThreadPasteEditProvider);
let MainThreadDocumentOnDropEditProvider = class {
  constructor(_handle, _proxy, metadata, _uriIdentService) {
    this._handle = _handle;
    this._proxy = _proxy;
    this._uriIdentService = _uriIdentService;
    this.dataTransfers = new DataTransferFileCache();
    this.dropMimeTypes = metadata?.dropMimeTypes ?? ["*/*"];
    this.providedDropEditKinds = metadata?.providedDropKinds?.map((kind) => new HierarchicalKind(kind));
    if (metadata?.supportsResolve) {
      this.resolveDocumentDropEdit = async (edit, token) => {
        const resolved = await this._proxy.$resolvePasteEdit(this._handle, edit._cacheId, token);
        if (resolved.additionalEdit) {
          edit.additionalEdit = reviveWorkspaceEditDto(resolved.additionalEdit, this._uriIdentService);
        }
        return edit;
      };
    }
  }
  async provideDocumentDropEdits(model, position, dataTransfer, token) {
    const request = this.dataTransfers.add(dataTransfer);
    try {
      const dataTransferDto = await typeConvert.DataTransfer.fromList(dataTransfer);
      if (token.isCancellationRequested) {
        return;
      }
      const edits = await this._proxy.$provideDocumentOnDropEdits(this._handle, request.id, model.uri, position, dataTransferDto, token);
      if (!edits) {
        return;
      }
      return {
        edits: edits.map((edit) => {
          return {
            ...edit,
            yieldTo: edit.yieldTo?.map((x) => ({ kind: new HierarchicalKind(x) })),
            kind: edit.kind ? new HierarchicalKind(edit.kind) : void 0,
            additionalEdit: reviveWorkspaceEditDto(edit.additionalEdit, this._uriIdentService, (dataId) => this.resolveDocumentOnDropFileData(request.id, dataId))
          };
        }),
        dispose: () => {
          this._proxy.$releaseDocumentOnDropEdits(this._handle, request.id);
        }
      };
    } finally {
      request.dispose();
    }
  }
  resolveDocumentOnDropFileData(requestId, dataId) {
    return this.dataTransfers.resolveFileData(requestId, dataId);
  }
};
MainThreadDocumentOnDropEditProvider = __decorateClass([
  __decorateParam(3, IUriIdentityService)
], MainThreadDocumentOnDropEditProvider);
class MainThreadDocumentSemanticTokensProvider {
  constructor(_proxy, _handle, _legend, onDidChange) {
    this._proxy = _proxy;
    this._handle = _handle;
    this._legend = _legend;
    this.onDidChange = onDidChange;
  }
  releaseDocumentSemanticTokens(resultId) {
    if (resultId) {
      this._proxy.$releaseDocumentSemanticTokens(this._handle, parseInt(resultId, 10));
    }
  }
  getLegend() {
    return this._legend;
  }
  async provideDocumentSemanticTokens(model, lastResultId, token) {
    const nLastResultId = lastResultId ? parseInt(lastResultId, 10) : 0;
    const encodedDto = await this._proxy.$provideDocumentSemanticTokens(this._handle, model.uri, nLastResultId, token);
    if (!encodedDto) {
      return null;
    }
    if (token.isCancellationRequested) {
      return null;
    }
    const dto = decodeSemanticTokensDto(encodedDto);
    if (dto.type === "full") {
      return {
        resultId: String(dto.id),
        data: dto.data
      };
    }
    return {
      resultId: String(dto.id),
      edits: dto.deltas
    };
  }
}
class MainThreadDocumentRangeSemanticTokensProvider {
  constructor(_proxy, _handle, _legend, onDidChange) {
    this._proxy = _proxy;
    this._handle = _handle;
    this._legend = _legend;
    this.onDidChange = onDidChange;
  }
  getLegend() {
    return this._legend;
  }
  async provideDocumentRangeSemanticTokens(model, range, token) {
    const encodedDto = await this._proxy.$provideDocumentRangeSemanticTokens(this._handle, model.uri, range, token);
    if (!encodedDto) {
      return null;
    }
    if (token.isCancellationRequested) {
      return null;
    }
    const dto = decodeSemanticTokensDto(encodedDto);
    if (dto.type === "full") {
      return {
        resultId: String(dto.id),
        data: dto.data
      };
    }
    throw new Error(`Unexpected`);
  }
}
let ExtensionBackedInlineCompletionsProvider = class extends Disposable {
  constructor(handle, groupId, providerId, yieldsToGroupIds, excludesGroupIds, debounceDelayMs, displayName, modelInfo, _supportsHandleEvents, _supportsSetModelId, _supportsOnDidChange, _supportsOnDidChangeModelInfo, providerOptions, _supportsSetProviderOption, _supportsOnDidChangeProviderOptions, _selector, _proxy, _languageFeaturesService, _aiEditTelemetryService, _instantiationService) {
    super();
    this.handle = handle;
    this.groupId = groupId;
    this.providerId = providerId;
    this.yieldsToGroupIds = yieldsToGroupIds;
    this.excludesGroupIds = excludesGroupIds;
    this.debounceDelayMs = debounceDelayMs;
    this.displayName = displayName;
    this.modelInfo = modelInfo;
    this._supportsHandleEvents = _supportsHandleEvents;
    this._supportsSetModelId = _supportsSetModelId;
    this._supportsOnDidChange = _supportsOnDidChange;
    this._supportsOnDidChangeModelInfo = _supportsOnDidChangeModelInfo;
    this.providerOptions = providerOptions;
    this._supportsSetProviderOption = _supportsSetProviderOption;
    this._supportsOnDidChangeProviderOptions = _supportsOnDidChangeProviderOptions;
    this._selector = _selector;
    this._proxy = _proxy;
    this._languageFeaturesService = _languageFeaturesService;
    this._aiEditTelemetryService = _aiEditTelemetryService;
    this._instantiationService = _instantiationService;
    this._onDidChangeEmitter = this._register(new Emitter());
    this._onDidChangeModelInfoEmitter = this._register(new Emitter());
    this._onDidProviderOptionsChangeEmitter = this._register(new Emitter());
    this.setModelId = this._supportsSetModelId ? async (modelId) => {
      await this._proxy.$handleInlineCompletionSetCurrentModelId(this.handle, modelId);
    } : void 0;
    this.setProviderOption = this._supportsSetProviderOption ? async (optionId, valueId) => {
      await this._proxy.$handleInlineCompletionSetProviderOption(this.handle, optionId, valueId);
    } : void 0;
    this.onDidChangeInlineCompletions = this._supportsOnDidChange ? this._onDidChangeEmitter.event : void 0;
    this.onDidChangeModelInfo = this._supportsOnDidChangeModelInfo ? this._onDidChangeModelInfoEmitter.event : void 0;
    this.onDidProviderOptionsChange = this._supportsOnDidChangeProviderOptions ? this._onDidProviderOptionsChangeEmitter.event : void 0;
    this._register(this._languageFeaturesService.inlineCompletionsProvider.register(this._selector, this));
  }
  _setModelInfo(newModelInfo) {
    this.modelInfo = newModelInfo;
    if (this._supportsOnDidChangeModelInfo) {
      this._onDidChangeModelInfoEmitter.fire();
    }
  }
  _setProviderOptions(newProviderOptions) {
    this.providerOptions = newProviderOptions;
    if (this._supportsOnDidChangeProviderOptions) {
      this._onDidProviderOptionsChangeEmitter.fire();
    }
  }
  _emitDidChange(changeHint) {
    if (this._supportsOnDidChange) {
      this._onDidChangeEmitter.fire(changeHint);
    }
  }
  async provideInlineCompletions(model, position, context, token) {
    const result = await this._proxy.$provideInlineCompletions(this.handle, model.uri, position, context, token);
    return result;
  }
  async handleItemDidShow(completions, item, updatedInsertText, editDeltaInfo) {
    if (item.suggestionId === void 0) {
      item.suggestionId = this._aiEditTelemetryService.createSuggestionId({
        applyCodeBlockSuggestionId: void 0,
        feature: "inlineSuggestion",
        source: this.providerId,
        languageId: completions.languageId,
        editDeltaInfo,
        modeId: void 0,
        modelId: void 0,
        presentation: item.isInlineEdit ? "nextEditSuggestion" : "inlineCompletion",
        sourceRequestId: void 0
      });
    }
    if (this._supportsHandleEvents) {
      await this._proxy.$handleInlineCompletionDidShow(this.handle, completions.pid, item.idx, updatedInsertText);
    }
  }
  async handlePartialAccept(completions, item, acceptedCharacters, info) {
    if (this._supportsHandleEvents) {
      await this._proxy.$handleInlineCompletionPartialAccept(this.handle, completions.pid, item.idx, acceptedCharacters, info);
    }
  }
  async handleEndOfLifetime(completions, item, reason, lifetimeSummary) {
    function mapReason(reason2, f) {
      if (reason2.kind === languages.InlineCompletionEndOfLifeReasonKind.Ignored) {
        return {
          ...reason2,
          supersededBy: reason2.supersededBy ? f(reason2.supersededBy) : void 0
        };
      }
      return reason2;
    }
    if (this._supportsHandleEvents) {
      await this._proxy.$handleInlineCompletionEndOfLifetime(this.handle, completions.pid, item.idx, mapReason(reason, (i) => ({ pid: i.pid, idx: i.idx })));
    }
    if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Accepted) {
      if (item.suggestionId !== void 0) {
        this._aiEditTelemetryService.handleCodeAccepted({
          suggestionId: item.suggestionId,
          feature: "inlineSuggestion",
          source: this.providerId,
          languageId: completions.languageId,
          editDeltaInfo: EditDeltaInfo.tryCreate(
            lifetimeSummary.lineCountModified,
            lifetimeSummary.lineCountOriginal,
            lifetimeSummary.characterCountModified,
            lifetimeSummary.characterCountOriginal
          ),
          modeId: void 0,
          modelId: void 0,
          presentation: item.isInlineEdit ? "nextEditSuggestion" : "inlineCompletion",
          acceptanceMethod: "accept",
          applyCodeBlockSuggestionId: void 0,
          sourceRequestId: void 0
        });
      }
    } else if (reason.kind === languages.InlineCompletionEndOfLifeReasonKind.Rejected) {
      if (item.suggestionId !== void 0) {
        this._aiEditTelemetryService.handleCodeRejected({
          suggestionId: item.suggestionId,
          feature: "inlineSuggestion",
          source: this.providerId,
          languageId: completions.languageId,
          editDeltaInfo: EditDeltaInfo.tryCreate(
            lifetimeSummary.lineCountModified,
            lifetimeSummary.lineCountOriginal,
            lifetimeSummary.characterCountModified,
            lifetimeSummary.characterCountOriginal
          ),
          modeId: void 0,
          modelId: void 0,
          presentation: item.isInlineEdit ? "nextEditSuggestion" : "inlineCompletion",
          rejectionMethod: "reject",
          applyCodeBlockSuggestionId: void 0,
          sourceRequestId: void 0
        });
      }
    }
    const endOfLifeSummary = {
      opportunityId: lifetimeSummary.requestUuid,
      correlationId: lifetimeSummary.correlationId,
      shown: lifetimeSummary.shown,
      shownDuration: lifetimeSummary.shownDuration,
      shownDurationUncollapsed: lifetimeSummary.shownDurationUncollapsed,
      timeUntilShown: lifetimeSummary.timeUntilShown,
      timeUntilProviderRequest: lifetimeSummary.timeUntilProviderRequest,
      timeUntilProviderResponse: lifetimeSummary.timeUntilProviderResponse,
      editorType: lifetimeSummary.editorType,
      viewKind: lifetimeSummary.viewKind,
      preceeded: lifetimeSummary.preceeded,
      requestReason: lifetimeSummary.requestReason,
      typingInterval: lifetimeSummary.typingInterval,
      typingIntervalCharacterCount: lifetimeSummary.typingIntervalCharacterCount,
      languageId: lifetimeSummary.languageId,
      cursorColumnDistance: lifetimeSummary.cursorColumnDistance,
      cursorLineDistance: lifetimeSummary.cursorLineDistance,
      lineCountOriginal: lifetimeSummary.lineCountOriginal,
      lineCountModified: lifetimeSummary.lineCountModified,
      characterCountOriginal: lifetimeSummary.characterCountOriginal,
      characterCountModified: lifetimeSummary.characterCountModified,
      disjointReplacements: lifetimeSummary.disjointReplacements,
      sameShapeReplacements: lifetimeSummary.sameShapeReplacements,
      selectedSuggestionInfo: lifetimeSummary.selectedSuggestionInfo,
      extensionId: this.providerId.extensionId,
      extensionVersion: this.providerId.extensionVersion,
      groupId: extractEngineFromCorrelationId(lifetimeSummary.correlationId) ?? this.groupId,
      skuPlan: lifetimeSummary.skuPlan,
      skuType: lifetimeSummary.skuType,
      performanceMarkers: lifetimeSummary.performanceMarkers,
      availableProviders: lifetimeSummary.availableProviders,
      partiallyAccepted: lifetimeSummary.partiallyAccepted,
      partiallyAcceptedCountSinceOriginal: lifetimeSummary.partiallyAcceptedCountSinceOriginal,
      partiallyAcceptedRatioSinceOriginal: lifetimeSummary.partiallyAcceptedRatioSinceOriginal,
      partiallyAcceptedCharactersSinceOriginal: lifetimeSummary.partiallyAcceptedCharactersSinceOriginal,
      superseded: reason.kind === InlineCompletionEndOfLifeReasonKind.Ignored && !!reason.supersededBy,
      reason: reason.kind === InlineCompletionEndOfLifeReasonKind.Accepted ? "accepted" : reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected ? "rejected" : reason.kind === InlineCompletionEndOfLifeReasonKind.Ignored ? "ignored" : void 0,
      acceptedAlternativeAction: reason.kind === InlineCompletionEndOfLifeReasonKind.Accepted && reason.alternativeAction,
      noSuggestionReason: void 0,
      notShownReason: lifetimeSummary.notShownReason,
      renameCreated: lifetimeSummary.renameCreated,
      renameDuration: lifetimeSummary.renameDuration,
      renameTimedOut: lifetimeSummary.renameTimedOut,
      renameDroppedOtherEdits: lifetimeSummary.renameDroppedOtherEdits,
      renameDroppedRenameEdits: lifetimeSummary.renameDroppedRenameEdits,
      editKind: lifetimeSummary.editKind,
      longDistanceHintVisible: lifetimeSummary.longDistanceHintVisible,
      longDistanceHintDistance: lifetimeSummary.longDistanceHintDistance,
      isForAnotherDocument: lifetimeSummary.isForAnotherDocument,
      ...forwardToChannelIf(isCopilotLikeExtension(this.providerId.extensionId))
    };
    const dataChannelForwardingTelemetryService = this._instantiationService.createInstance(DataChannelForwardingTelemetryService);
    sendInlineCompletionsEndOfLifeTelemetry(dataChannelForwardingTelemetryService, endOfLifeSummary);
  }
  disposeInlineCompletions(completions, reason) {
    this._proxy.$freeInlineCompletionsList(this.handle, completions.pid, reason);
  }
  async handleRejection(completions, item) {
    if (this._supportsHandleEvents) {
      await this._proxy.$handleInlineCompletionRejection(this.handle, completions.pid, item.idx);
    }
  }
  toString() {
    return `InlineCompletionsProvider(${this.providerId.toString()})`;
  }
};
ExtensionBackedInlineCompletionsProvider = __decorateClass([
  __decorateParam(17, ILanguageFeaturesService),
  __decorateParam(18, IAiEditTelemetryService),
  __decorateParam(19, IInstantiationService)
], ExtensionBackedInlineCompletionsProvider);
function extractEngineFromCorrelationId(correlationId) {
  if (!correlationId) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(correlationId);
    if (typeof parsed === "object" && parsed !== null && typeof parsed.engine === "string") {
      return parsed.engine;
    }
    return void 0;
  } catch {
    return void 0;
  }
}
export {
  MainThreadDocumentRangeSemanticTokensProvider,
  MainThreadDocumentSemanticTokensProvider,
  MainThreadLanguageFeatures
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdHJpbmdEYXRhVHJhbnNmZXJJdGVtLCBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgVlNEYXRhVHJhbnNmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRhVHJhbnNmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBIaWVyYXJjaGljYWxLaW5kIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaGllcmFyY2hpY2FsS2luZC5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBtaXhpbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIGFzIEVkaXRvclBvc2l0aW9uLCBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgYXMgRWRpdG9yUmFuZ2UsIElSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSW5kZW50YXRpb25SdWxlLCBMYW5ndWFnZUNvbmZpZ3VyYXRpb24sIE9uRW50ZXJSdWxlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IGRlY29kZVNlbWFudGljVG9rZW5zRHRvIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9zZW1hbnRpY1Rva2Vuc0R0by5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IHJldml2ZVdvcmtzcGFjZUVkaXREdG8gfSBmcm9tICcuL21haW5UaHJlYWRCdWxrRWRpdHMuanMnO1xuaW1wb3J0ICogYXMgdHlwZUNvbnZlcnQgZnJvbSAnLi4vY29tbW9uL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBEYXRhVHJhbnNmZXJGaWxlQ2FjaGUgfSBmcm9tICcuLi9jb21tb24vc2hhcmVkL2RhdGFUcmFuc2ZlckNhY2hlLmpzJztcbmltcG9ydCAqIGFzIGNhbGxoIGZyb20gJy4uLy4uL2NvbnRyaWIvY2FsbEhpZXJhcmNoeS9jb21tb24vY2FsbEhpZXJhcmNoeS5qcyc7XG5pbXBvcnQgKiBhcyBzZWFyY2ggZnJvbSAnLi4vLi4vY29udHJpYi9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlaCBmcm9tICcuLi8uLi9jb250cmliL3R5cGVIaWVyYXJjaHkvY29tbW9uL3R5cGVIaWVyYXJjaHkuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzU2hhcGUsIEhvdmVyV2l0aElkLCBJQ2FsbEhpZXJhcmNoeUl0ZW1EdG8sIElDb2RlQWN0aW9uRHRvLCBJQ29kZUFjdGlvblByb3ZpZGVyTWV0YWRhdGFEdG8sIElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb24sIElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zLCBJRG9jdW1lbnREcm9wRWRpdER0bywgSURvY3VtZW50RHJvcEVkaXRQcm92aWRlck1ldGFkYXRhLCBJRG9jdW1lbnRGaWx0ZXJEdG8sIElJbmRlbnRhdGlvblJ1bGVEdG8sIElJbmxheUhpbnREdG8sIElJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludER0bywgSUlubGluZUNvbXBsZXRpb25Nb2RlbEluZm9EdG8sIElJbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJPcHRpb25EdG8sIElMYW5ndWFnZUNvbmZpZ3VyYXRpb25EdG8sIElMYW5ndWFnZVdvcmREZWZpbml0aW9uRHRvLCBJTGlua0R0bywgSUxvY2F0aW9uRHRvLCBJTG9jYXRpb25MaW5rRHRvLCBJT25FbnRlclJ1bGVEdG8sIElQYXN0ZUVkaXREdG8sIElQYXN0ZUVkaXRQcm92aWRlck1ldGFkYXRhRHRvLCBJUmVnRXhwRHRvLCBJU2lnbmF0dXJlSGVscFByb3ZpZGVyTWV0YWRhdGFEdG8sIElTdWdnZXN0RGF0YUR0bywgSVN1Z2dlc3REYXRhRHRvRmllbGQsIElTdWdnZXN0UmVzdWx0RHRvRmllbGQsIElUeXBlSGllcmFyY2h5SXRlbUR0bywgSVdvcmtzcGFjZVN5bWJvbER0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZCB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBEYXRhQ2hhbm5lbEZvcndhcmRpbmdUZWxlbWV0cnlTZXJ2aWNlLCBmb3J3YXJkVG9DaGFubmVsSWYsIGlzQ29waWxvdExpa2VFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kYXRhQ2hhbm5lbC9icm93c2VyL2ZvcndhcmRpbmdUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXREZWx0YUluZm8gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgSUlubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvaW5saW5lQ29tcGxldGlvbnMvY29tbW9uL2lubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZUV2ZW50LCBzZW5kSW5saW5lQ29tcGxldGlvbnNFbmRPZkxpZmVUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL3RlbGVtZXRyeS5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlc1NoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlcj4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudFNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblNlcnZpY2U6IElJbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdExhbmd1YWdlRmVhdHVyZXMpO1xuXG5cdFx0aWYgKHRoaXMuX2xhbmd1YWdlU2VydmljZSkge1xuXHRcdFx0Y29uc3QgdXBkYXRlQWxsV29yZERlZmluaXRpb25zID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB3b3JkRGVmaW5pdGlvbkR0b3M6IElMYW5ndWFnZVdvcmREZWZpbml0aW9uRHRvW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBsYW5ndWFnZUlkIG9mIF9sYW5ndWFnZVNlcnZpY2UuZ2V0UmVnaXN0ZXJlZExhbmd1YWdlSWRzKCkpIHtcblx0XHRcdFx0XHRjb25zdCB3b3JkRGVmaW5pdGlvbiA9IHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmdldFdvcmREZWZpbml0aW9uKCk7XG5cdFx0XHRcdFx0d29yZERlZmluaXRpb25EdG9zLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VJZDogbGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRcdHJlZ2V4U291cmNlOiB3b3JkRGVmaW5pdGlvbi5zb3VyY2UsXG5cdFx0XHRcdFx0XHRyZWdleEZsYWdzOiB3b3JkRGVmaW5pdGlvbi5mbGFnc1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRzZXRXb3JkRGVmaW5pdGlvbnMod29yZERlZmluaXRpb25EdG9zKTtcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRcdGlmICghZS5sYW5ndWFnZUlkKSB7XG5cdFx0XHRcdFx0dXBkYXRlQWxsV29yZERlZmluaXRpb25zKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3Qgd29yZERlZmluaXRpb24gPSB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihlLmxhbmd1YWdlSWQpLmdldFdvcmREZWZpbml0aW9uKCk7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJHNldFdvcmREZWZpbml0aW9ucyhbe1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VJZDogZS5sYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0cmVnZXhTb3VyY2U6IHdvcmREZWZpbml0aW9uLnNvdXJjZSxcblx0XHRcdFx0XHRcdHJlZ2V4RmxhZ3M6IHdvcmREZWZpbml0aW9uLmZsYWdzXG5cdFx0XHRcdFx0fV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR1cGRhdGVBbGxXb3JkRGVmaW5pdGlvbnMoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblNlcnZpY2UpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2lubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TZXJ2aWNlLm9uRGlkU3RhdGVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0SW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblN0YXRlKHRoaXMuX2lubGluZUNvbXBsZXRpb25zVW5pZmljYXRpb25TZXJ2aWNlLnN0YXRlKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRJbmxpbmVDb21wbGV0aW9uc1VuaWZpY2F0aW9uU3RhdGUodGhpcy5faW5saW5lQ29tcGxldGlvbnNVbmlmaWNhdGlvblNlcnZpY2Uuc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdCR1bnJlZ2lzdGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKGhhbmRsZSk7XG5cdH1cblxuXHQvLyNyZWdpb24gLS0tIHJldml2ZSBmdW5jdGlvbnNcblxuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlTG9jYXRpb25EdG8oZGF0YT86IElMb2NhdGlvbkR0byk6IGxhbmd1YWdlcy5Mb2NhdGlvbjtcblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZUxvY2F0aW9uRHRvKGRhdGE/OiBJTG9jYXRpb25EdG9bXSk6IGxhbmd1YWdlcy5Mb2NhdGlvbltdO1xuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlTG9jYXRpb25EdG8oZGF0YTogSUxvY2F0aW9uRHRvIHwgSUxvY2F0aW9uRHRvW10gfCB1bmRlZmluZWQpOiBsYW5ndWFnZXMuTG9jYXRpb24gfCBsYW5ndWFnZXMuTG9jYXRpb25bXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gZGF0YTtcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcblx0XHRcdGRhdGEuZm9yRWFjaChsID0+IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVMb2NhdGlvbkR0byhsKSk7XG5cdFx0XHRyZXR1cm4gPGxhbmd1YWdlcy5Mb2NhdGlvbltdPmRhdGE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEudXJpID0gVVJJLnJldml2ZShkYXRhLnVyaSk7XG5cdFx0XHRyZXR1cm4gPGxhbmd1YWdlcy5Mb2NhdGlvbj5kYXRhO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZXZpdmVMb2NhdGlvbkxpbmtEdG8oZGF0YTogSUxvY2F0aW9uTGlua0R0byk6IGxhbmd1YWdlcy5Mb2NhdGlvbkxpbms7XG5cdHByaXZhdGUgc3RhdGljIF9yZXZpdmVMb2NhdGlvbkxpbmtEdG8oZGF0YTogSUxvY2F0aW9uTGlua0R0b1tdKTogbGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdO1xuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlTG9jYXRpb25MaW5rRHRvKGRhdGE6IElMb2NhdGlvbkxpbmtEdG8gfCBJTG9jYXRpb25MaW5rRHRvW10pOiBsYW5ndWFnZXMuTG9jYXRpb25MaW5rIHwgbGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdIHtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiA8bGFuZ3VhZ2VzLkxvY2F0aW9uTGluaz5kYXRhO1xuXHRcdH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShkYXRhKSkge1xuXHRcdFx0ZGF0YS5mb3JFYWNoKGwgPT4gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUxvY2F0aW9uTGlua0R0byhsKSk7XG5cdFx0XHRyZXR1cm4gPGxhbmd1YWdlcy5Mb2NhdGlvbkxpbmtbXT5kYXRhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLnVyaSA9IFVSSS5yZXZpdmUoZGF0YS51cmkpO1xuXHRcdFx0cmV0dXJuIDxsYW5ndWFnZXMuTG9jYXRpb25MaW5rPmRhdGE7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZVdvcmtzcGFjZVN5bWJvbER0byhkYXRhOiBJV29ya3NwYWNlU3ltYm9sRHRvKTogc2VhcmNoLklXb3Jrc3BhY2VTeW1ib2w7XG5cdHByaXZhdGUgc3RhdGljIF9yZXZpdmVXb3Jrc3BhY2VTeW1ib2xEdG8oZGF0YTogSVdvcmtzcGFjZVN5bWJvbER0b1tdKTogc2VhcmNoLklXb3Jrc3BhY2VTeW1ib2xbXTtcblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZVdvcmtzcGFjZVN5bWJvbER0byhkYXRhOiB1bmRlZmluZWQpOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3RhdGljIF9yZXZpdmVXb3Jrc3BhY2VTeW1ib2xEdG8oZGF0YTogSVdvcmtzcGFjZVN5bWJvbER0byB8IElXb3Jrc3BhY2VTeW1ib2xEdG9bXSB8IHVuZGVmaW5lZCk6IHNlYXJjaC5JV29ya3NwYWNlU3ltYm9sIHwgc2VhcmNoLklXb3Jrc3BhY2VTeW1ib2xbXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gZGF0YTtcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcblx0XHRcdGRhdGEuZm9yRWFjaChNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlV29ya3NwYWNlU3ltYm9sRHRvKTtcblx0XHRcdHJldHVybiA8c2VhcmNoLklXb3Jrc3BhY2VTeW1ib2xbXT5kYXRhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmxvY2F0aW9uID0gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUxvY2F0aW9uRHRvKGRhdGEubG9jYXRpb24pO1xuXHRcdFx0cmV0dXJuIDxzZWFyY2guSVdvcmtzcGFjZVN5bWJvbD5kYXRhO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZXZpdmVDb2RlQWN0aW9uRHRvKGRhdGE6IFJlYWRvbmx5QXJyYXk8SUNvZGVBY3Rpb25EdG8+LCB1cmlJZGVudFNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UpOiBsYW5ndWFnZXMuQ29kZUFjdGlvbltdIHtcblx0XHRkYXRhPy5mb3JFYWNoKGNvZGUgPT4gcmV2aXZlV29ya3NwYWNlRWRpdER0byhjb2RlLmVkaXQsIHVyaUlkZW50U2VydmljZSkpO1xuXHRcdHJldHVybiA8bGFuZ3VhZ2VzLkNvZGVBY3Rpb25bXT5kYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZUxpbmtEVE8oZGF0YTogSUxpbmtEdG8pOiBsYW5ndWFnZXMuSUxpbmsge1xuXHRcdGlmIChkYXRhLnVybCAmJiB0eXBlb2YgZGF0YS51cmwgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRkYXRhLnVybCA9IFVSSS5yZXZpdmUoZGF0YS51cmwpO1xuXHRcdH1cblx0XHRyZXR1cm4gPGxhbmd1YWdlcy5JTGluaz5kYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZUNhbGxIaWVyYXJjaHlJdGVtRHRvKGRhdGE6IElDYWxsSGllcmFyY2h5SXRlbUR0byB8IHVuZGVmaW5lZCk6IGNhbGxoLkNhbGxIaWVyYXJjaHlJdGVtIHtcblx0XHRpZiAoZGF0YSkge1xuXHRcdFx0ZGF0YS51cmkgPSBVUkkucmV2aXZlKGRhdGEudXJpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRhdGEgYXMgY2FsbGguQ2FsbEhpZXJhcmNoeUl0ZW07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmV2aXZlVHlwZUhpZXJhcmNoeUl0ZW1EdG8oZGF0YTogSVR5cGVIaWVyYXJjaHlJdGVtRHRvIHwgdW5kZWZpbmVkKTogdHlwZWguVHlwZUhpZXJhcmNoeUl0ZW0ge1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHRkYXRhLnVyaSA9IFVSSS5yZXZpdmUoZGF0YS51cmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGF0YSBhcyB0eXBlaC5UeXBlSGllcmFyY2h5SXRlbTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vIC0tLSBvdXRsaW5lXG5cblx0JHJlZ2lzdGVyRG9jdW1lbnRTeW1ib2xQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCBkaXNwbGF5TmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdHByb3ZpZGVEb2N1bWVudFN5bWJvbHM6IChtb2RlbDogSVRleHRNb2RlbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuRG9jdW1lbnRTeW1ib2xbXSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVEb2N1bWVudFN5bWJvbHMoaGFuZGxlLCBtb2RlbC51cmksIHRva2VuKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gY29kZSBsZW5zXG5cblx0JHJlZ2lzdGVyQ29kZUxlbnNTdXBwb3J0KGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIGV2ZW50SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblxuXHRcdGNvbnN0IHByb3ZpZGVyOiBsYW5ndWFnZXMuQ29kZUxlbnNQcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVDb2RlTGVuc2VzOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkNvZGVMZW5zTGlzdCB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRjb25zdCBsaXN0RHRvID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVDb2RlTGVuc2VzKGhhbmRsZSwgbW9kZWwudXJpLCB0b2tlbik7XG5cdFx0XHRcdGlmICghbGlzdER0bykge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsZW5zZXM6IGxpc3REdG8ubGVuc2VzLFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGxpc3REdG8uY2FjaGVJZCAmJiB0aGlzLl9wcm94eS4kcmVsZWFzZUNvZGVMZW5zZXMoaGFuZGxlLCBsaXN0RHRvLmNhY2hlSWQpXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZUNvZGVMZW5zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIGNvZGVMZW5zOiBsYW5ndWFnZXMuQ29kZUxlbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkNvZGVMZW5zIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRyZXNvbHZlQ29kZUxlbnMoaGFuZGxlLCBjb2RlTGVucywgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIXJlc3VsdCB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnJlc3VsdCxcblx0XHRcdFx0XHRyYW5nZTogbW9kZWwudmFsaWRhdGVSYW5nZShyZXN1bHQucmFuZ2UpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAodHlwZW9mIGV2ZW50SGFuZGxlID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPGxhbmd1YWdlcy5Db2RlTGVuc1Byb3ZpZGVyPigpO1xuXHRcdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoZXZlbnRIYW5kbGUsIGVtaXR0ZXIpO1xuXHRcdFx0cHJvdmlkZXIub25EaWRDaGFuZ2UgPSBlbWl0dGVyLmV2ZW50O1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlci5yZWdpc3RlcihzZWxlY3RvciwgcHJvdmlkZXIpKTtcblx0fVxuXG5cdCRlbWl0Q29kZUxlbnNFdmVudChldmVudEhhbmRsZTogbnVtYmVyLCBldmVudD86IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9yZWdpc3RyYXRpb25zLmdldChldmVudEhhbmRsZSk7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEVtaXR0ZXIpIHtcblx0XHRcdG9iai5maXJlKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gZGVjbGFyYXRpb25cblxuXHQkcmVnaXN0ZXJEZWZpbml0aW9uU3VwcG9ydChoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWZpbml0aW9uUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVEZWZpbml0aW9uOiAobW9kZWwsIHBvc2l0aW9uLCB0b2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZURlZmluaXRpb24oaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCB0b2tlbikudGhlbihNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlTG9jYXRpb25MaW5rRHRvKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQkcmVnaXN0ZXJEZWNsYXJhdGlvblN1cHBvcnQoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVjbGFyYXRpb25Qcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZURlY2xhcmF0aW9uOiAobW9kZWwsIHBvc2l0aW9uLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVEZWNsYXJhdGlvbihoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIHRva2VuKS50aGVuKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVMb2NhdGlvbkxpbmtEdG8pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdCRyZWdpc3RlckltcGxlbWVudGF0aW9uU3VwcG9ydChoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbXBsZW1lbnRhdGlvblByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlSW1wbGVtZW50YXRpb246IChtb2RlbCwgcG9zaXRpb24sIHRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25MaW5rW10+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlSW1wbGVtZW50YXRpb24oaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCB0b2tlbikudGhlbihNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlTG9jYXRpb25MaW5rRHRvKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQkcmVnaXN0ZXJUeXBlRGVmaW5pdGlvblN1cHBvcnQoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UudHlwZURlZmluaXRpb25Qcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZVR5cGVEZWZpbml0aW9uOiAobW9kZWwsIHBvc2l0aW9uLCB0b2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkxvY2F0aW9uTGlua1tdPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZVR5cGVEZWZpbml0aW9uKGhhbmRsZSwgbW9kZWwudXJpLCBwb3NpdGlvbiwgdG9rZW4pLnRoZW4oTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUxvY2F0aW9uTGlua0R0byk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIGV4dHJhIGluZm9cblxuXHQkcmVnaXN0ZXJIb3ZlclByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHQvKlxuXHRcdGNvbnN0IGhvdmVyRmluYWxpemF0aW9uUmVnaXN0cnkgPSBuZXcgRmluYWxpemF0aW9uUmVnaXN0cnkoKGhvdmVySWQ6IG51bWJlcikgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJHJlbGVhc2VIb3ZlcihoYW5kbGUsIGhvdmVySWQpO1xuXHRcdH0pO1xuXHRcdCovXG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5ob3ZlclByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlSG92ZXI6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IEVkaXRvclBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNvbnRleHQ/OiBsYW5ndWFnZXMuSG92ZXJDb250ZXh0PEhvdmVyV2l0aElkPik6IFByb21pc2U8SG92ZXJXaXRoSWQgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VyaWFsaXplZENvbnRleHQ6IGxhbmd1YWdlcy5Ib3ZlckNvbnRleHQ8eyBpZDogbnVtYmVyIH0+ID0ge1xuXHRcdFx0XHRcdHZlcmJvc2l0eVJlcXVlc3Q6IGNvbnRleHQ/LnZlcmJvc2l0eVJlcXVlc3QgPyB7XG5cdFx0XHRcdFx0XHR2ZXJib3NpdHlEZWx0YTogY29udGV4dC52ZXJib3NpdHlSZXF1ZXN0LnZlcmJvc2l0eURlbHRhLFxuXHRcdFx0XHRcdFx0cHJldmlvdXNIb3ZlcjogeyBpZDogY29udGV4dC52ZXJib3NpdHlSZXF1ZXN0LnByZXZpb3VzSG92ZXIuaWQgfVxuXHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVIb3ZlcihoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIHNlcmlhbGl6ZWRDb250ZXh0LCB0b2tlbik7XG5cdFx0XHRcdC8vIGhvdmVyRmluYWxpemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoaG92ZXIsIGhvdmVyLmlkKTtcblx0XHRcdFx0cmV0dXJuIGhvdmVyO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBkZWJ1ZyBob3ZlclxuXG5cdCRyZWdpc3RlckV2YWx1YXRhYmxlRXhwcmVzc2lvblByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmV2YWx1YXRhYmxlRXhwcmVzc2lvblByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlRXZhbHVhdGFibGVFeHByZXNzaW9uOiAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBFZGl0b3JQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuRXZhbHVhdGFibGVFeHByZXNzaW9uIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZUV2YWx1YXRhYmxlRXhwcmVzc2lvbihoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIHRva2VuKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gaW5saW5lIHZhbHVlc1xuXG5cdCRyZWdpc3RlcklubGluZVZhbHVlc1Byb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIGV2ZW50SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlcjogbGFuZ3VhZ2VzLklubGluZVZhbHVlc1Byb3ZpZGVyID0ge1xuXHRcdFx0cHJvdmlkZUlubGluZVZhbHVlczogKG1vZGVsOiBJVGV4dE1vZGVsLCB2aWV3UG9ydDogRWRpdG9yUmFuZ2UsIGNvbnRleHQ6IGxhbmd1YWdlcy5JbmxpbmVWYWx1ZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLklubGluZVZhbHVlW10gfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlSW5saW5lVmFsdWVzKGhhbmRsZSwgbW9kZWwudXJpLCB2aWV3UG9ydCwgY29udGV4dCwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAodHlwZW9mIGV2ZW50SGFuZGxlID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChldmVudEhhbmRsZSwgZW1pdHRlcik7XG5cdFx0XHRwcm92aWRlci5vbkRpZENoYW5nZUlubGluZVZhbHVlcyA9IGVtaXR0ZXIuZXZlbnQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVWYWx1ZXNQcm92aWRlci5yZWdpc3RlcihzZWxlY3RvciwgcHJvdmlkZXIpKTtcblx0fVxuXG5cdCRlbWl0SW5saW5lVmFsdWVzRXZlbnQoZXZlbnRIYW5kbGU6IG51bWJlciwgZXZlbnQ/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2JqID0gdGhpcy5fcmVnaXN0cmF0aW9ucy5nZXQoZXZlbnRIYW5kbGUpO1xuXHRcdGlmIChvYmogaW5zdGFuY2VvZiBFbWl0dGVyKSB7XG5cdFx0XHRvYmouZmlyZShldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIG9jY3VycmVuY2VzXG5cblx0JHJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlRG9jdW1lbnRIaWdobGlnaHRzOiAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBFZGl0b3JQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRbXSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVEb2N1bWVudEhpZ2hsaWdodHMoaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0JHJlZ2lzdGVyTXVsdGlEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLm11bHRpRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0c2VsZWN0b3I6IHNlbGVjdG9yLFxuXHRcdFx0cHJvdmlkZU11bHRpRG9jdW1lbnRIaWdobGlnaHRzOiAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBFZGl0b3JQb3NpdGlvbiwgb3RoZXJNb2RlbHM6IElUZXh0TW9kZWxbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxNYXA8VVJJLCBsYW5ndWFnZXMuRG9jdW1lbnRIaWdobGlnaHRbXT4gfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlTXVsdGlEb2N1bWVudEhpZ2hsaWdodHMoaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCBvdGhlck1vZGVscy5tYXAobW9kZWwgPT4gbW9kZWwudXJpKSwgdG9rZW4pLnRoZW4oZHRvID0+IHtcblx0XHRcdFx0XHQvLyBkdG8gc2hvdWxkIGJlIG5vbi1udWxsICsgbm9uLXVuZGVmaW5lZFxuXHRcdFx0XHRcdC8vIGR0byBsZW5ndGggb2YgMCBpcyB2YWxpZCwganVzdCBubyBoaWdobGlnaHRzLCBwYXNzIHRoaXMgdGhyb3VnaC5cblx0XHRcdFx0XHRpZiAoZHRvID09PSB1bmRlZmluZWQgfHwgZHRvID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgUmVzb3VyY2VNYXA8bGFuZ3VhZ2VzLkRvY3VtZW50SGlnaGxpZ2h0W10+KCk7XG5cdFx0XHRcdFx0ZHRvPy5mb3JFYWNoKHZhbHVlID0+IHtcblx0XHRcdFx0XHRcdC8vIGNoZWNrIGlmIHRoZSBVUkkgZXhpc3RzIGFscmVhZHksIGlmIHNvLCBjb21iaW5lIHRoZSBoaWdobGlnaHRzLCBvdGhlcndpc2UgY3JlYXRlIGEgbmV3IGVudHJ5XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKHZhbHVlLnVyaSk7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0Lmhhcyh1cmkpKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5nZXQodXJpKSEucHVzaCguLi52YWx1ZS5oaWdobGlnaHRzKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5zZXQodXJpLCB2YWx1ZS5oaWdobGlnaHRzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gbGlua2VkIGVkaXRpbmdcblxuXHQkcmVnaXN0ZXJMaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5saW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZUxpbmtlZEVkaXRpbmdSYW5nZXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IEVkaXRvclBvc2l0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5MaW5rZWRFZGl0aW5nUmFuZ2VzIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlTGlua2VkRWRpdGluZ1JhbmdlcyhoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIHRva2VuKTtcblx0XHRcdFx0aWYgKHJlcykge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRyYW5nZXM6IHJlcy5yYW5nZXMsXG5cdFx0XHRcdFx0XHR3b3JkUGF0dGVybjogcmVzLndvcmRQYXR0ZXJuID8gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVJlZ0V4cChyZXMud29yZFBhdHRlcm4pIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSByZWZlcmVuY2VzXG5cblx0JHJlZ2lzdGVyUmVmZXJlbmNlU3VwcG9ydChoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZWZlcmVuY2VQcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0cHJvdmlkZVJlZmVyZW5jZXM6IChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IEVkaXRvclBvc2l0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuUmVmZXJlbmNlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuTG9jYXRpb25bXT4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVSZWZlcmVuY2VzKGhhbmRsZSwgbW9kZWwudXJpLCBwb3NpdGlvbiwgY29udGV4dCwgdG9rZW4pLnRoZW4oTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUxvY2F0aW9uRHRvKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gY29kZSBhY3Rpb25zXG5cblx0JHJlZ2lzdGVyQ29kZUFjdGlvblN1cHBvcnQoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgbWV0YWRhdGE6IElDb2RlQWN0aW9uUHJvdmlkZXJNZXRhZGF0YUR0bywgZGlzcGxheU5hbWU6IHN0cmluZywgZXh0ZW5zaW9uSWQ6IHN0cmluZywgc3VwcG9ydHNSZXNvbHZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXI6IGxhbmd1YWdlcy5Db2RlQWN0aW9uUHJvdmlkZXIgPSB7XG5cdFx0XHRwcm92aWRlQ29kZUFjdGlvbnM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2VPclNlbGVjdGlvbjogRWRpdG9yUmFuZ2UgfCBTZWxlY3Rpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5Db2RlQWN0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuQ29kZUFjdGlvbkxpc3QgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgbGlzdER0byA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlQ29kZUFjdGlvbnMoaGFuZGxlLCBtb2RlbC51cmksIHJhbmdlT3JTZWxlY3Rpb24sIGNvbnRleHQsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFsaXN0RHRvKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGFjdGlvbnM6IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVDb2RlQWN0aW9uRHRvKGxpc3REdG8uYWN0aW9ucywgdGhpcy5fdXJpSWRlbnRTZXJ2aWNlKSxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIGxpc3REdG8uY2FjaGVJZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJHJlbGVhc2VDb2RlQWN0aW9ucyhoYW5kbGUsIGxpc3REdG8uY2FjaGVJZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVkQ29kZUFjdGlvbktpbmRzOiBtZXRhZGF0YS5wcm92aWRlZEtpbmRzLFxuXHRcdFx0ZG9jdW1lbnRhdGlvbjogbWV0YWRhdGEuZG9jdW1lbnRhdGlvbixcblx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0ZXh0ZW5zaW9uSWQsXG5cdFx0fTtcblxuXHRcdGlmIChzdXBwb3J0c1Jlc29sdmUpIHtcblx0XHRcdHByb3ZpZGVyLnJlc29sdmVDb2RlQWN0aW9uID0gYXN5bmMgKGNvZGVBY3Rpb246IGxhbmd1YWdlcy5Db2RlQWN0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5Db2RlQWN0aW9uPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fcHJveHkuJHJlc29sdmVDb2RlQWN0aW9uKGhhbmRsZSwgKDxJQ29kZUFjdGlvbkR0bz5jb2RlQWN0aW9uKS5jYWNoZUlkISwgdG9rZW4pO1xuXHRcdFx0XHRpZiAocmVzb2x2ZWQuZWRpdCkge1xuXHRcdFx0XHRcdGNvZGVBY3Rpb24uZWRpdCA9IHJldml2ZVdvcmtzcGFjZUVkaXREdG8ocmVzb2x2ZWQuZWRpdCwgdGhpcy5fdXJpSWRlbnRTZXJ2aWNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXNvbHZlZC5jb21tYW5kKSB7XG5cdFx0XHRcdFx0Y29kZUFjdGlvbi5jb21tYW5kID0gcmVzb2x2ZWQuY29tbWFuZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBjb2RlQWN0aW9uO1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlci5yZWdpc3RlcihzZWxlY3RvciwgcHJvdmlkZXIpKTtcblx0fVxuXG5cdC8vIC0tLSBjb3B5IHBhc3RlIGFjdGlvbiBwcm92aWRlclxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Bhc3RlRWRpdFByb3ZpZGVycyA9IG5ldyBNYXA8bnVtYmVyLCBNYWluVGhyZWFkUGFzdGVFZGl0UHJvdmlkZXI+KCk7XG5cblx0JHJlZ2lzdGVyUGFzdGVFZGl0UHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgbWV0YWRhdGE6IElQYXN0ZUVkaXRQcm92aWRlck1ldGFkYXRhRHRvKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTWFpblRocmVhZFBhc3RlRWRpdFByb3ZpZGVyKGhhbmRsZSwgdGhpcy5fcHJveHksIG1ldGFkYXRhLCB0aGlzLl91cmlJZGVudFNlcnZpY2UpO1xuXHRcdHRoaXMuX3Bhc3RlRWRpdFByb3ZpZGVycy5zZXQoaGFuZGxlLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHR0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBwcm92aWRlciksXG5cdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fcGFzdGVFZGl0UHJvdmlkZXJzLmRlbGV0ZShoYW5kbGUpKSxcblx0XHQpKTtcblx0fVxuXG5cdCRyZXNvbHZlUGFzdGVGaWxlRGF0YShoYW5kbGU6IG51bWJlciwgcmVxdWVzdElkOiBudW1iZXIsIGRhdGFJZDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlcj4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcGFzdGVFZGl0UHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgcHJvdmlkZXInKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3ZpZGVyLnJlc29sdmVGaWxlRGF0YShyZXF1ZXN0SWQsIGRhdGFJZCk7XG5cdH1cblxuXHQvLyAtLS0gZm9ybWF0dGluZ1xuXG5cdCRyZWdpc3RlckRvY3VtZW50Rm9ybWF0dGluZ1N1cHBvcnQoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGRpc3BsYXlOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlci5yZWdpc3RlcihzZWxlY3Rvciwge1xuXHRcdFx0ZXh0ZW5zaW9uSWQsXG5cdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdHByb3ZpZGVEb2N1bWVudEZvcm1hdHRpbmdFZGl0czogKG1vZGVsOiBJVGV4dE1vZGVsLCBvcHRpb25zOiBsYW5ndWFnZXMuRm9ybWF0dGluZ09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlRG9jdW1lbnRGb3JtYXR0aW5nRWRpdHMoaGFuZGxlLCBtb2RlbC51cmksIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQkcmVnaXN0ZXJSYW5nZUZvcm1hdHRpbmdTdXBwb3J0KGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBkaXNwbGF5TmFtZTogc3RyaW5nLCBzdXBwb3J0c1JhbmdlczogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdGV4dGVuc2lvbklkLFxuXHRcdFx0ZGlzcGxheU5hbWUsXG5cdFx0XHRwcm92aWRlRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0czogKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogRWRpdG9yUmFuZ2UsIG9wdGlvbnM6IGxhbmd1YWdlcy5Gb3JtYXR0aW5nT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuVGV4dEVkaXRbXSB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRzKGhhbmRsZSwgbW9kZWwudXJpLCByYW5nZSwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVEb2N1bWVudFJhbmdlc0Zvcm1hdHRpbmdFZGl0czogIXN1cHBvcnRzUmFuZ2VzXG5cdFx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHRcdDogKG1vZGVsLCByYW5nZXMsIG9wdGlvbnMsIHRva2VuKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlRG9jdW1lbnRSYW5nZXNGb3JtYXR0aW5nRWRpdHMoaGFuZGxlLCBtb2RlbC51cmksIHJhbmdlcywgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0XHR9LFxuXHRcdH0pKTtcblx0fVxuXG5cdCRyZWdpc3Rlck9uVHlwZUZvcm1hdHRpbmdTdXBwb3J0KGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIGF1dG9Gb3JtYXRUcmlnZ2VyQ2hhcmFjdGVyczogc3RyaW5nW10sIGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5vblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRleHRlbnNpb25JZCxcblx0XHRcdGF1dG9Gb3JtYXRUcmlnZ2VyQ2hhcmFjdGVycyxcblx0XHRcdHByb3ZpZGVPblR5cGVGb3JtYXR0aW5nRWRpdHM6IChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IEVkaXRvclBvc2l0aW9uLCBjaDogc3RyaW5nLCBvcHRpb25zOiBsYW5ndWFnZXMuRm9ybWF0dGluZ09wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlRleHRFZGl0W10gfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlT25UeXBlRm9ybWF0dGluZ0VkaXRzKGhhbmRsZSwgbW9kZWwudXJpLCBwb3NpdGlvbiwgY2gsIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gbmF2aWdhdGUgdHlwZVxuXG5cdCRyZWdpc3Rlck5hdmlnYXRlVHlwZVN1cHBvcnQoaGFuZGxlOiBudW1iZXIsIHN1cHBvcnRzUmVzb2x2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCBsYXN0UmVzdWx0SWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHByb3ZpZGVyOiBzZWFyY2guSVdvcmtzcGFjZVN5bWJvbFByb3ZpZGVyID0ge1xuXHRcdFx0cHJvdmlkZVdvcmtzcGFjZVN5bWJvbHM6IGFzeW5jIChzZWFyY2g6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzZWFyY2guSVdvcmtzcGFjZVN5bWJvbFtdPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlV29ya3NwYWNlU3ltYm9scyhoYW5kbGUsIHNlYXJjaCwgdG9rZW4pO1xuXHRcdFx0XHRpZiAobGFzdFJlc3VsdElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZVdvcmtzcGFjZVN5bWJvbHMoaGFuZGxlLCBsYXN0UmVzdWx0SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RSZXN1bHRJZCA9IHJlc3VsdC5jYWNoZUlkO1xuXHRcdFx0XHRyZXR1cm4gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVdvcmtzcGFjZVN5bWJvbER0byhyZXN1bHQuc3ltYm9scyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpZiAoc3VwcG9ydHNSZXNvbHZlKSB7XG5cdFx0XHRwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlU3ltYm9sID0gYXN5bmMgKGl0ZW06IHNlYXJjaC5JV29ya3NwYWNlU3ltYm9sLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHNlYXJjaC5JV29ya3NwYWNlU3ltYm9sIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkSXRlbSA9IGF3YWl0IHRoaXMuX3Byb3h5LiRyZXNvbHZlV29ya3NwYWNlU3ltYm9sKGhhbmRsZSwgaXRlbSwgdG9rZW4pO1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWRJdGVtICYmIE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVXb3Jrc3BhY2VTeW1ib2xEdG8ocmVzb2x2ZWRJdGVtKTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgc2VhcmNoLldvcmtzcGFjZVN5bWJvbFByb3ZpZGVyUmVnaXN0cnkucmVnaXN0ZXIocHJvdmlkZXIpKTtcblx0fVxuXG5cdC8vIC0tLSByZW5hbWVcblxuXHQkcmVnaXN0ZXJSZW5hbWVTdXBwb3J0KGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIHN1cHBvcnRSZXNvbHZlTG9jYXRpb246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnJlbmFtZVByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCB7XG5cdFx0XHRwcm92aWRlUmVuYW1lRWRpdHM6IChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IEVkaXRvclBvc2l0aW9uLCBuZXdOYW1lOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVSZW5hbWVFZGl0cyhoYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIG5ld05hbWUsIHRva2VuKS50aGVuKGRhdGEgPT4gcmV2aXZlV29ya3NwYWNlRWRpdER0byhkYXRhLCB0aGlzLl91cmlJZGVudFNlcnZpY2UpKTtcblx0XHRcdH0sXG5cdFx0XHRyZXNvbHZlUmVuYW1lTG9jYXRpb246IHN1cHBvcnRSZXNvbHZlTG9jYXRpb25cblx0XHRcdFx0PyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBFZGl0b3JQb3NpdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuUmVuYW1lTG9jYXRpb24gfCB1bmRlZmluZWQ+ID0+IHRoaXMuX3Byb3h5LiRyZXNvbHZlUmVuYW1lTG9jYXRpb24oaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCB0b2tlbilcblx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHR9KSk7XG5cdH1cblxuXHQkcmVnaXN0ZXJOZXdTeW1ib2xOYW1lc1Byb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLm5ld1N5bWJvbE5hbWVzUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdHN1cHBvcnRzQXV0b21hdGljTmV3U3ltYm9sTmFtZXNUcmlnZ2VyS2luZDogdGhpcy5fcHJveHkuJHN1cHBvcnRzQXV0b21hdGljTmV3U3ltYm9sTmFtZXNUcmlnZ2VyS2luZChoYW5kbGUpLFxuXHRcdFx0cHJvdmlkZU5ld1N5bWJvbE5hbWVzOiAobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBJUmFuZ2UsIHRyaWdnZXJLaW5kOiBsYW5ndWFnZXMuTmV3U3ltYm9sTmFtZVRyaWdnZXJLaW5kLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5OZXdTeW1ib2xOYW1lW10gfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlTmV3U3ltYm9sTmFtZXMoaGFuZGxlLCBtb2RlbC51cmksIHJhbmdlLCB0cmlnZ2VyS2luZCwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0gc2F0aXNmaWVzIGxhbmd1YWdlcy5OZXdTeW1ib2xOYW1lc1Byb3ZpZGVyKSk7XG5cdH1cblxuXHQvLyAtLS0gc2VtYW50aWMgdG9rZW5zXG5cblx0JHJlZ2lzdGVyRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIGxlZ2VuZDogbGFuZ3VhZ2VzLlNlbWFudGljVG9rZW5zTGVnZW5kLCBldmVudEhhbmRsZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0bGV0IGV2ZW50OiBFdmVudDx2b2lkPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGV2ZW50SGFuZGxlID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChldmVudEhhbmRsZSwgZW1pdHRlcik7XG5cdFx0XHRldmVudCA9IGVtaXR0ZXIuZXZlbnQ7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBuZXcgTWFpblRocmVhZERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcih0aGlzLl9wcm94eSwgaGFuZGxlLCBsZWdlbmQsIGV2ZW50KSkpO1xuXHR9XG5cblx0JGVtaXREb2N1bWVudFNlbWFudGljVG9rZW5zRXZlbnQoZXZlbnRIYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG9iaiA9IHRoaXMuX3JlZ2lzdHJhdGlvbnMuZ2V0KGV2ZW50SGFuZGxlKTtcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgRW1pdHRlcikge1xuXHRcdFx0b2JqLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQkZW1pdERvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc0V2ZW50KGV2ZW50SGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9yZWdpc3RyYXRpb25zLmdldChldmVudEhhbmRsZSk7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEVtaXR0ZXIpIHtcblx0XHRcdG9iai5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0JHJlZ2lzdGVyRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgbGVnZW5kOiBsYW5ndWFnZXMuU2VtYW50aWNUb2tlbnNMZWdlbmQsIGV2ZW50SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRsZXQgZXZlbnQ6IEV2ZW50PHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgZXZlbnRIYW5kbGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGV2ZW50SGFuZGxlLCBlbWl0dGVyKTtcblx0XHRcdGV2ZW50ID0gZW1pdHRlci5ldmVudDtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlci5yZWdpc3RlcihzZWxlY3RvciwgbmV3IE1haW5UaHJlYWREb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcih0aGlzLl9wcm94eSwgaGFuZGxlLCBsZWdlbmQsIGV2ZW50KSkpO1xuXHR9XG5cblx0Ly8gLS0tIHN1Z2dlc3RcblxuXHRwcml2YXRlIHN0YXRpYyBfaW5mbGF0ZVN1Z2dlc3REdG8oZGVmYXVsdFJhbmdlOiBJUmFuZ2UgfCB7IGluc2VydDogSVJhbmdlOyByZXBsYWNlOiBJUmFuZ2UgfSwgZGF0YTogSVN1Z2dlc3REYXRhRHRvLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbSB7XG5cblx0XHRjb25zdCBsYWJlbCA9IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQubGFiZWxdO1xuXHRcdGNvbnN0IGNvbW1hbmRJZCA9IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZElkXTtcblx0XHRjb25zdCBjb21tYW5kSWRlbnQgPSBkYXRhW0lTdWdnZXN0RGF0YUR0b0ZpZWxkLmNvbW1hbmRJZGVudF07XG5cdFx0Y29uc3QgY29tbWl0Q2hhcnMgPSBkYXRhW0lTdWdnZXN0RGF0YUR0b0ZpZWxkLmNvbW1pdENoYXJhY3RlcnNdO1xuXG5cdFx0dHlwZSBJZGVudENvbW1hbmQgPSBsYW5ndWFnZXMuQ29tbWFuZCAmIHsgJGlkZW50OiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblxuXHRcdGxldCBjb21tYW5kOiBJZGVudENvbW1hbmQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbW1hbmRJZCkge1xuXHRcdFx0Y29tbWFuZCA9IHtcblx0XHRcdFx0JGlkZW50OiBjb21tYW5kSWRlbnQsXG5cdFx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0YXJndW1lbnRzOiBjb21tYW5kSWRlbnQgPyBbY29tbWFuZElkZW50XSA6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQuY29tbWFuZEFyZ3VtZW50c10sIC8vIEF1dG9tYXRpY2FsbHkgZmlsbCBpbiBpZGVudCBhcyBmaXJzdCBhcmd1bWVudFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWwsXG5cdFx0XHRleHRlbnNpb25JZCxcblx0XHRcdGtpbmQ6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQua2luZF0gPz8gbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSxcblx0XHRcdHRhZ3M6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQua2luZE1vZGlmaWVyXSxcblx0XHRcdGRldGFpbDogZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5kZXRhaWxdLFxuXHRcdFx0ZG9jdW1lbnRhdGlvbjogZGF0YVtJU3VnZ2VzdERhdGFEdG9GaWVsZC5kb2N1bWVudGF0aW9uXSxcblx0XHRcdHNvcnRUZXh0OiBkYXRhW0lTdWdnZXN0RGF0YUR0b0ZpZWxkLnNvcnRUZXh0XSxcblx0XHRcdGZpbHRlclRleHQ6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQuZmlsdGVyVGV4dF0sXG5cdFx0XHRwcmVzZWxlY3Q6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQucHJlc2VsZWN0XSxcblx0XHRcdGluc2VydFRleHQ6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dF0gPz8gKHR5cGVvZiBsYWJlbCA9PT0gJ3N0cmluZycgPyBsYWJlbCA6IGxhYmVsLmxhYmVsKSxcblx0XHRcdHJhbmdlOiBkYXRhW0lTdWdnZXN0RGF0YUR0b0ZpZWxkLnJhbmdlXSA/PyBkZWZhdWx0UmFuZ2UsXG5cdFx0XHRpbnNlcnRUZXh0UnVsZXM6IGRhdGFbSVN1Z2dlc3REYXRhRHRvRmllbGQuaW5zZXJ0VGV4dFJ1bGVzXSxcblx0XHRcdGNvbW1pdENoYXJhY3RlcnM6IGNvbW1pdENoYXJzID8gQXJyYXkuZnJvbShjb21taXRDaGFycykgOiB1bmRlZmluZWQsXG5cdFx0XHRhZGRpdGlvbmFsVGV4dEVkaXRzOiBkYXRhW0lTdWdnZXN0RGF0YUR0b0ZpZWxkLmFkZGl0aW9uYWxUZXh0RWRpdHNdLFxuXHRcdFx0Y29tbWFuZCxcblx0XHRcdC8vIG5vdC1zdGFuZGFyZFxuXHRcdFx0X2lkOiBkYXRhLngsXG5cdFx0fTtcblx0fVxuXG5cdCRyZWdpc3RlckNvbXBsZXRpb25zUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgdHJpZ2dlckNoYXJhY3RlcnM6IHN0cmluZ1tdLCBzdXBwb3J0c1Jlc29sdmVEZXRhaWxzOiBib29sZWFuLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyOiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciA9IHtcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzLFxuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6IGAke2V4dGVuc2lvbklkLnZhbHVlfSgke3RyaWdnZXJDaGFyYWN0ZXJzLmpvaW4oJycpfSlgLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogRWRpdG9yUG9zaXRpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuQ29tcGxldGlvbkxpc3QgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiByZXN1bHRbSVN1Z2dlc3RSZXN1bHREdG9GaWVsZC5jb21wbGV0aW9uc10ubWFwKGQgPT4gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX2luZmxhdGVTdWdnZXN0RHRvKHJlc3VsdFtJU3VnZ2VzdFJlc3VsdER0b0ZpZWxkLmRlZmF1bHRSYW5nZXNdLCBkLCBleHRlbnNpb25JZCkpLFxuXHRcdFx0XHRcdGluY29tcGxldGU6IHJlc3VsdFtJU3VnZ2VzdFJlc3VsdER0b0ZpZWxkLmlzSW5jb21wbGV0ZV0gfHwgZmFsc2UsXG5cdFx0XHRcdFx0ZHVyYXRpb246IHJlc3VsdFtJU3VnZ2VzdFJlc3VsdER0b0ZpZWxkLmR1cmF0aW9uXSxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIHJlc3VsdC54ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZUNvbXBsZXRpb25JdGVtcyhoYW5kbGUsIHJlc3VsdC54KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpZiAoc3VwcG9ydHNSZXNvbHZlRGV0YWlscykge1xuXHRcdFx0cHJvdmlkZXIucmVzb2x2ZUNvbXBsZXRpb25JdGVtID0gKHN1Z2dlc3Rpb24sIHRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcmVzb2x2ZUNvbXBsZXRpb25JdGVtKGhhbmRsZSwgc3VnZ2VzdGlvbi5faWQhLCB0b2tlbikudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc3VnZ2VzdGlvbjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBuZXdTdWdnZXN0aW9uID0gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX2luZmxhdGVTdWdnZXN0RHRvKHN1Z2dlc3Rpb24ucmFuZ2UsIHJlc3VsdCwgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRcdHJldHVybiBtaXhpbihzdWdnZXN0aW9uLCBuZXdTdWdnZXN0aW9uLCB0cnVlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3RlcihzZWxlY3RvciwgcHJvdmlkZXIpKTtcblx0fVxuXG5cdCRyZWdpc3RlcklubGluZUNvbXBsZXRpb25zU3VwcG9ydChcblx0XHRoYW5kbGU6IG51bWJlcixcblx0XHRzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sXG5cdFx0c3VwcG9ydHNIYW5kbGVFdmVudHM6IGJvb2xlYW4sXG5cdFx0ZXh0ZW5zaW9uSWQ6IHN0cmluZyxcblx0XHRleHRlbnNpb25WZXJzaW9uOiBzdHJpbmcsXG5cdFx0Z3JvdXBJZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHlpZWxkc1RvRXh0ZW5zaW9uSWRzOiBzdHJpbmdbXSxcblx0XHRkaXNwbGF5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdGRlYm91bmNlRGVsYXlNczogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdGV4Y2x1ZGVzRXh0ZW5zaW9uSWRzOiBzdHJpbmdbXSxcblx0XHRzdXBwb3J0c09uRGlkQ2hhbmdlOiBib29sZWFuLFxuXHRcdHN1cHBvcnRzU2V0TW9kZWxJZDogYm9vbGVhbixcblx0XHRpbml0aWFsTW9kZWxJbmZvOiBJSW5saW5lQ29tcGxldGlvbk1vZGVsSW5mb0R0byB8IHVuZGVmaW5lZCxcblx0XHRzdXBwb3J0c09uRGlkQ2hhbmdlTW9kZWxJbmZvOiBib29sZWFuLFxuXHRcdHN1cHBvcnRzU2V0UHJvdmlkZXJPcHRpb246IGJvb2xlYW4sXG5cdFx0aW5pdGlhbFByb3ZpZGVyT3B0aW9uczogcmVhZG9ubHkgSUlubGluZUNvbXBsZXRpb25Qcm92aWRlck9wdGlvbkR0b1tdIHwgdW5kZWZpbmVkLFxuXHRcdHN1cHBvcnRzT25EaWRDaGFuZ2VQcm92aWRlck9wdGlvbnM6IGJvb2xlYW4sXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBuZXcgbGFuZ3VhZ2VzLlByb3ZpZGVySWQoZXh0ZW5zaW9uSWQsIGV4dGVuc2lvblZlcnNpb24sIGdyb3VwSWQpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEV4dGVuc2lvbkJhY2tlZElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIsXG5cdFx0XHRoYW5kbGUsXG5cdFx0XHRncm91cElkID8/IGV4dGVuc2lvbklkLFxuXHRcdFx0cHJvdmlkZXJJZCxcblx0XHRcdHlpZWxkc1RvRXh0ZW5zaW9uSWRzLFxuXHRcdFx0ZXhjbHVkZXNFeHRlbnNpb25JZHMsXG5cdFx0XHRkZWJvdW5jZURlbGF5TXMsXG5cdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdGluaXRpYWxNb2RlbEluZm8sXG5cdFx0XHRzdXBwb3J0c0hhbmRsZUV2ZW50cyxcblx0XHRcdHN1cHBvcnRzU2V0TW9kZWxJZCxcblx0XHRcdHN1cHBvcnRzT25EaWRDaGFuZ2UsXG5cdFx0XHRzdXBwb3J0c09uRGlkQ2hhbmdlTW9kZWxJbmZvLFxuXHRcdFx0aW5pdGlhbFByb3ZpZGVyT3B0aW9ucyxcblx0XHRcdHN1cHBvcnRzU2V0UHJvdmlkZXJPcHRpb24sXG5cdFx0XHRzdXBwb3J0c09uRGlkQ2hhbmdlUHJvdmlkZXJPcHRpb25zLFxuXHRcdFx0c2VsZWN0b3IsXG5cdFx0XHR0aGlzLl9wcm94eSxcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCBwcm92aWRlcik7XG5cdH1cblxuXHQkZW1pdElubGluZUNvbXBsZXRpb25zQ2hhbmdlKGhhbmRsZTogbnVtYmVyLCBjaGFuZ2VIaW50OiBJSW5saW5lQ29tcGxldGlvbkNoYW5nZUhpbnREdG8gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9yZWdpc3RyYXRpb25zLmdldChoYW5kbGUpO1xuXHRcdGlmIChvYmogaW5zdGFuY2VvZiBFeHRlbnNpb25CYWNrZWRJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKSB7XG5cdFx0XHRvYmouX2VtaXREaWRDaGFuZ2UoY2hhbmdlSGludCk7XG5cdFx0fVxuXHR9XG5cblx0JGVtaXRJbmxpbmVDb21wbGV0aW9uTW9kZWxJbmZvQ2hhbmdlKGhhbmRsZTogbnVtYmVyLCBkYXRhOiBJSW5saW5lQ29tcGxldGlvbk1vZGVsSW5mb0R0byB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IG9iaiA9IHRoaXMuX3JlZ2lzdHJhdGlvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEV4dGVuc2lvbkJhY2tlZElubGluZUNvbXBsZXRpb25zUHJvdmlkZXIpIHtcblx0XHRcdG9iai5fc2V0TW9kZWxJbmZvKGRhdGEpO1xuXHRcdH1cblx0fVxuXG5cdCRlbWl0SW5saW5lQ29tcGxldGlvblByb3ZpZGVyT3B0aW9uc0NoYW5nZShoYW5kbGU6IG51bWJlciwgZGF0YTogcmVhZG9ubHkgSUlubGluZUNvbXBsZXRpb25Qcm92aWRlck9wdGlvbkR0b1tdIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2JqID0gdGhpcy5fcmVnaXN0cmF0aW9ucy5nZXQoaGFuZGxlKTtcblx0XHRpZiAob2JqIGluc3RhbmNlb2YgRXh0ZW5zaW9uQmFja2VkSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcikge1xuXHRcdFx0b2JqLl9zZXRQcm92aWRlck9wdGlvbnMoZGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIHBhcmFtZXRlciBoaW50c1xuXG5cdCRyZWdpc3RlclNpZ25hdHVyZUhlbHBQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCBtZXRhZGF0YTogSVNpZ25hdHVyZUhlbHBQcm92aWRlck1ldGFkYXRhRHRvKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5zaWduYXR1cmVIZWxwUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblxuXHRcdFx0c2lnbmF0dXJlSGVscFRyaWdnZXJDaGFyYWN0ZXJzOiBtZXRhZGF0YS50cmlnZ2VyQ2hhcmFjdGVycyxcblx0XHRcdHNpZ25hdHVyZUhlbHBSZXRyaWdnZXJDaGFyYWN0ZXJzOiBtZXRhZGF0YS5yZXRyaWdnZXJDaGFyYWN0ZXJzLFxuXG5cdFx0XHRwcm92aWRlU2lnbmF0dXJlSGVscDogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogRWRpdG9yUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dDogbGFuZ3VhZ2VzLlNpZ25hdHVyZUhlbHBDb250ZXh0KTogUHJvbWlzZTxsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFJlc3VsdCB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZVNpZ25hdHVyZUhlbHAoaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9uLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHZhbHVlOiByZXN1bHQsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJHJlbGVhc2VTaWduYXR1cmVIZWxwKGhhbmRsZSwgcmVzdWx0LmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gLS0tIGlubGluZSBoaW50c1xuXG5cdCRyZWdpc3RlcklubGF5SGludHNQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdLCBzdXBwb3J0c1Jlc29sdmU6IGJvb2xlYW4sIGV2ZW50SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQsIGRpc3BsYXlOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlcjogbGFuZ3VhZ2VzLklubGF5SGludHNQcm92aWRlciA9IHtcblx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0cHJvdmlkZUlubGF5SGludHM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IEVkaXRvclJhbmdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGxhbmd1YWdlcy5JbmxheUhpbnRMaXN0IHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlSW5sYXlIaW50cyhoYW5kbGUsIG1vZGVsLnVyaSwgcmFuZ2UsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRoaW50czogcmV2aXZlKHJlc3VsdC5oaW50cyksXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdC5jYWNoZUlkKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlSW5sYXlIaW50cyhoYW5kbGUsIHJlc3VsdC5jYWNoZUlkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpZiAoc3VwcG9ydHNSZXNvbHZlKSB7XG5cdFx0XHRwcm92aWRlci5yZXNvbHZlSW5sYXlIaW50ID0gYXN5bmMgKGhpbnQsIHRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGR0bzogSUlubGF5SGludER0byA9IGhpbnQ7XG5cdFx0XHRcdGlmICghZHRvLmNhY2hlSWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gaGludDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kcmVzb2x2ZUlubGF5SGludChoYW5kbGUsIGR0by5jYWNoZUlkLCB0b2tlbik7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGhpbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5oaW50LFxuXHRcdFx0XHRcdHRvb2x0aXA6IHJlc3VsdC50b29sdGlwLFxuXHRcdFx0XHRcdGxhYmVsOiByZXZpdmU8c3RyaW5nIHwgbGFuZ3VhZ2VzLklubGF5SGludExhYmVsUGFydFtdPihyZXN1bHQubGFiZWwpLFxuXHRcdFx0XHRcdHRleHRFZGl0czogcmVzdWx0LnRleHRFZGl0c1xuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBldmVudEhhbmRsZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoZXZlbnRIYW5kbGUsIGVtaXR0ZXIpO1xuXHRcdFx0cHJvdmlkZXIub25EaWRDaGFuZ2VJbmxheUhpbnRzID0gZW1pdHRlci5ldmVudDtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGF5SGludHNQcm92aWRlci5yZWdpc3RlcihzZWxlY3RvciwgcHJvdmlkZXIpKTtcblx0fVxuXG5cdCRlbWl0SW5sYXlIaW50c0V2ZW50KGV2ZW50SGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9yZWdpc3RyYXRpb25zLmdldChldmVudEhhbmRsZSk7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEVtaXR0ZXIpIHtcblx0XHRcdG9iai5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIGxpbmtzXG5cblx0JHJlZ2lzdGVyRG9jdW1lbnRMaW5rUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgc3VwcG9ydHNSZXNvbHZlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXI6IGxhbmd1YWdlcy5MaW5rUHJvdmlkZXIgPSB7XG5cdFx0XHRwcm92aWRlTGlua3M6IChtb2RlbCwgdG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlRG9jdW1lbnRMaW5rcyhoYW5kbGUsIG1vZGVsLnVyaSwgdG9rZW4pLnRoZW4oZHRvID0+IHtcblx0XHRcdFx0XHRpZiAoIWR0bykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxpbmtzOiBkdG8ubGlua3MubWFwKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVMaW5rRFRPKSxcblx0XHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBkdG8uY2FjaGVJZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZURvY3VtZW50TGlua3MoaGFuZGxlLCBkdG8uY2FjaGVJZCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGlmIChzdXBwb3J0c1Jlc29sdmUpIHtcblx0XHRcdHByb3ZpZGVyLnJlc29sdmVMaW5rID0gKGxpbmssIHRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGR0bzogSUxpbmtEdG8gPSBsaW5rO1xuXHRcdFx0XHRpZiAoIWR0by5jYWNoZUlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxpbms7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZXNvbHZlRG9jdW1lbnRMaW5rKGhhbmRsZSwgZHRvLmNhY2hlSWQsIHRva2VuKS50aGVuKG9iaiA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG9iaiAmJiBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlTGlua0RUTyhvYmopO1xuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UubGlua1Byb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBwcm92aWRlcikpO1xuXHR9XG5cblx0Ly8gLS0tIGNvbG9yc1xuXG5cdCRyZWdpc3RlckRvY3VtZW50Q29sb3JQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJveHkgPSB0aGlzLl9wcm94eTtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbG9yUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVEb2N1bWVudENvbG9yczogKG1vZGVsLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcHJveHkuJHByb3ZpZGVEb2N1bWVudENvbG9ycyhoYW5kbGUsIG1vZGVsLnVyaSwgdG9rZW4pXG5cdFx0XHRcdFx0LnRoZW4oZG9jdW1lbnRDb2xvcnMgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRvY3VtZW50Q29sb3JzLm1hcChkb2N1bWVudENvbG9yID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgW3JlZCwgZ3JlZW4sIGJsdWUsIGFscGhhXSA9IGRvY3VtZW50Q29sb3IuY29sb3I7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbG9yID0ge1xuXHRcdFx0XHRcdFx0XHRcdHJlZDogcmVkLFxuXHRcdFx0XHRcdFx0XHRcdGdyZWVuOiBncmVlbixcblx0XHRcdFx0XHRcdFx0XHRibHVlOiBibHVlLFxuXHRcdFx0XHRcdFx0XHRcdGFscGhhXG5cdFx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRjb2xvcixcblx0XHRcdFx0XHRcdFx0XHRyYW5nZTogZG9jdW1lbnRDb2xvci5yYW5nZVxuXHRcdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRwcm92aWRlQ29sb3JQcmVzZW50YXRpb25zOiAobW9kZWwsIGNvbG9ySW5mbywgdG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHByb3h5LiRwcm92aWRlQ29sb3JQcmVzZW50YXRpb25zKGhhbmRsZSwgbW9kZWwudXJpLCB7XG5cdFx0XHRcdFx0Y29sb3I6IFtjb2xvckluZm8uY29sb3IucmVkLCBjb2xvckluZm8uY29sb3IuZ3JlZW4sIGNvbG9ySW5mby5jb2xvci5ibHVlLCBjb2xvckluZm8uY29sb3IuYWxwaGFdLFxuXHRcdFx0XHRcdHJhbmdlOiBjb2xvckluZm8ucmFuZ2Vcblx0XHRcdFx0fSwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBmb2xkaW5nXG5cblx0JHJlZ2lzdGVyRm9sZGluZ1JhbmdlUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSwgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGV2ZW50SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlcjogbGFuZ3VhZ2VzLkZvbGRpbmdSYW5nZVByb3ZpZGVyID0ge1xuXHRcdFx0aWQ6IGV4dGVuc2lvbklkLnZhbHVlLFxuXHRcdFx0cHJvdmlkZUZvbGRpbmdSYW5nZXM6IChtb2RlbCwgY29udGV4dCwgdG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlRm9sZGluZ1JhbmdlcyhoYW5kbGUsIG1vZGVsLnVyaSwgY29udGV4dCwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAodHlwZW9mIGV2ZW50SGFuZGxlID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VQcm92aWRlcj4oKTtcblx0XHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGV2ZW50SGFuZGxlLCBlbWl0dGVyKTtcblx0XHRcdHByb3ZpZGVyLm9uRGlkQ2hhbmdlID0gZW1pdHRlci5ldmVudDtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmZvbGRpbmdSYW5nZVByb3ZpZGVyLnJlZ2lzdGVyKHNlbGVjdG9yLCBwcm92aWRlcikpO1xuXHR9XG5cblx0JGVtaXRGb2xkaW5nUmFuZ2VFdmVudChldmVudEhhbmRsZTogbnVtYmVyLCBldmVudD86IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBvYmogPSB0aGlzLl9yZWdpc3RyYXRpb25zLmdldChldmVudEhhbmRsZSk7XG5cdFx0aWYgKG9iaiBpbnN0YW5jZW9mIEVtaXR0ZXIpIHtcblx0XHRcdG9iai5maXJlKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLSBzbWFydCBzZWxlY3RcblxuXHQkcmVnaXN0ZXJTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnNlbGVjdGlvblJhbmdlUHJvdmlkZXIucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblx0XHRcdHByb3ZpZGVTZWxlY3Rpb25SYW5nZXM6IChtb2RlbCwgcG9zaXRpb25zLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHByb3ZpZGVTZWxlY3Rpb25SYW5nZXMoaGFuZGxlLCBtb2RlbC51cmksIHBvc2l0aW9ucywgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBjYWxsIGhpZXJhcmNoeVxuXG5cdCRyZWdpc3RlckNhbGxIaWVyYXJjaHlQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2VsZWN0b3I6IElEb2N1bWVudEZpbHRlckR0b1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCBjYWxsaC5DYWxsSGllcmFyY2h5UHJvdmlkZXJSZWdpc3RyeS5yZWdpc3RlcihzZWxlY3Rvciwge1xuXG5cdFx0XHRwcmVwYXJlQ2FsbEhpZXJhcmNoeTogYXN5bmMgKGRvY3VtZW50LCBwb3NpdGlvbiwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJlcGFyZUNhbGxIaWVyYXJjaHkoaGFuZGxlLCBkb2N1bWVudC51cmksIHBvc2l0aW9uLCB0b2tlbik7XG5cdFx0XHRcdGlmICghaXRlbXMgfHwgaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZUNhbGxIaWVyYXJjaHkoaGFuZGxlLCBpdGVtLl9zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cm9vdHM6IGl0ZW1zLm1hcChNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlQ2FsbEhpZXJhcmNoeUl0ZW1EdG8pXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXG5cdFx0XHRwcm92aWRlT3V0Z29pbmdDYWxsczogYXN5bmMgKGl0ZW0sIHRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG91dGdvaW5nID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVDYWxsSGllcmFyY2h5T3V0Z29pbmdDYWxscyhoYW5kbGUsIGl0ZW0uX3Nlc3Npb25JZCwgaXRlbS5faXRlbUlkLCB0b2tlbik7XG5cdFx0XHRcdGlmICghb3V0Z29pbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gb3V0Z29pbmc7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3V0Z29pbmcuZm9yRWFjaCh2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0dmFsdWUudG8gPSBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlQ2FsbEhpZXJhcmNoeUl0ZW1EdG8odmFsdWUudG8pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdHJldHVybiA8YW55Pm91dGdvaW5nO1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVJbmNvbWluZ0NhbGxzOiBhc3luYyAoaXRlbSwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21pbmcgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUNhbGxIaWVyYXJjaHlJbmNvbWluZ0NhbGxzKGhhbmRsZSwgaXRlbS5fc2Vzc2lvbklkLCBpdGVtLl9pdGVtSWQsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFpbmNvbWluZykge1xuXHRcdFx0XHRcdHJldHVybiBpbmNvbWluZztcblx0XHRcdFx0fVxuXHRcdFx0XHRpbmNvbWluZy5mb3JFYWNoKHZhbHVlID0+IHtcblx0XHRcdFx0XHR2YWx1ZS5mcm9tID0gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZUNhbGxIaWVyYXJjaHlJdGVtRHRvKHZhbHVlLmZyb20pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdHJldHVybiA8YW55PmluY29taW5nO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tLSBjb25maWd1cmF0aW9uXG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZVJlZ0V4cChyZWdFeHA6IElSZWdFeHBEdG8pOiBSZWdFeHAge1xuXHRcdHJldHVybiBuZXcgUmVnRXhwKHJlZ0V4cC5wYXR0ZXJuLCByZWdFeHAuZmxhZ3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZUluZGVudGF0aW9uUnVsZShpbmRlbnRhdGlvblJ1bGU6IElJbmRlbnRhdGlvblJ1bGVEdG8pOiBJbmRlbnRhdGlvblJ1bGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRkZWNyZWFzZUluZGVudFBhdHRlcm46IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVSZWdFeHAoaW5kZW50YXRpb25SdWxlLmRlY3JlYXNlSW5kZW50UGF0dGVybiksXG5cdFx0XHRpbmNyZWFzZUluZGVudFBhdHRlcm46IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVSZWdFeHAoaW5kZW50YXRpb25SdWxlLmluY3JlYXNlSW5kZW50UGF0dGVybiksXG5cdFx0XHRpbmRlbnROZXh0TGluZVBhdHRlcm46IGluZGVudGF0aW9uUnVsZS5pbmRlbnROZXh0TGluZVBhdHRlcm4gPyBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlUmVnRXhwKGluZGVudGF0aW9uUnVsZS5pbmRlbnROZXh0TGluZVBhdHRlcm4pIDogdW5kZWZpbmVkLFxuXHRcdFx0dW5JbmRlbnRlZExpbmVQYXR0ZXJuOiBpbmRlbnRhdGlvblJ1bGUudW5JbmRlbnRlZExpbmVQYXR0ZXJuID8gTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZVJlZ0V4cChpbmRlbnRhdGlvblJ1bGUudW5JbmRlbnRlZExpbmVQYXR0ZXJuKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZU9uRW50ZXJSdWxlKG9uRW50ZXJSdWxlOiBJT25FbnRlclJ1bGVEdG8pOiBPbkVudGVyUnVsZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJlZm9yZVRleHQ6IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVSZWdFeHAob25FbnRlclJ1bGUuYmVmb3JlVGV4dCksXG5cdFx0XHRhZnRlclRleHQ6IG9uRW50ZXJSdWxlLmFmdGVyVGV4dCA/IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVSZWdFeHAob25FbnRlclJ1bGUuYWZ0ZXJUZXh0KSA6IHVuZGVmaW5lZCxcblx0XHRcdHByZXZpb3VzTGluZVRleHQ6IG9uRW50ZXJSdWxlLnByZXZpb3VzTGluZVRleHQgPyBNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlUmVnRXhwKG9uRW50ZXJSdWxlLnByZXZpb3VzTGluZVRleHQpIDogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uOiBvbkVudGVyUnVsZS5hY3Rpb25cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jldml2ZU9uRW50ZXJSdWxlcyhvbkVudGVyUnVsZXM6IElPbkVudGVyUnVsZUR0b1tdKTogT25FbnRlclJ1bGVbXSB7XG5cdFx0cmV0dXJuIG9uRW50ZXJSdWxlcy5tYXAoTWFpblRocmVhZExhbmd1YWdlRmVhdHVyZXMuX3Jldml2ZU9uRW50ZXJSdWxlKTtcblx0fVxuXG5cdCRzZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24oaGFuZGxlOiBudW1iZXIsIGxhbmd1YWdlSWQ6IHN0cmluZywgX2NvbmZpZ3VyYXRpb246IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25EdG8pOiB2b2lkIHtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb246IExhbmd1YWdlQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdGNvbW1lbnRzOiBfY29uZmlndXJhdGlvbi5jb21tZW50cyxcblx0XHRcdGJyYWNrZXRzOiBfY29uZmlndXJhdGlvbi5icmFja2V0cyxcblx0XHRcdHdvcmRQYXR0ZXJuOiBfY29uZmlndXJhdGlvbi53b3JkUGF0dGVybiA/IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVSZWdFeHAoX2NvbmZpZ3VyYXRpb24ud29yZFBhdHRlcm4pIDogdW5kZWZpbmVkLFxuXHRcdFx0aW5kZW50YXRpb25SdWxlczogX2NvbmZpZ3VyYXRpb24uaW5kZW50YXRpb25SdWxlcyA/IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVJbmRlbnRhdGlvblJ1bGUoX2NvbmZpZ3VyYXRpb24uaW5kZW50YXRpb25SdWxlcykgOiB1bmRlZmluZWQsXG5cdFx0XHRvbkVudGVyUnVsZXM6IF9jb25maWd1cmF0aW9uLm9uRW50ZXJSdWxlcyA/IE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVPbkVudGVyUnVsZXMoX2NvbmZpZ3VyYXRpb24ub25FbnRlclJ1bGVzKSA6IHVuZGVmaW5lZCxcblxuXHRcdFx0YXV0b0Nsb3NpbmdQYWlyczogdW5kZWZpbmVkLFxuXHRcdFx0c3Vycm91bmRpbmdQYWlyczogdW5kZWZpbmVkLFxuXHRcdFx0X19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQ6IHVuZGVmaW5lZFxuXHRcdH07XG5cblx0XHRpZiAoX2NvbmZpZ3VyYXRpb24uYXV0b0Nsb3NpbmdQYWlycykge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5hdXRvQ2xvc2luZ1BhaXJzID0gX2NvbmZpZ3VyYXRpb24uYXV0b0Nsb3NpbmdQYWlycztcblx0XHR9IGVsc2UgaWYgKF9jb25maWd1cmF0aW9uLl9fY2hhcmFjdGVyUGFpclN1cHBvcnQpIHtcblx0XHRcdC8vIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5cdFx0XHRjb25maWd1cmF0aW9uLmF1dG9DbG9zaW5nUGFpcnMgPSBfY29uZmlndXJhdGlvbi5fX2NoYXJhY3RlclBhaXJTdXBwb3J0LmF1dG9DbG9zaW5nUGFpcnM7XG5cdFx0fVxuXG5cdFx0aWYgKF9jb25maWd1cmF0aW9uLl9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0ICYmIF9jb25maWd1cmF0aW9uLl9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0LmRvY0NvbW1lbnQpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uX19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQgPSB7XG5cdFx0XHRcdGRvY0NvbW1lbnQ6IHtcblx0XHRcdFx0XHRvcGVuOiBfY29uZmlndXJhdGlvbi5fX2VsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydC5kb2NDb21tZW50Lm9wZW4sXG5cdFx0XHRcdFx0Y2xvc2U6IF9jb25maWd1cmF0aW9uLl9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0LmRvY0NvbW1lbnQuY2xvc2Vcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2VJZCkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCBjb25maWd1cmF0aW9uLCAxMDApKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gdHlwZSBoaWVyYXJjaHlcblxuXHQkcmVnaXN0ZXJUeXBlSGllcmFyY2h5UHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHNlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdHlwZWguVHlwZUhpZXJhcmNoeVByb3ZpZGVyUmVnaXN0cnkucmVnaXN0ZXIoc2VsZWN0b3IsIHtcblxuXHRcdFx0cHJlcGFyZVR5cGVIaWVyYXJjaHk6IGFzeW5jIChkb2N1bWVudCwgcG9zaXRpb24sIHRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5fcHJveHkuJHByZXBhcmVUeXBlSGllcmFyY2h5KGhhbmRsZSwgZG9jdW1lbnQudXJpLCBwb3NpdGlvbiwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIWl0ZW1zKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZVR5cGVIaWVyYXJjaHkoaGFuZGxlLCBpdGVtLl9zZXNzaW9uSWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cm9vdHM6IGl0ZW1zLm1hcChNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlVHlwZUhpZXJhcmNoeUl0ZW1EdG8pXG5cdFx0XHRcdH07XG5cdFx0XHR9LFxuXG5cdFx0XHRwcm92aWRlU3VwZXJ0eXBlczogYXN5bmMgKGl0ZW0sIHRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN1cGVydHlwZXMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZVR5cGVIaWVyYXJjaHlTdXBlcnR5cGVzKGhhbmRsZSwgaXRlbS5fc2Vzc2lvbklkLCBpdGVtLl9pdGVtSWQsIHRva2VuKTtcblx0XHRcdFx0aWYgKCFzdXBlcnR5cGVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN1cGVydHlwZXM7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN1cGVydHlwZXMubWFwKE1haW5UaHJlYWRMYW5ndWFnZUZlYXR1cmVzLl9yZXZpdmVUeXBlSGllcmFyY2h5SXRlbUR0byk7XG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZVN1YnR5cGVzOiBhc3luYyAoaXRlbSwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgc3VidHlwZXMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZVR5cGVIaWVyYXJjaHlTdWJ0eXBlcyhoYW5kbGUsIGl0ZW0uX3Nlc3Npb25JZCwgaXRlbS5faXRlbUlkLCB0b2tlbik7XG5cdFx0XHRcdGlmICghc3VidHlwZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gc3VidHlwZXM7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHN1YnR5cGVzLm1hcChNYWluVGhyZWFkTGFuZ3VhZ2VGZWF0dXJlcy5fcmV2aXZlVHlwZUhpZXJhcmNoeUl0ZW1EdG8pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cblx0Ly8gLS0tIGRvY3VtZW50IGRyb3AgRWRpdHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudE9uRHJvcEVkaXRQcm92aWRlcnMgPSBuZXcgTWFwPG51bWJlciwgTWFpblRocmVhZERvY3VtZW50T25Ecm9wRWRpdFByb3ZpZGVyPigpO1xuXG5cdCRyZWdpc3RlckRvY3VtZW50T25Ecm9wRWRpdFByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzZWxlY3RvcjogSURvY3VtZW50RmlsdGVyRHRvW10sIG1ldGFkYXRhOiBJRG9jdW1lbnREcm9wRWRpdFByb3ZpZGVyTWV0YWRhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNYWluVGhyZWFkRG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXIoaGFuZGxlLCB0aGlzLl9wcm94eSwgbWV0YWRhdGEsIHRoaXMuX3VyaUlkZW50U2VydmljZSk7XG5cdFx0dGhpcy5fZG9jdW1lbnRPbkRyb3BFZGl0UHJvdmlkZXJzLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblx0XHR0aGlzLl9yZWdpc3RyYXRpb25zLnNldChoYW5kbGUsIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50RHJvcEVkaXRQcm92aWRlci5yZWdpc3RlcihzZWxlY3RvciwgcHJvdmlkZXIpLFxuXHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2RvY3VtZW50T25Ecm9wRWRpdFByb3ZpZGVycy5kZWxldGUoaGFuZGxlKSksXG5cdFx0KSk7XG5cdH1cblxuXHRhc3luYyAkcmVzb2x2ZURvY3VtZW50T25Ecm9wRmlsZURhdGEoaGFuZGxlOiBudW1iZXIsIHJlcXVlc3RJZDogbnVtYmVyLCBkYXRhSWQ6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2RvY3VtZW50T25Ecm9wRWRpdFByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIHByb3ZpZGVyJyk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm92aWRlci5yZXNvbHZlRG9jdW1lbnRPbkRyb3BGaWxlRGF0YShyZXF1ZXN0SWQsIGRhdGFJZCk7XG5cdH1cbn1cblxuY2xhc3MgTWFpblRocmVhZFBhc3RlRWRpdFByb3ZpZGVyIGltcGxlbWVudHMgbGFuZ3VhZ2VzLkRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGF0YVRyYW5zZmVycyA9IG5ldyBEYXRhVHJhbnNmZXJGaWxlQ2FjaGUoKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgY29weU1pbWVUeXBlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHB1YmxpYyByZWFkb25seSBwYXN0ZU1pbWVUeXBlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHB1YmxpYyByZWFkb25seSBwcm92aWRlZFBhc3RlRWRpdEtpbmRzOiByZWFkb25seSBIaWVyYXJjaGljYWxLaW5kW107XG5cblx0cmVhZG9ubHkgcHJlcGFyZURvY3VtZW50UGFzdGU/OiBsYW5ndWFnZXMuRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlclsncHJlcGFyZURvY3VtZW50UGFzdGUnXTtcblx0cmVhZG9ubHkgcHJvdmlkZURvY3VtZW50UGFzdGVFZGl0cz86IGxhbmd1YWdlcy5Eb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyWydwcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzJ107XG5cdHJlYWRvbmx5IHJlc29sdmVEb2N1bWVudFBhc3RlRWRpdD86IGxhbmd1YWdlcy5Eb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyWydyZXNvbHZlRG9jdW1lbnRQYXN0ZUVkaXQnXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXNTaGFwZSxcblx0XHRtZXRhZGF0YTogSVBhc3RlRWRpdFByb3ZpZGVyTWV0YWRhdGFEdG8sXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuY29weU1pbWVUeXBlcyA9IG1ldGFkYXRhLmNvcHlNaW1lVHlwZXMgPz8gW107XG5cdFx0dGhpcy5wYXN0ZU1pbWVUeXBlcyA9IG1ldGFkYXRhLnBhc3RlTWltZVR5cGVzID8/IFtdO1xuXHRcdHRoaXMucHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IG1ldGFkYXRhLnByb3ZpZGVkUGFzdGVFZGl0S2luZHM/Lm1hcChraW5kID0+IG5ldyBIaWVyYXJjaGljYWxLaW5kKGtpbmQpKSA/PyBbXTtcblxuXHRcdGlmIChtZXRhZGF0YS5zdXBwb3J0c0NvcHkpIHtcblx0XHRcdHRoaXMucHJlcGFyZURvY3VtZW50UGFzdGUgPSBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IHJlYWRvbmx5IElSYW5nZVtdLCBkYXRhVHJhbnNmZXI6IElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElSZWFkb25seVZTRGF0YVRyYW5zZmVyIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGFUcmFuc2ZlckR0byA9IGF3YWl0IHR5cGVDb252ZXJ0LkRhdGFUcmFuc2Zlci5mcm9tTGlzdChkYXRhVHJhbnNmZXIpO1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbmV3RGF0YVRyYW5zZmVyID0gYXdhaXQgdGhpcy5fcHJveHkuJHByZXBhcmVEb2N1bWVudFBhc3RlKF9oYW5kbGUsIG1vZGVsLnVyaSwgc2VsZWN0aW9ucywgZGF0YVRyYW5zZmVyRHRvLCB0b2tlbik7XG5cdFx0XHRcdGlmICghbmV3RGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGRhdGFUcmFuc2Zlck91dCA9IG5ldyBWU0RhdGFUcmFuc2ZlcigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFt0eXBlLCBpdGVtXSBvZiBuZXdEYXRhVHJhbnNmZXIuaXRlbXMpIHtcblx0XHRcdFx0XHRkYXRhVHJhbnNmZXJPdXQucmVwbGFjZSh0eXBlLCBjcmVhdGVTdHJpbmdEYXRhVHJhbnNmZXJJdGVtKGl0ZW0uYXNTdHJpbmcsIGl0ZW0uaWQpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZGF0YVRyYW5zZmVyT3V0O1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAobWV0YWRhdGEuc3VwcG9ydHNQYXN0ZSkge1xuXHRcdFx0dGhpcy5wcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzID0gYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgZGF0YVRyYW5zZmVyOiBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgY29udGV4dDogbGFuZ3VhZ2VzLkRvY3VtZW50UGFzdGVDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IHRoaXMuZGF0YVRyYW5zZmVycy5hZGQoZGF0YVRyYW5zZmVyKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBkYXRhVHJhbnNmZXJEdG8gPSBhd2FpdCB0eXBlQ29udmVydC5EYXRhVHJhbnNmZXIuZnJvbUxpc3QoZGF0YVRyYW5zZmVyKTtcblx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBlZGl0cyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlUGFzdGVFZGl0cyh0aGlzLl9oYW5kbGUsIHJlcXVlc3QuaWQsIG1vZGVsLnVyaSwgc2VsZWN0aW9ucywgZGF0YVRyYW5zZmVyRHRvLCB7XG5cdFx0XHRcdFx0XHRvbmx5OiBjb250ZXh0Lm9ubHk/LnZhbHVlLFxuXHRcdFx0XHRcdFx0dHJpZ2dlcktpbmQ6IGNvbnRleHQudHJpZ2dlcktpbmQsXG5cdFx0XHRcdFx0fSwgdG9rZW4pO1xuXHRcdFx0XHRcdGlmICghZWRpdHMpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZWRpdHM6IGVkaXRzLm1hcCgoZWRpdCk6IGxhbmd1YWdlcy5Eb2N1bWVudFBhc3RlRWRpdCA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0Li4uZWRpdCxcblx0XHRcdFx0XHRcdFx0XHRraW5kOiBlZGl0LmtpbmQgPyBuZXcgSGllcmFyY2hpY2FsS2luZChlZGl0LmtpbmQudmFsdWUpIDogbmV3IEhpZXJhcmNoaWNhbEtpbmQoJycpLFxuXHRcdFx0XHRcdFx0XHRcdHlpZWxkVG86IGVkaXQueWllbGRUbz8ubWFwKHggPT4gKHsga2luZDogbmV3IEhpZXJhcmNoaWNhbEtpbmQoeCkgfSkpLFxuXHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxFZGl0OiBlZGl0LmFkZGl0aW9uYWxFZGl0ID8gcmV2aXZlV29ya3NwYWNlRWRpdER0byhlZGl0LmFkZGl0aW9uYWxFZGl0LCB0aGlzLl91cmlJZGVudFNlcnZpY2UsIGRhdGFJZCA9PiB0aGlzLnJlc29sdmVGaWxlRGF0YShyZXF1ZXN0LmlkLCBkYXRhSWQpKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZVBhc3RlRWRpdHModGhpcy5faGFuZGxlLCByZXF1ZXN0LmlkKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRyZXF1ZXN0LmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKG1ldGFkYXRhLnN1cHBvcnRzUmVzb2x2ZSkge1xuXHRcdFx0dGhpcy5yZXNvbHZlRG9jdW1lbnRQYXN0ZUVkaXQgPSBhc3luYyAoZWRpdDogbGFuZ3VhZ2VzLkRvY3VtZW50UGFzdGVFZGl0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9wcm94eS4kcmVzb2x2ZVBhc3RlRWRpdCh0aGlzLl9oYW5kbGUsICg8SVBhc3RlRWRpdER0bz5lZGl0KS5fY2FjaGVJZCEsIHRva2VuKTtcblx0XHRcdFx0aWYgKHR5cGVvZiByZXNvbHZlZC5pbnNlcnRUZXh0ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdGVkaXQuaW5zZXJ0VGV4dCA9IHJlc29sdmVkLmluc2VydFRleHQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocmVzb2x2ZWQuYWRkaXRpb25hbEVkaXQpIHtcblx0XHRcdFx0XHRlZGl0LmFkZGl0aW9uYWxFZGl0ID0gcmV2aXZlV29ya3NwYWNlRWRpdER0byhyZXNvbHZlZC5hZGRpdGlvbmFsRWRpdCwgdGhpcy5fdXJpSWRlbnRTZXJ2aWNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZWRpdDtcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cmVzb2x2ZUZpbGVEYXRhKHJlcXVlc3RJZDogbnVtYmVyLCBkYXRhSWQ6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhVHJhbnNmZXJzLnJlc29sdmVGaWxlRGF0YShyZXF1ZXN0SWQsIGRhdGFJZCk7XG5cdH1cbn1cblxuY2xhc3MgTWFpblRocmVhZERvY3VtZW50T25Ecm9wRWRpdFByb3ZpZGVyIGltcGxlbWVudHMgbGFuZ3VhZ2VzLkRvY3VtZW50RHJvcEVkaXRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkYXRhVHJhbnNmZXJzID0gbmV3IERhdGFUcmFuc2ZlckZpbGVDYWNoZSgpO1xuXG5cdHJlYWRvbmx5IGRyb3BNaW1lVHlwZXM/OiByZWFkb25seSBzdHJpbmdbXTtcblxuXHRyZWFkb25seSBwcm92aWRlZERyb3BFZGl0S2luZHM6IHJlYWRvbmx5IEhpZXJhcmNoaWNhbEtpbmRbXSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSByZXNvbHZlRG9jdW1lbnREcm9wRWRpdD86IGxhbmd1YWdlcy5Eb2N1bWVudERyb3BFZGl0UHJvdmlkZXJbJ3Jlc29sdmVEb2N1bWVudERyb3BFZGl0J107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzU2hhcGUsXG5cdFx0bWV0YWRhdGE6IElEb2N1bWVudERyb3BFZGl0UHJvdmlkZXJNZXRhZGF0YSB8IHVuZGVmaW5lZCxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudFNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5kcm9wTWltZVR5cGVzID0gbWV0YWRhdGE/LmRyb3BNaW1lVHlwZXMgPz8gWycqLyonXTtcblx0XHR0aGlzLnByb3ZpZGVkRHJvcEVkaXRLaW5kcyA9IG1ldGFkYXRhPy5wcm92aWRlZERyb3BLaW5kcz8ubWFwKGtpbmQgPT4gbmV3IEhpZXJhcmNoaWNhbEtpbmQoa2luZCkpO1xuXG5cdFx0aWYgKG1ldGFkYXRhPy5zdXBwb3J0c1Jlc29sdmUpIHtcblx0XHRcdHRoaXMucmVzb2x2ZURvY3VtZW50RHJvcEVkaXQgPSBhc3luYyAoZWRpdCwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9wcm94eS4kcmVzb2x2ZVBhc3RlRWRpdCh0aGlzLl9oYW5kbGUsICg8SURvY3VtZW50RHJvcEVkaXREdG8+ZWRpdCkuX2NhY2hlSWQhLCB0b2tlbik7XG5cdFx0XHRcdGlmIChyZXNvbHZlZC5hZGRpdGlvbmFsRWRpdCkge1xuXHRcdFx0XHRcdGVkaXQuYWRkaXRpb25hbEVkaXQgPSByZXZpdmVXb3Jrc3BhY2VFZGl0RHRvKHJlc29sdmVkLmFkZGl0aW9uYWxFZGl0LCB0aGlzLl91cmlJZGVudFNlcnZpY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlZGl0O1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnREcm9wRWRpdHMobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBJUG9zaXRpb24sIGRhdGFUcmFuc2ZlcjogSVJlYWRvbmx5VlNEYXRhVHJhbnNmZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkRvY3VtZW50RHJvcEVkaXRzU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcXVlc3QgPSB0aGlzLmRhdGFUcmFuc2ZlcnMuYWRkKGRhdGFUcmFuc2Zlcik7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRhdGFUcmFuc2ZlckR0byA9IGF3YWl0IHR5cGVDb252ZXJ0LkRhdGFUcmFuc2Zlci5mcm9tTGlzdChkYXRhVHJhbnNmZXIpO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWRpdHMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZURvY3VtZW50T25Ecm9wRWRpdHModGhpcy5faGFuZGxlLCByZXF1ZXN0LmlkLCBtb2RlbC51cmksIHBvc2l0aW9uLCBkYXRhVHJhbnNmZXJEdG8sIHRva2VuKTtcblx0XHRcdGlmICghZWRpdHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0czogZWRpdHMubWFwKGVkaXQgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHQuLi5lZGl0LFxuXHRcdFx0XHRcdFx0eWllbGRUbzogZWRpdC55aWVsZFRvPy5tYXAoeCA9PiAoeyBraW5kOiBuZXcgSGllcmFyY2hpY2FsS2luZCh4KSB9KSksXG5cdFx0XHRcdFx0XHRraW5kOiBlZGl0LmtpbmQgPyBuZXcgSGllcmFyY2hpY2FsS2luZChlZGl0LmtpbmQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0YWRkaXRpb25hbEVkaXQ6IHJldml2ZVdvcmtzcGFjZUVkaXREdG8oZWRpdC5hZGRpdGlvbmFsRWRpdCwgdGhpcy5fdXJpSWRlbnRTZXJ2aWNlLCBkYXRhSWQgPT4gdGhpcy5yZXNvbHZlRG9jdW1lbnRPbkRyb3BGaWxlRGF0YShyZXF1ZXN0LmlkLCBkYXRhSWQpKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRyZWxlYXNlRG9jdW1lbnRPbkRyb3BFZGl0cyh0aGlzLl9oYW5kbGUsIHJlcXVlc3QuaWQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVxdWVzdC5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlc29sdmVEb2N1bWVudE9uRHJvcEZpbGVEYXRhKHJlcXVlc3RJZDogbnVtYmVyLCBkYXRhSWQ6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhVHJhbnNmZXJzLnJlc29sdmVGaWxlRGF0YShyZXF1ZXN0SWQsIGRhdGFJZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWREb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIgaW1wbGVtZW50cyBsYW5ndWFnZXMuRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXNTaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sZWdlbmQ6IGxhbmd1YWdlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+IHwgdW5kZWZpbmVkLFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyByZWxlYXNlRG9jdW1lbnRTZW1hbnRpY1Rva2VucyhyZXN1bHRJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHJlc3VsdElkKSB7XG5cdFx0XHR0aGlzLl9wcm94eS4kcmVsZWFzZURvY3VtZW50U2VtYW50aWNUb2tlbnModGhpcy5faGFuZGxlLCBwYXJzZUludChyZXN1bHRJZCwgMTApKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGVnZW5kKCk6IGxhbmd1YWdlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xlZ2VuZDtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zKG1vZGVsOiBJVGV4dE1vZGVsLCBsYXN0UmVzdWx0SWQ6IHN0cmluZyB8IG51bGwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLlNlbWFudGljVG9rZW5zIHwgbGFuZ3VhZ2VzLlNlbWFudGljVG9rZW5zRWRpdHMgfCBudWxsPiB7XG5cdFx0Y29uc3Qgbkxhc3RSZXN1bHRJZCA9IGxhc3RSZXN1bHRJZCA/IHBhcnNlSW50KGxhc3RSZXN1bHRJZCwgMTApIDogMDtcblx0XHRjb25zdCBlbmNvZGVkRHRvID0gYXdhaXQgdGhpcy5fcHJveHkuJHByb3ZpZGVEb2N1bWVudFNlbWFudGljVG9rZW5zKHRoaXMuX2hhbmRsZSwgbW9kZWwudXJpLCBuTGFzdFJlc3VsdElkLCB0b2tlbik7XG5cdFx0aWYgKCFlbmNvZGVkRHRvKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgZHRvID0gZGVjb2RlU2VtYW50aWNUb2tlbnNEdG8oZW5jb2RlZER0byk7XG5cdFx0aWYgKGR0by50eXBlID09PSAnZnVsbCcpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc3VsdElkOiBTdHJpbmcoZHRvLmlkKSxcblx0XHRcdFx0ZGF0YTogZHRvLmRhdGFcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN1bHRJZDogU3RyaW5nKGR0by5pZCksXG5cdFx0XHRlZGl0czogZHRvLmRlbHRhc1xuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWREb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlciBpbXBsZW1lbnRzIGxhbmd1YWdlcy5Eb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RMYW5ndWFnZUZlYXR1cmVzU2hhcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGFuZGxlOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGVnZW5kOiBsYW5ndWFnZXMuU2VtYW50aWNUb2tlbnNMZWdlbmQsXG5cdFx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGVnZW5kKCk6IGxhbmd1YWdlcy5TZW1hbnRpY1Rva2Vuc0xlZ2VuZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xlZ2VuZDtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBFZGl0b3JSYW5nZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxsYW5ndWFnZXMuU2VtYW50aWNUb2tlbnMgfCBudWxsPiB7XG5cdFx0Y29uc3QgZW5jb2RlZER0byA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zKHRoaXMuX2hhbmRsZSwgbW9kZWwudXJpLCByYW5nZSwgdG9rZW4pO1xuXHRcdGlmICghZW5jb2RlZER0bykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGR0byA9IGRlY29kZVNlbWFudGljVG9rZW5zRHRvKGVuY29kZWREdG8pO1xuXHRcdGlmIChkdG8udHlwZSA9PT0gJ2Z1bGwnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXN1bHRJZDogU3RyaW5nKGR0by5pZCksXG5cdFx0XHRcdGRhdGE6IGR0by5kYXRhXG5cdFx0XHR9O1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWRgKTtcblx0fVxufVxuXG5jbGFzcyBFeHRlbnNpb25CYWNrZWRJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyPElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zPiB7XG5cdHB1YmxpYyByZWFkb25seSBzZXRNb2RlbElkOiAoKG1vZGVsSWQ6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBfb25EaWRDaGFuZ2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bGFuZ3VhZ2VzLklJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludCB8IHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VJbmxpbmVDb21wbGV0aW9uczogRXZlbnQ8bGFuZ3VhZ2VzLklJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludCB8IHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbEluZm9FbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZU1vZGVsSW5mbzogRXZlbnQ8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IHNldFByb3ZpZGVyT3B0aW9uOiAoKG9wdGlvbklkOiBzdHJpbmcsIHZhbHVlSWQ6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBfb25EaWRQcm92aWRlck9wdGlvbnNDaGFuZ2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFByb3ZpZGVyT3B0aW9uc0NoYW5nZTogRXZlbnQ8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGhhbmRsZTogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBncm91cElkOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVySWQ6IGxhbmd1YWdlcy5Qcm92aWRlcklkLFxuXHRcdHB1YmxpYyByZWFkb25seSB5aWVsZHNUb0dyb3VwSWRzOiBzdHJpbmdbXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXhjbHVkZXNHcm91cElkczogc3RyaW5nW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IGRlYm91bmNlRGVsYXlNczogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyBtb2RlbEluZm86IGxhbmd1YWdlcy5JSW5saW5lQ29tcGxldGlvbk1vZGVsSW5mbyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwb3J0c0hhbmRsZUV2ZW50czogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwb3J0c1NldE1vZGVsSWQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3VwcG9ydHNPbkRpZENoYW5nZTogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwb3J0c09uRGlkQ2hhbmdlTW9kZWxJbmZvOiBib29sZWFuLFxuXHRcdHB1YmxpYyBwcm92aWRlck9wdGlvbnM6IHJlYWRvbmx5IGxhbmd1YWdlcy5JSW5saW5lQ29tcGxldGlvblByb3ZpZGVyT3B0aW9uW10gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3VwcG9ydHNTZXRQcm92aWRlck9wdGlvbjogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwb3J0c09uRGlkQ2hhbmdlUHJvdmlkZXJPcHRpb25zOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdG9yOiBJRG9jdW1lbnRGaWx0ZXJEdG9bXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdExhbmd1YWdlRmVhdHVyZXNTaGFwZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FpRWRpdFRlbGVtZXRyeVNlcnZpY2U6IElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuc2V0TW9kZWxJZCA9IHRoaXMuX3N1cHBvcnRzU2V0TW9kZWxJZCA/IGFzeW5jIChtb2RlbElkOiBzdHJpbmcpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRoYW5kbGVJbmxpbmVDb21wbGV0aW9uU2V0Q3VycmVudE1vZGVsSWQodGhpcy5oYW5kbGUsIG1vZGVsSWQpO1xuXHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLnNldFByb3ZpZGVyT3B0aW9uID0gdGhpcy5fc3VwcG9ydHNTZXRQcm92aWRlck9wdGlvbiA/IGFzeW5jIChvcHRpb25JZDogc3RyaW5nLCB2YWx1ZUlkOiBzdHJpbmcpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRoYW5kbGVJbmxpbmVDb21wbGV0aW9uU2V0UHJvdmlkZXJPcHRpb24odGhpcy5oYW5kbGUsIG9wdGlvbklkLCB2YWx1ZUlkKTtcblx0XHR9IDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5vbkRpZENoYW5nZUlubGluZUNvbXBsZXRpb25zID0gdGhpcy5fc3VwcG9ydHNPbkRpZENoYW5nZSA/IHRoaXMuX29uRGlkQ2hhbmdlRW1pdHRlci5ldmVudCA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlTW9kZWxJbmZvID0gdGhpcy5fc3VwcG9ydHNPbkRpZENoYW5nZU1vZGVsSW5mbyA/IHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxJbmZvRW1pdHRlci5ldmVudCA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLm9uRGlkUHJvdmlkZXJPcHRpb25zQ2hhbmdlID0gdGhpcy5fc3VwcG9ydHNPbkRpZENoYW5nZVByb3ZpZGVyT3B0aW9ucyA/IHRoaXMuX29uRGlkUHJvdmlkZXJPcHRpb25zQ2hhbmdlRW1pdHRlci5ldmVudCA6IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIucmVnaXN0ZXIodGhpcy5fc2VsZWN0b3IsIHRoaXMpKTtcblx0fVxuXG5cdHB1YmxpYyBfc2V0TW9kZWxJbmZvKG5ld01vZGVsSW5mbzogbGFuZ3VhZ2VzLklJbmxpbmVDb21wbGV0aW9uTW9kZWxJbmZvIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5tb2RlbEluZm8gPSBuZXdNb2RlbEluZm87XG5cdFx0aWYgKHRoaXMuX3N1cHBvcnRzT25EaWRDaGFuZ2VNb2RlbEluZm8pIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxJbmZvRW1pdHRlci5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIF9zZXRQcm92aWRlck9wdGlvbnMobmV3UHJvdmlkZXJPcHRpb25zOiByZWFkb25seSBsYW5ndWFnZXMuSUlubGluZUNvbXBsZXRpb25Qcm92aWRlck9wdGlvbltdIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5wcm92aWRlck9wdGlvbnMgPSBuZXdQcm92aWRlck9wdGlvbnM7XG5cdFx0aWYgKHRoaXMuX3N1cHBvcnRzT25EaWRDaGFuZ2VQcm92aWRlck9wdGlvbnMpIHtcblx0XHRcdHRoaXMuX29uRGlkUHJvdmlkZXJPcHRpb25zQ2hhbmdlRW1pdHRlci5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIF9lbWl0RGlkQ2hhbmdlKGNoYW5nZUhpbnQ6IElJbmxpbmVDb21wbGV0aW9uQ2hhbmdlSGludER0byB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9zdXBwb3J0c09uRGlkQ2hhbmdlKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVtaXR0ZXIuZmlyZShjaGFuZ2VIaW50KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcHJvdmlkZUlubGluZUNvbXBsZXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogRWRpdG9yUG9zaXRpb24sIGNvbnRleHQ6IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9ucyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlSW5saW5lQ29tcGxldGlvbnModGhpcy5oYW5kbGUsIG1vZGVsLnVyaSwgcG9zaXRpb24sIGNvbnRleHQsIHRva2VuKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGhhbmRsZUl0ZW1EaWRTaG93KGNvbXBsZXRpb25zOiBJZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9ucywgaXRlbTogSWRlbnRpZmlhYmxlSW5saW5lQ29tcGxldGlvbiwgdXBkYXRlZEluc2VydFRleHQ6IHN0cmluZywgZWRpdERlbHRhSW5mbzogRWRpdERlbHRhSW5mbyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpdGVtLnN1Z2dlc3Rpb25JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpdGVtLnN1Z2dlc3Rpb25JZCA9IHRoaXMuX2FpRWRpdFRlbGVtZXRyeVNlcnZpY2UuY3JlYXRlU3VnZ2VzdGlvbklkKHtcblx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZmVhdHVyZTogJ2lubGluZVN1Z2dlc3Rpb24nLFxuXHRcdFx0XHRzb3VyY2U6IHRoaXMucHJvdmlkZXJJZCxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogY29tcGxldGlvbnMubGFuZ3VhZ2VJZCxcblx0XHRcdFx0ZWRpdERlbHRhSW5mbzogZWRpdERlbHRhSW5mbyxcblx0XHRcdFx0bW9kZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJlc2VudGF0aW9uOiBpdGVtLmlzSW5saW5lRWRpdCA/ICduZXh0RWRpdFN1Z2dlc3Rpb24nIDogJ2lubGluZUNvbXBsZXRpb24nLFxuXHRcdFx0XHRzb3VyY2VSZXF1ZXN0SWQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdXBwb3J0c0hhbmRsZUV2ZW50cykge1xuXHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuJGhhbmRsZUlubGluZUNvbXBsZXRpb25EaWRTaG93KHRoaXMuaGFuZGxlLCBjb21wbGV0aW9ucy5waWQsIGl0ZW0uaWR4LCB1cGRhdGVkSW5zZXJ0VGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGhhbmRsZVBhcnRpYWxBY2NlcHQoY29tcGxldGlvbnM6IElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zLCBpdGVtOiBJZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9uLCBhY2NlcHRlZENoYXJhY3RlcnM6IG51bWJlciwgaW5mbzogbGFuZ3VhZ2VzLlBhcnRpYWxBY2NlcHRJbmZvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N1cHBvcnRzSGFuZGxlRXZlbnRzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kaGFuZGxlSW5saW5lQ29tcGxldGlvblBhcnRpYWxBY2NlcHQodGhpcy5oYW5kbGUsIGNvbXBsZXRpb25zLnBpZCwgaXRlbS5pZHgsIGFjY2VwdGVkQ2hhcmFjdGVycywgaW5mbyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGhhbmRsZUVuZE9mTGlmZXRpbWUoY29tcGxldGlvbnM6IElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zLCBpdGVtOiBJZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9uLCByZWFzb246IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uPElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb24+LCBsaWZldGltZVN1bW1hcnk6IGxhbmd1YWdlcy5MaWZldGltZVN1bW1hcnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmdW5jdGlvbiBtYXBSZWFzb248VDEsIFQyPihyZWFzb246IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uPFQxPiwgZjogKHJlYXNvbjogVDEpID0+IFQyKTogbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb248VDI+IHtcblx0XHRcdGlmIChyZWFzb24ua2luZCA9PT0gbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLklnbm9yZWQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5yZWFzb24sXG5cdFx0XHRcdFx0c3VwZXJzZWRlZEJ5OiByZWFzb24uc3VwZXJzZWRlZEJ5ID8gZihyZWFzb24uc3VwZXJzZWRlZEJ5KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZWFzb247XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N1cHBvcnRzSGFuZGxlRXZlbnRzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kaGFuZGxlSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZXRpbWUodGhpcy5oYW5kbGUsIGNvbXBsZXRpb25zLnBpZCwgaXRlbS5pZHgsIG1hcFJlYXNvbihyZWFzb24sIGkgPT4gKHsgcGlkOiBpLnBpZCwgaWR4OiBpLmlkeCB9KSkpO1xuXHRcdH1cblxuXHRcdGlmIChyZWFzb24ua2luZCA9PT0gbGFuZ3VhZ2VzLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLkFjY2VwdGVkKSB7XG5cdFx0XHRpZiAoaXRlbS5zdWdnZXN0aW9uSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmhhbmRsZUNvZGVBY2NlcHRlZCh7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbklkOiBpdGVtLnN1Z2dlc3Rpb25JZCxcblx0XHRcdFx0XHRmZWF0dXJlOiAnaW5saW5lU3VnZ2VzdGlvbicsXG5cdFx0XHRcdFx0c291cmNlOiB0aGlzLnByb3ZpZGVySWQsXG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZDogY29tcGxldGlvbnMubGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRlZGl0RGVsdGFJbmZvOiBFZGl0RGVsdGFJbmZvLnRyeUNyZWF0ZShcblx0XHRcdFx0XHRcdGxpZmV0aW1lU3VtbWFyeS5saW5lQ291bnRNb2RpZmllZCxcblx0XHRcdFx0XHRcdGxpZmV0aW1lU3VtbWFyeS5saW5lQ291bnRPcmlnaW5hbCxcblx0XHRcdFx0XHRcdGxpZmV0aW1lU3VtbWFyeS5jaGFyYWN0ZXJDb3VudE1vZGlmaWVkLFxuXHRcdFx0XHRcdFx0bGlmZXRpbWVTdW1tYXJ5LmNoYXJhY3RlckNvdW50T3JpZ2luYWwsXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRtb2RlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cHJlc2VudGF0aW9uOiBpdGVtLmlzSW5saW5lRWRpdCA/ICduZXh0RWRpdFN1Z2dlc3Rpb24nIDogJ2lubGluZUNvbXBsZXRpb24nLFxuXHRcdFx0XHRcdGFjY2VwdGFuY2VNZXRob2Q6ICdhY2NlcHQnLFxuXHRcdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlUmVxdWVzdElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocmVhc29uLmtpbmQgPT09IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5SZWplY3RlZCkge1xuXHRcdFx0aWYgKGl0ZW0uc3VnZ2VzdGlvbklkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fYWlFZGl0VGVsZW1ldHJ5U2VydmljZS5oYW5kbGVDb2RlUmVqZWN0ZWQoe1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25JZDogaXRlbS5zdWdnZXN0aW9uSWQsXG5cdFx0XHRcdFx0ZmVhdHVyZTogJ2lubGluZVN1Z2dlc3Rpb24nLFxuXHRcdFx0XHRcdHNvdXJjZTogdGhpcy5wcm92aWRlcklkLFxuXHRcdFx0XHRcdGxhbmd1YWdlSWQ6IGNvbXBsZXRpb25zLmxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0ZWRpdERlbHRhSW5mbzogRWRpdERlbHRhSW5mby50cnlDcmVhdGUoXG5cdFx0XHRcdFx0XHRsaWZldGltZVN1bW1hcnkubGluZUNvdW50TW9kaWZpZWQsXG5cdFx0XHRcdFx0XHRsaWZldGltZVN1bW1hcnkubGluZUNvdW50T3JpZ2luYWwsXG5cdFx0XHRcdFx0XHRsaWZldGltZVN1bW1hcnkuY2hhcmFjdGVyQ291bnRNb2RpZmllZCxcblx0XHRcdFx0XHRcdGxpZmV0aW1lU3VtbWFyeS5jaGFyYWN0ZXJDb3VudE9yaWdpbmFsLFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0bW9kZUlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjogaXRlbS5pc0lubGluZUVkaXQgPyAnbmV4dEVkaXRTdWdnZXN0aW9uJyA6ICdpbmxpbmVDb21wbGV0aW9uJyxcblx0XHRcdFx0XHRyZWplY3Rpb25NZXRob2Q6ICdyZWplY3QnLFxuXHRcdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlUmVxdWVzdElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGVuZE9mTGlmZVN1bW1hcnk6IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVFdmVudCA9IHtcblx0XHRcdG9wcG9ydHVuaXR5SWQ6IGxpZmV0aW1lU3VtbWFyeS5yZXF1ZXN0VXVpZCxcblx0XHRcdGNvcnJlbGF0aW9uSWQ6IGxpZmV0aW1lU3VtbWFyeS5jb3JyZWxhdGlvbklkLFxuXHRcdFx0c2hvd246IGxpZmV0aW1lU3VtbWFyeS5zaG93bixcblx0XHRcdHNob3duRHVyYXRpb246IGxpZmV0aW1lU3VtbWFyeS5zaG93bkR1cmF0aW9uLFxuXHRcdFx0c2hvd25EdXJhdGlvblVuY29sbGFwc2VkOiBsaWZldGltZVN1bW1hcnkuc2hvd25EdXJhdGlvblVuY29sbGFwc2VkLFxuXHRcdFx0dGltZVVudGlsU2hvd246IGxpZmV0aW1lU3VtbWFyeS50aW1lVW50aWxTaG93bixcblx0XHRcdHRpbWVVbnRpbFByb3ZpZGVyUmVxdWVzdDogbGlmZXRpbWVTdW1tYXJ5LnRpbWVVbnRpbFByb3ZpZGVyUmVxdWVzdCxcblx0XHRcdHRpbWVVbnRpbFByb3ZpZGVyUmVzcG9uc2U6IGxpZmV0aW1lU3VtbWFyeS50aW1lVW50aWxQcm92aWRlclJlc3BvbnNlLFxuXHRcdFx0ZWRpdG9yVHlwZTogbGlmZXRpbWVTdW1tYXJ5LmVkaXRvclR5cGUsXG5cdFx0XHR2aWV3S2luZDogbGlmZXRpbWVTdW1tYXJ5LnZpZXdLaW5kLFxuXHRcdFx0cHJlY2VlZGVkOiBsaWZldGltZVN1bW1hcnkucHJlY2VlZGVkLFxuXHRcdFx0cmVxdWVzdFJlYXNvbjogbGlmZXRpbWVTdW1tYXJ5LnJlcXVlc3RSZWFzb24sXG5cdFx0XHR0eXBpbmdJbnRlcnZhbDogbGlmZXRpbWVTdW1tYXJ5LnR5cGluZ0ludGVydmFsLFxuXHRcdFx0dHlwaW5nSW50ZXJ2YWxDaGFyYWN0ZXJDb3VudDogbGlmZXRpbWVTdW1tYXJ5LnR5cGluZ0ludGVydmFsQ2hhcmFjdGVyQ291bnQsXG5cdFx0XHRsYW5ndWFnZUlkOiBsaWZldGltZVN1bW1hcnkubGFuZ3VhZ2VJZCxcblx0XHRcdGN1cnNvckNvbHVtbkRpc3RhbmNlOiBsaWZldGltZVN1bW1hcnkuY3Vyc29yQ29sdW1uRGlzdGFuY2UsXG5cdFx0XHRjdXJzb3JMaW5lRGlzdGFuY2U6IGxpZmV0aW1lU3VtbWFyeS5jdXJzb3JMaW5lRGlzdGFuY2UsXG5cdFx0XHRsaW5lQ291bnRPcmlnaW5hbDogbGlmZXRpbWVTdW1tYXJ5LmxpbmVDb3VudE9yaWdpbmFsLFxuXHRcdFx0bGluZUNvdW50TW9kaWZpZWQ6IGxpZmV0aW1lU3VtbWFyeS5saW5lQ291bnRNb2RpZmllZCxcblx0XHRcdGNoYXJhY3RlckNvdW50T3JpZ2luYWw6IGxpZmV0aW1lU3VtbWFyeS5jaGFyYWN0ZXJDb3VudE9yaWdpbmFsLFxuXHRcdFx0Y2hhcmFjdGVyQ291bnRNb2RpZmllZDogbGlmZXRpbWVTdW1tYXJ5LmNoYXJhY3RlckNvdW50TW9kaWZpZWQsXG5cdFx0XHRkaXNqb2ludFJlcGxhY2VtZW50czogbGlmZXRpbWVTdW1tYXJ5LmRpc2pvaW50UmVwbGFjZW1lbnRzLFxuXHRcdFx0c2FtZVNoYXBlUmVwbGFjZW1lbnRzOiBsaWZldGltZVN1bW1hcnkuc2FtZVNoYXBlUmVwbGFjZW1lbnRzLFxuXHRcdFx0c2VsZWN0ZWRTdWdnZXN0aW9uSW5mbzogbGlmZXRpbWVTdW1tYXJ5LnNlbGVjdGVkU3VnZ2VzdGlvbkluZm8sXG5cdFx0XHRleHRlbnNpb25JZDogdGhpcy5wcm92aWRlcklkLmV4dGVuc2lvbklkISxcblx0XHRcdGV4dGVuc2lvblZlcnNpb246IHRoaXMucHJvdmlkZXJJZC5leHRlbnNpb25WZXJzaW9uISxcblx0XHRcdGdyb3VwSWQ6IGV4dHJhY3RFbmdpbmVGcm9tQ29ycmVsYXRpb25JZChsaWZldGltZVN1bW1hcnkuY29ycmVsYXRpb25JZCkgPz8gdGhpcy5ncm91cElkLFxuXHRcdFx0c2t1UGxhbjogbGlmZXRpbWVTdW1tYXJ5LnNrdVBsYW4sXG5cdFx0XHRza3VUeXBlOiBsaWZldGltZVN1bW1hcnkuc2t1VHlwZSxcblx0XHRcdHBlcmZvcm1hbmNlTWFya2VyczogbGlmZXRpbWVTdW1tYXJ5LnBlcmZvcm1hbmNlTWFya2Vycyxcblx0XHRcdGF2YWlsYWJsZVByb3ZpZGVyczogbGlmZXRpbWVTdW1tYXJ5LmF2YWlsYWJsZVByb3ZpZGVycyxcblx0XHRcdHBhcnRpYWxseUFjY2VwdGVkOiBsaWZldGltZVN1bW1hcnkucGFydGlhbGx5QWNjZXB0ZWQsXG5cdFx0XHRwYXJ0aWFsbHlBY2NlcHRlZENvdW50U2luY2VPcmlnaW5hbDogbGlmZXRpbWVTdW1tYXJ5LnBhcnRpYWxseUFjY2VwdGVkQ291bnRTaW5jZU9yaWdpbmFsLFxuXHRcdFx0cGFydGlhbGx5QWNjZXB0ZWRSYXRpb1NpbmNlT3JpZ2luYWw6IGxpZmV0aW1lU3VtbWFyeS5wYXJ0aWFsbHlBY2NlcHRlZFJhdGlvU2luY2VPcmlnaW5hbCxcblx0XHRcdHBhcnRpYWxseUFjY2VwdGVkQ2hhcmFjdGVyc1NpbmNlT3JpZ2luYWw6IGxpZmV0aW1lU3VtbWFyeS5wYXJ0aWFsbHlBY2NlcHRlZENoYXJhY3RlcnNTaW5jZU9yaWdpbmFsLFxuXHRcdFx0c3VwZXJzZWRlZDogcmVhc29uLmtpbmQgPT09IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLklnbm9yZWQgJiYgISFyZWFzb24uc3VwZXJzZWRlZEJ5LFxuXHRcdFx0cmVhc29uOiByZWFzb24ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuQWNjZXB0ZWQgPyAnYWNjZXB0ZWQnXG5cdFx0XHRcdDogcmVhc29uLmtpbmQgPT09IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLlJlamVjdGVkID8gJ3JlamVjdGVkJ1xuXHRcdFx0XHRcdDogcmVhc29uLmtpbmQgPT09IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLklnbm9yZWQgPyAnaWdub3JlZCcgOiB1bmRlZmluZWQsXG5cdFx0XHRhY2NlcHRlZEFsdGVybmF0aXZlQWN0aW9uOiByZWFzb24ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuQWNjZXB0ZWQgJiYgcmVhc29uLmFsdGVybmF0aXZlQWN0aW9uLFxuXHRcdFx0bm9TdWdnZXN0aW9uUmVhc29uOiB1bmRlZmluZWQsXG5cdFx0XHRub3RTaG93blJlYXNvbjogbGlmZXRpbWVTdW1tYXJ5Lm5vdFNob3duUmVhc29uLFxuXHRcdFx0cmVuYW1lQ3JlYXRlZDogbGlmZXRpbWVTdW1tYXJ5LnJlbmFtZUNyZWF0ZWQsXG5cdFx0XHRyZW5hbWVEdXJhdGlvbjogbGlmZXRpbWVTdW1tYXJ5LnJlbmFtZUR1cmF0aW9uLFxuXHRcdFx0cmVuYW1lVGltZWRPdXQ6IGxpZmV0aW1lU3VtbWFyeS5yZW5hbWVUaW1lZE91dCxcblx0XHRcdHJlbmFtZURyb3BwZWRPdGhlckVkaXRzOiBsaWZldGltZVN1bW1hcnkucmVuYW1lRHJvcHBlZE90aGVyRWRpdHMsXG5cdFx0XHRyZW5hbWVEcm9wcGVkUmVuYW1lRWRpdHM6IGxpZmV0aW1lU3VtbWFyeS5yZW5hbWVEcm9wcGVkUmVuYW1lRWRpdHMsXG5cdFx0XHRlZGl0S2luZDogbGlmZXRpbWVTdW1tYXJ5LmVkaXRLaW5kLFxuXHRcdFx0bG9uZ0Rpc3RhbmNlSGludFZpc2libGU6IGxpZmV0aW1lU3VtbWFyeS5sb25nRGlzdGFuY2VIaW50VmlzaWJsZSxcblx0XHRcdGxvbmdEaXN0YW5jZUhpbnREaXN0YW5jZTogbGlmZXRpbWVTdW1tYXJ5LmxvbmdEaXN0YW5jZUhpbnREaXN0YW5jZSxcblx0XHRcdGlzRm9yQW5vdGhlckRvY3VtZW50OiBsaWZldGltZVN1bW1hcnkuaXNGb3JBbm90aGVyRG9jdW1lbnQsXG5cdFx0XHQuLi5mb3J3YXJkVG9DaGFubmVsSWYoaXNDb3BpbG90TGlrZUV4dGVuc2lvbih0aGlzLnByb3ZpZGVySWQuZXh0ZW5zaW9uSWQhKSksXG5cdFx0fTtcblxuXHRcdGNvbnN0IGRhdGFDaGFubmVsRm9yd2FyZGluZ1RlbGVtZXRyeVNlcnZpY2UgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEYXRhQ2hhbm5lbEZvcndhcmRpbmdUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRzZW5kSW5saW5lQ29tcGxldGlvbnNFbmRPZkxpZmVUZWxlbWV0cnkoZGF0YUNoYW5uZWxGb3J3YXJkaW5nVGVsZW1ldHJ5U2VydmljZSwgZW5kT2ZMaWZlU3VtbWFyeSk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZUlubGluZUNvbXBsZXRpb25zKGNvbXBsZXRpb25zOiBJZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9ucywgcmVhc29uOiBsYW5ndWFnZXMuSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJveHkuJGZyZWVJbmxpbmVDb21wbGV0aW9uc0xpc3QodGhpcy5oYW5kbGUsIGNvbXBsZXRpb25zLnBpZCwgcmVhc29uKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBoYW5kbGVSZWplY3Rpb24oY29tcGxldGlvbnM6IElkZW50aWZpYWJsZUlubGluZUNvbXBsZXRpb25zLCBpdGVtOiBJZGVudGlmaWFibGVJbmxpbmVDb21wbGV0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N1cHBvcnRzSGFuZGxlRXZlbnRzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kaGFuZGxlSW5saW5lQ29tcGxldGlvblJlamVjdGlvbih0aGlzLmhhbmRsZSwgY29tcGxldGlvbnMucGlkLCBpdGVtLmlkeCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKSB7XG5cdFx0cmV0dXJuIGBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKCR7dGhpcy5wcm92aWRlcklkLnRvU3RyaW5nKCl9KWA7XG5cdH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdEVuZ2luZUZyb21Db3JyZWxhdGlvbklkKGNvcnJlbGF0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghY29ycmVsYXRpb25JZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGNvcnJlbGF0aW9uSWQpO1xuXHRcdGlmICh0eXBlb2YgcGFyc2VkID09PSAnb2JqZWN0JyAmJiBwYXJzZWQgIT09IG51bGwgJiYgdHlwZW9mIHBhcnNlZC5lbmdpbmUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VkLmVuZ2luZTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLDhCQUF1RCxzQkFBc0I7QUFDdEYsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQixZQUFZLGVBQWUsb0JBQW9CO0FBQzVFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBSXBCLFlBQVksZUFBZTtBQUMzQixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFDQUFxQztBQUU5QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDhCQUE4QjtBQUN2QyxZQUFZLGlCQUFpQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxZQUFZLFdBQVc7QUFDdkIsWUFBWSxZQUFZO0FBQ3hCLFlBQVksV0FBVztBQUN2QixTQUFTLDRCQUE2QztBQUN0RCxTQUFTLGdCQUFtbkIsc0JBQXNCLHdCQUFvRSxtQkFBb0Q7QUFDMXdCLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUNBQXVDLG9CQUFvQiw4QkFBOEI7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RCxxQ0FBcUMsZ0JBQWdCO0FBQUEsTUFDckQsMENBQTBDLGdCQUFnQjtBQUFBLE1BQzFELFlBQVksT0FBTyxTQUFTLG9DQUFvQyxXQUFXLENBQUMsQ0FBQyxPQUFPO0FBQUEsTUFDcEYsUUFBUSxPQUFPLFNBQVMsb0NBQW9DLFdBQVcsYUFDcEUsT0FBTyxTQUFTLG9DQUFvQyxXQUFXLGFBQzlELE9BQU8sU0FBUyxvQ0FBb0MsVUFBVSxZQUFZO0FBQUEsTUFDOUUsMkJBQTJCLE9BQU8sU0FBUyxvQ0FBb0MsWUFBWSxPQUFPO0FBQUEsTUFDbEcsb0JBQW9CO0FBQUEsTUFDcEIsZ0JBQWdCLGdCQUFnQjtBQUFBLE1BQ2hDLGVBQWUsZ0JBQWdCO0FBQUEsTUFDL0IsZ0JBQWdCLGdCQUFnQjtBQUFBLE1BQ2hDLGdCQUFnQixnQkFBZ0I7QUFBQSxNQUNoQyx5QkFBeUIsZ0JBQWdCO0FBQUEsTUFDekMsMEJBQTBCLGdCQUFnQjtBQUFBLE1BQzFDLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUIseUJBQXlCLGdCQUFnQjtBQUFBLE1BQ3pDLDBCQUEwQixnQkFBZ0I7QUFBQSxNQUMxQyxzQkFBc0IsZ0JBQWdCO0FBQUEsTUFDdEMsR0FBRyxtQkFBbUIsdUJBQXVCLEtBQUssV0FBVyxXQUFZLENBQUM7QUFBQSxJQUMzRTtBQUVBLFVBQU0sd0NBQXdDLEtBQUssc0JBQXNCLGVBQWUscUNBQXFDO0FBQzdILDRDQUF3Qyx1Q0FBdUMsZ0JBQWdCO0FBQUEsRUFDaEc7QUFBQSxFQUVPLHlCQUF5QixhQUE0QyxRQUF3RDtBQUNuSSxTQUFLLE9BQU8sMkJBQTJCLEtBQUssUUFBUSxZQUFZLEtBQUssTUFBTTtBQUFBLEVBQzVFO0FBQUEsRUFFQSxNQUFhLGdCQUFnQixhQUE0QyxNQUFtRDtBQUMzSCxRQUFJLEtBQUssdUJBQXVCO0FBQy9CLFlBQU0sS0FBSyxPQUFPLGlDQUFpQyxLQUFLLFFBQVEsWUFBWSxLQUFLLEtBQUssR0FBRztBQUFBLElBQzFGO0FBQUEsRUFDRDtBQUFBLEVBRVMsV0FBVztBQUNuQixXQUFPLDZCQUE2QixLQUFLLFdBQVcsU0FBUyxDQUFDO0FBQUEsRUFDL0Q7QUFDRDtBQXpPTSwyQ0FBTjtBQUFBLEVBOEJHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWhDRztBQTJPTixTQUFTLCtCQUErQixlQUF1RDtBQUM5RixNQUFJLENBQUMsZUFBZTtBQUNuQixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUk7QUFDSCxVQUFNLFNBQVMsS0FBSyxNQUFNLGFBQWE7QUFDdkMsUUFBSSxPQUFPLFdBQVcsWUFBWSxXQUFXLFFBQVEsT0FBTyxPQUFPLFdBQVcsVUFBVTtBQUN2RixhQUFPLE9BQU87QUFBQSxJQUNmO0FBQ0EsV0FBTztBQUFBLEVBQ1IsUUFBUTtBQUNQLFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbIm1vZGVsIiwgInNlYXJjaCIsICJyZWFzb24iXQp9Cg==
