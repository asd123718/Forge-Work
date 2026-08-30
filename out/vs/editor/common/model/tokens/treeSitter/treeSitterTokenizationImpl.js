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
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { setTimeout0 } from "../../../../../base/common/platform.js";
import { StopWatch } from "../../../../../base/common/stopwatch.js";
import { findLikelyRelevantLines } from "../../textModelTokens.js";
import { TokenStore, TokenQuality } from "./tokenStore.js";
import { autorun, autorunHandleChanges, recordChanges, runOnChange } from "../../../../../base/common/observable.js";
import { LineTokens } from "../../../tokens/lineTokens.js";
import { Position } from "../../../core/position.js";
import { Range } from "../../../core/range.js";
import { isDefined } from "../../../../../base/common/types.js";
import { ITreeSitterThemeService } from "../../../services/treeSitter/treeSitterThemeService.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
let TreeSitterTokenizationImpl = class extends Disposable {
  constructor(_tree, _highlightingQueries, _languageIdCodec, _visibleLineRanges, _treeSitterThemeService) {
    super();
    this._tree = _tree;
    this._highlightingQueries = _highlightingQueries;
    this._languageIdCodec = _languageIdCodec;
    this._visibleLineRanges = _visibleLineRanges;
    this._treeSitterThemeService = _treeSitterThemeService;
    this._onDidChangeTokens = this._register(new Emitter());
    this.onDidChangeTokens = this._onDidChangeTokens.event;
    this._onDidCompleteBackgroundTokenization = this._register(new Emitter());
    this.onDidChangeBackgroundTokenization = this._onDidCompleteBackgroundTokenization.event;
    this._encodedLanguageId = this._languageIdCodec.encodeLanguageId(this._tree.languageId);
    this._register(runOnChange(this._treeSitterThemeService.onChange, () => {
      this._updateTheme();
    }));
    this._tokenStore = this._register(new TokenStore(this._textModel));
    this._accurateVersion = this._textModel.getVersionId();
    this._guessVersion = this._textModel.getVersionId();
    this._tokenStore.buildStore(this._createEmptyTokens(), TokenQuality.None);
    this._register(autorun((reader) => {
      const visibleLineRanges = this._visibleLineRanges.read(reader);
      this._parseAndTokenizeViewPort(visibleLineRanges);
    }));
    this._register(autorunHandleChanges({
      owner: this,
      changeTracker: recordChanges({ tree: this._tree.tree })
    }, (reader, ctx) => {
      const changeEvent = ctx.changes.at(0)?.change;
      if (ctx.changes.length > 1) {
        throw new BugIndicatingError("The tree changed twice in one transaction. This is currently not supported and should not happen.");
      }
      if (!changeEvent) {
        if (ctx.tree) {
          this._firstTreeUpdate(this._tree.treeLastParsedVersion.read(reader));
        }
      } else {
        if (this.hasTokens()) {
          for (const range of changeEvent.ranges) {
            this._markForRefresh(range.newRange);
          }
        }
        if (!this.hasTokens()) {
          this._firstTreeUpdate(changeEvent.versionId);
        } else {
          this._handleTreeUpdate(changeEvent.ranges, changeEvent.versionId);
        }
      }
    }));
  }
  get _textModel() {
    return this._tree.textModel;
  }
  handleContentChanged(e) {
    this._guessVersion = e.versionId;
    for (const change of e.changes) {
      if (change.text.length > change.rangeLength) {
        const offset = change.rangeOffset > 0 ? change.rangeOffset - 1 : change.rangeOffset;
        const oldToken = this._tokenStore.getTokenAt(offset);
        let newToken;
        if (oldToken) {
          newToken = { startOffsetInclusive: oldToken.startOffsetInclusive, length: oldToken.length + change.text.length - change.rangeLength, token: oldToken.token };
          this._tokenStore.markForRefresh(offset, change.rangeOffset + (change.text.length > change.rangeLength ? change.text.length : change.rangeLength));
        } else {
          newToken = { startOffsetInclusive: offset, length: change.text.length, token: 0 };
        }
        this._tokenStore.update(oldToken?.length ?? 0, [newToken], TokenQuality.EditGuess);
      } else if (change.text.length < change.rangeLength) {
        const deletedCharCount = change.rangeLength - change.text.length;
        this._tokenStore.delete(deletedCharCount, change.rangeOffset);
      }
    }
  }
  getLineTokens(lineNumber) {
    const content = this._textModel.getLineContent(lineNumber);
    const rawTokens = this.getTokens(lineNumber);
    return new LineTokens(rawTokens, content, this._languageIdCodec);
  }
  _createEmptyTokens() {
    const emptyToken = this._emptyToken();
    const modelEndOffset = this._textModel.getValueLength();
    const emptyTokens = [this._emptyTokensForOffsetAndLength(0, modelEndOffset, emptyToken)];
    return emptyTokens;
  }
  _emptyToken() {
    return this._treeSitterThemeService.findMetadata([], this._encodedLanguageId, false, void 0);
  }
  _emptyTokensForOffsetAndLength(offset, length, emptyToken) {
    return { token: emptyToken, length: offset + length, startOffsetInclusive: 0 };
  }
  hasAccurateTokensForLine(lineNumber) {
    return this.hasTokens(new Range(lineNumber, 1, lineNumber, this._textModel.getLineMaxColumn(lineNumber)));
  }
  tokenizeLinesAt(lineNumber, lines) {
    const rawLineTokens = this._guessTokensForLinesContent(lineNumber, lines);
    const lineTokens = [];
    if (!rawLineTokens) {
      return null;
    }
    for (let i = 0; i < rawLineTokens.length; i++) {
      lineTokens.push(new LineTokens(rawLineTokens[i], lines[i], this._languageIdCodec));
    }
    return lineTokens;
  }
  _rangeHasTokens(range, minimumTokenQuality) {
    return this._tokenStore.rangeHasTokens(this._textModel.getOffsetAt(range.getStartPosition()), this._textModel.getOffsetAt(range.getEndPosition()), minimumTokenQuality);
  }
  hasTokens(accurateForRange) {
    if (!accurateForRange || this._guessVersion === this._accurateVersion) {
      return true;
    }
    return !this._tokenStore.rangeNeedsRefresh(this._textModel.getOffsetAt(accurateForRange.getStartPosition()), this._textModel.getOffsetAt(accurateForRange.getEndPosition()));
  }
  getTokens(line) {
    const lineStartOffset = this._textModel.getOffsetAt({ lineNumber: line, column: 1 });
    const lineEndOffset = this._textModel.getOffsetAt({ lineNumber: line, column: this._textModel.getLineLength(line) + 1 });
    const lineTokens = this._tokenStore.getTokensInRange(lineStartOffset, lineEndOffset);
    const result = new Uint32Array(lineTokens.length * 2);
    for (let i = 0; i < lineTokens.length; i++) {
      result[i * 2] = lineTokens[i].startOffsetInclusive - lineStartOffset + lineTokens[i].length;
      result[i * 2 + 1] = lineTokens[i].token;
    }
    return result;
  }
  getTokensInRange(range, rangeStartOffset, rangeEndOffset, captures) {
    const tokens = captures ? this._tokenizeCapturesWithMetadata(captures, rangeStartOffset, rangeEndOffset) : this._tokenize(range, rangeStartOffset, rangeEndOffset);
    if (tokens?.endOffsetsAndMetadata) {
      return this._rangeTokensAsUpdates(rangeStartOffset, tokens.endOffsetsAndMetadata);
    }
    return void 0;
  }
  _updateTokensInStore(version, updates, tokenQuality) {
    this._accurateVersion = version;
    for (const update of updates) {
      const lastToken = update.newTokens.length > 0 ? update.newTokens[update.newTokens.length - 1] : void 0;
      let oldRangeLength;
      if (lastToken && this._guessVersion >= version) {
        oldRangeLength = lastToken.startOffsetInclusive + lastToken.length - update.newTokens[0].startOffsetInclusive;
      } else if (update.oldRangeLength) {
        oldRangeLength = update.oldRangeLength;
      } else {
        oldRangeLength = 0;
      }
      this._tokenStore.update(oldRangeLength, update.newTokens, tokenQuality);
    }
  }
  _markForRefresh(range) {
    this._tokenStore.markForRefresh(this._textModel.getOffsetAt(range.getStartPosition()), this._textModel.getOffsetAt(range.getEndPosition()));
  }
  _getNeedsRefresh() {
    const needsRefreshOffsetRanges = this._tokenStore.getNeedsRefresh();
    if (!needsRefreshOffsetRanges) {
      return [];
    }
    return needsRefreshOffsetRanges.map((range) => ({
      range: Range.fromPositions(this._textModel.getPositionAt(range.startOffset), this._textModel.getPositionAt(range.endOffset)),
      startOffset: range.startOffset,
      endOffset: range.endOffset
    }));
  }
  _parseAndTokenizeViewPort(lineRanges) {
    const viewportRanges = lineRanges.map((r) => r.toInclusiveRange()).filter(isDefined);
    for (const range of viewportRanges) {
      const startOffsetOfRangeInDocument = this._textModel.getOffsetAt(range.getStartPosition());
      const endOffsetOfRangeInDocument = this._textModel.getOffsetAt(range.getEndPosition());
      const version = this._textModel.getVersionId();
      if (this._rangeHasTokens(range, TokenQuality.ViewportGuess)) {
        continue;
      }
      const content = this._textModel.getValueInRange(range);
      const tokenUpdates = this._forceParseAndTokenizeContent(range, startOffsetOfRangeInDocument, endOffsetOfRangeInDocument, content, true);
      if (!tokenUpdates || this._rangeHasTokens(range, TokenQuality.ViewportGuess)) {
        continue;
      }
      if (tokenUpdates.length === 0) {
        continue;
      }
      const lastToken = tokenUpdates[tokenUpdates.length - 1];
      const oldRangeLength = lastToken.startOffsetInclusive + lastToken.length - tokenUpdates[0].startOffsetInclusive;
      this._updateTokensInStore(version, [{ newTokens: tokenUpdates, oldRangeLength }], TokenQuality.ViewportGuess);
      this._onDidChangeTokens.fire({ changes: { semanticTokensApplied: false, ranges: [{ fromLineNumber: range.startLineNumber, toLineNumber: range.endLineNumber }] } });
    }
  }
  _guessTokensForLinesContent(lineNumber, lines) {
    if (lines.length === 0) {
      return void 0;
    }
    const lineContent = lines.join(this._textModel.getEOL());
    const range = new Range(1, 1, lineNumber + lines.length, lines[lines.length - 1].length + 1);
    const startOffset = this._textModel.getOffsetAt({ lineNumber, column: 1 });
    const tokens = this._forceParseAndTokenizeContent(range, startOffset, startOffset + lineContent.length, lineContent, false);
    if (!tokens) {
      return void 0;
    }
    const tokensByLine = new Array(lines.length);
    let tokensIndex = 0;
    let tokenStartOffset = 0;
    let lineStartOffset = 0;
    for (let i = 0; i < lines.length; i++) {
      const tokensForLine = [];
      let moveToNextLine = false;
      for (let j = tokensIndex; !moveToNextLine && j < tokens.length; j++) {
        const token = tokens[j];
        const lineAdjustedEndOffset = token.endOffset - lineStartOffset;
        const lineAdjustedStartOffset = tokenStartOffset - lineStartOffset;
        if (lineAdjustedEndOffset <= lines[i].length) {
          tokensForLine.push({ endOffset: lineAdjustedEndOffset, metadata: token.metadata });
          tokensIndex++;
        } else if (lineAdjustedStartOffset < lines[i].length) {
          const partialToken = { endOffset: lines[i].length, metadata: token.metadata };
          tokensForLine.push(partialToken);
          moveToNextLine = true;
        } else {
          moveToNextLine = true;
        }
        tokenStartOffset = token.endOffset;
      }
      tokensByLine[i] = this._endOffsetTokensToUint32Array(tokensForLine);
      lineStartOffset += lines[i].length + this._textModel.getEOL().length;
    }
    return tokensByLine;
  }
  _forceParseAndTokenizeContent(range, startOffsetOfRangeInDocument, endOffsetOfRangeInDocument, content, asUpdate) {
    const likelyRelevantLines = findLikelyRelevantLines(this._textModel, range.startLineNumber).likelyRelevantLines;
    const likelyRelevantPrefix = likelyRelevantLines.join(this._textModel.getEOL());
    const tree = this._tree.createParsedTreeSync(`${likelyRelevantPrefix}${content}`);
    if (!tree) {
      return;
    }
    const treeRange = new Range(1, 1, range.endLineNumber - range.startLineNumber + 1 + likelyRelevantLines.length, range.endColumn);
    const captures = this.captureAtRange(treeRange);
    const tokens = this._tokenizeCapturesWithMetadata(captures, likelyRelevantPrefix.length, endOffsetOfRangeInDocument - startOffsetOfRangeInDocument + likelyRelevantPrefix.length);
    tree.delete();
    if (!tokens) {
      return;
    }
    if (asUpdate) {
      return this._rangeTokensAsUpdates(startOffsetOfRangeInDocument, tokens.endOffsetsAndMetadata, likelyRelevantPrefix.length);
    } else {
      return tokens.endOffsetsAndMetadata;
    }
  }
  _firstTreeUpdate(versionId) {
    return this._setViewPortTokens(versionId);
  }
  _setViewPortTokens(versionId) {
    const rangeChanges = this._visibleLineRanges.get().map((lineRange) => {
      const range = lineRange.toInclusiveRange();
      if (!range) {
        return void 0;
      }
      const newRangeStartOffset = this._textModel.getOffsetAt(range.getStartPosition());
      const newRangeEndOffset = this._textModel.getOffsetAt(range.getEndPosition());
      return {
        newRange: range,
        newRangeEndOffset,
        newRangeStartOffset
      };
    }).filter(isDefined);
    return this._handleTreeUpdate(rangeChanges, versionId);
  }
  /**
   * Do not await in this method, it will cause a race
   */
  _handleTreeUpdate(ranges, versionId) {
    const rangeChanges = [];
    const chunkSize = 1e3;
    for (let i = 0; i < ranges.length; i++) {
      const rangeLinesLength = ranges[i].newRange.endLineNumber - ranges[i].newRange.startLineNumber;
      if (rangeLinesLength > chunkSize) {
        const fullRangeEndLineNumber = ranges[i].newRange.endLineNumber;
        let chunkLineStart = ranges[i].newRange.startLineNumber;
        let chunkColumnStart = ranges[i].newRange.startColumn;
        let chunkLineEnd = chunkLineStart + chunkSize;
        do {
          const chunkStartingPosition = new Position(chunkLineStart, chunkColumnStart);
          const chunkEndColumn = chunkLineEnd === ranges[i].newRange.endLineNumber ? ranges[i].newRange.endColumn : this._textModel.getLineMaxColumn(chunkLineEnd);
          const chunkEndPosition = new Position(chunkLineEnd, chunkEndColumn);
          const chunkRange = Range.fromPositions(chunkStartingPosition, chunkEndPosition);
          rangeChanges.push({
            range: chunkRange,
            startOffset: this._textModel.getOffsetAt(chunkRange.getStartPosition()),
            endOffset: this._textModel.getOffsetAt(chunkRange.getEndPosition())
          });
          chunkLineStart = chunkLineEnd + 1;
          chunkColumnStart = 1;
          if (chunkLineEnd < fullRangeEndLineNumber && chunkLineEnd + chunkSize > fullRangeEndLineNumber) {
            chunkLineEnd = fullRangeEndLineNumber;
          } else {
            chunkLineEnd = chunkLineEnd + chunkSize;
          }
        } while (chunkLineEnd <= fullRangeEndLineNumber);
      } else {
        if (i === 0 || rangeChanges[i - 1].endOffset < ranges[i].newRangeStartOffset) {
          rangeChanges.push({
            range: ranges[i].newRange,
            startOffset: ranges[i].newRangeStartOffset,
            endOffset: ranges[i].newRangeEndOffset
          });
        } else if (rangeChanges[i - 1].endOffset < ranges[i].newRangeEndOffset) {
          const startPosition = this._textModel.getPositionAt(rangeChanges[i - 1].endOffset + 1);
          const range = new Range(startPosition.lineNumber, startPosition.column, ranges[i].newRange.endLineNumber, ranges[i].newRange.endColumn);
          rangeChanges.push({
            range,
            startOffset: rangeChanges[i - 1].endOffset + 1,
            endOffset: ranges[i].newRangeEndOffset
          });
        }
      }
    }
    const captures = rangeChanges.map((range) => this._getCaptures(range.range));
    return this._updateTreeForRanges(rangeChanges, versionId, captures).then(() => {
      if (!this._textModel.isDisposed() && this._tree.treeLastParsedVersion.get() === this._textModel.getVersionId()) {
        this._refreshNeedsRefresh(versionId);
      }
    });
  }
  async _updateTreeForRanges(rangeChanges, versionId, captures) {
    let tokenUpdate;
    for (let i = 0; i < rangeChanges.length; i++) {
      if (!this._textModel.isDisposed() && versionId !== this._textModel.getVersionId()) {
        break;
      }
      const capture = captures[i];
      const range = rangeChanges[i];
      const updates = this.getTokensInRange(range.range, range.startOffset, range.endOffset, capture);
      if (updates) {
        tokenUpdate = { newTokens: updates };
      } else {
        tokenUpdate = { newTokens: [] };
      }
      this._updateTokensInStore(versionId, [tokenUpdate], TokenQuality.Accurate);
      this._onDidChangeTokens.fire({
        changes: {
          semanticTokensApplied: false,
          ranges: [{ fromLineNumber: range.range.getStartPosition().lineNumber, toLineNumber: range.range.getEndPosition().lineNumber }]
        }
      });
      await new Promise((resolve) => setTimeout0(resolve));
    }
    this._onDidCompleteBackgroundTokenization.fire();
  }
  _refreshNeedsRefresh(versionId) {
    const rangesToRefresh = this._getNeedsRefresh();
    if (rangesToRefresh.length === 0) {
      return;
    }
    const rangeChanges = new Array(rangesToRefresh.length);
    for (let i = 0; i < rangesToRefresh.length; i++) {
      const range = rangesToRefresh[i];
      rangeChanges[i] = {
        newRange: range.range,
        newRangeStartOffset: range.startOffset,
        newRangeEndOffset: range.endOffset
      };
    }
    this._handleTreeUpdate(rangeChanges, versionId);
  }
  _rangeTokensAsUpdates(rangeOffset, endOffsetToken, startingOffsetInArray) {
    const updates = [];
    let lastEnd = 0;
    for (const token of endOffsetToken) {
      if (token.endOffset <= lastEnd || startingOffsetInArray && token.endOffset < startingOffsetInArray) {
        continue;
      }
      let tokenUpdate;
      if (startingOffsetInArray && lastEnd < startingOffsetInArray) {
        tokenUpdate = { startOffsetInclusive: rangeOffset + startingOffsetInArray, length: token.endOffset - startingOffsetInArray, token: token.metadata };
      } else {
        tokenUpdate = { startOffsetInclusive: rangeOffset + lastEnd, length: token.endOffset - lastEnd, token: token.metadata };
      }
      updates.push(tokenUpdate);
      lastEnd = token.endOffset;
    }
    return updates;
  }
  _updateTheme() {
    const modelRange = this._textModel.getFullModelRange();
    this._markForRefresh(modelRange);
    this._parseAndTokenizeViewPort(this._visibleLineRanges.get());
  }
  // Was used for inspect editor tokens command
  captureAtPosition(lineNumber, column) {
    const captures = this.captureAtRangeWithInjections(new Range(lineNumber, column, lineNumber, column + 1));
    return captures;
  }
  // Was used for the colorization tests
  captureAtRangeTree(range) {
    const captures = this.captureAtRangeWithInjections(range);
    return captures;
  }
  captureAtRange(range) {
    const tree = this._tree.tree.get();
    if (!tree) {
      return [];
    }
    return this._highlightingQueries.captures(tree.rootNode, { startPosition: { row: range.startLineNumber - 1, column: range.startColumn - 1 }, endPosition: { row: range.endLineNumber - 1, column: range.endColumn - 1 } }).map((capture) => ({
      name: capture.name,
      text: capture.node.text,
      node: {
        startIndex: capture.node.startIndex,
        endIndex: capture.node.endIndex,
        startPosition: {
          lineNumber: capture.node.startPosition.row + 1,
          column: capture.node.startPosition.column + 1
        },
        endPosition: {
          lineNumber: capture.node.endPosition.row + 1,
          column: capture.node.endPosition.column + 1
        }
      },
      encodedLanguageId: this._encodedLanguageId
    }));
  }
  captureAtRangeWithInjections(range) {
    const captures = this.captureAtRange(range);
    for (let i = 0; i < captures.length; i++) {
      const capture = captures[i];
      const capStartLine = capture.node.startPosition.lineNumber;
      const capEndLine = capture.node.endPosition.lineNumber;
      const capStartColumn = capture.node.startPosition.column;
      const capEndColumn = capture.node.endPosition.column;
      const startLine = capStartLine > range.startLineNumber && capStartLine < range.endLineNumber ? capStartLine : range.startLineNumber;
      const endLine = capEndLine > range.startLineNumber && capEndLine < range.endLineNumber ? capEndLine : range.endLineNumber;
      const startColumn = capStartLine === range.startLineNumber ? capStartColumn < range.startColumn ? range.startColumn : capStartColumn : capStartLine < range.startLineNumber ? range.startColumn : capStartColumn;
      const endColumn = capEndLine === range.endLineNumber ? capEndColumn > range.endColumn ? range.endColumn : capEndColumn : capEndLine > range.endLineNumber ? range.endColumn : capEndColumn;
      const injectionRange = new Range(startLine, startColumn, endLine, endColumn);
      const injection = this._getInjectionCaptures(capture, injectionRange);
      if (injection && injection.length > 0) {
        captures.splice(i + 1, 0, ...injection);
        i += injection.length;
      }
    }
    return captures;
  }
  /**
   * Gets the tokens for a given line.
   * Each token takes 2 elements in the array. The first element is the offset of the end of the token *in the line, not in the document*, and the second element is the metadata.
   *
   * @param lineNumber
   * @returns
   */
  tokenizeEncoded(lineNumber) {
    const tokens = this._tokenizeEncoded(lineNumber);
    if (!tokens) {
      return void 0;
    }
    const updates = this._rangeTokensAsUpdates(this._textModel.getOffsetAt({ lineNumber, column: 1 }), tokens.result);
    if (tokens.versionId === this._textModel.getVersionId()) {
      this._updateTokensInStore(tokens.versionId, [{ newTokens: updates, oldRangeLength: this._textModel.getLineLength(lineNumber) }], TokenQuality.Accurate);
    }
  }
  tokenizeEncodedInstrumented(lineNumber) {
    const tokens = this._tokenizeEncoded(lineNumber);
    if (!tokens) {
      return void 0;
    }
    return { result: this._endOffsetTokensToUint32Array(tokens.result), captureTime: tokens.captureTime, metadataTime: tokens.metadataTime };
  }
  _getCaptures(range) {
    const captures = this.captureAtRangeWithInjections(range);
    return captures;
  }
  _tokenize(range, rangeStartOffset, rangeEndOffset) {
    const captures = this._getCaptures(range);
    const result = this._tokenizeCapturesWithMetadata(captures, rangeStartOffset, rangeEndOffset);
    if (!result) {
      return void 0;
    }
    return { ...result, versionId: this._tree.treeLastParsedVersion.get() };
  }
  _createTokensFromCaptures(captures, rangeStartOffset, rangeEndOffset) {
    const tree = this._tree.tree.get();
    const stopwatch = StopWatch.create();
    const rangeLength = rangeEndOffset - rangeStartOffset;
    const encodedLanguageId = this._languageIdCodec.encodeLanguageId(this._tree.languageId);
    const baseScope = TREESITTER_BASE_SCOPES[this._tree.languageId] || "source";
    if (captures.length === 0) {
      if (tree) {
        stopwatch.stop();
        const endOffsetsAndMetadata = [{ endOffset: rangeLength, scopes: [], encodedLanguageId }];
        return { endOffsets: endOffsetsAndMetadata, captureTime: stopwatch.elapsed() };
      }
      return void 0;
    }
    const endOffsetsAndScopes = Array(captures.length);
    endOffsetsAndScopes.fill({ endOffset: 0, scopes: [baseScope], encodedLanguageId });
    let tokenIndex = 0;
    const increaseSizeOfTokensByOneToken = () => {
      endOffsetsAndScopes.push({ endOffset: 0, scopes: [baseScope], encodedLanguageId });
    };
    const brackets = (capture, startOffset) => {
      return capture.name.includes("punctuation") && capture.text ? Array.from(capture.text.matchAll(BRACKETS)).map((match) => startOffset + match.index) : void 0;
    };
    const addCurrentTokenToArray = (capture, startOffset, endOffset, position) => {
      if (position !== void 0) {
        const oldScopes = endOffsetsAndScopes[position].scopes;
        let oldBracket = endOffsetsAndScopes[position].bracket;
        const prevEndOffset = position > 0 ? endOffsetsAndScopes[position - 1].endOffset : 0;
        if (prevEndOffset !== startOffset) {
          let preInsertBracket = void 0;
          if (oldBracket && oldBracket.length > 0) {
            preInsertBracket = [];
            const postInsertBracket = [];
            for (let i = 0; i < oldBracket.length; i++) {
              const bracket = oldBracket[i];
              if (bracket < startOffset) {
                preInsertBracket.push(bracket);
              } else if (bracket > endOffset) {
                postInsertBracket.push(bracket);
              }
            }
            if (preInsertBracket.length === 0) {
              preInsertBracket = void 0;
            }
            if (postInsertBracket.length === 0) {
              oldBracket = void 0;
            } else {
              oldBracket = postInsertBracket;
            }
          }
          endOffsetsAndScopes.splice(position, 0, { endOffset: startOffset, scopes: [...oldScopes], bracket: preInsertBracket, encodedLanguageId: capture.encodedLanguageId });
          position++;
          increaseSizeOfTokensByOneToken();
          tokenIndex++;
        }
        endOffsetsAndScopes.splice(position, 0, { endOffset, scopes: [...oldScopes, capture.name], bracket: brackets(capture, startOffset), encodedLanguageId: capture.encodedLanguageId });
        endOffsetsAndScopes[tokenIndex].bracket = oldBracket;
      } else {
        endOffsetsAndScopes[tokenIndex] = { endOffset, scopes: [baseScope, capture.name], bracket: brackets(capture, startOffset), encodedLanguageId: capture.encodedLanguageId };
      }
      tokenIndex++;
    };
    for (let captureIndex = 0; captureIndex < captures.length; captureIndex++) {
      const capture = captures[captureIndex];
      const tokenEndIndex = capture.node.endIndex < rangeEndOffset ? capture.node.endIndex < rangeStartOffset ? rangeStartOffset : capture.node.endIndex : rangeEndOffset;
      const tokenStartIndex = capture.node.startIndex < rangeStartOffset ? rangeStartOffset : capture.node.startIndex;
      const endOffset = tokenEndIndex - rangeStartOffset;
      let previousEndOffset;
      const currentTokenLength = tokenEndIndex - tokenStartIndex;
      if (captureIndex > 0) {
        previousEndOffset = endOffsetsAndScopes[tokenIndex - 1].endOffset;
      } else {
        previousEndOffset = tokenStartIndex - rangeStartOffset - 1;
      }
      const startOffset = endOffset - currentTokenLength;
      if (previousEndOffset >= 0 && previousEndOffset < startOffset) {
        endOffsetsAndScopes[tokenIndex] = { endOffset: startOffset, scopes: [baseScope], encodedLanguageId: this._encodedLanguageId };
        tokenIndex++;
        increaseSizeOfTokensByOneToken();
      }
      if (currentTokenLength < 0) {
        continue;
      }
      if (previousEndOffset >= endOffset) {
        let withinTokenIndex = tokenIndex - 1;
        let previousTokenEndOffset = endOffsetsAndScopes[withinTokenIndex].endOffset;
        let previousTokenStartOffset = withinTokenIndex >= 2 ? endOffsetsAndScopes[withinTokenIndex - 1].endOffset : 0;
        do {
          if (previousTokenStartOffset + currentTokenLength === previousTokenEndOffset) {
            if (previousTokenStartOffset === startOffset) {
              endOffsetsAndScopes[withinTokenIndex].scopes.push(capture.name);
              const oldBracket = endOffsetsAndScopes[withinTokenIndex].bracket;
              endOffsetsAndScopes[withinTokenIndex].bracket = oldBracket && oldBracket.length > 0 ? oldBracket : brackets(capture, startOffset);
            }
          } else if (previousTokenStartOffset <= startOffset) {
            addCurrentTokenToArray(capture, startOffset, endOffset, withinTokenIndex);
            break;
          }
          withinTokenIndex--;
          previousTokenStartOffset = withinTokenIndex >= 1 ? endOffsetsAndScopes[withinTokenIndex - 1].endOffset : 0;
          previousTokenEndOffset = withinTokenIndex >= 0 ? endOffsetsAndScopes[withinTokenIndex].endOffset : 0;
        } while (previousTokenEndOffset > startOffset);
      } else {
        addCurrentTokenToArray(capture, startOffset, endOffset);
      }
    }
    if (endOffsetsAndScopes[tokenIndex - 1].endOffset < rangeLength) {
      if (rangeLength - endOffsetsAndScopes[tokenIndex - 1].endOffset > 0) {
        increaseSizeOfTokensByOneToken();
        endOffsetsAndScopes[tokenIndex] = { endOffset: rangeLength, scopes: endOffsetsAndScopes[tokenIndex].scopes, encodedLanguageId: this._encodedLanguageId };
        tokenIndex++;
      }
    }
    for (let i = 0; i < endOffsetsAndScopes.length; i++) {
      const token = endOffsetsAndScopes[i];
      if (token.endOffset === 0 && i !== 0) {
        endOffsetsAndScopes.splice(i, endOffsetsAndScopes.length - i);
        break;
      }
    }
    const captureTime = stopwatch.elapsed();
    return { endOffsets: endOffsetsAndScopes, captureTime };
  }
  _getInjectionCaptures(parentCapture, range) {
    return [];
  }
  _tokenizeCapturesWithMetadata(captures, rangeStartOffset, rangeEndOffset) {
    const stopwatch = StopWatch.create();
    const emptyTokens = this._createTokensFromCaptures(captures, rangeStartOffset, rangeEndOffset);
    if (!emptyTokens) {
      return void 0;
    }
    const endOffsetsAndScopes = emptyTokens.endOffsets;
    for (let i = 0; i < endOffsetsAndScopes.length; i++) {
      const token = endOffsetsAndScopes[i];
      token.metadata = this._treeSitterThemeService.findMetadata(token.scopes, token.encodedLanguageId, !!token.bracket && token.bracket.length > 0, void 0);
    }
    const metadataTime = stopwatch.elapsed();
    return { endOffsetsAndMetadata: endOffsetsAndScopes, captureTime: emptyTokens.captureTime, metadataTime };
  }
  _tokenizeEncoded(lineNumber) {
    const lineOffset = this._textModel.getOffsetAt({ lineNumber, column: 1 });
    const maxLine = this._textModel.getLineCount();
    const lineEndOffset = lineNumber + 1 <= maxLine ? this._textModel.getOffsetAt({ lineNumber: lineNumber + 1, column: 1 }) : this._textModel.getValueLength();
    const lineLength = lineEndOffset - lineOffset;
    const result = this._tokenize(new Range(lineNumber, 1, lineNumber, lineLength + 1), lineOffset, lineEndOffset);
    if (!result) {
      return void 0;
    }
    return { result: result.endOffsetsAndMetadata, captureTime: result.captureTime, metadataTime: result.metadataTime, versionId: result.versionId };
  }
  _endOffsetTokensToUint32Array(endOffsetsAndMetadata) {
    const uint32Array = new Uint32Array(endOffsetsAndMetadata.length * 2);
    for (let i = 0; i < endOffsetsAndMetadata.length; i++) {
      uint32Array[i * 2] = endOffsetsAndMetadata[i].endOffset;
      uint32Array[i * 2 + 1] = endOffsetsAndMetadata[i].metadata;
    }
    return uint32Array;
  }
};
TreeSitterTokenizationImpl = __decorateClass([
  __decorateParam(4, ITreeSitterThemeService)
], TreeSitterTokenizationImpl);
const TREESITTER_BASE_SCOPES = {
  "css": "source.css",
  "typescript": "source.ts",
  "ini": "source.ini",
  "regex": "source.regex"
};
const BRACKETS = /[\{\}\[\]\<\>\(\)]/g;
export {
  TREESITTER_BASE_SCOPES,
  TreeSitterTokenizationImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXHRva2Vuc1xcdHJlZVNpdHRlclxcdHJlZVNpdHRlclRva2VuaXphdGlvbkltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgc2V0VGltZW91dDAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VJZCB9IGZyb20gJy4uLy4uLy4uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlSWRDb2RlYywgUXVlcnlDYXB0dXJlIH0gZnJvbSAnLi4vLi4vLi4vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQsIElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBmaW5kTGlrZWx5UmVsZXZhbnRMaW5lcyB9IGZyb20gJy4uLy4uL3RleHRNb2RlbFRva2Vucy5qcyc7XG5pbXBvcnQgeyBUb2tlblN0b3JlLCBUb2tlblVwZGF0ZSwgVG9rZW5RdWFsaXR5IH0gZnJvbSAnLi90b2tlblN0b3JlLmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJUcmVlLCBSYW5nZUNoYW5nZSwgUmFuZ2VXaXRoT2Zmc2V0cyB9IGZyb20gJy4vdHJlZVNpdHRlclRyZWUuanMnO1xuaW1wb3J0IHR5cGUgKiBhcyBUcmVlU2l0dGVyIGZyb20gJ0B2c2NvZGUvdHJlZS1zaXR0ZXItd2FzbSc7XG5pbXBvcnQgeyBhdXRvcnVuLCBhdXRvcnVuSGFuZGxlQ2hhbmdlcywgSU9ic2VydmFibGUsIHJlY29yZENoYW5nZXMsIHJ1bk9uQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgTGluZVRva2VucyB9IGZyb20gJy4uLy4uLy4uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVRyZWVTaXR0ZXJUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90cmVlU2l0dGVyL3RyZWVTaXR0ZXJUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuZXhwb3J0IGNsYXNzIFRyZWVTaXR0ZXJUb2tlbml6YXRpb25JbXBsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuU3RvcmU6IFRva2VuU3RvcmU7XG5cdHByaXZhdGUgX2FjY3VyYXRlVmVyc2lvbjogbnVtYmVyO1xuXHRwcml2YXRlIF9ndWVzc1ZlcnNpb246IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRva2VuczogRW1pdHRlcjx7IGNoYW5nZXM6IElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCB9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyKCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VUb2tlbnM6IEV2ZW50PHsgY2hhbmdlczogSU1vZGVsVG9rZW5zQ2hhbmdlZEV2ZW50IH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VUb2tlbnMuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ29tcGxldGVCYWNrZ3JvdW5kVG9rZW5pemF0aW9uOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXIoKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUJhY2tncm91bmRUb2tlbml6YXRpb246IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDb21wbGV0ZUJhY2tncm91bmRUb2tlbml6YXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSBfZW5jb2RlZExhbmd1YWdlSWQ6IExhbmd1YWdlSWQ7XG5cblx0cHJpdmF0ZSBnZXQgX3RleHRNb2RlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS50ZXh0TW9kZWw7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90cmVlOiBUcmVlU2l0dGVyVHJlZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oaWdobGlnaHRpbmdRdWVyaWVzOiBUcmVlU2l0dGVyLlF1ZXJ5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlSWRDb2RlYzogSUxhbmd1YWdlSWRDb2RlYyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlTGluZVJhbmdlczogSU9ic2VydmFibGU8cmVhZG9ubHkgTGluZVJhbmdlW10+LFxuXG5cdFx0QElUcmVlU2l0dGVyVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RyZWVTaXR0ZXJUaGVtZVNlcnZpY2U6IElUcmVlU2l0dGVyVGhlbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZW5jb2RlZExhbmd1YWdlSWQgPSB0aGlzLl9sYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZCh0aGlzLl90cmVlLmxhbmd1YWdlSWQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocnVuT25DaGFuZ2UodGhpcy5fdHJlZVNpdHRlclRoZW1lU2VydmljZS5vbkNoYW5nZSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlVGhlbWUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl90b2tlblN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRva2VuU3RvcmUodGhpcy5fdGV4dE1vZGVsKSk7XG5cdFx0dGhpcy5fYWNjdXJhdGVWZXJzaW9uID0gdGhpcy5fdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdHRoaXMuX2d1ZXNzVmVyc2lvbiA9IHRoaXMuX3RleHRNb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHR0aGlzLl90b2tlblN0b3JlLmJ1aWxkU3RvcmUodGhpcy5fY3JlYXRlRW1wdHlUb2tlbnMoKSwgVG9rZW5RdWFsaXR5Lk5vbmUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdmlzaWJsZUxpbmVSYW5nZXMgPSB0aGlzLl92aXNpYmxlTGluZVJhbmdlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9wYXJzZUFuZFRva2VuaXplVmlld1BvcnQodmlzaWJsZUxpbmVSYW5nZXMpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5IYW5kbGVDaGFuZ2VzKHtcblx0XHRcdG93bmVyOiB0aGlzLFxuXHRcdFx0Y2hhbmdlVHJhY2tlcjogcmVjb3JkQ2hhbmdlcyh7IHRyZWU6IHRoaXMuX3RyZWUudHJlZSB9KSxcblx0XHR9LCAocmVhZGVyLCBjdHgpID0+IHtcblx0XHRcdGNvbnN0IGNoYW5nZUV2ZW50ID0gY3R4LmNoYW5nZXMuYXQoMCk/LmNoYW5nZTtcblx0XHRcdGlmIChjdHguY2hhbmdlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1RoZSB0cmVlIGNoYW5nZWQgdHdpY2UgaW4gb25lIHRyYW5zYWN0aW9uLiBUaGlzIGlzIGN1cnJlbnRseSBub3Qgc3VwcG9ydGVkIGFuZCBzaG91bGQgbm90IGhhcHBlbi4nKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFjaGFuZ2VFdmVudCkge1xuXHRcdFx0XHRpZiAoY3R4LnRyZWUpIHtcblx0XHRcdFx0XHR0aGlzLl9maXJzdFRyZWVVcGRhdGUodGhpcy5fdHJlZS50cmVlTGFzdFBhcnNlZFZlcnNpb24ucmVhZChyZWFkZXIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMuaGFzVG9rZW5zKCkpIHtcblx0XHRcdFx0XHQvLyBNYXJrIHRoZSByYW5nZSBmb3IgcmVmcmVzaCBpbW1lZGlhdGVseVxuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiBjaGFuZ2VFdmVudC5yYW5nZXMpIHtcblx0XHRcdFx0XHRcdHRoaXMuX21hcmtGb3JSZWZyZXNoKHJhbmdlLm5ld1JhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBGaXJzdCB0aW1lIHdlIHNlZSBhIHRyZWUgd2UgbmVlZCB0byBidWlsZCBhIHRva2VuIHN0b3JlLlxuXHRcdFx0XHRpZiAoIXRoaXMuaGFzVG9rZW5zKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9maXJzdFRyZWVVcGRhdGUoY2hhbmdlRXZlbnQudmVyc2lvbklkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVUcmVlVXBkYXRlKGNoYW5nZUV2ZW50LnJhbmdlcywgY2hhbmdlRXZlbnQudmVyc2lvbklkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVDb250ZW50Q2hhbmdlZChlOiBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fZ3Vlc3NWZXJzaW9uID0gZS52ZXJzaW9uSWQ7XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgZS5jaGFuZ2VzKSB7XG5cdFx0XHRpZiAoY2hhbmdlLnRleHQubGVuZ3RoID4gY2hhbmdlLnJhbmdlTGVuZ3RoKSB7XG5cdFx0XHRcdC8vIElmIHBvc3NpYmxlLCB1c2UgdGhlIHRva2VuIGJlZm9yZSB0aGUgY2hhbmdlIGFzIHRoZSBzdGFydGluZyBwb2ludCBmb3IgdGhlIG5ldyB0b2tlbi5cblx0XHRcdFx0Ly8gVGhpcyBpcyBtb3JlIGxpa2VseSB0byBsZXQgdGhlIG5ldyB0ZXh0IGJlIHRoZSBjb3JyZWN0IGNvbG9yIGFzIHR5cGVpbmcgaXMgdXN1YWxseSBhdCB0aGUgZW5kIG9mIHRoZSB0b2tlbi5cblx0XHRcdFx0Y29uc3Qgb2Zmc2V0ID0gY2hhbmdlLnJhbmdlT2Zmc2V0ID4gMCA/IGNoYW5nZS5yYW5nZU9mZnNldCAtIDEgOiBjaGFuZ2UucmFuZ2VPZmZzZXQ7XG5cdFx0XHRcdGNvbnN0IG9sZFRva2VuID0gdGhpcy5fdG9rZW5TdG9yZS5nZXRUb2tlbkF0KG9mZnNldCk7XG5cdFx0XHRcdGxldCBuZXdUb2tlbjogVG9rZW5VcGRhdGU7XG5cdFx0XHRcdGlmIChvbGRUb2tlbikge1xuXHRcdFx0XHRcdC8vIEluc2VydC4gSnVzdCBncm93IHRoZSB0b2tlbiBhdCB0aGlzIHBvc2l0aW9uIHRvIGluY2x1ZGUgdGhlIGluc2VydC5cblx0XHRcdFx0XHRuZXdUb2tlbiA9IHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IG9sZFRva2VuLnN0YXJ0T2Zmc2V0SW5jbHVzaXZlLCBsZW5ndGg6IG9sZFRva2VuLmxlbmd0aCArIGNoYW5nZS50ZXh0Lmxlbmd0aCAtIGNoYW5nZS5yYW5nZUxlbmd0aCwgdG9rZW46IG9sZFRva2VuLnRva2VuIH07XG5cdFx0XHRcdFx0Ly8gQWxzbyBtYXJrIHRva2VucyB0aGF0IGFyZSBpbiB0aGUgcmFuZ2Ugb2YgdGhlIGNoYW5nZSBhcyBuZWVkaW5nIGEgcmVmcmVzaC5cblx0XHRcdFx0XHR0aGlzLl90b2tlblN0b3JlLm1hcmtGb3JSZWZyZXNoKG9mZnNldCwgY2hhbmdlLnJhbmdlT2Zmc2V0ICsgKGNoYW5nZS50ZXh0Lmxlbmd0aCA+IGNoYW5nZS5yYW5nZUxlbmd0aCA/IGNoYW5nZS50ZXh0Lmxlbmd0aCA6IGNoYW5nZS5yYW5nZUxlbmd0aCkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIFRoZSBkb2N1bWVudCBnb3QgbGFyZ2VyIGFuZCB0aGUgY2hhbmdlIGlzIGF0IHRoZSBlbmQgb2YgdGhlIGRvY3VtZW50LlxuXHRcdFx0XHRcdG5ld1Rva2VuID0geyBzdGFydE9mZnNldEluY2x1c2l2ZTogb2Zmc2V0LCBsZW5ndGg6IGNoYW5nZS50ZXh0Lmxlbmd0aCwgdG9rZW46IDAgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl90b2tlblN0b3JlLnVwZGF0ZShvbGRUb2tlbj8ubGVuZ3RoID8/IDAsIFtuZXdUb2tlbl0sIFRva2VuUXVhbGl0eS5FZGl0R3Vlc3MpO1xuXHRcdFx0fSBlbHNlIGlmIChjaGFuZ2UudGV4dC5sZW5ndGggPCBjaGFuZ2UucmFuZ2VMZW5ndGgpIHtcblx0XHRcdFx0Ly8gRGVsZXRlLiBEZWxldGUgdGhlIHRva2VucyBhdCB0aGUgY29ycmVzcG9uZGluZyByYW5nZS5cblx0XHRcdFx0Y29uc3QgZGVsZXRlZENoYXJDb3VudCA9IGNoYW5nZS5yYW5nZUxlbmd0aCAtIGNoYW5nZS50ZXh0Lmxlbmd0aDtcblx0XHRcdFx0dGhpcy5fdG9rZW5TdG9yZS5kZWxldGUoZGVsZXRlZENoYXJDb3VudCwgY2hhbmdlLnJhbmdlT2Zmc2V0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyOiBudW1iZXIpIHtcblx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5fdGV4dE1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHJhd1Rva2VucyA9IHRoaXMuZ2V0VG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdHJldHVybiBuZXcgTGluZVRva2VucyhyYXdUb2tlbnMsIGNvbnRlbnQsIHRoaXMuX2xhbmd1YWdlSWRDb2RlYyk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVFbXB0eVRva2VucygpIHtcblx0XHRjb25zdCBlbXB0eVRva2VuID0gdGhpcy5fZW1wdHlUb2tlbigpO1xuXHRcdGNvbnN0IG1vZGVsRW5kT2Zmc2V0ID0gdGhpcy5fdGV4dE1vZGVsLmdldFZhbHVlTGVuZ3RoKCk7XG5cblx0XHRjb25zdCBlbXB0eVRva2VuczogVG9rZW5VcGRhdGVbXSA9IFt0aGlzLl9lbXB0eVRva2Vuc0Zvck9mZnNldEFuZExlbmd0aCgwLCBtb2RlbEVuZE9mZnNldCwgZW1wdHlUb2tlbildO1xuXHRcdHJldHVybiBlbXB0eVRva2Vucztcblx0fVxuXG5cdHByaXZhdGUgX2VtcHR5VG9rZW4oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWVTaXR0ZXJUaGVtZVNlcnZpY2UuZmluZE1ldGFkYXRhKFtdLCB0aGlzLl9lbmNvZGVkTGFuZ3VhZ2VJZCwgZmFsc2UsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9lbXB0eVRva2Vuc0Zvck9mZnNldEFuZExlbmd0aChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIsIGVtcHR5VG9rZW46IG51bWJlcik6IFRva2VuVXBkYXRlIHtcblx0XHRyZXR1cm4geyB0b2tlbjogZW1wdHlUb2tlbiwgbGVuZ3RoOiBvZmZzZXQgKyBsZW5ndGgsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwIH07XG5cdH1cblxuXHRwdWJsaWMgaGFzQWNjdXJhdGVUb2tlbnNGb3JMaW5lKGxpbmVOdW1iZXI6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmhhc1Rva2VucyhuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgdGhpcy5fdGV4dE1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpKTtcblx0fVxuXG5cdHB1YmxpYyB0b2tlbml6ZUxpbmVzQXQobGluZU51bWJlcjogbnVtYmVyLCBsaW5lczogc3RyaW5nW10pOiBMaW5lVG9rZW5zW10gfCBudWxsIHtcblx0XHRjb25zdCByYXdMaW5lVG9rZW5zID0gdGhpcy5fZ3Vlc3NUb2tlbnNGb3JMaW5lc0NvbnRlbnQobGluZU51bWJlciwgbGluZXMpO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnM6IExpbmVUb2tlbnNbXSA9IFtdO1xuXHRcdGlmICghcmF3TGluZVRva2Vucykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmF3TGluZVRva2Vucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0bGluZVRva2Vucy5wdXNoKG5ldyBMaW5lVG9rZW5zKHJhd0xpbmVUb2tlbnNbaV0sIGxpbmVzW2ldLCB0aGlzLl9sYW5ndWFnZUlkQ29kZWMpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxpbmVUb2tlbnM7XG5cdH1cblxuXHRwcml2YXRlIF9yYW5nZUhhc1Rva2VucyhyYW5nZTogUmFuZ2UsIG1pbmltdW1Ub2tlblF1YWxpdHk6IFRva2VuUXVhbGl0eSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90b2tlblN0b3JlLnJhbmdlSGFzVG9rZW5zKHRoaXMuX3RleHRNb2RlbC5nZXRPZmZzZXRBdChyYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpLCB0aGlzLl90ZXh0TW9kZWwuZ2V0T2Zmc2V0QXQocmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSksIG1pbmltdW1Ub2tlblF1YWxpdHkpO1xuXHR9XG5cblx0cHVibGljIGhhc1Rva2VucyhhY2N1cmF0ZUZvclJhbmdlPzogUmFuZ2UpOiBib29sZWFuIHtcblx0XHRpZiAoIWFjY3VyYXRlRm9yUmFuZ2UgfHwgKHRoaXMuX2d1ZXNzVmVyc2lvbiA9PT0gdGhpcy5fYWNjdXJhdGVWZXJzaW9uKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICF0aGlzLl90b2tlblN0b3JlLnJhbmdlTmVlZHNSZWZyZXNoKHRoaXMuX3RleHRNb2RlbC5nZXRPZmZzZXRBdChhY2N1cmF0ZUZvclJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSksIHRoaXMuX3RleHRNb2RlbC5nZXRPZmZzZXRBdChhY2N1cmF0ZUZvclJhbmdlLmdldEVuZFBvc2l0aW9uKCkpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlbnMobGluZTogbnVtYmVyKTogVWludDMyQXJyYXkge1xuXHRcdGNvbnN0IGxpbmVTdGFydE9mZnNldCA9IHRoaXMuX3RleHRNb2RlbC5nZXRPZmZzZXRBdCh7IGxpbmVOdW1iZXI6IGxpbmUsIGNvbHVtbjogMSB9KTtcblx0XHRjb25zdCBsaW5lRW5kT2Zmc2V0ID0gdGhpcy5fdGV4dE1vZGVsLmdldE9mZnNldEF0KHsgbGluZU51bWJlcjogbGluZSwgY29sdW1uOiB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lKSArIDEgfSk7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IHRoaXMuX3Rva2VuU3RvcmUuZ2V0VG9rZW5zSW5SYW5nZShsaW5lU3RhcnRPZmZzZXQsIGxpbmVFbmRPZmZzZXQpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50MzJBcnJheShsaW5lVG9rZW5zLmxlbmd0aCAqIDIpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZVRva2Vucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0cmVzdWx0W2kgKiAyXSA9IGxpbmVUb2tlbnNbaV0uc3RhcnRPZmZzZXRJbmNsdXNpdmUgLSBsaW5lU3RhcnRPZmZzZXQgKyBsaW5lVG9rZW5zW2ldLmxlbmd0aDtcblx0XHRcdHJlc3VsdFtpICogMiArIDFdID0gbGluZVRva2Vuc1tpXS50b2tlbjtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldFRva2Vuc0luUmFuZ2UocmFuZ2U6IFJhbmdlLCByYW5nZVN0YXJ0T2Zmc2V0OiBudW1iZXIsIHJhbmdlRW5kT2Zmc2V0OiBudW1iZXIsIGNhcHR1cmVzPzogUXVlcnlDYXB0dXJlW10pOiBUb2tlblVwZGF0ZVtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0b2tlbnMgPSBjYXB0dXJlcyA/IHRoaXMuX3Rva2VuaXplQ2FwdHVyZXNXaXRoTWV0YWRhdGEoY2FwdHVyZXMsIHJhbmdlU3RhcnRPZmZzZXQsIHJhbmdlRW5kT2Zmc2V0KSA6IHRoaXMuX3Rva2VuaXplKHJhbmdlLCByYW5nZVN0YXJ0T2Zmc2V0LCByYW5nZUVuZE9mZnNldCk7XG5cdFx0aWYgKHRva2Vucz8uZW5kT2Zmc2V0c0FuZE1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmFuZ2VUb2tlbnNBc1VwZGF0ZXMocmFuZ2VTdGFydE9mZnNldCwgdG9rZW5zLmVuZE9mZnNldHNBbmRNZXRhZGF0YSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUb2tlbnNJblN0b3JlKHZlcnNpb246IG51bWJlciwgdXBkYXRlczogeyBvbGRSYW5nZUxlbmd0aD86IG51bWJlcjsgbmV3VG9rZW5zOiBUb2tlblVwZGF0ZVtdIH1bXSwgdG9rZW5RdWFsaXR5OiBUb2tlblF1YWxpdHkpOiB2b2lkIHtcblx0XHR0aGlzLl9hY2N1cmF0ZVZlcnNpb24gPSB2ZXJzaW9uO1xuXHRcdGZvciAoY29uc3QgdXBkYXRlIG9mIHVwZGF0ZXMpIHtcblx0XHRcdGNvbnN0IGxhc3RUb2tlbiA9IHVwZGF0ZS5uZXdUb2tlbnMubGVuZ3RoID4gMCA/IHVwZGF0ZS5uZXdUb2tlbnNbdXBkYXRlLm5ld1Rva2Vucy5sZW5ndGggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRcdGxldCBvbGRSYW5nZUxlbmd0aDogbnVtYmVyO1xuXHRcdFx0aWYgKGxhc3RUb2tlbiAmJiAodGhpcy5fZ3Vlc3NWZXJzaW9uID49IHZlcnNpb24pKSB7XG5cdFx0XHRcdG9sZFJhbmdlTGVuZ3RoID0gbGFzdFRva2VuLnN0YXJ0T2Zmc2V0SW5jbHVzaXZlICsgbGFzdFRva2VuLmxlbmd0aCAtIHVwZGF0ZS5uZXdUb2tlbnNbMF0uc3RhcnRPZmZzZXRJbmNsdXNpdmU7XG5cdFx0XHR9IGVsc2UgaWYgKHVwZGF0ZS5vbGRSYW5nZUxlbmd0aCkge1xuXHRcdFx0XHRvbGRSYW5nZUxlbmd0aCA9IHVwZGF0ZS5vbGRSYW5nZUxlbmd0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9sZFJhbmdlTGVuZ3RoID0gMDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rva2VuU3RvcmUudXBkYXRlKG9sZFJhbmdlTGVuZ3RoLCB1cGRhdGUubmV3VG9rZW5zLCB0b2tlblF1YWxpdHkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21hcmtGb3JSZWZyZXNoKHJhbmdlOiBSYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Rva2VuU3RvcmUubWFya0ZvclJlZnJlc2godGhpcy5fdGV4dE1vZGVsLmdldE9mZnNldEF0KHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSksIHRoaXMuX3RleHRNb2RlbC5nZXRPZmZzZXRBdChyYW5nZS5nZXRFbmRQb3NpdGlvbigpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXROZWVkc1JlZnJlc2goKTogeyByYW5nZTogUmFuZ2U7IHN0YXJ0T2Zmc2V0OiBudW1iZXI7IGVuZE9mZnNldDogbnVtYmVyIH1bXSB7XG5cdFx0Y29uc3QgbmVlZHNSZWZyZXNoT2Zmc2V0UmFuZ2VzID0gdGhpcy5fdG9rZW5TdG9yZS5nZXROZWVkc1JlZnJlc2goKTtcblx0XHRpZiAoIW5lZWRzUmVmcmVzaE9mZnNldFJhbmdlcykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gbmVlZHNSZWZyZXNoT2Zmc2V0UmFuZ2VzLm1hcChyYW5nZSA9PiAoe1xuXHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnModGhpcy5fdGV4dE1vZGVsLmdldFBvc2l0aW9uQXQocmFuZ2Uuc3RhcnRPZmZzZXQpLCB0aGlzLl90ZXh0TW9kZWwuZ2V0UG9zaXRpb25BdChyYW5nZS5lbmRPZmZzZXQpKSxcblx0XHRcdHN0YXJ0T2Zmc2V0OiByYW5nZS5zdGFydE9mZnNldCxcblx0XHRcdGVuZE9mZnNldDogcmFuZ2UuZW5kT2Zmc2V0XG5cdFx0fSkpO1xuXHR9XG5cblxuXHRwcml2YXRlIF9wYXJzZUFuZFRva2VuaXplVmlld1BvcnQobGluZVJhbmdlczogcmVhZG9ubHkgTGluZVJhbmdlW10pIHtcblx0XHRjb25zdCB2aWV3cG9ydFJhbmdlcyA9IGxpbmVSYW5nZXMubWFwKHIgPT4gci50b0luY2x1c2l2ZVJhbmdlKCkpLmZpbHRlcihpc0RlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgcmFuZ2Ugb2Ygdmlld3BvcnRSYW5nZXMpIHtcblx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0T2ZSYW5nZUluRG9jdW1lbnQgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0T2Zmc2V0QXQocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdGNvbnN0IGVuZE9mZnNldE9mUmFuZ2VJbkRvY3VtZW50ID0gdGhpcy5fdGV4dE1vZGVsLmdldE9mZnNldEF0KHJhbmdlLmdldEVuZFBvc2l0aW9uKCkpO1xuXHRcdFx0Y29uc3QgdmVyc2lvbiA9IHRoaXMuX3RleHRNb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0XHRcdGlmICh0aGlzLl9yYW5nZUhhc1Rva2VucyhyYW5nZSwgVG9rZW5RdWFsaXR5LlZpZXdwb3J0R3Vlc3MpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29udGVudCA9IHRoaXMuX3RleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpO1xuXHRcdFx0Y29uc3QgdG9rZW5VcGRhdGVzID0gdGhpcy5fZm9yY2VQYXJzZUFuZFRva2VuaXplQ29udGVudChyYW5nZSwgc3RhcnRPZmZzZXRPZlJhbmdlSW5Eb2N1bWVudCwgZW5kT2Zmc2V0T2ZSYW5nZUluRG9jdW1lbnQsIGNvbnRlbnQsIHRydWUpO1xuXHRcdFx0aWYgKCF0b2tlblVwZGF0ZXMgfHwgdGhpcy5fcmFuZ2VIYXNUb2tlbnMocmFuZ2UsIFRva2VuUXVhbGl0eS5WaWV3cG9ydEd1ZXNzKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0b2tlblVwZGF0ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGFzdFRva2VuID0gdG9rZW5VcGRhdGVzW3Rva2VuVXBkYXRlcy5sZW5ndGggLSAxXTtcblx0XHRcdGNvbnN0IG9sZFJhbmdlTGVuZ3RoID0gbGFzdFRva2VuLnN0YXJ0T2Zmc2V0SW5jbHVzaXZlICsgbGFzdFRva2VuLmxlbmd0aCAtIHRva2VuVXBkYXRlc1swXS5zdGFydE9mZnNldEluY2x1c2l2ZTtcblx0XHRcdHRoaXMuX3VwZGF0ZVRva2Vuc0luU3RvcmUodmVyc2lvbiwgW3sgbmV3VG9rZW5zOiB0b2tlblVwZGF0ZXMsIG9sZFJhbmdlTGVuZ3RoIH1dLCBUb2tlblF1YWxpdHkuVmlld3BvcnRHdWVzcyk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRva2Vucy5maXJlKHsgY2hhbmdlczogeyBzZW1hbnRpY1Rva2Vuc0FwcGxpZWQ6IGZhbHNlLCByYW5nZXM6IFt7IGZyb21MaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIsIHRvTGluZU51bWJlcjogcmFuZ2UuZW5kTGluZU51bWJlciB9XSB9IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2d1ZXNzVG9rZW5zRm9yTGluZXNDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlciwgbGluZXM6IHN0cmluZ1tdKTogVWludDMyQXJyYXlbXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGxpbmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBsaW5lcy5qb2luKHRoaXMuX3RleHRNb2RlbC5nZXRFT0woKSk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoMSwgMSwgbGluZU51bWJlciArIGxpbmVzLmxlbmd0aCwgbGluZXNbbGluZXMubGVuZ3RoIC0gMV0ubGVuZ3RoICsgMSk7XG5cdFx0Y29uc3Qgc3RhcnRPZmZzZXQgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0T2Zmc2V0QXQoeyBsaW5lTnVtYmVyLCBjb2x1bW46IDEgfSk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdGhpcy5fZm9yY2VQYXJzZUFuZFRva2VuaXplQ29udGVudChyYW5nZSwgc3RhcnRPZmZzZXQsIHN0YXJ0T2Zmc2V0ICsgbGluZUNvbnRlbnQubGVuZ3RoLCBsaW5lQ29udGVudCwgZmFsc2UpO1xuXHRcdGlmICghdG9rZW5zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbnNCeUxpbmU6IFVpbnQzMkFycmF5W10gPSBuZXcgQXJyYXkobGluZXMubGVuZ3RoKTtcblx0XHRsZXQgdG9rZW5zSW5kZXg6IG51bWJlciA9IDA7XG5cdFx0bGV0IHRva2VuU3RhcnRPZmZzZXQgPSAwO1xuXHRcdGxldCBsaW5lU3RhcnRPZmZzZXQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHRva2Vuc0ZvckxpbmU6IEVuZE9mZnNldFRva2VuW10gPSBbXTtcblx0XHRcdGxldCBtb3ZlVG9OZXh0TGluZSA9IGZhbHNlO1xuXHRcdFx0Zm9yIChsZXQgaiA9IHRva2Vuc0luZGV4OyAoIW1vdmVUb05leHRMaW5lICYmIChqIDwgdG9rZW5zLmxlbmd0aCkpOyBqKyspIHtcblx0XHRcdFx0Y29uc3QgdG9rZW4gPSB0b2tlbnNbal07XG5cdFx0XHRcdGNvbnN0IGxpbmVBZGp1c3RlZEVuZE9mZnNldCA9IHRva2VuLmVuZE9mZnNldCAtIGxpbmVTdGFydE9mZnNldDtcblx0XHRcdFx0Y29uc3QgbGluZUFkanVzdGVkU3RhcnRPZmZzZXQgPSB0b2tlblN0YXJ0T2Zmc2V0IC0gbGluZVN0YXJ0T2Zmc2V0O1xuXHRcdFx0XHRpZiAobGluZUFkanVzdGVkRW5kT2Zmc2V0IDw9IGxpbmVzW2ldLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRva2Vuc0ZvckxpbmUucHVzaCh7IGVuZE9mZnNldDogbGluZUFkanVzdGVkRW5kT2Zmc2V0LCBtZXRhZGF0YTogdG9rZW4ubWV0YWRhdGEgfSk7XG5cdFx0XHRcdFx0dG9rZW5zSW5kZXgrKztcblx0XHRcdFx0fSBlbHNlIGlmIChsaW5lQWRqdXN0ZWRTdGFydE9mZnNldCA8IGxpbmVzW2ldLmxlbmd0aCkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnRpYWxUb2tlbjogRW5kT2Zmc2V0VG9rZW4gPSB7IGVuZE9mZnNldDogbGluZXNbaV0ubGVuZ3RoLCBtZXRhZGF0YTogdG9rZW4ubWV0YWRhdGEgfTtcblx0XHRcdFx0XHR0b2tlbnNGb3JMaW5lLnB1c2gocGFydGlhbFRva2VuKTtcblx0XHRcdFx0XHRtb3ZlVG9OZXh0TGluZSA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bW92ZVRvTmV4dExpbmUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRva2VuU3RhcnRPZmZzZXQgPSB0b2tlbi5lbmRPZmZzZXQ7XG5cdFx0XHR9XG5cblx0XHRcdHRva2Vuc0J5TGluZVtpXSA9IHRoaXMuX2VuZE9mZnNldFRva2Vuc1RvVWludDMyQXJyYXkodG9rZW5zRm9yTGluZSk7XG5cdFx0XHRsaW5lU3RhcnRPZmZzZXQgKz0gbGluZXNbaV0ubGVuZ3RoICsgdGhpcy5fdGV4dE1vZGVsLmdldEVPTCgpLmxlbmd0aDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9rZW5zQnlMaW5lO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9yY2VQYXJzZUFuZFRva2VuaXplQ29udGVudChyYW5nZTogUmFuZ2UsIHN0YXJ0T2Zmc2V0T2ZSYW5nZUluRG9jdW1lbnQ6IG51bWJlciwgZW5kT2Zmc2V0T2ZSYW5nZUluRG9jdW1lbnQ6IG51bWJlciwgY29udGVudDogc3RyaW5nLCBhc1VwZGF0ZTogdHJ1ZSk6IFRva2VuVXBkYXRlW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ZvcmNlUGFyc2VBbmRUb2tlbml6ZUNvbnRlbnQocmFuZ2U6IFJhbmdlLCBzdGFydE9mZnNldE9mUmFuZ2VJbkRvY3VtZW50OiBudW1iZXIsIGVuZE9mZnNldE9mUmFuZ2VJbkRvY3VtZW50OiBudW1iZXIsIGNvbnRlbnQ6IHN0cmluZywgYXNVcGRhdGU6IGZhbHNlKTogRW5kT2Zmc2V0VG9rZW5bXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZm9yY2VQYXJzZUFuZFRva2VuaXplQ29udGVudChyYW5nZTogUmFuZ2UsIHN0YXJ0T2Zmc2V0T2ZSYW5nZUluRG9jdW1lbnQ6IG51bWJlciwgZW5kT2Zmc2V0T2ZSYW5nZUluRG9jdW1lbnQ6IG51bWJlciwgY29udGVudDogc3RyaW5nLCBhc1VwZGF0ZTogYm9vbGVhbik6IEVuZE9mZnNldFRva2VuW10gfCBUb2tlblVwZGF0ZVtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsaWtlbHlSZWxldmFudExpbmVzID0gZmluZExpa2VseVJlbGV2YW50TGluZXModGhpcy5fdGV4dE1vZGVsLCByYW5nZS5zdGFydExpbmVOdW1iZXIpLmxpa2VseVJlbGV2YW50TGluZXM7XG5cdFx0Y29uc3QgbGlrZWx5UmVsZXZhbnRQcmVmaXggPSBsaWtlbHlSZWxldmFudExpbmVzLmpvaW4odGhpcy5fdGV4dE1vZGVsLmdldEVPTCgpKTtcblxuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLl90cmVlLmNyZWF0ZVBhcnNlZFRyZWVTeW5jKGAke2xpa2VseVJlbGV2YW50UHJlZml4fSR7Y29udGVudH1gKTtcblx0XHRpZiAoIXRyZWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0cmVlUmFuZ2UgPSBuZXcgUmFuZ2UoMSwgMSwgcmFuZ2UuZW5kTGluZU51bWJlciAtIHJhbmdlLnN0YXJ0TGluZU51bWJlciArIDEgKyBsaWtlbHlSZWxldmFudExpbmVzLmxlbmd0aCwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHRjb25zdCBjYXB0dXJlcyA9IHRoaXMuY2FwdHVyZUF0UmFuZ2UodHJlZVJhbmdlKTtcblx0XHRjb25zdCB0b2tlbnMgPSB0aGlzLl90b2tlbml6ZUNhcHR1cmVzV2l0aE1ldGFkYXRhKGNhcHR1cmVzLCBsaWtlbHlSZWxldmFudFByZWZpeC5sZW5ndGgsIGVuZE9mZnNldE9mUmFuZ2VJbkRvY3VtZW50IC0gc3RhcnRPZmZzZXRPZlJhbmdlSW5Eb2N1bWVudCArIGxpa2VseVJlbGV2YW50UHJlZml4Lmxlbmd0aCk7XG5cdFx0dHJlZS5kZWxldGUoKTtcblxuXHRcdGlmICghdG9rZW5zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGFzVXBkYXRlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmFuZ2VUb2tlbnNBc1VwZGF0ZXMoc3RhcnRPZmZzZXRPZlJhbmdlSW5Eb2N1bWVudCwgdG9rZW5zLmVuZE9mZnNldHNBbmRNZXRhZGF0YSwgbGlrZWx5UmVsZXZhbnRQcmVmaXgubGVuZ3RoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRva2Vucy5lbmRPZmZzZXRzQW5kTWV0YWRhdGE7XG5cdFx0fVxuXHR9XG5cblxuXHRwcml2YXRlIF9maXJzdFRyZWVVcGRhdGUodmVyc2lvbklkOiBudW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2V0Vmlld1BvcnRUb2tlbnModmVyc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFZpZXdQb3J0VG9rZW5zKHZlcnNpb25JZDogbnVtYmVyKSB7XG5cdFx0Y29uc3QgcmFuZ2VDaGFuZ2VzID0gdGhpcy5fdmlzaWJsZUxpbmVSYW5nZXMuZ2V0KCkubWFwPFJhbmdlQ2hhbmdlIHwgdW5kZWZpbmVkPihsaW5lUmFuZ2UgPT4ge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBsaW5lUmFuZ2UudG9JbmNsdXNpdmVSYW5nZSgpO1xuXHRcdFx0aWYgKCFyYW5nZSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRjb25zdCBuZXdSYW5nZVN0YXJ0T2Zmc2V0ID0gdGhpcy5fdGV4dE1vZGVsLmdldE9mZnNldEF0KHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRjb25zdCBuZXdSYW5nZUVuZE9mZnNldCA9IHRoaXMuX3RleHRNb2RlbC5nZXRPZmZzZXRBdChyYW5nZS5nZXRFbmRQb3NpdGlvbigpKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG5ld1JhbmdlOiByYW5nZSxcblx0XHRcdFx0bmV3UmFuZ2VFbmRPZmZzZXQsXG5cdFx0XHRcdG5ld1JhbmdlU3RhcnRPZmZzZXQsXG5cdFx0XHR9O1xuXHRcdH0pLmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2hhbmRsZVRyZWVVcGRhdGUocmFuZ2VDaGFuZ2VzLCB2ZXJzaW9uSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERvIG5vdCBhd2FpdCBpbiB0aGlzIG1ldGhvZCwgaXQgd2lsbCBjYXVzZSBhIHJhY2Vcblx0ICovXG5cdHByaXZhdGUgX2hhbmRsZVRyZWVVcGRhdGUocmFuZ2VzOiBSYW5nZUNoYW5nZVtdLCB2ZXJzaW9uSWQ6IG51bWJlcikge1xuXHRcdGNvbnN0IHJhbmdlQ2hhbmdlczogUmFuZ2VXaXRoT2Zmc2V0c1tdID0gW107XG5cdFx0Y29uc3QgY2h1bmtTaXplID0gMTAwMDtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCByYW5nZUxpbmVzTGVuZ3RoID0gcmFuZ2VzW2ldLm5ld1JhbmdlLmVuZExpbmVOdW1iZXIgLSByYW5nZXNbaV0ubmV3UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0aWYgKHJhbmdlTGluZXNMZW5ndGggPiBjaHVua1NpemUpIHtcblx0XHRcdFx0Ly8gU3BsaXQgdGhlIHJhbmdlIGludG8gY2h1bmtzIHRvIGF2b2lkIGxvbmcgb3BlcmF0aW9uc1xuXHRcdFx0XHRjb25zdCBmdWxsUmFuZ2VFbmRMaW5lTnVtYmVyID0gcmFuZ2VzW2ldLm5ld1JhbmdlLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdGxldCBjaHVua0xpbmVTdGFydCA9IHJhbmdlc1tpXS5uZXdSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdGxldCBjaHVua0NvbHVtblN0YXJ0ID0gcmFuZ2VzW2ldLm5ld1JhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdFx0XHRsZXQgY2h1bmtMaW5lRW5kID0gY2h1bmtMaW5lU3RhcnQgKyBjaHVua1NpemU7XG5cdFx0XHRcdGRvIHtcblx0XHRcdFx0XHRjb25zdCBjaHVua1N0YXJ0aW5nUG9zaXRpb24gPSBuZXcgUG9zaXRpb24oY2h1bmtMaW5lU3RhcnQsIGNodW5rQ29sdW1uU3RhcnQpO1xuXHRcdFx0XHRcdGNvbnN0IGNodW5rRW5kQ29sdW1uID0gKChjaHVua0xpbmVFbmQgPT09IHJhbmdlc1tpXS5uZXdSYW5nZS5lbmRMaW5lTnVtYmVyKSA/IHJhbmdlc1tpXS5uZXdSYW5nZS5lbmRDb2x1bW4gOiB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZU1heENvbHVtbihjaHVua0xpbmVFbmQpKTtcblx0XHRcdFx0XHRjb25zdCBjaHVua0VuZFBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGNodW5rTGluZUVuZCwgY2h1bmtFbmRDb2x1bW4pO1xuXHRcdFx0XHRcdGNvbnN0IGNodW5rUmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGNodW5rU3RhcnRpbmdQb3NpdGlvbiwgY2h1bmtFbmRQb3NpdGlvbik7XG5cblx0XHRcdFx0XHRyYW5nZUNoYW5nZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZTogY2h1bmtSYW5nZSxcblx0XHRcdFx0XHRcdHN0YXJ0T2Zmc2V0OiB0aGlzLl90ZXh0TW9kZWwuZ2V0T2Zmc2V0QXQoY2h1bmtSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpLFxuXHRcdFx0XHRcdFx0ZW5kT2Zmc2V0OiB0aGlzLl90ZXh0TW9kZWwuZ2V0T2Zmc2V0QXQoY2h1bmtSYW5nZS5nZXRFbmRQb3NpdGlvbigpKVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0Y2h1bmtMaW5lU3RhcnQgPSBjaHVua0xpbmVFbmQgKyAxO1xuXHRcdFx0XHRcdGNodW5rQ29sdW1uU3RhcnQgPSAxO1xuXHRcdFx0XHRcdGlmIChjaHVua0xpbmVFbmQgPCBmdWxsUmFuZ2VFbmRMaW5lTnVtYmVyICYmIGNodW5rTGluZUVuZCArIGNodW5rU2l6ZSA+IGZ1bGxSYW5nZUVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdGNodW5rTGluZUVuZCA9IGZ1bGxSYW5nZUVuZExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNodW5rTGluZUVuZCA9IGNodW5rTGluZUVuZCArIGNodW5rU2l6ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gd2hpbGUgKGNodW5rTGluZUVuZCA8PSBmdWxsUmFuZ2VFbmRMaW5lTnVtYmVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIENoZWNrIHRoYXQgdGhlIHByZXZpb3VzIHJhbmdlIGRvZXNuJ3Qgb3ZlcmxhcFxuXHRcdFx0XHRpZiAoKGkgPT09IDApIHx8IChyYW5nZUNoYW5nZXNbaSAtIDFdLmVuZE9mZnNldCA8IHJhbmdlc1tpXS5uZXdSYW5nZVN0YXJ0T2Zmc2V0KSkge1xuXHRcdFx0XHRcdHJhbmdlQ2hhbmdlcy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiByYW5nZXNbaV0ubmV3UmFuZ2UsXG5cdFx0XHRcdFx0XHRzdGFydE9mZnNldDogcmFuZ2VzW2ldLm5ld1JhbmdlU3RhcnRPZmZzZXQsXG5cdFx0XHRcdFx0XHRlbmRPZmZzZXQ6IHJhbmdlc1tpXS5uZXdSYW5nZUVuZE9mZnNldFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJhbmdlQ2hhbmdlc1tpIC0gMV0uZW5kT2Zmc2V0IDwgcmFuZ2VzW2ldLm5ld1JhbmdlRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdFx0Ly8gY2xpcCB0aGUgcmFuZ2UgdG8gdGhlIHByZXZpb3VzIHJhbmdlXG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IHRoaXMuX3RleHRNb2RlbC5nZXRQb3NpdGlvbkF0KHJhbmdlQ2hhbmdlc1tpIC0gMV0uZW5kT2Zmc2V0ICsgMSk7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLCBzdGFydFBvc2l0aW9uLmNvbHVtbiwgcmFuZ2VzW2ldLm5ld1JhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlc1tpXS5uZXdSYW5nZS5lbmRDb2x1bW4pO1xuXHRcdFx0XHRcdHJhbmdlQ2hhbmdlcy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0c3RhcnRPZmZzZXQ6IHJhbmdlQ2hhbmdlc1tpIC0gMV0uZW5kT2Zmc2V0ICsgMSxcblx0XHRcdFx0XHRcdGVuZE9mZnNldDogcmFuZ2VzW2ldLm5ld1JhbmdlRW5kT2Zmc2V0XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIGNhcHR1cmVzIGltbWVkaWF0ZWx5IHdoaWxlIHRoZSB0ZXh0IG1vZGVsIGlzIGNvcnJlY3Rcblx0XHRjb25zdCBjYXB0dXJlcyA9IHJhbmdlQ2hhbmdlcy5tYXAocmFuZ2UgPT4gdGhpcy5fZ2V0Q2FwdHVyZXMocmFuZ2UucmFuZ2UpKTtcblx0XHQvLyBEb24ndCBibG9ja1xuXHRcdHJldHVybiB0aGlzLl91cGRhdGVUcmVlRm9yUmFuZ2VzKHJhbmdlQ2hhbmdlcywgdmVyc2lvbklkLCBjYXB0dXJlcykudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3RleHRNb2RlbC5pc0Rpc3Bvc2VkKCkgJiYgKHRoaXMuX3RyZWUudHJlZUxhc3RQYXJzZWRWZXJzaW9uLmdldCgpID09PSB0aGlzLl90ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCkpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hOZWVkc1JlZnJlc2godmVyc2lvbklkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVRyZWVGb3JSYW5nZXMocmFuZ2VDaGFuZ2VzOiBSYW5nZVdpdGhPZmZzZXRzW10sIHZlcnNpb25JZDogbnVtYmVyLCBjYXB0dXJlczogUXVlcnlDYXB0dXJlW11bXSkge1xuXHRcdGxldCB0b2tlblVwZGF0ZTogeyBuZXdUb2tlbnM6IFRva2VuVXBkYXRlW10gfSB8IHVuZGVmaW5lZDtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmFuZ2VDaGFuZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3RleHRNb2RlbC5pc0Rpc3Bvc2VkKCkgJiYgdmVyc2lvbklkICE9PSB0aGlzLl90ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCkpIHtcblx0XHRcdFx0Ly8gT3VyIGNhcHR1cmVzIGhhdmUgYmVjb21lIGludmFsaWQgYW5kIHdlIG5lZWQgdG8gcmUtY2FwdHVyZVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNhcHR1cmUgPSBjYXB0dXJlc1tpXTtcblx0XHRcdGNvbnN0IHJhbmdlID0gcmFuZ2VDaGFuZ2VzW2ldO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVzID0gdGhpcy5nZXRUb2tlbnNJblJhbmdlKHJhbmdlLnJhbmdlLCByYW5nZS5zdGFydE9mZnNldCwgcmFuZ2UuZW5kT2Zmc2V0LCBjYXB0dXJlKTtcblx0XHRcdGlmICh1cGRhdGVzKSB7XG5cdFx0XHRcdHRva2VuVXBkYXRlID0geyBuZXdUb2tlbnM6IHVwZGF0ZXMgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRva2VuVXBkYXRlID0geyBuZXdUb2tlbnM6IFtdIH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl91cGRhdGVUb2tlbnNJblN0b3JlKHZlcnNpb25JZCwgW3Rva2VuVXBkYXRlXSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVG9rZW5zLmZpcmUoe1xuXHRcdFx0XHRjaGFuZ2VzOiB7XG5cdFx0XHRcdFx0c2VtYW50aWNUb2tlbnNBcHBsaWVkOiBmYWxzZSxcblx0XHRcdFx0XHRyYW5nZXM6IFt7IGZyb21MaW5lTnVtYmVyOiByYW5nZS5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkubGluZU51bWJlciwgdG9MaW5lTnVtYmVyOiByYW5nZS5yYW5nZS5nZXRFbmRQb3NpdGlvbigpLmxpbmVOdW1iZXIgfV1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQwKHJlc29sdmUpKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDb21wbGV0ZUJhY2tncm91bmRUb2tlbml6YXRpb24uZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaE5lZWRzUmVmcmVzaCh2ZXJzaW9uSWQ6IG51bWJlcikge1xuXHRcdGNvbnN0IHJhbmdlc1RvUmVmcmVzaCA9IHRoaXMuX2dldE5lZWRzUmVmcmVzaCgpO1xuXHRcdGlmIChyYW5nZXNUb1JlZnJlc2gubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlQ2hhbmdlczogUmFuZ2VDaGFuZ2VbXSA9IG5ldyBBcnJheShyYW5nZXNUb1JlZnJlc2gubGVuZ3RoKTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmFuZ2VzVG9SZWZyZXNoLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IHJhbmdlc1RvUmVmcmVzaFtpXTtcblx0XHRcdHJhbmdlQ2hhbmdlc1tpXSA9IHtcblx0XHRcdFx0bmV3UmFuZ2U6IHJhbmdlLnJhbmdlLFxuXHRcdFx0XHRuZXdSYW5nZVN0YXJ0T2Zmc2V0OiByYW5nZS5zdGFydE9mZnNldCxcblx0XHRcdFx0bmV3UmFuZ2VFbmRPZmZzZXQ6IHJhbmdlLmVuZE9mZnNldFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aGlzLl9oYW5kbGVUcmVlVXBkYXRlKHJhbmdlQ2hhbmdlcywgdmVyc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgX3JhbmdlVG9rZW5zQXNVcGRhdGVzKHJhbmdlT2Zmc2V0OiBudW1iZXIsIGVuZE9mZnNldFRva2VuOiBFbmRPZmZzZXRUb2tlbltdLCBzdGFydGluZ09mZnNldEluQXJyYXk/OiBudW1iZXIpIHtcblx0XHRjb25zdCB1cGRhdGVzOiBUb2tlblVwZGF0ZVtdID0gW107XG5cdFx0bGV0IGxhc3RFbmQgPSAwO1xuXHRcdGZvciAoY29uc3QgdG9rZW4gb2YgZW5kT2Zmc2V0VG9rZW4pIHtcblx0XHRcdGlmICh0b2tlbi5lbmRPZmZzZXQgPD0gbGFzdEVuZCB8fCAoc3RhcnRpbmdPZmZzZXRJbkFycmF5ICYmICh0b2tlbi5lbmRPZmZzZXQgPCBzdGFydGluZ09mZnNldEluQXJyYXkpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCB0b2tlblVwZGF0ZTogVG9rZW5VcGRhdGU7XG5cdFx0XHRpZiAoc3RhcnRpbmdPZmZzZXRJbkFycmF5ICYmIChsYXN0RW5kIDwgc3RhcnRpbmdPZmZzZXRJbkFycmF5KSkge1xuXHRcdFx0XHR0b2tlblVwZGF0ZSA9IHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IHJhbmdlT2Zmc2V0ICsgc3RhcnRpbmdPZmZzZXRJbkFycmF5LCBsZW5ndGg6IHRva2VuLmVuZE9mZnNldCAtIHN0YXJ0aW5nT2Zmc2V0SW5BcnJheSwgdG9rZW46IHRva2VuLm1ldGFkYXRhIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0b2tlblVwZGF0ZSA9IHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IHJhbmdlT2Zmc2V0ICsgbGFzdEVuZCwgbGVuZ3RoOiB0b2tlbi5lbmRPZmZzZXQgLSBsYXN0RW5kLCB0b2tlbjogdG9rZW4ubWV0YWRhdGEgfTtcblx0XHRcdH1cblx0XHRcdHVwZGF0ZXMucHVzaCh0b2tlblVwZGF0ZSk7XG5cdFx0XHRsYXN0RW5kID0gdG9rZW4uZW5kT2Zmc2V0O1xuXHRcdH1cblx0XHRyZXR1cm4gdXBkYXRlcztcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRoZW1lKCkge1xuXHRcdGNvbnN0IG1vZGVsUmFuZ2UgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKTtcblx0XHR0aGlzLl9tYXJrRm9yUmVmcmVzaChtb2RlbFJhbmdlKTtcblx0XHR0aGlzLl9wYXJzZUFuZFRva2VuaXplVmlld1BvcnQodGhpcy5fdmlzaWJsZUxpbmVSYW5nZXMuZ2V0KCkpO1xuXHR9XG5cblx0Ly8gV2FzIHVzZWQgZm9yIGluc3BlY3QgZWRpdG9yIHRva2VucyBjb21tYW5kXG5cdGNhcHR1cmVBdFBvc2l0aW9uKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBRdWVyeUNhcHR1cmVbXSB7XG5cdFx0Y29uc3QgY2FwdHVyZXMgPSB0aGlzLmNhcHR1cmVBdFJhbmdlV2l0aEluamVjdGlvbnMobmV3IFJhbmdlKGxpbmVOdW1iZXIsIGNvbHVtbiwgbGluZU51bWJlciwgY29sdW1uICsgMSkpO1xuXHRcdHJldHVybiBjYXB0dXJlcztcblx0fVxuXG5cdC8vIFdhcyB1c2VkIGZvciB0aGUgY29sb3JpemF0aW9uIHRlc3RzXG5cdGNhcHR1cmVBdFJhbmdlVHJlZShyYW5nZTogUmFuZ2UpOiBRdWVyeUNhcHR1cmVbXSB7XG5cdFx0Y29uc3QgY2FwdHVyZXMgPSB0aGlzLmNhcHR1cmVBdFJhbmdlV2l0aEluamVjdGlvbnMocmFuZ2UpO1xuXHRcdHJldHVybiBjYXB0dXJlcztcblx0fVxuXG5cdHByaXZhdGUgY2FwdHVyZUF0UmFuZ2UocmFuZ2U6IFJhbmdlKTogUXVlcnlDYXB0dXJlW10ge1xuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLl90cmVlLnRyZWUuZ2V0KCk7XG5cdFx0aWYgKCF0cmVlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdC8vIFRyZWUgc2l0dGVyIHJvdyBpcyAwIGJhc2VkLCBjb2x1bW4gaXMgMCBiYXNlZFxuXHRcdHJldHVybiB0aGlzLl9oaWdobGlnaHRpbmdRdWVyaWVzLmNhcHR1cmVzKHRyZWUucm9vdE5vZGUsIHsgc3RhcnRQb3NpdGlvbjogeyByb3c6IHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIGNvbHVtbjogcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxIH0sIGVuZFBvc2l0aW9uOiB7IHJvdzogcmFuZ2UuZW5kTGluZU51bWJlciAtIDEsIGNvbHVtbjogcmFuZ2UuZW5kQ29sdW1uIC0gMSB9IH0pLm1hcChjYXB0dXJlID0+IChcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogY2FwdHVyZS5uYW1lLFxuXHRcdFx0XHR0ZXh0OiBjYXB0dXJlLm5vZGUudGV4dCxcblx0XHRcdFx0bm9kZToge1xuXHRcdFx0XHRcdHN0YXJ0SW5kZXg6IGNhcHR1cmUubm9kZS5zdGFydEluZGV4LFxuXHRcdFx0XHRcdGVuZEluZGV4OiBjYXB0dXJlLm5vZGUuZW5kSW5kZXgsXG5cdFx0XHRcdFx0c3RhcnRQb3NpdGlvbjoge1xuXHRcdFx0XHRcdFx0bGluZU51bWJlcjogY2FwdHVyZS5ub2RlLnN0YXJ0UG9zaXRpb24ucm93ICsgMSxcblx0XHRcdFx0XHRcdGNvbHVtbjogY2FwdHVyZS5ub2RlLnN0YXJ0UG9zaXRpb24uY29sdW1uICsgMVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZW5kUG9zaXRpb246IHtcblx0XHRcdFx0XHRcdGxpbmVOdW1iZXI6IGNhcHR1cmUubm9kZS5lbmRQb3NpdGlvbi5yb3cgKyAxLFxuXHRcdFx0XHRcdFx0Y29sdW1uOiBjYXB0dXJlLm5vZGUuZW5kUG9zaXRpb24uY29sdW1uICsgMVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5jb2RlZExhbmd1YWdlSWQ6IHRoaXMuX2VuY29kZWRMYW5ndWFnZUlkXG5cdFx0XHR9XG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIGNhcHR1cmVBdFJhbmdlV2l0aEluamVjdGlvbnMocmFuZ2U6IFJhbmdlKTogUXVlcnlDYXB0dXJlW10ge1xuXHRcdGNvbnN0IGNhcHR1cmVzOiBRdWVyeUNhcHR1cmVbXSA9IHRoaXMuY2FwdHVyZUF0UmFuZ2UocmFuZ2UpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2FwdHVyZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGNhcHR1cmUgPSBjYXB0dXJlc1tpXTtcblxuXHRcdFx0Y29uc3QgY2FwU3RhcnRMaW5lID0gY2FwdHVyZS5ub2RlLnN0YXJ0UG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGNhcEVuZExpbmUgPSBjYXB0dXJlLm5vZGUuZW5kUG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGNhcFN0YXJ0Q29sdW1uID0gY2FwdHVyZS5ub2RlLnN0YXJ0UG9zaXRpb24uY29sdW1uO1xuXHRcdFx0Y29uc3QgY2FwRW5kQ29sdW1uID0gY2FwdHVyZS5ub2RlLmVuZFBvc2l0aW9uLmNvbHVtbjtcblxuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lID0gKChjYXBTdGFydExpbmUgPiByYW5nZS5zdGFydExpbmVOdW1iZXIpICYmIChjYXBTdGFydExpbmUgPCByYW5nZS5lbmRMaW5lTnVtYmVyKSkgPyBjYXBTdGFydExpbmUgOiByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBlbmRMaW5lID0gKChjYXBFbmRMaW5lID4gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSAmJiAoY2FwRW5kTGluZSA8IHJhbmdlLmVuZExpbmVOdW1iZXIpKSA/IGNhcEVuZExpbmUgOiByYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3Qgc3RhcnRDb2x1bW4gPSAoY2FwU3RhcnRMaW5lID09PSByYW5nZS5zdGFydExpbmVOdW1iZXIpID8gKGNhcFN0YXJ0Q29sdW1uIDwgcmFuZ2Uuc3RhcnRDb2x1bW4gPyByYW5nZS5zdGFydENvbHVtbiA6IGNhcFN0YXJ0Q29sdW1uKSA6IChjYXBTdGFydExpbmUgPCByYW5nZS5zdGFydExpbmVOdW1iZXIgPyByYW5nZS5zdGFydENvbHVtbiA6IGNhcFN0YXJ0Q29sdW1uKTtcblx0XHRcdGNvbnN0IGVuZENvbHVtbiA9IChjYXBFbmRMaW5lID09PSByYW5nZS5lbmRMaW5lTnVtYmVyKSA/IChjYXBFbmRDb2x1bW4gPiByYW5nZS5lbmRDb2x1bW4gPyByYW5nZS5lbmRDb2x1bW4gOiBjYXBFbmRDb2x1bW4pIDogKGNhcEVuZExpbmUgPiByYW5nZS5lbmRMaW5lTnVtYmVyID8gcmFuZ2UuZW5kQ29sdW1uIDogY2FwRW5kQ29sdW1uKTtcblx0XHRcdGNvbnN0IGluamVjdGlvblJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0TGluZSwgc3RhcnRDb2x1bW4sIGVuZExpbmUsIGVuZENvbHVtbik7XG5cblx0XHRcdGNvbnN0IGluamVjdGlvbiA9IHRoaXMuX2dldEluamVjdGlvbkNhcHR1cmVzKGNhcHR1cmUsIGluamVjdGlvblJhbmdlKTtcblx0XHRcdGlmIChpbmplY3Rpb24gJiYgaW5qZWN0aW9uLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y2FwdHVyZXMuc3BsaWNlKGkgKyAxLCAwLCAuLi5pbmplY3Rpb24pO1xuXHRcdFx0XHRpICs9IGluamVjdGlvbi5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjYXB0dXJlcztcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSB0b2tlbnMgZm9yIGEgZ2l2ZW4gbGluZS5cblx0ICogRWFjaCB0b2tlbiB0YWtlcyAyIGVsZW1lbnRzIGluIHRoZSBhcnJheS4gVGhlIGZpcnN0IGVsZW1lbnQgaXMgdGhlIG9mZnNldCBvZiB0aGUgZW5kIG9mIHRoZSB0b2tlbiAqaW4gdGhlIGxpbmUsIG5vdCBpbiB0aGUgZG9jdW1lbnQqLCBhbmQgdGhlIHNlY29uZCBlbGVtZW50IGlzIHRoZSBtZXRhZGF0YS5cblx0ICpcblx0ICogQHBhcmFtIGxpbmVOdW1iZXJcblx0ICogQHJldHVybnNcblx0ICovXG5cdHB1YmxpYyB0b2tlbml6ZUVuY29kZWQobGluZU51bWJlcjogbnVtYmVyKSB7XG5cdFx0Y29uc3QgdG9rZW5zID0gdGhpcy5fdG9rZW5pemVFbmNvZGVkKGxpbmVOdW1iZXIpO1xuXHRcdGlmICghdG9rZW5zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVzID0gdGhpcy5fcmFuZ2VUb2tlbnNBc1VwZGF0ZXModGhpcy5fdGV4dE1vZGVsLmdldE9mZnNldEF0KHsgbGluZU51bWJlciwgY29sdW1uOiAxIH0pLCB0b2tlbnMucmVzdWx0KTtcblx0XHRpZiAodG9rZW5zLnZlcnNpb25JZCA9PT0gdGhpcy5fdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVUb2tlbnNJblN0b3JlKHRva2Vucy52ZXJzaW9uSWQsIFt7IG5ld1Rva2VuczogdXBkYXRlcywgb2xkUmFuZ2VMZW5ndGg6IHRoaXMuX3RleHRNb2RlbC5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpIH1dLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB0b2tlbml6ZUVuY29kZWRJbnN0cnVtZW50ZWQobGluZU51bWJlcjogbnVtYmVyKTogeyByZXN1bHQ6IFVpbnQzMkFycmF5OyBjYXB0dXJlVGltZTogbnVtYmVyOyBtZXRhZGF0YVRpbWU6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0b2tlbnMgPSB0aGlzLl90b2tlbml6ZUVuY29kZWQobGluZU51bWJlcik7XG5cdFx0aWYgKCF0b2tlbnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IHJlc3VsdDogdGhpcy5fZW5kT2Zmc2V0VG9rZW5zVG9VaW50MzJBcnJheSh0b2tlbnMucmVzdWx0KSwgY2FwdHVyZVRpbWU6IHRva2Vucy5jYXB0dXJlVGltZSwgbWV0YWRhdGFUaW1lOiB0b2tlbnMubWV0YWRhdGFUaW1lIH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDYXB0dXJlcyhyYW5nZTogUmFuZ2UpOiBRdWVyeUNhcHR1cmVbXSB7XG5cdFx0Y29uc3QgY2FwdHVyZXMgPSB0aGlzLmNhcHR1cmVBdFJhbmdlV2l0aEluamVjdGlvbnMocmFuZ2UpO1xuXHRcdHJldHVybiBjYXB0dXJlcztcblx0fVxuXG5cdHByaXZhdGUgX3Rva2VuaXplKHJhbmdlOiBSYW5nZSwgcmFuZ2VTdGFydE9mZnNldDogbnVtYmVyLCByYW5nZUVuZE9mZnNldDogbnVtYmVyKTogeyBlbmRPZmZzZXRzQW5kTWV0YWRhdGE6IHsgZW5kT2Zmc2V0OiBudW1iZXI7IG1ldGFkYXRhOiBudW1iZXIgfVtdOyB2ZXJzaW9uSWQ6IG51bWJlcjsgY2FwdHVyZVRpbWU6IG51bWJlcjsgbWV0YWRhdGFUaW1lOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2FwdHVyZXMgPSB0aGlzLl9nZXRDYXB0dXJlcyhyYW5nZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fdG9rZW5pemVDYXB0dXJlc1dpdGhNZXRhZGF0YShjYXB0dXJlcywgcmFuZ2VTdGFydE9mZnNldCwgcmFuZ2VFbmRPZmZzZXQpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyAuLi5yZXN1bHQsIHZlcnNpb25JZDogdGhpcy5fdHJlZS50cmVlTGFzdFBhcnNlZFZlcnNpb24uZ2V0KCkgfTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRva2Vuc0Zyb21DYXB0dXJlcyhjYXB0dXJlczogUXVlcnlDYXB0dXJlW10sIHJhbmdlU3RhcnRPZmZzZXQ6IG51bWJlciwgcmFuZ2VFbmRPZmZzZXQ6IG51bWJlcik6IHsgZW5kT2Zmc2V0czogRW5kT2Zmc2V0QW5kU2NvcGVzW107IGNhcHR1cmVUaW1lOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdHJlZSA9IHRoaXMuX3RyZWUudHJlZS5nZXQoKTtcblx0XHRjb25zdCBzdG9wd2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0Y29uc3QgcmFuZ2VMZW5ndGggPSByYW5nZUVuZE9mZnNldCAtIHJhbmdlU3RhcnRPZmZzZXQ7XG5cdFx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSB0aGlzLl9sYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZCh0aGlzLl90cmVlLmxhbmd1YWdlSWQpO1xuXHRcdGNvbnN0IGJhc2VTY29wZTogc3RyaW5nID0gVFJFRVNJVFRFUl9CQVNFX1NDT1BFU1t0aGlzLl90cmVlLmxhbmd1YWdlSWRdIHx8ICdzb3VyY2UnO1xuXG5cdFx0aWYgKGNhcHR1cmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aWYgKHRyZWUpIHtcblx0XHRcdFx0c3RvcHdhdGNoLnN0b3AoKTtcblx0XHRcdFx0Y29uc3QgZW5kT2Zmc2V0c0FuZE1ldGFkYXRhID0gW3sgZW5kT2Zmc2V0OiByYW5nZUxlbmd0aCwgc2NvcGVzOiBbXSwgZW5jb2RlZExhbmd1YWdlSWQgfV07XG5cdFx0XHRcdHJldHVybiB7IGVuZE9mZnNldHM6IGVuZE9mZnNldHNBbmRNZXRhZGF0YSwgY2FwdHVyZVRpbWU6IHN0b3B3YXRjaC5lbGFwc2VkKCkgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5kT2Zmc2V0c0FuZFNjb3BlczogRW5kT2Zmc2V0QW5kU2NvcGVzW10gPSBBcnJheShjYXB0dXJlcy5sZW5ndGgpO1xuXHRcdGVuZE9mZnNldHNBbmRTY29wZXMuZmlsbCh7IGVuZE9mZnNldDogMCwgc2NvcGVzOiBbYmFzZVNjb3BlXSwgZW5jb2RlZExhbmd1YWdlSWQgfSk7XG5cdFx0bGV0IHRva2VuSW5kZXggPSAwO1xuXG5cdFx0Y29uc3QgaW5jcmVhc2VTaXplT2ZUb2tlbnNCeU9uZVRva2VuID0gKCkgPT4ge1xuXHRcdFx0ZW5kT2Zmc2V0c0FuZFNjb3Blcy5wdXNoKHsgZW5kT2Zmc2V0OiAwLCBzY29wZXM6IFtiYXNlU2NvcGVdLCBlbmNvZGVkTGFuZ3VhZ2VJZCB9KTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYnJhY2tldHMgPSAoY2FwdHVyZTogUXVlcnlDYXB0dXJlLCBzdGFydE9mZnNldDogbnVtYmVyKTogbnVtYmVyW10gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0cmV0dXJuIChjYXB0dXJlLm5hbWUuaW5jbHVkZXMoJ3B1bmN0dWF0aW9uJykgJiYgY2FwdHVyZS50ZXh0KSA/IEFycmF5LmZyb20oY2FwdHVyZS50ZXh0Lm1hdGNoQWxsKEJSQUNLRVRTKSkubWFwKG1hdGNoID0+IHN0YXJ0T2Zmc2V0ICsgbWF0Y2guaW5kZXgpIDogdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCBhZGRDdXJyZW50VG9rZW5Ub0FycmF5ID0gKGNhcHR1cmU6IFF1ZXJ5Q2FwdHVyZSwgc3RhcnRPZmZzZXQ6IG51bWJlciwgZW5kT2Zmc2V0OiBudW1iZXIsIHBvc2l0aW9uPzogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAocG9zaXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBvbGRTY29wZXMgPSBlbmRPZmZzZXRzQW5kU2NvcGVzW3Bvc2l0aW9uXS5zY29wZXM7XG5cdFx0XHRcdGxldCBvbGRCcmFja2V0ID0gZW5kT2Zmc2V0c0FuZFNjb3Blc1twb3NpdGlvbl0uYnJhY2tldDtcblx0XHRcdFx0Ly8gQ2hlY2sgdGhhdCB0aGUgcHJldmlvdXMgdG9rZW4gZW5kcyBhdCB0aGUgc2FtZSBwb2ludCB0aGF0IHRoZSBjdXJyZW50IHRva2VuIHN0YXJ0c1xuXHRcdFx0XHRjb25zdCBwcmV2RW5kT2Zmc2V0ID0gcG9zaXRpb24gPiAwID8gZW5kT2Zmc2V0c0FuZFNjb3Blc1twb3NpdGlvbiAtIDFdLmVuZE9mZnNldCA6IDA7XG5cdFx0XHRcdGlmIChwcmV2RW5kT2Zmc2V0ICE9PSBzdGFydE9mZnNldCkge1xuXHRcdFx0XHRcdGxldCBwcmVJbnNlcnRCcmFja2V0OiBudW1iZXJbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAob2xkQnJhY2tldCAmJiBvbGRCcmFja2V0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdHByZUluc2VydEJyYWNrZXQgPSBbXTtcblx0XHRcdFx0XHRcdGNvbnN0IHBvc3RJbnNlcnRCcmFja2V0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBvbGRCcmFja2V0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGJyYWNrZXQgPSBvbGRCcmFja2V0W2ldO1xuXHRcdFx0XHRcdFx0XHRpZiAoYnJhY2tldCA8IHN0YXJ0T2Zmc2V0KSB7XG5cdFx0XHRcdFx0XHRcdFx0cHJlSW5zZXJ0QnJhY2tldC5wdXNoKGJyYWNrZXQpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGJyYWNrZXQgPiBlbmRPZmZzZXQpIHtcblx0XHRcdFx0XHRcdFx0XHRwb3N0SW5zZXJ0QnJhY2tldC5wdXNoKGJyYWNrZXQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAocHJlSW5zZXJ0QnJhY2tldC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0cHJlSW5zZXJ0QnJhY2tldCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChwb3N0SW5zZXJ0QnJhY2tldC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0b2xkQnJhY2tldCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG9sZEJyYWNrZXQgPSBwb3N0SW5zZXJ0QnJhY2tldDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gV2UgbmVlZCB0byBhZGQgc29tZSBvZiB0aGUgcG9zaXRpb24gdG9rZW4gdG8gY292ZXIgdGhlIHNwYWNlXG5cdFx0XHRcdFx0ZW5kT2Zmc2V0c0FuZFNjb3Blcy5zcGxpY2UocG9zaXRpb24sIDAsIHsgZW5kT2Zmc2V0OiBzdGFydE9mZnNldCwgc2NvcGVzOiBbLi4ub2xkU2NvcGVzXSwgYnJhY2tldDogcHJlSW5zZXJ0QnJhY2tldCwgZW5jb2RlZExhbmd1YWdlSWQ6IGNhcHR1cmUuZW5jb2RlZExhbmd1YWdlSWQgfSk7XG5cdFx0XHRcdFx0cG9zaXRpb24rKztcblx0XHRcdFx0XHRpbmNyZWFzZVNpemVPZlRva2Vuc0J5T25lVG9rZW4oKTtcblx0XHRcdFx0XHR0b2tlbkluZGV4Kys7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbmRPZmZzZXRzQW5kU2NvcGVzLnNwbGljZShwb3NpdGlvbiwgMCwgeyBlbmRPZmZzZXQ6IGVuZE9mZnNldCwgc2NvcGVzOiBbLi4ub2xkU2NvcGVzLCBjYXB0dXJlLm5hbWVdLCBicmFja2V0OiBicmFja2V0cyhjYXB0dXJlLCBzdGFydE9mZnNldCksIGVuY29kZWRMYW5ndWFnZUlkOiBjYXB0dXJlLmVuY29kZWRMYW5ndWFnZUlkIH0pO1xuXHRcdFx0XHRlbmRPZmZzZXRzQW5kU2NvcGVzW3Rva2VuSW5kZXhdLmJyYWNrZXQgPSBvbGRCcmFja2V0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW5kT2Zmc2V0c0FuZFNjb3Blc1t0b2tlbkluZGV4XSA9IHsgZW5kT2Zmc2V0OiBlbmRPZmZzZXQsIHNjb3BlczogW2Jhc2VTY29wZSwgY2FwdHVyZS5uYW1lXSwgYnJhY2tldDogYnJhY2tldHMoY2FwdHVyZSwgc3RhcnRPZmZzZXQpLCBlbmNvZGVkTGFuZ3VhZ2VJZDogY2FwdHVyZS5lbmNvZGVkTGFuZ3VhZ2VJZCB9O1xuXHRcdFx0fVxuXHRcdFx0dG9rZW5JbmRleCsrO1xuXHRcdH07XG5cblx0XHRmb3IgKGxldCBjYXB0dXJlSW5kZXggPSAwOyBjYXB0dXJlSW5kZXggPCBjYXB0dXJlcy5sZW5ndGg7IGNhcHR1cmVJbmRleCsrKSB7XG5cdFx0XHRjb25zdCBjYXB0dXJlID0gY2FwdHVyZXNbY2FwdHVyZUluZGV4XTtcblx0XHRcdGNvbnN0IHRva2VuRW5kSW5kZXggPSBjYXB0dXJlLm5vZGUuZW5kSW5kZXggPCByYW5nZUVuZE9mZnNldCA/ICgoY2FwdHVyZS5ub2RlLmVuZEluZGV4IDwgcmFuZ2VTdGFydE9mZnNldCkgPyByYW5nZVN0YXJ0T2Zmc2V0IDogY2FwdHVyZS5ub2RlLmVuZEluZGV4KSA6IHJhbmdlRW5kT2Zmc2V0O1xuXHRcdFx0Y29uc3QgdG9rZW5TdGFydEluZGV4ID0gY2FwdHVyZS5ub2RlLnN0YXJ0SW5kZXggPCByYW5nZVN0YXJ0T2Zmc2V0ID8gcmFuZ2VTdGFydE9mZnNldCA6IGNhcHR1cmUubm9kZS5zdGFydEluZGV4O1xuXG5cdFx0XHRjb25zdCBlbmRPZmZzZXQgPSB0b2tlbkVuZEluZGV4IC0gcmFuZ2VTdGFydE9mZnNldDtcblxuXHRcdFx0Ly8gTm90IGV2ZXJ5IGNoYXJhY3RlciB3aWxsIGdldCBjYXB0dXJlZCwgc28gd2UgbmVlZCB0byBtYWtlIHN1cmUgdGhhdCBvdXIgY3VycmVudCBjYXB0dXJlIGRvZXNuJ3QgYmxlZWQgdG93YXJkIHRoZSBzdGFydCBvZiB0aGUgbGluZSBhbmQgY292ZXIgY2hhcmFjdGVycyB0aGF0IGl0IGRvZXNuJ3QgYXBwbHkgdG8uXG5cdFx0XHQvLyBXZSBkbyB0aGlzIGJ5IGNyZWF0aW5nIGEgbmV3IHRva2VuIGluIHRoZSBhcnJheSBpZiB0aGUgcHJldmlvdXMgdG9rZW4gZW5kcyBiZWZvcmUgdGhlIGN1cnJlbnQgdG9rZW4gc3RhcnRzLlxuXHRcdFx0bGV0IHByZXZpb3VzRW5kT2Zmc2V0OiBudW1iZXI7XG5cdFx0XHRjb25zdCBjdXJyZW50VG9rZW5MZW5ndGggPSB0b2tlbkVuZEluZGV4IC0gdG9rZW5TdGFydEluZGV4O1xuXHRcdFx0aWYgKGNhcHR1cmVJbmRleCA+IDApIHtcblx0XHRcdFx0cHJldmlvdXNFbmRPZmZzZXQgPSBlbmRPZmZzZXRzQW5kU2NvcGVzWyh0b2tlbkluZGV4IC0gMSldLmVuZE9mZnNldDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByZXZpb3VzRW5kT2Zmc2V0ID0gdG9rZW5TdGFydEluZGV4IC0gcmFuZ2VTdGFydE9mZnNldCAtIDE7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IGVuZE9mZnNldCAtIGN1cnJlbnRUb2tlbkxlbmd0aDtcblx0XHRcdGlmICgocHJldmlvdXNFbmRPZmZzZXQgPj0gMCkgJiYgKHByZXZpb3VzRW5kT2Zmc2V0IDwgc3RhcnRPZmZzZXQpKSB7XG5cdFx0XHRcdC8vIEFkZCBlbiBlbXB0eSB0b2tlbiB0byBjb3ZlciB0aGUgc3BhY2Ugd2hlcmUgdGhlcmUgd2VyZSBubyBjYXB0dXJlc1xuXHRcdFx0XHRlbmRPZmZzZXRzQW5kU2NvcGVzW3Rva2VuSW5kZXhdID0geyBlbmRPZmZzZXQ6IHN0YXJ0T2Zmc2V0LCBzY29wZXM6IFtiYXNlU2NvcGVdLCBlbmNvZGVkTGFuZ3VhZ2VJZDogdGhpcy5fZW5jb2RlZExhbmd1YWdlSWQgfTtcblx0XHRcdFx0dG9rZW5JbmRleCsrO1xuXG5cdFx0XHRcdGluY3JlYXNlU2l6ZU9mVG9rZW5zQnlPbmVUb2tlbigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VycmVudFRva2VuTGVuZ3RoIDwgMCkge1xuXHRcdFx0XHQvLyBUaGlzIGhhcHBlbnMgd2hlbiB3ZSBoYXZlIGEgdG9rZW4gXCJnYXBcIiByaWdodCBhdCB0aGUgZW5kIG9mIHRoZSBjYXB0dXJlIHJhbmdlLiBUaGUgbGFzdCBjYXB0dXJlIGlzbid0IHVzZWQgYmVjYXVzZSBpdCdzIHN0YXJ0IGluZGV4IGlzbid0IGluY2x1ZGVkIGluIHRoZSByYW5nZS5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcmV2aW91c0VuZE9mZnNldCA+PSBlbmRPZmZzZXQpIHtcblx0XHRcdFx0Ly8gd2FsayBiYWNrIHRocm91Z2ggdGhlIHRva2VucyB1bnRpbCB3ZSBmaW5kIHRoZSBvbmUgdGhhdCBjb250YWlucyB0aGUgY3VycmVudCB0b2tlblxuXHRcdFx0XHRsZXQgd2l0aGluVG9rZW5JbmRleCA9IHRva2VuSW5kZXggLSAxO1xuXHRcdFx0XHRsZXQgcHJldmlvdXNUb2tlbkVuZE9mZnNldCA9IGVuZE9mZnNldHNBbmRTY29wZXNbd2l0aGluVG9rZW5JbmRleF0uZW5kT2Zmc2V0O1xuXG5cdFx0XHRcdGxldCBwcmV2aW91c1Rva2VuU3RhcnRPZmZzZXQgPSAoKHdpdGhpblRva2VuSW5kZXggPj0gMikgPyBlbmRPZmZzZXRzQW5kU2NvcGVzW3dpdGhpblRva2VuSW5kZXggLSAxXS5lbmRPZmZzZXQgOiAwKTtcblx0XHRcdFx0ZG8ge1xuXG5cdFx0XHRcdFx0Ly8gQ2hlY2sgdGhhdCB0aGUgY3VycmVudCB0b2tlbiBkb2Vzbid0IGp1c3QgcmVwbGFjZSB0aGUgbGFzdCB0b2tlblxuXHRcdFx0XHRcdGlmICgocHJldmlvdXNUb2tlblN0YXJ0T2Zmc2V0ICsgY3VycmVudFRva2VuTGVuZ3RoKSA9PT0gcHJldmlvdXNUb2tlbkVuZE9mZnNldCkge1xuXHRcdFx0XHRcdFx0aWYgKHByZXZpb3VzVG9rZW5TdGFydE9mZnNldCA9PT0gc3RhcnRPZmZzZXQpIHtcblx0XHRcdFx0XHRcdFx0Ly8gQ3VycmVudCB0b2tlbiBhbmQgcHJldmlvdXMgdG9rZW4gc3BhbiB0aGUgZXhhY3Qgc2FtZSBjaGFyYWN0ZXJzLCBhZGQgdGhlIHNjb3BlcyB0byB0aGUgcHJldmlvdXMgdG9rZW5cblx0XHRcdFx0XHRcdFx0ZW5kT2Zmc2V0c0FuZFNjb3Blc1t3aXRoaW5Ub2tlbkluZGV4XS5zY29wZXMucHVzaChjYXB0dXJlLm5hbWUpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvbGRCcmFja2V0ID0gZW5kT2Zmc2V0c0FuZFNjb3Blc1t3aXRoaW5Ub2tlbkluZGV4XS5icmFja2V0O1xuXHRcdFx0XHRcdFx0XHRlbmRPZmZzZXRzQW5kU2NvcGVzW3dpdGhpblRva2VuSW5kZXhdLmJyYWNrZXQgPSAoKG9sZEJyYWNrZXQgJiYgKG9sZEJyYWNrZXQubGVuZ3RoID4gMCkpID8gb2xkQnJhY2tldCA6IGJyYWNrZXRzKGNhcHR1cmUsIHN0YXJ0T2Zmc2V0KSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwcmV2aW91c1Rva2VuU3RhcnRPZmZzZXQgPD0gc3RhcnRPZmZzZXQpIHtcblx0XHRcdFx0XHRcdGFkZEN1cnJlbnRUb2tlblRvQXJyYXkoY2FwdHVyZSwgc3RhcnRPZmZzZXQsIGVuZE9mZnNldCwgd2l0aGluVG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0d2l0aGluVG9rZW5JbmRleC0tO1xuXHRcdFx0XHRcdHByZXZpb3VzVG9rZW5TdGFydE9mZnNldCA9ICgod2l0aGluVG9rZW5JbmRleCA+PSAxKSA/IGVuZE9mZnNldHNBbmRTY29wZXNbd2l0aGluVG9rZW5JbmRleCAtIDFdLmVuZE9mZnNldCA6IDApO1xuXHRcdFx0XHRcdHByZXZpb3VzVG9rZW5FbmRPZmZzZXQgPSAoKHdpdGhpblRva2VuSW5kZXggPj0gMCkgPyBlbmRPZmZzZXRzQW5kU2NvcGVzW3dpdGhpblRva2VuSW5kZXhdLmVuZE9mZnNldCA6IDApO1xuXHRcdFx0XHR9IHdoaWxlIChwcmV2aW91c1Rva2VuRW5kT2Zmc2V0ID4gc3RhcnRPZmZzZXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gSnVzdCBhZGQgdGhlIHRva2VuIHRvIHRoZSBhcnJheVxuXHRcdFx0XHRhZGRDdXJyZW50VG9rZW5Ub0FycmF5KGNhcHR1cmUsIHN0YXJ0T2Zmc2V0LCBlbmRPZmZzZXQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFjY291bnQgZm9yIHVuY2FwdHVyZWQgY2hhcmFjdGVycyBhdCB0aGUgZW5kIG9mIHRoZSBsaW5lXG5cdFx0aWYgKChlbmRPZmZzZXRzQW5kU2NvcGVzW3Rva2VuSW5kZXggLSAxXS5lbmRPZmZzZXQgPCByYW5nZUxlbmd0aCkpIHtcblx0XHRcdGlmIChyYW5nZUxlbmd0aCAtIGVuZE9mZnNldHNBbmRTY29wZXNbdG9rZW5JbmRleCAtIDFdLmVuZE9mZnNldCA+IDApIHtcblx0XHRcdFx0aW5jcmVhc2VTaXplT2ZUb2tlbnNCeU9uZVRva2VuKCk7XG5cdFx0XHRcdGVuZE9mZnNldHNBbmRTY29wZXNbdG9rZW5JbmRleF0gPSB7IGVuZE9mZnNldDogcmFuZ2VMZW5ndGgsIHNjb3BlczogZW5kT2Zmc2V0c0FuZFNjb3Blc1t0b2tlbkluZGV4XS5zY29wZXMsIGVuY29kZWRMYW5ndWFnZUlkOiB0aGlzLl9lbmNvZGVkTGFuZ3VhZ2VJZCB9O1xuXHRcdFx0XHR0b2tlbkluZGV4Kys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZW5kT2Zmc2V0c0FuZFNjb3Blcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSBlbmRPZmZzZXRzQW5kU2NvcGVzW2ldO1xuXHRcdFx0aWYgKHRva2VuLmVuZE9mZnNldCA9PT0gMCAmJiBpICE9PSAwKSB7XG5cdFx0XHRcdGVuZE9mZnNldHNBbmRTY29wZXMuc3BsaWNlKGksIGVuZE9mZnNldHNBbmRTY29wZXMubGVuZ3RoIC0gaSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjYXB0dXJlVGltZSA9IHN0b3B3YXRjaC5lbGFwc2VkKCk7XG5cdFx0cmV0dXJuIHsgZW5kT2Zmc2V0czogZW5kT2Zmc2V0c0FuZFNjb3BlcyBhcyB7IGVuZE9mZnNldDogbnVtYmVyOyBzY29wZXM6IHN0cmluZ1tdOyBlbmNvZGVkTGFuZ3VhZ2VJZDogTGFuZ3VhZ2VJZCB9W10sIGNhcHR1cmVUaW1lIH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJbmplY3Rpb25DYXB0dXJlcyhwYXJlbnRDYXB0dXJlOiBRdWVyeUNhcHR1cmUsIHJhbmdlOiBSYW5nZSk6IFF1ZXJ5Q2FwdHVyZVtdIHtcblx0XHQvKlxuXHRcdFx0XHRjb25zdCBpbmplY3Rpb24gPSB0ZXh0TW9kZWxUcmVlU2l0dGVyLmdldEluamVjdGlvbihwYXJlbnRDYXB0dXJlLm5vZGUuc3RhcnRJbmRleCwgdGhpcy5fdHJlZVNpdHRlck1vZGVsLmxhbmd1YWdlSWQpO1xuXHRcdFx0XHRpZiAoIWluamVjdGlvbj8udHJlZSB8fCBpbmplY3Rpb24udmVyc2lvbklkICE9PSB0ZXh0TW9kZWxUcmVlU2l0dGVyLnBhcnNlUmVzdWx0Py52ZXJzaW9uSWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZmVhdHVyZSA9IFRyZWVTaXR0ZXJUb2tlbml6YXRpb25SZWdpc3RyeS5nZXQoaW5qZWN0aW9uLmxhbmd1YWdlSWQpO1xuXHRcdFx0XHRpZiAoIWZlYXR1cmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBmZWF0dXJlLnRva1N1cHBvcnRfY2FwdHVyZUF0UmFuZ2VUcmVlKHJhbmdlLCBpbmplY3Rpb24udHJlZSwgdGV4dE1vZGVsVHJlZVNpdHRlcik7Ki9cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIF90b2tlbml6ZUNhcHR1cmVzV2l0aE1ldGFkYXRhKGNhcHR1cmVzOiBRdWVyeUNhcHR1cmVbXSwgcmFuZ2VTdGFydE9mZnNldDogbnVtYmVyLCByYW5nZUVuZE9mZnNldDogbnVtYmVyKTogeyBlbmRPZmZzZXRzQW5kTWV0YWRhdGE6IEVuZE9mZnNldFRva2VuW107IGNhcHR1cmVUaW1lOiBudW1iZXI7IG1ldGFkYXRhVGltZTogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN0b3B3YXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUoKTtcblx0XHRjb25zdCBlbXB0eVRva2VucyA9IHRoaXMuX2NyZWF0ZVRva2Vuc0Zyb21DYXB0dXJlcyhjYXB0dXJlcywgcmFuZ2VTdGFydE9mZnNldCwgcmFuZ2VFbmRPZmZzZXQpO1xuXHRcdGlmICghZW1wdHlUb2tlbnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGVuZE9mZnNldHNBbmRTY29wZXM6IEVuZE9mZnNldFdpdGhNZXRhW10gPSBlbXB0eVRva2Vucy5lbmRPZmZzZXRzO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZW5kT2Zmc2V0c0FuZFNjb3Blcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSBlbmRPZmZzZXRzQW5kU2NvcGVzW2ldO1xuXHRcdFx0dG9rZW4ubWV0YWRhdGEgPSB0aGlzLl90cmVlU2l0dGVyVGhlbWVTZXJ2aWNlLmZpbmRNZXRhZGF0YSh0b2tlbi5zY29wZXMsIHRva2VuLmVuY29kZWRMYW5ndWFnZUlkLCAhIXRva2VuLmJyYWNrZXQgJiYgKHRva2VuLmJyYWNrZXQubGVuZ3RoID4gMCksIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWV0YWRhdGFUaW1lID0gc3RvcHdhdGNoLmVsYXBzZWQoKTtcblx0XHRyZXR1cm4geyBlbmRPZmZzZXRzQW5kTWV0YWRhdGE6IGVuZE9mZnNldHNBbmRTY29wZXMgYXMgeyBlbmRPZmZzZXQ6IG51bWJlcjsgc2NvcGVzOiBzdHJpbmdbXTsgbWV0YWRhdGE6IG51bWJlciB9W10sIGNhcHR1cmVUaW1lOiBlbXB0eVRva2Vucy5jYXB0dXJlVGltZSwgbWV0YWRhdGFUaW1lIH07XG5cdH1cblxuXHRwcml2YXRlIF90b2tlbml6ZUVuY29kZWQobGluZU51bWJlcjogbnVtYmVyKTogeyByZXN1bHQ6IEVuZE9mZnNldFRva2VuW107IGNhcHR1cmVUaW1lOiBudW1iZXI7IG1ldGFkYXRhVGltZTogbnVtYmVyOyB2ZXJzaW9uSWQ6IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsaW5lT2Zmc2V0ID0gdGhpcy5fdGV4dE1vZGVsLmdldE9mZnNldEF0KHsgbGluZU51bWJlcjogbGluZU51bWJlciwgY29sdW1uOiAxIH0pO1xuXHRcdGNvbnN0IG1heExpbmUgPSB0aGlzLl90ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgbGluZUVuZE9mZnNldCA9IChsaW5lTnVtYmVyICsgMSA8PSBtYXhMaW5lKSA/IHRoaXMuX3RleHRNb2RlbC5nZXRPZmZzZXRBdCh7IGxpbmVOdW1iZXI6IGxpbmVOdW1iZXIgKyAxLCBjb2x1bW46IDEgfSkgOiB0aGlzLl90ZXh0TW9kZWwuZ2V0VmFsdWVMZW5ndGgoKTtcblx0XHRjb25zdCBsaW5lTGVuZ3RoID0gbGluZUVuZE9mZnNldCAtIGxpbmVPZmZzZXQ7XG5cblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl90b2tlbml6ZShuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgbGluZUxlbmd0aCArIDEpLCBsaW5lT2Zmc2V0LCBsaW5lRW5kT2Zmc2V0KTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcmVzdWx0OiByZXN1bHQuZW5kT2Zmc2V0c0FuZE1ldGFkYXRhLCBjYXB0dXJlVGltZTogcmVzdWx0LmNhcHR1cmVUaW1lLCBtZXRhZGF0YVRpbWU6IHJlc3VsdC5tZXRhZGF0YVRpbWUsIHZlcnNpb25JZDogcmVzdWx0LnZlcnNpb25JZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5kT2Zmc2V0VG9rZW5zVG9VaW50MzJBcnJheShlbmRPZmZzZXRzQW5kTWV0YWRhdGE6IEVuZE9mZnNldFRva2VuW10pOiBVaW50MzJBcnJheSB7XG5cblx0XHRjb25zdCB1aW50MzJBcnJheSA9IG5ldyBVaW50MzJBcnJheShlbmRPZmZzZXRzQW5kTWV0YWRhdGEubGVuZ3RoICogMik7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbmRPZmZzZXRzQW5kTWV0YWRhdGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdHVpbnQzMkFycmF5W2kgKiAyXSA9IGVuZE9mZnNldHNBbmRNZXRhZGF0YVtpXS5lbmRPZmZzZXQ7XG5cdFx0XHR1aW50MzJBcnJheVtpICogMiArIDFdID0gZW5kT2Zmc2V0c0FuZE1ldGFkYXRhW2ldLm1ldGFkYXRhO1xuXHRcdH1cblx0XHRyZXR1cm4gdWludDMyQXJyYXk7XG5cdH1cbn1cblxuXG5pbnRlcmZhY2UgRW5kT2Zmc2V0VG9rZW4ge1xuXHRlbmRPZmZzZXQ6IG51bWJlcjtcblx0bWV0YWRhdGE6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEVuZE9mZnNldEFuZFNjb3BlcyB7XG5cdGVuZE9mZnNldDogbnVtYmVyO1xuXHRzY29wZXM6IHN0cmluZ1tdO1xuXHRicmFja2V0PzogbnVtYmVyW107XG5cdGVuY29kZWRMYW5ndWFnZUlkOiBMYW5ndWFnZUlkO1xufVxuXG5pbnRlcmZhY2UgRW5kT2Zmc2V0V2l0aE1ldGEgZXh0ZW5kcyBFbmRPZmZzZXRBbmRTY29wZXMge1xuXHRtZXRhZGF0YT86IG51bWJlcjtcbn1cbmV4cG9ydCBjb25zdCBUUkVFU0lUVEVSX0JBU0VfU0NPUEVTOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHQnY3NzJzogJ3NvdXJjZS5jc3MnLFxuXHQndHlwZXNjcmlwdCc6ICdzb3VyY2UudHMnLFxuXHQnaW5pJzogJ3NvdXJjZS5pbmknLFxuXHQncmVnZXgnOiAnc291cmNlLnJlZ2V4Jyxcbn07XG5cbmNvbnN0IEJSQUNLRVRTID0gL1tcXHtcXH1cXFtcXF1cXDxcXD5cXChcXCldL2c7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxpQkFBaUI7QUFJMUIsU0FBUywrQkFBK0I7QUFD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
