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
import { createStyleSheetFromObservable } from "../../../../../base/browser/domStylesheets.js";
import { createHotClass } from "../../../../../base/common/hotReloadHelpers.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { derived, mapObservableArrayCached, derivedDisposable, derivedObservableWithCache, constObservable, observableValue } from "../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { observableCodeEditor } from "../../../../browser/observableCodeEditor.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { LineRange } from "../../../../common/core/ranges/lineRange.js";
import { InlineCompletionsHintsWidget } from "../hintsWidget/inlineCompletionsHintsWidget.js";
import { convertItemsToStableObservables } from "../utils.js";
import { GhostTextView, GhostTextWidgetWarning } from "./ghostText/ghostTextView.js";
import { InlineEditsGutterIndicator, InlineEditsGutterIndicatorData, InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from "./inlineEdits/components/gutterIndicatorView.js";
import { InlineEditsOnboardingExperience } from "./inlineEdits/inlineEditsNewUsers.js";
import { InlineCompletionViewKind, InlineEditTabAction } from "./inlineEdits/inlineEditsViewInterface.js";
import { InlineEditsViewAndDiffProducer } from "./inlineEdits/inlineEditsViewProducer.js";
let InlineSuggestionsView = class extends Disposable {
  constructor(_editor, _model, _focusIsInMenu, _instantiationService) {
    super();
    this._editor = _editor;
    this._model = _model;
    this._focusIsInMenu = _focusIsInMenu;
    this._instantiationService = _instantiationService;
    this._ghostTexts = derived(this, (reader) => {
      const model = this._model.read(reader);
      return model?.ghostTexts.read(reader) ?? [];
    });
    this._inlineEdit = derived(this, (reader) => this._model.read(reader)?.inlineEditState.read(reader)?.inlineSuggestion);
    this._everHadInlineEdit = derivedObservableWithCache(
      this,
      (reader, last) => last || !!this._inlineEdit.read(reader) || !!this._model.read(reader)?.inlineCompletionState.read(reader)?.inlineSuggestion?.showInlineEditMenu
    );
    // To break a cyclic dependency
    this._indicatorIsHoverVisible = observableValue(this, void 0);
    this._showInlineEditCollapsed = derived(this, (reader) => {
      const s = this._model.read(reader)?.showCollapsed.read(reader) ?? false;
      return s && !this._indicatorIsHoverVisible.read(reader)?.read(reader);
    });
    this._inlineEditWidget = derivedDisposable((reader) => {
      if (!this._everHadInlineEdit.read(reader)) {
        return void 0;
      }
      return this._instantiationService.createInstance(InlineEditsViewAndDiffProducer, this._editor, this._model, this._showInlineEditCollapsed);
    });
    this._gutterIndicatorState = derived((reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return void 0;
      }
      const state = model.state.read(reader);
      if (state?.kind === "ghostText" && state.inlineSuggestion?.showInlineEditMenu) {
        return {
          displayRange: LineRange.ofLength(state.primaryGhostText.lineNumber, 1),
          tabAction: derived(
            this,
            (reader2) => this._editorObs.isFocused.read(reader2) ? InlineEditTabAction.Accept : InlineEditTabAction.Inactive
          ),
          gutterIndicatorOffset: constObservable(getGhostTextTopOffset(state.inlineSuggestion, this._editor)),
          inlineSuggestion: state.inlineSuggestion,
          model
        };
      } else if (state?.kind === "inlineEdit") {
        const inlineEditWidget = this._inlineEditWidget.read(reader)?.view;
        if (!inlineEditWidget) {
          return void 0;
        }
        const displayRange = inlineEditWidget.displayRange.read(reader);
        if (!displayRange) {
          return void 0;
        }
        return {
          displayRange,
          tabAction: derived((reader2) => {
            if (this._editorObs.isFocused.read(reader2)) {
              if (model.tabShouldJumpToInlineEdit.read(reader2)) {
                return InlineEditTabAction.Jump;
              }
              if (model.tabShouldAcceptInlineEdit.read(reader2)) {
                return InlineEditTabAction.Accept;
              }
            }
            return InlineEditTabAction.Inactive;
          }),
          gutterIndicatorOffset: inlineEditWidget.gutterIndicatorOffset,
          inlineSuggestion: state.inlineSuggestion,
          model
        };
      } else {
        return void 0;
      }
    });
    this._stablizedGhostTexts = convertItemsToStableObservables(this._ghostTexts, this._store);
    this._editorObs = observableCodeEditor(this._editor);
    this._ghostTextWidgets = mapObservableArrayCached(
      this,
      this._stablizedGhostTexts,
      (ghostText, store) => store.add(this._createGhostText(ghostText))
    ).recomputeInitiallyAndOnChange(this._store);
    this._inlineEditWidget.recomputeInitiallyAndOnChange(this._store);
    this._fontFamily = this._editorObs.getOption(EditorOption.inlineSuggest).map((val) => val.fontFamily);
    this._register(createStyleSheetFromObservable(derived((reader) => {
      const fontFamily = this._fontFamily.read(reader);
      return `
.monaco-editor .ghost-text-decoration,
.monaco-editor .ghost-text-decoration-preview,
.monaco-editor .ghost-text {
	font-family: ${fontFamily};
}`;
    })));
    this._register(new InlineCompletionsHintsWidget(this._editor, this._model, this._instantiationService));
    this._indicator = this._register(this._instantiationService.createInstance(
      InlineEditsGutterIndicator,
      this._editorObs,
      derived((reader) => {
        const s = this._gutterIndicatorState.read(reader);
        if (!s) {
          return void 0;
        }
        return new InlineEditsGutterIndicatorData(
          InlineSuggestionGutterMenuData.fromInlineSuggestion(s.inlineSuggestion),
          s.displayRange,
          SimpleInlineSuggestModel.fromInlineCompletionModel(s.model),
          s.inlineSuggestion.action?.kind === "edit" ? s.inlineSuggestion.action.alternativeAction : void 0
        );
      }),
      this._gutterIndicatorState.map((s, reader) => s?.tabAction?.read(reader) ?? InlineEditTabAction.Inactive),
      this._gutterIndicatorState.map((s, reader) => s?.gutterIndicatorOffset?.read(reader) ?? 0),
      this._inlineEditWidget.map((w, reader) => w?.view.inlineEditsIsHovered.read(reader) ?? false),
      this._focusIsInMenu
    ));
    this._indicatorIsHoverVisible.set(this._indicator.isHoverVisible, void 0);
    derived((reader) => {
      const w = this._inlineEditWidget.read(reader);
      if (!w) {
        return void 0;
      }
      return reader.store.add(this._instantiationService.createInstance(
        InlineEditsOnboardingExperience,
        w._inlineEditModel,
        constObservable(this._indicator),
        w.view._inlineCollapsedView
      ));
    }).recomputeInitiallyAndOnChange(this._store);
  }
  _createGhostText(ghostText) {
    return this._instantiationService.createInstance(
      GhostTextView,
      this._editor,
      derived((reader) => {
        const model = this._model.read(reader);
        const inlineCompletion = model?.inlineCompletionState.read(reader)?.inlineSuggestion;
        if (!model || !inlineCompletion) {
          return {
            ghostText: ghostText.read(reader),
            handleInlineCompletionShown: () => {
            },
            warning: void 0
          };
        }
        return {
          ghostText: ghostText.read(reader),
          handleInlineCompletionShown: (viewData) => model.handleInlineSuggestionShown(inlineCompletion, InlineCompletionViewKind.GhostText, viewData, Date.now()),
          warning: GhostTextWidgetWarning.from(model?.warning.read(reader))
        };
      }),
      {
        useSyntaxHighlighting: this._editorObs.getOption(EditorOption.inlineSuggest).map((v) => v.syntaxHighlightingEnabled),
        highlightShortSuggestions: true
      }
    );
  }
  shouldShowHoverAtViewZone(viewZoneId) {
    return this._ghostTextWidgets.get()[0]?.ownsViewZone(viewZoneId) ?? false;
  }
};
InlineSuggestionsView.hot = createHotClass(InlineSuggestionsView);
InlineSuggestionsView = __decorateClass([
  __decorateParam(3, IInstantiationService)
], InlineSuggestionsView);
function getGhostTextTopOffset(inlineCompletion, editor) {
  const replacement = inlineCompletion.getSingleTextEdit();
  const textModel = editor.getModel();
  if (!textModel) {
    return 0;
  }
  const EOL = textModel.getEOL();
  if (replacement.range.isEmpty() && replacement.text.startsWith(EOL)) {
    const lineHeight = editor.getLineHeightForPosition(replacement.range.getStartPosition());
    return countPrefixRepeats(replacement.text, EOL) * lineHeight;
  }
  return 0;
}
function countPrefixRepeats(str, prefix) {
  if (!prefix.length) {
    return 0;
  }
  let count = 0;
  let i = 0;
  while (str.startsWith(prefix, i)) {
    count++;
    i += prefix.length;
  }
  return count;
}
export {
  InlineSuggestionsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVTdWdnZXN0aW9uc1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjcmVhdGVTdHlsZVNoZWV0RnJvbU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlSG90Q2xhc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ob3RSZWxvYWRIZWxwZXJzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgbWFwT2JzZXJ2YWJsZUFycmF5Q2FjaGVkLCBkZXJpdmVkRGlzcG9zYWJsZSwgZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBjb25zdE9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNIaW50c1dpZGdldCB9IGZyb20gJy4uL2hpbnRzV2lkZ2V0L2lubGluZUNvbXBsZXRpb25zSGludHNXaWRnZXQuanMnO1xuaW1wb3J0IHsgR2hvc3RUZXh0T3JSZXBsYWNlbWVudCB9IGZyb20gJy4uL21vZGVsL2dob3N0VGV4dC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi4vbW9kZWwvaW5saW5lQ29tcGxldGlvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uSXRlbSB9IGZyb20gJy4uL21vZGVsL2lubGluZVN1Z2dlc3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IGNvbnZlcnRJdGVtc1RvU3RhYmxlT2JzZXJ2YWJsZXMgfSBmcm9tICcuLi91dGlscy5qcyc7XG5pbXBvcnQgeyBHaG9zdFRleHRWaWV3LCBHaG9zdFRleHRXaWRnZXRXYXJuaW5nLCBJR2hvc3RUZXh0V2lkZ2V0RGF0YSB9IGZyb20gJy4vZ2hvc3RUZXh0L2dob3N0VGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3IsIElubGluZUVkaXRzR3V0dGVySW5kaWNhdG9yRGF0YSwgSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhLCBTaW1wbGVJbmxpbmVTdWdnZXN0TW9kZWwgfSBmcm9tICcuL2lubGluZUVkaXRzL2NvbXBvbmVudHMvZ3V0dGVySW5kaWNhdG9yVmlldy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0c09uYm9hcmRpbmdFeHBlcmllbmNlIH0gZnJvbSAnLi9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c05ld1VzZXJzLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25WaWV3S2luZCwgSW5saW5lRWRpdFRhYkFjdGlvbiB9IGZyb20gJy4vaW5saW5lRWRpdHMvaW5saW5lRWRpdHNWaWV3SW50ZXJmYWNlLmpzJztcbmltcG9ydCB7IElubGluZUVkaXRzVmlld0FuZERpZmZQcm9kdWNlciB9IGZyb20gJy4vaW5saW5lRWRpdHMvaW5saW5lRWRpdHNWaWV3UHJvZHVjZXIuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lU3VnZ2VzdGlvbnNWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyBzdGF0aWMgaG90ID0gY3JlYXRlSG90Q2xhc3ModGhpcyk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZ2hvc3RUZXh0cyA9IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBtb2RlbD8uZ2hvc3RUZXh0cy5yZWFkKHJlYWRlcikgPz8gW107XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YWJsaXplZEdob3N0VGV4dHM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvck9icztcblx0cHJpdmF0ZSByZWFkb25seSBfZ2hvc3RUZXh0V2lkZ2V0cztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVFZGl0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fbW9kZWwucmVhZChyZWFkZXIpPy5pbmxpbmVFZGl0U3RhdGUucmVhZChyZWFkZXIpPy5pbmxpbmVTdWdnZXN0aW9uKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZXZlckhhZElubGluZUVkaXQgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxib29sZWFuPih0aGlzLFxuXHRcdChyZWFkZXIsIGxhc3QpID0+IGxhc3QgfHwgISF0aGlzLl9pbmxpbmVFZGl0LnJlYWQocmVhZGVyKVxuXHRcdFx0fHwgISF0aGlzLl9tb2RlbC5yZWFkKHJlYWRlcik/LmlubGluZUNvbXBsZXRpb25TdGF0ZS5yZWFkKHJlYWRlcik/LmlubGluZVN1Z2dlc3Rpb24/LnNob3dJbmxpbmVFZGl0TWVudVxuXHQpO1xuXG5cdC8vIFRvIGJyZWFrIGEgY3ljbGljIGRlcGVuZGVuY3lcblx0cHJpdmF0ZSByZWFkb25seSBfaW5kaWNhdG9ySXNIb3ZlclZpc2libGUgPSBvYnNlcnZhYmxlVmFsdWU8SU9ic2VydmFibGU8Ym9vbGVhbj4gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2hvd0lubGluZUVkaXRDb2xsYXBzZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgcyA9IHRoaXMuX21vZGVsLnJlYWQocmVhZGVyKT8uc2hvd0NvbGxhcHNlZC5yZWFkKHJlYWRlcikgPz8gZmFsc2U7XG5cdFx0cmV0dXJuIHMgJiYgIXRoaXMuX2luZGljYXRvcklzSG92ZXJWaXNpYmxlLnJlYWQocmVhZGVyKT8ucmVhZChyZWFkZXIpO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVFZGl0V2lkZ2V0ID0gZGVyaXZlZERpc3Bvc2FibGUocmVhZGVyID0+IHtcblx0XHRpZiAoIXRoaXMuX2V2ZXJIYWRJbmxpbmVFZGl0LnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUVkaXRzVmlld0FuZERpZmZQcm9kdWNlciwgdGhpcy5fZWRpdG9yLCB0aGlzLl9tb2RlbCwgdGhpcy5fc2hvd0lubGluZUVkaXRDb2xsYXBzZWQpO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mb250RmFtaWx5O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElPYnNlcnZhYmxlPElubGluZUNvbXBsZXRpb25zTW9kZWwgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZvY3VzSXNJbk1lbnU6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9zdGFibGl6ZWRHaG9zdFRleHRzID0gY29udmVydEl0ZW1zVG9TdGFibGVPYnNlcnZhYmxlcyh0aGlzLl9naG9zdFRleHRzLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fZWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fZWRpdG9yKTtcblxuXHRcdHRoaXMuX2dob3N0VGV4dFdpZGdldHMgPSBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQoXG5cdFx0XHR0aGlzLFxuXHRcdFx0dGhpcy5fc3RhYmxpemVkR2hvc3RUZXh0cyxcblx0XHRcdChnaG9zdFRleHQsIHN0b3JlKSA9PiBzdG9yZS5hZGQodGhpcy5fY3JlYXRlR2hvc3RUZXh0KGdob3N0VGV4dCkpXG5cdFx0KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9pbmxpbmVFZGl0V2lkZ2V0LnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX2ZvbnRGYW1pbHkgPSB0aGlzLl9lZGl0b3JPYnMuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0KS5tYXAodmFsID0+IHZhbC5mb250RmFtaWx5KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZVN0eWxlU2hlZXRGcm9tT2JzZXJ2YWJsZShkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBmb250RmFtaWx5ID0gdGhpcy5fZm9udEZhbWlseS5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gYFxuLm1vbmFjby1lZGl0b3IgLmdob3N0LXRleHQtZGVjb3JhdGlvbixcbi5tb25hY28tZWRpdG9yIC5naG9zdC10ZXh0LWRlY29yYXRpb24tcHJldmlldyxcbi5tb25hY28tZWRpdG9yIC5naG9zdC10ZXh0IHtcblx0Zm9udC1mYW1pbHk6ICR7Zm9udEZhbWlseX07XG59YDtcblx0XHR9KSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IElubGluZUNvbXBsZXRpb25zSGludHNXaWRnZXQodGhpcy5fZWRpdG9yLCB0aGlzLl9tb2RlbCwgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblxuXHRcdHRoaXMuX2luZGljYXRvciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0SW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3IsXG5cdFx0XHR0aGlzLl9lZGl0b3JPYnMsXG5cdFx0XHRkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHMgPSB0aGlzLl9ndXR0ZXJJbmRpY2F0b3JTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghcykgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdHJldHVybiBuZXcgSW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3JEYXRhKFxuXHRcdFx0XHRcdElubGluZVN1Z2dlc3Rpb25HdXR0ZXJNZW51RGF0YS5mcm9tSW5saW5lU3VnZ2VzdGlvbihzLmlubGluZVN1Z2dlc3Rpb24pLFxuXHRcdFx0XHRcdHMuZGlzcGxheVJhbmdlLFxuXHRcdFx0XHRcdFNpbXBsZUlubGluZVN1Z2dlc3RNb2RlbC5mcm9tSW5saW5lQ29tcGxldGlvbk1vZGVsKHMubW9kZWwpLFxuXHRcdFx0XHRcdHMuaW5saW5lU3VnZ2VzdGlvbi5hY3Rpb24/LmtpbmQgPT09ICdlZGl0JyA/IHMuaW5saW5lU3VnZ2VzdGlvbi5hY3Rpb24uYWx0ZXJuYXRpdmVBY3Rpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KSxcblx0XHRcdHRoaXMuX2d1dHRlckluZGljYXRvclN0YXRlLm1hcCgocywgcmVhZGVyKSA9PiBzPy50YWJBY3Rpb24/LnJlYWQocmVhZGVyKSA/PyBJbmxpbmVFZGl0VGFiQWN0aW9uLkluYWN0aXZlKSxcblx0XHRcdHRoaXMuX2d1dHRlckluZGljYXRvclN0YXRlLm1hcCgocywgcmVhZGVyKSA9PiBzPy5ndXR0ZXJJbmRpY2F0b3JPZmZzZXQ/LnJlYWQocmVhZGVyKSA/PyAwKSxcblx0XHRcdHRoaXMuX2lubGluZUVkaXRXaWRnZXQubWFwKCh3LCByZWFkZXIpID0+IHc/LnZpZXcuaW5saW5lRWRpdHNJc0hvdmVyZWQucmVhZChyZWFkZXIpID8/IGZhbHNlKSxcblx0XHRcdHRoaXMuX2ZvY3VzSXNJbk1lbnUsXG5cdFx0KSk7XG5cdFx0dGhpcy5faW5kaWNhdG9ySXNIb3ZlclZpc2libGUuc2V0KHRoaXMuX2luZGljYXRvci5pc0hvdmVyVmlzaWJsZSwgdW5kZWZpbmVkKTtcblxuXHRcdGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHcgPSB0aGlzLl9pbmxpbmVFZGl0V2lkZ2V0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghdykgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRyZXR1cm4gcmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0SW5saW5lRWRpdHNPbmJvYXJkaW5nRXhwZXJpZW5jZSxcblx0XHRcdFx0dy5faW5saW5lRWRpdE1vZGVsLFxuXHRcdFx0XHRjb25zdE9ic2VydmFibGUodGhpcy5faW5kaWNhdG9yKSxcblx0XHRcdFx0dy52aWV3Ll9pbmxpbmVDb2xsYXBzZWRWaWV3LFxuXHRcdFx0KSk7XG5cdFx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlR2hvc3RUZXh0KGdob3N0VGV4dDogSU9ic2VydmFibGU8R2hvc3RUZXh0T3JSZXBsYWNlbWVudD4pOiBHaG9zdFRleHRWaWV3IHtcblx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRHaG9zdFRleHRWaWV3LFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0ZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgaW5saW5lQ29tcGxldGlvbiA9IG1vZGVsPy5pbmxpbmVDb21wbGV0aW9uU3RhdGUucmVhZChyZWFkZXIpPy5pbmxpbmVTdWdnZXN0aW9uO1xuXHRcdFx0XHRpZiAoIW1vZGVsIHx8ICFpbmxpbmVDb21wbGV0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gZWRpdG9yLnN1Z2dlc3QucHJldmlldzogdHJ1ZSBjYXVzZXMgc2l0dWF0aW9ucyB3aGVyZSB3ZSBoYXZlIGdob3N0IHRleHQsIGJ1dCBubyBzdWdnZXN0IHByZXZpZXcuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGdob3N0VGV4dDogZ2hvc3RUZXh0LnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdGhhbmRsZUlubGluZUNvbXBsZXRpb25TaG93bjogKCkgPT4geyAvKiBuby1vcCAqLyB9LFxuXHRcdFx0XHRcdFx0d2FybmluZzogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRnaG9zdFRleHQ6IGdob3N0VGV4dC5yZWFkKHJlYWRlciksXG5cdFx0XHRcdFx0aGFuZGxlSW5saW5lQ29tcGxldGlvblNob3duOiAodmlld0RhdGEpID0+IG1vZGVsLmhhbmRsZUlubGluZVN1Z2dlc3Rpb25TaG93bihpbmxpbmVDb21wbGV0aW9uLCBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuR2hvc3RUZXh0LCB2aWV3RGF0YSwgRGF0ZS5ub3coKSksXG5cdFx0XHRcdFx0d2FybmluZzogR2hvc3RUZXh0V2lkZ2V0V2FybmluZy5mcm9tKG1vZGVsPy53YXJuaW5nLnJlYWQocmVhZGVyKSksXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElHaG9zdFRleHRXaWRnZXREYXRhO1xuXHRcdFx0fSksXG5cdFx0XHR7XG5cdFx0XHRcdHVzZVN5bnRheEhpZ2hsaWdodGluZzogdGhpcy5fZWRpdG9yT2JzLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCkubWFwKHYgPT4gdi5zeW50YXhIaWdobGlnaHRpbmdFbmFibGVkKSxcblx0XHRcdFx0aGlnaGxpZ2h0U2hvcnRTdWdnZXN0aW9uczogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzaG91bGRTaG93SG92ZXJBdFZpZXdab25lKHZpZXdab25lSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9naG9zdFRleHRXaWRnZXRzLmdldCgpWzBdPy5vd25zVmlld1pvbmUodmlld1pvbmVJZCkgPz8gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ndXR0ZXJJbmRpY2F0b3JTdGF0ZSA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gbW9kZWwuc3RhdGUucmVhZChyZWFkZXIpO1xuXG5cdFx0aWYgKHN0YXRlPy5raW5kID09PSAnZ2hvc3RUZXh0JyAmJiBzdGF0ZS5pbmxpbmVTdWdnZXN0aW9uPy5zaG93SW5saW5lRWRpdE1lbnUpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlSYW5nZTogTGluZVJhbmdlLm9mTGVuZ3RoKHN0YXRlLnByaW1hcnlHaG9zdFRleHQubGluZU51bWJlciwgMSksXG5cdFx0XHRcdHRhYkFjdGlvbjogZGVyaXZlZDxJbmxpbmVFZGl0VGFiQWN0aW9uPih0aGlzLFxuXHRcdFx0XHRcdHJlYWRlciA9PiB0aGlzLl9lZGl0b3JPYnMuaXNGb2N1c2VkLnJlYWQocmVhZGVyKSA/IElubGluZUVkaXRUYWJBY3Rpb24uQWNjZXB0IDogSW5saW5lRWRpdFRhYkFjdGlvbi5JbmFjdGl2ZVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRndXR0ZXJJbmRpY2F0b3JPZmZzZXQ6IGNvbnN0T2JzZXJ2YWJsZShnZXRHaG9zdFRleHRUb3BPZmZzZXQoc3RhdGUuaW5saW5lU3VnZ2VzdGlvbiwgdGhpcy5fZWRpdG9yKSksXG5cdFx0XHRcdGlubGluZVN1Z2dlc3Rpb246IHN0YXRlLmlubGluZVN1Z2dlc3Rpb24sXG5cdFx0XHRcdG1vZGVsLFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKHN0YXRlPy5raW5kID09PSAnaW5saW5lRWRpdCcpIHtcblx0XHRcdGNvbnN0IGlubGluZUVkaXRXaWRnZXQgPSB0aGlzLl9pbmxpbmVFZGl0V2lkZ2V0LnJlYWQocmVhZGVyKT8udmlldztcblx0XHRcdGlmICghaW5saW5lRWRpdFdpZGdldCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRcdGNvbnN0IGRpc3BsYXlSYW5nZSA9IGlubGluZUVkaXRXaWRnZXQuZGlzcGxheVJhbmdlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZGlzcGxheVJhbmdlKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3BsYXlSYW5nZSxcblx0XHRcdFx0dGFiQWN0aW9uOiBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2VkaXRvck9icy5pc0ZvY3VzZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0XHRpZiAobW9kZWwudGFiU2hvdWxkSnVtcFRvSW5saW5lRWRpdC5yZWFkKHJlYWRlcikpIHsgcmV0dXJuIElubGluZUVkaXRUYWJBY3Rpb24uSnVtcDsgfVxuXHRcdFx0XHRcdFx0aWYgKG1vZGVsLnRhYlNob3VsZEFjY2VwdElubGluZUVkaXQucmVhZChyZWFkZXIpKSB7IHJldHVybiBJbmxpbmVFZGl0VGFiQWN0aW9uLkFjY2VwdDsgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gSW5saW5lRWRpdFRhYkFjdGlvbi5JbmFjdGl2ZTtcblx0XHRcdFx0fSksXG5cdFx0XHRcdGd1dHRlckluZGljYXRvck9mZnNldDogaW5saW5lRWRpdFdpZGdldC5ndXR0ZXJJbmRpY2F0b3JPZmZzZXQsXG5cdFx0XHRcdGlubGluZVN1Z2dlc3Rpb246IHN0YXRlLmlubGluZVN1Z2dlc3Rpb24sXG5cdFx0XHRcdG1vZGVsLFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfaW5kaWNhdG9yO1xufVxuXG5mdW5jdGlvbiBnZXRHaG9zdFRleHRUb3BPZmZzZXQoaW5saW5lQ29tcGxldGlvbjogSW5saW5lQ29tcGxldGlvbkl0ZW0sIGVkaXRvcjogSUNvZGVFZGl0b3IpOiBudW1iZXIge1xuXHRjb25zdCByZXBsYWNlbWVudCA9IGlubGluZUNvbXBsZXRpb24uZ2V0U2luZ2xlVGV4dEVkaXQoKTtcblx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdGlmICghdGV4dE1vZGVsKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRjb25zdCBFT0wgPSB0ZXh0TW9kZWwuZ2V0RU9MKCk7XG5cdGlmIChyZXBsYWNlbWVudC5yYW5nZS5pc0VtcHR5KCkgJiYgcmVwbGFjZW1lbnQudGV4dC5zdGFydHNXaXRoKEVPTCkpIHtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihyZXBsYWNlbWVudC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdHJldHVybiBjb3VudFByZWZpeFJlcGVhdHMocmVwbGFjZW1lbnQudGV4dCwgRU9MKSAqIGxpbmVIZWlnaHQ7XG5cdH1cblxuXHRyZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gY291bnRQcmVmaXhSZXBlYXRzKHN0cjogc3RyaW5nLCBwcmVmaXg6IHN0cmluZyk6IG51bWJlciB7XG5cdGlmICghcHJlZml4Lmxlbmd0aCkge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cdGxldCBjb3VudCA9IDA7XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKHN0ci5zdGFydHNXaXRoKHByZWZpeCwgaSkpIHtcblx0XHRjb3VudCsrO1xuXHRcdGkgKz0gcHJlZml4Lmxlbmd0aDtcblx0fVxuXHRyZXR1cm4gY291bnQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUywwQkFBMEIsbUJBQW1CLDRCQUE4RCxpQkFBaUIsdUJBQXVCO0FBQ3JLLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0JBQW9C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
