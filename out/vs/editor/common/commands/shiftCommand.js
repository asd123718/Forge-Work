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
import { CharCode } from "../../../base/common/charCode.js";
import * as strings from "../../../base/common/strings.js";
import { CursorColumns } from "../core/cursorColumns.js";
import { Range } from "../core/range.js";
import { Selection, SelectionDirection } from "../core/selection.js";
import { getEnterAction } from "../languages/enterAction.js";
import { ILanguageConfigurationService } from "../languages/languageConfigurationRegistry.js";
const repeatCache = /* @__PURE__ */ Object.create(null);
function cachedStringRepeat(str, count) {
  if (count <= 0) {
    return "";
  }
  if (!repeatCache[str]) {
    repeatCache[str] = ["", str];
  }
  const cache = repeatCache[str];
  for (let i = cache.length; i <= count; i++) {
    cache[i] = cache[i - 1] + str;
  }
  return cache[count];
}
let ShiftCommand = class {
  constructor(range, opts, _languageConfigurationService) {
    this._languageConfigurationService = _languageConfigurationService;
    this._opts = opts;
    this._selection = range;
    this._selectionId = null;
    this._useLastEditRangeForCursorEndPosition = false;
    this._selectionStartColumnStaysPut = false;
  }
  static unshiftIndent(line, column, tabSize, indentSize, insertSpaces) {
    const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);
    if (insertSpaces) {
      const indent = cachedStringRepeat(" ", indentSize);
      const desiredTabStop = CursorColumns.prevIndentTabStop(contentStartVisibleColumn, indentSize);
      const indentCount = desiredTabStop / indentSize;
      return cachedStringRepeat(indent, indentCount);
    } else {
      const indent = "	";
      const desiredTabStop = CursorColumns.prevRenderTabStop(contentStartVisibleColumn, tabSize);
      const indentCount = desiredTabStop / tabSize;
      return cachedStringRepeat(indent, indentCount);
    }
  }
  static shiftIndent(line, column, tabSize, indentSize, insertSpaces) {
    const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);
    if (insertSpaces) {
      const indent = cachedStringRepeat(" ", indentSize);
      const desiredTabStop = CursorColumns.nextIndentTabStop(contentStartVisibleColumn, indentSize);
      const indentCount = desiredTabStop / indentSize;
      return cachedStringRepeat(indent, indentCount);
    } else {
      const indent = "	";
      const desiredTabStop = CursorColumns.nextRenderTabStop(contentStartVisibleColumn, tabSize);
      const indentCount = desiredTabStop / tabSize;
      return cachedStringRepeat(indent, indentCount);
    }
  }
  _addEditOperation(builder, range, text) {
    if (this._useLastEditRangeForCursorEndPosition) {
      builder.addTrackedEditOperation(range, text);
    } else {
      builder.addEditOperation(range, text);
    }
  }
  getEditOperations(model, builder) {
    const startLine = this._selection.startLineNumber;
    let endLine = this._selection.endLineNumber;
    if (this._selection.endColumn === 1 && startLine !== endLine) {
      endLine = endLine - 1;
    }
    const { tabSize, indentSize, insertSpaces } = this._opts;
    const shouldIndentEmptyLines = startLine === endLine;
    if (this._opts.useTabStops) {
      if (this._selection.isEmpty()) {
        if (/^\s*$/.test(model.getLineContent(startLine))) {
          this._useLastEditRangeForCursorEndPosition = true;
        }
      }
      let previousLineExtraSpaces = 0, extraSpaces = 0;
      for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++, previousLineExtraSpaces = extraSpaces) {
        extraSpaces = 0;
        const lineText = model.getLineContent(lineNumber);
        let indentationEndIndex = strings.firstNonWhitespaceIndex(lineText);
        if (this._opts.isUnshift && (lineText.length === 0 || indentationEndIndex === 0)) {
          continue;
        }
        if (!shouldIndentEmptyLines && !this._opts.isUnshift && lineText.length === 0) {
          continue;
        }
        if (indentationEndIndex === -1) {
          indentationEndIndex = lineText.length;
        }
        if (lineNumber > 1) {
          const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(lineText, indentationEndIndex + 1, tabSize);
          if (contentStartVisibleColumn % indentSize !== 0) {
            if (model.tokenization.isCheapToTokenize(lineNumber - 1)) {
              const enterAction = getEnterAction(this._opts.autoIndent, model, new Range(lineNumber - 1, model.getLineMaxColumn(lineNumber - 1), lineNumber - 1, model.getLineMaxColumn(lineNumber - 1)), this._languageConfigurationService);
              if (enterAction) {
                extraSpaces = previousLineExtraSpaces;
                if (enterAction.appendText) {
                  for (let j = 0, lenJ = enterAction.appendText.length; j < lenJ && extraSpaces < indentSize; j++) {
                    if (enterAction.appendText.charCodeAt(j) === CharCode.Space) {
                      extraSpaces++;
                    } else {
                      break;
                    }
                  }
                }
                if (enterAction.removeText) {
                  extraSpaces = Math.max(0, extraSpaces - enterAction.removeText);
                }
                for (let j = 0; j < extraSpaces; j++) {
                  if (indentationEndIndex === 0 || lineText.charCodeAt(indentationEndIndex - 1) !== CharCode.Space) {
                    break;
                  }
                  indentationEndIndex--;
                }
              }
            }
          }
        }
        if (this._opts.isUnshift && indentationEndIndex === 0) {
          continue;
        }
        let desiredIndent;
        if (this._opts.isUnshift) {
          desiredIndent = ShiftCommand.unshiftIndent(lineText, indentationEndIndex + 1, tabSize, indentSize, insertSpaces);
        } else {
          desiredIndent = ShiftCommand.shiftIndent(lineText, indentationEndIndex + 1, tabSize, indentSize, insertSpaces);
        }
        this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), desiredIndent);
        if (lineNumber === startLine && !this._selection.isEmpty()) {
          this._selectionStartColumnStaysPut = this._selection.startColumn <= indentationEndIndex + 1;
        }
      }
    } else {
      if (!this._opts.isUnshift && this._selection.isEmpty() && model.getLineLength(startLine) === 0) {
        this._useLastEditRangeForCursorEndPosition = true;
      }
      const oneIndent = insertSpaces ? cachedStringRepeat(" ", indentSize) : "	";
      for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
        const lineText = model.getLineContent(lineNumber);
        let indentationEndIndex = strings.firstNonWhitespaceIndex(lineText);
        if (this._opts.isUnshift && (lineText.length === 0 || indentationEndIndex === 0)) {
          continue;
        }
        if (!shouldIndentEmptyLines && !this._opts.isUnshift && lineText.length === 0) {
          continue;
        }
        if (indentationEndIndex === -1) {
          indentationEndIndex = lineText.length;
        }
        if (this._opts.isUnshift && indentationEndIndex === 0) {
          continue;
        }
        if (this._opts.isUnshift) {
          indentationEndIndex = Math.min(indentationEndIndex, indentSize);
          for (let i = 0; i < indentationEndIndex; i++) {
            const chr = lineText.charCodeAt(i);
            if (chr === CharCode.Tab) {
              indentationEndIndex = i + 1;
              break;
            }
          }
          this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), "");
        } else {
          this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, 1), oneIndent);
          if (lineNumber === startLine && !this._selection.isEmpty()) {
            this._selectionStartColumnStaysPut = this._selection.startColumn === 1;
          }
        }
      }
    }
    this._selectionId = builder.trackSelection(this._selection);
  }
  computeCursorState(model, helper) {
    if (this._useLastEditRangeForCursorEndPosition) {
      const lastOp = helper.getInverseEditOperations()[0];
      return new Selection(lastOp.range.endLineNumber, lastOp.range.endColumn, lastOp.range.endLineNumber, lastOp.range.endColumn);
    }
    const result = helper.getTrackedSelection(this._selectionId);
    if (this._selectionStartColumnStaysPut) {
      const initialStartColumn = this._selection.startColumn;
      const resultStartColumn = result.startColumn;
      if (resultStartColumn <= initialStartColumn) {
        return result;
      }
      if (result.getDirection() === SelectionDirection.LTR) {
        return new Selection(result.startLineNumber, initialStartColumn, result.endLineNumber, result.endColumn);
      }
      return new Selection(result.endLineNumber, result.endColumn, result.startLineNumber, initialStartColumn);
    }
    return result;
  }
};
ShiftCommand = __decorateClass([
  __decorateParam(2, ILanguageConfigurationService)
], ShiftCommand);
export {
  ShiftCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcY29tbWFuZHNcXHNoaWZ0Q29tbWFuZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IEN1cnNvckNvbHVtbnMgfSBmcm9tICcuLi9jb3JlL2N1cnNvckNvbHVtbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiwgU2VsZWN0aW9uRGlyZWN0aW9uIH0gZnJvbSAnLi4vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmQsIElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSwgSUVkaXRPcGVyYXRpb25CdWlsZGVyIH0gZnJvbSAnLi4vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kgfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRFbnRlckFjdGlvbiB9IGZyb20gJy4uL2xhbmd1YWdlcy9lbnRlckFjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNoaWZ0Q29tbWFuZE9wdHMge1xuXHRpc1Vuc2hpZnQ6IGJvb2xlYW47XG5cdHRhYlNpemU6IG51bWJlcjtcblx0aW5kZW50U2l6ZTogbnVtYmVyO1xuXHRpbnNlcnRTcGFjZXM6IGJvb2xlYW47XG5cdHVzZVRhYlN0b3BzOiBib29sZWFuO1xuXHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3k7XG59XG5cbmNvbnN0IHJlcGVhdENhY2hlOiB7IFtzdHI6IHN0cmluZ106IHN0cmluZ1tdIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuZnVuY3Rpb24gY2FjaGVkU3RyaW5nUmVwZWF0KHN0cjogc3RyaW5nLCBjb3VudDogbnVtYmVyKTogc3RyaW5nIHtcblx0aWYgKGNvdW50IDw9IDApIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0aWYgKCFyZXBlYXRDYWNoZVtzdHJdKSB7XG5cdFx0cmVwZWF0Q2FjaGVbc3RyXSA9IFsnJywgc3RyXTtcblx0fVxuXHRjb25zdCBjYWNoZSA9IHJlcGVhdENhY2hlW3N0cl07XG5cdGZvciAobGV0IGkgPSBjYWNoZS5sZW5ndGg7IGkgPD0gY291bnQ7IGkrKykge1xuXHRcdGNhY2hlW2ldID0gY2FjaGVbaSAtIDFdICsgc3RyO1xuXHR9XG5cdHJldHVybiBjYWNoZVtjb3VudF07XG59XG5cbmV4cG9ydCBjbGFzcyBTaGlmdENvbW1hbmQgaW1wbGVtZW50cyBJQ29tbWFuZCB7XG5cblx0cHVibGljIHN0YXRpYyB1bnNoaWZ0SW5kZW50KGxpbmU6IHN0cmluZywgY29sdW1uOiBudW1iZXIsIHRhYlNpemU6IG51bWJlciwgaW5kZW50U2l6ZTogbnVtYmVyLCBpbnNlcnRTcGFjZXM6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdC8vIERldGVybWluZSB0aGUgdmlzaWJsZSBjb2x1bW4gd2hlcmUgdGhlIGNvbnRlbnQgc3RhcnRzXG5cdFx0Y29uc3QgY29udGVudFN0YXJ0VmlzaWJsZUNvbHVtbiA9IEN1cnNvckNvbHVtbnMudmlzaWJsZUNvbHVtbkZyb21Db2x1bW4obGluZSwgY29sdW1uLCB0YWJTaXplKTtcblxuXHRcdGlmIChpbnNlcnRTcGFjZXMpIHtcblx0XHRcdGNvbnN0IGluZGVudCA9IGNhY2hlZFN0cmluZ1JlcGVhdCgnICcsIGluZGVudFNpemUpO1xuXHRcdFx0Y29uc3QgZGVzaXJlZFRhYlN0b3AgPSBDdXJzb3JDb2x1bW5zLnByZXZJbmRlbnRUYWJTdG9wKGNvbnRlbnRTdGFydFZpc2libGVDb2x1bW4sIGluZGVudFNpemUpO1xuXHRcdFx0Y29uc3QgaW5kZW50Q291bnQgPSBkZXNpcmVkVGFiU3RvcCAvIGluZGVudFNpemU7IC8vIHdpbGwgYmUgYW4gaW50ZWdlclxuXHRcdFx0cmV0dXJuIGNhY2hlZFN0cmluZ1JlcGVhdChpbmRlbnQsIGluZGVudENvdW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaW5kZW50ID0gJ1xcdCc7XG5cdFx0XHRjb25zdCBkZXNpcmVkVGFiU3RvcCA9IEN1cnNvckNvbHVtbnMucHJldlJlbmRlclRhYlN0b3AoY29udGVudFN0YXJ0VmlzaWJsZUNvbHVtbiwgdGFiU2l6ZSk7XG5cdFx0XHRjb25zdCBpbmRlbnRDb3VudCA9IGRlc2lyZWRUYWJTdG9wIC8gdGFiU2l6ZTsgLy8gd2lsbCBiZSBhbiBpbnRlZ2VyXG5cdFx0XHRyZXR1cm4gY2FjaGVkU3RyaW5nUmVwZWF0KGluZGVudCwgaW5kZW50Q291bnQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2hpZnRJbmRlbnQobGluZTogc3RyaW5nLCBjb2x1bW46IG51bWJlciwgdGFiU2l6ZTogbnVtYmVyLCBpbmRlbnRTaXplOiBudW1iZXIsIGluc2VydFNwYWNlczogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0Ly8gRGV0ZXJtaW5lIHRoZSB2aXNpYmxlIGNvbHVtbiB3aGVyZSB0aGUgY29udGVudCBzdGFydHNcblx0XHRjb25zdCBjb250ZW50U3RhcnRWaXNpYmxlQ29sdW1uID0gQ3Vyc29yQ29sdW1ucy52aXNpYmxlQ29sdW1uRnJvbUNvbHVtbihsaW5lLCBjb2x1bW4sIHRhYlNpemUpO1xuXG5cdFx0aWYgKGluc2VydFNwYWNlcykge1xuXHRcdFx0Y29uc3QgaW5kZW50ID0gY2FjaGVkU3RyaW5nUmVwZWF0KCcgJywgaW5kZW50U2l6ZSk7XG5cdFx0XHRjb25zdCBkZXNpcmVkVGFiU3RvcCA9IEN1cnNvckNvbHVtbnMubmV4dEluZGVudFRhYlN0b3AoY29udGVudFN0YXJ0VmlzaWJsZUNvbHVtbiwgaW5kZW50U2l6ZSk7XG5cdFx0XHRjb25zdCBpbmRlbnRDb3VudCA9IGRlc2lyZWRUYWJTdG9wIC8gaW5kZW50U2l6ZTsgLy8gd2lsbCBiZSBhbiBpbnRlZ2VyXG5cdFx0XHRyZXR1cm4gY2FjaGVkU3RyaW5nUmVwZWF0KGluZGVudCwgaW5kZW50Q291bnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBpbmRlbnQgPSAnXFx0Jztcblx0XHRcdGNvbnN0IGRlc2lyZWRUYWJTdG9wID0gQ3Vyc29yQ29sdW1ucy5uZXh0UmVuZGVyVGFiU3RvcChjb250ZW50U3RhcnRWaXNpYmxlQ29sdW1uLCB0YWJTaXplKTtcblx0XHRcdGNvbnN0IGluZGVudENvdW50ID0gZGVzaXJlZFRhYlN0b3AgLyB0YWJTaXplOyAvLyB3aWxsIGJlIGFuIGludGVnZXJcblx0XHRcdHJldHVybiBjYWNoZWRTdHJpbmdSZXBlYXQoaW5kZW50LCBpbmRlbnRDb3VudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3B0czogSVNoaWZ0Q29tbWFuZE9wdHM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbjogU2VsZWN0aW9uO1xuXHRwcml2YXRlIF9zZWxlY3Rpb25JZDogc3RyaW5nIHwgbnVsbDtcblx0cHJpdmF0ZSBfdXNlTGFzdEVkaXRSYW5nZUZvckN1cnNvckVuZFBvc2l0aW9uOiBib29sZWFuO1xuXHRwcml2YXRlIF9zZWxlY3Rpb25TdGFydENvbHVtblN0YXlzUHV0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJhbmdlOiBTZWxlY3Rpb24sXG5cdFx0b3B0czogSVNoaWZ0Q29tbWFuZE9wdHMsXG5cdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX29wdHMgPSBvcHRzO1xuXHRcdHRoaXMuX3NlbGVjdGlvbiA9IHJhbmdlO1xuXHRcdHRoaXMuX3NlbGVjdGlvbklkID0gbnVsbDtcblx0XHR0aGlzLl91c2VMYXN0RWRpdFJhbmdlRm9yQ3Vyc29yRW5kUG9zaXRpb24gPSBmYWxzZTtcblx0XHR0aGlzLl9zZWxlY3Rpb25TdGFydENvbHVtblN0YXlzUHV0ID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRFZGl0T3BlcmF0aW9uKGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlciwgcmFuZ2U6IFJhbmdlLCB0ZXh0OiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fdXNlTGFzdEVkaXRSYW5nZUZvckN1cnNvckVuZFBvc2l0aW9uKSB7XG5cdFx0XHRidWlsZGVyLmFkZFRyYWNrZWRFZGl0T3BlcmF0aW9uKHJhbmdlLCB0ZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKHJhbmdlLCB0ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWRpdE9wZXJhdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlcik6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXJ0TGluZSA9IHRoaXMuX3NlbGVjdGlvbi5zdGFydExpbmVOdW1iZXI7XG5cblx0XHRsZXQgZW5kTGluZSA9IHRoaXMuX3NlbGVjdGlvbi5lbmRMaW5lTnVtYmVyO1xuXHRcdGlmICh0aGlzLl9zZWxlY3Rpb24uZW5kQ29sdW1uID09PSAxICYmIHN0YXJ0TGluZSAhPT0gZW5kTGluZSkge1xuXHRcdFx0ZW5kTGluZSA9IGVuZExpbmUgLSAxO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdGFiU2l6ZSwgaW5kZW50U2l6ZSwgaW5zZXJ0U3BhY2VzIH0gPSB0aGlzLl9vcHRzO1xuXHRcdGNvbnN0IHNob3VsZEluZGVudEVtcHR5TGluZXMgPSAoc3RhcnRMaW5lID09PSBlbmRMaW5lKTtcblxuXHRcdGlmICh0aGlzLl9vcHRzLnVzZVRhYlN0b3BzKSB7XG5cdFx0XHQvLyBpZiBpbmRlbnRpbmcgb3Igb3V0ZGVudGluZyBvbiBhIHdoaXRlc3BhY2Ugb25seSBsaW5lXG5cdFx0XHRpZiAodGhpcy5fc2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRpZiAoL15cXHMqJC8udGVzdChtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmUpKSkge1xuXHRcdFx0XHRcdHRoaXMuX3VzZUxhc3RFZGl0UmFuZ2VGb3JDdXJzb3JFbmRQb3NpdGlvbiA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8ga2VlcCB0cmFjayBvZiBwcmV2aW91cyBsaW5lJ3MgXCJtaXNzLWFsaWdubWVudFwiXG5cdFx0XHRsZXQgcHJldmlvdXNMaW5lRXh0cmFTcGFjZXMgPSAwLCBleHRyYVNwYWNlcyA9IDA7XG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lOyBsaW5lTnVtYmVyIDw9IGVuZExpbmU7IGxpbmVOdW1iZXIrKywgcHJldmlvdXNMaW5lRXh0cmFTcGFjZXMgPSBleHRyYVNwYWNlcykge1xuXHRcdFx0XHRleHRyYVNwYWNlcyA9IDA7XG5cdFx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHRcdGxldCBpbmRlbnRhdGlvbkVuZEluZGV4ID0gc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lVGV4dCk7XG5cblx0XHRcdFx0aWYgKHRoaXMuX29wdHMuaXNVbnNoaWZ0ICYmIChsaW5lVGV4dC5sZW5ndGggPT09IDAgfHwgaW5kZW50YXRpb25FbmRJbmRleCA9PT0gMCkpIHtcblx0XHRcdFx0XHQvLyBlbXB0eSBsaW5lIG9yIGxpbmUgd2l0aCBubyBsZWFkaW5nIHdoaXRlc3BhY2UgPT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFzaG91bGRJbmRlbnRFbXB0eUxpbmVzICYmICF0aGlzLl9vcHRzLmlzVW5zaGlmdCAmJiBsaW5lVGV4dC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyBkbyBub3QgaW5kZW50IGVtcHR5IGxpbmVzID0+IG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpbmRlbnRhdGlvbkVuZEluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdC8vIHRoZSBlbnRpcmUgbGluZSBpcyB3aGl0ZXNwYWNlXG5cdFx0XHRcdFx0aW5kZW50YXRpb25FbmRJbmRleCA9IGxpbmVUZXh0Lmxlbmd0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChsaW5lTnVtYmVyID4gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnRTdGFydFZpc2libGVDb2x1bW4gPSBDdXJzb3JDb2x1bW5zLnZpc2libGVDb2x1bW5Gcm9tQ29sdW1uKGxpbmVUZXh0LCBpbmRlbnRhdGlvbkVuZEluZGV4ICsgMSwgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0aWYgKGNvbnRlbnRTdGFydFZpc2libGVDb2x1bW4gJSBpbmRlbnRTaXplICE9PSAwKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGUgY3VycmVudCBsaW5lIGlzIFwibWlzcy1hbGlnbmVkXCIsIHNvIGxldCdzIHNlZSBpZiB0aGlzIGlzIGV4cGVjdGVkLi4uXG5cdFx0XHRcdFx0XHQvLyBUaGlzIGNhbiBvbmx5IGhhcHBlbiB3aGVuIGl0IGhhcyB0cmFpbGluZyBjb21tYXMgaW4gdGhlIGluZGVudFxuXHRcdFx0XHRcdFx0aWYgKG1vZGVsLnRva2VuaXphdGlvbi5pc0NoZWFwVG9Ub2tlbml6ZShsaW5lTnVtYmVyIC0gMSkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZW50ZXJBY3Rpb24gPSBnZXRFbnRlckFjdGlvbih0aGlzLl9vcHRzLmF1dG9JbmRlbnQsIG1vZGVsLCBuZXcgUmFuZ2UobGluZU51bWJlciAtIDEsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlciAtIDEpLCBsaW5lTnVtYmVyIC0gMSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyIC0gMSkpLCB0aGlzLl9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0XHRcdFx0aWYgKGVudGVyQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZXh0cmFTcGFjZXMgPSBwcmV2aW91c0xpbmVFeHRyYVNwYWNlcztcblx0XHRcdFx0XHRcdFx0XHRpZiAoZW50ZXJBY3Rpb24uYXBwZW5kVGV4dCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSBlbnRlckFjdGlvbi5hcHBlbmRUZXh0Lmxlbmd0aDsgaiA8IGxlbkogJiYgZXh0cmFTcGFjZXMgPCBpbmRlbnRTaXplOyBqKyspIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKGVudGVyQWN0aW9uLmFwcGVuZFRleHQuY2hhckNvZGVBdChqKSA9PT0gQ2hhckNvZGUuU3BhY2UpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRleHRyYVNwYWNlcysrO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlmIChlbnRlckFjdGlvbi5yZW1vdmVUZXh0KSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRleHRyYVNwYWNlcyA9IE1hdGgubWF4KDAsIGV4dHJhU3BhY2VzIC0gZW50ZXJBY3Rpb24ucmVtb3ZlVGV4dCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gQWN0IGFzIGlmIGBwcmVmaXhTcGFjZXNgIGlzIG5vdCBwYXJ0IG9mIHRoZSBpbmRlbnRhdGlvblxuXHRcdFx0XHRcdFx0XHRcdGZvciAobGV0IGogPSAwOyBqIDwgZXh0cmFTcGFjZXM7IGorKykge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGluZGVudGF0aW9uRW5kSW5kZXggPT09IDAgfHwgbGluZVRleHQuY2hhckNvZGVBdChpbmRlbnRhdGlvbkVuZEluZGV4IC0gMSkgIT09IENoYXJDb2RlLlNwYWNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0aW5kZW50YXRpb25FbmRJbmRleC0tO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0aWYgKHRoaXMuX29wdHMuaXNVbnNoaWZ0ICYmIGluZGVudGF0aW9uRW5kSW5kZXggPT09IDApIHtcblx0XHRcdFx0XHQvLyBsaW5lIHdpdGggbm8gbGVhZGluZyB3aGl0ZXNwYWNlID0+IG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBkZXNpcmVkSW5kZW50OiBzdHJpbmc7XG5cdFx0XHRcdGlmICh0aGlzLl9vcHRzLmlzVW5zaGlmdCkge1xuXHRcdFx0XHRcdGRlc2lyZWRJbmRlbnQgPSBTaGlmdENvbW1hbmQudW5zaGlmdEluZGVudChsaW5lVGV4dCwgaW5kZW50YXRpb25FbmRJbmRleCArIDEsIHRhYlNpemUsIGluZGVudFNpemUsIGluc2VydFNwYWNlcyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVzaXJlZEluZGVudCA9IFNoaWZ0Q29tbWFuZC5zaGlmdEluZGVudChsaW5lVGV4dCwgaW5kZW50YXRpb25FbmRJbmRleCArIDEsIHRhYlNpemUsIGluZGVudFNpemUsIGluc2VydFNwYWNlcyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9hZGRFZGl0T3BlcmF0aW9uKGJ1aWxkZXIsIG5ldyBSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCBpbmRlbnRhdGlvbkVuZEluZGV4ICsgMSksIGRlc2lyZWRJbmRlbnQpO1xuXHRcdFx0XHRpZiAobGluZU51bWJlciA9PT0gc3RhcnRMaW5lICYmICF0aGlzLl9zZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0Ly8gRm9yY2UgdGhlIHN0YXJ0Q29sdW1uIHRvIHN0YXkgcHV0IGJlY2F1c2Ugd2UncmUgaW5zZXJ0aW5nIGFmdGVyIGl0XG5cdFx0XHRcdFx0dGhpcy5fc2VsZWN0aW9uU3RhcnRDb2x1bW5TdGF5c1B1dCA9ICh0aGlzLl9zZWxlY3Rpb24uc3RhcnRDb2x1bW4gPD0gaW5kZW50YXRpb25FbmRJbmRleCArIDEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0Ly8gaWYgaW5kZW50aW5nIG9yIG91dGRlbnRpbmcgb24gYSB3aGl0ZXNwYWNlIG9ubHkgbGluZVxuXHRcdFx0aWYgKCF0aGlzLl9vcHRzLmlzVW5zaGlmdCAmJiB0aGlzLl9zZWxlY3Rpb24uaXNFbXB0eSgpICYmIG1vZGVsLmdldExpbmVMZW5ndGgoc3RhcnRMaW5lKSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl91c2VMYXN0RWRpdFJhbmdlRm9yQ3Vyc29yRW5kUG9zaXRpb24gPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvbmVJbmRlbnQgPSAoaW5zZXJ0U3BhY2VzID8gY2FjaGVkU3RyaW5nUmVwZWF0KCcgJywgaW5kZW50U2l6ZSkgOiAnXFx0Jyk7XG5cblx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzdGFydExpbmU7IGxpbmVOdW1iZXIgPD0gZW5kTGluZTsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHRcdGxldCBpbmRlbnRhdGlvbkVuZEluZGV4ID0gc3RyaW5ncy5maXJzdE5vbldoaXRlc3BhY2VJbmRleChsaW5lVGV4dCk7XG5cblx0XHRcdFx0aWYgKHRoaXMuX29wdHMuaXNVbnNoaWZ0ICYmIChsaW5lVGV4dC5sZW5ndGggPT09IDAgfHwgaW5kZW50YXRpb25FbmRJbmRleCA9PT0gMCkpIHtcblx0XHRcdFx0XHQvLyBlbXB0eSBsaW5lIG9yIGxpbmUgd2l0aCBubyBsZWFkaW5nIHdoaXRlc3BhY2UgPT4gbm90aGluZyB0byBkb1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFzaG91bGRJbmRlbnRFbXB0eUxpbmVzICYmICF0aGlzLl9vcHRzLmlzVW5zaGlmdCAmJiBsaW5lVGV4dC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyBkbyBub3QgaW5kZW50IGVtcHR5IGxpbmVzID0+IG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpbmRlbnRhdGlvbkVuZEluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdC8vIHRoZSBlbnRpcmUgbGluZSBpcyB3aGl0ZXNwYWNlXG5cdFx0XHRcdFx0aW5kZW50YXRpb25FbmRJbmRleCA9IGxpbmVUZXh0Lmxlbmd0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl9vcHRzLmlzVW5zaGlmdCAmJiBpbmRlbnRhdGlvbkVuZEluZGV4ID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gbGluZSB3aXRoIG5vIGxlYWRpbmcgd2hpdGVzcGFjZSA9PiBub3RoaW5nIHRvIGRvXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5fb3B0cy5pc1Vuc2hpZnQpIHtcblxuXHRcdFx0XHRcdGluZGVudGF0aW9uRW5kSW5kZXggPSBNYXRoLm1pbihpbmRlbnRhdGlvbkVuZEluZGV4LCBpbmRlbnRTaXplKTtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGluZGVudGF0aW9uRW5kSW5kZXg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hyID0gbGluZVRleHQuY2hhckNvZGVBdChpKTtcblx0XHRcdFx0XHRcdGlmIChjaHIgPT09IENoYXJDb2RlLlRhYikge1xuXHRcdFx0XHRcdFx0XHRpbmRlbnRhdGlvbkVuZEluZGV4ID0gaSArIDE7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX2FkZEVkaXRPcGVyYXRpb24oYnVpbGRlciwgbmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIGluZGVudGF0aW9uRW5kSW5kZXggKyAxKSwgJycpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2FkZEVkaXRPcGVyYXRpb24oYnVpbGRlciwgbmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIDEpLCBvbmVJbmRlbnQpO1xuXHRcdFx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBzdGFydExpbmUgJiYgIXRoaXMuX3NlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdC8vIEZvcmNlIHRoZSBzdGFydENvbHVtbiB0byBzdGF5IHB1dCBiZWNhdXNlIHdlJ3JlIGluc2VydGluZyBhZnRlciBpdFxuXHRcdFx0XHRcdFx0dGhpcy5fc2VsZWN0aW9uU3RhcnRDb2x1bW5TdGF5c1B1dCA9ICh0aGlzLl9zZWxlY3Rpb24uc3RhcnRDb2x1bW4gPT09IDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3NlbGVjdGlvbklkID0gYnVpbGRlci50cmFja1NlbGVjdGlvbih0aGlzLl9zZWxlY3Rpb24pO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGVDdXJzb3JTdGF0ZShtb2RlbDogSVRleHRNb2RlbCwgaGVscGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEpOiBTZWxlY3Rpb24ge1xuXHRcdGlmICh0aGlzLl91c2VMYXN0RWRpdFJhbmdlRm9yQ3Vyc29yRW5kUG9zaXRpb24pIHtcblx0XHRcdGNvbnN0IGxhc3RPcCA9IGhlbHBlci5nZXRJbnZlcnNlRWRpdE9wZXJhdGlvbnMoKVswXTtcblx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKGxhc3RPcC5yYW5nZS5lbmRMaW5lTnVtYmVyLCBsYXN0T3AucmFuZ2UuZW5kQ29sdW1uLCBsYXN0T3AucmFuZ2UuZW5kTGluZU51bWJlciwgbGFzdE9wLnJhbmdlLmVuZENvbHVtbik7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGhlbHBlci5nZXRUcmFja2VkU2VsZWN0aW9uKHRoaXMuX3NlbGVjdGlvbklkISk7XG5cblx0XHRpZiAodGhpcy5fc2VsZWN0aW9uU3RhcnRDb2x1bW5TdGF5c1B1dCkge1xuXHRcdFx0Ly8gVGhlIHNlbGVjdGlvbiBzdGFydCBzaG91bGQgbm90IG1vdmVcblx0XHRcdGNvbnN0IGluaXRpYWxTdGFydENvbHVtbiA9IHRoaXMuX3NlbGVjdGlvbi5zdGFydENvbHVtbjtcblx0XHRcdGNvbnN0IHJlc3VsdFN0YXJ0Q29sdW1uID0gcmVzdWx0LnN0YXJ0Q29sdW1uO1xuXHRcdFx0aWYgKHJlc3VsdFN0YXJ0Q29sdW1uIDw9IGluaXRpYWxTdGFydENvbHVtbikge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzdWx0LmdldERpcmVjdGlvbigpID09PSBTZWxlY3Rpb25EaXJlY3Rpb24uTFRSKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKHJlc3VsdC5zdGFydExpbmVOdW1iZXIsIGluaXRpYWxTdGFydENvbHVtbiwgcmVzdWx0LmVuZExpbmVOdW1iZXIsIHJlc3VsdC5lbmRDb2x1bW4pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24ocmVzdWx0LmVuZExpbmVOdW1iZXIsIHJlc3VsdC5lbmRDb2x1bW4sIHJlc3VsdC5zdGFydExpbmVOdW1iZXIsIGluaXRpYWxTdGFydENvbHVtbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLGFBQWE7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVywwQkFBMEI7QUFJOUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQ0FBcUM7QUFXOUMsTUFBTSxjQUEyQyx1QkFBTyxPQUFPLElBQUk7QUFDbkUsU0FBUyxtQkFBbUIsS0FBYSxPQUF1QjtBQUMvRCxNQUFJLFNBQVMsR0FBRztBQUNmLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxDQUFDLFlBQVksR0FBRyxHQUFHO0FBQ3RCLGdCQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksR0FBRztBQUFBLEVBQzVCO0FBQ0EsUUFBTSxRQUFRLFlBQVksR0FBRztBQUM3QixXQUFTLElBQUksTUFBTSxRQUFRLEtBQUssT0FBTyxLQUFLO0FBQzNDLFVBQU0sQ0FBQyxJQUFJLE1BQU0sSUFBSSxDQUFDLElBQUk7QUFBQSxFQUMzQjtBQUNBLFNBQU8sTUFBTSxL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
