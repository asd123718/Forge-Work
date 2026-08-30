import { Range } from "../../../../editor/common/core/range.js";
const getFileResults = (bytes, pattern, options) => {
  let text;
  if (bytes[0] === 255 && bytes[1] === 254) {
    text = new TextDecoder("utf-16le").decode(bytes);
  } else if (bytes[0] === 254 && bytes[1] === 255) {
    text = new TextDecoder("utf-16be").decode(bytes);
  } else {
    text = new TextDecoder("utf8").decode(bytes);
    if (text.slice(0, 1e3).includes("\uFFFD") && bytes.includes(0)) {
      return [];
    }
  }
  const results = [];
  const patternIndices = [];
  let patternMatch = null;
  let remainingResultQuota = options.remainingResultQuota;
  while (remainingResultQuota >= 0 && (patternMatch = pattern.exec(text))) {
    patternIndices.push({ matchStartIndex: patternMatch.index, matchedText: patternMatch[0] });
    remainingResultQuota--;
  }
  if (patternIndices.length) {
    const contextLinesNeeded = /* @__PURE__ */ new Set();
    const resultLines = /* @__PURE__ */ new Set();
    const lineRanges = [];
    const readLine = (lineNumber) => text.slice(lineRanges[lineNumber].start, lineRanges[lineNumber].end);
    let prevLineEnd = 0;
    let lineEndingMatch = null;
    const lineEndRegex = /\r?\n/g;
    while (lineEndingMatch = lineEndRegex.exec(text)) {
      lineRanges.push({ start: prevLineEnd, end: lineEndingMatch.index });
      prevLineEnd = lineEndingMatch.index + lineEndingMatch[0].length;
    }
    if (prevLineEnd < text.length) {
      lineRanges.push({ start: prevLineEnd, end: text.length });
    }
    let startLine = 0;
    for (const { matchStartIndex, matchedText } of patternIndices) {
      if (remainingResultQuota < 0) {
        break;
      }
      while (Boolean(lineRanges[startLine + 1]) && matchStartIndex > lineRanges[startLine].end) {
        startLine++;
      }
      let endLine = startLine;
      while (Boolean(lineRanges[endLine + 1]) && matchStartIndex + matchedText.length > lineRanges[endLine].end) {
        endLine++;
      }
      if (options.surroundingContext) {
        for (let contextLine = Math.max(0, startLine - options.surroundingContext); contextLine < startLine; contextLine++) {
          contextLinesNeeded.add(contextLine);
        }
      }
      let previewText = "";
      let offset = 0;
      for (let matchLine = startLine; matchLine <= endLine; matchLine++) {
        let previewLine = readLine(matchLine);
        if (options.previewOptions?.charsPerLine && previewLine.length > options.previewOptions.charsPerLine) {
          offset = Math.max(matchStartIndex - lineRanges[startLine].start - 20, 0);
          previewLine = previewLine.substr(offset, options.previewOptions.charsPerLine);
        }
        previewText += `${previewLine}
`;
        resultLines.add(matchLine);
      }
      const fileRange = new Range(
        startLine,
        matchStartIndex - lineRanges[startLine].start,
        endLine,
        matchStartIndex + matchedText.length - lineRanges[endLine].start
      );
      const previewRange = new Range(
        0,
        matchStartIndex - lineRanges[startLine].start - offset,
        endLine - startLine,
        matchStartIndex + matchedText.length - lineRanges[endLine].start - (endLine === startLine ? offset : 0)
      );
      const match = {
        rangeLocations: [{
          source: fileRange,
          preview: previewRange
        }],
        previewText
      };
      results.push(match);
      if (options.surroundingContext) {
        for (let contextLine = endLine + 1; contextLine <= Math.min(endLine + options.surroundingContext, lineRanges.length - 1); contextLine++) {
          contextLinesNeeded.add(contextLine);
        }
      }
    }
    for (const contextLine of contextLinesNeeded) {
      if (!resultLines.has(contextLine)) {
        results.push({
          text: readLine(contextLine),
          lineNumber: contextLine + 1
        });
      }
    }
  }
  return results;
};
export {
  getFileResults
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXGNvbW1vblxcZ2V0RmlsZVJlc3VsdHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJVGV4dFNlYXJjaE1hdGNoLCBJVGV4dFNlYXJjaFByZXZpZXdPcHRpb25zLCBJVGV4dFNlYXJjaFJlc3VsdCB9IGZyb20gJy4vc2VhcmNoLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcblxuZXhwb3J0IGNvbnN0IGdldEZpbGVSZXN1bHRzID0gKFxuXHRieXRlczogVWludDhBcnJheSxcblx0cGF0dGVybjogUmVnRXhwLFxuXHRvcHRpb25zOiB7XG5cdFx0c3Vycm91bmRpbmdDb250ZXh0OiBudW1iZXI7XG5cdFx0cHJldmlld09wdGlvbnM6IElUZXh0U2VhcmNoUHJldmlld09wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0cmVtYWluaW5nUmVzdWx0UXVvdGE6IG51bWJlcjtcblx0fVxuKTogSVRleHRTZWFyY2hSZXN1bHRbXSA9PiB7XG5cblx0bGV0IHRleHQ6IHN0cmluZztcblx0aWYgKGJ5dGVzWzBdID09PSAweGZmICYmIGJ5dGVzWzFdID09PSAweGZlKSB7XG5cdFx0dGV4dCA9IG5ldyBUZXh0RGVjb2RlcigndXRmLTE2bGUnKS5kZWNvZGUoYnl0ZXMpO1xuXHR9IGVsc2UgaWYgKGJ5dGVzWzBdID09PSAweGZlICYmIGJ5dGVzWzFdID09PSAweGZmKSB7XG5cdFx0dGV4dCA9IG5ldyBUZXh0RGVjb2RlcigndXRmLTE2YmUnKS5kZWNvZGUoYnl0ZXMpO1xuXHR9IGVsc2Uge1xuXHRcdHRleHQgPSBuZXcgVGV4dERlY29kZXIoJ3V0ZjgnKS5kZWNvZGUoYnl0ZXMpO1xuXHRcdGlmICh0ZXh0LnNsaWNlKDAsIDEwMDApLmluY2x1ZGVzKCdcXHVGRkZEJykgJiYgYnl0ZXMuaW5jbHVkZXMoMCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRjb25zdCByZXN1bHRzOiBJVGV4dFNlYXJjaFJlc3VsdFtdID0gW107XG5cblx0Y29uc3QgcGF0dGVybkluZGljZXM6IHsgbWF0Y2hTdGFydEluZGV4OiBudW1iZXI7IG1hdGNoZWRUZXh0OiBzdHJpbmcgfVtdID0gW107XG5cblx0bGV0IHBhdHRlcm5NYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cdGxldCByZW1haW5pbmdSZXN1bHRRdW90YSA9IG9wdGlvbnMucmVtYWluaW5nUmVzdWx0UXVvdGE7XG5cdHdoaWxlIChyZW1haW5pbmdSZXN1bHRRdW90YSA+PSAwICYmIChwYXR0ZXJuTWF0Y2ggPSBwYXR0ZXJuLmV4ZWModGV4dCkpKSB7XG5cdFx0cGF0dGVybkluZGljZXMucHVzaCh7IG1hdGNoU3RhcnRJbmRleDogcGF0dGVybk1hdGNoLmluZGV4LCBtYXRjaGVkVGV4dDogcGF0dGVybk1hdGNoWzBdIH0pO1xuXHRcdHJlbWFpbmluZ1Jlc3VsdFF1b3RhLS07XG5cdH1cblxuXHRpZiAocGF0dGVybkluZGljZXMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgY29udGV4dExpbmVzTmVlZGVkID0gbmV3IFNldDxudW1iZXI+KCk7XG5cdFx0Y29uc3QgcmVzdWx0TGluZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGNvbnN0IGxpbmVSYW5nZXM6IHsgc3RhcnQ6IG51bWJlcjsgZW5kOiBudW1iZXIgfVtdID0gW107XG5cdFx0Y29uc3QgcmVhZExpbmUgPSAobGluZU51bWJlcjogbnVtYmVyKSA9PiB0ZXh0LnNsaWNlKGxpbmVSYW5nZXNbbGluZU51bWJlcl0uc3RhcnQsIGxpbmVSYW5nZXNbbGluZU51bWJlcl0uZW5kKTtcblxuXHRcdGxldCBwcmV2TGluZUVuZCA9IDA7XG5cdFx0bGV0IGxpbmVFbmRpbmdNYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbCA9IG51bGw7XG5cdFx0Y29uc3QgbGluZUVuZFJlZ2V4ID0gL1xccj9cXG4vZztcblx0XHR3aGlsZSAoKGxpbmVFbmRpbmdNYXRjaCA9IGxpbmVFbmRSZWdleC5leGVjKHRleHQpKSkge1xuXHRcdFx0bGluZVJhbmdlcy5wdXNoKHsgc3RhcnQ6IHByZXZMaW5lRW5kLCBlbmQ6IGxpbmVFbmRpbmdNYXRjaC5pbmRleCB9KTtcblx0XHRcdHByZXZMaW5lRW5kID0gbGluZUVuZGluZ01hdGNoLmluZGV4ICsgbGluZUVuZGluZ01hdGNoWzBdLmxlbmd0aDtcblx0XHR9XG5cdFx0aWYgKHByZXZMaW5lRW5kIDwgdGV4dC5sZW5ndGgpIHsgbGluZVJhbmdlcy5wdXNoKHsgc3RhcnQ6IHByZXZMaW5lRW5kLCBlbmQ6IHRleHQubGVuZ3RoIH0pOyB9XG5cblx0XHRsZXQgc3RhcnRMaW5lID0gMDtcblx0XHRmb3IgKGNvbnN0IHsgbWF0Y2hTdGFydEluZGV4LCBtYXRjaGVkVGV4dCB9IG9mIHBhdHRlcm5JbmRpY2VzKSB7XG5cdFx0XHRpZiAocmVtYWluaW5nUmVzdWx0UXVvdGEgPCAwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR3aGlsZSAoQm9vbGVhbihsaW5lUmFuZ2VzW3N0YXJ0TGluZSArIDFdKSAmJiBtYXRjaFN0YXJ0SW5kZXggPiBsaW5lUmFuZ2VzW3N0YXJ0TGluZV0uZW5kKSB7XG5cdFx0XHRcdHN0YXJ0TGluZSsrO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGVuZExpbmUgPSBzdGFydExpbmU7XG5cdFx0XHR3aGlsZSAoQm9vbGVhbihsaW5lUmFuZ2VzW2VuZExpbmUgKyAxXSkgJiYgbWF0Y2hTdGFydEluZGV4ICsgbWF0Y2hlZFRleHQubGVuZ3RoID4gbGluZVJhbmdlc1tlbmRMaW5lXS5lbmQpIHtcblx0XHRcdFx0ZW5kTGluZSsrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3B0aW9ucy5zdXJyb3VuZGluZ0NvbnRleHQpIHtcblx0XHRcdFx0Zm9yIChsZXQgY29udGV4dExpbmUgPSBNYXRoLm1heCgwLCBzdGFydExpbmUgLSBvcHRpb25zLnN1cnJvdW5kaW5nQ29udGV4dCk7IGNvbnRleHRMaW5lIDwgc3RhcnRMaW5lOyBjb250ZXh0TGluZSsrKSB7XG5cdFx0XHRcdFx0Y29udGV4dExpbmVzTmVlZGVkLmFkZChjb250ZXh0TGluZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IHByZXZpZXdUZXh0ID0gJyc7XG5cdFx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRcdGZvciAobGV0IG1hdGNoTGluZSA9IHN0YXJ0TGluZTsgbWF0Y2hMaW5lIDw9IGVuZExpbmU7IG1hdGNoTGluZSsrKSB7XG5cdFx0XHRcdGxldCBwcmV2aWV3TGluZSA9IHJlYWRMaW5lKG1hdGNoTGluZSk7XG5cdFx0XHRcdGlmIChvcHRpb25zLnByZXZpZXdPcHRpb25zPy5jaGFyc1BlckxpbmUgJiYgcHJldmlld0xpbmUubGVuZ3RoID4gb3B0aW9ucy5wcmV2aWV3T3B0aW9ucy5jaGFyc1BlckxpbmUpIHtcblx0XHRcdFx0XHRvZmZzZXQgPSBNYXRoLm1heChtYXRjaFN0YXJ0SW5kZXggLSBsaW5lUmFuZ2VzW3N0YXJ0TGluZV0uc3RhcnQgLSAyMCwgMCk7XG5cdFx0XHRcdFx0cHJldmlld0xpbmUgPSBwcmV2aWV3TGluZS5zdWJzdHIob2Zmc2V0LCBvcHRpb25zLnByZXZpZXdPcHRpb25zLmNoYXJzUGVyTGluZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJldmlld1RleHQgKz0gYCR7cHJldmlld0xpbmV9XFxuYDtcblx0XHRcdFx0cmVzdWx0TGluZXMuYWRkKG1hdGNoTGluZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpbGVSYW5nZSA9IG5ldyBSYW5nZShcblx0XHRcdFx0c3RhcnRMaW5lLFxuXHRcdFx0XHRtYXRjaFN0YXJ0SW5kZXggLSBsaW5lUmFuZ2VzW3N0YXJ0TGluZV0uc3RhcnQsXG5cdFx0XHRcdGVuZExpbmUsXG5cdFx0XHRcdG1hdGNoU3RhcnRJbmRleCArIG1hdGNoZWRUZXh0Lmxlbmd0aCAtIGxpbmVSYW5nZXNbZW5kTGluZV0uc3RhcnRcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBwcmV2aWV3UmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRcdDAsXG5cdFx0XHRcdG1hdGNoU3RhcnRJbmRleCAtIGxpbmVSYW5nZXNbc3RhcnRMaW5lXS5zdGFydCAtIG9mZnNldCxcblx0XHRcdFx0ZW5kTGluZSAtIHN0YXJ0TGluZSxcblx0XHRcdFx0bWF0Y2hTdGFydEluZGV4ICsgbWF0Y2hlZFRleHQubGVuZ3RoIC0gbGluZVJhbmdlc1tlbmRMaW5lXS5zdGFydCAtIChlbmRMaW5lID09PSBzdGFydExpbmUgPyBvZmZzZXQgOiAwKVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgbWF0Y2g6IElUZXh0U2VhcmNoTWF0Y2ggPSB7XG5cdFx0XHRcdHJhbmdlTG9jYXRpb25zOiBbe1xuXHRcdFx0XHRcdHNvdXJjZTogZmlsZVJhbmdlLFxuXHRcdFx0XHRcdHByZXZpZXc6IHByZXZpZXdSYW5nZSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHByZXZpZXdUZXh0OiBwcmV2aWV3VGV4dFxuXHRcdFx0fTtcblxuXHRcdFx0cmVzdWx0cy5wdXNoKG1hdGNoKTtcblxuXHRcdFx0aWYgKG9wdGlvbnMuc3Vycm91bmRpbmdDb250ZXh0KSB7XG5cdFx0XHRcdGZvciAobGV0IGNvbnRleHRMaW5lID0gZW5kTGluZSArIDE7IGNvbnRleHRMaW5lIDw9IE1hdGgubWluKGVuZExpbmUgKyBvcHRpb25zLnN1cnJvdW5kaW5nQ29udGV4dCwgbGluZVJhbmdlcy5sZW5ndGggLSAxKTsgY29udGV4dExpbmUrKykge1xuXHRcdFx0XHRcdGNvbnRleHRMaW5lc05lZWRlZC5hZGQoY29udGV4dExpbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgY29udGV4dExpbmUgb2YgY29udGV4dExpbmVzTmVlZGVkKSB7XG5cdFx0XHRpZiAoIXJlc3VsdExpbmVzLmhhcyhjb250ZXh0TGluZSkpIHtcblxuXHRcdFx0XHRyZXN1bHRzLnB1c2goe1xuXHRcdFx0XHRcdHRleHQ6IHJlYWRMaW5lKGNvbnRleHRMaW5lKSxcblx0XHRcdFx0XHRsaW5lTnVtYmVyOiBjb250ZXh0TGluZSArIDEsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0cztcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGFBQWE7QUFFZixNQUFNLGlCQUFpQixDQUM3QixPQUNBLFNBQ0EsWUFLeUI7QUFFekIsTUFBSTtBQUNKLE1BQUksTUFBTSxDQUFDLE1BQU0sT0FBUSxNQUFNLENBQUMsTUFBTSxLQUFNO0FBQzNDLFdBQU8sSUFBSSxZQUFZLFVBQVUsRUFBRSxPQUFPLEtBQUs7QUFBQSxFQUNoRCxXQUFXLE1BQU0sQ0FBQyxNQUFNLE9BQVEsTUFBTSxDQUFDLE1BQU0sS0FBTTtBQUNsRCxXQUFPLElBQUksWUFBWSxVQUFVLEVBQUUsT0FBTyxLQUFLO0FBQUEsRUFDaEQsT0FBTztBQUNOLFdBQU8sSUFBSSxZQUFZLE1BQU0sRUFBRSxPQUFPLEtBQUs7QUFDM0MsUUFBSSxLQUFLLE1BQU0sR0FBRyxHQUFJ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
