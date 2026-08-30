import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CancellationError, isCancellationError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { FuzzyScore } from "../../../../base/common/filters.js";
import { DisposableStore, isDisposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import * as languages from "../../../common/languages.js";
import { ITextModelService } from "../../../common/services/resolverService.js";
import { SnippetParser } from "../../snippet/browser/snippetParser.js";
import { localize } from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { historyNavigationVisible } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { StandardTokenType } from "../../../common/encodedTokenAttributes.js";
const Context = {
  Visible: historyNavigationVisible,
  HasFocusedSuggestion: new RawContextKey("suggestWidgetHasFocusedSuggestion", false, localize("suggestWidgetHasSelection", "Whether any suggestion is focused")),
  DetailsVisible: new RawContextKey("suggestWidgetDetailsVisible", false, localize("suggestWidgetDetailsVisible", "Whether suggestion details are visible")),
  DetailsFocused: new RawContextKey("suggestWidgetDetailsFocused", false, localize("suggestWidgetDetailsFocused", "Whether the details pane of the suggest widget has focus")),
  MultipleSuggestions: new RawContextKey("suggestWidgetMultipleSuggestions", false, localize("suggestWidgetMultipleSuggestions", "Whether there are multiple suggestions to pick from")),
  MakesTextEdit: new RawContextKey("suggestionMakesTextEdit", true, localize("suggestionMakesTextEdit", "Whether inserting the current suggestion yields in a change or has everything already been typed")),
  AcceptSuggestionsOnEnter: new RawContextKey("acceptSuggestionOnEnter", true, localize("acceptSuggestionOnEnter", "Whether suggestions are inserted when pressing Enter")),
  HasInsertAndReplaceRange: new RawContextKey("suggestionHasInsertAndReplaceRange", false, localize("suggestionHasInsertAndReplaceRange", "Whether the current suggestion has insert and replace behaviour")),
  InsertMode: new RawContextKey("suggestionInsertMode", void 0, { type: "string", description: localize("suggestionInsertMode", "Whether the default behaviour is to insert or replace") }),
  CanResolve: new RawContextKey("suggestionCanResolve", false, localize("suggestionCanResolve", "Whether the current suggestion supports to resolve further details"))
};
const suggestWidgetStatusbarMenu = new MenuId("suggestWidgetStatusBar");
class CompletionItem {
  constructor(position, completion, container, provider) {
    this.position = position;
    this.completion = completion;
    this.container = container;
    this.provider = provider;
    // validation
    this.isInvalid = false;
    // sorting, filtering
    this.score = FuzzyScore.Default;
    this.distance = 0;
    this.textLabel = typeof completion.label === "string" ? completion.label : completion.label?.label;
    this.labelLow = this.textLabel.toLowerCase();
    this.isInvalid = !this.textLabel;
    this.sortTextLow = completion.sortText && completion.sortText.toLowerCase();
    this.filterTextLow = completion.filterText && completion.filterText.toLowerCase();
    this.extensionId = completion.extensionId;
    if (Range.isIRange(completion.range)) {
      this.editStart = new Position(completion.range.startLineNumber, completion.range.startColumn);
      this.editInsertEnd = new Position(completion.range.endLineNumber, completion.range.endColumn);
      this.editReplaceEnd = new Position(completion.range.endLineNumber, completion.range.endColumn);
      this.isInvalid = this.isInvalid || Range.spansMultipleLines(completion.range) || completion.range.startLineNumber !== position.lineNumber;
    } else {
      this.editStart = new Position(completion.range.insert.startLineNumber, completion.range.insert.startColumn);
      this.editInsertEnd = new Position(completion.range.insert.endLineNumber, completion.range.insert.endColumn);
      this.editReplaceEnd = new Position(completion.range.replace.endLineNumber, completion.range.replace.endColumn);
      this.isInvalid = this.isInvalid || Range.spansMultipleLines(completion.range.insert) || Range.spansMultipleLines(completion.range.replace) || completion.range.insert.startLineNumber !== position.lineNumber || completion.range.replace.startLineNumber !== position.lineNumber || completion.range.insert.startColumn !== completion.range.replace.startColumn;
    }
    if (typeof provider.resolveCompletionItem !== "function") {
      this._resolveCache = Promise.resolve();
      this._resolveDuration = 0;
    }
  }
  // ---- resolving
  get isResolved() {
    return this._resolveDuration !== void 0;
  }
  get resolveDuration() {
    return this._resolveDuration !== void 0 ? this._resolveDuration : -1;
  }
  async resolve(token) {
    if (!this._resolveCache) {
      const sub = token.onCancellationRequested(() => {
        this._resolveCache = void 0;
        this._resolveDuration = void 0;
      });
      const sw = new StopWatch(true);
      this._resolveCache = Promise.resolve(this.provider.resolveCompletionItem(this.completion, token)).then((value) => {
        Object.assign(this.completion, value);
        this._resolveDuration = sw.elapsed();
      }, (err) => {
        if (isCancellationError(err)) {
          this._resolveCache = void 0;
          this._resolveDuration = void 0;
        }
      }).finally(() => {
        sub.dispose();
      });
    }
    return this._resolveCache;
  }
}
var SnippetSortOrder = /* @__PURE__ */ ((SnippetSortOrder2) => {
  SnippetSortOrder2[SnippetSortOrder2["Top"] = 0] = "Top";
  SnippetSortOrder2[SnippetSortOrder2["Inline"] = 1] = "Inline";
  SnippetSortOrder2[SnippetSortOrder2["Bottom"] = 2] = "Bottom";
  return SnippetSortOrder2;
})(SnippetSortOrder || {});
const _CompletionOptions = class _CompletionOptions {
  constructor(snippetSortOrder = 2 /* Bottom */, kindFilter = /* @__PURE__ */ new Set(), providerFilter = /* @__PURE__ */ new Set(), providerItemsToReuse = /* @__PURE__ */ new Map(), showDeprecated = true) {
    this.snippetSortOrder = snippetSortOrder;
    this.kindFilter = kindFilter;
    this.providerFilter = providerFilter;
    this.providerItemsToReuse = providerItemsToReuse;
    this.showDeprecated = showDeprecated;
  }
};
_CompletionOptions.default = new _CompletionOptions();
let CompletionOptions = _CompletionOptions;
let _snippetSuggestSupport;
function getSnippetSuggestSupport() {
  return _snippetSuggestSupport;
}
function setSnippetSuggestSupport(support) {
  const old = _snippetSuggestSupport;
  _snippetSuggestSupport = support;
  return old;
}
class CompletionItemModel {
  constructor(items, needsClipboard, durations, disposable) {
    this.items = items;
    this.needsClipboard = needsClipboard;
    this.durations = durations;
    this.disposable = disposable;
  }
}
async function provideSuggestionItems(registry, model, position, options = CompletionOptions.default, context = { triggerKind: languages.CompletionTriggerKind.Invoke }, token = CancellationToken.None) {
  const sw = new StopWatch();
  position = position.clone();
  const word = model.getWordAtPosition(position);
  const defaultReplaceRange = word ? new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : Range.fromPositions(position);
  const defaultRange = { replace: defaultReplaceRange, insert: defaultReplaceRange.setEndPosition(position.lineNumber, position.column) };
  const result = [];
  const disposables = new DisposableStore();
  const durations = [];
  let needsClipboard = false;
  const onCompletionList = (provider, container, sw2) => {
    let didAddResult = false;
    if (!container) {
      return didAddResult;
    }
    for (const suggestion of container.suggestions) {
      if (!options.kindFilter.has(suggestion.kind)) {
        if (!options.showDeprecated && suggestion?.tags?.includes(languages.CompletionItemTag.Deprecated)) {
          continue;
        }
        if (!suggestion.range) {
          suggestion.range = defaultRange;
        }
        if (!suggestion.sortText) {
          suggestion.sortText = typeof suggestion.label === "string" ? suggestion.label : suggestion.label.label;
        }
        if (!needsClipboard && suggestion.insertTextRules && suggestion.insertTextRules & languages.CompletionItemInsertTextRule.InsertAsSnippet) {
          needsClipboard = SnippetParser.guessNeedsClipboard(suggestion.insertText);
        }
        result.push(new CompletionItem(position, suggestion, container, provider));
        didAddResult = true;
      }
    }
    if (isDisposable(container)) {
      disposables.add(container);
    }
    durations.push({
      providerName: provider._debugDisplayName ?? "unknown_provider",
      elapsedProvider: container.duration ?? -1,
      elapsedOverall: sw2.elapsed()
    });
    return didAddResult;
  };
  const snippetCompletions = (async () => {
    if (!_snippetSuggestSupport || options.kindFilter.has(languages.CompletionItemKind.Snippet)) {
      return;
    }
    const reuseItems = options.providerItemsToReuse.get(_snippetSuggestSupport);
    if (reuseItems) {
      reuseItems.forEach((item) => result.push(item));
      return;
    }
    if (options.providerFilter.size > 0 && !options.providerFilter.has(_snippetSuggestSupport)) {
      return;
    }
    const sw2 = new StopWatch();
    const list = await _snippetSuggestSupport.provideCompletionItems(model, position, context, token);
    onCompletionList(_snippetSuggestSupport, list, sw2);
  })();
  for (const providerGroup of registry.orderedGroups(model)) {
    let didAddResult = false;
    await Promise.all(providerGroup.map(async (provider) => {
      if (options.providerItemsToReuse.has(provider)) {
        const items = options.providerItemsToReuse.get(provider);
        items.forEach((item) => result.push(item));
        didAddResult = didAddResult || items.length > 0;
        return;
      }
      if (options.providerFilter.size > 0 && !options.providerFilter.has(provider)) {
        return;
      }
      try {
        const sw2 = new StopWatch();
        const list = await provider.provideCompletionItems(model, position, context, token);
        didAddResult = onCompletionList(provider, list, sw2) || didAddResult;
      } catch (err) {
        onUnexpectedExternalError(err);
      }
    }));
    if (didAddResult || token.isCancellationRequested) {
      break;
    }
  }
  await snippetCompletions;
  if (token.isCancellationRequested) {
    disposables.dispose();
    return Promise.reject(new CancellationError());
  }
  return new CompletionItemModel(
    result.sort(getSuggestionComparator(options.snippetSortOrder)),
    needsClipboard,
    { entries: durations, elapsed: sw.elapsed() },
    disposables
  );
}
function defaultComparator(a, b) {
  if (a.sortTextLow && b.sortTextLow) {
    if (a.sortTextLow < b.sortTextLow) {
      return -1;
    } else if (a.sortTextLow > b.sortTextLow) {
      return 1;
    }
  }
  if (a.textLabel < b.textLabel) {
    return -1;
  } else if (a.textLabel > b.textLabel) {
    return 1;
  }
  return a.completion.kind - b.completion.kind;
}
function snippetUpComparator(a, b) {
  if (a.completion.kind !== b.completion.kind) {
    if (a.completion.kind === languages.CompletionItemKind.Snippet) {
      return -1;
    } else if (b.completion.kind === languages.CompletionItemKind.Snippet) {
      return 1;
    }
  }
  return defaultComparator(a, b);
}
function snippetDownComparator(a, b) {
  if (a.completion.kind !== b.completion.kind) {
    if (a.completion.kind === languages.CompletionItemKind.Snippet) {
      return 1;
    } else if (b.completion.kind === languages.CompletionItemKind.Snippet) {
      return -1;
    }
  }
  return defaultComparator(a, b);
}
const _snippetComparators = /* @__PURE__ */ new Map();
_snippetComparators.set(0 /* Top */, snippetUpComparator);
_snippetComparators.set(2 /* Bottom */, snippetDownComparator);
_snippetComparators.set(1 /* Inline */, defaultComparator);
function getSuggestionComparator(snippetConfig) {
  return _snippetComparators.get(snippetConfig);
}
CommandsRegistry.registerCommand("_executeCompletionItemProvider", async (accessor, ...args) => {
  const [uri, position, triggerCharacter, maxItemsToResolve] = args;
  assertType(URI.isUri(uri));
  assertType(Position.isIPosition(position));
  assertType(typeof triggerCharacter === "string" || !triggerCharacter);
  assertType(typeof maxItemsToResolve === "number" || !maxItemsToResolve);
  const { completionProvider } = accessor.get(ILanguageFeaturesService);
  const ref = await accessor.get(ITextModelService).createModelReference(uri);
  try {
    const result = {
      incomplete: false,
      suggestions: []
    };
    const resolving = [];
    const actualPosition = ref.object.textEditorModel.validatePosition(position);
    const completions = await provideSuggestionItems(completionProvider, ref.object.textEditorModel, actualPosition, void 0, { triggerCharacter: triggerCharacter ?? void 0, triggerKind: triggerCharacter ? languages.CompletionTriggerKind.TriggerCharacter : languages.CompletionTriggerKind.Invoke });
    for (const item of completions.items) {
      if (resolving.length < (maxItemsToResolve ?? 0)) {
        resolving.push(item.resolve(CancellationToken.None));
      }
      result.incomplete = result.incomplete || item.container.incomplete;
      result.suggestions.push(item.completion);
    }
    try {
      await Promise.all(resolving);
      return result;
    } finally {
      setTimeout(() => completions.disposable.dispose(), 100);
    }
  } finally {
    ref.dispose();
  }
});
function showSimpleSuggestions(editor, provider) {
  editor.getContribution("editor.contrib.suggestController")?.triggerSuggest(
    (/* @__PURE__ */ new Set()).add(provider),
    void 0,
    true
  );
}
class QuickSuggestionsOptions {
  static isAllOff(config) {
    return config.other === "off" && config.comments === "off" && config.strings === "off";
  }
  static isAllOn(config) {
    return config.other === "on" && config.comments === "on" && config.strings === "on";
  }
  static valueFor(config, tokenType) {
    switch (tokenType) {
      case StandardTokenType.Comment:
        return config.comments;
      case StandardTokenType.String:
        return config.strings;
      default:
        return config.other;
    }
  }
}
export {
  CompletionItem,
  CompletionItemModel,
  CompletionOptions,
  Context,
  QuickSuggestionsOptions,
  SnippetSortOrder,
  getSnippetSuggestSupport,
  getSuggestionComparator,
  provideSuggestionItems,
  setSnippetSuggestSupport,
  showSimpleSuggestions,
  suggestWidgetStatusbarMenu
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXGJyb3dzZXJcXHN1Z2dlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgaXNDYW5jZWxsYXRpb25FcnJvciwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBpc0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU25pcHBldFBhcnNlciB9IGZyb20gJy4uLy4uL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0UGFyc2VyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZUZlYXR1cmVSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBoaXN0b3J5TmF2aWdhdGlvblZpc2libGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9oaXN0b3J5L2Jyb3dzZXIvY29udGV4dFNjb3BlZEhpc3RvcnlXaWRnZXQuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucywgUXVpY2tTdWdnZXN0aW9uc1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkVG9rZW5UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuXG5leHBvcnQgY29uc3QgQ29udGV4dCA9IHtcblx0VmlzaWJsZTogaGlzdG9yeU5hdmlnYXRpb25WaXNpYmxlLFxuXHRIYXNGb2N1c2VkU3VnZ2VzdGlvbjogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3N1Z2dlc3RXaWRnZXRIYXNGb2N1c2VkU3VnZ2VzdGlvbicsIGZhbHNlLCBsb2NhbGl6ZSgnc3VnZ2VzdFdpZGdldEhhc1NlbGVjdGlvbicsIFwiV2hldGhlciBhbnkgc3VnZ2VzdGlvbiBpcyBmb2N1c2VkXCIpKSxcblx0RGV0YWlsc1Zpc2libGU6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzdWdnZXN0V2lkZ2V0RGV0YWlsc1Zpc2libGUnLCBmYWxzZSwgbG9jYWxpemUoJ3N1Z2dlc3RXaWRnZXREZXRhaWxzVmlzaWJsZScsIFwiV2hldGhlciBzdWdnZXN0aW9uIGRldGFpbHMgYXJlIHZpc2libGVcIikpLFxuXHREZXRhaWxzRm9jdXNlZDogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3N1Z2dlc3RXaWRnZXREZXRhaWxzRm9jdXNlZCcsIGZhbHNlLCBsb2NhbGl6ZSgnc3VnZ2VzdFdpZGdldERldGFpbHNGb2N1c2VkJywgXCJXaGV0aGVyIHRoZSBkZXRhaWxzIHBhbmUgb2YgdGhlIHN1Z2dlc3Qgd2lkZ2V0IGhhcyBmb2N1c1wiKSksXG5cdE11bHRpcGxlU3VnZ2VzdGlvbnM6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzdWdnZXN0V2lkZ2V0TXVsdGlwbGVTdWdnZXN0aW9ucycsIGZhbHNlLCBsb2NhbGl6ZSgnc3VnZ2VzdFdpZGdldE11bHRpcGxlU3VnZ2VzdGlvbnMnLCBcIldoZXRoZXIgdGhlcmUgYXJlIG11bHRpcGxlIHN1Z2dlc3Rpb25zIHRvIHBpY2sgZnJvbVwiKSksXG5cdE1ha2VzVGV4dEVkaXQ6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzdWdnZXN0aW9uTWFrZXNUZXh0RWRpdCcsIHRydWUsIGxvY2FsaXplKCdzdWdnZXN0aW9uTWFrZXNUZXh0RWRpdCcsIFwiV2hldGhlciBpbnNlcnRpbmcgdGhlIGN1cnJlbnQgc3VnZ2VzdGlvbiB5aWVsZHMgaW4gYSBjaGFuZ2Ugb3IgaGFzIGV2ZXJ5dGhpbmcgYWxyZWFkeSBiZWVuIHR5cGVkXCIpKSxcblx0QWNjZXB0U3VnZ2VzdGlvbnNPbkVudGVyOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXInLCB0cnVlLCBsb2NhbGl6ZSgnYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXInLCBcIldoZXRoZXIgc3VnZ2VzdGlvbnMgYXJlIGluc2VydGVkIHdoZW4gcHJlc3NpbmcgRW50ZXJcIikpLFxuXHRIYXNJbnNlcnRBbmRSZXBsYWNlUmFuZ2U6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzdWdnZXN0aW9uSGFzSW5zZXJ0QW5kUmVwbGFjZVJhbmdlJywgZmFsc2UsIGxvY2FsaXplKCdzdWdnZXN0aW9uSGFzSW5zZXJ0QW5kUmVwbGFjZVJhbmdlJywgXCJXaGV0aGVyIHRoZSBjdXJyZW50IHN1Z2dlc3Rpb24gaGFzIGluc2VydCBhbmQgcmVwbGFjZSBiZWhhdmlvdXJcIikpLFxuXHRJbnNlcnRNb2RlOiBuZXcgUmF3Q29udGV4dEtleTwnaW5zZXJ0JyB8ICdyZXBsYWNlJz4oJ3N1Z2dlc3Rpb25JbnNlcnRNb2RlJywgdW5kZWZpbmVkLCB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3N1Z2dlc3Rpb25JbnNlcnRNb2RlJywgXCJXaGV0aGVyIHRoZSBkZWZhdWx0IGJlaGF2aW91ciBpcyB0byBpbnNlcnQgb3IgcmVwbGFjZVwiKSB9KSxcblx0Q2FuUmVzb2x2ZTogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3N1Z2dlc3Rpb25DYW5SZXNvbHZlJywgZmFsc2UsIGxvY2FsaXplKCdzdWdnZXN0aW9uQ2FuUmVzb2x2ZScsIFwiV2hldGhlciB0aGUgY3VycmVudCBzdWdnZXN0aW9uIHN1cHBvcnRzIHRvIHJlc29sdmUgZnVydGhlciBkZXRhaWxzXCIpKSxcbn07XG5cbmV4cG9ydCBjb25zdCBzdWdnZXN0V2lkZ2V0U3RhdHVzYmFyTWVudSA9IG5ldyBNZW51SWQoJ3N1Z2dlc3RXaWRnZXRTdGF0dXNCYXInKTtcblxuZXhwb3J0IGNsYXNzIENvbXBsZXRpb25JdGVtIHtcblxuXHRfYnJhbmQhOiAnSVN1Z2dlc3Rpb25JdGVtJztcblxuXHQvL1xuXHRyZWFkb25seSBlZGl0U3RhcnQ6IElQb3NpdGlvbjtcblx0cmVhZG9ubHkgZWRpdEluc2VydEVuZDogSVBvc2l0aW9uO1xuXHRyZWFkb25seSBlZGl0UmVwbGFjZUVuZDogSVBvc2l0aW9uO1xuXG5cdC8vXG5cdHJlYWRvbmx5IHRleHRMYWJlbDogc3RyaW5nO1xuXG5cdC8vIHBlcmZcblx0cmVhZG9ubHkgbGFiZWxMb3c6IHN0cmluZztcblx0cmVhZG9ubHkgc29ydFRleHRMb3c/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZpbHRlclRleHRMb3c/OiBzdHJpbmc7XG5cblx0Ly8gdmFsaWRhdGlvblxuXHRyZWFkb25seSBpc0ludmFsaWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHQvLyBzb3J0aW5nLCBmaWx0ZXJpbmdcblx0c2NvcmU6IEZ1enp5U2NvcmUgPSBGdXp6eVNjb3JlLkRlZmF1bHQ7XG5cdGRpc3RhbmNlOiBudW1iZXIgPSAwO1xuXHRpZHg/OiBudW1iZXI7XG5cdHdvcmQ/OiBzdHJpbmc7XG5cblx0Ly8gaW5zdHJ1bWVudGF0aW9uXG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkPzogRXh0ZW5zaW9uSWRlbnRpZmllcjtcblxuXHQvLyByZXNvbHZpbmdcblx0cHJpdmF0ZSBfcmVzb2x2ZUR1cmF0aW9uPzogbnVtYmVyO1xuXHRwcml2YXRlIF9yZXNvbHZlQ2FjaGU/OiBQcm9taXNlPHZvaWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHBvc2l0aW9uOiBJUG9zaXRpb24sXG5cdFx0cmVhZG9ubHkgY29tcGxldGlvbjogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtLFxuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogbGFuZ3VhZ2VzLkNvbXBsZXRpb25MaXN0LFxuXHRcdHJlYWRvbmx5IHByb3ZpZGVyOiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcixcblx0KSB7XG5cdFx0dGhpcy50ZXh0TGFiZWwgPSB0eXBlb2YgY29tcGxldGlvbi5sYWJlbCA9PT0gJ3N0cmluZydcblx0XHRcdD8gY29tcGxldGlvbi5sYWJlbFxuXHRcdFx0OiBjb21wbGV0aW9uLmxhYmVsPy5sYWJlbDtcblxuXHRcdC8vIGVuc3VyZSBsb3dlci12YXJpYW50cyAocGVyZilcblx0XHR0aGlzLmxhYmVsTG93ID0gdGhpcy50ZXh0TGFiZWwudG9Mb3dlckNhc2UoKTtcblxuXHRcdC8vIHZhbGlkYXRlIGxhYmVsXG5cdFx0dGhpcy5pc0ludmFsaWQgPSAhdGhpcy50ZXh0TGFiZWw7XG5cblx0XHR0aGlzLnNvcnRUZXh0TG93ID0gY29tcGxldGlvbi5zb3J0VGV4dCAmJiBjb21wbGV0aW9uLnNvcnRUZXh0LnRvTG93ZXJDYXNlKCk7XG5cdFx0dGhpcy5maWx0ZXJUZXh0TG93ID0gY29tcGxldGlvbi5maWx0ZXJUZXh0ICYmIGNvbXBsZXRpb24uZmlsdGVyVGV4dC50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0dGhpcy5leHRlbnNpb25JZCA9IGNvbXBsZXRpb24uZXh0ZW5zaW9uSWQ7XG5cblx0XHQvLyBub3JtYWxpemUgcmFuZ2VzXG5cdFx0aWYgKFJhbmdlLmlzSVJhbmdlKGNvbXBsZXRpb24ucmFuZ2UpKSB7XG5cdFx0XHR0aGlzLmVkaXRTdGFydCA9IG5ldyBQb3NpdGlvbihjb21wbGV0aW9uLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgY29tcGxldGlvbi5yYW5nZS5zdGFydENvbHVtbik7XG5cdFx0XHR0aGlzLmVkaXRJbnNlcnRFbmQgPSBuZXcgUG9zaXRpb24oY29tcGxldGlvbi5yYW5nZS5lbmRMaW5lTnVtYmVyLCBjb21wbGV0aW9uLnJhbmdlLmVuZENvbHVtbik7XG5cdFx0XHR0aGlzLmVkaXRSZXBsYWNlRW5kID0gbmV3IFBvc2l0aW9uKGNvbXBsZXRpb24ucmFuZ2UuZW5kTGluZU51bWJlciwgY29tcGxldGlvbi5yYW5nZS5lbmRDb2x1bW4pO1xuXG5cdFx0XHQvLyB2YWxpZGF0ZSByYW5nZVxuXHRcdFx0dGhpcy5pc0ludmFsaWQgPSB0aGlzLmlzSW52YWxpZFxuXHRcdFx0XHR8fCBSYW5nZS5zcGFuc011bHRpcGxlTGluZXMoY29tcGxldGlvbi5yYW5nZSkgfHwgY29tcGxldGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IHBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lZGl0U3RhcnQgPSBuZXcgUG9zaXRpb24oY29tcGxldGlvbi5yYW5nZS5pbnNlcnQuc3RhcnRMaW5lTnVtYmVyLCBjb21wbGV0aW9uLnJhbmdlLmluc2VydC5zdGFydENvbHVtbik7XG5cdFx0XHR0aGlzLmVkaXRJbnNlcnRFbmQgPSBuZXcgUG9zaXRpb24oY29tcGxldGlvbi5yYW5nZS5pbnNlcnQuZW5kTGluZU51bWJlciwgY29tcGxldGlvbi5yYW5nZS5pbnNlcnQuZW5kQ29sdW1uKTtcblx0XHRcdHRoaXMuZWRpdFJlcGxhY2VFbmQgPSBuZXcgUG9zaXRpb24oY29tcGxldGlvbi5yYW5nZS5yZXBsYWNlLmVuZExpbmVOdW1iZXIsIGNvbXBsZXRpb24ucmFuZ2UucmVwbGFjZS5lbmRDb2x1bW4pO1xuXG5cdFx0XHQvLyB2YWxpZGF0ZSByYW5nZXNcblx0XHRcdHRoaXMuaXNJbnZhbGlkID0gdGhpcy5pc0ludmFsaWRcblx0XHRcdFx0fHwgUmFuZ2Uuc3BhbnNNdWx0aXBsZUxpbmVzKGNvbXBsZXRpb24ucmFuZ2UuaW5zZXJ0KSB8fCBSYW5nZS5zcGFuc011bHRpcGxlTGluZXMoY29tcGxldGlvbi5yYW5nZS5yZXBsYWNlKVxuXHRcdFx0XHR8fCBjb21wbGV0aW9uLnJhbmdlLmluc2VydC5zdGFydExpbmVOdW1iZXIgIT09IHBvc2l0aW9uLmxpbmVOdW1iZXIgfHwgY29tcGxldGlvbi5yYW5nZS5yZXBsYWNlLnN0YXJ0TGluZU51bWJlciAhPT0gcG9zaXRpb24ubGluZU51bWJlclxuXHRcdFx0XHR8fCBjb21wbGV0aW9uLnJhbmdlLmluc2VydC5zdGFydENvbHVtbiAhPT0gY29tcGxldGlvbi5yYW5nZS5yZXBsYWNlLnN0YXJ0Q29sdW1uO1xuXHRcdH1cblxuXHRcdC8vIGNyZWF0ZSB0aGUgc3VnZ2VzdGlvbiByZXNvbHZlclxuXHRcdGlmICh0eXBlb2YgcHJvdmlkZXIucmVzb2x2ZUNvbXBsZXRpb25JdGVtICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHR0aGlzLl9yZXNvbHZlQ2FjaGUgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdHRoaXMuX3Jlc29sdmVEdXJhdGlvbiA9IDA7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSByZXNvbHZpbmdcblxuXHRnZXQgaXNSZXNvbHZlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZUR1cmF0aW9uICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgcmVzb2x2ZUR1cmF0aW9uKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVEdXJhdGlvbiAhPT0gdW5kZWZpbmVkID8gdGhpcy5fcmVzb2x2ZUR1cmF0aW9uIDogLTE7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdGlmICghdGhpcy5fcmVzb2x2ZUNhY2hlKSB7XG5cdFx0XHRjb25zdCBzdWIgPSB0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVDYWNoZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZUR1cmF0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2godHJ1ZSk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlQ2FjaGUgPSBQcm9taXNlLnJlc29sdmUodGhpcy5wcm92aWRlci5yZXNvbHZlQ29tcGxldGlvbkl0ZW0hKHRoaXMuY29tcGxldGlvbiwgdG9rZW4pKS50aGVuKHZhbHVlID0+IHtcblx0XHRcdFx0T2JqZWN0LmFzc2lnbih0aGlzLmNvbXBsZXRpb24sIHZhbHVlKTtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZUR1cmF0aW9uID0gc3cuZWxhcHNlZCgpO1xuXHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRcdC8vIHRoZSBJUEMgcXVldWUgd2lsbCByZWplY3QgdGhlIHJlcXVlc3Qgd2l0aCB0aGVcblx0XHRcdFx0XHQvLyBjYW5jZWxsYXRpb24gZXJyb3IgLT4gcmVzZXQgY2FjaGVkXG5cdFx0XHRcdFx0dGhpcy5fcmVzb2x2ZUNhY2hlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc29sdmVEdXJhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc29sdmVDYWNoZTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBTbmlwcGV0U29ydE9yZGVyIHtcblx0VG9wLCBJbmxpbmUsIEJvdHRvbVxufVxuXG5leHBvcnQgY2xhc3MgQ29tcGxldGlvbk9wdGlvbnMge1xuXG5cdHN0YXRpYyByZWFkb25seSBkZWZhdWx0ID0gbmV3IENvbXBsZXRpb25PcHRpb25zKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgc25pcHBldFNvcnRPcmRlciA9IFNuaXBwZXRTb3J0T3JkZXIuQm90dG9tLFxuXHRcdHJlYWRvbmx5IGtpbmRGaWx0ZXIgPSBuZXcgU2V0PGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQ+KCksXG5cdFx0cmVhZG9ubHkgcHJvdmlkZXJGaWx0ZXIgPSBuZXcgU2V0PGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVByb3ZpZGVyPigpLFxuXHRcdHJlYWRvbmx5IHByb3ZpZGVySXRlbXNUb1JldXNlOiBSZWFkb25seU1hcDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgQ29tcGxldGlvbkl0ZW1bXT4gPSBuZXcgTWFwPGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVByb3ZpZGVyLCBDb21wbGV0aW9uSXRlbVtdPigpLFxuXHRcdHJlYWRvbmx5IHNob3dEZXByZWNhdGVkID0gdHJ1ZVxuXHQpIHsgfVxufVxuXG5sZXQgX3NuaXBwZXRTdWdnZXN0U3VwcG9ydDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTbmlwcGV0U3VnZ2VzdFN1cHBvcnQoKTogbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gX3NuaXBwZXRTdWdnZXN0U3VwcG9ydDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldFNuaXBwZXRTdWdnZXN0U3VwcG9ydChzdXBwb3J0OiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB8IHVuZGVmaW5lZCk6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgb2xkID0gX3NuaXBwZXRTdWdnZXN0U3VwcG9ydDtcblx0X3NuaXBwZXRTdWdnZXN0U3VwcG9ydCA9IHN1cHBvcnQ7XG5cdHJldHVybiBvbGQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tcGxldGlvbkR1cmF0aW9uRW50cnkge1xuXHRyZWFkb25seSBwcm92aWRlck5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZWxhcHNlZFByb3ZpZGVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IGVsYXBzZWRPdmVyYWxsOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29tcGxldGlvbkR1cmF0aW9ucyB7XG5cdHJlYWRvbmx5IGVudHJpZXM6IHJlYWRvbmx5IENvbXBsZXRpb25EdXJhdGlvbkVudHJ5W107XG5cdHJlYWRvbmx5IGVsYXBzZWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbXBsZXRpb25JdGVtTW9kZWwge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpdGVtczogQ29tcGxldGlvbkl0ZW1bXSxcblx0XHRyZWFkb25seSBuZWVkc0NsaXBib2FyZDogYm9vbGVhbixcblx0XHRyZWFkb25seSBkdXJhdGlvbnM6IENvbXBsZXRpb25EdXJhdGlvbnMsXG5cdFx0cmVhZG9ubHkgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUsXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zKFxuXHRyZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8bGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtUHJvdmlkZXI+LFxuXHRtb2RlbDogSVRleHRNb2RlbCxcblx0cG9zaXRpb246IFBvc2l0aW9uLFxuXHRvcHRpb25zOiBDb21wbGV0aW9uT3B0aW9ucyA9IENvbXBsZXRpb25PcHRpb25zLmRlZmF1bHQsXG5cdGNvbnRleHQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uQ29udGV4dCA9IHsgdHJpZ2dlcktpbmQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH0sXG5cdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmVcbik6IFByb21pc2U8Q29tcGxldGlvbkl0ZW1Nb2RlbD4ge1xuXG5cdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRwb3NpdGlvbiA9IHBvc2l0aW9uLmNsb25lKCk7XG5cblx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0Y29uc3QgZGVmYXVsdFJlcGxhY2VSYW5nZSA9IHdvcmQgPyBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgd29yZC5lbmRDb2x1bW4pIDogUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbik7XG5cdGNvbnN0IGRlZmF1bHRSYW5nZSA9IHsgcmVwbGFjZTogZGVmYXVsdFJlcGxhY2VSYW5nZSwgaW5zZXJ0OiBkZWZhdWx0UmVwbGFjZVJhbmdlLnNldEVuZFBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbikgfTtcblxuXHRjb25zdCByZXN1bHQ6IENvbXBsZXRpb25JdGVtW10gPSBbXTtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGR1cmF0aW9uczogQ29tcGxldGlvbkR1cmF0aW9uRW50cnlbXSA9IFtdO1xuXHRsZXQgbmVlZHNDbGlwYm9hcmQgPSBmYWxzZTtcblxuXHRjb25zdCBvbkNvbXBsZXRpb25MaXN0ID0gKHByb3ZpZGVyOiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgY29udGFpbmVyOiBsYW5ndWFnZXMuQ29tcGxldGlvbkxpc3QgfCBudWxsIHwgdW5kZWZpbmVkLCBzdzogU3RvcFdhdGNoKTogYm9vbGVhbiA9PiB7XG5cdFx0bGV0IGRpZEFkZFJlc3VsdCA9IGZhbHNlO1xuXHRcdGlmICghY29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm4gZGlkQWRkUmVzdWx0O1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHN1Z2dlc3Rpb24gb2YgY29udGFpbmVyLnN1Z2dlc3Rpb25zKSB7XG5cdFx0XHRpZiAoIW9wdGlvbnMua2luZEZpbHRlci5oYXMoc3VnZ2VzdGlvbi5raW5kKSkge1xuXHRcdFx0XHQvLyBza2lwIGlmIG5vdCBzaG93aW5nIGRlcHJlY2F0ZWQgc3VnZ2VzdGlvbnNcblx0XHRcdFx0aWYgKCFvcHRpb25zLnNob3dEZXByZWNhdGVkICYmIHN1Z2dlc3Rpb24/LnRhZ3M/LmluY2x1ZGVzKGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbVRhZy5EZXByZWNhdGVkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGZpbGwgaW4gZGVmYXVsdCByYW5nZSB3aGVuIG1pc3Npbmdcblx0XHRcdFx0aWYgKCFzdWdnZXN0aW9uLnJhbmdlKSB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbi5yYW5nZSA9IGRlZmF1bHRSYW5nZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBmaWxsIGluIGRlZmF1bHQgc29ydFRleHQgd2hlbiBtaXNzaW5nXG5cdFx0XHRcdGlmICghc3VnZ2VzdGlvbi5zb3J0VGV4dCkge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb24uc29ydFRleHQgPSB0eXBlb2Ygc3VnZ2VzdGlvbi5sYWJlbCA9PT0gJ3N0cmluZycgPyBzdWdnZXN0aW9uLmxhYmVsIDogc3VnZ2VzdGlvbi5sYWJlbC5sYWJlbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIW5lZWRzQ2xpcGJvYXJkICYmIHN1Z2dlc3Rpb24uaW5zZXJ0VGV4dFJ1bGVzICYmIHN1Z2dlc3Rpb24uaW5zZXJ0VGV4dFJ1bGVzICYgbGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuSW5zZXJ0QXNTbmlwcGV0KSB7XG5cdFx0XHRcdFx0bmVlZHNDbGlwYm9hcmQgPSBTbmlwcGV0UGFyc2VyLmd1ZXNzTmVlZHNDbGlwYm9hcmQoc3VnZ2VzdGlvbi5pbnNlcnRUZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQucHVzaChuZXcgQ29tcGxldGlvbkl0ZW0ocG9zaXRpb24sIHN1Z2dlc3Rpb24sIGNvbnRhaW5lciwgcHJvdmlkZXIpKTtcblx0XHRcdFx0ZGlkQWRkUmVzdWx0ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGlzRGlzcG9zYWJsZShjb250YWluZXIpKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY29udGFpbmVyKTtcblx0XHR9XG5cdFx0ZHVyYXRpb25zLnB1c2goe1xuXHRcdFx0cHJvdmlkZXJOYW1lOiBwcm92aWRlci5fZGVidWdEaXNwbGF5TmFtZSA/PyAndW5rbm93bl9wcm92aWRlcicsIGVsYXBzZWRQcm92aWRlcjogY29udGFpbmVyLmR1cmF0aW9uID8/IC0xLCBlbGFwc2VkT3ZlcmFsbDogc3cuZWxhcHNlZCgpXG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRpZEFkZFJlc3VsdDtcblx0fTtcblxuXHQvLyBhc2sgZm9yIHNuaXBwZXRzIGluIHBhcmFsbGVsIHRvIGFza2luZyBcInJlYWxcIiBwcm92aWRlcnMuIE9ubHkgZG8gc29tZXRoaW5nIGlmIGNvbmZpZ3VyZWQgdG9cblx0Ly8gZG8gc28gLSBubyBzbmlwcGV0IGZpbHRlciwgbm8gc3BlY2lhbC1wcm92aWRlcnMtb25seSByZXF1ZXN0XG5cdGNvbnN0IHNuaXBwZXRDb21wbGV0aW9ucyA9IChhc3luYyAoKSA9PiB7XG5cdFx0aWYgKCFfc25pcHBldFN1Z2dlc3RTdXBwb3J0IHx8IG9wdGlvbnMua2luZEZpbHRlci5oYXMobGFuZ3VhZ2VzLkNvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyB3ZSBoYXZlIGl0ZW1zIGZyb20gYSBwcmV2aW91cyBzZXNzaW9uIHRoYXQgd2UgY2FuIHJldXNlXG5cdFx0Y29uc3QgcmV1c2VJdGVtcyA9IG9wdGlvbnMucHJvdmlkZXJJdGVtc1RvUmV1c2UuZ2V0KF9zbmlwcGV0U3VnZ2VzdFN1cHBvcnQpO1xuXHRcdGlmIChyZXVzZUl0ZW1zKSB7XG5cdFx0XHRyZXVzZUl0ZW1zLmZvckVhY2goaXRlbSA9PiByZXN1bHQucHVzaChpdGVtKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLnByb3ZpZGVyRmlsdGVyLnNpemUgPiAwICYmICFvcHRpb25zLnByb3ZpZGVyRmlsdGVyLmhhcyhfc25pcHBldFN1Z2dlc3RTdXBwb3J0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHRjb25zdCBsaXN0ID0gYXdhaXQgX3NuaXBwZXRTdWdnZXN0U3VwcG9ydC5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKG1vZGVsLCBwb3NpdGlvbiwgY29udGV4dCwgdG9rZW4pO1xuXHRcdG9uQ29tcGxldGlvbkxpc3QoX3NuaXBwZXRTdWdnZXN0U3VwcG9ydCwgbGlzdCwgc3cpO1xuXHR9KSgpO1xuXG5cdC8vIGFkZCBzdWdnZXN0aW9ucyBmcm9tIGNvbnRyaWJ1dGVkIHByb3ZpZGVycyAtIHByb3ZpZGVycyBhcmUgb3JkZXJlZCBpbiBncm91cHMgb2Zcblx0Ly8gZXF1YWwgc2NvcmUgYW5kIG9uY2UgYSBncm91cCBwcm9kdWNlcyBhIHJlc3VsdCB0aGUgcHJvY2VzcyBzdG9wc1xuXHQvLyBnZXQgcHJvdmlkZXIgZ3JvdXBzLCBhbHdheXMgYWRkIHNuaXBwZXQgc3VnZ2VzdGlvbiBwcm92aWRlclxuXHRmb3IgKGNvbnN0IHByb3ZpZGVyR3JvdXAgb2YgcmVnaXN0cnkub3JkZXJlZEdyb3Vwcyhtb2RlbCkpIHtcblxuXHRcdC8vIGZvciBlYWNoIHN1cHBvcnQgaW4gdGhlIGdyb3VwIGFzayBmb3Igc3VnZ2VzdGlvbnNcblx0XHRsZXQgZGlkQWRkUmVzdWx0ID0gZmFsc2U7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvdmlkZXJHcm91cC5tYXAoYXN5bmMgcHJvdmlkZXIgPT4ge1xuXHRcdFx0Ly8gd2UgaGF2ZSBpdGVtcyBmcm9tIGEgcHJldmlvdXMgc2Vzc2lvbiB0aGF0IHdlIGNhbiByZXVzZVxuXHRcdFx0aWYgKG9wdGlvbnMucHJvdmlkZXJJdGVtc1RvUmV1c2UuaGFzKHByb3ZpZGVyKSkge1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IG9wdGlvbnMucHJvdmlkZXJJdGVtc1RvUmV1c2UuZ2V0KHByb3ZpZGVyKSE7XG5cdFx0XHRcdGl0ZW1zLmZvckVhY2goaXRlbSA9PiByZXN1bHQucHVzaChpdGVtKSk7XG5cdFx0XHRcdGRpZEFkZFJlc3VsdCA9IGRpZEFkZFJlc3VsdCB8fCBpdGVtcy5sZW5ndGggPiAwO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBjaGVjayBpZiB0aGlzIHByb3ZpZGVyIGlzIGZpbHRlcmVkIG91dFxuXHRcdFx0aWYgKG9wdGlvbnMucHJvdmlkZXJGaWx0ZXIuc2l6ZSA+IDAgJiYgIW9wdGlvbnMucHJvdmlkZXJGaWx0ZXIuaGFzKHByb3ZpZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHRcdFx0Y29uc3QgbGlzdCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIHBvc2l0aW9uLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0XHRcdGRpZEFkZFJlc3VsdCA9IG9uQ29tcGxldGlvbkxpc3QocHJvdmlkZXIsIGxpc3QsIHN3KSB8fCBkaWRBZGRSZXN1bHQ7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChkaWRBZGRSZXN1bHQgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdGF3YWl0IHNuaXBwZXRDb21wbGV0aW9ucztcblxuXHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBDYW5jZWxsYXRpb25FcnJvcigpKTtcblx0fVxuXG5cdHJldHVybiBuZXcgQ29tcGxldGlvbkl0ZW1Nb2RlbChcblx0XHRyZXN1bHQuc29ydChnZXRTdWdnZXN0aW9uQ29tcGFyYXRvcihvcHRpb25zLnNuaXBwZXRTb3J0T3JkZXIpKSxcblx0XHRuZWVkc0NsaXBib2FyZCxcblx0XHR7IGVudHJpZXM6IGR1cmF0aW9ucywgZWxhcHNlZDogc3cuZWxhcHNlZCgpIH0sXG5cdFx0ZGlzcG9zYWJsZXMsXG5cdCk7XG59XG5cblxuZnVuY3Rpb24gZGVmYXVsdENvbXBhcmF0b3IoYTogQ29tcGxldGlvbkl0ZW0sIGI6IENvbXBsZXRpb25JdGVtKTogbnVtYmVyIHtcblx0Ly8gY2hlY2sgd2l0aCAnc29ydFRleHQnXG5cdGlmIChhLnNvcnRUZXh0TG93ICYmIGIuc29ydFRleHRMb3cpIHtcblx0XHRpZiAoYS5zb3J0VGV4dExvdyA8IGIuc29ydFRleHRMb3cpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2UgaWYgKGEuc29ydFRleHRMb3cgPiBiLnNvcnRUZXh0TG93KSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdH1cblx0Ly8gY2hlY2sgd2l0aCAnbGFiZWwnXG5cdGlmIChhLnRleHRMYWJlbCA8IGIudGV4dExhYmVsKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9IGVsc2UgaWYgKGEudGV4dExhYmVsID4gYi50ZXh0TGFiZWwpIHtcblx0XHRyZXR1cm4gMTtcblx0fVxuXHQvLyBjaGVjayB3aXRoICd0eXBlJ1xuXHRyZXR1cm4gYS5jb21wbGV0aW9uLmtpbmQgLSBiLmNvbXBsZXRpb24ua2luZDtcbn1cblxuZnVuY3Rpb24gc25pcHBldFVwQ29tcGFyYXRvcihhOiBDb21wbGV0aW9uSXRlbSwgYjogQ29tcGxldGlvbkl0ZW0pOiBudW1iZXIge1xuXHRpZiAoYS5jb21wbGV0aW9uLmtpbmQgIT09IGIuY29tcGxldGlvbi5raW5kKSB7XG5cdFx0aWYgKGEuY29tcGxldGlvbi5raW5kID09PSBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2UgaWYgKGIuY29tcGxldGlvbi5raW5kID09PSBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZGVmYXVsdENvbXBhcmF0b3IoYSwgYik7XG59XG5cbmZ1bmN0aW9uIHNuaXBwZXREb3duQ29tcGFyYXRvcihhOiBDb21wbGV0aW9uSXRlbSwgYjogQ29tcGxldGlvbkl0ZW0pOiBudW1iZXIge1xuXHRpZiAoYS5jb21wbGV0aW9uLmtpbmQgIT09IGIuY29tcGxldGlvbi5raW5kKSB7XG5cdFx0aWYgKGEuY29tcGxldGlvbi5raW5kID09PSBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH0gZWxzZSBpZiAoYi5jb21wbGV0aW9uLmtpbmQgPT09IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZGVmYXVsdENvbXBhcmF0b3IoYSwgYik7XG59XG5cbmludGVyZmFjZSBDb21wYXJhdG9yPFQ+IHsgKGE6IFQsIGI6IFQpOiBudW1iZXIgfVxuY29uc3QgX3NuaXBwZXRDb21wYXJhdG9ycyA9IG5ldyBNYXA8U25pcHBldFNvcnRPcmRlciwgQ29tcGFyYXRvcjxDb21wbGV0aW9uSXRlbT4+KCk7XG5fc25pcHBldENvbXBhcmF0b3JzLnNldChTbmlwcGV0U29ydE9yZGVyLlRvcCwgc25pcHBldFVwQ29tcGFyYXRvcik7XG5fc25pcHBldENvbXBhcmF0b3JzLnNldChTbmlwcGV0U29ydE9yZGVyLkJvdHRvbSwgc25pcHBldERvd25Db21wYXJhdG9yKTtcbl9zbmlwcGV0Q29tcGFyYXRvcnMuc2V0KFNuaXBwZXRTb3J0T3JkZXIuSW5saW5lLCBkZWZhdWx0Q29tcGFyYXRvcik7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTdWdnZXN0aW9uQ29tcGFyYXRvcihzbmlwcGV0Q29uZmlnOiBTbmlwcGV0U29ydE9yZGVyKTogKGE6IENvbXBsZXRpb25JdGVtLCBiOiBDb21wbGV0aW9uSXRlbSkgPT4gbnVtYmVyIHtcblx0cmV0dXJuIF9zbmlwcGV0Q29tcGFyYXRvcnMuZ2V0KHNuaXBwZXRDb25maWcpITtcbn1cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19leGVjdXRlQ29tcGxldGlvbkl0ZW1Qcm92aWRlcicsIGFzeW5jIChhY2Nlc3NvciwgLi4uYXJnczogW1VSSSwgSVBvc2l0aW9uLCBzdHJpbmc/LCBudW1iZXI/XSkgPT4ge1xuXHRjb25zdCBbdXJpLCBwb3NpdGlvbiwgdHJpZ2dlckNoYXJhY3RlciwgbWF4SXRlbXNUb1Jlc29sdmVdID0gYXJncztcblx0YXNzZXJ0VHlwZShVUkkuaXNVcmkodXJpKSk7XG5cdGFzc2VydFR5cGUoUG9zaXRpb24uaXNJUG9zaXRpb24ocG9zaXRpb24pKTtcblx0YXNzZXJ0VHlwZSh0eXBlb2YgdHJpZ2dlckNoYXJhY3RlciA9PT0gJ3N0cmluZycgfHwgIXRyaWdnZXJDaGFyYWN0ZXIpO1xuXHRhc3NlcnRUeXBlKHR5cGVvZiBtYXhJdGVtc1RvUmVzb2x2ZSA9PT0gJ251bWJlcicgfHwgIW1heEl0ZW1zVG9SZXNvbHZlKTtcblxuXHRjb25zdCB7IGNvbXBsZXRpb25Qcm92aWRlciB9ID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdGNvbnN0IHJlZiA9IGF3YWl0IGFjY2Vzc29yLmdldChJVGV4dE1vZGVsU2VydmljZSkuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKTtcblx0dHJ5IHtcblxuXHRcdGNvbnN0IHJlc3VsdDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25MaXN0ID0ge1xuXHRcdFx0aW5jb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRzdWdnZXN0aW9uczogW11cblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzb2x2aW5nOiBQcm9taXNlPHVua25vd24+W10gPSBbXTtcblx0XHRjb25zdCBhY3R1YWxQb3NpdGlvbiA9IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLnZhbGlkYXRlUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gYXdhaXQgcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcyhjb21wbGV0aW9uUHJvdmlkZXIsIHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLCBhY3R1YWxQb3NpdGlvbiwgdW5kZWZpbmVkLCB7IHRyaWdnZXJDaGFyYWN0ZXI6IHRyaWdnZXJDaGFyYWN0ZXIgPz8gdW5kZWZpbmVkLCB0cmlnZ2VyS2luZDogdHJpZ2dlckNoYXJhY3RlciA/IGxhbmd1YWdlcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3RlciA6IGxhbmd1YWdlcy5Db21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH0pO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBjb21wbGV0aW9ucy5pdGVtcykge1xuXHRcdFx0aWYgKHJlc29sdmluZy5sZW5ndGggPCAobWF4SXRlbXNUb1Jlc29sdmUgPz8gMCkpIHtcblx0XHRcdFx0cmVzb2x2aW5nLnB1c2goaXRlbS5yZXNvbHZlKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdC5pbmNvbXBsZXRlID0gcmVzdWx0LmluY29tcGxldGUgfHwgaXRlbS5jb250YWluZXIuaW5jb21wbGV0ZTtcblx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKGl0ZW0uY29tcGxldGlvbik7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHJlc29sdmluZyk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IGNvbXBsZXRpb25zLmRpc3Bvc2FibGUuZGlzcG9zZSgpLCAxMDApO1xuXHRcdH1cblxuXHR9IGZpbmFsbHkge1xuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdH1cblxufSk7XG5cbmludGVyZmFjZSBTdWdnZXN0Q29udHJvbGxlciBleHRlbmRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHR0cmlnZ2VyU3VnZ2VzdChvbmx5RnJvbT86IFNldDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcj4sIGF1dG8/OiBib29sZWFuLCBub0ZpbHRlcj86IGJvb2xlYW4pOiB2b2lkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvd1NpbXBsZVN1Z2dlc3Rpb25zKGVkaXRvcjogSUNvZGVFZGl0b3IsIHByb3ZpZGVyOiBsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcikge1xuXHRlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPFN1Z2dlc3RDb250cm9sbGVyPignZWRpdG9yLmNvbnRyaWIuc3VnZ2VzdENvbnRyb2xsZXInKT8udHJpZ2dlclN1Z2dlc3QoXG5cdFx0bmV3IFNldDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW1Qcm92aWRlcj4oKS5hZGQocHJvdmlkZXIpLCB1bmRlZmluZWQsIHRydWVcblx0KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3VnZ2VzdEl0ZW1QcmVzZWxlY3RvciB7XG5cdC8qKlxuXHQgKiBUaGUgcHJlc2VsZWN0b3Igd2l0aCBoaWdoZXN0IHByaW9yaXR5IGlzIGFza2VkIGZpcnN0LlxuXHQqL1xuXHRyZWFkb25seSBwcmlvcml0eTogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBJcyBjYWxsZWQgdG8gcHJlc2VsZWN0IGEgc3VnZ2VzdCBpdGVtLlxuXHQgKiBXaGVuIC0xIGlzIHJldHVybmVkLCBpdGVtIHByZXNlbGVjdG9ycyB3aXRoIGxvd2VyIHByaW9yaXR5IGFyZSBhc2tlZC5cblx0Ki9cblx0c2VsZWN0KG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IElQb3NpdGlvbiwgaXRlbXM6IENvbXBsZXRpb25JdGVtW10pOiBudW1iZXIgfCAtMTtcbn1cblxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMge1xuXG5cdHN0YXRpYyBpc0FsbE9mZihjb25maWc6IEludGVybmFsUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29uZmlnLm90aGVyID09PSAnb2ZmJyAmJiBjb25maWcuY29tbWVudHMgPT09ICdvZmYnICYmIGNvbmZpZy5zdHJpbmdzID09PSAnb2ZmJztcblx0fVxuXG5cdHN0YXRpYyBpc0FsbE9uKGNvbmZpZzogSW50ZXJuYWxRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjb25maWcub3RoZXIgPT09ICdvbicgJiYgY29uZmlnLmNvbW1lbnRzID09PSAnb24nICYmIGNvbmZpZy5zdHJpbmdzID09PSAnb24nO1xuXHR9XG5cblx0c3RhdGljIHZhbHVlRm9yKGNvbmZpZzogSW50ZXJuYWxRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucywgdG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZSk6IFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZSB7XG5cdFx0c3dpdGNoICh0b2tlblR5cGUpIHtcblx0XHRcdGNhc2UgU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudDogcmV0dXJuIGNvbmZpZy5jb21tZW50cztcblx0XHRcdGNhc2UgU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nOiByZXR1cm4gY29uZmlnLnN0cmluZ3M7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gY29uZmlnLm90aGVyO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIscUJBQXFCLGlDQUFpQztBQUNsRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUE4QixvQkFBb0I7QUFDM0QsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBRXBCLFNBQW9CLGdCQUFnQjtBQUNwQyxTQUFTLGFBQWE7QUFHdEIsWUFBWSxlQUFlO0FBQzNCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUd6QyxTQUFTLHlCQUF5QjtBQUUzQixNQUFNLFVBQVU7QUFBQSxFQUN0QixTQUFTO0FBQUEsRUFDVCxzQkFBc0IsSUFBSSxjQUF1QixxQ0FBcUMsT0FBTyxTQUFTLDZCQUE2QixtQ0FBbUMsQ0FBQztBQUFBLEVBQ3ZLLGdCQUFnQixJQUFJLGNBQXVCLCtCQUErQixPQUFPLFNBQVMsK0JBQStCLHdDQUF3QyxDQUFDO0FBQUEsRUFDbEssZ0JBQWdCLElBQUksY0FBdUIsK0JBQStCLE9BQU8sU0FBUywr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
