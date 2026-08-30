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
import { localize } from "../../../../nls.js";
import { PickerQuickAccessProvider, TriggerAction } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { getWorkspaceSymbols } from "../common/search.js";
import { SymbolKinds, SymbolTag, SymbolKind } from "../../../../editor/common/languages.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Schemas } from "../../../../base/common/network.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from "../../../services/editor/common/editorService.js";
import { Range } from "../../../../editor/common/core/range.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { getSelectionSearchString } from "../../../../editor/contrib/find/browser/findController.js";
import { prepareQuery, scoreFuzzy2, pieceToQuery } from "../../../../base/common/fuzzyScorer.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
let SymbolsQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(labelService, openerService, editorService, configurationService, codeEditorService, chatWidgetService) {
    super(SymbolsQuickAccessProvider.PREFIX, {
      canAcceptInBackground: true,
      noResultsPick: {
        label: localize("noSymbolResults", "No matching workspace symbols")
      }
    });
    this.labelService = labelService;
    this.openerService = openerService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
    this.chatWidgetService = chatWidgetService;
    this.delayer = this._register(new ThrottledDelayer(SymbolsQuickAccessProvider.TYPING_SEARCH_DELAY));
  }
  get defaultFilterValue() {
    const editor = this.codeEditorService.getFocusedCodeEditor();
    if (editor) {
      return getSelectionSearchString(editor) ?? void 0;
    }
    return void 0;
  }
  get configuration() {
    const editorConfig = this.configurationService.getValue().workbench?.editor;
    return {
      openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
      openSideBySideDirection: editorConfig?.openSideBySideDirection
    };
  }
  _getPicks(filter, disposables, token) {
    return this.getSymbolPicks(filter, void 0, token);
  }
  async getSymbolPicks(filter, options, token) {
    return this.delayer.trigger(async () => {
      if (token.isCancellationRequested) {
        return [];
      }
      return this.doGetSymbolPicks(prepareQuery(filter), options, token);
    }, options?.delay);
  }
  async doGetSymbolPicks(query, options, token) {
    let symbolQuery;
    let containerQuery;
    if (query.values && query.values.length > 1) {
      symbolQuery = pieceToQuery(query.values[0]);
      containerQuery = pieceToQuery(query.values.slice(1));
    } else {
      symbolQuery = query;
    }
    const workspaceSymbols = await getWorkspaceSymbols(symbolQuery.original, token);
    if (token.isCancellationRequested) {
      return [];
    }
    const symbolPicks = [];
    const openSideBySideDirection = this.configuration.openSideBySideDirection;
    for (const { symbol, provider } of workspaceSymbols) {
      if (options?.skipLocal && !SymbolsQuickAccessProvider.TREAT_AS_GLOBAL_SYMBOL_TYPES.has(symbol.kind) && !!symbol.containerName) {
        continue;
      }
      const symbolLabel = symbol.name;
      let symbolScore = void 0;
      let symbolMatches = void 0;
      let skipContainerQuery = false;
      if (symbolQuery.original.length > 0) {
        if (symbolQuery !== query) {
          [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabel, {
            ...query,
            values: void 0
            /* disable multi-query support */
          }, 0, 0);
          if (typeof symbolScore === "number") {
            skipContainerQuery = true;
          }
        }
        if (typeof symbolScore !== "number") {
          [symbolScore, symbolMatches] = scoreFuzzy2(symbolLabel, symbolQuery, 0, 0);
          if (typeof symbolScore !== "number") {
            continue;
          }
        }
      }
      const symbolUri = symbol.location.uri;
      let containerLabel = void 0;
      if (symbolUri) {
        const containerPath = this.labelService.getUriLabel(symbolUri, { relative: true });
        if (symbol.containerName) {
          containerLabel = `${symbol.containerName} \u2022 ${containerPath}`;
        } else {
          containerLabel = containerPath;
        }
      }
      let containerScore = void 0;
      let containerMatches = void 0;
      if (!skipContainerQuery && containerQuery && containerQuery.original.length > 0) {
        if (containerLabel) {
          [containerScore, containerMatches] = scoreFuzzy2(containerLabel, containerQuery);
        }
        if (typeof containerScore !== "number") {
          continue;
        }
        if (typeof symbolScore === "number") {
          symbolScore += containerScore;
        }
      }
      const deprecated = symbol.tags ? symbol.tags.indexOf(SymbolTag.Deprecated) >= 0 : false;
      symbolPicks.push({
        symbol,
        resource: symbolUri,
        score: symbolScore,
        iconClass: ThemeIcon.asClassName(SymbolKinds.toIcon(symbol.kind)),
        label: symbolLabel,
        ariaLabel: symbolLabel,
        highlights: deprecated ? void 0 : {
          label: symbolMatches,
          description: containerMatches
        },
        description: containerLabel,
        strikethrough: deprecated,
        buttons: [
          {
            iconClass: openSideBySideDirection === "right" ? ThemeIcon.asClassName(Codicon.splitHorizontal) : ThemeIcon.asClassName(Codicon.splitVertical),
            tooltip: openSideBySideDirection === "right" ? localize("openToSide", "Open to the Side") : localize("openToBottom", "Open to the Bottom")
          }
        ],
        trigger: (buttonIndex, keyMods) => {
          this.openSymbol(provider, symbol, token, { keyMods, forceOpenSideBySide: true });
          return TriggerAction.CLOSE_PICKER;
        },
        accept: async (keyMods, event) => this.openSymbol(provider, symbol, token, { keyMods, preserveFocus: event.inBackground, forcePinned: event.inBackground }),
        attach: (keyMods, event) => {
          if (keyMods.shift) {
            const widget = this.chatWidgetService.lastFocusedWidget;
            if (widget) {
              const entry = {
                kind: "symbol",
                id: JSON.stringify({ uri: symbolUri.toString(), range: symbol.location.range }),
                name: symbol.name,
                value: symbol.location,
                symbolKind: symbol.kind
              };
              widget.attachmentModel.addContext(entry);
            }
            return;
          }
          this.openSymbol(provider, symbol, token, { keyMods, preserveFocus: event.inBackground, forcePinned: event.inBackground });
        }
      });
    }
    if (!options?.skipSorting) {
      symbolPicks.sort((symbolA, symbolB) => this.compareSymbols(symbolA, symbolB));
    }
    return symbolPicks;
  }
  async openSymbol(provider, symbol, token, options) {
    let symbolToOpen = symbol;
    if (typeof provider.resolveWorkspaceSymbol === "function") {
      symbolToOpen = await provider.resolveWorkspaceSymbol(symbol, token) || symbol;
      if (token.isCancellationRequested) {
        return;
      }
    }
    if (symbolToOpen.location.uri.scheme === Schemas.http || symbolToOpen.location.uri.scheme === Schemas.https) {
      await this.openerService.open(symbolToOpen.location.uri, { fromUserGesture: true, allowContributedOpeners: true });
    } else {
      await this.editorService.openEditor({
        resource: symbolToOpen.location.uri,
        options: {
          preserveFocus: options?.preserveFocus,
          pinned: options.keyMods.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
          selection: symbolToOpen.location.range ? Range.collapseToStart(symbolToOpen.location.range) : void 0
        }
      }, options.keyMods.alt || this.configuration.openEditorPinned && options.keyMods.ctrlCmd || options?.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP);
    }
  }
  compareSymbols(symbolA, symbolB) {
    if (typeof symbolA.score === "number" && typeof symbolB.score === "number") {
      if (symbolA.score > symbolB.score) {
        return -1;
      }
      if (symbolA.score < symbolB.score) {
        return 1;
      }
    }
    if (symbolA.symbol && symbolB.symbol) {
      const symbolAName = symbolA.symbol.name.toLowerCase();
      const symbolBName = symbolB.symbol.name.toLowerCase();
      const res = symbolAName.localeCompare(symbolBName);
      if (res !== 0) {
        return res;
      }
    }
    if (symbolA.symbol && symbolB.symbol) {
      const symbolAKind = SymbolKinds.toIcon(symbolA.symbol.kind).id;
      const symbolBKind = SymbolKinds.toIcon(symbolB.symbol.kind).id;
      return symbolAKind.localeCompare(symbolBKind);
    }
    return 0;
  }
};
SymbolsQuickAccessProvider.PREFIX = "#";
SymbolsQuickAccessProvider.TYPING_SEARCH_DELAY = 200;
// this delay accommodates for the user typing a word and then stops typing to start searching
SymbolsQuickAccessProvider.TREAT_AS_GLOBAL_SYMBOL_TYPES = /* @__PURE__ */ new Set([
  SymbolKind.Class,
  SymbolKind.Enum,
  SymbolKind.File,
  SymbolKind.Interface,
  SymbolKind.Namespace,
  SymbolKind.Package,
  SymbolKind.Module
]);
SymbolsQuickAccessProvider = __decorateClass([
  __decorateParam(0, ILabelService),
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IChatWidgetService)
], SymbolsQuickAccessProvider);
export {
  SymbolsQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc3ltYm9sc1F1aWNrQWNjZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSwgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlciwgVHJpZ2dlckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9waWNrZXJRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGdldFdvcmtzcGFjZVN5bWJvbHMsIElXb3Jrc3BhY2VTeW1ib2wsIElXb3Jrc3BhY2VTeW1ib2xQcm92aWRlciB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgU3ltYm9sS2luZHMsIFN5bWJvbFRhZywgU3ltYm9sS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCwgQUNUSVZFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVkaXRvckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElLZXlNb2RzLCBJUXVpY2tQaWNrSXRlbVdpdGhSZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0U2VsZWN0aW9uU2VhcmNoU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IHByZXBhcmVRdWVyeSwgSVByZXBhcmVkUXVlcnksIHNjb3JlRnV6enkyLCBwaWVjZVRvUXVlcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdXp6eVNjb3Jlci5qcyc7XG5pbXBvcnQgeyBJTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSVN5bWJvbFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJU3ltYm9sUXVpY2tQaWNrSXRlbSBleHRlbmRzIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIElRdWlja1BpY2tJdGVtV2l0aFJlc291cmNlIHtcblx0c2NvcmU/OiBudW1iZXI7XG5cdHN5bWJvbD86IElXb3Jrc3BhY2VTeW1ib2w7XG59XG5cbmV4cG9ydCBjbGFzcyBTeW1ib2xzUXVpY2tBY2Nlc3NQcm92aWRlciBleHRlbmRzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8SVN5bWJvbFF1aWNrUGlja0l0ZW0+IHtcblxuXHRzdGF0aWMgUFJFRklYID0gJyMnO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRZUElOR19TRUFSQ0hfREVMQVkgPSAyMDA7IC8vIHRoaXMgZGVsYXkgYWNjb21tb2RhdGVzIGZvciB0aGUgdXNlciB0eXBpbmcgYSB3b3JkIGFuZCB0aGVuIHN0b3BzIHR5cGluZyB0byBzdGFydCBzZWFyY2hpbmdcblxuXHRwcml2YXRlIHN0YXRpYyBUUkVBVF9BU19HTE9CQUxfU1lNQk9MX1RZUEVTID0gbmV3IFNldDxTeW1ib2xLaW5kPihbXG5cdFx0U3ltYm9sS2luZC5DbGFzcyxcblx0XHRTeW1ib2xLaW5kLkVudW0sXG5cdFx0U3ltYm9sS2luZC5GaWxlLFxuXHRcdFN5bWJvbEtpbmQuSW50ZXJmYWNlLFxuXHRcdFN5bWJvbEtpbmQuTmFtZXNwYWNlLFxuXHRcdFN5bWJvbEtpbmQuUGFja2FnZSxcblx0XHRTeW1ib2xLaW5kLk1vZHVsZVxuXHRdKTtcblxuXHRwcml2YXRlIGRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcjxJU3ltYm9sUXVpY2tQaWNrSXRlbVtdPihTeW1ib2xzUXVpY2tBY2Nlc3NQcm92aWRlci5UWVBJTkdfU0VBUkNIX0RFTEFZKSk7XG5cblx0Z2V0IGRlZmF1bHRGaWx0ZXJWYWx1ZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gUHJlZmVyIHRoZSB3b3JkIHVuZGVyIHRoZSBjdXJzb3IgaW4gdGhlIGFjdGl2ZSBlZGl0b3IgYXMgZGVmYXVsdCBmaWx0ZXJcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0cmV0dXJuIGdldFNlbGVjdGlvblNlYXJjaFN0cmluZyhlZGl0b3IpID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYLCB7XG5cdFx0XHRjYW5BY2NlcHRJbkJhY2tncm91bmQ6IHRydWUsXG5cdFx0XHRub1Jlc3VsdHNQaWNrOiB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbm9TeW1ib2xSZXN1bHRzJywgXCJObyBtYXRjaGluZyB3b3Jrc3BhY2Ugc3ltYm9sc1wiKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgY29uZmlndXJhdGlvbigpIHtcblx0XHRjb25zdCBlZGl0b3JDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElXb3JrYmVuY2hFZGl0b3JDb25maWd1cmF0aW9uPigpLndvcmtiZW5jaD8uZWRpdG9yO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9wZW5FZGl0b3JQaW5uZWQ6ICFlZGl0b3JDb25maWc/LmVuYWJsZVByZXZpZXdGcm9tUXVpY2tPcGVuIHx8ICFlZGl0b3JDb25maWc/LmVuYWJsZVByZXZpZXcsXG5cdFx0XHRvcGVuU2lkZUJ5U2lkZURpcmVjdGlvbjogZWRpdG9yQ29uZmlnPy5vcGVuU2lkZUJ5U2lkZURpcmVjdGlvblxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFBpY2tzKGZpbHRlcjogc3RyaW5nLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFycmF5PElTeW1ib2xRdWlja1BpY2tJdGVtPj4ge1xuXHRcdHJldHVybiB0aGlzLmdldFN5bWJvbFBpY2tzKGZpbHRlciwgdW5kZWZpbmVkLCB0b2tlbik7XG5cdH1cblxuXHRhc3luYyBnZXRTeW1ib2xQaWNrcyhmaWx0ZXI6IHN0cmluZywgb3B0aW9uczogeyBza2lwTG9jYWw/OiBib29sZWFuOyBza2lwU29ydGluZz86IGJvb2xlYW47IGRlbGF5PzogbnVtYmVyIH0gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8QXJyYXk8SVN5bWJvbFF1aWNrUGlja0l0ZW0+PiB7XG5cdFx0cmV0dXJuIHRoaXMuZGVsYXllci50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLmRvR2V0U3ltYm9sUGlja3MocHJlcGFyZVF1ZXJ5KGZpbHRlciksIG9wdGlvbnMsIHRva2VuKTtcblx0XHR9LCBvcHRpb25zPy5kZWxheSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvR2V0U3ltYm9sUGlja3MocXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCBvcHRpb25zOiB7IHNraXBMb2NhbD86IGJvb2xlYW47IHNraXBTb3J0aW5nPzogYm9vbGVhbiB9IHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFycmF5PElTeW1ib2xRdWlja1BpY2tJdGVtPj4ge1xuXG5cdFx0Ly8gU3BsaXQgYmV0d2VlbiBzeW1ib2wgYW5kIGNvbnRhaW5lciBxdWVyeVxuXHRcdGxldCBzeW1ib2xRdWVyeTogSVByZXBhcmVkUXVlcnk7XG5cdFx0bGV0IGNvbnRhaW5lclF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSB8IHVuZGVmaW5lZDtcblx0XHRpZiAocXVlcnkudmFsdWVzICYmIHF1ZXJ5LnZhbHVlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRzeW1ib2xRdWVyeSA9IHBpZWNlVG9RdWVyeShxdWVyeS52YWx1ZXNbMF0pOyBcdFx0ICAvLyBzeW1ib2w6IG9ubHkgbWF0Y2ggb24gZmlyc3QgcGFydFxuXHRcdFx0Y29udGFpbmVyUXVlcnkgPSBwaWVjZVRvUXVlcnkocXVlcnkudmFsdWVzLnNsaWNlKDEpKTsgLy8gY29udGFpbmVyOiBtYXRjaCBvbiBhbGwgYnV0IGZpcnN0IHBhcnRzXG5cdFx0fSBlbHNlIHtcblx0XHRcdHN5bWJvbFF1ZXJ5ID0gcXVlcnk7XG5cdFx0fVxuXG5cdFx0Ly8gUnVuIHRoZSB3b3Jrc3BhY2Ugc3ltYm9sIHF1ZXJ5XG5cdFx0Y29uc3Qgd29ya3NwYWNlU3ltYm9scyA9IGF3YWl0IGdldFdvcmtzcGFjZVN5bWJvbHMoc3ltYm9sUXVlcnkub3JpZ2luYWwsIHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBzeW1ib2xQaWNrczogQXJyYXk8SVN5bWJvbFF1aWNrUGlja0l0ZW0+ID0gW107XG5cblx0XHQvLyBDb252ZXJ0IHRvIHN5bWJvbCBwaWNrcyBhbmQgYXBwbHkgZmlsdGVyaW5nXG5cdFx0Y29uc3Qgb3BlblNpZGVCeVNpZGVEaXJlY3Rpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb24ub3BlblNpZGVCeVNpZGVEaXJlY3Rpb247XG5cdFx0Zm9yIChjb25zdCB7IHN5bWJvbCwgcHJvdmlkZXIgfSBvZiB3b3Jrc3BhY2VTeW1ib2xzKSB7XG5cblx0XHRcdC8vIERlcGVuZGluZyBvbiB0aGUgd29ya3NwYWNlIHN5bWJvbHMgZmlsdGVyIHNldHRpbmcsIHNraXAgb3ZlciBzeW1ib2xzIHRoYXQ6XG5cdFx0XHQvLyAtIGRvIG5vdCBoYXZlIGEgY29udGFpbmVyXG5cdFx0XHQvLyAtIGFuZCBhcmUgbm90IHRyZWF0ZWQgZXhwbGljaXRseSBhcyBnbG9iYWwgc3ltYm9scyAoZS5nLiBjbGFzc2VzKVxuXHRcdFx0aWYgKG9wdGlvbnM/LnNraXBMb2NhbCAmJiAhU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIuVFJFQVRfQVNfR0xPQkFMX1NZTUJPTF9UWVBFUy5oYXMoc3ltYm9sLmtpbmQpICYmICEhc3ltYm9sLmNvbnRhaW5lck5hbWUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN5bWJvbExhYmVsID0gc3ltYm9sLm5hbWU7XG5cblx0XHRcdC8vIFNjb3JlIGJ5IHN5bWJvbCBsYWJlbCBpZiBzZWFyY2hpbmdcblx0XHRcdGxldCBzeW1ib2xTY29yZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHN5bWJvbE1hdGNoZXM6IElNYXRjaFtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHNraXBDb250YWluZXJRdWVyeSA9IGZhbHNlO1xuXHRcdFx0aWYgKHN5bWJvbFF1ZXJ5Lm9yaWdpbmFsLmxlbmd0aCA+IDApIHtcblxuXHRcdFx0XHQvLyBGaXJzdDogdHJ5IHRvIHNjb3JlIG9uIHRoZSBlbnRpcmUgcXVlcnksIGl0IGlzIHBvc3NpYmxlIHRoYXRcblx0XHRcdFx0Ly8gdGhlIHN5bWJvbCBtYXRjaGVzIHBlcmZlY3RseSAoZS5nLiBzZWFyY2hpbmcgZm9yIFwiY2hhbmdlIGxvZ1wiXG5cdFx0XHRcdC8vIGNhbiBiZSBhIG1hdGNoIG9uIGEgbWFya2Rvd24gc3ltYm9sIFwiY2hhbmdlIGxvZ1wiKS4gSW4gdGhhdFxuXHRcdFx0XHQvLyBjYXNlIHdlIHdhbnQgdG8gc2tpcCB0aGUgY29udGFpbmVyIHF1ZXJ5IGFsdG9nZXRoZXIuXG5cdFx0XHRcdGlmIChzeW1ib2xRdWVyeSAhPT0gcXVlcnkpIHtcblx0XHRcdFx0XHRbc3ltYm9sU2NvcmUsIHN5bWJvbE1hdGNoZXNdID0gc2NvcmVGdXp6eTIoc3ltYm9sTGFiZWwsIHsgLi4ucXVlcnksIHZhbHVlczogdW5kZWZpbmVkIC8qIGRpc2FibGUgbXVsdGktcXVlcnkgc3VwcG9ydCAqLyB9LCAwLCAwKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHN5bWJvbFNjb3JlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0c2tpcENvbnRhaW5lclF1ZXJ5ID0gdHJ1ZTsgLy8gc2luY2Ugd2UgY29uc3VtZWQgdGhlIHF1ZXJ5LCBza2lwIGFueSBjb250YWluZXIgbWF0Y2hpbmdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPdGhlcndpc2U6IHNjb3JlIG9uIHRoZSBzeW1ib2wgcXVlcnkgYW5kIG1hdGNoIG9uIHRoZSBjb250YWluZXIgbGF0ZXJcblx0XHRcdFx0aWYgKHR5cGVvZiBzeW1ib2xTY29yZSAhPT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRbc3ltYm9sU2NvcmUsIHN5bWJvbE1hdGNoZXNdID0gc2NvcmVGdXp6eTIoc3ltYm9sTGFiZWwsIHN5bWJvbFF1ZXJ5LCAwLCAwKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHN5bWJvbFNjb3JlICE9PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN5bWJvbFVyaSA9IHN5bWJvbC5sb2NhdGlvbi51cmk7XG5cdFx0XHRsZXQgY29udGFpbmVyTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzeW1ib2xVcmkpIHtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyUGF0aCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHN5bWJvbFVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0aWYgKHN5bWJvbC5jb250YWluZXJOYW1lKSB7XG5cdFx0XHRcdFx0Y29udGFpbmVyTGFiZWwgPSBgJHtzeW1ib2wuY29udGFpbmVyTmFtZX0gXHUyMDIyICR7Y29udGFpbmVyUGF0aH1gO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnRhaW5lckxhYmVsID0gY29udGFpbmVyUGF0aDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBTY29yZSBieSBjb250YWluZXIgaWYgc3BlY2lmaWVkIGFuZCBzZWFyY2hpbmdcblx0XHRcdGxldCBjb250YWluZXJTY29yZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGNvbnRhaW5lck1hdGNoZXM6IElNYXRjaFtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFza2lwQ29udGFpbmVyUXVlcnkgJiYgY29udGFpbmVyUXVlcnkgJiYgY29udGFpbmVyUXVlcnkub3JpZ2luYWwubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpZiAoY29udGFpbmVyTGFiZWwpIHtcblx0XHRcdFx0XHRbY29udGFpbmVyU2NvcmUsIGNvbnRhaW5lck1hdGNoZXNdID0gc2NvcmVGdXp6eTIoY29udGFpbmVyTGFiZWwsIGNvbnRhaW5lclF1ZXJ5KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0eXBlb2YgY29udGFpbmVyU2NvcmUgIT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodHlwZW9mIHN5bWJvbFNjb3JlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHN5bWJvbFNjb3JlICs9IGNvbnRhaW5lclNjb3JlOyAvLyBib29zdCBzeW1ib2xTY29yZSBieSBjb250YWluZXJTY29yZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlcHJlY2F0ZWQgPSBzeW1ib2wudGFncyA/IHN5bWJvbC50YWdzLmluZGV4T2YoU3ltYm9sVGFnLkRlcHJlY2F0ZWQpID49IDAgOiBmYWxzZTtcblxuXHRcdFx0c3ltYm9sUGlja3MucHVzaCh7XG5cdFx0XHRcdHN5bWJvbCxcblx0XHRcdFx0cmVzb3VyY2U6IHN5bWJvbFVyaSxcblx0XHRcdFx0c2NvcmU6IHN5bWJvbFNjb3JlLFxuXHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShTeW1ib2xLaW5kcy50b0ljb24oc3ltYm9sLmtpbmQpKSxcblx0XHRcdFx0bGFiZWw6IHN5bWJvbExhYmVsLFxuXHRcdFx0XHRhcmlhTGFiZWw6IHN5bWJvbExhYmVsLFxuXHRcdFx0XHRoaWdobGlnaHRzOiBkZXByZWNhdGVkID8gdW5kZWZpbmVkIDoge1xuXHRcdFx0XHRcdGxhYmVsOiBzeW1ib2xNYXRjaGVzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBjb250YWluZXJNYXRjaGVzXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBjb250YWluZXJMYWJlbCxcblx0XHRcdFx0c3RyaWtldGhyb3VnaDogZGVwcmVjYXRlZCxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGljb25DbGFzczogb3BlblNpZGVCeVNpZGVEaXJlY3Rpb24gPT09ICdyaWdodCcgPyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5zcGxpdEhvcml6b250YWwpIDogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3BsaXRWZXJ0aWNhbCksXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBvcGVuU2lkZUJ5U2lkZURpcmVjdGlvbiA9PT0gJ3JpZ2h0JyA/IGxvY2FsaXplKCdvcGVuVG9TaWRlJywgXCJPcGVuIHRvIHRoZSBTaWRlXCIpIDogbG9jYWxpemUoJ29wZW5Ub0JvdHRvbScsIFwiT3BlbiB0byB0aGUgQm90dG9tXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHR0cmlnZ2VyOiAoYnV0dG9uSW5kZXgsIGtleU1vZHMpID0+IHtcblx0XHRcdFx0XHR0aGlzLm9wZW5TeW1ib2wocHJvdmlkZXIsIHN5bWJvbCwgdG9rZW4sIHsga2V5TW9kcywgZm9yY2VPcGVuU2lkZUJ5U2lkZTogdHJ1ZSB9KTtcblxuXHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLkNMT1NFX1BJQ0tFUjtcblx0XHRcdFx0fSxcblx0XHRcdFx0YWNjZXB0OiBhc3luYyAoa2V5TW9kcywgZXZlbnQpID0+IHRoaXMub3BlblN5bWJvbChwcm92aWRlciwgc3ltYm9sLCB0b2tlbiwgeyBrZXlNb2RzLCBwcmVzZXJ2ZUZvY3VzOiBldmVudC5pbkJhY2tncm91bmQsIGZvcmNlUGlubmVkOiBldmVudC5pbkJhY2tncm91bmQgfSksXG5cdFx0XHRcdGF0dGFjaDogKGtleU1vZHMsIGV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0Ly8gT25seSBzdXBwb3J0IGFkZGluZyBjb250ZXh0IHRvIGNoYXQgd2hlbiBzaGlmdCBpcyBwcmVzc2VkXG5cdFx0XHRcdFx0aWYgKGtleU1vZHMuc2hpZnQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0XHRcdFx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGVudHJ5OiBJU3ltYm9sVmFyaWFibGVFbnRyeSA9IHtcblx0XHRcdFx0XHRcdFx0XHRraW5kOiAnc3ltYm9sJyxcblx0XHRcdFx0XHRcdFx0XHRpZDogSlNPTi5zdHJpbmdpZnkoeyB1cmk6IHN5bWJvbFVyaS50b1N0cmluZygpLCByYW5nZTogc3ltYm9sLmxvY2F0aW9uLnJhbmdlIH0pLFxuXHRcdFx0XHRcdFx0XHRcdG5hbWU6IHN5bWJvbC5uYW1lLFxuXHRcdFx0XHRcdFx0XHRcdHZhbHVlOiBzeW1ib2wubG9jYXRpb24sXG5cdFx0XHRcdFx0XHRcdFx0c3ltYm9sS2luZDogc3ltYm9sLmtpbmQsXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdHdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dChlbnRyeSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRmFsbGJhY2sgdG8gYWNjZXB0IGJlaGF2aW9yLlxuXHRcdFx0XHRcdHRoaXMub3BlblN5bWJvbChwcm92aWRlciwgc3ltYm9sLCB0b2tlbiwgeyBrZXlNb2RzLCBwcmVzZXJ2ZUZvY3VzOiBldmVudC5pbkJhY2tncm91bmQsIGZvcmNlUGlubmVkOiBldmVudC5pbkJhY2tncm91bmQgfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdH1cblxuXHRcdC8vIFNvcnQgcGlja3MgKHVubGVzcyBkaXNhYmxlZClcblx0XHRpZiAoIW9wdGlvbnM/LnNraXBTb3J0aW5nKSB7XG5cdFx0XHRzeW1ib2xQaWNrcy5zb3J0KChzeW1ib2xBLCBzeW1ib2xCKSA9PiB0aGlzLmNvbXBhcmVTeW1ib2xzKHN5bWJvbEEsIHN5bWJvbEIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3ltYm9sUGlja3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5TeW1ib2wocHJvdmlkZXI6IElXb3Jrc3BhY2VTeW1ib2xQcm92aWRlciwgc3ltYm9sOiBJV29ya3NwYWNlU3ltYm9sLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIG9wdGlvbnM6IHsga2V5TW9kczogSUtleU1vZHM7IGZvcmNlT3BlblNpZGVCeVNpZGU/OiBib29sZWFuOyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjsgZm9yY2VQaW5uZWQ/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFJlc29sdmUgYWN0dWFsIHN5bWJvbCB0byBvcGVuIGZvciBwcm92aWRlcnMgdGhhdCBjYW4gcmVzb2x2ZVxuXHRcdGxldCBzeW1ib2xUb09wZW4gPSBzeW1ib2w7XG5cdFx0aWYgKHR5cGVvZiBwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlU3ltYm9sID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRzeW1ib2xUb09wZW4gPSBhd2FpdCBwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlU3ltYm9sKHN5bWJvbCwgdG9rZW4pIHx8IHN5bWJvbDtcblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPcGVuIEhUVFAocykgbGlua3Mgd2l0aCBvcGVuZXIgc2VydmljZVxuXHRcdGlmIChzeW1ib2xUb09wZW4ubG9jYXRpb24udXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5odHRwIHx8IHN5bWJvbFRvT3Blbi5sb2NhdGlvbi51cmkuc2NoZW1lID09PSBTY2hlbWFzLmh0dHBzKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihzeW1ib2xUb09wZW4ubG9jYXRpb24udXJpLCB7IGZyb21Vc2VyR2VzdHVyZTogdHJ1ZSwgYWxsb3dDb250cmlidXRlZE9wZW5lcnM6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIG9wZW4gYXMgZWRpdG9yXG5cdFx0ZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBzeW1ib2xUb09wZW4ubG9jYXRpb24udXJpLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0cHJlc2VydmVGb2N1czogb3B0aW9ucz8ucHJlc2VydmVGb2N1cyxcblx0XHRcdFx0XHRwaW5uZWQ6IG9wdGlvbnMua2V5TW9kcy5jdHJsQ21kIHx8IG9wdGlvbnMuZm9yY2VQaW5uZWQgfHwgdGhpcy5jb25maWd1cmF0aW9uLm9wZW5FZGl0b3JQaW5uZWQsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiBzeW1ib2xUb09wZW4ubG9jYXRpb24ucmFuZ2UgPyBSYW5nZS5jb2xsYXBzZVRvU3RhcnQoc3ltYm9sVG9PcGVuLmxvY2F0aW9uLnJhbmdlKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHR9XG5cdFx0XHR9LCBvcHRpb25zLmtleU1vZHMuYWx0IHx8ICh0aGlzLmNvbmZpZ3VyYXRpb24ub3BlbkVkaXRvclBpbm5lZCAmJiBvcHRpb25zLmtleU1vZHMuY3RybENtZCkgfHwgb3B0aW9ucz8uZm9yY2VPcGVuU2lkZUJ5U2lkZSA/IFNJREVfR1JPVVAgOiBBQ1RJVkVfR1JPVVApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY29tcGFyZVN5bWJvbHMoc3ltYm9sQTogSVN5bWJvbFF1aWNrUGlja0l0ZW0sIHN5bWJvbEI6IElTeW1ib2xRdWlja1BpY2tJdGVtKTogbnVtYmVyIHtcblxuXHRcdC8vIEJ5IHNjb3JlXG5cdFx0aWYgKHR5cGVvZiBzeW1ib2xBLnNjb3JlID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygc3ltYm9sQi5zY29yZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGlmIChzeW1ib2xBLnNjb3JlID4gc3ltYm9sQi5zY29yZSkge1xuXHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzeW1ib2xBLnNjb3JlIDwgc3ltYm9sQi5zY29yZSkge1xuXHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBCeSBuYW1lXG5cdFx0aWYgKHN5bWJvbEEuc3ltYm9sICYmIHN5bWJvbEIuc3ltYm9sKSB7XG5cdFx0XHRjb25zdCBzeW1ib2xBTmFtZSA9IHN5bWJvbEEuc3ltYm9sLm5hbWUudG9Mb3dlckNhc2UoKTtcblx0XHRcdGNvbnN0IHN5bWJvbEJOYW1lID0gc3ltYm9sQi5zeW1ib2wubmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0Y29uc3QgcmVzID0gc3ltYm9sQU5hbWUubG9jYWxlQ29tcGFyZShzeW1ib2xCTmFtZSk7XG5cdFx0XHRpZiAocmVzICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybiByZXM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQnkga2luZFxuXHRcdGlmIChzeW1ib2xBLnN5bWJvbCAmJiBzeW1ib2xCLnN5bWJvbCkge1xuXHRcdFx0Y29uc3Qgc3ltYm9sQUtpbmQgPSBTeW1ib2xLaW5kcy50b0ljb24oc3ltYm9sQS5zeW1ib2wua2luZCkuaWQ7XG5cdFx0XHRjb25zdCBzeW1ib2xCS2luZCA9IFN5bWJvbEtpbmRzLnRvSWNvbihzeW1ib2xCLnN5bWJvbC5raW5kKS5pZDtcblx0XHRcdHJldHVybiBzeW1ib2xBS2luZC5sb2NhbGVDb21wYXJlKHN5bWJvbEJLaW5kKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gMDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFpQywyQkFBMkIscUJBQXFCO0FBR2pGLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMkJBQXVFO0FBQ2hGLFNBQVMsYUFBYSxXQUFXLGtCQUFrQjtBQUNuRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0IsWUFBWSxvQkFBb0I7QUFDekQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsNkJBQTZCO0FBR3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsY0FBOEIsYUFBYSxvQkFBb0I7QUFFeEUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsMEJBQTBCO0FBUTVCLElBQU0sNkJBQU4sY0FBeUMsMEJBQWdEO0FBQUEsRUE2Qi9GLFlBQ2lDLGNBQ0MsZUFDQSxlQUNPLHNCQUNILG1CQUNBLG1CQUNwQztBQUNELFVBQU0sMkJBQTJCLFFBQVE7QUFBQSxNQUN4Qyx1QkFBdUI7QUFBQSxNQUN2QixlQUFlO0FBQUEsUUFDZCxPQUFPLFNBQVMsbUJBQW1CLCtCQUErQjtBQUFBLE1BQ25FO0FBQUEs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
