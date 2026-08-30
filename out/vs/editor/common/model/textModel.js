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
import { pushMany } from "../../../base/common/arrays.js";
import { CharCode } from "../../../base/common/charCode.js";
import { SetWithKey } from "../../../base/common/collections.js";
import { Color } from "../../../base/common/color.js";
import { BugIndicatingError, illegalArgument, onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { listenStream } from "../../../base/common/stream.js";
import * as strings from "../../../base/common/strings.js";
import { Constants } from "../../../base/common/uint.js";
import { URI } from "../../../base/common/uri.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { isDark } from "../../../platform/theme/common/theme.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { countEOL } from "../core/misc/eolCounter.js";
import { normalizeIndentation } from "../core/misc/indentation.js";
import { EDITOR_MODEL_DEFAULTS } from "../core/misc/textModelDefaults.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { Selection } from "../core/selection.js";
import { ILanguageService } from "../languages/language.js";
import { ILanguageConfigurationService } from "../languages/languageConfigurationRegistry.js";
import * as model from "../model.js";
import { EditSources } from "../textModelEditSource.js";
import { InternalModelContentChangeEvent, LineInjectedText, ModelFontChanged, ModelFontChangedEvent, ModelInjectedTextChangedEvent, ModelLineHeightChanged, ModelLineHeightChangedEvent, ModelRawContentChangedEvent, ModelRawEOLChanged, ModelRawFlush, ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted } from "../textModelEvents.js";
import { LineTokens } from "../tokens/lineTokens.js";
import { BracketPairsTextModelPart } from "./bracketPairsTextModelPart/bracketPairsImpl.js";
import { ColorizedBracketPairsDecorationProvider } from "./bracketPairsTextModelPart/colorizedBracketPairsDecorationProvider.js";
import { EditStack } from "./editStack.js";
import { GuidesTextModelPart } from "./guidesTextModelPart.js";
import { guessIndentation } from "./indentationGuesser.js";
import { IntervalNode, IntervalTree, recomputeMaxEnd } from "./intervalTree.js";
import { PieceTreeTextBuffer } from "./pieceTreeTextBuffer/pieceTreeTextBuffer.js";
import { PieceTreeTextBufferBuilder } from "./pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js";
import { SearchParams, TextModelSearch } from "./textModelSearch.js";
import { AttachedViews } from "./tokens/abstractSyntaxTokenBackend.js";
import { TokenizationFontDecorationProvider } from "./tokens/tokenizationFontDecorationsProvider.js";
import { LineFontChangingDecoration, LineHeightChangingDecoration } from "./decorationProvider.js";
import { TokenizationTextModelPart } from "./tokens/tokenizationTextModelPart.js";
function createTextBufferFactory(text) {
  const builder = new PieceTreeTextBufferBuilder();
  builder.acceptChunk(text);
  return builder.finish();
}
function createTextBufferFactoryFromStream(stream) {
  return new Promise((resolve, reject) => {
    const builder = new PieceTreeTextBufferBuilder();
    let done = false;
    listenStream(stream, {
      onData: (chunk) => {
        builder.acceptChunk(typeof chunk === "string" ? chunk : chunk.toString());
      },
      onError: (error) => {
        if (!done) {
          done = true;
          reject(error);
        }
      },
      onEnd: () => {
        if (!done) {
          done = true;
          resolve(builder.finish());
        }
      }
    });
  });
}
function createTextBufferFactoryFromSnapshot(snapshot) {
  const builder = new PieceTreeTextBufferBuilder();
  let chunk;
  while (typeof (chunk = snapshot.read()) === "string") {
    builder.acceptChunk(chunk);
  }
  return builder.finish();
}
function createTextBuffer(value, defaultEOL) {
  let factory;
  if (typeof value === "string") {
    factory = createTextBufferFactory(value);
  } else if (model.isITextSnapshot(value)) {
    factory = createTextBufferFactoryFromSnapshot(value);
  } else {
    factory = value;
  }
  return factory.create(defaultEOL);
}
let MODEL_ID = 0;
const LIMIT_FIND_COUNT = 999;
const LONG_LINE_BOUNDARY = 1e4;
const LINE_HEIGHT_CEILING = 300;
class TextModelSnapshot {
  constructor(source) {
    this._source = source;
    this._eos = false;
  }
  read() {
    if (this._eos) {
      return null;
    }
    const result = [];
    let resultCnt = 0;
    let resultLength = 0;
    do {
      const tmp = this._source.read();
      if (tmp === null) {
        this._eos = true;
        if (resultCnt === 0) {
          return null;
        } else {
          return result.join("");
        }
      }
      if (tmp.length > 0) {
        result[resultCnt++] = tmp;
        resultLength += tmp.length;
      }
      if (resultLength >= 64 * 1024) {
        return result.join("");
      }
    } while (true);
  }
}
const invalidFunc = () => {
  throw new Error(`Invalid change accessor`);
};
var StringOffsetValidationType = /* @__PURE__ */ ((StringOffsetValidationType2) => {
  StringOffsetValidationType2[StringOffsetValidationType2["Relaxed"] = 0] = "Relaxed";
  StringOffsetValidationType2[StringOffsetValidationType2["SurrogatePairs"] = 1] = "SurrogatePairs";
  return StringOffsetValidationType2;
})(StringOffsetValidationType || {});
let TextModel = class extends Disposable {
  constructor(source, languageIdOrSelection, creationOptions, associatedResource = null, _undoRedoService, _languageService, _languageConfigurationService, instantiationService) {
    super();
    this._undoRedoService = _undoRedoService;
    this._languageService = _languageService;
    this._languageConfigurationService = _languageConfigurationService;
    this.instantiationService = instantiationService;
    //#region Events
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDidChangeDecorations = this._register(new DidChangeDecorationsEmitter((affectedInjectedTextLines, affectedLineHeights, affectedFontLines) => this.handleBeforeFireDecorationsChangedEvent(affectedInjectedTextLines, affectedLineHeights, affectedFontLines)));
    this.onDidChangeDecorations = this._onDidChangeDecorations.event;
    this._onDidChangeOptions = this._register(new Emitter());
    this._onDidChangeAttached = this._register(new Emitter());
    this._onDidChangeLineHeight = this._register(new Emitter());
    this._onDidChangeFont = this._register(new Emitter());
    this._eventEmitter = this._register(new DidChangeContentEmitter());
    this._languageSelectionListener = this._register(new MutableDisposable());
    this._deltaDecorationCallCnt = 0;
    this._attachedViews = this._register(new AttachedViews());
    this._viewModels = /* @__PURE__ */ new Set();
    MODEL_ID++;
    this.id = "$model" + MODEL_ID;
    this.isForSimpleWidget = creationOptions.isForSimpleWidget;
    if (typeof associatedResource === "undefined" || associatedResource === null) {
      this._associatedResource = URI.parse("inmemory://model/" + MODEL_ID);
    } else {
      this._associatedResource = associatedResource;
    }
    this._attachedEditorCount = 0;
    const { textBuffer, disposable } = createTextBuffer(source, creationOptions.defaultEOL);
    this._buffer = textBuffer;
    this._bufferDisposable = disposable;
    const bufferLineCount = this._buffer.getLineCount();
    const bufferTextLength = this._buffer.getValueLengthInRange(new Range(1, 1, bufferLineCount, this._buffer.getLineLength(bufferLineCount) + 1), model.EndOfLinePreference.TextDefined);
    if (creationOptions.largeFileOptimizations) {
      this._isTooLargeForTokenization = bufferTextLength > TextModel.LARGE_FILE_SIZE_THRESHOLD || bufferLineCount > TextModel.LARGE_FILE_LINE_COUNT_THRESHOLD;
      this._isTooLargeForHeapOperation = bufferTextLength > TextModel.LARGE_FILE_HEAP_OPERATION_THRESHOLD;
    } else {
      this._isTooLargeForTokenization = false;
      this._isTooLargeForHeapOperation = false;
    }
    this._options = TextModel.resolveOptions(this._buffer, creationOptions);
    const languageId = typeof languageIdOrSelection === "string" ? languageIdOrSelection : languageIdOrSelection.languageId;
    if (typeof languageIdOrSelection !== "string") {
      this._languageSelectionListener.value = languageIdOrSelection.onDidChange(() => this._setLanguage(languageIdOrSelection.languageId));
    }
    this._bracketPairs = this._register(new BracketPairsTextModelPart(this, this._languageConfigurationService));
    this._guidesTextModelPart = this._register(new GuidesTextModelPart(this, this._languageConfigurationService));
    this._decorationProvider = this._register(new ColorizedBracketPairsDecorationProvider(this));
    this._tokenizationTextModelPart = this.instantiationService.createInstance(
      TokenizationTextModelPart,
      this,
      this._bracketPairs,
      languageId,
      this._attachedViews
    );
    this._fontTokenDecorationsProvider = this._register(new TokenizationFontDecorationProvider(this, this._tokenizationTextModelPart));
    this._isTooLargeForSyncing = bufferTextLength > TextModel._MODEL_SYNC_LIMIT;
    this._versionId = 1;
    this._alternativeVersionId = 1;
    this._initialUndoRedoSnapshot = null;
    this._isDisposed = false;
    this.__isDisposing = false;
    this._instanceId = strings.singleLetterHash(MODEL_ID);
    this._lastDecorationId = 0;
    this._decorations = /* @__PURE__ */ Object.create(null);
    this._decorationsTree = new DecorationsTrees();
    this._commandManager = new EditStack(this, this._undoRedoService);
    this._isUndoing = false;
    this._isRedoing = false;
    this._trimAutoWhitespaceLines = null;
    this._register(this._decorationProvider.onDidChange(() => {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._onDidChangeDecorations.fire();
      this._onDidChangeDecorations.endDeferredEmit();
    }));
    this._register(this._fontTokenDecorationsProvider.onDidChangeLineHeight((affectedLineHeights) => {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._onDidChangeDecorations.fire();
      this._fireOnDidChangeLineHeight(affectedLineHeights);
      this._onDidChangeDecorations.endDeferredEmit();
    }));
    this._register(this._fontTokenDecorationsProvider.onDidChangeFont((affectedFontLines) => {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._onDidChangeDecorations.fire();
      this._fireOnDidChangeFont(affectedFontLines);
      this._onDidChangeDecorations.endDeferredEmit();
    }));
    this._languageService.requestRichLanguageFeatures(languageId);
    this._register(this._languageConfigurationService.onDidChange((e) => {
      this._bracketPairs.handleLanguageConfigurationServiceChange(e);
      this._tokenizationTextModelPart.handleLanguageConfigurationServiceChange(e);
    }));
  }
  static resolveOptions(textBuffer, options) {
    if (options.detectIndentation) {
      const guessedIndentation = guessIndentation(textBuffer, options.tabSize, options.insertSpaces);
      return new model.TextModelResolvedOptions({
        tabSize: guessedIndentation.tabSize,
        indentSize: "tabSize",
        // TODO@Alex: guess indentSize independent of tabSize
        insertSpaces: guessedIndentation.insertSpaces,
        trimAutoWhitespace: options.trimAutoWhitespace,
        defaultEOL: options.defaultEOL,
        bracketPairColorizationOptions: options.bracketPairColorizationOptions
      });
    }
    return new model.TextModelResolvedOptions(options);
  }
  get onDidChangeLanguage() {
    return this._tokenizationTextModelPart.onDidChangeLanguage;
  }
  get onDidChangeLanguageConfiguration() {
    return this._tokenizationTextModelPart.onDidChangeLanguageConfiguration;
  }
  get onDidChangeTokens() {
    return this._tokenizationTextModelPart.onDidChangeTokens;
  }
  get onDidChangeOptions() {
    return this._onDidChangeOptions.event;
  }
  get onDidChangeAttached() {
    return this._onDidChangeAttached.event;
  }
  get onDidChangeLineHeight() {
    return this._onDidChangeLineHeight.event;
  }
  get onDidChangeFont() {
    return this._onDidChangeFont.event;
  }
  onDidChangeContent(listener) {
    return this._eventEmitter.event((e) => listener(e.contentChangedEvent));
  }
  _isDisposing() {
    return this.__isDisposing;
  }
  get tokenization() {
    return this._tokenizationTextModelPart;
  }
  get bracketPairs() {
    return this._bracketPairs;
  }
  get guides() {
    return this._guidesTextModelPart;
  }
  dispose() {
    this.__isDisposing = true;
    this._onWillDispose.fire();
    this._tokenizationTextModelPart.dispose();
    this._isDisposed = true;
    super.dispose();
    this._bufferDisposable.dispose();
    this.__isDisposing = false;
    const emptyDisposedTextBuffer = new PieceTreeTextBuffer([], "", "\n", false, false, true, true);
    emptyDisposedTextBuffer.dispose();
    this._buffer = emptyDisposedTextBuffer;
    this._bufferDisposable = Disposable.None;
  }
  _hasListeners() {
    return this._onWillDispose.hasListeners() || this._onDidChangeDecorations.hasListeners() || this._tokenizationTextModelPart._hasListeners() || this._onDidChangeOptions.hasListeners() || this._onDidChangeAttached.hasListeners() || this._onDidChangeLineHeight.hasListeners() || this._onDidChangeFont.hasListeners() || this._eventEmitter.hasListeners();
  }
  _assertNotDisposed() {
    if (this._isDisposed) {
      throw new BugIndicatingError("Model is disposed!");
    }
  }
  registerViewModel(viewModel) {
    this._viewModels.add(viewModel);
  }
  unregisterViewModel(viewModel) {
    this._viewModels.delete(viewModel);
  }
  equalsTextBuffer(other) {
    this._assertNotDisposed();
    return this._buffer.equals(other);
  }
  getTextBuffer() {
    this._assertNotDisposed();
    return this._buffer;
  }
  _emitContentChangedEvent(rawChange, change, resultingSelection = null) {
    if (this.__isDisposing) {
      return;
    }
    this._tokenizationTextModelPart.handleDidChangeContent(change);
    this._bracketPairs.handleDidChangeContent(change);
    this._fontTokenDecorationsProvider.handleDidChangeContent(change);
    const contentChangeEvent = new InternalModelContentChangeEvent(rawChange, change);
    if (resultingSelection) {
      contentChangeEvent.rawContentChangedEvent.resultingSelection = resultingSelection;
    }
    this._onDidChangeContentOrInjectedText(contentChangeEvent);
    this._eventEmitter.fire(contentChangeEvent);
  }
  setValue(value, reason = EditSources.setValue()) {
    this._assertNotDisposed();
    if (value === null || value === void 0) {
      throw illegalArgument();
    }
    const { textBuffer, disposable } = createTextBuffer(value, this._options.defaultEOL);
    this._setValueFromTextBuffer(textBuffer, disposable, reason);
  }
  _createContentChanged2(range, rangeOffset, rangeLength, rangeEndPosition, text, isUndoing, isRedoing, isFlush, isEolChange, reason) {
    return {
      changes: [{
        range,
        rangeOffset,
        rangeLength,
        text
      }],
      eol: this._buffer.getEOL(),
      isEolChange,
      versionId: this.getVersionId(),
      isUndoing,
      isRedoing,
      isFlush,
      detailedReasons: [reason],
      detailedReasonsChangeLengths: [1]
    };
  }
  _setValueFromTextBuffer(textBuffer, textBufferDisposable, reason) {
    this._assertNotDisposed();
    const oldFullModelRange = this.getFullModelRange();
    const oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
    const endLineNumber = this.getLineCount();
    const endColumn = this.getLineMaxColumn(endLineNumber);
    this._buffer = textBuffer;
    this._bufferDisposable.dispose();
    this._bufferDisposable = textBufferDisposable;
    this._increaseVersionId();
    this._decorations = /* @__PURE__ */ Object.create(null);
    this._decorationsTree = new DecorationsTrees();
    this._commandManager.clear();
    this._trimAutoWhitespaceLines = null;
    this._emitContentChangedEvent(
      new ModelRawContentChangedEvent(
        [
          new ModelRawFlush()
        ],
        this._versionId,
        false,
        false
      ),
      this._createContentChanged2(new Range(1, 1, endLineNumber, endColumn), 0, oldModelValueLength, new Position(endLineNumber, endColumn), this.getValue(), false, false, true, false, reason)
    );
  }
  setEOL(eol) {
    this._assertNotDisposed();
    const newEOL = eol === model.EndOfLineSequence.CRLF ? "\r\n" : "\n";
    if (this._buffer.getEOL() === newEOL) {
      return;
    }
    const oldFullModelRange = this.getFullModelRange();
    const oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
    const endLineNumber = this.getLineCount();
    const endColumn = this.getLineMaxColumn(endLineNumber);
    this._onBeforeEOLChange();
    this._buffer.setEOL(newEOL);
    this._increaseVersionId();
    this._onAfterEOLChange();
    this._emitContentChangedEvent(
      new ModelRawContentChangedEvent(
        [
          new ModelRawEOLChanged()
        ],
        this._versionId,
        false,
        false
      ),
      this._createContentChanged2(new Range(1, 1, endLineNumber, endColumn), 0, oldModelValueLength, new Position(endLineNumber, endColumn), this.getValue(), false, false, false, true, EditSources.eolChange())
    );
  }
  _onBeforeEOLChange() {
    this._decorationsTree.ensureAllNodesHaveRanges(this);
  }
  _onAfterEOLChange() {
    const versionId = this.getVersionId();
    const allDecorations = this._decorationsTree.collectNodesPostOrder();
    for (let i = 0, len = allDecorations.length; i < len; i++) {
      const node = allDecorations[i];
      const range = node.range;
      const delta = node.cachedAbsoluteStart - node.start;
      const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
      const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
      node.cachedAbsoluteStart = startOffset;
      node.cachedAbsoluteEnd = endOffset;
      node.cachedVersionId = versionId;
      node.start = startOffset - delta;
      node.end = endOffset - delta;
      recomputeMaxEnd(node);
    }
  }
  onBeforeAttached() {
    this._attachedEditorCount++;
    if (this._attachedEditorCount === 1) {
      this._tokenizationTextModelPart.handleDidChangeAttached();
      this._onDidChangeAttached.fire(void 0);
    }
    return this._attachedViews.attachView();
  }
  onBeforeDetached(view) {
    this._attachedEditorCount--;
    if (this._attachedEditorCount === 0) {
      this._tokenizationTextModelPart.handleDidChangeAttached();
      this._onDidChangeAttached.fire(void 0);
    }
    this._attachedViews.detachView(view);
  }
  isAttachedToEditor() {
    return this._attachedEditorCount > 0;
  }
  getAttachedEditorCount() {
    return this._attachedEditorCount;
  }
  isTooLargeForSyncing() {
    return this._isTooLargeForSyncing;
  }
  isTooLargeForTokenization() {
    return this._isTooLargeForTokenization;
  }
  isTooLargeForHeapOperation() {
    return this._isTooLargeForHeapOperation;
  }
  isDisposed() {
    return this._isDisposed;
  }
  isDominatedByLongLines() {
    this._assertNotDisposed();
    if (this.isTooLargeForTokenization()) {
      return false;
    }
    let smallLineCharCount = 0;
    let longLineCharCount = 0;
    const lineCount = this._buffer.getLineCount();
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      const lineLength = this._buffer.getLineLength(lineNumber);
      if (lineLength >= LONG_LINE_BOUNDARY) {
        longLineCharCount += lineLength;
      } else {
        smallLineCharCount += lineLength;
      }
    }
    return longLineCharCount > smallLineCharCount;
  }
  get uri() {
    return this._associatedResource;
  }
  //#region Options
  getOptions() {
    this._assertNotDisposed();
    return this._options;
  }
  getFormattingOptions() {
    return {
      tabSize: this._options.indentSize,
      insertSpaces: this._options.insertSpaces
    };
  }
  updateOptions(_newOpts) {
    this._assertNotDisposed();
    const tabSize = typeof _newOpts.tabSize !== "undefined" ? _newOpts.tabSize : this._options.tabSize;
    const indentSize = typeof _newOpts.indentSize !== "undefined" ? _newOpts.indentSize : this._options.originalIndentSize;
    const insertSpaces = typeof _newOpts.insertSpaces !== "undefined" ? _newOpts.insertSpaces : this._options.insertSpaces;
    const trimAutoWhitespace = typeof _newOpts.trimAutoWhitespace !== "undefined" ? _newOpts.trimAutoWhitespace : this._options.trimAutoWhitespace;
    const bracketPairColorizationOptions = typeof _newOpts.bracketColorizationOptions !== "undefined" ? _newOpts.bracketColorizationOptions : this._options.bracketPairColorizationOptions;
    const newOpts = new model.TextModelResolvedOptions({
      tabSize,
      indentSize,
      insertSpaces,
      defaultEOL: this._options.defaultEOL,
      trimAutoWhitespace,
      bracketPairColorizationOptions
    });
    if (this._options.equals(newOpts)) {
      return;
    }
    const e = this._options.createChangeEvent(newOpts);
    this._options = newOpts;
    this._bracketPairs.handleDidChangeOptions(e);
    this._decorationProvider.handleDidChangeOptions(e);
    this._onDidChangeOptions.fire(e);
  }
  detectIndentation(defaultInsertSpaces, defaultTabSize) {
    this._assertNotDisposed();
    const guessedIndentation = guessIndentation(this._buffer, defaultTabSize, defaultInsertSpaces);
    this.updateOptions({
      insertSpaces: guessedIndentation.insertSpaces,
      tabSize: guessedIndentation.tabSize,
      indentSize: guessedIndentation.tabSize
      // TODO@Alex: guess indentSize independent of tabSize
    });
  }
  normalizeIndentation(str) {
    this._assertNotDisposed();
    return normalizeIndentation(str, this._options.indentSize, this._options.insertSpaces);
  }
  //#endregion
  //#region Reading
  getVersionId() {
    this._assertNotDisposed();
    return this._versionId;
  }
  mightContainRTL() {
    return this._buffer.mightContainRTL();
  }
  mightContainUnusualLineTerminators() {
    return this._buffer.mightContainUnusualLineTerminators();
  }
  removeUnusualLineTerminators(selections = null) {
    const matches = this.findMatches(strings.UNUSUAL_LINE_TERMINATORS.source, false, true, false, null, false, Constants.MAX_SAFE_SMALL_INTEGER);
    this._buffer.resetMightContainUnusualLineTerminators();
    this.pushEditOperations(selections, matches.map((m) => ({ range: m.range, text: null })), () => null);
  }
  mightContainNonBasicASCII() {
    return this._buffer.mightContainNonBasicASCII();
  }
  getAlternativeVersionId() {
    this._assertNotDisposed();
    return this._alternativeVersionId;
  }
  getInitialUndoRedoSnapshot() {
    this._assertNotDisposed();
    return this._initialUndoRedoSnapshot;
  }
  getOffsetAt(rawPosition) {
    this._assertNotDisposed();
    const position = this._validatePosition(rawPosition.lineNumber, rawPosition.column, 0 /* Relaxed */);
    return this._buffer.getOffsetAt(position.lineNumber, position.column);
  }
  getPositionAt(rawOffset) {
    this._assertNotDisposed();
    const offset = Math.min(this._buffer.getLength(), Math.max(0, rawOffset));
    return this._buffer.getPositionAt(offset);
  }
  _increaseVersionId() {
    this._versionId = this._versionId + 1;
    this._alternativeVersionId = this._versionId;
  }
  _overwriteVersionId(versionId) {
    this._versionId = versionId;
  }
  _overwriteAlternativeVersionId(newAlternativeVersionId) {
    this._alternativeVersionId = newAlternativeVersionId;
  }
  _overwriteInitialUndoRedoSnapshot(newInitialUndoRedoSnapshot) {
    this._initialUndoRedoSnapshot = newInitialUndoRedoSnapshot;
  }
  getValue(eol, preserveBOM = false) {
    this._assertNotDisposed();
    if (this.isTooLargeForHeapOperation()) {
      throw new BugIndicatingError("Operation would exceed heap memory limits");
    }
    const fullModelRange = this.getFullModelRange();
    const fullModelValue = this.getValueInRange(fullModelRange, eol);
    if (preserveBOM) {
      return this._buffer.getBOM() + fullModelValue;
    }
    return fullModelValue;
  }
  createSnapshot(preserveBOM = false) {
    return new TextModelSnapshot(this._buffer.createSnapshot(preserveBOM));
  }
  getValueLength(eol, preserveBOM = false) {
    this._assertNotDisposed();
    const fullModelRange = this.getFullModelRange();
    const fullModelValue = this.getValueLengthInRange(fullModelRange, eol);
    if (preserveBOM) {
      return this._buffer.getBOM().length + fullModelValue;
    }
    return fullModelValue;
  }
  getValueInRange(rawRange, eol = model.EndOfLinePreference.TextDefined) {
    this._assertNotDisposed();
    return this._buffer.getValueInRange(this.validateRange(rawRange), eol);
  }
  getValueLengthInRange(rawRange, eol = model.EndOfLinePreference.TextDefined) {
    this._assertNotDisposed();
    return this._buffer.getValueLengthInRange(this.validateRange(rawRange), eol);
  }
  getCharacterCountInRange(rawRange, eol = model.EndOfLinePreference.TextDefined) {
    this._assertNotDisposed();
    return this._buffer.getCharacterCountInRange(this.validateRange(rawRange), eol);
  }
  getLineCount() {
    this._assertNotDisposed();
    return this._buffer.getLineCount();
  }
  getLineContent(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineContent(lineNumber);
  }
  getLineLength(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineLength(lineNumber);
  }
  getLinesContent() {
    this._assertNotDisposed();
    if (this.isTooLargeForHeapOperation()) {
      throw new BugIndicatingError("Operation would exceed heap memory limits");
    }
    return this._buffer.getLinesContent();
  }
  getEOL() {
    this._assertNotDisposed();
    return this._buffer.getEOL();
  }
  getEndOfLineSequence() {
    this._assertNotDisposed();
    return this._buffer.getEOL() === "\n" ? model.EndOfLineSequence.LF : model.EndOfLineSequence.CRLF;
  }
  getLineMinColumn(lineNumber) {
    this._assertNotDisposed();
    return 1;
  }
  getLineMaxColumn(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineLength(lineNumber) + 1;
  }
  getLineFirstNonWhitespaceColumn(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineFirstNonWhitespaceColumn(lineNumber);
  }
  getLineLastNonWhitespaceColumn(lineNumber) {
    this._assertNotDisposed();
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._buffer.getLineLastNonWhitespaceColumn(lineNumber);
  }
  /**
   * Validates `range` is within buffer bounds, but allows it to sit in between surrogate pairs, etc.
   * Will try to not allocate if possible.
   */
  _validateRangeRelaxedNoAllocations(range) {
    const linesCount = this._buffer.getLineCount();
    const initialStartLineNumber = range.startLineNumber;
    const initialStartColumn = range.startColumn;
    let startLineNumber = Math.floor(typeof initialStartLineNumber === "number" && !isNaN(initialStartLineNumber) ? initialStartLineNumber : 1);
    let startColumn = Math.floor(typeof initialStartColumn === "number" && !isNaN(initialStartColumn) ? initialStartColumn : 1);
    if (startLineNumber < 1) {
      startLineNumber = 1;
      startColumn = 1;
    } else if (startLineNumber > linesCount) {
      startLineNumber = linesCount;
      startColumn = this.getLineMaxColumn(startLineNumber);
    } else {
      if (startColumn <= 1) {
        startColumn = 1;
      } else {
        const maxColumn = this.getLineMaxColumn(startLineNumber);
        if (startColumn >= maxColumn) {
          startColumn = maxColumn;
        }
      }
    }
    const initialEndLineNumber = range.endLineNumber;
    const initialEndColumn = range.endColumn;
    let endLineNumber = Math.floor(typeof initialEndLineNumber === "number" && !isNaN(initialEndLineNumber) ? initialEndLineNumber : 1);
    let endColumn = Math.floor(typeof initialEndColumn === "number" && !isNaN(initialEndColumn) ? initialEndColumn : 1);
    if (endLineNumber < 1) {
      endLineNumber = 1;
      endColumn = 1;
    } else if (endLineNumber > linesCount) {
      endLineNumber = linesCount;
      endColumn = this.getLineMaxColumn(endLineNumber);
    } else {
      if (endColumn <= 1) {
        endColumn = 1;
      } else {
        const maxColumn = this.getLineMaxColumn(endLineNumber);
        if (endColumn >= maxColumn) {
          endColumn = maxColumn;
        }
      }
    }
    if (initialStartLineNumber === startLineNumber && initialStartColumn === startColumn && initialEndLineNumber === endLineNumber && initialEndColumn === endColumn && range instanceof Range && !(range instanceof Selection)) {
      return range;
    }
    return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
  }
  _isValidPosition(lineNumber, column, validationType) {
    if (typeof lineNumber !== "number" || typeof column !== "number") {
      return false;
    }
    if (isNaN(lineNumber) || isNaN(column)) {
      return false;
    }
    if (lineNumber < 1 || column < 1) {
      return false;
    }
    if ((lineNumber | 0) !== lineNumber || (column | 0) !== column) {
      return false;
    }
    const lineCount = this._buffer.getLineCount();
    if (lineNumber > lineCount) {
      return false;
    }
    if (column === 1) {
      return true;
    }
    const maxColumn = this.getLineMaxColumn(lineNumber);
    if (column > maxColumn) {
      return false;
    }
    if (validationType === 1 /* SurrogatePairs */) {
      const charCodeBefore = this._buffer.getLineCharCode(lineNumber, column - 2);
      if (strings.isHighSurrogate(charCodeBefore)) {
        return false;
      }
    }
    return true;
  }
  _validatePosition(_lineNumber, _column, validationType) {
    const lineNumber = Math.floor(typeof _lineNumber === "number" && !isNaN(_lineNumber) ? _lineNumber : 1);
    const column = Math.floor(typeof _column === "number" && !isNaN(_column) ? _column : 1);
    const lineCount = this._buffer.getLineCount();
    if (lineNumber < 1) {
      return new Position(1, 1);
    }
    if (lineNumber > lineCount) {
      return new Position(lineCount, this.getLineMaxColumn(lineCount));
    }
    if (column <= 1) {
      return new Position(lineNumber, 1);
    }
    const maxColumn = this.getLineMaxColumn(lineNumber);
    if (column >= maxColumn) {
      return new Position(lineNumber, maxColumn);
    }
    if (validationType === 1 /* SurrogatePairs */) {
      const charCodeBefore = this._buffer.getLineCharCode(lineNumber, column - 2);
      if (strings.isHighSurrogate(charCodeBefore)) {
        return new Position(lineNumber, column - 1);
      }
    }
    return new Position(lineNumber, column);
  }
  validatePosition(position) {
    const validationType = 1 /* SurrogatePairs */;
    this._assertNotDisposed();
    if (position instanceof Position) {
      if (this._isValidPosition(position.lineNumber, position.column, validationType)) {
        return position;
      }
    }
    return this._validatePosition(position.lineNumber, position.column, validationType);
  }
  isValidRange(range) {
    return this._isValidRange(range, 1 /* SurrogatePairs */);
  }
  _isValidRange(range, validationType) {
    const startLineNumber = range.startLineNumber;
    const startColumn = range.startColumn;
    const endLineNumber = range.endLineNumber;
    const endColumn = range.endColumn;
    if (!this._isValidPosition(startLineNumber, startColumn, 0 /* Relaxed */)) {
      return false;
    }
    if (!this._isValidPosition(endLineNumber, endColumn, 0 /* Relaxed */)) {
      return false;
    }
    if (validationType === 1 /* SurrogatePairs */) {
      const charCodeBeforeStart = startColumn > 1 ? this._buffer.getLineCharCode(startLineNumber, startColumn - 2) : 0;
      const charCodeBeforeEnd = endColumn > 1 && endColumn <= this._buffer.getLineLength(endLineNumber) ? this._buffer.getLineCharCode(endLineNumber, endColumn - 2) : 0;
      const startInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeStart);
      const endInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeEnd);
      if (!startInsideSurrogatePair && !endInsideSurrogatePair) {
        return true;
      }
      return false;
    }
    return true;
  }
  validateRange(_range) {
    const validationType = 1 /* SurrogatePairs */;
    this._assertNotDisposed();
    if (_range instanceof Range && !(_range instanceof Selection)) {
      if (this._isValidRange(_range, validationType)) {
        return _range;
      }
    }
    const start = this._validatePosition(_range.startLineNumber, _range.startColumn, 0 /* Relaxed */);
    const end = this._validatePosition(_range.endLineNumber, _range.endColumn, 0 /* Relaxed */);
    const startLineNumber = start.lineNumber;
    const startColumn = start.column;
    const endLineNumber = end.lineNumber;
    const endColumn = end.column;
    if (validationType === 1 /* SurrogatePairs */) {
      const charCodeBeforeStart = startColumn > 1 ? this._buffer.getLineCharCode(startLineNumber, startColumn - 2) : 0;
      const charCodeBeforeEnd = endColumn > 1 && endColumn <= this._buffer.getLineLength(endLineNumber) ? this._buffer.getLineCharCode(endLineNumber, endColumn - 2) : 0;
      const startInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeStart);
      const endInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeEnd);
      if (!startInsideSurrogatePair && !endInsideSurrogatePair) {
        return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
      }
      if (startLineNumber === endLineNumber && startColumn === endColumn) {
        return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn - 1);
      }
      if (startInsideSurrogatePair && endInsideSurrogatePair) {
        return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn + 1);
      }
      if (startInsideSurrogatePair) {
        return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn);
      }
      return new Range(startLineNumber, startColumn, endLineNumber, endColumn + 1);
    }
    return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
  }
  modifyPosition(rawPosition, offset) {
    this._assertNotDisposed();
    const candidate = this.getOffsetAt(rawPosition) + offset;
    return this.getPositionAt(Math.min(this._buffer.getLength(), Math.max(0, candidate)));
  }
  getFullModelRange() {
    this._assertNotDisposed();
    const lineCount = this.getLineCount();
    return new Range(1, 1, lineCount, this.getLineMaxColumn(lineCount));
  }
  findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount) {
    return this._buffer.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
  }
  findMatches(searchString, rawSearchScope, isRegex, matchCase, wordSeparators, captureMatches, limitResultCount = LIMIT_FIND_COUNT) {
    this._assertNotDisposed();
    let searchRanges = null;
    if (rawSearchScope !== null && typeof rawSearchScope !== "boolean") {
      if (!Array.isArray(rawSearchScope)) {
        rawSearchScope = [rawSearchScope];
      }
      if (rawSearchScope.every((searchScope) => Range.isIRange(searchScope))) {
        searchRanges = rawSearchScope.map((searchScope) => this.validateRange(searchScope));
      }
    }
    if (searchRanges === null) {
      searchRanges = [this.getFullModelRange()];
    }
    searchRanges = searchRanges.sort((d1, d2) => d1.startLineNumber - d2.startLineNumber || d1.startColumn - d2.startColumn);
    const uniqueSearchRanges = [];
    uniqueSearchRanges.push(searchRanges.reduce((prev, curr) => {
      if (Range.areIntersecting(prev, curr)) {
        return prev.plusRange(curr);
      }
      uniqueSearchRanges.push(prev);
      return curr;
    }));
    let matchMapper;
    if (!isRegex && searchString.indexOf("\n") < 0) {
      const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
      const searchData = searchParams.parseSearchRequest();
      if (!searchData) {
        return [];
      }
      matchMapper = (searchRange) => this.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
    } else {
      matchMapper = (searchRange) => TextModelSearch.findMatches(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchRange, captureMatches, limitResultCount);
    }
    return uniqueSearchRanges.map(matchMapper).reduce((arr, matches) => arr.concat(matches), []);
  }
  findNextMatch(searchString, rawSearchStart, isRegex, matchCase, wordSeparators, captureMatches) {
    this._assertNotDisposed();
    const searchStart = this.validatePosition(rawSearchStart);
    if (!isRegex && searchString.indexOf("\n") < 0) {
      const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
      const searchData = searchParams.parseSearchRequest();
      if (!searchData) {
        return null;
      }
      const lineCount = this.getLineCount();
      let searchRange = new Range(searchStart.lineNumber, searchStart.column, lineCount, this.getLineMaxColumn(lineCount));
      let ret = this.findMatchesLineByLine(searchRange, searchData, captureMatches, 1);
      TextModelSearch.findNextMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
      if (ret.length > 0) {
        return ret[0];
      }
      searchRange = new Range(1, 1, searchStart.lineNumber, this.getLineMaxColumn(searchStart.lineNumber));
      ret = this.findMatchesLineByLine(searchRange, searchData, captureMatches, 1);
      if (ret.length > 0) {
        return ret[0];
      }
      return null;
    }
    return TextModelSearch.findNextMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
  }
  findPreviousMatch(searchString, rawSearchStart, isRegex, matchCase, wordSeparators, captureMatches) {
    this._assertNotDisposed();
    const searchStart = this.validatePosition(rawSearchStart);
    return TextModelSearch.findPreviousMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
  }
  //#endregion
  //#region Editing
  pushStackElement() {
    this._commandManager.pushStackElement();
  }
  popStackElement() {
    this._commandManager.popStackElement();
  }
  pushEOL(eol) {
    const currentEOL = this.getEOL() === "\n" ? model.EndOfLineSequence.LF : model.EndOfLineSequence.CRLF;
    if (currentEOL === eol) {
      return;
    }
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._eventEmitter.beginDeferredEmit();
      if (this._initialUndoRedoSnapshot === null) {
        this._initialUndoRedoSnapshot = this._undoRedoService.createSnapshot(this.uri);
      }
      this._commandManager.pushEOL(eol);
    } finally {
      this._eventEmitter.endDeferredEmit();
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  _validateEditOperation(rawOperation) {
    if (rawOperation instanceof model.ValidAnnotatedEditOperation) {
      return rawOperation;
    }
    const validatedRange = this.validateRange(rawOperation.range);
    let opText = rawOperation.text;
    if (opText) {
      const endsWithLoneCR = opText.length > 0 && opText.charCodeAt(opText.length - 1) === CharCode.CarriageReturn;
      const removeTrailingCR = this.getEOL() === "\r\n" && endsWithLoneCR && validatedRange.endColumn === this.getLineMaxColumn(validatedRange.endLineNumber);
      if (removeTrailingCR) {
        opText = opText.substring(0, opText.length - 1);
      }
    }
    return new model.ValidAnnotatedEditOperation(
      rawOperation.identifier || null,
      validatedRange,
      opText,
      rawOperation.forceMoveMarkers || false,
      rawOperation.isAutoWhitespaceEdit || false,
      rawOperation._isTracked || false
    );
  }
  _validateEditOperations(rawOperations) {
    const result = [];
    for (let i = 0, len = rawOperations.length; i < len; i++) {
      result[i] = this._validateEditOperation(rawOperations[i]);
    }
    return result;
  }
  edit(edit, options) {
    this.pushEditOperations(null, edit.replacements.map((r) => ({ range: r.range, text: r.text })), null);
  }
  pushEditOperations(beforeCursorState, editOperations, cursorStateComputer, group, reason) {
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._eventEmitter.beginDeferredEmit();
      return this._pushEditOperations(beforeCursorState, this._validateEditOperations(editOperations), cursorStateComputer, group, reason);
    } finally {
      this._eventEmitter.endDeferredEmit();
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  _pushEditOperations(beforeCursorState, editOperations, cursorStateComputer, group, reason) {
    if (this._options.trimAutoWhitespace && this._trimAutoWhitespaceLines) {
      const incomingEdits = editOperations.map((op) => {
        return {
          range: this.validateRange(op.range),
          text: op.text
        };
      });
      let editsAreNearCursors = true;
      if (beforeCursorState) {
        for (let i = 0, len = beforeCursorState.length; i < len; i++) {
          const sel = beforeCursorState[i];
          let foundEditNearSel = false;
          for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
            const editRange = incomingEdits[j].range;
            const selIsAbove = editRange.startLineNumber > sel.endLineNumber;
            const selIsBelow = sel.startLineNumber > editRange.endLineNumber;
            if (!selIsAbove && !selIsBelow) {
              foundEditNearSel = true;
              break;
            }
          }
          if (!foundEditNearSel) {
            editsAreNearCursors = false;
            break;
          }
        }
      }
      if (editsAreNearCursors) {
        for (let i = 0, len = this._trimAutoWhitespaceLines.length; i < len; i++) {
          const trimLineNumber = this._trimAutoWhitespaceLines[i];
          const maxLineColumn = this.getLineMaxColumn(trimLineNumber);
          let allowTrimLine = true;
          for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
            const editRange = incomingEdits[j].range;
            const editText = incomingEdits[j].text;
            if (trimLineNumber < editRange.startLineNumber || trimLineNumber > editRange.endLineNumber) {
              continue;
            }
            if (trimLineNumber === editRange.startLineNumber && editRange.startColumn === maxLineColumn && editRange.isEmpty() && editText && editText.length > 0 && editText.charAt(0) === "\n") {
              continue;
            }
            if (trimLineNumber === editRange.startLineNumber && editRange.startColumn === 1 && editRange.isEmpty() && editText && editText.length > 0 && editText.charAt(editText.length - 1) === "\n") {
              continue;
            }
            allowTrimLine = false;
            break;
          }
          if (allowTrimLine) {
            const trimRange = new Range(trimLineNumber, 1, trimLineNumber, maxLineColumn);
            editOperations.push(new model.ValidAnnotatedEditOperation(null, trimRange, null, false, false, false));
          }
        }
      }
      this._trimAutoWhitespaceLines = null;
    }
    if (this._initialUndoRedoSnapshot === null) {
      this._initialUndoRedoSnapshot = this._undoRedoService.createSnapshot(this.uri);
    }
    return this._commandManager.pushEditOperation(beforeCursorState, editOperations, cursorStateComputer, group, reason);
  }
  _applyUndo(changes, eol, resultingAlternativeVersionId, resultingSelection) {
    const edits = changes.map((change) => {
      const rangeStart = this.getPositionAt(change.newPosition);
      const rangeEnd = this.getPositionAt(change.newEnd);
      return {
        range: new Range(rangeStart.lineNumber, rangeStart.column, rangeEnd.lineNumber, rangeEnd.column),
        text: change.oldText
      };
    });
    this._applyUndoRedoEdits(edits, eol, true, false, resultingAlternativeVersionId, resultingSelection);
  }
  _applyRedo(changes, eol, resultingAlternativeVersionId, resultingSelection) {
    const edits = changes.map((change) => {
      const rangeStart = this.getPositionAt(change.oldPosition);
      const rangeEnd = this.getPositionAt(change.oldEnd);
      return {
        range: new Range(rangeStart.lineNumber, rangeStart.column, rangeEnd.lineNumber, rangeEnd.column),
        text: change.newText
      };
    });
    this._applyUndoRedoEdits(edits, eol, false, true, resultingAlternativeVersionId, resultingSelection);
  }
  _applyUndoRedoEdits(edits, eol, isUndoing, isRedoing, resultingAlternativeVersionId, resultingSelection) {
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._eventEmitter.beginDeferredEmit();
      this._isUndoing = isUndoing;
      this._isRedoing = isRedoing;
      const operations = this._validateEditOperations(edits);
      this._doApplyEdits(operations, false, EditSources.applyEdits(), resultingSelection);
      this.setEOL(eol);
      this._overwriteAlternativeVersionId(resultingAlternativeVersionId);
    } finally {
      this._isUndoing = false;
      this._isRedoing = false;
      this._eventEmitter.endDeferredEmit(resultingSelection);
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  applyEdits(rawOperations, computeUndoEdits, reason) {
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      this._eventEmitter.beginDeferredEmit();
      const operations = this._validateEditOperations(rawOperations);
      return this._doApplyEdits(operations, computeUndoEdits ?? false, reason ?? EditSources.applyEdits());
    } finally {
      this._eventEmitter.endDeferredEmit();
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  _doApplyEdits(rawOperations, computeUndoEdits, reason, resultingSelection = null) {
    const oldLineCount = this._buffer.getLineCount();
    const result = this._buffer.applyEdits(rawOperations, this._options.trimAutoWhitespace, computeUndoEdits);
    const newLineCount = this._buffer.getLineCount();
    const contentChanges = result.changes;
    this._trimAutoWhitespaceLines = result.trimAutoWhitespaceLineNumbers;
    if (contentChanges.length !== 0) {
      for (let i = 0, len = contentChanges.length; i < len; i++) {
        const change = contentChanges[i];
        this._decorationsTree.acceptReplace(change.rangeOffset, change.rangeLength, change.text.length, change.forceMoveMarkers);
      }
      const rawContentChanges = [];
      this._increaseVersionId();
      let lineCount = oldLineCount;
      for (let i = 0, len = contentChanges.length; i < len; i++) {
        const change = contentChanges[i];
        const [eolCount] = countEOL(change.text);
        this._onDidChangeDecorations.fire();
        const startLineNumber = change.range.startLineNumber;
        const endLineNumber = change.range.endLineNumber;
        const deletingLinesCnt = endLineNumber - startLineNumber;
        const insertingLinesCnt = eolCount;
        const editingLinesCnt = Math.min(deletingLinesCnt, insertingLinesCnt);
        const changeLineCountDelta = insertingLinesCnt - deletingLinesCnt;
        const currentEditStartLineNumber = newLineCount - lineCount - changeLineCountDelta + startLineNumber;
        for (let j = editingLinesCnt; j >= 0; j--) {
          const editLineNumber = startLineNumber + j;
          const currentEditLineNumber = currentEditStartLineNumber + j;
          rawContentChanges.push(
            new ModelRawLineChanged(
              editLineNumber,
              currentEditLineNumber
            )
          );
        }
        if (editingLinesCnt < deletingLinesCnt) {
          const spliceStartLineNumber = startLineNumber + editingLinesCnt;
          const cnt = insertingLinesCnt - deletingLinesCnt;
          const lastUntouchedLinePostEdit = newLineCount - lineCount - cnt + spliceStartLineNumber;
          rawContentChanges.push(new ModelRawLinesDeleted(spliceStartLineNumber + 1, endLineNumber, lastUntouchedLinePostEdit));
        }
        if (editingLinesCnt < insertingLinesCnt) {
          const spliceLineNumber = startLineNumber + editingLinesCnt;
          const cnt = insertingLinesCnt - editingLinesCnt;
          const fromLineNumber = newLineCount - lineCount - cnt + spliceLineNumber + 1;
          rawContentChanges.push(
            new ModelRawLinesInserted(
              spliceLineNumber + 1,
              fromLineNumber,
              cnt
            )
          );
        }
        lineCount += changeLineCountDelta;
      }
      this._emitContentChangedEvent(
        new ModelRawContentChangedEvent(
          rawContentChanges,
          this.getVersionId(),
          this._isUndoing,
          this._isRedoing
        ),
        {
          changes: contentChanges,
          eol: this._buffer.getEOL(),
          isEolChange: false,
          versionId: this.getVersionId(),
          isUndoing: this._isUndoing,
          isRedoing: this._isRedoing,
          isFlush: false,
          detailedReasons: [reason],
          detailedReasonsChangeLengths: [contentChanges.length]
        },
        resultingSelection
      );
    }
    return result.reverseEdits === null ? void 0 : result.reverseEdits;
  }
  undo() {
    return this._undoRedoService.undo(this.uri);
  }
  canUndo() {
    return this._undoRedoService.canUndo(this.uri);
  }
  redo() {
    return this._undoRedoService.redo(this.uri);
  }
  canRedo() {
    return this._undoRedoService.canRedo(this.uri);
  }
  //#endregion
  //#region Decorations
  handleBeforeFireDecorationsChangedEvent(affectedInjectedTextLines, affectedLineHeights, affectedFontLines) {
    if (affectedInjectedTextLines && affectedInjectedTextLines.size > 0) {
      const affectedLines = Array.from(affectedInjectedTextLines);
      const lineChangeEvents = affectedLines.map((lineNumber) => new ModelRawLineChanged(lineNumber, lineNumber));
      this._onDidChangeContentOrInjectedText(new ModelInjectedTextChangedEvent(lineChangeEvents));
    }
    this._fireOnDidChangeLineHeight(affectedLineHeights);
    this._fireOnDidChangeFont(affectedFontLines);
  }
  _fireOnDidChangeLineHeight(affectedLineHeights) {
    if (affectedLineHeights && affectedLineHeights.size > 0) {
      const affectedLines = Array.from(affectedLineHeights);
      const lineHeightChangeEvent = affectedLines.map((specialLineHeightChange) => new ModelLineHeightChanged(specialLineHeightChange.ownerId, specialLineHeightChange.decorationId, specialLineHeightChange.lineNumber, specialLineHeightChange.lineHeight));
      this._onDidChangeLineHeight.fire(new ModelLineHeightChangedEvent(lineHeightChangeEvent));
    }
  }
  _fireOnDidChangeFont(affectedFontLines) {
    if (affectedFontLines && affectedFontLines.size > 0) {
      const affectedLines = Array.from(affectedFontLines);
      const fontChangeEvent = affectedLines.map((fontChange) => new ModelFontChanged(fontChange.ownerId, fontChange.lineNumber));
      this._onDidChangeFont.fire(new ModelFontChangedEvent(fontChangeEvent));
    }
  }
  _onDidChangeContentOrInjectedText(e) {
    for (const viewModel of this._viewModels) {
      try {
        viewModel.onDidChangeContentOrInjectedText(e);
      } catch (error) {
        onUnexpectedError(error);
      }
    }
    for (const viewModel of this._viewModels) {
      try {
        viewModel.emitContentChangeEvent(e);
      } catch (error) {
        onUnexpectedError(error);
      }
    }
  }
  changeDecorations(callback, ownerId = 0) {
    this._assertNotDisposed();
    try {
      this._onDidChangeDecorations.beginDeferredEmit();
      return this._changeDecorations(ownerId, callback);
    } finally {
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  _changeDecorations(ownerId, callback) {
    const changeAccessor = {
      addDecoration: (range, options) => {
        return this._deltaDecorationsImpl(ownerId, [], [{ range, options }])[0];
      },
      changeDecoration: (id, newRange) => {
        this._changeDecorationImpl(ownerId, id, newRange);
      },
      changeDecorationOptions: (id, options) => {
        this._changeDecorationOptionsImpl(ownerId, id, _normalizeOptions(options));
      },
      removeDecoration: (id) => {
        this._deltaDecorationsImpl(ownerId, [id], []);
      },
      deltaDecorations: (oldDecorations, newDecorations) => {
        if (oldDecorations.length === 0 && newDecorations.length === 0) {
          return [];
        }
        return this._deltaDecorationsImpl(ownerId, oldDecorations, newDecorations);
      }
    };
    let result = null;
    try {
      result = callback(changeAccessor);
    } catch (e) {
      onUnexpectedError(e);
    }
    changeAccessor.addDecoration = invalidFunc;
    changeAccessor.changeDecoration = invalidFunc;
    changeAccessor.changeDecorationOptions = invalidFunc;
    changeAccessor.removeDecoration = invalidFunc;
    changeAccessor.deltaDecorations = invalidFunc;
    return result;
  }
  deltaDecorations(oldDecorations, newDecorations, ownerId = 0) {
    this._assertNotDisposed();
    if (!oldDecorations) {
      oldDecorations = [];
    }
    if (oldDecorations.length === 0 && newDecorations.length === 0) {
      return [];
    }
    try {
      this._deltaDecorationCallCnt++;
      if (this._deltaDecorationCallCnt > 1) {
        console.warn(`Invoking deltaDecorations recursively could lead to leaking decorations.`);
        onUnexpectedError(new Error(`Invoking deltaDecorations recursively could lead to leaking decorations.`));
      }
      this._onDidChangeDecorations.beginDeferredEmit();
      return this._deltaDecorationsImpl(ownerId, oldDecorations, newDecorations);
    } finally {
      this._onDidChangeDecorations.endDeferredEmit();
      this._deltaDecorationCallCnt--;
    }
  }
  _getTrackedRange(id) {
    return this.getDecorationRange(id);
  }
  _setTrackedRange(id, newRange, newStickiness) {
    const node = id ? this._decorations[id] : null;
    if (!node) {
      if (!newRange) {
        return null;
      }
      return this._deltaDecorationsImpl(0, [], [{ range: newRange, options: TRACKED_RANGE_OPTIONS[newStickiness] }], true)[0];
    }
    if (!newRange) {
      this._decorationsTree.delete(node);
      delete this._decorations[node.id];
      return null;
    }
    const range = this._validateRangeRelaxedNoAllocations(newRange);
    const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
    const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
    this._decorationsTree.delete(node);
    node.reset(this.getVersionId(), startOffset, endOffset, range);
    node.setOptions(TRACKED_RANGE_OPTIONS[newStickiness]);
    this._decorationsTree.insert(node);
    return node.id;
  }
  removeAllDecorationsWithOwnerId(ownerId) {
    if (this._isDisposed) {
      return;
    }
    const nodes = this._decorationsTree.collectNodesFromOwner(ownerId);
    for (let i = 0, len = nodes.length; i < len; i++) {
      const node = nodes[i];
      this._decorationsTree.delete(node);
      delete this._decorations[node.id];
    }
  }
  getDecorationOptions(decorationId) {
    const node = this._decorations[decorationId];
    if (!node) {
      return null;
    }
    return node.options;
  }
  getDecorationRange(decorationId) {
    const node = this._decorations[decorationId];
    if (!node) {
      return null;
    }
    return this._decorationsTree.getNodeRange(this, node);
  }
  getLineDecorations(lineNumber, ownerId = 0, filterOutValidation = false, filterFontDecorations = false) {
    if (lineNumber < 1 || lineNumber > this.getLineCount()) {
      return [];
    }
    return this.getLinesDecorations(lineNumber, lineNumber, ownerId, filterOutValidation, filterFontDecorations);
  }
  getLinesDecorations(_startLineNumber, _endLineNumber, ownerId = 0, filterOutValidation = false, filterFontDecorations = false, onlyMarginDecorations = false) {
    const lineCount = this.getLineCount();
    const startLineNumber = Math.min(lineCount, Math.max(1, _startLineNumber));
    const endLineNumber = Math.min(lineCount, Math.max(1, _endLineNumber));
    const endColumn = this.getLineMaxColumn(endLineNumber);
    const range = new Range(startLineNumber, 1, endLineNumber, endColumn);
    const decorations = this._getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations);
    pushMany(decorations, this._decorationProvider.getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations));
    pushMany(decorations, this._fontTokenDecorationsProvider.getDecorationsInRange(range, ownerId, filterOutValidation, filterFontDecorations));
    return decorations;
  }
  getDecorationsInRange(range, ownerId = 0, filterOutValidation = false, filterFontDecorations = false, onlyMinimapDecorations = false, onlyMarginDecorations = false) {
    const validatedRange = this.validateRange(range);
    const decorations = this._getDecorationsInRange(validatedRange, ownerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations);
    pushMany(decorations, this._decorationProvider.getDecorationsInRange(validatedRange, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations));
    pushMany(decorations, this._fontTokenDecorationsProvider.getDecorationsInRange(validatedRange, ownerId, filterOutValidation, filterFontDecorations, onlyMinimapDecorations));
    return decorations;
  }
  getOverviewRulerDecorations(ownerId = 0, filterOutValidation = false, filterFontDecorations = false) {
    return this._decorationsTree.getAll(this, ownerId, filterOutValidation, filterFontDecorations, true, false);
  }
  getInjectedTextDecorations(ownerId = 0) {
    return this._decorationsTree.getAllInjectedText(this, ownerId);
  }
  getCustomLineHeightsDecorations(ownerId = 0) {
    const decs = this._decorationsTree.getAllCustomLineHeights(this, ownerId);
    pushMany(decs, this._fontTokenDecorationsProvider.getAllDecorations(ownerId));
    return decs;
  }
  getCustomLineHeightsDecorationsInRange(range, ownerId = 0) {
    const decs = this._decorationsTree.getCustomLineHeightsInInterval(this, this.getOffsetAt(range.getStartPosition()), this.getOffsetAt(range.getEndPosition()), ownerId);
    pushMany(decs, this._fontTokenDecorationsProvider.getDecorationsInRange(range, ownerId));
    return decs;
  }
  getLineInjectedText(lineNumber, ownerId = 0) {
    const startOffset = this._buffer.getOffsetAt(lineNumber, 1);
    const endOffset = startOffset + this._buffer.getLineLength(lineNumber);
    const result = this._decorationsTree.getInjectedTextInInterval(this, startOffset, endOffset, ownerId);
    return LineInjectedText.fromDecorations(result).filter((t) => t.lineNumber === lineNumber);
  }
  getFontDecorationsInRange(range, ownerId = 0) {
    const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
    const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
    return this._decorationsTree.getFontDecorationsInInterval(this, startOffset, endOffset, ownerId);
  }
  getAllDecorations(ownerId = 0, filterOutValidation = false, filterFontDecorations = false) {
    let result = this._decorationsTree.getAll(this, ownerId, filterOutValidation, filterFontDecorations, false, false);
    result = result.concat(this._decorationProvider.getAllDecorations(ownerId, filterOutValidation));
    result = result.concat(this._fontTokenDecorationsProvider.getAllDecorations(ownerId, filterOutValidation));
    return result;
  }
  getAllMarginDecorations(ownerId = 0) {
    return this._decorationsTree.getAll(this, ownerId, false, false, false, true);
  }
  _getDecorationsInRange(filterRange, filterOwnerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations) {
    const startOffset = this._buffer.getOffsetAt(filterRange.startLineNumber, filterRange.startColumn);
    const endOffset = this._buffer.getOffsetAt(filterRange.endLineNumber, filterRange.endColumn);
    return this._decorationsTree.getAllInInterval(this, startOffset, endOffset, filterOwnerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations);
  }
  getRangeAt(start, end) {
    return this._buffer.getRangeAt(start, end - start);
  }
  _changeDecorationImpl(ownerId, decorationId, _range) {
    const node = this._decorations[decorationId];
    if (!node) {
      return;
    }
    if (node.options.after) {
      const oldRange = this.getDecorationRange(decorationId);
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(oldRange.endLineNumber);
    }
    if (node.options.before) {
      const oldRange = this.getDecorationRange(decorationId);
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(oldRange.startLineNumber);
    }
    if (node.options.lineHeight !== null) {
      const oldRange = this.getDecorationRange(decorationId);
      this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, oldRange.startLineNumber, null);
    }
    if (node.options.affectsFont) {
      const oldRange = this.getDecorationRange(decorationId);
      this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, node.id, oldRange.startLineNumber);
    }
    const range = this._validateRangeRelaxedNoAllocations(_range);
    const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
    const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
    this._decorationsTree.delete(node);
    node.reset(this.getVersionId(), startOffset, endOffset, range);
    this._decorationsTree.insert(node);
    this._onDidChangeDecorations.checkAffectedAndFire(node.options);
    if (node.options.after) {
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.endLineNumber);
    }
    if (node.options.before) {
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.startLineNumber);
    }
    if (node.options.lineHeight !== null) {
      this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, range.startLineNumber, node.options.lineHeight);
    }
    if (node.options.affectsFont) {
      this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, node.id, range.startLineNumber);
    }
  }
  _changeDecorationOptionsImpl(ownerId, decorationId, options) {
    const node = this._decorations[decorationId];
    if (!node) {
      return;
    }
    const nodeWasInOverviewRuler = node.options.overviewRuler && node.options.overviewRuler.color ? true : false;
    const nodeIsInOverviewRuler = options.overviewRuler && options.overviewRuler.color ? true : false;
    this._onDidChangeDecorations.checkAffectedAndFire(node.options);
    this._onDidChangeDecorations.checkAffectedAndFire(options);
    if (node.options.after || options.after) {
      const nodeRange = this._decorationsTree.getNodeRange(this, node);
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.endLineNumber);
    }
    if (node.options.before || options.before) {
      const nodeRange = this._decorationsTree.getNodeRange(this, node);
      this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.startLineNumber);
    }
    if (node.options.lineHeight !== null || options.lineHeight !== null) {
      const nodeRange = this._decorationsTree.getNodeRange(this, node);
      this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, nodeRange.startLineNumber, options.lineHeight);
    }
    if (node.options.affectsFont || options.affectsFont) {
      const nodeRange = this._decorationsTree.getNodeRange(this, node);
      this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, decorationId, nodeRange.startLineNumber);
    }
    const movedInOverviewRuler = nodeWasInOverviewRuler !== nodeIsInOverviewRuler;
    const changedWhetherInjectedText = isOptionsInjectedText(options) !== isNodeInjectedText(node);
    if (movedInOverviewRuler || changedWhetherInjectedText) {
      this._decorationsTree.delete(node);
      node.setOptions(options);
      this._decorationsTree.insert(node);
    } else {
      node.setOptions(options);
    }
  }
  _deltaDecorationsImpl(ownerId, oldDecorationsIds, newDecorations, suppressEvents = false) {
    const versionId = this.getVersionId();
    const oldDecorationsLen = oldDecorationsIds.length;
    let oldDecorationIndex = 0;
    const newDecorationsLen = newDecorations.length;
    let newDecorationIndex = 0;
    this._onDidChangeDecorations.beginDeferredEmit();
    try {
      const result = new Array(newDecorationsLen);
      while (oldDecorationIndex < oldDecorationsLen || newDecorationIndex < newDecorationsLen) {
        let node = null;
        if (oldDecorationIndex < oldDecorationsLen) {
          let decorationId;
          do {
            decorationId = oldDecorationsIds[oldDecorationIndex++];
            node = this._decorations[decorationId];
          } while (!node && oldDecorationIndex < oldDecorationsLen);
          if (node) {
            if (node.options.after) {
              const nodeRange = this._decorationsTree.getNodeRange(this, node);
              this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.endLineNumber);
            }
            if (node.options.before) {
              const nodeRange = this._decorationsTree.getNodeRange(this, node);
              this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.startLineNumber);
            }
            if (node.options.lineHeight !== null) {
              const nodeRange = this._decorationsTree.getNodeRange(this, node);
              this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, nodeRange.startLineNumber, null);
            }
            if (node.options.affectsFont) {
              const nodeRange = this._decorationsTree.getNodeRange(this, node);
              this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, decorationId, nodeRange.startLineNumber);
            }
            this._decorationsTree.delete(node);
            if (!suppressEvents) {
              this._onDidChangeDecorations.checkAffectedAndFire(node.options);
            }
          }
        }
        if (newDecorationIndex < newDecorationsLen) {
          if (!node) {
            const internalDecorationId = ++this._lastDecorationId;
            const decorationId = `${this._instanceId};${internalDecorationId}`;
            node = new IntervalNode(decorationId, 0, 0);
            this._decorations[decorationId] = node;
          }
          const newDecoration = newDecorations[newDecorationIndex];
          const range = this._validateRangeRelaxedNoAllocations(newDecoration.range);
          const options = _normalizeOptions(newDecoration.options);
          const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
          const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
          node.ownerId = ownerId;
          node.reset(versionId, startOffset, endOffset, range);
          node.setOptions(options);
          if (node.options.after) {
            this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.endLineNumber);
          }
          if (node.options.before) {
            this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.startLineNumber);
          }
          if (node.options.lineHeight !== null) {
            this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, node.id, range.startLineNumber, node.options.lineHeight);
          }
          if (node.options.affectsFont) {
            this._onDidChangeDecorations.recordLineAffectedByFontChange(ownerId, node.id, range.startLineNumber);
          }
          if (!suppressEvents) {
            this._onDidChangeDecorations.checkAffectedAndFire(options);
          }
          this._decorationsTree.insert(node);
          result[newDecorationIndex] = node.id;
          newDecorationIndex++;
        } else {
          if (node) {
            delete this._decorations[node.id];
          }
        }
      }
      return result;
    } finally {
      this._onDidChangeDecorations.endDeferredEmit();
    }
  }
  //#endregion
  //#region Tokenization
  // TODO move them to the tokenization part.
  getLanguageId() {
    return this.tokenization.getLanguageId();
  }
  setLanguage(languageIdOrSelection, source) {
    if (typeof languageIdOrSelection === "string") {
      this._languageSelectionListener.clear();
      this._setLanguage(languageIdOrSelection, source);
    } else {
      this._languageSelectionListener.value = languageIdOrSelection.onDidChange(() => this._setLanguage(languageIdOrSelection.languageId, source));
      this._setLanguage(languageIdOrSelection.languageId, source);
    }
  }
  _setLanguage(languageId, source) {
    this.tokenization.setLanguageId(languageId, source);
    this._languageService.requestRichLanguageFeatures(languageId);
  }
  getLanguageIdAtPosition(lineNumber, column) {
    return this.tokenization.getLanguageIdAtPosition(lineNumber, column);
  }
  getWordAtPosition(position) {
    return this._tokenizationTextModelPart.getWordAtPosition(position);
  }
  getWordUntilPosition(position) {
    return this._tokenizationTextModelPart.getWordUntilPosition(position);
  }
  //#endregion
  normalizePosition(position, affinity) {
    return position;
  }
  /**
   * Gets the column at which indentation stops at a given line.
   * @internal
  */
  getLineIndentColumn(lineNumber) {
    return indentOfLine(this.getLineContent(lineNumber)) + 1;
  }
  toString() {
    return `TextModel(${this.uri.toString()})`;
  }
};
TextModel._MODEL_SYNC_LIMIT = 50 * 1024 * 1024;
// 50 MB,  // used in tests
TextModel.LARGE_FILE_SIZE_THRESHOLD = 20 * 1024 * 1024;
// 20 MB;
TextModel.LARGE_FILE_LINE_COUNT_THRESHOLD = 300 * 1e3;
// 300K lines
TextModel.LARGE_FILE_HEAP_OPERATION_THRESHOLD = 256 * 1024 * 1024;
// 256M characters, usually ~> 512MB memory usage
TextModel.DEFAULT_CREATION_OPTIONS = {
  isForSimpleWidget: false,
  tabSize: EDITOR_MODEL_DEFAULTS.tabSize,
  indentSize: EDITOR_MODEL_DEFAULTS.indentSize,
  insertSpaces: EDITOR_MODEL_DEFAULTS.insertSpaces,
  detectIndentation: false,
  defaultEOL: model.DefaultEndOfLine.LF,
  trimAutoWhitespace: EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
  largeFileOptimizations: EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
  bracketPairColorizationOptions: EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions
};
TextModel = __decorateClass([
  __decorateParam(4, IUndoRedoService),
  __decorateParam(5, ILanguageService),
  __decorateParam(6, ILanguageConfigurationService),
  __decorateParam(7, IInstantiationService)
], TextModel);
function getLineTokensWithInjections(tokens, injectionOptions, injectionOffsets) {
  let lineTokens;
  if (injectionOffsets) {
    const tokensToInsert = [];
    for (let idx = 0; idx < injectionOffsets.length; idx++) {
      const offset = injectionOffsets[idx];
      const tokens2 = injectionOptions[idx].tokens;
      if (tokens2) {
        tokens2.forEach((range, info) => {
          tokensToInsert.push({
            offset,
            text: range.substring(injectionOptions[idx].content),
            tokenMetadata: info.metadata
          });
        });
      } else {
        tokensToInsert.push({
          offset,
          text: injectionOptions[idx].content,
          tokenMetadata: LineTokens.defaultTokenMetadata
        });
      }
    }
    lineTokens = tokens.withInserted(tokensToInsert);
  } else {
    lineTokens = tokens;
  }
  return lineTokens;
}
function indentOfLine(line) {
  let indent = 0;
  for (const c of line) {
    if (c === " " || c === "	") {
      indent++;
    } else {
      break;
    }
  }
  return indent;
}
function isNodeInOverviewRuler(node) {
  return node.options.overviewRuler && node.options.overviewRuler.color ? true : false;
}
function isOptionsInjectedText(options) {
  return !!options.after || !!options.before;
}
function isNodeInjectedText(node) {
  return !!node.options.after || !!node.options.before;
}
class DecorationsTrees {
  constructor() {
    this._decorationsTree0 = new IntervalTree();
    this._decorationsTree1 = new IntervalTree();
    this._injectedTextDecorationsTree = new IntervalTree();
  }
  ensureAllNodesHaveRanges(host) {
    this.getAll(host, 0, false, false, false, false);
  }
  _ensureNodesHaveRanges(host, nodes) {
    for (const node of nodes) {
      if (node.range === null) {
        node.range = host.getRangeAt(node.cachedAbsoluteStart, node.cachedAbsoluteEnd);
      }
    }
    return nodes;
  }
  getAllInInterval(host, start, end, filterOwnerId, filterOutValidation, filterFontDecorations, onlyMarginDecorations) {
    const versionId = host.getVersionId();
    const result = this._intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, versionId, onlyMarginDecorations);
    return this._ensureNodesHaveRanges(host, result);
  }
  _intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations) {
    const r0 = this._decorationsTree0.intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    const r1 = this._decorationsTree1.intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    const r2 = this._injectedTextDecorationsTree.intervalSearch(start, end, filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    return r0.concat(r1).concat(r2);
  }
  getInjectedTextInInterval(host, start, end, filterOwnerId) {
    const versionId = host.getVersionId();
    const result = this._injectedTextDecorationsTree.intervalSearch(start, end, filterOwnerId, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, result).filter((i) => i.options.showIfCollapsed || !i.range.isEmpty());
  }
  getFontDecorationsInInterval(host, start, end, filterOwnerId) {
    const versionId = host.getVersionId();
    const decorations = this._decorationsTree0.intervalSearch(start, end, filterOwnerId, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, decorations).filter((i) => i.options.affectsFont);
  }
  getAllInjectedText(host, filterOwnerId) {
    const versionId = host.getVersionId();
    const result = this._injectedTextDecorationsTree.search(filterOwnerId, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, result).filter((i) => i.options.showIfCollapsed || !i.range.isEmpty());
  }
  getAllCustomLineHeights(host, filterOwnerId) {
    const versionId = host.getVersionId();
    const result = this._search(filterOwnerId, false, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, result).filter((i) => typeof i.options.lineHeight === "number");
  }
  getCustomLineHeightsInInterval(host, start, end, filterOwnerId) {
    const versionId = host.getVersionId();
    const result = this._intervalSearch(start, end, filterOwnerId, false, false, versionId, false);
    return this._ensureNodesHaveRanges(host, result).filter((i) => typeof i.options.lineHeight === "number");
  }
  getAll(host, filterOwnerId, filterOutValidation, filterFontDecorations, overviewRulerOnly, onlyMarginDecorations) {
    const versionId = host.getVersionId();
    const result = this._search(filterOwnerId, filterOutValidation, filterFontDecorations, overviewRulerOnly, versionId, onlyMarginDecorations);
    return this._ensureNodesHaveRanges(host, result);
  }
  _search(filterOwnerId, filterOutValidation, filterFontDecorations, overviewRulerOnly, cachedVersionId, onlyMarginDecorations) {
    if (overviewRulerOnly) {
      return this._decorationsTree1.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
    } else {
      const r0 = this._decorationsTree0.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
      const r1 = this._decorationsTree1.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
      const r2 = this._injectedTextDecorationsTree.search(filterOwnerId, filterOutValidation, filterFontDecorations, cachedVersionId, onlyMarginDecorations);
      return r0.concat(r1).concat(r2);
    }
  }
  collectNodesFromOwner(ownerId) {
    const r0 = this._decorationsTree0.collectNodesFromOwner(ownerId);
    const r1 = this._decorationsTree1.collectNodesFromOwner(ownerId);
    const r2 = this._injectedTextDecorationsTree.collectNodesFromOwner(ownerId);
    return r0.concat(r1).concat(r2);
  }
  collectNodesPostOrder() {
    const r0 = this._decorationsTree0.collectNodesPostOrder();
    const r1 = this._decorationsTree1.collectNodesPostOrder();
    const r2 = this._injectedTextDecorationsTree.collectNodesPostOrder();
    return r0.concat(r1).concat(r2);
  }
  insert(node) {
    if (isNodeInjectedText(node)) {
      this._injectedTextDecorationsTree.insert(node);
    } else if (isNodeInOverviewRuler(node)) {
      this._decorationsTree1.insert(node);
    } else {
      this._decorationsTree0.insert(node);
    }
  }
  delete(node) {
    if (isNodeInjectedText(node)) {
      this._injectedTextDecorationsTree.delete(node);
    } else if (isNodeInOverviewRuler(node)) {
      this._decorationsTree1.delete(node);
    } else {
      this._decorationsTree0.delete(node);
    }
  }
  getNodeRange(host, node) {
    const versionId = host.getVersionId();
    if (node.cachedVersionId !== versionId) {
      this._resolveNode(node, versionId);
    }
    if (node.range === null) {
      node.range = host.getRangeAt(node.cachedAbsoluteStart, node.cachedAbsoluteEnd);
    }
    return node.range;
  }
  _resolveNode(node, cachedVersionId) {
    if (isNodeInjectedText(node)) {
      this._injectedTextDecorationsTree.resolveNode(node, cachedVersionId);
    } else if (isNodeInOverviewRuler(node)) {
      this._decorationsTree1.resolveNode(node, cachedVersionId);
    } else {
      this._decorationsTree0.resolveNode(node, cachedVersionId);
    }
  }
  acceptReplace(offset, length, textLength, forceMoveMarkers) {
    this._decorationsTree0.acceptReplace(offset, length, textLength, forceMoveMarkers);
    this._decorationsTree1.acceptReplace(offset, length, textLength, forceMoveMarkers);
    this._injectedTextDecorationsTree.acceptReplace(offset, length, textLength, forceMoveMarkers);
  }
}
function cleanClassName(className) {
  return className.replace(/[^a-z0-9\-_]/gi, " ");
}
class DecorationOptions {
  constructor(options) {
    this.color = options.color || "";
    this.darkColor = options.darkColor || "";
  }
}
class ModelDecorationOverviewRulerOptions extends DecorationOptions {
  constructor(options) {
    super(options);
    this._resolvedColor = null;
    this.position = typeof options.position === "number" ? options.position : model.OverviewRulerLane.Center;
  }
  getColor(theme) {
    if (!this._resolvedColor) {
      if (isDark(theme.type) && this.darkColor) {
        this._resolvedColor = this._resolveColor(this.darkColor, theme);
      } else {
        this._resolvedColor = this._resolveColor(this.color, theme);
      }
    }
    return this._resolvedColor;
  }
  invalidateCachedColor() {
    this._resolvedColor = null;
  }
  _resolveColor(color, theme) {
    if (typeof color === "string") {
      return color;
    }
    const c = color ? theme.getColor(color.id) : null;
    if (!c) {
      return "";
    }
    return c.toString();
  }
}
class ModelDecorationGlyphMarginOptions {
  constructor(options) {
    this.position = options?.position ?? model.GlyphMarginLane.Center;
    this.persistLane = options?.persistLane;
  }
}
class ModelDecorationMinimapOptions extends DecorationOptions {
  constructor(options) {
    super(options);
    this.position = options.position;
    this.sectionHeaderStyle = options.sectionHeaderStyle ?? null;
    this.sectionHeaderText = options.sectionHeaderText ?? null;
  }
  getColor(theme) {
    if (!this._resolvedColor) {
      if (isDark(theme.type) && this.darkColor) {
        this._resolvedColor = this._resolveColor(this.darkColor, theme);
      } else {
        this._resolvedColor = this._resolveColor(this.color, theme);
      }
    }
    return this._resolvedColor;
  }
  invalidateCachedColor() {
    this._resolvedColor = void 0;
  }
  _resolveColor(color, theme) {
    if (typeof color === "string") {
      return Color.fromHex(color);
    }
    return theme.getColor(color.id);
  }
}
class ModelDecorationInjectedTextOptions {
  static from(options) {
    if (options instanceof ModelDecorationInjectedTextOptions) {
      return options;
    }
    return new ModelDecorationInjectedTextOptions(options);
  }
  constructor(options) {
    this.content = options.content || "";
    this.tokens = options.tokens ?? null;
    this.inlineClassName = options.inlineClassName || null;
    this.inlineClassNameAffectsLetterSpacing = options.inlineClassNameAffectsLetterSpacing || false;
    this.attachedData = options.attachedData || null;
    this.cursorStops = options.cursorStops || null;
  }
}
class ModelDecorationOptions {
  static register(options) {
    return new ModelDecorationOptions(options);
  }
  static createDynamic(options) {
    return new ModelDecorationOptions(options);
  }
  constructor(options) {
    this.description = options.description;
    this.blockClassName = options.blockClassName ? cleanClassName(options.blockClassName) : null;
    this.blockDoesNotCollapse = options.blockDoesNotCollapse ?? null;
    this.blockIsAfterEnd = options.blockIsAfterEnd ?? null;
    this.blockPadding = options.blockPadding ?? null;
    this.stickiness = options.stickiness || model.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
    this.zIndex = options.zIndex || 0;
    this.className = options.className ? cleanClassName(options.className) : null;
    this.shouldFillLineOnLineBreak = options.shouldFillLineOnLineBreak ?? null;
    this.hoverMessage = options.hoverMessage || null;
    this.glyphMarginHoverMessage = options.glyphMarginHoverMessage || null;
    this.lineNumberHoverMessage = options.lineNumberHoverMessage || null;
    this.isWholeLine = options.isWholeLine || false;
    this.lineHeight = options.lineHeight ? Math.min(options.lineHeight, LINE_HEIGHT_CEILING) : null;
    this.fontSize = options.fontSize || null;
    this.affectsFont = !!options.fontSize || !!options.fontFamily || !!options.fontWeight || !!options.fontStyle;
    this.showIfCollapsed = options.showIfCollapsed || false;
    this.collapseOnReplaceEdit = options.collapseOnReplaceEdit || false;
    this.overviewRuler = options.overviewRuler ? new ModelDecorationOverviewRulerOptions(options.overviewRuler) : null;
    this.minimap = options.minimap ? new ModelDecorationMinimapOptions(options.minimap) : null;
    this.glyphMargin = options.glyphMarginClassName ? new ModelDecorationGlyphMarginOptions(options.glyphMargin) : null;
    this.glyphMarginClassName = options.glyphMarginClassName ? cleanClassName(options.glyphMarginClassName) : null;
    this.linesDecorationsClassName = options.linesDecorationsClassName ? cleanClassName(options.linesDecorationsClassName) : null;
    this.lineNumberClassName = options.lineNumberClassName ? cleanClassName(options.lineNumberClassName) : null;
    this.linesDecorationsTooltip = options.linesDecorationsTooltip ? strings.htmlAttributeEncodeValue(options.linesDecorationsTooltip) : null;
    this.firstLineDecorationClassName = options.firstLineDecorationClassName ? cleanClassName(options.firstLineDecorationClassName) : null;
    this.marginClassName = options.marginClassName ? cleanClassName(options.marginClassName) : null;
    this.inlineClassName = options.inlineClassName ? cleanClassName(options.inlineClassName) : null;
    this.inlineClassNameAffectsLetterSpacing = options.inlineClassNameAffectsLetterSpacing || false;
    this.beforeContentClassName = options.beforeContentClassName ? cleanClassName(options.beforeContentClassName) : null;
    this.afterContentClassName = options.afterContentClassName ? cleanClassName(options.afterContentClassName) : null;
    this.after = options.after ? ModelDecorationInjectedTextOptions.from(options.after) : null;
    this.before = options.before ? ModelDecorationInjectedTextOptions.from(options.before) : null;
    this.hideInCommentTokens = options.hideInCommentTokens ?? false;
    this.hideInStringTokens = options.hideInStringTokens ?? false;
    this.textDirection = options.textDirection ?? null;
  }
}
ModelDecorationOptions.EMPTY = ModelDecorationOptions.register({ description: "empty" });
const TRACKED_RANGE_OPTIONS = [
  ModelDecorationOptions.register({ description: "tracked-range-always-grows-when-typing-at-edges", stickiness: model.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }),
  ModelDecorationOptions.register({ description: "tracked-range-never-grows-when-typing-at-edges", stickiness: model.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }),
  ModelDecorationOptions.register({ description: "tracked-range-grows-only-when-typing-before", stickiness: model.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore }),
  ModelDecorationOptions.register({ description: "tracked-range-grows-only-when-typing-after", stickiness: model.TrackedRangeStickiness.GrowsOnlyWhenTypingAfter })
];
function _normalizeOptions(options) {
  if (options instanceof ModelDecorationOptions) {
    return options;
  }
  return ModelDecorationOptions.createDynamic(options);
}
class DidChangeDecorationsEmitter extends Disposable {
  constructor(handleBeforeFire) {
    super();
    this.handleBeforeFire = handleBeforeFire;
    this._actual = this._register(new Emitter());
    this.event = this._actual.event;
    this._affectedInjectedTextLines = null;
    this._affectedLineHeights = null;
    this._affectedFontLines = null;
    this._deferredCnt = 0;
    this._shouldFireDeferred = false;
    this._affectsMinimap = false;
    this._affectsOverviewRuler = false;
    this._affectsGlyphMargin = false;
    this._affectsLineNumber = false;
  }
  hasListeners() {
    return this._actual.hasListeners();
  }
  beginDeferredEmit() {
    this._deferredCnt++;
  }
  endDeferredEmit() {
    this._deferredCnt--;
    if (this._deferredCnt === 0) {
      if (this._shouldFireDeferred) {
        this.doFire();
      }
      this._affectedInjectedTextLines?.clear();
      this._affectedInjectedTextLines = null;
      this._affectedLineHeights?.clear();
      this._affectedLineHeights = null;
      this._affectedFontLines?.clear();
      this._affectedFontLines = null;
    }
  }
  recordLineAffectedByInjectedText(lineNumber) {
    if (!this._affectedInjectedTextLines) {
      this._affectedInjectedTextLines = /* @__PURE__ */ new Set();
    }
    this._affectedInjectedTextLines.add(lineNumber);
  }
  recordLineAffectedByLineHeightChange(ownerId, decorationId, lineNumber, lineHeight) {
    if (!this._affectedLineHeights) {
      this._affectedLineHeights = new SetWithKey([], LineHeightChangingDecoration.toKey);
    }
    this._affectedLineHeights.add(new LineHeightChangingDecoration(ownerId, decorationId, lineNumber, lineHeight));
  }
  recordLineAffectedByFontChange(ownerId, decorationId, lineNumber) {
    if (!this._affectedFontLines) {
      this._affectedFontLines = new SetWithKey([], LineFontChangingDecoration.toKey);
    }
    this._affectedFontLines.add(new LineFontChangingDecoration(ownerId, decorationId, lineNumber));
  }
  checkAffectedAndFire(options) {
    this._affectsMinimap ||= !!options.minimap?.position;
    this._affectsOverviewRuler ||= !!options.overviewRuler?.color;
    this._affectsGlyphMargin ||= !!options.glyphMarginClassName;
    this._affectsLineNumber ||= !!options.lineNumberClassName;
    this.tryFire();
  }
  fire() {
    this._affectsMinimap = true;
    this._affectsOverviewRuler = true;
    this._affectsGlyphMargin = true;
    this.tryFire();
  }
  tryFire() {
    if (this._deferredCnt === 0) {
      this.doFire();
    } else {
      this._shouldFireDeferred = true;
    }
  }
  doFire() {
    this.handleBeforeFire(this._affectedInjectedTextLines, this._affectedLineHeights, this._affectedFontLines);
    const event = {
      affectsMinimap: this._affectsMinimap,
      affectsOverviewRuler: this._affectsOverviewRuler,
      affectsGlyphMargin: this._affectsGlyphMargin,
      affectsLineNumber: this._affectsLineNumber
    };
    this._shouldFireDeferred = false;
    this._affectsMinimap = false;
    this._affectsOverviewRuler = false;
    this._affectsGlyphMargin = false;
    this._actual.fire(event);
  }
}
class DidChangeContentEmitter extends Disposable {
  constructor() {
    super();
    this._emitter = this._register(new Emitter());
    this.event = this._emitter.event;
    this._deferredCnt = 0;
    this._deferredEvent = null;
  }
  hasListeners() {
    return this._emitter.hasListeners();
  }
  beginDeferredEmit() {
    this._deferredCnt++;
  }
  endDeferredEmit(resultingSelection = null) {
    this._deferredCnt--;
    if (this._deferredCnt === 0) {
      if (this._deferredEvent !== null) {
        this._deferredEvent.rawContentChangedEvent.resultingSelection = resultingSelection;
        const e = this._deferredEvent;
        this._deferredEvent = null;
        this._emitter.fire(e);
      }
    }
  }
  fire(e) {
    if (this._deferredCnt > 0) {
      if (this._deferredEvent) {
        this._deferredEvent = this._deferredEvent.merge(e);
      } else {
        this._deferredEvent = e;
      }
      return;
    }
    this._emitter.fire(e);
  }
}
export {
  ModelDecorationGlyphMarginOptions,
  ModelDecorationInjectedTextOptions,
  ModelDecorationMinimapOptions,
  ModelDecorationOptions,
  ModelDecorationOverviewRulerOptions,
  TextModel,
  createTextBuffer,
  createTextBufferFactory,
  createTextBufferFactoryFromSnapshot,
  createTextBufferFactoryFromStream,
  getLineTokensWithInjections,
  indentOfLine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXHRleHRNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHB1c2hNYW55IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgU2V0V2l0aEtleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yLCBpbGxlZ2FsQXJndW1lbnQsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxpc3RlblN0cmVhbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSwgUmVzb3VyY2VFZGl0U3RhY2tTbmFwc2hvdCwgVW5kb1JlZG9Hcm91cCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgY291bnRFT0wgfSBmcm9tICcuLi9jb3JlL21pc2MvZW9sQ291bnRlci5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVJbmRlbnRhdGlvbiB9IGZyb20gJy4uL2NvcmUvbWlzYy9pbmRlbnRhdGlvbi5qcyc7XG5pbXBvcnQgeyBFRElUT1JfTU9ERUxfREVGQVVMVFMgfSBmcm9tICcuLi9jb3JlL21pc2MvdGV4dE1vZGVsRGVmYXVsdHMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGV4dENoYW5nZSB9IGZyb20gJy4uL2NvcmUvdGV4dENoYW5nZS5qcyc7XG5pbXBvcnQgeyBJV29yZEF0UG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgRm9ybWF0dGluZ09wdGlvbnMgfSBmcm9tICcuLi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VsZWN0aW9uLCBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCAqIGFzIG1vZGVsIGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IElCcmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0IH0gZnJvbSAnLi4vdGV4dE1vZGVsQnJhY2tldFBhaXJzLmpzJztcbmltcG9ydCB7IEVkaXRTb3VyY2VzLCBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50LCBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCwgSU1vZGVsT3B0aW9uc0NoYW5nZWRFdmVudCwgSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCwgTGluZUluamVjdGVkVGV4dCwgTW9kZWxGb250Q2hhbmdlZCwgTW9kZWxGb250Q2hhbmdlZEV2ZW50LCBNb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCwgTW9kZWxMaW5lSGVpZ2h0Q2hhbmdlZCwgTW9kZWxMaW5lSGVpZ2h0Q2hhbmdlZEV2ZW50LCBNb2RlbFJhd0NoYW5nZSwgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50LCBNb2RlbFJhd0VPTENoYW5nZWQsIE1vZGVsUmF3Rmx1c2gsIE1vZGVsUmF3TGluZUNoYW5nZWQsIE1vZGVsUmF3TGluZXNEZWxldGVkLCBNb2RlbFJhd0xpbmVzSW5zZXJ0ZWQgfSBmcm9tICcuLi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgSUd1aWRlc1RleHRNb2RlbFBhcnQgfSBmcm9tICcuLi90ZXh0TW9kZWxHdWlkZXMuanMnO1xuaW1wb3J0IHsgSVRva2VuaXphdGlvblRleHRNb2RlbFBhcnQgfSBmcm9tICcuLi90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmpzJztcbmltcG9ydCB7IExpbmVUb2tlbnMsIFRva2VuQXJyYXkgfSBmcm9tICcuLi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBCcmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0IH0gZnJvbSAnLi9icmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0L2JyYWNrZXRQYWlyc0ltcGwuanMnO1xuaW1wb3J0IHsgQ29sb3JpemVkQnJhY2tldFBhaXJzRGVjb3JhdGlvblByb3ZpZGVyIH0gZnJvbSAnLi9icmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0L2NvbG9yaXplZEJyYWNrZXRQYWlyc0RlY29yYXRpb25Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBFZGl0U3RhY2sgfSBmcm9tICcuL2VkaXRTdGFjay5qcyc7XG5pbXBvcnQgeyBHdWlkZXNUZXh0TW9kZWxQYXJ0IH0gZnJvbSAnLi9ndWlkZXNUZXh0TW9kZWxQYXJ0LmpzJztcbmltcG9ydCB7IGd1ZXNzSW5kZW50YXRpb24gfSBmcm9tICcuL2luZGVudGF0aW9uR3Vlc3Nlci5qcyc7XG5pbXBvcnQgeyBJbnRlcnZhbE5vZGUsIEludGVydmFsVHJlZSwgcmVjb21wdXRlTWF4RW5kIH0gZnJvbSAnLi9pbnRlcnZhbFRyZWUuanMnO1xuaW1wb3J0IHsgUGllY2VUcmVlVGV4dEJ1ZmZlciB9IGZyb20gJy4vcGllY2VUcmVlVGV4dEJ1ZmZlci9waWVjZVRyZWVUZXh0QnVmZmVyLmpzJztcbmltcG9ydCB7IFBpZWNlVHJlZVRleHRCdWZmZXJCdWlsZGVyIH0gZnJvbSAnLi9waWVjZVRyZWVUZXh0QnVmZmVyL3BpZWNlVHJlZVRleHRCdWZmZXJCdWlsZGVyLmpzJztcbmltcG9ydCB7IFNlYXJjaFBhcmFtcywgVGV4dE1vZGVsU2VhcmNoIH0gZnJvbSAnLi90ZXh0TW9kZWxTZWFyY2guanMnO1xuaW1wb3J0IHsgQXR0YWNoZWRWaWV3cyB9IGZyb20gJy4vdG9rZW5zL2Fic3RyYWN0U3ludGF4VG9rZW5CYWNrZW5kLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvbkZvbnREZWNvcmF0aW9uUHJvdmlkZXIgfSBmcm9tICcuL3Rva2Vucy90b2tlbml6YXRpb25Gb250RGVjb3JhdGlvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBMaW5lRm9udENoYW5naW5nRGVjb3JhdGlvbiwgTGluZUhlaWdodENoYW5naW5nRGVjb3JhdGlvbiB9IGZyb20gJy4vZGVjb3JhdGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblRleHRNb2RlbFBhcnQgfSBmcm9tICcuL3Rva2Vucy90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmpzJztcbmltcG9ydCB7IElWaWV3TW9kZWwgfSBmcm9tICcuLi92aWV3TW9kZWwuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkodGV4dDogc3RyaW5nKTogbW9kZWwuSVRleHRCdWZmZXJGYWN0b3J5IHtcblx0Y29uc3QgYnVpbGRlciA9IG5ldyBQaWVjZVRyZWVUZXh0QnVmZmVyQnVpbGRlcigpO1xuXHRidWlsZGVyLmFjY2VwdENodW5rKHRleHQpO1xuXHRyZXR1cm4gYnVpbGRlci5maW5pc2goKTtcbn1cblxuaW50ZXJmYWNlIElUZXh0U3RyZWFtIHtcblx0b24oZXZlbnQ6ICdkYXRhJywgY2FsbGJhY2s6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQpOiB2b2lkO1xuXHRvbihldmVudDogJ2Vycm9yJywgY2FsbGJhY2s6IChlcnI6IEVycm9yKSA9PiB2b2lkKTogdm9pZDtcblx0b24oZXZlbnQ6ICdlbmQnLCBjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQ7XG5cdG9uKGV2ZW50OiBzdHJpbmcsIGNhbGxiYWNrOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVN0cmVhbShzdHJlYW06IElUZXh0U3RyZWFtKTogUHJvbWlzZTxtb2RlbC5JVGV4dEJ1ZmZlckZhY3Rvcnk+O1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVN0cmVhbShzdHJlYW06IFZTQnVmZmVyUmVhZGFibGVTdHJlYW0pOiBQcm9taXNlPG1vZGVsLklUZXh0QnVmZmVyRmFjdG9yeT47XG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU3RyZWFtKHN0cmVhbTogSVRleHRTdHJlYW0gfCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtKTogUHJvbWlzZTxtb2RlbC5JVGV4dEJ1ZmZlckZhY3Rvcnk+IHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPG1vZGVsLklUZXh0QnVmZmVyRmFjdG9yeT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgUGllY2VUcmVlVGV4dEJ1ZmZlckJ1aWxkZXIoKTtcblxuXHRcdGxldCBkb25lID0gZmFsc2U7XG5cblx0XHRsaXN0ZW5TdHJlYW08c3RyaW5nIHwgVlNCdWZmZXI+KHN0cmVhbSwge1xuXHRcdFx0b25EYXRhOiBjaHVuayA9PiB7XG5cdFx0XHRcdGJ1aWxkZXIuYWNjZXB0Q2h1bmsoKHR5cGVvZiBjaHVuayA9PT0gJ3N0cmluZycpID8gY2h1bmsgOiBjaHVuay50b1N0cmluZygpKTtcblx0XHRcdH0sXG5cdFx0XHRvbkVycm9yOiBlcnJvciA9PiB7XG5cdFx0XHRcdGlmICghZG9uZSkge1xuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkVuZDogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWRvbmUpIHtcblx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXNvbHZlKGJ1aWxkZXIuZmluaXNoKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU25hcHNob3Qoc25hcHNob3Q6IG1vZGVsLklUZXh0U25hcHNob3QpOiBtb2RlbC5JVGV4dEJ1ZmZlckZhY3Rvcnkge1xuXHRjb25zdCBidWlsZGVyID0gbmV3IFBpZWNlVHJlZVRleHRCdWZmZXJCdWlsZGVyKCk7XG5cblx0bGV0IGNodW5rOiBzdHJpbmcgfCBudWxsO1xuXHR3aGlsZSAodHlwZW9mIChjaHVuayA9IHNuYXBzaG90LnJlYWQoKSkgPT09ICdzdHJpbmcnKSB7XG5cdFx0YnVpbGRlci5hY2NlcHRDaHVuayhjaHVuayk7XG5cdH1cblxuXHRyZXR1cm4gYnVpbGRlci5maW5pc2goKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRleHRCdWZmZXIodmFsdWU6IHN0cmluZyB8IG1vZGVsLklUZXh0QnVmZmVyRmFjdG9yeSB8IG1vZGVsLklUZXh0U25hcHNob3QsIGRlZmF1bHRFT0w6IG1vZGVsLkRlZmF1bHRFbmRPZkxpbmUpOiB7IHRleHRCdWZmZXI6IG1vZGVsLklUZXh0QnVmZmVyOyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9IHtcblx0bGV0IGZhY3Rvcnk6IG1vZGVsLklUZXh0QnVmZmVyRmFjdG9yeTtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRmYWN0b3J5ID0gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkodmFsdWUpO1xuXHR9IGVsc2UgaWYgKG1vZGVsLmlzSVRleHRTbmFwc2hvdCh2YWx1ZSkpIHtcblx0XHRmYWN0b3J5ID0gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU25hcHNob3QodmFsdWUpO1xuXHR9IGVsc2Uge1xuXHRcdGZhY3RvcnkgPSB2YWx1ZTtcblx0fVxuXHRyZXR1cm4gZmFjdG9yeS5jcmVhdGUoZGVmYXVsdEVPTCk7XG59XG5cbmxldCBNT0RFTF9JRCA9IDA7XG5cbmNvbnN0IExJTUlUX0ZJTkRfQ09VTlQgPSA5OTk7XG5jb25zdCBMT05HX0xJTkVfQk9VTkRBUlkgPSAxMDAwMDtcbmNvbnN0IExJTkVfSEVJR0hUX0NFSUxJTkcgPSAzMDA7XG5cbmNsYXNzIFRleHRNb2RlbFNuYXBzaG90IGltcGxlbWVudHMgbW9kZWwuSVRleHRTbmFwc2hvdCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc291cmNlOiBtb2RlbC5JVGV4dFNuYXBzaG90O1xuXHRwcml2YXRlIF9lb3M6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3Ioc291cmNlOiBtb2RlbC5JVGV4dFNuYXBzaG90KSB7XG5cdFx0dGhpcy5fc291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuX2VvcyA9IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHJlYWQoKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX2Vvcykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCByZXN1bHRDbnQgPSAwO1xuXHRcdGxldCByZXN1bHRMZW5ndGggPSAwO1xuXG5cdFx0ZG8ge1xuXHRcdFx0Y29uc3QgdG1wID0gdGhpcy5fc291cmNlLnJlYWQoKTtcblxuXHRcdFx0aWYgKHRtcCA9PT0gbnVsbCkge1xuXHRcdFx0XHQvLyBlbmQtb2Ytc3RyZWFtXG5cdFx0XHRcdHRoaXMuX2VvcyA9IHRydWU7XG5cdFx0XHRcdGlmIChyZXN1bHRDbnQgPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0LmpvaW4oJycpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0bXAubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0Q250KytdID0gdG1wO1xuXHRcdFx0XHRyZXN1bHRMZW5ndGggKz0gdG1wLmxlbmd0aDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlc3VsdExlbmd0aCA+PSA2NCAqIDEwMjQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdC5qb2luKCcnKTtcblx0XHRcdH1cblx0XHR9IHdoaWxlICh0cnVlKTtcblx0fVxufVxuXG5jb25zdCBpbnZhbGlkRnVuYyA9ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGNoYW5nZSBhY2Nlc3NvcmApOyB9O1xuXG5jb25zdCBlbnVtIFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlIHtcblx0LyoqXG5cdCAqIEV2ZW4gYWxsb3dlZCBpbiBzdXJyb2dhdGUgcGFpcnNcblx0ICovXG5cdFJlbGF4ZWQgPSAwLFxuXHQvKipcblx0ICogTm90IGFsbG93ZWQgaW4gc3Vycm9nYXRlIHBhaXJzXG5cdCAqL1xuXHRTdXJyb2dhdGVQYWlycyA9IDEsXG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0TW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgbW9kZWwuSVRleHRNb2RlbCwgSURlY29yYXRpb25zVHJlZXNIb3N0IHtcblxuXHRzdGF0aWMgX01PREVMX1NZTkNfTElNSVQgPSA1MCAqIDEwMjQgKiAxMDI0OyAvLyA1MCBNQiwgIC8vIHVzZWQgaW4gdGVzdHNcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTEFSR0VfRklMRV9TSVpFX1RIUkVTSE9MRCA9IDIwICogMTAyNCAqIDEwMjQ7IC8vIDIwIE1CO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBMQVJHRV9GSUxFX0xJTkVfQ09VTlRfVEhSRVNIT0xEID0gMzAwICogMTAwMDsgLy8gMzAwSyBsaW5lc1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBMQVJHRV9GSUxFX0hFQVBfT1BFUkFUSU9OX1RIUkVTSE9MRCA9IDI1NiAqIDEwMjQgKiAxMDI0OyAvLyAyNTZNIGNoYXJhY3RlcnMsIHVzdWFsbHkgfj4gNTEyTUIgbWVtb3J5IHVzYWdlXG5cblx0cHVibGljIHN0YXRpYyBERUZBVUxUX0NSRUFUSU9OX09QVElPTlM6IG1vZGVsLklUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMgPSB7XG5cdFx0aXNGb3JTaW1wbGVXaWRnZXQ6IGZhbHNlLFxuXHRcdHRhYlNpemU6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy50YWJTaXplLFxuXHRcdGluZGVudFNpemU6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy5pbmRlbnRTaXplLFxuXHRcdGluc2VydFNwYWNlczogRURJVE9SX01PREVMX0RFRkFVTFRTLmluc2VydFNwYWNlcyxcblx0XHRkZXRlY3RJbmRlbnRhdGlvbjogZmFsc2UsXG5cdFx0ZGVmYXVsdEVPTDogbW9kZWwuRGVmYXVsdEVuZE9mTGluZS5MRixcblx0XHR0cmltQXV0b1doaXRlc3BhY2U6IEVESVRPUl9NT0RFTF9ERUZBVUxUUy50cmltQXV0b1doaXRlc3BhY2UsXG5cdFx0bGFyZ2VGaWxlT3B0aW1pemF0aW9uczogRURJVE9SX01PREVMX0RFRkFVTFRTLmxhcmdlRmlsZU9wdGltaXphdGlvbnMsXG5cdFx0YnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zOiBFRElUT1JfTU9ERUxfREVGQVVMVFMuYnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zLFxuXHR9O1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVzb2x2ZU9wdGlvbnModGV4dEJ1ZmZlcjogbW9kZWwuSVRleHRCdWZmZXIsIG9wdGlvbnM6IG1vZGVsLklUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMpOiBtb2RlbC5UZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnMge1xuXHRcdGlmIChvcHRpb25zLmRldGVjdEluZGVudGF0aW9uKSB7XG5cdFx0XHRjb25zdCBndWVzc2VkSW5kZW50YXRpb24gPSBndWVzc0luZGVudGF0aW9uKHRleHRCdWZmZXIsIG9wdGlvbnMudGFiU2l6ZSwgb3B0aW9ucy5pbnNlcnRTcGFjZXMpO1xuXHRcdFx0cmV0dXJuIG5ldyBtb2RlbC5UZXh0TW9kZWxSZXNvbHZlZE9wdGlvbnMoe1xuXHRcdFx0XHR0YWJTaXplOiBndWVzc2VkSW5kZW50YXRpb24udGFiU2l6ZSxcblx0XHRcdFx0aW5kZW50U2l6ZTogJ3RhYlNpemUnLCAvLyBUT0RPQEFsZXg6IGd1ZXNzIGluZGVudFNpemUgaW5kZXBlbmRlbnQgb2YgdGFiU2l6ZVxuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGd1ZXNzZWRJbmRlbnRhdGlvbi5pbnNlcnRTcGFjZXMsXG5cdFx0XHRcdHRyaW1BdXRvV2hpdGVzcGFjZTogb3B0aW9ucy50cmltQXV0b1doaXRlc3BhY2UsXG5cdFx0XHRcdGRlZmF1bHRFT0w6IG9wdGlvbnMuZGVmYXVsdEVPTCxcblx0XHRcdFx0YnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zOiBvcHRpb25zLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucyxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgbW9kZWwuVGV4dE1vZGVsUmVzb2x2ZWRPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEV2ZW50c1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxEaXNwb3NlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uV2lsbERpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEZWNvcmF0aW9uczogRGlkQ2hhbmdlRGVjb3JhdGlvbnNFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpZENoYW5nZURlY29yYXRpb25zRW1pdHRlcigoYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lcywgYWZmZWN0ZWRMaW5lSGVpZ2h0cywgYWZmZWN0ZWRGb250TGluZXMpID0+IHRoaXMuaGFuZGxlQmVmb3JlRmlyZURlY29yYXRpb25zQ2hhbmdlZEV2ZW50KGFmZmVjdGVkSW5qZWN0ZWRUZXh0TGluZXMsIGFmZmVjdGVkTGluZUhlaWdodHMsIGFmZmVjdGVkRm9udExpbmVzKSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VEZWNvcmF0aW9uczogRXZlbnQ8SU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5ldmVudDtcblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlTGFuZ3VhZ2UoKSB7IHJldHVybiB0aGlzLl90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0Lm9uRGlkQ2hhbmdlTGFuZ3VhZ2U7IH1cblx0cHVibGljIGdldCBvbkRpZENoYW5nZUxhbmd1YWdlQ29uZmlndXJhdGlvbigpIHsgcmV0dXJuIHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQub25EaWRDaGFuZ2VMYW5ndWFnZUNvbmZpZ3VyYXRpb247IH1cblx0cHVibGljIGdldCBvbkRpZENoYW5nZVRva2VucygpIHsgcmV0dXJuIHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQub25EaWRDaGFuZ2VUb2tlbnM7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9wdGlvbnM6IEVtaXR0ZXI8SU1vZGVsT3B0aW9uc0NoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50PigpKTtcblx0cHVibGljIGdldCBvbkRpZENoYW5nZU9wdGlvbnMoKTogRXZlbnQ8SU1vZGVsT3B0aW9uc0NoYW5nZWRFdmVudD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VPcHRpb25zLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBdHRhY2hlZDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlQXR0YWNoZWQoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VBdHRhY2hlZC5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTGluZUhlaWdodDogRW1pdHRlcjxNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TW9kZWxMaW5lSGVpZ2h0Q2hhbmdlZEV2ZW50PigpKTtcblx0cHVibGljIGdldCBvbkRpZENoYW5nZUxpbmVIZWlnaHQoKTogRXZlbnQ8TW9kZWxMaW5lSGVpZ2h0Q2hhbmdlZEV2ZW50PiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUxpbmVIZWlnaHQuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZvbnQ6IEVtaXR0ZXI8TW9kZWxGb250Q2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1vZGVsRm9udENoYW5nZWRFdmVudD4oKSk7XG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VGb250KCk6IEV2ZW50PE1vZGVsRm9udENoYW5nZWRFdmVudD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VGb250LmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXZlbnRFbWl0dGVyOiBEaWRDaGFuZ2VDb250ZW50RW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaWRDaGFuZ2VDb250ZW50RW1pdHRlcigpKTtcblx0cHVibGljIG9uRGlkQ2hhbmdlQ29udGVudChsaXN0ZW5lcjogKGU6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2V2ZW50RW1pdHRlci5ldmVudCgoZTogSW50ZXJuYWxNb2RlbENvbnRlbnRDaGFuZ2VFdmVudCkgPT4gbGlzdGVuZXIoZS5jb250ZW50Q2hhbmdlZEV2ZW50KSk7XG5cdH1cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHVibGljIHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBpc0ZvclNpbXBsZVdpZGdldDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfYXNzb2NpYXRlZFJlc291cmNlOiBVUkk7XG5cdHByaXZhdGUgX2F0dGFjaGVkRWRpdG9yQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfYnVmZmVyOiBtb2RlbC5JVGV4dEJ1ZmZlcjtcblx0cHJpdmF0ZSBfYnVmZmVyRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgX29wdGlvbnM6IG1vZGVsLlRleHRNb2RlbFJlc29sdmVkT3B0aW9ucztcblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZWxlY3Rpb25MaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cblx0cHJpdmF0ZSBfaXNEaXNwb3NlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfX2lzRGlzcG9zaW5nOiBib29sZWFuO1xuXHRwdWJsaWMgX2lzRGlzcG9zaW5nKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fX2lzRGlzcG9zaW5nOyB9XG5cdHByaXZhdGUgX3ZlcnNpb25JZDogbnVtYmVyO1xuXHQvKipcblx0ICogVW5saWtlLCB2ZXJzaW9uSWQsIHRoaXMgY2FuIGdvIGRvd24gKHZpYSB1bmRvKSBvciBnbyB0byBwcmV2aW91cyB2YWx1ZXMgKHZpYSByZWRvKVxuXHQgKi9cblx0cHJpdmF0ZSBfYWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfaW5pdGlhbFVuZG9SZWRvU25hcHNob3Q6IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3QgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1Rvb0xhcmdlRm9yU3luY2luZzogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNUb29MYXJnZUZvclRva2VuaXphdGlvbjogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNUb29MYXJnZUZvckhlYXBPcGVyYXRpb246IGJvb2xlYW47XG5cblx0Ly8jcmVnaW9uIEVkaXRpbmdcblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZE1hbmFnZXI6IEVkaXRTdGFjaztcblx0cHJpdmF0ZSBfaXNVbmRvaW5nOiBib29sZWFuO1xuXHRwcml2YXRlIF9pc1JlZG9pbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgX3RyaW1BdXRvV2hpdGVzcGFjZUxpbmVzOiBudW1iZXJbXSB8IG51bGw7XG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBEZWNvcmF0aW9uc1xuXHQvKipcblx0ICogVXNlZCB0byB3b3JrYXJvdW5kIGJyb2tlbiBjbGllbnRzIHRoYXQgbWlnaHQgYXR0ZW1wdCB1c2luZyBhIGRlY29yYXRpb24gaWQgZ2VuZXJhdGVkIGJ5IGEgZGlmZmVyZW50IG1vZGVsLlxuXHQgKiBJdCBpcyBub3QgZ2xvYmFsbHkgdW5pcXVlIGluIG9yZGVyIHRvIGxpbWl0IGl0IHRvIG9uZSBjaGFyYWN0ZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW5jZUlkOiBzdHJpbmc7XG5cdHByaXZhdGUgX2RlbHRhRGVjb3JhdGlvbkNhbGxDbnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2xhc3REZWNvcmF0aW9uSWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfZGVjb3JhdGlvbnM6IHsgW2RlY29yYXRpb25JZDogc3RyaW5nXTogSW50ZXJ2YWxOb2RlIH07XG5cdHByaXZhdGUgX2RlY29yYXRpb25zVHJlZTogRGVjb3JhdGlvbnNUcmVlcztcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvblByb3ZpZGVyOiBDb2xvcml6ZWRCcmFja2V0UGFpcnNEZWNvcmF0aW9uUHJvdmlkZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZvbnRUb2tlbkRlY29yYXRpb25zUHJvdmlkZXI6IFRva2VuaXphdGlvbkZvbnREZWNvcmF0aW9uUHJvdmlkZXI7XG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQ6IFRva2VuaXphdGlvblRleHRNb2RlbFBhcnQ7XG5cdHB1YmxpYyBnZXQgdG9rZW5pemF0aW9uKCk6IElUb2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0IHsgcmV0dXJuIHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9icmFja2V0UGFpcnM6IEJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQ7XG5cdHB1YmxpYyBnZXQgYnJhY2tldFBhaXJzKCk6IElCcmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0IHsgcmV0dXJuIHRoaXMuX2JyYWNrZXRQYWlyczsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2d1aWRlc1RleHRNb2RlbFBhcnQ6IEd1aWRlc1RleHRNb2RlbFBhcnQ7XG5cdHB1YmxpYyBnZXQgZ3VpZGVzKCk6IElHdWlkZXNUZXh0TW9kZWxQYXJ0IHsgcmV0dXJuIHRoaXMuX2d1aWRlc1RleHRNb2RlbFBhcnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRhY2hlZFZpZXdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEF0dGFjaGVkVmlld3MoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdNb2RlbHMgPSBuZXcgU2V0PElWaWV3TW9kZWw+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c291cmNlOiBzdHJpbmcgfCBtb2RlbC5JVGV4dEJ1ZmZlckZhY3RvcnksXG5cdFx0bGFuZ3VhZ2VJZE9yU2VsZWN0aW9uOiBzdHJpbmcgfCBJTGFuZ3VhZ2VTZWxlY3Rpb24sXG5cdFx0Y3JlYXRpb25PcHRpb25zOiBtb2RlbC5JVGV4dE1vZGVsQ3JlYXRpb25PcHRpb25zLFxuXHRcdGFzc29jaWF0ZWRSZXNvdXJjZTogVVJJIHwgbnVsbCA9IG51bGwsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIEdlbmVyYXRlIGEgbmV3IHVuaXF1ZSBtb2RlbCBpZFxuXHRcdE1PREVMX0lEKys7XG5cdFx0dGhpcy5pZCA9ICckbW9kZWwnICsgTU9ERUxfSUQ7XG5cdFx0dGhpcy5pc0ZvclNpbXBsZVdpZGdldCA9IGNyZWF0aW9uT3B0aW9ucy5pc0ZvclNpbXBsZVdpZGdldDtcblx0XHRpZiAodHlwZW9mIGFzc29jaWF0ZWRSZXNvdXJjZSA9PT0gJ3VuZGVmaW5lZCcgfHwgYXNzb2NpYXRlZFJlc291cmNlID09PSBudWxsKSB7XG5cdFx0XHR0aGlzLl9hc3NvY2lhdGVkUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2lubWVtb3J5Oi8vbW9kZWwvJyArIE1PREVMX0lEKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fYXNzb2NpYXRlZFJlc291cmNlID0gYXNzb2NpYXRlZFJlc291cmNlO1xuXHRcdH1cblx0XHR0aGlzLl9hdHRhY2hlZEVkaXRvckNvdW50ID0gMDtcblxuXHRcdGNvbnN0IHsgdGV4dEJ1ZmZlciwgZGlzcG9zYWJsZSB9ID0gY3JlYXRlVGV4dEJ1ZmZlcihzb3VyY2UsIGNyZWF0aW9uT3B0aW9ucy5kZWZhdWx0RU9MKTtcblx0XHR0aGlzLl9idWZmZXIgPSB0ZXh0QnVmZmVyO1xuXHRcdHRoaXMuX2J1ZmZlckRpc3Bvc2FibGUgPSBkaXNwb3NhYmxlO1xuXG5cdFx0Y29uc3QgYnVmZmVyTGluZUNvdW50ID0gdGhpcy5fYnVmZmVyLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGJ1ZmZlclRleHRMZW5ndGggPSB0aGlzLl9idWZmZXIuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCBidWZmZXJMaW5lQ291bnQsIHRoaXMuX2J1ZmZlci5nZXRMaW5lTGVuZ3RoKGJ1ZmZlckxpbmVDb3VudCkgKyAxKSwgbW9kZWwuRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCk7XG5cblx0XHQvLyAhISEgTWFrZSBhIGRlY2lzaW9uIGluIHRoZSBjdG9yIGFuZCBwZXJtYW5lbnRseSByZXNwZWN0IHRoaXMgZGVjaXNpb24gISEhXG5cdFx0Ly8gSWYgYSBtb2RlbCBpcyB0b28gbGFyZ2UgYXQgY29uc3RydWN0aW9uIHRpbWUsIGl0IHdpbGwgbmV2ZXIgZ2V0IHRva2VuaXplZCxcblx0XHQvLyB1bmRlciBubyBjaXJjdW1zdGFuY2VzLlxuXHRcdGlmIChjcmVhdGlvbk9wdGlvbnMubGFyZ2VGaWxlT3B0aW1pemF0aW9ucykge1xuXHRcdFx0dGhpcy5faXNUb29MYXJnZUZvclRva2VuaXphdGlvbiA9IChcblx0XHRcdFx0KGJ1ZmZlclRleHRMZW5ndGggPiBUZXh0TW9kZWwuTEFSR0VfRklMRV9TSVpFX1RIUkVTSE9MRClcblx0XHRcdFx0fHwgKGJ1ZmZlckxpbmVDb3VudCA+IFRleHRNb2RlbC5MQVJHRV9GSUxFX0xJTkVfQ09VTlRfVEhSRVNIT0xEKVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5faXNUb29MYXJnZUZvckhlYXBPcGVyYXRpb24gPSBidWZmZXJUZXh0TGVuZ3RoID4gVGV4dE1vZGVsLkxBUkdFX0ZJTEVfSEVBUF9PUEVSQVRJT05fVEhSRVNIT0xEO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9pc1Rvb0xhcmdlRm9ySGVhcE9wZXJhdGlvbiA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX29wdGlvbnMgPSBUZXh0TW9kZWwucmVzb2x2ZU9wdGlvbnModGhpcy5fYnVmZmVyLCBjcmVhdGlvbk9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICh0eXBlb2YgbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uID09PSAnc3RyaW5nJyA/IGxhbmd1YWdlSWRPclNlbGVjdGlvbiA6IGxhbmd1YWdlSWRPclNlbGVjdGlvbi5sYW5ndWFnZUlkKTtcblx0XHRpZiAodHlwZW9mIGxhbmd1YWdlSWRPclNlbGVjdGlvbiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuX2xhbmd1YWdlU2VsZWN0aW9uTGlzdGVuZXIudmFsdWUgPSBsYW5ndWFnZUlkT3JTZWxlY3Rpb24ub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZE9yU2VsZWN0aW9uLmxhbmd1YWdlSWQpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9icmFja2V0UGFpcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydCh0aGlzLCB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0dGhpcy5fZ3VpZGVzVGV4dE1vZGVsUGFydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBHdWlkZXNUZXh0TW9kZWxQYXJ0KHRoaXMsIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uUHJvdmlkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29sb3JpemVkQnJhY2tldFBhaXJzRGVjb3JhdGlvblByb3ZpZGVyKHRoaXMpKTtcblx0XHR0aGlzLl90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LFxuXHRcdFx0dGhpcyxcblx0XHRcdHRoaXMuX2JyYWNrZXRQYWlycyxcblx0XHRcdGxhbmd1YWdlSWQsXG5cdFx0XHR0aGlzLl9hdHRhY2hlZFZpZXdzXG5cdFx0KTtcblx0XHR0aGlzLl9mb250VG9rZW5EZWNvcmF0aW9uc1Byb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRva2VuaXphdGlvbkZvbnREZWNvcmF0aW9uUHJvdmlkZXIodGhpcywgdGhpcy5fdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydCkpO1xuXG5cdFx0dGhpcy5faXNUb29MYXJnZUZvclN5bmNpbmcgPSAoYnVmZmVyVGV4dExlbmd0aCA+IFRleHRNb2RlbC5fTU9ERUxfU1lOQ19MSU1JVCk7XG5cblx0XHR0aGlzLl92ZXJzaW9uSWQgPSAxO1xuXHRcdHRoaXMuX2FsdGVybmF0aXZlVmVyc2lvbklkID0gMTtcblx0XHR0aGlzLl9pbml0aWFsVW5kb1JlZG9TbmFwc2hvdCA9IG51bGw7XG5cblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fX2lzRGlzcG9zaW5nID0gZmFsc2U7XG5cblx0XHR0aGlzLl9pbnN0YW5jZUlkID0gc3RyaW5ncy5zaW5nbGVMZXR0ZXJIYXNoKE1PREVMX0lEKTtcblx0XHR0aGlzLl9sYXN0RGVjb3JhdGlvbklkID0gMDtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlID0gbmV3IERlY29yYXRpb25zVHJlZXMoKTtcblxuXHRcdHRoaXMuX2NvbW1hbmRNYW5hZ2VyID0gbmV3IEVkaXRTdGFjayh0aGlzLCB0aGlzLl91bmRvUmVkb1NlcnZpY2UpO1xuXHRcdHRoaXMuX2lzVW5kb2luZyA9IGZhbHNlO1xuXHRcdHRoaXMuX2lzUmVkb2luZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3RyaW1BdXRvV2hpdGVzcGFjZUxpbmVzID0gbnVsbDtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuYmVnaW5EZWZlcnJlZEVtaXQoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZmlyZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZm9udFRva2VuRGVjb3JhdGlvbnNQcm92aWRlci5vbkRpZENoYW5nZUxpbmVIZWlnaHQoKGFmZmVjdGVkTGluZUhlaWdodHMpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuYmVnaW5EZWZlcnJlZEVtaXQoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZmlyZSgpO1xuXHRcdFx0dGhpcy5fZmlyZU9uRGlkQ2hhbmdlTGluZUhlaWdodChhZmZlY3RlZExpbmVIZWlnaHRzKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZW5kRGVmZXJyZWRFbWl0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2ZvbnRUb2tlbkRlY29yYXRpb25zUHJvdmlkZXIub25EaWRDaGFuZ2VGb250KChhZmZlY3RlZEZvbnRMaW5lcykgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5maXJlKCk7XG5cdFx0XHR0aGlzLl9maXJlT25EaWRDaGFuZ2VGb250KGFmZmVjdGVkRm9udExpbmVzKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZW5kRGVmZXJyZWRFbWl0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLnJlcXVlc3RSaWNoTGFuZ3VhZ2VGZWF0dXJlcyhsYW5ndWFnZUlkKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLl9icmFja2V0UGFpcnMuaGFuZGxlTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZUNoYW5nZShlKTtcblx0XHRcdHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQuaGFuZGxlTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZUNoYW5nZShlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9faXNEaXNwb3NpbmcgPSB0cnVlO1xuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXHRcdHRoaXMuX3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9idWZmZXJEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9faXNEaXNwb3NpbmcgPSBmYWxzZTtcblx0XHQvLyBNYW51YWxseSByZWxlYXNlIHJlZmVyZW5jZSB0byBwcmV2aW91cyB0ZXh0IGJ1ZmZlciB0byBhdm9pZCBsYXJnZSBsZWFrc1xuXHRcdC8vIGluIGNhc2Ugc29tZW9uZSBsZWFrcyBhIFRleHRNb2RlbCByZWZlcmVuY2Vcblx0XHRjb25zdCBlbXB0eURpc3Bvc2VkVGV4dEJ1ZmZlciA9IG5ldyBQaWVjZVRyZWVUZXh0QnVmZmVyKFtdLCAnJywgJ1xcbicsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0ZW1wdHlEaXNwb3NlZFRleHRCdWZmZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2J1ZmZlciA9IGVtcHR5RGlzcG9zZWRUZXh0QnVmZmVyO1xuXHRcdHRoaXMuX2J1ZmZlckRpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHRfaGFzTGlzdGVuZXJzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmhhc0xpc3RlbmVycygpXG5cdFx0XHR8fCB0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmhhc0xpc3RlbmVycygpXG5cdFx0XHR8fCB0aGlzLl90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0Ll9oYXNMaXN0ZW5lcnMoKVxuXHRcdFx0fHwgdGhpcy5fb25EaWRDaGFuZ2VPcHRpb25zLmhhc0xpc3RlbmVycygpXG5cdFx0XHR8fCB0aGlzLl9vbkRpZENoYW5nZUF0dGFjaGVkLmhhc0xpc3RlbmVycygpXG5cdFx0XHR8fCB0aGlzLl9vbkRpZENoYW5nZUxpbmVIZWlnaHQuaGFzTGlzdGVuZXJzKClcblx0XHRcdHx8IHRoaXMuX29uRGlkQ2hhbmdlRm9udC5oYXNMaXN0ZW5lcnMoKVxuXHRcdFx0fHwgdGhpcy5fZXZlbnRFbWl0dGVyLmhhc0xpc3RlbmVycygpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2Fzc2VydE5vdERpc3Bvc2VkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdNb2RlbCBpcyBkaXNwb3NlZCEnKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJWaWV3TW9kZWwodmlld01vZGVsOiBJVmlld01vZGVsKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld01vZGVscy5hZGQodmlld01vZGVsKTtcblx0fVxuXG5cdHB1YmxpYyB1bnJlZ2lzdGVyVmlld01vZGVsKHZpZXdNb2RlbDogSVZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuX3ZpZXdNb2RlbHMuZGVsZXRlKHZpZXdNb2RlbCk7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzVGV4dEJ1ZmZlcihvdGhlcjogbW9kZWwuSVRleHRCdWZmZXIpOiBib29sZWFuIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZXF1YWxzKG90aGVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUZXh0QnVmZmVyKCk6IG1vZGVsLklUZXh0QnVmZmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXI7XG5cdH1cblxuXHRwcml2YXRlIF9lbWl0Q29udGVudENoYW5nZWRFdmVudChyYXdDaGFuZ2U6IE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudCwgY2hhbmdlOiBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50LCByZXN1bHRpbmdTZWxlY3Rpb246IFNlbGVjdGlvbltdIHwgbnVsbCA9IG51bGwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fX2lzRGlzcG9zaW5nKSB7XG5cdFx0XHQvLyBEbyBub3QgY29uZnVzZSBsaXN0ZW5lcnMgYnkgZW1pdHRpbmcgYW55IGV2ZW50IGFmdGVyIGRpc3Bvc2luZ1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmhhbmRsZURpZENoYW5nZUNvbnRlbnQoY2hhbmdlKTtcblx0XHR0aGlzLl9icmFja2V0UGFpcnMuaGFuZGxlRGlkQ2hhbmdlQ29udGVudChjaGFuZ2UpO1xuXHRcdHRoaXMuX2ZvbnRUb2tlbkRlY29yYXRpb25zUHJvdmlkZXIuaGFuZGxlRGlkQ2hhbmdlQ29udGVudChjaGFuZ2UpO1xuXHRcdGNvbnN0IGNvbnRlbnRDaGFuZ2VFdmVudCA9IG5ldyBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50KHJhd0NoYW5nZSwgY2hhbmdlKTtcblx0XHQvLyBTZXQgcmVzdWx0aW5nU2VsZWN0aW9uIGVhcmx5IHNvIHZpZXdNb2RlbHMgY2FuIHVzZSBpdCBmb3IgY3Vyc29yIHBvc2l0aW9uaW5nXG5cdFx0aWYgKHJlc3VsdGluZ1NlbGVjdGlvbikge1xuXHRcdFx0Y29udGVudENoYW5nZUV2ZW50LnJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQucmVzdWx0aW5nU2VsZWN0aW9uID0gcmVzdWx0aW5nU2VsZWN0aW9uO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRPckluamVjdGVkVGV4dChjb250ZW50Q2hhbmdlRXZlbnQpO1xuXHRcdHRoaXMuX2V2ZW50RW1pdHRlci5maXJlKGNvbnRlbnRDaGFuZ2VFdmVudCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsdWUodmFsdWU6IHN0cmluZyB8IG1vZGVsLklUZXh0U25hcHNob3QsIHJlYXNvbiA9IEVkaXRTb3VyY2VzLnNldFZhbHVlKCkpOiB2b2lkIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXG5cdFx0aWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdGV4dEJ1ZmZlciwgZGlzcG9zYWJsZSB9ID0gY3JlYXRlVGV4dEJ1ZmZlcih2YWx1ZSwgdGhpcy5fb3B0aW9ucy5kZWZhdWx0RU9MKTtcblx0XHR0aGlzLl9zZXRWYWx1ZUZyb21UZXh0QnVmZmVyKHRleHRCdWZmZXIsIGRpc3Bvc2FibGUsIHJlYXNvbik7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDb250ZW50Q2hhbmdlZDIocmFuZ2U6IFJhbmdlLCByYW5nZU9mZnNldDogbnVtYmVyLCByYW5nZUxlbmd0aDogbnVtYmVyLCByYW5nZUVuZFBvc2l0aW9uOiBQb3NpdGlvbiwgdGV4dDogc3RyaW5nLCBpc1VuZG9pbmc6IGJvb2xlYW4sIGlzUmVkb2luZzogYm9vbGVhbiwgaXNGbHVzaDogYm9vbGVhbiwgaXNFb2xDaGFuZ2U6IGJvb2xlYW4sIHJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjaGFuZ2VzOiBbe1xuXHRcdFx0XHRyYW5nZTogcmFuZ2UsXG5cdFx0XHRcdHJhbmdlT2Zmc2V0OiByYW5nZU9mZnNldCxcblx0XHRcdFx0cmFuZ2VMZW5ndGg6IHJhbmdlTGVuZ3RoLFxuXHRcdFx0XHR0ZXh0OiB0ZXh0LFxuXHRcdFx0fV0sXG5cdFx0XHRlb2w6IHRoaXMuX2J1ZmZlci5nZXRFT0woKSxcblx0XHRcdGlzRW9sQ2hhbmdlOiBpc0VvbENoYW5nZSxcblx0XHRcdHZlcnNpb25JZDogdGhpcy5nZXRWZXJzaW9uSWQoKSxcblx0XHRcdGlzVW5kb2luZzogaXNVbmRvaW5nLFxuXHRcdFx0aXNSZWRvaW5nOiBpc1JlZG9pbmcsXG5cdFx0XHRpc0ZsdXNoOiBpc0ZsdXNoLFxuXHRcdFx0ZGV0YWlsZWRSZWFzb25zOiBbcmVhc29uXSxcblx0XHRcdGRldGFpbGVkUmVhc29uc0NoYW5nZUxlbmd0aHM6IFsxXSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VmFsdWVGcm9tVGV4dEJ1ZmZlcih0ZXh0QnVmZmVyOiBtb2RlbC5JVGV4dEJ1ZmZlciwgdGV4dEJ1ZmZlckRpc3Bvc2FibGU6IElEaXNwb3NhYmxlLCByZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2UpOiB2b2lkIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IG9sZEZ1bGxNb2RlbFJhbmdlID0gdGhpcy5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXHRcdGNvbnN0IG9sZE1vZGVsVmFsdWVMZW5ndGggPSB0aGlzLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShvbGRGdWxsTW9kZWxSYW5nZSk7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHRoaXMuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgZW5kQ29sdW1uID0gdGhpcy5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpO1xuXG5cdFx0dGhpcy5fYnVmZmVyID0gdGV4dEJ1ZmZlcjtcblx0XHR0aGlzLl9idWZmZXJEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9idWZmZXJEaXNwb3NhYmxlID0gdGV4dEJ1ZmZlckRpc3Bvc2FibGU7XG5cdFx0dGhpcy5faW5jcmVhc2VWZXJzaW9uSWQoKTtcblxuXHRcdC8vIERlc3Ryb3kgYWxsIG15IGRlY29yYXRpb25zXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZSA9IG5ldyBEZWNvcmF0aW9uc1RyZWVzKCk7XG5cblx0XHQvLyBEZXN0cm95IG15IGVkaXQgaGlzdG9yeSBhbmQgc2V0dGluZ3Ncblx0XHR0aGlzLl9jb21tYW5kTWFuYWdlci5jbGVhcigpO1xuXHRcdHRoaXMuX3RyaW1BdXRvV2hpdGVzcGFjZUxpbmVzID0gbnVsbDtcblxuXHRcdHRoaXMuX2VtaXRDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0bmV3IE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdG5ldyBNb2RlbFJhd0ZsdXNoKClcblx0XHRcdFx0XSxcblx0XHRcdFx0dGhpcy5fdmVyc2lvbklkLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCksXG5cdFx0XHR0aGlzLl9jcmVhdGVDb250ZW50Q2hhbmdlZDIobmV3IFJhbmdlKDEsIDEsIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksIDAsIG9sZE1vZGVsVmFsdWVMZW5ndGgsIG5ldyBQb3NpdGlvbihlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pLCB0aGlzLmdldFZhbHVlKCksIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgZmFsc2UsIHJlYXNvbilcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHNldEVPTChlb2w6IG1vZGVsLkVuZE9mTGluZVNlcXVlbmNlKTogdm9pZCB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRjb25zdCBuZXdFT0wgPSAoZW9sID09PSBtb2RlbC5FbmRPZkxpbmVTZXF1ZW5jZS5DUkxGID8gJ1xcclxcbicgOiAnXFxuJyk7XG5cdFx0aWYgKHRoaXMuX2J1ZmZlci5nZXRFT0woKSA9PT0gbmV3RU9MKSB7XG5cdFx0XHQvLyBOb3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2xkRnVsbE1vZGVsUmFuZ2UgPSB0aGlzLmdldEZ1bGxNb2RlbFJhbmdlKCk7XG5cdFx0Y29uc3Qgb2xkTW9kZWxWYWx1ZUxlbmd0aCA9IHRoaXMuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG9sZEZ1bGxNb2RlbFJhbmdlKTtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gdGhpcy5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSB0aGlzLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcik7XG5cblx0XHR0aGlzLl9vbkJlZm9yZUVPTENoYW5nZSgpO1xuXHRcdHRoaXMuX2J1ZmZlci5zZXRFT0wobmV3RU9MKTtcblx0XHR0aGlzLl9pbmNyZWFzZVZlcnNpb25JZCgpO1xuXHRcdHRoaXMuX29uQWZ0ZXJFT0xDaGFuZ2UoKTtcblxuXHRcdHRoaXMuX2VtaXRDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0bmV3IE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdG5ldyBNb2RlbFJhd0VPTENoYW5nZWQoKVxuXHRcdFx0XHRdLFxuXHRcdFx0XHR0aGlzLl92ZXJzaW9uSWQsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KSxcblx0XHRcdHRoaXMuX2NyZWF0ZUNvbnRlbnRDaGFuZ2VkMihuZXcgUmFuZ2UoMSwgMSwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uKSwgMCwgb2xkTW9kZWxWYWx1ZUxlbmd0aCwgbmV3IFBvc2l0aW9uKGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiksIHRoaXMuZ2V0VmFsdWUoKSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgdHJ1ZSwgRWRpdFNvdXJjZXMuZW9sQ2hhbmdlKCkpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX29uQmVmb3JlRU9MQ2hhbmdlKCk6IHZvaWQge1xuXHRcdC8vIEVuc3VyZSBhbGwgZGVjb3JhdGlvbnMgZ2V0IHRoZWlyIGByYW5nZWAgc2V0LlxuXHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5lbnN1cmVBbGxOb2Rlc0hhdmVSYW5nZXModGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkFmdGVyRU9MQ2hhbmdlKCk6IHZvaWQge1xuXHRcdC8vIFRyYW5zZm9ybSBiYWNrIGByYW5nZWAgdG8gb2Zmc2V0c1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IHRoaXMuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgYWxsRGVjb3JhdGlvbnMgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuY29sbGVjdE5vZGVzUG9zdE9yZGVyKCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGFsbERlY29yYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBub2RlID0gYWxsRGVjb3JhdGlvbnNbaV07XG5cdFx0XHRjb25zdCByYW5nZSA9IG5vZGUucmFuZ2UhOyAvLyB0aGUgcmFuZ2UgaXMgZGVmaW5lZCBkdWUgdG8gYF9vbkJlZm9yZUVPTENoYW5nZWBcblxuXHRcdFx0Y29uc3QgZGVsdGEgPSBub2RlLmNhY2hlZEFic29sdXRlU3RhcnQgLSBub2RlLnN0YXJ0O1xuXG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMuX2J1ZmZlci5nZXRPZmZzZXRBdChyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRcdGNvbnN0IGVuZE9mZnNldCA9IHRoaXMuX2J1ZmZlci5nZXRPZmZzZXRBdChyYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXG5cdFx0XHRub2RlLmNhY2hlZEFic29sdXRlU3RhcnQgPSBzdGFydE9mZnNldDtcblx0XHRcdG5vZGUuY2FjaGVkQWJzb2x1dGVFbmQgPSBlbmRPZmZzZXQ7XG5cdFx0XHRub2RlLmNhY2hlZFZlcnNpb25JZCA9IHZlcnNpb25JZDtcblxuXHRcdFx0bm9kZS5zdGFydCA9IHN0YXJ0T2Zmc2V0IC0gZGVsdGE7XG5cdFx0XHRub2RlLmVuZCA9IGVuZE9mZnNldCAtIGRlbHRhO1xuXG5cdFx0XHRyZWNvbXB1dGVNYXhFbmQobm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG9uQmVmb3JlQXR0YWNoZWQoKTogbW9kZWwuSUF0dGFjaGVkVmlldyB7XG5cdFx0dGhpcy5fYXR0YWNoZWRFZGl0b3JDb3VudCsrO1xuXHRcdGlmICh0aGlzLl9hdHRhY2hlZEVkaXRvckNvdW50ID09PSAxKSB7XG5cdFx0XHR0aGlzLl90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmhhbmRsZURpZENoYW5nZUF0dGFjaGVkKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUF0dGFjaGVkLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGFjaGVkVmlld3MuYXR0YWNoVmlldygpO1xuXHR9XG5cblx0cHVibGljIG9uQmVmb3JlRGV0YWNoZWQodmlldzogbW9kZWwuSUF0dGFjaGVkVmlldyk6IHZvaWQge1xuXHRcdHRoaXMuX2F0dGFjaGVkRWRpdG9yQ291bnQtLTtcblx0XHRpZiAodGhpcy5fYXR0YWNoZWRFZGl0b3JDb3VudCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5oYW5kbGVEaWRDaGFuZ2VBdHRhY2hlZCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBdHRhY2hlZC5maXJlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdHRoaXMuX2F0dGFjaGVkVmlld3MuZGV0YWNoVmlldyh2aWV3KTtcblx0fVxuXG5cdHB1YmxpYyBpc0F0dGFjaGVkVG9FZGl0b3IoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGFjaGVkRWRpdG9yQ291bnQgPiAwO1xuXHR9XG5cblx0cHVibGljIGdldEF0dGFjaGVkRWRpdG9yQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fYXR0YWNoZWRFZGl0b3JDb3VudDtcblx0fVxuXG5cdHB1YmxpYyBpc1Rvb0xhcmdlRm9yU3luY2luZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNUb29MYXJnZUZvclN5bmNpbmc7XG5cdH1cblxuXHRwdWJsaWMgaXNUb29MYXJnZUZvclRva2VuaXphdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNUb29MYXJnZUZvclRva2VuaXphdGlvbjtcblx0fVxuXG5cdHB1YmxpYyBpc1Rvb0xhcmdlRm9ySGVhcE9wZXJhdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNUb29MYXJnZUZvckhlYXBPcGVyYXRpb247XG5cdH1cblxuXHRwdWJsaWMgaXNEaXNwb3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNEaXNwb3NlZDtcblx0fVxuXG5cdHB1YmxpYyBpc0RvbWluYXRlZEJ5TG9uZ0xpbmVzKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0aWYgKHRoaXMuaXNUb29MYXJnZUZvclRva2VuaXphdGlvbigpKSB7XG5cdFx0XHQvLyBDYW5ub3Qgd29yZCB3cmFwIGh1Z2UgZmlsZXMgYW55d2F5cywgc28gaXQgZG9lc24ndCByZWFsbHkgbWF0dGVyXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCBzbWFsbExpbmVDaGFyQ291bnQgPSAwO1xuXHRcdGxldCBsb25nTGluZUNoYXJDb3VudCA9IDA7XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLl9idWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IDE7IGxpbmVOdW1iZXIgPD0gbGluZUNvdW50OyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmVMZW5ndGggPSB0aGlzLl9idWZmZXIuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKTtcblx0XHRcdGlmIChsaW5lTGVuZ3RoID49IExPTkdfTElORV9CT1VOREFSWSkge1xuXHRcdFx0XHRsb25nTGluZUNoYXJDb3VudCArPSBsaW5lTGVuZ3RoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c21hbGxMaW5lQ2hhckNvdW50ICs9IGxpbmVMZW5ndGg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIChsb25nTGluZUNoYXJDb3VudCA+IHNtYWxsTGluZUNoYXJDb3VudCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHVyaSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl9hc3NvY2lhdGVkUmVzb3VyY2U7XG5cdH1cblxuXHQvLyNyZWdpb24gT3B0aW9uc1xuXG5cdHB1YmxpYyBnZXRPcHRpb25zKCk6IG1vZGVsLlRleHRNb2RlbFJlc29sdmVkT3B0aW9ucyB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucztcblx0fVxuXG5cdHB1YmxpYyBnZXRGb3JtYXR0aW5nT3B0aW9ucygpOiBGb3JtYXR0aW5nT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRhYlNpemU6IHRoaXMuX29wdGlvbnMuaW5kZW50U2l6ZSxcblx0XHRcdGluc2VydFNwYWNlczogdGhpcy5fb3B0aW9ucy5pbnNlcnRTcGFjZXNcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZU9wdGlvbnMoX25ld09wdHM6IG1vZGVsLklUZXh0TW9kZWxVcGRhdGVPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRjb25zdCB0YWJTaXplID0gKHR5cGVvZiBfbmV3T3B0cy50YWJTaXplICE9PSAndW5kZWZpbmVkJykgPyBfbmV3T3B0cy50YWJTaXplIDogdGhpcy5fb3B0aW9ucy50YWJTaXplO1xuXHRcdGNvbnN0IGluZGVudFNpemUgPSAodHlwZW9mIF9uZXdPcHRzLmluZGVudFNpemUgIT09ICd1bmRlZmluZWQnKSA/IF9uZXdPcHRzLmluZGVudFNpemUgOiB0aGlzLl9vcHRpb25zLm9yaWdpbmFsSW5kZW50U2l6ZTtcblx0XHRjb25zdCBpbnNlcnRTcGFjZXMgPSAodHlwZW9mIF9uZXdPcHRzLmluc2VydFNwYWNlcyAhPT0gJ3VuZGVmaW5lZCcpID8gX25ld09wdHMuaW5zZXJ0U3BhY2VzIDogdGhpcy5fb3B0aW9ucy5pbnNlcnRTcGFjZXM7XG5cdFx0Y29uc3QgdHJpbUF1dG9XaGl0ZXNwYWNlID0gKHR5cGVvZiBfbmV3T3B0cy50cmltQXV0b1doaXRlc3BhY2UgIT09ICd1bmRlZmluZWQnKSA/IF9uZXdPcHRzLnRyaW1BdXRvV2hpdGVzcGFjZSA6IHRoaXMuX29wdGlvbnMudHJpbUF1dG9XaGl0ZXNwYWNlO1xuXHRcdGNvbnN0IGJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucyA9ICh0eXBlb2YgX25ld09wdHMuYnJhY2tldENvbG9yaXphdGlvbk9wdGlvbnMgIT09ICd1bmRlZmluZWQnKSA/IF9uZXdPcHRzLmJyYWNrZXRDb2xvcml6YXRpb25PcHRpb25zIDogdGhpcy5fb3B0aW9ucy5icmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnM7XG5cblx0XHRjb25zdCBuZXdPcHRzID0gbmV3IG1vZGVsLlRleHRNb2RlbFJlc29sdmVkT3B0aW9ucyh7XG5cdFx0XHR0YWJTaXplOiB0YWJTaXplLFxuXHRcdFx0aW5kZW50U2l6ZTogaW5kZW50U2l6ZSxcblx0XHRcdGluc2VydFNwYWNlczogaW5zZXJ0U3BhY2VzLFxuXHRcdFx0ZGVmYXVsdEVPTDogdGhpcy5fb3B0aW9ucy5kZWZhdWx0RU9MLFxuXHRcdFx0dHJpbUF1dG9XaGl0ZXNwYWNlOiB0cmltQXV0b1doaXRlc3BhY2UsXG5cdFx0XHRicmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnMsXG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy5lcXVhbHMobmV3T3B0cykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlID0gdGhpcy5fb3B0aW9ucy5jcmVhdGVDaGFuZ2VFdmVudChuZXdPcHRzKTtcblx0XHR0aGlzLl9vcHRpb25zID0gbmV3T3B0cztcblxuXHRcdHRoaXMuX2JyYWNrZXRQYWlycy5oYW5kbGVEaWRDaGFuZ2VPcHRpb25zKGUpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25Qcm92aWRlci5oYW5kbGVEaWRDaGFuZ2VPcHRpb25zKGUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlT3B0aW9ucy5maXJlKGUpO1xuXHR9XG5cblx0cHVibGljIGRldGVjdEluZGVudGF0aW9uKGRlZmF1bHRJbnNlcnRTcGFjZXM6IGJvb2xlYW4sIGRlZmF1bHRUYWJTaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IGd1ZXNzZWRJbmRlbnRhdGlvbiA9IGd1ZXNzSW5kZW50YXRpb24odGhpcy5fYnVmZmVyLCBkZWZhdWx0VGFiU2l6ZSwgZGVmYXVsdEluc2VydFNwYWNlcyk7XG5cdFx0dGhpcy51cGRhdGVPcHRpb25zKHtcblx0XHRcdGluc2VydFNwYWNlczogZ3Vlc3NlZEluZGVudGF0aW9uLmluc2VydFNwYWNlcyxcblx0XHRcdHRhYlNpemU6IGd1ZXNzZWRJbmRlbnRhdGlvbi50YWJTaXplLFxuXHRcdFx0aW5kZW50U2l6ZTogZ3Vlc3NlZEluZGVudGF0aW9uLnRhYlNpemUsIC8vIFRPRE9AQWxleDogZ3Vlc3MgaW5kZW50U2l6ZSBpbmRlcGVuZGVudCBvZiB0YWJTaXplXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgbm9ybWFsaXplSW5kZW50YXRpb24oc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIG5vcm1hbGl6ZUluZGVudGF0aW9uKHN0ciwgdGhpcy5fb3B0aW9ucy5pbmRlbnRTaXplLCB0aGlzLl9vcHRpb25zLmluc2VydFNwYWNlcyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gUmVhZGluZ1xuXG5cdHB1YmxpYyBnZXRWZXJzaW9uSWQoKTogbnVtYmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl92ZXJzaW9uSWQ7XG5cdH1cblxuXHRwdWJsaWMgbWlnaHRDb250YWluUlRMKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIubWlnaHRDb250YWluUlRMKCk7XG5cdH1cblxuXHRwdWJsaWMgbWlnaHRDb250YWluVW51c3VhbExpbmVUZXJtaW5hdG9ycygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLm1pZ2h0Q29udGFpblVudXN1YWxMaW5lVGVybWluYXRvcnMoKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVVbnVzdWFsTGluZVRlcm1pbmF0b3JzKHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdIHwgbnVsbCA9IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCBtYXRjaGVzID0gdGhpcy5maW5kTWF0Y2hlcyhzdHJpbmdzLlVOVVNVQUxfTElORV9URVJNSU5BVE9SUy5zb3VyY2UsIGZhbHNlLCB0cnVlLCBmYWxzZSwgbnVsbCwgZmFsc2UsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSKTtcblx0XHR0aGlzLl9idWZmZXIucmVzZXRNaWdodENvbnRhaW5VbnVzdWFsTGluZVRlcm1pbmF0b3JzKCk7XG5cdFx0dGhpcy5wdXNoRWRpdE9wZXJhdGlvbnMoc2VsZWN0aW9ucywgbWF0Y2hlcy5tYXAobSA9PiAoeyByYW5nZTogbS5yYW5nZSwgdGV4dDogbnVsbCB9KSksICgpID0+IG51bGwpO1xuXHR9XG5cblx0cHVibGljIG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKTogbnVtYmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9hbHRlcm5hdGl2ZVZlcnNpb25JZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbml0aWFsVW5kb1JlZG9TbmFwc2hvdCgpOiBSZXNvdXJjZUVkaXRTdGFja1NuYXBzaG90IHwgbnVsbCB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5faW5pdGlhbFVuZG9SZWRvU25hcHNob3Q7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T2Zmc2V0QXQocmF3UG9zaXRpb246IElQb3NpdGlvbik6IG51bWJlciB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX3ZhbGlkYXRlUG9zaXRpb24ocmF3UG9zaXRpb24ubGluZU51bWJlciwgcmF3UG9zaXRpb24uY29sdW1uLCBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZS5SZWxheGVkKTtcblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldE9mZnNldEF0KHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UG9zaXRpb25BdChyYXdPZmZzZXQ6IG51bWJlcik6IFBvc2l0aW9uIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IG9mZnNldCA9IChNYXRoLm1pbih0aGlzLl9idWZmZXIuZ2V0TGVuZ3RoKCksIE1hdGgubWF4KDAsIHJhd09mZnNldCkpKTtcblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldFBvc2l0aW9uQXQob2Zmc2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX2luY3JlYXNlVmVyc2lvbklkKCk6IHZvaWQge1xuXHRcdHRoaXMuX3ZlcnNpb25JZCA9IHRoaXMuX3ZlcnNpb25JZCArIDE7XG5cdFx0dGhpcy5fYWx0ZXJuYXRpdmVWZXJzaW9uSWQgPSB0aGlzLl92ZXJzaW9uSWQ7XG5cdH1cblxuXHRwdWJsaWMgX292ZXJ3cml0ZVZlcnNpb25JZCh2ZXJzaW9uSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3ZlcnNpb25JZCA9IHZlcnNpb25JZDtcblx0fVxuXG5cdHB1YmxpYyBfb3ZlcndyaXRlQWx0ZXJuYXRpdmVWZXJzaW9uSWQobmV3QWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2FsdGVybmF0aXZlVmVyc2lvbklkID0gbmV3QWx0ZXJuYXRpdmVWZXJzaW9uSWQ7XG5cdH1cblxuXHRwdWJsaWMgX292ZXJ3cml0ZUluaXRpYWxVbmRvUmVkb1NuYXBzaG90KG5ld0luaXRpYWxVbmRvUmVkb1NuYXBzaG90OiBSZXNvdXJjZUVkaXRTdGFja1NuYXBzaG90IHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuX2luaXRpYWxVbmRvUmVkb1NuYXBzaG90ID0gbmV3SW5pdGlhbFVuZG9SZWRvU25hcHNob3Q7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWUoZW9sPzogbW9kZWwuRW5kT2ZMaW5lUHJlZmVyZW5jZSwgcHJlc2VydmVCT006IGJvb2xlYW4gPSBmYWxzZSk6IHN0cmluZyB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRpZiAodGhpcy5pc1Rvb0xhcmdlRm9ySGVhcE9wZXJhdGlvbigpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdPcGVyYXRpb24gd291bGQgZXhjZWVkIGhlYXAgbWVtb3J5IGxpbWl0cycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZ1bGxNb2RlbFJhbmdlID0gdGhpcy5nZXRGdWxsTW9kZWxSYW5nZSgpO1xuXHRcdGNvbnN0IGZ1bGxNb2RlbFZhbHVlID0gdGhpcy5nZXRWYWx1ZUluUmFuZ2UoZnVsbE1vZGVsUmFuZ2UsIGVvbCk7XG5cblx0XHRpZiAocHJlc2VydmVCT00pIHtcblx0XHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0Qk9NKCkgKyBmdWxsTW9kZWxWYWx1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZnVsbE1vZGVsVmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU25hcHNob3QocHJlc2VydmVCT006IGJvb2xlYW4gPSBmYWxzZSk6IG1vZGVsLklUZXh0U25hcHNob3Qge1xuXHRcdHJldHVybiBuZXcgVGV4dE1vZGVsU25hcHNob3QodGhpcy5fYnVmZmVyLmNyZWF0ZVNuYXBzaG90KHByZXNlcnZlQk9NKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWVMZW5ndGgoZW9sPzogbW9kZWwuRW5kT2ZMaW5lUHJlZmVyZW5jZSwgcHJlc2VydmVCT006IGJvb2xlYW4gPSBmYWxzZSk6IG51bWJlciB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRjb25zdCBmdWxsTW9kZWxSYW5nZSA9IHRoaXMuZ2V0RnVsbE1vZGVsUmFuZ2UoKTtcblx0XHRjb25zdCBmdWxsTW9kZWxWYWx1ZSA9IHRoaXMuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKGZ1bGxNb2RlbFJhbmdlLCBlb2wpO1xuXG5cdFx0aWYgKHByZXNlcnZlQk9NKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldEJPTSgpLmxlbmd0aCArIGZ1bGxNb2RlbFZhbHVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmdWxsTW9kZWxWYWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWYWx1ZUluUmFuZ2UocmF3UmFuZ2U6IElSYW5nZSwgZW9sOiBtb2RlbC5FbmRPZkxpbmVQcmVmZXJlbmNlID0gbW9kZWwuRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldFZhbHVlSW5SYW5nZSh0aGlzLnZhbGlkYXRlUmFuZ2UocmF3UmFuZ2UpLCBlb2wpO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlTGVuZ3RoSW5SYW5nZShyYXdSYW5nZTogSVJhbmdlLCBlb2w6IG1vZGVsLkVuZE9mTGluZVByZWZlcmVuY2UgPSBtb2RlbC5FbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKTogbnVtYmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHRoaXMudmFsaWRhdGVSYW5nZShyYXdSYW5nZSksIGVvbCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q2hhcmFjdGVyQ291bnRJblJhbmdlKHJhd1JhbmdlOiBJUmFuZ2UsIGVvbDogbW9kZWwuRW5kT2ZMaW5lUHJlZmVyZW5jZSA9IG1vZGVsLkVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpOiBudW1iZXIge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRDaGFyYWN0ZXJDb3VudEluUmFuZ2UodGhpcy52YWxpZGF0ZVJhbmdlKHJhd1JhbmdlKSwgZW9sKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGlmIChsaW5lTnVtYmVyIDwgMSB8fCBsaW5lTnVtYmVyID4gdGhpcy5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignSWxsZWdhbCB2YWx1ZSBmb3IgbGluZU51bWJlcicpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPCAxIHx8IGxpbmVOdW1iZXIgPiB0aGlzLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdJbGxlZ2FsIHZhbHVlIGZvciBsaW5lTnVtYmVyJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVzQ29udGVudCgpOiBzdHJpbmdbXSB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRpZiAodGhpcy5pc1Rvb0xhcmdlRm9ySGVhcE9wZXJhdGlvbigpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdPcGVyYXRpb24gd291bGQgZXhjZWVkIGhlYXAgbWVtb3J5IGxpbWl0cycpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0TGluZXNDb250ZW50KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RU9MKCk6IHN0cmluZyB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldEVPTCgpO1xuXHR9XG5cblx0cHVibGljIGdldEVuZE9mTGluZVNlcXVlbmNlKCk6IG1vZGVsLkVuZE9mTGluZVNlcXVlbmNlIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLl9idWZmZXIuZ2V0RU9MKCkgPT09ICdcXG4nXG5cdFx0XHRcdD8gbW9kZWwuRW5kT2ZMaW5lU2VxdWVuY2UuTEZcblx0XHRcdFx0OiBtb2RlbC5FbmRPZkxpbmVTZXF1ZW5jZS5DUkxGXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTWluQ29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRyZXR1cm4gMTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRpZiAobGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IHRoaXMuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0lsbGVnYWwgdmFsdWUgZm9yIGxpbmVOdW1iZXInKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpICsgMTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRpZiAobGluZU51bWJlciA8IDEgfHwgbGluZU51bWJlciA+IHRoaXMuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0lsbGVnYWwgdmFsdWUgZm9yIGxpbmVOdW1iZXInKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPCAxIHx8IGxpbmVOdW1iZXIgPiB0aGlzLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdJbGxlZ2FsIHZhbHVlIGZvciBsaW5lTnVtYmVyJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFZhbGlkYXRlcyBgcmFuZ2VgIGlzIHdpdGhpbiBidWZmZXIgYm91bmRzLCBidXQgYWxsb3dzIGl0IHRvIHNpdCBpbiBiZXR3ZWVuIHN1cnJvZ2F0ZSBwYWlycywgZXRjLlxuXHQgKiBXaWxsIHRyeSB0byBub3QgYWxsb2NhdGUgaWYgcG9zc2libGUuXG5cdCAqL1xuXHRwdWJsaWMgX3ZhbGlkYXRlUmFuZ2VSZWxheGVkTm9BbGxvY2F0aW9ucyhyYW5nZTogSVJhbmdlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IGxpbmVzQ291bnQgPSB0aGlzLl9idWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cblx0XHRjb25zdCBpbml0aWFsU3RhcnRMaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGluaXRpYWxTdGFydENvbHVtbiA9IHJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdGxldCBzdGFydExpbmVOdW1iZXIgPSBNYXRoLmZsb29yKCh0eXBlb2YgaW5pdGlhbFN0YXJ0TGluZU51bWJlciA9PT0gJ251bWJlcicgJiYgIWlzTmFOKGluaXRpYWxTdGFydExpbmVOdW1iZXIpKSA/IGluaXRpYWxTdGFydExpbmVOdW1iZXIgOiAxKTtcblx0XHRsZXQgc3RhcnRDb2x1bW4gPSBNYXRoLmZsb29yKCh0eXBlb2YgaW5pdGlhbFN0YXJ0Q29sdW1uID09PSAnbnVtYmVyJyAmJiAhaXNOYU4oaW5pdGlhbFN0YXJ0Q29sdW1uKSkgPyBpbml0aWFsU3RhcnRDb2x1bW4gOiAxKTtcblxuXHRcdGlmIChzdGFydExpbmVOdW1iZXIgPCAxKSB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXIgPSAxO1xuXHRcdFx0c3RhcnRDb2x1bW4gPSAxO1xuXHRcdH0gZWxzZSBpZiAoc3RhcnRMaW5lTnVtYmVyID4gbGluZXNDb3VudCkge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gbGluZXNDb3VudDtcblx0XHRcdHN0YXJ0Q29sdW1uID0gdGhpcy5nZXRMaW5lTWF4Q29sdW1uKHN0YXJ0TGluZU51bWJlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChzdGFydENvbHVtbiA8PSAxKSB7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uID0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1heENvbHVtbiA9IHRoaXMuZ2V0TGluZU1heENvbHVtbihzdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRpZiAoc3RhcnRDb2x1bW4gPj0gbWF4Q29sdW1uKSB7XG5cdFx0XHRcdFx0c3RhcnRDb2x1bW4gPSBtYXhDb2x1bW47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbml0aWFsRW5kTGluZU51bWJlciA9IHJhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgaW5pdGlhbEVuZENvbHVtbiA9IHJhbmdlLmVuZENvbHVtbjtcblx0XHRsZXQgZW5kTGluZU51bWJlciA9IE1hdGguZmxvb3IoKHR5cGVvZiBpbml0aWFsRW5kTGluZU51bWJlciA9PT0gJ251bWJlcicgJiYgIWlzTmFOKGluaXRpYWxFbmRMaW5lTnVtYmVyKSkgPyBpbml0aWFsRW5kTGluZU51bWJlciA6IDEpO1xuXHRcdGxldCBlbmRDb2x1bW4gPSBNYXRoLmZsb29yKCh0eXBlb2YgaW5pdGlhbEVuZENvbHVtbiA9PT0gJ251bWJlcicgJiYgIWlzTmFOKGluaXRpYWxFbmRDb2x1bW4pKSA/IGluaXRpYWxFbmRDb2x1bW4gOiAxKTtcblxuXHRcdGlmIChlbmRMaW5lTnVtYmVyIDwgMSkge1xuXHRcdFx0ZW5kTGluZU51bWJlciA9IDE7XG5cdFx0XHRlbmRDb2x1bW4gPSAxO1xuXHRcdH0gZWxzZSBpZiAoZW5kTGluZU51bWJlciA+IGxpbmVzQ291bnQpIHtcblx0XHRcdGVuZExpbmVOdW1iZXIgPSBsaW5lc0NvdW50O1xuXHRcdFx0ZW5kQ29sdW1uID0gdGhpcy5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoZW5kQ29sdW1uIDw9IDEpIHtcblx0XHRcdFx0ZW5kQ29sdW1uID0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1heENvbHVtbiA9IHRoaXMuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKTtcblx0XHRcdFx0aWYgKGVuZENvbHVtbiA+PSBtYXhDb2x1bW4pIHtcblx0XHRcdFx0XHRlbmRDb2x1bW4gPSBtYXhDb2x1bW47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHRpbml0aWFsU3RhcnRMaW5lTnVtYmVyID09PSBzdGFydExpbmVOdW1iZXJcblx0XHRcdCYmIGluaXRpYWxTdGFydENvbHVtbiA9PT0gc3RhcnRDb2x1bW5cblx0XHRcdCYmIGluaXRpYWxFbmRMaW5lTnVtYmVyID09PSBlbmRMaW5lTnVtYmVyXG5cdFx0XHQmJiBpbml0aWFsRW5kQ29sdW1uID09PSBlbmRDb2x1bW5cblx0XHRcdCYmIHJhbmdlIGluc3RhbmNlb2YgUmFuZ2Vcblx0XHRcdCYmICEocmFuZ2UgaW5zdGFuY2VvZiBTZWxlY3Rpb24pXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gcmFuZ2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNWYWxpZFBvc2l0aW9uKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIHZhbGlkYXRpb25UeXBlOiBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgbGluZU51bWJlciAhPT0gJ251bWJlcicgfHwgdHlwZW9mIGNvbHVtbiAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaXNOYU4obGluZU51bWJlcikgfHwgaXNOYU4oY29sdW1uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lTnVtYmVyIDwgMSB8fCBjb2x1bW4gPCAxKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKChsaW5lTnVtYmVyIHwgMCkgIT09IGxpbmVOdW1iZXIgfHwgKGNvbHVtbiB8IDApICE9PSBjb2x1bW4pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLl9idWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPiBsaW5lQ291bnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoY29sdW1uID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBtYXhDb2x1bW4gPSB0aGlzLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0aWYgKGNvbHVtbiA+IG1heENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh2YWxpZGF0aW9uVHlwZSA9PT0gU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUuU3Vycm9nYXRlUGFpcnMpIHtcblx0XHRcdC8vICEhQXQgdGhpcyBwb2ludCwgY29sdW1uID4gMVxuXHRcdFx0Y29uc3QgY2hhckNvZGVCZWZvcmUgPSB0aGlzLl9idWZmZXIuZ2V0TGluZUNoYXJDb2RlKGxpbmVOdW1iZXIsIGNvbHVtbiAtIDIpO1xuXHRcdFx0aWYgKHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlQmVmb3JlKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF92YWxpZGF0ZVBvc2l0aW9uKF9saW5lTnVtYmVyOiBudW1iZXIsIF9jb2x1bW46IG51bWJlciwgdmFsaWRhdGlvblR5cGU6IFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlKTogUG9zaXRpb24ge1xuXHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBNYXRoLmZsb29yKCh0eXBlb2YgX2xpbmVOdW1iZXIgPT09ICdudW1iZXInICYmICFpc05hTihfbGluZU51bWJlcikpID8gX2xpbmVOdW1iZXIgOiAxKTtcblx0XHRjb25zdCBjb2x1bW4gPSBNYXRoLmZsb29yKCh0eXBlb2YgX2NvbHVtbiA9PT0gJ251bWJlcicgJiYgIWlzTmFOKF9jb2x1bW4pKSA/IF9jb2x1bW4gOiAxKTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLl9idWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cblx0XHRpZiAobGluZU51bWJlciA8IDEpIHtcblx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24oMSwgMSk7XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmVOdW1iZXIgPiBsaW5lQ291bnQpIHtcblx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZUNvdW50LCB0aGlzLmdldExpbmVNYXhDb2x1bW4obGluZUNvdW50KSk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbHVtbiA8PSAxKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1heENvbHVtbiA9IHRoaXMuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKTtcblx0XHRpZiAoY29sdW1uID49IG1heENvbHVtbikge1xuXHRcdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBtYXhDb2x1bW4pO1xuXHRcdH1cblxuXHRcdGlmICh2YWxpZGF0aW9uVHlwZSA9PT0gU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUuU3Vycm9nYXRlUGFpcnMpIHtcblx0XHRcdC8vIElmIHRoZSBwb3NpdGlvbiB3b3VsZCBlbmQgdXAgaW4gdGhlIG1pZGRsZSBvZiBhIGhpZ2gtbG93IHN1cnJvZ2F0ZSBwYWlyLFxuXHRcdFx0Ly8gd2UgbW92ZSBpdCB0byBiZWZvcmUgdGhlIHBhaXJcblx0XHRcdC8vICEhQXQgdGhpcyBwb2ludCwgY29sdW1uID4gMVxuXHRcdFx0Y29uc3QgY2hhckNvZGVCZWZvcmUgPSB0aGlzLl9idWZmZXIuZ2V0TGluZUNoYXJDb2RlKGxpbmVOdW1iZXIsIGNvbHVtbiAtIDIpO1xuXHRcdFx0aWYgKHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlQmVmb3JlKSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbiAtIDEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZVBvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24pOiBQb3NpdGlvbiB7XG5cdFx0Y29uc3QgdmFsaWRhdGlvblR5cGUgPSBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZS5TdXJyb2dhdGVQYWlycztcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXG5cdFx0Ly8gQXZvaWQgb2JqZWN0IGFsbG9jYXRpb24gYW5kIGNvdmVyIG1vc3QgbGlrZWx5IGNhc2Vcblx0XHRpZiAocG9zaXRpb24gaW5zdGFuY2VvZiBQb3NpdGlvbikge1xuXHRcdFx0aWYgKHRoaXMuX2lzVmFsaWRQb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHZhbGlkYXRpb25UeXBlKSkge1xuXHRcdFx0XHRyZXR1cm4gcG9zaXRpb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3ZhbGlkYXRlUG9zaXRpb24ocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCB2YWxpZGF0aW9uVHlwZSk7XG5cdH1cblxuXHRwdWJsaWMgaXNWYWxpZFJhbmdlKHJhbmdlOiBSYW5nZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1ZhbGlkUmFuZ2UocmFuZ2UsIFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlLlN1cnJvZ2F0ZVBhaXJzKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzVmFsaWRSYW5nZShyYW5nZTogUmFuZ2UsIHZhbGlkYXRpb25UeXBlOiBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBzdGFydENvbHVtbiA9IHJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSByYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IHJhbmdlLmVuZENvbHVtbjtcblxuXHRcdGlmICghdGhpcy5faXNWYWxpZFBvc2l0aW9uKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlLlJlbGF4ZWQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNWYWxpZFBvc2l0aW9uKGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiwgU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUuUmVsYXhlZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodmFsaWRhdGlvblR5cGUgPT09IFN0cmluZ09mZnNldFZhbGlkYXRpb25UeXBlLlN1cnJvZ2F0ZVBhaXJzKSB7XG5cdFx0XHRjb25zdCBjaGFyQ29kZUJlZm9yZVN0YXJ0ID0gKHN0YXJ0Q29sdW1uID4gMSA/IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ2hhckNvZGUoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiAtIDIpIDogMCk7XG5cdFx0XHRjb25zdCBjaGFyQ29kZUJlZm9yZUVuZCA9IChlbmRDb2x1bW4gPiAxICYmIGVuZENvbHVtbiA8PSB0aGlzLl9idWZmZXIuZ2V0TGluZUxlbmd0aChlbmRMaW5lTnVtYmVyKSA/IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ2hhckNvZGUoZW5kTGluZU51bWJlciwgZW5kQ29sdW1uIC0gMikgOiAwKTtcblxuXHRcdFx0Y29uc3Qgc3RhcnRJbnNpZGVTdXJyb2dhdGVQYWlyID0gc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGVCZWZvcmVTdGFydCk7XG5cdFx0XHRjb25zdCBlbmRJbnNpZGVTdXJyb2dhdGVQYWlyID0gc3RyaW5ncy5pc0hpZ2hTdXJyb2dhdGUoY2hhckNvZGVCZWZvcmVFbmQpO1xuXG5cdFx0XHRpZiAoIXN0YXJ0SW5zaWRlU3Vycm9nYXRlUGFpciAmJiAhZW5kSW5zaWRlU3Vycm9nYXRlUGFpcikge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZVJhbmdlKF9yYW5nZTogSVJhbmdlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IHZhbGlkYXRpb25UeXBlID0gU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUuU3Vycm9nYXRlUGFpcnM7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblxuXHRcdC8vIEF2b2lkIG9iamVjdCBhbGxvY2F0aW9uIGFuZCBjb3ZlciBtb3N0IGxpa2VseSBjYXNlXG5cdFx0aWYgKChfcmFuZ2UgaW5zdGFuY2VvZiBSYW5nZSkgJiYgIShfcmFuZ2UgaW5zdGFuY2VvZiBTZWxlY3Rpb24pKSB7XG5cdFx0XHRpZiAodGhpcy5faXNWYWxpZFJhbmdlKF9yYW5nZSwgdmFsaWRhdGlvblR5cGUpKSB7XG5cdFx0XHRcdHJldHVybiBfcmFuZ2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnQgPSB0aGlzLl92YWxpZGF0ZVBvc2l0aW9uKF9yYW5nZS5zdGFydExpbmVOdW1iZXIsIF9yYW5nZS5zdGFydENvbHVtbiwgU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUuUmVsYXhlZCk7XG5cdFx0Y29uc3QgZW5kID0gdGhpcy5fdmFsaWRhdGVQb3NpdGlvbihfcmFuZ2UuZW5kTGluZU51bWJlciwgX3JhbmdlLmVuZENvbHVtbiwgU3RyaW5nT2Zmc2V0VmFsaWRhdGlvblR5cGUuUmVsYXhlZCk7XG5cblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXIgPSBzdGFydC5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gc3RhcnQuY29sdW1uO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBlbmQubGluZU51bWJlcjtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSBlbmQuY29sdW1uO1xuXG5cdFx0aWYgKHZhbGlkYXRpb25UeXBlID09PSBTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZS5TdXJyb2dhdGVQYWlycykge1xuXHRcdFx0Y29uc3QgY2hhckNvZGVCZWZvcmVTdGFydCA9IChzdGFydENvbHVtbiA+IDEgPyB0aGlzLl9idWZmZXIuZ2V0TGluZUNoYXJDb2RlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4gLSAyKSA6IDApO1xuXHRcdFx0Y29uc3QgY2hhckNvZGVCZWZvcmVFbmQgPSAoZW5kQ29sdW1uID4gMSAmJiBlbmRDb2x1bW4gPD0gdGhpcy5fYnVmZmVyLmdldExpbmVMZW5ndGgoZW5kTGluZU51bWJlcikgPyB0aGlzLl9idWZmZXIuZ2V0TGluZUNoYXJDb2RlKGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbiAtIDIpIDogMCk7XG5cblx0XHRcdGNvbnN0IHN0YXJ0SW5zaWRlU3Vycm9nYXRlUGFpciA9IHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlQmVmb3JlU3RhcnQpO1xuXHRcdFx0Y29uc3QgZW5kSW5zaWRlU3Vycm9nYXRlUGFpciA9IHN0cmluZ3MuaXNIaWdoU3Vycm9nYXRlKGNoYXJDb2RlQmVmb3JlRW5kKTtcblxuXHRcdFx0aWYgKCFzdGFydEluc2lkZVN1cnJvZ2F0ZVBhaXIgJiYgIWVuZEluc2lkZVN1cnJvZ2F0ZVBhaXIpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyID09PSBlbmRMaW5lTnVtYmVyICYmIHN0YXJ0Q29sdW1uID09PSBlbmRDb2x1bW4pIHtcblx0XHRcdFx0Ly8gZG8gbm90IGV4cGFuZCBhIGNvbGxhcHNlZCByYW5nZSwgc2ltcGx5IG1vdmUgaXQgdG8gYSB2YWxpZCBsb2NhdGlvblxuXHRcdFx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4gLSAxLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4gLSAxKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXJ0SW5zaWRlU3Vycm9nYXRlUGFpciAmJiBlbmRJbnNpZGVTdXJyb2dhdGVQYWlyKSB7XG5cdFx0XHRcdC8vIGV4cGFuZCByYW5nZSBhdCBib3RoIGVuZHNcblx0XHRcdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uIC0gMSwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uICsgMSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGFydEluc2lkZVN1cnJvZ2F0ZVBhaXIpIHtcblx0XHRcdFx0Ly8gb25seSBleHBhbmQgcmFuZ2UgYXQgdGhlIHN0YXJ0XG5cdFx0XHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiAtIDEsIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG9ubHkgZXhwYW5kIHJhbmdlIGF0IHRoZSBlbmRcblx0XHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uICsgMSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHR9XG5cblx0cHVibGljIG1vZGlmeVBvc2l0aW9uKHJhd1Bvc2l0aW9uOiBJUG9zaXRpb24sIG9mZnNldDogbnVtYmVyKTogUG9zaXRpb24ge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gdGhpcy5nZXRPZmZzZXRBdChyYXdQb3NpdGlvbikgKyBvZmZzZXQ7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UG9zaXRpb25BdChNYXRoLm1pbih0aGlzLl9idWZmZXIuZ2V0TGVuZ3RoKCksIE1hdGgubWF4KDAsIGNhbmRpZGF0ZSkpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGdWxsTW9kZWxSYW5nZSgpOiBSYW5nZSB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLmdldExpbmVDb3VudCgpO1xuXHRcdHJldHVybiBuZXcgUmFuZ2UoMSwgMSwgbGluZUNvdW50LCB0aGlzLmdldExpbmVNYXhDb2x1bW4obGluZUNvdW50KSk7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRNYXRjaGVzTGluZUJ5TGluZShzZWFyY2hSYW5nZTogUmFuZ2UsIHNlYXJjaERhdGE6IG1vZGVsLlNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuLCBsaW1pdFJlc3VsdENvdW50OiBudW1iZXIpOiBtb2RlbC5GaW5kTWF0Y2hbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1ZmZlci5maW5kTWF0Y2hlc0xpbmVCeUxpbmUoc2VhcmNoUmFuZ2UsIHNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzLCBsaW1pdFJlc3VsdENvdW50KTtcblx0fVxuXG5cdHB1YmxpYyBmaW5kTWF0Y2hlcyhzZWFyY2hTdHJpbmc6IHN0cmluZywgcmF3U2VhcmNoU2NvcGU6IGJvb2xlYW4gfCBJUmFuZ2UgfCBJUmFuZ2VbXSB8IG51bGwsIGlzUmVnZXg6IGJvb2xlYW4sIG1hdGNoQ2FzZTogYm9vbGVhbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZyB8IG51bGwsIGNhcHR1cmVNYXRjaGVzOiBib29sZWFuLCBsaW1pdFJlc3VsdENvdW50OiBudW1iZXIgPSBMSU1JVF9GSU5EX0NPVU5UKTogbW9kZWwuRmluZE1hdGNoW10ge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cblx0XHRsZXQgc2VhcmNoUmFuZ2VzOiBSYW5nZVtdIHwgbnVsbCA9IG51bGw7XG5cblx0XHRpZiAocmF3U2VhcmNoU2NvcGUgIT09IG51bGwgJiYgdHlwZW9mIHJhd1NlYXJjaFNjb3BlICE9PSAnYm9vbGVhbicpIHtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShyYXdTZWFyY2hTY29wZSkpIHtcblx0XHRcdFx0cmF3U2VhcmNoU2NvcGUgPSBbcmF3U2VhcmNoU2NvcGVdO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmF3U2VhcmNoU2NvcGUuZXZlcnkoKHNlYXJjaFNjb3BlOiBJUmFuZ2UpID0+IFJhbmdlLmlzSVJhbmdlKHNlYXJjaFNjb3BlKSkpIHtcblx0XHRcdFx0c2VhcmNoUmFuZ2VzID0gcmF3U2VhcmNoU2NvcGUubWFwKChzZWFyY2hTY29wZTogSVJhbmdlKSA9PiB0aGlzLnZhbGlkYXRlUmFuZ2Uoc2VhcmNoU2NvcGUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2VhcmNoUmFuZ2VzID09PSBudWxsKSB7XG5cdFx0XHRzZWFyY2hSYW5nZXMgPSBbdGhpcy5nZXRGdWxsTW9kZWxSYW5nZSgpXTtcblx0XHR9XG5cblx0XHRzZWFyY2hSYW5nZXMgPSBzZWFyY2hSYW5nZXMuc29ydCgoZDEsIGQyKSA9PiBkMS5zdGFydExpbmVOdW1iZXIgLSBkMi5zdGFydExpbmVOdW1iZXIgfHwgZDEuc3RhcnRDb2x1bW4gLSBkMi5zdGFydENvbHVtbik7XG5cblx0XHRjb25zdCB1bmlxdWVTZWFyY2hSYW5nZXM6IFJhbmdlW10gPSBbXTtcblx0XHR1bmlxdWVTZWFyY2hSYW5nZXMucHVzaChzZWFyY2hSYW5nZXMucmVkdWNlKChwcmV2LCBjdXJyKSA9PiB7XG5cdFx0XHRpZiAoUmFuZ2UuYXJlSW50ZXJzZWN0aW5nKHByZXYsIGN1cnIpKSB7XG5cdFx0XHRcdHJldHVybiBwcmV2LnBsdXNSYW5nZShjdXJyKTtcblx0XHRcdH1cblxuXHRcdFx0dW5pcXVlU2VhcmNoUmFuZ2VzLnB1c2gocHJldik7XG5cdFx0XHRyZXR1cm4gY3Vycjtcblx0XHR9KSk7XG5cblx0XHRsZXQgbWF0Y2hNYXBwZXI6ICh2YWx1ZTogUmFuZ2UsIGluZGV4OiBudW1iZXIsIGFycmF5OiBSYW5nZVtdKSA9PiBtb2RlbC5GaW5kTWF0Y2hbXTtcblx0XHRpZiAoIWlzUmVnZXggJiYgc2VhcmNoU3RyaW5nLmluZGV4T2YoJ1xcbicpIDwgMCkge1xuXHRcdFx0Ly8gbm90IHJlZ2V4LCBub3QgbXVsdGkgbGluZVxuXHRcdFx0Y29uc3Qgc2VhcmNoUGFyYW1zID0gbmV3IFNlYXJjaFBhcmFtcyhzZWFyY2hTdHJpbmcsIGlzUmVnZXgsIG1hdGNoQ2FzZSwgd29yZFNlcGFyYXRvcnMpO1xuXHRcdFx0Y29uc3Qgc2VhcmNoRGF0YSA9IHNlYXJjaFBhcmFtcy5wYXJzZVNlYXJjaFJlcXVlc3QoKTtcblxuXHRcdFx0aWYgKCFzZWFyY2hEYXRhKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0bWF0Y2hNYXBwZXIgPSAoc2VhcmNoUmFuZ2U6IFJhbmdlKSA9PiB0aGlzLmZpbmRNYXRjaGVzTGluZUJ5TGluZShzZWFyY2hSYW5nZSwgc2VhcmNoRGF0YSwgY2FwdHVyZU1hdGNoZXMsIGxpbWl0UmVzdWx0Q291bnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtYXRjaE1hcHBlciA9IChzZWFyY2hSYW5nZTogUmFuZ2UpID0+IFRleHRNb2RlbFNlYXJjaC5maW5kTWF0Y2hlcyh0aGlzLCBuZXcgU2VhcmNoUGFyYW1zKHNlYXJjaFN0cmluZywgaXNSZWdleCwgbWF0Y2hDYXNlLCB3b3JkU2VwYXJhdG9ycyksIHNlYXJjaFJhbmdlLCBjYXB0dXJlTWF0Y2hlcywgbGltaXRSZXN1bHRDb3VudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuaXF1ZVNlYXJjaFJhbmdlcy5tYXAobWF0Y2hNYXBwZXIpLnJlZHVjZSgoYXJyLCBtYXRjaGVzOiBtb2RlbC5GaW5kTWF0Y2hbXSkgPT4gYXJyLmNvbmNhdChtYXRjaGVzKSwgW10pO1xuXHR9XG5cblx0cHVibGljIGZpbmROZXh0TWF0Y2goc2VhcmNoU3RyaW5nOiBzdHJpbmcsIHJhd1NlYXJjaFN0YXJ0OiBJUG9zaXRpb24sIGlzUmVnZXg6IGJvb2xlYW4sIG1hdGNoQ2FzZTogYm9vbGVhbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZywgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4pOiBtb2RlbC5GaW5kTWF0Y2ggfCBudWxsIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IHNlYXJjaFN0YXJ0ID0gdGhpcy52YWxpZGF0ZVBvc2l0aW9uKHJhd1NlYXJjaFN0YXJ0KTtcblxuXHRcdGlmICghaXNSZWdleCAmJiBzZWFyY2hTdHJpbmcuaW5kZXhPZignXFxuJykgPCAwKSB7XG5cdFx0XHRjb25zdCBzZWFyY2hQYXJhbXMgPSBuZXcgU2VhcmNoUGFyYW1zKHNlYXJjaFN0cmluZywgaXNSZWdleCwgbWF0Y2hDYXNlLCB3b3JkU2VwYXJhdG9ycyk7XG5cdFx0XHRjb25zdCBzZWFyY2hEYXRhID0gc2VhcmNoUGFyYW1zLnBhcnNlU2VhcmNoUmVxdWVzdCgpO1xuXHRcdFx0aWYgKCFzZWFyY2hEYXRhKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLmdldExpbmVDb3VudCgpO1xuXHRcdFx0bGV0IHNlYXJjaFJhbmdlID0gbmV3IFJhbmdlKHNlYXJjaFN0YXJ0LmxpbmVOdW1iZXIsIHNlYXJjaFN0YXJ0LmNvbHVtbiwgbGluZUNvdW50LCB0aGlzLmdldExpbmVNYXhDb2x1bW4obGluZUNvdW50KSk7XG5cdFx0XHRsZXQgcmV0ID0gdGhpcy5maW5kTWF0Y2hlc0xpbmVCeUxpbmUoc2VhcmNoUmFuZ2UsIHNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzLCAxKTtcblx0XHRcdFRleHRNb2RlbFNlYXJjaC5maW5kTmV4dE1hdGNoKHRoaXMsIG5ldyBTZWFyY2hQYXJhbXMoc2VhcmNoU3RyaW5nLCBpc1JlZ2V4LCBtYXRjaENhc2UsIHdvcmRTZXBhcmF0b3JzKSwgc2VhcmNoU3RhcnQsIGNhcHR1cmVNYXRjaGVzKTtcblx0XHRcdGlmIChyZXQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gcmV0WzBdO1xuXHRcdFx0fVxuXG5cdFx0XHRzZWFyY2hSYW5nZSA9IG5ldyBSYW5nZSgxLCAxLCBzZWFyY2hTdGFydC5saW5lTnVtYmVyLCB0aGlzLmdldExpbmVNYXhDb2x1bW4oc2VhcmNoU3RhcnQubGluZU51bWJlcikpO1xuXHRcdFx0cmV0ID0gdGhpcy5maW5kTWF0Y2hlc0xpbmVCeUxpbmUoc2VhcmNoUmFuZ2UsIHNlYXJjaERhdGEsIGNhcHR1cmVNYXRjaGVzLCAxKTtcblxuXHRcdFx0aWYgKHJldC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiByZXRbMF07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBUZXh0TW9kZWxTZWFyY2guZmluZE5leHRNYXRjaCh0aGlzLCBuZXcgU2VhcmNoUGFyYW1zKHNlYXJjaFN0cmluZywgaXNSZWdleCwgbWF0Y2hDYXNlLCB3b3JkU2VwYXJhdG9ycyksIHNlYXJjaFN0YXJ0LCBjYXB0dXJlTWF0Y2hlcyk7XG5cdH1cblxuXHRwdWJsaWMgZmluZFByZXZpb3VzTWF0Y2goc2VhcmNoU3RyaW5nOiBzdHJpbmcsIHJhd1NlYXJjaFN0YXJ0OiBJUG9zaXRpb24sIGlzUmVnZXg6IGJvb2xlYW4sIG1hdGNoQ2FzZTogYm9vbGVhbiwgd29yZFNlcGFyYXRvcnM6IHN0cmluZywgY2FwdHVyZU1hdGNoZXM6IGJvb2xlYW4pOiBtb2RlbC5GaW5kTWF0Y2ggfCBudWxsIHtcblx0XHR0aGlzLl9hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IHNlYXJjaFN0YXJ0ID0gdGhpcy52YWxpZGF0ZVBvc2l0aW9uKHJhd1NlYXJjaFN0YXJ0KTtcblx0XHRyZXR1cm4gVGV4dE1vZGVsU2VhcmNoLmZpbmRQcmV2aW91c01hdGNoKHRoaXMsIG5ldyBTZWFyY2hQYXJhbXMoc2VhcmNoU3RyaW5nLCBpc1JlZ2V4LCBtYXRjaENhc2UsIHdvcmRTZXBhcmF0b3JzKSwgc2VhcmNoU3RhcnQsIGNhcHR1cmVNYXRjaGVzKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBFZGl0aW5nXG5cblx0cHVibGljIHB1c2hTdGFja0VsZW1lbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tbWFuZE1hbmFnZXIucHVzaFN0YWNrRWxlbWVudCgpO1xuXHR9XG5cblx0cHVibGljIHBvcFN0YWNrRWxlbWVudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb21tYW5kTWFuYWdlci5wb3BTdGFja0VsZW1lbnQoKTtcblx0fVxuXG5cdHB1YmxpYyBwdXNoRU9MKGVvbDogbW9kZWwuRW5kT2ZMaW5lU2VxdWVuY2UpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50RU9MID0gKHRoaXMuZ2V0RU9MKCkgPT09ICdcXG4nID8gbW9kZWwuRW5kT2ZMaW5lU2VxdWVuY2UuTEYgOiBtb2RlbC5FbmRPZkxpbmVTZXF1ZW5jZS5DUkxGKTtcblx0XHRpZiAoY3VycmVudEVPTCA9PT0gZW9sKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmJlZ2luRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHR0aGlzLl9ldmVudEVtaXR0ZXIuYmVnaW5EZWZlcnJlZEVtaXQoKTtcblx0XHRcdGlmICh0aGlzLl9pbml0aWFsVW5kb1JlZG9TbmFwc2hvdCA9PT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLl9pbml0aWFsVW5kb1JlZG9TbmFwc2hvdCA9IHRoaXMuX3VuZG9SZWRvU2VydmljZS5jcmVhdGVTbmFwc2hvdCh0aGlzLnVyaSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb21tYW5kTWFuYWdlci5wdXNoRU9MKGVvbCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2V2ZW50RW1pdHRlci5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZW5kRGVmZXJyZWRFbWl0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVFZGl0T3BlcmF0aW9uKHJhd09wZXJhdGlvbjogbW9kZWwuSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uKTogbW9kZWwuVmFsaWRBbm5vdGF0ZWRFZGl0T3BlcmF0aW9uIHtcblx0XHRpZiAocmF3T3BlcmF0aW9uIGluc3RhbmNlb2YgbW9kZWwuVmFsaWRBbm5vdGF0ZWRFZGl0T3BlcmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gcmF3T3BlcmF0aW9uO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbGlkYXRlZFJhbmdlID0gdGhpcy52YWxpZGF0ZVJhbmdlKHJhd09wZXJhdGlvbi5yYW5nZSk7XG5cblx0XHQvLyBOb3JtYWxpemUgZWRpdCB3aGVuIHJlcGxhY2VtZW50IHRleHQgZW5kcyB3aXRoIGxvbmUgQ1Jcblx0XHQvLyBhbmQgdGhlIHJhbmdlIGVuZHMgcmlnaHQgYmVmb3JlIGEgQ1JMRiBpbiB0aGUgYnVmZmVyLlxuXHRcdC8vIFdlIHN0cmlwIHRoZSB0cmFpbGluZyBDUiBmcm9tIHRoZSByZXBsYWNlbWVudCB0ZXh0LlxuXHRcdGxldCBvcFRleHQgPSByYXdPcGVyYXRpb24udGV4dDtcblx0XHRpZiAob3BUZXh0KSB7XG5cdFx0XHRjb25zdCBlbmRzV2l0aExvbmVDUiA9IChcblx0XHRcdFx0b3BUZXh0Lmxlbmd0aCA+IDAgJiYgb3BUZXh0LmNoYXJDb2RlQXQob3BUZXh0Lmxlbmd0aCAtIDEpID09PSBDaGFyQ29kZS5DYXJyaWFnZVJldHVyblxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHJlbW92ZVRyYWlsaW5nQ1IgPSAoXG5cdFx0XHRcdHRoaXMuZ2V0RU9MKCkgPT09ICdcXHJcXG4nICYmIGVuZHNXaXRoTG9uZUNSICYmIHZhbGlkYXRlZFJhbmdlLmVuZENvbHVtbiA9PT0gdGhpcy5nZXRMaW5lTWF4Q29sdW1uKHZhbGlkYXRlZFJhbmdlLmVuZExpbmVOdW1iZXIpXG5cdFx0XHQpO1xuXHRcdFx0aWYgKHJlbW92ZVRyYWlsaW5nQ1IpIHtcblx0XHRcdFx0b3BUZXh0ID0gb3BUZXh0LnN1YnN0cmluZygwLCBvcFRleHQubGVuZ3RoIC0gMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBtb2RlbC5WYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb24oXG5cdFx0XHRyYXdPcGVyYXRpb24uaWRlbnRpZmllciB8fCBudWxsLFxuXHRcdFx0dmFsaWRhdGVkUmFuZ2UsXG5cdFx0XHRvcFRleHQsXG5cdFx0XHRyYXdPcGVyYXRpb24uZm9yY2VNb3ZlTWFya2VycyB8fCBmYWxzZSxcblx0XHRcdHJhd09wZXJhdGlvbi5pc0F1dG9XaGl0ZXNwYWNlRWRpdCB8fCBmYWxzZSxcblx0XHRcdHJhd09wZXJhdGlvbi5faXNUcmFja2VkIHx8IGZhbHNlXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlRWRpdE9wZXJhdGlvbnMocmF3T3BlcmF0aW9uczogcmVhZG9ubHkgbW9kZWwuSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10pOiBtb2RlbC5WYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb25bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBtb2RlbC5WYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByYXdPcGVyYXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRyZXN1bHRbaV0gPSB0aGlzLl92YWxpZGF0ZUVkaXRPcGVyYXRpb24ocmF3T3BlcmF0aW9uc1tpXSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgZWRpdChlZGl0OiBUZXh0RWRpdCwgb3B0aW9ucz86IHsgcmVhc29uPzogVGV4dE1vZGVsRWRpdFNvdXJjZSB9KTogdm9pZCB7XG5cdFx0dGhpcy5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgZWRpdC5yZXBsYWNlbWVudHMubWFwKHIgPT4gKHsgcmFuZ2U6IHIucmFuZ2UsIHRleHQ6IHIudGV4dCB9KSksIG51bGwpO1xuXHR9XG5cblx0cHVibGljIHB1c2hFZGl0T3BlcmF0aW9ucyhiZWZvcmVDdXJzb3JTdGF0ZTogU2VsZWN0aW9uW10gfCBudWxsLCBlZGl0T3BlcmF0aW9uczogbW9kZWwuSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10sIGN1cnNvclN0YXRlQ29tcHV0ZXI6IG1vZGVsLklDdXJzb3JTdGF0ZUNvbXB1dGVyIHwgbnVsbCwgZ3JvdXA/OiBVbmRvUmVkb0dyb3VwLCByZWFzb24/OiBUZXh0TW9kZWxFZGl0U291cmNlKTogU2VsZWN0aW9uW10gfCBudWxsIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5fZXZlbnRFbWl0dGVyLmJlZ2luRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHVzaEVkaXRPcGVyYXRpb25zKGJlZm9yZUN1cnNvclN0YXRlLCB0aGlzLl92YWxpZGF0ZUVkaXRPcGVyYXRpb25zKGVkaXRPcGVyYXRpb25zKSwgY3Vyc29yU3RhdGVDb21wdXRlciwgZ3JvdXAsIHJlYXNvbik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2V2ZW50RW1pdHRlci5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZW5kRGVmZXJyZWRFbWl0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcHVzaEVkaXRPcGVyYXRpb25zKGJlZm9yZUN1cnNvclN0YXRlOiBTZWxlY3Rpb25bXSB8IG51bGwsIGVkaXRPcGVyYXRpb25zOiBtb2RlbC5WYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb25bXSwgY3Vyc29yU3RhdGVDb21wdXRlcjogbW9kZWwuSUN1cnNvclN0YXRlQ29tcHV0ZXIgfCBudWxsLCBncm91cD86IFVuZG9SZWRvR3JvdXAsIHJlYXNvbj86IFRleHRNb2RlbEVkaXRTb3VyY2UpOiBTZWxlY3Rpb25bXSB8IG51bGwge1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLnRyaW1BdXRvV2hpdGVzcGFjZSAmJiB0aGlzLl90cmltQXV0b1doaXRlc3BhY2VMaW5lcykge1xuXHRcdFx0Ly8gR28gdGhyb3VnaCBlYWNoIHNhdmVkIGxpbmUgbnVtYmVyIGFuZCBpbnNlcnQgYSB0cmltIHdoaXRlc3BhY2UgZWRpdFxuXHRcdFx0Ly8gaWYgaXQgaXMgc2FmZSB0byBkbyBzbyAobm8gY29uZmxpY3RzIHdpdGggb3RoZXIgZWRpdHMpLlxuXG5cdFx0XHRjb25zdCBpbmNvbWluZ0VkaXRzID0gZWRpdE9wZXJhdGlvbnMubWFwKChvcCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJhbmdlOiB0aGlzLnZhbGlkYXRlUmFuZ2Uob3AucmFuZ2UpLFxuXHRcdFx0XHRcdHRleHQ6IG9wLnRleHRcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBTb21ldGltZXMsIGF1dG8tZm9ybWF0dGVycyBjaGFuZ2UgcmFuZ2VzIGF1dG9tYXRpY2FsbHkgd2hpY2ggY2FuIGNhdXNlIHVuZGVzaXJlZCBhdXRvIHdoaXRlc3BhY2UgdHJpbW1pbmcgbmVhciB0aGUgY3Vyc29yXG5cdFx0XHQvLyBXZSdsbCB1c2UgdGhlIGZvbGxvd2luZyBoZXVyaXN0aWM6IGlmIHRoZSBlZGl0cyBvY2N1ciBuZWFyIHRoZSBjdXJzb3IsIHRoZW4gaXQncyBvayB0byB0cmltIGF1dG8gd2hpdGVzcGFjZVxuXHRcdFx0bGV0IGVkaXRzQXJlTmVhckN1cnNvcnMgPSB0cnVlO1xuXHRcdFx0aWYgKGJlZm9yZUN1cnNvclN0YXRlKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBiZWZvcmVDdXJzb3JTdGF0ZS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IHNlbCA9IGJlZm9yZUN1cnNvclN0YXRlW2ldO1xuXHRcdFx0XHRcdGxldCBmb3VuZEVkaXROZWFyU2VsID0gZmFsc2U7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSBpbmNvbWluZ0VkaXRzLmxlbmd0aDsgaiA8IGxlbko7IGorKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdFJhbmdlID0gaW5jb21pbmdFZGl0c1tqXS5yYW5nZTtcblx0XHRcdFx0XHRcdGNvbnN0IHNlbElzQWJvdmUgPSBlZGl0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gc2VsLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRjb25zdCBzZWxJc0JlbG93ID0gc2VsLnN0YXJ0TGluZU51bWJlciA+IGVkaXRSYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0aWYgKCFzZWxJc0Fib3ZlICYmICFzZWxJc0JlbG93KSB7XG5cdFx0XHRcdFx0XHRcdGZvdW5kRWRpdE5lYXJTZWwgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFmb3VuZEVkaXROZWFyU2VsKSB7XG5cdFx0XHRcdFx0XHRlZGl0c0FyZU5lYXJDdXJzb3JzID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGVkaXRzQXJlTmVhckN1cnNvcnMpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX3RyaW1BdXRvV2hpdGVzcGFjZUxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgdHJpbUxpbmVOdW1iZXIgPSB0aGlzLl90cmltQXV0b1doaXRlc3BhY2VMaW5lc1tpXTtcblx0XHRcdFx0XHRjb25zdCBtYXhMaW5lQ29sdW1uID0gdGhpcy5nZXRMaW5lTWF4Q29sdW1uKHRyaW1MaW5lTnVtYmVyKTtcblxuXHRcdFx0XHRcdGxldCBhbGxvd1RyaW1MaW5lID0gdHJ1ZTtcblx0XHRcdFx0XHRmb3IgKGxldCBqID0gMCwgbGVuSiA9IGluY29taW5nRWRpdHMubGVuZ3RoOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0UmFuZ2UgPSBpbmNvbWluZ0VkaXRzW2pdLnJhbmdlO1xuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdFRleHQgPSBpbmNvbWluZ0VkaXRzW2pdLnRleHQ7XG5cblx0XHRcdFx0XHRcdGlmICh0cmltTGluZU51bWJlciA8IGVkaXRSYW5nZS5zdGFydExpbmVOdW1iZXIgfHwgdHJpbUxpbmVOdW1iZXIgPiBlZGl0UmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0XHQvLyBgdHJpbUxpbmVgIGlzIGNvbXBsZXRlbHkgb3V0c2lkZSB0aGlzIGVkaXRcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIEF0IHRoaXMgcG9pbnQ6XG5cdFx0XHRcdFx0XHQvLyAgIGVkaXRSYW5nZS5zdGFydExpbmVOdW1iZXIgPD0gdHJpbUxpbmUgPD0gZWRpdFJhbmdlLmVuZExpbmVOdW1iZXJcblxuXHRcdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0XHR0cmltTGluZU51bWJlciA9PT0gZWRpdFJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBlZGl0UmFuZ2Uuc3RhcnRDb2x1bW4gPT09IG1heExpbmVDb2x1bW5cblx0XHRcdFx0XHRcdFx0JiYgZWRpdFJhbmdlLmlzRW1wdHkoKSAmJiBlZGl0VGV4dCAmJiBlZGl0VGV4dC5sZW5ndGggPiAwICYmIGVkaXRUZXh0LmNoYXJBdCgwKSA9PT0gJ1xcbidcblx0XHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0XHQvLyBUaGlzIGVkaXQgaW5zZXJ0cyBhIG5ldyBsaW5lIChhbmQgbWF5YmUgb3RoZXIgdGV4dCkgYWZ0ZXIgYHRyaW1MaW5lYFxuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0XHR0cmltTGluZU51bWJlciA9PT0gZWRpdFJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBlZGl0UmFuZ2Uuc3RhcnRDb2x1bW4gPT09IDFcblx0XHRcdFx0XHRcdFx0JiYgZWRpdFJhbmdlLmlzRW1wdHkoKSAmJiBlZGl0VGV4dCAmJiBlZGl0VGV4dC5sZW5ndGggPiAwICYmIGVkaXRUZXh0LmNoYXJBdChlZGl0VGV4dC5sZW5ndGggLSAxKSA9PT0gJ1xcbidcblx0XHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0XHQvLyBUaGlzIGVkaXQgaW5zZXJ0cyBhIG5ldyBsaW5lIChhbmQgbWF5YmUgb3RoZXIgdGV4dCkgYmVmb3JlIGB0cmltTGluZWBcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIExvb2tzIGxpa2Ugd2UgY2FuJ3QgdHJpbSB0aGlzIGxpbmUgYXMgaXQgd291bGQgaW50ZXJmZXJlIHdpdGggYW4gaW5jb21pbmcgZWRpdFxuXHRcdFx0XHRcdFx0YWxsb3dUcmltTGluZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGFsbG93VHJpbUxpbmUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRyaW1SYW5nZSA9IG5ldyBSYW5nZSh0cmltTGluZU51bWJlciwgMSwgdHJpbUxpbmVOdW1iZXIsIG1heExpbmVDb2x1bW4pO1xuXHRcdFx0XHRcdFx0ZWRpdE9wZXJhdGlvbnMucHVzaChuZXcgbW9kZWwuVmFsaWRBbm5vdGF0ZWRFZGl0T3BlcmF0aW9uKG51bGwsIHRyaW1SYW5nZSwgbnVsbCwgZmFsc2UsIGZhbHNlLCBmYWxzZSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3RyaW1BdXRvV2hpdGVzcGFjZUxpbmVzID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2luaXRpYWxVbmRvUmVkb1NuYXBzaG90ID09PSBudWxsKSB7XG5cdFx0XHR0aGlzLl9pbml0aWFsVW5kb1JlZG9TbmFwc2hvdCA9IHRoaXMuX3VuZG9SZWRvU2VydmljZS5jcmVhdGVTbmFwc2hvdCh0aGlzLnVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb21tYW5kTWFuYWdlci5wdXNoRWRpdE9wZXJhdGlvbihiZWZvcmVDdXJzb3JTdGF0ZSwgZWRpdE9wZXJhdGlvbnMsIGN1cnNvclN0YXRlQ29tcHV0ZXIsIGdyb3VwLCByZWFzb24pO1xuXHR9XG5cblx0X2FwcGx5VW5kbyhjaGFuZ2VzOiBUZXh0Q2hhbmdlW10sIGVvbDogbW9kZWwuRW5kT2ZMaW5lU2VxdWVuY2UsIHJlc3VsdGluZ0FsdGVybmF0aXZlVmVyc2lvbklkOiBudW1iZXIsIHJlc3VsdGluZ1NlbGVjdGlvbjogU2VsZWN0aW9uW10gfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdHMgPSBjaGFuZ2VzLm1hcDxJU2luZ2xlRWRpdE9wZXJhdGlvbj4oKGNoYW5nZSkgPT4ge1xuXHRcdFx0Y29uc3QgcmFuZ2VTdGFydCA9IHRoaXMuZ2V0UG9zaXRpb25BdChjaGFuZ2UubmV3UG9zaXRpb24pO1xuXHRcdFx0Y29uc3QgcmFuZ2VFbmQgPSB0aGlzLmdldFBvc2l0aW9uQXQoY2hhbmdlLm5ld0VuZCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHJhbmdlU3RhcnQubGluZU51bWJlciwgcmFuZ2VTdGFydC5jb2x1bW4sIHJhbmdlRW5kLmxpbmVOdW1iZXIsIHJhbmdlRW5kLmNvbHVtbiksXG5cdFx0XHRcdHRleHQ6IGNoYW5nZS5vbGRUZXh0XG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX2FwcGx5VW5kb1JlZG9FZGl0cyhlZGl0cywgZW9sLCB0cnVlLCBmYWxzZSwgcmVzdWx0aW5nQWx0ZXJuYXRpdmVWZXJzaW9uSWQsIHJlc3VsdGluZ1NlbGVjdGlvbik7XG5cdH1cblxuXHRfYXBwbHlSZWRvKGNoYW5nZXM6IFRleHRDaGFuZ2VbXSwgZW9sOiBtb2RlbC5FbmRPZkxpbmVTZXF1ZW5jZSwgcmVzdWx0aW5nQWx0ZXJuYXRpdmVWZXJzaW9uSWQ6IG51bWJlciwgcmVzdWx0aW5nU2VsZWN0aW9uOiBTZWxlY3Rpb25bXSB8IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0cyA9IGNoYW5nZXMubWFwPElTaW5nbGVFZGl0T3BlcmF0aW9uPigoY2hhbmdlKSA9PiB7XG5cdFx0XHRjb25zdCByYW5nZVN0YXJ0ID0gdGhpcy5nZXRQb3NpdGlvbkF0KGNoYW5nZS5vbGRQb3NpdGlvbik7XG5cdFx0XHRjb25zdCByYW5nZUVuZCA9IHRoaXMuZ2V0UG9zaXRpb25BdChjaGFuZ2Uub2xkRW5kKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocmFuZ2VTdGFydC5saW5lTnVtYmVyLCByYW5nZVN0YXJ0LmNvbHVtbiwgcmFuZ2VFbmQubGluZU51bWJlciwgcmFuZ2VFbmQuY29sdW1uKSxcblx0XHRcdFx0dGV4dDogY2hhbmdlLm5ld1RleHRcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fYXBwbHlVbmRvUmVkb0VkaXRzKGVkaXRzLCBlb2wsIGZhbHNlLCB0cnVlLCByZXN1bHRpbmdBbHRlcm5hdGl2ZVZlcnNpb25JZCwgcmVzdWx0aW5nU2VsZWN0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VW5kb1JlZG9FZGl0cyhlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSwgZW9sOiBtb2RlbC5FbmRPZkxpbmVTZXF1ZW5jZSwgaXNVbmRvaW5nOiBib29sZWFuLCBpc1JlZG9pbmc6IGJvb2xlYW4sIHJlc3VsdGluZ0FsdGVybmF0aXZlVmVyc2lvbklkOiBudW1iZXIsIHJlc3VsdGluZ1NlbGVjdGlvbjogU2VsZWN0aW9uW10gfCBudWxsKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuYmVnaW5EZWZlcnJlZEVtaXQoKTtcblx0XHRcdHRoaXMuX2V2ZW50RW1pdHRlci5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5faXNVbmRvaW5nID0gaXNVbmRvaW5nO1xuXHRcdFx0dGhpcy5faXNSZWRvaW5nID0gaXNSZWRvaW5nO1xuXHRcdFx0Y29uc3Qgb3BlcmF0aW9ucyA9IHRoaXMuX3ZhbGlkYXRlRWRpdE9wZXJhdGlvbnMoZWRpdHMpO1xuXHRcdFx0dGhpcy5fZG9BcHBseUVkaXRzKG9wZXJhdGlvbnMsIGZhbHNlLCBFZGl0U291cmNlcy5hcHBseUVkaXRzKCksIHJlc3VsdGluZ1NlbGVjdGlvbik7XG5cdFx0XHR0aGlzLnNldEVPTChlb2wpO1xuXHRcdFx0dGhpcy5fb3ZlcndyaXRlQWx0ZXJuYXRpdmVWZXJzaW9uSWQocmVzdWx0aW5nQWx0ZXJuYXRpdmVWZXJzaW9uSWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc1VuZG9pbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2lzUmVkb2luZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fZXZlbnRFbWl0dGVyLmVuZERlZmVycmVkRW1pdChyZXN1bHRpbmdTZWxlY3Rpb24pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlFZGl0cyhvcGVyYXRpb25zOiByZWFkb25seSBtb2RlbC5JSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSk6IHZvaWQ7XG5cdHB1YmxpYyBhcHBseUVkaXRzKG9wZXJhdGlvbnM6IHJlYWRvbmx5IG1vZGVsLklJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBjb21wdXRlVW5kb0VkaXRzOiBmYWxzZSk6IHZvaWQ7XG5cdHB1YmxpYyBhcHBseUVkaXRzKG9wZXJhdGlvbnM6IHJlYWRvbmx5IG1vZGVsLklJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBjb21wdXRlVW5kb0VkaXRzOiB0cnVlKTogbW9kZWwuSVZhbGlkRWRpdE9wZXJhdGlvbltdO1xuXHQvKiogQGludGVybmFsICovXG5cdHB1YmxpYyBhcHBseUVkaXRzKG9wZXJhdGlvbnM6IHJlYWRvbmx5IG1vZGVsLklJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBjb21wdXRlVW5kb0VkaXRzOiBmYWxzZSwgcmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlKTogdm9pZDtcblx0LyoqIEBpbnRlcm5hbCAqL1xuXHRwdWJsaWMgYXBwbHlFZGl0cyhvcGVyYXRpb25zOiByZWFkb25seSBtb2RlbC5JSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSwgY29tcHV0ZVVuZG9FZGl0czogdHJ1ZSwgcmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlKTogbW9kZWwuSVZhbGlkRWRpdE9wZXJhdGlvbltdO1xuXHRwdWJsaWMgYXBwbHlFZGl0cyhyYXdPcGVyYXRpb25zOiByZWFkb25seSBtb2RlbC5JSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSwgY29tcHV0ZVVuZG9FZGl0cz86IGJvb2xlYW4sIHJlYXNvbj86IFRleHRNb2RlbEVkaXRTb3VyY2UpOiB2b2lkIHwgbW9kZWwuSVZhbGlkRWRpdE9wZXJhdGlvbltdIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5fZXZlbnRFbWl0dGVyLmJlZ2luRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHRjb25zdCBvcGVyYXRpb25zID0gdGhpcy5fdmFsaWRhdGVFZGl0T3BlcmF0aW9ucyhyYXdPcGVyYXRpb25zKTtcblxuXHRcdFx0cmV0dXJuIHRoaXMuX2RvQXBwbHlFZGl0cyhvcGVyYXRpb25zLCBjb21wdXRlVW5kb0VkaXRzID8/IGZhbHNlLCByZWFzb24gPz8gRWRpdFNvdXJjZXMuYXBwbHlFZGl0cygpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZXZlbnRFbWl0dGVyLmVuZERlZmVycmVkRW1pdCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kb0FwcGx5RWRpdHMocmF3T3BlcmF0aW9uczogbW9kZWwuVmFsaWRBbm5vdGF0ZWRFZGl0T3BlcmF0aW9uW10sIGNvbXB1dGVVbmRvRWRpdHM6IGJvb2xlYW4sIHJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSwgcmVzdWx0aW5nU2VsZWN0aW9uOiBTZWxlY3Rpb25bXSB8IG51bGwgPSBudWxsKTogdm9pZCB8IG1vZGVsLklWYWxpZEVkaXRPcGVyYXRpb25bXSB7XG5cblx0XHRjb25zdCBvbGRMaW5lQ291bnQgPSB0aGlzLl9idWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fYnVmZmVyLmFwcGx5RWRpdHMocmF3T3BlcmF0aW9ucywgdGhpcy5fb3B0aW9ucy50cmltQXV0b1doaXRlc3BhY2UsIGNvbXB1dGVVbmRvRWRpdHMpO1xuXHRcdGNvbnN0IG5ld0xpbmVDb3VudCA9IHRoaXMuX2J1ZmZlci5nZXRMaW5lQ291bnQoKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRDaGFuZ2VzID0gcmVzdWx0LmNoYW5nZXM7XG5cdFx0dGhpcy5fdHJpbUF1dG9XaGl0ZXNwYWNlTGluZXMgPSByZXN1bHQudHJpbUF1dG9XaGl0ZXNwYWNlTGluZU51bWJlcnM7XG5cblx0XHRpZiAoY29udGVudENoYW5nZXMubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHQvLyBXZSBkbyBhIGZpcnN0IHBhc3MgdG8gdXBkYXRlIGRlY29yYXRpb25zXG5cdFx0XHQvLyBiZWNhdXNlIHdlIHdhbnQgdG8gcmVhZCBkZWNvcmF0aW9ucyBpbiB0aGUgc2Vjb25kIHBhc3Ncblx0XHRcdC8vIHdoZXJlIHdlIHdpbGwgZW1pdCBjb250ZW50IGNoYW5nZSBldmVudHNcblx0XHRcdC8vIGFuZCB3ZSB3YW50IHRvIHJlYWQgdGhlIGZpbmFsIGRlY29yYXRpb25zXG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY29udGVudENoYW5nZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY2hhbmdlID0gY29udGVudENoYW5nZXNbaV07XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5hY2NlcHRSZXBsYWNlKGNoYW5nZS5yYW5nZU9mZnNldCwgY2hhbmdlLnJhbmdlTGVuZ3RoLCBjaGFuZ2UudGV4dC5sZW5ndGgsIGNoYW5nZS5mb3JjZU1vdmVNYXJrZXJzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmF3Q29udGVudENoYW5nZXM6IE1vZGVsUmF3Q2hhbmdlW10gPSBbXTtcblxuXHRcdFx0dGhpcy5faW5jcmVhc2VWZXJzaW9uSWQoKTtcblxuXHRcdFx0bGV0IGxpbmVDb3VudCA9IG9sZExpbmVDb3VudDtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjb250ZW50Q2hhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBjaGFuZ2UgPSBjb250ZW50Q2hhbmdlc1tpXTtcblx0XHRcdFx0Y29uc3QgW2VvbENvdW50XSA9IGNvdW50RU9MKGNoYW5nZS50ZXh0KTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5maXJlKCk7XG5cblx0XHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gY2hhbmdlLnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IGNoYW5nZS5yYW5nZS5lbmRMaW5lTnVtYmVyO1xuXG5cdFx0XHRcdGNvbnN0IGRlbGV0aW5nTGluZXNDbnQgPSBlbmRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRjb25zdCBpbnNlcnRpbmdMaW5lc0NudCA9IGVvbENvdW50O1xuXHRcdFx0XHRjb25zdCBlZGl0aW5nTGluZXNDbnQgPSBNYXRoLm1pbihkZWxldGluZ0xpbmVzQ250LCBpbnNlcnRpbmdMaW5lc0NudCk7XG5cblx0XHRcdFx0Y29uc3QgY2hhbmdlTGluZUNvdW50RGVsdGEgPSAoaW5zZXJ0aW5nTGluZXNDbnQgLSBkZWxldGluZ0xpbmVzQ250KTtcblxuXHRcdFx0XHRjb25zdCBjdXJyZW50RWRpdFN0YXJ0TGluZU51bWJlciA9IG5ld0xpbmVDb3VudCAtIGxpbmVDb3VudCAtIGNoYW5nZUxpbmVDb3VudERlbHRhICsgc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0XHRcdGZvciAobGV0IGogPSBlZGl0aW5nTGluZXNDbnQ7IGogPj0gMDsgai0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXIgKyBqO1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRFZGl0TGluZU51bWJlciA9IGN1cnJlbnRFZGl0U3RhcnRMaW5lTnVtYmVyICsgajtcblxuXHRcdFx0XHRcdHJhd0NvbnRlbnRDaGFuZ2VzLnB1c2goXG5cdFx0XHRcdFx0XHRuZXcgTW9kZWxSYXdMaW5lQ2hhbmdlZChcblx0XHRcdFx0XHRcdFx0ZWRpdExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRcdGN1cnJlbnRFZGl0TGluZU51bWJlclxuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZWRpdGluZ0xpbmVzQ250IDwgZGVsZXRpbmdMaW5lc0NudCkge1xuXHRcdFx0XHRcdC8vIE11c3QgZGVsZXRlIHNvbWUgbGluZXNcblx0XHRcdFx0XHRjb25zdCBzcGxpY2VTdGFydExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXIgKyBlZGl0aW5nTGluZXNDbnQ7XG5cdFx0XHRcdFx0Y29uc3QgY250ID0gaW5zZXJ0aW5nTGluZXNDbnQgLSBkZWxldGluZ0xpbmVzQ250O1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RVbnRvdWNoZWRMaW5lUG9zdEVkaXQgPSBuZXdMaW5lQ291bnQgLSBsaW5lQ291bnQgLSBjbnQgKyBzcGxpY2VTdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0cmF3Q29udGVudENoYW5nZXMucHVzaChuZXcgTW9kZWxSYXdMaW5lc0RlbGV0ZWQoc3BsaWNlU3RhcnRMaW5lTnVtYmVyICsgMSwgZW5kTGluZU51bWJlciwgbGFzdFVudG91Y2hlZExpbmVQb3N0RWRpdCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGVkaXRpbmdMaW5lc0NudCA8IGluc2VydGluZ0xpbmVzQ250KSB7XG5cdFx0XHRcdFx0Ly8gTXVzdCBpbnNlcnQgc29tZSBsaW5lc1xuXHRcdFx0XHRcdGNvbnN0IHNwbGljZUxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXIgKyBlZGl0aW5nTGluZXNDbnQ7XG5cdFx0XHRcdFx0Y29uc3QgY250ID0gaW5zZXJ0aW5nTGluZXNDbnQgLSBlZGl0aW5nTGluZXNDbnQ7XG5cdFx0XHRcdFx0Y29uc3QgZnJvbUxpbmVOdW1iZXIgPSBuZXdMaW5lQ291bnQgLSBsaW5lQ291bnQgLSBjbnQgKyBzcGxpY2VMaW5lTnVtYmVyICsgMTtcblx0XHRcdFx0XHRyYXdDb250ZW50Q2hhbmdlcy5wdXNoKFxuXHRcdFx0XHRcdFx0bmV3IE1vZGVsUmF3TGluZXNJbnNlcnRlZChcblx0XHRcdFx0XHRcdFx0c3BsaWNlTGluZU51bWJlciArIDEsXG5cdFx0XHRcdFx0XHRcdGZyb21MaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRjbnRcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGluZUNvdW50ICs9IGNoYW5nZUxpbmVDb3VudERlbHRhO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9lbWl0Q29udGVudENoYW5nZWRFdmVudChcblx0XHRcdFx0bmV3IE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudChcblx0XHRcdFx0XHRyYXdDb250ZW50Q2hhbmdlcyxcblx0XHRcdFx0XHR0aGlzLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0XHRcdHRoaXMuX2lzVW5kb2luZyxcblx0XHRcdFx0XHR0aGlzLl9pc1JlZG9pbmdcblx0XHRcdFx0KSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYW5nZXM6IGNvbnRlbnRDaGFuZ2VzLFxuXHRcdFx0XHRcdGVvbDogdGhpcy5fYnVmZmVyLmdldEVPTCgpLFxuXHRcdFx0XHRcdGlzRW9sQ2hhbmdlOiBmYWxzZSxcblx0XHRcdFx0XHR2ZXJzaW9uSWQ6IHRoaXMuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHRcdFx0aXNVbmRvaW5nOiB0aGlzLl9pc1VuZG9pbmcsXG5cdFx0XHRcdFx0aXNSZWRvaW5nOiB0aGlzLl9pc1JlZG9pbmcsXG5cdFx0XHRcdFx0aXNGbHVzaDogZmFsc2UsXG5cdFx0XHRcdFx0ZGV0YWlsZWRSZWFzb25zOiBbcmVhc29uXSxcblx0XHRcdFx0XHRkZXRhaWxlZFJlYXNvbnNDaGFuZ2VMZW5ndGhzOiBbY29udGVudENoYW5nZXMubGVuZ3RoXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVzdWx0aW5nU2VsZWN0aW9uXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiAocmVzdWx0LnJldmVyc2VFZGl0cyA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IHJlc3VsdC5yZXZlcnNlRWRpdHMpO1xuXHR9XG5cblx0cHVibGljIHVuZG8oKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl91bmRvUmVkb1NlcnZpY2UudW5kbyh0aGlzLnVyaSk7XG5cdH1cblxuXHRwdWJsaWMgY2FuVW5kbygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmNhblVuZG8odGhpcy51cmkpO1xuXHR9XG5cblx0cHVibGljIHJlZG8oKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl91bmRvUmVkb1NlcnZpY2UucmVkbyh0aGlzLnVyaSk7XG5cdH1cblxuXHRwdWJsaWMgY2FuUmVkbygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmNhblJlZG8odGhpcy51cmkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIERlY29yYXRpb25zXG5cblx0cHJpdmF0ZSBoYW5kbGVCZWZvcmVGaXJlRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQoYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lczogU2V0PG51bWJlcj4gfCBudWxsLCBhZmZlY3RlZExpbmVIZWlnaHRzOiBTZXQ8TGluZUhlaWdodENoYW5naW5nRGVjb3JhdGlvbj4gfCBudWxsLCBhZmZlY3RlZEZvbnRMaW5lczogU2V0PExpbmVGb250Q2hhbmdpbmdEZWNvcmF0aW9uPiB8IG51bGwpOiB2b2lkIHtcblx0XHQvLyBUaGlzIGlzIGNhbGxlZCBiZWZvcmUgdGhlIGRlY29yYXRpb24gY2hhbmdlZCBldmVudCBpcyBmaXJlZC5cblxuXHRcdGlmIChhZmZlY3RlZEluamVjdGVkVGV4dExpbmVzICYmIGFmZmVjdGVkSW5qZWN0ZWRUZXh0TGluZXMuc2l6ZSA+IDApIHtcblx0XHRcdGNvbnN0IGFmZmVjdGVkTGluZXMgPSBBcnJheS5mcm9tKGFmZmVjdGVkSW5qZWN0ZWRUZXh0TGluZXMpO1xuXHRcdFx0Y29uc3QgbGluZUNoYW5nZUV2ZW50cyA9IGFmZmVjdGVkTGluZXMubWFwKGxpbmVOdW1iZXIgPT4gbmV3IE1vZGVsUmF3TGluZUNoYW5nZWQobGluZU51bWJlciwgbGluZU51bWJlcikpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50T3JJbmplY3RlZFRleHQobmV3IE1vZGVsSW5qZWN0ZWRUZXh0Q2hhbmdlZEV2ZW50KGxpbmVDaGFuZ2VFdmVudHMpKTtcblx0XHR9XG5cdFx0dGhpcy5fZmlyZU9uRGlkQ2hhbmdlTGluZUhlaWdodChhZmZlY3RlZExpbmVIZWlnaHRzKTtcblx0XHR0aGlzLl9maXJlT25EaWRDaGFuZ2VGb250KGFmZmVjdGVkRm9udExpbmVzKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZpcmVPbkRpZENoYW5nZUxpbmVIZWlnaHQoYWZmZWN0ZWRMaW5lSGVpZ2h0czogU2V0PExpbmVIZWlnaHRDaGFuZ2luZ0RlY29yYXRpb24+IHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmIChhZmZlY3RlZExpbmVIZWlnaHRzICYmIGFmZmVjdGVkTGluZUhlaWdodHMuc2l6ZSA+IDApIHtcblx0XHRcdGNvbnN0IGFmZmVjdGVkTGluZXMgPSBBcnJheS5mcm9tKGFmZmVjdGVkTGluZUhlaWdodHMpO1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodENoYW5nZUV2ZW50ID0gYWZmZWN0ZWRMaW5lcy5tYXAoc3BlY2lhbExpbmVIZWlnaHRDaGFuZ2UgPT4gbmV3IE1vZGVsTGluZUhlaWdodENoYW5nZWQoc3BlY2lhbExpbmVIZWlnaHRDaGFuZ2Uub3duZXJJZCwgc3BlY2lhbExpbmVIZWlnaHRDaGFuZ2UuZGVjb3JhdGlvbklkLCBzcGVjaWFsTGluZUhlaWdodENoYW5nZS5saW5lTnVtYmVyLCBzcGVjaWFsTGluZUhlaWdodENoYW5nZS5saW5lSGVpZ2h0KSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxpbmVIZWlnaHQuZmlyZShuZXcgTW9kZWxMaW5lSGVpZ2h0Q2hhbmdlZEV2ZW50KGxpbmVIZWlnaHRDaGFuZ2VFdmVudCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpcmVPbkRpZENoYW5nZUZvbnQoYWZmZWN0ZWRGb250TGluZXM6IFNldDxMaW5lRm9udENoYW5naW5nRGVjb3JhdGlvbj4gfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKGFmZmVjdGVkRm9udExpbmVzICYmIGFmZmVjdGVkRm9udExpbmVzLnNpemUgPiAwKSB7XG5cdFx0XHRjb25zdCBhZmZlY3RlZExpbmVzID0gQXJyYXkuZnJvbShhZmZlY3RlZEZvbnRMaW5lcyk7XG5cdFx0XHRjb25zdCBmb250Q2hhbmdlRXZlbnQgPSBhZmZlY3RlZExpbmVzLm1hcChmb250Q2hhbmdlID0+IG5ldyBNb2RlbEZvbnRDaGFuZ2VkKGZvbnRDaGFuZ2Uub3duZXJJZCwgZm9udENoYW5nZS5saW5lTnVtYmVyKSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZvbnQuZmlyZShuZXcgTW9kZWxGb250Q2hhbmdlZEV2ZW50KGZvbnRDaGFuZ2VFdmVudCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQ29udGVudE9ySW5qZWN0ZWRUZXh0KGU6IEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgfCBNb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgdmlld01vZGVsIG9mIHRoaXMuX3ZpZXdNb2RlbHMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHZpZXdNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnRPckluamVjdGVkVGV4dChlKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCB2aWV3TW9kZWwgb2YgdGhpcy5fdmlld01vZGVscykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dmlld01vZGVsLmVtaXRDb250ZW50Q2hhbmdlRXZlbnQoZSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNoYW5nZURlY29yYXRpb25zPFQ+KGNhbGxiYWNrOiAoY2hhbmdlQWNjZXNzb3I6IG1vZGVsLklNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IpID0+IFQsIG93bmVySWQ6IG51bWJlciA9IDApOiBUIHwgbnVsbCB7XG5cdFx0dGhpcy5fYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmJlZ2luRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2hhbmdlRGVjb3JhdGlvbnMob3duZXJJZCwgY2FsbGJhY2spO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmVuZERlZmVycmVkRW1pdCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NoYW5nZURlY29yYXRpb25zPFQ+KG93bmVySWQ6IG51bWJlciwgY2FsbGJhY2s6IChjaGFuZ2VBY2Nlc3NvcjogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvcikgPT4gVCk6IFQgfCBudWxsIHtcblx0XHRjb25zdCBjaGFuZ2VBY2Nlc3NvcjogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvciA9IHtcblx0XHRcdGFkZERlY29yYXRpb246IChyYW5nZTogSVJhbmdlLCBvcHRpb25zOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyk6IHN0cmluZyA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9kZWx0YURlY29yYXRpb25zSW1wbChvd25lcklkLCBbXSwgW3sgcmFuZ2U6IHJhbmdlLCBvcHRpb25zOiBvcHRpb25zIH1dKVswXTtcblx0XHRcdH0sXG5cdFx0XHRjaGFuZ2VEZWNvcmF0aW9uOiAoaWQ6IHN0cmluZywgbmV3UmFuZ2U6IElSYW5nZSk6IHZvaWQgPT4ge1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VEZWNvcmF0aW9uSW1wbChvd25lcklkLCBpZCwgbmV3UmFuZ2UpO1xuXHRcdFx0fSxcblx0XHRcdGNoYW5nZURlY29yYXRpb25PcHRpb25zOiAoaWQ6IHN0cmluZywgb3B0aW9uczogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMpID0+IHtcblx0XHRcdFx0dGhpcy5fY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnNJbXBsKG93bmVySWQsIGlkLCBfbm9ybWFsaXplT3B0aW9ucyhvcHRpb25zKSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVtb3ZlRGVjb3JhdGlvbjogKGlkOiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRcdFx0dGhpcy5fZGVsdGFEZWNvcmF0aW9uc0ltcGwob3duZXJJZCwgW2lkXSwgW10pO1xuXHRcdFx0fSxcblx0XHRcdGRlbHRhRGVjb3JhdGlvbnM6IChvbGREZWNvcmF0aW9uczogc3RyaW5nW10sIG5ld0RlY29yYXRpb25zOiBtb2RlbC5JTW9kZWxEZWx0YURlY29yYXRpb25bXSk6IHN0cmluZ1tdID0+IHtcblx0XHRcdFx0aWYgKG9sZERlY29yYXRpb25zLmxlbmd0aCA9PT0gMCAmJiBuZXdEZWNvcmF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLl9kZWx0YURlY29yYXRpb25zSW1wbChvd25lcklkLCBvbGREZWNvcmF0aW9ucywgbmV3RGVjb3JhdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0bGV0IHJlc3VsdDogVCB8IG51bGwgPSBudWxsO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBjYWxsYmFjayhjaGFuZ2VBY2Nlc3Nvcik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0fVxuXHRcdC8vIEludmFsaWRhdGUgY2hhbmdlIGFjY2Vzc29yXG5cdFx0Y2hhbmdlQWNjZXNzb3IuYWRkRGVjb3JhdGlvbiA9IGludmFsaWRGdW5jO1xuXHRcdGNoYW5nZUFjY2Vzc29yLmNoYW5nZURlY29yYXRpb24gPSBpbnZhbGlkRnVuYztcblx0XHRjaGFuZ2VBY2Nlc3Nvci5jaGFuZ2VEZWNvcmF0aW9uT3B0aW9ucyA9IGludmFsaWRGdW5jO1xuXHRcdGNoYW5nZUFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24gPSBpbnZhbGlkRnVuYztcblx0XHRjaGFuZ2VBY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zID0gaW52YWxpZEZ1bmM7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBkZWx0YURlY29yYXRpb25zKG9sZERlY29yYXRpb25zOiBzdHJpbmdbXSwgbmV3RGVjb3JhdGlvbnM6IG1vZGVsLklNb2RlbERlbHRhRGVjb3JhdGlvbltdLCBvd25lcklkOiBudW1iZXIgPSAwKTogc3RyaW5nW10ge1xuXHRcdHRoaXMuX2Fzc2VydE5vdERpc3Bvc2VkKCk7XG5cdFx0aWYgKCFvbGREZWNvcmF0aW9ucykge1xuXHRcdFx0b2xkRGVjb3JhdGlvbnMgPSBbXTtcblx0XHR9XG5cdFx0aWYgKG9sZERlY29yYXRpb25zLmxlbmd0aCA9PT0gMCAmJiBuZXdEZWNvcmF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fZGVsdGFEZWNvcmF0aW9uQ2FsbENudCsrO1xuXHRcdFx0aWYgKHRoaXMuX2RlbHRhRGVjb3JhdGlvbkNhbGxDbnQgPiAxKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgSW52b2tpbmcgZGVsdGFEZWNvcmF0aW9ucyByZWN1cnNpdmVseSBjb3VsZCBsZWFkIHRvIGxlYWtpbmcgZGVjb3JhdGlvbnMuYCk7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBFcnJvcihgSW52b2tpbmcgZGVsdGFEZWNvcmF0aW9ucyByZWN1cnNpdmVseSBjb3VsZCBsZWFkIHRvIGxlYWtpbmcgZGVjb3JhdGlvbnMuYCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5iZWdpbkRlZmVycmVkRW1pdCgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RlbHRhRGVjb3JhdGlvbnNJbXBsKG93bmVySWQsIG9sZERlY29yYXRpb25zLCBuZXdEZWNvcmF0aW9ucyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuZW5kRGVmZXJyZWRFbWl0KCk7XG5cdFx0XHR0aGlzLl9kZWx0YURlY29yYXRpb25DYWxsQ250LS07XG5cdFx0fVxuXHR9XG5cblx0X2dldFRyYWNrZWRSYW5nZShpZDogc3RyaW5nKTogUmFuZ2UgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5nZXREZWNvcmF0aW9uUmFuZ2UoaWQpO1xuXHR9XG5cblx0X3NldFRyYWNrZWRSYW5nZShpZDogc3RyaW5nIHwgbnVsbCwgbmV3UmFuZ2U6IG51bGwsIG5ld1N0aWNraW5lc3M6IG1vZGVsLlRyYWNrZWRSYW5nZVN0aWNraW5lc3MpOiBudWxsO1xuXHRfc2V0VHJhY2tlZFJhbmdlKGlkOiBzdHJpbmcgfCBudWxsLCBuZXdSYW5nZTogUmFuZ2UsIG5ld1N0aWNraW5lc3M6IG1vZGVsLlRyYWNrZWRSYW5nZVN0aWNraW5lc3MpOiBzdHJpbmc7XG5cdF9zZXRUcmFja2VkUmFuZ2UoaWQ6IHN0cmluZyB8IG51bGwsIG5ld1JhbmdlOiBSYW5nZSB8IG51bGwsIG5ld1N0aWNraW5lc3M6IG1vZGVsLlRyYWNrZWRSYW5nZVN0aWNraW5lc3MpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCBub2RlID0gKGlkID8gdGhpcy5fZGVjb3JhdGlvbnNbaWRdIDogbnVsbCk7XG5cblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdGlmICghbmV3UmFuZ2UpIHtcblx0XHRcdFx0Ly8gbm9kZSBkb2Vzbid0IGV4aXN0LCB0aGUgcmVxdWVzdCBpcyB0byBkZWxldGUgPT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdC8vIG5vZGUgZG9lc24ndCBleGlzdCwgdGhlIHJlcXVlc3QgaXMgdG8gc2V0ID0+IGFkZCB0aGUgdHJhY2tlZCByYW5nZVxuXHRcdFx0cmV0dXJuIHRoaXMuX2RlbHRhRGVjb3JhdGlvbnNJbXBsKDAsIFtdLCBbeyByYW5nZTogbmV3UmFuZ2UsIG9wdGlvbnM6IFRSQUNLRURfUkFOR0VfT1BUSU9OU1tuZXdTdGlja2luZXNzXSB9XSwgdHJ1ZSlbMF07XG5cdFx0fVxuXG5cdFx0aWYgKCFuZXdSYW5nZSkge1xuXHRcdFx0Ly8gbm9kZSBleGlzdHMsIHRoZSByZXF1ZXN0IGlzIHRvIGRlbGV0ZSA9PiBkZWxldGUgbm9kZVxuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmRlbGV0ZShub2RlKTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9kZWNvcmF0aW9uc1tub2RlLmlkXTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdC8vIG5vZGUgZXhpc3RzLCB0aGUgcmVxdWVzdCBpcyB0byBzZXQgPT4gY2hhbmdlIHRoZSB0cmFja2VkIHJhbmdlIGFuZCBpdHMgb3B0aW9uc1xuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fdmFsaWRhdGVSYW5nZVJlbGF4ZWROb0FsbG9jYXRpb25zKG5ld1JhbmdlKTtcblx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMuX2J1ZmZlci5nZXRPZmZzZXRBdChyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQocmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZGVsZXRlKG5vZGUpO1xuXHRcdG5vZGUucmVzZXQodGhpcy5nZXRWZXJzaW9uSWQoKSwgc3RhcnRPZmZzZXQsIGVuZE9mZnNldCwgcmFuZ2UpO1xuXHRcdG5vZGUuc2V0T3B0aW9ucyhUUkFDS0VEX1JBTkdFX09QVElPTlNbbmV3U3RpY2tpbmVzc10pO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5pbnNlcnQobm9kZSk7XG5cdFx0cmV0dXJuIG5vZGUuaWQ7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlQWxsRGVjb3JhdGlvbnNXaXRoT3duZXJJZChvd25lcklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBub2RlcyA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5jb2xsZWN0Tm9kZXNGcm9tT3duZXIob3duZXJJZCk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG5vZGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBub2RlID0gbm9kZXNbaV07XG5cblx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5kZWxldGUobm9kZSk7XG5cdFx0XHRkZWxldGUgdGhpcy5fZGVjb3JhdGlvbnNbbm9kZS5pZF07XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldERlY29yYXRpb25PcHRpb25zKGRlY29yYXRpb25JZDogc3RyaW5nKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfCBudWxsIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5fZGVjb3JhdGlvbnNbZGVjb3JhdGlvbklkXTtcblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gbm9kZS5vcHRpb25zO1xuXHR9XG5cblx0cHVibGljIGdldERlY29yYXRpb25SYW5nZShkZWNvcmF0aW9uSWQ6IHN0cmluZyk6IFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuX2RlY29yYXRpb25zW2RlY29yYXRpb25JZF07XG5cdFx0aWYgKCFub2RlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXROb2RlUmFuZ2UodGhpcywgbm9kZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZURlY29yYXRpb25zKGxpbmVOdW1iZXI6IG51bWJlciwgb3duZXJJZDogbnVtYmVyID0gMCwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiA9IGZhbHNlLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4gPSBmYWxzZSk6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPCAxIHx8IGxpbmVOdW1iZXIgPiB0aGlzLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldExpbmVzRGVjb3JhdGlvbnMobGluZU51bWJlciwgbGluZU51bWJlciwgb3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lc0RlY29yYXRpb25zKF9zdGFydExpbmVOdW1iZXI6IG51bWJlciwgX2VuZExpbmVOdW1iZXI6IG51bWJlciwgb3duZXJJZDogbnVtYmVyID0gMCwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiA9IGZhbHNlLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4gPSBmYWxzZSwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuID0gZmFsc2UpOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gTWF0aC5taW4obGluZUNvdW50LCBNYXRoLm1heCgxLCBfc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IE1hdGgubWluKGxpbmVDb3VudCwgTWF0aC5tYXgoMSwgX2VuZExpbmVOdW1iZXIpKTtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSB0aGlzLmdldExpbmVNYXhDb2x1bW4oZW5kTGluZU51bWJlcik7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCAxLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLl9nZXREZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2UsIG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHRwdXNoTWFueShkZWNvcmF0aW9ucywgdGhpcy5fZGVjb3JhdGlvblByb3ZpZGVyLmdldERlY29yYXRpb25zSW5SYW5nZShyYW5nZSwgb3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zKSk7XG5cdFx0cHVzaE1hbnkoZGVjb3JhdGlvbnMsIHRoaXMuX2ZvbnRUb2tlbkRlY29yYXRpb25zUHJvdmlkZXIuZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlLCBvd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMpKTtcblx0XHRyZXR1cm4gZGVjb3JhdGlvbnM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlOiBJUmFuZ2UsIG93bmVySWQ6IG51bWJlciA9IDAsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4gPSBmYWxzZSwgZmlsdGVyRm9udERlY29yYXRpb25zOiBib29sZWFuID0gZmFsc2UsIG9ubHlNaW5pbWFwRGVjb3JhdGlvbnM6IGJvb2xlYW4gPSBmYWxzZSwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuID0gZmFsc2UpOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IHZhbGlkYXRlZFJhbmdlID0gdGhpcy52YWxpZGF0ZVJhbmdlKHJhbmdlKTtcblxuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5fZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHZhbGlkYXRlZFJhbmdlLCBvd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIG9ubHlNYXJnaW5EZWNvcmF0aW9ucyk7XG5cdFx0cHVzaE1hbnkoZGVjb3JhdGlvbnMsIHRoaXMuX2RlY29yYXRpb25Qcm92aWRlci5nZXREZWNvcmF0aW9uc0luUmFuZ2UodmFsaWRhdGVkUmFuZ2UsIG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgb25seU1pbmltYXBEZWNvcmF0aW9ucykpO1xuXHRcdHB1c2hNYW55KGRlY29yYXRpb25zLCB0aGlzLl9mb250VG9rZW5EZWNvcmF0aW9uc1Byb3ZpZGVyLmdldERlY29yYXRpb25zSW5SYW5nZSh2YWxpZGF0ZWRSYW5nZSwgb3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBvbmx5TWluaW1hcERlY29yYXRpb25zKSk7XG5cdFx0cmV0dXJuIGRlY29yYXRpb25zO1xuXHR9XG5cblx0cHVibGljIGdldE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucyhvd25lcklkOiBudW1iZXIgPSAwLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuID0gZmFsc2UsIGZpbHRlckZvbnREZWNvcmF0aW9uczogYm9vbGVhbiA9IGZhbHNlKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldEFsbCh0aGlzLCBvd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIHRydWUsIGZhbHNlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbmplY3RlZFRleHREZWNvcmF0aW9ucyhvd25lcklkOiBudW1iZXIgPSAwKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldEFsbEluamVjdGVkVGV4dCh0aGlzLCBvd25lcklkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDdXN0b21MaW5lSGVpZ2h0c0RlY29yYXRpb25zKG93bmVySWQ6IG51bWJlciA9IDApOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IGRlY3MgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0QWxsQ3VzdG9tTGluZUhlaWdodHModGhpcywgb3duZXJJZCk7XG5cdFx0cHVzaE1hbnkoZGVjcywgdGhpcy5fZm9udFRva2VuRGVjb3JhdGlvbnNQcm92aWRlci5nZXRBbGxEZWNvcmF0aW9ucyhvd25lcklkKSk7XG5cdFx0cmV0dXJuIGRlY3M7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q3VzdG9tTGluZUhlaWdodHNEZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2U6IFJhbmdlLCBvd25lcklkOiBudW1iZXIgPSAwKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCBkZWNzID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldEN1c3RvbUxpbmVIZWlnaHRzSW5JbnRlcnZhbCh0aGlzLCB0aGlzLmdldE9mZnNldEF0KHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSksIHRoaXMuZ2V0T2Zmc2V0QXQocmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSksIG93bmVySWQpO1xuXHRcdHB1c2hNYW55KGRlY3MsIHRoaXMuX2ZvbnRUb2tlbkRlY29yYXRpb25zUHJvdmlkZXIuZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlLCBvd25lcklkKSk7XG5cdFx0cmV0dXJuIGRlY3M7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUluamVjdGVkVGV4dChsaW5lTnVtYmVyOiBudW1iZXIsIG93bmVySWQ6IG51bWJlciA9IDApOiBMaW5lSW5qZWN0ZWRUZXh0W10ge1xuXHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdGhpcy5fYnVmZmVyLmdldE9mZnNldEF0KGxpbmVOdW1iZXIsIDEpO1xuXHRcdGNvbnN0IGVuZE9mZnNldCA9IHN0YXJ0T2Zmc2V0ICsgdGhpcy5fYnVmZmVyLmdldExpbmVMZW5ndGgobGluZU51bWJlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0SW5qZWN0ZWRUZXh0SW5JbnRlcnZhbCh0aGlzLCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0LCBvd25lcklkKTtcblx0XHRyZXR1cm4gTGluZUluamVjdGVkVGV4dC5mcm9tRGVjb3JhdGlvbnMocmVzdWx0KS5maWx0ZXIodCA9PiB0LmxpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldEZvbnREZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2U6IElSYW5nZSwgb3duZXJJZDogbnVtYmVyID0gMCk6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbik7XG5cdFx0Y29uc3QgZW5kT2Zmc2V0ID0gdGhpcy5fYnVmZmVyLmdldE9mZnNldEF0KHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cdFx0cmV0dXJuIHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXRGb250RGVjb3JhdGlvbnNJbkludGVydmFsKHRoaXMsIHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQsIG93bmVySWQpO1xuXHR9XG5cblx0cHVibGljIGdldEFsbERlY29yYXRpb25zKG93bmVySWQ6IG51bWJlciA9IDAsIGZpbHRlck91dFZhbGlkYXRpb246IGJvb2xlYW4gPSBmYWxzZSwgZmlsdGVyRm9udERlY29yYXRpb25zOiBib29sZWFuID0gZmFsc2UpOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0QWxsKHRoaXMsIG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgZmFsc2UsIGZhbHNlKTtcblx0XHRyZXN1bHQgPSByZXN1bHQuY29uY2F0KHRoaXMuX2RlY29yYXRpb25Qcm92aWRlci5nZXRBbGxEZWNvcmF0aW9ucyhvd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uKSk7XG5cdFx0cmVzdWx0ID0gcmVzdWx0LmNvbmNhdCh0aGlzLl9mb250VG9rZW5EZWNvcmF0aW9uc1Byb3ZpZGVyLmdldEFsbERlY29yYXRpb25zKG93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24pKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldEFsbE1hcmdpbkRlY29yYXRpb25zKG93bmVySWQ6IG51bWJlciA9IDApOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0QWxsKHRoaXMsIG93bmVySWQsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVjb3JhdGlvbnNJblJhbmdlKGZpbHRlclJhbmdlOiBSYW5nZSwgZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIG9ubHlNYXJnaW5EZWNvcmF0aW9uczogYm9vbGVhbik6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQoZmlsdGVyUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBmaWx0ZXJSYW5nZS5zdGFydENvbHVtbik7XG5cdFx0Y29uc3QgZW5kT2Zmc2V0ID0gdGhpcy5fYnVmZmVyLmdldE9mZnNldEF0KGZpbHRlclJhbmdlLmVuZExpbmVOdW1iZXIsIGZpbHRlclJhbmdlLmVuZENvbHVtbik7XG5cdFx0cmV0dXJuIHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXRBbGxJbkludGVydmFsKHRoaXMsIHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQsIGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRSYW5nZUF0KHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogUmFuZ2Uge1xuXHRcdHJldHVybiB0aGlzLl9idWZmZXIuZ2V0UmFuZ2VBdChzdGFydCwgZW5kIC0gc3RhcnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2hhbmdlRGVjb3JhdGlvbkltcGwob3duZXJJZDogbnVtYmVyLCBkZWNvcmF0aW9uSWQ6IHN0cmluZywgX3JhbmdlOiBJUmFuZ2UpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5fZGVjb3JhdGlvbnNbZGVjb3JhdGlvbklkXTtcblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAobm9kZS5vcHRpb25zLmFmdGVyKSB7XG5cdFx0XHRjb25zdCBvbGRSYW5nZSA9IHRoaXMuZ2V0RGVjb3JhdGlvblJhbmdlKGRlY29yYXRpb25JZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5SW5qZWN0ZWRUZXh0KG9sZFJhbmdlIS5lbmRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdFx0aWYgKG5vZGUub3B0aW9ucy5iZWZvcmUpIHtcblx0XHRcdGNvbnN0IG9sZFJhbmdlID0gdGhpcy5nZXREZWNvcmF0aW9uUmFuZ2UoZGVjb3JhdGlvbklkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlJbmplY3RlZFRleHQob2xkUmFuZ2UhLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXHRcdGlmIChub2RlLm9wdGlvbnMubGluZUhlaWdodCAhPT0gbnVsbCkge1xuXHRcdFx0Y29uc3Qgb2xkUmFuZ2UgPSB0aGlzLmdldERlY29yYXRpb25SYW5nZShkZWNvcmF0aW9uSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUxpbmVIZWlnaHRDaGFuZ2Uob3duZXJJZCwgZGVjb3JhdGlvbklkLCBvbGRSYW5nZSEuc3RhcnRMaW5lTnVtYmVyLCBudWxsKTtcblx0XHR9XG5cdFx0aWYgKG5vZGUub3B0aW9ucy5hZmZlY3RzRm9udCkge1xuXHRcdFx0Y29uc3Qgb2xkUmFuZ2UgPSB0aGlzLmdldERlY29yYXRpb25SYW5nZShkZWNvcmF0aW9uSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUZvbnRDaGFuZ2Uob3duZXJJZCwgbm9kZS5pZCwgb2xkUmFuZ2UhLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl92YWxpZGF0ZVJhbmdlUmVsYXhlZE5vQWxsb2NhdGlvbnMoX3JhbmdlKTtcblx0XHRjb25zdCBzdGFydE9mZnNldCA9IHRoaXMuX2J1ZmZlci5nZXRPZmZzZXRBdChyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRjb25zdCBlbmRPZmZzZXQgPSB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQocmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblxuXHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5kZWxldGUobm9kZSk7XG5cdFx0bm9kZS5yZXNldCh0aGlzLmdldFZlcnNpb25JZCgpLCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0LCByYW5nZSk7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmluc2VydChub2RlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmNoZWNrQWZmZWN0ZWRBbmRGaXJlKG5vZGUub3B0aW9ucyk7XG5cblx0XHRpZiAobm9kZS5vcHRpb25zLmFmdGVyKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5SW5qZWN0ZWRUZXh0KHJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdH1cblx0XHRpZiAobm9kZS5vcHRpb25zLmJlZm9yZSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUluamVjdGVkVGV4dChyYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdH1cblx0XHRpZiAobm9kZS5vcHRpb25zLmxpbmVIZWlnaHQgIT09IG51bGwpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlMaW5lSGVpZ2h0Q2hhbmdlKG93bmVySWQsIGRlY29yYXRpb25JZCwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBub2RlLm9wdGlvbnMubGluZUhlaWdodCk7XG5cdFx0fVxuXHRcdGlmIChub2RlLm9wdGlvbnMuYWZmZWN0c0ZvbnQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlGb250Q2hhbmdlKG93bmVySWQsIG5vZGUuaWQsIHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnNJbXBsKG93bmVySWQ6IG51bWJlciwgZGVjb3JhdGlvbklkOiBzdHJpbmcsIG9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5fZGVjb3JhdGlvbnNbZGVjb3JhdGlvbklkXTtcblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlV2FzSW5PdmVydmlld1J1bGVyID0gKG5vZGUub3B0aW9ucy5vdmVydmlld1J1bGVyICYmIG5vZGUub3B0aW9ucy5vdmVydmlld1J1bGVyLmNvbG9yID8gdHJ1ZSA6IGZhbHNlKTtcblx0XHRjb25zdCBub2RlSXNJbk92ZXJ2aWV3UnVsZXIgPSAob3B0aW9ucy5vdmVydmlld1J1bGVyICYmIG9wdGlvbnMub3ZlcnZpZXdSdWxlci5jb2xvciA/IHRydWUgOiBmYWxzZSk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmNoZWNrQWZmZWN0ZWRBbmRGaXJlKG5vZGUub3B0aW9ucyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5jaGVja0FmZmVjdGVkQW5kRmlyZShvcHRpb25zKTtcblxuXHRcdGlmIChub2RlLm9wdGlvbnMuYWZ0ZXIgfHwgb3B0aW9ucy5hZnRlcikge1xuXHRcdFx0Y29uc3Qgbm9kZVJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldE5vZGVSYW5nZSh0aGlzLCBub2RlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlJbmplY3RlZFRleHQobm9kZVJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdH1cblx0XHRpZiAobm9kZS5vcHRpb25zLmJlZm9yZSB8fCBvcHRpb25zLmJlZm9yZSkge1xuXHRcdFx0Y29uc3Qgbm9kZVJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldE5vZGVSYW5nZSh0aGlzLCBub2RlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlJbmplY3RlZFRleHQobm9kZVJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXHRcdGlmIChub2RlLm9wdGlvbnMubGluZUhlaWdodCAhPT0gbnVsbCB8fCBvcHRpb25zLmxpbmVIZWlnaHQgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IG5vZGVSYW5nZSA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXROb2RlUmFuZ2UodGhpcywgbm9kZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5TGluZUhlaWdodENoYW5nZShvd25lcklkLCBkZWNvcmF0aW9uSWQsIG5vZGVSYW5nZS5zdGFydExpbmVOdW1iZXIsIG9wdGlvbnMubGluZUhlaWdodCk7XG5cdFx0fVxuXHRcdGlmIChub2RlLm9wdGlvbnMuYWZmZWN0c0ZvbnQgfHwgb3B0aW9ucy5hZmZlY3RzRm9udCkge1xuXHRcdFx0Y29uc3Qgbm9kZVJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldE5vZGVSYW5nZSh0aGlzLCBub2RlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlGb250Q2hhbmdlKG93bmVySWQsIGRlY29yYXRpb25JZCwgbm9kZVJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW92ZWRJbk92ZXJ2aWV3UnVsZXIgPSBub2RlV2FzSW5PdmVydmlld1J1bGVyICE9PSBub2RlSXNJbk92ZXJ2aWV3UnVsZXI7XG5cdFx0Y29uc3QgY2hhbmdlZFdoZXRoZXJJbmplY3RlZFRleHQgPSBpc09wdGlvbnNJbmplY3RlZFRleHQob3B0aW9ucykgIT09IGlzTm9kZUluamVjdGVkVGV4dChub2RlKTtcblx0XHRpZiAobW92ZWRJbk92ZXJ2aWV3UnVsZXIgfHwgY2hhbmdlZFdoZXRoZXJJbmplY3RlZFRleHQpIHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZS5kZWxldGUobm9kZSk7XG5cdFx0XHRub2RlLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuaW5zZXJ0KG5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRub2RlLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVsdGFEZWNvcmF0aW9uc0ltcGwob3duZXJJZDogbnVtYmVyLCBvbGREZWNvcmF0aW9uc0lkczogc3RyaW5nW10sIG5ld0RlY29yYXRpb25zOiBtb2RlbC5JTW9kZWxEZWx0YURlY29yYXRpb25bXSwgc3VwcHJlc3NFdmVudHM6IGJvb2xlYW4gPSBmYWxzZSk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCB2ZXJzaW9uSWQgPSB0aGlzLmdldFZlcnNpb25JZCgpO1xuXG5cdFx0Y29uc3Qgb2xkRGVjb3JhdGlvbnNMZW4gPSBvbGREZWNvcmF0aW9uc0lkcy5sZW5ndGg7XG5cdFx0bGV0IG9sZERlY29yYXRpb25JbmRleCA9IDA7XG5cblx0XHRjb25zdCBuZXdEZWNvcmF0aW9uc0xlbiA9IG5ld0RlY29yYXRpb25zLmxlbmd0aDtcblx0XHRsZXQgbmV3RGVjb3JhdGlvbkluZGV4ID0gMDtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMuYmVnaW5EZWZlcnJlZEVtaXQoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IEFycmF5PHN0cmluZz4obmV3RGVjb3JhdGlvbnNMZW4pO1xuXHRcdFx0d2hpbGUgKG9sZERlY29yYXRpb25JbmRleCA8IG9sZERlY29yYXRpb25zTGVuIHx8IG5ld0RlY29yYXRpb25JbmRleCA8IG5ld0RlY29yYXRpb25zTGVuKSB7XG5cblx0XHRcdFx0bGV0IG5vZGU6IEludGVydmFsTm9kZSB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRcdGlmIChvbGREZWNvcmF0aW9uSW5kZXggPCBvbGREZWNvcmF0aW9uc0xlbikge1xuXHRcdFx0XHRcdC8vICgxKSBnZXQgb3Vyc2VsdmVzIGFuIG9sZCBub2RlXG5cdFx0XHRcdFx0bGV0IGRlY29yYXRpb25JZDogc3RyaW5nO1xuXHRcdFx0XHRcdGRvIHtcblx0XHRcdFx0XHRcdGRlY29yYXRpb25JZCA9IG9sZERlY29yYXRpb25zSWRzW29sZERlY29yYXRpb25JbmRleCsrXTtcblx0XHRcdFx0XHRcdG5vZGUgPSB0aGlzLl9kZWNvcmF0aW9uc1tkZWNvcmF0aW9uSWRdO1xuXHRcdFx0XHRcdH0gd2hpbGUgKCFub2RlICYmIG9sZERlY29yYXRpb25JbmRleCA8IG9sZERlY29yYXRpb25zTGVuKTtcblxuXHRcdFx0XHRcdC8vICgyKSByZW1vdmUgdGhlIG5vZGUgZnJvbSB0aGUgdHJlZSAoaWYgaXQgZXhpc3RzKVxuXHRcdFx0XHRcdGlmIChub2RlKSB7XG5cdFx0XHRcdFx0XHRpZiAobm9kZS5vcHRpb25zLmFmdGVyKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5vZGVSYW5nZSA9IHRoaXMuX2RlY29yYXRpb25zVHJlZS5nZXROb2RlUmFuZ2UodGhpcywgbm9kZSk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlJbmplY3RlZFRleHQobm9kZVJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKG5vZGUub3B0aW9ucy5iZWZvcmUpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgbm9kZVJhbmdlID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlLmdldE5vZGVSYW5nZSh0aGlzLCBub2RlKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUluamVjdGVkVGV4dChub2RlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChub2RlLm9wdGlvbnMubGluZUhlaWdodCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBub2RlUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0Tm9kZVJhbmdlKHRoaXMsIG5vZGUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5TGluZUhlaWdodENoYW5nZShvd25lcklkLCBkZWNvcmF0aW9uSWQsIG5vZGVSYW5nZS5zdGFydExpbmVOdW1iZXIsIG51bGwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKG5vZGUub3B0aW9ucy5hZmZlY3RzRm9udCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBub2RlUmFuZ2UgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUuZ2V0Tm9kZVJhbmdlKHRoaXMsIG5vZGUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5Rm9udENoYW5nZShvd25lcklkLCBkZWNvcmF0aW9uSWQsIG5vZGVSYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlLmRlbGV0ZShub2RlKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFzdXBwcmVzc0V2ZW50cykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLmNoZWNrQWZmZWN0ZWRBbmRGaXJlKG5vZGUub3B0aW9ucyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG5ld0RlY29yYXRpb25JbmRleCA8IG5ld0RlY29yYXRpb25zTGVuKSB7XG5cdFx0XHRcdFx0Ly8gKDMpIGNyZWF0ZSBhIG5ldyBub2RlIGlmIG5lY2Vzc2FyeVxuXHRcdFx0XHRcdGlmICghbm9kZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW50ZXJuYWxEZWNvcmF0aW9uSWQgPSAoKyt0aGlzLl9sYXN0RGVjb3JhdGlvbklkKTtcblx0XHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25JZCA9IGAke3RoaXMuX2luc3RhbmNlSWR9OyR7aW50ZXJuYWxEZWNvcmF0aW9uSWR9YDtcblx0XHRcdFx0XHRcdG5vZGUgPSBuZXcgSW50ZXJ2YWxOb2RlKGRlY29yYXRpb25JZCwgMCwgMCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1tkZWNvcmF0aW9uSWRdID0gbm9kZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyAoNCkgaW5pdGlhbGl6ZSBub2RlXG5cdFx0XHRcdFx0Y29uc3QgbmV3RGVjb3JhdGlvbiA9IG5ld0RlY29yYXRpb25zW25ld0RlY29yYXRpb25JbmRleF07XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl92YWxpZGF0ZVJhbmdlUmVsYXhlZE5vQWxsb2NhdGlvbnMobmV3RGVjb3JhdGlvbi5yYW5nZSk7XG5cdFx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IF9ub3JtYWxpemVPcHRpb25zKG5ld0RlY29yYXRpb24ub3B0aW9ucyk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLl9idWZmZXIuZ2V0T2Zmc2V0QXQocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbik7XG5cdFx0XHRcdFx0Y29uc3QgZW5kT2Zmc2V0ID0gdGhpcy5fYnVmZmVyLmdldE9mZnNldEF0KHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cblx0XHRcdFx0XHRub2RlLm93bmVySWQgPSBvd25lcklkO1xuXHRcdFx0XHRcdG5vZGUucmVzZXQodmVyc2lvbklkLCBzdGFydE9mZnNldCwgZW5kT2Zmc2V0LCByYW5nZSk7XG5cdFx0XHRcdFx0bm9kZS5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0XHRcdFx0aWYgKG5vZGUub3B0aW9ucy5hZnRlcikge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUluamVjdGVkVGV4dChyYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG5vZGUub3B0aW9ucy5iZWZvcmUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGVjb3JhdGlvbnMucmVjb3JkTGluZUFmZmVjdGVkQnlJbmplY3RlZFRleHQocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG5vZGUub3B0aW9ucy5saW5lSGVpZ2h0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURlY29yYXRpb25zLnJlY29yZExpbmVBZmZlY3RlZEJ5TGluZUhlaWdodENoYW5nZShvd25lcklkLCBub2RlLmlkLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIG5vZGUub3B0aW9ucy5saW5lSGVpZ2h0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG5vZGUub3B0aW9ucy5hZmZlY3RzRm9udCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5yZWNvcmRMaW5lQWZmZWN0ZWRCeUZvbnRDaGFuZ2Uob3duZXJJZCwgbm9kZS5pZCwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFzdXBwcmVzc0V2ZW50cykge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5jaGVja0FmZmVjdGVkQW5kRmlyZShvcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUuaW5zZXJ0KG5vZGUpO1xuXG5cdFx0XHRcdFx0cmVzdWx0W25ld0RlY29yYXRpb25JbmRleF0gPSBub2RlLmlkO1xuXG5cdFx0XHRcdFx0bmV3RGVjb3JhdGlvbkluZGV4Kys7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9kZWNvcmF0aW9uc1tub2RlLmlkXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEZWNvcmF0aW9ucy5lbmREZWZlcnJlZEVtaXQoKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gVG9rZW5pemF0aW9uXG5cblx0Ly8gVE9ETyBtb3ZlIHRoZW0gdG8gdGhlIHRva2VuaXphdGlvbiBwYXJ0LlxuXHRwdWJsaWMgZ2V0TGFuZ3VhZ2VJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnRva2VuaXphdGlvbi5nZXRMYW5ndWFnZUlkKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZE9yU2VsZWN0aW9uOiBzdHJpbmcgfCBJTGFuZ3VhZ2VTZWxlY3Rpb24sIHNvdXJjZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5fbGFuZ3VhZ2VTZWxlY3Rpb25MaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0dGhpcy5fc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZE9yU2VsZWN0aW9uLCBzb3VyY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sYW5ndWFnZVNlbGVjdGlvbkxpc3RlbmVyLnZhbHVlID0gbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX3NldExhbmd1YWdlKGxhbmd1YWdlSWRPclNlbGVjdGlvbi5sYW5ndWFnZUlkLCBzb3VyY2UpKTtcblx0XHRcdHRoaXMuX3NldExhbmd1YWdlKGxhbmd1YWdlSWRPclNlbGVjdGlvbi5sYW5ndWFnZUlkLCBzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldExhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZywgc291cmNlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy50b2tlbml6YXRpb24uc2V0TGFuZ3VhZ2VJZChsYW5ndWFnZUlkLCBzb3VyY2UpO1xuXHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZS5yZXF1ZXN0UmljaExhbmd1YWdlRmVhdHVyZXMobGFuZ3VhZ2VJZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudG9rZW5pemF0aW9uLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V29yZEF0UG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbik6IElXb3JkQXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmdldFdvcmRBdFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXb3JkVW50aWxQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uKTogSVdvcmRBdFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5nZXRXb3JkVW50aWxQb3NpdGlvbihwb3NpdGlvbik7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblx0bm9ybWFsaXplUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCBhZmZpbml0eTogbW9kZWwuUG9zaXRpb25BZmZpbml0eSk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gcG9zaXRpb247XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgY29sdW1uIGF0IHdoaWNoIGluZGVudGF0aW9uIHN0b3BzIGF0IGEgZ2l2ZW4gbGluZS5cblx0ICogQGludGVybmFsXG5cdCovXG5cdHB1YmxpYyBnZXRMaW5lSW5kZW50Q29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Ly8gQ29sdW1ucyBzdGFydCB3aXRoIDEuXG5cdFx0cmV0dXJuIGluZGVudE9mTGluZSh0aGlzLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpKSArIDE7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYFRleHRNb2RlbCgke3RoaXMudXJpLnRvU3RyaW5nKCl9KWA7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExpbmVUb2tlbnNXaXRoSW5qZWN0aW9ucyh0b2tlbnM6IExpbmVUb2tlbnMsIGluamVjdGlvbk9wdGlvbnM6IG1vZGVsLkluamVjdGVkVGV4dE9wdGlvbnNbXSB8IG51bGwsIGluamVjdGlvbk9mZnNldHM6IG51bWJlcltdIHwgbnVsbCk6IExpbmVUb2tlbnMge1xuXHRsZXQgbGluZVRva2VuczogTGluZVRva2Vucztcblx0aWYgKGluamVjdGlvbk9mZnNldHMpIHtcblx0XHRjb25zdCB0b2tlbnNUb0luc2VydDogeyBvZmZzZXQ6IG51bWJlcjsgdGV4dDogc3RyaW5nOyB0b2tlbk1ldGFkYXRhOiBudW1iZXIgfVtdID0gW107XG5cblx0XHRmb3IgKGxldCBpZHggPSAwOyBpZHggPCBpbmplY3Rpb25PZmZzZXRzLmxlbmd0aDsgaWR4KyspIHtcblx0XHRcdGNvbnN0IG9mZnNldCA9IGluamVjdGlvbk9mZnNldHNbaWR4XTtcblx0XHRcdGNvbnN0IHRva2VucyA9IGluamVjdGlvbk9wdGlvbnMhW2lkeF0udG9rZW5zO1xuXHRcdFx0aWYgKHRva2Vucykge1xuXHRcdFx0XHR0b2tlbnMuZm9yRWFjaCgocmFuZ2UsIGluZm8pID0+IHtcblx0XHRcdFx0XHR0b2tlbnNUb0luc2VydC5wdXNoKHtcblx0XHRcdFx0XHRcdG9mZnNldCxcblx0XHRcdFx0XHRcdHRleHQ6IHJhbmdlLnN1YnN0cmluZyhpbmplY3Rpb25PcHRpb25zIVtpZHhdLmNvbnRlbnQpLFxuXHRcdFx0XHRcdFx0dG9rZW5NZXRhZGF0YTogaW5mby5tZXRhZGF0YSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b2tlbnNUb0luc2VydC5wdXNoKHtcblx0XHRcdFx0XHRvZmZzZXQsXG5cdFx0XHRcdFx0dGV4dDogaW5qZWN0aW9uT3B0aW9ucyFbaWR4XS5jb250ZW50LFxuXHRcdFx0XHRcdHRva2VuTWV0YWRhdGE6IExpbmVUb2tlbnMuZGVmYXVsdFRva2VuTWV0YWRhdGEsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRsaW5lVG9rZW5zID0gdG9rZW5zLndpdGhJbnNlcnRlZCh0b2tlbnNUb0luc2VydCk7XG5cdH0gZWxzZSB7XG5cdFx0bGluZVRva2VucyA9IHRva2Vucztcblx0fVxuXHRyZXR1cm4gbGluZVRva2Vucztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGluZGVudE9mTGluZShsaW5lOiBzdHJpbmcpOiBudW1iZXIge1xuXHRsZXQgaW5kZW50ID0gMDtcblx0Zm9yIChjb25zdCBjIG9mIGxpbmUpIHtcblx0XHRpZiAoYyA9PT0gJyAnIHx8IGMgPT09ICdcXHQnKSB7XG5cdFx0XHRpbmRlbnQrKztcblx0XHR9IGVsc2Uge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBpbmRlbnQ7XG59XG5cbi8vI3JlZ2lvbiBEZWNvcmF0aW9uc1xuXG5mdW5jdGlvbiBpc05vZGVJbk92ZXJ2aWV3UnVsZXIobm9kZTogSW50ZXJ2YWxOb2RlKTogYm9vbGVhbiB7XG5cdHJldHVybiAobm9kZS5vcHRpb25zLm92ZXJ2aWV3UnVsZXIgJiYgbm9kZS5vcHRpb25zLm92ZXJ2aWV3UnVsZXIuY29sb3IgPyB0cnVlIDogZmFsc2UpO1xufVxuXG5mdW5jdGlvbiBpc09wdGlvbnNJbmplY3RlZFRleHQob3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFvcHRpb25zLmFmdGVyIHx8ICEhb3B0aW9ucy5iZWZvcmU7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZUluamVjdGVkVGV4dChub2RlOiBJbnRlcnZhbE5vZGUpOiBib29sZWFuIHtcblx0cmV0dXJuICEhbm9kZS5vcHRpb25zLmFmdGVyIHx8ICEhbm9kZS5vcHRpb25zLmJlZm9yZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGVjb3JhdGlvbnNUcmVlc0hvc3Qge1xuXHRnZXRWZXJzaW9uSWQoKTogbnVtYmVyO1xuXHRnZXRSYW5nZUF0KHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogUmFuZ2U7XG59XG5cbmNsYXNzIERlY29yYXRpb25zVHJlZXMge1xuXG5cdC8qKlxuXHQgKiBUaGlzIHRyZWUgaG9sZHMgZGVjb3JhdGlvbnMgdGhhdCBkbyBub3Qgc2hvdyB1cCBpbiB0aGUgb3ZlcnZpZXcgcnVsZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uc1RyZWUwOiBJbnRlcnZhbFRyZWU7XG5cblx0LyoqXG5cdCAqIFRoaXMgdHJlZSBob2xkcyBkZWNvcmF0aW9ucyB0aGF0IHNob3cgdXAgaW4gdGhlIG92ZXJ2aWV3IHJ1bGVyLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnNUcmVlMTogSW50ZXJ2YWxUcmVlO1xuXG5cdC8qKlxuXHQgKiBUaGlzIHRyZWUgaG9sZHMgZGVjb3JhdGlvbnMgdGhhdCBjb250YWluIGluamVjdGVkIHRleHQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWU6IEludGVydmFsVHJlZTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUwID0gbmV3IEludGVydmFsVHJlZSgpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZTEgPSBuZXcgSW50ZXJ2YWxUcmVlKCk7XG5cdFx0dGhpcy5faW5qZWN0ZWRUZXh0RGVjb3JhdGlvbnNUcmVlID0gbmV3IEludGVydmFsVHJlZSgpO1xuXHR9XG5cblx0cHVibGljIGVuc3VyZUFsbE5vZGVzSGF2ZVJhbmdlcyhob3N0OiBJRGVjb3JhdGlvbnNUcmVlc0hvc3QpOiB2b2lkIHtcblx0XHR0aGlzLmdldEFsbChob3N0LCAwLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVOb2Rlc0hhdmVSYW5nZXMoaG9zdDogSURlY29yYXRpb25zVHJlZXNIb3N0LCBub2RlczogSW50ZXJ2YWxOb2RlW10pOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuXHRcdFx0aWYgKG5vZGUucmFuZ2UgPT09IG51bGwpIHtcblx0XHRcdFx0bm9kZS5yYW5nZSA9IGhvc3QuZ2V0UmFuZ2VBdChub2RlLmNhY2hlZEFic29sdXRlU3RhcnQsIG5vZGUuY2FjaGVkQWJzb2x1dGVFbmQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gPG1vZGVsLklNb2RlbERlY29yYXRpb25bXT5ub2Rlcztcblx0fVxuXG5cdHB1YmxpYyBnZXRBbGxJbkludGVydmFsKGhvc3Q6IElEZWNvcmF0aW9uc1RyZWVzSG9zdCwgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIGZpbHRlck93bmVySWQ6IG51bWJlciwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiwgZmlsdGVyRm9udERlY29yYXRpb25zOiBib29sZWFuLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4pOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IGhvc3QuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5faW50ZXJ2YWxTZWFyY2goc3RhcnQsIGVuZCwgZmlsdGVyT3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCB2ZXJzaW9uSWQsIG9ubHlNYXJnaW5EZWNvcmF0aW9ucyk7XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZU5vZGVzSGF2ZVJhbmdlcyhob3N0LCByZXN1bHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW50ZXJ2YWxTZWFyY2goc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIGZpbHRlck93bmVySWQ6IG51bWJlciwgZmlsdGVyT3V0VmFsaWRhdGlvbjogYm9vbGVhbiwgZmlsdGVyRm9udERlY29yYXRpb25zOiBib29sZWFuLCBjYWNoZWRWZXJzaW9uSWQ6IG51bWJlciwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRcdGNvbnN0IHIwID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlMC5pbnRlcnZhbFNlYXJjaChzdGFydCwgZW5kLCBmaWx0ZXJPd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIGNhY2hlZFZlcnNpb25JZCwgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHRjb25zdCByMSA9IHRoaXMuX2RlY29yYXRpb25zVHJlZTEuaW50ZXJ2YWxTZWFyY2goc3RhcnQsIGVuZCwgZmlsdGVyT3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBjYWNoZWRWZXJzaW9uSWQsIG9ubHlNYXJnaW5EZWNvcmF0aW9ucyk7XG5cdFx0Y29uc3QgcjIgPSB0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUuaW50ZXJ2YWxTZWFyY2goc3RhcnQsIGVuZCwgZmlsdGVyT3duZXJJZCwgZmlsdGVyT3V0VmFsaWRhdGlvbiwgZmlsdGVyRm9udERlY29yYXRpb25zLCBjYWNoZWRWZXJzaW9uSWQsIG9ubHlNYXJnaW5EZWNvcmF0aW9ucyk7XG5cdFx0cmV0dXJuIHIwLmNvbmNhdChyMSkuY29uY2F0KHIyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbmplY3RlZFRleHRJbkludGVydmFsKGhvc3Q6IElEZWNvcmF0aW9uc1RyZWVzSG9zdCwgc3RhcnQ6IG51bWJlciwgZW5kOiBudW1iZXIsIGZpbHRlck93bmVySWQ6IG51bWJlcik6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3QgdmVyc2lvbklkID0gaG9zdC5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUuaW50ZXJ2YWxTZWFyY2goc3RhcnQsIGVuZCwgZmlsdGVyT3duZXJJZCwgZmFsc2UsIGZhbHNlLCB2ZXJzaW9uSWQsIGZhbHNlKTtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlTm9kZXNIYXZlUmFuZ2VzKGhvc3QsIHJlc3VsdCkuZmlsdGVyKChpKSA9PiBpLm9wdGlvbnMuc2hvd0lmQ29sbGFwc2VkIHx8ICFpLnJhbmdlLmlzRW1wdHkoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Rm9udERlY29yYXRpb25zSW5JbnRlcnZhbChob3N0OiBJRGVjb3JhdGlvbnNUcmVlc0hvc3QsIHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyLCBmaWx0ZXJPd25lcklkOiBudW1iZXIpOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IGhvc3QuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUwLmludGVydmFsU2VhcmNoKHN0YXJ0LCBlbmQsIGZpbHRlck93bmVySWQsIGZhbHNlLCBmYWxzZSwgdmVyc2lvbklkLCBmYWxzZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZU5vZGVzSGF2ZVJhbmdlcyhob3N0LCBkZWNvcmF0aW9ucykuZmlsdGVyKChpKSA9PiBpLm9wdGlvbnMuYWZmZWN0c0ZvbnQpO1xuXHR9XG5cblx0cHVibGljIGdldEFsbEluamVjdGVkVGV4dChob3N0OiBJRGVjb3JhdGlvbnNUcmVlc0hvc3QsIGZpbHRlck93bmVySWQ6IG51bWJlcik6IG1vZGVsLklNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0Y29uc3QgdmVyc2lvbklkID0gaG9zdC5nZXRWZXJzaW9uSWQoKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUuc2VhcmNoKGZpbHRlck93bmVySWQsIGZhbHNlLCBmYWxzZSwgdmVyc2lvbklkLCBmYWxzZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZU5vZGVzSGF2ZVJhbmdlcyhob3N0LCByZXN1bHQpLmZpbHRlcigoaSkgPT4gaS5vcHRpb25zLnNob3dJZkNvbGxhcHNlZCB8fCAhaS5yYW5nZS5pc0VtcHR5KCkpO1xuXHR9XG5cblx0cHVibGljIGdldEFsbEN1c3RvbUxpbmVIZWlnaHRzKGhvc3Q6IElEZWNvcmF0aW9uc1RyZWVzSG9zdCwgZmlsdGVyT3duZXJJZDogbnVtYmVyKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCB2ZXJzaW9uSWQgPSBob3N0LmdldFZlcnNpb25JZCgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3NlYXJjaChmaWx0ZXJPd25lcklkLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCB2ZXJzaW9uSWQsIGZhbHNlKTtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlTm9kZXNIYXZlUmFuZ2VzKGhvc3QsIHJlc3VsdCkuZmlsdGVyKChpKSA9PiB0eXBlb2YgaS5vcHRpb25zLmxpbmVIZWlnaHQgPT09ICdudW1iZXInKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDdXN0b21MaW5lSGVpZ2h0c0luSW50ZXJ2YWwoaG9zdDogSURlY29yYXRpb25zVHJlZXNIb3N0LCBzdGFydDogbnVtYmVyLCBlbmQ6IG51bWJlciwgZmlsdGVyT3duZXJJZDogbnVtYmVyKTogbW9kZWwuSU1vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRjb25zdCB2ZXJzaW9uSWQgPSBob3N0LmdldFZlcnNpb25JZCgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2ludGVydmFsU2VhcmNoKHN0YXJ0LCBlbmQsIGZpbHRlck93bmVySWQsIGZhbHNlLCBmYWxzZSwgdmVyc2lvbklkLCBmYWxzZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2Vuc3VyZU5vZGVzSGF2ZVJhbmdlcyhob3N0LCByZXN1bHQpLmZpbHRlcigoaSkgPT4gdHlwZW9mIGkub3B0aW9ucy5saW5lSGVpZ2h0ID09PSAnbnVtYmVyJyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWxsKGhvc3Q6IElEZWNvcmF0aW9uc1RyZWVzSG9zdCwgZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIG92ZXJ2aWV3UnVsZXJPbmx5OiBib29sZWFuLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnM6IGJvb2xlYW4pOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uW10ge1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IGhvc3QuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fc2VhcmNoKGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgb3ZlcnZpZXdSdWxlck9ubHksIHZlcnNpb25JZCwgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHRyZXR1cm4gdGhpcy5fZW5zdXJlTm9kZXNIYXZlUmFuZ2VzKGhvc3QsIHJlc3VsdCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZWFyY2goZmlsdGVyT3duZXJJZDogbnVtYmVyLCBmaWx0ZXJPdXRWYWxpZGF0aW9uOiBib29sZWFuLCBmaWx0ZXJGb250RGVjb3JhdGlvbnM6IGJvb2xlYW4sIG92ZXJ2aWV3UnVsZXJPbmx5OiBib29sZWFuLCBjYWNoZWRWZXJzaW9uSWQ6IG51bWJlciwgb25seU1hcmdpbkRlY29yYXRpb25zOiBib29sZWFuKTogSW50ZXJ2YWxOb2RlW10ge1xuXHRcdGlmIChvdmVydmlld1J1bGVyT25seSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RlY29yYXRpb25zVHJlZTEuc2VhcmNoKGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgY2FjaGVkVmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByMCA9IHRoaXMuX2RlY29yYXRpb25zVHJlZTAuc2VhcmNoKGZpbHRlck93bmVySWQsIGZpbHRlck91dFZhbGlkYXRpb24sIGZpbHRlckZvbnREZWNvcmF0aW9ucywgY2FjaGVkVmVyc2lvbklkLCBvbmx5TWFyZ2luRGVjb3JhdGlvbnMpO1xuXHRcdFx0Y29uc3QgcjEgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUxLnNlYXJjaChmaWx0ZXJPd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIGNhY2hlZFZlcnNpb25JZCwgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHRcdGNvbnN0IHIyID0gdGhpcy5faW5qZWN0ZWRUZXh0RGVjb3JhdGlvbnNUcmVlLnNlYXJjaChmaWx0ZXJPd25lcklkLCBmaWx0ZXJPdXRWYWxpZGF0aW9uLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIGNhY2hlZFZlcnNpb25JZCwgb25seU1hcmdpbkRlY29yYXRpb25zKTtcblx0XHRcdHJldHVybiByMC5jb25jYXQocjEpLmNvbmNhdChyMik7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNvbGxlY3ROb2Rlc0Zyb21Pd25lcihvd25lcklkOiBudW1iZXIpOiBJbnRlcnZhbE5vZGVbXSB7XG5cdFx0Y29uc3QgcjAgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUwLmNvbGxlY3ROb2Rlc0Zyb21Pd25lcihvd25lcklkKTtcblx0XHRjb25zdCByMSA9IHRoaXMuX2RlY29yYXRpb25zVHJlZTEuY29sbGVjdE5vZGVzRnJvbU93bmVyKG93bmVySWQpO1xuXHRcdGNvbnN0IHIyID0gdGhpcy5faW5qZWN0ZWRUZXh0RGVjb3JhdGlvbnNUcmVlLmNvbGxlY3ROb2Rlc0Zyb21Pd25lcihvd25lcklkKTtcblx0XHRyZXR1cm4gcjAuY29uY2F0KHIxKS5jb25jYXQocjIpO1xuXHR9XG5cblx0cHVibGljIGNvbGxlY3ROb2Rlc1Bvc3RPcmRlcigpOiBJbnRlcnZhbE5vZGVbXSB7XG5cdFx0Y29uc3QgcjAgPSB0aGlzLl9kZWNvcmF0aW9uc1RyZWUwLmNvbGxlY3ROb2Rlc1Bvc3RPcmRlcigpO1xuXHRcdGNvbnN0IHIxID0gdGhpcy5fZGVjb3JhdGlvbnNUcmVlMS5jb2xsZWN0Tm9kZXNQb3N0T3JkZXIoKTtcblx0XHRjb25zdCByMiA9IHRoaXMuX2luamVjdGVkVGV4dERlY29yYXRpb25zVHJlZS5jb2xsZWN0Tm9kZXNQb3N0T3JkZXIoKTtcblx0XHRyZXR1cm4gcjAuY29uY2F0KHIxKS5jb25jYXQocjIpO1xuXHR9XG5cblx0cHVibGljIGluc2VydChub2RlOiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0XHRpZiAoaXNOb2RlSW5qZWN0ZWRUZXh0KG5vZGUpKSB7XG5cdFx0XHR0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUuaW5zZXJ0KG5vZGUpO1xuXHRcdH0gZWxzZSBpZiAoaXNOb2RlSW5PdmVydmlld1J1bGVyKG5vZGUpKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUxLmluc2VydChub2RlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlMC5pbnNlcnQobm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGRlbGV0ZShub2RlOiBJbnRlcnZhbE5vZGUpOiB2b2lkIHtcblx0XHRpZiAoaXNOb2RlSW5qZWN0ZWRUZXh0KG5vZGUpKSB7XG5cdFx0XHR0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUuZGVsZXRlKG5vZGUpO1xuXHRcdH0gZWxzZSBpZiAoaXNOb2RlSW5PdmVydmlld1J1bGVyKG5vZGUpKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUxLmRlbGV0ZShub2RlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlMC5kZWxldGUobm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldE5vZGVSYW5nZShob3N0OiBJRGVjb3JhdGlvbnNUcmVlc0hvc3QsIG5vZGU6IEludGVydmFsTm9kZSk6IFJhbmdlIHtcblx0XHRjb25zdCB2ZXJzaW9uSWQgPSBob3N0LmdldFZlcnNpb25JZCgpO1xuXHRcdGlmIChub2RlLmNhY2hlZFZlcnNpb25JZCAhPT0gdmVyc2lvbklkKSB7XG5cdFx0XHR0aGlzLl9yZXNvbHZlTm9kZShub2RlLCB2ZXJzaW9uSWQpO1xuXHRcdH1cblx0XHRpZiAobm9kZS5yYW5nZSA9PT0gbnVsbCkge1xuXHRcdFx0bm9kZS5yYW5nZSA9IGhvc3QuZ2V0UmFuZ2VBdChub2RlLmNhY2hlZEFic29sdXRlU3RhcnQsIG5vZGUuY2FjaGVkQWJzb2x1dGVFbmQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbm9kZS5yYW5nZTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVOb2RlKG5vZGU6IEludGVydmFsTm9kZSwgY2FjaGVkVmVyc2lvbklkOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoaXNOb2RlSW5qZWN0ZWRUZXh0KG5vZGUpKSB7XG5cdFx0XHR0aGlzLl9pbmplY3RlZFRleHREZWNvcmF0aW9uc1RyZWUucmVzb2x2ZU5vZGUobm9kZSwgY2FjaGVkVmVyc2lvbklkKTtcblx0XHR9IGVsc2UgaWYgKGlzTm9kZUluT3ZlcnZpZXdSdWxlcihub2RlKSkge1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnNUcmVlMS5yZXNvbHZlTm9kZShub2RlLCBjYWNoZWRWZXJzaW9uSWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUwLnJlc29sdmVOb2RlKG5vZGUsIGNhY2hlZFZlcnNpb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFjY2VwdFJlcGxhY2Uob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyLCB0ZXh0TGVuZ3RoOiBudW1iZXIsIGZvcmNlTW92ZU1hcmtlcnM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9kZWNvcmF0aW9uc1RyZWUwLmFjY2VwdFJlcGxhY2Uob2Zmc2V0LCBsZW5ndGgsIHRleHRMZW5ndGgsIGZvcmNlTW92ZU1hcmtlcnMpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zVHJlZTEuYWNjZXB0UmVwbGFjZShvZmZzZXQsIGxlbmd0aCwgdGV4dExlbmd0aCwgZm9yY2VNb3ZlTWFya2Vycyk7XG5cdFx0dGhpcy5faW5qZWN0ZWRUZXh0RGVjb3JhdGlvbnNUcmVlLmFjY2VwdFJlcGxhY2Uob2Zmc2V0LCBsZW5ndGgsIHRleHRMZW5ndGgsIGZvcmNlTW92ZU1hcmtlcnMpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNsZWFuQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGNsYXNzTmFtZS5yZXBsYWNlKC9bXmEtejAtOVxcLV9dL2dpLCAnICcpO1xufVxuXG5jbGFzcyBEZWNvcmF0aW9uT3B0aW9ucyBpbXBsZW1lbnRzIG1vZGVsLklEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGNvbG9yOiBzdHJpbmcgfCBUaGVtZUNvbG9yO1xuXHRyZWFkb25seSBkYXJrQ29sb3I6IHN0cmluZyB8IFRoZW1lQ29sb3I7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9uczogbW9kZWwuSURlY29yYXRpb25PcHRpb25zKSB7XG5cdFx0dGhpcy5jb2xvciA9IG9wdGlvbnMuY29sb3IgfHwgJyc7XG5cdFx0dGhpcy5kYXJrQ29sb3IgPSBvcHRpb25zLmRhcmtDb2xvciB8fCAnJztcblxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RlbERlY29yYXRpb25PdmVydmlld1J1bGVyT3B0aW9ucyBleHRlbmRzIERlY29yYXRpb25PcHRpb25zIHtcblx0cmVhZG9ubHkgcG9zaXRpb246IG1vZGVsLk92ZXJ2aWV3UnVsZXJMYW5lO1xuXHRwcml2YXRlIF9yZXNvbHZlZENvbG9yOiBzdHJpbmcgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IG1vZGVsLklNb2RlbERlY29yYXRpb25PdmVydmlld1J1bGVyT3B0aW9ucykge1xuXHRcdHN1cGVyKG9wdGlvbnMpO1xuXHRcdHRoaXMuX3Jlc29sdmVkQ29sb3IgPSBudWxsO1xuXHRcdHRoaXMucG9zaXRpb24gPSAodHlwZW9mIG9wdGlvbnMucG9zaXRpb24gPT09ICdudW1iZXInID8gb3B0aW9ucy5wb3NpdGlvbiA6IG1vZGVsLk92ZXJ2aWV3UnVsZXJMYW5lLkNlbnRlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29sb3IodGhlbWU6IElDb2xvclRoZW1lKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX3Jlc29sdmVkQ29sb3IpIHtcblx0XHRcdGlmIChpc0RhcmsodGhlbWUudHlwZSkgJiYgdGhpcy5kYXJrQ29sb3IpIHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRDb2xvciA9IHRoaXMuX3Jlc29sdmVDb2xvcih0aGlzLmRhcmtDb2xvciwgdGhlbWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fcmVzb2x2ZWRDb2xvciA9IHRoaXMuX3Jlc29sdmVDb2xvcih0aGlzLmNvbG9yLCB0aGVtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlZENvbG9yO1xuXHR9XG5cblx0cHVibGljIGludmFsaWRhdGVDYWNoZWRDb2xvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXNvbHZlZENvbG9yID0gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVDb2xvcihjb2xvcjogc3RyaW5nIHwgVGhlbWVDb2xvciwgdGhlbWU6IElDb2xvclRoZW1lKTogc3RyaW5nIHtcblx0XHRpZiAodHlwZW9mIGNvbG9yID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIGNvbG9yO1xuXHRcdH1cblx0XHRjb25zdCBjID0gY29sb3IgPyB0aGVtZS5nZXRDb2xvcihjb2xvci5pZCkgOiBudWxsO1xuXHRcdGlmICghYykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gYy50b1N0cmluZygpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RlbERlY29yYXRpb25HbHlwaE1hcmdpbk9wdGlvbnMge1xuXHRyZWFkb25seSBwb3NpdGlvbjogbW9kZWwuR2x5cGhNYXJnaW5MYW5lO1xuXHRyZWFkb25seSBwZXJzaXN0TGFuZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uR2x5cGhNYXJnaW5PcHRpb25zIHwgbnVsbCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMucG9zaXRpb24gPSBvcHRpb25zPy5wb3NpdGlvbiA/PyBtb2RlbC5HbHlwaE1hcmdpbkxhbmUuQ2VudGVyO1xuXHRcdHRoaXMucGVyc2lzdExhbmUgPSBvcHRpb25zPy5wZXJzaXN0TGFuZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW9kZWxEZWNvcmF0aW9uTWluaW1hcE9wdGlvbnMgZXh0ZW5kcyBEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHBvc2l0aW9uOiBtb2RlbC5NaW5pbWFwUG9zaXRpb247XG5cdHJlYWRvbmx5IHNlY3Rpb25IZWFkZXJTdHlsZTogbW9kZWwuTWluaW1hcFNlY3Rpb25IZWFkZXJTdHlsZSB8IG51bGw7XG5cdHJlYWRvbmx5IHNlY3Rpb25IZWFkZXJUZXh0OiBzdHJpbmcgfCBudWxsO1xuXHRwcml2YXRlIF9yZXNvbHZlZENvbG9yOiBDb2xvciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uTWluaW1hcE9wdGlvbnMpIHtcblx0XHRzdXBlcihvcHRpb25zKTtcblx0XHR0aGlzLnBvc2l0aW9uID0gb3B0aW9ucy5wb3NpdGlvbjtcblx0XHR0aGlzLnNlY3Rpb25IZWFkZXJTdHlsZSA9IG9wdGlvbnMuc2VjdGlvbkhlYWRlclN0eWxlID8/IG51bGw7XG5cdFx0dGhpcy5zZWN0aW9uSGVhZGVyVGV4dCA9IG9wdGlvbnMuc2VjdGlvbkhlYWRlclRleHQgPz8gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb2xvcih0aGVtZTogSUNvbG9yVGhlbWUpOiBDb2xvciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9yZXNvbHZlZENvbG9yKSB7XG5cdFx0XHRpZiAoaXNEYXJrKHRoZW1lLnR5cGUpICYmIHRoaXMuZGFya0NvbG9yKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVkQ29sb3IgPSB0aGlzLl9yZXNvbHZlQ29sb3IodGhpcy5kYXJrQ29sb3IsIHRoZW1lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVkQ29sb3IgPSB0aGlzLl9yZXNvbHZlQ29sb3IodGhpcy5jb2xvciwgdGhlbWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlZENvbG9yO1xuXHR9XG5cblx0cHVibGljIGludmFsaWRhdGVDYWNoZWRDb2xvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXNvbHZlZENvbG9yID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUNvbG9yKGNvbG9yOiBzdHJpbmcgfCBUaGVtZUNvbG9yLCB0aGVtZTogSUNvbG9yVGhlbWUpOiBDb2xvciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiBjb2xvciA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBDb2xvci5mcm9tSGV4KGNvbG9yKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoZW1lLmdldENvbG9yKGNvbG9yLmlkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW9kZWxEZWNvcmF0aW9uSW5qZWN0ZWRUZXh0T3B0aW9ucyBpbXBsZW1lbnRzIG1vZGVsLkluamVjdGVkVGV4dE9wdGlvbnMge1xuXHRwdWJsaWMgc3RhdGljIGZyb20ob3B0aW9uczogbW9kZWwuSW5qZWN0ZWRUZXh0T3B0aW9ucyk6IE1vZGVsRGVjb3JhdGlvbkluamVjdGVkVGV4dE9wdGlvbnMge1xuXHRcdGlmIChvcHRpb25zIGluc3RhbmNlb2YgTW9kZWxEZWNvcmF0aW9uSW5qZWN0ZWRUZXh0T3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIG9wdGlvbnM7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgTW9kZWxEZWNvcmF0aW9uSW5qZWN0ZWRUZXh0T3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSB0b2tlbnM6IFRva2VuQXJyYXkgfCBudWxsO1xuXHRyZWFkb25seSBpbmxpbmVDbGFzc05hbWU6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiBib29sZWFuO1xuXHRyZWFkb25seSBhdHRhY2hlZERhdGE6IHVua25vd24gfCBudWxsO1xuXHRyZWFkb25seSBjdXJzb3JTdG9wczogbW9kZWwuSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMgfCBudWxsO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3Iob3B0aW9uczogbW9kZWwuSW5qZWN0ZWRUZXh0T3B0aW9ucykge1xuXHRcdHRoaXMuY29udGVudCA9IG9wdGlvbnMuY29udGVudCB8fCAnJztcblx0XHR0aGlzLnRva2VucyA9IG9wdGlvbnMudG9rZW5zID8/IG51bGw7XG5cdFx0dGhpcy5pbmxpbmVDbGFzc05hbWUgPSBvcHRpb25zLmlubGluZUNsYXNzTmFtZSB8fCBudWxsO1xuXHRcdHRoaXMuaW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmcgPSBvcHRpb25zLmlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nIHx8IGZhbHNlO1xuXHRcdHRoaXMuYXR0YWNoZWREYXRhID0gb3B0aW9ucy5hdHRhY2hlZERhdGEgfHwgbnVsbDtcblx0XHR0aGlzLmN1cnNvclN0b3BzID0gb3B0aW9ucy5jdXJzb3JTdG9wcyB8fCBudWxsO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RlbERlY29yYXRpb25PcHRpb25zIGltcGxlbWVudHMgbW9kZWwuSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMge1xuXG5cdHB1YmxpYyBzdGF0aWMgRU1QVFk6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cblx0cHVibGljIHN0YXRpYyByZWdpc3RlcihvcHRpb25zOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyk6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMge1xuXHRcdHJldHVybiBuZXcgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlRHluYW1pYyhvcHRpb25zOiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyk6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMge1xuXHRcdHJldHVybiBuZXcgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRyZWFkb25seSBibG9ja0NsYXNzTmFtZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgYmxvY2tJc0FmdGVyRW5kOiBib29sZWFuIHwgbnVsbDtcblx0cmVhZG9ubHkgYmxvY2tEb2VzTm90Q29sbGFwc2U/OiBib29sZWFuIHwgbnVsbDtcblx0cmVhZG9ubHkgYmxvY2tQYWRkaW5nOiBbdG9wOiBudW1iZXIsIHJpZ2h0OiBudW1iZXIsIGJvdHRvbTogbnVtYmVyLCBsZWZ0OiBudW1iZXJdIHwgbnVsbDtcblx0cmVhZG9ubHkgc3RpY2tpbmVzczogbW9kZWwuVHJhY2tlZFJhbmdlU3RpY2tpbmVzcztcblx0cmVhZG9ubHkgekluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNsYXNzTmFtZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgc2hvdWxkRmlsbExpbmVPbkxpbmVCcmVhazogYm9vbGVhbiB8IG51bGw7XG5cdHJlYWRvbmx5IGhvdmVyTWVzc2FnZTogSU1hcmtkb3duU3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nW10gfCBudWxsO1xuXHRyZWFkb25seSBnbHlwaE1hcmdpbkhvdmVyTWVzc2FnZTogSU1hcmtkb3duU3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nW10gfCBudWxsO1xuXHRyZWFkb25seSBpc1dob2xlTGluZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGluZUhlaWdodDogbnVtYmVyIHwgbnVsbDtcblx0cmVhZG9ubHkgZm9udFNpemU6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IHNob3dJZkNvbGxhcHNlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29sbGFwc2VPblJlcGxhY2VFZGl0OiBib29sZWFuO1xuXHRyZWFkb25seSBvdmVydmlld1J1bGVyOiBNb2RlbERlY29yYXRpb25PdmVydmlld1J1bGVyT3B0aW9ucyB8IG51bGw7XG5cdHJlYWRvbmx5IG1pbmltYXA6IE1vZGVsRGVjb3JhdGlvbk1pbmltYXBPcHRpb25zIHwgbnVsbDtcblx0cmVhZG9ubHkgZ2x5cGhNYXJnaW4/OiBtb2RlbC5JTW9kZWxEZWNvcmF0aW9uR2x5cGhNYXJnaW5PcHRpb25zIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZ2x5cGhNYXJnaW5DbGFzc05hbWU6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IGxpbmVzRGVjb3JhdGlvbnNDbGFzc05hbWU6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IGxpbmVOdW1iZXJDbGFzc05hbWU6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IGxpbmVOdW1iZXJIb3Zlck1lc3NhZ2U6IElNYXJrZG93blN0cmluZyB8IElNYXJrZG93blN0cmluZ1tdIHwgbnVsbDtcblx0cmVhZG9ubHkgbGluZXNEZWNvcmF0aW9uc1Rvb2x0aXA6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IGZpcnN0TGluZURlY29yYXRpb25DbGFzc05hbWU6IHN0cmluZyB8IG51bGw7XG5cdHJlYWRvbmx5IG1hcmdpbkNsYXNzTmFtZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgaW5saW5lQ2xhc3NOYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBpbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYmVmb3JlQ29udGVudENsYXNzTmFtZTogc3RyaW5nIHwgbnVsbDtcblx0cmVhZG9ubHkgYWZ0ZXJDb250ZW50Q2xhc3NOYW1lOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBhZnRlcjogTW9kZWxEZWNvcmF0aW9uSW5qZWN0ZWRUZXh0T3B0aW9ucyB8IG51bGw7XG5cdHJlYWRvbmx5IGJlZm9yZTogTW9kZWxEZWNvcmF0aW9uSW5qZWN0ZWRUZXh0T3B0aW9ucyB8IG51bGw7XG5cdHJlYWRvbmx5IGhpZGVJbkNvbW1lbnRUb2tlbnM6IGJvb2xlYW4gfCBudWxsO1xuXHRyZWFkb25seSBoaWRlSW5TdHJpbmdUb2tlbnM6IGJvb2xlYW4gfCBudWxsO1xuXHRyZWFkb25seSBhZmZlY3RzRm9udDogYm9vbGVhbiB8IG51bGw7XG5cdHJlYWRvbmx5IHRleHREaXJlY3Rpb24/OiBtb2RlbC5UZXh0RGlyZWN0aW9uIHwgbnVsbCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKG9wdGlvbnM6IG1vZGVsLklNb2RlbERlY29yYXRpb25PcHRpb25zKSB7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IG9wdGlvbnMuZGVzY3JpcHRpb247XG5cdFx0dGhpcy5ibG9ja0NsYXNzTmFtZSA9IG9wdGlvbnMuYmxvY2tDbGFzc05hbWUgPyBjbGVhbkNsYXNzTmFtZShvcHRpb25zLmJsb2NrQ2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5ibG9ja0RvZXNOb3RDb2xsYXBzZSA9IG9wdGlvbnMuYmxvY2tEb2VzTm90Q29sbGFwc2UgPz8gbnVsbDtcblx0XHR0aGlzLmJsb2NrSXNBZnRlckVuZCA9IG9wdGlvbnMuYmxvY2tJc0FmdGVyRW5kID8/IG51bGw7XG5cdFx0dGhpcy5ibG9ja1BhZGRpbmcgPSBvcHRpb25zLmJsb2NrUGFkZGluZyA/PyBudWxsO1xuXHRcdHRoaXMuc3RpY2tpbmVzcyA9IG9wdGlvbnMuc3RpY2tpbmVzcyB8fCBtb2RlbC5UcmFja2VkUmFuZ2VTdGlja2luZXNzLkFsd2F5c0dyb3dzV2hlblR5cGluZ0F0RWRnZXM7XG5cdFx0dGhpcy56SW5kZXggPSBvcHRpb25zLnpJbmRleCB8fCAwO1xuXHRcdHRoaXMuY2xhc3NOYW1lID0gb3B0aW9ucy5jbGFzc05hbWUgPyBjbGVhbkNsYXNzTmFtZShvcHRpb25zLmNsYXNzTmFtZSkgOiBudWxsO1xuXHRcdHRoaXMuc2hvdWxkRmlsbExpbmVPbkxpbmVCcmVhayA9IG9wdGlvbnMuc2hvdWxkRmlsbExpbmVPbkxpbmVCcmVhayA/PyBudWxsO1xuXHRcdHRoaXMuaG92ZXJNZXNzYWdlID0gb3B0aW9ucy5ob3Zlck1lc3NhZ2UgfHwgbnVsbDtcblx0XHR0aGlzLmdseXBoTWFyZ2luSG92ZXJNZXNzYWdlID0gb3B0aW9ucy5nbHlwaE1hcmdpbkhvdmVyTWVzc2FnZSB8fCBudWxsO1xuXHRcdHRoaXMubGluZU51bWJlckhvdmVyTWVzc2FnZSA9IG9wdGlvbnMubGluZU51bWJlckhvdmVyTWVzc2FnZSB8fCBudWxsO1xuXHRcdHRoaXMuaXNXaG9sZUxpbmUgPSBvcHRpb25zLmlzV2hvbGVMaW5lIHx8IGZhbHNlO1xuXHRcdHRoaXMubGluZUhlaWdodCA9IG9wdGlvbnMubGluZUhlaWdodCA/IE1hdGgubWluKG9wdGlvbnMubGluZUhlaWdodCwgTElORV9IRUlHSFRfQ0VJTElORykgOiBudWxsO1xuXHRcdHRoaXMuZm9udFNpemUgPSBvcHRpb25zLmZvbnRTaXplIHx8IG51bGw7XG5cdFx0dGhpcy5hZmZlY3RzRm9udCA9ICEhb3B0aW9ucy5mb250U2l6ZSB8fCAhIW9wdGlvbnMuZm9udEZhbWlseSB8fCAhIW9wdGlvbnMuZm9udFdlaWdodCB8fCAhIW9wdGlvbnMuZm9udFN0eWxlO1xuXHRcdHRoaXMuc2hvd0lmQ29sbGFwc2VkID0gb3B0aW9ucy5zaG93SWZDb2xsYXBzZWQgfHwgZmFsc2U7XG5cdFx0dGhpcy5jb2xsYXBzZU9uUmVwbGFjZUVkaXQgPSBvcHRpb25zLmNvbGxhcHNlT25SZXBsYWNlRWRpdCB8fCBmYWxzZTtcblx0XHR0aGlzLm92ZXJ2aWV3UnVsZXIgPSBvcHRpb25zLm92ZXJ2aWV3UnVsZXIgPyBuZXcgTW9kZWxEZWNvcmF0aW9uT3ZlcnZpZXdSdWxlck9wdGlvbnMob3B0aW9ucy5vdmVydmlld1J1bGVyKSA6IG51bGw7XG5cdFx0dGhpcy5taW5pbWFwID0gb3B0aW9ucy5taW5pbWFwID8gbmV3IE1vZGVsRGVjb3JhdGlvbk1pbmltYXBPcHRpb25zKG9wdGlvbnMubWluaW1hcCkgOiBudWxsO1xuXHRcdHRoaXMuZ2x5cGhNYXJnaW4gPSBvcHRpb25zLmdseXBoTWFyZ2luQ2xhc3NOYW1lID8gbmV3IE1vZGVsRGVjb3JhdGlvbkdseXBoTWFyZ2luT3B0aW9ucyhvcHRpb25zLmdseXBoTWFyZ2luKSA6IG51bGw7XG5cdFx0dGhpcy5nbHlwaE1hcmdpbkNsYXNzTmFtZSA9IG9wdGlvbnMuZ2x5cGhNYXJnaW5DbGFzc05hbWUgPyBjbGVhbkNsYXNzTmFtZShvcHRpb25zLmdseXBoTWFyZ2luQ2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5saW5lc0RlY29yYXRpb25zQ2xhc3NOYW1lID0gb3B0aW9ucy5saW5lc0RlY29yYXRpb25zQ2xhc3NOYW1lID8gY2xlYW5DbGFzc05hbWUob3B0aW9ucy5saW5lc0RlY29yYXRpb25zQ2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5saW5lTnVtYmVyQ2xhc3NOYW1lID0gb3B0aW9ucy5saW5lTnVtYmVyQ2xhc3NOYW1lID8gY2xlYW5DbGFzc05hbWUob3B0aW9ucy5saW5lTnVtYmVyQ2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5saW5lc0RlY29yYXRpb25zVG9vbHRpcCA9IG9wdGlvbnMubGluZXNEZWNvcmF0aW9uc1Rvb2x0aXAgPyBzdHJpbmdzLmh0bWxBdHRyaWJ1dGVFbmNvZGVWYWx1ZShvcHRpb25zLmxpbmVzRGVjb3JhdGlvbnNUb29sdGlwKSA6IG51bGw7XG5cdFx0dGhpcy5maXJzdExpbmVEZWNvcmF0aW9uQ2xhc3NOYW1lID0gb3B0aW9ucy5maXJzdExpbmVEZWNvcmF0aW9uQ2xhc3NOYW1lID8gY2xlYW5DbGFzc05hbWUob3B0aW9ucy5maXJzdExpbmVEZWNvcmF0aW9uQ2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5tYXJnaW5DbGFzc05hbWUgPSBvcHRpb25zLm1hcmdpbkNsYXNzTmFtZSA/IGNsZWFuQ2xhc3NOYW1lKG9wdGlvbnMubWFyZ2luQ2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5pbmxpbmVDbGFzc05hbWUgPSBvcHRpb25zLmlubGluZUNsYXNzTmFtZSA/IGNsZWFuQ2xhc3NOYW1lKG9wdGlvbnMuaW5saW5lQ2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5pbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZyA9IG9wdGlvbnMuaW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmcgfHwgZmFsc2U7XG5cdFx0dGhpcy5iZWZvcmVDb250ZW50Q2xhc3NOYW1lID0gb3B0aW9ucy5iZWZvcmVDb250ZW50Q2xhc3NOYW1lID8gY2xlYW5DbGFzc05hbWUob3B0aW9ucy5iZWZvcmVDb250ZW50Q2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5hZnRlckNvbnRlbnRDbGFzc05hbWUgPSBvcHRpb25zLmFmdGVyQ29udGVudENsYXNzTmFtZSA/IGNsZWFuQ2xhc3NOYW1lKG9wdGlvbnMuYWZ0ZXJDb250ZW50Q2xhc3NOYW1lKSA6IG51bGw7XG5cdFx0dGhpcy5hZnRlciA9IG9wdGlvbnMuYWZ0ZXIgPyBNb2RlbERlY29yYXRpb25JbmplY3RlZFRleHRPcHRpb25zLmZyb20ob3B0aW9ucy5hZnRlcikgOiBudWxsO1xuXHRcdHRoaXMuYmVmb3JlID0gb3B0aW9ucy5iZWZvcmUgPyBNb2RlbERlY29yYXRpb25JbmplY3RlZFRleHRPcHRpb25zLmZyb20ob3B0aW9ucy5iZWZvcmUpIDogbnVsbDtcblx0XHR0aGlzLmhpZGVJbkNvbW1lbnRUb2tlbnMgPSBvcHRpb25zLmhpZGVJbkNvbW1lbnRUb2tlbnMgPz8gZmFsc2U7XG5cdFx0dGhpcy5oaWRlSW5TdHJpbmdUb2tlbnMgPSBvcHRpb25zLmhpZGVJblN0cmluZ1Rva2VucyA/PyBmYWxzZTtcblx0XHR0aGlzLnRleHREaXJlY3Rpb24gPSBvcHRpb25zLnRleHREaXJlY3Rpb24gPz8gbnVsbDtcblx0fVxufVxuTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5FTVBUWSA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoeyBkZXNjcmlwdGlvbjogJ2VtcHR5JyB9KTtcblxuLyoqXG4gKiBUaGUgb3JkZXIgY2FyZWZ1bGx5IG1hdGNoZXMgdGhlIHZhbHVlcyBvZiB0aGUgZW51bS5cbiAqL1xuY29uc3QgVFJBQ0tFRF9SQU5HRV9PUFRJT05TID0gW1xuXHRNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHsgZGVzY3JpcHRpb246ICd0cmFja2VkLXJhbmdlLWFsd2F5cy1ncm93cy13aGVuLXR5cGluZy1hdC1lZGdlcycsIHN0aWNraW5lc3M6IG1vZGVsLlRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyB9KSxcblx0TW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7IGRlc2NyaXB0aW9uOiAndHJhY2tlZC1yYW5nZS1uZXZlci1ncm93cy13aGVuLXR5cGluZy1hdC1lZGdlcycsIHN0aWNraW5lc3M6IG1vZGVsLlRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzIH0pLFxuXHRNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHsgZGVzY3JpcHRpb246ICd0cmFja2VkLXJhbmdlLWdyb3dzLW9ubHktd2hlbi10eXBpbmctYmVmb3JlJywgc3RpY2tpbmVzczogbW9kZWwuVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQmVmb3JlIH0pLFxuXHRNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHsgZGVzY3JpcHRpb246ICd0cmFja2VkLXJhbmdlLWdyb3dzLW9ubHktd2hlbi10eXBpbmctYWZ0ZXInLCBzdGlja2luZXNzOiBtb2RlbC5UcmFja2VkUmFuZ2VTdGlja2luZXNzLkdyb3dzT25seVdoZW5UeXBpbmdBZnRlciB9KSxcbl07XG5cbmZ1bmN0aW9uIF9ub3JtYWxpemVPcHRpb25zKG9wdGlvbnM6IG1vZGVsLklNb2RlbERlY29yYXRpb25PcHRpb25zKTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdGlmIChvcHRpb25zIGluc3RhbmNlb2YgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucykge1xuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cdHJldHVybiBNb2RlbERlY29yYXRpb25PcHRpb25zLmNyZWF0ZUR5bmFtaWMob3B0aW9ucyk7XG59XG5cblxuY2xhc3MgRGlkQ2hhbmdlRGVjb3JhdGlvbnNFbWl0dGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0dWFsOiBFbWl0dGVyPElNb2RlbERlY29yYXRpb25zQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNb2RlbERlY29yYXRpb25zQ2hhbmdlZEV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IGV2ZW50OiBFdmVudDxJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWRFdmVudD4gPSB0aGlzLl9hY3R1YWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfZGVmZXJyZWRDbnQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfc2hvdWxkRmlyZURlZmVycmVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9hZmZlY3RzTWluaW1hcDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfYWZmZWN0c092ZXJ2aWV3UnVsZXI6IGJvb2xlYW47XG5cdHByaXZhdGUgX2FmZmVjdGVkSW5qZWN0ZWRUZXh0TGluZXM6IFNldDxudW1iZXI+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2FmZmVjdGVkTGluZUhlaWdodHM6IFNldFdpdGhLZXk8TGluZUhlaWdodENoYW5naW5nRGVjb3JhdGlvbj4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfYWZmZWN0ZWRGb250TGluZXM6IFNldFdpdGhLZXk8TGluZUZvbnRDaGFuZ2luZ0RlY29yYXRpb24+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2FmZmVjdHNHbHlwaE1hcmdpbjogYm9vbGVhbjtcblx0cHJpdmF0ZSBfYWZmZWN0c0xpbmVOdW1iZXI6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBoYW5kbGVCZWZvcmVGaXJlOiAoYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lczogU2V0PG51bWJlcj4gfCBudWxsLCBhZmZlY3RlZExpbmVIZWlnaHRzOiBTZXRXaXRoS2V5PExpbmVIZWlnaHRDaGFuZ2luZ0RlY29yYXRpb24+IHwgbnVsbCwgYWZmZWN0ZWRGb250TGluZXM6IFNldFdpdGhLZXk8TGluZUZvbnRDaGFuZ2luZ0RlY29yYXRpb24+IHwgbnVsbCkgPT4gdm9pZCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZGVmZXJyZWRDbnQgPSAwO1xuXHRcdHRoaXMuX3Nob3VsZEZpcmVEZWZlcnJlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2FmZmVjdHNNaW5pbWFwID0gZmFsc2U7XG5cdFx0dGhpcy5fYWZmZWN0c092ZXJ2aWV3UnVsZXIgPSBmYWxzZTtcblx0XHR0aGlzLl9hZmZlY3RzR2x5cGhNYXJnaW4gPSBmYWxzZTtcblx0XHR0aGlzLl9hZmZlY3RzTGluZU51bWJlciA9IGZhbHNlO1xuXHR9XG5cblx0aGFzTGlzdGVuZXJzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9hY3R1YWwuaGFzTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwdWJsaWMgYmVnaW5EZWZlcnJlZEVtaXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVmZXJyZWRDbnQrKztcblx0fVxuXG5cdHB1YmxpYyBlbmREZWZlcnJlZEVtaXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVmZXJyZWRDbnQtLTtcblx0XHRpZiAodGhpcy5fZGVmZXJyZWRDbnQgPT09IDApIHtcblx0XHRcdGlmICh0aGlzLl9zaG91bGRGaXJlRGVmZXJyZWQpIHtcblx0XHRcdFx0dGhpcy5kb0ZpcmUoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lcz8uY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FmZmVjdGVkSW5qZWN0ZWRUZXh0TGluZXMgPSBudWxsO1xuXHRcdFx0dGhpcy5fYWZmZWN0ZWRMaW5lSGVpZ2h0cz8uY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FmZmVjdGVkTGluZUhlaWdodHMgPSBudWxsO1xuXHRcdFx0dGhpcy5fYWZmZWN0ZWRGb250TGluZXM/LmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9hZmZlY3RlZEZvbnRMaW5lcyA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlY29yZExpbmVBZmZlY3RlZEJ5SW5qZWN0ZWRUZXh0KGxpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lcykge1xuXHRcdFx0dGhpcy5fYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lcyA9IG5ldyBTZXQoKTtcblx0XHR9XG5cdFx0dGhpcy5fYWZmZWN0ZWRJbmplY3RlZFRleHRMaW5lcy5hZGQobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgcmVjb3JkTGluZUFmZmVjdGVkQnlMaW5lSGVpZ2h0Q2hhbmdlKG93bmVySWQ6IG51bWJlciwgZGVjb3JhdGlvbklkOiBzdHJpbmcsIGxpbmVOdW1iZXI6IG51bWJlciwgbGluZUhlaWdodDogbnVtYmVyIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWZmZWN0ZWRMaW5lSGVpZ2h0cykge1xuXHRcdFx0dGhpcy5fYWZmZWN0ZWRMaW5lSGVpZ2h0cyA9IG5ldyBTZXRXaXRoS2V5PExpbmVIZWlnaHRDaGFuZ2luZ0RlY29yYXRpb24+KFtdLCBMaW5lSGVpZ2h0Q2hhbmdpbmdEZWNvcmF0aW9uLnRvS2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fYWZmZWN0ZWRMaW5lSGVpZ2h0cy5hZGQobmV3IExpbmVIZWlnaHRDaGFuZ2luZ0RlY29yYXRpb24ob3duZXJJZCwgZGVjb3JhdGlvbklkLCBsaW5lTnVtYmVyLCBsaW5lSGVpZ2h0KSk7XG5cdH1cblxuXHRwdWJsaWMgcmVjb3JkTGluZUFmZmVjdGVkQnlGb250Q2hhbmdlKG93bmVySWQ6IG51bWJlciwgZGVjb3JhdGlvbklkOiBzdHJpbmcsIGxpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYWZmZWN0ZWRGb250TGluZXMpIHtcblx0XHRcdHRoaXMuX2FmZmVjdGVkRm9udExpbmVzID0gbmV3IFNldFdpdGhLZXk8TGluZUZvbnRDaGFuZ2luZ0RlY29yYXRpb24+KFtdLCBMaW5lRm9udENoYW5naW5nRGVjb3JhdGlvbi50b0tleSk7XG5cdFx0fVxuXHRcdHRoaXMuX2FmZmVjdGVkRm9udExpbmVzLmFkZChuZXcgTGluZUZvbnRDaGFuZ2luZ0RlY29yYXRpb24ob3duZXJJZCwgZGVjb3JhdGlvbklkLCBsaW5lTnVtYmVyKSk7XG5cdH1cblxuXHRwdWJsaWMgY2hlY2tBZmZlY3RlZEFuZEZpcmUob3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX2FmZmVjdHNNaW5pbWFwIHx8PSAhIW9wdGlvbnMubWluaW1hcD8ucG9zaXRpb247XG5cdFx0dGhpcy5fYWZmZWN0c092ZXJ2aWV3UnVsZXIgfHw9ICEhb3B0aW9ucy5vdmVydmlld1J1bGVyPy5jb2xvcjtcblx0XHR0aGlzLl9hZmZlY3RzR2x5cGhNYXJnaW4gfHw9ICEhb3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZTtcblx0XHR0aGlzLl9hZmZlY3RzTGluZU51bWJlciB8fD0gISFvcHRpb25zLmxpbmVOdW1iZXJDbGFzc05hbWU7XG5cdFx0dGhpcy50cnlGaXJlKCk7XG5cdH1cblxuXHRwdWJsaWMgZmlyZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hZmZlY3RzTWluaW1hcCA9IHRydWU7XG5cdFx0dGhpcy5fYWZmZWN0c092ZXJ2aWV3UnVsZXIgPSB0cnVlO1xuXHRcdHRoaXMuX2FmZmVjdHNHbHlwaE1hcmdpbiA9IHRydWU7XG5cdFx0dGhpcy50cnlGaXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHRyeUZpcmUoKSB7XG5cdFx0aWYgKHRoaXMuX2RlZmVycmVkQ250ID09PSAwKSB7XG5cdFx0XHR0aGlzLmRvRmlyZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zaG91bGRGaXJlRGVmZXJyZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9GaXJlKCkge1xuXHRcdHRoaXMuaGFuZGxlQmVmb3JlRmlyZSh0aGlzLl9hZmZlY3RlZEluamVjdGVkVGV4dExpbmVzLCB0aGlzLl9hZmZlY3RlZExpbmVIZWlnaHRzLCB0aGlzLl9hZmZlY3RlZEZvbnRMaW5lcyk7XG5cblx0XHRjb25zdCBldmVudDogSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQgPSB7XG5cdFx0XHRhZmZlY3RzTWluaW1hcDogdGhpcy5fYWZmZWN0c01pbmltYXAsXG5cdFx0XHRhZmZlY3RzT3ZlcnZpZXdSdWxlcjogdGhpcy5fYWZmZWN0c092ZXJ2aWV3UnVsZXIsXG5cdFx0XHRhZmZlY3RzR2x5cGhNYXJnaW46IHRoaXMuX2FmZmVjdHNHbHlwaE1hcmdpbixcblx0XHRcdGFmZmVjdHNMaW5lTnVtYmVyOiB0aGlzLl9hZmZlY3RzTGluZU51bWJlcixcblx0XHR9O1xuXHRcdHRoaXMuX3Nob3VsZEZpcmVEZWZlcnJlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2FmZmVjdHNNaW5pbWFwID0gZmFsc2U7XG5cdFx0dGhpcy5fYWZmZWN0c092ZXJ2aWV3UnVsZXIgPSBmYWxzZTtcblx0XHR0aGlzLl9hZmZlY3RzR2x5cGhNYXJnaW4gPSBmYWxzZTtcblx0XHR0aGlzLl9hY3R1YWwuZmlyZShldmVudCk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbmNsYXNzIERpZENoYW5nZUNvbnRlbnRFbWl0dGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZW1pdHRlcjogRW1pdHRlcjxJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgZXZlbnQ6IEV2ZW50PEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQ+ID0gdGhpcy5fZW1pdHRlci5ldmVudDtcblxuXHRwcml2YXRlIF9kZWZlcnJlZENudDogbnVtYmVyO1xuXHRwcml2YXRlIF9kZWZlcnJlZEV2ZW50OiBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50IHwgbnVsbDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2RlZmVycmVkQ250ID0gMDtcblx0XHR0aGlzLl9kZWZlcnJlZEV2ZW50ID0gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBoYXNMaXN0ZW5lcnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VtaXR0ZXIuaGFzTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwdWJsaWMgYmVnaW5EZWZlcnJlZEVtaXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVmZXJyZWRDbnQrKztcblx0fVxuXG5cdHB1YmxpYyBlbmREZWZlcnJlZEVtaXQocmVzdWx0aW5nU2VsZWN0aW9uOiBTZWxlY3Rpb25bXSB8IG51bGwgPSBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVmZXJyZWRDbnQtLTtcblx0XHRpZiAodGhpcy5fZGVmZXJyZWRDbnQgPT09IDApIHtcblx0XHRcdGlmICh0aGlzLl9kZWZlcnJlZEV2ZW50ICE9PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMuX2RlZmVycmVkRXZlbnQucmF3Q29udGVudENoYW5nZWRFdmVudC5yZXN1bHRpbmdTZWxlY3Rpb24gPSByZXN1bHRpbmdTZWxlY3Rpb247XG5cdFx0XHRcdGNvbnN0IGUgPSB0aGlzLl9kZWZlcnJlZEV2ZW50O1xuXHRcdFx0XHR0aGlzLl9kZWZlcnJlZEV2ZW50ID0gbnVsbDtcblx0XHRcdFx0dGhpcy5fZW1pdHRlci5maXJlKGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmaXJlKGU6IEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGVmZXJyZWRDbnQgPiAwKSB7XG5cdFx0XHRpZiAodGhpcy5fZGVmZXJyZWRFdmVudCkge1xuXHRcdFx0XHR0aGlzLl9kZWZlcnJlZEV2ZW50ID0gdGhpcy5fZGVmZXJyZWRFdmVudC5tZXJnZShlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2RlZmVycmVkRXZlbnQgPSBlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9lbWl0dGVyLmZpcmUoZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQW9CLGlCQUFpQix5QkFBeUI7QUFDdkUsU0FBUyxlQUFzQjtBQUUvQixTQUFTLFlBQXlCLHlCQUF5QjtBQUMzRCxTQUFTLG9CQUFvQjtBQUM3QixZQUFZLGFBQWE7QUFFekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYztBQUV2QixTQUFTLHdCQUFrRTtBQUczRSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFvQixnQkFBZ0I7QUFDcEMsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGlCQUFpQjtBQUkxQixTQUE2Qix3QkFBd0I7QUFDckQsU0FBUyxxQ0FBcUM7QUFDOUMsWUFBWSxXQUFXO0FBRXZCLFNBQVMsbUJBQXdDO0FBQ2pELFNBQThGLGlDQUFpQyxrQkFBa0Isa0JBQWtCLHVCQUF1QiwrQkFBK0Isd0JBQXdCLDZCQUE2Qyw2QkFBNkIsb0JBQW9CLGVBQWUscUJBQXFCLHNCQUFzQiw2QkFBNkI7QUFHdGEsU0FBUyxrQkFBOEI7QUFDdkMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxjQUFjLGNBQWMsdUJBQXVCO0FBQzVELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsY0FBYyx1QkFBdUI7QUFDOUMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyw0QkFBNEIsb0NBQW9DO0FBQ3pFLFNBQVMsaUNBQWlDO0FBR25DLFNBQVMsd0JBQXdCLE1BQXdDO0FBQy9FLFFBQU0sVUFBVSxJQUFJLDJCQUEyQjtBQUMvQyxVQUFRLFlBQVksSUFBSTtBQUN4QixTQUFPLFFBQVEsT0FBTztBQUN2QjtBQVdPLFNBQVMsa0NBQWtDLFFBQWlGO0FBQ2xJLFNBQU8sSUFBSSxRQUFrQyxDQUFDLFNBQVMsV0FBVztBQUNqRSxVQUFNLFVBQVUsSUFBSSwyQkFBMkI7QUFFL0MsUUFBSSxPQUFPO0FBRVgsaUJBQWdDLFFBQVE7QUFBQSxNQUN2QyxRQUFRLFdBQVM7QUFDaEIsZ0JBQVEsWUFBYSxPQUFPLFVBQVUsV0FBWSxRQUFRLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDM0U7QUFBQSxNQUNBLFNBQVMsV0FBUztBQUNqQixZQUFJLENBQUMsTUFBTTtBQUNWLGlCQUFPO0FBQ1AsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBQUEsTUFDQSxPQUFPLE1BQU07QUFDWixZQUFJLENBQUMsTUFBTTtBQUNWLGlCQUFPO0FBQ1Asa0JBQVEsUUFBUSxPQUFPLENBQUM7QUFBQSxRQUN6QjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRjtBQUVPLFNBQVMsb0NBQW9DLFVBQXlEO0FBQzVHLFFBQU0sVUFBVSxJQUFJLDJCQUEyQjtBQUUvQyxNQUFJO0FBQ0osU0FBTyxRQUFRLFFBQVEsU0FBUyxLQUFLLE9BQU8sVUFBVTtBQUNyRCxZQUFRLFlBQVksS0FBSztBQUFBLEVBQzFCO0FBRUEsU0FBTyxRQUFRLE9BQU87QUFDdkI7QUFFTyxTQUFTLGlCQUFpQixPQUFnRSxZQUFnRztBQUNoTSxNQUFJO0FBQ0osTUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixjQUFVLHdCQUF3QixLQUFLO0FBQUEsRUFDeEMsV0FBVyxNQUFNLGdCQUFnQixLQUFLLEdBQUc7QUFDeEMsY0FBVSxvQ0FBb0MsS0FBSztBQUFBLEVBQ3BELE9BQU87QUFDTixjQUFVO0FBQUEsRUFDWDtBQUNBLFNBQU8sUUFBUSxPQUFPLFVBQVU7QUFDakM7QUFFQSxJQUFJLFdBQVc7QUFFZixNQUFNLG1CQUFtQjtBQUN6QixNQUFNLHFCQUFxQjtBQUMzQixNQUFNLHNCQUFzQjtBQUU1QixNQUFNLGtCQUFpRDtBQUFBLEVBS3RELFlBQVksUUFBNkI7QUFDeEMsU0FBSyxVQUFVO0FBQ2YsU0FBSyxPQUFPO0FBQUEsRUFDYjtBQUFBLEVBRU8sT0FBc0I7QUFDNUIsUUFBSSxLQUFLLE1BQU07QUFDZCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBbUIsQ0FBQztBQUMxQixRQUFJLFlBQVk7QUFDaEIsUUFBSSxlQUFlO0FBRW5CLE9BQUc7QUFDRixZQUFNLE1BQU0sS0FBSyxRQUFRLEtBQUs7QUFFOUIsVUFBSSxRQUFRLE1BQU07QUFFakIsYUFBSyxPQUFPO0FBQ1osWUFBSSxjQUFjLEdBQUc7QUFDcEIsaUJBQU87QUFBQSxRQUNSLE9BQU87QUFDTixpQkFBTyxPQUFPLEtBQUssRUFBRTtBQUFBLFFBQ3RCO0FBQUEsTUFDRDtBQUVBLFVBQUksSUFBSSxTQUFTLEdBQUc7QUFDbkIsZUFBTyxXQUFXLElBQUk7QUFDdEIsd0JBQWdCLElBQUk7QUFBQSxNQUNyQjtBQUVBLFVBQUksZ0JBQWdCLEtBQUssTUFBTTtBQUM5QixlQUFPLE9BQU8sS0FBSyxFQUFFO0FBQUEsTUFDdEI7QUFBQSxJQUNELFNBQVM7QUFBQSxFQUNWO0FBQ0Q7QUFFQSxNQUFNLGNBQWMsTUFBTTtBQUFFLFFBQU0sSUFBSSxNQUFNLHlCQUF5QjtBQUFHO0FBRXhFLElBQVcsNkJBQVgsa0JBQVdBLGdDQUFYO0FBSUMsRUFBQUEsd0RBQUEsYUFBVSxLQUFWO0FBSUEsRUFBQUEsd0RBQUEsb0JBQWlCLEtBQWpCO0FBUlUsU0FBQUE7QUFBQSxHQUFBO0FBV0osSUFBTSxZQUFOLGNBQXdCLFdBQThEO0FBQUEsRUF1SDVGLFlBQ0MsUUFDQSx1QkFDQSxpQkFDQSxxQkFBaUMsTUFDRSxrQkFDQSxrQkFDYSwrQkFDUixzQkFDdkM7QUFDRCxVQUFNO0FBTDZCO0FBQ0E7QUFDYTtBQUNSO0FBM0Z6QztBQUFBLFNBQWlCLGlCQUFnQyxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDbkYsU0FBZ0IsZ0JBQTZCLEtBQUssZUFBZTtBQUVqRSxTQUFpQiwwQkFBdUQsS0FBSyxVQUFVLElBQUksNEJBQTRCLENBQUMsMkJBQTJCLHFCQUFxQixzQkFBc0IsS0FBSyx3Q0FBd0MsMkJBQTJCLHFCQUFxQixpQkFBaUIsQ0FBQyxDQUFDO0FBQzlTLFNBQWdCLHlCQUErRCxLQUFLLHdCQUF3QjtBQU01RyxTQUFpQixzQkFBMEQsS0FBSyxVQUFVLElBQUksUUFBbUMsQ0FBQztBQUdsSSxTQUFpQix1QkFBc0MsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBR3pGLFNBQWlCLHlCQUErRCxLQUFLLFVBQVUsSUFBSSxRQUFxQyxDQUFDO0FBR3pJLFNBQWlCLG1CQUFtRCxLQUFLLFVBQVUsSUFBSSxRQUErQixDQUFDO0FBR3ZILFNBQWlCLGdCQUF5QyxLQUFLLFVBQVUsSUFBSSx3QkFBd0IsQ0FBQztBQWF0RyxTQUFpQiw2QkFBNkIsS0FBSyxVQUFVLElBQUksa0JBQStCLENBQUM7QUE0QmpHLFNBQVEsMEJBQWtDO0FBaUIxQyxTQUFpQixpQkFBaUIsS0FBSyxVQUFVLElBQUksY0FBYyxDQUFDO0FBQ3BFLFNBQWlCLGNBQWMsb0JBQUksSUFBZ0I7QUFlbEQ7QUFDQSxTQUFLLEtBQUssV0FBVztBQUNyQixTQUFLLG9CQUFvQixnQkFBZ0I7QUFDekMsUUFBSSxPQUFPLHVCQUF1QixlQUFlLHVCQUF1QixNQUFNO0FBQzdFLFdBQUssc0JBQXNCLElBQUksTUFBTSxzQkFBc0IsUUFBUTtBQUFBLElBQ3BFLE9BQU87QUFDTixXQUFLLHNCQUFzQjtBQUFBLElBQzVCO0FBQ0EsU0FBSyx1QkFBdUI7QUFFNUIsVUFBTSxFQUFFLFlBQVksV0FBVyxJQUFJLGlCQUFpQixRQUFRLGdCQUFnQixVQUFVO0FBQ3RGLFNBQUssVUFBVTtBQUNmLFNBQUssb0JBQW9CO0FBRXpCLFVBQU0sa0JBQWtCLEtBQUssUUFBUSxhQUFhO0FBQ2xELFVBQU0sbUJBQW1CLEtBQUssUUFBUSxzQkFBc0IsSUFBSSxNQUFNLEdBQUcsR0FBRyxpQkFBaUIsS0FBSyxRQUFRLGNBQWMsZUFBZSxJQUFJLENBQUMsR0FBRyxNQUFNLG9CQUFvQixXQUFXO0FBS3BMLFFBQUksZ0JBQWdCLHdCQUF3QjtBQUMzQyxXQUFLLDZCQUNILG1CQUFtQixVQUFVLDZCQUMxQixrQkFBa0IsVUFBVTtBQUdqQyxXQUFLLDhCQUE4QixtQkFBbUIsVUFBVTtBQUFBLElBQ2pFLE9BQU87QUFDTixXQUFLLDZCQUE2QjtBQUNsQyxXQUFLLDhCQUE4QjtBQUFBLElBQ3BDO0FBRUEsU0FBSyxXQUFXLFVBQVUsZUFBZSxLQUFLLFNBQVMsZUFBZTtBQUV0RSxVQUFNLGFBQWMsT0FBTywwQkFBMEIsV0FBVyx3QkFBd0Isc0JBQXNCO0FBQzlHLFFBQUksT0FBTywwQkFBMEIsVUFBVTtBQUM5QyxXQUFLLDJCQUEyQixRQUFRLHNCQUFzQixZQUFZLE1BQU0sS0FBSyxhQUFhLHNCQUFzQixVQUFVLENBQUM7QUFBQSxJQUNwSTtBQUVBLFNBQUssZ0JBQWdCLEtBQUssVUFBVSxJQUFJLDBCQUEwQixNQUFNLEtBQUssNkJBQTZCLENBQUM7QUFDM0csU0FBSyx1QkFBdUIsS0FBSyxVQUFVLElBQUksb0JBQW9CLE1BQU0sS0FBSyw2QkFBNkIsQ0FBQztBQUM1RyxTQUFLLHNCQUFzQixLQUFLLFVBQVUsSUFBSSx3Q0FBd0MsSUFBSSxDQUFDO0FBQzNGLFNBQUssNkJBQTZCLEtBQUsscUJBQXFCO0FBQUEsTUFBZTtBQUFBLE1BQzFFO0FBQUEsTUFDQSxLQUFLO0FBQUEsTUFDTDtBQUFBLE1BQ0EsS0FBSztBQUFBLElBQ047QUFDQSxTQUFLLGdDQUFnQyxLQUFLLFVBQVUsSUFBSSxtQ0FBbUMsTUFBTSxLQUFLLDBCQUEwQixDQUFDO0FBRWpJLFNBQUssd0JBQXlCLG1CQUFtQixVQUFVO0FBRTNELFNBQUssYUFBYTtBQUNsQixTQUFLLHdCQUF3QjtBQUM3QixTQUFLLDJCQUEyQjtBQUVoQyxTQUFLLGNBQWM7QUFDbkIsU0FBSyxnQkFBZ0I7QUFFckIsU0FBSyxjQUFjLFFBQVEsaUJBQWlCLFFBQVE7QUFDcEQsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyxlQUFlLHVCQUFPLE9BQU8sSUFBSTtBQUN0QyxTQUFLLG1CQUFtQixJQUFJLGlCQUFpQjtBQUU3QyxTQUFLLGtCQUFrQixJQUFJLFVBQVUsTUFBTSxLQUFLLGdCQUFnQjtBQUNoRSxTQUFLLGFBQWE7QUFDbEIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssMkJBQTJCO0FBR2hDLFNBQUssVUFBVSxLQUFLLG9CQUFvQixZQUFZLE1BQU07QUFDekQsV0FBSyx3QkFBd0Isa0JBQWtCO0FBQy9DLFdBQUssd0JBQXdCLEtBQUs7QUFDbEMsV0FBSyx3QkFBd0IsZ0JBQWdCO0FBQUEsSUFDOUMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssOEJBQThCLHNCQUFzQixDQUFDLHdCQUF3QjtBQUNoRyxXQUFLLHdCQUF3QixrQkFBa0I7QUFDL0MsV0FBSyx3QkFBd0IsS0FBSztBQUNsQyxXQUFLLDJCQUEyQixtQkFBbUI7QUFDbkQsV0FBSyx3QkFBd0IsZ0JBQWdCO0FBQUEsSUFDOUMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssOEJBQThCLGdCQUFnQixDQUFDLHNCQUFzQjtBQUN4RixXQUFLLHdCQUF3QixrQkFBa0I7QUFDL0MsV0FBSyx3QkFBd0IsS0FBSztBQUNsQyxXQUFLLHFCQUFxQixpQkFBaUI7QUFDM0MsV0FBSyx3QkFBd0IsZ0JBQWdCO0FBQUEsSUFDOUMsQ0FBQyxDQUFDO0FBRUYsU0FBSyxpQkFBaUIsNEJBQTRCLFVBQVU7QUFFNUQsU0FBSyxVQUFVLEtBQUssOEJBQThCLFlBQVksT0FBSztBQUNsRSxXQUFLLGNBQWMseUNBQXlDLENBQUM7QUFDN0QsV0FBSywyQkFBMkIseUNBQXlDLENBQUM7QUFBQSxJQUMzRSxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUEvTUEsT0FBYyxlQUFlLFlBQStCLFNBQTBFO0FBQ3JJLFFBQUksUUFBUSxtQkFBbUI7QUFDOUIsWUFBTSxxQkFBcUIsaUJBQWlCLFlBQVksUUFBUSxTQUFTLFFBQVEsWUFBWTtBQUM3RixhQUFPLElBQUksTUFBTSx5QkFBeUI7QUFBQSxRQUN6QyxTQUFTLG1CQUFtQjtBQUFBLFFBQzVCLFlBQVk7QUFBQTtBQUFBLFFBQ1osY0FBYyxtQkFBbUI7QUFBQSxRQUNqQyxvQkFBb0IsUUFBUTtBQUFBLFFBQzVCLFlBQVksUUFBUTtBQUFBLFFBQ3BCLGdDQUFnQyxRQUFRO0FBQUEsTUFDekMsQ0FBQztBQUFBLElBQ0Y7QUFFQSxXQUFPLElBQUksTUFBTSx5QkFBeUIsT0FBTztBQUFBLEVBQ2xEO0FBQUEsRUFTQSxJQUFXLHNCQUFzQjtBQUFFLFdBQU8sS0FBSywyQkFBMkI7QUFBQSxFQUFxQjtBQUFBLEVBQy9GLElBQVcsbUNBQW1DO0FBQUUsV0FBTyxLQUFLLDJCQUEyQjtBQUFBLEVBQWtDO0FBQUEsRUFDekgsSUFBVyxvQkFBb0I7QUFBRSxXQUFPLEtBQUssMkJBQTJCO0FBQUEsRUFBbUI7QUFBQSxFQUczRixJQUFXLHFCQUF1RDtBQUFFLFdBQU8sS0FBSyxvQkFBb0I7QUFBQSxFQUFPO0FBQUEsRUFHM0csSUFBVyxzQkFBbUM7QUFBRSxXQUFPLEtBQUsscUJBQXFCO0FBQUEsRUFBTztBQUFBLEVBR3hGLElBQVcsd0JBQTREO0FBQUUsV0FBTyxLQUFLLHVCQUF1QjtBQUFBLEVBQU87QUFBQSxFQUduSCxJQUFXLGtCQUFnRDtBQUFFLFdBQU8sS0FBSyxpQkFBaUI7QUFBQSxFQUFPO0FBQUEsRUFHMUYsbUJBQW1CLFVBQStEO0FBQ3hGLFdBQU8sS0FBSyxjQUFjLE1BQU0sQ0FBQyxNQUF1QyxTQUFTLEVBQUUsbUJBQW1CLENBQUM7QUFBQSxFQUN4RztBQUFBLEVBY08sZUFBd0I7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFlO0FBQUEsRUFpQzVELElBQVcsZUFBMkM7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUE0QjtBQUFBLEVBR2hHLElBQVcsZUFBMkM7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFlO0FBQUEsRUFHbkYsSUFBVyxTQUErQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQXNCO0FBQUEsRUFrSDlELFVBQWdCO0FBQy9CLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssZUFBZSxLQUFLO0FBQ3pCLFNBQUssMkJBQTJCLFFBQVE7QUFDeEMsU0FBSyxjQUFjO0FBQ25CLFVBQU0sUUFBUTtBQUNkLFNBQUssa0JBQWtCLFFBQVE7QUFDL0IsU0FBSyxnQkFBZ0I7QUFHckIsVUFBTSwwQkFBMEIsSUFBSSxvQkFBb0IsQ0FBQyxHQUFHLElBQUksTUFBTSxPQUFPLE9BQU8sTUFBTSxJQUFJO0FBQzlGLDRCQUF3QixRQUFRO0FBQ2hDLFNBQUssVUFBVTtBQUNmLFNBQUssb0JBQW9CLFdBQVc7QUFBQSxFQUNyQztBQUFBLEVBRUEsZ0JBQXlCO0FBQ3hCLFdBQ0MsS0FBSyxlQUFlLGFBQWEsS0FDOUIsS0FBSyx3QkFBd0IsYUFBYSxLQUMxQyxLQUFLLDJCQUEyQixjQUFjLEtBQzlDLEtBQUssb0JBQW9CLGFBQWEsS0FDdEMsS0FBSyxxQkFBcUIsYUFBYSxLQUN2QyxLQUFLLHVCQUF1QixhQUFhLEtBQ3pDLEtBQUssaUJBQWlCLGFBQWEsS0FDbkMsS0FBSyxjQUFjLGFBQWE7QUFBQSxFQUVyQztBQUFBLEVBRVEscUJBQTJCO0FBQ2xDLFFBQUksS0FBSyxhQUFhO0FBQ3JCLFlBQU0sSUFBSSxtQkFBbUIsb0JBQW9CO0FBQUEsSUFDbEQ7QUFBQSxFQUNEO0FBQUEsRUFFTyxrQkFBa0IsV0FBNkI7QUFDckQsU0FBSyxZQUFZLElBQUksU0FBUztBQUFBLEVBQy9CO0FBQUEsRUFFTyxvQkFBb0IsV0FBNkI7QUFDdkQsU0FBSyxZQUFZLE9BQU8sU0FBUztBQUFBLEVBQ2xDO0FBQUEsRUFFTyxpQkFBaUIsT0FBbUM7QUFDMUQsU0FBSyxtQkFBbUI7QUFDeEIsV0FBTyxLQUFLLFFBQVEsT0FBTyxLQUFLO0FBQUEsRUFDakM7QUFBQSxFQUVPLGdCQUFtQztBQUN6QyxTQUFLLG1CQUFtQjtBQUN4QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUSx5QkFBeUIsV0FBd0MsUUFBbUMscUJBQXlDLE1BQVk7QUFDaEssUUFBSSxLQUFLLGVBQWU7QUFFdkI7QUFBQSxJQUNEO0FBQ0EsU0FBSywyQkFBMkIsdUJBQXVCLE1BQU07QUFDN0QsU0FBSyxjQUFjLHVCQUF1QixNQUFNO0FBQ2hELFNBQUssOEJBQThCLHVCQUF1QixNQUFNO0FBQ2hFLFVBQU0scUJBQXFCLElBQUksZ0NBQWdDLFdBQVcsTUFBTTtBQUVoRixRQUFJLG9CQUFvQjtBQUN2Qix5QkFBbUIsdUJBQXVCLHFCQUFxQjtBQUFBLElBQ2hFO0FBQ0EsU0FBSyxrQ0FBa0Msa0JBQWtCO0FBQ3pELFNBQUssY0FBYyxLQUFLLGtCQUFrQjtBQUFBLEVBQzNDO0FBQUEsRUFFTyxTQUFTLE9BQXFDLFNBQVMsWUFBWSxTQUFTLEdBQVM7QUFDM0YsU0FBSyxtQkFBbUI7QUFFeEIsUUFBSSxVQUFVLFFBQVEsVUFBVSxRQUFXO0FBQzFDLFlBQU0sZ0JBQWdCO0FBQUEsSUFDdkI7QUFFQSxVQUFNLEVBQUUsWUFBWSxXQUFXLElBQUksaUJBQWlCLE9BQU8sS0FBSyxTQUFTLFVBQVU7QUFDbkYsU0FBSyx3QkFBd0IsWUFBWSxZQUFZLE1BQU07QUFBQSxFQUM1RDtBQUFBLEVBRVEsdUJBQXVCLE9BQWMsYUFBcUIsYUFBcUIsa0JBQTRCLE1BQWMsV0FBb0IsV0FBb0IsU0FBa0IsYUFBc0IsUUFBd0Q7QUFDeFEsV0FBTztBQUFBLE1BQ04sU0FBUyxDQUFDO0FBQUEsUUFDVDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLE1BQ0QsS0FBSyxLQUFLLFFBQVEsT0FBTztBQUFBLE1BQ3pCO0FBQUEsTUFDQSxXQUFXLEtBQUssYUFBYTtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLGlCQUFpQixDQUFDLE1BQU07QUFBQSxNQUN4Qiw4QkFBOEIsQ0FBQyxDQUFDO0FBQUEsSUFDakM7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBd0IsWUFBK0Isc0JBQW1DLFFBQW1DO0FBQ3BJLFNBQUssbUJBQW1CO0FBQ3hCLFVBQU0sb0JBQW9CLEtBQUssa0JBQWtCO0FBQ2pELFVBQU0sc0JBQXNCLEtBQUssc0JBQXNCLGlCQUFpQjtBQUN4RSxVQUFNLGdCQUFnQixLQUFLLGFBQWE7QUFDeEMsVUFBTSxZQUFZLEtBQUssaUJBQWlCLGFBQWE7QUFFckQsU0FBSyxVQUFVO0FBQ2YsU0FBSyxrQkFBa0IsUUFBUTtBQUMvQixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLG1CQUFtQjtBQUd4QixTQUFLLGVBQWUsdUJBQU8sT0FBTyxJQUFJO0FBQ3RDLFNBQUssbUJBQW1CLElBQUksaUJBQWlCO0FBRzdDLFNBQUssZ0JBQWdCLE1BQU07QUFDM0IsU0FBSywyQkFBMkI7QUFFaEMsU0FBSztBQUFBLE1BQ0osSUFBSTtBQUFBLFFBQ0g7QUFBQSxVQUNDLElBQUksY0FBYztBQUFBLFFBQ25CO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLHVCQUF1QixJQUFJLE1BQU0sR0FBRyxHQUFHLGVBQWUsU0FBUyxHQUFHLEdBQUcscUJBQXFCLElBQUksU0FBUyxlQUFlLFNBQVMsR0FBRyxLQUFLLFNBQVMsR0FBRyxPQUFPLE9BQU8sTUFBTSxPQUFPLE1BQU07QUFBQSxJQUMxTDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLE9BQU8sS0FBb0M7QUFDakQsU0FBSyxtQkFBbUI7QUFDeEIsVUFBTSxTQUFVLFFBQVEsTUFBTSxrQkFBa0IsT0FBTyxTQUFTO0FBQ2hFLFFBQUksS0FBSyxRQUFRLE9BQU8sTUFBTSxRQUFRO0FBRXJDO0FBQUEsSUFDRDtBQUVBLFVBQU0sb0JBQW9CLEtBQUssa0JBQWtCO0FBQ2pELFVBQU0sc0JBQXNCLEtBQUssc0JBQXNCLGlCQUFpQjtBQUN4RSxVQUFNLGdCQUFnQixLQUFLLGFBQWE7QUFDeEMsVUFBTSxZQUFZLEtBQUssaUJBQWlCLGFBQWE7QUFFckQsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxRQUFRLE9BQU8sTUFBTTtBQUMxQixTQUFLLG1CQUFtQjtBQUN4QixTQUFLLGtCQUFrQjtBQUV2QixTQUFLO0FBQUEsTUFDSixJQUFJO0FBQUEsUUFDSDtBQUFBLFVBQ0MsSUFBSSxtQkFBbUI7QUFBQSxRQUN4QjtBQUFBLFFBQ0EsS0FBSztBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyx1QkFBdUIsSUFBSSxNQUFNLEdBQUcsR0FBRyxlQUFlLFNBQVMsR0FBRyxHQUFHLHFCQUFxQixJQUFJLFNBQVMsZUFBZSxTQUFTLEdBQUcsS0FBSyxTQUFTLEdBQUcsT0FBTyxPQUFPLE9BQU8sTUFBTSxZQUFZLFVBQVUsQ0FBQztBQUFBLElBQzNNO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQTJCO0FBRWxDLFNBQUssaUJBQWlCLHlCQUF5QixJQUFJO0FBQUEsRUFDcEQ7QUFBQSxFQUVRLG9CQUEwQjtBQUVqQyxVQUFNLFlBQVksS0FBSyxhQUFhO0FBQ3BDLFVBQU0saUJBQWlCLEtBQUssaUJBQWlCLHNCQUFzQjtBQUNuRSxhQUFTLElBQUksR0FBRyxNQUFNLGVBQWUsUUFBUSxJQUFJLEtBQUssS0FBSztBQUMxRCxZQUFNLE9BQU8sZUFBZSxDQUFDO0FBQzdCLFlBQU0sUUFBUSxLQUFLO0FBRW5CLFlBQU0sUUFBUSxLQUFLLHNCQUFzQixLQUFLO0FBRTlDLFlBQU0sY0FBYyxLQUFLLFFBQVEsWUFBWSxNQUFNLGlCQUFpQixNQUFNLFdBQVc7QUFDckYsWUFBTSxZQUFZLEtBQUssUUFBUSxZQUFZLE1BQU0sZUFBZSxNQUFNLFNBQVM7QUFFL0UsV0FBSyxzQkFBc0I7QUFDM0IsV0FBSyxvQkFBb0I7QUFDekIsV0FBSyxrQkFBa0I7QUFFdkIsV0FBSyxRQUFRLGNBQWM7QUFDM0IsV0FBSyxNQUFNLFlBQVk7QUFFdkIsc0JBQWdCLElBQUk7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLG1CQUF3QztBQUM5QyxTQUFLO0FBQ0wsUUFBSSxLQUFLLHlCQUF5QixHQUFHO0FBQ3BDLFdBQUssMkJBQTJCLHdCQUF3QjtBQUN4RCxXQUFLLHFCQUFxQixLQUFLLE1BQVM7QUFBQSxJQUN6QztBQUNBLFdBQU8sS0FBSyxlQUFlLFdBQVc7QUFBQSxFQUN2QztBQUFBLEVBRU8saUJBQWlCLE1BQWlDO0FBQ3hELFNBQUs7QUFDTCxRQUFJLEtBQUsseUJBQXlCLEdBQUc7QUFDcEMsV0FBSywyQkFBMkIsd0JBQXdCO0FBQ3hELFdBQUsscUJBQXFCLEtBQUssTUFBUztBQUFBLElBQ3pDO0FBQ0EsU0FBSyxlQUFlLFdBQVcsSUFBSTtBQUFBLEVBQ3BDO0FBQUEsRUFFTyxxQkFBOEI7QUFDcEMsV0FBTyxLQUFLLHVCQUF1QjtBQUFBLEVBQ3BDO0FBQUEsRUFFTyx5QkFBaUM7QUFDdkMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sdUJBQWdDO0FBQ3RDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLDRCQUFxQztBQUMzQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyw2QkFBc0M7QUFDNUMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sYUFBc0I7QUFDNUIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8seUJBQWtDO0FBQ3hDLFNBQUssbUJBQW1CO0FBQ3hCLFFBQUksS0FBSywwQkFBMEIsR0FBRztBQUVyQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUkscUJBQXFCO0FBQ3pCLFFBQUksb0JBQW9CO0FBRXhCLFVBQU0sWUFBWSxLQUFLLFFBQVEsYUFBYTtBQUM1QyxhQUFTLGFBQWEsR0FBRyxjQUFjLFdBQVcsY0FBYztBQUMvRCxZQUFNLGFBQWEsS0FBSyxRQUFRLGNBQWMsVUFBVTtBQUN4RCxVQUFJLGNBQWMsb0JBQW9CO0FBQ3JDLDZCQUFxQjtBQUFBLE1BQ3RCLE9BQU87QUFDTiw4QkFBc0I7QUFBQSxNQUN2QjtBQUFBLElBQ0Q7QUFFQSxXQUFRLG9CQUFvQjtBQUFBLEVBQzdCO0FBQUEsRUFFQSxJQUFXLE1BQVc7QUFDckIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUEsRUFJTyxhQUE2QztBQUNuRCxTQUFLLG1CQUFtQjtBQUN4QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyx1QkFBMEM7QUFDaEQsV0FBTztBQUFBLE1BQ04sU0FBUyxLQUFLLFNBQVM7QUFBQSxNQUN2QixjQUFjLEtBQUssU0FBUztBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBLEVBRU8sY0FBYyxVQUErQztBQUNuRSxTQUFLLG1CQUFtQjtBQUN4QixVQUFNLFVBQVcsT0FBTyxTQUFTLFlBQVksY0FBZSxTQUFTLFVBQVUsS0FBSyxTQUFTO0FBQzdGLFVBQU0sYUFBYyxPQUFPLFNBQVMsZUFBZSxjQUFlLFNBQVMsYUFBYSxLQUFLLFNBQVM7QUFDdEcsVUFBTSxlQUFnQixPQUFPLFNBQVMsaUJBQWlCLGNBQWUsU0FBUyxlQUFlLEtBQUssU0FBUztBQUM1RyxVQUFNLHFCQUFzQixPQUFPLFNBQVMsdUJBQXVCLGNBQWUsU0FBUyxxQkFBcUIsS0FBSyxTQUFTO0FBQzlILFVBQU0saUNBQWtDLE9BQU8sU0FBUywrQkFBK0IsY0FBZSxTQUFTLDZCQUE2QixLQUFLLFNBQVM7QUFFMUosVUFBTSxVQUFVLElBQUksTUFBTSx5QkFBeUI7QUFBQSxNQUNsRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxZQUFZLEtBQUssU0FBUztBQUFBLE1BQzFCO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksS0FBSyxTQUFTLE9BQU8sT0FBTyxHQUFHO0FBQ2xDO0FBQUEsSUFDRDtBQUVBLFVBQU0sSUFBSSxLQUFLLFNBQVMsa0JBQWtCLE9BQU87QUFDakQsU0FBSyxXQUFXO0FBRWhCLFNBQUssY0FBYyx1QkFBdUIsQ0FBQztBQUMzQyxTQUFLLG9CQUFvQix1QkFBdUIsQ0FBQztBQUNqRCxTQUFLLG9CQUFvQixLQUFLLENBQUM7QUFBQSxFQUNoQztBQUFBLEVBRU8sa0JBQWtCLHFCQUE4QixnQkFBOEI7QUFDcEYsU0FBSyxtQkFBbUI7QUFDeEIsVUFBTSxxQkFBcUIsaUJBQWlCLEtBQUssU0FBUyxnQkFBZ0IsbUJBQW1CO0FBQzdGLFNBQUssY0FBYztBQUFBLE1BQ2xCLGNBQWMsbUJBQW1CO0FBQUEsTUFDakMsU0FBUyxtQkFBbUI7QUFBQSxNQUM1QixZQUFZLG1CQUFtQjtBQUFBO0FBQUEsSUFDaEMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLHFCQUFxQixLQUFxQjtBQUNoRCxTQUFLLG1CQUFtQjtBQUN4QixXQUFPLHFCQUFxQixLQUFLLEtBQUssU0FBUyxZQUFZLEtBQUssU0FBUyxZQUFZO0FBQUEsRUFDdEY7QUFBQTtBQUFBO0FBQUEsRUFNTyxlQUF1QjtBQUM3QixTQUFLLG1CQUFtQjtBQUN4QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxrQkFBMkI7QUFDakMsV0FBTyxLQUFLLFFBQVEsZ0JBQWdCO0FBQUEsRUFDckM7QUFBQSxFQUVPLHFDQUE4QztBQUNwRCxXQUFPLEtBQUssUUFBUSxtQ0FBbUM7QUFBQSxFQUN4RDtBQUFBLEVBRU8sNkJBQTZCLGFBQWlDLE1BQVk7QUFDaEYsVUFBTSxVQUFVLEtBQUssWUFBWSxRQUFRLHlCQUF5QixRQUFRLE9BQU8sTUFBTSxPQUFPLE1BQU0sT0FBTyxVQUFVLHNCQUFzQjtBQUMzSSxTQUFLLFFBQVEsd0NBQXdDO0FBQ3JELFNBQUssbUJBQW1CLFlBQVksUUFBUSxJQUFJLFFBQU0sRUFBRSxPQUFPLEVBQUUsT0FBTyxNQUFNLEtBQUssRUFBRSxHQUFHLE1BQU0sSUFBSTtBQUFBLEVBQ25HO0FBQUEsRUFFTyw0QkFBcUM7QUFDM0MsV0FBTyxLQUFLLFFBQVEsMEJBQTBCO0FBQUEsRUFDL0M7QUFBQSxFQUVPLDBCQUFrQztBQUN4QyxTQUFLLG1CQUFtQjtBQUN4QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyw2QkFBK0Q7QUFDckUsU0FBSyxtQkFBbUI7QUFDeEIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sWUFBWSxhQUFnQztBQUNsRCxTQUFLLG1CQUFtQjtBQUN4QixVQUFNLFdBQVcsS0FBSyxrQkFBa0IsWUFBWSxZQUFZLFlBQVksUUFBUSxlQUFrQztBQUN0SCxXQUFPLEtBQUssUUFBUSxZQUFZLFNBQVMsWUFBWSxTQUFTLE1BQU07QUFBQSxFQUNyRTtBQUFBLEVBRU8sY0FBYyxXQUE2QjtBQUNqRCxTQUFLLG1CQUFtQjtBQUN4QixVQUFNLFNBQVUsS0FBSyxJQUFJLEtBQUssUUFBUSxVQUFVLEdBQUcsS0FBSyxJQUFJLEdBQUcsU0FBUyxDQUFDO0FBQ3pFLFdBQU8sS0FBSyxRQUFRLGNBQWMsTUFBTTtBQUFBLEVBQ3pDO0FBQUEsRUFFUSxxQkFBMkI7QUFDbEMsU0FBSyxhQUFhLEtBQUssYUFBYTtBQUNwQyxTQUFLLHdCQUF3QixLQUFLO0FBQUEsRUFDbkM7QUFBQSxFQUVPLG9CQUFvQixXQUF5QjtBQUNuRCxTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUFBLEVBRU8sK0JBQStCLHlCQUF1QztBQUM1RSxTQUFLLHdCQUF3QjtBQUFBLEVBQzlCO0FBQUEsRUFFTyxrQ0FBa0MsNEJBQW9FO0FBQzVHLFNBQUssMkJBQTJCO0FBQUEsRUFDakM7QUFBQSxFQUVPLFNBQVMsS0FBaUMsY0FBdUIsT0FBZTtBQUN0RixTQUFLLG1CQUFtQjtBQUN4QixRQUFJLEtBQUssMkJBQTJCLEdBQUc7QUFDdEMsWUFBTSxJQUFJLG1CQUFtQiwyQ0FBMkM7QUFBQSxJQUN6RTtBQUVBLFVBQU0saUJBQWlCLEtBQUssa0JBQWtCO0FBQzlDLFVBQU0saUJBQWlCLEtBQUssZ0JBQWdCLGdCQUFnQixHQUFHO0FBRS9ELFFBQUksYUFBYTtBQUNoQixhQUFPLEtBQUssUUFBUSxPQUFPLElBQUk7QUFBQSxJQUNoQztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxlQUFlLGNBQXVCLE9BQTRCO0FBQ3hFLFdBQU8sSUFBSSxrQkFBa0IsS0FBSyxRQUFRLGVBQWUsV0FBVyxDQUFDO0FBQUEsRUFDdEU7QUFBQSxFQUVPLGVBQWUsS0FBaUMsY0FBdUIsT0FBZTtBQUM1RixTQUFLLG1CQUFtQjtBQUN4QixVQUFNLGlCQUFpQixLQUFLLGtCQUFrQjtBQUM5QyxVQUFNLGlCQUFpQixLQUFLLHNCQUFzQixnQkFBZ0IsR0FBRztBQUVyRSxRQUFJLGFBQWE7QUFDaEIsYUFBTyxLQUFLLFFBQVEsT0FBTyxFQUFFLFNBQVM7QUFBQSxJQUN2QztBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxnQkFBZ0IsVUFBa0IsTUFBaUMsTUFBTSxvQkFBb0IsYUFBcUI7QUFDeEgsU0FBSyxtQkFBbUI7QUFDeEIsV0FBTyxLQUFLLFFBQVEsZ0JBQWdCLEtBQUssY0FBYyxRQUFRLEdBQUcsR0FBRztBQUFBLEVBQ3RFO0FBQUEsRUFFTyxzQkFBc0IsVUFBa0IsTUFBaUMsTUFBTSxvQkFBb0IsYUFBcUI7QUFDOUgsU0FBSyxtQkFBbUI7QUFDeEIsV0FBTyxLQUFLLFFBQVEsc0JBQXNCLEtBQUssY0FBYyxRQUFRLEdBQUcsR0FBRztBQUFBLEVBQzVFO0FBQUEsRUFFTyx5QkFBeUIsVUFBa0IsTUFBaUMsTUFBTSxvQkFBb0IsYUFBcUI7QUFDakksU0FBSyxtQkFBbUI7QUFDeEIsV0FBTyxLQUFLLFFBQVEseUJBQXlCLEtBQUssY0FBYyxRQUFRLEdBQUcsR0FBRztBQUFBLEVBQy9FO0FBQUEsRUFFTyxlQUF1QjtBQUM3QixTQUFLLG1CQUFtQjtBQUN4QixXQUFPLEtBQUssUUFBUSxhQUFhO0FBQUEsRUFDbEM7QUFBQSxFQUVPLGVBQWUsWUFBNEI7QUFDakQsU0FBSyxtQkFBbUI7QUFDeEIsUUFBSSxhQUFhLEtBQUssYUFBYSxLQUFLLGFBQWEsR0FBRztBQUN2RCxZQUFNLElBQUksbUJBQW1CLDhCQUE4QjtBQUFBLElBQzVEO0FBRUEsV0FBTyxLQUFLLFFBQVEsZUFBZSxVQUFVO0FBQUEsRUFDOUM7QUFBQSxFQUVPLGNBQWMsWUFBNEI7QUFDaEQsU0FBSyxtQkFBbUI7QUFDeEIsUUFBSSxhQUFhLEtBQUssYUFBYSxLQUFLLGFBQWEsR0FBRztBQUN2RCxZQUFNLElBQUksbUJBQW1CLDhCQUE4QjtBQUFBLElBQzVEO0FBRUEsV0FBTyxLQUFLLFFBQVEsY0FBYyxVQUFVO0FBQUEsRUFDN0M7QUFBQSxFQUVPLGtCQUE0QjtBQUNsQyxTQUFLLG1CQUFtQjtBQUN4QixRQUFJLEtBQUssMkJBQTJCLEdBQUc7QUFDdEMsWUFBTSxJQUFJLG1CQUFtQiwyQ0FBMkM7QUFBQSxJQUN6RTtBQUVBLFdBQU8sS0FBSyxRQUFRLGdCQUFnQjtBQUFBLEVBQ3JDO0FBQUEsRUFFTyxTQUFpQjtBQUN2QixTQUFLLG1CQUFtQjtBQUN4QixXQUFPLEtBQUssUUFBUSxPQUFPO0FBQUEsRUFDNUI7QUFBQSxFQUVPLHVCQUFnRDtBQUN0RCxTQUFLLG1CQUFtQjtBQUN4QixXQUNDLEtBQUssUUFBUSxPQUFPLE1BQU0sT0FDdkIsTUFBTSxrQkFBa0IsS0FDeEIsTUFBTSxrQkFBa0I7QUFBQSxFQUU3QjtBQUFBLEVBRU8saUJBQWlCLFlBQTRCO0FBQ25ELFNBQUssbUJBQW1CO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxpQkFBaUIsWUFBNEI7QUFDbkQsU0FBSyxtQkFBbUI7QUFDeEIsUUFBSSxhQUFhLEtBQUssYUFBYSxLQUFLLGFBQWEsR0FBRztBQUN2RCxZQUFNLElBQUksbUJBQW1CLDhCQUE4QjtBQUFBLElBQzVEO0FBQ0EsV0FBTyxLQUFLLFFBQVEsY0FBYyxVQUFVLElBQUk7QUFBQSxFQUNqRDtBQUFBLEVBRU8sZ0NBQWdDLFlBQTRCO0FBQ2xFLFNBQUssbUJBQW1CO0FBQ3hCLFFBQUksYUFBYSxLQUFLLGFBQWEsS0FBSyxhQUFhLEdBQUc7QUFDdkQsWUFBTSxJQUFJLG1CQUFtQiw4QkFBOEI7QUFBQSxJQUM1RDtBQUNBLFdBQU8sS0FBSyxRQUFRLGdDQUFnQyxVQUFVO0FBQUEsRUFDL0Q7QUFBQSxFQUVPLCtCQUErQixZQUE0QjtBQUNqRSxTQUFLLG1CQUFtQjtBQUN4QixRQUFJLGFBQWEsS0FBSyxhQUFhLEtBQUssYUFBYSxHQUFHO0FBQ3ZELFlBQU0sSUFBSSxtQkFBbUIsOEJBQThCO0FBQUEsSUFDNUQ7QUFDQSxXQUFPLEtBQUssUUFBUSwrQkFBK0IsVUFBVTtBQUFBLEVBQzlEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1PLG1DQUFtQyxPQUFzQjtBQUMvRCxVQUFNLGFBQWEsS0FBSyxRQUFRLGFBQWE7QUFFN0MsVUFBTSx5QkFBeUIsTUFBTTtBQUNyQyxVQUFNLHFCQUFxQixNQUFNO0FBQ2pDLFFBQUksa0JBQWtCLEtBQUssTUFBTyxPQUFPLDJCQUEyQixZQUFZLENBQUMsTUFBTSxzQkFBc0IsSUFBSyx5QkFBeUIsQ0FBQztBQUM1SSxRQUFJLGNBQWMsS0FBSyxNQUFPLE9BQU8sdUJBQXVCLFlBQVksQ0FBQyxNQUFNLGtCQUFrQixJQUFLLHFCQUFxQixDQUFDO0FBRTVILFFBQUksa0JBQWtCLEdBQUc7QUFDeEIsd0JBQWtCO0FBQ2xCLG9CQUFjO0FBQUEsSUFDZixXQUFXLGtCQUFrQixZQUFZO0FBQ3hDLHdCQUFrQjtBQUNsQixvQkFBYyxLQUFLLGlCQUFpQixlQUFlO0FBQUEsSUFDcEQsT0FBTztBQUNOLFVBQUksZUFBZSxHQUFHO0FBQ3JCLHNCQUFjO0FBQUEsTUFDZixPQUFPO0FBQ04sY0FBTSxZQUFZLEtBQUssaUJBQWlCLGVBQWU7QUFDdkQsWUFBSSxlQUFlLFdBQVc7QUFDN0Isd0JBQWM7QUFBQSxRQUNmO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLHVCQUF1QixNQUFNO0FBQ25DLFVBQU0sbUJBQW1CLE1BQU07QUFDL0IsUUFBSSxnQkFBZ0IsS0FBSyxNQUFPLE9BQU8seUJBQXlCLFlBQVksQ0FBQyxNQUFNLG9CQUFvQixJQUFLLHVCQUF1QixDQUFDO0FBQ3BJLFFBQUksWUFBWSxLQUFLLE1BQU8sT0FBTyxxQkFBcUIsWUFBWSxDQUFDLE1BQU0sZ0JBQWdCLElBQUssbUJBQW1CLENBQUM7QUFFcEgsUUFBSSxnQkFBZ0IsR0FBRztBQUN0QixzQkFBZ0I7QUFDaEIsa0JBQVk7QUFBQSxJQUNiLFdBQVcsZ0JBQWdCLFlBQVk7QUFDdEMsc0JBQWdCO0FBQ2hCLGtCQUFZLEtBQUssaUJBQWlCLGFBQWE7QUFBQSxJQUNoRCxPQUFPO0FBQ04sVUFBSSxhQUFhLEdBQUc7QUFDbkIsb0JBQVk7QUFBQSxNQUNiLE9BQU87QUFDTixjQUFNLFlBQVksS0FBSyxpQkFBaUIsYUFBYTtBQUNyRCxZQUFJLGFBQWEsV0FBVztBQUMzQixzQkFBWTtBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQ0MsMkJBQTJCLG1CQUN4Qix1QkFBdUIsZUFDdkIseUJBQXlCLGlCQUN6QixxQkFBcUIsYUFDckIsaUJBQWlCLFNBQ2pCLEVBQUUsaUJBQWlCLFlBQ3JCO0FBQ0QsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLElBQUksTUFBTSxpQkFBaUIsYUFBYSxlQUFlLFNBQVM7QUFBQSxFQUN4RTtBQUFBLEVBRVEsaUJBQWlCLFlBQW9CLFFBQWdCLGdCQUFxRDtBQUNqSCxRQUFJLE9BQU8sZUFBZSxZQUFZLE9BQU8sV0FBVyxVQUFVO0FBQ2pFLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxNQUFNLFVBQVUsS0FBSyxNQUFNLE1BQU0sR0FBRztBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksYUFBYSxLQUFLLFNBQVMsR0FBRztBQUNqQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssYUFBYSxPQUFPLGVBQWUsU0FBUyxPQUFPLFFBQVE7QUFDL0QsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFlBQVksS0FBSyxRQUFRLGFBQWE7QUFDNUMsUUFBSSxhQUFhLFdBQVc7QUFDM0IsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFdBQVcsR0FBRztBQUNqQixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sWUFBWSxLQUFLLGlCQUFpQixVQUFVO0FBQ2xELFFBQUksU0FBUyxXQUFXO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxtQkFBbUIsd0JBQTJDO0FBRWpFLFlBQU0saUJBQWlCLEtBQUssUUFBUSxnQkFBZ0IsWUFBWSxTQUFTLENBQUM7QUFDMUUsVUFBSSxRQUFRLGdCQUFnQixjQUFjLEdBQUc7QUFDNUMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGtCQUFrQixhQUFxQixTQUFpQixnQkFBc0Q7QUFDckgsVUFBTSxhQUFhLEtBQUssTUFBTyxPQUFPLGdCQUFnQixZQUFZLENBQUMsTUFBTSxXQUFXLElBQUssY0FBYyxDQUFDO0FBQ3hHLFVBQU0sU0FBUyxLQUFLLE1BQU8sT0FBTyxZQUFZLFlBQVksQ0FBQyxNQUFNLE9BQU8sSUFBSyxVQUFVLENBQUM7QUFDeEYsVUFBTSxZQUFZLEtBQUssUUFBUSxhQUFhO0FBRTVDLFFBQUksYUFBYSxHQUFHO0FBQ25CLGFBQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBRUEsUUFBSSxhQUFhLFdBQVc7QUFDM0IsYUFBTyxJQUFJLFNBQVMsV0FBVyxLQUFLLGlCQUFpQixTQUFTLENBQUM7QUFBQSxJQUNoRTtBQUVBLFFBQUksVUFBVSxHQUFHO0FBQ2hCLGFBQU8sSUFBSSxTQUFTLFlBQVksQ0FBQztBQUFBLElBQ2xDO0FBRUEsVUFBTSxZQUFZLEtBQUssaUJBQWlCLFVBQVU7QUFDbEQsUUFBSSxVQUFVLFdBQVc7QUFDeEIsYUFBTyxJQUFJLFNBQVMsWUFBWSxTQUFTO0FBQUEsSUFDMUM7QUFFQSxRQUFJLG1CQUFtQix3QkFBMkM7QUFJakUsWUFBTSxpQkFBaUIsS0FBSyxRQUFRLGdCQUFnQixZQUFZLFNBQVMsQ0FBQztBQUMxRSxVQUFJLFFBQVEsZ0JBQWdCLGNBQWMsR0FBRztBQUM1QyxlQUFPLElBQUksU0FBUyxZQUFZLFNBQVMsQ0FBQztBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUVBLFdBQU8sSUFBSSxTQUFTLFlBQVksTUFBTTtBQUFBLEVBQ3ZDO0FBQUEsRUFFTyxpQkFBaUIsVUFBK0I7QUFDdEQsVUFBTSxpQkFBaUI7QUFDdkIsU0FBSyxtQkFBbUI7QUFHeEIsUUFBSSxvQkFBb0IsVUFBVTtBQUNqQyxVQUFJLEtBQUssaUJBQWlCLFNBQVMsWUFBWSxTQUFTLFFBQVEsY0FBYyxHQUFHO0FBQ2hGLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSyxrQkFBa0IsU0FBUyxZQUFZLFNBQVMsUUFBUSxjQUFjO0FBQUEsRUFDbkY7QUFBQSxFQUVPLGFBQWEsT0FBdUI7QUFDMUMsV0FBTyxLQUFLLGNBQWMsT0FBTyxzQkFBeUM7QUFBQSxFQUMzRTtBQUFBLEVBRVEsY0FBYyxPQUFjLGdCQUFxRDtBQUN4RixVQUFNLGtCQUFrQixNQUFNO0FBQzlCLFVBQU0sY0FBYyxNQUFNO0FBQzFCLFVBQU0sZ0JBQWdCLE1BQU07QUFDNUIsVUFBTSxZQUFZLE1BQU07QUFFeEIsUUFBSSxDQUFDLEtBQUssaUJBQWlCLGlCQUFpQixhQUFhLGVBQWtDLEdBQUc7QUFDN0YsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLENBQUMsS0FBSyxpQkFBaUIsZUFBZSxXQUFXLGVBQWtDLEdBQUc7QUFDekYsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLG1CQUFtQix3QkFBMkM7QUFDakUsWUFBTSxzQkFBdUIsY0FBYyxJQUFJLEtBQUssUUFBUSxnQkFBZ0IsaUJBQWlCLGNBQWMsQ0FBQyxJQUFJO0FBQ2hILFlBQU0sb0JBQXFCLFlBQVksS0FBSyxhQUFhLEtBQUssUUFBUSxjQUFjLGFBQWEsSUFBSSxLQUFLLFFBQVEsZ0JBQWdCLGVBQWUsWUFBWSxDQUFDLElBQUk7QUFFbEssWUFBTSwyQkFBMkIsUUFBUSxnQkFBZ0IsbUJBQW1CO0FBQzVFLFlBQU0seUJBQXlCLFFBQVEsZ0JBQWdCLGlCQUFpQjtBQUV4RSxVQUFJLENBQUMsNEJBQTRCLENBQUMsd0JBQXdCO0FBQ3pELGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sY0FBYyxRQUF1QjtBQUMzQyxVQUFNLGlCQUFpQjtBQUN2QixTQUFLLG1CQUFtQjtBQUd4QixRQUFLLGtCQUFrQixTQUFVLEVBQUUsa0JBQWtCLFlBQVk7QUFDaEUsVUFBSSxLQUFLLGNBQWMsUUFBUSxjQUFjLEdBQUc7QUFDL0MsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssa0JBQWtCLE9BQU8saUJBQWlCLE9BQU8sYUFBYSxlQUFrQztBQUNuSCxVQUFNLE1BQU0sS0FBSyxrQkFBa0IsT0FBTyxlQUFlLE9BQU8sV0FBVyxlQUFrQztBQUU3RyxVQUFNLGtCQUFrQixNQUFNO0FBQzlCLFVBQU0sY0FBYyxNQUFNO0FBQzFCLFVBQU0sZ0JBQWdCLElBQUk7QUFDMUIsVUFBTSxZQUFZLElBQUk7QUFFdEIsUUFBSSxtQkFBbUIsd0JBQTJDO0FBQ2pFLFlBQU0sc0JBQXVCLGNBQWMsSUFBSSxLQUFLLFFBQVEsZ0JBQWdCLGlCQUFpQixjQUFjLENBQUMsSUFBSTtBQUNoSCxZQUFNLG9CQUFxQixZQUFZLEtBQUssYUFBYSxLQUFLLFFBQVEsY0FBYyxhQUFhLElBQUksS0FBSyxRQUFRLGdCQUFnQixlQUFlLFlBQVksQ0FBQyxJQUFJO0FBRWxLLFlBQU0sMkJBQTJCLFFBQVEsZ0JBQWdCLG1CQUFtQjtBQUM1RSxZQUFNLHlCQUF5QixRQUFRLGdCQUFnQixpQkFBaUI7QUFFeEUsVUFBSSxDQUFDLDRCQUE0QixDQUFDLHdCQUF3QjtBQUN6RCxlQUFPLElBQUksTUFBTSxpQkFBaUIsYUFBYSxlQUFlLFNBQVM7QUFBQSxNQUN4RTtBQUVBLFVBQUksb0JBQW9CLGlCQUFpQixnQkFBZ0IsV0FBVztBQUVuRSxlQUFPLElBQUksTUFBTSxpQkFBaUIsY0FBYyxHQUFHLGVBQWUsWUFBWSxDQUFDO0FBQUEsTUFDaEY7QUFFQSxVQUFJLDRCQUE0Qix3QkFBd0I7QUFFdkQsZUFBTyxJQUFJLE1BQU0saUJBQWlCLGNBQWMsR0FBRyxlQUFlLFlBQVksQ0FBQztBQUFBLE1BQ2hGO0FBRUEsVUFBSSwwQkFBMEI7QUFFN0IsZUFBTyxJQUFJLE1BQU0saUJBQWlCLGNBQWMsR0FBRyxlQUFlLFNBQVM7QUFBQSxNQUM1RTtBQUdBLGFBQU8sSUFBSSxNQUFNLGlCQUFpQixhQUFhLGVBQWUsWUFBWSxDQUFDO0FBQUEsSUFDNUU7QUFFQSxXQUFPLElBQUksTUFBTSxpQkFBaUIsYUFBYSxlQUFlLFNBQVM7QUFBQSxFQUN4RTtBQUFBLEVBRU8sZUFBZSxhQUF3QixRQUEwQjtBQUN2RSxTQUFLLG1CQUFtQjtBQUN4QixVQUFNLFlBQVksS0FBSyxZQUFZLFdBQVcsSUFBSTtBQUNsRCxXQUFPLEtBQUssY0FBYyxLQUFLLElBQUksS0FBSyxRQUFRLFVBQVUsR0FBRyxLQUFLLElBQUksR0FBRyxTQUFTLENBQUMsQ0FBQztBQUFBLEVBQ3JGO0FBQUEsRUFFTyxvQkFBMkI7QUFDakMsU0FBSyxtQkFBbUI7QUFDeEIsVUFBTSxZQUFZLEtBQUssYUFBYTtBQUNwQyxXQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsV0FBVyxLQUFLLGlCQUFpQixTQUFTLENBQUM7QUFBQSxFQUNuRTtBQUFBLEVBRVEsc0JBQXNCLGFBQW9CLFlBQThCLGdCQUF5QixrQkFBNkM7QUFDckosV0FBTyxLQUFLLFFBQVEsc0JBQXNCLGFBQWEsWUFBWSxnQkFBZ0IsZ0JBQWdCO0FBQUEsRUFDcEc7QUFBQSxFQUVPLFlBQVksY0FBc0IsZ0JBQW9ELFNBQWtCLFdBQW9CLGdCQUErQixnQkFBeUIsbUJBQTJCLGtCQUFxQztBQUMxUCxTQUFLLG1CQUFtQjtBQUV4QixRQUFJLGVBQStCO0FBRW5DLFFBQUksbUJBQW1CLFFBQVEsT0FBTyxtQkFBbUIsV0FBVztBQUNuRSxVQUFJLENBQUMsTUFBTSxRQUFRLGNBQWMsR0FBRztBQUNuQyx5QkFBaUIsQ0FBQyxjQUFjO0FBQUEsTUFDakM7QUFFQSxVQUFJLGVBQWUsTUFBTSxDQUFDLGdCQUF3QixNQUFNLFNBQVMsV0FBVyxDQUFDLEdBQUc7QUFDL0UsdUJBQWUsZUFBZSxJQUFJLENBQUMsZ0JBQXdCLEtBQUssY0FBYyxXQUFXLENBQUM7QUFBQSxNQUMzRjtBQUFBLElBQ0Q7QUFFQSxRQUFJLGlCQUFpQixNQUFNO0FBQzFCLHFCQUFlLENBQUMsS0FBSyxrQkFBa0IsQ0FBQztBQUFBLElBQ3pDO0FBRUEsbUJBQWUsYUFBYSxLQUFLLENBQUMsSUFBSSxPQUFPLEdBQUcsa0JBQWtCLEdBQUcsbUJBQW1CLEdBQUcsY0FBYyxHQUFHLFdBQVc7QUFFdkgsVUFBTSxxQkFBOEIsQ0FBQztBQUNyQyx1QkFBbUIsS0FBSyxhQUFhLE9BQU8sQ0FBQyxNQUFNLFNBQVM7QUFDM0QsVUFBSSxNQUFNLGdCQUFnQixNQUFNLElBQUksR0FBRztBQUN0QyxlQUFPLEtBQUssVUFBVSxJQUFJO0FBQUEsTUFDM0I7QUFFQSx5QkFBbUIsS0FBSyxJQUFJO0FBQzVCLGFBQU87QUFBQSxJQUNSLENBQUMsQ0FBQztBQUVGLFFBQUk7QUFDSixRQUFJLENBQUMsV0FBVyxhQUFhLFFBQVEsSUFBSSxJQUFJLEdBQUc7QUFFL0MsWUFBTSxlQUFlLElBQUksYUFBYSxjQUFjLFNBQVMsV0FBVyxjQUFjO0FBQ3RGLFlBQU0sYUFBYSxhQUFhLG1CQUFtQjtBQUVuRCxVQUFJLENBQUMsWUFBWTtBQUNoQixlQUFPLENBQUM7QUFBQSxNQUNUO0FBRUEsb0JBQWMsQ0FBQyxnQkFBdUIsS0FBSyxzQkFBc0IsYUFBYSxZQUFZLGdCQUFnQixnQkFBZ0I7QUFBQSxJQUMzSCxPQUFPO0FBQ04sb0JBQWMsQ0FBQyxnQkFBdUIsZ0JBQWdCLFlBQVksTUFBTSxJQUFJLGFBQWEsY0FBYyxTQUFTLFdBQVcsY0FBYyxHQUFHLGFBQWEsZ0JBQWdCLGdCQUFnQjtBQUFBLElBQzFMO0FBRUEsV0FBTyxtQkFBbUIsSUFBSSxXQUFXLEVBQUUsT0FBTyxDQUFDLEtBQUssWUFBK0IsSUFBSSxPQUFPLE9BQU8sR0FBRyxDQUFDLENBQUM7QUFBQSxFQUMvRztBQUFBLEVBRU8sY0FBYyxjQUFzQixnQkFBMkIsU0FBa0IsV0FBb0IsZ0JBQXdCLGdCQUFpRDtBQUNwTCxTQUFLLG1CQUFtQjtBQUN4QixVQUFNLGNBQWMsS0FBSyxpQkFBaUIsY0FBYztBQUV4RCxRQUFJLENBQUMsV0FBVyxhQUFhLFFBQVEsSUFBSSxJQUFJLEdBQUc7QUFDL0MsWUFBTSxlQUFlLElBQUksYUFBYSxjQUFjLFNBQVMsV0FBVyxjQUFjO0FBQ3RGLFlBQU0sYUFBYSxhQUFhLG1CQUFtQjtBQUNuRCxVQUFJLENBQUMsWUFBWTtBQUNoQixlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sWUFBWSxLQUFLLGFBQWE7QUFDcEMsVUFBSSxjQUFjLElBQUksTUFBTSxZQUFZLFlBQVksWUFBWSxRQUFRLFdBQVcsS0FBSyxpQkFBaUIsU0FBUyxDQUFDO0FBQ25ILFVBQUksTUFBTSxLQUFLLHNCQUFzQixhQUFhLFlBQVksZ0JBQWdCLENBQUM7QUFDL0Usc0JBQWdCLGNBQWMsTUFBTSxJQUFJLGFBQWEsY0FBYyxTQUFTLFdBQVcsY0FBYyxHQUFHLGFBQWEsY0FBYztBQUNuSSxVQUFJLElBQUksU0FBUyxHQUFHO0FBQ25CLGVBQU8sSUFBSSxDQUFDO0FBQUEsTUFDYjtBQUVBLG9CQUFjLElBQUksTUFBTSxHQUFHLEdBQUcsWUFBWSxZQUFZLEtBQUssaUJBQWlCLFlBQVksVUFBVSxDQUFDO0FBQ25HLFlBQU0sS0FBSyxzQkFBc0IsYUFBYSxZQUFZLGdCQUFnQixDQUFDO0FBRTNFLFVBQUksSUFBSSxTQUFTLEdBQUc7QUFDbkIsZUFBTyxJQUFJLENBQUM7QUFBQSxNQUNiO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLGdCQUFnQixjQUFjLE1BQU0sSUFBSSxhQUFhLGNBQWMsU0FBUyxXQUFXLGNBQWMsR0FBRyxhQUFhLGNBQWM7QUFBQSxFQUMzSTtBQUFBLEVBRU8sa0JBQWtCLGNBQXNCLGdCQUEyQixTQUFrQixXQUFvQixnQkFBd0IsZ0JBQWlEO0FBQ3hMLFNBQUssbUJBQW1CO0FBQ3hCLFVBQU0sY0FBYyxLQUFLLGlCQUFpQixjQUFjO0FBQ3hELFdBQU8sZ0JBQWdCLGtCQUFrQixNQUFNLElBQUksYUFBYSxjQUFjLFNBQVMsV0FBVyxjQUFjLEdBQUcsYUFBYSxjQUFjO0FBQUEsRUFDL0k7QUFBQTtBQUFBO0FBQUEsRUFNTyxtQkFBeUI7QUFDL0IsU0FBSyxnQkFBZ0IsaUJBQWlCO0FBQUEsRUFDdkM7QUFBQSxFQUVPLGtCQUF3QjtBQUM5QixTQUFLLGdCQUFnQixnQkFBZ0I7QUFBQSxFQUN0QztBQUFBLEVBRU8sUUFBUSxLQUFvQztBQUNsRCxVQUFNLGFBQWMsS0FBSyxPQUFPLE1BQU0sT0FBTyxNQUFNLGtCQUFrQixLQUFLLE1BQU0sa0JBQWtCO0FBQ2xHLFFBQUksZUFBZSxLQUFLO0FBQ3ZCO0FBQUEsSUFDRDtBQUNBLFFBQUk7QUFDSCxXQUFLLHdCQUF3QixrQkFBa0I7QUFDL0MsV0FBSyxjQUFjLGtCQUFrQjtBQUNyQyxVQUFJLEtBQUssNkJBQTZCLE1BQU07QUFDM0MsYUFBSywyQkFBMkIsS0FBSyxpQkFBaUIsZUFBZSxLQUFLLEdBQUc7QUFBQSxNQUM5RTtBQUNBLFdBQUssZ0JBQWdCLFFBQVEsR0FBRztBQUFBLElBQ2pDLFVBQUU7QUFDRCxXQUFLLGNBQWMsZ0JBQWdCO0FBQ25DLFdBQUssd0JBQXdCLGdCQUFnQjtBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUJBQXVCLGNBQXVGO0FBQ3JILFFBQUksd0JBQXdCLE1BQU0sNkJBQTZCO0FBQzlELGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxpQkFBaUIsS0FBSyxjQUFjLGFBQWEsS0FBSztBQUs1RCxRQUFJLFNBQVMsYUFBYTtBQUMxQixRQUFJLFFBQVE7QUFDWCxZQUFNLGlCQUNMLE9BQU8sU0FBUyxLQUFLLE9BQU8sV0FBVyxPQUFPLFNBQVMsQ0FBQyxNQUFNLFNBQVM7QUFFeEUsWUFBTSxtQkFDTCxLQUFLLE9BQU8sTUFBTSxVQUFVLGtCQUFrQixlQUFlLGNBQWMsS0FBSyxpQkFBaUIsZUFBZSxhQUFhO0FBRTlILFVBQUksa0JBQWtCO0FBQ3JCLGlCQUFTLE9BQU8sVUFBVSxHQUFHLE9BQU8sU0FBUyxDQUFDO0FBQUEsTUFDL0M7QUFBQSxJQUNEO0FBRUEsV0FBTyxJQUFJLE1BQU07QUFBQSxNQUNoQixhQUFhLGNBQWM7QUFBQSxNQUMzQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLGFBQWEsb0JBQW9CO0FBQUEsTUFDakMsYUFBYSx3QkFBd0I7QUFBQSxNQUNyQyxhQUFhLGNBQWM7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHdCQUF3QixlQUFxRztBQUNwSSxVQUFNLFNBQThDLENBQUM7QUFDckQsYUFBUyxJQUFJLEdBQUcsTUFBTSxjQUFjLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDekQsYUFBTyxDQUFDLElBQUksS0FBSyx1QkFBdUIsY0FBYyxDQUFDLENBQUM7QUFBQSxJQUN6RDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxLQUFLLE1BQWdCLFNBQWtEO0FBQzdFLFNBQUssbUJBQW1CLE1BQU0sS0FBSyxhQUFhLElBQUksUUFBTSxFQUFFLE9BQU8sRUFBRSxPQUFPLE1BQU0sRUFBRSxLQUFLLEVBQUUsR0FBRyxJQUFJO0FBQUEsRUFDbkc7QUFBQSxFQUVPLG1CQUFtQixtQkFBdUMsZ0JBQXdELHFCQUF3RCxPQUF1QixRQUFrRDtBQUN6UCxRQUFJO0FBQ0gsV0FBSyx3QkFBd0Isa0JBQWtCO0FBQy9DLFdBQUssY0FBYyxrQkFBa0I7QUFDckMsYUFBTyxLQUFLLG9CQUFvQixtQkFBbUIsS0FBSyx3QkFBd0IsY0FBYyxHQUFHLHFCQUFxQixPQUFPLE1BQU07QUFBQSxJQUNwSSxVQUFFO0FBQ0QsV0FBSyxjQUFjLGdCQUFnQjtBQUNuQyxXQUFLLHdCQUF3QixnQkFBZ0I7QUFBQSxJQUM5QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUFvQixtQkFBdUMsZ0JBQXFELHFCQUF3RCxPQUF1QixRQUFrRDtBQUN4UCxRQUFJLEtBQUssU0FBUyxzQkFBc0IsS0FBSywwQkFBMEI7QUFJdEUsWUFBTSxnQkFBZ0IsZUFBZSxJQUFJLENBQUMsT0FBTztBQUNoRCxlQUFPO0FBQUEsVUFDTixPQUFPLEtBQUssY0FBYyxHQUFHLEtBQUs7QUFBQSxVQUNsQyxNQUFNLEdBQUc7QUFBQSxRQUNWO0FBQUEsTUFDRCxDQUFDO0FBSUQsVUFBSSxzQkFBc0I7QUFDMUIsVUFBSSxtQkFBbUI7QUFDdEIsaUJBQVMsSUFBSSxHQUFHLE1BQU0sa0JBQWtCLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDN0QsZ0JBQU0sTUFBTSxrQkFBa0IsQ0FBQztBQUMvQixjQUFJLG1CQUFtQjtBQUN2QixtQkFBUyxJQUFJLEdBQUcsT0FBTyxjQUFjLFFBQVEsSUFBSSxNQUFNLEtBQUs7QUFDM0Qsa0JBQU0sWUFBWSxjQUFjLENBQUMsRUFBRTtBQUNuQyxrQkFBTSxhQUFhLFVBQVUsa0JBQWtCLElBQUk7QUFDbkQsa0JBQU0sYUFBYSxJQUFJLGtCQUFrQixVQUFVO0FBQ25ELGdCQUFJLENBQUMsY0FBYyxDQUFDLFlBQVk7QUFDL0IsaUNBQW1CO0FBQ25CO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFDQSxjQUFJLENBQUMsa0JBQWtCO0FBQ3RCLGtDQUFzQjtBQUN0QjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFVBQUkscUJBQXFCO0FBQ3hCLGlCQUFTLElBQUksR0FBRyxNQUFNLEtBQUsseUJBQXlCLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDekUsZ0JBQU0saUJBQWlCLEtBQUsseUJBQXlCLENBQUM7QUFDdEQsZ0JBQU0sZ0JBQWdCLEtBQUssaUJBQWlCLGNBQWM7QUFFMUQsY0FBSSxnQkFBZ0I7QUFDcEIsbUJBQVMsSUFBSSxHQUFHLE9BQU8sY0FBYyxRQUFRLElBQUksTUFBTSxLQUFLO0FBQzNELGtCQUFNLFlBQVksY0FBYyxDQUFDLEVBQUU7QUFDbkMsa0JBQU0sV0FBVyxjQUFjLENBQUMsRUFBRTtBQUVsQyxnQkFBSSxpQkFBaUIsVUFBVSxtQkFBbUIsaUJBQWlCLFVBQVUsZUFBZTtBQUUzRjtBQUFBLFlBQ0Q7QUFLQSxnQkFDQyxtQkFBbUIsVUFBVSxtQkFBbUIsVUFBVSxnQkFBZ0IsaUJBQ3ZFLFVBQVUsUUFBUSxLQUFLLFlBQVksU0FBUyxTQUFTLEtBQUssU0FBUyxPQUFPLENBQUMsTUFBTSxNQUNuRjtBQUVEO0FBQUEsWUFDRDtBQUVBLGdCQUNDLG1CQUFtQixVQUFVLG1CQUFtQixVQUFVLGdCQUFnQixLQUN2RSxVQUFVLFFBQVEsS0FBSyxZQUFZLFNBQVMsU0FBUyxLQUFLLFNBQVMsT0FBTyxTQUFTLFNBQVMsQ0FBQyxNQUFNLE1BQ3JHO0FBRUQ7QUFBQSxZQUNEO0FBR0EsNEJBQWdCO0FBQ2hCO0FBQUEsVUFDRDtBQUVBLGNBQUksZUFBZTtBQUNsQixrQkFBTSxZQUFZLElBQUksTUFBTSxnQkFBZ0IsR0FBRyxnQkFBZ0IsYUFBYTtBQUM1RSwyQkFBZSxLQUFLLElBQUksTUFBTSw0QkFBNEIsTUFBTSxXQUFXLE1BQU0sT0FBTyxPQUFPLEtBQUssQ0FBQztBQUFBLFVBQ3RHO0FBQUEsUUFFRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLDJCQUEyQjtBQUFBLElBQ2pDO0FBQ0EsUUFBSSxLQUFLLDZCQUE2QixNQUFNO0FBQzNDLFdBQUssMkJBQTJCLEtBQUssaUJBQWlCLGVBQWUsS0FBSyxHQUFHO0FBQUEsSUFDOUU7QUFDQSxXQUFPLEtBQUssZ0JBQWdCLGtCQUFrQixtQkFBbUIsZ0JBQWdCLHFCQUFxQixPQUFPLE1BQU07QUFBQSxFQUNwSDtBQUFBLEVBRUEsV0FBVyxTQUF1QixLQUE4QiwrQkFBdUMsb0JBQThDO0FBQ3BKLFVBQU0sUUFBUSxRQUFRLElBQTBCLENBQUMsV0FBVztBQUMzRCxZQUFNLGFBQWEsS0FBSyxjQUFjLE9BQU8sV0FBVztBQUN4RCxZQUFNLFdBQVcsS0FBSyxjQUFjLE9BQU8sTUFBTTtBQUNqRCxhQUFPO0FBQUEsUUFDTixPQUFPLElBQUksTUFBTSxXQUFXLFlBQVksV0FBVyxRQUFRLFNBQVMsWUFBWSxTQUFTLE1BQU07QUFBQSxRQUMvRixNQUFNLE9BQU87QUFBQSxNQUNkO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxvQkFBb0IsT0FBTyxLQUFLLE1BQU0sT0FBTywrQkFBK0Isa0JBQWtCO0FBQUEsRUFDcEc7QUFBQSxFQUVBLFdBQVcsU0FBdUIsS0FBOEIsK0JBQXVDLG9CQUE4QztBQUNwSixVQUFNLFFBQVEsUUFBUSxJQUEwQixDQUFDLFdBQVc7QUFDM0QsWUFBTSxhQUFhLEtBQUssY0FBYyxPQUFPLFdBQVc7QUFDeEQsWUFBTSxXQUFXLEtBQUssY0FBYyxPQUFPLE1BQU07QUFDakQsYUFBTztBQUFBLFFBQ04sT0FBTyxJQUFJLE1BQU0sV0FBVyxZQUFZLFdBQVcsUUFBUSxTQUFTLFlBQVksU0FBUyxNQUFNO0FBQUEsUUFDL0YsTUFBTSxPQUFPO0FBQUEsTUFDZDtBQUFBLElBQ0QsQ0FBQztBQUNELFNBQUssb0JBQW9CLE9BQU8sS0FBSyxPQUFPLE1BQU0sK0JBQStCLGtCQUFrQjtBQUFBLEVBQ3BHO0FBQUEsRUFFUSxvQkFBb0IsT0FBK0IsS0FBOEIsV0FBb0IsV0FBb0IsK0JBQXVDLG9CQUE4QztBQUNyTixRQUFJO0FBQ0gsV0FBSyx3QkFBd0Isa0JBQWtCO0FBQy9DLFdBQUssY0FBYyxrQkFBa0I7QUFDckMsV0FBSyxhQUFhO0FBQ2xCLFdBQUssYUFBYTtBQUNsQixZQUFNLGFBQWEsS0FBSyx3QkFBd0IsS0FBSztBQUNyRCxXQUFLLGNBQWMsWUFBWSxPQUFPLFlBQVksV0FBVyxHQUFHLGtCQUFrQjtBQUNsRixXQUFLLE9BQU8sR0FBRztBQUNmLFdBQUssK0JBQStCLDZCQUE2QjtBQUFBLElBQ2xFLFVBQUU7QUFDRCxXQUFLLGFBQWE7QUFDbEIsV0FBSyxhQUFhO0FBQ2xCLFdBQUssY0FBYyxnQkFBZ0Isa0JBQWtCO0FBQ3JELFdBQUssd0JBQXdCLGdCQUFnQjtBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBLEVBU08sV0FBVyxlQUFnRSxrQkFBNEIsUUFBa0U7QUFDL0ssUUFBSTtBQUNILFdBQUssd0JBQXdCLGtCQUFrQjtBQUMvQyxXQUFLLGNBQWMsa0JBQWtCO0FBQ3JDLFlBQU0sYUFBYSxLQUFLLHdCQUF3QixhQUFhO0FBRTdELGFBQU8sS0FBSyxjQUFjLFlBQVksb0JBQW9CLE9BQU8sVUFBVSxZQUFZLFdBQVcsQ0FBQztBQUFBLElBQ3BHLFVBQUU7QUFDRCxXQUFLLGNBQWMsZ0JBQWdCO0FBQ25DLFdBQUssd0JBQXdCLGdCQUFnQjtBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBLEVBRVEsY0FBYyxlQUFvRCxrQkFBMkIsUUFBNkIscUJBQXlDLE1BQTBDO0FBRXBOLFVBQU0sZUFBZSxLQUFLLFFBQVEsYUFBYTtBQUMvQyxVQUFNLFNBQVMsS0FBSyxRQUFRLFdBQVcsZUFBZSxLQUFLLFNBQVMsb0JBQW9CLGdCQUFnQjtBQUN4RyxVQUFNLGVBQWUsS0FBSyxRQUFRLGFBQWE7QUFFL0MsVUFBTSxpQkFBaUIsT0FBTztBQUM5QixTQUFLLDJCQUEyQixPQUFPO0FBRXZDLFFBQUksZUFBZSxXQUFXLEdBQUc7QUFLaEMsZUFBUyxJQUFJLEdBQUcsTUFBTSxlQUFlLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDMUQsY0FBTSxTQUFTLGVBQWUsQ0FBQztBQUMvQixhQUFLLGlCQUFpQixjQUFjLE9BQU8sYUFBYSxPQUFPLGFBQWEsT0FBTyxLQUFLLFFBQVEsT0FBTyxnQkFBZ0I7QUFBQSxNQUN4SDtBQUVBLFlBQU0sb0JBQXNDLENBQUM7QUFFN0MsV0FBSyxtQkFBbUI7QUFFeEIsVUFBSSxZQUFZO0FBQ2hCLGVBQVMsSUFBSSxHQUFHLE1BQU0sZUFBZSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQzFELGNBQU0sU0FBUyxlQUFlLENBQUM7QUFDL0IsY0FBTSxDQUFDLFFBQVEsSUFBSSxTQUFTLE9BQU8sSUFBSTtBQUN2QyxhQUFLLHdCQUF3QixLQUFLO0FBRWxDLGNBQU0sa0JBQWtCLE9BQU8sTUFBTTtBQUNyQyxjQUFNLGdCQUFnQixPQUFPLE1BQU07QUFFbkMsY0FBTSxtQkFBbUIsZ0JBQWdCO0FBQ3pDLGNBQU0sb0JBQW9CO0FBQzFCLGNBQU0sa0JBQWtCLEtBQUssSUFBSSxrQkFBa0IsaUJBQWlCO0FBRXBFLGNBQU0sdUJBQXdCLG9CQUFvQjtBQUVsRCxjQUFNLDZCQUE2QixlQUFlLFlBQVksdUJBQXVCO0FBRXJGLGlCQUFTLElBQUksaUJBQWlCLEtBQUssR0FBRyxLQUFLO0FBQzFDLGdCQUFNLGlCQUFpQixrQkFBa0I7QUFDekMsZ0JBQU0sd0JBQXdCLDZCQUE2QjtBQUUzRCw0QkFBa0I7QUFBQSxZQUNqQixJQUFJO0FBQUEsY0FDSDtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsVUFBQztBQUFBLFFBQ0g7QUFFQSxZQUFJLGtCQUFrQixrQkFBa0I7QUFFdkMsZ0JBQU0sd0JBQXdCLGtCQUFrQjtBQUNoRCxnQkFBTSxNQUFNLG9CQUFvQjtBQUNoQyxnQkFBTSw0QkFBNEIsZUFBZSxZQUFZLE1BQU07QUFDbkUsNEJBQWtCLEtBQUssSUFBSSxxQkFBcUIsd0JBQXdCLEdBQUcsZUFBZSx5QkFBeUIsQ0FBQztBQUFBLFFBQ3JIO0FBRUEsWUFBSSxrQkFBa0IsbUJBQW1CO0FBRXhDLGdCQUFNLG1CQUFtQixrQkFBa0I7QUFDM0MsZ0JBQU0sTUFBTSxvQkFBb0I7QUFDaEMsZ0JBQU0saUJBQWlCLGVBQWUsWUFBWSxNQUFNLG1CQUFtQjtBQUMzRSw0QkFBa0I7QUFBQSxZQUNqQixJQUFJO0FBQUEsY0FDSCxtQkFBbUI7QUFBQSxjQUNuQjtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxxQkFBYTtBQUFBLE1BQ2Q7QUFFQSxXQUFLO0FBQUEsUUFDSixJQUFJO0FBQUEsVUFDSDtBQUFBLFVBQ0EsS0FBSyxhQUFhO0FBQUEsVUFDbEIsS0FBSztBQUFBLFVBQ0wsS0FBSztBQUFBLFFBQ047QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxLQUFLLEtBQUssUUFBUSxPQUFPO0FBQUEsVUFDekIsYUFBYTtBQUFBLFVBQ2IsV0FBVyxLQUFLLGFBQWE7QUFBQSxVQUM3QixXQUFXLEtBQUs7QUFBQSxVQUNoQixXQUFXLEtBQUs7QUFBQSxVQUNoQixTQUFTO0FBQUEsVUFDVCxpQkFBaUIsQ0FBQyxNQUFNO0FBQUEsVUFDeEIsOEJBQThCLENBQUMsZUFBZSxNQUFNO0FBQUEsUUFDckQ7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFRLE9BQU8saUJBQWlCLE9BQU8sU0FBWSxPQUFPO0FBQUEsRUFDM0Q7QUFBQSxFQUVPLE9BQTZCO0FBQ25DLFdBQU8sS0FBSyxpQkFBaUIsS0FBSyxLQUFLLEdBQUc7QUFBQSxFQUMzQztBQUFBLEVBRU8sVUFBbUI7QUFDekIsV0FBTyxLQUFLLGlCQUFpQixRQUFRLEtBQUssR0FBRztBQUFBLEVBQzlDO0FBQUEsRUFFTyxPQUE2QjtBQUNuQyxXQUFPLEtBQUssaUJBQWlCLEtBQUssS0FBSyxHQUFHO0FBQUEsRUFDM0M7QUFBQSxFQUVPLFVBQW1CO0FBQ3pCLFdBQU8sS0FBSyxpQkFBaUIsUUFBUSxLQUFLLEdBQUc7QUFBQSxFQUM5QztBQUFBO0FBQUE7QUFBQSxFQU1RLHdDQUF3QywyQkFBK0MscUJBQStELG1CQUFpRTtBQUc5TixRQUFJLDZCQUE2QiwwQkFBMEIsT0FBTyxHQUFHO0FBQ3BFLFlBQU0sZ0JBQWdCLE1BQU0sS0FBSyx5QkFBeUI7QUFDMUQsWUFBTSxtQkFBbUIsY0FBYyxJQUFJLGdCQUFjLElBQUksb0JBQW9CLFlBQVksVUFBVSxDQUFDO0FBQ3hHLFdBQUssa0NBQWtDLElBQUksOEJBQThCLGdCQUFnQixDQUFDO0FBQUEsSUFDM0Y7QUFDQSxTQUFLLDJCQUEyQixtQkFBbUI7QUFDbkQsU0FBSyxxQkFBcUIsaUJBQWlCO0FBQUEsRUFDNUM7QUFBQSxFQUVRLDJCQUEyQixxQkFBcUU7QUFDdkcsUUFBSSx1QkFBdUIsb0JBQW9CLE9BQU8sR0FBRztBQUN4RCxZQUFNLGdCQUFnQixNQUFNLEtBQUssbUJBQW1CO0FBQ3BELFlBQU0sd0JBQXdCLGNBQWMsSUFBSSw2QkFBMkIsSUFBSSx1QkFBdUIsd0JBQXdCLFNBQVMsd0JBQXdCLGNBQWMsd0JBQXdCLFlBQVksd0JBQXdCLFVBQVUsQ0FBQztBQUNwUCxXQUFLLHVCQUF1QixLQUFLLElBQUksNEJBQTRCLHFCQUFxQixDQUFDO0FBQUEsSUFDeEY7QUFBQSxFQUNEO0FBQUEsRUFFUSxxQkFBcUIsbUJBQWlFO0FBQzdGLFFBQUkscUJBQXFCLGtCQUFrQixPQUFPLEdBQUc7QUFDcEQsWUFBTSxnQkFBZ0IsTUFBTSxLQUFLLGlCQUFpQjtBQUNsRCxZQUFNLGtCQUFrQixjQUFjLElBQUksZ0JBQWMsSUFBSSxpQkFBaUIsV0FBVyxTQUFTLFdBQVcsVUFBVSxDQUFDO0FBQ3ZILFdBQUssaUJBQWlCLEtBQUssSUFBSSxzQkFBc0IsZUFBZSxDQUFDO0FBQUEsSUFDdEU7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQ0FBa0MsR0FBMEU7QUFDbkgsZUFBVyxhQUFhLEtBQUssYUFBYTtBQUN6QyxVQUFJO0FBQ0gsa0JBQVUsaUNBQWlDLENBQUM7QUFBQSxNQUM3QyxTQUFTLE9BQU87QUFDZiwwQkFBa0IsS0FBSztBQUFBLE1BQ3hCO0FBQUEsSUFDRDtBQUNBLGVBQVcsYUFBYSxLQUFLLGFBQWE7QUFDekMsVUFBSTtBQUNILGtCQUFVLHVCQUF1QixDQUFDO0FBQUEsTUFDbkMsU0FBUyxPQUFPO0FBQ2YsMEJBQWtCLEtBQUs7QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxrQkFBcUIsVUFBd0UsVUFBa0IsR0FBYTtBQUNsSSxTQUFLLG1CQUFtQjtBQUV4QixRQUFJO0FBQ0gsV0FBSyx3QkFBd0Isa0JBQWtCO0FBQy9DLGFBQU8sS0FBSyxtQkFBbUIsU0FBUyxRQUFRO0FBQUEsSUFDakQsVUFBRTtBQUNELFdBQUssd0JBQXdCLGdCQUFnQjtBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBLEVBRVEsbUJBQXNCLFNBQWlCLFVBQWtGO0FBQ2hJLFVBQU0saUJBQXdEO0FBQUEsTUFDN0QsZUFBZSxDQUFDLE9BQWUsWUFBbUQ7QUFDakYsZUFBTyxLQUFLLHNCQUFzQixTQUFTLENBQUMsR0FBRyxDQUFDLEVBQUUsT0FBYyxRQUFpQixDQUFDLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDdkY7QUFBQSxNQUNBLGtCQUFrQixDQUFDLElBQVksYUFBMkI7QUFDekQsYUFBSyxzQkFBc0IsU0FBUyxJQUFJLFFBQVE7QUFBQSxNQUNqRDtBQUFBLE1BQ0EseUJBQXlCLENBQUMsSUFBWSxZQUEyQztBQUNoRixhQUFLLDZCQUE2QixTQUFTLElBQUksa0JBQWtCLE9BQU8sQ0FBQztBQUFBLE1BQzFFO0FBQUEsTUFDQSxrQkFBa0IsQ0FBQyxPQUFxQjtBQUN2QyxhQUFLLHNCQUFzQixTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzdDO0FBQUEsTUFDQSxrQkFBa0IsQ0FBQyxnQkFBMEIsbUJBQTREO0FBQ3hHLFlBQUksZUFBZSxXQUFXLEtBQUssZUFBZSxXQUFXLEdBQUc7QUFFL0QsaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFDQSxlQUFPLEtBQUssc0JBQXNCLFNBQVMsZ0JBQWdCLGNBQWM7QUFBQSxNQUMxRTtBQUFBLElBQ0Q7QUFDQSxRQUFJLFNBQW1CO0FBQ3ZCLFFBQUk7QUFDSCxlQUFTLFNBQVMsY0FBYztBQUFBLElBQ2pDLFNBQVMsR0FBRztBQUNYLHdCQUFrQixDQUFDO0FBQUEsSUFDcEI7QUFFQSxtQkFBZSxnQkFBZ0I7QUFDL0IsbUJBQWUsbUJBQW1CO0FBQ2xDLG1CQUFlLDBCQUEwQjtBQUN6QyxtQkFBZSxtQkFBbUI7QUFDbEMsbUJBQWUsbUJBQW1CO0FBQ2xDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxpQkFBaUIsZ0JBQTBCLGdCQUErQyxVQUFrQixHQUFhO0FBQy9ILFNBQUssbUJBQW1CO0FBQ3hCLFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsdUJBQWlCLENBQUM7QUFBQSxJQUNuQjtBQUNBLFFBQUksZUFBZSxXQUFXLEtBQUssZUFBZSxXQUFXLEdBQUc7QUFFL0QsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFFBQUk7QUFDSCxXQUFLO0FBQ0wsVUFBSSxLQUFLLDBCQUEwQixHQUFHO0FBQ3JDLGdCQUFRLEtBQUssMEVBQTBFO0FBQ3ZGLDBCQUFrQixJQUFJLE1BQU0sMEVBQTBFLENBQUM7QUFBQSxNQUN4RztBQUNBLFdBQUssd0JBQXdCLGtCQUFrQjtBQUMvQyxhQUFPLEtBQUssc0JBQXNCLFNBQVMsZ0JBQWdCLGNBQWM7QUFBQSxJQUMxRSxVQUFFO0FBQ0QsV0FBSyx3QkFBd0IsZ0JBQWdCO0FBQzdDLFdBQUs7QUFBQSxJQUNOO0FBQUEsRUFDRDtBQUFBLEVBRUEsaUJBQWlCLElBQTBCO0FBQzFDLFdBQU8sS0FBSyxtQkFBbUIsRUFBRTtBQUFBLEVBQ2xDO0FBQUEsRUFJQSxpQkFBaUIsSUFBbUIsVUFBd0IsZUFBNEQ7QUFDdkgsVUFBTSxPQUFRLEtBQUssS0FBSyxhQUFhLEVBQUUsSUFBSTtBQUUzQyxRQUFJLENBQUMsTUFBTTtBQUNWLFVBQUksQ0FBQyxVQUFVO0FBRWQsZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPLEtBQUssc0JBQXNCLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRSxPQUFPLFVBQVUsU0FBUyxzQkFBc0IsYUFBYSxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsQ0FBQztBQUFBLElBQ3ZIO0FBRUEsUUFBSSxDQUFDLFVBQVU7QUFFZCxXQUFLLGlCQUFpQixPQUFPLElBQUk7QUFDakMsYUFBTyxLQUFLLGFBQWEsS0FBSyxFQUFFO0FBQ2hDLGFBQU87QUFBQSxJQUNSO0FBR0EsVUFBTSxRQUFRLEtBQUssbUNBQW1DLFFBQVE7QUFDOUQsVUFBTSxjQUFjLEtBQUssUUFBUSxZQUFZLE1BQU0saUJBQWlCLE1BQU0sV0FBVztBQUNyRixVQUFNLFlBQVksS0FBSyxRQUFRLFlBQVksTUFBTSxlQUFlLE1BQU0sU0FBUztBQUMvRSxTQUFLLGlCQUFpQixPQUFPLElBQUk7QUFDakMsU0FBSyxNQUFNLEtBQUssYUFBYSxHQUFHLGFBQWEsV0FBVyxLQUFLO0FBQzdELFNBQUssV0FBVyxzQkFBc0IsYUFBYSxDQUFDO0FBQ3BELFNBQUssaUJBQWlCLE9BQU8sSUFBSTtBQUNqQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxnQ0FBZ0MsU0FBdUI7QUFDN0QsUUFBSSxLQUFLLGFBQWE7QUFDckI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLEtBQUssaUJBQWlCLHNCQUFzQixPQUFPO0FBQ2pFLGFBQVMsSUFBSSxHQUFHLE1BQU0sTUFBTSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ2pELFlBQU0sT0FBTyxNQUFNLENBQUM7QUFFcEIsV0FBSyxpQkFBaUIsT0FBTyxJQUFJO0FBQ2pDLGFBQU8sS0FBSyxhQUFhLEtBQUssRUFBRTtBQUFBLElBQ2pDO0FBQUEsRUFDRDtBQUFBLEVBRU8scUJBQXFCLGNBQTREO0FBQ3ZGLFVBQU0sT0FBTyxLQUFLLGFBQWEsWUFBWTtBQUMzQyxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sbUJBQW1CLGNBQW9DO0FBQzdELFVBQU0sT0FBTyxLQUFLLGFBQWEsWUFBWTtBQUMzQyxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLGlCQUFpQixhQUFhLE1BQU0sSUFBSTtBQUFBLEVBQ3JEO0FBQUEsRUFFTyxtQkFBbUIsWUFBb0IsVUFBa0IsR0FBRyxzQkFBK0IsT0FBTyx3QkFBaUMsT0FBaUM7QUFDMUssUUFBSSxhQUFhLEtBQUssYUFBYSxLQUFLLGFBQWEsR0FBRztBQUN2RCxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQ0EsV0FBTyxLQUFLLG9CQUFvQixZQUFZLFlBQVksU0FBUyxxQkFBcUIscUJBQXFCO0FBQUEsRUFDNUc7QUFBQSxFQUVPLG9CQUFvQixrQkFBMEIsZ0JBQXdCLFVBQWtCLEdBQUcsc0JBQStCLE9BQU8sd0JBQWlDLE9BQU8sd0JBQWlDLE9BQWlDO0FBQ2pQLFVBQU0sWUFBWSxLQUFLLGFBQWE7QUFDcEMsVUFBTSxrQkFBa0IsS0FBSyxJQUFJLFdBQVcsS0FBSyxJQUFJLEdBQUcsZ0JBQWdCLENBQUM7QUFDekUsVUFBTSxnQkFBZ0IsS0FBSyxJQUFJLFdBQVcsS0FBSyxJQUFJLEdBQUcsY0FBYyxDQUFDO0FBQ3JFLFVBQU0sWUFBWSxLQUFLLGlCQUFpQixhQUFhO0FBQ3JELFVBQU0sUUFBUSxJQUFJLE1BQU0saUJBQWlCLEdBQUcsZUFBZSxTQUFTO0FBRXBFLFVBQU0sY0FBYyxLQUFLLHVCQUF1QixPQUFPLFNBQVMscUJBQXFCLHVCQUF1QixxQkFBcUI7QUFDakksYUFBUyxhQUFhLEtBQUssb0JBQW9CLHNCQUFzQixPQUFPLFNBQVMscUJBQXFCLHFCQUFxQixDQUFDO0FBQ2hJLGFBQVMsYUFBYSxLQUFLLDhCQUE4QixzQkFBc0IsT0FBTyxTQUFTLHFCQUFxQixxQkFBcUIsQ0FBQztBQUMxSSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sc0JBQXNCLE9BQWUsVUFBa0IsR0FBRyxzQkFBK0IsT0FBTyx3QkFBaUMsT0FBTyx5QkFBa0MsT0FBTyx3QkFBaUMsT0FBaUM7QUFDelAsVUFBTSxpQkFBaUIsS0FBSyxjQUFjLEtBQUs7QUFFL0MsVUFBTSxjQUFjLEtBQUssdUJBQXVCLGdCQUFnQixTQUFTLHFCQUFxQix1QkFBdUIscUJBQXFCO0FBQzFJLGFBQVMsYUFBYSxLQUFLLG9CQUFvQixzQkFBc0IsZ0JBQWdCLFNBQVMscUJBQXFCLHVCQUF1QixzQkFBc0IsQ0FBQztBQUNqSyxhQUFTLGFBQWEsS0FBSyw4QkFBOEIsc0JBQXNCLGdCQUFnQixTQUFTLHFCQUFxQix1QkFBdUIsc0JBQXNCLENBQUM7QUFDM0ssV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLDRCQUE0QixVQUFrQixHQUFHLHNCQUErQixPQUFPLHdCQUFpQyxPQUFpQztBQUMvSixXQUFPLEtBQUssaUJBQWlCLE9BQU8sTUFBTSxTQUFTLHFCQUFxQix1QkFBdUIsTUFBTSxLQUFLO0FBQUEsRUFDM0c7QUFBQSxFQUVPLDJCQUEyQixVQUFrQixHQUE2QjtBQUNoRixXQUFPLEtBQUssaUJBQWlCLG1CQUFtQixNQUFNLE9BQU87QUFBQSxFQUM5RDtBQUFBLEVBRU8sZ0NBQWdDLFVBQWtCLEdBQTZCO0FBQ3JGLFVBQU0sT0FBTyxLQUFLLGlCQUFpQix3QkFBd0IsTUFBTSxPQUFPO0FBQ3hFLGFBQVMsTUFBTSxLQUFLLDhCQUE4QixrQkFBa0IsT0FBTyxDQUFDO0FBQzVFLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyx1Q0FBdUMsT0FBYyxVQUFrQixHQUE2QjtBQUMxRyxVQUFNLE9BQU8sS0FBSyxpQkFBaUIsK0JBQStCLE1BQU0sS0FBSyxZQUFZLE1BQU0saUJBQWlCLENBQUMsR0FBRyxLQUFLLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxPQUFPO0FBQ3JLLGFBQVMsTUFBTSxLQUFLLDhCQUE4QixzQkFBc0IsT0FBTyxPQUFPLENBQUM7QUFDdkYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLG9CQUFvQixZQUFvQixVQUFrQixHQUF1QjtBQUN2RixVQUFNLGNBQWMsS0FBSyxRQUFRLFlBQVksWUFBWSxDQUFDO0FBQzFELFVBQU0sWUFBWSxjQUFjLEtBQUssUUFBUSxjQUFjLFVBQVU7QUFFckUsVUFBTSxTQUFTLEtBQUssaUJBQWlCLDBCQUEwQixNQUFNLGFBQWEsV0FBVyxPQUFPO0FBQ3BHLFdBQU8saUJBQWlCLGdCQUFnQixNQUFNLEVBQUUsT0FBTyxPQUFLLEVBQUUsZUFBZSxVQUFVO0FBQUEsRUFDeEY7QUFBQSxFQUVPLDBCQUEwQixPQUFlLFVBQWtCLEdBQTZCO0FBQzlGLFVBQU0sY0FBYyxLQUFLLFFBQVEsWUFBWSxNQUFNLGlCQUFpQixNQUFNLFdBQVc7QUFDckYsVUFBTSxZQUFZLEtBQUssUUFBUSxZQUFZLE1BQU0sZUFBZSxNQUFNLFNBQVM7QUFDL0UsV0FBTyxLQUFLLGlCQUFpQiw2QkFBNkIsTUFBTSxhQUFhLFdBQVcsT0FBTztBQUFBLEVBQ2hHO0FBQUEsRUFFTyxrQkFBa0IsVUFBa0IsR0FBRyxzQkFBK0IsT0FBTyx3QkFBaUMsT0FBaUM7QUFDckosUUFBSSxTQUFTLEtBQUssaUJBQWlCLE9BQU8sTUFBTSxTQUFTLHFCQUFxQix1QkFBdUIsT0FBTyxLQUFLO0FBQ2pILGFBQVMsT0FBTyxPQUFPLEtBQUssb0JBQW9CLGtCQUFrQixTQUFTLG1CQUFtQixDQUFDO0FBQy9GLGFBQVMsT0FBTyxPQUFPLEtBQUssOEJBQThCLGtCQUFrQixTQUFTLG1CQUFtQixDQUFDO0FBQ3pHLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyx3QkFBd0IsVUFBa0IsR0FBNkI7QUFDN0UsV0FBTyxLQUFLLGlCQUFpQixPQUFPLE1BQU0sU0FBUyxPQUFPLE9BQU8sT0FBTyxJQUFJO0FBQUEsRUFDN0U7QUFBQSxFQUVRLHVCQUF1QixhQUFvQixlQUF1QixxQkFBOEIsdUJBQWdDLHVCQUEwRDtBQUNqTSxVQUFNLGNBQWMsS0FBSyxRQUFRLFlBQVksWUFBWSxpQkFBaUIsWUFBWSxXQUFXO0FBQ2pHLFVBQU0sWUFBWSxLQUFLLFFBQVEsWUFBWSxZQUFZLGVBQWUsWUFBWSxTQUFTO0FBQzNGLFdBQU8sS0FBSyxpQkFBaUIsaUJBQWlCLE1BQU0sYUFBYSxXQUFXLGVBQWUscUJBQXFCLHVCQUF1QixxQkFBcUI7QUFBQSxFQUM3SjtBQUFBLEVBRU8sV0FBVyxPQUFlLEtBQW9CO0FBQ3BELFdBQU8sS0FBSyxRQUFRLFdBQVcsT0FBTyxNQUFNLEtBQUs7QUFBQSxFQUNsRDtBQUFBLEVBRVEsc0JBQXNCLFNBQWlCLGNBQXNCLFFBQXNCO0FBQzFGLFVBQU0sT0FBTyxLQUFLLGFBQWEsWUFBWTtBQUMzQyxRQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxRQUFRLE9BQU87QUFDdkIsWUFBTSxXQUFXLEtBQUssbUJBQW1CLFlBQVk7QUFDckQsV0FBSyx3QkFBd0IsaUNBQWlDLFNBQVUsYUFBYTtBQUFBLElBQ3RGO0FBQ0EsUUFBSSxLQUFLLFFBQVEsUUFBUTtBQUN4QixZQUFNLFdBQVcsS0FBSyxtQkFBbUIsWUFBWTtBQUNyRCxXQUFLLHdCQUF3QixpQ0FBaUMsU0FBVSxlQUFlO0FBQUEsSUFDeEY7QUFDQSxRQUFJLEtBQUssUUFBUSxlQUFlLE1BQU07QUFDckMsWUFBTSxXQUFXLEtBQUssbUJBQW1CLFlBQVk7QUFDckQsV0FBSyx3QkFBd0IscUNBQXFDLFNBQVMsY0FBYyxTQUFVLGlCQUFpQixJQUFJO0FBQUEsSUFDekg7QUFDQSxRQUFJLEtBQUssUUFBUSxhQUFhO0FBQzdCLFlBQU0sV0FBVyxLQUFLLG1CQUFtQixZQUFZO0FBQ3JELFdBQUssd0JBQXdCLCtCQUErQixTQUFTLEtBQUssSUFBSSxTQUFVLGVBQWU7QUFBQSxJQUN4RztBQUVBLFVBQU0sUUFBUSxLQUFLLG1DQUFtQyxNQUFNO0FBQzVELFVBQU0sY0FBYyxLQUFLLFFBQVEsWUFBWSxNQUFNLGlCQUFpQixNQUFNLFdBQVc7QUFDckYsVUFBTSxZQUFZLEtBQUssUUFBUSxZQUFZLE1BQU0sZUFBZSxNQUFNLFNBQVM7QUFFL0UsU0FBSyxpQkFBaUIsT0FBTyxJQUFJO0FBQ2pDLFNBQUssTUFBTSxLQUFLLGFBQWEsR0FBRyxhQUFhLFdBQVcsS0FBSztBQUM3RCxTQUFLLGlCQUFpQixPQUFPLElBQUk7QUFDakMsU0FBSyx3QkFBd0IscUJBQXFCLEtBQUssT0FBTztBQUU5RCxRQUFJLEtBQUssUUFBUSxPQUFPO0FBQ3ZCLFdBQUssd0JBQXdCLGlDQUFpQyxNQUFNLGFBQWE7QUFBQSxJQUNsRjtBQUNBLFFBQUksS0FBSyxRQUFRLFFBQVE7QUFDeEIsV0FBSyx3QkFBd0IsaUNBQWlDLE1BQU0sZUFBZTtBQUFBLElBQ3BGO0FBQ0EsUUFBSSxLQUFLLFFBQVEsZUFBZSxNQUFNO0FBQ3JDLFdBQUssd0JBQXdCLHFDQUFxQyxTQUFTLGNBQWMsTUFBTSxpQkFBaUIsS0FBSyxRQUFRLFVBQVU7QUFBQSxJQUN4STtBQUNBLFFBQUksS0FBSyxRQUFRLGFBQWE7QUFDN0IsV0FBSyx3QkFBd0IsK0JBQStCLFNBQVMsS0FBSyxJQUFJLE1BQU0sZUFBZTtBQUFBLElBQ3BHO0FBQUEsRUFDRDtBQUFBLEVBRVEsNkJBQTZCLFNBQWlCLGNBQXNCLFNBQXVDO0FBQ2xILFVBQU0sT0FBTyxLQUFLLGFBQWEsWUFBWTtBQUMzQyxRQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsSUFDRDtBQUVBLFVBQU0seUJBQTBCLEtBQUssUUFBUSxpQkFBaUIsS0FBSyxRQUFRLGNBQWMsUUFBUSxPQUFPO0FBQ3hHLFVBQU0sd0JBQXlCLFFBQVEsaUJBQWlCLFFBQVEsY0FBYyxRQUFRLE9BQU87QUFFN0YsU0FBSyx3QkFBd0IscUJBQXFCLEtBQUssT0FBTztBQUM5RCxTQUFLLHdCQUF3QixxQkFBcUIsT0FBTztBQUV6RCxRQUFJLEtBQUssUUFBUSxTQUFTLFFBQVEsT0FBTztBQUN4QyxZQUFNLFlBQVksS0FBSyxpQkFBaUIsYUFBYSxNQUFNLElBQUk7QUFDL0QsV0FBSyx3QkFBd0IsaUNBQWlDLFVBQVUsYUFBYTtBQUFBLElBQ3RGO0FBQ0EsUUFBSSxLQUFLLFFBQVEsVUFBVSxRQUFRLFFBQVE7QUFDMUMsWUFBTSxZQUFZLEtBQUssaUJBQWlCLGFBQWEsTUFBTSxJQUFJO0FBQy9ELFdBQUssd0JBQXdCLGlDQUFpQyxVQUFVLGVBQWU7QUFBQSxJQUN4RjtBQUNBLFFBQUksS0FBSyxRQUFRLGVBQWUsUUFBUSxRQUFRLGVBQWUsTUFBTTtBQUNwRSxZQUFNLFlBQVksS0FBSyxpQkFBaUIsYUFBYSxNQUFNLElBQUk7QUFDL0QsV0FBSyx3QkFBd0IscUNBQXFDLFNBQVMsY0FBYyxVQUFVLGlCQUFpQixRQUFRLFVBQVU7QUFBQSxJQUN2STtBQUNBLFFBQUksS0FBSyxRQUFRLGVBQWUsUUFBUSxhQUFhO0FBQ3BELFlBQU0sWUFBWSxLQUFLLGlCQUFpQixhQUFhLE1BQU0sSUFBSTtBQUMvRCxXQUFLLHdCQUF3QiwrQkFBK0IsU0FBUyxjQUFjLFVBQVUsZUFBZTtBQUFBLElBQzdHO0FBRUEsVUFBTSx1QkFBdUIsMkJBQTJCO0FBQ3hELFVBQU0sNkJBQTZCLHNCQUFzQixPQUFPLE1BQU0sbUJBQW1CLElBQUk7QUFDN0YsUUFBSSx3QkFBd0IsNEJBQTRCO0FBQ3ZELFdBQUssaUJBQWlCLE9BQU8sSUFBSTtBQUNqQyxXQUFLLFdBQVcsT0FBTztBQUN2QixXQUFLLGlCQUFpQixPQUFPLElBQUk7QUFBQSxJQUNsQyxPQUFPO0FBQ04sV0FBSyxXQUFXLE9BQU87QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixTQUFpQixtQkFBNkIsZ0JBQStDLGlCQUEwQixPQUFpQjtBQUNySyxVQUFNLFlBQVksS0FBSyxhQUFhO0FBRXBDLFVBQU0sb0JBQW9CLGtCQUFrQjtBQUM1QyxRQUFJLHFCQUFxQjtBQUV6QixVQUFNLG9CQUFvQixlQUFlO0FBQ3pDLFFBQUkscUJBQXFCO0FBRXpCLFNBQUssd0JBQXdCLGtCQUFrQjtBQUMvQyxRQUFJO0FBQ0gsWUFBTSxTQUFTLElBQUksTUFBYyxpQkFBaUI7QUFDbEQsYUFBTyxxQkFBcUIscUJBQXFCLHFCQUFxQixtQkFBbUI7QUFFeEYsWUFBSSxPQUE0QjtBQUVoQyxZQUFJLHFCQUFxQixtQkFBbUI7QUFFM0MsY0FBSTtBQUNKLGFBQUc7QUFDRiwyQkFBZSxrQkFBa0Isb0JBQW9CO0FBQ3JELG1CQUFPLEtBQUssYUFBYSxZQUFZO0FBQUEsVUFDdEMsU0FBUyxDQUFDLFFBQVEscUJBQXFCO0FBR3ZDLGNBQUksTUFBTTtBQUNULGdCQUFJLEtBQUssUUFBUSxPQUFPO0FBQ3ZCLG9CQUFNLFlBQVksS0FBSyxpQkFBaUIsYUFBYSxNQUFNLElBQUk7QUFDL0QsbUJBQUssd0JBQXdCLGlDQUFpQyxVQUFVLGFBQWE7QUFBQSxZQUN0RjtBQUNBLGdCQUFJLEtBQUssUUFBUSxRQUFRO0FBQ3hCLG9CQUFNLFlBQVksS0FBSyxpQkFBaUIsYUFBYSxNQUFNLElBQUk7QUFDL0QsbUJBQUssd0JBQXdCLGlDQUFpQyxVQUFVLGVBQWU7QUFBQSxZQUN4RjtBQUNBLGdCQUFJLEtBQUssUUFBUSxlQUFlLE1BQU07QUFDckMsb0JBQU0sWUFBWSxLQUFLLGlCQUFpQixhQUFhLE1BQU0sSUFBSTtBQUMvRCxtQkFBSyx3QkFBd0IscUNBQXFDLFNBQVMsY0FBYyxVQUFVLGlCQUFpQixJQUFJO0FBQUEsWUFDekg7QUFDQSxnQkFBSSxLQUFLLFFBQVEsYUFBYTtBQUM3QixvQkFBTSxZQUFZLEtBQUssaUJBQWlCLGFBQWEsTUFBTSxJQUFJO0FBQy9ELG1CQUFLLHdCQUF3QiwrQkFBK0IsU0FBUyxjQUFjLFVBQVUsZUFBZTtBQUFBLFlBQzdHO0FBQ0EsaUJBQUssaUJBQWlCLE9BQU8sSUFBSTtBQUVqQyxnQkFBSSxDQUFDLGdCQUFnQjtBQUNwQixtQkFBSyx3QkFBd0IscUJBQXFCLEtBQUssT0FBTztBQUFBLFlBQy9EO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxZQUFJLHFCQUFxQixtQkFBbUI7QUFFM0MsY0FBSSxDQUFDLE1BQU07QUFDVixrQkFBTSx1QkFBd0IsRUFBRSxLQUFLO0FBQ3JDLGtCQUFNLGVBQWUsR0FBRyxLQUFLLFdBQVcsSUFBSSxvQkFBb0I7QUFDaEUsbUJBQU8sSUFBSSxhQUFhLGNBQWMsR0FBRyxDQUFDO0FBQzFDLGlCQUFLLGFBQWEsWUFBWSxJQUFJO0FBQUEsVUFDbkM7QUFHQSxnQkFBTSxnQkFBZ0IsZUFBZSxrQkFBa0I7QUFDdkQsZ0JBQU0sUUFBUSxLQUFLLG1DQUFtQyxjQUFjLEtBQUs7QUFDekUsZ0JBQU0sVUFBVSxrQkFBa0IsY0FBYyxPQUFPO0FBQ3ZELGdCQUFNLGNBQWMsS0FBSyxRQUFRLFlBQVksTUFBTSxpQkFBaUIsTUFBTSxXQUFXO0FBQ3JGLGdCQUFNLFlBQVksS0FBSyxRQUFRLFlBQVksTUFBTSxlQUFlLE1BQU0sU0FBUztBQUUvRSxlQUFLLFVBQVU7QUFDZixlQUFLLE1BQU0sV0FBVyxhQUFhLFdBQVcsS0FBSztBQUNuRCxlQUFLLFdBQVcsT0FBTztBQUV2QixjQUFJLEtBQUssUUFBUSxPQUFPO0FBQ3ZCLGlCQUFLLHdCQUF3QixpQ0FBaUMsTUFBTSxhQUFhO0FBQUEsVUFDbEY7QUFDQSxjQUFJLEtBQUssUUFBUSxRQUFRO0FBQ3hCLGlCQUFLLHdCQUF3QixpQ0FBaUMsTUFBTSxlQUFlO0FBQUEsVUFDcEY7QUFDQSxjQUFJLEtBQUssUUFBUSxlQUFlLE1BQU07QUFDckMsaUJBQUssd0JBQXdCLHFDQUFxQyxTQUFTLEtBQUssSUFBSSxNQUFNLGlCQUFpQixLQUFLLFFBQVEsVUFBVTtBQUFBLFVBQ25JO0FBQ0EsY0FBSSxLQUFLLFFBQVEsYUFBYTtBQUM3QixpQkFBSyx3QkFBd0IsK0JBQStCLFNBQVMsS0FBSyxJQUFJLE1BQU0sZUFBZTtBQUFBLFVBQ3BHO0FBQ0EsY0FBSSxDQUFDLGdCQUFnQjtBQUNwQixpQkFBSyx3QkFBd0IscUJBQXFCLE9BQU87QUFBQSxVQUMxRDtBQUVBLGVBQUssaUJBQWlCLE9BQU8sSUFBSTtBQUVqQyxpQkFBTyxrQkFBa0IsSUFBSSxLQUFLO0FBRWxDO0FBQUEsUUFDRCxPQUFPO0FBQ04sY0FBSSxNQUFNO0FBQ1QsbUJBQU8sS0FBSyxhQUFhLEtBQUssRUFBRTtBQUFBLFVBQ2pDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsSUFDUixVQUFFO0FBQ0QsV0FBSyx3QkFBd0IsZ0JBQWdCO0FBQUEsSUFDOUM7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPTyxnQkFBd0I7QUFDOUIsV0FBTyxLQUFLLGFBQWEsY0FBYztBQUFBLEVBQ3hDO0FBQUEsRUFFTyxZQUFZLHVCQUFvRCxRQUF1QjtBQUM3RixRQUFJLE9BQU8sMEJBQTBCLFVBQVU7QUFDOUMsV0FBSywyQkFBMkIsTUFBTTtBQUN0QyxXQUFLLGFBQWEsdUJBQXVCLE1BQU07QUFBQSxJQUNoRCxPQUFPO0FBQ04sV0FBSywyQkFBMkIsUUFBUSxzQkFBc0IsWUFBWSxNQUFNLEtBQUssYUFBYSxzQkFBc0IsWUFBWSxNQUFNLENBQUM7QUFDM0ksV0FBSyxhQUFhLHNCQUFzQixZQUFZLE1BQU07QUFBQSxJQUMzRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGFBQWEsWUFBb0IsUUFBdUI7QUFDL0QsU0FBSyxhQUFhLGNBQWMsWUFBWSxNQUFNO0FBQ2xELFNBQUssaUJBQWlCLDRCQUE0QixVQUFVO0FBQUEsRUFDN0Q7QUFBQSxFQUVPLHdCQUF3QixZQUFvQixRQUF3QjtBQUMxRSxXQUFPLEtBQUssYUFBYSx3QkFBd0IsWUFBWSxNQUFNO0FBQUEsRUFDcEU7QUFBQSxFQUVPLGtCQUFrQixVQUE2QztBQUNyRSxXQUFPLEtBQUssMkJBQTJCLGtCQUFrQixRQUFRO0FBQUEsRUFDbEU7QUFBQSxFQUVPLHFCQUFxQixVQUFzQztBQUNqRSxXQUFPLEtBQUssMkJBQTJCLHFCQUFxQixRQUFRO0FBQUEsRUFDckU7QUFBQTtBQUFBLEVBR0Esa0JBQWtCLFVBQW9CLFVBQTRDO0FBQ2pGLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1PLG9CQUFvQixZQUE0QjtBQUV0RCxXQUFPLGFBQWEsS0FBSyxlQUFlLFVBQVUsQ0FBQyxJQUFJO0FBQUEsRUFDeEQ7QUFBQSxFQUVnQixXQUFtQjtBQUNsQyxXQUFPLGFBQWEsS0FBSyxJQUFJLFNBQVMsQ0FBQztBQUFBLEVBQ3hDO0FBQ0Q7QUEzNURhLFVBRUwsb0JBQW9CLEtBQUssT0FBTztBQUFBO0FBRjNCLFVBR1ksNEJBQTRCLEtBQUssT0FBTztBQUFBO0FBSHBELFVBSVksa0NBQWtDLE1BQU07QUFBQTtBQUpwRCxVQUtZLHNDQUFzQyxNQUFNLE9BQU87QUFBQTtBQUwvRCxVQU9FLDJCQUE0RDtBQUFBLEVBQ3pFLG1CQUFtQjtBQUFBLEVBQ25CLFNBQVMsc0JBQXNCO0FBQUEsRUFDL0IsWUFBWSxzQkFBc0I7QUFBQSxFQUNsQyxjQUFjLHNCQUFzQjtBQUFBLEVBQ3BDLG1CQUFtQjtBQUFBLEVBQ25CLFlBQVksTUFBTSxpQkFBaUI7QUFBQSxFQUNuQyxvQkFBb0Isc0JBQXNCO0FBQUEsRUFDMUMsd0JBQXdCLHNCQUFzQjtBQUFBLEVBQzlDLGdDQUFnQyxzQkFBc0I7QUFDdkQ7QUFqQlksWUFBTjtBQUFBLEVBNEhKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0EvSFU7QUE2NUROLFNBQVMsNEJBQTRCLFFBQW9CLGtCQUFzRCxrQkFBK0M7QUFDcEssTUFBSTtBQUNKLE1BQUksa0JBQWtCO0FBQ3JCLFVBQU0saUJBQTRFLENBQUM7QUFFbkYsYUFBUyxNQUFNLEdBQUcsTUFBTSxpQkFBaUIsUUFBUSxPQUFPO0FBQ3ZELFlBQU0sU0FBUyxpQkFBaUIsR0FBRztBQUNuQyxZQUFNQyxVQUFTLGlCQUFrQixHQUFHLEVBQUU7QUFDdEMsVUFBSUEsU0FBUTtBQUNYLFFBQUFBLFFBQU8sUUFBUSxDQUFDLE9BQU8sU0FBUztBQUMvQix5QkFBZSxLQUFLO0FBQUEsWUFDbkI7QUFBQSxZQUNBLE1BQU0sTUFBTSxVQUFVLGlCQUFrQixHQUFHLEVBQUUsT0FBTztBQUFBLFlBQ3BELGVBQWUsS0FBSztBQUFBLFVBQ3JCLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGLE9BQU87QUFDTix1QkFBZSxLQUFLO0FBQUEsVUFDbkI7QUFBQSxVQUNBLE1BQU0saUJBQWtCLEdBQUcsRUFBRTtBQUFBLFVBQzdCLGVBQWUsV0FBVztBQUFBLFFBQzNCLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUNBLGlCQUFhLE9BQU8sYUFBYSxjQUFjO0FBQUEsRUFDaEQsT0FBTztBQUNOLGlCQUFhO0FBQUEsRUFDZDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsYUFBYSxNQUFzQjtBQUNsRCxNQUFJLFNBQVM7QUFDYixhQUFXLEtBQUssTUFBTTtBQUNyQixRQUFJLE1BQU0sT0FBTyxNQUFNLEtBQU07QUFDNUI7QUFBQSxJQUNELE9BQU87QUFDTjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBSUEsU0FBUyxzQkFBc0IsTUFBNkI7QUFDM0QsU0FBUSxLQUFLLFFBQVEsaUJBQWlCLEtBQUssUUFBUSxjQUFjLFFBQVEsT0FBTztBQUNqRjtBQUVBLFNBQVMsc0JBQXNCLFNBQTBDO0FBQ3hFLFNBQU8sQ0FBQyxDQUFDLFFBQVEsU0FBUyxDQUFDLENBQUMsUUFBUTtBQUNyQztBQUVBLFNBQVMsbUJBQW1CLE1BQTZCO0FBQ3hELFNBQU8sQ0FBQyxDQUFDLEtBQUssUUFBUSxTQUFTLENBQUMsQ0FBQyxLQUFLLFFBQVE7QUFDL0M7QUFPQSxNQUFNLGlCQUFpQjtBQUFBLEVBaUJ0QixjQUFjO0FBQ2IsU0FBSyxvQkFBb0IsSUFBSSxhQUFhO0FBQzFDLFNBQUssb0JBQW9CLElBQUksYUFBYTtBQUMxQyxTQUFLLCtCQUErQixJQUFJLGFBQWE7QUFBQSxFQUN0RDtBQUFBLEVBRU8seUJBQXlCLE1BQW1DO0FBQ2xFLFNBQUssT0FBTyxNQUFNLEdBQUcsT0FBTyxPQUFPLE9BQU8sS0FBSztBQUFBLEVBQ2hEO0FBQUEsRUFFUSx1QkFBdUIsTUFBNkIsT0FBaUQ7QUFDNUcsZUFBVyxRQUFRLE9BQU87QUFDekIsVUFBSSxLQUFLLFVBQVUsTUFBTTtBQUN4QixhQUFLLFFBQVEsS0FBSyxXQUFXLEtBQUsscUJBQXFCLEtBQUssaUJBQWlCO0FBQUEsTUFDOUU7QUFBQSxJQUNEO0FBQ0EsV0FBaUM7QUFBQSxFQUNsQztBQUFBLEVBRU8saUJBQWlCLE1BQTZCLE9BQWUsS0FBYSxlQUF1QixxQkFBOEIsdUJBQWdDLHVCQUEwRDtBQUMvTixVQUFNLFlBQVksS0FBSyxhQUFhO0FBQ3BDLFVBQU0sU0FBUyxLQUFLLGdCQUFnQixPQUFPLEtBQUssZUFBZSxxQkFBcUIsdUJBQXVCLFdBQVcscUJBQXFCO0FBQzNJLFdBQU8sS0FBSyx1QkFBdUIsTUFBTSxNQUFNO0FBQUEsRUFDaEQ7QUFBQSxFQUVRLGdCQUFnQixPQUFlLEtBQWEsZUFBdUIscUJBQThCLHVCQUFnQyxpQkFBeUIsdUJBQWdEO0FBQ2pOLFVBQU0sS0FBSyxLQUFLLGtCQUFrQixlQUFlLE9BQU8sS0FBSyxlQUFlLHFCQUFxQix1QkFBdUIsaUJBQWlCLHFCQUFxQjtBQUM5SixVQUFNLEtBQUssS0FBSyxrQkFBa0IsZUFBZSxPQUFPLEtBQUssZUFBZSxxQkFBcUIsdUJBQXVCLGlCQUFpQixxQkFBcUI7QUFDOUosVUFBTSxLQUFLLEtBQUssNkJBQTZCLGVBQWUsT0FBTyxLQUFLLGVBQWUscUJBQXFCLHVCQUF1QixpQkFBaUIscUJBQXFCO0FBQ3pLLFdBQU8sR0FBRyxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUU7QUFBQSxFQUMvQjtBQUFBLEVBRU8sMEJBQTBCLE1BQTZCLE9BQWUsS0FBYSxlQUFpRDtBQUMxSSxVQUFNLFlBQVksS0FBSyxhQUFhO0FBQ3BDLFVBQU0sU0FBUyxLQUFLLDZCQUE2QixlQUFlLE9BQU8sS0FBSyxlQUFlLE9BQU8sT0FBTyxXQUFXLEtBQUs7QUFDekgsV0FBTyxLQUFLLHVCQUF1QixNQUFNLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxFQUFFLFFBQVEsbUJBQW1CLENBQUMsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUFBLEVBQy9HO0FBQUEsRUFFTyw2QkFBNkIsTUFBNkIsT0FBZSxLQUFhLGVBQWlEO0FBQzdJLFVBQU0sWUFBWSxLQUFLLGFBQWE7QUFDcEMsVUFBTSxjQUFjLEtBQUssa0JBQWtCLGVBQWUsT0FBTyxLQUFLLGVBQWUsT0FBTyxPQUFPLFdBQVcsS0FBSztBQUNuSCxXQUFPLEtBQUssdUJBQXVCLE1BQU0sV0FBVyxFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQUUsUUFBUSxXQUFXO0FBQUEsRUFDMUY7QUFBQSxFQUVPLG1CQUFtQixNQUE2QixlQUFpRDtBQUN2RyxVQUFNLFlBQVksS0FBSyxhQUFhO0FBQ3BDLFVBQU0sU0FBUyxLQUFLLDZCQUE2QixPQUFPLGVBQWUsT0FBTyxPQUFPLFdBQVcsS0FBSztBQUNyRyxXQUFPLEtBQUssdUJBQXVCLE1BQU0sTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQUUsUUFBUSxtQkFBbUIsQ0FBQyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDL0c7QUFBQSxFQUVPLHdCQUF3QixNQUE2QixlQUFpRDtBQUM1RyxVQUFNLFlBQVksS0FBSyxhQUFhO0FBQ3BDLFVBQU0sU0FBUyxLQUFLLFFBQVEsZUFBZSxPQUFPLE9BQU8sT0FBTyxXQUFXLEtBQUs7QUFDaEYsV0FBTyxLQUFLLHVCQUF1QixNQUFNLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTSxPQUFPLEVBQUUsUUFBUSxlQUFlLFFBQVE7QUFBQSxFQUN4RztBQUFBLEVBRU8sK0JBQStCLE1BQTZCLE9BQWUsS0FBYSxlQUFpRDtBQUMvSSxVQUFNLFlBQVksS0FBSyxhQUFhO0FBQ3BDLFVBQU0sU0FBUyxLQUFLLGdCQUFnQixPQUFPLEtBQUssZUFBZSxPQUFPLE9BQU8sV0FBVyxLQUFLO0FBQzdGLFdBQU8sS0FBSyx1QkFBdUIsTUFBTSxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sT0FBTyxFQUFFLFFBQVEsZUFBZSxRQUFRO0FBQUEsRUFDeEc7QUFBQSxFQUVPLE9BQU8sTUFBNkIsZUFBdUIscUJBQThCLHVCQUFnQyxtQkFBNEIsdUJBQTBEO0FBQ3JOLFVBQU0sWUFBWSxLQUFLLGFBQWE7QUFDcEMsVUFBTSxTQUFTLEtBQUssUUFBUSxlQUFlLHFCQUFxQix1QkFBdUIsbUJBQW1CLFdBQVcscUJBQXFCO0FBQzFJLFdBQU8sS0FBSyx1QkFBdUIsTUFBTSxNQUFNO0FBQUEsRUFDaEQ7QUFBQSxFQUVRLFFBQVEsZUFBdUIscUJBQThCLHVCQUFnQyxtQkFBNEIsaUJBQXlCLHVCQUFnRDtBQUN6TSxRQUFJLG1CQUFtQjtBQUN0QixhQUFPLEtBQUssa0JBQWtCLE9BQU8sZUFBZSxxQkFBcUIsdUJBQXVCLGlCQUFpQixxQkFBcUI7QUFBQSxJQUN2SSxPQUFPO0FBQ04sWUFBTSxLQUFLLEtBQUssa0JBQWtCLE9BQU8sZUFBZSxxQkFBcUIsdUJBQXVCLGlCQUFpQixxQkFBcUI7QUFDMUksWUFBTSxLQUFLLEtBQUssa0JBQWtCLE9BQU8sZUFBZSxxQkFBcUIsdUJBQXVCLGlCQUFpQixxQkFBcUI7QUFDMUksWUFBTSxLQUFLLEtBQUssNkJBQTZCLE9BQU8sZUFBZSxxQkFBcUIsdUJBQXVCLGlCQUFpQixxQkFBcUI7QUFDckosYUFBTyxHQUFHLE9BQU8sRUFBRSxFQUFFLE9BQU8sRUFBRTtBQUFBLElBQy9CO0FBQUEsRUFDRDtBQUFBLEVBRU8sc0JBQXNCLFNBQWlDO0FBQzdELFVBQU0sS0FBSyxLQUFLLGtCQUFrQixzQkFBc0IsT0FBTztBQUMvRCxVQUFNLEtBQUssS0FBSyxrQkFBa0Isc0JBQXNCLE9BQU87QUFDL0QsVUFBTSxLQUFLLEtBQUssNkJBQTZCLHNCQUFzQixPQUFPO0FBQzFFLFdBQU8sR0FBRyxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUU7QUFBQSxFQUMvQjtBQUFBLEVBRU8sd0JBQXdDO0FBQzlDLFVBQU0sS0FBSyxLQUFLLGtCQUFrQixzQkFBc0I7QUFDeEQsVUFBTSxLQUFLLEtBQUssa0JBQWtCLHNCQUFzQjtBQUN4RCxVQUFNLEtBQUssS0FBSyw2QkFBNkIsc0JBQXNCO0FBQ25FLFdBQU8sR0FBRyxPQUFPLEVBQUUsRUFBRSxPQUFPLEVBQUU7QUFBQSxFQUMvQjtBQUFBLEVBRU8sT0FBTyxNQUEwQjtBQUN2QyxRQUFJLG1CQUFtQixJQUFJLEdBQUc7QUFDN0IsV0FBSyw2QkFBNkIsT0FBTyxJQUFJO0FBQUEsSUFDOUMsV0FBVyxzQkFBc0IsSUFBSSxHQUFHO0FBQ3ZDLFdBQUssa0JBQWtCLE9BQU8sSUFBSTtBQUFBLElBQ25DLE9BQU87QUFDTixXQUFLLGtCQUFrQixPQUFPLElBQUk7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFBQSxFQUVPLE9BQU8sTUFBMEI7QUFDdkMsUUFBSSxtQkFBbUIsSUFBSSxHQUFHO0FBQzdCLFdBQUssNkJBQTZCLE9BQU8sSUFBSTtBQUFBLElBQzlDLFdBQVcsc0JBQXNCLElBQUksR0FBRztBQUN2QyxXQUFLLGtCQUFrQixPQUFPLElBQUk7QUFBQSxJQUNuQyxPQUFPO0FBQ04sV0FBSyxrQkFBa0IsT0FBTyxJQUFJO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQUEsRUFFTyxhQUFhLE1BQTZCLE1BQTJCO0FBQzNFLFVBQU0sWUFBWSxLQUFLLGFBQWE7QUFDcEMsUUFBSSxLQUFLLG9CQUFvQixXQUFXO0FBQ3ZDLFdBQUssYUFBYSxNQUFNLFNBQVM7QUFBQSxJQUNsQztBQUNBLFFBQUksS0FBSyxVQUFVLE1BQU07QUFDeEIsV0FBSyxRQUFRLEtBQUssV0FBVyxLQUFLLHFCQUFxQixLQUFLLGlCQUFpQjtBQUFBLElBQzlFO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEsYUFBYSxNQUFvQixpQkFBK0I7QUFDdkUsUUFBSSxtQkFBbUIsSUFBSSxHQUFHO0FBQzdCLFdBQUssNkJBQTZCLFlBQVksTUFBTSxlQUFlO0FBQUEsSUFDcEUsV0FBVyxzQkFBc0IsSUFBSSxHQUFHO0FBQ3ZDLFdBQUssa0JBQWtCLFlBQVksTUFBTSxlQUFlO0FBQUEsSUFDekQsT0FBTztBQUNOLFdBQUssa0JBQWtCLFlBQVksTUFBTSxlQUFlO0FBQUEsSUFDekQ7QUFBQSxFQUNEO0FBQUEsRUFFTyxjQUFjLFFBQWdCLFFBQWdCLFlBQW9CLGtCQUFpQztBQUN6RyxTQUFLLGtCQUFrQixjQUFjLFFBQVEsUUFBUSxZQUFZLGdCQUFnQjtBQUNqRixTQUFLLGtCQUFrQixjQUFjLFFBQVEsUUFBUSxZQUFZLGdCQUFnQjtBQUNqRixTQUFLLDZCQUE2QixjQUFjLFFBQVEsUUFBUSxZQUFZLGdCQUFnQjtBQUFBLEVBQzdGO0FBQ0Q7QUFFQSxTQUFTLGVBQWUsV0FBMkI7QUFDbEQsU0FBTyxVQUFVLFFBQVEsa0JBQWtCLEdBQUc7QUFDL0M7QUFFQSxNQUFNLGtCQUFzRDtBQUFBLEVBSTNELFlBQVksU0FBbUM7QUFDOUMsU0FBSyxRQUFRLFFBQVEsU0FBUztBQUM5QixTQUFLLFlBQVksUUFBUSxhQUFhO0FBQUEsRUFFdkM7QUFDRDtBQUVPLE1BQU0sNENBQTRDLGtCQUFrQjtBQUFBLEVBSTFFLFlBQVksU0FBcUQ7QUFDaEUsVUFBTSxPQUFPO0FBQ2IsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxXQUFZLE9BQU8sUUFBUSxhQUFhLFdBQVcsUUFBUSxXQUFXLE1BQU0sa0JBQWtCO0FBQUEsRUFDcEc7QUFBQSxFQUVPLFNBQVMsT0FBNEI7QUFDM0MsUUFBSSxDQUFDLEtBQUssZ0JBQWdCO0FBQ3pCLFVBQUksT0FBTyxNQUFNLElBQUksS0FBSyxLQUFLLFdBQVc7QUFDekMsYUFBSyxpQkFBaUIsS0FBSyxjQUFjLEtBQUssV0FBVyxLQUFLO0FBQUEsTUFDL0QsT0FBTztBQUNOLGFBQUssaUJBQWlCLEtBQUssY0FBYyxLQUFLLE9BQU8sS0FBSztBQUFBLE1BQzNEO0FBQUEsSUFDRDtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLHdCQUE4QjtBQUNwQyxTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxjQUFjLE9BQTRCLE9BQTRCO0FBQzdFLFFBQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLElBQUksUUFBUSxNQUFNLFNBQVMsTUFBTSxFQUFFLElBQUk7QUFDN0MsUUFBSSxDQUFDLEdBQUc7QUFDUCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sRUFBRSxTQUFTO0FBQUEsRUFDbkI7QUFDRDtBQUVPLE1BQU0sa0NBQWtDO0FBQUEsRUFJOUMsWUFBWSxTQUFzRTtBQUNqRixTQUFLLFdBQVcsU0FBUyxZQUFZLE1BQU0sZ0JBQWdCO0FBQzNELFNBQUssY0FBYyxTQUFTO0FBQUEsRUFDN0I7QUFDRDtBQUVPLE1BQU0sc0NBQXNDLGtCQUFrQjtBQUFBLEVBTXBFLFlBQVksU0FBK0M7QUFDMUQsVUFBTSxPQUFPO0FBQ2IsU0FBSyxXQUFXLFFBQVE7QUFDeEIsU0FBSyxxQkFBcUIsUUFBUSxzQkFBc0I7QUFDeEQsU0FBSyxvQkFBb0IsUUFBUSxxQkFBcUI7QUFBQSxFQUN2RDtBQUFBLEVBRU8sU0FBUyxPQUF1QztBQUN0RCxRQUFJLENBQUMsS0FBSyxnQkFBZ0I7QUFDekIsVUFBSSxPQUFPLE1BQU0sSUFBSSxLQUFLLEtBQUssV0FBVztBQUN6QyxhQUFLLGlCQUFpQixLQUFLLGNBQWMsS0FBSyxXQUFXLEtBQUs7QUFBQSxNQUMvRCxPQUFPO0FBQ04sYUFBSyxpQkFBaUIsS0FBSyxjQUFjLEtBQUssT0FBTyxLQUFLO0FBQUEsTUFDM0Q7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRU8sd0JBQThCO0FBQ3BDLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFBQSxFQUVRLGNBQWMsT0FBNEIsT0FBdUM7QUFDeEYsUUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixhQUFPLE1BQU0sUUFBUSxLQUFLO0FBQUEsSUFDM0I7QUFDQSxXQUFPLE1BQU0sU0FBUyxNQUFNLEVBQUU7QUFBQSxFQUMvQjtBQUNEO0FBRU8sTUFBTSxtQ0FBd0U7QUFBQSxFQUNwRixPQUFjLEtBQUssU0FBd0U7QUFDMUYsUUFBSSxtQkFBbUIsb0NBQW9DO0FBQzFELGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxJQUFJLG1DQUFtQyxPQUFPO0FBQUEsRUFDdEQ7QUFBQSxFQVNRLFlBQVksU0FBb0M7QUFDdkQsU0FBSyxVQUFVLFFBQVEsV0FBVztBQUNsQyxTQUFLLFNBQVMsUUFBUSxVQUFVO0FBQ2hDLFNBQUssa0JBQWtCLFFBQVEsbUJBQW1CO0FBQ2xELFNBQUssc0NBQXNDLFFBQVEsdUNBQXVDO0FBQzFGLFNBQUssZUFBZSxRQUFRLGdCQUFnQjtBQUM1QyxTQUFLLGNBQWMsUUFBUSxlQUFlO0FBQUEsRUFDM0M7QUFDRDtBQUVPLE1BQU0sdUJBQWdFO0FBQUEsRUFJNUUsT0FBYyxTQUFTLFNBQWdFO0FBQ3RGLFdBQU8sSUFBSSx1QkFBdUIsT0FBTztBQUFBLEVBQzFDO0FBQUEsRUFFQSxPQUFjLGNBQWMsU0FBZ0U7QUFDM0YsV0FBTyxJQUFJLHVCQUF1QixPQUFPO0FBQUEsRUFDMUM7QUFBQSxFQXNDUSxZQUFZLFNBQXdDO0FBQzNELFNBQUssY0FBYyxRQUFRO0FBQzNCLFNBQUssaUJBQWlCLFFBQVEsaUJBQWlCLGVBQWUsUUFBUSxjQUFjLElBQUk7QUFDeEYsU0FBSyx1QkFBdUIsUUFBUSx3QkFBd0I7QUFDNUQsU0FBSyxrQkFBa0IsUUFBUSxtQkFBbUI7QUFDbEQsU0FBSyxlQUFlLFFBQVEsZ0JBQWdCO0FBQzVDLFNBQUssYUFBYSxRQUFRLGNBQWMsTUFBTSx1QkFBdUI7QUFDckUsU0FBSyxTQUFTLFFBQVEsVUFBVTtBQUNoQyxTQUFLLFlBQVksUUFBUSxZQUFZLGVBQWUsUUFBUSxTQUFTLElBQUk7QUFDekUsU0FBSyw0QkFBNEIsUUFBUSw2QkFBNkI7QUFDdEUsU0FBSyxlQUFlLFFBQVEsZ0JBQWdCO0FBQzVDLFNBQUssMEJBQTBCLFFBQVEsMkJBQTJCO0FBQ2xFLFNBQUsseUJBQXlCLFFBQVEsMEJBQTBCO0FBQ2hFLFNBQUssY0FBYyxRQUFRLGVBQWU7QUFDMUMsU0FBSyxhQUFhLFFBQVEsYUFBYSxLQUFLLElBQUksUUFBUSxZQUFZLG1CQUFtQixJQUFJO0FBQzNGLFNBQUssV0FBVyxRQUFRLFlBQVk7QUFDcEMsU0FBSyxjQUFjLENBQUMsQ0FBQyxRQUFRLFlBQVksQ0FBQyxDQUFDLFFBQVEsY0FBYyxDQUFDLENBQUMsUUFBUSxjQUFjLENBQUMsQ0FBQyxRQUFRO0FBQ25HLFNBQUssa0JBQWtCLFFBQVEsbUJBQW1CO0FBQ2xELFNBQUssd0JBQXdCLFFBQVEseUJBQXlCO0FBQzlELFNBQUssZ0JBQWdCLFFBQVEsZ0JBQWdCLElBQUksb0NBQW9DLFFBQVEsYUFBYSxJQUFJO0FBQzlHLFNBQUssVUFBVSxRQUFRLFVBQVUsSUFBSSw4QkFBOEIsUUFBUSxPQUFPLElBQUk7QUFDdEYsU0FBSyxjQUFjLFFBQVEsdUJBQXVCLElBQUksa0NBQWtDLFFBQVEsV0FBVyxJQUFJO0FBQy9HLFNBQUssdUJBQXVCLFFBQVEsdUJBQXVCLGVBQWUsUUFBUSxvQkFBb0IsSUFBSTtBQUMxRyxTQUFLLDRCQUE0QixRQUFRLDRCQUE0QixlQUFlLFFBQVEseUJBQXlCLElBQUk7QUFDekgsU0FBSyxzQkFBc0IsUUFBUSxzQkFBc0IsZUFBZSxRQUFRLG1CQUFtQixJQUFJO0FBQ3ZHLFNBQUssMEJBQTBCLFFBQVEsMEJBQTBCLFFBQVEseUJBQXlCLFFBQVEsdUJBQXVCLElBQUk7QUFDckksU0FBSywrQkFBK0IsUUFBUSwrQkFBK0IsZUFBZSxRQUFRLDRCQUE0QixJQUFJO0FBQ2xJLFNBQUssa0JBQWtCLFFBQVEsa0JBQWtCLGVBQWUsUUFBUSxlQUFlLElBQUk7QUFDM0YsU0FBSyxrQkFBa0IsUUFBUSxrQkFBa0IsZUFBZSxRQUFRLGVBQWUsSUFBSTtBQUMzRixTQUFLLHNDQUFzQyxRQUFRLHVDQUF1QztBQUMxRixTQUFLLHlCQUF5QixRQUFRLHlCQUF5QixlQUFlLFFBQVEsc0JBQXNCLElBQUk7QUFDaEgsU0FBSyx3QkFBd0IsUUFBUSx3QkFBd0IsZUFBZSxRQUFRLHFCQUFxQixJQUFJO0FBQzdHLFNBQUssUUFBUSxRQUFRLFFBQVEsbUNBQW1DLEtBQUssUUFBUSxLQUFLLElBQUk7QUFDdEYsU0FBSyxTQUFTLFFBQVEsU0FBUyxtQ0FBbUMsS0FBSyxRQUFRLE1BQU0sSUFBSTtBQUN6RixTQUFLLHNCQUFzQixRQUFRLHVCQUF1QjtBQUMxRCxTQUFLLHFCQUFxQixRQUFRLHNCQUFzQjtBQUN4RCxTQUFLLGdCQUFnQixRQUFRLGlCQUFpQjtBQUFBLEVBQy9DO0FBQ0Q7QUFDQSx1QkFBdUIsUUFBUSx1QkFBdUIsU0FBUyxFQUFFLGFBQWEsUUFBUSxDQUFDO0FBS3ZGLE1BQU0sd0JBQXdCO0FBQUEsRUFDN0IsdUJBQXVCLFNBQVMsRUFBRSxhQUFhLG1EQUFtRCxZQUFZLE1BQU0sdUJBQXVCLDZCQUE2QixDQUFDO0FBQUEsRUFDekssdUJBQXVCLFNBQVMsRUFBRSxhQUFhLGtEQUFrRCxZQUFZLE1BQU0sdUJBQXVCLDRCQUE0QixDQUFDO0FBQUEsRUFDdkssdUJBQXVCLFNBQVMsRUFBRSxhQUFhLCtDQUErQyxZQUFZLE1BQU0sdUJBQXVCLDBCQUEwQixDQUFDO0FBQUEsRUFDbEssdUJBQXVCLFNBQVMsRUFBRSxhQUFhLDhDQUE4QyxZQUFZLE1BQU0sdUJBQXVCLHlCQUF5QixDQUFDO0FBQ2pLO0FBRUEsU0FBUyxrQkFBa0IsU0FBZ0U7QUFDMUYsTUFBSSxtQkFBbUIsd0JBQXdCO0FBQzlDLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyx1QkFBdUIsY0FBYyxPQUFPO0FBQ3BEO0FBR0EsTUFBTSxvQ0FBb0MsV0FBVztBQUFBLEVBZXBELFlBQTZCLGtCQUFtTjtBQUMvTyxVQUFNO0FBRHNCO0FBYjdCLFNBQWlCLFVBQWtELEtBQUssVUFBVSxJQUFJLFFBQXVDLENBQUM7QUFDOUgsU0FBZ0IsUUFBOEMsS0FBSyxRQUFRO0FBTTNFLFNBQVEsNkJBQWlEO0FBQ3pELFNBQVEsdUJBQXdFO0FBQ2hGLFNBQVEscUJBQW9FO0FBTTNFLFNBQUssZUFBZTtBQUNwQixTQUFLLHNCQUFzQjtBQUMzQixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLHdCQUF3QjtBQUM3QixTQUFLLHNCQUFzQjtBQUMzQixTQUFLLHFCQUFxQjtBQUFBLEVBQzNCO0FBQUEsRUFFQSxlQUF3QjtBQUN2QixXQUFPLEtBQUssUUFBUSxhQUFhO0FBQUEsRUFDbEM7QUFBQSxFQUVPLG9CQUEwQjtBQUNoQyxTQUFLO0FBQUEsRUFDTjtBQUFBLEVBRU8sa0JBQXdCO0FBQzlCLFNBQUs7QUFDTCxRQUFJLEtBQUssaUJBQWlCLEdBQUc7QUFDNUIsVUFBSSxLQUFLLHFCQUFxQjtBQUM3QixhQUFLLE9BQU87QUFBQSxNQUNiO0FBRUEsV0FBSyw0QkFBNEIsTUFBTTtBQUN2QyxXQUFLLDZCQUE2QjtBQUNsQyxXQUFLLHNCQUFzQixNQUFNO0FBQ2pDLFdBQUssdUJBQXVCO0FBQzVCLFdBQUssb0JBQW9CLE1BQU07QUFDL0IsV0FBSyxxQkFBcUI7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLGlDQUFpQyxZQUEwQjtBQUNqRSxRQUFJLENBQUMsS0FBSyw0QkFBNEI7QUFDckMsV0FBSyw2QkFBNkIsb0JBQUksSUFBSTtBQUFBLElBQzNDO0FBQ0EsU0FBSywyQkFBMkIsSUFBSSxVQUFVO0FBQUEsRUFDL0M7QUFBQSxFQUVPLHFDQUFxQyxTQUFpQixjQUFzQixZQUFvQixZQUFpQztBQUN2SSxRQUFJLENBQUMsS0FBSyxzQkFBc0I7QUFDL0IsV0FBSyx1QkFBdUIsSUFBSSxXQUF5QyxDQUFDLEdBQUcsNkJBQTZCLEtBQUs7QUFBQSxJQUNoSDtBQUNBLFNBQUsscUJBQXFCLElBQUksSUFBSSw2QkFBNkIsU0FBUyxjQUFjLFlBQVksVUFBVSxDQUFDO0FBQUEsRUFDOUc7QUFBQSxFQUVPLCtCQUErQixTQUFpQixjQUFzQixZQUEwQjtBQUN0RyxRQUFJLENBQUMsS0FBSyxvQkFBb0I7QUFDN0IsV0FBSyxxQkFBcUIsSUFBSSxXQUF1QyxDQUFDLEdBQUcsMkJBQTJCLEtBQUs7QUFBQSxJQUMxRztBQUNBLFNBQUssbUJBQW1CLElBQUksSUFBSSwyQkFBMkIsU0FBUyxjQUFjLFVBQVUsQ0FBQztBQUFBLEVBQzlGO0FBQUEsRUFFTyxxQkFBcUIsU0FBdUM7QUFDbEUsU0FBSyxvQkFBb0IsQ0FBQyxDQUFDLFFBQVEsU0FBUztBQUM1QyxTQUFLLDBCQUEwQixDQUFDLENBQUMsUUFBUSxlQUFlO0FBQ3hELFNBQUssd0JBQXdCLENBQUMsQ0FBQyxRQUFRO0FBQ3ZDLFNBQUssdUJBQXVCLENBQUMsQ0FBQyxRQUFRO0FBQ3RDLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVPLE9BQWE7QUFDbkIsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyx3QkFBd0I7QUFDN0IsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRVEsVUFBVTtBQUNqQixRQUFJLEtBQUssaUJBQWlCLEdBQUc7QUFDNUIsV0FBSyxPQUFPO0FBQUEsSUFDYixPQUFPO0FBQ04sV0FBSyxzQkFBc0I7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFNBQVM7QUFDaEIsU0FBSyxpQkFBaUIsS0FBSyw0QkFBNEIsS0FBSyxzQkFBc0IsS0FBSyxrQkFBa0I7QUFFekcsVUFBTSxRQUF1QztBQUFBLE1BQzVDLGdCQUFnQixLQUFLO0FBQUEsTUFDckIsc0JBQXNCLEtBQUs7QUFBQSxNQUMzQixvQkFBb0IsS0FBSztBQUFBLE1BQ3pCLG1CQUFtQixLQUFLO0FBQUEsSUFDekI7QUFDQSxTQUFLLHNCQUFzQjtBQUMzQixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLHdCQUF3QjtBQUM3QixTQUFLLHNCQUFzQjtBQUMzQixTQUFLLFFBQVEsS0FBSyxLQUFLO0FBQUEsRUFDeEI7QUFDRDtBQUlBLE1BQU0sZ0NBQWdDLFdBQVc7QUFBQSxFQVFoRCxjQUFjO0FBQ2IsVUFBTTtBQVBQLFNBQWlCLFdBQXFELEtBQUssVUFBVSxJQUFJLFFBQXlDLENBQUM7QUFDbkksU0FBZ0IsUUFBZ0QsS0FBSyxTQUFTO0FBTzdFLFNBQUssZUFBZTtBQUNwQixTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFTyxlQUF3QjtBQUM5QixXQUFPLEtBQUssU0FBUyxhQUFhO0FBQUEsRUFDbkM7QUFBQSxFQUVPLG9CQUEwQjtBQUNoQyxTQUFLO0FBQUEsRUFDTjtBQUFBLEVBRU8sZ0JBQWdCLHFCQUF5QyxNQUFZO0FBQzNFLFNBQUs7QUFDTCxRQUFJLEtBQUssaUJBQWlCLEdBQUc7QUFDNUIsVUFBSSxLQUFLLG1CQUFtQixNQUFNO0FBQ2pDLGFBQUssZUFBZSx1QkFBdUIscUJBQXFCO0FBQ2hFLGNBQU0sSUFBSSxLQUFLO0FBQ2YsYUFBSyxpQkFBaUI7QUFDdEIsYUFBSyxTQUFTLEtBQUssQ0FBQztBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLEtBQUssR0FBMEM7QUFDckQsUUFBSSxLQUFLLGVBQWUsR0FBRztBQUMxQixVQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLGFBQUssaUJBQWlCLEtBQUssZUFBZSxNQUFNLENBQUM7QUFBQSxNQUNsRCxPQUFPO0FBQ04sYUFBSyxpQkFBaUI7QUFBQSxNQUN2QjtBQUNBO0FBQUEsSUFDRDtBQUNBLFNBQUssU0FBUyxLQUFLLENBQUM7QUFBQSxFQUNyQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJTdHJpbmdPZmZzZXRWYWxpZGF0aW9uVHlwZSIsICJ0b2tlbnMiXQp9Cg==
