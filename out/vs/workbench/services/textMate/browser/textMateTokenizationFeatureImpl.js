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
import { importAMDNodeModule, resolveAmdNodeModulePath } from "../../../../amdX.js";
import * as domStylesheets from "../../../../base/browser/domStylesheets.js";
import { equals as equalArray } from "../../../../base/common/arrays.js";
import { Color } from "../../../../base/common/color.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from "../../../../base/common/network.js";
import { observableFromEvent } from "../../../../base/common/observable.js";
import { isWeb } from "../../../../base/common/platform.js";
import * as resources from "../../../../base/common/resources.js";
import * as types from "../../../../base/common/types.js";
import { StandardTokenType } from "../../../../editor/common/encodedTokenAttributes.js";
import { LazyTokenizationSupport, TokenizationRegistry } from "../../../../editor/common/languages.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { generateTokensCSSForColorMap, generateTokensCSSForFontMap } from "../../../../editor/common/languages/supports/tokenization.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { TextMateTokenizationSupport } from "./tokenizationSupport/textMateTokenizationSupport.js";
import { TokenizationSupportWithLineLimit } from "./tokenizationSupport/tokenizationSupportWithLineLimit.js";
import { ThreadedBackgroundTokenizerFactory } from "./backgroundTokenization/threadedBackgroundTokenizerFactory.js";
import { TMGrammarFactory, missingTMGrammarErrorMessage } from "../common/TMGrammarFactory.js";
import { grammarsExtPoint } from "../common/TMGrammars.js";
import { IWorkbenchThemeService } from "../../themes/common/workbenchThemeService.js";
let TextMateTokenizationFeature = class extends Disposable {
  constructor(_languageService, _themeService, _extensionResourceLoaderService, _notificationService, _logService, _configurationService, _progressService, _environmentService, _instantiationService, _telemetryService) {
    super();
    this._languageService = _languageService;
    this._themeService = _themeService;
    this._extensionResourceLoaderService = _extensionResourceLoaderService;
    this._notificationService = _notificationService;
    this._logService = _logService;
    this._configurationService = _configurationService;
    this._progressService = _progressService;
    this._environmentService = _environmentService;
    this._instantiationService = _instantiationService;
    this._telemetryService = _telemetryService;
    this._createdModes = [];
    this._encounteredLanguages = [];
    this._debugMode = false;
    this._debugModePrintFunc = () => {
    };
    this._grammarDefinitions = null;
    this._grammarFactory = null;
    this._tokenizersRegistrations = this._register(new DisposableStore());
    this._currentTheme = null;
    this._currentTokenColorMap = null;
    this._currentTokenFontMap = null;
    this._threadedBackgroundTokenizerFactory = this._instantiationService.createInstance(
      ThreadedBackgroundTokenizerFactory,
      (timeMs, languageId, sourceExtensionId, lineLength, isRandomSample) => this._reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, true, isRandomSample),
      () => this.getAsyncTokenizationEnabled()
    );
    this._vscodeOniguruma = null;
    this._styleElement = domStylesheets.createStyleSheet();
    this._styleElement.className = "vscode-tokens-styles";
    grammarsExtPoint.setHandler((extensions) => this._handleGrammarsExtPoint(extensions));
    this._updateTheme(this._themeService.getColorTheme(), true);
    this._register(this._themeService.onDidColorThemeChange(() => {
      this._updateTheme(this._themeService.getColorTheme(), false);
    }));
    this._register(this._languageService.onDidRequestRichLanguageFeatures((languageId) => {
      this._createdModes.push(languageId);
    }));
  }
  getAsyncTokenizationEnabled() {
    return !!this._configurationService.getValue("editor.experimental.asyncTokenization");
  }
  getAsyncTokenizationVerification() {
    return !!this._configurationService.getValue("editor.experimental.asyncTokenizationVerification");
  }
  _handleGrammarsExtPoint(extensions) {
    this._grammarDefinitions = null;
    if (this._grammarFactory) {
      this._grammarFactory.dispose();
      this._grammarFactory = null;
    }
    this._tokenizersRegistrations.clear();
    this._grammarDefinitions = [];
    for (const extension of extensions) {
      const grammars = extension.value;
      for (const grammar of grammars) {
        const validatedGrammar = this._validateGrammarDefinition(extension, grammar);
        if (validatedGrammar) {
          this._grammarDefinitions.push(validatedGrammar);
          if (validatedGrammar.language) {
            const lazyTokenizationSupport = new LazyTokenizationSupport(() => this._createTokenizationSupport(validatedGrammar.language));
            this._tokenizersRegistrations.add(lazyTokenizationSupport);
            this._tokenizersRegistrations.add(TokenizationRegistry.registerFactory(validatedGrammar.language, lazyTokenizationSupport));
          }
        }
      }
    }
    this._threadedBackgroundTokenizerFactory.setGrammarDefinitions(this._grammarDefinitions);
    for (const createdMode of this._createdModes) {
      TokenizationRegistry.getOrCreate(createdMode);
    }
  }
  _validateGrammarDefinition(extension, grammar) {
    if (!validateGrammarExtensionPoint(extension.description.extensionLocation, grammar, extension.collector, this._languageService)) {
      return null;
    }
    const grammarLocation = resources.joinPath(extension.description.extensionLocation, grammar.path);
    const embeddedLanguages = /* @__PURE__ */ Object.create(null);
    if (grammar.embeddedLanguages) {
      const scopes = Object.keys(grammar.embeddedLanguages);
      for (let i = 0, len = scopes.length; i < len; i++) {
        const scope = scopes[i];
        const language = grammar.embeddedLanguages[scope];
        if (typeof language !== "string") {
          continue;
        }
        if (this._languageService.isRegisteredLanguageId(language)) {
          embeddedLanguages[scope] = this._languageService.languageIdCodec.encodeLanguageId(language);
        }
      }
    }
    const tokenTypes = /* @__PURE__ */ Object.create(null);
    if (grammar.tokenTypes) {
      const scopes = Object.keys(grammar.tokenTypes);
      for (const scope of scopes) {
        const tokenType = grammar.tokenTypes[scope];
        switch (tokenType) {
          case "string":
            tokenTypes[scope] = StandardTokenType.String;
            break;
          case "other":
            tokenTypes[scope] = StandardTokenType.Other;
            break;
          case "comment":
            tokenTypes[scope] = StandardTokenType.Comment;
            break;
          case "regex":
            tokenTypes[scope] = StandardTokenType.RegEx;
            break;
        }
      }
    }
    const validLanguageId = grammar.language && this._languageService.isRegisteredLanguageId(grammar.language) ? grammar.language : void 0;
    function asStringArray(array, defaultValue) {
      if (!Array.isArray(array)) {
        return defaultValue;
      }
      if (!array.every((e) => typeof e === "string")) {
        return defaultValue;
      }
      return array;
    }
    return {
      location: grammarLocation,
      language: validLanguageId,
      scopeName: grammar.scopeName,
      embeddedLanguages,
      tokenTypes,
      injectTo: grammar.injectTo,
      balancedBracketSelectors: asStringArray(grammar.balancedBracketScopes, ["*"]),
      unbalancedBracketSelectors: asStringArray(grammar.unbalancedBracketScopes, []),
      sourceExtensionId: extension.description.id
    };
  }
  startDebugMode(printFn, onStop) {
    if (this._debugMode) {
      this._notificationService.error(nls.localize("alreadyDebugging", "Already Logging."));
      return;
    }
    this._debugModePrintFunc = printFn;
    this._debugMode = true;
    if (this._debugMode) {
      this._progressService.withProgress(
        {
          location: ProgressLocation.Notification,
          buttons: [nls.localize("stop", "Stop")]
        },
        (progress) => {
          progress.report({
            message: nls.localize("progress1", "Preparing to log TM Grammar parsing. Press Stop when finished.")
          });
          return this._getVSCodeOniguruma().then((vscodeOniguruma) => {
            vscodeOniguruma.setDefaultDebugCall(true);
            progress.report({
              message: nls.localize("progress2", "Now logging TM Grammar parsing. Press Stop when finished.")
            });
            return new Promise((resolve, reject) => {
            });
          });
        },
        (choice) => {
          this._getVSCodeOniguruma().then((vscodeOniguruma) => {
            this._debugModePrintFunc = () => {
            };
            this._debugMode = false;
            vscodeOniguruma.setDefaultDebugCall(false);
            onStop();
          });
        }
      );
    }
  }
  _canCreateGrammarFactory() {
    return !!this._grammarDefinitions;
  }
  async _getOrCreateGrammarFactory() {
    if (this._grammarFactory) {
      return this._grammarFactory;
    }
    const [vscodeTextmate, vscodeOniguruma] = await Promise.all([importAMDNodeModule("vscode-textmate", "release/main.js"), this._getVSCodeOniguruma()]);
    const onigLib = Promise.resolve({
      createOnigScanner: (sources) => vscodeOniguruma.createOnigScanner(sources),
      createOnigString: (str) => vscodeOniguruma.createOnigString(str)
    });
    if (this._grammarFactory) {
      return this._grammarFactory;
    }
    this._grammarFactory = new TMGrammarFactory({
      logTrace: (msg) => this._logService.trace(msg),
      logError: (msg, err) => this._logService.error(msg, err),
      readFile: (resource) => this._extensionResourceLoaderService.readExtensionResource(resource)
    }, this._grammarDefinitions || [], vscodeTextmate, onigLib);
    this._updateTheme(this._themeService.getColorTheme(), true);
    return this._grammarFactory;
  }
  async _createTokenizationSupport(languageId) {
    if (!this._languageService.isRegisteredLanguageId(languageId)) {
      return null;
    }
    if (!this._canCreateGrammarFactory()) {
      return null;
    }
    try {
      const grammarFactory = await this._getOrCreateGrammarFactory();
      if (!grammarFactory.has(languageId)) {
        return null;
      }
      const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
      const r = await grammarFactory.createGrammar(languageId, encodedLanguageId);
      if (!r.grammar) {
        return null;
      }
      const maxTokenizationLineLength = observableConfigValue(
        "editor.maxTokenizationLineLength",
        languageId,
        -1,
        this._configurationService
      );
      const store = new DisposableStore();
      const tokenization = store.add(new TextMateTokenizationSupport(
        r.grammar,
        r.initialState,
        r.containsEmbeddedLanguages,
        (textModel, tokenStore) => this._threadedBackgroundTokenizerFactory.createBackgroundTokenizer(textModel, tokenStore, maxTokenizationLineLength),
        () => this.getAsyncTokenizationVerification(),
        (timeMs, lineLength, isRandomSample) => {
          this._reportTokenizationTime(timeMs, languageId, r.sourceExtensionId, lineLength, false, isRandomSample);
        },
        true
      ));
      store.add(tokenization.onDidEncounterLanguage((encodedLanguageId2) => {
        if (!this._encounteredLanguages[encodedLanguageId2]) {
          const languageId2 = this._languageService.languageIdCodec.decodeLanguageId(encodedLanguageId2);
          this._encounteredLanguages[encodedLanguageId2] = true;
          this._languageService.requestBasicLanguageFeatures(languageId2);
        }
      }));
      return new TokenizationSupportWithLineLimit(encodedLanguageId, tokenization, store, maxTokenizationLineLength);
    } catch (err) {
      if (err.message && err.message === missingTMGrammarErrorMessage) {
        return null;
      }
      onUnexpectedError(err);
      return null;
    }
  }
  _updateTheme(colorTheme, forceUpdate) {
    if (!forceUpdate && this._currentTheme && this._currentTokenColorMap && equalsTokenRules(this._currentTheme.settings, colorTheme.tokenColors) && equalArray(this._currentTokenColorMap, colorTheme.tokenColorMap) && this._currentTokenFontMap && equalArray(this._currentTokenFontMap, colorTheme.tokenFontMap)) {
      return;
    }
    this._currentTheme = { name: colorTheme.label, settings: colorTheme.tokenColors };
    this._currentTokenColorMap = colorTheme.tokenColorMap;
    this._currentTokenFontMap = colorTheme.tokenFontMap;
    this._grammarFactory?.setTheme(this._currentTheme, this._currentTokenColorMap);
    const colorMap = toColorMap(this._currentTokenColorMap);
    const colorCssRules = generateTokensCSSForColorMap(colorMap);
    const fontCssRules = generateTokensCSSForFontMap(this._currentTokenFontMap);
    this._styleElement.textContent = colorCssRules + fontCssRules;
    TokenizationRegistry.setColorMap(colorMap);
    if (this._currentTheme && this._currentTokenColorMap) {
      this._threadedBackgroundTokenizerFactory.acceptTheme(this._currentTheme, this._currentTokenColorMap);
    }
  }
  async createTokenizer(languageId) {
    if (!this._languageService.isRegisteredLanguageId(languageId)) {
      return null;
    }
    const grammarFactory = await this._getOrCreateGrammarFactory();
    if (!grammarFactory.has(languageId)) {
      return null;
    }
    const encodedLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
    const { grammar } = await grammarFactory.createGrammar(languageId, encodedLanguageId);
    return grammar;
  }
  _getVSCodeOniguruma() {
    if (!this._vscodeOniguruma) {
      this._vscodeOniguruma = (async () => {
        const [vscodeOniguruma, wasm] = await Promise.all([importAMDNodeModule("vscode-oniguruma", "release/main.js"), this._loadVSCodeOnigurumaWASM()]);
        await vscodeOniguruma.loadWASM({
          data: wasm,
          print: (str) => {
            this._debugModePrintFunc(str);
          }
        });
        return vscodeOniguruma;
      })();
    }
    return this._vscodeOniguruma;
  }
  async _loadVSCodeOnigurumaWASM() {
    if (isWeb) {
      const response = await fetch(resolveAmdNodeModulePath("vscode-oniguruma", "release/onig.wasm"));
      return await response.arrayBuffer();
    } else {
      const response = await fetch(this._environmentService.isBuilt ? FileAccess.asBrowserUri(`${nodeModulesAsarUnpackedPath}/vscode-oniguruma/release/onig.wasm`).toString(true) : FileAccess.asBrowserUri(`${nodeModulesPath}/vscode-oniguruma/release/onig.wasm`).toString(true));
      return response;
    }
  }
  _reportTokenizationTime(timeMs, languageId, sourceExtensionId, lineLength, fromWorker, isRandomSample) {
    const key = fromWorker ? "async" : "sync";
    if (TextMateTokenizationFeature.reportTokenizationTimeCounter[key] > 50) {
      return;
    }
    if (TextMateTokenizationFeature.reportTokenizationTimeCounter[key] === 0) {
      setTimeout(() => {
        TextMateTokenizationFeature.reportTokenizationTimeCounter[key] = 0;
      }, 1e3 * 60 * 60);
    }
    TextMateTokenizationFeature.reportTokenizationTimeCounter[key]++;
    this._telemetryService.publicLog2("editor.tokenizedLine", {
      timeMs,
      languageId,
      lineLength,
      fromWorker,
      sourceExtensionId,
      isRandomSample,
      tokenizationSetting: this.getAsyncTokenizationEnabled() ? this.getAsyncTokenizationVerification() ? 2 : 1 : 0
    });
  }
};
TextMateTokenizationFeature.reportTokenizationTimeCounter = { sync: 0, async: 0 };
TextMateTokenizationFeature = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IExtensionResourceLoaderService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, IWorkbenchEnvironmentService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, ITelemetryService)
], TextMateTokenizationFeature);
function toColorMap(colorMap) {
  const result = [null];
  for (let i = 1, len = colorMap.length; i < len; i++) {
    result[i] = Color.fromHex(colorMap[i]);
  }
  return result;
}
function equalsTokenRules(a, b) {
  if (!b || !a || b.length !== a.length) {
    return false;
  }
  for (let i = b.length - 1; i >= 0; i--) {
    const r1 = b[i];
    const r2 = a[i];
    if (r1.scope !== r2.scope) {
      return false;
    }
    const s1 = r1.settings;
    const s2 = r2.settings;
    if (s1 && s2) {
      if (s1.fontStyle !== s2.fontStyle || s1.foreground !== s2.foreground || s1.background !== s2.background || s1.lineHeight !== s2.lineHeight || s1.fontSize !== s2.fontSize || s1.fontFamily !== s2.fontFamily) {
        return false;
      }
    } else if (!s1 || !s2) {
      return false;
    }
  }
  return true;
}
function validateGrammarExtensionPoint(extensionLocation, syntax, collector, _languageService) {
  if (syntax.language && (typeof syntax.language !== "string" || !_languageService.isRegisteredLanguageId(syntax.language))) {
    collector.error(nls.localize("invalid.language", "Unknown language in `contributes.{0}.language`. Provided value: {1}", grammarsExtPoint.name, String(syntax.language)));
    return false;
  }
  if (!syntax.scopeName || typeof syntax.scopeName !== "string") {
    collector.error(nls.localize("invalid.scopeName", "Expected string in `contributes.{0}.scopeName`. Provided value: {1}", grammarsExtPoint.name, String(syntax.scopeName)));
    return false;
  }
  if (!syntax.path || typeof syntax.path !== "string") {
    collector.error(nls.localize("invalid.path.0", "Expected string in `contributes.{0}.path`. Provided value: {1}", grammarsExtPoint.name, String(syntax.path)));
    return false;
  }
  if (syntax.injectTo && (!Array.isArray(syntax.injectTo) || syntax.injectTo.some((scope) => typeof scope !== "string"))) {
    collector.error(nls.localize("invalid.injectTo", "Invalid value in `contributes.{0}.injectTo`. Must be an array of language scope names. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.injectTo)));
    return false;
  }
  if (syntax.embeddedLanguages && !types.isObject(syntax.embeddedLanguages)) {
    collector.error(nls.localize("invalid.embeddedLanguages", "Invalid value in `contributes.{0}.embeddedLanguages`. Must be an object map from scope name to language. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.embeddedLanguages)));
    return false;
  }
  if (syntax.tokenTypes && !types.isObject(syntax.tokenTypes)) {
    collector.error(nls.localize("invalid.tokenTypes", "Invalid value in `contributes.{0}.tokenTypes`. Must be an object map from scope name to token type. Provided value: {1}", grammarsExtPoint.name, JSON.stringify(syntax.tokenTypes)));
    return false;
  }
  const grammarLocation = resources.joinPath(extensionLocation, syntax.path);
  if (!resources.isEqualOrParent(grammarLocation, extensionLocation)) {
    collector.warn(nls.localize("invalid.path.1", "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", grammarsExtPoint.name, grammarLocation.path, extensionLocation.path));
  }
  return true;
}
function observableConfigValue(key, languageId, defaultValue, configurationService) {
  return observableFromEvent(
    (handleChange) => configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(key, { overrideIdentifier: languageId })) {
        handleChange(e);
      }
    }),
    () => configurationService.getValue(key, { overrideIdentifier: languageId }) ?? defaultValue
  );
}
export {
  TextMateTokenizationFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0TWF0ZVxcYnJvd3NlclxcdGV4dE1hdGVUb2tlbml6YXRpb25GZWF0dXJlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUsIHJlc29sdmVBbWROb2RlTW9kdWxlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IGVxdWFscyBhcyBlcXVhbEFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzLCBub2RlTW9kdWxlc0FzYXJVbnBhY2tlZFBhdGgsIG5vZGVNb2R1bGVzUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRUb2tlblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSVRva2VuaXphdGlvblN1cHBvcnQsIExhenlUb2tlbml6YXRpb25TdXBwb3J0LCBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwLCBnZW5lcmF0ZVRva2Vuc0NTU0ZvckZvbnRNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy90b2tlbml6YXRpb24uanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IsIElFeHRlbnNpb25Qb2ludFVzZXIgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNYXRlVG9rZW5pemF0aW9uU2VydmljZSB9IGZyb20gJy4vdGV4dE1hdGVUb2tlbml6YXRpb25GZWF0dXJlLmpzJztcbmltcG9ydCB7IFRleHRNYXRlVG9rZW5pemF0aW9uU3VwcG9ydCB9IGZyb20gJy4vdG9rZW5pemF0aW9uU3VwcG9ydC90ZXh0TWF0ZVRva2VuaXphdGlvblN1cHBvcnQuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uU3VwcG9ydFdpdGhMaW5lTGltaXQgfSBmcm9tICcuL3Rva2VuaXphdGlvblN1cHBvcnQvdG9rZW5pemF0aW9uU3VwcG9ydFdpdGhMaW5lTGltaXQuanMnO1xuaW1wb3J0IHsgVGhyZWFkZWRCYWNrZ3JvdW5kVG9rZW5pemVyRmFjdG9yeSB9IGZyb20gJy4vYmFja2dyb3VuZFRva2VuaXphdGlvbi90aHJlYWRlZEJhY2tncm91bmRUb2tlbml6ZXJGYWN0b3J5LmpzJztcbmltcG9ydCB7IFRNR3JhbW1hckZhY3RvcnksIG1pc3NpbmdUTUdyYW1tYXJFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi9jb21tb24vVE1HcmFtbWFyRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJVE1TeW50YXhFeHRlbnNpb25Qb2ludCwgZ3JhbW1hcnNFeHRQb2ludCB9IGZyb20gJy4uL2NvbW1vbi9UTUdyYW1tYXJzLmpzJztcbmltcG9ydCB7IElWYWxpZEVtYmVkZGVkTGFuZ3VhZ2VzTWFwLCBJVmFsaWRHcmFtbWFyRGVmaW5pdGlvbiwgSVZhbGlkVG9rZW5UeXBlTWFwIH0gZnJvbSAnLi4vY29tbW9uL1RNU2NvcGVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1hdGVUaGVtaW5nUnVsZSwgSVdvcmtiZW5jaENvbG9yVGhlbWUsIElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi90aGVtZXMvY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElHcmFtbWFyLCBJT25pZ0xpYiwgSVJhd1RoZW1lIH0gZnJvbSAndnNjb2RlLXRleHRtYXRlJztcbmltcG9ydCB7IElGb250VG9rZW5PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXh0TWF0ZVRva2VuaXphdGlvbkZlYXR1cmUgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRleHRNYXRlVG9rZW5pemF0aW9uU2VydmljZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlcG9ydFRva2VuaXphdGlvblRpbWVDb3VudGVyID0geyBzeW5jOiAwLCBhc3luYzogMCB9O1xuXHRwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0eWxlRWxlbWVudDogSFRNTFN0eWxlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY3JlYXRlZE1vZGVzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZW5jb3VudGVyZWRMYW5ndWFnZXM6IGJvb2xlYW5bXTtcblxuXHRwcml2YXRlIF9kZWJ1Z01vZGU6IGJvb2xlYW47XG5cdHByaXZhdGUgX2RlYnVnTW9kZVByaW50RnVuYzogKHN0cjogc3RyaW5nKSA9PiB2b2lkO1xuXG5cdHByaXZhdGUgX2dyYW1tYXJEZWZpbml0aW9uczogSVZhbGlkR3JhbW1hckRlZmluaXRpb25bXSB8IG51bGw7XG5cdHByaXZhdGUgX2dyYW1tYXJGYWN0b3J5OiBUTUdyYW1tYXJGYWN0b3J5IHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5pemVyc1JlZ2lzdHJhdGlvbnM7XG5cdHByaXZhdGUgX2N1cnJlbnRUaGVtZTogSVJhd1RoZW1lIHwgbnVsbDtcblx0cHJpdmF0ZSBfY3VycmVudFRva2VuQ29sb3JNYXA6IHN0cmluZ1tdIHwgbnVsbDtcblx0cHJpdmF0ZSBfY3VycmVudFRva2VuRm9udE1hcDogSUZvbnRUb2tlbk9wdGlvbnNbXSB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RocmVhZGVkQmFja2dyb3VuZFRva2VuaXplckZhY3Rvcnk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVdvcmtiZW5jaFRoZW1lU2VydmljZSxcblx0XHRASUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2U6IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NyZWF0ZWRNb2RlcyA9IFtdO1xuXHRcdHRoaXMuX2VuY291bnRlcmVkTGFuZ3VhZ2VzID0gW107XG5cdFx0dGhpcy5fZGVidWdNb2RlID0gZmFsc2U7XG5cdFx0dGhpcy5fZGVidWdNb2RlUHJpbnRGdW5jID0gKCkgPT4geyB9O1xuXHRcdHRoaXMuX2dyYW1tYXJEZWZpbml0aW9ucyA9IG51bGw7XG5cdFx0dGhpcy5fZ3JhbW1hckZhY3RvcnkgPSBudWxsO1xuXHRcdHRoaXMuX3Rva2VuaXplcnNSZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHR0aGlzLl9jdXJyZW50VGhlbWUgPSBudWxsO1xuXHRcdHRoaXMuX2N1cnJlbnRUb2tlbkNvbG9yTWFwID0gbnVsbDtcblx0XHR0aGlzLl9jdXJyZW50VG9rZW5Gb250TWFwID0gbnVsbDtcblx0XHR0aGlzLl90aHJlYWRlZEJhY2tncm91bmRUb2tlbml6ZXJGYWN0b3J5ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRUaHJlYWRlZEJhY2tncm91bmRUb2tlbml6ZXJGYWN0b3J5LFxuXHRcdFx0KHRpbWVNcywgbGFuZ3VhZ2VJZCwgc291cmNlRXh0ZW5zaW9uSWQsIGxpbmVMZW5ndGgsIGlzUmFuZG9tU2FtcGxlKSA9PiB0aGlzLl9yZXBvcnRUb2tlbml6YXRpb25UaW1lKHRpbWVNcywgbGFuZ3VhZ2VJZCwgc291cmNlRXh0ZW5zaW9uSWQsIGxpbmVMZW5ndGgsIHRydWUsIGlzUmFuZG9tU2FtcGxlKSxcblx0XHRcdCgpID0+IHRoaXMuZ2V0QXN5bmNUb2tlbml6YXRpb25FbmFibGVkKCksXG5cdFx0KTtcblx0XHR0aGlzLl92c2NvZGVPbmlndXJ1bWEgPSBudWxsO1xuXG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50ID0gZG9tU3R5bGVzaGVldHMuY3JlYXRlU3R5bGVTaGVldCgpO1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudC5jbGFzc05hbWUgPSAndnNjb2RlLXRva2Vucy1zdHlsZXMnO1xuXG5cdFx0Z3JhbW1hcnNFeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zKSA9PiB0aGlzLl9oYW5kbGVHcmFtbWFyc0V4dFBvaW50KGV4dGVuc2lvbnMpKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVRoZW1lKHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCksIHRydWUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlVGhlbWUodGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSwgZmFsc2UpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhbmd1YWdlU2VydmljZS5vbkRpZFJlcXVlc3RSaWNoTGFuZ3VhZ2VGZWF0dXJlcygobGFuZ3VhZ2VJZCkgPT4ge1xuXHRcdFx0dGhpcy5fY3JlYXRlZE1vZGVzLnB1c2gobGFuZ3VhZ2VJZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBc3luY1Rva2VuaXphdGlvbkVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5leHBlcmltZW50YWwuYXN5bmNUb2tlbml6YXRpb24nKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXN5bmNUb2tlbml6YXRpb25WZXJpZmljYXRpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5leHBlcmltZW50YWwuYXN5bmNUb2tlbml6YXRpb25WZXJpZmljYXRpb24nKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUdyYW1tYXJzRXh0UG9pbnQoZXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvblBvaW50VXNlcjxJVE1TeW50YXhFeHRlbnNpb25Qb2ludFtdPltdKTogdm9pZCB7XG5cdFx0dGhpcy5fZ3JhbW1hckRlZmluaXRpb25zID0gbnVsbDtcblx0XHRpZiAodGhpcy5fZ3JhbW1hckZhY3RvcnkpIHtcblx0XHRcdHRoaXMuX2dyYW1tYXJGYWN0b3J5LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2dyYW1tYXJGYWN0b3J5ID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fdG9rZW5pemVyc1JlZ2lzdHJhdGlvbnMuY2xlYXIoKTtcblxuXHRcdHRoaXMuX2dyYW1tYXJEZWZpbml0aW9ucyA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdGNvbnN0IGdyYW1tYXJzID0gZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0Zm9yIChjb25zdCBncmFtbWFyIG9mIGdyYW1tYXJzKSB7XG5cdFx0XHRcdGNvbnN0IHZhbGlkYXRlZEdyYW1tYXIgPSB0aGlzLl92YWxpZGF0ZUdyYW1tYXJEZWZpbml0aW9uKGV4dGVuc2lvbiwgZ3JhbW1hcik7XG5cdFx0XHRcdGlmICh2YWxpZGF0ZWRHcmFtbWFyKSB7XG5cdFx0XHRcdFx0dGhpcy5fZ3JhbW1hckRlZmluaXRpb25zLnB1c2godmFsaWRhdGVkR3JhbW1hcik7XG5cdFx0XHRcdFx0aWYgKHZhbGlkYXRlZEdyYW1tYXIubGFuZ3VhZ2UpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhenlUb2tlbml6YXRpb25TdXBwb3J0ID0gbmV3IExhenlUb2tlbml6YXRpb25TdXBwb3J0KCgpID0+IHRoaXMuX2NyZWF0ZVRva2VuaXphdGlvblN1cHBvcnQodmFsaWRhdGVkR3JhbW1hci5sYW5ndWFnZSEpKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Rva2VuaXplcnNSZWdpc3RyYXRpb25zLmFkZChsYXp5VG9rZW5pemF0aW9uU3VwcG9ydCk7XG5cdFx0XHRcdFx0XHR0aGlzLl90b2tlbml6ZXJzUmVnaXN0cmF0aW9ucy5hZGQoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXJGYWN0b3J5KHZhbGlkYXRlZEdyYW1tYXIubGFuZ3VhZ2UsIGxhenlUb2tlbml6YXRpb25TdXBwb3J0KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGhyZWFkZWRCYWNrZ3JvdW5kVG9rZW5pemVyRmFjdG9yeS5zZXRHcmFtbWFyRGVmaW5pdGlvbnModGhpcy5fZ3JhbW1hckRlZmluaXRpb25zKTtcblxuXHRcdGZvciAoY29uc3QgY3JlYXRlZE1vZGUgb2YgdGhpcy5fY3JlYXRlZE1vZGVzKSB7XG5cdFx0XHRUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRPckNyZWF0ZShjcmVhdGVkTW9kZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVHcmFtbWFyRGVmaW5pdGlvbihleHRlbnNpb246IElFeHRlbnNpb25Qb2ludFVzZXI8SVRNU3ludGF4RXh0ZW5zaW9uUG9pbnRbXT4sIGdyYW1tYXI6IElUTVN5bnRheEV4dGVuc2lvblBvaW50KTogSVZhbGlkR3JhbW1hckRlZmluaXRpb24gfCBudWxsIHtcblx0XHRpZiAoIXZhbGlkYXRlR3JhbW1hckV4dGVuc2lvblBvaW50KGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgZ3JhbW1hciwgZXh0ZW5zaW9uLmNvbGxlY3RvciwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JhbW1hckxvY2F0aW9uID0gcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgZ3JhbW1hci5wYXRoKTtcblxuXHRcdGNvbnN0IGVtYmVkZGVkTGFuZ3VhZ2VzOiBJVmFsaWRFbWJlZGRlZExhbmd1YWdlc01hcCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0aWYgKGdyYW1tYXIuZW1iZWRkZWRMYW5ndWFnZXMpIHtcblx0XHRcdGNvbnN0IHNjb3BlcyA9IE9iamVjdC5rZXlzKGdyYW1tYXIuZW1iZWRkZWRMYW5ndWFnZXMpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNjb3Blcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBzY29wZSA9IHNjb3Blc1tpXTtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBncmFtbWFyLmVtYmVkZGVkTGFuZ3VhZ2VzW3Njb3BlXTtcblx0XHRcdFx0aWYgKHR5cGVvZiBsYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHQvLyBuZXZlciBodXJ0cyB0byBiZSB0b28gY2FyZWZ1bFxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl9sYW5ndWFnZVNlcnZpY2UuaXNSZWdpc3RlcmVkTGFuZ3VhZ2VJZChsYW5ndWFnZSkpIHtcblx0XHRcdFx0XHRlbWJlZGRlZExhbmd1YWdlc1tzY29wZV0gPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9rZW5UeXBlczogSVZhbGlkVG9rZW5UeXBlTWFwID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRpZiAoZ3JhbW1hci50b2tlblR5cGVzKSB7XG5cdFx0XHRjb25zdCBzY29wZXMgPSBPYmplY3Qua2V5cyhncmFtbWFyLnRva2VuVHlwZXMpO1xuXHRcdFx0Zm9yIChjb25zdCBzY29wZSBvZiBzY29wZXMpIHtcblx0XHRcdFx0Y29uc3QgdG9rZW5UeXBlID0gZ3JhbW1hci50b2tlblR5cGVzW3Njb3BlXTtcblx0XHRcdFx0c3dpdGNoICh0b2tlblR5cGUpIHtcblx0XHRcdFx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0XHRcdFx0dG9rZW5UeXBlc1tzY29wZV0gPSBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdvdGhlcic6XG5cdFx0XHRcdFx0XHR0b2tlblR5cGVzW3Njb3BlXSA9IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnY29tbWVudCc6XG5cdFx0XHRcdFx0XHR0b2tlblR5cGVzW3Njb3BlXSA9IFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyZWdleCc6XG5cdFx0XHRcdFx0XHR0b2tlblR5cGVzW3Njb3BlXSA9IFN0YW5kYXJkVG9rZW5UeXBlLlJlZ0V4O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB2YWxpZExhbmd1YWdlSWQgPSBncmFtbWFyLmxhbmd1YWdlICYmIHRoaXMuX2xhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGdyYW1tYXIubGFuZ3VhZ2UpID8gZ3JhbW1hci5sYW5ndWFnZSA6IHVuZGVmaW5lZDtcblxuXHRcdGZ1bmN0aW9uIGFzU3RyaW5nQXJyYXkoYXJyYXk6IHVua25vd24sIGRlZmF1bHRWYWx1ZTogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoYXJyYXkpKSB7XG5cdFx0XHRcdHJldHVybiBkZWZhdWx0VmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWFycmF5LmV2ZXJ5KGUgPT4gdHlwZW9mIGUgPT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGFycmF5O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRsb2NhdGlvbjogZ3JhbW1hckxvY2F0aW9uLFxuXHRcdFx0bGFuZ3VhZ2U6IHZhbGlkTGFuZ3VhZ2VJZCxcblx0XHRcdHNjb3BlTmFtZTogZ3JhbW1hci5zY29wZU5hbWUsXG5cdFx0XHRlbWJlZGRlZExhbmd1YWdlczogZW1iZWRkZWRMYW5ndWFnZXMsXG5cdFx0XHR0b2tlblR5cGVzOiB0b2tlblR5cGVzLFxuXHRcdFx0aW5qZWN0VG86IGdyYW1tYXIuaW5qZWN0VG8sXG5cdFx0XHRiYWxhbmNlZEJyYWNrZXRTZWxlY3RvcnM6IGFzU3RyaW5nQXJyYXkoZ3JhbW1hci5iYWxhbmNlZEJyYWNrZXRTY29wZXMsIFsnKiddKSxcblx0XHRcdHVuYmFsYW5jZWRCcmFja2V0U2VsZWN0b3JzOiBhc1N0cmluZ0FycmF5KGdyYW1tYXIudW5iYWxhbmNlZEJyYWNrZXRTY29wZXMsIFtdKSxcblx0XHRcdHNvdXJjZUV4dGVuc2lvbklkOiBleHRlbnNpb24uZGVzY3JpcHRpb24uaWQsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzdGFydERlYnVnTW9kZShwcmludEZuOiAoc3RyOiBzdHJpbmcpID0+IHZvaWQsIG9uU3RvcDogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kZWJ1Z01vZGUpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdhbHJlYWR5RGVidWdnaW5nJywgXCJBbHJlYWR5IExvZ2dpbmcuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9kZWJ1Z01vZGVQcmludEZ1bmMgPSBwcmludEZuO1xuXHRcdHRoaXMuX2RlYnVnTW9kZSA9IHRydWU7XG5cblx0XHRpZiAodGhpcy5fZGVidWdNb2RlKSB7XG5cdFx0XHR0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdGJ1dHRvbnM6IFtubHMubG9jYWxpemUoJ3N0b3AnLCBcIlN0b3BcIildXG5cdFx0XHRcdH0sXG5cdFx0XHRcdChwcm9ncmVzcykgPT4ge1xuXHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7XG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3Byb2dyZXNzMScsIFwiUHJlcGFyaW5nIHRvIGxvZyBUTSBHcmFtbWFyIHBhcnNpbmcuIFByZXNzIFN0b3Agd2hlbiBmaW5pc2hlZC5cIilcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9nZXRWU0NvZGVPbmlndXJ1bWEoKS50aGVuKCh2c2NvZGVPbmlndXJ1bWEpID0+IHtcblx0XHRcdFx0XHRcdHZzY29kZU9uaWd1cnVtYS5zZXREZWZhdWx0RGVidWdDYWxsKHRydWUpO1xuXHRcdFx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHtcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdwcm9ncmVzczInLCBcIk5vdyBsb2dnaW5nIFRNIEdyYW1tYXIgcGFyc2luZy4gUHJlc3MgU3RvcCB3aGVuIGZpbmlzaGVkLlwiKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4geyB9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0KGNob2ljZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2dldFZTQ29kZU9uaWd1cnVtYSgpLnRoZW4oKHZzY29kZU9uaWd1cnVtYSkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVidWdNb2RlUHJpbnRGdW5jID0gKCkgPT4geyB9O1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVidWdNb2RlID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR2c2NvZGVPbmlndXJ1bWEuc2V0RGVmYXVsdERlYnVnQ2FsbChmYWxzZSk7XG5cdFx0XHRcdFx0XHRvblN0b3AoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jYW5DcmVhdGVHcmFtbWFyRmFjdG9yeSgpOiBib29sZWFuIHtcblx0XHQvLyBDaGVjayBpZiBleHRlbnNpb24gcG9pbnQgaXMgcmVhZHlcblx0XHRyZXR1cm4gISF0aGlzLl9ncmFtbWFyRGVmaW5pdGlvbnM7XG5cdH1cblx0cHJpdmF0ZSBhc3luYyBfZ2V0T3JDcmVhdGVHcmFtbWFyRmFjdG9yeSgpOiBQcm9taXNlPFRNR3JhbW1hckZhY3Rvcnk+IHtcblx0XHRpZiAodGhpcy5fZ3JhbW1hckZhY3RvcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9ncmFtbWFyRmFjdG9yeTtcblx0XHR9XG5cblx0XHRjb25zdCBbdnNjb2RlVGV4dG1hdGUsIHZzY29kZU9uaWd1cnVtYV0gPSBhd2FpdCBQcm9taXNlLmFsbChbaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCd2c2NvZGUtdGV4dG1hdGUnKT4oJ3ZzY29kZS10ZXh0bWF0ZScsICdyZWxlYXNlL21haW4uanMnKSwgdGhpcy5fZ2V0VlNDb2RlT25pZ3VydW1hKCldKTtcblx0XHRjb25zdCBvbmlnTGliOiBQcm9taXNlPElPbmlnTGliPiA9IFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRjcmVhdGVPbmlnU2Nhbm5lcjogKHNvdXJjZXM6IHN0cmluZ1tdKSA9PiB2c2NvZGVPbmlndXJ1bWEuY3JlYXRlT25pZ1NjYW5uZXIoc291cmNlcyksXG5cdFx0XHRjcmVhdGVPbmlnU3RyaW5nOiAoc3RyOiBzdHJpbmcpID0+IHZzY29kZU9uaWd1cnVtYS5jcmVhdGVPbmlnU3RyaW5nKHN0cilcblx0XHR9KTtcblxuXHRcdC8vIEF2b2lkIGR1cGxpY2F0ZSBpbnN0YW50aWF0aW9uc1xuXHRcdGlmICh0aGlzLl9ncmFtbWFyRmFjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dyYW1tYXJGYWN0b3J5O1xuXHRcdH1cblxuXHRcdHRoaXMuX2dyYW1tYXJGYWN0b3J5ID0gbmV3IFRNR3JhbW1hckZhY3Rvcnkoe1xuXHRcdFx0bG9nVHJhY2U6IChtc2c6IHN0cmluZykgPT4gdGhpcy5fbG9nU2VydmljZS50cmFjZShtc2cpLFxuXHRcdFx0bG9nRXJyb3I6IChtc2c6IHN0cmluZywgZXJyOiB1bmtub3duKSA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKG1zZywgZXJyKSxcblx0XHRcdHJlYWRGaWxlOiAocmVzb3VyY2U6IFVSSSkgPT4gdGhpcy5fZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLnJlYWRFeHRlbnNpb25SZXNvdXJjZShyZXNvdXJjZSlcblx0XHR9LCB0aGlzLl9ncmFtbWFyRGVmaW5pdGlvbnMgfHwgW10sIHZzY29kZVRleHRtYXRlLCBvbmlnTGliKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVRoZW1lKHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCksIHRydWUpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2dyYW1tYXJGYWN0b3J5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlVG9rZW5pemF0aW9uU3VwcG9ydChsYW5ndWFnZUlkOiBzdHJpbmcpOiBQcm9taXNlPElUb2tlbml6YXRpb25TdXBwb3J0ICYgSURpc3Bvc2FibGUgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLl9sYW5ndWFnZVNlcnZpY2UuaXNSZWdpc3RlcmVkTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fY2FuQ3JlYXRlR3JhbW1hckZhY3RvcnkoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGdyYW1tYXJGYWN0b3J5ID0gYXdhaXQgdGhpcy5fZ2V0T3JDcmVhdGVHcmFtbWFyRmFjdG9yeSgpO1xuXHRcdFx0aWYgKCFncmFtbWFyRmFjdG9yeS5oYXMobGFuZ3VhZ2VJZCkpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbmNvZGVkTGFuZ3VhZ2VJZCA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKTtcblx0XHRcdGNvbnN0IHIgPSBhd2FpdCBncmFtbWFyRmFjdG9yeS5jcmVhdGVHcmFtbWFyKGxhbmd1YWdlSWQsIGVuY29kZWRMYW5ndWFnZUlkKTtcblx0XHRcdGlmICghci5ncmFtbWFyKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCA9IG9ic2VydmFibGVDb25maWdWYWx1ZTxudW1iZXI+KFxuXHRcdFx0XHQnZWRpdG9yLm1heFRva2VuaXphdGlvbkxpbmVMZW5ndGgnLFxuXHRcdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0XHQtMSxcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHRva2VuaXphdGlvbiA9IHN0b3JlLmFkZChuZXcgVGV4dE1hdGVUb2tlbml6YXRpb25TdXBwb3J0KFxuXHRcdFx0XHRyLmdyYW1tYXIsXG5cdFx0XHRcdHIuaW5pdGlhbFN0YXRlLFxuXHRcdFx0XHRyLmNvbnRhaW5zRW1iZWRkZWRMYW5ndWFnZXMsXG5cdFx0XHRcdCh0ZXh0TW9kZWwsIHRva2VuU3RvcmUpID0+IHRoaXMuX3RocmVhZGVkQmFja2dyb3VuZFRva2VuaXplckZhY3RvcnkuY3JlYXRlQmFja2dyb3VuZFRva2VuaXplcih0ZXh0TW9kZWwsIHRva2VuU3RvcmUsIG1heFRva2VuaXphdGlvbkxpbmVMZW5ndGgpLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmdldEFzeW5jVG9rZW5pemF0aW9uVmVyaWZpY2F0aW9uKCksXG5cdFx0XHRcdCh0aW1lTXMsIGxpbmVMZW5ndGgsIGlzUmFuZG9tU2FtcGxlKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3J0VG9rZW5pemF0aW9uVGltZSh0aW1lTXMsIGxhbmd1YWdlSWQsIHIuc291cmNlRXh0ZW5zaW9uSWQsIGxpbmVMZW5ndGgsIGZhbHNlLCBpc1JhbmRvbVNhbXBsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRydWUsXG5cdFx0XHQpKTtcblx0XHRcdHN0b3JlLmFkZCh0b2tlbml6YXRpb24ub25EaWRFbmNvdW50ZXJMYW5ndWFnZSgoZW5jb2RlZExhbmd1YWdlSWQpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9lbmNvdW50ZXJlZExhbmd1YWdlc1tlbmNvZGVkTGFuZ3VhZ2VJZF0pIHtcblx0XHRcdFx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYy5kZWNvZGVMYW5ndWFnZUlkKGVuY29kZWRMYW5ndWFnZUlkKTtcblx0XHRcdFx0XHR0aGlzLl9lbmNvdW50ZXJlZExhbmd1YWdlc1tlbmNvZGVkTGFuZ3VhZ2VJZF0gPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZS5yZXF1ZXN0QmFzaWNMYW5ndWFnZUZlYXR1cmVzKGxhbmd1YWdlSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJldHVybiBuZXcgVG9rZW5pemF0aW9uU3VwcG9ydFdpdGhMaW5lTGltaXQoZW5jb2RlZExhbmd1YWdlSWQsIHRva2VuaXphdGlvbiwgc3RvcmUsIG1heFRva2VuaXphdGlvbkxpbmVMZW5ndGgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVyci5tZXNzYWdlICYmIGVyci5tZXNzYWdlID09PSBtaXNzaW5nVE1HcmFtbWFyRXJyb3JNZXNzYWdlKSB7XG5cdFx0XHRcdC8vIERvbid0IGxvZyB0aGlzIGVycm9yIG1lc3NhZ2Vcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGhlbWUoY29sb3JUaGVtZTogSVdvcmtiZW5jaENvbG9yVGhlbWUsIGZvcmNlVXBkYXRlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFmb3JjZVVwZGF0ZSAmJiB0aGlzLl9jdXJyZW50VGhlbWUgJiYgdGhpcy5fY3VycmVudFRva2VuQ29sb3JNYXAgJiYgZXF1YWxzVG9rZW5SdWxlcyh0aGlzLl9jdXJyZW50VGhlbWUuc2V0dGluZ3MsIGNvbG9yVGhlbWUudG9rZW5Db2xvcnMpXG5cdFx0XHQmJiBlcXVhbEFycmF5KHRoaXMuX2N1cnJlbnRUb2tlbkNvbG9yTWFwLCBjb2xvclRoZW1lLnRva2VuQ29sb3JNYXApICYmIHRoaXMuX2N1cnJlbnRUb2tlbkZvbnRNYXAgJiYgZXF1YWxBcnJheSh0aGlzLl9jdXJyZW50VG9rZW5Gb250TWFwLCBjb2xvclRoZW1lLnRva2VuRm9udE1hcCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudFRoZW1lID0geyBuYW1lOiBjb2xvclRoZW1lLmxhYmVsLCBzZXR0aW5nczogY29sb3JUaGVtZS50b2tlbkNvbG9ycyB9O1xuXHRcdHRoaXMuX2N1cnJlbnRUb2tlbkNvbG9yTWFwID0gY29sb3JUaGVtZS50b2tlbkNvbG9yTWFwO1xuXHRcdHRoaXMuX2N1cnJlbnRUb2tlbkZvbnRNYXAgPSBjb2xvclRoZW1lLnRva2VuRm9udE1hcDtcblxuXHRcdHRoaXMuX2dyYW1tYXJGYWN0b3J5Py5zZXRUaGVtZSh0aGlzLl9jdXJyZW50VGhlbWUsIHRoaXMuX2N1cnJlbnRUb2tlbkNvbG9yTWFwKTtcblx0XHRjb25zdCBjb2xvck1hcCA9IHRvQ29sb3JNYXAodGhpcy5fY3VycmVudFRva2VuQ29sb3JNYXApO1xuXHRcdGNvbnN0IGNvbG9yQ3NzUnVsZXMgPSBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwKGNvbG9yTWFwKTtcblx0XHRjb25zdCBmb250Q3NzUnVsZXMgPSBnZW5lcmF0ZVRva2Vuc0NTU0ZvckZvbnRNYXAodGhpcy5fY3VycmVudFRva2VuRm9udE1hcCk7XG5cblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBjb2xvckNzc1J1bGVzICsgZm9udENzc1J1bGVzO1xuXHRcdFRva2VuaXphdGlvblJlZ2lzdHJ5LnNldENvbG9yTWFwKGNvbG9yTWFwKTtcblxuXHRcdGlmICh0aGlzLl9jdXJyZW50VGhlbWUgJiYgdGhpcy5fY3VycmVudFRva2VuQ29sb3JNYXApIHtcblx0XHRcdHRoaXMuX3RocmVhZGVkQmFja2dyb3VuZFRva2VuaXplckZhY3RvcnkuYWNjZXB0VGhlbWUodGhpcy5fY3VycmVudFRoZW1lLCB0aGlzLl9jdXJyZW50VG9rZW5Db2xvck1hcCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGNyZWF0ZVRva2VuaXplcihsYW5ndWFnZUlkOiBzdHJpbmcpOiBQcm9taXNlPElHcmFtbWFyIHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2VJZCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBncmFtbWFyRmFjdG9yeSA9IGF3YWl0IHRoaXMuX2dldE9yQ3JlYXRlR3JhbW1hckZhY3RvcnkoKTtcblx0XHRpZiAoIWdyYW1tYXJGYWN0b3J5LmhhcyhsYW5ndWFnZUlkKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGVuY29kZWRMYW5ndWFnZUlkID0gdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXHRcdGNvbnN0IHsgZ3JhbW1hciB9ID0gYXdhaXQgZ3JhbW1hckZhY3RvcnkuY3JlYXRlR3JhbW1hcihsYW5ndWFnZUlkLCBlbmNvZGVkTGFuZ3VhZ2VJZCk7XG5cdFx0cmV0dXJuIGdyYW1tYXI7XG5cdH1cblxuXHRwcml2YXRlIF92c2NvZGVPbmlndXJ1bWE6IFByb21pc2U8dHlwZW9mIGltcG9ydCgndnNjb2RlLW9uaWd1cnVtYScpPiB8IG51bGw7XG5cdHByaXZhdGUgX2dldFZTQ29kZU9uaWd1cnVtYSgpOiBQcm9taXNlPHR5cGVvZiBpbXBvcnQoJ3ZzY29kZS1vbmlndXJ1bWEnKT4ge1xuXHRcdGlmICghdGhpcy5fdnNjb2RlT25pZ3VydW1hKSB7XG5cdFx0XHR0aGlzLl92c2NvZGVPbmlndXJ1bWEgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBbdnNjb2RlT25pZ3VydW1hLCB3YXNtXSA9IGF3YWl0IFByb21pc2UuYWxsKFtpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ3ZzY29kZS1vbmlndXJ1bWEnKT4oJ3ZzY29kZS1vbmlndXJ1bWEnLCAncmVsZWFzZS9tYWluLmpzJyksIHRoaXMuX2xvYWRWU0NvZGVPbmlndXJ1bWFXQVNNKCldKTtcblx0XHRcdFx0YXdhaXQgdnNjb2RlT25pZ3VydW1hLmxvYWRXQVNNKHtcblx0XHRcdFx0XHRkYXRhOiB3YXNtLFxuXHRcdFx0XHRcdHByaW50OiAoc3RyOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2RlYnVnTW9kZVByaW50RnVuYyhzdHIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiB2c2NvZGVPbmlndXJ1bWE7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdnNjb2RlT25pZ3VydW1hO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZFZTQ29kZU9uaWd1cnVtYVdBU00oKTogUHJvbWlzZTxSZXNwb25zZSB8IEFycmF5QnVmZmVyPiB7XG5cdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlc29sdmVBbWROb2RlTW9kdWxlUGF0aCgndnNjb2RlLW9uaWd1cnVtYScsICdyZWxlYXNlL29uaWcud2FzbScpKTtcblx0XHRcdC8vIFVzaW5nIHRoZSByZXNwb25zZSBkaXJlY3RseSBvbmx5IHdvcmtzIGlmIHRoZSBzZXJ2ZXIgc2V0cyB0aGUgTUlNRSB0eXBlICdhcHBsaWNhdGlvbi93YXNtJy5cblx0XHRcdC8vIE90aGVyd2lzZSwgYSBUeXBlRXJyb3IgaXMgdGhyb3duIHdoZW4gdXNpbmcgdGhlIHN0cmVhbWluZyBjb21waWxlci5cblx0XHRcdC8vIFdlIHRoZXJlZm9yZSB1c2UgdGhlIG5vbi1zdHJlYW1pbmcgY29tcGlsZXIgOiguXG5cdFx0XHRyZXR1cm4gYXdhaXQgcmVzcG9uc2UuYXJyYXlCdWZmZXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdFxuXHRcdFx0XHQ/IEZpbGVBY2Nlc3MuYXNCcm93c2VyVXJpKGAke25vZGVNb2R1bGVzQXNhclVucGFja2VkUGF0aH0vdnNjb2RlLW9uaWd1cnVtYS9yZWxlYXNlL29uaWcud2FzbWApLnRvU3RyaW5nKHRydWUpXG5cdFx0XHRcdDogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYCR7bm9kZU1vZHVsZXNQYXRofS92c2NvZGUtb25pZ3VydW1hL3JlbGVhc2Uvb25pZy53YXNtYCkudG9TdHJpbmcodHJ1ZSkpO1xuXHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydFRva2VuaXphdGlvblRpbWUodGltZU1zOiBudW1iZXIsIGxhbmd1YWdlSWQ6IHN0cmluZywgc291cmNlRXh0ZW5zaW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbGluZUxlbmd0aDogbnVtYmVyLCBmcm9tV29ya2VyOiBib29sZWFuLCBpc1JhbmRvbVNhbXBsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IGZyb21Xb3JrZXIgPyAnYXN5bmMnIDogJ3N5bmMnO1xuXG5cdFx0Ly8gNTAgZXZlbnRzIHBlciBob3VyIChvbmUgZXZlbnQgaGFzIGEgbG93IHByb2JhYmlsaXR5KVxuXHRcdGlmIChUZXh0TWF0ZVRva2VuaXphdGlvbkZlYXR1cmUucmVwb3J0VG9rZW5pemF0aW9uVGltZUNvdW50ZXJba2V5XSA+IDUwKSB7XG5cdFx0XHQvLyBEb24ndCBmbG9vZCB0ZWxlbWV0cnkgd2l0aCB0b28gbWFueSBldmVudHNcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKFRleHRNYXRlVG9rZW5pemF0aW9uRmVhdHVyZS5yZXBvcnRUb2tlbml6YXRpb25UaW1lQ291bnRlcltrZXldID09PSAwKSB7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0VGV4dE1hdGVUb2tlbml6YXRpb25GZWF0dXJlLnJlcG9ydFRva2VuaXphdGlvblRpbWVDb3VudGVyW2tleV0gPSAwO1xuXHRcdFx0fSwgMTAwMCAqIDYwICogNjApO1xuXHRcdH1cblx0XHRUZXh0TWF0ZVRva2VuaXphdGlvbkZlYXR1cmUucmVwb3J0VG9rZW5pemF0aW9uVGltZUNvdW50ZXJba2V5XSsrO1xuXG5cdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHtcblx0XHRcdHRpbWVNczogbnVtYmVyO1xuXHRcdFx0bGFuZ3VhZ2VJZDogc3RyaW5nO1xuXHRcdFx0bGluZUxlbmd0aDogbnVtYmVyO1xuXHRcdFx0ZnJvbVdvcmtlcjogYm9vbGVhbjtcblx0XHRcdHNvdXJjZUV4dGVuc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpc1JhbmRvbVNhbXBsZTogYm9vbGVhbjtcblx0XHRcdHRva2VuaXphdGlvblNldHRpbmc6IG51bWJlcjtcblx0XHR9LCB7XG5cdFx0XHRvd25lcjogJ2hlZGlldCc7XG5cblx0XHRcdHRpbWVNczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvIHVuZGVyc3RhbmQgaG93IGxvbmcgaXQgdG9vayB0byB0b2tlbml6ZSBhIHJhbmRvbSBsaW5lJyB9O1xuXHRcdFx0bGFuZ3VhZ2VJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvIHJlbGF0ZSB0aGUgcGVyZm9ybWFuY2UgdG8gdGhlIGxhbmd1YWdlJyB9O1xuXHRcdFx0bGluZUxlbmd0aDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvIHJlbGF0ZSB0aGUgcGVyZm9ybWFuY2UgdG8gdGhlIGxpbmUgbGVuZ3RoJyB9O1xuXHRcdFx0ZnJvbVdvcmtlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvIGZpZ3VyZSBvdXQgaWYgdGhpcyBsaW5lIHdhcyB0b2tlbml6ZWQgc3luYyBvciBhc3luYycgfTtcblx0XHRcdHNvdXJjZUV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVG8gZmlndXJlIG91dCB3aGljaCBleHRlbnNpb24gY29udHJpYnV0ZWQgdGhlIGdyYW1tYXInIH07XG5cdFx0XHRpc1JhbmRvbVNhbXBsZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RvIGZpZ3VyZSBvdXQgaWYgdGhpcyBpcyBhIHJhbmRvbSBzYW1wbGUgb3IgbWVhc3VyZWQgYmVjYXVzZSBvZiBzb21lIG90aGVyIGNvbmRpdGlvbi4nIH07XG5cdFx0XHR0b2tlbml6YXRpb25TZXR0aW5nOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVG8gdW5kZXJzdGFuZCBpZiB0aGUgdXNlciBoYXMgYXN5bmMgdG9rZW5pemF0aW9uIGVuYWJsZWQuIDA9c3luYywgMT1hc3luYywgMj12ZXJpZmljYXRpb24nIH07XG5cblx0XHRcdGNvbW1lbnQ6ICdUaGlzIGV2ZW50IGdpdmVzIGluc2lnaHQgYWJvdXQgdGhlIHBlcmZvcm1hbmNlIGNlcnRhaW4gZ3JhbW1hcnMuJztcblx0XHR9PignZWRpdG9yLnRva2VuaXplZExpbmUnLCB7XG5cdFx0XHR0aW1lTXMsXG5cdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0bGluZUxlbmd0aCxcblx0XHRcdGZyb21Xb3JrZXIsXG5cdFx0XHRzb3VyY2VFeHRlbnNpb25JZCxcblx0XHRcdGlzUmFuZG9tU2FtcGxlLFxuXHRcdFx0dG9rZW5pemF0aW9uU2V0dGluZzogdGhpcy5nZXRBc3luY1Rva2VuaXphdGlvbkVuYWJsZWQoKSA/ICh0aGlzLmdldEFzeW5jVG9rZW5pemF0aW9uVmVyaWZpY2F0aW9uKCkgPyAyIDogMSkgOiAwLFxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvQ29sb3JNYXAoY29sb3JNYXA6IHN0cmluZ1tdKTogQ29sb3JbXSB7XG5cdGNvbnN0IHJlc3VsdDogQ29sb3JbXSA9IFtudWxsIV07XG5cdGZvciAobGV0IGkgPSAxLCBsZW4gPSBjb2xvck1hcC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdHJlc3VsdFtpXSA9IENvbG9yLmZyb21IZXgoY29sb3JNYXBbaV0pO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGVxdWFsc1Rva2VuUnVsZXMoYTogSVRleHRNYXRlVGhlbWluZ1J1bGVbXSB8IG51bGwsIGI6IElUZXh0TWF0ZVRoZW1pbmdSdWxlW10gfCBudWxsKTogYm9vbGVhbiB7XG5cdGlmICghYiB8fCAhYSB8fCBiLmxlbmd0aCAhPT0gYS5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Zm9yIChsZXQgaSA9IGIubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRjb25zdCByMSA9IGJbaV07XG5cdFx0Y29uc3QgcjIgPSBhW2ldO1xuXHRcdGlmIChyMS5zY29wZSAhPT0gcjIuc2NvcGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgczEgPSByMS5zZXR0aW5ncztcblx0XHRjb25zdCBzMiA9IHIyLnNldHRpbmdzO1xuXHRcdGlmIChzMSAmJiBzMikge1xuXHRcdFx0aWYgKHMxLmZvbnRTdHlsZSAhPT0gczIuZm9udFN0eWxlIHx8IHMxLmZvcmVncm91bmQgIT09IHMyLmZvcmVncm91bmQgfHwgczEuYmFja2dyb3VuZCAhPT0gczIuYmFja2dyb3VuZCB8fCBzMS5saW5lSGVpZ2h0ICE9PSBzMi5saW5lSGVpZ2h0IHx8IHMxLmZvbnRTaXplICE9PSBzMi5mb250U2l6ZSB8fCBzMS5mb250RmFtaWx5ICE9PSBzMi5mb250RmFtaWx5KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCFzMSB8fCAhczIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlR3JhbW1hckV4dGVuc2lvblBvaW50KGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIHN5bnRheDogSVRNU3ludGF4RXh0ZW5zaW9uUG9pbnQsIGNvbGxlY3RvcjogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSk6IGJvb2xlYW4ge1xuXHRpZiAoc3ludGF4Lmxhbmd1YWdlICYmICgodHlwZW9mIHN5bnRheC5sYW5ndWFnZSAhPT0gJ3N0cmluZycpIHx8ICFfbGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQoc3ludGF4Lmxhbmd1YWdlKSkpIHtcblx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmxhbmd1YWdlJywgXCJVbmtub3duIGxhbmd1YWdlIGluIGBjb250cmlidXRlcy57MH0ubGFuZ3VhZ2VgLiBQcm92aWRlZCB2YWx1ZTogezF9XCIsIGdyYW1tYXJzRXh0UG9pbnQubmFtZSwgU3RyaW5nKHN5bnRheC5sYW5ndWFnZSkpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKCFzeW50YXguc2NvcGVOYW1lIHx8ICh0eXBlb2Ygc3ludGF4LnNjb3BlTmFtZSAhPT0gJ3N0cmluZycpKSB7XG5cdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5zY29wZU5hbWUnLCBcIkV4cGVjdGVkIHN0cmluZyBpbiBgY29udHJpYnV0ZXMuezB9LnNjb3BlTmFtZWAuIFByb3ZpZGVkIHZhbHVlOiB7MX1cIiwgZ3JhbW1hcnNFeHRQb2ludC5uYW1lLCBTdHJpbmcoc3ludGF4LnNjb3BlTmFtZSkpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKCFzeW50YXgucGF0aCB8fCAodHlwZW9mIHN5bnRheC5wYXRoICE9PSAnc3RyaW5nJykpIHtcblx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnBhdGguMCcsIFwiRXhwZWN0ZWQgc3RyaW5nIGluIGBjb250cmlidXRlcy57MH0ucGF0aGAuIFByb3ZpZGVkIHZhbHVlOiB7MX1cIiwgZ3JhbW1hcnNFeHRQb2ludC5uYW1lLCBTdHJpbmcoc3ludGF4LnBhdGgpKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChzeW50YXguaW5qZWN0VG8gJiYgKCFBcnJheS5pc0FycmF5KHN5bnRheC5pbmplY3RUbykgfHwgc3ludGF4LmluamVjdFRvLnNvbWUoc2NvcGUgPT4gdHlwZW9mIHNjb3BlICE9PSAnc3RyaW5nJykpKSB7XG5cdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5pbmplY3RUbycsIFwiSW52YWxpZCB2YWx1ZSBpbiBgY29udHJpYnV0ZXMuezB9LmluamVjdFRvYC4gTXVzdCBiZSBhbiBhcnJheSBvZiBsYW5ndWFnZSBzY29wZSBuYW1lcy4gUHJvdmlkZWQgdmFsdWU6IHsxfVwiLCBncmFtbWFyc0V4dFBvaW50Lm5hbWUsIEpTT04uc3RyaW5naWZ5KHN5bnRheC5pbmplY3RUbykpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHN5bnRheC5lbWJlZGRlZExhbmd1YWdlcyAmJiAhdHlwZXMuaXNPYmplY3Qoc3ludGF4LmVtYmVkZGVkTGFuZ3VhZ2VzKSkge1xuXHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuZW1iZWRkZWRMYW5ndWFnZXMnLCBcIkludmFsaWQgdmFsdWUgaW4gYGNvbnRyaWJ1dGVzLnswfS5lbWJlZGRlZExhbmd1YWdlc2AuIE11c3QgYmUgYW4gb2JqZWN0IG1hcCBmcm9tIHNjb3BlIG5hbWUgdG8gbGFuZ3VhZ2UuIFByb3ZpZGVkIHZhbHVlOiB7MX1cIiwgZ3JhbW1hcnNFeHRQb2ludC5uYW1lLCBKU09OLnN0cmluZ2lmeShzeW50YXguZW1iZWRkZWRMYW5ndWFnZXMpKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKHN5bnRheC50b2tlblR5cGVzICYmICF0eXBlcy5pc09iamVjdChzeW50YXgudG9rZW5UeXBlcykpIHtcblx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnRva2VuVHlwZXMnLCBcIkludmFsaWQgdmFsdWUgaW4gYGNvbnRyaWJ1dGVzLnswfS50b2tlblR5cGVzYC4gTXVzdCBiZSBhbiBvYmplY3QgbWFwIGZyb20gc2NvcGUgbmFtZSB0byB0b2tlbiB0eXBlLiBQcm92aWRlZCB2YWx1ZTogezF9XCIsIGdyYW1tYXJzRXh0UG9pbnQubmFtZSwgSlNPTi5zdHJpbmdpZnkoc3ludGF4LnRva2VuVHlwZXMpKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgZ3JhbW1hckxvY2F0aW9uID0gcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCBzeW50YXgucGF0aCk7XG5cdGlmICghcmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudChncmFtbWFyTG9jYXRpb24sIGV4dGVuc2lvbkxvY2F0aW9uKSkge1xuXHRcdGNvbGxlY3Rvci53YXJuKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5wYXRoLjEnLCBcIkV4cGVjdGVkIGBjb250cmlidXRlcy57MH0ucGF0aGAgKHsxfSkgdG8gYmUgaW5jbHVkZWQgaW5zaWRlIGV4dGVuc2lvbidzIGZvbGRlciAoezJ9KS4gVGhpcyBtaWdodCBtYWtlIHRoZSBleHRlbnNpb24gbm9uLXBvcnRhYmxlLlwiLCBncmFtbWFyc0V4dFBvaW50Lm5hbWUsIGdyYW1tYXJMb2NhdGlvbi5wYXRoLCBleHRlbnNpb25Mb2NhdGlvbi5wYXRoKSk7XG5cdH1cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG9ic2VydmFibGVDb25maWdWYWx1ZTxUPihrZXk6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nLCBkZWZhdWx0VmFsdWU6IFQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBJT2JzZXJ2YWJsZTxUPiB7XG5cdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50KFxuXHRcdChoYW5kbGVDaGFuZ2UpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGtleSwgeyBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlSWQgfSkpIHtcblx0XHRcdFx0aGFuZGxlQ2hhbmdlKGUpO1xuXHRcdFx0fVxuXHRcdH0pLFxuXHRcdCgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFQ+KGtleSwgeyBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlSWQg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
