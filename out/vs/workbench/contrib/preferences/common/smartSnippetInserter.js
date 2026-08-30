import { createScanner as createJSONScanner, SyntaxKind as JSONSyntaxKind } from "../../../../base/common/json.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
class SmartSnippetInserter {
  static hasOpenBrace(scanner) {
    while (scanner.scan() !== JSONSyntaxKind.EOF) {
      const kind = scanner.getToken();
      if (kind === JSONSyntaxKind.OpenBraceToken) {
        return true;
      }
    }
    return false;
  }
  static offsetToPosition(model, offset) {
    let offsetBeforeLine = 0;
    const eolLength = model.getEOL().length;
    const lineCount = model.getLineCount();
    for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
      const lineTotalLength = model.getLineLength(lineNumber) + eolLength;
      const offsetAfterLine = offsetBeforeLine + lineTotalLength;
      if (offsetAfterLine > offset) {
        return new Position(
          lineNumber,
          offset - offsetBeforeLine + 1
        );
      }
      offsetBeforeLine = offsetAfterLine;
    }
    return new Position(
      lineCount,
      model.getLineMaxColumn(lineCount)
    );
  }
  static insertSnippet(model, _position) {
    const desiredPosition = model.getValueLengthInRange(new Range(1, 1, _position.lineNumber, _position.column));
    let State;
    ((State2) => {
      State2[State2["INVALID"] = 0] = "INVALID";
      State2[State2["AFTER_OBJECT"] = 1] = "AFTER_OBJECT";
      State2[State2["BEFORE_OBJECT"] = 2] = "BEFORE_OBJECT";
    })(State || (State = {}));
    let currentState = 0 /* INVALID */;
    let lastValidPos = -1;
    let lastValidState = 0 /* INVALID */;
    const scanner = createJSONScanner(model.getValue());
    let arrayLevel = 0;
    let objLevel = 0;
    const checkRangeStatus = (pos, state) => {
      if (state !== 0 /* INVALID */ && arrayLevel === 1 && objLevel === 0) {
        currentState = state;
        lastValidPos = pos;
        lastValidState = state;
      } else {
        if (currentState !== 0 /* INVALID */) {
          currentState = 0 /* INVALID */;
          lastValidPos = scanner.getTokenOffset();
        }
      }
    };
    while (scanner.scan() !== JSONSyntaxKind.EOF) {
      const currentPos = scanner.getPosition();
      const kind = scanner.getToken();
      let goodKind = false;
      switch (kind) {
        case JSONSyntaxKind.OpenBracketToken:
          goodKind = true;
          arrayLevel++;
          checkRangeStatus(currentPos, 2 /* BEFORE_OBJECT */);
          break;
        case JSONSyntaxKind.CloseBracketToken:
          goodKind = true;
          arrayLevel--;
          checkRangeStatus(currentPos, 0 /* INVALID */);
          break;
        case JSONSyntaxKind.CommaToken:
          goodKind = true;
          checkRangeStatus(currentPos, 2 /* BEFORE_OBJECT */);
          break;
        case JSONSyntaxKind.OpenBraceToken:
          goodKind = true;
          objLevel++;
          checkRangeStatus(currentPos, 0 /* INVALID */);
          break;
        case JSONSyntaxKind.CloseBraceToken:
          goodKind = true;
          objLevel--;
          checkRangeStatus(currentPos, 1 /* AFTER_OBJECT */);
          break;
        case JSONSyntaxKind.Trivia:
        case JSONSyntaxKind.LineBreakTrivia:
          goodKind = true;
      }
      if (currentPos >= desiredPosition && (currentState !== 0 /* INVALID */ || lastValidPos !== -1)) {
        let acceptPosition;
        let acceptState;
        if (currentState !== 0 /* INVALID */) {
          acceptPosition = goodKind ? currentPos : scanner.getTokenOffset();
          acceptState = currentState;
        } else {
          acceptPosition = lastValidPos;
          acceptState = lastValidState;
        }
        if (acceptState === 1 /* AFTER_OBJECT */) {
          return {
            position: this.offsetToPosition(model, acceptPosition),
            prepend: ",",
            append: ""
          };
        } else {
          scanner.setPosition(acceptPosition);
          return {
            position: this.offsetToPosition(model, acceptPosition),
            prepend: "",
            append: this.hasOpenBrace(scanner) ? "," : ""
          };
        }
      }
    }
    const modelLineCount = model.getLineCount();
    return {
      position: new Position(modelLineCount, model.getLineMaxColumn(modelLineCount)),
      prepend: "\n[",
      append: "]"
    };
  }
}
export {
  SmartSnippetInserter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxjb21tb25cXHNtYXJ0U25pcHBldEluc2VydGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSlNPTlNjYW5uZXIsIGNyZWF0ZVNjYW5uZXIgYXMgY3JlYXRlSlNPTlNjYW5uZXIsIFN5bnRheEtpbmQgYXMgSlNPTlN5bnRheEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJbnNlcnRTbmlwcGV0UmVzdWx0IHtcblx0cG9zaXRpb246IFBvc2l0aW9uO1xuXHRwcmVwZW5kOiBzdHJpbmc7XG5cdGFwcGVuZDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgU21hcnRTbmlwcGV0SW5zZXJ0ZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIGhhc09wZW5CcmFjZShzY2FubmVyOiBKU09OU2Nhbm5lcik6IGJvb2xlYW4ge1xuXG5cdFx0d2hpbGUgKHNjYW5uZXIuc2NhbigpICE9PSBKU09OU3ludGF4S2luZC5FT0YpIHtcblx0XHRcdGNvbnN0IGtpbmQgPSBzY2FubmVyLmdldFRva2VuKCk7XG5cblx0XHRcdGlmIChraW5kID09PSBKU09OU3ludGF4S2luZC5PcGVuQnJhY2VUb2tlbikge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBvZmZzZXRUb1Bvc2l0aW9uKG1vZGVsOiBJVGV4dE1vZGVsLCBvZmZzZXQ6IG51bWJlcik6IFBvc2l0aW9uIHtcblx0XHRsZXQgb2Zmc2V0QmVmb3JlTGluZSA9IDA7XG5cdFx0Y29uc3QgZW9sTGVuZ3RoID0gbW9kZWwuZ2V0RU9MKCkubGVuZ3RoO1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSAxOyBsaW5lTnVtYmVyIDw9IGxpbmVDb3VudDsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBsaW5lVG90YWxMZW5ndGggPSBtb2RlbC5nZXRMaW5lTGVuZ3RoKGxpbmVOdW1iZXIpICsgZW9sTGVuZ3RoO1xuXHRcdFx0Y29uc3Qgb2Zmc2V0QWZ0ZXJMaW5lID0gb2Zmc2V0QmVmb3JlTGluZSArIGxpbmVUb3RhbExlbmd0aDtcblxuXHRcdFx0aWYgKG9mZnNldEFmdGVyTGluZSA+IG9mZnNldCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKFxuXHRcdFx0XHRcdGxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0b2Zmc2V0IC0gb2Zmc2V0QmVmb3JlTGluZSArIDFcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdG9mZnNldEJlZm9yZUxpbmUgPSBvZmZzZXRBZnRlckxpbmU7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUG9zaXRpb24oXG5cdFx0XHRsaW5lQ291bnQsXG5cdFx0XHRtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVDb3VudClcblx0XHQpO1xuXHR9XG5cblx0c3RhdGljIGluc2VydFNuaXBwZXQobW9kZWw6IElUZXh0TW9kZWwsIF9wb3NpdGlvbjogUG9zaXRpb24pOiBJbnNlcnRTbmlwcGV0UmVzdWx0IHtcblxuXHRcdGNvbnN0IGRlc2lyZWRQb3NpdGlvbiA9IG1vZGVsLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgX3Bvc2l0aW9uLmxpbmVOdW1iZXIsIF9wb3NpdGlvbi5jb2x1bW4pKTtcblxuXHRcdC8vIDxJTlZBTElEPiBbIDxCRUZPUkVfT0JKRUNUPiB7IDxJTlZBTElEPiB9IDxBRlRFUl9PQkpFQ1Q+LCA8QkVGT1JFX09CSkVDVD4geyA8SU5WQUxJRD4gfSA8QUZURVJfT0JKRUNUPiBdIDxJTlZBTElEPlxuXHRcdGVudW0gU3RhdGUge1xuXHRcdFx0SU5WQUxJRCA9IDAsXG5cdFx0XHRBRlRFUl9PQkpFQ1QgPSAxLFxuXHRcdFx0QkVGT1JFX09CSkVDVCA9IDIsXG5cdFx0fVxuXHRcdGxldCBjdXJyZW50U3RhdGUgPSBTdGF0ZS5JTlZBTElEO1xuXHRcdGxldCBsYXN0VmFsaWRQb3MgPSAtMTtcblx0XHRsZXQgbGFzdFZhbGlkU3RhdGUgPSBTdGF0ZS5JTlZBTElEO1xuXG5cdFx0Y29uc3Qgc2Nhbm5lciA9IGNyZWF0ZUpTT05TY2FubmVyKG1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdGxldCBhcnJheUxldmVsID0gMDtcblx0XHRsZXQgb2JqTGV2ZWwgPSAwO1xuXG5cdFx0Y29uc3QgY2hlY2tSYW5nZVN0YXR1cyA9IChwb3M6IG51bWJlciwgc3RhdGU6IFN0YXRlKSA9PiB7XG5cdFx0XHRpZiAoc3RhdGUgIT09IFN0YXRlLklOVkFMSUQgJiYgYXJyYXlMZXZlbCA9PT0gMSAmJiBvYmpMZXZlbCA9PT0gMCkge1xuXHRcdFx0XHRjdXJyZW50U3RhdGUgPSBzdGF0ZTtcblx0XHRcdFx0bGFzdFZhbGlkUG9zID0gcG9zO1xuXHRcdFx0XHRsYXN0VmFsaWRTdGF0ZSA9IHN0YXRlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRTdGF0ZSAhPT0gU3RhdGUuSU5WQUxJRCkge1xuXHRcdFx0XHRcdGN1cnJlbnRTdGF0ZSA9IFN0YXRlLklOVkFMSUQ7XG5cdFx0XHRcdFx0bGFzdFZhbGlkUG9zID0gc2Nhbm5lci5nZXRUb2tlbk9mZnNldCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHdoaWxlIChzY2FubmVyLnNjYW4oKSAhPT0gSlNPTlN5bnRheEtpbmQuRU9GKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50UG9zID0gc2Nhbm5lci5nZXRQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3Qga2luZCA9IHNjYW5uZXIuZ2V0VG9rZW4oKTtcblxuXHRcdFx0bGV0IGdvb2RLaW5kID0gZmFsc2U7XG5cdFx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdFx0Y2FzZSBKU09OU3ludGF4S2luZC5PcGVuQnJhY2tldFRva2VuOlxuXHRcdFx0XHRcdGdvb2RLaW5kID0gdHJ1ZTtcblx0XHRcdFx0XHRhcnJheUxldmVsKys7XG5cdFx0XHRcdFx0Y2hlY2tSYW5nZVN0YXR1cyhjdXJyZW50UG9zLCBTdGF0ZS5CRUZPUkVfT0JKRUNUKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBKU09OU3ludGF4S2luZC5DbG9zZUJyYWNrZXRUb2tlbjpcblx0XHRcdFx0XHRnb29kS2luZCA9IHRydWU7XG5cdFx0XHRcdFx0YXJyYXlMZXZlbC0tO1xuXHRcdFx0XHRcdGNoZWNrUmFuZ2VTdGF0dXMoY3VycmVudFBvcywgU3RhdGUuSU5WQUxJRCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgSlNPTlN5bnRheEtpbmQuQ29tbWFUb2tlbjpcblx0XHRcdFx0XHRnb29kS2luZCA9IHRydWU7XG5cdFx0XHRcdFx0Y2hlY2tSYW5nZVN0YXR1cyhjdXJyZW50UG9zLCBTdGF0ZS5CRUZPUkVfT0JKRUNUKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBKU09OU3ludGF4S2luZC5PcGVuQnJhY2VUb2tlbjpcblx0XHRcdFx0XHRnb29kS2luZCA9IHRydWU7XG5cdFx0XHRcdFx0b2JqTGV2ZWwrKztcblx0XHRcdFx0XHRjaGVja1JhbmdlU3RhdHVzKGN1cnJlbnRQb3MsIFN0YXRlLklOVkFMSUQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEpTT05TeW50YXhLaW5kLkNsb3NlQnJhY2VUb2tlbjpcblx0XHRcdFx0XHRnb29kS2luZCA9IHRydWU7XG5cdFx0XHRcdFx0b2JqTGV2ZWwtLTtcblx0XHRcdFx0XHRjaGVja1JhbmdlU3RhdHVzKGN1cnJlbnRQb3MsIFN0YXRlLkFGVEVSX09CSkVDVCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgSlNPTlN5bnRheEtpbmQuVHJpdmlhOlxuXHRcdFx0XHRjYXNlIEpTT05TeW50YXhLaW5kLkxpbmVCcmVha1RyaXZpYTpcblx0XHRcdFx0XHRnb29kS2luZCA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdXJyZW50UG9zID49IGRlc2lyZWRQb3NpdGlvbiAmJiAoY3VycmVudFN0YXRlICE9PSBTdGF0ZS5JTlZBTElEIHx8IGxhc3RWYWxpZFBvcyAhPT0gLTEpKSB7XG5cdFx0XHRcdGxldCBhY2NlcHRQb3NpdGlvbjogbnVtYmVyO1xuXHRcdFx0XHRsZXQgYWNjZXB0U3RhdGU6IFN0YXRlO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50U3RhdGUgIT09IFN0YXRlLklOVkFMSUQpIHtcblx0XHRcdFx0XHRhY2NlcHRQb3NpdGlvbiA9IChnb29kS2luZCA/IGN1cnJlbnRQb3MgOiBzY2FubmVyLmdldFRva2VuT2Zmc2V0KCkpO1xuXHRcdFx0XHRcdGFjY2VwdFN0YXRlID0gY3VycmVudFN0YXRlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFjY2VwdFBvc2l0aW9uID0gbGFzdFZhbGlkUG9zO1xuXHRcdFx0XHRcdGFjY2VwdFN0YXRlID0gbGFzdFZhbGlkU3RhdGU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYWNjZXB0U3RhdGUgYXMgU3RhdGUgPT09IFN0YXRlLkFGVEVSX09CSkVDVCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogdGhpcy5vZmZzZXRUb1Bvc2l0aW9uKG1vZGVsLCBhY2NlcHRQb3NpdGlvbiksXG5cdFx0XHRcdFx0XHRwcmVwZW5kOiAnLCcsXG5cdFx0XHRcdFx0XHRhcHBlbmQ6ICcnXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzY2FubmVyLnNldFBvc2l0aW9uKGFjY2VwdFBvc2l0aW9uKTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IHRoaXMub2Zmc2V0VG9Qb3NpdGlvbihtb2RlbCwgYWNjZXB0UG9zaXRpb24pLFxuXHRcdFx0XHRcdFx0cHJlcGVuZDogJycsXG5cdFx0XHRcdFx0XHRhcHBlbmQ6IHRoaXMuaGFzT3BlbkJyYWNlKHNjYW5uZXIpID8gJywnIDogJydcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gbm8gdmFsaWQgcG9zaXRpb24gZm91bmQhXG5cdFx0Y29uc3QgbW9kZWxMaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbihtb2RlbExpbmVDb3VudCwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihtb2RlbExpbmVDb3VudCkpLFxuXHRcdFx0cHJlcGVuZDogJ1xcblsn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
