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
import { disposableTimeout } from "../../../../../base/common/async.js";
import { Color, RGBA } from "../../../../../base/common/color.js";
import { debounce } from "../../../../../base/common/decorators.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { escapeRegExpCharacters } from "../../../../../base/common/strings.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { TERMINAL_CONFIG_SECTION } from "../../../terminal/common/terminal.js";
import { DEFAULT_LOCAL_ECHO_EXCLUDE } from "../common/terminalTypeAheadConfiguration.js";
import { isNumber } from "../../../../../base/common/types.js";
var VT = /* @__PURE__ */ ((VT2) => {
  VT2["Esc"] = "\x1B";
  VT2["Csi"] = `\x1B[`;
  VT2["ShowCursor"] = `\x1B[?25h`;
  VT2["HideCursor"] = `\x1B[?25l`;
  VT2["DeleteChar"] = `\x1B[X`;
  VT2["DeleteRestOfLine"] = `\x1B[K`;
  return VT2;
})(VT || {});
const CSI_STYLE_RE = /^\x1b\[[0-9;]*m/;
const CSI_MOVE_RE = /^\x1b\[?([0-9]*)(;[35])?O?([DC])/;
const NOT_WORD_RE = /[^a-z0-9]/i;
var StatsConstants = /* @__PURE__ */ ((StatsConstants2) => {
  StatsConstants2[StatsConstants2["StatsBufferSize"] = 24] = "StatsBufferSize";
  StatsConstants2[StatsConstants2["StatsSendTelemetryEvery"] = 3e5] = "StatsSendTelemetryEvery";
  StatsConstants2[StatsConstants2["StatsMinSamplesToTurnOn"] = 5] = "StatsMinSamplesToTurnOn";
  StatsConstants2[StatsConstants2["StatsMinAccuracyToTurnOn"] = 0.3] = "StatsMinAccuracyToTurnOn";
  StatsConstants2[StatsConstants2["StatsToggleOffThreshold"] = 0.5] = "StatsToggleOffThreshold";
  return StatsConstants2;
})(StatsConstants || {});
const PREDICTION_OMIT_RE = /^(\x1b\[(\??25[hl]|\??[0-9;]+n))+/;
const core = (terminal) => {
  return terminal._core;
};
const flushOutput = (terminal) => {
};
var CursorMoveDirection = /* @__PURE__ */ ((CursorMoveDirection2) => {
  CursorMoveDirection2["Back"] = "D";
  CursorMoveDirection2["Forwards"] = "C";
  return CursorMoveDirection2;
})(CursorMoveDirection || {});
class Cursor {
  constructor(rows, cols, _buffer) {
    this.rows = rows;
    this.cols = cols;
    this._buffer = _buffer;
    this._x = 0;
    this._y = 1;
    this._baseY = 1;
    this._x = _buffer.cursorX;
    this._y = _buffer.cursorY;
    this._baseY = _buffer.baseY;
  }
  get x() {
    return this._x;
  }
  get y() {
    return this._y;
  }
  get baseY() {
    return this._baseY;
  }
  get coordinate() {
    return { x: this._x, y: this._y, baseY: this._baseY };
  }
  getLine() {
    return this._buffer.getLine(this._y + this._baseY);
  }
  getCell(loadInto) {
    return this.getLine()?.getCell(this._x, loadInto);
  }
  moveTo(coordinate) {
    this._x = coordinate.x;
    this._y = coordinate.y + coordinate.baseY - this._baseY;
    return this.moveInstruction();
  }
  clone() {
    const c = new Cursor(this.rows, this.cols, this._buffer);
    c.moveTo(this);
    return c;
  }
  move(x, y) {
    this._x = x;
    this._y = y;
    return this.moveInstruction();
  }
  shift(x = 0, y = 0) {
    this._x += x;
    this._y += y;
    return this.moveInstruction();
  }
  moveInstruction() {
    if (this._y >= this.rows) {
      this._baseY += this._y - (this.rows - 1);
      this._y = this.rows - 1;
    } else if (this._y < 0) {
      this._baseY -= this._y;
      this._y = 0;
    }
    return `${"\x1B[" /* Csi */}${this._y + 1};${this._x + 1}H`;
  }
}
const moveToWordBoundary = (b, cursor, direction) => {
  let ateLeadingWhitespace = false;
  if (direction < 0) {
    cursor.shift(-1);
  }
  let cell;
  while (cursor.x >= 0) {
    cell = cursor.getCell(cell);
    if (!cell?.getCode()) {
      return;
    }
    const chars = cell.getChars();
    if (NOT_WORD_RE.test(chars)) {
      if (ateLeadingWhitespace) {
        break;
      }
    } else {
      ateLeadingWhitespace = true;
    }
    cursor.shift(direction);
  }
  if (direction < 0) {
    cursor.shift(1);
  }
};
var MatchResult = /* @__PURE__ */ ((MatchResult2) => {
  MatchResult2[MatchResult2["Success"] = 0] = "Success";
  MatchResult2[MatchResult2["Failure"] = 1] = "Failure";
  MatchResult2[MatchResult2["Buffer"] = 2] = "Buffer";
  return MatchResult2;
})(MatchResult || {});
class StringReader {
  constructor(_input) {
    this._input = _input;
    this.index = 0;
  }
  get remaining() {
    return this._input.length - this.index;
  }
  get eof() {
    return this.index === this._input.length;
  }
  get rest() {
    return this._input.slice(this.index);
  }
  /**
   * Advances the reader and returns the character if it matches.
   */
  eatChar(char) {
    if (this._input[this.index] !== char) {
      return;
    }
    this.index++;
    return char;
  }
  /**
   * Advances the reader and returns the string if it matches.
   */
  eatStr(substr) {
    if (this._input.slice(this.index, substr.length) !== substr) {
      return;
    }
    this.index += substr.length;
    return substr;
  }
  /**
   * Matches and eats the substring character-by-character. If EOF is reached
   * before the substring is consumed, it will buffer. Index is not moved
   * if it's not a match.
   */
  eatGradually(substr) {
    const prevIndex = this.index;
    for (let i = 0; i < substr.length; i++) {
      if (i > 0 && this.eof) {
        return 2 /* Buffer */;
      }
      if (!this.eatChar(substr[i])) {
        this.index = prevIndex;
        return 1 /* Failure */;
      }
    }
    return 0 /* Success */;
  }
  /**
   * Advances the reader and returns the regex if it matches.
   */
  eatRe(re) {
    const match = re.exec(this._input.slice(this.index));
    if (!match) {
      return;
    }
    this.index += match[0].length;
    return match;
  }
  /**
   * Advances the reader and returns the character if the code matches.
   */
  eatCharCode(min = 0, max = min + 1) {
    const code = this._input.charCodeAt(this.index);
    if (code < min || code >= max) {
      return void 0;
    }
    this.index++;
    return code;
  }
}
class HardBoundary {
  constructor() {
    this.clearAfterTimeout = false;
  }
  apply() {
    return "";
  }
  rollback() {
    return "";
  }
  rollForwards() {
    return "";
  }
  matches() {
    return 1 /* Failure */;
  }
}
class TentativeBoundary {
  constructor(inner) {
    this.inner = inner;
  }
  apply(buffer, cursor) {
    this._appliedCursor = cursor.clone();
    this.inner.apply(buffer, this._appliedCursor);
    return "";
  }
  rollback(cursor) {
    this.inner.rollback(cursor.clone());
    return "";
  }
  rollForwards(cursor, withInput) {
    if (this._appliedCursor) {
      cursor.moveTo(this._appliedCursor);
    }
    return withInput;
  }
  matches(input) {
    return this.inner.matches(input);
  }
}
const isTenativeCharacterPrediction = (p) => p instanceof TentativeBoundary && p.inner instanceof CharacterPrediction;
class CharacterPrediction {
  constructor(_style, _char) {
    this._style = _style;
    this._char = _char;
    this.affectsStyle = true;
  }
  apply(_, cursor) {
    const cell = cursor.getCell();
    this.appliedAt = cell ? { pos: cursor.coordinate, oldAttributes: attributesToSeq(cell), oldChar: cell.getChars() } : { pos: cursor.coordinate, oldAttributes: "", oldChar: "" };
    cursor.shift(1);
    return this._style.apply + this._char + this._style.undo;
  }
  rollback(cursor) {
    if (!this.appliedAt) {
      return "";
    }
    const { oldAttributes, oldChar, pos } = this.appliedAt;
    const r = cursor.moveTo(pos) + (oldChar ? `${oldAttributes}${oldChar}${cursor.moveTo(pos)}` : "\x1B[X" /* DeleteChar */);
    return r;
  }
  rollForwards(cursor, input) {
    if (!this.appliedAt) {
      return "";
    }
    return cursor.clone().moveTo(this.appliedAt.pos) + input;
  }
  matches(input, lookBehind) {
    const startIndex = input.index;
    while (input.eatRe(CSI_STYLE_RE)) {
    }
    if (input.eof) {
      return 2 /* Buffer */;
    }
    if (input.eatChar(this._char)) {
      return 0 /* Success */;
    }
    if (lookBehind instanceof CharacterPrediction) {
      const sillyZshOutcome = input.eatGradually(`\b${lookBehind._char}${this._char}`);
      if (sillyZshOutcome !== 1 /* Failure */) {
        return sillyZshOutcome;
      }
    }
    input.index = startIndex;
    return 1 /* Failure */;
  }
}
class BackspacePrediction {
  constructor(_terminal) {
    this._terminal = _terminal;
  }
  apply(_, cursor) {
    const isLastChar = !cursor.getLine()?.translateToString(void 0, cursor.x).trim();
    const pos = cursor.coordinate;
    const move = cursor.shift(-1);
    const cell = cursor.getCell();
    this._appliedAt = cell ? { isLastChar, pos, oldAttributes: attributesToSeq(cell), oldChar: cell.getChars() } : { isLastChar, pos, oldAttributes: "", oldChar: "" };
    return move + "\x1B[X" /* DeleteChar */;
  }
  rollback(cursor) {
    if (!this._appliedAt) {
      return "";
    }
    const { oldAttributes, oldChar, pos } = this._appliedAt;
    if (!oldChar) {
      return cursor.moveTo(pos) + "\x1B[X" /* DeleteChar */;
    }
    return oldAttributes + oldChar + cursor.moveTo(pos) + attributesToSeq(core(this._terminal)._inputHandler._curAttrData);
  }
  rollForwards() {
    return "";
  }
  matches(input) {
    if (this._appliedAt?.isLastChar) {
      const r1 = input.eatGradually(`\b${"\x1B[" /* Csi */}K`);
      if (r1 !== 1 /* Failure */) {
        return r1;
      }
      const r2 = input.eatGradually(`\b \b`);
      if (r2 !== 1 /* Failure */) {
        return r2;
      }
    }
    return 1 /* Failure */;
  }
}
class NewlinePrediction {
  apply(_, cursor) {
    this._prevPosition = cursor.coordinate;
    cursor.move(0, cursor.y + 1);
    return "\r\n";
  }
  rollback(cursor) {
    return this._prevPosition ? cursor.moveTo(this._prevPosition) : "";
  }
  rollForwards() {
    return "";
  }
  matches(input) {
    return input.eatGradually("\r\n");
  }
}
class LinewrapPrediction extends NewlinePrediction {
  apply(_, cursor) {
    this._prevPosition = cursor.coordinate;
    cursor.move(0, cursor.y + 1);
    return " \r";
  }
  matches(input) {
    const r = input.eatGradually(" \r");
    if (r !== 1 /* Failure */) {
      const r2 = input.eatGradually("\x1B[K" /* DeleteRestOfLine */);
      return r2 === 2 /* Buffer */ ? 2 /* Buffer */ : r;
    }
    return input.eatGradually("\r\n");
  }
}
class CursorMovePrediction {
  constructor(_direction, _moveByWords, _amount) {
    this._direction = _direction;
    this._moveByWords = _moveByWords;
    this._amount = _amount;
  }
  apply(buffer, cursor) {
    const prevPosition = cursor.x;
    const currentCell = cursor.getCell();
    const prevAttrs = currentCell ? attributesToSeq(currentCell) : "";
    const { _amount: amount, _direction: direction, _moveByWords: moveByWords } = this;
    const delta = direction === "D" /* Back */ ? -1 : 1;
    const target = cursor.clone();
    if (moveByWords) {
      for (let i = 0; i < amount; i++) {
        moveToWordBoundary(buffer, target, delta);
      }
    } else {
      target.shift(delta * amount);
    }
    this._applied = {
      amount: Math.abs(cursor.x - target.x),
      prevPosition,
      prevAttrs,
      rollForward: cursor.moveTo(target)
    };
    return this._applied.rollForward;
  }
  rollback(cursor) {
    if (!this._applied) {
      return "";
    }
    return cursor.move(this._applied.prevPosition, cursor.y) + this._applied.prevAttrs;
  }
  rollForwards() {
    return "";
  }
  matches(input) {
    if (!this._applied) {
      return 1 /* Failure */;
    }
    const direction = this._direction;
    const { amount, rollForward } = this._applied;
    if (input.eatStr(`${"\x1B[" /* Csi */}${direction}`.repeat(amount))) {
      return 0 /* Success */;
    }
    if (direction === "D" /* Back */) {
      if (input.eatStr(`\b`.repeat(amount))) {
        return 0 /* Success */;
      }
    }
    if (rollForward) {
      const r = input.eatGradually(rollForward);
      if (r !== 1 /* Failure */) {
        return r;
      }
    }
    return input.eatGradually(`${"\x1B[" /* Csi */}${amount}${direction}`);
  }
}
class PredictionStats extends Disposable {
  constructor(timeline) {
    super();
    this._stats = [];
    this._index = 0;
    this._addedAtTime = /* @__PURE__ */ new WeakMap();
    this._changeEmitter = this._register(new Emitter());
    this.onChange = this._changeEmitter.event;
    this._register(timeline.onPredictionAdded((p) => this._addedAtTime.set(p, Date.now())));
    this._register(timeline.onPredictionSucceeded(this._pushStat.bind(this, true)));
    this._register(timeline.onPredictionFailed(this._pushStat.bind(this, false)));
  }
  /**
   * Gets the percent (0-1) of predictions that were accurate.
   */
  get accuracy() {
    let correctCount = 0;
    for (const [, correct] of this._stats) {
      if (correct) {
        correctCount++;
      }
    }
    return correctCount / (this._stats.length || 1);
  }
  /**
   * Gets the number of recorded stats.
   */
  get sampleSize() {
    return this._stats.length;
  }
  /**
   * Gets latency stats of successful predictions.
   */
  get latency() {
    const latencies = this._stats.filter(([, correct]) => correct).map(([s]) => s).sort();
    return {
      count: latencies.length,
      min: latencies[0],
      median: latencies[Math.floor(latencies.length / 2)],
      max: latencies[latencies.length - 1]
    };
  }
  /**
   * Gets the maximum observed latency.
   */
  get maxLatency() {
    let max = -Infinity;
    for (const [latency, correct] of this._stats) {
      if (correct) {
        max = Math.max(latency, max);
      }
    }
    return max;
  }
  _pushStat(correct, prediction) {
    const started = this._addedAtTime.get(prediction);
    this._stats[this._index] = [Date.now() - started, correct];
    this._index = (this._index + 1) % 24 /* StatsBufferSize */;
    this._changeEmitter.fire();
  }
}
class PredictionTimeline extends Disposable {
  constructor(terminal, _style) {
    super();
    this.terminal = terminal;
    this._style = _style;
    /**
     * Expected queue of events. Only predictions for the lowest are
     * written into the terminal.
     */
    this._expected = [];
    /**
     * Current prediction generation.
     */
    this._currentGen = 0;
    /**
     * Whether predictions are echoed to the terminal. If false, predictions
     * will still be computed internally for latency metrics, but input will
     * never be adjusted.
     */
    this._showPredictions = false;
    this._addedEmitter = this._register(new Emitter());
    this.onPredictionAdded = this._addedEmitter.event;
    this._failedEmitter = this._register(new Emitter());
    this.onPredictionFailed = this._failedEmitter.event;
    this._succeededEmitter = this._register(new Emitter());
    this.onPredictionSucceeded = this._succeededEmitter.event;
  }
  get _currentGenerationPredictions() {
    return this._expected.filter(({ gen }) => gen === this._expected[0].gen).map(({ p }) => p);
  }
  get isShowingPredictions() {
    return this._showPredictions;
  }
  get length() {
    return this._expected.length;
  }
  setShowPredictions(show) {
    if (show === this._showPredictions) {
      return;
    }
    this._showPredictions = show;
    const buffer = this._getActiveBuffer();
    if (!buffer) {
      return;
    }
    const toApply = this._currentGenerationPredictions;
    if (show) {
      this.clearCursor();
      this._style.expectIncomingStyle(toApply.reduce((count, p) => p.affectsStyle ? count + 1 : count, 0));
      this.terminal.write(toApply.map((p) => p.apply(buffer, this.physicalCursor(buffer))).join(""));
    } else {
      this.terminal.write(toApply.reverse().map((p) => p.rollback(this.physicalCursor(buffer))).join(""));
    }
  }
  /**
   * Undoes any predictions written and resets expectations.
   */
  undoAllPredictions() {
    const buffer = this._getActiveBuffer();
    if (this._showPredictions && buffer) {
      this.terminal.write(this._currentGenerationPredictions.reverse().map((p) => p.rollback(this.physicalCursor(buffer))).join(""));
    }
    this._expected = [];
  }
  /**
   * Should be called when input is incoming to the temrinal.
   */
  beforeServerInput(input) {
    const originalInput = input;
    if (this._inputBuffer) {
      input = this._inputBuffer + input;
      this._inputBuffer = void 0;
    }
    if (!this._expected.length) {
      this._clearPredictionState();
      return input;
    }
    const buffer = this._getActiveBuffer();
    if (!buffer) {
      this._clearPredictionState();
      return input;
    }
    let output = "";
    const reader = new StringReader(input);
    const startingGen = this._expected[0].gen;
    const emitPredictionOmitted = () => {
      const omit = reader.eatRe(PREDICTION_OMIT_RE);
      if (omit) {
        output += omit[0];
      }
    };
    ReadLoop: while (this._expected.length && reader.remaining > 0) {
      emitPredictionOmitted();
      const { p: prediction, gen } = this._expected[0];
      const cursor = this.physicalCursor(buffer);
      const beforeTestReaderIndex = reader.index;
      switch (prediction.matches(reader, this._lookBehind)) {
        case 0 /* Success */: {
          const eaten = input.slice(beforeTestReaderIndex, reader.index);
          if (gen === startingGen) {
            output += prediction.rollForwards?.(cursor, eaten);
          } else {
            prediction.apply(buffer, this.physicalCursor(buffer));
            output += eaten;
          }
          this._succeededEmitter.fire(prediction);
          this._lookBehind = prediction;
          this._expected.shift();
          break;
        }
        case 2 /* Buffer */:
          this._inputBuffer = input.slice(beforeTestReaderIndex);
          reader.index = input.length;
          break ReadLoop;
        case 1 /* Failure */: {
          const rollback = this._expected.filter((p) => p.gen === startingGen).reverse();
          output += rollback.map(({ p }) => p.rollback(this.physicalCursor(buffer))).join("");
          if (rollback.some((r) => r.p.affectsStyle)) {
            output += attributesToSeq(core(this.terminal)._inputHandler._curAttrData);
          }
          this._clearPredictionState();
          this._failedEmitter.fire(prediction);
          break ReadLoop;
        }
      }
    }
    emitPredictionOmitted();
    if (!reader.eof) {
      output += reader.rest;
      this._clearPredictionState();
    }
    if (this._expected.length && startingGen !== this._expected[0].gen) {
      for (const { p, gen } of this._expected) {
        if (gen !== this._expected[0].gen) {
          break;
        }
        if (p.affectsStyle) {
          this._style.expectIncomingStyle();
        }
        output += p.apply(buffer, this.physicalCursor(buffer));
      }
    }
    if (!this._showPredictions) {
      return originalInput;
    }
    if (output.length === 0 || output === input) {
      return output;
    }
    if (this._physicalCursor) {
      output += this._physicalCursor.moveInstruction();
    }
    output = "\x1B[?25l" /* HideCursor */ + output + "\x1B[?25h" /* ShowCursor */;
    return output;
  }
  /**
   * Clears any expected predictions and stored state. Should be called when
   * the pty gives us something we don't recognize.
   */
  _clearPredictionState() {
    this._expected = [];
    this.clearCursor();
    this._lookBehind = void 0;
  }
  /**
   * Appends a typeahead prediction.
   */
  addPrediction(buffer, prediction) {
    this._expected.push({ gen: this._currentGen, p: prediction });
    this._addedEmitter.fire(prediction);
    if (this._currentGen !== this._expected[0].gen) {
      prediction.apply(buffer, this.tentativeCursor(buffer));
      return false;
    }
    const text = prediction.apply(buffer, this.physicalCursor(buffer));
    this._tenativeCursor = void 0;
    if (this._showPredictions && text) {
      if (prediction.affectsStyle) {
        this._style.expectIncomingStyle();
      }
      this.terminal.write(text);
    }
    return true;
  }
  addBoundary(buffer, prediction) {
    let applied = false;
    if (buffer && prediction) {
      applied = this.addPrediction(buffer, new TentativeBoundary(prediction));
      prediction.apply(buffer, this.tentativeCursor(buffer));
    }
    this._currentGen++;
    return applied;
  }
  /**
   * Peeks the last prediction written.
   */
  peekEnd() {
    return this._expected[this._expected.length - 1]?.p;
  }
  /**
   * Peeks the first pending prediction.
   */
  peekStart() {
    return this._expected[0]?.p;
  }
  /**
   * Current position of the cursor in the terminal.
   */
  physicalCursor(buffer) {
    if (!this._physicalCursor) {
      if (this._showPredictions) {
        flushOutput(this.terminal);
      }
      this._physicalCursor = new Cursor(this.terminal.rows, this.terminal.cols, buffer);
    }
    return this._physicalCursor;
  }
  /**
   * Cursor position if all predictions and boundaries that have been inserted
   * so far turn out to be successfully predicted.
   */
  tentativeCursor(buffer) {
    if (!this._tenativeCursor) {
      this._tenativeCursor = this.physicalCursor(buffer).clone();
    }
    return this._tenativeCursor;
  }
  clearCursor() {
    this._physicalCursor = void 0;
    this._tenativeCursor = void 0;
  }
  _getActiveBuffer() {
    const buffer = this.terminal.buffer.active;
    return buffer.type === "normal" ? buffer : void 0;
  }
}
const attributesToArgs = (cell) => {
  if (cell.isAttributeDefault()) {
    return [0];
  }
  const args = [];
  if (cell.isBold()) {
    args.push(1);
  }
  if (cell.isDim()) {
    args.push(2);
  }
  if (cell.isItalic()) {
    args.push(3);
  }
  if (cell.isUnderline()) {
    args.push(4);
  }
  if (cell.isBlink()) {
    args.push(5);
  }
  if (cell.isInverse()) {
    args.push(7);
  }
  if (cell.isInvisible()) {
    args.push(8);
  }
  if (cell.isFgRGB()) {
    args.push(38, 2, cell.getFgColor() >>> 24, cell.getFgColor() >>> 16 & 255, cell.getFgColor() & 255);
  }
  if (cell.isFgPalette()) {
    args.push(38, 5, cell.getFgColor());
  }
  if (cell.isFgDefault()) {
    args.push(39);
  }
  if (cell.isBgRGB()) {
    args.push(48, 2, cell.getBgColor() >>> 24, cell.getBgColor() >>> 16 & 255, cell.getBgColor() & 255);
  }
  if (cell.isBgPalette()) {
    args.push(48, 5, cell.getBgColor());
  }
  if (cell.isBgDefault()) {
    args.push(49);
  }
  return args;
};
const attributesToSeq = (cell) => `${"\x1B[" /* Csi */}${attributesToArgs(cell).join(";")}m`;
const arrayHasPrefixAt = (a, ai, b) => {
  if (a.length - ai > b.length) {
    return false;
  }
  for (let bi = 0; bi < b.length; bi++, ai++) {
    if (b[ai] !== a[ai]) {
      return false;
    }
  }
  return true;
};
const getColorWidth = (params, pos) => {
  const accu = [0, 0, -1, 0, 0, 0];
  let cSpace = 0;
  let advance = 0;
  do {
    const v = params[pos + advance];
    accu[advance + cSpace] = isNumber(v) ? v : v[0];
    if (!isNumber(v)) {
      let i = 0;
      do {
        if (accu[1] === 5) {
          cSpace = 1;
        }
        accu[advance + i + 1 + cSpace] = v[i];
      } while (++i < v.length && i + advance + 1 + cSpace < accu.length);
      break;
    }
    if (accu[1] === 5 && advance + cSpace >= 2 || accu[1] === 2 && advance + cSpace >= 5) {
      break;
    }
    if (accu[1]) {
      cSpace = 1;
    }
  } while (++advance + pos < params.length && advance + cSpace < accu.length);
  return advance;
};
const _TypeAheadStyle = class _TypeAheadStyle {
  constructor(value, _terminal) {
    this._terminal = _terminal;
    /**
     * Number of typeahead style arguments we expect to read. If this is 0 and
     * we see a style coming in, we know that the PTY actually wanted to update.
     */
    this._expectedIncomingStyles = 0;
    this.onUpdate(value);
  }
  static _compileArgs(args) {
    return `${"\x1B[" /* Csi */}${args.join(";")}m`;
  }
  /**
   * Signals that a style was written to the terminal and we should watch
   * for it coming in.
   */
  expectIncomingStyle(n = 1) {
    this._expectedIncomingStyles += n * 2;
  }
  /**
   * Starts tracking for CSI changes in the terminal.
   */
  startTracking() {
    this._expectedIncomingStyles = 0;
    this._onDidWriteSGR(attributesToArgs(core(this._terminal)._inputHandler._curAttrData));
    this._csiHandler = this._terminal.parser.registerCsiHandler({ final: "m" }, (args) => {
      this._onDidWriteSGR(args);
      return false;
    });
  }
  debounceStopTracking() {
    this._stopTracking();
  }
  /**
   * @inheritdoc
   */
  dispose() {
    this._stopTracking();
  }
  _stopTracking() {
    this._csiHandler?.dispose();
    this._csiHandler = void 0;
  }
  _onDidWriteSGR(args) {
    const originalUndo = this._undoArgs;
    for (let i = 0; i < args.length; ) {
      const px = args[i];
      const p = isNumber(px) ? px : px[0];
      if (this._expectedIncomingStyles) {
        if (arrayHasPrefixAt(args, i, this._undoArgs)) {
          this._expectedIncomingStyles--;
          i += this._undoArgs.length;
          continue;
        }
        if (arrayHasPrefixAt(args, i, this._applyArgs)) {
          this._expectedIncomingStyles--;
          i += this._applyArgs.length;
          continue;
        }
      }
      const width = p === 38 || p === 48 || p === 58 ? getColorWidth(args, i) : 1;
      switch (this._applyArgs[0]) {
        case 1:
          if (p === 2) {
            this._undoArgs = [22, 2];
          } else if (p === 22 || p === 0) {
            this._undoArgs = [22];
          }
          break;
        case 2:
          if (p === 1) {
            this._undoArgs = [22, 1];
          } else if (p === 22 || p === 0) {
            this._undoArgs = [22];
          }
          break;
        case 38:
          if (p === 0 || p === 39 || p === 100) {
            this._undoArgs = [39];
          } else if (p >= 30 && p <= 38 || p >= 90 && p <= 97) {
            this._undoArgs = args.slice(i, i + width);
          }
          break;
        default:
          if (p === this._applyArgs[0]) {
            this._undoArgs = this._applyArgs;
          } else if (p === 0) {
            this._undoArgs = this._originalUndoArgs;
          }
      }
      i += width;
    }
    if (originalUndo !== this._undoArgs) {
      this.undo = _TypeAheadStyle._compileArgs(this._undoArgs);
    }
  }
  /**
   * Updates the current typeahead style.
   */
  onUpdate(style) {
    const { applyArgs, undoArgs } = this._getArgs(style);
    this._applyArgs = applyArgs;
    this._undoArgs = this._originalUndoArgs = undoArgs;
    this.apply = _TypeAheadStyle._compileArgs(this._applyArgs);
    this.undo = _TypeAheadStyle._compileArgs(this._undoArgs);
  }
  _getArgs(style) {
    switch (style) {
      case "bold":
        return { applyArgs: [1], undoArgs: [22] };
      case "dim":
        return { applyArgs: [2], undoArgs: [22] };
      case "italic":
        return { applyArgs: [3], undoArgs: [23] };
      case "underlined":
        return { applyArgs: [4], undoArgs: [24] };
      case "inverted":
        return { applyArgs: [7], undoArgs: [27] };
      default: {
        let color;
        try {
          color = Color.fromHex(style);
        } catch {
          color = new Color(new RGBA(255, 0, 0, 1));
        }
        const { r, g, b } = color.rgba;
        return { applyArgs: [38, 2, r, g, b], undoArgs: [39] };
      }
    }
  }
};
__decorateClass([
  debounce(2e3)
], _TypeAheadStyle.prototype, "debounceStopTracking", 1);
let TypeAheadStyle = _TypeAheadStyle;
const compileExcludeRegexp = (programs = DEFAULT_LOCAL_ECHO_EXCLUDE) => new RegExp(`\\b(${programs.map(escapeRegExpCharacters).join("|")})\\b`, "i");
var CharPredictState = /* @__PURE__ */ ((CharPredictState2) => {
  CharPredictState2[CharPredictState2["Unknown"] = 0] = "Unknown";
  CharPredictState2[CharPredictState2["HasPendingChar"] = 1] = "HasPendingChar";
  CharPredictState2[CharPredictState2["Validated"] = 2] = "Validated";
  return CharPredictState2;
})(CharPredictState || {});
let TypeAheadAddon = class extends Disposable {
  constructor(_processManager, _configurationService, _telemetryService) {
    super();
    this._processManager = _processManager;
    this._configurationService = _configurationService;
    this._telemetryService = _telemetryService;
    this._terminalTitle = "";
    this._typeaheadThreshold = this._configurationService.getValue(TERMINAL_CONFIG_SECTION).localEchoLatencyThreshold;
    this._excludeProgramRe = compileExcludeRegexp(this._configurationService.getValue(TERMINAL_CONFIG_SECTION).localEchoExcludePrograms);
    this._register(toDisposable(() => this._clearPredictionDebounce?.dispose()));
  }
  activate(terminal) {
    const style = this._typeaheadStyle = this._register(new TypeAheadStyle(this._configurationService.getValue(TERMINAL_CONFIG_SECTION).localEchoStyle, terminal));
    const timeline = this._timeline = this._register(new PredictionTimeline(terminal, this._typeaheadStyle));
    const stats = this.stats = this._register(new PredictionStats(this._timeline));
    timeline.setShowPredictions(this._typeaheadThreshold === 0);
    this._register(terminal.onData((e) => this._onUserData(e)));
    this._register(terminal.onTitleChange((title) => {
      this._terminalTitle = title;
      this._reevaluatePredictorState(stats, timeline);
    }));
    this._register(terminal.onResize(() => {
      timeline.setShowPredictions(false);
      timeline.clearCursor();
      this._reevaluatePredictorState(stats, timeline);
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TERMINAL_CONFIG_SECTION)) {
        style.onUpdate(this._configurationService.getValue(TERMINAL_CONFIG_SECTION).localEchoStyle);
        this._typeaheadThreshold = this._configurationService.getValue(TERMINAL_CONFIG_SECTION).localEchoLatencyThreshold;
        this._excludeProgramRe = compileExcludeRegexp(this._configurationService.getValue(TERMINAL_CONFIG_SECTION).localEchoExcludePrograms);
        this._reevaluatePredictorState(stats, timeline);
      }
    }));
    this._register(this._timeline.onPredictionSucceeded((p) => {
      if (this._lastRow?.charState === 1 /* HasPendingChar */ && isTenativeCharacterPrediction(p) && p.inner.appliedAt) {
        if (p.inner.appliedAt.pos.y + p.inner.appliedAt.pos.baseY === this._lastRow.y) {
          this._lastRow.charState = 2 /* Validated */;
        }
      }
    }));
    this._register(this._processManager.onBeforeProcessData((e) => this._onBeforeProcessData(e)));
    let nextStatsSend;
    this._register(stats.onChange(() => {
      if (!nextStatsSend) {
        nextStatsSend = setTimeout(() => {
          this._sendLatencyStats(stats);
          nextStatsSend = void 0;
        }, 3e5 /* StatsSendTelemetryEvery */);
      }
      if (timeline.length === 0) {
        style.debounceStopTracking();
      }
      this._reevaluatePredictorState(stats, timeline);
    }));
  }
  reset() {
    this._lastRow = void 0;
  }
  _deferClearingPredictions() {
    if (!this.stats || !this._timeline) {
      return;
    }
    this._clearPredictionDebounce?.dispose();
    if (this._timeline.length === 0 || this._timeline.peekStart()?.clearAfterTimeout === false) {
      this._clearPredictionDebounce = void 0;
      return;
    }
    this._clearPredictionDebounce = disposableTimeout(
      () => {
        this._timeline?.undoAllPredictions();
        if (this._lastRow?.charState === 1 /* HasPendingChar */) {
          this._lastRow.charState = 0 /* Unknown */;
        }
      },
      Math.max(500, this.stats.maxLatency * 3 / 2),
      this._store
    );
  }
  _reevaluatePredictorState(stats, timeline) {
    this._reevaluatePredictorStateNow(stats, timeline);
  }
  _reevaluatePredictorStateNow(stats, timeline) {
    if (this._excludeProgramRe.test(this._terminalTitle)) {
      timeline.setShowPredictions(false);
    } else if (this._typeaheadThreshold < 0) {
      timeline.setShowPredictions(false);
    } else if (this._typeaheadThreshold === 0) {
      timeline.setShowPredictions(true);
    } else if (stats.sampleSize > 5 /* StatsMinSamplesToTurnOn */ && stats.accuracy > 0.3 /* StatsMinAccuracyToTurnOn */) {
      const latency = stats.latency.median;
      if (latency >= this._typeaheadThreshold) {
        timeline.setShowPredictions(true);
      } else if (latency < this._typeaheadThreshold / 0.5 /* StatsToggleOffThreshold */) {
        timeline.setShowPredictions(false);
      }
    }
  }
  _sendLatencyStats(stats) {
    this._telemetryService.publicLog("terminalLatencyStats", {
      ...stats.latency,
      predictionAccuracy: stats.accuracy
    });
  }
  _onUserData(data) {
    if (this._timeline?.terminal.buffer.active.type !== "normal") {
      return;
    }
    const terminal = this._timeline.terminal;
    const buffer = terminal.buffer.active;
    if (buffer.cursorX === 1 && buffer.cursorY === terminal.rows - 1) {
      if (buffer.getLine(buffer.cursorY + buffer.baseY)?.getCell(0)?.getChars() === ":") {
        return;
      }
    }
    const actualY = buffer.baseY + buffer.cursorY;
    if (actualY !== this._lastRow?.y) {
      this._lastRow = { y: actualY, startingX: buffer.cursorX, endingX: buffer.cursorX, charState: 0 /* Unknown */ };
    } else {
      this._lastRow.startingX = Math.min(this._lastRow.startingX, buffer.cursorX);
      this._lastRow.endingX = Math.max(this._lastRow.endingX, this._timeline.physicalCursor(buffer).x);
    }
    const addLeftNavigating = (p) => this._timeline.tentativeCursor(buffer).x <= this._lastRow.startingX ? this._timeline.addBoundary(buffer, p) : this._timeline.addPrediction(buffer, p);
    const addRightNavigating = (p) => this._timeline.tentativeCursor(buffer).x >= this._lastRow.endingX - 1 ? this._timeline.addBoundary(buffer, p) : this._timeline.addPrediction(buffer, p);
    const reader = new StringReader(data);
    while (reader.remaining > 0) {
      if (reader.eatCharCode(127)) {
        const previous = this._timeline.peekEnd();
        if (previous && previous instanceof CharacterPrediction) {
          this._timeline.addBoundary();
        }
        if (this._timeline.isShowingPredictions) {
          flushOutput(this._timeline.terminal);
        }
        if (this._timeline.tentativeCursor(buffer).x <= this._lastRow.startingX) {
          this._timeline.addBoundary(buffer, new BackspacePrediction(this._timeline.terminal));
        } else {
          this._lastRow.endingX--;
          this._timeline.addPrediction(buffer, new BackspacePrediction(this._timeline.terminal));
        }
        continue;
      }
      if (reader.eatCharCode(32, 126)) {
        const char = data[reader.index - 1];
        const prediction = new CharacterPrediction(this._typeaheadStyle, char);
        if (this._lastRow.charState === 0 /* Unknown */) {
          this._timeline.addBoundary(buffer, prediction);
          this._lastRow.charState = 1 /* HasPendingChar */;
        } else {
          this._timeline.addPrediction(buffer, prediction);
        }
        if (this._timeline.tentativeCursor(buffer).x >= terminal.cols) {
          this._timeline.addBoundary(buffer, new LinewrapPrediction());
        }
        continue;
      }
      const cursorMv = reader.eatRe(CSI_MOVE_RE);
      if (cursorMv) {
        const direction = cursorMv[3];
        const p = new CursorMovePrediction(direction, !!cursorMv[2], Number(cursorMv[1]) || 1);
        if (direction === "D" /* Back */) {
          addLeftNavigating(p);
        } else {
          addRightNavigating(p);
        }
        continue;
      }
      if (reader.eatStr(`${"\x1B" /* Esc */}f`)) {
        addRightNavigating(new CursorMovePrediction("C" /* Forwards */, true, 1));
        continue;
      }
      if (reader.eatStr(`${"\x1B" /* Esc */}b`)) {
        addLeftNavigating(new CursorMovePrediction("D" /* Back */, true, 1));
        continue;
      }
      if (reader.eatChar("\r") && buffer.cursorY < terminal.rows - 1) {
        this._timeline.addPrediction(buffer, new NewlinePrediction());
        continue;
      }
      this._timeline.addBoundary(buffer, new HardBoundary());
      break;
    }
    if (this._timeline.length === 1) {
      this._deferClearingPredictions();
      this._typeaheadStyle.startTracking();
    }
  }
  _onBeforeProcessData(event) {
    if (!this._timeline) {
      return;
    }
    event.data = this._timeline.beforeServerInput(event.data);
    this._deferClearingPredictions();
  }
};
__decorateClass([
  debounce(100)
], TypeAheadAddon.prototype, "_reevaluatePredictorState", 1);
TypeAheadAddon = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ITelemetryService)
], TypeAheadAddon);
export {
  CharPredictState,
  PredictionStats,
  PredictionTimeline,
  TypeAheadAddon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcdHlwZUFoZWFkXFxicm93c2VyXFx0ZXJtaW5hbFR5cGVBaGVhZEFkZG9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2xvciwgUkdCQSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBYdGVybUF0dHJpYnV0ZXMsIElYdGVybUNvcmUgfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3h0ZXJtLXByaXZhdGUuanMnO1xuaW1wb3J0IHsgSUJlZm9yZVByb2Nlc3NEYXRhRXZlbnQsIElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyLCBURVJNSU5BTF9DT05GSUdfU0VDVElPTiB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElCdWZmZXIsIElCdWZmZXJDZWxsLCBJRGlzcG9zYWJsZSwgSVRlcm1pbmFsQWRkb24sIFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IERFRkFVTFRfTE9DQUxfRUNIT19FWENMVURFLCB0eXBlIElUZXJtaW5hbFR5cGVBaGVhZENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGlzTnVtYmVyLCB0eXBlIFNpbmdsZU9yTWFueSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuY29uc3QgZW51bSBWVCB7XG5cdEVzYyA9ICdcXHgxYicsXG5cdENzaSA9IGBcXHgxYltgLFxuXHRTaG93Q3Vyc29yID0gYFxceDFiWz8yNWhgLFxuXHRIaWRlQ3Vyc29yID0gYFxceDFiWz8yNWxgLFxuXHREZWxldGVDaGFyID0gYFxceDFiW1hgLFxuXHREZWxldGVSZXN0T2ZMaW5lID0gYFxceDFiW0tgLFxufVxuXG5jb25zdCBDU0lfU1RZTEVfUkUgPSAvXlxceDFiXFxbWzAtOTtdKm0vO1xuY29uc3QgQ1NJX01PVkVfUkUgPSAvXlxceDFiXFxbPyhbMC05XSopKDtbMzVdKT9PPyhbRENdKS87XG5jb25zdCBOT1RfV09SRF9SRSA9IC9bXmEtejAtOV0vaTtcblxuY29uc3QgZW51bSBTdGF0c0NvbnN0YW50cyB7XG5cdFN0YXRzQnVmZmVyU2l6ZSA9IDI0LFxuXHRTdGF0c1NlbmRUZWxlbWV0cnlFdmVyeSA9IDEwMDAgKiA2MCAqIDUsIC8vIGhvdyBvZnRlbiB0byBjb2xsZWN0IHN0YXRzXG5cdFN0YXRzTWluU2FtcGxlc1RvVHVybk9uID0gNSxcblx0U3RhdHNNaW5BY2N1cmFjeVRvVHVybk9uID0gMC4zLFxuXHRTdGF0c1RvZ2dsZU9mZlRocmVzaG9sZCA9IDAuNSwgLy8gaWYgbGF0ZW5jeSBpcyBsZXNzIHRoYW4gYHRocmVzaG9sZCAqIHRoaXNgLCB0dXJuIG9mZlxufVxuXG4vKipcbiAqIENvZGVzIHRoYXQgc2hvdWxkIGJlIG9taXR0ZWQgZnJvbSBzZW5kaW5nIHRvIHRoZSBwcmVkaWN0aW9uIGVuZ2luZSBhbmQgaW5zdGVhZCBvbWl0dGVkIGRpcmVjdGx5OlxuICogLSBIaWRlIGN1cnNvciAoREVDVENFTSk6IFdlIHdyYXAgdGhlIGxvY2FsIGVjaG8gc2VxdWVuY2UgaW4gaGlkZSBhbmQgc2hvd1xuICogICBDU0kgPyAyIDUgbFxuICogLSBTaG93IGN1cnNvciAoREVDVENFTSk6IFdlIHdyYXAgdGhlIGxvY2FsIGVjaG8gc2VxdWVuY2UgaW4gaGlkZSBhbmQgc2hvd1xuICogICBDU0kgPyAyIDUgaFxuICogLSBEZXZpY2UgU3RhdHVzIFJlcG9ydCAoRFNSKTogVGhlc2Ugc2VxdWVuY2UgZmlyZSByZXBvcnQgZXZlbnRzIGZyb20geHRlcm0gd2hpY2ggY291bGQgY2F1c2VcbiAqICAgZG91YmxlIHJlcG9ydGluZyBhbmQgcG90ZW50aWFsbHkgYSBzdGFjayBvdmVyZmxvdyAoIzExOTQ3MilcbiAqICAgQ1NJIFBzIG5cbiAqICAgQ1NJID8gUHMgblxuICovXG5jb25zdCBQUkVESUNUSU9OX09NSVRfUkUgPSAvXihcXHgxYlxcWyhcXD8/MjVbaGxdfFxcPz9bMC05O10rbikpKy87XG5cbmNvbnN0IGNvcmUgPSAodGVybWluYWw6IFRlcm1pbmFsKTogSVh0ZXJtQ29yZSA9PiB7XG5cdGludGVyZmFjZSBYdGVybVdpdGhDb3JlIGV4dGVuZHMgVGVybWluYWwge1xuXHRcdF9jb3JlOiBJWHRlcm1Db3JlO1xuXHR9XG5cdHJldHVybiAodGVybWluYWwgYXMgWHRlcm1XaXRoQ29yZSkuX2NvcmU7XG59O1xuY29uc3QgZmx1c2hPdXRwdXQgPSAodGVybWluYWw6IFRlcm1pbmFsKSA9PiB7XG5cdC8vIFRPRE86IEZsdXNoaW5nIG91dHB1dCBpcyBub3QgcG9zc2libGUgYW55bW9yZSB3aXRob3V0IGFzeW5jXG59O1xuXG5jb25zdCBlbnVtIEN1cnNvck1vdmVEaXJlY3Rpb24ge1xuXHRCYWNrID0gJ0QnLFxuXHRGb3J3YXJkcyA9ICdDJyxcbn1cblxuaW50ZXJmYWNlIElDb29yZGluYXRlIHtcblx0eDogbnVtYmVyO1xuXHR5OiBudW1iZXI7XG5cdGJhc2VZOiBudW1iZXI7XG59XG5cbmNsYXNzIEN1cnNvciBpbXBsZW1lbnRzIElDb29yZGluYXRlIHtcblx0cHJpdmF0ZSBfeCA9IDA7XG5cdHByaXZhdGUgX3kgPSAxO1xuXHRwcml2YXRlIF9iYXNlWSA9IDE7XG5cblx0Z2V0IHgoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3g7XG5cdH1cblxuXHRnZXQgeSgpIHtcblx0XHRyZXR1cm4gdGhpcy5feTtcblx0fVxuXG5cdGdldCBiYXNlWSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fYmFzZVk7XG5cdH1cblxuXHRnZXQgY29vcmRpbmF0ZSgpOiBJQ29vcmRpbmF0ZSB7XG5cdFx0cmV0dXJuIHsgeDogdGhpcy5feCwgeTogdGhpcy5feSwgYmFzZVk6IHRoaXMuX2Jhc2VZIH07XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSByb3dzOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgY29sczogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2J1ZmZlcjogSUJ1ZmZlclxuXHQpIHtcblx0XHR0aGlzLl94ID0gX2J1ZmZlci5jdXJzb3JYO1xuXHRcdHRoaXMuX3kgPSBfYnVmZmVyLmN1cnNvclk7XG5cdFx0dGhpcy5fYmFzZVkgPSBfYnVmZmVyLmJhc2VZO1xuXHR9XG5cblx0Z2V0TGluZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fYnVmZmVyLmdldExpbmUodGhpcy5feSArIHRoaXMuX2Jhc2VZKTtcblx0fVxuXG5cdGdldENlbGwobG9hZEludG8/OiBJQnVmZmVyQ2VsbCkge1xuXHRcdHJldHVybiB0aGlzLmdldExpbmUoKT8uZ2V0Q2VsbCh0aGlzLl94LCBsb2FkSW50byk7XG5cdH1cblxuXHRtb3ZlVG8oY29vcmRpbmF0ZTogSUNvb3JkaW5hdGUpIHtcblx0XHR0aGlzLl94ID0gY29vcmRpbmF0ZS54O1xuXHRcdHRoaXMuX3kgPSAoY29vcmRpbmF0ZS55ICsgY29vcmRpbmF0ZS5iYXNlWSkgLSB0aGlzLl9iYXNlWTtcblx0XHRyZXR1cm4gdGhpcy5tb3ZlSW5zdHJ1Y3Rpb24oKTtcblx0fVxuXG5cdGNsb25lKCkge1xuXHRcdGNvbnN0IGMgPSBuZXcgQ3Vyc29yKHRoaXMucm93cywgdGhpcy5jb2xzLCB0aGlzLl9idWZmZXIpO1xuXHRcdGMubW92ZVRvKHRoaXMpO1xuXHRcdHJldHVybiBjO1xuXHR9XG5cblx0bW92ZSh4OiBudW1iZXIsIHk6IG51bWJlcikge1xuXHRcdHRoaXMuX3ggPSB4O1xuXHRcdHRoaXMuX3kgPSB5O1xuXHRcdHJldHVybiB0aGlzLm1vdmVJbnN0cnVjdGlvbigpO1xuXHR9XG5cblx0c2hpZnQoeDogbnVtYmVyID0gMCwgeTogbnVtYmVyID0gMCkge1xuXHRcdHRoaXMuX3ggKz0geDtcblx0XHR0aGlzLl95ICs9IHk7XG5cdFx0cmV0dXJuIHRoaXMubW92ZUluc3RydWN0aW9uKCk7XG5cdH1cblxuXHRtb3ZlSW5zdHJ1Y3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX3kgPj0gdGhpcy5yb3dzKSB7XG5cdFx0XHR0aGlzLl9iYXNlWSArPSB0aGlzLl95IC0gKHRoaXMucm93cyAtIDEpO1xuXHRcdFx0dGhpcy5feSA9IHRoaXMucm93cyAtIDE7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl95IDwgMCkge1xuXHRcdFx0dGhpcy5fYmFzZVkgLT0gdGhpcy5feTtcblx0XHRcdHRoaXMuX3kgPSAwO1xuXHRcdH1cblxuXHRcdHJldHVybiBgJHtWVC5Dc2l9JHt0aGlzLl95ICsgMX07JHt0aGlzLl94ICsgMX1IYDtcblx0fVxufVxuXG5jb25zdCBtb3ZlVG9Xb3JkQm91bmRhcnkgPSAoYjogSUJ1ZmZlciwgY3Vyc29yOiBDdXJzb3IsIGRpcmVjdGlvbjogLTEgfCAxKSA9PiB7XG5cdGxldCBhdGVMZWFkaW5nV2hpdGVzcGFjZSA9IGZhbHNlO1xuXHRpZiAoZGlyZWN0aW9uIDwgMCkge1xuXHRcdGN1cnNvci5zaGlmdCgtMSk7XG5cdH1cblxuXHRsZXQgY2VsbDogSUJ1ZmZlckNlbGwgfCB1bmRlZmluZWQ7XG5cdHdoaWxlIChjdXJzb3IueCA+PSAwKSB7XG5cdFx0Y2VsbCA9IGN1cnNvci5nZXRDZWxsKGNlbGwpO1xuXHRcdGlmICghY2VsbD8uZ2V0Q29kZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhcnMgPSBjZWxsLmdldENoYXJzKCk7XG5cdFx0aWYgKE5PVF9XT1JEX1JFLnRlc3QoY2hhcnMpKSB7XG5cdFx0XHRpZiAoYXRlTGVhZGluZ1doaXRlc3BhY2UpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF0ZUxlYWRpbmdXaGl0ZXNwYWNlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjdXJzb3Iuc2hpZnQoZGlyZWN0aW9uKTtcblx0fVxuXG5cdGlmIChkaXJlY3Rpb24gPCAwKSB7XG5cdFx0Y3Vyc29yLnNoaWZ0KDEpOyAvLyB3ZSB3YW50IHRvIHBsYWNlIHRoZSBjdXJzb3IgYWZ0ZXIgdGhlIHdoaXRlc3BhY2Ugc3RhcnRpbmcgdGhlIHdvcmRcblx0fVxufTtcblxuY29uc3QgZW51bSBNYXRjaFJlc3VsdCB7XG5cdC8qKiBtYXRjaGVkIHN1Y2Nlc3NmdWxseSAqL1xuXHRTdWNjZXNzLFxuXHQvKiogZmFpbGVkIHRvIG1hdGNoICovXG5cdEZhaWx1cmUsXG5cdC8qKiBidWZmZXIgZGF0YSwgaXQgbWlnaHQgbWF0Y2ggaW4gdGhlIGZ1dHVyZSBvbmUgbW9yZSBkYXRhIGNvbWVzIGluICovXG5cdEJ1ZmZlcixcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUHJlZGljdGlvbiB7XG5cdC8qKlxuXHQgKiBXaGV0aGVyIGFwcGx5aW5nIHRoaXMgcHJlZGljdGlvbiBjYW4gbW9kaWZ5IHRoZSBzdHlsZSBhdHRyaWJ1dGVzIG9mIHRoZVxuXHQgKiB0ZXJtaW5hbC4gSWYgc28gaXQgbWVhbnMgd2UgbmVlZCB0byByZXNldCB0aGUgY3Vyc29yIHN0eWxlIGlmIGl0J3Ncblx0ICogcm9sbGVkIGJhY2suXG5cdCAqL1xuXHRyZWFkb25seSBhZmZlY3RzU3R5bGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJZiBzZXQgdG8gZmFsc2UsIHRoZSBwcmVkaWN0aW9uIHdpbGwgbm90IGJlIGNsZWFyZWQgaWYgbm8gaW5wdXQgaXNcblx0ICogcmVjZWl2ZWQgZnJvbSB0aGUgc2VydmVyLlxuXHQgKi9cblx0cmVhZG9ubHkgY2xlYXJBZnRlclRpbWVvdXQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgc2VxdWVuY2UgdG8gYXBwbHkgdGhlIHByZWRpY3Rpb24uXG5cdCAqIEBwYXJhbSBidWZmZXIgdG8gd3JpdGUgdG9cblx0ICogQHBhcmFtIGN1cnNvciBwb3NpdGlvbiB0byB3cml0ZSB0aGUgZGF0YS4gU2hvdWxkIGFkdmFuY2UgdGhlIGN1cnNvci5cblx0ICogQHJldHVybnMgYSBzdHJpbmcgdG8gYmUgd3JpdHRlbiB0byB0aGUgdXNlciB0ZXJtaW5hbCwgb3Igb3B0aW9uYWxseSBhXG5cdCAqIHN0cmluZyBmb3IgdGhlIHVzZXIgdGVybWluYWwgYW5kIHJlYWwgcHR5LlxuXHQgKi9cblx0YXBwbHkoYnVmZmVyOiBJQnVmZmVyLCBjdXJzb3I6IEN1cnNvcik6IHN0cmluZztcblxuXHQvKipcblx0ICogUmV0dXJucyBhIHNlcXVlbmNlIHRvIHJvbGwgYmFjayBhIHByZXZpb3VzIGBhcHBseSgpYCBjYWxsLiBJZlxuXHQgKiBgcm9sbEZvcndhcmRzYCBpcyBub3QgZ2l2ZW4sIHRoZW4gdGhpcyBpcyBhbHNvIGNhbGxlZCBpZiBhIHByZWRpY3Rpb25cblx0ICogaXMgY29ycmVjdCBiZWZvcmUgc2hvdyB0aGUgdXNlcidzIGRhdGEuXG5cdCAqL1xuXHRyb2xsYmFjayhjdXJzb3I6IEN1cnNvcik6IHN0cmluZztcblxuXHQvKipcblx0ICogSWYgYXZhaWxhYmxlLCB0aGlzIHdpbGwgYmUgY2FsbGVkIHdoZW4gdGhlIHByZWRpY3Rpb24gaXMgY29ycmVjdC5cblx0ICovXG5cdHJvbGxGb3J3YXJkcyhjdXJzb3I6IEN1cnNvciwgd2l0aElucHV0OiBzdHJpbmcpOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciB0aGUgZ2l2ZW4gaW5wdXQgaXMgb25lIGV4cGVjdGVkIGJ5IHRoaXMgcHJlZGljdGlvbi5cblx0ICogQHBhcmFtIGlucHV0IHJlYWRlciBmb3IgdGhlIGlucHV0IHRoZSBQVFkgaXMgZ2l2aW5nXG5cdCAqIEBwYXJhbSBsb29rQmVoaW5kIHRoZSBsYXN0IHN1Y2Nlc3NmdWxseS1tYWRlIHByZWRpY3Rpb24sIGlmIGFueVxuXHQgKi9cblx0bWF0Y2hlcyhpbnB1dDogU3RyaW5nUmVhZGVyLCBsb29rQmVoaW5kPzogSVByZWRpY3Rpb24pOiBNYXRjaFJlc3VsdDtcbn1cblxuY2xhc3MgU3RyaW5nUmVhZGVyIHtcblx0aW5kZXggPSAwO1xuXG5cdGdldCByZW1haW5pbmcoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2lucHV0Lmxlbmd0aCAtIHRoaXMuaW5kZXg7XG5cdH1cblxuXHRnZXQgZW9mKCkge1xuXHRcdHJldHVybiB0aGlzLmluZGV4ID09PSB0aGlzLl9pbnB1dC5sZW5ndGg7XG5cdH1cblxuXHRnZXQgcmVzdCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faW5wdXQuc2xpY2UodGhpcy5pbmRleCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbnB1dDogc3RyaW5nXG5cdCkgeyB9XG5cblx0LyoqXG5cdCAqIEFkdmFuY2VzIHRoZSByZWFkZXIgYW5kIHJldHVybnMgdGhlIGNoYXJhY3RlciBpZiBpdCBtYXRjaGVzLlxuXHQgKi9cblx0ZWF0Q2hhcihjaGFyOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5faW5wdXRbdGhpcy5pbmRleF0gIT09IGNoYXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmluZGV4Kys7XG5cdFx0cmV0dXJuIGNoYXI7XG5cdH1cblxuXHQvKipcblx0ICogQWR2YW5jZXMgdGhlIHJlYWRlciBhbmQgcmV0dXJucyB0aGUgc3RyaW5nIGlmIGl0IG1hdGNoZXMuXG5cdCAqL1xuXHRlYXRTdHIoc3Vic3RyOiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5faW5wdXQuc2xpY2UodGhpcy5pbmRleCwgc3Vic3RyLmxlbmd0aCkgIT09IHN1YnN0cikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5kZXggKz0gc3Vic3RyLmxlbmd0aDtcblx0XHRyZXR1cm4gc3Vic3RyO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hdGNoZXMgYW5kIGVhdHMgdGhlIHN1YnN0cmluZyBjaGFyYWN0ZXItYnktY2hhcmFjdGVyLiBJZiBFT0YgaXMgcmVhY2hlZFxuXHQgKiBiZWZvcmUgdGhlIHN1YnN0cmluZyBpcyBjb25zdW1lZCwgaXQgd2lsbCBidWZmZXIuIEluZGV4IGlzIG5vdCBtb3ZlZFxuXHQgKiBpZiBpdCdzIG5vdCBhIG1hdGNoLlxuXHQgKi9cblx0ZWF0R3JhZHVhbGx5KHN1YnN0cjogc3RyaW5nKTogTWF0Y2hSZXN1bHQge1xuXHRcdGNvbnN0IHByZXZJbmRleCA9IHRoaXMuaW5kZXg7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdWJzdHIubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChpID4gMCAmJiB0aGlzLmVvZikge1xuXHRcdFx0XHRyZXR1cm4gTWF0Y2hSZXN1bHQuQnVmZmVyO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuZWF0Q2hhcihzdWJzdHJbaV0pKSB7XG5cdFx0XHRcdHRoaXMuaW5kZXggPSBwcmV2SW5kZXg7XG5cdFx0XHRcdHJldHVybiBNYXRjaFJlc3VsdC5GYWlsdXJlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBNYXRjaFJlc3VsdC5TdWNjZXNzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkdmFuY2VzIHRoZSByZWFkZXIgYW5kIHJldHVybnMgdGhlIHJlZ2V4IGlmIGl0IG1hdGNoZXMuXG5cdCAqL1xuXHRlYXRSZShyZTogUmVnRXhwKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSByZS5leGVjKHRoaXMuX2lucHV0LnNsaWNlKHRoaXMuaW5kZXgpKTtcblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5pbmRleCArPSBtYXRjaFswXS5sZW5ndGg7XG5cdFx0cmV0dXJuIG1hdGNoO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkdmFuY2VzIHRoZSByZWFkZXIgYW5kIHJldHVybnMgdGhlIGNoYXJhY3RlciBpZiB0aGUgY29kZSBtYXRjaGVzLlxuXHQgKi9cblx0ZWF0Q2hhckNvZGUobWluID0gMCwgbWF4ID0gbWluICsgMSkge1xuXHRcdGNvbnN0IGNvZGUgPSB0aGlzLl9pbnB1dC5jaGFyQ29kZUF0KHRoaXMuaW5kZXgpO1xuXHRcdGlmIChjb2RlIDwgbWluIHx8IGNvZGUgPj0gbWF4KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5kZXgrKztcblx0XHRyZXR1cm4gY29kZTtcblx0fVxufVxuXG4vKipcbiAqIFByZWlkY3Rpb24gd2hpY2ggbmV2ZXIgdGVzdHMgdHJ1ZS4gV2lsbCBhbHdheXMgZGlzY2FyZCBwcmVkaWN0aW9ucyBtYWRlXG4gKiBhZnRlciBpdC5cbiAqL1xuY2xhc3MgSGFyZEJvdW5kYXJ5IGltcGxlbWVudHMgSVByZWRpY3Rpb24ge1xuXHRyZWFkb25seSBjbGVhckFmdGVyVGltZW91dCA9IGZhbHNlO1xuXG5cdGFwcGx5KCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHJvbGxiYWNrKCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHJvbGxGb3J3YXJkcygpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRtYXRjaGVzKCkge1xuXHRcdHJldHVybiBNYXRjaFJlc3VsdC5GYWlsdXJlO1xuXHR9XG59XG5cbi8qKlxuICogV3JhcHMgYW5vdGhlciBwcmVkaWN0aW9uLiBEb2VzIG5vdCBhcHBseSB0aGUgcHJlZGljdGlvbiwgYnV0IHdpbGwgcGFzc1xuICogdGhyb3VnaCBpdHMgYG1hdGNoZXNgIHJlcXVlc3QuXG4gKi9cbmNsYXNzIFRlbnRhdGl2ZUJvdW5kYXJ5IGltcGxlbWVudHMgSVByZWRpY3Rpb24ge1xuXHRwcml2YXRlIF9hcHBsaWVkQ3Vyc29yPzogQ3Vyc29yO1xuXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IGlubmVyOiBJUHJlZGljdGlvbikgeyB9XG5cblx0YXBwbHkoYnVmZmVyOiBJQnVmZmVyLCBjdXJzb3I6IEN1cnNvcikge1xuXHRcdHRoaXMuX2FwcGxpZWRDdXJzb3IgPSBjdXJzb3IuY2xvbmUoKTtcblx0XHR0aGlzLmlubmVyLmFwcGx5KGJ1ZmZlciwgdGhpcy5fYXBwbGllZEN1cnNvcik7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cm9sbGJhY2soY3Vyc29yOiBDdXJzb3IpIHtcblx0XHR0aGlzLmlubmVyLnJvbGxiYWNrKGN1cnNvci5jbG9uZSgpKTtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRyb2xsRm9yd2FyZHMoY3Vyc29yOiBDdXJzb3IsIHdpdGhJbnB1dDogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMuX2FwcGxpZWRDdXJzb3IpIHtcblx0XHRcdGN1cnNvci5tb3ZlVG8odGhpcy5fYXBwbGllZEN1cnNvcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdpdGhJbnB1dDtcblx0fVxuXG5cdG1hdGNoZXMoaW5wdXQ6IFN0cmluZ1JlYWRlcikge1xuXHRcdHJldHVybiB0aGlzLmlubmVyLm1hdGNoZXMoaW5wdXQpO1xuXHR9XG59XG5cbmNvbnN0IGlzVGVuYXRpdmVDaGFyYWN0ZXJQcmVkaWN0aW9uID0gKHA6IHVua25vd24pOiBwIGlzIChUZW50YXRpdmVCb3VuZGFyeSAmIHsgaW5uZXI6IENoYXJhY3RlclByZWRpY3Rpb24gfSkgPT5cblx0cCBpbnN0YW5jZW9mIFRlbnRhdGl2ZUJvdW5kYXJ5ICYmIHAuaW5uZXIgaW5zdGFuY2VvZiBDaGFyYWN0ZXJQcmVkaWN0aW9uO1xuXG4vKipcbiAqIFByZWRpY3Rpb24gZm9yIGEgc2luZ2xlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXIuXG4gKi9cbmNsYXNzIENoYXJhY3RlclByZWRpY3Rpb24gaW1wbGVtZW50cyBJUHJlZGljdGlvbiB7XG5cdHJlYWRvbmx5IGFmZmVjdHNTdHlsZSA9IHRydWU7XG5cblx0YXBwbGllZEF0Pzoge1xuXHRcdHBvczogSUNvb3JkaW5hdGU7XG5cdFx0b2xkQXR0cmlidXRlczogc3RyaW5nO1xuXHRcdG9sZENoYXI6IHN0cmluZztcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9zdHlsZTogVHlwZUFoZWFkU3R5bGUsIHByaXZhdGUgcmVhZG9ubHkgX2NoYXI6IHN0cmluZykgeyB9XG5cblx0YXBwbHkoXzogSUJ1ZmZlciwgY3Vyc29yOiBDdXJzb3IpIHtcblx0XHRjb25zdCBjZWxsID0gY3Vyc29yLmdldENlbGwoKTtcblx0XHR0aGlzLmFwcGxpZWRBdCA9IGNlbGxcblx0XHRcdD8geyBwb3M6IGN1cnNvci5jb29yZGluYXRlLCBvbGRBdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzVG9TZXEoY2VsbCksIG9sZENoYXI6IGNlbGwuZ2V0Q2hhcnMoKSB9XG5cdFx0XHQ6IHsgcG9zOiBjdXJzb3IuY29vcmRpbmF0ZSwgb2xkQXR0cmlidXRlczogJycsIG9sZENoYXI6ICcnIH07XG5cblx0XHRjdXJzb3Iuc2hpZnQoMSk7XG5cblx0XHRyZXR1cm4gdGhpcy5fc3R5bGUuYXBwbHkgKyB0aGlzLl9jaGFyICsgdGhpcy5fc3R5bGUudW5kbztcblx0fVxuXG5cdHJvbGxiYWNrKGN1cnNvcjogQ3Vyc29yKSB7XG5cdFx0aWYgKCF0aGlzLmFwcGxpZWRBdCkge1xuXHRcdFx0cmV0dXJuICcnOyAvLyBub3QgYXBwbGllZFxuXHRcdH1cblxuXHRcdGNvbnN0IHsgb2xkQXR0cmlidXRlcywgb2xkQ2hhciwgcG9zIH0gPSB0aGlzLmFwcGxpZWRBdDtcblx0XHRjb25zdCByID0gY3Vyc29yLm1vdmVUbyhwb3MpICsgKG9sZENoYXIgPyBgJHtvbGRBdHRyaWJ1dGVzfSR7b2xkQ2hhcn0ke2N1cnNvci5tb3ZlVG8ocG9zKX1gIDogVlQuRGVsZXRlQ2hhcik7XG5cdFx0cmV0dXJuIHI7XG5cdH1cblxuXHRyb2xsRm9yd2FyZHMoY3Vyc29yOiBDdXJzb3IsIGlucHV0OiBzdHJpbmcpIHtcblx0XHRpZiAoIXRoaXMuYXBwbGllZEF0KSB7XG5cdFx0XHRyZXR1cm4gJyc7IC8vIG5vdCBhcHBsaWVkXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGN1cnNvci5jbG9uZSgpLm1vdmVUbyh0aGlzLmFwcGxpZWRBdC5wb3MpICsgaW5wdXQ7XG5cdH1cblxuXHRtYXRjaGVzKGlucHV0OiBTdHJpbmdSZWFkZXIsIGxvb2tCZWhpbmQ/OiBJUHJlZGljdGlvbikge1xuXHRcdGNvbnN0IHN0YXJ0SW5kZXggPSBpbnB1dC5pbmRleDtcblxuXHRcdC8vIHJlbW92ZSBhbnkgc3R5bGluZyBDU0kgYmVmb3JlIGNoZWNraW5nIHRoZSBjaGFyXG5cdFx0d2hpbGUgKGlucHV0LmVhdFJlKENTSV9TVFlMRV9SRSkpIHsgfVxuXG5cdFx0aWYgKGlucHV0LmVvZikge1xuXHRcdFx0cmV0dXJuIE1hdGNoUmVzdWx0LkJ1ZmZlcjtcblx0XHR9XG5cblx0XHRpZiAoaW5wdXQuZWF0Q2hhcih0aGlzLl9jaGFyKSkge1xuXHRcdFx0cmV0dXJuIE1hdGNoUmVzdWx0LlN1Y2Nlc3M7XG5cdFx0fVxuXG5cdFx0aWYgKGxvb2tCZWhpbmQgaW5zdGFuY2VvZiBDaGFyYWN0ZXJQcmVkaWN0aW9uKSB7XG5cdFx0XHQvLyBzZWUgIzExMjg0MlxuXHRcdFx0Y29uc3Qgc2lsbHlac2hPdXRjb21lID0gaW5wdXQuZWF0R3JhZHVhbGx5KGBcXGIke2xvb2tCZWhpbmQuX2NoYXJ9JHt0aGlzLl9jaGFyfWApO1xuXHRcdFx0aWYgKHNpbGx5WnNoT3V0Y29tZSAhPT0gTWF0Y2hSZXN1bHQuRmFpbHVyZSkge1xuXHRcdFx0XHRyZXR1cm4gc2lsbHlac2hPdXRjb21lO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlucHV0LmluZGV4ID0gc3RhcnRJbmRleDtcblx0XHRyZXR1cm4gTWF0Y2hSZXN1bHQuRmFpbHVyZTtcblx0fVxufVxuXG5jbGFzcyBCYWNrc3BhY2VQcmVkaWN0aW9uIGltcGxlbWVudHMgSVByZWRpY3Rpb24ge1xuXHRwcm90ZWN0ZWQgX2FwcGxpZWRBdD86IHtcblx0XHRwb3M6IElDb29yZGluYXRlO1xuXHRcdG9sZEF0dHJpYnV0ZXM6IHN0cmluZztcblx0XHRvbGRDaGFyOiBzdHJpbmc7XG5cdFx0aXNMYXN0Q2hhcjogYm9vbGVhbjtcblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbDogVGVybWluYWwpIHsgfVxuXG5cdGFwcGx5KF86IElCdWZmZXIsIGN1cnNvcjogQ3Vyc29yKSB7XG5cdFx0Ly8gYXQgZW9sIGlmIGV2ZXJ5dGhpbmcgdG8gdGhlIHJpZ2h0IGlzIHdoaXRlc3BhY2UgKHpzaCB3aWxsIGVtaXQgYSBcImNsZWFyIGxpbmVcIiBjb2RlIGluIHRoaXMgY2FzZSlcblx0XHQvLyB0b2RvOiBjYW4gYmUgb3B0aW1pemVkIGlmIGBnZXRUcmltbWVkTGVuZ3RoYCBpcyBleHBvc2VkIGZyb20geHRlcm1cblx0XHRjb25zdCBpc0xhc3RDaGFyID0gIWN1cnNvci5nZXRMaW5lKCk/LnRyYW5zbGF0ZVRvU3RyaW5nKHVuZGVmaW5lZCwgY3Vyc29yLngpLnRyaW0oKTtcblx0XHRjb25zdCBwb3MgPSBjdXJzb3IuY29vcmRpbmF0ZTtcblx0XHRjb25zdCBtb3ZlID0gY3Vyc29yLnNoaWZ0KC0xKTtcblx0XHRjb25zdCBjZWxsID0gY3Vyc29yLmdldENlbGwoKTtcblx0XHR0aGlzLl9hcHBsaWVkQXQgPSBjZWxsXG5cdFx0XHQ/IHsgaXNMYXN0Q2hhciwgcG9zLCBvbGRBdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzVG9TZXEoY2VsbCksIG9sZENoYXI6IGNlbGwuZ2V0Q2hhcnMoKSB9XG5cdFx0XHQ6IHsgaXNMYXN0Q2hhciwgcG9zLCBvbGRBdHRyaWJ1dGVzOiAnJywgb2xkQ2hhcjogJycgfTtcblxuXHRcdHJldHVybiBtb3ZlICsgVlQuRGVsZXRlQ2hhcjtcblx0fVxuXG5cdHJvbGxiYWNrKGN1cnNvcjogQ3Vyc29yKSB7XG5cdFx0aWYgKCF0aGlzLl9hcHBsaWVkQXQpIHtcblx0XHRcdHJldHVybiAnJzsgLy8gbm90IGFwcGxpZWRcblx0XHR9XG5cblx0XHRjb25zdCB7IG9sZEF0dHJpYnV0ZXMsIG9sZENoYXIsIHBvcyB9ID0gdGhpcy5fYXBwbGllZEF0O1xuXHRcdGlmICghb2xkQ2hhcikge1xuXHRcdFx0cmV0dXJuIGN1cnNvci5tb3ZlVG8ocG9zKSArIFZULkRlbGV0ZUNoYXI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG9sZEF0dHJpYnV0ZXMgKyBvbGRDaGFyICsgY3Vyc29yLm1vdmVUbyhwb3MpICsgYXR0cmlidXRlc1RvU2VxKGNvcmUodGhpcy5fdGVybWluYWwpLl9pbnB1dEhhbmRsZXIuX2N1ckF0dHJEYXRhKTtcblx0fVxuXG5cdHJvbGxGb3J3YXJkcygpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRtYXRjaGVzKGlucHV0OiBTdHJpbmdSZWFkZXIpIHtcblx0XHRpZiAodGhpcy5fYXBwbGllZEF0Py5pc0xhc3RDaGFyKSB7XG5cdFx0XHRjb25zdCByMSA9IGlucHV0LmVhdEdyYWR1YWxseShgXFxiJHtWVC5Dc2l9S2ApO1xuXHRcdFx0aWYgKHIxICE9PSBNYXRjaFJlc3VsdC5GYWlsdXJlKSB7XG5cdFx0XHRcdHJldHVybiByMTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcjIgPSBpbnB1dC5lYXRHcmFkdWFsbHkoYFxcYiBcXGJgKTtcblx0XHRcdGlmIChyMiAhPT0gTWF0Y2hSZXN1bHQuRmFpbHVyZSkge1xuXHRcdFx0XHRyZXR1cm4gcjI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE1hdGNoUmVzdWx0LkZhaWx1cmU7XG5cdH1cbn1cblxuY2xhc3MgTmV3bGluZVByZWRpY3Rpb24gaW1wbGVtZW50cyBJUHJlZGljdGlvbiB7XG5cdHByb3RlY3RlZCBfcHJldlBvc2l0aW9uPzogSUNvb3JkaW5hdGU7XG5cblx0YXBwbHkoXzogSUJ1ZmZlciwgY3Vyc29yOiBDdXJzb3IpIHtcblx0XHR0aGlzLl9wcmV2UG9zaXRpb24gPSBjdXJzb3IuY29vcmRpbmF0ZTtcblx0XHRjdXJzb3IubW92ZSgwLCBjdXJzb3IueSArIDEpO1xuXHRcdHJldHVybiAnXFxyXFxuJztcblx0fVxuXG5cdHJvbGxiYWNrKGN1cnNvcjogQ3Vyc29yKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZQb3NpdGlvbiA/IGN1cnNvci5tb3ZlVG8odGhpcy5fcHJldlBvc2l0aW9uKSA6ICcnO1xuXHR9XG5cblx0cm9sbEZvcndhcmRzKCkge1xuXHRcdHJldHVybiAnJzsgLy8gZG9lcyBub3QgbmVlZCB0byByZXdyaXRlXG5cdH1cblxuXHRtYXRjaGVzKGlucHV0OiBTdHJpbmdSZWFkZXIpIHtcblx0XHRyZXR1cm4gaW5wdXQuZWF0R3JhZHVhbGx5KCdcXHJcXG4nKTtcblx0fVxufVxuXG4vKipcbiAqIFByZWRpY3Rpb24gd2hlbiB0aGUgY3Vyc29yIHJlYWNoZXMgdGhlIGVuZCBvZiB0aGUgbGluZS4gU2ltaWxhciB0byBuZXdsaW5lXG4gKiBwcmVkaWN0aW9uLCBidXQgc2hlbGxzIGhhbmRsZSBpdCBzbGlnaHRseSBkaWZmZXJlbnRseS5cbiAqL1xuY2xhc3MgTGluZXdyYXBQcmVkaWN0aW9uIGV4dGVuZHMgTmV3bGluZVByZWRpY3Rpb24gaW1wbGVtZW50cyBJUHJlZGljdGlvbiB7XG5cdG92ZXJyaWRlIGFwcGx5KF86IElCdWZmZXIsIGN1cnNvcjogQ3Vyc29yKSB7XG5cdFx0dGhpcy5fcHJldlBvc2l0aW9uID0gY3Vyc29yLmNvb3JkaW5hdGU7XG5cdFx0Y3Vyc29yLm1vdmUoMCwgY3Vyc29yLnkgKyAxKTtcblx0XHRyZXR1cm4gJyBcXHInO1xuXHR9XG5cblx0b3ZlcnJpZGUgbWF0Y2hlcyhpbnB1dDogU3RyaW5nUmVhZGVyKSB7XG5cdFx0Ly8gYmFzaCBhbmQgenNoZWxsIGFkZCBhIHNwYWNlIHdoaWNoIHdyYXBzIGluIHRoZSB0ZXJtaW5hbCwgdGhlbiBhIENSXG5cdFx0Y29uc3QgciA9IGlucHV0LmVhdEdyYWR1YWxseSgnIFxccicpO1xuXHRcdGlmIChyICE9PSBNYXRjaFJlc3VsdC5GYWlsdXJlKSB7XG5cdFx0XHQvLyB6c2hlbGwgYWRkaXRpb25hbGx5IGFkZHMgYSBjbGVhciBsaW5lIGFmdGVyIHdyYXBwaW5nIHRvIGJlIHNhZmUgLS0gZWF0IGl0XG5cdFx0XHRjb25zdCByMiA9IGlucHV0LmVhdEdyYWR1YWxseShWVC5EZWxldGVSZXN0T2ZMaW5lKTtcblx0XHRcdHJldHVybiByMiA9PT0gTWF0Y2hSZXN1bHQuQnVmZmVyID8gTWF0Y2hSZXN1bHQuQnVmZmVyIDogcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5wdXQuZWF0R3JhZHVhbGx5KCdcXHJcXG4nKTtcblx0fVxufVxuXG5jbGFzcyBDdXJzb3JNb3ZlUHJlZGljdGlvbiBpbXBsZW1lbnRzIElQcmVkaWN0aW9uIHtcblx0cHJpdmF0ZSBfYXBwbGllZD86IHtcblx0XHRyb2xsRm9yd2FyZDogc3RyaW5nO1xuXHRcdHByZXZQb3NpdGlvbjogbnVtYmVyO1xuXHRcdHByZXZBdHRyczogc3RyaW5nO1xuXHRcdGFtb3VudDogbnVtYmVyO1xuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RpcmVjdGlvbjogQ3Vyc29yTW92ZURpcmVjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb3ZlQnlXb3JkczogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hbW91bnQ6IG51bWJlcixcblx0KSB7IH1cblxuXHRhcHBseShidWZmZXI6IElCdWZmZXIsIGN1cnNvcjogQ3Vyc29yKSB7XG5cdFx0Y29uc3QgcHJldlBvc2l0aW9uID0gY3Vyc29yLng7XG5cdFx0Y29uc3QgY3VycmVudENlbGwgPSBjdXJzb3IuZ2V0Q2VsbCgpO1xuXHRcdGNvbnN0IHByZXZBdHRycyA9IGN1cnJlbnRDZWxsID8gYXR0cmlidXRlc1RvU2VxKGN1cnJlbnRDZWxsKSA6ICcnO1xuXG5cdFx0Y29uc3QgeyBfYW1vdW50OiBhbW91bnQsIF9kaXJlY3Rpb246IGRpcmVjdGlvbiwgX21vdmVCeVdvcmRzOiBtb3ZlQnlXb3JkcyB9ID0gdGhpcztcblx0XHRjb25zdCBkZWx0YSA9IGRpcmVjdGlvbiA9PT0gQ3Vyc29yTW92ZURpcmVjdGlvbi5CYWNrID8gLTEgOiAxO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gY3Vyc29yLmNsb25lKCk7XG5cdFx0aWYgKG1vdmVCeVdvcmRzKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFtb3VudDsgaSsrKSB7XG5cdFx0XHRcdG1vdmVUb1dvcmRCb3VuZGFyeShidWZmZXIsIHRhcmdldCwgZGVsdGEpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXJnZXQuc2hpZnQoZGVsdGEgKiBhbW91bnQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FwcGxpZWQgPSB7XG5cdFx0XHRhbW91bnQ6IE1hdGguYWJzKGN1cnNvci54IC0gdGFyZ2V0LngpLFxuXHRcdFx0cHJldlBvc2l0aW9uLFxuXHRcdFx0cHJldkF0dHJzLFxuXHRcdFx0cm9sbEZvcndhcmQ6IGN1cnNvci5tb3ZlVG8odGFyZ2V0KSxcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRoaXMuX2FwcGxpZWQucm9sbEZvcndhcmQ7XG5cdH1cblxuXHRyb2xsYmFjayhjdXJzb3I6IEN1cnNvcikge1xuXHRcdGlmICghdGhpcy5fYXBwbGllZCkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdHJldHVybiBjdXJzb3IubW92ZSh0aGlzLl9hcHBsaWVkLnByZXZQb3NpdGlvbiwgY3Vyc29yLnkpICsgdGhpcy5fYXBwbGllZC5wcmV2QXR0cnM7XG5cdH1cblxuXHRyb2xsRm9yd2FyZHMoKSB7XG5cdFx0cmV0dXJuICcnOyAvLyBkb2VzIG5vdCBuZWVkIHRvIHJld3JpdGVcblx0fVxuXG5cdG1hdGNoZXMoaW5wdXQ6IFN0cmluZ1JlYWRlcikge1xuXHRcdGlmICghdGhpcy5fYXBwbGllZCkge1xuXHRcdFx0cmV0dXJuIE1hdGNoUmVzdWx0LkZhaWx1cmU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlyZWN0aW9uID0gdGhpcy5fZGlyZWN0aW9uO1xuXHRcdGNvbnN0IHsgYW1vdW50LCByb2xsRm9yd2FyZCB9ID0gdGhpcy5fYXBwbGllZDtcblxuXG5cdFx0Ly8gYXJnIGNhbiBiZSBvbWl0dGVkIHRvIG1vdmUgb25lIGNoYXJhY3Rlci4gV2UgZG9uJ3QgZWF0R3JhZHVhbGx5KCkgaGVyZVxuXHRcdC8vIG9yIGJlbG93IG1vdmVzIHRoYXQgZG9uJ3QgZ28gYXMgZmFyIGFzIHRoZSBjdXJzb3Igd291bGQgYmUgYnVmZmVyZWRcblx0XHQvLyBpbmRlZmluaXRlbHlcblx0XHRpZiAoaW5wdXQuZWF0U3RyKGAke1ZULkNzaX0ke2RpcmVjdGlvbn1gLnJlcGVhdChhbW91bnQpKSkge1xuXHRcdFx0cmV0dXJuIE1hdGNoUmVzdWx0LlN1Y2Nlc3M7XG5cdFx0fVxuXG5cdFx0Ly8gXFxiIGlzIHRoZSBlcXVpdmFsZW50IHRvIG1vdmluZyBvbmUgY2hhcmFjdGVyIGJhY2tcblx0XHRpZiAoZGlyZWN0aW9uID09PSBDdXJzb3JNb3ZlRGlyZWN0aW9uLkJhY2spIHtcblx0XHRcdGlmIChpbnB1dC5lYXRTdHIoYFxcYmAucmVwZWF0KGFtb3VudCkpKSB7XG5cdFx0XHRcdHJldHVybiBNYXRjaFJlc3VsdC5TdWNjZXNzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGNoZWNrIGlmIHRoZSBjdXJzb3IgcG9zaXRpb24gaXMgc2V0IGFic29sdXRlbHlcblx0XHRpZiAocm9sbEZvcndhcmQpIHtcblx0XHRcdGNvbnN0IHIgPSBpbnB1dC5lYXRHcmFkdWFsbHkocm9sbEZvcndhcmQpO1xuXHRcdFx0aWYgKHIgIT09IE1hdGNoUmVzdWx0LkZhaWx1cmUpIHtcblx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgZm9yIGEgcmVsYXRpdmUgbW92ZSBpbiB0aGUgZGlyZWN0aW9uXG5cdFx0cmV0dXJuIGlucHV0LmVhdEdyYWR1YWxseShgJHtWVC5Dc2l9JHthbW91bnR9JHtkaXJlY3Rpb259YCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFByZWRpY3Rpb25TdGF0cyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0czogW2xhdGVuY3k6IG51bWJlciwgY29ycmVjdDogYm9vbGVhbl1bXSA9IFtdO1xuXHRwcml2YXRlIF9pbmRleCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FkZGVkQXRUaW1lID0gbmV3IFdlYWtNYXA8SVByZWRpY3Rpb24sIG51bWJlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhbmdlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkNoYW5nZSA9IHRoaXMuX2NoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIHBlcmNlbnQgKDAtMSkgb2YgcHJlZGljdGlvbnMgdGhhdCB3ZXJlIGFjY3VyYXRlLlxuXHQgKi9cblx0Z2V0IGFjY3VyYWN5KCkge1xuXHRcdGxldCBjb3JyZWN0Q291bnQgPSAwO1xuXHRcdGZvciAoY29uc3QgWywgY29ycmVjdF0gb2YgdGhpcy5fc3RhdHMpIHtcblx0XHRcdGlmIChjb3JyZWN0KSB7XG5cdFx0XHRcdGNvcnJlY3RDb3VudCsrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjb3JyZWN0Q291bnQgLyAodGhpcy5fc3RhdHMubGVuZ3RoIHx8IDEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIG51bWJlciBvZiByZWNvcmRlZCBzdGF0cy5cblx0ICovXG5cdGdldCBzYW1wbGVTaXplKCkge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0cy5sZW5ndGg7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBsYXRlbmN5IHN0YXRzIG9mIHN1Y2Nlc3NmdWwgcHJlZGljdGlvbnMuXG5cdCAqL1xuXHRnZXQgbGF0ZW5jeSgpIHtcblx0XHRjb25zdCBsYXRlbmNpZXMgPSB0aGlzLl9zdGF0cy5maWx0ZXIoKFssIGNvcnJlY3RdKSA9PiBjb3JyZWN0KS5tYXAoKFtzXSkgPT4gcykuc29ydCgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvdW50OiBsYXRlbmNpZXMubGVuZ3RoLFxuXHRcdFx0bWluOiBsYXRlbmNpZXNbMF0sXG5cdFx0XHRtZWRpYW46IGxhdGVuY2llc1tNYXRoLmZsb29yKGxhdGVuY2llcy5sZW5ndGggLyAyKV0sXG5cdFx0XHRtYXg6IGxhdGVuY2llc1tsYXRlbmNpZXMubGVuZ3RoIC0gMV0sXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBtYXhpbXVtIG9ic2VydmVkIGxhdGVuY3kuXG5cdCAqL1xuXHRnZXQgbWF4TGF0ZW5jeSgpIHtcblx0XHRsZXQgbWF4ID0gLUluZmluaXR5O1xuXHRcdGZvciAoY29uc3QgW2xhdGVuY3ksIGNvcnJlY3RdIG9mIHRoaXMuX3N0YXRzKSB7XG5cdFx0XHRpZiAoY29ycmVjdCkge1xuXHRcdFx0XHRtYXggPSBNYXRoLm1heChsYXRlbmN5LCBtYXgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtYXg7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcih0aW1lbGluZTogUHJlZGljdGlvblRpbWVsaW5lKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aW1lbGluZS5vblByZWRpY3Rpb25BZGRlZChwID0+IHRoaXMuX2FkZGVkQXRUaW1lLnNldChwLCBEYXRlLm5vdygpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRpbWVsaW5lLm9uUHJlZGljdGlvblN1Y2NlZWRlZCh0aGlzLl9wdXNoU3RhdC5iaW5kKHRoaXMsIHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGltZWxpbmUub25QcmVkaWN0aW9uRmFpbGVkKHRoaXMuX3B1c2hTdGF0LmJpbmQodGhpcywgZmFsc2UpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9wdXNoU3RhdChjb3JyZWN0OiBib29sZWFuLCBwcmVkaWN0aW9uOiBJUHJlZGljdGlvbikge1xuXHRcdGNvbnN0IHN0YXJ0ZWQgPSB0aGlzLl9hZGRlZEF0VGltZS5nZXQocHJlZGljdGlvbikhO1xuXHRcdHRoaXMuX3N0YXRzW3RoaXMuX2luZGV4XSA9IFtEYXRlLm5vdygpIC0gc3RhcnRlZCwgY29ycmVjdF07XG5cdFx0dGhpcy5faW5kZXggPSAodGhpcy5faW5kZXggKyAxKSAlIFN0YXRzQ29uc3RhbnRzLlN0YXRzQnVmZmVyU2l6ZTtcblx0XHR0aGlzLl9jaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUHJlZGljdGlvblRpbWVsaW5lIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdC8qKlxuXHQgKiBFeHBlY3RlZCBxdWV1ZSBvZiBldmVudHMuIE9ubHkgcHJlZGljdGlvbnMgZm9yIHRoZSBsb3dlc3QgYXJlXG5cdCAqIHdyaXR0ZW4gaW50byB0aGUgdGVybWluYWwuXG5cdCAqL1xuXHRwcml2YXRlIF9leHBlY3RlZDogKHsgZ2VuOiBudW1iZXI7IHA6IElQcmVkaWN0aW9uIH0pW10gPSBbXTtcblxuXHQvKipcblx0ICogQ3VycmVudCBwcmVkaWN0aW9uIGdlbmVyYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9jdXJyZW50R2VuID0gMDtcblxuXHQvKipcblx0ICogQ3VycmVudCBjdXJzb3IgcG9zaXRpb24gLS0ga2VwdCBvdXRzaWRlIHRoZSBidWZmZXIgc2luY2UgaXQgY2FuIGJlIGFoZWFkXG5cdCAqIGlmIHR5cGluZyBzd2lmdGx5LiBUaGUgcG9zaXRpb24gb2YgdGhlIGN1cnNvciB0aGF0IHRoZSB1c2VyIGlzIGN1cnJlbnRseVxuXHQgKiBsb29raW5nIGF0IG9uIHRoZWlyIHNjcmVlbiAob3Igd2lsbCBiZSBsb29raW5nIGF0IGFmdGVyIGFsbCBwZW5kaW5nIHdyaXRlc1xuXHQgKiBhcmUgZmx1c2hlZC4pXG5cdCAqL1xuXHRwcml2YXRlIF9waHlzaWNhbEN1cnNvcjogQ3Vyc29yIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBDdXJzb3IgcG9zaXRpb24gdGFraW5nIGludG8gYWNjb3VudCBhbGwgKHBvc3NpYmx5IG5vdC15ZXQtYXBwbGllZClcblx0ICogcHJlZGljdGlvbnMuIEEgbmV3IHByZWRpY3Rpb24gaW5zZXJ0ZWQsIGlmIGFwcGxpZWQsIHdpbGwgYmUgYXBwbGllZCBhdFxuXHQgKiB0aGUgcG9zaXRpb24gb2YgdGhlIHRlbnRhdGl2ZSBjdXJzb3IuXG5cdCAqL1xuXHRwcml2YXRlIF90ZW5hdGl2ZUN1cnNvcjogQ3Vyc29yIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBQcmV2aW91c2x5IHNlbnQgZGF0YSB0aGF0IHdhcyBidWZmZXJlZCBhbmQgc2hvdWxkIGJlIHByZXBlbmRlZCB0byB0aGVcblx0ICogbmV4dCBpbnB1dC5cblx0ICovXG5cdHByaXZhdGUgX2lucHV0QnVmZmVyPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHByZWRpY3Rpb25zIGFyZSBlY2hvZWQgdG8gdGhlIHRlcm1pbmFsLiBJZiBmYWxzZSwgcHJlZGljdGlvbnNcblx0ICogd2lsbCBzdGlsbCBiZSBjb21wdXRlZCBpbnRlcm5hbGx5IGZvciBsYXRlbmN5IG1ldHJpY3MsIGJ1dCBpbnB1dCB3aWxsXG5cdCAqIG5ldmVyIGJlIGFkanVzdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2hvd1ByZWRpY3Rpb25zID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIFRoZSBsYXN0IHN1Y2Nlc3NmdWxseS1tYWRlIHByZWRpY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9sb29rQmVoaW5kPzogSVByZWRpY3Rpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWRkZWRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByZWRpY3Rpb24+KCkpO1xuXHRyZWFkb25seSBvblByZWRpY3Rpb25BZGRlZCA9IHRoaXMuX2FkZGVkRW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZmFpbGVkRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcmVkaWN0aW9uPigpKTtcblx0cmVhZG9ubHkgb25QcmVkaWN0aW9uRmFpbGVkID0gdGhpcy5fZmFpbGVkRW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3VjY2VlZGVkRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElQcmVkaWN0aW9uPigpKTtcblx0cmVhZG9ubHkgb25QcmVkaWN0aW9uU3VjY2VlZGVkID0gdGhpcy5fc3VjY2VlZGVkRW1pdHRlci5ldmVudDtcblxuXHRwcml2YXRlIGdldCBfY3VycmVudEdlbmVyYXRpb25QcmVkaWN0aW9ucygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZXhwZWN0ZWQuZmlsdGVyKCh7IGdlbiB9KSA9PiBnZW4gPT09IHRoaXMuX2V4cGVjdGVkWzBdLmdlbikubWFwKCh7IHAgfSkgPT4gcCk7XG5cdH1cblxuXHRnZXQgaXNTaG93aW5nUHJlZGljdGlvbnMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3dQcmVkaWN0aW9ucztcblx0fVxuXG5cdGdldCBsZW5ndGgoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4cGVjdGVkLmxlbmd0aDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHRlcm1pbmFsOiBUZXJtaW5hbCwgcHJpdmF0ZSByZWFkb25seSBfc3R5bGU6IFR5cGVBaGVhZFN0eWxlKSB7IHN1cGVyKCk7IH1cblxuXHRzZXRTaG93UHJlZGljdGlvbnMoc2hvdzogYm9vbGVhbikge1xuXHRcdGlmIChzaG93ID09PSB0aGlzLl9zaG93UHJlZGljdGlvbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBjb25zb2xlLmxvZygnc2V0IHByZWRpY3Rpb25zOicsIHNob3cpO1xuXHRcdHRoaXMuX3Nob3dQcmVkaWN0aW9ucyA9IHNob3c7XG5cblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9nZXRBY3RpdmVCdWZmZXIoKTtcblx0XHRpZiAoIWJ1ZmZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvQXBwbHkgPSB0aGlzLl9jdXJyZW50R2VuZXJhdGlvblByZWRpY3Rpb25zO1xuXHRcdGlmIChzaG93KSB7XG5cdFx0XHR0aGlzLmNsZWFyQ3Vyc29yKCk7XG5cdFx0XHR0aGlzLl9zdHlsZS5leHBlY3RJbmNvbWluZ1N0eWxlKHRvQXBwbHkucmVkdWNlKChjb3VudCwgcCkgPT4gcC5hZmZlY3RzU3R5bGUgPyBjb3VudCArIDEgOiBjb3VudCwgMCkpO1xuXHRcdFx0dGhpcy50ZXJtaW5hbC53cml0ZSh0b0FwcGx5Lm1hcChwID0+IHAuYXBwbHkoYnVmZmVyLCB0aGlzLnBoeXNpY2FsQ3Vyc29yKGJ1ZmZlcikpKS5qb2luKCcnKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGVybWluYWwud3JpdGUodG9BcHBseS5yZXZlcnNlKCkubWFwKHAgPT4gcC5yb2xsYmFjayh0aGlzLnBoeXNpY2FsQ3Vyc29yKGJ1ZmZlcikpKS5qb2luKCcnKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVuZG9lcyBhbnkgcHJlZGljdGlvbnMgd3JpdHRlbiBhbmQgcmVzZXRzIGV4cGVjdGF0aW9ucy5cblx0ICovXG5cdHVuZG9BbGxQcmVkaWN0aW9ucygpIHtcblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9nZXRBY3RpdmVCdWZmZXIoKTtcblx0XHRpZiAodGhpcy5fc2hvd1ByZWRpY3Rpb25zICYmIGJ1ZmZlcikge1xuXHRcdFx0dGhpcy50ZXJtaW5hbC53cml0ZSh0aGlzLl9jdXJyZW50R2VuZXJhdGlvblByZWRpY3Rpb25zLnJldmVyc2UoKVxuXHRcdFx0XHQubWFwKHAgPT4gcC5yb2xsYmFjayh0aGlzLnBoeXNpY2FsQ3Vyc29yKGJ1ZmZlcikpKS5qb2luKCcnKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZXhwZWN0ZWQgPSBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG91bGQgYmUgY2FsbGVkIHdoZW4gaW5wdXQgaXMgaW5jb21pbmcgdG8gdGhlIHRlbXJpbmFsLlxuXHQgKi9cblx0YmVmb3JlU2VydmVySW5wdXQoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxJbnB1dCA9IGlucHV0O1xuXHRcdGlmICh0aGlzLl9pbnB1dEJ1ZmZlcikge1xuXHRcdFx0aW5wdXQgPSB0aGlzLl9pbnB1dEJ1ZmZlciArIGlucHV0O1xuXHRcdFx0dGhpcy5faW5wdXRCdWZmZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9leHBlY3RlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX2NsZWFyUHJlZGljdGlvblN0YXRlKCk7XG5cdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnVmZmVyID0gdGhpcy5fZ2V0QWN0aXZlQnVmZmVyKCk7XG5cdFx0aWYgKCFidWZmZXIpIHtcblx0XHRcdHRoaXMuX2NsZWFyUHJlZGljdGlvblN0YXRlKCk7XG5cdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0fVxuXG5cdFx0bGV0IG91dHB1dCA9ICcnO1xuXG5cdFx0Y29uc3QgcmVhZGVyID0gbmV3IFN0cmluZ1JlYWRlcihpbnB1dCk7XG5cdFx0Y29uc3Qgc3RhcnRpbmdHZW4gPSB0aGlzLl9leHBlY3RlZFswXS5nZW47XG5cdFx0Y29uc3QgZW1pdFByZWRpY3Rpb25PbWl0dGVkID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb21pdCA9IHJlYWRlci5lYXRSZShQUkVESUNUSU9OX09NSVRfUkUpO1xuXHRcdFx0aWYgKG9taXQpIHtcblx0XHRcdFx0b3V0cHV0ICs9IG9taXRbMF07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdFJlYWRMb29wOiB3aGlsZSAodGhpcy5fZXhwZWN0ZWQubGVuZ3RoICYmIHJlYWRlci5yZW1haW5pbmcgPiAwKSB7XG5cdFx0XHRlbWl0UHJlZGljdGlvbk9taXR0ZWQoKTtcblxuXHRcdFx0Y29uc3QgeyBwOiBwcmVkaWN0aW9uLCBnZW4gfSA9IHRoaXMuX2V4cGVjdGVkWzBdO1xuXHRcdFx0Y29uc3QgY3Vyc29yID0gdGhpcy5waHlzaWNhbEN1cnNvcihidWZmZXIpO1xuXHRcdFx0Y29uc3QgYmVmb3JlVGVzdFJlYWRlckluZGV4ID0gcmVhZGVyLmluZGV4O1xuXHRcdFx0c3dpdGNoIChwcmVkaWN0aW9uLm1hdGNoZXMocmVhZGVyLCB0aGlzLl9sb29rQmVoaW5kKSkge1xuXHRcdFx0XHRjYXNlIE1hdGNoUmVzdWx0LlN1Y2Nlc3M6IHtcblx0XHRcdFx0XHQvLyBpZiB0aGUgaW5wdXQgY2hhcmFjdGVyIG1hdGNoZXMgd2hhdCB0aGUgbmV4dCBwcmVkaWN0aW9uIGV4cGVjdGVkLCB1bmRvXG5cdFx0XHRcdFx0Ly8gdGhlIHByZWRpY3Rpb24gYW5kIHdyaXRlIHRoZSByZWFsIGNoYXJhY3RlciBvdXQuXG5cdFx0XHRcdFx0Y29uc3QgZWF0ZW4gPSBpbnB1dC5zbGljZShiZWZvcmVUZXN0UmVhZGVySW5kZXgsIHJlYWRlci5pbmRleCk7XG5cdFx0XHRcdFx0aWYgKGdlbiA9PT0gc3RhcnRpbmdHZW4pIHtcblx0XHRcdFx0XHRcdG91dHB1dCArPSBwcmVkaWN0aW9uLnJvbGxGb3J3YXJkcz8uKGN1cnNvciwgZWF0ZW4pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRwcmVkaWN0aW9uLmFwcGx5KGJ1ZmZlciwgdGhpcy5waHlzaWNhbEN1cnNvcihidWZmZXIpKTsgLy8gbW92ZSBjdXJzb3IgZm9yIGFkZGl0aW9uYWwgYXBwbHlcblx0XHRcdFx0XHRcdG91dHB1dCArPSBlYXRlbjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl9zdWNjZWVkZWRFbWl0dGVyLmZpcmUocHJlZGljdGlvbik7XG5cdFx0XHRcdFx0dGhpcy5fbG9va0JlaGluZCA9IHByZWRpY3Rpb247XG5cdFx0XHRcdFx0dGhpcy5fZXhwZWN0ZWQuc2hpZnQoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIE1hdGNoUmVzdWx0LkJ1ZmZlcjpcblx0XHRcdFx0XHQvLyBvbiBhIGJ1ZmZlciwgc3RvcmUgdGhlIHJlbWFpbmluZyBkYXRhIGFuZCBjb21wbGV0ZWx5IHJlYWQgZGF0YVxuXHRcdFx0XHRcdC8vIHRvIGJlIG91dHB1dCBhcyBub3JtYWwuXG5cdFx0XHRcdFx0dGhpcy5faW5wdXRCdWZmZXIgPSBpbnB1dC5zbGljZShiZWZvcmVUZXN0UmVhZGVySW5kZXgpO1xuXHRcdFx0XHRcdHJlYWRlci5pbmRleCA9IGlucHV0Lmxlbmd0aDtcblx0XHRcdFx0XHRicmVhayBSZWFkTG9vcDtcblx0XHRcdFx0Y2FzZSBNYXRjaFJlc3VsdC5GYWlsdXJlOiB7XG5cdFx0XHRcdFx0Ly8gb24gYSBmYWlsdXJlLCByb2xsIGJhY2sgYWxsIHJlbWFpbmluZyBpdGVtcyBpbiB0aGlzIGdlbmVyYXRpb25cblx0XHRcdFx0XHQvLyBhbmQgY2xlYXIgcHJlZGljdGlvbnMsIHNpbmNlIHRoZXkgYXJlIG5vIGxvbmdlciB2YWxpZFxuXHRcdFx0XHRcdGNvbnN0IHJvbGxiYWNrID0gdGhpcy5fZXhwZWN0ZWQuZmlsdGVyKHAgPT4gcC5nZW4gPT09IHN0YXJ0aW5nR2VuKS5yZXZlcnNlKCk7XG5cdFx0XHRcdFx0b3V0cHV0ICs9IHJvbGxiYWNrLm1hcCgoeyBwIH0pID0+IHAucm9sbGJhY2sodGhpcy5waHlzaWNhbEN1cnNvcihidWZmZXIpKSkuam9pbignJyk7XG5cdFx0XHRcdFx0aWYgKHJvbGxiYWNrLnNvbWUociA9PiByLnAuYWZmZWN0c1N0eWxlKSkge1xuXHRcdFx0XHRcdFx0Ly8gcmVhZGluZyB0aGUgY3VycmVudCBzdHlsZSBzaG91bGQgZ2VuZXJhbGx5IGJlIHNhZmUsIHNpbmNlIHByZWRpY3Rpb25zXG5cdFx0XHRcdFx0XHQvLyBhbHdheXMgcmVzdG9yZSB0aGUgc3R5bGUgaWYgdGhleSBtb2RpZnkgaXQuXG5cdFx0XHRcdFx0XHRvdXRwdXQgKz0gYXR0cmlidXRlc1RvU2VxKGNvcmUodGhpcy50ZXJtaW5hbCkuX2lucHV0SGFuZGxlci5fY3VyQXR0ckRhdGEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9jbGVhclByZWRpY3Rpb25TdGF0ZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2ZhaWxlZEVtaXR0ZXIuZmlyZShwcmVkaWN0aW9uKTtcblx0XHRcdFx0XHRicmVhayBSZWFkTG9vcDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGVtaXRQcmVkaWN0aW9uT21pdHRlZCgpO1xuXG5cdFx0Ly8gRXh0cmEgZGF0YSAobGlrZSB0aGUgcmVzdWx0IG9mIHJ1bm5pbmcgYSBjb21tYW5kKSBzaG91bGQgY2F1c2UgdXMgdG9cblx0XHQvLyByZXNldCB0aGUgY3Vyc29yXG5cdFx0aWYgKCFyZWFkZXIuZW9mKSB7XG5cdFx0XHRvdXRwdXQgKz0gcmVhZGVyLnJlc3Q7XG5cdFx0XHR0aGlzLl9jbGVhclByZWRpY3Rpb25TdGF0ZSgpO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlIHBhc3NlZCBhIGdlbmVyYXRpb24gYm91bmRhcnksIGFwcGx5IHRoZSBjdXJyZW50IGdlbmVyYXRpb24ncyBwcmVkaWN0aW9uc1xuXHRcdGlmICh0aGlzLl9leHBlY3RlZC5sZW5ndGggJiYgc3RhcnRpbmdHZW4gIT09IHRoaXMuX2V4cGVjdGVkWzBdLmdlbikge1xuXHRcdFx0Zm9yIChjb25zdCB7IHAsIGdlbiB9IG9mIHRoaXMuX2V4cGVjdGVkKSB7XG5cdFx0XHRcdGlmIChnZW4gIT09IHRoaXMuX2V4cGVjdGVkWzBdLmdlbikge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwLmFmZmVjdHNTdHlsZSkge1xuXHRcdFx0XHRcdHRoaXMuX3N0eWxlLmV4cGVjdEluY29taW5nU3R5bGUoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG91dHB1dCArPSBwLmFwcGx5KGJ1ZmZlciwgdGhpcy5waHlzaWNhbEN1cnNvcihidWZmZXIpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3Nob3dQcmVkaWN0aW9ucykge1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsSW5wdXQ7XG5cdFx0fVxuXG5cdFx0aWYgKG91dHB1dC5sZW5ndGggPT09IDAgfHwgb3V0cHV0ID09PSBpbnB1dCkge1xuXHRcdFx0cmV0dXJuIG91dHB1dDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcGh5c2ljYWxDdXJzb3IpIHtcblx0XHRcdG91dHB1dCArPSB0aGlzLl9waHlzaWNhbEN1cnNvci5tb3ZlSW5zdHJ1Y3Rpb24oKTtcblx0XHR9XG5cblx0XHQvLyBwcmV2ZW50IGN1cnNvciBmbGlja2VyaW5nIHdoaWxlIHR5cGluZ1xuXHRcdG91dHB1dCA9IFZULkhpZGVDdXJzb3IgKyBvdXRwdXQgKyBWVC5TaG93Q3Vyc29yO1xuXG5cdFx0cmV0dXJuIG91dHB1dDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhcnMgYW55IGV4cGVjdGVkIHByZWRpY3Rpb25zIGFuZCBzdG9yZWQgc3RhdGUuIFNob3VsZCBiZSBjYWxsZWQgd2hlblxuXHQgKiB0aGUgcHR5IGdpdmVzIHVzIHNvbWV0aGluZyB3ZSBkb24ndCByZWNvZ25pemUuXG5cdCAqL1xuXHRwcml2YXRlIF9jbGVhclByZWRpY3Rpb25TdGF0ZSgpIHtcblx0XHR0aGlzLl9leHBlY3RlZCA9IFtdO1xuXHRcdHRoaXMuY2xlYXJDdXJzb3IoKTtcblx0XHR0aGlzLl9sb29rQmVoaW5kID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZHMgYSB0eXBlYWhlYWQgcHJlZGljdGlvbi5cblx0ICovXG5cdGFkZFByZWRpY3Rpb24oYnVmZmVyOiBJQnVmZmVyLCBwcmVkaWN0aW9uOiBJUHJlZGljdGlvbikge1xuXHRcdHRoaXMuX2V4cGVjdGVkLnB1c2goeyBnZW46IHRoaXMuX2N1cnJlbnRHZW4sIHA6IHByZWRpY3Rpb24gfSk7XG5cdFx0dGhpcy5fYWRkZWRFbWl0dGVyLmZpcmUocHJlZGljdGlvbik7XG5cblx0XHRpZiAodGhpcy5fY3VycmVudEdlbiAhPT0gdGhpcy5fZXhwZWN0ZWRbMF0uZ2VuKSB7XG5cdFx0XHRwcmVkaWN0aW9uLmFwcGx5KGJ1ZmZlciwgdGhpcy50ZW50YXRpdmVDdXJzb3IoYnVmZmVyKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IHByZWRpY3Rpb24uYXBwbHkoYnVmZmVyLCB0aGlzLnBoeXNpY2FsQ3Vyc29yKGJ1ZmZlcikpO1xuXHRcdHRoaXMuX3RlbmF0aXZlQ3Vyc29yID0gdW5kZWZpbmVkOyAvLyBuZXh0IHJlYWQgd2lsbCBnZXQgb3IgY2xvbmUgdGhlIHBoeXNpY2FsIGN1cnNvclxuXG5cdFx0aWYgKHRoaXMuX3Nob3dQcmVkaWN0aW9ucyAmJiB0ZXh0KSB7XG5cdFx0XHRpZiAocHJlZGljdGlvbi5hZmZlY3RzU3R5bGUpIHtcblx0XHRcdFx0dGhpcy5fc3R5bGUuZXhwZWN0SW5jb21pbmdTdHlsZSgpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gY29uc29sZS5sb2coJ3ByZWRpY3Q6JywgSlNPTi5zdHJpbmdpZnkodGV4dCkpO1xuXHRcdFx0dGhpcy50ZXJtaW5hbC53cml0ZSh0ZXh0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBlbmRzIGEgcHJlZGljdGlvbiBmb2xsb3dlZCBieSBhIGJvdW5kYXJ5LiBUaGUgcHJlZGljdGlvbnMgYXBwbGllZFxuXHQgKiBhZnRlciB0aGlzIG9uZSB3aWxsIG9ubHkgYmUgZGlzcGxheWVkIGFmdGVyIHRoZSBnaXZlIHByZWRpY3Rpb24gbWF0Y2hlc1xuXHQgKiBwdHkgb3V0cHV0L1xuXHQgKi9cblx0YWRkQm91bmRhcnkoKTogdm9pZDtcblx0YWRkQm91bmRhcnkoYnVmZmVyOiBJQnVmZmVyLCBwcmVkaWN0aW9uOiBJUHJlZGljdGlvbik6IGJvb2xlYW47XG5cdGFkZEJvdW5kYXJ5KGJ1ZmZlcj86IElCdWZmZXIsIHByZWRpY3Rpb24/OiBJUHJlZGljdGlvbikge1xuXHRcdGxldCBhcHBsaWVkID0gZmFsc2U7XG5cdFx0aWYgKGJ1ZmZlciAmJiBwcmVkaWN0aW9uKSB7XG5cdFx0XHQvLyBXZSBhcHBseSB0aGUgcHJlZGljdGlvbiBzbyB0aGF0IGl0J3MgbWF0Y2hlZCBhZ2FpbnN0LCBidXQgd3JhcHBlZFxuXHRcdFx0Ly8gaW4gYSB0ZW50YXRpdmVib3VuZGFyeSBzbyB0aGF0IGl0IGRvZXNuJ3QgYWZmZWN0IHRoZSBwaHlzaWNhbCBjdXJzb3IuXG5cdFx0XHQvLyBUaGVuIHdlIGFwcGx5IGl0IHNwZWNpZmljYWxseSB0byB0aGUgdGVudGF0aXZlIGN1cnNvci5cblx0XHRcdGFwcGxpZWQgPSB0aGlzLmFkZFByZWRpY3Rpb24oYnVmZmVyLCBuZXcgVGVudGF0aXZlQm91bmRhcnkocHJlZGljdGlvbikpO1xuXHRcdFx0cHJlZGljdGlvbi5hcHBseShidWZmZXIsIHRoaXMudGVudGF0aXZlQ3Vyc29yKGJ1ZmZlcikpO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJyZW50R2VuKys7XG5cdFx0cmV0dXJuIGFwcGxpZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUGVla3MgdGhlIGxhc3QgcHJlZGljdGlvbiB3cml0dGVuLlxuXHQgKi9cblx0cGVla0VuZCgpOiBJUHJlZGljdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2V4cGVjdGVkW3RoaXMuX2V4cGVjdGVkLmxlbmd0aCAtIDFdPy5wO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBlZWtzIHRoZSBmaXJzdCBwZW5kaW5nIHByZWRpY3Rpb24uXG5cdCAqL1xuXHRwZWVrU3RhcnQoKTogSVByZWRpY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9leHBlY3RlZFswXT8ucDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDdXJyZW50IHBvc2l0aW9uIG9mIHRoZSBjdXJzb3IgaW4gdGhlIHRlcm1pbmFsLlxuXHQgKi9cblx0cGh5c2ljYWxDdXJzb3IoYnVmZmVyOiBJQnVmZmVyKSB7XG5cdFx0aWYgKCF0aGlzLl9waHlzaWNhbEN1cnNvcikge1xuXHRcdFx0aWYgKHRoaXMuX3Nob3dQcmVkaWN0aW9ucykge1xuXHRcdFx0XHRmbHVzaE91dHB1dCh0aGlzLnRlcm1pbmFsKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3BoeXNpY2FsQ3Vyc29yID0gbmV3IEN1cnNvcih0aGlzLnRlcm1pbmFsLnJvd3MsIHRoaXMudGVybWluYWwuY29scywgYnVmZmVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcGh5c2ljYWxDdXJzb3I7XG5cdH1cblxuXHQvKipcblx0ICogQ3Vyc29yIHBvc2l0aW9uIGlmIGFsbCBwcmVkaWN0aW9ucyBhbmQgYm91bmRhcmllcyB0aGF0IGhhdmUgYmVlbiBpbnNlcnRlZFxuXHQgKiBzbyBmYXIgdHVybiBvdXQgdG8gYmUgc3VjY2Vzc2Z1bGx5IHByZWRpY3RlZC5cblx0ICovXG5cdHRlbnRhdGl2ZUN1cnNvcihidWZmZXI6IElCdWZmZXIpIHtcblx0XHRpZiAoIXRoaXMuX3RlbmF0aXZlQ3Vyc29yKSB7XG5cdFx0XHR0aGlzLl90ZW5hdGl2ZUN1cnNvciA9IHRoaXMucGh5c2ljYWxDdXJzb3IoYnVmZmVyKS5jbG9uZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl90ZW5hdGl2ZUN1cnNvcjtcblx0fVxuXG5cdGNsZWFyQ3Vyc29yKCkge1xuXHRcdHRoaXMuX3BoeXNpY2FsQ3Vyc29yID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3RlbmF0aXZlQ3Vyc29yID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aXZlQnVmZmVyKCkge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMudGVybWluYWwuYnVmZmVyLmFjdGl2ZTtcblx0XHRyZXR1cm4gYnVmZmVyLnR5cGUgPT09ICdub3JtYWwnID8gYnVmZmVyIDogdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogR2V0cyB0aGUgZXNjYXBlIHNlcXVlbmNlIGFyZ3MgdG8gcmVzdG9yZSBzdGF0ZS9hcHBlYXJhbmNlIGluIHRoZSBjZWxsLlxuICovXG5jb25zdCBhdHRyaWJ1dGVzVG9BcmdzID0gKGNlbGw6IFh0ZXJtQXR0cmlidXRlcykgPT4ge1xuXHRpZiAoY2VsbC5pc0F0dHJpYnV0ZURlZmF1bHQoKSkgeyByZXR1cm4gWzBdOyB9XG5cblx0Y29uc3QgYXJncyA9IFtdO1xuXHRpZiAoY2VsbC5pc0JvbGQoKSkgeyBhcmdzLnB1c2goMSk7IH1cblx0aWYgKGNlbGwuaXNEaW0oKSkgeyBhcmdzLnB1c2goMik7IH1cblx0aWYgKGNlbGwuaXNJdGFsaWMoKSkgeyBhcmdzLnB1c2goMyk7IH1cblx0aWYgKGNlbGwuaXNVbmRlcmxpbmUoKSkgeyBhcmdzLnB1c2goNCk7IH1cblx0aWYgKGNlbGwuaXNCbGluaygpKSB7IGFyZ3MucHVzaCg1KTsgfVxuXHRpZiAoY2VsbC5pc0ludmVyc2UoKSkgeyBhcmdzLnB1c2goNyk7IH1cblx0aWYgKGNlbGwuaXNJbnZpc2libGUoKSkgeyBhcmdzLnB1c2goOCk7IH1cblxuXHRpZiAoY2VsbC5pc0ZnUkdCKCkpIHsgYXJncy5wdXNoKDM4LCAyLCBjZWxsLmdldEZnQ29sb3IoKSA+Pj4gMjQsIChjZWxsLmdldEZnQ29sb3IoKSA+Pj4gMTYpICYgMHhGRiwgY2VsbC5nZXRGZ0NvbG9yKCkgJiAweEZGKTsgfVxuXHRpZiAoY2VsbC5pc0ZnUGFsZXR0ZSgpKSB7IGFyZ3MucHVzaCgzOCwgNSwgY2VsbC5nZXRGZ0NvbG9yKCkpOyB9XG5cdGlmIChjZWxsLmlzRmdEZWZhdWx0KCkpIHsgYXJncy5wdXNoKDM5KTsgfVxuXG5cdGlmIChjZWxsLmlzQmdSR0IoKSkgeyBhcmdzLnB1c2goNDgsIDIsIGNlbGwuZ2V0QmdDb2xvcigpID4+PiAyNCwgKGNlbGwuZ2V0QmdDb2xvcigpID4+PiAxNikgJiAweEZGLCBjZWxsLmdldEJnQ29sb3IoKSAmIDB4RkYpOyB9XG5cdGlmIChjZWxsLmlzQmdQYWxldHRlKCkpIHsgYXJncy5wdXNoKDQ4LCA1LCBjZWxsLmdldEJnQ29sb3IoKSk7IH1cblx0aWYgKGNlbGwuaXNCZ0RlZmF1bHQoKSkgeyBhcmdzLnB1c2goNDkpOyB9XG5cblx0cmV0dXJuIGFyZ3M7XG59O1xuXG4vKipcbiAqIEdldHMgdGhlIGVzY2FwZSBzZXF1ZW5jZSB0byByZXN0b3JlIHN0YXRlL2FwcGVhcmFuY2UgaW4gdGhlIGNlbGwuXG4gKi9cbmNvbnN0IGF0dHJpYnV0ZXNUb1NlcSA9IChjZWxsOiBYdGVybUF0dHJpYnV0ZXMpID0+IGAke1ZULkNzaX0ke2F0dHJpYnV0ZXNUb0FyZ3MoY2VsbCkuam9pbignOycpfW1gO1xuXG5jb25zdCBhcnJheUhhc1ByZWZpeEF0ID0gPFQ+KGE6IFJlYWRvbmx5QXJyYXk8VD4sIGFpOiBudW1iZXIsIGI6IFJlYWRvbmx5QXJyYXk8VD4pID0+IHtcblx0aWYgKGEubGVuZ3RoIC0gYWkgPiBiLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZvciAobGV0IGJpID0gMDsgYmkgPCBiLmxlbmd0aDsgYmkrKywgYWkrKykge1xuXHRcdGlmIChiW2FpXSAhPT0gYVthaV0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbi8qKlxuICogQHNlZSBodHRwczovL2dpdGh1Yi5jb20veHRlcm1qcy94dGVybS5qcy9ibG9iLzA2NWViMTNhOWQzMTQ1YmVhNjg3MjM5NjgwZWM5Njk2ZDkxMTJiOGUvc3JjL2NvbW1vbi9JbnB1dEhhbmRsZXIudHMjTDIxMjdcbiAqL1xuY29uc3QgZ2V0Q29sb3JXaWR0aCA9IChwYXJhbXM6IFNpbmdsZU9yTWFueTxudW1iZXI+W10sIHBvczogbnVtYmVyKSA9PiB7XG5cdGNvbnN0IGFjY3UgPSBbMCwgMCwgLTEsIDAsIDAsIDBdO1xuXHRsZXQgY1NwYWNlID0gMDtcblx0bGV0IGFkdmFuY2UgPSAwO1xuXG5cdGRvIHtcblx0XHRjb25zdCB2ID0gcGFyYW1zW3BvcyArIGFkdmFuY2VdO1xuXHRcdGFjY3VbYWR2YW5jZSArIGNTcGFjZV0gPSBpc051bWJlcih2KSA/IHYgOiB2WzBdO1xuXHRcdGlmICghaXNOdW1iZXIodikpIHtcblx0XHRcdGxldCBpID0gMDtcblx0XHRcdGRvIHtcblx0XHRcdFx0aWYgKGFjY3VbMV0gPT09IDUpIHtcblx0XHRcdFx0XHRjU3BhY2UgPSAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjY3VbYWR2YW5jZSArIGkgKyAxICsgY1NwYWNlXSA9IHZbaV07XG5cdFx0XHR9IHdoaWxlICgrK2kgPCB2Lmxlbmd0aCAmJiBpICsgYWR2YW5jZSArIDEgKyBjU3BhY2UgPCBhY2N1Lmxlbmd0aCk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Ly8gZXhpdCBlYXJseSBpZiBjYW4gZGVjaWRlIGNvbG9yIG1vZGUgd2l0aCBzZW1pY29sb25zXG5cdFx0aWYgKChhY2N1WzFdID09PSA1ICYmIGFkdmFuY2UgKyBjU3BhY2UgPj0gMilcblx0XHRcdHx8IChhY2N1WzFdID09PSAyICYmIGFkdmFuY2UgKyBjU3BhY2UgPj0gNSkpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHQvLyBvZmZzZXQgY29sb3JTcGFjZSBzbG90IGZvciBzZW1pY29sb24gbW9kZVxuXHRcdGlmIChhY2N1WzFdKSB7XG5cdFx0XHRjU3BhY2UgPSAxO1xuXHRcdH1cblx0fSB3aGlsZSAoKythZHZhbmNlICsgcG9zIDwgcGFyYW1zLmxlbmd0aCAmJiBhZHZhbmNlICsgY1NwYWNlIDwgYWNjdS5sZW5ndGgpO1xuXG5cdHJldHVybiBhZHZhbmNlO1xufTtcblxuY2xhc3MgVHlwZUFoZWFkU3R5bGUgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIF9jb21waWxlQXJncyhhcmdzOiBSZWFkb25seUFycmF5PG51bWJlcj4pIHtcblx0XHRyZXR1cm4gYCR7VlQuQ3NpfSR7YXJncy5qb2luKCc7Jyl9bWA7XG5cdH1cblxuXHQvKipcblx0ICogTnVtYmVyIG9mIHR5cGVhaGVhZCBzdHlsZSBhcmd1bWVudHMgd2UgZXhwZWN0IHRvIHJlYWQuIElmIHRoaXMgaXMgMCBhbmRcblx0ICogd2Ugc2VlIGEgc3R5bGUgY29taW5nIGluLCB3ZSBrbm93IHRoYXQgdGhlIFBUWSBhY3R1YWxseSB3YW50ZWQgdG8gdXBkYXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZXhwZWN0ZWRJbmNvbWluZ1N0eWxlcyA9IDA7XG5cdHByaXZhdGUgX2FwcGx5QXJncyE6IFJlYWRvbmx5QXJyYXk8bnVtYmVyPjtcblx0cHJpdmF0ZSBfb3JpZ2luYWxVbmRvQXJncyE6IFJlYWRvbmx5QXJyYXk8bnVtYmVyPjtcblx0cHJpdmF0ZSBfdW5kb0FyZ3MhOiBSZWFkb25seUFycmF5PG51bWJlcj47XG5cblx0YXBwbHkhOiBzdHJpbmc7XG5cdHVuZG8hOiBzdHJpbmc7XG5cdHByaXZhdGUgX2NzaUhhbmRsZXI/OiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZTogSVRlcm1pbmFsVHlwZUFoZWFkQ29uZmlndXJhdGlvblsnbG9jYWxFY2hvU3R5bGUnXSwgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWw6IFRlcm1pbmFsKSB7XG5cdFx0dGhpcy5vblVwZGF0ZSh2YWx1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogU2lnbmFscyB0aGF0IGEgc3R5bGUgd2FzIHdyaXR0ZW4gdG8gdGhlIHRlcm1pbmFsIGFuZCB3ZSBzaG91bGQgd2F0Y2hcblx0ICogZm9yIGl0IGNvbWluZyBpbi5cblx0ICovXG5cdGV4cGVjdEluY29taW5nU3R5bGUobiA9IDEpIHtcblx0XHR0aGlzLl9leHBlY3RlZEluY29taW5nU3R5bGVzICs9IG4gKiAyO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXJ0cyB0cmFja2luZyBmb3IgQ1NJIGNoYW5nZXMgaW4gdGhlIHRlcm1pbmFsLlxuXHQgKi9cblx0c3RhcnRUcmFja2luZygpIHtcblx0XHR0aGlzLl9leHBlY3RlZEluY29taW5nU3R5bGVzID0gMDtcblx0XHR0aGlzLl9vbkRpZFdyaXRlU0dSKGF0dHJpYnV0ZXNUb0FyZ3MoY29yZSh0aGlzLl90ZXJtaW5hbCkuX2lucHV0SGFuZGxlci5fY3VyQXR0ckRhdGEpKTtcblx0XHR0aGlzLl9jc2lIYW5kbGVyID0gdGhpcy5fdGVybWluYWwucGFyc2VyLnJlZ2lzdGVyQ3NpSGFuZGxlcih7IGZpbmFsOiAnbScgfSwgYXJncyA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFdyaXRlU0dSKGFyZ3MpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3BzIHRyYWNraW5nIHRlcm1pbmFsIENTSSBjaGFuZ2VzLlxuXHQgKi9cblx0QGRlYm91bmNlKDIwMDApXG5cdGRlYm91bmNlU3RvcFRyYWNraW5nKCkge1xuXHRcdHRoaXMuX3N0b3BUcmFja2luZygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBpbmhlcml0ZG9jXG5cdCAqL1xuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX3N0b3BUcmFja2luZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcFRyYWNraW5nKCkge1xuXHRcdHRoaXMuX2NzaUhhbmRsZXI/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jc2lIYW5kbGVyID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRXcml0ZVNHUihhcmdzOiBTaW5nbGVPck1hbnk8bnVtYmVyPltdKSB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxVbmRvID0gdGhpcy5fdW5kb0FyZ3M7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcmdzLmxlbmd0aDspIHtcblx0XHRcdGNvbnN0IHB4ID0gYXJnc1tpXTtcblx0XHRcdGNvbnN0IHAgPSBpc051bWJlcihweCkgPyBweCA6IHB4WzBdO1xuXG5cdFx0XHRpZiAodGhpcy5fZXhwZWN0ZWRJbmNvbWluZ1N0eWxlcykge1xuXHRcdFx0XHRpZiAoYXJyYXlIYXNQcmVmaXhBdChhcmdzLCBpLCB0aGlzLl91bmRvQXJncykpIHtcblx0XHRcdFx0XHR0aGlzLl9leHBlY3RlZEluY29taW5nU3R5bGVzLS07XG5cdFx0XHRcdFx0aSArPSB0aGlzLl91bmRvQXJncy5sZW5ndGg7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFycmF5SGFzUHJlZml4QXQoYXJncywgaSwgdGhpcy5fYXBwbHlBcmdzKSkge1xuXHRcdFx0XHRcdHRoaXMuX2V4cGVjdGVkSW5jb21pbmdTdHlsZXMtLTtcblx0XHRcdFx0XHRpICs9IHRoaXMuX2FwcGx5QXJncy5sZW5ndGg7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2lkdGggPSBwID09PSAzOCB8fCBwID09PSA0OCB8fCBwID09PSA1OCA/IGdldENvbG9yV2lkdGgoYXJncywgaSkgOiAxO1xuXHRcdFx0c3dpdGNoICh0aGlzLl9hcHBseUFyZ3NbMF0pIHtcblx0XHRcdFx0Y2FzZSAxOlxuXHRcdFx0XHRcdGlmIChwID09PSAyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl91bmRvQXJncyA9IFsyMiwgMl07XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChwID09PSAyMiB8fCBwID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl91bmRvQXJncyA9IFsyMl07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIDI6XG5cdFx0XHRcdFx0aWYgKHAgPT09IDEpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3VuZG9BcmdzID0gWzIyLCAxXTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHAgPT09IDIyIHx8IHAgPT09IDApIHtcblx0XHRcdFx0XHRcdHRoaXMuX3VuZG9BcmdzID0gWzIyXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgMzg6XG5cdFx0XHRcdFx0aWYgKHAgPT09IDAgfHwgcCA9PT0gMzkgfHwgcCA9PT0gMTAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl91bmRvQXJncyA9IFszOV07XG5cdFx0XHRcdFx0fSBlbHNlIGlmICgocCA+PSAzMCAmJiBwIDw9IDM4KSB8fCAocCA+PSA5MCAmJiBwIDw9IDk3KSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdW5kb0FyZ3MgPSBhcmdzLnNsaWNlKGksIGkgKyB3aWR0aCkgYXMgbnVtYmVyW107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGlmIChwID09PSB0aGlzLl9hcHBseUFyZ3NbMF0pIHtcblx0XHRcdFx0XHRcdHRoaXMuX3VuZG9BcmdzID0gdGhpcy5fYXBwbHlBcmdzO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdW5kb0FyZ3MgPSB0aGlzLl9vcmlnaW5hbFVuZG9BcmdzO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0Ly8gbm8tb3Bcblx0XHRcdH1cblxuXHRcdFx0aSArPSB3aWR0aDtcblx0XHR9XG5cblx0XHRpZiAob3JpZ2luYWxVbmRvICE9PSB0aGlzLl91bmRvQXJncykge1xuXHRcdFx0dGhpcy51bmRvID0gVHlwZUFoZWFkU3R5bGUuX2NvbXBpbGVBcmdzKHRoaXMuX3VuZG9BcmdzKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgY3VycmVudCB0eXBlYWhlYWQgc3R5bGUuXG5cdCAqL1xuXHRvblVwZGF0ZShzdHlsZTogSVRlcm1pbmFsVHlwZUFoZWFkQ29uZmlndXJhdGlvblsnbG9jYWxFY2hvU3R5bGUnXSkge1xuXHRcdGNvbnN0IHsgYXBwbHlBcmdzLCB1bmRvQXJncyB9ID0gdGhpcy5fZ2V0QXJncyhzdHlsZSk7XG5cdFx0dGhpcy5fYXBwbHlBcmdzID0gYXBwbHlBcmdzO1xuXHRcdHRoaXMuX3VuZG9BcmdzID0gdGhpcy5fb3JpZ2luYWxVbmRvQXJncyA9IHVuZG9BcmdzO1xuXHRcdHRoaXMuYXBwbHkgPSBUeXBlQWhlYWRTdHlsZS5fY29tcGlsZUFyZ3ModGhpcy5fYXBwbHlBcmdzKTtcblx0XHR0aGlzLnVuZG8gPSBUeXBlQWhlYWRTdHlsZS5fY29tcGlsZUFyZ3ModGhpcy5fdW5kb0FyZ3MpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXJncyhzdHlsZTogSVRlcm1pbmFsVHlwZUFoZWFkQ29uZmlndXJhdGlvblsnbG9jYWxFY2hvU3R5bGUnXSkge1xuXHRcdHN3aXRjaCAoc3R5bGUpIHtcblx0XHRcdGNhc2UgJ2JvbGQnOlxuXHRcdFx0XHRyZXR1cm4geyBhcHBseUFyZ3M6IFsxXSwgdW5kb0FyZ3M6IFsyMl0gfTtcblx0XHRcdGNhc2UgJ2RpbSc6XG5cdFx0XHRcdHJldHVybiB7IGFwcGx5QXJnczogWzJdLCB1bmRvQXJnczogWzIyXSB9O1xuXHRcdFx0Y2FzZSAnaXRhbGljJzpcblx0XHRcdFx0cmV0dXJuIHsgYXBwbHlBcmdzOiBbM10sIHVuZG9BcmdzOiBbMjNdIH07XG5cdFx0XHRjYXNlICd1bmRlcmxpbmVkJzpcblx0XHRcdFx0cmV0dXJuIHsgYXBwbHlBcmdzOiBbNF0sIHVuZG9BcmdzOiBbMjRdIH07XG5cdFx0XHRjYXNlICdpbnZlcnRlZCc6XG5cdFx0XHRcdHJldHVybiB7IGFwcGx5QXJnczogWzddLCB1bmRvQXJnczogWzI3XSB9O1xuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRsZXQgY29sb3I6IENvbG9yO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbG9yID0gQ29sb3IuZnJvbUhleChzdHlsZSk7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdGNvbG9yID0gbmV3IENvbG9yKG5ldyBSR0JBKDI1NSwgMCwgMCwgMSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgeyByLCBnLCBiIH0gPSBjb2xvci5yZ2JhO1xuXHRcdFx0XHRyZXR1cm4geyBhcHBseUFyZ3M6IFszOCwgMiwgciwgZywgYl0sIHVuZG9BcmdzOiBbMzldIH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IGNvbXBpbGVFeGNsdWRlUmVnZXhwID0gKHByb2dyYW1zID0gREVGQVVMVF9MT0NBTF9FQ0hPX0VYQ0xVREUpID0+XG5cdG5ldyBSZWdFeHAoYFxcXFxiKCR7cHJvZ3JhbXMubWFwKGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMpLmpvaW4oJ3wnKX0pXFxcXGJgLCAnaScpO1xuXG5leHBvcnQgY29uc3QgZW51bSBDaGFyUHJlZGljdFN0YXRlIHtcblx0LyoqIE5vIGNoYXJhY3RlcnMgdHlwZWQgb24gdGhpcyBsaW5lIHlldCAqL1xuXHRVbmtub3duLFxuXHQvKiogSGFzIGEgcGVuZGluZyBjaGFyYWN0ZXIgcHJlZGljdGlvbiAqL1xuXHRIYXNQZW5kaW5nQ2hhcixcblx0LyoqIENoYXJhY3RlciB2YWxpZGF0ZWQgb24gdGhpcyBsaW5lICovXG5cdFZhbGlkYXRlZCxcbn1cblxuZXhwb3J0IGNsYXNzIFR5cGVBaGVhZEFkZG9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbEFkZG9uIHtcblx0cHJpdmF0ZSBfdHlwZWFoZWFkU3R5bGU/OiBUeXBlQWhlYWRTdHlsZTtcblx0cHJpdmF0ZSBfdHlwZWFoZWFkVGhyZXNob2xkOiBudW1iZXI7XG5cdHByaXZhdGUgX2V4Y2x1ZGVQcm9ncmFtUmU6IFJlZ0V4cDtcblx0cHJvdGVjdGVkIF9sYXN0Um93PzogeyB5OiBudW1iZXI7IHN0YXJ0aW5nWDogbnVtYmVyOyBlbmRpbmdYOiBudW1iZXI7IGNoYXJTdGF0ZTogQ2hhclByZWRpY3RTdGF0ZSB9O1xuXHRwcm90ZWN0ZWQgX3RpbWVsaW5lPzogUHJlZGljdGlvblRpbWVsaW5lO1xuXHRwcml2YXRlIF90ZXJtaW5hbFRpdGxlID0gJyc7XG5cdHN0YXRzPzogUHJlZGljdGlvblN0YXRzO1xuXG5cdC8qKlxuXHQgKiBEZWJvdW5jZSB0aGF0IGNsZWFycyBwcmVkaWN0aW9ucyBhZnRlciBhIHRpbWVvdXQgaWYgdGhlIFBUWSBkb2Vzbid0IGFwcGx5IHRoZW0uXG5cdCAqL1xuXHRwcml2YXRlIF9jbGVhclByZWRpY3Rpb25EZWJvdW5jZT86IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX3Byb2Nlc3NNYW5hZ2VyOiBJVGVybWluYWxQcm9jZXNzTWFuYWdlcixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3R5cGVhaGVhZFRocmVzaG9sZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElUZXJtaW5hbFR5cGVBaGVhZENvbmZpZ3VyYXRpb24+KFRFUk1JTkFMX0NPTkZJR19TRUNUSU9OKS5sb2NhbEVjaG9MYXRlbmN5VGhyZXNob2xkO1xuXHRcdHRoaXMuX2V4Y2x1ZGVQcm9ncmFtUmUgPSBjb21waWxlRXhjbHVkZVJlZ2V4cCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uPihURVJNSU5BTF9DT05GSUdfU0VDVElPTikubG9jYWxFY2hvRXhjbHVkZVByb2dyYW1zKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fY2xlYXJQcmVkaWN0aW9uRGVib3VuY2U/LmRpc3Bvc2UoKSkpO1xuXHR9XG5cblx0YWN0aXZhdGUodGVybWluYWw6IFRlcm1pbmFsKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3R5bGUgPSB0aGlzLl90eXBlYWhlYWRTdHlsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUeXBlQWhlYWRTdHlsZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uPihURVJNSU5BTF9DT05GSUdfU0VDVElPTikubG9jYWxFY2hvU3R5bGUsIHRlcm1pbmFsKSk7XG5cdFx0Y29uc3QgdGltZWxpbmUgPSB0aGlzLl90aW1lbGluZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcmVkaWN0aW9uVGltZWxpbmUodGVybWluYWwsIHRoaXMuX3R5cGVhaGVhZFN0eWxlKSk7XG5cdFx0Y29uc3Qgc3RhdHMgPSB0aGlzLnN0YXRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByZWRpY3Rpb25TdGF0cyh0aGlzLl90aW1lbGluZSkpO1xuXG5cdFx0dGltZWxpbmUuc2V0U2hvd1ByZWRpY3Rpb25zKHRoaXMuX3R5cGVhaGVhZFRocmVzaG9sZCA9PT0gMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGVybWluYWwub25EYXRhKGUgPT4gdGhpcy5fb25Vc2VyRGF0YShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlcm1pbmFsLm9uVGl0bGVDaGFuZ2UodGl0bGUgPT4ge1xuXHRcdFx0dGhpcy5fdGVybWluYWxUaXRsZSA9IHRpdGxlO1xuXHRcdFx0dGhpcy5fcmVldmFsdWF0ZVByZWRpY3RvclN0YXRlKHN0YXRzLCB0aW1lbGluZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlcm1pbmFsLm9uUmVzaXplKCgpID0+IHtcblx0XHRcdHRpbWVsaW5lLnNldFNob3dQcmVkaWN0aW9ucyhmYWxzZSk7XG5cdFx0XHR0aW1lbGluZS5jbGVhckN1cnNvcigpO1xuXHRcdFx0dGhpcy5fcmVldmFsdWF0ZVByZWRpY3RvclN0YXRlKHN0YXRzLCB0aW1lbGluZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRFUk1JTkFMX0NPTkZJR19TRUNUSU9OKSkge1xuXHRcdFx0XHRzdHlsZS5vblVwZGF0ZSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uPihURVJNSU5BTF9DT05GSUdfU0VDVElPTikubG9jYWxFY2hvU3R5bGUpO1xuXHRcdFx0XHR0aGlzLl90eXBlYWhlYWRUaHJlc2hvbGQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJVGVybWluYWxUeXBlQWhlYWRDb25maWd1cmF0aW9uPihURVJNSU5BTF9DT05GSUdfU0VDVElPTikubG9jYWxFY2hvTGF0ZW5jeVRocmVzaG9sZDtcblx0XHRcdFx0dGhpcy5fZXhjbHVkZVByb2dyYW1SZSA9IGNvbXBpbGVFeGNsdWRlUmVnZXhwKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElUZXJtaW5hbFR5cGVBaGVhZENvbmZpZ3VyYXRpb24+KFRFUk1JTkFMX0NPTkZJR19TRUNUSU9OKS5sb2NhbEVjaG9FeGNsdWRlUHJvZ3JhbXMpO1xuXHRcdFx0XHR0aGlzLl9yZWV2YWx1YXRlUHJlZGljdG9yU3RhdGUoc3RhdHMsIHRpbWVsaW5lKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGltZWxpbmUub25QcmVkaWN0aW9uU3VjY2VlZGVkKHAgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2xhc3RSb3c/LmNoYXJTdGF0ZSA9PT0gQ2hhclByZWRpY3RTdGF0ZS5IYXNQZW5kaW5nQ2hhciAmJiBpc1RlbmF0aXZlQ2hhcmFjdGVyUHJlZGljdGlvbihwKSAmJiBwLmlubmVyLmFwcGxpZWRBdCkge1xuXHRcdFx0XHRpZiAocC5pbm5lci5hcHBsaWVkQXQucG9zLnkgKyBwLmlubmVyLmFwcGxpZWRBdC5wb3MuYmFzZVkgPT09IHRoaXMuX2xhc3RSb3cueSkge1xuXHRcdFx0XHRcdHRoaXMuX2xhc3RSb3cuY2hhclN0YXRlID0gQ2hhclByZWRpY3RTdGF0ZS5WYWxpZGF0ZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvY2Vzc01hbmFnZXIub25CZWZvcmVQcm9jZXNzRGF0YShlID0+IHRoaXMuX29uQmVmb3JlUHJvY2Vzc0RhdGEoZSkpKTtcblxuXHRcdGxldCBuZXh0U3RhdHNTZW5kOiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0YXRzLm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICghbmV4dFN0YXRzU2VuZCkge1xuXHRcdFx0XHRuZXh0U3RhdHNTZW5kID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc2VuZExhdGVuY3lTdGF0cyhzdGF0cyk7XG5cdFx0XHRcdFx0bmV4dFN0YXRzU2VuZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fSwgU3RhdHNDb25zdGFudHMuU3RhdHNTZW5kVGVsZW1ldHJ5RXZlcnkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGltZWxpbmUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHN0eWxlLmRlYm91bmNlU3RvcFRyYWNraW5nKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlZXZhbHVhdGVQcmVkaWN0b3JTdGF0ZShzdGF0cywgdGltZWxpbmUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMuX2xhc3RSb3cgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZWZlckNsZWFyaW5nUHJlZGljdGlvbnMoKSB7XG5cdFx0aWYgKCF0aGlzLnN0YXRzIHx8ICF0aGlzLl90aW1lbGluZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NsZWFyUHJlZGljdGlvbkRlYm91bmNlPy5kaXNwb3NlKCk7XG5cdFx0aWYgKHRoaXMuX3RpbWVsaW5lLmxlbmd0aCA9PT0gMCB8fCB0aGlzLl90aW1lbGluZS5wZWVrU3RhcnQoKT8uY2xlYXJBZnRlclRpbWVvdXQgPT09IGZhbHNlKSB7XG5cdFx0XHR0aGlzLl9jbGVhclByZWRpY3Rpb25EZWJvdW5jZSA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jbGVhclByZWRpY3Rpb25EZWJvdW5jZSA9IGRpc3Bvc2FibGVUaW1lb3V0KFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHR0aGlzLl90aW1lbGluZT8udW5kb0FsbFByZWRpY3Rpb25zKCk7XG5cdFx0XHRcdGlmICh0aGlzLl9sYXN0Um93Py5jaGFyU3RhdGUgPT09IENoYXJQcmVkaWN0U3RhdGUuSGFzUGVuZGluZ0NoYXIpIHtcblx0XHRcdFx0XHR0aGlzLl9sYXN0Um93LmNoYXJTdGF0ZSA9IENoYXJQcmVkaWN0U3RhdGUuVW5rbm93bjtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdE1hdGgubWF4KDUwMCwgdGhpcy5zdGF0cy5tYXhMYXRlbmN5ICogMyAvIDIpLFxuXHRcdFx0dGhpcy5fc3RvcmVcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE5vdGUgb24gZGVib3VuY2U6XG5cdCAqXG5cdCAqIFdlIHdhbnQgdG8gdG9nZ2xlIHRoZSBzdGF0ZSBvbmx5IHdoZW4gdGhlIHVzZXIgaGFzIGEgcGF1c2UgaW4gdGhlaXJcblx0ICogdHlwaW5nLiBPdGhlcndpc2UsIHdlIGNvdWxkIHR1cm4gdGhpcyBvbiB3aGVuIHRoZSBQVFkgc2VudCBkYXRhIGJ1dCB0aGVcblx0ICogdGVybWluYWwgY3Vyc29yIGlzIG5vdCB1cGRhdGVkLCBjYXVzZXMgaXNzdWVzLlxuXHQgKi9cblx0QGRlYm91bmNlKDEwMClcblx0cHJvdGVjdGVkIF9yZWV2YWx1YXRlUHJlZGljdG9yU3RhdGUoc3RhdHM6IFByZWRpY3Rpb25TdGF0cywgdGltZWxpbmU6IFByZWRpY3Rpb25UaW1lbGluZSkge1xuXHRcdHRoaXMuX3JlZXZhbHVhdGVQcmVkaWN0b3JTdGF0ZU5vdyhzdGF0cywgdGltZWxpbmUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9yZWV2YWx1YXRlUHJlZGljdG9yU3RhdGVOb3coc3RhdHM6IFByZWRpY3Rpb25TdGF0cywgdGltZWxpbmU6IFByZWRpY3Rpb25UaW1lbGluZSkge1xuXHRcdGlmICh0aGlzLl9leGNsdWRlUHJvZ3JhbVJlLnRlc3QodGhpcy5fdGVybWluYWxUaXRsZSkpIHtcblx0XHRcdHRpbWVsaW5lLnNldFNob3dQcmVkaWN0aW9ucyhmYWxzZSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl90eXBlYWhlYWRUaHJlc2hvbGQgPCAwKSB7XG5cdFx0XHR0aW1lbGluZS5zZXRTaG93UHJlZGljdGlvbnMoZmFsc2UpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fdHlwZWFoZWFkVGhyZXNob2xkID09PSAwKSB7XG5cdFx0XHR0aW1lbGluZS5zZXRTaG93UHJlZGljdGlvbnModHJ1ZSk7XG5cdFx0fSBlbHNlIGlmIChzdGF0cy5zYW1wbGVTaXplID4gU3RhdHNDb25zdGFudHMuU3RhdHNNaW5TYW1wbGVzVG9UdXJuT24gJiYgc3RhdHMuYWNjdXJhY3kgPiBTdGF0c0NvbnN0YW50cy5TdGF0c01pbkFjY3VyYWN5VG9UdXJuT24pIHtcblx0XHRcdGNvbnN0IGxhdGVuY3kgPSBzdGF0cy5sYXRlbmN5Lm1lZGlhbjtcblx0XHRcdGlmIChsYXRlbmN5ID49IHRoaXMuX3R5cGVhaGVhZFRocmVzaG9sZCkge1xuXHRcdFx0XHR0aW1lbGluZS5zZXRTaG93UHJlZGljdGlvbnModHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGxhdGVuY3kgPCB0aGlzLl90eXBlYWhlYWRUaHJlc2hvbGQgLyBTdGF0c0NvbnN0YW50cy5TdGF0c1RvZ2dsZU9mZlRocmVzaG9sZCkge1xuXHRcdFx0XHR0aW1lbGluZS5zZXRTaG93UHJlZGljdGlvbnMoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NlbmRMYXRlbmN5U3RhdHMoc3RhdHM6IFByZWRpY3Rpb25TdGF0cykge1xuXHRcdC8qIF9fR0RQUl9fXG5cdFx0XHRcInRlcm1pbmFsTGF0ZW5jeVN0YXRzXCIgOiB7XG5cdFx0XHRcdFwib3duZXJcIjogXCJhbnRob255a2ltMVwiLFxuXHRcdFx0XHRcIm1pblwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFx0XCJtYXhcIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcdFwibWVkaWFuXCIgOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9LFxuXHRcdFx0XHRcImNvdW50XCIgOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiLCBcImlzTWVhc3VyZW1lbnRcIjogdHJ1ZSB9LFxuXHRcdFx0XHRcInByZWRpY3Rpb25BY2N1cmFjeVwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfVxuXHRcdFx0fVxuXHRcdCAqL1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nKCd0ZXJtaW5hbExhdGVuY3lTdGF0cycsIHtcblx0XHRcdC4uLnN0YXRzLmxhdGVuY3ksXG5cdFx0XHRwcmVkaWN0aW9uQWNjdXJhY3k6IHN0YXRzLmFjY3VyYWN5LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Vc2VyRGF0YShkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdGltZWxpbmU/LnRlcm1pbmFsLmJ1ZmZlci5hY3RpdmUudHlwZSAhPT0gJ25vcm1hbCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBjb25zb2xlLmxvZygndXNlciBkYXRhOicsIEpTT04uc3RyaW5naWZ5KGRhdGEpKTtcblxuXHRcdGNvbnN0IHRlcm1pbmFsID0gdGhpcy5fdGltZWxpbmUudGVybWluYWw7XG5cdFx0Y29uc3QgYnVmZmVyID0gdGVybWluYWwuYnVmZmVyLmFjdGl2ZTtcblxuXHRcdC8vIERldGVjdCBwcm9ncmFtcyBsaWtlIGdpdCBsb2cvbGVzcyB0aGF0IHVzZSB0aGUgbm9ybWFsIGJ1ZmZlciBidXQgZG9uJ3Rcblx0XHQvLyB0YWtlIGlucHV0IGJ5IGRlYWZ1bHQgKGZpeGVzICMxMDk1NDEpXG5cdFx0aWYgKGJ1ZmZlci5jdXJzb3JYID09PSAxICYmIGJ1ZmZlci5jdXJzb3JZID09PSB0ZXJtaW5hbC5yb3dzIC0gMSkge1xuXHRcdFx0aWYgKGJ1ZmZlci5nZXRMaW5lKGJ1ZmZlci5jdXJzb3JZICsgYnVmZmVyLmJhc2VZKT8uZ2V0Q2VsbCgwKT8uZ2V0Q2hhcnMoKSA9PT0gJzonKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyB0aGUgZm9sbG93aW5nIGNvZGUgZ3VhcmRzIHRoZSB0ZXJtaW5hbCBwcm9tcHQgdG8gYXZvaWQgYmVpbmcgYWJsZSB0b1xuXHRcdC8vIGFycm93IG9yIGJhY2tzcGFjZS1pbnRvIHRoZSBwcm9tcHQuIFJlY29yZCB0aGUgbG93ZXN0IFggdmFsdWUgYXQgd2hpY2hcblx0XHQvLyB0aGUgdXNlciBnYXZlIGlucHV0LCBhbmQgbWFyayBhbGwgYWRkaXRpb25zIGJlZm9yZSB0aGF0IGFzIHRlbnRhdGl2ZS5cblx0XHRjb25zdCBhY3R1YWxZID0gYnVmZmVyLmJhc2VZICsgYnVmZmVyLmN1cnNvclk7XG5cdFx0aWYgKGFjdHVhbFkgIT09IHRoaXMuX2xhc3RSb3c/LnkpIHtcblx0XHRcdHRoaXMuX2xhc3RSb3cgPSB7IHk6IGFjdHVhbFksIHN0YXJ0aW5nWDogYnVmZmVyLmN1cnNvclgsIGVuZGluZ1g6IGJ1ZmZlci5jdXJzb3JYLCBjaGFyU3RhdGU6IENoYXJQcmVkaWN0U3RhdGUuVW5rbm93biB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sYXN0Um93LnN0YXJ0aW5nWCA9IE1hdGgubWluKHRoaXMuX2xhc3RSb3cuc3RhcnRpbmdYLCBidWZmZXIuY3Vyc29yWCk7XG5cdFx0XHR0aGlzLl9sYXN0Um93LmVuZGluZ1ggPSBNYXRoLm1heCh0aGlzLl9sYXN0Um93LmVuZGluZ1gsIHRoaXMuX3RpbWVsaW5lLnBoeXNpY2FsQ3Vyc29yKGJ1ZmZlcikueCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkTGVmdE5hdmlnYXRpbmcgPSAocDogSVByZWRpY3Rpb24pID0+XG5cdFx0XHR0aGlzLl90aW1lbGluZSEudGVudGF0aXZlQ3Vyc29yKGJ1ZmZlcikueCA8PSB0aGlzLl9sYXN0Um93IS5zdGFydGluZ1hcblx0XHRcdFx0PyB0aGlzLl90aW1lbGluZSEuYWRkQm91bmRhcnkoYnVmZmVyLCBwKVxuXHRcdFx0XHQ6IHRoaXMuX3RpbWVsaW5lIS5hZGRQcmVkaWN0aW9uKGJ1ZmZlciwgcCk7XG5cblx0XHRjb25zdCBhZGRSaWdodE5hdmlnYXRpbmcgPSAocDogSVByZWRpY3Rpb24pID0+XG5cdFx0XHR0aGlzLl90aW1lbGluZSEudGVudGF0aXZlQ3Vyc29yKGJ1ZmZlcikueCA+PSB0aGlzLl9sYXN0Um93IS5lbmRpbmdYIC0gMVxuXHRcdFx0XHQ/IHRoaXMuX3RpbWVsaW5lIS5hZGRCb3VuZGFyeShidWZmZXIsIHApXG5cdFx0XHRcdDogdGhpcy5fdGltZWxpbmUhLmFkZFByZWRpY3Rpb24oYnVmZmVyLCBwKTtcblxuXHRcdC8qKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS94dGVybWpzL3h0ZXJtLmpzL2Jsb2IvMTkxM2U5NTEyYzA0OGUzY2Y1NmJiNWY1ZGY1MWJmZmY2ODk5YzE4NC9zcmMvY29tbW9uL2lucHV0L0tleWJvYXJkLnRzICovXG5cdFx0Y29uc3QgcmVhZGVyID0gbmV3IFN0cmluZ1JlYWRlcihkYXRhKTtcblx0XHR3aGlsZSAocmVhZGVyLnJlbWFpbmluZyA+IDApIHtcblx0XHRcdGlmIChyZWFkZXIuZWF0Q2hhckNvZGUoMTI3KSkgeyAvLyBiYWNrc3BhY2Vcblx0XHRcdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl90aW1lbGluZS5wZWVrRW5kKCk7XG5cdFx0XHRcdGlmIChwcmV2aW91cyAmJiBwcmV2aW91cyBpbnN0YW5jZW9mIENoYXJhY3RlclByZWRpY3Rpb24pIHtcblx0XHRcdFx0XHR0aGlzLl90aW1lbGluZS5hZGRCb3VuZGFyeSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gYmFja3NwYWNlIG11c3QgYmUgYWJsZSB0byByZWFkIHRoZSBwcmV2aW91c2x5LXdyaXR0ZW4gY2hhcmFjdGVyIGluXG5cdFx0XHRcdC8vIHRoZSBldmVudCB0aGF0IGl0IG5lZWRzIHRvIHVuZG8gaXRcblx0XHRcdFx0aWYgKHRoaXMuX3RpbWVsaW5lLmlzU2hvd2luZ1ByZWRpY3Rpb25zKSB7XG5cdFx0XHRcdFx0Zmx1c2hPdXRwdXQodGhpcy5fdGltZWxpbmUudGVybWluYWwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX3RpbWVsaW5lLnRlbnRhdGl2ZUN1cnNvcihidWZmZXIpLnggPD0gdGhpcy5fbGFzdFJvdy5zdGFydGluZ1gpIHtcblx0XHRcdFx0XHR0aGlzLl90aW1lbGluZS5hZGRCb3VuZGFyeShidWZmZXIsIG5ldyBCYWNrc3BhY2VQcmVkaWN0aW9uKHRoaXMuX3RpbWVsaW5lLnRlcm1pbmFsKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gQmFja3NwYWNlIGRlY3JlbWVudHMgb3VyIGFiaWxpdHkgdG8gZ28gcmlnaHQuXG5cdFx0XHRcdFx0dGhpcy5fbGFzdFJvdy5lbmRpbmdYLS07XG5cdFx0XHRcdFx0dGhpcy5fdGltZWxpbmUuYWRkUHJlZGljdGlvbihidWZmZXIsIG5ldyBCYWNrc3BhY2VQcmVkaWN0aW9uKHRoaXMuX3RpbWVsaW5lLnRlcm1pbmFsKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlYWRlci5lYXRDaGFyQ29kZSgzMiwgMTI2KSkgeyAvLyBhbHBoYW51bVxuXHRcdFx0XHRjb25zdCBjaGFyID0gZGF0YVtyZWFkZXIuaW5kZXggLSAxXTtcblx0XHRcdFx0Y29uc3QgcHJlZGljdGlvbiA9IG5ldyBDaGFyYWN0ZXJQcmVkaWN0aW9uKHRoaXMuX3R5cGVhaGVhZFN0eWxlISwgY2hhcik7XG5cdFx0XHRcdGlmICh0aGlzLl9sYXN0Um93LmNoYXJTdGF0ZSA9PT0gQ2hhclByZWRpY3RTdGF0ZS5Vbmtub3duKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGltZWxpbmUuYWRkQm91bmRhcnkoYnVmZmVyLCBwcmVkaWN0aW9uKTtcblx0XHRcdFx0XHR0aGlzLl9sYXN0Um93LmNoYXJTdGF0ZSA9IENoYXJQcmVkaWN0U3RhdGUuSGFzUGVuZGluZ0NoYXI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fdGltZWxpbmUuYWRkUHJlZGljdGlvbihidWZmZXIsIHByZWRpY3Rpb24pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHRoaXMuX3RpbWVsaW5lLnRlbnRhdGl2ZUN1cnNvcihidWZmZXIpLnggPj0gdGVybWluYWwuY29scykge1xuXHRcdFx0XHRcdHRoaXMuX3RpbWVsaW5lLmFkZEJvdW5kYXJ5KGJ1ZmZlciwgbmV3IExpbmV3cmFwUHJlZGljdGlvbigpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3Vyc29yTXYgPSByZWFkZXIuZWF0UmUoQ1NJX01PVkVfUkUpO1xuXHRcdFx0aWYgKGN1cnNvck12KSB7XG5cdFx0XHRcdGNvbnN0IGRpcmVjdGlvbiA9IGN1cnNvck12WzNdIGFzIEN1cnNvck1vdmVEaXJlY3Rpb247XG5cdFx0XHRcdGNvbnN0IHAgPSBuZXcgQ3Vyc29yTW92ZVByZWRpY3Rpb24oZGlyZWN0aW9uLCAhIWN1cnNvck12WzJdLCBOdW1iZXIoY3Vyc29yTXZbMV0pIHx8IDEpO1xuXHRcdFx0XHRpZiAoZGlyZWN0aW9uID09PSBDdXJzb3JNb3ZlRGlyZWN0aW9uLkJhY2spIHtcblx0XHRcdFx0XHRhZGRMZWZ0TmF2aWdhdGluZyhwKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhZGRSaWdodE5hdmlnYXRpbmcocCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZWFkZXIuZWF0U3RyKGAke1ZULkVzY31mYCkpIHtcblx0XHRcdFx0YWRkUmlnaHROYXZpZ2F0aW5nKG5ldyBDdXJzb3JNb3ZlUHJlZGljdGlvbihDdXJzb3JNb3ZlRGlyZWN0aW9uLkZvcndhcmRzLCB0cnVlLCAxKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVhZGVyLmVhdFN0cihgJHtWVC5Fc2N9YmApKSB7XG5cdFx0XHRcdGFkZExlZnROYXZpZ2F0aW5nKG5ldyBDdXJzb3JNb3ZlUHJlZGljdGlvbihDdXJzb3JNb3ZlRGlyZWN0aW9uLkJhY2ssIHRydWUsIDEpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZWFkZXIuZWF0Q2hhcignXFxyJykgJiYgYnVmZmVyLmN1cnNvclkgPCB0ZXJtaW5hbC5yb3dzIC0gMSkge1xuXHRcdFx0XHR0aGlzLl90aW1lbGluZS5hZGRQcmVkaWN0aW9uKGJ1ZmZlciwgbmV3IE5ld2xpbmVQcmVkaWN0aW9uKCkpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc29tZXRoaW5nIGVsc2Vcblx0XHRcdHRoaXMuX3RpbWVsaW5lLmFkZEJvdW5kYXJ5KGJ1ZmZlciwgbmV3IEhhcmRCb3VuZGFyeSgpKTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl90aW1lbGluZS5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRoaXMuX2RlZmVyQ2xlYXJpbmdQcmVkaWN0aW9ucygpO1xuXHRcdFx0dGhpcy5fdHlwZWFoZWFkU3R5bGUhLnN0YXJ0VHJhY2tpbmcoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkJlZm9yZVByb2Nlc3NEYXRhKGV2ZW50OiBJQmVmb3JlUHJvY2Vzc0RhdGFFdmVudCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdGltZWxpbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBjb25zb2xlLmxvZygnaW5jb21pbmcgZGF0YTonLCBKU09OLnN0cmluZ2lmeShldmVudC5kYXRhKSk7XG5cdFx0ZXZlbnQuZGF0YSA9IHRoaXMuX3RpbWVsaW5lLmJlZm9yZVNlcnZlcklucHV0KGV2ZW50LmRhdGEpO1xuXHRcdC8vIGNvbnNvbGUubG9nKCdlbWl0dGVkIGRhdGE6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQuZGF0YSkpO1xuXG5cdFx0dGhpcy5fZGVmZXJDbGVhcmluZ1ByZWRpY3Rpb25zKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxPQUFPLFlBQVk7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBMkQsK0JBQStCO0FBRTFGLFNBQVMsa0NBQXdFO0FBQ2pGLFNBQVMsZ0JBQW1DO0FBRTVDLElBQVcsS0FBWCxrQkFBV0EsUUFBWDtBQUNDLEVBQUFBLElBQUEsU0FBTTtBQUNOLEVBQUFBLElBQUEsU0FBTTtBQUNOLEVBQUFBLElBQUEsZ0JBQWE7QUFDYixFQUFBQSxJQUFBLGdCQUFhO0FBQ2IsRUFBQUEsSUFBQSxnQkFBYTtBQUNiLEVBQUFBLElBQUEsc0JBQW1CO0FBTlQsU0FBQUE7QUFBQSxHQUFBO0FBU1gsTUFBTSxlQUFlO0FBQ3JCLE1BQU0sY0FBYztBQUNwQixNQUFNLGNBQWM7QUFFcEIsSUFBVyxpQkFBWCxrQkFBV0Msb0JBQVg7QUFDQyxFQUFBQSxnQ0FBQSxxQkFBa0IsTUFBbEI7QUFDQSxFQUFBQSxnQ0FBQSw2QkFBMEIsT0FBMUI7QUFDQSxFQUFBQSxnQ0FBQSw2QkFBMEIsS0FBMUI7QUFDQSxFQUFBQSxnQ0FBQSw4QkFBMkIsT0FBM0I7QUFDQSxFQUFBQSxnQ0FBQSw2QkFBMEIsT0FBMUI7QUFMVSxTQUFBQTtBQUFBLEdBQUE7QUFtQlgsTUFBTSxxQkFBcUI7QUFFM0IsTUFBTSxPQUFPLENBQUMsYUFBbUM7QUFJaEQsU0FBUSxTQUEyQjtBQUNwQztBQUNBLE1BQU0sY0FBYyxDQUFDLGFBQXVCO0FBRTVDO0FBRUEsSUFBVyxzQkFBWCxrQkFBV0MseUJBQVg7QUFDQyxFQUFBQSxxQkFB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O0FBQUEsUUFDckI7QUFDQTtBQUFBLE1BQ0Q7QUFFQSxVQUFJLE9BQU8sT0FBTyxHQUFHLGdCQUFNLEdBQUcsR0FBRztBQUNoQywyQkFBbUIsSUFBSSxxQkFBcUIsb0JBQThCLE1BQU0sQ0FBQyxDQUFDO0FBQ2xGO0FBQUEsTUFDRDtBQUVBLFVBQUksT0FBTyxPQUFPLEdBQUcsZ0JBQU0sR0FBRyxHQUFHO0FBQ2hDLDBCQUFrQixJQUFJLHFCQUFxQixnQkFBMEIsTUFBTSxDQUFDLENBQUM7QUFDN0U7QUFBQSxNQUNEO0FBRUEsVUFBSSxPQUFPLFFBQVEsSUFBSSxLQUFLLE9BQU8sVUFBVSxTQUFTLE9BQU8sR0FBRztBQUMvRCxhQUFLLFVBQVUsY0FBYyxRQUFRLElBQUksa0JBQWtCLENBQUM7QUFDNUQ7QUFBQSxNQUNEO0FBR0EsV0FBSyxVQUFVLFlBQVksUUFBUSxJQUFJLGFBQWEsQ0FBQztBQUNyRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssVUFBVSxXQUFXLEdBQUc7QUFDaEMsV0FBSywwQkFBMEI7QUFDL0IsV0FBSyxnQkFBaUIsY0FBYztBQUFBLElBQ3JDO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQXFCLE9BQXNDO0FBQ2xFLFFBQUksQ0FBQyxLQUFLLFdBQVc7QUFDcEI7QUFBQSxJQUNEO0FBR0EsVUFBTSxPQUFPLEtBQUssVUFBVSxrQkFBa0IsTUFBTSxJQUFJO0FBR3hELFNBQUssMEJBQTBCO0FBQUEsRUFDaEM7QUFDRDtBQXhLVztBQUFBLEVBRFQsU0FBUyxHQUFHO0FBQUEsR0E3R0QsZUE4R0Y7QUE5R0UsaUJBQU47QUFBQSxFQWdCSjtBQUFBLEVBQ0E7QUFBQSxHQWpCVTsiLAogICJuYW1lcyI6IFsiVlQiLCAiU3RhdHNDb25zdGFudHMiLCAiQ3Vyc29yTW92ZURpcmVjdGlvbiIsICJNYXRjaFJlc3VsdCIsICJDaGFyUHJlZGljdFN0YXRlIl0KfQo=
