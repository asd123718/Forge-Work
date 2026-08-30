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
import { $, append } from "../../../../../base/browser/dom.js";
import { DEFAULT_FONT_FAMILY } from "../../../../../base/browser/fonts.js";
import { Widget } from "../../../../../base/browser/ui/widget.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { HistoryNavigator } from "../../../../../base/common/history.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { mixin } from "../../../../../base/common/objects.js";
import { isMacintosh } from "../../../../../base/common/platform.js";
import { URI as uri } from "../../../../../base/common/uri.js";
import "./suggestEnabledInput.css";
import { EditorExtensionsRegistry } from "../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditOperation } from "../../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ensureValidWordDefinition, getWordAtText } from "../../../../../editor/common/core/wordHelper.js";
import * as languages from "../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ContextMenuController } from "../../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import { SnippetController2 } from "../../../../../editor/contrib/snippet/browser/snippetController2.js";
import { SuggestController } from "../../../../../editor/contrib/suggest/browser/suggestController.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { registerAndCreateHistoryNavigationContext } from "../../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { asCssVariable, asCssVariableWithDefault, inputBackground, inputBorder, inputForeground, inputPlaceholderForeground } from "../../../../../platform/theme/common/colorRegistry.js";
import { MenuPreventer } from "../menuPreventer.js";
import { SelectionClipboardContributionID } from "../selectionClipboard.js";
import { getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from "../simpleEditorOptions.js";
let SuggestEnabledInput = class extends Widget {
  constructor(id, parent, suggestionProvider, ariaLabel, resourceHandle, options, defaultInstantiationService, modelService, contextKeyService, languageFeaturesService, configurationService) {
    super();
    this._onShouldFocusResults = this._register(new Emitter());
    this.onShouldFocusResults = this._onShouldFocusResults.event;
    this._onInputDidChange = this._register(new Emitter());
    this.onInputDidChange = this._onInputDidChange.event;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this.stylingContainer = append(parent, $(".suggest-input-container"));
    this.element = parent;
    this.placeholderText = append(this.stylingContainer, $(".suggest-input-placeholder", void 0, options.placeholderText || ""));
    const editorOptions = mixin(
      getSimpleEditorOptions(configurationService),
      getSuggestEnabledInputOptions(ariaLabel)
    );
    editorOptions.overflowWidgetsDomNode = options.overflowWidgetsDomNode;
    const scopedContextKeyService = this.getScopedContextKeyService(contextKeyService);
    const instantiationService = scopedContextKeyService ? this._register(defaultInstantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))) : defaultInstantiationService;
    this.inputWidget = this._register(instantiationService.createInstance(
      CodeEditorWidget,
      this.stylingContainer,
      editorOptions,
      {
        contributions: EditorExtensionsRegistry.getSomeEditorContributions([
          SuggestController.ID,
          SnippetController2.ID,
          ContextMenuController.ID,
          MenuPreventer.ID,
          SelectionClipboardContributionID
        ]),
        isSimpleWidget: true
      }
    ));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.accessibilitySupport") || e.affectsConfiguration("editor.cursorBlinking")) {
        const accessibilitySupport = configurationService.getValue("editor.accessibilitySupport");
        const cursorBlinking = configurationService.getValue("editor.cursorBlinking");
        this.inputWidget.updateOptions({
          accessibilitySupport,
          cursorBlinking
        });
      }
    }));
    this._register(this.inputWidget.onDidFocusEditorText(() => this._onDidFocus.fire()));
    this._register(this.inputWidget.onDidBlurEditorText(() => this._onDidBlur.fire()));
    const scopeHandle = uri.parse(resourceHandle);
    this.inputModel = modelService.createModel("", null, scopeHandle, true);
    this._register(this.inputModel);
    this.inputWidget.setModel(this.inputModel);
    this._register(this.inputWidget.onDidPaste(() => this.setValue(this.getValue())));
    this._register(this.inputWidget.onDidFocusEditorText(() => {
      if (options.focusContextKey) {
        options.focusContextKey.set(true);
      }
      this.stylingContainer.classList.add("synthetic-focus");
    }));
    this._register(this.inputWidget.onDidBlurEditorText(() => {
      if (options.focusContextKey) {
        options.focusContextKey.set(false);
      }
      this.stylingContainer.classList.remove("synthetic-focus");
    }));
    this._register(Event.chain(this.inputWidget.onKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Enter))((e) => {
      e.preventDefault();
    }, this));
    this._register(Event.chain(this.inputWidget.onKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.DownArrow && (isMacintosh ? e.metaKey : e.ctrlKey)))(() => this._onShouldFocusResults.fire(), this));
    let preexistingContent = this.getValue();
    const inputWidgetModel = this.inputWidget.getModel();
    if (inputWidgetModel) {
      this._register(inputWidgetModel.onDidChangeContent(() => {
        const content = this.getValue();
        this.placeholderText.style.visibility = content ? "hidden" : "visible";
        if (preexistingContent.trim() === content.trim()) {
          return;
        }
        this._onInputDidChange.fire(void 0);
        preexistingContent = content;
      }));
    }
    const validatedSuggestProvider = {
      provideResults: suggestionProvider.provideResults,
      sortKey: suggestionProvider.sortKey || ((a) => a),
      triggerCharacters: suggestionProvider.triggerCharacters || [],
      wordDefinition: suggestionProvider.wordDefinition ? ensureValidWordDefinition(suggestionProvider.wordDefinition) : void 0,
      alwaysShowSuggestions: !!suggestionProvider.alwaysShowSuggestions
    };
    this.setValue(options.value || "");
    this._register(languageFeaturesService.completionProvider.register({ scheme: scopeHandle.scheme, pattern: "**/" + scopeHandle.path, hasAccessToAllModels: true }, {
      _debugDisplayName: `suggestEnabledInput/${id}`,
      triggerCharacters: validatedSuggestProvider.triggerCharacters,
      provideCompletionItems: (model, position, _context) => {
        const query = model.getValue();
        const zeroIndexedColumn = position.column - 1;
        let alreadyTypedCount = 0, zeroIndexedWordStart = 0;
        if (validatedSuggestProvider.wordDefinition) {
          const wordAtText = getWordAtText(position.column, validatedSuggestProvider.wordDefinition, query, 0);
          alreadyTypedCount = wordAtText?.word.length ?? 0;
          zeroIndexedWordStart = wordAtText ? wordAtText.startColumn - 1 : 0;
        } else {
          zeroIndexedWordStart = query.lastIndexOf(" ", zeroIndexedColumn - 1) + 1;
          alreadyTypedCount = zeroIndexedColumn - zeroIndexedWordStart;
        }
        if (!validatedSuggestProvider.alwaysShowSuggestions && alreadyTypedCount > 0 && validatedSuggestProvider.triggerCharacters?.indexOf(query[zeroIndexedWordStart]) === -1) {
          return { suggestions: [] };
        }
        return {
          suggestions: suggestionProvider.provideResults(query).map((result) => {
            let label;
            let rest;
            if (typeof result === "string") {
              label = result;
            } else {
              label = result.label;
              rest = result;
            }
            return {
              label,
              insertText: label,
              range: Range.fromPositions(position.delta(0, -alreadyTypedCount), position),
              sortText: validatedSuggestProvider.sortKey(label),
              kind: languages.CompletionItemKind.Keyword,
              ...rest
            };
          })
        };
      }
    }));
    this.style(options.styleOverrides || {});
  }
  getScopedContextKeyService(_contextKeyService) {
    return void 0;
  }
  updateAriaLabel(label) {
    this.inputWidget.updateOptions({ ariaLabel: label });
  }
  setPlaceHolder(placeholder) {
    this.placeholderText.textContent = placeholder;
  }
  setValue(val) {
    val = val.replace(/\s/g, " ");
    const fullRange = this.inputModel.getFullModelRange();
    this.inputWidget.executeEdits("suggestEnabledInput.setValue", [EditOperation.replace(fullRange, val)]);
    this.inputWidget.setScrollTop(0);
    this.inputWidget.setPosition(new Position(1, val.length + 1));
  }
  getValue() {
    return this.inputWidget.getValue();
  }
  style(styleOverrides) {
    this.stylingContainer.style.backgroundColor = asCssVariable(styleOverrides.inputBackground ?? inputBackground);
    this.stylingContainer.style.color = asCssVariable(styleOverrides.inputForeground ?? inputForeground);
    this.placeholderText.style.color = asCssVariable(styleOverrides.inputPlaceholderForeground ?? inputPlaceholderForeground);
    this.stylingContainer.style.borderWidth = "1px";
    this.stylingContainer.style.borderStyle = "solid";
    this.stylingContainer.style.borderColor = asCssVariableWithDefault(styleOverrides.inputBorder ?? inputBorder, "transparent");
    const cursor = this.stylingContainer.getElementsByClassName("cursor")[0];
    if (cursor) {
      cursor.style.backgroundColor = asCssVariable(styleOverrides.inputForeground ?? inputForeground);
    }
  }
  focus(selectAll) {
    this.inputWidget.focus();
    if (selectAll && this.inputWidget.getValue()) {
      this.selectAll();
    }
  }
  onHide() {
    this.inputWidget.onHide();
  }
  layout(dimension) {
    this.inputWidget.layout(dimension);
    this.placeholderText.style.width = `${dimension.width - 2}px`;
  }
  selectAll() {
    this.inputWidget.setSelection(new Range(1, 1, 1, this.getValue().length + 1));
  }
};
SuggestEnabledInput = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IModelService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, ILanguageFeaturesService),
  __decorateParam(10, IConfigurationService)
], SuggestEnabledInput);
let SuggestEnabledInputWithHistory = class extends SuggestEnabledInput {
  constructor({ id, parent, ariaLabel, suggestionProvider, resourceHandle, suggestOptions, history }, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService) {
    super(id, parent, suggestionProvider, ariaLabel, resourceHandle, suggestOptions, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService);
    this.history = this._register(new HistoryNavigator(new Set(history), 100));
  }
  addToHistory() {
    const value = this.getValue();
    if (value && value !== this.getCurrentValue()) {
      this.history.add(value);
    }
  }
  getHistory() {
    return this.history.getHistory();
  }
  /**
   * Whether the input is currently showing a value from the history (as opposed to a freshly
   * typed query). While navigating, {@link showNextValue} advances toward more recent entries and,
   * once past the most recent one, clears the input back to an empty value.
   */
  isNavigatingHistory() {
    return !this.history.isNowhere();
  }
  showNextValue() {
    if (!this.history.has(this.getValue())) {
      this.addToHistory();
    }
    let next = this.getNextValue();
    if (next) {
      next = next === this.getValue() ? this.getNextValue() : next;
    }
    this.setValue(next ?? "");
  }
  showPreviousValue() {
    if (!this.history.has(this.getValue())) {
      this.addToHistory();
    }
    let previous = this.getPreviousValue();
    if (previous) {
      previous = previous === this.getValue() ? this.getPreviousValue() : previous;
    }
    if (previous) {
      this.setValue(previous);
      this.inputWidget.setPosition({ lineNumber: 0, column: 0 });
    }
  }
  clearHistory() {
    this.history.clear();
  }
  getCurrentValue() {
    let currentValue = this.history.current();
    if (!currentValue) {
      currentValue = this.history.last();
      this.history.next();
    }
    return currentValue;
  }
  getPreviousValue() {
    return this.history.previous() || this.history.first();
  }
  getNextValue() {
    return this.history.next();
  }
};
SuggestEnabledInputWithHistory = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IModelService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IConfigurationService)
], SuggestEnabledInputWithHistory);
let ContextScopedSuggestEnabledInputWithHistory = class extends SuggestEnabledInputWithHistory {
  constructor(options, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService) {
    super(options, instantiationService, modelService, contextKeyService, languageFeaturesService, configurationService);
    const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this.historyContext;
    this._register(this.inputWidget.onDidChangeCursorPosition(({ position }) => {
      const viewModel = this.inputWidget._getViewModel();
      const lastLineNumber = viewModel.getLineCount();
      const lastLineCol = viewModel.getLineLength(lastLineNumber) + 1;
      const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(position);
      historyNavigationBackwardsEnablement.set(viewPosition.lineNumber === 1 && viewPosition.column === 1);
      historyNavigationForwardsEnablement.set(viewPosition.lineNumber === lastLineNumber && viewPosition.column === lastLineCol);
    }));
  }
  getScopedContextKeyService(contextKeyService) {
    const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
    this.historyContext = this._register(registerAndCreateHistoryNavigationContext(
      scopedContextKeyService,
      this
    ));
    return scopedContextKeyService;
  }
};
ContextScopedSuggestEnabledInputWithHistory = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IModelService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IConfigurationService)
], ContextScopedSuggestEnabledInputWithHistory);
setupSimpleEditorSelectionStyling(".suggest-input-container");
function getSuggestEnabledInputOptions(ariaLabel) {
  return {
    fontSize: 13,
    lineHeight: 20,
    wordWrap: "off",
    scrollbar: { vertical: "hidden" },
    roundedSelection: false,
    guides: {
      indentation: false
    },
    cursorWidth: 1,
    fontFamily: DEFAULT_FONT_FAMILY,
    ariaLabel: ariaLabel || "",
    snippetSuggestions: "none",
    suggest: { filterGraceful: false, showIcons: false },
    autoClosingBrackets: "never"
  };
}
export {
  ContextScopedSuggestEnabledInputWithHistory,
  SuggestEnabledInput,
  SuggestEnabledInputWithHistory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXHN1Z2dlc3RFbmFibGVkSW5wdXRcXHN1Z2dlc3RFbmFibGVkSW5wdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBEaW1lbnNpb24sIGFwcGVuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgREVGQVVMVF9GT05UX0ZBTUlMWSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb250cy5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvd2lkZ2V0LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSGlzdG9yeU5hdmlnYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IG1peGluIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSBhcyB1cmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICcuL3N1Z2dlc3RFbmFibGVkSW5wdXQuY3NzJztcbmltcG9ydCB7IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGVuc3VyZVZhbGlkV29yZERlZmluaXRpb24sIGdldFdvcmRBdFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IENvbnRleHRNZW51Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvbnRleHRtZW51L2Jyb3dzZXIvY29udGV4dG1lbnUuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRDb250cm9sbGVyMi5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHQsIHJlZ2lzdGVyQW5kQ3JlYXRlSGlzdG9yeU5hdmlnYXRpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaGlzdG9yeS9icm93c2VyL2NvbnRleHRTY29wZWRIaXN0b3J5V2lkZ2V0LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvcklkZW50aWZpZXIsIGFzQ3NzVmFyaWFibGUsIGFzQ3NzVmFyaWFibGVXaXRoRGVmYXVsdCwgaW5wdXRCYWNrZ3JvdW5kLCBpbnB1dEJvcmRlciwgaW5wdXRGb3JlZ3JvdW5kLCBpbnB1dFBsYWNlaG9sZGVyRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE1lbnVQcmV2ZW50ZXIgfSBmcm9tICcuLi9tZW51UHJldmVudGVyLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklEIH0gZnJvbSAnLi4vc2VsZWN0aW9uQ2xpcGJvYXJkLmpzJztcbmltcG9ydCB7IGdldFNpbXBsZUVkaXRvck9wdGlvbnMsIHNldHVwU2ltcGxlRWRpdG9yU2VsZWN0aW9uU3R5bGluZyB9IGZyb20gJy4uL3NpbXBsZUVkaXRvck9wdGlvbnMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN1Z2dlc3RSZXN1bHRzUHJvdmlkZXIge1xuXHQvKipcblx0ICogUHJvdmlkZXIgZnVuY3Rpb24gZm9yIHN1Z2dlc3Rpb24gcmVzdWx0cy5cblx0ICpcblx0ICogQHBhcmFtIHF1ZXJ5IHRoZSBmdWxsIHRleHQgb2YgdGhlIGlucHV0LlxuXHQgKi9cblx0cHJvdmlkZVJlc3VsdHM6IChxdWVyeTogc3RyaW5nKSA9PiAoUGFydGlhbDxsYW5ndWFnZXMuQ29tcGxldGlvbkl0ZW0+ICYgKHsgbGFiZWw6IHN0cmluZyB9KSB8IHN0cmluZylbXTtcblxuXHQvKipcblx0ICogVHJpZ2dlciBjaGFyYWN0ZXJzIGZvciB0aGlzIGlucHV0LiBTdWdnZXN0aW9ucyB3aWxsIGFwcGVhciB3aGVuIG9uZSBvZiB0aGVzZSBpcyB0eXBlZCxcblx0ICogb3IgdXBvbiBgY3RybCtzcGFjZWAgdHJpZ2dlcmluZyBhdCBhIHdvcmQgYm91bmRhcnkuXG5cdCAqXG5cdCAqIERlZmF1bHRzIHRvIHRoZSBlbXB0eSBhcnJheS5cblx0ICovXG5cdHRyaWdnZXJDaGFyYWN0ZXJzPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIHJlZ3VsYXIgZXhwcmVzc2lvbiB0aGF0IGRlc2NyaWJlcyB3aGF0IGEgd29yZCBpc1xuXHQgKlxuXHQgKiBEZWZhdWx0cyB0byBzcGFjZSBzZXBhcmF0ZWQgd29yZHMuXG5cdCAqL1xuXHR3b3JkRGVmaW5pdGlvbj86IFJlZ0V4cDtcblxuXHQvKipcblx0ICogU2hvdyBzdWdnZXN0aW9ucyBldmVuIGlmIHRoZSB0cmlnZ2VyIGNoYXJhY3RlciBpcyBub3QgcHJlc2VudC5cblx0ICpcblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRhbHdheXNTaG93U3VnZ2VzdGlvbnM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBEZWZpbmVzIHRoZSBzb3J0aW5nIGZ1bmN0aW9uIHVzZWQgd2hlbiBzaG93aW5nIHJlc3VsdHMuXG5cdCAqXG5cdCAqIERlZmF1bHRzIHRvIHRoZSBpZGVudGl0eSBmdW5jdGlvbi5cblx0ICovXG5cdHNvcnRLZXk/OiAocmVzdWx0OiBzdHJpbmcpID0+IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFN1Z2dlc3RFbmFibGVkSW5wdXRPcHRpb25zIHtcblx0LyoqXG5cdCAqIFRoZSB0ZXh0IHRvIHNob3cgd2hlbiBubyBpbnB1dCBpcyBwcmVzZW50LlxuXHQgKlxuXHQgKiBEZWZhdWx0cyB0byB0aGUgZW1wdHkgc3RyaW5nLlxuXHQgKi9cblx0cGxhY2Vob2xkZXJUZXh0Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBJbml0aWFsIHZhbHVlIHRvIGJlIHNob3duXG5cdCAqL1xuXHR2YWx1ZT86IHN0cmluZztcblxuXHQvKipcblx0ICogQ29udGV4dCBrZXkgdHJhY2tpbmcgdGhlIGZvY3VzIHN0YXRlIG9mIHRoaXMgZWxlbWVudFxuXHQgKi9cblx0Zm9jdXNDb250ZXh0S2V5PzogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0LyoqXG5cdCAqIFBsYWNlIG92ZXJmbG93IHdpZGdldHMgaW5zaWRlIGFuIGV4dGVybmFsIERPTSBub2RlLlxuXHQgKiBEZWZhdWx0cyB0byBhbiBpbnRlcm5hbCBET00gbm9kZS5cblx0ICovXG5cdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU/OiBIVE1MRWxlbWVudDtcblxuXHQvKipcblx0ICogT3ZlcnJpZGUgdGhlIGRlZmF1bHQgc3R5bGluZyBvZiB0aGUgaW5wdXQuXG5cdCAqL1xuXHRzdHlsZU92ZXJyaWRlcz86IElTdWdnZXN0RW5hYmxlZElucHV0U3R5bGVPdmVycmlkZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN1Z2dlc3RFbmFibGVkSW5wdXRTdHlsZU92ZXJyaWRlcyB7XG5cdGlucHV0QmFja2dyb3VuZD86IENvbG9ySWRlbnRpZmllcjtcblx0aW5wdXRGb3JlZ3JvdW5kPzogQ29sb3JJZGVudGlmaWVyO1xuXHRpbnB1dEJvcmRlcj86IENvbG9ySWRlbnRpZmllcjtcblx0aW5wdXRQbGFjZWhvbGRlckZvcmVncm91bmQ/OiBDb2xvcklkZW50aWZpZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBTdWdnZXN0RW5hYmxlZElucHV0IGV4dGVuZHMgV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblNob3VsZEZvY3VzUmVzdWx0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblNob3VsZEZvY3VzUmVzdWx0czogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vblNob3VsZEZvY3VzUmVzdWx0cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbklucHV0RGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25JbnB1dERpZENoYW5nZTogRXZlbnQ8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IHRoaXMuX29uSW5wdXREaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzID0gdGhpcy5fb25EaWRGb2N1cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEJsdXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRCbHVyID0gdGhpcy5fb25EaWRCbHVyLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGlucHV0V2lkZ2V0OiBDb2RlRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0TW9kZWw6IElUZXh0TW9kZWw7XG5cdHByb3RlY3RlZCBzdHlsaW5nQ29udGFpbmVyOiBIVE1MRGl2RWxlbWVudDtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcGxhY2Vob2xkZXJUZXh0OiBIVE1MRGl2RWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0c3VnZ2VzdGlvblByb3ZpZGVyOiBTdWdnZXN0UmVzdWx0c1Byb3ZpZGVyLFxuXHRcdGFyaWFMYWJlbDogc3RyaW5nLFxuXHRcdHJlc291cmNlSGFuZGxlOiBzdHJpbmcsXG5cdFx0b3B0aW9uczogU3VnZ2VzdEVuYWJsZWRJbnB1dE9wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBkZWZhdWx0SW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuc3R5bGluZ0NvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5zdWdnZXN0LWlucHV0LWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmVsZW1lbnQgPSBwYXJlbnQ7XG5cdFx0dGhpcy5wbGFjZWhvbGRlclRleHQgPSBhcHBlbmQodGhpcy5zdHlsaW5nQ29udGFpbmVyLCAkKCcuc3VnZ2VzdC1pbnB1dC1wbGFjZWhvbGRlcicsIHVuZGVmaW5lZCwgb3B0aW9ucy5wbGFjZWhvbGRlclRleHQgfHwgJycpKTtcblxuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnM6IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zID0gbWl4aW4oXG5cdFx0XHRnZXRTaW1wbGVFZGl0b3JPcHRpb25zKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdGdldFN1Z2dlc3RFbmFibGVkSW5wdXRPcHRpb25zKGFyaWFMYWJlbCkpO1xuXHRcdGVkaXRvck9wdGlvbnMub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSA9IG9wdGlvbnMub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTtcblxuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5nZXRTY29wZWRDb250ZXh0S2V5U2VydmljZShjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXG5cdFx0XHQ/IHRoaXMuX3JlZ2lzdGVyKGRlZmF1bHRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSkpXG5cdFx0XHQ6IGRlZmF1bHRJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRcdHRoaXMuaW5wdXRXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlRWRpdG9yV2lkZ2V0LCB0aGlzLnN0eWxpbmdDb250YWluZXIsXG5cdFx0XHRlZGl0b3JPcHRpb25zLFxuXHRcdFx0e1xuXHRcdFx0XHRjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0U29tZUVkaXRvckNvbnRyaWJ1dGlvbnMoW1xuXHRcdFx0XHRcdFN1Z2dlc3RDb250cm9sbGVyLklELFxuXHRcdFx0XHRcdFNuaXBwZXRDb250cm9sbGVyMi5JRCxcblx0XHRcdFx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdFx0TWVudVByZXZlbnRlci5JRCxcblx0XHRcdFx0XHRTZWxlY3Rpb25DbGlwYm9hcmRDb250cmlidXRpb25JRCxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGlzU2ltcGxlV2lkZ2V0OiB0cnVlLFxuXHRcdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmFjY2Vzc2liaWxpdHlTdXBwb3J0JykgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmN1cnNvckJsaW5raW5nJykpIHtcblx0XHRcdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVN1cHBvcnQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnYXV0bycgfCAnb2ZmJyB8ICdvbic+KCdlZGl0b3IuYWNjZXNzaWJpbGl0eVN1cHBvcnQnKTtcblx0XHRcdFx0Y29uc3QgY3Vyc29yQmxpbmtpbmcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnYmxpbmsnIHwgJ3Ntb290aCcgfCAncGhhc2UnIHwgJ2V4cGFuZCcgfCAnc29saWQnPignZWRpdG9yLmN1cnNvckJsaW5raW5nJyk7XG5cdFx0XHRcdHRoaXMuaW5wdXRXaWRnZXQudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0YWNjZXNzaWJpbGl0eVN1cHBvcnQsXG5cdFx0XHRcdFx0Y3Vyc29yQmxpbmtpbmdcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnB1dFdpZGdldC5vbkRpZEZvY3VzRWRpdG9yVGV4dCgoKSA9PiB0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRXaWRnZXQub25EaWRCbHVyRWRpdG9yVGV4dCgoKSA9PiB0aGlzLl9vbkRpZEJsdXIuZmlyZSgpKSk7XG5cblx0XHRjb25zdCBzY29wZUhhbmRsZSA9IHVyaS5wYXJzZShyZXNvdXJjZUhhbmRsZSk7XG5cdFx0dGhpcy5pbnB1dE1vZGVsID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCBudWxsLCBzY29wZUhhbmRsZSwgdHJ1ZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnB1dE1vZGVsKTtcblx0XHR0aGlzLmlucHV0V2lkZ2V0LnNldE1vZGVsKHRoaXMuaW5wdXRNb2RlbCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0V2lkZ2V0Lm9uRGlkUGFzdGUoKCkgPT4gdGhpcy5zZXRWYWx1ZSh0aGlzLmdldFZhbHVlKCkpKSk7IC8vIHNldHRlciBjbGVhbnNlc1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoKHRoaXMuaW5wdXRXaWRnZXQub25EaWRGb2N1c0VkaXRvclRleHQoKCkgPT4ge1xuXHRcdFx0aWYgKG9wdGlvbnMuZm9jdXNDb250ZXh0S2V5KSB7IG9wdGlvbnMuZm9jdXNDb250ZXh0S2V5LnNldCh0cnVlKTsgfVxuXHRcdFx0dGhpcy5zdHlsaW5nQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3N5bnRoZXRpYy1mb2N1cycpO1xuXHRcdH0pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoKHRoaXMuaW5wdXRXaWRnZXQub25EaWRCbHVyRWRpdG9yVGV4dCgoKSA9PiB7XG5cdFx0XHRpZiAob3B0aW9ucy5mb2N1c0NvbnRleHRLZXkpIHsgb3B0aW9ucy5mb2N1c0NvbnRleHRLZXkuc2V0KGZhbHNlKTsgfVxuXHRcdFx0dGhpcy5zdHlsaW5nQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3N5bnRoZXRpYy1mb2N1cycpO1xuXHRcdH0pKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5jaGFpbih0aGlzLmlucHV0V2lkZ2V0Lm9uS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlcikpKGUgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IC8qKiBEbyBub3RoaW5nLiBFbnRlciBjYXVzZXMgbmV3IGxpbmUgd2hpY2ggaXMgbm90IGV4cGVjdGVkLiAqLyB9LCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4odGhpcy5pbnB1dFdpZGdldC5vbktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRG93bkFycm93ICYmIChpc01hY2ludG9zaCA/IGUubWV0YUtleSA6IGUuY3RybEtleSkpKSgoKSA9PiB0aGlzLl9vblNob3VsZEZvY3VzUmVzdWx0cy5maXJlKCksIHRoaXMpKTtcblxuXHRcdGxldCBwcmVleGlzdGluZ0NvbnRlbnQgPSB0aGlzLmdldFZhbHVlKCk7XG5cdFx0Y29uc3QgaW5wdXRXaWRnZXRNb2RlbCA9IHRoaXMuaW5wdXRXaWRnZXQuZ2V0TW9kZWwoKTtcblx0XHRpZiAoaW5wdXRXaWRnZXRNb2RlbCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoaW5wdXRXaWRnZXRNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5nZXRWYWx1ZSgpO1xuXHRcdFx0XHR0aGlzLnBsYWNlaG9sZGVyVGV4dC5zdHlsZS52aXNpYmlsaXR5ID0gY29udGVudCA/ICdoaWRkZW4nIDogJ3Zpc2libGUnO1xuXHRcdFx0XHRpZiAocHJlZXhpc3RpbmdDb250ZW50LnRyaW0oKSA9PT0gY29udGVudC50cmltKCkpIHsgcmV0dXJuOyB9XG5cdFx0XHRcdHRoaXMuX29uSW5wdXREaWRDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRwcmVleGlzdGluZ0NvbnRlbnQgPSBjb250ZW50O1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbGlkYXRlZFN1Z2dlc3RQcm92aWRlciA9IHtcblx0XHRcdHByb3ZpZGVSZXN1bHRzOiBzdWdnZXN0aW9uUHJvdmlkZXIucHJvdmlkZVJlc3VsdHMsXG5cdFx0XHRzb3J0S2V5OiBzdWdnZXN0aW9uUHJvdmlkZXIuc29ydEtleSB8fCAoYSA9PiBhKSxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBzdWdnZXN0aW9uUHJvdmlkZXIudHJpZ2dlckNoYXJhY3RlcnMgfHwgW10sXG5cdFx0XHR3b3JkRGVmaW5pdGlvbjogc3VnZ2VzdGlvblByb3ZpZGVyLndvcmREZWZpbml0aW9uID8gZW5zdXJlVmFsaWRXb3JkRGVmaW5pdGlvbihzdWdnZXN0aW9uUHJvdmlkZXIud29yZERlZmluaXRpb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0YWx3YXlzU2hvd1N1Z2dlc3Rpb25zOiAhIXN1Z2dlc3Rpb25Qcm92aWRlci5hbHdheXNTaG93U3VnZ2VzdGlvbnMsXG5cdFx0fTtcblxuXHRcdHRoaXMuc2V0VmFsdWUob3B0aW9ucy52YWx1ZSB8fCAnJyk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IHNjb3BlSGFuZGxlLnNjaGVtZSwgcGF0dGVybjogJyoqLycgKyBzY29wZUhhbmRsZS5wYXRoLCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogYHN1Z2dlc3RFbmFibGVkSW5wdXQvJHtpZH1gLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IHZhbGlkYXRlZFN1Z2dlc3RQcm92aWRlci50cmlnZ2VyQ2hhcmFjdGVycyxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogbGFuZ3VhZ2VzLkNvbXBsZXRpb25Db250ZXh0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHF1ZXJ5ID0gbW9kZWwuZ2V0VmFsdWUoKTtcblxuXHRcdFx0XHRjb25zdCB6ZXJvSW5kZXhlZENvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHRcdGxldCBhbHJlYWR5VHlwZWRDb3VudCA9IDAsIHplcm9JbmRleGVkV29yZFN0YXJ0ID0gMDtcblxuXHRcdFx0XHRpZiAodmFsaWRhdGVkU3VnZ2VzdFByb3ZpZGVyLndvcmREZWZpbml0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd29yZEF0VGV4dCA9IGdldFdvcmRBdFRleHQocG9zaXRpb24uY29sdW1uLCB2YWxpZGF0ZWRTdWdnZXN0UHJvdmlkZXIud29yZERlZmluaXRpb24sIHF1ZXJ5LCAwKTtcblx0XHRcdFx0XHRhbHJlYWR5VHlwZWRDb3VudCA9IHdvcmRBdFRleHQ/LndvcmQubGVuZ3RoID8/IDA7XG5cdFx0XHRcdFx0emVyb0luZGV4ZWRXb3JkU3RhcnQgPSB3b3JkQXRUZXh0ID8gd29yZEF0VGV4dC5zdGFydENvbHVtbiAtIDEgOiAwO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHplcm9JbmRleGVkV29yZFN0YXJ0ID0gcXVlcnkubGFzdEluZGV4T2YoJyAnLCB6ZXJvSW5kZXhlZENvbHVtbiAtIDEpICsgMTtcblx0XHRcdFx0XHRhbHJlYWR5VHlwZWRDb3VudCA9IHplcm9JbmRleGVkQ29sdW1uIC0gemVyb0luZGV4ZWRXb3JkU3RhcnQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBkb250IHNob3cgc3VnZ2VzdGlvbnMgaWYgdGhlIHVzZXIgaGFzIHR5cGVkIHNvbWV0aGluZywgYnV0IGhhc24ndCB1c2VkIHRoZSB0cmlnZ2VyIGNoYXJhY3RlclxuXHRcdFx0XHRpZiAoIXZhbGlkYXRlZFN1Z2dlc3RQcm92aWRlci5hbHdheXNTaG93U3VnZ2VzdGlvbnMgJiYgYWxyZWFkeVR5cGVkQ291bnQgPiAwICYmIHZhbGlkYXRlZFN1Z2dlc3RQcm92aWRlci50cmlnZ2VyQ2hhcmFjdGVycz8uaW5kZXhPZihxdWVyeVt6ZXJvSW5kZXhlZFdvcmRTdGFydF0pID09PSAtMSkge1xuXHRcdFx0XHRcdHJldHVybiB7IHN1Z2dlc3Rpb25zOiBbXSB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogc3VnZ2VzdGlvblByb3ZpZGVyLnByb3ZpZGVSZXN1bHRzKHF1ZXJ5KS5tYXAoKHJlc3VsdCk6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRsZXQgbGFiZWw6IHN0cmluZztcblx0XHRcdFx0XHRcdGxldCByZXN0OiBQYXJ0aWFsPGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbT4gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSByZXN1bHQ7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IHJlc3VsdC5sYWJlbDtcblx0XHRcdFx0XHRcdFx0cmVzdCA9IHJlc3VsdDtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGxhYmVsLFxuXHRcdFx0XHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbi5kZWx0YSgwLCAtYWxyZWFkeVR5cGVkQ291bnQpLCBwb3NpdGlvbiksXG5cdFx0XHRcdFx0XHRcdHNvcnRUZXh0OiB2YWxpZGF0ZWRTdWdnZXN0UHJvdmlkZXIuc29ydEtleShsYWJlbCksXG5cdFx0XHRcdFx0XHRcdGtpbmQ6IGxhbmd1YWdlcy5Db21wbGV0aW9uSXRlbUtpbmQuS2V5d29yZCxcblx0XHRcdFx0XHRcdFx0Li4ucmVzdFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuc3R5bGUob3B0aW9ucy5zdHlsZU92ZXJyaWRlcyB8fCB7fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UoX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBJQ29udGV4dEtleVNlcnZpY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlQXJpYUxhYmVsKGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0V2lkZ2V0LnVwZGF0ZU9wdGlvbnMoeyBhcmlhTGFiZWw6IGxhYmVsIH0pO1xuXHR9XG5cblx0cHVibGljIHNldFBsYWNlSG9sZGVyKHBsYWNlaG9sZGVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnBsYWNlaG9sZGVyVGV4dC50ZXh0Q29udGVudCA9IHBsYWNlaG9sZGVyO1xuXHR9XG5cblx0cHVibGljIHNldFZhbHVlKHZhbDogc3RyaW5nKSB7XG5cdFx0dmFsID0gdmFsLnJlcGxhY2UoL1xccy9nLCAnICcpO1xuXHRcdGNvbnN0IGZ1bGxSYW5nZSA9IHRoaXMuaW5wdXRNb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXHRcdHRoaXMuaW5wdXRXaWRnZXQuZXhlY3V0ZUVkaXRzKCdzdWdnZXN0RW5hYmxlZElucHV0LnNldFZhbHVlJywgW0VkaXRPcGVyYXRpb24ucmVwbGFjZShmdWxsUmFuZ2UsIHZhbCldKTtcblx0XHR0aGlzLmlucHV0V2lkZ2V0LnNldFNjcm9sbFRvcCgwKTtcblx0XHR0aGlzLmlucHV0V2lkZ2V0LnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCB2YWwubGVuZ3RoICsgMSkpO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRXaWRnZXQuZ2V0VmFsdWUoKTtcblx0fVxuXG5cdHByaXZhdGUgc3R5bGUoc3R5bGVPdmVycmlkZXM6IElTdWdnZXN0RW5hYmxlZElucHV0U3R5bGVPdmVycmlkZXMpOiB2b2lkIHtcblx0XHR0aGlzLnN0eWxpbmdDb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYXNDc3NWYXJpYWJsZShzdHlsZU92ZXJyaWRlcy5pbnB1dEJhY2tncm91bmQgPz8gaW5wdXRCYWNrZ3JvdW5kKTtcblx0XHR0aGlzLnN0eWxpbmdDb250YWluZXIuc3R5bGUuY29sb3IgPSBhc0Nzc1ZhcmlhYmxlKHN0eWxlT3ZlcnJpZGVzLmlucHV0Rm9yZWdyb3VuZCA/PyBpbnB1dEZvcmVncm91bmQpO1xuXHRcdHRoaXMucGxhY2Vob2xkZXJUZXh0LnN0eWxlLmNvbG9yID0gYXNDc3NWYXJpYWJsZShzdHlsZU92ZXJyaWRlcy5pbnB1dFBsYWNlaG9sZGVyRm9yZWdyb3VuZCA/PyBpbnB1dFBsYWNlaG9sZGVyRm9yZWdyb3VuZCk7XG5cdFx0dGhpcy5zdHlsaW5nQ29udGFpbmVyLnN0eWxlLmJvcmRlcldpZHRoID0gJzFweCc7XG5cdFx0dGhpcy5zdHlsaW5nQ29udGFpbmVyLnN0eWxlLmJvcmRlclN0eWxlID0gJ3NvbGlkJztcblx0XHR0aGlzLnN0eWxpbmdDb250YWluZXIuc3R5bGUuYm9yZGVyQ29sb3IgPSBhc0Nzc1ZhcmlhYmxlV2l0aERlZmF1bHQoc3R5bGVPdmVycmlkZXMuaW5wdXRCb3JkZXIgPz8gaW5wdXRCb3JkZXIsICd0cmFuc3BhcmVudCcpO1xuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgY3Vyc29yID0gdGhpcy5zdHlsaW5nQ29udGFpbmVyLmdldEVsZW1lbnRzQnlDbGFzc05hbWUoJ2N1cnNvcicpWzBdIGFzIEhUTUxEaXZFbGVtZW50O1xuXHRcdGlmIChjdXJzb3IpIHtcblx0XHRcdGN1cnNvci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBhc0Nzc1ZhcmlhYmxlKHN0eWxlT3ZlcnJpZGVzLmlucHV0Rm9yZWdyb3VuZCA/PyBpbnB1dEZvcmVncm91bmQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmb2N1cyhzZWxlY3RBbGw/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5pbnB1dFdpZGdldC5mb2N1cygpO1xuXG5cdFx0aWYgKHNlbGVjdEFsbCAmJiB0aGlzLmlucHV0V2lkZ2V0LmdldFZhbHVlKCkpIHtcblx0XHRcdHRoaXMuc2VsZWN0QWxsKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG9uSGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0V2lkZ2V0Lm9uSGlkZSgpO1xuXHR9XG5cblx0cHVibGljIGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXRXaWRnZXQubGF5b3V0KGRpbWVuc2lvbik7XG5cdFx0dGhpcy5wbGFjZWhvbGRlclRleHQuc3R5bGUud2lkdGggPSBgJHtkaW1lbnNpb24ud2lkdGggLSAyfXB4YDtcblx0fVxuXG5cdHByaXZhdGUgc2VsZWN0QWxsKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXRXaWRnZXQuc2V0U2VsZWN0aW9uKG5ldyBSYW5nZSgxLCAxLCAxLCB0aGlzLmdldFZhbHVlKCkubGVuZ3RoICsgMSkpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN1Z2dlc3RFbmFibGVkSGlzdG9yeU9wdGlvbnMge1xuXHRpZDogc3RyaW5nO1xuXHRhcmlhTGFiZWw6IHN0cmluZztcblx0cGFyZW50OiBIVE1MRWxlbWVudDtcblx0c3VnZ2VzdGlvblByb3ZpZGVyOiBTdWdnZXN0UmVzdWx0c1Byb3ZpZGVyO1xuXHRyZXNvdXJjZUhhbmRsZTogc3RyaW5nO1xuXHRzdWdnZXN0T3B0aW9uczogU3VnZ2VzdEVuYWJsZWRJbnB1dE9wdGlvbnM7XG5cdGhpc3Rvcnk6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY2xhc3MgU3VnZ2VzdEVuYWJsZWRJbnB1dFdpdGhIaXN0b3J5IGV4dGVuZHMgU3VnZ2VzdEVuYWJsZWRJbnB1dCBpbXBsZW1lbnRzIElIaXN0b3J5TmF2aWdhdGlvbldpZGdldCB7XG5cdHByb3RlY3RlZCByZWFkb25seSBoaXN0b3J5OiBIaXN0b3J5TmF2aWdhdG9yPHN0cmluZz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0eyBpZCwgcGFyZW50LCBhcmlhTGFiZWwsIHN1Z2dlc3Rpb25Qcm92aWRlciwgcmVzb3VyY2VIYW5kbGUsIHN1Z2dlc3RPcHRpb25zLCBoaXN0b3J5IH06IElTdWdnZXN0RW5hYmxlZEhpc3RvcnlPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaWQsIHBhcmVudCwgc3VnZ2VzdGlvblByb3ZpZGVyLCBhcmlhTGFiZWwsIHJlc291cmNlSGFuZGxlLCBzdWdnZXN0T3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UsIG1vZGVsU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5oaXN0b3J5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEhpc3RvcnlOYXZpZ2F0b3I8c3RyaW5nPihuZXcgU2V0KGhpc3RvcnkpLCAxMDApKTtcblx0fVxuXG5cdHB1YmxpYyBhZGRUb0hpc3RvcnkoKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmdldFZhbHVlKCk7XG5cdFx0aWYgKHZhbHVlICYmIHZhbHVlICE9PSB0aGlzLmdldEN1cnJlbnRWYWx1ZSgpKSB7XG5cdFx0XHR0aGlzLmhpc3RvcnkuYWRkKHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0SGlzdG9yeSgpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuaGlzdG9yeS5nZXRIaXN0b3J5KCk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgaW5wdXQgaXMgY3VycmVudGx5IHNob3dpbmcgYSB2YWx1ZSBmcm9tIHRoZSBoaXN0b3J5IChhcyBvcHBvc2VkIHRvIGEgZnJlc2hseVxuXHQgKiB0eXBlZCBxdWVyeSkuIFdoaWxlIG5hdmlnYXRpbmcsIHtAbGluayBzaG93TmV4dFZhbHVlfSBhZHZhbmNlcyB0b3dhcmQgbW9yZSByZWNlbnQgZW50cmllcyBhbmQsXG5cdCAqIG9uY2UgcGFzdCB0aGUgbW9zdCByZWNlbnQgb25lLCBjbGVhcnMgdGhlIGlucHV0IGJhY2sgdG8gYW4gZW1wdHkgdmFsdWUuXG5cdCAqL1xuXHRwdWJsaWMgaXNOYXZpZ2F0aW5nSGlzdG9yeSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuaGlzdG9yeS5pc05vd2hlcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93TmV4dFZhbHVlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5oaXN0b3J5Lmhhcyh0aGlzLmdldFZhbHVlKCkpKSB7XG5cdFx0XHR0aGlzLmFkZFRvSGlzdG9yeSgpO1xuXHRcdH1cblxuXHRcdGxldCBuZXh0ID0gdGhpcy5nZXROZXh0VmFsdWUoKTtcblx0XHRpZiAobmV4dCkge1xuXHRcdFx0bmV4dCA9IG5leHQgPT09IHRoaXMuZ2V0VmFsdWUoKSA/IHRoaXMuZ2V0TmV4dFZhbHVlKCkgOiBuZXh0O1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0VmFsdWUobmV4dCA/PyAnJyk7XG5cdH1cblxuXHRwdWJsaWMgc2hvd1ByZXZpb3VzVmFsdWUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhpc3RvcnkuaGFzKHRoaXMuZ2V0VmFsdWUoKSkpIHtcblx0XHRcdHRoaXMuYWRkVG9IaXN0b3J5KCk7XG5cdFx0fVxuXG5cdFx0bGV0IHByZXZpb3VzID0gdGhpcy5nZXRQcmV2aW91c1ZhbHVlKCk7XG5cdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHRwcmV2aW91cyA9IHByZXZpb3VzID09PSB0aGlzLmdldFZhbHVlKCkgPyB0aGlzLmdldFByZXZpb3VzVmFsdWUoKSA6IHByZXZpb3VzO1xuXHRcdH1cblxuXHRcdGlmIChwcmV2aW91cykge1xuXHRcdFx0dGhpcy5zZXRWYWx1ZShwcmV2aW91cyk7XG5cdFx0XHR0aGlzLmlucHV0V2lkZ2V0LnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMCwgY29sdW1uOiAwIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjbGVhckhpc3RvcnkoKTogdm9pZCB7XG5cdFx0dGhpcy5oaXN0b3J5LmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnJlbnRWYWx1ZSgpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRsZXQgY3VycmVudFZhbHVlID0gdGhpcy5oaXN0b3J5LmN1cnJlbnQoKTtcblx0XHRpZiAoIWN1cnJlbnRWYWx1ZSkge1xuXHRcdFx0Y3VycmVudFZhbHVlID0gdGhpcy5oaXN0b3J5Lmxhc3QoKTtcblx0XHRcdHRoaXMuaGlzdG9yeS5uZXh0KCk7XG5cdFx0fVxuXHRcdHJldHVybiBjdXJyZW50VmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIGdldFByZXZpb3VzVmFsdWUoKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuaGlzdG9yeS5wcmV2aW91cygpIHx8IHRoaXMuaGlzdG9yeS5maXJzdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROZXh0VmFsdWUoKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuaGlzdG9yeS5uZXh0KCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRTY29wZWRTdWdnZXN0RW5hYmxlZElucHV0V2l0aEhpc3RvcnkgZXh0ZW5kcyBTdWdnZXN0RW5hYmxlZElucHV0V2l0aEhpc3Rvcnkge1xuXHRwcml2YXRlIGhpc3RvcnlDb250ZXh0ITogSUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJU3VnZ2VzdEVuYWJsZWRIaXN0b3J5T3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgeyBoaXN0b3J5TmF2aWdhdGlvbkJhY2t3YXJkc0VuYWJsZW1lbnQsIGhpc3RvcnlOYXZpZ2F0aW9uRm9yd2FyZHNFbmFibGVtZW50IH0gPSB0aGlzLmhpc3RvcnlDb250ZXh0O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRXaWRnZXQub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoeyBwb3NpdGlvbiB9KSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLmlucHV0V2lkZ2V0Ll9nZXRWaWV3TW9kZWwoKSE7XG5cdFx0XHRjb25zdCBsYXN0TGluZU51bWJlciA9IHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGNvbnN0IGxhc3RMaW5lQ29sID0gdmlld01vZGVsLmdldExpbmVMZW5ndGgobGFzdExpbmVOdW1iZXIpICsgMTtcblx0XHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdGhpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudC5zZXQodmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIgPT09IDEgJiYgdmlld1Bvc2l0aW9uLmNvbHVtbiA9PT0gMSk7XG5cdFx0XHRoaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudC5zZXQodmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIgPT09IGxhc3RMaW5lTnVtYmVyICYmIHZpZXdQb3NpdGlvbi5jb2x1bW4gPT09IGxhc3RMaW5lQ29sKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UoY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSkge1xuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuZWxlbWVudCkpO1xuXHRcdHRoaXMuaGlzdG9yeUNvbnRleHQgPSB0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFuZENyZWF0ZUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dChcblx0XHRcdHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0dGhpcyxcblx0XHQpKTtcblxuXHRcdHJldHVybiBzY29wZWRDb250ZXh0S2V5U2VydmljZTtcblx0fVxufVxuXG5zZXR1cFNpbXBsZUVkaXRvclNlbGVjdGlvblN0eWxpbmcoJy5zdWdnZXN0LWlucHV0LWNvbnRhaW5lcicpO1xuXG5mdW5jdGlvbiBnZXRTdWdnZXN0RW5hYmxlZElucHV0T3B0aW9ucyhhcmlhTGFiZWw/OiBzdHJpbmcpOiBJRWRpdG9yT3B0aW9ucyB7XG5cdHJldHVybiB7XG5cdFx0Zm9udFNpemU6IDEzLFxuXHRcdGxpbmVIZWlnaHQ6IDIwLFxuXHRcdHdvcmRXcmFwOiAnb2ZmJyxcblx0XHRzY3JvbGxiYXI6IHsgdmVydGljYWw6ICdoaWRkZW4nLCB9LFxuXHRcdHJvdW5kZWRTZWxlY3Rpb246IGZhbHNlLFxuXHRcdGd1aWRlczoge1xuXHRcdFx0aW5kZW50YXRpb246IGZhbHNlXG5cdFx0fSxcblx0XHRjdXJzb3JXaWR0aDogMSxcblx0XHRmb250RmFtaWx5OiBERUZBVUxUX0ZPTlRfRkFNSUxZLFxuXHRcdGFyaWFMYWJlbDogYXJpYUxhYmVsIHx8ICcnLFxuXHRcdHNuaXBwZXRTdWdnZXN0aW9uczogJ25vbmUnLFxuXHRcdHN1Z2dlc3Q6IHsgZmlsdGVyR3JhY2VmdWw6IGZhbHNlLCBzaG93SWNvbnM6IGZhbHNlIH0sXG5cdFx0YXV0b0Nsb3NpbmdCcmFja2V0czogJ25ldmVyJ1xuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQWMsY0FBYztBQUNyQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLE9BQU8sV0FBVztBQUMzQixPQUFPO0FBRVAsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMkJBQTJCLHFCQUFxQjtBQUN6RCxZQUFZLGVBQWU7QUFFM0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0Is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
