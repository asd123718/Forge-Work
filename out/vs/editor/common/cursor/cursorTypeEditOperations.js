import { CharCode } from "../../../base/common/charCode.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import * as strings from "../../../base/common/strings.js";
import { ReplaceCommand, ReplaceCommandWithOffsetCursorState, ReplaceCommandWithoutChangingPosition, ReplaceCommandThatPreservesSelection, ReplaceOvertypeCommand, ReplaceOvertypeCommandOnCompositionEnd } from "../commands/replaceCommand.js";
import { ShiftCommand } from "../commands/shiftCommand.js";
import { SurroundSelectionCommand } from "../commands/surroundSelectionCommand.js";
import { EditOperationResult, EditOperationType, isQuote } from "../cursorCommon.js";
import { WordCharacterClass, getMapForWordSeparators } from "../core/wordCharacterClassifier.js";
import { Range } from "../core/range.js";
import { Position } from "../core/position.js";
import { IndentAction } from "../languages/languageConfiguration.js";
import { getIndentationAtPosition } from "../languages/languageConfigurationRegistry.js";
import { EditorAutoIndentStrategy } from "../config/editorOptions.js";
import { createScopedLineTokens } from "../languages/supports.js";
import { getIndentActionForType, getIndentForEnter, getInheritIndentForLine } from "../languages/autoIndent.js";
import { getEnterAction } from "../languages/enterAction.js";
class AutoIndentOperation {
  static getEdits(config, model, selections, ch, isDoingComposition) {
    if (!isDoingComposition && this._isAutoIndentType(config, model, selections)) {
      const indentationForSelections = [];
      for (const selection of selections) {
        const indentation = this._findActualIndentationForSelection(config, model, selection, ch);
        if (indentation === null) {
          return;
        }
        indentationForSelections.push({ selection, indentation });
      }
      const autoClosingPairClose = AutoClosingOpenCharTypeOperation.getAutoClosingPairClose(config, model, selections, ch, false);
      return this._getIndentationAndAutoClosingPairEdits(config, model, indentationForSelections, ch, autoClosingPairClose);
    }
    return;
  }
  static _isAutoIndentType(config, model, selections) {
    if (config.autoIndent < EditorAutoIndentStrategy.Full) {
      return false;
    }
    for (let i = 0, len = selections.length; i < len; i++) {
      if (!model.tokenization.isCheapToTokenize(selections[i].getEndPosition().lineNumber)) {
        return false;
      }
    }
    return true;
  }
  static _findActualIndentationForSelection(config, model, selection, ch) {
    const actualIndentation = getIndentActionForType(config, model, selection, ch, {
      shiftIndent: (indentation) => {
        return shiftIndent(config, indentation);
      },
      unshiftIndent: (indentation) => {
        return unshiftIndent(config, indentation);
      }
    }, config.languageConfigurationService);
    if (actualIndentation === null) {
      return null;
    }
    const currentIndentation = getIndentationAtPosition(model, selection.startLineNumber, selection.startColumn);
    if (actualIndentation === config.normalizeIndentation(currentIndentation)) {
      return null;
    }
    return actualIndentation;
  }
  static _getIndentationAndAutoClosingPairEdits(config, model, indentationForSelections, ch, autoClosingPairClose) {
    const commands = indentationForSelections.map(({ selection, indentation }) => {
      if (autoClosingPairClose !== null) {
        const indentationEdit = this._getEditFromIndentationAndSelection(config, model, indentation, selection, ch, false);
        return new TypeWithIndentationAndAutoClosingCommand(indentationEdit, selection, ch, autoClosingPairClose);
      } else {
        const indentationEdit = this._getEditFromIndentationAndSelection(config, model, indentation, selection, ch, true);
        return typeCommand(indentationEdit.range, indentationEdit.text, false);
      }
    });
    const editOptions = { shouldPushStackElementBefore: true, shouldPushStackElementAfter: false };
    return new EditOperationResult(EditOperationType.TypingOther, commands, editOptions);
  }
  static _getEditFromIndentationAndSelection(config, model, indentation, selection, ch, includeChInEdit = true) {
    const startLineNumber = selection.startLineNumber;
    const firstNonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(startLineNumber);
    let text = config.normalizeIndentation(indentation);
    if (firstNonWhitespaceColumn !== 0) {
      const startLine = model.getLineContent(startLineNumber);
      text += startLine.substring(firstNonWhitespaceColumn - 1, selection.startColumn - 1);
    }
    text += includeChInEdit ? ch : "";
    const range = new Range(startLineNumber, 1, selection.endLineNumber, selection.endColumn);
    return { range, text };
  }
}
class AutoClosingOvertypeOperation {
  static getEdits(prevEditOperationType, config, model, selections, autoClosedCharacters, ch) {
    if (isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch)) {
      return this._runAutoClosingOvertype(prevEditOperationType, selections, ch);
    }
    return;
  }
  static _runAutoClosingOvertype(prevEditOperationType, selections, ch) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      const position = selection.getPosition();
      const typeSelection = new Range(position.lineNumber, position.column, position.lineNumber, position.column + 1);
      commands[i] = new ReplaceCommand(typeSelection, ch);
    }
    return new EditOperationResult(EditOperationType.TypingOther, commands, {
      shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, EditOperationType.TypingOther),
      shouldPushStackElementAfter: false
    });
  }
}
class AutoClosingOvertypeWithInterceptorsOperation {
  static getEdits(config, model, selections, autoClosedCharacters, ch) {
    if (isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch)) {
      const commands = selections.map((s) => new ReplaceCommand(new Range(s.positionLineNumber, s.positionColumn, s.positionLineNumber, s.positionColumn + 1), "", false));
      return new EditOperationResult(EditOperationType.TypingOther, commands, {
        shouldPushStackElementBefore: true,
        shouldPushStackElementAfter: false
      });
    }
    return;
  }
}
class AutoClosingOpenCharTypeOperation {
  static getEdits(config, model, selections, ch, chIsAlreadyTyped, isDoingComposition) {
    if (!isDoingComposition) {
      const autoClosingPairClose = this.getAutoClosingPairClose(config, model, selections, ch, chIsAlreadyTyped);
      if (autoClosingPairClose !== null) {
        return this._runAutoClosingOpenCharType(selections, ch, chIsAlreadyTyped, autoClosingPairClose);
      }
    }
    return;
  }
  static _runAutoClosingOpenCharType(selections, ch, chIsAlreadyTyped, autoClosingPairClose) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      commands[i] = new TypeWithAutoClosingCommand(selection, ch, !chIsAlreadyTyped, autoClosingPairClose);
    }
    return new EditOperationResult(EditOperationType.TypingOther, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: false
    });
  }
  static getAutoClosingPairClose(config, model, selections, ch, chIsAlreadyTyped) {
    for (const selection of selections) {
      if (!selection.isEmpty()) {
        return null;
      }
    }
    const positions = selections.map((s) => {
      const position = s.getPosition();
      if (chIsAlreadyTyped) {
        return { lineNumber: position.lineNumber, beforeColumn: position.column - ch.length, afterColumn: position.column };
      } else {
        return { lineNumber: position.lineNumber, beforeColumn: position.column, afterColumn: position.column };
      }
    });
    const pair = this._findAutoClosingPairOpen(config, model, positions.map((p) => new Position(p.lineNumber, p.beforeColumn)), ch);
    if (!pair) {
      return null;
    }
    let autoCloseConfig;
    let shouldAutoCloseBefore;
    const chIsQuote = isQuote(ch);
    if (chIsQuote) {
      autoCloseConfig = config.autoClosingQuotes;
      shouldAutoCloseBefore = config.shouldAutoCloseBefore.quote;
    } else {
      const pairIsForComments = config.blockCommentStartToken ? pair.open.includes(config.blockCommentStartToken) : false;
      if (pairIsForComments) {
        autoCloseConfig = config.autoClosingComments;
        shouldAutoCloseBefore = config.shouldAutoCloseBefore.comment;
      } else {
        autoCloseConfig = config.autoClosingBrackets;
        shouldAutoCloseBefore = config.shouldAutoCloseBefore.bracket;
      }
    }
    if (autoCloseConfig === "never") {
      return null;
    }
    const containedPair = this._findContainedAutoClosingPair(config, pair);
    const containedPairClose = containedPair ? containedPair.close : "";
    let isContainedPairPresent = true;
    for (const position of positions) {
      const { lineNumber, beforeColumn, afterColumn } = position;
      const lineText = model.getLineContent(lineNumber);
      const lineBefore = lineText.substring(0, beforeColumn - 1);
      const lineAfter = lineText.substring(afterColumn - 1);
      if (!lineAfter.startsWith(containedPairClose)) {
        isContainedPairPresent = false;
      }
      if (lineAfter.length > 0) {
        const characterAfter = lineAfter.charAt(0);
        const isBeforeCloseBrace = this._isBeforeClosingBrace(config, lineAfter);
        if (!isBeforeCloseBrace && !shouldAutoCloseBefore(characterAfter)) {
          return null;
        }
      }
      if (pair.open.length === 1 && (ch === "'" || ch === '"') && autoCloseConfig !== "always") {
        const wordSeparators = getMapForWordSeparators(config.wordSeparators, []);
        if (lineBefore.length > 0) {
          const characterBefore = lineBefore.charCodeAt(lineBefore.length - 1);
          if (wordSeparators.get(characterBefore) === WordCharacterClass.Regular) {
            return null;
          }
        }
      }
      if (!model.tokenization.isCheapToTokenize(lineNumber)) {
        return null;
      }
      model.tokenization.forceTokenization(lineNumber);
      const lineTokens = model.tokenization.getLineTokens(lineNumber);
      const scopedLineTokens = createScopedLineTokens(lineTokens, beforeColumn - 1);
      if (!pair.shouldAutoClose(scopedLineTokens, beforeColumn - scopedLineTokens.firstCharOffset)) {
        return null;
      }
      const neutralCharacter = pair.findNeutralCharacter();
      if (neutralCharacter) {
        const tokenType = model.tokenization.getTokenTypeIfInsertingCharacter(lineNumber, beforeColumn, neutralCharacter);
        if (!pair.isOK(tokenType)) {
          return null;
        }
      }
    }
    if (isContainedPairPresent) {
      return pair.close.substring(0, pair.close.length - containedPairClose.length);
    } else {
      return pair.close;
    }
  }
  /**
   * Find another auto-closing pair that is contained by the one passed in.
   *
   * e.g. when having [(,)] and [(*,*)] as auto-closing pairs
   * this method will find [(,)] as a containment pair for [(*,*)]
   */
  static _findContainedAutoClosingPair(config, pair) {
    if (pair.open.length <= 1) {
      return null;
    }
    const lastChar = pair.close.charAt(pair.close.length - 1);
    const candidates = config.autoClosingPairs.autoClosingPairsCloseByEnd.get(lastChar) || [];
    let result = null;
    for (const candidate of candidates) {
      if (candidate.open !== pair.open && pair.open.includes(candidate.open) && pair.close.endsWith(candidate.close)) {
        if (!result || candidate.open.length > result.open.length) {
          result = candidate;
        }
      }
    }
    return result;
  }
  /**
   * Determine if typing `ch` at all `positions` in the `model` results in an
   * auto closing open sequence being typed.
   *
   * Auto closing open sequences can consist of multiple characters, which
   * can lead to ambiguities. In such a case, the longest auto-closing open
   * sequence is returned.
   */
  static _findAutoClosingPairOpen(config, model, positions, ch) {
    const candidates = config.autoClosingPairs.autoClosingPairsOpenByEnd.get(ch);
    if (!candidates) {
      return null;
    }
    let result = null;
    for (const candidate of candidates) {
      if (result === null || candidate.open.length > result.open.length) {
        let candidateIsMatch = true;
        for (const position of positions) {
          const relevantText = model.getValueInRange(new Range(position.lineNumber, position.column - candidate.open.length + 1, position.lineNumber, position.column));
          if (relevantText + ch !== candidate.open) {
            candidateIsMatch = false;
            break;
          }
        }
        if (candidateIsMatch) {
          result = candidate;
        }
      }
    }
    return result;
  }
  static _isBeforeClosingBrace(config, lineAfter) {
    const nextChar = lineAfter.charAt(0);
    const potentialStartingBraces = config.autoClosingPairs.autoClosingPairsOpenByStart.get(nextChar) || [];
    const potentialClosingBraces = config.autoClosingPairs.autoClosingPairsCloseByStart.get(nextChar) || [];
    const isBeforeStartingBrace = potentialStartingBraces.some((x) => lineAfter.startsWith(x.open));
    const isBeforeClosingBrace = potentialClosingBraces.some((x) => lineAfter.startsWith(x.close));
    return !isBeforeStartingBrace && isBeforeClosingBrace;
  }
}
class CompositionEndOvertypeOperation {
  static getEdits(config, compositions) {
    const isOvertypeMode = config.inputMode === "overtype";
    if (!isOvertypeMode) {
      return null;
    }
    const commands = compositions.map((composition) => new ReplaceOvertypeCommandOnCompositionEnd(composition.insertedTextRange));
    return new EditOperationResult(EditOperationType.TypingOther, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: false
    });
  }
}
class SurroundSelectionOperation {
  static getEdits(config, model, selections, ch, isDoingComposition) {
    if (!isDoingComposition && this._isSurroundSelectionType(config, model, selections, ch)) {
      return this._runSurroundSelectionType(config, selections, ch);
    }
    return;
  }
  static _runSurroundSelectionType(config, selections, ch) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      const closeCharacter = config.surroundingPairs[ch];
      commands[i] = new SurroundSelectionCommand(selection, ch, closeCharacter);
    }
    return new EditOperationResult(EditOperationType.Other, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: true
    });
  }
  static _isSurroundSelectionType(config, model, selections, ch) {
    if (!shouldSurroundChar(config, ch) || !config.surroundingPairs.hasOwnProperty(ch)) {
      return false;
    }
    const isTypingAQuoteCharacter = isQuote(ch);
    for (const selection of selections) {
      if (selection.isEmpty()) {
        return false;
      }
      let selectionContainsOnlyWhitespace = true;
      for (let lineNumber = selection.startLineNumber; lineNumber <= selection.endLineNumber; lineNumber++) {
        const lineText = model.getLineContent(lineNumber);
        const startIndex = lineNumber === selection.startLineNumber ? selection.startColumn - 1 : 0;
        const endIndex = lineNumber === selection.endLineNumber ? selection.endColumn - 1 : lineText.length;
        const selectedText = lineText.substring(startIndex, endIndex);
        if (/[^ \t]/.test(selectedText)) {
          selectionContainsOnlyWhitespace = false;
          break;
        }
      }
      if (selectionContainsOnlyWhitespace) {
        return false;
      }
      if (isTypingAQuoteCharacter && selection.startLineNumber === selection.endLineNumber && selection.startColumn + 1 === selection.endColumn) {
        const selectionText = model.getValueInRange(selection);
        if (isQuote(selectionText)) {
          return false;
        }
      }
    }
    return true;
  }
}
class InterceptorElectricCharOperation {
  static getEdits(prevEditOperationType, config, model, selections, ch, isDoingComposition) {
    if (!isDoingComposition && this._isTypeInterceptorElectricChar(config, model, selections)) {
      const r = this._typeInterceptorElectricChar(prevEditOperationType, config, model, selections[0], ch);
      if (r) {
        return r;
      }
    }
    return;
  }
  static _isTypeInterceptorElectricChar(config, model, selections) {
    if (selections.length === 1 && model.tokenization.isCheapToTokenize(selections[0].getEndPosition().lineNumber)) {
      return true;
    }
    return false;
  }
  static _typeInterceptorElectricChar(prevEditOperationType, config, model, selection, ch) {
    if (!config.electricChars.hasOwnProperty(ch) || !selection.isEmpty()) {
      return null;
    }
    const position = selection.getPosition();
    model.tokenization.forceTokenization(position.lineNumber);
    const lineTokens = model.tokenization.getLineTokens(position.lineNumber);
    let electricAction;
    try {
      electricAction = config.onElectricCharacter(ch, lineTokens, position.column);
    } catch (e) {
      onUnexpectedError(e);
      return null;
    }
    if (!electricAction) {
      return null;
    }
    if (electricAction.matchOpenBracket) {
      const endColumn = (lineTokens.getLineContent() + ch).lastIndexOf(electricAction.matchOpenBracket) + 1;
      const match = model.bracketPairs.findMatchingBracketUp(
        electricAction.matchOpenBracket,
        {
          lineNumber: position.lineNumber,
          column: endColumn
        },
        500
        /* give at most 500ms to compute */
      );
      if (match) {
        if (match.startLineNumber === position.lineNumber) {
          return null;
        }
        const matchLine = model.getLineContent(match.startLineNumber);
        const matchLineIndentation = strings.getLeadingWhitespace(matchLine);
        const newIndentation = config.normalizeIndentation(matchLineIndentation);
        const lineText = model.getLineContent(position.lineNumber);
        const lineFirstNonBlankColumn = model.getLineFirstNonWhitespaceColumn(position.lineNumber) || position.column;
        const prefix = lineText.substring(lineFirstNonBlankColumn - 1, position.column - 1);
        const typeText = newIndentation + prefix + ch;
        const typeSelection = new Range(position.lineNumber, 1, position.lineNumber, position.column);
        const command = new ReplaceCommand(typeSelection, typeText);
        return new EditOperationResult(getTypingOperation(typeText, prevEditOperationType), [command], {
          shouldPushStackElementBefore: false,
          shouldPushStackElementAfter: true
        });
      }
    }
    return null;
  }
}
class SimpleCharacterTypeOperation {
  static getEdits(config, prevEditOperationType, selections, ch, isDoingComposition) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const ChosenReplaceCommand = config.inputMode === "overtype" && !isDoingComposition ? ReplaceOvertypeCommand : ReplaceCommand;
      commands[i] = new ChosenReplaceCommand(selections[i], ch);
    }
    const opType = getTypingOperation(ch, prevEditOperationType);
    return new EditOperationResult(opType, commands, {
      shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, opType),
      shouldPushStackElementAfter: false
    });
  }
}
class EnterOperation {
  static getEdits(config, model, selections, ch, isDoingComposition) {
    if (!isDoingComposition && ch === "\n") {
      const commands = [];
      for (let i = 0, len = selections.length; i < len; i++) {
        commands[i] = this._enter(config, model, false, selections[i]);
      }
      return new EditOperationResult(EditOperationType.TypingOther, commands, {
        shouldPushStackElementBefore: true,
        shouldPushStackElementAfter: false
      });
    }
    return;
  }
  static _enter(config, model, keepPosition, range) {
    if (config.autoIndent === EditorAutoIndentStrategy.None) {
      return typeCommand(range, "\n", keepPosition);
    }
    if (!model.tokenization.isCheapToTokenize(range.getStartPosition().lineNumber) || config.autoIndent === EditorAutoIndentStrategy.Keep) {
      const lineText2 = model.getLineContent(range.startLineNumber);
      const indentation2 = strings.getLeadingWhitespace(lineText2).substring(0, range.startColumn - 1);
      return typeCommand(range, "\n" + config.normalizeIndentation(indentation2), keepPosition);
    }
    const r = getEnterAction(config.autoIndent, model, range, config.languageConfigurationService);
    if (r) {
      if (r.indentAction === IndentAction.None) {
        return typeCommand(range, "\n" + config.normalizeIndentation(r.indentation + r.appendText), keepPosition);
      } else if (r.indentAction === IndentAction.Indent) {
        return typeCommand(range, "\n" + config.normalizeIndentation(r.indentation + r.appendText), keepPosition);
      } else if (r.indentAction === IndentAction.IndentOutdent) {
        const normalIndent = config.normalizeIndentation(r.indentation);
        const increasedIndent = config.normalizeIndentation(r.indentation + r.appendText);
        const typeText = "\n" + increasedIndent + "\n" + normalIndent;
        if (keepPosition) {
          return new ReplaceCommandWithoutChangingPosition(range, typeText, true);
        } else {
          return new ReplaceCommandWithOffsetCursorState(range, typeText, -1, increasedIndent.length - normalIndent.length, true);
        }
      } else if (r.indentAction === IndentAction.Outdent) {
        const actualIndentation = unshiftIndent(config, r.indentation);
        return typeCommand(range, "\n" + config.normalizeIndentation(actualIndentation + r.appendText), keepPosition);
      }
    }
    const lineText = model.getLineContent(range.startLineNumber);
    const indentation = strings.getLeadingWhitespace(lineText).substring(0, range.startColumn - 1);
    if (config.autoIndent >= EditorAutoIndentStrategy.Full) {
      const ir = getIndentForEnter(config.autoIndent, model, range, {
        unshiftIndent: (indent) => {
          return unshiftIndent(config, indent);
        },
        shiftIndent: (indent) => {
          return shiftIndent(config, indent);
        },
        normalizeIndentation: (indent) => {
          return config.normalizeIndentation(indent);
        }
      }, config.languageConfigurationService);
      if (ir) {
        let oldEndViewColumn = config.visibleColumnFromColumn(model, range.getEndPosition());
        const oldEndColumn = range.endColumn;
        const newLineContent = model.getLineContent(range.endLineNumber);
        const firstNonWhitespace = strings.firstNonWhitespaceIndex(newLineContent);
        if (firstNonWhitespace >= 0) {
          range = range.setEndPosition(range.endLineNumber, Math.max(range.endColumn, firstNonWhitespace + 1));
        } else {
          range = range.setEndPosition(range.endLineNumber, model.getLineMaxColumn(range.endLineNumber));
        }
        if (keepPosition) {
          return new ReplaceCommandWithoutChangingPosition(range, "\n" + config.normalizeIndentation(ir.afterEnter), true);
        } else {
          let offset = 0;
          if (oldEndColumn <= firstNonWhitespace + 1) {
            if (!config.insertSpaces) {
              oldEndViewColumn = Math.ceil(oldEndViewColumn / config.indentSize);
            }
            offset = Math.min(oldEndViewColumn + 1 - config.normalizeIndentation(ir.afterEnter).length - 1, 0);
          }
          return new ReplaceCommandWithOffsetCursorState(range, "\n" + config.normalizeIndentation(ir.afterEnter), 0, offset, true);
        }
      }
    }
    return typeCommand(range, "\n" + config.normalizeIndentation(indentation), keepPosition);
  }
  static lineInsertBefore(config, model, selections) {
    if (model === null || selections === null) {
      return [];
    }
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      let lineNumber = selections[i].positionLineNumber;
      if (lineNumber === 1) {
        commands[i] = new ReplaceCommandWithoutChangingPosition(new Range(1, 1, 1, 1), "\n");
      } else {
        lineNumber--;
        const column = model.getLineMaxColumn(lineNumber);
        commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
      }
    }
    return commands;
  }
  static lineInsertAfter(config, model, selections) {
    if (model === null || selections === null) {
      return [];
    }
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const lineNumber = selections[i].positionLineNumber;
      const column = model.getLineMaxColumn(lineNumber);
      commands[i] = this._enter(config, model, false, new Range(lineNumber, column, lineNumber, column));
    }
    return commands;
  }
  static lineBreakInsert(config, model, selections) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      commands[i] = this._enter(config, model, true, selections[i]);
    }
    return commands;
  }
}
class PasteOperation {
  static getEdits(config, model, selections, text, pasteOnNewLine, multicursorText) {
    const distributedPaste = this._distributePasteToCursors(config, selections, text, pasteOnNewLine, multicursorText);
    if (distributedPaste) {
      selections = selections.sort(Range.compareRangesUsingStarts);
      return this._distributedPaste(config, model, selections, distributedPaste);
    } else {
      return this._simplePaste(config, model, selections, text, pasteOnNewLine);
    }
  }
  static _distributePasteToCursors(config, selections, text, pasteOnNewLine, multicursorText) {
    if (selections.length === 1) {
      return null;
    }
    if (multicursorText && multicursorText.length === selections.length) {
      return multicursorText;
    }
    if (pasteOnNewLine) {
      return null;
    }
    if (config.multiCursorPaste === "spread") {
      if (text.charCodeAt(text.length - 1) === CharCode.LineFeed) {
        text = text.substring(0, text.length - 1);
      }
      if (text.charCodeAt(text.length - 1) === CharCode.CarriageReturn) {
        text = text.substring(0, text.length - 1);
      }
      const lines = strings.splitLines(text);
      if (lines.length === selections.length) {
        return lines;
      }
    }
    return null;
  }
  static _distributedPaste(config, model, selections, text) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const shouldOvertypeOnPaste = config.overtypeOnPaste && config.inputMode === "overtype";
      const ChosenReplaceCommand = shouldOvertypeOnPaste ? ReplaceOvertypeCommand : ReplaceCommand;
      commands[i] = new ChosenReplaceCommand(selections[i], text[i]);
    }
    return new EditOperationResult(EditOperationType.Other, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: true
    });
  }
  static _simplePaste(config, model, selections, text, pasteOnNewLine) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      const position = selection.getPosition();
      if (pasteOnNewLine && !selection.isEmpty()) {
        pasteOnNewLine = false;
      }
      if (pasteOnNewLine && text.indexOf("\n") !== text.length - 1) {
        pasteOnNewLine = false;
      }
      if (pasteOnNewLine) {
        const typeSelection = new Range(position.lineNumber, 1, position.lineNumber, 1);
        commands[i] = new ReplaceCommandThatPreservesSelection(typeSelection, text, selection, true);
      } else {
        const shouldOvertypeOnPaste = config.overtypeOnPaste && config.inputMode === "overtype";
        const ChosenReplaceCommand = shouldOvertypeOnPaste ? ReplaceOvertypeCommand : ReplaceCommand;
        commands[i] = new ChosenReplaceCommand(selection, text);
      }
    }
    return new EditOperationResult(EditOperationType.Other, commands, {
      shouldPushStackElementBefore: true,
      shouldPushStackElementAfter: true
    });
  }
}
class CompositionOperation {
  static getEdits(prevEditOperationType, config, model, selections, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
    const commands = selections.map((selection) => this._compositionType(model, selection, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta));
    return new EditOperationResult(EditOperationType.TypingOther, commands, {
      shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, EditOperationType.TypingOther),
      shouldPushStackElementAfter: false
    });
  }
  static _compositionType(model, selection, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
    if (!selection.isEmpty()) {
      return null;
    }
    const pos = selection.getPosition();
    const startColumn = Math.max(1, pos.column - replacePrevCharCnt);
    const endColumn = Math.min(model.getLineMaxColumn(pos.lineNumber), pos.column + replaceNextCharCnt);
    const range = new Range(pos.lineNumber, startColumn, pos.lineNumber, endColumn);
    return new ReplaceCommandWithOffsetCursorState(range, text, 0, positionDelta);
  }
}
class TypeWithoutInterceptorsOperation {
  static getEdits(prevEditOperationType, selections, str) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      commands[i] = new ReplaceCommand(selections[i], str);
    }
    const opType = getTypingOperation(str, prevEditOperationType);
    return new EditOperationResult(opType, commands, {
      shouldPushStackElementBefore: shouldPushStackElementBetween(prevEditOperationType, opType),
      shouldPushStackElementAfter: false
    });
  }
}
class TabOperation {
  static getCommands(config, model, selections) {
    const commands = [];
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      if (selection.isEmpty()) {
        const lineText = model.getLineContent(selection.startLineNumber);
        if (/^\s*$/.test(lineText) && model.tokenization.isCheapToTokenize(selection.startLineNumber)) {
          let goodIndent = this._goodIndentForLine(config, model, selection.startLineNumber);
          goodIndent = goodIndent || "	";
          const possibleTypeText = config.normalizeIndentation(goodIndent);
          if (!lineText.startsWith(possibleTypeText)) {
            commands[i] = new ReplaceCommand(new Range(selection.startLineNumber, 1, selection.startLineNumber, lineText.length + 1), possibleTypeText, true);
            continue;
          }
        }
        commands[i] = this._replaceJumpToNextIndent(config, model, selection, true);
      } else {
        if (selection.startLineNumber === selection.endLineNumber) {
          const lineMaxColumn = model.getLineMaxColumn(selection.startLineNumber);
          if (selection.startColumn !== 1 || selection.endColumn !== lineMaxColumn) {
            commands[i] = this._replaceJumpToNextIndent(config, model, selection, false);
            continue;
          }
        }
        commands[i] = new ShiftCommand(selection, {
          isUnshift: false,
          tabSize: config.tabSize,
          indentSize: config.indentSize,
          insertSpaces: config.insertSpaces,
          useTabStops: config.useTabStops,
          autoIndent: config.autoIndent
        }, config.languageConfigurationService);
      }
    }
    return commands;
  }
  static _goodIndentForLine(config, model, lineNumber) {
    let action = null;
    let indentation = "";
    const expectedIndentAction = getInheritIndentForLine(config.autoIndent, model, lineNumber, false, config.languageConfigurationService);
    if (expectedIndentAction) {
      action = expectedIndentAction.action;
      indentation = expectedIndentAction.indentation;
    } else if (lineNumber > 1) {
      let lastLineNumber;
      for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
        const lineText = model.getLineContent(lastLineNumber);
        const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineText);
        if (nonWhitespaceIdx >= 0) {
          break;
        }
      }
      if (lastLineNumber < 1) {
        return null;
      }
      const maxColumn = model.getLineMaxColumn(lastLineNumber);
      const expectedEnterAction = getEnterAction(config.autoIndent, model, new Range(lastLineNumber, maxColumn, lastLineNumber, maxColumn), config.languageConfigurationService);
      if (expectedEnterAction) {
        indentation = expectedEnterAction.indentation + expectedEnterAction.appendText;
      }
    }
    if (action) {
      if (action === IndentAction.Indent) {
        indentation = shiftIndent(config, indentation);
      }
      if (action === IndentAction.Outdent) {
        indentation = unshiftIndent(config, indentation);
      }
      indentation = config.normalizeIndentation(indentation);
    }
    if (!indentation) {
      return null;
    }
    return indentation;
  }
  static _replaceJumpToNextIndent(config, model, selection, insertsAutoWhitespace) {
    let typeText = "";
    const position = selection.getStartPosition();
    if (config.insertSpaces) {
      const visibleColumnFromColumn = config.visibleColumnFromColumn(model, position);
      const indentSize = config.indentSize;
      const spacesCnt = indentSize - visibleColumnFromColumn % indentSize;
      for (let i = 0; i < spacesCnt; i++) {
        typeText += " ";
      }
    } else {
      typeText = "	";
    }
    return new ReplaceCommand(selection, typeText, insertsAutoWhitespace);
  }
}
class BaseTypeWithAutoClosingCommand extends ReplaceCommandWithOffsetCursorState {
  constructor(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter) {
    super(selection, text, lineNumberDeltaOffset, columnDeltaOffset);
    this._openCharacter = openCharacter;
    this._closeCharacter = closeCharacter;
    this.closeCharacterRange = null;
    this.enclosingRange = null;
  }
  _computeCursorStateWithRange(model, range, helper) {
    this.closeCharacterRange = new Range(range.startLineNumber, range.endColumn - this._closeCharacter.length, range.endLineNumber, range.endColumn);
    this.enclosingRange = new Range(range.startLineNumber, range.endColumn - this._openCharacter.length - this._closeCharacter.length, range.endLineNumber, range.endColumn);
    return super.computeCursorState(model, helper);
  }
}
class TypeWithAutoClosingCommand extends BaseTypeWithAutoClosingCommand {
  constructor(selection, openCharacter, insertOpenCharacter, closeCharacter) {
    const text = (insertOpenCharacter ? openCharacter : "") + closeCharacter;
    const lineNumberDeltaOffset = 0;
    const columnDeltaOffset = -closeCharacter.length;
    super(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter);
  }
  computeCursorState(model, helper) {
    const inverseEditOperations = helper.getInverseEditOperations();
    const range = inverseEditOperations[0].range;
    return this._computeCursorStateWithRange(model, range, helper);
  }
}
class TypeWithIndentationAndAutoClosingCommand extends BaseTypeWithAutoClosingCommand {
  constructor(autoIndentationEdit, selection, openCharacter, closeCharacter) {
    const text = openCharacter + closeCharacter;
    const lineNumberDeltaOffset = 0;
    const columnDeltaOffset = openCharacter.length;
    super(selection, text, lineNumberDeltaOffset, columnDeltaOffset, openCharacter, closeCharacter);
    this._autoIndentationEdit = autoIndentationEdit;
    this._autoClosingEdit = { range: selection, text };
  }
  getEditOperations(model, builder) {
    builder.addTrackedEditOperation(this._autoIndentationEdit.range, this._autoIndentationEdit.text);
    builder.addTrackedEditOperation(this._autoClosingEdit.range, this._autoClosingEdit.text);
  }
  computeCursorState(model, helper) {
    const inverseEditOperations = helper.getInverseEditOperations();
    if (inverseEditOperations.length !== 2) {
      throw new Error("There should be two inverse edit operations!");
    }
    const range1 = inverseEditOperations[0].range;
    const range2 = inverseEditOperations[1].range;
    const range = range1.plusRange(range2);
    return this._computeCursorStateWithRange(model, range, helper);
  }
}
function getTypingOperation(typedText, previousTypingOperation) {
  if (typedText === " ") {
    return previousTypingOperation === EditOperationType.TypingFirstSpace || previousTypingOperation === EditOperationType.TypingConsecutiveSpace ? EditOperationType.TypingConsecutiveSpace : EditOperationType.TypingFirstSpace;
  }
  return EditOperationType.TypingOther;
}
function shouldPushStackElementBetween(previousTypingOperation, typingOperation) {
  if (isTypingOperation(previousTypingOperation) && !isTypingOperation(typingOperation)) {
    return true;
  }
  if (previousTypingOperation === EditOperationType.TypingFirstSpace) {
    return false;
  }
  return normalizeOperationType(previousTypingOperation) !== normalizeOperationType(typingOperation);
}
function normalizeOperationType(type) {
  return type === EditOperationType.TypingConsecutiveSpace || type === EditOperationType.TypingFirstSpace ? "space" : type;
}
function isTypingOperation(type) {
  return type === EditOperationType.TypingOther || type === EditOperationType.TypingFirstSpace || type === EditOperationType.TypingConsecutiveSpace;
}
function isAutoClosingOvertype(config, model, selections, autoClosedCharacters, ch) {
  if (config.autoClosingOvertype === "never") {
    return false;
  }
  if (!config.autoClosingPairs.autoClosingPairsCloseSingleChar.has(ch)) {
    return false;
  }
  for (let i = 0, len = selections.length; i < len; i++) {
    const selection = selections[i];
    if (!selection.isEmpty()) {
      return false;
    }
    const position = selection.getPosition();
    const lineText = model.getLineContent(position.lineNumber);
    const afterCharacter = lineText.charAt(position.column - 1);
    if (afterCharacter !== ch) {
      return false;
    }
    const chIsQuote = isQuote(ch);
    const beforeCharacter = position.column > 2 ? lineText.charCodeAt(position.column - 2) : CharCode.Null;
    if (beforeCharacter === CharCode.Backslash && chIsQuote) {
      return false;
    }
    if (config.autoClosingOvertype === "auto") {
      let found = false;
      for (let j = 0, lenJ = autoClosedCharacters.length; j < lenJ; j++) {
        const autoClosedCharacter = autoClosedCharacters[j];
        if (position.lineNumber === autoClosedCharacter.startLineNumber && position.column === autoClosedCharacter.startColumn) {
          found = true;
          break;
        }
      }
      if (!found) {
        return false;
      }
    }
  }
  return true;
}
function typeCommand(range, text, keepPosition) {
  if (keepPosition) {
    return new ReplaceCommandWithoutChangingPosition(range, text, true);
  } else {
    return new ReplaceCommand(range, text, true);
  }
}
function shiftIndent(config, indentation, count) {
  count = count || 1;
  return ShiftCommand.shiftIndent(indentation, indentation.length + count, config.tabSize, config.indentSize, config.insertSpaces);
}
function unshiftIndent(config, indentation, count) {
  count = count || 1;
  return ShiftCommand.unshiftIndent(indentation, indentation.length + count, config.tabSize, config.indentSize, config.insertSpaces);
}
function shouldSurroundChar(config, ch) {
  if (isQuote(ch)) {
    return config.autoSurround === "quotes" || config.autoSurround === "languageDefined";
  } else {
    return config.autoSurround === "brackets" || config.autoSurround === "languageDefined";
  }
}
export {
  AutoClosingOpenCharTypeOperation,
  AutoClosingOvertypeOperation,
  AutoClosingOvertypeWithInterceptorsOperation,
  AutoIndentOperation,
  BaseTypeWithAutoClosingCommand,
  CompositionEndOvertypeOperation,
  CompositionOperation,
  EnterOperation,
  InterceptorElectricCharOperation,
  PasteOperation,
  SimpleCharacterTypeOperation,
  SurroundSelectionOperation,
  TabOperation,
  TypeWithoutInterceptorsOperation,
  shiftIndent,
  shouldSurroundChar,
  unshiftIndent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY3Vyc29yXFxjdXJzb3JUeXBlRWRpdE9wZXJhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBSZXBsYWNlQ29tbWFuZCwgUmVwbGFjZUNvbW1hbmRXaXRoT2Zmc2V0Q3Vyc29yU3RhdGUsIFJlcGxhY2VDb21tYW5kV2l0aG91dENoYW5naW5nUG9zaXRpb24sIFJlcGxhY2VDb21tYW5kVGhhdFByZXNlcnZlc1NlbGVjdGlvbiwgUmVwbGFjZU92ZXJ0eXBlQ29tbWFuZCwgUmVwbGFjZU92ZXJ0eXBlQ29tbWFuZE9uQ29tcG9zaXRpb25FbmQgfSBmcm9tICcuLi9jb21tYW5kcy9yZXBsYWNlQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBTaGlmdENvbW1hbmQgfSBmcm9tICcuLi9jb21tYW5kcy9zaGlmdENvbW1hbmQuanMnO1xuaW1wb3J0IHsgU3Vycm91bmRTZWxlY3Rpb25Db21tYW5kIH0gZnJvbSAnLi4vY29tbWFuZHMvc3Vycm91bmRTZWxlY3Rpb25Db21tYW5kLmpzJztcbmltcG9ydCB7IEN1cnNvckNvbmZpZ3VyYXRpb24sIEVkaXRPcGVyYXRpb25SZXN1bHQsIEVkaXRPcGVyYXRpb25UeXBlLCBJQ3Vyc29yU2ltcGxlTW9kZWwsIGlzUXVvdGUgfSBmcm9tICcuLi9jdXJzb3JDb21tb24uanMnO1xuaW1wb3J0IHsgV29yZENoYXJhY3RlckNsYXNzLCBnZXRNYXBGb3JXb3JkU2VwYXJhdG9ycyB9IGZyb20gJy4uL2NvcmUvd29yZENoYXJhY3RlckNsYXNzaWZpZXIuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZCwgSUN1cnNvclN0YXRlQ29tcHV0ZXJEYXRhLCBJRWRpdE9wZXJhdGlvbkJ1aWxkZXIgfSBmcm9tICcuLi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IEVudGVyQWN0aW9uLCBJbmRlbnRBY3Rpb24sIFN0YW5kYXJkQXV0b0Nsb3NpbmdQYWlyQ29uZGl0aW9uYWwgfSBmcm9tICcuLi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGdldEluZGVudGF0aW9uQXRQb3NpdGlvbiB9IGZyb20gJy4uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRWxlY3RyaWNBY3Rpb24gfSBmcm9tICcuLi9sYW5ndWFnZXMvc3VwcG9ydHMvZWxlY3RyaWNDaGFyYWN0ZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQXV0b0Nsb3NpbmdTdHJhdGVneSwgRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5IH0gZnJvbSAnLi4vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlU2NvcGVkTGluZVRva2VucyB9IGZyb20gJy4uL2xhbmd1YWdlcy9zdXBwb3J0cy5qcyc7XG5pbXBvcnQgeyBnZXRJbmRlbnRBY3Rpb25Gb3JUeXBlLCBnZXRJbmRlbnRGb3JFbnRlciwgZ2V0SW5oZXJpdEluZGVudEZvckxpbmUgfSBmcm9tICcuLi9sYW5ndWFnZXMvYXV0b0luZGVudC5qcyc7XG5pbXBvcnQgeyBnZXRFbnRlckFjdGlvbiB9IGZyb20gJy4uL2xhbmd1YWdlcy9lbnRlckFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21wb3NpdGlvbk91dGNvbWUgfSBmcm9tICcuL2N1cnNvclR5cGVPcGVyYXRpb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIEF1dG9JbmRlbnRPcGVyYXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RWRpdHMoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGNoOiBzdHJpbmcsIGlzRG9pbmdDb21wb3NpdGlvbjogYm9vbGVhbik6IEVkaXRPcGVyYXRpb25SZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaXNEb2luZ0NvbXBvc2l0aW9uICYmIHRoaXMuX2lzQXV0b0luZGVudFR5cGUoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9ucykpIHtcblx0XHRcdGNvbnN0IGluZGVudGF0aW9uRm9yU2VsZWN0aW9uczogeyBzZWxlY3Rpb246IFNlbGVjdGlvbjsgaW5kZW50YXRpb246IHN0cmluZyB9W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgaW5kZW50YXRpb24gPSB0aGlzLl9maW5kQWN0dWFsSW5kZW50YXRpb25Gb3JTZWxlY3Rpb24oY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9uLCBjaCk7XG5cdFx0XHRcdGlmIChpbmRlbnRhdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdC8vIEF1dG8gaW5kZW50YXRpb24gZmFpbGVkXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluZGVudGF0aW9uRm9yU2VsZWN0aW9ucy5wdXNoKHsgc2VsZWN0aW9uLCBpbmRlbnRhdGlvbiB9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGF1dG9DbG9zaW5nUGFpckNsb3NlID0gQXV0b0Nsb3NpbmdPcGVuQ2hhclR5cGVPcGVyYXRpb24uZ2V0QXV0b0Nsb3NpbmdQYWlyQ2xvc2UoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9ucywgY2gsIGZhbHNlKTtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRJbmRlbnRhdGlvbkFuZEF1dG9DbG9zaW5nUGFpckVkaXRzKGNvbmZpZywgbW9kZWwsIGluZGVudGF0aW9uRm9yU2VsZWN0aW9ucywgY2gsIGF1dG9DbG9zaW5nUGFpckNsb3NlKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lzQXV0b0luZGVudFR5cGUoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10pOiBib29sZWFuIHtcblx0XHRpZiAoY29uZmlnLmF1dG9JbmRlbnQgPCBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKCFtb2RlbC50b2tlbml6YXRpb24uaXNDaGVhcFRvVG9rZW5pemUoc2VsZWN0aW9uc1tpXS5nZXRFbmRQb3NpdGlvbigpLmxpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZmluZEFjdHVhbEluZGVudGF0aW9uRm9yU2VsZWN0aW9uKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBjaDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Y29uc3QgYWN0dWFsSW5kZW50YXRpb24gPSBnZXRJbmRlbnRBY3Rpb25Gb3JUeXBlKGNvbmZpZywgbW9kZWwsIHNlbGVjdGlvbiwgY2gsIHtcblx0XHRcdHNoaWZ0SW5kZW50OiAoaW5kZW50YXRpb24pID0+IHtcblx0XHRcdFx0cmV0dXJuIHNoaWZ0SW5kZW50KGNvbmZpZywgaW5kZW50YXRpb24pO1xuXHRcdFx0fSxcblx0XHRcdHVuc2hpZnRJbmRlbnQ6IChpbmRlbnRhdGlvbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdW5zaGlmdEluZGVudChjb25maWcsIGluZGVudGF0aW9uKTtcblx0XHRcdH0sXG5cdFx0fSwgY29uZmlnLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKGFjdHVhbEluZGVudGF0aW9uID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50SW5kZW50YXRpb24gPSBnZXRJbmRlbnRhdGlvbkF0UG9zaXRpb24obW9kZWwsIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIHNlbGVjdGlvbi5zdGFydENvbHVtbik7XG5cdFx0aWYgKGFjdHVhbEluZGVudGF0aW9uID09PSBjb25maWcubm9ybWFsaXplSW5kZW50YXRpb24oY3VycmVudEluZGVudGF0aW9uKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBhY3R1YWxJbmRlbnRhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9nZXRJbmRlbnRhdGlvbkFuZEF1dG9DbG9zaW5nUGFpckVkaXRzKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIGluZGVudGF0aW9uRm9yU2VsZWN0aW9uczogeyBzZWxlY3Rpb246IFNlbGVjdGlvbjsgaW5kZW50YXRpb246IHN0cmluZyB9W10sIGNoOiBzdHJpbmcsIGF1dG9DbG9zaW5nUGFpckNsb3NlOiBzdHJpbmcgfCBudWxsKTogRWRpdE9wZXJhdGlvblJlc3VsdCB7XG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBpbmRlbnRhdGlvbkZvclNlbGVjdGlvbnMubWFwKCh7IHNlbGVjdGlvbiwgaW5kZW50YXRpb24gfSkgPT4ge1xuXHRcdFx0aWYgKGF1dG9DbG9zaW5nUGFpckNsb3NlICE9PSBudWxsKSB7XG5cdFx0XHRcdC8vIEFwcGx5IGJvdGggYXV0byBjbG9zaW5nIHBhaXIgZWRpdHMgYW5kIGF1dG8gaW5kZW50YXRpb24gZWRpdHNcblx0XHRcdFx0Y29uc3QgaW5kZW50YXRpb25FZGl0ID0gdGhpcy5fZ2V0RWRpdEZyb21JbmRlbnRhdGlvbkFuZFNlbGVjdGlvbihjb25maWcsIG1vZGVsLCBpbmRlbnRhdGlvbiwgc2VsZWN0aW9uLCBjaCwgZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IFR5cGVXaXRoSW5kZW50YXRpb25BbmRBdXRvQ2xvc2luZ0NvbW1hbmQoaW5kZW50YXRpb25FZGl0LCBzZWxlY3Rpb24sIGNoLCBhdXRvQ2xvc2luZ1BhaXJDbG9zZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBBcHBseSBvbmx5IGF1dG8gaW5kZW50YXRpb24gZWRpdHNcblx0XHRcdFx0Y29uc3QgaW5kZW50YXRpb25FZGl0ID0gdGhpcy5fZ2V0RWRpdEZyb21JbmRlbnRhdGlvbkFuZFNlbGVjdGlvbihjb25maWcsIG1vZGVsLCBpbmRlbnRhdGlvbiwgc2VsZWN0aW9uLCBjaCwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB0eXBlQ29tbWFuZChpbmRlbnRhdGlvbkVkaXQucmFuZ2UsIGluZGVudGF0aW9uRWRpdC50ZXh0LCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgZWRpdE9wdGlvbnMgPSB7IHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IHRydWUsIHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2UgfTtcblx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nT3RoZXIsIGNvbW1hbmRzLCBlZGl0T3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0RWRpdEZyb21JbmRlbnRhdGlvbkFuZFNlbGVjdGlvbihjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBpbmRlbnRhdGlvbjogc3RyaW5nLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgY2g6IHN0cmluZywgaW5jbHVkZUNoSW5FZGl0OiBib29sZWFuID0gdHJ1ZSk6IHsgcmFuZ2U6IFJhbmdlOyB0ZXh0OiBzdHJpbmcgfSB7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBmaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4gPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHN0YXJ0TGluZU51bWJlcik7XG5cdFx0bGV0IHRleHQ6IHN0cmluZyA9IGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihpbmRlbnRhdGlvbik7XG5cdFx0aWYgKGZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbiAhPT0gMCkge1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdHRleHQgKz0gc3RhcnRMaW5lLnN1YnN0cmluZyhmaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4gLSAxLCBzZWxlY3Rpb24uc3RhcnRDb2x1bW4gLSAxKTtcblx0XHR9XG5cdFx0dGV4dCArPSBpbmNsdWRlQ2hJbkVkaXQgPyBjaCA6ICcnO1xuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHN0YXJ0TGluZU51bWJlciwgMSwgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIsIHNlbGVjdGlvbi5lbmRDb2x1bW4pO1xuXHRcdHJldHVybiB7IHJhbmdlLCB0ZXh0IH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEF1dG9DbG9zaW5nT3ZlcnR5cGVPcGVyYXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RWRpdHMocHJldkVkaXRPcGVyYXRpb25UeXBlOiBFZGl0T3BlcmF0aW9uVHlwZSwgY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGF1dG9DbG9zZWRDaGFyYWN0ZXJzOiBSYW5nZVtdLCBjaDogc3RyaW5nKTogRWRpdE9wZXJhdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlzQXV0b0Nsb3NpbmdPdmVydHlwZShjb25maWcsIG1vZGVsLCBzZWxlY3Rpb25zLCBhdXRvQ2xvc2VkQ2hhcmFjdGVycywgY2gpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcnVuQXV0b0Nsb3NpbmdPdmVydHlwZShwcmV2RWRpdE9wZXJhdGlvblR5cGUsIHNlbGVjdGlvbnMsIGNoKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3J1bkF1dG9DbG9zaW5nT3ZlcnR5cGUocHJldkVkaXRPcGVyYXRpb25UeXBlOiBFZGl0T3BlcmF0aW9uVHlwZSwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGNoOiBzdHJpbmcpOiBFZGl0T3BlcmF0aW9uUmVzdWx0IHtcblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBzZWxlY3Rpb25zW2ldO1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IHR5cGVTZWxlY3Rpb24gPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4gKyAxKTtcblx0XHRcdGNvbW1hbmRzW2ldID0gbmV3IFJlcGxhY2VDb21tYW5kKHR5cGVTZWxlY3Rpb24sIGNoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ090aGVyLCBjb21tYW5kcywge1xuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogc2hvdWxkUHVzaFN0YWNrRWxlbWVudEJldHdlZW4ocHJldkVkaXRPcGVyYXRpb25UeXBlLCBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdPdGhlciksXG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QWZ0ZXI6IGZhbHNlXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEF1dG9DbG9zaW5nT3ZlcnR5cGVXaXRoSW50ZXJjZXB0b3JzT3BlcmF0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldEVkaXRzKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBhdXRvQ2xvc2VkQ2hhcmFjdGVyczogUmFuZ2VbXSwgY2g6IHN0cmluZyk6IEVkaXRPcGVyYXRpb25SZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdGlmIChpc0F1dG9DbG9zaW5nT3ZlcnR5cGUoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9ucywgYXV0b0Nsb3NlZENoYXJhY3RlcnMsIGNoKSkge1xuXHRcdFx0Ly8gVW5mb3J0dW5hdGVseSwgdGhlIGNsb3NlIGNoYXJhY3RlciBpcyBhdCB0aGlzIHBvaW50IFwiZG91YmxlZFwiLCBzbyB3ZSBuZWVkIHRvIGRlbGV0ZSBpdC4uLlxuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBzZWxlY3Rpb25zLm1hcChzID0+IG5ldyBSZXBsYWNlQ29tbWFuZChuZXcgUmFuZ2Uocy5wb3NpdGlvbkxpbmVOdW1iZXIsIHMucG9zaXRpb25Db2x1bW4sIHMucG9zaXRpb25MaW5lTnVtYmVyLCBzLnBvc2l0aW9uQ29sdW1uICsgMSksICcnLCBmYWxzZSkpO1xuXHRcdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ090aGVyLCBjb21tYW5kcywge1xuXHRcdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlOiB0cnVlLFxuXHRcdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QWZ0ZXI6IGZhbHNlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBdXRvQ2xvc2luZ09wZW5DaGFyVHlwZU9wZXJhdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFZGl0cyhjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgY2g6IHN0cmluZywgY2hJc0FscmVhZHlUeXBlZDogYm9vbGVhbiwgaXNEb2luZ0NvbXBvc2l0aW9uOiBib29sZWFuKTogRWRpdE9wZXJhdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFpc0RvaW5nQ29tcG9zaXRpb24pIHtcblx0XHRcdGNvbnN0IGF1dG9DbG9zaW5nUGFpckNsb3NlID0gdGhpcy5nZXRBdXRvQ2xvc2luZ1BhaXJDbG9zZShjb25maWcsIG1vZGVsLCBzZWxlY3Rpb25zLCBjaCwgY2hJc0FscmVhZHlUeXBlZCk7XG5cdFx0XHRpZiAoYXV0b0Nsb3NpbmdQYWlyQ2xvc2UgIT09IG51bGwpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3J1bkF1dG9DbG9zaW5nT3BlbkNoYXJUeXBlKHNlbGVjdGlvbnMsIGNoLCBjaElzQWxyZWFkeVR5cGVkLCBhdXRvQ2xvc2luZ1BhaXJDbG9zZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9ydW5BdXRvQ2xvc2luZ09wZW5DaGFyVHlwZShzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgY2g6IHN0cmluZywgY2hJc0FscmVhZHlUeXBlZDogYm9vbGVhbiwgYXV0b0Nsb3NpbmdQYWlyQ2xvc2U6IHN0cmluZyk6IEVkaXRPcGVyYXRpb25SZXN1bHQge1xuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cdFx0XHRjb21tYW5kc1tpXSA9IG5ldyBUeXBlV2l0aEF1dG9DbG9zaW5nQ29tbWFuZChzZWxlY3Rpb24sIGNoLCAhY2hJc0FscmVhZHlUeXBlZCwgYXV0b0Nsb3NpbmdQYWlyQ2xvc2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nT3RoZXIsIGNvbW1hbmRzLCB7XG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlOiB0cnVlLFxuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXRBdXRvQ2xvc2luZ1BhaXJDbG9zZShjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgY2g6IHN0cmluZywgY2hJc0FscmVhZHlUeXBlZDogYm9vbGVhbik6IHN0cmluZyB8IG51bGwge1xuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gVGhpcyBtZXRob2QgaXMgY2FsbGVkIGJvdGggd2hlbiB0eXBpbmcgKHJlZ3VsYXJseSkgYW5kIHdoZW4gY29tcG9zaXRpb24gZW5kc1xuXHRcdC8vIFRoaXMgbWVhbnMgdGhhdCB3ZSBuZWVkIHRvIHdvcmsgd2l0aCBhIHRleHQgYnVmZmVyIHdoZXJlIHNvbWV0aW1lcyBgY2hgIGlzIG5vdFxuXHRcdC8vIHRoZXJlIChpdCBpcyBiZWluZyB0eXBlZCByaWdodCBub3cpIG9yIHdpdGggYSB0ZXh0IGJ1ZmZlciB3aGVyZSBgY2hgIGhhcyBhbHJlYWR5IGJlZW4gdHlwZWRcblx0XHQvL1xuXHRcdC8vIEluIG9yZGVyIHRvIGF2b2lkIGFkZGluZyBjaGVja3MgZm9yIGBjaElzQWxyZWFkeVR5cGVkYCBpbiBhbGwgcGxhY2VzLCB3ZSB3aWxsIHdvcmtcblx0XHQvLyB3aXRoIHR3byBjb25jZXB0dWFsIHBvc2l0aW9ucywgdGhlIHBvc2l0aW9uIGJlZm9yZSBgY2hgIGFuZCB0aGUgcG9zaXRpb24gYWZ0ZXIgYGNoYFxuXHRcdC8vXG5cdFx0Y29uc3QgcG9zaXRpb25zOiB7IGxpbmVOdW1iZXI6IG51bWJlcjsgYmVmb3JlQ29sdW1uOiBudW1iZXI7IGFmdGVyQ29sdW1uOiBudW1iZXIgfVtdID0gc2VsZWN0aW9ucy5tYXAoKHMpID0+IHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gcy5nZXRQb3NpdGlvbigpO1xuXHRcdFx0aWYgKGNoSXNBbHJlYWR5VHlwZWQpIHtcblx0XHRcdFx0cmV0dXJuIHsgbGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgYmVmb3JlQ29sdW1uOiBwb3NpdGlvbi5jb2x1bW4gLSBjaC5sZW5ndGgsIGFmdGVyQ29sdW1uOiBwb3NpdGlvbi5jb2x1bW4gfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7IGxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsIGJlZm9yZUNvbHVtbjogcG9zaXRpb24uY29sdW1uLCBhZnRlckNvbHVtbjogcG9zaXRpb24uY29sdW1uIH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Ly8gRmluZCB0aGUgbG9uZ2VzdCBhdXRvLWNsb3Npbmcgb3BlbiBwYWlyIGluIGNhc2Ugb2YgbXVsdGlwbGUgZW5kaW5nIGluIGBjaGBcblx0XHQvLyBlLmcuIHdoZW4gaGF2aW5nIFtmXCIsXCJdIGFuZCBbXCIsXCJdLCBpdCBwaWNrcyBbZlwiLFwiXSBpZiB0aGUgY2hhcmFjdGVyIGJlZm9yZSBpcyBmXG5cdFx0Y29uc3QgcGFpciA9IHRoaXMuX2ZpbmRBdXRvQ2xvc2luZ1BhaXJPcGVuKGNvbmZpZywgbW9kZWwsIHBvc2l0aW9ucy5tYXAocCA9PiBuZXcgUG9zaXRpb24ocC5saW5lTnVtYmVyLCBwLmJlZm9yZUNvbHVtbikpLCBjaCk7XG5cdFx0aWYgKCFwYWlyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0bGV0IGF1dG9DbG9zZUNvbmZpZzogRWRpdG9yQXV0b0Nsb3NpbmdTdHJhdGVneTtcblx0XHRsZXQgc2hvdWxkQXV0b0Nsb3NlQmVmb3JlOiAoY2g6IHN0cmluZykgPT4gYm9vbGVhbjtcblxuXHRcdGNvbnN0IGNoSXNRdW90ZSA9IGlzUXVvdGUoY2gpO1xuXHRcdGlmIChjaElzUXVvdGUpIHtcblx0XHRcdGF1dG9DbG9zZUNvbmZpZyA9IGNvbmZpZy5hdXRvQ2xvc2luZ1F1b3Rlcztcblx0XHRcdHNob3VsZEF1dG9DbG9zZUJlZm9yZSA9IGNvbmZpZy5zaG91bGRBdXRvQ2xvc2VCZWZvcmUucXVvdGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHBhaXJJc0ZvckNvbW1lbnRzID0gY29uZmlnLmJsb2NrQ29tbWVudFN0YXJ0VG9rZW4gPyBwYWlyLm9wZW4uaW5jbHVkZXMoY29uZmlnLmJsb2NrQ29tbWVudFN0YXJ0VG9rZW4pIDogZmFsc2U7XG5cdFx0XHRpZiAocGFpcklzRm9yQ29tbWVudHMpIHtcblx0XHRcdFx0YXV0b0Nsb3NlQ29uZmlnID0gY29uZmlnLmF1dG9DbG9zaW5nQ29tbWVudHM7XG5cdFx0XHRcdHNob3VsZEF1dG9DbG9zZUJlZm9yZSA9IGNvbmZpZy5zaG91bGRBdXRvQ2xvc2VCZWZvcmUuY29tbWVudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF1dG9DbG9zZUNvbmZpZyA9IGNvbmZpZy5hdXRvQ2xvc2luZ0JyYWNrZXRzO1xuXHRcdFx0XHRzaG91bGRBdXRvQ2xvc2VCZWZvcmUgPSBjb25maWcuc2hvdWxkQXV0b0Nsb3NlQmVmb3JlLmJyYWNrZXQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChhdXRvQ2xvc2VDb25maWcgPT09ICduZXZlcicpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHQvLyBTb21ldGltZXMsIGl0IGlzIHBvc3NpYmxlIHRvIGhhdmUgdHdvIGF1dG8tY2xvc2luZyBwYWlycyB0aGF0IGhhdmUgYSBjb250YWlubWVudCByZWxhdGlvbnNoaXBcblx0XHQvLyBlLmcuIHdoZW4gaGF2aW5nIFsoLCldIGFuZCBbKCosKildXG5cdFx0Ly8gLSB3aGVuIHR5cGluZyAoLCB0aGUgcmVzdWx0aW5nIHN0YXRlIGlzICh8KVxuXHRcdC8vIC0gd2hlbiB0eXBpbmcgKiwgdGhlIGRlc2lyZWQgcmVzdWx0aW5nIHN0YXRlIGlzICgqfCopLCBub3QgKCp8KikpXG5cdFx0Y29uc3QgY29udGFpbmVkUGFpciA9IHRoaXMuX2ZpbmRDb250YWluZWRBdXRvQ2xvc2luZ1BhaXIoY29uZmlnLCBwYWlyKTtcblx0XHRjb25zdCBjb250YWluZWRQYWlyQ2xvc2UgPSBjb250YWluZWRQYWlyID8gY29udGFpbmVkUGFpci5jbG9zZSA6ICcnO1xuXHRcdGxldCBpc0NvbnRhaW5lZFBhaXJQcmVzZW50ID0gdHJ1ZTtcblxuXHRcdGZvciAoY29uc3QgcG9zaXRpb24gb2YgcG9zaXRpb25zKSB7XG5cdFx0XHRjb25zdCB7IGxpbmVOdW1iZXIsIGJlZm9yZUNvbHVtbiwgYWZ0ZXJDb2x1bW4gfSA9IHBvc2l0aW9uO1xuXHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxpbmVCZWZvcmUgPSBsaW5lVGV4dC5zdWJzdHJpbmcoMCwgYmVmb3JlQ29sdW1uIC0gMSk7XG5cdFx0XHRjb25zdCBsaW5lQWZ0ZXIgPSBsaW5lVGV4dC5zdWJzdHJpbmcoYWZ0ZXJDb2x1bW4gLSAxKTtcblxuXHRcdFx0aWYgKCFsaW5lQWZ0ZXIuc3RhcnRzV2l0aChjb250YWluZWRQYWlyQ2xvc2UpKSB7XG5cdFx0XHRcdGlzQ29udGFpbmVkUGFpclByZXNlbnQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdC8vIE9ubHkgY29uc2lkZXIgYXV0byBjbG9zaW5nIHRoZSBwYWlyIGlmIGFuIGFsbG93ZWQgY2hhcmFjdGVyIGZvbGxvd3Mgb3IgaWYgYW5vdGhlciBhdXRvY2xvc2VkIHBhaXIgY2xvc2luZyBicmFjZSBmb2xsb3dzXG5cdFx0XHRpZiAobGluZUFmdGVyLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgY2hhcmFjdGVyQWZ0ZXIgPSBsaW5lQWZ0ZXIuY2hhckF0KDApO1xuXHRcdFx0XHRjb25zdCBpc0JlZm9yZUNsb3NlQnJhY2UgPSB0aGlzLl9pc0JlZm9yZUNsb3NpbmdCcmFjZShjb25maWcsIGxpbmVBZnRlcik7XG5cdFx0XHRcdGlmICghaXNCZWZvcmVDbG9zZUJyYWNlICYmICFzaG91bGRBdXRvQ2xvc2VCZWZvcmUoY2hhcmFjdGVyQWZ0ZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIERvIG5vdCBhdXRvLWNsb3NlICcgb3IgXCIgYWZ0ZXIgYSB3b3JkIGNoYXJhY3RlclxuXHRcdFx0aWYgKHBhaXIub3Blbi5sZW5ndGggPT09IDEgJiYgKGNoID09PSAnXFwnJyB8fCBjaCA9PT0gJ1wiJykgJiYgYXV0b0Nsb3NlQ29uZmlnICE9PSAnYWx3YXlzJykge1xuXHRcdFx0XHRjb25zdCB3b3JkU2VwYXJhdG9ycyA9IGdldE1hcEZvcldvcmRTZXBhcmF0b3JzKGNvbmZpZy53b3JkU2VwYXJhdG9ycywgW10pO1xuXHRcdFx0XHRpZiAobGluZUJlZm9yZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhcmFjdGVyQmVmb3JlID0gbGluZUJlZm9yZS5jaGFyQ29kZUF0KGxpbmVCZWZvcmUubGVuZ3RoIC0gMSk7XG5cdFx0XHRcdFx0aWYgKHdvcmRTZXBhcmF0b3JzLmdldChjaGFyYWN0ZXJCZWZvcmUpID09PSBXb3JkQ2hhcmFjdGVyQ2xhc3MuUmVndWxhcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW1vZGVsLnRva2VuaXphdGlvbi5pc0NoZWFwVG9Ub2tlbml6ZShsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHQvLyBEbyBub3QgZm9yY2UgdG9rZW5pemF0aW9uXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgbGluZVRva2VucyA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3Qgc2NvcGVkTGluZVRva2VucyA9IGNyZWF0ZVNjb3BlZExpbmVUb2tlbnMobGluZVRva2VucywgYmVmb3JlQ29sdW1uIC0gMSk7XG5cdFx0XHRpZiAoIXBhaXIuc2hvdWxkQXV0b0Nsb3NlKHNjb3BlZExpbmVUb2tlbnMsIGJlZm9yZUNvbHVtbiAtIHNjb3BlZExpbmVUb2tlbnMuZmlyc3RDaGFyT2Zmc2V0KSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdC8vIFR5cGluZyBmb3IgZXhhbXBsZSBhIHF1b3RlIGNvdWxkIGVpdGhlciBzdGFydCBhIG5ldyBzdHJpbmcsIGluIHdoaWNoIGNhc2UgYXV0by1jbG9zaW5nIGlzIGRlc2lyYWJsZVxuXHRcdFx0Ly8gb3IgaXQgY291bGQgZW5kIGEgcHJldmlvdXNseSBzdGFydGVkIHN0cmluZywgaW4gd2hpY2ggY2FzZSBhdXRvLWNsb3NpbmcgaXMgbm90IGRlc2lyYWJsZVxuXHRcdFx0Ly9cblx0XHRcdC8vIEluIGNlcnRhaW4gY2FzZXMsIGl0IGlzIHJlYWxseSBub3QgcG9zc2libGUgdG8gbG9vayBhdCB0aGUgcHJldmlvdXMgdG9rZW4gdG8gZGV0ZXJtaW5lXG5cdFx0XHQvLyB3aGF0IHdvdWxkIGhhcHBlbi4gVGhhdCdzIHdoeSB3ZSBkbyBzb21ldGhpbmcgcmVhbGx5IHVudXN1YWwsIHdlIHByZXRlbmQgdG8gdHlwZSBhIGRpZmZlcmVudFxuXHRcdFx0Ly8gY2hhcmFjdGVyIGFuZCBhc2sgdGhlIHRva2VuaXplciB3aGF0IHRoZSBvdXRjb21lIG9mIGRvaW5nIHRoYXQgaXM6IGFmdGVyIHR5cGluZyBhIG5ldXRyYWxcblx0XHRcdC8vIGNoYXJhY3RlciwgYXJlIHdlIGluIGEgc3RyaW5nIChpLmUuIHRoZSBxdW90ZSB3b3VsZCBtb3N0IGxpa2VseSBlbmQgYSBzdHJpbmcpIG9yIG5vdD9cblx0XHRcdC8vXG5cdFx0XHRjb25zdCBuZXV0cmFsQ2hhcmFjdGVyID0gcGFpci5maW5kTmV1dHJhbENoYXJhY3RlcigpO1xuXHRcdFx0aWYgKG5ldXRyYWxDaGFyYWN0ZXIpIHtcblx0XHRcdFx0Y29uc3QgdG9rZW5UeXBlID0gbW9kZWwudG9rZW5pemF0aW9uLmdldFRva2VuVHlwZUlmSW5zZXJ0aW5nQ2hhcmFjdGVyKGxpbmVOdW1iZXIsIGJlZm9yZUNvbHVtbiwgbmV1dHJhbENoYXJhY3Rlcik7XG5cdFx0XHRcdGlmICghcGFpci5pc09LKHRva2VuVHlwZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoaXNDb250YWluZWRQYWlyUHJlc2VudCkge1xuXHRcdFx0cmV0dXJuIHBhaXIuY2xvc2Uuc3Vic3RyaW5nKDAsIHBhaXIuY2xvc2UubGVuZ3RoIC0gY29udGFpbmVkUGFpckNsb3NlLmxlbmd0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBwYWlyLmNsb3NlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIGFub3RoZXIgYXV0by1jbG9zaW5nIHBhaXIgdGhhdCBpcyBjb250YWluZWQgYnkgdGhlIG9uZSBwYXNzZWQgaW4uXG5cdCAqXG5cdCAqIGUuZy4gd2hlbiBoYXZpbmcgWygsKV0gYW5kIFsoKiwqKV0gYXMgYXV0by1jbG9zaW5nIHBhaXJzXG5cdCAqIHRoaXMgbWV0aG9kIHdpbGwgZmluZCBbKCwpXSBhcyBhIGNvbnRhaW5tZW50IHBhaXIgZm9yIFsoKiwqKV1cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIF9maW5kQ29udGFpbmVkQXV0b0Nsb3NpbmdQYWlyKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgcGFpcjogU3RhbmRhcmRBdXRvQ2xvc2luZ1BhaXJDb25kaXRpb25hbCk6IFN0YW5kYXJkQXV0b0Nsb3NpbmdQYWlyQ29uZGl0aW9uYWwgfCBudWxsIHtcblx0XHRpZiAocGFpci5vcGVuLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdENoYXIgPSBwYWlyLmNsb3NlLmNoYXJBdChwYWlyLmNsb3NlLmxlbmd0aCAtIDEpO1xuXHRcdC8vIGdldCBjYW5kaWRhdGVzIHdpdGggdGhlIHNhbWUgbGFzdCBjaGFyYWN0ZXIgYXMgY2xvc2Vcblx0XHRjb25zdCBjYW5kaWRhdGVzID0gY29uZmlnLmF1dG9DbG9zaW5nUGFpcnMuYXV0b0Nsb3NpbmdQYWlyc0Nsb3NlQnlFbmQuZ2V0KGxhc3RDaGFyKSB8fCBbXTtcblx0XHRsZXQgcmVzdWx0OiBTdGFuZGFyZEF1dG9DbG9zaW5nUGFpckNvbmRpdGlvbmFsIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuXHRcdFx0aWYgKGNhbmRpZGF0ZS5vcGVuICE9PSBwYWlyLm9wZW4gJiYgcGFpci5vcGVuLmluY2x1ZGVzKGNhbmRpZGF0ZS5vcGVuKSAmJiBwYWlyLmNsb3NlLmVuZHNXaXRoKGNhbmRpZGF0ZS5jbG9zZSkpIHtcblx0XHRcdFx0aWYgKCFyZXN1bHQgfHwgY2FuZGlkYXRlLm9wZW4ubGVuZ3RoID4gcmVzdWx0Lm9wZW4ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gY2FuZGlkYXRlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lIGlmIHR5cGluZyBgY2hgIGF0IGFsbCBgcG9zaXRpb25zYCBpbiB0aGUgYG1vZGVsYCByZXN1bHRzIGluIGFuXG5cdCAqIGF1dG8gY2xvc2luZyBvcGVuIHNlcXVlbmNlIGJlaW5nIHR5cGVkLlxuXHQgKlxuXHQgKiBBdXRvIGNsb3Npbmcgb3BlbiBzZXF1ZW5jZXMgY2FuIGNvbnNpc3Qgb2YgbXVsdGlwbGUgY2hhcmFjdGVycywgd2hpY2hcblx0ICogY2FuIGxlYWQgdG8gYW1iaWd1aXRpZXMuIEluIHN1Y2ggYSBjYXNlLCB0aGUgbG9uZ2VzdCBhdXRvLWNsb3Npbmcgb3BlblxuXHQgKiBzZXF1ZW5jZSBpcyByZXR1cm5lZC5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIF9maW5kQXV0b0Nsb3NpbmdQYWlyT3Blbihjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbnM6IFBvc2l0aW9uW10sIGNoOiBzdHJpbmcpOiBTdGFuZGFyZEF1dG9DbG9zaW5nUGFpckNvbmRpdGlvbmFsIHwgbnVsbCB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IGNvbmZpZy5hdXRvQ2xvc2luZ1BhaXJzLmF1dG9DbG9zaW5nUGFpcnNPcGVuQnlFbmQuZ2V0KGNoKTtcblx0XHRpZiAoIWNhbmRpZGF0ZXMpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHQvLyBEZXRlcm1pbmUgd2hpY2ggYXV0by1jbG9zaW5nIHBhaXIgaXQgaXNcblx0XHRsZXQgcmVzdWx0OiBTdGFuZGFyZEF1dG9DbG9zaW5nUGFpckNvbmRpdGlvbmFsIHwgbnVsbCA9IG51bGw7XG5cdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gbnVsbCB8fCBjYW5kaWRhdGUub3Blbi5sZW5ndGggPiByZXN1bHQub3Blbi5sZW5ndGgpIHtcblx0XHRcdFx0bGV0IGNhbmRpZGF0ZUlzTWF0Y2ggPSB0cnVlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBvc2l0aW9uIG9mIHBvc2l0aW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IHJlbGV2YW50VGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uIC0gY2FuZGlkYXRlLm9wZW4ubGVuZ3RoICsgMSwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKSk7XG5cdFx0XHRcdFx0aWYgKHJlbGV2YW50VGV4dCArIGNoICE9PSBjYW5kaWRhdGUub3Blbikge1xuXHRcdFx0XHRcdFx0Y2FuZGlkYXRlSXNNYXRjaCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjYW5kaWRhdGVJc01hdGNoKSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gY2FuZGlkYXRlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfaXNCZWZvcmVDbG9zaW5nQnJhY2UoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBsaW5lQWZ0ZXI6IHN0cmluZykge1xuXHRcdC8vIElmIHRoZSBzdGFydCBvZiBsaW5lQWZ0ZXIgY2FuIGJlIGludGVycHJldHRlZCBhcyBib3RoIGEgc3RhcnRpbmcgb3IgZW5kaW5nIGJyYWNlLCBkZWZhdWx0IHRvIHJldHVybmluZyBmYWxzZVxuXHRcdGNvbnN0IG5leHRDaGFyID0gbGluZUFmdGVyLmNoYXJBdCgwKTtcblx0XHRjb25zdCBwb3RlbnRpYWxTdGFydGluZ0JyYWNlcyA9IGNvbmZpZy5hdXRvQ2xvc2luZ1BhaXJzLmF1dG9DbG9zaW5nUGFpcnNPcGVuQnlTdGFydC5nZXQobmV4dENoYXIpIHx8IFtdO1xuXHRcdGNvbnN0IHBvdGVudGlhbENsb3NpbmdCcmFjZXMgPSBjb25maWcuYXV0b0Nsb3NpbmdQYWlycy5hdXRvQ2xvc2luZ1BhaXJzQ2xvc2VCeVN0YXJ0LmdldChuZXh0Q2hhcikgfHwgW107XG5cblx0XHRjb25zdCBpc0JlZm9yZVN0YXJ0aW5nQnJhY2UgPSBwb3RlbnRpYWxTdGFydGluZ0JyYWNlcy5zb21lKHggPT4gbGluZUFmdGVyLnN0YXJ0c1dpdGgoeC5vcGVuKSk7XG5cdFx0Y29uc3QgaXNCZWZvcmVDbG9zaW5nQnJhY2UgPSBwb3RlbnRpYWxDbG9zaW5nQnJhY2VzLnNvbWUoeCA9PiBsaW5lQWZ0ZXIuc3RhcnRzV2l0aCh4LmNsb3NlKSk7XG5cblx0XHRyZXR1cm4gIWlzQmVmb3JlU3RhcnRpbmdCcmFjZSAmJiBpc0JlZm9yZUNsb3NpbmdCcmFjZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29tcG9zaXRpb25FbmRPdmVydHlwZU9wZXJhdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFZGl0cyhjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIGNvbXBvc2l0aW9uczogQ29tcG9zaXRpb25PdXRjb21lW10pOiBFZGl0T3BlcmF0aW9uUmVzdWx0IHwgbnVsbCB7XG5cdFx0Y29uc3QgaXNPdmVydHlwZU1vZGUgPSBjb25maWcuaW5wdXRNb2RlID09PSAnb3ZlcnR5cGUnO1xuXHRcdGlmICghaXNPdmVydHlwZU1vZGUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kcyA9IGNvbXBvc2l0aW9ucy5tYXAoY29tcG9zaXRpb24gPT4gbmV3IFJlcGxhY2VPdmVydHlwZUNvbW1hbmRPbkNvbXBvc2l0aW9uRW5kKGNvbXBvc2l0aW9uLmluc2VydGVkVGV4dFJhbmdlKSk7XG5cdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ090aGVyLCBjb21tYW5kcywge1xuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogdHJ1ZSxcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2Vcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3Vycm91bmRTZWxlY3Rpb25PcGVyYXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RWRpdHMoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGNoOiBzdHJpbmcsIGlzRG9pbmdDb21wb3NpdGlvbjogYm9vbGVhbik6IEVkaXRPcGVyYXRpb25SZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaXNEb2luZ0NvbXBvc2l0aW9uICYmIHRoaXMuX2lzU3Vycm91bmRTZWxlY3Rpb25UeXBlKGNvbmZpZywgbW9kZWwsIHNlbGVjdGlvbnMsIGNoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3J1blN1cnJvdW5kU2VsZWN0aW9uVHlwZShjb25maWcsIHNlbGVjdGlvbnMsIGNoKTtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3J1blN1cnJvdW5kU2VsZWN0aW9uVHlwZShjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBjaDogc3RyaW5nKTogRWRpdE9wZXJhdGlvblJlc3VsdCB7XG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uc1tpXTtcblx0XHRcdGNvbnN0IGNsb3NlQ2hhcmFjdGVyID0gY29uZmlnLnN1cnJvdW5kaW5nUGFpcnNbY2hdO1xuXHRcdFx0Y29tbWFuZHNbaV0gPSBuZXcgU3Vycm91bmRTZWxlY3Rpb25Db21tYW5kKHNlbGVjdGlvbiwgY2gsIGNsb3NlQ2hhcmFjdGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KEVkaXRPcGVyYXRpb25UeXBlLk90aGVyLCBjb21tYW5kcywge1xuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogdHJ1ZSxcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lzU3Vycm91bmRTZWxlY3Rpb25UeXBlKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBjaDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFzaG91bGRTdXJyb3VuZENoYXIoY29uZmlnLCBjaCkgfHwgIWNvbmZpZy5zdXJyb3VuZGluZ1BhaXJzLmhhc093blByb3BlcnR5KGNoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBpc1R5cGluZ0FRdW90ZUNoYXJhY3RlciA9IGlzUXVvdGUoY2gpO1xuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGxldCBzZWxlY3Rpb25Db250YWluc09ubHlXaGl0ZXNwYWNlID0gdHJ1ZTtcblx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3Qgc3RhcnRJbmRleCA9IChsaW5lTnVtYmVyID09PSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyID8gc2VsZWN0aW9uLnN0YXJ0Q29sdW1uIC0gMSA6IDApO1xuXHRcdFx0XHRjb25zdCBlbmRJbmRleCA9IChsaW5lTnVtYmVyID09PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlciA/IHNlbGVjdGlvbi5lbmRDb2x1bW4gLSAxIDogbGluZVRleHQubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRUZXh0ID0gbGluZVRleHQuc3Vic3RyaW5nKHN0YXJ0SW5kZXgsIGVuZEluZGV4KTtcblx0XHRcdFx0aWYgKC9bXiBcXHRdLy50ZXN0KHNlbGVjdGVkVGV4dCkpIHtcblx0XHRcdFx0XHQvLyB0aGlzIHNlbGVjdGVkIHRleHQgY29udGFpbnMgc29tZXRoaW5nIG90aGVyIHRoYW4gd2hpdGVzcGFjZVxuXHRcdFx0XHRcdHNlbGVjdGlvbkNvbnRhaW5zT25seVdoaXRlc3BhY2UgPSBmYWxzZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHNlbGVjdGlvbkNvbnRhaW5zT25seVdoaXRlc3BhY2UpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzVHlwaW5nQVF1b3RlQ2hhcmFjdGVyICYmIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgPT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyICYmIHNlbGVjdGlvbi5zdGFydENvbHVtbiArIDEgPT09IHNlbGVjdGlvbi5lbmRDb2x1bW4pIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uVGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb24pO1xuXHRcdFx0XHRpZiAoaXNRdW90ZShzZWxlY3Rpb25UZXh0KSkge1xuXHRcdFx0XHRcdC8vIFR5cGluZyBhIHF1b3RlIGNoYXJhY3RlciBvbiB0b3Agb2YgYW5vdGhlciBxdW90ZSBjaGFyYWN0ZXJcblx0XHRcdFx0XHQvLyA9PiBkaXNhYmxlIHN1cnJvdW5kIHNlbGVjdGlvbiB0eXBlXG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnRlcmNlcHRvckVsZWN0cmljQ2hhck9wZXJhdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFZGl0cyhwcmV2RWRpdE9wZXJhdGlvblR5cGU6IEVkaXRPcGVyYXRpb25UeXBlLCBjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgY2g6IHN0cmluZywgaXNEb2luZ0NvbXBvc2l0aW9uOiBib29sZWFuKTogRWRpdE9wZXJhdGlvblJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gRWxlY3RyaWMgY2hhcmFjdGVycyBtYWtlIHNlbnNlIG9ubHkgd2hlbiBkZWFsaW5nIHdpdGggYSBzaW5nbGUgY3Vyc29yLFxuXHRcdC8vIGFzIG11bHRpcGxlIGN1cnNvcnMgdHlwaW5nIGJyYWNrZXRzIGZvciBleGFtcGxlIHdvdWxkIGludGVyZmVyIHdpdGggYnJhY2tldCBtYXRjaGluZ1xuXHRcdGlmICghaXNEb2luZ0NvbXBvc2l0aW9uICYmIHRoaXMuX2lzVHlwZUludGVyY2VwdG9yRWxlY3RyaWNDaGFyKGNvbmZpZywgbW9kZWwsIHNlbGVjdGlvbnMpKSB7XG5cdFx0XHRjb25zdCByID0gdGhpcy5fdHlwZUludGVyY2VwdG9yRWxlY3RyaWNDaGFyKHByZXZFZGl0T3BlcmF0aW9uVHlwZSwgY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9uc1swXSwgY2gpO1xuXHRcdFx0aWYgKHIpIHtcblx0XHRcdFx0cmV0dXJuIHI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9pc1R5cGVJbnRlcmNlcHRvckVsZWN0cmljQ2hhcihjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSkge1xuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCA9PT0gMSAmJiBtb2RlbC50b2tlbml6YXRpb24uaXNDaGVhcFRvVG9rZW5pemUoc2VsZWN0aW9uc1swXS5nZXRFbmRQb3NpdGlvbigpLmxpbmVOdW1iZXIpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3R5cGVJbnRlcmNlcHRvckVsZWN0cmljQ2hhcihwcmV2RWRpdE9wZXJhdGlvblR5cGU6IEVkaXRPcGVyYXRpb25UeXBlLCBjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgY2g6IHN0cmluZyk6IEVkaXRPcGVyYXRpb25SZXN1bHQgfCBudWxsIHtcblx0XHRpZiAoIWNvbmZpZy5lbGVjdHJpY0NoYXJzLmhhc093blByb3BlcnR5KGNoKSB8fCAhc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHBvc2l0aW9uID0gc2VsZWN0aW9uLmdldFBvc2l0aW9uKCk7XG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2Vucyhwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRsZXQgZWxlY3RyaWNBY3Rpb246IElFbGVjdHJpY0FjdGlvbiB8IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdGVsZWN0cmljQWN0aW9uID0gY29uZmlnLm9uRWxlY3RyaWNDaGFyYWN0ZXIoY2gsIGxpbmVUb2tlbnMsIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKCFlbGVjdHJpY0FjdGlvbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChlbGVjdHJpY0FjdGlvbi5tYXRjaE9wZW5CcmFja2V0KSB7XG5cdFx0XHRjb25zdCBlbmRDb2x1bW4gPSAobGluZVRva2Vucy5nZXRMaW5lQ29udGVudCgpICsgY2gpLmxhc3RJbmRleE9mKGVsZWN0cmljQWN0aW9uLm1hdGNoT3BlbkJyYWNrZXQpICsgMTtcblx0XHRcdGNvbnN0IG1hdGNoID0gbW9kZWwuYnJhY2tldFBhaXJzLmZpbmRNYXRjaGluZ0JyYWNrZXRVcChlbGVjdHJpY0FjdGlvbi5tYXRjaE9wZW5CcmFja2V0LCB7XG5cdFx0XHRcdGxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRcdGNvbHVtbjogZW5kQ29sdW1uXG5cdFx0XHR9LCA1MDAgLyogZ2l2ZSBhdCBtb3N0IDUwMG1zIHRvIGNvbXB1dGUgKi8pO1xuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdGlmIChtYXRjaC5zdGFydExpbmVOdW1iZXIgPT09IHBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHQvLyBtYXRjaGVkIHNvbWV0aGluZyBvbiB0aGUgc2FtZSBsaW5lID0+IG5vIGNoYW5nZSBpbiBpbmRlbnRhdGlvblxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1hdGNoTGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KG1hdGNoLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IG1hdGNoTGluZUluZGVudGF0aW9uID0gc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShtYXRjaExpbmUpO1xuXHRcdFx0XHRjb25zdCBuZXdJbmRlbnRhdGlvbiA9IGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihtYXRjaExpbmVJbmRlbnRhdGlvbik7XG5cdFx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IGxpbmVGaXJzdE5vbkJsYW5rQ29sdW1uID0gbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKSB8fCBwb3NpdGlvbi5jb2x1bW47XG5cdFx0XHRcdGNvbnN0IHByZWZpeCA9IGxpbmVUZXh0LnN1YnN0cmluZyhsaW5lRmlyc3ROb25CbGFua0NvbHVtbiAtIDEsIHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXHRcdFx0XHRjb25zdCB0eXBlVGV4dCA9IG5ld0luZGVudGF0aW9uICsgcHJlZml4ICsgY2g7XG5cdFx0XHRcdGNvbnN0IHR5cGVTZWxlY3Rpb24gPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgMSwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IG5ldyBSZXBsYWNlQ29tbWFuZCh0eXBlU2VsZWN0aW9uLCB0eXBlVGV4dCk7XG5cdFx0XHRcdHJldHVybiBuZXcgRWRpdE9wZXJhdGlvblJlc3VsdChnZXRUeXBpbmdPcGVyYXRpb24odHlwZVRleHQsIHByZXZFZGl0T3BlcmF0aW9uVHlwZSksIFtjb21tYW5kXSwge1xuXHRcdFx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IGZhbHNlLFxuXHRcdFx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNpbXBsZUNoYXJhY3RlclR5cGVPcGVyYXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RWRpdHMoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBwcmV2RWRpdE9wZXJhdGlvblR5cGU6IEVkaXRPcGVyYXRpb25UeXBlLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSwgY2g6IHN0cmluZywgaXNEb2luZ0NvbXBvc2l0aW9uOiBib29sZWFuKTogRWRpdE9wZXJhdGlvblJlc3VsdCB7XG5cdFx0Ly8gQSBzaW1wbGUgY2hhcmFjdGVyIHR5cGVcblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBDaG9zZW5SZXBsYWNlQ29tbWFuZCA9IGNvbmZpZy5pbnB1dE1vZGUgPT09ICdvdmVydHlwZScgJiYgIWlzRG9pbmdDb21wb3NpdGlvbiA/IFJlcGxhY2VPdmVydHlwZUNvbW1hbmQgOiBSZXBsYWNlQ29tbWFuZDtcblx0XHRcdGNvbW1hbmRzW2ldID0gbmV3IENob3NlblJlcGxhY2VDb21tYW5kKHNlbGVjdGlvbnNbaV0sIGNoKTtcblx0XHR9XG5cblx0XHRjb25zdCBvcFR5cGUgPSBnZXRUeXBpbmdPcGVyYXRpb24oY2gsIHByZXZFZGl0T3BlcmF0aW9uVHlwZSk7XG5cdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KG9wVHlwZSwgY29tbWFuZHMsIHtcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZXR3ZWVuKHByZXZFZGl0T3BlcmF0aW9uVHlwZSwgb3BUeXBlKSxcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2Vcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRW50ZXJPcGVyYXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0RWRpdHMoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIGNoOiBzdHJpbmcsIGlzRG9pbmdDb21wb3NpdGlvbjogYm9vbGVhbik6IEVkaXRPcGVyYXRpb25SZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaXNEb2luZ0NvbXBvc2l0aW9uICYmIGNoID09PSAnXFxuJykge1xuXHRcdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbW1hbmRzW2ldID0gdGhpcy5fZW50ZXIoY29uZmlnLCBtb2RlbCwgZmFsc2UsIHNlbGVjdGlvbnNbaV0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ090aGVyLCBjb21tYW5kcywge1xuXHRcdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlOiB0cnVlLFxuXHRcdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QWZ0ZXI6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9lbnRlcihjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsLCBrZWVwUG9zaXRpb246IGJvb2xlYW4sIHJhbmdlOiBSYW5nZSk6IElDb21tYW5kIHtcblx0XHRpZiAoY29uZmlnLmF1dG9JbmRlbnQgPT09IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5Ob25lKSB7XG5cdFx0XHRyZXR1cm4gdHlwZUNvbW1hbmQocmFuZ2UsICdcXG4nLCBrZWVwUG9zaXRpb24pO1xuXHRcdH1cblx0XHRpZiAoIW1vZGVsLnRva2VuaXphdGlvbi5pc0NoZWFwVG9Ub2tlbml6ZShyYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkubGluZU51bWJlcikgfHwgY29uZmlnLmF1dG9JbmRlbnQgPT09IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5LZWVwKSB7XG5cdFx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBpbmRlbnRhdGlvbiA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobGluZVRleHQpLnN1YnN0cmluZygwLCByYW5nZS5zdGFydENvbHVtbiAtIDEpO1xuXHRcdFx0cmV0dXJuIHR5cGVDb21tYW5kKHJhbmdlLCAnXFxuJyArIGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihpbmRlbnRhdGlvbiksIGtlZXBQb3NpdGlvbik7XG5cdFx0fVxuXHRcdGNvbnN0IHIgPSBnZXRFbnRlckFjdGlvbihjb25maWcuYXV0b0luZGVudCwgbW9kZWwsIHJhbmdlLCBjb25maWcubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKHIpIHtcblx0XHRcdGlmIChyLmluZGVudEFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLk5vbmUpIHtcblx0XHRcdFx0Ly8gTm90aGluZyBzcGVjaWFsXG5cdFx0XHRcdHJldHVybiB0eXBlQ29tbWFuZChyYW5nZSwgJ1xcbicgKyBjb25maWcubm9ybWFsaXplSW5kZW50YXRpb24oci5pbmRlbnRhdGlvbiArIHIuYXBwZW5kVGV4dCksIGtlZXBQb3NpdGlvbik7XG5cblx0XHRcdH0gZWxzZSBpZiAoci5pbmRlbnRBY3Rpb24gPT09IEluZGVudEFjdGlvbi5JbmRlbnQpIHtcblx0XHRcdFx0Ly8gSW5kZW50IG9uY2Vcblx0XHRcdFx0cmV0dXJuIHR5cGVDb21tYW5kKHJhbmdlLCAnXFxuJyArIGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihyLmluZGVudGF0aW9uICsgci5hcHBlbmRUZXh0KSwga2VlcFBvc2l0aW9uKTtcblxuXHRcdFx0fSBlbHNlIGlmIChyLmluZGVudEFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLkluZGVudE91dGRlbnQpIHtcblx0XHRcdFx0Ly8gVWx0cmEgc3BlY2lhbFxuXHRcdFx0XHRjb25zdCBub3JtYWxJbmRlbnQgPSBjb25maWcubm9ybWFsaXplSW5kZW50YXRpb24oci5pbmRlbnRhdGlvbik7XG5cdFx0XHRcdGNvbnN0IGluY3JlYXNlZEluZGVudCA9IGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihyLmluZGVudGF0aW9uICsgci5hcHBlbmRUZXh0KTtcblx0XHRcdFx0Y29uc3QgdHlwZVRleHQgPSAnXFxuJyArIGluY3JlYXNlZEluZGVudCArICdcXG4nICsgbm9ybWFsSW5kZW50O1xuXHRcdFx0XHRpZiAoa2VlcFBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSZXBsYWNlQ29tbWFuZFdpdGhvdXRDaGFuZ2luZ1Bvc2l0aW9uKHJhbmdlLCB0eXBlVGV4dCwgdHJ1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSZXBsYWNlQ29tbWFuZFdpdGhPZmZzZXRDdXJzb3JTdGF0ZShyYW5nZSwgdHlwZVRleHQsIC0xLCBpbmNyZWFzZWRJbmRlbnQubGVuZ3RoIC0gbm9ybWFsSW5kZW50Lmxlbmd0aCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoci5pbmRlbnRBY3Rpb24gPT09IEluZGVudEFjdGlvbi5PdXRkZW50KSB7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbEluZGVudGF0aW9uID0gdW5zaGlmdEluZGVudChjb25maWcsIHIuaW5kZW50YXRpb24pO1xuXHRcdFx0XHRyZXR1cm4gdHlwZUNvbW1hbmQocmFuZ2UsICdcXG4nICsgY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKGFjdHVhbEluZGVudGF0aW9uICsgci5hcHBlbmRUZXh0KSwga2VlcFBvc2l0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3QgaW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKGxpbmVUZXh0KS5zdWJzdHJpbmcoMCwgcmFuZ2Uuc3RhcnRDb2x1bW4gLSAxKTtcblxuXHRcdGlmIChjb25maWcuYXV0b0luZGVudCA+PSBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCkge1xuXHRcdFx0Y29uc3QgaXIgPSBnZXRJbmRlbnRGb3JFbnRlcihjb25maWcuYXV0b0luZGVudCwgbW9kZWwsIHJhbmdlLCB7XG5cdFx0XHRcdHVuc2hpZnRJbmRlbnQ6IChpbmRlbnQpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdW5zaGlmdEluZGVudChjb25maWcsIGluZGVudCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNoaWZ0SW5kZW50OiAoaW5kZW50KSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHNoaWZ0SW5kZW50KGNvbmZpZywgaW5kZW50KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0bm9ybWFsaXplSW5kZW50YXRpb246IChpbmRlbnQpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKGluZGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIGNvbmZpZy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0aWYgKGlyKSB7XG5cdFx0XHRcdGxldCBvbGRFbmRWaWV3Q29sdW1uID0gY29uZmlnLnZpc2libGVDb2x1bW5Gcm9tQ29sdW1uKG1vZGVsLCByYW5nZS5nZXRFbmRQb3NpdGlvbigpKTtcblx0XHRcdFx0Y29uc3Qgb2xkRW5kQ29sdW1uID0gcmFuZ2UuZW5kQ29sdW1uO1xuXHRcdFx0XHRjb25zdCBuZXdMaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBmaXJzdE5vbldoaXRlc3BhY2UgPSBzdHJpbmdzLmZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4KG5ld0xpbmVDb250ZW50KTtcblx0XHRcdFx0aWYgKGZpcnN0Tm9uV2hpdGVzcGFjZSA+PSAwKSB7XG5cdFx0XHRcdFx0cmFuZ2UgPSByYW5nZS5zZXRFbmRQb3NpdGlvbihyYW5nZS5lbmRMaW5lTnVtYmVyLCBNYXRoLm1heChyYW5nZS5lbmRDb2x1bW4sIGZpcnN0Tm9uV2hpdGVzcGFjZSArIDEpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyYW5nZSA9IHJhbmdlLnNldEVuZFBvc2l0aW9uKHJhbmdlLmVuZExpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocmFuZ2UuZW5kTGluZU51bWJlcikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChrZWVwUG9zaXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFJlcGxhY2VDb21tYW5kV2l0aG91dENoYW5naW5nUG9zaXRpb24ocmFuZ2UsICdcXG4nICsgY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKGlyLmFmdGVyRW50ZXIpLCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRcdFx0XHRpZiAob2xkRW5kQ29sdW1uIDw9IGZpcnN0Tm9uV2hpdGVzcGFjZSArIDEpIHtcblx0XHRcdFx0XHRcdGlmICghY29uZmlnLmluc2VydFNwYWNlcykge1xuXHRcdFx0XHRcdFx0XHRvbGRFbmRWaWV3Q29sdW1uID0gTWF0aC5jZWlsKG9sZEVuZFZpZXdDb2x1bW4gLyBjb25maWcuaW5kZW50U2l6ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRvZmZzZXQgPSBNYXRoLm1pbihvbGRFbmRWaWV3Q29sdW1uICsgMSAtIGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihpci5hZnRlckVudGVyKS5sZW5ndGggLSAxLCAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSZXBsYWNlQ29tbWFuZFdpdGhPZmZzZXRDdXJzb3JTdGF0ZShyYW5nZSwgJ1xcbicgKyBjb25maWcubm9ybWFsaXplSW5kZW50YXRpb24oaXIuYWZ0ZXJFbnRlciksIDAsIG9mZnNldCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVDb21tYW5kKHJhbmdlLCAnXFxuJyArIGNvbmZpZy5ub3JtYWxpemVJbmRlbnRhdGlvbihpbmRlbnRhdGlvbiksIGtlZXBQb3NpdGlvbik7XG5cdH1cblxuXG5cdHB1YmxpYyBzdGF0aWMgbGluZUluc2VydEJlZm9yZShjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJVGV4dE1vZGVsIHwgbnVsbCwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10gfCBudWxsKTogSUNvbW1hbmRbXSB7XG5cdFx0aWYgKG1vZGVsID09PSBudWxsIHx8IHNlbGVjdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0bGV0IGxpbmVOdW1iZXIgPSBzZWxlY3Rpb25zW2ldLnBvc2l0aW9uTGluZU51bWJlcjtcblx0XHRcdGlmIChsaW5lTnVtYmVyID09PSAxKSB7XG5cdFx0XHRcdGNvbW1hbmRzW2ldID0gbmV3IFJlcGxhY2VDb21tYW5kV2l0aG91dENoYW5naW5nUG9zaXRpb24obmV3IFJhbmdlKDEsIDEsIDEsIDEpLCAnXFxuJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsaW5lTnVtYmVyLS07XG5cdFx0XHRcdGNvbnN0IGNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cblx0XHRcdFx0Y29tbWFuZHNbaV0gPSB0aGlzLl9lbnRlcihjb25maWcsIG1vZGVsLCBmYWxzZSwgbmV3IFJhbmdlKGxpbmVOdW1iZXIsIGNvbHVtbiwgbGluZU51bWJlciwgY29sdW1uKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb21tYW5kcztcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbGluZUluc2VydEFmdGVyKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwgfCBudWxsLCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSB8IG51bGwpOiBJQ29tbWFuZFtdIHtcblx0XHRpZiAobW9kZWwgPT09IG51bGwgfHwgc2VsZWN0aW9ucyA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kczogSUNvbW1hbmRbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzZWxlY3Rpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gc2VsZWN0aW9uc1tpXS5wb3NpdGlvbkxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBjb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29tbWFuZHNbaV0gPSB0aGlzLl9lbnRlcihjb25maWcsIG1vZGVsLCBmYWxzZSwgbmV3IFJhbmdlKGxpbmVOdW1iZXIsIGNvbHVtbiwgbGluZU51bWJlciwgY29sdW1uKSk7XG5cdFx0fVxuXHRcdHJldHVybiBjb21tYW5kcztcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgbGluZUJyZWFrSW5zZXJ0KGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdKTogSUNvbW1hbmRbXSB7XG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29tbWFuZHNbaV0gPSB0aGlzLl9lbnRlcihjb25maWcsIG1vZGVsLCB0cnVlLCBzZWxlY3Rpb25zW2ldKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbW1hbmRzO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQYXN0ZU9wZXJhdGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFZGl0cyhjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCB0ZXh0OiBzdHJpbmcsIHBhc3RlT25OZXdMaW5lOiBib29sZWFuLCBtdWx0aWN1cnNvclRleHQ6IHN0cmluZ1tdKSB7XG5cdFx0Y29uc3QgZGlzdHJpYnV0ZWRQYXN0ZSA9IHRoaXMuX2Rpc3RyaWJ1dGVQYXN0ZVRvQ3Vyc29ycyhjb25maWcsIHNlbGVjdGlvbnMsIHRleHQsIHBhc3RlT25OZXdMaW5lLCBtdWx0aWN1cnNvclRleHQpO1xuXHRcdGlmIChkaXN0cmlidXRlZFBhc3RlKSB7XG5cdFx0XHRzZWxlY3Rpb25zID0gc2VsZWN0aW9ucy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGlzdHJpYnV0ZWRQYXN0ZShjb25maWcsIG1vZGVsLCBzZWxlY3Rpb25zLCBkaXN0cmlidXRlZFBhc3RlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NpbXBsZVBhc3RlKGNvbmZpZywgbW9kZWwsIHNlbGVjdGlvbnMsIHRleHQsIHBhc3RlT25OZXdMaW5lKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZGlzdHJpYnV0ZVBhc3RlVG9DdXJzb3JzKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sIHRleHQ6IHN0cmluZywgcGFzdGVPbk5ld0xpbmU6IGJvb2xlYW4sIG11bHRpY3Vyc29yVGV4dDogc3RyaW5nW10pOiBzdHJpbmdbXSB8IG51bGwge1xuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChtdWx0aWN1cnNvclRleHQgJiYgbXVsdGljdXJzb3JUZXh0Lmxlbmd0aCA9PT0gc2VsZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBtdWx0aWN1cnNvclRleHQ7XG5cdFx0fVxuXHRcdGlmIChwYXN0ZU9uTmV3TGluZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChjb25maWcubXVsdGlDdXJzb3JQYXN0ZSA9PT0gJ3NwcmVhZCcpIHtcblx0XHRcdC8vIFRyeSB0byBzcHJlYWQgdGhlIHBhc3RlZCB0ZXh0IGluIGNhc2UgdGhlIGxpbmUgY291bnQgbWF0Y2hlcyB0aGUgY3Vyc29yIGNvdW50XG5cdFx0XHQvLyBSZW1vdmUgdHJhaWxpbmcgXFxuIGlmIHByZXNlbnRcblx0XHRcdGlmICh0ZXh0LmNoYXJDb2RlQXQodGV4dC5sZW5ndGggLSAxKSA9PT0gQ2hhckNvZGUuTGluZUZlZWQpIHtcblx0XHRcdFx0dGV4dCA9IHRleHQuc3Vic3RyaW5nKDAsIHRleHQubGVuZ3RoIC0gMSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZW1vdmUgdHJhaWxpbmcgXFxyIGlmIHByZXNlbnRcblx0XHRcdGlmICh0ZXh0LmNoYXJDb2RlQXQodGV4dC5sZW5ndGggLSAxKSA9PT0gQ2hhckNvZGUuQ2FycmlhZ2VSZXR1cm4pIHtcblx0XHRcdFx0dGV4dCA9IHRleHQuc3Vic3RyaW5nKDAsIHRleHQubGVuZ3RoIC0gMSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lcyA9IHN0cmluZ3Muc3BsaXRMaW5lcyh0ZXh0KTtcblx0XHRcdGlmIChsaW5lcy5sZW5ndGggPT09IHNlbGVjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBsaW5lcztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZGlzdHJpYnV0ZWRQYXN0ZShjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCB0ZXh0OiBzdHJpbmdbXSk6IEVkaXRPcGVyYXRpb25SZXN1bHQge1xuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNob3VsZE92ZXJ0eXBlT25QYXN0ZSA9IGNvbmZpZy5vdmVydHlwZU9uUGFzdGUgJiYgY29uZmlnLmlucHV0TW9kZSA9PT0gJ292ZXJ0eXBlJztcblx0XHRcdGNvbnN0IENob3NlblJlcGxhY2VDb21tYW5kID0gc2hvdWxkT3ZlcnR5cGVPblBhc3RlID8gUmVwbGFjZU92ZXJ0eXBlQ29tbWFuZCA6IFJlcGxhY2VDb21tYW5kO1xuXHRcdFx0Y29tbWFuZHNbaV0gPSBuZXcgQ2hvc2VuUmVwbGFjZUNvbW1hbmQoc2VsZWN0aW9uc1tpXSwgdGV4dFtpXSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgRWRpdE9wZXJhdGlvblJlc3VsdChFZGl0T3BlcmF0aW9uVHlwZS5PdGhlciwgY29tbWFuZHMsIHtcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IHRydWUsXG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QWZ0ZXI6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9zaW1wbGVQYXN0ZShjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCB0ZXh0OiBzdHJpbmcsIHBhc3RlT25OZXdMaW5lOiBib29sZWFuKTogRWRpdE9wZXJhdGlvblJlc3VsdCB7XG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uc1tpXTtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gc2VsZWN0aW9uLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRpZiAocGFzdGVPbk5ld0xpbmUgJiYgIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0cGFzdGVPbk5ld0xpbmUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXN0ZU9uTmV3TGluZSAmJiB0ZXh0LmluZGV4T2YoJ1xcbicpICE9PSB0ZXh0Lmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0cGFzdGVPbk5ld0xpbmUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXN0ZU9uTmV3TGluZSkge1xuXHRcdFx0XHQvLyBQYXN0ZSBlbnRpcmUgbGluZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGxpbmVcblx0XHRcdFx0Y29uc3QgdHlwZVNlbGVjdGlvbiA9IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0Y29tbWFuZHNbaV0gPSBuZXcgUmVwbGFjZUNvbW1hbmRUaGF0UHJlc2VydmVzU2VsZWN0aW9uKHR5cGVTZWxlY3Rpb24sIHRleHQsIHNlbGVjdGlvbiwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzaG91bGRPdmVydHlwZU9uUGFzdGUgPSBjb25maWcub3ZlcnR5cGVPblBhc3RlICYmIGNvbmZpZy5pbnB1dE1vZGUgPT09ICdvdmVydHlwZSc7XG5cdFx0XHRcdGNvbnN0IENob3NlblJlcGxhY2VDb21tYW5kID0gc2hvdWxkT3ZlcnR5cGVPblBhc3RlID8gUmVwbGFjZU92ZXJ0eXBlQ29tbWFuZCA6IFJlcGxhY2VDb21tYW5kO1xuXHRcdFx0XHRjb21tYW5kc1tpXSA9IG5ldyBDaG9zZW5SZXBsYWNlQ29tbWFuZChzZWxlY3Rpb24sIHRleHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEVkaXRPcGVyYXRpb25SZXN1bHQoRWRpdE9wZXJhdGlvblR5cGUuT3RoZXIsIGNvbW1hbmRzLCB7XG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlOiB0cnVlLFxuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEFmdGVyOiB0cnVlXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbXBvc2l0aW9uT3BlcmF0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldEVkaXRzKHByZXZFZGl0T3BlcmF0aW9uVHlwZTogRWRpdE9wZXJhdGlvblR5cGUsIGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCB0ZXh0OiBzdHJpbmcsIHJlcGxhY2VQcmV2Q2hhckNudDogbnVtYmVyLCByZXBsYWNlTmV4dENoYXJDbnQ6IG51bWJlciwgcG9zaXRpb25EZWx0YTogbnVtYmVyKSB7XG5cdFx0Y29uc3QgY29tbWFuZHMgPSBzZWxlY3Rpb25zLm1hcChzZWxlY3Rpb24gPT4gdGhpcy5fY29tcG9zaXRpb25UeXBlKG1vZGVsLCBzZWxlY3Rpb24sIHRleHQsIHJlcGxhY2VQcmV2Q2hhckNudCwgcmVwbGFjZU5leHRDaGFyQ250LCBwb3NpdGlvbkRlbHRhKSk7XG5cdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ090aGVyLCBjb21tYW5kcywge1xuXHRcdFx0c2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZTogc2hvdWxkUHVzaFN0YWNrRWxlbWVudEJldHdlZW4ocHJldkVkaXRPcGVyYXRpb25UeXBlLCBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdPdGhlciksXG5cdFx0XHRzaG91bGRQdXNoU3RhY2tFbGVtZW50QWZ0ZXI6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29tcG9zaXRpb25UeXBlKG1vZGVsOiBJVGV4dE1vZGVsLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgdGV4dDogc3RyaW5nLCByZXBsYWNlUHJldkNoYXJDbnQ6IG51bWJlciwgcmVwbGFjZU5leHRDaGFyQ250OiBudW1iZXIsIHBvc2l0aW9uRGVsdGE6IG51bWJlcik6IElDb21tYW5kIHwgbnVsbCB7XG5cdFx0aWYgKCFzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHQvLyBsb29rcyBsaWtlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yNzczXG5cdFx0XHQvLyB3aGVyZSBhIGN1cnNvciBvcGVyYXRpb24gb2NjdXJyZWQgYmVmb3JlIGEgY2FuY2VsZWQgY29tcG9zaXRpb25cblx0XHRcdC8vID0+IGlnbm9yZSBjb21wb3NpdGlvblxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHBvcyA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gTWF0aC5tYXgoMSwgcG9zLmNvbHVtbiAtIHJlcGxhY2VQcmV2Q2hhckNudCk7XG5cdFx0Y29uc3QgZW5kQ29sdW1uID0gTWF0aC5taW4obW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3MubGluZU51bWJlciksIHBvcy5jb2x1bW4gKyByZXBsYWNlTmV4dENoYXJDbnQpO1xuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvcy5saW5lTnVtYmVyLCBzdGFydENvbHVtbiwgcG9zLmxpbmVOdW1iZXIsIGVuZENvbHVtbik7XG5cdFx0cmV0dXJuIG5ldyBSZXBsYWNlQ29tbWFuZFdpdGhPZmZzZXRDdXJzb3JTdGF0ZShyYW5nZSwgdGV4dCwgMCwgcG9zaXRpb25EZWx0YSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFR5cGVXaXRob3V0SW50ZXJjZXB0b3JzT3BlcmF0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldEVkaXRzKHByZXZFZGl0T3BlcmF0aW9uVHlwZTogRWRpdE9wZXJhdGlvblR5cGUsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBzdHI6IHN0cmluZyk6IEVkaXRPcGVyYXRpb25SZXN1bHQge1xuXHRcdGNvbnN0IGNvbW1hbmRzOiBJQ29tbWFuZFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbW1hbmRzW2ldID0gbmV3IFJlcGxhY2VDb21tYW5kKHNlbGVjdGlvbnNbaV0sIHN0cik7XG5cdFx0fVxuXHRcdGNvbnN0IG9wVHlwZSA9IGdldFR5cGluZ09wZXJhdGlvbihzdHIsIHByZXZFZGl0T3BlcmF0aW9uVHlwZSk7XG5cdFx0cmV0dXJuIG5ldyBFZGl0T3BlcmF0aW9uUmVzdWx0KG9wVHlwZSwgY29tbWFuZHMsIHtcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmU6IHNob3VsZFB1c2hTdGFja0VsZW1lbnRCZXR3ZWVuKHByZXZFZGl0T3BlcmF0aW9uVHlwZSwgb3BUeXBlKSxcblx0XHRcdHNob3VsZFB1c2hTdGFja0VsZW1lbnRBZnRlcjogZmFsc2Vcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGFiT3BlcmF0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldENvbW1hbmRzKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdKSB7XG5cdFx0Y29uc3QgY29tbWFuZHM6IElDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uc1tpXTtcblx0XHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRcdGlmICgvXlxccyokLy50ZXN0KGxpbmVUZXh0KSAmJiBtb2RlbC50b2tlbml6YXRpb24uaXNDaGVhcFRvVG9rZW5pemUoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRsZXQgZ29vZEluZGVudCA9IHRoaXMuX2dvb2RJbmRlbnRGb3JMaW5lKGNvbmZpZywgbW9kZWwsIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGdvb2RJbmRlbnQgPSBnb29kSW5kZW50IHx8ICdcXHQnO1xuXHRcdFx0XHRcdGNvbnN0IHBvc3NpYmxlVHlwZVRleHQgPSBjb25maWcubm9ybWFsaXplSW5kZW50YXRpb24oZ29vZEluZGVudCk7XG5cdFx0XHRcdFx0aWYgKCFsaW5lVGV4dC5zdGFydHNXaXRoKHBvc3NpYmxlVHlwZVRleHQpKSB7XG5cdFx0XHRcdFx0XHRjb21tYW5kc1tpXSA9IG5ldyBSZXBsYWNlQ29tbWFuZChuZXcgUmFuZ2Uoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgMSwgc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciwgbGluZVRleHQubGVuZ3RoICsgMSksIHBvc3NpYmxlVHlwZVRleHQsIHRydWUpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbW1hbmRzW2ldID0gdGhpcy5fcmVwbGFjZUp1bXBUb05leHRJbmRlbnQoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9uLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyID09PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVNYXhDb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb24uc3RhcnRDb2x1bW4gIT09IDEgfHwgc2VsZWN0aW9uLmVuZENvbHVtbiAhPT0gbGluZU1heENvbHVtbikge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBpcyBhIHNpbmdsZSBsaW5lIHNlbGVjdGlvbiB0aGF0IGlzIG5vdCB0aGUgZW50aXJlIGxpbmVcblx0XHRcdFx0XHRcdGNvbW1hbmRzW2ldID0gdGhpcy5fcmVwbGFjZUp1bXBUb05leHRJbmRlbnQoY29uZmlnLCBtb2RlbCwgc2VsZWN0aW9uLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29tbWFuZHNbaV0gPSBuZXcgU2hpZnRDb21tYW5kKHNlbGVjdGlvbiwge1xuXHRcdFx0XHRcdGlzVW5zaGlmdDogZmFsc2UsXG5cdFx0XHRcdFx0dGFiU2l6ZTogY29uZmlnLnRhYlNpemUsXG5cdFx0XHRcdFx0aW5kZW50U2l6ZTogY29uZmlnLmluZGVudFNpemUsXG5cdFx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBjb25maWcuaW5zZXJ0U3BhY2VzLFxuXHRcdFx0XHRcdHVzZVRhYlN0b3BzOiBjb25maWcudXNlVGFiU3RvcHMsXG5cdFx0XHRcdFx0YXV0b0luZGVudDogY29uZmlnLmF1dG9JbmRlbnRcblx0XHRcdFx0fSwgY29uZmlnLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29tbWFuZHM7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ29vZEluZGVudEZvckxpbmUoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBtb2RlbDogSVRleHRNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0bGV0IGFjdGlvbjogSW5kZW50QWN0aW9uIHwgRW50ZXJBY3Rpb24gfCBudWxsID0gbnVsbDtcblx0XHRsZXQgaW5kZW50YXRpb246IHN0cmluZyA9ICcnO1xuXHRcdGNvbnN0IGV4cGVjdGVkSW5kZW50QWN0aW9uID0gZ2V0SW5oZXJpdEluZGVudEZvckxpbmUoY29uZmlnLmF1dG9JbmRlbnQsIG1vZGVsLCBsaW5lTnVtYmVyLCBmYWxzZSwgY29uZmlnLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGlmIChleHBlY3RlZEluZGVudEFjdGlvbikge1xuXHRcdFx0YWN0aW9uID0gZXhwZWN0ZWRJbmRlbnRBY3Rpb24uYWN0aW9uO1xuXHRcdFx0aW5kZW50YXRpb24gPSBleHBlY3RlZEluZGVudEFjdGlvbi5pbmRlbnRhdGlvbjtcblx0XHR9IGVsc2UgaWYgKGxpbmVOdW1iZXIgPiAxKSB7XG5cdFx0XHRsZXQgbGFzdExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRcdGZvciAobGFzdExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyIC0gMTsgbGFzdExpbmVOdW1iZXIgPj0gMTsgbGFzdExpbmVOdW1iZXItLSkge1xuXHRcdFx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxhc3RMaW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3Qgbm9uV2hpdGVzcGFjZUlkeCA9IHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lVGV4dCk7XG5cdFx0XHRcdGlmIChub25XaGl0ZXNwYWNlSWR4ID49IDApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGxhc3RMaW5lTnVtYmVyIDwgMSkge1xuXHRcdFx0XHQvLyBObyBwcmV2aW91cyBsaW5lIHdpdGggY29udGVudCBmb3VuZFxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGFzdExpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRFbnRlckFjdGlvbiA9IGdldEVudGVyQWN0aW9uKGNvbmZpZy5hdXRvSW5kZW50LCBtb2RlbCwgbmV3IFJhbmdlKGxhc3RMaW5lTnVtYmVyLCBtYXhDb2x1bW4sIGxhc3RMaW5lTnVtYmVyLCBtYXhDb2x1bW4pLCBjb25maWcubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRpZiAoZXhwZWN0ZWRFbnRlckFjdGlvbikge1xuXHRcdFx0XHRpbmRlbnRhdGlvbiA9IGV4cGVjdGVkRW50ZXJBY3Rpb24uaW5kZW50YXRpb24gKyBleHBlY3RlZEVudGVyQWN0aW9uLmFwcGVuZFRleHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChhY3Rpb24pIHtcblx0XHRcdGlmIChhY3Rpb24gPT09IEluZGVudEFjdGlvbi5JbmRlbnQpIHtcblx0XHRcdFx0aW5kZW50YXRpb24gPSBzaGlmdEluZGVudChjb25maWcsIGluZGVudGF0aW9uKTtcblx0XHRcdH1cblx0XHRcdGlmIChhY3Rpb24gPT09IEluZGVudEFjdGlvbi5PdXRkZW50KSB7XG5cdFx0XHRcdGluZGVudGF0aW9uID0gdW5zaGlmdEluZGVudChjb25maWcsIGluZGVudGF0aW9uKTtcblx0XHRcdH1cblx0XHRcdGluZGVudGF0aW9uID0gY29uZmlnLm5vcm1hbGl6ZUluZGVudGF0aW9uKGluZGVudGF0aW9uKTtcblx0XHR9XG5cdFx0aWYgKCFpbmRlbnRhdGlvbikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBpbmRlbnRhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZXBsYWNlSnVtcFRvTmV4dEluZGVudChjb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sIG1vZGVsOiBJQ3Vyc29yU2ltcGxlTW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBpbnNlcnRzQXV0b1doaXRlc3BhY2U6IGJvb2xlYW4pOiBSZXBsYWNlQ29tbWFuZCB7XG5cdFx0bGV0IHR5cGVUZXh0ID0gJyc7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdGlmIChjb25maWcuaW5zZXJ0U3BhY2VzKSB7XG5cdFx0XHRjb25zdCB2aXNpYmxlQ29sdW1uRnJvbUNvbHVtbiA9IGNvbmZpZy52aXNpYmxlQ29sdW1uRnJvbUNvbHVtbihtb2RlbCwgcG9zaXRpb24pO1xuXHRcdFx0Y29uc3QgaW5kZW50U2l6ZSA9IGNvbmZpZy5pbmRlbnRTaXplO1xuXHRcdFx0Y29uc3Qgc3BhY2VzQ250ID0gaW5kZW50U2l6ZSAtICh2aXNpYmxlQ29sdW1uRnJvbUNvbHVtbiAlIGluZGVudFNpemUpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzcGFjZXNDbnQ7IGkrKykge1xuXHRcdFx0XHR0eXBlVGV4dCArPSAnICc7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHR5cGVUZXh0ID0gJ1xcdCc7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmVwbGFjZUNvbW1hbmQoc2VsZWN0aW9uLCB0eXBlVGV4dCwgaW5zZXJ0c0F1dG9XaGl0ZXNwYWNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQmFzZVR5cGVXaXRoQXV0b0Nsb3NpbmdDb21tYW5kIGV4dGVuZHMgUmVwbGFjZUNvbW1hbmRXaXRoT2Zmc2V0Q3Vyc29yU3RhdGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wZW5DaGFyYWN0ZXI6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfY2xvc2VDaGFyYWN0ZXI6IHN0cmluZztcblx0cHVibGljIGNsb3NlQ2hhcmFjdGVyUmFuZ2U6IFJhbmdlIHwgbnVsbDtcblx0cHVibGljIGVuY2xvc2luZ1JhbmdlOiBSYW5nZSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3Ioc2VsZWN0aW9uOiBTZWxlY3Rpb24sIHRleHQ6IHN0cmluZywgbGluZU51bWJlckRlbHRhT2Zmc2V0OiBudW1iZXIsIGNvbHVtbkRlbHRhT2Zmc2V0OiBudW1iZXIsIG9wZW5DaGFyYWN0ZXI6IHN0cmluZywgY2xvc2VDaGFyYWN0ZXI6IHN0cmluZykge1xuXHRcdHN1cGVyKHNlbGVjdGlvbiwgdGV4dCwgbGluZU51bWJlckRlbHRhT2Zmc2V0LCBjb2x1bW5EZWx0YU9mZnNldCk7XG5cdFx0dGhpcy5fb3BlbkNoYXJhY3RlciA9IG9wZW5DaGFyYWN0ZXI7XG5cdFx0dGhpcy5fY2xvc2VDaGFyYWN0ZXIgPSBjbG9zZUNoYXJhY3Rlcjtcblx0XHR0aGlzLmNsb3NlQ2hhcmFjdGVyUmFuZ2UgPSBudWxsO1xuXHRcdHRoaXMuZW5jbG9zaW5nUmFuZ2UgPSBudWxsO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jb21wdXRlQ3Vyc29yU3RhdGVXaXRoUmFuZ2UobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSwgaGVscGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEpOiBTZWxlY3Rpb24ge1xuXHRcdHRoaXMuY2xvc2VDaGFyYWN0ZXJSYW5nZSA9IG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbiAtIHRoaXMuX2Nsb3NlQ2hhcmFjdGVyLmxlbmd0aCwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0XHR0aGlzLmVuY2xvc2luZ1JhbmdlID0gbmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uIC0gdGhpcy5fb3BlbkNoYXJhY3Rlci5sZW5ndGggLSB0aGlzLl9jbG9zZUNoYXJhY3Rlci5sZW5ndGgsIHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cdFx0cmV0dXJuIHN1cGVyLmNvbXB1dGVDdXJzb3JTdGF0ZShtb2RlbCwgaGVscGVyKTtcblx0fVxufVxuXG5jbGFzcyBUeXBlV2l0aEF1dG9DbG9zaW5nQ29tbWFuZCBleHRlbmRzIEJhc2VUeXBlV2l0aEF1dG9DbG9zaW5nQ29tbWFuZCB7XG5cblx0Y29uc3RydWN0b3Ioc2VsZWN0aW9uOiBTZWxlY3Rpb24sIG9wZW5DaGFyYWN0ZXI6IHN0cmluZywgaW5zZXJ0T3BlbkNoYXJhY3RlcjogYm9vbGVhbiwgY2xvc2VDaGFyYWN0ZXI6IHN0cmluZykge1xuXHRcdGNvbnN0IHRleHQgPSAoaW5zZXJ0T3BlbkNoYXJhY3RlciA/IG9wZW5DaGFyYWN0ZXIgOiAnJykgKyBjbG9zZUNoYXJhY3Rlcjtcblx0XHRjb25zdCBsaW5lTnVtYmVyRGVsdGFPZmZzZXQgPSAwO1xuXHRcdGNvbnN0IGNvbHVtbkRlbHRhT2Zmc2V0ID0gLWNsb3NlQ2hhcmFjdGVyLmxlbmd0aDtcblx0XHRzdXBlcihzZWxlY3Rpb24sIHRleHQsIGxpbmVOdW1iZXJEZWx0YU9mZnNldCwgY29sdW1uRGVsdGFPZmZzZXQsIG9wZW5DaGFyYWN0ZXIsIGNsb3NlQ2hhcmFjdGVyKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjb21wdXRlQ3Vyc29yU3RhdGUobW9kZWw6IElUZXh0TW9kZWwsIGhlbHBlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXJEYXRhKTogU2VsZWN0aW9uIHtcblx0XHRjb25zdCBpbnZlcnNlRWRpdE9wZXJhdGlvbnMgPSBoZWxwZXIuZ2V0SW52ZXJzZUVkaXRPcGVyYXRpb25zKCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBpbnZlcnNlRWRpdE9wZXJhdGlvbnNbMF0ucmFuZ2U7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXB1dGVDdXJzb3JTdGF0ZVdpdGhSYW5nZShtb2RlbCwgcmFuZ2UsIGhlbHBlcik7XG5cdH1cbn1cblxuY2xhc3MgVHlwZVdpdGhJbmRlbnRhdGlvbkFuZEF1dG9DbG9zaW5nQ29tbWFuZCBleHRlbmRzIEJhc2VUeXBlV2l0aEF1dG9DbG9zaW5nQ29tbWFuZCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXV0b0luZGVudGF0aW9uRWRpdDogeyByYW5nZTogUmFuZ2U7IHRleHQ6IHN0cmluZyB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvQ2xvc2luZ0VkaXQ6IHsgcmFuZ2U6IFJhbmdlOyB0ZXh0OiBzdHJpbmcgfTtcblxuXHRjb25zdHJ1Y3RvcihhdXRvSW5kZW50YXRpb25FZGl0OiB7IHJhbmdlOiBSYW5nZTsgdGV4dDogc3RyaW5nIH0sIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBvcGVuQ2hhcmFjdGVyOiBzdHJpbmcsIGNsb3NlQ2hhcmFjdGVyOiBzdHJpbmcpIHtcblx0XHRjb25zdCB0ZXh0ID0gb3BlbkNoYXJhY3RlciArIGNsb3NlQ2hhcmFjdGVyO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJEZWx0YU9mZnNldCA9IDA7XG5cdFx0Y29uc3QgY29sdW1uRGVsdGFPZmZzZXQgPSBvcGVuQ2hhcmFjdGVyLmxlbmd0aDtcblx0XHRzdXBlcihzZWxlY3Rpb24sIHRleHQsIGxpbmVOdW1iZXJEZWx0YU9mZnNldCwgY29sdW1uRGVsdGFPZmZzZXQsIG9wZW5DaGFyYWN0ZXIsIGNsb3NlQ2hhcmFjdGVyKTtcblx0XHR0aGlzLl9hdXRvSW5kZW50YXRpb25FZGl0ID0gYXV0b0luZGVudGF0aW9uRWRpdDtcblx0XHR0aGlzLl9hdXRvQ2xvc2luZ0VkaXQgPSB7IHJhbmdlOiBzZWxlY3Rpb24sIHRleHQgfTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRFZGl0T3BlcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyKTogdm9pZCB7XG5cdFx0YnVpbGRlci5hZGRUcmFja2VkRWRpdE9wZXJhdGlvbih0aGlzLl9hdXRvSW5kZW50YXRpb25FZGl0LnJhbmdlLCB0aGlzLl9hdXRvSW5kZW50YXRpb25FZGl0LnRleHQpO1xuXHRcdGJ1aWxkZXIuYWRkVHJhY2tlZEVkaXRPcGVyYXRpb24odGhpcy5fYXV0b0Nsb3NpbmdFZGl0LnJhbmdlLCB0aGlzLl9hdXRvQ2xvc2luZ0VkaXQudGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY29tcHV0ZUN1cnNvclN0YXRlKG1vZGVsOiBJVGV4dE1vZGVsLCBoZWxwZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSk6IFNlbGVjdGlvbiB7XG5cdFx0Y29uc3QgaW52ZXJzZUVkaXRPcGVyYXRpb25zID0gaGVscGVyLmdldEludmVyc2VFZGl0T3BlcmF0aW9ucygpO1xuXHRcdGlmIChpbnZlcnNlRWRpdE9wZXJhdGlvbnMubGVuZ3RoICE9PSAyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIHNob3VsZCBiZSB0d28gaW52ZXJzZSBlZGl0IG9wZXJhdGlvbnMhJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlMSA9IGludmVyc2VFZGl0T3BlcmF0aW9uc1swXS5yYW5nZTtcblx0XHRjb25zdCByYW5nZTIgPSBpbnZlcnNlRWRpdE9wZXJhdGlvbnNbMV0ucmFuZ2U7XG5cdFx0Y29uc3QgcmFuZ2UgPSByYW5nZTEucGx1c1JhbmdlKHJhbmdlMik7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXB1dGVDdXJzb3JTdGF0ZVdpdGhSYW5nZShtb2RlbCwgcmFuZ2UsIGhlbHBlcik7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0VHlwaW5nT3BlcmF0aW9uKHR5cGVkVGV4dDogc3RyaW5nLCBwcmV2aW91c1R5cGluZ09wZXJhdGlvbjogRWRpdE9wZXJhdGlvblR5cGUpOiBFZGl0T3BlcmF0aW9uVHlwZSB7XG5cdGlmICh0eXBlZFRleHQgPT09ICcgJykge1xuXHRcdHJldHVybiBwcmV2aW91c1R5cGluZ09wZXJhdGlvbiA9PT0gRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nRmlyc3RTcGFjZVxuXHRcdFx0fHwgcHJldmlvdXNUeXBpbmdPcGVyYXRpb24gPT09IEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ0NvbnNlY3V0aXZlU3BhY2Vcblx0XHRcdD8gRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nQ29uc2VjdXRpdmVTcGFjZVxuXHRcdFx0OiBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdGaXJzdFNwYWNlO1xuXHR9XG5cblx0cmV0dXJuIEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ090aGVyO1xufVxuXG5mdW5jdGlvbiBzaG91bGRQdXNoU3RhY2tFbGVtZW50QmV0d2VlbihwcmV2aW91c1R5cGluZ09wZXJhdGlvbjogRWRpdE9wZXJhdGlvblR5cGUsIHR5cGluZ09wZXJhdGlvbjogRWRpdE9wZXJhdGlvblR5cGUpOiBib29sZWFuIHtcblx0aWYgKGlzVHlwaW5nT3BlcmF0aW9uKHByZXZpb3VzVHlwaW5nT3BlcmF0aW9uKSAmJiAhaXNUeXBpbmdPcGVyYXRpb24odHlwaW5nT3BlcmF0aW9uKSkge1xuXHRcdC8vIEFsd2F5cyBzZXQgYW4gdW5kbyBzdG9wIGJlZm9yZSBub24tdHlwZSBvcGVyYXRpb25zXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKHByZXZpb3VzVHlwaW5nT3BlcmF0aW9uID09PSBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdGaXJzdFNwYWNlKSB7XG5cdFx0Ly8gYGFiYyB8ZGA6IE5vIHVuZG8gc3RvcFxuXHRcdC8vIGBhYmMgIHxkYDogVW5kbyBzdG9wXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdC8vIEluc2VydCB1bmRvIHN0b3AgYmV0d2VlbiBkaWZmZXJlbnQgb3BlcmF0aW9uIHR5cGVzXG5cdHJldHVybiBub3JtYWxpemVPcGVyYXRpb25UeXBlKHByZXZpb3VzVHlwaW5nT3BlcmF0aW9uKSAhPT0gbm9ybWFsaXplT3BlcmF0aW9uVHlwZSh0eXBpbmdPcGVyYXRpb24pO1xufVxuXG5mdW5jdGlvbiBub3JtYWxpemVPcGVyYXRpb25UeXBlKHR5cGU6IEVkaXRPcGVyYXRpb25UeXBlKTogRWRpdE9wZXJhdGlvblR5cGUgfCAnc3BhY2UnIHtcblx0cmV0dXJuICh0eXBlID09PSBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdDb25zZWN1dGl2ZVNwYWNlIHx8IHR5cGUgPT09IEVkaXRPcGVyYXRpb25UeXBlLlR5cGluZ0ZpcnN0U3BhY2UpXG5cdFx0PyAnc3BhY2UnXG5cdFx0OiB0eXBlO1xufVxuXG5mdW5jdGlvbiBpc1R5cGluZ09wZXJhdGlvbih0eXBlOiBFZGl0T3BlcmF0aW9uVHlwZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdHlwZSA9PT0gRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nT3RoZXJcblx0XHR8fCB0eXBlID09PSBFZGl0T3BlcmF0aW9uVHlwZS5UeXBpbmdGaXJzdFNwYWNlXG5cdFx0fHwgdHlwZSA9PT0gRWRpdE9wZXJhdGlvblR5cGUuVHlwaW5nQ29uc2VjdXRpdmVTcGFjZTtcbn1cblxuZnVuY3Rpb24gaXNBdXRvQ2xvc2luZ092ZXJ0eXBlKGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBhdXRvQ2xvc2VkQ2hhcmFjdGVyczogUmFuZ2VbXSwgY2g6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoY29uZmlnLmF1dG9DbG9zaW5nT3ZlcnR5cGUgPT09ICduZXZlcicpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKCFjb25maWcuYXV0b0Nsb3NpbmdQYWlycy5hdXRvQ2xvc2luZ1BhaXJzQ2xvc2VTaW5nbGVDaGFyLmhhcyhjaCkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBzZWxlY3Rpb25zW2ldO1xuXHRcdGlmICghc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwb3NpdGlvbiA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgYWZ0ZXJDaGFyYWN0ZXIgPSBsaW5lVGV4dC5jaGFyQXQocG9zaXRpb24uY29sdW1uIC0gMSk7XG5cdFx0aWYgKGFmdGVyQ2hhcmFjdGVyICE9PSBjaCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBEbyBub3Qgb3Zlci10eXBlIHF1b3RlcyBhZnRlciBhIGJhY2tzbGFzaFxuXHRcdGNvbnN0IGNoSXNRdW90ZSA9IGlzUXVvdGUoY2gpO1xuXHRcdGNvbnN0IGJlZm9yZUNoYXJhY3RlciA9IHBvc2l0aW9uLmNvbHVtbiA+IDIgPyBsaW5lVGV4dC5jaGFyQ29kZUF0KHBvc2l0aW9uLmNvbHVtbiAtIDIpIDogQ2hhckNvZGUuTnVsbDtcblx0XHRpZiAoYmVmb3JlQ2hhcmFjdGVyID09PSBDaGFyQ29kZS5CYWNrc2xhc2ggJiYgY2hJc1F1b3RlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIE11c3Qgb3Zlci10eXBlIGEgY2xvc2luZyBjaGFyYWN0ZXIgdHlwZWQgYnkgdGhlIGVkaXRvclxuXHRcdGlmIChjb25maWcuYXV0b0Nsb3NpbmdPdmVydHlwZSA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRsZXQgZm91bmQgPSBmYWxzZTtcblx0XHRcdGZvciAobGV0IGogPSAwLCBsZW5KID0gYXV0b0Nsb3NlZENoYXJhY3RlcnMubGVuZ3RoOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdGNvbnN0IGF1dG9DbG9zZWRDaGFyYWN0ZXIgPSBhdXRvQ2xvc2VkQ2hhcmFjdGVyc1tqXTtcblx0XHRcdFx0aWYgKHBvc2l0aW9uLmxpbmVOdW1iZXIgPT09IGF1dG9DbG9zZWRDaGFyYWN0ZXIuc3RhcnRMaW5lTnVtYmVyICYmIHBvc2l0aW9uLmNvbHVtbiA9PT0gYXV0b0Nsb3NlZENoYXJhY3Rlci5zdGFydENvbHVtbikge1xuXHRcdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFmb3VuZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiB0eXBlQ29tbWFuZChyYW5nZTogUmFuZ2UsIHRleHQ6IHN0cmluZywga2VlcFBvc2l0aW9uOiBib29sZWFuKTogSUNvbW1hbmQge1xuXHRpZiAoa2VlcFBvc2l0aW9uKSB7XG5cdFx0cmV0dXJuIG5ldyBSZXBsYWNlQ29tbWFuZFdpdGhvdXRDaGFuZ2luZ1Bvc2l0aW9uKHJhbmdlLCB0ZXh0LCB0cnVlKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gbmV3IFJlcGxhY2VDb21tYW5kKHJhbmdlLCB0ZXh0LCB0cnVlKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hpZnRJbmRlbnQoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBpbmRlbnRhdGlvbjogc3RyaW5nLCBjb3VudD86IG51bWJlcik6IHN0cmluZyB7XG5cdGNvdW50ID0gY291bnQgfHwgMTtcblx0cmV0dXJuIFNoaWZ0Q29tbWFuZC5zaGlmdEluZGVudChpbmRlbnRhdGlvbiwgaW5kZW50YXRpb24ubGVuZ3RoICsgY291bnQsIGNvbmZpZy50YWJTaXplLCBjb25maWcuaW5kZW50U2l6ZSwgY29uZmlnLmluc2VydFNwYWNlcyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1bnNoaWZ0SW5kZW50KGNvbmZpZzogQ3Vyc29yQ29uZmlndXJhdGlvbiwgaW5kZW50YXRpb246IHN0cmluZywgY291bnQ/OiBudW1iZXIpOiBzdHJpbmcge1xuXHRjb3VudCA9IGNvdW50IHx8IDE7XG5cdHJldHVybiBTaGlmdENvbW1hbmQudW5zaGlmdEluZGVudChpbmRlbnRhdGlvbiwgaW5kZW50YXRpb24ubGVuZ3RoICsgY291bnQsIGNvbmZpZy50YWJTaXplLCBjb25maWcuaW5kZW50U2l6ZSwgY29uZmlnLmluc2VydFNwYWNlcyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRTdXJyb3VuZENoYXIoY29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uLCBjaDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChpc1F1b3RlKGNoKSkge1xuXHRcdHJldHVybiAoY29uZmlnLmF1dG9TdXJyb3VuZCA9PT0gJ3F1b3RlcycgfHwgY29uZmlnLmF1dG9TdXJyb3VuZCA9PT0gJ2xhbmd1YWdlRGVmaW5lZCcpO1xuXHR9IGVsc2Uge1xuXHRcdC8vIENoYXJhY3RlciBpcyBhIGJyYWNrZXRcblx0XHRyZXR1cm4gKGNvbmZpZy5hdXRvU3Vycm91bmQgPT09ICdicmFja2V0cycgfHwgY29uZmlnLmF1dG9TdXJyb3VuZCA9PT0gJ2xhbmd1YWdlRGVmaW5lZCcpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxZQUFZLGFBQWE7QUFDekIsU0FBUyxnQkFBZ0IscUNBQXFDLHVDQUF1QyxzQ0FBc0Msd0JBQXdCLDhDQUE4QztBQUNqTixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUE4QixxQkFBcUIsbUJBQXVDLGVBQWU7QUFDekcsU0FBUyxvQkFBb0IsK0JBQStCO0FBQzVELFNBQVMsYUFBYTtBQUV0QixTQUFTLGdCQUFnQjtBQUd6QixTQUFzQixvQkFBd0Q7QUFDOUUsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBb0MsZ0NBQWdDO0FBQ3BFLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsd0JBQXdCLG1CQUFtQiwrQkFBK0I7QUFDbkYsU0FBUyxzQkFBc0I7QUFHeEIsTUFBTSxvQkFBb0I7QUFBQSxFQUVoQyxPQUFjLFNBQVMsUUFBNkIsT0FBbUIsWUFBeUIsSUFBWSxvQkFBOEQ7QUFDekssUUFBSSxDQUFDLHNCQUFzQixLQUFLLGtCQUFrQixRQUFRLE9BQU8sVUFBVSxHQUFHO0FBQzdFLFlBQU0sMkJBQTRFLENBQUM7QUFDbkYsaUJBQVcsYUFBYSxZQUFZO0FBQ25DLGNBQU0sY0FBYyxLQUFLLG1DQUFtQyxRQUFRLE9BQU8sV0FBVyxFQUFFO0FBQ3hGLFlBQUksZ0JBQWdCLE1BQU07QUFFekI7QUFBQSxRQUNEO0FBQ0EsaUNBQXlCLEtBQUssRUFBRSxXQUFXLFlB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LEdBQUc7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFdBQVcsVUFBVSxZQUFZO0FBQ3ZDLFVBQU0sV0FBVyxNQUFNLGVBQWUsU0FBUyxVQUFVO0FBQ3pELFVBQU0saUJBQWlCLFNBQVMsT0FBTyxTQUFTLFNBQVMsQ0FBQztBQUMxRCxRQUFJLG1CQUFtQixJQUFJO0FBQzFCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxZQUFZLFFBQVEsRUFBRTtBQUM1QixVQUFNLGtCQUFrQixTQUFTLFNBQVMsSUFBSSxTQUFTLFdBQVcsU0FBUyxTQUFTLENBQUMsSUFBSSxTQUFTO0FBQ2xHLFFBQUksb0JBQW9CLFNBQVMsYUFBYSxXQUFXO0FBQ3hELGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxPQUFPLHdCQUF3QixRQUFRO0FBQzFDLFVBQUksUUFBUTtBQUNaLGVBQVMsSUFBSSxHQUFHLE9BQU8scUJBQXFCLFFBQVEsSUFBSSxNQUFNLEtBQUs7QUFDbEUsY0FBTSxzQkFBc0IscUJBQXFCLENBQUM7QUFDbEQsWUFBSSxTQUFTLGVBQWUsb0JBQW9CLG1CQUFtQixTQUFTLFdBQVcsb0JBQW9CLGFBQWE7QUFDdkgsa0JBQVE7QUFDUjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLE9BQU87QUFDWCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxZQUFZLE9BQWMsTUFBYyxjQUFpQztBQUNqRixNQUFJLGNBQWM7QUFDakIsV0FBTyxJQUFJLHNDQUFzQyxPQUFPLE1BQU0sSUFBSTtBQUFBLEVBQ25FLE9BQU87QUFDTixXQUFPLElBQUksZUFBZSxPQUFPLE1BQU0sSUFBSTtBQUFBLEVBQzVDO0FBQ0Q7QUFFTyxTQUFTLFlBQVksUUFBNkIsYUFBcUIsT0FBd0I7QUFDckcsVUFBUSxTQUFTO0FBQ2pCLFNBQU8sYUFBYSxZQUFZLGFBQWEsWUFBWSxTQUFTLE9BQU8sT0FBTyxTQUFTLE9BQU8sWUFBWSxPQUFPLFlBQVk7QUFDaEk7QUFFTyxTQUFTLGNBQWMsUUFBNkIsYUFBcUIsT0FBd0I7QUFDdkcsVUFBUSxTQUFTO0FBQ2pCLFNBQU8sYUFBYSxjQUFjLGFBQWEsWUFBWSxTQUFTLE9BQU8sT0FBTyxTQUFTLE9BQU8sWUFBWSxPQUFPLFlBQVk7QUFDbEk7QUFFTyxTQUFTLG1CQUFtQixRQUE2QixJQUFxQjtBQUNwRixNQUFJLFFBQVEsRUFBRSxHQUFHO0FBQ2hCLFdBQVEsT0FBTyxpQkFBaUIsWUFBWSxPQUFPLGlCQUFpQjtBQUFBLEVBQ3JFLE9BQU87QUFFTixXQUFRLE9BQU8saUJBQWlCLGNBQWMsT0FBTyxpQkFBaUI7QUFBQSxFQUN2RTtBQUNEOyIsCiAgIm5hbWVzIjogWyJsaW5lVGV4dCIsICJpbmRlbnRhdGlvbiJdCn0K
