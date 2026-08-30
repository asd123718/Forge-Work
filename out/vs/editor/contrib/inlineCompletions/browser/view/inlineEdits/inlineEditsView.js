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
import { $ } from "../../../../../../base/browser/dom.js";
import { equals } from "../../../../../../base/common/equals.js";
import { BugIndicatingError, onUnexpectedError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, derived, derivedOpts, mapObservableArrayCached, observableValue } from "../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { observableCodeEditor } from "../../../../../browser/observableCodeEditor.js";
import { EditorOption } from "../../../../../common/config/editorOptions.js";
import { TextReplacement } from "../../../../../common/core/edits/textEdit.js";
import { Range } from "../../../../../common/core/range.js";
import { LineRange } from "../../../../../common/core/ranges/lineRange.js";
import { StringText } from "../../../../../common/core/text/abstractText.js";
import { TextLength } from "../../../../../common/core/text/textLength.js";
import { lineRangeMappingFromRangeMappings, RangeMapping } from "../../../../../common/diff/rangeMapping.js";
import { TextModel } from "../../../../../common/model/textModel.js";
import { InlineCompletionViewData, InlineCompletionViewKind, InlineEditTabAction } from "./inlineEditsViewInterface.js";
import { InlineEditsCollapsedView } from "./inlineEditsViews/inlineEditsCollapsedView.js";
import { InlineEditsCustomView } from "./inlineEditsViews/inlineEditsCustomView.js";
import { InlineEditsDeletionView } from "./inlineEditsViews/inlineEditsDeletionView.js";
import { InlineEditsInsertionView } from "./inlineEditsViews/inlineEditsInsertionView.js";
import { InlineEditsLineReplacementView } from "./inlineEditsViews/inlineEditsLineReplacementView.js";
import { InlineEditsLongDistanceHint } from "./inlineEditsViews/longDistanceHint/inlineEditsLongDistanceHint.js";
import { InlineEditsSideBySideView } from "./inlineEditsViews/inlineEditsSideBySideView.js";
import { InlineEditsWordReplacementView, WordReplacementsViewData } from "./inlineEditsViews/inlineEditsWordReplacementView.js";
import { OriginalEditorInlineDiffView } from "./inlineEditsViews/originalEditorInlineDiffView.js";
import { applyEditToModifiedRangeMappings, createReindentEdit } from "./utils/utils.js";
import "./view.css";
import { JumpToView } from "./inlineEditsViews/jumpToView.js";
import { StringEdit } from "../../../../../common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../../../common/core/ranges/offsetRange.js";
import { getPositionOffsetTransformerFromTextModel } from "../../../../../common/core/text/getPositionOffsetTransformerFromTextModel.js";
import { InlineCompletionEditorType } from "../../model/provideInlineCompletions.js";
let InlineEditsView = class extends Disposable {
  constructor(_editor, _model, _simpleModel, _inlineSuggestInfo, _showCollapsed, _instantiationService) {
    super();
    this._editor = _editor;
    this._model = _model;
    this._simpleModel = _simpleModel;
    this._inlineSuggestInfo = _inlineSuggestInfo;
    this._showCollapsed = _showCollapsed;
    this._instantiationService = _instantiationService;
    this._tabAction = derived((reader) => this._model.read(reader)?.tabAction.read(reader) ?? InlineEditTabAction.Inactive);
    this.displayRange = derived(this, (reader) => {
      const state = this._uiState.read(reader);
      if (!state) {
        return void 0;
      }
      if (state.target.uri.toString() !== this._editorObs.model.read(reader)?.uri.toString()) {
        return void 0;
      }
      if (state.state?.kind === "custom") {
        const range = state.state.displayLocation?.range;
        if (!range) {
          throw new BugIndicatingError("custom view should have a range");
        }
        return new LineRange(range.startLineNumber, range.endLineNumber);
      }
      if (state.state?.kind === "insertionMultiLine") {
        return this._insertion.originalLines.read(reader);
      }
      return state.edit.displayRange;
    });
    this._currentInlineEditCache = void 0;
    this._uiState = derived(this, (reader) => {
      const model = this._model.read(reader);
      const textModel = this._editorObs.model.read(reader);
      if (!model || !textModel || !this._constructorDone.read(reader)) {
        return void 0;
      }
      const inlineEdit = model.inlineEdit;
      let diff;
      let mappings;
      let newText = void 0;
      if (inlineEdit.edit) {
        mappings = RangeMapping.fromEdit(inlineEdit.edit);
        newText = new StringText(inlineEdit.edit.apply(inlineEdit.originalText));
        diff = lineRangeMappingFromRangeMappings(mappings, inlineEdit.originalText, newText);
      } else {
        mappings = [];
        diff = [];
        newText = inlineEdit.originalText;
      }
      let state = this._determineRenderState(model, reader, diff, newText);
      if (!state) {
        onUnexpectedError(new Error(`unable to determine view: tried to render ${this._previousView?.view}`));
        return void 0;
      }
      const longDistanceHint = this._getLongDistanceHintState(model, reader);
      if (longDistanceHint && longDistanceHint.isVisible) {
        state.viewData.setLongDistanceViewData(longDistanceHint.lineNumber, inlineEdit.lineEdit.lineRange.startLineNumber);
      }
      state.viewData.isForAnotherDocument = !inlineEdit.originalText.targets(textModel);
      if (state.kind === InlineCompletionViewKind.SideBySide) {
        const indentationAdjustmentEdit = createReindentEdit(newText.getValue(), inlineEdit.modifiedLineRange, textModel.getOptions().tabSize);
        newText = new StringText(indentationAdjustmentEdit.applyToString(newText.getValue()));
        mappings = applyEditToModifiedRangeMappings(mappings, indentationAdjustmentEdit);
        diff = lineRangeMappingFromRangeMappings(mappings, inlineEdit.originalText, newText);
      }
      this._previewTextModel.setLanguage(textModel.getLanguageId());
      const previousNewText = this._previewTextModel.getValue();
      if (previousNewText !== newText.getValue()) {
        this._previewTextModel.setEOL(textModel.getEndOfLineSequence());
        const updateOldValueEdit = StringEdit.replace(new OffsetRange(0, previousNewText.length), newText.getValue());
        const updateOldValueEditSmall = updateOldValueEdit.removeCommonSuffixPrefix(previousNewText);
        const textEdit = getPositionOffsetTransformerFromTextModel(this._previewTextModel).getTextEdit(updateOldValueEditSmall);
        this._previewTextModel.edit(textEdit);
      }
      if (this._showCollapsed.read(reader)) {
        state = { kind: InlineCompletionViewKind.Collapsed, viewData: state.viewData };
      }
      model.handleInlineEditShownNextFrame(state.kind, state.viewData);
      const nextCursorPosition = inlineEdit.action?.kind === "jumpTo" ? inlineEdit.action.position : null;
      return {
        state,
        diff,
        edit: inlineEdit,
        newText: newText.getValue(),
        newTextLineCount: inlineEdit.modifiedLineRange.length,
        editorType: model.editorType,
        longDistanceHint,
        nextCursorPosition,
        target: inlineEdit.inlineCompletion.originalTextRef
      };
    });
    this.inlineEditsIsHovered = derived(this, (reader) => {
      return this._sideBySide.isHovered.read(reader) || this._wordReplacementViews.read(reader).some((v) => v.isHovered.read(reader)) || this._deletion.isHovered.read(reader) || this._inlineDiffView.isHovered.read(reader) || this._lineReplacementView.isHovered.read(reader) || this._insertion.isHovered.read(reader) || this._customView.isHovered.read(reader) || this._longDistanceHint.map((v, r) => v?.isHovered.read(r) ?? false).read(reader);
    });
    this.gutterIndicatorOffset = derived(this, (reader) => {
      if (this._uiState.read(reader)?.state?.kind === "insertionMultiLine") {
        return this._insertion.startLineOffset.read(reader);
      }
      return 0;
    });
    this._editorObs = observableCodeEditor(this._editor);
    this._constructorDone = observableValue(this, false);
    this._previewTextModel = this._register(this._instantiationService.createInstance(
      TextModel,
      "",
      this._editor.getModel().getLanguageId(),
      { ...TextModel.DEFAULT_CREATION_OPTIONS, bracketPairColorizationOptions: { enabled: true, independentColorPoolPerBracketType: false } },
      null
    ));
    this._sideBySide = this._register(this._instantiationService.createInstance(
      InlineEditsSideBySideView,
      this._editor,
      this._model.map((m) => m?.inlineEdit),
      this._previewTextModel,
      this._uiState.map((s) => s && s.state?.kind === InlineCompletionViewKind.SideBySide ? {
        newTextLineCount: s.newTextLineCount,
        editorType: s.editorType
      } : void 0),
      this._tabAction
    ));
    this._deletion = this._register(this._instantiationService.createInstance(
      InlineEditsDeletionView,
      this._editor,
      this._model.map((m) => m?.inlineEdit),
      this._uiState.map((s) => s && s.state?.kind === InlineCompletionViewKind.Deletion ? {
        originalRange: s.state.originalRange,
        deletions: s.state.deletions,
        editorType: s.editorType
      } : void 0),
      this._tabAction
    ));
    this._insertion = this._register(this._instantiationService.createInstance(
      InlineEditsInsertionView,
      this._editor,
      this._uiState.map((s) => s && s.state?.kind === InlineCompletionViewKind.InsertionMultiLine ? {
        lineNumber: s.state.lineNumber,
        startColumn: s.state.column,
        text: s.state.text,
        editorType: s.editorType
      } : void 0),
      this._tabAction
    ));
    this._inlineCollapsedView = this._register(this._instantiationService.createInstance(
      InlineEditsCollapsedView,
      this._editor,
      this._model.map((m, reader) => this._uiState.read(reader)?.state?.kind === InlineCompletionViewKind.Collapsed ? m?.inlineEdit : void 0)
    ));
    this._customView = this._register(this._instantiationService.createInstance(
      InlineEditsCustomView,
      this._editor,
      this._model.map((m, reader) => this._uiState.read(reader)?.state?.kind === InlineCompletionViewKind.Custom ? m?.displayLocation : void 0),
      this._tabAction,
      this._uiState.map((s) => s?.editorType ?? InlineCompletionEditorType.TextEditor)
    ));
    this._showLongDistanceHint = this._editorObs.getOption(EditorOption.inlineSuggest).map(this, (s) => s.edits.showLongDistanceHint);
    this._longDistanceHint = derived(this, (reader) => {
      if (!this._showLongDistanceHint.read(reader)) {
        return void 0;
      }
      return reader.store.add(this._instantiationService.createInstance(
        InlineEditsLongDistanceHint,
        this._editor,
        this._uiState.map((s, reader2) => s?.longDistanceHint ? {
          hint: s.longDistanceHint,
          newTextLineCount: s.newTextLineCount,
          edit: s.edit,
          diff: s.diff,
          editorType: s.editorType,
          model: this._simpleModel.read(reader2),
          inlineSuggestInfo: this._inlineSuggestInfo.read(reader2),
          nextCursorPosition: s.nextCursorPosition,
          target: s.target
        } : void 0),
        this._previewTextModel,
        this._tabAction
      ));
    }).recomputeInitiallyAndOnChange(this._store);
    this._inlineDiffViewState = derived(this, (reader) => {
      const e = this._uiState.read(reader);
      if (!e || !e.state) {
        return void 0;
      }
      if (e.state.kind === "wordReplacements" || e.state.kind === "insertionMultiLine" || e.state.kind === "collapsed" || e.state.kind === "custom" || e.state.kind === "jumpTo") {
        return void 0;
      }
      return {
        modifiedText: new StringText(e.newText),
        diff: e.diff,
        mode: e.state.kind,
        modifiedCodeEditor: this._sideBySide.previewEditor,
        editorType: e.editorType
      };
    });
    this._inlineDiffView = this._register(new OriginalEditorInlineDiffView(this._editor, this._inlineDiffViewState, this._previewTextModel));
    this._jumpToView = this._register(this._instantiationService.createInstance(JumpToView, this._editorObs, { style: "label" }, derived((reader) => {
      const s = this._uiState.read(reader);
      if (s?.state?.kind === InlineCompletionViewKind.JumpTo) {
        return { jumpToPosition: s.state.position };
      }
      return void 0;
    })));
    const wordReplacements = derivedOpts({
      equalsFn: equals.arrayC(equals.thisC())
    }, (reader) => {
      const s = this._uiState.read(reader);
      return s?.state?.kind === InlineCompletionViewKind.WordReplacements ? s.state.replacements.map((replacement) => new WordReplacementsViewData(replacement, s.editorType, s.state?.alternativeAction)) : [];
    });
    this._wordReplacementViews = mapObservableArrayCached(this, wordReplacements, (viewData, store) => {
      return store.add(this._instantiationService.createInstance(InlineEditsWordReplacementView, this._editorObs, viewData, this._tabAction));
    });
    this._lineReplacementView = this._register(this._instantiationService.createInstance(
      InlineEditsLineReplacementView,
      this._editorObs,
      this._uiState.map((s) => s?.state?.kind === InlineCompletionViewKind.LineReplacement ? {
        originalRange: s.state.originalRange,
        modifiedRange: s.state.modifiedRange,
        modifiedLines: s.state.modifiedLines,
        replacements: s.state.replacements
      } : void 0),
      this._uiState.map((s) => s?.editorType ?? InlineCompletionEditorType.TextEditor),
      this._tabAction
    ));
    this._useCodeShifting = this._editorObs.getOption(EditorOption.inlineSuggest).map((s) => s.edits.allowCodeShifting);
    this._renderSideBySide = this._editorObs.getOption(EditorOption.inlineSuggest).map((s) => s.edits.renderSideBySide);
    this._register(autorun((reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return;
      }
      reader.store.add(
        Event.any(
          this._sideBySide.onDidClick,
          this._lineReplacementView.onDidClick,
          this._insertion.onDidClick,
          ...this._wordReplacementViews.read(reader).map((w) => w.onDidClick),
          this._inlineDiffView.onDidClick,
          this._customView.onDidClick
        )((clickEvent) => {
          if (this._viewHasBeenShownLongerThan(350)) {
            clickEvent.event.preventDefault();
            model.accept(clickEvent.alternativeAction);
          }
        })
      );
    }));
    this._wordReplacementViews.recomputeInitiallyAndOnChange(this._store);
    const minEditorScrollHeight = derived(this, (reader) => {
      return Math.max(
        ...this._wordReplacementViews.read(reader).map((v) => v.minEditorScrollHeight.read(reader)),
        this._lineReplacementView.minEditorScrollHeight.read(reader),
        this._customView.minEditorScrollHeight.read(reader)
      );
    }).recomputeInitiallyAndOnChange(this._store);
    let viewZoneId;
    this._register(autorun((reader) => {
      const minScrollHeight = minEditorScrollHeight.read(reader);
      const textModel = this._editorObs.model.read(reader);
      if (!textModel) {
        return;
      }
      this._editor.changeViewZones((accessor) => {
        const scrollHeight = this._editor.getScrollHeight();
        const viewZoneHeight = minScrollHeight - scrollHeight + 1;
        if (viewZoneHeight !== 0 && viewZoneId !== void 0) {
          accessor.removeZone(viewZoneId);
          viewZoneId = void 0;
        }
        if (viewZoneHeight <= 0) {
          return;
        }
        viewZoneId = accessor.addZone({
          afterLineNumber: textModel.getLineCount(),
          heightInPx: viewZoneHeight,
          domNode: $("div.minScrollHeightViewZone")
        });
      });
    }));
    this._constructorDone.set(true, void 0);
  }
  _getLongDistanceHintState(model, reader) {
    if (model.inlineEdit.inlineCompletion.identity.jumpedTo.read(reader)) {
      return void 0;
    }
    if (model.inlineEdit.action === void 0) {
      return void 0;
    }
    const editorModel = this._editorObs.model.read(reader);
    if (!editorModel || !model.inlineEdit.originalText.targets(editorModel)) {
      return {
        isVisible: true,
        lineNumber: model.inlineEdit.cursorPosition.lineNumber
      };
    }
    if (this._currentInlineEditCache?.inlineSuggestionIdentity !== model.inlineEdit.inlineCompletion.identity) {
      this._currentInlineEditCache = {
        inlineSuggestionIdentity: model.inlineEdit.inlineCompletion.identity,
        firstCursorLineNumber: model.inlineEdit.cursorPosition.lineNumber
      };
    }
    return {
      lineNumber: this._currentInlineEditCache.firstCursorLineNumber,
      isVisible: !model.inViewPort.read(reader)
    };
  }
  _getCacheId(model) {
    return model.inlineEdit.inlineCompletion.identity.id;
  }
  _determineView(model, reader, diff, newText) {
    const inlineEdit = model.inlineEdit;
    const canUseCache = this._previousView?.id === this._getCacheId(model) && this._previousView?.uri.toString() === this._editorObs.model.get().uri.toString();
    const reconsiderViewEditorWidthChange = this._previousView?.editorWidth !== this._editorObs.layoutInfoWidth.read(reader) && (this._previousView?.view === InlineCompletionViewKind.SideBySide || this._previousView?.view === InlineCompletionViewKind.LineReplacement);
    if (canUseCache && !reconsiderViewEditorWidthChange) {
      return this._previousView.view;
    }
    const action = model.inlineEdit.inlineCompletion.action;
    if (action?.kind === "edit" && action.alternativeAction) {
      return InlineCompletionViewKind.WordReplacements;
    }
    const targetUri = model.inlineEdit.inlineCompletion.originalTextRef.uri;
    const currentUri = this._editorObs.model.read(reader)?.uri;
    if (currentUri && targetUri.toString() !== currentUri.toString()) {
      return InlineCompletionViewKind.Custom;
    }
    if (model.displayLocation && !model.inlineEdit.inlineCompletion.identity.jumpedTo.read(reader)) {
      return InlineCompletionViewKind.Custom;
    }
    const numOriginalLines = inlineEdit.originalLineRange.length;
    const numModifiedLines = inlineEdit.modifiedLineRange.length;
    const inner = diff.flatMap((d) => d.innerChanges ?? []);
    const isSingleInnerEdit = inner.length === 1;
    if (model.editorType !== InlineCompletionEditorType.DiffEditor) {
      if (isSingleInnerEdit && this._useCodeShifting.read(reader) !== "never" && isSingleLineInsertion(diff)) {
        if (isSingleLineInsertionAfterPosition(diff, inlineEdit.cursorPosition)) {
          return InlineCompletionViewKind.InsertionInline;
        }
        return InlineCompletionViewKind.LineReplacement;
      }
      if (isDeletion(inner, inlineEdit, newText)) {
        return InlineCompletionViewKind.Deletion;
      }
      if (isSingleMultiLineInsertion(diff) && this._useCodeShifting.read(reader) === "always") {
        return InlineCompletionViewKind.InsertionMultiLine;
      }
      const allInnerChangesNotTooLong = inner.every((m) => TextLength.ofRange(m.originalRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH && TextLength.ofRange(m.modifiedRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH);
      if (allInnerChangesNotTooLong && isSingleInnerEdit && numOriginalLines === 1 && numModifiedLines === 1) {
        const modifiedText = inner.map((m) => newText.getValueOfRange(m.modifiedRange));
        const originalText = inner.map((m) => model.inlineEdit.originalText.getValueOfRange(m.originalRange));
        if (!modifiedText.some((v) => v.includes("	")) && !originalText.some((v) => v.includes("	"))) {
          if (!inner.some((m) => m.originalRange.isEmpty()) || !growEditsUntilWhitespace(inner.map((m) => new TextReplacement(m.originalRange, "")), inlineEdit.originalText).some((e) => e.range.isEmpty() && TextLength.ofRange(e.range).columnCount < InlineEditsWordReplacementView.MAX_LENGTH)) {
            return InlineCompletionViewKind.WordReplacements;
          }
        }
      }
    }
    if (numOriginalLines > 0 && numModifiedLines > 0) {
      if (numOriginalLines === 1 && numModifiedLines === 1 && model.editorType !== InlineCompletionEditorType.DiffEditor) {
        return InlineCompletionViewKind.LineReplacement;
      }
      if (this._renderSideBySide.read(reader) !== "never" && InlineEditsSideBySideView.fitsInsideViewport(this._editor, this._previewTextModel, inlineEdit, reader)) {
        return InlineCompletionViewKind.SideBySide;
      }
      return InlineCompletionViewKind.LineReplacement;
    }
    if (model.editorType === InlineCompletionEditorType.DiffEditor) {
      if (isDeletion(inner, inlineEdit, newText)) {
        return InlineCompletionViewKind.Deletion;
      }
      if (isSingleMultiLineInsertion(diff) && this._useCodeShifting.read(reader) === "always") {
        return InlineCompletionViewKind.InsertionMultiLine;
      }
    }
    return InlineCompletionViewKind.SideBySide;
  }
  _determineRenderState(model, reader, diff, newText) {
    if (model.inlineEdit.action?.kind === "jumpTo") {
      return {
        kind: InlineCompletionViewKind.JumpTo,
        position: model.inlineEdit.action.position,
        viewData: createEmptyViewData()
      };
    }
    const inlineEdit = model.inlineEdit;
    let view = this._determineView(model, reader, diff, newText);
    if (this._willRenderAboveCursor(reader, inlineEdit, view)) {
      switch (view) {
        case InlineCompletionViewKind.LineReplacement:
        case InlineCompletionViewKind.WordReplacements:
          view = InlineCompletionViewKind.SideBySide;
          break;
      }
    }
    this._previousView = { id: this._getCacheId(model), view, editorWidth: this._editor.getLayoutInfo().width, timestamp: Date.now(), uri: this._editorObs.model.get().uri };
    const inner = diff.flatMap((d) => d.innerChanges ?? []);
    const textModel = this._editor.getModel();
    const stringChanges = inner.map((m) => ({
      originalRange: m.originalRange,
      modifiedRange: m.modifiedRange,
      original: inlineEdit.originalText.getValueOfRange(m.originalRange),
      modified: newText.getValueOfRange(m.modifiedRange)
    }));
    const viewData = getViewData(inlineEdit, stringChanges, textModel);
    switch (view) {
      case InlineCompletionViewKind.InsertionInline:
        return { kind: InlineCompletionViewKind.InsertionInline, viewData };
      case InlineCompletionViewKind.SideBySide:
        return { kind: InlineCompletionViewKind.SideBySide, viewData };
      case InlineCompletionViewKind.Collapsed:
        return { kind: InlineCompletionViewKind.Collapsed, viewData };
      case InlineCompletionViewKind.Custom:
        return { kind: InlineCompletionViewKind.Custom, displayLocation: model.displayLocation, viewData };
    }
    if (view === InlineCompletionViewKind.Deletion) {
      return {
        kind: InlineCompletionViewKind.Deletion,
        originalRange: inlineEdit.originalLineRange,
        deletions: inner.map((m) => m.originalRange),
        viewData
      };
    }
    if (view === InlineCompletionViewKind.InsertionMultiLine) {
      const change = inner[0];
      return {
        kind: InlineCompletionViewKind.InsertionMultiLine,
        lineNumber: change.originalRange.startLineNumber,
        column: change.originalRange.startColumn,
        text: newText.getValueOfRange(change.modifiedRange),
        viewData
      };
    }
    const replacements = stringChanges.map((m) => new TextReplacement(m.originalRange, m.modified));
    if (replacements.length === 0) {
      return void 0;
    }
    if (view === InlineCompletionViewKind.WordReplacements) {
      let grownEdits = growEditsToEntireWord(replacements, inlineEdit.originalText);
      if (grownEdits.some((e) => e.range.isEmpty())) {
        grownEdits = growEditsUntilWhitespace(replacements, inlineEdit.originalText);
      }
      return {
        kind: InlineCompletionViewKind.WordReplacements,
        replacements: grownEdits,
        alternativeAction: model.inlineEdit.action?.alternativeAction,
        viewData
      };
    }
    if (view === InlineCompletionViewKind.LineReplacement) {
      return {
        kind: InlineCompletionViewKind.LineReplacement,
        originalRange: inlineEdit.originalLineRange,
        modifiedRange: inlineEdit.modifiedLineRange,
        modifiedLines: inlineEdit.modifiedLineRange.mapToLineArray((line) => newText.getLineAt(line)),
        replacements: inner.map((m) => ({ originalRange: m.originalRange, modifiedRange: m.modifiedRange })),
        viewData
      };
    }
    return void 0;
  }
  _willRenderAboveCursor(reader, inlineEdit, view) {
    const useCodeShifting = this._useCodeShifting.read(reader);
    if (useCodeShifting === "always") {
      return false;
    }
    for (const cursorPosition of inlineEdit.multiCursorPositions) {
      if (view === InlineCompletionViewKind.WordReplacements && cursorPosition.lineNumber === inlineEdit.originalLineRange.startLineNumber + 1) {
        return true;
      }
      if (view === InlineCompletionViewKind.LineReplacement && cursorPosition.lineNumber >= inlineEdit.originalLineRange.endLineNumberExclusive && cursorPosition.lineNumber < inlineEdit.modifiedLineRange.endLineNumberExclusive + inlineEdit.modifiedLineRange.length) {
        return true;
      }
    }
    return false;
  }
  _viewHasBeenShownLongerThan(durationMs) {
    const viewCreationTime = this._previousView?.timestamp;
    if (!viewCreationTime) {
      throw new BugIndicatingError("viewHasBeenShownLongThan called before a view has been shown");
    }
    const currentTime = Date.now();
    return currentTime - viewCreationTime >= durationMs;
  }
};
InlineEditsView = __decorateClass([
  __decorateParam(5, IInstantiationService)
], InlineEditsView);
const createEmptyViewData = () => new InlineCompletionViewData(-1, -1, -1, -1, -1, -1, -1, true);
function getViewData(inlineEdit, stringChanges, textModel) {
  if (!inlineEdit.edit) {
    return createEmptyViewData();
  }
  const cursorPosition = inlineEdit.cursorPosition;
  const startsWithEOL = stringChanges.length === 0 ? false : stringChanges[0].modified.startsWith(textModel.getEOL());
  const viewData = new InlineCompletionViewData(
    inlineEdit.edit.replacements.length === 0 ? 0 : inlineEdit.edit.replacements[0].range.getStartPosition().column - cursorPosition.column,
    inlineEdit.lineEdit.lineRange.startLineNumber - cursorPosition.lineNumber + (startsWithEOL && inlineEdit.lineEdit.lineRange.startLineNumber >= cursorPosition.lineNumber ? 1 : 0),
    inlineEdit.lineEdit.lineRange.length,
    inlineEdit.lineEdit.newLines.length,
    stringChanges.reduce((acc, r) => acc + r.original.length, 0),
    stringChanges.reduce((acc, r) => acc + r.modified.length, 0),
    stringChanges.length,
    stringChanges.every((r) => r.original === stringChanges[0].original && r.modified === stringChanges[0].modified)
  );
  return viewData;
}
function isSingleLineInsertion(diff) {
  return diff.every((m) => m.innerChanges.every((r) => isWordInsertion(r)));
  function isWordInsertion(r) {
    if (!r.originalRange.isEmpty()) {
      return false;
    }
    const isInsertionWithinLine = r.modifiedRange.startLineNumber === r.modifiedRange.endLineNumber;
    if (!isInsertionWithinLine) {
      return false;
    }
    return true;
  }
}
function isSingleLineInsertionAfterPosition(diff, position) {
  if (!position) {
    return false;
  }
  if (!isSingleLineInsertion(diff)) {
    return false;
  }
  const pos = position;
  return diff.every((m) => m.innerChanges.every((r) => isStableWordInsertion(r)));
  function isStableWordInsertion(r) {
    const insertPosition = r.originalRange.getStartPosition();
    if (pos.isBeforeOrEqual(insertPosition)) {
      return true;
    }
    if (insertPosition.lineNumber < pos.lineNumber) {
      return true;
    }
    return false;
  }
}
function isSingleMultiLineInsertion(diff) {
  const inner = diff.flatMap((d) => d.innerChanges ?? []);
  if (inner.length !== 1) {
    return false;
  }
  const change = inner[0];
  if (!change.originalRange.isEmpty()) {
    return false;
  }
  if (change.modifiedRange.startLineNumber === change.modifiedRange.endLineNumber) {
    return false;
  }
  return true;
}
function isDeletion(inner, inlineEdit, newText) {
  const innerValues = inner.map((m) => ({ original: inlineEdit.originalText.getValueOfRange(m.originalRange), modified: newText.getValueOfRange(m.modifiedRange) }));
  return innerValues.every(({ original, modified }) => modified.trim() === "" && original.length > 0 && (original.length > modified.length || original.trim() !== ""));
}
function growEditsToEntireWord(replacements, originalText) {
  return _growEdits(replacements, originalText, (char) => /^[a-zA-Z]$/.test(char));
}
function growEditsUntilWhitespace(replacements, originalText) {
  return _growEdits(replacements, originalText, (char) => !/^\s$/.test(char));
}
function _growEdits(replacements, originalText, fn) {
  const result = [];
  replacements.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
  for (const edit of replacements) {
    let startIndex = edit.range.startColumn - 1;
    let endIndex = edit.range.endColumn - 2;
    let prefix = "";
    let suffix = "";
    const startLineContent = originalText.getLineAt(edit.range.startLineNumber);
    const endLineContent = originalText.getLineAt(edit.range.endLineNumber);
    if (isIncluded(startLineContent[startIndex])) {
      while (isIncluded(startLineContent[startIndex - 1])) {
        prefix = startLineContent[startIndex - 1] + prefix;
        startIndex--;
      }
    }
    if (isIncluded(endLineContent[endIndex]) || endIndex < startIndex) {
      while (isIncluded(endLineContent[endIndex + 1])) {
        suffix += endLineContent[endIndex + 1];
        endIndex++;
      }
    }
    let newEdit = new TextReplacement(new Range(edit.range.startLineNumber, startIndex + 1, edit.range.endLineNumber, endIndex + 2), prefix + edit.text + suffix);
    if (result.length > 0 && Range.areIntersectingOrTouching(result[result.length - 1].range, newEdit.range)) {
      newEdit = TextReplacement.joinReplacements([result.pop(), newEdit], originalText);
    }
    result.push(newEdit);
  }
  function isIncluded(c) {
    if (c === void 0) {
      return false;
    }
    return fn(c);
  }
  return result;
}
export {
  InlineEditsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxpbmxpbmVFZGl0c1xcaW5saW5lRWRpdHNWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgbWFwT2JzZXJ2YWJsZUFycmF5Q2FjaGVkLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUNvZGVFZGl0b3IsIG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgVGV4dFJlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUZXh0LCBTdHJpbmdUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvdGV4dC9hYnN0cmFjdFRleHQuanMnO1xuaW1wb3J0IHsgVGV4dExlbmd0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3RleHQvdGV4dExlbmd0aC5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcsIGxpbmVSYW5nZU1hcHBpbmdGcm9tUmFuZ2VNYXBwaW5ncywgUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHkgfSBmcm9tICcuLi8uLi9tb2RlbC9pbmxpbmVTdWdnZXN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0aW9uR3V0dGVyTWVudURhdGEsIFNpbXBsZUlubGluZVN1Z2dlc3RNb2RlbCB9IGZyb20gJy4vY29tcG9uZW50cy9ndXR0ZXJJbmRpY2F0b3JWaWV3LmpzJztcbmltcG9ydCB7IElubGluZUVkaXRXaXRoQ2hhbmdlcyB9IGZyb20gJy4vaW5saW5lRWRpdFdpdGhDaGFuZ2VzLmpzJztcbmltcG9ydCB7IE1vZGVsUGVySW5saW5lRWRpdCB9IGZyb20gJy4vaW5saW5lRWRpdHNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uVmlld0RhdGEsIElubGluZUNvbXBsZXRpb25WaWV3S2luZCwgSW5saW5lRWRpdFRhYkFjdGlvbiB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3SW50ZXJmYWNlLmpzJztcbmltcG9ydCB7IElubGluZUVkaXRzQ29sbGFwc2VkVmlldyB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3cy9pbmxpbmVFZGl0c0NvbGxhcHNlZFZpZXcuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdHNDdXN0b21WaWV3IH0gZnJvbSAnLi9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzQ3VzdG9tVmlldy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0c0RlbGV0aW9uVmlldyB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3cy9pbmxpbmVFZGl0c0RlbGV0aW9uVmlldy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0c0luc2VydGlvblZpZXcgfSBmcm9tICcuL2lubGluZUVkaXRzVmlld3MvaW5saW5lRWRpdHNJbnNlcnRpb25WaWV3LmpzJztcbmltcG9ydCB7IElubGluZUVkaXRzTGluZVJlcGxhY2VtZW50VmlldyB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3cy9pbmxpbmVFZGl0c0xpbmVSZXBsYWNlbWVudFZpZXcuanMnO1xuaW1wb3J0IHsgSUxvbmdEaXN0YW5jZUhpbnQsIElMb25nRGlzdGFuY2VWaWV3U3RhdGUsIElubGluZUVkaXRzTG9uZ0Rpc3RhbmNlSGludCB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3cy9sb25nRGlzdGFuY2VIaW50L2lubGluZUVkaXRzTG9uZ0Rpc3RhbmNlSGludC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0c1NpZGVCeVNpZGVWaWV3IH0gZnJvbSAnLi9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzU2lkZUJ5U2lkZVZpZXcuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdHNXb3JkUmVwbGFjZW1lbnRWaWV3LCBXb3JkUmVwbGFjZW1lbnRzVmlld0RhdGEgfSBmcm9tICcuL2lubGluZUVkaXRzVmlld3MvaW5saW5lRWRpdHNXb3JkUmVwbGFjZW1lbnRWaWV3LmpzJztcbmltcG9ydCB7IElPcmlnaW5hbEVkaXRvcklubGluZURpZmZWaWV3U3RhdGUsIE9yaWdpbmFsRWRpdG9ySW5saW5lRGlmZlZpZXcgfSBmcm9tICcuL2lubGluZUVkaXRzVmlld3Mvb3JpZ2luYWxFZGl0b3JJbmxpbmVEaWZmVmlldy5qcyc7XG5pbXBvcnQgeyBhcHBseUVkaXRUb01vZGlmaWVkUmFuZ2VNYXBwaW5ncywgY3JlYXRlUmVpbmRlbnRFZGl0IH0gZnJvbSAnLi91dGlscy91dGlscy5qcyc7XG5pbXBvcnQgJy4vdmlldy5jc3MnO1xuaW1wb3J0IHsgSnVtcFRvVmlldyB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3cy9qdW1wVG9WaWV3LmpzJztcbmltcG9ydCB7IFN0cmluZ0VkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy9zdHJpbmdFZGl0LmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IGdldFBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXJGcm9tVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvdGV4dC9nZXRQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyRnJvbVRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZSB9IGZyb20gJy4uLy4uL21vZGVsL3Byb3ZpZGVJbmxpbmVDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uL21vZGVsL3RleHRNb2RlbFZhbHVlUmVmZXJlbmNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVFZGl0c1ZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yT2JzOiBPYnNlcnZhYmxlQ29kZUVkaXRvcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91c2VDb2RlU2hpZnRpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlclNpZGVCeVNpZGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RhYkFjdGlvbiA9IGRlcml2ZWQ8SW5saW5lRWRpdFRhYkFjdGlvbj4ocmVhZGVyID0+IHRoaXMuX21vZGVsLnJlYWQocmVhZGVyKT8udGFiQWN0aW9uLnJlYWQocmVhZGVyKSA/PyBJbmxpbmVFZGl0VGFiQWN0aW9uLkluYWN0aXZlKTtcblxuXHRwcml2YXRlIF9wcmV2aW91c1ZpZXc6IHsgLy8gVE9ETywgbW92ZSBpbnRvIGlkZW50aXR5XG5cdFx0aWQ6IHN0cmluZztcblx0XHR2aWV3OiBSZXR1cm5UeXBlPHR5cGVvZiBJbmxpbmVFZGl0c1ZpZXcucHJvdG90eXBlLl9kZXRlcm1pbmVWaWV3Pjtcblx0XHRlZGl0b3JXaWR0aDogbnVtYmVyO1xuXHRcdHRpbWVzdGFtcDogbnVtYmVyO1xuXHRcdHVyaTogVVJJO1xuXHR9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG93TG9uZ0Rpc3RhbmNlSGludDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSU9ic2VydmFibGU8TW9kZWxQZXJJbmxpbmVFZGl0IHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zaW1wbGVNb2RlbDogSU9ic2VydmFibGU8U2ltcGxlSW5saW5lU3VnZ2VzdE1vZGVsIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVTdWdnZXN0SW5mbzogSU9ic2VydmFibGU8SW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zaG93Q29sbGFwc2VkOiBJT2JzZXJ2YWJsZTxib29sZWFuPixcblxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2VkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX2VkaXRvcik7XG5cdFx0dGhpcy5fY29uc3RydWN0b3JEb25lID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblxuXHRcdHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFRleHRNb2RlbCxcblx0XHRcdCcnLFxuXHRcdFx0dGhpcy5fZWRpdG9yLmdldE1vZGVsKCkhLmdldExhbmd1YWdlSWQoKSxcblx0XHRcdHsgLi4uVGV4dE1vZGVsLkRFRkFVTFRfQ1JFQVRJT05fT1BUSU9OUywgYnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zOiB7IGVuYWJsZWQ6IHRydWUsIGluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGU6IGZhbHNlIH0gfSxcblx0XHRcdG51bGxcblx0XHQpKTtcblxuXHRcdHRoaXMuX3NpZGVCeVNpZGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVFZGl0c1NpZGVCeVNpZGVWaWV3LFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0dGhpcy5fbW9kZWwubWFwKG0gPT4gbT8uaW5saW5lRWRpdCksXG5cdFx0XHR0aGlzLl9wcmV2aWV3VGV4dE1vZGVsLFxuXHRcdFx0dGhpcy5fdWlTdGF0ZS5tYXAocyA9PiBzICYmIHMuc3RhdGU/LmtpbmQgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5TaWRlQnlTaWRlID8gKHtcblx0XHRcdFx0bmV3VGV4dExpbmVDb3VudDogcy5uZXdUZXh0TGluZUNvdW50LFxuXHRcdFx0XHRlZGl0b3JUeXBlOiBzLmVkaXRvclR5cGUsXG5cdFx0XHR9KSA6IHVuZGVmaW5lZCksXG5cdFx0XHR0aGlzLl90YWJBY3Rpb24sXG5cdFx0KSk7XG5cdFx0dGhpcy5fZGVsZXRpb24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVFZGl0c0RlbGV0aW9uVmlldyxcblx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdHRoaXMuX21vZGVsLm1hcChtID0+IG0/LmlubGluZUVkaXQpLFxuXHRcdFx0dGhpcy5fdWlTdGF0ZS5tYXAocyA9PiBzICYmIHMuc3RhdGU/LmtpbmQgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5EZWxldGlvbiA/ICh7XG5cdFx0XHRcdG9yaWdpbmFsUmFuZ2U6IHMuc3RhdGUub3JpZ2luYWxSYW5nZSxcblx0XHRcdFx0ZGVsZXRpb25zOiBzLnN0YXRlLmRlbGV0aW9ucyxcblx0XHRcdFx0ZWRpdG9yVHlwZTogcy5lZGl0b3JUeXBlLFxuXHRcdFx0fSkgOiB1bmRlZmluZWQpLFxuXHRcdFx0dGhpcy5fdGFiQWN0aW9uLFxuXHRcdCkpO1xuXHRcdHRoaXMuX2luc2VydGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUVkaXRzSW5zZXJ0aW9uVmlldyxcblx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdHRoaXMuX3VpU3RhdGUubWFwKHMgPT4gcyAmJiBzLnN0YXRlPy5raW5kID09PSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuSW5zZXJ0aW9uTXVsdGlMaW5lID8gKHtcblx0XHRcdFx0bGluZU51bWJlcjogcy5zdGF0ZS5saW5lTnVtYmVyLFxuXHRcdFx0XHRzdGFydENvbHVtbjogcy5zdGF0ZS5jb2x1bW4sXG5cdFx0XHRcdHRleHQ6IHMuc3RhdGUudGV4dCxcblx0XHRcdFx0ZWRpdG9yVHlwZTogcy5lZGl0b3JUeXBlLFxuXHRcdFx0fSkgOiB1bmRlZmluZWQpLFxuXHRcdFx0dGhpcy5fdGFiQWN0aW9uLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5faW5saW5lQ29sbGFwc2VkVmlldyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUVkaXRzQ29sbGFwc2VkVmlldyxcblx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdHRoaXMuX21vZGVsLm1hcCgobSwgcmVhZGVyKSA9PiB0aGlzLl91aVN0YXRlLnJlYWQocmVhZGVyKT8uc3RhdGU/LmtpbmQgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Db2xsYXBzZWQgPyBtPy5pbmxpbmVFZGl0IDogdW5kZWZpbmVkKVxuXHRcdCkpO1xuXHRcdHRoaXMuX2N1c3RvbVZpZXcgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVFZGl0c0N1c3RvbVZpZXcsXG5cdFx0XHR0aGlzLl9lZGl0b3IsXG5cdFx0XHR0aGlzLl9tb2RlbC5tYXAoKG0sIHJlYWRlcikgPT4gdGhpcy5fdWlTdGF0ZS5yZWFkKHJlYWRlcik/LnN0YXRlPy5raW5kID09PSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuQ3VzdG9tID8gbT8uZGlzcGxheUxvY2F0aW9uIDogdW5kZWZpbmVkKSxcblx0XHRcdHRoaXMuX3RhYkFjdGlvbixcblx0XHRcdHRoaXMuX3VpU3RhdGUubWFwKHMgPT4gcz8uZWRpdG9yVHlwZSA/PyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5UZXh0RWRpdG9yKSxcblx0XHQpKTtcblxuXHRcdHRoaXMuX3Nob3dMb25nRGlzdGFuY2VIaW50ID0gdGhpcy5fZWRpdG9yT2JzLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCkubWFwKHRoaXMsIHMgPT4gcy5lZGl0cy5zaG93TG9uZ0Rpc3RhbmNlSGludCk7XG5cdFx0dGhpcy5fbG9uZ0Rpc3RhbmNlSGludCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGlmICghdGhpcy5fc2hvd0xvbmdEaXN0YW5jZUhpbnQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVhZGVyLnN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVFZGl0c0xvbmdEaXN0YW5jZUhpbnQsXG5cdFx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdFx0dGhpcy5fdWlTdGF0ZS5tYXA8SUxvbmdEaXN0YW5jZVZpZXdTdGF0ZSB8IHVuZGVmaW5lZD4oKHMsIHJlYWRlcikgPT4gcz8ubG9uZ0Rpc3RhbmNlSGludCA/ICh7XG5cdFx0XHRcdFx0aGludDogcy5sb25nRGlzdGFuY2VIaW50LFxuXHRcdFx0XHRcdG5ld1RleHRMaW5lQ291bnQ6IHMubmV3VGV4dExpbmVDb3VudCxcblx0XHRcdFx0XHRlZGl0OiBzLmVkaXQsXG5cdFx0XHRcdFx0ZGlmZjogcy5kaWZmLFxuXHRcdFx0XHRcdGVkaXRvclR5cGU6IHMuZWRpdG9yVHlwZSxcblx0XHRcdFx0XHRtb2RlbDogdGhpcy5fc2ltcGxlTW9kZWwucmVhZChyZWFkZXIpISxcblx0XHRcdFx0XHRpbmxpbmVTdWdnZXN0SW5mbzogdGhpcy5faW5saW5lU3VnZ2VzdEluZm8ucmVhZChyZWFkZXIpISxcblx0XHRcdFx0XHRuZXh0Q3Vyc29yUG9zaXRpb246IHMubmV4dEN1cnNvclBvc2l0aW9uLFxuXHRcdFx0XHRcdHRhcmdldDogcy50YXJnZXQsXG5cdFx0XHRcdH0pIDogdW5kZWZpbmVkKSxcblx0XHRcdFx0dGhpcy5fcHJldmlld1RleHRNb2RlbCxcblx0XHRcdFx0dGhpcy5fdGFiQWN0aW9uLFxuXHRcdFx0KSk7XG5cdFx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cblx0XHR0aGlzLl9pbmxpbmVEaWZmVmlld1N0YXRlID0gZGVyaXZlZDxJT3JpZ2luYWxFZGl0b3JJbmxpbmVEaWZmVmlld1N0YXRlIHwgdW5kZWZpbmVkPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZSA9IHRoaXMuX3VpU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFlIHx8ICFlLnN0YXRlKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdGlmIChlLnN0YXRlLmtpbmQgPT09ICd3b3JkUmVwbGFjZW1lbnRzJyB8fCBlLnN0YXRlLmtpbmQgPT09ICdpbnNlcnRpb25NdWx0aUxpbmUnIHx8IGUuc3RhdGUua2luZCA9PT0gJ2NvbGxhcHNlZCcgfHwgZS5zdGF0ZS5raW5kID09PSAnY3VzdG9tJyB8fCBlLnN0YXRlLmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtb2RpZmllZFRleHQ6IG5ldyBTdHJpbmdUZXh0KGUubmV3VGV4dCksXG5cdFx0XHRcdGRpZmY6IGUuZGlmZixcblx0XHRcdFx0bW9kZTogZS5zdGF0ZS5raW5kLFxuXHRcdFx0XHRtb2RpZmllZENvZGVFZGl0b3I6IHRoaXMuX3NpZGVCeVNpZGUucHJldmlld0VkaXRvcixcblx0XHRcdFx0ZWRpdG9yVHlwZTogZS5lZGl0b3JUeXBlLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLl9pbmxpbmVEaWZmVmlldyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBPcmlnaW5hbEVkaXRvcklubGluZURpZmZWaWV3KHRoaXMuX2VkaXRvciwgdGhpcy5faW5saW5lRGlmZlZpZXdTdGF0ZSwgdGhpcy5fcHJldmlld1RleHRNb2RlbCkpO1xuXHRcdHRoaXMuX2p1bXBUb1ZpZXcgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShKdW1wVG9WaWV3LCB0aGlzLl9lZGl0b3JPYnMsIHsgc3R5bGU6ICdsYWJlbCcgfSwgZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcyA9IHRoaXMuX3VpU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHM/LnN0YXRlPy5raW5kID09PSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuSnVtcFRvKSB7XG5cdFx0XHRcdHJldHVybiB7IGp1bXBUb1Bvc2l0aW9uOiBzLnN0YXRlLnBvc2l0aW9uIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pKSk7XG5cdFx0Y29uc3Qgd29yZFJlcGxhY2VtZW50cyA9IGRlcml2ZWRPcHRzKHtcblx0XHRcdGVxdWFsc0ZuOiBlcXVhbHMuYXJyYXlDKGVxdWFscy50aGlzQygpKVxuXHRcdH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzID0gdGhpcy5fdWlTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gcz8uc3RhdGU/LmtpbmQgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Xb3JkUmVwbGFjZW1lbnRzID8gcy5zdGF0ZS5yZXBsYWNlbWVudHMubWFwKHJlcGxhY2VtZW50ID0+IG5ldyBXb3JkUmVwbGFjZW1lbnRzVmlld0RhdGEocmVwbGFjZW1lbnQsIHMuZWRpdG9yVHlwZSwgcy5zdGF0ZT8uYWx0ZXJuYXRpdmVBY3Rpb24pKSA6IFtdO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3dvcmRSZXBsYWNlbWVudFZpZXdzID0gbWFwT2JzZXJ2YWJsZUFycmF5Q2FjaGVkKHRoaXMsIHdvcmRSZXBsYWNlbWVudHMsICh2aWV3RGF0YSwgc3RvcmUpID0+IHtcblx0XHRcdHJldHVybiBzdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5saW5lRWRpdHNXb3JkUmVwbGFjZW1lbnRWaWV3LCB0aGlzLl9lZGl0b3JPYnMsIHZpZXdEYXRhLCB0aGlzLl90YWJBY3Rpb24pKTtcblx0XHR9KTtcblx0XHR0aGlzLl9saW5lUmVwbGFjZW1lbnRWaWV3ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5saW5lRWRpdHNMaW5lUmVwbGFjZW1lbnRWaWV3LFxuXHRcdFx0dGhpcy5fZWRpdG9yT2JzLFxuXHRcdFx0dGhpcy5fdWlTdGF0ZS5tYXAocyA9PiBzPy5zdGF0ZT8ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkxpbmVSZXBsYWNlbWVudCA/ICh7XG5cdFx0XHRcdG9yaWdpbmFsUmFuZ2U6IHMuc3RhdGUub3JpZ2luYWxSYW5nZSxcblx0XHRcdFx0bW9kaWZpZWRSYW5nZTogcy5zdGF0ZS5tb2RpZmllZFJhbmdlLFxuXHRcdFx0XHRtb2RpZmllZExpbmVzOiBzLnN0YXRlLm1vZGlmaWVkTGluZXMsXG5cdFx0XHRcdHJlcGxhY2VtZW50czogcy5zdGF0ZS5yZXBsYWNlbWVudHMsXG5cdFx0XHR9KSA6IHVuZGVmaW5lZCksXG5cdFx0XHR0aGlzLl91aVN0YXRlLm1hcChzID0+IHM/LmVkaXRvclR5cGUgPz8gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuVGV4dEVkaXRvciksXG5cdFx0XHR0aGlzLl90YWJBY3Rpb24sXG5cdFx0KSk7XG5cblx0XHR0aGlzLl91c2VDb2RlU2hpZnRpbmcgPSB0aGlzLl9lZGl0b3JPYnMuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0KS5tYXAocyA9PiBzLmVkaXRzLmFsbG93Q29kZVNoaWZ0aW5nKTtcblx0XHR0aGlzLl9yZW5kZXJTaWRlQnlTaWRlID0gdGhpcy5fZWRpdG9yT2JzLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCkubWFwKHMgPT4gcy5lZGl0cy5yZW5kZXJTaWRlQnlTaWRlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoXG5cdFx0XHRcdEV2ZW50LmFueShcblx0XHRcdFx0XHR0aGlzLl9zaWRlQnlTaWRlLm9uRGlkQ2xpY2ssXG5cdFx0XHRcdFx0dGhpcy5fbGluZVJlcGxhY2VtZW50Vmlldy5vbkRpZENsaWNrLFxuXHRcdFx0XHRcdHRoaXMuX2luc2VydGlvbi5vbkRpZENsaWNrLFxuXHRcdFx0XHRcdC4uLnRoaXMuX3dvcmRSZXBsYWNlbWVudFZpZXdzLnJlYWQocmVhZGVyKS5tYXAodyA9PiB3Lm9uRGlkQ2xpY2spLFxuXHRcdFx0XHRcdHRoaXMuX2lubGluZURpZmZWaWV3Lm9uRGlkQ2xpY2ssXG5cdFx0XHRcdFx0dGhpcy5fY3VzdG9tVmlldy5vbkRpZENsaWNrLFxuXHRcdFx0XHQpKGNsaWNrRXZlbnQgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl92aWV3SGFzQmVlblNob3duTG9uZ2VyVGhhbigzNTApKSB7XG5cdFx0XHRcdFx0XHRjbGlja0V2ZW50LmV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRtb2RlbC5hY2NlcHQoY2xpY2tFdmVudC5hbHRlcm5hdGl2ZUFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KVxuXHRcdFx0KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl93b3JkUmVwbGFjZW1lbnRWaWV3cy5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHRjb25zdCBtaW5FZGl0b3JTY3JvbGxIZWlnaHQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gTWF0aC5tYXgoXG5cdFx0XHRcdC4uLnRoaXMuX3dvcmRSZXBsYWNlbWVudFZpZXdzLnJlYWQocmVhZGVyKS5tYXAodiA9PiB2Lm1pbkVkaXRvclNjcm9sbEhlaWdodC5yZWFkKHJlYWRlcikpLFxuXHRcdFx0XHR0aGlzLl9saW5lUmVwbGFjZW1lbnRWaWV3Lm1pbkVkaXRvclNjcm9sbEhlaWdodC5yZWFkKHJlYWRlciksXG5cdFx0XHRcdHRoaXMuX2N1c3RvbVZpZXcubWluRWRpdG9yU2Nyb2xsSGVpZ2h0LnJlYWQocmVhZGVyKVxuXHRcdFx0KTtcblx0XHR9KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHRsZXQgdmlld1pvbmVJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1pblNjcm9sbEhlaWdodCA9IG1pbkVkaXRvclNjcm9sbEhlaWdodC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLl9lZGl0b3JPYnMubW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCF0ZXh0TW9kZWwpIHsgcmV0dXJuOyB9XG5cblx0XHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjb25zdCBzY3JvbGxIZWlnaHQgPSB0aGlzLl9lZGl0b3IuZ2V0U2Nyb2xsSGVpZ2h0KCk7XG5cdFx0XHRcdGNvbnN0IHZpZXdab25lSGVpZ2h0ID0gbWluU2Nyb2xsSGVpZ2h0IC0gc2Nyb2xsSGVpZ2h0ICsgMSAvKiBBZGQgMXB4IHNvIHRoZXJlIGlzIGEgc21hbGwgZ2FwICovO1xuXG5cdFx0XHRcdGlmICh2aWV3Wm9uZUhlaWdodCAhPT0gMCAmJiB2aWV3Wm9uZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKHZpZXdab25lSWQpO1xuXHRcdFx0XHRcdHZpZXdab25lSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodmlld1pvbmVIZWlnaHQgPD0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHZpZXdab25lSWQgPSBhY2Nlc3Nvci5hZGRab25lKHtcblx0XHRcdFx0XHRhZnRlckxpbmVOdW1iZXI6IHRleHRNb2RlbC5nZXRMaW5lQ291bnQoKSxcblx0XHRcdFx0XHRoZWlnaHRJblB4OiB2aWV3Wm9uZUhlaWdodCxcblx0XHRcdFx0XHRkb21Ob2RlOiAkKCdkaXYubWluU2Nyb2xsSGVpZ2h0Vmlld1pvbmUnKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb25zdHJ1Y3RvckRvbmUuc2V0KHRydWUsIHVuZGVmaW5lZCk7IC8vIFRPRE86IHJlbW92ZSBhbmQgdXNlIGNvcnJlY3QgaW5pdGlhbGl6YXRpb24gb3JkZXJcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBkaXNwbGF5UmFuZ2UgPSBkZXJpdmVkPExpbmVSYW5nZSB8IHVuZGVmaW5lZD4odGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3VpU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc3RhdGUpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdGlmIChzdGF0ZS50YXJnZXQudXJpLnRvU3RyaW5nKCkgIT09IHRoaXMuX2VkaXRvck9icy5tb2RlbC5yZWFkKHJlYWRlcik/LnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0ZS5zdGF0ZT8ua2luZCA9PT0gJ2N1c3RvbScpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gc3RhdGUuc3RhdGUuZGlzcGxheUxvY2F0aW9uPy5yYW5nZTtcblx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignY3VzdG9tIHZpZXcgc2hvdWxkIGhhdmUgYSByYW5nZScpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBMaW5lUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdGUuc3RhdGU/LmtpbmQgPT09ICdpbnNlcnRpb25NdWx0aUxpbmUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faW5zZXJ0aW9uLm9yaWdpbmFsTGluZXMucmVhZChyZWFkZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZS5lZGl0LmRpc3BsYXlSYW5nZTtcblx0fSk7XG5cblxuXHRwcml2YXRlIF9jdXJyZW50SW5saW5lRWRpdENhY2hlOiB7XG5cdFx0aW5saW5lU3VnZ2VzdGlvbklkZW50aXR5OiBJbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHk7XG5cdFx0Zmlyc3RDdXJzb3JMaW5lTnVtYmVyOiBudW1iZXI7XG5cdH0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZ2V0TG9uZ0Rpc3RhbmNlSGludFN0YXRlKG1vZGVsOiBNb2RlbFBlcklubGluZUVkaXQsIHJlYWRlcjogSVJlYWRlcik6IElMb25nRGlzdGFuY2VIaW50IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAobW9kZWwuaW5saW5lRWRpdC5pbmxpbmVDb21wbGV0aW9uLmlkZW50aXR5Lmp1bXBlZFRvLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKG1vZGVsLmlubGluZUVkaXQuYWN0aW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGVkaXRvck1vZGVsID0gdGhpcy5fZWRpdG9yT2JzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIWVkaXRvck1vZGVsIHx8ICFtb2RlbC5pbmxpbmVFZGl0Lm9yaWdpbmFsVGV4dC50YXJnZXRzKGVkaXRvck1vZGVsKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aXNWaXNpYmxlOiB0cnVlLFxuXHRcdFx0XHRsaW5lTnVtYmVyOiBtb2RlbC5pbmxpbmVFZGl0LmN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jdXJyZW50SW5saW5lRWRpdENhY2hlPy5pbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHkgIT09IG1vZGVsLmlubGluZUVkaXQuaW5saW5lQ29tcGxldGlvbi5pZGVudGl0eSkge1xuXHRcdFx0dGhpcy5fY3VycmVudElubGluZUVkaXRDYWNoZSA9IHtcblx0XHRcdFx0aW5saW5lU3VnZ2VzdGlvbklkZW50aXR5OiBtb2RlbC5pbmxpbmVFZGl0LmlubGluZUNvbXBsZXRpb24uaWRlbnRpdHksXG5cdFx0XHRcdGZpcnN0Q3Vyc29yTGluZU51bWJlcjogbW9kZWwuaW5saW5lRWRpdC5jdXJzb3JQb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxpbmVOdW1iZXI6IHRoaXMuX2N1cnJlbnRJbmxpbmVFZGl0Q2FjaGUuZmlyc3RDdXJzb3JMaW5lTnVtYmVyLFxuXHRcdFx0aXNWaXNpYmxlOiAhbW9kZWwuaW5WaWV3UG9ydC5yZWFkKHJlYWRlciksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnN0cnVjdG9yRG9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91aVN0YXRlID0gZGVyaXZlZDx7XG5cdFx0c3RhdGU6IFJldHVyblR5cGU8dHlwZW9mIElubGluZUVkaXRzVmlldy5wcm90b3R5cGUuX2RldGVybWluZVJlbmRlclN0YXRlPjtcblx0XHRkaWZmOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXTtcblx0XHRlZGl0OiBJbmxpbmVFZGl0V2l0aENoYW5nZXM7XG5cdFx0bmV3VGV4dDogc3RyaW5nO1xuXHRcdG5ld1RleHRMaW5lQ291bnQ6IG51bWJlcjtcblx0XHRlZGl0b3JUeXBlOiBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZTtcblx0XHRsb25nRGlzdGFuY2VIaW50OiBJTG9uZ0Rpc3RhbmNlSGludCB8IHVuZGVmaW5lZDtcblx0XHRuZXh0Q3Vyc29yUG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbDtcblx0XHR0YXJnZXQ6IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlO1xuXHR9IHwgdW5kZWZpbmVkPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvck9icy5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFtb2RlbCB8fCAhdGV4dE1vZGVsIHx8ICF0aGlzLl9jb25zdHJ1Y3RvckRvbmUucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlubGluZUVkaXQgPSBtb2RlbC5pbmxpbmVFZGl0O1xuXHRcdGxldCBkaWZmOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXTtcblx0XHRsZXQgbWFwcGluZ3M6IFJhbmdlTWFwcGluZ1tdO1xuXG5cdFx0bGV0IG5ld1RleHQ6IEFic3RyYWN0VGV4dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChpbmxpbmVFZGl0LmVkaXQpIHtcblx0XHRcdG1hcHBpbmdzID0gUmFuZ2VNYXBwaW5nLmZyb21FZGl0KGlubGluZUVkaXQuZWRpdCk7XG5cdFx0XHRuZXdUZXh0ID0gbmV3IFN0cmluZ1RleHQoaW5saW5lRWRpdC5lZGl0LmFwcGx5KGlubGluZUVkaXQub3JpZ2luYWxUZXh0KSk7XG5cdFx0XHRkaWZmID0gbGluZVJhbmdlTWFwcGluZ0Zyb21SYW5nZU1hcHBpbmdzKG1hcHBpbmdzLCBpbmxpbmVFZGl0Lm9yaWdpbmFsVGV4dCwgbmV3VGV4dCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1hcHBpbmdzID0gW107XG5cdFx0XHRkaWZmID0gW107XG5cdFx0XHRuZXdUZXh0ID0gaW5saW5lRWRpdC5vcmlnaW5hbFRleHQ7XG5cdFx0fVxuXG5cblx0XHRsZXQgc3RhdGUgPSB0aGlzLl9kZXRlcm1pbmVSZW5kZXJTdGF0ZShtb2RlbCwgcmVhZGVyLCBkaWZmLCBuZXdUZXh0KTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihuZXcgRXJyb3IoYHVuYWJsZSB0byBkZXRlcm1pbmUgdmlldzogdHJpZWQgdG8gcmVuZGVyICR7dGhpcy5fcHJldmlvdXNWaWV3Py52aWV3fWApKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9uZ0Rpc3RhbmNlSGludCA9IHRoaXMuX2dldExvbmdEaXN0YW5jZUhpbnRTdGF0ZShtb2RlbCwgcmVhZGVyKTtcblxuXHRcdGlmIChsb25nRGlzdGFuY2VIaW50ICYmIGxvbmdEaXN0YW5jZUhpbnQuaXNWaXNpYmxlKSB7XG5cdFx0XHRzdGF0ZS52aWV3RGF0YS5zZXRMb25nRGlzdGFuY2VWaWV3RGF0YShsb25nRGlzdGFuY2VIaW50LmxpbmVOdW1iZXIsIGlubGluZUVkaXQubGluZUVkaXQubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXG5cdFx0c3RhdGUudmlld0RhdGEuaXNGb3JBbm90aGVyRG9jdW1lbnQgPSAhaW5saW5lRWRpdC5vcmlnaW5hbFRleHQudGFyZ2V0cyh0ZXh0TW9kZWwpO1xuXG5cdFx0aWYgKHN0YXRlLmtpbmQgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5TaWRlQnlTaWRlKSB7XG5cdFx0XHRjb25zdCBpbmRlbnRhdGlvbkFkanVzdG1lbnRFZGl0ID0gY3JlYXRlUmVpbmRlbnRFZGl0KG5ld1RleHQuZ2V0VmFsdWUoKSwgaW5saW5lRWRpdC5tb2RpZmllZExpbmVSYW5nZSwgdGV4dE1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplKTtcblx0XHRcdG5ld1RleHQgPSBuZXcgU3RyaW5nVGV4dChpbmRlbnRhdGlvbkFkanVzdG1lbnRFZGl0LmFwcGx5VG9TdHJpbmcobmV3VGV4dC5nZXRWYWx1ZSgpKSk7XG5cblx0XHRcdG1hcHBpbmdzID0gYXBwbHlFZGl0VG9Nb2RpZmllZFJhbmdlTWFwcGluZ3MobWFwcGluZ3MsIGluZGVudGF0aW9uQWRqdXN0bWVudEVkaXQpO1xuXHRcdFx0ZGlmZiA9IGxpbmVSYW5nZU1hcHBpbmdGcm9tUmFuZ2VNYXBwaW5ncyhtYXBwaW5ncywgaW5saW5lRWRpdC5vcmlnaW5hbFRleHQsIG5ld1RleHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwuc2V0TGFuZ3VhZ2UodGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cblx0XHRjb25zdCBwcmV2aW91c05ld1RleHQgPSB0aGlzLl9wcmV2aWV3VGV4dE1vZGVsLmdldFZhbHVlKCk7XG5cdFx0aWYgKHByZXZpb3VzTmV3VGV4dCAhPT0gbmV3VGV4dC5nZXRWYWx1ZSgpKSB7XG5cdFx0XHR0aGlzLl9wcmV2aWV3VGV4dE1vZGVsLnNldEVPTCh0ZXh0TW9kZWwuZ2V0RW5kT2ZMaW5lU2VxdWVuY2UoKSk7XG5cdFx0XHRjb25zdCB1cGRhdGVPbGRWYWx1ZUVkaXQgPSBTdHJpbmdFZGl0LnJlcGxhY2UobmV3IE9mZnNldFJhbmdlKDAsIHByZXZpb3VzTmV3VGV4dC5sZW5ndGgpLCBuZXdUZXh0LmdldFZhbHVlKCkpO1xuXHRcdFx0Y29uc3QgdXBkYXRlT2xkVmFsdWVFZGl0U21hbGwgPSB1cGRhdGVPbGRWYWx1ZUVkaXQucmVtb3ZlQ29tbW9uU3VmZml4UHJlZml4KHByZXZpb3VzTmV3VGV4dCk7XG5cblx0XHRcdGNvbnN0IHRleHRFZGl0ID0gZ2V0UG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lckZyb21UZXh0TW9kZWwodGhpcy5fcHJldmlld1RleHRNb2RlbCkuZ2V0VGV4dEVkaXQodXBkYXRlT2xkVmFsdWVFZGl0U21hbGwpO1xuXHRcdFx0dGhpcy5fcHJldmlld1RleHRNb2RlbC5lZGl0KHRleHRFZGl0KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc2hvd0NvbGxhcHNlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHN0YXRlID0geyBraW5kOiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuQ29sbGFwc2VkIGFzIGNvbnN0LCB2aWV3RGF0YTogc3RhdGUudmlld0RhdGEgfTtcblx0XHR9XG5cblx0XHRtb2RlbC5oYW5kbGVJbmxpbmVFZGl0U2hvd25OZXh0RnJhbWUoc3RhdGUua2luZCwgc3RhdGUudmlld0RhdGEpO1xuXG5cdFx0Y29uc3QgbmV4dEN1cnNvclBvc2l0aW9uID0gaW5saW5lRWRpdC5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nID8gaW5saW5lRWRpdC5hY3Rpb24ucG9zaXRpb24gOiBudWxsO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXRlLFxuXHRcdFx0ZGlmZixcblx0XHRcdGVkaXQ6IGlubGluZUVkaXQsXG5cdFx0XHRuZXdUZXh0OiBuZXdUZXh0LmdldFZhbHVlKCksXG5cdFx0XHRuZXdUZXh0TGluZUNvdW50OiBpbmxpbmVFZGl0Lm1vZGlmaWVkTGluZVJhbmdlLmxlbmd0aCxcblx0XHRcdGVkaXRvclR5cGU6IG1vZGVsLmVkaXRvclR5cGUsXG5cdFx0XHRsb25nRGlzdGFuY2VIaW50LFxuXHRcdFx0bmV4dEN1cnNvclBvc2l0aW9uOiBuZXh0Q3Vyc29yUG9zaXRpb24sXG5cdFx0XHR0YXJnZXQ6IGlubGluZUVkaXQuaW5saW5lQ29tcGxldGlvbi5vcmlnaW5hbFRleHRSZWYsXG5cdFx0fTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlld1RleHRNb2RlbDtcblxuXG5cdHB1YmxpYyByZWFkb25seSBpbmxpbmVFZGl0c0lzSG92ZXJlZCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2lkZUJ5U2lkZS5pc0hvdmVyZWQucmVhZChyZWFkZXIpXG5cdFx0XHR8fCB0aGlzLl93b3JkUmVwbGFjZW1lbnRWaWV3cy5yZWFkKHJlYWRlcikuc29tZSh2ID0+IHYuaXNIb3ZlcmVkLnJlYWQocmVhZGVyKSlcblx0XHRcdHx8IHRoaXMuX2RlbGV0aW9uLmlzSG92ZXJlZC5yZWFkKHJlYWRlcilcblx0XHRcdHx8IHRoaXMuX2lubGluZURpZmZWaWV3LmlzSG92ZXJlZC5yZWFkKHJlYWRlcilcblx0XHRcdHx8IHRoaXMuX2xpbmVSZXBsYWNlbWVudFZpZXcuaXNIb3ZlcmVkLnJlYWQocmVhZGVyKVxuXHRcdFx0fHwgdGhpcy5faW5zZXJ0aW9uLmlzSG92ZXJlZC5yZWFkKHJlYWRlcilcblx0XHRcdHx8IHRoaXMuX2N1c3RvbVZpZXcuaXNIb3ZlcmVkLnJlYWQocmVhZGVyKVxuXHRcdFx0fHwgdGhpcy5fbG9uZ0Rpc3RhbmNlSGludC5tYXAoKHYsIHIpID0+IHY/LmlzSG92ZXJlZC5yZWFkKHIpID8/IGZhbHNlKS5yZWFkKHJlYWRlcik7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NpZGVCeVNpZGU7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9kZWxldGlvbjtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2luc2VydGlvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVEaWZmVmlld1N0YXRlO1xuXG5cdHB1YmxpYyByZWFkb25seSBfaW5saW5lQ29sbGFwc2VkVmlldztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21WaWV3O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2xvbmdEaXN0YW5jZUhpbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9pbmxpbmVEaWZmVmlldztcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3dvcmRSZXBsYWNlbWVudFZpZXdzO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfbGluZVJlcGxhY2VtZW50VmlldztcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2p1bXBUb1ZpZXc7XG5cblx0cHVibGljIHJlYWRvbmx5IGd1dHRlckluZGljYXRvck9mZnNldCA9IGRlcml2ZWQ8bnVtYmVyPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdC8vIFRPRE86IGhhdmUgYSBiZXR0ZXIgd2F5IHRvIHRlbGwgdGhlIGd1dHRlciBpbmRpY2F0b3IgdmlldyB3aGVyZSB0aGUgZWRpdCBpcyBpbnNpZGUgYSB2aWV3em9uZVxuXHRcdGlmICh0aGlzLl91aVN0YXRlLnJlYWQocmVhZGVyKT8uc3RhdGU/LmtpbmQgPT09ICdpbnNlcnRpb25NdWx0aUxpbmUnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faW5zZXJ0aW9uLnN0YXJ0TGluZU9mZnNldC5yZWFkKHJlYWRlcik7XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9KTtcblxuXHRwcml2YXRlIF9nZXRDYWNoZUlkKG1vZGVsOiBNb2RlbFBlcklubGluZUVkaXQpIHtcblx0XHRyZXR1cm4gbW9kZWwuaW5saW5lRWRpdC5pbmxpbmVDb21wbGV0aW9uLmlkZW50aXR5LmlkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGV0ZXJtaW5lVmlldyhtb2RlbDogTW9kZWxQZXJJbmxpbmVFZGl0LCByZWFkZXI6IElSZWFkZXIsIGRpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdLCBuZXdUZXh0OiBBYnN0cmFjdFRleHQpOiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQge1xuXHRcdC8vIENoZWNrIGlmIHdlIGNhbiB1c2UgdGhlIHByZXZpb3VzIHZpZXcgaWYgaXQgaXMgdGhlIHNhbWUgSW5saW5lQ29tcGxldGlvbiBhcyBwcmV2aW91c2x5IHNob3duXG5cdFx0Y29uc3QgaW5saW5lRWRpdCA9IG1vZGVsLmlubGluZUVkaXQ7XG5cdFx0Y29uc3QgY2FuVXNlQ2FjaGUgPSB0aGlzLl9wcmV2aW91c1ZpZXc/LmlkID09PSB0aGlzLl9nZXRDYWNoZUlkKG1vZGVsKSAmJiB0aGlzLl9wcmV2aW91c1ZpZXc/LnVyaS50b1N0cmluZygpID09PSB0aGlzLl9lZGl0b3JPYnMubW9kZWwuZ2V0KCkhLnVyaS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHJlY29uc2lkZXJWaWV3RWRpdG9yV2lkdGhDaGFuZ2UgPSB0aGlzLl9wcmV2aW91c1ZpZXc/LmVkaXRvcldpZHRoICE9PSB0aGlzLl9lZGl0b3JPYnMubGF5b3V0SW5mb1dpZHRoLnJlYWQocmVhZGVyKSAmJlxuXHRcdFx0KFxuXHRcdFx0XHR0aGlzLl9wcmV2aW91c1ZpZXc/LnZpZXcgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5TaWRlQnlTaWRlIHx8XG5cdFx0XHRcdHRoaXMuX3ByZXZpb3VzVmlldz8udmlldyA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkxpbmVSZXBsYWNlbWVudFxuXHRcdFx0KTtcblxuXHRcdGlmIChjYW5Vc2VDYWNoZSAmJiAhcmVjb25zaWRlclZpZXdFZGl0b3JXaWR0aENoYW5nZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3ByZXZpb3VzVmlldyEudmlldztcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb24gPSBtb2RlbC5pbmxpbmVFZGl0LmlubGluZUNvbXBsZXRpb24uYWN0aW9uO1xuXHRcdGlmIChhY3Rpb24/LmtpbmQgPT09ICdlZGl0JyAmJiBhY3Rpb24uYWx0ZXJuYXRpdmVBY3Rpb24pIHtcblx0XHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuV29yZFJlcGxhY2VtZW50cztcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRVcmkgPSBtb2RlbC5pbmxpbmVFZGl0LmlubGluZUNvbXBsZXRpb24ub3JpZ2luYWxUZXh0UmVmLnVyaTtcblx0XHRjb25zdCBjdXJyZW50VXJpID0gdGhpcy5fZWRpdG9yT2JzLm1vZGVsLnJlYWQocmVhZGVyKT8udXJpO1xuXHRcdGlmIChjdXJyZW50VXJpICYmIHRhcmdldFVyaS50b1N0cmluZygpICE9PSBjdXJyZW50VXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuQ3VzdG9tO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbC5kaXNwbGF5TG9jYXRpb24gJiYgIW1vZGVsLmlubGluZUVkaXQuaW5saW5lQ29tcGxldGlvbi5pZGVudGl0eS5qdW1wZWRUby5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuQ3VzdG9tO1xuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSB0aGUgdmlldyBiYXNlZCBvbiB0aGUgZWRpdCAvIGRpZmZcblxuXHRcdGNvbnN0IG51bU9yaWdpbmFsTGluZXMgPSBpbmxpbmVFZGl0Lm9yaWdpbmFsTGluZVJhbmdlLmxlbmd0aDtcblx0XHRjb25zdCBudW1Nb2RpZmllZExpbmVzID0gaW5saW5lRWRpdC5tb2RpZmllZExpbmVSYW5nZS5sZW5ndGg7XG5cdFx0Y29uc3QgaW5uZXIgPSBkaWZmLmZsYXRNYXAoZCA9PiBkLmlubmVyQ2hhbmdlcyA/PyBbXSk7XG5cdFx0Y29uc3QgaXNTaW5nbGVJbm5lckVkaXQgPSBpbm5lci5sZW5ndGggPT09IDE7XG5cblx0XHRpZiAobW9kZWwuZWRpdG9yVHlwZSAhPT0gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuRGlmZkVkaXRvcikge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRpc1NpbmdsZUlubmVyRWRpdFxuXHRcdFx0XHQmJiB0aGlzLl91c2VDb2RlU2hpZnRpbmcucmVhZChyZWFkZXIpICE9PSAnbmV2ZXInXG5cdFx0XHRcdCYmIGlzU2luZ2xlTGluZUluc2VydGlvbihkaWZmKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGlmIChpc1NpbmdsZUxpbmVJbnNlcnRpb25BZnRlclBvc2l0aW9uKGRpZmYsIGlubGluZUVkaXQuY3Vyc29yUG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5JbnNlcnRpb25JbmxpbmU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiB3ZSBoYXZlIGEgc2luZ2xlIGxpbmUgaW5zZXJ0aW9uIGJlZm9yZSB0aGUgY3Vyc29yIHBvc2l0aW9uLCB3ZSBkbyBub3Qgd2FudCB0byBtb3ZlIHRoZSBjdXJzb3IgYnkgaW5zZXJ0aW5nXG5cdFx0XHRcdC8vIHRoZSBzdWdnZXN0aW9uIGlubGluZS4gVXNlIGEgbGluZSByZXBsYWNlbWVudCB2aWV3IGluc3RlYWQuIERvIG5vdCB1c2Ugd29yZCByZXBsYWNlbWVudCB2aWV3LlxuXHRcdFx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkxpbmVSZXBsYWNlbWVudDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzRGVsZXRpb24oaW5uZXIsIGlubGluZUVkaXQsIG5ld1RleHQpKSB7XG5cdFx0XHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuRGVsZXRpb247XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1NpbmdsZU11bHRpTGluZUluc2VydGlvbihkaWZmKSAmJiB0aGlzLl91c2VDb2RlU2hpZnRpbmcucmVhZChyZWFkZXIpID09PSAnYWx3YXlzJykge1xuXHRcdFx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkluc2VydGlvbk11bHRpTGluZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWxsSW5uZXJDaGFuZ2VzTm90VG9vTG9uZyA9IGlubmVyLmV2ZXJ5KG0gPT4gVGV4dExlbmd0aC5vZlJhbmdlKG0ub3JpZ2luYWxSYW5nZSkuY29sdW1uQ291bnQgPCBJbmxpbmVFZGl0c1dvcmRSZXBsYWNlbWVudFZpZXcuTUFYX0xFTkdUSCAmJiBUZXh0TGVuZ3RoLm9mUmFuZ2UobS5tb2RpZmllZFJhbmdlKS5jb2x1bW5Db3VudCA8IElubGluZUVkaXRzV29yZFJlcGxhY2VtZW50Vmlldy5NQVhfTEVOR1RIKTtcblx0XHRcdGlmIChhbGxJbm5lckNoYW5nZXNOb3RUb29Mb25nICYmIGlzU2luZ2xlSW5uZXJFZGl0ICYmIG51bU9yaWdpbmFsTGluZXMgPT09IDEgJiYgbnVtTW9kaWZpZWRMaW5lcyA9PT0gMSkge1xuXHRcdFx0XHQvLyBEbyBub3Qgc2hvdyBpbmRlbnRhdGlvbiBjaGFuZ2VzIHdpdGggd29yZCByZXBsYWNlbWVudCB2aWV3XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkVGV4dCA9IGlubmVyLm1hcChtID0+IG5ld1RleHQuZ2V0VmFsdWVPZlJhbmdlKG0ubW9kaWZpZWRSYW5nZSkpO1xuXHRcdFx0XHRjb25zdCBvcmlnaW5hbFRleHQgPSBpbm5lci5tYXAobSA9PiBtb2RlbC5pbmxpbmVFZGl0Lm9yaWdpbmFsVGV4dC5nZXRWYWx1ZU9mUmFuZ2UobS5vcmlnaW5hbFJhbmdlKSk7XG5cdFx0XHRcdGlmICghbW9kaWZpZWRUZXh0LnNvbWUodiA9PiB2LmluY2x1ZGVzKCdcXHQnKSkgJiYgIW9yaWdpbmFsVGV4dC5zb21lKHYgPT4gdi5pbmNsdWRlcygnXFx0JykpKSB7XG5cdFx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRoZXJlIGlzIG5vIGluc2VydGlvbiwgZXZlbiBpZiB3ZSBncm93IHRoZW1cblx0XHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0XHQhaW5uZXIuc29tZShtID0+IG0ub3JpZ2luYWxSYW5nZS5pc0VtcHR5KCkpIHx8XG5cdFx0XHRcdFx0XHQhZ3Jvd0VkaXRzVW50aWxXaGl0ZXNwYWNlKGlubmVyLm1hcChtID0+IG5ldyBUZXh0UmVwbGFjZW1lbnQobS5vcmlnaW5hbFJhbmdlLCAnJykpLCBpbmxpbmVFZGl0Lm9yaWdpbmFsVGV4dCkuc29tZShlID0+IGUucmFuZ2UuaXNFbXB0eSgpICYmIFRleHRMZW5ndGgub2ZSYW5nZShlLnJhbmdlKS5jb2x1bW5Db3VudCA8IElubGluZUVkaXRzV29yZFJlcGxhY2VtZW50Vmlldy5NQVhfTEVOR1RIKVxuXHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Xb3JkUmVwbGFjZW1lbnRzO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChudW1PcmlnaW5hbExpbmVzID4gMCAmJiBudW1Nb2RpZmllZExpbmVzID4gMCkge1xuXHRcdFx0aWYgKG51bU9yaWdpbmFsTGluZXMgPT09IDEgJiYgbnVtTW9kaWZpZWRMaW5lcyA9PT0gMSAmJiBtb2RlbC5lZGl0b3JUeXBlICE9PSBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5EaWZmRWRpdG9yIC8qIHByZWZlciBzaWRlIGJ5IHNpZGUgaW4gZGlmZiBlZGl0b3IgKi8pIHtcblx0XHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5MaW5lUmVwbGFjZW1lbnQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9yZW5kZXJTaWRlQnlTaWRlLnJlYWQocmVhZGVyKSAhPT0gJ25ldmVyJyAmJiBJbmxpbmVFZGl0c1NpZGVCeVNpZGVWaWV3LmZpdHNJbnNpZGVWaWV3cG9ydCh0aGlzLl9lZGl0b3IsIHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwsIGlubGluZUVkaXQsIHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5TaWRlQnlTaWRlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkxpbmVSZXBsYWNlbWVudDtcblx0XHR9XG5cblx0XHRpZiAobW9kZWwuZWRpdG9yVHlwZSA9PT0gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuRGlmZkVkaXRvcikge1xuXHRcdFx0aWYgKGlzRGVsZXRpb24oaW5uZXIsIGlubGluZUVkaXQsIG5ld1RleHQpKSB7XG5cdFx0XHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuRGVsZXRpb247XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc1NpbmdsZU11bHRpTGluZUluc2VydGlvbihkaWZmKSAmJiB0aGlzLl91c2VDb2RlU2hpZnRpbmcucmVhZChyZWFkZXIpID09PSAnYWx3YXlzJykge1xuXHRcdFx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkluc2VydGlvbk11bHRpTGluZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLlNpZGVCeVNpZGU7XG5cdH1cblxuXHRwcml2YXRlIF9kZXRlcm1pbmVSZW5kZXJTdGF0ZShtb2RlbDogTW9kZWxQZXJJbmxpbmVFZGl0LCByZWFkZXI6IElSZWFkZXIsIGRpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdLCBuZXdUZXh0OiBBYnN0cmFjdFRleHQpIHtcblx0XHRpZiAobW9kZWwuaW5saW5lRWRpdC5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuSnVtcFRvIGFzIGNvbnN0LFxuXHRcdFx0XHRwb3NpdGlvbjogbW9kZWwuaW5saW5lRWRpdC5hY3Rpb24ucG9zaXRpb24sXG5cdFx0XHRcdHZpZXdEYXRhOiBjcmVhdGVFbXB0eVZpZXdEYXRhKCksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGlubGluZUVkaXQgPSBtb2RlbC5pbmxpbmVFZGl0O1xuXG5cdFx0bGV0IHZpZXcgPSB0aGlzLl9kZXRlcm1pbmVWaWV3KG1vZGVsLCByZWFkZXIsIGRpZmYsIG5ld1RleHQpO1xuXHRcdGlmICh0aGlzLl93aWxsUmVuZGVyQWJvdmVDdXJzb3IocmVhZGVyLCBpbmxpbmVFZGl0LCB2aWV3KSkge1xuXHRcdFx0c3dpdGNoICh2aWV3KSB7XG5cdFx0XHRcdGNhc2UgSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkxpbmVSZXBsYWNlbWVudDpcblx0XHRcdFx0Y2FzZSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuV29yZFJlcGxhY2VtZW50czpcblx0XHRcdFx0XHR2aWV3ID0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLlNpZGVCeVNpZGU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3ByZXZpb3VzVmlldyA9IHsgaWQ6IHRoaXMuX2dldENhY2hlSWQobW9kZWwpLCB2aWV3LCBlZGl0b3JXaWR0aDogdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKS53aWR0aCwgdGltZXN0YW1wOiBEYXRlLm5vdygpLCB1cmk6IHRoaXMuX2VkaXRvck9icy5tb2RlbC5nZXQoKSEudXJpIH07XG5cblx0XHRjb25zdCBpbm5lciA9IGRpZmYuZmxhdE1hcChkID0+IGQuaW5uZXJDaGFuZ2VzID8/IFtdKTtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0Y29uc3Qgc3RyaW5nQ2hhbmdlcyA9IGlubmVyLm1hcChtID0+ICh7XG5cdFx0XHRvcmlnaW5hbFJhbmdlOiBtLm9yaWdpbmFsUmFuZ2UsXG5cdFx0XHRtb2RpZmllZFJhbmdlOiBtLm1vZGlmaWVkUmFuZ2UsXG5cdFx0XHRvcmlnaW5hbDogaW5saW5lRWRpdC5vcmlnaW5hbFRleHQuZ2V0VmFsdWVPZlJhbmdlKG0ub3JpZ2luYWxSYW5nZSksXG5cdFx0XHRtb2RpZmllZDogbmV3VGV4dC5nZXRWYWx1ZU9mUmFuZ2UobS5tb2RpZmllZFJhbmdlKVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHZpZXdEYXRhID0gZ2V0Vmlld0RhdGEoaW5saW5lRWRpdCwgc3RyaW5nQ2hhbmdlcywgdGV4dE1vZGVsKTtcblxuXHRcdHN3aXRjaCAodmlldykge1xuXHRcdFx0Y2FzZSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuSW5zZXJ0aW9uSW5saW5lOiByZXR1cm4geyBraW5kOiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuSW5zZXJ0aW9uSW5saW5lIGFzIGNvbnN0LCB2aWV3RGF0YSB9O1xuXHRcdFx0Y2FzZSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuU2lkZUJ5U2lkZTogcmV0dXJuIHsga2luZDogSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLlNpZGVCeVNpZGUgYXMgY29uc3QsIHZpZXdEYXRhIH07XG5cdFx0XHRjYXNlIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Db2xsYXBzZWQ6IHJldHVybiB7IGtpbmQ6IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Db2xsYXBzZWQgYXMgY29uc3QsIHZpZXdEYXRhIH07XG5cdFx0XHRjYXNlIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5DdXN0b206IHJldHVybiB7IGtpbmQ6IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5DdXN0b20gYXMgY29uc3QsIGRpc3BsYXlMb2NhdGlvbjogbW9kZWwuZGlzcGxheUxvY2F0aW9uLCB2aWV3RGF0YSB9O1xuXHRcdH1cblxuXHRcdGlmICh2aWV3ID09PSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuRGVsZXRpb24pIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5EZWxldGlvbiBhcyBjb25zdCxcblx0XHRcdFx0b3JpZ2luYWxSYW5nZTogaW5saW5lRWRpdC5vcmlnaW5hbExpbmVSYW5nZSxcblx0XHRcdFx0ZGVsZXRpb25zOiBpbm5lci5tYXAobSA9PiBtLm9yaWdpbmFsUmFuZ2UpLFxuXHRcdFx0XHR2aWV3RGF0YSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHZpZXcgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5JbnNlcnRpb25NdWx0aUxpbmUpIHtcblx0XHRcdGNvbnN0IGNoYW5nZSA9IGlubmVyWzBdO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkluc2VydGlvbk11bHRpTGluZSBhcyBjb25zdCxcblx0XHRcdFx0bGluZU51bWJlcjogY2hhbmdlLm9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRjb2x1bW46IGNoYW5nZS5vcmlnaW5hbFJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHR0ZXh0OiBuZXdUZXh0LmdldFZhbHVlT2ZSYW5nZShjaGFuZ2UubW9kaWZpZWRSYW5nZSksXG5cdFx0XHRcdHZpZXdEYXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCByZXBsYWNlbWVudHMgPSBzdHJpbmdDaGFuZ2VzLm1hcChtID0+IG5ldyBUZXh0UmVwbGFjZW1lbnQobS5vcmlnaW5hbFJhbmdlLCBtLm1vZGlmaWVkKSk7XG5cdFx0aWYgKHJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHZpZXcgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Xb3JkUmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRsZXQgZ3Jvd25FZGl0cyA9IGdyb3dFZGl0c1RvRW50aXJlV29yZChyZXBsYWNlbWVudHMsIGlubGluZUVkaXQub3JpZ2luYWxUZXh0KTtcblx0XHRcdGlmIChncm93bkVkaXRzLnNvbWUoZSA9PiBlLnJhbmdlLmlzRW1wdHkoKSkpIHtcblx0XHRcdFx0Z3Jvd25FZGl0cyA9IGdyb3dFZGl0c1VudGlsV2hpdGVzcGFjZShyZXBsYWNlbWVudHMsIGlubGluZUVkaXQub3JpZ2luYWxUZXh0KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLldvcmRSZXBsYWNlbWVudHMgYXMgY29uc3QsXG5cdFx0XHRcdHJlcGxhY2VtZW50czogZ3Jvd25FZGl0cyxcblx0XHRcdFx0YWx0ZXJuYXRpdmVBY3Rpb246IG1vZGVsLmlubGluZUVkaXQuYWN0aW9uPy5hbHRlcm5hdGl2ZUFjdGlvbixcblx0XHRcdFx0dmlld0RhdGEsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICh2aWV3ID09PSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuTGluZVJlcGxhY2VtZW50KSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuTGluZVJlcGxhY2VtZW50IGFzIGNvbnN0LFxuXHRcdFx0XHRvcmlnaW5hbFJhbmdlOiBpbmxpbmVFZGl0Lm9yaWdpbmFsTGluZVJhbmdlLFxuXHRcdFx0XHRtb2RpZmllZFJhbmdlOiBpbmxpbmVFZGl0Lm1vZGlmaWVkTGluZVJhbmdlLFxuXHRcdFx0XHRtb2RpZmllZExpbmVzOiBpbmxpbmVFZGl0Lm1vZGlmaWVkTGluZVJhbmdlLm1hcFRvTGluZUFycmF5KGxpbmUgPT4gbmV3VGV4dC5nZXRMaW5lQXQobGluZSkpLFxuXHRcdFx0XHRyZXBsYWNlbWVudHM6IGlubmVyLm1hcChtID0+ICh7IG9yaWdpbmFsUmFuZ2U6IG0ub3JpZ2luYWxSYW5nZSwgbW9kaWZpZWRSYW5nZTogbS5tb2RpZmllZFJhbmdlIH0pKSxcblx0XHRcdFx0dmlld0RhdGEsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF93aWxsUmVuZGVyQWJvdmVDdXJzb3IocmVhZGVyOiBJUmVhZGVyLCBpbmxpbmVFZGl0OiBJbmxpbmVFZGl0V2l0aENoYW5nZXMsIHZpZXc6IElubGluZUNvbXBsZXRpb25WaWV3S2luZCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHVzZUNvZGVTaGlmdGluZyA9IHRoaXMuX3VzZUNvZGVTaGlmdGluZy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHVzZUNvZGVTaGlmdGluZyA9PT0gJ2Fsd2F5cycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGN1cnNvclBvc2l0aW9uIG9mIGlubGluZUVkaXQubXVsdGlDdXJzb3JQb3NpdGlvbnMpIHtcblx0XHRcdGlmICh2aWV3ID09PSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuV29yZFJlcGxhY2VtZW50cyAmJlxuXHRcdFx0XHRjdXJzb3JQb3NpdGlvbi5saW5lTnVtYmVyID09PSBpbmxpbmVFZGl0Lm9yaWdpbmFsTGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciArIDFcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHZpZXcgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5MaW5lUmVwbGFjZW1lbnQgJiZcblx0XHRcdFx0Y3Vyc29yUG9zaXRpb24ubGluZU51bWJlciA+PSBpbmxpbmVFZGl0Lm9yaWdpbmFsTGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgJiZcblx0XHRcdFx0Y3Vyc29yUG9zaXRpb24ubGluZU51bWJlciA8IGlubGluZUVkaXQubW9kaWZpZWRMaW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSArIGlubGluZUVkaXQubW9kaWZpZWRMaW5lUmFuZ2UubGVuZ3RoXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmlld0hhc0JlZW5TaG93bkxvbmdlclRoYW4oZHVyYXRpb25NczogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgdmlld0NyZWF0aW9uVGltZSA9IHRoaXMuX3ByZXZpb3VzVmlldz8udGltZXN0YW1wO1xuXHRcdGlmICghdmlld0NyZWF0aW9uVGltZSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigndmlld0hhc0JlZW5TaG93bkxvbmdUaGFuIGNhbGxlZCBiZWZvcmUgYSB2aWV3IGhhcyBiZWVuIHNob3duJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdHJldHVybiAoY3VycmVudFRpbWUgLSB2aWV3Q3JlYXRpb25UaW1lKSA+PSBkdXJhdGlvbk1zO1xuXHR9XG59XG5cbmNvbnN0IGNyZWF0ZUVtcHR5Vmlld0RhdGEgPSAoKSA9PiBuZXcgSW5saW5lQ29tcGxldGlvblZpZXdEYXRhKC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIC0xLCB0cnVlKTtcbmZ1bmN0aW9uIGdldFZpZXdEYXRhKGlubGluZUVkaXQ6IElubGluZUVkaXRXaXRoQ2hhbmdlcywgc3RyaW5nQ2hhbmdlczogeyBvcmlnaW5hbFJhbmdlOiBSYW5nZTsgbW9kaWZpZWRSYW5nZTogUmFuZ2U7IG9yaWdpbmFsOiBzdHJpbmc7IG1vZGlmaWVkOiBzdHJpbmcgfVtdLCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwpIHtcblx0aWYgKCFpbmxpbmVFZGl0LmVkaXQpIHtcblx0XHRyZXR1cm4gY3JlYXRlRW1wdHlWaWV3RGF0YSgpO1xuXHR9XG5cblx0Y29uc3QgY3Vyc29yUG9zaXRpb24gPSBpbmxpbmVFZGl0LmN1cnNvclBvc2l0aW9uO1xuXHRjb25zdCBzdGFydHNXaXRoRU9MID0gc3RyaW5nQ2hhbmdlcy5sZW5ndGggPT09IDAgPyBmYWxzZSA6IHN0cmluZ0NoYW5nZXNbMF0ubW9kaWZpZWQuc3RhcnRzV2l0aCh0ZXh0TW9kZWwuZ2V0RU9MKCkpO1xuXHRjb25zdCB2aWV3RGF0YSA9IG5ldyBJbmxpbmVDb21wbGV0aW9uVmlld0RhdGEoXG5cdFx0aW5saW5lRWRpdC5lZGl0LnJlcGxhY2VtZW50cy5sZW5ndGggPT09IDAgPyAwIDogaW5saW5lRWRpdC5lZGl0LnJlcGxhY2VtZW50c1swXS5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkuY29sdW1uIC0gY3Vyc29yUG9zaXRpb24uY29sdW1uLFxuXHRcdGlubGluZUVkaXQubGluZUVkaXQubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciAtIGN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXIgKyAoc3RhcnRzV2l0aEVPTCAmJiBpbmxpbmVFZGl0LmxpbmVFZGl0LmxpbmVSYW5nZS5zdGFydExpbmVOdW1iZXIgPj0gY3Vyc29yUG9zaXRpb24ubGluZU51bWJlciA/IDEgOiAwKSxcblx0XHRpbmxpbmVFZGl0LmxpbmVFZGl0LmxpbmVSYW5nZS5sZW5ndGgsXG5cdFx0aW5saW5lRWRpdC5saW5lRWRpdC5uZXdMaW5lcy5sZW5ndGgsXG5cdFx0c3RyaW5nQ2hhbmdlcy5yZWR1Y2UoKGFjYywgcikgPT4gYWNjICsgci5vcmlnaW5hbC5sZW5ndGgsIDApLFxuXHRcdHN0cmluZ0NoYW5nZXMucmVkdWNlKChhY2MsIHIpID0+IGFjYyArIHIubW9kaWZpZWQubGVuZ3RoLCAwKSxcblx0XHRzdHJpbmdDaGFuZ2VzLmxlbmd0aCxcblx0XHRzdHJpbmdDaGFuZ2VzLmV2ZXJ5KHIgPT4gci5vcmlnaW5hbCA9PT0gc3RyaW5nQ2hhbmdlc1swXS5vcmlnaW5hbCAmJiByLm1vZGlmaWVkID09PSBzdHJpbmdDaGFuZ2VzWzBdLm1vZGlmaWVkKVxuXHQpO1xuXHRyZXR1cm4gdmlld0RhdGE7XG59XG5cbmZ1bmN0aW9uIGlzU2luZ2xlTGluZUluc2VydGlvbihkaWZmOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSkge1xuXHRyZXR1cm4gZGlmZi5ldmVyeShtID0+IG0uaW5uZXJDaGFuZ2VzIS5ldmVyeShyID0+IGlzV29yZEluc2VydGlvbihyKSkpO1xuXG5cdGZ1bmN0aW9uIGlzV29yZEluc2VydGlvbihyOiBSYW5nZU1hcHBpbmcpIHtcblx0XHRpZiAoIXIub3JpZ2luYWxSYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgaXNJbnNlcnRpb25XaXRoaW5MaW5lID0gci5tb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gci5tb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0aWYgKCFpc0luc2VydGlvbldpdGhpbkxpbmUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNTaW5nbGVMaW5lSW5zZXJ0aW9uQWZ0ZXJQb3NpdGlvbihkaWZmOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSwgcG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbCkge1xuXHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKCFpc1NpbmdsZUxpbmVJbnNlcnRpb24oZGlmZikpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBwb3MgPSBwb3NpdGlvbjtcblxuXHRyZXR1cm4gZGlmZi5ldmVyeShtID0+IG0uaW5uZXJDaGFuZ2VzIS5ldmVyeShyID0+IGlzU3RhYmxlV29yZEluc2VydGlvbihyKSkpO1xuXG5cdGZ1bmN0aW9uIGlzU3RhYmxlV29yZEluc2VydGlvbihyOiBSYW5nZU1hcHBpbmcpIHtcblx0XHRjb25zdCBpbnNlcnRQb3NpdGlvbiA9IHIub3JpZ2luYWxSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0aWYgKHBvcy5pc0JlZm9yZU9yRXF1YWwoaW5zZXJ0UG9zaXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGluc2VydFBvc2l0aW9uLmxpbmVOdW1iZXIgPCBwb3MubGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1NpbmdsZU11bHRpTGluZUluc2VydGlvbihkaWZmOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSkge1xuXHRjb25zdCBpbm5lciA9IGRpZmYuZmxhdE1hcChkID0+IGQuaW5uZXJDaGFuZ2VzID8/IFtdKTtcblx0aWYgKGlubmVyLmxlbmd0aCAhPT0gMSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IGNoYW5nZSA9IGlubmVyWzBdO1xuXHRpZiAoIWNoYW5nZS5vcmlnaW5hbFJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmIChjaGFuZ2UubW9kaWZpZWRSYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGNoYW5nZS5tb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaXNEZWxldGlvbihpbm5lcjogUmFuZ2VNYXBwaW5nW10sIGlubGluZUVkaXQ6IElubGluZUVkaXRXaXRoQ2hhbmdlcywgbmV3VGV4dDogQWJzdHJhY3RUZXh0KSB7XG5cdGNvbnN0IGlubmVyVmFsdWVzID0gaW5uZXIubWFwKG0gPT4gKHsgb3JpZ2luYWw6IGlubGluZUVkaXQub3JpZ2luYWxUZXh0LmdldFZhbHVlT2ZSYW5nZShtLm9yaWdpbmFsUmFuZ2UpLCBtb2RpZmllZDogbmV3VGV4dC5nZXRWYWx1ZU9mUmFuZ2UobS5tb2RpZmllZFJhbmdlKSB9KSk7XG5cdHJldHVybiBpbm5lclZhbHVlcy5ldmVyeSgoeyBvcmlnaW5hbCwgbW9kaWZpZWQgfSkgPT4gbW9kaWZpZWQudHJpbSgpID09PSAnJyAmJiBvcmlnaW5hbC5sZW5ndGggPiAwICYmIChvcmlnaW5hbC5sZW5ndGggPiBtb2RpZmllZC5sZW5ndGggfHwgb3JpZ2luYWwudHJpbSgpICE9PSAnJykpO1xufVxuXG5mdW5jdGlvbiBncm93RWRpdHNUb0VudGlyZVdvcmQocmVwbGFjZW1lbnRzOiBUZXh0UmVwbGFjZW1lbnRbXSwgb3JpZ2luYWxUZXh0OiBBYnN0cmFjdFRleHQpOiBUZXh0UmVwbGFjZW1lbnRbXSB7XG5cdHJldHVybiBfZ3Jvd0VkaXRzKHJlcGxhY2VtZW50cywgb3JpZ2luYWxUZXh0LCAoY2hhcikgPT4gL15bYS16QS1aXSQvLnRlc3QoY2hhcikpO1xufVxuXG5mdW5jdGlvbiBncm93RWRpdHNVbnRpbFdoaXRlc3BhY2UocmVwbGFjZW1lbnRzOiBUZXh0UmVwbGFjZW1lbnRbXSwgb3JpZ2luYWxUZXh0OiBBYnN0cmFjdFRleHQpOiBUZXh0UmVwbGFjZW1lbnRbXSB7XG5cdHJldHVybiBfZ3Jvd0VkaXRzKHJlcGxhY2VtZW50cywgb3JpZ2luYWxUZXh0LCAoY2hhcikgPT4gISgvXlxccyQvLnRlc3QoY2hhcikpKTtcbn1cblxuZnVuY3Rpb24gX2dyb3dFZGl0cyhyZXBsYWNlbWVudHM6IFRleHRSZXBsYWNlbWVudFtdLCBvcmlnaW5hbFRleHQ6IEFic3RyYWN0VGV4dCwgZm46IChjOiBzdHJpbmcpID0+IGJvb2xlYW4pOiBUZXh0UmVwbGFjZW1lbnRbXSB7XG5cdGNvbnN0IHJlc3VsdDogVGV4dFJlcGxhY2VtZW50W10gPSBbXTtcblxuXHRyZXBsYWNlbWVudHMuc29ydCgoYSwgYikgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpKTtcblxuXHRmb3IgKGNvbnN0IGVkaXQgb2YgcmVwbGFjZW1lbnRzKSB7XG5cdFx0bGV0IHN0YXJ0SW5kZXggPSBlZGl0LnJhbmdlLnN0YXJ0Q29sdW1uIC0gMTtcblx0XHRsZXQgZW5kSW5kZXggPSBlZGl0LnJhbmdlLmVuZENvbHVtbiAtIDI7XG5cdFx0bGV0IHByZWZpeCA9ICcnO1xuXHRcdGxldCBzdWZmaXggPSAnJztcblx0XHRjb25zdCBzdGFydExpbmVDb250ZW50ID0gb3JpZ2luYWxUZXh0LmdldExpbmVBdChlZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3QgZW5kTGluZUNvbnRlbnQgPSBvcmlnaW5hbFRleHQuZ2V0TGluZUF0KGVkaXQucmFuZ2UuZW5kTGluZU51bWJlcik7XG5cblx0XHRpZiAoaXNJbmNsdWRlZChzdGFydExpbmVDb250ZW50W3N0YXJ0SW5kZXhdKSkge1xuXHRcdFx0Ly8gZ3JvdyB0byB0aGUgbGVmdFxuXHRcdFx0d2hpbGUgKGlzSW5jbHVkZWQoc3RhcnRMaW5lQ29udGVudFtzdGFydEluZGV4IC0gMV0pKSB7XG5cdFx0XHRcdHByZWZpeCA9IHN0YXJ0TGluZUNvbnRlbnRbc3RhcnRJbmRleCAtIDFdICsgcHJlZml4O1xuXHRcdFx0XHRzdGFydEluZGV4LS07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzSW5jbHVkZWQoZW5kTGluZUNvbnRlbnRbZW5kSW5kZXhdKSB8fCBlbmRJbmRleCA8IHN0YXJ0SW5kZXgpIHtcblx0XHRcdC8vIGdyb3cgdG8gdGhlIHJpZ2h0XG5cdFx0XHR3aGlsZSAoaXNJbmNsdWRlZChlbmRMaW5lQ29udGVudFtlbmRJbmRleCArIDFdKSkge1xuXHRcdFx0XHRzdWZmaXggKz0gZW5kTGluZUNvbnRlbnRbZW5kSW5kZXggKyAxXTtcblx0XHRcdFx0ZW5kSW5kZXgrKztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBjcmVhdGUgbmV3IGVkaXQgYW5kIG1lcmdlIHRvZ2V0aGVyIGlmIHRoZXkgYXJlIHRvdWNoaW5nXG5cdFx0bGV0IG5ld0VkaXQgPSBuZXcgVGV4dFJlcGxhY2VtZW50KG5ldyBSYW5nZShlZGl0LnJhbmdlLnN0YXJ0TGluZU51bWJlciwgc3RhcnRJbmRleCArIDEsIGVkaXQucmFuZ2UuZW5kTGluZU51bWJlciwgZW5kSW5kZXggKyAyKSwgcHJlZml4ICsgZWRpdC50ZXh0ICsgc3VmZml4KTtcblx0XHRpZiAocmVzdWx0Lmxlbmd0aCA+IDAgJiYgUmFuZ2UuYXJlSW50ZXJzZWN0aW5nT3JUb3VjaGluZyhyZXN1bHRbcmVzdWx0Lmxlbmd0aCAtIDFdLnJhbmdlLCBuZXdFZGl0LnJhbmdlKSkge1xuXHRcdFx0bmV3RWRpdCA9IFRleHRSZXBsYWNlbWVudC5qb2luUmVwbGFjZW1lbnRzKFtyZXN1bHQucG9wKCkhLCBuZXdFZGl0XSwgb3JpZ2luYWxUZXh0KTtcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaChuZXdFZGl0KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzSW5jbHVkZWQoYzogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKGMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gZm4oYyk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVM7QUFDbEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CLHlCQUF5QjtBQUN0RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLFNBQVMsYUFBbUMsMEJBQTBCLHVCQUF1QjtBQUMvRyxTQUFTLDZCQUE2QjtBQUV0QyxTQUErQiw0QkFBNEI7QUFDM0QsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQXVCLGtCQUFrQjtBQUN6QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFtQyxtQ0FBbUMsb0JBQW9CO0FBRTFGLFNBQVMsaUJBQWlCO0FBSzFCLFNBQVMsMEJBQTBCLDBCQUEwQiwyQkFBMkI7QUFDeEYsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBb0QsbUNBQW1DO0FBQ3ZGLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsZ0NBQWdD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LE9BQU8sS0FBSyxJQUFJLENBQUU7QUFDN0U7QUFFQSxTQUFTLFdBQVcsY0FBaUMsY0FBNEIsSUFBK0M7QUFDL0gsUUFBTSxTQUE0QixDQUFDO0FBRW5DLGVBQWEsS0FBSyxDQUFDLEdBQUcsTUFBTSxNQUFNLHlCQUF5QixFQUFFLE9BQU8sRUFBRSxLQUFLLENBQUM7QUFFNUUsYUFBVyxRQUFRLGNBQWM7QUFDaEMsUUFBSSxhQUFhLEtBQUssTUFBTSxjQUFjO0FBQzFDLFFBQUksV0FBVyxLQUFLLE1BQU0sWUFBWTtBQUN0QyxRQUFJLFNBQVM7QUFDYixRQUFJLFNBQVM7QUFDYixVQUFNLG1CQUFtQixhQUFhLFVBQVUsS0FBSyxNQUFNLGVBQWU7QUFDMUUsVUFBTSxpQkFBaUIsYUFBYSxVQUFVLEtBQUssTUFBTSxhQUFhO0FBRXRFLFFBQUksV0FBVyxpQkFBaUIsVUFBVSxDQUFDLEdBQUc7QUFFN0MsYUFBTyxXQUFXLGlCQUFpQixhQUFhLENBQUMsQ0FBQyxHQUFHO0FBQ3BELGlCQUFTLGlCQUFpQixhQUFhLENBQUMsSUFBSTtBQUM1QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxXQUFXLGVBQWUsUUFBUSxDQUFDLEtBQUssV0FBVyxZQUFZO0FBRWxFLGFBQU8sV0FBVyxlQUFlLFdBQVcsQ0FBQyxDQUFDLEdBQUc7QUFDaEQsa0JBQVUsZUFBZSxXQUFXLENBQUM7QUFDckM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFFBQUksVUFBVSxJQUFJLGdCQUFnQixJQUFJLE1BQU0sS0FBSyxNQUFNLGlCQUFpQixhQUFhLEdBQUcsS0FBSyxNQUFNLGVBQWUsV0FBVyxDQUFDLEdBQUcsU0FBUyxLQUFLLE9BQU8sTUFBTTtBQUM1SixRQUFJLE9BQU8sU0FBUyxLQUFLLE1BQU0sMEJBQTBCLE9BQU8sT0FBTyxTQUFTLENBQUMsRUFBRSxPQUFPLFFBQVEsS0FBSyxHQUFHO0FBQ3pHLGdCQUFVLGdCQUFnQixpQkFBaUIsQ0FBQyxPQUFPLElBQUksR0FBSSxPQUFPLEdBQUcsWUFBWTtBQUFBLElBQ2xGO0FBRUEsV0FBTyxLQUFLLE9BQU87QUFBQSxFQUNwQjtBQUVBLFdBQVMsV0FBVyxHQUF1QjtBQUMxQyxRQUFJLE1BQU0sUUFBVztBQUNwQixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sR0FBRyxDQUFDO0FBQUEsRUFDWjtBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsicmVhZGVyIl0KfQo=
