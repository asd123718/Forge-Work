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
import * as strings from "../../../../base/common/strings.js";
import { ShiftCommand } from "../../../common/commands/shiftCommand.js";
import { EditorAutoIndentStrategy } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { IndentAction } from "../../../common/languages/languageConfiguration.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { IndentConsts } from "../../../common/languages/supports/indentRules.js";
import * as indentUtils from "../../indentation/common/indentUtils.js";
import { getGoodIndentForLine, getIndentMetadata } from "../../../common/languages/autoIndent.js";
import { getEnterAction } from "../../../common/languages/enterAction.js";
let MoveLinesCommand = class {
  constructor(selection, isMovingDown, autoIndent, _languageConfigurationService) {
    this._languageConfigurationService = _languageConfigurationService;
    this._selection = selection;
    this._isMovingDown = isMovingDown;
    this._autoIndent = autoIndent;
    this._selectionId = null;
    this._moveEndLineSelectionShrink = false;
  }
  createVirtualModel(model, lineNumberMapper, contentOverride) {
    return {
      tokenization: {
        getLineTokens: (lineNumber) => model.tokenization.getLineTokens(lineNumberMapper(lineNumber)),
        getLanguageId: () => model.getLanguageId(),
        getLanguageIdAtPosition: (lineNumber, column) => model.getLanguageIdAtPosition(lineNumber, column)
      },
      getLineContent: (lineNumber) => {
        const customContent = contentOverride?.(lineNumber);
        if (customContent !== void 0) {
          return customContent;
        }
        return model.getLineContent(lineNumberMapper(lineNumber));
      }
    };
  }
  getEditOperations(model, builder) {
    const modelLineCount = model.getLineCount();
    if (this._isMovingDown && this._selection.endLineNumber === modelLineCount) {
      this._selectionId = builder.trackSelection(this._selection);
      return;
    }
    if (!this._isMovingDown && this._selection.startLineNumber === 1) {
      this._selectionId = builder.trackSelection(this._selection);
      return;
    }
    this._moveEndPositionDown = false;
    let s = this._selection;
    if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
      this._moveEndPositionDown = true;
      s = s.setEndPosition(s.endLineNumber - 1, model.getLineMaxColumn(s.endLineNumber - 1));
    }
    const { tabSize, indentSize, insertSpaces } = model.getOptions();
    const indentConverter = this.buildIndentConverter(tabSize, indentSize, insertSpaces);
    if (s.startLineNumber === s.endLineNumber && model.getLineMaxColumn(s.startLineNumber) === 1) {
      const lineNumber = s.startLineNumber;
      const otherLineNumber = this._isMovingDown ? lineNumber + 1 : lineNumber - 1;
      if (model.getLineMaxColumn(otherLineNumber) === 1) {
        builder.addEditOperation(new Range(1, 1, 1, 1), null);
      } else {
        builder.addEditOperation(new Range(lineNumber, 1, lineNumber, 1), model.getLineContent(otherLineNumber));
        builder.addEditOperation(new Range(otherLineNumber, 1, otherLineNumber, model.getLineMaxColumn(otherLineNumber)), null);
      }
      s = new Selection(otherLineNumber, 1, otherLineNumber, 1);
    } else {
      let movingLineNumber;
      let movingLineText;
      if (this._isMovingDown) {
        movingLineNumber = s.endLineNumber + 1;
        movingLineText = model.getLineContent(movingLineNumber);
        builder.addEditOperation(new Range(movingLineNumber - 1, model.getLineMaxColumn(movingLineNumber - 1), movingLineNumber, model.getLineMaxColumn(movingLineNumber)), null);
        let insertingText = movingLineText;
        if (this.shouldAutoIndent(model, s)) {
          const movingLineMatchResult = this.matchEnterRule(model, indentConverter, tabSize, movingLineNumber, s.startLineNumber - 1);
          if (movingLineMatchResult !== null) {
            const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
            const newSpaceCnt = movingLineMatchResult + indentUtils.getSpaceCnt(oldIndentation, tabSize);
            const newIndentation = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
            insertingText = newIndentation + this.trimStart(movingLineText);
          } else {
            const virtualModel = this.createVirtualModel(
              model,
              (lineNumber) => lineNumber === s.startLineNumber ? movingLineNumber : lineNumber
            );
            const indentOfMovingLine = getGoodIndentForLine(
              this._autoIndent,
              virtualModel,
              model.getLanguageIdAtPosition(movingLineNumber, 1),
              s.startLineNumber,
              indentConverter,
              this._languageConfigurationService
            );
            if (indentOfMovingLine !== null) {
              const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
              const newSpaceCnt = indentUtils.getSpaceCnt(indentOfMovingLine, tabSize);
              const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
              if (newSpaceCnt !== oldSpaceCnt) {
                const newIndentation = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
                insertingText = newIndentation + this.trimStart(movingLineText);
              }
            }
          }
          builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + "\n");
          const ret = this.matchEnterRuleMovingDown(model, indentConverter, tabSize, s.startLineNumber, movingLineNumber, insertingText);
          if (ret !== null) {
            if (ret !== 0) {
              this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
            }
          } else {
            const virtualModel = this.createVirtualModel(
              model,
              (lineNumber) => {
                if (lineNumber === s.startLineNumber) {
                  return movingLineNumber;
                } else if (lineNumber >= s.startLineNumber + 1 && lineNumber <= s.endLineNumber + 1) {
                  return lineNumber - 1;
                } else {
                  return lineNumber;
                }
              },
              (lineNumber) => lineNumber === s.startLineNumber ? insertingText : void 0
            );
            const newIndentatOfMovingBlock = getGoodIndentForLine(
              this._autoIndent,
              virtualModel,
              model.getLanguageIdAtPosition(movingLineNumber, 1),
              s.startLineNumber + 1,
              indentConverter,
              this._languageConfigurationService
            );
            if (newIndentatOfMovingBlock !== null) {
              const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
              const newSpaceCnt = indentUtils.getSpaceCnt(newIndentatOfMovingBlock, tabSize);
              const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
              if (newSpaceCnt !== oldSpaceCnt) {
                const spaceCntOffset = newSpaceCnt - oldSpaceCnt;
                this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, spaceCntOffset);
              }
            }
          }
        } else {
          builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + "\n");
        }
      } else {
        movingLineNumber = s.startLineNumber - 1;
        movingLineText = model.getLineContent(movingLineNumber);
        builder.addEditOperation(new Range(movingLineNumber, 1, movingLineNumber + 1, 1), null);
        builder.addEditOperation(new Range(s.endLineNumber, model.getLineMaxColumn(s.endLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)), "\n" + movingLineText);
        if (this.shouldAutoIndent(model, s)) {
          const virtualModel = this.createVirtualModel(
            model,
            (lineNumber) => lineNumber === movingLineNumber ? s.startLineNumber : lineNumber
          );
          const ret = this.matchEnterRule(model, indentConverter, tabSize, s.startLineNumber, s.startLineNumber - 2);
          if (ret !== null) {
            if (ret !== 0) {
              this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
            }
          } else {
            const indentOfFirstLine = getGoodIndentForLine(
              this._autoIndent,
              virtualModel,
              model.getLanguageIdAtPosition(s.startLineNumber, 1),
              movingLineNumber,
              indentConverter,
              this._languageConfigurationService
            );
            if (indentOfFirstLine !== null) {
              const oldIndent = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
              const newSpaceCnt = indentUtils.getSpaceCnt(indentOfFirstLine, tabSize);
              const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndent, tabSize);
              if (newSpaceCnt !== oldSpaceCnt) {
                const spaceCntOffset = newSpaceCnt - oldSpaceCnt;
                this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, spaceCntOffset);
              }
            }
          }
        }
      }
    }
    this._selectionId = builder.trackSelection(s);
  }
  buildIndentConverter(tabSize, indentSize, insertSpaces) {
    return {
      shiftIndent: (indentation) => {
        return ShiftCommand.shiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
      },
      unshiftIndent: (indentation) => {
        return ShiftCommand.unshiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
      }
    };
  }
  parseEnterResult(model, indentConverter, tabSize, line, enter) {
    if (enter) {
      let enterPrefix = enter.indentation;
      if (enter.indentAction === IndentAction.None) {
        enterPrefix = enter.indentation + enter.appendText;
      } else if (enter.indentAction === IndentAction.Indent) {
        enterPrefix = enter.indentation + enter.appendText;
      } else if (enter.indentAction === IndentAction.IndentOutdent) {
        enterPrefix = enter.indentation;
      } else if (enter.indentAction === IndentAction.Outdent) {
        enterPrefix = indentConverter.unshiftIndent(enter.indentation) + enter.appendText;
      }
      const movingLineText = model.getLineContent(line);
      if (this.trimStart(movingLineText).indexOf(this.trimStart(enterPrefix)) >= 0) {
        const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(line));
        let newIndentation = strings.getLeadingWhitespace(enterPrefix);
        const indentMetadataOfMovelingLine = getIndentMetadata(model, line, this._languageConfigurationService);
        if (indentMetadataOfMovelingLine !== null && indentMetadataOfMovelingLine & IndentConsts.DECREASE_MASK) {
          newIndentation = indentConverter.unshiftIndent(newIndentation);
        }
        const newSpaceCnt = indentUtils.getSpaceCnt(newIndentation, tabSize);
        const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
        return newSpaceCnt - oldSpaceCnt;
      }
    }
    return null;
  }
  /**
   *
   * @param model
   * @param indentConverter
   * @param tabSize
   * @param line the line moving down
   * @param futureAboveLineNumber the line which will be at the `line` position
   * @param futureAboveLineText
   */
  matchEnterRuleMovingDown(model, indentConverter, tabSize, line, futureAboveLineNumber, futureAboveLineText) {
    if (strings.lastNonWhitespaceIndex(futureAboveLineText) >= 0) {
      const maxColumn = model.getLineMaxColumn(futureAboveLineNumber);
      const enter = getEnterAction(this._autoIndent, model, new Range(futureAboveLineNumber, maxColumn, futureAboveLineNumber, maxColumn), this._languageConfigurationService);
      return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
    } else {
      let validPrecedingLine = line - 1;
      while (validPrecedingLine >= 1) {
        const lineContent = model.getLineContent(validPrecedingLine);
        const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineContent);
        if (nonWhitespaceIdx >= 0) {
          break;
        }
        validPrecedingLine--;
      }
      if (validPrecedingLine < 1 || line > model.getLineCount()) {
        return null;
      }
      const maxColumn = model.getLineMaxColumn(validPrecedingLine);
      const enter = getEnterAction(this._autoIndent, model, new Range(validPrecedingLine, maxColumn, validPrecedingLine, maxColumn), this._languageConfigurationService);
      return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
    }
  }
  matchEnterRule(model, indentConverter, tabSize, line, oneLineAbove, previousLineText) {
    let validPrecedingLine = oneLineAbove;
    while (validPrecedingLine >= 1) {
      let lineContent;
      if (validPrecedingLine === oneLineAbove && previousLineText !== void 0) {
        lineContent = previousLineText;
      } else {
        lineContent = model.getLineContent(validPrecedingLine);
      }
      const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineContent);
      if (nonWhitespaceIdx >= 0) {
        break;
      }
      validPrecedingLine--;
    }
    if (validPrecedingLine < 1 || line > model.getLineCount()) {
      return null;
    }
    const maxColumn = model.getLineMaxColumn(validPrecedingLine);
    const enter = getEnterAction(this._autoIndent, model, new Range(validPrecedingLine, maxColumn, validPrecedingLine, maxColumn), this._languageConfigurationService);
    return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
  }
  trimStart(str) {
    return str.replace(/^\s+/, "");
  }
  shouldAutoIndent(model, selection) {
    if (this._autoIndent < EditorAutoIndentStrategy.Full) {
      return false;
    }
    if (!model.tokenization.isCheapToTokenize(selection.startLineNumber)) {
      return false;
    }
    const languageAtSelectionStart = model.getLanguageIdAtPosition(selection.startLineNumber, 1);
    const languageAtSelectionEnd = model.getLanguageIdAtPosition(selection.endLineNumber, 1);
    if (languageAtSelectionStart !== languageAtSelectionEnd) {
      return false;
    }
    if (this._languageConfigurationService.getLanguageConfiguration(languageAtSelectionStart).indentRulesSupport === null) {
      return false;
    }
    return true;
  }
  getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, offset) {
    for (let i = s.startLineNumber; i <= s.endLineNumber; i++) {
      const lineContent = model.getLineContent(i);
      const originalIndent = strings.getLeadingWhitespace(lineContent);
      const originalSpacesCnt = indentUtils.getSpaceCnt(originalIndent, tabSize);
      const newSpacesCnt = originalSpacesCnt + offset;
      const newIndent = indentUtils.generateIndent(newSpacesCnt, tabSize, insertSpaces);
      if (newIndent !== originalIndent) {
        builder.addEditOperation(new Range(i, 1, i, originalIndent.length + 1), newIndent);
        if (i === s.endLineNumber && s.endColumn <= originalIndent.length + 1 && newIndent === "") {
          this._moveEndLineSelectionShrink = true;
        }
      }
    }
  }
  computeCursorState(model, helper) {
    let result = helper.getTrackedSelection(this._selectionId);
    if (this._moveEndPositionDown) {
      result = result.setEndPosition(result.endLineNumber + 1, 1);
    }
    if (this._moveEndLineSelectionShrink && result.startLineNumber < result.endLineNumber) {
      result = result.setEndPosition(result.endLineNumber, 2);
    }
    return result;
  }
};
MoveLinesCommand = __decorateClass([
  __decorateParam(3, ILanguageConfigurationService)
], MoveLinesCommand);
export {
  MoveLinesCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmVzT3BlcmF0aW9uc1xcYnJvd3NlclxcbW92ZUxpbmVzQ29tbWFuZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBTaGlmdENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29tbWFuZHMvc2hpZnRDb21tYW5kLmpzJztcbmltcG9ydCB7IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZCwgSUN1cnNvclN0YXRlQ29tcHV0ZXJEYXRhLCBJRWRpdE9wZXJhdGlvbkJ1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29tcGxldGVFbnRlckFjdGlvbiwgSW5kZW50QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEluZGVudENvbnN0cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvaW5kZW50UnVsZXMuanMnO1xuaW1wb3J0ICogYXMgaW5kZW50VXRpbHMgZnJvbSAnLi4vLi4vaW5kZW50YXRpb24vY29tbW9uL2luZGVudFV0aWxzLmpzJztcbmltcG9ydCB7IGdldEdvb2RJbmRlbnRGb3JMaW5lLCBnZXRJbmRlbnRNZXRhZGF0YSwgSUluZGVudENvbnZlcnRlciwgSVZpcnR1YWxNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvYXV0b0luZGVudC5qcyc7XG5pbXBvcnQgeyBnZXRFbnRlckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvZW50ZXJBY3Rpb24uanMnO1xuXG5leHBvcnQgY2xhc3MgTW92ZUxpbmVzQ29tbWFuZCBpbXBsZW1lbnRzIElDb21tYW5kIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3Rpb246IFNlbGVjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNNb3ZpbmdEb3duOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3k7XG5cblx0cHJpdmF0ZSBfc2VsZWN0aW9uSWQ6IHN0cmluZyB8IG51bGw7XG5cdHByaXZhdGUgX21vdmVFbmRQb3NpdGlvbkRvd24/OiBib29sZWFuO1xuXHRwcml2YXRlIF9tb3ZlRW5kTGluZVNlbGVjdGlvblNocmluazogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRzZWxlY3Rpb246IFNlbGVjdGlvbixcblx0XHRpc01vdmluZ0Rvd246IGJvb2xlYW4sXG5cdFx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9zZWxlY3Rpb24gPSBzZWxlY3Rpb247XG5cdFx0dGhpcy5faXNNb3ZpbmdEb3duID0gaXNNb3ZpbmdEb3duO1xuXHRcdHRoaXMuX2F1dG9JbmRlbnQgPSBhdXRvSW5kZW50O1xuXHRcdHRoaXMuX3NlbGVjdGlvbklkID0gbnVsbDtcblx0XHR0aGlzLl9tb3ZlRW5kTGluZVNlbGVjdGlvblNocmluayA9IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVWaXJ0dWFsTW9kZWwoXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0bGluZU51bWJlck1hcHBlcjogKGxpbmVOdW1iZXI6IG51bWJlcikgPT4gbnVtYmVyLFxuXHRcdGNvbnRlbnRPdmVycmlkZT86IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHN0cmluZyB8IHVuZGVmaW5lZFxuXHQpOiBJVmlydHVhbE1vZGVsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9rZW5pemF0aW9uOiB7XG5cdFx0XHRcdGdldExpbmVUb2tlbnM6IChsaW5lTnVtYmVyKSA9PiBtb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhsaW5lTnVtYmVyTWFwcGVyKGxpbmVOdW1iZXIpKSxcblx0XHRcdFx0Z2V0TGFuZ3VhZ2VJZDogKCkgPT4gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLFxuXHRcdFx0XHRnZXRMYW5ndWFnZUlkQXRQb3NpdGlvbjogKGxpbmVOdW1iZXIsIGNvbHVtbikgPT4gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKVxuXHRcdFx0fSxcblx0XHRcdGdldExpbmVDb250ZW50OiAobGluZU51bWJlcikgPT4ge1xuXHRcdFx0XHRjb25zdCBjdXN0b21Db250ZW50ID0gY29udGVudE92ZXJyaWRlPy4obGluZU51bWJlcik7XG5cdFx0XHRcdGlmIChjdXN0b21Db250ZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gY3VzdG9tQ29udGVudDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlck1hcHBlcihsaW5lTnVtYmVyKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFZGl0T3BlcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyKTogdm9pZCB7XG5cblx0XHRjb25zdCBtb2RlbExpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXG5cdFx0aWYgKHRoaXMuX2lzTW92aW5nRG93biAmJiB0aGlzLl9zZWxlY3Rpb24uZW5kTGluZU51bWJlciA9PT0gbW9kZWxMaW5lQ291bnQpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbklkID0gYnVpbGRlci50cmFja1NlbGVjdGlvbih0aGlzLl9zZWxlY3Rpb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2lzTW92aW5nRG93biAmJiB0aGlzLl9zZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyID09PSAxKSB7XG5cdFx0XHR0aGlzLl9zZWxlY3Rpb25JZCA9IGJ1aWxkZXIudHJhY2tTZWxlY3Rpb24odGhpcy5fc2VsZWN0aW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9tb3ZlRW5kUG9zaXRpb25Eb3duID0gZmFsc2U7XG5cdFx0bGV0IHMgPSB0aGlzLl9zZWxlY3Rpb247XG5cblx0XHRpZiAocy5zdGFydExpbmVOdW1iZXIgPCBzLmVuZExpbmVOdW1iZXIgJiYgcy5lbmRDb2x1bW4gPT09IDEpIHtcblx0XHRcdHRoaXMuX21vdmVFbmRQb3NpdGlvbkRvd24gPSB0cnVlO1xuXHRcdFx0cyA9IHMuc2V0RW5kUG9zaXRpb24ocy5lbmRMaW5lTnVtYmVyIC0gMSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihzLmVuZExpbmVOdW1iZXIgLSAxKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMgfSA9IG1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRjb25zdCBpbmRlbnRDb252ZXJ0ZXIgPSB0aGlzLmJ1aWxkSW5kZW50Q29udmVydGVyKHRhYlNpemUsIGluZGVudFNpemUsIGluc2VydFNwYWNlcyk7XG5cblx0XHRpZiAocy5zdGFydExpbmVOdW1iZXIgPT09IHMuZW5kTGluZU51bWJlciAmJiBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHMuc3RhcnRMaW5lTnVtYmVyKSA9PT0gMSkge1xuXHRcdFx0Ly8gQ3VycmVudCBsaW5lIGlzIGVtcHR5XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gcy5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBvdGhlckxpbmVOdW1iZXIgPSAodGhpcy5faXNNb3ZpbmdEb3duID8gbGluZU51bWJlciArIDEgOiBsaW5lTnVtYmVyIC0gMSk7XG5cblx0XHRcdGlmIChtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKG90aGVyTGluZU51bWJlcikgPT09IDEpIHtcblx0XHRcdFx0Ly8gT3RoZXIgbGluZSBudW1iZXIgaXMgZW1wdHkgdG9vLCBzbyBubyBlZGl0aW5nIGlzIG5lZWRlZFxuXHRcdFx0XHQvLyBBZGQgYSBuby1vcCB0byBmb3JjZSBydW5uaW5nIGJ5IHRoZSBtb2RlbFxuXHRcdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24obmV3IFJhbmdlKDEsIDEsIDEsIDEpLCBudWxsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFR5cGUgY29udGVudCBmcm9tIG90aGVyIGxpbmUgbnVtYmVyIG9uIGxpbmUgbnVtYmVyXG5cdFx0XHRcdGJ1aWxkZXIuYWRkRWRpdE9wZXJhdGlvbihuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgMSksIG1vZGVsLmdldExpbmVDb250ZW50KG90aGVyTGluZU51bWJlcikpO1xuXG5cdFx0XHRcdC8vIFJlbW92ZSBjb250ZW50IGZyb20gb3RoZXIgbGluZSBudW1iZXJcblx0XHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG5ldyBSYW5nZShvdGhlckxpbmVOdW1iZXIsIDEsIG90aGVyTGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihvdGhlckxpbmVOdW1iZXIpKSwgbnVsbCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBUcmFjayBzZWxlY3Rpb24gYXQgdGhlIG90aGVyIGxpbmUgbnVtYmVyXG5cdFx0XHRzID0gbmV3IFNlbGVjdGlvbihvdGhlckxpbmVOdW1iZXIsIDEsIG90aGVyTGluZU51bWJlciwgMSk7XG5cblx0XHR9IGVsc2Uge1xuXG5cdFx0XHRsZXQgbW92aW5nTGluZU51bWJlcjogbnVtYmVyO1xuXHRcdFx0bGV0IG1vdmluZ0xpbmVUZXh0OiBzdHJpbmc7XG5cblx0XHRcdGlmICh0aGlzLl9pc01vdmluZ0Rvd24pIHtcblx0XHRcdFx0bW92aW5nTGluZU51bWJlciA9IHMuZW5kTGluZU51bWJlciArIDE7XG5cdFx0XHRcdG1vdmluZ0xpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobW92aW5nTGluZU51bWJlcik7XG5cdFx0XHRcdC8vIERlbGV0ZSBsaW5lIHRoYXQgbmVlZHMgdG8gYmUgbW92ZWRcblx0XHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG5ldyBSYW5nZShtb3ZpbmdMaW5lTnVtYmVyIC0gMSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihtb3ZpbmdMaW5lTnVtYmVyIC0gMSksIG1vdmluZ0xpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obW92aW5nTGluZU51bWJlcikpLCBudWxsKTtcblxuXHRcdFx0XHRsZXQgaW5zZXJ0aW5nVGV4dCA9IG1vdmluZ0xpbmVUZXh0O1xuXG5cdFx0XHRcdGlmICh0aGlzLnNob3VsZEF1dG9JbmRlbnQobW9kZWwsIHMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW92aW5nTGluZU1hdGNoUmVzdWx0ID0gdGhpcy5tYXRjaEVudGVyUnVsZShtb2RlbCwgaW5kZW50Q29udmVydGVyLCB0YWJTaXplLCBtb3ZpbmdMaW5lTnVtYmVyLCBzLnN0YXJ0TGluZU51bWJlciAtIDEpO1xuXHRcdFx0XHRcdC8vIGlmIHMuc3RhcnRMaW5lTnVtYmVyIC0gMSBtYXRjaGVzIG9uRW50ZXIgcnVsZSwgd2Ugc3RpbGwgaG9ub3IgdGhhdC5cblx0XHRcdFx0XHRpZiAobW92aW5nTGluZU1hdGNoUmVzdWx0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvbGRJbmRlbnRhdGlvbiA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQobW92aW5nTGluZU51bWJlcikpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbmV3U3BhY2VDbnQgPSBtb3ZpbmdMaW5lTWF0Y2hSZXN1bHQgKyBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChvbGRJbmRlbnRhdGlvbiwgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdJbmRlbnRhdGlvbiA9IGluZGVudFV0aWxzLmdlbmVyYXRlSW5kZW50KG5ld1NwYWNlQ250LCB0YWJTaXplLCBpbnNlcnRTcGFjZXMpO1xuXHRcdFx0XHRcdFx0aW5zZXJ0aW5nVGV4dCA9IG5ld0luZGVudGF0aW9uICsgdGhpcy50cmltU3RhcnQobW92aW5nTGluZVRleHQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBubyBlbnRlciBydWxlIG1hdGNoZXMsIGxldCdzIGNoZWNrIGluZGVudGF0aW4gcnVsZXMgdGhlbi5cblx0XHRcdFx0XHRcdGNvbnN0IHZpcnR1YWxNb2RlbCA9IHRoaXMuY3JlYXRlVmlydHVhbE1vZGVsKFxuXHRcdFx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRcdFx0KGxpbmVOdW1iZXIpID0+IGxpbmVOdW1iZXIgPT09IHMuc3RhcnRMaW5lTnVtYmVyID8gbW92aW5nTGluZU51bWJlciA6IGxpbmVOdW1iZXJcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRjb25zdCBpbmRlbnRPZk1vdmluZ0xpbmUgPSBnZXRHb29kSW5kZW50Rm9yTGluZShcblx0XHRcdFx0XHRcdFx0dGhpcy5fYXV0b0luZGVudCxcblx0XHRcdFx0XHRcdFx0dmlydHVhbE1vZGVsLFxuXHRcdFx0XHRcdFx0XHRtb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihtb3ZpbmdMaW5lTnVtYmVyLCAxKSxcblx0XHRcdFx0XHRcdFx0cy5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRcdGluZGVudENvbnZlcnRlcixcblx0XHRcdFx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdGlmIChpbmRlbnRPZk1vdmluZ0xpbmUgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2xkSW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KG1vdmluZ0xpbmVOdW1iZXIpKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3U3BhY2VDbnQgPSBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChpbmRlbnRPZk1vdmluZ0xpbmUsIHRhYlNpemUpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvbGRTcGFjZUNudCA9IGluZGVudFV0aWxzLmdldFNwYWNlQ250KG9sZEluZGVudGF0aW9uLCB0YWJTaXplKTtcblx0XHRcdFx0XHRcdFx0aWYgKG5ld1NwYWNlQ250ICE9PSBvbGRTcGFjZUNudCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG5ld0luZGVudGF0aW9uID0gaW5kZW50VXRpbHMuZ2VuZXJhdGVJbmRlbnQobmV3U3BhY2VDbnQsIHRhYlNpemUsIGluc2VydFNwYWNlcyk7XG5cdFx0XHRcdFx0XHRcdFx0aW5zZXJ0aW5nVGV4dCA9IG5ld0luZGVudGF0aW9uICsgdGhpcy50cmltU3RhcnQobW92aW5nTGluZVRleHQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gYWRkIGVkaXQgb3BlcmF0aW9ucyBmb3IgbW92aW5nIGxpbmUgZmlyc3QgdG8gbWFrZSBzdXJlIGl0J3MgZXhlY3V0ZWQgYWZ0ZXIgd2UgbWFrZSBpbmRlbnRhdGlvbiBjaGFuZ2Vcblx0XHRcdFx0XHQvLyB0byBzLnN0YXJ0TGluZU51bWJlclxuXHRcdFx0XHRcdGJ1aWxkZXIuYWRkRWRpdE9wZXJhdGlvbihuZXcgUmFuZ2Uocy5zdGFydExpbmVOdW1iZXIsIDEsIHMuc3RhcnRMaW5lTnVtYmVyLCAxKSwgaW5zZXJ0aW5nVGV4dCArICdcXG4nKTtcblxuXHRcdFx0XHRcdGNvbnN0IHJldCA9IHRoaXMubWF0Y2hFbnRlclJ1bGVNb3ZpbmdEb3duKG1vZGVsLCBpbmRlbnRDb252ZXJ0ZXIsIHRhYlNpemUsIHMuc3RhcnRMaW5lTnVtYmVyLCBtb3ZpbmdMaW5lTnVtYmVyLCBpbnNlcnRpbmdUZXh0KTtcblxuXHRcdFx0XHRcdC8vIGNoZWNrIGlmIHRoZSBsaW5lIGJlaW5nIG1vdmVkIGJlZm9yZSBtYXRjaGVzIG9uRW50ZXIgcnVsZXMsIGlmIHNvIGxldCdzIGFkanVzdCB0aGUgaW5kZW50YXRpb24gYnkgb25FbnRlciBydWxlcy5cblx0XHRcdFx0XHRpZiAocmV0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRpZiAocmV0ICE9PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZ2V0SW5kZW50RWRpdHNPZk1vdmluZ0Jsb2NrKG1vZGVsLCBidWlsZGVyLCBzLCB0YWJTaXplLCBpbnNlcnRTcGFjZXMsIHJldCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIGl0IGRvZXNuJ3QgbWF0Y2ggb25FbnRlciBydWxlcywgbGV0J3MgY2hlY2sgaW5kZW50YXRpb24gcnVsZXMgdGhlbi5cblx0XHRcdFx0XHRcdGNvbnN0IHZpcnR1YWxNb2RlbCA9IHRoaXMuY3JlYXRlVmlydHVhbE1vZGVsKFxuXHRcdFx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRcdFx0KGxpbmVOdW1iZXIpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAobGluZU51bWJlciA9PT0gcy5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdC8vIFRPRE9AYWlkYXktbWFyOiB0aGUgdG9rZW5zIGhlcmUgZG9uJ3QgY29ycmVzcG9uZCBleGFjdGx5IHRvIHRoZSBjb3JyZXNwb25kaW5nIGNvbnRlbnQgKGFmdGVyIGluZGVudGF0aW9uIGFkanVzdG1lbnQpLCBoYXZlIHRvIGZpeCB0aGlzLlxuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIG1vdmluZ0xpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChsaW5lTnVtYmVyID49IHMuc3RhcnRMaW5lTnVtYmVyICsgMSAmJiBsaW5lTnVtYmVyIDw9IHMuZW5kTGluZU51bWJlciArIDEpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBsaW5lTnVtYmVyIC0gMTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQobGluZU51bWJlcikgPT4gbGluZU51bWJlciA9PT0gcy5zdGFydExpbmVOdW1iZXIgPyBpbnNlcnRpbmdUZXh0IDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBuZXdJbmRlbnRhdE9mTW92aW5nQmxvY2sgPSBnZXRHb29kSW5kZW50Rm9yTGluZShcblx0XHRcdFx0XHRcdFx0dGhpcy5fYXV0b0luZGVudCxcblx0XHRcdFx0XHRcdFx0dmlydHVhbE1vZGVsLFxuXHRcdFx0XHRcdFx0XHRtb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihtb3ZpbmdMaW5lTnVtYmVyLCAxKSxcblx0XHRcdFx0XHRcdFx0cy5zdGFydExpbmVOdW1iZXIgKyAxLFxuXHRcdFx0XHRcdFx0XHRpbmRlbnRDb252ZXJ0ZXIsXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRcdGlmIChuZXdJbmRlbnRhdE9mTW92aW5nQmxvY2sgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2xkSW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KHMuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5ld1NwYWNlQ250ID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQobmV3SW5kZW50YXRPZk1vdmluZ0Jsb2NrLCB0YWJTaXplKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2xkU3BhY2VDbnQgPSBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChvbGRJbmRlbnRhdGlvbiwgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChuZXdTcGFjZUNudCAhPT0gb2xkU3BhY2VDbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBzcGFjZUNudE9mZnNldCA9IG5ld1NwYWNlQ250IC0gb2xkU3BhY2VDbnQ7XG5cblx0XHRcdFx0XHRcdFx0XHR0aGlzLmdldEluZGVudEVkaXRzT2ZNb3ZpbmdCbG9jayhtb2RlbCwgYnVpbGRlciwgcywgdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzLCBzcGFjZUNudE9mZnNldCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gSW5zZXJ0IGxpbmUgdGhhdCBuZWVkcyB0byBiZSBtb3ZlZCBiZWZvcmVcblx0XHRcdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24obmV3IFJhbmdlKHMuc3RhcnRMaW5lTnVtYmVyLCAxLCBzLnN0YXJ0TGluZU51bWJlciwgMSksIGluc2VydGluZ1RleHQgKyAnXFxuJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1vdmluZ0xpbmVOdW1iZXIgPSBzLnN0YXJ0TGluZU51bWJlciAtIDE7XG5cdFx0XHRcdG1vdmluZ0xpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobW92aW5nTGluZU51bWJlcik7XG5cblx0XHRcdFx0Ly8gRGVsZXRlIGxpbmUgdGhhdCBuZWVkcyB0byBiZSBtb3ZlZFxuXHRcdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24obmV3IFJhbmdlKG1vdmluZ0xpbmVOdW1iZXIsIDEsIG1vdmluZ0xpbmVOdW1iZXIgKyAxLCAxKSwgbnVsbCk7XG5cblx0XHRcdFx0Ly8gSW5zZXJ0IGxpbmUgdGhhdCBuZWVkcyB0byBiZSBtb3ZlZCBhZnRlclxuXHRcdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24obmV3IFJhbmdlKHMuZW5kTGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihzLmVuZExpbmVOdW1iZXIpLCBzLmVuZExpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocy5lbmRMaW5lTnVtYmVyKSksICdcXG4nICsgbW92aW5nTGluZVRleHQpO1xuXG5cdFx0XHRcdGlmICh0aGlzLnNob3VsZEF1dG9JbmRlbnQobW9kZWwsIHMpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdmlydHVhbE1vZGVsID0gdGhpcy5jcmVhdGVWaXJ0dWFsTW9kZWwoXG5cdFx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRcdChsaW5lTnVtYmVyKSA9PiBsaW5lTnVtYmVyID09PSBtb3ZpbmdMaW5lTnVtYmVyID8gcy5zdGFydExpbmVOdW1iZXIgOiBsaW5lTnVtYmVyXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGNvbnN0IHJldCA9IHRoaXMubWF0Y2hFbnRlclJ1bGUobW9kZWwsIGluZGVudENvbnZlcnRlciwgdGFiU2l6ZSwgcy5zdGFydExpbmVOdW1iZXIsIHMuc3RhcnRMaW5lTnVtYmVyIC0gMik7XG5cdFx0XHRcdFx0Ly8gY2hlY2sgaWYgcy5zdGFydExpbmVOdW1iZXIgLSAyIG1hdGNoZXMgb25FbnRlciBydWxlcywgaWYgc28gYWRqdXN0IHRoZSBtb3ZpbmcgYmxvY2sgYnkgb25FbnRlciBydWxlcy5cblx0XHRcdFx0XHRpZiAocmV0ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRpZiAocmV0ICE9PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZ2V0SW5kZW50RWRpdHNPZk1vdmluZ0Jsb2NrKG1vZGVsLCBidWlsZGVyLCBzLCB0YWJTaXplLCBpbnNlcnRTcGFjZXMsIHJldCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIGl0IGRvZXNuJ3QgbWF0Y2ggYW55IG9uRW50ZXIgcnVsZSwgbGV0J3MgY2hlY2sgaW5kZW50YXRpb24gcnVsZXMgdGhlbi5cblx0XHRcdFx0XHRcdGNvbnN0IGluZGVudE9mRmlyc3RMaW5lID0gZ2V0R29vZEluZGVudEZvckxpbmUoXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2F1dG9JbmRlbnQsXG5cdFx0XHRcdFx0XHRcdHZpcnR1YWxNb2RlbCxcblx0XHRcdFx0XHRcdFx0bW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24ocy5zdGFydExpbmVOdW1iZXIsIDEpLFxuXHRcdFx0XHRcdFx0XHRtb3ZpbmdMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRpbmRlbnRDb252ZXJ0ZXIsXG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRpZiAoaW5kZW50T2ZGaXJzdExpbmUgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdFx0Ly8gYWRqdXN0IHRoZSBpbmRlbnRhdGlvbiBvZiB0aGUgbW92aW5nIGJsb2NrXG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9sZEluZGVudCA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQocy5zdGFydExpbmVOdW1iZXIpKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3U3BhY2VDbnQgPSBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChpbmRlbnRPZkZpcnN0TGluZSwgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9sZFNwYWNlQ250ID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQob2xkSW5kZW50LCB0YWJTaXplKTtcblx0XHRcdFx0XHRcdFx0aWYgKG5ld1NwYWNlQ250ICE9PSBvbGRTcGFjZUNudCkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHNwYWNlQ250T2Zmc2V0ID0gbmV3U3BhY2VDbnQgLSBvbGRTcGFjZUNudDtcblxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZ2V0SW5kZW50RWRpdHNPZk1vdmluZ0Jsb2NrKG1vZGVsLCBidWlsZGVyLCBzLCB0YWJTaXplLCBpbnNlcnRTcGFjZXMsIHNwYWNlQ250T2Zmc2V0KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3NlbGVjdGlvbklkID0gYnVpbGRlci50cmFja1NlbGVjdGlvbihzKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRJbmRlbnRDb252ZXJ0ZXIodGFiU2l6ZTogbnVtYmVyLCBpbmRlbnRTaXplOiBudW1iZXIsIGluc2VydFNwYWNlczogYm9vbGVhbik6IElJbmRlbnRDb252ZXJ0ZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzaGlmdEluZGVudDogKGluZGVudGF0aW9uKSA9PiB7XG5cdFx0XHRcdHJldHVybiBTaGlmdENvbW1hbmQuc2hpZnRJbmRlbnQoaW5kZW50YXRpb24sIGluZGVudGF0aW9uLmxlbmd0aCArIDEsIHRhYlNpemUsIGluZGVudFNpemUsIGluc2VydFNwYWNlcyk7XG5cdFx0XHR9LFxuXHRcdFx0dW5zaGlmdEluZGVudDogKGluZGVudGF0aW9uKSA9PiB7XG5cdFx0XHRcdHJldHVybiBTaGlmdENvbW1hbmQudW5zaGlmdEluZGVudChpbmRlbnRhdGlvbiwgaW5kZW50YXRpb24ubGVuZ3RoICsgMSwgdGFiU2l6ZSwgaW5kZW50U2l6ZSwgaW5zZXJ0U3BhY2VzKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBwYXJzZUVudGVyUmVzdWx0KG1vZGVsOiBJVGV4dE1vZGVsLCBpbmRlbnRDb252ZXJ0ZXI6IElJbmRlbnRDb252ZXJ0ZXIsIHRhYlNpemU6IG51bWJlciwgbGluZTogbnVtYmVyLCBlbnRlcjogQ29tcGxldGVFbnRlckFjdGlvbiB8IG51bGwpIHtcblx0XHRpZiAoZW50ZXIpIHtcblx0XHRcdGxldCBlbnRlclByZWZpeCA9IGVudGVyLmluZGVudGF0aW9uO1xuXG5cdFx0XHRpZiAoZW50ZXIuaW5kZW50QWN0aW9uID09PSBJbmRlbnRBY3Rpb24uTm9uZSkge1xuXHRcdFx0XHRlbnRlclByZWZpeCA9IGVudGVyLmluZGVudGF0aW9uICsgZW50ZXIuYXBwZW5kVGV4dDtcblx0XHRcdH0gZWxzZSBpZiAoZW50ZXIuaW5kZW50QWN0aW9uID09PSBJbmRlbnRBY3Rpb24uSW5kZW50KSB7XG5cdFx0XHRcdGVudGVyUHJlZml4ID0gZW50ZXIuaW5kZW50YXRpb24gKyBlbnRlci5hcHBlbmRUZXh0O1xuXHRcdFx0fSBlbHNlIGlmIChlbnRlci5pbmRlbnRBY3Rpb24gPT09IEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KSB7XG5cdFx0XHRcdGVudGVyUHJlZml4ID0gZW50ZXIuaW5kZW50YXRpb247XG5cdFx0XHR9IGVsc2UgaWYgKGVudGVyLmluZGVudEFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLk91dGRlbnQpIHtcblx0XHRcdFx0ZW50ZXJQcmVmaXggPSBpbmRlbnRDb252ZXJ0ZXIudW5zaGlmdEluZGVudChlbnRlci5pbmRlbnRhdGlvbikgKyBlbnRlci5hcHBlbmRUZXh0O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW92aW5nTGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lKTtcblx0XHRcdGlmICh0aGlzLnRyaW1TdGFydChtb3ZpbmdMaW5lVGV4dCkuaW5kZXhPZih0aGlzLnRyaW1TdGFydChlbnRlclByZWZpeCkpID49IDApIHtcblx0XHRcdFx0Y29uc3Qgb2xkSW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KGxpbmUpKTtcblx0XHRcdFx0bGV0IG5ld0luZGVudGF0aW9uID0gc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShlbnRlclByZWZpeCk7XG5cdFx0XHRcdGNvbnN0IGluZGVudE1ldGFkYXRhT2ZNb3ZlbGluZ0xpbmUgPSBnZXRJbmRlbnRNZXRhZGF0YShtb2RlbCwgbGluZSwgdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGlmIChpbmRlbnRNZXRhZGF0YU9mTW92ZWxpbmdMaW5lICE9PSBudWxsICYmIGluZGVudE1ldGFkYXRhT2ZNb3ZlbGluZ0xpbmUgJiBJbmRlbnRDb25zdHMuREVDUkVBU0VfTUFTSykge1xuXHRcdFx0XHRcdG5ld0luZGVudGF0aW9uID0gaW5kZW50Q29udmVydGVyLnVuc2hpZnRJbmRlbnQobmV3SW5kZW50YXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG5ld1NwYWNlQ250ID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQobmV3SW5kZW50YXRpb24sIHRhYlNpemUpO1xuXHRcdFx0XHRjb25zdCBvbGRTcGFjZUNudCA9IGluZGVudFV0aWxzLmdldFNwYWNlQ250KG9sZEluZGVudGF0aW9uLCB0YWJTaXplKTtcblx0XHRcdFx0cmV0dXJuIG5ld1NwYWNlQ250IC0gb2xkU3BhY2VDbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvKipcblx0ICpcblx0ICogQHBhcmFtIG1vZGVsXG5cdCAqIEBwYXJhbSBpbmRlbnRDb252ZXJ0ZXJcblx0ICogQHBhcmFtIHRhYlNpemVcblx0ICogQHBhcmFtIGxpbmUgdGhlIGxpbmUgbW92aW5nIGRvd25cblx0ICogQHBhcmFtIGZ1dHVyZUFib3ZlTGluZU51bWJlciB0aGUgbGluZSB3aGljaCB3aWxsIGJlIGF0IHRoZSBgbGluZWAgcG9zaXRpb25cblx0ICogQHBhcmFtIGZ1dHVyZUFib3ZlTGluZVRleHRcblx0ICovXG5cdHByaXZhdGUgbWF0Y2hFbnRlclJ1bGVNb3ZpbmdEb3duKG1vZGVsOiBJVGV4dE1vZGVsLCBpbmRlbnRDb252ZXJ0ZXI6IElJbmRlbnRDb252ZXJ0ZXIsIHRhYlNpemU6IG51bWJlciwgbGluZTogbnVtYmVyLCBmdXR1cmVBYm92ZUxpbmVOdW1iZXI6IG51bWJlciwgZnV0dXJlQWJvdmVMaW5lVGV4dDogc3RyaW5nKSB7XG5cdFx0aWYgKHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleChmdXR1cmVBYm92ZUxpbmVUZXh0KSA+PSAwKSB7XG5cdFx0XHQvLyBicmVha1xuXHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihmdXR1cmVBYm92ZUxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgZW50ZXIgPSBnZXRFbnRlckFjdGlvbih0aGlzLl9hdXRvSW5kZW50LCBtb2RlbCwgbmV3IFJhbmdlKGZ1dHVyZUFib3ZlTGluZU51bWJlciwgbWF4Q29sdW1uLCBmdXR1cmVBYm92ZUxpbmVOdW1iZXIsIG1heENvbHVtbiksIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIHRoaXMucGFyc2VFbnRlclJlc3VsdChtb2RlbCwgaW5kZW50Q29udmVydGVyLCB0YWJTaXplLCBsaW5lLCBlbnRlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGdvIHVwd2FyZHMsIHN0YXJ0aW5nIGZyb20gYGxpbmUgLSAxYFxuXHRcdFx0bGV0IHZhbGlkUHJlY2VkaW5nTGluZSA9IGxpbmUgLSAxO1xuXHRcdFx0d2hpbGUgKHZhbGlkUHJlY2VkaW5nTGluZSA+PSAxKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQodmFsaWRQcmVjZWRpbmdMaW5lKTtcblx0XHRcdFx0Y29uc3Qgbm9uV2hpdGVzcGFjZUlkeCA9IHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lQ29udGVudCk7XG5cblx0XHRcdFx0aWYgKG5vbldoaXRlc3BhY2VJZHggPj0gMCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmFsaWRQcmVjZWRpbmdMaW5lLS07XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2YWxpZFByZWNlZGluZ0xpbmUgPCAxIHx8IGxpbmUgPiBtb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbih2YWxpZFByZWNlZGluZ0xpbmUpO1xuXHRcdFx0Y29uc3QgZW50ZXIgPSBnZXRFbnRlckFjdGlvbih0aGlzLl9hdXRvSW5kZW50LCBtb2RlbCwgbmV3IFJhbmdlKHZhbGlkUHJlY2VkaW5nTGluZSwgbWF4Q29sdW1uLCB2YWxpZFByZWNlZGluZ0xpbmUsIG1heENvbHVtbiksIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0cmV0dXJuIHRoaXMucGFyc2VFbnRlclJlc3VsdChtb2RlbCwgaW5kZW50Q29udmVydGVyLCB0YWJTaXplLCBsaW5lLCBlbnRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBtYXRjaEVudGVyUnVsZShtb2RlbDogSVRleHRNb2RlbCwgaW5kZW50Q29udmVydGVyOiBJSW5kZW50Q29udmVydGVyLCB0YWJTaXplOiBudW1iZXIsIGxpbmU6IG51bWJlciwgb25lTGluZUFib3ZlOiBudW1iZXIsIHByZXZpb3VzTGluZVRleHQ/OiBzdHJpbmcpIHtcblx0XHRsZXQgdmFsaWRQcmVjZWRpbmdMaW5lID0gb25lTGluZUFib3ZlO1xuXHRcdHdoaWxlICh2YWxpZFByZWNlZGluZ0xpbmUgPj0gMSkge1xuXHRcdFx0Ly8gc2hpcCBlbXB0eSBsaW5lcyBhcyBlbXB0eSBsaW5lcyBqdXN0IGluaGVyaXQgaW5kZW50YXRpb25cblx0XHRcdGxldCBsaW5lQ29udGVudDtcblx0XHRcdGlmICh2YWxpZFByZWNlZGluZ0xpbmUgPT09IG9uZUxpbmVBYm92ZSAmJiBwcmV2aW91c0xpbmVUZXh0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0bGluZUNvbnRlbnQgPSBwcmV2aW91c0xpbmVUZXh0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudCh2YWxpZFByZWNlZGluZ0xpbmUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBub25XaGl0ZXNwYWNlSWR4ID0gc3RyaW5ncy5sYXN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVDb250ZW50KTtcblx0XHRcdGlmIChub25XaGl0ZXNwYWNlSWR4ID49IDApIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHR2YWxpZFByZWNlZGluZ0xpbmUtLTtcblx0XHR9XG5cblx0XHRpZiAodmFsaWRQcmVjZWRpbmdMaW5lIDwgMSB8fCBsaW5lID4gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1heENvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4odmFsaWRQcmVjZWRpbmdMaW5lKTtcblx0XHRjb25zdCBlbnRlciA9IGdldEVudGVyQWN0aW9uKHRoaXMuX2F1dG9JbmRlbnQsIG1vZGVsLCBuZXcgUmFuZ2UodmFsaWRQcmVjZWRpbmdMaW5lLCBtYXhDb2x1bW4sIHZhbGlkUHJlY2VkaW5nTGluZSwgbWF4Q29sdW1uKSwgdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0cmV0dXJuIHRoaXMucGFyc2VFbnRlclJlc3VsdChtb2RlbCwgaW5kZW50Q29udmVydGVyLCB0YWJTaXplLCBsaW5lLCBlbnRlcik7XG5cdH1cblxuXHRwcml2YXRlIHRyaW1TdGFydChzdHI6IHN0cmluZykge1xuXHRcdHJldHVybiBzdHIucmVwbGFjZSgvXlxccysvLCAnJyk7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZEF1dG9JbmRlbnQobW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uKSB7XG5cdFx0aWYgKHRoaXMuX2F1dG9JbmRlbnQgPCBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBpZiBpdCdzIG5vdCBlYXN5IHRvIHRva2VuaXplLCB3ZSBzdG9wIGF1dG8gaW5kZW50LlxuXHRcdGlmICghbW9kZWwudG9rZW5pemF0aW9uLmlzQ2hlYXBUb1Rva2VuaXplKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGxhbmd1YWdlQXRTZWxlY3Rpb25TdGFydCA9IG1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdGNvbnN0IGxhbmd1YWdlQXRTZWxlY3Rpb25FbmQgPSBtb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihzZWxlY3Rpb24uZW5kTGluZU51bWJlciwgMSk7XG5cblx0XHRpZiAobGFuZ3VhZ2VBdFNlbGVjdGlvblN0YXJ0ICE9PSBsYW5ndWFnZUF0U2VsZWN0aW9uRW5kKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlQXRTZWxlY3Rpb25TdGFydCkuaW5kZW50UnVsZXNTdXBwb3J0ID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGdldEluZGVudEVkaXRzT2ZNb3ZpbmdCbG9jayhtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyLCBzOiBTZWxlY3Rpb24sIHRhYlNpemU6IG51bWJlciwgaW5zZXJ0U3BhY2VzOiBib29sZWFuLCBvZmZzZXQ6IG51bWJlcikge1xuXHRcdGZvciAobGV0IGkgPSBzLnN0YXJ0TGluZU51bWJlcjsgaSA8PSBzLmVuZExpbmVOdW1iZXI7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChpKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsSW5kZW50ID0gc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShsaW5lQ29udGVudCk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbFNwYWNlc0NudCA9IGluZGVudFV0aWxzLmdldFNwYWNlQ250KG9yaWdpbmFsSW5kZW50LCB0YWJTaXplKTtcblx0XHRcdGNvbnN0IG5ld1NwYWNlc0NudCA9IG9yaWdpbmFsU3BhY2VzQ250ICsgb2Zmc2V0O1xuXHRcdFx0Y29uc3QgbmV3SW5kZW50ID0gaW5kZW50VXRpbHMuZ2VuZXJhdGVJbmRlbnQobmV3U3BhY2VzQ250LCB0YWJTaXplLCBpbnNlcnRTcGFjZXMpO1xuXG5cdFx0XHRpZiAobmV3SW5kZW50ICE9PSBvcmlnaW5hbEluZGVudCkge1xuXHRcdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24obmV3IFJhbmdlKGksIDEsIGksIG9yaWdpbmFsSW5kZW50Lmxlbmd0aCArIDEpLCBuZXdJbmRlbnQpO1xuXG5cdFx0XHRcdGlmIChpID09PSBzLmVuZExpbmVOdW1iZXIgJiYgcy5lbmRDb2x1bW4gPD0gb3JpZ2luYWxJbmRlbnQubGVuZ3RoICsgMSAmJiBuZXdJbmRlbnQgPT09ICcnKSB7XG5cdFx0XHRcdFx0Ly8gYXMgdXNlcnMgc2VsZWN0IHBhcnQgb2YgdGhlIG9yaWdpbmFsIGluZGVudCB3aGl0ZSBzcGFjZXNcblx0XHRcdFx0XHQvLyB3aGVuIHdlIGFkanVzdCB0aGUgaW5kZW50YXRpb24gb2YgZW5kTGluZSwgd2Ugc2hvdWxkIGFkanVzdCB0aGUgY3Vyc29yIHBvc2l0aW9uIGFzIHdlbGwuXG5cdFx0XHRcdFx0dGhpcy5fbW92ZUVuZExpbmVTZWxlY3Rpb25TaHJpbmsgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZUN1cnNvclN0YXRlKG1vZGVsOiBJVGV4dE1vZGVsLCBoZWxwZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSk6IFNlbGVjdGlvbiB7XG5cdFx0bGV0IHJlc3VsdCA9IGhlbHBlci5nZXRUcmFja2VkU2VsZWN0aW9uKHRoaXMuX3NlbGVjdGlvbklkISk7XG5cblx0XHRpZiAodGhpcy5fbW92ZUVuZFBvc2l0aW9uRG93bikge1xuXHRcdFx0cmVzdWx0ID0gcmVzdWx0LnNldEVuZFBvc2l0aW9uKHJlc3VsdC5lbmRMaW5lTnVtYmVyICsgMSwgMSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX21vdmVFbmRMaW5lU2VsZWN0aW9uU2hyaW5rICYmIHJlc3VsdC5zdGFydExpbmVOdW1iZXIgPCByZXN1bHQuZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmVzdWx0ID0gcmVzdWx0LnNldEVuZFBvc2l0aW9uKHJlc3VsdC5lbmRMaW5lTnVtYmVyLCAyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksYUFBYTtBQUN6QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFHMUIsU0FBOEIsb0JBQW9CO0FBQ2xELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsb0JBQW9CO0FBQzdCLFlBQVksaUJBQWlCO0FBQzdCLFNBQVMsc0JBQXNCLHlCQUEwRDtBQUN6RixTQUFTLHNCQUFzQjtBQUV4QixJQUFNLG1CQUFOLE1BQTJDO0FBQUEsRUFVakQsWUFDQyxXQUNBLGNBQ0EsWUFDZ0QsK0JBQy9DO0FBRCtDO0FBRWhELFNBQUssYUFBYTtBQUNsQixTQUFLLGdCQUFnQjtBQUNyQixTQUFLLGNBQWM7QUFDbkIsU0FBSyxlQUFlO0FBQ3BCLFNBQUssOEJBQThCO0FBQUEsRUFDcEM7QUFBQSxFQUVRLG1CQUNQLE9BQ0Esa0JBQ0EsaUJBQ2dCO0FBQ2hCLFdBQU87QUFBQSxNQUNOLGNBQWM7QUFBQSxRQUNiLGVBQWUsQ0FBQyxlQUFlLE1BQU0sYUFBYSxjQUFjLGlCQUFpQixVQUFVLENBQUM7QUFBQSxRQUM1RixlQUFlLE1BQU0sTUFBTSxjQUFjO0FBQUEsUUFDekMseUJBQXlCLENBQUMsWUFBWSxXQUFXLE1BQU0sd0JBQXdCLFlBQVksTUFBTTtBQUFBLE1BQ2xHO0FBQUEsTUFDQSxnQkFBZ0IsQ0FBQyxlQUFlO0FBQy9CLGNBQU0sZ0JBQWdCLGtCQUFrQixVQUFVO0FBQ2xELFlBQUksa0JBQWtCLFFBQVc7QUFDaEMsaUJBQU87QUFBQSxRQUNSO0FBQ0EsZUFBTyxNQUFNLGVBQWUsaUJBQWlCLFVBQVUsQ0FBQztBQUFBLE1BQ3pEO0FBQUEsSUFD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
