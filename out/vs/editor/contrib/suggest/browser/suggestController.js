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
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { onUnexpectedError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore, dispose, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { assertType, isObject } from "../../../../base/common/types.js";
import { StableEditorScrollState } from "../../../browser/stableEditorScroll.js";
import { EditorAction, EditorCommand, EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { CompletionItemInsertTextRule, CompletionTriggerKind, ProviderId } from "../../../common/languages.js";
import { SnippetController2 } from "../../snippet/browser/snippetController2.js";
import { SnippetParser } from "../../snippet/browser/snippetParser.js";
import { ISuggestMemoryService } from "./suggestMemory.js";
import { WordContextKey } from "./wordContextKey.js";
import * as nls from "../../../../nls.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Context as SuggestContext, suggestWidgetStatusbarMenu } from "./suggest.js";
import { SuggestAlternatives } from "./suggestAlternatives.js";
import { CommitCharacterController } from "./suggestCommitCharacters.js";
import { State, SuggestModel } from "./suggestModel.js";
import { OvertypingCapturer } from "./suggestOvertypingCapturer.js";
import { SuggestWidget } from "./suggestWidget.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { basename, extname } from "../../../../base/common/resources.js";
import { hash } from "../../../../base/common/hash.js";
import { WindowIdleValue, getWindow } from "../../../../base/browser/dom.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { EditSources } from "../../../common/textModelEditSource.js";
const _sticky = false;
class LineSuffix {
  constructor(_model, _position) {
    this._model = _model;
    this._position = _position;
    this._decorationOptions = ModelDecorationOptions.register({
      description: "suggest-line-suffix",
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
    const maxColumn = _model.getLineMaxColumn(_position.lineNumber);
    if (maxColumn !== _position.column) {
      const offset = _model.getOffsetAt(_position);
      const end = _model.getPositionAt(offset + 1);
      _model.changeDecorations((accessor) => {
        if (this._marker) {
          accessor.removeDecoration(this._marker);
        }
        this._marker = accessor.addDecoration(Range.fromPositions(_position, end), this._decorationOptions);
      });
    }
  }
  dispose() {
    if (this._marker && !this._model.isDisposed()) {
      this._model.changeDecorations((accessor) => {
        accessor.removeDecoration(this._marker);
        this._marker = void 0;
      });
    }
  }
  delta(position) {
    if (this._model.isDisposed() || this._position.lineNumber !== position.lineNumber) {
      return 0;
    }
    if (this._marker) {
      const range = this._model.getDecorationRange(this._marker);
      const end = this._model.getOffsetAt(range.getStartPosition());
      return end - this._model.getOffsetAt(position);
    } else {
      return this._model.getLineMaxColumn(position.lineNumber) - position.column;
    }
  }
}
var InsertFlags = /* @__PURE__ */ ((InsertFlags2) => {
  InsertFlags2[InsertFlags2["None"] = 0] = "None";
  InsertFlags2[InsertFlags2["NoBeforeUndoStop"] = 1] = "NoBeforeUndoStop";
  InsertFlags2[InsertFlags2["NoAfterUndoStop"] = 2] = "NoAfterUndoStop";
  InsertFlags2[InsertFlags2["KeepAlternativeSuggestions"] = 4] = "KeepAlternativeSuggestions";
  InsertFlags2[InsertFlags2["AlternativeOverwriteConfig"] = 8] = "AlternativeOverwriteConfig";
  return InsertFlags2;
})(InsertFlags || {});
let SuggestController = class {
  constructor(editor, _memoryService, _commandService, _contextKeyService, _instantiationService, _logService, _telemetryService) {
    this._memoryService = _memoryService;
    this._commandService = _commandService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._telemetryService = _telemetryService;
    this._lineSuffix = new MutableDisposable();
    this._toDispose = new DisposableStore();
    this._selectors = new PriorityRegistry((s) => s.priority);
    this._onWillInsertSuggestItem = new Emitter();
    this._wantsForceRenderingAbove = false;
    this.editor = editor;
    this.model = _instantiationService.createInstance(SuggestModel, this.editor);
    this._selectors.register({
      priority: 0,
      select: (model, pos, items) => this._memoryService.select(model, pos, items)
    });
    const ctxInsertMode = SuggestContext.InsertMode.bindTo(_contextKeyService);
    ctxInsertMode.set(editor.getOption(EditorOption.suggest).insertMode);
    this._toDispose.add(this.model.onDidTrigger(() => ctxInsertMode.set(editor.getOption(EditorOption.suggest).insertMode)));
    this.widget = this._toDispose.add(new WindowIdleValue(getWindow(editor.getDomNode()), () => {
      const widget = this._instantiationService.createInstance(SuggestWidget, this.editor);
      this._toDispose.add(widget);
      this._toDispose.add(widget.onDidSelect((item) => this._insertSuggestion(item, 0 /* None */), this));
      const commitCharacterController = new CommitCharacterController(this.editor, widget, this.model, (item) => this._insertSuggestion(item, 2 /* NoAfterUndoStop */));
      this._toDispose.add(commitCharacterController);
      const ctxMakesTextEdit = SuggestContext.MakesTextEdit.bindTo(this._contextKeyService);
      const ctxHasInsertAndReplace = SuggestContext.HasInsertAndReplaceRange.bindTo(this._contextKeyService);
      const ctxCanResolve = SuggestContext.CanResolve.bindTo(this._contextKeyService);
      this._toDispose.add(toDisposable(() => {
        ctxMakesTextEdit.reset();
        ctxHasInsertAndReplace.reset();
        ctxCanResolve.reset();
      }));
      this._toDispose.add(widget.onDidFocus(({ item }) => {
        const position = this.editor.getPosition();
        const startColumn = item.editStart.column;
        const endColumn = position.column;
        let value = true;
        if (this.editor.getOption(EditorOption.acceptSuggestionOnEnter) === "smart" && this.model.state === State.Auto && !item.completion.additionalTextEdits && !(item.completion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet) && endColumn - startColumn === item.completion.insertText.length) {
          const oldText = this.editor.getModel().getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn,
            endLineNumber: position.lineNumber,
            endColumn
          });
          value = oldText !== item.completion.insertText;
        }
        ctxMakesTextEdit.set(value);
        ctxHasInsertAndReplace.set(!Position.equals(item.editInsertEnd, item.editReplaceEnd));
        ctxCanResolve.set(Boolean(item.provider.resolveCompletionItem) || Boolean(item.completion.documentation) || item.completion.detail !== item.completion.label);
      }));
      if (this._wantsForceRenderingAbove) {
        widget.forceRenderingAbove();
      }
      return widget;
    }));
    this._overtypingCapturer = this._toDispose.add(new WindowIdleValue(getWindow(editor.getDomNode()), () => {
      return this._toDispose.add(new OvertypingCapturer(this.editor, this.model));
    }));
    this._alternatives = this._toDispose.add(new WindowIdleValue(getWindow(editor.getDomNode()), () => {
      return this._toDispose.add(new SuggestAlternatives(this.editor, this._contextKeyService));
    }));
    this._toDispose.add(_instantiationService.createInstance(WordContextKey, editor));
    this._toDispose.add(this.model.onDidTrigger((e) => {
      this.widget.value.showTriggered(e.auto, e.shy ? 250 : 50);
      this._lineSuffix.value = new LineSuffix(this.editor.getModel(), e.position);
    }));
    this._toDispose.add(this.model.onDidSuggest((e) => {
      if (e.triggerOptions.shy) {
        return;
      }
      let index = -1;
      for (const selector of this._selectors.itemsOrderedByPriorityDesc) {
        index = selector.select(this.editor.getModel(), this.editor.getPosition(), e.completionModel.items);
        if (index !== -1) {
          break;
        }
      }
      if (index === -1) {
        index = 0;
      }
      if (this.model.state === State.Idle) {
        return;
      }
      let noFocus = false;
      if (e.triggerOptions.auto) {
        const options = this.editor.getOption(EditorOption.suggest);
        if (options.selectionMode === "never" || options.selectionMode === "always") {
          noFocus = options.selectionMode === "never";
        } else if (options.selectionMode === "whenTriggerCharacter") {
          noFocus = e.triggerOptions.triggerKind !== CompletionTriggerKind.TriggerCharacter;
        } else if (options.selectionMode === "whenQuickSuggestion") {
          noFocus = e.triggerOptions.triggerKind === CompletionTriggerKind.TriggerCharacter && !e.triggerOptions.refilter;
        }
      }
      this.widget.value.showSuggestions(e.completionModel, index, e.isFrozen, e.triggerOptions.auto, noFocus);
    }));
    this._toDispose.add(this.model.onDidCancel((e) => {
      if (!e.retrigger) {
        this.widget.value.hideWidget();
      }
    }));
    this._toDispose.add(this.editor.onDidBlurEditorWidget(() => {
      if (!_sticky) {
        this.model.cancel();
        this.model.clear();
      }
    }));
    const acceptSuggestionsOnEnter = SuggestContext.AcceptSuggestionsOnEnter.bindTo(_contextKeyService);
    const updateFromConfig = () => {
      const acceptSuggestionOnEnter = this.editor.getOption(EditorOption.acceptSuggestionOnEnter);
      acceptSuggestionsOnEnter.set(acceptSuggestionOnEnter === "on" || acceptSuggestionOnEnter === "smart");
    };
    this._toDispose.add(this.editor.onDidChangeConfiguration(() => updateFromConfig()));
    updateFromConfig();
  }
  static get(editor) {
    return editor.getContribution(SuggestController.ID);
  }
  get onWillInsertSuggestItem() {
    return this._onWillInsertSuggestItem.event;
  }
  dispose() {
    this._alternatives.dispose();
    this._toDispose.dispose();
    this.widget.dispose();
    this.model.dispose();
    this._lineSuffix.dispose();
    this._onWillInsertSuggestItem.dispose();
  }
  _insertSuggestion(event, flags) {
    if (!event || !event.item) {
      this._alternatives.value.reset();
      this.model.cancel();
      this.model.clear();
      return;
    }
    if (!this.editor.hasModel()) {
      return;
    }
    const snippetController = SnippetController2.get(this.editor);
    if (!snippetController) {
      return;
    }
    this._onWillInsertSuggestItem.fire({ item: event.item });
    const model = this.editor.getModel();
    const modelVersionNow = model.getAlternativeVersionId();
    const { item } = event;
    const tasks = [];
    const cts = new CancellationTokenSource();
    if (!(flags & 1 /* NoBeforeUndoStop */)) {
      this.editor.pushUndoStop();
    }
    const info = this.getOverwriteInfo(item, Boolean(flags & 8 /* AlternativeOverwriteConfig */));
    this._memoryService.memorize(model, this.editor.getPosition(), item);
    const isResolved = item.isResolved;
    let _commandExectionDuration = -1;
    let _additionalEditsAppliedAsync = -1;
    if (Array.isArray(item.completion.additionalTextEdits)) {
      this.model.cancel();
      const scrollState = StableEditorScrollState.capture(this.editor);
      this.editor.executeEdits(
        "suggestController.additionalTextEdits.sync",
        item.completion.additionalTextEdits.map((edit) => {
          let range = Range.lift(edit.range);
          if (range.startLineNumber === item.position.lineNumber && range.startColumn > item.position.column) {
            const columnDelta = this.editor.getPosition().column - item.position.column;
            const startColumnDelta = columnDelta;
            const endColumnDelta = Range.spansMultipleLines(range) ? 0 : columnDelta;
            range = new Range(range.startLineNumber, range.startColumn + startColumnDelta, range.endLineNumber, range.endColumn + endColumnDelta);
          }
          return EditOperation.replaceMove(range, edit.text);
        })
      );
      scrollState.restoreRelativeVerticalPositionOfCursor(this.editor);
    } else if (!isResolved) {
      const sw = new StopWatch();
      let position;
      const docListener = model.onDidChangeContent((e) => {
        if (e.isFlush) {
          cts.cancel();
          docListener.dispose();
          return;
        }
        for (const change of e.changes) {
          const thisPosition = Range.getEndPosition(change.range);
          if (!position || Position.isBefore(thisPosition, position)) {
            position = thisPosition;
          }
        }
      });
      const oldFlags = flags;
      flags |= 2 /* NoAfterUndoStop */;
      let didType = false;
      const typeListener = this.editor.onWillType(() => {
        typeListener.dispose();
        didType = true;
        if (!(oldFlags & 2 /* NoAfterUndoStop */)) {
          this.editor.pushUndoStop();
        }
      });
      tasks.push(item.resolve(cts.token).then(() => {
        if (!item.completion.additionalTextEdits || cts.token.isCancellationRequested) {
          return void 0;
        }
        if (position && item.completion.additionalTextEdits.some((edit) => Position.isBefore(position, Range.getStartPosition(edit.range)))) {
          return false;
        }
        if (didType) {
          this.editor.pushUndoStop();
        }
        const scrollState = StableEditorScrollState.capture(this.editor);
        this.editor.executeEdits(
          "suggestController.additionalTextEdits.async",
          item.completion.additionalTextEdits.map((edit) => EditOperation.replaceMove(Range.lift(edit.range), edit.text))
        );
        scrollState.restoreRelativeVerticalPositionOfCursor(this.editor);
        if (didType || !(oldFlags & 2 /* NoAfterUndoStop */)) {
          this.editor.pushUndoStop();
        }
        return true;
      }).then((applied) => {
        this._logService.trace("[suggest] async resolving of edits DONE (ms, applied?)", sw.elapsed(), applied);
        _additionalEditsAppliedAsync = applied === true ? 1 : applied === false ? 0 : -2;
      }).finally(() => {
        docListener.dispose();
        typeListener.dispose();
      }));
    }
    let { insertText } = item.completion;
    if (!(item.completion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet)) {
      insertText = SnippetParser.escape(insertText);
    }
    this.model.cancel();
    snippetController.insert(insertText, {
      overwriteBefore: info.overwriteBefore,
      overwriteAfter: info.overwriteAfter,
      undoStopBefore: false,
      undoStopAfter: false,
      adjustWhitespace: !(item.completion.insertTextRules & CompletionItemInsertTextRule.KeepWhitespace),
      clipboardText: event.model.clipboardText,
      overtypingCapturer: this._overtypingCapturer.value,
      reason: EditSources.suggest({ providerId: ProviderId.fromExtensionId(item.extensionId?.value) })
    });
    if (!(flags & 2 /* NoAfterUndoStop */)) {
      this.editor.pushUndoStop();
    }
    if (item.completion.command) {
      if (item.completion.command.id === TriggerSuggestAction.id) {
        this.model.trigger({ auto: true, retrigger: true });
      } else {
        const sw = new StopWatch();
        tasks.push(this._commandService.executeCommand(item.completion.command.id, ...item.completion.command.arguments ? [...item.completion.command.arguments] : []).catch((e) => {
          if (item.completion.extensionId) {
            onUnexpectedExternalError(e);
          } else {
            onUnexpectedError(e);
          }
        }).finally(() => {
          _commandExectionDuration = sw.elapsed();
        }));
      }
    }
    if (flags & 4 /* KeepAlternativeSuggestions */) {
      this._alternatives.value.set(event, (next) => {
        cts.cancel();
        while (model.canUndo()) {
          if (modelVersionNow !== model.getAlternativeVersionId()) {
            model.undo();
          }
          this._insertSuggestion(
            next,
            1 /* NoBeforeUndoStop */ | 2 /* NoAfterUndoStop */ | (flags & 8 /* AlternativeOverwriteConfig */ ? 8 /* AlternativeOverwriteConfig */ : 0)
          );
          break;
        }
      });
    }
    this._alertCompletionItem(item);
    Promise.all(tasks).finally(() => {
      this._reportSuggestionAcceptedTelemetry(item, model, isResolved, _commandExectionDuration, _additionalEditsAppliedAsync, event.index, event.model.items);
      this.model.clear();
      cts.dispose();
    });
  }
  _reportSuggestionAcceptedTelemetry(item, model, itemResolved, commandExectionDuration, additionalEditsAppliedAsync, index, completionItems) {
    if (Math.random() > 1e-4) {
      return;
    }
    const labelMap = /* @__PURE__ */ new Map();
    for (let i = 0; i < Math.min(30, completionItems.length); i++) {
      const label = completionItems[i].textLabel;
      if (labelMap.has(label)) {
        labelMap.get(label).push(i);
      } else {
        labelMap.set(label, [i]);
      }
    }
    const firstIndexArray = labelMap.get(item.textLabel);
    const hasDuplicates = firstIndexArray && firstIndexArray.length > 1;
    const firstIndex = hasDuplicates ? firstIndexArray[0] : -1;
    this._telemetryService.publicLog2("suggest.acceptedSuggestion", {
      extensionId: item.extensionId?.value ?? "unknown",
      providerId: item.provider._debugDisplayName ?? "unknown",
      kind: item.completion.kind,
      basenameHash: hash(basename(model.uri)).toString(16),
      languageId: model.getLanguageId(),
      fileExtension: extname(model.uri),
      resolveInfo: !item.provider.resolveCompletionItem ? -1 : itemResolved ? 1 : 0,
      resolveDuration: item.resolveDuration,
      commandDuration: commandExectionDuration,
      additionalEditsAsync: additionalEditsAppliedAsync,
      index,
      firstIndex
    });
  }
  getOverwriteInfo(item, toggleMode) {
    assertType(this.editor.hasModel());
    let replace = this.editor.getOption(EditorOption.suggest).insertMode === "replace";
    if (toggleMode) {
      replace = !replace;
    }
    const overwriteBefore = item.position.column - item.editStart.column;
    const overwriteAfter = (replace ? item.editReplaceEnd.column : item.editInsertEnd.column) - item.position.column;
    const columnDelta = this.editor.getPosition().column - item.position.column;
    const suffixDelta = this._lineSuffix.value ? this._lineSuffix.value.delta(this.editor.getPosition()) : 0;
    return {
      overwriteBefore: overwriteBefore + columnDelta,
      overwriteAfter: overwriteAfter + suffixDelta
    };
  }
  _alertCompletionItem(item) {
    if (isNonEmptyArray(item.completion.additionalTextEdits)) {
      const msg = nls.localize("aria.alert.snippet", "Accepting '{0}' made {1} additional edits", item.textLabel, item.completion.additionalTextEdits.length);
      alert(msg);
    }
  }
  triggerSuggest(onlyFrom, auto, noFilter) {
    if (this.editor.hasModel()) {
      this.model.trigger({
        auto: auto ?? false,
        completionOptions: { providerFilter: onlyFrom, kindFilter: noFilter ? /* @__PURE__ */ new Set() : void 0 }
      });
      this.editor.revealPosition(this.editor.getPosition(), ScrollType.Smooth);
      this.editor.focus();
    }
  }
  triggerSuggestAndAcceptBest(arg) {
    if (!this.editor.hasModel()) {
      return;
    }
    const positionNow = this.editor.getPosition();
    const fallback = () => {
      if (positionNow.equals(this.editor.getPosition())) {
        this._commandService.executeCommand(arg.fallback);
      }
    };
    const makesTextEdit = (item) => {
      if (item.completion.insertTextRules & CompletionItemInsertTextRule.InsertAsSnippet || item.completion.additionalTextEdits) {
        return true;
      }
      const position = this.editor.getPosition();
      const startColumn = item.editStart.column;
      const endColumn = position.column;
      if (endColumn - startColumn !== item.completion.insertText.length) {
        return true;
      }
      const textNow = this.editor.getModel().getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn,
        endLineNumber: position.lineNumber,
        endColumn
      });
      return textNow !== item.completion.insertText;
    };
    Event.once(this.model.onDidTrigger)((_) => {
      const listener = [];
      Event.any(this.model.onDidTrigger, this.model.onDidCancel)(() => {
        dispose(listener);
        fallback();
      }, void 0, listener);
      this.model.onDidSuggest(({ completionModel }) => {
        dispose(listener);
        if (completionModel.items.length === 0) {
          fallback();
          return;
        }
        const index = this._memoryService.select(this.editor.getModel(), this.editor.getPosition(), completionModel.items);
        const item = completionModel.items[index];
        if (!makesTextEdit(item)) {
          fallback();
          return;
        }
        this.editor.pushUndoStop();
        this._insertSuggestion({ index, item, model: completionModel }, 4 /* KeepAlternativeSuggestions */ | 1 /* NoBeforeUndoStop */ | 2 /* NoAfterUndoStop */);
      }, void 0, listener);
    });
    this.model.trigger({ auto: false, shy: true });
    this.editor.revealPosition(positionNow, ScrollType.Smooth);
    this.editor.focus();
  }
  acceptSelectedSuggestion(keepAlternativeSuggestions, alternativeOverwriteConfig) {
    const item = this.widget.value.getFocusedItem();
    let flags = 0;
    if (keepAlternativeSuggestions) {
      flags |= 4 /* KeepAlternativeSuggestions */;
    }
    if (alternativeOverwriteConfig) {
      flags |= 8 /* AlternativeOverwriteConfig */;
    }
    this._insertSuggestion(item, flags);
  }
  acceptNextSuggestion() {
    this._alternatives.value.next();
  }
  acceptPrevSuggestion() {
    this._alternatives.value.prev();
  }
  cancelSuggestWidget() {
    this.model.cancel();
    this.model.clear();
    this.widget.value.hideWidget();
  }
  focusSuggestion() {
    this.widget.value.focusSelected();
  }
  selectNextSuggestion() {
    this.widget.value.selectNext();
  }
  selectNextPageSuggestion() {
    this.widget.value.selectNextPage();
  }
  selectLastSuggestion() {
    this.widget.value.selectLast();
  }
  selectPrevSuggestion() {
    this.widget.value.selectPrevious();
  }
  selectPrevPageSuggestion() {
    this.widget.value.selectPreviousPage();
  }
  selectFirstSuggestion() {
    this.widget.value.selectFirst();
  }
  toggleSuggestionDetails() {
    this.widget.value.toggleDetails();
  }
  toggleExplainMode() {
    this.widget.value.toggleExplainMode();
  }
  toggleSuggestionFocus() {
    this.widget.value.toggleDetailsFocus();
  }
  resetWidgetSize() {
    this.widget.value.resetPersistedSize();
  }
  forceRenderingAbove() {
    if (this.widget.isInitialized) {
      this.widget.value.forceRenderingAbove();
    } else {
      this._wantsForceRenderingAbove = true;
    }
  }
  stopForceRenderingAbove() {
    if (this.widget.isInitialized) {
      this.widget.value.stopForceRenderingAbove();
    } else {
      this._wantsForceRenderingAbove = false;
    }
  }
  registerSelector(selector) {
    return this._selectors.register(selector);
  }
};
SuggestController.ID = "editor.contrib.suggestController";
SuggestController = __decorateClass([
  __decorateParam(1, ISuggestMemoryService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ITelemetryService)
], SuggestController);
class PriorityRegistry {
  constructor(prioritySelector) {
    this.prioritySelector = prioritySelector;
    this._items = new Array();
  }
  register(value) {
    if (this._items.indexOf(value) !== -1) {
      throw new Error("Value is already registered");
    }
    this._items.push(value);
    this._items.sort((s1, s2) => this.prioritySelector(s2) - this.prioritySelector(s1));
    return {
      dispose: () => {
        const idx = this._items.indexOf(value);
        if (idx >= 0) {
          this._items.splice(idx, 1);
        }
      }
    };
  }
  get itemsOrderedByPriorityDesc() {
    return this._items;
  }
}
const _TriggerSuggestAction = class _TriggerSuggestAction extends EditorAction {
  constructor() {
    super({
      id: _TriggerSuggestAction.id,
      label: nls.localize2("suggest.trigger.label", "Trigger Suggest"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasCompletionItemProvider, SuggestContext.Visible.toNegated()),
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyCode.Space,
        secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
        mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.Alt | KeyCode.Escape, KeyMod.CtrlCmd | KeyCode.KeyI] },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(_accessor, editor, args) {
    const controller = SuggestController.get(editor);
    if (!controller) {
      return;
    }
    let auto;
    if (args && typeof args === "object") {
      if (args.auto === true) {
        auto = true;
      }
    }
    controller.triggerSuggest(void 0, auto, void 0);
  }
};
_TriggerSuggestAction.id = "editor.action.triggerSuggest";
let TriggerSuggestAction = _TriggerSuggestAction;
registerEditorContribution(SuggestController.ID, SuggestController, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(TriggerSuggestAction);
const weight = KeybindingWeight.EditorContrib + 90;
const SuggestCommand = EditorCommand.bindToContribution(SuggestController.get);
registerEditorCommand(new SuggestCommand({
  id: "acceptSelectedSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion),
  handler(x) {
    x.acceptSelectedSuggestion(true, false);
  },
  kbOpts: [{
    // normal tab
    primary: KeyCode.Tab,
    kbExpr: ContextKeyExpr.and(SuggestContext.Visible, EditorContextKeys.textInputFocus),
    weight
  }, {
    // accept on enter has special rules
    primary: KeyCode.Enter,
    kbExpr: ContextKeyExpr.and(SuggestContext.Visible, EditorContextKeys.textInputFocus, SuggestContext.AcceptSuggestionsOnEnter, SuggestContext.MakesTextEdit),
    weight
  }],
  menuOpts: [{
    menuId: suggestWidgetStatusbarMenu,
    title: nls.localize("accept.insert", "Insert"),
    group: "left",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange.toNegated())
  }, {
    menuId: suggestWidgetStatusbarMenu,
    title: nls.localize("accept.insert", "Insert"),
    group: "left",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo("insert"))
  }, {
    menuId: suggestWidgetStatusbarMenu,
    title: nls.localize("accept.replace", "Replace"),
    group: "left",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo("replace"))
  }]
}));
registerEditorCommand(new SuggestCommand({
  id: "acceptAlternativeSelectedSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, EditorContextKeys.textInputFocus, SuggestContext.HasFocusedSuggestion),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.Shift | KeyCode.Enter,
    secondary: [KeyMod.Shift | KeyCode.Tab]
  },
  handler(x) {
    x.acceptSelectedSuggestion(false, true);
  },
  menuOpts: [{
    menuId: suggestWidgetStatusbarMenu,
    group: "left",
    order: 2,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo("insert")),
    title: nls.localize("accept.replace", "Replace")
  }, {
    menuId: suggestWidgetStatusbarMenu,
    group: "left",
    order: 2,
    when: ContextKeyExpr.and(SuggestContext.HasFocusedSuggestion, SuggestContext.HasInsertAndReplaceRange, SuggestContext.InsertMode.isEqualTo("replace")),
    title: nls.localize("accept.insert", "Insert")
  }]
}));
CommandsRegistry.registerCommandAlias("acceptSelectedSuggestionOnEnter", "acceptSelectedSuggestion");
registerEditorCommand(new SuggestCommand({
  id: "hideSuggestWidget",
  precondition: SuggestContext.Visible,
  handler: (x) => x.cancelSuggestWidget(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.Escape,
    secondary: [KeyMod.Shift | KeyCode.Escape]
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectNextSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectNextSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.DownArrow,
    secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
    mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow, KeyMod.WinCtrl | KeyCode.KeyN] }
  },
  menuOpts: {
    menuId: suggestWidgetStatusbarMenu,
    group: "left",
    order: 0,
    when: SuggestContext.HasFocusedSuggestion.toNegated(),
    title: nls.localize("focus.suggestion", "Select")
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectNextPageSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectNextPageSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.PageDown,
    secondary: [KeyMod.CtrlCmd | KeyCode.PageDown]
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectLastSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectLastSuggestion()
}));
registerEditorCommand(new SuggestCommand({
  id: "selectPrevSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectPrevSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.UpArrow,
    secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
    mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow, KeyMod.WinCtrl | KeyCode.KeyP] }
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectPrevPageSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectPrevPageSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.PageUp,
    secondary: [KeyMod.CtrlCmd | KeyCode.PageUp]
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "selectFirstSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, ContextKeyExpr.or(SuggestContext.MultipleSuggestions, SuggestContext.HasFocusedSuggestion.negate())),
  handler: (c) => c.selectFirstSuggestion()
}));
registerEditorCommand(new SuggestCommand({
  id: "focusSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion.negate()),
  handler: (x) => x.focusSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.CtrlCmd | KeyCode.Space,
    secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
    mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.CtrlCmd | KeyCode.KeyI] }
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "focusAndAcceptSuggestion",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion.negate()),
  handler: (c) => {
    c.focusSuggestion();
    c.acceptSelectedSuggestion(true, false);
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "toggleSuggestionDetails",
  precondition: ContextKeyExpr.and(SuggestContext.Visible, SuggestContext.HasFocusedSuggestion),
  handler: (x) => x.toggleSuggestionDetails(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.CtrlCmd | KeyCode.Space,
    secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
    mac: { primary: KeyMod.WinCtrl | KeyCode.Space, secondary: [KeyMod.CtrlCmd | KeyCode.KeyI] }
  },
  menuOpts: [{
    menuId: suggestWidgetStatusbarMenu,
    group: "right",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.DetailsVisible, SuggestContext.CanResolve),
    title: nls.localize("detail.more", "Show Less")
  }, {
    menuId: suggestWidgetStatusbarMenu,
    group: "right",
    order: 1,
    when: ContextKeyExpr.and(SuggestContext.DetailsVisible.toNegated(), SuggestContext.CanResolve),
    title: nls.localize("detail.less", "Show More")
  }]
}));
registerEditorCommand(new SuggestCommand({
  id: "toggleExplainMode",
  precondition: SuggestContext.Visible,
  handler: (x) => x.toggleExplainMode(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib,
    primary: KeyMod.CtrlCmd | KeyCode.Slash
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "toggleSuggestionFocus",
  precondition: SuggestContext.Visible,
  handler: (x) => x.toggleSuggestionFocus(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Space,
    mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Space }
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "insertBestCompletion",
  precondition: ContextKeyExpr.and(
    EditorContextKeys.textInputFocus,
    ContextKeyExpr.equals("config.editor.tabCompletion", "on"),
    WordContextKey.AtEnd,
    SuggestContext.Visible.toNegated(),
    SuggestAlternatives.OtherSuggestions.toNegated(),
    SnippetController2.InSnippetMode.toNegated()
  ),
  handler: (x, arg) => {
    x.triggerSuggestAndAcceptBest(isObject(arg) ? { fallback: "tab", ...arg } : { fallback: "tab" });
  },
  kbOpts: {
    weight,
    primary: KeyCode.Tab
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "insertNextSuggestion",
  precondition: ContextKeyExpr.and(
    EditorContextKeys.textInputFocus,
    ContextKeyExpr.equals("config.editor.tabCompletion", "on"),
    SuggestAlternatives.OtherSuggestions,
    SuggestContext.Visible.toNegated(),
    SnippetController2.InSnippetMode.toNegated()
  ),
  handler: (x) => x.acceptNextSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyCode.Tab
  }
}));
registerEditorCommand(new SuggestCommand({
  id: "insertPrevSuggestion",
  precondition: ContextKeyExpr.and(
    EditorContextKeys.textInputFocus,
    ContextKeyExpr.equals("config.editor.tabCompletion", "on"),
    SuggestAlternatives.OtherSuggestions,
    SuggestContext.Visible.toNegated(),
    SnippetController2.InSnippetMode.toNegated()
  ),
  handler: (x) => x.acceptPrevSuggestion(),
  kbOpts: {
    weight,
    kbExpr: EditorContextKeys.textInputFocus,
    primary: KeyMod.Shift | KeyCode.Tab
  }
}));
registerEditorCommand(new class extends EditorCommand {
  constructor() {
    super({
      id: "suggestWidgetCopy",
      precondition: SuggestContext.DetailsFocused,
      kbOpts: {
        weight: weight + 10,
        kbExpr: SuggestContext.DetailsFocused,
        primary: KeyMod.CtrlCmd | KeyCode.KeyC,
        win: { primary: KeyMod.CtrlCmd | KeyCode.KeyC, secondary: [KeyMod.CtrlCmd | KeyCode.Insert] }
      }
    });
  }
  runEditorCommand(_accessor, editor) {
    getWindow(editor.getDomNode()).document.execCommand("copy");
  }
}());
registerEditorAction(class extends EditorAction {
  constructor() {
    super({
      id: "editor.action.resetSuggestSize",
      label: nls.localize2("suggest.reset.label", "Reset Suggest Widget Size"),
      precondition: void 0
    });
  }
  run(_accessor, editor) {
    SuggestController.get(editor)?.resetWidgetSize();
  }
});
export {
  SuggestController,
  TriggerSuggestAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXGJyb3dzZXJcXHN1Z2dlc3RDb250cm9sbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUsIGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3N0YWJsZUVkaXRvclNjcm9sbC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbW1hbmQsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbW1hbmQsIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uLCBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUsIENvbXBsZXRpb25JdGVtUHJvdmlkZXIsIENvbXBsZXRpb25UcmlnZ2VyS2luZCwgUHJvdmlkZXJJZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vc25pcHBldC9icm93c2VyL3NuaXBwZXRDb250cm9sbGVyMi5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0UGFyc2VyIH0gZnJvbSAnLi4vLi4vc25pcHBldC9icm93c2VyL3NuaXBwZXRQYXJzZXIuanMnO1xuaW1wb3J0IHsgSVN1Z2dlc3RNZW1vcnlTZXJ2aWNlIH0gZnJvbSAnLi9zdWdnZXN0TWVtb3J5LmpzJztcbmltcG9ydCB7IFdvcmRDb250ZXh0S2V5IH0gZnJvbSAnLi93b3JkQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW0sIENvbnRleHQgYXMgU3VnZ2VzdENvbnRleHQsIElTdWdnZXN0SXRlbVByZXNlbGVjdG9yLCBzdWdnZXN0V2lkZ2V0U3RhdHVzYmFyTWVudSB9IGZyb20gJy4vc3VnZ2VzdC5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0QWx0ZXJuYXRpdmVzIH0gZnJvbSAnLi9zdWdnZXN0QWx0ZXJuYXRpdmVzLmpzJztcbmltcG9ydCB7IENvbW1pdENoYXJhY3RlckNvbnRyb2xsZXIgfSBmcm9tICcuL3N1Z2dlc3RDb21taXRDaGFyYWN0ZXJzLmpzJztcbmltcG9ydCB7IFN0YXRlLCBTdWdnZXN0TW9kZWwgfSBmcm9tICcuL3N1Z2dlc3RNb2RlbC5qcyc7XG5pbXBvcnQgeyBPdmVydHlwaW5nQ2FwdHVyZXIgfSBmcm9tICcuL3N1Z2dlc3RPdmVydHlwaW5nQ2FwdHVyZXIuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGVkU3VnZ2VzdGlvbiwgU3VnZ2VzdFdpZGdldCB9IGZyb20gJy4vc3VnZ2VzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBleHRuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IFdpbmRvd0lkbGVWYWx1ZSwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcblxuLy8gc3RpY2t5IHN1Z2dlc3Qgd2lkZ2V0IHdoaWNoIGRvZXNuJ3QgZGlzYXBwZWFyIG9uIGZvY3VzIG91dCBhbmQgc3VjaFxuY29uc3QgX3N0aWNreSA9IGZhbHNlXG5cdC8vIHx8IEJvb2xlYW4oXCJ0cnVlXCIpIC8vIGRvbmUgXCJ3ZWlyZGx5XCIgc28gdGhhdCBhIGxpbnQgd2FybmluZyBwcmV2ZW50cyB5b3UgZnJvbSBwdXNoaW5nIHRoaXNcblx0O1xuXG5jbGFzcyBMaW5lU3VmZml4IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uT3B0aW9ucyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGRlc2NyaXB0aW9uOiAnc3VnZ2VzdC1saW5lLXN1ZmZpeCcsXG5cdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXNcblx0fSk7XG5cblx0cHJpdmF0ZSBfbWFya2VyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElUZXh0TW9kZWwsIHByaXZhdGUgcmVhZG9ubHkgX3Bvc2l0aW9uOiBJUG9zaXRpb24pIHtcblx0XHQvLyBzcHkgb24gd2hhdCdzIGhhcHBlbmluZyByaWdodCBvZiB0aGUgY3Vyc29yLiB0d28gY2FzZXM6XG5cdFx0Ly8gMS4gZW5kIG9mIGxpbmUgLT4gY2hlY2sgdGhhdCBpdCdzIHN0aWxsIGVuZCBvZiBsaW5lXG5cdFx0Ly8gMi4gbWlkIG9mIGxpbmUgLT4gYWRkIGEgbWFya2VyIGFuZCBjb21wdXRlIHRoZSBkZWx0YVxuXHRcdGNvbnN0IG1heENvbHVtbiA9IF9tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKF9wb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRpZiAobWF4Q29sdW1uICE9PSBfcG9zaXRpb24uY29sdW1uKSB7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSBfbW9kZWwuZ2V0T2Zmc2V0QXQoX3Bvc2l0aW9uKTtcblx0XHRcdGNvbnN0IGVuZCA9IF9tb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIDEpO1xuXHRcdFx0X21vZGVsLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX21hcmtlcikge1xuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24odGhpcy5fbWFya2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9tYXJrZXIgPSBhY2Nlc3Nvci5hZGREZWNvcmF0aW9uKFJhbmdlLmZyb21Qb3NpdGlvbnMoX3Bvc2l0aW9uLCBlbmQpLCB0aGlzLl9kZWNvcmF0aW9uT3B0aW9ucyk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tYXJrZXIgJiYgIXRoaXMuX21vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0dGhpcy5fbW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKHRoaXMuX21hcmtlciEpO1xuXHRcdFx0XHR0aGlzLl9tYXJrZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRkZWx0YShwb3NpdGlvbjogSVBvc2l0aW9uKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fbW9kZWwuaXNEaXNwb3NlZCgpIHx8IHRoaXMuX3Bvc2l0aW9uLmxpbmVOdW1iZXIgIT09IHBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdC8vIGJhaWwgb3V0IGVhcmx5IGlmIHRoaW5ncyBzZWVtcyBmaXNoeVxuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdC8vIHJlYWQgdGhlIG1hcmtlciAoaW4gY2FzZSBzdWdnZXN0IHdhcyB0cmlnZ2VyZWQgYXQgbGluZSBlbmQpIG9yIGNvbXBhcmVcblx0XHQvLyB0aGUgY3Vyc29yIHRvIHRoZSBsaW5lIGVuZC5cblx0XHRpZiAodGhpcy5fbWFya2VyKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuX21vZGVsLmdldERlY29yYXRpb25SYW5nZSh0aGlzLl9tYXJrZXIpO1xuXHRcdFx0Y29uc3QgZW5kID0gdGhpcy5fbW9kZWwuZ2V0T2Zmc2V0QXQocmFuZ2UhLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRyZXR1cm4gZW5kIC0gdGhpcy5fbW9kZWwuZ2V0T2Zmc2V0QXQocG9zaXRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKSAtIHBvc2l0aW9uLmNvbHVtbjtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgZW51bSBJbnNlcnRGbGFncyB7XG5cdE5vbmUgPSAwLFxuXHROb0JlZm9yZVVuZG9TdG9wID0gMSxcblx0Tm9BZnRlclVuZG9TdG9wID0gMixcblx0S2VlcEFsdGVybmF0aXZlU3VnZ2VzdGlvbnMgPSA0LFxuXHRBbHRlcm5hdGl2ZU92ZXJ3cml0ZUNvbmZpZyA9IDhcbn1cblxuZXhwb3J0IGNsYXNzIFN1Z2dlc3RDb250cm9sbGVyIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gJ2VkaXRvci5jb250cmliLnN1Z2dlc3RDb250cm9sbGVyJztcblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogU3VnZ2VzdENvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxTdWdnZXN0Q29udHJvbGxlcj4oU3VnZ2VzdENvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0cmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcjtcblx0cmVhZG9ubHkgbW9kZWw6IFN1Z2dlc3RNb2RlbDtcblx0cmVhZG9ubHkgd2lkZ2V0OiBXaW5kb3dJZGxlVmFsdWU8U3VnZ2VzdFdpZGdldD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWx0ZXJuYXRpdmVzOiBXaW5kb3dJZGxlVmFsdWU8U3VnZ2VzdEFsdGVybmF0aXZlcz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVTdWZmaXggPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8TGluZVN1ZmZpeD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdmVydHlwaW5nQ2FwdHVyZXI6IFdpbmRvd0lkbGVWYWx1ZTxPdmVydHlwaW5nQ2FwdHVyZXI+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3RvcnMgPSBuZXcgUHJpb3JpdHlSZWdpc3RyeTxJU3VnZ2VzdEl0ZW1QcmVzZWxlY3Rvcj4ocyA9PiBzLnByaW9yaXR5KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxJbnNlcnRTdWdnZXN0SXRlbSA9IG5ldyBFbWl0dGVyPHsgaXRlbTogQ29tcGxldGlvbkl0ZW0gfT4oKTtcblx0Z2V0IG9uV2lsbEluc2VydFN1Z2dlc3RJdGVtKCkgeyByZXR1cm4gdGhpcy5fb25XaWxsSW5zZXJ0U3VnZ2VzdEl0ZW0uZXZlbnQ7IH1cblxuXHRwcml2YXRlIF93YW50c0ZvcmNlUmVuZGVyaW5nQWJvdmUgPSBmYWxzZTtcblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElTdWdnZXN0TWVtb3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW1vcnlTZXJ2aWNlOiBJU3VnZ2VzdE1lbW9yeVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5tb2RlbCA9IF9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdWdnZXN0TW9kZWwsIHRoaXMuZWRpdG9yLCk7XG5cblx0XHQvLyBkZWZhdWx0IHNlbGVjdG9yXG5cdFx0dGhpcy5fc2VsZWN0b3JzLnJlZ2lzdGVyKHtcblx0XHRcdHByaW9yaXR5OiAwLFxuXHRcdFx0c2VsZWN0OiAobW9kZWwsIHBvcywgaXRlbXMpID0+IHRoaXMuX21lbW9yeVNlcnZpY2Uuc2VsZWN0KG1vZGVsLCBwb3MsIGl0ZW1zKVxuXHRcdH0pO1xuXG5cdFx0Ly8gY29udGV4dCBrZXk6IHVwZGF0ZSBpbnNlcnQvcmVwbGFjZSBtb2RlXG5cdFx0Y29uc3QgY3R4SW5zZXJ0TW9kZSA9IFN1Z2dlc3RDb250ZXh0Lkluc2VydE1vZGUuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y3R4SW5zZXJ0TW9kZS5zZXQoZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdCkuaW5zZXJ0TW9kZSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLm1vZGVsLm9uRGlkVHJpZ2dlcigoKSA9PiBjdHhJbnNlcnRNb2RlLnNldChlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0KS5pbnNlcnRNb2RlKSkpO1xuXG5cdFx0dGhpcy53aWRnZXQgPSB0aGlzLl90b0Rpc3Bvc2UuYWRkKG5ldyBXaW5kb3dJZGxlVmFsdWUoZ2V0V2luZG93KGVkaXRvci5nZXREb21Ob2RlKCkpLCAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN1Z2dlc3RXaWRnZXQsIHRoaXMuZWRpdG9yKTtcblxuXHRcdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh3aWRnZXQpO1xuXHRcdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh3aWRnZXQub25EaWRTZWxlY3QoaXRlbSA9PiB0aGlzLl9pbnNlcnRTdWdnZXN0aW9uKGl0ZW0sIEluc2VydEZsYWdzLk5vbmUpLCB0aGlzKSk7XG5cblx0XHRcdC8vIFdpcmUgdXAgbG9naWMgdG8gYWNjZXB0IGEgc3VnZ2VzdGlvbiBvbiBjZXJ0YWluIGNoYXJhY3RlcnNcblx0XHRcdGNvbnN0IGNvbW1pdENoYXJhY3RlckNvbnRyb2xsZXIgPSBuZXcgQ29tbWl0Q2hhcmFjdGVyQ29udHJvbGxlcih0aGlzLmVkaXRvciwgd2lkZ2V0LCB0aGlzLm1vZGVsLCBpdGVtID0+IHRoaXMuX2luc2VydFN1Z2dlc3Rpb24oaXRlbSwgSW5zZXJ0RmxhZ3MuTm9BZnRlclVuZG9TdG9wKSk7XG5cdFx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKGNvbW1pdENoYXJhY3RlckNvbnRyb2xsZXIpO1xuXG5cblx0XHRcdC8vIFdpcmUgdXAgbWFrZXMgdGV4dCBlZGl0IGNvbnRleHQga2V5XG5cdFx0XHRjb25zdCBjdHhNYWtlc1RleHRFZGl0ID0gU3VnZ2VzdENvbnRleHQuTWFrZXNUZXh0RWRpdC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY3R4SGFzSW5zZXJ0QW5kUmVwbGFjZSA9IFN1Z2dlc3RDb250ZXh0Lkhhc0luc2VydEFuZFJlcGxhY2VSYW5nZS5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY3R4Q2FuUmVzb2x2ZSA9IFN1Z2dlc3RDb250ZXh0LkNhblJlc29sdmUuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRjdHhNYWtlc1RleHRFZGl0LnJlc2V0KCk7XG5cdFx0XHRcdGN0eEhhc0luc2VydEFuZFJlcGxhY2UucmVzZXQoKTtcblx0XHRcdFx0Y3R4Q2FuUmVzb2x2ZS5yZXNldCgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHdpZGdldC5vbkRpZEZvY3VzKCh7IGl0ZW0gfSkgPT4ge1xuXG5cdFx0XHRcdC8vIChjdHg6IG1ha2VzVGV4dEVkaXQpXG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSE7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gaXRlbS5lZGl0U3RhcnQuY29sdW1uO1xuXHRcdFx0XHRjb25zdCBlbmRDb2x1bW4gPSBwb3NpdGlvbi5jb2x1bW47XG5cdFx0XHRcdGxldCB2YWx1ZSA9IHRydWU7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyKSA9PT0gJ3NtYXJ0J1xuXHRcdFx0XHRcdCYmIHRoaXMubW9kZWwuc3RhdGUgPT09IFN0YXRlLkF1dG9cblx0XHRcdFx0XHQmJiAhaXRlbS5jb21wbGV0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHNcblx0XHRcdFx0XHQmJiAhKGl0ZW0uY29tcGxldGlvbi5pbnNlcnRUZXh0UnVsZXMhICYgQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQpXG5cdFx0XHRcdFx0JiYgZW5kQ29sdW1uIC0gc3RhcnRDb2x1bW4gPT09IGl0ZW0uY29tcGxldGlvbi5pbnNlcnRUZXh0Lmxlbmd0aFxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRjb25zdCBvbGRUZXh0ID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0VmFsdWVJblJhbmdlKHtcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0XHRcdGVuZENvbHVtblxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHZhbHVlID0gb2xkVGV4dCAhPT0gaXRlbS5jb21wbGV0aW9uLmluc2VydFRleHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3R4TWFrZXNUZXh0RWRpdC5zZXQodmFsdWUpO1xuXG5cdFx0XHRcdC8vIChjdHg6IGhhc0luc2VydEFuZFJlcGxhY2VSYW5nZSlcblx0XHRcdFx0Y3R4SGFzSW5zZXJ0QW5kUmVwbGFjZS5zZXQoIVBvc2l0aW9uLmVxdWFscyhpdGVtLmVkaXRJbnNlcnRFbmQsIGl0ZW0uZWRpdFJlcGxhY2VFbmQpKTtcblxuXHRcdFx0XHQvLyAoY3R4OiBjYW5SZXNvbHZlKVxuXHRcdFx0XHRjdHhDYW5SZXNvbHZlLnNldChCb29sZWFuKGl0ZW0ucHJvdmlkZXIucmVzb2x2ZUNvbXBsZXRpb25JdGVtKSB8fCBCb29sZWFuKGl0ZW0uY29tcGxldGlvbi5kb2N1bWVudGF0aW9uKSB8fCBpdGVtLmNvbXBsZXRpb24uZGV0YWlsICE9PSBpdGVtLmNvbXBsZXRpb24ubGFiZWwpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRpZiAodGhpcy5fd2FudHNGb3JjZVJlbmRlcmluZ0Fib3ZlKSB7XG5cdFx0XHRcdHdpZGdldC5mb3JjZVJlbmRlcmluZ0Fib3ZlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB3aWRnZXQ7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2lyZSB1cCB0ZXh0IG92ZXJ0eXBpbmcgY2FwdHVyZVxuXHRcdHRoaXMuX292ZXJ0eXBpbmdDYXB0dXJlciA9IHRoaXMuX3RvRGlzcG9zZS5hZGQobmV3IFdpbmRvd0lkbGVWYWx1ZShnZXRXaW5kb3coZWRpdG9yLmdldERvbU5vZGUoKSksICgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl90b0Rpc3Bvc2UuYWRkKG5ldyBPdmVydHlwaW5nQ2FwdHVyZXIodGhpcy5lZGl0b3IsIHRoaXMubW9kZWwpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9hbHRlcm5hdGl2ZXMgPSB0aGlzLl90b0Rpc3Bvc2UuYWRkKG5ldyBXaW5kb3dJZGxlVmFsdWUoZ2V0V2luZG93KGVkaXRvci5nZXREb21Ob2RlKCkpLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9EaXNwb3NlLmFkZChuZXcgU3VnZ2VzdEFsdGVybmF0aXZlcyh0aGlzLmVkaXRvciwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKF9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JkQ29udGV4dEtleSwgZWRpdG9yKSk7XG5cblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMubW9kZWwub25EaWRUcmlnZ2VyKGUgPT4ge1xuXHRcdFx0dGhpcy53aWRnZXQudmFsdWUuc2hvd1RyaWdnZXJlZChlLmF1dG8sIGUuc2h5ID8gMjUwIDogNTApO1xuXHRcdFx0dGhpcy5fbGluZVN1ZmZpeC52YWx1ZSA9IG5ldyBMaW5lU3VmZml4KHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLCBlLnBvc2l0aW9uKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLm1vZGVsLm9uRGlkU3VnZ2VzdChlID0+IHtcblx0XHRcdGlmIChlLnRyaWdnZXJPcHRpb25zLnNoeSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgaW5kZXggPSAtMTtcblx0XHRcdGZvciAoY29uc3Qgc2VsZWN0b3Igb2YgdGhpcy5fc2VsZWN0b3JzLml0ZW1zT3JkZXJlZEJ5UHJpb3JpdHlEZXNjKSB7XG5cdFx0XHRcdGluZGV4ID0gc2VsZWN0b3Iuc2VsZWN0KHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLCB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpISwgZS5jb21wbGV0aW9uTW9kZWwuaXRlbXMpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0aW5kZXggPSAwO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMubW9kZWwuc3RhdGUgPT09IFN0YXRlLklkbGUpIHtcblx0XHRcdFx0Ly8gc2VsZWN0aW5nIGFuIGl0ZW0gY2FuIFwicHVtcFwiIG91dCBzZWxlY3Rpb24vY3Vyc29yIGNoYW5nZSBldmVudHNcblx0XHRcdFx0Ly8gd2hpY2ggY2FuIGNhbmNlbCBzdWdnZXN0IGhhbGZ3YXkgdGhyb3VnaCB0aGlzIGZ1bmN0aW9uLiB0aGVyZWZvcmVcblx0XHRcdFx0Ly8gd2UgbmVlZCB0byBjaGVjayBhZ2FpbiBhbmQgYmFpbCBpZiB0aGUgc2Vzc2lvbiBoYXMgYmVlbiBjYW5jZWxlZFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgbm9Gb2N1cyA9IGZhbHNlO1xuXHRcdFx0aWYgKGUudHJpZ2dlck9wdGlvbnMuYXV0bykge1xuXHRcdFx0XHQvLyBkb24ndCBcImZvY3VzXCIgaXRlbSB3aGVuIGNvbmZpZ3VyZWQgdG8gZG9cblx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc3VnZ2VzdCk7XG5cdFx0XHRcdGlmIChvcHRpb25zLnNlbGVjdGlvbk1vZGUgPT09ICduZXZlcicgfHwgb3B0aW9ucy5zZWxlY3Rpb25Nb2RlID09PSAnYWx3YXlzJykge1xuXHRcdFx0XHRcdC8vIHNpbXBsZTogYWx3YXlzIG9yIG5ldmVyXG5cdFx0XHRcdFx0bm9Gb2N1cyA9IG9wdGlvbnMuc2VsZWN0aW9uTW9kZSA9PT0gJ25ldmVyJztcblxuXHRcdFx0XHR9IGVsc2UgaWYgKG9wdGlvbnMuc2VsZWN0aW9uTW9kZSA9PT0gJ3doZW5UcmlnZ2VyQ2hhcmFjdGVyJykge1xuXHRcdFx0XHRcdC8vIG9uIHdpdGggdHJpZ2dlciBjaGFyYWN0ZXJcblx0XHRcdFx0XHRub0ZvY3VzID0gZS50cmlnZ2VyT3B0aW9ucy50cmlnZ2VyS2luZCAhPT0gQ29tcGxldGlvblRyaWdnZXJLaW5kLlRyaWdnZXJDaGFyYWN0ZXI7XG5cblx0XHRcdFx0fSBlbHNlIGlmIChvcHRpb25zLnNlbGVjdGlvbk1vZGUgPT09ICd3aGVuUXVpY2tTdWdnZXN0aW9uJykge1xuXHRcdFx0XHRcdC8vIHdpdGhvdXQgdHJpZ2dlciBjaGFyYWN0ZXIgb3Igd2hlbiByZWZpbHRlcmluZ1xuXHRcdFx0XHRcdG5vRm9jdXMgPSBlLnRyaWdnZXJPcHRpb25zLnRyaWdnZXJLaW5kID09PSBDb21wbGV0aW9uVHJpZ2dlcktpbmQuVHJpZ2dlckNoYXJhY3RlciAmJiAhZS50cmlnZ2VyT3B0aW9ucy5yZWZpbHRlcjtcblx0XHRcdFx0fVxuXG5cdFx0XHR9XG5cdFx0XHR0aGlzLndpZGdldC52YWx1ZS5zaG93U3VnZ2VzdGlvbnMoZS5jb21wbGV0aW9uTW9kZWwsIGluZGV4LCBlLmlzRnJvemVuLCBlLnRyaWdnZXJPcHRpb25zLmF1dG8sIG5vRm9jdXMpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl90b0Rpc3Bvc2UuYWRkKHRoaXMubW9kZWwub25EaWRDYW5jZWwoZSA9PiB7XG5cdFx0XHRpZiAoIWUucmV0cmlnZ2VyKSB7XG5cdFx0XHRcdHRoaXMud2lkZ2V0LnZhbHVlLmhpZGVXaWRnZXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0aWYgKCFfc3RpY2t5KSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuY2FuY2VsKCk7XG5cdFx0XHRcdHRoaXMubW9kZWwuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBNYW5hZ2UgdGhlIGFjY2VwdFN1Z2dlc3Rpb25zT25FbnRlciBjb250ZXh0IGtleVxuXHRcdGNvbnN0IGFjY2VwdFN1Z2dlc3Rpb25zT25FbnRlciA9IFN1Z2dlc3RDb250ZXh0LkFjY2VwdFN1Z2dlc3Rpb25zT25FbnRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCB1cGRhdGVGcm9tQ29uZmlnID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXIgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyKTtcblx0XHRcdGFjY2VwdFN1Z2dlc3Rpb25zT25FbnRlci5zZXQoYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXIgPT09ICdvbicgfHwgYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXIgPT09ICdzbWFydCcpO1xuXHRcdH07XG5cdFx0dGhpcy5fdG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKCkgPT4gdXBkYXRlRnJvbUNvbmZpZygpKSk7XG5cdFx0dXBkYXRlRnJvbUNvbmZpZygpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hbHRlcm5hdGl2ZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3RvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy53aWRnZXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMubW9kZWwuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2xpbmVTdWZmaXguZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uV2lsbEluc2VydFN1Z2dlc3RJdGVtLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfaW5zZXJ0U3VnZ2VzdGlvbihcblx0XHRldmVudDogSVNlbGVjdGVkU3VnZ2VzdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRmbGFnczogSW5zZXJ0RmxhZ3Ncblx0KTogdm9pZCB7XG5cdFx0aWYgKCFldmVudCB8fCAhZXZlbnQuaXRlbSkge1xuXHRcdFx0dGhpcy5fYWx0ZXJuYXRpdmVzLnZhbHVlLnJlc2V0KCk7XG5cdFx0XHR0aGlzLm1vZGVsLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5tb2RlbC5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc25pcHBldENvbnRyb2xsZXIgPSBTbmlwcGV0Q29udHJvbGxlcjIuZ2V0KHRoaXMuZWRpdG9yKTtcblx0XHRpZiAoIXNuaXBwZXRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25XaWxsSW5zZXJ0U3VnZ2VzdEl0ZW0uZmlyZSh7IGl0ZW06IGV2ZW50Lml0ZW0gfSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgbW9kZWxWZXJzaW9uTm93ID0gbW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKTtcblx0XHRjb25zdCB7IGl0ZW0gfSA9IGV2ZW50O1xuXG5cdFx0Ly9cblx0XHRjb25zdCB0YXNrczogUHJvbWlzZTx1bmtub3duPltdID0gW107XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHQvLyBwdXNoaW5nIHVuZG8gc3RvcHMgKmJlZm9yZSogYWRkaXRpb25hbCB0ZXh0IGVkaXRzIGFuZFxuXHRcdC8vICphZnRlciogdGhlIG1haW4gZWRpdFxuXHRcdGlmICghKGZsYWdzICYgSW5zZXJ0RmxhZ3MuTm9CZWZvcmVVbmRvU3RvcCkpIHtcblx0XHRcdHRoaXMuZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdH1cblxuXHRcdC8vIGNvbXB1dGUgb3ZlcndyaXRlW0JlZm9yZXxBZnRlcl0gZGVsdGFzIEJFRk9SRSBhcHBseWluZyBleHRyYSBlZGl0c1xuXHRcdGNvbnN0IGluZm8gPSB0aGlzLmdldE92ZXJ3cml0ZUluZm8oaXRlbSwgQm9vbGVhbihmbGFncyAmIEluc2VydEZsYWdzLkFsdGVybmF0aXZlT3ZlcndyaXRlQ29uZmlnKSk7XG5cblx0XHQvLyBrZWVwIGl0ZW0gaW4gbWVtb3J5XG5cdFx0dGhpcy5fbWVtb3J5U2VydmljZS5tZW1vcml6ZShtb2RlbCwgdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSwgaXRlbSk7XG5cblx0XHRjb25zdCBpc1Jlc29sdmVkID0gaXRlbS5pc1Jlc29sdmVkO1xuXG5cdFx0Ly8gdGVsZW1ldHJ5IGRhdGEgcG9pbnRzOiBkdXJhdGlvbiBvZiBjb21tYW5kIGV4ZWN1dGlvbiwgaW5mbyBhYm91dCBhc3luYyBhZGRpdGlvbmFsIGVkaXRzICgtMT1uL2EsIC0yPW5vbmUsIDE9c3VjY2VzcywgMD1mYWlsZWQpXG5cdFx0bGV0IF9jb21tYW5kRXhlY3Rpb25EdXJhdGlvbiA9IC0xO1xuXHRcdGxldCBfYWRkaXRpb25hbEVkaXRzQXBwbGllZEFzeW5jID0gLTE7XG5cblx0XHRpZiAoQXJyYXkuaXNBcnJheShpdGVtLmNvbXBsZXRpb24uYWRkaXRpb25hbFRleHRFZGl0cykpIHtcblxuXHRcdFx0Ly8gY2FuY2VsIC0+IHN0b3BzIGFsbCBsaXN0ZW5pbmcgYW5kIGNsb3NlcyB3aWRnZXRcblx0XHRcdHRoaXMubW9kZWwuY2FuY2VsKCk7XG5cblx0XHRcdC8vIHN5bmMgYWRkaXRpb25hbCBlZGl0c1xuXHRcdFx0Y29uc3Qgc2Nyb2xsU3RhdGUgPSBTdGFibGVFZGl0b3JTY3JvbGxTdGF0ZS5jYXB0dXJlKHRoaXMuZWRpdG9yKTtcblx0XHRcdHRoaXMuZWRpdG9yLmV4ZWN1dGVFZGl0cyhcblx0XHRcdFx0J3N1Z2dlc3RDb250cm9sbGVyLmFkZGl0aW9uYWxUZXh0RWRpdHMuc3luYycsXG5cdFx0XHRcdGl0ZW0uY29tcGxldGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzLm1hcChlZGl0ID0+IHtcblx0XHRcdFx0XHRsZXQgcmFuZ2UgPSBSYW5nZS5saWZ0KGVkaXQucmFuZ2UpO1xuXHRcdFx0XHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IGl0ZW0ucG9zaXRpb24ubGluZU51bWJlciAmJiByYW5nZS5zdGFydENvbHVtbiA+IGl0ZW0ucG9zaXRpb24uY29sdW1uKSB7XG5cdFx0XHRcdFx0XHQvLyBzaGlmdCBhZGRpdGlvbmFsIGVkaXQgd2hlbiBpdCBpcyBcImFmdGVyXCIgdGhlIGNvbXBsZXRpb24gaW5zZXJ0aW9uIHBvc2l0aW9uXG5cdFx0XHRcdFx0XHRjb25zdCBjb2x1bW5EZWx0YSA9IHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkhLmNvbHVtbiAtIGl0ZW0ucG9zaXRpb24uY29sdW1uO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhcnRDb2x1bW5EZWx0YSA9IGNvbHVtbkRlbHRhO1xuXHRcdFx0XHRcdFx0Y29uc3QgZW5kQ29sdW1uRGVsdGEgPSBSYW5nZS5zcGFuc011bHRpcGxlTGluZXMocmFuZ2UpID8gMCA6IGNvbHVtbkRlbHRhO1xuXHRcdFx0XHRcdFx0cmFuZ2UgPSBuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiArIHN0YXJ0Q29sdW1uRGVsdGEsIHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbiArIGVuZENvbHVtbkRlbHRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIEVkaXRPcGVyYXRpb24ucmVwbGFjZU1vdmUocmFuZ2UsIGVkaXQudGV4dCk7XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdFx0c2Nyb2xsU3RhdGUucmVzdG9yZVJlbGF0aXZlVmVydGljYWxQb3NpdGlvbk9mQ3Vyc29yKHRoaXMuZWRpdG9yKTtcblxuXHRcdH0gZWxzZSBpZiAoIWlzUmVzb2x2ZWQpIHtcblx0XHRcdC8vIGFzeW5jIGFkZGl0aW9uYWwgZWRpdHNcblx0XHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdFx0bGV0IHBvc2l0aW9uOiBJUG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGRvY0xpc3RlbmVyID0gbW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5pc0ZsdXNoKSB7XG5cdFx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0XHRcdGRvY0xpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgZS5jaGFuZ2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGhpc1Bvc2l0aW9uID0gUmFuZ2UuZ2V0RW5kUG9zaXRpb24oY2hhbmdlLnJhbmdlKTtcblx0XHRcdFx0XHRpZiAoIXBvc2l0aW9uIHx8IFBvc2l0aW9uLmlzQmVmb3JlKHRoaXNQb3NpdGlvbiwgcG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbiA9IHRoaXNQb3NpdGlvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBvbGRGbGFncyA9IGZsYWdzO1xuXHRcdFx0ZmxhZ3MgfD0gSW5zZXJ0RmxhZ3MuTm9BZnRlclVuZG9TdG9wO1xuXHRcdFx0bGV0IGRpZFR5cGUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHR5cGVMaXN0ZW5lciA9IHRoaXMuZWRpdG9yLm9uV2lsbFR5cGUoKCkgPT4ge1xuXHRcdFx0XHR0eXBlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRkaWRUeXBlID0gdHJ1ZTtcblx0XHRcdFx0aWYgKCEob2xkRmxhZ3MgJiBJbnNlcnRGbGFncy5Ob0FmdGVyVW5kb1N0b3ApKSB7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0YXNrcy5wdXNoKGl0ZW0ucmVzb2x2ZShjdHMudG9rZW4pLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWl0ZW0uY29tcGxldGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzIHx8IGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBvc2l0aW9uICYmIGl0ZW0uY29tcGxldGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzLnNvbWUoZWRpdCA9PiBQb3NpdGlvbi5pc0JlZm9yZShwb3NpdGlvbiEsIFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oZWRpdC5yYW5nZSkpKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZGlkVHlwZSkge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNjcm9sbFN0YXRlID0gU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUuY2FwdHVyZSh0aGlzLmVkaXRvcik7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmV4ZWN1dGVFZGl0cyhcblx0XHRcdFx0XHQnc3VnZ2VzdENvbnRyb2xsZXIuYWRkaXRpb25hbFRleHRFZGl0cy5hc3luYycsXG5cdFx0XHRcdFx0aXRlbS5jb21wbGV0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMubWFwKGVkaXQgPT4gRWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShSYW5nZS5saWZ0KGVkaXQucmFuZ2UpLCBlZGl0LnRleHQpKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRzY3JvbGxTdGF0ZS5yZXN0b3JlUmVsYXRpdmVWZXJ0aWNhbFBvc2l0aW9uT2ZDdXJzb3IodGhpcy5lZGl0b3IpO1xuXHRcdFx0XHRpZiAoZGlkVHlwZSB8fCAhKG9sZEZsYWdzICYgSW5zZXJ0RmxhZ3MuTm9BZnRlclVuZG9TdG9wKSkge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSkudGhlbihhcHBsaWVkID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW3N1Z2dlc3RdIGFzeW5jIHJlc29sdmluZyBvZiBlZGl0cyBET05FIChtcywgYXBwbGllZD8pJywgc3cuZWxhcHNlZCgpLCBhcHBsaWVkKTtcblx0XHRcdFx0X2FkZGl0aW9uYWxFZGl0c0FwcGxpZWRBc3luYyA9IGFwcGxpZWQgPT09IHRydWUgPyAxIDogYXBwbGllZCA9PT0gZmFsc2UgPyAwIDogLTI7XG5cdFx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0ZG9jTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0eXBlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGxldCB7IGluc2VydFRleHQgfSA9IGl0ZW0uY29tcGxldGlvbjtcblx0XHRpZiAoIShpdGVtLmNvbXBsZXRpb24uaW5zZXJ0VGV4dFJ1bGVzISAmIENvbXBsZXRpb25JdGVtSW5zZXJ0VGV4dFJ1bGUuSW5zZXJ0QXNTbmlwcGV0KSkge1xuXHRcdFx0aW5zZXJ0VGV4dCA9IFNuaXBwZXRQYXJzZXIuZXNjYXBlKGluc2VydFRleHQpO1xuXHRcdH1cblxuXHRcdC8vIGNhbmNlbCAtPiBzdG9wcyBhbGwgbGlzdGVuaW5nIGFuZCBjbG9zZXMgd2lkZ2V0XG5cdFx0dGhpcy5tb2RlbC5jYW5jZWwoKTtcblxuXHRcdHNuaXBwZXRDb250cm9sbGVyLmluc2VydChpbnNlcnRUZXh0LCB7XG5cdFx0XHRvdmVyd3JpdGVCZWZvcmU6IGluZm8ub3ZlcndyaXRlQmVmb3JlLFxuXHRcdFx0b3ZlcndyaXRlQWZ0ZXI6IGluZm8ub3ZlcndyaXRlQWZ0ZXIsXG5cdFx0XHR1bmRvU3RvcEJlZm9yZTogZmFsc2UsXG5cdFx0XHR1bmRvU3RvcEFmdGVyOiBmYWxzZSxcblx0XHRcdGFkanVzdFdoaXRlc3BhY2U6ICEoaXRlbS5jb21wbGV0aW9uLmluc2VydFRleHRSdWxlcyEgJiBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLktlZXBXaGl0ZXNwYWNlKSxcblx0XHRcdGNsaXBib2FyZFRleHQ6IGV2ZW50Lm1vZGVsLmNsaXBib2FyZFRleHQsXG5cdFx0XHRvdmVydHlwaW5nQ2FwdHVyZXI6IHRoaXMuX292ZXJ0eXBpbmdDYXB0dXJlci52YWx1ZSxcblx0XHRcdHJlYXNvbjogRWRpdFNvdXJjZXMuc3VnZ2VzdCh7IHByb3ZpZGVySWQ6IFByb3ZpZGVySWQuZnJvbUV4dGVuc2lvbklkKGl0ZW0uZXh0ZW5zaW9uSWQ/LnZhbHVlKSB9KSxcblx0XHR9KTtcblxuXHRcdGlmICghKGZsYWdzICYgSW5zZXJ0RmxhZ3MuTm9BZnRlclVuZG9TdG9wKSkge1xuXHRcdFx0dGhpcy5lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGl0ZW0uY29tcGxldGlvbi5jb21tYW5kKSB7XG5cdFx0XHRpZiAoaXRlbS5jb21wbGV0aW9uLmNvbW1hbmQuaWQgPT09IFRyaWdnZXJTdWdnZXN0QWN0aW9uLmlkKSB7XG5cdFx0XHRcdC8vIHJldGlnZ2VyXG5cdFx0XHRcdHRoaXMubW9kZWwudHJpZ2dlcih7IGF1dG86IHRydWUsIHJldHJpZ2dlcjogdHJ1ZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGV4ZWMgY29tbWFuZCwgZG9uZVxuXHRcdFx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHRcdFx0dGFza3MucHVzaCh0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChpdGVtLmNvbXBsZXRpb24uY29tbWFuZC5pZCwgLi4uKGl0ZW0uY29tcGxldGlvbi5jb21tYW5kLmFyZ3VtZW50cyA/IFsuLi5pdGVtLmNvbXBsZXRpb24uY29tbWFuZC5hcmd1bWVudHNdIDogW10pKS5jYXRjaChlID0+IHtcblx0XHRcdFx0XHRpZiAoaXRlbS5jb21wbGV0aW9uLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKGUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdF9jb21tYW5kRXhlY3Rpb25EdXJhdGlvbiA9IHN3LmVsYXBzZWQoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChmbGFncyAmIEluc2VydEZsYWdzLktlZXBBbHRlcm5hdGl2ZVN1Z2dlc3Rpb25zKSB7XG5cdFx0XHR0aGlzLl9hbHRlcm5hdGl2ZXMudmFsdWUuc2V0KGV2ZW50LCBuZXh0ID0+IHtcblxuXHRcdFx0XHQvLyBjYW5jZWwgcmVzb2x2aW5nIG9mIGFkZGl0aW9uYWwgZWRpdHNcblx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0XHRcdC8vIHRoaXMgaXMgbm90IHNvIHByZXR0eS4gd2hlbiBpbnNlcnRpbmcgdGhlICduZXh0J1xuXHRcdFx0XHQvLyBzdWdnZXN0aW9uIHdlIHVuZG8gdW50aWwgd2UgYXJlIGF0IHRoZSBzdGF0ZSBhdFxuXHRcdFx0XHQvLyB3aGljaCB3ZSB3ZXJlIGJlZm9yZSBpbnNlcnRpbmcgdGhlIHByZXZpb3VzIHN1Z2dlc3Rpb24uLi5cblx0XHRcdFx0d2hpbGUgKG1vZGVsLmNhblVuZG8oKSkge1xuXHRcdFx0XHRcdGlmIChtb2RlbFZlcnNpb25Ob3cgIT09IG1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCkpIHtcblx0XHRcdFx0XHRcdG1vZGVsLnVuZG8oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5faW5zZXJ0U3VnZ2VzdGlvbihcblx0XHRcdFx0XHRcdG5leHQsXG5cdFx0XHRcdFx0XHRJbnNlcnRGbGFncy5Ob0JlZm9yZVVuZG9TdG9wIHwgSW5zZXJ0RmxhZ3MuTm9BZnRlclVuZG9TdG9wIHwgKGZsYWdzICYgSW5zZXJ0RmxhZ3MuQWx0ZXJuYXRpdmVPdmVyd3JpdGVDb25maWcgPyBJbnNlcnRGbGFncy5BbHRlcm5hdGl2ZU92ZXJ3cml0ZUNvbmZpZyA6IDApXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYWxlcnRDb21wbGV0aW9uSXRlbShpdGVtKTtcblxuXHRcdC8vIGNsZWFyIG9ubHkgbm93IC0gYWZ0ZXIgYWxsIHRhc2tzIGFyZSBkb25lXG5cdFx0UHJvbWlzZS5hbGwodGFza3MpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVwb3J0U3VnZ2VzdGlvbkFjY2VwdGVkVGVsZW1ldHJ5KGl0ZW0sIG1vZGVsLCBpc1Jlc29sdmVkLCBfY29tbWFuZEV4ZWN0aW9uRHVyYXRpb24sIF9hZGRpdGlvbmFsRWRpdHNBcHBsaWVkQXN5bmMsIGV2ZW50LmluZGV4LCBldmVudC5tb2RlbC5pdGVtcyk7XG5cblx0XHRcdHRoaXMubW9kZWwuY2xlYXIoKTtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXBvcnRTdWdnZXN0aW9uQWNjZXB0ZWRUZWxlbWV0cnkoaXRlbTogQ29tcGxldGlvbkl0ZW0sIG1vZGVsOiBJVGV4dE1vZGVsLCBpdGVtUmVzb2x2ZWQ6IGJvb2xlYW4sIGNvbW1hbmRFeGVjdGlvbkR1cmF0aW9uOiBudW1iZXIsIGFkZGl0aW9uYWxFZGl0c0FwcGxpZWRBc3luYzogbnVtYmVyLCBpbmRleDogbnVtYmVyLCBjb21wbGV0aW9uSXRlbXM6IENvbXBsZXRpb25JdGVtW10pOiB2b2lkIHtcblx0XHRpZiAoTWF0aC5yYW5kb20oKSA+IDAuMDAwMSkgeyAvLyAwLjAxJVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsTWFwID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcltdPigpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBNYXRoLm1pbigzMCwgY29tcGxldGlvbkl0ZW1zLmxlbmd0aCk7IGkrKykge1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBjb21wbGV0aW9uSXRlbXNbaV0udGV4dExhYmVsO1xuXG5cdFx0XHRpZiAobGFiZWxNYXAuaGFzKGxhYmVsKSkge1xuXHRcdFx0XHRsYWJlbE1hcC5nZXQobGFiZWwpIS5wdXNoKGkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFiZWxNYXAuc2V0KGxhYmVsLCBbaV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZpcnN0SW5kZXhBcnJheSA9IGxhYmVsTWFwLmdldChpdGVtLnRleHRMYWJlbCk7XG5cdFx0Y29uc3QgaGFzRHVwbGljYXRlcyA9IGZpcnN0SW5kZXhBcnJheSAmJiBmaXJzdEluZGV4QXJyYXkubGVuZ3RoID4gMTtcblx0XHRjb25zdCBmaXJzdEluZGV4ID0gaGFzRHVwbGljYXRlcyA/IGZpcnN0SW5kZXhBcnJheVswXSA6IC0xO1xuXG5cdFx0dHlwZSBBY2NlcHRlZFN1Z2dlc3Rpb24gPSB7XG5cdFx0XHRleHRlbnNpb25JZDogc3RyaW5nOyBwcm92aWRlcklkOiBzdHJpbmc7XG5cdFx0XHRmaWxlRXh0ZW5zaW9uOiBzdHJpbmc7IGxhbmd1YWdlSWQ6IHN0cmluZzsgYmFzZW5hbWVIYXNoOiBzdHJpbmc7IGtpbmQ6IG51bWJlcjtcblx0XHRcdHJlc29sdmVJbmZvOiBudW1iZXI7IHJlc29sdmVEdXJhdGlvbjogbnVtYmVyO1xuXHRcdFx0Y29tbWFuZER1cmF0aW9uOiBudW1iZXI7XG5cdFx0XHRhZGRpdGlvbmFsRWRpdHNBc3luYzogbnVtYmVyO1xuXHRcdFx0aW5kZXg6IG51bWJlcjsgZmlyc3RJbmRleDogbnVtYmVyO1xuXHRcdH07XG5cdFx0dHlwZSBBY2NlcHRlZFN1Z2dlc3Rpb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnanJpZWtlbic7XG5cdFx0XHRjb21tZW50OiAnSW5mb3JtYXRpb24gYWNjZXB0aW5nIGNvbXBsZXRpb24gaXRlbXMnO1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRXh0ZW5zaW9uIGNvbnRyaWJ1dGluZyB0aGUgY29tcGxldGlvbnMgaXRlbScgfTtcblx0XHRcdHByb3ZpZGVySWQ6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnUHJvdmlkZXIgb2YgdGhlIGNvbXBsZXRpb25zIGl0ZW0nIH07XG5cdFx0XHRiYXNlbmFtZUhhc2g6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSGFzaCBvZiB0aGUgYmFzZW5hbWUgb2YgdGhlIGZpbGUgaW50byB3aGljaCB0aGUgY29tcGxldGlvbiB3YXMgaW5zZXJ0ZWQnIH07XG5cdFx0XHRmaWxlRXh0ZW5zaW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRmlsZSBleHRlbnNpb24gb2YgdGhlIGZpbGUgaW50byB3aGljaCB0aGUgY29tcGxldGlvbiB3YXMgaW5zZXJ0ZWQnIH07XG5cdFx0XHRsYW5ndWFnZUlkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTGFuZ3VhZ2UgdHlwZSBvZiB0aGUgZmlsZSBpbnRvIHdoaWNoIHRoZSBjb21wbGV0aW9uIHdhcyBpbnNlcnRlZCcgfTtcblx0XHRcdGtpbmQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29tcGxldGlvbiBpdGVtIGtpbmQnIH07XG5cdFx0XHRyZXNvbHZlSW5mbzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lmIHRoZSBpdGVtIHdhcyBpbnNlcnRlZCBiZWZvcmUgcmVzb2x2aW5nIHdhcyBkb25lJyB9O1xuXHRcdFx0cmVzb2x2ZUR1cmF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSG93IGxvbmcgcmVzb2x2aW5nIHRvb2sgdG8gZmluaXNoJyB9O1xuXHRcdFx0Y29tbWFuZER1cmF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSG93IGxvbmcgYSBjb21wbGV0aW9uIGl0ZW0gY29tbWFuZCB0b29rJyB9O1xuXHRcdFx0YWRkaXRpb25hbEVkaXRzQXN5bmM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJbmZvIGFib3V0IGFzeW5jaHJvbm91c2x5IGFwcGx5aW5nIGFkZGl0aW9uYWwgZWRpdHMnIH07XG5cdFx0XHRpbmRleDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBpbmRleCBvZiB0aGUgY29tcGxldGlvbiBpdGVtIGluIHRoZSBzb3J0ZWQgbGlzdC4nIH07XG5cdFx0XHRmaXJzdEluZGV4OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgY29tcGxldGlvbnMsIHRoZSBpbmRleCBvZiB0aGUgZmlyc3QgaW5zdGFuY2UuJyB9O1xuXHRcdH07XG5cblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWNjZXB0ZWRTdWdnZXN0aW9uLCBBY2NlcHRlZFN1Z2dlc3Rpb25DbGFzc2lmaWNhdGlvbj4oJ3N1Z2dlc3QuYWNjZXB0ZWRTdWdnZXN0aW9uJywge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGl0ZW0uZXh0ZW5zaW9uSWQ/LnZhbHVlID8/ICd1bmtub3duJyxcblx0XHRcdHByb3ZpZGVySWQ6IGl0ZW0ucHJvdmlkZXIuX2RlYnVnRGlzcGxheU5hbWUgPz8gJ3Vua25vd24nLFxuXHRcdFx0a2luZDogaXRlbS5jb21wbGV0aW9uLmtpbmQsXG5cdFx0XHRiYXNlbmFtZUhhc2g6IGhhc2goYmFzZW5hbWUobW9kZWwudXJpKSkudG9TdHJpbmcoMTYpLFxuXHRcdFx0bGFuZ3VhZ2VJZDogbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLFxuXHRcdFx0ZmlsZUV4dGVuc2lvbjogZXh0bmFtZShtb2RlbC51cmkpLFxuXHRcdFx0cmVzb2x2ZUluZm86ICFpdGVtLnByb3ZpZGVyLnJlc29sdmVDb21wbGV0aW9uSXRlbSA/IC0xIDogaXRlbVJlc29sdmVkID8gMSA6IDAsXG5cdFx0XHRyZXNvbHZlRHVyYXRpb246IGl0ZW0ucmVzb2x2ZUR1cmF0aW9uLFxuXHRcdFx0Y29tbWFuZER1cmF0aW9uOiBjb21tYW5kRXhlY3Rpb25EdXJhdGlvbixcblx0XHRcdGFkZGl0aW9uYWxFZGl0c0FzeW5jOiBhZGRpdGlvbmFsRWRpdHNBcHBsaWVkQXN5bmMsXG5cdFx0XHRpbmRleCxcblx0XHRcdGZpcnN0SW5kZXgsXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRPdmVyd3JpdGVJbmZvKGl0ZW06IENvbXBsZXRpb25JdGVtLCB0b2dnbGVNb2RlOiBib29sZWFuKTogeyBvdmVyd3JpdGVCZWZvcmU6IG51bWJlcjsgb3ZlcndyaXRlQWZ0ZXI6IG51bWJlciB9IHtcblx0XHRhc3NlcnRUeXBlKHRoaXMuZWRpdG9yLmhhc01vZGVsKCkpO1xuXG5cdFx0bGV0IHJlcGxhY2UgPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpLmluc2VydE1vZGUgPT09ICdyZXBsYWNlJztcblx0XHRpZiAodG9nZ2xlTW9kZSkge1xuXHRcdFx0cmVwbGFjZSA9ICFyZXBsYWNlO1xuXHRcdH1cblx0XHRjb25zdCBvdmVyd3JpdGVCZWZvcmUgPSBpdGVtLnBvc2l0aW9uLmNvbHVtbiAtIGl0ZW0uZWRpdFN0YXJ0LmNvbHVtbjtcblx0XHRjb25zdCBvdmVyd3JpdGVBZnRlciA9IChyZXBsYWNlID8gaXRlbS5lZGl0UmVwbGFjZUVuZC5jb2x1bW4gOiBpdGVtLmVkaXRJbnNlcnRFbmQuY29sdW1uKSAtIGl0ZW0ucG9zaXRpb24uY29sdW1uO1xuXHRcdGNvbnN0IGNvbHVtbkRlbHRhID0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKS5jb2x1bW4gLSBpdGVtLnBvc2l0aW9uLmNvbHVtbjtcblx0XHRjb25zdCBzdWZmaXhEZWx0YSA9IHRoaXMuX2xpbmVTdWZmaXgudmFsdWUgPyB0aGlzLl9saW5lU3VmZml4LnZhbHVlLmRlbHRhKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkpIDogMDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRvdmVyd3JpdGVCZWZvcmU6IG92ZXJ3cml0ZUJlZm9yZSArIGNvbHVtbkRlbHRhLFxuXHRcdFx0b3ZlcndyaXRlQWZ0ZXI6IG92ZXJ3cml0ZUFmdGVyICsgc3VmZml4RGVsdGFcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYWxlcnRDb21wbGV0aW9uSXRlbShpdGVtOiBDb21wbGV0aW9uSXRlbSk6IHZvaWQge1xuXHRcdGlmIChpc05vbkVtcHR5QXJyYXkoaXRlbS5jb21wbGV0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMpKSB7XG5cdFx0XHRjb25zdCBtc2cgPSBubHMubG9jYWxpemUoJ2FyaWEuYWxlcnQuc25pcHBldCcsIFwiQWNjZXB0aW5nICd7MH0nIG1hZGUgezF9IGFkZGl0aW9uYWwgZWRpdHNcIiwgaXRlbS50ZXh0TGFiZWwsIGl0ZW0uY29tcGxldGlvbi5hZGRpdGlvbmFsVGV4dEVkaXRzLmxlbmd0aCk7XG5cdFx0XHRhbGVydChtc2cpO1xuXHRcdH1cblx0fVxuXG5cdHRyaWdnZXJTdWdnZXN0KG9ubHlGcm9tPzogU2V0PENvbXBsZXRpb25JdGVtUHJvdmlkZXI+LCBhdXRvPzogYm9vbGVhbiwgbm9GaWx0ZXI/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMubW9kZWwudHJpZ2dlcih7XG5cdFx0XHRcdGF1dG86IGF1dG8gPz8gZmFsc2UsXG5cdFx0XHRcdGNvbXBsZXRpb25PcHRpb25zOiB7IHByb3ZpZGVyRmlsdGVyOiBvbmx5RnJvbSwga2luZEZpbHRlcjogbm9GaWx0ZXIgPyBuZXcgU2V0KCkgOiB1bmRlZmluZWQgfVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmVkaXRvci5yZXZlYWxQb3NpdGlvbih0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHRyaWdnZXJTdWdnZXN0QW5kQWNjZXB0QmVzdChhcmc6IHsgZmFsbGJhY2s6IHN0cmluZyB9KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cblx0XHR9XG5cdFx0Y29uc3QgcG9zaXRpb25Ob3cgPSB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpO1xuXG5cdFx0Y29uc3QgZmFsbGJhY2sgPSAoKSA9PiB7XG5cdFx0XHRpZiAocG9zaXRpb25Ob3cuZXF1YWxzKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkhKSkge1xuXHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhcmcuZmFsbGJhY2spO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtYWtlc1RleHRFZGl0ID0gKGl0ZW06IENvbXBsZXRpb25JdGVtKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRpZiAoaXRlbS5jb21wbGV0aW9uLmluc2VydFRleHRSdWxlcyEgJiBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLkluc2VydEFzU25pcHBldCB8fCBpdGVtLmNvbXBsZXRpb24uYWRkaXRpb25hbFRleHRFZGl0cykge1xuXHRcdFx0XHQvLyBzbmlwcGV0LCBvdGhlciBlZGl0b3IgLT4gbWFrZXMgZWRpdFxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSE7XG5cdFx0XHRjb25zdCBzdGFydENvbHVtbiA9IGl0ZW0uZWRpdFN0YXJ0LmNvbHVtbjtcblx0XHRcdGNvbnN0IGVuZENvbHVtbiA9IHBvc2l0aW9uLmNvbHVtbjtcblx0XHRcdGlmIChlbmRDb2x1bW4gLSBzdGFydENvbHVtbiAhPT0gaXRlbS5jb21wbGV0aW9uLmluc2VydFRleHQubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIHVuZXF1YWwgbGVuZ3RocyAtPiBtYWtlcyBlZGl0XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dE5vdyA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLmdldFZhbHVlSW5SYW5nZSh7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0c3RhcnRDb2x1bW4sXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdGVuZENvbHVtblxuXHRcdFx0fSk7XG5cdFx0XHQvLyB1bmVxdWFsIHRleHQgLT4gbWFrZXMgZWRpdFxuXHRcdFx0cmV0dXJuIHRleHROb3cgIT09IGl0ZW0uY29tcGxldGlvbi5pbnNlcnRUZXh0O1xuXHRcdH07XG5cblx0XHRFdmVudC5vbmNlKHRoaXMubW9kZWwub25EaWRUcmlnZ2VyKShfID0+IHtcblx0XHRcdC8vIHdhaXQgZm9yIHRyaWdnZXIgYmVjYXVzZSBvbmx5IHRoZW4gdGhlIGNhbmNlbC1ldmVudCBpcyB0cnVzdHdvcnRoeVxuXHRcdFx0Y29uc3QgbGlzdGVuZXI6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRcdFx0RXZlbnQuYW55PHVua25vd24+KHRoaXMubW9kZWwub25EaWRUcmlnZ2VyLCB0aGlzLm1vZGVsLm9uRGlkQ2FuY2VsKSgoKSA9PiB7XG5cdFx0XHRcdC8vIHJldHJpZ2dlciBvciBjYW5jZWwgLT4gdHJ5IHRvIHR5cGUgZGVmYXVsdCB0ZXh0XG5cdFx0XHRcdGRpc3Bvc2UobGlzdGVuZXIpO1xuXHRcdFx0XHRmYWxsYmFjaygpO1xuXHRcdFx0fSwgdW5kZWZpbmVkLCBsaXN0ZW5lcik7XG5cblx0XHRcdHRoaXMubW9kZWwub25EaWRTdWdnZXN0KCh7IGNvbXBsZXRpb25Nb2RlbCB9KSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2UobGlzdGVuZXIpO1xuXHRcdFx0XHRpZiAoY29tcGxldGlvbk1vZGVsLml0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGZhbGxiYWNrKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fbWVtb3J5U2VydmljZS5zZWxlY3QodGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEsIHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkhLCBjb21wbGV0aW9uTW9kZWwuaXRlbXMpO1xuXHRcdFx0XHRjb25zdCBpdGVtID0gY29tcGxldGlvbk1vZGVsLml0ZW1zW2luZGV4XTtcblx0XHRcdFx0aWYgKCFtYWtlc1RleHRFZGl0KGl0ZW0pKSB7XG5cdFx0XHRcdFx0ZmFsbGJhY2soKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRcdHRoaXMuX2luc2VydFN1Z2dlc3Rpb24oeyBpbmRleCwgaXRlbSwgbW9kZWw6IGNvbXBsZXRpb25Nb2RlbCB9LCBJbnNlcnRGbGFncy5LZWVwQWx0ZXJuYXRpdmVTdWdnZXN0aW9ucyB8IEluc2VydEZsYWdzLk5vQmVmb3JlVW5kb1N0b3AgfCBJbnNlcnRGbGFncy5Ob0FmdGVyVW5kb1N0b3ApO1xuXG5cdFx0XHR9LCB1bmRlZmluZWQsIGxpc3RlbmVyKTtcblx0XHR9KTtcblxuXHRcdHRoaXMubW9kZWwudHJpZ2dlcih7IGF1dG86IGZhbHNlLCBzaHk6IHRydWUgfSk7XG5cdFx0dGhpcy5lZGl0b3IucmV2ZWFsUG9zaXRpb24ocG9zaXRpb25Ob3csIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0YWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uKGtlZXBBbHRlcm5hdGl2ZVN1Z2dlc3Rpb25zOiBib29sZWFuLCBhbHRlcm5hdGl2ZU92ZXJ3cml0ZUNvbmZpZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLndpZGdldC52YWx1ZS5nZXRGb2N1c2VkSXRlbSgpO1xuXHRcdGxldCBmbGFncyA9IDA7XG5cdFx0aWYgKGtlZXBBbHRlcm5hdGl2ZVN1Z2dlc3Rpb25zKSB7XG5cdFx0XHRmbGFncyB8PSBJbnNlcnRGbGFncy5LZWVwQWx0ZXJuYXRpdmVTdWdnZXN0aW9ucztcblx0XHR9XG5cdFx0aWYgKGFsdGVybmF0aXZlT3ZlcndyaXRlQ29uZmlnKSB7XG5cdFx0XHRmbGFncyB8PSBJbnNlcnRGbGFncy5BbHRlcm5hdGl2ZU92ZXJ3cml0ZUNvbmZpZztcblx0XHR9XG5cdFx0dGhpcy5faW5zZXJ0U3VnZ2VzdGlvbihpdGVtLCBmbGFncyk7XG5cdH1cblxuXHRhY2NlcHROZXh0U3VnZ2VzdGlvbigpIHtcblx0XHR0aGlzLl9hbHRlcm5hdGl2ZXMudmFsdWUubmV4dCgpO1xuXHR9XG5cblx0YWNjZXB0UHJldlN1Z2dlc3Rpb24oKSB7XG5cdFx0dGhpcy5fYWx0ZXJuYXRpdmVzLnZhbHVlLnByZXYoKTtcblx0fVxuXG5cdGNhbmNlbFN1Z2dlc3RXaWRnZXQoKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5jYW5jZWwoKTtcblx0XHR0aGlzLm1vZGVsLmNsZWFyKCk7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUuaGlkZVdpZGdldCgpO1xuXHR9XG5cblx0Zm9jdXNTdWdnZXN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLmZvY3VzU2VsZWN0ZWQoKTtcblx0fVxuXG5cdHNlbGVjdE5leHRTdWdnZXN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0LnZhbHVlLnNlbGVjdE5leHQoKTtcblx0fVxuXG5cdHNlbGVjdE5leHRQYWdlU3VnZ2VzdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC52YWx1ZS5zZWxlY3ROZXh0UGFnZSgpO1xuXHR9XG5cblx0c2VsZWN0TGFzdFN1Z2dlc3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUuc2VsZWN0TGFzdCgpO1xuXHR9XG5cblx0c2VsZWN0UHJldlN1Z2dlc3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUuc2VsZWN0UHJldmlvdXMoKTtcblx0fVxuXG5cdHNlbGVjdFByZXZQYWdlU3VnZ2VzdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC52YWx1ZS5zZWxlY3RQcmV2aW91c1BhZ2UoKTtcblx0fVxuXG5cdHNlbGVjdEZpcnN0U3VnZ2VzdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC52YWx1ZS5zZWxlY3RGaXJzdCgpO1xuXHR9XG5cblx0dG9nZ2xlU3VnZ2VzdGlvbkRldGFpbHMoKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUudG9nZ2xlRGV0YWlscygpO1xuXHR9XG5cblx0dG9nZ2xlRXhwbGFpbk1vZGUoKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQudmFsdWUudG9nZ2xlRXhwbGFpbk1vZGUoKTtcblx0fVxuXG5cdHRvZ2dsZVN1Z2dlc3Rpb25Gb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC52YWx1ZS50b2dnbGVEZXRhaWxzRm9jdXMoKTtcblx0fVxuXG5cdHJlc2V0V2lkZ2V0U2l6ZSgpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC52YWx1ZS5yZXNldFBlcnNpc3RlZFNpemUoKTtcblx0fVxuXG5cdGZvcmNlUmVuZGVyaW5nQWJvdmUoKSB7XG5cdFx0aWYgKHRoaXMud2lkZ2V0LmlzSW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRoaXMud2lkZ2V0LnZhbHVlLmZvcmNlUmVuZGVyaW5nQWJvdmUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRGVmZXIgdGhpcyB1bnRpbCB0aGUgd2lkZ2V0IGlzIGNyZWF0ZWRcblx0XHRcdHRoaXMuX3dhbnRzRm9yY2VSZW5kZXJpbmdBYm92ZSA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0c3RvcEZvcmNlUmVuZGVyaW5nQWJvdmUoKSB7XG5cdFx0aWYgKHRoaXMud2lkZ2V0LmlzSW5pdGlhbGl6ZWQpIHtcblx0XHRcdHRoaXMud2lkZ2V0LnZhbHVlLnN0b3BGb3JjZVJlbmRlcmluZ0Fib3ZlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3dhbnRzRm9yY2VSZW5kZXJpbmdBYm92ZSA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHJlZ2lzdGVyU2VsZWN0b3Ioc2VsZWN0b3I6IElTdWdnZXN0SXRlbVByZXNlbGVjdG9yKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLl9zZWxlY3RvcnMucmVnaXN0ZXIoc2VsZWN0b3IpO1xuXHR9XG59XG5cbmNsYXNzIFByaW9yaXR5UmVnaXN0cnk8VD4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtcyA9IG5ldyBBcnJheTxUPigpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgcHJpb3JpdHlTZWxlY3RvcjogKGl0ZW06IFQpID0+IG51bWJlcikgeyB9XG5cblx0cmVnaXN0ZXIodmFsdWU6IFQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX2l0ZW1zLmluZGV4T2YodmFsdWUpICE9PSAtMSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdWYWx1ZSBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQnKTtcblx0XHR9XG5cdFx0dGhpcy5faXRlbXMucHVzaCh2YWx1ZSk7XG5cdFx0dGhpcy5faXRlbXMuc29ydCgoczEsIHMyKSA9PiB0aGlzLnByaW9yaXR5U2VsZWN0b3IoczIpIC0gdGhpcy5wcmlvcml0eVNlbGVjdG9yKHMxKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpZHggPSB0aGlzLl9pdGVtcy5pbmRleE9mKHZhbHVlKTtcblx0XHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5faXRlbXMuc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Z2V0IGl0ZW1zT3JkZXJlZEJ5UHJpb3JpdHlEZXNjKCk6IHJlYWRvbmx5IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW1zO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUcmlnZ2VyU3VnZ2VzdEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IGlkID0gJ2VkaXRvci5hY3Rpb24udHJpZ2dlclN1Z2dlc3QnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUcmlnZ2VyU3VnZ2VzdEFjdGlvbi5pZCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdzdWdnZXN0LnRyaWdnZXIubGFiZWwnLCBcIlRyaWdnZXIgU3VnZ2VzdFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNDb21wbGV0aW9uSXRlbVByb3ZpZGVyLCBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpKSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU3BhY2UsXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJXSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5TcGFjZSwgc2Vjb25kYXJ5OiBbS2V5TW9kLkFsdCB8IEtleUNvZGUuRXNjYXBlLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SV0gfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gU3VnZ2VzdENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0eXBlIFRyaWdnZXJBcmdzID0geyBhdXRvOiBib29sZWFuIH07XG5cdFx0bGV0IGF1dG86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGFyZ3MgJiYgdHlwZW9mIGFyZ3MgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRpZiAoKDxUcmlnZ2VyQXJncz5hcmdzKS5hdXRvID09PSB0cnVlKSB7XG5cdFx0XHRcdGF1dG8gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnRyb2xsZXIudHJpZ2dlclN1Z2dlc3QodW5kZWZpbmVkLCBhdXRvLCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKFN1Z2dlc3RDb250cm9sbGVyLklELCBTdWdnZXN0Q29udHJvbGxlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5CZWZvcmVGaXJzdEludGVyYWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFRyaWdnZXJTdWdnZXN0QWN0aW9uKTtcblxuY29uc3Qgd2VpZ2h0ID0gS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgOTA7XG5cbmNvbnN0IFN1Z2dlc3RDb21tYW5kID0gRWRpdG9yQ29tbWFuZC5iaW5kVG9Db250cmlidXRpb248U3VnZ2VzdENvbnRyb2xsZXI+KFN1Z2dlc3RDb250cm9sbGVyLmdldCk7XG5cblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAnYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24pLFxuXHRoYW5kbGVyKHgpIHtcblx0XHR4LmFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbih0cnVlLCBmYWxzZSk7XG5cdH0sXG5cdGtiT3B0czogW3tcblx0XHQvLyBub3JtYWwgdGFiXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5UYWIsXG5cdFx0a2JFeHByOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMpLFxuXHRcdHdlaWdodCxcblx0fSwge1xuXHRcdC8vIGFjY2VwdCBvbiBlbnRlciBoYXMgc3BlY2lhbCBydWxlc1xuXHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0a2JFeHByOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsIFN1Z2dlc3RDb250ZXh0LkFjY2VwdFN1Z2dlc3Rpb25zT25FbnRlciwgU3VnZ2VzdENvbnRleHQuTWFrZXNUZXh0RWRpdCksXG5cdFx0d2VpZ2h0LFxuXHR9XSxcblx0bWVudU9wdHM6IFt7XG5cdFx0bWVudUlkOiBzdWdnZXN0V2lkZ2V0U3RhdHVzYmFyTWVudSxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdhY2NlcHQuaW5zZXJ0JywgXCJJbnNlcnRcIiksXG5cdFx0Z3JvdXA6ICdsZWZ0Jyxcblx0XHRvcmRlcjogMSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24sIFN1Z2dlc3RDb250ZXh0Lkhhc0luc2VydEFuZFJlcGxhY2VSYW5nZS50b05lZ2F0ZWQoKSlcblx0fSwge1xuXHRcdG1lbnVJZDogc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWNjZXB0Lmluc2VydCcsIFwiSW5zZXJ0XCIpLFxuXHRcdGdyb3VwOiAnbGVmdCcsXG5cdFx0b3JkZXI6IDEsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLCBTdWdnZXN0Q29udGV4dC5IYXNJbnNlcnRBbmRSZXBsYWNlUmFuZ2UsIFN1Z2dlc3RDb250ZXh0Lkluc2VydE1vZGUuaXNFcXVhbFRvKCdpbnNlcnQnKSlcblx0fSwge1xuXHRcdG1lbnVJZDogc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnYWNjZXB0LnJlcGxhY2UnLCBcIlJlcGxhY2VcIiksXG5cdFx0Z3JvdXA6ICdsZWZ0Jyxcblx0XHRvcmRlcjogMSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24sIFN1Z2dlc3RDb250ZXh0Lkhhc0luc2VydEFuZFJlcGxhY2VSYW5nZSwgU3VnZ2VzdENvbnRleHQuSW5zZXJ0TW9kZS5pc0VxdWFsVG8oJ3JlcGxhY2UnKSlcblx0fV1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAnYWNjZXB0QWx0ZXJuYXRpdmVTZWxlY3RlZFN1Z2dlc3Rpb24nLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5WaXNpYmxlLCBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cywgU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24pLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IHdlaWdodCxcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWJdLFxuXHR9LFxuXHRoYW5kbGVyKHgpIHtcblx0XHR4LmFjY2VwdFNlbGVjdGVkU3VnZ2VzdGlvbihmYWxzZSwgdHJ1ZSk7XG5cdH0sXG5cdG1lbnVPcHRzOiBbe1xuXHRcdG1lbnVJZDogc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUsXG5cdFx0Z3JvdXA6ICdsZWZ0Jyxcblx0XHRvcmRlcjogMixcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24sIFN1Z2dlc3RDb250ZXh0Lkhhc0luc2VydEFuZFJlcGxhY2VSYW5nZSwgU3VnZ2VzdENvbnRleHQuSW5zZXJ0TW9kZS5pc0VxdWFsVG8oJ2luc2VydCcpKSxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdhY2NlcHQucmVwbGFjZScsIFwiUmVwbGFjZVwiKVxuXHR9LCB7XG5cdFx0bWVudUlkOiBzdWdnZXN0V2lkZ2V0U3RhdHVzYmFyTWVudSxcblx0XHRncm91cDogJ2xlZnQnLFxuXHRcdG9yZGVyOiAyLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbiwgU3VnZ2VzdENvbnRleHQuSGFzSW5zZXJ0QW5kUmVwbGFjZVJhbmdlLCBTdWdnZXN0Q29udGV4dC5JbnNlcnRNb2RlLmlzRXF1YWxUbygncmVwbGFjZScpKSxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdhY2NlcHQuaW5zZXJ0JywgXCJJbnNlcnRcIilcblx0fV1cbn0pKTtcblxuXG4vLyBjb250aW51ZSB0byBzdXBwb3J0IHRoZSBvbGQgY29tbWFuZFxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcygnYWNjZXB0U2VsZWN0ZWRTdWdnZXN0aW9uT25FbnRlcicsICdhY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24nKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAnaGlkZVN1Z2dlc3RXaWRnZXQnLFxuXHRwcmVjb25kaXRpb246IFN1Z2dlc3RDb250ZXh0LlZpc2libGUsXG5cdGhhbmRsZXI6IHggPT4geC5jYW5jZWxTdWdnZXN0V2lkZ2V0KCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Fc2NhcGVdXG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAnc2VsZWN0TmV4dFN1Z2dlc3Rpb24nLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5WaXNpYmxlLCBDb250ZXh0S2V5RXhwci5vcihTdWdnZXN0Q29udGV4dC5NdWx0aXBsZVN1Z2dlc3Rpb25zLCBTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbi5uZWdhdGUoKSkpLFxuXHRoYW5kbGVyOiBjID0+IGMuc2VsZWN0TmV4dFN1Z2dlc3Rpb24oKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiB3ZWlnaHQsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93XSxcblx0XHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3csIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csIEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlOXSB9XG5cdH0sXG5cdG1lbnVPcHRzOiB7XG5cdFx0bWVudUlkOiBzdWdnZXN0V2lkZ2V0U3RhdHVzYmFyTWVudSxcblx0XHRncm91cDogJ2xlZnQnLFxuXHRcdG9yZGVyOiAwLFxuXHRcdHdoZW46IFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLnRvTmVnYXRlZCgpLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2ZvY3VzLnN1Z2dlc3Rpb24nLCBcIlNlbGVjdFwiKVxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ3NlbGVjdE5leHRQYWdlU3VnZ2VzdGlvbicsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0LlZpc2libGUsIENvbnRleHRLZXlFeHByLm9yKFN1Z2dlc3RDb250ZXh0Lk11bHRpcGxlU3VnZ2VzdGlvbnMsIFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLm5lZ2F0ZSgpKSksXG5cdGhhbmRsZXI6IGMgPT4gYy5zZWxlY3ROZXh0UGFnZVN1Z2dlc3Rpb24oKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiB3ZWlnaHQsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlBhZ2VEb3duLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlRG93bl1cblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICdzZWxlY3RMYXN0U3VnZ2VzdGlvbicsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0LlZpc2libGUsIENvbnRleHRLZXlFeHByLm9yKFN1Z2dlc3RDb250ZXh0Lk11bHRpcGxlU3VnZ2VzdGlvbnMsIFN1Z2dlc3RDb250ZXh0Lkhhc0ZvY3VzZWRTdWdnZXN0aW9uLm5lZ2F0ZSgpKSksXG5cdGhhbmRsZXI6IGMgPT4gYy5zZWxlY3RMYXN0U3VnZ2VzdGlvbigpXG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ3NlbGVjdFByZXZTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgQ29udGV4dEtleUV4cHIub3IoU3VnZ2VzdENvbnRleHQuTXVsdGlwbGVTdWdnZXN0aW9ucywgU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24ubmVnYXRlKCkpKSxcblx0aGFuZGxlcjogYyA9PiBjLnNlbGVjdFByZXZTdWdnZXN0aW9uKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5VcEFycm93LFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93XSxcblx0XHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5VcEFycm93LCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdywgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleVBdIH1cblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICdzZWxlY3RQcmV2UGFnZVN1Z2dlc3Rpb24nLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5WaXNpYmxlLCBDb250ZXh0S2V5RXhwci5vcihTdWdnZXN0Q29udGV4dC5NdWx0aXBsZVN1Z2dlc3Rpb25zLCBTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbi5uZWdhdGUoKSkpLFxuXHRoYW5kbGVyOiBjID0+IGMuc2VsZWN0UHJldlBhZ2VTdWdnZXN0aW9uKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5Q29kZS5QYWdlVXAsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBhZ2VVcF1cblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICdzZWxlY3RGaXJzdFN1Z2dlc3Rpb24nLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5WaXNpYmxlLCBDb250ZXh0S2V5RXhwci5vcihTdWdnZXN0Q29udGV4dC5NdWx0aXBsZVN1Z2dlc3Rpb25zLCBTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbi5uZWdhdGUoKSkpLFxuXHRoYW5kbGVyOiBjID0+IGMuc2VsZWN0Rmlyc3RTdWdnZXN0aW9uKClcbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBTdWdnZXN0Q29tbWFuZCh7XG5cdGlkOiAnZm9jdXNTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24ubmVnYXRlKCkpLFxuXHRoYW5kbGVyOiB4ID0+IHguZm9jdXNTdWdnZXN0aW9uKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogd2VpZ2h0LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJXSxcblx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLlNwYWNlLCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SV0gfVxuXHR9LFxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICdmb2N1c0FuZEFjY2VwdFN1Z2dlc3Rpb24nLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5WaXNpYmxlLCBTdWdnZXN0Q29udGV4dC5IYXNGb2N1c2VkU3VnZ2VzdGlvbi5uZWdhdGUoKSksXG5cdGhhbmRsZXI6IGMgPT4ge1xuXHRcdGMuZm9jdXNTdWdnZXN0aW9uKCk7XG5cdFx0Yy5hY2NlcHRTZWxlY3RlZFN1Z2dlc3Rpb24odHJ1ZSwgZmFsc2UpO1xuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ3RvZ2dsZVN1Z2dlc3Rpb25EZXRhaWxzJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoU3VnZ2VzdENvbnRleHQuVmlzaWJsZSwgU3VnZ2VzdENvbnRleHQuSGFzRm9jdXNlZFN1Z2dlc3Rpb24pLFxuXHRoYW5kbGVyOiB4ID0+IHgudG9nZ2xlU3VnZ2VzdGlvbkRldGFpbHMoKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiB3ZWlnaHQsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU3BhY2UsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUldLFxuXHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuU3BhY2UsIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJXSB9XG5cdH0sXG5cdG1lbnVPcHRzOiBbe1xuXHRcdG1lbnVJZDogc3VnZ2VzdFdpZGdldFN0YXR1c2Jhck1lbnUsXG5cdFx0Z3JvdXA6ICdyaWdodCcsXG5cdFx0b3JkZXI6IDEsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFN1Z2dlc3RDb250ZXh0LkRldGFpbHNWaXNpYmxlLCBTdWdnZXN0Q29udGV4dC5DYW5SZXNvbHZlKSxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdkZXRhaWwubW9yZScsIFwiU2hvdyBMZXNzXCIpXG5cdH0sIHtcblx0XHRtZW51SWQ6IHN1Z2dlc3RXaWRnZXRTdGF0dXNiYXJNZW51LFxuXHRcdGdyb3VwOiAncmlnaHQnLFxuXHRcdG9yZGVyOiAxLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChTdWdnZXN0Q29udGV4dC5EZXRhaWxzVmlzaWJsZS50b05lZ2F0ZWQoKSwgU3VnZ2VzdENvbnRleHQuQ2FuUmVzb2x2ZSksXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnZGV0YWlsLmxlc3MnLCBcIlNob3cgTW9yZVwiKVxuXHR9XVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICd0b2dnbGVFeHBsYWluTW9kZScsXG5cdHByZWNvbmRpdGlvbjogU3VnZ2VzdENvbnRleHQuVmlzaWJsZSxcblx0aGFuZGxlcjogeCA9PiB4LnRvZ2dsZUV4cGxhaW5Nb2RlKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5TbGFzaCxcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFN1Z2dlc3RDb21tYW5kKHtcblx0aWQ6ICd0b2dnbGVTdWdnZXN0aW9uRm9jdXMnLFxuXHRwcmVjb25kaXRpb246IFN1Z2dlc3RDb250ZXh0LlZpc2libGUsXG5cdGhhbmRsZXI6IHggPT4geC50b2dnbGVTdWdnZXN0aW9uRm9jdXMoKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiB3ZWlnaHQsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlNwYWNlLFxuXHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlNwYWNlIH1cblx0fVxufSkpO1xuXG4vLyNyZWdpb24gdGFiIGNvbXBsZXRpb25zXG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ2luc2VydEJlc3RDb21wbGV0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0RWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuZWRpdG9yLnRhYkNvbXBsZXRpb24nLCAnb24nKSxcblx0XHRXb3JkQ29udGV4dEtleS5BdEVuZCxcblx0XHRTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpLFxuXHRcdFN1Z2dlc3RBbHRlcm5hdGl2ZXMuT3RoZXJTdWdnZXN0aW9ucy50b05lZ2F0ZWQoKSxcblx0XHRTbmlwcGV0Q29udHJvbGxlcjIuSW5TbmlwcGV0TW9kZS50b05lZ2F0ZWQoKVxuXHQpLFxuXHRoYW5kbGVyOiAoeCwgYXJnKSA9PiB7XG5cblx0XHR4LnRyaWdnZXJTdWdnZXN0QW5kQWNjZXB0QmVzdChpc09iamVjdChhcmcpID8geyBmYWxsYmFjazogJ3RhYicsIC4uLmFyZyB9IDogeyBmYWxsYmFjazogJ3RhYicgfSk7XG5cdH0sXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodCxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlRhYlxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ2luc2VydE5leHRTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0RWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuZWRpdG9yLnRhYkNvbXBsZXRpb24nLCAnb24nKSxcblx0XHRTdWdnZXN0QWx0ZXJuYXRpdmVzLk90aGVyU3VnZ2VzdGlvbnMsXG5cdFx0U3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSxcblx0XHRTbmlwcGV0Q29udHJvbGxlcjIuSW5TbmlwcGV0TW9kZS50b05lZ2F0ZWQoKVxuXHQpLFxuXHRoYW5kbGVyOiB4ID0+IHguYWNjZXB0TmV4dFN1Z2dlc3Rpb24oKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiB3ZWlnaHQsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlRhYlxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgU3VnZ2VzdENvbW1hbmQoe1xuXHRpZDogJ2luc2VydFByZXZTdWdnZXN0aW9uJyxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0RWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuZWRpdG9yLnRhYkNvbXBsZXRpb24nLCAnb24nKSxcblx0XHRTdWdnZXN0QWx0ZXJuYXRpdmVzLk90aGVyU3VnZ2VzdGlvbnMsXG5cdFx0U3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSxcblx0XHRTbmlwcGV0Q29udHJvbGxlcjIuSW5TbmlwcGV0TW9kZS50b05lZ2F0ZWQoKVxuXHQpLFxuXHRoYW5kbGVyOiB4ID0+IHguYWNjZXB0UHJldlN1Z2dlc3Rpb24oKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiB3ZWlnaHQsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYlxuXHR9XG59KSk7XG5cblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIEVkaXRvckNvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3N1Z2dlc3RXaWRnZXRDb3B5Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogU3VnZ2VzdENvbnRleHQuRGV0YWlsc0ZvY3VzZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0d2VpZ2h0OiB3ZWlnaHQgKyAxMCxcblx0XHRcdFx0a2JFeHByOiBTdWdnZXN0Q29udGV4dC5EZXRhaWxzRm9jdXNlZCxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMsXG5cdFx0XHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Qywgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkluc2VydF0gfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHJ1bkVkaXRvckNvbW1hbmQoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0Z2V0V2luZG93KGVkaXRvci5nZXREb21Ob2RlKCkpLmRvY3VtZW50LmV4ZWNDb21tYW5kKCdjb3B5Jyk7XG5cdH1cbn0oKSk7XG5cbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKGNsYXNzIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ucmVzZXRTdWdnZXN0U2l6ZScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc3VnZ2VzdC5yZXNldC5sYWJlbCcsIFwiUmVzZXQgU3VnZ2VzdCBXaWRnZXQgU2l6ZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0U3VnZ2VzdENvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnJlc2V0V2lkZ2V0U2l6ZSgpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsbUJBQW1CLGlDQUFpQztBQUM3RCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFNBQVMs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
