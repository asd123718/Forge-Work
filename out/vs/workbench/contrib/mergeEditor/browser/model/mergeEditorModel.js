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
import { CompareResult, equals } from "../../../../../base/common/arrays.js";
import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { autorunHandleChanges, derived, keepObserved, observableValue, transaction, waitForState } from "../../../../../base/common/observable.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { localize } from "../../../../../nls.js";
import { IUndoRedoService, UndoRedoElementType, UndoRedoGroup } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { EditorModel } from "../../../../common/editor/editorModel.js";
import { MergeEditorLineRange } from "./lineRange.js";
import { DocumentLineRangeMap, DocumentRangeMap, LineRangeMapping } from "./mapping.js";
import { TextModelDiffChangeReason, TextModelDiffs, TextModelDiffState } from "./textModelDiffs.js";
import { leftJoin } from "../utils.js";
import { ModifiedBaseRange, ModifiedBaseRangeState, ModifiedBaseRangeStateKind } from "./modifiedBaseRange.js";
let MergeEditorModel = class extends EditorModel {
  constructor(base, input1, input2, resultTextModel, diffComputer, options, telemetry, languageService, undoRedoService) {
    super();
    this.base = base;
    this.input1 = input1;
    this.input2 = input2;
    this.resultTextModel = resultTextModel;
    this.diffComputer = diffComputer;
    this.options = options;
    this.telemetry = telemetry;
    this.languageService = languageService;
    this.undoRedoService = undoRedoService;
    this.input1TextModelDiffs = this._register(new TextModelDiffs(this.base, this.input1.textModel, this.diffComputer));
    this.input2TextModelDiffs = this._register(new TextModelDiffs(this.base, this.input2.textModel, this.diffComputer));
    this.resultTextModelDiffs = this._register(new TextModelDiffs(this.base, this.resultTextModel, this.diffComputer));
    this.modifiedBaseRanges = derived(this, (reader) => {
      const input1Diffs = this.input1TextModelDiffs.diffs.read(reader);
      const input2Diffs = this.input2TextModelDiffs.diffs.read(reader);
      return ModifiedBaseRange.fromDiffs(input1Diffs, input2Diffs, this.base, this.input1.textModel, this.input2.textModel);
    });
    this.modifiedBaseRangeResultStates = derived(this, (reader) => {
      const map = new Map(
        this.modifiedBaseRanges.read(reader).map((s) => [
          s,
          new ModifiedBaseRangeData(s)
        ])
      );
      return map;
    });
    this.resultSnapshot = this.resultTextModel.createSnapshot();
    this.baseInput1Diffs = this.input1TextModelDiffs.diffs;
    this.baseInput2Diffs = this.input2TextModelDiffs.diffs;
    this.baseResultDiffs = this.resultTextModelDiffs.diffs;
    this.input1ResultMapping = derived(this, (reader) => {
      return this.getInputResultMapping(
        this.baseInput1Diffs.read(reader),
        this.baseResultDiffs.read(reader),
        this.input1.textModel.getLineCount()
      );
    });
    this.resultInput1Mapping = derived(this, (reader) => this.input1ResultMapping.read(reader).reverse());
    this.input2ResultMapping = derived(this, (reader) => {
      return this.getInputResultMapping(
        this.baseInput2Diffs.read(reader),
        this.baseResultDiffs.read(reader),
        this.input2.textModel.getLineCount()
      );
    });
    this.resultInput2Mapping = derived(this, (reader) => this.input2ResultMapping.read(reader).reverse());
    this.baseResultMapping = derived(this, (reader) => {
      const map = new DocumentLineRangeMap(this.baseResultDiffs.read(reader), -1);
      return new DocumentLineRangeMap(
        map.lineRangeMappings.map(
          (m) => m.inputRange.isEmpty || m.outputRange.isEmpty ? new LineRangeMapping(
            // We can do this because two adjacent diffs have one line in between.
            m.inputRange.deltaStart(-1),
            m.outputRange.deltaStart(-1)
          ) : m
        ),
        map.inputLineCount
      );
    });
    this.resultBaseMapping = derived(this, (reader) => this.baseResultMapping.read(reader).reverse());
    this.diffComputingState = derived(this, (reader) => {
      const states = [
        this.input1TextModelDiffs,
        this.input2TextModelDiffs,
        this.resultTextModelDiffs
      ].map((s) => s.state.read(reader));
      if (states.some((s) => s === TextModelDiffState.initializing)) {
        return 1 /* initializing */;
      }
      if (states.some((s) => s === TextModelDiffState.updating)) {
        return 3 /* updating */;
      }
      return 2 /* upToDate */;
    });
    this.inputDiffComputingState = derived(this, (reader) => {
      const states = [
        this.input1TextModelDiffs,
        this.input2TextModelDiffs
      ].map((s) => s.state.read(reader));
      if (states.some((s) => s === TextModelDiffState.initializing)) {
        return 1 /* initializing */;
      }
      if (states.some((s) => s === TextModelDiffState.updating)) {
        return 3 /* updating */;
      }
      return 2 /* upToDate */;
    });
    this.isUpToDate = derived(this, (reader) => this.diffComputingState.read(reader) === 2 /* upToDate */);
    this.firstRun = true;
    this.unhandledConflictsCount = derived(this, (reader) => {
      const map = this.modifiedBaseRangeResultStates.read(reader);
      let unhandledCount = 0;
      for (const [_key, value] of map) {
        if (!value.handled.read(reader)) {
          unhandledCount++;
        }
      }
      return unhandledCount;
    });
    this.hasUnhandledConflicts = this.unhandledConflictsCount.map((value) => (
      /** @description hasUnhandledConflicts */
      value > 0
    ));
    this._register(keepObserved(this.modifiedBaseRangeResultStates));
    this._register(keepObserved(this.input1ResultMapping));
    this._register(keepObserved(this.input2ResultMapping));
    const initializePromise = this.initialize();
    this.onInitialized = waitForState(this.diffComputingState, (state) => state === 2 /* upToDate */).then(async () => {
      await initializePromise;
    });
    initializePromise.then(() => {
      let shouldRecomputeHandledFromAccepted = true;
      this._register(
        autorunHandleChanges(
          {
            changeTracker: {
              createChangeSummary: () => void 0,
              handleChange: (ctx) => {
                if (ctx.didChange(this.modifiedBaseRangeResultStates)) {
                  shouldRecomputeHandledFromAccepted = true;
                }
                return ctx.didChange(this.resultTextModelDiffs.diffs) ? ctx.change === TextModelDiffChangeReason.textChange : true;
              }
            }
          },
          (reader) => {
            const states = this.modifiedBaseRangeResultStates.read(reader);
            if (!this.isUpToDate.read(reader)) {
              return;
            }
            const resultDiffs = this.resultTextModelDiffs.diffs.read(reader);
            transaction((tx) => {
              this.updateBaseRangeAcceptedState(resultDiffs, states, tx);
              if (shouldRecomputeHandledFromAccepted) {
                shouldRecomputeHandledFromAccepted = false;
                for (const [_range, observableState] of states) {
                  const state = observableState.accepted.read(void 0);
                  const handled = !(state.kind === ModifiedBaseRangeStateKind.base || state.kind === ModifiedBaseRangeStateKind.unrecognized);
                  observableState.handledInput1.set(handled, tx);
                  observableState.handledInput2.set(handled, tx);
                }
              }
            });
          }
        )
      );
    });
  }
  async initialize() {
    if (this.options.resetResult) {
      await this.reset();
    }
  }
  async reset() {
    await waitForState(this.inputDiffComputingState, (state) => state === 2 /* upToDate */);
    const states = this.modifiedBaseRangeResultStates.get();
    transaction((tx) => {
      for (const [range, state] of states) {
        let newState;
        let handled = false;
        if (range.input1Diffs.length === 0) {
          newState = ModifiedBaseRangeState.base.withInputValue(2, true);
          handled = true;
        } else if (range.input2Diffs.length === 0) {
          newState = ModifiedBaseRangeState.base.withInputValue(1, true);
          handled = true;
        } else if (range.isEqualChange) {
          newState = ModifiedBaseRangeState.base.withInputValue(1, true);
          handled = true;
        } else {
          newState = ModifiedBaseRangeState.base;
          handled = false;
        }
        state.accepted.set(newState, tx);
        state.computedFromDiffing = false;
        state.previousNonDiffingState = void 0;
        state.handledInput1.set(handled, tx);
        state.handledInput2.set(handled, tx);
      }
      this.resultTextModel.pushEditOperations(null, [{
        range: new Range(1, 1, Number.MAX_SAFE_INTEGER, 1),
        text: this.computeAutoMergedResult()
      }], () => null);
    });
  }
  computeAutoMergedResult() {
    const baseRanges = this.modifiedBaseRanges.get();
    const baseLines = this.base.getLinesContent();
    const input1Lines = this.input1.textModel.getLinesContent();
    const input2Lines = this.input2.textModel.getLinesContent();
    const resultLines = [];
    function appendLinesToResult(source, lineRange) {
      for (let i = lineRange.startLineNumber; i < lineRange.endLineNumberExclusive; i++) {
        resultLines.push(source[i - 1]);
      }
    }
    let baseStartLineNumber = 1;
    for (const baseRange of baseRanges) {
      appendLinesToResult(baseLines, MergeEditorLineRange.fromLineNumbers(baseStartLineNumber, baseRange.baseRange.startLineNumber));
      baseStartLineNumber = baseRange.baseRange.endLineNumberExclusive;
      if (baseRange.input1Diffs.length === 0) {
        appendLinesToResult(input2Lines, baseRange.input2Range);
      } else if (baseRange.input2Diffs.length === 0) {
        appendLinesToResult(input1Lines, baseRange.input1Range);
      } else if (baseRange.isEqualChange) {
        appendLinesToResult(input1Lines, baseRange.input1Range);
      } else {
        appendLinesToResult(baseLines, baseRange.baseRange);
      }
    }
    appendLinesToResult(baseLines, MergeEditorLineRange.fromLineNumbers(baseStartLineNumber, baseLines.length + 1));
    return resultLines.join(this.resultTextModel.getEOL());
  }
  hasBaseRange(baseRange) {
    return this.modifiedBaseRangeResultStates.get().has(baseRange);
  }
  get isApplyingEditInResult() {
    return this.resultTextModelDiffs.isApplyingChange;
  }
  getInputResultMapping(inputLinesDiffs, resultDiffs, inputLineCount) {
    const map = DocumentLineRangeMap.betweenOutputs(inputLinesDiffs, resultDiffs, inputLineCount);
    return new DocumentLineRangeMap(
      map.lineRangeMappings.map(
        (m) => m.inputRange.isEmpty || m.outputRange.isEmpty ? new LineRangeMapping(
          // We can do this because two adjacent diffs have one line in between.
          m.inputRange.deltaStart(-1),
          m.outputRange.deltaStart(-1)
        ) : m
      ),
      map.inputLineCount
    );
  }
  translateInputRangeToBase(input, range) {
    const baseInputDiffs = input === 1 ? this.baseInput1Diffs.get() : this.baseInput2Diffs.get();
    const map = new DocumentRangeMap(baseInputDiffs.flatMap((d) => d.rangeMappings), 0).reverse();
    return map.projectRange(range).outputRange;
  }
  translateBaseRangeToInput(input, range) {
    const baseInputDiffs = input === 1 ? this.baseInput1Diffs.get() : this.baseInput2Diffs.get();
    const map = new DocumentRangeMap(baseInputDiffs.flatMap((d) => d.rangeMappings), 0);
    return map.projectRange(range).outputRange;
  }
  getLineRangeInResult(baseRange, reader) {
    return this.resultTextModelDiffs.getResultLineRange(baseRange, reader);
  }
  translateResultRangeToBase(range) {
    const map = new DocumentRangeMap(this.baseResultDiffs.get().flatMap((d) => d.rangeMappings), 0).reverse();
    return map.projectRange(range).outputRange;
  }
  translateBaseRangeToResult(range) {
    const map = new DocumentRangeMap(this.baseResultDiffs.get().flatMap((d) => d.rangeMappings), 0);
    return map.projectRange(range).outputRange;
  }
  findModifiedBaseRangesInRange(rangeInBase) {
    return this.modifiedBaseRanges.get().filter((r) => r.baseRange.intersectsOrTouches(rangeInBase));
  }
  updateBaseRangeAcceptedState(resultDiffs, states, tx) {
    const baseRangeWithStoreAndTouchingDiffs = leftJoin(
      states,
      resultDiffs,
      (baseRange, diff) => baseRange[0].baseRange.intersectsOrTouches(diff.inputRange) ? CompareResult.neitherLessOrGreaterThan : MergeEditorLineRange.compareByStart(
        baseRange[0].baseRange,
        diff.inputRange
      )
    );
    for (const row of baseRangeWithStoreAndTouchingDiffs) {
      const newState = this.computeState(row.left[0], row.rights);
      const data = row.left[1];
      const oldState = data.accepted.get();
      if (!oldState.equals(newState)) {
        if (!this.firstRun && !data.computedFromDiffing) {
          data.computedFromDiffing = true;
          data.previousNonDiffingState = oldState;
        }
        data.accepted.set(newState, tx);
      }
    }
    if (this.firstRun) {
      this.firstRun = false;
    }
  }
  computeState(baseRange, conflictingDiffs) {
    if (conflictingDiffs.length === 0) {
      return ModifiedBaseRangeState.base;
    }
    const conflictingEdits = conflictingDiffs.map((d) => d.getLineEdit());
    function editsAgreeWithDiffs(diffs) {
      return equals(
        conflictingEdits,
        diffs.map((d) => d.getLineEdit()),
        (a, b) => a.equals(b)
      );
    }
    if (editsAgreeWithDiffs(baseRange.input1Diffs)) {
      return ModifiedBaseRangeState.base.withInputValue(1, true);
    }
    if (editsAgreeWithDiffs(baseRange.input2Diffs)) {
      return ModifiedBaseRangeState.base.withInputValue(2, true);
    }
    const states = [
      ModifiedBaseRangeState.base.withInputValue(1, true).withInputValue(2, true, true),
      ModifiedBaseRangeState.base.withInputValue(2, true).withInputValue(1, true, true),
      ModifiedBaseRangeState.base.withInputValue(1, true).withInputValue(2, true, false),
      ModifiedBaseRangeState.base.withInputValue(2, true).withInputValue(1, true, false)
    ];
    for (const s of states) {
      const { edit } = baseRange.getEditForBase(s);
      if (edit) {
        const resultRange = this.resultTextModelDiffs.getResultLineRange(baseRange.baseRange);
        const existingLines = resultRange.getLines(this.resultTextModel);
        if (equals(edit.newLines, existingLines, (a, b) => a === b)) {
          return s;
        }
      }
    }
    return ModifiedBaseRangeState.unrecognized;
  }
  getState(baseRange) {
    const existingState = this.modifiedBaseRangeResultStates.get().get(baseRange);
    if (!existingState) {
      throw new BugIndicatingError("object must be from this instance");
    }
    return existingState.accepted;
  }
  setState(baseRange, state, _markInputAsHandled, tx, _pushStackElement = false) {
    if (!this.isUpToDate.get()) {
      throw new BugIndicatingError("Cannot set state while updating");
    }
    const existingState = this.modifiedBaseRangeResultStates.get().get(baseRange);
    if (!existingState) {
      throw new BugIndicatingError("object must be from this instance");
    }
    const conflictingDiffs = this.resultTextModelDiffs.findTouchingDiffs(
      baseRange.baseRange
    );
    const group = new UndoRedoGroup();
    if (conflictingDiffs) {
      this.resultTextModelDiffs.removeDiffs(conflictingDiffs, tx, group);
    }
    const { edit, effectiveState } = baseRange.getEditForBase(state);
    existingState.accepted.set(effectiveState, tx);
    existingState.previousNonDiffingState = void 0;
    existingState.computedFromDiffing = false;
    const input1Handled = existingState.handledInput1.get();
    const input2Handled = existingState.handledInput2.get();
    if (!input1Handled || !input2Handled) {
      this.undoRedoService.pushElement(
        new MarkAsHandledUndoRedoElement(this.resultTextModel.uri, new WeakRef(this), new WeakRef(existingState), input1Handled, input2Handled),
        group
      );
    }
    if (edit) {
      this.resultTextModel.pushStackElement();
      this.resultTextModelDiffs.applyEditRelativeToOriginal(edit, tx, group);
      this.resultTextModel.pushStackElement();
    }
    existingState.handledInput1.set(true, tx);
    existingState.handledInput2.set(true, tx);
  }
  resetDirtyConflictsToBase() {
    transaction((tx) => {
      this.resultTextModel.pushStackElement();
      for (const range of this.modifiedBaseRanges.get()) {
        if (this.getState(range).get().kind === ModifiedBaseRangeStateKind.unrecognized) {
          this.setState(range, ModifiedBaseRangeState.base, false, tx, false);
        }
      }
      this.resultTextModel.pushStackElement();
    });
  }
  isHandled(baseRange) {
    return this.modifiedBaseRangeResultStates.get().get(baseRange).handled;
  }
  isInputHandled(baseRange, inputNumber) {
    const state = this.modifiedBaseRangeResultStates.get().get(baseRange);
    return inputNumber === 1 ? state.handledInput1 : state.handledInput2;
  }
  setInputHandled(baseRange, inputNumber, handled, tx) {
    const state = this.modifiedBaseRangeResultStates.get().get(baseRange);
    if (state.handled.get() === handled) {
      return;
    }
    const dataRef = new WeakRef(ModifiedBaseRangeData);
    const modelRef = new WeakRef(this);
    this.undoRedoService.pushElement({
      type: UndoRedoElementType.Resource,
      resource: this.resultTextModel.uri,
      code: "setInputHandled",
      label: localize("setInputHandled", "Set Input Handled"),
      redo() {
        const model = modelRef.deref();
        const data = dataRef.deref();
        if (model && !model.isDisposed() && data) {
          transaction((tx2) => {
            if (inputNumber === 1) {
              state.handledInput1.set(handled, tx2);
            } else {
              state.handledInput2.set(handled, tx2);
            }
          });
        }
      },
      undo() {
        const model = modelRef.deref();
        const data = dataRef.deref();
        if (model && !model.isDisposed() && data) {
          transaction((tx2) => {
            if (inputNumber === 1) {
              state.handledInput1.set(!handled, tx2);
            } else {
              state.handledInput2.set(!handled, tx2);
            }
          });
        }
      }
    });
    if (inputNumber === 1) {
      state.handledInput1.set(handled, tx);
    } else {
      state.handledInput2.set(handled, tx);
    }
  }
  setHandled(baseRange, handled, tx) {
    const state = this.modifiedBaseRangeResultStates.get().get(baseRange);
    if (state.handled.get() === handled) {
      return;
    }
    state.handledInput1.set(handled, tx);
    state.handledInput2.set(handled, tx);
  }
  setLanguageId(languageId, source) {
    const language = this.languageService.createById(languageId);
    this.base.setLanguage(language, source);
    this.input1.textModel.setLanguage(language, source);
    this.input2.textModel.setLanguage(language, source);
    this.resultTextModel.setLanguage(language, source);
  }
  getInitialResultValue() {
    const chunks = [];
    while (true) {
      const chunk = this.resultSnapshot.read();
      if (chunk === null) {
        break;
      }
      chunks.push(chunk);
    }
    return chunks.join();
  }
  async getResultValueWithConflictMarkers() {
    await waitForState(this.diffComputingState, (state) => state === 2 /* upToDate */);
    if (this.unhandledConflictsCount.get() === 0) {
      return this.resultTextModel.getValue();
    }
    const resultLines = this.resultTextModel.getLinesContent();
    const input1Lines = this.input1.textModel.getLinesContent();
    const input2Lines = this.input2.textModel.getLinesContent();
    const states = this.modifiedBaseRangeResultStates.get();
    const outputLines = [];
    function appendLinesToResult(source, lineRange) {
      for (let i = lineRange.startLineNumber; i < lineRange.endLineNumberExclusive; i++) {
        outputLines.push(source[i - 1]);
      }
    }
    let resultStartLineNumber = 1;
    for (const [range, state] of states) {
      if (state.handled.get()) {
        continue;
      }
      const resultRange = this.resultTextModelDiffs.getResultLineRange(range.baseRange);
      appendLinesToResult(resultLines, MergeEditorLineRange.fromLineNumbers(resultStartLineNumber, Math.max(resultStartLineNumber, resultRange.startLineNumber)));
      resultStartLineNumber = resultRange.endLineNumberExclusive;
      outputLines.push("<<<<<<<");
      if (state.accepted.get().kind === ModifiedBaseRangeStateKind.unrecognized) {
        appendLinesToResult(resultLines, resultRange);
      } else {
        appendLinesToResult(input1Lines, range.input1Range);
      }
      outputLines.push("=======");
      appendLinesToResult(input2Lines, range.input2Range);
      outputLines.push(">>>>>>>");
    }
    appendLinesToResult(resultLines, MergeEditorLineRange.fromLineNumbers(resultStartLineNumber, resultLines.length + 1));
    return outputLines.join("\n");
  }
  get conflictCount() {
    return arrayCount(this.modifiedBaseRanges.get(), (r) => r.isConflicting);
  }
  get combinableConflictCount() {
    return arrayCount(this.modifiedBaseRanges.get(), (r) => r.isConflicting && r.canBeCombined);
  }
  get conflictsResolvedWithBase() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => r.isConflicting && s.accepted.get().kind === ModifiedBaseRangeStateKind.base
    );
  }
  get conflictsResolvedWithInput1() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => r.isConflicting && s.accepted.get().kind === ModifiedBaseRangeStateKind.input1
    );
  }
  get conflictsResolvedWithInput2() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => r.isConflicting && s.accepted.get().kind === ModifiedBaseRangeStateKind.input2
    );
  }
  get conflictsResolvedWithSmartCombination() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => {
        const state = s.accepted.get();
        return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.both && state.smartCombination;
      }
    );
  }
  get manuallySolvedConflictCountThatEqualNone() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => r.isConflicting && s.accepted.get().kind === ModifiedBaseRangeStateKind.unrecognized
    );
  }
  get manuallySolvedConflictCountThatEqualSmartCombine() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => {
        const state = s.accepted.get();
        return r.isConflicting && s.computedFromDiffing && state.kind === ModifiedBaseRangeStateKind.both && state.smartCombination;
      }
    );
  }
  get manuallySolvedConflictCountThatEqualInput1() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => {
        const state = s.accepted.get();
        return r.isConflicting && s.computedFromDiffing && state.kind === ModifiedBaseRangeStateKind.input1;
      }
    );
  }
  get manuallySolvedConflictCountThatEqualInput2() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => {
        const state = s.accepted.get();
        return r.isConflicting && s.computedFromDiffing && state.kind === ModifiedBaseRangeStateKind.input2;
      }
    );
  }
  get manuallySolvedConflictCountThatEqualNoneAndStartedWithBase() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => {
        const state = s.accepted.get();
        return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.base;
      }
    );
  }
  get manuallySolvedConflictCountThatEqualNoneAndStartedWithInput1() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => {
        const state = s.accepted.get();
        return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.input1;
      }
    );
  }
  get manuallySolvedConflictCountThatEqualNoneAndStartedWithInput2() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => {
        const state = s.accepted.get();
        return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.input2;
      }
    );
  }
  get manuallySolvedConflictCountThatEqualNoneAndStartedWithBothNonSmart() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => {
        const state = s.accepted.get();
        return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.both && !s.previousNonDiffingState?.smartCombination;
      }
    );
  }
  get manuallySolvedConflictCountThatEqualNoneAndStartedWithBothSmart() {
    return arrayCount(
      this.modifiedBaseRangeResultStates.get().entries(),
      ([r, s]) => {
        const state = s.accepted.get();
        return r.isConflicting && state.kind === ModifiedBaseRangeStateKind.unrecognized && s.previousNonDiffingState?.kind === ModifiedBaseRangeStateKind.both && s.previousNonDiffingState?.smartCombination;
      }
    );
  }
};
MergeEditorModel = __decorateClass([
  __decorateParam(7, ILanguageService),
  __decorateParam(8, IUndoRedoService)
], MergeEditorModel);
function arrayCount(array, predicate) {
  let count = 0;
  for (const value of array) {
    if (predicate(value)) {
      count++;
    }
  }
  return count;
}
class ModifiedBaseRangeData {
  constructor(baseRange) {
    this.baseRange = baseRange;
    this.accepted = observableValue(`BaseRangeState${this.baseRange.baseRange}`, ModifiedBaseRangeState.base);
    this.handledInput1 = observableValue(`BaseRangeHandledState${this.baseRange.baseRange}.Input1`, false);
    this.handledInput2 = observableValue(`BaseRangeHandledState${this.baseRange.baseRange}.Input2`, false);
    this.computedFromDiffing = false;
    this.previousNonDiffingState = void 0;
    this.handled = derived(this, (reader) => this.handledInput1.read(reader) && this.handledInput2.read(reader));
  }
}
var MergeEditorModelState = /* @__PURE__ */ ((MergeEditorModelState2) => {
  MergeEditorModelState2[MergeEditorModelState2["initializing"] = 1] = "initializing";
  MergeEditorModelState2[MergeEditorModelState2["upToDate"] = 2] = "upToDate";
  MergeEditorModelState2[MergeEditorModelState2["updating"] = 3] = "updating";
  return MergeEditorModelState2;
})(MergeEditorModelState || {});
class MarkAsHandledUndoRedoElement {
  constructor(resource, mergeEditorModelRef, stateRef, input1Handled, input2Handled) {
    this.resource = resource;
    this.mergeEditorModelRef = mergeEditorModelRef;
    this.stateRef = stateRef;
    this.input1Handled = input1Handled;
    this.input2Handled = input2Handled;
    this.code = "undoMarkAsHandled";
    this.label = localize("undoMarkAsHandled", "Undo Mark As Handled");
    this.type = UndoRedoElementType.Resource;
  }
  redo() {
    const mergeEditorModel = this.mergeEditorModelRef.deref();
    if (!mergeEditorModel || mergeEditorModel.isDisposed()) {
      return;
    }
    const state = this.stateRef.deref();
    if (!state) {
      return;
    }
    transaction((tx) => {
      state.handledInput1.set(true, tx);
      state.handledInput2.set(true, tx);
    });
  }
  undo() {
    const mergeEditorModel = this.mergeEditorModelRef.deref();
    if (!mergeEditorModel || mergeEditorModel.isDisposed()) {
      return;
    }
    const state = this.stateRef.deref();
    if (!state) {
      return;
    }
    transaction((tx) => {
      state.handledInput1.set(this.input1Handled, tx);
      state.handledInput2.set(this.input2Handled, tx);
    });
  }
}
export {
  MergeEditorModel,
  MergeEditorModelState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFxtb2RlbFxcbWVyZ2VFZGl0b3JNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvbXBhcmVSZXN1bHQsIGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgYXV0b3J1bkhhbmRsZUNoYW5nZXMsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBJVHJhbnNhY3Rpb24sIGtlZXBPYnNlcnZlZCwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiwgd2FpdEZvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZVVuZG9SZWRvRWxlbWVudCwgSVVuZG9SZWRvU2VydmljZSwgVW5kb1JlZG9FbGVtZW50VHlwZSwgVW5kb1JlZG9Hcm91cCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgSU1lcmdlRGlmZkNvbXB1dGVyIH0gZnJvbSAnLi9kaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgTWVyZ2VFZGl0b3JMaW5lUmFuZ2UgfSBmcm9tICcuL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcsIERvY3VtZW50TGluZVJhbmdlTWFwLCBEb2N1bWVudFJhbmdlTWFwLCBMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi9tYXBwaW5nLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbERpZmZDaGFuZ2VSZWFzb24sIFRleHRNb2RlbERpZmZzLCBUZXh0TW9kZWxEaWZmU3RhdGUgfSBmcm9tICcuL3RleHRNb2RlbERpZmZzLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yVGVsZW1ldHJ5IH0gZnJvbSAnLi4vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGxlZnRKb2luIH0gZnJvbSAnLi4vdXRpbHMuanMnO1xuaW1wb3J0IHsgSW5wdXROdW1iZXIsIE1vZGlmaWVkQmFzZVJhbmdlLCBNb2RpZmllZEJhc2VSYW5nZVN0YXRlLCBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZCB9IGZyb20gJy4vbW9kaWZpZWRCYXNlUmFuZ2UuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElucHV0RGF0YSB7XG5cdHJlYWRvbmx5IHRleHRNb2RlbDogSVRleHRNb2RlbDtcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZGV0YWlsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBNZXJnZUVkaXRvck1vZGVsIGV4dGVuZHMgRWRpdG9yTW9kZWwge1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0MVRleHRNb2RlbERpZmZzO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0MlRleHRNb2RlbERpZmZzO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlc3VsdFRleHRNb2RlbERpZmZzO1xuXHRwdWJsaWMgcmVhZG9ubHkgbW9kaWZpZWRCYXNlUmFuZ2VzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXM7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZXN1bHRTbmFwc2hvdDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBiYXNlOiBJVGV4dE1vZGVsLFxuXHRcdHJlYWRvbmx5IGlucHV0MTogSW5wdXREYXRhLFxuXHRcdHJlYWRvbmx5IGlucHV0MjogSW5wdXREYXRhLFxuXHRcdHJlYWRvbmx5IHJlc3VsdFRleHRNb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRpZmZDb21wdXRlcjogSU1lcmdlRGlmZkNvbXB1dGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogeyByZXNldFJlc3VsdDogYm9vbGVhbiB9LFxuXHRcdHB1YmxpYyByZWFkb25seSB0ZWxlbWV0cnk6IE1lcmdlRWRpdG9yVGVsZW1ldHJ5LFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJVW5kb1JlZG9TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuaW5wdXQxVGV4dE1vZGVsRGlmZnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGV4dE1vZGVsRGlmZnModGhpcy5iYXNlLCB0aGlzLmlucHV0MS50ZXh0TW9kZWwsIHRoaXMuZGlmZkNvbXB1dGVyKSk7XG5cdFx0dGhpcy5pbnB1dDJUZXh0TW9kZWxEaWZmcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUZXh0TW9kZWxEaWZmcyh0aGlzLmJhc2UsIHRoaXMuaW5wdXQyLnRleHRNb2RlbCwgdGhpcy5kaWZmQ29tcHV0ZXIpKTtcblx0XHR0aGlzLnJlc3VsdFRleHRNb2RlbERpZmZzID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRleHRNb2RlbERpZmZzKHRoaXMuYmFzZSwgdGhpcy5yZXN1bHRUZXh0TW9kZWwsIHRoaXMuZGlmZkNvbXB1dGVyKSk7XG5cdFx0dGhpcy5tb2RpZmllZEJhc2VSYW5nZXMgPSBkZXJpdmVkPE1vZGlmaWVkQmFzZVJhbmdlW10+KHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0MURpZmZzID0gdGhpcy5pbnB1dDFUZXh0TW9kZWxEaWZmcy5kaWZmcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpbnB1dDJEaWZmcyA9IHRoaXMuaW5wdXQyVGV4dE1vZGVsRGlmZnMuZGlmZnMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIE1vZGlmaWVkQmFzZVJhbmdlLmZyb21EaWZmcyhpbnB1dDFEaWZmcywgaW5wdXQyRGlmZnMsIHRoaXMuYmFzZSwgdGhpcy5pbnB1dDEudGV4dE1vZGVsLCB0aGlzLmlucHV0Mi50ZXh0TW9kZWwpO1xuXHRcdH0pO1xuXHRcdHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBtYXAgPSBuZXcgTWFwPE1vZGlmaWVkQmFzZVJhbmdlLCBNb2RpZmllZEJhc2VSYW5nZURhdGE+KFxuXHRcdFx0XHR0aGlzLm1vZGlmaWVkQmFzZVJhbmdlcy5yZWFkKHJlYWRlcikubWFwPFtNb2RpZmllZEJhc2VSYW5nZSwgTW9kaWZpZWRCYXNlUmFuZ2VEYXRhXT4oKHMpID0+IFtcblx0XHRcdFx0XHRzLCBuZXcgTW9kaWZpZWRCYXNlUmFuZ2VEYXRhKHMpXG5cdFx0XHRcdF0pXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIG1hcDtcblx0XHR9KTtcblx0XHR0aGlzLnJlc3VsdFNuYXBzaG90ID0gdGhpcy5yZXN1bHRUZXh0TW9kZWwuY3JlYXRlU25hcHNob3QoKTtcblx0XHR0aGlzLmJhc2VJbnB1dDFEaWZmcyA9IHRoaXMuaW5wdXQxVGV4dE1vZGVsRGlmZnMuZGlmZnM7XG5cdFx0dGhpcy5iYXNlSW5wdXQyRGlmZnMgPSB0aGlzLmlucHV0MlRleHRNb2RlbERpZmZzLmRpZmZzO1xuXHRcdHRoaXMuYmFzZVJlc3VsdERpZmZzID0gdGhpcy5yZXN1bHRUZXh0TW9kZWxEaWZmcy5kaWZmcztcblx0XHR0aGlzLmlucHV0MVJlc3VsdE1hcHBpbmcgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRJbnB1dFJlc3VsdE1hcHBpbmcoXG5cdFx0XHRcdHRoaXMuYmFzZUlucHV0MURpZmZzLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0dGhpcy5iYXNlUmVzdWx0RGlmZnMucmVhZChyZWFkZXIpLFxuXHRcdFx0XHR0aGlzLmlucHV0MS50ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCksXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRoaXMucmVzdWx0SW5wdXQxTWFwcGluZyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuaW5wdXQxUmVzdWx0TWFwcGluZy5yZWFkKHJlYWRlcikucmV2ZXJzZSgpKTtcblx0XHR0aGlzLmlucHV0MlJlc3VsdE1hcHBpbmcgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRJbnB1dFJlc3VsdE1hcHBpbmcoXG5cdFx0XHRcdHRoaXMuYmFzZUlucHV0MkRpZmZzLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0dGhpcy5iYXNlUmVzdWx0RGlmZnMucmVhZChyZWFkZXIpLFxuXHRcdFx0XHR0aGlzLmlucHV0Mi50ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCksXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRoaXMucmVzdWx0SW5wdXQyTWFwcGluZyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuaW5wdXQyUmVzdWx0TWFwcGluZy5yZWFkKHJlYWRlcikucmV2ZXJzZSgpKTtcblx0XHR0aGlzLmJhc2VSZXN1bHRNYXBwaW5nID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbWFwID0gbmV3IERvY3VtZW50TGluZVJhbmdlTWFwKHRoaXMuYmFzZVJlc3VsdERpZmZzLnJlYWQocmVhZGVyKSwgLTEpO1xuXHRcdFx0cmV0dXJuIG5ldyBEb2N1bWVudExpbmVSYW5nZU1hcChcblx0XHRcdFx0bWFwLmxpbmVSYW5nZU1hcHBpbmdzLm1hcCgobSkgPT5cblx0XHRcdFx0XHRtLmlucHV0UmFuZ2UuaXNFbXB0eSB8fCBtLm91dHB1dFJhbmdlLmlzRW1wdHlcblx0XHRcdFx0XHRcdD8gbmV3IExpbmVSYW5nZU1hcHBpbmcoXG5cdFx0XHRcdFx0XHRcdC8vIFdlIGNhbiBkbyB0aGlzIGJlY2F1c2UgdHdvIGFkamFjZW50IGRpZmZzIGhhdmUgb25lIGxpbmUgaW4gYmV0d2Vlbi5cblx0XHRcdFx0XHRcdFx0bS5pbnB1dFJhbmdlLmRlbHRhU3RhcnQoLTEpLFxuXHRcdFx0XHRcdFx0XHRtLm91dHB1dFJhbmdlLmRlbHRhU3RhcnQoLTEpXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XHQ6IG1cblx0XHRcdFx0KSxcblx0XHRcdFx0bWFwLmlucHV0TGluZUNvdW50XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRoaXMucmVzdWx0QmFzZU1hcHBpbmcgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLmJhc2VSZXN1bHRNYXBwaW5nLnJlYWQocmVhZGVyKS5yZXZlcnNlKCkpO1xuXHRcdHRoaXMuZGlmZkNvbXB1dGluZ1N0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGVzID0gW1xuXHRcdFx0XHR0aGlzLmlucHV0MVRleHRNb2RlbERpZmZzLFxuXHRcdFx0XHR0aGlzLmlucHV0MlRleHRNb2RlbERpZmZzLFxuXHRcdFx0XHR0aGlzLnJlc3VsdFRleHRNb2RlbERpZmZzLFxuXHRcdFx0XS5tYXAoKHMpID0+IHMuc3RhdGUucmVhZChyZWFkZXIpKTtcblxuXHRcdFx0aWYgKHN0YXRlcy5zb21lKChzKSA9PiBzID09PSBUZXh0TW9kZWxEaWZmU3RhdGUuaW5pdGlhbGl6aW5nKSkge1xuXHRcdFx0XHRyZXR1cm4gTWVyZ2VFZGl0b3JNb2RlbFN0YXRlLmluaXRpYWxpemluZztcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZXMuc29tZSgocykgPT4gcyA9PT0gVGV4dE1vZGVsRGlmZlN0YXRlLnVwZGF0aW5nKSkge1xuXHRcdFx0XHRyZXR1cm4gTWVyZ2VFZGl0b3JNb2RlbFN0YXRlLnVwZGF0aW5nO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIE1lcmdlRWRpdG9yTW9kZWxTdGF0ZS51cFRvRGF0ZTtcblx0XHR9KTtcblx0XHR0aGlzLmlucHV0RGlmZkNvbXB1dGluZ1N0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGVzID0gW1xuXHRcdFx0XHR0aGlzLmlucHV0MVRleHRNb2RlbERpZmZzLFxuXHRcdFx0XHR0aGlzLmlucHV0MlRleHRNb2RlbERpZmZzLFxuXHRcdFx0XS5tYXAoKHMpID0+IHMuc3RhdGUucmVhZChyZWFkZXIpKTtcblxuXHRcdFx0aWYgKHN0YXRlcy5zb21lKChzKSA9PiBzID09PSBUZXh0TW9kZWxEaWZmU3RhdGUuaW5pdGlhbGl6aW5nKSkge1xuXHRcdFx0XHRyZXR1cm4gTWVyZ2VFZGl0b3JNb2RlbFN0YXRlLmluaXRpYWxpemluZztcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZXMuc29tZSgocykgPT4gcyA9PT0gVGV4dE1vZGVsRGlmZlN0YXRlLnVwZGF0aW5nKSkge1xuXHRcdFx0XHRyZXR1cm4gTWVyZ2VFZGl0b3JNb2RlbFN0YXRlLnVwZGF0aW5nO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIE1lcmdlRWRpdG9yTW9kZWxTdGF0ZS51cFRvRGF0ZTtcblx0XHR9KTtcblx0XHR0aGlzLmlzVXBUb0RhdGUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLmRpZmZDb21wdXRpbmdTdGF0ZS5yZWFkKHJlYWRlcikgPT09IE1lcmdlRWRpdG9yTW9kZWxTdGF0ZS51cFRvRGF0ZSk7XG5cblx0XHR0aGlzLmZpcnN0UnVuID0gdHJ1ZTtcblx0XHR0aGlzLnVuaGFuZGxlZENvbmZsaWN0c0NvdW50ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbWFwID0gdGhpcy5tb2RpZmllZEJhc2VSYW5nZVJlc3VsdFN0YXRlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRsZXQgdW5oYW5kbGVkQ291bnQgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBbX2tleSwgdmFsdWVdIG9mIG1hcCkge1xuXHRcdFx0XHRpZiAoIXZhbHVlLmhhbmRsZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0dW5oYW5kbGVkQ291bnQrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuaGFuZGxlZENvdW50O1xuXHRcdH0pO1xuXHRcdHRoaXMuaGFzVW5oYW5kbGVkQ29uZmxpY3RzID0gdGhpcy51bmhhbmRsZWRDb25mbGljdHNDb3VudC5tYXAodmFsdWUgPT4gLyoqIEBkZXNjcmlwdGlvbiBoYXNVbmhhbmRsZWRDb25mbGljdHMgKi8gdmFsdWUgPiAwKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGtlZXBPYnNlcnZlZCh0aGlzLm1vZGlmaWVkQmFzZVJhbmdlUmVzdWx0U3RhdGVzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoa2VlcE9ic2VydmVkKHRoaXMuaW5wdXQxUmVzdWx0TWFwcGluZykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGtlZXBPYnNlcnZlZCh0aGlzLmlucHV0MlJlc3VsdE1hcHBpbmcpKTtcblxuXHRcdGNvbnN0IGluaXRpYWxpemVQcm9taXNlID0gdGhpcy5pbml0aWFsaXplKCk7XG5cblx0XHR0aGlzLm9uSW5pdGlhbGl6ZWQgPSB3YWl0Rm9yU3RhdGUodGhpcy5kaWZmQ29tcHV0aW5nU3RhdGUsIHN0YXRlID0+IHN0YXRlID09PSBNZXJnZUVkaXRvck1vZGVsU3RhdGUudXBUb0RhdGUpLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgaW5pdGlhbGl6ZVByb21pc2U7XG5cdFx0fSk7XG5cblx0XHRpbml0aWFsaXplUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdGxldCBzaG91bGRSZWNvbXB1dGVIYW5kbGVkRnJvbUFjY2VwdGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0XHRhdXRvcnVuSGFuZGxlQ2hhbmdlcyhcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRjaGFuZ2VUcmFja2VyOiB7XG5cdFx0XHRcdFx0XHRcdGNyZWF0ZUNoYW5nZVN1bW1hcnk6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0aGFuZGxlQ2hhbmdlOiAoY3R4KSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGN0eC5kaWRDaGFuZ2UodGhpcy5tb2RpZmllZEJhc2VSYW5nZVJlc3VsdFN0YXRlcykpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHNob3VsZFJlY29tcHV0ZUhhbmRsZWRGcm9tQWNjZXB0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gY3R4LmRpZENoYW5nZSh0aGlzLnJlc3VsdFRleHRNb2RlbERpZmZzLmRpZmZzKVxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gSWdub3JlIG5vbi10ZXh0IGNoYW5nZXMgYXMgd2UgdXBkYXRlIHRoZSBzdGF0ZSBkaXJlY3RseVxuXHRcdFx0XHRcdFx0XHRcdFx0PyBjdHguY2hhbmdlID09PSBUZXh0TW9kZWxEaWZmQ2hhbmdlUmVhc29uLnRleHRDaGFuZ2Vcblx0XHRcdFx0XHRcdFx0XHRcdDogdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdChyZWFkZXIpID0+IHtcblx0XHRcdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gTWVyZ2UgRWRpdG9yIE1vZGVsOiBSZWNvbXB1dGUgU3RhdGUgRnJvbSBSZXN1bHQgKi9cblx0XHRcdFx0XHRcdGNvbnN0IHN0YXRlcyA9IHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdFx0aWYgKCF0aGlzLmlzVXBUb0RhdGUucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdERpZmZzID0gdGhpcy5yZXN1bHRUZXh0TW9kZWxEaWZmcy5kaWZmcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gTWVyZ2UgRWRpdG9yIE1vZGVsOiBSZWNvbXB1dGUgU3RhdGUgKi9cblxuXHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUJhc2VSYW5nZUFjY2VwdGVkU3RhdGUocmVzdWx0RGlmZnMsIHN0YXRlcywgdHgpO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChzaG91bGRSZWNvbXB1dGVIYW5kbGVkRnJvbUFjY2VwdGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2hvdWxkUmVjb21wdXRlSGFuZGxlZEZyb21BY2NlcHRlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgW19yYW5nZSwgb2JzZXJ2YWJsZVN0YXRlXSBvZiBzdGF0ZXMpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZVN0YXRlLmFjY2VwdGVkLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGhhbmRsZWQgPSAhKHN0YXRlLmtpbmQgPT09IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLmJhc2UgfHwgc3RhdGUua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQudW5yZWNvZ25pemVkKTtcblx0XHRcdFx0XHRcdFx0XHRcdG9ic2VydmFibGVTdGF0ZS5oYW5kbGVkSW5wdXQxLnNldChoYW5kbGVkLCB0eCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRvYnNlcnZhYmxlU3RhdGUuaGFuZGxlZElucHV0Mi5zZXQoaGFuZGxlZCwgdHgpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMucmVzZXRSZXN1bHQpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVzZXQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVzZXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgd2FpdEZvclN0YXRlKHRoaXMuaW5wdXREaWZmQ29tcHV0aW5nU3RhdGUsIHN0YXRlID0+IHN0YXRlID09PSBNZXJnZUVkaXRvck1vZGVsU3RhdGUudXBUb0RhdGUpO1xuXHRcdGNvbnN0IHN0YXRlcyA9IHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMuZ2V0KCk7XG5cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIFNldCBpbml0aWFsIHN0YXRlICovXG5cblx0XHRcdGZvciAoY29uc3QgW3JhbmdlLCBzdGF0ZV0gb2Ygc3RhdGVzKSB7XG5cdFx0XHRcdGxldCBuZXdTdGF0ZTogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZTtcblx0XHRcdFx0bGV0IGhhbmRsZWQgPSBmYWxzZTtcblx0XHRcdFx0aWYgKHJhbmdlLmlucHV0MURpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdG5ld1N0YXRlID0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZS5iYXNlLndpdGhJbnB1dFZhbHVlKDIsIHRydWUpO1xuXHRcdFx0XHRcdGhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJhbmdlLmlucHV0MkRpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdG5ld1N0YXRlID0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZS5iYXNlLndpdGhJbnB1dFZhbHVlKDEsIHRydWUpO1xuXHRcdFx0XHRcdGhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJhbmdlLmlzRXF1YWxDaGFuZ2UpIHtcblx0XHRcdFx0XHRuZXdTdGF0ZSA9IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUuYmFzZS53aXRoSW5wdXRWYWx1ZSgxLCB0cnVlKTtcblx0XHRcdFx0XHRoYW5kbGVkID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuZXdTdGF0ZSA9IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUuYmFzZTtcblx0XHRcdFx0XHRoYW5kbGVkID0gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzdGF0ZS5hY2NlcHRlZC5zZXQobmV3U3RhdGUsIHR4KTtcblx0XHRcdFx0c3RhdGUuY29tcHV0ZWRGcm9tRGlmZmluZyA9IGZhbHNlO1xuXHRcdFx0XHRzdGF0ZS5wcmV2aW91c05vbkRpZmZpbmdTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c3RhdGUuaGFuZGxlZElucHV0MS5zZXQoaGFuZGxlZCwgdHgpO1xuXHRcdFx0XHRzdGF0ZS5oYW5kbGVkSW5wdXQyLnNldChoYW5kbGVkLCB0eCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmVzdWx0VGV4dE1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCAxKSxcblx0XHRcdFx0dGV4dDogdGhpcy5jb21wdXRlQXV0b01lcmdlZFJlc3VsdCgpXG5cdFx0XHR9XSwgKCkgPT4gbnVsbCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVBdXRvTWVyZ2VkUmVzdWx0KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgYmFzZVJhbmdlcyA9IHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VzLmdldCgpO1xuXG5cdFx0Y29uc3QgYmFzZUxpbmVzID0gdGhpcy5iYXNlLmdldExpbmVzQ29udGVudCgpO1xuXHRcdGNvbnN0IGlucHV0MUxpbmVzID0gdGhpcy5pbnB1dDEudGV4dE1vZGVsLmdldExpbmVzQ29udGVudCgpO1xuXHRcdGNvbnN0IGlucHV0MkxpbmVzID0gdGhpcy5pbnB1dDIudGV4dE1vZGVsLmdldExpbmVzQ29udGVudCgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0TGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0ZnVuY3Rpb24gYXBwZW5kTGluZXNUb1Jlc3VsdChzb3VyY2U6IHN0cmluZ1tdLCBsaW5lUmFuZ2U6IE1lcmdlRWRpdG9yTGluZVJhbmdlKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gbGluZVJhbmdlLnN0YXJ0TGluZU51bWJlcjsgaSA8IGxpbmVSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlOyBpKyspIHtcblx0XHRcdFx0cmVzdWx0TGluZXMucHVzaChzb3VyY2VbaSAtIDFdKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgYmFzZVN0YXJ0TGluZU51bWJlciA9IDE7XG5cblx0XHRmb3IgKGNvbnN0IGJhc2VSYW5nZSBvZiBiYXNlUmFuZ2VzKSB7XG5cdFx0XHRhcHBlbmRMaW5lc1RvUmVzdWx0KGJhc2VMaW5lcywgTWVyZ2VFZGl0b3JMaW5lUmFuZ2UuZnJvbUxpbmVOdW1iZXJzKGJhc2VTdGFydExpbmVOdW1iZXIsIGJhc2VSYW5nZS5iYXNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHRiYXNlU3RhcnRMaW5lTnVtYmVyID0gYmFzZVJhbmdlLmJhc2VSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlO1xuXG5cdFx0XHRpZiAoYmFzZVJhbmdlLmlucHV0MURpZmZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRhcHBlbmRMaW5lc1RvUmVzdWx0KGlucHV0MkxpbmVzLCBiYXNlUmFuZ2UuaW5wdXQyUmFuZ2UpO1xuXHRcdFx0fSBlbHNlIGlmIChiYXNlUmFuZ2UuaW5wdXQyRGlmZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGFwcGVuZExpbmVzVG9SZXN1bHQoaW5wdXQxTGluZXMsIGJhc2VSYW5nZS5pbnB1dDFSYW5nZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGJhc2VSYW5nZS5pc0VxdWFsQ2hhbmdlKSB7XG5cdFx0XHRcdGFwcGVuZExpbmVzVG9SZXN1bHQoaW5wdXQxTGluZXMsIGJhc2VSYW5nZS5pbnB1dDFSYW5nZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhcHBlbmRMaW5lc1RvUmVzdWx0KGJhc2VMaW5lcywgYmFzZVJhbmdlLmJhc2VSYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXBwZW5kTGluZXNUb1Jlc3VsdChiYXNlTGluZXMsIE1lcmdlRWRpdG9yTGluZVJhbmdlLmZyb21MaW5lTnVtYmVycyhiYXNlU3RhcnRMaW5lTnVtYmVyLCBiYXNlTGluZXMubGVuZ3RoICsgMSkpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdExpbmVzLmpvaW4odGhpcy5yZXN1bHRUZXh0TW9kZWwuZ2V0RU9MKCkpO1xuXHR9XG5cblx0cHVibGljIGhhc0Jhc2VSYW5nZShiYXNlUmFuZ2U6IE1vZGlmaWVkQmFzZVJhbmdlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMuZ2V0KCkuaGFzKGJhc2VSYW5nZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgYmFzZUlucHV0MURpZmZzO1xuXG5cdHB1YmxpYyByZWFkb25seSBiYXNlSW5wdXQyRGlmZnM7XG5cdHB1YmxpYyByZWFkb25seSBiYXNlUmVzdWx0RGlmZnM7XG5cdHB1YmxpYyBnZXQgaXNBcHBseWluZ0VkaXRJblJlc3VsdCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMucmVzdWx0VGV4dE1vZGVsRGlmZnMuaXNBcHBseWluZ0NoYW5nZTsgfVxuXHRwdWJsaWMgcmVhZG9ubHkgaW5wdXQxUmVzdWx0TWFwcGluZztcblxuXHRwdWJsaWMgcmVhZG9ubHkgcmVzdWx0SW5wdXQxTWFwcGluZztcblxuXHRwdWJsaWMgcmVhZG9ubHkgaW5wdXQyUmVzdWx0TWFwcGluZztcblxuXHRwdWJsaWMgcmVhZG9ubHkgcmVzdWx0SW5wdXQyTWFwcGluZztcblxuXHRwcml2YXRlIGdldElucHV0UmVzdWx0TWFwcGluZyhpbnB1dExpbmVzRGlmZnM6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdLCByZXN1bHREaWZmczogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10sIGlucHV0TGluZUNvdW50OiBudW1iZXIpIHtcblx0XHRjb25zdCBtYXAgPSBEb2N1bWVudExpbmVSYW5nZU1hcC5iZXR3ZWVuT3V0cHV0cyhpbnB1dExpbmVzRGlmZnMsIHJlc3VsdERpZmZzLCBpbnB1dExpbmVDb3VudCk7XG5cdFx0cmV0dXJuIG5ldyBEb2N1bWVudExpbmVSYW5nZU1hcChcblx0XHRcdG1hcC5saW5lUmFuZ2VNYXBwaW5ncy5tYXAoKG0pID0+XG5cdFx0XHRcdG0uaW5wdXRSYW5nZS5pc0VtcHR5IHx8IG0ub3V0cHV0UmFuZ2UuaXNFbXB0eVxuXHRcdFx0XHRcdD8gbmV3IExpbmVSYW5nZU1hcHBpbmcoXG5cdFx0XHRcdFx0XHQvLyBXZSBjYW4gZG8gdGhpcyBiZWNhdXNlIHR3byBhZGphY2VudCBkaWZmcyBoYXZlIG9uZSBsaW5lIGluIGJldHdlZW4uXG5cdFx0XHRcdFx0XHRtLmlucHV0UmFuZ2UuZGVsdGFTdGFydCgtMSksXG5cdFx0XHRcdFx0XHRtLm91dHB1dFJhbmdlLmRlbHRhU3RhcnQoLTEpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHRcdDogbVxuXHRcdFx0KSxcblx0XHRcdG1hcC5pbnB1dExpbmVDb3VudFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgYmFzZVJlc3VsdE1hcHBpbmc7XG5cblx0cHVibGljIHJlYWRvbmx5IHJlc3VsdEJhc2VNYXBwaW5nO1xuXG5cdHB1YmxpYyB0cmFuc2xhdGVJbnB1dFJhbmdlVG9CYXNlKGlucHV0OiAxIHwgMiwgcmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IGJhc2VJbnB1dERpZmZzID0gaW5wdXQgPT09IDEgPyB0aGlzLmJhc2VJbnB1dDFEaWZmcy5nZXQoKSA6IHRoaXMuYmFzZUlucHV0MkRpZmZzLmdldCgpO1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBEb2N1bWVudFJhbmdlTWFwKGJhc2VJbnB1dERpZmZzLmZsYXRNYXAoZCA9PiBkLnJhbmdlTWFwcGluZ3MpLCAwKS5yZXZlcnNlKCk7XG5cdFx0cmV0dXJuIG1hcC5wcm9qZWN0UmFuZ2UocmFuZ2UpLm91dHB1dFJhbmdlO1xuXHR9XG5cblx0cHVibGljIHRyYW5zbGF0ZUJhc2VSYW5nZVRvSW5wdXQoaW5wdXQ6IDEgfCAyLCByYW5nZTogUmFuZ2UpOiBSYW5nZSB7XG5cdFx0Y29uc3QgYmFzZUlucHV0RGlmZnMgPSBpbnB1dCA9PT0gMSA/IHRoaXMuYmFzZUlucHV0MURpZmZzLmdldCgpIDogdGhpcy5iYXNlSW5wdXQyRGlmZnMuZ2V0KCk7XG5cdFx0Y29uc3QgbWFwID0gbmV3IERvY3VtZW50UmFuZ2VNYXAoYmFzZUlucHV0RGlmZnMuZmxhdE1hcChkID0+IGQucmFuZ2VNYXBwaW5ncyksIDApO1xuXHRcdHJldHVybiBtYXAucHJvamVjdFJhbmdlKHJhbmdlKS5vdXRwdXRSYW5nZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lUmFuZ2VJblJlc3VsdChiYXNlUmFuZ2U6IE1lcmdlRWRpdG9yTGluZVJhbmdlLCByZWFkZXI/OiBJUmVhZGVyKTogTWVyZ2VFZGl0b3JMaW5lUmFuZ2Uge1xuXHRcdHJldHVybiB0aGlzLnJlc3VsdFRleHRNb2RlbERpZmZzLmdldFJlc3VsdExpbmVSYW5nZShiYXNlUmFuZ2UsIHJlYWRlcik7XG5cdH1cblxuXHRwdWJsaWMgdHJhbnNsYXRlUmVzdWx0UmFuZ2VUb0Jhc2UocmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBEb2N1bWVudFJhbmdlTWFwKHRoaXMuYmFzZVJlc3VsdERpZmZzLmdldCgpLmZsYXRNYXAoZCA9PiBkLnJhbmdlTWFwcGluZ3MpLCAwKS5yZXZlcnNlKCk7XG5cdFx0cmV0dXJuIG1hcC5wcm9qZWN0UmFuZ2UocmFuZ2UpLm91dHB1dFJhbmdlO1xuXHR9XG5cblx0cHVibGljIHRyYW5zbGF0ZUJhc2VSYW5nZVRvUmVzdWx0KHJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcblx0XHRjb25zdCBtYXAgPSBuZXcgRG9jdW1lbnRSYW5nZU1hcCh0aGlzLmJhc2VSZXN1bHREaWZmcy5nZXQoKS5mbGF0TWFwKGQgPT4gZC5yYW5nZU1hcHBpbmdzKSwgMCk7XG5cdFx0cmV0dXJuIG1hcC5wcm9qZWN0UmFuZ2UocmFuZ2UpLm91dHB1dFJhbmdlO1xuXHR9XG5cblx0cHVibGljIGZpbmRNb2RpZmllZEJhc2VSYW5nZXNJblJhbmdlKHJhbmdlSW5CYXNlOiBNZXJnZUVkaXRvckxpbmVSYW5nZSk6IE1vZGlmaWVkQmFzZVJhbmdlW10ge1xuXHRcdC8vIFRPRE8gdXNlIGJpbmFyeSBzZWFyY2hcblx0XHRyZXR1cm4gdGhpcy5tb2RpZmllZEJhc2VSYW5nZXMuZ2V0KCkuZmlsdGVyKHIgPT4gci5iYXNlUmFuZ2UuaW50ZXJzZWN0c09yVG91Y2hlcyhyYW5nZUluQmFzZSkpO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGRpZmZDb21wdXRpbmdTdGF0ZTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaW5wdXREaWZmQ29tcHV0aW5nU3RhdGU7XG5cblx0cHVibGljIHJlYWRvbmx5IGlzVXBUb0RhdGU7XG5cblx0cHVibGljIHJlYWRvbmx5IG9uSW5pdGlhbGl6ZWQ7XG5cblx0cHJpdmF0ZSBmaXJzdFJ1bjtcblx0cHJpdmF0ZSB1cGRhdGVCYXNlUmFuZ2VBY2NlcHRlZFN0YXRlKHJlc3VsdERpZmZzOiBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSwgc3RhdGVzOiBNYXA8TW9kaWZpZWRCYXNlUmFuZ2UsIE1vZGlmaWVkQmFzZVJhbmdlRGF0YT4sIHR4OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBiYXNlUmFuZ2VXaXRoU3RvcmVBbmRUb3VjaGluZ0RpZmZzID0gbGVmdEpvaW4oXG5cdFx0XHRzdGF0ZXMsXG5cdFx0XHRyZXN1bHREaWZmcyxcblx0XHRcdChiYXNlUmFuZ2UsIGRpZmYpID0+XG5cdFx0XHRcdGJhc2VSYW5nZVswXS5iYXNlUmFuZ2UuaW50ZXJzZWN0c09yVG91Y2hlcyhkaWZmLmlucHV0UmFuZ2UpXG5cdFx0XHRcdFx0PyBDb21wYXJlUmVzdWx0Lm5laXRoZXJMZXNzT3JHcmVhdGVyVGhhblxuXHRcdFx0XHRcdDogTWVyZ2VFZGl0b3JMaW5lUmFuZ2UuY29tcGFyZUJ5U3RhcnQoXG5cdFx0XHRcdFx0XHRiYXNlUmFuZ2VbMF0uYmFzZVJhbmdlLFxuXHRcdFx0XHRcdFx0ZGlmZi5pbnB1dFJhbmdlXG5cdFx0XHRcdFx0KVxuXHRcdCk7XG5cblx0XHRmb3IgKGNvbnN0IHJvdyBvZiBiYXNlUmFuZ2VXaXRoU3RvcmVBbmRUb3VjaGluZ0RpZmZzKSB7XG5cdFx0XHRjb25zdCBuZXdTdGF0ZSA9IHRoaXMuY29tcHV0ZVN0YXRlKHJvdy5sZWZ0WzBdLCByb3cucmlnaHRzKTtcblx0XHRcdGNvbnN0IGRhdGEgPSByb3cubGVmdFsxXTtcblx0XHRcdGNvbnN0IG9sZFN0YXRlID0gZGF0YS5hY2NlcHRlZC5nZXQoKTtcblx0XHRcdGlmICghb2xkU3RhdGUuZXF1YWxzKG5ld1N0YXRlKSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuZmlyc3RSdW4gJiYgIWRhdGEuY29tcHV0ZWRGcm9tRGlmZmluZykge1xuXHRcdFx0XHRcdC8vIERvbid0IHNldCB0aGlzIG9uIHRoZSBmaXJzdCBydW4gLSB0aGUgZmlyc3QgcnVuIG1pZ2h0IGJlIHVzZWQgdG8gcmVzdG9yZSBzdGF0ZS5cblx0XHRcdFx0XHRkYXRhLmNvbXB1dGVkRnJvbURpZmZpbmcgPSB0cnVlO1xuXHRcdFx0XHRcdGRhdGEucHJldmlvdXNOb25EaWZmaW5nU3RhdGUgPSBvbGRTdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkYXRhLmFjY2VwdGVkLnNldChuZXdTdGF0ZSwgdHgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmZpcnN0UnVuKSB7XG5cdFx0XHR0aGlzLmZpcnN0UnVuID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlU3RhdGUoYmFzZVJhbmdlOiBNb2RpZmllZEJhc2VSYW5nZSwgY29uZmxpY3RpbmdEaWZmczogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10pOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlIHtcblx0XHRpZiAoY29uZmxpY3RpbmdEaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlLmJhc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZsaWN0aW5nRWRpdHMgPSBjb25mbGljdGluZ0RpZmZzLm1hcCgoZCkgPT4gZC5nZXRMaW5lRWRpdCgpKTtcblxuXHRcdGZ1bmN0aW9uIGVkaXRzQWdyZWVXaXRoRGlmZnMoZGlmZnM6IHJlYWRvbmx5IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdKTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gZXF1YWxzKFxuXHRcdFx0XHRjb25mbGljdGluZ0VkaXRzLFxuXHRcdFx0XHRkaWZmcy5tYXAoKGQpID0+IGQuZ2V0TGluZUVkaXQoKSksXG5cdFx0XHRcdChhLCBiKSA9PiBhLmVxdWFscyhiKVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdHNBZ3JlZVdpdGhEaWZmcyhiYXNlUmFuZ2UuaW5wdXQxRGlmZnMpKSB7XG5cdFx0XHRyZXR1cm4gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZS5iYXNlLndpdGhJbnB1dFZhbHVlKDEsIHRydWUpO1xuXHRcdH1cblx0XHRpZiAoZWRpdHNBZ3JlZVdpdGhEaWZmcyhiYXNlUmFuZ2UuaW5wdXQyRGlmZnMpKSB7XG5cdFx0XHRyZXR1cm4gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZS5iYXNlLndpdGhJbnB1dFZhbHVlKDIsIHRydWUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlcyA9IFtcblx0XHRcdE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUuYmFzZS53aXRoSW5wdXRWYWx1ZSgxLCB0cnVlKS53aXRoSW5wdXRWYWx1ZSgyLCB0cnVlLCB0cnVlKSxcblx0XHRcdE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUuYmFzZS53aXRoSW5wdXRWYWx1ZSgyLCB0cnVlKS53aXRoSW5wdXRWYWx1ZSgxLCB0cnVlLCB0cnVlKSxcblx0XHRcdE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUuYmFzZS53aXRoSW5wdXRWYWx1ZSgxLCB0cnVlKS53aXRoSW5wdXRWYWx1ZSgyLCB0cnVlLCBmYWxzZSksXG5cdFx0XHRNb2RpZmllZEJhc2VSYW5nZVN0YXRlLmJhc2Uud2l0aElucHV0VmFsdWUoMiwgdHJ1ZSkud2l0aElucHV0VmFsdWUoMSwgdHJ1ZSwgZmFsc2UpLFxuXHRcdF07XG5cblx0XHRmb3IgKGNvbnN0IHMgb2Ygc3RhdGVzKSB7XG5cdFx0XHRjb25zdCB7IGVkaXQgfSA9IGJhc2VSYW5nZS5nZXRFZGl0Rm9yQmFzZShzKTtcblx0XHRcdGlmIChlZGl0KSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdFJhbmdlID0gdGhpcy5yZXN1bHRUZXh0TW9kZWxEaWZmcy5nZXRSZXN1bHRMaW5lUmFuZ2UoYmFzZVJhbmdlLmJhc2VSYW5nZSk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nTGluZXMgPSByZXN1bHRSYW5nZS5nZXRMaW5lcyh0aGlzLnJlc3VsdFRleHRNb2RlbCk7XG5cblx0XHRcdFx0aWYgKGVxdWFscyhlZGl0Lm5ld0xpbmVzLCBleGlzdGluZ0xpbmVzLCAoYSwgYikgPT4gYSA9PT0gYikpIHtcblx0XHRcdFx0XHRyZXR1cm4gcztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlLnVucmVjb2duaXplZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGF0ZShiYXNlUmFuZ2U6IE1vZGlmaWVkQmFzZVJhbmdlKTogSU9ic2VydmFibGU8TW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZT4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nU3RhdGUgPSB0aGlzLm1vZGlmaWVkQmFzZVJhbmdlUmVzdWx0U3RhdGVzLmdldCgpLmdldChiYXNlUmFuZ2UpO1xuXHRcdGlmICghZXhpc3RpbmdTdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignb2JqZWN0IG11c3QgYmUgZnJvbSB0aGlzIGluc3RhbmNlJyk7XG5cdFx0fVxuXHRcdHJldHVybiBleGlzdGluZ1N0YXRlLmFjY2VwdGVkO1xuXHR9XG5cblx0cHVibGljIHNldFN0YXRlKFxuXHRcdGJhc2VSYW5nZTogTW9kaWZpZWRCYXNlUmFuZ2UsXG5cdFx0c3RhdGU6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUsXG5cdFx0X21hcmtJbnB1dEFzSGFuZGxlZDogYm9vbGVhbiB8IElucHV0TnVtYmVyLFxuXHRcdHR4OiBJVHJhbnNhY3Rpb24sXG5cdFx0X3B1c2hTdGFja0VsZW1lbnQ6IGJvb2xlYW4gPSBmYWxzZVxuXHQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNVcFRvRGF0ZS5nZXQoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignQ2Fubm90IHNldCBzdGF0ZSB3aGlsZSB1cGRhdGluZycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nU3RhdGUgPSB0aGlzLm1vZGlmaWVkQmFzZVJhbmdlUmVzdWx0U3RhdGVzLmdldCgpLmdldChiYXNlUmFuZ2UpO1xuXHRcdGlmICghZXhpc3RpbmdTdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignb2JqZWN0IG11c3QgYmUgZnJvbSB0aGlzIGluc3RhbmNlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmxpY3RpbmdEaWZmcyA9IHRoaXMucmVzdWx0VGV4dE1vZGVsRGlmZnMuZmluZFRvdWNoaW5nRGlmZnMoXG5cdFx0XHRiYXNlUmFuZ2UuYmFzZVJhbmdlXG5cdFx0KTtcblx0XHRjb25zdCBncm91cCA9IG5ldyBVbmRvUmVkb0dyb3VwKCk7XG5cdFx0aWYgKGNvbmZsaWN0aW5nRGlmZnMpIHtcblx0XHRcdHRoaXMucmVzdWx0VGV4dE1vZGVsRGlmZnMucmVtb3ZlRGlmZnMoY29uZmxpY3RpbmdEaWZmcywgdHgsIGdyb3VwKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGVkaXQsIGVmZmVjdGl2ZVN0YXRlIH0gPSBiYXNlUmFuZ2UuZ2V0RWRpdEZvckJhc2Uoc3RhdGUpO1xuXG5cdFx0ZXhpc3RpbmdTdGF0ZS5hY2NlcHRlZC5zZXQoZWZmZWN0aXZlU3RhdGUsIHR4KTtcblx0XHRleGlzdGluZ1N0YXRlLnByZXZpb3VzTm9uRGlmZmluZ1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdGV4aXN0aW5nU3RhdGUuY29tcHV0ZWRGcm9tRGlmZmluZyA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgaW5wdXQxSGFuZGxlZCA9IGV4aXN0aW5nU3RhdGUuaGFuZGxlZElucHV0MS5nZXQoKTtcblx0XHRjb25zdCBpbnB1dDJIYW5kbGVkID0gZXhpc3RpbmdTdGF0ZS5oYW5kbGVkSW5wdXQyLmdldCgpO1xuXG5cdFx0aWYgKCFpbnB1dDFIYW5kbGVkIHx8ICFpbnB1dDJIYW5kbGVkKSB7XG5cdFx0XHR0aGlzLnVuZG9SZWRvU2VydmljZS5wdXNoRWxlbWVudChcblx0XHRcdFx0bmV3IE1hcmtBc0hhbmRsZWRVbmRvUmVkb0VsZW1lbnQodGhpcy5yZXN1bHRUZXh0TW9kZWwudXJpLCBuZXcgV2Vha1JlZih0aGlzKSwgbmV3IFdlYWtSZWYoZXhpc3RpbmdTdGF0ZSksIGlucHV0MUhhbmRsZWQsIGlucHV0MkhhbmRsZWQpLFxuXHRcdFx0XHRncm91cFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdCkge1xuXHRcdFx0dGhpcy5yZXN1bHRUZXh0TW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0dGhpcy5yZXN1bHRUZXh0TW9kZWxEaWZmcy5hcHBseUVkaXRSZWxhdGl2ZVRvT3JpZ2luYWwoZWRpdCwgdHgsIGdyb3VwKTtcblx0XHRcdHRoaXMucmVzdWx0VGV4dE1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHR9XG5cblx0XHQvLyBhbHdheXMgc2V0IGNvbmZsaWN0IGFzIGhhbmRsZWRcblx0XHRleGlzdGluZ1N0YXRlLmhhbmRsZWRJbnB1dDEuc2V0KHRydWUsIHR4KTtcblx0XHRleGlzdGluZ1N0YXRlLmhhbmRsZWRJbnB1dDIuc2V0KHRydWUsIHR4KTtcblx0fVxuXG5cdHB1YmxpYyByZXNldERpcnR5Q29uZmxpY3RzVG9CYXNlKCk6IHZvaWQge1xuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gUmVzZXQgVW5rbm93biBCYXNlIFJhbmdlIFN0YXRlcyAqL1xuXHRcdFx0dGhpcy5yZXN1bHRUZXh0TW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiB0aGlzLm1vZGlmaWVkQmFzZVJhbmdlcy5nZXQoKSkge1xuXHRcdFx0XHRpZiAodGhpcy5nZXRTdGF0ZShyYW5nZSkuZ2V0KCkua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQudW5yZWNvZ25pemVkKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRTdGF0ZShyYW5nZSwgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZS5iYXNlLCBmYWxzZSwgdHgsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZXN1bHRUZXh0TW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGlzSGFuZGxlZChiYXNlUmFuZ2U6IE1vZGlmaWVkQmFzZVJhbmdlKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGlmaWVkQmFzZVJhbmdlUmVzdWx0U3RhdGVzLmdldCgpLmdldChiYXNlUmFuZ2UpIS5oYW5kbGVkO1xuXHR9XG5cblx0cHVibGljIGlzSW5wdXRIYW5kbGVkKGJhc2VSYW5nZTogTW9kaWZpZWRCYXNlUmFuZ2UsIGlucHV0TnVtYmVyOiBJbnB1dE51bWJlcik6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMuZ2V0KCkuZ2V0KGJhc2VSYW5nZSkhO1xuXHRcdHJldHVybiBpbnB1dE51bWJlciA9PT0gMSA/IHN0YXRlLmhhbmRsZWRJbnB1dDEgOiBzdGF0ZS5oYW5kbGVkSW5wdXQyO1xuXHR9XG5cblx0cHVibGljIHNldElucHV0SGFuZGxlZChiYXNlUmFuZ2U6IE1vZGlmaWVkQmFzZVJhbmdlLCBpbnB1dE51bWJlcjogSW5wdXROdW1iZXIsIGhhbmRsZWQ6IGJvb2xlYW4sIHR4OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMuZ2V0KCkuZ2V0KGJhc2VSYW5nZSkhO1xuXHRcdGlmIChzdGF0ZS5oYW5kbGVkLmdldCgpID09PSBoYW5kbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YVJlZiA9IG5ldyBXZWFrUmVmKE1vZGlmaWVkQmFzZVJhbmdlRGF0YSk7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBuZXcgV2Vha1JlZih0aGlzKTtcblxuXHRcdHRoaXMudW5kb1JlZG9TZXJ2aWNlLnB1c2hFbGVtZW50KHtcblx0XHRcdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2UsXG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXN1bHRUZXh0TW9kZWwudXJpLFxuXHRcdFx0Y29kZTogJ3NldElucHV0SGFuZGxlZCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NldElucHV0SGFuZGxlZCcsIFwiU2V0IElucHV0IEhhbmRsZWRcIiksXG5cdFx0XHRyZWRvKCkge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLmRlcmVmKCk7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBkYXRhUmVmLmRlcmVmKCk7XG5cdFx0XHRcdGlmIChtb2RlbCAmJiAhbW9kZWwuaXNEaXNwb3NlZCgpICYmIGRhdGEpIHtcblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaW5wdXROdW1iZXIgPT09IDEpIHtcblx0XHRcdFx0XHRcdFx0c3RhdGUuaGFuZGxlZElucHV0MS5zZXQoaGFuZGxlZCwgdHgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c3RhdGUuaGFuZGxlZElucHV0Mi5zZXQoaGFuZGxlZCwgdHgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0dW5kbygpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5kZXJlZigpO1xuXHRcdFx0XHRjb25zdCBkYXRhID0gZGF0YVJlZi5kZXJlZigpO1xuXHRcdFx0XHRpZiAobW9kZWwgJiYgIW1vZGVsLmlzRGlzcG9zZWQoKSAmJiBkYXRhKSB7XG5cdFx0XHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlucHV0TnVtYmVyID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdHN0YXRlLmhhbmRsZWRJbnB1dDEuc2V0KCFoYW5kbGVkLCB0eCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRzdGF0ZS5oYW5kbGVkSW5wdXQyLnNldCghaGFuZGxlZCwgdHgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0aWYgKGlucHV0TnVtYmVyID09PSAxKSB7XG5cdFx0XHRzdGF0ZS5oYW5kbGVkSW5wdXQxLnNldChoYW5kbGVkLCB0eCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXRlLmhhbmRsZWRJbnB1dDIuc2V0KGhhbmRsZWQsIHR4KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0SGFuZGxlZChiYXNlUmFuZ2U6IE1vZGlmaWVkQmFzZVJhbmdlLCBoYW5kbGVkOiBib29sZWFuLCB0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLm1vZGlmaWVkQmFzZVJhbmdlUmVzdWx0U3RhdGVzLmdldCgpLmdldChiYXNlUmFuZ2UpITtcblx0XHRpZiAoc3RhdGUuaGFuZGxlZC5nZXQoKSA9PT0gaGFuZGxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN0YXRlLmhhbmRsZWRJbnB1dDEuc2V0KGhhbmRsZWQsIHR4KTtcblx0XHRzdGF0ZS5oYW5kbGVkSW5wdXQyLnNldChoYW5kbGVkLCB0eCk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdW5oYW5kbGVkQ29uZmxpY3RzQ291bnQ7XG5cblx0cHVibGljIHJlYWRvbmx5IGhhc1VuaGFuZGxlZENvbmZsaWN0cztcblxuXHRwdWJsaWMgc2V0TGFuZ3VhZ2VJZChsYW5ndWFnZUlkOiBzdHJpbmcsIHNvdXJjZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGxhbmd1YWdlID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChsYW5ndWFnZUlkKTtcblx0XHR0aGlzLmJhc2Uuc2V0TGFuZ3VhZ2UobGFuZ3VhZ2UsIHNvdXJjZSk7XG5cdFx0dGhpcy5pbnB1dDEudGV4dE1vZGVsLnNldExhbmd1YWdlKGxhbmd1YWdlLCBzb3VyY2UpO1xuXHRcdHRoaXMuaW5wdXQyLnRleHRNb2RlbC5zZXRMYW5ndWFnZShsYW5ndWFnZSwgc291cmNlKTtcblx0XHR0aGlzLnJlc3VsdFRleHRNb2RlbC5zZXRMYW5ndWFnZShsYW5ndWFnZSwgc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbml0aWFsUmVzdWx0VmFsdWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBjaHVua3M6IHN0cmluZ1tdID0gW107XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IGNodW5rID0gdGhpcy5yZXN1bHRTbmFwc2hvdC5yZWFkKCk7XG5cdFx0XHRpZiAoY2h1bmsgPT09IG51bGwpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjaHVua3MucHVzaChjaHVuayk7XG5cdFx0fVxuXHRcdHJldHVybiBjaHVua3Muam9pbigpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFJlc3VsdFZhbHVlV2l0aENvbmZsaWN0TWFya2VycygpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGF3YWl0IHdhaXRGb3JTdGF0ZSh0aGlzLmRpZmZDb21wdXRpbmdTdGF0ZSwgc3RhdGUgPT4gc3RhdGUgPT09IE1lcmdlRWRpdG9yTW9kZWxTdGF0ZS51cFRvRGF0ZSk7XG5cblx0XHRpZiAodGhpcy51bmhhbmRsZWRDb25mbGljdHNDb3VudC5nZXQoKSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzdWx0VGV4dE1vZGVsLmdldFZhbHVlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0TGluZXMgPSB0aGlzLnJlc3VsdFRleHRNb2RlbC5nZXRMaW5lc0NvbnRlbnQoKTtcblx0XHRjb25zdCBpbnB1dDFMaW5lcyA9IHRoaXMuaW5wdXQxLnRleHRNb2RlbC5nZXRMaW5lc0NvbnRlbnQoKTtcblx0XHRjb25zdCBpbnB1dDJMaW5lcyA9IHRoaXMuaW5wdXQyLnRleHRNb2RlbC5nZXRMaW5lc0NvbnRlbnQoKTtcblxuXHRcdGNvbnN0IHN0YXRlcyA9IHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMuZ2V0KCk7XG5cblx0XHRjb25zdCBvdXRwdXRMaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRmdW5jdGlvbiBhcHBlbmRMaW5lc1RvUmVzdWx0KHNvdXJjZTogc3RyaW5nW10sIGxpbmVSYW5nZTogTWVyZ2VFZGl0b3JMaW5lUmFuZ2UpIHtcblx0XHRcdGZvciAobGV0IGkgPSBsaW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBpIDwgbGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7IGkrKykge1xuXHRcdFx0XHRvdXRwdXRMaW5lcy5wdXNoKHNvdXJjZVtpIC0gMV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCByZXN1bHRTdGFydExpbmVOdW1iZXIgPSAxO1xuXG5cdFx0Zm9yIChjb25zdCBbcmFuZ2UsIHN0YXRlXSBvZiBzdGF0ZXMpIHtcblx0XHRcdGlmIChzdGF0ZS5oYW5kbGVkLmdldCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0UmFuZ2UgPSB0aGlzLnJlc3VsdFRleHRNb2RlbERpZmZzLmdldFJlc3VsdExpbmVSYW5nZShyYW5nZS5iYXNlUmFuZ2UpO1xuXG5cdFx0XHRhcHBlbmRMaW5lc1RvUmVzdWx0KHJlc3VsdExpbmVzLCBNZXJnZUVkaXRvckxpbmVSYW5nZS5mcm9tTGluZU51bWJlcnMocmVzdWx0U3RhcnRMaW5lTnVtYmVyLCBNYXRoLm1heChyZXN1bHRTdGFydExpbmVOdW1iZXIsIHJlc3VsdFJhbmdlLnN0YXJ0TGluZU51bWJlcikpKTtcblx0XHRcdHJlc3VsdFN0YXJ0TGluZU51bWJlciA9IHJlc3VsdFJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cblx0XHRcdG91dHB1dExpbmVzLnB1c2goJzw8PDw8PDwnKTtcblx0XHRcdGlmIChzdGF0ZS5hY2NlcHRlZC5nZXQoKS5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC51bnJlY29nbml6ZWQpIHtcblx0XHRcdFx0Ly8gdG8gcHJldmVudCBsb3NzIG9mIGRhdGEsIHVzZSBtb2RpZmllZCByZXN1bHQgYXMgXCJvdXJzXCJcblx0XHRcdFx0YXBwZW5kTGluZXNUb1Jlc3VsdChyZXN1bHRMaW5lcywgcmVzdWx0UmFuZ2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXBwZW5kTGluZXNUb1Jlc3VsdChpbnB1dDFMaW5lcywgcmFuZ2UuaW5wdXQxUmFuZ2UpO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0TGluZXMucHVzaCgnPT09PT09PScpO1xuXHRcdFx0YXBwZW5kTGluZXNUb1Jlc3VsdChpbnB1dDJMaW5lcywgcmFuZ2UuaW5wdXQyUmFuZ2UpO1xuXHRcdFx0b3V0cHV0TGluZXMucHVzaCgnPj4+Pj4+PicpO1xuXHRcdH1cblxuXHRcdGFwcGVuZExpbmVzVG9SZXN1bHQocmVzdWx0TGluZXMsIE1lcmdlRWRpdG9yTGluZVJhbmdlLmZyb21MaW5lTnVtYmVycyhyZXN1bHRTdGFydExpbmVOdW1iZXIsIHJlc3VsdExpbmVzLmxlbmd0aCArIDEpKTtcblx0XHRyZXR1cm4gb3V0cHV0TGluZXMuam9pbignXFxuJyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvbmZsaWN0Q291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gYXJyYXlDb3VudCh0aGlzLm1vZGlmaWVkQmFzZVJhbmdlcy5nZXQoKSwgciA9PiByLmlzQ29uZmxpY3RpbmcpO1xuXHR9XG5cdHB1YmxpYyBnZXQgY29tYmluYWJsZUNvbmZsaWN0Q291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gYXJyYXlDb3VudCh0aGlzLm1vZGlmaWVkQmFzZVJhbmdlcy5nZXQoKSwgciA9PiByLmlzQ29uZmxpY3RpbmcgJiYgci5jYW5CZUNvbWJpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29uZmxpY3RzUmVzb2x2ZWRXaXRoQmFzZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBhcnJheUNvdW50KFxuXHRcdFx0dGhpcy5tb2RpZmllZEJhc2VSYW5nZVJlc3VsdFN0YXRlcy5nZXQoKS5lbnRyaWVzKCksXG5cdFx0XHQoW3IsIHNdKSA9PlxuXHRcdFx0XHRyLmlzQ29uZmxpY3RpbmcgJiZcblx0XHRcdFx0cy5hY2NlcHRlZC5nZXQoKS5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5iYXNlXG5cdFx0KTtcblx0fVxuXHRwdWJsaWMgZ2V0IGNvbmZsaWN0c1Jlc29sdmVkV2l0aElucHV0MSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBhcnJheUNvdW50KFxuXHRcdFx0dGhpcy5tb2RpZmllZEJhc2VSYW5nZVJlc3VsdFN0YXRlcy5nZXQoKS5lbnRyaWVzKCksXG5cdFx0XHQoW3IsIHNdKSA9PlxuXHRcdFx0XHRyLmlzQ29uZmxpY3RpbmcgJiZcblx0XHRcdFx0cy5hY2NlcHRlZC5nZXQoKS5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5pbnB1dDFcblx0XHQpO1xuXHR9XG5cdHB1YmxpYyBnZXQgY29uZmxpY3RzUmVzb2x2ZWRXaXRoSW5wdXQyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGFycmF5Q291bnQoXG5cdFx0XHR0aGlzLm1vZGlmaWVkQmFzZVJhbmdlUmVzdWx0U3RhdGVzLmdldCgpLmVudHJpZXMoKSxcblx0XHRcdChbciwgc10pID0+XG5cdFx0XHRcdHIuaXNDb25mbGljdGluZyAmJlxuXHRcdFx0XHRzLmFjY2VwdGVkLmdldCgpLmtpbmQgPT09IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLmlucHV0MlxuXHRcdCk7XG5cdH1cblx0cHVibGljIGdldCBjb25mbGljdHNSZXNvbHZlZFdpdGhTbWFydENvbWJpbmF0aW9uKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGFycmF5Q291bnQoXG5cdFx0XHR0aGlzLm1vZGlmaWVkQmFzZVJhbmdlUmVzdWx0U3RhdGVzLmdldCgpLmVudHJpZXMoKSxcblx0XHRcdChbciwgc106IFtNb2RpZmllZEJhc2VSYW5nZSwgTW9kaWZpZWRCYXNlUmFuZ2VEYXRhXSkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHMuYWNjZXB0ZWQuZ2V0KCk7XG5cdFx0XHRcdHJldHVybiByLmlzQ29uZmxpY3RpbmcgJiYgc3RhdGUua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuYm90aCAmJiBzdGF0ZS5zbWFydENvbWJpbmF0aW9uO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbE5vbmUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gYXJyYXlDb3VudChcblx0XHRcdHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMuZ2V0KCkuZW50cmllcygpLFxuXHRcdFx0KFtyLCBzXSkgPT5cblx0XHRcdFx0ci5pc0NvbmZsaWN0aW5nICYmXG5cdFx0XHRcdHMuYWNjZXB0ZWQuZ2V0KCkua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQudW5yZWNvZ25pemVkXG5cdFx0KTtcblx0fVxuXHRwdWJsaWMgZ2V0IG1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbFNtYXJ0Q29tYmluZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBhcnJheUNvdW50KFxuXHRcdFx0dGhpcy5tb2RpZmllZEJhc2VSYW5nZVJlc3VsdFN0YXRlcy5nZXQoKS5lbnRyaWVzKCksXG5cdFx0XHQoW3IsIHNdOiBbTW9kaWZpZWRCYXNlUmFuZ2UsIE1vZGlmaWVkQmFzZVJhbmdlRGF0YV0pID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBzLmFjY2VwdGVkLmdldCgpO1xuXHRcdFx0XHRyZXR1cm4gci5pc0NvbmZsaWN0aW5nICYmIHMuY29tcHV0ZWRGcm9tRGlmZmluZyAmJiBzdGF0ZS5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5ib3RoICYmIHN0YXRlLnNtYXJ0Q29tYmluYXRpb247XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXHRwdWJsaWMgZ2V0IG1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbElucHV0MSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBhcnJheUNvdW50KFxuXHRcdFx0dGhpcy5tb2RpZmllZEJhc2VSYW5nZVJlc3VsdFN0YXRlcy5nZXQoKS5lbnRyaWVzKCksXG5cdFx0XHQoW3IsIHNdOiBbTW9kaWZpZWRCYXNlUmFuZ2UsIE1vZGlmaWVkQmFzZVJhbmdlRGF0YV0pID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBzLmFjY2VwdGVkLmdldCgpO1xuXHRcdFx0XHRyZXR1cm4gci5pc0NvbmZsaWN0aW5nICYmIHMuY29tcHV0ZWRGcm9tRGlmZmluZyAmJiBzdGF0ZS5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5pbnB1dDE7XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXHRwdWJsaWMgZ2V0IG1hbnVhbGx5U29sdmVkQ29uZmxpY3RDb3VudFRoYXRFcXVhbElucHV0MigpOiBudW1iZXIge1xuXHRcdHJldHVybiBhcnJheUNvdW50KFxuXHRcdFx0dGhpcy5tb2RpZmllZEJhc2VSYW5nZVJlc3VsdFN0YXRlcy5nZXQoKS5lbnRyaWVzKCksXG5cdFx0XHQoW3IsIHNdOiBbTW9kaWZpZWRCYXNlUmFuZ2UsIE1vZGlmaWVkQmFzZVJhbmdlRGF0YV0pID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBzLmFjY2VwdGVkLmdldCgpO1xuXHRcdFx0XHRyZXR1cm4gci5pc0NvbmZsaWN0aW5nICYmIHMuY29tcHV0ZWRGcm9tRGlmZmluZyAmJiBzdGF0ZS5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5pbnB1dDI7XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbWFudWFsbHlTb2x2ZWRDb25mbGljdENvdW50VGhhdEVxdWFsTm9uZUFuZFN0YXJ0ZWRXaXRoQmFzZSgpOiBudW1iZXIge1xuXHRcdHJldHVybiBhcnJheUNvdW50KFxuXHRcdFx0dGhpcy5tb2RpZmllZEJhc2VSYW5nZVJlc3VsdFN0YXRlcy5nZXQoKS5lbnRyaWVzKCksXG5cdFx0XHQoW3IsIHNdOiBbTW9kaWZpZWRCYXNlUmFuZ2UsIE1vZGlmaWVkQmFzZVJhbmdlRGF0YV0pID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBzLmFjY2VwdGVkLmdldCgpO1xuXHRcdFx0XHRyZXR1cm4gci5pc0NvbmZsaWN0aW5nICYmIHN0YXRlLmtpbmQgPT09IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLnVucmVjb2duaXplZCAmJiBzLnByZXZpb3VzTm9uRGlmZmluZ1N0YXRlPy5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC5iYXNlO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblx0cHVibGljIGdldCBtYW51YWxseVNvbHZlZENvbmZsaWN0Q291bnRUaGF0RXF1YWxOb25lQW5kU3RhcnRlZFdpdGhJbnB1dDEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gYXJyYXlDb3VudChcblx0XHRcdHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMuZ2V0KCkuZW50cmllcygpLFxuXHRcdFx0KFtyLCBzXTogW01vZGlmaWVkQmFzZVJhbmdlLCBNb2RpZmllZEJhc2VSYW5nZURhdGFdKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gcy5hY2NlcHRlZC5nZXQoKTtcblx0XHRcdFx0cmV0dXJuIHIuaXNDb25mbGljdGluZyAmJiBzdGF0ZS5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC51bnJlY29nbml6ZWQgJiYgcy5wcmV2aW91c05vbkRpZmZpbmdTdGF0ZT8ua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuaW5wdXQxO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblx0cHVibGljIGdldCBtYW51YWxseVNvbHZlZENvbmZsaWN0Q291bnRUaGF0RXF1YWxOb25lQW5kU3RhcnRlZFdpdGhJbnB1dDIoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gYXJyYXlDb3VudChcblx0XHRcdHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMuZ2V0KCkuZW50cmllcygpLFxuXHRcdFx0KFtyLCBzXTogW01vZGlmaWVkQmFzZVJhbmdlLCBNb2RpZmllZEJhc2VSYW5nZURhdGFdKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gcy5hY2NlcHRlZC5nZXQoKTtcblx0XHRcdFx0cmV0dXJuIHIuaXNDb25mbGljdGluZyAmJiBzdGF0ZS5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC51bnJlY29nbml6ZWQgJiYgcy5wcmV2aW91c05vbkRpZmZpbmdTdGF0ZT8ua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuaW5wdXQyO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblx0cHVibGljIGdldCBtYW51YWxseVNvbHZlZENvbmZsaWN0Q291bnRUaGF0RXF1YWxOb25lQW5kU3RhcnRlZFdpdGhCb3RoTm9uU21hcnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gYXJyYXlDb3VudChcblx0XHRcdHRoaXMubW9kaWZpZWRCYXNlUmFuZ2VSZXN1bHRTdGF0ZXMuZ2V0KCkuZW50cmllcygpLFxuXHRcdFx0KFtyLCBzXTogW01vZGlmaWVkQmFzZVJhbmdlLCBNb2RpZmllZEJhc2VSYW5nZURhdGFdKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gcy5hY2NlcHRlZC5nZXQoKTtcblx0XHRcdFx0cmV0dXJuIHIuaXNDb25mbGljdGluZyAmJiBzdGF0ZS5raW5kID09PSBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZC51bnJlY29nbml6ZWQgJiYgcy5wcmV2aW91c05vbkRpZmZpbmdTdGF0ZT8ua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuYm90aCAmJiAhcy5wcmV2aW91c05vbkRpZmZpbmdTdGF0ZT8uc21hcnRDb21iaW5hdGlvbjtcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cdHB1YmxpYyBnZXQgbWFudWFsbHlTb2x2ZWRDb25mbGljdENvdW50VGhhdEVxdWFsTm9uZUFuZFN0YXJ0ZWRXaXRoQm90aFNtYXJ0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGFycmF5Q291bnQoXG5cdFx0XHR0aGlzLm1vZGlmaWVkQmFzZVJhbmdlUmVzdWx0U3RhdGVzLmdldCgpLmVudHJpZXMoKSxcblx0XHRcdChbciwgc106IFtNb2RpZmllZEJhc2VSYW5nZSwgTW9kaWZpZWRCYXNlUmFuZ2VEYXRhXSkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHMuYWNjZXB0ZWQuZ2V0KCk7XG5cdFx0XHRcdHJldHVybiByLmlzQ29uZmxpY3RpbmcgJiYgc3RhdGUua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQudW5yZWNvZ25pemVkICYmIHMucHJldmlvdXNOb25EaWZmaW5nU3RhdGU/LmtpbmQgPT09IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLmJvdGggJiYgcy5wcmV2aW91c05vbkRpZmZpbmdTdGF0ZT8uc21hcnRDb21iaW5hdGlvbjtcblx0XHRcdH1cblx0XHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFycmF5Q291bnQ8VD4oYXJyYXk6IEl0ZXJhYmxlPFQ+LCBwcmVkaWNhdGU6ICh2YWx1ZTogVCkgPT4gYm9vbGVhbik6IG51bWJlciB7XG5cdGxldCBjb3VudCA9IDA7XG5cdGZvciAoY29uc3QgdmFsdWUgb2YgYXJyYXkpIHtcblx0XHRpZiAocHJlZGljYXRlKHZhbHVlKSkge1xuXHRcdFx0Y291bnQrKztcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNvdW50O1xufVxuXG5jbGFzcyBNb2RpZmllZEJhc2VSYW5nZURhdGEge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGJhc2VSYW5nZTogTW9kaWZpZWRCYXNlUmFuZ2UpIHtcblx0XHR0aGlzLmFjY2VwdGVkID0gb2JzZXJ2YWJsZVZhbHVlKGBCYXNlUmFuZ2VTdGF0ZSR7dGhpcy5iYXNlUmFuZ2UuYmFzZVJhbmdlfWAsIE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUuYmFzZSk7XG5cdFx0dGhpcy5oYW5kbGVkSW5wdXQxID0gb2JzZXJ2YWJsZVZhbHVlKGBCYXNlUmFuZ2VIYW5kbGVkU3RhdGUke3RoaXMuYmFzZVJhbmdlLmJhc2VSYW5nZX0uSW5wdXQxYCwgZmFsc2UpO1xuXHRcdHRoaXMuaGFuZGxlZElucHV0MiA9IG9ic2VydmFibGVWYWx1ZShgQmFzZVJhbmdlSGFuZGxlZFN0YXRlJHt0aGlzLmJhc2VSYW5nZS5iYXNlUmFuZ2V9LklucHV0MmAsIGZhbHNlKTtcblx0XHR0aGlzLmNvbXB1dGVkRnJvbURpZmZpbmcgPSBmYWxzZTtcblx0XHR0aGlzLnByZXZpb3VzTm9uRGlmZmluZ1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuaGFuZGxlZCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuaGFuZGxlZElucHV0MS5yZWFkKHJlYWRlcikgJiYgdGhpcy5oYW5kbGVkSW5wdXQyLnJlYWQocmVhZGVyKSk7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0ZWQ6IElTZXR0YWJsZU9ic2VydmFibGU8TW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZT47XG5cdHB1YmxpYyBoYW5kbGVkSW5wdXQxOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRwdWJsaWMgaGFuZGxlZElucHV0MjogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRwdWJsaWMgY29tcHV0ZWRGcm9tRGlmZmluZztcblx0cHVibGljIHByZXZpb3VzTm9uRGlmZmluZ1N0YXRlOiBNb2RpZmllZEJhc2VSYW5nZVN0YXRlIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyByZWFkb25seSBoYW5kbGVkO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBNZXJnZUVkaXRvck1vZGVsU3RhdGUge1xuXHRpbml0aWFsaXppbmcgPSAxLFxuXHR1cFRvRGF0ZSA9IDIsXG5cdHVwZGF0aW5nID0gMyxcbn1cblxuY2xhc3MgTWFya0FzSGFuZGxlZFVuZG9SZWRvRWxlbWVudCBpbXBsZW1lbnRzIElSZXNvdXJjZVVuZG9SZWRvRWxlbWVudCB7XG5cdHB1YmxpYyByZWFkb25seSBjb2RlID0gJ3VuZG9NYXJrQXNIYW5kbGVkJztcblx0cHVibGljIHJlYWRvbmx5IGxhYmVsID0gbG9jYWxpemUoJ3VuZG9NYXJrQXNIYW5kbGVkJywgJ1VuZG8gTWFyayBBcyBIYW5kbGVkJyk7XG5cblx0cHVibGljIHJlYWRvbmx5IHR5cGUgPSBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWVyZ2VFZGl0b3JNb2RlbFJlZjogV2Vha1JlZjxNZXJnZUVkaXRvck1vZGVsPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0YXRlUmVmOiBXZWFrUmVmPE1vZGlmaWVkQmFzZVJhbmdlRGF0YT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBpbnB1dDFIYW5kbGVkOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5wdXQySGFuZGxlZDogYm9vbGVhbixcblx0KSB7IH1cblxuXHRwdWJsaWMgcmVkbygpIHtcblx0XHRjb25zdCBtZXJnZUVkaXRvck1vZGVsID0gdGhpcy5tZXJnZUVkaXRvck1vZGVsUmVmLmRlcmVmKCk7XG5cdFx0aWYgKCFtZXJnZUVkaXRvck1vZGVsIHx8IG1lcmdlRWRpdG9yTW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZVJlZi5kZXJlZigpO1xuXHRcdGlmICghc3RhdGUpIHsgcmV0dXJuOyB9XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0c3RhdGUuaGFuZGxlZElucHV0MS5zZXQodHJ1ZSwgdHgpO1xuXHRcdFx0c3RhdGUuaGFuZGxlZElucHV0Mi5zZXQodHJ1ZSwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cdHB1YmxpYyB1bmRvKCkge1xuXHRcdGNvbnN0IG1lcmdlRWRpdG9yTW9kZWwgPSB0aGlzLm1lcmdlRWRpdG9yTW9kZWxSZWYuZGVyZWYoKTtcblx0XHRpZiAoIW1lcmdlRWRpdG9yTW9kZWwgfHwgbWVyZ2VFZGl0b3JNb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnN0YXRlUmVmLmRlcmVmKCk7XG5cdFx0aWYgKCFzdGF0ZSkgeyByZXR1cm47IH1cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRzdGF0ZS5oYW5kbGVkSW5wdXQxLnNldCh0aGlzLmlucHV0MUhhbmRsZWQsIHR4KTtcblx0XHRcdHN0YXRlLmhhbmRsZWRJbnB1dDIuc2V0KHRoaXMuaW5wdXQySGFuZGxlZCwgdHgpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZSxjQUFjO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCLFNBQWtFLGNBQWMsaUJBQWlCLGFBQWEsb0JBQW9CO0FBRWpLLFNBQVMsYUFBYTtBQUN0QixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFtQyxrQkFBa0IscUJBQXFCLHFCQUFxQjtBQUMvRixTQUFTLG1CQUFt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O0FBQ3JHLFNBQUssc0JBQXNCO0FBQzNCLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssVUFBVSxRQUFRLE1BQU0sWUFBVSxLQUFLLGNBQWMsS0FBSyxNQUFNLEtBQUssS0FBSyxjQUFjLEtBQUssTUFBTSxDQUFDO0FBQUEsRUFDMUc7QUFVRDtBQUVPLElBQVcsd0JBQVgsa0JBQVdDLDJCQUFYO0FBQ04sRUFBQUEsOENBQUEsa0JBQWUsS0FBZjtBQUNBLEVBQUFBLDhDQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLDhDQUFBLGNBQVcsS0FBWDtBQUhpQixTQUFBQTtBQUFBLEdBQUE7QUFNbEIsTUFBTSw2QkFBaUU7QUFBQSxFQU10RSxZQUNpQixVQUNDLHFCQUNBLFVBQ0EsZUFDQSxlQUNoQjtBQUxlO0FBQ0M7QUFDQTtBQUNBO0FBQ0E7QUFWbEIsU0FBZ0IsT0FBTztBQUN2QixTQUFnQixRQUFRLFNBQVMscUJBQXFCLHNCQUFzQjtBQUU1RSxTQUFnQixPQUFPLG9CQUFvQjtBQUFBLEVBUXZDO0FBQUEsRUFFRyxPQUFPO0FBQ2IsVUFBTSxtQkFBbUIsS0FBSyxvQkFBb0IsTUFBTTtBQUN4RCxRQUFJLENBQUMsb0JBQW9CLGlCQUFpQixXQUFXLEdBQUc7QUFDdkQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLEtBQUssU0FBUyxNQUFNO0FBQ2xDLFFBQUksQ0FBQyxPQUFPO0FBQUU7QUFBQSxJQUFRO0FBQ3RCLGdCQUFZLFFBQU07QUFDakIsWUFBTSxjQUFjLElBQUksTUFBTSxFQUFFO0FBQ2hDLFlBQU0sY0FBYyxJQUFJLE1BQU0sRUFBRTtBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFDTyxPQUFPO0FBQ2IsVUFBTSxtQkFBbUIsS0FBSyxvQkFBb0IsTUFBTTtBQUN4RCxRQUFJLENBQUMsb0JBQW9CLGlCQUFpQixXQUFXLEdBQUc7QUFDdkQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLEtBQUssU0FBUyxNQUFNO0FBQ2xDLFFBQUksQ0FBQyxPQUFPO0FBQUU7QUFBQSxJQUFRO0FBQ3RCLGdCQUFZLFFBQU07QUFDakIsWUFBTSxjQUFjLElBQUksS0FBSyxlQUFlLEVBQUU7QUFDOUMsWUFBTSxjQUFjLElBQUksS0FBSyxlQUFlLEVBQUU7QUFBQSxJQUMvQyxDQUFDO0FBQUEsRUFDRjtBQUNEOyIsCiAgIm5hbWVzIjogWyJ0eCIsICJNZXJnZUVkaXRvck1vZGVsU3RhdGUiXQp9Cg==
