import { CharCode } from "./charCode.js";
import { LRUCache } from "./map.js";
import { getKoreanAltChars } from "./naturalLanguage/korean.js";
import { tryNormalizeToBase } from "./normalization.js";
import * as strings from "./strings.js";
function or(...filter) {
  return function(word, wordToMatchAgainst) {
    for (let i = 0, len = filter.length; i < len; i++) {
      const match = filter[i](word, wordToMatchAgainst);
      if (match) {
        return match;
      }
    }
    return null;
  };
}
const matchesStrictPrefix = _matchesPrefix.bind(void 0, false);
const matchesPrefix = _matchesPrefix.bind(void 0, true);
function _matchesPrefix(ignoreCase, word, wordToMatchAgainst) {
  if (!wordToMatchAgainst || wordToMatchAgainst.length < word.length) {
    return null;
  }
  let matches;
  if (ignoreCase) {
    matches = strings.startsWithIgnoreCase(wordToMatchAgainst, word);
  } else {
    matches = wordToMatchAgainst.indexOf(word) === 0;
  }
  if (!matches) {
    return null;
  }
  return word.length > 0 ? [{ start: 0, end: word.length }] : [];
}
function matchesContiguousSubString(word, wordToMatchAgainst) {
  if (word.length > wordToMatchAgainst.length) {
    return null;
  }
  const index = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
  if (index === -1) {
    return null;
  }
  return [{ start: index, end: index + word.length }];
}
function matchesBaseContiguousSubString(word, wordToMatchAgainst) {
  if (word.length > wordToMatchAgainst.length) {
    return null;
  }
  word = tryNormalizeToBase(word);
  wordToMatchAgainst = tryNormalizeToBase(wordToMatchAgainst);
  const index = wordToMatchAgainst.indexOf(word);
  if (index === -1) {
    return null;
  }
  return [{ start: index, end: index + word.length }];
}
function matchesSubString(word, wordToMatchAgainst) {
  if (word.length > wordToMatchAgainst.length) {
    return null;
  }
  return _matchesSubString(word.toLowerCase(), wordToMatchAgainst.toLowerCase(), 0, 0);
}
function _matchesSubString(word, wordToMatchAgainst, i, j) {
  if (i === word.length) {
    return [];
  } else if (j === wordToMatchAgainst.length) {
    return null;
  } else {
    if (word[i] === wordToMatchAgainst[j]) {
      let result = null;
      if (result = _matchesSubString(word, wordToMatchAgainst, i + 1, j + 1)) {
        return join({ start: j, end: j + 1 }, result);
      }
      return null;
    }
    return _matchesSubString(word, wordToMatchAgainst, i, j + 1);
  }
}
function isLower(code) {
  return CharCode.a <= code && code <= CharCode.z;
}
function isUpper(code) {
  return CharCode.A <= code && code <= CharCode.Z;
}
function isNumber(code) {
  return CharCode.Digit0 <= code && code <= CharCode.Digit9;
}
function isWhitespace(code) {
  return code === CharCode.Space || code === CharCode.Tab || code === CharCode.LineFeed || code === CharCode.CarriageReturn;
}
const wordSeparators = /* @__PURE__ */ new Set();
"()[]{}<>`'\"-/;:,.?!".split("").forEach((s) => wordSeparators.add(s.charCodeAt(0)));
function isWordSeparator(code) {
  return isWhitespace(code) || wordSeparators.has(code);
}
function charactersMatch(codeA, codeB) {
  return codeA === codeB || isWordSeparator(codeA) && isWordSeparator(codeB);
}
const alternateCharsCache = /* @__PURE__ */ new Map();
function getAlternateCodes(code) {
  if (alternateCharsCache.has(code)) {
    return alternateCharsCache.get(code);
  }
  let result;
  const codes = getKoreanAltChars(code);
  if (codes) {
    result = codes;
  }
  alternateCharsCache.set(code, result);
  return result;
}
function isAlphanumeric(code) {
  return isLower(code) || isUpper(code) || isNumber(code);
}
function join(head, tail) {
  if (tail.length === 0) {
    tail = [head];
  } else if (head.end === tail[0].start) {
    tail[0].start = head.start;
  } else {
    tail.unshift(head);
  }
  return tail;
}
function nextAnchor(camelCaseWord, start) {
  for (let i = start; i < camelCaseWord.length; i++) {
    const c = camelCaseWord.charCodeAt(i);
    if (isUpper(c) || isNumber(c) || i > 0 && !isAlphanumeric(camelCaseWord.charCodeAt(i - 1))) {
      return i;
    }
  }
  return camelCaseWord.length;
}
function _matchesCamelCase(word, camelCaseWord, i, j) {
  if (i === word.length) {
    return [];
  } else if (j === camelCaseWord.length) {
    return null;
  } else if (word[i] !== camelCaseWord[j].toLowerCase()) {
    return null;
  } else {
    let result = null;
    let nextUpperIndex = j + 1;
    result = _matchesCamelCase(word, camelCaseWord, i + 1, j + 1);
    while (!result && (nextUpperIndex = nextAnchor(camelCaseWord, nextUpperIndex)) < camelCaseWord.length) {
      result = _matchesCamelCase(word, camelCaseWord, i + 1, nextUpperIndex);
      nextUpperIndex++;
    }
    return result === null ? null : join({ start: j, end: j + 1 }, result);
  }
}
function analyzeCamelCaseWord(word) {
  let upper = 0, lower = 0, alpha = 0, numeric = 0, code = 0;
  for (let i = 0; i < word.length; i++) {
    code = word.charCodeAt(i);
    if (isUpper(code)) {
      upper++;
    }
    if (isLower(code)) {
      lower++;
    }
    if (isAlphanumeric(code)) {
      alpha++;
    }
    if (isNumber(code)) {
      numeric++;
    }
  }
  const upperPercent = upper / word.length;
  const lowerPercent = lower / word.length;
  const alphaPercent = alpha / word.length;
  const numericPercent = numeric / word.length;
  return { upperPercent, lowerPercent, alphaPercent, numericPercent };
}
function isUpperCaseWord(analysis) {
  const { upperPercent, lowerPercent } = analysis;
  return lowerPercent === 0 && upperPercent > 0.6;
}
function isCamelCaseWord(analysis) {
  const { upperPercent, lowerPercent, alphaPercent, numericPercent } = analysis;
  return lowerPercent > 0.2 && upperPercent < 0.8 && alphaPercent > 0.6 && numericPercent < 0.2;
}
function isCamelCasePattern(word) {
  let upper = 0, lower = 0, code = 0, whitespace = 0;
  for (let i = 0; i < word.length; i++) {
    code = word.charCodeAt(i);
    if (isUpper(code)) {
      upper++;
    }
    if (isLower(code)) {
      lower++;
    }
    if (isWhitespace(code)) {
      whitespace++;
    }
  }
  if ((upper === 0 || lower === 0) && whitespace === 0) {
    return word.length <= 30;
  } else {
    return upper <= 5;
  }
}
function matchesCamelCase(word, camelCaseWord) {
  if (!camelCaseWord) {
    return null;
  }
  camelCaseWord = camelCaseWord.trim();
  if (camelCaseWord.length === 0) {
    return null;
  }
  if (!isCamelCasePattern(word)) {
    return null;
  }
  if (camelCaseWord.length > 60) {
    camelCaseWord = camelCaseWord.substring(0, 60);
  }
  const analysis = analyzeCamelCaseWord(camelCaseWord);
  if (!isCamelCaseWord(analysis)) {
    if (!isUpperCaseWord(analysis)) {
      return null;
    }
    camelCaseWord = camelCaseWord.toLowerCase();
  }
  let result = null;
  let i = 0;
  word = word.toLowerCase();
  while (i < camelCaseWord.length && (result = _matchesCamelCase(word, camelCaseWord, 0, i)) === null) {
    i = nextAnchor(camelCaseWord, i + 1);
  }
  return result;
}
function matchesWords(word, target, contiguous = false) {
  if (!target || target.length === 0) {
    return null;
  }
  let result = null;
  let targetIndex = 0;
  word = tryNormalizeToBase(word);
  target = tryNormalizeToBase(target);
  const memo = /* @__PURE__ */ new Map();
  while (targetIndex < target.length) {
    result = _matchesWords(word, target, 0, targetIndex, contiguous, memo);
    if (result !== null) {
      break;
    }
    targetIndex = nextWord(target, targetIndex + 1);
  }
  return result;
}
function cloneMatches(matches) {
  if (matches === null) {
    return null;
  }
  const result = [];
  for (const m of matches) {
    result.push({ start: m.start, end: m.end });
  }
  return result;
}
function _matchesWords(word, target, wordIndex, targetIndex, contiguous, memo) {
  if (wordIndex === word.length) {
    return [];
  } else if (targetIndex === target.length) {
    return null;
  }
  const memoKey = wordIndex * (target.length + 1) + targetIndex;
  const cached = memo.get(memoKey);
  if (cached !== void 0) {
    return cloneMatches(cached);
  }
  const computed = _matchesWordsCompute(word, target, wordIndex, targetIndex, contiguous, memo);
  memo.set(memoKey, cloneMatches(computed));
  return computed;
}
function _matchesWordsCompute(word, target, wordIndex, targetIndex, contiguous, memo) {
  let targetIndexOffset = 0;
  if (!charactersMatch(word.charCodeAt(wordIndex), target.charCodeAt(targetIndex))) {
    const altChars = getAlternateCodes(word.charCodeAt(wordIndex));
    if (!altChars) {
      return null;
    }
    for (let k = 0; k < altChars.length; k++) {
      if (!charactersMatch(altChars[k], target.charCodeAt(targetIndex + k))) {
        return null;
      }
    }
    targetIndexOffset += altChars.length - 1;
  }
  let result = null;
  let nextWordIndex = targetIndex + targetIndexOffset + 1;
  result = _matchesWords(word, target, wordIndex + 1, nextWordIndex, contiguous, memo);
  if (!contiguous) {
    while (!result && (nextWordIndex = nextWord(target, nextWordIndex)) < target.length) {
      result = _matchesWords(word, target, wordIndex + 1, nextWordIndex, contiguous, memo);
      nextWordIndex++;
    }
  }
  if (!result) {
    return null;
  }
  if (word.charCodeAt(wordIndex) !== target.charCodeAt(targetIndex)) {
    const altChars = getAlternateCodes(word.charCodeAt(wordIndex));
    if (!altChars) {
      return result;
    }
    for (let k = 0; k < altChars.length; k++) {
      if (altChars[k] !== target.charCodeAt(targetIndex + k)) {
        return result;
      }
    }
  }
  return join({ start: targetIndex, end: targetIndex + targetIndexOffset + 1 }, result);
}
function nextWord(word, start) {
  for (let i = start; i < word.length; i++) {
    if (isWordSeparator(word.charCodeAt(i)) || i > 0 && isWordSeparator(word.charCodeAt(i - 1))) {
      return i;
    }
  }
  return word.length;
}
const fuzzyContiguousFilter = or(matchesPrefix, matchesCamelCase, matchesContiguousSubString);
const fuzzySeparateFilter = or(matchesPrefix, matchesCamelCase, matchesSubString);
const fuzzyRegExpCache = new LRUCache(1e4);
function matchesFuzzy(word, wordToMatchAgainst, enableSeparateSubstringMatching = false) {
  if (typeof word !== "string" || typeof wordToMatchAgainst !== "string") {
    return null;
  }
  let regexp = fuzzyRegExpCache.get(word);
  if (!regexp) {
    regexp = new RegExp(strings.convertSimple2RegExpPattern(word), "i");
    fuzzyRegExpCache.set(word, regexp);
  }
  const match = regexp.exec(wordToMatchAgainst);
  if (match) {
    return [{ start: match.index, end: match.index + match[0].length }];
  }
  return enableSeparateSubstringMatching ? fuzzySeparateFilter(word, wordToMatchAgainst) : fuzzyContiguousFilter(word, wordToMatchAgainst);
}
function matchesFuzzy2(pattern, word) {
  const score = fuzzyScore(pattern, pattern.toLowerCase(), 0, word, word.toLowerCase(), 0, { firstMatchCanBeWeak: true, boostFullMatch: true });
  return score ? createMatches(score) : null;
}
function anyScore(pattern, lowPattern, patternPos, word, lowWord, wordPos) {
  const max = Math.min(13, pattern.length);
  for (; patternPos < max; patternPos++) {
    const result = fuzzyScore(pattern, lowPattern, patternPos, word, lowWord, wordPos, { firstMatchCanBeWeak: true, boostFullMatch: true });
    if (result) {
      return result;
    }
  }
  return [0, wordPos];
}
function createMatches(score) {
  if (typeof score === "undefined") {
    return [];
  }
  const res = [];
  const wordPos = score[1];
  for (let i = score.length - 1; i > 1; i--) {
    const pos = score[i] + wordPos;
    const last = res[res.length - 1];
    if (last && last.end === pos) {
      last.end = pos + 1;
    } else {
      res.push({ start: pos, end: pos + 1 });
    }
  }
  return res;
}
const _maxLen = 128;
function initTable() {
  const table = [];
  const row = [];
  for (let i = 0; i <= _maxLen; i++) {
    row[i] = 0;
  }
  for (let i = 0; i <= _maxLen; i++) {
    table.push(row.slice(0));
  }
  return table;
}
function initArr(maxLen) {
  const row = [];
  for (let i = 0; i <= maxLen; i++) {
    row[i] = 0;
  }
  return row;
}
const _minWordMatchPos = initArr(2 * _maxLen);
const _maxWordMatchPos = initArr(2 * _maxLen);
const _diag = initTable();
const _table = initTable();
const _arrows = initTable();
const _debug = false;
function printTable(table, pattern, patternLen, word, wordLen) {
  function pad(s, n, pad2 = " ") {
    while (s.length < n) {
      s = pad2 + s;
    }
    return s;
  }
  let ret = ` |   |${word.split("").map((c) => pad(c, 3)).join("|")}
`;
  for (let i = 0; i <= patternLen; i++) {
    if (i === 0) {
      ret += " |";
    } else {
      ret += `${pattern[i - 1]}|`;
    }
    ret += table[i].slice(0, wordLen + 1).map((n) => pad(n.toString(), 3)).join("|") + "\n";
  }
  return ret;
}
function printTables(pattern, patternStart, word, wordStart) {
  pattern = pattern.substr(patternStart);
  word = word.substr(wordStart);
  console.log(printTable(_table, pattern, pattern.length, word, word.length));
  console.log(printTable(_arrows, pattern, pattern.length, word, word.length));
  console.log(printTable(_diag, pattern, pattern.length, word, word.length));
}
function isSeparatorAtPos(value, index) {
  if (index < 0 || index >= value.length) {
    return false;
  }
  const code = value.codePointAt(index);
  switch (code) {
    case CharCode.Underline:
    case CharCode.Dash:
    case CharCode.Period:
    case CharCode.Space:
    case CharCode.Slash:
    case CharCode.Backslash:
    case CharCode.SingleQuote:
    case CharCode.DoubleQuote:
    case CharCode.Colon:
    case CharCode.DollarSign:
    case CharCode.LessThan:
    case CharCode.GreaterThan:
    case CharCode.OpenParen:
    case CharCode.CloseParen:
    case CharCode.OpenSquareBracket:
    case CharCode.CloseSquareBracket:
    case CharCode.OpenCurlyBrace:
    case CharCode.CloseCurlyBrace:
      return true;
    case void 0:
      return false;
    default:
      if (strings.isEmojiImprecise(code)) {
        return true;
      }
      return false;
  }
}
function isWhitespaceAtPos(value, index) {
  if (index < 0 || index >= value.length) {
    return false;
  }
  const code = value.charCodeAt(index);
  switch (code) {
    case CharCode.Space:
    case CharCode.Tab:
      return true;
    default:
      return false;
  }
}
function isUpperCaseAtPos(pos, word, wordLow) {
  return word[pos] !== wordLow[pos];
}
function isPatternInWord(patternLow, patternPos, patternLen, wordLow, wordPos, wordLen, fillMinWordPosArr = false) {
  while (patternPos < patternLen && wordPos < wordLen) {
    if (patternLow[patternPos] === wordLow[wordPos]) {
      if (fillMinWordPosArr) {
        _minWordMatchPos[patternPos] = wordPos;
      }
      patternPos += 1;
    }
    wordPos += 1;
  }
  return patternPos === patternLen;
}
var Arrow = /* @__PURE__ */ ((Arrow2) => {
  Arrow2[Arrow2["Diag"] = 1] = "Diag";
  Arrow2[Arrow2["Left"] = 2] = "Left";
  Arrow2[Arrow2["LeftLeft"] = 3] = "LeftLeft";
  return Arrow2;
})(Arrow || {});
var FuzzyScore;
((FuzzyScore2) => {
  FuzzyScore2.Default = [-100, 0];
  function isDefault(score) {
    return !score || score.length === 2 && score[0] === -100 && score[1] === 0;
  }
  FuzzyScore2.isDefault = isDefault;
})(FuzzyScore || (FuzzyScore = {}));
class FuzzyScoreOptions {
  constructor(firstMatchCanBeWeak, boostFullMatch) {
    this.firstMatchCanBeWeak = firstMatchCanBeWeak;
    this.boostFullMatch = boostFullMatch;
  }
}
FuzzyScoreOptions.default = { boostFullMatch: true, firstMatchCanBeWeak: false };
function fuzzyScore(pattern, patternLow, patternStart, word, wordLow, wordStart, options = FuzzyScoreOptions.default) {
  const patternLen = pattern.length > _maxLen ? _maxLen : pattern.length;
  const wordLen = word.length > _maxLen ? _maxLen : word.length;
  if (patternStart >= patternLen || wordStart >= wordLen || patternLen - patternStart > wordLen - wordStart) {
    return void 0;
  }
  if (!isPatternInWord(patternLow, patternStart, patternLen, wordLow, wordStart, wordLen, true)) {
    return void 0;
  }
  _fillInMaxWordMatchPos(patternLen, wordLen, patternStart, wordStart, patternLow, wordLow);
  let row = 1;
  let column = 1;
  let patternPos = patternStart;
  let wordPos = wordStart;
  const hasStrongFirstMatch = [false];
  for (row = 1, patternPos = patternStart; patternPos < patternLen; row++, patternPos++) {
    const minWordMatchPos = _minWordMatchPos[patternPos];
    const maxWordMatchPos = _maxWordMatchPos[patternPos];
    const nextMaxWordMatchPos = patternPos + 1 < patternLen ? _maxWordMatchPos[patternPos + 1] : wordLen;
    for (column = minWordMatchPos - wordStart + 1, wordPos = minWordMatchPos; wordPos < nextMaxWordMatchPos; column++, wordPos++) {
      let score = Number.MIN_SAFE_INTEGER;
      let canComeDiag = false;
      if (wordPos <= maxWordMatchPos) {
        score = _doScore(
          pattern,
          patternLow,
          patternPos,
          patternStart,
          word,
          wordLow,
          wordPos,
          wordLen,
          wordStart,
          _diag[row - 1][column - 1] === 0,
          hasStrongFirstMatch
        );
      }
      let diagScore = 0;
      if (score !== Number.MIN_SAFE_INTEGER) {
        canComeDiag = true;
        diagScore = score + _table[row - 1][column - 1];
      }
      const canComeLeft = wordPos > minWordMatchPos;
      const leftScore = canComeLeft ? _table[row][column - 1] + (_diag[row][column - 1] > 0 ? -5 : 0) : 0;
      const canComeLeftLeft = wordPos > minWordMatchPos + 1 && _diag[row][column - 1] > 0;
      const leftLeftScore = canComeLeftLeft ? _table[row][column - 2] + (_diag[row][column - 2] > 0 ? -5 : 0) : 0;
      if (canComeLeftLeft && (!canComeLeft || leftLeftScore >= leftScore) && (!canComeDiag || leftLeftScore >= diagScore)) {
        _table[row][column] = leftLeftScore;
        _arrows[row][column] = 3 /* LeftLeft */;
        _diag[row][column] = 0;
      } else if (canComeLeft && (!canComeDiag || leftScore >= diagScore)) {
        _table[row][column] = leftScore;
        _arrows[row][column] = 2 /* Left */;
        _diag[row][column] = 0;
      } else if (canComeDiag) {
        _table[row][column] = diagScore;
        _arrows[row][column] = 1 /* Diag */;
        _diag[row][column] = _diag[row - 1][column - 1] + 1;
      } else {
        throw new Error(`not possible`);
      }
    }
  }
  if (_debug) {
    printTables(pattern, patternStart, word, wordStart);
  }
  if (!hasStrongFirstMatch[0] && !options.firstMatchCanBeWeak) {
    return void 0;
  }
  row--;
  column--;
  const result = [_table[row][column], wordStart];
  let backwardsDiagLength = 0;
  let maxMatchColumn = 0;
  while (row >= 1) {
    let diagColumn = column;
    do {
      const arrow = _arrows[row][diagColumn];
      if (arrow === 3 /* LeftLeft */) {
        diagColumn = diagColumn - 2;
      } else if (arrow === 2 /* Left */) {
        diagColumn = diagColumn - 1;
      } else {
        break;
      }
    } while (diagColumn >= 1);
    if (backwardsDiagLength > 1 && patternLow[patternStart + row - 1] === wordLow[wordStart + column - 1] && !isUpperCaseAtPos(diagColumn + wordStart - 1, word, wordLow) && backwardsDiagLength + 1 > _diag[row][diagColumn]) {
      diagColumn = column;
    }
    if (diagColumn === column) {
      backwardsDiagLength++;
    } else {
      backwardsDiagLength = 1;
    }
    if (!maxMatchColumn) {
      maxMatchColumn = diagColumn;
    }
    row--;
    column = diagColumn - 1;
    result.push(column);
  }
  if (wordLen - wordStart === patternLen && options.boostFullMatch) {
    result[0] += 2;
  }
  const skippedCharsCount = maxMatchColumn - patternLen;
  result[0] -= skippedCharsCount;
  return result;
}
function _fillInMaxWordMatchPos(patternLen, wordLen, patternStart, wordStart, patternLow, wordLow) {
  let patternPos = patternLen - 1;
  let wordPos = wordLen - 1;
  while (patternPos >= patternStart && wordPos >= wordStart) {
    if (patternLow[patternPos] === wordLow[wordPos]) {
      _maxWordMatchPos[patternPos] = wordPos;
      patternPos--;
    }
    wordPos--;
  }
}
function _doScore(pattern, patternLow, patternPos, patternStart, word, wordLow, wordPos, wordLen, wordStart, newMatchStart, outFirstMatchStrong) {
  if (patternLow[patternPos] !== wordLow[wordPos]) {
    return Number.MIN_SAFE_INTEGER;
  }
  let score = 1;
  let isGapLocation = false;
  if (wordPos === patternPos - patternStart) {
    score = pattern[patternPos] === word[wordPos] ? 7 : 5;
  } else if (isUpperCaseAtPos(wordPos, word, wordLow) && (wordPos === 0 || !isUpperCaseAtPos(wordPos - 1, word, wordLow))) {
    score = pattern[patternPos] === word[wordPos] ? 7 : 5;
    isGapLocation = true;
  } else if (isSeparatorAtPos(wordLow, wordPos) && (wordPos === 0 || !isSeparatorAtPos(wordLow, wordPos - 1))) {
    score = 5;
  } else if (isSeparatorAtPos(wordLow, wordPos - 1) || isWhitespaceAtPos(wordLow, wordPos - 1)) {
    score = 5;
    isGapLocation = true;
  }
  if (score > 1 && patternPos === patternStart) {
    outFirstMatchStrong[0] = true;
  }
  if (!isGapLocation) {
    isGapLocation = isUpperCaseAtPos(wordPos, word, wordLow) || isSeparatorAtPos(wordLow, wordPos - 1) || isWhitespaceAtPos(wordLow, wordPos - 1);
  }
  if (patternPos === patternStart) {
    if (wordPos > wordStart) {
      score -= isGapLocation ? 3 : 5;
    }
  } else {
    if (newMatchStart) {
      score += isGapLocation ? 2 : 0;
    } else {
      score += isGapLocation ? 0 : 1;
    }
  }
  if (wordPos + 1 === wordLen) {
    score -= isGapLocation ? 3 : 5;
  }
  return score;
}
function fuzzyScoreGracefulAggressive(pattern, lowPattern, patternPos, word, lowWord, wordPos, options) {
  return fuzzyScoreWithPermutations(pattern, lowPattern, patternPos, word, lowWord, wordPos, true, options);
}
function fuzzyScoreGraceful(pattern, lowPattern, patternPos, word, lowWord, wordPos, options) {
  return fuzzyScoreWithPermutations(pattern, lowPattern, patternPos, word, lowWord, wordPos, false, options);
}
function fuzzyScoreWithPermutations(pattern, lowPattern, patternPos, word, lowWord, wordPos, aggressive, options) {
  let top = fuzzyScore(pattern, lowPattern, patternPos, word, lowWord, wordPos, options);
  if (top && !aggressive) {
    return top;
  }
  if (pattern.length >= 3) {
    const tries = Math.min(7, pattern.length - 1);
    for (let movingPatternPos = patternPos + 1; movingPatternPos < tries; movingPatternPos++) {
      const newPattern = nextTypoPermutation(pattern, movingPatternPos);
      if (newPattern) {
        const candidate = fuzzyScore(newPattern, newPattern.toLowerCase(), patternPos, word, lowWord, wordPos, options);
        if (candidate) {
          candidate[0] -= 3;
          if (!top || candidate[0] > top[0]) {
            top = candidate;
          }
        }
      }
    }
  }
  return top;
}
function nextTypoPermutation(pattern, patternPos) {
  if (patternPos + 1 >= pattern.length) {
    return void 0;
  }
  const swap1 = pattern[patternPos];
  const swap2 = pattern[patternPos + 1];
  if (swap1 === swap2) {
    return void 0;
  }
  return pattern.slice(0, patternPos) + swap2 + swap1 + pattern.slice(patternPos + 2);
}
export {
  FuzzyScore,
  FuzzyScoreOptions,
  anyScore,
  createMatches,
  fuzzyScore,
  fuzzyScoreGraceful,
  fuzzyScoreGracefulAggressive,
  isPatternInWord,
  isUpper,
  matchesBaseContiguousSubString,
  matchesCamelCase,
  matchesContiguousSubString,
  matchesFuzzy,
  matchesFuzzy2,
  matchesPrefix,
  matchesStrictPrefix,
  matchesSubString,
  matchesWords,
  or
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGZpbHRlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUgfSBmcm9tICcuL21hcC5qcyc7XG5pbXBvcnQgeyBnZXRLb3JlYW5BbHRDaGFycyB9IGZyb20gJy4vbmF0dXJhbExhbmd1YWdlL2tvcmVhbi5qcyc7XG5pbXBvcnQgeyB0cnlOb3JtYWxpemVUb0Jhc2UgfSBmcm9tICcuL25vcm1hbGl6YXRpb24uanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuL3N0cmluZ3MuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElGaWx0ZXIge1xuXHQvLyBSZXR1cm5zIG51bGwgaWYgd29yZCBkb2Vzbid0IG1hdGNoLlxuXHQod29yZDogc3RyaW5nLCB3b3JkVG9NYXRjaEFnYWluc3Q6IHN0cmluZyk6IElNYXRjaFtdIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWF0Y2gge1xuXHRzdGFydDogbnVtYmVyO1xuXHRlbmQ6IG51bWJlcjtcbn1cblxuLy8gQ29tYmluZWQgZmlsdGVyc1xuXG4vKipcbiAqIEByZXR1cm5zIEEgZmlsdGVyIHdoaWNoIGNvbWJpbmVzIHRoZSBwcm92aWRlZCBzZXRcbiAqIG9mIGZpbHRlcnMgd2l0aCBhbiBvci4gVGhlICpmaXJzdCogZmlsdGVycyB0aGF0XG4gKiBtYXRjaGVzIGRlZmluZWQgdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgcmV0dXJuZWRcbiAqIGZpbHRlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9yKC4uLmZpbHRlcjogSUZpbHRlcltdKTogSUZpbHRlciB7XG5cdHJldHVybiBmdW5jdGlvbiAod29yZDogc3RyaW5nLCB3b3JkVG9NYXRjaEFnYWluc3Q6IHN0cmluZyk6IElNYXRjaFtdIHwgbnVsbCB7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGZpbHRlci5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBmaWx0ZXJbaV0od29yZCwgd29yZFRvTWF0Y2hBZ2FpbnN0KTtcblx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRyZXR1cm4gbWF0Y2g7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9O1xufVxuXG4vLyBQcmVmaXhcblxuZXhwb3J0IGNvbnN0IG1hdGNoZXNTdHJpY3RQcmVmaXg6IElGaWx0ZXIgPSBfbWF0Y2hlc1ByZWZpeC5iaW5kKHVuZGVmaW5lZCwgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IG1hdGNoZXNQcmVmaXg6IElGaWx0ZXIgPSBfbWF0Y2hlc1ByZWZpeC5iaW5kKHVuZGVmaW5lZCwgdHJ1ZSk7XG5cbmZ1bmN0aW9uIF9tYXRjaGVzUHJlZml4KGlnbm9yZUNhc2U6IGJvb2xlYW4sIHdvcmQ6IHN0cmluZywgd29yZFRvTWF0Y2hBZ2FpbnN0OiBzdHJpbmcpOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRpZiAoIXdvcmRUb01hdGNoQWdhaW5zdCB8fCB3b3JkVG9NYXRjaEFnYWluc3QubGVuZ3RoIDwgd29yZC5sZW5ndGgpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGxldCBtYXRjaGVzOiBib29sZWFuO1xuXHRpZiAoaWdub3JlQ2FzZSkge1xuXHRcdG1hdGNoZXMgPSBzdHJpbmdzLnN0YXJ0c1dpdGhJZ25vcmVDYXNlKHdvcmRUb01hdGNoQWdhaW5zdCwgd29yZCk7XG5cdH0gZWxzZSB7XG5cdFx0bWF0Y2hlcyA9IHdvcmRUb01hdGNoQWdhaW5zdC5pbmRleE9mKHdvcmQpID09PSAwO1xuXHR9XG5cblx0aWYgKCFtYXRjaGVzKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRyZXR1cm4gd29yZC5sZW5ndGggPiAwID8gW3sgc3RhcnQ6IDAsIGVuZDogd29yZC5sZW5ndGggfV0gOiBbXTtcbn1cblxuLy8gQ29udGlndW91cyBTdWJzdHJpbmdcblxuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoZXNDb250aWd1b3VzU3ViU3RyaW5nKHdvcmQ6IHN0cmluZywgd29yZFRvTWF0Y2hBZ2FpbnN0OiBzdHJpbmcpOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRpZiAod29yZC5sZW5ndGggPiB3b3JkVG9NYXRjaEFnYWluc3QubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBpbmRleCA9IHdvcmRUb01hdGNoQWdhaW5zdC50b0xvd2VyQ2FzZSgpLmluZGV4T2Yod29yZC50b0xvd2VyQ2FzZSgpKTtcblx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cmV0dXJuIFt7IHN0YXJ0OiBpbmRleCwgZW5kOiBpbmRleCArIHdvcmQubGVuZ3RoIH1dO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hlc0Jhc2VDb250aWd1b3VzU3ViU3RyaW5nKHdvcmQ6IHN0cmluZywgd29yZFRvTWF0Y2hBZ2FpbnN0OiBzdHJpbmcpOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRpZiAod29yZC5sZW5ndGggPiB3b3JkVG9NYXRjaEFnYWluc3QubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHR3b3JkID0gdHJ5Tm9ybWFsaXplVG9CYXNlKHdvcmQpO1xuXHR3b3JkVG9NYXRjaEFnYWluc3QgPSB0cnlOb3JtYWxpemVUb0Jhc2Uod29yZFRvTWF0Y2hBZ2FpbnN0KTtcblx0Y29uc3QgaW5kZXggPSB3b3JkVG9NYXRjaEFnYWluc3QuaW5kZXhPZih3b3JkKTtcblx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cmV0dXJuIFt7IHN0YXJ0OiBpbmRleCwgZW5kOiBpbmRleCArIHdvcmQubGVuZ3RoIH1dO1xufVxuXG4vLyBTdWJzdHJpbmdcblxuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoZXNTdWJTdHJpbmcod29yZDogc3RyaW5nLCB3b3JkVG9NYXRjaEFnYWluc3Q6IHN0cmluZyk6IElNYXRjaFtdIHwgbnVsbCB7XG5cdGlmICh3b3JkLmxlbmd0aCA+IHdvcmRUb01hdGNoQWdhaW5zdC5sZW5ndGgpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHJldHVybiBfbWF0Y2hlc1N1YlN0cmluZyh3b3JkLnRvTG93ZXJDYXNlKCksIHdvcmRUb01hdGNoQWdhaW5zdC50b0xvd2VyQ2FzZSgpLCAwLCAwKTtcbn1cblxuZnVuY3Rpb24gX21hdGNoZXNTdWJTdHJpbmcod29yZDogc3RyaW5nLCB3b3JkVG9NYXRjaEFnYWluc3Q6IHN0cmluZywgaTogbnVtYmVyLCBqOiBudW1iZXIpOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRpZiAoaSA9PT0gd29yZC5sZW5ndGgpIHtcblx0XHRyZXR1cm4gW107XG5cdH0gZWxzZSBpZiAoaiA9PT0gd29yZFRvTWF0Y2hBZ2FpbnN0Lmxlbmd0aCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9IGVsc2Uge1xuXHRcdGlmICh3b3JkW2ldID09PSB3b3JkVG9NYXRjaEFnYWluc3Rbal0pIHtcblx0XHRcdGxldCByZXN1bHQ6IElNYXRjaFtdIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRpZiAocmVzdWx0ID0gX21hdGNoZXNTdWJTdHJpbmcod29yZCwgd29yZFRvTWF0Y2hBZ2FpbnN0LCBpICsgMSwgaiArIDEpKSB7XG5cdFx0XHRcdHJldHVybiBqb2luKHsgc3RhcnQ6IGosIGVuZDogaiArIDEgfSwgcmVzdWx0KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBfbWF0Y2hlc1N1YlN0cmluZyh3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QsIGksIGogKyAxKTtcblx0fVxufVxuXG4vLyBDYW1lbENhc2VcblxuZnVuY3Rpb24gaXNMb3dlcihjb2RlOiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIENoYXJDb2RlLmEgPD0gY29kZSAmJiBjb2RlIDw9IENoYXJDb2RlLno7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1VwcGVyKGNvZGU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gQ2hhckNvZGUuQSA8PSBjb2RlICYmIGNvZGUgPD0gQ2hhckNvZGUuWjtcbn1cblxuZnVuY3Rpb24gaXNOdW1iZXIoY29kZTogbnVtYmVyKTogYm9vbGVhbiB7XG5cdHJldHVybiBDaGFyQ29kZS5EaWdpdDAgPD0gY29kZSAmJiBjb2RlIDw9IENoYXJDb2RlLkRpZ2l0OTtcbn1cblxuZnVuY3Rpb24gaXNXaGl0ZXNwYWNlKGNvZGU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKFxuXHRcdGNvZGUgPT09IENoYXJDb2RlLlNwYWNlXG5cdFx0fHwgY29kZSA9PT0gQ2hhckNvZGUuVGFiXG5cdFx0fHwgY29kZSA9PT0gQ2hhckNvZGUuTGluZUZlZWRcblx0XHR8fCBjb2RlID09PSBDaGFyQ29kZS5DYXJyaWFnZVJldHVyblxuXHQpO1xufVxuXG5jb25zdCB3b3JkU2VwYXJhdG9ycyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuLy8gVGhlc2UgYXJlIGNob3NlbiBhcyBuYXR1cmFsIHdvcmQgc2VwYXJhdG9ycyBiYXNlZCBvbiB3cml0dGVuIHRleHQuXG4vLyBJdCBpcyBhIHN1YnNldCBvZiB0aGUgd29yZCBzZXBhcmF0b3JzIHVzZWQgYnkgdGhlIG1vbmFjbyBlZGl0b3IuXG4nKClbXXt9PD5gXFwnXCItLzs6LC4/ISdcblx0LnNwbGl0KCcnKVxuXHQuZm9yRWFjaChzID0+IHdvcmRTZXBhcmF0b3JzLmFkZChzLmNoYXJDb2RlQXQoMCkpKTtcblxuZnVuY3Rpb24gaXNXb3JkU2VwYXJhdG9yKGNvZGU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNXaGl0ZXNwYWNlKGNvZGUpIHx8IHdvcmRTZXBhcmF0b3JzLmhhcyhjb2RlKTtcbn1cblxuZnVuY3Rpb24gY2hhcmFjdGVyc01hdGNoKGNvZGVBOiBudW1iZXIsIGNvZGVCOiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIChjb2RlQSA9PT0gY29kZUIpIHx8IChpc1dvcmRTZXBhcmF0b3IoY29kZUEpICYmIGlzV29yZFNlcGFyYXRvcihjb2RlQikpO1xufVxuXG5jb25zdCBhbHRlcm5hdGVDaGFyc0NhY2hlOiBNYXA8bnVtYmVyLCBBcnJheUxpa2U8bnVtYmVyPiB8IHVuZGVmaW5lZD4gPSBuZXcgTWFwKCk7XG4vKipcbiAqIEdldHMgYWx0ZXJuYXRpdmUgY29kZXMgdG8gdGhlIGNoYXJhY3RlciBjb2RlIHBhc3NlZCBpbi4gVGhpcyBjb21lcyBpbiB0aGVcbiAqIGZvcm0gb2YgYW4gYXJyYXkgb2YgY2hhcmFjdGVyIGNvZGVzLCBhbGwgb2Ygd2hpY2ggbXVzdCBtYXRjaCBfaW4gb3JkZXJfIHRvXG4gKiBzdWNjZXNzZnVsbHkgbWF0Y2guXG4gKlxuICogQHBhcmFtIGNvZGUgVGhlIGNoYXJhY3RlciBjb2RlIHRvIGNoZWNrLlxuICovXG5mdW5jdGlvbiBnZXRBbHRlcm5hdGVDb2Rlcyhjb2RlOiBudW1iZXIpOiBBcnJheUxpa2U8bnVtYmVyPiB8IHVuZGVmaW5lZCB7XG5cdGlmIChhbHRlcm5hdGVDaGFyc0NhY2hlLmhhcyhjb2RlKSkge1xuXHRcdHJldHVybiBhbHRlcm5hdGVDaGFyc0NhY2hlLmdldChjb2RlKTtcblx0fVxuXG5cdC8vIE5PVEU6IFRoaXMgZnVuY3Rpb24gaXMgd3JpdHRlbiBpbiBzdWNoIGEgd2F5IHRoYXQgaXQgY2FuIGJlIGV4dGVuZGVkIGluXG5cdC8vIHRoZSBmdXR1cmUsIGJ1dCByaWdodCBub3cgdGhlIHJldHVybiB0eXBlIHRha2VzIGludG8gYWNjb3VudCBpdCdzIG9ubHlcblx0Ly8gc3VwcG9ydGVkIGJ5IGEgc2luZ2xlIFwiYWx0IGNvZGVzIHByb3ZpZGVyXCIuXG5cdC8vIGBBcnJheUxpa2U8QXJyYXlMaWtlPG51bWJlcj4+YCBpcyBhIG1vcmUgYXBwcm9wcmlhdGUgdHlwZSBpZiBjaGFuZ2VkLlxuXHRsZXQgcmVzdWx0OiBBcnJheUxpa2U8bnVtYmVyPiB8IHVuZGVmaW5lZDtcblx0Y29uc3QgY29kZXMgPSBnZXRLb3JlYW5BbHRDaGFycyhjb2RlKTtcblx0aWYgKGNvZGVzKSB7XG5cdFx0cmVzdWx0ID0gY29kZXM7XG5cdH1cblxuXHRhbHRlcm5hdGVDaGFyc0NhY2hlLnNldChjb2RlLCByZXN1bHQpO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBpc0FscGhhbnVtZXJpYyhjb2RlOiBudW1iZXIpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTG93ZXIoY29kZSkgfHwgaXNVcHBlcihjb2RlKSB8fCBpc051bWJlcihjb2RlKTtcbn1cblxuZnVuY3Rpb24gam9pbihoZWFkOiBJTWF0Y2gsIHRhaWw6IElNYXRjaFtdKTogSU1hdGNoW10ge1xuXHRpZiAodGFpbC5sZW5ndGggPT09IDApIHtcblx0XHR0YWlsID0gW2hlYWRdO1xuXHR9IGVsc2UgaWYgKGhlYWQuZW5kID09PSB0YWlsWzBdLnN0YXJ0KSB7XG5cdFx0dGFpbFswXS5zdGFydCA9IGhlYWQuc3RhcnQ7XG5cdH0gZWxzZSB7XG5cdFx0dGFpbC51bnNoaWZ0KGhlYWQpO1xuXHR9XG5cdHJldHVybiB0YWlsO1xufVxuXG5mdW5jdGlvbiBuZXh0QW5jaG9yKGNhbWVsQ2FzZVdvcmQ6IHN0cmluZywgc3RhcnQ6IG51bWJlcik6IG51bWJlciB7XG5cdGZvciAobGV0IGkgPSBzdGFydDsgaSA8IGNhbWVsQ2FzZVdvcmQubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBjID0gY2FtZWxDYXNlV29yZC5jaGFyQ29kZUF0KGkpO1xuXHRcdGlmIChpc1VwcGVyKGMpIHx8IGlzTnVtYmVyKGMpIHx8IChpID4gMCAmJiAhaXNBbHBoYW51bWVyaWMoY2FtZWxDYXNlV29yZC5jaGFyQ29kZUF0KGkgLSAxKSkpKSB7XG5cdFx0XHRyZXR1cm4gaTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNhbWVsQ2FzZVdvcmQubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiBfbWF0Y2hlc0NhbWVsQ2FzZSh3b3JkOiBzdHJpbmcsIGNhbWVsQ2FzZVdvcmQ6IHN0cmluZywgaTogbnVtYmVyLCBqOiBudW1iZXIpOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRpZiAoaSA9PT0gd29yZC5sZW5ndGgpIHtcblx0XHRyZXR1cm4gW107XG5cdH0gZWxzZSBpZiAoaiA9PT0gY2FtZWxDYXNlV29yZC5sZW5ndGgpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fSBlbHNlIGlmICh3b3JkW2ldICE9PSBjYW1lbENhc2VXb3JkW2pdLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fSBlbHNlIHtcblx0XHRsZXQgcmVzdWx0OiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBuZXh0VXBwZXJJbmRleCA9IGogKyAxO1xuXHRcdHJlc3VsdCA9IF9tYXRjaGVzQ2FtZWxDYXNlKHdvcmQsIGNhbWVsQ2FzZVdvcmQsIGkgKyAxLCBqICsgMSk7XG5cdFx0d2hpbGUgKCFyZXN1bHQgJiYgKG5leHRVcHBlckluZGV4ID0gbmV4dEFuY2hvcihjYW1lbENhc2VXb3JkLCBuZXh0VXBwZXJJbmRleCkpIDwgY2FtZWxDYXNlV29yZC5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdCA9IF9tYXRjaGVzQ2FtZWxDYXNlKHdvcmQsIGNhbWVsQ2FzZVdvcmQsIGkgKyAxLCBuZXh0VXBwZXJJbmRleCk7XG5cdFx0XHRuZXh0VXBwZXJJbmRleCsrO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0ID09PSBudWxsID8gbnVsbCA6IGpvaW4oeyBzdGFydDogaiwgZW5kOiBqICsgMSB9LCByZXN1bHQpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ2FtZWxDYXNlQW5hbHlzaXMge1xuXHR1cHBlclBlcmNlbnQ6IG51bWJlcjtcblx0bG93ZXJQZXJjZW50OiBudW1iZXI7XG5cdGFscGhhUGVyY2VudDogbnVtYmVyO1xuXHRudW1lcmljUGVyY2VudDogbnVtYmVyO1xufVxuXG4vLyBIZXVyaXN0aWMgdG8gYXZvaWQgY29tcHV0aW5nIGNhbWVsIGNhc2UgbWF0Y2hlciBmb3Igd29yZHMgdGhhdCBkb24ndFxuLy8gbG9vayBsaWtlIGNhbWVsQ2FzZVdvcmRzLlxuZnVuY3Rpb24gYW5hbHl6ZUNhbWVsQ2FzZVdvcmQod29yZDogc3RyaW5nKTogSUNhbWVsQ2FzZUFuYWx5c2lzIHtcblx0bGV0IHVwcGVyID0gMCwgbG93ZXIgPSAwLCBhbHBoYSA9IDAsIG51bWVyaWMgPSAwLCBjb2RlID0gMDtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHdvcmQubGVuZ3RoOyBpKyspIHtcblx0XHRjb2RlID0gd29yZC5jaGFyQ29kZUF0KGkpO1xuXG5cdFx0aWYgKGlzVXBwZXIoY29kZSkpIHsgdXBwZXIrKzsgfVxuXHRcdGlmIChpc0xvd2VyKGNvZGUpKSB7IGxvd2VyKys7IH1cblx0XHRpZiAoaXNBbHBoYW51bWVyaWMoY29kZSkpIHsgYWxwaGErKzsgfVxuXHRcdGlmIChpc051bWJlcihjb2RlKSkgeyBudW1lcmljKys7IH1cblx0fVxuXG5cdGNvbnN0IHVwcGVyUGVyY2VudCA9IHVwcGVyIC8gd29yZC5sZW5ndGg7XG5cdGNvbnN0IGxvd2VyUGVyY2VudCA9IGxvd2VyIC8gd29yZC5sZW5ndGg7XG5cdGNvbnN0IGFscGhhUGVyY2VudCA9IGFscGhhIC8gd29yZC5sZW5ndGg7XG5cdGNvbnN0IG51bWVyaWNQZXJjZW50ID0gbnVtZXJpYyAvIHdvcmQubGVuZ3RoO1xuXG5cdHJldHVybiB7IHVwcGVyUGVyY2VudCwgbG93ZXJQZXJjZW50LCBhbHBoYVBlcmNlbnQsIG51bWVyaWNQZXJjZW50IH07XG59XG5cbmZ1bmN0aW9uIGlzVXBwZXJDYXNlV29yZChhbmFseXNpczogSUNhbWVsQ2FzZUFuYWx5c2lzKTogYm9vbGVhbiB7XG5cdGNvbnN0IHsgdXBwZXJQZXJjZW50LCBsb3dlclBlcmNlbnQgfSA9IGFuYWx5c2lzO1xuXHRyZXR1cm4gbG93ZXJQZXJjZW50ID09PSAwICYmIHVwcGVyUGVyY2VudCA+IDAuNjtcbn1cblxuZnVuY3Rpb24gaXNDYW1lbENhc2VXb3JkKGFuYWx5c2lzOiBJQ2FtZWxDYXNlQW5hbHlzaXMpOiBib29sZWFuIHtcblx0Y29uc3QgeyB1cHBlclBlcmNlbnQsIGxvd2VyUGVyY2VudCwgYWxwaGFQZXJjZW50LCBudW1lcmljUGVyY2VudCB9ID0gYW5hbHlzaXM7XG5cdHJldHVybiBsb3dlclBlcmNlbnQgPiAwLjIgJiYgdXBwZXJQZXJjZW50IDwgMC44ICYmIGFscGhhUGVyY2VudCA+IDAuNiAmJiBudW1lcmljUGVyY2VudCA8IDAuMjtcbn1cblxuLy8gSGV1cmlzdGljIHRvIGF2b2lkIGNvbXB1dGluZyBjYW1lbCBjYXNlIG1hdGNoZXIgZm9yIHdvcmRzIHRoYXQgZG9uJ3Rcbi8vIGxvb2sgbGlrZSBjYW1lbCBjYXNlIHBhdHRlcm5zLlxuZnVuY3Rpb24gaXNDYW1lbENhc2VQYXR0ZXJuKHdvcmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRsZXQgdXBwZXIgPSAwLCBsb3dlciA9IDAsIGNvZGUgPSAwLCB3aGl0ZXNwYWNlID0gMDtcblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IHdvcmQubGVuZ3RoOyBpKyspIHtcblx0XHRjb2RlID0gd29yZC5jaGFyQ29kZUF0KGkpO1xuXG5cdFx0aWYgKGlzVXBwZXIoY29kZSkpIHsgdXBwZXIrKzsgfVxuXHRcdGlmIChpc0xvd2VyKGNvZGUpKSB7IGxvd2VyKys7IH1cblx0XHRpZiAoaXNXaGl0ZXNwYWNlKGNvZGUpKSB7IHdoaXRlc3BhY2UrKzsgfVxuXHR9XG5cblx0aWYgKCh1cHBlciA9PT0gMCB8fCBsb3dlciA9PT0gMCkgJiYgd2hpdGVzcGFjZSA9PT0gMCkge1xuXHRcdHJldHVybiB3b3JkLmxlbmd0aCA8PSAzMDtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gdXBwZXIgPD0gNTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hlc0NhbWVsQ2FzZSh3b3JkOiBzdHJpbmcsIGNhbWVsQ2FzZVdvcmQ6IHN0cmluZyk6IElNYXRjaFtdIHwgbnVsbCB7XG5cdGlmICghY2FtZWxDYXNlV29yZCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y2FtZWxDYXNlV29yZCA9IGNhbWVsQ2FzZVdvcmQudHJpbSgpO1xuXG5cdGlmIChjYW1lbENhc2VXb3JkLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0aWYgKCFpc0NhbWVsQ2FzZVBhdHRlcm4od29yZCkpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8vIFRPRE86IENvbnNpZGVyIHJlbW92aW5nIHRoaXMgY2hlY2tcblx0aWYgKGNhbWVsQ2FzZVdvcmQubGVuZ3RoID4gNjApIHtcblx0XHRjYW1lbENhc2VXb3JkID0gY2FtZWxDYXNlV29yZC5zdWJzdHJpbmcoMCwgNjApO1xuXHR9XG5cblx0Y29uc3QgYW5hbHlzaXMgPSBhbmFseXplQ2FtZWxDYXNlV29yZChjYW1lbENhc2VXb3JkKTtcblxuXHRpZiAoIWlzQ2FtZWxDYXNlV29yZChhbmFseXNpcykpIHtcblx0XHRpZiAoIWlzVXBwZXJDYXNlV29yZChhbmFseXNpcykpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNhbWVsQ2FzZVdvcmQgPSBjYW1lbENhc2VXb3JkLnRvTG93ZXJDYXNlKCk7XG5cdH1cblxuXHRsZXQgcmVzdWx0OiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRsZXQgaSA9IDA7XG5cblx0d29yZCA9IHdvcmQudG9Mb3dlckNhc2UoKTtcblx0d2hpbGUgKGkgPCBjYW1lbENhc2VXb3JkLmxlbmd0aCAmJiAocmVzdWx0ID0gX21hdGNoZXNDYW1lbENhc2Uod29yZCwgY2FtZWxDYXNlV29yZCwgMCwgaSkpID09PSBudWxsKSB7XG5cdFx0aSA9IG5leHRBbmNob3IoY2FtZWxDYXNlV29yZCwgaSArIDEpO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gTWF0Y2hlcyBiZWdpbm5pbmcgb2Ygd29yZHMgc3VwcG9ydGluZyBub24tQVNDSUkgbGFuZ3VhZ2VzXG4vLyBJZiBgY29udGlndW91c2AgaXMgdHJ1ZSB0aGVuIG1hdGNoZXMgd29yZCB3aXRoIGJlZ2lubmluZ3Mgb2YgdGhlIHdvcmRzIGluIHRoZSB0YXJnZXQuIEUuZy4gXCJwdWxcIiB3aWxsIG1hdGNoIFwiR2l0OiBQdWxsXCJcbi8vIE90aGVyd2lzZSBhbHNvIG1hdGNoZXMgc3ViIHN0cmluZyBvZiB0aGUgd29yZCB3aXRoIGJlZ2lubmluZ3Mgb2YgdGhlIHdvcmRzIGluIHRoZSB0YXJnZXQuIEUuZy4gXCJncFwiIG9yIFwiZyBwXCIgd2lsbCBtYXRjaCBcIkdpdDogUHVsbFwiXG4vLyBVc2VmdWwgaW4gY2FzZXMgd2hlcmUgdGhlIHRhcmdldCBpcyB3b3JkcyAoZS5nLiBjb21tYW5kIGxhYmVscylcblxuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoZXNXb3Jkcyh3b3JkOiBzdHJpbmcsIHRhcmdldDogc3RyaW5nLCBjb250aWd1b3VzOiBib29sZWFuID0gZmFsc2UpOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRpZiAoIXRhcmdldCB8fCB0YXJnZXQubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRsZXQgcmVzdWx0OiBJTWF0Y2hbXSB8IG51bGwgPSBudWxsO1xuXHRsZXQgdGFyZ2V0SW5kZXggPSAwO1xuXG5cdHdvcmQgPSB0cnlOb3JtYWxpemVUb0Jhc2Uod29yZCk7XG5cdHRhcmdldCA9IHRyeU5vcm1hbGl6ZVRvQmFzZSh0YXJnZXQpO1xuXHQvLyBNZW1vaXplIHJlY3Vyc2l2ZSBjYWxscyB3aXRoaW4gYSBzaW5nbGUgdG9wLWxldmVsIGludm9jYXRpb24uIEJlY2F1c2Ugd29yZFxuXHQvLyBzZXBhcmF0b3JzIGFyZSB0cmVhdGVkIGFzIGFuIGVxdWl2YWxlbmNlIGNsYXNzIGJ5IGBjaGFyYWN0ZXJzTWF0Y2hgLCB0aGVcblx0Ly8gcmVjdXJzaW9uIGluIGBfbWF0Y2hlc1dvcmRzYCBjYW4gb3RoZXJ3aXNlIGV4cGxvZGUgZXhwb25lbnRpYWxseSBmb3IgaW5wdXRzXG5cdC8vIGxpa2UgYGVkaXRvci5hY3Rpb25gIGFnYWluc3QgdGFyZ2V0cyB0aGF0IGNvbnRhaW4gbWFueSBzZXBhcmF0b3JzLlxuXHRjb25zdCBtZW1vID0gbmV3IE1hcDxudW1iZXIsIElNYXRjaFtdIHwgbnVsbD4oKTtcblx0d2hpbGUgKHRhcmdldEluZGV4IDwgdGFyZ2V0Lmxlbmd0aCkge1xuXHRcdHJlc3VsdCA9IF9tYXRjaGVzV29yZHMod29yZCwgdGFyZ2V0LCAwLCB0YXJnZXRJbmRleCwgY29udGlndW91cywgbWVtbyk7XG5cdFx0aWYgKHJlc3VsdCAhPT0gbnVsbCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHRhcmdldEluZGV4ID0gbmV4dFdvcmQodGFyZ2V0LCB0YXJnZXRJbmRleCArIDEpO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gY2xvbmVNYXRjaGVzKG1hdGNoZXM6IElNYXRjaFtdIHwgbnVsbCk6IElNYXRjaFtdIHwgbnVsbCB7XG5cdGlmIChtYXRjaGVzID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0Y29uc3QgcmVzdWx0OiBJTWF0Y2hbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IG0gb2YgbWF0Y2hlcykge1xuXHRcdHJlc3VsdC5wdXNoKHsgc3RhcnQ6IG0uc3RhcnQsIGVuZDogbS5lbmQgfSk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gX21hdGNoZXNXb3Jkcyh3b3JkOiBzdHJpbmcsIHRhcmdldDogc3RyaW5nLCB3b3JkSW5kZXg6IG51bWJlciwgdGFyZ2V0SW5kZXg6IG51bWJlciwgY29udGlndW91czogYm9vbGVhbiwgbWVtbzogTWFwPG51bWJlciwgSU1hdGNoW10gfCBudWxsPik6IElNYXRjaFtdIHwgbnVsbCB7XG5cdGlmICh3b3JkSW5kZXggPT09IHdvcmQubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9IGVsc2UgaWYgKHRhcmdldEluZGV4ID09PSB0YXJnZXQubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBtZW1vS2V5ID0gd29yZEluZGV4ICogKHRhcmdldC5sZW5ndGggKyAxKSArIHRhcmdldEluZGV4O1xuXHRjb25zdCBjYWNoZWQgPSBtZW1vLmdldChtZW1vS2V5KTtcblx0aWYgKGNhY2hlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Ly8gQ2FsbGVyIChgam9pbmApIG11dGF0ZXMgdGhlIHJldHVybmVkIGFycmF5LCBzbyBhbHdheXMgcmV0dXJuIGEgY2xvbmUuXG5cdFx0cmV0dXJuIGNsb25lTWF0Y2hlcyhjYWNoZWQpO1xuXHR9XG5cblx0Y29uc3QgY29tcHV0ZWQgPSBfbWF0Y2hlc1dvcmRzQ29tcHV0ZSh3b3JkLCB0YXJnZXQsIHdvcmRJbmRleCwgdGFyZ2V0SW5kZXgsIGNvbnRpZ3VvdXMsIG1lbW8pO1xuXHRtZW1vLnNldChtZW1vS2V5LCBjbG9uZU1hdGNoZXMoY29tcHV0ZWQpKTtcblx0cmV0dXJuIGNvbXB1dGVkO1xufVxuXG5mdW5jdGlvbiBfbWF0Y2hlc1dvcmRzQ29tcHV0ZSh3b3JkOiBzdHJpbmcsIHRhcmdldDogc3RyaW5nLCB3b3JkSW5kZXg6IG51bWJlciwgdGFyZ2V0SW5kZXg6IG51bWJlciwgY29udGlndW91czogYm9vbGVhbiwgbWVtbzogTWFwPG51bWJlciwgSU1hdGNoW10gfCBudWxsPik6IElNYXRjaFtdIHwgbnVsbCB7XG5cdGxldCB0YXJnZXRJbmRleE9mZnNldCA9IDA7XG5cblx0aWYgKCFjaGFyYWN0ZXJzTWF0Y2god29yZC5jaGFyQ29kZUF0KHdvcmRJbmRleCksIHRhcmdldC5jaGFyQ29kZUF0KHRhcmdldEluZGV4KSkpIHtcblx0XHQvLyBWZXJpZnkgYWx0ZXJuYXRlIGNoYXJhY3RlcnMgYmVmb3JlIGV4aXRpbmdcblx0XHRjb25zdCBhbHRDaGFycyA9IGdldEFsdGVybmF0ZUNvZGVzKHdvcmQuY2hhckNvZGVBdCh3b3JkSW5kZXgpKTtcblx0XHRpZiAoIWFsdENoYXJzKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Zm9yIChsZXQgayA9IDA7IGsgPCBhbHRDaGFycy5sZW5ndGg7IGsrKykge1xuXHRcdFx0aWYgKCFjaGFyYWN0ZXJzTWF0Y2goYWx0Q2hhcnNba10sIHRhcmdldC5jaGFyQ29kZUF0KHRhcmdldEluZGV4ICsgaykpKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0YXJnZXRJbmRleE9mZnNldCArPSBhbHRDaGFycy5sZW5ndGggLSAxO1xuXHR9XG5cblx0bGV0IHJlc3VsdDogSU1hdGNoW10gfCBudWxsID0gbnVsbDtcblx0bGV0IG5leHRXb3JkSW5kZXggPSB0YXJnZXRJbmRleCArIHRhcmdldEluZGV4T2Zmc2V0ICsgMTtcblx0cmVzdWx0ID0gX21hdGNoZXNXb3Jkcyh3b3JkLCB0YXJnZXQsIHdvcmRJbmRleCArIDEsIG5leHRXb3JkSW5kZXgsIGNvbnRpZ3VvdXMsIG1lbW8pO1xuXHRpZiAoIWNvbnRpZ3VvdXMpIHtcblx0XHR3aGlsZSAoIXJlc3VsdCAmJiAobmV4dFdvcmRJbmRleCA9IG5leHRXb3JkKHRhcmdldCwgbmV4dFdvcmRJbmRleCkpIDwgdGFyZ2V0Lmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0ID0gX21hdGNoZXNXb3Jkcyh3b3JkLCB0YXJnZXQsIHdvcmRJbmRleCArIDEsIG5leHRXb3JkSW5kZXgsIGNvbnRpZ3VvdXMsIG1lbW8pO1xuXHRcdFx0bmV4dFdvcmRJbmRleCsrO1xuXHRcdH1cblx0fVxuXG5cdGlmICghcmVzdWx0KSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvLyBJZiB0aGUgY2hhcmFjdGVycyBkb24ndCBleGFjdGx5IG1hdGNoLCB0aGVuIHRoZXkgbXVzdCBiZSB3b3JkIHNlcGFyYXRvcnMgKHNlZSBjaGFyYWN0ZXJzTWF0Y2goLi4uKSkuXG5cdC8vIFdlIGRvbid0IHdhbnQgdG8gaW5jbHVkZSB0aGlzIGluIHRoZSBtYXRjaGVzIGJ1dCB3ZSBkb24ndCB3YW50IHRvIHRocm93IHRoZSB0YXJnZXQgb3V0IGFsbCB0b2dldGhlciBzbyB3ZSByZXR1cm4gYHJlc3VsdGAuXG5cdGlmICh3b3JkLmNoYXJDb2RlQXQod29yZEluZGV4KSAhPT0gdGFyZ2V0LmNoYXJDb2RlQXQodGFyZ2V0SW5kZXgpKSB7XG5cdFx0Ly8gVmVyaWZ5IGFsdGVybmF0ZSBjaGFyYWN0ZXJzIGJlZm9yZSBleGl0aW5nXG5cdFx0Y29uc3QgYWx0Q2hhcnMgPSBnZXRBbHRlcm5hdGVDb2Rlcyh3b3JkLmNoYXJDb2RlQXQod29yZEluZGV4KSk7XG5cdFx0aWYgKCFhbHRDaGFycykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Zm9yIChsZXQgayA9IDA7IGsgPCBhbHRDaGFycy5sZW5ndGg7IGsrKykge1xuXHRcdFx0aWYgKGFsdENoYXJzW2tdICE9PSB0YXJnZXQuY2hhckNvZGVBdCh0YXJnZXRJbmRleCArIGspKSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGpvaW4oeyBzdGFydDogdGFyZ2V0SW5kZXgsIGVuZDogdGFyZ2V0SW5kZXggKyB0YXJnZXRJbmRleE9mZnNldCArIDEgfSwgcmVzdWx0KTtcbn1cblxuZnVuY3Rpb24gbmV4dFdvcmQod29yZDogc3RyaW5nLCBzdGFydDogbnVtYmVyKTogbnVtYmVyIHtcblx0Zm9yIChsZXQgaSA9IHN0YXJ0OyBpIDwgd29yZC5sZW5ndGg7IGkrKykge1xuXHRcdGlmIChpc1dvcmRTZXBhcmF0b3Iod29yZC5jaGFyQ29kZUF0KGkpKSB8fFxuXHRcdFx0KGkgPiAwICYmIGlzV29yZFNlcGFyYXRvcih3b3JkLmNoYXJDb2RlQXQoaSAtIDEpKSkpIHtcblx0XHRcdHJldHVybiBpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gd29yZC5sZW5ndGg7XG59XG5cbi8vIEZ1enp5XG5cbmNvbnN0IGZ1enp5Q29udGlndW91c0ZpbHRlciA9IG9yKG1hdGNoZXNQcmVmaXgsIG1hdGNoZXNDYW1lbENhc2UsIG1hdGNoZXNDb250aWd1b3VzU3ViU3RyaW5nKTtcbmNvbnN0IGZ1enp5U2VwYXJhdGVGaWx0ZXIgPSBvcihtYXRjaGVzUHJlZml4LCBtYXRjaGVzQ2FtZWxDYXNlLCBtYXRjaGVzU3ViU3RyaW5nKTtcbmNvbnN0IGZ1enp5UmVnRXhwQ2FjaGUgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBSZWdFeHA+KDEwMDAwKTsgLy8gYm91bmRlZCB0byAxMDAwMCBlbGVtZW50c1xuXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hlc0Z1enp5KHdvcmQ6IHN0cmluZywgd29yZFRvTWF0Y2hBZ2FpbnN0OiBzdHJpbmcsIGVuYWJsZVNlcGFyYXRlU3Vic3RyaW5nTWF0Y2hpbmcgPSBmYWxzZSk6IElNYXRjaFtdIHwgbnVsbCB7XG5cdGlmICh0eXBlb2Ygd29yZCAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIHdvcmRUb01hdGNoQWdhaW5zdCAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gbnVsbDsgLy8gcmV0dXJuIGVhcmx5IGZvciBpbnZhbGlkIGlucHV0XG5cdH1cblxuXHQvLyBGb3JtIFJlZ0V4cCBmb3Igd2lsZGNhcmQgbWF0Y2hlc1xuXHRsZXQgcmVnZXhwID0gZnV6enlSZWdFeHBDYWNoZS5nZXQod29yZCk7XG5cdGlmICghcmVnZXhwKSB7XG5cdFx0cmVnZXhwID0gbmV3IFJlZ0V4cChzdHJpbmdzLmNvbnZlcnRTaW1wbGUyUmVnRXhwUGF0dGVybih3b3JkKSwgJ2knKTtcblx0XHRmdXp6eVJlZ0V4cENhY2hlLnNldCh3b3JkLCByZWdleHApO1xuXHR9XG5cblx0Ly8gUmVnRXhwIEZpbHRlclxuXHRjb25zdCBtYXRjaCA9IHJlZ2V4cC5leGVjKHdvcmRUb01hdGNoQWdhaW5zdCk7XG5cdGlmIChtYXRjaCkge1xuXHRcdHJldHVybiBbeyBzdGFydDogbWF0Y2guaW5kZXgsIGVuZDogbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGggfV07XG5cdH1cblxuXHQvLyBEZWZhdWx0IEZpbHRlclxuXHRyZXR1cm4gZW5hYmxlU2VwYXJhdGVTdWJzdHJpbmdNYXRjaGluZyA/IGZ1enp5U2VwYXJhdGVGaWx0ZXIod29yZCwgd29yZFRvTWF0Y2hBZ2FpbnN0KSA6IGZ1enp5Q29udGlndW91c0ZpbHRlcih3b3JkLCB3b3JkVG9NYXRjaEFnYWluc3QpO1xufVxuXG4vKipcbiAqIE1hdGNoIHBhdHRlcm4gYWdhaW5zdCB3b3JkIGluIGEgZnV6enkgd2F5LiBBcyBpbiBJbnRlbGxpU2Vuc2UgYW5kIGZhc3RlciBhbmQgbW9yZVxuICogcG93ZXJmdWwgdGhhbiBgbWF0Y2hlc0Z1enp5YFxuICovXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hlc0Z1enp5MihwYXR0ZXJuOiBzdHJpbmcsIHdvcmQ6IHN0cmluZyk6IElNYXRjaFtdIHwgbnVsbCB7XG5cdGNvbnN0IHNjb3JlID0gZnV6enlTY29yZShwYXR0ZXJuLCBwYXR0ZXJuLnRvTG93ZXJDYXNlKCksIDAsIHdvcmQsIHdvcmQudG9Mb3dlckNhc2UoKSwgMCwgeyBmaXJzdE1hdGNoQ2FuQmVXZWFrOiB0cnVlLCBib29zdEZ1bGxNYXRjaDogdHJ1ZSB9KTtcblx0cmV0dXJuIHNjb3JlID8gY3JlYXRlTWF0Y2hlcyhzY29yZSkgOiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYW55U2NvcmUocGF0dGVybjogc3RyaW5nLCBsb3dQYXR0ZXJuOiBzdHJpbmcsIHBhdHRlcm5Qb3M6IG51bWJlciwgd29yZDogc3RyaW5nLCBsb3dXb3JkOiBzdHJpbmcsIHdvcmRQb3M6IG51bWJlcik6IEZ1enp5U2NvcmUge1xuXHRjb25zdCBtYXggPSBNYXRoLm1pbigxMywgcGF0dGVybi5sZW5ndGgpO1xuXHRmb3IgKDsgcGF0dGVyblBvcyA8IG1heDsgcGF0dGVyblBvcysrKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZnV6enlTY29yZShwYXR0ZXJuLCBsb3dQYXR0ZXJuLCBwYXR0ZXJuUG9zLCB3b3JkLCBsb3dXb3JkLCB3b3JkUG9zLCB7IGZpcnN0TWF0Y2hDYW5CZVdlYWs6IHRydWUsIGJvb3N0RnVsbE1hdGNoOiB0cnVlIH0pO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBbMCwgd29yZFBvc107XG59XG5cbi8vI3JlZ2lvbiAtLS0gZnV6enlTY29yZSAtLS1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU1hdGNoZXMoc2NvcmU6IHVuZGVmaW5lZCB8IEZ1enp5U2NvcmUpOiBJTWF0Y2hbXSB7XG5cdGlmICh0eXBlb2Ygc2NvcmUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IHJlczogSU1hdGNoW10gPSBbXTtcblx0Y29uc3Qgd29yZFBvcyA9IHNjb3JlWzFdO1xuXHRmb3IgKGxldCBpID0gc2NvcmUubGVuZ3RoIC0gMTsgaSA+IDE7IGktLSkge1xuXHRcdGNvbnN0IHBvcyA9IHNjb3JlW2ldICsgd29yZFBvcztcblx0XHRjb25zdCBsYXN0ID0gcmVzW3Jlcy5sZW5ndGggLSAxXTtcblx0XHRpZiAobGFzdCAmJiBsYXN0LmVuZCA9PT0gcG9zKSB7XG5cdFx0XHRsYXN0LmVuZCA9IHBvcyArIDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlcy5wdXNoKHsgc3RhcnQ6IHBvcywgZW5kOiBwb3MgKyAxIH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzO1xufVxuXG5jb25zdCBfbWF4TGVuID0gMTI4O1xuXG5mdW5jdGlvbiBpbml0VGFibGUoKSB7XG5cdGNvbnN0IHRhYmxlOiBudW1iZXJbXVtdID0gW107XG5cdGNvbnN0IHJvdzogbnVtYmVyW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPD0gX21heExlbjsgaSsrKSB7XG5cdFx0cm93W2ldID0gMDtcblx0fVxuXHRmb3IgKGxldCBpID0gMDsgaSA8PSBfbWF4TGVuOyBpKyspIHtcblx0XHR0YWJsZS5wdXNoKHJvdy5zbGljZSgwKSk7XG5cdH1cblx0cmV0dXJuIHRhYmxlO1xufVxuXG5mdW5jdGlvbiBpbml0QXJyKG1heExlbjogbnVtYmVyKSB7XG5cdGNvbnN0IHJvdzogbnVtYmVyW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPD0gbWF4TGVuOyBpKyspIHtcblx0XHRyb3dbaV0gPSAwO1xuXHR9XG5cdHJldHVybiByb3c7XG59XG5cbmNvbnN0IF9taW5Xb3JkTWF0Y2hQb3MgPSBpbml0QXJyKDIgKiBfbWF4TGVuKTsgLy8gbWluIHdvcmQgcG9zaXRpb24gZm9yIGEgY2VydGFpbiBwYXR0ZXJuIHBvc2l0aW9uXG5jb25zdCBfbWF4V29yZE1hdGNoUG9zID0gaW5pdEFycigyICogX21heExlbik7IC8vIG1heCB3b3JkIHBvc2l0aW9uIGZvciBhIGNlcnRhaW4gcGF0dGVybiBwb3NpdGlvblxuY29uc3QgX2RpYWcgPSBpbml0VGFibGUoKTsgLy8gdGhlIGxlbmd0aCBvZiBhIGNvbnRpZ3VvdXMgZGlhZ29uYWwgbWF0Y2hcbmNvbnN0IF90YWJsZSA9IGluaXRUYWJsZSgpO1xuY29uc3QgX2Fycm93cyA9IDxBcnJvd1tdW10+aW5pdFRhYmxlKCk7XG5jb25zdCBfZGVidWcgPSBmYWxzZTtcblxuZnVuY3Rpb24gcHJpbnRUYWJsZSh0YWJsZTogbnVtYmVyW11bXSwgcGF0dGVybjogc3RyaW5nLCBwYXR0ZXJuTGVuOiBudW1iZXIsIHdvcmQ6IHN0cmluZywgd29yZExlbjogbnVtYmVyKTogc3RyaW5nIHtcblx0ZnVuY3Rpb24gcGFkKHM6IHN0cmluZywgbjogbnVtYmVyLCBwYWQgPSAnICcpIHtcblx0XHR3aGlsZSAocy5sZW5ndGggPCBuKSB7XG5cdFx0XHRzID0gcGFkICsgcztcblx0XHR9XG5cdFx0cmV0dXJuIHM7XG5cdH1cblx0bGV0IHJldCA9IGAgfCAgIHwke3dvcmQuc3BsaXQoJycpLm1hcChjID0+IHBhZChjLCAzKSkuam9pbignfCcpfVxcbmA7XG5cblx0Zm9yIChsZXQgaSA9IDA7IGkgPD0gcGF0dGVybkxlbjsgaSsrKSB7XG5cdFx0aWYgKGkgPT09IDApIHtcblx0XHRcdHJldCArPSAnIHwnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXQgKz0gYCR7cGF0dGVybltpIC0gMV19fGA7XG5cdFx0fVxuXHRcdHJldCArPSB0YWJsZVtpXS5zbGljZSgwLCB3b3JkTGVuICsgMSkubWFwKG4gPT4gcGFkKG4udG9TdHJpbmcoKSwgMykpLmpvaW4oJ3wnKSArICdcXG4nO1xuXHR9XG5cdHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIHByaW50VGFibGVzKHBhdHRlcm46IHN0cmluZywgcGF0dGVyblN0YXJ0OiBudW1iZXIsIHdvcmQ6IHN0cmluZywgd29yZFN0YXJ0OiBudW1iZXIpOiB2b2lkIHtcblx0cGF0dGVybiA9IHBhdHRlcm4uc3Vic3RyKHBhdHRlcm5TdGFydCk7XG5cdHdvcmQgPSB3b3JkLnN1YnN0cih3b3JkU3RhcnQpO1xuXHRjb25zb2xlLmxvZyhwcmludFRhYmxlKF90YWJsZSwgcGF0dGVybiwgcGF0dGVybi5sZW5ndGgsIHdvcmQsIHdvcmQubGVuZ3RoKSk7XG5cdGNvbnNvbGUubG9nKHByaW50VGFibGUoX2Fycm93cywgcGF0dGVybiwgcGF0dGVybi5sZW5ndGgsIHdvcmQsIHdvcmQubGVuZ3RoKSk7XG5cdGNvbnNvbGUubG9nKHByaW50VGFibGUoX2RpYWcsIHBhdHRlcm4sIHBhdHRlcm4ubGVuZ3RoLCB3b3JkLCB3b3JkLmxlbmd0aCkpO1xufVxuXG5mdW5jdGlvbiBpc1NlcGFyYXRvckF0UG9zKHZhbHVlOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBib29sZWFuIHtcblx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB2YWx1ZS5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgY29kZSA9IHZhbHVlLmNvZGVQb2ludEF0KGluZGV4KTtcblx0c3dpdGNoIChjb2RlKSB7XG5cdFx0Y2FzZSBDaGFyQ29kZS5VbmRlcmxpbmU6XG5cdFx0Y2FzZSBDaGFyQ29kZS5EYXNoOlxuXHRcdGNhc2UgQ2hhckNvZGUuUGVyaW9kOlxuXHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6XG5cdFx0Y2FzZSBDaGFyQ29kZS5TbGFzaDpcblx0XHRjYXNlIENoYXJDb2RlLkJhY2tzbGFzaDpcblx0XHRjYXNlIENoYXJDb2RlLlNpbmdsZVF1b3RlOlxuXHRcdGNhc2UgQ2hhckNvZGUuRG91YmxlUXVvdGU6XG5cdFx0Y2FzZSBDaGFyQ29kZS5Db2xvbjpcblx0XHRjYXNlIENoYXJDb2RlLkRvbGxhclNpZ246XG5cdFx0Y2FzZSBDaGFyQ29kZS5MZXNzVGhhbjpcblx0XHRjYXNlIENoYXJDb2RlLkdyZWF0ZXJUaGFuOlxuXHRcdGNhc2UgQ2hhckNvZGUuT3BlblBhcmVuOlxuXHRcdGNhc2UgQ2hhckNvZGUuQ2xvc2VQYXJlbjpcblx0XHRjYXNlIENoYXJDb2RlLk9wZW5TcXVhcmVCcmFja2V0OlxuXHRcdGNhc2UgQ2hhckNvZGUuQ2xvc2VTcXVhcmVCcmFja2V0OlxuXHRcdGNhc2UgQ2hhckNvZGUuT3BlbkN1cmx5QnJhY2U6XG5cdFx0Y2FzZSBDaGFyQ29kZS5DbG9zZUN1cmx5QnJhY2U6XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRjYXNlIHVuZGVmaW5lZDpcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0aWYgKHN0cmluZ3MuaXNFbW9qaUltcHJlY2lzZShjb2RlKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1doaXRlc3BhY2VBdFBvcyh2YWx1ZTogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdmFsdWUubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGNvZGUgPSB2YWx1ZS5jaGFyQ29kZUF0KGluZGV4KTtcblx0c3dpdGNoIChjb2RlKSB7XG5cdFx0Y2FzZSBDaGFyQ29kZS5TcGFjZTpcblx0XHRjYXNlIENoYXJDb2RlLlRhYjpcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNVcHBlckNhc2VBdFBvcyhwb3M6IG51bWJlciwgd29yZDogc3RyaW5nLCB3b3JkTG93OiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHdvcmRbcG9zXSAhPT0gd29yZExvd1twb3NdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNQYXR0ZXJuSW5Xb3JkKHBhdHRlcm5Mb3c6IHN0cmluZywgcGF0dGVyblBvczogbnVtYmVyLCBwYXR0ZXJuTGVuOiBudW1iZXIsIHdvcmRMb3c6IHN0cmluZywgd29yZFBvczogbnVtYmVyLCB3b3JkTGVuOiBudW1iZXIsIGZpbGxNaW5Xb3JkUG9zQXJyID0gZmFsc2UpOiBib29sZWFuIHtcblx0d2hpbGUgKHBhdHRlcm5Qb3MgPCBwYXR0ZXJuTGVuICYmIHdvcmRQb3MgPCB3b3JkTGVuKSB7XG5cdFx0aWYgKHBhdHRlcm5Mb3dbcGF0dGVyblBvc10gPT09IHdvcmRMb3dbd29yZFBvc10pIHtcblx0XHRcdGlmIChmaWxsTWluV29yZFBvc0Fycikge1xuXHRcdFx0XHQvLyBSZW1lbWJlciB0aGUgbWluIHdvcmQgcG9zaXRpb24gZm9yIGVhY2ggcGF0dGVybiBwb3NpdGlvblxuXHRcdFx0XHRfbWluV29yZE1hdGNoUG9zW3BhdHRlcm5Qb3NdID0gd29yZFBvcztcblx0XHRcdH1cblx0XHRcdHBhdHRlcm5Qb3MgKz0gMTtcblx0XHR9XG5cdFx0d29yZFBvcyArPSAxO1xuXHR9XG5cdHJldHVybiBwYXR0ZXJuUG9zID09PSBwYXR0ZXJuTGVuOyAvLyBwYXR0ZXJuIG11c3QgYmUgZXhoYXVzdGVkXG59XG5cbmNvbnN0IGVudW0gQXJyb3cgeyBEaWFnID0gMSwgTGVmdCA9IDIsIExlZnRMZWZ0ID0gMyB9XG5cbi8qKlxuICogQW4gYXJyYXkgcmVwcmVzZW50aW5nIGEgZnV6enkgbWF0Y2guXG4gKlxuICogMC4gdGhlIHNjb3JlXG4gKiAxLiB0aGUgb2Zmc2V0IGF0IHdoaWNoIG1hdGNoaW5nIHN0YXJ0ZWRcbiAqIDIuIGA8bWF0Y2hfcG9zX04+YFxuICogMy4gYDxtYXRjaF9wb3NfMT5gXG4gKiA0LiBgPG1hdGNoX3Bvc18wPmAgZXRjXG4gKi9cbmV4cG9ydCB0eXBlIEZ1enp5U2NvcmUgPSBbc2NvcmU6IG51bWJlciwgd29yZFN0YXJ0OiBudW1iZXIsIC4uLm1hdGNoZXM6IG51bWJlcltdXTtcblxuZXhwb3J0IG5hbWVzcGFjZSBGdXp6eVNjb3JlIHtcblx0LyoqXG5cdCAqIE5vIG1hdGNoZXMgYW5kIHZhbHVlIGAtMTAwYFxuXHQgKi9cblx0ZXhwb3J0IGNvbnN0IERlZmF1bHQ6IEZ1enp5U2NvcmUgPSAoWy0xMDAsIDBdKTtcblxuXHRleHBvcnQgZnVuY3Rpb24gaXNEZWZhdWx0KHNjb3JlPzogRnV6enlTY29yZSk6IHNjb3JlIGlzIFstMTAwLCAwXSB7XG5cdFx0cmV0dXJuICFzY29yZSB8fCAoc2NvcmUubGVuZ3RoID09PSAyICYmIHNjb3JlWzBdID09PSAtMTAwICYmIHNjb3JlWzFdID09PSAwKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRnV6enlTY29yZU9wdGlvbnMge1xuXG5cdHN0YXRpYyBkZWZhdWx0ID0geyBib29zdEZ1bGxNYXRjaDogdHJ1ZSwgZmlyc3RNYXRjaENhbkJlV2VhazogZmFsc2UgfTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBmaXJzdE1hdGNoQ2FuQmVXZWFrOiBib29sZWFuLFxuXHRcdHJlYWRvbmx5IGJvb3N0RnVsbE1hdGNoOiBib29sZWFuLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEZ1enp5U2NvcmVyIHtcblx0KHBhdHRlcm46IHN0cmluZywgbG93UGF0dGVybjogc3RyaW5nLCBwYXR0ZXJuUG9zOiBudW1iZXIsIHdvcmQ6IHN0cmluZywgbG93V29yZDogc3RyaW5nLCB3b3JkUG9zOiBudW1iZXIsIG9wdGlvbnM/OiBGdXp6eVNjb3JlT3B0aW9ucyk6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmdXp6eVNjb3JlKHBhdHRlcm46IHN0cmluZywgcGF0dGVybkxvdzogc3RyaW5nLCBwYXR0ZXJuU3RhcnQ6IG51bWJlciwgd29yZDogc3RyaW5nLCB3b3JkTG93OiBzdHJpbmcsIHdvcmRTdGFydDogbnVtYmVyLCBvcHRpb25zOiBGdXp6eVNjb3JlT3B0aW9ucyA9IEZ1enp5U2NvcmVPcHRpb25zLmRlZmF1bHQpOiBGdXp6eVNjb3JlIHwgdW5kZWZpbmVkIHtcblxuXHRjb25zdCBwYXR0ZXJuTGVuID0gcGF0dGVybi5sZW5ndGggPiBfbWF4TGVuID8gX21heExlbiA6IHBhdHRlcm4ubGVuZ3RoO1xuXHRjb25zdCB3b3JkTGVuID0gd29yZC5sZW5ndGggPiBfbWF4TGVuID8gX21heExlbiA6IHdvcmQubGVuZ3RoO1xuXG5cdGlmIChwYXR0ZXJuU3RhcnQgPj0gcGF0dGVybkxlbiB8fCB3b3JkU3RhcnQgPj0gd29yZExlbiB8fCAocGF0dGVybkxlbiAtIHBhdHRlcm5TdGFydCkgPiAod29yZExlbiAtIHdvcmRTdGFydCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gUnVuIGEgc2ltcGxlIGNoZWNrIGlmIHRoZSBjaGFyYWN0ZXJzIG9mIHBhdHRlcm4gb2NjdXJcblx0Ly8gKGluIG9yZGVyKSBhdCBhbGwgaW4gd29yZC4gSWYgdGhhdCBpc24ndCB0aGUgY2FzZSB3ZVxuXHQvLyBzdG9wIGJlY2F1c2Ugbm8gbWF0Y2ggd2lsbCBiZSBwb3NzaWJsZVxuXHRpZiAoIWlzUGF0dGVybkluV29yZChwYXR0ZXJuTG93LCBwYXR0ZXJuU3RhcnQsIHBhdHRlcm5MZW4sIHdvcmRMb3csIHdvcmRTdGFydCwgd29yZExlbiwgdHJ1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gRmluZCB0aGUgbWF4IG1hdGNoaW5nIHdvcmQgcG9zaXRpb24gZm9yIGVhY2ggcGF0dGVybiBwb3NpdGlvblxuXHQvLyBOT1RFOiB0aGUgbWluIG1hdGNoaW5nIHdvcmQgcG9zaXRpb24gd2FzIGZpbGxlZCBpbiBhYm92ZSwgaW4gdGhlIGBpc1BhdHRlcm5JbldvcmRgIGNhbGxcblx0X2ZpbGxJbk1heFdvcmRNYXRjaFBvcyhwYXR0ZXJuTGVuLCB3b3JkTGVuLCBwYXR0ZXJuU3RhcnQsIHdvcmRTdGFydCwgcGF0dGVybkxvdywgd29yZExvdyk7XG5cblx0bGV0IHJvdzogbnVtYmVyID0gMTtcblx0bGV0IGNvbHVtbjogbnVtYmVyID0gMTtcblx0bGV0IHBhdHRlcm5Qb3MgPSBwYXR0ZXJuU3RhcnQ7XG5cdGxldCB3b3JkUG9zID0gd29yZFN0YXJ0O1xuXG5cdGNvbnN0IGhhc1N0cm9uZ0ZpcnN0TWF0Y2ggPSBbZmFsc2VdO1xuXG5cdC8vIFRoZXJlIHdpbGwgYmUgYSBtYXRjaCwgZmlsbCBpbiB0YWJsZXNcblx0Zm9yIChyb3cgPSAxLCBwYXR0ZXJuUG9zID0gcGF0dGVyblN0YXJ0OyBwYXR0ZXJuUG9zIDwgcGF0dGVybkxlbjsgcm93KyssIHBhdHRlcm5Qb3MrKykge1xuXG5cdFx0Ly8gUmVkdWNlIHNlYXJjaCBzcGFjZSB0byBwb3NzaWJsZSBtYXRjaGluZyB3b3JkIHBvc2l0aW9ucyBhbmQgdG8gcG9zc2libGUgYWNjZXNzIGZyb20gbmV4dCByb3dcblx0XHRjb25zdCBtaW5Xb3JkTWF0Y2hQb3MgPSBfbWluV29yZE1hdGNoUG9zW3BhdHRlcm5Qb3NdO1xuXHRcdGNvbnN0IG1heFdvcmRNYXRjaFBvcyA9IF9tYXhXb3JkTWF0Y2hQb3NbcGF0dGVyblBvc107XG5cdFx0Y29uc3QgbmV4dE1heFdvcmRNYXRjaFBvcyA9IChwYXR0ZXJuUG9zICsgMSA8IHBhdHRlcm5MZW4gPyBfbWF4V29yZE1hdGNoUG9zW3BhdHRlcm5Qb3MgKyAxXSA6IHdvcmRMZW4pO1xuXG5cdFx0Zm9yIChjb2x1bW4gPSBtaW5Xb3JkTWF0Y2hQb3MgLSB3b3JkU3RhcnQgKyAxLCB3b3JkUG9zID0gbWluV29yZE1hdGNoUG9zOyB3b3JkUG9zIDwgbmV4dE1heFdvcmRNYXRjaFBvczsgY29sdW1uKyssIHdvcmRQb3MrKykge1xuXG5cdFx0XHRsZXQgc2NvcmUgPSBOdW1iZXIuTUlOX1NBRkVfSU5URUdFUjtcblx0XHRcdGxldCBjYW5Db21lRGlhZyA9IGZhbHNlO1xuXG5cdFx0XHRpZiAod29yZFBvcyA8PSBtYXhXb3JkTWF0Y2hQb3MpIHtcblx0XHRcdFx0c2NvcmUgPSBfZG9TY29yZShcblx0XHRcdFx0XHRwYXR0ZXJuLCBwYXR0ZXJuTG93LCBwYXR0ZXJuUG9zLCBwYXR0ZXJuU3RhcnQsXG5cdFx0XHRcdFx0d29yZCwgd29yZExvdywgd29yZFBvcywgd29yZExlbiwgd29yZFN0YXJ0LFxuXHRcdFx0XHRcdF9kaWFnW3JvdyAtIDFdW2NvbHVtbiAtIDFdID09PSAwLFxuXHRcdFx0XHRcdGhhc1N0cm9uZ0ZpcnN0TWF0Y2hcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGRpYWdTY29yZSA9IDA7XG5cdFx0XHRpZiAoc2NvcmUgIT09IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSKSB7XG5cdFx0XHRcdGNhbkNvbWVEaWFnID0gdHJ1ZTtcblx0XHRcdFx0ZGlhZ1Njb3JlID0gc2NvcmUgKyBfdGFibGVbcm93IC0gMV1bY29sdW1uIC0gMV07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNhbkNvbWVMZWZ0ID0gd29yZFBvcyA+IG1pbldvcmRNYXRjaFBvcztcblx0XHRcdGNvbnN0IGxlZnRTY29yZSA9IGNhbkNvbWVMZWZ0ID8gX3RhYmxlW3Jvd11bY29sdW1uIC0gMV0gKyAoX2RpYWdbcm93XVtjb2x1bW4gLSAxXSA+IDAgPyAtNSA6IDApIDogMDsgLy8gcGVuYWx0eSBmb3IgYSBnYXAgc3RhcnRcblxuXHRcdFx0Y29uc3QgY2FuQ29tZUxlZnRMZWZ0ID0gd29yZFBvcyA+IG1pbldvcmRNYXRjaFBvcyArIDEgJiYgX2RpYWdbcm93XVtjb2x1bW4gLSAxXSA+IDA7XG5cdFx0XHRjb25zdCBsZWZ0TGVmdFNjb3JlID0gY2FuQ29tZUxlZnRMZWZ0ID8gX3RhYmxlW3Jvd11bY29sdW1uIC0gMl0gKyAoX2RpYWdbcm93XVtjb2x1bW4gLSAyXSA+IDAgPyAtNSA6IDApIDogMDsgLy8gcGVuYWx0eSBmb3IgYSBnYXAgc3RhcnRcblxuXHRcdFx0aWYgKGNhbkNvbWVMZWZ0TGVmdCAmJiAoIWNhbkNvbWVMZWZ0IHx8IGxlZnRMZWZ0U2NvcmUgPj0gbGVmdFNjb3JlKSAmJiAoIWNhbkNvbWVEaWFnIHx8IGxlZnRMZWZ0U2NvcmUgPj0gZGlhZ1Njb3JlKSkge1xuXHRcdFx0XHQvLyBhbHdheXMgcHJlZmVyIGNob29zaW5nIGxlZnQgbGVmdCB0byBqdW1wIG92ZXIgYSBkaWFnb25hbCBiZWNhdXNlIHRoYXQgbWVhbnMgYSBtYXRjaCBpcyBlYXJsaWVyIGluIHRoZSB3b3JkXG5cdFx0XHRcdF90YWJsZVtyb3ddW2NvbHVtbl0gPSBsZWZ0TGVmdFNjb3JlO1xuXHRcdFx0XHRfYXJyb3dzW3Jvd11bY29sdW1uXSA9IEFycm93LkxlZnRMZWZ0O1xuXHRcdFx0XHRfZGlhZ1tyb3ddW2NvbHVtbl0gPSAwO1xuXHRcdFx0fSBlbHNlIGlmIChjYW5Db21lTGVmdCAmJiAoIWNhbkNvbWVEaWFnIHx8IGxlZnRTY29yZSA+PSBkaWFnU2NvcmUpKSB7XG5cdFx0XHRcdC8vIGFsd2F5cyBwcmVmZXIgY2hvb3NpbmcgbGVmdCBzaW5jZSB0aGF0IG1lYW5zIGEgbWF0Y2ggaXMgZWFybGllciBpbiB0aGUgd29yZFxuXHRcdFx0XHRfdGFibGVbcm93XVtjb2x1bW5dID0gbGVmdFNjb3JlO1xuXHRcdFx0XHRfYXJyb3dzW3Jvd11bY29sdW1uXSA9IEFycm93LkxlZnQ7XG5cdFx0XHRcdF9kaWFnW3Jvd11bY29sdW1uXSA9IDA7XG5cdFx0XHR9IGVsc2UgaWYgKGNhbkNvbWVEaWFnKSB7XG5cdFx0XHRcdF90YWJsZVtyb3ddW2NvbHVtbl0gPSBkaWFnU2NvcmU7XG5cdFx0XHRcdF9hcnJvd3Nbcm93XVtjb2x1bW5dID0gQXJyb3cuRGlhZztcblx0XHRcdFx0X2RpYWdbcm93XVtjb2x1bW5dID0gX2RpYWdbcm93IC0gMV1bY29sdW1uIC0gMV0gKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBub3QgcG9zc2libGVgKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoX2RlYnVnKSB7XG5cdFx0cHJpbnRUYWJsZXMocGF0dGVybiwgcGF0dGVyblN0YXJ0LCB3b3JkLCB3b3JkU3RhcnQpO1xuXHR9XG5cblx0aWYgKCFoYXNTdHJvbmdGaXJzdE1hdGNoWzBdICYmICFvcHRpb25zLmZpcnN0TWF0Y2hDYW5CZVdlYWspIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cm93LS07XG5cdGNvbHVtbi0tO1xuXG5cdGNvbnN0IHJlc3VsdDogRnV6enlTY29yZSA9IFtfdGFibGVbcm93XVtjb2x1bW5dLCB3b3JkU3RhcnRdO1xuXG5cdGxldCBiYWNrd2FyZHNEaWFnTGVuZ3RoID0gMDtcblx0bGV0IG1heE1hdGNoQ29sdW1uID0gMDtcblxuXHR3aGlsZSAocm93ID49IDEpIHtcblx0XHQvLyBGaW5kIHRoZSBjb2x1bW4gd2hlcmUgd2UgZ28gZGlhZ29uYWxseSB1cFxuXHRcdGxldCBkaWFnQ29sdW1uID0gY29sdW1uO1xuXHRcdGRvIHtcblx0XHRcdGNvbnN0IGFycm93ID0gX2Fycm93c1tyb3ddW2RpYWdDb2x1bW5dO1xuXHRcdFx0aWYgKGFycm93ID09PSBBcnJvdy5MZWZ0TGVmdCkge1xuXHRcdFx0XHRkaWFnQ29sdW1uID0gZGlhZ0NvbHVtbiAtIDI7XG5cdFx0XHR9IGVsc2UgaWYgKGFycm93ID09PSBBcnJvdy5MZWZ0KSB7XG5cdFx0XHRcdGRpYWdDb2x1bW4gPSBkaWFnQ29sdW1uIC0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGZvdW5kIHRoZSBkaWFnb25hbFxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9IHdoaWxlIChkaWFnQ29sdW1uID49IDEpO1xuXG5cdFx0Ly8gT3ZlcnR1cm4gdGhlIFwiZm9yd2FyZHNcIiBkZWNpc2lvbiBpZiBrZWVwaW5nIHRoZSBcImJhY2t3YXJkc1wiIGRpYWdvbmFsIHdvdWxkIGdpdmUgYSBiZXR0ZXIgbWF0Y2hcblx0XHRpZiAoXG5cdFx0XHRiYWNrd2FyZHNEaWFnTGVuZ3RoID4gMSAvLyBvbmx5IGlmIHdlIHdvdWxkIGhhdmUgYSBjb250aWd1b3VzIG1hdGNoIG9mIDMgY2hhcmFjdGVyc1xuXHRcdFx0JiYgcGF0dGVybkxvd1twYXR0ZXJuU3RhcnQgKyByb3cgLSAxXSA9PT0gd29yZExvd1t3b3JkU3RhcnQgKyBjb2x1bW4gLSAxXSAvLyBvbmx5IGlmIHdlIGNhbiBkbyBhIGNvbnRpZ3VvdXMgbWF0Y2ggZGlhZ29uYWxseVxuXHRcdFx0JiYgIWlzVXBwZXJDYXNlQXRQb3MoZGlhZ0NvbHVtbiArIHdvcmRTdGFydCAtIDEsIHdvcmQsIHdvcmRMb3cpIC8vIG9ubHkgaWYgdGhlIGZvcndhcmRzIGNob3NlIGRpYWdvbmFsIGlzIG5vdCBhbiB1cHBlcmNhc2Vcblx0XHRcdCYmIGJhY2t3YXJkc0RpYWdMZW5ndGggKyAxID4gX2RpYWdbcm93XVtkaWFnQ29sdW1uXSAvLyBvbmx5IGlmIG91ciBjb250aWd1b3VzIG1hdGNoIHdvdWxkIGJlIGxvbmdlciB0aGFuIHRoZSBcImZvcndhcmRzXCIgY29udGlndW91cyBtYXRjaFxuXHRcdCkge1xuXHRcdFx0ZGlhZ0NvbHVtbiA9IGNvbHVtbjtcblx0XHR9XG5cblx0XHRpZiAoZGlhZ0NvbHVtbiA9PT0gY29sdW1uKSB7XG5cdFx0XHQvLyB0aGlzIGlzIGEgY29udGlndW91cyBtYXRjaFxuXHRcdFx0YmFja3dhcmRzRGlhZ0xlbmd0aCsrO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRiYWNrd2FyZHNEaWFnTGVuZ3RoID0gMTtcblx0XHR9XG5cblx0XHRpZiAoIW1heE1hdGNoQ29sdW1uKSB7XG5cdFx0XHQvLyByZW1lbWJlciB0aGUgbGFzdCBtYXRjaGVkIGNvbHVtblxuXHRcdFx0bWF4TWF0Y2hDb2x1bW4gPSBkaWFnQ29sdW1uO1xuXHRcdH1cblxuXHRcdHJvdy0tO1xuXHRcdGNvbHVtbiA9IGRpYWdDb2x1bW4gLSAxO1xuXHRcdHJlc3VsdC5wdXNoKGNvbHVtbik7XG5cdH1cblxuXHRpZiAod29yZExlbiAtIHdvcmRTdGFydCA9PT0gcGF0dGVybkxlbiAmJiBvcHRpb25zLmJvb3N0RnVsbE1hdGNoKSB7XG5cdFx0Ly8gdGhlIHdvcmQgbWF0Y2hlcyB0aGUgcGF0dGVybiB3aXRoIGFsbCBjaGFyYWN0ZXJzIVxuXHRcdC8vIGdpdmluZyB0aGUgc2NvcmUgYSB0b3RhbCBtYXRjaCBib29zdCAodG8gY29tZSB1cCBhaGVhZCBvdGhlciB3b3Jkcylcblx0XHRyZXN1bHRbMF0gKz0gMjtcblx0fVxuXG5cdC8vIEFkZCAxIHBlbmFsdHkgZm9yIGVhY2ggc2tpcHBlZCBjaGFyYWN0ZXIgaW4gdGhlIHdvcmRcblx0Y29uc3Qgc2tpcHBlZENoYXJzQ291bnQgPSBtYXhNYXRjaENvbHVtbiAtIHBhdHRlcm5MZW47XG5cdHJlc3VsdFswXSAtPSBza2lwcGVkQ2hhcnNDb3VudDtcblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBfZmlsbEluTWF4V29yZE1hdGNoUG9zKHBhdHRlcm5MZW46IG51bWJlciwgd29yZExlbjogbnVtYmVyLCBwYXR0ZXJuU3RhcnQ6IG51bWJlciwgd29yZFN0YXJ0OiBudW1iZXIsIHBhdHRlcm5Mb3c6IHN0cmluZywgd29yZExvdzogc3RyaW5nKSB7XG5cdGxldCBwYXR0ZXJuUG9zID0gcGF0dGVybkxlbiAtIDE7XG5cdGxldCB3b3JkUG9zID0gd29yZExlbiAtIDE7XG5cdHdoaWxlIChwYXR0ZXJuUG9zID49IHBhdHRlcm5TdGFydCAmJiB3b3JkUG9zID49IHdvcmRTdGFydCkge1xuXHRcdGlmIChwYXR0ZXJuTG93W3BhdHRlcm5Qb3NdID09PSB3b3JkTG93W3dvcmRQb3NdKSB7XG5cdFx0XHRfbWF4V29yZE1hdGNoUG9zW3BhdHRlcm5Qb3NdID0gd29yZFBvcztcblx0XHRcdHBhdHRlcm5Qb3MtLTtcblx0XHR9XG5cdFx0d29yZFBvcy0tO1xuXHR9XG59XG5cbmZ1bmN0aW9uIF9kb1Njb3JlKFxuXHRwYXR0ZXJuOiBzdHJpbmcsIHBhdHRlcm5Mb3c6IHN0cmluZywgcGF0dGVyblBvczogbnVtYmVyLCBwYXR0ZXJuU3RhcnQ6IG51bWJlcixcblx0d29yZDogc3RyaW5nLCB3b3JkTG93OiBzdHJpbmcsIHdvcmRQb3M6IG51bWJlciwgd29yZExlbjogbnVtYmVyLCB3b3JkU3RhcnQ6IG51bWJlcixcblx0bmV3TWF0Y2hTdGFydDogYm9vbGVhbixcblx0b3V0Rmlyc3RNYXRjaFN0cm9uZzogYm9vbGVhbltdLFxuKTogbnVtYmVyIHtcblx0aWYgKHBhdHRlcm5Mb3dbcGF0dGVyblBvc10gIT09IHdvcmRMb3dbd29yZFBvc10pIHtcblx0XHRyZXR1cm4gTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVI7XG5cdH1cblxuXHRsZXQgc2NvcmUgPSAxO1xuXHRsZXQgaXNHYXBMb2NhdGlvbiA9IGZhbHNlO1xuXHRpZiAod29yZFBvcyA9PT0gKHBhdHRlcm5Qb3MgLSBwYXR0ZXJuU3RhcnQpKSB7XG5cdFx0Ly8gY29tbW9uIHByZWZpeDogYGZvb2JhciA8LT4gZm9vYmF6YFxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgIF5eXl5eXG5cdFx0c2NvcmUgPSBwYXR0ZXJuW3BhdHRlcm5Qb3NdID09PSB3b3JkW3dvcmRQb3NdID8gNyA6IDU7XG5cblx0fSBlbHNlIGlmIChpc1VwcGVyQ2FzZUF0UG9zKHdvcmRQb3MsIHdvcmQsIHdvcmRMb3cpICYmICh3b3JkUG9zID09PSAwIHx8ICFpc1VwcGVyQ2FzZUF0UG9zKHdvcmRQb3MgLSAxLCB3b3JkLCB3b3JkTG93KSkpIHtcblx0XHQvLyBoaXR0aW5nIHVwcGVyLWNhc2U6IGBmb28gPC0+IGZvck90aGVyc2Bcblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF5eIF5cblx0XHRzY29yZSA9IHBhdHRlcm5bcGF0dGVyblBvc10gPT09IHdvcmRbd29yZFBvc10gPyA3IDogNTtcblx0XHRpc0dhcExvY2F0aW9uID0gdHJ1ZTtcblxuXHR9IGVsc2UgaWYgKGlzU2VwYXJhdG9yQXRQb3Mod29yZExvdywgd29yZFBvcykgJiYgKHdvcmRQb3MgPT09IDAgfHwgIWlzU2VwYXJhdG9yQXRQb3Mod29yZExvdywgd29yZFBvcyAtIDEpKSkge1xuXHRcdC8vIGhpdHRpbmcgYSBzZXBhcmF0b3I6IGAuIDwtPiBmb28uYmFyYFxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBeXG5cdFx0c2NvcmUgPSA1O1xuXG5cdH0gZWxzZSBpZiAoaXNTZXBhcmF0b3JBdFBvcyh3b3JkTG93LCB3b3JkUG9zIC0gMSkgfHwgaXNXaGl0ZXNwYWNlQXRQb3Mod29yZExvdywgd29yZFBvcyAtIDEpKSB7XG5cdFx0Ly8gcG9zdCBzZXBhcmF0b3I6IGBmb28gPC0+IGJhcl9mb29gXG5cdFx0Ly8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICBeXl5cblx0XHRzY29yZSA9IDU7XG5cdFx0aXNHYXBMb2NhdGlvbiA9IHRydWU7XG5cdH1cblxuXHRpZiAoc2NvcmUgPiAxICYmIHBhdHRlcm5Qb3MgPT09IHBhdHRlcm5TdGFydCkge1xuXHRcdG91dEZpcnN0TWF0Y2hTdHJvbmdbMF0gPSB0cnVlO1xuXHR9XG5cblx0aWYgKCFpc0dhcExvY2F0aW9uKSB7XG5cdFx0aXNHYXBMb2NhdGlvbiA9IGlzVXBwZXJDYXNlQXRQb3Mod29yZFBvcywgd29yZCwgd29yZExvdykgfHwgaXNTZXBhcmF0b3JBdFBvcyh3b3JkTG93LCB3b3JkUG9zIC0gMSkgfHwgaXNXaGl0ZXNwYWNlQXRQb3Mod29yZExvdywgd29yZFBvcyAtIDEpO1xuXHR9XG5cblx0Ly9cblx0aWYgKHBhdHRlcm5Qb3MgPT09IHBhdHRlcm5TdGFydCkgeyAvLyBmaXJzdCBjaGFyYWN0ZXIgaW4gcGF0dGVyblxuXHRcdGlmICh3b3JkUG9zID4gd29yZFN0YXJ0KSB7XG5cdFx0XHQvLyB0aGUgZmlyc3QgcGF0dGVybiBjaGFyYWN0ZXIgd291bGQgbWF0Y2ggYSB3b3JkIGNoYXJhY3RlciB0aGF0IGlzIG5vdCBhdCB0aGUgd29yZCBzdGFydFxuXHRcdFx0Ly8gc28gaW50cm9kdWNlIGEgcGVuYWx0eSB0byBhY2NvdW50IGZvciB0aGUgZ2FwIHByZWNlZGluZyB0aGlzIG1hdGNoXG5cdFx0XHRzY29yZSAtPSBpc0dhcExvY2F0aW9uID8gMyA6IDU7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGlmIChuZXdNYXRjaFN0YXJ0KSB7XG5cdFx0XHQvLyB0aGlzIHdvdWxkIGJlIHRoZSBiZWdpbm5pbmcgb2YgYSBuZXcgbWF0Y2ggKGkuZS4gdGhlcmUgd291bGQgYmUgYSBnYXAgYmVmb3JlIHRoaXMgbG9jYXRpb24pXG5cdFx0XHRzY29yZSArPSBpc0dhcExvY2F0aW9uID8gMiA6IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIHRoaXMgaXMgcGFydCBvZiBhIGNvbnRpZ3VvdXMgbWF0Y2gsIHNvIGdpdmUgaXQgYSBzbGlnaHQgYm9udXMsIGJ1dCBkbyBzbyBvbmx5IGlmIGl0IHdvdWxkIG5vdCBiZSBhIHByZWZlcnJlZCBnYXAgbG9jYXRpb25cblx0XHRcdHNjb3JlICs9IGlzR2FwTG9jYXRpb24gPyAwIDogMTtcblx0XHR9XG5cdH1cblxuXHRpZiAod29yZFBvcyArIDEgPT09IHdvcmRMZW4pIHtcblx0XHQvLyB3ZSBhbHdheXMgcGVuYWxpemUgZ2FwcywgYnV0IHRoaXMgZ2l2ZXMgdW5mYWlyIGFkdmFudGFnZXMgdG8gYSBtYXRjaCB0aGF0IHdvdWxkIG1hdGNoIHRoZSBsYXN0IGNoYXJhY3RlciBpbiB0aGUgd29yZFxuXHRcdC8vIHNvIHByZXRlbmQgdGhlcmUgaXMgYSBnYXAgYWZ0ZXIgdGhlIGxhc3QgY2hhcmFjdGVyIGluIHRoZSB3b3JkIHRvIG5vcm1hbGl6ZSB0aGluZ3Ncblx0XHRzY29yZSAtPSBpc0dhcExvY2F0aW9uID8gMyA6IDU7XG5cdH1cblxuXHRyZXR1cm4gc2NvcmU7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG5cbi8vI3JlZ2lvbiAtLS0gZ3JhY2VmdWwgLS0tXG5cbmV4cG9ydCBmdW5jdGlvbiBmdXp6eVNjb3JlR3JhY2VmdWxBZ2dyZXNzaXZlKHBhdHRlcm46IHN0cmluZywgbG93UGF0dGVybjogc3RyaW5nLCBwYXR0ZXJuUG9zOiBudW1iZXIsIHdvcmQ6IHN0cmluZywgbG93V29yZDogc3RyaW5nLCB3b3JkUG9zOiBudW1iZXIsIG9wdGlvbnM/OiBGdXp6eVNjb3JlT3B0aW9ucyk6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZnV6enlTY29yZVdpdGhQZXJtdXRhdGlvbnMocGF0dGVybiwgbG93UGF0dGVybiwgcGF0dGVyblBvcywgd29yZCwgbG93V29yZCwgd29yZFBvcywgdHJ1ZSwgb3B0aW9ucyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmdXp6eVNjb3JlR3JhY2VmdWwocGF0dGVybjogc3RyaW5nLCBsb3dQYXR0ZXJuOiBzdHJpbmcsIHBhdHRlcm5Qb3M6IG51bWJlciwgd29yZDogc3RyaW5nLCBsb3dXb3JkOiBzdHJpbmcsIHdvcmRQb3M6IG51bWJlciwgb3B0aW9ucz86IEZ1enp5U2NvcmVPcHRpb25zKTogRnV6enlTY29yZSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBmdXp6eVNjb3JlV2l0aFBlcm11dGF0aW9ucyhwYXR0ZXJuLCBsb3dQYXR0ZXJuLCBwYXR0ZXJuUG9zLCB3b3JkLCBsb3dXb3JkLCB3b3JkUG9zLCBmYWxzZSwgb3B0aW9ucyk7XG59XG5cbmZ1bmN0aW9uIGZ1enp5U2NvcmVXaXRoUGVybXV0YXRpb25zKHBhdHRlcm46IHN0cmluZywgbG93UGF0dGVybjogc3RyaW5nLCBwYXR0ZXJuUG9zOiBudW1iZXIsIHdvcmQ6IHN0cmluZywgbG93V29yZDogc3RyaW5nLCB3b3JkUG9zOiBudW1iZXIsIGFnZ3Jlc3NpdmU6IGJvb2xlYW4sIG9wdGlvbnM/OiBGdXp6eVNjb3JlT3B0aW9ucyk6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQge1xuXHRsZXQgdG9wID0gZnV6enlTY29yZShwYXR0ZXJuLCBsb3dQYXR0ZXJuLCBwYXR0ZXJuUG9zLCB3b3JkLCBsb3dXb3JkLCB3b3JkUG9zLCBvcHRpb25zKTtcblxuXHRpZiAodG9wICYmICFhZ2dyZXNzaXZlKSB7XG5cdFx0Ly8gd2hlbiB1c2luZyB0aGUgb3JpZ2luYWwgcGF0dGVybiB5aWVsZCBhIHJlc3VsdCB3ZWBcblx0XHQvLyByZXR1cm4gaXQgdW5sZXNzIHdlIGFyZSBhZ2dyZXNzaXZlIGFuZCB0cnkgdG8gZmluZFxuXHRcdC8vIGEgYmV0dGVyIGFsaWdubWVudCwgZS5nLiBgY25vYCAtPiBgXmNvXm5zXm9sZWAgb3IgYF5jXm9ebnNvbGVgLlxuXHRcdHJldHVybiB0b3A7XG5cdH1cblxuXHRpZiAocGF0dGVybi5sZW5ndGggPj0gMykge1xuXHRcdC8vIFdoZW4gdGhlIHBhdHRlcm4gaXMgbG9uZyBlbm91Z2ggdGhlbiB0cnkgYSBmZXcgKG1heCA3KVxuXHRcdC8vIHBlcm11dGF0aW9ucyBvZiB0aGUgcGF0dGVybiB0byBmaW5kIGEgYmV0dGVyIG1hdGNoLiBUaGVcblx0XHQvLyBwZXJtdXRhdGlvbnMgb25seSBzd2FwIG5laWdoYm91cmluZyBjaGFyYWN0ZXJzLCBlLmdcblx0XHQvLyBgY25vc29gIGJlY29tZXMgYGNvbnNvYCwgYGNuc29vYCwgYGNub29zYC5cblx0XHRjb25zdCB0cmllcyA9IE1hdGgubWluKDcsIHBhdHRlcm4ubGVuZ3RoIC0gMSk7XG5cdFx0Zm9yIChsZXQgbW92aW5nUGF0dGVyblBvcyA9IHBhdHRlcm5Qb3MgKyAxOyBtb3ZpbmdQYXR0ZXJuUG9zIDwgdHJpZXM7IG1vdmluZ1BhdHRlcm5Qb3MrKykge1xuXHRcdFx0Y29uc3QgbmV3UGF0dGVybiA9IG5leHRUeXBvUGVybXV0YXRpb24ocGF0dGVybiwgbW92aW5nUGF0dGVyblBvcyk7XG5cdFx0XHRpZiAobmV3UGF0dGVybikge1xuXHRcdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBmdXp6eVNjb3JlKG5ld1BhdHRlcm4sIG5ld1BhdHRlcm4udG9Mb3dlckNhc2UoKSwgcGF0dGVyblBvcywgd29yZCwgbG93V29yZCwgd29yZFBvcywgb3B0aW9ucyk7XG5cdFx0XHRcdGlmIChjYW5kaWRhdGUpIHtcblx0XHRcdFx0XHRjYW5kaWRhdGVbMF0gLT0gMzsgLy8gcGVybXV0YXRpb24gcGVuYWx0eVxuXHRcdFx0XHRcdGlmICghdG9wIHx8IGNhbmRpZGF0ZVswXSA+IHRvcFswXSkge1xuXHRcdFx0XHRcdFx0dG9wID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0b3A7XG59XG5cbmZ1bmN0aW9uIG5leHRUeXBvUGVybXV0YXRpb24ocGF0dGVybjogc3RyaW5nLCBwYXR0ZXJuUG9zOiBudW1iZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXG5cdGlmIChwYXR0ZXJuUG9zICsgMSA+PSBwYXR0ZXJuLmxlbmd0aCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBzd2FwMSA9IHBhdHRlcm5bcGF0dGVyblBvc107XG5cdGNvbnN0IHN3YXAyID0gcGF0dGVybltwYXR0ZXJuUG9zICsgMV07XG5cblx0aWYgKHN3YXAxID09PSBzd2FwMikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXR1cm4gcGF0dGVybi5zbGljZSgwLCBwYXR0ZXJuUG9zKVxuXHRcdCsgc3dhcDJcblx0XHQrIHN3YXAxXG5cdFx0KyBwYXR0ZXJuLnNsaWNlKHBhdHRlcm5Qb3MgKyAyKTtcbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxZQUFZLGFBQWE7QUFvQmxCLFNBQVMsTUFBTSxRQUE0QjtBQUNqRCxTQUFPLFNBQVUsTUFBYyxvQkFBNkM7QUFDM0UsYUFBUyxJQUFJLEdBQUcsTUFBTSxPQUFPLFFBQVEsSUFBSSxLQUFLLEtBQUs7QUFDbEQsWUFBTSxRQUFRLE9BQU8sQ0FBQyxFQUFFLE1BQU0sa0JBQWtCO0FBQ2hELFVBQUksT0FBTztBQUNWLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFJTyxNQUFNLHNCQUErQixlQUFlLEtBQUssUUFBVyxLQUFLO0FBQ3pFLE1BQU0sZ0JBQXlCLGVBQWUsS0FBSyxRQUFXLElBQUk7QUFFekUsU0FBUyxlQUFlLFlBQXFCLE1BQWMsb0JBQTZDO0FBQ3ZHLE1BQUksQ0FBQyxzQkFBc0IsbUJBQW1CLFNBQVMsS0FBSyxRQUFRO0FBQ25FLFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSTtBQUNKLE1BQUksWUFBWTtBQUNmLGNBQVUsUUFBUSxxQkFBcUIsb0JBQW9CLElBQUk7QUFBQSxFQUNoRSxPQUFPO0FBQ04sY0FBVSxtQkFBbUIsUUFBUSxJQUFJLE1BQU07QUFBQSxFQUNoRDtBQUVBLE1BQUksQ0FBQyxTQUFTO0FBQ2IsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPLEtBQUssU0FBUyxJQUFJLENBQUMsRUFBRSxPQUFPLEdBQUcsS0FBSyxLQUFLLE9BQU8sQ0FBQyxJQUFJLENBQUM7QUFDOUQ7QUFJTyxTQUFTLDJCQUEyQixNQUFjLG9CQUE2QztBQUNyRyxNQUFJLEtBQUssU0FBUyxtQkFB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
