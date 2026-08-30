import { BugIndicatingError } from "../../../../../base/common/errors.js";
import { observableSignal, observableValue } from "../../../../../base/common/observable.js";
import { commonPrefixLength, commonSuffixLength, splitLines } from "../../../../../base/common/strings.js";
import { applyEditsToRanges, StringEdit, StringReplacement } from "../../../../common/core/edits/stringEdit.js";
import { TextEdit, TextReplacement } from "../../../../common/core/edits/textEdit.js";
import { Range } from "../../../../common/core/range.js";
import { OffsetRange } from "../../../../common/core/ranges/offsetRange.js";
import { StringText } from "../../../../common/core/text/abstractText.js";
import { getPositionOffsetTransformerFromTextModel } from "../../../../common/core/text/getPositionOffsetTransformerFromTextModel.js";
import { TextLength } from "../../../../common/core/text/textLength.js";
import { linesDiffComputers } from "../../../../common/diff/linesDiffComputers.js";
import { InlineCompletionTriggerKind } from "../../../../common/languages.js";
import { TextModelText } from "../../../../common/model/textModelText.js";
import { computeEditKind } from "./editKind.js";
import { inlineCompletionIsVisible } from "./inlineCompletionIsVisible.js";
import { InlineSuggestData } from "./provideInlineCompletions.js";
import { InlineSuggestAlternativeAction } from "./InlineSuggestAlternativeAction.js";
import { TextModelValueReference } from "./textModelValueReference.js";
var InlineSuggestionItem;
((InlineSuggestionItem2) => {
  function create(data, textModel, shouldDiffEdit = true) {
    if (!data.isInlineEdit && !data.action?.uri && data.action?.kind === "edit") {
      return InlineCompletionItem.create(data, textModel, data.action);
    } else {
      return InlineEditItem.create(data, textModel, shouldDiffEdit);
    }
  }
  InlineSuggestionItem2.create = create;
})(InlineSuggestionItem || (InlineSuggestionItem = {}));
function hashInlineSuggestionAction(action) {
  const obj = action?.kind === "edit" ? {
    ...action,
    alternativeAction: InlineSuggestAlternativeAction.toString(action.alternativeAction),
    target: action?.target.uri.toString()
  } : {
    ...action,
    target: action?.target.uri.toString()
  };
  return JSON.stringify(obj);
}
class InlineSuggestionItemBase {
  constructor(_data, identity, hint, originalTextRef) {
    this._data = _data;
    this.identity = identity;
    this.hint = hint;
    this.originalTextRef = originalTextRef;
  }
  /**
   * A reference to the original inline completion list this inline completion has been constructed from.
   * Used for event data to ensure referential equality.
  */
  get source() {
    return this._data.source;
  }
  get isFromExplicitRequest() {
    return this._data.context.triggerKind === InlineCompletionTriggerKind.Explicit;
  }
  get forwardStable() {
    return this.source.inlineSuggestions.enableForwardStability ?? false;
  }
  get targetRange() {
    if (this.hint) {
      return this.hint.range;
    }
    if (this.action?.kind === "edit") {
      return this.action.textReplacement.range;
    } else if (this.action?.kind === "jumpTo") {
      return Range.fromPositions(this.action.position);
    }
    throw new BugIndicatingError("InlineSuggestionItem: Either hint or action must be set");
  }
  get semanticId() {
    return this.hash;
  }
  get gutterMenuLinkAction() {
    return this._sourceInlineCompletion.gutterMenuLinkAction;
  }
  get command() {
    return this._sourceInlineCompletion.command;
  }
  get supportsRename() {
    return this._data.supportsRename;
  }
  get warning() {
    return this._sourceInlineCompletion.warning;
  }
  get showInlineEditMenu() {
    return !!this._sourceInlineCompletion.showInlineEditMenu;
  }
  get hash() {
    return hashInlineSuggestionAction(this.action);
  }
  /** @deprecated */
  get shownCommand() {
    return this._sourceInlineCompletion.shownCommand;
  }
  get requestUuid() {
    return this._data.context.requestUuid;
  }
  get partialAccepts() {
    return this._data.partialAccepts;
  }
  /**
   * A reference to the original inline completion this inline completion has been constructed from.
   * Used for event data to ensure referential equality.
  */
  get _sourceInlineCompletion() {
    return this._data.sourceInlineCompletion;
  }
  addRef() {
    this.identity.addRef();
    this.source.addRef();
  }
  removeRef() {
    this.identity.removeRef();
    this.source.removeRef();
  }
  reportInlineEditShown(commandService, viewKind, viewData, model, timeWhenShown) {
    const insertText = this.action?.kind === "edit" ? this.action.textReplacement.text : "";
    this._data.reportInlineEditShown(commandService, insertText, viewKind, viewData, this.computeEditKind(model), timeWhenShown);
  }
  reportPartialAccept(acceptedCharacters, info, partialAcceptance) {
    this._data.reportPartialAccept(acceptedCharacters, info, partialAcceptance);
  }
  reportEndOfLife(reason) {
    this._data.reportEndOfLife(reason);
  }
  setEndOfLifeReason(reason) {
    this._data.setEndOfLifeReason(reason);
  }
  setIsPreceeded(item) {
    this._data.setIsPreceeded(item.partialAccepts);
  }
  setNotShownReasonIfNotSet(reason) {
    this._data.setNotShownReason(reason);
  }
  /**
   * Avoid using this method. Instead introduce getters for the needed properties.
  */
  getSourceCompletion() {
    return this._sourceInlineCompletion;
  }
  setRenameProcessingInfo(info) {
    this._data.setRenameProcessingInfo(info);
  }
  withAction(action) {
    return this._data.withAction(action);
  }
  addPerformanceMarker(marker) {
    this._data.addPerformanceMarker(marker);
  }
}
const _InlineSuggestionIdentity = class _InlineSuggestionIdentity {
  constructor() {
    this._onDispose = observableSignal(this);
    this.onDispose = this._onDispose;
    this._jumpedTo = observableValue(this, false);
    this._refCount = 0;
    this.id = "InlineCompletionIdentity" + _InlineSuggestionIdentity.idCounter++;
  }
  get jumpedTo() {
    return this._jumpedTo;
  }
  addRef() {
    this._refCount++;
  }
  removeRef() {
    this._refCount--;
    if (this._refCount === 0) {
      this._onDispose.trigger(void 0);
    }
  }
  setJumpTo(tx) {
    this._jumpedTo.set(true, tx);
  }
};
_InlineSuggestionIdentity.idCounter = 0;
let InlineSuggestionIdentity = _InlineSuggestionIdentity;
class InlineSuggestHint {
  constructor(range, content, style) {
    this.range = range;
    this.content = content;
    this.style = style;
  }
  static create(hint) {
    return new InlineSuggestHint(
      Range.lift(hint.range),
      hint.content,
      hint.style
    );
  }
  withEdit(edit, positionOffsetTransformer) {
    const offsetRange = new OffsetRange(
      positionOffsetTransformer.getOffset(this.range.getStartPosition()),
      positionOffsetTransformer.getOffset(this.range.getEndPosition())
    );
    const newOffsetRange = applyEditsToRanges([offsetRange], edit)[0];
    if (!newOffsetRange) {
      return void 0;
    }
    const newRange = positionOffsetTransformer.getRange(newOffsetRange);
    return new InlineSuggestHint(newRange, this.content, this.style);
  }
}
class InlineCompletionItem extends InlineSuggestionItemBase {
  constructor(_edit, _trimmedEdit, _textEdit, _originalRange, snippetInfo, additionalTextEdits, data, identity, displayLocation, originalTextRef) {
    super(data, identity, displayLocation, originalTextRef);
    this._edit = _edit;
    this._trimmedEdit = _trimmedEdit;
    this._textEdit = _textEdit;
    this._originalRange = _originalRange;
    this.snippetInfo = snippetInfo;
    this.additionalTextEdits = additionalTextEdits;
    this.isInlineEdit = false;
  }
  static create(data, textModel, action) {
    const identity = new InlineSuggestionIdentity();
    const transformer = textModel.getTransformer();
    const insertText = action.insertText.replace(/\r\n|\r|\n/g, textModel.getEOL());
    const edit = reshapeInlineCompletion(new StringReplacement(transformer.getOffsetRange(action.range), insertText), textModel);
    const trimmedEdit = edit.removeCommonSuffixAndPrefix(textModel.getValue());
    const textEdit = transformer.getTextReplacement(edit);
    const displayLocation = data.hint ? InlineSuggestHint.create(data.hint) : void 0;
    return new InlineCompletionItem(edit, trimmedEdit, textEdit, textEdit.range, action.snippetInfo, data.additionalTextEdits, data, identity, displayLocation, textModel);
  }
  get action() {
    return {
      kind: "edit",
      textReplacement: this.getSingleTextEdit(),
      snippetInfo: this.snippetInfo,
      stringEdit: new StringEdit([this._trimmedEdit]),
      alternativeAction: void 0,
      target: this.originalTextRef
    };
  }
  get hash() {
    return JSON.stringify(this._trimmedEdit.toJson());
  }
  getSingleTextEdit() {
    return this._textEdit;
  }
  withIdentity(identity) {
    return new InlineCompletionItem(
      this._edit,
      this._trimmedEdit,
      this._textEdit,
      this._originalRange,
      this.snippetInfo,
      this.additionalTextEdits,
      this._data,
      identity,
      this.hint,
      this.originalTextRef
    );
  }
  withEdit(textModelEdit, textModel) {
    if (!this.originalTextRef.targets(textModel)) {
      return this;
    }
    const newEditRange = applyEditsToRanges([this._edit.replaceRange], textModelEdit);
    if (newEditRange.length === 0) {
      return void 0;
    }
    const newEdit = new StringReplacement(newEditRange[0], this._textEdit.text);
    const positionOffsetTransformer = getPositionOffsetTransformerFromTextModel(textModel);
    const newTextEdit = positionOffsetTransformer.getTextReplacement(newEdit);
    let newDisplayLocation = this.hint;
    if (newDisplayLocation) {
      newDisplayLocation = newDisplayLocation.withEdit(textModelEdit, positionOffsetTransformer);
      if (!newDisplayLocation) {
        return void 0;
      }
    }
    const trimmedEdit = newEdit.removeCommonSuffixAndPrefix(textModel.getValue());
    return new InlineCompletionItem(
      newEdit,
      trimmedEdit,
      newTextEdit,
      this._originalRange,
      this.snippetInfo,
      this.additionalTextEdits,
      this._data,
      this.identity,
      newDisplayLocation,
      this.originalTextRef
    );
  }
  canBeReused(model, position) {
    const updatedRange = this._textEdit.range;
    const result = !!updatedRange && updatedRange.containsPosition(position) && this.isVisible(model, position) && TextLength.ofRange(updatedRange).isGreaterThanOrEqualTo(TextLength.ofRange(this._originalRange));
    return result;
  }
  isVisible(model, cursorPosition) {
    const singleTextEdit = this.getSingleTextEdit();
    return inlineCompletionIsVisible(singleTextEdit, this._originalRange, model, cursorPosition);
  }
  computeEditKind(model) {
    return computeEditKind(new StringEdit([this._edit]), model);
  }
  get editRange() {
    return this.getSingleTextEdit().range;
  }
  get insertText() {
    return this.getSingleTextEdit().text;
  }
}
class InlineEditItem extends InlineSuggestionItemBase {
  constructor(_action, data, identity, _edits, hint, _lastChangePartOfInlineEdit = false, _inlineEditModelVersion, originalTextRef) {
    super(data, identity, hint, originalTextRef);
    this._action = _action;
    this._edits = _edits;
    this._lastChangePartOfInlineEdit = _lastChangePartOfInlineEdit;
    this._inlineEditModelVersion = _inlineEditModelVersion;
    this.snippetInfo = void 0;
    this.additionalTextEdits = [];
    this.isInlineEdit = true;
  }
  static createForTest(textModel, range, newText) {
    const action = {
      kind: "edit",
      snippetInfo: void 0,
      insertText: newText,
      range,
      uri: textModel.uri,
      alternativeAction: void 0
    };
    return InlineEditItem.create(InlineSuggestData.createForTest(action, textModel.uri), textModel);
  }
  static create(data, textModel, shouldDiffEdit = true) {
    let action;
    let edits = [];
    if (data.action?.kind === "edit") {
      const offsetEdit = shouldDiffEdit ? getDiffedStringEdit(textModel, data.action.range, data.action.insertText) : getStringEdit(textModel, data.action.range, data.action.insertText);
      const textEdit = TextEdit.fromStringEdit(offsetEdit, textModel);
      const singleTextEdit = offsetEdit.isEmpty() ? new TextReplacement(new Range(1, 1, 1, 1), "") : textEdit.toReplacement(textModel);
      edits = offsetEdit.replacements.map((edit) => {
        const replacedRange = Range.fromPositions(textModel.getPositionAt(edit.replaceRange.start), textModel.getTransformer().getPosition(edit.replaceRange.endExclusive));
        const replacedText = textModel.getValueInRange(replacedRange);
        return SingleUpdatedNextEdit.create(edit, replacedText);
      });
      action = {
        kind: "edit",
        snippetInfo: data.action.snippetInfo,
        stringEdit: offsetEdit,
        textReplacement: singleTextEdit,
        alternativeAction: data.action.alternativeAction,
        target: textModel
      };
    } else if (data.action?.kind === "jumpTo") {
      action = {
        kind: "jumpTo",
        position: data.action.position,
        offset: textModel.getTransformer().getOffset(data.action.position),
        target: textModel
      };
    } else {
      action = void 0;
      if (!data.hint) {
        throw new BugIndicatingError("InlineEditItem: action is undefined and no hint is provided");
      }
    }
    const identity = new InlineSuggestionIdentity();
    const hint = data.hint ? InlineSuggestHint.create(data.hint) : void 0;
    return new InlineEditItem(action, data, identity, edits, hint, false, textModel.getVersionId(), textModel);
  }
  get updatedEditModelVersion() {
    return this._inlineEditModelVersion;
  }
  // public get updatedEdit(): StringEdit { return this._edit; }
  get action() {
    return this._action;
  }
  withIdentity(identity) {
    return new InlineEditItem(
      this._action,
      this._data,
      identity,
      this._edits,
      this.hint,
      this._lastChangePartOfInlineEdit,
      this._inlineEditModelVersion,
      this.originalTextRef
    );
  }
  canBeReused(model, position) {
    return this._lastChangePartOfInlineEdit && this.updatedEditModelVersion === model.getVersionId();
  }
  withEdit(textModelChanges, textModel) {
    if (!this.originalTextRef.targets(textModel)) {
      return this;
    }
    const edit = this._applyTextModelChanges(textModelChanges, this._edits, textModel);
    return edit;
  }
  _applyTextModelChanges(textModelChanges, edits, textModel) {
    const positionOffsetTransformer = getPositionOffsetTransformerFromTextModel(textModel);
    let lastChangePartOfInlineEdit = false;
    let inlineEditModelVersion = this._inlineEditModelVersion;
    let newAction;
    const updatedTarget = TextModelValueReference.snapshot(textModel);
    if (this.action?.kind === "edit") {
      edits = edits.map((innerEdit) => innerEdit.applyTextModelChanges(textModelChanges));
      if (edits.some((edit) => edit.edit === void 0)) {
        return void 0;
      }
      const newTextModelVersion = textModel.getVersionId();
      lastChangePartOfInlineEdit = edits.some((edit) => edit.lastChangeUpdatedEdit);
      if (lastChangePartOfInlineEdit) {
        inlineEditModelVersion = newTextModelVersion ?? -1;
      }
      if (newTextModelVersion === null || inlineEditModelVersion + 20 < newTextModelVersion) {
        return void 0;
      }
      edits = edits.filter((innerEdit) => !innerEdit.edit.isEmpty);
      if (edits.length === 0) {
        return void 0;
      }
      const newEdit = new StringEdit(edits.map((edit) => edit.edit));
      const newTextEdit = positionOffsetTransformer.getTextEdit(newEdit).toReplacement(new TextModelText(textModel));
      newAction = {
        kind: "edit",
        textReplacement: newTextEdit,
        snippetInfo: this.snippetInfo,
        stringEdit: newEdit,
        alternativeAction: this.action.alternativeAction,
        target: updatedTarget
      };
    } else if (this.action?.kind === "jumpTo") {
      const jumpToOffset = this.action.offset;
      const newJumpToOffset = textModelChanges.applyToOffsetOrUndefined(jumpToOffset);
      if (newJumpToOffset === void 0) {
        return void 0;
      }
      const newJumpToPosition = positionOffsetTransformer.getPosition(newJumpToOffset);
      newAction = {
        kind: "jumpTo",
        position: newJumpToPosition,
        offset: newJumpToOffset,
        target: updatedTarget
      };
    } else {
      newAction = void 0;
    }
    let newDisplayLocation = this.hint;
    if (newDisplayLocation) {
      newDisplayLocation = newDisplayLocation.withEdit(textModelChanges, positionOffsetTransformer);
      if (!newDisplayLocation) {
        return void 0;
      }
    }
    return new InlineEditItem(
      newAction,
      this._data,
      this.identity,
      edits,
      newDisplayLocation,
      lastChangePartOfInlineEdit,
      inlineEditModelVersion,
      updatedTarget
    );
  }
  computeEditKind(model) {
    const edit = this.action?.kind === "edit" ? this.action.stringEdit : void 0;
    if (!edit) {
      return void 0;
    }
    return computeEditKind(edit, model);
  }
}
function getDiffedStringEdit(textModel, editRange, replaceText) {
  const eol = textModel.getEOL();
  const editOriginalText = textModel.getValueOfRange(editRange);
  const editReplaceText = replaceText.replace(/\r\n|\r|\n/g, eol);
  const diffAlgorithm = linesDiffComputers.getDefault();
  const lineDiffs = diffAlgorithm.computeDiff(
    splitLines(editOriginalText),
    splitLines(editReplaceText),
    {
      ignoreTrimWhitespace: false,
      computeMoves: false,
      extendToSubwords: true,
      maxComputationTimeMs: 50
    }
  );
  const innerChanges = lineDiffs.changes.flatMap((c) => c.innerChanges ?? []);
  function addRangeToPos(pos, range) {
    const start = TextLength.fromPosition(range.getStartPosition());
    return TextLength.ofRange(range).createRange(start.addToPosition(pos));
  }
  const modifiedText = new StringText(editReplaceText);
  const offsetEdit = new StringEdit(
    innerChanges.map((c) => {
      const rangeInModel = addRangeToPos(editRange.getStartPosition(), c.originalRange);
      const originalRange = textModel.getTransformer().getOffsetRange(rangeInModel);
      const replaceText2 = modifiedText.getValueOfRange(c.modifiedRange);
      const edit = new StringReplacement(originalRange, replaceText2);
      const originalText = textModel.getValueOfRange(rangeInModel);
      return reshapeInlineEdit(edit, originalText, innerChanges.length, textModel);
    })
  );
  return offsetEdit;
}
function getStringEdit(textModel, editRange, replaceText) {
  return new StringEdit([new StringReplacement(
    textModel.getTransformer().getOffsetRange(editRange),
    replaceText
  )]);
}
class SingleUpdatedNextEdit {
  constructor(_edit, _trimmedNewText, _prefixLength, _suffixLength, _lastChangeUpdatedEdit = false) {
    this._edit = _edit;
    this._trimmedNewText = _trimmedNewText;
    this._prefixLength = _prefixLength;
    this._suffixLength = _suffixLength;
    this._lastChangeUpdatedEdit = _lastChangeUpdatedEdit;
  }
  static create(edit, replacedText) {
    const prefixLength = commonPrefixLength(edit.newText, replacedText);
    const suffixLength = commonSuffixLength(edit.newText, replacedText);
    const trimmedNewText = edit.newText.substring(prefixLength, edit.newText.length - suffixLength);
    return new SingleUpdatedNextEdit(edit, trimmedNewText, prefixLength, suffixLength);
  }
  get edit() {
    return this._edit;
  }
  get lastChangeUpdatedEdit() {
    return this._lastChangeUpdatedEdit;
  }
  applyTextModelChanges(textModelChanges) {
    const c = this._clone();
    c._applyTextModelChanges(textModelChanges);
    return c;
  }
  _clone() {
    return new SingleUpdatedNextEdit(
      this._edit,
      this._trimmedNewText,
      this._prefixLength,
      this._suffixLength,
      this._lastChangeUpdatedEdit
    );
  }
  _applyTextModelChanges(textModelChanges) {
    this._lastChangeUpdatedEdit = false;
    if (!this._edit) {
      throw new BugIndicatingError("UpdatedInnerEdits: No edit to apply changes to");
    }
    const result = this._applyChanges(this._edit, textModelChanges);
    if (!result) {
      this._edit = void 0;
      return;
    }
    this._edit = result.edit;
    this._lastChangeUpdatedEdit = result.editHasChanged;
  }
  _applyChanges(edit, textModelChanges) {
    let editStart = edit.replaceRange.start;
    let editEnd = edit.replaceRange.endExclusive;
    let editReplaceText = edit.newText;
    let editHasChanged = false;
    const shouldPreserveEditShape = this._prefixLength > 0 || this._suffixLength > 0;
    for (let i = textModelChanges.replacements.length - 1; i >= 0; i--) {
      const change = textModelChanges.replacements[i];
      const isInsertion = change.newText.length > 0 && change.replaceRange.isEmpty;
      if (isInsertion && !shouldPreserveEditShape && change.replaceRange.start === editStart && editReplaceText.startsWith(change.newText)) {
        editStart += change.newText.length;
        editReplaceText = editReplaceText.substring(change.newText.length);
        editEnd += change.newText.length;
        editHasChanged = true;
        continue;
      }
      if (isInsertion && shouldPreserveEditShape && change.replaceRange.start === editStart + this._prefixLength && this._trimmedNewText.startsWith(change.newText)) {
        editEnd += change.newText.length;
        editHasChanged = true;
        this._prefixLength += change.newText.length;
        this._trimmedNewText = this._trimmedNewText.substring(change.newText.length);
        continue;
      }
      const isDeletion = change.newText.length === 0 && change.replaceRange.length > 0;
      if (isDeletion && change.replaceRange.start >= editStart + this._prefixLength && change.replaceRange.endExclusive <= editEnd - this._suffixLength) {
        editEnd -= change.replaceRange.length;
        editHasChanged = true;
        continue;
      }
      if (change.equals(edit)) {
        editHasChanged = true;
        editStart = change.replaceRange.endExclusive;
        editReplaceText = "";
        continue;
      }
      if (change.replaceRange.start > editEnd) {
        continue;
      }
      if (change.replaceRange.endExclusive < editStart) {
        editStart += change.newText.length - change.replaceRange.length;
        editEnd += change.newText.length - change.replaceRange.length;
        continue;
      }
      return void 0;
    }
    if (this._trimmedNewText.length === 0 && editStart + this._prefixLength === editEnd - this._suffixLength) {
      return { edit: new StringReplacement(new OffsetRange(editStart + this._prefixLength, editStart + this._prefixLength), ""), editHasChanged: true };
    }
    return { edit: new StringReplacement(new OffsetRange(editStart, editEnd), editReplaceText), editHasChanged };
  }
}
function reshapeInlineCompletion(edit, textModel) {
  const eol = textModel.getEOL();
  if (edit.replaceRange.isEmpty && edit.newText.includes(eol)) {
    edit = reshapeMultiLineInsertion(edit, textModel);
  }
  return edit;
}
function reshapeInlineEdit(edit, originalText, totalInnerEdits, textModel) {
  const eol = textModel.getEOL();
  if (edit.newText.endsWith(eol) && originalText.endsWith(eol)) {
    edit = new StringReplacement(edit.replaceRange.deltaEnd(-eol.length), edit.newText.slice(0, -eol.length));
  }
  if (totalInnerEdits === 1 && edit.replaceRange.isEmpty && edit.newText.includes(eol)) {
    const startPosition = textModel.getTransformer().getPosition(edit.replaceRange.start);
    const hasTextOnInsertionLine = textModel.getLineLength(startPosition.lineNumber) !== 0;
    if (hasTextOnInsertionLine) {
      edit = reshapeMultiLineInsertion(edit, textModel);
    }
  }
  if (totalInnerEdits === 1) {
    const prefixLength = commonPrefixLength(originalText, edit.newText);
    const suffixLength = commonSuffixLength(originalText.slice(prefixLength), edit.newText.slice(prefixLength));
    if (prefixLength + suffixLength === originalText.length) {
      return new StringReplacement(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), edit.newText.substring(prefixLength, edit.newText.length - suffixLength));
    }
    if (prefixLength + suffixLength === edit.newText.length) {
      return new StringReplacement(edit.replaceRange.deltaStart(prefixLength).deltaEnd(-suffixLength), "");
    }
  }
  return edit;
}
function reshapeMultiLineInsertion(edit, textModel) {
  if (!edit.replaceRange.isEmpty) {
    throw new BugIndicatingError("Unexpected original range");
  }
  if (edit.replaceRange.start === 0) {
    return edit;
  }
  const eol = textModel.getEOL();
  const startPosition = textModel.getTransformer().getPosition(edit.replaceRange.start);
  const startColumn = startPosition.column;
  const startLineNumber = startPosition.lineNumber;
  if (startColumn === 1 && startLineNumber > 1 && edit.newText.endsWith(eol) && !edit.newText.startsWith(eol)) {
    return new StringReplacement(edit.replaceRange.delta(-1), eol + edit.newText.slice(0, -eol.length));
  }
  return edit;
}
export {
  InlineCompletionItem,
  InlineEditItem,
  InlineSuggestHint,
  InlineSuggestionIdentity,
  InlineSuggestionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxtb2RlbFxcaW5saW5lU3VnZ2VzdGlvbkl0ZW0udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIElUcmFuc2FjdGlvbiwgb2JzZXJ2YWJsZVNpZ25hbCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBjb21tb25QcmVmaXhMZW5ndGgsIGNvbW1vblN1ZmZpeExlbmd0aCwgc3BsaXRMaW5lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBhcHBseUVkaXRzVG9SYW5nZXMsIFN0cmluZ0VkaXQsIFN0cmluZ1JlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvc3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCwgVGV4dFJlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFN0cmluZ1RleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS90ZXh0L2Fic3RyYWN0VGV4dC5qcyc7XG5pbXBvcnQgeyBnZXRQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyRnJvbVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3RleHQvZ2V0UG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lckZyb21UZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgUG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lckJhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS90ZXh0L3Bvc2l0aW9uVG9PZmZzZXQuanMnO1xuaW1wb3J0IHsgVGV4dExlbmd0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3RleHQvdGV4dExlbmd0aC5qcyc7XG5pbXBvcnQgeyBsaW5lc0RpZmZDb21wdXRlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZGlmZi9saW5lc0RpZmZDb21wdXRlcnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZCwgSUlubGluZUNvbXBsZXRpb25IaW50LCBJbmxpbmVDb21wbGV0aW9uLCBJbmxpbmVDb21wbGV0aW9uRW5kT2ZMaWZlUmVhc29uLCBJbmxpbmVDb21wbGV0aW9uSGludFN0eWxlLCBJbmxpbmVDb21wbGV0aW9uVHJpZ2dlcktpbmQsIElubGluZUNvbXBsZXRpb25XYXJuaW5nLCBQYXJ0aWFsQWNjZXB0SW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbFRleHQuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvblZpZXdEYXRhLCBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQgfSBmcm9tICcuLi92aWV3L2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlRWRpdEtpbmQsIElubGluZVN1Z2dlc3Rpb25FZGl0S2luZCB9IGZyb20gJy4vZWRpdEtpbmQuanMnO1xuaW1wb3J0IHsgaW5saW5lQ29tcGxldGlvbklzVmlzaWJsZSB9IGZyb20gJy4vaW5saW5lQ29tcGxldGlvbklzVmlzaWJsZS5qcyc7XG5pbXBvcnQgeyBJSW5saW5lU3VnZ2VzdERhdGFBY3Rpb24sIElJbmxpbmVTdWdnZXN0RGF0YUFjdGlvbkVkaXQsIElubGluZVN1Z2dlc3REYXRhLCBJbmxpbmVTdWdnZXN0aW9uTGlzdCwgUGFydGlhbEFjY2VwdGFuY2UsIFJlbmFtZUluZm8sIFNuaXBwZXRJbmZvIH0gZnJvbSAnLi9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdEFsdGVybmF0aXZlQWN0aW9uIH0gZnJvbSAnLi9JbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24uanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UgfSBmcm9tICcuL3RleHRNb2RlbFZhbHVlUmVmZXJlbmNlLmpzJztcblxuZXhwb3J0IHR5cGUgSW5saW5lU3VnZ2VzdGlvbkl0ZW0gPSBJbmxpbmVFZGl0SXRlbSB8IElubGluZUNvbXBsZXRpb25JdGVtO1xuXG5leHBvcnQgbmFtZXNwYWNlIElubGluZVN1Z2dlc3Rpb25JdGVtIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZShcblx0XHRkYXRhOiBJbmxpbmVTdWdnZXN0RGF0YSxcblx0XHR0ZXh0TW9kZWw6IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlLFxuXHRcdHNob3VsZERpZmZFZGl0OiBib29sZWFuID0gdHJ1ZSwgLy8gVE9ET0BiZW5pYmVuaiBpdCBzaG91bGQgb25seSBiZSBjcmVhdGVkIG9uY2UgYW5kIGhlbmNlIG5vdCBtZWVkZWQgdG8gYmUgcGFzc2VkIGhlcmVcblx0KTogSW5saW5lU3VnZ2VzdGlvbkl0ZW0ge1xuXHRcdGlmICghZGF0YS5pc0lubGluZUVkaXQgJiYgIWRhdGEuYWN0aW9uPy51cmkgJiYgZGF0YS5hY3Rpb24/LmtpbmQgPT09ICdlZGl0Jykge1xuXHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25JdGVtLmNyZWF0ZShkYXRhLCB0ZXh0TW9kZWwsIGRhdGEuYWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIElubGluZUVkaXRJdGVtLmNyZWF0ZShkYXRhLCB0ZXh0TW9kZWwsIHNob3VsZERpZmZFZGl0KTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgSW5saW5lU3VnZ2VzdGlvbkFjdGlvbiA9IElJbmxpbmVTdWdnZXN0aW9uQWN0aW9uRWRpdCB8IElJbmxpbmVTdWdnZXN0aW9uQWN0aW9uSnVtcFRvO1xuXG5leHBvcnQgaW50ZXJmYWNlIElJbmxpbmVTdWdnZXN0aW9uQWN0aW9uRWRpdCB7XG5cdGtpbmQ6ICdlZGl0Jztcblx0dGV4dFJlcGxhY2VtZW50OiBUZXh0UmVwbGFjZW1lbnQ7XG5cdHNuaXBwZXRJbmZvOiBTbmlwcGV0SW5mbyB8IHVuZGVmaW5lZDtcblx0c3RyaW5nRWRpdDogU3RyaW5nRWRpdDtcblx0dGFyZ2V0OiBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZTtcblx0YWx0ZXJuYXRpdmVBY3Rpb246IElubGluZVN1Z2dlc3RBbHRlcm5hdGl2ZUFjdGlvbiB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5saW5lU3VnZ2VzdGlvbkFjdGlvbkp1bXBUbyB7XG5cdGtpbmQ6ICdqdW1wVG8nO1xuXHRwb3NpdGlvbjogUG9zaXRpb247XG5cdG9mZnNldDogbnVtYmVyO1xuXHR0YXJnZXQ6IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlO1xufVxuXG5mdW5jdGlvbiBoYXNoSW5saW5lU3VnZ2VzdGlvbkFjdGlvbihhY3Rpb246IElubGluZVN1Z2dlc3Rpb25BY3Rpb24gfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRjb25zdCBvYmogPSBhY3Rpb24/LmtpbmQgPT09ICdlZGl0JyA/IHtcblx0XHQuLi5hY3Rpb24sIGFsdGVybmF0aXZlQWN0aW9uOiBJbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24udG9TdHJpbmcoYWN0aW9uLmFsdGVybmF0aXZlQWN0aW9uKSxcblx0XHR0YXJnZXQ6IGFjdGlvbj8udGFyZ2V0LnVyaS50b1N0cmluZygpLFxuXHR9IDoge1xuXHRcdC4uLmFjdGlvbixcblx0XHR0YXJnZXQ6IGFjdGlvbj8udGFyZ2V0LnVyaS50b1N0cmluZygpLFxuXHR9O1xuXG5cdHJldHVybiBKU09OLnN0cmluZ2lmeShvYmopO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBJbmxpbmVTdWdnZXN0aW9uSXRlbUJhc2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2RhdGE6IElubGluZVN1Z2dlc3REYXRhLFxuXHRcdHB1YmxpYyByZWFkb25seSBpZGVudGl0eTogSW5saW5lU3VnZ2VzdGlvbklkZW50aXR5LFxuXHRcdHB1YmxpYyByZWFkb25seSBoaW50OiBJbmxpbmVTdWdnZXN0SGludCB8IHVuZGVmaW5lZCxcblx0XHQvKipcblx0XHQgKiBSZWZlcmVuY2UgdG8gdGhlIHRleHQgbW9kZWwgdGhpcyBpdGVtIHRhcmdldHMuXG5cdFx0ICogRm9yIGNyb3NzLWZpbGUgZWRpdHMsIHRoaXMgbWF5IGRpZmZlciBmcm9tIHRoZSBjdXJyZW50IGVkaXRvcidzIG1vZGVsLlxuXHRcdCAqL1xuXHRcdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbFRleHRSZWY6IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlLFxuXHQpIHtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBnZXQgYWN0aW9uKCk6IElubGluZVN1Z2dlc3Rpb25BY3Rpb24gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEEgcmVmZXJlbmNlIHRvIHRoZSBvcmlnaW5hbCBpbmxpbmUgY29tcGxldGlvbiBsaXN0IHRoaXMgaW5saW5lIGNvbXBsZXRpb24gaGFzIGJlZW4gY29uc3RydWN0ZWQgZnJvbS5cblx0ICogVXNlZCBmb3IgZXZlbnQgZGF0YSB0byBlbnN1cmUgcmVmZXJlbnRpYWwgZXF1YWxpdHkuXG5cdCovXG5cdHB1YmxpYyBnZXQgc291cmNlKCk6IElubGluZVN1Z2dlc3Rpb25MaXN0IHsgcmV0dXJuIHRoaXMuX2RhdGEuc291cmNlOyB9XG5cblx0cHVibGljIGdldCBpc0Zyb21FeHBsaWNpdFJlcXVlc3QoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9kYXRhLmNvbnRleHQudHJpZ2dlcktpbmQgPT09IElubGluZUNvbXBsZXRpb25UcmlnZ2VyS2luZC5FeHBsaWNpdDsgfVxuXHRwdWJsaWMgZ2V0IGZvcndhcmRTdGFibGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnNvdXJjZS5pbmxpbmVTdWdnZXN0aW9ucy5lbmFibGVGb3J3YXJkU3RhYmlsaXR5ID8/IGZhbHNlOyB9XG5cblx0cHVibGljIGdldCB0YXJnZXRSYW5nZSgpOiBSYW5nZSB7XG5cdFx0aWYgKHRoaXMuaGludCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaGludC5yYW5nZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYWN0aW9uPy5raW5kID09PSAnZWRpdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmFjdGlvbi50ZXh0UmVwbGFjZW1lbnQucmFuZ2U7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmFjdGlvbj8ua2luZCA9PT0gJ2p1bXBUbycpIHtcblx0XHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKHRoaXMuYWN0aW9uLnBvc2l0aW9uKTtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignSW5saW5lU3VnZ2VzdGlvbkl0ZW06IEVpdGhlciBoaW50IG9yIGFjdGlvbiBtdXN0IGJlIHNldCcpO1xuXHR9XG5cblx0cHVibGljIGdldCBzZW1hbnRpY0lkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLmhhc2g7IH1cblx0cHVibGljIGdldCBndXR0ZXJNZW51TGlua0FjdGlvbigpOiBDb21tYW5kIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NvdXJjZUlubGluZUNvbXBsZXRpb24uZ3V0dGVyTWVudUxpbmtBY3Rpb247IH1cblx0cHVibGljIGdldCBjb21tYW5kKCk6IENvbW1hbmQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc291cmNlSW5saW5lQ29tcGxldGlvbi5jb21tYW5kOyB9XG5cdHB1YmxpYyBnZXQgc3VwcG9ydHNSZW5hbWUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9kYXRhLnN1cHBvcnRzUmVuYW1lOyB9XG5cdHB1YmxpYyBnZXQgd2FybmluZygpOiBJbmxpbmVDb21wbGV0aW9uV2FybmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9zb3VyY2VJbmxpbmVDb21wbGV0aW9uLndhcm5pbmc7IH1cblx0cHVibGljIGdldCBzaG93SW5saW5lRWRpdE1lbnUoKTogYm9vbGVhbiB7IHJldHVybiAhIXRoaXMuX3NvdXJjZUlubGluZUNvbXBsZXRpb24uc2hvd0lubGluZUVkaXRNZW51OyB9XG5cdHB1YmxpYyBnZXQgaGFzaCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBoYXNoSW5saW5lU3VnZ2VzdGlvbkFjdGlvbih0aGlzLmFjdGlvbik7XG5cdH1cblx0LyoqIEBkZXByZWNhdGVkICovXG5cdHB1YmxpYyBnZXQgc2hvd25Db21tYW5kKCk6IENvbW1hbmQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc291cmNlSW5saW5lQ29tcGxldGlvbi5zaG93bkNvbW1hbmQ7IH1cblxuXHRwdWJsaWMgZ2V0IHJlcXVlc3RVdWlkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9kYXRhLmNvbnRleHQucmVxdWVzdFV1aWQ7IH1cblxuXHRwdWJsaWMgZ2V0IHBhcnRpYWxBY2NlcHRzKCk6IFBhcnRpYWxBY2NlcHRhbmNlIHsgcmV0dXJuIHRoaXMuX2RhdGEucGFydGlhbEFjY2VwdHM7IH1cblxuXHQvKipcblx0ICogQSByZWZlcmVuY2UgdG8gdGhlIG9yaWdpbmFsIGlubGluZSBjb21wbGV0aW9uIHRoaXMgaW5saW5lIGNvbXBsZXRpb24gaGFzIGJlZW4gY29uc3RydWN0ZWQgZnJvbS5cblx0ICogVXNlZCBmb3IgZXZlbnQgZGF0YSB0byBlbnN1cmUgcmVmZXJlbnRpYWwgZXF1YWxpdHkuXG5cdCovXG5cdHByaXZhdGUgZ2V0IF9zb3VyY2VJbmxpbmVDb21wbGV0aW9uKCk6IElubGluZUNvbXBsZXRpb24geyByZXR1cm4gdGhpcy5fZGF0YS5zb3VyY2VJbmxpbmVDb21wbGV0aW9uOyB9XG5cblxuXHRwdWJsaWMgYWJzdHJhY3Qgd2l0aEVkaXQodXNlckVkaXQ6IFN0cmluZ0VkaXQsIHRleHRNb2RlbDogSVRleHRNb2RlbCk6IElubGluZVN1Z2dlc3Rpb25JdGVtIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBhYnN0cmFjdCB3aXRoSWRlbnRpdHkoaWRlbnRpdHk6IElubGluZVN1Z2dlc3Rpb25JZGVudGl0eSk6IElubGluZVN1Z2dlc3Rpb25JdGVtO1xuXHRwdWJsaWMgYWJzdHJhY3QgY2FuQmVSZXVzZWQobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbik6IGJvb2xlYW47XG5cblx0cHVibGljIGFic3RyYWN0IGNvbXB1dGVFZGl0S2luZChtb2RlbDogSVRleHRNb2RlbCk6IElubGluZVN1Z2dlc3Rpb25FZGl0S2luZCB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgYWRkUmVmKCk6IHZvaWQge1xuXHRcdHRoaXMuaWRlbnRpdHkuYWRkUmVmKCk7XG5cdFx0dGhpcy5zb3VyY2UuYWRkUmVmKCk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlUmVmKCk6IHZvaWQge1xuXHRcdHRoaXMuaWRlbnRpdHkucmVtb3ZlUmVmKCk7XG5cdFx0dGhpcy5zb3VyY2UucmVtb3ZlUmVmKCk7XG5cdH1cblxuXHRwdWJsaWMgcmVwb3J0SW5saW5lRWRpdFNob3duKGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsIHZpZXdLaW5kOiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQsIHZpZXdEYXRhOiBJbmxpbmVDb21wbGV0aW9uVmlld0RhdGEsIG1vZGVsOiBJVGV4dE1vZGVsLCB0aW1lV2hlblNob3duOiBudW1iZXIpIHtcblx0XHRjb25zdCBpbnNlcnRUZXh0ID0gdGhpcy5hY3Rpb24/LmtpbmQgPT09ICdlZGl0JyA/IHRoaXMuYWN0aW9uLnRleHRSZXBsYWNlbWVudC50ZXh0IDogJyc7IC8vIFRPRE9AaGVkaWV0IHN1cHBvcnQgaW5zZXJ0VGV4dCA9PT0gdW5kZWZpbmVkXG5cdFx0dGhpcy5fZGF0YS5yZXBvcnRJbmxpbmVFZGl0U2hvd24oY29tbWFuZFNlcnZpY2UsIGluc2VydFRleHQsIHZpZXdLaW5kLCB2aWV3RGF0YSwgdGhpcy5jb21wdXRlRWRpdEtpbmQobW9kZWwpLCB0aW1lV2hlblNob3duKTtcblx0fVxuXG5cdHB1YmxpYyByZXBvcnRQYXJ0aWFsQWNjZXB0KGFjY2VwdGVkQ2hhcmFjdGVyczogbnVtYmVyLCBpbmZvOiBQYXJ0aWFsQWNjZXB0SW5mbywgcGFydGlhbEFjY2VwdGFuY2U6IFBhcnRpYWxBY2NlcHRhbmNlKSB7XG5cdFx0dGhpcy5fZGF0YS5yZXBvcnRQYXJ0aWFsQWNjZXB0KGFjY2VwdGVkQ2hhcmFjdGVycywgaW5mbywgcGFydGlhbEFjY2VwdGFuY2UpO1xuXHR9XG5cblx0cHVibGljIHJlcG9ydEVuZE9mTGlmZShyZWFzb246IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb24pOiB2b2lkIHtcblx0XHR0aGlzLl9kYXRhLnJlcG9ydEVuZE9mTGlmZShyZWFzb24pO1xuXHR9XG5cblx0cHVibGljIHNldEVuZE9mTGlmZVJlYXNvbihyZWFzb246IElubGluZUNvbXBsZXRpb25FbmRPZkxpZmVSZWFzb24pOiB2b2lkIHtcblx0XHR0aGlzLl9kYXRhLnNldEVuZE9mTGlmZVJlYXNvbihyZWFzb24pO1xuXHR9XG5cblx0cHVibGljIHNldElzUHJlY2VlZGVkKGl0ZW06IElubGluZVN1Z2dlc3Rpb25JdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5fZGF0YS5zZXRJc1ByZWNlZWRlZChpdGVtLnBhcnRpYWxBY2NlcHRzKTtcblx0fVxuXG5cdHB1YmxpYyBzZXROb3RTaG93blJlYXNvbklmTm90U2V0KHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZGF0YS5zZXROb3RTaG93blJlYXNvbihyZWFzb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEF2b2lkIHVzaW5nIHRoaXMgbWV0aG9kLiBJbnN0ZWFkIGludHJvZHVjZSBnZXR0ZXJzIGZvciB0aGUgbmVlZGVkIHByb3BlcnRpZXMuXG5cdCovXG5cdHB1YmxpYyBnZXRTb3VyY2VDb21wbGV0aW9uKCk6IElubGluZUNvbXBsZXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2VJbmxpbmVDb21wbGV0aW9uO1xuXHR9XG5cblx0cHVibGljIHNldFJlbmFtZVByb2Nlc3NpbmdJbmZvKGluZm86IFJlbmFtZUluZm8pOiB2b2lkIHtcblx0XHR0aGlzLl9kYXRhLnNldFJlbmFtZVByb2Nlc3NpbmdJbmZvKGluZm8pO1xuXHR9XG5cblx0cHVibGljIHdpdGhBY3Rpb24oYWN0aW9uOiBJSW5saW5lU3VnZ2VzdERhdGFBY3Rpb24pOiBJbmxpbmVTdWdnZXN0RGF0YSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGEud2l0aEFjdGlvbihhY3Rpb24pO1xuXHR9XG5cblx0cHVibGljIGFkZFBlcmZvcm1hbmNlTWFya2VyKG1hcmtlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZGF0YS5hZGRQZXJmb3JtYW5jZU1hcmtlcihtYXJrZXIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHkge1xuXHRwcml2YXRlIHN0YXRpYyBpZENvdW50ZXIgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpc3Bvc2UgPSBvYnNlcnZhYmxlU2lnbmFsKHRoaXMpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaXNwb3NlOiBJT2JzZXJ2YWJsZTx2b2lkPiA9IHRoaXMuX29uRGlzcG9zZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9qdW1wZWRUbyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHB1YmxpYyBnZXQganVtcGVkVG8oKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9qdW1wZWRUbztcblx0fVxuXG5cdHByaXZhdGUgX3JlZkNvdW50ID0gMDtcblx0cHVibGljIHJlYWRvbmx5IGlkID0gJ0lubGluZUNvbXBsZXRpb25JZGVudGl0eScgKyBJbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHkuaWRDb3VudGVyKys7XG5cblx0YWRkUmVmKCkge1xuXHRcdHRoaXMuX3JlZkNvdW50Kys7XG5cdH1cblxuXHRyZW1vdmVSZWYoKSB7XG5cdFx0dGhpcy5fcmVmQ291bnQtLTtcblx0XHRpZiAodGhpcy5fcmVmQ291bnQgPT09IDApIHtcblx0XHRcdHRoaXMuX29uRGlzcG9zZS50cmlnZ2VyKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0SnVtcFRvKHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9qdW1wZWRUby5zZXQodHJ1ZSwgdHgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVTdWdnZXN0SGludCB7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUoaGludDogSUlubGluZUNvbXBsZXRpb25IaW50KSB7XG5cdFx0cmV0dXJuIG5ldyBJbmxpbmVTdWdnZXN0SGludChcblx0XHRcdFJhbmdlLmxpZnQoaGludC5yYW5nZSksXG5cdFx0XHRoaW50LmNvbnRlbnQsXG5cdFx0XHRoaW50LnN0eWxlLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByYW5nZTogUmFuZ2UsXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvbnRlbnQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3R5bGU6IElubGluZUNvbXBsZXRpb25IaW50U3R5bGUsXG5cdCkgeyB9XG5cblx0cHVibGljIHdpdGhFZGl0KGVkaXQ6IFN0cmluZ0VkaXQsIHBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXI6IFBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXJCYXNlKTogSW5saW5lU3VnZ2VzdEhpbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG9mZnNldFJhbmdlID0gbmV3IE9mZnNldFJhbmdlKFxuXHRcdFx0cG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lci5nZXRPZmZzZXQodGhpcy5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpLFxuXHRcdFx0cG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lci5nZXRPZmZzZXQodGhpcy5yYW5nZS5nZXRFbmRQb3NpdGlvbigpKVxuXHRcdCk7XG5cblx0XHRjb25zdCBuZXdPZmZzZXRSYW5nZSA9IGFwcGx5RWRpdHNUb1Jhbmdlcyhbb2Zmc2V0UmFuZ2VdLCBlZGl0KVswXTtcblx0XHRpZiAoIW5ld09mZnNldFJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1JhbmdlID0gcG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lci5nZXRSYW5nZShuZXdPZmZzZXRSYW5nZSk7XG5cblx0XHRyZXR1cm4gbmV3IElubGluZVN1Z2dlc3RIaW50KG5ld1JhbmdlLCB0aGlzLmNvbnRlbnQsIHRoaXMuc3R5bGUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVDb21wbGV0aW9uSXRlbSBleHRlbmRzIElubGluZVN1Z2dlc3Rpb25JdGVtQmFzZSB7XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKFxuXHRcdGRhdGE6IElubGluZVN1Z2dlc3REYXRhLFxuXHRcdHRleHRNb2RlbDogVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UsXG5cdFx0YWN0aW9uOiBJSW5saW5lU3VnZ2VzdERhdGFBY3Rpb25FZGl0LFxuXHQpOiBJbmxpbmVDb21wbGV0aW9uSXRlbSB7XG5cdFx0Y29uc3QgaWRlbnRpdHkgPSBuZXcgSW5saW5lU3VnZ2VzdGlvbklkZW50aXR5KCk7XG5cdFx0Y29uc3QgdHJhbnNmb3JtZXIgPSB0ZXh0TW9kZWwuZ2V0VHJhbnNmb3JtZXIoKTtcblxuXHRcdGNvbnN0IGluc2VydFRleHQgPSBhY3Rpb24uaW5zZXJ0VGV4dC5yZXBsYWNlKC9cXHJcXG58XFxyfFxcbi9nLCB0ZXh0TW9kZWwuZ2V0RU9MKCkpO1xuXG5cdFx0Y29uc3QgZWRpdCA9IHJlc2hhcGVJbmxpbmVDb21wbGV0aW9uKG5ldyBTdHJpbmdSZXBsYWNlbWVudCh0cmFuc2Zvcm1lci5nZXRPZmZzZXRSYW5nZShhY3Rpb24ucmFuZ2UpLCBpbnNlcnRUZXh0KSwgdGV4dE1vZGVsKTtcblx0XHRjb25zdCB0cmltbWVkRWRpdCA9IGVkaXQucmVtb3ZlQ29tbW9uU3VmZml4QW5kUHJlZml4KHRleHRNb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHRjb25zdCB0ZXh0RWRpdCA9IHRyYW5zZm9ybWVyLmdldFRleHRSZXBsYWNlbWVudChlZGl0KTtcblxuXHRcdGNvbnN0IGRpc3BsYXlMb2NhdGlvbiA9IGRhdGEuaGludCA/IElubGluZVN1Z2dlc3RIaW50LmNyZWF0ZShkYXRhLmhpbnQpIDogdW5kZWZpbmVkO1xuXG5cdFx0cmV0dXJuIG5ldyBJbmxpbmVDb21wbGV0aW9uSXRlbShlZGl0LCB0cmltbWVkRWRpdCwgdGV4dEVkaXQsIHRleHRFZGl0LnJhbmdlLCBhY3Rpb24uc25pcHBldEluZm8sIGRhdGEuYWRkaXRpb25hbFRleHRFZGl0cywgZGF0YSwgaWRlbnRpdHksIGRpc3BsYXlMb2NhdGlvbiwgdGV4dE1vZGVsKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBpc0lubGluZUVkaXQgPSBmYWxzZTtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXQ6IFN0cmluZ1JlcGxhY2VtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RyaW1tZWRFZGl0OiBTdHJpbmdSZXBsYWNlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXh0RWRpdDogVGV4dFJlcGxhY2VtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsUmFuZ2U6IFJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSBzbmlwcGV0SW5mbzogU25pcHBldEluZm8gfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFkZGl0aW9uYWxUZXh0RWRpdHM6IHJlYWRvbmx5IElTaW5nbGVFZGl0T3BlcmF0aW9uW10sXG5cblx0XHRkYXRhOiBJbmxpbmVTdWdnZXN0RGF0YSxcblx0XHRpZGVudGl0eTogSW5saW5lU3VnZ2VzdGlvbklkZW50aXR5LFxuXHRcdGRpc3BsYXlMb2NhdGlvbjogSW5saW5lU3VnZ2VzdEhpbnQgfCB1bmRlZmluZWQsXG5cdFx0b3JpZ2luYWxUZXh0UmVmOiBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZSxcblx0KSB7XG5cdFx0c3VwZXIoZGF0YSwgaWRlbnRpdHksIGRpc3BsYXlMb2NhdGlvbiwgb3JpZ2luYWxUZXh0UmVmKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBhY3Rpb24oKTogSUlubGluZVN1Z2dlc3Rpb25BY3Rpb25FZGl0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2VkaXQnLFxuXHRcdFx0dGV4dFJlcGxhY2VtZW50OiB0aGlzLmdldFNpbmdsZVRleHRFZGl0KCksXG5cdFx0XHRzbmlwcGV0SW5mbzogdGhpcy5zbmlwcGV0SW5mbyxcblx0XHRcdHN0cmluZ0VkaXQ6IG5ldyBTdHJpbmdFZGl0KFt0aGlzLl90cmltbWVkRWRpdF0pLFxuXHRcdFx0YWx0ZXJuYXRpdmVBY3Rpb246IHVuZGVmaW5lZCxcblx0XHRcdHRhcmdldDogdGhpcy5vcmlnaW5hbFRleHRSZWYsXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBoYXNoKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHRoaXMuX3RyaW1tZWRFZGl0LnRvSnNvbigpKTtcblx0fVxuXG5cdGdldFNpbmdsZVRleHRFZGl0KCk6IFRleHRSZXBsYWNlbWVudCB7IHJldHVybiB0aGlzLl90ZXh0RWRpdDsgfVxuXG5cdG92ZXJyaWRlIHdpdGhJZGVudGl0eShpZGVudGl0eTogSW5saW5lU3VnZ2VzdGlvbklkZW50aXR5KTogSW5saW5lQ29tcGxldGlvbkl0ZW0ge1xuXHRcdHJldHVybiBuZXcgSW5saW5lQ29tcGxldGlvbkl0ZW0oXG5cdFx0XHR0aGlzLl9lZGl0LFxuXHRcdFx0dGhpcy5fdHJpbW1lZEVkaXQsXG5cdFx0XHR0aGlzLl90ZXh0RWRpdCxcblx0XHRcdHRoaXMuX29yaWdpbmFsUmFuZ2UsXG5cdFx0XHR0aGlzLnNuaXBwZXRJbmZvLFxuXHRcdFx0dGhpcy5hZGRpdGlvbmFsVGV4dEVkaXRzLFxuXHRcdFx0dGhpcy5fZGF0YSxcblx0XHRcdGlkZW50aXR5LFxuXHRcdFx0dGhpcy5oaW50LFxuXHRcdFx0dGhpcy5vcmlnaW5hbFRleHRSZWZcblx0XHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgd2l0aEVkaXQodGV4dE1vZGVsRWRpdDogU3RyaW5nRWRpdCwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsKTogSW5saW5lQ29tcGxldGlvbkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdC8vIElmIHRoZSBlZGl0IGlzIHRvIGEgZGlmZmVyZW50IG1vZGVsIHRoYW4gb3VyIHRhcmdldCwgaXQncyBhIG5vb3Bcblx0XHRpZiAoIXRoaXMub3JpZ2luYWxUZXh0UmVmLnRhcmdldHModGV4dE1vZGVsKSkge1xuXHRcdFx0cmV0dXJuIHRoaXM7ICAvLyB1bmNoYW5nZWRcblx0XHR9XG5cblx0XHRjb25zdCBuZXdFZGl0UmFuZ2UgPSBhcHBseUVkaXRzVG9SYW5nZXMoW3RoaXMuX2VkaXQucmVwbGFjZVJhbmdlXSwgdGV4dE1vZGVsRWRpdCk7XG5cdFx0aWYgKG5ld0VkaXRSYW5nZS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG5ld0VkaXQgPSBuZXcgU3RyaW5nUmVwbGFjZW1lbnQobmV3RWRpdFJhbmdlWzBdLCB0aGlzLl90ZXh0RWRpdC50ZXh0KTtcblx0XHRjb25zdCBwb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyID0gZ2V0UG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lckZyb21UZXh0TW9kZWwodGV4dE1vZGVsKTtcblx0XHRjb25zdCBuZXdUZXh0RWRpdCA9IHBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXIuZ2V0VGV4dFJlcGxhY2VtZW50KG5ld0VkaXQpO1xuXG5cdFx0bGV0IG5ld0Rpc3BsYXlMb2NhdGlvbiA9IHRoaXMuaGludDtcblx0XHRpZiAobmV3RGlzcGxheUxvY2F0aW9uKSB7XG5cdFx0XHRuZXdEaXNwbGF5TG9jYXRpb24gPSBuZXdEaXNwbGF5TG9jYXRpb24ud2l0aEVkaXQodGV4dE1vZGVsRWRpdCwgcG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lcik7XG5cdFx0XHRpZiAoIW5ld0Rpc3BsYXlMb2NhdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHRyaW1tZWRFZGl0ID0gbmV3RWRpdC5yZW1vdmVDb21tb25TdWZmaXhBbmRQcmVmaXgodGV4dE1vZGVsLmdldFZhbHVlKCkpO1xuXG5cdFx0cmV0dXJuIG5ldyBJbmxpbmVDb21wbGV0aW9uSXRlbShcblx0XHRcdG5ld0VkaXQsXG5cdFx0XHR0cmltbWVkRWRpdCxcblx0XHRcdG5ld1RleHRFZGl0LFxuXHRcdFx0dGhpcy5fb3JpZ2luYWxSYW5nZSxcblx0XHRcdHRoaXMuc25pcHBldEluZm8sXG5cdFx0XHR0aGlzLmFkZGl0aW9uYWxUZXh0RWRpdHMsXG5cdFx0XHR0aGlzLl9kYXRhLFxuXHRcdFx0dGhpcy5pZGVudGl0eSxcblx0XHRcdG5ld0Rpc3BsYXlMb2NhdGlvbixcblx0XHRcdHRoaXMub3JpZ2luYWxUZXh0UmVmXG5cdFx0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGNhbkJlUmV1c2VkKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHQvLyBUT0RPQGhlZGlldCBJIGJlbGlldmUgdGhpcyBjYW4gYmUgc2ltcGxpZmllZCB0byBgcmV0dXJuIHRydWU7YCwgYXMgYXBwbHlpbmcgYW4gZWRpdCBzaG91bGQga2ljayBvdXQgdGhpcyBzdWdnZXN0aW9uLlxuXHRcdGNvbnN0IHVwZGF0ZWRSYW5nZSA9IHRoaXMuX3RleHRFZGl0LnJhbmdlO1xuXHRcdGNvbnN0IHJlc3VsdCA9ICEhdXBkYXRlZFJhbmdlXG5cdFx0XHQmJiB1cGRhdGVkUmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbilcblx0XHRcdCYmIHRoaXMuaXNWaXNpYmxlKG1vZGVsLCBwb3NpdGlvbilcblx0XHRcdCYmIFRleHRMZW5ndGgub2ZSYW5nZSh1cGRhdGVkUmFuZ2UpLmlzR3JlYXRlclRoYW5PckVxdWFsVG8oVGV4dExlbmd0aC5vZlJhbmdlKHRoaXMuX29yaWdpbmFsUmFuZ2UpKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGlzVmlzaWJsZShtb2RlbDogSVRleHRNb2RlbCwgY3Vyc29yUG9zaXRpb246IFBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2luZ2xlVGV4dEVkaXQgPSB0aGlzLmdldFNpbmdsZVRleHRFZGl0KCk7XG5cdFx0cmV0dXJuIGlubGluZUNvbXBsZXRpb25Jc1Zpc2libGUoc2luZ2xlVGV4dEVkaXQsIHRoaXMuX29yaWdpbmFsUmFuZ2UsIG1vZGVsLCBjdXJzb3JQb3NpdGlvbik7XG5cdH1cblxuXHRvdmVycmlkZSBjb21wdXRlRWRpdEtpbmQobW9kZWw6IElUZXh0TW9kZWwpOiBJbmxpbmVTdWdnZXN0aW9uRWRpdEtpbmQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBjb21wdXRlRWRpdEtpbmQobmV3IFN0cmluZ0VkaXQoW3RoaXMuX2VkaXRdKSwgbW9kZWwpO1xuXHR9XG5cblx0cHVibGljIGdldCBlZGl0UmFuZ2UoKTogUmFuZ2UgeyByZXR1cm4gdGhpcy5nZXRTaW5nbGVUZXh0RWRpdCgpLnJhbmdlOyB9XG5cdHB1YmxpYyBnZXQgaW5zZXJ0VGV4dCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5nZXRTaW5nbGVUZXh0RWRpdCgpLnRleHQ7IH1cbn1cblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRJdGVtIGV4dGVuZHMgSW5saW5lU3VnZ2VzdGlvbkl0ZW1CYXNlIHtcblx0cHVibGljIHN0YXRpYyBjcmVhdGVGb3JUZXN0KFxuXHRcdHRleHRNb2RlbDogVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UsXG5cdFx0cmFuZ2U6IFJhbmdlLFxuXHRcdG5ld1RleHQ6IHN0cmluZyxcblx0KTogSW5saW5lRWRpdEl0ZW0ge1xuXHRcdGNvbnN0IGFjdGlvbjogSUlubGluZVN1Z2dlc3REYXRhQWN0aW9uID0ge1xuXHRcdFx0a2luZDogJ2VkaXQnLFxuXHRcdFx0c25pcHBldEluZm86IHVuZGVmaW5lZCxcblx0XHRcdGluc2VydFRleHQ6IG5ld1RleHQsXG5cdFx0XHRyYW5nZTogcmFuZ2UsXG5cdFx0XHR1cmk6IHRleHRNb2RlbC51cmksXG5cdFx0XHRhbHRlcm5hdGl2ZUFjdGlvbjogdW5kZWZpbmVkLFxuXHRcdH07XG5cblx0XHRyZXR1cm4gSW5saW5lRWRpdEl0ZW0uY3JlYXRlKElubGluZVN1Z2dlc3REYXRhLmNyZWF0ZUZvclRlc3QoYWN0aW9uLCB0ZXh0TW9kZWwudXJpKSwgdGV4dE1vZGVsKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKFxuXHRcdGRhdGE6IElubGluZVN1Z2dlc3REYXRhLFxuXHRcdHRleHRNb2RlbDogVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UsXG5cdFx0c2hvdWxkRGlmZkVkaXQ6IGJvb2xlYW4gPSB0cnVlLFxuXHQpOiBJbmxpbmVFZGl0SXRlbSB7XG5cdFx0bGV0IGFjdGlvbjogSW5saW5lU3VnZ2VzdGlvbkFjdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZWRpdHM6IFNpbmdsZVVwZGF0ZWROZXh0RWRpdFtdID0gW107XG5cdFx0aWYgKGRhdGEuYWN0aW9uPy5raW5kID09PSAnZWRpdCcpIHtcblx0XHRcdGNvbnN0IG9mZnNldEVkaXQgPSBzaG91bGREaWZmRWRpdCA/IGdldERpZmZlZFN0cmluZ0VkaXQodGV4dE1vZGVsLCBkYXRhLmFjdGlvbi5yYW5nZSwgZGF0YS5hY3Rpb24uaW5zZXJ0VGV4dCkgOiBnZXRTdHJpbmdFZGl0KHRleHRNb2RlbCwgZGF0YS5hY3Rpb24ucmFuZ2UsIGRhdGEuYWN0aW9uLmluc2VydFRleHQpOyAvLyBUT0RPIGNvbXB1dGUgYXN5bmNcblx0XHRcdGNvbnN0IHRleHRFZGl0ID0gVGV4dEVkaXQuZnJvbVN0cmluZ0VkaXQob2Zmc2V0RWRpdCwgdGV4dE1vZGVsKTtcblx0XHRcdGNvbnN0IHNpbmdsZVRleHRFZGl0ID0gb2Zmc2V0RWRpdC5pc0VtcHR5KCkgPyBuZXcgVGV4dFJlcGxhY2VtZW50KG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgJycpIDogdGV4dEVkaXQudG9SZXBsYWNlbWVudCh0ZXh0TW9kZWwpOyAvLyBGSVhNRTogLnRvUmVwbGFjZW1lbnQoKSBjYW4gdGhyb3cgYmVjYXVzZSBvZmZzZXRFZGl0IGlzIGVtcHR5IGJlY2F1c2Ugd2UgZ2V0IGFuIGVtcHR5IGRpZmYgaW4gZ2V0U3RyaW5nRWRpdCBhZnRlciBkaWZmaW5nXG5cblx0XHRcdGVkaXRzID0gb2Zmc2V0RWRpdC5yZXBsYWNlbWVudHMubWFwKGVkaXQgPT4ge1xuXHRcdFx0XHRjb25zdCByZXBsYWNlZFJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyh0ZXh0TW9kZWwuZ2V0UG9zaXRpb25BdChlZGl0LnJlcGxhY2VSYW5nZS5zdGFydCksIHRleHRNb2RlbC5nZXRUcmFuc2Zvcm1lcigpLmdldFBvc2l0aW9uKGVkaXQucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSkpO1xuXHRcdFx0XHRjb25zdCByZXBsYWNlZFRleHQgPSB0ZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJlcGxhY2VkUmFuZ2UpO1xuXHRcdFx0XHRyZXR1cm4gU2luZ2xlVXBkYXRlZE5leHRFZGl0LmNyZWF0ZShlZGl0LCByZXBsYWNlZFRleHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFjdGlvbiA9IHtcblx0XHRcdFx0a2luZDogJ2VkaXQnLFxuXHRcdFx0XHRzbmlwcGV0SW5mbzogZGF0YS5hY3Rpb24uc25pcHBldEluZm8sXG5cdFx0XHRcdHN0cmluZ0VkaXQ6IG9mZnNldEVkaXQsXG5cdFx0XHRcdHRleHRSZXBsYWNlbWVudDogc2luZ2xlVGV4dEVkaXQsXG5cdFx0XHRcdGFsdGVybmF0aXZlQWN0aW9uOiBkYXRhLmFjdGlvbi5hbHRlcm5hdGl2ZUFjdGlvbixcblx0XHRcdFx0dGFyZ2V0OiB0ZXh0TW9kZWwsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAoZGF0YS5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRhY3Rpb24gPSB7XG5cdFx0XHRcdGtpbmQ6ICdqdW1wVG8nLFxuXHRcdFx0XHRwb3NpdGlvbjogZGF0YS5hY3Rpb24ucG9zaXRpb24sXG5cdFx0XHRcdG9mZnNldDogdGV4dE1vZGVsLmdldFRyYW5zZm9ybWVyKCkuZ2V0T2Zmc2V0KGRhdGEuYWN0aW9uLnBvc2l0aW9uKSxcblx0XHRcdFx0dGFyZ2V0OiB0ZXh0TW9kZWwsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWRhdGEuaGludCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdJbmxpbmVFZGl0SXRlbTogYWN0aW9uIGlzIHVuZGVmaW5lZCBhbmQgbm8gaGludCBpcyBwcm92aWRlZCcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGlkZW50aXR5ID0gbmV3IElubGluZVN1Z2dlc3Rpb25JZGVudGl0eSgpO1xuXG5cdFx0Y29uc3QgaGludCA9IGRhdGEuaGludCA/IElubGluZVN1Z2dlc3RIaW50LmNyZWF0ZShkYXRhLmhpbnQpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBuZXcgSW5saW5lRWRpdEl0ZW0oYWN0aW9uLCBkYXRhLCBpZGVudGl0eSwgZWRpdHMsIGhpbnQsIGZhbHNlLCB0ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCksIHRleHRNb2RlbCk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgc25pcHBldEluZm86IFNuaXBwZXRJbmZvIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgYWRkaXRpb25hbFRleHRFZGl0czogcmVhZG9ubHkgSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNJbmxpbmVFZGl0ID0gdHJ1ZTtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbjogSW5saW5lU3VnZ2VzdGlvbkFjdGlvbiB8IHVuZGVmaW5lZCxcblxuXHRcdGRhdGE6IElubGluZVN1Z2dlc3REYXRhLFxuXG5cdFx0aWRlbnRpdHk6IElubGluZVN1Z2dlc3Rpb25JZGVudGl0eSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0czogcmVhZG9ubHkgU2luZ2xlVXBkYXRlZE5leHRFZGl0W10sXG5cdFx0aGludDogSW5saW5lU3VnZ2VzdEhpbnQgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFzdENoYW5nZVBhcnRPZklubGluZUVkaXQgPSBmYWxzZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVFZGl0TW9kZWxWZXJzaW9uOiBudW1iZXIsXG5cdFx0b3JpZ2luYWxUZXh0UmVmOiBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZSxcblx0KSB7XG5cdFx0c3VwZXIoZGF0YSwgaWRlbnRpdHksIGhpbnQsIG9yaWdpbmFsVGV4dFJlZik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHVwZGF0ZWRFZGl0TW9kZWxWZXJzaW9uKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9pbmxpbmVFZGl0TW9kZWxWZXJzaW9uOyB9XG5cdC8vIHB1YmxpYyBnZXQgdXBkYXRlZEVkaXQoKTogU3RyaW5nRWRpdCB7IHJldHVybiB0aGlzLl9lZGl0OyB9XG5cblx0b3ZlcnJpZGUgZ2V0IGFjdGlvbigpOiBJbmxpbmVTdWdnZXN0aW9uQWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgd2l0aElkZW50aXR5KGlkZW50aXR5OiBJbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHkpOiBJbmxpbmVFZGl0SXRlbSB7XG5cdFx0cmV0dXJuIG5ldyBJbmxpbmVFZGl0SXRlbShcblx0XHRcdHRoaXMuX2FjdGlvbixcblx0XHRcdHRoaXMuX2RhdGEsXG5cdFx0XHRpZGVudGl0eSxcblx0XHRcdHRoaXMuX2VkaXRzLFxuXHRcdFx0dGhpcy5oaW50LFxuXHRcdFx0dGhpcy5fbGFzdENoYW5nZVBhcnRPZklubGluZUVkaXQsXG5cdFx0XHR0aGlzLl9pbmxpbmVFZGl0TW9kZWxWZXJzaW9uLFxuXHRcdFx0dGhpcy5vcmlnaW5hbFRleHRSZWYsXG5cdFx0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGNhbkJlUmV1c2VkKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHQvLyBUT0RPQGhlZGlldCBJIGJlbGlldmUgdGhpcyBjYW4gYmUgc2ltcGxpZmllZCB0byBgcmV0dXJuIHRydWU7YCwgYXMgYXBwbHlpbmcgYW4gZWRpdCBzaG91bGQga2ljayBvdXQgdGhpcyBzdWdnZXN0aW9uLlxuXHRcdHJldHVybiB0aGlzLl9sYXN0Q2hhbmdlUGFydE9mSW5saW5lRWRpdCAmJiB0aGlzLnVwZGF0ZWRFZGl0TW9kZWxWZXJzaW9uID09PSBtb2RlbC5nZXRWZXJzaW9uSWQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHdpdGhFZGl0KHRleHRNb2RlbENoYW5nZXM6IFN0cmluZ0VkaXQsIHRleHRNb2RlbDogSVRleHRNb2RlbCk6IElubGluZUVkaXRJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBJZiB0aGUgZWRpdCBpcyB0byBhIGRpZmZlcmVudCBtb2RlbCB0aGFuIG91ciB0YXJnZXQsIGl0J3MgYSBub29wXG5cdFx0aWYgKCF0aGlzLm9yaWdpbmFsVGV4dFJlZi50YXJnZXRzKHRleHRNb2RlbCkpIHtcblx0XHRcdHJldHVybiB0aGlzOyAgLy8gdW5jaGFuZ2VkXG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdCA9IHRoaXMuX2FwcGx5VGV4dE1vZGVsQ2hhbmdlcyh0ZXh0TW9kZWxDaGFuZ2VzLCB0aGlzLl9lZGl0cywgdGV4dE1vZGVsKTtcblx0XHRyZXR1cm4gZWRpdDtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VGV4dE1vZGVsQ2hhbmdlcyh0ZXh0TW9kZWxDaGFuZ2VzOiBTdHJpbmdFZGl0LCBlZGl0czogcmVhZG9ubHkgU2luZ2xlVXBkYXRlZE5leHRFZGl0W10sIHRleHRNb2RlbDogSVRleHRNb2RlbCk6IElubGluZUVkaXRJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyID0gZ2V0UG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lckZyb21UZXh0TW9kZWwodGV4dE1vZGVsKTtcblxuXHRcdGxldCBsYXN0Q2hhbmdlUGFydE9mSW5saW5lRWRpdCA9IGZhbHNlO1xuXHRcdGxldCBpbmxpbmVFZGl0TW9kZWxWZXJzaW9uID0gdGhpcy5faW5saW5lRWRpdE1vZGVsVmVyc2lvbjtcblx0XHRsZXQgbmV3QWN0aW9uOiBJbmxpbmVTdWdnZXN0aW9uQWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgdXBkYXRlZFRhcmdldCA9IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlLnNuYXBzaG90KHRleHRNb2RlbCk7XG5cblx0XHRpZiAodGhpcy5hY3Rpb24/LmtpbmQgPT09ICdlZGl0JykgeyAvLyBUT0RPIFdoYXQgYWJvdXQgcmVuYW1lP1xuXHRcdFx0ZWRpdHMgPSBlZGl0cy5tYXAoaW5uZXJFZGl0ID0+IGlubmVyRWRpdC5hcHBseVRleHRNb2RlbENoYW5nZXModGV4dE1vZGVsQ2hhbmdlcykpO1xuXG5cdFx0XHRpZiAoZWRpdHMuc29tZShlZGl0ID0+IGVkaXQuZWRpdCA9PT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBjaGFuZ2UgaXMgaW52YWxpZCwgc28gd2Ugd2lsbCBoYXZlIHRvIGRyb3AgdGhlIGNvbXBsZXRpb25cblx0XHRcdH1cblxuXG5cdFx0XHRjb25zdCBuZXdUZXh0TW9kZWxWZXJzaW9uID0gdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdFx0bGFzdENoYW5nZVBhcnRPZklubGluZUVkaXQgPSBlZGl0cy5zb21lKGVkaXQgPT4gZWRpdC5sYXN0Q2hhbmdlVXBkYXRlZEVkaXQpO1xuXHRcdFx0aWYgKGxhc3RDaGFuZ2VQYXJ0T2ZJbmxpbmVFZGl0KSB7XG5cdFx0XHRcdGlubGluZUVkaXRNb2RlbFZlcnNpb24gPSBuZXdUZXh0TW9kZWxWZXJzaW9uID8/IC0xO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobmV3VGV4dE1vZGVsVmVyc2lvbiA9PT0gbnVsbCB8fCBpbmxpbmVFZGl0TW9kZWxWZXJzaW9uICsgMjAgPCBuZXdUZXh0TW9kZWxWZXJzaW9uKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHRoZSBjb21wbGV0aW9uIGhhcyBiZWVuIGlnbm9yZWQgZm9yIGEgd2hpbGUsIHJlbW92ZSBpdFxuXHRcdFx0fVxuXG5cdFx0XHRlZGl0cyA9IGVkaXRzLmZpbHRlcihpbm5lckVkaXQgPT4gIWlubmVyRWRpdC5lZGl0IS5pc0VtcHR5KTtcblx0XHRcdGlmIChlZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gdGhlIGNvbXBsZXRpb24gaGFzIGJlZW4gdHlwZWQgYnkgdGhlIHVzZXJcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3RWRpdCA9IG5ldyBTdHJpbmdFZGl0KGVkaXRzLm1hcChlZGl0ID0+IGVkaXQuZWRpdCEpKTtcblxuXHRcdFx0Y29uc3QgbmV3VGV4dEVkaXQgPSBwb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyLmdldFRleHRFZGl0KG5ld0VkaXQpLnRvUmVwbGFjZW1lbnQobmV3IFRleHRNb2RlbFRleHQodGV4dE1vZGVsKSk7XG5cblx0XHRcdG5ld0FjdGlvbiA9IHtcblx0XHRcdFx0a2luZDogJ2VkaXQnLFxuXHRcdFx0XHR0ZXh0UmVwbGFjZW1lbnQ6IG5ld1RleHRFZGl0LFxuXHRcdFx0XHRzbmlwcGV0SW5mbzogdGhpcy5zbmlwcGV0SW5mbyxcblx0XHRcdFx0c3RyaW5nRWRpdDogbmV3RWRpdCxcblx0XHRcdFx0YWx0ZXJuYXRpdmVBY3Rpb246IHRoaXMuYWN0aW9uLmFsdGVybmF0aXZlQWN0aW9uLFxuXHRcdFx0XHR0YXJnZXQ6IHVwZGF0ZWRUYXJnZXQsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSBpZiAodGhpcy5hY3Rpb24/LmtpbmQgPT09ICdqdW1wVG8nKSB7XG5cdFx0XHRjb25zdCBqdW1wVG9PZmZzZXQgPSB0aGlzLmFjdGlvbi5vZmZzZXQ7XG5cdFx0XHRjb25zdCBuZXdKdW1wVG9PZmZzZXQgPSB0ZXh0TW9kZWxDaGFuZ2VzLmFwcGx5VG9PZmZzZXRPclVuZGVmaW5lZChqdW1wVG9PZmZzZXQpO1xuXHRcdFx0aWYgKG5ld0p1bXBUb09mZnNldCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBuZXdKdW1wVG9Qb3NpdGlvbiA9IHBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXIuZ2V0UG9zaXRpb24obmV3SnVtcFRvT2Zmc2V0KTtcblxuXHRcdFx0bmV3QWN0aW9uID0ge1xuXHRcdFx0XHRraW5kOiAnanVtcFRvJyxcblx0XHRcdFx0cG9zaXRpb246IG5ld0p1bXBUb1Bvc2l0aW9uLFxuXHRcdFx0XHRvZmZzZXQ6IG5ld0p1bXBUb09mZnNldCxcblx0XHRcdFx0dGFyZ2V0OiB1cGRhdGVkVGFyZ2V0LFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3QWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCBuZXdEaXNwbGF5TG9jYXRpb24gPSB0aGlzLmhpbnQ7XG5cdFx0aWYgKG5ld0Rpc3BsYXlMb2NhdGlvbikge1xuXHRcdFx0bmV3RGlzcGxheUxvY2F0aW9uID0gbmV3RGlzcGxheUxvY2F0aW9uLndpdGhFZGl0KHRleHRNb2RlbENoYW5nZXMsIHBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXIpO1xuXHRcdFx0aWYgKCFuZXdEaXNwbGF5TG9jYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IElubGluZUVkaXRJdGVtKFxuXHRcdFx0bmV3QWN0aW9uLFxuXHRcdFx0dGhpcy5fZGF0YSxcblx0XHRcdHRoaXMuaWRlbnRpdHksXG5cdFx0XHRlZGl0cyxcblx0XHRcdG5ld0Rpc3BsYXlMb2NhdGlvbixcblx0XHRcdGxhc3RDaGFuZ2VQYXJ0T2ZJbmxpbmVFZGl0LFxuXHRcdFx0aW5saW5lRWRpdE1vZGVsVmVyc2lvbixcblx0XHRcdHVwZGF0ZWRUYXJnZXQsXG5cdFx0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGNvbXB1dGVFZGl0S2luZChtb2RlbDogSVRleHRNb2RlbCk6IElubGluZVN1Z2dlc3Rpb25FZGl0S2luZCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZWRpdCA9IHRoaXMuYWN0aW9uPy5raW5kID09PSAnZWRpdCcgPyB0aGlzLmFjdGlvbi5zdHJpbmdFZGl0IDogdW5kZWZpbmVkO1xuXHRcdGlmICghZWRpdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbXB1dGVFZGl0S2luZChlZGl0LCBtb2RlbCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0RGlmZmVkU3RyaW5nRWRpdCh0ZXh0TW9kZWw6IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlLCBlZGl0UmFuZ2U6IFJhbmdlLCByZXBsYWNlVGV4dDogc3RyaW5nKTogU3RyaW5nRWRpdCB7XG5cdGNvbnN0IGVvbCA9IHRleHRNb2RlbC5nZXRFT0woKTtcblx0Y29uc3QgZWRpdE9yaWdpbmFsVGV4dCA9IHRleHRNb2RlbC5nZXRWYWx1ZU9mUmFuZ2UoZWRpdFJhbmdlKTtcblx0Y29uc3QgZWRpdFJlcGxhY2VUZXh0ID0gcmVwbGFjZVRleHQucmVwbGFjZSgvXFxyXFxufFxccnxcXG4vZywgZW9sKTtcblxuXHRjb25zdCBkaWZmQWxnb3JpdGhtID0gbGluZXNEaWZmQ29tcHV0ZXJzLmdldERlZmF1bHQoKTtcblx0Y29uc3QgbGluZURpZmZzID0gZGlmZkFsZ29yaXRobS5jb21wdXRlRGlmZihcblx0XHRzcGxpdExpbmVzKGVkaXRPcmlnaW5hbFRleHQpLFxuXHRcdHNwbGl0TGluZXMoZWRpdFJlcGxhY2VUZXh0KSxcblx0XHR7XG5cdFx0XHRpZ25vcmVUcmltV2hpdGVzcGFjZTogZmFsc2UsXG5cdFx0XHRjb21wdXRlTW92ZXM6IGZhbHNlLFxuXHRcdFx0ZXh0ZW5kVG9TdWJ3b3JkczogdHJ1ZSxcblx0XHRcdG1heENvbXB1dGF0aW9uVGltZU1zOiA1MCxcblx0XHR9XG5cdCk7XG5cblx0Y29uc3QgaW5uZXJDaGFuZ2VzID0gbGluZURpZmZzLmNoYW5nZXMuZmxhdE1hcChjID0+IGMuaW5uZXJDaGFuZ2VzID8/IFtdKTtcblxuXHRmdW5jdGlvbiBhZGRSYW5nZVRvUG9zKHBvczogUG9zaXRpb24sIHJhbmdlOiBSYW5nZSk6IFJhbmdlIHtcblx0XHRjb25zdCBzdGFydCA9IFRleHRMZW5ndGguZnJvbVBvc2l0aW9uKHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0cmV0dXJuIFRleHRMZW5ndGgub2ZSYW5nZShyYW5nZSkuY3JlYXRlUmFuZ2Uoc3RhcnQuYWRkVG9Qb3NpdGlvbihwb3MpKTtcblx0fVxuXG5cdGNvbnN0IG1vZGlmaWVkVGV4dCA9IG5ldyBTdHJpbmdUZXh0KGVkaXRSZXBsYWNlVGV4dCk7XG5cblx0Y29uc3Qgb2Zmc2V0RWRpdCA9IG5ldyBTdHJpbmdFZGl0KFxuXHRcdGlubmVyQ2hhbmdlcy5tYXAoYyA9PiB7XG5cdFx0XHRjb25zdCByYW5nZUluTW9kZWwgPSBhZGRSYW5nZVRvUG9zKGVkaXRSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCksIGMub3JpZ2luYWxSYW5nZSk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFJhbmdlID0gdGV4dE1vZGVsLmdldFRyYW5zZm9ybWVyKCkuZ2V0T2Zmc2V0UmFuZ2UocmFuZ2VJbk1vZGVsKTtcblxuXHRcdFx0Y29uc3QgcmVwbGFjZVRleHQgPSBtb2RpZmllZFRleHQuZ2V0VmFsdWVPZlJhbmdlKGMubW9kaWZpZWRSYW5nZSk7XG5cdFx0XHRjb25zdCBlZGl0ID0gbmV3IFN0cmluZ1JlcGxhY2VtZW50KG9yaWdpbmFsUmFuZ2UsIHJlcGxhY2VUZXh0KTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxUZXh0ID0gdGV4dE1vZGVsLmdldFZhbHVlT2ZSYW5nZShyYW5nZUluTW9kZWwpO1xuXHRcdFx0cmV0dXJuIHJlc2hhcGVJbmxpbmVFZGl0KGVkaXQsIG9yaWdpbmFsVGV4dCwgaW5uZXJDaGFuZ2VzLmxlbmd0aCwgdGV4dE1vZGVsKTtcblx0XHR9KVxuXHQpO1xuXG5cdHJldHVybiBvZmZzZXRFZGl0O1xufVxuXG5mdW5jdGlvbiBnZXRTdHJpbmdFZGl0KHRleHRNb2RlbDogVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UsIGVkaXRSYW5nZTogUmFuZ2UsIHJlcGxhY2VUZXh0OiBzdHJpbmcpOiBTdHJpbmdFZGl0IHtcblx0cmV0dXJuIG5ldyBTdHJpbmdFZGl0KFtuZXcgU3RyaW5nUmVwbGFjZW1lbnQoXG5cdFx0dGV4dE1vZGVsLmdldFRyYW5zZm9ybWVyKCkuZ2V0T2Zmc2V0UmFuZ2UoZWRpdFJhbmdlKSxcblx0XHRyZXBsYWNlVGV4dFxuXHQpXSk7XG59XG5cbmNsYXNzIFNpbmdsZVVwZGF0ZWROZXh0RWRpdCB7XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKFxuXHRcdGVkaXQ6IFN0cmluZ1JlcGxhY2VtZW50LFxuXHRcdHJlcGxhY2VkVGV4dDogc3RyaW5nLFxuXHQpOiBTaW5nbGVVcGRhdGVkTmV4dEVkaXQge1xuXHRcdGNvbnN0IHByZWZpeExlbmd0aCA9IGNvbW1vblByZWZpeExlbmd0aChlZGl0Lm5ld1RleHQsIHJlcGxhY2VkVGV4dCk7XG5cdFx0Y29uc3Qgc3VmZml4TGVuZ3RoID0gY29tbW9uU3VmZml4TGVuZ3RoKGVkaXQubmV3VGV4dCwgcmVwbGFjZWRUZXh0KTtcblx0XHRjb25zdCB0cmltbWVkTmV3VGV4dCA9IGVkaXQubmV3VGV4dC5zdWJzdHJpbmcocHJlZml4TGVuZ3RoLCBlZGl0Lm5ld1RleHQubGVuZ3RoIC0gc3VmZml4TGVuZ3RoKTtcblx0XHRyZXR1cm4gbmV3IFNpbmdsZVVwZGF0ZWROZXh0RWRpdChlZGl0LCB0cmltbWVkTmV3VGV4dCwgcHJlZml4TGVuZ3RoLCBzdWZmaXhMZW5ndGgpO1xuXHR9XG5cblx0cHVibGljIGdldCBlZGl0KCkgeyByZXR1cm4gdGhpcy5fZWRpdDsgfVxuXHRwdWJsaWMgZ2V0IGxhc3RDaGFuZ2VVcGRhdGVkRWRpdCgpIHsgcmV0dXJuIHRoaXMuX2xhc3RDaGFuZ2VVcGRhdGVkRWRpdDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX2VkaXQ6IFN0cmluZ1JlcGxhY2VtZW50IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgX3RyaW1tZWROZXdUZXh0OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBfcHJlZml4TGVuZ3RoOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfc3VmZml4TGVuZ3RoOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfbGFzdENoYW5nZVVwZGF0ZWRFZGl0OiBib29sZWFuID0gZmFsc2UsXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGFwcGx5VGV4dE1vZGVsQ2hhbmdlcyh0ZXh0TW9kZWxDaGFuZ2VzOiBTdHJpbmdFZGl0KSB7XG5cdFx0Y29uc3QgYyA9IHRoaXMuX2Nsb25lKCk7XG5cdFx0Yy5fYXBwbHlUZXh0TW9kZWxDaGFuZ2VzKHRleHRNb2RlbENoYW5nZXMpO1xuXHRcdHJldHVybiBjO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xvbmUoKTogU2luZ2xlVXBkYXRlZE5leHRFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFNpbmdsZVVwZGF0ZWROZXh0RWRpdChcblx0XHRcdHRoaXMuX2VkaXQsXG5cdFx0XHR0aGlzLl90cmltbWVkTmV3VGV4dCxcblx0XHRcdHRoaXMuX3ByZWZpeExlbmd0aCxcblx0XHRcdHRoaXMuX3N1ZmZpeExlbmd0aCxcblx0XHRcdHRoaXMuX2xhc3RDaGFuZ2VVcGRhdGVkRWRpdCxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlUZXh0TW9kZWxDaGFuZ2VzKHRleHRNb2RlbENoYW5nZXM6IFN0cmluZ0VkaXQpIHtcblx0XHR0aGlzLl9sYXN0Q2hhbmdlVXBkYXRlZEVkaXQgPSBmYWxzZTsgLy8gVE9ETyBAYmVuaWJlbmogbWFrZSBpbW11dGFibGVcblxuXHRcdGlmICghdGhpcy5fZWRpdCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVXBkYXRlZElubmVyRWRpdHM6IE5vIGVkaXQgdG8gYXBwbHkgY2hhbmdlcyB0bycpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2FwcGx5Q2hhbmdlcyh0aGlzLl9lZGl0LCB0ZXh0TW9kZWxDaGFuZ2VzKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0dGhpcy5fZWRpdCA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0ID0gcmVzdWx0LmVkaXQ7XG5cdFx0dGhpcy5fbGFzdENoYW5nZVVwZGF0ZWRFZGl0ID0gcmVzdWx0LmVkaXRIYXNDaGFuZ2VkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlDaGFuZ2VzKGVkaXQ6IFN0cmluZ1JlcGxhY2VtZW50LCB0ZXh0TW9kZWxDaGFuZ2VzOiBTdHJpbmdFZGl0KTogeyBlZGl0OiBTdHJpbmdSZXBsYWNlbWVudDsgZWRpdEhhc0NoYW5nZWQ6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGVkaXRTdGFydCA9IGVkaXQucmVwbGFjZVJhbmdlLnN0YXJ0O1xuXHRcdGxldCBlZGl0RW5kID0gZWRpdC5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlO1xuXHRcdGxldCBlZGl0UmVwbGFjZVRleHQgPSBlZGl0Lm5ld1RleHQ7XG5cdFx0bGV0IGVkaXRIYXNDaGFuZ2VkID0gZmFsc2U7XG5cblx0XHRjb25zdCBzaG91bGRQcmVzZXJ2ZUVkaXRTaGFwZSA9IHRoaXMuX3ByZWZpeExlbmd0aCA+IDAgfHwgdGhpcy5fc3VmZml4TGVuZ3RoID4gMDtcblxuXHRcdGZvciAobGV0IGkgPSB0ZXh0TW9kZWxDaGFuZ2VzLnJlcGxhY2VtZW50cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgY2hhbmdlID0gdGV4dE1vZGVsQ2hhbmdlcy5yZXBsYWNlbWVudHNbaV07XG5cblx0XHRcdC8vIElOU0VSVElPTlMgKG9ubHkgc3VwcG9ydCBpbnNlcnRpbmcgYXQgc3RhcnQgb2YgZWRpdClcblx0XHRcdGNvbnN0IGlzSW5zZXJ0aW9uID0gY2hhbmdlLm5ld1RleHQubGVuZ3RoID4gMCAmJiBjaGFuZ2UucmVwbGFjZVJhbmdlLmlzRW1wdHk7XG5cblx0XHRcdGlmIChpc0luc2VydGlvbiAmJiAhc2hvdWxkUHJlc2VydmVFZGl0U2hhcGUgJiYgY2hhbmdlLnJlcGxhY2VSYW5nZS5zdGFydCA9PT0gZWRpdFN0YXJ0ICYmIGVkaXRSZXBsYWNlVGV4dC5zdGFydHNXaXRoKGNoYW5nZS5uZXdUZXh0KSkge1xuXHRcdFx0XHRlZGl0U3RhcnQgKz0gY2hhbmdlLm5ld1RleHQubGVuZ3RoO1xuXHRcdFx0XHRlZGl0UmVwbGFjZVRleHQgPSBlZGl0UmVwbGFjZVRleHQuc3Vic3RyaW5nKGNoYW5nZS5uZXdUZXh0Lmxlbmd0aCk7XG5cdFx0XHRcdGVkaXRFbmQgKz0gY2hhbmdlLm5ld1RleHQubGVuZ3RoO1xuXHRcdFx0XHRlZGl0SGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNJbnNlcnRpb24gJiYgc2hvdWxkUHJlc2VydmVFZGl0U2hhcGUgJiYgY2hhbmdlLnJlcGxhY2VSYW5nZS5zdGFydCA9PT0gZWRpdFN0YXJ0ICsgdGhpcy5fcHJlZml4TGVuZ3RoICYmIHRoaXMuX3RyaW1tZWROZXdUZXh0LnN0YXJ0c1dpdGgoY2hhbmdlLm5ld1RleHQpKSB7XG5cdFx0XHRcdGVkaXRFbmQgKz0gY2hhbmdlLm5ld1RleHQubGVuZ3RoO1xuXHRcdFx0XHRlZGl0SGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3ByZWZpeExlbmd0aCArPSBjaGFuZ2UubmV3VGV4dC5sZW5ndGg7XG5cdFx0XHRcdHRoaXMuX3RyaW1tZWROZXdUZXh0ID0gdGhpcy5fdHJpbW1lZE5ld1RleHQuc3Vic3RyaW5nKGNoYW5nZS5uZXdUZXh0Lmxlbmd0aCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBERUxFVElPTlNcblx0XHRcdGNvbnN0IGlzRGVsZXRpb24gPSBjaGFuZ2UubmV3VGV4dC5sZW5ndGggPT09IDAgJiYgY2hhbmdlLnJlcGxhY2VSYW5nZS5sZW5ndGggPiAwO1xuXHRcdFx0aWYgKGlzRGVsZXRpb24gJiYgY2hhbmdlLnJlcGxhY2VSYW5nZS5zdGFydCA+PSBlZGl0U3RhcnQgKyB0aGlzLl9wcmVmaXhMZW5ndGggJiYgY2hhbmdlLnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUgPD0gZWRpdEVuZCAtIHRoaXMuX3N1ZmZpeExlbmd0aCkge1xuXHRcdFx0XHQvLyB1c2VyIGRlbGV0ZWQgdGV4dCBJTi1CRVRXRUVOIHRoZSBkZWxldGlvbiByYW5nZVxuXHRcdFx0XHRlZGl0RW5kIC09IGNoYW5nZS5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHRcdFx0XHRlZGl0SGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyB1c2VyIGRpZCBleGFjdGx5IHRoZSBlZGl0XG5cdFx0XHRpZiAoY2hhbmdlLmVxdWFscyhlZGl0KSkge1xuXHRcdFx0XHRlZGl0SGFzQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdGVkaXRTdGFydCA9IGNoYW5nZS5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlO1xuXHRcdFx0XHRlZGl0UmVwbGFjZVRleHQgPSAnJztcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1PVkUgRURJVFxuXHRcdFx0aWYgKGNoYW5nZS5yZXBsYWNlUmFuZ2Uuc3RhcnQgPiBlZGl0RW5kKSB7XG5cdFx0XHRcdC8vIHRoZSBjaGFuZ2UgaGFwcGVucyBhZnRlciB0aGUgY29tcGxldGlvbiByYW5nZVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChjaGFuZ2UucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSA8IGVkaXRTdGFydCkge1xuXHRcdFx0XHQvLyB0aGUgY2hhbmdlIGhhcHBlbnMgYmVmb3JlIHRoZSBjb21wbGV0aW9uIHJhbmdlXG5cdFx0XHRcdGVkaXRTdGFydCArPSBjaGFuZ2UubmV3VGV4dC5sZW5ndGggLSBjaGFuZ2UucmVwbGFjZVJhbmdlLmxlbmd0aDtcblx0XHRcdFx0ZWRpdEVuZCArPSBjaGFuZ2UubmV3VGV4dC5sZW5ndGggLSBjaGFuZ2UucmVwbGFjZVJhbmdlLmxlbmd0aDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBjaGFuZ2UgaW50ZXJzZWN0cyB0aGUgY29tcGxldGlvbiwgc28gd2Ugd2lsbCBoYXZlIHRvIGRyb3AgdGhlIGNvbXBsZXRpb25cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gdGhlIHJlc3VsdGluZyBlZGl0IGlzIGEgbm9vcCBhcyB0aGUgb3JpZ2luYWwgYW5kIG5ldyB0ZXh0IGFyZSB0aGUgc2FtZVxuXHRcdGlmICh0aGlzLl90cmltbWVkTmV3VGV4dC5sZW5ndGggPT09IDAgJiYgZWRpdFN0YXJ0ICsgdGhpcy5fcHJlZml4TGVuZ3RoID09PSBlZGl0RW5kIC0gdGhpcy5fc3VmZml4TGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBlZGl0OiBuZXcgU3RyaW5nUmVwbGFjZW1lbnQobmV3IE9mZnNldFJhbmdlKGVkaXRTdGFydCArIHRoaXMuX3ByZWZpeExlbmd0aCwgZWRpdFN0YXJ0ICsgdGhpcy5fcHJlZml4TGVuZ3RoKSwgJycpLCBlZGl0SGFzQ2hhbmdlZDogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGVkaXQ6IG5ldyBTdHJpbmdSZXBsYWNlbWVudChuZXcgT2Zmc2V0UmFuZ2UoZWRpdFN0YXJ0LCBlZGl0RW5kKSwgZWRpdFJlcGxhY2VUZXh0KSwgZWRpdEhhc0NoYW5nZWQgfTtcblx0fVxufVxuXG5mdW5jdGlvbiByZXNoYXBlSW5saW5lQ29tcGxldGlvbihlZGl0OiBTdHJpbmdSZXBsYWNlbWVudCwgdGV4dE1vZGVsOiBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZSk6IFN0cmluZ1JlcGxhY2VtZW50IHtcblx0Ly8gSWYgdGhlIGluc2VydGlvbiBpcyBhIG11bHRpIGxpbmUgaW5zZXJ0aW9uIHN0YXJ0aW5nIG9uIHRoZSBuZXh0IGxpbmVcblx0Ly8gTW92ZSBpdCBmb3J3YXJkcyBzbyB0aGF0IHRoZSBtdWx0aSBsaW5lIGluc2VydGlvbiBzdGFydHMgb24gdGhlIGN1cnJlbnQgbGluZVxuXHRjb25zdCBlb2wgPSB0ZXh0TW9kZWwuZ2V0RU9MKCk7XG5cdGlmIChlZGl0LnJlcGxhY2VSYW5nZS5pc0VtcHR5ICYmIGVkaXQubmV3VGV4dC5pbmNsdWRlcyhlb2wpKSB7XG5cdFx0ZWRpdCA9IHJlc2hhcGVNdWx0aUxpbmVJbnNlcnRpb24oZWRpdCwgdGV4dE1vZGVsKTtcblx0fVxuXG5cdHJldHVybiBlZGl0O1xufVxuXG5mdW5jdGlvbiByZXNoYXBlSW5saW5lRWRpdChlZGl0OiBTdHJpbmdSZXBsYWNlbWVudCwgb3JpZ2luYWxUZXh0OiBzdHJpbmcsIHRvdGFsSW5uZXJFZGl0czogbnVtYmVyLCB0ZXh0TW9kZWw6IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlKTogU3RyaW5nUmVwbGFjZW1lbnQge1xuXHQvLyBUT0RPOiBFT0wgYXJlIG5vdCBwcm9wZXJseSB0cmltbWVkIGJ5IHRoZSBkaWZmQWxnb3JpdGhtICMxMjY4MFxuXHRjb25zdCBlb2wgPSB0ZXh0TW9kZWwuZ2V0RU9MKCk7XG5cdGlmIChlZGl0Lm5ld1RleHQuZW5kc1dpdGgoZW9sKSAmJiBvcmlnaW5hbFRleHQuZW5kc1dpdGgoZW9sKSkge1xuXHRcdGVkaXQgPSBuZXcgU3RyaW5nUmVwbGFjZW1lbnQoZWRpdC5yZXBsYWNlUmFuZ2UuZGVsdGFFbmQoLWVvbC5sZW5ndGgpLCBlZGl0Lm5ld1RleHQuc2xpY2UoMCwgLWVvbC5sZW5ndGgpKTtcblx0fVxuXG5cdC8vIElOU0VSVElPTlxuXHQvLyBJZiB0aGUgaW5zZXJ0aW9uIGVuZHMgd2l0aCBhIG5ldyBsaW5lIGFuZCBpcyBpbnNlcnRlZCBhdCB0aGUgc3RhcnQgb2YgYSBsaW5lIHdoaWNoIGhhcyB0ZXh0LFxuXHQvLyB3ZSBtb3ZlIHRoZSBpbnNlcnRpb24gdG8gdGhlIGVuZCBvZiB0aGUgcHJldmlvdXMgbGluZSBpZiBwb3NzaWJsZVxuXHRpZiAodG90YWxJbm5lckVkaXRzID09PSAxICYmIGVkaXQucmVwbGFjZVJhbmdlLmlzRW1wdHkgJiYgZWRpdC5uZXdUZXh0LmluY2x1ZGVzKGVvbCkpIHtcblx0XHRjb25zdCBzdGFydFBvc2l0aW9uID0gdGV4dE1vZGVsLmdldFRyYW5zZm9ybWVyKCkuZ2V0UG9zaXRpb24oZWRpdC5yZXBsYWNlUmFuZ2Uuc3RhcnQpO1xuXHRcdGNvbnN0IGhhc1RleHRPbkluc2VydGlvbkxpbmUgPSB0ZXh0TW9kZWwuZ2V0TGluZUxlbmd0aChzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIpICE9PSAwO1xuXHRcdGlmIChoYXNUZXh0T25JbnNlcnRpb25MaW5lKSB7XG5cdFx0XHRlZGl0ID0gcmVzaGFwZU11bHRpTGluZUluc2VydGlvbihlZGl0LCB0ZXh0TW9kZWwpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFRoZSBkaWZmIGFsZ29yaXRobSBleHRlbmRlZCBhIHNpbXBsZSBlZGl0IHRvIHRoZSBlbnRpcmUgd29yZFxuXHQvLyBzaHJpbmsgaXQgYmFjayB0byBhIHNpbXBsZSBlZGl0IGlmIGl0IGlzIGRlbGV0aW9uL2luc2VydGlvbiBvbmx5XG5cdGlmICh0b3RhbElubmVyRWRpdHMgPT09IDEpIHtcblx0XHRjb25zdCBwcmVmaXhMZW5ndGggPSBjb21tb25QcmVmaXhMZW5ndGgob3JpZ2luYWxUZXh0LCBlZGl0Lm5ld1RleHQpO1xuXHRcdGNvbnN0IHN1ZmZpeExlbmd0aCA9IGNvbW1vblN1ZmZpeExlbmd0aChvcmlnaW5hbFRleHQuc2xpY2UocHJlZml4TGVuZ3RoKSwgZWRpdC5uZXdUZXh0LnNsaWNlKHByZWZpeExlbmd0aCkpO1xuXG5cdFx0Ly8gcmVzaGFwZSBpdCBiYWNrIHRvIGFuIGluc2VydGlvblxuXHRcdGlmIChwcmVmaXhMZW5ndGggKyBzdWZmaXhMZW5ndGggPT09IG9yaWdpbmFsVGV4dC5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBuZXcgU3RyaW5nUmVwbGFjZW1lbnQoZWRpdC5yZXBsYWNlUmFuZ2UuZGVsdGFTdGFydChwcmVmaXhMZW5ndGgpLmRlbHRhRW5kKC1zdWZmaXhMZW5ndGgpLCBlZGl0Lm5ld1RleHQuc3Vic3RyaW5nKHByZWZpeExlbmd0aCwgZWRpdC5uZXdUZXh0Lmxlbmd0aCAtIHN1ZmZpeExlbmd0aCkpO1xuXHRcdH1cblxuXHRcdC8vIHJlc2hhcGUgaXQgYmFjayB0byBhIGRlbGV0aW9uXG5cdFx0aWYgKHByZWZpeExlbmd0aCArIHN1ZmZpeExlbmd0aCA9PT0gZWRpdC5uZXdUZXh0Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG5ldyBTdHJpbmdSZXBsYWNlbWVudChlZGl0LnJlcGxhY2VSYW5nZS5kZWx0YVN0YXJ0KHByZWZpeExlbmd0aCkuZGVsdGFFbmQoLXN1ZmZpeExlbmd0aCksICcnKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZWRpdDtcbn1cblxuZnVuY3Rpb24gcmVzaGFwZU11bHRpTGluZUluc2VydGlvbihlZGl0OiBTdHJpbmdSZXBsYWNlbWVudCwgdGV4dE1vZGVsOiBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZSk6IFN0cmluZ1JlcGxhY2VtZW50IHtcblx0aWYgKCFlZGl0LnJlcGxhY2VSYW5nZS5pc0VtcHR5KSB7XG5cdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVW5leHBlY3RlZCBvcmlnaW5hbCByYW5nZScpO1xuXHR9XG5cblx0aWYgKGVkaXQucmVwbGFjZVJhbmdlLnN0YXJ0ID09PSAwKSB7XG5cdFx0cmV0dXJuIGVkaXQ7XG5cdH1cblxuXHRjb25zdCBlb2wgPSB0ZXh0TW9kZWwuZ2V0RU9MKCk7XG5cdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSB0ZXh0TW9kZWwuZ2V0VHJhbnNmb3JtZXIoKS5nZXRQb3NpdGlvbihlZGl0LnJlcGxhY2VSYW5nZS5zdGFydCk7XG5cdGNvbnN0IHN0YXJ0Q29sdW1uID0gc3RhcnRQb3NpdGlvbi5jb2x1bW47XG5cdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHN0YXJ0UG9zaXRpb24ubGluZU51bWJlcjtcblxuXHQvLyBJZiB0aGUgaW5zZXJ0aW9uIGVuZHMgd2l0aCBhIG5ldyBsaW5lIGFuZCBpcyBpbnNlcnRlZCBhdCB0aGUgc3RhcnQgb2YgYSBsaW5lIHdoaWNoIGhhcyB0ZXh0LFxuXHQvLyB3ZSBtb3ZlIHRoZSBpbnNlcnRpb24gdG8gdGhlIGVuZCBvZiB0aGUgcHJldmlvdXMgbGluZSBpZiBwb3NzaWJsZVxuXHRpZiAoc3RhcnRDb2x1bW4gPT09IDEgJiYgc3RhcnRMaW5lTnVtYmVyID4gMSAmJiBlZGl0Lm5ld1RleHQuZW5kc1dpdGgoZW9sKSAmJiAhZWRpdC5uZXdUZXh0LnN0YXJ0c1dpdGgoZW9sKSkge1xuXHRcdHJldHVybiBuZXcgU3RyaW5nUmVwbGFjZW1lbnQoZWRpdC5yZXBsYWNlUmFuZ2UuZGVsdGEoLTEpLCBlb2wgKyBlZGl0Lm5ld1RleHQuc2xpY2UoMCwgLWVvbC5sZW5ndGgpKTtcblx0fVxuXG5cdHJldHVybiBlZGl0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUywwQkFBMEI7QUFDbkMsU0FBb0Msa0JBQWtCLHVCQUF1QjtBQUM3RSxTQUFTLG9CQUFvQixvQkFBb0Isa0JBQWtCO0FBR25FLFNBQVMsb0JBQW9CLFlBQVkseUJBQXlCO0FBQ2xFLFNBQVMsVUFBVSx1QkFBdUI7QUFFMUMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaURBQWlEO0FBRTFELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXVILG1D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QUssUUFBUSxTQUFTLEdBQUcsR0FBRztBQUNyRixVQUFNLGdCQUFnQixVQUFVLGVBQWUsRUFBRSxZQUFZLEtBQUssYUFBYSxLQUFLO0FBQ3BGLFVBQU0seUJBQXlCLFVBQVUsY0FBYyxjQUFjLFVBQVUsTUFBTTtBQUNyRixRQUFJLHdCQUF3QjtBQUMzQixhQUFPLDBCQUEwQixNQUFNLFNBQVM7QUFBQSxJQUNqRDtBQUFBLEVBQ0Q7QUFJQSxNQUFJLG9CQUFvQixHQUFHO0FBQzFCLFVBQU0sZUFBZSxtQkFBbUIsY0FBYyxLQUFLLE9BQU87QUFDbEUsVUFBTSxlQUFlLG1CQUFtQixhQUFhLE1BQU0sWUFBWSxHQUFHLEtBQUssUUFBUSxNQUFNLFlBQVksQ0FBQztBQUcxRyxRQUFJLGVBQWUsaUJBQWlCLGFBQWEsUUFBUTtBQUN4RCxhQUFPLElBQUksa0JBQWtCLEtBQUssYUFBYSxXQUFXLFlBQVksRUFBRSxTQUFTLENBQUMsWUFBWSxHQUFHLEtBQUssUUFBUSxVQUFVLGNBQWMsS0FBSyxRQUFRLFNBQVMsWUFBWSxDQUFDO0FBQUEsSUFDMUs7QUFHQSxRQUFJLGVBQWUsaUJBQWlCLEtBQUssUUFBUSxRQUFRO0FBQ3hELGFBQU8sSUFBSSxrQkFBa0IsS0FBSyxhQUFhLFdBQVcsWUFBWSxFQUFFLFNBQVMsQ0FBQyxZQUFZLEdBQUcsRUFBRTtBQUFBLElBQ3BHO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQUVBLFNBQVMsMEJBQTBCLE1BQXlCLFdBQXVEO0FBQ2xILE1BQUksQ0FBQyxLQUFLLGFBQWEsU0FBUztBQUMvQixVQUFNLElBQUksbUJBQW1CLDJCQUEyQjtBQUFBLEVBQ3pEO0FBRUEsTUFBSSxLQUFLLGFBQWEsVUFBVSxHQUFHO0FBQ2xDLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxNQUFNLFVBQVUsT0FBTztBQUM3QixRQUFNLGdCQUFnQixVQUFVLGVBQWUsRUFBRSxZQUFZLEtBQUssYUFBYSxLQUFLO0FBQ3BGLFFBQU0sY0FBYyxjQUFjO0FBQ2xDLFFBQU0sa0JBQWtCLGNBQWM7QUFJdEMsTUFBSSxnQkFBZ0IsS0FBSyxrQkFBa0IsS0FBSyxLQUFLLFFBQVEsU0FBUyxHQUFHLEtBQUssQ0FBQyxLQUFLLFFBQVEsV0FBVyxHQUFHLEdBQUc7QUFDNUcsV0FBTyxJQUFJLGtCQUFrQixLQUFLLGFBQWEsTUFBTSxFQUFFLEdBQUcsTUFBTSxLQUFLLFFBQVEsTUFBTSxHQUFHLENBQUMsSUFBSSxNQUFNLENBQUM7QUFBQSxFQUNuRztBQUVBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsiSW5saW5lU3VnZ2VzdGlvbkl0ZW0iLCAicmVwbGFjZVRleHQiXQp9Cg==
