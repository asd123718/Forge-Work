import { onUnexpectedError } from "../../../../base/common/errors.js";
import * as strings from "../../../../base/common/strings.js";
import { IndentAction } from "../languageConfiguration.js";
import { EditorAutoIndentStrategy } from "../../config/editorOptions.js";
class OnEnterSupport {
  constructor(opts) {
    opts = opts || {};
    opts.brackets = opts.brackets || [
      ["(", ")"],
      ["{", "}"],
      ["[", "]"]
    ];
    this._brackets = [];
    opts.brackets.forEach((bracket) => {
      const openRegExp = OnEnterSupport._createOpenBracketRegExp(bracket[0]);
      const closeRegExp = OnEnterSupport._createCloseBracketRegExp(bracket[1]);
      if (openRegExp && closeRegExp) {
        this._brackets.push({
          open: bracket[0],
          openRegExp,
          close: bracket[1],
          closeRegExp
        });
      }
    });
    this._regExpRules = opts.onEnterRules || [];
  }
  onEnter(autoIndent, previousLineText, beforeEnterText, afterEnterText) {
    if (autoIndent >= EditorAutoIndentStrategy.Advanced) {
      for (let i = 0, len = this._regExpRules.length; i < len; i++) {
        const rule = this._regExpRules[i];
        const regResult = [{
          reg: rule.beforeText,
          text: beforeEnterText
        }, {
          reg: rule.afterText,
          text: afterEnterText
        }, {
          reg: rule.previousLineText,
          text: previousLineText
        }].every((obj) => {
          if (!obj.reg) {
            return true;
          }
          obj.reg.lastIndex = 0;
          return obj.reg.test(obj.text);
        });
        if (regResult) {
          return rule.action;
        }
      }
    }
    if (autoIndent >= EditorAutoIndentStrategy.Brackets) {
      if (beforeEnterText.length > 0 && afterEnterText.length > 0) {
        for (let i = 0, len = this._brackets.length; i < len; i++) {
          const bracket = this._brackets[i];
          if (bracket.openRegExp.test(beforeEnterText) && bracket.closeRegExp.test(afterEnterText)) {
            return { indentAction: IndentAction.IndentOutdent };
          }
        }
      }
    }
    if (autoIndent >= EditorAutoIndentStrategy.Brackets) {
      if (beforeEnterText.length > 0) {
        for (let i = 0, len = this._brackets.length; i < len; i++) {
          const bracket = this._brackets[i];
          if (bracket.openRegExp.test(beforeEnterText)) {
            return { indentAction: IndentAction.Indent };
          }
        }
      }
    }
    return null;
  }
  static _createOpenBracketRegExp(bracket) {
    let str = strings.escapeRegExpCharacters(bracket);
    if (!/\B/.test(str.charAt(0))) {
      str = "\\b" + str;
    }
    str += "\\s*$";
    return OnEnterSupport._safeRegExp(str);
  }
  static _createCloseBracketRegExp(bracket) {
    let str = strings.escapeRegExpCharacters(bracket);
    if (!/\B/.test(str.charAt(str.length - 1))) {
      str = str + "\\b";
    }
    str = "^\\s*" + str;
    return OnEnterSupport._safeRegExp(str);
  }
  static _safeRegExp(def) {
    try {
      return new RegExp(def);
    } catch (err) {
      onUnexpectedError(err);
      return null;
    }
  }
}
export {
  OnEnterSupport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbGFuZ3VhZ2VzXFxzdXBwb3J0c1xcb25FbnRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBDaGFyYWN0ZXJQYWlyLCBFbnRlckFjdGlvbiwgSW5kZW50QWN0aW9uLCBPbkVudGVyUnVsZSB9IGZyb20gJy4uL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kgfSBmcm9tICcuLi8uLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9uRW50ZXJTdXBwb3J0T3B0aW9ucyB7XG5cdGJyYWNrZXRzPzogQ2hhcmFjdGVyUGFpcltdO1xuXHRvbkVudGVyUnVsZXM/OiBPbkVudGVyUnVsZVtdO1xufVxuXG5pbnRlcmZhY2UgSVByb2Nlc3NlZEJyYWNrZXRQYWlyIHtcblx0b3Blbjogc3RyaW5nO1xuXHRjbG9zZTogc3RyaW5nO1xuXHRvcGVuUmVnRXhwOiBSZWdFeHA7XG5cdGNsb3NlUmVnRXhwOiBSZWdFeHA7XG59XG5cbmV4cG9ydCBjbGFzcyBPbkVudGVyU3VwcG9ydCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYnJhY2tldHM6IElQcm9jZXNzZWRCcmFja2V0UGFpcltdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdFeHBSdWxlczogT25FbnRlclJ1bGVbXTtcblxuXHRjb25zdHJ1Y3RvcihvcHRzOiBJT25FbnRlclN1cHBvcnRPcHRpb25zKSB7XG5cdFx0b3B0cyA9IG9wdHMgfHwge307XG5cdFx0b3B0cy5icmFja2V0cyA9IG9wdHMuYnJhY2tldHMgfHwgW1xuXHRcdFx0WycoJywgJyknXSxcblx0XHRcdFsneycsICd9J10sXG5cdFx0XHRbJ1snLCAnXSddXG5cdFx0XTtcblxuXHRcdHRoaXMuX2JyYWNrZXRzID0gW107XG5cdFx0b3B0cy5icmFja2V0cy5mb3JFYWNoKChicmFja2V0KSA9PiB7XG5cdFx0XHRjb25zdCBvcGVuUmVnRXhwID0gT25FbnRlclN1cHBvcnQuX2NyZWF0ZU9wZW5CcmFja2V0UmVnRXhwKGJyYWNrZXRbMF0pO1xuXHRcdFx0Y29uc3QgY2xvc2VSZWdFeHAgPSBPbkVudGVyU3VwcG9ydC5fY3JlYXRlQ2xvc2VCcmFja2V0UmVnRXhwKGJyYWNrZXRbMV0pO1xuXHRcdFx0aWYgKG9wZW5SZWdFeHAgJiYgY2xvc2VSZWdFeHApIHtcblx0XHRcdFx0dGhpcy5fYnJhY2tldHMucHVzaCh7XG5cdFx0XHRcdFx0b3BlbjogYnJhY2tldFswXSxcblx0XHRcdFx0XHRvcGVuUmVnRXhwOiBvcGVuUmVnRXhwLFxuXHRcdFx0XHRcdGNsb3NlOiBicmFja2V0WzFdLFxuXHRcdFx0XHRcdGNsb3NlUmVnRXhwOiBjbG9zZVJlZ0V4cCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnRXhwUnVsZXMgPSBvcHRzLm9uRW50ZXJSdWxlcyB8fCBbXTtcblx0fVxuXG5cdHB1YmxpYyBvbkVudGVyKGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSwgcHJldmlvdXNMaW5lVGV4dDogc3RyaW5nLCBiZWZvcmVFbnRlclRleHQ6IHN0cmluZywgYWZ0ZXJFbnRlclRleHQ6IHN0cmluZyk6IEVudGVyQWN0aW9uIHwgbnVsbCB7XG5cdFx0Ly8gKDEpOiBgcmVnRXhwUnVsZXNgXG5cdFx0aWYgKGF1dG9JbmRlbnQgPj0gRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkFkdmFuY2VkKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gdGhpcy5fcmVnRXhwUnVsZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgcnVsZSA9IHRoaXMuX3JlZ0V4cFJ1bGVzW2ldO1xuXHRcdFx0XHRjb25zdCByZWdSZXN1bHQgPSBbe1xuXHRcdFx0XHRcdHJlZzogcnVsZS5iZWZvcmVUZXh0LFxuXHRcdFx0XHRcdHRleHQ6IGJlZm9yZUVudGVyVGV4dFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0cmVnOiBydWxlLmFmdGVyVGV4dCxcblx0XHRcdFx0XHR0ZXh0OiBhZnRlckVudGVyVGV4dFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0cmVnOiBydWxlLnByZXZpb3VzTGluZVRleHQsXG5cdFx0XHRcdFx0dGV4dDogcHJldmlvdXNMaW5lVGV4dFxuXHRcdFx0XHR9XS5ldmVyeSgob2JqKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRcdFx0aWYgKCFvYmoucmVnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRvYmoucmVnLmxhc3RJbmRleCA9IDA7IC8vIFRvIGRpc2FibGUgdGhlIGVmZmVjdCBvZiB0aGUgXCJnXCIgZmxhZy5cblx0XHRcdFx0XHRyZXR1cm4gb2JqLnJlZy50ZXN0KG9iai50ZXh0KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKHJlZ1Jlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiBydWxlLmFjdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vICgyKTogU3BlY2lhbCBpbmRlbnQtb3V0ZGVudFxuXHRcdGlmIChhdXRvSW5kZW50ID49IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5CcmFja2V0cykge1xuXHRcdFx0aWYgKGJlZm9yZUVudGVyVGV4dC5sZW5ndGggPiAwICYmIGFmdGVyRW50ZXJUZXh0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX2JyYWNrZXRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgYnJhY2tldCA9IHRoaXMuX2JyYWNrZXRzW2ldO1xuXHRcdFx0XHRcdGlmIChicmFja2V0Lm9wZW5SZWdFeHAudGVzdChiZWZvcmVFbnRlclRleHQpICYmIGJyYWNrZXQuY2xvc2VSZWdFeHAudGVzdChhZnRlckVudGVyVGV4dCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLkluZGVudE91dGRlbnQgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdC8vICg0KTogT3BlbiBicmFja2V0IGJhc2VkIGxvZ2ljXG5cdFx0aWYgKGF1dG9JbmRlbnQgPj0gRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkJyYWNrZXRzKSB7XG5cdFx0XHRpZiAoYmVmb3JlRW50ZXJUZXh0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX2JyYWNrZXRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgYnJhY2tldCA9IHRoaXMuX2JyYWNrZXRzW2ldO1xuXHRcdFx0XHRcdGlmIChicmFja2V0Lm9wZW5SZWdFeHAudGVzdChiZWZvcmVFbnRlclRleHQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbi5JbmRlbnQgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jcmVhdGVPcGVuQnJhY2tldFJlZ0V4cChicmFja2V0OiBzdHJpbmcpOiBSZWdFeHAgfCBudWxsIHtcblx0XHRsZXQgc3RyID0gc3RyaW5ncy5lc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKGJyYWNrZXQpO1xuXHRcdGlmICghL1xcQi8udGVzdChzdHIuY2hhckF0KDApKSkge1xuXHRcdFx0c3RyID0gJ1xcXFxiJyArIHN0cjtcblx0XHR9XG5cdFx0c3RyICs9ICdcXFxccyokJztcblx0XHRyZXR1cm4gT25FbnRlclN1cHBvcnQuX3NhZmVSZWdFeHAoc3RyKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9jcmVhdGVDbG9zZUJyYWNrZXRSZWdFeHAoYnJhY2tldDogc3RyaW5nKTogUmVnRXhwIHwgbnVsbCB7XG5cdFx0bGV0IHN0ciA9IHN0cmluZ3MuZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhicmFja2V0KTtcblx0XHRpZiAoIS9cXEIvLnRlc3Qoc3RyLmNoYXJBdChzdHIubGVuZ3RoIC0gMSkpKSB7XG5cdFx0XHRzdHIgPSBzdHIgKyAnXFxcXGInO1xuXHRcdH1cblx0XHRzdHIgPSAnXlxcXFxzKicgKyBzdHI7XG5cdFx0cmV0dXJuIE9uRW50ZXJTdXBwb3J0Ll9zYWZlUmVnRXhwKHN0cik7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc2FmZVJlZ0V4cChkZWY6IHN0cmluZyk6IFJlZ0V4cCB8IG51bGwge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gbmV3IFJlZ0V4cChkZWYpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJy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
