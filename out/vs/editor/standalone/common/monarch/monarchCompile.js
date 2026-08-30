import { isString } from "../../../../base/common/types.js";
import * as monarchCommon from "./monarchCommon.js";
function isArrayOf(elemType, obj) {
  if (!obj) {
    return false;
  }
  if (!Array.isArray(obj)) {
    return false;
  }
  for (const el of obj) {
    if (!elemType(el)) {
      return false;
    }
  }
  return true;
}
function bool(prop, defValue) {
  if (typeof prop === "boolean") {
    return prop;
  }
  return defValue;
}
function string(prop, defValue) {
  if (typeof prop === "string") {
    return prop;
  }
  return defValue;
}
function arrayToHash(array) {
  const result = {};
  for (const e of array) {
    result[e] = true;
  }
  return result;
}
function createKeywordMatcher(arr, caseInsensitive = false) {
  if (caseInsensitive) {
    arr = arr.map(function(x) {
      return x.toLowerCase();
    });
  }
  const hash = arrayToHash(arr);
  if (caseInsensitive) {
    return function(word) {
      return hash[word.toLowerCase()] !== void 0 && hash.hasOwnProperty(word.toLowerCase());
    };
  } else {
    return function(word) {
      return hash[word] !== void 0 && hash.hasOwnProperty(word);
    };
  }
}
function compileRegExp(lexer, str, handleSn) {
  str = str.replace(/@@/g, ``);
  let n = 0;
  let hadExpansion;
  do {
    hadExpansion = false;
    str = str.replace(/@(\w+)/g, function(s, attr) {
      hadExpansion = true;
      let sub = "";
      if (typeof lexer[attr] === "string") {
        sub = lexer[attr];
      } else if (lexer[attr] && lexer[attr] instanceof RegExp) {
        sub = lexer[attr].source;
      } else {
        if (lexer[attr] === void 0) {
          throw monarchCommon.createError(lexer, "language definition does not contain attribute '" + attr + "', used at: " + str);
        } else {
          throw monarchCommon.createError(lexer, "attribute reference '" + attr + "' must be a string, used at: " + str);
        }
      }
      return monarchCommon.empty(sub) ? "" : "(?:" + sub + ")";
    });
    n++;
  } while (hadExpansion && n < 5);
  str = str.replace(/\x01/g, "@");
  const flags = (lexer.ignoreCase ? "i" : "") + (lexer.unicode ? "u" : "");
  if (handleSn) {
    const match = str.match(/\$[sS](\d\d?)/g);
    if (match) {
      let lastState = null;
      let lastRegEx = null;
      return (state) => {
        if (lastRegEx && lastState === state) {
          return lastRegEx;
        }
        lastState = state;
        lastRegEx = new RegExp(monarchCommon.substituteMatchesRe(lexer, str, state), flags);
        return lastRegEx;
      };
    }
  }
  return new RegExp(str, flags);
}
function selectScrutinee(id, matches, state, num) {
  if (num < 0) {
    return id;
  }
  if (num < matches.length) {
    return matches[num];
  }
  if (num >= 100) {
    num = num - 100;
    const parts = state.split(".");
    parts.unshift(state);
    if (num < parts.length) {
      return parts[num];
    }
  }
  return null;
}
function createGuard(lexer, ruleName, tkey, val) {
  let scrut = -1;
  let oppat = tkey;
  let matches = tkey.match(/^\$(([sS]?)(\d\d?)|#)(.*)$/);
  if (matches) {
    if (matches[3]) {
      scrut = parseInt(matches[3]);
      if (matches[2]) {
        scrut = scrut + 100;
      }
    }
    oppat = matches[4];
  }
  let op = "~";
  let pat = oppat;
  if (!oppat || oppat.length === 0) {
    op = "!=";
    pat = "";
  } else if (/^\w*$/.test(pat)) {
    op = "==";
  } else {
    matches = oppat.match(/^(@|!@|~|!~|==|!=)(.*)$/);
    if (matches) {
      op = matches[1];
      pat = matches[2];
    }
  }
  let tester;
  if ((op === "~" || op === "!~") && /^(\w|\|)*$/.test(pat)) {
    const inWords = createKeywordMatcher(pat.split("|"), lexer.ignoreCase);
    tester = function(s) {
      return op === "~" ? inWords(s) : !inWords(s);
    };
  } else if (op === "@" || op === "!@") {
    const words = lexer[pat];
    if (!words) {
      throw monarchCommon.createError(lexer, "the @ match target '" + pat + "' is not defined, in rule: " + ruleName);
    }
    if (!isArrayOf(function(elem) {
      return typeof elem === "string";
    }, words)) {
      throw monarchCommon.createError(lexer, "the @ match target '" + pat + "' must be an array of strings, in rule: " + ruleName);
    }
    const inWords = createKeywordMatcher(words, lexer.ignoreCase);
    tester = function(s) {
      return op === "@" ? inWords(s) : !inWords(s);
    };
  } else if (op === "~" || op === "!~") {
    if (pat.indexOf("$") < 0) {
      const re = compileRegExp(lexer, "^" + pat + "$", false);
      tester = function(s) {
        return op === "~" ? re.test(s) : !re.test(s);
      };
    } else {
      tester = function(s, id, matches2, state) {
        const re = compileRegExp(lexer, "^" + monarchCommon.substituteMatches(lexer, pat, id, matches2, state) + "$", false);
        return re.test(s);
      };
    }
  } else {
    if (pat.indexOf("$") < 0) {
      const patx = monarchCommon.fixCase(lexer, pat);
      tester = function(s) {
        return op === "==" ? s === patx : s !== patx;
      };
    } else {
      const patx = monarchCommon.fixCase(lexer, pat);
      tester = function(s, id, matches2, state, eos) {
        const patexp = monarchCommon.substituteMatches(lexer, patx, id, matches2, state);
        return op === "==" ? s === patexp : s !== patexp;
      };
    }
  }
  if (scrut === -1) {
    return {
      name: tkey,
      value: val,
      test: function(id, matches2, state, eos) {
        return tester(id, id, matches2, state, eos);
      }
    };
  } else {
    return {
      name: tkey,
      value: val,
      test: function(id, matches2, state, eos) {
        const scrutinee = selectScrutinee(id, matches2, state, scrut);
        return tester(!scrutinee ? "" : scrutinee, id, matches2, state, eos);
      }
    };
  }
}
function compileAction(lexer, ruleName, action) {
  if (!action) {
    return { token: "" };
  } else if (typeof action === "string") {
    return action;
  } else if (action.token || action.token === "") {
    if (typeof action.token !== "string") {
      throw monarchCommon.createError(lexer, "a 'token' attribute must be of type string, in rule: " + ruleName);
    } else {
      const newAction = { token: action.token };
      if (action.token.indexOf("$") >= 0) {
        newAction.tokenSubst = true;
      }
      if (typeof action.bracket === "string") {
        if (action.bracket === "@open") {
          newAction.bracket = monarchCommon.MonarchBracket.Open;
        } else if (action.bracket === "@close") {
          newAction.bracket = monarchCommon.MonarchBracket.Close;
        } else {
          throw monarchCommon.createError(lexer, "a 'bracket' attribute must be either '@open' or '@close', in rule: " + ruleName);
        }
      }
      if (action.next) {
        if (typeof action.next !== "string") {
          throw monarchCommon.createError(lexer, "the next state must be a string value in rule: " + ruleName);
        } else {
          let next = action.next;
          if (!/^(@pop|@push|@popall)$/.test(next)) {
            if (next[0] === "@") {
              next = next.substr(1);
            }
            if (next.indexOf("$") < 0) {
              if (!monarchCommon.stateExists(lexer, monarchCommon.substituteMatches(lexer, next, "", [], ""))) {
                throw monarchCommon.createError(lexer, "the next state '" + action.next + "' is not defined in rule: " + ruleName);
              }
            }
          }
          newAction.next = next;
        }
      }
      if (typeof action.goBack === "number") {
        newAction.goBack = action.goBack;
      }
      if (typeof action.switchTo === "string") {
        newAction.switchTo = action.switchTo;
      }
      if (typeof action.log === "string") {
        newAction.log = action.log;
      }
      if (typeof action.nextEmbedded === "string") {
        newAction.nextEmbedded = action.nextEmbedded;
        lexer.usesEmbedded = true;
      }
      return newAction;
    }
  } else if (Array.isArray(action)) {
    const results = [];
    for (let i = 0, len = action.length; i < len; i++) {
      results[i] = compileAction(lexer, ruleName, action[i]);
    }
    return { group: results };
  } else if (action.cases) {
    const cases = [];
    let hasEmbeddedEndInCases = false;
    for (const tkey in action.cases) {
      if (action.cases.hasOwnProperty(tkey)) {
        const val = compileAction(lexer, ruleName, action.cases[tkey]);
        if (tkey === "@default" || tkey === "@" || tkey === "") {
          cases.push({ test: void 0, value: val, name: tkey });
        } else if (tkey === "@eos") {
          cases.push({ test: function(id, matches, state, eos) {
            return eos;
          }, value: val, name: tkey });
        } else {
          cases.push(createGuard(lexer, ruleName, tkey, val));
        }
        if (!hasEmbeddedEndInCases) {
          hasEmbeddedEndInCases = !isString(val) && (val.hasEmbeddedEndInCases || ["@pop", "@popall"].includes(val.nextEmbedded || ""));
        }
      }
    }
    const def = lexer.defaultToken;
    return {
      hasEmbeddedEndInCases,
      test: function(id, matches, state, eos) {
        for (const _case of cases) {
          const didmatch = !_case.test || _case.test(id, matches, state, eos);
          if (didmatch) {
            return _case.value;
          }
        }
        return def;
      }
    };
  } else {
    throw monarchCommon.createError(lexer, "an action must be a string, an object with a 'token' or 'cases' attribute, or an array of actions; in rule: " + ruleName);
  }
}
class Rule {
  constructor(name) {
    this.regex = new RegExp("");
    this.action = { token: "" };
    this.matchOnlyAtLineStart = false;
    this.name = "";
    this.name = name;
  }
  setRegex(lexer, re) {
    let sregex;
    if (typeof re === "string") {
      sregex = re;
    } else if (re instanceof RegExp) {
      sregex = re.source;
    } else {
      throw monarchCommon.createError(lexer, "rules must start with a match string or regular expression: " + this.name);
    }
    this.matchOnlyAtLineStart = sregex.length > 0 && sregex[0] === "^";
    this.name = this.name + ": " + sregex;
    this.regex = compileRegExp(lexer, "^(?:" + (this.matchOnlyAtLineStart ? sregex.substr(1) : sregex) + ")", true);
  }
  setAction(lexer, act) {
    this.action = compileAction(lexer, this.name, act);
  }
  resolveRegex(state) {
    if (this.regex instanceof RegExp) {
      return this.regex;
    } else {
      return this.regex(state);
    }
  }
}
function compile(languageId, json) {
  if (!json || typeof json !== "object") {
    throw new Error("Monarch: expecting a language definition object");
  }
  const lexer = {
    languageId,
    includeLF: bool(json.includeLF, false),
    noThrow: false,
    // raise exceptions during compilation
    maxStack: 100,
    start: typeof json.start === "string" ? json.start : null,
    ignoreCase: bool(json.ignoreCase, false),
    unicode: bool(json.unicode, false),
    tokenPostfix: string(json.tokenPostfix, "." + languageId),
    defaultToken: string(json.defaultToken, "source"),
    usesEmbedded: false,
    // becomes true if we find a nextEmbedded action
    stateNames: {},
    tokenizer: {},
    brackets: []
  };
  const lexerMin = json;
  lexerMin.languageId = languageId;
  lexerMin.includeLF = lexer.includeLF;
  lexerMin.ignoreCase = lexer.ignoreCase;
  lexerMin.unicode = lexer.unicode;
  lexerMin.noThrow = lexer.noThrow;
  lexerMin.usesEmbedded = lexer.usesEmbedded;
  lexerMin.stateNames = json.tokenizer;
  lexerMin.defaultToken = lexer.defaultToken;
  function addRules(state, newrules, rules) {
    for (const rule of rules) {
      let include = rule.include;
      if (include) {
        if (typeof include !== "string") {
          throw monarchCommon.createError(lexer, "an 'include' attribute must be a string at: " + state);
        }
        if (include[0] === "@") {
          include = include.substr(1);
        }
        if (!json.tokenizer[include]) {
          throw monarchCommon.createError(lexer, "include target '" + include + "' is not defined at: " + state);
        }
        addRules(state + "." + include, newrules, json.tokenizer[include]);
      } else {
        const newrule = new Rule(state);
        if (Array.isArray(rule) && rule.length >= 1 && rule.length <= 3) {
          newrule.setRegex(lexerMin, rule[0]);
          if (rule.length >= 3) {
            if (typeof rule[1] === "string") {
              newrule.setAction(lexerMin, { token: rule[1], next: rule[2] });
            } else if (typeof rule[1] === "object") {
              const rule1 = rule[1];
              rule1.next = rule[2];
              newrule.setAction(lexerMin, rule1);
            } else {
              throw monarchCommon.createError(lexer, "a next state as the last element of a rule can only be given if the action is either an object or a string, at: " + state);
            }
          } else {
            newrule.setAction(lexerMin, rule[1]);
          }
        } else {
          if (!rule.regex) {
            throw monarchCommon.createError(lexer, "a rule must either be an array, or an object with a 'regex' or 'include' field at: " + state);
          }
          if (rule.name) {
            if (typeof rule.name === "string") {
              newrule.name = rule.name;
            }
          }
          if (rule.matchOnlyAtStart) {
            newrule.matchOnlyAtLineStart = bool(rule.matchOnlyAtLineStart, false);
          }
          newrule.setRegex(lexerMin, rule.regex);
          newrule.setAction(lexerMin, rule.action);
        }
        newrules.push(newrule);
      }
    }
  }
  if (!json.tokenizer || typeof json.tokenizer !== "object") {
    throw monarchCommon.createError(lexer, "a language definition must define the 'tokenizer' attribute as an object");
  }
  lexer.tokenizer = [];
  for (const key in json.tokenizer) {
    if (json.tokenizer.hasOwnProperty(key)) {
      if (!lexer.start) {
        lexer.start = key;
      }
      const rules = json.tokenizer[key];
      lexer.tokenizer[key] = new Array();
      addRules("tokenizer." + key, lexer.tokenizer[key], rules);
    }
  }
  lexer.usesEmbedded = lexerMin.usesEmbedded;
  if (json.brackets) {
    if (!Array.isArray(json.brackets)) {
      throw monarchCommon.createError(lexer, "the 'brackets' attribute must be defined as an array");
    }
  } else {
    json.brackets = [
      { open: "{", close: "}", token: "delimiter.curly" },
      { open: "[", close: "]", token: "delimiter.square" },
      { open: "(", close: ")", token: "delimiter.parenthesis" },
      { open: "<", close: ">", token: "delimiter.angle" }
    ];
  }
  const brackets = [];
  for (const el of json.brackets) {
    let desc = el;
    if (desc && Array.isArray(desc) && desc.length === 3) {
      desc = { token: desc[2], open: desc[0], close: desc[1] };
    }
    if (desc.open === desc.close) {
      throw monarchCommon.createError(lexer, "open and close brackets in a 'brackets' attribute must be different: " + desc.open + "\n hint: use the 'bracket' attribute if matching on equal brackets is required.");
    }
    if (typeof desc.open === "string" && typeof desc.token === "string" && typeof desc.close === "string") {
      brackets.push({
        token: desc.token + lexer.tokenPostfix,
        open: monarchCommon.fixCase(lexer, desc.open),
        close: monarchCommon.fixCase(lexer, desc.close)
      });
    } else {
      throw monarchCommon.createError(lexer, "every element in the 'brackets' array must be a '{open,close,token}' object or array");
    }
  }
  lexer.brackets = brackets;
  lexer.noThrow = true;
  return lexer;
}
export {
  compile
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXGNvbW1vblxcbW9uYXJjaFxcbW9uYXJjaENvbXBpbGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKlxuICogVGhpcyBtb2R1bGUgb25seSBleHBvcnRzICdjb21waWxlJyB3aGljaCBjb21waWxlcyBhIEpTT04gbGFuZ3VhZ2UgZGVmaW5pdGlvblxuICogaW50byBhIHR5cGVkIGFuZCBjaGVja2VkIElMZXhlciBkZWZpbml0aW9uLlxuICovXG5cbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgbW9uYXJjaENvbW1vbiBmcm9tICcuL21vbmFyY2hDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vbmFyY2hMYW5ndWFnZSwgSU1vbmFyY2hMYW5ndWFnZUJyYWNrZXQgfSBmcm9tICcuL21vbmFyY2hUeXBlcy5qcyc7XG5cbi8qXG4gKiBUeXBlIGhlbHBlcnNcbiAqXG4gKiBOb3RlOiB0aGlzIGlzIGp1c3QgZm9yIHNhbml0eSBjaGVja3Mgb24gdGhlIEpTT04gZGVzY3JpcHRpb24gd2hpY2ggaXNcbiAqIGhlbHBmdWwgZm9yIHRoZSBwcm9ncmFtbWVyLiBObyBjaGVja3MgYXJlIGRvbmUgYW55bW9yZSBvbmNlIHRoZSBsZXhlciBpc1xuICogYWxyZWFkeSAnY29tcGlsZWQgYW5kIGNoZWNrZWQnLlxuICpcbiAqL1xuXG5mdW5jdGlvbiBpc0FycmF5T2YoZWxlbVR5cGU6ICh4OiBhbnkpID0+IGJvb2xlYW4sIG9iajogYW55KTogYm9vbGVhbiB7XG5cdGlmICghb2JqKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghKEFycmF5LmlzQXJyYXkob2JqKSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Zm9yIChjb25zdCBlbCBvZiBvYmopIHtcblx0XHRpZiAoIShlbGVtVHlwZShlbCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBib29sKHByb3A6IGFueSwgZGVmVmFsdWU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0aWYgKHR5cGVvZiBwcm9wID09PSAnYm9vbGVhbicpIHtcblx0XHRyZXR1cm4gcHJvcDtcblx0fVxuXHRyZXR1cm4gZGVmVmFsdWU7XG59XG5cbmZ1bmN0aW9uIHN0cmluZyhwcm9wOiBhbnksIGRlZlZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAodHlwZW9mIChwcm9wKSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gcHJvcDtcblx0fVxuXHRyZXR1cm4gZGVmVmFsdWU7XG59XG5cblxuZnVuY3Rpb24gYXJyYXlUb0hhc2goYXJyYXk6IHN0cmluZ1tdKTogeyBbbmFtZTogc3RyaW5nXTogdHJ1ZSB9IHtcblx0Y29uc3QgcmVzdWx0OiBhbnkgPSB7fTtcblx0Zm9yIChjb25zdCBlIG9mIGFycmF5KSB7XG5cdFx0cmVzdWx0W2VdID0gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5cbmZ1bmN0aW9uIGNyZWF0ZUtleXdvcmRNYXRjaGVyKGFycjogc3RyaW5nW10sIGNhc2VJbnNlbnNpdGl2ZTogYm9vbGVhbiA9IGZhbHNlKTogKHN0cjogc3RyaW5nKSA9PiBib29sZWFuIHtcblx0aWYgKGNhc2VJbnNlbnNpdGl2ZSkge1xuXHRcdGFyciA9IGFyci5tYXAoZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHgudG9Mb3dlckNhc2UoKTsgfSk7XG5cdH1cblx0Y29uc3QgaGFzaCA9IGFycmF5VG9IYXNoKGFycik7XG5cdGlmIChjYXNlSW5zZW5zaXRpdmUpIHtcblx0XHRyZXR1cm4gZnVuY3Rpb24gKHdvcmQpIHtcblx0XHRcdHJldHVybiBoYXNoW3dvcmQudG9Mb3dlckNhc2UoKV0gIT09IHVuZGVmaW5lZCAmJiBoYXNoLmhhc093blByb3BlcnR5KHdvcmQudG9Mb3dlckNhc2UoKSk7XG5cdFx0fTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gZnVuY3Rpb24gKHdvcmQpIHtcblx0XHRcdHJldHVybiBoYXNoW3dvcmRdICE9PSB1bmRlZmluZWQgJiYgaGFzaC5oYXNPd25Qcm9wZXJ0eSh3b3JkKTtcblx0XHR9O1xuXHR9XG59XG5cblxuLy8gTGV4ZXIgaGVscGVyc1xuXG4vKipcbiAqIENvbXBpbGVzIGEgcmVndWxhciBleHByZXNzaW9uIHN0cmluZywgYWRkaW5nIHRoZSAnaScgZmxhZyBpZiAnaWdub3JlQ2FzZScgaXMgc2V0LCBhbmQgdGhlICd1JyBmbGFnIGlmICd1bmljb2RlJyBpcyBzZXQuXG4gKiBBbHNvIHJlcGxhY2VzIEBcXHcrIG9yIHNlcXVlbmNlcyB3aXRoIHRoZSBjb250ZW50IG9mIHRoZSBzcGVjaWZpZWQgYXR0cmlidXRlXG4gKiBAXFx3KyByZXBsYWNlbWVudCBjYW4gYmUgYXZvaWRlZCBieSBlc2NhcGluZyBgQGAgc2lnbnMgd2l0aCBhbm90aGVyIGBAYCBzaWduLlxuICogQGV4YW1wbGUgL0BhdHRyLyB3aWxsIGJlIHJlcGxhY2VkIHdpdGggdGhlIHZhbHVlIG9mIGxleGVyW2F0dHJdXG4gKiBAZXhhbXBsZSAvQEB0ZXh0LyB3aWxsIG5vdCBiZSByZXBsYWNlZCBhbmQgd2lsbCBiZWNvbWUgL0B0ZXh0Ly5cbiAqL1xuZnVuY3Rpb24gY29tcGlsZVJlZ0V4cDxTIGV4dGVuZHMgdHJ1ZSB8IGZhbHNlPihsZXhlcjogbW9uYXJjaENvbW1vbi5JTGV4ZXJNaW4sIHN0cjogc3RyaW5nLCBoYW5kbGVTbjogUyk6IFMgZXh0ZW5kcyB0cnVlID8gUmVnRXhwIHwgRHluYW1pY1JlZ0V4cCA6IFJlZ0V4cDtcbmZ1bmN0aW9uIGNvbXBpbGVSZWdFeHAobGV4ZXI6IG1vbmFyY2hDb21tb24uSUxleGVyTWluLCBzdHI6IHN0cmluZywgaGFuZGxlU246IHRydWUgfCBmYWxzZSk6IFJlZ0V4cCB8IER5bmFtaWNSZWdFeHAge1xuXHQvLyBAQCBtdXN0IGJlIGludGVycHJldGVkIGFzIGEgbGl0ZXJhbCBALCBzbyB3ZSByZXBsYWNlIGFsbCBvY2N1cmVuY2VzIG9mIEBAIHdpdGggYSBwbGFjZWhvbGRlciBjaGFyYWN0ZXJcblx0c3RyID0gc3RyLnJlcGxhY2UoL0BAL2csIGBcXHgwMWApO1xuXG5cdGxldCBuID0gMDtcblx0bGV0IGhhZEV4cGFuc2lvbjogYm9vbGVhbjtcblx0ZG8ge1xuXHRcdGhhZEV4cGFuc2lvbiA9IGZhbHNlO1xuXHRcdHN0ciA9IHN0ci5yZXBsYWNlKC9AKFxcdyspL2csIGZ1bmN0aW9uIChzLCBhdHRyPykge1xuXHRcdFx0aGFkRXhwYW5zaW9uID0gdHJ1ZTtcblx0XHRcdGxldCBzdWIgPSAnJztcblx0XHRcdGlmICh0eXBlb2YgKGxleGVyW2F0dHJdKSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0c3ViID0gbGV4ZXJbYXR0cl07XG5cdFx0XHR9IGVsc2UgaWYgKGxleGVyW2F0dHJdICYmIGxleGVyW2F0dHJdIGluc3RhbmNlb2YgUmVnRXhwKSB7XG5cdFx0XHRcdHN1YiA9IGxleGVyW2F0dHJdLnNvdXJjZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChsZXhlclthdHRyXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ2xhbmd1YWdlIGRlZmluaXRpb24gZG9lcyBub3QgY29udGFpbiBhdHRyaWJ1dGUgXFwnJyArIGF0dHIgKyAnXFwnLCB1c2VkIGF0OiAnICsgc3RyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAnYXR0cmlidXRlIHJlZmVyZW5jZSBcXCcnICsgYXR0ciArICdcXCcgbXVzdCBiZSBhIHN0cmluZywgdXNlZCBhdDogJyArIHN0cik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiAobW9uYXJjaENvbW1vbi5lbXB0eShzdWIpID8gJycgOiAnKD86JyArIHN1YiArICcpJyk7XG5cdFx0fSk7XG5cdFx0bisrO1xuXHR9IHdoaWxlIChoYWRFeHBhbnNpb24gJiYgbiA8IDUpO1xuXG5cdC8vIGhhbmRsZSBlc2NhcGVkIEBAXG5cdHN0ciA9IHN0ci5yZXBsYWNlKC9cXHgwMS9nLCAnQCcpO1xuXG5cdGNvbnN0IGZsYWdzID0gKGxleGVyLmlnbm9yZUNhc2UgPyAnaScgOiAnJykgKyAobGV4ZXIudW5pY29kZSA/ICd1JyA6ICcnKTtcblxuXHQvLyBoYW5kbGUgJFNuXG5cdGlmIChoYW5kbGVTbikge1xuXHRcdGNvbnN0IG1hdGNoID0gc3RyLm1hdGNoKC9cXCRbc1NdKFxcZFxcZD8pL2cpO1xuXHRcdGlmIChtYXRjaCkge1xuXHRcdFx0bGV0IGxhc3RTdGF0ZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRsZXQgbGFzdFJlZ0V4OiBSZWdFeHAgfCBudWxsID0gbnVsbDtcblx0XHRcdHJldHVybiAoc3RhdGU6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAobGFzdFJlZ0V4ICYmIGxhc3RTdGF0ZSA9PT0gc3RhdGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gbGFzdFJlZ0V4O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RTdGF0ZSA9IHN0YXRlO1xuXHRcdFx0XHRsYXN0UmVnRXggPSBuZXcgUmVnRXhwKG1vbmFyY2hDb21tb24uc3Vic3RpdHV0ZU1hdGNoZXNSZShsZXhlciwgc3RyLCBzdGF0ZSksIGZsYWdzKTtcblx0XHRcdFx0cmV0dXJuIGxhc3RSZWdFeDtcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG5ldyBSZWdFeHAoc3RyLCBmbGFncyk7XG59XG5cbi8qKlxuICogQ29tcGlsZXMgZ3VhcmQgZnVuY3Rpb25zIGZvciBjYXNlIG1hdGNoZXMuXG4gKiBUaGlzIGNvbXBpbGVzICdjYXNlcycgYXR0cmlidXRlcyBpbnRvIGVmZmljaWVudCBtYXRjaCBmdW5jdGlvbnMuXG4gKlxuICovXG5mdW5jdGlvbiBzZWxlY3RTY3J1dGluZWUoaWQ6IHN0cmluZywgbWF0Y2hlczogc3RyaW5nW10sIHN0YXRlOiBzdHJpbmcsIG51bTogbnVtYmVyKTogc3RyaW5nIHwgbnVsbCB7XG5cdGlmIChudW0gPCAwKSB7XG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cdGlmIChudW0gPCBtYXRjaGVzLmxlbmd0aCkge1xuXHRcdHJldHVybiBtYXRjaGVzW251bV07XG5cdH1cblx0aWYgKG51bSA+PSAxMDApIHtcblx0XHRudW0gPSBudW0gLSAxMDA7XG5cdFx0Y29uc3QgcGFydHMgPSBzdGF0ZS5zcGxpdCgnLicpO1xuXHRcdHBhcnRzLnVuc2hpZnQoc3RhdGUpO1xuXHRcdGlmIChudW0gPCBwYXJ0cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBwYXJ0c1tudW1dO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlR3VhcmQobGV4ZXI6IG1vbmFyY2hDb21tb24uSUxleGVyTWluLCBydWxlTmFtZTogc3RyaW5nLCB0a2V5OiBzdHJpbmcsIHZhbDogbW9uYXJjaENvbW1vbi5GdXp6eUFjdGlvbik6IG1vbmFyY2hDb21tb24uSUJyYW5jaCB7XG5cdC8vIGdldCB0aGUgc2NydXRpbmVlIGFuZCBwYXR0ZXJuXG5cdGxldCBzY3J1dCA9IC0xOyAvLyAtMTogJCEsIDAtOTk6ICRuLCAxMDArbjogJFNuXG5cdGxldCBvcHBhdCA9IHRrZXk7XG5cdGxldCBtYXRjaGVzID0gdGtleS5tYXRjaCgvXlxcJCgoW3NTXT8pKFxcZFxcZD8pfCMpKC4qKSQvKTtcblx0aWYgKG1hdGNoZXMpIHtcblx0XHRpZiAobWF0Y2hlc1szXSkgeyAvLyBpZiBkaWdpdHNcblx0XHRcdHNjcnV0ID0gcGFyc2VJbnQobWF0Y2hlc1szXSk7XG5cdFx0XHRpZiAobWF0Y2hlc1syXSkge1xuXHRcdFx0XHRzY3J1dCA9IHNjcnV0ICsgMTAwOyAvLyBpZiBbc1NdIHByZXNlbnRcblx0XHRcdH1cblx0XHR9XG5cdFx0b3BwYXQgPSBtYXRjaGVzWzRdO1xuXHR9XG5cdC8vIGdldCBvcGVyYXRvclxuXHRsZXQgb3AgPSAnfic7XG5cdGxldCBwYXQgPSBvcHBhdDtcblx0aWYgKCFvcHBhdCB8fCBvcHBhdC5sZW5ndGggPT09IDApIHtcblx0XHRvcCA9ICchPSc7XG5cdFx0cGF0ID0gJyc7XG5cdH1cblx0ZWxzZSBpZiAoL15cXHcqJC8udGVzdChwYXQpKSB7ICAvLyBqdXN0IGEgd29yZFxuXHRcdG9wID0gJz09Jztcblx0fVxuXHRlbHNlIHtcblx0XHRtYXRjaGVzID0gb3BwYXQubWF0Y2goL14oQHwhQHx+fCF+fD09fCE9KSguKikkLyk7XG5cdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdG9wID0gbWF0Y2hlc1sxXTtcblx0XHRcdHBhdCA9IG1hdGNoZXNbMl07XG5cdFx0fVxuXHR9XG5cblx0Ly8gc2V0IHRoZSB0ZXN0ZXIgZnVuY3Rpb25cblx0bGV0IHRlc3RlcjogKHM6IHN0cmluZywgaWQ6IHN0cmluZywgbWF0Y2hlczogc3RyaW5nW10sIHN0YXRlOiBzdHJpbmcsIGVvczogYm9vbGVhbikgPT4gYm9vbGVhbjtcblxuXHQvLyBzcGVjaWFsIGNhc2UgYSByZWdleHAgdGhhdCBtYXRjaGVzIGp1c3Qgd29yZHNcblx0aWYgKChvcCA9PT0gJ34nIHx8IG9wID09PSAnIX4nKSAmJiAvXihcXHd8XFx8KSokLy50ZXN0KHBhdCkpIHtcblx0XHRjb25zdCBpbldvcmRzID0gY3JlYXRlS2V5d29yZE1hdGNoZXIocGF0LnNwbGl0KCd8JyksIGxleGVyLmlnbm9yZUNhc2UpO1xuXHRcdHRlc3RlciA9IGZ1bmN0aW9uIChzKSB7IHJldHVybiAob3AgPT09ICd+JyA/IGluV29yZHMocykgOiAhaW5Xb3JkcyhzKSk7IH07XG5cdH1cblx0ZWxzZSBpZiAob3AgPT09ICdAJyB8fCBvcCA9PT0gJyFAJykge1xuXHRcdGNvbnN0IHdvcmRzID0gbGV4ZXJbcGF0XTtcblx0XHRpZiAoIXdvcmRzKSB7XG5cdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAndGhlIEAgbWF0Y2ggdGFyZ2V0IFxcJycgKyBwYXQgKyAnXFwnIGlzIG5vdCBkZWZpbmVkLCBpbiBydWxlOiAnICsgcnVsZU5hbWUpO1xuXHRcdH1cblx0XHRpZiAoIShpc0FycmF5T2YoZnVuY3Rpb24gKGVsZW0pIHsgcmV0dXJuICh0eXBlb2YgKGVsZW0pID09PSAnc3RyaW5nJyk7IH0sIHdvcmRzKSkpIHtcblx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICd0aGUgQCBtYXRjaCB0YXJnZXQgXFwnJyArIHBhdCArICdcXCcgbXVzdCBiZSBhbiBhcnJheSBvZiBzdHJpbmdzLCBpbiBydWxlOiAnICsgcnVsZU5hbWUpO1xuXHRcdH1cblx0XHRjb25zdCBpbldvcmRzID0gY3JlYXRlS2V5d29yZE1hdGNoZXIod29yZHMsIGxleGVyLmlnbm9yZUNhc2UpO1xuXHRcdHRlc3RlciA9IGZ1bmN0aW9uIChzKSB7IHJldHVybiAob3AgPT09ICdAJyA/IGluV29yZHMocykgOiAhaW5Xb3JkcyhzKSk7IH07XG5cdH1cblx0ZWxzZSBpZiAob3AgPT09ICd+JyB8fCBvcCA9PT0gJyF+Jykge1xuXHRcdGlmIChwYXQuaW5kZXhPZignJCcpIDwgMCkge1xuXHRcdFx0Ly8gcHJlY29tcGlsZSByZWd1bGFyIGV4cHJlc3Npb25cblx0XHRcdGNvbnN0IHJlID0gY29tcGlsZVJlZ0V4cChsZXhlciwgJ14nICsgcGF0ICsgJyQnLCBmYWxzZSk7XG5cdFx0XHR0ZXN0ZXIgPSBmdW5jdGlvbiAocykgeyByZXR1cm4gKG9wID09PSAnficgPyByZS50ZXN0KHMpIDogIXJlLnRlc3QocykpOyB9O1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHRlc3RlciA9IGZ1bmN0aW9uIChzLCBpZCwgbWF0Y2hlcywgc3RhdGUpIHtcblx0XHRcdFx0Y29uc3QgcmUgPSBjb21waWxlUmVnRXhwKGxleGVyLCAnXicgKyBtb25hcmNoQ29tbW9uLnN1YnN0aXR1dGVNYXRjaGVzKGxleGVyLCBwYXQsIGlkLCBtYXRjaGVzLCBzdGF0ZSkgKyAnJCcsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuIHJlLnRlc3Qocyk7XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXHRlbHNlIHsgLy8gaWYgKG9wPT09Jz09JyB8fCBvcD09PSchPScpIHtcblx0XHRpZiAocGF0LmluZGV4T2YoJyQnKSA8IDApIHtcblx0XHRcdGNvbnN0IHBhdHggPSBtb25hcmNoQ29tbW9uLmZpeENhc2UobGV4ZXIsIHBhdCk7XG5cdFx0XHR0ZXN0ZXIgPSBmdW5jdGlvbiAocykgeyByZXR1cm4gKG9wID09PSAnPT0nID8gcyA9PT0gcGF0eCA6IHMgIT09IHBhdHgpOyB9O1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IHBhdHggPSBtb25hcmNoQ29tbW9uLmZpeENhc2UobGV4ZXIsIHBhdCk7XG5cdFx0XHR0ZXN0ZXIgPSBmdW5jdGlvbiAocywgaWQsIG1hdGNoZXMsIHN0YXRlLCBlb3MpIHtcblx0XHRcdFx0Y29uc3QgcGF0ZXhwID0gbW9uYXJjaENvbW1vbi5zdWJzdGl0dXRlTWF0Y2hlcyhsZXhlciwgcGF0eCwgaWQsIG1hdGNoZXMsIHN0YXRlKTtcblx0XHRcdFx0cmV0dXJuIChvcCA9PT0gJz09JyA/IHMgPT09IHBhdGV4cCA6IHMgIT09IHBhdGV4cCk7XG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdC8vIHJldHVybiB0aGUgYnJhbmNoIG9iamVjdFxuXHRpZiAoc2NydXQgPT09IC0xKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IHRrZXksIHZhbHVlOiB2YWwsIHRlc3Q6IGZ1bmN0aW9uIChpZCwgbWF0Y2hlcywgc3RhdGUsIGVvcykge1xuXHRcdFx0XHRyZXR1cm4gdGVzdGVyKGlkLCBpZCwgbWF0Y2hlcywgc3RhdGUsIGVvcyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXHRlbHNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogdGtleSwgdmFsdWU6IHZhbCwgdGVzdDogZnVuY3Rpb24gKGlkLCBtYXRjaGVzLCBzdGF0ZSwgZW9zKSB7XG5cdFx0XHRcdGNvbnN0IHNjcnV0aW5lZSA9IHNlbGVjdFNjcnV0aW5lZShpZCwgbWF0Y2hlcywgc3RhdGUsIHNjcnV0KTtcblx0XHRcdFx0cmV0dXJuIHRlc3Rlcighc2NydXRpbmVlID8gJycgOiBzY3J1dGluZWUsIGlkLCBtYXRjaGVzLCBzdGF0ZSwgZW9zKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbi8qKlxuICogQ29tcGlsZXMgYW4gYWN0aW9uOiBpLmUuIG9wdGltaXplIHJlZ3VsYXIgZXhwcmVzc2lvbnMgYW5kIGNhc2UgbWF0Y2hlc1xuICogYW5kIGRvIG1hbnkgc2FuaXR5IGNoZWNrcy5cbiAqXG4gKiBUaGlzIGlzIGNhbGxlZCBvbmx5IGR1cmluZyBjb21waWxhdGlvbiBidXQgaWYgdGhlIGxleGVyIGRlZmluaXRpb25cbiAqIGNvbnRhaW5zIHVzZXIgZnVuY3Rpb25zIGFzIGFjdGlvbnMgKHdoaWNoIGlzIHVzdWFsbHkgbm90IGFsbG93ZWQpLCB0aGVuIHRoaXNcbiAqIG1heSBiZSBjYWxsZWQgZHVyaW5nIGxleGluZy4gSXQgaXMgaW1wb3J0YW50IHRoZXJlZm9yZSB0byBjb21waWxlIGNvbW1vbiBjYXNlcyBlZmZpY2llbnRseVxuICovXG5mdW5jdGlvbiBjb21waWxlQWN0aW9uKGxleGVyOiBtb25hcmNoQ29tbW9uLklMZXhlck1pbiwgcnVsZU5hbWU6IHN0cmluZywgYWN0aW9uOiBhbnkpOiBtb25hcmNoQ29tbW9uLkZ1enp5QWN0aW9uIHtcblx0aWYgKCFhY3Rpb24pIHtcblx0XHRyZXR1cm4geyB0b2tlbjogJycgfTtcblx0fVxuXHRlbHNlIGlmICh0eXBlb2YgKGFjdGlvbikgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGFjdGlvbjsgLy8geyB0b2tlbjogYWN0aW9uIH07XG5cdH1cblx0ZWxzZSBpZiAoYWN0aW9uLnRva2VuIHx8IGFjdGlvbi50b2tlbiA9PT0gJycpIHtcblx0XHRpZiAodHlwZW9mIChhY3Rpb24udG9rZW4pICE9PSAnc3RyaW5nJykge1xuXHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ2EgXFwndG9rZW5cXCcgYXR0cmlidXRlIG11c3QgYmUgb2YgdHlwZSBzdHJpbmcsIGluIHJ1bGU6ICcgKyBydWxlTmFtZSk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0Ly8gb25seSBjb3B5IHNwZWNpZmljIHR5cGVkIGZpZWxkcyAob25seSBoYXBwZW5zIG9uY2UgZHVyaW5nIGNvbXBpbGUgTGV4ZXIpXG5cdFx0XHRjb25zdCBuZXdBY3Rpb246IG1vbmFyY2hDb21tb24uSUFjdGlvbiA9IHsgdG9rZW46IGFjdGlvbi50b2tlbiB9O1xuXHRcdFx0aWYgKGFjdGlvbi50b2tlbi5pbmRleE9mKCckJykgPj0gMCkge1xuXHRcdFx0XHRuZXdBY3Rpb24udG9rZW5TdWJzdCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIChhY3Rpb24uYnJhY2tldCkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGlmIChhY3Rpb24uYnJhY2tldCA9PT0gJ0BvcGVuJykge1xuXHRcdFx0XHRcdG5ld0FjdGlvbi5icmFja2V0ID0gbW9uYXJjaENvbW1vbi5Nb25hcmNoQnJhY2tldC5PcGVuO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5icmFja2V0ID09PSAnQGNsb3NlJykge1xuXHRcdFx0XHRcdG5ld0FjdGlvbi5icmFja2V0ID0gbW9uYXJjaENvbW1vbi5Nb25hcmNoQnJhY2tldC5DbG9zZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAnYSBcXCdicmFja2V0XFwnIGF0dHJpYnV0ZSBtdXN0IGJlIGVpdGhlciBcXCdAb3BlblxcJyBvciBcXCdAY2xvc2VcXCcsIGluIHJ1bGU6ICcgKyBydWxlTmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChhY3Rpb24ubmV4dCkge1xuXHRcdFx0XHRpZiAodHlwZW9mIChhY3Rpb24ubmV4dCkgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ3RoZSBuZXh0IHN0YXRlIG11c3QgYmUgYSBzdHJpbmcgdmFsdWUgaW4gcnVsZTogJyArIHJ1bGVOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRsZXQgbmV4dDogc3RyaW5nID0gYWN0aW9uLm5leHQ7XG5cdFx0XHRcdFx0aWYgKCEvXihAcG9wfEBwdXNofEBwb3BhbGwpJC8udGVzdChuZXh0KSkge1xuXHRcdFx0XHRcdFx0aWYgKG5leHRbMF0gPT09ICdAJykge1xuXHRcdFx0XHRcdFx0XHRuZXh0ID0gbmV4dC5zdWJzdHIoMSk7IC8vIHBlZWwgb2ZmIHN0YXJ0aW5nIEAgc2lnblxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKG5leHQuaW5kZXhPZignJCcpIDwgMCkgeyAgLy8gbm8gZG9sbGFyIHN1YnN0aXR1dGlvbiwgd2UgY2FuIGNoZWNrIGlmIHRoZSBzdGF0ZSBleGlzdHNcblx0XHRcdFx0XHRcdFx0aWYgKCFtb25hcmNoQ29tbW9uLnN0YXRlRXhpc3RzKGxleGVyLCBtb25hcmNoQ29tbW9uLnN1YnN0aXR1dGVNYXRjaGVzKGxleGVyLCBuZXh0LCAnJywgW10sICcnKSkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAndGhlIG5leHQgc3RhdGUgXFwnJyArIGFjdGlvbi5uZXh0ICsgJ1xcJyBpcyBub3QgZGVmaW5lZCBpbiBydWxlOiAnICsgcnVsZU5hbWUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdG5ld0FjdGlvbi5uZXh0ID0gbmV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiAoYWN0aW9uLmdvQmFjaykgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdG5ld0FjdGlvbi5nb0JhY2sgPSBhY3Rpb24uZ29CYWNrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiAoYWN0aW9uLnN3aXRjaFRvKSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0bmV3QWN0aW9uLnN3aXRjaFRvID0gYWN0aW9uLnN3aXRjaFRvO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiAoYWN0aW9uLmxvZykgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdG5ld0FjdGlvbi5sb2cgPSBhY3Rpb24ubG9nO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiAoYWN0aW9uLm5leHRFbWJlZGRlZCkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdG5ld0FjdGlvbi5uZXh0RW1iZWRkZWQgPSBhY3Rpb24ubmV4dEVtYmVkZGVkO1xuXHRcdFx0XHRsZXhlci51c2VzRW1iZWRkZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ld0FjdGlvbjtcblx0XHR9XG5cdH1cblx0ZWxzZSBpZiAoQXJyYXkuaXNBcnJheShhY3Rpb24pKSB7XG5cdFx0Y29uc3QgcmVzdWx0czogbW9uYXJjaENvbW1vbi5GdXp6eUFjdGlvbltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGFjdGlvbi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0cmVzdWx0c1tpXSA9IGNvbXBpbGVBY3Rpb24obGV4ZXIsIHJ1bGVOYW1lLCBhY3Rpb25baV0pO1xuXHRcdH1cblx0XHRyZXR1cm4geyBncm91cDogcmVzdWx0cyB9O1xuXHR9XG5cdGVsc2UgaWYgKGFjdGlvbi5jYXNlcykge1xuXHRcdC8vIGJ1aWxkIGFuIGFycmF5IG9mIHRlc3QgY2FzZXNcblx0XHRjb25zdCBjYXNlczogbW9uYXJjaENvbW1vbi5JQnJhbmNoW10gPSBbXTtcblxuXHRcdGxldCBoYXNFbWJlZGRlZEVuZEluQ2FzZXMgPSBmYWxzZTtcblx0XHQvLyBmb3IgZWFjaCBjYXNlLCBwdXNoIGEgdGVzdCBmdW5jdGlvbiBhbmQgcmVzdWx0IHZhbHVlXG5cdFx0Zm9yIChjb25zdCB0a2V5IGluIGFjdGlvbi5jYXNlcykge1xuXHRcdFx0aWYgKGFjdGlvbi5jYXNlcy5oYXNPd25Qcm9wZXJ0eSh0a2V5KSkge1xuXHRcdFx0XHRjb25zdCB2YWwgPSBjb21waWxlQWN0aW9uKGxleGVyLCBydWxlTmFtZSwgYWN0aW9uLmNhc2VzW3RrZXldKTtcblxuXHRcdFx0XHQvLyB3aGF0IGtpbmQgb2YgY2FzZVxuXHRcdFx0XHRpZiAodGtleSA9PT0gJ0BkZWZhdWx0JyB8fCB0a2V5ID09PSAnQCcgfHwgdGtleSA9PT0gJycpIHtcblx0XHRcdFx0XHRjYXNlcy5wdXNoKHsgdGVzdDogdW5kZWZpbmVkLCB2YWx1ZTogdmFsLCBuYW1lOiB0a2V5IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2UgaWYgKHRrZXkgPT09ICdAZW9zJykge1xuXHRcdFx0XHRcdGNhc2VzLnB1c2goeyB0ZXN0OiBmdW5jdGlvbiAoaWQsIG1hdGNoZXMsIHN0YXRlLCBlb3MpIHsgcmV0dXJuIGVvczsgfSwgdmFsdWU6IHZhbCwgbmFtZTogdGtleSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjYXNlcy5wdXNoKGNyZWF0ZUd1YXJkKGxleGVyLCBydWxlTmFtZSwgdGtleSwgdmFsKSk7ICAvLyBjYWxsIHNlcGFyYXRlIGZ1bmN0aW9uIHRvIGF2b2lkIGxvY2FsIHZhcmlhYmxlIGNhcHR1cmVcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghaGFzRW1iZWRkZWRFbmRJbkNhc2VzKSB7XG5cdFx0XHRcdFx0aGFzRW1iZWRkZWRFbmRJbkNhc2VzID0gIWlzU3RyaW5nKHZhbCkgJiYgKHZhbC5oYXNFbWJlZGRlZEVuZEluQ2FzZXMgfHwgWydAcG9wJywgJ0Bwb3BhbGwnXS5pbmNsdWRlcyh2YWwubmV4dEVtYmVkZGVkIHx8ICcnKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBjcmVhdGUgYSBtYXRjaGluZyBmdW5jdGlvblxuXHRcdGNvbnN0IGRlZiA9IGxleGVyLmRlZmF1bHRUb2tlbjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aGFzRW1iZWRkZWRFbmRJbkNhc2VzLFxuXHRcdFx0dGVzdDogZnVuY3Rpb24gKGlkLCBtYXRjaGVzLCBzdGF0ZSwgZW9zKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgX2Nhc2Ugb2YgY2FzZXMpIHtcblx0XHRcdFx0XHRjb25zdCBkaWRtYXRjaCA9ICghX2Nhc2UudGVzdCB8fCBfY2FzZS50ZXN0KGlkLCBtYXRjaGVzLCBzdGF0ZSwgZW9zKSk7XG5cdFx0XHRcdFx0aWYgKGRpZG1hdGNoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gX2Nhc2UudmFsdWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBkZWY7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXHRlbHNlIHtcblx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAnYW4gYWN0aW9uIG11c3QgYmUgYSBzdHJpbmcsIGFuIG9iamVjdCB3aXRoIGEgXFwndG9rZW5cXCcgb3IgXFwnY2FzZXNcXCcgYXR0cmlidXRlLCBvciBhbiBhcnJheSBvZiBhY3Rpb25zOyBpbiBydWxlOiAnICsgcnVsZU5hbWUpO1xuXHR9XG59XG5cbnR5cGUgRHluYW1pY1JlZ0V4cCA9IChzdGF0ZTogc3RyaW5nKSA9PiBSZWdFeHA7XG5cbi8qKlxuICogSGVscGVyIGNsYXNzIGZvciBjcmVhdGluZyBtYXRjaGluZyBydWxlc1xuICovXG5jbGFzcyBSdWxlIGltcGxlbWVudHMgbW9uYXJjaENvbW1vbi5JUnVsZSB7XG5cdHByaXZhdGUgcmVnZXg6IFJlZ0V4cCB8IER5bmFtaWNSZWdFeHAgPSBuZXcgUmVnRXhwKCcnKTtcblx0cHVibGljIGFjdGlvbjogbW9uYXJjaENvbW1vbi5GdXp6eUFjdGlvbiA9IHsgdG9rZW46ICcnIH07XG5cdHB1YmxpYyBtYXRjaE9ubHlBdExpbmVTdGFydDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwdWJsaWMgbmFtZTogc3RyaW5nID0gJyc7XG5cblx0Y29uc3RydWN0b3IobmFtZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0fVxuXG5cdHB1YmxpYyBzZXRSZWdleChsZXhlcjogbW9uYXJjaENvbW1vbi5JTGV4ZXJNaW4sIHJlOiBzdHJpbmcgfCBSZWdFeHApOiB2b2lkIHtcblx0XHRsZXQgc3JlZ2V4OiBzdHJpbmc7XG5cdFx0aWYgKHR5cGVvZiAocmUpID09PSAnc3RyaW5nJykge1xuXHRcdFx0c3JlZ2V4ID0gcmU7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHJlIGluc3RhbmNlb2YgUmVnRXhwKSB7XG5cdFx0XHRzcmVnZXggPSByZS5zb3VyY2U7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ3J1bGVzIG11c3Qgc3RhcnQgd2l0aCBhIG1hdGNoIHN0cmluZyBvciByZWd1bGFyIGV4cHJlc3Npb246ICcgKyB0aGlzLm5hbWUpO1xuXHRcdH1cblxuXHRcdHRoaXMubWF0Y2hPbmx5QXRMaW5lU3RhcnQgPSAoc3JlZ2V4Lmxlbmd0aCA+IDAgJiYgc3JlZ2V4WzBdID09PSAnXicpO1xuXHRcdHRoaXMubmFtZSA9IHRoaXMubmFtZSArICc6ICcgKyBzcmVnZXg7XG5cdFx0dGhpcy5yZWdleCA9IGNvbXBpbGVSZWdFeHAobGV4ZXIsICdeKD86JyArICh0aGlzLm1hdGNoT25seUF0TGluZVN0YXJ0ID8gc3JlZ2V4LnN1YnN0cigxKSA6IHNyZWdleCkgKyAnKScsIHRydWUpO1xuXHR9XG5cblx0cHVibGljIHNldEFjdGlvbihsZXhlcjogbW9uYXJjaENvbW1vbi5JTGV4ZXJNaW4sIGFjdDogbW9uYXJjaENvbW1vbi5JQWN0aW9uKSB7XG5cdFx0dGhpcy5hY3Rpb24gPSBjb21waWxlQWN0aW9uKGxleGVyLCB0aGlzLm5hbWUsIGFjdCk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZVJlZ2V4KHN0YXRlOiBzdHJpbmcpOiBSZWdFeHAge1xuXHRcdGlmICh0aGlzLnJlZ2V4IGluc3RhbmNlb2YgUmVnRXhwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZWdleDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVnZXgoc3RhdGUpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIENvbXBpbGVzIGEganNvbiBkZXNjcmlwdGlvbiBmdW5jdGlvbiBpbnRvIGpzb24gd2hlcmUgYWxsIHJlZ3VsYXIgZXhwcmVzc2lvbnMsXG4gKiBjYXNlIG1hdGNoZXMgZXRjLCBhcmUgY29tcGlsZWQgYW5kIGFsbCBpbmNsdWRlIHJ1bGVzIGFyZSBleHBhbmRlZC5cbiAqIFdlIGFsc28gY29tcGlsZSB0aGUgYnJhY2tldCBkZWZpbml0aW9ucywgc3VwcGx5IGRlZmF1bHRzLCBhbmQgZG8gbWFueSBzYW5pdHkgY2hlY2tzLlxuICogSWYgdGhlICdqc29uU3RyaWN0JyBwYXJhbWV0ZXIgaXMgJ2ZhbHNlJywgd2UgYWxsb3cgYXQgY2VydGFpbiBsb2NhdGlvbnNcbiAqIHJlZ3VsYXIgZXhwcmVzc2lvbiBvYmplY3RzIGFuZCBmdW5jdGlvbnMgdGhhdCBnZXQgY2FsbGVkIGR1cmluZyBsZXhpbmcuXG4gKiAoQ3VycmVudGx5IHdlIGhhdmUgbm8gc2FtcGxlcyB0aGF0IG5lZWQgdGhpcyBzbyBwZXJoYXBzIHdlIHNob3VsZCBhbHdheXMgaGF2ZVxuICoganNvblN0cmljdCB0byB0cnVlKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBpbGUobGFuZ3VhZ2VJZDogc3RyaW5nLCBqc29uOiBJTW9uYXJjaExhbmd1YWdlKTogbW9uYXJjaENvbW1vbi5JTGV4ZXIge1xuXHRpZiAoIWpzb24gfHwgdHlwZW9mIChqc29uKSAhPT0gJ29iamVjdCcpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01vbmFyY2g6IGV4cGVjdGluZyBhIGxhbmd1YWdlIGRlZmluaXRpb24gb2JqZWN0Jyk7XG5cdH1cblxuXHQvLyBDcmVhdGUgb3VyIGxleGVyXG5cdGNvbnN0IGxleGVyOiBtb25hcmNoQ29tbW9uLklMZXhlciA9IHtcblx0XHRsYW5ndWFnZUlkOiBsYW5ndWFnZUlkLFxuXHRcdGluY2x1ZGVMRjogYm9vbChqc29uLmluY2x1ZGVMRiwgZmFsc2UpLFxuXHRcdG5vVGhyb3c6IGZhbHNlLCAvLyByYWlzZSBleGNlcHRpb25zIGR1cmluZyBjb21waWxhdGlvblxuXHRcdG1heFN0YWNrOiAxMDAsXG5cdFx0c3RhcnQ6ICh0eXBlb2YganNvbi5zdGFydCA9PT0gJ3N0cmluZycgPyBqc29uLnN0YXJ0IDogbnVsbCksXG5cdFx0aWdub3JlQ2FzZTogYm9vbChqc29uLmlnbm9yZUNhc2UsIGZhbHNlKSxcblx0XHR1bmljb2RlOiBib29sKGpzb24udW5pY29kZSwgZmFsc2UpLFxuXHRcdHRva2VuUG9zdGZpeDogc3RyaW5nKGpzb24udG9rZW5Qb3N0Zml4LCAnLicgKyBsYW5ndWFnZUlkKSxcblx0XHRkZWZhdWx0VG9rZW46IHN0cmluZyhqc29uLmRlZmF1bHRUb2tlbiwgJ3NvdXJjZScpLFxuXHRcdHVzZXNFbWJlZGRlZDogZmFsc2UsIC8vIGJlY29tZXMgdHJ1ZSBpZiB3ZSBmaW5kIGEgbmV4dEVtYmVkZGVkIGFjdGlvblxuXHRcdHN0YXRlTmFtZXM6IHt9LFxuXHRcdHRva2VuaXplcjoge30sXG5cdFx0YnJhY2tldHM6IFtdXG5cdH07XG5cblx0Ly8gRm9yIGNhbGxpbmcgY29tcGlsZUFjdGlvbiBsYXRlciBvblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0Y29uc3QgbGV4ZXJNaW46IG1vbmFyY2hDb21tb24uSUxleGVyTWluID0gPGFueT5qc29uO1xuXHRsZXhlck1pbi5sYW5ndWFnZUlkID0gbGFuZ3VhZ2VJZDtcblx0bGV4ZXJNaW4uaW5jbHVkZUxGID0gbGV4ZXIuaW5jbHVkZUxGO1xuXHRsZXhlck1pbi5pZ25vcmVDYXNlID0gbGV4ZXIuaWdub3JlQ2FzZTtcblx0bGV4ZXJNaW4udW5pY29kZSA9IGxleGVyLnVuaWNvZGU7XG5cdGxleGVyTWluLm5vVGhyb3cgPSBsZXhlci5ub1Rocm93O1xuXHRsZXhlck1pbi51c2VzRW1iZWRkZWQgPSBsZXhlci51c2VzRW1iZWRkZWQ7XG5cdGxleGVyTWluLnN0YXRlTmFtZXMgPSBqc29uLnRva2VuaXplcjtcblx0bGV4ZXJNaW4uZGVmYXVsdFRva2VuID0gbGV4ZXIuZGVmYXVsdFRva2VuO1xuXG5cblx0Ly8gQ29tcGlsZSBhbiBhcnJheSBvZiBydWxlcyBpbnRvIG5ld3J1bGVzIHdoZXJlIFJlZ0V4cCBvYmplY3RzIGFyZSBjcmVhdGVkLlxuXHRmdW5jdGlvbiBhZGRSdWxlcyhzdGF0ZTogc3RyaW5nLCBuZXdydWxlczogbW9uYXJjaENvbW1vbi5JUnVsZVtdLCBydWxlczogYW55W10pIHtcblx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgcnVsZXMpIHtcblxuXHRcdFx0bGV0IGluY2x1ZGUgPSBydWxlLmluY2x1ZGU7XG5cdFx0XHRpZiAoaW5jbHVkZSkge1xuXHRcdFx0XHRpZiAodHlwZW9mIChpbmNsdWRlKSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAnYW4gXFwnaW5jbHVkZVxcJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZyBhdDogJyArIHN0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaW5jbHVkZVswXSA9PT0gJ0AnKSB7XG5cdFx0XHRcdFx0aW5jbHVkZSA9IGluY2x1ZGUuc3Vic3RyKDEpOyAvLyBwZWVsIG9mZiBzdGFydGluZyBAXG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFqc29uLnRva2VuaXplcltpbmNsdWRlXSkge1xuXHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICdpbmNsdWRlIHRhcmdldCBcXCcnICsgaW5jbHVkZSArICdcXCcgaXMgbm90IGRlZmluZWQgYXQ6ICcgKyBzdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWRkUnVsZXMoc3RhdGUgKyAnLicgKyBpbmNsdWRlLCBuZXdydWxlcywganNvbi50b2tlbml6ZXJbaW5jbHVkZV0pO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG5ld3J1bGUgPSBuZXcgUnVsZShzdGF0ZSk7XG5cblx0XHRcdFx0Ly8gU2V0IHVwIG5ldyBydWxlIGF0dHJpYnV0ZXNcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocnVsZSkgJiYgcnVsZS5sZW5ndGggPj0gMSAmJiBydWxlLmxlbmd0aCA8PSAzKSB7XG5cdFx0XHRcdFx0bmV3cnVsZS5zZXRSZWdleChsZXhlck1pbiwgcnVsZVswXSk7XG5cdFx0XHRcdFx0aWYgKHJ1bGUubGVuZ3RoID49IDMpIHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgKHJ1bGVbMV0pID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRuZXdydWxlLnNldEFjdGlvbihsZXhlck1pbiwgeyB0b2tlbjogcnVsZVsxXSwgbmV4dDogcnVsZVsyXSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKHR5cGVvZiAocnVsZVsxXSkgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJ1bGUxID0gcnVsZVsxXTtcblx0XHRcdFx0XHRcdFx0cnVsZTEubmV4dCA9IHJ1bGVbMl07XG5cdFx0XHRcdFx0XHRcdG5ld3J1bGUuc2V0QWN0aW9uKGxleGVyTWluLCBydWxlMSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ2EgbmV4dCBzdGF0ZSBhcyB0aGUgbGFzdCBlbGVtZW50IG9mIGEgcnVsZSBjYW4gb25seSBiZSBnaXZlbiBpZiB0aGUgYWN0aW9uIGlzIGVpdGhlciBhbiBvYmplY3Qgb3IgYSBzdHJpbmcsIGF0OiAnICsgc3RhdGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdG5ld3J1bGUuc2V0QWN0aW9uKGxleGVyTWluLCBydWxlWzFdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0aWYgKCFydWxlLnJlZ2V4KSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAnYSBydWxlIG11c3QgZWl0aGVyIGJlIGFuIGFycmF5LCBvciBhbiBvYmplY3Qgd2l0aCBhIFxcJ3JlZ2V4XFwnIG9yIFxcJ2luY2x1ZGVcXCcgZmllbGQgYXQ6ICcgKyBzdGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChydWxlLm5hbWUpIHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcnVsZS5uYW1lID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRuZXdydWxlLm5hbWUgPSBydWxlLm5hbWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChydWxlLm1hdGNoT25seUF0U3RhcnQpIHtcblx0XHRcdFx0XHRcdG5ld3J1bGUubWF0Y2hPbmx5QXRMaW5lU3RhcnQgPSBib29sKHJ1bGUubWF0Y2hPbmx5QXRMaW5lU3RhcnQsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bmV3cnVsZS5zZXRSZWdleChsZXhlck1pbiwgcnVsZS5yZWdleCk7XG5cdFx0XHRcdFx0bmV3cnVsZS5zZXRBY3Rpb24obGV4ZXJNaW4sIHJ1bGUuYWN0aW9uKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG5ld3J1bGVzLnB1c2gobmV3cnVsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gY29tcGlsZSB0aGUgdG9rZW5pemVyIHJ1bGVzXG5cdGlmICghanNvbi50b2tlbml6ZXIgfHwgdHlwZW9mIChqc29uLnRva2VuaXplcikgIT09ICdvYmplY3QnKSB7XG5cdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcihsZXhlciwgJ2EgbGFuZ3VhZ2UgZGVmaW5pdGlvbiBtdXN0IGRlZmluZSB0aGUgXFwndG9rZW5pemVyXFwnIGF0dHJpYnV0ZSBhcyBhbiBvYmplY3QnKTtcblx0fVxuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRsZXhlci50b2tlbml6ZXIgPSA8YW55PltdO1xuXHRmb3IgKGNvbnN0IGtleSBpbiBqc29uLnRva2VuaXplcikge1xuXHRcdGlmIChqc29uLnRva2VuaXplci5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0XHRpZiAoIWxleGVyLnN0YXJ0KSB7XG5cdFx0XHRcdGxleGVyLnN0YXJ0ID0ga2V5O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBydWxlcyA9IGpzb24udG9rZW5pemVyW2tleV07XG5cdFx0XHRsZXhlci50b2tlbml6ZXJba2V5XSA9IG5ldyBBcnJheSgpO1xuXHRcdFx0YWRkUnVsZXMoJ3Rva2VuaXplci4nICsga2V5LCBsZXhlci50b2tlbml6ZXJba2V5XSwgcnVsZXMpO1xuXHRcdH1cblx0fVxuXHRsZXhlci51c2VzRW1iZWRkZWQgPSBsZXhlck1pbi51c2VzRW1iZWRkZWQ7ICAvLyBjYW4gYmUgc2V0IGR1cmluZyBjb21waWxlQWN0aW9uXG5cblx0Ly8gU2V0IHNpbXBsZSBicmFja2V0c1xuXHRpZiAoanNvbi5icmFja2V0cykge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGlmICghKEFycmF5LmlzQXJyYXkoPGFueT5qc29uLmJyYWNrZXRzKSkpIHtcblx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICd0aGUgXFwnYnJhY2tldHNcXCcgYXR0cmlidXRlIG11c3QgYmUgZGVmaW5lZCBhcyBhbiBhcnJheScpO1xuXHRcdH1cblx0fVxuXHRlbHNlIHtcblx0XHRqc29uLmJyYWNrZXRzID0gW1xuXHRcdFx0eyBvcGVuOiAneycsIGNsb3NlOiAnfScsIHRva2VuOiAnZGVsaW1pdGVyLmN1cmx5JyB9LFxuXHRcdFx0eyBvcGVuOiAnWycsIGNsb3NlOiAnXScsIHRva2VuOiAnZGVsaW1pdGVyLnNxdWFyZScgfSxcblx0XHRcdHsgb3BlbjogJygnLCBjbG9zZTogJyknLCB0b2tlbjogJ2RlbGltaXRlci5wYXJlbnRoZXNpcycgfSxcblx0XHRcdHsgb3BlbjogJzwnLCBjbG9zZTogJz4nLCB0b2tlbjogJ2RlbGltaXRlci5hbmdsZScgfV07XG5cdH1cblx0Y29uc3QgYnJhY2tldHM6IElNb25hcmNoTGFuZ3VhZ2VCcmFja2V0W10gPSBbXTtcblx0Zm9yIChjb25zdCBlbCBvZiBqc29uLmJyYWNrZXRzKSB7XG5cdFx0bGV0IGRlc2M6IGFueSA9IGVsO1xuXHRcdGlmIChkZXNjICYmIEFycmF5LmlzQXJyYXkoZGVzYykgJiYgZGVzYy5sZW5ndGggPT09IDMpIHtcblx0XHRcdGRlc2MgPSB7IHRva2VuOiBkZXNjWzJdLCBvcGVuOiBkZXNjWzBdLCBjbG9zZTogZGVzY1sxXSB9O1xuXHRcdH1cblx0XHRpZiAoZGVzYy5vcGVuID09PSBkZXNjLmNsb3NlKSB7XG5cdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKGxleGVyLCAnb3BlbiBhbmQgY2xvc2UgYnJhY2tldHMgaW4gYSBcXCdicmFja2V0c1xcJyBhdHRyaWJ1dGUgbXVzdCBiZSBkaWZmZXJlbnQ6ICcgKyBkZXNjLm9wZW4gK1xuXHRcdFx0XHQnXFxuIGhpbnQ6IHVzZSB0aGUgXFwnYnJhY2tldFxcJyBhdHRyaWJ1dGUgaWYgbWF0Y2hpbmcgb24gZXF1YWwgYnJhY2tldHMgaXMgcmVxdWlyZWQuJyk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgZGVzYy5vcGVuID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgZGVzYy50b2tlbiA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGRlc2MuY2xvc2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRicmFja2V0cy5wdXNoKHtcblx0XHRcdFx0dG9rZW46IGRlc2MudG9rZW4gKyBsZXhlci50b2tlblBvc3RmaXgsXG5cdFx0XHRcdG9wZW46IG1vbmFyY2hDb21tb24uZml4Q2FzZShsZXhlciwgZGVzYy5vcGVuKSxcblx0XHRcdFx0Y2xvc2U6IG1vbmFyY2hDb21tb24uZml4Q2FzZShsZXhlciwgZGVzYy5jbG9zZSlcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IobGV4ZXIsICdldmVyeSBlbGVtZW50IGluIHRoZSBcXCdicmFja2V0c1xcJyBhcnJheSBtdXN0IGJlIGEgXFwne29wZW4sY2xvc2UsdG9rZW59XFwnIG9iamVjdCBvciBhcnJheScpO1xuXHRcdH1cblx0fVxuXHRsZXhlci5icmFja2V0cyA9IGJyYWNrZXRzO1xuXG5cdC8vIERpc2FibGUgdGhyb3cgc28gdGhlIHN5bnRheCBoaWdobGlnaHRlciBnb2VzLCBubyBtYXR0ZXIgd2hhdFxuXHRsZXhlci5ub1Rocm93ID0gdHJ1ZTtcblx0cmV0dXJuIGxleGVyO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFB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TTtBQUNqQyxlQUFTLGVBQWUsS0FBSyxNQUFNLFVBQVUsR0FBRyxHQUFHLEtBQUs7QUFBQSxJQUN6RDtBQUFBLEVBQ0Q7QUFDQSxRQUFNLGVBQWUsU0FBUztBQUc5QixNQUFJLEtBQUssVUFBVTtBQUVsQixRQUFJLENBQUUsTUFBTSxRQUFhLEtBQUssUUFBUSxHQUFJO0FBQ3pDLFlBQU0sY0FBYyxZQUFZLE9BQU8sc0RBQXdEO0FBQUEsSUFDaEc7QUFBQSxFQUNELE9BQ0s7QUFDSixTQUFLLFdBQVc7QUFBQSxNQUNmLEVBQUUsTUFBTSxLQUFLLE9BQU8sS0FBSyxPQUFPLGtCQUFrQjtBQUFBLE1BQ2xELEVBQUUsTUFBTSxLQUFLLE9BQU8sS0FBSyxPQUFPLG1CQUFtQjtBQUFBLE1BQ25ELEVBQUUsTUFBTSxLQUFLLE9BQU8sS0FBSyxPQUFPLHdCQUF3QjtBQUFBLE1BQ3hELEVBQUUsTUFBTSxLQUFLLE9BQU8sS0FBSyxPQUFPLGtCQUFrQjtBQUFBLElBQUM7QUFBQSxFQUNyRDtBQUNBLFFBQU0sV0FBc0MsQ0FBQztBQUM3QyxhQUFXLE1BQU0sS0FBSyxVQUFVO0FBQy9CLFFBQUksT0FBWTtBQUNoQixRQUFJLFFBQVEsTUFBTSxRQUFRLElBQUksS0FBSyxLQUFLLFdBQVcsR0FBRztBQUNyRCxhQUFPLEVBQUUsT0FBTyxLQUFLLENBQUMsR0FBRyxNQUFNLEtBQUssQ0FBQyxHQUFHLE9BQU8sS0FBSyxDQUFDLEVBQUU7QUFBQSxJQUN4RDtBQUNBLFFBQUksS0FBSyxTQUFTLEtBQUssT0FBTztBQUM3QixZQUFNLGNBQWMsWUFBWSxPQUFPLDBFQUE0RSxLQUFLLE9BQ3ZILGlGQUFtRjtBQUFBLElBQ3JGO0FBQ0EsUUFBSSxPQUFPLEtBQUssU0FBUyxZQUFZLE9BQU8sS0FBSyxVQUFVLFlBQVksT0FBTyxLQUFLLFVBQVUsVUFBVTtBQUN0RyxlQUFTLEtBQUs7QUFBQSxRQUNiLE9BQU8sS0FBSyxRQUFRLE1BQU07QUFBQSxRQUMxQixNQUFNLGNBQWMsUUFBUSxPQUFPLEtBQUssSUFBSTtBQUFBLFFBQzVDLE9BQU8sY0FBYyxRQUFRLE9BQU8sS0FBSyxLQUFLO0FBQUEsTUFDL0MsQ0FBQztBQUFBLElBQ0YsT0FDSztBQUNKLFlBQU0sY0FBYyxZQUFZLE9BQU8sc0ZBQTBGO0FBQUEsSUFDbEk7QUFBQSxFQUNEO0FBQ0EsUUFBTSxXQUFXO0FBR2pCLFFBQU0sVUFBVTtBQUNoQixTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIm1hdGNoZXMiXQp9Cg==
