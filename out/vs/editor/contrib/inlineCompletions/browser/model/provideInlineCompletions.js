import { assertNever } from "../../../../../base/common/assert.js";
import { AsyncIterableProducer } from "../../../../../base/common/async.js";
import { CachedFunction } from "../../../../../base/common/cache.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { groupByMap } from "../../../../../base/common/collections.js";
import { BugIndicatingError, onUnexpectedError, onUnexpectedExternalError } from "../../../../../base/common/errors.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { isDefined } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { prefixedUuid } from "../../../../../base/common/uuid.js";
import { StringReplacement } from "../../../../common/core/edits/stringEdit.js";
import { TextReplacement } from "../../../../common/core/edits/textEdit.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { OffsetRange } from "../../../../common/core/ranges/offsetRange.js";
import { InlineCompletionEndOfLifeReasonKind, InlineCompletionTriggerKind } from "../../../../common/languages.js";
import { fixBracketsInLine } from "../../../../common/model/bracketPairsTextModelPart/fixBrackets.js";
import { EditDeltaInfo } from "../../../../common/textModelEditSource.js";
import { SnippetParser, Text } from "../../../snippet/browser/snippetParser.js";
import { ErrorResult, getReadonlyEmptyArray } from "../utils.js";
import { InlineCompletionViewKind } from "../view/inlineEdits/inlineEditsViewInterface.js";
import { DirectedGraph } from "./graph.js";
import { inlineCompletionIsVisible } from "./inlineCompletionIsVisible.js";
function provideInlineCompletions(providers, position, model, context, requestInfo, languageConfigurationService) {
  const requestUuid = prefixedUuid("icr");
  const cancellationTokenSource = new CancellationTokenSource();
  let cancelReason = void 0;
  const contextWithUuid = { ...context, requestUuid };
  const defaultReplaceRange = getDefaultRange(position, model);
  const providersByGroupId = groupByMap(providers, (p) => p.groupId);
  const yieldsToGraph = DirectedGraph.from(providers, (p) => {
    return p.yieldsToGroupIds?.flatMap((groupId) => providersByGroupId.get(groupId) ?? []) ?? [];
  });
  const { foundCycles } = yieldsToGraph.removeCycles();
  if (foundCycles.length > 0) {
    onUnexpectedExternalError(new Error(`Inline completions: cyclic yield-to dependency detected. Path: ${foundCycles.map((s) => s.toString ? s.toString() : "" + s).join(" -> ")}`));
  }
  let runningCount = 0;
  const queryProvider = new CachedFunction(async (provider) => {
    try {
      runningCount++;
      if (cancellationTokenSource.token.isCancellationRequested) {
        return void 0;
      }
      const yieldsTo = yieldsToGraph.getOutgoing(provider);
      for (const p of yieldsTo) {
        const result2 = await queryProvider.get(p);
        if (result2) {
          for (const item of result2.inlineSuggestions.items) {
            if (item.isInlineEdit || typeof item.insertText !== "string" && item.insertText !== void 0) {
              return void 0;
            }
            if (item.insertText !== void 0) {
              const t = new TextReplacement(Range.lift(item.range) ?? defaultReplaceRange, item.insertText);
              if (inlineCompletionIsVisible(t, void 0, model, position)) {
                return void 0;
              }
            }
          }
        }
      }
      let result;
      const providerStartTime = Date.now();
      try {
        result = await provider.provideInlineCompletions(model, position, contextWithUuid, cancellationTokenSource.token);
      } catch (e) {
        onUnexpectedExternalError(e);
        return void 0;
      }
      const providerEndTime = Date.now();
      if (!result) {
        return void 0;
      }
      const data = [];
      const list = new InlineSuggestionList(result, data, provider);
      list.addRef();
      runWhenCancelled(cancellationTokenSource.token, () => {
        return list.removeRef(cancelReason);
      });
      if (cancellationTokenSource.token.isCancellationRequested) {
        return void 0;
      }
      for (const item of result.items) {
        const r = toInlineSuggestData(item, list, defaultReplaceRange, model, languageConfigurationService, contextWithUuid, requestInfo, { startTime: providerStartTime, endTime: providerEndTime });
        if (ErrorResult.is(r)) {
          r.logError();
          continue;
        }
        data.push(r);
      }
      return list;
    } finally {
      runningCount--;
    }
  });
  const inlineCompletionLists = AsyncIterableProducer.fromPromisesResolveOrder(providers.map((p) => queryProvider.get(p))).filter(isDefined);
  return {
    contextWithUuid,
    get didAllProvidersReturn() {
      return runningCount === 0;
    },
    lists: inlineCompletionLists,
    cancelAndDispose: (reason) => {
      if (cancelReason !== void 0) {
        return;
      }
      cancelReason = reason;
      cancellationTokenSource.dispose(true);
    }
  };
}
function runWhenCancelled(token, callback) {
  if (token.isCancellationRequested) {
    callback();
    return Disposable.None;
  } else {
    const listener = token.onCancellationRequested(() => {
      listener.dispose();
      callback();
    });
    return { dispose: () => listener.dispose() };
  }
}
function toInlineSuggestData(inlineCompletion, source, defaultReplaceRange, textModel, languageConfigurationService, context, requestInfo, providerRequestInfo) {
  let action;
  const uri = inlineCompletion.uri ? URI.revive(inlineCompletion.uri) : void 0;
  if (inlineCompletion.jumpToPosition !== void 0) {
    action = {
      kind: "jumpTo",
      position: Position.lift(inlineCompletion.jumpToPosition),
      uri
    };
  } else if (inlineCompletion.insertText !== void 0) {
    let insertText;
    let snippetInfo;
    let range = inlineCompletion.range ? Range.lift(inlineCompletion.range) : defaultReplaceRange;
    if (typeof inlineCompletion.insertText === "string") {
      insertText = inlineCompletion.insertText;
      if (languageConfigurationService && inlineCompletion.completeBracketPairs) {
        insertText = closeBrackets(
          insertText,
          range.getStartPosition(),
          textModel,
          languageConfigurationService
        );
        const diff = insertText.length - inlineCompletion.insertText.length;
        if (diff !== 0) {
          range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
        }
      }
      snippetInfo = void 0;
    } else if ("snippet" in inlineCompletion.insertText) {
      const preBracketCompletionLength = inlineCompletion.insertText.snippet.length;
      if (languageConfigurationService && inlineCompletion.completeBracketPairs) {
        inlineCompletion.insertText.snippet = closeBrackets(
          inlineCompletion.insertText.snippet,
          range.getStartPosition(),
          textModel,
          languageConfigurationService
        );
        const diff = inlineCompletion.insertText.snippet.length - preBracketCompletionLength;
        if (diff !== 0) {
          range = new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn + diff);
        }
      }
      const snippet = new SnippetParser().parse(inlineCompletion.insertText.snippet);
      if (snippet.children.length === 1 && snippet.children[0] instanceof Text) {
        insertText = snippet.children[0].value;
        snippetInfo = void 0;
      } else {
        insertText = snippet.toString();
        snippetInfo = {
          snippet: inlineCompletion.insertText.snippet,
          range
        };
      }
    } else {
      assertNever(inlineCompletion.insertText);
    }
    action = {
      kind: "edit",
      range,
      insertText,
      snippetInfo,
      uri,
      alternativeAction: void 0
    };
  } else {
    action = void 0;
    if (!inlineCompletion.hint) {
      return ErrorResult.message("Inline completion has no insertText, jumpToPosition nor hint.");
    }
  }
  return new InlineSuggestData(
    action,
    inlineCompletion.hint,
    inlineCompletion.additionalTextEdits || getReadonlyEmptyArray(),
    inlineCompletion,
    source,
    context,
    inlineCompletion.isInlineEdit ?? false,
    inlineCompletion.supportsRename ?? false,
    requestInfo,
    providerRequestInfo,
    inlineCompletion.correlationId
  );
}
class InlineSuggestData {
  constructor(_action, hint, additionalTextEdits, sourceInlineCompletion, source, context, isInlineEdit, supportsRename, _requestInfo, _providerRequestInfo, _correlationId) {
    this._action = _action;
    this.hint = hint;
    this.additionalTextEdits = additionalTextEdits;
    this.sourceInlineCompletion = sourceInlineCompletion;
    this.source = source;
    this.context = context;
    this.isInlineEdit = isInlineEdit;
    this.supportsRename = supportsRename;
    this._requestInfo = _requestInfo;
    this._providerRequestInfo = _providerRequestInfo;
    this._correlationId = _correlationId;
    this._didShow = false;
    this._timeUntilShown = void 0;
    this._timeUntilActuallyShown = void 0;
    this._showStartTime = void 0;
    this._shownDuration = 0;
    this._showUncollapsedStartTime = void 0;
    this._showUncollapsedDuration = 0;
    this._notShownReason = void 0;
    this._didReportEndOfLife = false;
    this._lastSetEndOfLifeReason = void 0;
    this._isPreceeded = false;
    this._partiallyAcceptedCount = 0;
    this._partiallyAcceptedSinceOriginal = { characters: 0, ratio: 0, count: 0 };
    this._renameInfo = void 0;
    this._editKind = void 0;
    this.performance = new InlineSuggestionsPerformance();
    this._viewData = { editorType: _requestInfo.editorType };
  }
  static createForTest(action, targetUri) {
    const mockInlineCompletion = {
      insertText: action?.kind === "edit" ? action.insertText : "",
      range: action?.kind === "edit" ? action.range : void 0,
      isInlineEdit: true
    };
    const mockProvider = {
      provideInlineCompletions: () => ({ items: [] }),
      disposeInlineCompletions: () => {
      }
    };
    const mockSource = new InlineSuggestionList(
      { items: [mockInlineCompletion] },
      [],
      mockProvider
    );
    const mockContext = {
      triggerKind: InlineCompletionTriggerKind.Explicit,
      selectedSuggestionInfo: void 0,
      requestUuid: "test-" + Date.now(),
      earliestShownDateTime: 0,
      includeInlineCompletions: true,
      includeInlineEdits: false,
      requestIssuedDateTime: Date.now()
    };
    const mockRequestInfo = {
      startTime: Date.now(),
      sku: void 0,
      editorType: "textEditor" /* TextEditor */,
      languageId: "plaintext",
      availableProviders: [],
      reason: "",
      typingInterval: 0,
      typingIntervalCharacterCount: 0
    };
    const mockProviderRequestInfo = {
      startTime: Date.now(),
      endTime: Date.now()
    };
    return new InlineSuggestData(
      action,
      void 0,
      [],
      mockInlineCompletion,
      mockSource,
      mockContext,
      true,
      false,
      mockRequestInfo,
      mockProviderRequestInfo,
      void 0
    );
  }
  get action() {
    return this._action;
  }
  get showInlineEditMenu() {
    return this.sourceInlineCompletion.showInlineEditMenu ?? false;
  }
  get partialAccepts() {
    return this._partiallyAcceptedSinceOriginal;
  }
  async reportInlineEditShown(commandService, updatedInsertText, viewKind, viewData, editKind, timeWhenShown) {
    this.updateShownDuration(viewKind);
    if (this._didShow || this._didReportEndOfLife) {
      return;
    }
    this.addPerformanceMarker("shown");
    this._didShow = true;
    this._editKind = editKind;
    this._viewData.viewKind = viewKind;
    this._viewData.renderData = viewData;
    this._timeUntilShown = timeWhenShown - this._requestInfo.startTime;
    this._timeUntilActuallyShown = Date.now() - this._requestInfo.startTime;
    const editDeltaInfo = new EditDeltaInfo(viewData.lineCountModified, viewData.lineCountOriginal, viewData.characterCountModified, viewData.characterCountOriginal);
    this.source.provider.handleItemDidShow?.(this.source.inlineSuggestions, this.sourceInlineCompletion, updatedInsertText, editDeltaInfo);
    if (this.sourceInlineCompletion.shownCommand) {
      await commandService.executeCommand(this.sourceInlineCompletion.shownCommand.id, ...this.sourceInlineCompletion.shownCommand.arguments || []);
    }
  }
  reportPartialAccept(acceptedCharacters, info, partialAcceptance) {
    this._partiallyAcceptedCount++;
    this._partiallyAcceptedSinceOriginal.characters += partialAcceptance.characters;
    this._partiallyAcceptedSinceOriginal.ratio = Math.min(this._partiallyAcceptedSinceOriginal.ratio + (1 - this._partiallyAcceptedSinceOriginal.ratio) * partialAcceptance.ratio, 1);
    this._partiallyAcceptedSinceOriginal.count += partialAcceptance.count;
    this.source.provider.handlePartialAccept?.(
      this.source.inlineSuggestions,
      this.sourceInlineCompletion,
      acceptedCharacters,
      info
    );
  }
  /**
   * Sends the end of life event to the provider.
   * If no reason is provided, the last set reason is used.
   * If no reason was set, the default reason is used.
  */
  reportEndOfLife(reason) {
    if (this._didReportEndOfLife) {
      return;
    }
    this._didReportEndOfLife = true;
    this.reportInlineEditHidden();
    if (!reason) {
      reason = this._lastSetEndOfLifeReason ?? { kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: void 0 };
    }
    if (reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected && !this._didShow) {
      reason = { kind: InlineCompletionEndOfLifeReasonKind.Ignored, userTypingDisagreed: false, supersededBy: void 0 };
    }
    if (reason.kind === InlineCompletionEndOfLifeReasonKind.Rejected && this.source.provider.handleRejection) {
      this.source.provider.handleRejection(this.source.inlineSuggestions, this.sourceInlineCompletion);
    }
    if (this.source.provider.handleEndOfLifetime) {
      const summary = {
        requestUuid: this.context.requestUuid,
        correlationId: this._correlationId,
        selectedSuggestionInfo: !!this.context.selectedSuggestionInfo,
        partiallyAccepted: this._partiallyAcceptedCount,
        partiallyAcceptedCountSinceOriginal: this._partiallyAcceptedSinceOriginal.count,
        partiallyAcceptedRatioSinceOriginal: this._partiallyAcceptedSinceOriginal.ratio,
        partiallyAcceptedCharactersSinceOriginal: this._partiallyAcceptedSinceOriginal.characters,
        shown: this._didShow,
        shownDuration: this._shownDuration,
        shownDurationUncollapsed: this._showUncollapsedDuration,
        editKind: this._editKind?.toString(),
        preceeded: this._isPreceeded,
        timeUntilShown: this._timeUntilShown,
        timeUntilActuallyShown: this._timeUntilActuallyShown,
        timeUntilProviderRequest: this._providerRequestInfo.startTime - this._requestInfo.startTime,
        timeUntilProviderResponse: this._providerRequestInfo.endTime - this._requestInfo.startTime,
        editorType: this._viewData.editorType,
        languageId: this._requestInfo.languageId,
        requestReason: this._requestInfo.reason,
        viewKind: this._viewData.viewKind,
        notShownReason: this._notShownReason,
        performanceMarkers: this.performance.toString(),
        renameCreated: this._renameInfo?.createdRename,
        renameDuration: this._renameInfo?.duration,
        renameTimedOut: this._renameInfo?.timedOut,
        renameDroppedOtherEdits: this._renameInfo?.droppedOtherEdits,
        renameDroppedRenameEdits: this._renameInfo?.droppedRenameEdits,
        typingInterval: this._requestInfo.typingInterval,
        typingIntervalCharacterCount: this._requestInfo.typingIntervalCharacterCount,
        skuPlan: this._requestInfo.sku?.plan,
        skuType: this._requestInfo.sku?.type,
        availableProviders: this._requestInfo.availableProviders.map((p) => p.toString()).join(","),
        ...this._viewData.renderData?.getData()
      };
      this.source.provider.handleEndOfLifetime(this.source.inlineSuggestions, this.sourceInlineCompletion, reason, summary);
    }
  }
  setIsPreceeded(partialAccepts) {
    this._isPreceeded = true;
    if (this._partiallyAcceptedSinceOriginal.characters !== 0 || this._partiallyAcceptedSinceOriginal.ratio !== 0 || this._partiallyAcceptedSinceOriginal.count !== 0) {
      console.warn("Expected partiallyAcceptedCountSinceOriginal to be { characters: 0, rate: 0, partialAcceptances: 0 } before setIsPreceeded.");
    }
    this._partiallyAcceptedSinceOriginal = partialAccepts;
  }
  setNotShownReason(reason) {
    this._notShownReason ??= reason;
  }
  /**
   * Sets the end of life reason, but does not send the event to the provider yet.
  */
  setEndOfLifeReason(reason) {
    this.reportInlineEditHidden();
    this._lastSetEndOfLifeReason = reason;
  }
  updateShownDuration(viewKind) {
    const timeNow = Date.now();
    if (!this._showStartTime) {
      this._showStartTime = timeNow;
    }
    const isCollapsed = viewKind === InlineCompletionViewKind.Collapsed;
    if (!isCollapsed && this._showUncollapsedStartTime === void 0) {
      this._showUncollapsedStartTime = timeNow;
    }
    if (isCollapsed && this._showUncollapsedStartTime !== void 0) {
      this._showUncollapsedDuration += timeNow - this._showUncollapsedStartTime;
    }
  }
  reportInlineEditHidden() {
    if (this._showStartTime === void 0) {
      return;
    }
    const timeNow = Date.now();
    this._shownDuration += timeNow - this._showStartTime;
    this._showStartTime = void 0;
    if (this._showUncollapsedStartTime === void 0) {
      return;
    }
    this._showUncollapsedDuration += timeNow - this._showUncollapsedStartTime;
    this._showUncollapsedStartTime = void 0;
  }
  setRenameProcessingInfo(info) {
    if (this._renameInfo) {
      throw new BugIndicatingError("Rename info has already been set.");
    }
    this._renameInfo = info;
  }
  withAction(action) {
    this._action = action;
    return this;
  }
  addPerformanceMarker(marker) {
    this.performance.mark(marker);
  }
}
class InlineSuggestionsPerformance {
  constructor() {
    this.markers = [];
    this.markers.push({ name: "start", timeStamp: Date.now() });
  }
  mark(marker) {
    this.markers.push({ name: marker, timeStamp: Date.now() });
  }
  toString() {
    const deltas = [];
    for (let i = 1; i < this.markers.length; i++) {
      const delta = this.markers[i].timeStamp - this.markers[i - 1].timeStamp;
      deltas.push({ [this.markers[i].name]: delta });
    }
    return JSON.stringify(deltas);
  }
}
var InlineCompletionEditorType = /* @__PURE__ */ ((InlineCompletionEditorType2) => {
  InlineCompletionEditorType2["TextEditor"] = "textEditor";
  InlineCompletionEditorType2["DiffEditor"] = "diffEditor";
  InlineCompletionEditorType2["Notebook"] = "notebook";
  return InlineCompletionEditorType2;
})(InlineCompletionEditorType || {});
class InlineSuggestionList {
  constructor(inlineSuggestions, inlineSuggestionsData, provider) {
    this.inlineSuggestions = inlineSuggestions;
    this.inlineSuggestionsData = inlineSuggestionsData;
    this.provider = provider;
    this.refCount = 0;
  }
  addRef() {
    this.refCount++;
  }
  removeRef(reason = { kind: "other" }) {
    this.refCount--;
    if (this.refCount === 0) {
      for (const item of this.inlineSuggestionsData) {
        item.reportEndOfLife();
      }
      this.provider.disposeInlineCompletions(this.inlineSuggestions, reason);
    } else if (this.refCount < 0) {
      onUnexpectedError(new BugIndicatingError(
        `InlineSuggestionList (provider=${this.provider.providerId?.toString()}) refCount went negative (${this.refCount}) \u2014 more removeRef than addRef calls.`
      ));
    }
  }
}
function getDefaultRange(position, model) {
  const word = model.getWordAtPosition(position);
  const maxColumn = model.getLineMaxColumn(position.lineNumber);
  return word ? new Range(position.lineNumber, word.startColumn, position.lineNumber, maxColumn) : Range.fromPositions(position, position.with(void 0, maxColumn));
}
function closeBrackets(text, position, model, languageConfigurationService) {
  const currentLine = model.getLineContent(position.lineNumber);
  const edit = StringReplacement.replace(new OffsetRange(position.column - 1, currentLine.length), text);
  const proposedLineTokens = model.tokenization.tokenizeLinesAt(position.lineNumber, [edit.replace(currentLine)]);
  const textTokens = proposedLineTokens?.[0].sliceZeroCopy(edit.getRangeAfterReplace());
  if (!textTokens) {
    return text;
  }
  const fixedText = fixBracketsInLine(textTokens, languageConfigurationService);
  return fixedText;
}
export {
  InlineCompletionEditorType,
  InlineSuggestData,
  InlineSuggestionList,
  provideInlineCompletions,
  runWhenCancelled
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxtb2RlbFxccHJvdmlkZUlubGluZUNvbXBsZXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZVByb2R1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FjaGVkRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYWNoZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ3JvdXBCeU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgb25VbmV4cGVjdGVkRXJyb3IsIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHByZWZpeGVkVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBTdHJpbmdSZXBsYWNlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgVGV4dFJlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElJbmxpbmVDb21wbGV0aW9uSGludCwgSW5saW5lQ29tcGxldGlvbiwgSW5saW5lQ29tcGxldGlvbkNvbnRleHQsIElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb24sIElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLCBJbmxpbmVDb21wbGV0aW9ucywgSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uLCBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLCBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsIExpZmV0aW1lU3VtbWFyeSwgUGFydGlhbEFjY2VwdEluZm8sIFByb3ZpZGVySWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGZpeEJyYWNrZXRzSW5MaW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2JyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQvZml4QnJhY2tldHMuanMnO1xuaW1wb3J0IHsgRWRpdERlbHRhSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFZGl0U291cmNlLmpzJztcbmltcG9ydCB7IFNuaXBwZXRQYXJzZXIsIFRleHQgfSBmcm9tICcuLi8uLi8uLi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldFBhcnNlci5qcyc7XG5pbXBvcnQgeyBFcnJvclJlc3VsdCwgZ2V0UmVhZG9ubHlFbXB0eUFycmF5IH0gZnJvbSAnLi4vdXRpbHMuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvblZpZXdEYXRhLCBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQgfSBmcm9tICcuLi92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0aW9uRWRpdEtpbmQgfSBmcm9tICcuL2VkaXRLaW5kLmpzJztcbmltcG9ydCB7IERpcmVjdGVkR3JhcGggfSBmcm9tICcuL2dyYXBoLmpzJztcbmltcG9ydCB7IGlubGluZUNvbXBsZXRpb25Jc1Zpc2libGUgfSBmcm9tICcuL2lubGluZUNvbXBsZXRpb25Jc1Zpc2libGUuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdEFsdGVybmF0aXZlQWN0aW9uIH0gZnJvbSAnLi9JbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24uanMnO1xuXG5leHBvcnQgdHlwZSBJbmxpbmVDb21wbGV0aW9uQ29udGV4dFdpdGhvdXRVdWlkID0gT21pdDxJbmxpbmVDb21wbGV0aW9uQ29udGV4dCwgJ3JlcXVlc3RVdWlkJz47XG5cbmV4cG9ydCBmdW5jdGlvbiBwcm92aWRlSW5saW5lQ29tcGxldGlvbnMoXG5cdHByb3ZpZGVyczogSW5saW5lQ29tcGxldGlvbnNQcm92aWRlcltdLFxuXHRwb3NpdGlvbjogUG9zaXRpb24sXG5cdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRjb250ZXh0OiBJbmxpbmVDb21wbGV0aW9uQ29udGV4dFdpdGhvdXRVdWlkLFxuXHRyZXF1ZXN0SW5mbzogSW5saW5lU3VnZ2VzdFJlcXVlc3RJbmZvLFxuXHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlPzogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG4pOiBJSW5saW5lQ29tcGxldGlvblByb3ZpZGVyUmVzdWx0IHtcblx0Y29uc3QgcmVxdWVzdFV1aWQgPSBwcmVmaXhlZFV1aWQoJ2ljcicpO1xuXG5cdGNvbnN0IGNhbmNlbGxhdGlvblRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdGxldCBjYW5jZWxSZWFzb246IElubGluZUNvbXBsZXRpb25zRGlzcG9zZVJlYXNvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdCBjb250ZXh0V2l0aFV1aWQ6IElubGluZUNvbXBsZXRpb25Db250ZXh0ID0geyAuLi5jb250ZXh0LCByZXF1ZXN0VXVpZDogcmVxdWVzdFV1aWQgfTtcblxuXHRjb25zdCBkZWZhdWx0UmVwbGFjZVJhbmdlID0gZ2V0RGVmYXVsdFJhbmdlKHBvc2l0aW9uLCBtb2RlbCk7XG5cblx0Y29uc3QgcHJvdmlkZXJzQnlHcm91cElkID0gZ3JvdXBCeU1hcChwcm92aWRlcnMsIHAgPT4gcC5ncm91cElkKTtcblx0Y29uc3QgeWllbGRzVG9HcmFwaCA9IERpcmVjdGVkR3JhcGguZnJvbShwcm92aWRlcnMsIHAgPT4ge1xuXHRcdHJldHVybiBwLnlpZWxkc1RvR3JvdXBJZHM/LmZsYXRNYXAoZ3JvdXBJZCA9PiBwcm92aWRlcnNCeUdyb3VwSWQuZ2V0KGdyb3VwSWQpID8/IFtdKSA/PyBbXTtcblx0fSk7XG5cdGNvbnN0IHsgZm91bmRDeWNsZXMgfSA9IHlpZWxkc1RvR3JhcGgucmVtb3ZlQ3ljbGVzKCk7XG5cdGlmIChmb3VuZEN5Y2xlcy5sZW5ndGggPiAwKSB7XG5cdFx0b25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcihuZXcgRXJyb3IoYElubGluZSBjb21wbGV0aW9uczogY3ljbGljIHlpZWxkLXRvIGRlcGVuZGVuY3kgZGV0ZWN0ZWQuYFxuXHRcdFx0KyBgIFBhdGg6ICR7Zm91bmRDeWNsZXMubWFwKHMgPT4gcy50b1N0cmluZyA/IHMudG9TdHJpbmcoKSA6ICgnJyArIHMpKS5qb2luKCcgLT4gJyl9YCkpO1xuXHR9XG5cblx0bGV0IHJ1bm5pbmdDb3VudCA9IDA7XG5cblx0Y29uc3QgcXVlcnlQcm92aWRlciA9IG5ldyBDYWNoZWRGdW5jdGlvbihhc3luYyAocHJvdmlkZXI6IElubGluZUNvbXBsZXRpb25zUHJvdmlkZXI8SW5saW5lQ29tcGxldGlvbnM+KTogUHJvbWlzZTxJbmxpbmVTdWdnZXN0aW9uTGlzdCB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRydW5uaW5nQ291bnQrKztcblx0XHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB5aWVsZHNUbyA9IHlpZWxkc1RvR3JhcGguZ2V0T3V0Z29pbmcocHJvdmlkZXIpO1xuXHRcdFx0Zm9yIChjb25zdCBwIG9mIHlpZWxkc1RvKSB7XG5cdFx0XHRcdC8vIFdlIGtub3cgdGhlcmUgaXMgbm8gY3ljbGUsIHNvIG5vIHJlY3Vyc2lvbiBoZXJlXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1ZXJ5UHJvdmlkZXIuZ2V0KHApO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlc3VsdC5pbmxpbmVTdWdnZXN0aW9ucy5pdGVtcykge1xuXHRcdFx0XHRcdFx0aWYgKGl0ZW0uaXNJbmxpbmVFZGl0IHx8IHR5cGVvZiBpdGVtLmluc2VydFRleHQgIT09ICdzdHJpbmcnICYmIGl0ZW0uaW5zZXJ0VGV4dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaXRlbS5pbnNlcnRUZXh0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdCA9IG5ldyBUZXh0UmVwbGFjZW1lbnQoUmFuZ2UubGlmdChpdGVtLnJhbmdlKSA/PyBkZWZhdWx0UmVwbGFjZVJhbmdlLCBpdGVtLmluc2VydFRleHQpO1xuXHRcdFx0XHRcdFx0XHRpZiAoaW5saW5lQ29tcGxldGlvbklzVmlzaWJsZSh0LCB1bmRlZmluZWQsIG1vZGVsLCBwb3NpdGlvbikpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIGVsc2U6IGlubGluZSBjb21wbGV0aW9uIGlzIG5vdCB2aXNpYmxlLCBzbyBsZXRzIG5vdCBibG9ja1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcmVzdWx0OiBJbmxpbmVDb21wbGV0aW9ucyB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwcm92aWRlclN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlSW5saW5lQ29tcGxldGlvbnMobW9kZWwsIHBvc2l0aW9uLCBjb250ZXh0V2l0aFV1aWQsIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcihlKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHByb3ZpZGVyRW5kVGltZSA9IERhdGUubm93KCk7XG5cblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRhdGE6IElubGluZVN1Z2dlc3REYXRhW10gPSBbXTtcblx0XHRcdGNvbnN0IGxpc3QgPSBuZXcgSW5saW5lU3VnZ2VzdGlvbkxpc3QocmVzdWx0LCBkYXRhLCBwcm92aWRlcik7XG5cdFx0XHRsaXN0LmFkZFJlZigpO1xuXHRcdFx0cnVuV2hlbkNhbmNlbGxlZChjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbiwgKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbGlzdC5yZW1vdmVSZWYoY2FuY2VsUmVhc29uKTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIFRoZSBsaXN0IGlzIGRpc3Bvc2VkIG5vdywgc28gd2UgY2Fubm90IHJldHVybiB0aGUgaXRlbXMhXG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiByZXN1bHQuaXRlbXMpIHtcblx0XHRcdFx0Y29uc3QgciA9IHRvSW5saW5lU3VnZ2VzdERhdGEoaXRlbSwgbGlzdCwgZGVmYXVsdFJlcGxhY2VSYW5nZSwgbW9kZWwsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRXaXRoVXVpZCwgcmVxdWVzdEluZm8sIHsgc3RhcnRUaW1lOiBwcm92aWRlclN0YXJ0VGltZSwgZW5kVGltZTogcHJvdmlkZXJFbmRUaW1lIH0pO1xuXHRcdFx0XHRpZiAoRXJyb3JSZXN1bHQuaXMocikpIHtcblx0XHRcdFx0XHRyLmxvZ0Vycm9yKCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGF0YS5wdXNoKHIpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbGlzdDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cnVubmluZ0NvdW50LS07XG5cdFx0fVxuXHR9KTtcblxuXHRjb25zdCBpbmxpbmVDb21wbGV0aW9uTGlzdHMgPSBBc3luY0l0ZXJhYmxlUHJvZHVjZXIuZnJvbVByb21pc2VzUmVzb2x2ZU9yZGVyKHByb3ZpZGVycy5tYXAocCA9PiBxdWVyeVByb3ZpZGVyLmdldChwKSkpLmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdHJldHVybiB7XG5cdFx0Y29udGV4dFdpdGhVdWlkLFxuXHRcdGdldCBkaWRBbGxQcm92aWRlcnNSZXR1cm4oKSB7IHJldHVybiBydW5uaW5nQ291bnQgPT09IDA7IH0sXG5cdFx0bGlzdHM6IGlubGluZUNvbXBsZXRpb25MaXN0cyxcblx0XHRjYW5jZWxBbmREaXNwb3NlOiByZWFzb24gPT4ge1xuXHRcdFx0aWYgKGNhbmNlbFJlYXNvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNhbmNlbFJlYXNvbiA9IHJlYXNvbjtcblx0XHRcdGNhbmNlbGxhdGlvblRva2VuU291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0fVxuXHR9O1xufVxuXG4vKiogSWYgdGhlIHRva2VuIGlzIGV2ZW50dWFsbHkgY2FuY2VsbGVkLCB0aGlzIHdpbGwgbm90IGxlYWsgZWl0aGVyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJ1bldoZW5DYW5jZWxsZWQodG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0Y2FsbGJhY2soKTtcblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IGxpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0Y2FsbGJhY2soKTtcblx0XHR9KTtcblx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiBsaXN0ZW5lci5kaXNwb3NlKCkgfTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElJbmxpbmVDb21wbGV0aW9uUHJvdmlkZXJSZXN1bHQge1xuXHRnZXQgZGlkQWxsUHJvdmlkZXJzUmV0dXJuKCk6IGJvb2xlYW47XG5cblx0Y29udGV4dFdpdGhVdWlkOiBJbmxpbmVDb21wbGV0aW9uQ29udGV4dDtcblxuXHRjYW5jZWxBbmREaXNwb3NlKHJlYXNvbjogSW5saW5lQ29tcGxldGlvbnNEaXNwb3NlUmVhc29uKTogdm9pZDtcblxuXHRsaXN0czogQXN5bmNJdGVyYWJsZVByb2R1Y2VyPElubGluZVN1Z2dlc3Rpb25MaXN0Pjtcbn1cblxuZnVuY3Rpb24gdG9JbmxpbmVTdWdnZXN0RGF0YShcblx0aW5saW5lQ29tcGxldGlvbjogSW5saW5lQ29tcGxldGlvbixcblx0c291cmNlOiBJbmxpbmVTdWdnZXN0aW9uTGlzdCxcblx0ZGVmYXVsdFJlcGxhY2VSYW5nZTogUmFuZ2UsXG5cdHRleHRNb2RlbDogSVRleHRNb2RlbCxcblx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfCB1bmRlZmluZWQsXG5cdGNvbnRleHQ6IElubGluZUNvbXBsZXRpb25Db250ZXh0LFxuXHRyZXF1ZXN0SW5mbzogSW5saW5lU3VnZ2VzdFJlcXVlc3RJbmZvLFxuXHRwcm92aWRlclJlcXVlc3RJbmZvOiBJbmxpbmVTdWdnZXN0UHJvdmlkZXJSZXF1ZXN0SW5mbyxcbik6IElubGluZVN1Z2dlc3REYXRhIHwgRXJyb3JSZXN1bHQge1xuXG5cdGxldCBhY3Rpb246IElJbmxpbmVTdWdnZXN0RGF0YUFjdGlvbiB8IHVuZGVmaW5lZDtcblx0Y29uc3QgdXJpID0gaW5saW5lQ29tcGxldGlvbi51cmkgPyBVUkkucmV2aXZlKGlubGluZUNvbXBsZXRpb24udXJpKSA6IHVuZGVmaW5lZDtcblxuXHRpZiAoaW5saW5lQ29tcGxldGlvbi5qdW1wVG9Qb3NpdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0YWN0aW9uID0ge1xuXHRcdFx0a2luZDogJ2p1bXBUbycsXG5cdFx0XHRwb3NpdGlvbjogUG9zaXRpb24ubGlmdChpbmxpbmVDb21wbGV0aW9uLmp1bXBUb1Bvc2l0aW9uKSxcblx0XHRcdHVyaSxcblx0XHR9O1xuXHR9IGVsc2UgaWYgKGlubGluZUNvbXBsZXRpb24uaW5zZXJ0VGV4dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0bGV0IGluc2VydFRleHQ6IHN0cmluZztcblx0XHRsZXQgc25pcHBldEluZm86IFNuaXBwZXRJbmZvIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByYW5nZSA9IGlubGluZUNvbXBsZXRpb24ucmFuZ2UgPyBSYW5nZS5saWZ0KGlubGluZUNvbXBsZXRpb24ucmFuZ2UpIDogZGVmYXVsdFJlcGxhY2VSYW5nZTtcblxuXHRcdGlmICh0eXBlb2YgaW5saW5lQ29tcGxldGlvbi5pbnNlcnRUZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0aW5zZXJ0VGV4dCA9IGlubGluZUNvbXBsZXRpb24uaW5zZXJ0VGV4dDtcblxuXHRcdFx0aWYgKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgJiYgaW5saW5lQ29tcGxldGlvbi5jb21wbGV0ZUJyYWNrZXRQYWlycykge1xuXHRcdFx0XHRpbnNlcnRUZXh0ID0gY2xvc2VCcmFja2V0cyhcblx0XHRcdFx0XHRpbnNlcnRUZXh0LFxuXHRcdFx0XHRcdHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSxcblx0XHRcdFx0XHR0ZXh0TW9kZWwsXG5cdFx0XHRcdFx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdC8vIE1vZGlmeSByYW5nZSBkZXBlbmRpbmcgb24gaWYgYnJhY2tldHMgYXJlIGFkZGVkIG9yIHJlbW92ZWRcblx0XHRcdFx0Y29uc3QgZGlmZiA9IGluc2VydFRleHQubGVuZ3RoIC0gaW5saW5lQ29tcGxldGlvbi5pbnNlcnRUZXh0Lmxlbmd0aDtcblx0XHRcdFx0aWYgKGRpZmYgIT09IDApIHtcblx0XHRcdFx0XHRyYW5nZSA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4gKyBkaWZmKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRzbmlwcGV0SW5mbyA9IHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKCdzbmlwcGV0JyBpbiBpbmxpbmVDb21wbGV0aW9uLmluc2VydFRleHQpIHtcblx0XHRcdGNvbnN0IHByZUJyYWNrZXRDb21wbGV0aW9uTGVuZ3RoID0gaW5saW5lQ29tcGxldGlvbi5pbnNlcnRUZXh0LnNuaXBwZXQubGVuZ3RoO1xuXG5cdFx0XHRpZiAobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSAmJiBpbmxpbmVDb21wbGV0aW9uLmNvbXBsZXRlQnJhY2tldFBhaXJzKSB7XG5cdFx0XHRcdGlubGluZUNvbXBsZXRpb24uaW5zZXJ0VGV4dC5zbmlwcGV0ID0gY2xvc2VCcmFja2V0cyhcblx0XHRcdFx0XHRpbmxpbmVDb21wbGV0aW9uLmluc2VydFRleHQuc25pcHBldCxcblx0XHRcdFx0XHRyYW5nZS5nZXRTdGFydFBvc2l0aW9uKCksXG5cdFx0XHRcdFx0dGV4dE1vZGVsLFxuXHRcdFx0XHRcdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHRcdFx0KTtcblxuXHRcdFx0XHQvLyBNb2RpZnkgcmFuZ2UgZGVwZW5kaW5nIG9uIGlmIGJyYWNrZXRzIGFyZSBhZGRlZCBvciByZW1vdmVkXG5cdFx0XHRcdGNvbnN0IGRpZmYgPSBpbmxpbmVDb21wbGV0aW9uLmluc2VydFRleHQuc25pcHBldC5sZW5ndGggLSBwcmVCcmFja2V0Q29tcGxldGlvbkxlbmd0aDtcblx0XHRcdFx0aWYgKGRpZmYgIT09IDApIHtcblx0XHRcdFx0XHRyYW5nZSA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4gKyBkaWZmKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzbmlwcGV0ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZShpbmxpbmVDb21wbGV0aW9uLmluc2VydFRleHQuc25pcHBldCk7XG5cblx0XHRcdGlmIChzbmlwcGV0LmNoaWxkcmVuLmxlbmd0aCA9PT0gMSAmJiBzbmlwcGV0LmNoaWxkcmVuWzBdIGluc3RhbmNlb2YgVGV4dCkge1xuXHRcdFx0XHRpbnNlcnRUZXh0ID0gc25pcHBldC5jaGlsZHJlblswXS52YWx1ZTtcblx0XHRcdFx0c25pcHBldEluZm8gPSB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbnNlcnRUZXh0ID0gc25pcHBldC50b1N0cmluZygpO1xuXHRcdFx0XHRzbmlwcGV0SW5mbyA9IHtcblx0XHRcdFx0XHRzbmlwcGV0OiBpbmxpbmVDb21wbGV0aW9uLmluc2VydFRleHQuc25pcHBldCxcblx0XHRcdFx0XHRyYW5nZTogcmFuZ2Vcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0TmV2ZXIoaW5saW5lQ29tcGxldGlvbi5pbnNlcnRUZXh0KTtcblx0XHR9XG5cdFx0YWN0aW9uID0ge1xuXHRcdFx0a2luZDogJ2VkaXQnLFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRpbnNlcnRUZXh0LFxuXHRcdFx0c25pcHBldEluZm8sXG5cdFx0XHR1cmksXG5cdFx0XHRhbHRlcm5hdGl2ZUFjdGlvbjogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH0gZWxzZSB7XG5cdFx0YWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdGlmICghaW5saW5lQ29tcGxldGlvbi5oaW50KSB7XG5cdFx0XHRyZXR1cm4gRXJyb3JSZXN1bHQubWVzc2FnZSgnSW5saW5lIGNvbXBsZXRpb24gaGFzIG5vIGluc2VydFRleHQsIGp1bXBUb1Bvc2l0aW9uIG5vciBoaW50LicpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBuZXcgSW5saW5lU3VnZ2VzdERhdGEoXG5cdFx0YWN0aW9uLFxuXHRcdGlubGluZUNvbXBsZXRpb24uaGludCxcblx0XHRpbmxpbmVDb21wbGV0aW9uLmFkZGl0aW9uYWxUZXh0RWRpdHMgfHwgZ2V0UmVhZG9ubHlFbXB0eUFycmF5KCksXG5cdFx0aW5saW5lQ29tcGxldGlvbixcblx0XHRzb3VyY2UsXG5cdFx0Y29udGV4dCxcblx0XHRpbmxpbmVDb21wbGV0aW9uLmlzSW5saW5lRWRpdCA/PyBmYWxzZSxcblx0XHRpbmxpbmVDb21wbGV0aW9uLnN1cHBvcnRzUmVuYW1lID8/IGZhbHNlLFxuXHRcdHJlcXVlc3RJbmZvLFxuXHRcdHByb3ZpZGVyUmVxdWVzdEluZm8sXG5cdFx0aW5saW5lQ29tcGxldGlvbi5jb3JyZWxhdGlvbklkLFxuXHQpO1xufVxuXG5leHBvcnQgdHlwZSBJbmxpbmVTdWdnZXN0U2t1ID0geyB0eXBlOiBzdHJpbmc7IHBsYW46IHN0cmluZyB9O1xuXG5leHBvcnQgdHlwZSBJbmxpbmVTdWdnZXN0UmVxdWVzdEluZm8gPSB7XG5cdHN0YXJ0VGltZTogbnVtYmVyO1xuXHRlZGl0b3JUeXBlOiBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZTtcblx0bGFuZ3VhZ2VJZDogc3RyaW5nO1xuXHRyZWFzb246IHN0cmluZztcblx0dHlwaW5nSW50ZXJ2YWw6IG51bWJlcjtcblx0dHlwaW5nSW50ZXJ2YWxDaGFyYWN0ZXJDb3VudDogbnVtYmVyO1xuXHRhdmFpbGFibGVQcm92aWRlcnM6IFByb3ZpZGVySWRbXTtcblx0c2t1OiBJbmxpbmVTdWdnZXN0U2t1IHwgdW5kZWZpbmVkO1xufTtcblxuZXhwb3J0IHR5cGUgSW5saW5lU3VnZ2VzdFByb3ZpZGVyUmVxdWVzdEluZm8gPSB7XG5cdHN0YXJ0VGltZTogbnVtYmVyO1xuXHRlbmRUaW1lOiBudW1iZXI7XG59O1xuXG5leHBvcnQgdHlwZSBQYXJ0aWFsQWNjZXB0YW5jZSA9IHtcblx0Y2hhcmFjdGVyczogbnVtYmVyO1xuXHRjb3VudDogbnVtYmVyO1xuXHRyYXRpbzogbnVtYmVyO1xufTtcblxuZXhwb3J0IHR5cGUgUmVuYW1lSW5mbyA9IHtcblx0Y3JlYXRlZFJlbmFtZTogYm9vbGVhbjtcblx0ZHVyYXRpb246IG51bWJlcjtcblx0dGltZWRPdXQ/OiBib29sZWFuO1xuXHRkcm9wcGVkT3RoZXJFZGl0cz86IG51bWJlcjtcblx0ZHJvcHBlZFJlbmFtZUVkaXRzPzogbnVtYmVyO1xufTtcblxuZXhwb3J0IHR5cGUgSW5saW5lU3VnZ2VzdFZpZXdEYXRhID0ge1xuXHRlZGl0b3JUeXBlOiBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZTtcblx0cmVuZGVyRGF0YT86IElubGluZUNvbXBsZXRpb25WaWV3RGF0YTtcblx0dmlld0tpbmQ/OiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQ7XG59O1xuXG5leHBvcnQgdHlwZSBJSW5saW5lU3VnZ2VzdERhdGFBY3Rpb24gPSBJSW5saW5lU3VnZ2VzdERhdGFBY3Rpb25FZGl0IHwgSUlubGluZVN1Z2dlc3REYXRhQWN0aW9uSnVtcFRvO1xuXG5leHBvcnQgaW50ZXJmYWNlIElJbmxpbmVTdWdnZXN0RGF0YUFjdGlvbkVkaXQge1xuXHRraW5kOiAnZWRpdCc7XG5cdHJhbmdlOiBSYW5nZTtcblx0aW5zZXJ0VGV4dDogc3RyaW5nO1xuXHRzbmlwcGV0SW5mbzogU25pcHBldEluZm8gfCB1bmRlZmluZWQ7XG5cdHVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRhbHRlcm5hdGl2ZUFjdGlvbjogSW5saW5lU3VnZ2VzdEFsdGVybmF0aXZlQWN0aW9uIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElJbmxpbmVTdWdnZXN0RGF0YUFjdGlvbkp1bXBUbyB7XG5cdGtpbmQ6ICdqdW1wVG8nO1xuXHRwb3NpdGlvbjogUG9zaXRpb247XG5cdHVyaTogVVJJIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgSW5saW5lU3VnZ2VzdERhdGEge1xuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZUZvclRlc3QoYWN0aW9uOiBJSW5saW5lU3VnZ2VzdERhdGFBY3Rpb24gfCB1bmRlZmluZWQsIHRhcmdldFVyaTogVVJJKTogSW5saW5lU3VnZ2VzdERhdGEge1xuXHRcdGNvbnN0IG1vY2tJbmxpbmVDb21wbGV0aW9uOiBJbmxpbmVDb21wbGV0aW9uID0ge1xuXHRcdFx0aW5zZXJ0VGV4dDogYWN0aW9uPy5raW5kID09PSAnZWRpdCcgPyBhY3Rpb24uaW5zZXJ0VGV4dCA6ICcnLFxuXHRcdFx0cmFuZ2U6IGFjdGlvbj8ua2luZCA9PT0gJ2VkaXQnID8gYWN0aW9uLnJhbmdlIDogdW5kZWZpbmVkLFxuXHRcdFx0aXNJbmxpbmVFZGl0OiB0cnVlLFxuXHRcdH07XG5cdFx0Y29uc3QgbW9ja1Byb3ZpZGVyOiBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyID0ge1xuXHRcdFx0cHJvdmlkZUlubGluZUNvbXBsZXRpb25zOiAoKSA9PiAoeyBpdGVtczogW10gfSksXG5cdFx0XHRkaXNwb3NlSW5saW5lQ29tcGxldGlvbnM6ICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdGNvbnN0IG1vY2tTb3VyY2UgPSBuZXcgSW5saW5lU3VnZ2VzdGlvbkxpc3QoXG5cdFx0XHR7IGl0ZW1zOiBbbW9ja0lubGluZUNvbXBsZXRpb25dIH0sXG5cdFx0XHRbXSxcblx0XHRcdG1vY2tQcm92aWRlclxuXHRcdCk7XG5cdFx0Y29uc3QgbW9ja0NvbnRleHQ6IElubGluZUNvbXBsZXRpb25Db250ZXh0ID0ge1xuXHRcdFx0dHJpZ2dlcktpbmQ6IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5FeHBsaWNpdCxcblx0XHRcdHNlbGVjdGVkU3VnZ2VzdGlvbkluZm86IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVlc3RVdWlkOiAndGVzdC0nICsgRGF0ZS5ub3coKSxcblx0XHRcdGVhcmxpZXN0U2hvd25EYXRlVGltZTogMCxcblx0XHRcdGluY2x1ZGVJbmxpbmVDb21wbGV0aW9uczogdHJ1ZSxcblx0XHRcdGluY2x1ZGVJbmxpbmVFZGl0czogZmFsc2UsXG5cdFx0XHRyZXF1ZXN0SXNzdWVkRGF0ZVRpbWU6IERhdGUubm93KCksXG5cdFx0fTtcblx0XHRjb25zdCBtb2NrUmVxdWVzdEluZm86IElubGluZVN1Z2dlc3RSZXF1ZXN0SW5mbyA9IHtcblx0XHRcdHN0YXJ0VGltZTogRGF0ZS5ub3coKSxcblx0XHRcdHNrdTogdW5kZWZpbmVkLFxuXHRcdFx0ZWRpdG9yVHlwZTogSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuVGV4dEVkaXRvcixcblx0XHRcdGxhbmd1YWdlSWQ6ICdwbGFpbnRleHQnLFxuXHRcdFx0YXZhaWxhYmxlUHJvdmlkZXJzOiBbXSxcblx0XHRcdHJlYXNvbjogJycsXG5cdFx0XHR0eXBpbmdJbnRlcnZhbDogMCxcblx0XHRcdHR5cGluZ0ludGVydmFsQ2hhcmFjdGVyQ291bnQ6IDAsXG5cdFx0fTtcblx0XHRjb25zdCBtb2NrUHJvdmlkZXJSZXF1ZXN0SW5mbzogSW5saW5lU3VnZ2VzdFByb3ZpZGVyUmVxdWVzdEluZm8gPSB7XG5cdFx0XHRzdGFydFRpbWU6IERhdGUubm93KCksXG5cdFx0XHRlbmRUaW1lOiBEYXRlLm5vdygpLFxuXHRcdH07XG5cblx0XHRyZXR1cm4gbmV3IElubGluZVN1Z2dlc3REYXRhKFxuXHRcdFx0YWN0aW9uLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0W10sXG5cdFx0XHRtb2NrSW5saW5lQ29tcGxldGlvbixcblx0XHRcdG1vY2tTb3VyY2UsXG5cdFx0XHRtb2NrQ29udGV4dCxcblx0XHRcdHRydWUsXG5cdFx0XHRmYWxzZSxcblx0XHRcdG1vY2tSZXF1ZXN0SW5mbyxcblx0XHRcdG1vY2tQcm92aWRlclJlcXVlc3RJbmZvLFxuXHRcdFx0dW5kZWZpbmVkXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2RpZFNob3cgPSBmYWxzZTtcblx0cHJpdmF0ZSBfdGltZVVudGlsU2hvd246IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGltZVVudGlsQWN0dWFsbHlTaG93bjogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaG93U3RhcnRUaW1lOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Nob3duRHVyYXRpb246IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX3Nob3dVbmNvbGxhcHNlZFN0YXJ0VGltZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaG93VW5jb2xsYXBzZWREdXJhdGlvbjogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfbm90U2hvd25SZWFzb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF92aWV3RGF0YTogSW5saW5lU3VnZ2VzdFZpZXdEYXRhO1xuXHRwcml2YXRlIF9kaWRSZXBvcnRFbmRPZkxpZmUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfbGFzdFNldEVuZE9mTGlmZVJlYXNvbjogSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNQcmVjZWVkZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcGFydGlhbGx5QWNjZXB0ZWRDb3VudCA9IDA7XG5cdHByaXZhdGUgX3BhcnRpYWxseUFjY2VwdGVkU2luY2VPcmlnaW5hbDogUGFydGlhbEFjY2VwdGFuY2UgPSB7IGNoYXJhY3RlcnM6IDAsIHJhdGlvOiAwLCBjb3VudDogMCB9O1xuXHRwcml2YXRlIF9yZW5hbWVJbmZvOiBSZW5hbWVJbmZvIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lZGl0S2luZDogSW5saW5lU3VnZ2VzdGlvbkVkaXRLaW5kIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBhY3Rpb24oKTogSUlubGluZVN1Z2dlc3REYXRhQWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfYWN0aW9uOiBJSW5saW5lU3VnZ2VzdERhdGFBY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGhpbnQ6IElJbmxpbmVDb21wbGV0aW9uSGludCB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYWRkaXRpb25hbFRleHRFZGl0czogcmVhZG9ubHkgSVNpbmdsZUVkaXRPcGVyYXRpb25bXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc291cmNlSW5saW5lQ29tcGxldGlvbjogSW5saW5lQ29tcGxldGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc291cmNlOiBJbmxpbmVTdWdnZXN0aW9uTGlzdCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29udGV4dDogSW5saW5lQ29tcGxldGlvbkNvbnRleHQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGlzSW5saW5lRWRpdDogYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3VwcG9ydHNSZW5hbWU6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdEluZm86IElubGluZVN1Z2dlc3RSZXF1ZXN0SW5mbyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlclJlcXVlc3RJbmZvOiBJbmxpbmVTdWdnZXN0UHJvdmlkZXJSZXF1ZXN0SW5mbyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb3JyZWxhdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHRoaXMuX3ZpZXdEYXRhID0geyBlZGl0b3JUeXBlOiBfcmVxdWVzdEluZm8uZWRpdG9yVHlwZSB9O1xuXHR9XG5cblx0cHVibGljIGdldCBzaG93SW5saW5lRWRpdE1lbnUoKSB7IHJldHVybiB0aGlzLnNvdXJjZUlubGluZUNvbXBsZXRpb24uc2hvd0lubGluZUVkaXRNZW51ID8/IGZhbHNlOyB9XG5cblx0cHVibGljIGdldCBwYXJ0aWFsQWNjZXB0cygpOiBQYXJ0aWFsQWNjZXB0YW5jZSB7IHJldHVybiB0aGlzLl9wYXJ0aWFsbHlBY2NlcHRlZFNpbmNlT3JpZ2luYWw7IH1cblxuXG5cdHB1YmxpYyBhc3luYyByZXBvcnRJbmxpbmVFZGl0U2hvd24oY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSwgdXBkYXRlZEluc2VydFRleHQ6IHN0cmluZywgdmlld0tpbmQ6IElubGluZUNvbXBsZXRpb25WaWV3S2luZCwgdmlld0RhdGE6IElubGluZUNvbXBsZXRpb25WaWV3RGF0YSwgZWRpdEtpbmQ6IElubGluZVN1Z2dlc3Rpb25FZGl0S2luZCB8IHVuZGVmaW5lZCwgdGltZVdoZW5TaG93bjogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy51cGRhdGVTaG93bkR1cmF0aW9uKHZpZXdLaW5kKTtcblxuXHRcdGlmICh0aGlzLl9kaWRTaG93IHx8IHRoaXMuX2RpZFJlcG9ydEVuZE9mTGlmZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmFkZFBlcmZvcm1hbmNlTWFya2VyKCdzaG93bicpO1xuXHRcdHRoaXMuX2RpZFNob3cgPSB0cnVlO1xuXHRcdHRoaXMuX2VkaXRLaW5kID0gZWRpdEtpbmQ7XG5cdFx0dGhpcy5fdmlld0RhdGEudmlld0tpbmQgPSB2aWV3S2luZDtcblx0XHR0aGlzLl92aWV3RGF0YS5yZW5kZXJEYXRhID0gdmlld0RhdGE7XG5cdFx0dGhpcy5fdGltZVVudGlsU2hvd24gPSB0aW1lV2hlblNob3duIC0gdGhpcy5fcmVxdWVzdEluZm8uc3RhcnRUaW1lO1xuXHRcdHRoaXMuX3RpbWVVbnRpbEFjdHVhbGx5U2hvd24gPSBEYXRlLm5vdygpIC0gdGhpcy5fcmVxdWVzdEluZm8uc3RhcnRUaW1lO1xuXG5cdFx0Y29uc3QgZWRpdERlbHRhSW5mbyA9IG5ldyBFZGl0RGVsdGFJbmZvKHZpZXdEYXRhLmxpbmVDb3VudE1vZGlmaWVkLCB2aWV3RGF0YS5saW5lQ291bnRPcmlnaW5hbCwgdmlld0RhdGEuY2hhcmFjdGVyQ291bnRNb2RpZmllZCwgdmlld0RhdGEuY2hhcmFjdGVyQ291bnRPcmlnaW5hbCk7XG5cdFx0dGhpcy5zb3VyY2UucHJvdmlkZXIuaGFuZGxlSXRlbURpZFNob3c/Lih0aGlzLnNvdXJjZS5pbmxpbmVTdWdnZXN0aW9ucywgdGhpcy5zb3VyY2VJbmxpbmVDb21wbGV0aW9uLCB1cGRhdGVkSW5zZXJ0VGV4dCwgZWRpdERlbHRhSW5mbyk7XG5cblx0XHRpZiAodGhpcy5zb3VyY2VJbmxpbmVDb21wbGV0aW9uLnNob3duQ29tbWFuZCkge1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQodGhpcy5zb3VyY2VJbmxpbmVDb21wbGV0aW9uLnNob3duQ29tbWFuZC5pZCwgLi4uKHRoaXMuc291cmNlSW5saW5lQ29tcGxldGlvbi5zaG93bkNvbW1hbmQuYXJndW1lbnRzIHx8IFtdKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlcG9ydFBhcnRpYWxBY2NlcHQoYWNjZXB0ZWRDaGFyYWN0ZXJzOiBudW1iZXIsIGluZm86IFBhcnRpYWxBY2NlcHRJbmZvLCBwYXJ0aWFsQWNjZXB0YW5jZTogUGFydGlhbEFjY2VwdGFuY2UpIHtcblx0XHR0aGlzLl9wYXJ0aWFsbHlBY2NlcHRlZENvdW50Kys7XG5cdFx0dGhpcy5fcGFydGlhbGx5QWNjZXB0ZWRTaW5jZU9yaWdpbmFsLmNoYXJhY3RlcnMgKz0gcGFydGlhbEFjY2VwdGFuY2UuY2hhcmFjdGVycztcblx0XHR0aGlzLl9wYXJ0aWFsbHlBY2NlcHRlZFNpbmNlT3JpZ2luYWwucmF0aW8gPSBNYXRoLm1pbih0aGlzLl9wYXJ0aWFsbHlBY2NlcHRlZFNpbmNlT3JpZ2luYWwucmF0aW8gKyAoMSAtIHRoaXMuX3BhcnRpYWxseUFjY2VwdGVkU2luY2VPcmlnaW5hbC5yYXRpbykgKiBwYXJ0aWFsQWNjZXB0YW5jZS5yYXRpbywgMSk7XG5cdFx0dGhpcy5fcGFydGlhbGx5QWNjZXB0ZWRTaW5jZU9yaWdpbmFsLmNvdW50ICs9IHBhcnRpYWxBY2NlcHRhbmNlLmNvdW50O1xuXG5cdFx0dGhpcy5zb3VyY2UucHJvdmlkZXIuaGFuZGxlUGFydGlhbEFjY2VwdD8uKFxuXHRcdFx0dGhpcy5zb3VyY2UuaW5saW5lU3VnZ2VzdGlvbnMsXG5cdFx0XHR0aGlzLnNvdXJjZUlubGluZUNvbXBsZXRpb24sXG5cdFx0XHRhY2NlcHRlZENoYXJhY3RlcnMsXG5cdFx0XHRpbmZvXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kcyB0aGUgZW5kIG9mIGxpZmUgZXZlbnQgdG8gdGhlIHByb3ZpZGVyLlxuXHQgKiBJZiBubyByZWFzb24gaXMgcHJvdmlkZWQsIHRoZSBsYXN0IHNldCByZWFzb24gaXMgdXNlZC5cblx0ICogSWYgbm8gcmVhc29uIHdhcyBzZXQsIHRoZSBkZWZhdWx0IHJlYXNvbiBpcyB1c2VkLlxuXHQqL1xuXHRwdWJsaWMgcmVwb3J0RW5kT2ZMaWZlKHJlYXNvbj86IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlkUmVwb3J0RW5kT2ZMaWZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2RpZFJlcG9ydEVuZE9mTGlmZSA9IHRydWU7XG5cdFx0dGhpcy5yZXBvcnRJbmxpbmVFZGl0SGlkZGVuKCk7XG5cblx0XHRpZiAoIXJlYXNvbikge1xuXHRcdFx0cmVhc29uID0gdGhpcy5fbGFzdFNldEVuZE9mTGlmZVJlYXNvbiA/PyB7IGtpbmQ6IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb25LaW5kLklnbm9yZWQsIHVzZXJUeXBpbmdEaXNhZ3JlZWQ6IGZhbHNlLCBzdXBlcnNlZGVkQnk6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdC8vIEEgc3VnZ2VzdGlvbiBjYW4gb25seSBiZSBcInJlamVjdGVkXCIgaWYgaXQgd2FzIGFjdHVhbGx5IHNob3duIHRvIHRoZSB1c2VyLlxuXHRcdC8vIElmIHRoZSBzdWdnZXN0aW9uIHdhcyBuZXZlciBzaG93biwgZG93bmdyYWRlIHRvIFwiaWdub3JlZFwiLlxuXHRcdGlmIChyZWFzb24ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuUmVqZWN0ZWQgJiYgIXRoaXMuX2RpZFNob3cpIHtcblx0XHRcdHJlYXNvbiA9IHsga2luZDogSW5saW5lQ29tcGxldGlvbkVuZE9mTGlmZVJlYXNvbktpbmQuSWdub3JlZCwgdXNlclR5cGluZ0Rpc2FncmVlZDogZmFsc2UsIHN1cGVyc2VkZWRCeTogdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0aWYgKHJlYXNvbi5raW5kID09PSBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uS2luZC5SZWplY3RlZCAmJiB0aGlzLnNvdXJjZS5wcm92aWRlci5oYW5kbGVSZWplY3Rpb24pIHtcblx0XHRcdHRoaXMuc291cmNlLnByb3ZpZGVyLmhhbmRsZVJlamVjdGlvbih0aGlzLnNvdXJjZS5pbmxpbmVTdWdnZXN0aW9ucywgdGhpcy5zb3VyY2VJbmxpbmVDb21wbGV0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zb3VyY2UucHJvdmlkZXIuaGFuZGxlRW5kT2ZMaWZldGltZSkge1xuXHRcdFx0Y29uc3Qgc3VtbWFyeTogTGlmZXRpbWVTdW1tYXJ5ID0ge1xuXHRcdFx0XHRyZXF1ZXN0VXVpZDogdGhpcy5jb250ZXh0LnJlcXVlc3RVdWlkLFxuXHRcdFx0XHRjb3JyZWxhdGlvbklkOiB0aGlzLl9jb3JyZWxhdGlvbklkLFxuXHRcdFx0XHRzZWxlY3RlZFN1Z2dlc3Rpb25JbmZvOiAhIXRoaXMuY29udGV4dC5zZWxlY3RlZFN1Z2dlc3Rpb25JbmZvLFxuXHRcdFx0XHRwYXJ0aWFsbHlBY2NlcHRlZDogdGhpcy5fcGFydGlhbGx5QWNjZXB0ZWRDb3VudCxcblx0XHRcdFx0cGFydGlhbGx5QWNjZXB0ZWRDb3VudFNpbmNlT3JpZ2luYWw6IHRoaXMuX3BhcnRpYWxseUFjY2VwdGVkU2luY2VPcmlnaW5hbC5jb3VudCxcblx0XHRcdFx0cGFydGlhbGx5QWNjZXB0ZWRSYXRpb1NpbmNlT3JpZ2luYWw6IHRoaXMuX3BhcnRpYWxseUFjY2VwdGVkU2luY2VPcmlnaW5hbC5yYXRpbyxcblx0XHRcdFx0cGFydGlhbGx5QWNjZXB0ZWRDaGFyYWN0ZXJzU2luY2VPcmlnaW5hbDogdGhpcy5fcGFydGlhbGx5QWNjZXB0ZWRTaW5jZU9yaWdpbmFsLmNoYXJhY3RlcnMsXG5cdFx0XHRcdHNob3duOiB0aGlzLl9kaWRTaG93LFxuXHRcdFx0XHRzaG93bkR1cmF0aW9uOiB0aGlzLl9zaG93bkR1cmF0aW9uLFxuXHRcdFx0XHRzaG93bkR1cmF0aW9uVW5jb2xsYXBzZWQ6IHRoaXMuX3Nob3dVbmNvbGxhcHNlZER1cmF0aW9uLFxuXHRcdFx0XHRlZGl0S2luZDogdGhpcy5fZWRpdEtpbmQ/LnRvU3RyaW5nKCksXG5cdFx0XHRcdHByZWNlZWRlZDogdGhpcy5faXNQcmVjZWVkZWQsXG5cdFx0XHRcdHRpbWVVbnRpbFNob3duOiB0aGlzLl90aW1lVW50aWxTaG93bixcblx0XHRcdFx0dGltZVVudGlsQWN0dWFsbHlTaG93bjogdGhpcy5fdGltZVVudGlsQWN0dWFsbHlTaG93bixcblx0XHRcdFx0dGltZVVudGlsUHJvdmlkZXJSZXF1ZXN0OiB0aGlzLl9wcm92aWRlclJlcXVlc3RJbmZvLnN0YXJ0VGltZSAtIHRoaXMuX3JlcXVlc3RJbmZvLnN0YXJ0VGltZSxcblx0XHRcdFx0dGltZVVudGlsUHJvdmlkZXJSZXNwb25zZTogdGhpcy5fcHJvdmlkZXJSZXF1ZXN0SW5mby5lbmRUaW1lIC0gdGhpcy5fcmVxdWVzdEluZm8uc3RhcnRUaW1lLFxuXHRcdFx0XHRlZGl0b3JUeXBlOiB0aGlzLl92aWV3RGF0YS5lZGl0b3JUeXBlLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiB0aGlzLl9yZXF1ZXN0SW5mby5sYW5ndWFnZUlkLFxuXHRcdFx0XHRyZXF1ZXN0UmVhc29uOiB0aGlzLl9yZXF1ZXN0SW5mby5yZWFzb24sXG5cdFx0XHRcdHZpZXdLaW5kOiB0aGlzLl92aWV3RGF0YS52aWV3S2luZCxcblx0XHRcdFx0bm90U2hvd25SZWFzb246IHRoaXMuX25vdFNob3duUmVhc29uLFxuXHRcdFx0XHRwZXJmb3JtYW5jZU1hcmtlcnM6IHRoaXMucGVyZm9ybWFuY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0cmVuYW1lQ3JlYXRlZDogdGhpcy5fcmVuYW1lSW5mbz8uY3JlYXRlZFJlbmFtZSxcblx0XHRcdFx0cmVuYW1lRHVyYXRpb246IHRoaXMuX3JlbmFtZUluZm8/LmR1cmF0aW9uLFxuXHRcdFx0XHRyZW5hbWVUaW1lZE91dDogdGhpcy5fcmVuYW1lSW5mbz8udGltZWRPdXQsXG5cdFx0XHRcdHJlbmFtZURyb3BwZWRPdGhlckVkaXRzOiB0aGlzLl9yZW5hbWVJbmZvPy5kcm9wcGVkT3RoZXJFZGl0cyxcblx0XHRcdFx0cmVuYW1lRHJvcHBlZFJlbmFtZUVkaXRzOiB0aGlzLl9yZW5hbWVJbmZvPy5kcm9wcGVkUmVuYW1lRWRpdHMsXG5cdFx0XHRcdHR5cGluZ0ludGVydmFsOiB0aGlzLl9yZXF1ZXN0SW5mby50eXBpbmdJbnRlcnZhbCxcblx0XHRcdFx0dHlwaW5nSW50ZXJ2YWxDaGFyYWN0ZXJDb3VudDogdGhpcy5fcmVxdWVzdEluZm8udHlwaW5nSW50ZXJ2YWxDaGFyYWN0ZXJDb3VudCxcblx0XHRcdFx0c2t1UGxhbjogdGhpcy5fcmVxdWVzdEluZm8uc2t1Py5wbGFuLFxuXHRcdFx0XHRza3VUeXBlOiB0aGlzLl9yZXF1ZXN0SW5mby5za3U/LnR5cGUsXG5cdFx0XHRcdGF2YWlsYWJsZVByb3ZpZGVyczogdGhpcy5fcmVxdWVzdEluZm8uYXZhaWxhYmxlUHJvdmlkZXJzLm1hcChwID0+IHAudG9TdHJpbmcoKSkuam9pbignLCcpLFxuXHRcdFx0XHQuLi50aGlzLl92aWV3RGF0YS5yZW5kZXJEYXRhPy5nZXREYXRhKCksXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5zb3VyY2UucHJvdmlkZXIuaGFuZGxlRW5kT2ZMaWZldGltZSh0aGlzLnNvdXJjZS5pbmxpbmVTdWdnZXN0aW9ucywgdGhpcy5zb3VyY2VJbmxpbmVDb21wbGV0aW9uLCByZWFzb24sIHN1bW1hcnkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRJc1ByZWNlZWRlZChwYXJ0aWFsQWNjZXB0czogUGFydGlhbEFjY2VwdGFuY2UpOiB2b2lkIHtcblx0XHR0aGlzLl9pc1ByZWNlZWRlZCA9IHRydWU7XG5cblx0XHRpZiAodGhpcy5fcGFydGlhbGx5QWNjZXB0ZWRTaW5jZU9yaWdpbmFsLmNoYXJhY3RlcnMgIT09IDAgfHwgdGhpcy5fcGFydGlhbGx5QWNjZXB0ZWRTaW5jZU9yaWdpbmFsLnJhdGlvICE9PSAwIHx8IHRoaXMuX3BhcnRpYWxseUFjY2VwdGVkU2luY2VPcmlnaW5hbC5jb3VudCAhPT0gMCkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdFeHBlY3RlZCBwYXJ0aWFsbHlBY2NlcHRlZENvdW50U2luY2VPcmlnaW5hbCB0byBiZSB7IGNoYXJhY3RlcnM6IDAsIHJhdGU6IDAsIHBhcnRpYWxBY2NlcHRhbmNlczogMCB9IGJlZm9yZSBzZXRJc1ByZWNlZWRlZC4nKTtcblx0XHR9XG5cdFx0dGhpcy5fcGFydGlhbGx5QWNjZXB0ZWRTaW5jZU9yaWdpbmFsID0gcGFydGlhbEFjY2VwdHM7XG5cdH1cblxuXHRwdWJsaWMgc2V0Tm90U2hvd25SZWFzb24ocmVhc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9ub3RTaG93blJlYXNvbiA/Pz0gcmVhc29uO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGVuZCBvZiBsaWZlIHJlYXNvbiwgYnV0IGRvZXMgbm90IHNlbmQgdGhlIGV2ZW50IHRvIHRoZSBwcm92aWRlciB5ZXQuXG5cdCovXG5cdHB1YmxpYyBzZXRFbmRPZkxpZmVSZWFzb24ocmVhc29uOiBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBvcnRJbmxpbmVFZGl0SGlkZGVuKCk7XG5cdFx0dGhpcy5fbGFzdFNldEVuZE9mTGlmZVJlYXNvbiA9IHJlYXNvbjtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2hvd25EdXJhdGlvbih2aWV3S2luZDogSW5saW5lQ29tcGxldGlvblZpZXdLaW5kKSB7XG5cdFx0Y29uc3QgdGltZU5vdyA9IERhdGUubm93KCk7XG5cdFx0aWYgKCF0aGlzLl9zaG93U3RhcnRUaW1lKSB7XG5cdFx0XHR0aGlzLl9zaG93U3RhcnRUaW1lID0gdGltZU5vdztcblx0XHR9XG5cblx0XHRjb25zdCBpc0NvbGxhcHNlZCA9IHZpZXdLaW5kID09PSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuQ29sbGFwc2VkO1xuXHRcdGlmICghaXNDb2xsYXBzZWQgJiYgdGhpcy5fc2hvd1VuY29sbGFwc2VkU3RhcnRUaW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3Nob3dVbmNvbGxhcHNlZFN0YXJ0VGltZSA9IHRpbWVOb3c7XG5cdFx0fVxuXG5cdFx0aWYgKGlzQ29sbGFwc2VkICYmIHRoaXMuX3Nob3dVbmNvbGxhcHNlZFN0YXJ0VGltZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9zaG93VW5jb2xsYXBzZWREdXJhdGlvbiArPSB0aW1lTm93IC0gdGhpcy5fc2hvd1VuY29sbGFwc2VkU3RhcnRUaW1lO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0SW5saW5lRWRpdEhpZGRlbigpIHtcblx0XHRpZiAodGhpcy5fc2hvd1N0YXJ0VGltZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRpbWVOb3cgPSBEYXRlLm5vdygpO1xuXHRcdHRoaXMuX3Nob3duRHVyYXRpb24gKz0gdGltZU5vdyAtIHRoaXMuX3Nob3dTdGFydFRpbWU7XG5cdFx0dGhpcy5fc2hvd1N0YXJ0VGltZSA9IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLl9zaG93VW5jb2xsYXBzZWRTdGFydFRpbWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zaG93VW5jb2xsYXBzZWREdXJhdGlvbiArPSB0aW1lTm93IC0gdGhpcy5fc2hvd1VuY29sbGFwc2VkU3RhcnRUaW1lO1xuXHRcdHRoaXMuX3Nob3dVbmNvbGxhcHNlZFN0YXJ0VGltZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBzZXRSZW5hbWVQcm9jZXNzaW5nSW5mbyhpbmZvOiBSZW5hbWVJbmZvKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlbmFtZUluZm8pIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1JlbmFtZSBpbmZvIGhhcyBhbHJlYWR5IGJlZW4gc2V0LicpO1xuXHRcdH1cblx0XHR0aGlzLl9yZW5hbWVJbmZvID0gaW5mbztcblx0fVxuXG5cdHB1YmxpYyB3aXRoQWN0aW9uKGFjdGlvbjogSUlubGluZVN1Z2dlc3REYXRhQWN0aW9uKTogSW5saW5lU3VnZ2VzdERhdGEge1xuXHRcdHRoaXMuX2FjdGlvbiA9IGFjdGlvbjtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHByaXZhdGUgcGVyZm9ybWFuY2UgPSBuZXcgSW5saW5lU3VnZ2VzdGlvbnNQZXJmb3JtYW5jZSgpO1xuXHRwdWJsaWMgYWRkUGVyZm9ybWFuY2VNYXJrZXIobWFya2VyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnBlcmZvcm1hbmNlLm1hcmsobWFya2VyKTtcblx0fVxufVxuXG5jbGFzcyBJbmxpbmVTdWdnZXN0aW9uc1BlcmZvcm1hbmNlIHtcblx0cHJpdmF0ZSBtYXJrZXJzOiB7IG5hbWU6IHN0cmluZzsgdGltZVN0YW1wOiBudW1iZXIgfVtdID0gW107XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMubWFya2Vycy5wdXNoKHsgbmFtZTogJ3N0YXJ0JywgdGltZVN0YW1wOiBEYXRlLm5vdygpIH0pO1xuXHR9XG5cblx0bWFyayhtYXJrZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubWFya2Vycy5wdXNoKHsgbmFtZTogbWFya2VyLCB0aW1lU3RhbXA6IERhdGUubm93KCkgfSk7XG5cdH1cblxuXHR0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGRlbHRhcyA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgdGhpcy5tYXJrZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBkZWx0YSA9IHRoaXMubWFya2Vyc1tpXS50aW1lU3RhbXAgLSB0aGlzLm1hcmtlcnNbaSAtIDFdLnRpbWVTdGFtcDtcblx0XHRcdGRlbHRhcy5wdXNoKHsgW3RoaXMubWFya2Vyc1tpXS5uYW1lXTogZGVsdGEgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShkZWx0YXMpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU25pcHBldEluZm8ge1xuXHRzbmlwcGV0OiBzdHJpbmc7XG5cdC8qIENvdWxkIGJlIGRpZmZlcmVudCB0aGFuIHRoZSBtYWluIHJhbmdlICovXG5cdHJhbmdlOiBSYW5nZTtcbn1cblxuZXhwb3J0IGVudW0gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUge1xuXHRUZXh0RWRpdG9yID0gJ3RleHRFZGl0b3InLFxuXHREaWZmRWRpdG9yID0gJ2RpZmZFZGl0b3InLFxuXHROb3RlYm9vayA9ICdub3RlYm9vaycsXG59XG5cbi8qKlxuICogQSByZWYgY291bnRlZCBwb2ludGVyIHRvIHRoZSBjb21wdXRlZCBgSW5saW5lQ29tcGxldGlvbnNgIGFuZCB0aGUgYElubGluZUNvbXBsZXRpb25zUHJvdmlkZXJgIHRoYXRcbiAqIGNvbXB1dGVkIHRoZW0uXG4gKi9cbmV4cG9ydCBjbGFzcyBJbmxpbmVTdWdnZXN0aW9uTGlzdCB7XG5cdHByaXZhdGUgcmVmQ291bnQgPSAwO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5saW5lU3VnZ2VzdGlvbnM6IElubGluZUNvbXBsZXRpb25zLFxuXHRcdHB1YmxpYyByZWFkb25seSBpbmxpbmVTdWdnZXN0aW9uc0RhdGE6IHJlYWRvbmx5IElubGluZVN1Z2dlc3REYXRhW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVyOiBJbmxpbmVDb21wbGV0aW9uc1Byb3ZpZGVyLFxuXHQpIHsgfVxuXG5cdGFkZFJlZigpOiB2b2lkIHtcblx0XHR0aGlzLnJlZkNvdW50Kys7XG5cdH1cblxuXHRyZW1vdmVSZWYocmVhc29uOiBJbmxpbmVDb21wbGV0aW9uc0Rpc3Bvc2VSZWFzb24gPSB7IGtpbmQ6ICdvdGhlcicgfSk6IHZvaWQge1xuXHRcdHRoaXMucmVmQ291bnQtLTtcblx0XHRpZiAodGhpcy5yZWZDb3VudCA9PT0gMCkge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuaW5saW5lU3VnZ2VzdGlvbnNEYXRhKSB7XG5cdFx0XHRcdC8vIEZhbGxiYWNrIGlmIGl0IGhhcyBub3QgYmVlbiBjYWxsZWQgYmVmb3JlXG5cdFx0XHRcdGl0ZW0ucmVwb3J0RW5kT2ZMaWZlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnByb3ZpZGVyLmRpc3Bvc2VJbmxpbmVDb21wbGV0aW9ucyh0aGlzLmlubGluZVN1Z2dlc3Rpb25zLCByZWFzb24pO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5yZWZDb3VudCA8IDApIHtcblx0XHRcdC8vIEludmFyaWFudDogZXZlcnkgYWRkUmVmIG11c3QgYmUgcGFpcmVkIHdpdGggZXhhY3RseSBvbmUgcmVtb3ZlUmVmLlxuXHRcdFx0Ly8gR29pbmcgbmVnYXRpdmUgbWVhbnMgYSByZW1vdmVSZWYgd2l0aG91dCBhIG1hdGNoaW5nIGFkZFJlZiBzb21ld2hlcmUuXG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKFxuXHRcdFx0XHRgSW5saW5lU3VnZ2VzdGlvbkxpc3QgKHByb3ZpZGVyPSR7dGhpcy5wcm92aWRlci5wcm92aWRlcklkPy50b1N0cmluZygpfSkgcmVmQ291bnQgd2VudCBuZWdhdGl2ZSAoJHt0aGlzLnJlZkNvdW50fSkgXHUyMDE0IG1vcmUgcmVtb3ZlUmVmIHRoYW4gYWRkUmVmIGNhbGxzLmBcblx0XHRcdCkpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBnZXREZWZhdWx0UmFuZ2UocG9zaXRpb246IFBvc2l0aW9uLCBtb2RlbDogSVRleHRNb2RlbCk6IFJhbmdlIHtcblx0Y29uc3Qgd29yZCA9IG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0Y29uc3QgbWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0Ly8gQnkgZGVmYXVsdCwgYWx3YXlzIHJlcGxhY2UgdXAgdW50aWwgdGhlIGVuZCBvZiB0aGUgY3VycmVudCBsaW5lLlxuXHQvLyBUaGlzIGRlZmF1bHQgbWlnaHQgYmUgc3ViamVjdCB0byBjaGFuZ2UhXG5cdHJldHVybiB3b3JkXG5cdFx0PyBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgd29yZC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgbWF4Q29sdW1uKVxuXHRcdDogUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbiwgcG9zaXRpb24ud2l0aCh1bmRlZmluZWQsIG1heENvbHVtbikpO1xufVxuXG5mdW5jdGlvbiBjbG9zZUJyYWNrZXRzKHRleHQ6IHN0cmluZywgcG9zaXRpb246IFBvc2l0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpOiBzdHJpbmcge1xuXHRjb25zdCBjdXJyZW50TGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRjb25zdCBlZGl0ID0gU3RyaW5nUmVwbGFjZW1lbnQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UocG9zaXRpb24uY29sdW1uIC0gMSwgY3VycmVudExpbmUubGVuZ3RoKSwgdGV4dCk7XG5cblx0Y29uc3QgcHJvcG9zZWRMaW5lVG9rZW5zID0gbW9kZWwudG9rZW5pemF0aW9uLnRva2VuaXplTGluZXNBdChwb3NpdGlvbi5saW5lTnVtYmVyLCBbZWRpdC5yZXBsYWNlKGN1cnJlbnRMaW5lKV0pO1xuXHRjb25zdCB0ZXh0VG9rZW5zID0gcHJvcG9zZWRMaW5lVG9rZW5zPy5bMF0uc2xpY2VaZXJvQ29weShlZGl0LmdldFJhbmdlQWZ0ZXJSZXBsYWNlKCkpO1xuXHRpZiAoIXRleHRUb2tlbnMpIHtcblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXG5cdGNvbnN0IGZpeGVkVGV4dCA9IGZpeEJyYWNrZXRzSW5MaW5lKHRleHRUb2tlbnMsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRyZXR1cm4gZml4ZWRUZXh0O1xufVxuIl0s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LElBQUksTUFBTSxTQUFTLFlBQVksS0FBSyxhQUFhLFNBQVMsWUFBWSxTQUFTLElBQy9FLE1BQU0sY0FBYyxVQUFVLFNBQVMsS0FBSyxRQUFXLFNBQVMsQ0FBQztBQUNyRTtBQUVBLFNBQVMsY0FBYyxNQUFjLFVBQW9CLE9BQW1CLDhCQUFxRTtBQUNoSixRQUFNLGNBQWMsTUFBTSxlQUFlLFNBQVMsVUFBVTtBQUM1RCxRQUFNLE9BQU8sa0JBQWtCLFFBQVEsSUFBSSxZQUFZLFNBQVMsU0FBUyxHQUFHLFlBQVksTUFBTSxHQUFHLElBQUk7QUFFckcsUUFBTSxxQkFBcUIsTUFBTSxhQUFhLGdCQUFnQixTQUFTLFlBQVksQ0FBQyxLQUFLLFFBQVEsV0FBVyxDQUFDLENBQUM7QUFDOUcsUUFBTSxhQUFhLHFCQUFxQixDQUFDLEVBQUUsY0FBYyxLQUFLLHFCQUFxQixDQUFDO0FBQ3BGLE1BQUksQ0FBQyxZQUFZO0FBQ2hCLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxZQUFZLGtCQUFrQixZQUFZLDRCQUE0QjtBQUM1RSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbInJlc3VsdCIsICJJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZSJdCn0K
