import { LinkedList } from "../../../../base/common/linkedList.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
const _BracketSelectionRangeProvider = class _BracketSelectionRangeProvider {
  async provideSelectionRanges(model, positions) {
    const result = [];
    for (const position of positions) {
      const bucket = [];
      result.push(bucket);
      const ranges = /* @__PURE__ */ new Map();
      await new Promise((resolve) => _BracketSelectionRangeProvider._bracketsRightYield(resolve, 0, model, position, ranges));
      await new Promise((resolve) => _BracketSelectionRangeProvider._bracketsLeftYield(resolve, 0, model, position, ranges, bucket));
    }
    return result;
  }
  static _bracketsRightYield(resolve, round, model, pos, ranges) {
    const counts = /* @__PURE__ */ new Map();
    const t1 = Date.now();
    while (true) {
      if (round >= _BracketSelectionRangeProvider._maxRounds) {
        resolve();
        break;
      }
      if (!pos) {
        resolve();
        break;
      }
      const bracket = model.bracketPairs.findNextBracket(pos);
      if (!bracket) {
        resolve();
        break;
      }
      const d = Date.now() - t1;
      if (d > _BracketSelectionRangeProvider._maxDuration) {
        setTimeout(() => _BracketSelectionRangeProvider._bracketsRightYield(resolve, round + 1, model, pos, ranges));
        break;
      }
      if (bracket.bracketInfo.isOpeningBracket) {
        const key = bracket.bracketInfo.bracketText;
        const val = counts.has(key) ? counts.get(key) : 0;
        counts.set(key, val + 1);
      } else {
        const key = bracket.bracketInfo.getOpeningBrackets()[0].bracketText;
        let val = counts.has(key) ? counts.get(key) : 0;
        val -= 1;
        counts.set(key, Math.max(0, val));
        if (val < 0) {
          let list = ranges.get(key);
          if (!list) {
            list = new LinkedList();
            ranges.set(key, list);
          }
          list.push(bracket.range);
        }
      }
      pos = bracket.range.getEndPosition();
    }
  }
  static _bracketsLeftYield(resolve, round, model, pos, ranges, bucket) {
    const counts = /* @__PURE__ */ new Map();
    const t1 = Date.now();
    while (true) {
      if (round >= _BracketSelectionRangeProvider._maxRounds && ranges.size === 0) {
        resolve();
        break;
      }
      if (!pos) {
        resolve();
        break;
      }
      const bracket = model.bracketPairs.findPrevBracket(pos);
      if (!bracket) {
        resolve();
        break;
      }
      const d = Date.now() - t1;
      if (d > _BracketSelectionRangeProvider._maxDuration) {
        setTimeout(() => _BracketSelectionRangeProvider._bracketsLeftYield(resolve, round + 1, model, pos, ranges, bucket));
        break;
      }
      if (!bracket.bracketInfo.isOpeningBracket) {
        const key = bracket.bracketInfo.getOpeningBrackets()[0].bracketText;
        const val = counts.has(key) ? counts.get(key) : 0;
        counts.set(key, val + 1);
      } else {
        const key = bracket.bracketInfo.bracketText;
        let val = counts.has(key) ? counts.get(key) : 0;
        val -= 1;
        counts.set(key, Math.max(0, val));
        if (val < 0) {
          const list = ranges.get(key);
          if (list) {
            const closing = list.shift();
            if (list.size === 0) {
              ranges.delete(key);
            }
            const innerBracket = Range.fromPositions(bracket.range.getEndPosition(), closing.getStartPosition());
            const outerBracket = Range.fromPositions(bracket.range.getStartPosition(), closing.getEndPosition());
            bucket.push({ range: innerBracket });
            bucket.push({ range: outerBracket });
            _BracketSelectionRangeProvider._addBracketLeading(model, outerBracket, bucket);
          }
        }
      }
      pos = bracket.range.getStartPosition();
    }
  }
  static _addBracketLeading(model, bracket, bucket) {
    if (bracket.startLineNumber === bracket.endLineNumber) {
      return;
    }
    const startLine = bracket.startLineNumber;
    const column = model.getLineFirstNonWhitespaceColumn(startLine);
    if (column !== 0 && column !== bracket.startColumn) {
      bucket.push({ range: Range.fromPositions(new Position(startLine, column), bracket.getEndPosition()) });
      bucket.push({ range: Range.fromPositions(new Position(startLine, 1), bracket.getEndPosition()) });
    }
    const aboveLine = startLine - 1;
    if (aboveLine > 0) {
      const column2 = model.getLineFirstNonWhitespaceColumn(aboveLine);
      if (column2 === bracket.startColumn && column2 !== model.getLineLastNonWhitespaceColumn(aboveLine)) {
        bucket.push({ range: Range.fromPositions(new Position(aboveLine, column2), bracket.getEndPosition()) });
        bucket.push({ range: Range.fromPositions(new Position(aboveLine, 1), bracket.getEndPosition()) });
      }
    }
  }
};
_BracketSelectionRangeProvider._maxDuration = 30;
_BracketSelectionRangeProvider._maxRounds = 2;
let BracketSelectionRangeProvider = _BracketSelectionRangeProvider;
export {
  BracketSelectionRangeProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNtYXJ0U2VsZWN0XFxicm93c2VyXFxicmFja2V0U2VsZWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvblJhbmdlLCBTZWxlY3Rpb25SYW5nZVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlciBpbXBsZW1lbnRzIFNlbGVjdGlvblJhbmdlUHJvdmlkZXIge1xuXG5cdGFzeW5jIHByb3ZpZGVTZWxlY3Rpb25SYW5nZXMobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uczogUG9zaXRpb25bXSk6IFByb21pc2U8U2VsZWN0aW9uUmFuZ2VbXVtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBTZWxlY3Rpb25SYW5nZVtdW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgcG9zaXRpb24gb2YgcG9zaXRpb25zKSB7XG5cdFx0XHRjb25zdCBidWNrZXQ6IFNlbGVjdGlvblJhbmdlW10gPSBbXTtcblx0XHRcdHJlc3VsdC5wdXNoKGJ1Y2tldCk7XG5cblx0XHRcdGNvbnN0IHJhbmdlcyA9IG5ldyBNYXA8c3RyaW5nLCBMaW5rZWRMaXN0PFJhbmdlPj4oKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gQnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIuX2JyYWNrZXRzUmlnaHRZaWVsZChyZXNvbHZlLCAwLCBtb2RlbCwgcG9zaXRpb24sIHJhbmdlcykpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlci5fYnJhY2tldHNMZWZ0WWllbGQocmVzb2x2ZSwgMCwgbW9kZWwsIHBvc2l0aW9uLCByYW5nZXMsIGJ1Y2tldCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIF9tYXhEdXJhdGlvbiA9IDMwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfbWF4Um91bmRzID0gMjtcblxuXHRwcml2YXRlIHN0YXRpYyBfYnJhY2tldHNSaWdodFlpZWxkKHJlc29sdmU6ICgpID0+IHZvaWQsIHJvdW5kOiBudW1iZXIsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IFBvc2l0aW9uLCByYW5nZXM6IE1hcDxzdHJpbmcsIExpbmtlZExpc3Q8UmFuZ2U+Pik6IHZvaWQge1xuXHRcdGNvbnN0IGNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0Y29uc3QgdDEgPSBEYXRlLm5vdygpO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRpZiAocm91bmQgPj0gQnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIuX21heFJvdW5kcykge1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFwb3MpIHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJyYWNrZXQgPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZE5leHRCcmFja2V0KHBvcyk7XG5cdFx0XHRpZiAoIWJyYWNrZXQpIHtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGQgPSBEYXRlLm5vdygpIC0gdDE7XG5cdFx0XHRpZiAoZCA+IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLl9tYXhEdXJhdGlvbikge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLl9icmFja2V0c1JpZ2h0WWllbGQocmVzb2x2ZSwgcm91bmQgKyAxLCBtb2RlbCwgcG9zLCByYW5nZXMpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYnJhY2tldC5icmFja2V0SW5mby5pc09wZW5pbmdCcmFja2V0KSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IGJyYWNrZXQuYnJhY2tldEluZm8uYnJhY2tldFRleHQ7XG5cdFx0XHRcdC8vIHdhaXQgZm9yIGNsb3Npbmdcblx0XHRcdFx0Y29uc3QgdmFsID0gY291bnRzLmhhcyhrZXkpID8gY291bnRzLmdldChrZXkpISA6IDA7XG5cdFx0XHRcdGNvdW50cy5zZXQoa2V5LCB2YWwgKyAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IGJyYWNrZXQuYnJhY2tldEluZm8uZ2V0T3BlbmluZ0JyYWNrZXRzKClbMF0uYnJhY2tldFRleHQ7XG5cdFx0XHRcdC8vIHByb2Nlc3MgY2xvc2luZ1xuXHRcdFx0XHRsZXQgdmFsID0gY291bnRzLmhhcyhrZXkpID8gY291bnRzLmdldChrZXkpISA6IDA7XG5cdFx0XHRcdHZhbCAtPSAxO1xuXHRcdFx0XHRjb3VudHMuc2V0KGtleSwgTWF0aC5tYXgoMCwgdmFsKSk7XG5cdFx0XHRcdGlmICh2YWwgPCAwKSB7XG5cdFx0XHRcdFx0bGV0IGxpc3QgPSByYW5nZXMuZ2V0KGtleSk7XG5cdFx0XHRcdFx0aWYgKCFsaXN0KSB7XG5cdFx0XHRcdFx0XHRsaXN0ID0gbmV3IExpbmtlZExpc3QoKTtcblx0XHRcdFx0XHRcdHJhbmdlcy5zZXQoa2V5LCBsaXN0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGlzdC5wdXNoKGJyYWNrZXQucmFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRwb3MgPSBicmFja2V0LnJhbmdlLmdldEVuZFBvc2l0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2JyYWNrZXRzTGVmdFlpZWxkKHJlc29sdmU6ICgpID0+IHZvaWQsIHJvdW5kOiBudW1iZXIsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3M6IFBvc2l0aW9uLCByYW5nZXM6IE1hcDxzdHJpbmcsIExpbmtlZExpc3Q8UmFuZ2U+PiwgYnVja2V0OiBTZWxlY3Rpb25SYW5nZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgY291bnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRjb25zdCB0MSA9IERhdGUubm93KCk7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGlmIChyb3VuZCA+PSBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlci5fbWF4Um91bmRzICYmIHJhbmdlcy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXBvcykge1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYnJhY2tldCA9IG1vZGVsLmJyYWNrZXRQYWlycy5maW5kUHJldkJyYWNrZXQocG9zKTtcblx0XHRcdGlmICghYnJhY2tldCkge1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZCA9IERhdGUubm93KCkgLSB0MTtcblx0XHRcdGlmIChkID4gQnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIuX21heER1cmF0aW9uKSB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gQnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIuX2JyYWNrZXRzTGVmdFlpZWxkKHJlc29sdmUsIHJvdW5kICsgMSwgbW9kZWwsIHBvcywgcmFuZ2VzLCBidWNrZXQpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWJyYWNrZXQuYnJhY2tldEluZm8uaXNPcGVuaW5nQnJhY2tldCkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBicmFja2V0LmJyYWNrZXRJbmZvLmdldE9wZW5pbmdCcmFja2V0cygpWzBdLmJyYWNrZXRUZXh0O1xuXHRcdFx0XHQvLyB3YWl0IGZvciBvcGVuaW5nXG5cdFx0XHRcdGNvbnN0IHZhbCA9IGNvdW50cy5oYXMoa2V5KSA/IGNvdW50cy5nZXQoa2V5KSEgOiAwO1xuXHRcdFx0XHRjb3VudHMuc2V0KGtleSwgdmFsICsgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBicmFja2V0LmJyYWNrZXRJbmZvLmJyYWNrZXRUZXh0O1xuXHRcdFx0XHQvLyBvcGVuaW5nXG5cdFx0XHRcdGxldCB2YWwgPSBjb3VudHMuaGFzKGtleSkgPyBjb3VudHMuZ2V0KGtleSkhIDogMDtcblx0XHRcdFx0dmFsIC09IDE7XG5cdFx0XHRcdGNvdW50cy5zZXQoa2V5LCBNYXRoLm1heCgwLCB2YWwpKTtcblx0XHRcdFx0aWYgKHZhbCA8IDApIHtcblx0XHRcdFx0XHRjb25zdCBsaXN0ID0gcmFuZ2VzLmdldChrZXkpO1xuXHRcdFx0XHRcdGlmIChsaXN0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjbG9zaW5nID0gbGlzdC5zaGlmdCgpO1xuXHRcdFx0XHRcdFx0aWYgKGxpc3Quc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHRyYW5nZXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBpbm5lckJyYWNrZXQgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGJyYWNrZXQucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgY2xvc2luZyEuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdFx0XHRcdGNvbnN0IG91dGVyQnJhY2tldCA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoYnJhY2tldC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCksIGNsb3NpbmchLmdldEVuZFBvc2l0aW9uKCkpO1xuXHRcdFx0XHRcdFx0YnVja2V0LnB1c2goeyByYW5nZTogaW5uZXJCcmFja2V0IH0pO1xuXHRcdFx0XHRcdFx0YnVja2V0LnB1c2goeyByYW5nZTogb3V0ZXJCcmFja2V0IH0pO1xuXHRcdFx0XHRcdFx0QnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIuX2FkZEJyYWNrZXRMZWFkaW5nKG1vZGVsLCBvdXRlckJyYWNrZXQsIGJ1Y2tldCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRwb3MgPSBicmFja2V0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfYWRkQnJhY2tldExlYWRpbmcobW9kZWw6IElUZXh0TW9kZWwsIGJyYWNrZXQ6IFJhbmdlLCBidWNrZXQ6IFNlbGVjdGlvblJhbmdlW10pOiB2b2lkIHtcblx0XHRpZiAoYnJhY2tldC5zdGFydExpbmVOdW1iZXIgPT09IGJyYWNrZXQuZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyB4eHh4eHh4eCB7XG5cdFx0Ly9cblx0XHQvLyB9XG5cdFx0Y29uc3Qgc3RhcnRMaW5lID0gYnJhY2tldC5zdGFydExpbmVOdW1iZXI7XG5cdFx0Y29uc3QgY29sdW1uID0gbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihzdGFydExpbmUpO1xuXHRcdGlmIChjb2x1bW4gIT09IDAgJiYgY29sdW1uICE9PSBicmFja2V0LnN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRidWNrZXQucHVzaCh7IHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbihzdGFydExpbmUsIGNvbHVtbiksIGJyYWNrZXQuZ2V0RW5kUG9zaXRpb24oKSkgfSk7XG5cdFx0XHRidWNrZXQucHVzaCh7IHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbihzdGFydExpbmUsIDEpLCBicmFja2V0LmdldEVuZFBvc2l0aW9uKCkpIH0pO1xuXHRcdH1cblxuXHRcdC8vIHh4eHh4eHh4XG5cdFx0Ly8ge1xuXHRcdC8vXG5cdFx0Ly8gfVxuXHRcdGNvbnN0IGFib3ZlTGluZSA9IHN0YXJ0TGluZSAtIDE7XG5cdFx0aWYgKGFib3ZlTGluZSA+IDApIHtcblx0XHRcdGNvbnN0IGNvbHVtbiA9IG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oYWJvdmVMaW5lKTtcblx0XHRcdGlmIChjb2x1bW4gPT09IGJyYWNrZXQuc3RhcnRDb2x1bW4gJiYgY29sdW1uICE9PSBtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4oYWJvdmVMaW5lKSkge1xuXHRcdFx0XHRidWNrZXQucHVzaCh7IHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbihhYm92ZUxpbmUsIGNvbHVtbiksIGJyYWNrZXQuZ2V0RW5kUG9zaXRpb24oKSkgfSk7XG5cdFx0XHRcdGJ1Y2tldC5wdXNoKHsgcmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMobmV3IFBvc2l0aW9uKGFib3ZlTGluZSwgMSksIGJyYWNrZXQuZ2V0RW5kUG9zaXRpb24oKSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFJZixNQUFNLGlDQUFOLE1BQU0sK0JBQWdFO0FBQUEsRUFFNUUsTUFBTSx1QkFBdUIsT0FBbUIsV0FBb0Q7QUFDbkcsVUFBTSxTQUE2QixDQUFDO0FBRXBDLGVBQVcsWUFBWSxXQUFXO0FBQ2pDLFlBQU0sU0FBMkIsQ0FBQztBQUNsQyxhQUFPLEtBQUssTUFBTTtBQUVsQixZQUFNLFNBQVMsb0JBQUksSUFBK0I7QUFDbEQsWUFBTSxJQUFJLFFBQWMsYUFBVywrQkFBOEIsb0JBQW9CLFNBQVMsR0FBRyxPQUFPLFVBQVUsTUFBTSxDQUFDO0FBQ3pILFlBQU0sSUFBSSxRQUFjLGFBQVcsK0JBQThCLG1CQUFtQixTQUFTLEdBQUcsT0FBTyxVQUFVLFFBQVEsTUFBTSxDQUFDO0FBQUEsSUFDakk7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBS0EsT0FBZSxvQkFBb0IsU0FBcUIsT0FBZSxPQUFtQixLQUFlLFFBQThDO0FBQ3RKLFVBQU0sU0FBUyxvQkFBSSxJQUFvQjtBQUN2QyxVQUFNLEtBQUssS0FBSyxJQUFJO0FBQ3BCLFdBQU8sTUFBTTtBQUNaLFVBQUksU0FBUywrQkFBOEIsWUFBWTtBQUN0RCxnQkFBUTtBQUNSO0FBQUEsTUFDRDtBQUNBLFVBQUksQ0FBQyxLQUFLO0FBQ1QsZ0JBQVE7QUFDUjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFVBQVUsTUFBTSxhQUFhLGdCQUFnQixHQUFHO0FBQ3RELFVBQUksQ0FBQyxTQUFTO0FBQ2IsZ0JBQVE7QUFDUjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLElBQUksS0FBSyxJQUFJLElBQUk7QUFDdkIsVUFBSSxJQUFJLCtCQUE4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
