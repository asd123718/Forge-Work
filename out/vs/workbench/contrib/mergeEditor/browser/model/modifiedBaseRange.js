import { compareBy, concatArrays, equals, numberComparator, tieBreakComparators } from "../../../../../base/common/arrays.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { splitLines } from "../../../../../base/common/strings.js";
import { Constants } from "../../../../../base/common/uint.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { LineRangeEdit, RangeEdit } from "./editing.js";
import { DetailedLineRangeMapping, MappingAlignment } from "./mapping.js";
class ModifiedBaseRange {
  constructor(baseRange, baseTextModel, input1Range, input1TextModel, input1Diffs, input2Range, input2TextModel, input2Diffs) {
    this.baseRange = baseRange;
    this.baseTextModel = baseTextModel;
    this.input1Range = input1Range;
    this.input1TextModel = input1TextModel;
    this.input1Diffs = input1Diffs;
    this.input2Range = input2Range;
    this.input2TextModel = input2TextModel;
    this.input2Diffs = input2Diffs;
    this.input1CombinedDiff = DetailedLineRangeMapping.join(this.input1Diffs);
    this.input2CombinedDiff = DetailedLineRangeMapping.join(this.input2Diffs);
    this.isEqualChange = equals(this.input1Diffs, this.input2Diffs, (a, b) => a.getLineEdit().equals(b.getLineEdit()));
    this.smartInput1LineRangeEdit = null;
    this.smartInput2LineRangeEdit = null;
    this.dumbInput1LineRangeEdit = null;
    this.dumbInput2LineRangeEdit = null;
    if (this.input1Diffs.length === 0 && this.input2Diffs.length === 0) {
      throw new BugIndicatingError("must have at least one diff");
    }
  }
  static fromDiffs(diffs1, diffs2, baseTextModel, input1TextModel, input2TextModel) {
    const alignments = MappingAlignment.compute(diffs1, diffs2);
    return alignments.map(
      (a) => new ModifiedBaseRange(
        a.inputRange,
        baseTextModel,
        a.output1Range,
        input1TextModel,
        a.output1LineMappings,
        a.output2Range,
        input2TextModel,
        a.output2LineMappings
      )
    );
  }
  getInputRange(inputNumber) {
    return inputNumber === 1 ? this.input1Range : this.input2Range;
  }
  getInputCombinedDiff(inputNumber) {
    return inputNumber === 1 ? this.input1CombinedDiff : this.input2CombinedDiff;
  }
  getInputDiffs(inputNumber) {
    return inputNumber === 1 ? this.input1Diffs : this.input2Diffs;
  }
  get isConflicting() {
    return this.input1Diffs.length > 0 && this.input2Diffs.length > 0;
  }
  get canBeCombined() {
    return this.smartCombineInputs(1) !== void 0;
  }
  get isOrderRelevant() {
    const input1 = this.smartCombineInputs(1);
    const input2 = this.smartCombineInputs(2);
    if (!input1 || !input2) {
      return false;
    }
    return !input1.equals(input2);
  }
  getEditForBase(state) {
    const diffs = [];
    if (state.includesInput1 && this.input1CombinedDiff) {
      diffs.push({ diff: this.input1CombinedDiff, inputNumber: 1 });
    }
    if (state.includesInput2 && this.input2CombinedDiff) {
      diffs.push({ diff: this.input2CombinedDiff, inputNumber: 2 });
    }
    if (diffs.length === 0) {
      return { edit: void 0, effectiveState: ModifiedBaseRangeState.base };
    }
    if (diffs.length === 1) {
      return { edit: diffs[0].diff.getLineEdit(), effectiveState: ModifiedBaseRangeState.base.withInputValue(diffs[0].inputNumber, true, false) };
    }
    if (state.kind !== 3 /* both */) {
      throw new BugIndicatingError();
    }
    const smartCombinedEdit = state.smartCombination ? this.smartCombineInputs(state.firstInput) : this.dumbCombineInputs(state.firstInput);
    if (smartCombinedEdit) {
      return { edit: smartCombinedEdit, effectiveState: state };
    }
    return {
      edit: diffs[getOtherInputNumber(state.firstInput) - 1].diff.getLineEdit(),
      effectiveState: ModifiedBaseRangeState.base.withInputValue(
        getOtherInputNumber(state.firstInput),
        true,
        false
      )
    };
  }
  smartCombineInputs(firstInput) {
    if (firstInput === 1 && this.smartInput1LineRangeEdit !== null) {
      return this.smartInput1LineRangeEdit;
    } else if (firstInput === 2 && this.smartInput2LineRangeEdit !== null) {
      return this.smartInput2LineRangeEdit;
    }
    const combinedDiffs = concatArrays(
      this.input1Diffs.flatMap(
        (diffs) => diffs.rangeMappings.map((diff) => ({ diff, input: 1 }))
      ),
      this.input2Diffs.flatMap(
        (diffs) => diffs.rangeMappings.map((diff) => ({ diff, input: 2 }))
      )
    ).sort(
      tieBreakComparators(
        compareBy((d) => d.diff.inputRange, Range.compareRangesUsingStarts),
        compareBy((d) => d.input === firstInput ? 1 : 2, numberComparator)
      )
    );
    const sortedEdits = combinedDiffs.map((d) => {
      const sourceTextModel = d.input === 1 ? this.input1TextModel : this.input2TextModel;
      return new RangeEdit(d.diff.inputRange, sourceTextModel.getValueInRange(d.diff.outputRange));
    });
    const result = editsToLineRangeEdit(this.baseRange, sortedEdits, this.baseTextModel);
    if (firstInput === 1) {
      this.smartInput1LineRangeEdit = result;
    } else {
      this.smartInput2LineRangeEdit = result;
    }
    return result;
  }
  dumbCombineInputs(firstInput) {
    if (firstInput === 1 && this.dumbInput1LineRangeEdit !== null) {
      return this.dumbInput1LineRangeEdit;
    } else if (firstInput === 2 && this.dumbInput2LineRangeEdit !== null) {
      return this.dumbInput2LineRangeEdit;
    }
    let input1Lines = this.input1Range.getLines(this.input1TextModel);
    let input2Lines = this.input2Range.getLines(this.input2TextModel);
    if (firstInput === 2) {
      [input1Lines, input2Lines] = [input2Lines, input1Lines];
    }
    const result = new LineRangeEdit(this.baseRange, input1Lines.concat(input2Lines));
    if (firstInput === 1) {
      this.dumbInput1LineRangeEdit = result;
    } else {
      this.dumbInput2LineRangeEdit = result;
    }
    return result;
  }
}
function editsToLineRangeEdit(range, sortedEdits, textModel) {
  let text = "";
  const startsLineBefore = range.startLineNumber > 1;
  let currentPosition = startsLineBefore ? new Position(
    range.startLineNumber - 1,
    textModel.getLineMaxColumn(range.startLineNumber - 1)
  ) : new Position(range.startLineNumber, 1);
  for (const edit of sortedEdits) {
    const diffStart = edit.range.getStartPosition();
    if (!currentPosition.isBeforeOrEqual(diffStart)) {
      return void 0;
    }
    let originalText2 = textModel.getValueInRange(Range.fromPositions(currentPosition, diffStart));
    if (diffStart.lineNumber > textModel.getLineCount()) {
      originalText2 += "\n";
    }
    text += originalText2;
    text += edit.newText;
    currentPosition = edit.range.getEndPosition();
  }
  const endsLineAfter = range.endLineNumberExclusive <= textModel.getLineCount();
  const end = endsLineAfter ? new Position(
    range.endLineNumberExclusive,
    1
  ) : new Position(range.endLineNumberExclusive - 1, Constants.MAX_SAFE_SMALL_INTEGER);
  const originalText = textModel.getValueInRange(
    Range.fromPositions(currentPosition, end)
  );
  text += originalText;
  const lines = splitLines(text);
  if (startsLineBefore) {
    if (lines[0] !== "") {
      return void 0;
    }
    lines.shift();
  }
  if (endsLineAfter) {
    if (lines[lines.length - 1] !== "") {
      return void 0;
    }
    lines.pop();
  }
  return new LineRangeEdit(range, lines);
}
var ModifiedBaseRangeStateKind = /* @__PURE__ */ ((ModifiedBaseRangeStateKind2) => {
  ModifiedBaseRangeStateKind2[ModifiedBaseRangeStateKind2["base"] = 0] = "base";
  ModifiedBaseRangeStateKind2[ModifiedBaseRangeStateKind2["input1"] = 1] = "input1";
  ModifiedBaseRangeStateKind2[ModifiedBaseRangeStateKind2["input2"] = 2] = "input2";
  ModifiedBaseRangeStateKind2[ModifiedBaseRangeStateKind2["both"] = 3] = "both";
  ModifiedBaseRangeStateKind2[ModifiedBaseRangeStateKind2["unrecognized"] = 4] = "unrecognized";
  return ModifiedBaseRangeStateKind2;
})(ModifiedBaseRangeStateKind || {});
function getOtherInputNumber(inputNumber) {
  return inputNumber === 1 ? 2 : 1;
}
class AbstractModifiedBaseRangeState {
  constructor() {
  }
  get includesInput1() {
    return false;
  }
  get includesInput2() {
    return false;
  }
  includesInput(inputNumber) {
    return inputNumber === 1 ? this.includesInput1 : this.includesInput2;
  }
  isInputIncluded(inputNumber) {
    return inputNumber === 1 ? this.includesInput1 : this.includesInput2;
  }
  toggle(inputNumber) {
    return this.withInputValue(inputNumber, !this.includesInput(inputNumber), true);
  }
  getInput(inputNumber) {
    if (!this.isInputIncluded(inputNumber)) {
      return 0 /* excluded */;
    }
    return 1 /* first */;
  }
}
class ModifiedBaseRangeStateBase extends AbstractModifiedBaseRangeState {
  get kind() {
    return 0 /* base */;
  }
  toString() {
    return "base";
  }
  swap() {
    return this;
  }
  withInputValue(inputNumber, value, smartCombination = false) {
    if (inputNumber === 1) {
      return value ? new ModifiedBaseRangeStateInput1() : this;
    } else {
      return value ? new ModifiedBaseRangeStateInput2() : this;
    }
  }
  equals(other) {
    return other.kind === 0 /* base */;
  }
}
class ModifiedBaseRangeStateInput1 extends AbstractModifiedBaseRangeState {
  get kind() {
    return 1 /* input1 */;
  }
  get includesInput1() {
    return true;
  }
  toString() {
    return "1\u2713";
  }
  swap() {
    return new ModifiedBaseRangeStateInput2();
  }
  withInputValue(inputNumber, value, smartCombination = false) {
    if (inputNumber === 1) {
      return value ? this : new ModifiedBaseRangeStateBase();
    } else {
      return value ? new ModifiedBaseRangeStateBoth(1, smartCombination) : new ModifiedBaseRangeStateInput2();
    }
  }
  equals(other) {
    return other.kind === 1 /* input1 */;
  }
}
class ModifiedBaseRangeStateInput2 extends AbstractModifiedBaseRangeState {
  get kind() {
    return 2 /* input2 */;
  }
  get includesInput2() {
    return true;
  }
  toString() {
    return "2\u2713";
  }
  swap() {
    return new ModifiedBaseRangeStateInput1();
  }
  withInputValue(inputNumber, value, smartCombination = false) {
    if (inputNumber === 2) {
      return value ? this : new ModifiedBaseRangeStateBase();
    } else {
      return value ? new ModifiedBaseRangeStateBoth(2, smartCombination) : new ModifiedBaseRangeStateInput2();
    }
  }
  equals(other) {
    return other.kind === 2 /* input2 */;
  }
}
class ModifiedBaseRangeStateBoth extends AbstractModifiedBaseRangeState {
  constructor(firstInput, smartCombination) {
    super();
    this.firstInput = firstInput;
    this.smartCombination = smartCombination;
  }
  get kind() {
    return 3 /* both */;
  }
  get includesInput1() {
    return true;
  }
  get includesInput2() {
    return true;
  }
  toString() {
    return "2\u2713";
  }
  swap() {
    return new ModifiedBaseRangeStateBoth(getOtherInputNumber(this.firstInput), this.smartCombination);
  }
  withInputValue(inputNumber, value, smartCombination = false) {
    if (value) {
      return this;
    }
    return inputNumber === 1 ? new ModifiedBaseRangeStateInput2() : new ModifiedBaseRangeStateInput1();
  }
  equals(other) {
    return other.kind === 3 /* both */ && this.firstInput === other.firstInput && this.smartCombination === other.smartCombination;
  }
  getInput(inputNumber) {
    return inputNumber === this.firstInput ? 1 /* first */ : 2 /* second */;
  }
}
class ModifiedBaseRangeStateUnrecognized extends AbstractModifiedBaseRangeState {
  get kind() {
    return 4 /* unrecognized */;
  }
  toString() {
    return "unrecognized";
  }
  swap() {
    return this;
  }
  withInputValue(inputNumber, value, smartCombination = false) {
    if (!value) {
      return this;
    }
    return inputNumber === 1 ? new ModifiedBaseRangeStateInput1() : new ModifiedBaseRangeStateInput2();
  }
  equals(other) {
    return other.kind === 4 /* unrecognized */;
  }
}
var ModifiedBaseRangeState;
((ModifiedBaseRangeState2) => {
  ModifiedBaseRangeState2.base = new ModifiedBaseRangeStateBase();
  ModifiedBaseRangeState2.unrecognized = new ModifiedBaseRangeStateUnrecognized();
})(ModifiedBaseRangeState || (ModifiedBaseRangeState = {}));
var InputState = /* @__PURE__ */ ((InputState2) => {
  InputState2[InputState2["excluded"] = 0] = "excluded";
  InputState2[InputState2["first"] = 1] = "first";
  InputState2[InputState2["second"] = 2] = "second";
  InputState2[InputState2["unrecognized"] = 3] = "unrecognized";
  return InputState2;
})(InputState || {});
export {
  AbstractModifiedBaseRangeState,
  InputState,
  ModifiedBaseRange,
  ModifiedBaseRangeState,
  ModifiedBaseRangeStateBase,
  ModifiedBaseRangeStateBoth,
  ModifiedBaseRangeStateInput1,
  ModifiedBaseRangeStateInput2,
  ModifiedBaseRangeStateKind,
  ModifiedBaseRangeStateUnrecognized,
  getOtherInputNumber
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFxtb2RlbFxcbW9kaWZpZWRCYXNlUmFuZ2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb21wYXJlQnksIGNvbmNhdEFycmF5cywgZXF1YWxzLCBudW1iZXJDb21wYXJhdG9yLCB0aWVCcmVha0NvbXBhcmF0b3JzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBzcGxpdExpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZUVkaXQsIFJhbmdlRWRpdCB9IGZyb20gJy4vZWRpdGluZy5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvckxpbmVSYW5nZSB9IGZyb20gJy4vbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZywgTWFwcGluZ0FsaWdubWVudCB9IGZyb20gJy4vbWFwcGluZy5qcyc7XG5cbi8qKlxuICogRGVzY3JpYmVzIG1vZGlmaWNhdGlvbnMgaW4gaW5wdXQgMSBhbmQgaW5wdXQgMiBmb3IgYSBzcGVjaWZpYyByYW5nZSBpbiBiYXNlLlxuICpcbiAqIFRoZSBVSSBvZmZlcnMgYSBtZWNoYW5pc20gdG8gZWl0aGVyIGFwcGx5IGFsbCBjaGFuZ2VzIGZyb20gaW5wdXQgMSBvciBpbnB1dCAyIG9yIGJvdGguXG4gKlxuICogSW1tdXRhYmxlLlxuKi9cbmV4cG9ydCBjbGFzcyBNb2RpZmllZEJhc2VSYW5nZSB7XG5cdHB1YmxpYyBzdGF0aWMgZnJvbURpZmZzKFxuXHRcdGRpZmZzMTogcmVhZG9ubHkgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10sXG5cdFx0ZGlmZnMyOiByZWFkb25seSBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSxcblx0XHRiYXNlVGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdGlucHV0MVRleHRNb2RlbDogSVRleHRNb2RlbCxcblx0XHRpbnB1dDJUZXh0TW9kZWw6IElUZXh0TW9kZWxcblx0KTogTW9kaWZpZWRCYXNlUmFuZ2VbXSB7XG5cdFx0Y29uc3QgYWxpZ25tZW50cyA9IE1hcHBpbmdBbGlnbm1lbnQuY29tcHV0ZShkaWZmczEsIGRpZmZzMik7XG5cdFx0cmV0dXJuIGFsaWdubWVudHMubWFwKFxuXHRcdFx0KGEpID0+IG5ldyBNb2RpZmllZEJhc2VSYW5nZShcblx0XHRcdFx0YS5pbnB1dFJhbmdlLFxuXHRcdFx0XHRiYXNlVGV4dE1vZGVsLFxuXHRcdFx0XHRhLm91dHB1dDFSYW5nZSxcblx0XHRcdFx0aW5wdXQxVGV4dE1vZGVsLFxuXHRcdFx0XHRhLm91dHB1dDFMaW5lTWFwcGluZ3MsXG5cdFx0XHRcdGEub3V0cHV0MlJhbmdlLFxuXHRcdFx0XHRpbnB1dDJUZXh0TW9kZWwsXG5cdFx0XHRcdGEub3V0cHV0MkxpbmVNYXBwaW5nc1xuXHRcdFx0KVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgaW5wdXQxQ29tYmluZWREaWZmO1xuXHRwdWJsaWMgcmVhZG9ubHkgaW5wdXQyQ29tYmluZWREaWZmO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNFcXVhbENoYW5nZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgYmFzZVJhbmdlOiBNZXJnZUVkaXRvckxpbmVSYW5nZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYmFzZVRleHRNb2RlbDogSVRleHRNb2RlbCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5wdXQxUmFuZ2U6IE1lcmdlRWRpdG9yTGluZVJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSBpbnB1dDFUZXh0TW9kZWw6IElUZXh0TW9kZWwsXG5cblx0XHQvKipcblx0XHQgKiBGcm9tIGJhc2UgdG8gaW5wdXQxXG5cdFx0Ki9cblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5wdXQxRGlmZnM6IHJlYWRvbmx5IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdLFxuXHRcdHB1YmxpYyByZWFkb25seSBpbnB1dDJSYW5nZTogTWVyZ2VFZGl0b3JMaW5lUmFuZ2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IGlucHV0MlRleHRNb2RlbDogSVRleHRNb2RlbCxcblxuXHRcdC8qKlxuXHRcdCAqIEZyb20gYmFzZSB0byBpbnB1dDJcblx0XHQqL1xuXHRcdHB1YmxpYyByZWFkb25seSBpbnB1dDJEaWZmczogcmVhZG9ubHkgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW11cblx0KSB7XG5cdFx0dGhpcy5pbnB1dDFDb21iaW5lZERpZmYgPSBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcuam9pbih0aGlzLmlucHV0MURpZmZzKTtcblx0XHR0aGlzLmlucHV0MkNvbWJpbmVkRGlmZiA9IERldGFpbGVkTGluZVJhbmdlTWFwcGluZy5qb2luKHRoaXMuaW5wdXQyRGlmZnMpO1xuXHRcdHRoaXMuaXNFcXVhbENoYW5nZSA9IGVxdWFscyh0aGlzLmlucHV0MURpZmZzLCB0aGlzLmlucHV0MkRpZmZzLCAoYSwgYikgPT4gYS5nZXRMaW5lRWRpdCgpLmVxdWFscyhiLmdldExpbmVFZGl0KCkpKTtcblx0XHR0aGlzLnNtYXJ0SW5wdXQxTGluZVJhbmdlRWRpdCA9IG51bGw7XG5cdFx0dGhpcy5zbWFydElucHV0MkxpbmVSYW5nZUVkaXQgPSBudWxsO1xuXHRcdHRoaXMuZHVtYklucHV0MUxpbmVSYW5nZUVkaXQgPSBudWxsO1xuXHRcdHRoaXMuZHVtYklucHV0MkxpbmVSYW5nZUVkaXQgPSBudWxsO1xuXHRcdGlmICh0aGlzLmlucHV0MURpZmZzLmxlbmd0aCA9PT0gMCAmJiB0aGlzLmlucHV0MkRpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignbXVzdCBoYXZlIGF0IGxlYXN0IG9uZSBkaWZmJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldElucHV0UmFuZ2UoaW5wdXROdW1iZXI6IDEgfCAyKTogTWVyZ2VFZGl0b3JMaW5lUmFuZ2Uge1xuXHRcdHJldHVybiBpbnB1dE51bWJlciA9PT0gMSA/IHRoaXMuaW5wdXQxUmFuZ2UgOiB0aGlzLmlucHV0MlJhbmdlO1xuXHR9XG5cblx0cHVibGljIGdldElucHV0Q29tYmluZWREaWZmKGlucHV0TnVtYmVyOiAxIHwgMik6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGlucHV0TnVtYmVyID09PSAxID8gdGhpcy5pbnB1dDFDb21iaW5lZERpZmYgOiB0aGlzLmlucHV0MkNvbWJpbmVkRGlmZjtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbnB1dERpZmZzKGlucHV0TnVtYmVyOiAxIHwgMik6IHJlYWRvbmx5IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdIHtcblx0XHRyZXR1cm4gaW5wdXROdW1iZXIgPT09IDEgPyB0aGlzLmlucHV0MURpZmZzIDogdGhpcy5pbnB1dDJEaWZmcztcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNDb25mbGljdGluZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dDFEaWZmcy5sZW5ndGggPiAwICYmIHRoaXMuaW5wdXQyRGlmZnMubGVuZ3RoID4gMDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY2FuQmVDb21iaW5lZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zbWFydENvbWJpbmVJbnB1dHMoMSkgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNPcmRlclJlbGV2YW50KCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlucHV0MSA9IHRoaXMuc21hcnRDb21iaW5lSW5wdXRzKDEpO1xuXHRcdGNvbnN0IGlucHV0MiA9IHRoaXMuc21hcnRDb21iaW5lSW5wdXRzKDIpO1xuXHRcdGlmICghaW5wdXQxIHx8ICFpbnB1dDIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICFpbnB1dDEuZXF1YWxzKGlucHV0Mik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWRpdEZvckJhc2Uoc3RhdGU6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUpOiB7IGVkaXQ6IExpbmVSYW5nZUVkaXQgfCB1bmRlZmluZWQ7IGVmZmVjdGl2ZVN0YXRlOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlIH0ge1xuXHRcdGNvbnN0IGRpZmZzOiB7IGRpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZzsgaW5wdXROdW1iZXI6IElucHV0TnVtYmVyIH1bXSA9IFtdO1xuXHRcdGlmIChzdGF0ZS5pbmNsdWRlc0lucHV0MSAmJiB0aGlzLmlucHV0MUNvbWJpbmVkRGlmZikge1xuXHRcdFx0ZGlmZnMucHVzaCh7IGRpZmY6IHRoaXMuaW5wdXQxQ29tYmluZWREaWZmLCBpbnB1dE51bWJlcjogMSB9KTtcblx0XHR9XG5cdFx0aWYgKHN0YXRlLmluY2x1ZGVzSW5wdXQyICYmIHRoaXMuaW5wdXQyQ29tYmluZWREaWZmKSB7XG5cdFx0XHRkaWZmcy5wdXNoKHsgZGlmZjogdGhpcy5pbnB1dDJDb21iaW5lZERpZmYsIGlucHV0TnVtYmVyOiAyIH0pO1xuXHRcdH1cblxuXHRcdGlmIChkaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IGVkaXQ6IHVuZGVmaW5lZCwgZWZmZWN0aXZlU3RhdGU6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUuYmFzZSB9O1xuXHRcdH1cblx0XHRpZiAoZGlmZnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4geyBlZGl0OiBkaWZmc1swXS5kaWZmLmdldExpbmVFZGl0KCksIGVmZmVjdGl2ZVN0YXRlOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlLmJhc2Uud2l0aElucHV0VmFsdWUoZGlmZnNbMF0uaW5wdXROdW1iZXIsIHRydWUsIGZhbHNlKSB9O1xuXHRcdH1cblxuXHRcdGlmIChzdGF0ZS5raW5kICE9PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5ib3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc21hcnRDb21iaW5lZEVkaXQgPSBzdGF0ZS5zbWFydENvbWJpbmF0aW9uID8gdGhpcy5zbWFydENvbWJpbmVJbnB1dHMoc3RhdGUuZmlyc3RJbnB1dCkgOiB0aGlzLmR1bWJDb21iaW5lSW5wdXRzKHN0YXRlLmZpcnN0SW5wdXQpO1xuXHRcdGlmIChzbWFydENvbWJpbmVkRWRpdCkge1xuXHRcdFx0cmV0dXJuIHsgZWRpdDogc21hcnRDb21iaW5lZEVkaXQsIGVmZmVjdGl2ZVN0YXRlOiBzdGF0ZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRlZGl0OiBkaWZmc1tnZXRPdGhlcklucHV0TnVtYmVyKHN0YXRlLmZpcnN0SW5wdXQpIC0gMV0uZGlmZi5nZXRMaW5lRWRpdCgpLFxuXHRcdFx0ZWZmZWN0aXZlU3RhdGU6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUuYmFzZS53aXRoSW5wdXRWYWx1ZShcblx0XHRcdFx0Z2V0T3RoZXJJbnB1dE51bWJlcihzdGF0ZS5maXJzdElucHV0KSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc21hcnRJbnB1dDFMaW5lUmFuZ2VFZGl0OiBMaW5lUmFuZ2VFZGl0IHwgdW5kZWZpbmVkIHwgbnVsbDtcblx0cHJpdmF0ZSBzbWFydElucHV0MkxpbmVSYW5nZUVkaXQ6IExpbmVSYW5nZUVkaXQgfCB1bmRlZmluZWQgfCBudWxsO1xuXG5cdHByaXZhdGUgc21hcnRDb21iaW5lSW5wdXRzKGZpcnN0SW5wdXQ6IDEgfCAyKTogTGluZVJhbmdlRWRpdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGZpcnN0SW5wdXQgPT09IDEgJiYgdGhpcy5zbWFydElucHV0MUxpbmVSYW5nZUVkaXQgIT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0aGlzLnNtYXJ0SW5wdXQxTGluZVJhbmdlRWRpdDtcblx0XHR9IGVsc2UgaWYgKGZpcnN0SW5wdXQgPT09IDIgJiYgdGhpcy5zbWFydElucHV0MkxpbmVSYW5nZUVkaXQgIT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0aGlzLnNtYXJ0SW5wdXQyTGluZVJhbmdlRWRpdDtcblx0XHR9XG5cblx0XHRjb25zdCBjb21iaW5lZERpZmZzID0gY29uY2F0QXJyYXlzKFxuXHRcdFx0dGhpcy5pbnB1dDFEaWZmcy5mbGF0TWFwKChkaWZmcykgPT5cblx0XHRcdFx0ZGlmZnMucmFuZ2VNYXBwaW5ncy5tYXAoKGRpZmYpID0+ICh7IGRpZmYsIGlucHV0OiAxIGFzIGNvbnN0IH0pKVxuXHRcdFx0KSxcblx0XHRcdHRoaXMuaW5wdXQyRGlmZnMuZmxhdE1hcCgoZGlmZnMpID0+XG5cdFx0XHRcdGRpZmZzLnJhbmdlTWFwcGluZ3MubWFwKChkaWZmKSA9PiAoeyBkaWZmLCBpbnB1dDogMiBhcyBjb25zdCB9KSlcblx0XHRcdClcblx0XHQpLnNvcnQoXG5cdFx0XHR0aWVCcmVha0NvbXBhcmF0b3JzKFxuXHRcdFx0XHRjb21wYXJlQnkoKGQpID0+IGQuZGlmZi5pbnB1dFJhbmdlLCBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpLFxuXHRcdFx0XHRjb21wYXJlQnkoKGQpID0+IChkLmlucHV0ID09PSBmaXJzdElucHV0ID8gMSA6IDIpLCBudW1iZXJDb21wYXJhdG9yKVxuXHRcdFx0KVxuXHRcdCk7XG5cblx0XHRjb25zdCBzb3J0ZWRFZGl0cyA9IGNvbWJpbmVkRGlmZnMubWFwKGQgPT4ge1xuXHRcdFx0Y29uc3Qgc291cmNlVGV4dE1vZGVsID0gZC5pbnB1dCA9PT0gMSA/IHRoaXMuaW5wdXQxVGV4dE1vZGVsIDogdGhpcy5pbnB1dDJUZXh0TW9kZWw7XG5cdFx0XHRyZXR1cm4gbmV3IFJhbmdlRWRpdChkLmRpZmYuaW5wdXRSYW5nZSwgc291cmNlVGV4dE1vZGVsLmdldFZhbHVlSW5SYW5nZShkLmRpZmYub3V0cHV0UmFuZ2UpKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGVkaXRzVG9MaW5lUmFuZ2VFZGl0KHRoaXMuYmFzZVJhbmdlLCBzb3J0ZWRFZGl0cywgdGhpcy5iYXNlVGV4dE1vZGVsKTtcblx0XHRpZiAoZmlyc3RJbnB1dCA9PT0gMSkge1xuXHRcdFx0dGhpcy5zbWFydElucHV0MUxpbmVSYW5nZUVkaXQgPSByZXN1bHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc21hcnRJbnB1dDJMaW5lUmFuZ2VFZGl0ID0gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBkdW1iSW5wdXQxTGluZVJhbmdlRWRpdDogTGluZVJhbmdlRWRpdCB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdHByaXZhdGUgZHVtYklucHV0MkxpbmVSYW5nZUVkaXQ6IExpbmVSYW5nZUVkaXQgfCB1bmRlZmluZWQgfCBudWxsO1xuXG5cdHByaXZhdGUgZHVtYkNvbWJpbmVJbnB1dHMoZmlyc3RJbnB1dDogMSB8IDIpOiBMaW5lUmFuZ2VFZGl0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZmlyc3RJbnB1dCA9PT0gMSAmJiB0aGlzLmR1bWJJbnB1dDFMaW5lUmFuZ2VFZGl0ICE9PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kdW1iSW5wdXQxTGluZVJhbmdlRWRpdDtcblx0XHR9IGVsc2UgaWYgKGZpcnN0SW5wdXQgPT09IDIgJiYgdGhpcy5kdW1iSW5wdXQyTGluZVJhbmdlRWRpdCAhPT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZHVtYklucHV0MkxpbmVSYW5nZUVkaXQ7XG5cdFx0fVxuXG5cdFx0bGV0IGlucHV0MUxpbmVzID0gdGhpcy5pbnB1dDFSYW5nZS5nZXRMaW5lcyh0aGlzLmlucHV0MVRleHRNb2RlbCk7XG5cdFx0bGV0IGlucHV0MkxpbmVzID0gdGhpcy5pbnB1dDJSYW5nZS5nZXRMaW5lcyh0aGlzLmlucHV0MlRleHRNb2RlbCk7XG5cdFx0aWYgKGZpcnN0SW5wdXQgPT09IDIpIHtcblx0XHRcdFtpbnB1dDFMaW5lcywgaW5wdXQyTGluZXNdID0gW2lucHV0MkxpbmVzLCBpbnB1dDFMaW5lc107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IExpbmVSYW5nZUVkaXQodGhpcy5iYXNlUmFuZ2UsIGlucHV0MUxpbmVzLmNvbmNhdChpbnB1dDJMaW5lcykpO1xuXHRcdGlmIChmaXJzdElucHV0ID09PSAxKSB7XG5cdFx0XHR0aGlzLmR1bWJJbnB1dDFMaW5lUmFuZ2VFZGl0ID0gcmVzdWx0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmR1bWJJbnB1dDJMaW5lUmFuZ2VFZGl0ID0gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGVkaXRzVG9MaW5lUmFuZ2VFZGl0KHJhbmdlOiBNZXJnZUVkaXRvckxpbmVSYW5nZSwgc29ydGVkRWRpdHM6IFJhbmdlRWRpdFtdLCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBMaW5lUmFuZ2VFZGl0IHwgdW5kZWZpbmVkIHtcblx0bGV0IHRleHQgPSAnJztcblx0Y29uc3Qgc3RhcnRzTGluZUJlZm9yZSA9IHJhbmdlLnN0YXJ0TGluZU51bWJlciA+IDE7XG5cdGxldCBjdXJyZW50UG9zaXRpb24gPSBzdGFydHNMaW5lQmVmb3JlXG5cdFx0PyBuZXcgUG9zaXRpb24oXG5cdFx0XHRyYW5nZS5zdGFydExpbmVOdW1iZXIgLSAxLFxuXHRcdFx0dGV4dE1vZGVsLmdldExpbmVNYXhDb2x1bW4ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSlcblx0XHQpXG5cdFx0OiBuZXcgUG9zaXRpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKTtcblxuXHRmb3IgKGNvbnN0IGVkaXQgb2Ygc29ydGVkRWRpdHMpIHtcblx0XHRjb25zdCBkaWZmU3RhcnQgPSBlZGl0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRpZiAoIWN1cnJlbnRQb3NpdGlvbi5pc0JlZm9yZU9yRXF1YWwoZGlmZlN0YXJ0KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IG9yaWdpbmFsVGV4dCA9IHRleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2UoUmFuZ2UuZnJvbVBvc2l0aW9ucyhjdXJyZW50UG9zaXRpb24sIGRpZmZTdGFydCkpO1xuXHRcdGlmIChkaWZmU3RhcnQubGluZU51bWJlciA+IHRleHRNb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0Ly8gYXNzZXJ0IGRpZmZTdGFydC5saW5lTnVtYmVyID09PSB0ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCkgKyAxXG5cdFx0XHQvLyBnZXRWYWx1ZUluUmFuZ2UgZG9lc24ndCBpbmNsdWRlIHRoaXMgdmlydHVhbCBsaW5lIGJyZWFrLCBhcyB0aGUgZG9jdW1lbnQgZW5kcyB0aGUgbGluZSBiZWZvcmUuXG5cdFx0XHQvLyBlbmRzTGluZUFmdGVyIHdpbGwgYmUgZmFsc2UuXG5cdFx0XHRvcmlnaW5hbFRleHQgKz0gJ1xcbic7XG5cdFx0fVxuXHRcdHRleHQgKz0gb3JpZ2luYWxUZXh0O1xuXHRcdHRleHQgKz0gZWRpdC5uZXdUZXh0O1xuXHRcdGN1cnJlbnRQb3NpdGlvbiA9IGVkaXQucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKTtcblx0fVxuXG5cdGNvbnN0IGVuZHNMaW5lQWZ0ZXIgPSByYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIDw9IHRleHRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0Y29uc3QgZW5kID0gZW5kc0xpbmVBZnRlciA/IG5ldyBQb3NpdGlvbihcblx0XHRyYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlLFxuXHRcdDFcblx0KSA6IG5ldyBQb3NpdGlvbihyYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIpO1xuXG5cdGNvbnN0IG9yaWdpbmFsVGV4dCA9IHRleHRNb2RlbC5nZXRWYWx1ZUluUmFuZ2UoXG5cdFx0UmFuZ2UuZnJvbVBvc2l0aW9ucyhjdXJyZW50UG9zaXRpb24sIGVuZClcblx0KTtcblx0dGV4dCArPSBvcmlnaW5hbFRleHQ7XG5cblx0Y29uc3QgbGluZXMgPSBzcGxpdExpbmVzKHRleHQpO1xuXHRpZiAoc3RhcnRzTGluZUJlZm9yZSkge1xuXHRcdGlmIChsaW5lc1swXSAhPT0gJycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxpbmVzLnNoaWZ0KCk7XG5cdH1cblx0aWYgKGVuZHNMaW5lQWZ0ZXIpIHtcblx0XHRpZiAobGluZXNbbGluZXMubGVuZ3RoIC0gMV0gIT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsaW5lcy5wb3AoKTtcblx0fVxuXHRyZXR1cm4gbmV3IExpbmVSYW5nZUVkaXQocmFuZ2UsIGxpbmVzKTtcbn1cblxuZXhwb3J0IGVudW0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQge1xuXHRiYXNlLFxuXHRpbnB1dDEsXG5cdGlucHV0Mixcblx0Ym90aCxcblx0dW5yZWNvZ25pemVkLFxufVxuXG5leHBvcnQgdHlwZSBJbnB1dE51bWJlciA9IDEgfCAyO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0T3RoZXJJbnB1dE51bWJlcihpbnB1dE51bWJlcjogSW5wdXROdW1iZXIpOiBJbnB1dE51bWJlciB7XG5cdHJldHVybiBpbnB1dE51bWJlciA9PT0gMSA/IDIgOiAxO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RNb2RpZmllZEJhc2VSYW5nZVN0YXRlIHtcblx0Y29uc3RydWN0b3IoKSB7IH1cblxuXHRhYnN0cmFjdCBnZXQga2luZCgpOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZDtcblxuXHRwdWJsaWMgZ2V0IGluY2x1ZGVzSW5wdXQxKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0cHVibGljIGdldCBpbmNsdWRlc0lucHV0MigpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0cHVibGljIGluY2x1ZGVzSW5wdXQoaW5wdXROdW1iZXI6IElucHV0TnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlucHV0TnVtYmVyID09PSAxID8gdGhpcy5pbmNsdWRlc0lucHV0MSA6IHRoaXMuaW5jbHVkZXNJbnB1dDI7XG5cdH1cblxuXHRwdWJsaWMgaXNJbnB1dEluY2x1ZGVkKGlucHV0TnVtYmVyOiBJbnB1dE51bWJlcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpbnB1dE51bWJlciA9PT0gMSA/IHRoaXMuaW5jbHVkZXNJbnB1dDEgOiB0aGlzLmluY2x1ZGVzSW5wdXQyO1xuXHR9XG5cblx0cHVibGljIGFic3RyYWN0IHRvU3RyaW5nKCk6IHN0cmluZztcblxuXHRwdWJsaWMgYWJzdHJhY3Qgc3dhcCgpOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlO1xuXG5cdHB1YmxpYyBhYnN0cmFjdCB3aXRoSW5wdXRWYWx1ZShpbnB1dE51bWJlcjogSW5wdXROdW1iZXIsIHZhbHVlOiBib29sZWFuLCBzbWFydENvbWJpbmF0aW9uPzogYm9vbGVhbik6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGU7XG5cblx0cHVibGljIGFic3RyYWN0IGVxdWFscyhvdGhlcjogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSk6IGJvb2xlYW47XG5cblx0cHVibGljIHRvZ2dsZShpbnB1dE51bWJlcjogSW5wdXROdW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy53aXRoSW5wdXRWYWx1ZShpbnB1dE51bWJlciwgIXRoaXMuaW5jbHVkZXNJbnB1dChpbnB1dE51bWJlciksIHRydWUpO1xuXHR9XG5cblx0cHVibGljIGdldElucHV0KGlucHV0TnVtYmVyOiAxIHwgMik6IElucHV0U3RhdGUge1xuXHRcdGlmICghdGhpcy5pc0lucHV0SW5jbHVkZWQoaW5wdXROdW1iZXIpKSB7XG5cdFx0XHRyZXR1cm4gSW5wdXRTdGF0ZS5leGNsdWRlZDtcblx0XHR9XG5cdFx0cmV0dXJuIElucHV0U3RhdGUuZmlyc3Q7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVCYXNlIGV4dGVuZHMgQWJzdHJhY3RNb2RpZmllZEJhc2VSYW5nZVN0YXRlIHtcblx0b3ZlcnJpZGUgZ2V0IGtpbmQoKTogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuYmFzZSB7IHJldHVybiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5iYXNlOyB9XG5cdHB1YmxpYyBvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcgeyByZXR1cm4gJ2Jhc2UnOyB9XG5cdHB1YmxpYyBvdmVycmlkZSBzd2FwKCk6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUgeyByZXR1cm4gdGhpczsgfVxuXG5cdHB1YmxpYyBvdmVycmlkZSB3aXRoSW5wdXRWYWx1ZShpbnB1dE51bWJlcjogSW5wdXROdW1iZXIsIHZhbHVlOiBib29sZWFuLCBzbWFydENvbWJpbmF0aW9uOiBib29sZWFuID0gZmFsc2UpOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlIHtcblx0XHRpZiAoaW5wdXROdW1iZXIgPT09IDEpIHtcblx0XHRcdHJldHVybiB2YWx1ZSA/IG5ldyBNb2RpZmllZEJhc2VSYW5nZVN0YXRlSW5wdXQxKCkgOiB0aGlzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUgPyBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUlucHV0MigpIDogdGhpcztcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZXF1YWxzKG90aGVyOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG90aGVyLmtpbmQgPT09IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLmJhc2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVJbnB1dDEgZXh0ZW5kcyBBYnN0cmFjdE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUge1xuXHRvdmVycmlkZSBnZXQga2luZCgpOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5pbnB1dDEgeyByZXR1cm4gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuaW5wdXQxOyB9XG5cdG92ZXJyaWRlIGdldCBpbmNsdWRlc0lucHV0MSgpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7IHJldHVybiAnMVx1MjcxMyc7IH1cblx0cHVibGljIG92ZXJyaWRlIHN3YXAoKTogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSB7IHJldHVybiBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUlucHV0MigpOyB9XG5cblx0cHVibGljIG92ZXJyaWRlIHdpdGhJbnB1dFZhbHVlKGlucHV0TnVtYmVyOiBJbnB1dE51bWJlciwgdmFsdWU6IGJvb2xlYW4sIHNtYXJ0Q29tYmluYXRpb246IGJvb2xlYW4gPSBmYWxzZSk6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUge1xuXHRcdGlmIChpbnB1dE51bWJlciA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlID8gdGhpcyA6IG5ldyBNb2RpZmllZEJhc2VSYW5nZVN0YXRlQmFzZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUgPyBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUJvdGgoMSwgc21hcnRDb21iaW5hdGlvbikgOiBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUlucHV0MigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBlcXVhbHMob3RoZXI6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuaW5wdXQxO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RpZmllZEJhc2VSYW5nZVN0YXRlSW5wdXQyIGV4dGVuZHMgQWJzdHJhY3RNb2RpZmllZEJhc2VSYW5nZVN0YXRlIHtcblx0b3ZlcnJpZGUgZ2V0IGtpbmQoKTogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuaW5wdXQyIHsgcmV0dXJuIE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLmlucHV0MjsgfVxuXHRvdmVycmlkZSBnZXQgaW5jbHVkZXNJbnB1dDIoKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcgeyByZXR1cm4gJzJcdTI3MTMnOyB9XG5cdHB1YmxpYyBvdmVycmlkZSBzd2FwKCk6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUgeyByZXR1cm4gbmV3IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVJbnB1dDEoKTsgfVxuXG5cdHB1YmxpYyB3aXRoSW5wdXRWYWx1ZShpbnB1dE51bWJlcjogSW5wdXROdW1iZXIsIHZhbHVlOiBib29sZWFuLCBzbWFydENvbWJpbmF0aW9uOiBib29sZWFuID0gZmFsc2UpOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlIHtcblx0XHRpZiAoaW5wdXROdW1iZXIgPT09IDIpIHtcblx0XHRcdHJldHVybiB2YWx1ZSA/IHRoaXMgOiBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUJhc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHZhbHVlID8gbmV3IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVCb3RoKDIsIHNtYXJ0Q29tYmluYXRpb24pIDogbmV3IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVJbnB1dDIoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZXF1YWxzKG90aGVyOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG90aGVyLmtpbmQgPT09IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLmlucHV0Mjtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUJvdGggZXh0ZW5kcyBBYnN0cmFjdE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZmlyc3RJbnB1dDogSW5wdXROdW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNtYXJ0Q29tYmluYXRpb246IGJvb2xlYW5cblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBraW5kKCk6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLmJvdGggeyByZXR1cm4gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuYm90aDsgfVxuXHRvdmVycmlkZSBnZXQgaW5jbHVkZXNJbnB1dDEoKTogYm9vbGVhbiB7IHJldHVybiB0cnVlOyB9XG5cdG92ZXJyaWRlIGdldCBpbmNsdWRlc0lucHV0MigpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJzJcdTI3MTMnO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHN3YXAoKTogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSB7IHJldHVybiBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUJvdGgoZ2V0T3RoZXJJbnB1dE51bWJlcih0aGlzLmZpcnN0SW5wdXQpLCB0aGlzLnNtYXJ0Q29tYmluYXRpb24pOyB9XG5cblx0cHVibGljIHdpdGhJbnB1dFZhbHVlKGlucHV0TnVtYmVyOiBJbnB1dE51bWJlciwgdmFsdWU6IGJvb2xlYW4sIHNtYXJ0Q29tYmluYXRpb246IGJvb2xlYW4gPSBmYWxzZSk6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUge1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdHJldHVybiBpbnB1dE51bWJlciA9PT0gMSA/IG5ldyBNb2RpZmllZEJhc2VSYW5nZVN0YXRlSW5wdXQyKCkgOiBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUlucHV0MSgpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGVxdWFscyhvdGhlcjogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBvdGhlci5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5ib3RoICYmIHRoaXMuZmlyc3RJbnB1dCA9PT0gb3RoZXIuZmlyc3RJbnB1dCAmJiB0aGlzLnNtYXJ0Q29tYmluYXRpb24gPT09IG90aGVyLnNtYXJ0Q29tYmluYXRpb247XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0SW5wdXQoaW5wdXROdW1iZXI6IDEgfCAyKTogSW5wdXRTdGF0ZSB7XG5cdFx0cmV0dXJuIGlucHV0TnVtYmVyID09PSB0aGlzLmZpcnN0SW5wdXQgPyBJbnB1dFN0YXRlLmZpcnN0IDogSW5wdXRTdGF0ZS5zZWNvbmQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVVbnJlY29nbml6ZWQgZXh0ZW5kcyBBYnN0cmFjdE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUge1xuXHRvdmVycmlkZSBnZXQga2luZCgpOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC51bnJlY29nbml6ZWQgeyByZXR1cm4gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQudW5yZWNvZ25pemVkOyB9XG5cdHB1YmxpYyBvdmVycmlkZSB0b1N0cmluZygpOiBzdHJpbmcgeyByZXR1cm4gJ3VucmVjb2duaXplZCc7IH1cblx0cHVibGljIG92ZXJyaWRlIHN3YXAoKTogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSB7IHJldHVybiB0aGlzOyB9XG5cblx0cHVibGljIHdpdGhJbnB1dFZhbHVlKGlucHV0TnVtYmVyOiBJbnB1dE51bWJlciwgdmFsdWU6IGJvb2xlYW4sIHNtYXJ0Q29tYmluYXRpb246IGJvb2xlYW4gPSBmYWxzZSk6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUge1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5wdXROdW1iZXIgPT09IDEgPyBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUlucHV0MSgpIDogbmV3IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVJbnB1dDIoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBlcXVhbHMob3RoZXI6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gb3RoZXIua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQudW5yZWNvZ25pemVkO1xuXHR9XG59XG5cbmV4cG9ydCB0eXBlIE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUgPSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlQmFzZSB8IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVJbnB1dDEgfCBNb2RpZmllZEJhc2VSYW5nZVN0YXRlSW5wdXQyIHwgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUlucHV0MiB8IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVCb3RoIHwgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZVVucmVjb2duaXplZDtcblxuZXhwb3J0IG5hbWVzcGFjZSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlIHtcblx0ZXhwb3J0IGNvbnN0IGJhc2UgPSBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUJhc2UoKTtcblx0ZXhwb3J0IGNvbnN0IHVucmVjb2duaXplZCA9IG5ldyBNb2RpZmllZEJhc2VSYW5nZVN0YXRlVW5yZWNvZ25pemVkKCk7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIElucHV0U3RhdGUge1xuXHRleGNsdWRlZCA9IDAsXG5cdGZpcnN0ID0gMSxcblx0c2Vjb25kID0gMixcblx0dW5yZWNvZ25pemVkID0gM1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXLGNBQWMsUUFBUSxrQkFBa0IsMkJBQTJCO0FBQ3ZGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUV0QixTQUFTLGVBQWUsaUJBQWlCO0FBRXpDLFNBQVMsMEJBQTBCLHdCQUF3QjtBQVNwRCxNQUFNLGtCQUFrQjtBQUFBLEVBMkI5QixZQUNpQixXQUNBLGVBQ0EsYUFDQSxpQkFLQSxhQUNBLGFBQ0EsaUJBS0EsYUFDZjtBQWhCZTtBQUNBO0FBQ0E7QUFDQTtBQUtBO0FBQ0E7QUFDQTtBQUtBO0FBRWhCLFNBQUsscUJBQXFCLHlCQUF5QixLQUFLLEtBQUssV0FBVztBQUN4RSxTQUFLLHFCQUFxQix5QkFBeUIsS0FBSyxLQUFLLFdBQVc7QUFDeEUsU0FBSyxnQkFBZ0IsT0FBTyxLQUFLLGFBQWEsS0FBSyxhQUFhLENBQUMsR0FBRyxNQUFNLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxZQUFZLENBQUMsQ0FBQztBQUNqSCxTQUFLLDJCQUEyQjtBQUNoQyxTQUFLLDJCQUEyQjtBQUNoQyxTQUFLLDBCQUEwQjtBQUMvQixTQUFLLDBCQUEwQjtBQUMvQixRQUFJLEtBQUssWUFBWSxXQUFXLEtBQUssS0FBSyxZQUFZLFdBQVcsR0FBRztBQUNuRSxZQUFNLElBQUksbUJBQW1CLDZCQUE2QjtBQUFBLElBQzNEO0FBQUEsRUFDRDtBQUFBLEVBdERBLE9BQWMsVUFDYixRQUNBLFFBQ0EsZUFDQSxpQkFDQSxpQkFDc0I7QUFDdEIsVUFBTSxhQUFhLGlCQUFpQixRQUFRLFFBQVEsTUFBTTtBQUMxRCxXQUFPLFdBQVc7QUFBQSxNQUNqQixDQUFDLE1BQU0sSUFBSTtBQUFBLFFBQ1YsRUFBRTtBQUFBLFFBQ0Y7QUFBQSxRQUNBLEVBQUU7QUFBQSxRQUNGO0FBQUEsUUFDQSxFQUFFO0FBQUEsUUFDRixFQUFFO0FBQUEsUUFDRjtBQUFBLFFBQ0EsRUFBRTtBQUFBLE1BQ0g7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBb0NPLGNBQWMsYUFBMEM7QUFDOUQsV0FBTyxnQkFBZ0IsSUFBSSxLQUFLLGNBQWMsS0FBSztBQUFBLEVBQ3BEO0FBQUEsRUFFTyxxQkFBcUIsYUFBMEQ7QUFDckYsV0FBTyxnQkFBZ0IsSUFBSSxLQUFLLHFCQUFxQixLQUFLO0FBQUEsRUFDM0Q7QUFBQSxFQUVPLGNBQWMsYUFBeUQ7QUFDN0UsV0FBTyxnQkFBZ0IsSUFBSSxLQUFLLGNBQWMsS0FBSztBQUFBLEVBQ3BEO0FBQUEsRUFFQSxJQUFXLGdCQUF5QjtBQUNuQyxXQUFPLEtBQUssWUFBWSxTQUFTLEtBQUssS0FBSyxZQUFZLFNBQVM7QUFBQSxFQUNqRTtBQUFBLEVBRUEsSUFBVyxnQkFBeUI7QUFDbkMsV0FBTyxLQUFLLG1CQUFtQixDQUFDLE1BQU07QUFBQSxFQUN2QztBQUFBLEVBRUEsSUFBVyxrQkFBMkI7QUFDckMsVUFBTSxTQUFTLEtBQUssbUJBQW1CLENBQUM7QUFDeEMsVUFBTSxTQUFTLEtBQUssbUJBQW1CLENBQUM7QUFDeEMsUUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxDQUFDLE9BQU8sT0FBTyxNQUFNO0FBQUEsRUFDN0I7QUFBQSxFQUVPLGVBQWUsT0FBNEc7QUFDakksVUFBTSxRQUF3RSxDQUFDO0FBQy9FLFFBQUksTUFBTSxrQkFBa0IsS0FBSyxvQkFBb0I7QUFDcEQsWUFBTSxLQUFLLEVBQUUsTUFBTSxLQUFLLG9CQUFvQixhQUFhLEVBQUUsQ0FBQztBQUFBLElBQzdEO0FBQ0EsUUFBSSxNQUFNLGtCQUFrQixLQUFLLG9CQUFvQjtBQUNwRCxZQUFNLEtBQUssRUFBRSxNQUFNLEtBQUssb0JBQW9CLGFBQWEsRUFBRSxDQUFDO0FBQUEsSUFDN0Q7QUFFQSxRQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCLGFBQU8sRUFBRSxNQUFNLFFBQVcsZ0JBQWdCLHVCQUF1QixLQUFLO0FBQUEsSUFDdkU7QUFDQSxRQUFJLE1BQU0sV0FBVyxHQUFHO0FBQ3ZCLGFBQU8sRUFBRSxNQUFNLE1BQU0sQ0FBQyxFQUFFLEtBQUssWUFBWSxHQUFHLGdCQUFnQix1QkFBdUIsS0FBSyxlQUFlLE1BQU0sQ0FBQyxFQUFFLGFBQWEsTUFBTSxLQUFLLEVBQUU7QUFBQSxJQUMzSTtBQUVBLFFBQUksTUFBTSxTQUFTLGNBQWlDO0FBQ25ELFlBQU0sSUFBSSxtQkFBbUI7QUFBQSxJQUM5QjtBQUVBLFVBQU0sb0JBQW9CLE1BQU0sbUJBQW1CLEtBQUssbUJBQW1CLE1BQU0sVUFBVSxJQUFJLEtBQUssa0JBQWtCLE1BQU0sVUFBVTtBQUN0SSxRQUFJLG1CQUFtQjtBQUN0QixhQUFPLEVBQUUsTUFBTSxtQkFBbUIsZ0JBQWdCLE1BQU07QUFBQSxJQUN6RDtBQUVBLFdBQU87QUFBQSxNQUNOLE1BQU0sTUFBTSxvQkFBb0IsTUFBTSxVQUFVLElBQUksQ0FBQyxFQUFFLEtBQUssWUFBWTtBQUFBLE1BQ3hFLGdCQUFnQix1QkFBdUIsS0FBSztBQUFBLFFBQzNDLG9CQUFvQixNQUFNLFVBQVU7QUFBQSxRQUNwQztBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUtRLG1CQUFtQixZQUE4QztBQUN4RSxRQUFJLGVBQWUsS0FBSyxLQUFLLDZCQUE2QixNQUFNO0FBQy9ELGFBQU8sS0FBSztBQUFBLElBQ2IsV0FBVyxlQUFlLEtBQUssS0FBSyw2QkFBNkIsTUFBTTtBQUN0RSxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBRUEsVUFBTSxnQkFBZ0I7QUFBQSxNQUNyQixLQUFLLFlBQVk7QUFBQSxRQUFRLENBQUMsVUFDekIsTUFBTSxjQUFjLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxPQUFPLEVBQVcsRUFBRTtBQUFBLE1BQ2hFO0FBQUEsTUFDQSxLQUFLLFlBQVk7QUFBQSxRQUFRLENBQUMsVUFDekIsTUFBTSxjQUFjLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxPQUFPLEVBQVcsRUFBRTtBQUFBLE1BQ2hFO0FBQUEsSUFDRCxFQUFFO0FBQUEsTUFDRDtBQUFBLFFBQ0MsVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLFlBQVksTUFBTSx3QkFBd0I7QUFBQSxRQUNsRSxVQUFVLENBQUMsTUFBTyxFQUFFLFVBQVUsYUFBYSxJQUFJLEdBQUksZ0JBQWdCO0FBQUEsTUFDcEU7QUFBQSxJQUNEO0FBRUEsVUFBTSxjQUFjLGNBQWMsSUFBSSxPQUFLO0FBQzFDLFlBQU0sa0JBQWtCLEVBQUUsVUFBVSxJQUFJLEtBQUssa0JBQWtCLEtBQUs7QUFDcEUsYUFBTyxJQUFJLFVBQVUsRUFBRSxLQUFLLFlBQVksZ0JBQWdCLGdCQUFnQixFQUFFLEtBQUssV0FBVyxDQUFDO0FBQUEsSUFDNUYsQ0FBQztBQUVELFVBQU0sU0FBUyxxQkFBcUIsS0FBSyxXQUFXLGFBQWEsS0FBSyxhQUFhO0FBQ25GLFFBQUksZUFBZSxHQUFHO0FBQ3JCLFdBQUssMkJBQTJCO0FBQUEsSUFDakMsT0FBTztBQUNOLFdBQUssMkJBQTJCO0FBQUEsSUFDakM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBS1Esa0JBQWtCLFlBQThDO0FBQ3ZFLFFBQUksZUFBZSxLQUFLLEtBQUssNEJBQTRCLE1BQU07QUFDOUQsYUFBTyxLQUFLO0FBQUEsSUFDYixXQUFXLGVBQWUsS0FBSyxLQUFLLDRCQUE0QixNQUFNO0FBQ3JFLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFFQSxRQUFJLGNBQWMsS0FBSyxZQUFZLFNBQVMsS0FBSyxlQUFlO0FBQ2hFLFFBQUksY0FBYyxLQUFLLFlBQVksU0FBUyxLQUFLLGVBQWU7QUFDaEUsUUFBSSxlQUFlLEdBQUc7QUFDckIsT0FBQyxhQUFhLFdBQVcsSUFBSSxDQUFDLGFBQWEsV0FBVztBQUFBLElBQ3ZEO0FBRUEsVUFBTSxTQUFTLElBQUksY0FBYyxLQUFLLFdBQVcsWUFBWSxPQUFPLFdBQVcsQ0FBQztBQUNoRixRQUFJLGVBQWUsR0FBRztBQUNyQixXQUFLLDBCQUEwQjtBQUFBLElBQ2hDLE9BQU87QUFDTixXQUFLLDBCQUEwQjtBQUFBLElBQ2hDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMscUJBQXFCLE9BQTZCLGFBQTBCLFdBQWtEO0FBQ3RJLE1BQUksT0FBTztBQUNYLFFBQU0sbUJBQW1CLE1BQU0sa0JBQWtCO0FBQ2pELE1BQUksa0JBQWtCLG1CQUNuQixJQUFJO0FBQUEsSUFDTCxNQUFNLGtCQUFrQjtBQUFBLElBQ3hCLFVBQVUsaUJBQWlCLE1BQU0sa0JBQWtCLENBQUM7QUFBQSxFQUNyRCxJQUNFLElBQUksU0FBUyxNQUFNLGlCQUFpQixDQUFDO0FBRXhDLGFBQVcsUUFBUSxhQUFhO0FBQy9CLFVBQU0sWUFBWSxLQUFLLE1BQU0saUJBQWlCO0FBQzlDLFFBQUksQ0FBQyxnQkFBZ0IsZ0JBQWdCLFNBQVMsR0FBRztBQUNoRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUlBLGdCQUFlLFVBQVUsZ0JBQWdCLE1BQU0sY0FBYyxpQkFBaUIsU0FBUyxDQUFDO0FBQzVGLFFBQUksVUFBVSxhQUFhLFVBQVUsYUFBYSxHQUFHO0FBSXBELE1BQUFBLGlCQUFnQjtBQUFBLElBQ2pCO0FBQ0EsWUFBUUE7QUFDUixZQUFRLEtBQUs7QUFDYixzQkFBa0IsS0FBSyxNQUFNLGVBQWU7QUFBQSxFQUM3QztBQUVBLFFBQU0sZ0JBQWdCLE1BQU0sMEJBQTBCLFVBQVUsYUFBYTtBQUM3RSxRQUFNLE1BQU0sZ0JBQWdCLElBQUk7QUFBQSxJQUMvQixNQUFNO0FBQUEsSUFDTjtBQUFBLEVBQ0QsSUFBSSxJQUFJLFNBQVMsTUFBTSx5QkFBeUIsR0FBRyxVQUFVLHNCQUFzQjtBQUVuRixRQUFNLGVBQWUsVUFBVTtBQUFBLElBQzlCLE1BQU0sY0FBYyxpQkFBaUIsR0FBRztBQUFBLEVBQ3pDO0FBQ0EsVUFBUTtBQUVSLFFBQU0sUUFBUSxXQUFXLElBQUk7QUFDN0IsTUFBSSxrQkFBa0I7QUFDckIsUUFBSSxNQUFNLENBQUMsTUFBTSxJQUFJO0FBQ3BCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxNQUFNO0FBQUEsRUFDYjtBQUNBLE1BQUksZUFBZTtBQUNsQixRQUFJLE1BQU0sTUFBTSxTQUFTLENBQUMsTUFBTSxJQUFJO0FBQ25DLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxJQUFJO0FBQUEsRUFDWDtBQUNBLFNBQU8sSUFBSSxjQUFjLE9BQU8sS0FBSztBQUN0QztBQUVPLElBQUssNkJBQUwsa0JBQUtDLGdDQUFMO0FBQ04sRUFBQUEsd0RBQUE7QUFDQSxFQUFBQSx3REFBQTtBQUNBLEVBQUFBLHdEQUFBO0FBQ0EsRUFBQUEsd0RBQUE7QUFDQSxFQUFBQSx3REFBQTtBQUxXLFNBQUFBO0FBQUEsR0FBQTtBQVVMLFNBQVMsb0JBQW9CLGFBQXVDO0FBQzFFLFNBQU8sZ0JBQWdCLElBQUksSUFBSTtBQUNoQztBQUVPLE1BQWUsK0JBQStCO0FBQUEsRUFDcEQsY0FBYztBQUFBLEVBQUU7QUFBQSxFQUloQixJQUFXLGlCQUEwQjtBQUFFLFdBQU87QUFBQSxFQUFPO0FBQUEsRUFDckQsSUFBVyxpQkFBMEI7QUFBRSxXQUFPO0FBQUEsRUFBTztBQUFBLEVBRTlDLGNBQWMsYUFBbUM7QUFDdkQsV0FBTyxnQkFBZ0IsSUFBSSxLQUFLLGlCQUFpQixLQUFLO0FBQUEsRUFDdkQ7QUFBQSxFQUVPLGdCQUFnQixhQUFtQztBQUN6RCxXQUFPLGdCQUFnQixJQUFJLEtBQUssaUJBQWlCLEtBQUs7QUFBQSxFQUN2RDtBQUFBLEVBVU8sT0FBTyxhQUEwQjtBQUN2QyxXQUFPLEtBQUssZUFBZSxhQUFhLENBQUMsS0FBSyxjQUFjLFdBQVcsR0FBRyxJQUFJO0FBQUEsRUFDL0U7QUFBQSxFQUVPLFNBQVMsYUFBZ0M7QUFDL0MsUUFBSSxDQUFDLEtBQUssZ0JBQWdCLFdBQVcsR0FBRztBQUN2QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFTyxNQUFNLG1DQUFtQywrQkFBK0I7QUFBQSxFQUM5RSxJQUFhLE9BQXdDO0FBQUUsV0FBTztBQUFBLEVBQWlDO0FBQUEsRUFDL0UsV0FBbUI7QUFBRSxXQUFPO0FBQUEsRUFBUTtBQUFBLEVBQ3BDLE9BQStCO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUU5QyxlQUFlLGFBQTBCLE9BQWdCLG1CQUE0QixPQUErQjtBQUNuSSxRQUFJLGdCQUFnQixHQUFHO0FBQ3RCLGFBQU8sUUFBUSxJQUFJLDZCQUE2QixJQUFJO0FBQUEsSUFDckQsT0FBTztBQUNOLGFBQU8sUUFBUSxJQUFJLDZCQUE2QixJQUFJO0FBQUEsSUFDckQ7QUFBQSxFQUNEO0FBQUEsRUFFZ0IsT0FBTyxPQUF3QztBQUM5RCxXQUFPLE1BQU0sU0FBUztBQUFBLEVBQ3ZCO0FBQ0Q7QUFFTyxNQUFNLHFDQUFxQywrQkFBK0I7QUFBQSxFQUNoRixJQUFhLE9BQTBDO0FBQUUsV0FBTztBQUFBLEVBQW1DO0FBQUEsRUFDbkcsSUFBYSxpQkFBMEI7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUFBLEVBQy9DLFdBQW1CO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUN6QixPQUErQjtBQUFFLFdBQU8sSUFBSSw2QkFBNkI7QUFBQSxFQUFHO0FBQUEsRUFFNUUsZUFBZSxhQUEwQixPQUFnQixtQkFBNEIsT0FBK0I7QUFDbkksUUFBSSxnQkFBZ0IsR0FBRztBQUN0QixhQUFPLFFBQVEsT0FBTyxJQUFJLDJCQUEyQjtBQUFBLElBQ3RELE9BQU87QUFDTixhQUFPLFFBQVEsSUFBSSwyQkFBMkIsR0FBRyxnQkFBZ0IsSUFBSSxJQUFJLDZCQUE2QjtBQUFBLElBQ3ZHO0FBQUEsRUFDRDtBQUFBLEVBRWdCLE9BQU8sT0FBd0M7QUFDOUQsV0FBTyxNQUFNLFNBQVM7QUFBQSxFQUN2QjtBQUNEO0FBRU8sTUFBTSxxQ0FBcUMsK0JBQStCO0FBQUEsRUFDaEYsSUFBYSxPQUEwQztBQUFFLFdBQU87QUFBQSxFQUFtQztBQUFBLEVBQ25HLElBQWEsaUJBQTBCO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUMvQyxXQUFtQjtBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFDekIsT0FBK0I7QUFBRSxXQUFPLElBQUksNkJBQTZCO0FBQUEsRUFBRztBQUFBLEVBRXJGLGVBQWUsYUFBMEIsT0FBZ0IsbUJBQTRCLE9BQStCO0FBQzFILFFBQUksZ0JBQWdCLEdBQUc7QUFDdEIsYUFBTyxRQUFRLE9BQU8sSUFBSSwyQkFBMkI7QUFBQSxJQUN0RCxPQUFPO0FBQ04sYUFBTyxRQUFRLElBQUksMkJBQTJCLEdBQUcsZ0JBQWdCLElBQUksSUFBSSw2QkFBNkI7QUFBQSxJQUN2RztBQUFBLEVBQ0Q7QUFBQSxFQUVnQixPQUFPLE9BQXdDO0FBQzlELFdBQU8sTUFBTSxTQUFTO0FBQUEsRUFDdkI7QUFDRDtBQUVPLE1BQU0sbUNBQW1DLCtCQUErQjtBQUFBLEVBQzlFLFlBQ2lCLFlBQ0Esa0JBQ2Y7QUFDRCxVQUFNO0FBSFU7QUFDQTtBQUFBLEVBR2pCO0FBQUEsRUFFQSxJQUFhLE9BQXdDO0FBQUUsV0FBTztBQUFBLEVBQWlDO0FBQUEsRUFDL0YsSUFBYSxpQkFBMEI7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUFBLEVBQ3RELElBQWEsaUJBQTBCO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUUvQyxXQUFtQjtBQUN6QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRWdCLE9BQStCO0FBQUUsV0FBTyxJQUFJLDJCQUEyQixvQkFBb0IsS0FBSyxVQUFVLEdBQUcsS0FBSyxnQkFBZ0I7QUFBQSxFQUFHO0FBQUEsRUFFOUksZUFBZSxhQUEwQixPQUFnQixtQkFBNEIsT0FBK0I7QUFDMUgsUUFBSSxPQUFPO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLGdCQUFnQixJQUFJLElBQUksNkJBQTZCLElBQUksSUFBSSw2QkFBNkI7QUFBQSxFQUNsRztBQUFBLEVBRWdCLE9BQU8sT0FBd0M7QUFDOUQsV0FBTyxNQUFNLFNBQVMsZ0JBQW1DLEtBQUssZUFBZSxNQUFNLGNBQWMsS0FBSyxxQkFBcUIsTUFBTTtBQUFBLEVBQ2xJO0FBQUEsRUFFZ0IsU0FBUyxhQUFnQztBQUN4RCxXQUFPLGdCQUFnQixLQUFLLGFBQWEsZ0JBQW1CO0FBQUEsRUFDN0Q7QUFDRDtBQUVPLE1BQU0sMkNBQTJDLCtCQUErQjtBQUFBLEVBQ3RGLElBQWEsT0FBZ0Q7QUFBRSxXQUFPO0FBQUEsRUFBeUM7QUFBQSxFQUMvRixXQUFtQjtBQUFFLFdBQU87QUFBQSxFQUFnQjtBQUFBLEVBQzVDLE9BQStCO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUV2RCxlQUFlLGFBQTBCLE9BQWdCLG1CQUE0QixPQUErQjtBQUMxSCxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxnQkFBZ0IsSUFBSSxJQUFJLDZCQUE2QixJQUFJLElBQUksNkJBQTZCO0FBQUEsRUFDbEc7QUFBQSxFQUVnQixPQUFPLE9BQXdDO0FBQzlELFdBQU8sTUFBTSxTQUFTO0FBQUEsRUFDdkI7QUFDRDtBQUlPLElBQVU7QUFBQSxDQUFWLENBQVVDLDRCQUFWO0FBQ0MsRUFBTUEsd0JBQUEsT0FBTyxJQUFJLDJCQUEyQjtBQUM1QyxFQUFNQSx3QkFBQSxlQUFlLElBQUksbUNBQW1DO0FBQUEsR0FGbkQ7QUFLVixJQUFXLGFBQVgsa0JBQVdDLGdCQUFYO0FBQ04sRUFBQUEsd0JBQUEsY0FBVyxLQUFYO0FBQ0EsRUFBQUEsd0JBQUEsV0FBUSxLQUFSO0FBQ0EsRUFBQUEsd0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsd0JBQUEsa0JBQWUsS0FBZjtBQUppQixTQUFBQTtBQUFBLEdBQUE7IiwKICAibmFtZXMiOiBbIm9yaWdpbmFsVGV4dCIsICJNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZCIsICJNb2RpZmllZEJhc2VSYW5nZVN0YXRlIiwgIklucHV0U3RhdGUiXQp9Cg==
