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
import { disposableTimeout, TimeoutTimer } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { FuzzyScoreOptions } from "../../../../base/common/filters.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { getLeadingWhitespace, isHighSurrogate, isLowSurrogate } from "../../../../base/common/strings.js";
import { assertType } from "../../../../base/common/types.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Selection } from "../../../common/core/selection.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { CompletionItemKind, CompletionTriggerKind } from "../../../common/languages.js";
import { IEditorWorkerService } from "../../../common/services/editorWorker.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { getInlineCompletionsController } from "../../inlineCompletions/browser/controller/common.js";
import { InlineCompletionContextKeys } from "../../inlineCompletions/browser/controller/inlineCompletionContextKeys.js";
import { SnippetController2 } from "../../snippet/browser/snippetController2.js";
import { CompletionModel } from "./completionModel.js";
import { CompletionOptions, getSnippetSuggestSupport, provideSuggestionItems, QuickSuggestionsOptions, SnippetSortOrder } from "./suggest.js";
import { WordDistance } from "./wordDistance.js";
class LineContext {
  static shouldAutoTrigger(editor) {
    if (!editor.hasModel()) {
      return false;
    }
    const model = editor.getModel();
    const pos = editor.getPosition();
    model.tokenization.tokenizeIfCheap(pos.lineNumber);
    const word = model.getWordAtPosition(pos);
    if (!word) {
      return false;
    }
    if (word.endColumn !== pos.column && word.startColumn + 1 !== pos.column) {
      return false;
    }
    if (!isNaN(Number(word.word))) {
      return false;
    }
    return true;
  }
  constructor(model, position, triggerOptions) {
    this.leadingLineContent = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
    this.leadingWord = model.getWordUntilPosition(position);
    this.lineNumber = position.lineNumber;
    this.column = position.column;
    this.triggerOptions = triggerOptions;
  }
}
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Idle"] = 0] = "Idle";
  State2[State2["Manual"] = 1] = "Manual";
  State2[State2["Auto"] = 2] = "Auto";
  return State2;
})(State || {});
function canShowQuickSuggest(editor, contextKeyService, configurationService) {
  if (!Boolean(contextKeyService.getContextKeyValue(InlineCompletionContextKeys.inlineSuggestionVisible.key))) {
    return true;
  }
  const suppressSuggestions = contextKeyService.getContextKeyValue(InlineCompletionContextKeys.suppressSuggestions.key);
  if (suppressSuggestions !== void 0) {
    return !suppressSuggestions;
  }
  return !editor.getOption(EditorOption.inlineSuggest).suppressSuggestions;
}
function canShowSuggestOnTriggerCharacters(editor, contextKeyService, configurationService) {
  if (!Boolean(contextKeyService.getContextKeyValue("inlineSuggestionVisible"))) {
    return true;
  }
  const suppressSuggestions = contextKeyService.getContextKeyValue(InlineCompletionContextKeys.suppressSuggestions.key);
  if (suppressSuggestions !== void 0) {
    return !suppressSuggestions;
  }
  return !editor.getOption(EditorOption.inlineSuggest).suppressSuggestions;
}
let SuggestModel = class {
  constructor(_editor, _editorWorkerService, _clipboardService, _telemetryService, _logService, _contextKeyService, _configurationService, _languageFeaturesService, _envService) {
    this._editor = _editor;
    this._editorWorkerService = _editorWorkerService;
    this._clipboardService = _clipboardService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._contextKeyService = _contextKeyService;
    this._configurationService = _configurationService;
    this._languageFeaturesService = _languageFeaturesService;
    this._envService = _envService;
    this._toDispose = new DisposableStore();
    this._triggerCharacterListener = new DisposableStore();
    this._triggerQuickSuggest = new TimeoutTimer();
    this._triggerState = void 0;
    this._completionDisposables = new DisposableStore();
    this._onDidCancel = new Emitter();
    this._onDidTrigger = new Emitter();
    this._onDidSuggest = new Emitter();
    this.onDidCancel = this._onDidCancel.event;
    this.onDidTrigger = this._onDidTrigger.event;
    this.onDidSuggest = this._onDidSuggest.event;
    this._currentSelection = this._editor.getSelection() || new Selection(1, 1, 1, 1);
    this._toDispose.add(this._editor.onDidChangeModel(() => {
      this._updateTriggerCharacters();
      this.cancel();
    }));
    this._toDispose.add(this._editor.onDidChangeModelLanguage(() => {
      this._updateTriggerCharacters();
      this.cancel();
    }));
    this._toDispose.add(this._editor.onDidChangeConfiguration(() => {
      this._updateTriggerCharacters();
    }));
    this._toDispose.add(this._languageFeaturesService.completionProvider.onDidChange(() => {
      this._updateTriggerCharacters();
      this._updateActiveSuggestSession();
    }));
    let editorIsComposing = false;
    this._toDispose.add(this._editor.onDidCompositionStart(() => {
      editorIsComposing = true;
    }));
    this._toDispose.add(this._editor.onDidCompositionEnd(() => {
      editorIsComposing = false;
      this._onCompositionEnd();
    }));
    this._toDispose.add(this._editor.onDidChangeCursorSelection((e) => {
      if (!editorIsComposing) {
        this._onCursorChange(e);
      }
    }));
    this._toDispose.add(this._editor.onDidChangeModelContent(() => {
      if (!editorIsComposing && this._triggerState !== void 0) {
        this._refilterCompletionItems();
      }
    }));
    this._updateTriggerCharacters();
  }
  dispose() {
    dispose(this._triggerCharacterListener);
    dispose([this._onDidCancel, this._onDidSuggest, this._onDidTrigger, this._triggerQuickSuggest]);
    this._waitForInlineCompletions?.dispose();
    this._toDispose.dispose();
    this._completionDisposables.dispose();
    this.cancel();
  }
  _updateTriggerCharacters() {
    this._triggerCharacterListener.clear();
    if (this._editor.getOption(EditorOption.readOnly) || !this._editor.hasModel() || !this._editor.getOption(EditorOption.suggestOnTriggerCharacters)) {
      return;
    }
    const supportsByTriggerCharacter = /* @__PURE__ */ new Map();
    for (const support of this._languageFeaturesService.completionProvider.all(this._editor.getModel())) {
      for (const ch of support.triggerCharacters || []) {
        let set = supportsByTriggerCharacter.get(ch);
        if (!set) {
          set = /* @__PURE__ */ new Set();
          const suggestSupport = getSnippetSuggestSupport();
          if (suggestSupport) {
            set.add(suggestSupport);
          }
          supportsByTriggerCharacter.set(ch, set);
        }
        set.add(support);
      }
    }
    const checkTriggerCharacter = (text) => {
      if (!canShowSuggestOnTriggerCharacters(this._editor, this._contextKeyService, this._configurationService)) {
        return;
      }
      if (LineContext.shouldAutoTrigger(this._editor)) {
        return;
      }
      if (!text) {
        const position = this._editor.getPosition();
        const model = this._editor.getModel();
        text = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
      }
      let lastChar = "";
      if (isLowSurrogate(text.charCodeAt(text.length - 1))) {
        if (isHighSurrogate(text.charCodeAt(text.length - 2))) {
          lastChar = text.substr(text.length - 2);
        }
      } else {
        lastChar = text.charAt(text.length - 1);
      }
      const supports = supportsByTriggerCharacter.get(lastChar);
      if (supports) {
        const providerItemsToReuse = /* @__PURE__ */ new Map();
        if (this._completionModel) {
          for (const [provider, items] of this._completionModel.getItemsByProvider()) {
            if (!supports.has(provider)) {
              providerItemsToReuse.set(provider, items);
            }
          }
        }
        this.trigger({
          auto: true,
          triggerKind: CompletionTriggerKind.TriggerCharacter,
          triggerCharacter: lastChar,
          retrigger: Boolean(this._completionModel),
          clipboardText: this._completionModel?.clipboardText,
          completionOptions: { providerFilter: supports, providerItemsToReuse }
        });
      }
    };
    this._triggerCharacterListener.add(this._editor.onDidType(checkTriggerCharacter));
    this._triggerCharacterListener.add(this._editor.onDidCompositionEnd(() => checkTriggerCharacter()));
  }
  // --- trigger/retrigger/cancel suggest
  get state() {
    if (!this._triggerState) {
      return 0 /* Idle */;
    } else if (!this._triggerState.auto) {
      return 1 /* Manual */;
    } else {
      return 2 /* Auto */;
    }
  }
  cancel(retrigger = false) {
    this._triggerQuickSuggest.cancel();
    this._waitForInlineCompletions?.dispose();
    this._waitForInlineCompletions = void 0;
    if (this._triggerState !== void 0) {
      this._requestToken?.cancel();
      this._requestToken = void 0;
      this._triggerState = void 0;
      this._completionModel = void 0;
      this._context = void 0;
      this._onDidCancel.fire({ retrigger });
    }
  }
  clear() {
    this._completionDisposables.clear();
  }
  _updateActiveSuggestSession() {
    if (this._triggerState !== void 0) {
      if (!this._editor.hasModel() || !this._languageFeaturesService.completionProvider.has(this._editor.getModel())) {
        this.cancel();
      } else {
        this.trigger({ auto: this._triggerState.auto, retrigger: true });
      }
    }
  }
  _onCursorChange(e) {
    if (!this._editor.hasModel()) {
      return;
    }
    const prevSelection = this._currentSelection;
    this._currentSelection = this._editor.getSelection();
    if (!e.selection.isEmpty() || e.reason !== CursorChangeReason.NotSet && e.reason !== CursorChangeReason.Explicit || e.source !== "keyboard" && e.source !== "deleteLeft") {
      this.cancel();
      return;
    }
    if (this._triggerState === void 0 && e.reason === CursorChangeReason.NotSet) {
      if (prevSelection.containsRange(this._currentSelection) || prevSelection.getEndPosition().isBeforeOrEqual(this._currentSelection.getPosition())) {
        this._doTriggerQuickSuggest();
      }
    } else if (this._triggerState !== void 0 && e.reason === CursorChangeReason.Explicit) {
      this._refilterCompletionItems();
    }
  }
  _onCompositionEnd() {
    if (this._triggerState === void 0) {
      this._doTriggerQuickSuggest();
    } else {
      this._refilterCompletionItems();
    }
  }
  _doTriggerQuickSuggest() {
    if (QuickSuggestionsOptions.isAllOff(this._editor.getOption(EditorOption.quickSuggestions))) {
      return;
    }
    if (this._editor.getOption(EditorOption.suggest).snippetsPreventQuickSuggestions && SnippetController2.get(this._editor)?.isInSnippet()) {
      return;
    }
    this.cancel();
    this._waitForInlineCompletions?.dispose();
    this._waitForInlineCompletions = void 0;
    this._triggerQuickSuggest.cancelAndSet(() => {
      if (this._triggerState !== void 0) {
        return;
      }
      if (!LineContext.shouldAutoTrigger(this._editor)) {
        return;
      }
      if (!this._editor.hasModel() || !this._editor.hasWidgetFocus()) {
        return;
      }
      const model = this._editor.getModel();
      const pos = this._editor.getPosition();
      const config = this._editor.getOption(EditorOption.quickSuggestions);
      if (QuickSuggestionsOptions.isAllOff(config)) {
        return;
      }
      let waitForInlineCompletions = false;
      if (!QuickSuggestionsOptions.isAllOn(config)) {
        model.tokenization.tokenizeIfCheap(pos.lineNumber);
        const lineTokens = model.tokenization.getLineTokens(pos.lineNumber);
        const tokenType = lineTokens.getStandardTokenType(lineTokens.findTokenIndexAtOffset(Math.max(pos.column - 1 - 1, 0)));
        const value = QuickSuggestionsOptions.valueFor(config, tokenType);
        if (value === "off" || value === "inline") {
          return;
        }
        if (value === "offWhenInlineCompletions") {
          waitForInlineCompletions = this._languageFeaturesService.inlineCompletionsProvider.has(model) && this._editor.getOption(EditorOption.inlineSuggest).enabled;
        }
      }
      if (!canShowQuickSuggest(this._editor, this._contextKeyService, this._configurationService)) {
        return;
      }
      if (!this._languageFeaturesService.completionProvider.has(model)) {
        return;
      }
      if (waitForInlineCompletions) {
        this._waitForInlineCompletionsAndTrigger(model, pos);
      } else {
        this.trigger({ auto: true });
      }
    }, this._editor.getOption(EditorOption.quickSuggestionsDelay));
  }
  _waitForInlineCompletionsAndTrigger(initialModel, initialPosition) {
    const initialModelVersion = initialModel.getVersionId();
    const inlineController = getInlineCompletionsController(this._editor);
    const inlineModel = inlineController?.model.get();
    if (!inlineController || !inlineModel) {
      this.trigger({ auto: true });
      return;
    }
    const state = inlineModel.state.get();
    if (state?.inlineSuggestion) {
      return;
    }
    const store = new DisposableStore();
    this._waitForInlineCompletions = store;
    const triggerAndCleanUp = (doTrigger) => {
      store.dispose();
      if (this._waitForInlineCompletions === store) {
        this._waitForInlineCompletions = void 0;
      }
      if (this._triggerState !== void 0) {
        return;
      }
      if (!doTrigger) {
        return;
      }
      const currentModel = this._editor.getModel();
      const currentPosition = this._editor.getPosition();
      if (currentModel === initialModel && currentModel.getVersionId() === initialModelVersion && currentPosition?.equals(initialPosition) && this._editor.hasWidgetFocus()) {
        this.trigger({ auto: true });
      }
    };
    disposableTimeout(() => {
      triggerAndCleanUp(true);
      inlineModel.stop("automatic");
    }, 750, store);
    store.add(autorun((reader) => {
      const currentInlineModel = inlineController.model.read(reader);
      if (currentInlineModel !== inlineModel) {
        triggerAndCleanUp(false);
        return;
      }
      const status = inlineModel.status.read(reader);
      const currentState = inlineModel.state.read(reader);
      if (!currentState && status === "loading") {
        return;
      }
      triggerAndCleanUp(!currentState);
    }));
  }
  _refilterCompletionItems() {
    assertType(this._editor.hasModel());
    assertType(this._triggerState !== void 0);
    const model = this._editor.getModel();
    const position = this._editor.getPosition();
    const ctx = new LineContext(model, position, { ...this._triggerState, refilter: true });
    this._onNewContext(ctx);
  }
  trigger(options) {
    if (!this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    const ctx = new LineContext(model, this._editor.getPosition(), options);
    this.cancel(options.retrigger);
    this._triggerState = options;
    this._onDidTrigger.fire({ auto: options.auto, shy: options.shy ?? false, position: this._editor.getPosition() });
    this._context = ctx;
    let suggestCtx = { triggerKind: options.triggerKind ?? CompletionTriggerKind.Invoke };
    if (options.triggerCharacter) {
      suggestCtx = {
        triggerKind: CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: options.triggerCharacter
      };
    }
    this._requestToken = new CancellationTokenSource();
    const snippetSuggestions = this._editor.getOption(EditorOption.snippetSuggestions);
    let snippetSortOrder = SnippetSortOrder.Inline;
    switch (snippetSuggestions) {
      case "top":
        snippetSortOrder = SnippetSortOrder.Top;
        break;
      // 	↓ that's the default anyways...
      // case 'inline':
      // 	snippetSortOrder = SnippetSortOrder.Inline;
      // 	break;
      case "bottom":
        snippetSortOrder = SnippetSortOrder.Bottom;
        break;
    }
    const { itemKind: itemKindFilter, showDeprecated } = SuggestModel.createSuggestFilter(this._editor);
    const completionOptions = new CompletionOptions(snippetSortOrder, options.completionOptions?.kindFilter ?? itemKindFilter, options.completionOptions?.providerFilter, options.completionOptions?.providerItemsToReuse, showDeprecated);
    const wordDistance = WordDistance.create(this._editorWorkerService, this._editor);
    const completions = provideSuggestionItems(
      this._languageFeaturesService.completionProvider,
      model,
      this._editor.getPosition(),
      completionOptions,
      suggestCtx,
      this._requestToken.token
    );
    Promise.all([completions, wordDistance]).then(async ([completions2, wordDistance2]) => {
      this._requestToken?.dispose();
      if (!this._editor.hasModel()) {
        completions2.disposable.dispose();
        return;
      }
      let clipboardText = options?.clipboardText;
      if (!clipboardText && completions2.needsClipboard) {
        clipboardText = await this._clipboardService.readText();
      }
      if (this._triggerState === void 0) {
        completions2.disposable.dispose();
        return;
      }
      const model2 = this._editor.getModel();
      const ctx2 = new LineContext(model2, this._editor.getPosition(), options);
      const fuzzySearchOptions = {
        ...FuzzyScoreOptions.default,
        firstMatchCanBeWeak: !this._editor.getOption(EditorOption.suggest).matchOnWordStartOnly
      };
      this._completionModel = new CompletionModel(
        completions2.items,
        this._context.column,
        {
          leadingLineContent: ctx2.leadingLineContent,
          characterCountDelta: ctx2.column - this._context.column
        },
        wordDistance2,
        this._editor.getOption(EditorOption.suggest),
        this._editor.getOption(EditorOption.snippetSuggestions),
        fuzzySearchOptions,
        clipboardText
      );
      this._completionDisposables.add(completions2.disposable);
      this._onNewContext(ctx2);
      this._reportDurationsTelemetry(completions2.durations);
      if (!this._envService.isBuilt || this._envService.isExtensionDevelopment) {
        for (const item of completions2.items) {
          if (item.isInvalid) {
            this._logService.warn(`[suggest] did IGNORE invalid completion item from ${item.provider._debugDisplayName}`, item.completion);
          }
        }
      }
    }).catch(onUnexpectedError);
  }
  /**
   * Report durations telemetry with a 1% sampling rate.
   * The telemetry is reported only if a random number between 0 and 100 is less than or equal to 1.
   */
  _reportDurationsTelemetry(durations) {
    if (Math.random() > 1e-4) {
      return;
    }
    setTimeout(() => {
      this._telemetryService.publicLog2("suggest.durations.json", { data: JSON.stringify(durations) });
      this._logService.debug("suggest.durations.json", durations);
    });
  }
  static createSuggestFilter(editor) {
    const result = /* @__PURE__ */ new Set();
    const snippetSuggestions = editor.getOption(EditorOption.snippetSuggestions);
    if (snippetSuggestions === "none") {
      result.add(CompletionItemKind.Snippet);
    }
    const suggestOptions = editor.getOption(EditorOption.suggest);
    if (!suggestOptions.showMethods) {
      result.add(CompletionItemKind.Method);
    }
    if (!suggestOptions.showFunctions) {
      result.add(CompletionItemKind.Function);
    }
    if (!suggestOptions.showConstructors) {
      result.add(CompletionItemKind.Constructor);
    }
    if (!suggestOptions.showFields) {
      result.add(CompletionItemKind.Field);
    }
    if (!suggestOptions.showVariables) {
      result.add(CompletionItemKind.Variable);
    }
    if (!suggestOptions.showClasses) {
      result.add(CompletionItemKind.Class);
    }
    if (!suggestOptions.showStructs) {
      result.add(CompletionItemKind.Struct);
    }
    if (!suggestOptions.showInterfaces) {
      result.add(CompletionItemKind.Interface);
    }
    if (!suggestOptions.showModules) {
      result.add(CompletionItemKind.Module);
    }
    if (!suggestOptions.showProperties) {
      result.add(CompletionItemKind.Property);
    }
    if (!suggestOptions.showEvents) {
      result.add(CompletionItemKind.Event);
    }
    if (!suggestOptions.showOperators) {
      result.add(CompletionItemKind.Operator);
    }
    if (!suggestOptions.showUnits) {
      result.add(CompletionItemKind.Unit);
    }
    if (!suggestOptions.showValues) {
      result.add(CompletionItemKind.Value);
    }
    if (!suggestOptions.showConstants) {
      result.add(CompletionItemKind.Constant);
    }
    if (!suggestOptions.showEnums) {
      result.add(CompletionItemKind.Enum);
    }
    if (!suggestOptions.showEnumMembers) {
      result.add(CompletionItemKind.EnumMember);
    }
    if (!suggestOptions.showKeywords) {
      result.add(CompletionItemKind.Keyword);
    }
    if (!suggestOptions.showWords) {
      result.add(CompletionItemKind.Text);
    }
    if (!suggestOptions.showColors) {
      result.add(CompletionItemKind.Color);
    }
    if (!suggestOptions.showFiles) {
      result.add(CompletionItemKind.File);
    }
    if (!suggestOptions.showReferences) {
      result.add(CompletionItemKind.Reference);
    }
    if (!suggestOptions.showColors) {
      result.add(CompletionItemKind.Customcolor);
    }
    if (!suggestOptions.showFolders) {
      result.add(CompletionItemKind.Folder);
    }
    if (!suggestOptions.showTypeParameters) {
      result.add(CompletionItemKind.TypeParameter);
    }
    if (!suggestOptions.showSnippets) {
      result.add(CompletionItemKind.Snippet);
    }
    if (!suggestOptions.showUsers) {
      result.add(CompletionItemKind.User);
    }
    if (!suggestOptions.showIssues) {
      result.add(CompletionItemKind.Issue);
    }
    return { itemKind: result, showDeprecated: suggestOptions.showDeprecated };
  }
  _onNewContext(ctx) {
    if (!this._context) {
      return;
    }
    if (ctx.lineNumber !== this._context.lineNumber) {
      this.cancel();
      return;
    }
    if (getLeadingWhitespace(ctx.leadingLineContent) !== getLeadingWhitespace(this._context.leadingLineContent)) {
      this.cancel();
      return;
    }
    if (ctx.column < this._context.column) {
      if (ctx.leadingWord.word) {
        this.trigger({ auto: this._context.triggerOptions.auto, retrigger: true });
      } else {
        this.cancel();
      }
      return;
    }
    if (!this._completionModel) {
      return;
    }
    if (ctx.leadingWord.word.length !== 0 && ctx.leadingWord.startColumn > this._context.leadingWord.startColumn) {
      const shouldAutoTrigger = LineContext.shouldAutoTrigger(this._editor);
      if (shouldAutoTrigger && this._context) {
        const map = this._completionModel.getItemsByProvider();
        this.trigger({
          auto: this._context.triggerOptions.auto,
          retrigger: true,
          clipboardText: this._completionModel.clipboardText,
          completionOptions: { providerItemsToReuse: map }
        });
      }
      return;
    }
    if (ctx.column > this._context.column && this._completionModel.getIncompleteProvider().size > 0 && ctx.leadingWord.word.length !== 0) {
      const providerItemsToReuse = /* @__PURE__ */ new Map();
      const providerFilter = /* @__PURE__ */ new Set();
      for (const [provider, items] of this._completionModel.getItemsByProvider()) {
        if (items.length > 0 && items[0].container.incomplete) {
          providerFilter.add(provider);
        } else {
          providerItemsToReuse.set(provider, items);
        }
      }
      this.trigger({
        auto: this._context.triggerOptions.auto,
        triggerKind: CompletionTriggerKind.TriggerForIncompleteCompletions,
        retrigger: true,
        clipboardText: this._completionModel.clipboardText,
        completionOptions: { providerFilter, providerItemsToReuse }
      });
    } else {
      const oldLineContext = this._completionModel.lineContext;
      let isFrozen = false;
      this._completionModel.lineContext = {
        leadingLineContent: ctx.leadingLineContent,
        characterCountDelta: ctx.column - this._context.column
      };
      if (this._completionModel.items.length === 0) {
        const shouldAutoTrigger = LineContext.shouldAutoTrigger(this._editor);
        if (!this._context) {
          this.cancel();
          return;
        }
        if (shouldAutoTrigger && this._context.leadingWord.endColumn < ctx.leadingWord.startColumn) {
          this.trigger({ auto: this._context.triggerOptions.auto, retrigger: true });
          return;
        }
        if (!this._context.triggerOptions.auto) {
          this._completionModel.lineContext = oldLineContext;
          isFrozen = this._completionModel.items.length > 0;
          if (isFrozen && ctx.leadingWord.word.length === 0) {
            this.cancel();
            return;
          }
        } else {
          this.cancel();
          return;
        }
      }
      this._onDidSuggest.fire({
        completionModel: this._completionModel,
        triggerOptions: ctx.triggerOptions,
        isFrozen
      });
    }
  }
};
SuggestModel = __decorateClass([
  __decorateParam(1, IEditorWorkerService),
  __decorateParam(2, IClipboardService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILanguageFeaturesService),
  __decorateParam(8, IEnvironmentService)
], SuggestModel);
export {
  LineContext,
  State,
  SuggestModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXGJyb3dzZXJcXHN1Z2dlc3RNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0LCBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGdldExlYWRpbmdXaGl0ZXNwYWNlLCBpc0hpZ2hTdXJyb2dhdGUsIGlzTG93U3Vycm9nYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElXb3JkQXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uLCBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uQ29udGV4dCwgQ29tcGxldGlvbkl0ZW1LaW5kLCBDb21wbGV0aW9uSXRlbVByb3ZpZGVyLCBDb21wbGV0aW9uVHJpZ2dlcktpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IGdldElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvY29udHJvbGxlci9jb21tb24uanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9jb250cm9sbGVyL2lubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25Nb2RlbCB9IGZyb20gJy4vY29tcGxldGlvbk1vZGVsLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25EdXJhdGlvbnMsIENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uT3B0aW9ucywgZ2V0U25pcHBldFN1Z2dlc3RTdXBwb3J0LCBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zLCBRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucywgU25pcHBldFNvcnRPcmRlciB9IGZyb20gJy4vc3VnZ2VzdC5qcyc7XG5pbXBvcnQgeyBXb3JkRGlzdGFuY2UgfSBmcm9tICcuL3dvcmREaXN0YW5jZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNhbmNlbEV2ZW50IHtcblx0cmVhZG9ubHkgcmV0cmlnZ2VyOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUcmlnZ2VyRXZlbnQge1xuXHRyZWFkb25seSBhdXRvOiBib29sZWFuO1xuXHRyZWFkb25seSBzaHk6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHBvc2l0aW9uOiBJUG9zaXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN1Z2dlc3RFdmVudCB7XG5cdHJlYWRvbmx5IGNvbXBsZXRpb25Nb2RlbDogQ29tcGxldGlvbk1vZGVsO1xuXHRyZWFkb25seSBpc0Zyb3plbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgdHJpZ2dlck9wdGlvbnM6IFN1Z2dlc3RUcmlnZ2VyT3B0aW9ucztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdWdnZXN0VHJpZ2dlck9wdGlvbnMge1xuXHRyZWFkb25seSBhdXRvOiBib29sZWFuO1xuXHRyZWFkb25seSBzaHk/OiBib29sZWFuO1xuXHRyZWFkb25seSByZWZpbHRlcj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHJldHJpZ2dlcj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRyaWdnZXJLaW5kPzogQ29tcGxldGlvblRyaWdnZXJLaW5kO1xuXHRyZWFkb25seSB0cmlnZ2VyQ2hhcmFjdGVyPzogc3RyaW5nO1xuXHRyZWFkb25seSBjbGlwYm9hcmRUZXh0Pzogc3RyaW5nO1xuXHRjb21wbGV0aW9uT3B0aW9ucz86IFBhcnRpYWw8Q29tcGxldGlvbk9wdGlvbnM+O1xufVxuXG5leHBvcnQgY2xhc3MgTGluZUNvbnRleHQge1xuXG5cdHN0YXRpYyBzaG91bGRBdXRvVHJpZ2dlcihlZGl0b3I6IElDb2RlRWRpdG9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHBvcyA9IGVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdG1vZGVsLnRva2VuaXphdGlvbi50b2tlbml6ZUlmQ2hlYXAocG9zLmxpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHBvcyk7XG5cdFx0aWYgKCF3b3JkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh3b3JkLmVuZENvbHVtbiAhPT0gcG9zLmNvbHVtbiAmJlxuXHRcdFx0d29yZC5zdGFydENvbHVtbiArIDEgIT09IHBvcy5jb2x1bW4gLyogYWZ0ZXIgdHlwaW5nIGEgc2luZ2xlIGNoYXJhY3RlciBiZWZvcmUgYSB3b3JkICovKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghaXNOYU4oTnVtYmVyKHdvcmQud29yZCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmVhZG9ubHkgbGluZU51bWJlcjogbnVtYmVyO1xuXHRyZWFkb25seSBjb2x1bW46IG51bWJlcjtcblx0cmVhZG9ubHkgbGVhZGluZ0xpbmVDb250ZW50OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxlYWRpbmdXb3JkOiBJV29yZEF0UG9zaXRpb247XG5cdHJlYWRvbmx5IHRyaWdnZXJPcHRpb25zOiBTdWdnZXN0VHJpZ2dlck9wdGlvbnM7XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdHJpZ2dlck9wdGlvbnM6IFN1Z2dlc3RUcmlnZ2VyT3B0aW9ucykge1xuXHRcdHRoaXMubGVhZGluZ0xpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcikuc3Vic3RyKDAsIHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdHRoaXMubGVhZGluZ1dvcmQgPSBtb2RlbC5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0dGhpcy5saW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHR0aGlzLmNvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbjtcblx0XHR0aGlzLnRyaWdnZXJPcHRpb25zID0gdHJpZ2dlck9wdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU3RhdGUge1xuXHRJZGxlID0gMCxcblx0TWFudWFsID0gMSxcblx0QXV0byA9IDJcbn1cblxuZnVuY3Rpb24gY2FuU2hvd1F1aWNrU3VnZ2VzdChlZGl0b3I6IElDb2RlRWRpdG9yLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogYm9vbGVhbiB7XG5cdGlmICghQm9vbGVhbihjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoSW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmlubGluZVN1Z2dlc3Rpb25WaXNpYmxlLmtleSkpKSB7XG5cdFx0Ly8gQWxsb3cgaWYgdGhlcmUgaXMgbm8gaW5saW5lIHN1Z2dlc3Rpb24uXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Y29uc3Qgc3VwcHJlc3NTdWdnZXN0aW9ucyA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuIHwgdW5kZWZpbmVkPihJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuc3VwcHJlc3NTdWdnZXN0aW9ucy5rZXkpO1xuXHRpZiAoc3VwcHJlc3NTdWdnZXN0aW9ucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuICFzdXBwcmVzc1N1Z2dlc3Rpb25zO1xuXHR9XG5cdHJldHVybiAhZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCkuc3VwcHJlc3NTdWdnZXN0aW9ucztcbn1cblxuZnVuY3Rpb24gY2FuU2hvd1N1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzKGVkaXRvcjogSUNvZGVFZGl0b3IsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBib29sZWFuIHtcblx0aWYgKCFCb29sZWFuKGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZSgnaW5saW5lU3VnZ2VzdGlvblZpc2libGUnKSkpIHtcblx0XHQvLyBBbGxvdyBpZiB0aGVyZSBpcyBubyBpbmxpbmUgc3VnZ2VzdGlvbi5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRjb25zdCBzdXBwcmVzc1N1Z2dlc3Rpb25zID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cy5zdXBwcmVzc1N1Z2dlc3Rpb25zLmtleSk7XG5cdGlmIChzdXBwcmVzc1N1Z2dlc3Rpb25zICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gIXN1cHByZXNzU3VnZ2VzdGlvbnM7XG5cdH1cblx0cmV0dXJuICFlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0KS5zdXBwcmVzc1N1Z2dlc3Rpb25zO1xufVxuXG5leHBvcnQgY2xhc3MgU3VnZ2VzdE1vZGVsIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RvRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJpZ2dlckNoYXJhY3Rlckxpc3RlbmVyID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmlnZ2VyUXVpY2tTdWdnZXN0ID0gbmV3IFRpbWVvdXRUaW1lcigpO1xuXHRwcml2YXRlIF93YWl0Rm9ySW5saW5lQ29tcGxldGlvbnM6IERpc3Bvc2FibGVTdG9yZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF90cmlnZ2VyU3RhdGU6IFN1Z2dlc3RUcmlnZ2VyT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVxdWVzdFRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cdHByaXZhdGUgX2NvbnRleHQ/OiBMaW5lQ29udGV4dDtcblx0cHJpdmF0ZSBfY3VycmVudFNlbGVjdGlvbjogU2VsZWN0aW9uO1xuXG5cdHByaXZhdGUgX2NvbXBsZXRpb25Nb2RlbDogQ29tcGxldGlvbk1vZGVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0aW9uRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2FuY2VsID0gbmV3IEVtaXR0ZXI8SUNhbmNlbEV2ZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRyaWdnZXIgPSBuZXcgRW1pdHRlcjxJVHJpZ2dlckV2ZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN1Z2dlc3QgPSBuZXcgRW1pdHRlcjxJU3VnZ2VzdEV2ZW50PigpO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2FuY2VsOiBFdmVudDxJQ2FuY2VsRXZlbnQ+ID0gdGhpcy5fb25EaWRDYW5jZWwuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkVHJpZ2dlcjogRXZlbnQ8SVRyaWdnZXJFdmVudD4gPSB0aGlzLl9vbkRpZFRyaWdnZXIuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uRGlkU3VnZ2VzdDogRXZlbnQ8SVN1Z2dlc3RFdmVudD4gPSB0aGlzLl9vbkRpZFN1Z2dlc3QuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yV29ya2VyU2VydmljZTogSUVkaXRvcldvcmtlclNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fY3VycmVudFNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKSB8fCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpO1xuXG5cdFx0Ly8gd2lyZSB1cCB2YXJpb3VzIGxpc3RlbmVyc1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckNoYXJhY3RlcnMoKTtcblx0XHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyQ2hhcmFjdGVycygpO1xuXHRcdFx0dGhpcy5jYW5jZWwoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJDaGFyYWN0ZXJzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXJDaGFyYWN0ZXJzKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVBY3RpdmVTdWdnZXN0U2Vzc2lvbigpO1xuXHRcdH0pKTtcblxuXHRcdGxldCBlZGl0b3JJc0NvbXBvc2luZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ29tcG9zaXRpb25TdGFydCgoKSA9PiB7XG5cdFx0XHRlZGl0b3JJc0NvbXBvc2luZyA9IHRydWU7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ29tcG9zaXRpb25FbmQoKCkgPT4ge1xuXHRcdFx0ZWRpdG9ySXNDb21wb3NpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uQ29tcG9zaXRpb25FbmQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oZSA9PiB7XG5cdFx0XHQvLyBvbmx5IHRyaWdnZXIgc3VnZ2VzdCB3aGVuIHRoZSBlZGl0b3IgaXNuJ3QgY29tcG9zaW5nIGEgY2hhcmFjdGVyXG5cdFx0XHRpZiAoIWVkaXRvcklzQ29tcG9zaW5nKSB7XG5cdFx0XHRcdHRoaXMuX29uQ3Vyc29yQ2hhbmdlKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB7XG5cdFx0XHQvLyBvbmx5IGZpbHRlciBjb21wbGV0aW9ucyB3aGVuIHRoZSBlZGl0b3IgaXNuJ3QgY29tcG9zaW5nIGEgY2hhcmFjdGVyXG5cdFx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHRcdC8vIGUuZy4gXHUwMEE4ICsgdSBtYWtlcyBcdTAwRkMgYnV0IGp1c3QgXHUwMEE4IGNhbm5vdCBiZSB1c2VkIGZvciBmaWx0ZXJpbmdcblx0XHRcdGlmICghZWRpdG9ySXNDb21wb3NpbmcgJiYgdGhpcy5fdHJpZ2dlclN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVmaWx0ZXJDb21wbGV0aW9uSXRlbXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyQ2hhcmFjdGVycygpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMuX3RyaWdnZXJDaGFyYWN0ZXJMaXN0ZW5lcik7XG5cdFx0ZGlzcG9zZShbdGhpcy5fb25EaWRDYW5jZWwsIHRoaXMuX29uRGlkU3VnZ2VzdCwgdGhpcy5fb25EaWRUcmlnZ2VyLCB0aGlzLl90cmlnZ2VyUXVpY2tTdWdnZXN0XSk7XG5cdFx0dGhpcy5fd2FpdEZvcklubGluZUNvbXBsZXRpb25zPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jb21wbGV0aW9uRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY2FuY2VsKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUcmlnZ2VyQ2hhcmFjdGVycygpOiB2b2lkIHtcblx0XHR0aGlzLl90cmlnZ2VyQ2hhcmFjdGVyTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdGlmICh0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSlcblx0XHRcdHx8ICF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKVxuXHRcdFx0fHwgIXRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzKSkge1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3VwcG9ydHNCeVRyaWdnZXJDaGFyYWN0ZXIgPSBuZXcgTWFwPHN0cmluZywgU2V0PENvbXBsZXRpb25JdGVtUHJvdmlkZXI+PigpO1xuXHRcdGZvciAoY29uc3Qgc3VwcG9ydCBvZiB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIuYWxsKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpKSkge1xuXHRcdFx0Zm9yIChjb25zdCBjaCBvZiBzdXBwb3J0LnRyaWdnZXJDaGFyYWN0ZXJzIHx8IFtdKSB7XG5cdFx0XHRcdGxldCBzZXQgPSBzdXBwb3J0c0J5VHJpZ2dlckNoYXJhY3Rlci5nZXQoY2gpO1xuXHRcdFx0XHRpZiAoIXNldCkge1xuXHRcdFx0XHRcdHNldCA9IG5ldyBTZXQoKTtcblx0XHRcdFx0XHRjb25zdCBzdWdnZXN0U3VwcG9ydCA9IGdldFNuaXBwZXRTdWdnZXN0U3VwcG9ydCgpO1xuXHRcdFx0XHRcdGlmIChzdWdnZXN0U3VwcG9ydCkge1xuXHRcdFx0XHRcdFx0c2V0LmFkZChzdWdnZXN0U3VwcG9ydCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHN1cHBvcnRzQnlUcmlnZ2VyQ2hhcmFjdGVyLnNldChjaCwgc2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZXQuYWRkKHN1cHBvcnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0Y29uc3QgY2hlY2tUcmlnZ2VyQ2hhcmFjdGVyID0gKHRleHQ/OiBzdHJpbmcpID0+IHtcblxuXHRcdFx0aWYgKCFjYW5TaG93U3VnZ2VzdE9uVHJpZ2dlckNoYXJhY3RlcnModGhpcy5fZWRpdG9yLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKExpbmVDb250ZXh0LnNob3VsZEF1dG9UcmlnZ2VyKHRoaXMuX2VkaXRvcikpIHtcblx0XHRcdFx0Ly8gZG9uJ3QgdHJpZ2dlciBieSB0cmlnZ2VyIGNoYXJhY3RlcnMgd2hlbiB0aGlzIGlzIGEgY2FzZSBmb3IgcXVpY2sgc3VnZ2VzdFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGV4dCkge1xuXHRcdFx0XHQvLyBjYW1lIGhlcmUgZnJvbSB0aGUgY29tcG9zaXRpb25FbmQtZXZlbnRcblx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSE7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHR0ZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcikuc3Vic3RyKDAsIHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgbGFzdENoYXIgPSAnJztcblx0XHRcdGlmIChpc0xvd1N1cnJvZ2F0ZSh0ZXh0LmNoYXJDb2RlQXQodGV4dC5sZW5ndGggLSAxKSkpIHtcblx0XHRcdFx0aWYgKGlzSGlnaFN1cnJvZ2F0ZSh0ZXh0LmNoYXJDb2RlQXQodGV4dC5sZW5ndGggLSAyKSkpIHtcblx0XHRcdFx0XHRsYXN0Q2hhciA9IHRleHQuc3Vic3RyKHRleHQubGVuZ3RoIC0gMik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhc3RDaGFyID0gdGV4dC5jaGFyQXQodGV4dC5sZW5ndGggLSAxKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3VwcG9ydHMgPSBzdXBwb3J0c0J5VHJpZ2dlckNoYXJhY3Rlci5nZXQobGFzdENoYXIpO1xuXHRcdFx0aWYgKHN1cHBvcnRzKSB7XG5cblx0XHRcdFx0Ly8ga2VlcCBleGlzdGluZyBpdGVtcyB0aGF0IHdoZXJlIG5vdCBjb21wdXRlZCBieSB0aGVcblx0XHRcdFx0Ly8gc3VwcG9ydHMvcHJvdmlkZXJzIHRoYXQgd2FudCB0byB0cmlnZ2VyIG5vd1xuXHRcdFx0XHRjb25zdCBwcm92aWRlckl0ZW1zVG9SZXVzZSA9IG5ldyBNYXA8Q29tcGxldGlvbkl0ZW1Qcm92aWRlciwgQ29tcGxldGlvbkl0ZW1bXT4oKTtcblx0XHRcdFx0aWYgKHRoaXMuX2NvbXBsZXRpb25Nb2RlbCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgW3Byb3ZpZGVyLCBpdGVtc10gb2YgdGhpcy5fY29tcGxldGlvbk1vZGVsLmdldEl0ZW1zQnlQcm92aWRlcigpKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXN1cHBvcnRzLmhhcyhwcm92aWRlcikpIHtcblx0XHRcdFx0XHRcdFx0cHJvdmlkZXJJdGVtc1RvUmV1c2Uuc2V0KHByb3ZpZGVyLCBpdGVtcyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy50cmlnZ2VyKHtcblx0XHRcdFx0XHRhdXRvOiB0cnVlLFxuXHRcdFx0XHRcdHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3Rlcixcblx0XHRcdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyOiBsYXN0Q2hhcixcblx0XHRcdFx0XHRyZXRyaWdnZXI6IEJvb2xlYW4odGhpcy5fY29tcGxldGlvbk1vZGVsKSxcblx0XHRcdFx0XHRjbGlwYm9hcmRUZXh0OiB0aGlzLl9jb21wbGV0aW9uTW9kZWw/LmNsaXBib2FyZFRleHQsXG5cdFx0XHRcdFx0Y29tcGxldGlvbk9wdGlvbnM6IHsgcHJvdmlkZXJGaWx0ZXI6IHN1cHBvcnRzLCBwcm92aWRlckl0ZW1zVG9SZXVzZSB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl90cmlnZ2VyQ2hhcmFjdGVyTGlzdGVuZXIuYWRkKHRoaXMuX2VkaXRvci5vbkRpZFR5cGUoY2hlY2tUcmlnZ2VyQ2hhcmFjdGVyKSk7XG5cdFx0dGhpcy5fdHJpZ2dlckNoYXJhY3Rlckxpc3RlbmVyLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDb21wb3NpdGlvbkVuZCgoKSA9PiBjaGVja1RyaWdnZXJDaGFyYWN0ZXIoKSkpO1xuXHR9XG5cblx0Ly8gLS0tIHRyaWdnZXIvcmV0cmlnZ2VyL2NhbmNlbCBzdWdnZXN0XG5cblx0Z2V0IHN0YXRlKCk6IFN0YXRlIHtcblx0XHRpZiAoIXRoaXMuX3RyaWdnZXJTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIFN0YXRlLklkbGU7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5fdHJpZ2dlclN0YXRlLmF1dG8pIHtcblx0XHRcdHJldHVybiBTdGF0ZS5NYW51YWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBTdGF0ZS5BdXRvO1xuXHRcdH1cblx0fVxuXG5cdGNhbmNlbChyZXRyaWdnZXI6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX3RyaWdnZXJRdWlja1N1Z2dlc3QuY2FuY2VsKCk7XG5cdFx0dGhpcy5fd2FpdEZvcklubGluZUNvbXBsZXRpb25zPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fd2FpdEZvcklubGluZUNvbXBsZXRpb25zID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHRoaXMuX3RyaWdnZXJTdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9yZXF1ZXN0VG9rZW4/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fcmVxdWVzdFRva2VuID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fdHJpZ2dlclN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY29tcGxldGlvbk1vZGVsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkQ2FuY2VsLmZpcmUoeyByZXRyaWdnZXIgfSk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXIoKSB7XG5cdFx0dGhpcy5fY29tcGxldGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVBY3RpdmVTdWdnZXN0U2Vzc2lvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdHJpZ2dlclN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgIXRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5oYXModGhpcy5fZWRpdG9yLmdldE1vZGVsKCkpKSB7XG5cdFx0XHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoeyBhdXRvOiB0aGlzLl90cmlnZ2VyU3RhdGUuYXV0bywgcmV0cmlnZ2VyOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uQ3Vyc29yQ2hhbmdlKGU6IElDdXJzb3JTZWxlY3Rpb25DaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2U2VsZWN0aW9uID0gdGhpcy5fY3VycmVudFNlbGVjdGlvbjtcblx0XHR0aGlzLl9jdXJyZW50U2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXG5cdFx0aWYgKCFlLnNlbGVjdGlvbi5pc0VtcHR5KClcblx0XHRcdHx8IChlLnJlYXNvbiAhPT0gQ3Vyc29yQ2hhbmdlUmVhc29uLk5vdFNldCAmJiBlLnJlYXNvbiAhPT0gQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KVxuXHRcdFx0fHwgKGUuc291cmNlICE9PSAna2V5Ym9hcmQnICYmIGUuc291cmNlICE9PSAnZGVsZXRlTGVmdCcpXG5cdFx0KSB7XG5cdFx0XHQvLyBFYXJseSBleGl0IGlmIG5vdGhpbmcgbmVlZHMgdG8gYmUgZG9uZSFcblx0XHRcdC8vIExlYXZlIHNvbWUgZm9ybSBvZiBlYXJseSBleGl0IGNoZWNrIGhlcmUgaWYgeW91IHdpc2ggdG8gY29udGludWUgYmVpbmcgYSBjdXJzb3IgcG9zaXRpb24gY2hhbmdlIGxpc3RlbmVyIDspXG5cdFx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXG5cdFx0aWYgKHRoaXMuX3RyaWdnZXJTdGF0ZSA9PT0gdW5kZWZpbmVkICYmIGUucmVhc29uID09PSBDdXJzb3JDaGFuZ2VSZWFzb24uTm90U2V0KSB7XG5cdFx0XHRpZiAocHJldlNlbGVjdGlvbi5jb250YWluc1JhbmdlKHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24pIHx8IHByZXZTZWxlY3Rpb24uZ2V0RW5kUG9zaXRpb24oKS5pc0JlZm9yZU9yRXF1YWwodGhpcy5fY3VycmVudFNlbGVjdGlvbi5nZXRQb3NpdGlvbigpKSkge1xuXHRcdFx0XHQvLyBjdXJzb3IgZGlkIG1vdmUgUklHSFQgZHVlIHRvIHR5cGluZyAtPiB0cmlnZ2VyIHF1aWNrIHN1Z2dlc3Rcblx0XHRcdFx0dGhpcy5fZG9UcmlnZ2VyUXVpY2tTdWdnZXN0KCk7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuX3RyaWdnZXJTdGF0ZSAhPT0gdW5kZWZpbmVkICYmIGUucmVhc29uID09PSBDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQpIHtcblx0XHRcdC8vIHN1Z2dlc3QgaXMgYWN0aXZlIGFuZCBzb21ldGhpbmcgbGlrZSBjdXJzb3Iga2V5cyBhcmUgdXNlZCB0byBtb3ZlXG5cdFx0XHQvLyB0aGUgY3Vyc29yLiB0aGlzIG1lYW5zIHdlIGNhbiByZWZpbHRlciBhdCB0aGUgbmV3IHBvc2l0aW9uXG5cdFx0XHR0aGlzLl9yZWZpbHRlckNvbXBsZXRpb25JdGVtcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uQ29tcG9zaXRpb25FbmQoKTogdm9pZCB7XG5cdFx0Ly8gdHJpZ2dlciBvciByZWZpbHRlciB3aGVuIGNvbXBvc2l0aW9uIGVuZHNcblx0XHRpZiAodGhpcy5fdHJpZ2dlclN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2RvVHJpZ2dlclF1aWNrU3VnZ2VzdCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWZpbHRlckNvbXBsZXRpb25JdGVtcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RvVHJpZ2dlclF1aWNrU3VnZ2VzdCgpOiB2b2lkIHtcblxuXHRcdGlmIChRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucy5pc0FsbE9mZih0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5xdWlja1N1Z2dlc3Rpb25zKSkpIHtcblx0XHRcdC8vIG5vdCBlbmFibGVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpLnNuaXBwZXRzUHJldmVudFF1aWNrU3VnZ2VzdGlvbnMgJiYgU25pcHBldENvbnRyb2xsZXIyLmdldCh0aGlzLl9lZGl0b3IpPy5pc0luU25pcHBldCgpKSB7XG5cdFx0XHQvLyBubyBxdWljayBzdWdnZXN0aW9uIHdoZW4gaW4gc25pcHBldCBtb2RlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jYW5jZWwoKTtcblxuXHRcdC8vIENhbmNlbCBhbnkgaW4tZmxpZ2h0IHdhaXQgZm9yIGlubGluZSBjb21wbGV0aW9ucyBmcm9tIGEgcHJldmlvdXMgY3ljbGVcblx0XHR0aGlzLl93YWl0Rm9ySW5saW5lQ29tcGxldGlvbnM/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl93YWl0Rm9ySW5saW5lQ29tcGxldGlvbnMgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl90cmlnZ2VyUXVpY2tTdWdnZXN0LmNhbmNlbEFuZFNldCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdHJpZ2dlclN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFMaW5lQ29udGV4dC5zaG91bGRBdXRvVHJpZ2dlcih0aGlzLl9lZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgIXRoaXMuX2VkaXRvci5oYXNXaWRnZXRGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCBwb3MgPSB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRcdC8vIHZhbGlkYXRlIGVuYWJsZWQgbm93XG5cdFx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5xdWlja1N1Z2dlc3Rpb25zKTtcblx0XHRcdGlmIChRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucy5pc0FsbE9mZihjb25maWcpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHdhaXRGb3JJbmxpbmVDb21wbGV0aW9ucyA9IGZhbHNlO1xuXHRcdFx0aWYgKCFRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucy5pc0FsbE9uKGNvbmZpZykpIHtcblx0XHRcdFx0Ly8gQ2hlY2sgdGhlIHR5cGUgb2YgdGhlIHRva2VuIHRoYXQgdHJpZ2dlcmVkIHRoaXNcblx0XHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLnRva2VuaXplSWZDaGVhcChwb3MubGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2Vucyhwb3MubGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IHRva2VuVHlwZSA9IGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUobGluZVRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KE1hdGgubWF4KHBvcy5jb2x1bW4gLSAxIC0gMSwgMCkpKTtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucy52YWx1ZUZvcihjb25maWcsIHRva2VuVHlwZSk7XG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gJ29mZicgfHwgdmFsdWUgPT09ICdpbmxpbmUnKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gJ29mZldoZW5JbmxpbmVDb21wbGV0aW9ucycpIHtcblx0XHRcdFx0XHR3YWl0Rm9ySW5saW5lQ29tcGxldGlvbnMgPSB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLmhhcyhtb2RlbClcblx0XHRcdFx0XHRcdCYmIHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGluZVN1Z2dlc3QpLmVuYWJsZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFjYW5TaG93UXVpY2tTdWdnZXN0KHRoaXMuX2VkaXRvciwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSkge1xuXHRcdFx0XHQvLyBkbyBub3QgdHJpZ2dlciBxdWljayBzdWdnZXN0aW9ucyBpZiBpbmxpbmUgc3VnZ2VzdGlvbnMgYXJlIHNob3duXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIuaGFzKG1vZGVsKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh3YWl0Rm9ySW5saW5lQ29tcGxldGlvbnMpIHtcblx0XHRcdFx0Ly8gV2FpdCBmb3IgaW5saW5lIGNvbXBsZXRpb25zIHRvIHJlc29sdmUgYmVmb3JlIGRlY2lkaW5nXG5cdFx0XHRcdHRoaXMuX3dhaXRGb3JJbmxpbmVDb21wbGV0aW9uc0FuZFRyaWdnZXIobW9kZWwsIHBvcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoeyBhdXRvOiB0cnVlIH0pO1xuXHRcdFx0fVxuXG5cdFx0fSwgdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucXVpY2tTdWdnZXN0aW9uc0RlbGF5KSk7XG5cdH1cblxuXHRwcml2YXRlIF93YWl0Rm9ySW5saW5lQ29tcGxldGlvbnNBbmRUcmlnZ2VyKGluaXRpYWxNb2RlbDogSVRleHRNb2RlbCwgaW5pdGlhbFBvc2l0aW9uOiBQb3NpdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGluaXRpYWxNb2RlbFZlcnNpb24gPSBpbml0aWFsTW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgaW5saW5lQ29udHJvbGxlciA9IGdldElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlcih0aGlzLl9lZGl0b3IpO1xuXHRcdGNvbnN0IGlubGluZU1vZGVsID0gaW5saW5lQ29udHJvbGxlcj8ubW9kZWwuZ2V0KCk7XG5cdFx0aWYgKCFpbmxpbmVDb250cm9sbGVyIHx8ICFpbmxpbmVNb2RlbCkge1xuXHRcdFx0dGhpcy50cmlnZ2VyKHsgYXV0bzogdHJ1ZSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IGlubGluZU1vZGVsLnN0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZT8uaW5saW5lU3VnZ2VzdGlvbikge1xuXHRcdFx0Ly8gSW5saW5lIGNvbXBsZXRpb25zIGFyZSBhbHJlYWR5IHNob3dpbmcgLSBzdXBwcmVzc1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX3dhaXRGb3JJbmxpbmVDb21wbGV0aW9ucyA9IHN0b3JlO1xuXG5cdFx0Y29uc3QgdHJpZ2dlckFuZENsZWFuVXAgPSAoZG9UcmlnZ2VyOiBib29sZWFuKSA9PiB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRpZiAodGhpcy5fd2FpdEZvcklubGluZUNvbXBsZXRpb25zID09PSBzdG9yZSkge1xuXHRcdFx0XHR0aGlzLl93YWl0Rm9ySW5saW5lQ29tcGxldGlvbnMgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fdHJpZ2dlclN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFkb1RyaWdnZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3VycmVudE1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCBjdXJyZW50UG9zaXRpb24gPSB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGlmIChjdXJyZW50TW9kZWwgPT09IGluaXRpYWxNb2RlbFxuXHRcdFx0XHQmJiBjdXJyZW50TW9kZWwuZ2V0VmVyc2lvbklkKCkgPT09IGluaXRpYWxNb2RlbFZlcnNpb25cblx0XHRcdFx0JiYgY3VycmVudFBvc2l0aW9uPy5lcXVhbHMoaW5pdGlhbFBvc2l0aW9uKVxuXHRcdFx0XHQmJiB0aGlzLl9lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcih7IGF1dG86IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFJlYWRpbmcgYGlubGluZUNvbnRyb2xsZXIubW9kZWxgIGZpcnN0IGluIGEgc2luZ2xlIGF1dG9ydW4gYmluZHMgdGhlXG5cdFx0Ly8gd2FpdCB0byB0aGUgbW9kZWwncyBsaWZldGltZTogbmVzdGVkIGF1dG9ydW5zIHdvdWxkIGhhdmUgbm8gZGVmaW5lZFxuXHRcdC8vIHJ1biBvcmRlciwgc28gYW4gaW5uZXIgc3RhdGUtd2F0Y2hlciBjb3VsZCBmaXJlIG9uIGEgZGlzcG9zZWQgbW9kZWxcblx0XHQvLyBiZWZvcmUgdGhlIG91dGVyIG1vZGVsLXdhdGNoZXIgY2xlYW5lZCBpdCB1cC5cblx0XHRkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHR0cmlnZ2VyQW5kQ2xlYW5VcCh0cnVlKTtcblx0XHRcdGlubGluZU1vZGVsLnN0b3AoJ2F1dG9tYXRpYycpO1xuXHRcdH0sIDc1MCwgc3RvcmUpO1xuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRJbmxpbmVNb2RlbCA9IGlubGluZUNvbnRyb2xsZXIubW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGN1cnJlbnRJbmxpbmVNb2RlbCAhPT0gaW5saW5lTW9kZWwpIHtcblx0XHRcdFx0dHJpZ2dlckFuZENsZWFuVXAoZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGF0dXMgPSBpbmxpbmVNb2RlbC5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY3VycmVudFN0YXRlID0gaW5saW5lTW9kZWwuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFjdXJyZW50U3RhdGUgJiYgc3RhdHVzID09PSAnbG9hZGluZycpIHtcblx0XHRcdFx0Ly8gU3RpbGwgbG9hZGluZ1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0cmlnZ2VyQW5kQ2xlYW5VcCghY3VycmVudFN0YXRlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZpbHRlckNvbXBsZXRpb25JdGVtcygpOiB2b2lkIHtcblx0XHRhc3NlcnRUeXBlKHRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKTtcblx0XHRhc3NlcnRUeXBlKHRoaXMuX3RyaWdnZXJTdGF0ZSAhPT0gdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKTtcblx0XHRjb25zdCBjdHggPSBuZXcgTGluZUNvbnRleHQobW9kZWwsIHBvc2l0aW9uLCB7IC4uLnRoaXMuX3RyaWdnZXJTdGF0ZSwgcmVmaWx0ZXI6IHRydWUgfSk7XG5cdFx0dGhpcy5fb25OZXdDb250ZXh0KGN0eCk7XG5cdH1cblxuXHR0cmlnZ2VyKG9wdGlvbnM6IFN1Z2dlc3RUcmlnZ2VyT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGN0eCA9IG5ldyBMaW5lQ29udGV4dChtb2RlbCwgdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCksIG9wdGlvbnMpO1xuXG5cdFx0Ly8gQ2FuY2VsIHByZXZpb3VzIHJlcXVlc3RzLCBjaGFuZ2Ugc3RhdGUgJiB1cGRhdGUgVUlcblx0XHR0aGlzLmNhbmNlbChvcHRpb25zLnJldHJpZ2dlcik7XG5cdFx0dGhpcy5fdHJpZ2dlclN0YXRlID0gb3B0aW9ucztcblx0XHR0aGlzLl9vbkRpZFRyaWdnZXIuZmlyZSh7IGF1dG86IG9wdGlvbnMuYXV0bywgc2h5OiBvcHRpb25zLnNoeSA/PyBmYWxzZSwgcG9zaXRpb246IHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpIH0pO1xuXG5cdFx0Ly8gQ2FwdHVyZSBjb250ZXh0IHdoZW4gcmVxdWVzdCB3YXMgc2VudFxuXHRcdHRoaXMuX2NvbnRleHQgPSBjdHg7XG5cblx0XHQvLyBCdWlsZCBjb250ZXh0IGZvciByZXF1ZXN0XG5cdFx0bGV0IHN1Z2dlc3RDdHg6IENvbXBsZXRpb25Db250ZXh0ID0geyB0cmlnZ2VyS2luZDogb3B0aW9ucy50cmlnZ2VyS2luZCA/PyBDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH07XG5cdFx0aWYgKG9wdGlvbnMudHJpZ2dlckNoYXJhY3Rlcikge1xuXHRcdFx0c3VnZ2VzdEN0eCA9IHtcblx0XHRcdFx0dHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC5UcmlnZ2VyQ2hhcmFjdGVyLFxuXHRcdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyOiBvcHRpb25zLnRyaWdnZXJDaGFyYWN0ZXJcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVxdWVzdFRva2VuID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHQvLyBraW5kIGZpbHRlciBhbmQgc25pcHBldCBzb3J0IHJ1bGVzXG5cdFx0Y29uc3Qgc25pcHBldFN1Z2dlc3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc25pcHBldFN1Z2dlc3Rpb25zKTtcblx0XHRsZXQgc25pcHBldFNvcnRPcmRlciA9IFNuaXBwZXRTb3J0T3JkZXIuSW5saW5lO1xuXHRcdHN3aXRjaCAoc25pcHBldFN1Z2dlc3Rpb25zKSB7XG5cdFx0XHRjYXNlICd0b3AnOlxuXHRcdFx0XHRzbmlwcGV0U29ydE9yZGVyID0gU25pcHBldFNvcnRPcmRlci5Ub3A7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Ly8gXHRcdTIxOTMgdGhhdCdzIHRoZSBkZWZhdWx0IGFueXdheXMuLi5cblx0XHRcdC8vIGNhc2UgJ2lubGluZSc6XG5cdFx0XHQvLyBcdHNuaXBwZXRTb3J0T3JkZXIgPSBTbmlwcGV0U29ydE9yZGVyLklubGluZTtcblx0XHRcdC8vIFx0YnJlYWs7XG5cdFx0XHRjYXNlICdib3R0b20nOlxuXHRcdFx0XHRzbmlwcGV0U29ydE9yZGVyID0gU25pcHBldFNvcnRPcmRlci5Cb3R0b207XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgaXRlbUtpbmQ6IGl0ZW1LaW5kRmlsdGVyLCBzaG93RGVwcmVjYXRlZCB9ID0gU3VnZ2VzdE1vZGVsLmNyZWF0ZVN1Z2dlc3RGaWx0ZXIodGhpcy5fZWRpdG9yKTtcblx0XHRjb25zdCBjb21wbGV0aW9uT3B0aW9ucyA9IG5ldyBDb21wbGV0aW9uT3B0aW9ucyhzbmlwcGV0U29ydE9yZGVyLCBvcHRpb25zLmNvbXBsZXRpb25PcHRpb25zPy5raW5kRmlsdGVyID8/IGl0ZW1LaW5kRmlsdGVyLCBvcHRpb25zLmNvbXBsZXRpb25PcHRpb25zPy5wcm92aWRlckZpbHRlciwgb3B0aW9ucy5jb21wbGV0aW9uT3B0aW9ucz8ucHJvdmlkZXJJdGVtc1RvUmV1c2UsIHNob3dEZXByZWNhdGVkKTtcblx0XHRjb25zdCB3b3JkRGlzdGFuY2UgPSBXb3JkRGlzdGFuY2UuY3JlYXRlKHRoaXMuX2VkaXRvcldvcmtlclNlcnZpY2UsIHRoaXMuX2VkaXRvcik7XG5cblx0XHRjb25zdCBjb21wbGV0aW9ucyA9IHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMoXG5cdFx0XHR0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIsXG5cdFx0XHRtb2RlbCxcblx0XHRcdHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpLFxuXHRcdFx0Y29tcGxldGlvbk9wdGlvbnMsXG5cdFx0XHRzdWdnZXN0Q3R4LFxuXHRcdFx0dGhpcy5fcmVxdWVzdFRva2VuLnRva2VuXG5cdFx0KTtcblxuXHRcdFByb21pc2UuYWxsKFtjb21wbGV0aW9ucywgd29yZERpc3RhbmNlXSkudGhlbihhc3luYyAoW2NvbXBsZXRpb25zLCB3b3JkRGlzdGFuY2VdKSA9PiB7XG5cblx0XHRcdHRoaXMuX3JlcXVlc3RUb2tlbj8uZGlzcG9zZSgpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdGNvbXBsZXRpb25zLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjbGlwYm9hcmRUZXh0ID0gb3B0aW9ucz8uY2xpcGJvYXJkVGV4dDtcblx0XHRcdGlmICghY2xpcGJvYXJkVGV4dCAmJiBjb21wbGV0aW9ucy5uZWVkc0NsaXBib2FyZCkge1xuXHRcdFx0XHRjbGlwYm9hcmRUZXh0ID0gYXdhaXQgdGhpcy5fY2xpcGJvYXJkU2VydmljZS5yZWFkVGV4dCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fdHJpZ2dlclN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29tcGxldGlvbnMuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdC8vIGNvbnN0IGl0ZW1zID0gY29tcGxldGlvbnMuaXRlbXM7XG5cblx0XHRcdC8vIGlmIChleGlzdGluZykge1xuXHRcdFx0Ly8gXHRjb25zdCBjbXBGbiA9IGdldFN1Z2dlc3Rpb25Db21wYXJhdG9yKHNuaXBwZXRTb3J0T3JkZXIpO1xuXHRcdFx0Ly8gXHRpdGVtcyA9IGl0ZW1zLmNvbmNhdChleGlzdGluZy5pdGVtcykuc29ydChjbXBGbik7XG5cdFx0XHQvLyB9XG5cblx0XHRcdGNvbnN0IGN0eCA9IG5ldyBMaW5lQ29udGV4dChtb2RlbCwgdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCksIG9wdGlvbnMpO1xuXHRcdFx0Y29uc3QgZnV6enlTZWFyY2hPcHRpb25zID0ge1xuXHRcdFx0XHQuLi5GdXp6eVNjb3JlT3B0aW9ucy5kZWZhdWx0LFxuXHRcdFx0XHRmaXJzdE1hdGNoQ2FuQmVXZWFrOiAhdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdCkubWF0Y2hPbldvcmRTdGFydE9ubHlcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9jb21wbGV0aW9uTW9kZWwgPSBuZXcgQ29tcGxldGlvbk1vZGVsKGNvbXBsZXRpb25zLml0ZW1zLCB0aGlzLl9jb250ZXh0IS5jb2x1bW4sIHtcblx0XHRcdFx0bGVhZGluZ0xpbmVDb250ZW50OiBjdHgubGVhZGluZ0xpbmVDb250ZW50LFxuXHRcdFx0XHRjaGFyYWN0ZXJDb3VudERlbHRhOiBjdHguY29sdW1uIC0gdGhpcy5fY29udGV4dCEuY29sdW1uXG5cdFx0XHR9LFxuXHRcdFx0XHR3b3JkRGlzdGFuY2UsXG5cdFx0XHRcdHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpLFxuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zbmlwcGV0U3VnZ2VzdGlvbnMpLFxuXHRcdFx0XHRmdXp6eVNlYXJjaE9wdGlvbnMsXG5cdFx0XHRcdGNsaXBib2FyZFRleHRcblx0XHRcdCk7XG5cblx0XHRcdC8vIHN0b3JlIGNvbnRhaW5lcnMgc28gdGhhdCB0aGV5IGNhbiBiZSBkaXNwb3NlZCBsYXRlclxuXHRcdFx0dGhpcy5fY29tcGxldGlvbkRpc3Bvc2FibGVzLmFkZChjb21wbGV0aW9ucy5kaXNwb3NhYmxlKTtcblxuXHRcdFx0dGhpcy5fb25OZXdDb250ZXh0KGN0eCk7XG5cblx0XHRcdC8vIGZpbmFsbHkgcmVwb3J0IHRlbGVtZXRyeSBhYm91dCBkdXJhdGlvbnNcblx0XHRcdHRoaXMuX3JlcG9ydER1cmF0aW9uc1RlbGVtZXRyeShjb21wbGV0aW9ucy5kdXJhdGlvbnMpO1xuXG5cdFx0XHQvLyByZXBvcnQgaW52YWxpZCBjb21wbGV0aW9ucyBieSBzb3VyY2Vcblx0XHRcdGlmICghdGhpcy5fZW52U2VydmljZS5pc0J1aWx0IHx8IHRoaXMuX2VudlNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgY29tcGxldGlvbnMuaXRlbXMpIHtcblx0XHRcdFx0XHRpZiAoaXRlbS5pc0ludmFsaWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW3N1Z2dlc3RdIGRpZCBJR05PUkUgaW52YWxpZCBjb21wbGV0aW9uIGl0ZW0gZnJvbSAke2l0ZW0ucHJvdmlkZXIuX2RlYnVnRGlzcGxheU5hbWV9YCwgaXRlbS5jb21wbGV0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH0pLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBvcnQgZHVyYXRpb25zIHRlbGVtZXRyeSB3aXRoIGEgMSUgc2FtcGxpbmcgcmF0ZS5cblx0ICogVGhlIHRlbGVtZXRyeSBpcyByZXBvcnRlZCBvbmx5IGlmIGEgcmFuZG9tIG51bWJlciBiZXR3ZWVuIDAgYW5kIDEwMCBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gMS5cblx0ICovXG5cdHByaXZhdGUgX3JlcG9ydER1cmF0aW9uc1RlbGVtZXRyeShkdXJhdGlvbnM6IENvbXBsZXRpb25EdXJhdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAoTWF0aC5yYW5kb20oKSA+IDAuMDAwMSkgeyAvLyAwLjAxJVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dHlwZSBEdXJhdGlvbnMgPSB7IGRhdGE6IHN0cmluZyB9O1xuXHRcdFx0dHlwZSBEdXJhdGlvbnNDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdqcmlla2VuJztcblx0XHRcdFx0Y29tbWVudDogJ0NvbXBsZXRpb25zIHBlcmZvcm1hbmNlIG51bWJlcnMnO1xuXHRcdFx0XHRkYXRhOiB7IGNvbW1lbnQ6ICdEdXJhdGlvbnMgcGVyIHNvdXJjZSBhbmQgb3ZlcmFsbCc7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnIH07XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPER1cmF0aW9ucywgRHVyYXRpb25zQ2xhc3NpZmljYXRpb24+KCdzdWdnZXN0LmR1cmF0aW9ucy5qc29uJywgeyBkYXRhOiBKU09OLnN0cmluZ2lmeShkdXJhdGlvbnMpIH0pO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1Zygnc3VnZ2VzdC5kdXJhdGlvbnMuanNvbicsIGR1cmF0aW9ucyk7XG5cdFx0fSk7XG5cdH1cblxuXHRzdGF0aWMgY3JlYXRlU3VnZ2VzdEZpbHRlcihlZGl0b3I6IElDb2RlRWRpdG9yKTogeyBpdGVtS2luZDogU2V0PENvbXBsZXRpb25JdGVtS2luZD47IHNob3dEZXByZWNhdGVkOiBib29sZWFuIH0ge1xuXHRcdC8vIGtpbmQgZmlsdGVyIGFuZCBzbmlwcGV0IHNvcnQgcnVsZXNcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgU2V0PENvbXBsZXRpb25JdGVtS2luZD4oKTtcblxuXHRcdC8vIHNuaXBwZXQgc2V0dGluZ1xuXHRcdGNvbnN0IHNuaXBwZXRTdWdnZXN0aW9ucyA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNuaXBwZXRTdWdnZXN0aW9ucyk7XG5cdFx0aWYgKHNuaXBwZXRTdWdnZXN0aW9ucyA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KTtcblx0XHR9XG5cblx0XHQvLyB0eXBlIHNldHRpbmdcblx0XHRjb25zdCBzdWdnZXN0T3B0aW9ucyA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpO1xuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd01ldGhvZHMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuTWV0aG9kKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd0Z1bmN0aW9ucykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5GdW5jdGlvbik7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dDb25zdHJ1Y3RvcnMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuQ29uc3RydWN0b3IpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93RmllbGRzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkZpZWxkKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd1ZhcmlhYmxlcykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5WYXJpYWJsZSk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dDbGFzc2VzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkNsYXNzKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd1N0cnVjdHMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuU3RydWN0KTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd0ludGVyZmFjZXMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuSW50ZXJmYWNlKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd01vZHVsZXMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuTW9kdWxlKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd1Byb3BlcnRpZXMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHkpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93RXZlbnRzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLkV2ZW50KTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd09wZXJhdG9ycykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5PcGVyYXRvcik7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dVbml0cykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5Vbml0KTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd1ZhbHVlcykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5WYWx1ZSk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dDb25zdGFudHMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuQ29uc3RhbnQpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93RW51bXMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuRW51bSk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dFbnVtTWVtYmVycykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5FbnVtTWVtYmVyKTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd0tleXdvcmRzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLktleXdvcmQpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93V29yZHMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dDb2xvcnMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuQ29sb3IpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93RmlsZXMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuRmlsZSk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dSZWZlcmVuY2VzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLlJlZmVyZW5jZSk7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dDb2xvcnMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuQ3VzdG9tY29sb3IpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93Rm9sZGVycykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93VHlwZVBhcmFtZXRlcnMpIHsgcmVzdWx0LmFkZChDb21wbGV0aW9uSXRlbUtpbmQuVHlwZVBhcmFtZXRlcik7IH1cblx0XHRpZiAoIXN1Z2dlc3RPcHRpb25zLnNob3dTbmlwcGV0cykgeyByZXN1bHQuYWRkKENvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KTsgfVxuXHRcdGlmICghc3VnZ2VzdE9wdGlvbnMuc2hvd1VzZXJzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXIpOyB9XG5cdFx0aWYgKCFzdWdnZXN0T3B0aW9ucy5zaG93SXNzdWVzKSB7IHJlc3VsdC5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLklzc3VlKTsgfVxuXG5cdFx0cmV0dXJuIHsgaXRlbUtpbmQ6IHJlc3VsdCwgc2hvd0RlcHJlY2F0ZWQ6IHN1Z2dlc3RPcHRpb25zLnNob3dEZXByZWNhdGVkIH07XG5cdH1cblxuXHRwcml2YXRlIF9vbk5ld0NvbnRleHQoY3R4OiBMaW5lQ29udGV4dCk6IHZvaWQge1xuXG5cdFx0aWYgKCF0aGlzLl9jb250ZXh0KSB7XG5cdFx0XHQvLyBoYXBwZW5zIHdoZW4gMjR4NyBJbnRlbGxpU2Vuc2UgaXMgZW5hYmxlZCBhbmQgc3RpbGwgaW4gaXRzIGRlbGF5XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGN0eC5saW5lTnVtYmVyICE9PSB0aGlzLl9jb250ZXh0LmxpbmVOdW1iZXIpIHtcblx0XHRcdC8vIGUuZy4gaGFwcGVucyB3aGVuIHByZXNzaW5nIEVudGVyIHdoaWxlIEludGVsbGlTZW5zZSBpcyBjb21wdXRlZFxuXHRcdFx0dGhpcy5jYW5jZWwoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZ2V0TGVhZGluZ1doaXRlc3BhY2UoY3R4LmxlYWRpbmdMaW5lQ29udGVudCkgIT09IGdldExlYWRpbmdXaGl0ZXNwYWNlKHRoaXMuX2NvbnRleHQubGVhZGluZ0xpbmVDb250ZW50KSkge1xuXHRcdFx0Ly8gY2FuY2VsIEludGVsbGlTZW5zZSB3aGVuIGxpbmUgc3RhcnQgY2hhbmdlc1xuXHRcdFx0Ly8gaGFwcGVucyB3aGVuIHRoZSBjdXJyZW50IHdvcmQgZ2V0cyBvdXRkZW50ZWRcblx0XHRcdHRoaXMuY2FuY2VsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGN0eC5jb2x1bW4gPCB0aGlzLl9jb250ZXh0LmNvbHVtbikge1xuXHRcdFx0Ly8gdHlwZWQgLT4gbW92ZWQgY3Vyc29yIExFRlQgLT4gcmV0cmlnZ2VyIGlmIHN0aWxsIG9uIGEgd29yZFxuXHRcdFx0aWYgKGN0eC5sZWFkaW5nV29yZC53b3JkKSB7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcih7IGF1dG86IHRoaXMuX2NvbnRleHQudHJpZ2dlck9wdGlvbnMuYXV0bywgcmV0cmlnZ2VyOiB0cnVlIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2NvbXBsZXRpb25Nb2RlbCkge1xuXHRcdFx0Ly8gaGFwcGVucyB3aGVuIEludGVsbGlTZW5zZSBpcyBub3QgeWV0IGNvbXB1dGVkXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGN0eC5sZWFkaW5nV29yZC53b3JkLmxlbmd0aCAhPT0gMCAmJiBjdHgubGVhZGluZ1dvcmQuc3RhcnRDb2x1bW4gPiB0aGlzLl9jb250ZXh0LmxlYWRpbmdXb3JkLnN0YXJ0Q29sdW1uKSB7XG5cdFx0XHQvLyBzdGFydGVkIGEgbmV3IHdvcmQgd2hpbGUgSW50ZWxsaVNlbnNlIHNob3dzIC0+IHJldHJpZ2dlciBidXQgcmV1c2UgYWxsIGl0ZW1zIHRoYXQgd2UgY3VycmVudGx5IGhhdmVcblx0XHRcdGNvbnN0IHNob3VsZEF1dG9UcmlnZ2VyID0gTGluZUNvbnRleHQuc2hvdWxkQXV0b1RyaWdnZXIodGhpcy5fZWRpdG9yKTtcblx0XHRcdGlmIChzaG91bGRBdXRvVHJpZ2dlciAmJiB0aGlzLl9jb250ZXh0KSB7XG5cdFx0XHRcdC8vIHNob3VsZEF1dG9UcmlnZ2VyIGZvcmNlcyB0b2tlbml6YXRpb24sIHdoaWNoIGNhbiBjYXVzZSBwZW5kaW5nIGN1cnNvciBjaGFuZ2UgZXZlbnRzIHRvIGJlIGVtaXR0ZWQsIHdoaWNoIGNhbiBjYXVzZVxuXHRcdFx0XHQvLyBzdWdnZXN0aW9ucyB0byBiZSBjYW5jZWxsZWQsIHdoaWNoIGNhdXNlcyBgdGhpcy5fY29udGV4dGAgdG8gYmUgdW5kZWZpbmVkXG5cdFx0XHRcdGNvbnN0IG1hcCA9IHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5nZXRJdGVtc0J5UHJvdmlkZXIoKTtcblx0XHRcdFx0dGhpcy50cmlnZ2VyKHtcblx0XHRcdFx0XHRhdXRvOiB0aGlzLl9jb250ZXh0LnRyaWdnZXJPcHRpb25zLmF1dG8sXG5cdFx0XHRcdFx0cmV0cmlnZ2VyOiB0cnVlLFxuXHRcdFx0XHRcdGNsaXBib2FyZFRleHQ6IHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5jbGlwYm9hcmRUZXh0LFxuXHRcdFx0XHRcdGNvbXBsZXRpb25PcHRpb25zOiB7IHByb3ZpZGVySXRlbXNUb1JldXNlOiBtYXAgfVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoY3R4LmNvbHVtbiA+IHRoaXMuX2NvbnRleHQuY29sdW1uICYmIHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5nZXRJbmNvbXBsZXRlUHJvdmlkZXIoKS5zaXplID4gMCAmJiBjdHgubGVhZGluZ1dvcmQud29yZC5sZW5ndGggIT09IDApIHtcblx0XHRcdC8vIHR5cGVkIC0+IG1vdmVkIGN1cnNvciBSSUdIVCAmIGluY29tcGxlIG1vZGVsICYgc3RpbGwgb24gYSB3b3JkIC0+IHJldHJpZ2dlclxuXG5cdFx0XHRjb25zdCBwcm92aWRlckl0ZW1zVG9SZXVzZSA9IG5ldyBNYXA8Q29tcGxldGlvbkl0ZW1Qcm92aWRlciwgQ29tcGxldGlvbkl0ZW1bXT4oKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyRmlsdGVyID0gbmV3IFNldDxDb21wbGV0aW9uSXRlbVByb3ZpZGVyPigpO1xuXHRcdFx0Zm9yIChjb25zdCBbcHJvdmlkZXIsIGl0ZW1zXSBvZiB0aGlzLl9jb21wbGV0aW9uTW9kZWwuZ2V0SXRlbXNCeVByb3ZpZGVyKCkpIHtcblx0XHRcdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDAgJiYgaXRlbXNbMF0uY29udGFpbmVyLmluY29tcGxldGUpIHtcblx0XHRcdFx0XHRwcm92aWRlckZpbHRlci5hZGQocHJvdmlkZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb3ZpZGVySXRlbXNUb1JldXNlLnNldChwcm92aWRlciwgaXRlbXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJpZ2dlcih7XG5cdFx0XHRcdGF1dG86IHRoaXMuX2NvbnRleHQudHJpZ2dlck9wdGlvbnMuYXV0byxcblx0XHRcdFx0dHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC5UcmlnZ2VyRm9ySW5jb21wbGV0ZUNvbXBsZXRpb25zLFxuXHRcdFx0XHRyZXRyaWdnZXI6IHRydWUsXG5cdFx0XHRcdGNsaXBib2FyZFRleHQ6IHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5jbGlwYm9hcmRUZXh0LFxuXHRcdFx0XHRjb21wbGV0aW9uT3B0aW9uczogeyBwcm92aWRlckZpbHRlciwgcHJvdmlkZXJJdGVtc1RvUmV1c2UgfVxuXHRcdFx0fSk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gdHlwZWQgLT4gbW92ZWQgY3Vyc29yIFJJR0hUIC0+IHVwZGF0ZSBVSVxuXHRcdFx0Y29uc3Qgb2xkTGluZUNvbnRleHQgPSB0aGlzLl9jb21wbGV0aW9uTW9kZWwubGluZUNvbnRleHQ7XG5cdFx0XHRsZXQgaXNGcm96ZW4gPSBmYWxzZTtcblxuXHRcdFx0dGhpcy5fY29tcGxldGlvbk1vZGVsLmxpbmVDb250ZXh0ID0ge1xuXHRcdFx0XHRsZWFkaW5nTGluZUNvbnRlbnQ6IGN0eC5sZWFkaW5nTGluZUNvbnRlbnQsXG5cdFx0XHRcdGNoYXJhY3RlckNvdW50RGVsdGE6IGN0eC5jb2x1bW4gLSB0aGlzLl9jb250ZXh0LmNvbHVtblxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5pdGVtcy5sZW5ndGggPT09IDApIHtcblxuXHRcdFx0XHRjb25zdCBzaG91bGRBdXRvVHJpZ2dlciA9IExpbmVDb250ZXh0LnNob3VsZEF1dG9UcmlnZ2VyKHRoaXMuX2VkaXRvcik7XG5cdFx0XHRcdGlmICghdGhpcy5fY29udGV4dCkge1xuXHRcdFx0XHRcdC8vIHNob3VsZEF1dG9UcmlnZ2VyIGZvcmNlcyB0b2tlbml6YXRpb24sIHdoaWNoIGNhbiBjYXVzZSBwZW5kaW5nIGN1cnNvciBjaGFuZ2UgZXZlbnRzIHRvIGJlIGVtaXR0ZWQsIHdoaWNoIGNhbiBjYXVzZVxuXHRcdFx0XHRcdC8vIHN1Z2dlc3Rpb25zIHRvIGJlIGNhbmNlbGxlZCwgd2hpY2ggY2F1c2VzIGB0aGlzLl9jb250ZXh0YCB0byBiZSB1bmRlZmluZWRcblx0XHRcdFx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzaG91bGRBdXRvVHJpZ2dlciAmJiB0aGlzLl9jb250ZXh0LmxlYWRpbmdXb3JkLmVuZENvbHVtbiA8IGN0eC5sZWFkaW5nV29yZC5zdGFydENvbHVtbikge1xuXHRcdFx0XHRcdC8vIHJldHJpZ2dlciB3aGVuIGhlYWRpbmcgaW50byBhIG5ldyB3b3JkXG5cdFx0XHRcdFx0dGhpcy50cmlnZ2VyKHsgYXV0bzogdGhpcy5fY29udGV4dC50cmlnZ2VyT3B0aW9ucy5hdXRvLCByZXRyaWdnZXI6IHRydWUgfSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCF0aGlzLl9jb250ZXh0LnRyaWdnZXJPcHRpb25zLmF1dG8pIHtcblx0XHRcdFx0XHQvLyBmcmVlemUgd2hlbiBJbnRlbGxpU2Vuc2Ugd2FzIG1hbnVhbGx5IHJlcXVlc3RlZFxuXHRcdFx0XHRcdHRoaXMuX2NvbXBsZXRpb25Nb2RlbC5saW5lQ29udGV4dCA9IG9sZExpbmVDb250ZXh0O1xuXHRcdFx0XHRcdGlzRnJvemVuID0gdGhpcy5fY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCA+IDA7XG5cblx0XHRcdFx0XHRpZiAoaXNGcm96ZW4gJiYgY3R4LmxlYWRpbmdXb3JkLndvcmQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHQvLyB0aGVyZSB3ZXJlIHJlc3VsdHMgYmVmb3JlIGJ1dCBub3cgdGhlcmUgYXJlbid0XG5cdFx0XHRcdFx0XHQvLyBhbmQgYWxzbyB3ZSBhcmUgbm90IG9uIGEgd29yZCBhbnltb3JlIC0+IGNhbmNlbFxuXHRcdFx0XHRcdFx0dGhpcy5jYW5jZWwoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBub3RoaW5nIGxlZnRcblx0XHRcdFx0XHR0aGlzLmNhbmNlbCgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkRpZFN1Z2dlc3QuZmlyZSh7XG5cdFx0XHRcdGNvbXBsZXRpb25Nb2RlbDogdGhpcy5fY29tcGxldGlvbk1vZGVsLFxuXHRcdFx0XHR0cmlnZ2VyT3B0aW9uczogY3R4LnRyaWdnZXJPcHRpb25zLFxuXHRcdFx0XHRpc0Zyb3plbixcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuIl0s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QU0saUJBQWlCLG9CQUFJLElBQTRCO0FBQ3ZELGlCQUFXLENBQUMsVUFBVSxLQUFLLEtBQUssS0FBSyxpQkFBaUIsbUJBQW1CLEdBQUc7QUFDM0UsWUFBSSxNQUFNLFNBQVMsS0FBSyxNQUFNLENBQUMsRUFBRSxVQUFVLFlBQVk7QUFDdEQseUJBQWUsSUFBSSxRQUFRO0FBQUEsUUFDNUIsT0FBTztBQUNOLCtCQUFxQixJQUFJLFVBQVUsS0FBSztBQUFBLFFBQ3pDO0FBQUEsTUFDRDtBQUVBLFdBQUssUUFBUTtBQUFBLFFBQ1osTUFBTSxLQUFLLFNBQVMsZUFBZTtBQUFBLFFBQ25DLGFBQWEsc0JBQXNCO0FBQUEsUUFDbkMsV0FBVztBQUFBLFFBQ1gsZUFBZSxLQUFLLGlCQUFpQjtBQUFBLFFBQ3JDLG1CQUFtQixFQUFFLGdCQUFnQixxQkFBcUI7QUFBQSxNQUMzRCxDQUFDO0FBQUEsSUFFRixPQUFPO0FBRU4sWUFBTSxpQkFBaUIsS0FBSyxpQkFBaUI7QUFDN0MsVUFBSSxXQUFXO0FBRWYsV0FBSyxpQkFBaUIsY0FBYztBQUFBLFFBQ25DLG9CQUFvQixJQUFJO0FBQUEsUUFDeEIscUJBQXFCLElBQUksU0FBUyxLQUFLLFNBQVM7QUFBQSxNQUNqRDtBQUVBLFVBQUksS0FBSyxpQkFBaUIsTUFBTSxXQUFXLEdBQUc7QUFFN0MsY0FBTSxvQkFBb0IsWUFBWSxrQkFBa0IsS0FBSyxPQUFPO0FBQ3BFLFlBQUksQ0FBQyxLQUFLLFVBQVU7QUFHbkIsZUFBSyxPQUFPO0FBQ1o7QUFBQSxRQUNEO0FBRUEsWUFBSSxxQkFBcUIsS0FBSyxTQUFTLFlBQVksWUFBWSxJQUFJLFlBQVksYUFBYTtBQUUzRixlQUFLLFFBQVEsRUFBRSxNQUFNLEtBQUssU0FBUyxlQUFlLE1BQU0sV0FBVyxLQUFLLENBQUM7QUFDekU7QUFBQSxRQUNEO0FBRUEsWUFBSSxDQUFDLEtBQUssU0FBUyxlQUFlLE1BQU07QUFFdkMsZUFBSyxpQkFBaUIsY0FBYztBQUNwQyxxQkFBVyxLQUFLLGlCQUFpQixNQUFNLFNBQVM7QUFFaEQsY0FBSSxZQUFZLElBQUksWUFBWSxLQUFLLFdBQVcsR0FBRztBQUdsRCxpQkFBSyxPQUFPO0FBQ1o7QUFBQSxVQUNEO0FBQUEsUUFFRCxPQUFPO0FBRU4sZUFBSyxPQUFPO0FBQ1o7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFdBQUssY0FBYyxLQUFLO0FBQUEsUUFDdkIsaUJBQWlCLEtBQUs7QUFBQSxRQUN0QixnQkFBZ0IsSUFBSTtBQUFBLFFBQ3BCO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFDRDtBQXBzQmEsZUFBTjtBQUFBLEVBd0JKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBL0JVOyIsCiAgIm5hbWVzIjogWyJTdGF0ZSIsICJjb21wbGV0aW9ucyIsICJ3b3JkRGlzdGFuY2UiLCAibW9kZWwiLCAiY3R4Il0KfQo=
