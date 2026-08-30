import { CallbackIterable, compareBy } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Range } from "../../core/range.js";
import { ignoreBracketsInToken } from "../../languages/supports.js";
import { BracketsUtils } from "../../languages/supports/richEditBrackets.js";
import { BracketPairsTree } from "./bracketPairsTree/bracketPairsTree.js";
class BracketPairsTextModelPart extends Disposable {
  constructor(textModel, languageConfigurationService) {
    super();
    this.textModel = textModel;
    this.languageConfigurationService = languageConfigurationService;
    this.bracketPairsTree = this._register(new MutableDisposable());
    this.onDidChangeEmitter = this._register(new Emitter());
    this.onDidChange = this.onDidChangeEmitter.event;
    this.bracketsRequested = false;
  }
  get canBuildAST() {
    const maxSupportedDocumentLength = (
      /* max lines */
      5e4 * /* average column count */
      100
    );
    return this.textModel.getValueLength() <= maxSupportedDocumentLength;
  }
  //#region TextModel events
  handleLanguageConfigurationServiceChange(e) {
    if (!e.languageId || this.bracketPairsTree.value?.object.didLanguageChange(e.languageId)) {
      this.bracketPairsTree.clear();
      this.updateBracketPairsTree();
    }
  }
  handleDidChangeOptions(e) {
    this.bracketPairsTree.clear();
    this.updateBracketPairsTree();
  }
  handleDidChangeLanguage(e) {
    this.bracketPairsTree.clear();
    this.updateBracketPairsTree();
  }
  handleDidChangeContent(change) {
    this.bracketPairsTree.value?.object.handleContentChanged(change);
  }
  handleDidChangeBackgroundTokenizationState() {
    this.bracketPairsTree.value?.object.handleDidChangeBackgroundTokenizationState();
  }
  handleDidChangeTokens(e) {
    this.bracketPairsTree.value?.object.handleDidChangeTokens(e);
  }
  //#endregion
  updateBracketPairsTree() {
    if (this.bracketsRequested && this.canBuildAST) {
      if (!this.bracketPairsTree.value) {
        const store = new DisposableStore();
        this.bracketPairsTree.value = createDisposableRef(
          store.add(
            new BracketPairsTree(this.textModel, (languageId) => {
              return this.languageConfigurationService.getLanguageConfiguration(languageId);
            })
          ),
          store
        );
        store.add(this.bracketPairsTree.value.object.onDidChange((e) => this.onDidChangeEmitter.fire(e)));
        this.onDidChangeEmitter.fire();
      }
    } else {
      if (this.bracketPairsTree.value) {
        this.bracketPairsTree.clear();
        this.onDidChangeEmitter.fire();
      }
    }
  }
  /**
   * Returns all bracket pairs that intersect the given range.
   * The result is sorted by the start position.
  */
  getBracketPairsInRange(range) {
    this.bracketsRequested = true;
    this.updateBracketPairsTree();
    return this.bracketPairsTree.value?.object.getBracketPairsInRange(range, false) || CallbackIterable.empty;
  }
  getBracketPairsInRangeWithMinIndentation(range) {
    this.bracketsRequested = true;
    this.updateBracketPairsTree();
    return this.bracketPairsTree.value?.object.getBracketPairsInRange(range, true) || CallbackIterable.empty;
  }
  getBracketsInRange(range, onlyColorizedBrackets = false) {
    this.bracketsRequested = true;
    this.updateBracketPairsTree();
    return this.bracketPairsTree.value?.object.getBracketsInRange(range, onlyColorizedBrackets) || CallbackIterable.empty;
  }
  findMatchingBracketUp(_bracket, _position, maxDuration) {
    const position = this.textModel.validatePosition(_position);
    const languageId = this.textModel.getLanguageIdAtPosition(position.lineNumber, position.column);
    if (this.canBuildAST) {
      const closingBracketInfo = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew.getClosingBracketInfo(_bracket);
      if (!closingBracketInfo) {
        return null;
      }
      const bracketPair = this.getBracketPairsInRange(Range.fromPositions(_position, _position)).findLast(
        (b) => closingBracketInfo.closes(b.openingBracketInfo)
      );
      if (bracketPair) {
        return bracketPair.openingBracketRange;
      }
      return null;
    } else {
      const bracket = _bracket.toLowerCase();
      const bracketsSupport = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
      if (!bracketsSupport) {
        return null;
      }
      const data = bracketsSupport.textIsBracket[bracket];
      if (!data) {
        return null;
      }
      return stripBracketSearchCanceled(this._findMatchingBracketUp(data, position, createTimeBasedContinueBracketSearchPredicate(maxDuration)));
    }
  }
  matchBracket(position, maxDuration) {
    if (this.canBuildAST) {
      const bracketPair = this.getBracketPairsInRange(
        Range.fromPositions(position, position)
      ).filter(
        (item) => item.closingBracketRange !== void 0 && (item.openingBracketRange.containsPosition(position) || item.closingBracketRange.containsPosition(position))
      ).findLastMaxBy(
        compareBy(
          (item) => item.openingBracketRange.containsPosition(position) ? item.openingBracketRange : item.closingBracketRange,
          Range.compareRangesUsingStarts
        )
      );
      if (bracketPair) {
        return [bracketPair.openingBracketRange, bracketPair.closingBracketRange];
      }
      return null;
    } else {
      const continueSearchPredicate = createTimeBasedContinueBracketSearchPredicate(maxDuration);
      return this._matchBracket(this.textModel.validatePosition(position), continueSearchPredicate);
    }
  }
  _establishBracketSearchOffsets(position, lineTokens, modeBrackets, tokenIndex) {
    const tokenCount = lineTokens.getCount();
    const currentLanguageId = lineTokens.getLanguageId(tokenIndex);
    let searchStartOffset = Math.max(0, position.column - 1 - modeBrackets.maxBracketLength);
    for (let i = tokenIndex - 1; i >= 0; i--) {
      const tokenEndOffset = lineTokens.getEndOffset(i);
      if (tokenEndOffset <= searchStartOffset) {
        break;
      }
      if (ignoreBracketsInToken(lineTokens.getStandardTokenType(i)) || lineTokens.getLanguageId(i) !== currentLanguageId) {
        searchStartOffset = tokenEndOffset;
        break;
      }
    }
    let searchEndOffset = Math.min(lineTokens.getLineContent().length, position.column - 1 + modeBrackets.maxBracketLength);
    for (let i = tokenIndex + 1; i < tokenCount; i++) {
      const tokenStartOffset = lineTokens.getStartOffset(i);
      if (tokenStartOffset >= searchEndOffset) {
        break;
      }
      if (ignoreBracketsInToken(lineTokens.getStandardTokenType(i)) || lineTokens.getLanguageId(i) !== currentLanguageId) {
        searchEndOffset = tokenStartOffset;
        break;
      }
    }
    return { searchStartOffset, searchEndOffset };
  }
  _matchBracket(position, continueSearchPredicate) {
    const lineNumber = position.lineNumber;
    const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
    const lineText = this.textModel.getLineContent(lineNumber);
    const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
    if (tokenIndex < 0) {
      return null;
    }
    const currentModeBrackets = this.languageConfigurationService.getLanguageConfiguration(lineTokens.getLanguageId(tokenIndex)).brackets;
    if (currentModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex))) {
      let { searchStartOffset, searchEndOffset } = this._establishBracketSearchOffsets(position, lineTokens, currentModeBrackets, tokenIndex);
      let bestResult = null;
      while (true) {
        const foundBracket = BracketsUtils.findNextBracketInRange(currentModeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (!foundBracket) {
          break;
        }
        if (foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
          const foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1).toLowerCase();
          const r = this._matchFoundBracket(foundBracket, currentModeBrackets.textIsBracket[foundBracketText], currentModeBrackets.textIsOpenBracket[foundBracketText], continueSearchPredicate);
          if (r) {
            if (r instanceof BracketSearchCanceled) {
              return null;
            }
            bestResult = r;
          }
        }
        searchStartOffset = foundBracket.endColumn - 1;
      }
      if (bestResult) {
        return bestResult;
      }
    }
    if (tokenIndex > 0 && lineTokens.getStartOffset(tokenIndex) === position.column - 1) {
      const prevTokenIndex = tokenIndex - 1;
      const prevModeBrackets = this.languageConfigurationService.getLanguageConfiguration(lineTokens.getLanguageId(prevTokenIndex)).brackets;
      if (prevModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(prevTokenIndex))) {
        const { searchStartOffset, searchEndOffset } = this._establishBracketSearchOffsets(position, lineTokens, prevModeBrackets, prevTokenIndex);
        const foundBracket = BracketsUtils.findPrevBracketInRange(prevModeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (foundBracket && foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
          const foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1).toLowerCase();
          const r = this._matchFoundBracket(foundBracket, prevModeBrackets.textIsBracket[foundBracketText], prevModeBrackets.textIsOpenBracket[foundBracketText], continueSearchPredicate);
          if (r) {
            if (r instanceof BracketSearchCanceled) {
              return null;
            }
            return r;
          }
        }
      }
    }
    return null;
  }
  _matchFoundBracket(foundBracket, data, isOpen, continueSearchPredicate) {
    if (!data) {
      return null;
    }
    const matched = isOpen ? this._findMatchingBracketDown(data, foundBracket.getEndPosition(), continueSearchPredicate) : this._findMatchingBracketUp(data, foundBracket.getStartPosition(), continueSearchPredicate);
    if (!matched) {
      return null;
    }
    if (matched instanceof BracketSearchCanceled) {
      return matched;
    }
    return [foundBracket, matched];
  }
  _findMatchingBracketUp(bracket, position, continueSearchPredicate) {
    const languageId = bracket.languageId;
    const reversedBracketRegex = bracket.reversedRegex;
    let count = -1;
    let totalCallCount = 0;
    const searchPrevMatchingBracketInRange = (lineNumber, lineText, searchStartOffset, searchEndOffset) => {
      while (true) {
        if (continueSearchPredicate && ++totalCallCount % 100 === 0 && !continueSearchPredicate()) {
          return BracketSearchCanceled.INSTANCE;
        }
        const r = BracketsUtils.findPrevBracketInRange(reversedBracketRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (!r) {
          break;
        }
        const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
        if (bracket.isOpen(hitText)) {
          count++;
        } else if (bracket.isClose(hitText)) {
          count--;
        }
        if (count === 0) {
          return r;
        }
        searchEndOffset = r.startColumn - 1;
      }
      return null;
    };
    for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = tokenCount - 1;
      let searchStartOffset = lineText.length;
      let searchEndOffset = lineText.length;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
      }
      let prevSearchInToken = true;
      for (; tokenIndex >= 0; tokenIndex--) {
        const searchInToken = lineTokens.getLanguageId(tokenIndex) === languageId && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = searchPrevMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return r;
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = searchPrevMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return r;
        }
      }
    }
    return null;
  }
  _findMatchingBracketDown(bracket, position, continueSearchPredicate) {
    const languageId = bracket.languageId;
    const bracketRegex = bracket.forwardRegex;
    let count = 1;
    let totalCallCount = 0;
    const searchNextMatchingBracketInRange = (lineNumber, lineText, searchStartOffset, searchEndOffset) => {
      while (true) {
        if (continueSearchPredicate && ++totalCallCount % 100 === 0 && !continueSearchPredicate()) {
          return BracketSearchCanceled.INSTANCE;
        }
        const r = BracketsUtils.findNextBracketInRange(bracketRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (!r) {
          break;
        }
        const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
        if (bracket.isOpen(hitText)) {
          count++;
        } else if (bracket.isClose(hitText)) {
          count--;
        }
        if (count === 0) {
          return r;
        }
        searchStartOffset = r.endColumn - 1;
      }
      return null;
    };
    const lineCount = this.textModel.getLineCount();
    for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = 0;
      let searchStartOffset = 0;
      let searchEndOffset = 0;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
      }
      let prevSearchInToken = true;
      for (; tokenIndex < tokenCount; tokenIndex++) {
        const searchInToken = lineTokens.getLanguageId(tokenIndex) === languageId && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = searchNextMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return r;
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = searchNextMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return r;
        }
      }
    }
    return null;
  }
  findPrevBracket(_position) {
    const position = this.textModel.validatePosition(_position);
    if (this.canBuildAST) {
      this.bracketsRequested = true;
      this.updateBracketPairsTree();
      return this.bracketPairsTree.value?.object.getFirstBracketBefore(position) || null;
    }
    let languageId = null;
    let modeBrackets = null;
    let bracketConfig = null;
    for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = tokenCount - 1;
      let searchStartOffset = lineText.length;
      let searchEndOffset = lineText.length;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
        }
      }
      let prevSearchInToken = true;
      for (; tokenIndex >= 0; tokenIndex--) {
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          if (modeBrackets && bracketConfig && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return this._toFoundBracket(bracketConfig, r);
            }
            prevSearchInToken = false;
          }
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
        }
        const searchInToken = !!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return this._toFoundBracket(bracketConfig, r);
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return this._toFoundBracket(bracketConfig, r);
        }
      }
    }
    return null;
  }
  findNextBracket(_position) {
    const position = this.textModel.validatePosition(_position);
    if (this.canBuildAST) {
      this.bracketsRequested = true;
      this.updateBracketPairsTree();
      return this.bracketPairsTree.value?.object.getFirstBracketAfter(position) || null;
    }
    const lineCount = this.textModel.getLineCount();
    let languageId = null;
    let modeBrackets = null;
    let bracketConfig = null;
    for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = 0;
      let searchStartOffset = 0;
      let searchEndOffset = 0;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
        }
      }
      let prevSearchInToken = true;
      for (; tokenIndex < tokenCount; tokenIndex++) {
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return this._toFoundBracket(bracketConfig, r);
            }
            prevSearchInToken = false;
          }
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          bracketConfig = this.languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew;
        }
        const searchInToken = !!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return this._toFoundBracket(bracketConfig, r);
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (bracketConfig && modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return this._toFoundBracket(bracketConfig, r);
        }
      }
    }
    return null;
  }
  findEnclosingBrackets(_position, maxDuration) {
    const position = this.textModel.validatePosition(_position);
    if (this.canBuildAST) {
      const range = Range.fromPositions(position);
      const bracketPair = this.getBracketPairsInRange(Range.fromPositions(position, position)).findLast(
        (item) => item.closingBracketRange !== void 0 && item.range.strictContainsRange(range)
      );
      if (bracketPair) {
        return [bracketPair.openingBracketRange, bracketPair.closingBracketRange];
      }
      return null;
    }
    const continueSearchPredicate = createTimeBasedContinueBracketSearchPredicate(maxDuration);
    const lineCount = this.textModel.getLineCount();
    const savedCounts = /* @__PURE__ */ new Map();
    let counts = [];
    const resetCounts = (languageId2, modeBrackets2) => {
      if (!savedCounts.has(languageId2)) {
        const tmp = [];
        for (let i = 0, len = modeBrackets2 ? modeBrackets2.brackets.length : 0; i < len; i++) {
          tmp[i] = 0;
        }
        savedCounts.set(languageId2, tmp);
      }
      counts = savedCounts.get(languageId2);
    };
    let totalCallCount = 0;
    const searchInRange = (modeBrackets2, lineNumber, lineText, searchStartOffset, searchEndOffset) => {
      while (true) {
        if (continueSearchPredicate && ++totalCallCount % 100 === 0 && !continueSearchPredicate()) {
          return BracketSearchCanceled.INSTANCE;
        }
        const r = BracketsUtils.findNextBracketInRange(modeBrackets2.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (!r) {
          break;
        }
        const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
        const bracket = modeBrackets2.textIsBracket[hitText];
        if (bracket) {
          if (bracket.isOpen(hitText)) {
            counts[bracket.index]++;
          } else if (bracket.isClose(hitText)) {
            counts[bracket.index]--;
          }
          if (counts[bracket.index] === -1) {
            return this._matchFoundBracket(r, bracket, false, continueSearchPredicate);
          }
        }
        searchStartOffset = r.endColumn - 1;
      }
      return null;
    };
    let languageId = null;
    let modeBrackets = null;
    for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
      const lineTokens = this.textModel.tokenization.getLineTokens(lineNumber);
      const tokenCount = lineTokens.getCount();
      const lineText = this.textModel.getLineContent(lineNumber);
      let tokenIndex = 0;
      let searchStartOffset = 0;
      let searchEndOffset = 0;
      if (lineNumber === position.lineNumber) {
        tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
        searchStartOffset = position.column - 1;
        searchEndOffset = position.column - 1;
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          resetCounts(languageId, modeBrackets);
        }
      }
      let prevSearchInToken = true;
      for (; tokenIndex < tokenCount; tokenIndex++) {
        const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
        if (languageId !== tokenLanguageId) {
          if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return stripBracketSearchCanceled(r);
            }
            prevSearchInToken = false;
          }
          languageId = tokenLanguageId;
          modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
          resetCounts(languageId, modeBrackets);
        }
        const searchInToken = !!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex));
        if (searchInToken) {
          if (prevSearchInToken) {
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          } else {
            searchStartOffset = lineTokens.getStartOffset(tokenIndex);
            searchEndOffset = lineTokens.getEndOffset(tokenIndex);
          }
        } else {
          if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
            const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
            if (r) {
              return stripBracketSearchCanceled(r);
            }
          }
        }
        prevSearchInToken = searchInToken;
      }
      if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
        const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
        if (r) {
          return stripBracketSearchCanceled(r);
        }
      }
    }
    return null;
  }
  _toFoundBracket(bracketConfig, r) {
    if (!r) {
      return null;
    }
    let text = this.textModel.getValueInRange(r);
    text = text.toLowerCase();
    const bracketInfo = bracketConfig.getBracketInfo(text);
    if (!bracketInfo) {
      return null;
    }
    return {
      range: r,
      bracketInfo
    };
  }
}
function createDisposableRef(object, disposable) {
  return {
    object,
    dispose: () => disposable?.dispose()
  };
}
function createTimeBasedContinueBracketSearchPredicate(maxDuration) {
  if (typeof maxDuration === "undefined") {
    return () => true;
  } else {
    const startTime = Date.now();
    return () => {
      return Date.now() - startTime <= maxDuration;
    };
  }
}
const _BracketSearchCanceled = class _BracketSearchCanceled {
  constructor() {
    this._searchCanceledBrand = void 0;
  }
};
_BracketSearchCanceled.INSTANCE = new _BracketSearchCanceled();
let BracketSearchCanceled = _BracketSearchCanceled;
function stripBracketSearchCanceled(result) {
  if (result instanceof BracketSearchCanceled) {
    return null;
  }
  return result;
}
export {
  BracketPairsTextModelPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXGJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnRcXGJyYWNrZXRQYWlyc0ltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYWxsYmFja0l0ZXJhYmxlLCBjb21wYXJlQnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZUNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGlnbm9yZUJyYWNrZXRzSW5Ub2tlbiB9IGZyb20gJy4uLy4uL2xhbmd1YWdlcy9zdXBwb3J0cy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUJyYWNrZXRzQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2xhbmd1YWdlcy9zdXBwb3J0cy9sYW5ndWFnZUJyYWNrZXRzQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBCcmFja2V0c1V0aWxzLCBSaWNoRWRpdEJyYWNrZXQsIFJpY2hFZGl0QnJhY2tldHMgfSBmcm9tICcuLi8uLi9sYW5ndWFnZXMvc3VwcG9ydHMvcmljaEVkaXRCcmFja2V0cy5qcyc7XG5pbXBvcnQgeyBCcmFja2V0UGFpcnNUcmVlIH0gZnJvbSAnLi9icmFja2V0UGFpcnNUcmVlL2JyYWNrZXRQYWlyc1RyZWUuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IEJyYWNrZXRJbmZvLCBCcmFja2V0UGFpckluZm8sIEJyYWNrZXRQYWlyV2l0aE1pbkluZGVudGF0aW9uSW5mbywgSUJyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQsIElGb3VuZEJyYWNrZXQgfSBmcm9tICcuLi8uLi90ZXh0TW9kZWxCcmFja2V0UGFpcnMuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCwgSU1vZGVsTGFuZ3VhZ2VDaGFuZ2VkRXZlbnQsIElNb2RlbE9wdGlvbnNDaGFuZ2VkRXZlbnQsIElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBMaW5lVG9rZW5zIH0gZnJvbSAnLi4vLi4vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgQnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgYnJhY2tldFBhaXJzVHJlZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJUmVmZXJlbmNlPEJyYWNrZXRQYWlyc1RyZWU+PigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5ldmVudDtcblxuXHRwcml2YXRlIGdldCBjYW5CdWlsZEFTVCgpIHtcblx0XHRjb25zdCBtYXhTdXBwb3J0ZWREb2N1bWVudExlbmd0aCA9IC8qIG1heCBsaW5lcyAqLyA1MF8wMDAgKiAvKiBhdmVyYWdlIGNvbHVtbiBjb3VudCAqLyAxMDA7XG5cdFx0cmV0dXJuIHRoaXMudGV4dE1vZGVsLmdldFZhbHVlTGVuZ3RoKCkgPD0gbWF4U3VwcG9ydGVkRG9jdW1lbnRMZW5ndGg7XG5cdH1cblxuXHRwcml2YXRlIGJyYWNrZXRzUmVxdWVzdGVkID0gZmFsc2U7XG5cblx0cHVibGljIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsOiBUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIFRleHRNb2RlbCBldmVudHNcblxuXHRwdWJsaWMgaGFuZGxlTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZUNoYW5nZShlOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIWUubGFuZ3VhZ2VJZCB8fCB0aGlzLmJyYWNrZXRQYWlyc1RyZWUudmFsdWU/Lm9iamVjdC5kaWRMYW5ndWFnZUNoYW5nZShlLmxhbmd1YWdlSWQpKSB7XG5cdFx0XHR0aGlzLmJyYWNrZXRQYWlyc1RyZWUuY2xlYXIoKTtcblx0XHRcdHRoaXMudXBkYXRlQnJhY2tldFBhaXJzVHJlZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVEaWRDaGFuZ2VPcHRpb25zKGU6IElNb2RlbE9wdGlvbnNDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmJyYWNrZXRQYWlyc1RyZWUuY2xlYXIoKTtcblx0XHR0aGlzLnVwZGF0ZUJyYWNrZXRQYWlyc1RyZWUoKTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVEaWRDaGFuZ2VMYW5ndWFnZShlOiBJTW9kZWxMYW5ndWFnZUNoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuYnJhY2tldFBhaXJzVHJlZS5jbGVhcigpO1xuXHRcdHRoaXMudXBkYXRlQnJhY2tldFBhaXJzVHJlZSgpO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZURpZENoYW5nZUNvbnRlbnQoY2hhbmdlOiBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50KSB7XG5cdFx0dGhpcy5icmFja2V0UGFpcnNUcmVlLnZhbHVlPy5vYmplY3QuaGFuZGxlQ29udGVudENoYW5nZWQoY2hhbmdlKTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVEaWRDaGFuZ2VCYWNrZ3JvdW5kVG9rZW5pemF0aW9uU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5icmFja2V0UGFpcnNUcmVlLnZhbHVlPy5vYmplY3QuaGFuZGxlRGlkQ2hhbmdlQmFja2dyb3VuZFRva2VuaXphdGlvblN0YXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlRGlkQ2hhbmdlVG9rZW5zKGU6IElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZT8ub2JqZWN0LmhhbmRsZURpZENoYW5nZVRva2VucyhlKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgdXBkYXRlQnJhY2tldFBhaXJzVHJlZSgpIHtcblx0XHRpZiAodGhpcy5icmFja2V0c1JlcXVlc3RlZCAmJiB0aGlzLmNhbkJ1aWxkQVNUKSB7XG5cdFx0XHRpZiAoIXRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZSkge1xuXHRcdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0XHR0aGlzLmJyYWNrZXRQYWlyc1RyZWUudmFsdWUgPSBjcmVhdGVEaXNwb3NhYmxlUmVmKFxuXHRcdFx0XHRcdHN0b3JlLmFkZChcblx0XHRcdFx0XHRcdG5ldyBCcmFja2V0UGFpcnNUcmVlKHRoaXMudGV4dE1vZGVsLCAobGFuZ3VhZ2VJZCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKTtcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRzdG9yZVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5icmFja2V0UGFpcnNUcmVlLnZhbHVlLm9iamVjdC5vbkRpZENoYW5nZShlID0+IHRoaXMub25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoZSkpKTtcblx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5icmFja2V0UGFpcnNUcmVlLnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuYnJhY2tldFBhaXJzVHJlZS5jbGVhcigpO1xuXHRcdFx0XHQvLyBJbXBvcnRhbnQ6IERvbid0IGNhbGwgZmlyZSBpZiB0aGVyZSB3YXMgbm8gY2hhbmdlIVxuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIGJyYWNrZXQgcGFpcnMgdGhhdCBpbnRlcnNlY3QgdGhlIGdpdmVuIHJhbmdlLlxuXHQgKiBUaGUgcmVzdWx0IGlzIHNvcnRlZCBieSB0aGUgc3RhcnQgcG9zaXRpb24uXG5cdCovXG5cdHB1YmxpYyBnZXRCcmFja2V0UGFpcnNJblJhbmdlKHJhbmdlOiBSYW5nZSk6IENhbGxiYWNrSXRlcmFibGU8QnJhY2tldFBhaXJJbmZvPiB7XG5cdFx0dGhpcy5icmFja2V0c1JlcXVlc3RlZCA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGVCcmFja2V0UGFpcnNUcmVlKCk7XG5cdFx0cmV0dXJuIHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZT8ub2JqZWN0LmdldEJyYWNrZXRQYWlyc0luUmFuZ2UocmFuZ2UsIGZhbHNlKSB8fCBDYWxsYmFja0l0ZXJhYmxlLmVtcHR5O1xuXHR9XG5cblx0cHVibGljIGdldEJyYWNrZXRQYWlyc0luUmFuZ2VXaXRoTWluSW5kZW50YXRpb24ocmFuZ2U6IFJhbmdlKTogQ2FsbGJhY2tJdGVyYWJsZTxCcmFja2V0UGFpcldpdGhNaW5JbmRlbnRhdGlvbkluZm8+IHtcblx0XHR0aGlzLmJyYWNrZXRzUmVxdWVzdGVkID0gdHJ1ZTtcblx0XHR0aGlzLnVwZGF0ZUJyYWNrZXRQYWlyc1RyZWUoKTtcblx0XHRyZXR1cm4gdGhpcy5icmFja2V0UGFpcnNUcmVlLnZhbHVlPy5vYmplY3QuZ2V0QnJhY2tldFBhaXJzSW5SYW5nZShyYW5nZSwgdHJ1ZSkgfHwgQ2FsbGJhY2tJdGVyYWJsZS5lbXB0eTtcblx0fVxuXG5cdHB1YmxpYyBnZXRCcmFja2V0c0luUmFuZ2UocmFuZ2U6IFJhbmdlLCBvbmx5Q29sb3JpemVkQnJhY2tldHM6IGJvb2xlYW4gPSBmYWxzZSk6IENhbGxiYWNrSXRlcmFibGU8QnJhY2tldEluZm8+IHtcblx0XHR0aGlzLmJyYWNrZXRzUmVxdWVzdGVkID0gdHJ1ZTtcblx0XHR0aGlzLnVwZGF0ZUJyYWNrZXRQYWlyc1RyZWUoKTtcblx0XHRyZXR1cm4gdGhpcy5icmFja2V0UGFpcnNUcmVlLnZhbHVlPy5vYmplY3QuZ2V0QnJhY2tldHNJblJhbmdlKHJhbmdlLCBvbmx5Q29sb3JpemVkQnJhY2tldHMpIHx8IENhbGxiYWNrSXRlcmFibGUuZW1wdHk7XG5cdH1cblxuXHRwdWJsaWMgZmluZE1hdGNoaW5nQnJhY2tldFVwKF9icmFja2V0OiBzdHJpbmcsIF9wb3NpdGlvbjogSVBvc2l0aW9uLCBtYXhEdXJhdGlvbj86IG51bWJlcik6IFJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLnRleHRNb2RlbC52YWxpZGF0ZVBvc2l0aW9uKF9wb3NpdGlvbik7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMudGV4dE1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cblx0XHRpZiAodGhpcy5jYW5CdWlsZEFTVCkge1xuXHRcdFx0Y29uc3QgY2xvc2luZ0JyYWNrZXRJbmZvID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0XHRcdC5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZClcblx0XHRcdFx0LmJyYWNrZXRzTmV3LmdldENsb3NpbmdCcmFja2V0SW5mbyhfYnJhY2tldCk7XG5cblx0XHRcdGlmICghY2xvc2luZ0JyYWNrZXRJbmZvKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBicmFja2V0UGFpciA9IHRoaXMuZ2V0QnJhY2tldFBhaXJzSW5SYW5nZShSYW5nZS5mcm9tUG9zaXRpb25zKF9wb3NpdGlvbiwgX3Bvc2l0aW9uKSkuZmluZExhc3QoKGIpID0+XG5cdFx0XHRcdGNsb3NpbmdCcmFja2V0SW5mby5jbG9zZXMoYi5vcGVuaW5nQnJhY2tldEluZm8pXG5cdFx0XHQpO1xuXG5cdFx0XHRpZiAoYnJhY2tldFBhaXIpIHtcblx0XHRcdFx0cmV0dXJuIGJyYWNrZXRQYWlyLm9wZW5pbmdCcmFja2V0UmFuZ2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRmFsbGJhY2sgdG8gb2xkIGJyYWNrZXQgbWF0Y2hpbmcgY29kZTpcblx0XHRcdGNvbnN0IGJyYWNrZXQgPSBfYnJhY2tldC50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0XHRjb25zdCBicmFja2V0c1N1cHBvcnQgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzO1xuXG5cdFx0XHRpZiAoIWJyYWNrZXRzU3VwcG9ydCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZGF0YSA9IGJyYWNrZXRzU3VwcG9ydC50ZXh0SXNCcmFja2V0W2JyYWNrZXRdO1xuXG5cdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBzdHJpcEJyYWNrZXRTZWFyY2hDYW5jZWxlZCh0aGlzLl9maW5kTWF0Y2hpbmdCcmFja2V0VXAoZGF0YSwgcG9zaXRpb24sIGNyZWF0ZVRpbWVCYXNlZENvbnRpbnVlQnJhY2tldFNlYXJjaFByZWRpY2F0ZShtYXhEdXJhdGlvbikpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgbWF0Y2hCcmFja2V0KHBvc2l0aW9uOiBJUG9zaXRpb24sIG1heER1cmF0aW9uPzogbnVtYmVyKTogW1JhbmdlLCBSYW5nZV0gfCBudWxsIHtcblx0XHRpZiAodGhpcy5jYW5CdWlsZEFTVCkge1xuXHRcdFx0Y29uc3QgYnJhY2tldFBhaXIgPVxuXHRcdFx0XHR0aGlzLmdldEJyYWNrZXRQYWlyc0luUmFuZ2UoXG5cdFx0XHRcdFx0UmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbiwgcG9zaXRpb24pXG5cdFx0XHRcdCkuZmlsdGVyKFxuXHRcdFx0XHRcdChpdGVtKSA9PlxuXHRcdFx0XHRcdFx0aXRlbS5jbG9zaW5nQnJhY2tldFJhbmdlICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0XHRcdChpdGVtLm9wZW5pbmdCcmFja2V0UmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikgfHxcblx0XHRcdFx0XHRcdFx0aXRlbS5jbG9zaW5nQnJhY2tldFJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKVxuXHRcdFx0XHQpLmZpbmRMYXN0TWF4QnkoXG5cdFx0XHRcdFx0Y29tcGFyZUJ5KFxuXHRcdFx0XHRcdFx0KGl0ZW0pID0+XG5cdFx0XHRcdFx0XHRcdGl0ZW0ub3BlbmluZ0JyYWNrZXRSYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKVxuXHRcdFx0XHRcdFx0XHRcdD8gaXRlbS5vcGVuaW5nQnJhY2tldFJhbmdlXG5cdFx0XHRcdFx0XHRcdFx0OiBpdGVtLmNsb3NpbmdCcmFja2V0UmFuZ2UsXG5cdFx0XHRcdFx0XHRSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHNcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCk7XG5cdFx0XHRpZiAoYnJhY2tldFBhaXIpIHtcblx0XHRcdFx0cmV0dXJuIFticmFja2V0UGFpci5vcGVuaW5nQnJhY2tldFJhbmdlLCBicmFja2V0UGFpci5jbG9zaW5nQnJhY2tldFJhbmdlIV07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRmFsbGJhY2sgdG8gb2xkIGJyYWNrZXQgbWF0Y2hpbmcgY29kZTpcblx0XHRcdGNvbnN0IGNvbnRpbnVlU2VhcmNoUHJlZGljYXRlID0gY3JlYXRlVGltZUJhc2VkQ29udGludWVCcmFja2V0U2VhcmNoUHJlZGljYXRlKG1heER1cmF0aW9uKTtcblx0XHRcdHJldHVybiB0aGlzLl9tYXRjaEJyYWNrZXQodGhpcy50ZXh0TW9kZWwudmFsaWRhdGVQb3NpdGlvbihwb3NpdGlvbiksIGNvbnRpbnVlU2VhcmNoUHJlZGljYXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lc3RhYmxpc2hCcmFja2V0U2VhcmNoT2Zmc2V0cyhwb3NpdGlvbjogUG9zaXRpb24sIGxpbmVUb2tlbnM6IExpbmVUb2tlbnMsIG1vZGVCcmFja2V0czogUmljaEVkaXRCcmFja2V0cywgdG9rZW5JbmRleDogbnVtYmVyKSB7XG5cdFx0Y29uc3QgdG9rZW5Db3VudCA9IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTtcblx0XHRjb25zdCBjdXJyZW50TGFuZ3VhZ2VJZCA9IGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4KTtcblxuXHRcdC8vIGxpbWl0IHNlYXJjaCB0byBub3QgZ28gYmVmb3JlIGBtYXhCcmFja2V0TGVuZ3RoYFxuXHRcdGxldCBzZWFyY2hTdGFydE9mZnNldCA9IE1hdGgubWF4KDAsIHBvc2l0aW9uLmNvbHVtbiAtIDEgLSBtb2RlQnJhY2tldHMubWF4QnJhY2tldExlbmd0aCk7XG5cdFx0Zm9yIChsZXQgaSA9IHRva2VuSW5kZXggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgdG9rZW5FbmRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldChpKTtcblx0XHRcdGlmICh0b2tlbkVuZE9mZnNldCA8PSBzZWFyY2hTdGFydE9mZnNldCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChpZ25vcmVCcmFja2V0c0luVG9rZW4obGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZShpKSkgfHwgbGluZVRva2Vucy5nZXRMYW5ndWFnZUlkKGkpICE9PSBjdXJyZW50TGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IHRva2VuRW5kT2Zmc2V0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBsaW1pdCBzZWFyY2ggdG8gbm90IGdvIGFmdGVyIGBtYXhCcmFja2V0TGVuZ3RoYFxuXHRcdGxldCBzZWFyY2hFbmRPZmZzZXQgPSBNYXRoLm1pbihsaW5lVG9rZW5zLmdldExpbmVDb250ZW50KCkubGVuZ3RoLCBwb3NpdGlvbi5jb2x1bW4gLSAxICsgbW9kZUJyYWNrZXRzLm1heEJyYWNrZXRMZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSB0b2tlbkluZGV4ICsgMTsgaSA8IHRva2VuQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgdG9rZW5TdGFydE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQoaSk7XG5cdFx0XHRpZiAodG9rZW5TdGFydE9mZnNldCA+PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaWdub3JlQnJhY2tldHNJblRva2VuKGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUoaSkpIHx8IGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZChpKSAhPT0gY3VycmVudExhbmd1YWdlSWQpIHtcblx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gdG9rZW5TdGFydE9mZnNldDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hCcmFja2V0KHBvc2l0aW9uOiBQb3NpdGlvbiwgY29udGludWVTZWFyY2hQcmVkaWNhdGU6IENvbnRpbnVlQnJhY2tldFNlYXJjaFByZWRpY2F0ZSk6IFtSYW5nZSwgUmFuZ2VdIHwgbnVsbCB7XG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IHRoaXMudGV4dE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGxpbmVUZXh0ID0gdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cblx0XHRjb25zdCB0b2tlbkluZGV4ID0gbGluZVRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdGlmICh0b2tlbkluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRNb2RlQnJhY2tldHMgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4KSkuYnJhY2tldHM7XG5cblx0XHQvLyBjaGVjayB0aGF0IHRoZSB0b2tlbiBpcyBub3QgdG8gYmUgaWdub3JlZFxuXHRcdGlmIChjdXJyZW50TW9kZUJyYWNrZXRzICYmICFpZ25vcmVCcmFja2V0c0luVG9rZW4obGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4KSkpIHtcblxuXHRcdFx0bGV0IHsgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCB9ID0gdGhpcy5fZXN0YWJsaXNoQnJhY2tldFNlYXJjaE9mZnNldHMocG9zaXRpb24sIGxpbmVUb2tlbnMsIGN1cnJlbnRNb2RlQnJhY2tldHMsIHRva2VuSW5kZXgpO1xuXG5cdFx0XHQvLyBpdCBtaWdodCBiZSB0aGUgY2FzZSB0aGF0IFtjdXJyZW50VG9rZW5TdGFydCAtPiBjdXJyZW50VG9rZW5FbmRdIGNvbnRhaW5zIG11bHRpcGxlIGJyYWNrZXRzXG5cdFx0XHQvLyBgYmVzdFJlc3VsdGAgd2lsbCBjb250YWluIHRoZSBtb3N0IHJpZ2h0LXNpZGUgcmVzdWx0XG5cdFx0XHRsZXQgYmVzdFJlc3VsdDogW1JhbmdlLCBSYW5nZV0gfCBudWxsID0gbnVsbDtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGNvbnN0IGZvdW5kQnJhY2tldCA9IEJyYWNrZXRzVXRpbHMuZmluZE5leHRCcmFja2V0SW5SYW5nZShjdXJyZW50TW9kZUJyYWNrZXRzLmZvcndhcmRSZWdleCwgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRpZiAoIWZvdW5kQnJhY2tldCkge1xuXHRcdFx0XHRcdC8vIHRoZXJlIGFyZSBubyBtb3JlIGJyYWNrZXRzIGluIHRoaXMgdGV4dFxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gY2hlY2sgdGhhdCB3ZSBkaWRuJ3QgaGl0IGEgYnJhY2tldCB0b28gZmFyIGF3YXkgZnJvbSBwb3NpdGlvblxuXHRcdFx0XHRpZiAoZm91bmRCcmFja2V0LnN0YXJ0Q29sdW1uIDw9IHBvc2l0aW9uLmNvbHVtbiAmJiBwb3NpdGlvbi5jb2x1bW4gPD0gZm91bmRCcmFja2V0LmVuZENvbHVtbikge1xuXHRcdFx0XHRcdGNvbnN0IGZvdW5kQnJhY2tldFRleHQgPSBsaW5lVGV4dC5zdWJzdHJpbmcoZm91bmRCcmFja2V0LnN0YXJ0Q29sdW1uIC0gMSwgZm91bmRCcmFja2V0LmVuZENvbHVtbiAtIDEpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0Y29uc3QgciA9IHRoaXMuX21hdGNoRm91bmRCcmFja2V0KGZvdW5kQnJhY2tldCwgY3VycmVudE1vZGVCcmFja2V0cy50ZXh0SXNCcmFja2V0W2ZvdW5kQnJhY2tldFRleHRdLCBjdXJyZW50TW9kZUJyYWNrZXRzLnRleHRJc09wZW5CcmFja2V0W2ZvdW5kQnJhY2tldFRleHRdLCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZSk7XG5cdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdGlmIChyIGluc3RhbmNlb2YgQnJhY2tldFNlYXJjaENhbmNlbGVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YmVzdFJlc3VsdCA9IHI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSBmb3VuZEJyYWNrZXQuZW5kQ29sdW1uIC0gMTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGJlc3RSZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIGJlc3RSZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgcG9zaXRpb24gaXMgaW4gYmV0d2VlbiB0d28gdG9rZW5zLCB0cnkgYWxzbyBsb29raW5nIGluIHRoZSBwcmV2aW91cyB0b2tlblxuXHRcdGlmICh0b2tlbkluZGV4ID4gMCAmJiBsaW5lVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KHRva2VuSW5kZXgpID09PSBwb3NpdGlvbi5jb2x1bW4gLSAxKSB7XG5cdFx0XHRjb25zdCBwcmV2VG9rZW5JbmRleCA9IHRva2VuSW5kZXggLSAxO1xuXHRcdFx0Y29uc3QgcHJldk1vZGVCcmFja2V0cyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGluZVRva2Vucy5nZXRMYW5ndWFnZUlkKHByZXZUb2tlbkluZGV4KSkuYnJhY2tldHM7XG5cblx0XHRcdC8vIGNoZWNrIHRoYXQgcHJldmlvdXMgdG9rZW4gaXMgbm90IHRvIGJlIGlnbm9yZWRcblx0XHRcdGlmIChwcmV2TW9kZUJyYWNrZXRzICYmICFpZ25vcmVCcmFja2V0c0luVG9rZW4obGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZShwcmV2VG9rZW5JbmRleCkpKSB7XG5cblx0XHRcdFx0Y29uc3QgeyBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0IH0gPSB0aGlzLl9lc3RhYmxpc2hCcmFja2V0U2VhcmNoT2Zmc2V0cyhwb3NpdGlvbiwgbGluZVRva2VucywgcHJldk1vZGVCcmFja2V0cywgcHJldlRva2VuSW5kZXgpO1xuXG5cdFx0XHRcdGNvbnN0IGZvdW5kQnJhY2tldCA9IEJyYWNrZXRzVXRpbHMuZmluZFByZXZCcmFja2V0SW5SYW5nZShwcmV2TW9kZUJyYWNrZXRzLnJldmVyc2VkUmVnZXgsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblxuXHRcdFx0XHQvLyBjaGVjayB0aGF0IHdlIGRpZG4ndCBoaXQgYSBicmFja2V0IHRvbyBmYXIgYXdheSBmcm9tIHBvc2l0aW9uXG5cdFx0XHRcdGlmIChmb3VuZEJyYWNrZXQgJiYgZm91bmRCcmFja2V0LnN0YXJ0Q29sdW1uIDw9IHBvc2l0aW9uLmNvbHVtbiAmJiBwb3NpdGlvbi5jb2x1bW4gPD0gZm91bmRCcmFja2V0LmVuZENvbHVtbikge1xuXHRcdFx0XHRcdGNvbnN0IGZvdW5kQnJhY2tldFRleHQgPSBsaW5lVGV4dC5zdWJzdHJpbmcoZm91bmRCcmFja2V0LnN0YXJ0Q29sdW1uIC0gMSwgZm91bmRCcmFja2V0LmVuZENvbHVtbiAtIDEpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0Y29uc3QgciA9IHRoaXMuX21hdGNoRm91bmRCcmFja2V0KGZvdW5kQnJhY2tldCwgcHJldk1vZGVCcmFja2V0cy50ZXh0SXNCcmFja2V0W2ZvdW5kQnJhY2tldFRleHRdLCBwcmV2TW9kZUJyYWNrZXRzLnRleHRJc09wZW5CcmFja2V0W2ZvdW5kQnJhY2tldFRleHRdLCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZSk7XG5cdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdGlmIChyIGluc3RhbmNlb2YgQnJhY2tldFNlYXJjaENhbmNlbGVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaEZvdW5kQnJhY2tldChmb3VuZEJyYWNrZXQ6IFJhbmdlLCBkYXRhOiBSaWNoRWRpdEJyYWNrZXQsIGlzT3BlbjogYm9vbGVhbiwgY29udGludWVTZWFyY2hQcmVkaWNhdGU6IENvbnRpbnVlQnJhY2tldFNlYXJjaFByZWRpY2F0ZSk6IFtSYW5nZSwgUmFuZ2VdIHwgbnVsbCB8IEJyYWNrZXRTZWFyY2hDYW5jZWxlZCB7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaGVkID0gKFxuXHRcdFx0aXNPcGVuXG5cdFx0XHRcdD8gdGhpcy5fZmluZE1hdGNoaW5nQnJhY2tldERvd24oZGF0YSwgZm91bmRCcmFja2V0LmdldEVuZFBvc2l0aW9uKCksIGNvbnRpbnVlU2VhcmNoUHJlZGljYXRlKVxuXHRcdFx0XHQ6IHRoaXMuX2ZpbmRNYXRjaGluZ0JyYWNrZXRVcChkYXRhLCBmb3VuZEJyYWNrZXQuZ2V0U3RhcnRQb3NpdGlvbigpLCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZSlcblx0XHQpO1xuXG5cdFx0aWYgKCFtYXRjaGVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAobWF0Y2hlZCBpbnN0YW5jZW9mIEJyYWNrZXRTZWFyY2hDYW5jZWxlZCkge1xuXHRcdFx0cmV0dXJuIG1hdGNoZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtmb3VuZEJyYWNrZXQsIG1hdGNoZWRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZE1hdGNoaW5nQnJhY2tldFVwKGJyYWNrZXQ6IFJpY2hFZGl0QnJhY2tldCwgcG9zaXRpb246IFBvc2l0aW9uLCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZTogQ29udGludWVCcmFja2V0U2VhcmNoUHJlZGljYXRlKTogUmFuZ2UgfCBudWxsIHwgQnJhY2tldFNlYXJjaENhbmNlbGVkIHtcblx0XHQvLyBjb25zb2xlLmxvZygnX2ZpbmRNYXRjaGluZ0JyYWNrZXRVcDogJywgJ2JyYWNrZXQ6ICcsIEpTT04uc3RyaW5naWZ5KGJyYWNrZXQpLCAnc3RhcnRQb3NpdGlvbjogJywgU3RyaW5nKHBvc2l0aW9uKSk7XG5cblx0XHRjb25zdCBsYW5ndWFnZUlkID0gYnJhY2tldC5sYW5ndWFnZUlkO1xuXHRcdGNvbnN0IHJldmVyc2VkQnJhY2tldFJlZ2V4ID0gYnJhY2tldC5yZXZlcnNlZFJlZ2V4O1xuXHRcdGxldCBjb3VudCA9IC0xO1xuXG5cdFx0bGV0IHRvdGFsQ2FsbENvdW50ID0gMDtcblx0XHRjb25zdCBzZWFyY2hQcmV2TWF0Y2hpbmdCcmFja2V0SW5SYW5nZSA9IChsaW5lTnVtYmVyOiBudW1iZXIsIGxpbmVUZXh0OiBzdHJpbmcsIHNlYXJjaFN0YXJ0T2Zmc2V0OiBudW1iZXIsIHNlYXJjaEVuZE9mZnNldDogbnVtYmVyKTogUmFuZ2UgfCBudWxsIHwgQnJhY2tldFNlYXJjaENhbmNlbGVkID0+IHtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGlmIChjb250aW51ZVNlYXJjaFByZWRpY2F0ZSAmJiAoKyt0b3RhbENhbGxDb3VudCkgJSAxMDAgPT09IDAgJiYgIWNvbnRpbnVlU2VhcmNoUHJlZGljYXRlKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gQnJhY2tldFNlYXJjaENhbmNlbGVkLklOU1RBTkNFO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHIgPSBCcmFja2V0c1V0aWxzLmZpbmRQcmV2QnJhY2tldEluUmFuZ2UocmV2ZXJzZWRCcmFja2V0UmVnZXgsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0aWYgKCFyKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBoaXRUZXh0ID0gbGluZVRleHQuc3Vic3RyaW5nKHIuc3RhcnRDb2x1bW4gLSAxLCByLmVuZENvbHVtbiAtIDEpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGlmIChicmFja2V0LmlzT3BlbihoaXRUZXh0KSkge1xuXHRcdFx0XHRcdGNvdW50Kys7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYnJhY2tldC5pc0Nsb3NlKGhpdFRleHQpKSB7XG5cdFx0XHRcdFx0Y291bnQtLTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiByO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gci5zdGFydENvbHVtbiAtIDE7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH07XG5cblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjsgbGluZU51bWJlciA+PSAxOyBsaW5lTnVtYmVyLS0pIHtcblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSB0aGlzLnRleHRNb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IHRva2VuQ291bnQgPSBsaW5lVG9rZW5zLmdldENvdW50KCk7XG5cdFx0XHRjb25zdCBsaW5lVGV4dCA9IHRoaXMudGV4dE1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXG5cdFx0XHRsZXQgdG9rZW5JbmRleCA9IHRva2VuQ291bnQgLSAxO1xuXHRcdFx0bGV0IHNlYXJjaFN0YXJ0T2Zmc2V0ID0gbGluZVRleHQubGVuZ3RoO1xuXHRcdFx0bGV0IHNlYXJjaEVuZE9mZnNldCA9IGxpbmVUZXh0Lmxlbmd0aDtcblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBwb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRva2VuSW5kZXggPSBsaW5lVG9rZW5zLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQocG9zaXRpb24uY29sdW1uIC0gMSk7XG5cdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gcG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gcG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHByZXZTZWFyY2hJblRva2VuID0gdHJ1ZTtcblx0XHRcdGZvciAoOyB0b2tlbkluZGV4ID49IDA7IHRva2VuSW5kZXgtLSkge1xuXHRcdFx0XHRjb25zdCBzZWFyY2hJblRva2VuID0gKGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4KSA9PT0gbGFuZ3VhZ2VJZCAmJiAhaWdub3JlQnJhY2tldHNJblRva2VuKGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleCkpKTtcblxuXHRcdFx0XHRpZiAoc2VhcmNoSW5Ub2tlbikge1xuXHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gc2hvdWxkIGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0aWYgKHByZXZTZWFyY2hJblRva2VuKSB7XG5cdFx0XHRcdFx0XHQvLyB0aGUgcHJldmlvdXMgdG9rZW4gc2hvdWxkIGJlIHNlYXJjaGVkLCBzaW1wbHkgZXh0ZW5kIHNlYXJjaFN0YXJ0T2Zmc2V0XG5cdFx0XHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIHRoZSBwcmV2aW91cyB0b2tlbiBzaG91bGQgbm90IGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0XHRzZWFyY2hFbmRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBzaG91bGQgbm90IGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0aWYgKHByZXZTZWFyY2hJblRva2VuICYmIHNlYXJjaFN0YXJ0T2Zmc2V0ICE9PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHIgPSBzZWFyY2hQcmV2TWF0Y2hpbmdCcmFja2V0SW5SYW5nZShsaW5lTnVtYmVyLCBsaW5lVGV4dCwgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCk7XG5cdFx0XHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcmV2U2VhcmNoSW5Ub2tlbiA9IHNlYXJjaEluVG9rZW47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcmV2U2VhcmNoSW5Ub2tlbiAmJiBzZWFyY2hTdGFydE9mZnNldCAhPT0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdGNvbnN0IHIgPSBzZWFyY2hQcmV2TWF0Y2hpbmdCcmFja2V0SW5SYW5nZShsaW5lTnVtYmVyLCBsaW5lVGV4dCwgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCk7XG5cdFx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRNYXRjaGluZ0JyYWNrZXREb3duKGJyYWNrZXQ6IFJpY2hFZGl0QnJhY2tldCwgcG9zaXRpb246IFBvc2l0aW9uLCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZTogQ29udGludWVCcmFja2V0U2VhcmNoUHJlZGljYXRlKTogUmFuZ2UgfCBudWxsIHwgQnJhY2tldFNlYXJjaENhbmNlbGVkIHtcblx0XHQvLyBjb25zb2xlLmxvZygnX2ZpbmRNYXRjaGluZ0JyYWNrZXREb3duOiAnLCAnYnJhY2tldDogJywgSlNPTi5zdHJpbmdpZnkoYnJhY2tldCksICdzdGFydFBvc2l0aW9uOiAnLCBTdHJpbmcocG9zaXRpb24pKTtcblxuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBicmFja2V0Lmxhbmd1YWdlSWQ7XG5cdFx0Y29uc3QgYnJhY2tldFJlZ2V4ID0gYnJhY2tldC5mb3J3YXJkUmVnZXg7XG5cdFx0bGV0IGNvdW50ID0gMTtcblxuXHRcdGxldCB0b3RhbENhbGxDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc2VhcmNoTmV4dE1hdGNoaW5nQnJhY2tldEluUmFuZ2UgPSAobGluZU51bWJlcjogbnVtYmVyLCBsaW5lVGV4dDogc3RyaW5nLCBzZWFyY2hTdGFydE9mZnNldDogbnVtYmVyLCBzZWFyY2hFbmRPZmZzZXQ6IG51bWJlcik6IFJhbmdlIHwgbnVsbCB8IEJyYWNrZXRTZWFyY2hDYW5jZWxlZCA9PiB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRpZiAoY29udGludWVTZWFyY2hQcmVkaWNhdGUgJiYgKCsrdG90YWxDYWxsQ291bnQpICUgMTAwID09PSAwICYmICFjb250aW51ZVNlYXJjaFByZWRpY2F0ZSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEJyYWNrZXRTZWFyY2hDYW5jZWxlZC5JTlNUQU5DRTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByID0gQnJhY2tldHNVdGlscy5maW5kTmV4dEJyYWNrZXRJblJhbmdlKGJyYWNrZXRSZWdleCwgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRpZiAoIXIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGhpdFRleHQgPSBsaW5lVGV4dC5zdWJzdHJpbmcoci5zdGFydENvbHVtbiAtIDEsIHIuZW5kQ29sdW1uIC0gMSkudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0aWYgKGJyYWNrZXQuaXNPcGVuKGhpdFRleHQpKSB7XG5cdFx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0fSBlbHNlIGlmIChicmFja2V0LmlzQ2xvc2UoaGl0VGV4dCkpIHtcblx0XHRcdFx0XHRjb3VudC0tO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IHIuZW5kQ29sdW1uIC0gMTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMudGV4dE1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBwb3NpdGlvbi5saW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGxpbmVDb3VudDsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBsaW5lVG9rZW5zID0gdGhpcy50ZXh0TW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCB0b2tlbkNvdW50ID0gbGluZVRva2Vucy5nZXRDb3VudCgpO1xuXHRcdFx0Y29uc3QgbGluZVRleHQgPSB0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblxuXHRcdFx0bGV0IHRva2VuSW5kZXggPSAwO1xuXHRcdFx0bGV0IHNlYXJjaFN0YXJ0T2Zmc2V0ID0gMDtcblx0XHRcdGxldCBzZWFyY2hFbmRPZmZzZXQgPSAwO1xuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IHBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0dG9rZW5JbmRleCA9IGxpbmVUb2tlbnMuZmluZFRva2VuSW5kZXhBdE9mZnNldChwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSBwb3NpdGlvbi5jb2x1bW4gLSAxO1xuXHRcdFx0XHRzZWFyY2hFbmRPZmZzZXQgPSBwb3NpdGlvbi5jb2x1bW4gLSAxO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcHJldlNlYXJjaEluVG9rZW4gPSB0cnVlO1xuXHRcdFx0Zm9yICg7IHRva2VuSW5kZXggPCB0b2tlbkNvdW50OyB0b2tlbkluZGV4KyspIHtcblx0XHRcdFx0Y29uc3Qgc2VhcmNoSW5Ub2tlbiA9IChsaW5lVG9rZW5zLmdldExhbmd1YWdlSWQodG9rZW5JbmRleCkgPT09IGxhbmd1YWdlSWQgJiYgIWlnbm9yZUJyYWNrZXRzSW5Ub2tlbihsaW5lVG9rZW5zLmdldFN0YW5kYXJkVG9rZW5UeXBlKHRva2VuSW5kZXgpKSk7XG5cblx0XHRcdFx0aWYgKHNlYXJjaEluVG9rZW4pIHtcblx0XHRcdFx0XHQvLyB0aGlzIHRva2VuIHNob3VsZCBiZSBzZWFyY2hlZFxuXHRcdFx0XHRcdGlmIChwcmV2U2VhcmNoSW5Ub2tlbikge1xuXHRcdFx0XHRcdFx0Ly8gdGhlIHByZXZpb3VzIHRva2VuIHNob3VsZCBiZSBzZWFyY2hlZCwgc2ltcGx5IGV4dGVuZCBzZWFyY2hFbmRPZmZzZXRcblx0XHRcdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyB0aGUgcHJldmlvdXMgdG9rZW4gc2hvdWxkIG5vdCBiZSBzZWFyY2hlZFxuXHRcdFx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gbGluZVRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gc2hvdWxkIG5vdCBiZSBzZWFyY2hlZFxuXHRcdFx0XHRcdGlmIChwcmV2U2VhcmNoSW5Ub2tlbiAmJiBzZWFyY2hTdGFydE9mZnNldCAhPT0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCByID0gc2VhcmNoTmV4dE1hdGNoaW5nQnJhY2tldEluUmFuZ2UobGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cHJldlNlYXJjaEluVG9rZW4gPSBzZWFyY2hJblRva2VuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJldlNlYXJjaEluVG9rZW4gJiYgc2VhcmNoU3RhcnRPZmZzZXQgIT09IHNlYXJjaEVuZE9mZnNldCkge1xuXHRcdFx0XHRjb25zdCByID0gc2VhcmNoTmV4dE1hdGNoaW5nQnJhY2tldEluUmFuZ2UobGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdHJldHVybiByO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZmluZFByZXZCcmFja2V0KF9wb3NpdGlvbjogSVBvc2l0aW9uKTogSUZvdW5kQnJhY2tldCB8IG51bGwge1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy50ZXh0TW9kZWwudmFsaWRhdGVQb3NpdGlvbihfcG9zaXRpb24pO1xuXG5cdFx0aWYgKHRoaXMuY2FuQnVpbGRBU1QpIHtcblx0XHRcdHRoaXMuYnJhY2tldHNSZXF1ZXN0ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy51cGRhdGVCcmFja2V0UGFpcnNUcmVlKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5icmFja2V0UGFpcnNUcmVlLnZhbHVlPy5vYmplY3QuZ2V0Rmlyc3RCcmFja2V0QmVmb3JlKHBvc2l0aW9uKSB8fCBudWxsO1xuXHRcdH1cblxuXHRcdGxldCBsYW5ndWFnZUlkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgbW9kZUJyYWNrZXRzOiBSaWNoRWRpdEJyYWNrZXRzIHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IGJyYWNrZXRDb25maWc6IExhbmd1YWdlQnJhY2tldHNDb25maWd1cmF0aW9uIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPj0gMTsgbGluZU51bWJlci0tKSB7XG5cdFx0XHRjb25zdCBsaW5lVG9rZW5zID0gdGhpcy50ZXh0TW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cdFx0XHRjb25zdCB0b2tlbkNvdW50ID0gbGluZVRva2Vucy5nZXRDb3VudCgpO1xuXHRcdFx0Y29uc3QgbGluZVRleHQgPSB0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblxuXHRcdFx0bGV0IHRva2VuSW5kZXggPSB0b2tlbkNvdW50IC0gMTtcblx0XHRcdGxldCBzZWFyY2hTdGFydE9mZnNldCA9IGxpbmVUZXh0Lmxlbmd0aDtcblx0XHRcdGxldCBzZWFyY2hFbmRPZmZzZXQgPSBsaW5lVGV4dC5sZW5ndGg7XG5cdFx0XHRpZiAobGluZU51bWJlciA9PT0gcG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHR0b2tlbkluZGV4ID0gbGluZVRva2Vucy5maW5kVG9rZW5JbmRleEF0T2Zmc2V0KHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHRcdGNvbnN0IHRva2VuTGFuZ3VhZ2VJZCA9IGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4KTtcblx0XHRcdFx0aWYgKGxhbmd1YWdlSWQgIT09IHRva2VuTGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRcdGxhbmd1YWdlSWQgPSB0b2tlbkxhbmd1YWdlSWQ7XG5cdFx0XHRcdFx0bW9kZUJyYWNrZXRzID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5icmFja2V0cztcblx0XHRcdFx0XHRicmFja2V0Q29uZmlnID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5icmFja2V0c05ldztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcHJldlNlYXJjaEluVG9rZW4gPSB0cnVlO1xuXHRcdFx0Zm9yICg7IHRva2VuSW5kZXggPj0gMDsgdG9rZW5JbmRleC0tKSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuTGFuZ3VhZ2VJZCA9IGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4KTtcblxuXHRcdFx0XHRpZiAobGFuZ3VhZ2VJZCAhPT0gdG9rZW5MYW5ndWFnZUlkKSB7XG5cdFx0XHRcdFx0Ly8gbGFuZ3VhZ2UgaWQgY2hhbmdlIVxuXHRcdFx0XHRcdGlmIChtb2RlQnJhY2tldHMgJiYgYnJhY2tldENvbmZpZyAmJiBwcmV2U2VhcmNoSW5Ub2tlbiAmJiBzZWFyY2hTdGFydE9mZnNldCAhPT0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCByID0gQnJhY2tldHNVdGlscy5maW5kUHJldkJyYWNrZXRJblJhbmdlKG1vZGVCcmFja2V0cy5yZXZlcnNlZFJlZ2V4LCBsaW5lTnVtYmVyLCBsaW5lVGV4dCwgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCk7XG5cdFx0XHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fdG9Gb3VuZEJyYWNrZXQoYnJhY2tldENvbmZpZywgcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwcmV2U2VhcmNoSW5Ub2tlbiA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYW5ndWFnZUlkID0gdG9rZW5MYW5ndWFnZUlkO1xuXHRcdFx0XHRcdG1vZGVCcmFja2V0cyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuYnJhY2tldHM7XG5cdFx0XHRcdFx0YnJhY2tldENvbmZpZyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuYnJhY2tldHNOZXc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzZWFyY2hJblRva2VuID0gKCEhbW9kZUJyYWNrZXRzICYmICFpZ25vcmVCcmFja2V0c0luVG9rZW4obGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4KSkpO1xuXG5cdFx0XHRcdGlmIChzZWFyY2hJblRva2VuKSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBzaG91bGQgYmUgc2VhcmNoZWRcblx0XHRcdFx0XHRpZiAocHJldlNlYXJjaEluVG9rZW4pIHtcblx0XHRcdFx0XHRcdC8vIHRoZSBwcmV2aW91cyB0b2tlbiBzaG91bGQgYmUgc2VhcmNoZWQsIHNpbXBseSBleHRlbmQgc2VhcmNoU3RhcnRPZmZzZXRcblx0XHRcdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gbGluZVRva2Vucy5nZXRTdGFydE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gdGhlIHByZXZpb3VzIHRva2VuIHNob3VsZCBub3QgYmUgc2VhcmNoZWRcblx0XHRcdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gbGluZVRva2Vucy5nZXRTdGFydE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB0aGlzIHRva2VuIHNob3VsZCBub3QgYmUgc2VhcmNoZWRcblx0XHRcdFx0XHRpZiAoYnJhY2tldENvbmZpZyAmJiBtb2RlQnJhY2tldHMgJiYgcHJldlNlYXJjaEluVG9rZW4gJiYgc2VhcmNoU3RhcnRPZmZzZXQgIT09IHNlYXJjaEVuZE9mZnNldCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgciA9IEJyYWNrZXRzVXRpbHMuZmluZFByZXZCcmFja2V0SW5SYW5nZShtb2RlQnJhY2tldHMucmV2ZXJzZWRSZWdleCwgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvRm91bmRCcmFja2V0KGJyYWNrZXRDb25maWcsIHIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByZXZTZWFyY2hJblRva2VuID0gc2VhcmNoSW5Ub2tlbjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGJyYWNrZXRDb25maWcgJiYgbW9kZUJyYWNrZXRzICYmIHByZXZTZWFyY2hJblRva2VuICYmIHNlYXJjaFN0YXJ0T2Zmc2V0ICE9PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0Y29uc3QgciA9IEJyYWNrZXRzVXRpbHMuZmluZFByZXZCcmFja2V0SW5SYW5nZShtb2RlQnJhY2tldHMucmV2ZXJzZWRSZWdleCwgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl90b0ZvdW5kQnJhY2tldChicmFja2V0Q29uZmlnLCByKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIGZpbmROZXh0QnJhY2tldChfcG9zaXRpb246IElQb3NpdGlvbik6IElGb3VuZEJyYWNrZXQgfCBudWxsIHtcblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMudGV4dE1vZGVsLnZhbGlkYXRlUG9zaXRpb24oX3Bvc2l0aW9uKTtcblxuXHRcdGlmICh0aGlzLmNhbkJ1aWxkQVNUKSB7XG5cdFx0XHR0aGlzLmJyYWNrZXRzUmVxdWVzdGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMudXBkYXRlQnJhY2tldFBhaXJzVHJlZSgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuYnJhY2tldFBhaXJzVHJlZS52YWx1ZT8ub2JqZWN0LmdldEZpcnN0QnJhY2tldEFmdGVyKHBvc2l0aW9uKSB8fCBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMudGV4dE1vZGVsLmdldExpbmVDb3VudCgpO1xuXG5cdFx0bGV0IGxhbmd1YWdlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBtb2RlQnJhY2tldHM6IFJpY2hFZGl0QnJhY2tldHMgfCBudWxsID0gbnVsbDtcblx0XHRsZXQgYnJhY2tldENvbmZpZzogTGFuZ3VhZ2VCcmFja2V0c0NvbmZpZ3VyYXRpb24gfCBudWxsID0gbnVsbDtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjsgbGluZU51bWJlciA8PSBsaW5lQ291bnQ7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZVRva2VucyA9IHRoaXMudGV4dE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgdG9rZW5Db3VudCA9IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTtcblx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cblx0XHRcdGxldCB0b2tlbkluZGV4ID0gMDtcblx0XHRcdGxldCBzZWFyY2hTdGFydE9mZnNldCA9IDA7XG5cdFx0XHRsZXQgc2VhcmNoRW5kT2Zmc2V0ID0gMDtcblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBwb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRva2VuSW5kZXggPSBsaW5lVG9rZW5zLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQocG9zaXRpb24uY29sdW1uIC0gMSk7XG5cdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gcG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gcG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRcdFx0Y29uc3QgdG9rZW5MYW5ndWFnZUlkID0gbGluZVRva2Vucy5nZXRMYW5ndWFnZUlkKHRva2VuSW5kZXgpO1xuXHRcdFx0XHRpZiAobGFuZ3VhZ2VJZCAhPT0gdG9rZW5MYW5ndWFnZUlkKSB7XG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZCA9IHRva2VuTGFuZ3VhZ2VJZDtcblx0XHRcdFx0XHRtb2RlQnJhY2tldHMgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzO1xuXHRcdFx0XHRcdGJyYWNrZXRDb25maWcgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzTmV3O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCBwcmV2U2VhcmNoSW5Ub2tlbiA9IHRydWU7XG5cdFx0XHRmb3IgKDsgdG9rZW5JbmRleCA8IHRva2VuQ291bnQ7IHRva2VuSW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCB0b2tlbkxhbmd1YWdlSWQgPSBsaW5lVG9rZW5zLmdldExhbmd1YWdlSWQodG9rZW5JbmRleCk7XG5cblx0XHRcdFx0aWYgKGxhbmd1YWdlSWQgIT09IHRva2VuTGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRcdC8vIGxhbmd1YWdlIGlkIGNoYW5nZSFcblx0XHRcdFx0XHRpZiAoYnJhY2tldENvbmZpZyAmJiBtb2RlQnJhY2tldHMgJiYgcHJldlNlYXJjaEluVG9rZW4gJiYgc2VhcmNoU3RhcnRPZmZzZXQgIT09IHNlYXJjaEVuZE9mZnNldCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgciA9IEJyYWNrZXRzVXRpbHMuZmluZE5leHRCcmFja2V0SW5SYW5nZShtb2RlQnJhY2tldHMuZm9yd2FyZFJlZ2V4LCBsaW5lTnVtYmVyLCBsaW5lVGV4dCwgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCk7XG5cdFx0XHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fdG9Gb3VuZEJyYWNrZXQoYnJhY2tldENvbmZpZywgcik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwcmV2U2VhcmNoSW5Ub2tlbiA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYW5ndWFnZUlkID0gdG9rZW5MYW5ndWFnZUlkO1xuXHRcdFx0XHRcdG1vZGVCcmFja2V0cyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuYnJhY2tldHM7XG5cdFx0XHRcdFx0YnJhY2tldENvbmZpZyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuYnJhY2tldHNOZXc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzZWFyY2hJblRva2VuID0gKCEhbW9kZUJyYWNrZXRzICYmICFpZ25vcmVCcmFja2V0c0luVG9rZW4obGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4KSkpO1xuXHRcdFx0XHRpZiAoc2VhcmNoSW5Ub2tlbikge1xuXHRcdFx0XHRcdC8vIHRoaXMgdG9rZW4gc2hvdWxkIGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0aWYgKHByZXZTZWFyY2hJblRva2VuKSB7XG5cdFx0XHRcdFx0XHQvLyB0aGUgcHJldmlvdXMgdG9rZW4gc2hvdWxkIGJlIHNlYXJjaGVkLCBzaW1wbHkgZXh0ZW5kIHNlYXJjaEVuZE9mZnNldFxuXHRcdFx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gbGluZVRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIHRoZSBwcmV2aW91cyB0b2tlbiBzaG91bGQgbm90IGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0XHRzZWFyY2hTdGFydE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRcdFx0XHRzZWFyY2hFbmRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBzaG91bGQgbm90IGJlIHNlYXJjaGVkXG5cdFx0XHRcdFx0aWYgKGJyYWNrZXRDb25maWcgJiYgbW9kZUJyYWNrZXRzICYmIHByZXZTZWFyY2hJblRva2VuICYmIHNlYXJjaFN0YXJ0T2Zmc2V0ICE9PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHIgPSBCcmFja2V0c1V0aWxzLmZpbmROZXh0QnJhY2tldEluUmFuZ2UobW9kZUJyYWNrZXRzLmZvcndhcmRSZWdleCwgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvRm91bmRCcmFja2V0KGJyYWNrZXRDb25maWcsIHIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByZXZTZWFyY2hJblRva2VuID0gc2VhcmNoSW5Ub2tlbjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGJyYWNrZXRDb25maWcgJiYgbW9kZUJyYWNrZXRzICYmIHByZXZTZWFyY2hJblRva2VuICYmIHNlYXJjaFN0YXJ0T2Zmc2V0ICE9PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0Y29uc3QgciA9IEJyYWNrZXRzVXRpbHMuZmluZE5leHRCcmFja2V0SW5SYW5nZShtb2RlQnJhY2tldHMuZm9yd2FyZFJlZ2V4LCBsaW5lTnVtYmVyLCBsaW5lVGV4dCwgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCk7XG5cdFx0XHRcdGlmIChyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvRm91bmRCcmFja2V0KGJyYWNrZXRDb25maWcsIHIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZmluZEVuY2xvc2luZ0JyYWNrZXRzKF9wb3NpdGlvbjogSVBvc2l0aW9uLCBtYXhEdXJhdGlvbj86IG51bWJlcik6IFtSYW5nZSwgUmFuZ2VdIHwgbnVsbCB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLnRleHRNb2RlbC52YWxpZGF0ZVBvc2l0aW9uKF9wb3NpdGlvbik7XG5cblx0XHRpZiAodGhpcy5jYW5CdWlsZEFTVCkge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IGJyYWNrZXRQYWlyID1cblx0XHRcdFx0dGhpcy5nZXRCcmFja2V0UGFpcnNJblJhbmdlKFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24sIHBvc2l0aW9uKSkuZmluZExhc3QoXG5cdFx0XHRcdFx0KGl0ZW0pID0+IGl0ZW0uY2xvc2luZ0JyYWNrZXRSYW5nZSAhPT0gdW5kZWZpbmVkICYmIGl0ZW0ucmFuZ2Uuc3RyaWN0Q29udGFpbnNSYW5nZShyYW5nZSlcblx0XHRcdFx0KTtcblx0XHRcdGlmIChicmFja2V0UGFpcikge1xuXHRcdFx0XHRyZXR1cm4gW2JyYWNrZXRQYWlyLm9wZW5pbmdCcmFja2V0UmFuZ2UsIGJyYWNrZXRQYWlyLmNsb3NpbmdCcmFja2V0UmFuZ2UhXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRpbnVlU2VhcmNoUHJlZGljYXRlID0gY3JlYXRlVGltZUJhc2VkQ29udGludWVCcmFja2V0U2VhcmNoUHJlZGljYXRlKG1heER1cmF0aW9uKTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBzYXZlZENvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXJbXT4oKTtcblxuXHRcdGxldCBjb3VudHM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgcmVzZXRDb3VudHMgPSAobGFuZ3VhZ2VJZDogc3RyaW5nLCBtb2RlQnJhY2tldHM6IFJpY2hFZGl0QnJhY2tldHMgfCBudWxsKSA9PiB7XG5cdFx0XHRpZiAoIXNhdmVkQ291bnRzLmhhcyhsYW5ndWFnZUlkKSkge1xuXHRcdFx0XHRjb25zdCB0bXAgPSBbXTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG1vZGVCcmFja2V0cyA/IG1vZGVCcmFja2V0cy5icmFja2V0cy5sZW5ndGggOiAwOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHR0bXBbaV0gPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNhdmVkQ291bnRzLnNldChsYW5ndWFnZUlkLCB0bXApO1xuXHRcdFx0fVxuXHRcdFx0Y291bnRzID0gc2F2ZWRDb3VudHMuZ2V0KGxhbmd1YWdlSWQpITtcblx0XHR9O1xuXG5cdFx0bGV0IHRvdGFsQ2FsbENvdW50ID0gMDtcblx0XHRjb25zdCBzZWFyY2hJblJhbmdlID0gKG1vZGVCcmFja2V0czogUmljaEVkaXRCcmFja2V0cywgbGluZU51bWJlcjogbnVtYmVyLCBsaW5lVGV4dDogc3RyaW5nLCBzZWFyY2hTdGFydE9mZnNldDogbnVtYmVyLCBzZWFyY2hFbmRPZmZzZXQ6IG51bWJlcik6IFtSYW5nZSwgUmFuZ2VdIHwgbnVsbCB8IEJyYWNrZXRTZWFyY2hDYW5jZWxlZCA9PiB7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRpZiAoY29udGludWVTZWFyY2hQcmVkaWNhdGUgJiYgKCsrdG90YWxDYWxsQ291bnQpICUgMTAwID09PSAwICYmICFjb250aW51ZVNlYXJjaFByZWRpY2F0ZSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIEJyYWNrZXRTZWFyY2hDYW5jZWxlZC5JTlNUQU5DRTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByID0gQnJhY2tldHNVdGlscy5maW5kTmV4dEJyYWNrZXRJblJhbmdlKG1vZGVCcmFja2V0cy5mb3J3YXJkUmVnZXgsIGxpbmVOdW1iZXIsIGxpbmVUZXh0LCBzZWFyY2hTdGFydE9mZnNldCwgc2VhcmNoRW5kT2Zmc2V0KTtcblx0XHRcdFx0aWYgKCFyKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBoaXRUZXh0ID0gbGluZVRleHQuc3Vic3RyaW5nKHIuc3RhcnRDb2x1bW4gLSAxLCByLmVuZENvbHVtbiAtIDEpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IGJyYWNrZXQgPSBtb2RlQnJhY2tldHMudGV4dElzQnJhY2tldFtoaXRUZXh0XTtcblx0XHRcdFx0aWYgKGJyYWNrZXQpIHtcblx0XHRcdFx0XHRpZiAoYnJhY2tldC5pc09wZW4oaGl0VGV4dCkpIHtcblx0XHRcdFx0XHRcdGNvdW50c1ticmFja2V0LmluZGV4XSsrO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYnJhY2tldC5pc0Nsb3NlKGhpdFRleHQpKSB7XG5cdFx0XHRcdFx0XHRjb3VudHNbYnJhY2tldC5pbmRleF0tLTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoY291bnRzW2JyYWNrZXQuaW5kZXhdID09PSAtMSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX21hdGNoRm91bmRCcmFja2V0KHIsIGJyYWNrZXQsIGZhbHNlLCBjb250aW51ZVNlYXJjaFByZWRpY2F0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VhcmNoU3RhcnRPZmZzZXQgPSByLmVuZENvbHVtbiAtIDE7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9O1xuXG5cdFx0bGV0IGxhbmd1YWdlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBtb2RlQnJhY2tldHM6IFJpY2hFZGl0QnJhY2tldHMgfCBudWxsID0gbnVsbDtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjsgbGluZU51bWJlciA8PSBsaW5lQ291bnQ7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZVRva2VucyA9IHRoaXMudGV4dE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgdG9rZW5Db3VudCA9IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTtcblx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gdGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cblx0XHRcdGxldCB0b2tlbkluZGV4ID0gMDtcblx0XHRcdGxldCBzZWFyY2hTdGFydE9mZnNldCA9IDA7XG5cdFx0XHRsZXQgc2VhcmNoRW5kT2Zmc2V0ID0gMDtcblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBwb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdHRva2VuSW5kZXggPSBsaW5lVG9rZW5zLmZpbmRUb2tlbkluZGV4QXRPZmZzZXQocG9zaXRpb24uY29sdW1uIC0gMSk7XG5cdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gcG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRcdFx0c2VhcmNoRW5kT2Zmc2V0ID0gcG9zaXRpb24uY29sdW1uIC0gMTtcblx0XHRcdFx0Y29uc3QgdG9rZW5MYW5ndWFnZUlkID0gbGluZVRva2Vucy5nZXRMYW5ndWFnZUlkKHRva2VuSW5kZXgpO1xuXHRcdFx0XHRpZiAobGFuZ3VhZ2VJZCAhPT0gdG9rZW5MYW5ndWFnZUlkKSB7XG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZCA9IHRva2VuTGFuZ3VhZ2VJZDtcblx0XHRcdFx0XHRtb2RlQnJhY2tldHMgPSB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmJyYWNrZXRzO1xuXHRcdFx0XHRcdHJlc2V0Q291bnRzKGxhbmd1YWdlSWQsIG1vZGVCcmFja2V0cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IHByZXZTZWFyY2hJblRva2VuID0gdHJ1ZTtcblx0XHRcdGZvciAoOyB0b2tlbkluZGV4IDwgdG9rZW5Db3VudDsgdG9rZW5JbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuTGFuZ3VhZ2VJZCA9IGxpbmVUb2tlbnMuZ2V0TGFuZ3VhZ2VJZCh0b2tlbkluZGV4KTtcblxuXHRcdFx0XHRpZiAobGFuZ3VhZ2VJZCAhPT0gdG9rZW5MYW5ndWFnZUlkKSB7XG5cdFx0XHRcdFx0Ly8gbGFuZ3VhZ2UgaWQgY2hhbmdlIVxuXHRcdFx0XHRcdGlmIChtb2RlQnJhY2tldHMgJiYgcHJldlNlYXJjaEluVG9rZW4gJiYgc2VhcmNoU3RhcnRPZmZzZXQgIT09IHNlYXJjaEVuZE9mZnNldCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgciA9IHNlYXJjaEluUmFuZ2UobW9kZUJyYWNrZXRzLCBsaW5lTnVtYmVyLCBsaW5lVGV4dCwgc2VhcmNoU3RhcnRPZmZzZXQsIHNlYXJjaEVuZE9mZnNldCk7XG5cdFx0XHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gc3RyaXBCcmFja2V0U2VhcmNoQ2FuY2VsZWQocik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwcmV2U2VhcmNoSW5Ub2tlbiA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYW5ndWFnZUlkID0gdG9rZW5MYW5ndWFnZUlkO1xuXHRcdFx0XHRcdG1vZGVCcmFja2V0cyA9IHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuYnJhY2tldHM7XG5cdFx0XHRcdFx0cmVzZXRDb3VudHMobGFuZ3VhZ2VJZCwgbW9kZUJyYWNrZXRzKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNlYXJjaEluVG9rZW4gPSAoISFtb2RlQnJhY2tldHMgJiYgIWlnbm9yZUJyYWNrZXRzSW5Ub2tlbihsaW5lVG9rZW5zLmdldFN0YW5kYXJkVG9rZW5UeXBlKHRva2VuSW5kZXgpKSk7XG5cdFx0XHRcdGlmIChzZWFyY2hJblRva2VuKSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyB0b2tlbiBzaG91bGQgYmUgc2VhcmNoZWRcblx0XHRcdFx0XHRpZiAocHJldlNlYXJjaEluVG9rZW4pIHtcblx0XHRcdFx0XHRcdC8vIHRoZSBwcmV2aW91cyB0b2tlbiBzaG91bGQgYmUgc2VhcmNoZWQsIHNpbXBseSBleHRlbmQgc2VhcmNoRW5kT2Zmc2V0XG5cdFx0XHRcdFx0XHRzZWFyY2hFbmRPZmZzZXQgPSBsaW5lVG9rZW5zLmdldEVuZE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gdGhlIHByZXZpb3VzIHRva2VuIHNob3VsZCBub3QgYmUgc2VhcmNoZWRcblx0XHRcdFx0XHRcdHNlYXJjaFN0YXJ0T2Zmc2V0ID0gbGluZVRva2Vucy5nZXRTdGFydE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdFx0XHRcdHNlYXJjaEVuZE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB0aGlzIHRva2VuIHNob3VsZCBub3QgYmUgc2VhcmNoZWRcblx0XHRcdFx0XHRpZiAobW9kZUJyYWNrZXRzICYmIHByZXZTZWFyY2hJblRva2VuICYmIHNlYXJjaFN0YXJ0T2Zmc2V0ICE9PSBzZWFyY2hFbmRPZmZzZXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHIgPSBzZWFyY2hJblJhbmdlKG1vZGVCcmFja2V0cywgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHN0cmlwQnJhY2tldFNlYXJjaENhbmNlbGVkKHIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByZXZTZWFyY2hJblRva2VuID0gc2VhcmNoSW5Ub2tlbjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVCcmFja2V0cyAmJiBwcmV2U2VhcmNoSW5Ub2tlbiAmJiBzZWFyY2hTdGFydE9mZnNldCAhPT0gc2VhcmNoRW5kT2Zmc2V0KSB7XG5cdFx0XHRcdGNvbnN0IHIgPSBzZWFyY2hJblJhbmdlKG1vZGVCcmFja2V0cywgbGluZU51bWJlciwgbGluZVRleHQsIHNlYXJjaFN0YXJ0T2Zmc2V0LCBzZWFyY2hFbmRPZmZzZXQpO1xuXHRcdFx0XHRpZiAocikge1xuXHRcdFx0XHRcdHJldHVybiBzdHJpcEJyYWNrZXRTZWFyY2hDYW5jZWxlZChyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Gb3VuZEJyYWNrZXQoYnJhY2tldENvbmZpZzogTGFuZ3VhZ2VCcmFja2V0c0NvbmZpZ3VyYXRpb24sIHI6IFJhbmdlKTogSUZvdW5kQnJhY2tldCB8IG51bGwge1xuXHRcdGlmICghcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0bGV0IHRleHQgPSB0aGlzLnRleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2Uocik7XG5cdFx0dGV4dCA9IHRleHQudG9Mb3dlckNhc2UoKTtcblxuXHRcdGNvbnN0IGJyYWNrZXRJbmZvID0gYnJhY2tldENvbmZpZy5nZXRCcmFja2V0SW5mbyh0ZXh0KTtcblx0XHRpZiAoIWJyYWNrZXRJbmZvKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IHIsXG5cdFx0XHRicmFja2V0SW5mb1xuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlRGlzcG9zYWJsZVJlZjxUPihvYmplY3Q6IFQsIGRpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZSk6IElSZWZlcmVuY2U8VD4ge1xuXHRyZXR1cm4ge1xuXHRcdG9iamVjdCxcblx0XHRkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlPy5kaXNwb3NlKCksXG5cdH07XG59XG5cbnR5cGUgQ29udGludWVCcmFja2V0U2VhcmNoUHJlZGljYXRlID0gKCgpID0+IGJvb2xlYW4pO1xuXG5mdW5jdGlvbiBjcmVhdGVUaW1lQmFzZWRDb250aW51ZUJyYWNrZXRTZWFyY2hQcmVkaWNhdGUobWF4RHVyYXRpb246IG51bWJlciB8IHVuZGVmaW5lZCk6IENvbnRpbnVlQnJhY2tldFNlYXJjaFByZWRpY2F0ZSB7XG5cdGlmICh0eXBlb2YgbWF4RHVyYXRpb24gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0cmV0dXJuICgpID0+IHRydWU7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0cmV0dXJuIChEYXRlLm5vdygpIC0gc3RhcnRUaW1lIDw9IG1heER1cmF0aW9uKTtcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIEJyYWNrZXRTZWFyY2hDYW5jZWxlZCB7XG5cdHB1YmxpYyBzdGF0aWMgSU5TVEFOQ0UgPSBuZXcgQnJhY2tldFNlYXJjaENhbmNlbGVkKCk7XG5cdF9zZWFyY2hDYW5jZWxlZEJyYW5kID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbnN0cnVjdG9yKCkgeyB9XG59XG5cbmZ1bmN0aW9uIHN0cmlwQnJhY2tldFNlYXJjaENhbmNlbGVkPFQ+KHJlc3VsdDogVCB8IG51bGwgfCBCcmFja2V0U2VhcmNoQ2FuY2VsZWQpOiBUIHwgbnVsbCB7XG5cdGlmIChyZXN1bHQgaW5zdGFuY2VvZiBCcmFja2V0U2VhcmNoQ2FuY2VsZWQpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRyZXR1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
