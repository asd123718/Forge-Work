import { CharCode } from "../../../../base/common/charCode.js";
import * as strings from "../../../../base/common/strings.js";
import { Constants } from "../../../../base/common/uint.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { BlockCommentCommand } from "./blockCommentCommand.js";
var Type = /* @__PURE__ */ ((Type2) => {
  Type2[Type2["Toggle"] = 0] = "Toggle";
  Type2[Type2["ForceAdd"] = 1] = "ForceAdd";
  Type2[Type2["ForceRemove"] = 2] = "ForceRemove";
  return Type2;
})(Type || {});
class LineCommentCommand {
  constructor(languageConfigurationService, selection, indentSize, type, insertSpace, ignoreEmptyLines, ignoreFirstLine) {
    this.languageConfigurationService = languageConfigurationService;
    this._selection = selection;
    this._indentSize = indentSize;
    this._type = type;
    this._insertSpace = insertSpace;
    this._selectionId = null;
    this._deltaColumn = 0;
    this._moveEndPositionDown = false;
    this._ignoreEmptyLines = ignoreEmptyLines;
    this._ignoreFirstLine = ignoreFirstLine || false;
  }
  /**
   * Do an initial pass over the lines and gather info about the line comment string.
   * Returns null if any of the lines doesn't support a line comment string.
   */
  static _gatherPreflightCommentStrings(model, startLineNumber, endLineNumber, languageConfigurationService) {
    model.tokenization.tokenizeIfCheap(startLineNumber);
    const languageId = model.getLanguageIdAtPosition(startLineNumber, 1);
    const config = languageConfigurationService.getLanguageConfiguration(languageId).comments;
    const commentStr = config ? config.lineCommentToken : null;
    if (!commentStr) {
      return null;
    }
    const lines = [];
    for (let i = 0, lineCount = endLineNumber - startLineNumber + 1; i < lineCount; i++) {
      lines[i] = {
        ignore: false,
        commentStr,
        commentStrOffset: 0,
        commentStrLength: commentStr.length
      };
    }
    return lines;
  }
  /**
   * Analyze lines and decide which lines are relevant and what the toggle should do.
   * Also, build up several offsets and lengths useful in the generation of editor operations.
   */
  static _analyzeLines(type, insertSpace, model, lines, startLineNumber, ignoreEmptyLines, ignoreFirstLine, languageConfigurationService, languageId) {
    let onlyWhitespaceLines = true;
    const config = languageConfigurationService.getLanguageConfiguration(languageId).comments;
    const lineCommentNoIndent = config?.lineCommentNoIndent ?? false;
    let shouldRemoveComments;
    if (type === 0 /* Toggle */) {
      shouldRemoveComments = true;
    } else if (type === 1 /* ForceAdd */) {
      shouldRemoveComments = false;
    } else {
      shouldRemoveComments = true;
    }
    for (let i = 0, lineCount = lines.length; i < lineCount; i++) {
      const lineData = lines[i];
      const lineNumber = startLineNumber + i;
      if (lineNumber === startLineNumber && ignoreFirstLine) {
        lineData.ignore = true;
        continue;
      }
      const lineContent = model.getLineContent(lineNumber);
      const lineContentStartOffset = strings.firstNonWhitespaceIndex(lineContent);
      if (lineContentStartOffset === -1) {
        lineData.ignore = ignoreEmptyLines;
        lineData.commentStrOffset = lineCommentNoIndent ? 0 : lineContent.length;
        continue;
      }
      onlyWhitespaceLines = false;
      const offset = lineCommentNoIndent ? 0 : lineContentStartOffset;
      lineData.ignore = false;
      lineData.commentStrOffset = offset;
      if (shouldRemoveComments && !BlockCommentCommand._haystackHasNeedleAtOffset(lineContent, lineData.commentStr, offset)) {
        if (type === 0 /* Toggle */) {
          shouldRemoveComments = false;
        } else if (type === 1 /* ForceAdd */) {
        } else {
          lineData.ignore = true;
        }
      }
      if (shouldRemoveComments && insertSpace) {
        const commentStrEndOffset = lineContentStartOffset + lineData.commentStrLength;
        if (commentStrEndOffset < lineContent.length && lineContent.charCodeAt(commentStrEndOffset) === CharCode.Space) {
          lineData.commentStrLength += 1;
        }
      }
    }
    if (type === 0 /* Toggle */ && onlyWhitespaceLines) {
      shouldRemoveComments = false;
      for (let i = 0, lineCount = lines.length; i < lineCount; i++) {
        lines[i].ignore = false;
      }
    }
    return {
      supported: true,
      shouldRemoveComments,
      lines
    };
  }
  /**
   * Analyze all lines and decide exactly what to do => not supported | insert line comments | remove line comments
   */
  static _gatherPreflightData(type, insertSpace, model, startLineNumber, endLineNumber, ignoreEmptyLines, ignoreFirstLine, languageConfigurationService) {
    const lines = LineCommentCommand._gatherPreflightCommentStrings(model, startLineNumber, endLineNumber, languageConfigurationService);
    const languageId = model.getLanguageIdAtPosition(startLineNumber, 1);
    if (lines === null) {
      return {
        supported: false
      };
    }
    return LineCommentCommand._analyzeLines(type, insertSpace, model, lines, startLineNumber, ignoreEmptyLines, ignoreFirstLine, languageConfigurationService, languageId);
  }
  /**
   * Given a successful analysis, execute either insert line comments, either remove line comments
   */
  _executeLineComments(model, builder, data, s) {
    let ops;
    if (data.shouldRemoveComments) {
      ops = LineCommentCommand._createRemoveLineCommentsOperations(data.lines, s.startLineNumber);
    } else {
      LineCommentCommand._normalizeInsertionPoint(model, data.lines, s.startLineNumber, this._indentSize);
      ops = this._createAddLineCommentsOperations(data.lines, s.startLineNumber);
    }
    const cursorPosition = new Position(s.positionLineNumber, s.positionColumn);
    for (let i = 0, len = ops.length; i < len; i++) {
      builder.addEditOperation(ops[i].range, ops[i].text);
      if (Range.isEmpty(ops[i].range) && Range.getStartPosition(ops[i].range).equals(cursorPosition)) {
        const lineContent = model.getLineContent(cursorPosition.lineNumber);
        if (lineContent.length + 1 === cursorPosition.column) {
          this._deltaColumn = (ops[i].text || "").length;
        }
      }
    }
    this._selectionId = builder.trackSelection(s);
  }
  _attemptRemoveBlockComment(model, s, startToken, endToken) {
    let startLineNumber = s.startLineNumber;
    let endLineNumber = s.endLineNumber;
    const startTokenAllowedBeforeColumn = endToken.length + Math.max(
      model.getLineFirstNonWhitespaceColumn(s.startLineNumber),
      s.startColumn
    );
    let startTokenIndex = model.getLineContent(startLineNumber).lastIndexOf(startToken, startTokenAllowedBeforeColumn - 1);
    let endTokenIndex = model.getLineContent(endLineNumber).indexOf(endToken, s.endColumn - 1 - startToken.length);
    if (startTokenIndex !== -1 && endTokenIndex === -1) {
      endTokenIndex = model.getLineContent(startLineNumber).indexOf(endToken, startTokenIndex + startToken.length);
      endLineNumber = startLineNumber;
    }
    if (startTokenIndex === -1 && endTokenIndex !== -1) {
      startTokenIndex = model.getLineContent(endLineNumber).lastIndexOf(startToken, endTokenIndex);
      startLineNumber = endLineNumber;
    }
    if (s.isEmpty() && (startTokenIndex === -1 || endTokenIndex === -1)) {
      startTokenIndex = model.getLineContent(startLineNumber).indexOf(startToken);
      if (startTokenIndex !== -1) {
        endTokenIndex = model.getLineContent(startLineNumber).indexOf(endToken, startTokenIndex + startToken.length);
      }
    }
    if (startTokenIndex !== -1 && model.getLineContent(startLineNumber).charCodeAt(startTokenIndex + startToken.length) === CharCode.Space) {
      startToken += " ";
    }
    if (endTokenIndex !== -1 && model.getLineContent(endLineNumber).charCodeAt(endTokenIndex - 1) === CharCode.Space) {
      endToken = " " + endToken;
      endTokenIndex -= 1;
    }
    if (startTokenIndex !== -1 && endTokenIndex !== -1) {
      return BlockCommentCommand._createRemoveBlockCommentOperations(
        new Range(startLineNumber, startTokenIndex + startToken.length + 1, endLineNumber, endTokenIndex + 1),
        startToken,
        endToken
      );
    }
    return null;
  }
  /**
   * Given an unsuccessful analysis, delegate to the block comment command
   */
  _executeBlockComment(model, builder, s) {
    model.tokenization.tokenizeIfCheap(s.startLineNumber);
    const languageId = model.getLanguageIdAtPosition(s.startLineNumber, 1);
    const config = this.languageConfigurationService.getLanguageConfiguration(languageId).comments;
    if (!config || !config.blockCommentStartToken || !config.blockCommentEndToken) {
      return;
    }
    const startToken = config.blockCommentStartToken;
    const endToken = config.blockCommentEndToken;
    let ops = this._attemptRemoveBlockComment(model, s, startToken, endToken);
    if (!ops) {
      if (s.isEmpty()) {
        const lineContent = model.getLineContent(s.startLineNumber);
        let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(lineContent);
        if (firstNonWhitespaceIndex === -1) {
          firstNonWhitespaceIndex = lineContent.length;
        }
        ops = BlockCommentCommand._createAddBlockCommentOperations(
          new Range(s.startLineNumber, firstNonWhitespaceIndex + 1, s.startLineNumber, lineContent.length + 1),
          startToken,
          endToken,
          this._insertSpace
        );
      } else {
        ops = BlockCommentCommand._createAddBlockCommentOperations(
          new Range(s.startLineNumber, model.getLineFirstNonWhitespaceColumn(s.startLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)),
          startToken,
          endToken,
          this._insertSpace
        );
      }
      if (ops.length === 1) {
        this._deltaColumn = startToken.length + 1;
      }
    }
    this._selectionId = builder.trackSelection(s);
    for (const op of ops) {
      builder.addEditOperation(op.range, op.text);
    }
  }
  getEditOperations(model, builder) {
    let s = this._selection;
    this._moveEndPositionDown = false;
    if (s.startLineNumber === s.endLineNumber && this._ignoreFirstLine) {
      builder.addEditOperation(new Range(s.startLineNumber, model.getLineMaxColumn(s.startLineNumber), s.startLineNumber + 1, 1), s.startLineNumber === model.getLineCount() ? "" : "\n");
      this._selectionId = builder.trackSelection(s);
      return;
    }
    if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
      this._moveEndPositionDown = true;
      s = s.setEndPosition(s.endLineNumber - 1, model.getLineMaxColumn(s.endLineNumber - 1));
    }
    const data = LineCommentCommand._gatherPreflightData(
      this._type,
      this._insertSpace,
      model,
      s.startLineNumber,
      s.endLineNumber,
      this._ignoreEmptyLines,
      this._ignoreFirstLine,
      this.languageConfigurationService
    );
    if (data.supported) {
      return this._executeLineComments(model, builder, data, s);
    }
    return this._executeBlockComment(model, builder, s);
  }
  computeCursorState(model, helper) {
    let result = helper.getTrackedSelection(this._selectionId);
    if (this._moveEndPositionDown) {
      result = result.setEndPosition(result.endLineNumber + 1, 1);
    }
    return new Selection(
      result.selectionStartLineNumber,
      result.selectionStartColumn + this._deltaColumn,
      result.positionLineNumber,
      result.positionColumn + this._deltaColumn
    );
  }
  /**
   * Generate edit operations in the remove line comment case
   */
  static _createRemoveLineCommentsOperations(lines, startLineNumber) {
    const res = [];
    for (let i = 0, len = lines.length; i < len; i++) {
      const lineData = lines[i];
      if (lineData.ignore) {
        continue;
      }
      res.push(EditOperation.delete(new Range(
        startLineNumber + i,
        lineData.commentStrOffset + 1,
        startLineNumber + i,
        lineData.commentStrOffset + lineData.commentStrLength + 1
      )));
    }
    return res;
  }
  /**
   * Generate edit operations in the add line comment case
   */
  _createAddLineCommentsOperations(lines, startLineNumber) {
    const res = [];
    const afterCommentStr = this._insertSpace ? " " : "";
    for (let i = 0, len = lines.length; i < len; i++) {
      const lineData = lines[i];
      if (lineData.ignore) {
        continue;
      }
      res.push(EditOperation.insert(new Position(startLineNumber + i, lineData.commentStrOffset + 1), lineData.commentStr + afterCommentStr));
    }
    return res;
  }
  static nextVisibleColumn(currentVisibleColumn, indentSize, isTab, columnSize) {
    if (isTab) {
      return currentVisibleColumn + (indentSize - currentVisibleColumn % indentSize);
    }
    return currentVisibleColumn + columnSize;
  }
  /**
   * Adjust insertion points to have them vertically aligned in the add line comment case
   */
  static _normalizeInsertionPoint(model, lines, startLineNumber, indentSize) {
    let minVisibleColumn = Constants.MAX_SAFE_SMALL_INTEGER;
    let j;
    let lenJ;
    for (let i = 0, len = lines.length; i < len; i++) {
      if (lines[i].ignore) {
        continue;
      }
      const lineContent = model.getLineContent(startLineNumber + i);
      let currentVisibleColumn = 0;
      for (let j2 = 0, lenJ2 = lines[i].commentStrOffset; currentVisibleColumn < minVisibleColumn && j2 < lenJ2; j2++) {
        currentVisibleColumn = LineCommentCommand.nextVisibleColumn(currentVisibleColumn, indentSize, lineContent.charCodeAt(j2) === CharCode.Tab, 1);
      }
      if (currentVisibleColumn < minVisibleColumn) {
        minVisibleColumn = currentVisibleColumn;
      }
    }
    minVisibleColumn = Math.floor(minVisibleColumn / indentSize) * indentSize;
    for (let i = 0, len = lines.length; i < len; i++) {
      if (lines[i].ignore) {
        continue;
      }
      const lineContent = model.getLineContent(startLineNumber + i);
      let currentVisibleColumn = 0;
      for (j = 0, lenJ = lines[i].commentStrOffset; currentVisibleColumn < minVisibleColumn && j < lenJ; j++) {
        currentVisibleColumn = LineCommentCommand.nextVisibleColumn(currentVisibleColumn, indentSize, lineContent.charCodeAt(j) === CharCode.Tab, 1);
      }
      if (currentVisibleColumn > minVisibleColumn) {
        lines[i].commentStrOffset = j - 1;
      } else {
        lines[i].commentStrOffset = j;
      }
    }
  }
}
export {
  LineCommentCommand,
  Type
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvbW1lbnRcXGJyb3dzZXJcXGxpbmVDb21tZW50Q29tbWFuZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiwgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmQsIElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSwgSUVkaXRPcGVyYXRpb25CdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBCbG9ja0NvbW1lbnRDb21tYW5kIH0gZnJvbSAnLi9ibG9ja0NvbW1lbnRDb21tYW5kLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJSW5zZXJ0aW9uUG9pbnQge1xuXHRpZ25vcmU6IGJvb2xlYW47XG5cdGNvbW1lbnRTdHJPZmZzZXQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGluZVByZWZsaWdodERhdGEge1xuXHRpZ25vcmU6IGJvb2xlYW47XG5cdGNvbW1lbnRTdHI6IHN0cmluZztcblx0Y29tbWVudFN0ck9mZnNldDogbnVtYmVyO1xuXHRjb21tZW50U3RyTGVuZ3RoOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByZWZsaWdodERhdGFTdXBwb3J0ZWQge1xuXHRzdXBwb3J0ZWQ6IHRydWU7XG5cdHNob3VsZFJlbW92ZUNvbW1lbnRzOiBib29sZWFuO1xuXHRsaW5lczogSUxpbmVQcmVmbGlnaHREYXRhW107XG59XG5leHBvcnQgaW50ZXJmYWNlIElQcmVmbGlnaHREYXRhVW5zdXBwb3J0ZWQge1xuXHRzdXBwb3J0ZWQ6IGZhbHNlO1xufVxuZXhwb3J0IHR5cGUgSVByZWZsaWdodERhdGEgPSBJUHJlZmxpZ2h0RGF0YVN1cHBvcnRlZCB8IElQcmVmbGlnaHREYXRhVW5zdXBwb3J0ZWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNpbXBsZU1vZGVsIHtcblx0Z2V0TGluZUNvbnRlbnQobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBUeXBlIHtcblx0VG9nZ2xlID0gMCxcblx0Rm9yY2VBZGQgPSAxLFxuXHRGb3JjZVJlbW92ZSA9IDJcbn1cblxuZXhwb3J0IGNsYXNzIExpbmVDb21tZW50Q29tbWFuZCBpbXBsZW1lbnRzIElDb21tYW5kIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3Rpb246IFNlbGVjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5kZW50U2l6ZTogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90eXBlOiBUeXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnNlcnRTcGFjZTogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfaWdub3JlRW1wdHlMaW5lczogYm9vbGVhbjtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uSWQ6IHN0cmluZyB8IG51bGw7XG5cdHByaXZhdGUgX2RlbHRhQ29sdW1uOiBudW1iZXI7XG5cdHByaXZhdGUgX21vdmVFbmRQb3NpdGlvbkRvd246IGJvb2xlYW47XG5cdHByaXZhdGUgX2lnbm9yZUZpcnN0TGluZTogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHNlbGVjdGlvbjogU2VsZWN0aW9uLFxuXHRcdGluZGVudFNpemU6IG51bWJlcixcblx0XHR0eXBlOiBUeXBlLFxuXHRcdGluc2VydFNwYWNlOiBib29sZWFuLFxuXHRcdGlnbm9yZUVtcHR5TGluZXM6IGJvb2xlYW4sXG5cdFx0aWdub3JlRmlyc3RMaW5lPzogYm9vbGVhbixcblx0KSB7XG5cdFx0dGhpcy5fc2VsZWN0aW9uID0gc2VsZWN0aW9uO1xuXHRcdHRoaXMuX2luZGVudFNpemUgPSBpbmRlbnRTaXplO1xuXHRcdHRoaXMuX3R5cGUgPSB0eXBlO1xuXHRcdHRoaXMuX2luc2VydFNwYWNlID0gaW5zZXJ0U3BhY2U7XG5cdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBudWxsO1xuXHRcdHRoaXMuX2RlbHRhQ29sdW1uID0gMDtcblx0XHR0aGlzLl9tb3ZlRW5kUG9zaXRpb25Eb3duID0gZmFsc2U7XG5cdFx0dGhpcy5faWdub3JlRW1wdHlMaW5lcyA9IGlnbm9yZUVtcHR5TGluZXM7XG5cdFx0dGhpcy5faWdub3JlRmlyc3RMaW5lID0gaWdub3JlRmlyc3RMaW5lIHx8IGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIERvIGFuIGluaXRpYWwgcGFzcyBvdmVyIHRoZSBsaW5lcyBhbmQgZ2F0aGVyIGluZm8gYWJvdXQgdGhlIGxpbmUgY29tbWVudCBzdHJpbmcuXG5cdCAqIFJldHVybnMgbnVsbCBpZiBhbnkgb2YgdGhlIGxpbmVzIGRvZXNuJ3Qgc3VwcG9ydCBhIGxpbmUgY29tbWVudCBzdHJpbmcuXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyBfZ2F0aGVyUHJlZmxpZ2h0Q29tbWVudFN0cmluZ3MobW9kZWw6IElUZXh0TW9kZWwsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogSUxpbmVQcmVmbGlnaHREYXRhW10gfCBudWxsIHtcblxuXHRcdG1vZGVsLnRva2VuaXphdGlvbi50b2tlbml6ZUlmQ2hlYXAoc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24oc3RhcnRMaW5lTnVtYmVyLCAxKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmNvbW1lbnRzO1xuXHRcdGNvbnN0IGNvbW1lbnRTdHIgPSAoY29uZmlnID8gY29uZmlnLmxpbmVDb21tZW50VG9rZW4gOiBudWxsKTtcblx0XHRpZiAoIWNvbW1lbnRTdHIpIHtcblx0XHRcdC8vIE1vZGUgZG9lcyBub3Qgc3VwcG9ydCBsaW5lIGNvbW1lbnRzXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lczogSUxpbmVQcmVmbGlnaHREYXRhW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGluZUNvdW50ID0gZW5kTGluZU51bWJlciAtIHN0YXJ0TGluZU51bWJlciArIDE7IGkgPCBsaW5lQ291bnQ7IGkrKykge1xuXHRcdFx0bGluZXNbaV0gPSB7XG5cdFx0XHRcdGlnbm9yZTogZmFsc2UsXG5cdFx0XHRcdGNvbW1lbnRTdHI6IGNvbW1lbnRTdHIsXG5cdFx0XHRcdGNvbW1lbnRTdHJPZmZzZXQ6IDAsXG5cdFx0XHRcdGNvbW1lbnRTdHJMZW5ndGg6IGNvbW1lbnRTdHIubGVuZ3RoXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiBsaW5lcztcblx0fVxuXG5cdC8qKlxuXHQgKiBBbmFseXplIGxpbmVzIGFuZCBkZWNpZGUgd2hpY2ggbGluZXMgYXJlIHJlbGV2YW50IGFuZCB3aGF0IHRoZSB0b2dnbGUgc2hvdWxkIGRvLlxuXHQgKiBBbHNvLCBidWlsZCB1cCBzZXZlcmFsIG9mZnNldHMgYW5kIGxlbmd0aHMgdXNlZnVsIGluIHRoZSBnZW5lcmF0aW9uIG9mIGVkaXRvciBvcGVyYXRpb25zLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBfYW5hbHl6ZUxpbmVzKHR5cGU6IFR5cGUsIGluc2VydFNwYWNlOiBib29sZWFuLCBtb2RlbDogSVNpbXBsZU1vZGVsLCBsaW5lczogSUxpbmVQcmVmbGlnaHREYXRhW10sIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBpZ25vcmVFbXB0eUxpbmVzOiBib29sZWFuLCBpZ25vcmVGaXJzdExpbmU6IGJvb2xlYW4sIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBJUHJlZmxpZ2h0RGF0YSB7XG5cdFx0bGV0IG9ubHlXaGl0ZXNwYWNlTGluZXMgPSB0cnVlO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuY29tbWVudHM7XG5cdFx0Y29uc3QgbGluZUNvbW1lbnROb0luZGVudCA9IGNvbmZpZz8ubGluZUNvbW1lbnROb0luZGVudCA/PyBmYWxzZTtcblxuXHRcdGxldCBzaG91bGRSZW1vdmVDb21tZW50czogYm9vbGVhbjtcblx0XHRpZiAodHlwZSA9PT0gVHlwZS5Ub2dnbGUpIHtcblx0XHRcdHNob3VsZFJlbW92ZUNvbW1lbnRzID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKHR5cGUgPT09IFR5cGUuRm9yY2VBZGQpIHtcblx0XHRcdHNob3VsZFJlbW92ZUNvbW1lbnRzID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNob3VsZFJlbW92ZUNvbW1lbnRzID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGluZUNvdW50ID0gbGluZXMubGVuZ3RoOyBpIDwgbGluZUNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVEYXRhID0gbGluZXNbaV07XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyICsgaTtcblxuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IHN0YXJ0TGluZU51bWJlciAmJiBpZ25vcmVGaXJzdExpbmUpIHtcblx0XHRcdFx0Ly8gZmlyc3QgbGluZSBpZ25vcmVkXG5cdFx0XHRcdGxpbmVEYXRhLmlnbm9yZSA9IHRydWU7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnRTdGFydE9mZnNldCA9IHN0cmluZ3MuZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXgobGluZUNvbnRlbnQpO1xuXG5cdFx0XHRpZiAobGluZUNvbnRlbnRTdGFydE9mZnNldCA9PT0gLTEpIHtcblx0XHRcdFx0Ly8gRW1wdHkgb3Igd2hpdGVzcGFjZSBvbmx5IGxpbmVcblx0XHRcdFx0bGluZURhdGEuaWdub3JlID0gaWdub3JlRW1wdHlMaW5lcztcblx0XHRcdFx0bGluZURhdGEuY29tbWVudFN0ck9mZnNldCA9IGxpbmVDb21tZW50Tm9JbmRlbnQgPyAwIDogbGluZUNvbnRlbnQubGVuZ3RoO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0b25seVdoaXRlc3BhY2VMaW5lcyA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gbGluZUNvbW1lbnROb0luZGVudCA/IDAgOiBsaW5lQ29udGVudFN0YXJ0T2Zmc2V0O1xuXHRcdFx0bGluZURhdGEuaWdub3JlID0gZmFsc2U7XG5cdFx0XHRsaW5lRGF0YS5jb21tZW50U3RyT2Zmc2V0ID0gb2Zmc2V0O1xuXG5cdFx0XHRpZiAoc2hvdWxkUmVtb3ZlQ29tbWVudHMgJiYgIUJsb2NrQ29tbWVudENvbW1hbmQuX2hheXN0YWNrSGFzTmVlZGxlQXRPZmZzZXQobGluZUNvbnRlbnQsIGxpbmVEYXRhLmNvbW1lbnRTdHIsIG9mZnNldCkpIHtcblx0XHRcdFx0aWYgKHR5cGUgPT09IFR5cGUuVG9nZ2xlKSB7XG5cdFx0XHRcdFx0Ly8gRXZlcnkgbGluZSBzbyBmYXIgaGFzIGJlZW4gYSBsaW5lIGNvbW1lbnQsIGJ1dCB0aGlzIG9uZSBpcyBub3Rcblx0XHRcdFx0XHRzaG91bGRSZW1vdmVDb21tZW50cyA9IGZhbHNlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHR5cGUgPT09IFR5cGUuRm9yY2VBZGQpIHtcblx0XHRcdFx0XHQvLyBXaWxsIG5vdCBoYXBwZW5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRsaW5lRGF0YS5pZ25vcmUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzaG91bGRSZW1vdmVDb21tZW50cyAmJiBpbnNlcnRTcGFjZSkge1xuXHRcdFx0XHQvLyBSZW1vdmUgYSBmb2xsb3dpbmcgc3BhY2UgaWYgcHJlc2VudFxuXHRcdFx0XHRjb25zdCBjb21tZW50U3RyRW5kT2Zmc2V0ID0gbGluZUNvbnRlbnRTdGFydE9mZnNldCArIGxpbmVEYXRhLmNvbW1lbnRTdHJMZW5ndGg7XG5cdFx0XHRcdGlmIChjb21tZW50U3RyRW5kT2Zmc2V0IDwgbGluZUNvbnRlbnQubGVuZ3RoICYmIGxpbmVDb250ZW50LmNoYXJDb2RlQXQoY29tbWVudFN0ckVuZE9mZnNldCkgPT09IENoYXJDb2RlLlNwYWNlKSB7XG5cdFx0XHRcdFx0bGluZURhdGEuY29tbWVudFN0ckxlbmd0aCArPSAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGUgPT09IFR5cGUuVG9nZ2xlICYmIG9ubHlXaGl0ZXNwYWNlTGluZXMpIHtcblx0XHRcdC8vIEZvciBvbmx5IHdoaXRlc3BhY2UgbGluZXMsIHdlIGluc2VydCBjb21tZW50c1xuXHRcdFx0c2hvdWxkUmVtb3ZlQ29tbWVudHMgPSBmYWxzZTtcblxuXHRcdFx0Ly8gQWxzbywgbm8gbG9uZ2VyIGlnbm9yZSB0aGVtXG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGluZUNvdW50ID0gbGluZXMubGVuZ3RoOyBpIDwgbGluZUNvdW50OyBpKyspIHtcblx0XHRcdFx0bGluZXNbaV0uaWdub3JlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN1cHBvcnRlZDogdHJ1ZSxcblx0XHRcdHNob3VsZFJlbW92ZUNvbW1lbnRzOiBzaG91bGRSZW1vdmVDb21tZW50cyxcblx0XHRcdGxpbmVzOiBsaW5lc1xuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQW5hbHl6ZSBhbGwgbGluZXMgYW5kIGRlY2lkZSBleGFjdGx5IHdoYXQgdG8gZG8gPT4gbm90IHN1cHBvcnRlZCB8IGluc2VydCBsaW5lIGNvbW1lbnRzIHwgcmVtb3ZlIGxpbmUgY29tbWVudHNcblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgX2dhdGhlclByZWZsaWdodERhdGEodHlwZTogVHlwZSwgaW5zZXJ0U3BhY2U6IGJvb2xlYW4sIG1vZGVsOiBJVGV4dE1vZGVsLCBzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBpZ25vcmVFbXB0eUxpbmVzOiBib29sZWFuLCBpZ25vcmVGaXJzdExpbmU6IGJvb2xlYW4sIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogSVByZWZsaWdodERhdGEge1xuXHRcdGNvbnN0IGxpbmVzID0gTGluZUNvbW1lbnRDb21tYW5kLl9nYXRoZXJQcmVmbGlnaHRDb21tZW50U3RyaW5ncyhtb2RlbCwgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24oc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRpZiAobGluZXMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHN1cHBvcnRlZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIExpbmVDb21tZW50Q29tbWFuZC5fYW5hbHl6ZUxpbmVzKHR5cGUsIGluc2VydFNwYWNlLCBtb2RlbCwgbGluZXMsIHN0YXJ0TGluZU51bWJlciwgaWdub3JlRW1wdHlMaW5lcywgaWdub3JlRmlyc3RMaW5lLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUlkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIHN1Y2Nlc3NmdWwgYW5hbHlzaXMsIGV4ZWN1dGUgZWl0aGVyIGluc2VydCBsaW5lIGNvbW1lbnRzLCBlaXRoZXIgcmVtb3ZlIGxpbmUgY29tbWVudHNcblx0ICovXG5cdHByaXZhdGUgX2V4ZWN1dGVMaW5lQ29tbWVudHMobW9kZWw6IElTaW1wbGVNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyLCBkYXRhOiBJUHJlZmxpZ2h0RGF0YVN1cHBvcnRlZCwgczogU2VsZWN0aW9uKTogdm9pZCB7XG5cblx0XHRsZXQgb3BzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdO1xuXG5cdFx0aWYgKGRhdGEuc2hvdWxkUmVtb3ZlQ29tbWVudHMpIHtcblx0XHRcdG9wcyA9IExpbmVDb21tZW50Q29tbWFuZC5fY3JlYXRlUmVtb3ZlTGluZUNvbW1lbnRzT3BlcmF0aW9ucyhkYXRhLmxpbmVzLCBzLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdExpbmVDb21tZW50Q29tbWFuZC5fbm9ybWFsaXplSW5zZXJ0aW9uUG9pbnQobW9kZWwsIGRhdGEubGluZXMsIHMuc3RhcnRMaW5lTnVtYmVyLCB0aGlzLl9pbmRlbnRTaXplKTtcblx0XHRcdG9wcyA9IHRoaXMuX2NyZWF0ZUFkZExpbmVDb21tZW50c09wZXJhdGlvbnMoZGF0YS5saW5lcywgcy5zdGFydExpbmVOdW1iZXIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHMucG9zaXRpb25MaW5lTnVtYmVyLCBzLnBvc2l0aW9uQ29sdW1uKTtcblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBvcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGJ1aWxkZXIuYWRkRWRpdE9wZXJhdGlvbihvcHNbaV0ucmFuZ2UsIG9wc1tpXS50ZXh0KTtcblx0XHRcdGlmIChSYW5nZS5pc0VtcHR5KG9wc1tpXS5yYW5nZSkgJiYgUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbihvcHNbaV0ucmFuZ2UpLmVxdWFscyhjdXJzb3JQb3NpdGlvbikpIHtcblx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChjdXJzb3JQb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdFx0aWYgKGxpbmVDb250ZW50Lmxlbmd0aCArIDEgPT09IGN1cnNvclBvc2l0aW9uLmNvbHVtbikge1xuXHRcdFx0XHRcdHRoaXMuX2RlbHRhQ29sdW1uID0gKG9wc1tpXS50ZXh0IHx8ICcnKS5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9zZWxlY3Rpb25JZCA9IGJ1aWxkZXIudHJhY2tTZWxlY3Rpb24ocyk7XG5cdH1cblxuXHRwcml2YXRlIF9hdHRlbXB0UmVtb3ZlQmxvY2tDb21tZW50KG1vZGVsOiBJVGV4dE1vZGVsLCBzOiBTZWxlY3Rpb24sIHN0YXJ0VG9rZW46IHN0cmluZywgZW5kVG9rZW46IHN0cmluZyk6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gfCBudWxsIHtcblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gcy5zdGFydExpbmVOdW1iZXI7XG5cdFx0bGV0IGVuZExpbmVOdW1iZXIgPSBzLmVuZExpbmVOdW1iZXI7XG5cblx0XHRjb25zdCBzdGFydFRva2VuQWxsb3dlZEJlZm9yZUNvbHVtbiA9IGVuZFRva2VuLmxlbmd0aCArIE1hdGgubWF4KFxuXHRcdFx0bW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihzLnN0YXJ0TGluZU51bWJlciksXG5cdFx0XHRzLnN0YXJ0Q29sdW1uXG5cdFx0KTtcblxuXHRcdGxldCBzdGFydFRva2VuSW5kZXggPSBtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpLmxhc3RJbmRleE9mKHN0YXJ0VG9rZW4sIHN0YXJ0VG9rZW5BbGxvd2VkQmVmb3JlQ29sdW1uIC0gMSk7XG5cdFx0bGV0IGVuZFRva2VuSW5kZXggPSBtb2RlbC5nZXRMaW5lQ29udGVudChlbmRMaW5lTnVtYmVyKS5pbmRleE9mKGVuZFRva2VuLCBzLmVuZENvbHVtbiAtIDEgLSBzdGFydFRva2VuLmxlbmd0aCk7XG5cblx0XHRpZiAoc3RhcnRUb2tlbkluZGV4ICE9PSAtMSAmJiBlbmRUb2tlbkluZGV4ID09PSAtMSkge1xuXHRcdFx0ZW5kVG9rZW5JbmRleCA9IG1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlcikuaW5kZXhPZihlbmRUb2tlbiwgc3RhcnRUb2tlbkluZGV4ICsgc3RhcnRUb2tlbi5sZW5ndGgpO1xuXHRcdFx0ZW5kTGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjtcblx0XHR9XG5cblx0XHRpZiAoc3RhcnRUb2tlbkluZGV4ID09PSAtMSAmJiBlbmRUb2tlbkluZGV4ICE9PSAtMSkge1xuXHRcdFx0c3RhcnRUb2tlbkluZGV4ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoZW5kTGluZU51bWJlcikubGFzdEluZGV4T2Yoc3RhcnRUb2tlbiwgZW5kVG9rZW5JbmRleCk7XG5cdFx0XHRzdGFydExpbmVOdW1iZXIgPSBlbmRMaW5lTnVtYmVyO1xuXHRcdH1cblxuXHRcdGlmIChzLmlzRW1wdHkoKSAmJiAoc3RhcnRUb2tlbkluZGV4ID09PSAtMSB8fCBlbmRUb2tlbkluZGV4ID09PSAtMSkpIHtcblx0XHRcdHN0YXJ0VG9rZW5JbmRleCA9IG1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlcikuaW5kZXhPZihzdGFydFRva2VuKTtcblx0XHRcdGlmIChzdGFydFRva2VuSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdGVuZFRva2VuSW5kZXggPSBtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpLmluZGV4T2YoZW5kVG9rZW4sIHN0YXJ0VG9rZW5JbmRleCArIHN0YXJ0VG9rZW4ubGVuZ3RoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXZSBoYXZlIHRvIGFkanVzdCB0byBwb3NzaWJsZSBpbm5lciB3aGl0ZSBzcGFjZS5cblx0XHQvLyBGb3IgU3BhY2UgYWZ0ZXIgc3RhcnRUb2tlbiwgYWRkIFNwYWNlIHRvIHN0YXJ0VG9rZW4gLSByYW5nZSBtYXRoIHdpbGwgd29yayBvdXQuXG5cdFx0aWYgKHN0YXJ0VG9rZW5JbmRleCAhPT0gLTEgJiYgbW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyKS5jaGFyQ29kZUF0KHN0YXJ0VG9rZW5JbmRleCArIHN0YXJ0VG9rZW4ubGVuZ3RoKSA9PT0gQ2hhckNvZGUuU3BhY2UpIHtcblx0XHRcdHN0YXJ0VG9rZW4gKz0gJyAnO1xuXHRcdH1cblxuXHRcdC8vIEZvciBTcGFjZSBiZWZvcmUgZW5kVG9rZW4sIGFkZCBTcGFjZSBiZWZvcmUgZW5kVG9rZW4gYW5kIHNoaWZ0IGluZGV4IG9uZSBsZWZ0LlxuXHRcdGlmIChlbmRUb2tlbkluZGV4ICE9PSAtMSAmJiBtb2RlbC5nZXRMaW5lQ29udGVudChlbmRMaW5lTnVtYmVyKS5jaGFyQ29kZUF0KGVuZFRva2VuSW5kZXggLSAxKSA9PT0gQ2hhckNvZGUuU3BhY2UpIHtcblx0XHRcdGVuZFRva2VuID0gJyAnICsgZW5kVG9rZW47XG5cdFx0XHRlbmRUb2tlbkluZGV4IC09IDE7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXJ0VG9rZW5JbmRleCAhPT0gLTEgJiYgZW5kVG9rZW5JbmRleCAhPT0gLTEpIHtcblx0XHRcdHJldHVybiBCbG9ja0NvbW1lbnRDb21tYW5kLl9jcmVhdGVSZW1vdmVCbG9ja0NvbW1lbnRPcGVyYXRpb25zKFxuXHRcdFx0XHRuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydFRva2VuSW5kZXggKyBzdGFydFRva2VuLmxlbmd0aCArIDEsIGVuZExpbmVOdW1iZXIsIGVuZFRva2VuSW5kZXggKyAxKSwgc3RhcnRUb2tlbiwgZW5kVG9rZW5cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYW4gdW5zdWNjZXNzZnVsIGFuYWx5c2lzLCBkZWxlZ2F0ZSB0byB0aGUgYmxvY2sgY29tbWVudCBjb21tYW5kXG5cdCAqL1xuXHRwcml2YXRlIF9leGVjdXRlQmxvY2tDb21tZW50KG1vZGVsOiBJVGV4dE1vZGVsLCBidWlsZGVyOiBJRWRpdE9wZXJhdGlvbkJ1aWxkZXIsIHM6IFNlbGVjdGlvbik6IHZvaWQge1xuXHRcdG1vZGVsLnRva2VuaXphdGlvbi50b2tlbml6ZUlmQ2hlYXAocy5zdGFydExpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBtb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbihzLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5jb21tZW50cztcblx0XHRpZiAoIWNvbmZpZyB8fCAhY29uZmlnLmJsb2NrQ29tbWVudFN0YXJ0VG9rZW4gfHwgIWNvbmZpZy5ibG9ja0NvbW1lbnRFbmRUb2tlbikge1xuXHRcdFx0Ly8gTW9kZSBkb2VzIG5vdCBzdXBwb3J0IGJsb2NrIGNvbW1lbnRzXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRUb2tlbiA9IGNvbmZpZy5ibG9ja0NvbW1lbnRTdGFydFRva2VuO1xuXHRcdGNvbnN0IGVuZFRva2VuID0gY29uZmlnLmJsb2NrQ29tbWVudEVuZFRva2VuO1xuXG5cdFx0bGV0IG9wcyA9IHRoaXMuX2F0dGVtcHRSZW1vdmVCbG9ja0NvbW1lbnQobW9kZWwsIHMsIHN0YXJ0VG9rZW4sIGVuZFRva2VuKTtcblx0XHRpZiAoIW9wcykge1xuXHRcdFx0aWYgKHMuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocy5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRsZXQgZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXggPSBzdHJpbmdzLmZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4KGxpbmVDb250ZW50KTtcblx0XHRcdFx0aWYgKGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdC8vIExpbmUgaXMgZW1wdHkgb3IgY29udGFpbnMgb25seSB3aGl0ZXNwYWNlXG5cdFx0XHRcdFx0Zmlyc3ROb25XaGl0ZXNwYWNlSW5kZXggPSBsaW5lQ29udGVudC5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3BzID0gQmxvY2tDb21tZW50Q29tbWFuZC5fY3JlYXRlQWRkQmxvY2tDb21tZW50T3BlcmF0aW9ucyhcblx0XHRcdFx0XHRuZXcgUmFuZ2Uocy5zdGFydExpbmVOdW1iZXIsIGZpcnN0Tm9uV2hpdGVzcGFjZUluZGV4ICsgMSwgcy5zdGFydExpbmVOdW1iZXIsIGxpbmVDb250ZW50Lmxlbmd0aCArIDEpLFxuXHRcdFx0XHRcdHN0YXJ0VG9rZW4sXG5cdFx0XHRcdFx0ZW5kVG9rZW4sXG5cdFx0XHRcdFx0dGhpcy5faW5zZXJ0U3BhY2Vcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG9wcyA9IEJsb2NrQ29tbWVudENvbW1hbmQuX2NyZWF0ZUFkZEJsb2NrQ29tbWVudE9wZXJhdGlvbnMoXG5cdFx0XHRcdFx0bmV3IFJhbmdlKHMuc3RhcnRMaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHMuc3RhcnRMaW5lTnVtYmVyKSwgcy5lbmRMaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHMuZW5kTGluZU51bWJlcikpLFxuXHRcdFx0XHRcdHN0YXJ0VG9rZW4sXG5cdFx0XHRcdFx0ZW5kVG9rZW4sXG5cdFx0XHRcdFx0dGhpcy5faW5zZXJ0U3BhY2Vcblx0XHRcdFx0KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9wcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Ly8gTGVhdmUgY3Vyc29yIGFmdGVyIHRva2VuIGFuZCBTcGFjZVxuXHRcdFx0XHR0aGlzLl9kZWx0YUNvbHVtbiA9IHN0YXJ0VG9rZW4ubGVuZ3RoICsgMTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBidWlsZGVyLnRyYWNrU2VsZWN0aW9uKHMpO1xuXHRcdGZvciAoY29uc3Qgb3Agb2Ygb3BzKSB7XG5cdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24ob3AucmFuZ2UsIG9wLnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRFZGl0T3BlcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyKTogdm9pZCB7XG5cblx0XHRsZXQgcyA9IHRoaXMuX3NlbGVjdGlvbjtcblx0XHR0aGlzLl9tb3ZlRW5kUG9zaXRpb25Eb3duID0gZmFsc2U7XG5cblx0XHRpZiAocy5zdGFydExpbmVOdW1iZXIgPT09IHMuZW5kTGluZU51bWJlciAmJiB0aGlzLl9pZ25vcmVGaXJzdExpbmUpIHtcblx0XHRcdGJ1aWxkZXIuYWRkRWRpdE9wZXJhdGlvbihuZXcgUmFuZ2Uocy5zdGFydExpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocy5zdGFydExpbmVOdW1iZXIpLCBzLnN0YXJ0TGluZU51bWJlciArIDEsIDEpLCBzLnN0YXJ0TGluZU51bWJlciA9PT0gbW9kZWwuZ2V0TGluZUNvdW50KCkgPyAnJyA6ICdcXG4nKTtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbklkID0gYnVpbGRlci50cmFja1NlbGVjdGlvbihzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocy5zdGFydExpbmVOdW1iZXIgPCBzLmVuZExpbmVOdW1iZXIgJiYgcy5lbmRDb2x1bW4gPT09IDEpIHtcblx0XHRcdHRoaXMuX21vdmVFbmRQb3NpdGlvbkRvd24gPSB0cnVlO1xuXHRcdFx0cyA9IHMuc2V0RW5kUG9zaXRpb24ocy5lbmRMaW5lTnVtYmVyIC0gMSwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihzLmVuZExpbmVOdW1iZXIgLSAxKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IExpbmVDb21tZW50Q29tbWFuZC5fZ2F0aGVyUHJlZmxpZ2h0RGF0YShcblx0XHRcdHRoaXMuX3R5cGUsXG5cdFx0XHR0aGlzLl9pbnNlcnRTcGFjZSxcblx0XHRcdG1vZGVsLFxuXHRcdFx0cy5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRzLmVuZExpbmVOdW1iZXIsXG5cdFx0XHR0aGlzLl9pZ25vcmVFbXB0eUxpbmVzLFxuXHRcdFx0dGhpcy5faWdub3JlRmlyc3RMaW5lLFxuXHRcdFx0dGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0KTtcblxuXHRcdGlmIChkYXRhLnN1cHBvcnRlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVMaW5lQ29tbWVudHMobW9kZWwsIGJ1aWxkZXIsIGRhdGEsIHMpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9leGVjdXRlQmxvY2tDb21tZW50KG1vZGVsLCBidWlsZGVyLCBzKTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlQ3Vyc29yU3RhdGUobW9kZWw6IElUZXh0TW9kZWwsIGhlbHBlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXJEYXRhKTogU2VsZWN0aW9uIHtcblx0XHRsZXQgcmVzdWx0ID0gaGVscGVyLmdldFRyYWNrZWRTZWxlY3Rpb24odGhpcy5fc2VsZWN0aW9uSWQhKTtcblxuXHRcdGlmICh0aGlzLl9tb3ZlRW5kUG9zaXRpb25Eb3duKSB7XG5cdFx0XHRyZXN1bHQgPSByZXN1bHQuc2V0RW5kUG9zaXRpb24ocmVzdWx0LmVuZExpbmVOdW1iZXIgKyAxLCAxKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihcblx0XHRcdHJlc3VsdC5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsXG5cdFx0XHRyZXN1bHQuc2VsZWN0aW9uU3RhcnRDb2x1bW4gKyB0aGlzLl9kZWx0YUNvbHVtbixcblx0XHRcdHJlc3VsdC5wb3NpdGlvbkxpbmVOdW1iZXIsXG5cdFx0XHRyZXN1bHQucG9zaXRpb25Db2x1bW4gKyB0aGlzLl9kZWx0YUNvbHVtblxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogR2VuZXJhdGUgZWRpdCBvcGVyYXRpb25zIGluIHRoZSByZW1vdmUgbGluZSBjb21tZW50IGNhc2Vcblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgX2NyZWF0ZVJlbW92ZUxpbmVDb21tZW50c09wZXJhdGlvbnMobGluZXM6IElMaW5lUHJlZmxpZ2h0RGF0YVtdLCBzdGFydExpbmVOdW1iZXI6IG51bWJlcik6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10ge1xuXHRcdGNvbnN0IHJlczogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lRGF0YSA9IGxpbmVzW2ldO1xuXG5cdFx0XHRpZiAobGluZURhdGEuaWdub3JlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXMucHVzaChFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoXG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlciArIGksIGxpbmVEYXRhLmNvbW1lbnRTdHJPZmZzZXQgKyAxLFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIgKyBpLCBsaW5lRGF0YS5jb21tZW50U3RyT2Zmc2V0ICsgbGluZURhdGEuY29tbWVudFN0ckxlbmd0aCArIDFcblx0XHRcdCkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdlbmVyYXRlIGVkaXQgb3BlcmF0aW9ucyBpbiB0aGUgYWRkIGxpbmUgY29tbWVudCBjYXNlXG5cdCAqL1xuXHRwcml2YXRlIF9jcmVhdGVBZGRMaW5lQ29tbWVudHNPcGVyYXRpb25zKGxpbmVzOiBJTGluZVByZWZsaWdodERhdGFbXSwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIpOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdIHtcblx0XHRjb25zdCByZXM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCBhZnRlckNvbW1lbnRTdHIgPSB0aGlzLl9pbnNlcnRTcGFjZSA/ICcgJyA6ICcnO1xuXG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmVEYXRhID0gbGluZXNbaV07XG5cblx0XHRcdGlmIChsaW5lRGF0YS5pZ25vcmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJlcy5wdXNoKEVkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbihzdGFydExpbmVOdW1iZXIgKyBpLCBsaW5lRGF0YS5jb21tZW50U3RyT2Zmc2V0ICsgMSksIGxpbmVEYXRhLmNvbW1lbnRTdHIgKyBhZnRlckNvbW1lbnRTdHIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgbmV4dFZpc2libGVDb2x1bW4oY3VycmVudFZpc2libGVDb2x1bW46IG51bWJlciwgaW5kZW50U2l6ZTogbnVtYmVyLCBpc1RhYjogYm9vbGVhbiwgY29sdW1uU2l6ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoaXNUYWIpIHtcblx0XHRcdHJldHVybiBjdXJyZW50VmlzaWJsZUNvbHVtbiArIChpbmRlbnRTaXplIC0gKGN1cnJlbnRWaXNpYmxlQ29sdW1uICUgaW5kZW50U2l6ZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VycmVudFZpc2libGVDb2x1bW4gKyBjb2x1bW5TaXplO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkanVzdCBpbnNlcnRpb24gcG9pbnRzIHRvIGhhdmUgdGhlbSB2ZXJ0aWNhbGx5IGFsaWduZWQgaW4gdGhlIGFkZCBsaW5lIGNvbW1lbnQgY2FzZVxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBfbm9ybWFsaXplSW5zZXJ0aW9uUG9pbnQobW9kZWw6IElTaW1wbGVNb2RlbCwgbGluZXM6IElJbnNlcnRpb25Qb2ludFtdLCBzdGFydExpbmVOdW1iZXI6IG51bWJlciwgaW5kZW50U2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0bGV0IG1pblZpc2libGVDb2x1bW4gPSBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUjtcblx0XHRsZXQgajogbnVtYmVyO1xuXHRcdGxldCBsZW5KOiBudW1iZXI7XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmIChsaW5lc1tpXS5pZ25vcmUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoc3RhcnRMaW5lTnVtYmVyICsgaSk7XG5cblx0XHRcdGxldCBjdXJyZW50VmlzaWJsZUNvbHVtbiA9IDA7XG5cdFx0XHRmb3IgKGxldCBqID0gMCwgbGVuSiA9IGxpbmVzW2ldLmNvbW1lbnRTdHJPZmZzZXQ7IGN1cnJlbnRWaXNpYmxlQ29sdW1uIDwgbWluVmlzaWJsZUNvbHVtbiAmJiBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdGN1cnJlbnRWaXNpYmxlQ29sdW1uID0gTGluZUNvbW1lbnRDb21tYW5kLm5leHRWaXNpYmxlQ29sdW1uKGN1cnJlbnRWaXNpYmxlQ29sdW1uLCBpbmRlbnRTaXplLCBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGopID09PSBDaGFyQ29kZS5UYWIsIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VycmVudFZpc2libGVDb2x1bW4gPCBtaW5WaXNpYmxlQ29sdW1uKSB7XG5cdFx0XHRcdG1pblZpc2libGVDb2x1bW4gPSBjdXJyZW50VmlzaWJsZUNvbHVtbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRtaW5WaXNpYmxlQ29sdW1uID0gTWF0aC5mbG9vcihtaW5WaXNpYmxlQ29sdW1uIC8gaW5kZW50U2l6ZSkgKiBpbmRlbnRTaXplO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAobGluZXNbaV0uaWdub3JlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlciArIGkpO1xuXG5cdFx0XHRsZXQgY3VycmVudFZpc2libGVDb2x1bW4gPSAwO1xuXHRcdFx0Zm9yIChqID0gMCwgbGVuSiA9IGxpbmVzW2ldLmNvbW1lbnRTdHJPZmZzZXQ7IGN1cnJlbnRWaXNpYmxlQ29sdW1uIDwgbWluVmlzaWJsZUNvbHVtbiAmJiBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdGN1cnJlbnRWaXNpYmxlQ29sdW1uID0gTGluZUNvbW1lbnRDb21tYW5kLm5leHRWaXNpYmxlQ29sdW1uKGN1cnJlbnRWaXNpYmxlQ29sdW1uLCBpbmRlbnRTaXplLCBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGopID09PSBDaGFyQ29kZS5UYWIsIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VycmVudFZpc2libGVDb2x1bW4gPiBtaW5WaXNpYmxlQ29sdW1uKSB7XG5cdFx0XHRcdGxpbmVzW2ldLmNvbW1lbnRTdHJPZmZzZXQgPSBqIC0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxpbmVzW2ldLmNvbW1lbnRTdHJPZmZzZXQgPSBqO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUJBQTJDO0FBQ3BELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUkxQixTQUFTLDJCQUEyQjtBQTRCN0IsSUFBVyxP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
