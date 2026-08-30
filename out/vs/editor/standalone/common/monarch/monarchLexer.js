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
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as languages from "../../../common/languages.js";
import { NullState, nullTokenizeEncoded, nullTokenize } from "../../../common/languages/nullTokenize.js";
import * as monarchCommon from "./monarchCommon.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { LanguageId, MetadataConsts } from "../../../common/encodedTokenAttributes.js";
const CACHE_STACK_DEPTH = 5;
const _MonarchStackElementFactory = class _MonarchStackElementFactory {
  static create(parent, state) {
    return this._INSTANCE.create(parent, state);
  }
  constructor(maxCacheDepth) {
    this._maxCacheDepth = maxCacheDepth;
    this._entries = /* @__PURE__ */ Object.create(null);
  }
  create(parent, state) {
    if (parent !== null && parent.depth >= this._maxCacheDepth) {
      return new MonarchStackElement(parent, state);
    }
    let stackElementId = MonarchStackElement.getStackElementId(parent);
    if (stackElementId.length > 0) {
      stackElementId += "|";
    }
    stackElementId += state;
    let result = this._entries[stackElementId];
    if (result) {
      return result;
    }
    result = new MonarchStackElement(parent, state);
    this._entries[stackElementId] = result;
    return result;
  }
};
_MonarchStackElementFactory._INSTANCE = new _MonarchStackElementFactory(CACHE_STACK_DEPTH);
let MonarchStackElementFactory = _MonarchStackElementFactory;
class MonarchStackElement {
  constructor(parent, state) {
    this.parent = parent;
    this.state = state;
    this.depth = (this.parent ? this.parent.depth : 0) + 1;
  }
  static getStackElementId(element) {
    let result = "";
    while (element !== null) {
      if (result.length > 0) {
        result += "|";
      }
      result += element.state;
      element = element.parent;
    }
    return result;
  }
  static _equals(a, b) {
    while (a !== null && b !== null) {
      if (a === b) {
        return true;
      }
      if (a.state !== b.state) {
        return false;
      }
      a = a.parent;
      b = b.parent;
    }
    if (a === null && b === null) {
      return true;
    }
    return false;
  }
  equals(other) {
    return MonarchStackElement._equals(this, other);
  }
  push(state) {
    return MonarchStackElementFactory.create(this, state);
  }
  pop() {
    return this.parent;
  }
  popall() {
    let result = this;
    while (result.parent) {
      result = result.parent;
    }
    return result;
  }
  switchTo(state) {
    return MonarchStackElementFactory.create(this.parent, state);
  }
}
class EmbeddedLanguageData {
  constructor(languageId, state) {
    this.languageId = languageId;
    this.state = state;
  }
  equals(other) {
    return this.languageId === other.languageId && this.state.equals(other.state);
  }
  clone() {
    const stateClone = this.state.clone();
    if (stateClone === this.state) {
      return this;
    }
    return new EmbeddedLanguageData(this.languageId, this.state);
  }
}
const _MonarchLineStateFactory = class _MonarchLineStateFactory {
  static create(stack, embeddedLanguageData) {
    return this._INSTANCE.create(stack, embeddedLanguageData);
  }
  constructor(maxCacheDepth) {
    this._maxCacheDepth = maxCacheDepth;
    this._entries = /* @__PURE__ */ Object.create(null);
  }
  create(stack, embeddedLanguageData) {
    if (embeddedLanguageData !== null) {
      return new MonarchLineState(stack, embeddedLanguageData);
    }
    if (stack !== null && stack.depth >= this._maxCacheDepth) {
      return new MonarchLineState(stack, embeddedLanguageData);
    }
    const stackElementId = MonarchStackElement.getStackElementId(stack);
    let result = this._entries[stackElementId];
    if (result) {
      return result;
    }
    result = new MonarchLineState(stack, null);
    this._entries[stackElementId] = result;
    return result;
  }
};
_MonarchLineStateFactory._INSTANCE = new _MonarchLineStateFactory(CACHE_STACK_DEPTH);
let MonarchLineStateFactory = _MonarchLineStateFactory;
class MonarchLineState {
  constructor(stack, embeddedLanguageData) {
    this.stack = stack;
    this.embeddedLanguageData = embeddedLanguageData;
  }
  clone() {
    const embeddedlanguageDataClone = this.embeddedLanguageData ? this.embeddedLanguageData.clone() : null;
    if (embeddedlanguageDataClone === this.embeddedLanguageData) {
      return this;
    }
    return MonarchLineStateFactory.create(this.stack, this.embeddedLanguageData);
  }
  equals(other) {
    if (!(other instanceof MonarchLineState)) {
      return false;
    }
    if (!this.stack.equals(other.stack)) {
      return false;
    }
    if (this.embeddedLanguageData === null && other.embeddedLanguageData === null) {
      return true;
    }
    if (this.embeddedLanguageData === null || other.embeddedLanguageData === null) {
      return false;
    }
    return this.embeddedLanguageData.equals(other.embeddedLanguageData);
  }
}
class MonarchClassicTokensCollector {
  constructor() {
    this._tokens = [];
    this._languageId = null;
    this._lastTokenType = null;
    this._lastTokenLanguage = null;
  }
  enterLanguage(languageId) {
    this._languageId = languageId;
  }
  emit(startOffset, type) {
    if (this._lastTokenType === type && this._lastTokenLanguage === this._languageId) {
      return;
    }
    this._lastTokenType = type;
    this._lastTokenLanguage = this._languageId;
    this._tokens.push(new languages.Token(startOffset, type, this._languageId));
  }
  nestedLanguageTokenize(embeddedLanguageLine, hasEOL, embeddedLanguageData, offsetDelta) {
    const nestedLanguageId = embeddedLanguageData.languageId;
    const embeddedModeState = embeddedLanguageData.state;
    const nestedLanguageTokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
    if (!nestedLanguageTokenizationSupport) {
      this.enterLanguage(nestedLanguageId);
      this.emit(offsetDelta, "");
      return embeddedModeState;
    }
    const nestedResult = nestedLanguageTokenizationSupport.tokenize(embeddedLanguageLine, hasEOL, embeddedModeState);
    if (offsetDelta !== 0) {
      for (const token of nestedResult.tokens) {
        this._tokens.push(new languages.Token(token.offset + offsetDelta, token.type, token.language));
      }
    } else {
      this._tokens = this._tokens.concat(nestedResult.tokens);
    }
    this._lastTokenType = null;
    this._lastTokenLanguage = null;
    this._languageId = null;
    return nestedResult.endState;
  }
  finalize(endState) {
    return new languages.TokenizationResult(this._tokens, endState);
  }
}
class MonarchModernTokensCollector {
  constructor(languageService, theme) {
    this._languageService = languageService;
    this._theme = theme;
    this._prependTokens = null;
    this._tokens = [];
    this._currentLanguageId = LanguageId.Null;
    this._lastTokenMetadata = 0;
  }
  enterLanguage(languageId) {
    this._currentLanguageId = this._languageService.languageIdCodec.encodeLanguageId(languageId);
  }
  emit(startOffset, type) {
    const metadata = this._theme.match(this._currentLanguageId, type) | MetadataConsts.BALANCED_BRACKETS_MASK;
    if (this._lastTokenMetadata === metadata) {
      return;
    }
    this._lastTokenMetadata = metadata;
    this._tokens.push(startOffset);
    this._tokens.push(metadata);
  }
  static _merge(a, b, c) {
    const aLen = a !== null ? a.length : 0;
    const bLen = b.length;
    const cLen = c !== null ? c.length : 0;
    if (aLen === 0 && bLen === 0 && cLen === 0) {
      return new Uint32Array(0);
    }
    if (aLen === 0 && bLen === 0) {
      return c;
    }
    if (bLen === 0 && cLen === 0) {
      return a;
    }
    const result = new Uint32Array(aLen + bLen + cLen);
    if (a !== null) {
      result.set(a);
    }
    for (let i = 0; i < bLen; i++) {
      result[aLen + i] = b[i];
    }
    if (c !== null) {
      result.set(c, aLen + bLen);
    }
    return result;
  }
  nestedLanguageTokenize(embeddedLanguageLine, hasEOL, embeddedLanguageData, offsetDelta) {
    const nestedLanguageId = embeddedLanguageData.languageId;
    const embeddedModeState = embeddedLanguageData.state;
    const nestedLanguageTokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
    if (!nestedLanguageTokenizationSupport) {
      this.enterLanguage(nestedLanguageId);
      this.emit(offsetDelta, "");
      return embeddedModeState;
    }
    const nestedResult = nestedLanguageTokenizationSupport.tokenizeEncoded(embeddedLanguageLine, hasEOL, embeddedModeState);
    if (offsetDelta !== 0) {
      for (let i = 0, len = nestedResult.tokens.length; i < len; i += 2) {
        nestedResult.tokens[i] += offsetDelta;
      }
    }
    this._prependTokens = MonarchModernTokensCollector._merge(this._prependTokens, this._tokens, nestedResult.tokens);
    this._tokens = [];
    this._currentLanguageId = 0;
    this._lastTokenMetadata = 0;
    return nestedResult.endState;
  }
  finalize(endState) {
    return new languages.EncodedTokenizationResult(
      MonarchModernTokensCollector._merge(this._prependTokens, this._tokens, null),
      [],
      endState
    );
  }
}
let MonarchTokenizer = class extends Disposable {
  constructor(languageService, standaloneThemeService, languageId, lexer, _configurationService) {
    super();
    this._configurationService = _configurationService;
    this._languageService = languageService;
    this._standaloneThemeService = standaloneThemeService;
    this._languageId = languageId;
    this._lexer = lexer;
    this._embeddedLanguages = /* @__PURE__ */ Object.create(null);
    this.embeddedLoaded = Promise.resolve(void 0);
    let emitting = false;
    this._register(languages.TokenizationRegistry.onDidChange((e) => {
      if (emitting) {
        return;
      }
      let isOneOfMyEmbeddedModes = false;
      for (let i = 0, len = e.changedLanguages.length; i < len; i++) {
        const language = e.changedLanguages[i];
        if (this._embeddedLanguages[language]) {
          isOneOfMyEmbeddedModes = true;
          break;
        }
      }
      if (isOneOfMyEmbeddedModes) {
        emitting = true;
        languages.TokenizationRegistry.handleChange([this._languageId]);
        emitting = false;
      }
    }));
    this._maxTokenizationLineLength = this._configurationService.getValue("editor.maxTokenizationLineLength", {
      overrideIdentifier: this._languageId
    });
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.maxTokenizationLineLength")) {
        this._maxTokenizationLineLength = this._configurationService.getValue("editor.maxTokenizationLineLength", {
          overrideIdentifier: this._languageId
        });
      }
    }));
  }
  getLoadStatus() {
    const promises = [];
    for (const nestedLanguageId in this._embeddedLanguages) {
      const tokenizationSupport = languages.TokenizationRegistry.get(nestedLanguageId);
      if (tokenizationSupport) {
        if (tokenizationSupport instanceof MonarchTokenizer) {
          const nestedModeStatus = tokenizationSupport.getLoadStatus();
          if (nestedModeStatus.loaded === false) {
            promises.push(nestedModeStatus.promise);
          }
        }
        continue;
      }
      if (!languages.TokenizationRegistry.isResolved(nestedLanguageId)) {
        promises.push(languages.TokenizationRegistry.getOrCreate(nestedLanguageId));
      }
    }
    if (promises.length === 0) {
      return {
        loaded: true
      };
    }
    return {
      loaded: false,
      promise: Promise.all(promises).then((_) => void 0)
    };
  }
  getInitialState() {
    const rootState = MonarchStackElementFactory.create(null, this._lexer.start);
    return MonarchLineStateFactory.create(rootState, null);
  }
  tokenize(line, hasEOL, lineState) {
    if (line.length >= this._maxTokenizationLineLength) {
      return nullTokenize(this._languageId, lineState);
    }
    const tokensCollector = new MonarchClassicTokensCollector();
    const endLineState = this._tokenize(line, hasEOL, lineState, tokensCollector);
    return tokensCollector.finalize(endLineState);
  }
  tokenizeEncoded(line, hasEOL, lineState) {
    if (line.length >= this._maxTokenizationLineLength) {
      return nullTokenizeEncoded(this._languageService.languageIdCodec.encodeLanguageId(this._languageId), lineState);
    }
    const tokensCollector = new MonarchModernTokensCollector(this._languageService, this._standaloneThemeService.getColorTheme().tokenTheme);
    const endLineState = this._tokenize(line, hasEOL, lineState, tokensCollector);
    return tokensCollector.finalize(endLineState);
  }
  _tokenize(line, hasEOL, lineState, collector) {
    if (lineState.embeddedLanguageData) {
      return this._nestedTokenize(line, hasEOL, lineState, 0, collector);
    } else {
      return this._myTokenize(line, hasEOL, lineState, 0, collector);
    }
  }
  _findLeavingNestedLanguageOffset(line, state) {
    let rules = this._lexer.tokenizer[state.stack.state];
    if (!rules) {
      rules = monarchCommon.findRules(this._lexer, state.stack.state);
      if (!rules) {
        throw monarchCommon.createError(this._lexer, "tokenizer state is not defined: " + state.stack.state);
      }
    }
    let popOffset = -1;
    let hasEmbeddedPopRule = false;
    for (const rule of rules) {
      if (!monarchCommon.isIAction(rule.action) || !(rule.action.nextEmbedded === "@pop" || rule.action.hasEmbeddedEndInCases)) {
        continue;
      }
      hasEmbeddedPopRule = true;
      let regex = rule.resolveRegex(state.stack.state);
      const regexSource = regex.source;
      if (regexSource.substr(0, 4) === "^(?:" && regexSource.substr(regexSource.length - 1, 1) === ")") {
        const flags = (regex.ignoreCase ? "i" : "") + (regex.unicode ? "u" : "");
        regex = new RegExp(regexSource.substr(4, regexSource.length - 5), flags);
      }
      const result = line.search(regex);
      if (result === -1 || result !== 0 && rule.matchOnlyAtLineStart) {
        continue;
      }
      if (popOffset === -1 || result < popOffset) {
        popOffset = result;
      }
    }
    if (!hasEmbeddedPopRule) {
      throw monarchCommon.createError(this._lexer, 'no rule containing nextEmbedded: "@pop" in tokenizer embedded state: ' + state.stack.state);
    }
    return popOffset;
  }
  _nestedTokenize(line, hasEOL, lineState, offsetDelta, tokensCollector) {
    const popOffset = this._findLeavingNestedLanguageOffset(line, lineState);
    if (popOffset === -1) {
      const nestedEndState = tokensCollector.nestedLanguageTokenize(line, hasEOL, lineState.embeddedLanguageData, offsetDelta);
      return MonarchLineStateFactory.create(lineState.stack, new EmbeddedLanguageData(lineState.embeddedLanguageData.languageId, nestedEndState));
    }
    const nestedLanguageLine = line.substring(0, popOffset);
    if (nestedLanguageLine.length > 0) {
      tokensCollector.nestedLanguageTokenize(nestedLanguageLine, false, lineState.embeddedLanguageData, offsetDelta);
    }
    const restOfTheLine = line.substring(popOffset);
    return this._myTokenize(restOfTheLine, hasEOL, lineState, offsetDelta + popOffset, tokensCollector);
  }
  _safeRuleName(rule) {
    if (rule) {
      return rule.name;
    }
    return "(unknown)";
  }
  _myTokenize(lineWithoutLF, hasEOL, lineState, offsetDelta, tokensCollector) {
    tokensCollector.enterLanguage(this._languageId);
    const lineWithoutLFLength = lineWithoutLF.length;
    const line = hasEOL && this._lexer.includeLF ? lineWithoutLF + "\n" : lineWithoutLF;
    const lineLength = line.length;
    let embeddedLanguageData = lineState.embeddedLanguageData;
    let stack = lineState.stack;
    let pos = 0;
    let groupMatching = null;
    let forceEvaluation = true;
    while (forceEvaluation || pos < lineLength) {
      const pos0 = pos;
      const stackLen0 = stack.depth;
      const groupLen0 = groupMatching ? groupMatching.groups.length : 0;
      const state = stack.state;
      let matches = null;
      let matched = null;
      let action = null;
      let rule = null;
      let enteringEmbeddedLanguage = null;
      if (groupMatching) {
        matches = groupMatching.matches;
        const groupEntry = groupMatching.groups.shift();
        matched = groupEntry.matched;
        action = groupEntry.action;
        rule = groupMatching.rule;
        if (groupMatching.groups.length === 0) {
          groupMatching = null;
        }
      } else {
        if (!forceEvaluation && pos >= lineLength) {
          break;
        }
        forceEvaluation = false;
        let rules = this._lexer.tokenizer[state];
        if (!rules) {
          rules = monarchCommon.findRules(this._lexer, state);
          if (!rules) {
            throw monarchCommon.createError(this._lexer, "tokenizer state is not defined: " + state);
          }
        }
        const restOfLine = line.substr(pos);
        for (const rule2 of rules) {
          if (pos === 0 || !rule2.matchOnlyAtLineStart) {
            matches = restOfLine.match(rule2.resolveRegex(state));
            if (matches) {
              matched = matches[0];
              action = rule2.action;
              break;
            }
          }
        }
      }
      if (!matches) {
        matches = [""];
        matched = "";
      }
      if (!action) {
        if (pos < lineLength) {
          matches = [line.charAt(pos)];
          matched = matches[0];
        }
        action = this._lexer.defaultToken;
      }
      if (matched === null) {
        break;
      }
      pos += matched.length;
      while (monarchCommon.isFuzzyAction(action) && monarchCommon.isIAction(action) && action.test) {
        action = action.test(matched, matches, state, pos === lineLength);
      }
      let result = null;
      if (typeof action === "string" || Array.isArray(action)) {
        result = action;
      } else if (action.group) {
        result = action.group;
      } else if (action.token !== null && action.token !== void 0) {
        if (action.tokenSubst) {
          result = monarchCommon.substituteMatches(this._lexer, action.token, matched, matches, state);
        } else {
          result = action.token;
        }
        if (action.nextEmbedded) {
          if (action.nextEmbedded === "@pop") {
            if (!embeddedLanguageData) {
              throw monarchCommon.createError(this._lexer, "cannot pop embedded language if not inside one");
            }
            embeddedLanguageData = null;
          } else if (embeddedLanguageData) {
            throw monarchCommon.createError(this._lexer, "cannot enter embedded language from within an embedded language");
          } else {
            enteringEmbeddedLanguage = monarchCommon.substituteMatches(this._lexer, action.nextEmbedded, matched, matches, state);
          }
        }
        if (action.goBack) {
          pos = Math.max(0, pos - action.goBack);
        }
        if (action.switchTo && typeof action.switchTo === "string") {
          let nextState = monarchCommon.substituteMatches(this._lexer, action.switchTo, matched, matches, state);
          if (nextState[0] === "@") {
            nextState = nextState.substr(1);
          }
          if (!monarchCommon.findRules(this._lexer, nextState)) {
            throw monarchCommon.createError(this._lexer, "trying to switch to a state '" + nextState + "' that is undefined in rule: " + this._safeRuleName(rule));
          } else {
            stack = stack.switchTo(nextState);
          }
        } else if (action.transform && typeof action.transform === "function") {
          throw monarchCommon.createError(this._lexer, "action.transform not supported");
        } else if (action.next) {
          if (action.next === "@push") {
            if (stack.depth >= this._lexer.maxStack) {
              throw monarchCommon.createError(this._lexer, "maximum tokenizer stack size reached: [" + stack.state + "," + stack.parent.state + ",...]");
            } else {
              stack = stack.push(state);
            }
          } else if (action.next === "@pop") {
            if (stack.depth <= 1) {
              throw monarchCommon.createError(this._lexer, "trying to pop an empty stack in rule: " + this._safeRuleName(rule));
            } else {
              stack = stack.pop();
            }
          } else if (action.next === "@popall") {
            stack = stack.popall();
          } else {
            let nextState = monarchCommon.substituteMatches(this._lexer, action.next, matched, matches, state);
            if (nextState[0] === "@") {
              nextState = nextState.substr(1);
            }
            if (!monarchCommon.findRules(this._lexer, nextState)) {
              throw monarchCommon.createError(this._lexer, "trying to set a next state '" + nextState + "' that is undefined in rule: " + this._safeRuleName(rule));
            } else {
              stack = stack.push(nextState);
            }
          }
        }
        if (action.log && typeof action.log === "string") {
          monarchCommon.log(this._lexer, this._lexer.languageId + ": " + monarchCommon.substituteMatches(this._lexer, action.log, matched, matches, state));
        }
      }
      if (result === null) {
        throw monarchCommon.createError(this._lexer, "lexer rule has no well-defined action in rule: " + this._safeRuleName(rule));
      }
      const computeNewStateForEmbeddedLanguage = (enteringEmbeddedLanguage2) => {
        const languageId = this._languageService.getLanguageIdByLanguageName(enteringEmbeddedLanguage2) || this._languageService.getLanguageIdByMimeType(enteringEmbeddedLanguage2) || enteringEmbeddedLanguage2;
        const embeddedLanguageData2 = this._getNestedEmbeddedLanguageData(languageId);
        if (pos < lineLength) {
          const restOfLine = lineWithoutLF.substr(pos);
          return this._nestedTokenize(restOfLine, hasEOL, MonarchLineStateFactory.create(stack, embeddedLanguageData2), offsetDelta + pos, tokensCollector);
        } else {
          return MonarchLineStateFactory.create(stack, embeddedLanguageData2);
        }
      };
      if (Array.isArray(result)) {
        if (groupMatching && groupMatching.groups.length > 0) {
          throw monarchCommon.createError(this._lexer, "groups cannot be nested: " + this._safeRuleName(rule));
        }
        if (matches.length !== result.length + 1) {
          throw monarchCommon.createError(this._lexer, "matched number of groups does not match the number of actions in rule: " + this._safeRuleName(rule));
        }
        let totalLen = 0;
        for (let i = 1; i < matches.length; i++) {
          totalLen += matches[i].length;
        }
        if (totalLen !== matched.length) {
          throw monarchCommon.createError(this._lexer, "with groups, all characters should be matched in consecutive groups in rule: " + this._safeRuleName(rule));
        }
        groupMatching = {
          rule,
          matches,
          groups: []
        };
        for (let i = 0; i < result.length; i++) {
          groupMatching.groups[i] = {
            action: result[i],
            matched: matches[i + 1]
          };
        }
        pos -= matched.length;
        continue;
      } else {
        if (result === "@rematch") {
          pos -= matched.length;
          matched = "";
          matches = null;
          result = "";
          if (enteringEmbeddedLanguage !== null) {
            return computeNewStateForEmbeddedLanguage(enteringEmbeddedLanguage);
          }
        }
        if (matched.length === 0) {
          if (lineLength === 0 || stackLen0 !== stack.depth || state !== stack.state || (!groupMatching ? 0 : groupMatching.groups.length) !== groupLen0) {
            continue;
          } else {
            throw monarchCommon.createError(this._lexer, "no progress in tokenizer in rule: " + this._safeRuleName(rule));
          }
        }
        let tokenType = null;
        if (monarchCommon.isString(result) && result.indexOf("@brackets") === 0) {
          const rest = result.substr("@brackets".length);
          const bracket = findBracket(this._lexer, matched);
          if (!bracket) {
            throw monarchCommon.createError(this._lexer, "@brackets token returned but no bracket defined as: " + matched);
          }
          tokenType = monarchCommon.sanitize(bracket.token + rest);
        } else {
          const token = result === "" ? "" : result + this._lexer.tokenPostfix;
          tokenType = monarchCommon.sanitize(token);
        }
        if (pos0 < lineWithoutLFLength) {
          tokensCollector.emit(pos0 + offsetDelta, tokenType);
        }
      }
      if (enteringEmbeddedLanguage !== null) {
        return computeNewStateForEmbeddedLanguage(enteringEmbeddedLanguage);
      }
    }
    return MonarchLineStateFactory.create(stack, embeddedLanguageData);
  }
  _getNestedEmbeddedLanguageData(languageId) {
    if (!this._languageService.isRegisteredLanguageId(languageId)) {
      return new EmbeddedLanguageData(languageId, NullState);
    }
    if (languageId !== this._languageId) {
      this._languageService.requestBasicLanguageFeatures(languageId);
      languages.TokenizationRegistry.getOrCreate(languageId);
      this._embeddedLanguages[languageId] = true;
    }
    const tokenizationSupport = languages.TokenizationRegistry.get(languageId);
    if (tokenizationSupport) {
      return new EmbeddedLanguageData(languageId, tokenizationSupport.getInitialState());
    }
    return new EmbeddedLanguageData(languageId, NullState);
  }
};
MonarchTokenizer = __decorateClass([
  __decorateParam(4, IConfigurationService)
], MonarchTokenizer);
function findBracket(lexer, matched) {
  if (!matched) {
    return null;
  }
  matched = monarchCommon.fixCase(lexer, matched);
  const brackets = lexer.brackets;
  for (const bracket of brackets) {
    if (bracket.open === matched) {
      return { token: bracket.token, bracketType: monarchCommon.MonarchBracket.Open };
    } else if (bracket.close === matched) {
      return { token: bracket.token, bracketType: monarchCommon.MonarchBracket.Close };
    }
  }
  return null;
}
export {
  MonarchTokenizer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXGNvbW1vblxcbW9uYXJjaFxcbW9uYXJjaExleGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyoqXG4gKiBDcmVhdGUgYSBzeW50YXggaGlnaGlnaHRlciB3aXRoIGEgZnVsbHkgZGVjbGFyYXRpdmUgSlNPTiBzdHlsZSBsZXhlciBkZXNjcmlwdGlvblxuICogdXNpbmcgcmVndWxhciBleHByZXNzaW9ucy5cbiAqL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBOdWxsU3RhdGUsIG51bGxUb2tlbml6ZUVuY29kZWQsIG51bGxUb2tlbml6ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbnVsbFRva2VuaXplLmpzJztcbmltcG9ydCB7IFRva2VuVGhlbWUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL3Rva2VuaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgKiBhcyBtb25hcmNoQ29tbW9uIGZyb20gJy4vbW9uYXJjaENvbW1vbi5qcyc7XG5pbXBvcnQgeyBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4uL3N0YW5kYWxvbmVUaGVtZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IExhbmd1YWdlSWQsIE1ldGFkYXRhQ29uc3RzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuXG5jb25zdCBDQUNIRV9TVEFDS19ERVBUSCA9IDU7XG5cbi8qKlxuICogUmV1c2UgdGhlIHNhbWUgc3RhY2sgZWxlbWVudHMgdXAgdG8gYSBjZXJ0YWluIGRlcHRoLlxuICovXG5jbGFzcyBNb25hcmNoU3RhY2tFbGVtZW50RmFjdG9yeSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0lOU1RBTkNFID0gbmV3IE1vbmFyY2hTdGFja0VsZW1lbnRGYWN0b3J5KENBQ0hFX1NUQUNLX0RFUFRIKTtcblx0cHVibGljIHN0YXRpYyBjcmVhdGUocGFyZW50OiBNb25hcmNoU3RhY2tFbGVtZW50IHwgbnVsbCwgc3RhdGU6IHN0cmluZyk6IE1vbmFyY2hTdGFja0VsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9JTlNUQU5DRS5jcmVhdGUocGFyZW50LCBzdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXhDYWNoZURlcHRoOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXM6IHsgW3N0YWNrRWxlbWVudElkOiBzdHJpbmddOiBNb25hcmNoU3RhY2tFbGVtZW50IH07XG5cblx0Y29uc3RydWN0b3IobWF4Q2FjaGVEZXB0aDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fbWF4Q2FjaGVEZXB0aCA9IG1heENhY2hlRGVwdGg7XG5cdFx0dGhpcy5fZW50cmllcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlKHBhcmVudDogTW9uYXJjaFN0YWNrRWxlbWVudCB8IG51bGwsIHN0YXRlOiBzdHJpbmcpOiBNb25hcmNoU3RhY2tFbGVtZW50IHtcblx0XHRpZiAocGFyZW50ICE9PSBudWxsICYmIHBhcmVudC5kZXB0aCA+PSB0aGlzLl9tYXhDYWNoZURlcHRoKSB7XG5cdFx0XHQvLyBubyBjYWNoaW5nIGFib3ZlIGEgY2VydGFpbiBkZXB0aFxuXHRcdFx0cmV0dXJuIG5ldyBNb25hcmNoU3RhY2tFbGVtZW50KHBhcmVudCwgc3RhdGUpO1xuXHRcdH1cblx0XHRsZXQgc3RhY2tFbGVtZW50SWQgPSBNb25hcmNoU3RhY2tFbGVtZW50LmdldFN0YWNrRWxlbWVudElkKHBhcmVudCk7XG5cdFx0aWYgKHN0YWNrRWxlbWVudElkLmxlbmd0aCA+IDApIHtcblx0XHRcdHN0YWNrRWxlbWVudElkICs9ICd8Jztcblx0XHR9XG5cdFx0c3RhY2tFbGVtZW50SWQgKz0gc3RhdGU7XG5cblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5fZW50cmllc1tzdGFja0VsZW1lbnRJZF07XG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmVzdWx0ID0gbmV3IE1vbmFyY2hTdGFja0VsZW1lbnQocGFyZW50LCBzdGF0ZSk7XG5cdFx0dGhpcy5fZW50cmllc1tzdGFja0VsZW1lbnRJZF0gPSByZXN1bHQ7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBNb25hcmNoU3RhY2tFbGVtZW50IHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgcGFyZW50OiBNb25hcmNoU3RhY2tFbGVtZW50IHwgbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IHN0YXRlOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBkZXB0aDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHBhcmVudDogTW9uYXJjaFN0YWNrRWxlbWVudCB8IG51bGwsIHN0YXRlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnBhcmVudCA9IHBhcmVudDtcblx0XHR0aGlzLnN0YXRlID0gc3RhdGU7XG5cdFx0dGhpcy5kZXB0aCA9ICh0aGlzLnBhcmVudCA/IHRoaXMucGFyZW50LmRlcHRoIDogMCkgKyAxO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXRTdGFja0VsZW1lbnRJZChlbGVtZW50OiBNb25hcmNoU3RhY2tFbGVtZW50IHwgbnVsbCk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9ICcnO1xuXHRcdHdoaWxlIChlbGVtZW50ICE9PSBudWxsKSB7XG5cdFx0XHRpZiAocmVzdWx0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVzdWx0ICs9ICd8Jztcblx0XHRcdH1cblx0XHRcdHJlc3VsdCArPSBlbGVtZW50LnN0YXRlO1xuXHRcdFx0ZWxlbWVudCA9IGVsZW1lbnQucGFyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2VxdWFscyhhOiBNb25hcmNoU3RhY2tFbGVtZW50IHwgbnVsbCwgYjogTW9uYXJjaFN0YWNrRWxlbWVudCB8IG51bGwpOiBib29sZWFuIHtcblx0XHR3aGlsZSAoYSAhPT0gbnVsbCAmJiBiICE9PSBudWxsKSB7XG5cdFx0XHRpZiAoYSA9PT0gYikge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChhLnN0YXRlICE9PSBiLnN0YXRlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGEgPSBhLnBhcmVudDtcblx0XHRcdGIgPSBiLnBhcmVudDtcblx0XHR9XG5cdFx0aWYgKGEgPT09IG51bGwgJiYgYiA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IE1vbmFyY2hTdGFja0VsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gTW9uYXJjaFN0YWNrRWxlbWVudC5fZXF1YWxzKHRoaXMsIG90aGVyKTtcblx0fVxuXG5cdHB1YmxpYyBwdXNoKHN0YXRlOiBzdHJpbmcpOiBNb25hcmNoU3RhY2tFbGVtZW50IHtcblx0XHRyZXR1cm4gTW9uYXJjaFN0YWNrRWxlbWVudEZhY3RvcnkuY3JlYXRlKHRoaXMsIHN0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyBwb3AoKTogTW9uYXJjaFN0YWNrRWxlbWVudCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLnBhcmVudDtcblx0fVxuXG5cdHB1YmxpYyBwb3BhbGwoKTogTW9uYXJjaFN0YWNrRWxlbWVudCB7XG5cdFx0bGV0IHJlc3VsdDogTW9uYXJjaFN0YWNrRWxlbWVudCA9IHRoaXM7XG5cdFx0d2hpbGUgKHJlc3VsdC5wYXJlbnQpIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5wYXJlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3dpdGNoVG8oc3RhdGU6IHN0cmluZyk6IE1vbmFyY2hTdGFja0VsZW1lbnQge1xuXHRcdHJldHVybiBNb25hcmNoU3RhY2tFbGVtZW50RmFjdG9yeS5jcmVhdGUodGhpcy5wYXJlbnQsIHN0YXRlKTtcblx0fVxufVxuXG5jbGFzcyBFbWJlZGRlZExhbmd1YWdlRGF0YSB7XG5cdHB1YmxpYyByZWFkb25seSBsYW5ndWFnZUlkOiBzdHJpbmc7XG5cdHB1YmxpYyByZWFkb25seSBzdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZTtcblxuXHRjb25zdHJ1Y3RvcihsYW5ndWFnZUlkOiBzdHJpbmcsIHN0YXRlOiBsYW5ndWFnZXMuSVN0YXRlKSB7XG5cdFx0dGhpcy5sYW5ndWFnZUlkID0gbGFuZ3VhZ2VJZDtcblx0XHR0aGlzLnN0YXRlID0gc3RhdGU7XG5cdH1cblxuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBFbWJlZGRlZExhbmd1YWdlRGF0YSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAoXG5cdFx0XHR0aGlzLmxhbmd1YWdlSWQgPT09IG90aGVyLmxhbmd1YWdlSWRcblx0XHRcdCYmIHRoaXMuc3RhdGUuZXF1YWxzKG90aGVyLnN0YXRlKVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgY2xvbmUoKTogRW1iZWRkZWRMYW5ndWFnZURhdGEge1xuXHRcdGNvbnN0IHN0YXRlQ2xvbmUgPSB0aGlzLnN0YXRlLmNsb25lKCk7XG5cdFx0Ly8gc2F2ZSBhbiBvYmplY3Rcblx0XHRpZiAoc3RhdGVDbG9uZSA9PT0gdGhpcy5zdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgRW1iZWRkZWRMYW5ndWFnZURhdGEodGhpcy5sYW5ndWFnZUlkLCB0aGlzLnN0YXRlKTtcblx0fVxufVxuXG4vKipcbiAqIFJldXNlIHRoZSBzYW1lIGxpbmUgc3RhdGVzIHVwIHRvIGEgY2VydGFpbiBkZXB0aC5cbiAqL1xuY2xhc3MgTW9uYXJjaExpbmVTdGF0ZUZhY3Rvcnkge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9JTlNUQU5DRSA9IG5ldyBNb25hcmNoTGluZVN0YXRlRmFjdG9yeShDQUNIRV9TVEFDS19ERVBUSCk7XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlKHN0YWNrOiBNb25hcmNoU3RhY2tFbGVtZW50LCBlbWJlZGRlZExhbmd1YWdlRGF0YTogRW1iZWRkZWRMYW5ndWFnZURhdGEgfCBudWxsKTogTW9uYXJjaExpbmVTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX0lOU1RBTkNFLmNyZWF0ZShzdGFjaywgZW1iZWRkZWRMYW5ndWFnZURhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWF4Q2FjaGVEZXB0aDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzOiB7IFtzdGFja0VsZW1lbnRJZDogc3RyaW5nXTogTW9uYXJjaExpbmVTdGF0ZSB9O1xuXG5cdGNvbnN0cnVjdG9yKG1heENhY2hlRGVwdGg6IG51bWJlcikge1xuXHRcdHRoaXMuX21heENhY2hlRGVwdGggPSBtYXhDYWNoZURlcHRoO1xuXHRcdHRoaXMuX2VudHJpZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZShzdGFjazogTW9uYXJjaFN0YWNrRWxlbWVudCwgZW1iZWRkZWRMYW5ndWFnZURhdGE6IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhIHwgbnVsbCk6IE1vbmFyY2hMaW5lU3RhdGUge1xuXHRcdGlmIChlbWJlZGRlZExhbmd1YWdlRGF0YSAhPT0gbnVsbCkge1xuXHRcdFx0Ly8gbm8gY2FjaGluZyB3aGVuIGVtYmVkZGluZ1xuXHRcdFx0cmV0dXJuIG5ldyBNb25hcmNoTGluZVN0YXRlKHN0YWNrLCBlbWJlZGRlZExhbmd1YWdlRGF0YSk7XG5cdFx0fVxuXHRcdGlmIChzdGFjayAhPT0gbnVsbCAmJiBzdGFjay5kZXB0aCA+PSB0aGlzLl9tYXhDYWNoZURlcHRoKSB7XG5cdFx0XHQvLyBubyBjYWNoaW5nIGFib3ZlIGEgY2VydGFpbiBkZXB0aFxuXHRcdFx0cmV0dXJuIG5ldyBNb25hcmNoTGluZVN0YXRlKHN0YWNrLCBlbWJlZGRlZExhbmd1YWdlRGF0YSk7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YWNrRWxlbWVudElkID0gTW9uYXJjaFN0YWNrRWxlbWVudC5nZXRTdGFja0VsZW1lbnRJZChzdGFjayk7XG5cblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5fZW50cmllc1tzdGFja0VsZW1lbnRJZF07XG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmVzdWx0ID0gbmV3IE1vbmFyY2hMaW5lU3RhdGUoc3RhY2ssIG51bGwpO1xuXHRcdHRoaXMuX2VudHJpZXNbc3RhY2tFbGVtZW50SWRdID0gcmVzdWx0O1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgTW9uYXJjaExpbmVTdGF0ZSBpbXBsZW1lbnRzIGxhbmd1YWdlcy5JU3RhdGUge1xuXG5cdHB1YmxpYyByZWFkb25seSBzdGFjazogTW9uYXJjaFN0YWNrRWxlbWVudDtcblx0cHVibGljIHJlYWRvbmx5IGVtYmVkZGVkTGFuZ3VhZ2VEYXRhOiBFbWJlZGRlZExhbmd1YWdlRGF0YSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0c3RhY2s6IE1vbmFyY2hTdGFja0VsZW1lbnQsXG5cdFx0ZW1iZWRkZWRMYW5ndWFnZURhdGE6IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhIHwgbnVsbFxuXHQpIHtcblx0XHR0aGlzLnN0YWNrID0gc3RhY2s7XG5cdFx0dGhpcy5lbWJlZGRlZExhbmd1YWdlRGF0YSA9IGVtYmVkZGVkTGFuZ3VhZ2VEYXRhO1xuXHR9XG5cblx0cHVibGljIGNsb25lKCk6IGxhbmd1YWdlcy5JU3RhdGUge1xuXHRcdGNvbnN0IGVtYmVkZGVkbGFuZ3VhZ2VEYXRhQ2xvbmUgPSB0aGlzLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhID8gdGhpcy5lbWJlZGRlZExhbmd1YWdlRGF0YS5jbG9uZSgpIDogbnVsbDtcblx0XHQvLyBzYXZlIGFuIG9iamVjdFxuXHRcdGlmIChlbWJlZGRlZGxhbmd1YWdlRGF0YUNsb25lID09PSB0aGlzLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhKSB7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0cmV0dXJuIE1vbmFyY2hMaW5lU3RhdGVGYWN0b3J5LmNyZWF0ZSh0aGlzLnN0YWNrLCB0aGlzLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhKTtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IGxhbmd1YWdlcy5JU3RhdGUpOiBib29sZWFuIHtcblx0XHRpZiAoIShvdGhlciBpbnN0YW5jZW9mIE1vbmFyY2hMaW5lU3RhdGUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5zdGFjay5lcXVhbHMob3RoZXIuc3RhY2spKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhID09PSBudWxsICYmIG90aGVyLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZW1iZWRkZWRMYW5ndWFnZURhdGEgPT09IG51bGwgfHwgb3RoZXIuZW1iZWRkZWRMYW5ndWFnZURhdGEgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZW1iZWRkZWRMYW5ndWFnZURhdGEuZXF1YWxzKG90aGVyLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSU1vbmFyY2hUb2tlbnNDb2xsZWN0b3Ige1xuXHRlbnRlckxhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZyk6IHZvaWQ7XG5cdGVtaXQoc3RhcnRPZmZzZXQ6IG51bWJlciwgdHlwZTogc3RyaW5nKTogdm9pZDtcblx0bmVzdGVkTGFuZ3VhZ2VUb2tlbml6ZShlbWJlZGRlZExhbmd1YWdlTGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIGVtYmVkZGVkTGFuZ3VhZ2VEYXRhOiBFbWJlZGRlZExhbmd1YWdlRGF0YSwgb2Zmc2V0RGVsdGE6IG51bWJlcik6IGxhbmd1YWdlcy5JU3RhdGU7XG59XG5cbmNsYXNzIE1vbmFyY2hDbGFzc2ljVG9rZW5zQ29sbGVjdG9yIGltcGxlbWVudHMgSU1vbmFyY2hUb2tlbnNDb2xsZWN0b3Ige1xuXG5cdHByaXZhdGUgX3Rva2VuczogbGFuZ3VhZ2VzLlRva2VuW107XG5cdHByaXZhdGUgX2xhbmd1YWdlSWQ6IHN0cmluZyB8IG51bGw7XG5cdHByaXZhdGUgX2xhc3RUb2tlblR5cGU6IHN0cmluZyB8IG51bGw7XG5cdHByaXZhdGUgX2xhc3RUb2tlbkxhbmd1YWdlOiBzdHJpbmcgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX3Rva2VucyA9IFtdO1xuXHRcdHRoaXMuX2xhbmd1YWdlSWQgPSBudWxsO1xuXHRcdHRoaXMuX2xhc3RUb2tlblR5cGUgPSBudWxsO1xuXHRcdHRoaXMuX2xhc3RUb2tlbkxhbmd1YWdlID0gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyBlbnRlckxhbmd1YWdlKGxhbmd1YWdlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2xhbmd1YWdlSWQgPSBsYW5ndWFnZUlkO1xuXHR9XG5cblx0cHVibGljIGVtaXQoc3RhcnRPZmZzZXQ6IG51bWJlciwgdHlwZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xhc3RUb2tlblR5cGUgPT09IHR5cGUgJiYgdGhpcy5fbGFzdFRva2VuTGFuZ3VhZ2UgPT09IHRoaXMuX2xhbmd1YWdlSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdFRva2VuVHlwZSA9IHR5cGU7XG5cdFx0dGhpcy5fbGFzdFRva2VuTGFuZ3VhZ2UgPSB0aGlzLl9sYW5ndWFnZUlkO1xuXHRcdHRoaXMuX3Rva2Vucy5wdXNoKG5ldyBsYW5ndWFnZXMuVG9rZW4oc3RhcnRPZmZzZXQsIHR5cGUsIHRoaXMuX2xhbmd1YWdlSWQhKSk7XG5cdH1cblxuXHRwdWJsaWMgbmVzdGVkTGFuZ3VhZ2VUb2tlbml6ZShlbWJlZGRlZExhbmd1YWdlTGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIGVtYmVkZGVkTGFuZ3VhZ2VEYXRhOiBFbWJlZGRlZExhbmd1YWdlRGF0YSwgb2Zmc2V0RGVsdGE6IG51bWJlcik6IGxhbmd1YWdlcy5JU3RhdGUge1xuXHRcdGNvbnN0IG5lc3RlZExhbmd1YWdlSWQgPSBlbWJlZGRlZExhbmd1YWdlRGF0YS5sYW5ndWFnZUlkO1xuXHRcdGNvbnN0IGVtYmVkZGVkTW9kZVN0YXRlID0gZW1iZWRkZWRMYW5ndWFnZURhdGEuc3RhdGU7XG5cblx0XHRjb25zdCBuZXN0ZWRMYW5ndWFnZVRva2VuaXphdGlvblN1cHBvcnQgPSBsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0KG5lc3RlZExhbmd1YWdlSWQpO1xuXHRcdGlmICghbmVzdGVkTGFuZ3VhZ2VUb2tlbml6YXRpb25TdXBwb3J0KSB7XG5cdFx0XHR0aGlzLmVudGVyTGFuZ3VhZ2UobmVzdGVkTGFuZ3VhZ2VJZCk7XG5cdFx0XHR0aGlzLmVtaXQob2Zmc2V0RGVsdGEsICcnKTtcblx0XHRcdHJldHVybiBlbWJlZGRlZE1vZGVTdGF0ZTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXN0ZWRSZXN1bHQgPSBuZXN0ZWRMYW5ndWFnZVRva2VuaXphdGlvblN1cHBvcnQudG9rZW5pemUoZW1iZWRkZWRMYW5ndWFnZUxpbmUsIGhhc0VPTCwgZW1iZWRkZWRNb2RlU3RhdGUpO1xuXHRcdGlmIChvZmZzZXREZWx0YSAhPT0gMCkge1xuXHRcdFx0Zm9yIChjb25zdCB0b2tlbiBvZiBuZXN0ZWRSZXN1bHQudG9rZW5zKSB7XG5cdFx0XHRcdHRoaXMuX3Rva2Vucy5wdXNoKG5ldyBsYW5ndWFnZXMuVG9rZW4odG9rZW4ub2Zmc2V0ICsgb2Zmc2V0RGVsdGEsIHRva2VuLnR5cGUsIHRva2VuLmxhbmd1YWdlKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Rva2VucyA9IHRoaXMuX3Rva2Vucy5jb25jYXQobmVzdGVkUmVzdWx0LnRva2Vucyk7XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RUb2tlblR5cGUgPSBudWxsO1xuXHRcdHRoaXMuX2xhc3RUb2tlbkxhbmd1YWdlID0gbnVsbDtcblx0XHR0aGlzLl9sYW5ndWFnZUlkID0gbnVsbDtcblx0XHRyZXR1cm4gbmVzdGVkUmVzdWx0LmVuZFN0YXRlO1xuXHR9XG5cblx0cHVibGljIGZpbmFsaXplKGVuZFN0YXRlOiBNb25hcmNoTGluZVN0YXRlKTogbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlc3VsdCB7XG5cdFx0cmV0dXJuIG5ldyBsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVzdWx0KHRoaXMuX3Rva2VucywgZW5kU3RhdGUpO1xuXHR9XG59XG5cbmNsYXNzIE1vbmFyY2hNb2Rlcm5Ub2tlbnNDb2xsZWN0b3IgaW1wbGVtZW50cyBJTW9uYXJjaFRva2Vuc0NvbGxlY3RvciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aGVtZTogVG9rZW5UaGVtZTtcblx0cHJpdmF0ZSBfcHJlcGVuZFRva2VuczogVWludDMyQXJyYXkgfCBudWxsO1xuXHRwcml2YXRlIF90b2tlbnM6IG51bWJlcltdO1xuXHRwcml2YXRlIF9jdXJyZW50TGFuZ3VhZ2VJZDogTGFuZ3VhZ2VJZDtcblx0cHJpdmF0ZSBfbGFzdFRva2VuTWV0YWRhdGE6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsIHRoZW1lOiBUb2tlblRoZW1lKSB7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlID0gbGFuZ3VhZ2VTZXJ2aWNlO1xuXHRcdHRoaXMuX3RoZW1lID0gdGhlbWU7XG5cdFx0dGhpcy5fcHJlcGVuZFRva2VucyA9IG51bGw7XG5cdFx0dGhpcy5fdG9rZW5zID0gW107XG5cdFx0dGhpcy5fY3VycmVudExhbmd1YWdlSWQgPSBMYW5ndWFnZUlkLk51bGw7XG5cdFx0dGhpcy5fbGFzdFRva2VuTWV0YWRhdGEgPSAwO1xuXHR9XG5cblx0cHVibGljIGVudGVyTGFuZ3VhZ2UobGFuZ3VhZ2VJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudExhbmd1YWdlSWQgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdH1cblxuXHRwdWJsaWMgZW1pdChzdGFydE9mZnNldDogbnVtYmVyLCB0eXBlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX3RoZW1lLm1hdGNoKHRoaXMuX2N1cnJlbnRMYW5ndWFnZUlkLCB0eXBlKSB8IE1ldGFkYXRhQ29uc3RzLkJBTEFOQ0VEX0JSQUNLRVRTX01BU0s7XG5cdFx0aWYgKHRoaXMuX2xhc3RUb2tlbk1ldGFkYXRhID09PSBtZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0VG9rZW5NZXRhZGF0YSA9IG1ldGFkYXRhO1xuXHRcdHRoaXMuX3Rva2Vucy5wdXNoKHN0YXJ0T2Zmc2V0KTtcblx0XHR0aGlzLl90b2tlbnMucHVzaChtZXRhZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbWVyZ2UoYTogVWludDMyQXJyYXkgfCBudWxsLCBiOiBudW1iZXJbXSwgYzogVWludDMyQXJyYXkgfCBudWxsKTogVWludDMyQXJyYXkge1xuXHRcdGNvbnN0IGFMZW4gPSAoYSAhPT0gbnVsbCA/IGEubGVuZ3RoIDogMCk7XG5cdFx0Y29uc3QgYkxlbiA9IGIubGVuZ3RoO1xuXHRcdGNvbnN0IGNMZW4gPSAoYyAhPT0gbnVsbCA/IGMubGVuZ3RoIDogMCk7XG5cblx0XHRpZiAoYUxlbiA9PT0gMCAmJiBiTGVuID09PSAwICYmIGNMZW4gPT09IDApIHtcblx0XHRcdHJldHVybiBuZXcgVWludDMyQXJyYXkoMCk7XG5cdFx0fVxuXHRcdGlmIChhTGVuID09PSAwICYmIGJMZW4gPT09IDApIHtcblx0XHRcdHJldHVybiBjITtcblx0XHR9XG5cdFx0aWYgKGJMZW4gPT09IDAgJiYgY0xlbiA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGEhO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50MzJBcnJheShhTGVuICsgYkxlbiArIGNMZW4pO1xuXHRcdGlmIChhICE9PSBudWxsKSB7XG5cdFx0XHRyZXN1bHQuc2V0KGEpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGJMZW47IGkrKykge1xuXHRcdFx0cmVzdWx0W2FMZW4gKyBpXSA9IGJbaV07XG5cdFx0fVxuXHRcdGlmIChjICE9PSBudWxsKSB7XG5cdFx0XHRyZXN1bHQuc2V0KGMsIGFMZW4gKyBiTGVuKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBuZXN0ZWRMYW5ndWFnZVRva2VuaXplKGVtYmVkZGVkTGFuZ3VhZ2VMaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgZW1iZWRkZWRMYW5ndWFnZURhdGE6IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhLCBvZmZzZXREZWx0YTogbnVtYmVyKTogbGFuZ3VhZ2VzLklTdGF0ZSB7XG5cdFx0Y29uc3QgbmVzdGVkTGFuZ3VhZ2VJZCA9IGVtYmVkZGVkTGFuZ3VhZ2VEYXRhLmxhbmd1YWdlSWQ7XG5cdFx0Y29uc3QgZW1iZWRkZWRNb2RlU3RhdGUgPSBlbWJlZGRlZExhbmd1YWdlRGF0YS5zdGF0ZTtcblxuXHRcdGNvbnN0IG5lc3RlZExhbmd1YWdlVG9rZW5pemF0aW9uU3VwcG9ydCA9IGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5nZXQobmVzdGVkTGFuZ3VhZ2VJZCk7XG5cdFx0aWYgKCFuZXN0ZWRMYW5ndWFnZVRva2VuaXphdGlvblN1cHBvcnQpIHtcblx0XHRcdHRoaXMuZW50ZXJMYW5ndWFnZShuZXN0ZWRMYW5ndWFnZUlkKTtcblx0XHRcdHRoaXMuZW1pdChvZmZzZXREZWx0YSwgJycpO1xuXHRcdFx0cmV0dXJuIGVtYmVkZGVkTW9kZVN0YXRlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5lc3RlZFJlc3VsdCA9IG5lc3RlZExhbmd1YWdlVG9rZW5pemF0aW9uU3VwcG9ydC50b2tlbml6ZUVuY29kZWQoZW1iZWRkZWRMYW5ndWFnZUxpbmUsIGhhc0VPTCwgZW1iZWRkZWRNb2RlU3RhdGUpO1xuXHRcdGlmIChvZmZzZXREZWx0YSAhPT0gMCkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG5lc3RlZFJlc3VsdC50b2tlbnMubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDIpIHtcblx0XHRcdFx0bmVzdGVkUmVzdWx0LnRva2Vuc1tpXSArPSBvZmZzZXREZWx0YTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9wcmVwZW5kVG9rZW5zID0gTW9uYXJjaE1vZGVyblRva2Vuc0NvbGxlY3Rvci5fbWVyZ2UodGhpcy5fcHJlcGVuZFRva2VucywgdGhpcy5fdG9rZW5zLCBuZXN0ZWRSZXN1bHQudG9rZW5zKTtcblx0XHR0aGlzLl90b2tlbnMgPSBbXTtcblx0XHR0aGlzLl9jdXJyZW50TGFuZ3VhZ2VJZCA9IDA7XG5cdFx0dGhpcy5fbGFzdFRva2VuTWV0YWRhdGEgPSAwO1xuXHRcdHJldHVybiBuZXN0ZWRSZXN1bHQuZW5kU3RhdGU7XG5cdH1cblxuXHRwdWJsaWMgZmluYWxpemUoZW5kU3RhdGU6IE1vbmFyY2hMaW5lU3RhdGUpOiBsYW5ndWFnZXMuRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCB7XG5cdFx0cmV0dXJuIG5ldyBsYW5ndWFnZXMuRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdChcblx0XHRcdE1vbmFyY2hNb2Rlcm5Ub2tlbnNDb2xsZWN0b3IuX21lcmdlKHRoaXMuX3ByZXBlbmRUb2tlbnMsIHRoaXMuX3Rva2VucywgbnVsbCksXG5cdFx0XHRbXSxcblx0XHRcdGVuZFN0YXRlXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBJTG9hZFN0YXR1cyA9IHsgbG9hZGVkOiB0cnVlIH0gfCB7IGxvYWRlZDogZmFsc2U7IHByb21pc2U6IFByb21pc2U8dm9pZD4gfTtcblxuZXhwb3J0IGNsYXNzIE1vbmFyY2hUb2tlbml6ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgbGFuZ3VhZ2VzLklUb2tlbml6YXRpb25TdXBwb3J0LCBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlOiBJU3RhbmRhbG9uZVRoZW1lU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sZXhlcjogbW9uYXJjaENvbW1vbi5JTGV4ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VtYmVkZGVkTGFuZ3VhZ2VzOiB7IFtsYW5ndWFnZUlkOiBzdHJpbmddOiBib29sZWFuIH07XG5cdHB1YmxpYyBlbWJlZGRlZExvYWRlZDogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBfbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgc3RhbmRhbG9uZVRoZW1lU2VydmljZTogSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UsIGxhbmd1YWdlSWQ6IHN0cmluZywgbGV4ZXI6IG1vbmFyY2hDb21tb24uSUxleGVyLCBASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xhbmd1YWdlU2VydmljZSA9IGxhbmd1YWdlU2VydmljZTtcblx0XHR0aGlzLl9zdGFuZGFsb25lVGhlbWVTZXJ2aWNlID0gc3RhbmRhbG9uZVRoZW1lU2VydmljZTtcblx0XHR0aGlzLl9sYW5ndWFnZUlkID0gbGFuZ3VhZ2VJZDtcblx0XHR0aGlzLl9sZXhlciA9IGxleGVyO1xuXHRcdHRoaXMuX2VtYmVkZGVkTGFuZ3VhZ2VzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLmVtYmVkZGVkTG9hZGVkID0gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cblx0XHQvLyBTZXQgdXAgbGlzdGVuaW5nIGZvciBlbWJlZGRlZCBtb2Rlc1xuXHRcdGxldCBlbWl0dGluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5vbkRpZENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGVtaXR0aW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxldCBpc09uZU9mTXlFbWJlZGRlZE1vZGVzID0gZmFsc2U7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZS5jaGFuZ2VkTGFuZ3VhZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlID0gZS5jaGFuZ2VkTGFuZ3VhZ2VzW2ldO1xuXHRcdFx0XHRpZiAodGhpcy5fZW1iZWRkZWRMYW5ndWFnZXNbbGFuZ3VhZ2VdKSB7XG5cdFx0XHRcdFx0aXNPbmVPZk15RW1iZWRkZWRNb2RlcyA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpc09uZU9mTXlFbWJlZGRlZE1vZGVzKSB7XG5cdFx0XHRcdGVtaXR0aW5nID0gdHJ1ZTtcblx0XHRcdFx0bGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LmhhbmRsZUNoYW5nZShbdGhpcy5fbGFuZ3VhZ2VJZF0pO1xuXHRcdFx0XHRlbWl0dGluZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignZWRpdG9yLm1heFRva2VuaXphdGlvbkxpbmVMZW5ndGgnLCB7XG5cdFx0XHRvdmVycmlkZUlkZW50aWZpZXI6IHRoaXMuX2xhbmd1YWdlSWRcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLm1heFRva2VuaXphdGlvbkxpbmVMZW5ndGgnKSkge1xuXHRcdFx0XHR0aGlzLl9tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPignZWRpdG9yLm1heFRva2VuaXphdGlvbkxpbmVMZW5ndGgnLCB7XG5cdFx0XHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyOiB0aGlzLl9sYW5ndWFnZUlkXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMb2FkU3RhdHVzKCk6IElMb2FkU3RhdHVzIHtcblx0XHRjb25zdCBwcm9taXNlczogVGhlbmFibGU8YW55PltdID0gW107XG5cdFx0Zm9yIChjb25zdCBuZXN0ZWRMYW5ndWFnZUlkIGluIHRoaXMuX2VtYmVkZGVkTGFuZ3VhZ2VzKSB7XG5cdFx0XHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0ID0gbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LmdldChuZXN0ZWRMYW5ndWFnZUlkKTtcblx0XHRcdGlmICh0b2tlbml6YXRpb25TdXBwb3J0KSB7XG5cdFx0XHRcdC8vIFRoZSBuZXN0ZWQgbGFuZ3VhZ2UgaXMgYWxyZWFkeSBsb2FkZWRcblx0XHRcdFx0aWYgKHRva2VuaXphdGlvblN1cHBvcnQgaW5zdGFuY2VvZiBNb25hcmNoVG9rZW5pemVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmVzdGVkTW9kZVN0YXR1cyA9IHRva2VuaXphdGlvblN1cHBvcnQuZ2V0TG9hZFN0YXR1cygpO1xuXHRcdFx0XHRcdGlmIChuZXN0ZWRNb2RlU3RhdHVzLmxvYWRlZCA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdHByb21pc2VzLnB1c2gobmVzdGVkTW9kZVN0YXR1cy5wcm9taXNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbGFuZ3VhZ2VzLlRva2VuaXphdGlvblJlZ2lzdHJ5LmlzUmVzb2x2ZWQobmVzdGVkTGFuZ3VhZ2VJZCkpIHtcblx0XHRcdFx0Ly8gVGhlIG5lc3RlZCBsYW5ndWFnZSBpcyBpbiB0aGUgcHJvY2VzcyBvZiBiZWluZyBsb2FkZWRcblx0XHRcdFx0cHJvbWlzZXMucHVzaChsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0T3JDcmVhdGUobmVzdGVkTGFuZ3VhZ2VJZCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwcm9taXNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxvYWRlZDogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxvYWRlZDogZmFsc2UsXG5cdFx0XHRwcm9taXNlOiBQcm9taXNlLmFsbChwcm9taXNlcykudGhlbihfID0+IHVuZGVmaW5lZClcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGdldEluaXRpYWxTdGF0ZSgpOiBsYW5ndWFnZXMuSVN0YXRlIHtcblx0XHRjb25zdCByb290U3RhdGUgPSBNb25hcmNoU3RhY2tFbGVtZW50RmFjdG9yeS5jcmVhdGUobnVsbCwgdGhpcy5fbGV4ZXIuc3RhcnQhKTtcblx0XHRyZXR1cm4gTW9uYXJjaExpbmVTdGF0ZUZhY3RvcnkuY3JlYXRlKHJvb3RTdGF0ZSwgbnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgdG9rZW5pemUobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIGxpbmVTdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSk6IGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZXN1bHQge1xuXHRcdGlmIChsaW5lLmxlbmd0aCA+PSB0aGlzLl9tYXhUb2tlbml6YXRpb25MaW5lTGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbFRva2VuaXplKHRoaXMuX2xhbmd1YWdlSWQsIGxpbmVTdGF0ZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHRva2Vuc0NvbGxlY3RvciA9IG5ldyBNb25hcmNoQ2xhc3NpY1Rva2Vuc0NvbGxlY3RvcigpO1xuXHRcdGNvbnN0IGVuZExpbmVTdGF0ZSA9IHRoaXMuX3Rva2VuaXplKGxpbmUsIGhhc0VPTCwgPE1vbmFyY2hMaW5lU3RhdGU+bGluZVN0YXRlLCB0b2tlbnNDb2xsZWN0b3IpO1xuXHRcdHJldHVybiB0b2tlbnNDb2xsZWN0b3IuZmluYWxpemUoZW5kTGluZVN0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyB0b2tlbml6ZUVuY29kZWQobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIGxpbmVTdGF0ZTogbGFuZ3VhZ2VzLklTdGF0ZSk6IGxhbmd1YWdlcy5FbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0IHtcblx0XHRpZiAobGluZS5sZW5ndGggPj0gdGhpcy5fbWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG51bGxUb2tlbml6ZUVuY29kZWQodGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKHRoaXMuX2xhbmd1YWdlSWQpLCBsaW5lU3RhdGUpO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbnNDb2xsZWN0b3IgPSBuZXcgTW9uYXJjaE1vZGVyblRva2Vuc0NvbGxlY3Rvcih0aGlzLl9sYW5ndWFnZVNlcnZpY2UsIHRoaXMuX3N0YW5kYWxvbmVUaGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnRva2VuVGhlbWUpO1xuXHRcdGNvbnN0IGVuZExpbmVTdGF0ZSA9IHRoaXMuX3Rva2VuaXplKGxpbmUsIGhhc0VPTCwgPE1vbmFyY2hMaW5lU3RhdGU+bGluZVN0YXRlLCB0b2tlbnNDb2xsZWN0b3IpO1xuXHRcdHJldHVybiB0b2tlbnNDb2xsZWN0b3IuZmluYWxpemUoZW5kTGluZVN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgX3Rva2VuaXplKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBsaW5lU3RhdGU6IE1vbmFyY2hMaW5lU3RhdGUsIGNvbGxlY3RvcjogSU1vbmFyY2hUb2tlbnNDb2xsZWN0b3IpOiBNb25hcmNoTGluZVN0YXRlIHtcblx0XHRpZiAobGluZVN0YXRlLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbmVzdGVkVG9rZW5pemUobGluZSwgaGFzRU9MLCBsaW5lU3RhdGUsIDAsIGNvbGxlY3Rvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9teVRva2VuaXplKGxpbmUsIGhhc0VPTCwgbGluZVN0YXRlLCAwLCBjb2xsZWN0b3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRMZWF2aW5nTmVzdGVkTGFuZ3VhZ2VPZmZzZXQobGluZTogc3RyaW5nLCBzdGF0ZTogTW9uYXJjaExpbmVTdGF0ZSk6IG51bWJlciB7XG5cdFx0bGV0IHJ1bGVzOiBtb25hcmNoQ29tbW9uLklSdWxlW10gfCBudWxsID0gdGhpcy5fbGV4ZXIudG9rZW5pemVyW3N0YXRlLnN0YWNrLnN0YXRlXTtcblx0XHRpZiAoIXJ1bGVzKSB7XG5cdFx0XHRydWxlcyA9IG1vbmFyY2hDb21tb24uZmluZFJ1bGVzKHRoaXMuX2xleGVyLCBzdGF0ZS5zdGFjay5zdGF0ZSk7IC8vIGRvIHBhcmVudCBtYXRjaGluZ1xuXHRcdFx0aWYgKCFydWxlcykge1xuXHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAndG9rZW5pemVyIHN0YXRlIGlzIG5vdCBkZWZpbmVkOiAnICsgc3RhdGUuc3RhY2suc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBwb3BPZmZzZXQgPSAtMTtcblx0XHRsZXQgaGFzRW1iZWRkZWRQb3BSdWxlID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgcnVsZXMpIHtcblx0XHRcdGlmICghbW9uYXJjaENvbW1vbi5pc0lBY3Rpb24ocnVsZS5hY3Rpb24pIHx8ICEocnVsZS5hY3Rpb24ubmV4dEVtYmVkZGVkID09PSAnQHBvcCcgfHwgcnVsZS5hY3Rpb24uaGFzRW1iZWRkZWRFbmRJbkNhc2VzKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGhhc0VtYmVkZGVkUG9wUnVsZSA9IHRydWU7XG5cblx0XHRcdGxldCByZWdleCA9IHJ1bGUucmVzb2x2ZVJlZ2V4KHN0YXRlLnN0YWNrLnN0YXRlKTtcblx0XHRcdGNvbnN0IHJlZ2V4U291cmNlID0gcmVnZXguc291cmNlO1xuXHRcdFx0aWYgKHJlZ2V4U291cmNlLnN1YnN0cigwLCA0KSA9PT0gJ14oPzonICYmIHJlZ2V4U291cmNlLnN1YnN0cihyZWdleFNvdXJjZS5sZW5ndGggLSAxLCAxKSA9PT0gJyknKSB7XG5cdFx0XHRcdGNvbnN0IGZsYWdzID0gKHJlZ2V4Lmlnbm9yZUNhc2UgPyAnaScgOiAnJykgKyAocmVnZXgudW5pY29kZSA/ICd1JyA6ICcnKTtcblx0XHRcdFx0cmVnZXggPSBuZXcgUmVnRXhwKHJlZ2V4U291cmNlLnN1YnN0cig0LCByZWdleFNvdXJjZS5sZW5ndGggLSA1KSwgZmxhZ3MpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBsaW5lLnNlYXJjaChyZWdleCk7XG5cdFx0XHRpZiAocmVzdWx0ID09PSAtMSB8fCAocmVzdWx0ICE9PSAwICYmIHJ1bGUubWF0Y2hPbmx5QXRMaW5lU3RhcnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocG9wT2Zmc2V0ID09PSAtMSB8fCByZXN1bHQgPCBwb3BPZmZzZXQpIHtcblx0XHRcdFx0cG9wT2Zmc2V0ID0gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaGFzRW1iZWRkZWRQb3BSdWxlKSB7XG5cdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAnbm8gcnVsZSBjb250YWluaW5nIG5leHRFbWJlZGRlZDogXCJAcG9wXCIgaW4gdG9rZW5pemVyIGVtYmVkZGVkIHN0YXRlOiAnICsgc3RhdGUuc3RhY2suc3RhdGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwb3BPZmZzZXQ7XG5cdH1cblxuXHRwcml2YXRlIF9uZXN0ZWRUb2tlbml6ZShsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgbGluZVN0YXRlOiBNb25hcmNoTGluZVN0YXRlLCBvZmZzZXREZWx0YTogbnVtYmVyLCB0b2tlbnNDb2xsZWN0b3I6IElNb25hcmNoVG9rZW5zQ29sbGVjdG9yKTogTW9uYXJjaExpbmVTdGF0ZSB7XG5cblx0XHRjb25zdCBwb3BPZmZzZXQgPSB0aGlzLl9maW5kTGVhdmluZ05lc3RlZExhbmd1YWdlT2Zmc2V0KGxpbmUsIGxpbmVTdGF0ZSk7XG5cblx0XHRpZiAocG9wT2Zmc2V0ID09PSAtMSkge1xuXHRcdFx0Ly8gdG9rZW5pemF0aW9uIHdpbGwgbm90IGxlYXZlIG5lc3RlZCBsYW5ndWFnZVxuXHRcdFx0Y29uc3QgbmVzdGVkRW5kU3RhdGUgPSB0b2tlbnNDb2xsZWN0b3IubmVzdGVkTGFuZ3VhZ2VUb2tlbml6ZShsaW5lLCBoYXNFT0wsIGxpbmVTdGF0ZS5lbWJlZGRlZExhbmd1YWdlRGF0YSEsIG9mZnNldERlbHRhKTtcblx0XHRcdHJldHVybiBNb25hcmNoTGluZVN0YXRlRmFjdG9yeS5jcmVhdGUobGluZVN0YXRlLnN0YWNrLCBuZXcgRW1iZWRkZWRMYW5ndWFnZURhdGEobGluZVN0YXRlLmVtYmVkZGVkTGFuZ3VhZ2VEYXRhIS5sYW5ndWFnZUlkLCBuZXN0ZWRFbmRTdGF0ZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5lc3RlZExhbmd1YWdlTGluZSA9IGxpbmUuc3Vic3RyaW5nKDAsIHBvcE9mZnNldCk7XG5cdFx0aWYgKG5lc3RlZExhbmd1YWdlTGluZS5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyB0b2tlbml6ZSB3aXRoIHRoZSBuZXN0ZWQgbGFuZ3VhZ2Vcblx0XHRcdHRva2Vuc0NvbGxlY3Rvci5uZXN0ZWRMYW5ndWFnZVRva2VuaXplKG5lc3RlZExhbmd1YWdlTGluZSwgZmFsc2UsIGxpbmVTdGF0ZS5lbWJlZGRlZExhbmd1YWdlRGF0YSEsIG9mZnNldERlbHRhKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN0T2ZUaGVMaW5lID0gbGluZS5zdWJzdHJpbmcocG9wT2Zmc2V0KTtcblx0XHRyZXR1cm4gdGhpcy5fbXlUb2tlbml6ZShyZXN0T2ZUaGVMaW5lLCBoYXNFT0wsIGxpbmVTdGF0ZSwgb2Zmc2V0RGVsdGEgKyBwb3BPZmZzZXQsIHRva2Vuc0NvbGxlY3Rvcik7XG5cdH1cblxuXHRwcml2YXRlIF9zYWZlUnVsZU5hbWUocnVsZTogbW9uYXJjaENvbW1vbi5JUnVsZSB8IG51bGwpOiBzdHJpbmcge1xuXHRcdGlmIChydWxlKSB7XG5cdFx0XHRyZXR1cm4gcnVsZS5uYW1lO1xuXHRcdH1cblx0XHRyZXR1cm4gJyh1bmtub3duKSc7XG5cdH1cblxuXHRwcml2YXRlIF9teVRva2VuaXplKGxpbmVXaXRob3V0TEY6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBsaW5lU3RhdGU6IE1vbmFyY2hMaW5lU3RhdGUsIG9mZnNldERlbHRhOiBudW1iZXIsIHRva2Vuc0NvbGxlY3RvcjogSU1vbmFyY2hUb2tlbnNDb2xsZWN0b3IpOiBNb25hcmNoTGluZVN0YXRlIHtcblx0XHR0b2tlbnNDb2xsZWN0b3IuZW50ZXJMYW5ndWFnZSh0aGlzLl9sYW5ndWFnZUlkKTtcblxuXHRcdGNvbnN0IGxpbmVXaXRob3V0TEZMZW5ndGggPSBsaW5lV2l0aG91dExGLmxlbmd0aDtcblx0XHRjb25zdCBsaW5lID0gKGhhc0VPTCAmJiB0aGlzLl9sZXhlci5pbmNsdWRlTEYgPyBsaW5lV2l0aG91dExGICsgJ1xcbicgOiBsaW5lV2l0aG91dExGKTtcblx0XHRjb25zdCBsaW5lTGVuZ3RoID0gbGluZS5sZW5ndGg7XG5cblx0XHRsZXQgZW1iZWRkZWRMYW5ndWFnZURhdGEgPSBsaW5lU3RhdGUuZW1iZWRkZWRMYW5ndWFnZURhdGE7XG5cdFx0bGV0IHN0YWNrID0gbGluZVN0YXRlLnN0YWNrO1xuXHRcdGxldCBwb3MgPSAwO1xuXG5cdFx0Ly8gcmVndWxhciBleHByZXNzaW9uIGdyb3VwIG1hdGNoaW5nXG5cdFx0Ly8gdGhlc2UgbmV2ZXIgbmVlZCBjbG9uaW5nIG9yIGVxdWFsaXR5IHNpbmNlIHRoZXkgYXJlIG9ubHkgdXNlZCB3aXRoaW4gYSBsaW5lIG1hdGNoXG5cdFx0aW50ZXJmYWNlIEdyb3VwTWF0Y2hpbmcge1xuXHRcdFx0bWF0Y2hlczogc3RyaW5nW107XG5cdFx0XHRydWxlOiBtb25hcmNoQ29tbW9uLklSdWxlIHwgbnVsbDtcblx0XHRcdGdyb3VwczogeyBhY3Rpb246IG1vbmFyY2hDb21tb24uRnV6enlBY3Rpb247IG1hdGNoZWQ6IHN0cmluZyB9W107XG5cdFx0fVxuXHRcdGxldCBncm91cE1hdGNoaW5nOiBHcm91cE1hdGNoaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC9tb25hY28tZWRpdG9yL2lzc3Vlcy8xMjM1XG5cdFx0Ly8gRXZhbHVhdGUgcnVsZXMgYXQgbGVhc3Qgb25jZSBmb3IgYW4gZW1wdHkgbGluZVxuXHRcdGxldCBmb3JjZUV2YWx1YXRpb24gPSB0cnVlO1xuXG5cdFx0d2hpbGUgKGZvcmNlRXZhbHVhdGlvbiB8fCBwb3MgPCBsaW5lTGVuZ3RoKSB7XG5cblx0XHRcdGNvbnN0IHBvczAgPSBwb3M7XG5cdFx0XHRjb25zdCBzdGFja0xlbjAgPSBzdGFjay5kZXB0aDtcblx0XHRcdGNvbnN0IGdyb3VwTGVuMCA9IGdyb3VwTWF0Y2hpbmcgPyBncm91cE1hdGNoaW5nLmdyb3Vwcy5sZW5ndGggOiAwO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGFjay5zdGF0ZTtcblxuXHRcdFx0bGV0IG1hdGNoZXM6IHN0cmluZ1tdIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRsZXQgbWF0Y2hlZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRsZXQgYWN0aW9uOiBtb25hcmNoQ29tbW9uLkZ1enp5QWN0aW9uIHwgbW9uYXJjaENvbW1vbi5GdXp6eUFjdGlvbltdIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRsZXQgcnVsZTogbW9uYXJjaENvbW1vbi5JUnVsZSB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRsZXQgZW50ZXJpbmdFbWJlZGRlZExhbmd1YWdlOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRcdFx0Ly8gY2hlY2sgaWYgd2UgbmVlZCB0byBwcm9jZXNzIGdyb3VwIG1hdGNoZXMgZmlyc3Rcblx0XHRcdGlmIChncm91cE1hdGNoaW5nKSB7XG5cdFx0XHRcdG1hdGNoZXMgPSBncm91cE1hdGNoaW5nLm1hdGNoZXM7XG5cdFx0XHRcdGNvbnN0IGdyb3VwRW50cnkgPSBncm91cE1hdGNoaW5nLmdyb3Vwcy5zaGlmdCgpITtcblx0XHRcdFx0bWF0Y2hlZCA9IGdyb3VwRW50cnkubWF0Y2hlZDtcblx0XHRcdFx0YWN0aW9uID0gZ3JvdXBFbnRyeS5hY3Rpb247XG5cdFx0XHRcdHJ1bGUgPSBncm91cE1hdGNoaW5nLnJ1bGU7XG5cblx0XHRcdFx0Ly8gY2xlYW51cCBpZiBuZWNlc3Nhcnlcblx0XHRcdFx0aWYgKGdyb3VwTWF0Y2hpbmcuZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGdyb3VwTWF0Y2hpbmcgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBvdGhlcndpc2Ugd2UgbWF0Y2ggb24gdGhlIHRva2VuIHN0cmVhbVxuXG5cdFx0XHRcdGlmICghZm9yY2VFdmFsdWF0aW9uICYmIHBvcyA+PSBsaW5lTGVuZ3RoKSB7XG5cdFx0XHRcdFx0Ly8gbm90aGluZyB0byBkb1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yY2VFdmFsdWF0aW9uID0gZmFsc2U7XG5cblx0XHRcdFx0Ly8gZ2V0IHRoZSBydWxlcyBmb3IgdGhpcyBzdGF0ZVxuXHRcdFx0XHRsZXQgcnVsZXM6IG1vbmFyY2hDb21tb24uSVJ1bGVbXSB8IG51bGwgPSB0aGlzLl9sZXhlci50b2tlbml6ZXJbc3RhdGVdO1xuXHRcdFx0XHRpZiAoIXJ1bGVzKSB7XG5cdFx0XHRcdFx0cnVsZXMgPSBtb25hcmNoQ29tbW9uLmZpbmRSdWxlcyh0aGlzLl9sZXhlciwgc3RhdGUpOyAvLyBkbyBwYXJlbnQgbWF0Y2hpbmdcblx0XHRcdFx0XHRpZiAoIXJ1bGVzKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAndG9rZW5pemVyIHN0YXRlIGlzIG5vdCBkZWZpbmVkOiAnICsgc3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHRyeSBlYWNoIHJ1bGUgdW50aWwgd2UgbWF0Y2hcblx0XHRcdFx0Y29uc3QgcmVzdE9mTGluZSA9IGxpbmUuc3Vic3RyKHBvcyk7XG5cdFx0XHRcdGZvciAoY29uc3QgcnVsZSBvZiBydWxlcykge1xuXHRcdFx0XHRcdGlmIChwb3MgPT09IDAgfHwgIXJ1bGUubWF0Y2hPbmx5QXRMaW5lU3RhcnQpIHtcblx0XHRcdFx0XHRcdG1hdGNoZXMgPSByZXN0T2ZMaW5lLm1hdGNoKHJ1bGUucmVzb2x2ZVJlZ2V4KHN0YXRlKSk7XG5cdFx0XHRcdFx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0XHRcdFx0XHRtYXRjaGVkID0gbWF0Y2hlc1swXTtcblx0XHRcdFx0XHRcdFx0YWN0aW9uID0gcnVsZS5hY3Rpb247XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSBtYXRjaGVkICdydWxlJyB3aXRoICdtYXRjaGVzJyBhbmQgJ2FjdGlvbidcblx0XHRcdGlmICghbWF0Y2hlcykge1xuXHRcdFx0XHRtYXRjaGVzID0gWycnXTtcblx0XHRcdFx0bWF0Y2hlZCA9ICcnO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWFjdGlvbikge1xuXHRcdFx0XHQvLyBiYWQ6IHdlIGRpZG4ndCBtYXRjaCBhbnl0aGluZywgYW5kIHRoZXJlIGlzIG5vIGFjdGlvbiB0byB0YWtlXG5cdFx0XHRcdC8vIHdlIG5lZWQgdG8gYWR2YW5jZSB0aGUgc3RyZWFtIG9yIHdlIGdldCBwcm9ncmVzcyB0cm91YmxlXG5cdFx0XHRcdGlmIChwb3MgPCBsaW5lTGVuZ3RoKSB7XG5cdFx0XHRcdFx0bWF0Y2hlcyA9IFtsaW5lLmNoYXJBdChwb3MpXTtcblx0XHRcdFx0XHRtYXRjaGVkID0gbWF0Y2hlc1swXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhY3Rpb24gPSB0aGlzLl9sZXhlci5kZWZhdWx0VG9rZW47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtYXRjaGVkID09PSBudWxsKSB7XG5cdFx0XHRcdC8vIHNob3VsZCBuZXZlciBoYXBwZW4sIG5lZWRlZCBmb3Igc3RyaWN0IG51bGwgY2hlY2tpbmdcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGFkdmFuY2Ugc3RyZWFtXG5cdFx0XHRwb3MgKz0gbWF0Y2hlZC5sZW5ndGg7XG5cblx0XHRcdC8vIG1heWJlIGNhbGwgYWN0aW9uIGZ1bmN0aW9uICh1c2VkIGZvciAnY2FzZXMnKVxuXHRcdFx0d2hpbGUgKG1vbmFyY2hDb21tb24uaXNGdXp6eUFjdGlvbihhY3Rpb24pICYmIG1vbmFyY2hDb21tb24uaXNJQWN0aW9uKGFjdGlvbikgJiYgYWN0aW9uLnRlc3QpIHtcblx0XHRcdFx0YWN0aW9uID0gYWN0aW9uLnRlc3QobWF0Y2hlZCwgbWF0Y2hlcywgc3RhdGUsIHBvcyA9PT0gbGluZUxlbmd0aCk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCByZXN1bHQ6IG1vbmFyY2hDb21tb24uRnV6enlBY3Rpb24gfCBtb25hcmNoQ29tbW9uLkZ1enp5QWN0aW9uW10gfCBudWxsID0gbnVsbDtcblx0XHRcdC8vIHNldCB0aGUgcmVzdWx0OiBlaXRoZXIgYSBzdHJpbmcgb3IgYW4gYXJyYXkgb2YgYWN0aW9uc1xuXHRcdFx0aWYgKHR5cGVvZiBhY3Rpb24gPT09ICdzdHJpbmcnIHx8IEFycmF5LmlzQXJyYXkoYWN0aW9uKSkge1xuXHRcdFx0XHRyZXN1bHQgPSBhY3Rpb247XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5ncm91cCkge1xuXHRcdFx0XHRyZXN1bHQgPSBhY3Rpb24uZ3JvdXA7XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi50b2tlbiAhPT0gbnVsbCAmJiBhY3Rpb24udG9rZW4gIT09IHVuZGVmaW5lZCkge1xuXG5cdFx0XHRcdC8vIGRvICRuIHJlcGxhY2VtZW50cz9cblx0XHRcdFx0aWYgKGFjdGlvbi50b2tlblN1YnN0KSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gbW9uYXJjaENvbW1vbi5zdWJzdGl0dXRlTWF0Y2hlcyh0aGlzLl9sZXhlciwgYWN0aW9uLnRva2VuLCBtYXRjaGVkLCBtYXRjaGVzLCBzdGF0ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYWN0aW9uLnRva2VuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gZW50ZXIgZW1iZWRkZWQgbGFuZ3VhZ2U/XG5cdFx0XHRcdGlmIChhY3Rpb24ubmV4dEVtYmVkZGVkKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5uZXh0RW1iZWRkZWQgPT09ICdAcG9wJykge1xuXHRcdFx0XHRcdFx0aWYgKCFlbWJlZGRlZExhbmd1YWdlRGF0YSkge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAnY2Fubm90IHBvcCBlbWJlZGRlZCBsYW5ndWFnZSBpZiBub3QgaW5zaWRlIG9uZScpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZW1iZWRkZWRMYW5ndWFnZURhdGEgPSBudWxsO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZW1iZWRkZWRMYW5ndWFnZURhdGEpIHtcblx0XHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IodGhpcy5fbGV4ZXIsICdjYW5ub3QgZW50ZXIgZW1iZWRkZWQgbGFuZ3VhZ2UgZnJvbSB3aXRoaW4gYW4gZW1iZWRkZWQgbGFuZ3VhZ2UnKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZW50ZXJpbmdFbWJlZGRlZExhbmd1YWdlID0gbW9uYXJjaENvbW1vbi5zdWJzdGl0dXRlTWF0Y2hlcyh0aGlzLl9sZXhlciwgYWN0aW9uLm5leHRFbWJlZGRlZCwgbWF0Y2hlZCwgbWF0Y2hlcywgc3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHN0YXRlIHRyYW5zZm9ybWF0aW9uc1xuXHRcdFx0XHRpZiAoYWN0aW9uLmdvQmFjaykgeyAvLyBiYWNrIHVwIHRoZSBzdHJlYW0uLlxuXHRcdFx0XHRcdHBvcyA9IE1hdGgubWF4KDAsIHBvcyAtIGFjdGlvbi5nb0JhY2spO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFjdGlvbi5zd2l0Y2hUbyAmJiB0eXBlb2YgYWN0aW9uLnN3aXRjaFRvID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGxldCBuZXh0U3RhdGUgPSBtb25hcmNoQ29tbW9uLnN1YnN0aXR1dGVNYXRjaGVzKHRoaXMuX2xleGVyLCBhY3Rpb24uc3dpdGNoVG8sIG1hdGNoZWQsIG1hdGNoZXMsIHN0YXRlKTsgIC8vIHN3aXRjaCBzdGF0ZSB3aXRob3V0IGEgcHVzaC4uLlxuXHRcdFx0XHRcdGlmIChuZXh0U3RhdGVbMF0gPT09ICdAJykge1xuXHRcdFx0XHRcdFx0bmV4dFN0YXRlID0gbmV4dFN0YXRlLnN1YnN0cigxKTsgLy8gcGVlbCBvZmYgc3RhcnRpbmcgJ0AnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghbW9uYXJjaENvbW1vbi5maW5kUnVsZXModGhpcy5fbGV4ZXIsIG5leHRTdGF0ZSkpIHtcblx0XHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IodGhpcy5fbGV4ZXIsICd0cnlpbmcgdG8gc3dpdGNoIHRvIGEgc3RhdGUgXFwnJyArIG5leHRTdGF0ZSArICdcXCcgdGhhdCBpcyB1bmRlZmluZWQgaW4gcnVsZTogJyArIHRoaXMuX3NhZmVSdWxlTmFtZShydWxlKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHN0YWNrID0gc3RhY2suc3dpdGNoVG8obmV4dFN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLnRyYW5zZm9ybSAmJiB0eXBlb2YgYWN0aW9uLnRyYW5zZm9ybSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IodGhpcy5fbGV4ZXIsICdhY3Rpb24udHJhbnNmb3JtIG5vdCBzdXBwb3J0ZWQnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24ubmV4dCkge1xuXHRcdFx0XHRcdGlmIChhY3Rpb24ubmV4dCA9PT0gJ0BwdXNoJykge1xuXHRcdFx0XHRcdFx0aWYgKHN0YWNrLmRlcHRoID49IHRoaXMuX2xleGVyLm1heFN0YWNrKSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IodGhpcy5fbGV4ZXIsICdtYXhpbXVtIHRva2VuaXplciBzdGFjayBzaXplIHJlYWNoZWQ6IFsnICtcblx0XHRcdFx0XHRcdFx0XHRzdGFjay5zdGF0ZSArICcsJyArIHN0YWNrLnBhcmVudCEuc3RhdGUgKyAnLC4uLl0nKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHN0YWNrID0gc3RhY2sucHVzaChzdGF0ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24ubmV4dCA9PT0gJ0Bwb3AnKSB7XG5cdFx0XHRcdFx0XHRpZiAoc3RhY2suZGVwdGggPD0gMSkge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAndHJ5aW5nIHRvIHBvcCBhbiBlbXB0eSBzdGFjayBpbiBydWxlOiAnICsgdGhpcy5fc2FmZVJ1bGVOYW1lKHJ1bGUpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHN0YWNrID0gc3RhY2sucG9wKCkhO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLm5leHQgPT09ICdAcG9wYWxsJykge1xuXHRcdFx0XHRcdFx0c3RhY2sgPSBzdGFjay5wb3BhbGwoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bGV0IG5leHRTdGF0ZSA9IG1vbmFyY2hDb21tb24uc3Vic3RpdHV0ZU1hdGNoZXModGhpcy5fbGV4ZXIsIGFjdGlvbi5uZXh0LCBtYXRjaGVkLCBtYXRjaGVzLCBzdGF0ZSk7XG5cdFx0XHRcdFx0XHRpZiAobmV4dFN0YXRlWzBdID09PSAnQCcpIHtcblx0XHRcdFx0XHRcdFx0bmV4dFN0YXRlID0gbmV4dFN0YXRlLnN1YnN0cigxKTsgLy8gcGVlbCBvZmYgc3RhcnRpbmcgJ0AnXG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICghbW9uYXJjaENvbW1vbi5maW5kUnVsZXModGhpcy5fbGV4ZXIsIG5leHRTdGF0ZSkpIHtcblx0XHRcdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ3RyeWluZyB0byBzZXQgYSBuZXh0IHN0YXRlIFxcJycgKyBuZXh0U3RhdGUgKyAnXFwnIHRoYXQgaXMgdW5kZWZpbmVkIGluIHJ1bGU6ICcgKyB0aGlzLl9zYWZlUnVsZU5hbWUocnVsZSkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c3RhY2sgPSBzdGFjay5wdXNoKG5leHRTdGF0ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFjdGlvbi5sb2cgJiYgdHlwZW9mIChhY3Rpb24ubG9nKSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRtb25hcmNoQ29tbW9uLmxvZyh0aGlzLl9sZXhlciwgdGhpcy5fbGV4ZXIubGFuZ3VhZ2VJZCArICc6ICcgKyBtb25hcmNoQ29tbW9uLnN1YnN0aXR1dGVNYXRjaGVzKHRoaXMuX2xleGVyLCBhY3Rpb24ubG9nLCBtYXRjaGVkLCBtYXRjaGVzLCBzdGF0ZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNoZWNrIHJlc3VsdFxuXHRcdFx0aWYgKHJlc3VsdCA9PT0gbnVsbCkge1xuXHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAnbGV4ZXIgcnVsZSBoYXMgbm8gd2VsbC1kZWZpbmVkIGFjdGlvbiBpbiBydWxlOiAnICsgdGhpcy5fc2FmZVJ1bGVOYW1lKHJ1bGUpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29tcHV0ZU5ld1N0YXRlRm9yRW1iZWRkZWRMYW5ndWFnZSA9IChlbnRlcmluZ0VtYmVkZGVkTGFuZ3VhZ2U6IHN0cmluZykgPT4ge1xuXHRcdFx0XHQvLyBzdXBwb3J0IGxhbmd1YWdlIG5hbWVzLCBtaW1lIHR5cGVzLCBhbmQgbGFuZ3VhZ2UgaWRzXG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAoXG5cdFx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZShlbnRlcmluZ0VtYmVkZGVkTGFuZ3VhZ2UpXG5cdFx0XHRcdFx0fHwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeU1pbWVUeXBlKGVudGVyaW5nRW1iZWRkZWRMYW5ndWFnZSlcblx0XHRcdFx0XHR8fCBlbnRlcmluZ0VtYmVkZGVkTGFuZ3VhZ2Vcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRjb25zdCBlbWJlZGRlZExhbmd1YWdlRGF0YSA9IHRoaXMuX2dldE5lc3RlZEVtYmVkZGVkTGFuZ3VhZ2VEYXRhKGxhbmd1YWdlSWQpO1xuXG5cdFx0XHRcdGlmIChwb3MgPCBsaW5lTGVuZ3RoKSB7XG5cdFx0XHRcdFx0Ly8gdGhlcmUgaXMgY29udGVudCBmcm9tIHRoZSBlbWJlZGRlZCBsYW5ndWFnZSBvbiB0aGlzIGxpbmVcblx0XHRcdFx0XHRjb25zdCByZXN0T2ZMaW5lID0gbGluZVdpdGhvdXRMRi5zdWJzdHIocG9zKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fbmVzdGVkVG9rZW5pemUocmVzdE9mTGluZSwgaGFzRU9MLCBNb25hcmNoTGluZVN0YXRlRmFjdG9yeS5jcmVhdGUoc3RhY2ssIGVtYmVkZGVkTGFuZ3VhZ2VEYXRhKSwgb2Zmc2V0RGVsdGEgKyBwb3MsIHRva2Vuc0NvbGxlY3Rvcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIE1vbmFyY2hMaW5lU3RhdGVGYWN0b3J5LmNyZWF0ZShzdGFjaywgZW1iZWRkZWRMYW5ndWFnZURhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBpcyB0aGUgcmVzdWx0IGEgZ3JvdXAgbWF0Y2g/XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XG5cdFx0XHRcdGlmIChncm91cE1hdGNoaW5nICYmIGdyb3VwTWF0Y2hpbmcuZ3JvdXBzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAnZ3JvdXBzIGNhbm5vdCBiZSBuZXN0ZWQ6ICcgKyB0aGlzLl9zYWZlUnVsZU5hbWUocnVsZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtYXRjaGVzLmxlbmd0aCAhPT0gcmVzdWx0Lmxlbmd0aCArIDEpIHtcblx0XHRcdFx0XHR0aHJvdyBtb25hcmNoQ29tbW9uLmNyZWF0ZUVycm9yKHRoaXMuX2xleGVyLCAnbWF0Y2hlZCBudW1iZXIgb2YgZ3JvdXBzIGRvZXMgbm90IG1hdGNoIHRoZSBudW1iZXIgb2YgYWN0aW9ucyBpbiBydWxlOiAnICsgdGhpcy5fc2FmZVJ1bGVOYW1lKHJ1bGUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgdG90YWxMZW4gPSAwO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHR0b3RhbExlbiArPSBtYXRjaGVzW2ldLmxlbmd0aDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodG90YWxMZW4gIT09IG1hdGNoZWQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ3dpdGggZ3JvdXBzLCBhbGwgY2hhcmFjdGVycyBzaG91bGQgYmUgbWF0Y2hlZCBpbiBjb25zZWN1dGl2ZSBncm91cHMgaW4gcnVsZTogJyArIHRoaXMuX3NhZmVSdWxlTmFtZShydWxlKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRncm91cE1hdGNoaW5nID0ge1xuXHRcdFx0XHRcdHJ1bGU6IHJ1bGUsXG5cdFx0XHRcdFx0bWF0Y2hlczogbWF0Y2hlcyxcblx0XHRcdFx0XHRncm91cHM6IFtdXG5cdFx0XHRcdH07XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Z3JvdXBNYXRjaGluZy5ncm91cHNbaV0gPSB7XG5cdFx0XHRcdFx0XHRhY3Rpb246IHJlc3VsdFtpXSxcblx0XHRcdFx0XHRcdG1hdGNoZWQ6IG1hdGNoZXNbaSArIDFdXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHBvcyAtPSBtYXRjaGVkLmxlbmd0aDtcblx0XHRcdFx0Ly8gY2FsbCByZWN1cnNpdmVseSB0byBpbml0aWF0ZSBmaXJzdCByZXN1bHQgbWF0Y2hcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyByZWd1bGFyIHJlc3VsdFxuXG5cdFx0XHRcdC8vIGNoZWNrIGZvciAnQHJlbWF0Y2gnXG5cdFx0XHRcdGlmIChyZXN1bHQgPT09ICdAcmVtYXRjaCcpIHtcblx0XHRcdFx0XHRwb3MgLT0gbWF0Y2hlZC5sZW5ndGg7XG5cdFx0XHRcdFx0bWF0Y2hlZCA9ICcnOyAgLy8gYmV0dGVyIHNldCB0aGUgbmV4dCBzdGF0ZSB0b28uLlxuXHRcdFx0XHRcdG1hdGNoZXMgPSBudWxsO1xuXHRcdFx0XHRcdHJlc3VsdCA9ICcnO1xuXG5cdFx0XHRcdFx0Ly8gRXZlbiB0aG91Z2ggYEByZW1hdGNoYCB3YXMgc3BlY2lmaWVkLCBpZiBgbmV4dEVtYmVkZGVkYCBhbHNvIHNwZWNpZmllZCxcblx0XHRcdFx0XHQvLyBhIHN0YXRlIHRyYW5zaXRpb24gc2hvdWxkIG9jY3VyLlxuXHRcdFx0XHRcdGlmIChlbnRlcmluZ0VtYmVkZGVkTGFuZ3VhZ2UgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjb21wdXRlTmV3U3RhdGVGb3JFbWJlZGRlZExhbmd1YWdlKGVudGVyaW5nRW1iZWRkZWRMYW5ndWFnZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gY2hlY2sgcHJvZ3Jlc3Ncblx0XHRcdFx0aWYgKG1hdGNoZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0aWYgKGxpbmVMZW5ndGggPT09IDAgfHwgc3RhY2tMZW4wICE9PSBzdGFjay5kZXB0aCB8fCBzdGF0ZSAhPT0gc3RhY2suc3RhdGUgfHwgKCFncm91cE1hdGNoaW5nID8gMCA6IGdyb3VwTWF0Y2hpbmcuZ3JvdXBzLmxlbmd0aCkgIT09IGdyb3VwTGVuMCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRocm93IG1vbmFyY2hDb21tb24uY3JlYXRlRXJyb3IodGhpcy5fbGV4ZXIsICdubyBwcm9ncmVzcyBpbiB0b2tlbml6ZXIgaW4gcnVsZTogJyArIHRoaXMuX3NhZmVSdWxlTmFtZShydWxlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gcmV0dXJuIHRoZSByZXN1bHQgKGFuZCBjaGVjayBmb3IgYnJhY2UgbWF0Y2hpbmcpXG5cdFx0XHRcdC8vIHRvZG86IGZvciBlZmZpY2llbmN5IHdlIGNvdWxkIHByZS1zYW5pdGl6ZSB0b2tlblBvc3RmaXggYW5kIHN1YnN0aXR1dGlvbnNcblx0XHRcdFx0bGV0IHRva2VuVHlwZTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRcdGlmIChtb25hcmNoQ29tbW9uLmlzU3RyaW5nKHJlc3VsdCkgJiYgcmVzdWx0LmluZGV4T2YoJ0BicmFja2V0cycpID09PSAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdCA9IHJlc3VsdC5zdWJzdHIoJ0BicmFja2V0cycubGVuZ3RoKTtcblx0XHRcdFx0XHRjb25zdCBicmFja2V0ID0gZmluZEJyYWNrZXQodGhpcy5fbGV4ZXIsIG1hdGNoZWQpO1xuXHRcdFx0XHRcdGlmICghYnJhY2tldCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbW9uYXJjaENvbW1vbi5jcmVhdGVFcnJvcih0aGlzLl9sZXhlciwgJ0BicmFja2V0cyB0b2tlbiByZXR1cm5lZCBidXQgbm8gYnJhY2tldCBkZWZpbmVkIGFzOiAnICsgbWF0Y2hlZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRva2VuVHlwZSA9IG1vbmFyY2hDb21tb24uc2FuaXRpemUoYnJhY2tldC50b2tlbiArIHJlc3QpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHRva2VuID0gKHJlc3VsdCA9PT0gJycgPyAnJyA6IHJlc3VsdCArIHRoaXMuX2xleGVyLnRva2VuUG9zdGZpeCk7XG5cdFx0XHRcdFx0dG9rZW5UeXBlID0gbW9uYXJjaENvbW1vbi5zYW5pdGl6ZSh0b2tlbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocG9zMCA8IGxpbmVXaXRob3V0TEZMZW5ndGgpIHtcblx0XHRcdFx0XHR0b2tlbnNDb2xsZWN0b3IuZW1pdChwb3MwICsgb2Zmc2V0RGVsdGEsIHRva2VuVHlwZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGVudGVyaW5nRW1iZWRkZWRMYW5ndWFnZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRyZXR1cm4gY29tcHV0ZU5ld1N0YXRlRm9yRW1iZWRkZWRMYW5ndWFnZShlbnRlcmluZ0VtYmVkZGVkTGFuZ3VhZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBNb25hcmNoTGluZVN0YXRlRmFjdG9yeS5jcmVhdGUoc3RhY2ssIGVtYmVkZGVkTGFuZ3VhZ2VEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE5lc3RlZEVtYmVkZGVkTGFuZ3VhZ2VEYXRhKGxhbmd1YWdlSWQ6IHN0cmluZyk6IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhIHtcblx0XHRpZiAoIXRoaXMuX2xhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IEVtYmVkZGVkTGFuZ3VhZ2VEYXRhKGxhbmd1YWdlSWQsIE51bGxTdGF0ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGxhbmd1YWdlSWQgIT09IHRoaXMuX2xhbmd1YWdlSWQpIHtcblx0XHRcdC8vIEZpcmUgbGFuZ3VhZ2UgbG9hZGluZyBldmVudFxuXHRcdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLnJlcXVlc3RCYXNpY0xhbmd1YWdlRmVhdHVyZXMobGFuZ3VhZ2VJZCk7XG5cdFx0XHRsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0T3JDcmVhdGUobGFuZ3VhZ2VJZCk7XG5cdFx0XHR0aGlzLl9lbWJlZGRlZExhbmd1YWdlc1tsYW5ndWFnZUlkXSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydCA9IGxhbmd1YWdlcy5Ub2tlbml6YXRpb25SZWdpc3RyeS5nZXQobGFuZ3VhZ2VJZCk7XG5cdFx0aWYgKHRva2VuaXphdGlvblN1cHBvcnQpIHtcblx0XHRcdHJldHVybiBuZXcgRW1iZWRkZWRMYW5ndWFnZURhdGEobGFuZ3VhZ2VJZCwgdG9rZW5pemF0aW9uU3VwcG9ydC5nZXRJbml0aWFsU3RhdGUoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBFbWJlZGRlZExhbmd1YWdlRGF0YShsYW5ndWFnZUlkLCBOdWxsU3RhdGUpO1xuXHR9XG59XG5cbi8qKlxuICogU2VhcmNoZXMgZm9yIGEgYnJhY2tldCBpbiB0aGUgJ2JyYWNrZXRzJyBhdHRyaWJ1dGUgdGhhdCBtYXRjaGVzIHRoZSBpbnB1dC5cbiAqL1xuZnVuY3Rpb24gZmluZEJyYWNrZXQobGV4ZXI6IG1vbmFyY2hDb21tb24uSUxleGVyLCBtYXRjaGVkOiBzdHJpbmcpIHtcblx0aWYgKCFtYXRjaGVkKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0bWF0Y2hlZCA9IG1vbmFyY2hDb21tb24uZml4Q2FzZShsZXhlciwgbWF0Y2hlZCk7XG5cblx0Y29uc3QgYnJhY2tldHMgPSBsZXhlci5icmFja2V0cztcblx0Zm9yIChjb25zdCBicmFja2V0IG9mIGJyYWNrZXRzKSB7XG5cdFx0aWYgKGJyYWNrZXQub3BlbiA9PT0gbWF0Y2hlZCkge1xuXHRcdFx0cmV0dXJuIHsgdG9rZW46IGJyYWNrZXQudG9rZW4sIGJyYWNrZXRUeXBlOiBtb25hcmNoQ29tbW9uLk1vbmFyY2hCcmFja2V0Lk9wZW4gfTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAoYnJhY2tldC5jbG9zZSA9PT0gbWF0Y2hlZCkge1xuXHRcdFx0cmV0dXJuIHsgdG9rZW46IGJyYWNrZXQudG9rZW4sIGJyYWNrZXRUeXBlOiBtb25hcmNoQ29tbW9uLk1vbmFyY2hCcmFja2V0LkNsb3NlIH07XG5cdFx0fVxuXHR9XG5cdHJldHVybiBudWxsO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFVQSxTQUFTLGtCQUErQjtBQUN4QyxZQUFZLGVBQWU7QUFDM0IsU0FBUyxXQUFXLHFCQUFxQixvQkFBb0I7QUFHN0QsWUFBWSxtQkFBbUI7QUFFL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxZQUFZLHNCQUFzQjtBQUUzQyxNQUFNLG9CQUFvQjtBQUsxQixNQUFNLDhCQUFOLE1BQU0sNEJBQTJCO0FBQUEsRUFHaEMsT0FBYyxPQUFPLFFBQW9DLE9BQW9DO0FBQzVGLFdBQU8sS0FBSyxVQUFVLE9BQU8sUUFBUSxLQUFLO0FBQUEsRUFDM0M7QUFBQSxFQUtBLFlBQVksZUFBdUI7QUFDbEMsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxXQUFXLHVCQUFPLE9BQU8sSUFBSTtBQUFBLEVBQ25DO0FBQUEsRUFFTyxPQUFPLFFBQW9DLE9BQW9DO0FBQ3JGLFFBQUksV0FBVyxRQUFRLE9BQU8sU0FBUyxLQUFLLGdCQUFnQjtBQUUzRCxhQUFPLElBQUksb0JBQW9CLFFBQVEsS0FBSztBQUFBLElBQzdDO0FBQ0EsUUFBSSxpQkFBaUIsb0JBQW9CLGtCQUFrQixNQUFNO0FBQ2pFLFFBQUksZUFBZSxTQUFTLEdBQUc7QUFDOUIsd0JBQWtCO0FBQUEsSUFDbkI7QUFDQSxzQkFBa0I7QUFFbEIsUUFBSSxTQUFTLEtBQUssU0FBUyxjQUFjO0FBQ3pDLFFBQUksUUFBUTtBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsYUFBUyxJQUFJLG9CQUFvQixRQUFRLEtBQUs7QUFDOUMsU0FBSyxTQUFTLGNBQWMsSUFBSTtBQUNoQyxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBbENNLDRCQUVtQixZQUFZLElBQUksNEJBQTJCLGlCQUFpQjtBQUZyRixJQUFNLDZCQUFOO0FBb0NBLE1BQU0sb0JBQW9CO0FBQUEsRUFNekIsWUFBWSxRQUFvQyxPQUFlO0FBQzlELFNBQUssU0FBUztBQUNkLFNBQUssUUFBUTtBQUNiLFNBQUssU0FBUyxLQUFLLFNBQVMsS0FBSyxPQUFPLFFBQVEsS0FBSztBQUFBLEVBQ3REO0FBQUEsRUFFQSxPQUFjLGtCQUFrQixTQUE2QztBQUM1RSxRQUFJLFNBQVM7QUFDYixXQUFPLFlBQVksTUFBTTtBQUN4QixVQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3RCLGtCQUFVO0FBQUEsTUFDWDtBQUNBLGdCQUFVLFFBQVE7QUFDbEIsZ0JBQVUsUUFBUTtBQUFBLElBQ25CO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQWUsUUFBUSxHQUErQixHQUF3QztBQUM3RixXQUFPLE1BQU0sUUFBUSxNQUFNLE1BQU07QUFDaEMsVUFBSSxNQUFNLEdBQUc7QUFDWixlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUksRUFBRSxVQUFVLEVBQUUsT0FBTztBQUN4QixlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUksRUFBRTtBQUNOLFVBQUksRUFBRTtBQUFBLElBQ1A7QUFDQSxRQUFJLE1BQU0sUUFBUSxNQUFNLE1BQU07QUFDN0IsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sT0FBTyxPQUFxQztBQUNsRCxXQUFPLG9CQUFvQixRQUFRLE1BQU0sS0FBSztBQUFBLEVBQy9DO0FBQUEsRUFFTyxLQUFLLE9BQW9DO0FBQy9DLFdBQU8sMkJBQTJCLE9BQU8sTUFBTSxLQUFLO0FBQUEsRUFDckQ7QUFBQSxFQUVPLE1BQWtDO0FBQ3hDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLFNBQThCO0FBQ3BDLFFBQUksU0FBOEI7QUFDbEMsV0FBTyxPQUFPLFFBQVE7QUFDckIsZUFBUyxPQUFPO0FBQUEsSUFDakI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sU0FBUyxPQUFvQztBQUNuRCxXQUFPLDJCQUEyQixPQUFPLEtBQUssUUFBUSxLQUFLO0FBQUEsRUFDNUQ7QUFDRDtBQUVBLE1BQU0scUJBQXFCO0FBQUEsRUFJMUIsWUFBWSxZQUFvQixPQUF5QjtBQUN4RCxTQUFLLGFBQWE7QUFDbEIsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRU8sT0FBTyxPQUFzQztBQUNuRCxXQUNDLEtBQUssZUFBZSxNQUFNLGNBQ3ZCLEtBQUssTUFBTSxPQUFPLE1BQU0sS0FBSztBQUFBLEVBRWxDO0FBQUEsRUFFTyxRQUE4QjtBQUNwQyxVQUFNLGFBQWEsS0FBSyxNQUFNLE1BQU07QUFFcEMsUUFBSSxlQUFlLEtBQUssT0FBTztBQUM5QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sSUFBSSxxQkFBcUIsS0FBSyxZQUFZLEtBQUssS0FBSztBQUFBLEVBQzVEO0FBQ0Q7QUFLQSxNQUFNLDJCQUFOLE1BQU0seUJBQXdCO0FBQUEsRUFHN0IsT0FBYyxPQUFPLE9BQTRCLHNCQUFxRTtBQUNySCxXQUFPLEtBQUssVUFBVSxPQUFPLE9BQU8sb0JBQW9CO0FBQUEsRUFDekQ7QUFBQSxFQUtBLFlBQVksZUFBdUI7QUFDbEMsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxXQUFXLHVCQUFPLE9BQU8sSUFBSTtBQUFBLEVBQ25DO0FBQUEsRUFFTyxPQUFPLE9BQTRCLHNCQUFxRTtBQUM5RyxRQUFJLHlCQUF5QixNQUFNO0FBRWxDLGFBQU8sSUFBSSxpQkFBaUIsT0FBTyxvQkFBb0I7QUFBQSxJQUN4RDtBQUNBLFFBQUksVUFBVSxRQUFRLE1BQU0sU0FBUyxLQUFLLGdCQUFnQjtBQUV6RCxhQUFPLElBQUksaUJBQWlCLE9BQU8sb0JBQW9CO0FBQUEsSUFDeEQ7QUFDQSxVQUFNLGlCQUFpQixvQkFBb0Isa0JBQWtCLEtBQUs7QUFFbEUsUUFBSSxTQUFTLEtBQUssU0FBUyxjQUFjO0FBQ3pDLFFBQUksUUFBUTtBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsYUFBUyxJQUFJLGlCQUFpQixPQUFPLElBQUk7QUFDekMsU0FBSyxTQUFTLGNBQWMsSUFBSTtBQUNoQyxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBbENNLHlCQUVtQixZQUFZLElBQUkseUJBQXdCLGlCQUFpQjtBQUZsRixJQUFNLDBCQUFOO0FBb0NBLE1BQU0saUJBQTZDO0FBQUEsRUFLbEQsWUFDQyxPQUNBLHNCQUNDO0FBQ0QsU0FBSyxRQUFRO0FBQ2IsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUFBLEVBRU8sUUFBMEI7QUFDaEMsVUFBTSw0QkFBNEIsS0FBSyx1QkFBdUIsS0FBSyxxQkFBcUIsTUFBTSxJQUFJO0FBRWxHLFFBQUksOEJBQThCLEtBQUssc0JBQXNCO0FBQzVELGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyx3QkFBd0IsT0FBTyxLQUFLLE9BQU8sS0FBSyxvQkFBb0I7QUFBQSxFQUM1RTtBQUFBLEVBRU8sT0FBTyxPQUFrQztBQUMvQyxRQUFJLEVBQUUsaUJBQWlCLG1CQUFtQjtBQUN6QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxLQUFLLE1BQU0sT0FBTyxNQUFNLEtBQUssR0FBRztBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyx5QkFBeUIsUUFBUSxNQUFNLHlCQUF5QixNQUFNO0FBQzlFLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLHlCQUF5QixRQUFRLE1BQU0seUJBQXlCLE1BQU07QUFDOUUsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUsscUJBQXFCLE9BQU8sTUFBTSxvQkFBb0I7QUFBQSxFQUNuRTtBQUNEO0FBUUEsTUFBTSw4QkFBaUU7QUFBQSxFQU90RSxjQUFjO0FBQ2IsU0FBSyxVQUFVLENBQUM7QUFDaEIsU0FBSyxjQUFjO0FBQ25CLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUsscUJBQXFCO0FBQUEsRUFDM0I7QUFBQSxFQUVPLGNBQWMsWUFBMEI7QUFDOUMsU0FBSyxjQUFjO0FBQUEsRUFDcEI7QUFBQSxFQUVPLEtBQUssYUFBcUIsTUFBb0I7QUFDcEQsUUFBSSxLQUFLLG1CQUFtQixRQUFRLEtBQUssdUJBQXVCLEtBQUssYUFBYTtBQUNqRjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGlCQUFpQjtBQUN0QixTQUFLLHFCQUFxQixLQUFLO0FBQy9CLFNBQUssUUFBUSxLQUFLLElBQUksVUFBVSxNQUFNLGFBQWEsTUFBTSxLQUFLLFdBQVksQ0FBQztBQUFBLEVBQzVFO0FBQUEsRUFFTyx1QkFBdUIsc0JBQThCLFFBQWlCLHNCQUE0QyxhQUF1QztBQUMvSixVQUFNLG1CQUFtQixxQkFBcUI7QUFDOUMsVUFBTSxvQkFBb0IscUJBQXFCO0FBRS9DLFVBQU0sb0NBQW9DLFVBQVUscUJBQXFCLElBQUksZ0JBQWdCO0FBQzdGLFFBQUksQ0FBQyxtQ0FBbUM7QUFDdkMsV0FBSyxjQUFjLGdCQUFnQjtBQUNuQyxXQUFLLEtBQUssYUFBYSxFQUFFO0FBQ3pCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxlQUFlLGtDQUFrQyxTQUFTLHNCQUFzQixRQUFRLGlCQUFpQjtBQUMvRyxRQUFJLGdCQUFnQixHQUFHO0FBQ3RCLGlCQUFXLFNBQVMsYUFBYSxRQUFRO0FBQ3hDLGFBQUssUUFBUSxLQUFLLElBQUksVUFBVSxNQUFNLE1BQU0sU0FBUyxhQUFhLE1BQU0sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQzlGO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyxVQUFVLEtBQUssUUFBUSxPQUFPLGFBQWEsTUFBTTtBQUFBLElBQ3ZEO0FBQ0EsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyxjQUFjO0FBQ25CLFdBQU8sYUFBYTtBQUFBLEVBQ3JCO0FBQUEsRUFFTyxTQUFTLFVBQTBEO0FBQ3pFLFdBQU8sSUFBSSxVQUFVLG1CQUFtQixLQUFLLFNBQVMsUUFBUTtBQUFBLEVBQy9EO0FBQ0Q7QUFFQSxNQUFNLDZCQUFnRTtBQUFBLEVBU3JFLFlBQVksaUJBQW1DLE9BQW1CO0FBQ2pFLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssU0FBUztBQUNkLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssVUFBVSxDQUFDO0FBQ2hCLFNBQUsscUJBQXFCLFdBQVc7QUFDckMsU0FBSyxxQkFBcUI7QUFBQSxFQUMzQjtBQUFBLEVBRU8sY0FBYyxZQUEwQjtBQUM5QyxTQUFLLHFCQUFxQixLQUFLLGlCQUFpQixnQkFBZ0IsaUJBQWlCLFVBQVU7QUFBQSxFQUM1RjtBQUFBLEVBRU8sS0FBSyxhQUFxQixNQUFvQjtBQUNwRCxVQUFNLFdBQVcsS0FBSyxPQUFPLE1BQU0sS0FBSyxvQkFBb0IsSUFBSSxJQUFJLGVBQWU7QUFDbkYsUUFBSSxLQUFLLHVCQUF1QixVQUFVO0FBQ3pDO0FBQUEsSUFDRDtBQUNBLFNBQUsscUJBQXFCO0FBQzFCLFNBQUssUUFBUSxLQUFLLFdBQVc7QUFDN0IsU0FBSyxRQUFRLEtBQUssUUFBUTtBQUFBLEVBQzNCO0FBQUEsRUFFQSxPQUFlLE9BQU8sR0FBdUIsR0FBYSxHQUFvQztBQUM3RixVQUFNLE9BQVEsTUFBTSxPQUFPLEVBQUUsU0FBUztBQUN0QyxVQUFNLE9BQU8sRUFBRTtBQUNmLFVBQU0sT0FBUSxNQUFNLE9BQU8sRUFBRSxTQUFTO0FBRXRDLFFBQUksU0FBUyxLQUFLLFNBQVMsS0FBSyxTQUFTLEdBQUc7QUFDM0MsYUFBTyxJQUFJLFlBQVksQ0FBQztBQUFBLElBQ3pCO0FBQ0EsUUFBSSxTQUFTLEtBQUssU0FBUyxHQUFHO0FBQzdCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxTQUFTLEtBQUssU0FBUyxHQUFHO0FBQzdCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxTQUFTLElBQUksWUFBWSxPQUFPLE9BQU8sSUFBSTtBQUNqRCxRQUFJLE1BQU0sTUFBTTtBQUNmLGFBQU8sSUFBSSxDQUFDO0FBQUEsSUFDYjtBQUNBLGFBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxLQUFLO0FBQzlCLGFBQU8sT0FBTyxDQUFDLElBQUksRUFBRSxDQUFDO0FBQUEsSUFDdkI7QUFDQSxRQUFJLE1BQU0sTUFBTTtBQUNmLGFBQU8sSUFBSSxHQUFHLE9BQU8sSUFBSTtBQUFBLElBQzFCO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLHVCQUF1QixzQkFBOEIsUUFBaUIsc0JBQTRDLGFBQXVDO0FBQy9KLFVBQU0sbUJBQW1CLHFCQUFxQjtBQUM5QyxVQUFNLG9CQUFvQixxQkFBcUI7QUFFL0MsVUFBTSxvQ0FBb0MsVUFBVSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDN0YsUUFBSSxDQUFDLG1DQUFtQztBQUN2QyxXQUFLLGNBQWMsZ0JBQWdCO0FBQ25DLFdBQUssS0FBSyxhQUFhLEVBQUU7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGVBQWUsa0NBQWtDLGdCQUFnQixzQkFBc0IsUUFBUSxpQkFBaUI7QUFDdEgsUUFBSSxnQkFBZ0IsR0FBRztBQUN0QixlQUFTLElBQUksR0FBRyxNQUFNLGFBQWEsT0FBTyxRQUFRLElBQUksS0FBSyxLQUFLLEdBQUc7QUFDbEUscUJBQWEsT0FBTyxDQUFDLEtBQUs7QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLGlCQUFpQiw2QkFBNkIsT0FBTyxLQUFLLGdCQUFnQixLQUFLLFNBQVMsYUFBYSxNQUFNO0FBQ2hILFNBQUssVUFBVSxDQUFDO0FBQ2hCLFNBQUsscUJBQXFCO0FBQzFCLFNBQUsscUJBQXFCO0FBQzFCLFdBQU8sYUFBYTtBQUFBLEVBQ3JCO0FBQUEsRUFFTyxTQUFTLFVBQWlFO0FBQ2hGLFdBQU8sSUFBSSxVQUFVO0FBQUEsTUFDcEIsNkJBQTZCLE9BQU8sS0FBSyxnQkFBZ0IsS0FBSyxTQUFTLElBQUk7QUFBQSxNQUMzRSxDQUFDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFJTyxJQUFNLG1CQUFOLGNBQStCLFdBQWtFO0FBQUEsRUFVdkcsWUFBWSxpQkFBbUMsd0JBQWlELFlBQW9CLE9BQXFFLHVCQUE4QztBQUN0TyxVQUFNO0FBRGtMO0FBRXhMLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssY0FBYztBQUNuQixTQUFLLFNBQVM7QUFDZCxTQUFLLHFCQUFxQix1QkFBTyxPQUFPLElBQUk7QUFDNUMsU0FBSyxpQkFBaUIsUUFBUSxRQUFRLE1BQVM7QUFHL0MsUUFBSSxXQUFXO0FBQ2YsU0FBSyxVQUFVLFVBQVUscUJBQXFCLFlBQVksQ0FBQyxNQUFNO0FBQ2hFLFVBQUksVUFBVTtBQUNiO0FBQUEsTUFDRDtBQUNBLFVBQUkseUJBQXlCO0FBQzdCLGVBQVMsSUFBSSxHQUFHLE1BQU0sRUFBRSxpQkFBaUIsUUFBUSxJQUFJLEtBQUssS0FBSztBQUM5RCxjQUFNLFdBQVcsRUFBRSxpQkFBaUIsQ0FBQztBQUNyQyxZQUFJLEtBQUssbUJBQW1CLFFBQVEsR0FBRztBQUN0QyxtQ0FBeUI7QUFDekI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLFVBQUksd0JBQXdCO0FBQzNCLG1CQUFXO0FBQ1gsa0JBQVUscUJBQXFCLGFBQWEsQ0FBQyxLQUFLLFdBQVcsQ0FBQztBQUM5RCxtQkFBVztBQUFBLE1BQ1o7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssNkJBQTZCLEtBQUssc0JBQXNCLFNBQWlCLG9DQUFvQztBQUFBLE1BQ2pILG9CQUFvQixLQUFLO0FBQUEsSUFDMUIsQ0FBQztBQUNELFNBQUssVUFBVSxLQUFLLHNCQUFzQix5QkFBeUIsT0FBSztBQUN2RSxVQUFJLEVBQUUscUJBQXFCLGtDQUFrQyxHQUFHO0FBQy9ELGFBQUssNkJBQTZCLEtBQUssc0JBQXNCLFNBQWlCLG9DQUFvQztBQUFBLFVBQ2pILG9CQUFvQixLQUFLO0FBQUEsUUFDMUIsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVPLGdCQUE2QjtBQUNuQyxVQUFNLFdBQTRCLENBQUM7QUFDbkMsZUFBVyxvQkFBb0IsS0FBSyxvQkFBb0I7QUFDdkQsWUFBTSxzQkFBc0IsVUFBVSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDL0UsVUFBSSxxQkFBcUI7QUFFeEIsWUFBSSwrQkFBK0Isa0JBQWtCO0FBQ3BELGdCQUFNLG1CQUFtQixvQkFBb0IsY0FBYztBQUMzRCxjQUFJLGlCQUFpQixXQUFXLE9BQU87QUFDdEMscUJBQVMsS0FBSyxpQkFBaUIsT0FBTztBQUFBLFVBQ3ZDO0FBQUEsUUFDRDtBQUNBO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxVQUFVLHFCQUFxQixXQUFXLGdCQUFnQixHQUFHO0FBRWpFLGlCQUFTLEtBQUssVUFBVSxxQkFBcUIsWUFBWSxnQkFBZ0IsQ0FBQztBQUFBLE1BQzNFO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUyxXQUFXLEdBQUc7QUFDMUIsYUFBTztBQUFBLFFBQ04sUUFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsU0FBUyxRQUFRLElBQUksUUFBUSxFQUFFLEtBQUssT0FBSyxNQUFTO0FBQUEsSUFDbkQ7QUFBQSxFQUNEO0FBQUEsRUFFTyxrQkFBb0M7QUFDMUMsVUFBTSxZQUFZLDJCQUEyQixPQUFPLE1BQU0sS0FBSyxPQUFPLEtBQU07QUFDNUUsV0FBTyx3QkFBd0IsT0FBTyxXQUFXLElBQUk7QUFBQSxFQUN0RDtBQUFBLEVBRU8sU0FBUyxNQUFjLFFBQWlCLFdBQTJEO0FBQ3pHLFFBQUksS0FBSyxVQUFVLEtBQUssNEJBQTRCO0FBQ25ELGFBQU8sYUFBYSxLQUFLLGFBQWEsU0FBUztBQUFBLElBQ2hEO0FBQ0EsVUFBTSxrQkFBa0IsSUFBSSw4QkFBOEI7QUFDMUQsVUFBTSxlQUFlLEtBQUssVUFBVSxNQUFNLFFBQTBCLFdBQVcsZUFBZTtBQUM5RixXQUFPLGdCQUFnQixTQUFTLFlBQVk7QUFBQSxFQUM3QztBQUFBLEVBRU8sZ0JBQWdCLE1BQWMsUUFBaUIsV0FBa0U7QUFDdkgsUUFBSSxLQUFLLFVBQVUsS0FBSyw0QkFBNEI7QUFDbkQsYUFBTyxvQkFBb0IsS0FBSyxpQkFBaUIsZ0JBQWdCLGlCQUFpQixLQUFLLFdBQVcsR0FBRyxTQUFTO0FBQUEsSUFDL0c7QUFDQSxVQUFNLGtCQUFrQixJQUFJLDZCQUE2QixLQUFLLGtCQUFrQixLQUFLLHdCQUF3QixjQUFjLEVBQUUsVUFBVTtBQUN2SSxVQUFNLGVBQWUsS0FBSyxVQUFVLE1BQU0sUUFBMEIsV0FBVyxlQUFlO0FBQzlGLFdBQU8sZ0JBQWdCLFNBQVMsWUFBWTtBQUFBLEVBQzdDO0FBQUEsRUFFUSxVQUFVLE1BQWMsUUFBaUIsV0FBNkIsV0FBc0Q7QUFDbkksUUFBSSxVQUFVLHNCQUFzQjtBQUNuQyxhQUFPLEtBQUssZ0JBQWdCLE1BQU0sUUFBUSxXQUFXLEdBQUcsU0FBUztBQUFBLElBQ2xFLE9BQU87QUFDTixhQUFPLEtBQUssWUFBWSxNQUFNLFFBQVEsV0FBVyxHQUFHLFNBQVM7QUFBQSxJQUM5RDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGlDQUFpQyxNQUFjLE9BQWlDO0FBQ3ZGLFFBQUksUUFBc0MsS0FBSyxPQUFPLFVBQVUsTUFBTSxNQUFNLEtBQUs7QUFDakYsUUFBSSxDQUFDLE9BQU87QUFDWCxjQUFRLGNBQWMsVUFBVSxLQUFLLFFBQVEsTUFBTSxNQUFNLEtBQUs7QUFDOUQsVUFBSSxDQUFDLE9BQU87QUFDWCxjQUFNLGNBQWMsWUFBWSxLQUFLLFFBQVEscUNBQXFDLE1BQU0sTUFBTSxLQUFLO0FBQUEsTUFDcEc7QUFBQSxJQUNEO0FBRUEsUUFBSSxZQUFZO0FBQ2hCLFFBQUkscUJBQXFCO0FBRXpCLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLFVBQUksQ0FBQyxjQUFjLFVBQVUsS0FBSyxNQUFNLEtBQUssRUFBRSxLQUFLLE9BQU8saUJBQWlCLFVBQVUsS0FBSyxPQUFPLHdCQUF3QjtBQUN6SDtBQUFBLE1BQ0Q7QUFDQSwyQkFBcUI7QUFFckIsVUFBSSxRQUFRLEtBQUssYUFBYSxNQUFNLE1BQU0sS0FBSztBQUMvQyxZQUFNLGNBQWMsTUFBTTtBQUMxQixVQUFJLFlBQVksT0FBTyxHQUFHLENBQUMsTUFBTSxVQUFVLFlBQVksT0FBTyxZQUFZLFNBQVMsR0FBRyxDQUFDLE1BQU0sS0FBSztBQUNqRyxjQUFNLFNBQVMsTUFBTSxhQUFhLE1BQU0sT0FBTyxNQUFNLFVBQVUsTUFBTTtBQUNyRSxnQkFBUSxJQUFJLE9BQU8sWUFBWSxPQUFPLEdBQUcsWUFBWSxTQUFTLENBQUMsR0FBRyxLQUFLO0FBQUEsTUFDeEU7QUFFQSxZQUFNLFNBQVMsS0FBSyxPQUFPLEtBQUs7QUFDaEMsVUFBSSxXQUFXLE1BQU8sV0FBVyxLQUFLLEtBQUssc0JBQXVCO0FBQ2pFO0FBQUEsTUFDRDtBQUVBLFVBQUksY0FBYyxNQUFNLFNBQVMsV0FBVztBQUMzQyxvQkFBWTtBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLG9CQUFvQjtBQUN4QixZQUFNLGNBQWMsWUFBWSxLQUFLLFFBQVEsMEVBQTBFLE1BQU0sTUFBTSxLQUFLO0FBQUEsSUFDekk7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0JBQWdCLE1BQWMsUUFBaUIsV0FBNkIsYUFBcUIsaUJBQTREO0FBRXBLLFVBQU0sWUFBWSxLQUFLLGlDQUFpQyxNQUFNLFNBQVM7QUFFdkUsUUFBSSxjQUFjLElBQUk7QUFFckIsWUFBTSxpQkFBaUIsZ0JBQWdCLHVCQUF1QixNQUFNLFFBQVEsVUFBVSxzQkFBdUIsV0FBVztBQUN4SCxhQUFPLHdCQUF3QixPQUFPLFVBQVUsT0FBTyxJQUFJLHFCQUFxQixVQUFVLHFCQUFzQixZQUFZLGNBQWMsQ0FBQztBQUFBLElBQzVJO0FBRUEsVUFBTSxxQkFBcUIsS0FBSyxVQUFVLEdBQUcsU0FBUztBQUN0RCxRQUFJLG1CQUFtQixTQUFTLEdBQUc7QUFFbEMsc0JBQWdCLHVCQUF1QixvQkFBb0IsT0FBTyxVQUFVLHNCQUF1QixXQUFXO0FBQUEsSUFDL0c7QUFFQSxVQUFNLGdCQUFnQixLQUFLLFVBQVUsU0FBUztBQUM5QyxXQUFPLEtBQUssWUFBWSxlQUFlLFFBQVEsV0FBVyxjQUFjLFdBQVcsZUFBZTtBQUFBLEVBQ25HO0FBQUEsRUFFUSxjQUFjLE1BQTBDO0FBQy9ELFFBQUksTUFBTTtBQUNULGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsWUFBWSxlQUF1QixRQUFpQixXQUE2QixhQUFxQixpQkFBNEQ7QUFDekssb0JBQWdCLGNBQWMsS0FBSyxXQUFXO0FBRTlDLFVBQU0sc0JBQXNCLGNBQWM7QUFDMUMsVUFBTSxPQUFRLFVBQVUsS0FBSyxPQUFPLFlBQVksZ0JBQWdCLE9BQU87QUFDdkUsVUFBTSxhQUFhLEtBQUs7QUFFeEIsUUFBSSx1QkFBdUIsVUFBVTtBQUNyQyxRQUFJLFFBQVEsVUFBVTtBQUN0QixRQUFJLE1BQU07QUFTVixRQUFJLGdCQUFzQztBQUkxQyxRQUFJLGtCQUFrQjtBQUV0QixXQUFPLG1CQUFtQixNQUFNLFlBQVk7QUFFM0MsWUFBTSxPQUFPO0FBQ2IsWUFBTSxZQUFZLE1BQU07QUFDeEIsWUFBTSxZQUFZLGdCQUFnQixjQUFjLE9BQU8sU0FBUztBQUNoRSxZQUFNLFFBQVEsTUFBTTtBQUVwQixVQUFJLFVBQTJCO0FBQy9CLFVBQUksVUFBeUI7QUFDN0IsVUFBSSxTQUF5RTtBQUM3RSxVQUFJLE9BQW1DO0FBRXZDLFVBQUksMkJBQTBDO0FBRzlDLFVBQUksZUFBZTtBQUNsQixrQkFBVSxjQUFjO0FBQ3hCLGNBQU0sYUFBYSxjQUFjLE9BQU8sTUFBTTtBQUM5QyxrQkFBVSxXQUFXO0FBQ3JCLGlCQUFTLFdBQVc7QUFDcEIsZUFBTyxjQUFjO0FBR3JCLFlBQUksY0FBYyxPQUFPLFdBQVcsR0FBRztBQUN0QywwQkFBZ0I7QUFBQSxRQUNqQjtBQUFBLE1BQ0QsT0FBTztBQUdOLFlBQUksQ0FBQyxtQkFBbUIsT0FBTyxZQUFZO0FBRTFDO0FBQUEsUUFDRDtBQUVBLDBCQUFrQjtBQUdsQixZQUFJLFFBQXNDLEtBQUssT0FBTyxVQUFVLEtBQUs7QUFDckUsWUFBSSxDQUFDLE9BQU87QUFDWCxrQkFBUSxjQUFjLFVBQVUsS0FBSyxRQUFRLEtBQUs7QUFDbEQsY0FBSSxDQUFDLE9BQU87QUFDWCxrQkFBTSxjQUFjLFlBQVksS0FBSyxRQUFRLHFDQUFxQyxLQUFLO0FBQUEsVUFDeEY7QUFBQSxRQUNEO0FBR0EsY0FBTSxhQUFhLEtBQUssT0FBTyxHQUFHO0FBQ2xDLG1CQUFXQSxTQUFRLE9BQU87QUFDekIsY0FBSSxRQUFRLEtBQUssQ0FBQ0EsTUFBSyxzQkFBc0I7QUFDNUMsc0JBQVUsV0FBVyxNQUFNQSxNQUFLLGFBQWEsS0FBSyxDQUFDO0FBQ25ELGdCQUFJLFNBQVM7QUFDWix3QkFBVSxRQUFRLENBQUM7QUFDbkIsdUJBQVNBLE1BQUs7QUFDZDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFHQSxVQUFJLENBQUMsU0FBUztBQUNiLGtCQUFVLENBQUMsRUFBRTtBQUNiLGtCQUFVO0FBQUEsTUFDWDtBQUVBLFVBQUksQ0FBQyxRQUFRO0FBR1osWUFBSSxNQUFNLFlBQVk7QUFDckIsb0JBQVUsQ0FBQyxLQUFLLE9BQU8sR0FBRyxDQUFDO0FBQzNCLG9CQUFVLFFBQVEsQ0FBQztBQUFBLFFBQ3BCO0FBQ0EsaUJBQVMsS0FBSyxPQUFPO0FBQUEsTUFDdEI7QUFFQSxVQUFJLFlBQVksTUFBTTtBQUVyQjtBQUFBLE1BQ0Q7QUFHQSxhQUFPLFFBQVE7QUFHZixhQUFPLGNBQWMsY0FBYyxNQUFNLEtBQUssY0FBYyxVQUFVLE1BQU0sS0FBSyxPQUFPLE1BQU07QUFDN0YsaUJBQVMsT0FBTyxLQUFLLFNBQVMsU0FBUyxPQUFPLFFBQVEsVUFBVTtBQUFBLE1BQ2pFO0FBRUEsVUFBSSxTQUF5RTtBQUU3RSxVQUFJLE9BQU8sV0FBVyxZQUFZLE1BQU0sUUFBUSxNQUFNLEdBQUc7QUFDeEQsaUJBQVM7QUFBQSxNQUNWLFdBQVcsT0FBTyxPQUFPO0FBQ3hCLGlCQUFTLE9BQU87QUFBQSxNQUNqQixXQUFXLE9BQU8sVUFBVSxRQUFRLE9BQU8sVUFBVSxRQUFXO0FBRy9ELFlBQUksT0FBTyxZQUFZO0FBQ3RCLG1CQUFTLGNBQWMsa0JBQWtCLEtBQUssUUFBUSxPQUFPLE9BQU8sU0FBUyxTQUFTLEtBQUs7QUFBQSxRQUM1RixPQUFPO0FBQ04sbUJBQVMsT0FBTztBQUFBLFFBQ2pCO0FBR0EsWUFBSSxPQUFPLGNBQWM7QUFDeEIsY0FBSSxPQUFPLGlCQUFpQixRQUFRO0FBQ25DLGdCQUFJLENBQUMsc0JBQXNCO0FBQzFCLG9CQUFNLGNBQWMsWUFBWSxLQUFLLFFBQVEsZ0RBQWdEO0FBQUEsWUFDOUY7QUFDQSxtQ0FBdUI7QUFBQSxVQUN4QixXQUFXLHNCQUFzQjtBQUNoQyxrQkFBTSxjQUFjLFlBQVksS0FBSyxRQUFRLGlFQUFpRTtBQUFBLFVBQy9HLE9BQU87QUFDTix1Q0FBMkIsY0FBYyxrQkFBa0IsS0FBSyxRQUFRLE9BQU8sY0FBYyxTQUFTLFNBQVMsS0FBSztBQUFBLFVBQ3JIO0FBQUEsUUFDRDtBQUdBLFlBQUksT0FBTyxRQUFRO0FBQ2xCLGdCQUFNLEtBQUssSUFBSSxHQUFHLE1BQU0sT0FBTyxNQUFNO0FBQUEsUUFDdEM7QUFFQSxZQUFJLE9BQU8sWUFBWSxPQUFPLE9BQU8sYUFBYSxVQUFVO0FBQzNELGNBQUksWUFBWSxjQUFjLGtCQUFrQixLQUFLLFFBQVEsT0FBTyxVQUFVLFNBQVMsU0FBUyxLQUFLO0FBQ3JHLGNBQUksVUFBVSxDQUFDLE1BQU0sS0FBSztBQUN6Qix3QkFBWSxVQUFVLE9BQU8sQ0FBQztBQUFBLFVBQy9CO0FBQ0EsY0FBSSxDQUFDLGNBQWMsVUFBVSxLQUFLLFFBQVEsU0FBUyxHQUFHO0FBQ3JELGtCQUFNLGNBQWMsWUFBWSxLQUFLLFFBQVEsa0NBQW1DLFlBQVksa0NBQW1DLEtBQUssY0FBYyxJQUFJLENBQUM7QUFBQSxVQUN4SixPQUFPO0FBQ04sb0JBQVEsTUFBTSxTQUFTLFNBQVM7QUFBQSxVQUNqQztBQUFBLFFBQ0QsV0FBVyxPQUFPLGFBQWEsT0FBTyxPQUFPLGNBQWMsWUFBWTtBQUN0RSxnQkFBTSxjQUFjLFlBQVksS0FBSyxRQUFRLGdDQUFnQztBQUFBLFFBQzlFLFdBQVcsT0FBTyxNQUFNO0FBQ3ZCLGNBQUksT0FBTyxTQUFTLFNBQVM7QUFDNUIsZ0JBQUksTUFBTSxTQUFTLEtBQUssT0FBTyxVQUFVO0FBQ3hDLG9CQUFNLGNBQWMsWUFBWSxLQUFLLFFBQVEsNENBQzVDLE1BQU0sUUFBUSxNQUFNLE1BQU0sT0FBUSxRQUFRLE9BQU87QUFBQSxZQUNuRCxPQUFPO0FBQ04sc0JBQVEsTUFBTSxLQUFLLEtBQUs7QUFBQSxZQUN6QjtBQUFBLFVBQ0QsV0FBVyxPQUFPLFNBQVMsUUFBUTtBQUNsQyxnQkFBSSxNQUFNLFNBQVMsR0FBRztBQUNyQixvQkFBTSxjQUFjLFlBQVksS0FBSyxRQUFRLDJDQUEyQyxLQUFLLGNBQWMsSUFBSSxDQUFDO0FBQUEsWUFDakgsT0FBTztBQUNOLHNCQUFRLE1BQU0sSUFBSTtBQUFBLFlBQ25CO0FBQUEsVUFDRCxXQUFXLE9BQU8sU0FBUyxXQUFXO0FBQ3JDLG9CQUFRLE1BQU0sT0FBTztBQUFBLFVBQ3RCLE9BQU87QUFDTixnQkFBSSxZQUFZLGNBQWMsa0JBQWtCLEtBQUssUUFBUSxPQUFPLE1BQU0sU0FBUyxTQUFTLEtBQUs7QUFDakcsZ0JBQUksVUFBVSxDQUFDLE1BQU0sS0FBSztBQUN6QiwwQkFBWSxVQUFVLE9BQU8sQ0FBQztBQUFBLFlBQy9CO0FBRUEsZ0JBQUksQ0FBQyxjQUFjLFVBQVUsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUNyRCxvQkFBTSxjQUFjLFlBQVksS0FBSyxRQUFRLGlDQUFrQyxZQUFZLGtDQUFtQyxLQUFLLGNBQWMsSUFBSSxDQUFDO0FBQUEsWUFDdkosT0FBTztBQUNOLHNCQUFRLE1BQU0sS0FBSyxTQUFTO0FBQUEsWUFDN0I7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUVBLFlBQUksT0FBTyxPQUFPLE9BQVEsT0FBTyxRQUFTLFVBQVU7QUFDbkQsd0JBQWMsSUFBSSxLQUFLLFFBQVEsS0FBSyxPQUFPLGFBQWEsT0FBTyxjQUFjLGtCQUFrQixLQUFLLFFBQVEsT0FBTyxLQUFLLFNBQVMsU0FBUyxLQUFLLENBQUM7QUFBQSxRQUNqSjtBQUFBLE1BQ0Q7QUFHQSxVQUFJLFdBQVcsTUFBTTtBQUNwQixjQUFNLGNBQWMsWUFBWSxLQUFLLFFBQVEsb0RBQW9ELEtBQUssY0FBYyxJQUFJLENBQUM7QUFBQSxNQUMxSDtBQUVBLFlBQU0scUNBQXFDLENBQUNDLDhCQUFxQztBQUVoRixjQUFNLGFBQ0wsS0FBSyxpQkFBaUIsNEJBQTRCQSx5QkFBd0IsS0FDdkUsS0FBSyxpQkFBaUIsd0JBQXdCQSx5QkFBd0IsS0FDdEVBO0FBR0osY0FBTUMsd0JBQXVCLEtBQUssK0JBQStCLFVBQVU7QUFFM0UsWUFBSSxNQUFNLFlBQVk7QUFFckIsZ0JBQU0sYUFBYSxjQUFjLE9BQU8sR0FBRztBQUMzQyxpQkFBTyxLQUFLLGdCQUFnQixZQUFZLFFBQVEsd0JBQXdCLE9BQU8sT0FBT0EscUJBQW9CLEdBQUcsY0FBYyxLQUFLLGVBQWU7QUFBQSxRQUNoSixPQUFPO0FBQ04saUJBQU8sd0JBQXdCLE9BQU8sT0FBT0EscUJBQW9CO0FBQUEsUUFDbEU7QUFBQSxNQUNEO0FBR0EsVUFBSSxNQUFNLFFBQVEsTUFBTSxHQUFHO0FBQzFCLFlBQUksaUJBQWlCLGNBQWMsT0FBTyxTQUFTLEdBQUc7QUFDckQsZ0JBQU0sY0FBYyxZQUFZLEtBQUssUUFBUSw4QkFBOEIsS0FBSyxjQUFjLElBQUksQ0FBQztBQUFBLFFBQ3BHO0FBQ0EsWUFBSSxRQUFRLFdBQVcsT0FBTyxTQUFTLEdBQUc7QUFDekMsZ0JBQU0sY0FBYyxZQUFZLEtBQUssUUFBUSw0RUFBNEUsS0FBSyxjQUFjLElBQUksQ0FBQztBQUFBLFFBQ2xKO0FBQ0EsWUFBSSxXQUFXO0FBQ2YsaUJBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxRQUFRLEtBQUs7QUFDeEMsc0JBQVksUUFBUSxDQUFDLEVBQUU7QUFBQSxRQUN4QjtBQUNBLFlBQUksYUFBYSxRQUFRLFFBQVE7QUFDaEMsZ0JBQU0sY0FBYyxZQUFZLEtBQUssUUFBUSxrRkFBa0YsS0FBSyxjQUFjLElBQUksQ0FBQztBQUFBLFFBQ3hKO0FBRUEsd0JBQWdCO0FBQUEsVUFDZjtBQUFBLFVBQ0E7QUFBQSxVQUNBLFFBQVEsQ0FBQztBQUFBLFFBQ1Y7QUFDQSxpQkFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLFFBQVEsS0FBSztBQUN2Qyx3QkFBYyxPQUFPLENBQUMsSUFBSTtBQUFBLFlBQ3pCLFFBQVEsT0FBTyxDQUFDO0FBQUEsWUFDaEIsU0FBUyxRQUFRLElBQUksQ0FBQztBQUFBLFVBQ3ZCO0FBQUEsUUFDRDtBQUVBLGVBQU8sUUFBUTtBQUVmO0FBQUEsTUFDRCxPQUFPO0FBSU4sWUFBSSxXQUFXLFlBQVk7QUFDMUIsaUJBQU8sUUFBUTtBQUNmLG9CQUFVO0FBQ1Ysb0JBQVU7QUFDVixtQkFBUztBQUlULGNBQUksNkJBQTZCLE1BQU07QUFDdEMsbUJBQU8sbUNBQW1DLHdCQUF3QjtBQUFBLFVBQ25FO0FBQUEsUUFDRDtBQUdBLFlBQUksUUFBUSxXQUFXLEdBQUc7QUFDekIsY0FBSSxlQUFlLEtBQUssY0FBYyxNQUFNLFNBQVMsVUFBVSxNQUFNLFVBQVUsQ0FBQyxnQkFBZ0IsSUFBSSxjQUFjLE9BQU8sWUFBWSxXQUFXO0FBQy9JO0FBQUEsVUFDRCxPQUFPO0FBQ04sa0JBQU0sY0FBYyxZQUFZLEtBQUssUUFBUSx1Q0FBdUMsS0FBSyxjQUFjLElBQUksQ0FBQztBQUFBLFVBQzdHO0FBQUEsUUFDRDtBQUlBLFlBQUksWUFBMkI7QUFDL0IsWUFBSSxjQUFjLFNBQVMsTUFBTSxLQUFLLE9BQU8sUUFBUSxXQUFXLE1BQU0sR0FBRztBQUN4RSxnQkFBTSxPQUFPLE9BQU8sT0FBTyxZQUFZLE1BQU07QUFDN0MsZ0JBQU0sVUFBVSxZQUFZLEtBQUssUUFBUSxPQUFPO0FBQ2hELGNBQUksQ0FBQyxTQUFTO0FBQ2Isa0JBQU0sY0FBYyxZQUFZLEtBQUssUUFBUSx5REFBeUQsT0FBTztBQUFBLFVBQzlHO0FBQ0Esc0JBQVksY0FBYyxTQUFTLFFBQVEsUUFBUSxJQUFJO0FBQUEsUUFDeEQsT0FBTztBQUNOLGdCQUFNLFFBQVMsV0FBVyxLQUFLLEtBQUssU0FBUyxLQUFLLE9BQU87QUFDekQsc0JBQVksY0FBYyxTQUFTLEtBQUs7QUFBQSxRQUN6QztBQUVBLFlBQUksT0FBTyxxQkFBcUI7QUFDL0IsMEJBQWdCLEtBQUssT0FBTyxhQUFhLFNBQVM7QUFBQSxRQUNuRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLDZCQUE2QixNQUFNO0FBQ3RDLGVBQU8sbUNBQW1DLHdCQUF3QjtBQUFBLE1BQ25FO0FBQUEsSUFDRDtBQUVBLFdBQU8sd0JBQXdCLE9BQU8sT0FBTyxvQkFBb0I7QUFBQSxFQUNsRTtBQUFBLEVBRVEsK0JBQStCLFlBQTBDO0FBQ2hGLFFBQUksQ0FBQyxLQUFLLGlCQUFpQix1QkFBdUIsVUFBVSxHQUFHO0FBQzlELGFBQU8sSUFBSSxxQkFBcUIsWUFBWSxTQUFTO0FBQUEsSUFDdEQ7QUFFQSxRQUFJLGVBQWUsS0FBSyxhQUFhO0FBRXBDLFdBQUssaUJBQWlCLDZCQUE2QixVQUFVO0FBQzdELGdCQUFVLHFCQUFxQixZQUFZLFVBQVU7QUFDckQsV0FBSyxtQkFBbUIsVUFBVSxJQUFJO0FBQUEsSUFDdkM7QUFFQSxVQUFNLHNCQUFzQixVQUFVLHFCQUFxQixJQUFJLFVBQVU7QUFDekUsUUFBSSxxQkFBcUI7QUFDeEIsYUFBTyxJQUFJLHFCQUFxQixZQUFZLG9CQUFvQixnQkFBZ0IsQ0FBQztBQUFBLElBQ2xGO0FBRUEsV0FBTyxJQUFJLHFCQUFxQixZQUFZLFNBQVM7QUFBQSxFQUN0RDtBQUNEO0FBeGZhLG1CQUFOO0FBQUEsRUFVNEk7QUFBQSxHQVZ0STtBQTZmYixTQUFTLFlBQVksT0FBNkIsU0FBaUI7QUFDbEUsTUFBSSxDQUFDLFNBQVM7QUFDYixXQUFPO0FBQUEsRUFDUjtBQUNBLFlBQVUsY0FBYyxRQUFRLE9BQU8sT0FBTztBQUU5QyxRQUFNLFdBQVcsTUFBTTtBQUN2QixhQUFXLFdBQVcsVUFBVTtBQUMvQixRQUFJLFFBQVEsU0FBUyxTQUFTO0FBQzdCLGFBQU8sRUFBRSxPQUFPLFFBQVEsT0FBTyxhQUFhLGNBQWMsZUFBZSxLQUFLO0FBQUEsSUFDL0UsV0FDUyxRQUFRLFVBQVUsU0FBUztBQUNuQyxhQUFPLEVBQUUsT0FBTyxRQUFRLE9BQU8sYUFBYSxjQUFjLGVBQWUsTUFBTTtBQUFBLElBQ2hGO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjsiLAogICJuYW1lcyI6IFsicnVsZSIsICJlbnRlcmluZ0VtYmVkZGVkTGFuZ3VhZ2UiLCAiZW1iZWRkZWRMYW5ndWFnZURhdGEiXQp9Cg==
