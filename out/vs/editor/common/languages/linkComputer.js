import { CharCode } from "../../../base/common/charCode.js";
import { CharacterClassifier } from "../core/characterClassifier.js";
var State = /* @__PURE__ */ ((State2) => {
  State2[State2["Invalid"] = 0] = "Invalid";
  State2[State2["Start"] = 1] = "Start";
  State2[State2["H"] = 2] = "H";
  State2[State2["HT"] = 3] = "HT";
  State2[State2["HTT"] = 4] = "HTT";
  State2[State2["HTTP"] = 5] = "HTTP";
  State2[State2["F"] = 6] = "F";
  State2[State2["FI"] = 7] = "FI";
  State2[State2["FIL"] = 8] = "FIL";
  State2[State2["BeforeColon"] = 9] = "BeforeColon";
  State2[State2["AfterColon"] = 10] = "AfterColon";
  State2[State2["AlmostThere"] = 11] = "AlmostThere";
  State2[State2["End"] = 12] = "End";
  State2[State2["Accept"] = 13] = "Accept";
  State2[State2["LastKnownState"] = 14] = "LastKnownState";
  return State2;
})(State || {});
class Uint8Matrix {
  constructor(rows, cols, defaultValue) {
    const data = new Uint8Array(rows * cols);
    for (let i = 0, len = rows * cols; i < len; i++) {
      data[i] = defaultValue;
    }
    this._data = data;
    this.rows = rows;
    this.cols = cols;
  }
  get(row, col) {
    return this._data[row * this.cols + col];
  }
  set(row, col, value) {
    this._data[row * this.cols + col] = value;
  }
}
class StateMachine {
  constructor(edges) {
    let maxCharCode = 0;
    let maxState = 0 /* Invalid */;
    for (let i = 0, len = edges.length; i < len; i++) {
      const [from, chCode, to] = edges[i];
      if (chCode > maxCharCode) {
        maxCharCode = chCode;
      }
      if (from > maxState) {
        maxState = from;
      }
      if (to > maxState) {
        maxState = to;
      }
    }
    maxCharCode++;
    maxState++;
    const states = new Uint8Matrix(maxState, maxCharCode, 0 /* Invalid */);
    for (let i = 0, len = edges.length; i < len; i++) {
      const [from, chCode, to] = edges[i];
      states.set(from, chCode, to);
    }
    this._states = states;
    this._maxCharCode = maxCharCode;
  }
  nextState(currentState, chCode) {
    if (chCode < 0 || chCode >= this._maxCharCode) {
      return 0 /* Invalid */;
    }
    return this._states.get(currentState, chCode);
  }
}
let _stateMachine = null;
function getStateMachine() {
  if (_stateMachine === null) {
    _stateMachine = new StateMachine([
      [1 /* Start */, CharCode.h, 2 /* H */],
      [1 /* Start */, CharCode.H, 2 /* H */],
      [1 /* Start */, CharCode.f, 6 /* F */],
      [1 /* Start */, CharCode.F, 6 /* F */],
      [2 /* H */, CharCode.t, 3 /* HT */],
      [2 /* H */, CharCode.T, 3 /* HT */],
      [3 /* HT */, CharCode.t, 4 /* HTT */],
      [3 /* HT */, CharCode.T, 4 /* HTT */],
      [4 /* HTT */, CharCode.p, 5 /* HTTP */],
      [4 /* HTT */, CharCode.P, 5 /* HTTP */],
      [5 /* HTTP */, CharCode.s, 9 /* BeforeColon */],
      [5 /* HTTP */, CharCode.S, 9 /* BeforeColon */],
      [5 /* HTTP */, CharCode.Colon, 10 /* AfterColon */],
      [6 /* F */, CharCode.i, 7 /* FI */],
      [6 /* F */, CharCode.I, 7 /* FI */],
      [7 /* FI */, CharCode.l, 8 /* FIL */],
      [7 /* FI */, CharCode.L, 8 /* FIL */],
      [8 /* FIL */, CharCode.e, 9 /* BeforeColon */],
      [8 /* FIL */, CharCode.E, 9 /* BeforeColon */],
      [9 /* BeforeColon */, CharCode.Colon, 10 /* AfterColon */],
      [10 /* AfterColon */, CharCode.Slash, 11 /* AlmostThere */],
      [11 /* AlmostThere */, CharCode.Slash, 12 /* End */]
    ]);
  }
  return _stateMachine;
}
var CharacterClass = /* @__PURE__ */ ((CharacterClass2) => {
  CharacterClass2[CharacterClass2["None"] = 0] = "None";
  CharacterClass2[CharacterClass2["ForceTermination"] = 1] = "ForceTermination";
  CharacterClass2[CharacterClass2["CannotEndIn"] = 2] = "CannotEndIn";
  return CharacterClass2;
})(CharacterClass || {});
let _classifier = null;
function getClassifier() {
  if (_classifier === null) {
    _classifier = new CharacterClassifier(0 /* None */);
    const FORCE_TERMINATION_CHARACTERS = ` 	<>'"\u3001\u3002\uFF61\uFF64\uFF0C\uFF0E\uFF1A\uFF1B\u2018\u3008\u300C\u300E\u3014\uFF08\uFF3B\uFF5B\uFF62\uFF63\uFF5D\uFF3D\uFF09\u3015\u300F\u300D\u3009\u2019\uFF40\uFF5E\u2026|`;
    for (let i = 0; i < FORCE_TERMINATION_CHARACTERS.length; i++) {
      _classifier.set(FORCE_TERMINATION_CHARACTERS.charCodeAt(i), 1 /* ForceTermination */);
    }
    const CANNOT_END_WITH_CHARACTERS = ".,;:";
    for (let i = 0; i < CANNOT_END_WITH_CHARACTERS.length; i++) {
      _classifier.set(CANNOT_END_WITH_CHARACTERS.charCodeAt(i), 2 /* CannotEndIn */);
    }
  }
  return _classifier;
}
class LinkComputer {
  static _createLink(classifier, line, lineNumber, linkBeginIndex, linkEndIndex) {
    let lastIncludedCharIndex = linkEndIndex - 1;
    do {
      const chCode = line.charCodeAt(lastIncludedCharIndex);
      const chClass = classifier.get(chCode);
      if (chClass !== 2 /* CannotEndIn */) {
        break;
      }
      lastIncludedCharIndex--;
    } while (lastIncludedCharIndex > linkBeginIndex);
    if (linkBeginIndex > 0) {
      const charCodeBeforeLink = line.charCodeAt(linkBeginIndex - 1);
      const lastCharCodeInLink = line.charCodeAt(lastIncludedCharIndex);
      if (charCodeBeforeLink === CharCode.OpenParen && lastCharCodeInLink === CharCode.CloseParen || charCodeBeforeLink === CharCode.OpenSquareBracket && lastCharCodeInLink === CharCode.CloseSquareBracket || charCodeBeforeLink === CharCode.OpenCurlyBrace && lastCharCodeInLink === CharCode.CloseCurlyBrace) {
        lastIncludedCharIndex--;
      }
    }
    return {
      range: {
        startLineNumber: lineNumber,
        startColumn: linkBeginIndex + 1,
        endLineNumber: lineNumber,
        endColumn: lastIncludedCharIndex + 2
      },
      url: line.substring(linkBeginIndex, lastIncludedCharIndex + 1)
    };
  }
  static computeLinks(model, stateMachine = getStateMachine()) {
    const classifier = getClassifier();
    const result = [];
    for (let i = 1, lineCount = model.getLineCount(); i <= lineCount; i++) {
      const line = model.getLineContent(i);
      const len = line.length;
      let j = 0;
      let linkBeginIndex = 0;
      let linkBeginChCode = 0;
      let state = 1 /* Start */;
      let hasOpenParens = false;
      let hasOpenSquareBracket = false;
      let inSquareBrackets = false;
      let hasOpenCurlyBracket = false;
      while (j < len) {
        let resetStateMachine = false;
        const chCode = line.charCodeAt(j);
        if (state === 13 /* Accept */) {
          let chClass;
          switch (chCode) {
            case CharCode.OpenParen:
              hasOpenParens = true;
              chClass = 0 /* None */;
              break;
            case CharCode.CloseParen:
              chClass = hasOpenParens ? 0 /* None */ : 1 /* ForceTermination */;
              break;
            case CharCode.OpenSquareBracket:
              inSquareBrackets = true;
              hasOpenSquareBracket = true;
              chClass = 0 /* None */;
              break;
            case CharCode.CloseSquareBracket:
              inSquareBrackets = false;
              chClass = hasOpenSquareBracket ? 0 /* None */ : 1 /* ForceTermination */;
              break;
            case CharCode.OpenCurlyBrace:
              hasOpenCurlyBracket = true;
              chClass = 0 /* None */;
              break;
            case CharCode.CloseCurlyBrace:
              chClass = hasOpenCurlyBracket ? 0 /* None */ : 1 /* ForceTermination */;
              break;
            // The following three rules make it that ' or " or ` are allowed inside links
            // only if the link is wrapped by some other quote character
            case CharCode.SingleQuote:
            case CharCode.DoubleQuote:
            case CharCode.BackTick:
              if (linkBeginChCode === chCode) {
                chClass = 1 /* ForceTermination */;
              } else if (linkBeginChCode === CharCode.SingleQuote || linkBeginChCode === CharCode.DoubleQuote || linkBeginChCode === CharCode.BackTick) {
                chClass = 0 /* None */;
              } else {
                chClass = 1 /* ForceTermination */;
              }
              break;
            case CharCode.Asterisk:
              chClass = linkBeginChCode === CharCode.Asterisk ? 1 /* ForceTermination */ : 0 /* None */;
              break;
            case CharCode.Space:
              chClass = inSquareBrackets ? 0 /* None */ : 1 /* ForceTermination */;
              break;
            default:
              chClass = classifier.get(chCode);
          }
          if (chClass === 1 /* ForceTermination */) {
            result.push(LinkComputer._createLink(classifier, line, i, linkBeginIndex, j));
            resetStateMachine = true;
          }
        } else if (state === 12 /* End */) {
          let chClass;
          if (chCode === CharCode.OpenSquareBracket) {
            hasOpenSquareBracket = true;
            chClass = 0 /* None */;
          } else {
            chClass = classifier.get(chCode);
          }
          if (chClass === 1 /* ForceTermination */) {
            resetStateMachine = true;
          } else {
            state = 13 /* Accept */;
          }
        } else {
          state = stateMachine.nextState(state, chCode);
          if (state === 0 /* Invalid */) {
            resetStateMachine = true;
          }
        }
        if (resetStateMachine) {
          state = 1 /* Start */;
          hasOpenParens = false;
          hasOpenSquareBracket = false;
          hasOpenCurlyBracket = false;
          linkBeginIndex = j + 1;
          linkBeginChCode = chCode;
        }
        j++;
      }
      if (state === 13 /* Accept */) {
        result.push(LinkComputer._createLink(classifier, line, i, linkBeginIndex, len));
      }
    }
    return result;
  }
}
function computeLinks(model) {
  if (!model || typeof model.getLineCount !== "function" || typeof model.getLineContent !== "function") {
    return [];
  }
  return LinkComputer.computeLinks(model);
}
export {
  LinkComputer,
  State,
  StateMachine,
  computeLinks
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbGFuZ3VhZ2VzXFxsaW5rQ29tcHV0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IENoYXJhY3RlckNsYXNzaWZpZXIgfSBmcm9tICcuLi9jb3JlL2NoYXJhY3RlckNsYXNzaWZpZXIuanMnO1xuaW1wb3J0IHsgSUxpbmsgfSBmcm9tICcuLi9sYW5ndWFnZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElMaW5rQ29tcHV0ZXJUYXJnZXQge1xuXHRnZXRMaW5lQ291bnQoKTogbnVtYmVyO1xuXHRnZXRMaW5lQ29udGVudChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFN0YXRlIHtcblx0SW52YWxpZCA9IDAsXG5cdFN0YXJ0ID0gMSxcblx0SCA9IDIsXG5cdEhUID0gMyxcblx0SFRUID0gNCxcblx0SFRUUCA9IDUsXG5cdEYgPSA2LFxuXHRGSSA9IDcsXG5cdEZJTCA9IDgsXG5cdEJlZm9yZUNvbG9uID0gOSxcblx0QWZ0ZXJDb2xvbiA9IDEwLFxuXHRBbG1vc3RUaGVyZSA9IDExLFxuXHRFbmQgPSAxMixcblx0QWNjZXB0ID0gMTMsXG5cdExhc3RLbm93blN0YXRlID0gMTQgLy8gbWFya2VyLCBjdXN0b20gc3RhdGVzIG1heSBmb2xsb3dcbn1cblxuZXhwb3J0IHR5cGUgRWRnZSA9IFtTdGF0ZSwgbnVtYmVyLCBTdGF0ZV07XG5cbmNsYXNzIFVpbnQ4TWF0cml4IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhOiBVaW50OEFycmF5O1xuXHRwdWJsaWMgcmVhZG9ubHkgcm93czogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29sczogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHJvd3M6IG51bWJlciwgY29sczogbnVtYmVyLCBkZWZhdWx0VmFsdWU6IG51bWJlcikge1xuXHRcdGNvbnN0IGRhdGEgPSBuZXcgVWludDhBcnJheShyb3dzICogY29scyk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJvd3MgKiBjb2xzOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGRhdGFbaV0gPSBkZWZhdWx0VmFsdWU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGF0YSA9IGRhdGE7XG5cdFx0dGhpcy5yb3dzID0gcm93cztcblx0XHR0aGlzLmNvbHMgPSBjb2xzO1xuXHR9XG5cblx0cHVibGljIGdldChyb3c6IG51bWJlciwgY29sOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9kYXRhW3JvdyAqIHRoaXMuY29scyArIGNvbF07XG5cdH1cblxuXHRwdWJsaWMgc2V0KHJvdzogbnVtYmVyLCBjb2w6IG51bWJlciwgdmFsdWU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2RhdGFbcm93ICogdGhpcy5jb2xzICsgY29sXSA9IHZhbHVlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTdGF0ZU1hY2hpbmUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlczogVWludDhNYXRyaXg7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21heENoYXJDb2RlOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoZWRnZXM6IEVkZ2VbXSkge1xuXHRcdGxldCBtYXhDaGFyQ29kZSA9IDA7XG5cdFx0bGV0IG1heFN0YXRlID0gU3RhdGUuSW52YWxpZDtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZWRnZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IFtmcm9tLCBjaENvZGUsIHRvXSA9IGVkZ2VzW2ldO1xuXHRcdFx0aWYgKGNoQ29kZSA+IG1heENoYXJDb2RlKSB7XG5cdFx0XHRcdG1heENoYXJDb2RlID0gY2hDb2RlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZyb20gPiBtYXhTdGF0ZSkge1xuXHRcdFx0XHRtYXhTdGF0ZSA9IGZyb207XG5cdFx0XHR9XG5cdFx0XHRpZiAodG8gPiBtYXhTdGF0ZSkge1xuXHRcdFx0XHRtYXhTdGF0ZSA9IHRvO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG1heENoYXJDb2RlKys7XG5cdFx0bWF4U3RhdGUrKztcblxuXHRcdGNvbnN0IHN0YXRlcyA9IG5ldyBVaW50OE1hdHJpeChtYXhTdGF0ZSwgbWF4Q2hhckNvZGUsIFN0YXRlLkludmFsaWQpO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBlZGdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgW2Zyb20sIGNoQ29kZSwgdG9dID0gZWRnZXNbaV07XG5cdFx0XHRzdGF0ZXMuc2V0KGZyb20sIGNoQ29kZSwgdG8pO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlcyA9IHN0YXRlcztcblx0XHR0aGlzLl9tYXhDaGFyQ29kZSA9IG1heENoYXJDb2RlO1xuXHR9XG5cblx0cHVibGljIG5leHRTdGF0ZShjdXJyZW50U3RhdGU6IFN0YXRlLCBjaENvZGU6IG51bWJlcik6IFN0YXRlIHtcblx0XHRpZiAoY2hDb2RlIDwgMCB8fCBjaENvZGUgPj0gdGhpcy5fbWF4Q2hhckNvZGUpIHtcblx0XHRcdHJldHVybiBTdGF0ZS5JbnZhbGlkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc3RhdGVzLmdldChjdXJyZW50U3RhdGUsIGNoQ29kZSk7XG5cdH1cbn1cblxuLy8gU3RhdGUgbWFjaGluZSBmb3IgaHR0cDovLyBvciBodHRwczovLyBvciBmaWxlOi8vXG5sZXQgX3N0YXRlTWFjaGluZTogU3RhdGVNYWNoaW5lIHwgbnVsbCA9IG51bGw7XG5mdW5jdGlvbiBnZXRTdGF0ZU1hY2hpbmUoKTogU3RhdGVNYWNoaW5lIHtcblx0aWYgKF9zdGF0ZU1hY2hpbmUgPT09IG51bGwpIHtcblx0XHRfc3RhdGVNYWNoaW5lID0gbmV3IFN0YXRlTWFjaGluZShbXG5cdFx0XHRbU3RhdGUuU3RhcnQsIENoYXJDb2RlLmgsIFN0YXRlLkhdLFxuXHRcdFx0W1N0YXRlLlN0YXJ0LCBDaGFyQ29kZS5ILCBTdGF0ZS5IXSxcblx0XHRcdFtTdGF0ZS5TdGFydCwgQ2hhckNvZGUuZiwgU3RhdGUuRl0sXG5cdFx0XHRbU3RhdGUuU3RhcnQsIENoYXJDb2RlLkYsIFN0YXRlLkZdLFxuXG5cdFx0XHRbU3RhdGUuSCwgQ2hhckNvZGUudCwgU3RhdGUuSFRdLFxuXHRcdFx0W1N0YXRlLkgsIENoYXJDb2RlLlQsIFN0YXRlLkhUXSxcblxuXHRcdFx0W1N0YXRlLkhULCBDaGFyQ29kZS50LCBTdGF0ZS5IVFRdLFxuXHRcdFx0W1N0YXRlLkhULCBDaGFyQ29kZS5ULCBTdGF0ZS5IVFRdLFxuXG5cdFx0XHRbU3RhdGUuSFRULCBDaGFyQ29kZS5wLCBTdGF0ZS5IVFRQXSxcblx0XHRcdFtTdGF0ZS5IVFQsIENoYXJDb2RlLlAsIFN0YXRlLkhUVFBdLFxuXG5cdFx0XHRbU3RhdGUuSFRUUCwgQ2hhckNvZGUucywgU3RhdGUuQmVmb3JlQ29sb25dLFxuXHRcdFx0W1N0YXRlLkhUVFAsIENoYXJDb2RlLlMsIFN0YXRlLkJlZm9yZUNvbG9uXSxcblx0XHRcdFtTdGF0ZS5IVFRQLCBDaGFyQ29kZS5Db2xvbiwgU3RhdGUuQWZ0ZXJDb2xvbl0sXG5cblx0XHRcdFtTdGF0ZS5GLCBDaGFyQ29kZS5pLCBTdGF0ZS5GSV0sXG5cdFx0XHRbU3RhdGUuRiwgQ2hhckNvZGUuSSwgU3RhdGUuRkldLFxuXG5cdFx0XHRbU3RhdGUuRkksIENoYXJDb2RlLmwsIFN0YXRlLkZJTF0sXG5cdFx0XHRbU3RhdGUuRkksIENoYXJDb2RlLkwsIFN0YXRlLkZJTF0sXG5cblx0XHRcdFtTdGF0ZS5GSUwsIENoYXJDb2RlLmUsIFN0YXRlLkJlZm9yZUNvbG9uXSxcblx0XHRcdFtTdGF0ZS5GSUwsIENoYXJDb2RlLkUsIFN0YXRlLkJlZm9yZUNvbG9uXSxcblxuXHRcdFx0W1N0YXRlLkJlZm9yZUNvbG9uLCBDaGFyQ29kZS5Db2xvbiwgU3RhdGUuQWZ0ZXJDb2xvbl0sXG5cblx0XHRcdFtTdGF0ZS5BZnRlckNvbG9uLCBDaGFyQ29kZS5TbGFzaCwgU3RhdGUuQWxtb3N0VGhlcmVdLFxuXG5cdFx0XHRbU3RhdGUuQWxtb3N0VGhlcmUsIENoYXJDb2RlLlNsYXNoLCBTdGF0ZS5FbmRdLFxuXHRcdF0pO1xuXHR9XG5cdHJldHVybiBfc3RhdGVNYWNoaW5lO1xufVxuXG5cbmNvbnN0IGVudW0gQ2hhcmFjdGVyQ2xhc3Mge1xuXHROb25lID0gMCxcblx0Rm9yY2VUZXJtaW5hdGlvbiA9IDEsXG5cdENhbm5vdEVuZEluID0gMlxufVxuXG5sZXQgX2NsYXNzaWZpZXI6IENoYXJhY3RlckNsYXNzaWZpZXI8Q2hhcmFjdGVyQ2xhc3M+IHwgbnVsbCA9IG51bGw7XG5mdW5jdGlvbiBnZXRDbGFzc2lmaWVyKCk6IENoYXJhY3RlckNsYXNzaWZpZXI8Q2hhcmFjdGVyQ2xhc3M+IHtcblx0aWYgKF9jbGFzc2lmaWVyID09PSBudWxsKSB7XG5cdFx0X2NsYXNzaWZpZXIgPSBuZXcgQ2hhcmFjdGVyQ2xhc3NpZmllcjxDaGFyYWN0ZXJDbGFzcz4oQ2hhcmFjdGVyQ2xhc3MuTm9uZSk7XG5cblx0XHQvLyBhbGxvdy1hbnktdW5pY29kZS1uZXh0LWxpbmVcblx0XHRjb25zdCBGT1JDRV9URVJNSU5BVElPTl9DSEFSQUNURVJTID0gJyBcXHQ8PlxcJ1xcXCJcdTMwMDFcdTMwMDJcdUZGNjFcdUZGNjRcdUZGMENcdUZGMEVcdUZGMUFcdUZGMUJcdTIwMThcdTMwMDhcdTMwMENcdTMwMEVcdTMwMTRcdUZGMDhcdUZGM0JcdUZGNUJcdUZGNjJcdUZGNjNcdUZGNURcdUZGM0RcdUZGMDlcdTMwMTVcdTMwMEZcdTMwMERcdTMwMDlcdTIwMTlcdUZGNDBcdUZGNUVcdTIwMjZ8Jztcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IEZPUkNFX1RFUk1JTkFUSU9OX0NIQVJBQ1RFUlMubGVuZ3RoOyBpKyspIHtcblx0XHRcdF9jbGFzc2lmaWVyLnNldChGT1JDRV9URVJNSU5BVElPTl9DSEFSQUNURVJTLmNoYXJDb2RlQXQoaSksIENoYXJhY3RlckNsYXNzLkZvcmNlVGVybWluYXRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IENBTk5PVF9FTkRfV0lUSF9DSEFSQUNURVJTID0gJy4sOzonO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgQ0FOTk9UX0VORF9XSVRIX0NIQVJBQ1RFUlMubGVuZ3RoOyBpKyspIHtcblx0XHRcdF9jbGFzc2lmaWVyLnNldChDQU5OT1RfRU5EX1dJVEhfQ0hBUkFDVEVSUy5jaGFyQ29kZUF0KGkpLCBDaGFyYWN0ZXJDbGFzcy5DYW5ub3RFbmRJbik7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBfY2xhc3NpZmllcjtcbn1cblxuZXhwb3J0IGNsYXNzIExpbmtDb21wdXRlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NyZWF0ZUxpbmsoY2xhc3NpZmllcjogQ2hhcmFjdGVyQ2xhc3NpZmllcjxDaGFyYWN0ZXJDbGFzcz4sIGxpbmU6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyLCBsaW5rQmVnaW5JbmRleDogbnVtYmVyLCBsaW5rRW5kSW5kZXg6IG51bWJlcik6IElMaW5rIHtcblx0XHQvLyBEbyBub3QgYWxsb3cgdG8gZW5kIGxpbmsgaW4gY2VydGFpbiBjaGFyYWN0ZXJzLi4uXG5cdFx0bGV0IGxhc3RJbmNsdWRlZENoYXJJbmRleCA9IGxpbmtFbmRJbmRleCAtIDE7XG5cdFx0ZG8ge1xuXHRcdFx0Y29uc3QgY2hDb2RlID0gbGluZS5jaGFyQ29kZUF0KGxhc3RJbmNsdWRlZENoYXJJbmRleCk7XG5cdFx0XHRjb25zdCBjaENsYXNzID0gY2xhc3NpZmllci5nZXQoY2hDb2RlKTtcblx0XHRcdGlmIChjaENsYXNzICE9PSBDaGFyYWN0ZXJDbGFzcy5DYW5ub3RFbmRJbikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGxhc3RJbmNsdWRlZENoYXJJbmRleC0tO1xuXHRcdH0gd2hpbGUgKGxhc3RJbmNsdWRlZENoYXJJbmRleCA+IGxpbmtCZWdpbkluZGV4KTtcblxuXHRcdC8vIEhhbmRsZSBsaW5rcyBlbmNsb3NlZCBpbiBwYXJlbnMsIHNxdWFyZSBicmFja2V0cyBhbmQgY3VybHlzLlxuXHRcdGlmIChsaW5rQmVnaW5JbmRleCA+IDApIHtcblx0XHRcdGNvbnN0IGNoYXJDb2RlQmVmb3JlTGluayA9IGxpbmUuY2hhckNvZGVBdChsaW5rQmVnaW5JbmRleCAtIDEpO1xuXHRcdFx0Y29uc3QgbGFzdENoYXJDb2RlSW5MaW5rID0gbGluZS5jaGFyQ29kZUF0KGxhc3RJbmNsdWRlZENoYXJJbmRleCk7XG5cblx0XHRcdGlmIChcblx0XHRcdFx0KGNoYXJDb2RlQmVmb3JlTGluayA9PT0gQ2hhckNvZGUuT3BlblBhcmVuICYmIGxhc3RDaGFyQ29kZUluTGluayA9PT0gQ2hhckNvZGUuQ2xvc2VQYXJlbilcblx0XHRcdFx0fHwgKGNoYXJDb2RlQmVmb3JlTGluayA9PT0gQ2hhckNvZGUuT3BlblNxdWFyZUJyYWNrZXQgJiYgbGFzdENoYXJDb2RlSW5MaW5rID09PSBDaGFyQ29kZS5DbG9zZVNxdWFyZUJyYWNrZXQpXG5cdFx0XHRcdHx8IChjaGFyQ29kZUJlZm9yZUxpbmsgPT09IENoYXJDb2RlLk9wZW5DdXJseUJyYWNlICYmIGxhc3RDaGFyQ29kZUluTGluayA9PT0gQ2hhckNvZGUuQ2xvc2VDdXJseUJyYWNlKVxuXHRcdFx0KSB7XG5cdFx0XHRcdC8vIERvIG5vdCBlbmQgaW4gKSBpZiAoIGlzIGJlZm9yZSB0aGUgbGluayBzdGFydFxuXHRcdFx0XHQvLyBEbyBub3QgZW5kIGluIF0gaWYgWyBpcyBiZWZvcmUgdGhlIGxpbmsgc3RhcnRcblx0XHRcdFx0Ly8gRG8gbm90IGVuZCBpbiB9IGlmIHsgaXMgYmVmb3JlIHRoZSBsaW5rIHN0YXJ0XG5cdFx0XHRcdGxhc3RJbmNsdWRlZENoYXJJbmRleC0tO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZToge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiBsaW5rQmVnaW5JbmRleCArIDEsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRcdGVuZENvbHVtbjogbGFzdEluY2x1ZGVkQ2hhckluZGV4ICsgMlxuXHRcdFx0fSxcblx0XHRcdHVybDogbGluZS5zdWJzdHJpbmcobGlua0JlZ2luSW5kZXgsIGxhc3RJbmNsdWRlZENoYXJJbmRleCArIDEpXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY29tcHV0ZUxpbmtzKG1vZGVsOiBJTGlua0NvbXB1dGVyVGFyZ2V0LCBzdGF0ZU1hY2hpbmU6IFN0YXRlTWFjaGluZSA9IGdldFN0YXRlTWFjaGluZSgpKTogSUxpbmtbXSB7XG5cdFx0Y29uc3QgY2xhc3NpZmllciA9IGdldENsYXNzaWZpZXIoKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSUxpbmtbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAxLCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTsgaSA8PSBsaW5lQ291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KGkpO1xuXHRcdFx0Y29uc3QgbGVuID0gbGluZS5sZW5ndGg7XG5cblx0XHRcdGxldCBqID0gMDtcblx0XHRcdGxldCBsaW5rQmVnaW5JbmRleCA9IDA7XG5cdFx0XHRsZXQgbGlua0JlZ2luQ2hDb2RlID0gMDtcblx0XHRcdGxldCBzdGF0ZSA9IFN0YXRlLlN0YXJ0O1xuXHRcdFx0bGV0IGhhc09wZW5QYXJlbnMgPSBmYWxzZTtcblx0XHRcdGxldCBoYXNPcGVuU3F1YXJlQnJhY2tldCA9IGZhbHNlO1xuXHRcdFx0bGV0IGluU3F1YXJlQnJhY2tldHMgPSBmYWxzZTtcblx0XHRcdGxldCBoYXNPcGVuQ3VybHlCcmFja2V0ID0gZmFsc2U7XG5cblx0XHRcdHdoaWxlIChqIDwgbGVuKSB7XG5cblx0XHRcdFx0bGV0IHJlc2V0U3RhdGVNYWNoaW5lID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IGNoQ29kZSA9IGxpbmUuY2hhckNvZGVBdChqKTtcblxuXHRcdFx0XHRpZiAoc3RhdGUgPT09IFN0YXRlLkFjY2VwdCkge1xuXHRcdFx0XHRcdGxldCBjaENsYXNzOiBDaGFyYWN0ZXJDbGFzcztcblx0XHRcdFx0XHRzd2l0Y2ggKGNoQ29kZSkge1xuXHRcdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5PcGVuUGFyZW46XG5cdFx0XHRcdFx0XHRcdGhhc09wZW5QYXJlbnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjaENsYXNzID0gQ2hhcmFjdGVyQ2xhc3MuTm9uZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkNsb3NlUGFyZW46XG5cdFx0XHRcdFx0XHRcdGNoQ2xhc3MgPSAoaGFzT3BlblBhcmVucyA/IENoYXJhY3RlckNsYXNzLk5vbmUgOiBDaGFyYWN0ZXJDbGFzcy5Gb3JjZVRlcm1pbmF0aW9uKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLk9wZW5TcXVhcmVCcmFja2V0OlxuXHRcdFx0XHRcdFx0XHRpblNxdWFyZUJyYWNrZXRzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0aGFzT3BlblNxdWFyZUJyYWNrZXQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjaENsYXNzID0gQ2hhcmFjdGVyQ2xhc3MuTm9uZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkNsb3NlU3F1YXJlQnJhY2tldDpcblx0XHRcdFx0XHRcdFx0aW5TcXVhcmVCcmFja2V0cyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRjaENsYXNzID0gKGhhc09wZW5TcXVhcmVCcmFja2V0ID8gQ2hhcmFjdGVyQ2xhc3MuTm9uZSA6IENoYXJhY3RlckNsYXNzLkZvcmNlVGVybWluYXRpb24pO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuT3BlbkN1cmx5QnJhY2U6XG5cdFx0XHRcdFx0XHRcdGhhc09wZW5DdXJseUJyYWNrZXQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjaENsYXNzID0gQ2hhcmFjdGVyQ2xhc3MuTm9uZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkNsb3NlQ3VybHlCcmFjZTpcblx0XHRcdFx0XHRcdFx0Y2hDbGFzcyA9IChoYXNPcGVuQ3VybHlCcmFja2V0ID8gQ2hhcmFjdGVyQ2xhc3MuTm9uZSA6IENoYXJhY3RlckNsYXNzLkZvcmNlVGVybWluYXRpb24pO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdFx0Ly8gVGhlIGZvbGxvd2luZyB0aHJlZSBydWxlcyBtYWtlIGl0IHRoYXQgJyBvciBcIiBvciBgIGFyZSBhbGxvd2VkIGluc2lkZSBsaW5rc1xuXHRcdFx0XHRcdFx0Ly8gb25seSBpZiB0aGUgbGluayBpcyB3cmFwcGVkIGJ5IHNvbWUgb3RoZXIgcXVvdGUgY2hhcmFjdGVyXG5cdFx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLlNpbmdsZVF1b3RlOlxuXHRcdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5Eb3VibGVRdW90ZTpcblx0XHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuQmFja1RpY2s6XG5cdFx0XHRcdFx0XHRcdGlmIChsaW5rQmVnaW5DaENvZGUgPT09IGNoQ29kZSkge1xuXHRcdFx0XHRcdFx0XHRcdGNoQ2xhc3MgPSBDaGFyYWN0ZXJDbGFzcy5Gb3JjZVRlcm1pbmF0aW9uO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGxpbmtCZWdpbkNoQ29kZSA9PT0gQ2hhckNvZGUuU2luZ2xlUXVvdGUgfHwgbGlua0JlZ2luQ2hDb2RlID09PSBDaGFyQ29kZS5Eb3VibGVRdW90ZSB8fCBsaW5rQmVnaW5DaENvZGUgPT09IENoYXJDb2RlLkJhY2tUaWNrKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2hDbGFzcyA9IENoYXJhY3RlckNsYXNzLk5vbmU7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2hDbGFzcyA9IENoYXJhY3RlckNsYXNzLkZvcmNlVGVybWluYXRpb247XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIENoYXJDb2RlLkFzdGVyaXNrOlxuXHRcdFx0XHRcdFx0XHQvLyBgKmAgdGVybWluYXRlcyBhIGxpbmsgaWYgdGhlIGxpbmsgYmVnYW4gd2l0aCBgKmBcblx0XHRcdFx0XHRcdFx0Y2hDbGFzcyA9IChsaW5rQmVnaW5DaENvZGUgPT09IENoYXJDb2RlLkFzdGVyaXNrKSA/IENoYXJhY3RlckNsYXNzLkZvcmNlVGVybWluYXRpb24gOiBDaGFyYWN0ZXJDbGFzcy5Ob25lO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6XG5cdFx0XHRcdFx0XHRcdC8vIGAgYCBhbGxvdyBzcGFjZSBpbiBiZXR3ZWVuIFsgYW5kIF1cblx0XHRcdFx0XHRcdFx0Y2hDbGFzcyA9IChpblNxdWFyZUJyYWNrZXRzID8gQ2hhcmFjdGVyQ2xhc3MuTm9uZSA6IENoYXJhY3RlckNsYXNzLkZvcmNlVGVybWluYXRpb24pO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdGNoQ2xhc3MgPSBjbGFzc2lmaWVyLmdldChjaENvZGUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIENoZWNrIGlmIGNoYXJhY3RlciB0ZXJtaW5hdGVzIGxpbmtcblx0XHRcdFx0XHRpZiAoY2hDbGFzcyA9PT0gQ2hhcmFjdGVyQ2xhc3MuRm9yY2VUZXJtaW5hdGlvbikge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goTGlua0NvbXB1dGVyLl9jcmVhdGVMaW5rKGNsYXNzaWZpZXIsIGxpbmUsIGksIGxpbmtCZWdpbkluZGV4LCBqKSk7XG5cdFx0XHRcdFx0XHRyZXNldFN0YXRlTWFjaGluZSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHN0YXRlID09PSBTdGF0ZS5FbmQpIHtcblxuXHRcdFx0XHRcdGxldCBjaENsYXNzOiBDaGFyYWN0ZXJDbGFzcztcblx0XHRcdFx0XHRpZiAoY2hDb2RlID09PSBDaGFyQ29kZS5PcGVuU3F1YXJlQnJhY2tldCkge1xuXHRcdFx0XHRcdFx0Ly8gQWxsb3cgZm9yIHRoZSBhdXRob3JpdHkgcGFydCB0byBjb250YWluIGlwdjYgYWRkcmVzc2VzIHdoaWNoIGNvbnRhaW4gWyBhbmQgXVxuXHRcdFx0XHRcdFx0aGFzT3BlblNxdWFyZUJyYWNrZXQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y2hDbGFzcyA9IENoYXJhY3RlckNsYXNzLk5vbmU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNoQ2xhc3MgPSBjbGFzc2lmaWVyLmdldChjaENvZGUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIENoZWNrIGlmIGNoYXJhY3RlciB0ZXJtaW5hdGVzIGxpbmtcblx0XHRcdFx0XHRpZiAoY2hDbGFzcyA9PT0gQ2hhcmFjdGVyQ2xhc3MuRm9yY2VUZXJtaW5hdGlvbikge1xuXHRcdFx0XHRcdFx0cmVzZXRTdGF0ZU1hY2hpbmUgPSB0cnVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzdGF0ZSA9IFN0YXRlLkFjY2VwdDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3RhdGUgPSBzdGF0ZU1hY2hpbmUubmV4dFN0YXRlKHN0YXRlLCBjaENvZGUpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZSA9PT0gU3RhdGUuSW52YWxpZCkge1xuXHRcdFx0XHRcdFx0cmVzZXRTdGF0ZU1hY2hpbmUgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyZXNldFN0YXRlTWFjaGluZSkge1xuXHRcdFx0XHRcdHN0YXRlID0gU3RhdGUuU3RhcnQ7XG5cdFx0XHRcdFx0aGFzT3BlblBhcmVucyA9IGZhbHNlO1xuXHRcdFx0XHRcdGhhc09wZW5TcXVhcmVCcmFja2V0ID0gZmFsc2U7XG5cdFx0XHRcdFx0aGFzT3BlbkN1cmx5QnJhY2tldCA9IGZhbHNlO1xuXG5cdFx0XHRcdFx0Ly8gUmVjb3JkIHdoZXJlIHRoZSBsaW5rIHN0YXJ0ZWRcblx0XHRcdFx0XHRsaW5rQmVnaW5JbmRleCA9IGogKyAxO1xuXHRcdFx0XHRcdGxpbmtCZWdpbkNoQ29kZSA9IGNoQ29kZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGorKztcblx0XHRcdH1cblxuXHRcdFx0aWYgKHN0YXRlID09PSBTdGF0ZS5BY2NlcHQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goTGlua0NvbXB1dGVyLl9jcmVhdGVMaW5rKGNsYXNzaWZpZXIsIGxpbmUsIGksIGxpbmtCZWdpbkluZGV4LCBsZW4pKTtcblx0XHRcdH1cblxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIGFuIGFycmF5IG9mIGFsbCBsaW5rcyBjb250YWlucyBpbiB0aGUgcHJvdmlkZWRcbiAqIGRvY3VtZW50LiAqTm90ZSogdGhhdCB0aGlzIG9wZXJhdGlvbiBpcyBjb21wdXRhdGlvbmFsXG4gKiBleHBlbnNpdmUgYW5kIHNob3VsZCBub3QgcnVuIGluIHRoZSBVSSB0aHJlYWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlTGlua3MobW9kZWw6IElMaW5rQ29tcHV0ZXJUYXJnZXQgfCBudWxsKTogSUxpbmtbXSB7XG5cdGlmICghbW9kZWwgfHwgdHlwZW9mIG1vZGVsLmdldExpbmVDb3VudCAhPT0gJ2Z1bmN0aW9uJyB8fCB0eXBlb2YgbW9kZWwuZ2V0TGluZUNvbnRlbnQgIT09ICdmdW5jdGlvbicpIHtcblx0XHQvLyBVbmtub3duIGNhbGxlciFcblx0XHRyZXR1cm4gW107XG5cdH1cblx0cmV0dXJuIExpbmtDb21wdXRlci5jb21wdXRlTGlua3MobW9kZWwpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFRN0IsSUFBVyxRQUFYLGtCQUFXQSxXQUFYO0FBQ04sRUFBQUEsY0FBQSxhQUFVLEtBQVY7QUFDQSxFQUFBQSxjQUFBLFdBQVEsS0FBUjtBQUNBLEVBQUFBLGNBQUEsT0FBSSxLQUFKO0FBQ0EsRUFBQUEsY0FBQSxRQUFLLEtBQUw7QUFDQSxFQUFBQSxjQUFBLFNBQU0sS0FBTjtBQUNBLEVBQUFBLGNBQUEsVUFBTyxLQUFQO0FBQ0EsRUFBQUEsY0FBQSxPQUFJLEtBQUo7QUFDQSxFQUFBQSxjQUFBLFFBQUssS0FBTDtBQUNBLEVBQUFBLGNBQUEsU0FBTSxLQUFOO0FBQ0EsRUFBQUEsY0FBQSxpQkFBYyxLQUFkO0FBQ0EsRUFBQUEsY0FBQSxnQkFBYSxNQUFiO0FBQ0EsRUFBQUEsY0FBQSxpQkFBYyxNQUFkO0FBQ0EsRUFBQUEsY0FBQSxTQUFNLE1BQU47QUFDQSxFQUFBQSxjQUFBLFlBQVMsTUFBVDtBQUNBLEVBQUFBLGNBQUEsb0JBQWlCLE1BQWpCO0FBZmlCLFNBQUFBO0FBQUEsR0FBQTtBQW9CbEIsTUFBTSxZQUFZO0FBQUEsRUFN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
