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
import { localize, localize2 } from "../../../../../nls.js";
import { IQuickInputService, ItemActivation } from "../../../../../platform/quickinput/common/quickInput.js";
import { IEditorService, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { Extensions as QuickaccessExtensions } from "../../../../../platform/quickinput/common/quickAccess.js";
import { AbstractGotoSymbolQuickAccessProvider } from "../../../../../editor/contrib/quickAccess/browser/gotoSymbolQuickAccess.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { DisposableStore, toDisposable, Disposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { timeout } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { registerAction2, Action2, MenuId } from "../../../../../platform/actions/common/actions.js";
import { KeyMod, KeyCode } from "../../../../../base/common/keyCodes.js";
import { prepareQuery } from "../../../../../base/common/fuzzyScorer.js";
import { SymbolKind } from "../../../../../editor/common/languages.js";
import { fuzzyScore } from "../../../../../base/common/filters.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IOutlineService, OutlineTarget } from "../../../../services/outline/browser/outline.js";
import { isCompositeEditor } from "../../../../../editor/browser/editorBrowser.js";
import { IOutlineModelService } from "../../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { accessibilityHelpIsShown, accessibleViewIsShown } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { matchesFuzzyIconAware, parseLabelWithIcons } from "../../../../../base/common/iconLabels.js";
import { isAncestorOfActiveElement } from "../../../../../base/browser/dom.js";
import { ChatOutline, IChatWidgetService } from "../../../chat/browser/chat.js";
import { isRequestVM } from "../../../chat/common/model/chatViewModel.js";
let GotoSymbolQuickAccessProvider = class extends AbstractGotoSymbolQuickAccessProvider {
  constructor(editorService, configurationService, languageFeaturesService, outlineService, outlineModelService, chatWidgetService) {
    super(languageFeaturesService, outlineModelService, {
      openSideBySideDirection: () => this.configuration.openSideBySideDirection
    });
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.outlineService = outlineService;
    this.chatWidgetService = chatWidgetService;
    this.onDidActiveTextEditorControlChange = this.editorService.onDidActiveEditorChange;
  }
  //#region DocumentSymbols (text editor required)
  get configuration() {
    const editorConfig = this.configurationService.getValue().workbench?.editor;
    return {
      openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
      openSideBySideDirection: editorConfig?.openSideBySideDirection
    };
  }
  get activeTextEditorControl() {
    if (isCompositeEditor(this.editorService.activeEditorPane?.getControl())) {
      return void 0;
    }
    return this.editorService.activeTextEditorControl;
  }
  gotoLocation(context, options) {
    if ((options.keyMods.alt || this.configuration.openEditorPinned && options.keyMods.ctrlCmd || options.forceSideBySide) && this.editorService.activeEditor) {
      context.restoreViewState?.();
      const editorOptions = {
        selection: options.range,
        pinned: options.keyMods.ctrlCmd || this.configuration.openEditorPinned,
        preserveFocus: options.preserveFocus
      };
      this.editorService.openEditor(this.editorService.activeEditor, editorOptions, SIDE_GROUP);
    } else {
      super.gotoLocation(context, options);
    }
  }
  async getSymbolPicks(model, filter, options, disposables, token) {
    const result = await Promise.race([
      this.waitForLanguageSymbolRegistry(model, disposables),
      timeout(GotoSymbolQuickAccessProvider.SYMBOL_PICKS_TIMEOUT)
    ]);
    if (!result || token.isCancellationRequested) {
      return [];
    }
    return this.doGetSymbolPicks(this.getDocumentSymbols(model, token), prepareQuery(filter), options, token, model);
  }
  async doGetSymbolPicks(symbolsPromise, query, options, token, model) {
    const picks = await super.doGetSymbolPicks(symbolsPromise, query, options, token, model);
    const modelUri = model.uri;
    for (const pick of picks) {
      const symbolPick = pick;
      if (symbolPick.range && !symbolPick.attach) {
        symbolPick.attach = () => {
          const widget = this.chatWidgetService.lastFocusedWidget;
          if (!widget) {
            return;
          }
          const entry = {
            kind: "symbol",
            id: JSON.stringify({ uri: modelUri.toString(), range: symbolPick.range.decoration }),
            name: symbolPick.symbolName ?? symbolPick.label,
            value: { uri: modelUri, range: symbolPick.range.decoration },
            symbolKind: symbolPick.kind
          };
          widget.attachmentModel.addContext(entry);
        };
      }
    }
    return picks;
  }
  //#endregion
  provide(picker, token, runOptions) {
    const chatWidget = this.getActiveChatWidget();
    if (chatWidget) {
      picker.canAcceptInBackground = !!this.options?.canAcceptInBackground;
      picker.matchOnLabel = picker.matchOnDescription = picker.matchOnDetail = picker.sortByLabel = false;
      return this.doGetChatWidgetPicks(picker, chatWidget);
    }
    return super.provide(picker, token, runOptions);
  }
  provideWithoutTextEditor(picker) {
    if (this.canPickWithOutlineService()) {
      return this.doGetOutlinePicks(picker);
    }
    return super.provideWithoutTextEditor(picker);
  }
  canPickWithOutlineService() {
    return this.editorService.activeEditorPane ? this.outlineService.canCreateOutline(this.editorService.activeEditorPane) : false;
  }
  getActiveChatWidget() {
    const widget = this.chatWidgetService.lastFocusedWidget;
    if (!widget || !isAncestorOfActiveElement(widget.domNode)) {
      return void 0;
    }
    return widget.viewModel?.getItems().some(isRequestVM) ? widget : void 0;
  }
  doGetChatWidgetPicks(picker, widget) {
    const disposables = new DisposableStore();
    const outline = disposables.add(new ChatOutline(widget, OutlineTarget.QuickPick));
    this.installNavigablePicks(picker, disposables, this.outlineToNavigableEntries(outline));
    return disposables;
  }
  doGetOutlinePicks(picker) {
    const pane = this.editorService.activeEditorPane;
    if (!pane) {
      return Disposable.None;
    }
    const cts = new CancellationTokenSource();
    const disposables = new DisposableStore();
    disposables.add(toDisposable(() => cts.dispose(true)));
    picker.busy = true;
    this.outlineService.createOutline(pane, OutlineTarget.QuickPick, cts.token).then((outline) => {
      if (!outline) {
        return;
      }
      if (cts.token.isCancellationRequested) {
        outline.dispose();
        return;
      }
      disposables.add(outline);
      const viewState = outline.captureViewState();
      disposables.add(toDisposable(() => {
        if (picker.selectedItems.length === 0) {
          viewState.dispose();
        }
      }));
      this.installNavigablePicks(picker, disposables, this.outlineToNavigableEntries(outline));
    }).catch((err) => {
      onUnexpectedError(err);
      picker.hide();
    }).finally(() => {
      picker.busy = false;
    });
    return disposables;
  }
  outlineToNavigableEntries(outline) {
    return outline.config.quickPickDataSource.getQuickPickElements().map((element) => ({
      label: element.label,
      description: element.description,
      ariaLabel: element.ariaLabel,
      iconClasses: element.iconClasses,
      reveal: () => outline.reveal(element.element, {}, false, false),
      preview: () => outline.preview(element.element)
    }));
  }
  installNavigablePicks(picker, disposables, entries) {
    const items = entries.map((entry, index) => {
      return {
        kind: SymbolKind.File,
        index,
        score: 0,
        label: entry.label,
        description: entry.description,
        ariaLabel: entry.ariaLabel,
        iconClasses: entry.iconClasses
      };
    });
    disposables.add(picker.onDidAccept(() => {
      picker.hide();
      const [item] = picker.selectedItems;
      if (item) {
        entries[item.index]?.reveal();
      }
    }));
    const updatePickerItems = () => {
      const filteredItems = items.filter((item) => {
        if (picker.value === "@") {
          item.score = 0;
          item.highlights = void 0;
          return true;
        }
        const trimmedQuery = picker.value.substring(AbstractGotoSymbolQuickAccessProvider.PREFIX.length).trim();
        const parsedLabel = parseLabelWithIcons(item.label);
        const score = fuzzyScore(
          trimmedQuery,
          trimmedQuery.toLowerCase(),
          0,
          parsedLabel.text,
          parsedLabel.text.toLowerCase(),
          0,
          { firstMatchCanBeWeak: true, boostFullMatch: true }
        );
        if (!score) {
          return false;
        }
        item.score = score[1];
        item.highlights = { label: matchesFuzzyIconAware(trimmedQuery, parsedLabel) ?? void 0 };
        return true;
      });
      if (filteredItems.length === 0) {
        const label = localize("empty", "No matching entries");
        picker.items = [{ label, index: -1, kind: SymbolKind.String }];
        picker.ariaLabel = label;
      } else {
        picker.items = filteredItems;
      }
    };
    updatePickerItems();
    disposables.add(picker.onDidChangeValue(updatePickerItems));
    const previewDisposable = new MutableDisposable();
    disposables.add(previewDisposable);
    disposables.add(picker.onDidChangeActive(() => {
      const [item] = picker.activeItems;
      if (item) {
        previewDisposable.value = entries[item.index]?.preview();
      } else {
        previewDisposable.clear();
      }
    }));
  }
};
//#endregion
//#region public methods to use this picker from other pickers
GotoSymbolQuickAccessProvider.SYMBOL_PICKS_TIMEOUT = 8e3;
GotoSymbolQuickAccessProvider = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, IOutlineService),
  __decorateParam(4, IOutlineModelService),
  __decorateParam(5, IChatWidgetService)
], GotoSymbolQuickAccessProvider);
const _GotoSymbolAction = class _GotoSymbolAction extends Action2 {
  constructor() {
    super({
      id: _GotoSymbolAction.ID,
      title: {
        ...localize2("gotoSymbol", "Go to Symbol in Editor..."),
        mnemonicTitle: localize({ key: "miGotoSymbolInEditor", comment: ["&& denotes a mnemonic"] }, "Go to &&Symbol in Editor...")
      },
      f1: true,
      keybinding: {
        when: ContextKeyExpr.and(accessibleViewIsShown.negate(), accessibilityHelpIsShown.negate()),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyO
      },
      menu: [{
        id: MenuId.MenubarGoMenu,
        group: "4_symbol_nav",
        order: 1
      }]
    });
  }
  run(accessor) {
    accessor.get(IQuickInputService).quickAccess.show(GotoSymbolQuickAccessProvider.PREFIX, { itemActivation: ItemActivation.NONE });
  }
};
_GotoSymbolAction.ID = "workbench.action.gotoSymbol";
let GotoSymbolAction = _GotoSymbolAction;
registerAction2(GotoSymbolAction);
Registry.as(QuickaccessExtensions.Quickaccess).registerQuickAccessProvider({
  ctor: GotoSymbolQuickAccessProvider,
  prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
  contextKey: "inFileSymbolsPicker",
  placeholder: localize("gotoSymbolQuickAccessPlaceholder", "Type the name of a symbol to go to."),
  helpEntries: [
    {
      description: localize("gotoSymbolQuickAccess", "Go to Symbol in Editor"),
      prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX,
      commandId: GotoSymbolAction.ID,
      commandCenterOrder: 40
    },
    {
      description: localize("gotoSymbolByCategoryQuickAccess", "Go to Symbol in Editor by Category"),
      prefix: AbstractGotoSymbolQuickAccessProvider.PREFIX_BY_CATEGORY
    }
  ]
});
export {
  GotoSymbolQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXHF1aWNrYWNjZXNzXFxnb3RvU3ltYm9sUXVpY2tBY2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUtleU1vZHMsIElRdWlja1BpY2tTZXBhcmF0b3IsIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0sIEl0ZW1BY3RpdmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVF1aWNrQWNjZXNzUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgUXVpY2thY2Nlc3NFeHRlbnNpb25zLCBJUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyLCBJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9xdWlja0FjY2Vzcy9icm93c2VyL2dvdG9TeW1ib2xRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IHByZXBhcmVRdWVyeSwgSVByZXBhcmVkUXVlcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdXp6eVNjb3Jlci5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudFN5bWJvbCwgU3ltYm9sS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElRdWlja0FjY2Vzc1RleHRFZGl0b3JDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcXVpY2tBY2Nlc3MvYnJvd3Nlci9lZGl0b3JOYXZpZ2F0aW9uUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgSU91dGxpbmUsIElPdXRsaW5lU2VydmljZSwgT3V0bGluZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLmpzJztcbmltcG9ydCB7IGlzQ29tcG9zaXRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2RvY3VtZW50U3ltYm9scy9icm93c2VyL291dGxpbmVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGFjY2Vzc2liaWxpdHlIZWxwSXNTaG93biwgYWNjZXNzaWJsZVZpZXdJc1Nob3duIH0gZnJvbSAnLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgcGFyc2VMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ2hhdE91dGxpbmUsIElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJU3ltYm9sVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgaXNSZXF1ZXN0Vk0gfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcblxuLyoqXG4gKiBBIHNpbmdsZSBuYXZpZ2FibGUgZW50cnkgYmFja2luZyB0aGUgXCJubyB0ZXh0IGVkaXRvclwiIHN5bWJvbCBwaWNrcyAoY2hhdFxuICogb3V0bGluZSBvciBlZGl0b3ItcGFuZSBvdXRsaW5lKS4gUHJvdmlkZXMgdGhlIGxhYmVsIHRvIHJlbmRlciBhbmQgaG93IHRvXG4gKiByZXZlYWwvcHJldmlldyB0aGUgdW5kZXJseWluZyBlbGVtZW50LlxuICovXG5pbnRlcmZhY2UgSU5hdmlnYWJsZVBpY2tFbnRyeSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBhcmlhTGFiZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb25DbGFzc2VzPzogc3RyaW5nW107XG5cdHJldmVhbCgpOiB2b2lkO1xuXHRwcmV2aWV3KCk6IElEaXNwb3NhYmxlO1xufVxuXG5leHBvcnQgY2xhc3MgR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIgZXh0ZW5kcyBBYnN0cmFjdEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgb25EaWRBY3RpdmVUZXh0RWRpdG9yQ29udHJvbENoYW5nZTogRXZlbnQ8dm9pZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJT3V0bGluZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvdXRsaW5lU2VydmljZTogSU91dGxpbmVTZXJ2aWNlLFxuXHRcdEBJT3V0bGluZU1vZGVsU2VydmljZSBvdXRsaW5lTW9kZWxTZXJ2aWNlOiBJT3V0bGluZU1vZGVsU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG91dGxpbmVNb2RlbFNlcnZpY2UsIHtcblx0XHRcdG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uOiAoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb24ub3BlblNpZGVCeVNpZGVEaXJlY3Rpb25cblx0XHR9KTtcblx0XHR0aGlzLm9uRGlkQWN0aXZlVGV4dEVkaXRvckNvbnRyb2xDaGFuZ2UgPSB0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2U7XG5cdH1cblxuXHQvLyNyZWdpb24gRG9jdW1lbnRTeW1ib2xzICh0ZXh0IGVkaXRvciByZXF1aXJlZClcblxuXHRwcml2YXRlIGdldCBjb25maWd1cmF0aW9uKCkge1xuXHRcdGNvbnN0IGVkaXRvckNvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdvcmtiZW5jaEVkaXRvckNvbmZpZ3VyYXRpb24+KCkud29ya2JlbmNoPy5lZGl0b3I7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0b3BlbkVkaXRvclBpbm5lZDogIWVkaXRvckNvbmZpZz8uZW5hYmxlUHJldmlld0Zyb21RdWlja09wZW4gfHwgIWVkaXRvckNvbmZpZz8uZW5hYmxlUHJldmlldyxcblx0XHRcdG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uOiBlZGl0b3JDb25maWc/Lm9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgYWN0aXZlVGV4dEVkaXRvckNvbnRyb2woKSB7XG5cblx0XHQvLyBUT0RPOiB0aGlzIGRpc3RpbmN0aW9uIHNob3VsZCBnbyBhd2F5IGJ5IGFkb3B0aW5nIGBJT3V0bGluZVNlcnZpY2VgXG5cdFx0Ly8gZm9yIGFsbCBlZGl0b3JzIChlaXRoZXIgdGV4dCBiYXNlZCBvbmVzIG9yIG5vdCkuIEN1cnJlbnRseSB0ZXh0IGJhc2VkXG5cdFx0Ly8gZWRpdG9ycyBhcmUgbm90IHlldCB1c2luZyB0aGUgbmV3IG91dGxpbmUgc2VydmljZSBpbmZyYXN0cnVjdHVyZSBidXQgdGhlXG5cdFx0Ly8gXCJjbGFzc2ljYWxcIiBkb2N1bWVudCBzeW1ib2xzIGFwcHJvYWNoLlxuXHRcdGlmIChpc0NvbXBvc2l0ZUVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uZ2V0Q29udHJvbCgpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdvdG9Mb2NhdGlvbihjb250ZXh0OiBJUXVpY2tBY2Nlc3NUZXh0RWRpdG9yQ29udGV4dCwgb3B0aW9uczogeyByYW5nZTogSVJhbmdlOyBrZXlNb2RzOiBJS2V5TW9kczsgZm9yY2VTaWRlQnlTaWRlPzogYm9vbGVhbjsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4gfSk6IHZvaWQge1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIHNpZGVCeVNpZGUgdXNlXG5cdFx0aWYgKChvcHRpb25zLmtleU1vZHMuYWx0IHx8ICh0aGlzLmNvbmZpZ3VyYXRpb24ub3BlbkVkaXRvclBpbm5lZCAmJiBvcHRpb25zLmtleU1vZHMuY3RybENtZCkgfHwgb3B0aW9ucy5mb3JjZVNpZGVCeVNpZGUpICYmIHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IpIHtcblx0XHRcdGNvbnRleHQucmVzdG9yZVZpZXdTdGF0ZT8uKCk7IC8vIHNpbmNlIHdlIG9wZW4gdG8gdGhlIHNpZGUsIHJlc3RvcmUgdmlldyBzdGF0ZSBpbiB0aGlzIGVkaXRvclxuXG5cdFx0XHRjb25zdCBlZGl0b3JPcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRcdHNlbGVjdGlvbjogb3B0aW9ucy5yYW5nZSxcblx0XHRcdFx0cGlubmVkOiBvcHRpb25zLmtleU1vZHMuY3RybENtZCB8fCB0aGlzLmNvbmZpZ3VyYXRpb24ub3BlbkVkaXRvclBpbm5lZCxcblx0XHRcdFx0cHJlc2VydmVGb2N1czogb3B0aW9ucy5wcmVzZXJ2ZUZvY3VzXG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCBlZGl0b3JPcHRpb25zLCBTSURFX0dST1VQKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgbGV0IHBhcmVudCBoYW5kbGUgaXRcblx0XHRlbHNlIHtcblx0XHRcdHN1cGVyLmdvdG9Mb2NhdGlvbihjb250ZXh0LCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gcHVibGljIG1ldGhvZHMgdG8gdXNlIHRoaXMgcGlja2VyIGZyb20gb3RoZXIgcGlja2Vyc1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNZTUJPTF9QSUNLU19USU1FT1VUID0gODAwMDtcblxuXHRhc3luYyBnZXRTeW1ib2xQaWNrcyhtb2RlbDogSVRleHRNb2RlbCwgZmlsdGVyOiBzdHJpbmcsIG9wdGlvbnM6IHsgZXh0cmFDb250YWluZXJMYWJlbD86IHN0cmluZyB9LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFycmF5PElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3I+PiB7XG5cblx0XHQvLyBJZiB0aGUgcmVnaXN0cnkgZG9lcyBub3Qga25vdyB0aGUgbW9kZWwsIHdlIHdhaXQgZm9yIGFzIGxvbmcgYXNcblx0XHQvLyB0aGUgcmVnaXN0cnkga25vd3MgaXQuIFRoaXMgaGVscHMgaW4gY2FzZXMgd2hlcmUgYSBsYW5ndWFnZVxuXHRcdC8vIHJlZ2lzdHJ5IHdhcyBub3QgYWN0aXZhdGVkIHlldCBmb3IgcHJvdmlkaW5nIGFueSBzeW1ib2xzLlxuXHRcdC8vIFRvIG5vdCB3YWl0IGZvcmV2ZXIsIHdlIGV2ZW50dWFsbHkgdGltZW91dCB0aG91Z2guXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdHRoaXMud2FpdEZvckxhbmd1YWdlU3ltYm9sUmVnaXN0cnkobW9kZWwsIGRpc3Bvc2FibGVzKSxcblx0XHRcdHRpbWVvdXQoR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIuU1lNQk9MX1BJQ0tTX1RJTUVPVVQpXG5cdFx0XSk7XG5cblx0XHRpZiAoIXJlc3VsdCB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvR2V0U3ltYm9sUGlja3ModGhpcy5nZXREb2N1bWVudFN5bWJvbHMobW9kZWwsIHRva2VuKSwgcHJlcGFyZVF1ZXJ5KGZpbHRlciksIG9wdGlvbnMsIHRva2VuLCBtb2RlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZG9HZXRTeW1ib2xQaWNrcyhzeW1ib2xzUHJvbWlzZTogUHJvbWlzZTxEb2N1bWVudFN5bWJvbFtdPiwgcXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCBvcHRpb25zOiB7IGV4dHJhQ29udGFpbmVyTGFiZWw/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBtb2RlbDogSVRleHRNb2RlbCk6IFByb21pc2U8QXJyYXk8SUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4+IHtcblx0XHRjb25zdCBwaWNrcyA9IGF3YWl0IHN1cGVyLmRvR2V0U3ltYm9sUGlja3Moc3ltYm9sc1Byb21pc2UsIHF1ZXJ5LCBvcHRpb25zLCB0b2tlbiwgbW9kZWwpO1xuXHRcdGNvbnN0IG1vZGVsVXJpID0gbW9kZWwudXJpO1xuXHRcdGZvciAoY29uc3QgcGljayBvZiBwaWNrcykge1xuXHRcdFx0Y29uc3Qgc3ltYm9sUGljayA9IHBpY2sgYXMgSUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtO1xuXHRcdFx0aWYgKHN5bWJvbFBpY2sucmFuZ2UgJiYgIXN5bWJvbFBpY2suYXR0YWNoKSB7XG5cdFx0XHRcdHN5bWJvbFBpY2suYXR0YWNoID0gKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0XHRcdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZW50cnk6IElTeW1ib2xWYXJpYWJsZUVudHJ5ID0ge1xuXHRcdFx0XHRcdFx0a2luZDogJ3N5bWJvbCcsXG5cdFx0XHRcdFx0XHRpZDogSlNPTi5zdHJpbmdpZnkoeyB1cmk6IG1vZGVsVXJpLnRvU3RyaW5nKCksIHJhbmdlOiBzeW1ib2xQaWNrLnJhbmdlIS5kZWNvcmF0aW9uIH0pLFxuXHRcdFx0XHRcdFx0bmFtZTogc3ltYm9sUGljay5zeW1ib2xOYW1lID8/IHN5bWJvbFBpY2subGFiZWwsXG5cdFx0XHRcdFx0XHR2YWx1ZTogeyB1cmk6IG1vZGVsVXJpLCByYW5nZTogc3ltYm9sUGljay5yYW5nZSEuZGVjb3JhdGlvbiB9LFxuXHRcdFx0XHRcdFx0c3ltYm9sS2luZDogc3ltYm9sUGljay5raW5kLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KGVudHJ5KTtcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHBpY2tzO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgcHJvdmlkZShwaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBydW5PcHRpb25zPzogSVF1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zKTogSURpc3Bvc2FibGUge1xuXHRcdC8vIEEgZm9jdXNlZCBjaGF0IGlzIHRoZSBuYXZpZ2FibGUgcmVzb3VyY2UsIGV2ZW4gd2hlbiBhIHJlZ3VsYXIgZmlsZVxuXHRcdC8vIGVkaXRvciBpcyBhbHNvIG9wZW4gc2lkZSBieSBzaWRlLiBUaGUgYmFzZSBgcHJvdmlkZSgpYCB3b3VsZCBvdGhlcndpc2Vcblx0XHQvLyByb3V0ZSB0byB0aGUgYWN0aXZlIHRleHQgZWRpdG9yJ3Mgc3ltYm9scyB3aGVuZXZlciBvbmUgZXhpc3RzLCBzbyB0aGVcblx0XHQvLyBjaGF0IGNhc2UgbXVzdCBiZSBoYW5kbGVkIGhlcmUgYmVmb3JlIHRoYXQgZGVjaXNpb24gaXMgbWFkZS5cblx0XHRjb25zdCBjaGF0V2lkZ2V0ID0gdGhpcy5nZXRBY3RpdmVDaGF0V2lkZ2V0KCk7XG5cdFx0aWYgKGNoYXRXaWRnZXQpIHtcblx0XHRcdHBpY2tlci5jYW5BY2NlcHRJbkJhY2tncm91bmQgPSAhIXRoaXMub3B0aW9ucz8uY2FuQWNjZXB0SW5CYWNrZ3JvdW5kO1xuXHRcdFx0cGlja2VyLm1hdGNoT25MYWJlbCA9IHBpY2tlci5tYXRjaE9uRGVzY3JpcHRpb24gPSBwaWNrZXIubWF0Y2hPbkRldGFpbCA9IHBpY2tlci5zb3J0QnlMYWJlbCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9HZXRDaGF0V2lkZ2V0UGlja3MocGlja2VyIGFzIElRdWlja1BpY2s8SUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4sIGNoYXRXaWRnZXQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5wcm92aWRlKHBpY2tlciwgdG9rZW4sIHJ1bk9wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHByb3ZpZGVXaXRob3V0VGV4dEVkaXRvcihwaWNrZXI6IElRdWlja1BpY2s8SUdvdG9TeW1ib2xRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuY2FuUGlja1dpdGhPdXRsaW5lU2VydmljZSgpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0dldE91dGxpbmVQaWNrcyhwaWNrZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5wcm92aWRlV2l0aG91dFRleHRFZGl0b3IocGlja2VyKTtcblx0fVxuXG5cdHByaXZhdGUgY2FuUGlja1dpdGhPdXRsaW5lU2VydmljZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUgPyB0aGlzLm91dGxpbmVTZXJ2aWNlLmNhbkNyZWF0ZU91dGxpbmUodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpIDogZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGl2ZUNoYXRXaWRnZXQoKTogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRyZWF0IHRoZSBjaGF0IGFzIHRoZSBuYXZpZ2FibGUgcmVzb3VyY2Ugb25seSB3aGVuIGl0IGFjdHVhbGx5IGhhcyBET01cblx0XHQvLyBmb2N1cy4gVGhpcyBpcyBjaGVja2VkIGJlZm9yZSB0aGUgcXVpY2sgaW5wdXQgc3RlYWxzIGZvY3VzICh0aGUgcGlja2VyXG5cdFx0Ly8gaXMgc2hvd24gYWZ0ZXIgYHByb3ZpZGUoKWAgcnVucyksIHdvcmtzIGFjcm9zcyB3aW5kb3dzIHZpYSB0aGUgZm9jdXNlZFxuXHRcdC8vIGRvY3VtZW50LCBhbmQgYXZvaWRzIGhpamFja2luZyBHbyB0byBTeW1ib2wgd2hlbiBhIG5vbi1jaGF0IHN1cmZhY2UgaXNcblx0XHQvLyBmb2N1c2VkLiBPbmx5IG9mZmVyIHRoZSBjaGF0IHdoZW4gaXQgaGFzIHJlcXVlc3RzIHRvIG5hdmlnYXRlIHRvLlxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKCF3aWRnZXQgfHwgIWlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQod2lkZ2V0LmRvbU5vZGUpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gd2lkZ2V0LnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5zb21lKGlzUmVxdWVzdFZNKSA/IHdpZGdldCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZG9HZXRDaGF0V2lkZ2V0UGlja3MocGlja2VyOiBJUXVpY2tQaWNrPElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB3aWRnZXQ6IElDaGF0V2lkZ2V0KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG91dGxpbmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYXRPdXRsaW5lKHdpZGdldCwgT3V0bGluZVRhcmdldC5RdWlja1BpY2spKTtcblx0XHR0aGlzLmluc3RhbGxOYXZpZ2FibGVQaWNrcyhwaWNrZXIsIGRpc3Bvc2FibGVzLCB0aGlzLm91dGxpbmVUb05hdmlnYWJsZUVudHJpZXMob3V0bGluZSkpO1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgZG9HZXRPdXRsaW5lUGlja3MocGlja2VyOiBJUXVpY2tQaWNrPElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHBhbmUgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoIXBhbmUpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXG5cdFx0cGlja2VyLmJ1c3kgPSB0cnVlO1xuXG5cdFx0dGhpcy5vdXRsaW5lU2VydmljZS5jcmVhdGVPdXRsaW5lKHBhbmUsIE91dGxpbmVUYXJnZXQuUXVpY2tQaWNrLCBjdHMudG9rZW4pLnRoZW4ob3V0bGluZSA9PiB7XG5cblx0XHRcdGlmICghb3V0bGluZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdG91dGxpbmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChvdXRsaW5lKTtcblxuXHRcdFx0Y29uc3Qgdmlld1N0YXRlID0gb3V0bGluZS5jYXB0dXJlVmlld1N0YXRlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0aWYgKHBpY2tlci5zZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHZpZXdTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5pbnN0YWxsTmF2aWdhYmxlUGlja3MocGlja2VyLCBkaXNwb3NhYmxlcywgdGhpcy5vdXRsaW5lVG9OYXZpZ2FibGVFbnRyaWVzKG91dGxpbmUpKTtcblxuXHRcdH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHBpY2tlci5idXN5ID0gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIG91dGxpbmVUb05hdmlnYWJsZUVudHJpZXM8RT4ob3V0bGluZTogSU91dGxpbmU8RT4pOiBJTmF2aWdhYmxlUGlja0VudHJ5W10ge1xuXHRcdHJldHVybiBvdXRsaW5lLmNvbmZpZy5xdWlja1BpY2tEYXRhU291cmNlLmdldFF1aWNrUGlja0VsZW1lbnRzKCkubWFwKGVsZW1lbnQgPT4gKHtcblx0XHRcdGxhYmVsOiBlbGVtZW50LmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IGVsZW1lbnQuZGVzY3JpcHRpb24sXG5cdFx0XHRhcmlhTGFiZWw6IGVsZW1lbnQuYXJpYUxhYmVsLFxuXHRcdFx0aWNvbkNsYXNzZXM6IGVsZW1lbnQuaWNvbkNsYXNzZXMsXG5cdFx0XHRyZXZlYWw6ICgpID0+IG91dGxpbmUucmV2ZWFsKGVsZW1lbnQuZWxlbWVudCwge30sIGZhbHNlLCBmYWxzZSksXG5cdFx0XHRwcmV2aWV3OiAoKSA9PiBvdXRsaW5lLnByZXZpZXcoZWxlbWVudC5lbGVtZW50KVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgaW5zdGFsbE5hdmlnYWJsZVBpY2tzKHBpY2tlcjogSVF1aWNrUGljazxJR290b1N5bWJvbFF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgZW50cmllczogcmVhZG9ubHkgSU5hdmlnYWJsZVBpY2tFbnRyeVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbXM6IElHb3RvU3ltYm9sUXVpY2tQaWNrSXRlbVtdID0gZW50cmllcy5tYXAoKGVudHJ5LCBpbmRleCkgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogU3ltYm9sS2luZC5GaWxlLFxuXHRcdFx0XHRpbmRleCxcblx0XHRcdFx0c2NvcmU6IDAsXG5cdFx0XHRcdGxhYmVsOiBlbnRyeS5sYWJlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGVudHJ5LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGVudHJ5LmFyaWFMYWJlbCxcblx0XHRcdFx0aWNvbkNsYXNzZXM6IGVudHJ5Lmljb25DbGFzc2VzXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRwaWNrZXIuaGlkZSgpO1xuXHRcdFx0Y29uc3QgW2l0ZW1dID0gcGlja2VyLnNlbGVjdGVkSXRlbXM7XG5cdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRlbnRyaWVzW2l0ZW0uaW5kZXhdPy5yZXZlYWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVQaWNrZXJJdGVtcyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbHRlcmVkSXRlbXMgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiB7XG5cdFx0XHRcdGlmIChwaWNrZXIudmFsdWUgPT09ICdAJykge1xuXHRcdFx0XHRcdC8vIGRlZmF1bHQsIG5vIGZpbHRlcmluZywgc2NvcmluZy4uLlxuXHRcdFx0XHRcdGl0ZW0uc2NvcmUgPSAwO1xuXHRcdFx0XHRcdGl0ZW0uaGlnaGxpZ2h0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRyaW1tZWRRdWVyeSA9IHBpY2tlci52YWx1ZS5zdWJzdHJpbmcoQWJzdHJhY3RHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVgubGVuZ3RoKS50cmltKCk7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZExhYmVsID0gcGFyc2VMYWJlbFdpdGhJY29ucyhpdGVtLmxhYmVsKTtcblx0XHRcdFx0Y29uc3Qgc2NvcmUgPSBmdXp6eVNjb3JlKHRyaW1tZWRRdWVyeSwgdHJpbW1lZFF1ZXJ5LnRvTG93ZXJDYXNlKCksIDAsXG5cdFx0XHRcdFx0cGFyc2VkTGFiZWwudGV4dCwgcGFyc2VkTGFiZWwudGV4dC50b0xvd2VyQ2FzZSgpLCAwLFxuXHRcdFx0XHRcdHsgZmlyc3RNYXRjaENhbkJlV2VhazogdHJ1ZSwgYm9vc3RGdWxsTWF0Y2g6IHRydWUgfSk7XG5cblx0XHRcdFx0aWYgKCFzY29yZSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGl0ZW0uc2NvcmUgPSBzY29yZVsxXTtcblx0XHRcdFx0aXRlbS5oaWdobGlnaHRzID0geyBsYWJlbDogbWF0Y2hlc0Z1enp5SWNvbkF3YXJlKHRyaW1tZWRRdWVyeSwgcGFyc2VkTGFiZWwpID8/IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoZmlsdGVyZWRJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBsb2NhbGl6ZSgnZW1wdHknLCAnTm8gbWF0Y2hpbmcgZW50cmllcycpO1xuXHRcdFx0XHRwaWNrZXIuaXRlbXMgPSBbeyBsYWJlbCwgaW5kZXg6IC0xLCBraW5kOiBTeW1ib2xLaW5kLlN0cmluZyB9XTtcblx0XHRcdFx0cGlja2VyLmFyaWFMYWJlbCA9IGxhYmVsO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGlja2VyLml0ZW1zID0gZmlsdGVyZWRJdGVtcztcblx0XHRcdH1cblx0XHR9O1xuXHRcdHVwZGF0ZVBpY2tlckl0ZW1zKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZENoYW5nZVZhbHVlKHVwZGF0ZVBpY2tlckl0ZW1zKSk7XG5cblx0XHRjb25zdCBwcmV2aWV3RGlzcG9zYWJsZSA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcmV2aWV3RGlzcG9zYWJsZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQ2hhbmdlQWN0aXZlKCgpID0+IHtcblx0XHRcdGNvbnN0IFtpdGVtXSA9IHBpY2tlci5hY3RpdmVJdGVtcztcblx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdHByZXZpZXdEaXNwb3NhYmxlLnZhbHVlID0gZW50cmllc1tpdGVtLmluZGV4XT8ucHJldmlldygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cHJldmlld0Rpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cblxuY2xhc3MgR290b1N5bWJvbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmdvdG9TeW1ib2wnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBHb3RvU3ltYm9sQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0Li4ubG9jYWxpemUyKCdnb3RvU3ltYm9sJywgXCJHbyB0byBTeW1ib2wgaW4gRWRpdG9yLi4uXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pR290b1N5bWJvbEluRWRpdG9yJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdvIHRvICYmU3ltYm9sIGluIEVkaXRvci4uLlwiKSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGFjY2Vzc2libGVWaWV3SXNTaG93bi5uZWdhdGUoKSwgYWNjZXNzaWJpbGl0eUhlbHBJc1Nob3duLm5lZ2F0ZSgpKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlPXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyR29NZW51LFxuXHRcdFx0XHRncm91cDogJzRfc3ltYm9sX25hdicsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSkucXVpY2tBY2Nlc3Muc2hvdyhHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVgsIHsgaXRlbUFjdGl2YXRpb246IEl0ZW1BY3RpdmF0aW9uLk5PTkUgfSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKEdvdG9TeW1ib2xBY3Rpb24pO1xuXG5SZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oUXVpY2thY2Nlc3NFeHRlbnNpb25zLlF1aWNrYWNjZXNzKS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoe1xuXHRjdG9yOiBHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlcixcblx0cHJlZml4OiBBYnN0cmFjdEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCxcblx0Y29udGV4dEtleTogJ2luRmlsZVN5bWJvbHNQaWNrZXInLFxuXHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2dvdG9TeW1ib2xRdWlja0FjY2Vzc1BsYWNlaG9sZGVyJywgXCJUeXBlIHRoZSBuYW1lIG9mIGEgc3ltYm9sIHRvIGdvIHRvLlwiKSxcblx0aGVscEVudHJpZXM6IFtcblx0XHR7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dvdG9TeW1ib2xRdWlja0FjY2VzcycsIFwiR28gdG8gU3ltYm9sIGluIEVkaXRvclwiKSxcblx0XHRcdHByZWZpeDogQWJzdHJhY3RHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVgsXG5cdFx0XHRjb21tYW5kSWQ6IEdvdG9TeW1ib2xBY3Rpb24uSUQsXG5cdFx0XHRjb21tYW5kQ2VudGVyT3JkZXI6IDQwXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dvdG9TeW1ib2xCeUNhdGVnb3J5UXVpY2tBY2Nlc3MnLCBcIkdvIHRvIFN5bWJvbCBpbiBFZGl0b3IgYnkgQ2F0ZWdvcnlcIiksXG5cdFx0XHRwcmVmaXg6IEFic3RyYWN0R290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYX0JZX0NBVEVHT1JZXG5cdFx0fVxuXHRdXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUF3QyxvQkFBZ0Qsc0JBQXNCO0FBQzlHLFNBQVMsZ0JBQWdCLGtCQUFrQjtBQUUzQyxTQUFTLGdCQUFnQjtBQUN6QixTQUErQixjQUFjLDZCQUE2RDtBQUMxRyxTQUFTLDZDQUF1RTtBQUNoRixTQUFTLDZCQUE2QjtBQUd0QyxTQUFTLGlCQUE4QixjQUFjLFlBQVkseUJBQXlCO0FBQzFGLFNBQVMsZUFBZTtBQUN4QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxpQkFBaUIsU0FBUyxjQUFjO0FBQ2pELFNBQVMsUUFBUSxlQUFlO0FBQ2hDLFNBQVMsb0JBQW9DO0FBQzdDLFNBQXlCLGtCQUFrQjtBQUMzQyxTQUFT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
