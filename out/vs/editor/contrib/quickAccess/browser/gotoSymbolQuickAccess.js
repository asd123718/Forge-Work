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
import { DeferredPromise } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { pieceToQuery, prepareQuery, scoreFuzzy2 } from "../../../../base/common/fuzzyScorer.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { format, trim } from "../../../../base/common/strings.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { SymbolKind, SymbolKinds, SymbolTag, getAriaLabelForSymbol } from "../../../common/languages.js";
import { IOutlineModelService } from "../../documentSymbols/browser/outlineModel.js";
import { AbstractEditorNavigationQuickAccessProvider } from "./editorNavigationQuickAccess.js";
import { localize } from "../../../../nls.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { findLast } from "../../../../base/common/arraysFind.js";
let AbstractGotoSymbolQuickAccessProvider = class extends AbstractEditorNavigationQuickAccessProvider {
  constructor(_languageFeaturesService, _outlineModelService, options = /* @__PURE__ */ Object.create(null)) {
    super(options);
    this._languageFeaturesService = _languageFeaturesService;
    this._outlineModelService = _outlineModelService;
    this.options = options;
    this.options.canAcceptInBackground = true;
  }
  provideWithoutTextEditor(picker) {
    this.provideLabelPick(picker, localize("cannotRunGotoSymbolWithoutEditor", "To go to a symbol, first open a text editor with symbol information."));
    return Disposable.None;
  }
  provideWithTextEditor(context, picker, token, runOptions) {
    const editor = context.editor;
    const model = this.getModel(editor);
    if (!model) {
      return Disposable.None;
    }
    if (this._languageFeaturesService.documentSymbolProvider.has(model)) {
      return this.doProvideWithEditorSymbols(context, model, picker, token, runOptions);
    }
    return this.doProvideWithoutEditorSymbols(context, model, picker, token);
  }
  doProvideWithoutEditorSymbols(context, model, picker, token) {
    const disposables = new DisposableStore();
    this.provideLabelPick(picker, localize("cannotRunGotoSymbolWithoutSymbolProvider", "The active text editor does not provide symbol information."));
    (async () => {
      const result = await this.waitForLanguageSymbolRegistry(model, disposables);
      if (!result || token.isCancellationRequested) {
        return;
      }
      disposables.add(this.doProvideWithEditorSymbols(context, model, picker, token));
    })();
    return disposables;
  }
  provideLabelPick(picker, label) {
    picker.items = [{ label, index: 0, kind: SymbolKind.String }];
    picker.ariaLabel = label;
  }
  async waitForLanguageSymbolRegistry(model, disposables) {
    if (this._languageFeaturesService.documentSymbolProvider.has(model)) {
      return true;
    }
    const symbolProviderRegistryPromise = new DeferredPromise();
    const symbolProviderListener = disposables.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => {
      if (this._languageFeaturesService.documentSymbolProvider.has(model)) {
        symbolProviderListener.dispose();
        symbolProviderRegistryPromise.complete(true);
      }
    }));
    disposables.add(toDisposable(() => symbolProviderRegistryPromise.complete(false)));
    return symbolProviderRegistryPromise.p;
  }
  doProvideWithEditorSymbols(context, model, picker, token, runOptions) {
    const editor = context.editor;
    const disposables = new DisposableStore();
    disposables.add(picker.onDidAccept((event) => {
      const [item] = picker.selectedItems;
      if (item && item.range) {
        if (picker.keyMods.shift && item.attach) {
          item.attach(picker.keyMods, event);
          return;
        }
        this.gotoLocation(context, { range: item.range.selection, keyMods: picker.keyMods, preserveFocus: event.inBackground });
        runOptions?.handleAccept?.(item, event.inBackground);
        if (!event.inBackground) {
          picker.hide();
        }
      }
    }));
    disposables.add(picker.onDidTriggerItemButton(({ item }) => {
      if (item && item.range) {
        this.gotoLocation(context, { range: item.range.selection, keyMods: picker.keyMods, forceSideBySide: true });
        picker.hide();
      }
    }));
    const symbolsPromise = this.getDocumentSymbols(model, token);
    const picksCts = disposables.add(new MutableDisposable());
    const updatePickerItems = async (positionToEnclose) => {
      picksCts?.value?.cancel();
      picker.busy = false;
      picksCts.value = new CancellationTokenSource();
      picker.busy = true;
      try {
        const query = prepareQuery(picker.value.substr(AbstractGotoSymbolQuickAccessProvider.PREFIX.length).trim());
        const items = await this.doGetSymbolPicks(symbolsPromise, query, void 0, picksCts.value.token, model);
        if (token.isCancellationRequested) {
          return;
        }
        if (items.length > 0) {
          picker.items = items;
          if (positionToEnclose && query.original.length === 0) {
            const candidate = findLast(items, (item) => Boolean(item.type !== "separator" && item.range && Range.containsPosition(item.range.decoration, positionToEnclose)));
            if (candidate) {
              picker.activeItems = [candidate];
            }
          }
        } else {
          if (query.original.length > 0) {
            this.provideLabelPick(picker, localize("noMatchingSymbolResults", "No matching editor symbols"));
          } else {
            this.provideLabelPick(picker, localize("noSymbolResults", "No editor symbols"));
          }
        }
      } finally {
        if (!token.isCancellationRequested) {
          picker.busy = false;
        }
      }
    };
    disposables.add(picker.onDidChangeValue(() => updatePickerItems(void 0)));
    updatePickerItems(editor.getSelection()?.getPosition());
    disposables.add(picker.onDidChangeActive(() => {
      const [item] = picker.activeItems;
      if (item && item.range) {
        editor.revealRangeInCenter(item.range.selection, ScrollType.Smooth);
        this.addDecorations(editor, item.range.decoration);
      }
    }));
    return disposables;
  }
  async doGetSymbolPicks(symbolsPromise, query, options, token, model) {
    const symbols = await symbolsPromise;
    if (token.isCancellationRequested) {
      return [];
    }
    const filterBySymbolKind = query.original.indexOf(AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX) === 0;
    const filterPos = filterBySymbolKind ? 1 : 0;
    let symbolQuery;
    let containerQuery;
    if (query.values && query.values.length > 1) {
      symbolQuery = pieceToQuery(query.values[0]);
      containerQuery = pieceToQuery(query.values.slice(1));
    } else {
      symbolQuery = query;
    }
    let buttons;
    const openSideBySideDirection = this.options?.openSideBySideDirection?.();
    if (openSideBySideDirection) {
      buttons = [{
        iconClass: openSideBySideDirection === "right" ? ThemeIcon.asClassName(Codicon.splitHorizontal) : ThemeIcon.asClassName(Codicon.splitVertical),
        tooltip: openSideBySideDirection === "right" ? localize("openToSide", "Open to the Side") : localize("openToBottom", "Open to the Bottom")
      }];
    }
    const filteredSymbolPicks = [];
    for (let index = 0; index < symbols.length; index++) {
      const symbol = symbols[index];
      const symbolLabel = trim(symbol.name);
      const symbolLabelWithIcon = `$(${SymbolKinds.toIcon(symbol.kind).id}) ${symbolLabel}`;
      const symbolLabelIconOffset = symbolLabelWithIcon.length - symbolLabel.length;
      let containerLabel = symbol.containerName;
      if (options?.extraContainerLabel) {
        if (containerLabel) {
          containerLabel = `${options.extraContainerLabel} \u2022 ${containerLabel}`;
        } else {
          containerLabel = options.extraContainerLabel;
        }
      }
      let symbolScore = void 0;
      let symbolMatches = void 0;
      let containerScore = void 0;
      let containerMatches = void 0;
      if (query.original.length > filterPos) {
        let skipContainerQuery = false;
        if (symbolQuery !== query) {
          [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabelWithIcon, {
            ...query,
            values: void 0
            /* disable multi-query support */
          }, filterPos, symbolLabelIconOffset);
          if (typeof symbolScore === "number") {
            skipContainerQuery = true;
          }
        }
        if (typeof symbolScore !== "number") {
          [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabelWithIcon, symbolQuery, filterPos, symbolLabelIconOffset);
          if (typeof symbolScore !== "number") {
            continue;
          }
        }
        if (!skipContainerQuery && containerQuery) {
          if (containerLabel && containerQuery.original.length > 0) {
            [containerScore, containerMatches] = scoreFuzzy2(containerLabel, containerQuery);
          }
          if (typeof containerScore !== "number") {
            continue;
          }
          if (typeof symbolScore === "number") {
            symbolScore += containerScore;
          }
        }
      }
      const deprecated = symbol.tags && symbol.tags.indexOf(SymbolTag.Deprecated) >= 0;
      filteredSymbolPicks.push({
        index,
        kind: symbol.kind,
        score: symbolScore,
        label: symbolLabelWithIcon,
        ariaLabel: getAriaLabelForSymbol(symbol.name, symbol.kind),
        description: containerLabel,
        highlights: deprecated ? void 0 : {
          label: symbolMatches,
          description: containerMatches
        },
        range: {
          selection: Range.collapseToStart(symbol.selectionRange),
          decoration: symbol.range
        },
        uri: model.uri,
        symbolName: symbolLabel,
        strikethrough: deprecated,
        buttons
      });
    }
    const sortedFilteredSymbolPicks = filteredSymbolPicks.sort(
      (symbolA, symbolB) => filterBySymbolKind ? this.compareByKindAndScore(symbolA, symbolB) : this.compareByScore(symbolA, symbolB)
    );
    let symbolPicks = [];
    if (filterBySymbolKind) {
      let updateLastSeparatorLabel2 = function() {
        if (lastSeparator && typeof lastSymbolKind === "number" && lastSymbolKindCounter > 0) {
          lastSeparator.label = format(NLS_SYMBOL_KIND_CACHE[lastSymbolKind] || FALLBACK_NLS_SYMBOL_KIND, lastSymbolKindCounter);
        }
      };
      var updateLastSeparatorLabel = updateLastSeparatorLabel2;
      let lastSymbolKind = void 0;
      let lastSeparator = void 0;
      let lastSymbolKindCounter = 0;
      for (const symbolPick of sortedFilteredSymbolPicks) {
        if (lastSymbolKind !== symbolPick.kind) {
          updateLastSeparatorLabel2();
          lastSymbolKind = symbolPick.kind;
          lastSymbolKindCounter = 1;
          lastSeparator = { type: "separator" };
          symbolPicks.push(lastSeparator);
        } else {
          lastSymbolKindCounter++;
        }
        symbolPicks.push(symbolPick);
      }
      updateLastSeparatorLabel2();
    } else if (sortedFilteredSymbolPicks.length > 0) {
      symbolPicks = [
        { label: localize("symbols", "symbols ({0})", filteredSymbolPicks.length), type: "separator" },
        ...sortedFilteredSymbolPicks
      ];
    }
    return symbolPicks;
  }
  compareByScore(symbolA, symbolB) {
    if (typeof symbolA.score !== "number" && typeof symbolB.score === "number") {
      return 1;
    } else if (typeof symbolA.score === "number" && typeof symbolB.score !== "number") {
      return -1;
    }
    if (typeof symbolA.score === "number" && typeof symbolB.score === "number") {
      if (symbolA.score > symbolB.score) {
        return -1;
      } else if (symbolA.score < symbolB.score) {
        return 1;
      }
    }
    if (symbolA.index < symbolB.index) {
      return -1;
    } else if (symbolA.index > symbolB.index) {
      return 1;
    }
    return 0;
  }
  compareByKindAndScore(symbolA, symbolB) {
    const kindA = NLS_SYMBOL_KIND_CACHE[symbolA.kind] || FALLBACK_NLS_SYMBOL_KIND;
    const kindB = NLS_SYMBOL_KIND_CACHE[symbolB.kind] || FALLBACK_NLS_SYMBOL_KIND;
    const result = kindA.localeCompare(kindB);
    if (result === 0) {
      return this.compareByScore(symbolA, symbolB);
    }
    return result;
  }
  async getDocumentSymbols(document, token) {
    const model = await this._outlineModelService.getOrCreate(document, token);
    return token.isCancellationRequested ? [] : model.asListOfDocumentSymbols();
  }
};
AbstractGotoSymbolQuickAccessProvider.PREFIX = "@";
AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX = ":";
AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY = `${AbstractGotoSymbolQuickAccessProvider.PREFIX}${AbstractGotoSymbolQuickAccessProvider.SCOPE_PREFIX}`;
AbstractGotoSymbolQuickAccessProvider = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IOutlineModelService)
], AbstractGotoSymbolQuickAccessProvider);
const FALLBACK_NLS_SYMBOL_KIND = localize("property", "properties ({0})");
const NLS_SYMBOL_KIND_CACHE = {
  [SymbolKind.Method]: localize("method", "methods ({0})"),
  [SymbolKind.Function]: localize("function", "functions ({0})"),
  [SymbolKind.Constructor]: localize("_constructor", "constructors ({0})"),
  [SymbolKind.Variable]: localize("variable", "variables ({0})"),
  [SymbolKind.Class]: localize("class", "classes ({0})"),
  [SymbolKind.Struct]: localize("struct", "structs ({0})"),
  [SymbolKind.Event]: localize("event", "events ({0})"),
  [SymbolKind.Operator]: localize("operator", "operators ({0})"),
  [SymbolKind.Interface]: localize("interface", "interfaces ({0})"),
  [SymbolKind.Namespace]: localize("namespace", "namespaces ({0})"),
  [SymbolKind.Package]: localize("package", "packages ({0})"),
  [SymbolKind.TypeParameter]: localize("typeParameter", "type parameters ({0})"),
  [SymbolKind.Module]: localize("modules", "modules ({0})"),
  [SymbolKind.Property]: localize("property", "properties ({0})"),
  [SymbolKind.Enum]: localize("enum", "enumerations ({0})"),
  [SymbolKind.EnumMember]: localize("enumMember", "enumeration members ({0})"),
  [SymbolKind.String]: localize("string", "strings ({0})"),
  [SymbolKind.File]: localize("file", "files ({0})"),
  [SymbolKind.Array]: localize("array", "arrays ({0})"),
  [SymbolKind.Number]: localize("number", "numbers ({0})"),
  [SymbolKind.Boolean]: localize("boolean", "booleans ({0})"),
  [SymbolKind.Object]: localize("object", "objects ({0})"),
  [SymbolKind.Key]: localize("key", "keys ({0})"),
  [SymbolKind.Field]: localize("field", "fields ({0})"),
  [SymbolKind.Constant]: localize("constant", "constants ({0})")
};
export {
  AbstractGotoSymbolQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHF1aWNrQWNjZXNzXFxicm93c2VyXFxnb3RvU3ltYm9sUXVpY2tBY2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IElQcmVwYXJlZFF1ZXJ5LCBwaWVjZVRvUXVlcnksIHByZXBhcmVRdWVyeSwgc2NvcmVGdXp6eTIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdXp6eVNjb3Jlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGZvcm1hdCwgdHJpbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRTeW1ib2wsIFN5bWJvbEtpbmQsIFN5bWJvbEtpbmRzLCBTeW1ib2xUYWcsIGdldEFyaWFMYWJlbEZvclN5bWJvbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU91dGxpbmVNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9kb2N1bWVudFN5bWJvbHMvYnJvd3Nlci9vdXRsaW5lTW9kZWwuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFZGl0b3JOYXZpZ2F0aW9uUXVpY2tBY2Nlc3NQcm92aWRlciwgSUVkaXRvck5hdmlnYXRpb25RdWlja0FjY2Vzc09wdGlvbnMsIElRdWlja0FjY2Vzc1RleHRFZGl0b3JDb250ZXh0IH0gZnJvbSAnLi9lZGl0b3JOYXZpZ2F0aW9uUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUtleU1vZHMsIElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tQaWNrLCBJUXVpY2tQaWNrRGlkQWNjZXB0RXZlbnQsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IGZpbmRMYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0a2luZDogU3ltYm9sS2luZDtcblx0aW5kZXg6IG51bWJlcjtcblx0c2NvcmU/OiBudW1iZXI7XG5cdHVyaT86IFVSSTtcblx0c3ltYm9sTmFtZT86IHN0cmluZztcblx0cmFuZ2U/OiB7IGRlY29yYXRpb246IElSYW5nZTsgc2VsZWN0aW9uOiBJUmFuZ2UgfTtcblx0YXR0YWNoPyhrZXlNb2RzOiBJS2V5TW9kcywgZXZlbnQ6IElRdWlja1BpY2tEaWRBY2NlcHRFdmVudCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyT3B0aW9ucyBleHRlbmRzIElFZGl0b3JOYXZpZ2F0aW9uUXVpY2tBY2Nlc3NPcHRpb25zIHtcblx0b3BlblNpZGVCeVNpZGVEaXJlY3Rpb24/OiAoKSA9PiB1bmRlZmluZWQgfCAncmlnaHQnIHwgJ2Rvd24nO1xuXHQvKipcblx0ICogQSBoYW5kbGVyIHRvIGludm9rZSB3aGVuIGFuIGl0ZW0gaXMgYWNjZXB0ZWQgZm9yXG5cdCAqIHRoaXMgcGFydGljdWxhciBzaG93aW5nIG9mIHRoZSBxdWljayBhY2Nlc3MuXG5cdCAqIEBwYXJhbSBpdGVtIFRoZSBpdGVtIHRoYXQgd2FzIGFjY2VwdGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgaGFuZGxlQWNjZXB0PzogKGl0ZW06IElRdWlja1BpY2tJdGVtKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlciBleHRlbmRzIEFic3RyYWN0RWRpdG9yTmF2aWdhdGlvblF1aWNrQWNjZXNzUHJvdmlkZXIge1xuXG5cdHN0YXRpYyBQUkVGSVggPSAnQCc7XG5cdHN0YXRpYyBTQ09QRV9QUkVGSVggPSAnOic7XG5cdHN0YXRpYyBQUkVGSVhfQllfQ0FURUdPUlkgPSBgJHt0aGlzLlBSRUZJWH0ke3RoaXMuU0NPUEVfUFJFRklYfWA7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlYWRvbmx5IG9wdGlvbnM6IElHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlck9wdGlvbnM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJT3V0bGluZU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vdXRsaW5lTW9kZWxTZXJ2aWNlOiBJT3V0bGluZU1vZGVsU2VydmljZSxcblx0XHRvcHRpb25zOiBJR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXJPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKVxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zKTtcblxuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5vcHRpb25zLmNhbkFjY2VwdEluQmFja2dyb3VuZCA9IHRydWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcHJvdmlkZVdpdGhvdXRUZXh0RWRpdG9yKHBpY2tlcjogSVF1aWNrUGljazxJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9Pik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLnByb3ZpZGVMYWJlbFBpY2socGlja2VyLCBsb2NhbGl6ZSgnY2Fubm90UnVuR290b1N5bWJvbFdpdGhvdXRFZGl0b3InLCBcIlRvIGdvIHRvIGEgc3ltYm9sLCBmaXJzdCBvcGVuIGEgdGV4dCBlZGl0b3Igd2l0aCBzeW1ib2wgaW5mb3JtYXRpb24uXCIpKTtcblxuXHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcHJvdmlkZVdpdGhUZXh0RWRpdG9yKGNvbnRleHQ6IElRdWlja0FjY2Vzc1RleHRFZGl0b3JDb250ZXh0LCBwaWNrZXI6IElRdWlja1BpY2s8SUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IElRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBlZGl0b3IgPSBjb250ZXh0LmVkaXRvcjtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZ2V0TW9kZWwoZWRpdG9yKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblxuXHRcdC8vIFByb3ZpZGUgc3ltYm9scyBmcm9tIG1vZGVsIGlmIGF2YWlsYWJsZSBpbiByZWdpc3RyeVxuXHRcdGlmICh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLmhhcyhtb2RlbCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvUHJvdmlkZVdpdGhFZGl0b3JTeW1ib2xzKGNvbnRleHQsIG1vZGVsLCBwaWNrZXIsIHRva2VuLCBydW5PcHRpb25zKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2Ugc2hvdyBhbiBlbnRyeSBmb3IgYSBtb2RlbCB3aXRob3V0IHJlZ2lzdHJ5XG5cdFx0Ly8gQnV0IGdpdmUgYSBjaGFuY2UgdG8gcmVzb2x2ZSB0aGUgc3ltYm9scyBhdCBhIGxhdGVyXG5cdFx0Ly8gcG9pbnQgaWYgcG9zc2libGVcblx0XHRyZXR1cm4gdGhpcy5kb1Byb3ZpZGVXaXRob3V0RWRpdG9yU3ltYm9scyhjb250ZXh0LCBtb2RlbCwgcGlja2VyLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGRvUHJvdmlkZVdpdGhvdXRFZGl0b3JTeW1ib2xzKGNvbnRleHQ6IElRdWlja0FjY2Vzc1RleHRFZGl0b3JDb250ZXh0LCBtb2RlbDogSVRleHRNb2RlbCwgcGlja2VyOiBJUXVpY2tQaWNrPElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBHZW5lcmljIHBpY2sgZm9yIG5vdCBoYXZpbmcgYW55IHN5bWJvbCBpbmZvcm1hdGlvblxuXHRcdHRoaXMucHJvdmlkZUxhYmVsUGljayhwaWNrZXIsIGxvY2FsaXplKCdjYW5ub3RSdW5Hb3RvU3ltYm9sV2l0aG91dFN5bWJvbFByb3ZpZGVyJywgXCJUaGUgYWN0aXZlIHRleHQgZWRpdG9yIGRvZXMgbm90IHByb3ZpZGUgc3ltYm9sIGluZm9ybWF0aW9uLlwiKSk7XG5cblx0XHQvLyBXYWl0IGZvciBjaGFuZ2VzIHRvIHRoZSByZWdpc3RyeSBhbmQgc2VlIGlmIGV2ZW50dWFsbHlcblx0XHQvLyB3ZSBkbyBnZXQgc3ltYm9scy4gVGhpcyBjYW4gaGFwcGVuIGlmIHRoZSBwaWNrZXIgaXMgb3BlbmVkXG5cdFx0Ly8gdmVyeSBlYXJseSBhZnRlciB0aGUgbW9kZWwgaGFzIGxvYWRlZCBidXQgYmVmb3JlIHRoZVxuXHRcdC8vIGxhbmd1YWdlIHJlZ2lzdHJ5IGlzIHJlYWR5LlxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy83MDYwN1xuXHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLndhaXRGb3JMYW5ndWFnZVN5bWJvbFJlZ2lzdHJ5KG1vZGVsLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRpZiAoIXJlc3VsdCB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmRvUHJvdmlkZVdpdGhFZGl0b3JTeW1ib2xzKGNvbnRleHQsIG1vZGVsLCBwaWNrZXIsIHRva2VuKSk7XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgcHJvdmlkZUxhYmVsUGljayhwaWNrZXI6IElRdWlja1BpY2s8SUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRwaWNrZXIuaXRlbXMgPSBbeyBsYWJlbCwgaW5kZXg6IDAsIGtpbmQ6IFN5bWJvbEtpbmQuU3RyaW5nIH1dO1xuXHRcdHBpY2tlci5hcmlhTGFiZWwgPSBsYWJlbDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyB3YWl0Rm9yTGFuZ3VhZ2VTeW1ib2xSZWdpc3RyeShtb2RlbDogSVRleHRNb2RlbCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLmhhcyhtb2RlbCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN5bWJvbFByb3ZpZGVyUmVnaXN0cnlQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTxib29sZWFuPigpO1xuXG5cdFx0Ly8gUmVzb2x2ZSBwcm9taXNlIHdoZW4gcmVnaXN0cnkga25vd3MgbW9kZWxcblx0XHRjb25zdCBzeW1ib2xQcm92aWRlckxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIuaGFzKG1vZGVsKSkge1xuXHRcdFx0XHRzeW1ib2xQcm92aWRlckxpc3RlbmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0XHRzeW1ib2xQcm92aWRlclJlZ2lzdHJ5UHJvbWlzZS5jb21wbGV0ZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZXNvbHZlIHByb21pc2Ugd2hlbiB3ZSBnZXQgZGlzcG9zZWQgdG9vXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzeW1ib2xQcm92aWRlclJlZ2lzdHJ5UHJvbWlzZS5jb21wbGV0ZShmYWxzZSkpKTtcblxuXHRcdHJldHVybiBzeW1ib2xQcm92aWRlclJlZ2lzdHJ5UHJvbWlzZS5wO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1Byb3ZpZGVXaXRoRWRpdG9yU3ltYm9scyhjb250ZXh0OiBJUXVpY2tBY2Nlc3NUZXh0RWRpdG9yQ29udGV4dCwgbW9kZWw6IElUZXh0TW9kZWwsIHBpY2tlcjogSVF1aWNrUGljazxJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBydW5PcHRpb25zPzogSVF1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGVkaXRvciA9IGNvbnRleHQuZWRpdG9yO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gR290byBzeW1ib2wgb25jZSBwaWNrZWRcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IFtpdGVtXSA9IHBpY2tlci5zZWxlY3RlZEl0ZW1zO1xuXHRcdFx0aWYgKGl0ZW0gJiYgaXRlbS5yYW5nZSkge1xuXHRcdFx0XHQvLyBXaGVuIHNoaWZ0IGlzIGhlbGQgYW5kIGF0dGFjaCBpcyBhdmFpbGFibGUsIGRlbGVnYXRlIHRvIGF0dGFjaFxuXHRcdFx0XHQvLyAoZS5nLiB0byBhZGQgdG8gY2hhdCBjb250ZXh0KSBpbnN0ZWFkIG9mIG5hdmlnYXRpbmdcblx0XHRcdFx0aWYgKHBpY2tlci5rZXlNb2RzLnNoaWZ0ICYmIGl0ZW0uYXR0YWNoKSB7XG5cdFx0XHRcdFx0aXRlbS5hdHRhY2gocGlja2VyLmtleU1vZHMsIGV2ZW50KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmdvdG9Mb2NhdGlvbihjb250ZXh0LCB7IHJhbmdlOiBpdGVtLnJhbmdlLnNlbGVjdGlvbiwga2V5TW9kczogcGlja2VyLmtleU1vZHMsIHByZXNlcnZlRm9jdXM6IGV2ZW50LmluQmFja2dyb3VuZCB9KTtcblxuXHRcdFx0XHRydW5PcHRpb25zPy5oYW5kbGVBY2NlcHQ/LihpdGVtLCBldmVudC5pbkJhY2tncm91bmQpO1xuXG5cdFx0XHRcdGlmICghZXZlbnQuaW5CYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEdvdG8gc3ltYm9sIHNpZGUgYnkgc2lkZSBpZiBlbmFibGVkXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZFRyaWdnZXJJdGVtQnV0dG9uKCh7IGl0ZW0gfSkgPT4ge1xuXHRcdFx0aWYgKGl0ZW0gJiYgaXRlbS5yYW5nZSkge1xuXHRcdFx0XHR0aGlzLmdvdG9Mb2NhdGlvbihjb250ZXh0LCB7IHJhbmdlOiBpdGVtLnJhbmdlLnNlbGVjdGlvbiwga2V5TW9kczogcGlja2VyLmtleU1vZHMsIGZvcmNlU2lkZUJ5U2lkZTogdHJ1ZSB9KTtcblxuXHRcdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlc29sdmUgc3ltYm9scyBmcm9tIGRvY3VtZW50IG9uY2UgYW5kIHJldXNlIHRoaXNcblx0XHQvLyByZXF1ZXN0IGZvciBhbGwgZmlsdGVyaW5nIGFuZCB0eXBpbmcgdGhlbiBvblxuXHRcdGNvbnN0IHN5bWJvbHNQcm9taXNlID0gdGhpcy5nZXREb2N1bWVudFN5bWJvbHMobW9kZWwsIHRva2VuKTtcblxuXHRcdC8vIFNldCBpbml0aWFsIHBpY2tzIGFuZCB1cGRhdGUgb24gdHlwZVxuXHRcdGNvbnN0IHBpY2tzQ3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKSk7XG5cdFx0Y29uc3QgdXBkYXRlUGlja2VySXRlbXMgPSBhc3luYyAocG9zaXRpb25Ub0VuY2xvc2U6IFBvc2l0aW9uIHwgdW5kZWZpbmVkKSA9PiB7XG5cblx0XHRcdC8vIENhbmNlbCBhbnkgcHJldmlvdXMgYXNrIGZvciBwaWNrcyBhbmQgYnVzeVxuXHRcdFx0cGlja3NDdHM/LnZhbHVlPy5jYW5jZWwoKTtcblx0XHRcdHBpY2tlci5idXN5ID0gZmFsc2U7XG5cblx0XHRcdC8vIENyZWF0ZSBuZXcgY2FuY2VsbGF0aW9uIHNvdXJjZSBmb3IgdGhpcyBydW5cblx0XHRcdHBpY2tzQ3RzLnZhbHVlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRcdC8vIENvbGxlY3Qgc3ltYm9sIHBpY2tzXG5cdFx0XHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBxdWVyeSA9IHByZXBhcmVRdWVyeShwaWNrZXIudmFsdWUuc3Vic3RyKEFic3RyYWN0R290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYLmxlbmd0aCkudHJpbSgpKTtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCB0aGlzLmRvR2V0U3ltYm9sUGlja3Moc3ltYm9sc1Byb21pc2UsIHF1ZXJ5LCB1bmRlZmluZWQsIHBpY2tzQ3RzLnZhbHVlLnRva2VuLCBtb2RlbCk7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cGlja2VyLml0ZW1zID0gaXRlbXM7XG5cdFx0XHRcdFx0aWYgKHBvc2l0aW9uVG9FbmNsb3NlICYmIHF1ZXJ5Lm9yaWdpbmFsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gPElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbT5maW5kTGFzdChpdGVtcywgaXRlbSA9PiBCb29sZWFuKGl0ZW0udHlwZSAhPT0gJ3NlcGFyYXRvcicgJiYgaXRlbS5yYW5nZSAmJiBSYW5nZS5jb250YWluc1Bvc2l0aW9uKGl0ZW0ucmFuZ2UuZGVjb3JhdGlvbiwgcG9zaXRpb25Ub0VuY2xvc2UpKSk7XG5cdFx0XHRcdFx0XHRpZiAoY2FuZGlkYXRlKSB7XG5cdFx0XHRcdFx0XHRcdHBpY2tlci5hY3RpdmVJdGVtcyA9IFtjYW5kaWRhdGVdO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChxdWVyeS5vcmlnaW5hbC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnByb3ZpZGVMYWJlbFBpY2socGlja2VyLCBsb2NhbGl6ZSgnbm9NYXRjaGluZ1N5bWJvbFJlc3VsdHMnLCBcIk5vIG1hdGNoaW5nIGVkaXRvciBzeW1ib2xzXCIpKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5wcm92aWRlTGFiZWxQaWNrKHBpY2tlciwgbG9jYWxpemUoJ25vU3ltYm9sUmVzdWx0cycsIFwiTm8gZWRpdG9yIHN5bWJvbHNcIikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHBpY2tlci5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PiB1cGRhdGVQaWNrZXJJdGVtcyh1bmRlZmluZWQpKSk7XG5cdFx0dXBkYXRlUGlja2VySXRlbXMoZWRpdG9yLmdldFNlbGVjdGlvbigpPy5nZXRQb3NpdGlvbigpKTtcblxuXG5cdFx0Ly8gUmV2ZWFsIGFuZCBkZWNvcmF0ZSB3aGVuIGFjdGl2ZSBpdGVtIGNoYW5nZXNcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQ2hhbmdlQWN0aXZlKCgpID0+IHtcblx0XHRcdGNvbnN0IFtpdGVtXSA9IHBpY2tlci5hY3RpdmVJdGVtcztcblx0XHRcdGlmIChpdGVtICYmIGl0ZW0ucmFuZ2UpIHtcblxuXHRcdFx0XHQvLyBSZXZlYWxcblx0XHRcdFx0ZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXIoaXRlbS5yYW5nZS5zZWxlY3Rpb24sIFNjcm9sbFR5cGUuU21vb3RoKTtcblxuXHRcdFx0XHQvLyBEZWNvcmF0ZVxuXHRcdFx0XHR0aGlzLmFkZERlY29yYXRpb25zKGVkaXRvciwgaXRlbS5yYW5nZS5kZWNvcmF0aW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9HZXRTeW1ib2xQaWNrcyhzeW1ib2xzUHJvbWlzZTogUHJvbWlzZTxEb2N1bWVudFN5bWJvbFtdPiwgcXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCBvcHRpb25zOiB7IGV4dHJhQ29udGFpbmVyTGFiZWw/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBtb2RlbDogSVRleHRNb2RlbCk6IFByb21pc2U8QXJyYXk8SUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4+IHtcblx0XHRjb25zdCBzeW1ib2xzID0gYXdhaXQgc3ltYm9sc1Byb21pc2U7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsdGVyQnlTeW1ib2xLaW5kID0gcXVlcnkub3JpZ2luYWwuaW5kZXhPZihBYnN0cmFjdEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyLlNDT1BFX1BSRUZJWCkgPT09IDA7XG5cdFx0Y29uc3QgZmlsdGVyUG9zID0gZmlsdGVyQnlTeW1ib2xLaW5kID8gMSA6IDA7XG5cblx0XHQvLyBTcGxpdCBiZXR3ZWVuIHN5bWJvbCBhbmQgY29udGFpbmVyIHF1ZXJ5XG5cdFx0bGV0IHN5bWJvbFF1ZXJ5OiBJUHJlcGFyZWRRdWVyeTtcblx0XHRsZXQgY29udGFpbmVyUXVlcnk6IElQcmVwYXJlZFF1ZXJ5IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChxdWVyeS52YWx1ZXMgJiYgcXVlcnkudmFsdWVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHN5bWJvbFF1ZXJ5ID0gcGllY2VUb1F1ZXJ5KHF1ZXJ5LnZhbHVlc1swXSk7IFx0XHQgIC8vIHN5bWJvbDogb25seSBtYXRjaCBvbiBmaXJzdCBwYXJ0XG5cdFx0XHRjb250YWluZXJRdWVyeSA9IHBpZWNlVG9RdWVyeShxdWVyeS52YWx1ZXMuc2xpY2UoMSkpOyAvLyBjb250YWluZXI6IG1hdGNoIG9uIGFsbCBidXQgZmlyc3QgcGFydHNcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3ltYm9sUXVlcnkgPSBxdWVyeTtcblx0XHR9XG5cblx0XHQvLyBDb252ZXJ0IHRvIHN5bWJvbCBwaWNrcyBhbmQgYXBwbHkgZmlsdGVyaW5nXG5cblx0XHRsZXQgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvcGVuU2lkZUJ5U2lkZURpcmVjdGlvbiA9IHRoaXMub3B0aW9ucz8ub3BlblNpZGVCeVNpZGVEaXJlY3Rpb24/LigpO1xuXHRcdGlmIChvcGVuU2lkZUJ5U2lkZURpcmVjdGlvbikge1xuXHRcdFx0YnV0dG9ucyA9IFt7XG5cdFx0XHRcdGljb25DbGFzczogb3BlblNpZGVCeVNpZGVEaXJlY3Rpb24gPT09ICdyaWdodCcgPyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zcGxpdEhvcml6b250YWwpIDogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3BsaXRWZXJ0aWNhbCksXG5cdFx0XHRcdHRvb2x0aXA6IG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uID09PSAncmlnaHQnID8gbG9jYWxpemUoJ29wZW5Ub1NpZGUnLCBcIk9wZW4gdG8gdGhlIFNpZGVcIikgOiBsb2NhbGl6ZSgnb3BlblRvQm90dG9tJywgXCJPcGVuIHRvIHRoZSBCb3R0b21cIilcblx0XHRcdH1dO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbHRlcmVkU3ltYm9sUGlja3M6IElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbVtdID0gW107XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHN5bWJvbHMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBzeW1ib2wgPSBzeW1ib2xzW2luZGV4XTtcblxuXHRcdFx0Y29uc3Qgc3ltYm9sTGFiZWwgPSB0cmltKHN5bWJvbC5uYW1lKTtcblx0XHRcdGNvbnN0IHN5bWJvbExhYmVsV2l0aEljb24gPSBgJCgke1N5bWJvbEtpbmRzLnRvSWNvbihzeW1ib2wua2luZCkuaWR9KSAke3N5bWJvbExhYmVsfWA7XG5cdFx0XHRjb25zdCBzeW1ib2xMYWJlbEljb25PZmZzZXQgPSBzeW1ib2xMYWJlbFdpdGhJY29uLmxlbmd0aCAtIHN5bWJvbExhYmVsLmxlbmd0aDtcblxuXHRcdFx0bGV0IGNvbnRhaW5lckxhYmVsID0gc3ltYm9sLmNvbnRhaW5lck5hbWU7XG5cdFx0XHRpZiAob3B0aW9ucz8uZXh0cmFDb250YWluZXJMYWJlbCkge1xuXHRcdFx0XHRpZiAoY29udGFpbmVyTGFiZWwpIHtcblx0XHRcdFx0XHRjb250YWluZXJMYWJlbCA9IGAke29wdGlvbnMuZXh0cmFDb250YWluZXJMYWJlbH0gXHUyMDIyICR7Y29udGFpbmVyTGFiZWx9YDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb250YWluZXJMYWJlbCA9IG9wdGlvbnMuZXh0cmFDb250YWluZXJMYWJlbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc3ltYm9sU2NvcmU6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBzeW1ib2xNYXRjaGVzOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0bGV0IGNvbnRhaW5lclNjb3JlOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgY29udGFpbmVyTWF0Y2hlczogSU1hdGNoW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChxdWVyeS5vcmlnaW5hbC5sZW5ndGggPiBmaWx0ZXJQb3MpIHtcblxuXHRcdFx0XHQvLyBGaXJzdDogdHJ5IHRvIHNjb3JlIG9uIHRoZSBlbnRpcmUgcXVlcnksIGl0IGlzIHBvc3NpYmxlIHRoYXRcblx0XHRcdFx0Ly8gdGhlIHN5bWJvbCBtYXRjaGVzIHBlcmZlY3RseSAoZS5nLiBzZWFyY2hpbmcgZm9yIFwiY2hhbmdlIGxvZ1wiXG5cdFx0XHRcdC8vIGNhbiBiZSBhIG1hdGNoIG9uIGEgbWFya2Rvd24gc3ltYm9sIFwiY2hhbmdlIGxvZ1wiKS4gSW4gdGhhdFxuXHRcdFx0XHQvLyBjYXNlIHdlIHdhbnQgdG8gc2tpcCB0aGUgY29udGFpbmVyIHF1ZXJ5IGFsdG9nZXRoZXIuXG5cdFx0XHRcdGxldCBza2lwQ29udGFpbmVyUXVlcnkgPSBmYWxzZTtcblx0XHRcdFx0aWYgKHN5bWJvbFF1ZXJ5ICE9PSBxdWVyeSkge1xuXHRcdFx0XHRcdFtzeW1ib2xTY29yZSwgc3ltYm9sTWF0Y2hlc10gPSBzY29yZUZ1enp5MihzeW1ib2xMYWJlbFdpdGhJY29uLCB7IC4uLnF1ZXJ5LCB2YWx1ZXM6IHVuZGVmaW5lZCAvKiBkaXNhYmxlIG11bHRpLXF1ZXJ5IHN1cHBvcnQgKi8gfSwgZmlsdGVyUG9zLCBzeW1ib2xMYWJlbEljb25PZmZzZXQpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2Ygc3ltYm9sU2NvcmUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRza2lwQ29udGFpbmVyUXVlcnkgPSB0cnVlOyAvLyBzaW5jZSB3ZSBjb25zdW1lZCB0aGUgcXVlcnksIHNraXAgYW55IGNvbnRhaW5lciBtYXRjaGluZ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE90aGVyd2lzZTogc2NvcmUgb24gdGhlIHN5bWJvbCBxdWVyeSBhbmQgbWF0Y2ggb24gdGhlIGNvbnRhaW5lciBsYXRlclxuXHRcdFx0XHRpZiAodHlwZW9mIHN5bWJvbFNjb3JlICE9PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFtzeW1ib2xTY29yZSwgc3ltYm9sTWF0Y2hlc10gPSBzY29yZUZ1enp5MihzeW1ib2xMYWJlbFdpdGhJY29uLCBzeW1ib2xRdWVyeSwgZmlsdGVyUG9zLCBzeW1ib2xMYWJlbEljb25PZmZzZXQpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2Ygc3ltYm9sU2NvcmUgIT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTY29yZSBieSBjb250YWluZXIgaWYgc3BlY2lmaWVkXG5cdFx0XHRcdGlmICghc2tpcENvbnRhaW5lclF1ZXJ5ICYmIGNvbnRhaW5lclF1ZXJ5KSB7XG5cdFx0XHRcdFx0aWYgKGNvbnRhaW5lckxhYmVsICYmIGNvbnRhaW5lclF1ZXJ5Lm9yaWdpbmFsLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFtjb250YWluZXJTY29yZSwgY29udGFpbmVyTWF0Y2hlc10gPSBzY29yZUZ1enp5Mihjb250YWluZXJMYWJlbCwgY29udGFpbmVyUXVlcnkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0eXBlb2YgY29udGFpbmVyU2NvcmUgIT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodHlwZW9mIHN5bWJvbFNjb3JlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0c3ltYm9sU2NvcmUgKz0gY29udGFpbmVyU2NvcmU7IC8vIGJvb3N0IHN5bWJvbFNjb3JlIGJ5IGNvbnRhaW5lclNjb3JlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlcHJlY2F0ZWQgPSBzeW1ib2wudGFncyAmJiBzeW1ib2wudGFncy5pbmRleE9mKFN5bWJvbFRhZy5EZXByZWNhdGVkKSA+PSAwO1xuXG5cdFx0XHRmaWx0ZXJlZFN5bWJvbFBpY2tzLnB1c2goe1xuXHRcdFx0XHRpbmRleCxcblx0XHRcdFx0a2luZDogc3ltYm9sLmtpbmQsXG5cdFx0XHRcdHNjb3JlOiBzeW1ib2xTY29yZSxcblx0XHRcdFx0bGFiZWw6IHN5bWJvbExhYmVsV2l0aEljb24sXG5cdFx0XHRcdGFyaWFMYWJlbDogZ2V0QXJpYUxhYmVsRm9yU3ltYm9sKHN5bWJvbC5uYW1lLCBzeW1ib2wua2luZCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBjb250YWluZXJMYWJlbCxcblx0XHRcdFx0aGlnaGxpZ2h0czogZGVwcmVjYXRlZCA/IHVuZGVmaW5lZCA6IHtcblx0XHRcdFx0XHRsYWJlbDogc3ltYm9sTWF0Y2hlcyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY29udGFpbmVyTWF0Y2hlc1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdHNlbGVjdGlvbjogUmFuZ2UuY29sbGFwc2VUb1N0YXJ0KHN5bWJvbC5zZWxlY3Rpb25SYW5nZSksXG5cdFx0XHRcdFx0ZGVjb3JhdGlvbjogc3ltYm9sLnJhbmdlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVyaTogbW9kZWwudXJpLFxuXHRcdFx0XHRzeW1ib2xOYW1lOiBzeW1ib2xMYWJlbCxcblx0XHRcdFx0c3RyaWtldGhyb3VnaDogZGVwcmVjYXRlZCxcblx0XHRcdFx0YnV0dG9uc1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gU29ydCBieSBzY29yZVxuXHRcdGNvbnN0IHNvcnRlZEZpbHRlcmVkU3ltYm9sUGlja3MgPSBmaWx0ZXJlZFN5bWJvbFBpY2tzLnNvcnQoKHN5bWJvbEEsIHN5bWJvbEIpID0+IGZpbHRlckJ5U3ltYm9sS2luZCA/XG5cdFx0XHR0aGlzLmNvbXBhcmVCeUtpbmRBbmRTY29yZShzeW1ib2xBLCBzeW1ib2xCKSA6XG5cdFx0XHR0aGlzLmNvbXBhcmVCeVNjb3JlKHN5bWJvbEEsIHN5bWJvbEIpXG5cdFx0KTtcblxuXHRcdC8vIEFkZCBzZXBhcmF0b3IgZm9yIHR5cGVzXG5cdFx0Ly8gLSBAICBvbmx5IHRvdGFsIG51bWJlciBvZiBzeW1ib2xzXG5cdFx0Ly8gLSBAOiBncm91cGVkIGJ5IHN5bWJvbCBraW5kXG5cdFx0bGV0IHN5bWJvbFBpY2tzOiBBcnJheTxJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yPiA9IFtdO1xuXHRcdGlmIChmaWx0ZXJCeVN5bWJvbEtpbmQpIHtcblx0XHRcdGxldCBsYXN0U3ltYm9sS2luZDogU3ltYm9sS2luZCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBsYXN0U2VwYXJhdG9yOiBJUXVpY2tQaWNrU2VwYXJhdG9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGxhc3RTeW1ib2xLaW5kQ291bnRlciA9IDA7XG5cblx0XHRcdGZ1bmN0aW9uIHVwZGF0ZUxhc3RTZXBhcmF0b3JMYWJlbCgpOiB2b2lkIHtcblx0XHRcdFx0aWYgKGxhc3RTZXBhcmF0b3IgJiYgdHlwZW9mIGxhc3RTeW1ib2xLaW5kID09PSAnbnVtYmVyJyAmJiBsYXN0U3ltYm9sS2luZENvdW50ZXIgPiAwKSB7XG5cdFx0XHRcdFx0bGFzdFNlcGFyYXRvci5sYWJlbCA9IGZvcm1hdChOTFNfU1lNQk9MX0tJTkRfQ0FDSEVbbGFzdFN5bWJvbEtpbmRdIHx8IEZBTExCQUNLX05MU19TWU1CT0xfS0lORCwgbGFzdFN5bWJvbEtpbmRDb3VudGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHN5bWJvbFBpY2sgb2Ygc29ydGVkRmlsdGVyZWRTeW1ib2xQaWNrcykge1xuXG5cdFx0XHRcdC8vIEZvdW5kIG5ldyBraW5kXG5cdFx0XHRcdGlmIChsYXN0U3ltYm9sS2luZCAhPT0gc3ltYm9sUGljay5raW5kKSB7XG5cblx0XHRcdFx0XHQvLyBVcGRhdGUgbGFzdCBzZXBhcmF0b3Igd2l0aCBudW1iZXIgb2Ygc3ltYm9scyB3ZSBmb3VuZCBmb3Iga2luZFxuXHRcdFx0XHRcdHVwZGF0ZUxhc3RTZXBhcmF0b3JMYWJlbCgpO1xuXG5cdFx0XHRcdFx0bGFzdFN5bWJvbEtpbmQgPSBzeW1ib2xQaWNrLmtpbmQ7XG5cdFx0XHRcdFx0bGFzdFN5bWJvbEtpbmRDb3VudGVyID0gMTtcblxuXHRcdFx0XHRcdC8vIEFkZCBuZXcgc2VwYXJhdG9yIGZvciBuZXcga2luZFxuXHRcdFx0XHRcdGxhc3RTZXBhcmF0b3IgPSB7IHR5cGU6ICdzZXBhcmF0b3InIH07XG5cdFx0XHRcdFx0c3ltYm9sUGlja3MucHVzaChsYXN0U2VwYXJhdG9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEV4aXN0aW5nIGtpbmQsIGtlZXAgY291bnRpbmdcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0bGFzdFN5bWJvbEtpbmRDb3VudGVyKys7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBZGQgdG8gZmluYWwgcmVzdWx0XG5cdFx0XHRcdHN5bWJvbFBpY2tzLnB1c2goc3ltYm9sUGljayk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVwZGF0ZSBsYXN0IHNlcGFyYXRvciB3aXRoIG51bWJlciBvZiBzeW1ib2xzIHdlIGZvdW5kIGZvciBraW5kXG5cdFx0XHR1cGRhdGVMYXN0U2VwYXJhdG9yTGFiZWwoKTtcblx0XHR9IGVsc2UgaWYgKHNvcnRlZEZpbHRlcmVkU3ltYm9sUGlja3MubGVuZ3RoID4gMCkge1xuXHRcdFx0c3ltYm9sUGlja3MgPSBbXG5cdFx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCdzeW1ib2xzJywgXCJzeW1ib2xzICh7MH0pXCIsIGZpbHRlcmVkU3ltYm9sUGlja3MubGVuZ3RoKSwgdHlwZTogJ3NlcGFyYXRvcicgfSxcblx0XHRcdFx0Li4uc29ydGVkRmlsdGVyZWRTeW1ib2xQaWNrc1xuXHRcdFx0XTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3ltYm9sUGlja3M7XG5cdH1cblxuXHRwcml2YXRlIGNvbXBhcmVCeVNjb3JlKHN5bWJvbEE6IElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSwgc3ltYm9sQjogSUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtKTogbnVtYmVyIHtcblx0XHRpZiAodHlwZW9mIHN5bWJvbEEuc2NvcmUgIT09ICdudW1iZXInICYmIHR5cGVvZiBzeW1ib2xCLnNjb3JlID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2Ygc3ltYm9sQS5zY29yZSA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHN5bWJvbEIuc2NvcmUgIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBzeW1ib2xBLnNjb3JlID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygc3ltYm9sQi5zY29yZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGlmIChzeW1ib2xBLnNjb3JlID4gc3ltYm9sQi5zY29yZSkge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9IGVsc2UgaWYgKHN5bWJvbEEuc2NvcmUgPCBzeW1ib2xCLnNjb3JlKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzeW1ib2xBLmluZGV4IDwgc3ltYm9sQi5pbmRleCkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH0gZWxzZSBpZiAoc3ltYm9sQS5pbmRleCA+IHN5bWJvbEIuaW5kZXgpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wYXJlQnlLaW5kQW5kU2NvcmUoc3ltYm9sQTogSUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtLCBzeW1ib2xCOiBJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0pOiBudW1iZXIge1xuXHRcdGNvbnN0IGtpbmRBID0gTkxTX1NZTUJPTF9LSU5EX0NBQ0hFW3N5bWJvbEEua2luZF0gfHwgRkFMTEJBQ0tfTkxTX1NZTUJPTF9LSU5EO1xuXHRcdGNvbnN0IGtpbmRCID0gTkxTX1NZTUJPTF9LSU5EX0NBQ0hFW3N5bWJvbEIua2luZF0gfHwgRkFMTEJBQ0tfTkxTX1NZTUJPTF9LSU5EO1xuXG5cdFx0Ly8gU29ydCBieSB0eXBlIGZpcnN0IGlmIHNjb3BlZCBzZWFyY2hcblx0XHRjb25zdCByZXN1bHQgPSBraW5kQS5sb2NhbGVDb21wYXJlKGtpbmRCKTtcblx0XHRpZiAocmVzdWx0ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb21wYXJlQnlTY29yZShzeW1ib2xBLCBzeW1ib2xCKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldERvY3VtZW50U3ltYm9scyhkb2N1bWVudDogSVRleHRNb2RlbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxEb2N1bWVudFN5bWJvbFtdPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLl9vdXRsaW5lTW9kZWxTZXJ2aWNlLmdldE9yQ3JlYXRlKGRvY3VtZW50LCB0b2tlbik7XG5cdFx0cmV0dXJuIHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkID8gW10gOiBtb2RlbC5hc0xpc3RPZkRvY3VtZW50U3ltYm9scygpO1xuXHR9XG59XG5cbi8vICNyZWdpb24gTkxTIEhlbHBlcnNcblxuY29uc3QgRkFMTEJBQ0tfTkxTX1NZTUJPTF9LSU5EID0gbG9jYWxpemUoJ3Byb3BlcnR5JywgXCJwcm9wZXJ0aWVzICh7MH0pXCIpO1xuY29uc3QgTkxTX1NZTUJPTF9LSU5EX0NBQ0hFOiB7IFt0eXBlOiBudW1iZXJdOiBzdHJpbmcgfSA9IHtcblx0W1N5bWJvbEtpbmQuTWV0aG9kXTogbG9jYWxpemUoJ21ldGhvZCcsIFwibWV0aG9kcyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuRnVuY3Rpb25dOiBsb2NhbGl6ZSgnZnVuY3Rpb24nLCBcImZ1bmN0aW9ucyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuQ29uc3RydWN0b3JdOiBsb2NhbGl6ZSgnX2NvbnN0cnVjdG9yJywgXCJjb25zdHJ1Y3RvcnMgKHswfSlcIiksXG5cdFtTeW1ib2xLaW5kLlZhcmlhYmxlXTogbG9jYWxpemUoJ3ZhcmlhYmxlJywgXCJ2YXJpYWJsZXMgKHswfSlcIiksXG5cdFtTeW1ib2xLaW5kLkNsYXNzXTogbG9jYWxpemUoJ2NsYXNzJywgXCJjbGFzc2VzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5TdHJ1Y3RdOiBsb2NhbGl6ZSgnc3RydWN0JywgXCJzdHJ1Y3RzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5FdmVudF06IGxvY2FsaXplKCdldmVudCcsIFwiZXZlbnRzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5PcGVyYXRvcl06IGxvY2FsaXplKCdvcGVyYXRvcicsIFwib3BlcmF0b3JzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5JbnRlcmZhY2VdOiBsb2NhbGl6ZSgnaW50ZXJmYWNlJywgXCJpbnRlcmZhY2VzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5OYW1lc3BhY2VdOiBsb2NhbGl6ZSgnbmFtZXNwYWNlJywgXCJuYW1lc3BhY2VzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5QYWNrYWdlXTogbG9jYWxpemUoJ3BhY2thZ2UnLCBcInBhY2thZ2VzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5UeXBlUGFyYW1ldGVyXTogbG9jYWxpemUoJ3R5cGVQYXJhbWV0ZXInLCBcInR5cGUgcGFyYW1ldGVycyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuTW9kdWxlXTogbG9jYWxpemUoJ21vZHVsZXMnLCBcIm1vZHVsZXMgKHswfSlcIiksXG5cdFtTeW1ib2xLaW5kLlByb3BlcnR5XTogbG9jYWxpemUoJ3Byb3BlcnR5JywgXCJwcm9wZXJ0aWVzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5FbnVtXTogbG9jYWxpemUoJ2VudW0nLCBcImVudW1lcmF0aW9ucyAoezB9KVwiKSxcblx0W1N5bWJvbEtpbmQuRW51bU1lbWJlcl06IGxvY2FsaXplKCdlbnVtTWVtYmVyJywgXCJlbnVtZXJhdGlvbiBtZW1iZXJzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5TdHJpbmddOiBsb2NhbGl6ZSgnc3RyaW5nJywgXCJzdHJpbmdzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5GaWxlXTogbG9jYWxpemUoJ2ZpbGUnLCBcImZpbGVzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5BcnJheV06IGxvY2FsaXplKCdhcnJheScsIFwiYXJyYXlzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5OdW1iZXJdOiBsb2NhbGl6ZSgnbnVtYmVyJywgXCJudW1iZXJzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5Cb29sZWFuXTogbG9jYWxpemUoJ2Jvb2xlYW4nLCBcImJvb2xlYW5zICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5PYmplY3RdOiBsb2NhbGl6ZSgnb2JqZWN0JywgXCJvYmplY3RzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5LZXldOiBsb2NhbGl6ZSgna2V5JywgXCJrZXlzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5GaWVsZF06IGxvY2FsaXplKCdmaWVsZCcsIFwiZmllbGRzICh7MH0pXCIpLFxuXHRbU3ltYm9sS2luZC5Db25zdGFudF06IGxvY2FsaXplKCdjb25zdGFudCcsIFwiY29uc3RhbnRzICh7MH0pXCIpXG59O1xuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUUxQixTQUF5QixjQUFjLGNBQWMsbUJBQW1CO0FBQ3hFLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFTLFFBQVEsWUFBWTtBQUM3QixTQUFpQixhQUFhO0FBQzlCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQXlCLFlBQVksYUFBYSxXQUFXLDZCQUE2QjtBQUMxRixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG1EQUF1SDtBQUNoSSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGdDQUFnQztBQUV6QyxTQUFTLGdCQUFnQjtBQXdCbEIsSUFBZSx3Q0FBZixjQUE2RCw0Q0FBNEM7QUFBQSxFQVEvRyxZQUM0QywwQkFDSixzQkFDdkMsVUFBaUQsdUJBQU8sT0FB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
