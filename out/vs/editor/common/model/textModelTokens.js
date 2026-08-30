import { runWhenGlobalIdle } from "../../../base/common/async.js";
import { BugIndicatingError, onUnexpectedError } from "../../../base/common/errors.js";
import { setTimeout0 } from "../../../base/common/platform.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { countEOL } from "../core/misc/eolCounter.js";
import { LineRange } from "../core/ranges/lineRange.js";
import { OffsetRange } from "../core/ranges/offsetRange.js";
import { StandardTokenType } from "../encodedTokenAttributes.js";
import { nullTokenizeEncoded } from "../languages/nullTokenize.js";
import { FixedArray } from "./fixedArray.js";
import { ContiguousMultilineTokensBuilder } from "../tokens/contiguousMultilineTokensBuilder.js";
import { LineTokens } from "../tokens/lineTokens.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["CHEAP_TOKENIZATION_LENGTH_LIMIT"] = 2048] = "CHEAP_TOKENIZATION_LENGTH_LIMIT";
  return Constants2;
})(Constants || {});
class TokenizerWithStateStore {
  constructor(lineCount, tokenizationSupport) {
    this.tokenizationSupport = tokenizationSupport;
    this.initialState = this.tokenizationSupport.getInitialState();
    this.store = new TrackingTokenizationStateStore(lineCount);
  }
  getStartState(lineNumber) {
    return this.store.getStartState(lineNumber, this.initialState);
  }
  getFirstInvalidLine() {
    return this.store.getFirstInvalidLine(this.initialState);
  }
}
class TokenizerWithStateStoreAndTextModel extends TokenizerWithStateStore {
  constructor(lineCount, tokenizationSupport, _textModel, _languageIdCodec) {
    super(lineCount, tokenizationSupport);
    this._textModel = _textModel;
    this._languageIdCodec = _languageIdCodec;
  }
  updateTokensUntilLine(builder, lineNumber) {
    const languageId = this._textModel.getLanguageId();
    while (true) {
      const lineToTokenize = this.getFirstInvalidLine();
      if (!lineToTokenize || lineToTokenize.lineNumber > lineNumber) {
        break;
      }
      const text = this._textModel.getLineContent(lineToTokenize.lineNumber);
      const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, lineToTokenize.startState);
      builder.add(lineToTokenize.lineNumber, r.tokens);
      this.store.setEndState(lineToTokenize.lineNumber, r.endState);
    }
  }
  /** assumes state is up to date */
  getTokenTypeIfInsertingCharacter(position, character) {
    const lineStartState = this.getStartState(position.lineNumber);
    if (!lineStartState) {
      return StandardTokenType.Other;
    }
    const languageId = this._textModel.getLanguageId();
    const lineContent = this._textModel.getLineContent(position.lineNumber);
    const text = lineContent.substring(0, position.column - 1) + character + lineContent.substring(position.column - 1);
    const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, lineStartState);
    const lineTokens = new LineTokens(r.tokens, text, this._languageIdCodec);
    if (lineTokens.getCount() === 0) {
      return StandardTokenType.Other;
    }
    const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
    return lineTokens.getStandardTokenType(tokenIndex);
  }
  /** assumes state is up to date */
  tokenizeLinesAt(lineNumber, lines) {
    const lineStartState = this.getStartState(lineNumber);
    if (!lineStartState) {
      return null;
    }
    const languageId = this._textModel.getLanguageId();
    const result = [];
    let state = lineStartState;
    for (const line of lines) {
      const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, line, true, state);
      result.push(new LineTokens(r.tokens, line, this._languageIdCodec));
      state = r.endState;
    }
    return result;
  }
  hasAccurateTokensForLine(lineNumber) {
    const firstInvalidLineNumber = this.store.getFirstInvalidEndStateLineNumberOrMax();
    return lineNumber < firstInvalidLineNumber;
  }
  isCheapToTokenize(lineNumber) {
    const firstInvalidLineNumber = this.store.getFirstInvalidEndStateLineNumberOrMax();
    if (lineNumber < firstInvalidLineNumber) {
      return true;
    }
    if (lineNumber === firstInvalidLineNumber && this._textModel.getLineLength(lineNumber) < 2048 /* CHEAP_TOKENIZATION_LENGTH_LIMIT */) {
      return true;
    }
    return false;
  }
  /**
   * The result is not cached.
   */
  tokenizeHeuristically(builder, startLineNumber, endLineNumber) {
    if (endLineNumber <= this.store.getFirstInvalidEndStateLineNumberOrMax()) {
      return { heuristicTokens: false };
    }
    if (startLineNumber <= this.store.getFirstInvalidEndStateLineNumberOrMax()) {
      this.updateTokensUntilLine(builder, endLineNumber);
      return { heuristicTokens: false };
    }
    let state = this.guessStartState(startLineNumber);
    const languageId = this._textModel.getLanguageId();
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const text = this._textModel.getLineContent(lineNumber);
      const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, text, true, state);
      builder.add(lineNumber, r.tokens);
      state = r.endState;
    }
    return { heuristicTokens: true };
  }
  guessStartState(lineNumber) {
    let { likelyRelevantLines, initialState } = findLikelyRelevantLines(this._textModel, lineNumber, this);
    if (!initialState) {
      initialState = this.tokenizationSupport.getInitialState();
    }
    const languageId = this._textModel.getLanguageId();
    let state = initialState;
    for (const line of likelyRelevantLines) {
      const r = safeTokenize(this._languageIdCodec, languageId, this.tokenizationSupport, line, false, state);
      state = r.endState;
    }
    return state;
  }
}
function findLikelyRelevantLines(model, lineNumber, store) {
  let nonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
  const likelyRelevantLines = [];
  let initialState = null;
  for (let i = lineNumber - 1; nonWhitespaceColumn > 1 && i >= 1; i--) {
    const newNonWhitespaceIndex = model.getLineFirstNonWhitespaceColumn(i);
    if (newNonWhitespaceIndex === 0) {
      continue;
    }
    if (newNonWhitespaceIndex < nonWhitespaceColumn) {
      likelyRelevantLines.push(model.getLineContent(i));
      nonWhitespaceColumn = newNonWhitespaceIndex;
      initialState = store?.getStartState(i);
      if (initialState) {
        break;
      }
    }
  }
  likelyRelevantLines.reverse();
  return { likelyRelevantLines, initialState: initialState ?? void 0 };
}
class TrackingTokenizationStateStore {
  constructor(lineCount) {
    this.lineCount = lineCount;
    this._tokenizationStateStore = new TokenizationStateStore();
    this._invalidEndStatesLineNumbers = new RangePriorityQueueImpl();
    this._invalidEndStatesLineNumbers.addRange(new OffsetRange(1, lineCount + 1));
  }
  getEndState(lineNumber) {
    return this._tokenizationStateStore.getEndState(lineNumber);
  }
  /**
   * @returns if the end state has changed.
   */
  setEndState(lineNumber, state) {
    if (!state) {
      throw new BugIndicatingError("Cannot set null/undefined state");
    }
    this._invalidEndStatesLineNumbers.delete(lineNumber);
    const r = this._tokenizationStateStore.setEndState(lineNumber, state);
    if (r && lineNumber < this.lineCount) {
      this._invalidEndStatesLineNumbers.addRange(new OffsetRange(lineNumber + 1, lineNumber + 2));
    }
    return r;
  }
  acceptChange(range, newLineCount) {
    this.lineCount += newLineCount - range.length;
    this._tokenizationStateStore.acceptChange(range, newLineCount);
    this._invalidEndStatesLineNumbers.addRangeAndResize(new OffsetRange(range.startLineNumber, range.endLineNumberExclusive), newLineCount);
  }
  acceptChanges(changes) {
    for (const c of changes) {
      const [eolCount] = countEOL(c.text);
      this.acceptChange(new LineRange(c.range.startLineNumber, c.range.endLineNumber + 1), eolCount + 1);
    }
  }
  invalidateEndStateRange(range) {
    this._invalidEndStatesLineNumbers.addRange(new OffsetRange(range.startLineNumber, range.endLineNumberExclusive));
  }
  getFirstInvalidEndStateLineNumber() {
    return this._invalidEndStatesLineNumbers.min;
  }
  getFirstInvalidEndStateLineNumberOrMax() {
    return this.getFirstInvalidEndStateLineNumber() || Number.MAX_SAFE_INTEGER;
  }
  allStatesValid() {
    return this._invalidEndStatesLineNumbers.min === null;
  }
  getStartState(lineNumber, initialState) {
    if (lineNumber === 1) {
      return initialState;
    }
    return this.getEndState(lineNumber - 1);
  }
  getFirstInvalidLine(initialState) {
    const lineNumber = this.getFirstInvalidEndStateLineNumber();
    if (lineNumber === null) {
      return null;
    }
    const startState = this.getStartState(lineNumber, initialState);
    if (!startState) {
      throw new BugIndicatingError("Start state must be defined");
    }
    return { lineNumber, startState };
  }
}
class TokenizationStateStore {
  constructor() {
    this._lineEndStates = new FixedArray(null);
  }
  getEndState(lineNumber) {
    return this._lineEndStates.get(lineNumber);
  }
  setEndState(lineNumber, state) {
    const oldState = this._lineEndStates.get(lineNumber);
    if (oldState && oldState.equals(state)) {
      return false;
    }
    this._lineEndStates.set(lineNumber, state);
    return true;
  }
  acceptChange(range, newLineCount) {
    let length = range.length;
    if (newLineCount > 0 && length > 0) {
      length--;
      newLineCount--;
    }
    this._lineEndStates.replace(range.startLineNumber, length, newLineCount);
  }
  acceptChanges(changes) {
    for (const c of changes) {
      const [eolCount] = countEOL(c.text);
      this.acceptChange(new LineRange(c.range.startLineNumber, c.range.endLineNumber + 1), eolCount + 1);
    }
  }
}
class RangePriorityQueueImpl {
  constructor() {
    this._ranges = [];
  }
  getRanges() {
    return this._ranges;
  }
  get min() {
    if (this._ranges.length === 0) {
      return null;
    }
    return this._ranges[0].start;
  }
  removeMin() {
    if (this._ranges.length === 0) {
      return null;
    }
    const range = this._ranges[0];
    if (range.start + 1 === range.endExclusive) {
      this._ranges.shift();
    } else {
      this._ranges[0] = new OffsetRange(range.start + 1, range.endExclusive);
    }
    return range.start;
  }
  delete(value) {
    const idx = this._ranges.findIndex((r) => r.contains(value));
    if (idx !== -1) {
      const range = this._ranges[idx];
      if (range.start === value) {
        if (range.endExclusive === value + 1) {
          this._ranges.splice(idx, 1);
        } else {
          this._ranges[idx] = new OffsetRange(value + 1, range.endExclusive);
        }
      } else {
        if (range.endExclusive === value + 1) {
          this._ranges[idx] = new OffsetRange(range.start, value);
        } else {
          this._ranges.splice(idx, 1, new OffsetRange(range.start, value), new OffsetRange(value + 1, range.endExclusive));
        }
      }
    }
  }
  addRange(range) {
    OffsetRange.addRange(range, this._ranges);
  }
  addRangeAndResize(range, newLength) {
    let idxFirstMightBeIntersecting = 0;
    while (!(idxFirstMightBeIntersecting >= this._ranges.length || range.start <= this._ranges[idxFirstMightBeIntersecting].endExclusive)) {
      idxFirstMightBeIntersecting++;
    }
    let idxFirstIsAfter = idxFirstMightBeIntersecting;
    while (!(idxFirstIsAfter >= this._ranges.length || range.endExclusive < this._ranges[idxFirstIsAfter].start)) {
      idxFirstIsAfter++;
    }
    const delta = newLength - range.length;
    for (let i = idxFirstIsAfter; i < this._ranges.length; i++) {
      this._ranges[i] = this._ranges[i].delta(delta);
    }
    if (idxFirstMightBeIntersecting === idxFirstIsAfter) {
      const newRange = new OffsetRange(range.start, range.start + newLength);
      if (!newRange.isEmpty) {
        this._ranges.splice(idxFirstMightBeIntersecting, 0, newRange);
      }
    } else {
      const start = Math.min(range.start, this._ranges[idxFirstMightBeIntersecting].start);
      const endEx = Math.max(range.endExclusive, this._ranges[idxFirstIsAfter - 1].endExclusive);
      const newRange = new OffsetRange(start, endEx + delta);
      if (!newRange.isEmpty) {
        this._ranges.splice(idxFirstMightBeIntersecting, idxFirstIsAfter - idxFirstMightBeIntersecting, newRange);
      } else {
        this._ranges.splice(idxFirstMightBeIntersecting, idxFirstIsAfter - idxFirstMightBeIntersecting);
      }
    }
  }
  toString() {
    return this._ranges.map((r) => r.toString()).join(" + ");
  }
}
function safeTokenize(languageIdCodec, languageId, tokenizationSupport, text, hasEOL, state) {
  let r = null;
  if (tokenizationSupport) {
    try {
      r = tokenizationSupport.tokenizeEncoded(text, hasEOL, state.clone());
    } catch (e) {
      onUnexpectedError(e);
    }
  }
  if (!r) {
    r = nullTokenizeEncoded(languageIdCodec.encodeLanguageId(languageId), state);
  }
  LineTokens.convertToEndOffset(r.tokens, text.length);
  return r;
}
class DefaultBackgroundTokenizer {
  constructor(_tokenizerWithStateStore, _backgroundTokenStore) {
    this._tokenizerWithStateStore = _tokenizerWithStateStore;
    this._backgroundTokenStore = _backgroundTokenStore;
    this._isDisposed = false;
    this._isScheduled = false;
  }
  dispose() {
    this._isDisposed = true;
  }
  handleChanges() {
    this._beginBackgroundTokenization();
  }
  _beginBackgroundTokenization() {
    if (this._isScheduled || !this._tokenizerWithStateStore._textModel.isAttachedToEditor() || !this._hasLinesToTokenize()) {
      return;
    }
    this._isScheduled = true;
    runWhenGlobalIdle((deadline) => {
      this._isScheduled = false;
      this._backgroundTokenizeWithDeadline(deadline);
    });
  }
  /**
   * Tokenize until the deadline occurs, but try to yield every 1-2ms.
   */
  _backgroundTokenizeWithDeadline(deadline) {
    const endTime = Date.now() + deadline.timeRemaining();
    const execute = () => {
      if (this._isDisposed || !this._tokenizerWithStateStore._textModel.isAttachedToEditor() || !this._hasLinesToTokenize()) {
        return;
      }
      this._backgroundTokenizeForAtLeast1ms();
      if (Date.now() < endTime) {
        setTimeout0(execute);
      } else {
        this._beginBackgroundTokenization();
      }
    };
    execute();
  }
  /**
   * Tokenize for at least 1ms.
   */
  _backgroundTokenizeForAtLeast1ms() {
    const lineCount = this._tokenizerWithStateStore._textModel.getLineCount();
    const builder = new ContiguousMultilineTokensBuilder();
    const sw = StopWatch.create(false);
    do {
      if (sw.elapsed() > 1) {
        break;
      }
      const tokenizedLineNumber = this._tokenizeOneInvalidLine(builder);
      if (tokenizedLineNumber >= lineCount) {
        break;
      }
    } while (this._hasLinesToTokenize());
    this._backgroundTokenStore.setTokens(builder.finalize());
    this.checkFinished();
  }
  _hasLinesToTokenize() {
    if (!this._tokenizerWithStateStore) {
      return false;
    }
    return !this._tokenizerWithStateStore.store.allStatesValid();
  }
  _tokenizeOneInvalidLine(builder) {
    const firstInvalidLine = this._tokenizerWithStateStore?.getFirstInvalidLine();
    if (!firstInvalidLine) {
      return this._tokenizerWithStateStore._textModel.getLineCount() + 1;
    }
    this._tokenizerWithStateStore.updateTokensUntilLine(builder, firstInvalidLine.lineNumber);
    return firstInvalidLine.lineNumber;
  }
  checkFinished() {
    if (this._isDisposed) {
      return;
    }
    if (this._tokenizerWithStateStore.store.allStatesValid()) {
      this._backgroundTokenStore.backgroundTokenizationFinished();
    }
  }
  requestTokens(startLineNumber, endLineNumberExclusive) {
    this._tokenizerWithStateStore.store.invalidateEndStateRange(new LineRange(startLineNumber, endLineNumberExclusive));
  }
}
export {
  DefaultBackgroundTokenizer,
  RangePriorityQueueImpl,
  TokenizationStateStore,
  TokenizerWithStateStore,
  TokenizerWithStateStoreAndTextModel,
  TrackingTokenizationStateStore,
  findLikelyRelevantLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXHRleHRNb2RlbFRva2Vucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElkbGVEZWFkbGluZSwgcnVuV2hlbkdsb2JhbElkbGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IHNldFRpbWVvdXQwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGNvdW50RU9MIH0gZnJvbSAnLi4vY29yZS9taXNjL2VvbENvdW50ZXIuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkVG9rZW5UeXBlIH0gZnJvbSAnLi4vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0LCBJQmFja2dyb3VuZFRva2VuaXphdGlvblN0b3JlLCBJQmFja2dyb3VuZFRva2VuaXplciwgSUxhbmd1YWdlSWRDb2RlYywgSVN0YXRlLCBJVG9rZW5pemF0aW9uU3VwcG9ydCB9IGZyb20gJy4uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBudWxsVG9rZW5pemVFbmNvZGVkIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL251bGxUb2tlbml6ZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgRml4ZWRBcnJheSB9IGZyb20gJy4vZml4ZWRBcnJheS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDb250ZW50Q2hhbmdlIH0gZnJvbSAnLi9taXJyb3JUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ29udGlndW91c011bHRpbGluZVRva2Vuc0J1aWxkZXIgfSBmcm9tICcuLi90b2tlbnMvY29udGlndW91c011bHRpbGluZVRva2Vuc0J1aWxkZXIuanMnO1xuaW1wb3J0IHsgTGluZVRva2VucyB9IGZyb20gJy4uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHRDSEVBUF9UT0tFTklaQVRJT05fTEVOR1RIX0xJTUlUID0gMjA0OFxufVxuXG5leHBvcnQgY2xhc3MgVG9rZW5pemVyV2l0aFN0YXRlU3RvcmU8VFN0YXRlIGV4dGVuZHMgSVN0YXRlID0gSVN0YXRlPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5pdGlhbFN0YXRlO1xuXG5cdHB1YmxpYyByZWFkb25seSBzdG9yZTogVHJhY2tpbmdUb2tlbml6YXRpb25TdGF0ZVN0b3JlPFRTdGF0ZT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bGluZUNvdW50OiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0XG5cdCkge1xuXHRcdHRoaXMuaW5pdGlhbFN0YXRlID0gdGhpcy50b2tlbml6YXRpb25TdXBwb3J0LmdldEluaXRpYWxTdGF0ZSgpIGFzIFRTdGF0ZTtcblx0XHR0aGlzLnN0b3JlID0gbmV3IFRyYWNraW5nVG9rZW5pemF0aW9uU3RhdGVTdG9yZTxUU3RhdGU+KGxpbmVDb3VudCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3RhcnRTdGF0ZShsaW5lTnVtYmVyOiBudW1iZXIpOiBUU3RhdGUgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yZS5nZXRTdGFydFN0YXRlKGxpbmVOdW1iZXIsIHRoaXMuaW5pdGlhbFN0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGaXJzdEludmFsaWRMaW5lKCk6IHsgbGluZU51bWJlcjogbnVtYmVyOyBzdGFydFN0YXRlOiBUU3RhdGUgfSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLnN0b3JlLmdldEZpcnN0SW52YWxpZExpbmUodGhpcy5pbml0aWFsU3RhdGUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2tlbml6ZXJXaXRoU3RhdGVTdG9yZUFuZFRleHRNb2RlbDxUU3RhdGUgZXh0ZW5kcyBJU3RhdGUgPSBJU3RhdGU+IGV4dGVuZHMgVG9rZW5pemVyV2l0aFN0YXRlU3RvcmU8VFN0YXRlPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGxpbmVDb3VudDogbnVtYmVyLFxuXHRcdHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0LFxuXHRcdHB1YmxpYyByZWFkb25seSBfdGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHB1YmxpYyByZWFkb25seSBfbGFuZ3VhZ2VJZENvZGVjOiBJTGFuZ3VhZ2VJZENvZGVjXG5cdCkge1xuXHRcdHN1cGVyKGxpbmVDb3VudCwgdG9rZW5pemF0aW9uU3VwcG9ydCk7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlVG9rZW5zVW50aWxMaW5lKGJ1aWxkZXI6IENvbnRpZ3VvdXNNdWx0aWxpbmVUb2tlbnNCdWlsZGVyLCBsaW5lTnVtYmVyOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5fdGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKTtcblxuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCBsaW5lVG9Ub2tlbml6ZSA9IHRoaXMuZ2V0Rmlyc3RJbnZhbGlkTGluZSgpO1xuXHRcdFx0aWYgKCFsaW5lVG9Ub2tlbml6ZSB8fCBsaW5lVG9Ub2tlbml6ZS5saW5lTnVtYmVyID4gbGluZU51bWJlcikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGV4dCA9IHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lVG9Ub2tlbml6ZS5saW5lTnVtYmVyKTtcblxuXHRcdFx0Y29uc3QgciA9IHNhZmVUb2tlbml6ZSh0aGlzLl9sYW5ndWFnZUlkQ29kZWMsIGxhbmd1YWdlSWQsIHRoaXMudG9rZW5pemF0aW9uU3VwcG9ydCwgdGV4dCwgdHJ1ZSwgbGluZVRvVG9rZW5pemUuc3RhcnRTdGF0ZSk7XG5cdFx0XHRidWlsZGVyLmFkZChsaW5lVG9Ub2tlbml6ZS5saW5lTnVtYmVyLCByLnRva2Vucyk7XG5cdFx0XHR0aGlzLnN0b3JlLnNldEVuZFN0YXRlKGxpbmVUb1Rva2VuaXplLmxpbmVOdW1iZXIsIHIuZW5kU3RhdGUgYXMgVFN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHQvKiogYXNzdW1lcyBzdGF0ZSBpcyB1cCB0byBkYXRlICovXG5cdHB1YmxpYyBnZXRUb2tlblR5cGVJZkluc2VydGluZ0NoYXJhY3Rlcihwb3NpdGlvbjogUG9zaXRpb24sIGNoYXJhY3Rlcjogc3RyaW5nKTogU3RhbmRhcmRUb2tlblR5cGUge1xuXHRcdC8vIFRPRE9AaGVkaWV0OiB1c2UgdG9rZW5pemVMaW5lV2l0aEVkaXRcblx0XHRjb25zdCBsaW5lU3RhcnRTdGF0ZSA9IHRoaXMuZ2V0U3RhcnRTdGF0ZShwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRpZiAoIWxpbmVTdGFydFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gU3RhbmRhcmRUb2tlblR5cGUuT3RoZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMuX3RleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cblx0XHQvLyBDcmVhdGUgdGhlIHRleHQgYXMgaWYgYGNoYXJhY3RlcmAgd2FzIGluc2VydGVkXG5cdFx0Y29uc3QgdGV4dCA9IChcblx0XHRcdGxpbmVDb250ZW50LnN1YnN0cmluZygwLCBwb3NpdGlvbi5jb2x1bW4gLSAxKVxuXHRcdFx0KyBjaGFyYWN0ZXJcblx0XHRcdCsgbGluZUNvbnRlbnQuc3Vic3RyaW5nKHBvc2l0aW9uLmNvbHVtbiAtIDEpXG5cdFx0KTtcblxuXHRcdGNvbnN0IHIgPSBzYWZlVG9rZW5pemUodGhpcy5fbGFuZ3VhZ2VJZENvZGVjLCBsYW5ndWFnZUlkLCB0aGlzLnRva2VuaXphdGlvblN1cHBvcnQsIHRleHQsIHRydWUsIGxpbmVTdGFydFN0YXRlKTtcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gbmV3IExpbmVUb2tlbnMoci50b2tlbnMsIHRleHQsIHRoaXMuX2xhbmd1YWdlSWRDb2RlYyk7XG5cdFx0aWYgKGxpbmVUb2tlbnMuZ2V0Q291bnQoKSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuSW5kZXggPSBsaW5lVG9rZW5zLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQocG9zaXRpb24uY29sdW1uIC0gMSk7XG5cdFx0cmV0dXJuIGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleCk7XG5cdH1cblxuXHQvKiogYXNzdW1lcyBzdGF0ZSBpcyB1cCB0byBkYXRlICovXG5cdHB1YmxpYyB0b2tlbml6ZUxpbmVzQXQobGluZU51bWJlcjogbnVtYmVyLCBsaW5lczogc3RyaW5nW10pOiBMaW5lVG9rZW5zW10gfCBudWxsIHtcblx0XHRjb25zdCBsaW5lU3RhcnRTdGF0ZTogSVN0YXRlIHwgbnVsbCA9IHRoaXMuZ2V0U3RhcnRTdGF0ZShsaW5lTnVtYmVyKTtcblx0XHRpZiAoIWxpbmVTdGFydFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5fdGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRjb25zdCByZXN1bHQ6IExpbmVUb2tlbnNbXSA9IFtdO1xuXG5cdFx0bGV0IHN0YXRlID0gbGluZVN0YXJ0U3RhdGU7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG5cdFx0XHRjb25zdCByID0gc2FmZVRva2VuaXplKHRoaXMuX2xhbmd1YWdlSWRDb2RlYywgbGFuZ3VhZ2VJZCwgdGhpcy50b2tlbml6YXRpb25TdXBwb3J0LCBsaW5lLCB0cnVlLCBzdGF0ZSk7XG5cdFx0XHRyZXN1bHQucHVzaChuZXcgTGluZVRva2VucyhyLnRva2VucywgbGluZSwgdGhpcy5fbGFuZ3VhZ2VJZENvZGVjKSk7XG5cdFx0XHRzdGF0ZSA9IHIuZW5kU3RhdGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBoYXNBY2N1cmF0ZVRva2Vuc0ZvckxpbmUobGluZU51bWJlcjogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZmlyc3RJbnZhbGlkTGluZU51bWJlciA9IHRoaXMuc3RvcmUuZ2V0Rmlyc3RJbnZhbGlkRW5kU3RhdGVMaW5lTnVtYmVyT3JNYXgoKTtcblx0XHRyZXR1cm4gKGxpbmVOdW1iZXIgPCBmaXJzdEludmFsaWRMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBpc0NoZWFwVG9Ub2tlbml6ZShsaW5lTnVtYmVyOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBmaXJzdEludmFsaWRMaW5lTnVtYmVyID0gdGhpcy5zdG9yZS5nZXRGaXJzdEludmFsaWRFbmRTdGF0ZUxpbmVOdW1iZXJPck1heCgpO1xuXHRcdGlmIChsaW5lTnVtYmVyIDwgZmlyc3RJbnZhbGlkTGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChsaW5lTnVtYmVyID09PSBmaXJzdEludmFsaWRMaW5lTnVtYmVyXG5cdFx0XHQmJiB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKSA8IENvbnN0YW50cy5DSEVBUF9UT0tFTklaQVRJT05fTEVOR1RIX0xJTUlUKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHJlc3VsdCBpcyBub3QgY2FjaGVkLlxuXHQgKi9cblx0cHVibGljIHRva2VuaXplSGV1cmlzdGljYWxseShidWlsZGVyOiBDb250aWd1b3VzTXVsdGlsaW5lVG9rZW5zQnVpbGRlciwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlcik6IHsgaGV1cmlzdGljVG9rZW5zOiBib29sZWFuIH0ge1xuXHRcdGlmIChlbmRMaW5lTnVtYmVyIDw9IHRoaXMuc3RvcmUuZ2V0Rmlyc3RJbnZhbGlkRW5kU3RhdGVMaW5lTnVtYmVyT3JNYXgoKSkge1xuXHRcdFx0Ly8gbm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuIHsgaGV1cmlzdGljVG9rZW5zOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdGlmIChzdGFydExpbmVOdW1iZXIgPD0gdGhpcy5zdG9yZS5nZXRGaXJzdEludmFsaWRFbmRTdGF0ZUxpbmVOdW1iZXJPck1heCgpKSB7XG5cdFx0XHQvLyB0b2tlbml6YXRpb24gaGFzIHJlYWNoZWQgdGhlIHZpZXdwb3J0IHN0YXJ0Li4uXG5cdFx0XHR0aGlzLnVwZGF0ZVRva2Vuc1VudGlsTGluZShidWlsZGVyLCBlbmRMaW5lTnVtYmVyKTtcblx0XHRcdHJldHVybiB7IGhldXJpc3RpY1Rva2VuczogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRsZXQgc3RhdGUgPSB0aGlzLmd1ZXNzU3RhcnRTdGF0ZShzdGFydExpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSBlbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IHRleHQgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCByID0gc2FmZVRva2VuaXplKHRoaXMuX2xhbmd1YWdlSWRDb2RlYywgbGFuZ3VhZ2VJZCwgdGhpcy50b2tlbml6YXRpb25TdXBwb3J0LCB0ZXh0LCB0cnVlLCBzdGF0ZSk7XG5cdFx0XHRidWlsZGVyLmFkZChsaW5lTnVtYmVyLCByLnRva2Vucyk7XG5cdFx0XHRzdGF0ZSA9IHIuZW5kU3RhdGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgaGV1cmlzdGljVG9rZW5zOiB0cnVlIH07XG5cdH1cblxuXHRwcml2YXRlIGd1ZXNzU3RhcnRTdGF0ZShsaW5lTnVtYmVyOiBudW1iZXIpOiBJU3RhdGUge1xuXHRcdGxldCB7IGxpa2VseVJlbGV2YW50TGluZXMsIGluaXRpYWxTdGF0ZSB9ID0gZmluZExpa2VseVJlbGV2YW50TGluZXModGhpcy5fdGV4dE1vZGVsLCBsaW5lTnVtYmVyLCB0aGlzKTtcblxuXHRcdGlmICghaW5pdGlhbFN0YXRlKSB7XG5cdFx0XHRpbml0aWFsU3RhdGUgPSB0aGlzLnRva2VuaXphdGlvblN1cHBvcnQuZ2V0SW5pdGlhbFN0YXRlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMuX3RleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0bGV0IHN0YXRlID0gaW5pdGlhbFN0YXRlO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaWtlbHlSZWxldmFudExpbmVzKSB7XG5cdFx0XHRjb25zdCByID0gc2FmZVRva2VuaXplKHRoaXMuX2xhbmd1YWdlSWRDb2RlYywgbGFuZ3VhZ2VJZCwgdGhpcy50b2tlbml6YXRpb25TdXBwb3J0LCBsaW5lLCBmYWxzZSwgc3RhdGUpO1xuXHRcdFx0c3RhdGUgPSByLmVuZFN0YXRlO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRMaWtlbHlSZWxldmFudExpbmVzKG1vZGVsOiBJVGV4dE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIsIHN0b3JlPzogVG9rZW5pemVyV2l0aFN0YXRlU3RvcmUpOiB7IGxpa2VseVJlbGV2YW50TGluZXM6IHN0cmluZ1tdOyBpbml0aWFsU3RhdGU/OiBJU3RhdGUgfSB7XG5cdGxldCBub25XaGl0ZXNwYWNlQ29sdW1uID0gbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyKTtcblx0Y29uc3QgbGlrZWx5UmVsZXZhbnRMaW5lczogc3RyaW5nW10gPSBbXTtcblx0bGV0IGluaXRpYWxTdGF0ZTogSVN0YXRlIHwgbnVsbCB8IHVuZGVmaW5lZCA9IG51bGw7XG5cdGZvciAobGV0IGkgPSBsaW5lTnVtYmVyIC0gMTsgbm9uV2hpdGVzcGFjZUNvbHVtbiA+IDEgJiYgaSA+PSAxOyBpLS0pIHtcblx0XHRjb25zdCBuZXdOb25XaGl0ZXNwYWNlSW5kZXggPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGkpO1xuXHRcdC8vIElnbm9yZSBsaW5lcyBmdWxsIG9mIHdoaXRlc3BhY2Vcblx0XHRpZiAobmV3Tm9uV2hpdGVzcGFjZUluZGV4ID09PSAwKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKG5ld05vbldoaXRlc3BhY2VJbmRleCA8IG5vbldoaXRlc3BhY2VDb2x1bW4pIHtcblx0XHRcdGxpa2VseVJlbGV2YW50TGluZXMucHVzaChtb2RlbC5nZXRMaW5lQ29udGVudChpKSk7XG5cdFx0XHRub25XaGl0ZXNwYWNlQ29sdW1uID0gbmV3Tm9uV2hpdGVzcGFjZUluZGV4O1xuXHRcdFx0aW5pdGlhbFN0YXRlID0gc3RvcmU/LmdldFN0YXJ0U3RhdGUoaSk7XG5cdFx0XHRpZiAoaW5pdGlhbFN0YXRlKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGxpa2VseVJlbGV2YW50TGluZXMucmV2ZXJzZSgpO1xuXHRyZXR1cm4geyBsaWtlbHlSZWxldmFudExpbmVzLCBpbml0aWFsU3RhdGU6IGluaXRpYWxTdGF0ZSA/PyB1bmRlZmluZWQgfTtcbn1cblxuLyoqXG4gKiAqKkludmFyaWFudDoqKlxuICogSWYgdGhlIHRleHQgbW9kZWwgaXMgcmV0b2tlbml6ZWQgZnJvbSBsaW5lIDEgdG8ge0BsaW5rIGdldEZpcnN0SW52YWxpZEVuZFN0YXRlTGluZU51bWJlcn0oKSAtIDEsXG4gKiB0aGVuIHRoZSByZWNvbXB1dGVkIGVuZCBzdGF0ZSBmb3IgbGluZSBsIHdpbGwgYmUgZXF1YWwgdG8ge0BsaW5rIGdldEVuZFN0YXRlfShsKS5cbiAqL1xuZXhwb3J0IGNsYXNzIFRyYWNraW5nVG9rZW5pemF0aW9uU3RhdGVTdG9yZTxUU3RhdGUgZXh0ZW5kcyBJU3RhdGU+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5pemF0aW9uU3RhdGVTdG9yZSA9IG5ldyBUb2tlbml6YXRpb25TdGF0ZVN0b3JlPFRTdGF0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW52YWxpZEVuZFN0YXRlc0xpbmVOdW1iZXJzID0gbmV3IFJhbmdlUHJpb3JpdHlRdWV1ZUltcGwoKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGxpbmVDb3VudDogbnVtYmVyKSB7XG5cdFx0dGhpcy5faW52YWxpZEVuZFN0YXRlc0xpbmVOdW1iZXJzLmFkZFJhbmdlKG5ldyBPZmZzZXRSYW5nZSgxLCBsaW5lQ291bnQgKyAxKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RW5kU3RhdGUobGluZU51bWJlcjogbnVtYmVyKTogVFN0YXRlIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rva2VuaXphdGlvblN0YXRlU3RvcmUuZ2V0RW5kU3RhdGUobGluZU51bWJlcik7XG5cdH1cblxuXHQvKipcblx0ICogQHJldHVybnMgaWYgdGhlIGVuZCBzdGF0ZSBoYXMgY2hhbmdlZC5cblx0ICovXG5cdHB1YmxpYyBzZXRFbmRTdGF0ZShsaW5lTnVtYmVyOiBudW1iZXIsIHN0YXRlOiBUU3RhdGUpOiBib29sZWFuIHtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdDYW5ub3Qgc2V0IG51bGwvdW5kZWZpbmVkIHN0YXRlJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faW52YWxpZEVuZFN0YXRlc0xpbmVOdW1iZXJzLmRlbGV0ZShsaW5lTnVtYmVyKTtcblx0XHRjb25zdCByID0gdGhpcy5fdG9rZW5pemF0aW9uU3RhdGVTdG9yZS5zZXRFbmRTdGF0ZShsaW5lTnVtYmVyLCBzdGF0ZSk7XG5cdFx0aWYgKHIgJiYgbGluZU51bWJlciA8IHRoaXMubGluZUNvdW50KSB7XG5cdFx0XHQvLyBiZWNhdXNlIHRoZSBzdGF0ZSBjaGFuZ2VkLCB3ZSBjYW5ub3QgdHJ1c3QgdGhlIG5leHQgc3RhdGUgYW55bW9yZSBhbmQgaGF2ZSB0byBpbnZhbGlkYXRlIGl0LlxuXHRcdFx0dGhpcy5faW52YWxpZEVuZFN0YXRlc0xpbmVOdW1iZXJzLmFkZFJhbmdlKG5ldyBPZmZzZXRSYW5nZShsaW5lTnVtYmVyICsgMSwgbGluZU51bWJlciArIDIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcjtcblx0fVxuXG5cdHB1YmxpYyBhY2NlcHRDaGFuZ2UocmFuZ2U6IExpbmVSYW5nZSwgbmV3TGluZUNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmxpbmVDb3VudCArPSBuZXdMaW5lQ291bnQgLSByYW5nZS5sZW5ndGg7XG5cdFx0dGhpcy5fdG9rZW5pemF0aW9uU3RhdGVTdG9yZS5hY2NlcHRDaGFuZ2UocmFuZ2UsIG5ld0xpbmVDb3VudCk7XG5cdFx0dGhpcy5faW52YWxpZEVuZFN0YXRlc0xpbmVOdW1iZXJzLmFkZFJhbmdlQW5kUmVzaXplKG5ldyBPZmZzZXRSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUpLCBuZXdMaW5lQ291bnQpO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdENoYW5nZXMoY2hhbmdlczogSU1vZGVsQ29udGVudENoYW5nZVtdKSB7XG5cdFx0Zm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHtcblx0XHRcdGNvbnN0IFtlb2xDb3VudF0gPSBjb3VudEVPTChjLnRleHQpO1xuXHRcdFx0dGhpcy5hY2NlcHRDaGFuZ2UobmV3IExpbmVSYW5nZShjLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgYy5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMSksIGVvbENvdW50ICsgMSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGludmFsaWRhdGVFbmRTdGF0ZVJhbmdlKHJhbmdlOiBMaW5lUmFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnZhbGlkRW5kU3RhdGVzTGluZU51bWJlcnMuYWRkUmFuZ2UobmV3IE9mZnNldFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSkpO1xuXHR9XG5cblx0cHVibGljIGdldEZpcnN0SW52YWxpZEVuZFN0YXRlTGluZU51bWJlcigpOiBudW1iZXIgfCBudWxsIHsgcmV0dXJuIHRoaXMuX2ludmFsaWRFbmRTdGF0ZXNMaW5lTnVtYmVycy5taW47IH1cblxuXHRwdWJsaWMgZ2V0Rmlyc3RJbnZhbGlkRW5kU3RhdGVMaW5lTnVtYmVyT3JNYXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRGaXJzdEludmFsaWRFbmRTdGF0ZUxpbmVOdW1iZXIoKSB8fCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblx0fVxuXG5cdHB1YmxpYyBhbGxTdGF0ZXNWYWxpZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2ludmFsaWRFbmRTdGF0ZXNMaW5lTnVtYmVycy5taW4gPT09IG51bGw7IH1cblxuXHRwdWJsaWMgZ2V0U3RhcnRTdGF0ZShsaW5lTnVtYmVyOiBudW1iZXIsIGluaXRpYWxTdGF0ZTogVFN0YXRlKTogVFN0YXRlIHwgbnVsbCB7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IDEpIHsgcmV0dXJuIGluaXRpYWxTdGF0ZTsgfVxuXHRcdHJldHVybiB0aGlzLmdldEVuZFN0YXRlKGxpbmVOdW1iZXIgLSAxKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGaXJzdEludmFsaWRMaW5lKGluaXRpYWxTdGF0ZTogVFN0YXRlKTogeyBsaW5lTnVtYmVyOiBudW1iZXI7IHN0YXJ0U3RhdGU6IFRTdGF0ZSB9IHwgbnVsbCB7XG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuZ2V0Rmlyc3RJbnZhbGlkRW5kU3RhdGVMaW5lTnVtYmVyKCk7XG5cdFx0aWYgKGxpbmVOdW1iZXIgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydFN0YXRlID0gdGhpcy5nZXRTdGFydFN0YXRlKGxpbmVOdW1iZXIsIGluaXRpYWxTdGF0ZSk7XG5cdFx0aWYgKCFzdGFydFN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdTdGFydCBzdGF0ZSBtdXN0IGJlIGRlZmluZWQnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBsaW5lTnVtYmVyLCBzdGFydFN0YXRlIH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRva2VuaXphdGlvblN0YXRlU3RvcmU8VFN0YXRlIGV4dGVuZHMgSVN0YXRlPiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVFbmRTdGF0ZXMgPSBuZXcgRml4ZWRBcnJheTxUU3RhdGUgfCBudWxsPihudWxsKTtcblxuXHRwdWJsaWMgZ2V0RW5kU3RhdGUobGluZU51bWJlcjogbnVtYmVyKTogVFN0YXRlIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVFbmRTdGF0ZXMuZ2V0KGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIHNldEVuZFN0YXRlKGxpbmVOdW1iZXI6IG51bWJlciwgc3RhdGU6IFRTdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG9sZFN0YXRlID0gdGhpcy5fbGluZUVuZFN0YXRlcy5nZXQobGluZU51bWJlcik7XG5cdFx0aWYgKG9sZFN0YXRlICYmIG9sZFN0YXRlLmVxdWFscyhzdGF0ZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9saW5lRW5kU3RhdGVzLnNldChsaW5lTnVtYmVyLCBzdGF0ZSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0Q2hhbmdlKHJhbmdlOiBMaW5lUmFuZ2UsIG5ld0xpbmVDb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0bGV0IGxlbmd0aCA9IHJhbmdlLmxlbmd0aDtcblx0XHRpZiAobmV3TGluZUNvdW50ID4gMCAmJiBsZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBLZWVwIHRoZSBsYXN0IHN0YXRlLCBldmVuIHRob3VnaCBpdCBpcyB1bnJlbGF0ZWQuXG5cdFx0XHQvLyBCdXQgaWYgdGhlIG5ldyBzdGF0ZSBoYXBwZW5zIHRvIGFncmVlIHdpdGggdGhpcyBsYXN0IHN0YXRlLCB0aGVuIHdlIGtub3cgd2UgY2FuIHN0b3AgdG9rZW5pemluZy5cblx0XHRcdGxlbmd0aC0tO1xuXHRcdFx0bmV3TGluZUNvdW50LS07XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGluZUVuZFN0YXRlcy5yZXBsYWNlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgbGVuZ3RoLCBuZXdMaW5lQ291bnQpO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdENoYW5nZXMoY2hhbmdlczogSU1vZGVsQ29udGVudENoYW5nZVtdKSB7XG5cdFx0Zm9yIChjb25zdCBjIG9mIGNoYW5nZXMpIHtcblx0XHRcdGNvbnN0IFtlb2xDb3VudF0gPSBjb3VudEVPTChjLnRleHQpO1xuXHRcdFx0dGhpcy5hY2NlcHRDaGFuZ2UobmV3IExpbmVSYW5nZShjLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgYy5yYW5nZS5lbmRMaW5lTnVtYmVyICsgMSksIGVvbENvdW50ICsgMSk7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBSYW5nZVByaW9yaXR5UXVldWUge1xuXHRnZXQgbWluKCk6IG51bWJlciB8IG51bGw7XG5cdHJlbW92ZU1pbigpOiBudW1iZXIgfCBudWxsO1xuXG5cdGFkZFJhbmdlKHJhbmdlOiBPZmZzZXRSYW5nZSk6IHZvaWQ7XG5cblx0YWRkUmFuZ2VBbmRSZXNpemUocmFuZ2U6IE9mZnNldFJhbmdlLCBuZXdMZW5ndGg6IG51bWJlcik6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBSYW5nZVByaW9yaXR5UXVldWVJbXBsIGltcGxlbWVudHMgUmFuZ2VQcmlvcml0eVF1ZXVlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcmFuZ2VzOiBPZmZzZXRSYW5nZVtdID0gW107XG5cblx0cHVibGljIGdldFJhbmdlcygpOiBPZmZzZXRSYW5nZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fcmFuZ2VzO1xuXHR9XG5cblx0cHVibGljIGdldCBtaW4oKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX3Jhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmFuZ2VzWzBdLnN0YXJ0O1xuXHR9XG5cblx0cHVibGljIHJlbW92ZU1pbigpOiBudW1iZXIgfCBudWxsIHtcblx0XHRpZiAodGhpcy5fcmFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fcmFuZ2VzWzBdO1xuXHRcdGlmIChyYW5nZS5zdGFydCArIDEgPT09IHJhbmdlLmVuZEV4Y2x1c2l2ZSkge1xuXHRcdFx0dGhpcy5fcmFuZ2VzLnNoaWZ0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Jhbmdlc1swXSA9IG5ldyBPZmZzZXRSYW5nZShyYW5nZS5zdGFydCArIDEsIHJhbmdlLmVuZEV4Y2x1c2l2ZSk7XG5cdFx0fVxuXHRcdHJldHVybiByYW5nZS5zdGFydDtcblx0fVxuXG5cdHB1YmxpYyBkZWxldGUodmFsdWU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGlkeCA9IHRoaXMuX3Jhbmdlcy5maW5kSW5kZXgociA9PiByLmNvbnRhaW5zKHZhbHVlKSk7XG5cdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gdGhpcy5fcmFuZ2VzW2lkeF07XG5cdFx0XHRpZiAocmFuZ2Uuc3RhcnQgPT09IHZhbHVlKSB7XG5cdFx0XHRcdGlmIChyYW5nZS5lbmRFeGNsdXNpdmUgPT09IHZhbHVlICsgMSkge1xuXHRcdFx0XHRcdHRoaXMuX3Jhbmdlcy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9yYW5nZXNbaWR4XSA9IG5ldyBPZmZzZXRSYW5nZSh2YWx1ZSArIDEsIHJhbmdlLmVuZEV4Y2x1c2l2ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChyYW5nZS5lbmRFeGNsdXNpdmUgPT09IHZhbHVlICsgMSkge1xuXHRcdFx0XHRcdHRoaXMuX3Jhbmdlc1tpZHhdID0gbmV3IE9mZnNldFJhbmdlKHJhbmdlLnN0YXJ0LCB2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fcmFuZ2VzLnNwbGljZShpZHgsIDEsIG5ldyBPZmZzZXRSYW5nZShyYW5nZS5zdGFydCwgdmFsdWUpLCBuZXcgT2Zmc2V0UmFuZ2UodmFsdWUgKyAxLCByYW5nZS5lbmRFeGNsdXNpdmUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhZGRSYW5nZShyYW5nZTogT2Zmc2V0UmFuZ2UpOiB2b2lkIHtcblx0XHRPZmZzZXRSYW5nZS5hZGRSYW5nZShyYW5nZSwgdGhpcy5fcmFuZ2VzKTtcblx0fVxuXG5cdHB1YmxpYyBhZGRSYW5nZUFuZFJlc2l6ZShyYW5nZTogT2Zmc2V0UmFuZ2UsIG5ld0xlbmd0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0bGV0IGlkeEZpcnN0TWlnaHRCZUludGVyc2VjdGluZyA9IDA7XG5cdFx0d2hpbGUgKCEoaWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nID49IHRoaXMuX3Jhbmdlcy5sZW5ndGggfHwgcmFuZ2Uuc3RhcnQgPD0gdGhpcy5fcmFuZ2VzW2lkeEZpcnN0TWlnaHRCZUludGVyc2VjdGluZ10uZW5kRXhjbHVzaXZlKSkge1xuXHRcdFx0aWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nKys7XG5cdFx0fVxuXHRcdGxldCBpZHhGaXJzdElzQWZ0ZXIgPSBpZHhGaXJzdE1pZ2h0QmVJbnRlcnNlY3Rpbmc7XG5cdFx0d2hpbGUgKCEoaWR4Rmlyc3RJc0FmdGVyID49IHRoaXMuX3Jhbmdlcy5sZW5ndGggfHwgcmFuZ2UuZW5kRXhjbHVzaXZlIDwgdGhpcy5fcmFuZ2VzW2lkeEZpcnN0SXNBZnRlcl0uc3RhcnQpKSB7XG5cdFx0XHRpZHhGaXJzdElzQWZ0ZXIrKztcblx0XHR9XG5cdFx0Y29uc3QgZGVsdGEgPSBuZXdMZW5ndGggLSByYW5nZS5sZW5ndGg7XG5cblx0XHRmb3IgKGxldCBpID0gaWR4Rmlyc3RJc0FmdGVyOyBpIDwgdGhpcy5fcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9yYW5nZXNbaV0gPSB0aGlzLl9yYW5nZXNbaV0uZGVsdGEoZGVsdGEpO1xuXHRcdH1cblxuXHRcdGlmIChpZHhGaXJzdE1pZ2h0QmVJbnRlcnNlY3RpbmcgPT09IGlkeEZpcnN0SXNBZnRlcikge1xuXHRcdFx0Y29uc3QgbmV3UmFuZ2UgPSBuZXcgT2Zmc2V0UmFuZ2UocmFuZ2Uuc3RhcnQsIHJhbmdlLnN0YXJ0ICsgbmV3TGVuZ3RoKTtcblx0XHRcdGlmICghbmV3UmFuZ2UuaXNFbXB0eSkge1xuXHRcdFx0XHR0aGlzLl9yYW5nZXMuc3BsaWNlKGlkeEZpcnN0TWlnaHRCZUludGVyc2VjdGluZywgMCwgbmV3UmFuZ2UpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzdGFydCA9IE1hdGgubWluKHJhbmdlLnN0YXJ0LCB0aGlzLl9yYW5nZXNbaWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nXS5zdGFydCk7XG5cdFx0XHRjb25zdCBlbmRFeCA9IE1hdGgubWF4KHJhbmdlLmVuZEV4Y2x1c2l2ZSwgdGhpcy5fcmFuZ2VzW2lkeEZpcnN0SXNBZnRlciAtIDFdLmVuZEV4Y2x1c2l2ZSk7XG5cblx0XHRcdGNvbnN0IG5ld1JhbmdlID0gbmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBlbmRFeCArIGRlbHRhKTtcblx0XHRcdGlmICghbmV3UmFuZ2UuaXNFbXB0eSkge1xuXHRcdFx0XHR0aGlzLl9yYW5nZXMuc3BsaWNlKGlkeEZpcnN0TWlnaHRCZUludGVyc2VjdGluZywgaWR4Rmlyc3RJc0FmdGVyIC0gaWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nLCBuZXdSYW5nZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9yYW5nZXMuc3BsaWNlKGlkeEZpcnN0TWlnaHRCZUludGVyc2VjdGluZywgaWR4Rmlyc3RJc0FmdGVyIC0gaWR4Rmlyc3RNaWdodEJlSW50ZXJzZWN0aW5nKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0b1N0cmluZygpIHtcblx0XHRyZXR1cm4gdGhpcy5fcmFuZ2VzLm1hcChyID0+IHIudG9TdHJpbmcoKSkuam9pbignICsgJyk7XG5cdH1cbn1cblxuXG5mdW5jdGlvbiBzYWZlVG9rZW5pemUobGFuZ3VhZ2VJZENvZGVjOiBJTGFuZ3VhZ2VJZENvZGVjLCBsYW5ndWFnZUlkOiBzdHJpbmcsIHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0IHwgbnVsbCwgdGV4dDogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBJU3RhdGUpOiBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0IHtcblx0bGV0IHI6IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQgfCBudWxsID0gbnVsbDtcblxuXHRpZiAodG9rZW5pemF0aW9uU3VwcG9ydCkge1xuXHRcdHRyeSB7XG5cdFx0XHRyID0gdG9rZW5pemF0aW9uU3VwcG9ydC50b2tlbml6ZUVuY29kZWQodGV4dCwgaGFzRU9MLCBzdGF0ZS5jbG9uZSgpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoIXIpIHtcblx0XHRyID0gbnVsbFRva2VuaXplRW5jb2RlZChsYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKSwgc3RhdGUpO1xuXHR9XG5cblx0TGluZVRva2Vucy5jb252ZXJ0VG9FbmRPZmZzZXQoci50b2tlbnMsIHRleHQubGVuZ3RoKTtcblx0cmV0dXJuIHI7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZhdWx0QmFja2dyb3VuZFRva2VuaXplciBpbXBsZW1lbnRzIElCYWNrZ3JvdW5kVG9rZW5pemVyIHtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuaXplcldpdGhTdGF0ZVN0b3JlOiBUb2tlbml6ZXJXaXRoU3RhdGVTdG9yZUFuZFRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9iYWNrZ3JvdW5kVG9rZW5TdG9yZTogSUJhY2tncm91bmRUb2tlbml6YXRpb25TdG9yZSxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVDaGFuZ2VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2JlZ2luQmFja2dyb3VuZFRva2VuaXphdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNTY2hlZHVsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYmVnaW5CYWNrZ3JvdW5kVG9rZW5pemF0aW9uKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc1NjaGVkdWxlZCB8fCAhdGhpcy5fdG9rZW5pemVyV2l0aFN0YXRlU3RvcmUuX3RleHRNb2RlbC5pc0F0dGFjaGVkVG9FZGl0b3IoKSB8fCAhdGhpcy5faGFzTGluZXNUb1Rva2VuaXplKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pc1NjaGVkdWxlZCA9IHRydWU7XG5cdFx0cnVuV2hlbkdsb2JhbElkbGUoKGRlYWRsaW5lKSA9PiB7XG5cdFx0XHR0aGlzLl9pc1NjaGVkdWxlZCA9IGZhbHNlO1xuXG5cdFx0XHR0aGlzLl9iYWNrZ3JvdW5kVG9rZW5pemVXaXRoRGVhZGxpbmUoZGVhZGxpbmUpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRva2VuaXplIHVudGlsIHRoZSBkZWFkbGluZSBvY2N1cnMsIGJ1dCB0cnkgdG8geWllbGQgZXZlcnkgMS0ybXMuXG5cdCAqL1xuXHRwcml2YXRlIF9iYWNrZ3JvdW5kVG9rZW5pemVXaXRoRGVhZGxpbmUoZGVhZGxpbmU6IElkbGVEZWFkbGluZSk6IHZvaWQge1xuXHRcdC8vIFJlYWQgdGhlIHRpbWUgcmVtYWluaW5nIGZyb20gdGhlIGBkZWFkbGluZWAgaW1tZWRpYXRlbHkgYmVjYXVzZSBpdCBpcyB1bmNsZWFyXG5cdFx0Ly8gaWYgdGhlIGBkZWFkbGluZWAgb2JqZWN0IHdpbGwgYmUgdmFsaWQgYWZ0ZXIgZXhlY3V0aW9uIGxlYXZlcyB0aGlzIGZ1bmN0aW9uLlxuXHRcdGNvbnN0IGVuZFRpbWUgPSBEYXRlLm5vdygpICsgZGVhZGxpbmUudGltZVJlbWFpbmluZygpO1xuXG5cdFx0Y29uc3QgZXhlY3V0ZSA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkIHx8ICF0aGlzLl90b2tlbml6ZXJXaXRoU3RhdGVTdG9yZS5fdGV4dE1vZGVsLmlzQXR0YWNoZWRUb0VkaXRvcigpIHx8ICF0aGlzLl9oYXNMaW5lc1RvVG9rZW5pemUoKSkge1xuXHRcdFx0XHQvLyBkaXNwb3NlZCBpbiB0aGUgbWVhbnRpbWUgb3IgZGV0YWNoZWQgb3IgZmluaXNoZWRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9iYWNrZ3JvdW5kVG9rZW5pemVGb3JBdExlYXN0MW1zKCk7XG5cblx0XHRcdGlmIChEYXRlLm5vdygpIDwgZW5kVGltZSkge1xuXHRcdFx0XHQvLyBUaGVyZSBpcyBzdGlsbCB0aW1lIGJlZm9yZSByZWFjaGluZyB0aGUgZGVhZGxpbmUsIHNvIHlpZWxkIHRvIHRoZSBicm93c2VyIGFuZCB0aGVuXG5cdFx0XHRcdC8vIGNvbnRpbnVlIGV4ZWN1dGlvblxuXHRcdFx0XHRzZXRUaW1lb3V0MChleGVjdXRlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRoZSBkZWFkbGluZSBoYXMgYmVlbiByZWFjaGVkLCBzbyBzY2hlZHVsZSBhIG5ldyBpZGxlIGNhbGxiYWNrIGlmIG5lY2Vzc2FyeVxuXHRcdFx0XHR0aGlzLl9iZWdpbkJhY2tncm91bmRUb2tlbml6YXRpb24oKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGV4ZWN1dGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2tlbml6ZSBmb3IgYXQgbGVhc3QgMW1zLlxuXHQgKi9cblx0cHJpdmF0ZSBfYmFja2dyb3VuZFRva2VuaXplRm9yQXRMZWFzdDFtcygpOiB2b2lkIHtcblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLl90b2tlbml6ZXJXaXRoU3RhdGVTdG9yZS5fdGV4dE1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IGJ1aWxkZXIgPSBuZXcgQ29udGlndW91c011bHRpbGluZVRva2Vuc0J1aWxkZXIoKTtcblx0XHRjb25zdCBzdyA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXG5cdFx0ZG8ge1xuXHRcdFx0aWYgKHN3LmVsYXBzZWQoKSA+IDEpIHtcblx0XHRcdFx0Ly8gdGhlIGNvbXBhcmlzb24gaXMgaW50ZW50aW9uYWxseSA+IDEgYW5kIG5vdCA+PSAxIHRvIGVuc3VyZSB0aGF0XG5cdFx0XHRcdC8vIGEgZnVsbCBtaWxsaXNlY29uZCBoYXMgZWxhcHNlZCwgZ2l2ZW4gaG93IG1pY3Jvc2Vjb25kcyBhcmUgcm91bmRlZFxuXHRcdFx0XHQvLyB0byBtaWxsaXNlY29uZHNcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRva2VuaXplZExpbmVOdW1iZXIgPSB0aGlzLl90b2tlbml6ZU9uZUludmFsaWRMaW5lKGJ1aWxkZXIpO1xuXG5cdFx0XHRpZiAodG9rZW5pemVkTGluZU51bWJlciA+PSBsaW5lQ291bnQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSB3aGlsZSAodGhpcy5faGFzTGluZXNUb1Rva2VuaXplKCkpO1xuXG5cdFx0dGhpcy5fYmFja2dyb3VuZFRva2VuU3RvcmUuc2V0VG9rZW5zKGJ1aWxkZXIuZmluYWxpemUoKSk7XG5cdFx0dGhpcy5jaGVja0ZpbmlzaGVkKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYXNMaW5lc1RvVG9rZW5pemUoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl90b2tlbml6ZXJXaXRoU3RhdGVTdG9yZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gIXRoaXMuX3Rva2VuaXplcldpdGhTdGF0ZVN0b3JlLnN0b3JlLmFsbFN0YXRlc1ZhbGlkKCk7XG5cdH1cblxuXHRwcml2YXRlIF90b2tlbml6ZU9uZUludmFsaWRMaW5lKGJ1aWxkZXI6IENvbnRpZ3VvdXNNdWx0aWxpbmVUb2tlbnNCdWlsZGVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBmaXJzdEludmFsaWRMaW5lID0gdGhpcy5fdG9rZW5pemVyV2l0aFN0YXRlU3RvcmU/LmdldEZpcnN0SW52YWxpZExpbmUoKTtcblx0XHRpZiAoIWZpcnN0SW52YWxpZExpbmUpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b2tlbml6ZXJXaXRoU3RhdGVTdG9yZS5fdGV4dE1vZGVsLmdldExpbmVDb3VudCgpICsgMTtcblx0XHR9XG5cdFx0dGhpcy5fdG9rZW5pemVyV2l0aFN0YXRlU3RvcmUudXBkYXRlVG9rZW5zVW50aWxMaW5lKGJ1aWxkZXIsIGZpcnN0SW52YWxpZExpbmUubGluZU51bWJlcik7XG5cdFx0cmV0dXJuIGZpcnN0SW52YWxpZExpbmUubGluZU51bWJlcjtcblx0fVxuXG5cdHB1YmxpYyBjaGVja0ZpbmlzaGVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90b2tlbml6ZXJXaXRoU3RhdGVTdG9yZS5zdG9yZS5hbGxTdGF0ZXNWYWxpZCgpKSB7XG5cdFx0XHR0aGlzLl9iYWNrZ3JvdW5kVG9rZW5TdG9yZS5iYWNrZ3JvdW5kVG9rZW5pemF0aW9uRmluaXNoZWQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVxdWVzdFRva2VucyhzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlckV4Y2x1c2l2ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9rZW5pemVyV2l0aFN0YXRlU3RvcmUuc3RvcmUuaW52YWxpZGF0ZUVuZFN0YXRlUmFuZ2UobmV3IExpbmVSYW5nZShzdGFydExpbmVOdW1i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
