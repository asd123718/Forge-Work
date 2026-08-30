import { Color } from "../../../base/common/color.js";
import { Range } from "../../common/core/range.js";
import { MetadataConsts } from "../../common/encodedTokenAttributes.js";
import * as languages from "../../common/languages.js";
import { ILanguageService } from "../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../common/languages/languageConfigurationRegistry.js";
import { ModesRegistry } from "../../common/languages/modesRegistry.js";
import { ILanguageFeaturesService } from "../../common/services/languageFeatures.js";
import * as standaloneEnums from "../../common/standalone/standaloneEnums.js";
import { StandaloneServices } from "./standaloneServices.js";
import { compile } from "../common/monarch/monarchCompile.js";
import { MonarchTokenizer } from "../common/monarch/monarchLexer.js";
import { IStandaloneThemeService } from "../common/standaloneTheme.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { EditDeltaInfo } from "../../common/textModelEditSource.js";
function register(language) {
  ModesRegistry.registerLanguage(language);
}
function getLanguages() {
  let result = [];
  result = result.concat(ModesRegistry.getLanguages());
  return result;
}
function getEncodedLanguageId(languageId) {
  const languageService = StandaloneServices.get(ILanguageService);
  return languageService.languageIdCodec.encodeLanguageId(languageId);
}
function onLanguage(languageId, callback) {
  return StandaloneServices.withServices(() => {
    const languageService = StandaloneServices.get(ILanguageService);
    const disposable = languageService.onDidRequestRichLanguageFeatures((encounteredLanguageId) => {
      if (encounteredLanguageId === languageId) {
        disposable.dispose();
        callback();
      }
    });
    return disposable;
  });
}
function onLanguageEncountered(languageId, callback) {
  return StandaloneServices.withServices(() => {
    const languageService = StandaloneServices.get(ILanguageService);
    const disposable = languageService.onDidRequestBasicLanguageFeatures((encounteredLanguageId) => {
      if (encounteredLanguageId === languageId) {
        disposable.dispose();
        callback();
      }
    });
    return disposable;
  });
}
function setLanguageConfiguration(languageId, configuration) {
  const languageService = StandaloneServices.get(ILanguageService);
  if (!languageService.isRegisteredLanguageId(languageId)) {
    throw new Error(`Cannot set configuration for unknown language ${languageId}`);
  }
  const languageConfigurationService = StandaloneServices.get(ILanguageConfigurationService);
  return languageConfigurationService.register(languageId, configuration, 100);
}
class EncodedTokenizationSupportAdapter {
  constructor(languageId, actual) {
    this._languageId = languageId;
    this._actual = actual;
  }
  dispose() {
  }
  getInitialState() {
    return this._actual.getInitialState();
  }
  tokenize(line, hasEOL, state) {
    if (typeof this._actual.tokenize === "function") {
      return TokenizationSupportAdapter.adaptTokenize(this._languageId, this._actual, line, state);
    }
    throw new Error("Not supported!");
  }
  tokenizeEncoded(line, hasEOL, state) {
    const result = this._actual.tokenizeEncoded(line, state);
    return new languages.EncodedTokenizationResult(result.tokens, [], result.endState);
  }
}
class TokenizationSupportAdapter {
  constructor(_languageId, _actual, _languageService, _standaloneThemeService) {
    this._languageId = _languageId;
    this._actual = _actual;
    this._languageService = _languageService;
    this._standaloneThemeService = _standaloneThemeService;
  }
  dispose() {
  }
  getInitialState() {
    return this._actual.getInitialState();
  }
  static _toClassicTokens(tokens, language) {
    const result = [];
    let previousStartIndex = 0;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const t = tokens[i];
      let startIndex = t.startIndex;
      if (i === 0) {
        startIndex = 0;
      } else if (startIndex < previousStartIndex) {
        startIndex = previousStartIndex;
      }
      result[i] = new languages.Token(startIndex, t.scopes, language);
      previousStartIndex = startIndex;
    }
    return result;
  }
  static adaptTokenize(language, actual, line, state) {
    const actualResult = actual.tokenize(line, state);
    const tokens = TokenizationSupportAdapter._toClassicTokens(actualResult.tokens, language);
    let endState;
    if (actualResult.endState.equals(state)) {
      endState = state;
    } else {
      endState = actualResult.endState;
    }
    return new languages.TokenizationResult(tokens, endState);
  }
  tokenize(line, hasEOL, state) {
    return TokenizationSupportAdapter.adaptTokenize(this._languageId, this._actual, line, state);
  }
  _toBinaryTokens(languageIdCodec, tokens) {
    const languageId = languageIdCodec.encodeLanguageId(this._languageId);
    const tokenTheme = this._standaloneThemeService.getColorTheme().tokenTheme;
    const result = [];
    let resultLen = 0;
    let previousStartIndex = 0;
    for (let i = 0, len = tokens.length; i < len; i++) {
      const t = tokens[i];
      const metadata = tokenTheme.match(languageId, t.scopes) | MetadataConsts.BALANCED_BRACKETS_MASK;
      if (resultLen > 0 && result[resultLen - 1] === metadata) {
        continue;
      }
      let startIndex = t.startIndex;
      if (i === 0) {
        startIndex = 0;
      } else if (startIndex < previousStartIndex) {
        startIndex = previousStartIndex;
      }
      result[resultLen++] = startIndex;
      result[resultLen++] = metadata;
      previousStartIndex = startIndex;
    }
    const actualResult = new Uint32Array(resultLen);
    for (let i = 0; i < resultLen; i++) {
      actualResult[i] = result[i];
    }
    return actualResult;
  }
  tokenizeEncoded(line, hasEOL, state) {
    const actualResult = this._actual.tokenize(line, state);
    const tokens = this._toBinaryTokens(this._languageService.languageIdCodec, actualResult.tokens);
    let endState;
    if (actualResult.endState.equals(state)) {
      endState = state;
    } else {
      endState = actualResult.endState;
    }
    return new languages.EncodedTokenizationResult(tokens, [], endState);
  }
}
function isATokensProvider(provider) {
  return typeof provider.getInitialState === "function";
}
function isEncodedTokensProvider(provider) {
  return "tokenizeEncoded" in provider;
}
function isThenable(obj) {
  return obj && typeof obj.then === "function";
}
function setColorMap(colorMap) {
  const standaloneThemeService = StandaloneServices.get(IStandaloneThemeService);
  if (colorMap) {
    const result = [null];
    for (let i = 1, len = colorMap.length; i < len; i++) {
      result[i] = Color.fromHex(colorMap[i]);
    }
    standaloneThemeService.setColorMapOverride(result);
  } else {
    standaloneThemeService.setColorMapOverride(null);
  }
}
function createTokenizationSupportAdapter(languageId, provider) {
  if (isEncodedTokensProvider(provider)) {
    return new EncodedTokenizationSupportAdapter(languageId, provider);
  } else {
    return new TokenizationSupportAdapter(
      languageId,
      provider,
      StandaloneServices.get(ILanguageService),
      StandaloneServices.get(IStandaloneThemeService)
    );
  }
}
function registerTokensProviderFactory(languageId, factory) {
  const adaptedFactory = new languages.LazyTokenizationSupport(async () => {
    const result = await Promise.resolve(factory.create());
    if (!result) {
      return null;
    }
    if (isATokensProvider(result)) {
      return createTokenizationSupportAdapter(languageId, result);
    }
    return new MonarchTokenizer(StandaloneServices.get(ILanguageService), StandaloneServices.get(IStandaloneThemeService), languageId, compile(languageId, result), StandaloneServices.get(IConfigurationService));
  });
  return languages.TokenizationRegistry.registerFactory(languageId, adaptedFactory);
}
function setTokensProvider(languageId, provider) {
  const languageService = StandaloneServices.get(ILanguageService);
  if (!languageService.isRegisteredLanguageId(languageId)) {
    throw new Error(`Cannot set tokens provider for unknown language ${languageId}`);
  }
  if (isThenable(provider)) {
    return registerTokensProviderFactory(languageId, { create: () => provider });
  }
  return languages.TokenizationRegistry.register(languageId, createTokenizationSupportAdapter(languageId, provider));
}
function setMonarchTokensProvider(languageId, languageDef) {
  const create = (languageDef2) => {
    return new MonarchTokenizer(StandaloneServices.get(ILanguageService), StandaloneServices.get(IStandaloneThemeService), languageId, compile(languageId, languageDef2), StandaloneServices.get(IConfigurationService));
  };
  if (isThenable(languageDef)) {
    return registerTokensProviderFactory(languageId, { create: () => languageDef });
  }
  return languages.TokenizationRegistry.register(languageId, create(languageDef));
}
function registerReferenceProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.referenceProvider.register(languageSelector, provider);
}
function registerRenameProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.renameProvider.register(languageSelector, provider);
}
function registerNewSymbolNameProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.newSymbolNamesProvider.register(languageSelector, provider);
}
function registerSignatureHelpProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.signatureHelpProvider.register(languageSelector, provider);
}
function registerHoverProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.hoverProvider.register(languageSelector, {
    provideHover: async (model2, position, token, context) => {
      const word = model2.getWordAtPosition(position);
      return Promise.resolve(provider.provideHover(model2, position, token, context)).then((value) => {
        if (!value) {
          return void 0;
        }
        if (!value.range && word) {
          value.range = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
        }
        if (!value.range) {
          value.range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
        }
        return value;
      });
    }
  });
}
function registerDocumentSymbolProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentSymbolProvider.register(languageSelector, provider);
}
function registerDocumentHighlightProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentHighlightProvider.register(languageSelector, provider);
}
function registerLinkedEditingRangeProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.linkedEditingRangeProvider.register(languageSelector, provider);
}
function registerDefinitionProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.definitionProvider.register(languageSelector, provider);
}
function registerImplementationProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.implementationProvider.register(languageSelector, provider);
}
function registerTypeDefinitionProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.typeDefinitionProvider.register(languageSelector, provider);
}
function registerCodeLensProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.codeLensProvider.register(languageSelector, provider);
}
function registerCodeActionProvider(languageSelector, provider, metadata) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.codeActionProvider.register(languageSelector, {
    providedCodeActionKinds: metadata?.providedCodeActionKinds,
    documentation: metadata?.documentation,
    provideCodeActions: (model2, range, context, token) => {
      const markerService = StandaloneServices.get(IMarkerService);
      const markers = markerService.read({ resource: model2.uri }).filter((m) => {
        return Range.areIntersectingOrTouching(m, range);
      });
      return provider.provideCodeActions(model2, range, { markers, only: context.only, trigger: context.trigger }, token);
    },
    resolveCodeAction: provider.resolveCodeAction
  });
}
function registerDocumentFormattingEditProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentFormattingEditProvider.register(languageSelector, provider);
}
function registerDocumentRangeFormattingEditProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentRangeFormattingEditProvider.register(languageSelector, provider);
}
function registerOnTypeFormattingEditProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.onTypeFormattingEditProvider.register(languageSelector, provider);
}
function registerLinkProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.linkProvider.register(languageSelector, provider);
}
function registerCompletionItemProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.completionProvider.register(languageSelector, provider);
}
function registerColorProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.colorProvider.register(languageSelector, provider);
}
function registerFoldingRangeProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.foldingRangeProvider.register(languageSelector, provider);
}
function registerDeclarationProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.declarationProvider.register(languageSelector, provider);
}
function registerSelectionRangeProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.selectionRangeProvider.register(languageSelector, provider);
}
function registerDocumentSemanticTokensProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentSemanticTokensProvider.register(languageSelector, provider);
}
function registerDocumentRangeSemanticTokensProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.documentRangeSemanticTokensProvider.register(languageSelector, provider);
}
function registerInlineCompletionsProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.inlineCompletionsProvider.register(languageSelector, provider);
}
function registerInlayHintsProvider(languageSelector, provider) {
  const languageFeaturesService = StandaloneServices.get(ILanguageFeaturesService);
  return languageFeaturesService.inlayHintsProvider.register(languageSelector, provider);
}
function createMonacoLanguagesAPI() {
  return {
    // eslint-disable-next-line local/code-no-any-casts
    register,
    // eslint-disable-next-line local/code-no-any-casts
    getLanguages,
    // eslint-disable-next-line local/code-no-any-casts
    onLanguage,
    // eslint-disable-next-line local/code-no-any-casts
    onLanguageEncountered,
    // eslint-disable-next-line local/code-no-any-casts
    getEncodedLanguageId,
    // provider methods
    // eslint-disable-next-line local/code-no-any-casts
    setLanguageConfiguration,
    setColorMap,
    // eslint-disable-next-line local/code-no-any-casts
    registerTokensProviderFactory,
    // eslint-disable-next-line local/code-no-any-casts
    setTokensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    setMonarchTokensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerReferenceProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerRenameProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerNewSymbolNameProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerCompletionItemProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerSignatureHelpProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerHoverProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentSymbolProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentHighlightProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerLinkedEditingRangeProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDefinitionProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerImplementationProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerTypeDefinitionProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerCodeLensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerCodeActionProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentFormattingEditProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentRangeFormattingEditProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerOnTypeFormattingEditProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerLinkProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerColorProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerFoldingRangeProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDeclarationProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerSelectionRangeProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentSemanticTokensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerDocumentRangeSemanticTokensProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerInlineCompletionsProvider,
    // eslint-disable-next-line local/code-no-any-casts
    registerInlayHintsProvider,
    // enums
    DocumentHighlightKind: standaloneEnums.DocumentHighlightKind,
    CompletionItemKind: standaloneEnums.CompletionItemKind,
    CompletionItemTag: standaloneEnums.CompletionItemTag,
    CompletionItemInsertTextRule: standaloneEnums.CompletionItemInsertTextRule,
    SymbolKind: standaloneEnums.SymbolKind,
    SymbolTag: standaloneEnums.SymbolTag,
    IndentAction: standaloneEnums.IndentAction,
    CompletionTriggerKind: standaloneEnums.CompletionTriggerKind,
    SignatureHelpTriggerKind: standaloneEnums.SignatureHelpTriggerKind,
    InlayHintKind: standaloneEnums.InlayHintKind,
    InlineCompletionTriggerKind: standaloneEnums.InlineCompletionTriggerKind,
    CodeActionTriggerType: standaloneEnums.CodeActionTriggerType,
    NewSymbolNameTag: standaloneEnums.NewSymbolNameTag,
    NewSymbolNameTriggerKind: standaloneEnums.NewSymbolNameTriggerKind,
    PartialAcceptTriggerKind: standaloneEnums.PartialAcceptTriggerKind,
    HoverVerbosityAction: standaloneEnums.HoverVerbosityAction,
    InlineCompletionEndOfLifeReasonKind: standaloneEnums.InlineCompletionEndOfLifeReasonKind,
    InlineCompletionHintStyle: standaloneEnums.InlineCompletionHintStyle,
    // classes
    FoldingRangeKind: languages.FoldingRangeKind,
    // eslint-disable-next-line local/code-no-any-casts
    SelectedSuggestionInfo: languages.SelectedSuggestionInfo,
    // eslint-disable-next-line local/code-no-any-casts
    EditDeltaInfo
  };
}
export {
  EncodedTokenizationSupportAdapter,
  TokenizationSupportAdapter,
  createMonacoLanguagesAPI,
  getEncodedLanguageId,
  getLanguages,
  onLanguage,
  onLanguageEncountered,
  register,
  registerCodeActionProvider,
  registerCodeLensProvider,
  registerColorProvider,
  registerCompletionItemProvider,
  registerDeclarationProvider,
  registerDefinitionProvider,
  registerDocumentFormattingEditProvider,
  registerDocumentHighlightProvider,
  registerDocumentRangeFormattingEditProvider,
  registerDocumentRangeSemanticTokensProvider,
  registerDocumentSemanticTokensProvider,
  registerDocumentSymbolProvider,
  registerFoldingRangeProvider,
  registerHoverProvider,
  registerImplementationProvider,
  registerInlayHintsProvider,
  registerInlineCompletionsProvider,
  registerLinkProvider,
  registerLinkedEditingRangeProvider,
  registerNewSymbolNameProvider,
  registerOnTypeFormattingEditProvider,
  registerReferenceProvider,
  registerRenameProvider,
  registerSelectionRangeProvider,
  registerSignatureHelpProvider,
  registerTokensProviderFactory,
  registerTypeDefinitionProvider,
  setColorMap,
  setLanguageConfiguration,
  setMonarchTokensProvider,
  setTokensProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXGJyb3dzZXJcXHN0YW5kYWxvbmVMYW5ndWFnZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBNZXRhZGF0YUNvbnN0cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUV4dGVuc2lvblBvaW50LCBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTW9kZXNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlbGVjdG9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlU2VsZWN0b3IuanMnO1xuaW1wb3J0ICogYXMgbW9kZWwgZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCAqIGFzIHN0YW5kYWxvbmVFbnVtcyBmcm9tICcuLi8uLi9jb21tb24vc3RhbmRhbG9uZS9zdGFuZGFsb25lRW51bXMuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZVNlcnZpY2VzIH0gZnJvbSAnLi9zdGFuZGFsb25lU2VydmljZXMuanMnO1xuaW1wb3J0IHsgY29tcGlsZSB9IGZyb20gJy4uL2NvbW1vbi9tb25hcmNoL21vbmFyY2hDb21waWxlLmpzJztcbmltcG9ydCB7IE1vbmFyY2hUb2tlbml6ZXIgfSBmcm9tICcuLi9jb21tb24vbW9uYXJjaC9tb25hcmNoTGV4ZXIuanMnO1xuaW1wb3J0IHsgSU1vbmFyY2hMYW5ndWFnZSB9IGZyb20gJy4uL2NvbW1vbi9tb25hcmNoL21vbmFyY2hUeXBlcy5qcyc7XG5pbXBvcnQgeyBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zdGFuZGFsb25lVGhlbWUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IEVkaXREZWx0YUluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5cbi8qKlxuICogUmVnaXN0ZXIgaW5mb3JtYXRpb24gYWJvdXQgYSBuZXcgbGFuZ3VhZ2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlcihsYW5ndWFnZTogSUxhbmd1YWdlRXh0ZW5zaW9uUG9pbnQpOiB2b2lkIHtcblx0Ly8gSW50ZW50aW9uYWxseSB1c2luZyB0aGUgYE1vZGVzUmVnaXN0cnlgIGhlcmUgdG8gYXZvaWRcblx0Ly8gaW5zdGFudGlhdGluZyBzZXJ2aWNlcyB0b28gcXVpY2tseSBpbiB0aGUgc3RhbmRhbG9uZSBlZGl0b3IuXG5cdE1vZGVzUmVnaXN0cnkucmVnaXN0ZXJMYW5ndWFnZShsYW5ndWFnZSk7XG59XG5cbi8qKlxuICogR2V0IHRoZSBpbmZvcm1hdGlvbiBvZiBhbGwgdGhlIHJlZ2lzdGVyZWQgbGFuZ3VhZ2VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFuZ3VhZ2VzKCk6IElMYW5ndWFnZUV4dGVuc2lvblBvaW50W10ge1xuXHRsZXQgcmVzdWx0OiBJTGFuZ3VhZ2VFeHRlbnNpb25Qb2ludFtdID0gW107XG5cdHJlc3VsdCA9IHJlc3VsdC5jb25jYXQoTW9kZXNSZWdpc3RyeS5nZXRMYW5ndWFnZXMoKSk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFbmNvZGVkTGFuZ3VhZ2VJZChsYW5ndWFnZUlkOiBzdHJpbmcpOiBudW1iZXIge1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xufVxuXG4vKipcbiAqIEFuIGV2ZW50IGVtaXR0ZWQgd2hlbiBhIGxhbmd1YWdlIGlzIGFzc29jaWF0ZWQgZm9yIHRoZSBmaXJzdCB0aW1lIHdpdGggYSB0ZXh0IG1vZGVsLlxuICogQGV2ZW50XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvbkxhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZywgY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdHJldHVybiBTdGFuZGFsb25lU2VydmljZXMud2l0aFNlcnZpY2VzKCgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBsYW5ndWFnZVNlcnZpY2Uub25EaWRSZXF1ZXN0UmljaExhbmd1YWdlRmVhdHVyZXMoKGVuY291bnRlcmVkTGFuZ3VhZ2VJZCkgPT4ge1xuXHRcdFx0aWYgKGVuY291bnRlcmVkTGFuZ3VhZ2VJZCA9PT0gbGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHQvLyBzdG9wIGxpc3RlbmluZ1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0Ly8gaW52b2tlIGFjdHVhbCBsaXN0ZW5lclxuXHRcdFx0XHRjYWxsYmFjaygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBkaXNwb3NhYmxlO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBBbiBldmVudCBlbWl0dGVkIHdoZW4gYSBsYW5ndWFnZSBpcyBhc3NvY2lhdGVkIGZvciB0aGUgZmlyc3QgdGltZSB3aXRoIGEgdGV4dCBtb2RlbCBvclxuICogd2hlbiBhIGxhbmd1YWdlIGlzIGVuY291bnRlcmVkIGR1cmluZyB0aGUgdG9rZW5pemF0aW9uIG9mIGFub3RoZXIgbGFuZ3VhZ2UuXG4gKiBAZXZlbnRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9uTGFuZ3VhZ2VFbmNvdW50ZXJlZChsYW5ndWFnZUlkOiBzdHJpbmcsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gU3RhbmRhbG9uZVNlcnZpY2VzLndpdGhTZXJ2aWNlcygoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbGFuZ3VhZ2VTZXJ2aWNlLm9uRGlkUmVxdWVzdEJhc2ljTGFuZ3VhZ2VGZWF0dXJlcygoZW5jb3VudGVyZWRMYW5ndWFnZUlkKSA9PiB7XG5cdFx0XHRpZiAoZW5jb3VudGVyZWRMYW5ndWFnZUlkID09PSBsYW5ndWFnZUlkKSB7XG5cdFx0XHRcdC8vIHN0b3AgbGlzdGVuaW5nXG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHQvLyBpbnZva2UgYWN0dWFsIGxpc3RlbmVyXG5cdFx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGU7XG5cdH0pO1xufVxuXG4vKipcbiAqIFNldCB0aGUgZWRpdGluZyBjb25maWd1cmF0aW9uIGZvciBhIGxhbmd1YWdlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogTGFuZ3VhZ2VDb25maWd1cmF0aW9uKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRpZiAoIWxhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3Qgc2V0IGNvbmZpZ3VyYXRpb24gZm9yIHVua25vd24gbGFuZ3VhZ2UgJHtsYW5ndWFnZUlkfWApO1xuXHR9XG5cdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwgY29uZmlndXJhdGlvbiwgMTAwKTtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGNsYXNzIEVuY29kZWRUb2tlbml6YXRpb25TdXBwb3J0QWRhcHRlciBpbXBsZW1lbnRzIGxhbmd1YWdlcy5JVG9rZW5pemF0aW9uU3VwcG9ydCwgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlSWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0dWFsOiBFbmNvZGVkVG9rZW5zUHJvdmlkZXI7XG5cblx0Y29uc3RydWN0b3IobGFuZ3VhZ2VJZDogc3RyaW5nLCBhY3R1YWw6IEVuY29kZWRUb2tlbnNQcm92aWRlcikge1xuXHRcdHRoaXMuX2xhbmd1YWdlSWQgPSBsYW5ndWFnZUlkO1xuXHRcdHRoaXMuX2FjdHVhbCA9IGFjdHVhbDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gTk9PUFxuXHR9XG5cblx0cHVibGljIGdldEluaXRpYWxTdGF0ZSgpOiBsYW5ndWFnZXMuSVN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0dWFsLmdldEluaXRpYWxTdGF0ZSgpO1xuXHR9XG5cblx0cHVibGljIHRva2VuaXplKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSk6IGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZXN1bHQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5fYWN0dWFsLnRva2VuaXplID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRyZXR1cm4gVG9rZW5pemF0aW9uU3VwcG9ydEFkYXB0ZXIuYWRhcHRUb2tlbml6ZSh0aGlzLl9sYW5ndWFnZUlkLCA8eyB0b2tlbml6ZShsaW5lOiBzdHJpbmcsIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKTogSUxpbmVUb2tlbnMgfT50aGlzLl9hY3R1YWwsIGxpbmUsIHN0YXRlKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkIScpO1xuXHR9XG5cblx0cHVibGljIHRva2VuaXplRW5jb2RlZChsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpOiBsYW5ndWFnZXMuRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fYWN0dWFsLnRva2VuaXplRW5jb2RlZChsaW5lLCBzdGF0ZSk7XG5cdFx0cmV0dXJuIG5ldyBsYW5ndWFnZXMuRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdChyZXN1bHQudG9rZW5zLCBbXSwgcmVzdWx0LmVuZFN0YXRlKTtcblx0fVxufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgY2xhc3MgVG9rZW5pemF0aW9uU3VwcG9ydEFkYXB0ZXIgaW1wbGVtZW50cyBsYW5ndWFnZXMuSVRva2VuaXphdGlvblN1cHBvcnQsIElEaXNwb3NhYmxlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWN0dWFsOiBUb2tlbnNQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RhbmRhbG9uZVRoZW1lU2VydmljZTogSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBOT09QXG5cdH1cblxuXHRwdWJsaWMgZ2V0SW5pdGlhbFN0YXRlKCk6IGxhbmd1YWdlcy5JU3RhdGUge1xuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwuZ2V0SW5pdGlhbFN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfdG9DbGFzc2ljVG9rZW5zKHRva2VuczogSVRva2VuW10sIGxhbmd1YWdlOiBzdHJpbmcpOiBsYW5ndWFnZXMuVG9rZW5bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBsYW5ndWFnZXMuVG9rZW5bXSA9IFtdO1xuXHRcdGxldCBwcmV2aW91c1N0YXJ0SW5kZXg6IG51bWJlciA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRva2Vucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdCA9IHRva2Vuc1tpXTtcblx0XHRcdGxldCBzdGFydEluZGV4ID0gdC5zdGFydEluZGV4O1xuXG5cdFx0XHQvLyBQcmV2ZW50IGlzc3VlcyBzdGVtbWluZyBmcm9tIGEgYnVnZ3kgZXh0ZXJuYWwgdG9rZW5pemVyLlxuXHRcdFx0aWYgKGkgPT09IDApIHtcblx0XHRcdFx0Ly8gRm9yY2UgZmlyc3QgdG9rZW4gdG8gc3RhcnQgYXQgZmlyc3QgaW5kZXghXG5cdFx0XHRcdHN0YXJ0SW5kZXggPSAwO1xuXHRcdFx0fSBlbHNlIGlmIChzdGFydEluZGV4IDwgcHJldmlvdXNTdGFydEluZGV4KSB7XG5cdFx0XHRcdC8vIEZvcmNlIHRva2VucyB0byBiZSBhZnRlciBvbmUgYW5vdGhlciFcblx0XHRcdFx0c3RhcnRJbmRleCA9IHByZXZpb3VzU3RhcnRJbmRleDtcblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0W2ldID0gbmV3IGxhbmd1YWdlcy5Ub2tlbihzdGFydEluZGV4LCB0LnNjb3BlcywgbGFuZ3VhZ2UpO1xuXG5cdFx0XHRwcmV2aW91c1N0YXJ0SW5kZXggPSBzdGFydEluZGV4O1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBhZGFwdFRva2VuaXplKGxhbmd1YWdlOiBzdHJpbmcsIGFjdHVhbDogeyB0b2tlbml6ZShsaW5lOiBzdHJpbmcsIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKTogSUxpbmVUb2tlbnMgfSwgbGluZTogc3RyaW5nLCBzdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSk6IGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZXN1bHQge1xuXHRcdGNvbnN0IGFjdHVhbFJlc3VsdCA9IGFjdHVhbC50b2tlbml6ZShsaW5lLCBzdGF0ZSk7XG5cdFx0Y29uc3QgdG9rZW5zID0gVG9rZW5pemF0aW9uU3VwcG9ydEFkYXB0ZXIuX3RvQ2xhc3NpY1Rva2VucyhhY3R1YWxSZXN1bHQudG9rZW5zLCBsYW5ndWFnZSk7XG5cblx0XHRsZXQgZW5kU3RhdGU6IGxhbmd1YWdlcy5JU3RhdGU7XG5cdFx0Ly8gdHJ5IHRvIHNhdmUgYW4gb2JqZWN0IGlmIHBvc3NpYmxlXG5cdFx0aWYgKGFjdHVhbFJlc3VsdC5lbmRTdGF0ZS5lcXVhbHMoc3RhdGUpKSB7XG5cdFx0XHRlbmRTdGF0ZSA9IHN0YXRlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbmRTdGF0ZSA9IGFjdHVhbFJlc3VsdC5lbmRTdGF0ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBlbmRTdGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgdG9rZW5pemUobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKTogbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlc3VsdCB7XG5cdFx0cmV0dXJuIFRva2VuaXphdGlvblN1cHBvcnRBZGFwdGVyLmFkYXB0VG9rZW5pemUodGhpcy5fbGFuZ3VhZ2VJZCwgdGhpcy5fYWN0dWFsLCBsaW5lLCBzdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF90b0JpbmFyeVRva2VucyhsYW5ndWFnZUlkQ29kZWM6IGxhbmd1YWdlcy5JTGFuZ3VhZ2VJZENvZGVjLCB0b2tlbnM6IElUb2tlbltdKTogVWludDMyQXJyYXkge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBsYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZCh0aGlzLl9sYW5ndWFnZUlkKTtcblx0XHRjb25zdCB0b2tlblRoZW1lID0gdGhpcy5fc3RhbmRhbG9uZVRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudG9rZW5UaGVtZTtcblxuXHRcdGNvbnN0IHJlc3VsdDogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgcmVzdWx0TGVuID0gMDtcblx0XHRsZXQgcHJldmlvdXNTdGFydEluZGV4OiBudW1iZXIgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSB0b2tlbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHQgPSB0b2tlbnNbaV07XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRva2VuVGhlbWUubWF0Y2gobGFuZ3VhZ2VJZCwgdC5zY29wZXMpIHwgTWV0YWRhdGFDb25zdHMuQkFMQU5DRURfQlJBQ0tFVFNfTUFTSztcblx0XHRcdGlmIChyZXN1bHRMZW4gPiAwICYmIHJlc3VsdFtyZXN1bHRMZW4gLSAxXSA9PT0gbWV0YWRhdGEpIHtcblx0XHRcdFx0Ly8gc2FtZSBtZXRhZGF0YVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHN0YXJ0SW5kZXggPSB0LnN0YXJ0SW5kZXg7XG5cblx0XHRcdC8vIFByZXZlbnQgaXNzdWVzIHN0ZW1taW5nIGZyb20gYSBidWdneSBleHRlcm5hbCB0b2tlbml6ZXIuXG5cdFx0XHRpZiAoaSA9PT0gMCkge1xuXHRcdFx0XHQvLyBGb3JjZSBmaXJzdCB0b2tlbiB0byBzdGFydCBhdCBmaXJzdCBpbmRleCFcblx0XHRcdFx0c3RhcnRJbmRleCA9IDA7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXJ0SW5kZXggPCBwcmV2aW91c1N0YXJ0SW5kZXgpIHtcblx0XHRcdFx0Ly8gRm9yY2UgdG9rZW5zIHRvIGJlIGFmdGVyIG9uZSBhbm90aGVyIVxuXHRcdFx0XHRzdGFydEluZGV4ID0gcHJldmlvdXNTdGFydEluZGV4O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gc3RhcnRJbmRleDtcblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBtZXRhZGF0YTtcblxuXHRcdFx0cHJldmlvdXNTdGFydEluZGV4ID0gc3RhcnRJbmRleDtcblx0XHR9XG5cblx0XHRjb25zdCBhY3R1YWxSZXN1bHQgPSBuZXcgVWludDMyQXJyYXkocmVzdWx0TGVuKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlc3VsdExlbjsgaSsrKSB7XG5cdFx0XHRhY3R1YWxSZXN1bHRbaV0gPSByZXN1bHRbaV07XG5cdFx0fVxuXHRcdHJldHVybiBhY3R1YWxSZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgdG9rZW5pemVFbmNvZGVkKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSk6IGxhbmd1YWdlcy5FbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0IHtcblx0XHRjb25zdCBhY3R1YWxSZXN1bHQgPSB0aGlzLl9hY3R1YWwudG9rZW5pemUobGluZSwgc3RhdGUpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRoaXMuX3RvQmluYXJ5VG9rZW5zKHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMsIGFjdHVhbFJlc3VsdC50b2tlbnMpO1xuXG5cdFx0bGV0IGVuZFN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlO1xuXHRcdC8vIHRyeSB0byBzYXZlIGFuIG9iamVjdCBpZiBwb3NzaWJsZVxuXHRcdGlmIChhY3R1YWxSZXN1bHQuZW5kU3RhdGUuZXF1YWxzKHN0YXRlKSkge1xuXHRcdFx0ZW5kU3RhdGUgPSBzdGF0ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZW5kU3RhdGUgPSBhY3R1YWxSZXN1bHQuZW5kU3RhdGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBsYW5ndWFnZXMuRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCh0b2tlbnMsIFtdLCBlbmRTdGF0ZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBBIHRva2VuLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElUb2tlbiB7XG5cdHN0YXJ0SW5kZXg6IG51bWJlcjtcblx0c2NvcGVzOiBzdHJpbmc7XG59XG5cbi8qKlxuICogVGhlIHJlc3VsdCBvZiBhIGxpbmUgdG9rZW5pemF0aW9uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElMaW5lVG9rZW5zIHtcblx0LyoqXG5cdCAqIFRoZSBsaXN0IG9mIHRva2VucyBvbiB0aGUgbGluZS5cblx0ICovXG5cdHRva2VuczogSVRva2VuW107XG5cdC8qKlxuXHQgKiBUaGUgdG9rZW5pemF0aW9uIGVuZCBzdGF0ZS5cblx0ICogQSBwb2ludGVyIHdpbGwgYmUgaGVsZCB0byB0aGlzIGFuZCB0aGUgb2JqZWN0IHNob3VsZCBub3QgYmUgbW9kaWZpZWQgYnkgdGhlIHRva2VuaXplciBhZnRlciB0aGUgcG9pbnRlciBpcyByZXR1cm5lZC5cblx0ICovXG5cdGVuZFN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlO1xufVxuXG4vKipcbiAqIFRoZSByZXN1bHQgb2YgYSBsaW5lIHRva2VuaXphdGlvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRW5jb2RlZExpbmVUb2tlbnMge1xuXHQvKipcblx0ICogVGhlIHRva2VucyBvbiB0aGUgbGluZSBpbiBhIGJpbmFyeSwgZW5jb2RlZCBmb3JtYXQuIEVhY2ggdG9rZW4gb2NjdXBpZXMgdHdvIGFycmF5IGluZGljZXMuIEZvciB0b2tlbiBpOlxuXHQgKiAgLSBhdCBvZmZzZXQgMippID0+IHN0YXJ0SW5kZXhcblx0ICogIC0gYXQgb2Zmc2V0IDIqaSArIDEgPT4gbWV0YWRhdGFcblx0ICogTWV0YSBkYXRhIGlzIGluIGJpbmFyeSBmb3JtYXQ6XG5cdCAqIC0gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQgKiAgICAgMzMyMiAyMjIyIDIyMjIgMTExMSAxMTExIDExMDAgMDAwMCAwMDAwXG5cdCAqICAgICAxMDk4IDc2NTQgMzIxMCA5ODc2IDU0MzIgMTA5OCA3NjU0IDMyMTBcblx0ICogLSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdCAqICAgICBiYmJiIGJiYmIgYmZmZiBmZmZmIGZmRkYgRkZUVCBMTExMIExMTExcblx0ICogLSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdCAqICAtIEwgPSBFbmNvZGVkTGFuZ3VhZ2VJZCAoOCBiaXRzKTogVXNlIGBnZXRFbmNvZGVkTGFuZ3VhZ2VJZGAgdG8gZ2V0IHRoZSBlbmNvZGVkIElEIG9mIGEgbGFuZ3VhZ2UuXG5cdCAqICAtIFQgPSBTdGFuZGFyZFRva2VuVHlwZSAoMiBiaXRzKTogT3RoZXIgPSAwLCBDb21tZW50ID0gMSwgU3RyaW5nID0gMiwgUmVnRXggPSAzLlxuXHQgKiAgLSBGID0gRm9udFN0eWxlICg0IGJpdHMpOiBOb25lID0gMCwgSXRhbGljID0gMSwgQm9sZCA9IDIsIFVuZGVybGluZSA9IDQsIFN0cmlrZXRocm91Z2ggPSA4LlxuXHQgKiAgLSBmID0gZm9yZWdyb3VuZCBDb2xvcklkICg5IGJpdHMpXG5cdCAqICAtIGIgPSBiYWNrZ3JvdW5kIENvbG9ySWQgKDkgYml0cylcblx0ICogIC0gVGhlIGNvbG9yIHZhbHVlIGZvciBlYWNoIGNvbG9ySWQgaXMgZGVmaW5lZCBpbiBJU3RhbmRhbG9uZVRoZW1lRGF0YS5jdXN0b21Ub2tlbkNvbG9yczpcblx0ICogZS5nLiBjb2xvcklkID0gMSBpcyBzdG9yZWQgaW4gSVN0YW5kYWxvbmVUaGVtZURhdGEuY3VzdG9tVG9rZW5Db2xvcnNbMV0uIENvbG9yIGlkID0gMCBtZWFucyBubyBjb2xvcixcblx0ICogaWQgPSAxIGlzIGZvciB0aGUgZGVmYXVsdCBmb3JlZ3JvdW5kIGNvbG9yLCBpZCA9IDIgZm9yIHRoZSBkZWZhdWx0IGJhY2tncm91bmQuXG5cdCAqL1xuXHR0b2tlbnM6IFVpbnQzMkFycmF5O1xuXHQvKipcblx0ICogVGhlIHRva2VuaXphdGlvbiBlbmQgc3RhdGUuXG5cdCAqIEEgcG9pbnRlciB3aWxsIGJlIGhlbGQgdG8gdGhpcyBhbmQgdGhlIG9iamVjdCBzaG91bGQgbm90IGJlIG1vZGlmaWVkIGJ5IHRoZSB0b2tlbml6ZXIgYWZ0ZXIgdGhlIHBvaW50ZXIgaXMgcmV0dXJuZWQuXG5cdCAqL1xuXHRlbmRTdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZTtcbn1cblxuLyoqXG4gKiBBIGZhY3RvcnkgZm9yIHRva2VuIHByb3ZpZGVycy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBUb2tlbnNQcm92aWRlckZhY3Rvcnkge1xuXHRjcmVhdGUoKTogbGFuZ3VhZ2VzLlByb3ZpZGVyUmVzdWx0PFRva2Vuc1Byb3ZpZGVyIHwgRW5jb2RlZFRva2Vuc1Byb3ZpZGVyIHwgSU1vbmFyY2hMYW5ndWFnZT47XG59XG5cbi8qKlxuICogQSBcIm1hbnVhbFwiIHByb3ZpZGVyIG9mIHRva2Vucy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBUb2tlbnNQcm92aWRlciB7XG5cdC8qKlxuXHQgKiBUaGUgaW5pdGlhbCBzdGF0ZSBvZiBhIGxhbmd1YWdlLiBXaWxsIGJlIHRoZSBzdGF0ZSBwYXNzZWQgaW4gdG8gdG9rZW5pemUgdGhlIGZpcnN0IGxpbmUuXG5cdCAqL1xuXHRnZXRJbml0aWFsU3RhdGUoKTogbGFuZ3VhZ2VzLklTdGF0ZTtcblx0LyoqXG5cdCAqIFRva2VuaXplIGEgbGluZSBnaXZlbiB0aGUgc3RhdGUgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgbGluZS5cblx0ICovXG5cdHRva2VuaXplKGxpbmU6IHN0cmluZywgc3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpOiBJTGluZVRva2Vucztcbn1cblxuLyoqXG4gKiBBIFwibWFudWFsXCIgcHJvdmlkZXIgb2YgdG9rZW5zLCByZXR1cm5pbmcgdG9rZW5zIGluIGEgYmluYXJ5IGZvcm0uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRW5jb2RlZFRva2Vuc1Byb3ZpZGVyIHtcblx0LyoqXG5cdCAqIFRoZSBpbml0aWFsIHN0YXRlIG9mIGEgbGFuZ3VhZ2UuIFdpbGwgYmUgdGhlIHN0YXRlIHBhc3NlZCBpbiB0byB0b2tlbml6ZSB0aGUgZmlyc3QgbGluZS5cblx0ICovXG5cdGdldEluaXRpYWxTdGF0ZSgpOiBsYW5ndWFnZXMuSVN0YXRlO1xuXHQvKipcblx0ICogVG9rZW5pemUgYSBsaW5lIGdpdmVuIHRoZSBzdGF0ZSBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBsaW5lLlxuXHQgKi9cblx0dG9rZW5pemVFbmNvZGVkKGxpbmU6IHN0cmluZywgc3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpOiBJRW5jb2RlZExpbmVUb2tlbnM7XG5cdC8qKlxuXHQgKiBUb2tlbml6ZSBhIGxpbmUgZ2l2ZW4gdGhlIHN0YXRlIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIGxpbmUuXG5cdCAqL1xuXHR0b2tlbml6ZT8obGluZTogc3RyaW5nLCBzdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSk6IElMaW5lVG9rZW5zO1xufVxuXG5mdW5jdGlvbiBpc0FUb2tlbnNQcm92aWRlcihwcm92aWRlcjogVG9rZW5zUHJvdmlkZXIgfCBFbmNvZGVkVG9rZW5zUHJvdmlkZXIgfCBJTW9uYXJjaExhbmd1YWdlKTogcHJvdmlkZXIgaXMgVG9rZW5zUHJvdmlkZXIgfCBFbmNvZGVkVG9rZW5zUHJvdmlkZXIge1xuXHRyZXR1cm4gKHR5cGVvZiBwcm92aWRlci5nZXRJbml0aWFsU3RhdGUgPT09ICdmdW5jdGlvbicpO1xufVxuXG5mdW5jdGlvbiBpc0VuY29kZWRUb2tlbnNQcm92aWRlcihwcm92aWRlcjogVG9rZW5zUHJvdmlkZXIgfCBFbmNvZGVkVG9rZW5zUHJvdmlkZXIpOiBwcm92aWRlciBpcyBFbmNvZGVkVG9rZW5zUHJvdmlkZXIge1xuXHRyZXR1cm4gJ3Rva2VuaXplRW5jb2RlZCcgaW4gcHJvdmlkZXI7XG59XG5cbmZ1bmN0aW9uIGlzVGhlbmFibGU8VD4ob2JqOiBhbnkpOiBvYmogaXMgVGhlbmFibGU8VD4ge1xuXHRyZXR1cm4gb2JqICYmIHR5cGVvZiBvYmoudGhlbiA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuLyoqXG4gKiBDaGFuZ2UgdGhlIGNvbG9yIG1hcCB0aGF0IGlzIHVzZWQgZm9yIHRva2VuIGNvbG9ycy5cbiAqIFN1cHBvcnRlZCBmb3JtYXRzIChoZXgpOiAjUlJHR0JCLCAkUlJHR0JCQUEsICNSR0IsICNSR0JBXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDb2xvck1hcChjb2xvck1hcDogc3RyaW5nW10gfCBudWxsKTogdm9pZCB7XG5cdGNvbnN0IHN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlKTtcblx0aWYgKGNvbG9yTWFwKSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBDb2xvcltdID0gW251bGwhXTtcblx0XHRmb3IgKGxldCBpID0gMSwgbGVuID0gY29sb3JNYXAubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdHJlc3VsdFtpXSA9IENvbG9yLmZyb21IZXgoY29sb3JNYXBbaV0pO1xuXHRcdH1cblx0XHRzdGFuZGFsb25lVGhlbWVTZXJ2aWNlLnNldENvbG9yTWFwT3ZlcnJpZGUocmVzdWx0KTtcblx0fSBlbHNlIHtcblx0XHRzdGFuZGFsb25lVGhlbWVTZXJ2aWNlLnNldENvbG9yTWFwT3ZlcnJpZGUobnVsbCk7XG5cdH1cbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZnVuY3Rpb24gY3JlYXRlVG9rZW5pemF0aW9uU3VwcG9ydEFkYXB0ZXIobGFuZ3VhZ2VJZDogc3RyaW5nLCBwcm92aWRlcjogVG9rZW5zUHJvdmlkZXIgfCBFbmNvZGVkVG9rZW5zUHJvdmlkZXIpIHtcblx0aWYgKGlzRW5jb2RlZFRva2Vuc1Byb3ZpZGVyKHByb3ZpZGVyKSkge1xuXHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblN1cHBvcnRBZGFwdGVyKGxhbmd1YWdlSWQsIHByb3ZpZGVyKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gbmV3IFRva2VuaXphdGlvblN1cHBvcnRBZGFwdGVyKFxuXHRcdFx0bGFuZ3VhZ2VJZCxcblx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0U3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKSxcblx0XHRcdFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UpLFxuXHRcdCk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIHRva2VucyBwcm92aWRlciBmYWN0b3J5IGZvciBhIGxhbmd1YWdlLiBUaGlzIHRva2VuaXplciB3aWxsIGJlIGV4Y2x1c2l2ZSB3aXRoIGEgdG9rZW5pemVyXG4gKiBzZXQgdXNpbmcgYHNldFRva2Vuc1Byb3ZpZGVyYCBvciBvbmUgY3JlYXRlZCB1c2luZyBgc2V0TW9uYXJjaFRva2Vuc1Byb3ZpZGVyYCwgYnV0IHdpbGwgd29yayB0b2dldGhlclxuICogd2l0aCBhIHRva2VucyBwcm92aWRlciBzZXQgdXNpbmcgYHJlZ2lzdGVyRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyYCBvciBgcmVnaXN0ZXJEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcmAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclRva2Vuc1Byb3ZpZGVyRmFjdG9yeShsYW5ndWFnZUlkOiBzdHJpbmcsIGZhY3Rvcnk6IFRva2Vuc1Byb3ZpZGVyRmFjdG9yeSk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgYWRhcHRlZEZhY3RvcnkgPSBuZXcgbGFuZ3VhZ2VzLkxhenlUb2tlbml6YXRpb25TdXBwb3J0KGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUoZmFjdG9yeS5jcmVhdGUoKSk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoaXNBVG9rZW5zUHJvdmlkZXIocmVzdWx0KSkge1xuXHRcdFx0cmV0dXJuIGNyZWF0ZVRva2VuaXphdGlvblN1cHBvcnRBZGFwdGVyKGxhbmd1YWdlSWQsIHJlc3VsdCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTW9uYXJjaFRva2VuaXplcihTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpLCBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlKSwgbGFuZ3VhZ2VJZCwgY29tcGlsZShsYW5ndWFnZUlkLCByZXN1bHQpLCBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHR9KTtcblx0cmV0dXJuIGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlckZhY3RvcnkobGFuZ3VhZ2VJZCwgYWRhcHRlZEZhY3RvcnkpO1xufVxuXG4vKipcbiAqIFNldCB0aGUgdG9rZW5zIHByb3ZpZGVyIGZvciBhIGxhbmd1YWdlIChtYW51YWwgaW1wbGVtZW50YXRpb24pLiBUaGlzIHRva2VuaXplciB3aWxsIGJlIGV4Y2x1c2l2ZVxuICogd2l0aCBhIHRva2VuaXplciBjcmVhdGVkIHVzaW5nIGBzZXRNb25hcmNoVG9rZW5zUHJvdmlkZXJgLCBvciB3aXRoIGByZWdpc3RlclRva2Vuc1Byb3ZpZGVyRmFjdG9yeWAsXG4gKiBidXQgd2lsbCB3b3JrIHRvZ2V0aGVyIHdpdGggYSB0b2tlbnMgcHJvdmlkZXIgc2V0IHVzaW5nIGByZWdpc3RlckRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcmBcbiAqIG9yIGByZWdpc3RlckRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNldFRva2Vuc1Byb3ZpZGVyKGxhbmd1YWdlSWQ6IHN0cmluZywgcHJvdmlkZXI6IFRva2Vuc1Byb3ZpZGVyIHwgRW5jb2RlZFRva2Vuc1Byb3ZpZGVyIHwgVGhlbmFibGU8VG9rZW5zUHJvdmlkZXIgfCBFbmNvZGVkVG9rZW5zUHJvdmlkZXI+KTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRpZiAoIWxhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3Qgc2V0IHRva2VucyBwcm92aWRlciBmb3IgdW5rbm93biBsYW5ndWFnZSAke2xhbmd1YWdlSWR9YCk7XG5cdH1cblx0aWYgKGlzVGhlbmFibGU8VG9rZW5zUHJvdmlkZXIgfCBFbmNvZGVkVG9rZW5zUHJvdmlkZXI+KHByb3ZpZGVyKSkge1xuXHRcdHJldHVybiByZWdpc3RlclRva2Vuc1Byb3ZpZGVyRmFjdG9yeShsYW5ndWFnZUlkLCB7IGNyZWF0ZTogKCkgPT4gcHJvdmlkZXIgfSk7XG5cdH1cblx0cmV0dXJuIGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihsYW5ndWFnZUlkLCBjcmVhdGVUb2tlbml6YXRpb25TdXBwb3J0QWRhcHRlcihsYW5ndWFnZUlkLCBwcm92aWRlcikpO1xufVxuXG4vKipcbiAqIFNldCB0aGUgdG9rZW5zIHByb3ZpZGVyIGZvciBhIGxhbmd1YWdlIChtb25hcmNoIGltcGxlbWVudGF0aW9uKS4gVGhpcyB0b2tlbml6ZXIgd2lsbCBiZSBleGNsdXNpdmVcbiAqIHdpdGggYSB0b2tlbml6ZXIgc2V0IHVzaW5nIGBzZXRUb2tlbnNQcm92aWRlcmAsIG9yIHdpdGggYHJlZ2lzdGVyVG9rZW5zUHJvdmlkZXJGYWN0b3J5YCwgYnV0IHdpbGxcbiAqIHdvcmsgdG9nZXRoZXIgd2l0aCBhIHRva2VucyBwcm92aWRlciBzZXQgdXNpbmcgYHJlZ2lzdGVyRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyYCBvclxuICogYHJlZ2lzdGVyRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXJgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0TW9uYXJjaFRva2Vuc1Byb3ZpZGVyKGxhbmd1YWdlSWQ6IHN0cmluZywgbGFuZ3VhZ2VEZWY6IElNb25hcmNoTGFuZ3VhZ2UgfCBUaGVuYWJsZTxJTW9uYXJjaExhbmd1YWdlPik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgY3JlYXRlID0gKGxhbmd1YWdlRGVmOiBJTW9uYXJjaExhbmd1YWdlKSA9PiB7XG5cdFx0cmV0dXJuIG5ldyBNb25hcmNoVG9rZW5pemVyKFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlU2VydmljZSksIFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UpLCBsYW5ndWFnZUlkLCBjb21waWxlKGxhbmd1YWdlSWQsIGxhbmd1YWdlRGVmKSwgU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0fTtcblx0aWYgKGlzVGhlbmFibGU8SU1vbmFyY2hMYW5ndWFnZT4obGFuZ3VhZ2VEZWYpKSB7XG5cdFx0cmV0dXJuIHJlZ2lzdGVyVG9rZW5zUHJvdmlkZXJGYWN0b3J5KGxhbmd1YWdlSWQsIHsgY3JlYXRlOiAoKSA9PiBsYW5ndWFnZURlZiB9KTtcblx0fVxuXHRyZXR1cm4gbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKGxhbmd1YWdlSWQsIGNyZWF0ZShsYW5ndWFnZURlZikpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgcmVmZXJlbmNlIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gcmVmZXJlbmNlIHNlYXJjaCkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclJlZmVyZW5jZVByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuUmVmZXJlbmNlUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVmZXJlbmNlUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgcmVuYW1lIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gcmVuYW1lIHN5bWJvbCkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclJlbmFtZVByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuUmVuYW1lUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVuYW1lUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgbmV3IHN5bWJvbC1uYW1lIHByb3ZpZGVyIChlLmcuLCB3aGVuIGEgc3ltYm9sIGlzIGJlaW5nIHJlbmFtZWQsIHNob3cgbmV3IHBvc3NpYmxlIHN5bWJvbC1uYW1lcylcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyTmV3U3ltYm9sTmFtZVByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuTmV3U3ltYm9sTmFtZXNQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5uZXdTeW1ib2xOYW1lc1Byb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIHNpZ25hdHVyZSBoZWxwIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gcGFyYW1ldGVyIGhpbnRzKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyU2lnbmF0dXJlSGVscFByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuU2lnbmF0dXJlSGVscFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnNpZ25hdHVyZUhlbHBQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBob3ZlciBwcm92aWRlciAodXNlZCBieSBlLmcuIGVkaXRvciBob3ZlcikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckhvdmVyUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5Ib3ZlclByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmhvdmVyUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3Rvciwge1xuXHRcdHByb3ZpZGVIb3ZlcjogYXN5bmMgKG1vZGVsOiBtb2RlbC5JVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgY29udGV4dD86IGxhbmd1YWdlcy5Ib3ZlckNvbnRleHQ8bGFuZ3VhZ2VzLkhvdmVyPik6IFByb21pc2U8bGFuZ3VhZ2VzLkhvdmVyIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRjb25zdCB3b3JkID0gbW9kZWwuZ2V0V29yZEF0UG9zaXRpb24ocG9zaXRpb24pO1xuXG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlPGxhbmd1YWdlcy5Ib3ZlciB8IG51bGwgfCB1bmRlZmluZWQ+KHByb3ZpZGVyLnByb3ZpZGVIb3Zlcihtb2RlbCwgcG9zaXRpb24sIHRva2VuLCBjb250ZXh0KSkudGhlbigodmFsdWUpOiBsYW5ndWFnZXMuSG92ZXIgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXZhbHVlLnJhbmdlICYmIHdvcmQpIHtcblx0XHRcdFx0XHR2YWx1ZS5yYW5nZSA9IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCB3b3JkLmVuZENvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF2YWx1ZS5yYW5nZSkge1xuXHRcdFx0XHRcdHZhbHVlLnJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgZG9jdW1lbnQgc3ltYm9sIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gb3V0bGluZSkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5Eb2N1bWVudFN5bWJvbFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgZG9jdW1lbnQgaGlnaGxpZ2h0IHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gaGlnaGxpZ2h0IG9jY3VycmVuY2VzKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRIaWdobGlnaHRQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYW4gbGlua2VkIGVkaXRpbmcgcmFuZ2UgcHJvdmlkZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuTGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UubGlua2VkRWRpdGluZ1JhbmdlUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgZGVmaW5pdGlvbiBwcm92aWRlciAodXNlZCBieSBlLmcuIGdvIHRvIGRlZmluaXRpb24pLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJEZWZpbml0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5EZWZpbml0aW9uUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIGltcGxlbWVudGF0aW9uIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gZ28gdG8gaW1wbGVtZW50YXRpb24pLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJJbXBsZW1lbnRhdGlvblByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuSW1wbGVtZW50YXRpb25Qcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbXBsZW1lbnRhdGlvblByb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIHR5cGUgZGVmaW5pdGlvbiBwcm92aWRlciAodXNlZCBieSBlLmcuIGdvIHRvIHR5cGUgZGVmaW5pdGlvbikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclR5cGVEZWZpbml0aW9uUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5UeXBlRGVmaW5pdGlvblByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnR5cGVEZWZpbml0aW9uUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgY29kZSBsZW5zIHByb3ZpZGVyICh1c2VkIGJ5IGUuZy4gaW5saW5lIGNvZGUgbGVuc2VzKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29kZUxlbnNQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkNvZGVMZW5zUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBjb2RlIGFjdGlvbiBwcm92aWRlciAodXNlZCBieSBlLmcuIHF1aWNrIGZpeCkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvZGVBY3Rpb25Qcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogQ29kZUFjdGlvblByb3ZpZGVyLCBtZXRhZGF0YT86IENvZGVBY3Rpb25Qcm92aWRlck1ldGFkYXRhKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCB7XG5cdFx0cHJvdmlkZWRDb2RlQWN0aW9uS2luZHM6IG1ldGFkYXRhPy5wcm92aWRlZENvZGVBY3Rpb25LaW5kcyxcblx0XHRkb2N1bWVudGF0aW9uOiBtZXRhZGF0YT8uZG9jdW1lbnRhdGlvbixcblx0XHRwcm92aWRlQ29kZUFjdGlvbnM6IChtb2RlbDogbW9kZWwuSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlLCBjb250ZXh0OiBsYW5ndWFnZXMuQ29kZUFjdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IGxhbmd1YWdlcy5Qcm92aWRlclJlc3VsdDxsYW5ndWFnZXMuQ29kZUFjdGlvbkxpc3Q+ID0+IHtcblx0XHRcdGNvbnN0IG1hcmtlclNlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElNYXJrZXJTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBtYXJrZXJTZXJ2aWNlLnJlYWQoeyByZXNvdXJjZTogbW9kZWwudXJpIH0pLmZpbHRlcihtID0+IHtcblx0XHRcdFx0cmV0dXJuIFJhbmdlLmFyZUludGVyc2VjdGluZ09yVG91Y2hpbmcobSwgcmFuZ2UpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXIucHJvdmlkZUNvZGVBY3Rpb25zKG1vZGVsLCByYW5nZSwgeyBtYXJrZXJzLCBvbmx5OiBjb250ZXh0Lm9ubHksIHRyaWdnZXI6IGNvbnRleHQudHJpZ2dlciB9LCB0b2tlbik7XG5cdFx0fSxcblx0XHRyZXNvbHZlQ29kZUFjdGlvbjogcHJvdmlkZXIucmVzb2x2ZUNvZGVBY3Rpb25cblx0fSk7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBmb3JtYXR0ZXIgdGhhdCBjYW4gaGFuZGxlIG9ubHkgZW50aXJlIG1vZGVscy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBmb3JtYXR0ZXIgdGhhdCBjYW4gaGFuZGxlIGEgcmFuZ2UgaW5zaWRlIGEgbW9kZWwuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgZm9ybWF0dGVyIHRoYW4gY2FuIGRvIGZvcm1hdHRpbmcgYXMgdGhlIHVzZXIgdHlwZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3Rlck9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5PblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLm9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgbGluayBwcm92aWRlciB0aGF0IGNhbiBmaW5kIGxpbmtzIGluIHRleHQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckxpbmtQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkxpbmtQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5saW5rUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgY29tcGxldGlvbiBpdGVtIHByb3ZpZGVyICh1c2UgYnkgZS5nLiBzdWdnZXN0aW9ucykuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBkb2N1bWVudCBjb2xvciBwcm92aWRlciAodXNlZCBieSBDb2xvciBQaWNrZXIsIENvbG9yIERlY29yYXRvcikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNvbG9yUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5Eb2N1bWVudENvbG9yUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29sb3JQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBmb2xkaW5nIHJhbmdlIHByb3ZpZGVyXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckZvbGRpbmdSYW5nZVByb3ZpZGVyKGxhbmd1YWdlU2VsZWN0b3I6IExhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuRm9sZGluZ1JhbmdlUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZm9sZGluZ1JhbmdlUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgZGVjbGFyYXRpb24gcHJvdmlkZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyRGVjbGFyYXRpb25Qcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkRlY2xhcmF0aW9uUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVjbGFyYXRpb25Qcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBzZWxlY3Rpb24gcmFuZ2UgcHJvdmlkZXJcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyU2VsZWN0aW9uUmFuZ2VQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLlNlbGVjdGlvblJhbmdlUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Uuc2VsZWN0aW9uUmFuZ2VQcm92aWRlci5yZWdpc3RlcihsYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcik7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgYSBkb2N1bWVudCBzZW1hbnRpYyB0b2tlbnMgcHJvdmlkZXIuIEEgc2VtYW50aWMgdG9rZW5zIHByb3ZpZGVyIHdpbGwgY29tcGxlbWVudCBhbmQgZW5oYW5jZSBhXG4gKiBzaW1wbGUgdG9wLWRvd24gdG9rZW5pemVyLiBTaW1wbGUgdG9wLWRvd24gdG9rZW5pemVycyBjYW4gYmUgc2V0IGVpdGhlciB2aWEgYHNldE1vbmFyY2hUb2tlbnNQcm92aWRlcmBcbiAqIG9yIGBzZXRUb2tlbnNQcm92aWRlcmAuXG4gKlxuICogRm9yIHRoZSBiZXN0IHVzZXIgZXhwZXJpZW5jZSwgcmVnaXN0ZXIgYm90aCBhIHNlbWFudGljIHRva2VucyBwcm92aWRlciBhbmQgYSB0b3AtZG93biB0b2tlbml6ZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBTdGFuZGFsb25lU2VydmljZXMuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGEgZG9jdW1lbnQgcmFuZ2Ugc2VtYW50aWMgdG9rZW5zIHByb3ZpZGVyLiBBIHNlbWFudGljIHRva2VucyBwcm92aWRlciB3aWxsIGNvbXBsZW1lbnQgYW5kIGVuaGFuY2UgYVxuICogc2ltcGxlIHRvcC1kb3duIHRva2VuaXplci4gU2ltcGxlIHRvcC1kb3duIHRva2VuaXplcnMgY2FuIGJlIHNldCBlaXRoZXIgdmlhIGBzZXRNb25hcmNoVG9rZW5zUHJvdmlkZXJgXG4gKiBvciBgc2V0VG9rZW5zUHJvdmlkZXJgLlxuICpcbiAqIEZvciB0aGUgYmVzdCB1c2VyIGV4cGVyaWVuY2UsIHJlZ2lzdGVyIGJvdGggYSBzZW1hbnRpYyB0b2tlbnMgcHJvdmlkZXIgYW5kIGEgdG9wLWRvd24gdG9rZW5pemVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJEb2N1bWVudFJhbmdlU2VtYW50aWNUb2tlbnNQcm92aWRlcihsYW5ndWFnZVNlbGVjdG9yOiBMYW5ndWFnZVNlbGVjdG9yLCBwcm92aWRlcjogbGFuZ3VhZ2VzLkRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhbiBpbmxpbmUgY29tcGxldGlvbnMgcHJvdmlkZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlcklubGluZUNvbXBsZXRpb25zUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5JbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IFN0YW5kYWxvbmVTZXJ2aWNlcy5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0cmV0dXJuIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZUNvbXBsZXRpb25zUHJvdmlkZXIucmVnaXN0ZXIobGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXIpO1xufVxuXG4vKipcbiAqIFJlZ2lzdGVyIGFuIGlubGF5IGhpbnRzIHByb3ZpZGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJJbmxheUhpbnRzUHJvdmlkZXIobGFuZ3VhZ2VTZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciwgcHJvdmlkZXI6IGxhbmd1YWdlcy5JbmxheUhpbnRzUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gU3RhbmRhbG9uZVNlcnZpY2VzLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRyZXR1cm4gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5sYXlIaW50c1Byb3ZpZGVyLnJlZ2lzdGVyKGxhbmd1YWdlU2VsZWN0b3IsIHByb3ZpZGVyKTtcbn1cblxuLyoqXG4gKiBDb250YWlucyBhZGRpdGlvbmFsIGRpYWdub3N0aWMgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGNvbnRleHQgaW4gd2hpY2hcbiAqIGEgW2NvZGUgYWN0aW9uXSgjQ29kZUFjdGlvblByb3ZpZGVyLnByb3ZpZGVDb2RlQWN0aW9ucykgaXMgcnVuLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIENvZGVBY3Rpb25Db250ZXh0IHtcblxuXHQvKipcblx0ICogQW4gYXJyYXkgb2YgZGlhZ25vc3RpY3MuXG5cdCAqL1xuXHRyZWFkb25seSBtYXJrZXJzOiBJTWFya2VyRGF0YVtdO1xuXG5cdC8qKlxuXHQgKiBSZXF1ZXN0ZWQga2luZCBvZiBhY3Rpb25zIHRvIHJldHVybi5cblx0ICovXG5cdHJlYWRvbmx5IG9ubHk/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSByZWFzb24gd2h5IGNvZGUgYWN0aW9ucyB3ZXJlIHJlcXVlc3RlZC5cblx0ICovXG5cdHJlYWRvbmx5IHRyaWdnZXI6IGxhbmd1YWdlcy5Db2RlQWN0aW9uVHJpZ2dlclR5cGU7XG59XG5cbi8qKlxuICogVGhlIGNvZGUgYWN0aW9uIGludGVyZmFjZSBkZWZpbmVzIHRoZSBjb250cmFjdCBiZXR3ZWVuIGV4dGVuc2lvbnMgYW5kXG4gKiB0aGUgW2xpZ2h0IGJ1bGJdKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL2VkaXRpbmdldm9sdmVkI19jb2RlLWFjdGlvbikgZmVhdHVyZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBDb2RlQWN0aW9uUHJvdmlkZXIge1xuXHQvKipcblx0ICogUHJvdmlkZSBjb21tYW5kcyBmb3IgdGhlIGdpdmVuIGRvY3VtZW50IGFuZCByYW5nZS5cblx0ICovXG5cdHByb3ZpZGVDb2RlQWN0aW9ucyhtb2RlbDogbW9kZWwuSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlLCBjb250ZXh0OiBDb2RlQWN0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogbGFuZ3VhZ2VzLlByb3ZpZGVyUmVzdWx0PGxhbmd1YWdlcy5Db2RlQWN0aW9uTGlzdD47XG5cblx0LyoqXG5cdCAqIEdpdmVuIGEgY29kZSBhY3Rpb24gZmlsbCBpbiB0aGUgZWRpdC4gV2lsbCBvbmx5IGludm9rZWQgd2hlbiBtaXNzaW5nLlxuXHQgKi9cblx0cmVzb2x2ZUNvZGVBY3Rpb24/KGNvZGVBY3Rpb246IGxhbmd1YWdlcy5Db2RlQWN0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBsYW5ndWFnZXMuUHJvdmlkZXJSZXN1bHQ8bGFuZ3VhZ2VzLkNvZGVBY3Rpb24+O1xufVxuXG5cblxuLyoqXG4gKiBNZXRhZGF0YSBhYm91dCB0aGUgdHlwZSBvZiBjb2RlIGFjdGlvbnMgdGhhdCBhIHtAbGluayBDb2RlQWN0aW9uUHJvdmlkZXJ9IHByb3ZpZGVzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIENvZGVBY3Rpb25Qcm92aWRlck1ldGFkYXRhIHtcblx0LyoqXG5cdCAqIExpc3Qgb2YgY29kZSBhY3Rpb24ga2luZHMgdGhhdCBhIHtAbGluayBDb2RlQWN0aW9uUHJvdmlkZXJ9IG1heSByZXR1cm4uXG5cdCAqXG5cdCAqIFRoaXMgbGlzdCBpcyB1c2VkIHRvIGRldGVybWluZSBpZiBhIGdpdmVuIGBDb2RlQWN0aW9uUHJvdmlkZXJgIHNob3VsZCBiZSBpbnZva2VkIG9yIG5vdC5cblx0ICogVG8gYXZvaWQgdW5uZWNlc3NhcnkgY29tcHV0YXRpb24sIGV2ZXJ5IGBDb2RlQWN0aW9uUHJvdmlkZXJgIHNob3VsZCBsaXN0IHVzZSBgcHJvdmlkZWRDb2RlQWN0aW9uS2luZHNgLiBUaGVcblx0ICogbGlzdCBvZiBraW5kcyBtYXkgZWl0aGVyIGJlIGdlbmVyaWMsIHN1Y2ggYXMgYFtcInF1aWNrZml4XCIsIFwicmVmYWN0b3JcIiwgXCJzb3VyY2VcIl1gLCBvciBsaXN0IG91dCBldmVyeSBraW5kIHByb3ZpZGVkLFxuXHQgKiBzdWNoIGFzIGBbXCJxdWlja2ZpeC5yZW1vdmVMaW5lXCIsIFwic291cmNlLmZpeEFsbFwiIC4uLl1gLlxuXHQgKi9cblx0cmVhZG9ubHkgcHJvdmlkZWRDb2RlQWN0aW9uS2luZHM/OiByZWFkb25seSBzdHJpbmdbXTtcblxuXHRyZWFkb25seSBkb2N1bWVudGF0aW9uPzogUmVhZG9ubHlBcnJheTx7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZzsgcmVhZG9ubHkgY29tbWFuZDogbGFuZ3VhZ2VzLkNvbW1hbmQgfT47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVNb25hY29MYW5ndWFnZXNBUEkoKTogdHlwZW9mIG1vbmFjby5sYW5ndWFnZXMge1xuXHRyZXR1cm4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyOiA8YW55PnJlZ2lzdGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGdldExhbmd1YWdlczogPGFueT5nZXRMYW5ndWFnZXMsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0b25MYW5ndWFnZTogPGFueT5vbkxhbmd1YWdlLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdG9uTGFuZ3VhZ2VFbmNvdW50ZXJlZDogPGFueT5vbkxhbmd1YWdlRW5jb3VudGVyZWQsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Z2V0RW5jb2RlZExhbmd1YWdlSWQ6IDxhbnk+Z2V0RW5jb2RlZExhbmd1YWdlSWQsXG5cblx0XHQvLyBwcm92aWRlciBtZXRob2RzXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0c2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uOiA8YW55PnNldExhbmd1YWdlQ29uZmlndXJhdGlvbixcblx0XHRzZXRDb2xvck1hcDogc2V0Q29sb3JNYXAsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJUb2tlbnNQcm92aWRlckZhY3Rvcnk6IDxhbnk+cmVnaXN0ZXJUb2tlbnNQcm92aWRlckZhY3RvcnksXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0c2V0VG9rZW5zUHJvdmlkZXI6IDxhbnk+c2V0VG9rZW5zUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0c2V0TW9uYXJjaFRva2Vuc1Byb3ZpZGVyOiA8YW55PnNldE1vbmFyY2hUb2tlbnNQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlclJlZmVyZW5jZVByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyUmVmZXJlbmNlUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJSZW5hbWVQcm92aWRlcjogPGFueT5yZWdpc3RlclJlbmFtZVByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyTmV3U3ltYm9sTmFtZVByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyTmV3U3ltYm9sTmFtZVByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyQ29tcGxldGlvbkl0ZW1Qcm92aWRlcjogPGFueT5yZWdpc3RlckNvbXBsZXRpb25JdGVtUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJTaWduYXR1cmVIZWxwUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJTaWduYXR1cmVIZWxwUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJIb3ZlclByb3ZpZGVyOiA8YW55PnJlZ2lzdGVySG92ZXJQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlckRvY3VtZW50U3ltYm9sUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJEb2N1bWVudFN5bWJvbFByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlcjogPGFueT5yZWdpc3RlckRvY3VtZW50SGlnaGxpZ2h0UHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJMaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcjogPGFueT5yZWdpc3RlckxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyRGVmaW5pdGlvblByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVySW1wbGVtZW50YXRpb25Qcm92aWRlcjogPGFueT5yZWdpc3RlckltcGxlbWVudGF0aW9uUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJUeXBlRGVmaW5pdGlvblByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyVHlwZURlZmluaXRpb25Qcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlckNvZGVMZW5zUHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJDb2RlTGVuc1Byb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyQ29kZUFjdGlvblByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyRG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyRG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJEb2N1bWVudFJhbmdlRm9ybWF0dGluZ0VkaXRQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3Rlck9uVHlwZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXI6IDxhbnk+cmVnaXN0ZXJPblR5cGVGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyTGlua1Byb3ZpZGVyOiA8YW55PnJlZ2lzdGVyTGlua1Byb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyQ29sb3JQcm92aWRlcjogPGFueT5yZWdpc3RlckNvbG9yUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJGb2xkaW5nUmFuZ2VQcm92aWRlcjogPGFueT5yZWdpc3RlckZvbGRpbmdSYW5nZVByb3ZpZGVyLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHJlZ2lzdGVyRGVjbGFyYXRpb25Qcm92aWRlcjogPGFueT5yZWdpc3RlckRlY2xhcmF0aW9uUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJTZWxlY3Rpb25SYW5nZVByb3ZpZGVyOiA8YW55PnJlZ2lzdGVyU2VsZWN0aW9uUmFuZ2VQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlckRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcjogPGFueT5yZWdpc3RlckRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlckRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyOiA8YW55PnJlZ2lzdGVyRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zUHJvdmlkZXIsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0cmVnaXN0ZXJJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyOiA8YW55PnJlZ2lzdGVySW5saW5lQ29tcGxldGlvbnNQcm92aWRlcixcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRyZWdpc3RlcklubGF5SGludHNQcm92aWRlcjogPGFueT5yZWdpc3RlcklubGF5SGludHNQcm92aWRlcixcblxuXHRcdC8vIGVudW1zXG5cdFx0RG9jdW1lbnRIaWdobGlnaHRLaW5kOiBzdGFuZGFsb25lRW51bXMuRG9jdW1lbnRIaWdobGlnaHRLaW5kLFxuXHRcdENvbXBsZXRpb25JdGVtS2luZDogc3RhbmRhbG9uZUVudW1zLkNvbXBsZXRpb25JdGVtS2luZCxcblx0XHRDb21wbGV0aW9uSXRlbVRhZzogc3RhbmRhbG9uZUVudW1zLkNvbXBsZXRpb25JdGVtVGFnLFxuXHRcdENvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGU6IHN0YW5kYWxvbmVFbnVtcy5Db21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLFxuXHRcdFN5bWJvbEtpbmQ6IHN0YW5kYWxvbmVFbnVtcy5TeW1ib2xLaW5kLFxuXHRcdFN5bWJvbFRhZzogc3RhbmRhbG9uZUVudW1zLlN5bWJvbFRhZyxcblx0XHRJbmRlbnRBY3Rpb246IHN0YW5kYWxvbmVFbnVtcy5JbmRlbnRBY3Rpb24sXG5cdFx0Q29tcGxldGlvblRyaWdnZXJLaW5kOiBzdGFuZGFsb25lRW51bXMuQ29tcGxldGlvblRyaWdnZXJLaW5kLFxuXHRcdFNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZDogc3RhbmRhbG9uZUVudW1zLlNpZ25hdHVyZUhlbHBUcmlnZ2VyS2luZCxcblx0XHRJbmxheUhpbnRLaW5kOiBzdGFuZGFsb25lRW51bXMuSW5sYXlIaW50S2luZCxcblx0XHRJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQ6IHN0YW5kYWxvbmVFbnVtcy5JbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsXG5cdFx0Q29kZUFjdGlvblRyaWdnZXJUeXBlOiBzdGFuZGFsb25lRW51bXMuQ29kZUFjdGlvblRyaWdnZXJUeXBlLFxuXHRcdE5ld1N5bWJvbE5hbWVUYWc6IHN0YW5kYWxvbmVFbnVtcy5OZXdTeW1ib2xOYW1lVGFnLFxuXHRcdE5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZDogc3RhbmRhbG9uZUVudW1zLk5ld1N5bWJvbE5hbWVUcmlnZ2VyS2luZCxcblx0XHRQYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQ6IHN0YW5kYWxvbmVFbnVtcy5QYXJ0aWFsQWNjZXB0VHJpZ2dlcktpbmQsXG5cdFx0SG92ZXJWZXJib3NpdHlBY3Rpb246IHN0YW5kYWxvbmVFbnVtcy5Ib3ZlclZlcmJvc2l0eUFjdGlvbixcblx0XHRJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZDogc3RhbmRhbG9uZUVudW1zLklubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLFxuXHRcdElubGluZUNvbXBsZXRpb25IaW50U3R5bGU6IHN0YW5kYWxvbmVFbnVtcy5JbmxpbmVDb21wbGV0aW9uSGludFN0eWxlLFxuXG5cdFx0Ly8gY2xhc3Nlc1xuXHRcdEZvbGRpbmdSYW5nZUtpbmQ6IGxhbmd1YWdlcy5Gb2xkaW5nUmFuZ2VLaW5kLFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFNlbGVjdGVkU3VnZ2VzdGlvbkluZm86IDxhbnk+bGFuZ3VhZ2VzLlNlbGVjdGVkU3VnZ2VzdGlvbkluZm8sXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0RWRpdERlbHRhSW5mbzogPGFueT5FZGl0RGVsdGFJbmZvLFxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxhQUFhO0FBR3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixZQUFZLGVBQWU7QUFDM0IsU0FBa0Msd0JBQXdCO0FBRTFELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMscUJBQXFCO0FBRzlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFlB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LElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBO0FBQUEsSUFJQTtBQUFBLElBQ0E7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBRUE7QUFBQTtBQUFBLElBR0EsdUJBQXVCLGdCQUFnQjtBQUFBLElBQ3ZDLG9CQUFvQixnQkFBZ0I7QUFBQSxJQUNwQyxtQkFBbUIsZ0JBQWdCO0FBQUEsSUFDbkMsOEJBQThCLGdCQUFnQjtBQUFBLElBQzlDLFlBQVksZ0JBQWdCO0FBQUEsSUFDNUIsV0FBVyxnQkFBZ0I7QUFBQSxJQUMzQixjQUFjLGdCQUFnQjtBQUFBLElBQzlCLHVCQUF1QixnQkFBZ0I7QUFBQSxJQUN2QywwQkFBMEIsZ0JBQWdCO0FBQUEsSUFDMUMsZUFBZSxnQkFBZ0I7QUFBQSxJQUMvQiw2QkFBNkIsZ0JBQWdCO0FBQUEsSUFDN0MsdUJBQXVCLGdCQUFnQjtBQUFBLElBQ3ZDLGtCQUFrQixnQkFBZ0I7QUFBQSxJQUNsQywwQkFBMEIsZ0JBQWdCO0FBQUEsSUFDMUMsMEJBQTBCLGdCQUFnQjtBQUFBLElBQzFDLHNCQUFzQixnQkFBZ0I7QUFBQSxJQUN0QyxxQ0FBcUMsZ0JBQWdCO0FBQUEsSUFDckQsMkJBQTJCLGdCQUFnQjtBQUFBO0FBQUEsSUFHM0Msa0JBQWtCLFVBQVU7QUFBQTtBQUFBLElBRTVCLHdCQUE2QixVQUFVO0FBQUE7QUFBQSxJQUV2QztBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFsibGFuZ3VhZ2VEZWYiLCAibW9kZWwiXQp9Cg==
