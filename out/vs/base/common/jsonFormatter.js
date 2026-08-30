import { createScanner, ScanError, SyntaxKind } from "./json.js";
function format(documentText, range, options) {
  let initialIndentLevel;
  let formatText;
  let formatTextStart;
  let rangeStart;
  let rangeEnd;
  if (range) {
    rangeStart = range.offset;
    rangeEnd = rangeStart + range.length;
    formatTextStart = rangeStart;
    while (formatTextStart > 0 && !isEOL(documentText, formatTextStart - 1)) {
      formatTextStart--;
    }
    let endOffset = rangeEnd;
    while (endOffset < documentText.length && !isEOL(documentText, endOffset)) {
      endOffset++;
    }
    formatText = documentText.substring(formatTextStart, endOffset);
    initialIndentLevel = computeIndentLevel(formatText, options);
  } else {
    formatText = documentText;
    initialIndentLevel = 0;
    formatTextStart = 0;
    rangeStart = 0;
    rangeEnd = documentText.length;
  }
  const eol = getEOL(options, documentText);
  let lineBreak = false;
  let indentLevel = 0;
  let indentValue;
  if (options.insertSpaces) {
    indentValue = repeat(" ", options.tabSize || 4);
  } else {
    indentValue = "	";
  }
  const scanner = createScanner(formatText, false);
  let hasError = false;
  function newLineAndIndent() {
    return eol + repeat(indentValue, initialIndentLevel + indentLevel);
  }
  function scanNext() {
    let token = scanner.scan();
    lineBreak = false;
    while (token === SyntaxKind.Trivia || token === SyntaxKind.LineBreakTrivia) {
      lineBreak = lineBreak || token === SyntaxKind.LineBreakTrivia;
      token = scanner.scan();
    }
    hasError = token === SyntaxKind.Unknown || scanner.getTokenError() !== ScanError.None;
    return token;
  }
  const editOperations = [];
  function addEdit(text, startOffset, endOffset) {
    if (!hasError && startOffset < rangeEnd && endOffset > rangeStart && documentText.substring(startOffset, endOffset) !== text) {
      editOperations.push({ offset: startOffset, length: endOffset - startOffset, content: text });
    }
  }
  let firstToken = scanNext();
  if (firstToken !== SyntaxKind.EOF) {
    const firstTokenStart = scanner.getTokenOffset() + formatTextStart;
    const initialIndent = repeat(indentValue, initialIndentLevel);
    addEdit(initialIndent, formatTextStart, firstTokenStart);
  }
  while (firstToken !== SyntaxKind.EOF) {
    let firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
    let secondToken = scanNext();
    let replaceContent = "";
    while (!lineBreak && (secondToken === SyntaxKind.LineCommentTrivia || secondToken === SyntaxKind.BlockCommentTrivia)) {
      const commentTokenStart = scanner.getTokenOffset() + formatTextStart;
      addEdit(" ", firstTokenEnd, commentTokenStart);
      firstTokenEnd = scanner.getTokenOffset() + scanner.getTokenLength() + formatTextStart;
      replaceContent = secondToken === SyntaxKind.LineCommentTrivia ? newLineAndIndent() : "";
      secondToken = scanNext();
    }
    if (secondToken === SyntaxKind.CloseBraceToken) {
      if (firstToken !== SyntaxKind.OpenBraceToken) {
        indentLevel--;
        replaceContent = newLineAndIndent();
      }
    } else if (secondToken === SyntaxKind.CloseBracketToken) {
      if (firstToken !== SyntaxKind.OpenBracketToken) {
        indentLevel--;
        replaceContent = newLineAndIndent();
      }
    } else {
      switch (firstToken) {
        case SyntaxKind.OpenBracketToken:
        case SyntaxKind.OpenBraceToken:
          indentLevel++;
          replaceContent = newLineAndIndent();
          break;
        case SyntaxKind.CommaToken:
        case SyntaxKind.LineCommentTrivia:
          replaceContent = newLineAndIndent();
          break;
        case SyntaxKind.BlockCommentTrivia:
          if (lineBreak) {
            replaceContent = newLineAndIndent();
          } else {
            replaceContent = " ";
          }
          break;
        case SyntaxKind.ColonToken:
          replaceContent = " ";
          break;
        case SyntaxKind.StringLiteral:
          if (secondToken === SyntaxKind.ColonToken) {
            replaceContent = "";
            break;
          }
        // fall through
        case SyntaxKind.NullKeyword:
        case SyntaxKind.TrueKeyword:
        case SyntaxKind.FalseKeyword:
        case SyntaxKind.NumericLiteral:
        case SyntaxKind.CloseBraceToken:
        case SyntaxKind.CloseBracketToken:
          if (secondToken === SyntaxKind.LineCommentTrivia || secondToken === SyntaxKind.BlockCommentTrivia) {
            replaceContent = " ";
          } else if (secondToken !== SyntaxKind.CommaToken && secondToken !== SyntaxKind.EOF) {
            hasError = true;
          }
          break;
        case SyntaxKind.Unknown:
          hasError = true;
          break;
      }
      if (lineBreak && (secondToken === SyntaxKind.LineCommentTrivia || secondToken === SyntaxKind.BlockCommentTrivia)) {
        replaceContent = newLineAndIndent();
      }
    }
    const secondTokenStart = scanner.getTokenOffset() + formatTextStart;
    addEdit(replaceContent, firstTokenEnd, secondTokenStart);
    firstToken = secondToken;
  }
  return editOperations;
}
function toFormattedString(obj, options) {
  const content = JSON.stringify(obj, void 0, options.insertSpaces ? options.tabSize || 4 : "	");
  if (options.eol !== void 0) {
    return content.replace(/\r\n|\r|\n/g, options.eol);
  }
  return content;
}
function repeat(s, count) {
  let result = "";
  for (let i = 0; i < count; i++) {
    result += s;
  }
  return result;
}
function computeIndentLevel(content, options) {
  let i = 0;
  let nChars = 0;
  const tabSize = options.tabSize || 4;
  while (i < content.length) {
    const ch = content.charAt(i);
    if (ch === " ") {
      nChars++;
    } else if (ch === "	") {
      nChars += tabSize;
    } else {
      break;
    }
    i++;
  }
  return Math.floor(nChars / tabSize);
}
function getEOL(options, text) {
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\r") {
      if (i + 1 < text.length && text.charAt(i + 1) === "\n") {
        return "\r\n";
      }
      return "\r";
    } else if (ch === "\n") {
      return "\n";
    }
  }
  return options && options.eol || "\n";
}
function isEOL(text, offset) {
  return "\r\n".indexOf(text.charAt(offset)) !== -1;
}
export {
  format,
  getEOL,
  isEOL,
  toFormattedString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxjb21tb25cXGpzb25Gb3JtYXR0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjcmVhdGVTY2FubmVyLCBTY2FuRXJyb3IsIFN5bnRheEtpbmQgfSBmcm9tICcuL2pzb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIEZvcm1hdHRpbmdPcHRpb25zIHtcblx0LyoqXG5cdCAqIElmIGluZGVudGF0aW9uIGlzIGJhc2VkIG9uIHNwYWNlcyAoYGluc2VydFNwYWNlc2AgPSB0cnVlKSwgdGhlbiB3aGF0IGlzIHRoZSBudW1iZXIgb2Ygc3BhY2VzIHRoYXQgbWFrZSBhbiBpbmRlbnQ/XG5cdCAqL1xuXHR0YWJTaXplPzogbnVtYmVyO1xuXHQvKipcblx0ICogSXMgaW5kZW50YXRpb24gYmFzZWQgb24gc3BhY2VzP1xuXHQgKi9cblx0aW5zZXJ0U3BhY2VzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoZSBkZWZhdWx0ICdlbmQgb2YgbGluZScgY2hhcmFjdGVyLiBJZiBub3Qgc2V0LCAnXFxuJyBpcyB1c2VkIGFzIGRlZmF1bHQuXG5cdCAqL1xuXHRlb2w/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHRleHQgbW9kaWZpY2F0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdCB7XG5cdC8qKlxuXHQgKiBUaGUgc3RhcnQgb2Zmc2V0IG9mIHRoZSBtb2RpZmljYXRpb24uXG5cdCAqL1xuXHRvZmZzZXQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSBsZW5ndGggb2YgdGhlIG1vZGlmaWNhdGlvbi4gTXVzdCBub3QgYmUgbmVnYXRpdmUuIEVtcHR5IGxlbmd0aCByZXByZXNlbnRzIGFuICppbnNlcnQqLlxuXHQgKi9cblx0bGVuZ3RoOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgbmV3IGNvbnRlbnQuIEVtcHR5IGNvbnRlbnQgcmVwcmVzZW50cyBhICpyZW1vdmUqLlxuXHQgKi9cblx0Y29udGVudDogc3RyaW5nO1xufVxuXG4vKipcbiAqIEEgdGV4dCByYW5nZSBpbiB0aGUgZG9jdW1lbnRcbiovXG5leHBvcnQgaW50ZXJmYWNlIFJhbmdlIHtcblx0LyoqXG5cdCAqIFRoZSBzdGFydCBvZmZzZXQgb2YgdGhlIHJhbmdlLlxuXHQgKi9cblx0b2Zmc2V0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgbGVuZ3RoIG9mIHRoZSByYW5nZS4gTXVzdCBub3QgYmUgbmVnYXRpdmUuXG5cdCAqL1xuXHRsZW5ndGg6IG51bWJlcjtcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0KGRvY3VtZW50VGV4dDogc3RyaW5nLCByYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQsIG9wdGlvbnM6IEZvcm1hdHRpbmdPcHRpb25zKTogRWRpdFtdIHtcblx0bGV0IGluaXRpYWxJbmRlbnRMZXZlbDogbnVtYmVyO1xuXHRsZXQgZm9ybWF0VGV4dDogc3RyaW5nO1xuXHRsZXQgZm9ybWF0VGV4dFN0YXJ0OiBudW1iZXI7XG5cdGxldCByYW5nZVN0YXJ0OiBudW1iZXI7XG5cdGxldCByYW5nZUVuZDogbnVtYmVyO1xuXHRpZiAocmFuZ2UpIHtcblx0XHRyYW5nZVN0YXJ0ID0gcmFuZ2Uub2Zmc2V0O1xuXHRcdHJhbmdlRW5kID0gcmFuZ2VTdGFydCArIHJhbmdlLmxlbmd0aDtcblxuXHRcdGZvcm1hdFRleHRTdGFydCA9IHJhbmdlU3RhcnQ7XG5cdFx0d2hpbGUgKGZvcm1hdFRleHRTdGFydCA+IDAgJiYgIWlzRU9MKGRvY3VtZW50VGV4dCwgZm9ybWF0VGV4dFN0YXJ0IC0gMSkpIHtcblx0XHRcdGZvcm1hdFRleHRTdGFydC0tO1xuXHRcdH1cblx0XHRsZXQgZW5kT2Zmc2V0ID0gcmFuZ2VFbmQ7XG5cdFx0d2hpbGUgKGVuZE9mZnNldCA8IGRvY3VtZW50VGV4dC5sZW5ndGggJiYgIWlzRU9MKGRvY3VtZW50VGV4dCwgZW5kT2Zmc2V0KSkge1xuXHRcdFx0ZW5kT2Zmc2V0Kys7XG5cdFx0fVxuXHRcdGZvcm1hdFRleHQgPSBkb2N1bWVudFRleHQuc3Vic3RyaW5nKGZvcm1hdFRleHRTdGFydCwgZW5kT2Zmc2V0KTtcblx0XHRpbml0aWFsSW5kZW50TGV2ZWwgPSBjb21wdXRlSW5kZW50TGV2ZWwoZm9ybWF0VGV4dCwgb3B0aW9ucyk7XG5cdH0gZWxzZSB7XG5cdFx0Zm9ybWF0VGV4dCA9IGRvY3VtZW50VGV4dDtcblx0XHRpbml0aWFsSW5kZW50TGV2ZWwgPSAwO1xuXHRcdGZvcm1hdFRleHRTdGFydCA9IDA7XG5cdFx0cmFuZ2VTdGFydCA9IDA7XG5cdFx0cmFuZ2VFbmQgPSBkb2N1bWVudFRleHQubGVuZ3RoO1xuXHR9XG5cdGNvbnN0IGVvbCA9IGdldEVPTChvcHRpb25zLCBkb2N1bWVudFRleHQpO1xuXG5cdGxldCBsaW5lQnJlYWsgPSBmYWxzZTtcblx0bGV0IGluZGVudExldmVsID0gMDtcblx0bGV0IGluZGVudFZhbHVlOiBzdHJpbmc7XG5cdGlmIChvcHRpb25zLmluc2VydFNwYWNlcykge1xuXHRcdGluZGVudFZhbHVlID0gcmVwZWF0KCcgJywgb3B0aW9ucy50YWJTaXplIHx8IDQpO1xuXHR9IGVsc2Uge1xuXHRcdGluZGVudFZhbHVlID0gJ1xcdCc7XG5cdH1cblxuXHRjb25zdCBzY2FubmVyID0gY3JlYXRlU2Nhbm5lcihmb3JtYXRUZXh0LCBmYWxzZSk7XG5cdGxldCBoYXNFcnJvciA9IGZhbHNlO1xuXG5cdGZ1bmN0aW9uIG5ld0xpbmVBbmRJbmRlbnQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZW9sICsgcmVwZWF0KGluZGVudFZhbHVlLCBpbml0aWFsSW5kZW50TGV2ZWwgKyBpbmRlbnRMZXZlbCk7XG5cdH1cblx0ZnVuY3Rpb24gc2Nhbk5leHQoKTogU3ludGF4S2luZCB7XG5cdFx0bGV0IHRva2VuID0gc2Nhbm5lci5zY2FuKCk7XG5cdFx0bGluZUJyZWFrID0gZmFsc2U7XG5cdFx0d2hpbGUgKHRva2VuID09PSBTeW50YXhLaW5kLlRyaXZpYSB8fCB0b2tlbiA9PT0gU3ludGF4S2luZC5MaW5lQnJlYWtUcml2aWEpIHtcblx0XHRcdGxpbmVCcmVhayA9IGxpbmVCcmVhayB8fCAodG9rZW4gPT09IFN5bnRheEtpbmQuTGluZUJyZWFrVHJpdmlhKTtcblx0XHRcdHRva2VuID0gc2Nhbm5lci5zY2FuKCk7XG5cdFx0fVxuXHRcdGhhc0Vycm9yID0gdG9rZW4gPT09IFN5bnRheEtpbmQuVW5rbm93biB8fCBzY2FubmVyLmdldFRva2VuRXJyb3IoKSAhPT0gU2NhbkVycm9yLk5vbmU7XG5cdFx0cmV0dXJuIHRva2VuO1xuXHR9XG5cdGNvbnN0IGVkaXRPcGVyYXRpb25zOiBFZGl0W10gPSBbXTtcblx0ZnVuY3Rpb24gYWRkRWRpdCh0ZXh0OiBzdHJpbmcsIHN0YXJ0T2Zmc2V0OiBudW1iZXIsIGVuZE9mZnNldDogbnVtYmVyKSB7XG5cdFx0aWYgKCFoYXNFcnJvciAmJiBzdGFydE9mZnNldCA8IHJhbmdlRW5kICYmIGVuZE9mZnNldCA+IHJhbmdlU3RhcnQgJiYgZG9jdW1lbnRUZXh0LnN1YnN0cmluZyhzdGFydE9mZnNldCwgZW5kT2Zmc2V0KSAhPT0gdGV4dCkge1xuXHRcdFx0ZWRpdE9wZXJhdGlvbnMucHVzaCh7IG9mZnNldDogc3RhcnRPZmZzZXQsIGxlbmd0aDogZW5kT2Zmc2V0IC0gc3RhcnRPZmZzZXQsIGNvbnRlbnQ6IHRleHQgfSk7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGZpcnN0VG9rZW4gPSBzY2FuTmV4dCgpO1xuXG5cdGlmIChmaXJzdFRva2VuICE9PSBTeW50YXhLaW5kLkVPRikge1xuXHRcdGNvbnN0IGZpcnN0VG9rZW5TdGFydCA9IHNjYW5uZXIuZ2V0VG9rZW5PZmZzZXQoKSArIGZvcm1hdFRleHRTdGFydDtcblx0XHRjb25zdCBpbml0aWFsSW5kZW50ID0gcmVwZWF0KGluZGVudFZhbHVlLCBpbml0aWFsSW5kZW50TGV2ZWwpO1xuXHRcdGFkZEVkaXQoaW5pdGlhbEluZGVudCwgZm9ybWF0VGV4dFN0YXJ0LCBmaXJzdFRva2VuU3RhcnQpO1xuXHR9XG5cblx0d2hpbGUgKGZpcnN0VG9rZW4gIT09IFN5bnRheEtpbmQuRU9GKSB7XG5cdFx0bGV0IGZpcnN0VG9rZW5FbmQgPSBzY2FubmVyLmdldFRva2VuT2Zmc2V0KCkgKyBzY2FubmVyLmdldFRva2VuTGVuZ3RoKCkgKyBmb3JtYXRUZXh0U3RhcnQ7XG5cdFx0bGV0IHNlY29uZFRva2VuID0gc2Nhbk5leHQoKTtcblxuXHRcdGxldCByZXBsYWNlQ29udGVudCA9ICcnO1xuXHRcdHdoaWxlICghbGluZUJyZWFrICYmIChzZWNvbmRUb2tlbiA9PT0gU3ludGF4S2luZC5MaW5lQ29tbWVudFRyaXZpYSB8fCBzZWNvbmRUb2tlbiA9PT0gU3ludGF4S2luZC5CbG9ja0NvbW1lbnRUcml2aWEpKSB7XG5cdFx0XHQvLyBjb21tZW50cyBvbiB0aGUgc2FtZSBsaW5lOiBrZWVwIHRoZW0gb24gdGhlIHNhbWUgbGluZSwgYnV0IGlnbm9yZSB0aGVtIG90aGVyd2lzZVxuXHRcdFx0Y29uc3QgY29tbWVudFRva2VuU3RhcnQgPSBzY2FubmVyLmdldFRva2VuT2Zmc2V0KCkgKyBmb3JtYXRUZXh0U3RhcnQ7XG5cdFx0XHRhZGRFZGl0KCcgJywgZmlyc3RUb2tlbkVuZCwgY29tbWVudFRva2VuU3RhcnQpO1xuXHRcdFx0Zmlyc3RUb2tlbkVuZCA9IHNjYW5uZXIuZ2V0VG9rZW5PZmZzZXQoKSArIHNjYW5uZXIuZ2V0VG9rZW5MZW5ndGgoKSArIGZvcm1hdFRleHRTdGFydDtcblx0XHRcdHJlcGxhY2VDb250ZW50ID0gc2Vjb25kVG9rZW4gPT09IFN5bnRheEtpbmQuTGluZUNvbW1lbnRUcml2aWEgPyBuZXdMaW5lQW5kSW5kZW50KCkgOiAnJztcblx0XHRcdHNlY29uZFRva2VuID0gc2Nhbk5leHQoKTtcblx0XHR9XG5cblx0XHRpZiAoc2Vjb25kVG9rZW4gPT09IFN5bnRheEtpbmQuQ2xvc2VCcmFjZVRva2VuKSB7XG5cdFx0XHRpZiAoZmlyc3RUb2tlbiAhPT0gU3ludGF4S2luZC5PcGVuQnJhY2VUb2tlbikge1xuXHRcdFx0XHRpbmRlbnRMZXZlbC0tO1xuXHRcdFx0XHRyZXBsYWNlQ29udGVudCA9IG5ld0xpbmVBbmRJbmRlbnQoKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHNlY29uZFRva2VuID09PSBTeW50YXhLaW5kLkNsb3NlQnJhY2tldFRva2VuKSB7XG5cdFx0XHRpZiAoZmlyc3RUb2tlbiAhPT0gU3ludGF4S2luZC5PcGVuQnJhY2tldFRva2VuKSB7XG5cdFx0XHRcdGluZGVudExldmVsLS07XG5cdFx0XHRcdHJlcGxhY2VDb250ZW50ID0gbmV3TGluZUFuZEluZGVudCgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRzd2l0Y2ggKGZpcnN0VG9rZW4pIHtcblx0XHRcdFx0Y2FzZSBTeW50YXhLaW5kLk9wZW5CcmFja2V0VG9rZW46XG5cdFx0XHRcdGNhc2UgU3ludGF4S2luZC5PcGVuQnJhY2VUb2tlbjpcblx0XHRcdFx0XHRpbmRlbnRMZXZlbCsrO1xuXHRcdFx0XHRcdHJlcGxhY2VDb250ZW50ID0gbmV3TGluZUFuZEluZGVudCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFN5bnRheEtpbmQuQ29tbWFUb2tlbjpcblx0XHRcdFx0Y2FzZSBTeW50YXhLaW5kLkxpbmVDb21tZW50VHJpdmlhOlxuXHRcdFx0XHRcdHJlcGxhY2VDb250ZW50ID0gbmV3TGluZUFuZEluZGVudCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFN5bnRheEtpbmQuQmxvY2tDb21tZW50VHJpdmlhOlxuXHRcdFx0XHRcdGlmIChsaW5lQnJlYWspIHtcblx0XHRcdFx0XHRcdHJlcGxhY2VDb250ZW50ID0gbmV3TGluZUFuZEluZGVudCgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBzeW1ib2wgZm9sbG93aW5nIGNvbW1lbnQgb24gdGhlIHNhbWUgbGluZToga2VlcCBvbiBzYW1lIGxpbmUsIHNlcGFyYXRlIHdpdGggJyAnXG5cdFx0XHRcdFx0XHRyZXBsYWNlQ29udGVudCA9ICcgJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU3ludGF4S2luZC5Db2xvblRva2VuOlxuXHRcdFx0XHRcdHJlcGxhY2VDb250ZW50ID0gJyAnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFN5bnRheEtpbmQuU3RyaW5nTGl0ZXJhbDpcblx0XHRcdFx0XHRpZiAoc2Vjb25kVG9rZW4gPT09IFN5bnRheEtpbmQuQ29sb25Ub2tlbikge1xuXHRcdFx0XHRcdFx0cmVwbGFjZUNvbnRlbnQgPSAnJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0Ly8gZmFsbCB0aHJvdWdoXG5cdFx0XHRcdGNhc2UgU3ludGF4S2luZC5OdWxsS2V5d29yZDpcblx0XHRcdFx0Y2FzZSBTeW50YXhLaW5kLlRydWVLZXl3b3JkOlxuXHRcdFx0XHRjYXNlIFN5bnRheEtpbmQuRmFsc2VLZXl3b3JkOlxuXHRcdFx0XHRjYXNlIFN5bnRheEtpbmQuTnVtZXJpY0xpdGVyYWw6XG5cdFx0XHRcdGNhc2UgU3ludGF4S2luZC5DbG9zZUJyYWNlVG9rZW46XG5cdFx0XHRcdGNhc2UgU3ludGF4S2luZC5DbG9zZUJyYWNrZXRUb2tlbjpcblx0XHRcdFx0XHRpZiAoc2Vjb25kVG9rZW4gPT09IFN5bnRheEtpbmQuTGluZUNvbW1lbnRUcml2aWEgfHwgc2Vjb25kVG9rZW4gPT09IFN5bnRheEtpbmQuQmxvY2tDb21tZW50VHJpdmlhKSB7XG5cdFx0XHRcdFx0XHRyZXBsYWNlQ29udGVudCA9ICcgJztcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHNlY29uZFRva2VuICE9PSBTeW50YXhLaW5kLkNvbW1hVG9rZW4gJiYgc2Vjb25kVG9rZW4gIT09IFN5bnRheEtpbmQuRU9GKSB7XG5cdFx0XHRcdFx0XHRoYXNFcnJvciA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFN5bnRheEtpbmQuVW5rbm93bjpcblx0XHRcdFx0XHRoYXNFcnJvciA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAobGluZUJyZWFrICYmIChzZWNvbmRUb2tlbiA9PT0gU3ludGF4S2luZC5MaW5lQ29tbWVudFRyaXZpYSB8fCBzZWNvbmRUb2tlbiA9PT0gU3ludGF4S2luZC5CbG9ja0NvbW1lbnRUcml2aWEpKSB7XG5cdFx0XHRcdHJlcGxhY2VDb250ZW50ID0gbmV3TGluZUFuZEluZGVudCgpO1xuXHRcdFx0fVxuXG5cdFx0fVxuXHRcdGNvbnN0IHNlY29uZFRva2VuU3RhcnQgPSBzY2FubmVyLmdldFRva2VuT2Zmc2V0KCkgKyBmb3JtYXRUZXh0U3RhcnQ7XG5cdFx0YWRkRWRpdChyZXBsYWNlQ29udGVudCwgZmlyc3RUb2tlbkVuZCwgc2Vjb25kVG9rZW5TdGFydCk7XG5cdFx0Zmlyc3RUb2tlbiA9IHNlY29uZFRva2VuO1xuXHR9XG5cdHJldHVybiBlZGl0T3BlcmF0aW9ucztcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgZm9ybWF0dGVkIHN0cmluZyBvdXQgb2YgdGhlIG9iamVjdCBwYXNzZWQgYXMgYXJndW1lbnQsIHVzaW5nIHRoZSBnaXZlbiBmb3JtYXR0aW5nIG9wdGlvbnNcbiAqIEBwYXJhbSBhbnkgVGhlIG9iamVjdCB0byBzdHJpbmdpZnkgYW5kIGZvcm1hdFxuICogQHBhcmFtIG9wdGlvbnMgVGhlIGZvcm1hdHRpbmcgb3B0aW9ucyB0byB1c2VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvRm9ybWF0dGVkU3RyaW5nKG9iajogdW5rbm93biwgb3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMpIHtcblx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KG9iaiwgdW5kZWZpbmVkLCBvcHRpb25zLmluc2VydFNwYWNlcyA/IG9wdGlvbnMudGFiU2l6ZSB8fCA0IDogJ1xcdCcpO1xuXHRpZiAob3B0aW9ucy5lb2wgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjb250ZW50LnJlcGxhY2UoL1xcclxcbnxcXHJ8XFxuL2csIG9wdGlvbnMuZW9sKTtcblx0fVxuXHRyZXR1cm4gY29udGVudDtcbn1cblxuZnVuY3Rpb24gcmVwZWF0KHM6IHN0cmluZywgY291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdGxldCByZXN1bHQgPSAnJztcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0cmVzdWx0ICs9IHM7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZUluZGVudExldmVsKGNvbnRlbnQ6IHN0cmluZywgb3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMpOiBudW1iZXIge1xuXHRsZXQgaSA9IDA7XG5cdGxldCBuQ2hhcnMgPSAwO1xuXHRjb25zdCB0YWJTaXplID0gb3B0aW9ucy50YWJTaXplIHx8IDQ7XG5cdHdoaWxlIChpIDwgY29udGVudC5sZW5ndGgpIHtcblx0XHRjb25zdCBjaCA9IGNvbnRlbnQuY2hhckF0KGkpO1xuXHRcdGlmIChjaCA9PT0gJyAnKSB7XG5cdFx0XHRuQ2hhcnMrKztcblx0XHR9IGVsc2UgaWYgKGNoID09PSAnXFx0Jykge1xuXHRcdFx0bkNoYXJzICs9IHRhYlNpemU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRpKys7XG5cdH1cblx0cmV0dXJuIE1hdGguZmxvb3IobkNoYXJzIC8gdGFiU2l6ZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFT0wob3B0aW9uczogRm9ybWF0dGluZ09wdGlvbnMsIHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGNoID0gdGV4dC5jaGFyQXQoaSk7XG5cdFx0aWYgKGNoID09PSAnXFxyJykge1xuXHRcdFx0aWYgKGkgKyAxIDwgdGV4dC5sZW5ndGggJiYgdGV4dC5jaGFyQXQoaSArIDEpID09PSAnXFxuJykge1xuXHRcdFx0XHRyZXR1cm4gJ1xcclxcbic7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gJ1xccic7XG5cdFx0fSBlbHNlIGlmIChjaCA9PT0gJ1xcbicpIHtcblx0XHRcdHJldHVybiAnXFxuJztcblx0XHR9XG5cdH1cblx0cmV0dXJuIChvcHRpb25zICYmIG9wdGlvbnMuZW9sKSB8fCAnXFxuJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRU9MKHRleHQ6IHN0cmluZywgb2Zmc2V0OiBudW1iZXIpIHtcblx0cmV0dXJuICdcXHJcXG4nLmluZGV4T2YodGV4dC5jaGFyQXQob2Zmc2V0KSkgIT09IC0xO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlLFdBQVcsa0JBQWtCO0FBa0Q5QyxTQUFTLE9BQU8sY0FBc0IsT0FBMEIsU0FBb0M7QUFDMUcsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJLE9BQU87QUFDVixpQkFBYSxNQUFNO0FBQ25CLGVBQVcsYUFBYSxNQUFNO0FBRTlCLHNCQUFrQjtBQUNsQixXQUFPLGtCQUFrQixLQUFLLENBQUMsTUFB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
