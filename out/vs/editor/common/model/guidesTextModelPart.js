import { findLast } from "../../../base/common/arraysFind.js";
import * as strings from "../../../base/common/strings.js";
import { CursorColumns } from "../core/cursorColumns.js";
import { Range } from "../core/range.js";
import { TextModelPart } from "./textModelPart.js";
import { computeIndentLevel } from "./utils.js";
import { HorizontalGuidesState, IndentGuide, IndentGuideHorizontalLine } from "../textModelGuides.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
class GuidesTextModelPart extends TextModelPart {
  constructor(textModel, languageConfigurationService) {
    super();
    this.textModel = textModel;
    this.languageConfigurationService = languageConfigurationService;
  }
  getLanguageConfiguration(languageId) {
    return this.languageConfigurationService.getLanguageConfiguration(
      languageId
    );
  }
  _computeIndentLevel(lineIndex) {
    return computeIndentLevel(
      this.textModel.getLineContent(lineIndex + 1),
      this.textModel.getOptions().tabSize
    );
  }
  getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber) {
    this.assertNotDisposed();
    const lineCount = this.textModel.getLineCount();
    if (lineNumber < 1 || lineNumber > lineCount) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    const foldingRules = this.getLanguageConfiguration(
      this.textModel.getLanguageId()
    ).foldingRules;
    const offSide = Boolean(foldingRules && foldingRules.offSide);
    let up_aboveContentLineIndex = -2;
    let up_aboveContentLineIndent = -1;
    let up_belowContentLineIndex = -2;
    let up_belowContentLineIndent = -1;
    const up_resolveIndents = (lineNumber2) => {
      if (up_aboveContentLineIndex !== -1 && (up_aboveContentLineIndex === -2 || up_aboveContentLineIndex > lineNumber2 - 1)) {
        up_aboveContentLineIndex = -1;
        up_aboveContentLineIndent = -1;
        for (let lineIndex = lineNumber2 - 2; lineIndex >= 0; lineIndex--) {
          const indent2 = this._computeIndentLevel(lineIndex);
          if (indent2 >= 0) {
            up_aboveContentLineIndex = lineIndex;
            up_aboveContentLineIndent = indent2;
            break;
          }
        }
      }
      if (up_belowContentLineIndex === -2) {
        up_belowContentLineIndex = -1;
        up_belowContentLineIndent = -1;
        for (let lineIndex = lineNumber2; lineIndex < lineCount; lineIndex++) {
          const indent2 = this._computeIndentLevel(lineIndex);
          if (indent2 >= 0) {
            up_belowContentLineIndex = lineIndex;
            up_belowContentLineIndent = indent2;
            break;
          }
        }
      }
    };
    let down_aboveContentLineIndex = -2;
    let down_aboveContentLineIndent = -1;
    let down_belowContentLineIndex = -2;
    let down_belowContentLineIndent = -1;
    const down_resolveIndents = (lineNumber2) => {
      if (down_aboveContentLineIndex === -2) {
        down_aboveContentLineIndex = -1;
        down_aboveContentLineIndent = -1;
        for (let lineIndex = lineNumber2 - 2; lineIndex >= 0; lineIndex--) {
          const indent2 = this._computeIndentLevel(lineIndex);
          if (indent2 >= 0) {
            down_aboveContentLineIndex = lineIndex;
            down_aboveContentLineIndent = indent2;
            break;
          }
        }
      }
      if (down_belowContentLineIndex !== -1 && (down_belowContentLineIndex === -2 || down_belowContentLineIndex < lineNumber2 - 1)) {
        down_belowContentLineIndex = -1;
        down_belowContentLineIndent = -1;
        for (let lineIndex = lineNumber2; lineIndex < lineCount; lineIndex++) {
          const indent2 = this._computeIndentLevel(lineIndex);
          if (indent2 >= 0) {
            down_belowContentLineIndex = lineIndex;
            down_belowContentLineIndent = indent2;
            break;
          }
        }
      }
    };
    let startLineNumber = 0;
    let goUp = true;
    let endLineNumber = 0;
    let goDown = true;
    let indent = 0;
    let initialIndent = 0;
    for (let distance = 0; goUp || goDown; distance++) {
      const upLineNumber = lineNumber - distance;
      const downLineNumber = lineNumber + distance;
      if (distance > 1 && (upLineNumber < 1 || upLineNumber < minLineNumber)) {
        goUp = false;
      }
      if (distance > 1 && (downLineNumber > lineCount || downLineNumber > maxLineNumber)) {
        goDown = false;
      }
      if (distance > 5e4) {
        goUp = false;
        goDown = false;
      }
      let upLineIndentLevel = -1;
      if (goUp && upLineNumber >= 1) {
        const currentIndent = this._computeIndentLevel(upLineNumber - 1);
        if (currentIndent >= 0) {
          up_belowContentLineIndex = upLineNumber - 1;
          up_belowContentLineIndent = currentIndent;
          upLineIndentLevel = Math.ceil(
            currentIndent / this.textModel.getOptions().indentSize
          );
        } else {
          up_resolveIndents(upLineNumber);
          upLineIndentLevel = this._getIndentLevelForWhitespaceLine(
            offSide,
            up_aboveContentLineIndent,
            up_belowContentLineIndent
          );
        }
      }
      let downLineIndentLevel = -1;
      if (goDown && downLineNumber <= lineCount) {
        const currentIndent = this._computeIndentLevel(downLineNumber - 1);
        if (currentIndent >= 0) {
          down_aboveContentLineIndex = downLineNumber - 1;
          down_aboveContentLineIndent = currentIndent;
          downLineIndentLevel = Math.ceil(
            currentIndent / this.textModel.getOptions().indentSize
          );
        } else {
          down_resolveIndents(downLineNumber);
          downLineIndentLevel = this._getIndentLevelForWhitespaceLine(
            offSide,
            down_aboveContentLineIndent,
            down_belowContentLineIndent
          );
        }
      }
      if (distance === 0) {
        initialIndent = upLineIndentLevel;
        continue;
      }
      if (distance === 1) {
        if (downLineNumber <= lineCount && downLineIndentLevel >= 0 && initialIndent + 1 === downLineIndentLevel) {
          goUp = false;
          startLineNumber = downLineNumber;
          endLineNumber = downLineNumber;
          indent = downLineIndentLevel;
          continue;
        }
        if (upLineNumber >= 1 && upLineIndentLevel >= 0 && upLineIndentLevel - 1 === initialIndent) {
          goDown = false;
          startLineNumber = upLineNumber;
          endLineNumber = upLineNumber;
          indent = upLineIndentLevel;
          continue;
        }
        startLineNumber = lineNumber;
        endLineNumber = lineNumber;
        indent = initialIndent;
        if (indent === 0) {
          return { startLineNumber, endLineNumber, indent };
        }
      }
      if (goUp) {
        if (upLineIndentLevel >= indent) {
          startLineNumber = upLineNumber;
        } else {
          goUp = false;
        }
      }
      if (goDown) {
        if (downLineIndentLevel >= indent) {
          endLineNumber = downLineNumber;
        } else {
          goDown = false;
        }
      }
    }
    return { startLineNumber, endLineNumber, indent };
  }
  getLinesBracketGuides(startLineNumber, endLineNumber, activePosition, options) {
    const result = [];
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      result.push([]);
    }
    const includeSingleLinePairs = true;
    const bracketPairs = this.textModel.bracketPairs.getBracketPairsInRangeWithMinIndentation(
      new Range(
        startLineNumber,
        1,
        endLineNumber,
        this.textModel.getLineMaxColumn(endLineNumber)
      )
    ).toArray();
    let activeBracketPairRange = void 0;
    if (activePosition && bracketPairs.length > 0) {
      const bracketsContainingActivePosition = (startLineNumber <= activePosition.lineNumber && activePosition.lineNumber <= endLineNumber ? bracketPairs : this.textModel.bracketPairs.getBracketPairsInRange(
        Range.fromPositions(activePosition)
      ).toArray()).filter((bp) => Range.strictContainsPosition(bp.range, activePosition));
      activeBracketPairRange = findLast(
        bracketsContainingActivePosition,
        (i) => includeSingleLinePairs || i.range.startLineNumber !== i.range.endLineNumber
      )?.range;
    }
    const independentColorPoolPerBracketType = this.textModel.getOptions().bracketPairColorizationOptions.independentColorPoolPerBracketType;
    const colorProvider = new BracketPairGuidesClassNames();
    for (const pair of bracketPairs) {
      if (!pair.closingBracketRange) {
        continue;
      }
      const isActive = activeBracketPairRange && pair.range.equalsRange(activeBracketPairRange);
      if (!isActive && !options.includeInactive) {
        continue;
      }
      const className = colorProvider.getInlineClassName(pair.nestingLevel, pair.nestingLevelOfEqualBracketType, independentColorPoolPerBracketType) + (options.highlightActive && isActive ? " " + colorProvider.activeClassName : "");
      const start = pair.openingBracketRange.getStartPosition();
      const end = pair.closingBracketRange.getStartPosition();
      const horizontalGuides = options.horizontalGuides === HorizontalGuidesState.Enabled || options.horizontalGuides === HorizontalGuidesState.EnabledForActive && isActive;
      if (pair.range.startLineNumber === pair.range.endLineNumber) {
        if (includeSingleLinePairs && horizontalGuides) {
          result[pair.range.startLineNumber - startLineNumber].push(
            new IndentGuide(
              -1,
              pair.openingBracketRange.getEndPosition().column,
              className,
              new IndentGuideHorizontalLine(false, end.column),
              -1,
              -1
            )
          );
        }
        continue;
      }
      const endVisibleColumn = this.getVisibleColumnFromPosition(end);
      const startVisibleColumn = this.getVisibleColumnFromPosition(
        pair.openingBracketRange.getStartPosition()
      );
      const guideVisibleColumn = Math.min(startVisibleColumn, endVisibleColumn, pair.minVisibleColumnIndentation + 1);
      let renderHorizontalEndLineAtTheBottom = false;
      const firstNonWsIndex = strings.firstNonWhitespaceIndex(
        this.textModel.getLineContent(
          pair.closingBracketRange.startLineNumber
        )
      );
      const hasTextBeforeClosingBracket = firstNonWsIndex < pair.closingBracketRange.startColumn - 1;
      if (hasTextBeforeClosingBracket) {
        renderHorizontalEndLineAtTheBottom = true;
      }
      const visibleGuideStartLineNumber = Math.max(start.lineNumber, startLineNumber);
      const visibleGuideEndLineNumber = Math.min(end.lineNumber, endLineNumber);
      const offset = renderHorizontalEndLineAtTheBottom ? 1 : 0;
      for (let l = visibleGuideStartLineNumber; l < visibleGuideEndLineNumber + offset; l++) {
        result[l - startLineNumber].push(
          new IndentGuide(
            guideVisibleColumn,
            -1,
            className,
            null,
            l === start.lineNumber ? start.column : -1,
            l === end.lineNumber ? end.column : -1
          )
        );
      }
      if (horizontalGuides) {
        if (start.lineNumber >= startLineNumber && startVisibleColumn > guideVisibleColumn) {
          result[start.lineNumber - startLineNumber].push(
            new IndentGuide(
              guideVisibleColumn,
              -1,
              className,
              new IndentGuideHorizontalLine(false, start.column),
              -1,
              -1
            )
          );
        }
        if (end.lineNumber <= endLineNumber && endVisibleColumn > guideVisibleColumn) {
          result[end.lineNumber - startLineNumber].push(
            new IndentGuide(
              guideVisibleColumn,
              -1,
              className,
              new IndentGuideHorizontalLine(!renderHorizontalEndLineAtTheBottom, end.column),
              -1,
              -1
            )
          );
        }
      }
    }
    for (const guides of result) {
      guides.sort((a, b) => a.visibleColumn - b.visibleColumn);
    }
    return result;
  }
  getVisibleColumnFromPosition(position) {
    return CursorColumns.visibleColumnFromColumn(
      this.textModel.getLineContent(position.lineNumber),
      position.column,
      this.textModel.getOptions().tabSize
    ) + 1;
  }
  getLinesIndentGuides(startLineNumber, endLineNumber) {
    this.assertNotDisposed();
    const lineCount = this.textModel.getLineCount();
    if (startLineNumber < 1 || startLineNumber > lineCount) {
      throw new Error("Illegal value for startLineNumber");
    }
    if (endLineNumber < 1 || endLineNumber > lineCount) {
      throw new Error("Illegal value for endLineNumber");
    }
    const options = this.textModel.getOptions();
    const foldingRules = this.getLanguageConfiguration(
      this.textModel.getLanguageId()
    ).foldingRules;
    const offSide = Boolean(foldingRules && foldingRules.offSide);
    const result = new Array(
      endLineNumber - startLineNumber + 1
    );
    let aboveContentLineIndex = -2;
    let aboveContentLineIndent = -1;
    let belowContentLineIndex = -2;
    let belowContentLineIndent = -1;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const resultIndex = lineNumber - startLineNumber;
      const currentIndent = this._computeIndentLevel(lineNumber - 1);
      if (currentIndent >= 0) {
        aboveContentLineIndex = lineNumber - 1;
        aboveContentLineIndent = currentIndent;
        result[resultIndex] = Math.ceil(currentIndent / options.indentSize);
        continue;
      }
      if (aboveContentLineIndex === -2) {
        aboveContentLineIndex = -1;
        aboveContentLineIndent = -1;
        for (let lineIndex = lineNumber - 2; lineIndex >= 0; lineIndex--) {
          const indent = this._computeIndentLevel(lineIndex);
          if (indent >= 0) {
            aboveContentLineIndex = lineIndex;
            aboveContentLineIndent = indent;
            break;
          }
        }
      }
      if (belowContentLineIndex !== -1 && (belowContentLineIndex === -2 || belowContentLineIndex < lineNumber - 1)) {
        belowContentLineIndex = -1;
        belowContentLineIndent = -1;
        for (let lineIndex = lineNumber; lineIndex < lineCount; lineIndex++) {
          const indent = this._computeIndentLevel(lineIndex);
          if (indent >= 0) {
            belowContentLineIndex = lineIndex;
            belowContentLineIndent = indent;
            break;
          }
        }
      }
      result[resultIndex] = this._getIndentLevelForWhitespaceLine(
        offSide,
        aboveContentLineIndent,
        belowContentLineIndent
      );
    }
    return result;
  }
  _getIndentLevelForWhitespaceLine(offSide, aboveContentLineIndent, belowContentLineIndent) {
    const options = this.textModel.getOptions();
    if (aboveContentLineIndent === -1 || belowContentLineIndent === -1) {
      return 0;
    } else if (aboveContentLineIndent < belowContentLineIndent) {
      return 1 + Math.floor(aboveContentLineIndent / options.indentSize);
    } else if (aboveContentLineIndent === belowContentLineIndent) {
      return Math.ceil(belowContentLineIndent / options.indentSize);
    } else {
      if (offSide) {
        return Math.ceil(belowContentLineIndent / options.indentSize);
      } else {
        return 1 + Math.floor(belowContentLineIndent / options.indentSize);
      }
    }
  }
}
class BracketPairGuidesClassNames {
  constructor() {
    this.activeClassName = "indent-active";
  }
  getInlineClassName(nestingLevel, nestingLevelOfEqualBracketType, independentColorPoolPerBracketType) {
    return this.getInlineClassNameOfLevel(independentColorPoolPerBracketType ? nestingLevelOfEqualBracketType : nestingLevel);
  }
  getInlineClassNameOfLevel(level) {
    return `bracket-indent-guide lvl-${level % 30}`;
  }
}
export {
  BracketPairGuidesClassNames,
  GuidesTextModelPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbW9kZWxcXGd1aWRlc1RleHRNb2RlbFBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBmaW5kTGFzdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IEN1cnNvckNvbHVtbnMgfSBmcm9tICcuLi9jb3JlL2N1cnNvckNvbHVtbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB0eXBlIHsgVGV4dE1vZGVsIH0gZnJvbSAnLi90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsUGFydCB9IGZyb20gJy4vdGV4dE1vZGVsUGFydC5qcyc7XG5pbXBvcnQgeyBjb21wdXRlSW5kZW50TGV2ZWwgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBCcmFja2V0R3VpZGVPcHRpb25zLCBIb3Jpem9udGFsR3VpZGVzU3RhdGUsIElBY3RpdmVJbmRlbnRHdWlkZUluZm8sIElHdWlkZXNUZXh0TW9kZWxQYXJ0LCBJbmRlbnRHdWlkZSwgSW5kZW50R3VpZGVIb3Jpem9udGFsTGluZSB9IGZyb20gJy4uL3RleHRNb2RlbEd1aWRlcy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuXG5leHBvcnQgY2xhc3MgR3VpZGVzVGV4dE1vZGVsUGFydCBleHRlbmRzIFRleHRNb2RlbFBhcnQgaW1wbGVtZW50cyBJR3VpZGVzVGV4dE1vZGVsUGFydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsOiBUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24oXG5cdFx0bGFuZ3VhZ2VJZDogc3RyaW5nXG5cdCk6IFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihcblx0XHRcdGxhbmd1YWdlSWRcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUluZGVudExldmVsKGxpbmVJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gY29tcHV0ZUluZGVudExldmVsKFxuXHRcdFx0dGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZUluZGV4ICsgMSksXG5cdFx0XHR0aGlzLnRleHRNb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWN0aXZlSW5kZW50R3VpZGUoXG5cdFx0bGluZU51bWJlcjogbnVtYmVyLFxuXHRcdG1pbkxpbmVOdW1iZXI6IG51bWJlcixcblx0XHRtYXhMaW5lTnVtYmVyOiBudW1iZXJcblx0KTogSUFjdGl2ZUluZGVudEd1aWRlSW5mbyB7XG5cdFx0dGhpcy5hc3NlcnROb3REaXNwb3NlZCgpO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IHRoaXMudGV4dE1vZGVsLmdldExpbmVDb3VudCgpO1xuXG5cdFx0aWYgKGxpbmVOdW1iZXIgPCAxIHx8IGxpbmVOdW1iZXIgPiBsaW5lQ291bnQpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0lsbGVnYWwgdmFsdWUgZm9yIGxpbmVOdW1iZXInKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2xkaW5nUnVsZXMgPSB0aGlzLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihcblx0XHRcdHRoaXMudGV4dE1vZGVsLmdldExhbmd1YWdlSWQoKVxuXHRcdCkuZm9sZGluZ1J1bGVzO1xuXHRcdGNvbnN0IG9mZlNpZGUgPSBCb29sZWFuKGZvbGRpbmdSdWxlcyAmJiBmb2xkaW5nUnVsZXMub2ZmU2lkZSk7XG5cblx0XHRsZXQgdXBfYWJvdmVDb250ZW50TGluZUluZGV4ID1cblx0XHRcdC0yOyAvKiAtMiBpcyBhIG1hcmtlciBmb3Igbm90IGhhdmluZyBjb21wdXRlZCBpdCAqL1xuXHRcdGxldCB1cF9hYm92ZUNvbnRlbnRMaW5lSW5kZW50ID0gLTE7XG5cdFx0bGV0IHVwX2JlbG93Q29udGVudExpbmVJbmRleCA9XG5cdFx0XHQtMjsgLyogLTIgaXMgYSBtYXJrZXIgZm9yIG5vdCBoYXZpbmcgY29tcHV0ZWQgaXQgKi9cblx0XHRsZXQgdXBfYmVsb3dDb250ZW50TGluZUluZGVudCA9IC0xO1xuXHRcdGNvbnN0IHVwX3Jlc29sdmVJbmRlbnRzID0gKGxpbmVOdW1iZXI6IG51bWJlcikgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHR1cF9hYm92ZUNvbnRlbnRMaW5lSW5kZXggIT09IC0xICYmXG5cdFx0XHRcdCh1cF9hYm92ZUNvbnRlbnRMaW5lSW5kZXggPT09IC0yIHx8XG5cdFx0XHRcdFx0dXBfYWJvdmVDb250ZW50TGluZUluZGV4ID4gbGluZU51bWJlciAtIDEpXG5cdFx0XHQpIHtcblx0XHRcdFx0dXBfYWJvdmVDb250ZW50TGluZUluZGV4ID0gLTE7XG5cdFx0XHRcdHVwX2Fib3ZlQ29udGVudExpbmVJbmRlbnQgPSAtMTtcblxuXHRcdFx0XHQvLyBtdXN0IGZpbmQgcHJldmlvdXMgbGluZSB3aXRoIGNvbnRlbnRcblx0XHRcdFx0Zm9yIChsZXQgbGluZUluZGV4ID0gbGluZU51bWJlciAtIDI7IGxpbmVJbmRleCA+PSAwOyBsaW5lSW5kZXgtLSkge1xuXHRcdFx0XHRcdGNvbnN0IGluZGVudCA9IHRoaXMuX2NvbXB1dGVJbmRlbnRMZXZlbChsaW5lSW5kZXgpO1xuXHRcdFx0XHRcdGlmIChpbmRlbnQgPj0gMCkge1xuXHRcdFx0XHRcdFx0dXBfYWJvdmVDb250ZW50TGluZUluZGV4ID0gbGluZUluZGV4O1xuXHRcdFx0XHRcdFx0dXBfYWJvdmVDb250ZW50TGluZUluZGVudCA9IGluZGVudDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodXBfYmVsb3dDb250ZW50TGluZUluZGV4ID09PSAtMikge1xuXHRcdFx0XHR1cF9iZWxvd0NvbnRlbnRMaW5lSW5kZXggPSAtMTtcblx0XHRcdFx0dXBfYmVsb3dDb250ZW50TGluZUluZGVudCA9IC0xO1xuXG5cdFx0XHRcdC8vIG11c3QgZmluZCBuZXh0IGxpbmUgd2l0aCBjb250ZW50XG5cdFx0XHRcdGZvciAobGV0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXI7IGxpbmVJbmRleCA8IGxpbmVDb3VudDsgbGluZUluZGV4KyspIHtcblx0XHRcdFx0XHRjb25zdCBpbmRlbnQgPSB0aGlzLl9jb21wdXRlSW5kZW50TGV2ZWwobGluZUluZGV4KTtcblx0XHRcdFx0XHRpZiAoaW5kZW50ID49IDApIHtcblx0XHRcdFx0XHRcdHVwX2JlbG93Q29udGVudExpbmVJbmRleCA9IGxpbmVJbmRleDtcblx0XHRcdFx0XHRcdHVwX2JlbG93Q29udGVudExpbmVJbmRlbnQgPSBpbmRlbnQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bGV0IGRvd25fYWJvdmVDb250ZW50TGluZUluZGV4ID1cblx0XHRcdC0yOyAvKiAtMiBpcyBhIG1hcmtlciBmb3Igbm90IGhhdmluZyBjb21wdXRlZCBpdCAqL1xuXHRcdGxldCBkb3duX2Fib3ZlQ29udGVudExpbmVJbmRlbnQgPSAtMTtcblx0XHRsZXQgZG93bl9iZWxvd0NvbnRlbnRMaW5lSW5kZXggPVxuXHRcdFx0LTI7IC8qIC0yIGlzIGEgbWFya2VyIGZvciBub3QgaGF2aW5nIGNvbXB1dGVkIGl0ICovXG5cdFx0bGV0IGRvd25fYmVsb3dDb250ZW50TGluZUluZGVudCA9IC0xO1xuXHRcdGNvbnN0IGRvd25fcmVzb2x2ZUluZGVudHMgPSAobGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRpZiAoZG93bl9hYm92ZUNvbnRlbnRMaW5lSW5kZXggPT09IC0yKSB7XG5cdFx0XHRcdGRvd25fYWJvdmVDb250ZW50TGluZUluZGV4ID0gLTE7XG5cdFx0XHRcdGRvd25fYWJvdmVDb250ZW50TGluZUluZGVudCA9IC0xO1xuXG5cdFx0XHRcdC8vIG11c3QgZmluZCBwcmV2aW91cyBsaW5lIHdpdGggY29udGVudFxuXHRcdFx0XHRmb3IgKGxldCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyIC0gMjsgbGluZUluZGV4ID49IDA7IGxpbmVJbmRleC0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZW50ID0gdGhpcy5fY29tcHV0ZUluZGVudExldmVsKGxpbmVJbmRleCk7XG5cdFx0XHRcdFx0aWYgKGluZGVudCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRkb3duX2Fib3ZlQ29udGVudExpbmVJbmRleCA9IGxpbmVJbmRleDtcblx0XHRcdFx0XHRcdGRvd25fYWJvdmVDb250ZW50TGluZUluZGVudCA9IGluZGVudDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdGRvd25fYmVsb3dDb250ZW50TGluZUluZGV4ICE9PSAtMSAmJlxuXHRcdFx0XHQoZG93bl9iZWxvd0NvbnRlbnRMaW5lSW5kZXggPT09IC0yIHx8XG5cdFx0XHRcdFx0ZG93bl9iZWxvd0NvbnRlbnRMaW5lSW5kZXggPCBsaW5lTnVtYmVyIC0gMSlcblx0XHRcdCkge1xuXHRcdFx0XHRkb3duX2JlbG93Q29udGVudExpbmVJbmRleCA9IC0xO1xuXHRcdFx0XHRkb3duX2JlbG93Q29udGVudExpbmVJbmRlbnQgPSAtMTtcblxuXHRcdFx0XHQvLyBtdXN0IGZpbmQgbmV4dCBsaW5lIHdpdGggY29udGVudFxuXHRcdFx0XHRmb3IgKGxldCBsaW5lSW5kZXggPSBsaW5lTnVtYmVyOyBsaW5lSW5kZXggPCBsaW5lQ291bnQ7IGxpbmVJbmRleCsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZW50ID0gdGhpcy5fY29tcHV0ZUluZGVudExldmVsKGxpbmVJbmRleCk7XG5cdFx0XHRcdFx0aWYgKGluZGVudCA+PSAwKSB7XG5cdFx0XHRcdFx0XHRkb3duX2JlbG93Q29udGVudExpbmVJbmRleCA9IGxpbmVJbmRleDtcblx0XHRcdFx0XHRcdGRvd25fYmVsb3dDb250ZW50TGluZUluZGVudCA9IGluZGVudDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gMDtcblx0XHRsZXQgZ29VcCA9IHRydWU7XG5cdFx0bGV0IGVuZExpbmVOdW1iZXIgPSAwO1xuXHRcdGxldCBnb0Rvd24gPSB0cnVlO1xuXHRcdGxldCBpbmRlbnQgPSAwO1xuXG5cdFx0bGV0IGluaXRpYWxJbmRlbnQgPSAwO1xuXG5cdFx0Zm9yIChsZXQgZGlzdGFuY2UgPSAwOyBnb1VwIHx8IGdvRG93bjsgZGlzdGFuY2UrKykge1xuXHRcdFx0Y29uc3QgdXBMaW5lTnVtYmVyID0gbGluZU51bWJlciAtIGRpc3RhbmNlO1xuXHRcdFx0Y29uc3QgZG93bkxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyICsgZGlzdGFuY2U7XG5cblx0XHRcdGlmIChkaXN0YW5jZSA+IDEgJiYgKHVwTGluZU51bWJlciA8IDEgfHwgdXBMaW5lTnVtYmVyIDwgbWluTGluZU51bWJlcikpIHtcblx0XHRcdFx0Z29VcCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKFxuXHRcdFx0XHRkaXN0YW5jZSA+IDEgJiZcblx0XHRcdFx0KGRvd25MaW5lTnVtYmVyID4gbGluZUNvdW50IHx8IGRvd25MaW5lTnVtYmVyID4gbWF4TGluZU51bWJlcilcblx0XHRcdCkge1xuXHRcdFx0XHRnb0Rvd24gPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChkaXN0YW5jZSA+IDUwMDAwKSB7XG5cdFx0XHRcdC8vIHN0b3AgcHJvY2Vzc2luZ1xuXHRcdFx0XHRnb1VwID0gZmFsc2U7XG5cdFx0XHRcdGdvRG93biA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgdXBMaW5lSW5kZW50TGV2ZWw6IG51bWJlciA9IC0xO1xuXHRcdFx0aWYgKGdvVXAgJiYgdXBMaW5lTnVtYmVyID49IDEpIHtcblx0XHRcdFx0Ly8gY29tcHV0ZSBpbmRlbnQgbGV2ZWwgZ29pbmcgdXBcblx0XHRcdFx0Y29uc3QgY3VycmVudEluZGVudCA9IHRoaXMuX2NvbXB1dGVJbmRlbnRMZXZlbCh1cExpbmVOdW1iZXIgLSAxKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRJbmRlbnQgPj0gMCkge1xuXHRcdFx0XHRcdC8vIFRoaXMgbGluZSBoYXMgY29udGVudCAoYmVzaWRlcyB3aGl0ZXNwYWNlKVxuXHRcdFx0XHRcdC8vIFVzZSB0aGUgbGluZSdzIGluZGVudFxuXHRcdFx0XHRcdHVwX2JlbG93Q29udGVudExpbmVJbmRleCA9IHVwTGluZU51bWJlciAtIDE7XG5cdFx0XHRcdFx0dXBfYmVsb3dDb250ZW50TGluZUluZGVudCA9IGN1cnJlbnRJbmRlbnQ7XG5cdFx0XHRcdFx0dXBMaW5lSW5kZW50TGV2ZWwgPSBNYXRoLmNlaWwoXG5cdFx0XHRcdFx0XHRjdXJyZW50SW5kZW50IC8gdGhpcy50ZXh0TW9kZWwuZ2V0T3B0aW9ucygpLmluZGVudFNpemVcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHVwX3Jlc29sdmVJbmRlbnRzKHVwTGluZU51bWJlcik7XG5cdFx0XHRcdFx0dXBMaW5lSW5kZW50TGV2ZWwgPSB0aGlzLl9nZXRJbmRlbnRMZXZlbEZvcldoaXRlc3BhY2VMaW5lKFxuXHRcdFx0XHRcdFx0b2ZmU2lkZSxcblx0XHRcdFx0XHRcdHVwX2Fib3ZlQ29udGVudExpbmVJbmRlbnQsXG5cdFx0XHRcdFx0XHR1cF9iZWxvd0NvbnRlbnRMaW5lSW5kZW50XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZG93bkxpbmVJbmRlbnRMZXZlbCA9IC0xO1xuXHRcdFx0aWYgKGdvRG93biAmJiBkb3duTGluZU51bWJlciA8PSBsaW5lQ291bnQpIHtcblx0XHRcdFx0Ly8gY29tcHV0ZSBpbmRlbnQgbGV2ZWwgZ29pbmcgZG93blxuXHRcdFx0XHRjb25zdCBjdXJyZW50SW5kZW50ID0gdGhpcy5fY29tcHV0ZUluZGVudExldmVsKGRvd25MaW5lTnVtYmVyIC0gMSk7XG5cdFx0XHRcdGlmIChjdXJyZW50SW5kZW50ID49IDApIHtcblx0XHRcdFx0XHQvLyBUaGlzIGxpbmUgaGFzIGNvbnRlbnQgKGJlc2lkZXMgd2hpdGVzcGFjZSlcblx0XHRcdFx0XHQvLyBVc2UgdGhlIGxpbmUncyBpbmRlbnRcblx0XHRcdFx0XHRkb3duX2Fib3ZlQ29udGVudExpbmVJbmRleCA9IGRvd25MaW5lTnVtYmVyIC0gMTtcblx0XHRcdFx0XHRkb3duX2Fib3ZlQ29udGVudExpbmVJbmRlbnQgPSBjdXJyZW50SW5kZW50O1xuXHRcdFx0XHRcdGRvd25MaW5lSW5kZW50TGV2ZWwgPSBNYXRoLmNlaWwoXG5cdFx0XHRcdFx0XHRjdXJyZW50SW5kZW50IC8gdGhpcy50ZXh0TW9kZWwuZ2V0T3B0aW9ucygpLmluZGVudFNpemVcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRvd25fcmVzb2x2ZUluZGVudHMoZG93bkxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGRvd25MaW5lSW5kZW50TGV2ZWwgPSB0aGlzLl9nZXRJbmRlbnRMZXZlbEZvcldoaXRlc3BhY2VMaW5lKFxuXHRcdFx0XHRcdFx0b2ZmU2lkZSxcblx0XHRcdFx0XHRcdGRvd25fYWJvdmVDb250ZW50TGluZUluZGVudCxcblx0XHRcdFx0XHRcdGRvd25fYmVsb3dDb250ZW50TGluZUluZGVudFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGRpc3RhbmNlID09PSAwKSB7XG5cdFx0XHRcdGluaXRpYWxJbmRlbnQgPSB1cExpbmVJbmRlbnRMZXZlbDtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkaXN0YW5jZSA9PT0gMSkge1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0ZG93bkxpbmVOdW1iZXIgPD0gbGluZUNvdW50ICYmXG5cdFx0XHRcdFx0ZG93bkxpbmVJbmRlbnRMZXZlbCA+PSAwICYmXG5cdFx0XHRcdFx0aW5pdGlhbEluZGVudCArIDEgPT09IGRvd25MaW5lSW5kZW50TGV2ZWxcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBpcyB0aGUgYmVnaW5uaW5nIG9mIGEgc2NvcGUsIHdlIGhhdmUgc3BlY2lhbCBoYW5kbGluZyBoZXJlLCBzaW5jZSB3ZSB3YW50IHRoZVxuXHRcdFx0XHRcdC8vIGNoaWxkIHNjb3BlIGluZGVudCB0byBiZSBhY3RpdmUsIG5vdCB0aGUgcGFyZW50IHNjb3BlXG5cdFx0XHRcdFx0Z29VcCA9IGZhbHNlO1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlciA9IGRvd25MaW5lTnVtYmVyO1xuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBkb3duTGluZU51bWJlcjtcblx0XHRcdFx0XHRpbmRlbnQgPSBkb3duTGluZUluZGVudExldmVsO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdHVwTGluZU51bWJlciA+PSAxICYmXG5cdFx0XHRcdFx0dXBMaW5lSW5kZW50TGV2ZWwgPj0gMCAmJlxuXHRcdFx0XHRcdHVwTGluZUluZGVudExldmVsIC0gMSA9PT0gaW5pdGlhbEluZGVudFxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHQvLyBUaGlzIGlzIHRoZSBlbmQgb2YgYSBzY29wZSwganVzdCBsaWtlIGFib3ZlXG5cdFx0XHRcdFx0Z29Eb3duID0gZmFsc2U7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gdXBMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXIgPSB1cExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0aW5kZW50ID0gdXBMaW5lSW5kZW50TGV2ZWw7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdFx0XHRlbmRMaW5lTnVtYmVyID0gbGluZU51bWJlcjtcblx0XHRcdFx0aW5kZW50ID0gaW5pdGlhbEluZGVudDtcblx0XHRcdFx0aWYgKGluZGVudCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIE5vIG5lZWQgdG8gY29udGludWVcblx0XHRcdFx0XHRyZXR1cm4geyBzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIsIGluZGVudCB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChnb1VwKSB7XG5cdFx0XHRcdGlmICh1cExpbmVJbmRlbnRMZXZlbCA+PSBpbmRlbnQpIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPSB1cExpbmVOdW1iZXI7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Z29VcCA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZ29Eb3duKSB7XG5cdFx0XHRcdGlmIChkb3duTGluZUluZGVudExldmVsID49IGluZGVudCkge1xuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXIgPSBkb3duTGluZU51bWJlcjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRnb0Rvd24gPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciwgaW5kZW50IH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZXNCcmFja2V0R3VpZGVzKFxuXHRcdHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLFxuXHRcdGVuZExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRhY3RpdmVQb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCxcblx0XHRvcHRpb25zOiBCcmFja2V0R3VpZGVPcHRpb25zXG5cdCk6IEluZGVudEd1aWRlW11bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJbmRlbnRHdWlkZVtdW10gPSBbXTtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IGVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0cmVzdWx0LnB1c2goW10pO1xuXHRcdH1cblxuXHRcdC8vIElmIHJlcXVlc3RlZCwgdGhpcyBjb3VsZCBiZSBtYWRlIGNvbmZpZ3VyYWJsZS5cblx0XHRjb25zdCBpbmNsdWRlU2luZ2xlTGluZVBhaXJzID0gdHJ1ZTtcblxuXHRcdGNvbnN0IGJyYWNrZXRQYWlycyA9XG5cdFx0XHR0aGlzLnRleHRNb2RlbC5icmFja2V0UGFpcnMuZ2V0QnJhY2tldFBhaXJzSW5SYW5nZVdpdGhNaW5JbmRlbnRhdGlvbihcblx0XHRcdFx0bmV3IFJhbmdlKFxuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHQxLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0dGhpcy50ZXh0TW9kZWwuZ2V0TGluZU1heENvbHVtbihlbmRMaW5lTnVtYmVyKVxuXHRcdFx0XHQpXG5cdFx0XHQpLnRvQXJyYXkoKTtcblxuXHRcdGxldCBhY3RpdmVCcmFja2V0UGFpclJhbmdlOiBSYW5nZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoYWN0aXZlUG9zaXRpb24gJiYgYnJhY2tldFBhaXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGJyYWNrZXRzQ29udGFpbmluZ0FjdGl2ZVBvc2l0aW9uID0gKFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgPD0gYWN0aXZlUG9zaXRpb24ubGluZU51bWJlciAmJlxuXHRcdFx0XHRcdGFjdGl2ZVBvc2l0aW9uLmxpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlclxuXHRcdFx0XHRcdC8vIFdlIGRvbid0IG5lZWQgdG8gcXVlcnkgdGhlIGJyYWNrZXRzIGFnYWluIGlmIHRoZSBjdXJzb3IgaXMgaW4gdGhlIHZpZXdwb3J0XG5cdFx0XHRcdFx0PyBicmFja2V0UGFpcnNcblx0XHRcdFx0XHQ6IHRoaXMudGV4dE1vZGVsLmJyYWNrZXRQYWlycy5nZXRCcmFja2V0UGFpcnNJblJhbmdlKFxuXHRcdFx0XHRcdFx0UmFuZ2UuZnJvbVBvc2l0aW9ucyhhY3RpdmVQb3NpdGlvbilcblx0XHRcdFx0XHQpLnRvQXJyYXkoKVxuXHRcdFx0KS5maWx0ZXIoKGJwKSA9PiBSYW5nZS5zdHJpY3RDb250YWluc1Bvc2l0aW9uKGJwLnJhbmdlLCBhY3RpdmVQb3NpdGlvbikpO1xuXG5cdFx0XHRhY3RpdmVCcmFja2V0UGFpclJhbmdlID0gZmluZExhc3QoXG5cdFx0XHRcdGJyYWNrZXRzQ29udGFpbmluZ0FjdGl2ZVBvc2l0aW9uLFxuXHRcdFx0XHQoaSkgPT4gaW5jbHVkZVNpbmdsZUxpbmVQYWlycyB8fCBpLnJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gaS5yYW5nZS5lbmRMaW5lTnVtYmVyXG5cdFx0XHQpPy5yYW5nZTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlID0gdGhpcy50ZXh0TW9kZWwuZ2V0T3B0aW9ucygpLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucy5pbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlO1xuXHRcdGNvbnN0IGNvbG9yUHJvdmlkZXIgPSBuZXcgQnJhY2tldFBhaXJHdWlkZXNDbGFzc05hbWVzKCk7XG5cblx0XHRmb3IgKGNvbnN0IHBhaXIgb2YgYnJhY2tldFBhaXJzKSB7XG5cdFx0XHQvKlxuXG5cblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0fFxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHR8XG5cdFx0XHRcdFx0LS0tLX1cblxuXHRcdFx0XHRfX19fe1xuXHRcdFx0XHR8dGVzdFxuXHRcdFx0XHQtLS0tfVxuXG5cdFx0XHRcdHJlbmRlckhvcml6b250YWxFbmRMaW5lQXRUaGVCb3R0b206XG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdHxcblx0XHRcdFx0XHR8eH1cblx0XHRcdFx0XHQtLVxuXHRcdFx0XHRyZW5kZXJIb3Jpem9udGFsRW5kTGluZUF0VGhlQm90dG9tOlxuXHRcdFx0XHRfX19fe1xuXHRcdFx0XHR8dGVzdFxuXHRcdFx0XHR8IHggfVxuXHRcdFx0XHQtLS0tXG5cdFx0XHQqL1xuXG5cdFx0XHRpZiAoIXBhaXIuY2xvc2luZ0JyYWNrZXRSYW5nZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBhY3RpdmVCcmFja2V0UGFpclJhbmdlICYmIHBhaXIucmFuZ2UuZXF1YWxzUmFuZ2UoYWN0aXZlQnJhY2tldFBhaXJSYW5nZSk7XG5cblx0XHRcdGlmICghaXNBY3RpdmUgJiYgIW9wdGlvbnMuaW5jbHVkZUluYWN0aXZlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbGFzc05hbWUgPVxuXHRcdFx0XHRjb2xvclByb3ZpZGVyLmdldElubGluZUNsYXNzTmFtZShwYWlyLm5lc3RpbmdMZXZlbCwgcGFpci5uZXN0aW5nTGV2ZWxPZkVxdWFsQnJhY2tldFR5cGUsIGluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGUpICtcblx0XHRcdFx0KG9wdGlvbnMuaGlnaGxpZ2h0QWN0aXZlICYmIGlzQWN0aXZlXG5cdFx0XHRcdFx0PyAnICcgKyBjb2xvclByb3ZpZGVyLmFjdGl2ZUNsYXNzTmFtZVxuXHRcdFx0XHRcdDogJycpO1xuXG5cblx0XHRcdGNvbnN0IHN0YXJ0ID0gcGFpci5vcGVuaW5nQnJhY2tldFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IGVuZCA9IHBhaXIuY2xvc2luZ0JyYWNrZXRSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cblx0XHRcdGNvbnN0IGhvcml6b250YWxHdWlkZXMgPSBvcHRpb25zLmhvcml6b250YWxHdWlkZXMgPT09IEhvcml6b250YWxHdWlkZXNTdGF0ZS5FbmFibGVkIHx8IChvcHRpb25zLmhvcml6b250YWxHdWlkZXMgPT09IEhvcml6b250YWxHdWlkZXNTdGF0ZS5FbmFibGVkRm9yQWN0aXZlICYmIGlzQWN0aXZlKTtcblxuXHRcdFx0aWYgKHBhaXIucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBwYWlyLnJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0aWYgKGluY2x1ZGVTaW5nbGVMaW5lUGFpcnMgJiYgaG9yaXpvbnRhbEd1aWRlcykge1xuXG5cdFx0XHRcdFx0cmVzdWx0W3BhaXIucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyXS5wdXNoKFxuXHRcdFx0XHRcdFx0bmV3IEluZGVudEd1aWRlKFxuXHRcdFx0XHRcdFx0XHQtMSxcblx0XHRcdFx0XHRcdFx0cGFpci5vcGVuaW5nQnJhY2tldFJhbmdlLmdldEVuZFBvc2l0aW9uKCkuY29sdW1uLFxuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWUsXG5cdFx0XHRcdFx0XHRcdG5ldyBJbmRlbnRHdWlkZUhvcml6b250YWxMaW5lKGZhbHNlLCBlbmQuY29sdW1uKSxcblx0XHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHRcdC0xLFxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW5kVmlzaWJsZUNvbHVtbiA9IHRoaXMuZ2V0VmlzaWJsZUNvbHVtbkZyb21Qb3NpdGlvbihlbmQpO1xuXHRcdFx0Y29uc3Qgc3RhcnRWaXNpYmxlQ29sdW1uID0gdGhpcy5nZXRWaXNpYmxlQ29sdW1uRnJvbVBvc2l0aW9uKFxuXHRcdFx0XHRwYWlyLm9wZW5pbmdCcmFja2V0UmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgZ3VpZGVWaXNpYmxlQ29sdW1uID0gTWF0aC5taW4oc3RhcnRWaXNpYmxlQ29sdW1uLCBlbmRWaXNpYmxlQ29sdW1uLCBwYWlyLm1pblZpc2libGVDb2x1bW5JbmRlbnRhdGlvbiArIDEpO1xuXG5cdFx0XHRsZXQgcmVuZGVySG9yaXpvbnRhbEVuZExpbmVBdFRoZUJvdHRvbSA9IGZhbHNlO1xuXG5cblx0XHRcdGNvbnN0IGZpcnN0Tm9uV3NJbmRleCA9IHN0cmluZ3MuZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXgoXG5cdFx0XHRcdHRoaXMudGV4dE1vZGVsLmdldExpbmVDb250ZW50KFxuXHRcdFx0XHRcdHBhaXIuY2xvc2luZ0JyYWNrZXRSYW5nZS5zdGFydExpbmVOdW1iZXJcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGhhc1RleHRCZWZvcmVDbG9zaW5nQnJhY2tldCA9IGZpcnN0Tm9uV3NJbmRleCA8IHBhaXIuY2xvc2luZ0JyYWNrZXRSYW5nZS5zdGFydENvbHVtbiAtIDE7XG5cdFx0XHRpZiAoaGFzVGV4dEJlZm9yZUNsb3NpbmdCcmFja2V0KSB7XG5cdFx0XHRcdHJlbmRlckhvcml6b250YWxFbmRMaW5lQXRUaGVCb3R0b20gPSB0cnVlO1xuXHRcdFx0fVxuXG5cblx0XHRcdGNvbnN0IHZpc2libGVHdWlkZVN0YXJ0TGluZU51bWJlciA9IE1hdGgubWF4KHN0YXJ0LmxpbmVOdW1iZXIsIHN0YXJ0TGluZU51bWJlcik7XG5cdFx0XHRjb25zdCB2aXNpYmxlR3VpZGVFbmRMaW5lTnVtYmVyID0gTWF0aC5taW4oZW5kLmxpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIpO1xuXG5cdFx0XHRjb25zdCBvZmZzZXQgPSByZW5kZXJIb3Jpem9udGFsRW5kTGluZUF0VGhlQm90dG9tID8gMSA6IDA7XG5cblx0XHRcdGZvciAobGV0IGwgPSB2aXNpYmxlR3VpZGVTdGFydExpbmVOdW1iZXI7IGwgPCB2aXNpYmxlR3VpZGVFbmRMaW5lTnVtYmVyICsgb2Zmc2V0OyBsKyspIHtcblx0XHRcdFx0cmVzdWx0W2wgLSBzdGFydExpbmVOdW1iZXJdLnB1c2goXG5cdFx0XHRcdFx0bmV3IEluZGVudEd1aWRlKFxuXHRcdFx0XHRcdFx0Z3VpZGVWaXNpYmxlQ29sdW1uLFxuXHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHRjbGFzc05hbWUsXG5cdFx0XHRcdFx0XHRudWxsLFxuXHRcdFx0XHRcdFx0bCA9PT0gc3RhcnQubGluZU51bWJlciA/IHN0YXJ0LmNvbHVtbiA6IC0xLFxuXHRcdFx0XHRcdFx0bCA9PT0gZW5kLmxpbmVOdW1iZXIgPyBlbmQuY29sdW1uIDogLTFcblx0XHRcdFx0XHQpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChob3Jpem9udGFsR3VpZGVzKSB7XG5cdFx0XHRcdGlmIChzdGFydC5saW5lTnVtYmVyID49IHN0YXJ0TGluZU51bWJlciAmJiBzdGFydFZpc2libGVDb2x1bW4gPiBndWlkZVZpc2libGVDb2x1bW4pIHtcblx0XHRcdFx0XHRyZXN1bHRbc3RhcnQubGluZU51bWJlciAtIHN0YXJ0TGluZU51bWJlcl0ucHVzaChcblx0XHRcdFx0XHRcdG5ldyBJbmRlbnRHdWlkZShcblx0XHRcdFx0XHRcdFx0Z3VpZGVWaXNpYmxlQ29sdW1uLFxuXHRcdFx0XHRcdFx0XHQtMSxcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lLFxuXHRcdFx0XHRcdFx0XHRuZXcgSW5kZW50R3VpZGVIb3Jpem9udGFsTGluZShmYWxzZSwgc3RhcnQuY29sdW1uKSxcblx0XHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHRcdC0xLFxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZW5kLmxpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlciAmJiBlbmRWaXNpYmxlQ29sdW1uID4gZ3VpZGVWaXNpYmxlQ29sdW1uKSB7XG5cdFx0XHRcdFx0cmVzdWx0W2VuZC5saW5lTnVtYmVyIC0gc3RhcnRMaW5lTnVtYmVyXS5wdXNoKFxuXHRcdFx0XHRcdFx0bmV3IEluZGVudEd1aWRlKFxuXHRcdFx0XHRcdFx0XHRndWlkZVZpc2libGVDb2x1bW4sXG5cdFx0XHRcdFx0XHRcdC0xLFxuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWUsXG5cdFx0XHRcdFx0XHRcdG5ldyBJbmRlbnRHdWlkZUhvcml6b250YWxMaW5lKCFyZW5kZXJIb3Jpem9udGFsRW5kTGluZUF0VGhlQm90dG9tLCBlbmQuY29sdW1uKSxcblx0XHRcdFx0XHRcdFx0LTEsXG5cdFx0XHRcdFx0XHRcdC0xLFxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGd1aWRlcyBvZiByZXN1bHQpIHtcblx0XHRcdGd1aWRlcy5zb3J0KChhLCBiKSA9PiBhLnZpc2libGVDb2x1bW4gLSBiLnZpc2libGVDb2x1bW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpc2libGVDb2x1bW5Gcm9tUG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0Q3Vyc29yQ29sdW1ucy52aXNpYmxlQ29sdW1uRnJvbUNvbHVtbihcblx0XHRcdFx0dGhpcy50ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlciksXG5cdFx0XHRcdHBvc2l0aW9uLmNvbHVtbixcblx0XHRcdFx0dGhpcy50ZXh0TW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemVcblx0XHRcdCkgKyAxXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lc0luZGVudEd1aWRlcyhcblx0XHRzdGFydExpbmVOdW1iZXI6IG51bWJlcixcblx0XHRlbmRMaW5lTnVtYmVyOiBudW1iZXJcblx0KTogbnVtYmVyW10ge1xuXHRcdHRoaXMuYXNzZXJ0Tm90RGlzcG9zZWQoKTtcblx0XHRjb25zdCBsaW5lQ291bnQgPSB0aGlzLnRleHRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblxuXHRcdGlmIChzdGFydExpbmVOdW1iZXIgPCAxIHx8IHN0YXJ0TGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbGxlZ2FsIHZhbHVlIGZvciBzdGFydExpbmVOdW1iZXInKTtcblx0XHR9XG5cdFx0aWYgKGVuZExpbmVOdW1iZXIgPCAxIHx8IGVuZExpbmVOdW1iZXIgPiBsaW5lQ291bnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSWxsZWdhbCB2YWx1ZSBmb3IgZW5kTGluZU51bWJlcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLnRleHRNb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0Y29uc3QgZm9sZGluZ1J1bGVzID0gdGhpcy5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24oXG5cdFx0XHR0aGlzLnRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKClcblx0XHQpLmZvbGRpbmdSdWxlcztcblx0XHRjb25zdCBvZmZTaWRlID0gQm9vbGVhbihmb2xkaW5nUnVsZXMgJiYgZm9sZGluZ1J1bGVzLm9mZlNpZGUpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IG5ldyBBcnJheTxudW1iZXI+KFxuXHRcdFx0ZW5kTGluZU51bWJlciAtIHN0YXJ0TGluZU51bWJlciArIDFcblx0XHQpO1xuXG5cdFx0bGV0IGFib3ZlQ29udGVudExpbmVJbmRleCA9XG5cdFx0XHQtMjsgLyogLTIgaXMgYSBtYXJrZXIgZm9yIG5vdCBoYXZpbmcgY29tcHV0ZWQgaXQgKi9cblx0XHRsZXQgYWJvdmVDb250ZW50TGluZUluZGVudCA9IC0xO1xuXG5cdFx0bGV0IGJlbG93Q29udGVudExpbmVJbmRleCA9XG5cdFx0XHQtMjsgLyogLTIgaXMgYSBtYXJrZXIgZm9yIG5vdCBoYXZpbmcgY29tcHV0ZWQgaXQgKi9cblx0XHRsZXQgYmVsb3dDb250ZW50TGluZUluZGVudCA9IC0xO1xuXG5cdFx0Zm9yIChcblx0XHRcdGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0bGluZU51bWJlciA8PSBlbmRMaW5lTnVtYmVyO1xuXHRcdFx0bGluZU51bWJlcisrXG5cdFx0KSB7XG5cdFx0XHRjb25zdCByZXN1bHRJbmRleCA9IGxpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXI7XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRJbmRlbnQgPSB0aGlzLl9jb21wdXRlSW5kZW50TGV2ZWwobGluZU51bWJlciAtIDEpO1xuXHRcdFx0aWYgKGN1cnJlbnRJbmRlbnQgPj0gMCkge1xuXHRcdFx0XHQvLyBUaGlzIGxpbmUgaGFzIGNvbnRlbnQgKGJlc2lkZXMgd2hpdGVzcGFjZSlcblx0XHRcdFx0Ly8gVXNlIHRoZSBsaW5lJ3MgaW5kZW50XG5cdFx0XHRcdGFib3ZlQ29udGVudExpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSAxO1xuXHRcdFx0XHRhYm92ZUNvbnRlbnRMaW5lSW5kZW50ID0gY3VycmVudEluZGVudDtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdEluZGV4XSA9IE1hdGguY2VpbChjdXJyZW50SW5kZW50IC8gb3B0aW9ucy5pbmRlbnRTaXplKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhYm92ZUNvbnRlbnRMaW5lSW5kZXggPT09IC0yKSB7XG5cdFx0XHRcdGFib3ZlQ29udGVudExpbmVJbmRleCA9IC0xO1xuXHRcdFx0XHRhYm92ZUNvbnRlbnRMaW5lSW5kZW50ID0gLTE7XG5cblx0XHRcdFx0Ly8gbXVzdCBmaW5kIHByZXZpb3VzIGxpbmUgd2l0aCBjb250ZW50XG5cdFx0XHRcdGZvciAobGV0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSAyOyBsaW5lSW5kZXggPj0gMDsgbGluZUluZGV4LS0pIHtcblx0XHRcdFx0XHRjb25zdCBpbmRlbnQgPSB0aGlzLl9jb21wdXRlSW5kZW50TGV2ZWwobGluZUluZGV4KTtcblx0XHRcdFx0XHRpZiAoaW5kZW50ID49IDApIHtcblx0XHRcdFx0XHRcdGFib3ZlQ29udGVudExpbmVJbmRleCA9IGxpbmVJbmRleDtcblx0XHRcdFx0XHRcdGFib3ZlQ29udGVudExpbmVJbmRlbnQgPSBpbmRlbnQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRiZWxvd0NvbnRlbnRMaW5lSW5kZXggIT09IC0xICYmXG5cdFx0XHRcdChiZWxvd0NvbnRlbnRMaW5lSW5kZXggPT09IC0yIHx8IGJlbG93Q29udGVudExpbmVJbmRleCA8IGxpbmVOdW1iZXIgLSAxKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGJlbG93Q29udGVudExpbmVJbmRleCA9IC0xO1xuXHRcdFx0XHRiZWxvd0NvbnRlbnRMaW5lSW5kZW50ID0gLTE7XG5cblx0XHRcdFx0Ly8gbXVzdCBmaW5kIG5leHQgbGluZSB3aXRoIGNvbnRlbnRcblx0XHRcdFx0Zm9yIChsZXQgbGluZUluZGV4ID0gbGluZU51bWJlcjsgbGluZUluZGV4IDwgbGluZUNvdW50OyBsaW5lSW5kZXgrKykge1xuXHRcdFx0XHRcdGNvbnN0IGluZGVudCA9IHRoaXMuX2NvbXB1dGVJbmRlbnRMZXZlbChsaW5lSW5kZXgpO1xuXHRcdFx0XHRcdGlmIChpbmRlbnQgPj0gMCkge1xuXHRcdFx0XHRcdFx0YmVsb3dDb250ZW50TGluZUluZGV4ID0gbGluZUluZGV4O1xuXHRcdFx0XHRcdFx0YmVsb3dDb250ZW50TGluZUluZGVudCA9IGluZGVudDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHRbcmVzdWx0SW5kZXhdID0gdGhpcy5fZ2V0SW5kZW50TGV2ZWxGb3JXaGl0ZXNwYWNlTGluZShcblx0XHRcdFx0b2ZmU2lkZSxcblx0XHRcdFx0YWJvdmVDb250ZW50TGluZUluZGVudCxcblx0XHRcdFx0YmVsb3dDb250ZW50TGluZUluZGVudFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2dldEluZGVudExldmVsRm9yV2hpdGVzcGFjZUxpbmUoXG5cdFx0b2ZmU2lkZTogYm9vbGVhbixcblx0XHRhYm92ZUNvbnRlbnRMaW5lSW5kZW50OiBudW1iZXIsXG5cdFx0YmVsb3dDb250ZW50TGluZUluZGVudDogbnVtYmVyXG5cdCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMudGV4dE1vZGVsLmdldE9wdGlvbnMoKTtcblxuXHRcdGlmIChhYm92ZUNvbnRlbnRMaW5lSW5kZW50ID09PSAtMSB8fCBiZWxvd0NvbnRlbnRMaW5lSW5kZW50ID09PSAtMSkge1xuXHRcdFx0Ly8gQXQgdGhlIHRvcCBvciBib3R0b20gb2YgdGhlIGZpbGVcblx0XHRcdHJldHVybiAwO1xuXHRcdH0gZWxzZSBpZiAoYWJvdmVDb250ZW50TGluZUluZGVudCA8IGJlbG93Q29udGVudExpbmVJbmRlbnQpIHtcblx0XHRcdC8vIHdlIGFyZSBpbnNpZGUgdGhlIHJlZ2lvbiBhYm92ZVxuXHRcdFx0cmV0dXJuIDEgKyBNYXRoLmZsb29yKGFib3ZlQ29udGVudExpbmVJbmRlbnQgLyBvcHRpb25zLmluZGVudFNpemUpO1xuXHRcdH0gZWxzZSBpZiAoYWJvdmVDb250ZW50TGluZUluZGVudCA9PT0gYmVsb3dDb250ZW50TGluZUluZGVudCkge1xuXHRcdFx0Ly8gd2UgYXJlIGluIGJldHdlZW4gdHdvIHJlZ2lvbnNcblx0XHRcdHJldHVybiBNYXRoLmNlaWwoYmVsb3dDb250ZW50TGluZUluZGVudCAvIG9wdGlvbnMuaW5kZW50U2l6ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChvZmZTaWRlKSB7XG5cdFx0XHRcdC8vIHNhbWUgbGV2ZWwgYXMgcmVnaW9uIGJlbG93XG5cdFx0XHRcdHJldHVybiBNYXRoLmNlaWwoYmVsb3dDb250ZW50TGluZUluZGVudCAvIG9wdGlvbnMuaW5kZW50U2l6ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyB3ZSBhcmUgaW5zaWRlIHRoZSByZWdpb24gdGhhdCBlbmRzIGJlbG93XG5cdFx0XHRcdHJldHVybiAxICsgTWF0aC5mbG9vcihiZWxvd0NvbnRlbnRMaW5lSW5kZW50IC8gb3B0aW9ucy5pbmRlbnRTaXplKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyYWNrZXRQYWlyR3VpZGVzQ2xhc3NOYW1lcyB7XG5cdHB1YmxpYyByZWFkb25seSBhY3RpdmVDbGFzc05hbWUgPSAnaW5kZW50LWFjdGl2ZSc7XG5cblx0Z2V0SW5saW5lQ2xhc3NOYW1lKG5lc3RpbmdMZXZlbDogbnVtYmVyLCBuZXN0aW5nTGV2ZWxPZkVxdWFsQnJhY2tldFR5cGU6IG51bWJlciwgaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZTogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SW5saW5lQ2xhc3NOYW1lT2ZMZXZlbChpbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlID8gbmVzdGluZ0xldmVsT2ZFcXVhbEJyYWNrZXRUeXBlIDogbmVzdGluZ0xldmVsKTtcblx0fVxuXG5cdGdldElubGluZUNsYXNzTmFtZU9mTGV2ZWwobGV2ZWw6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Ly8gVG8gc3VwcG9ydCBhIGR5bmFtaWMgYW1vdW50IG9mIGNvbG9ycyB1cCB0byA2IGNvbG9ycyxcblx0XHQvLyB3ZSB1c2UgYSBudW1iZXIgdGhhdCBpcyBhIGxjbSBvZiBhbGwgbnVtYmVycyBmcm9tIDEgdG8gNi5cblx0XHRyZXR1cm4gYGJyYWNrZXQtaW5kZW50LWd1aWRlIGx2bC0ke2xldmVsICUgMzB9YDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsYUFBYTtBQUV0QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBCQUEwQjtBQUVuQyxTQUE4Qix1QkFBcUUsYUFBYSxpQ0FBaUM7QUFDakosU0FBUywwQkFBMEI7QUFFNUIsTUFBTSw0QkFBNEIsY0FBOEM7QUFBQSxFQUN0RixZQUNrQixXQUNBLDhCQUNoQjtBQUNELFVBQU07QUFIVztBQUNBO0FBQUEsRUFHbEI7QUFBQSxFQUVRLHlCQUNQLFlBQ2dDO0FBQ2hDLFdBQU8sS0FBSyw2QkFBNkI7QUFBQSxNQUN4QztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxvQkFBb0IsV0FBMkI7QUFDdEQsV0FBTztBQUFBLE1BQ04sS0FBSyxVQUFVLGVBQWUsWUFBWSxDQUFDO0FBQUEsTUFDM0MsS0FBSyxVQUFVLFdBQVcsRUFBRTtBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBLEVBRU8scUJBQ04sWUFDQSxlQUNBLGVBQ3lCO0FBQ3pCLFNBQUssa0JBQWtCO0FBQ3ZCLFVBQU0sWUFBWSxLQUFLLFVBQVUsYUFBYTtBQUU5QyxRQUFJLGFBQWEsS0FBSyxhQUFhLFdBQVc7QUFDN0MsWUFBTSxJQUFJLG1CQUFtQiw4QkFBOEI7QUFBQSxJQUM1RDtBQUVBLFVBQU0sZUFBZSxLQUFLO0FBQUEsTUFDekIsS0FBSyxVQUFVLGNBQWM7QUFBQSxJQUM5QixFQUFFO0FBQ0YsVUFBTSxVQUFVLFFBQVEsZ0JBQWdCLGFBQWEsT0FBTztBQUU1RCxRQUFJLDJCQUNIO0FBQ0QsUUFBSSw0QkFBNEI7QUFDaEMsUUFBSSwyQkFDSDtBQUNELFFBQUksNEJBQTRCO0FBQ2hDLFVBQU0sb0JBQW9CLENBQUNBLGdCQUF1QjtBQUNqRCxVQUNDLDZCQUE2QixPQUM1Qiw2QkFBNkIsTUFDN0IsMkJBQTJCQSxjQUFhLElBQ3hDO0FBQ0QsbUNBQTJCO0FBQzNCLG9DQUE0QjtBQUc1QixpQkFBUyxZQUFZQSxjQUFhLEdBQUcsYUFBYSxHQUFHLGFBQWE7QUFDakUsZ0JBQU1DLFVBQVMsS0FBSyxvQkFBb0IsU0FBUztBQUNqRCxjQUFJQSxXQUFVLEdBQUc7QUFDaEIsdUNBQTJCO0FBQzNCLHdDQUE0QkE7QUFDNUI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLDZCQUE2QixJQUFJO0FBQ3BDLG1DQUEyQjtBQUMzQixvQ0FBNEI7QUFHNUIsaUJBQVMsWUFBWUQsYUFBWSxZQUFZLFdBQVcsYUFBYTtBQUNwRSxnQkFBTUMsVUFBUyxLQUFLLG9CQUFvQixTQUFTO0FBQ2pELGNBQUlBLFdBQVUsR0FBRztBQUNoQix1Q0FBMkI7QUFDM0Isd0NBQTRCQTtBQUM1QjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLDZCQUNIO0FBQ0QsUUFBSSw4QkFBOEI7QUFDbEMsUUFBSSw2QkFDSDtBQUNELFFBQUksOEJBQThCO0FBQ2xDLFVBQU0sc0JBQXNCLENBQUNELGdCQUF1QjtBQUNuRCxVQUFJLCtCQUErQixJQUFJO0FBQ3RDLHFDQUE2QjtBQUM3QixzQ0FBOEI7QUFHOUIsaUJBQVMsWUFBWUEsY0FBYSxHQUFHLGFBQWEsR0FBRyxhQUFhO0FBQ2pFLGdCQUFNQyxVQUFTLEtBQUssb0JBQW9CLFNBQVM7QUFDakQsY0FBSUEsV0FBVSxHQUFHO0FBQ2hCLHlDQUE2QjtBQUM3QiwwQ0FBOEJBO0FBQzlCO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFDQywrQkFBK0IsT0FDOUIsK0JBQStCLE1BQy9CLDZCQUE2QkQsY0FBYSxJQUMxQztBQUNELHFDQUE2QjtBQUM3QixzQ0FBOEI7QUFHOUIsaUJBQVMsWUFBWUEsYUFBWSxZQUFZLFdBQVcsYUFBYTtBQUNwRSxnQkFBTUMsVUFBUyxLQUFLLG9CQUFvQixTQUFTO0FBQ2pELGNBQUlBLFdBQVUsR0FBRztBQUNoQix5Q0FBNkI7QUFDN0IsMENBQThCQTtBQUM5QjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLGtCQUFrQjtBQUN0QixRQUFJLE9BQU87QUFDWCxRQUFJLGdCQUFnQjtBQUNwQixRQUFJLFNBQVM7QUFDYixRQUFJLFNBQVM7QUFFYixRQUFJLGdCQUFnQjtBQUVwQixhQUFTLFdBQVcsR0FBRyxRQUFRLFFBQVEsWUFBWTtBQUNsRCxZQUFNLGVBQWUsYUFBYTtBQUNsQyxZQUFNLGlCQUFpQixhQUFhO0FBRXBDLFVBQUksV0FBVyxNQUFNLGVBQWUsS0FBSyxlQUFlLGdCQUFnQjtBQUN2RSxlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQ0MsV0FBVyxNQUNWLGlCQUFpQixhQUFhLGlCQUFpQixnQkFDL0M7QUFDRCxpQkFBUztBQUFBLE1BQ1Y7QUFDQSxVQUFJLFdBQVcsS0FBTztBQUVyQixlQUFPO0FBQ1AsaUJBQVM7QUFBQSxNQUNWO0FBRUEsVUFBSSxvQkFBNEI7QUFDaEMsVUFBSSxRQUFRLGdCQUFnQixHQUFHO0FBRTlCLGNBQU0sZ0JBQWdCLEtBQUssb0JBQW9CLGVBQWUsQ0FBQztBQUMvRCxZQUFJLGlCQUFpQixHQUFHO0FBR3ZCLHFDQUEyQixlQUFlO0FBQzFDLHNDQUE0QjtBQUM1Qiw4QkFBb0IsS0FBSztBQUFBLFlBQ3hCLGdCQUFnQixLQUFLLFVBQVUsV0FBVyxFQUFFO0FBQUEsVUFDN0M7QUFBQSxRQUNELE9BQU87QUFDTiw0QkFBa0IsWUFBWTtBQUM5Qiw4QkFBb0IsS0FBSztBQUFBLFlBQ3hCO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLHNCQUFzQjtBQUMxQixVQUFJLFVBQVUsa0JBQWtCLFdBQVc7QUFFMUMsY0FBTSxnQkFBZ0IsS0FBSyxvQkFBb0IsaUJBQWlCLENBQUM7QUFDakUsWUFBSSxpQkFBaUIsR0FBRztBQUd2Qix1Q0FBNkIsaUJBQWlCO0FBQzlDLHdDQUE4QjtBQUM5QixnQ0FBc0IsS0FBSztBQUFBLFlBQzFCLGdCQUFnQixLQUFLLFVBQVUsV0FBVyxFQUFFO0FBQUEsVUFDN0M7QUFBQSxRQUNELE9BQU87QUFDTiw4QkFBb0IsY0FBYztBQUNsQyxnQ0FBc0IsS0FBSztBQUFBLFlBQzFCO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLGFBQWEsR0FBRztBQUNuQix3QkFBZ0I7QUFDaEI7QUFBQSxNQUNEO0FBRUEsVUFBSSxhQUFhLEdBQUc7QUFDbkIsWUFDQyxrQkFBa0IsYUFDbEIsdUJBQXVCLEtBQ3ZCLGdCQUFnQixNQUFNLHFCQUNyQjtBQUdELGlCQUFPO0FBQ1AsNEJBQWtCO0FBQ2xCLDBCQUFnQjtBQUNoQixtQkFBUztBQUNUO0FBQUEsUUFDRDtBQUVBLFlBQ0MsZ0JBQWdCLEtBQ2hCLHFCQUFxQixLQUNyQixvQkFBb0IsTUFBTSxlQUN6QjtBQUVELG1CQUFTO0FBQ1QsNEJBQWtCO0FBQ2xCLDBCQUFnQjtBQUNoQixtQkFBUztBQUNUO0FBQUEsUUFDRDtBQUVBLDBCQUFrQjtBQUNsQix3QkFBZ0I7QUFDaEIsaUJBQVM7QUFDVCxZQUFJLFdBQVcsR0FBRztBQUVqQixpQkFBTyxFQUFFLGlCQUFpQixlQUFlLE9BQU87QUFBQSxRQUNqRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLE1BQU07QUFDVCxZQUFJLHFCQUFxQixRQUFRO0FBQ2hDLDRCQUFrQjtBQUFBLFFBQ25CLE9BQU87QUFDTixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQ0EsVUFBSSxRQUFRO0FBQ1gsWUFBSSx1QkFBdUIsUUFBUTtBQUNsQywwQkFBZ0I7QUFBQSxRQUNqQixPQUFPO0FBQ04sbUJBQVM7QUFBQSxRQUNWO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLEVBQUUsaUJBQWlCLGVBQWUsT0FBTztBQUFBLEVBQ2pEO0FBQUEsRUFFTyxzQkFDTixpQkFDQSxlQUNBLGdCQUNBLFNBQ2tCO0FBQ2xCLFVBQU0sU0FBMEIsQ0FBQztBQUNqQyxhQUFTLGFBQWEsaUJBQWlCLGNBQWMsZUFBZSxjQUFjO0FBQ2pGLGFBQU8sS0FBSyxDQUFDLENBQUM7QUFBQSxJQUNmO0FBR0EsVUFBTSx5QkFBeUI7QUFFL0IsVUFBTSxlQUNMLEtBQUssVUFBVSxhQUFhO0FBQUEsTUFDM0IsSUFBSTtBQUFBLFFBQ0g7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0EsS0FBSyxVQUFVLGlCQUFpQixhQUFhO0FBQUEsTUFDOUM7QUFBQSxJQUNELEVBQUUsUUFBUTtBQUVYLFFBQUkseUJBQTRDO0FBQ2hELFFBQUksa0JBQWtCLGFBQWEsU0FBUyxHQUFHO0FBQzlDLFlBQU0sb0NBQ0wsbUJBQW1CLGVBQWUsY0FDakMsZUFBZSxjQUFjLGdCQUUzQixlQUNBLEtBQUssVUFBVSxhQUFhO0FBQUEsUUFDN0IsTUFBTSxjQUFjLGNBQWM7QUFBQSxNQUNuQyxFQUFFLFFBQVEsR0FDVixPQUFPLENBQUMsT0FBTyxNQUFNLHVCQUF1QixHQUFHLE9BQU8sY0FBYyxDQUFDO0FBRXZFLCtCQUF5QjtBQUFBLFFBQ3hCO0FBQUEsUUFDQSxDQUFDLE1BQU0sMEJBQTBCLEVBQUUsTUFBTSxvQkFBb0IsRUFBRSxNQUFNO0FBQUEsTUFDdEUsR0FBRztBQUFBLElBQ0o7QUFFQSxVQUFNLHFDQUFxQyxLQUFLLFVBQVUsV0FBVyxFQUFFLCtCQUErQjtBQUN0RyxVQUFNLGdCQUFnQixJQUFJLDRCQUE0QjtBQUV0RCxlQUFXLFFBQVEsY0FBYztBQTRCaEMsVUFBSSxDQUFDLEtBQUsscUJBQXFCO0FBQzlCO0FBQUEsTUFDRDtBQUVBLFlBQU0sV0FBVywwQkFBMEIsS0FBSyxNQUFNLFlBQVksc0JBQXNCO0FBRXhGLFVBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxpQkFBaUI7QUFDMUM7QUFBQSxNQUNEO0FBRUEsWUFBTSxZQUNMLGNBQWMsbUJBQW1CLEtBQUssY0FBYyxLQUFLLGdDQUFnQyxrQ0FBa0MsS0FDMUgsUUFBUSxtQkFBbUIsV0FDekIsTUFBTSxjQUFjLGtCQUNwQjtBQUdKLFlBQU0sUUFBUSxLQUFLLG9CQUFvQixpQkFBaUI7QUFDeEQsWUFBTSxNQUFNLEtBQUssb0JBQW9CLGlCQUFpQjtBQUV0RCxZQUFNLG1CQUFtQixRQUFRLHFCQUFxQixzQkFBc0IsV0FBWSxRQUFRLHFCQUFxQixzQkFBc0Isb0JBQW9CO0FBRS9KLFVBQUksS0FBSyxNQUFNLG9CQUFvQixLQUFLLE1BQU0sZUFBZTtBQUM1RCxZQUFJLDBCQUEwQixrQkFBa0I7QUFFL0MsaUJBQU8sS0FBSyxNQUFNLGtCQUFrQixlQUFlLEVBQUU7QUFBQSxZQUNwRCxJQUFJO0FBQUEsY0FDSDtBQUFBLGNBQ0EsS0FBSyxvQkFBb0IsZUFBZSxFQUFFO0FBQUEsY0FDMUM7QUFBQSxjQUNBLElBQUksMEJBQTBCLE9BQU8sSUFBSSxNQUFNO0FBQUEsY0FDL0M7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUVEO0FBQ0E7QUFBQSxNQUNEO0FBRUEsWUFBTSxtQkFBbUIsS0FBSyw2QkFBNkIsR0FBRztBQUM5RCxZQUFNLHFCQUFxQixLQUFLO0FBQUEsUUFDL0IsS0FBSyxvQkFBb0IsaUJBQWlCO0FBQUEsTUFDM0M7QUFDQSxZQUFNLHFCQUFxQixLQUFLLElBQUksb0JBQW9CLGtCQUFrQixLQUFLLDhCQUE4QixDQUFDO0FBRTlHLFVBQUkscUNBQXFDO0FBR3pDLFlBQU0sa0JBQWtCLFFBQVE7QUFBQSxRQUMvQixLQUFLLFVBQVU7QUFBQSxVQUNkLEtBQUssb0JBQW9CO0FBQUEsUUFDMUI7QUFBQSxNQUNEO0FBQ0EsWUFBTSw4QkFBOEIsa0JBQWtCLEtBQUssb0JBQW9CLGNBQWM7QUFDN0YsVUFBSSw2QkFBNkI7QUFDaEMsNkNBQXFDO0FBQUEsTUFDdEM7QUFHQSxZQUFNLDhCQUE4QixLQUFLLElBQUksTUFBTSxZQUFZLGVBQWU7QUFDOUUsWUFBTSw0QkFBNEIsS0FBSyxJQUFJLElBQUksWUFBWSxhQUFhO0FBRXhFLFlBQU0sU0FBUyxxQ0FBcUMsSUFBSTtBQUV4RCxlQUFTLElBQUksNkJBQTZCLElBQUksNEJBQTRCLFFBQVEsS0FBSztBQUN0RixlQUFPLElBQUksZUFBZSxFQUFFO0FBQUEsVUFDM0IsSUFBSTtBQUFBLFlBQ0g7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBLE1BQU0sTUFBTSxhQUFhLE1BQU0sU0FBUztBQUFBLFlBQ3hDLE1BQU0sSUFBSSxhQUFhLElBQUksU0FBUztBQUFBLFVBQ3JDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLGtCQUFrQjtBQUNyQixZQUFJLE1BQU0sY0FBYyxtQkFBbUIscUJBQXFCLG9CQUFvQjtBQUNuRixpQkFBTyxNQUFNLGFBQWEsZUFBZSxFQUFFO0FBQUEsWUFDMUMsSUFBSTtBQUFBLGNBQ0g7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0EsSUFBSSwwQkFBMEIsT0FBTyxNQUFNLE1BQU07QUFBQSxjQUNqRDtBQUFBLGNBQ0E7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFFQSxZQUFJLElBQUksY0FBYyxpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUM3RSxpQkFBTyxJQUFJLGFBQWEsZUFBZSxFQUFFO0FBQUEsWUFDeEMsSUFBSTtBQUFBLGNBQ0g7QUFBQSxjQUNBO0FBQUEsY0FDQTtBQUFBLGNBQ0EsSUFBSSwwQkFBMEIsQ0FBQyxvQ0FBb0MsSUFBSSxNQUFNO0FBQUEsY0FDN0U7QUFBQSxjQUNBO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxlQUFXLFVBQVUsUUFBUTtBQUM1QixhQUFPLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxnQkFBZ0IsRUFBRSxhQUFhO0FBQUEsSUFDeEQ7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsNkJBQTZCLFVBQTRCO0FBQ2hFLFdBQ0MsY0FBYztBQUFBLE1BQ2IsS0FBSyxVQUFVLGVBQWUsU0FBUyxVQUFVO0FBQUEsTUFDakQsU0FBUztBQUFBLE1BQ1QsS0FBSyxVQUFVLFdBQVcsRUFBRTtBQUFBLElBQzdCLElBQUk7QUFBQSxFQUVOO0FBQUEsRUFFTyxxQkFDTixpQkFDQSxlQUNXO0FBQ1gsU0FBSyxrQkFBa0I7QUFDdkIsVUFBTSxZQUFZLEtBQUssVUFBVSxhQUFhO0FBRTlDLFFBQUksa0JBQWtCLEtBQUssa0JBQWtCLFdBQVc7QUFDdkQsWUFBTSxJQUFJLE1BQU0sbUNBQW1DO0FBQUEsSUFDcEQ7QUFDQSxRQUFJLGdCQUFnQixLQUFLLGdCQUFnQixXQUFXO0FBQ25ELFlBQU0sSUFBSSxNQUFNLGlDQUFpQztBQUFBLElBQ2xEO0FBRUEsVUFBTSxVQUFVLEtBQUssVUFBVSxXQUFXO0FBQzFDLFVBQU0sZUFBZSxLQUFLO0FBQUEsTUFDekIsS0FBSyxVQUFVLGNBQWM7QUFBQSxJQUM5QixFQUFFO0FBQ0YsVUFBTSxVQUFVLFFBQVEsZ0JBQWdCLGFBQWEsT0FBTztBQUU1RCxVQUFNLFNBQW1CLElBQUk7QUFBQSxNQUM1QixnQkFBZ0Isa0JBQWtCO0FBQUEsSUFDbkM7QUFFQSxRQUFJLHdCQUNIO0FBQ0QsUUFBSSx5QkFBeUI7QUFFN0IsUUFBSSx3QkFDSDtBQUNELFFBQUkseUJBQXlCO0FBRTdCLGFBQ0ssYUFBYSxpQkFDakIsY0FBYyxlQUNkLGNBQ0M7QUFDRCxZQUFNLGNBQWMsYUFBYTtBQUVqQyxZQUFNLGdCQUFnQixLQUFLLG9CQUFvQixhQUFhLENBQUM7QUFDN0QsVUFBSSxpQkFBaUIsR0FBRztBQUd2QixnQ0FBd0IsYUFBYTtBQUNyQyxpQ0FBeUI7QUFDekIsZUFBTyxXQUFXLElBQUksS0FBSyxLQUFLLGdCQUFnQixRQUFRLFVBQVU7QUFDbEU7QUFBQSxNQUNEO0FBRUEsVUFBSSwwQkFBMEIsSUFBSTtBQUNqQyxnQ0FBd0I7QUFDeEIsaUNBQXlCO0FBR3pCLGlCQUFTLFlBQVksYUFBYSxHQUFHLGFBQWEsR0FBRyxhQUFhO0FBQ2pFLGdCQUFNLFNBQVMsS0FBSyxvQkFBb0IsU0FBUztBQUNqRCxjQUFJLFVBQVUsR0FBRztBQUNoQixvQ0FBd0I7QUFDeEIscUNBQXlCO0FBQ3pCO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFDQywwQkFBMEIsT0FDekIsMEJBQTBCLE1BQU0sd0JBQXdCLGFBQWEsSUFDckU7QUFDRCxnQ0FBd0I7QUFDeEIsaUNBQXlCO0FBR3pCLGlCQUFTLFlBQVksWUFBWSxZQUFZLFdBQVcsYUFBYTtBQUNwRSxnQkFBTSxTQUFTLEtBQUssb0JBQW9CLFNBQVM7QUFDakQsY0FBSSxVQUFVLEdBQUc7QUFDaEIsb0NBQXdCO0FBQ3hCLHFDQUF5QjtBQUN6QjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLGFBQU8sV0FBVyxJQUFJLEtBQUs7QUFBQSxRQUMxQjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsaUNBQ1AsU0FDQSx3QkFDQSx3QkFDUztBQUNULFVBQU0sVUFBVSxLQUFLLFVBQVUsV0FBVztBQUUxQyxRQUFJLDJCQUEyQixNQUFNLDJCQUEyQixJQUFJO0FBRW5FLGFBQU87QUFBQSxJQUNSLFdBQVcseUJBQXlCLHdCQUF3QjtBQUUzRCxhQUFPLElBQUksS0FBSyxNQUFNLHlCQUF5QixRQUFRLFVBQVU7QUFBQSxJQUNsRSxXQUFXLDJCQUEyQix3QkFBd0I7QUFFN0QsYUFBTyxLQUFLLEtBQUsseUJBQXlCLFFBQVEsVUFBVTtBQUFBLElBQzdELE9BQU87QUFDTixVQUFJLFNBQVM7QUFFWixlQUFPLEtBQUssS0FBSyx5QkFBeUIsUUFBUSxVQUFVO0FBQUEsTUFDN0QsT0FBTztBQUVOLGVBQU8sSUFBSSxLQUFLLE1BQU0seUJBQXlCLFFBQVEsVUFBVTtBQUFBLE1BQ2xFO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sNEJBQTRCO0FBQUEsRUFBbEM7QUFDTixTQUFnQixrQkFBa0I7QUFBQTtBQUFBLEVBRWxDLG1CQUFtQixjQUFzQixnQ0FBd0Msb0NBQXFEO0FBQ3JJLFdBQU8sS0FBSywwQkFBMEIscUNBQXFDLGlDQUFpQyxZQUFZO0FBQUEsRUFDekg7QUFBQSxFQUVBLDBCQUEwQixPQUF1QjtBQUdoRCxXQUFPLDRCQUE0QixRQUFRLEVBQUU7QUFBQSxFQUM5QztBQUNEOyIsCiAgIm5hbWVzIjogWyJsaW5lTnVtYmVyIiwgImluZGVudCJdCn0K
