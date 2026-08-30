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
import { Emitter } from "../../../base/common/event.js";
import { Disposable, markAsSingleton, toDisposable } from "../../../base/common/lifecycle.js";
import * as strings from "../../../base/common/strings.js";
import { DEFAULT_WORD_REGEXP, ensureValidWordDefinition } from "../core/wordHelper.js";
import { AutoClosingPairs } from "./languageConfiguration.js";
import { CharacterPairSupport } from "./supports/characterPair.js";
import { BracketElectricCharacterSupport } from "./supports/electricCharacter.js";
import { IndentRulesSupport } from "./supports/indentRules.js";
import { OnEnterSupport } from "./supports/onEnter.js";
import { RichEditBrackets } from "./supports/richEditBrackets.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { ILanguageService } from "./language.js";
import { InstantiationType, registerSingleton } from "../../../platform/instantiation/common/extensions.js";
import { PLAINTEXT_LANGUAGE_ID } from "./modesRegistry.js";
import { LanguageBracketsConfiguration } from "./supports/languageBracketsConfiguration.js";
class LanguageConfigurationServiceChangeEvent {
  constructor(languageId) {
    this.languageId = languageId;
  }
  affects(languageId) {
    return !this.languageId ? true : this.languageId === languageId;
  }
}
const ILanguageConfigurationService = createDecorator("languageConfigurationService");
let LanguageConfigurationService = class extends Disposable {
  constructor(configurationService, languageService) {
    super();
    this.configurationService = configurationService;
    this.languageService = languageService;
    this._registry = this._register(new LanguageConfigurationRegistry());
    this.onDidChangeEmitter = this._register(new Emitter({
      leakWarningThreshold: 500,
      leakWarningName: "LanguageConfigurationService.onDidChange"
      /* increased for multi-diff editors with hundreds of text models */
    }));
    this.onDidChange = this.onDidChangeEmitter.event;
    this.configurations = /* @__PURE__ */ new Map();
    const languageConfigKeys = new Set(Object.values(customizedLanguageConfigKeys));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      const globalConfigChanged = e.change.keys.some(
        (k) => languageConfigKeys.has(k)
      );
      const localConfigChanged = e.change.overrides.filter(
        ([overrideLangName, keys]) => keys.some((k) => languageConfigKeys.has(k))
      ).map(([overrideLangName]) => overrideLangName);
      if (globalConfigChanged) {
        this.configurations.clear();
        this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(void 0));
      } else {
        for (const languageId of localConfigChanged) {
          if (this.languageService.isRegisteredLanguageId(languageId)) {
            this.configurations.delete(languageId);
            this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(languageId));
          }
        }
      }
    }));
    this._register(this._registry.onDidChange((e) => {
      this.configurations.delete(e.languageId);
      this.onDidChangeEmitter.fire(new LanguageConfigurationServiceChangeEvent(e.languageId));
    }));
  }
  register(languageId, configuration, priority) {
    return this._registry.register(languageId, configuration, priority);
  }
  getLanguageConfiguration(languageId) {
    let result = this.configurations.get(languageId);
    if (!result) {
      result = computeConfig(languageId, this._registry, this.configurationService, this.languageService);
      this.configurations.set(languageId, result);
    }
    return result;
  }
};
LanguageConfigurationService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ILanguageService)
], LanguageConfigurationService);
function computeConfig(languageId, registry, configurationService, languageService) {
  let languageConfig = registry.getLanguageConfiguration(languageId);
  if (!languageConfig) {
    if (!languageService.isRegisteredLanguageId(languageId)) {
      return new ResolvedLanguageConfiguration(languageId, {});
    }
    languageConfig = new ResolvedLanguageConfiguration(languageId, {});
  }
  const customizedConfig = getCustomizedLanguageConfig(languageConfig.languageId, configurationService);
  const data = combineLanguageConfigurations([languageConfig.underlyingConfig, customizedConfig]);
  const config = new ResolvedLanguageConfiguration(languageConfig.languageId, data);
  return config;
}
const customizedLanguageConfigKeys = {
  brackets: "editor.language.brackets",
  colorizedBracketPairs: "editor.language.colorizedBracketPairs"
};
function getCustomizedLanguageConfig(languageId, configurationService) {
  const brackets = configurationService.getValue(customizedLanguageConfigKeys.brackets, {
    overrideIdentifier: languageId
  });
  const colorizedBracketPairs = configurationService.getValue(customizedLanguageConfigKeys.colorizedBracketPairs, {
    overrideIdentifier: languageId
  });
  return {
    brackets: validateBracketPairs(brackets),
    colorizedBracketPairs: validateBracketPairs(colorizedBracketPairs)
  };
}
function validateBracketPairs(data) {
  if (!Array.isArray(data)) {
    return void 0;
  }
  return data.map((pair) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      return void 0;
    }
    return [pair[0], pair[1]];
  }).filter((p) => !!p);
}
function getIndentationAtPosition(model, lineNumber, column) {
  const lineText = model.getLineContent(lineNumber);
  let indentation = strings.getLeadingWhitespace(lineText);
  if (indentation.length > column - 1) {
    indentation = indentation.substring(0, column - 1);
  }
  return indentation;
}
class ComposedLanguageConfiguration {
  constructor(languageId) {
    this.languageId = languageId;
    this._resolved = null;
    this._entries = [];
    this._order = 0;
    this._resolved = null;
  }
  register(configuration, priority) {
    const entry = new LanguageConfigurationContribution(
      configuration,
      priority,
      ++this._order
    );
    this._entries.push(entry);
    this._resolved = null;
    return markAsSingleton(toDisposable(() => {
      for (let i = 0; i < this._entries.length; i++) {
        if (this._entries[i] === entry) {
          this._entries.splice(i, 1);
          this._resolved = null;
          break;
        }
      }
    }));
  }
  getResolvedConfiguration() {
    if (!this._resolved) {
      const config = this._resolve();
      if (config) {
        this._resolved = new ResolvedLanguageConfiguration(
          this.languageId,
          config
        );
      }
    }
    return this._resolved;
  }
  _resolve() {
    if (this._entries.length === 0) {
      return null;
    }
    this._entries.sort(LanguageConfigurationContribution.cmp);
    return combineLanguageConfigurations(this._entries.map((e) => e.configuration));
  }
}
function combineLanguageConfigurations(configs) {
  let result = {
    comments: void 0,
    brackets: void 0,
    wordPattern: void 0,
    indentationRules: void 0,
    onEnterRules: void 0,
    autoClosingPairs: void 0,
    surroundingPairs: void 0,
    autoCloseBefore: void 0,
    folding: void 0,
    colorizedBracketPairs: void 0,
    __electricCharacterSupport: void 0
  };
  for (const entry of configs) {
    result = {
      comments: entry.comments || result.comments,
      brackets: entry.brackets || result.brackets,
      wordPattern: entry.wordPattern || result.wordPattern,
      indentationRules: entry.indentationRules || result.indentationRules,
      onEnterRules: entry.onEnterRules || result.onEnterRules,
      autoClosingPairs: entry.autoClosingPairs || result.autoClosingPairs,
      surroundingPairs: entry.surroundingPairs || result.surroundingPairs,
      autoCloseBefore: entry.autoCloseBefore || result.autoCloseBefore,
      folding: entry.folding || result.folding,
      colorizedBracketPairs: entry.colorizedBracketPairs || result.colorizedBracketPairs,
      __electricCharacterSupport: entry.__electricCharacterSupport || result.__electricCharacterSupport
    };
  }
  return result;
}
class LanguageConfigurationContribution {
  constructor(configuration, priority, order) {
    this.configuration = configuration;
    this.priority = priority;
    this.order = order;
  }
  static cmp(a, b) {
    if (a.priority === b.priority) {
      return a.order - b.order;
    }
    return a.priority - b.priority;
  }
}
class LanguageConfigurationChangeEvent {
  constructor(languageId) {
    this.languageId = languageId;
  }
}
class LanguageConfigurationRegistry extends Disposable {
  constructor() {
    super();
    this._entries = /* @__PURE__ */ new Map();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(this.register(PLAINTEXT_LANGUAGE_ID, {
      brackets: [
        ["(", ")"],
        ["[", "]"],
        ["{", "}"]
      ],
      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "<", close: ">" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: "`", close: "`" }
      ],
      colorizedBracketPairs: [],
      folding: {
        offSide: true
      }
    }, 0));
  }
  /**
   * @param priority Use a higher number for higher priority
   */
  register(languageId, configuration, priority = 0) {
    let entries = this._entries.get(languageId);
    if (!entries) {
      entries = new ComposedLanguageConfiguration(languageId);
      this._entries.set(languageId, entries);
    }
    const disposable = entries.register(configuration, priority);
    this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));
    return markAsSingleton(toDisposable(() => {
      disposable.dispose();
      this._onDidChange.fire(new LanguageConfigurationChangeEvent(languageId));
    }));
  }
  getLanguageConfiguration(languageId) {
    const entries = this._entries.get(languageId);
    return entries?.getResolvedConfiguration() || null;
  }
}
class ResolvedLanguageConfiguration {
  constructor(languageId, underlyingConfig) {
    this.languageId = languageId;
    this.underlyingConfig = underlyingConfig;
    this._brackets = null;
    this._electricCharacter = null;
    this._onEnterSupport = this.underlyingConfig.brackets || this.underlyingConfig.indentationRules || this.underlyingConfig.onEnterRules ? new OnEnterSupport(this.underlyingConfig) : null;
    this.comments = ResolvedLanguageConfiguration._handleComments(this.underlyingConfig);
    this.characterPair = new CharacterPairSupport(this.underlyingConfig);
    this.wordDefinition = this.underlyingConfig.wordPattern || DEFAULT_WORD_REGEXP;
    this.indentationRules = this.underlyingConfig.indentationRules;
    if (this.underlyingConfig.indentationRules) {
      this.indentRulesSupport = new IndentRulesSupport(
        this.underlyingConfig.indentationRules
      );
    } else {
      this.indentRulesSupport = null;
    }
    this.foldingRules = this.underlyingConfig.folding || {};
    this.bracketsNew = new LanguageBracketsConfiguration(
      languageId,
      this.underlyingConfig
    );
  }
  getWordDefinition() {
    return ensureValidWordDefinition(this.wordDefinition);
  }
  get brackets() {
    if (!this._brackets && this.underlyingConfig.brackets) {
      this._brackets = new RichEditBrackets(
        this.languageId,
        this.underlyingConfig.brackets
      );
    }
    return this._brackets;
  }
  get electricCharacter() {
    if (!this._electricCharacter) {
      this._electricCharacter = new BracketElectricCharacterSupport(
        this.brackets
      );
    }
    return this._electricCharacter;
  }
  onEnter(autoIndent, previousLineText, beforeEnterText, afterEnterText) {
    if (!this._onEnterSupport) {
      return null;
    }
    return this._onEnterSupport.onEnter(
      autoIndent,
      previousLineText,
      beforeEnterText,
      afterEnterText
    );
  }
  getAutoClosingPairs() {
    return new AutoClosingPairs(this.characterPair.getAutoClosingPairs());
  }
  getAutoCloseBeforeSet(forQuotes) {
    return this.characterPair.getAutoCloseBeforeSet(forQuotes);
  }
  getSurroundingPairs() {
    return this.characterPair.getSurroundingPairs();
  }
  static _handleComments(conf) {
    const commentRule = conf.comments;
    if (!commentRule) {
      return null;
    }
    const comments = {};
    if (commentRule.lineComment) {
      if (typeof commentRule.lineComment === "string") {
        comments.lineCommentToken = commentRule.lineComment;
      } else {
        comments.lineCommentToken = commentRule.lineComment.comment;
        comments.lineCommentNoIndent = commentRule.lineComment.noIndent;
      }
    }
    if (commentRule.blockComment) {
      const [blockStart, blockEnd] = commentRule.blockComment;
      comments.blockCommentStartToken = blockStart;
      comments.blockCommentEndToken = blockEnd;
    }
    return comments;
  }
}
registerSingleton(ILanguageConfigurationService, LanguageConfigurationService, InstantiationType.Delayed);
export {
  ILanguageConfigurationService,
  LanguageConfigurationChangeEvent,
  LanguageConfigurationRegistry,
  LanguageConfigurationService,
  LanguageConfigurationServiceChangeEvent,
  ResolvedLanguageConfiguration,
  getIndentationAtPosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbGFuZ3VhZ2VzXFxsYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIG1hcmtBc1NpbmdsZXRvbiwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9XT1JEX1JFR0VYUCwgZW5zdXJlVmFsaWRXb3JkRGVmaW5pdGlvbiB9IGZyb20gJy4uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBFbnRlckFjdGlvbiwgRm9sZGluZ1J1bGVzLCBJQXV0b0Nsb3NpbmdQYWlyLCBJbmRlbnRhdGlvblJ1bGUsIExhbmd1YWdlQ29uZmlndXJhdGlvbiwgQXV0b0Nsb3NpbmdQYWlycywgQ2hhcmFjdGVyUGFpciwgRXhwbGljaXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGFyYWN0ZXJQYWlyU3VwcG9ydCB9IGZyb20gJy4vc3VwcG9ydHMvY2hhcmFjdGVyUGFpci5qcyc7XG5pbXBvcnQgeyBCcmFja2V0RWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0IH0gZnJvbSAnLi9zdXBwb3J0cy9lbGVjdHJpY0NoYXJhY3Rlci5qcyc7XG5pbXBvcnQgeyBJbmRlbnRSdWxlc1N1cHBvcnQgfSBmcm9tICcuL3N1cHBvcnRzL2luZGVudFJ1bGVzLmpzJztcbmltcG9ydCB7IE9uRW50ZXJTdXBwb3J0IH0gZnJvbSAnLi9zdXBwb3J0cy9vbkVudGVyLmpzJztcbmltcG9ydCB7IFJpY2hFZGl0QnJhY2tldHMgfSBmcm9tICcuL3N1cHBvcnRzL3JpY2hFZGl0QnJhY2tldHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5IH0gZnJvbSAnLi4vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExhbmd1YWdlQnJhY2tldHNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9zdXBwb3J0cy9sYW5ndWFnZUJyYWNrZXRzQ29uZmlndXJhdGlvbi5qcyc7XG5cbi8qKlxuICogSW50ZXJmYWNlIHVzZWQgdG8gc3VwcG9ydCBpbnNlcnRpb24gb2YgbW9kZSBzcGVjaWZpYyBjb21tZW50cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29tbWVudHNDb25maWd1cmF0aW9uIHtcblx0bGluZUNvbW1lbnRUb2tlbj86IHN0cmluZztcblx0bGluZUNvbW1lbnROb0luZGVudD86IGJvb2xlYW47XG5cdGJsb2NrQ29tbWVudFN0YXJ0VG9rZW4/OiBzdHJpbmc7XG5cdGJsb2NrQ29tbWVudEVuZFRva2VuPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlQ2hhbmdlRXZlbnQ+O1xuXG5cdC8qKlxuXHQgKiBAcGFyYW0gcHJpb3JpdHkgVXNlIGEgaGlnaGVyIG51bWJlciBmb3IgaGlnaGVyIHByaW9yaXR5XG5cdCAqL1xuXHRyZWdpc3RlcihsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IExhbmd1YWdlQ29uZmlndXJhdGlvbiwgcHJpb3JpdHk/OiBudW1iZXIpOiBJRGlzcG9zYWJsZTtcblxuXHRnZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZDogc3RyaW5nKTogUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb247XG5cbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VDaGFuZ2VFdmVudCB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBsYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHsgfVxuXG5cdHB1YmxpYyBhZmZlY3RzKGxhbmd1YWdlSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5sYW5ndWFnZUlkID8gdHJ1ZSA6IHRoaXMubGFuZ3VhZ2VJZCA9PT0gbGFuZ3VhZ2VJZDtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U+KCdsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlJyk7XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZ2lzdHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IExhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZUNoYW5nZUV2ZW50Pih7XG5cdFx0bGVha1dhcm5pbmdUaHJlc2hvbGQ6IDUwMCxcblx0XHRsZWFrV2FybmluZ05hbWU6ICdMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlJyAvKiBpbmNyZWFzZWQgZm9yIG11bHRpLWRpZmYgZWRpdG9ycyB3aXRoIGh1bmRyZWRzIG9mIHRleHQgbW9kZWxzICovXG5cdH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5vbkRpZENoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWdLZXlzID0gbmV3IFNldChPYmplY3QudmFsdWVzKGN1c3RvbWl6ZWRMYW5ndWFnZUNvbmZpZ0tleXMpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRjb25zdCBnbG9iYWxDb25maWdDaGFuZ2VkID0gZS5jaGFuZ2Uua2V5cy5zb21lKChrKSA9PlxuXHRcdFx0XHRsYW5ndWFnZUNvbmZpZ0tleXMuaGFzKGspXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgbG9jYWxDb25maWdDaGFuZ2VkID0gZS5jaGFuZ2Uub3ZlcnJpZGVzXG5cdFx0XHRcdC5maWx0ZXIoKFtvdmVycmlkZUxhbmdOYW1lLCBrZXlzXSkgPT5cblx0XHRcdFx0XHRrZXlzLnNvbWUoKGspID0+IGxhbmd1YWdlQ29uZmlnS2V5cy5oYXMoaykpXG5cdFx0XHRcdClcblx0XHRcdFx0Lm1hcCgoW292ZXJyaWRlTGFuZ05hbWVdKSA9PiBvdmVycmlkZUxhbmdOYW1lKTtcblxuXHRcdFx0aWYgKGdsb2JhbENvbmZpZ0NoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5maXJlKG5ldyBMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlQ2hhbmdlRXZlbnQodW5kZWZpbmVkKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxhbmd1YWdlSWQgb2YgbG9jYWxDb25maWdDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmlzUmVnaXN0ZXJlZExhbmd1YWdlSWQobGFuZ3VhZ2VJZCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvbnMuZGVsZXRlKGxhbmd1YWdlSWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZUVtaXR0ZXIuZmlyZShuZXcgTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZUNoYW5nZUV2ZW50KGxhbmd1YWdlSWQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZWdpc3RyeS5vbkRpZENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9ucy5kZWxldGUoZS5sYW5ndWFnZUlkKTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUobmV3IExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VDaGFuZ2VFdmVudChlLmxhbmd1YWdlSWQpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXIobGFuZ3VhZ2VJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb24sIHByaW9yaXR5PzogbnVtYmVyKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLl9yZWdpc3RyeS5yZWdpc3RlcihsYW5ndWFnZUlkLCBjb25maWd1cmF0aW9uLCBwcmlvcml0eSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQ6IHN0cmluZyk6IFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uIHtcblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5jb25maWd1cmF0aW9ucy5nZXQobGFuZ3VhZ2VJZCk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJlc3VsdCA9IGNvbXB1dGVDb25maWcobGFuZ3VhZ2VJZCwgdGhpcy5fcmVnaXN0cnksIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvbnMuc2V0KGxhbmd1YWdlSWQsIHJlc3VsdCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcHV0ZUNvbmZpZyhcblx0bGFuZ3VhZ2VJZDogc3RyaW5nLFxuXHRyZWdpc3RyeTogTGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnksXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcbik6IFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uIHtcblx0bGV0IGxhbmd1YWdlQ29uZmlnID0gcmVnaXN0cnkuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpO1xuXG5cdGlmICghbGFuZ3VhZ2VDb25maWcpIHtcblx0XHRpZiAoIWxhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQpKSB7XG5cdFx0XHQvLyB0aGlzIGhhcHBlbnMgZm9yIHRoZSBudWxsIGxhbmd1YWdlLCB3aGljaCBjYW4gYmUgcmV0dXJuZWQgYnkgbW9uYXJjaC5cblx0XHRcdC8vIEluc3RlYWQgb2YgdGhyb3dpbmcgYW4gZXJyb3IsIHdlIGp1c3QgcmV0dXJuIGEgZGVmYXVsdCBjb25maWcuXG5cdFx0XHRyZXR1cm4gbmV3IFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQsIHt9KTtcblx0XHR9XG5cdFx0bGFuZ3VhZ2VDb25maWcgPSBuZXcgUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCwge30pO1xuXHR9XG5cblx0Y29uc3QgY3VzdG9taXplZENvbmZpZyA9IGdldEN1c3RvbWl6ZWRMYW5ndWFnZUNvbmZpZyhsYW5ndWFnZUNvbmZpZy5sYW5ndWFnZUlkLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGNvbnN0IGRhdGEgPSBjb21iaW5lTGFuZ3VhZ2VDb25maWd1cmF0aW9ucyhbbGFuZ3VhZ2VDb25maWcudW5kZXJseWluZ0NvbmZpZywgY3VzdG9taXplZENvbmZpZ10pO1xuXHRjb25zdCBjb25maWcgPSBuZXcgUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VDb25maWcubGFuZ3VhZ2VJZCwgZGF0YSk7XG5cdHJldHVybiBjb25maWc7XG59XG5cbmNvbnN0IGN1c3RvbWl6ZWRMYW5ndWFnZUNvbmZpZ0tleXMgPSB7XG5cdGJyYWNrZXRzOiAnZWRpdG9yLmxhbmd1YWdlLmJyYWNrZXRzJyxcblx0Y29sb3JpemVkQnJhY2tldFBhaXJzOiAnZWRpdG9yLmxhbmd1YWdlLmNvbG9yaXplZEJyYWNrZXRQYWlycydcbn07XG5cbmZ1bmN0aW9uIGdldEN1c3RvbWl6ZWRMYW5ndWFnZUNvbmZpZyhsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb24ge1xuXHRjb25zdCBicmFja2V0cyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGN1c3RvbWl6ZWRMYW5ndWFnZUNvbmZpZ0tleXMuYnJhY2tldHMsIHtcblx0XHRvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlSWQsXG5cdH0pO1xuXG5cdGNvbnN0IGNvbG9yaXplZEJyYWNrZXRQYWlycyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGN1c3RvbWl6ZWRMYW5ndWFnZUNvbmZpZ0tleXMuY29sb3JpemVkQnJhY2tldFBhaXJzLCB7XG5cdFx0b3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZUlkLFxuXHR9KTtcblxuXHRyZXR1cm4ge1xuXHRcdGJyYWNrZXRzOiB2YWxpZGF0ZUJyYWNrZXRQYWlycyhicmFja2V0cyksXG5cdFx0Y29sb3JpemVkQnJhY2tldFBhaXJzOiB2YWxpZGF0ZUJyYWNrZXRQYWlycyhjb2xvcml6ZWRCcmFja2V0UGFpcnMpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUJyYWNrZXRQYWlycyhkYXRhOiB1bmtub3duKTogQ2hhcmFjdGVyUGFpcltdIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFBcnJheS5pc0FycmF5KGRhdGEpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gZGF0YS5tYXAocGFpciA9PiB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHBhaXIpIHx8IHBhaXIubGVuZ3RoICE9PSAyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gW3BhaXJbMF0sIHBhaXJbMV1dIGFzIENoYXJhY3RlclBhaXI7XG5cdH0pLmZpbHRlcigocCk6IHAgaXMgQ2hhcmFjdGVyUGFpciA9PiAhIXApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW5kZW50YXRpb25BdFBvc2l0aW9uKG1vZGVsOiBJVGV4dE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0bGV0IGluZGVudGF0aW9uID0gc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShsaW5lVGV4dCk7XG5cdGlmIChpbmRlbnRhdGlvbi5sZW5ndGggPiBjb2x1bW4gLSAxKSB7XG5cdFx0aW5kZW50YXRpb24gPSBpbmRlbnRhdGlvbi5zdWJzdHJpbmcoMCwgY29sdW1uIC0gMSk7XG5cdH1cblx0cmV0dXJuIGluZGVudGF0aW9uO1xufVxuXG5jbGFzcyBDb21wb3NlZExhbmd1YWdlQ29uZmlndXJhdGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VudHJpZXM6IExhbmd1YWdlQ29uZmlndXJhdGlvbkNvbnRyaWJ1dGlvbltdO1xuXHRwcml2YXRlIF9vcmRlcjogbnVtYmVyO1xuXHRwcml2YXRlIF9yZXNvbHZlZDogUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24gfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5fZW50cmllcyA9IFtdO1xuXHRcdHRoaXMuX29yZGVyID0gMDtcblx0XHR0aGlzLl9yZXNvbHZlZCA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXIoXG5cdFx0Y29uZmlndXJhdGlvbjogTGFuZ3VhZ2VDb25maWd1cmF0aW9uLFxuXHRcdHByaW9yaXR5OiBudW1iZXJcblx0KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGVudHJ5ID0gbmV3IExhbmd1YWdlQ29uZmlndXJhdGlvbkNvbnRyaWJ1dGlvbihcblx0XHRcdGNvbmZpZ3VyYXRpb24sXG5cdFx0XHRwcmlvcml0eSxcblx0XHRcdCsrdGhpcy5fb3JkZXJcblx0XHQpO1xuXHRcdHRoaXMuX2VudHJpZXMucHVzaChlbnRyeSk7XG5cdFx0dGhpcy5fcmVzb2x2ZWQgPSBudWxsO1xuXHRcdHJldHVybiBtYXJrQXNTaW5nbGV0b24odG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZW50cmllcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAodGhpcy5fZW50cmllc1tpXSA9PT0gZW50cnkpIHtcblx0XHRcdFx0XHR0aGlzLl9lbnRyaWVzLnNwbGljZShpLCAxKTtcblx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlZCA9IG51bGw7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmVzb2x2ZWRDb25maWd1cmF0aW9uKCk6IFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9yZXNvbHZlZCkge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fcmVzb2x2ZSgpO1xuXHRcdFx0aWYgKGNvbmZpZykge1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlZCA9IG5ldyBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbihcblx0XHRcdFx0XHR0aGlzLmxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0Y29uZmlnXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlZDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmUoKTogTGFuZ3VhZ2VDb25maWd1cmF0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuX2VudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fZW50cmllcy5zb3J0KExhbmd1YWdlQ29uZmlndXJhdGlvbkNvbnRyaWJ1dGlvbi5jbXApO1xuXHRcdHJldHVybiBjb21iaW5lTGFuZ3VhZ2VDb25maWd1cmF0aW9ucyh0aGlzLl9lbnRyaWVzLm1hcChlID0+IGUuY29uZmlndXJhdGlvbikpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbWJpbmVMYW5ndWFnZUNvbmZpZ3VyYXRpb25zKGNvbmZpZ3M6IExhbmd1YWdlQ29uZmlndXJhdGlvbltdKTogTGFuZ3VhZ2VDb25maWd1cmF0aW9uIHtcblx0bGV0IHJlc3VsdDogRXhwbGljaXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0Y29tbWVudHM6IHVuZGVmaW5lZCxcblx0XHRicmFja2V0czogdW5kZWZpbmVkLFxuXHRcdHdvcmRQYXR0ZXJuOiB1bmRlZmluZWQsXG5cdFx0aW5kZW50YXRpb25SdWxlczogdW5kZWZpbmVkLFxuXHRcdG9uRW50ZXJSdWxlczogdW5kZWZpbmVkLFxuXHRcdGF1dG9DbG9zaW5nUGFpcnM6IHVuZGVmaW5lZCxcblx0XHRzdXJyb3VuZGluZ1BhaXJzOiB1bmRlZmluZWQsXG5cdFx0YXV0b0Nsb3NlQmVmb3JlOiB1bmRlZmluZWQsXG5cdFx0Zm9sZGluZzogdW5kZWZpbmVkLFxuXHRcdGNvbG9yaXplZEJyYWNrZXRQYWlyczogdW5kZWZpbmVkLFxuXHRcdF9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0OiB1bmRlZmluZWQsXG5cdH07XG5cdGZvciAoY29uc3QgZW50cnkgb2YgY29uZmlncykge1xuXHRcdHJlc3VsdCA9IHtcblx0XHRcdGNvbW1lbnRzOiBlbnRyeS5jb21tZW50cyB8fCByZXN1bHQuY29tbWVudHMsXG5cdFx0XHRicmFja2V0czogZW50cnkuYnJhY2tldHMgfHwgcmVzdWx0LmJyYWNrZXRzLFxuXHRcdFx0d29yZFBhdHRlcm46IGVudHJ5LndvcmRQYXR0ZXJuIHx8IHJlc3VsdC53b3JkUGF0dGVybixcblx0XHRcdGluZGVudGF0aW9uUnVsZXM6IGVudHJ5LmluZGVudGF0aW9uUnVsZXMgfHwgcmVzdWx0LmluZGVudGF0aW9uUnVsZXMsXG5cdFx0XHRvbkVudGVyUnVsZXM6IGVudHJ5Lm9uRW50ZXJSdWxlcyB8fCByZXN1bHQub25FbnRlclJ1bGVzLFxuXHRcdFx0YXV0b0Nsb3NpbmdQYWlyczogZW50cnkuYXV0b0Nsb3NpbmdQYWlycyB8fCByZXN1bHQuYXV0b0Nsb3NpbmdQYWlycyxcblx0XHRcdHN1cnJvdW5kaW5nUGFpcnM6IGVudHJ5LnN1cnJvdW5kaW5nUGFpcnMgfHwgcmVzdWx0LnN1cnJvdW5kaW5nUGFpcnMsXG5cdFx0XHRhdXRvQ2xvc2VCZWZvcmU6IGVudHJ5LmF1dG9DbG9zZUJlZm9yZSB8fCByZXN1bHQuYXV0b0Nsb3NlQmVmb3JlLFxuXHRcdFx0Zm9sZGluZzogZW50cnkuZm9sZGluZyB8fCByZXN1bHQuZm9sZGluZyxcblx0XHRcdGNvbG9yaXplZEJyYWNrZXRQYWlyczogZW50cnkuY29sb3JpemVkQnJhY2tldFBhaXJzIHx8IHJlc3VsdC5jb2xvcml6ZWRCcmFja2V0UGFpcnMsXG5cdFx0XHRfX2VsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydDogZW50cnkuX19lbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQgfHwgcmVzdWx0Ll9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0LFxuXHRcdH07XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5jbGFzcyBMYW5ndWFnZUNvbmZpZ3VyYXRpb25Db250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29uZmlndXJhdGlvbjogTGFuZ3VhZ2VDb25maWd1cmF0aW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSBwcmlvcml0eTogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBvcmRlcjogbnVtYmVyXG5cdCkgeyB9XG5cblx0cHVibGljIHN0YXRpYyBjbXAoYTogTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ29udHJpYnV0aW9uLCBiOiBMYW5ndWFnZUNvbmZpZ3VyYXRpb25Db250cmlidXRpb24pIHtcblx0XHRpZiAoYS5wcmlvcml0eSA9PT0gYi5wcmlvcml0eSkge1xuXHRcdFx0Ly8gaGlnaGVyIG9yZGVyIGxhc3Rcblx0XHRcdHJldHVybiBhLm9yZGVyIC0gYi5vcmRlcjtcblx0XHR9XG5cdFx0Ly8gaGlnaGVyIHByaW9yaXR5IGxhc3Rcblx0XHRyZXR1cm4gYS5wcmlvcml0eSAtIGIucHJpb3JpdHk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQ6IHN0cmluZykgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbnRyaWVzID0gbmV3IE1hcDxzdHJpbmcsIENvbXBvc2VkTGFuZ3VhZ2VDb25maWd1cmF0aW9uPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PExhbmd1YWdlQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZWdpc3RlcihQTEFJTlRFWFRfTEFOR1VBR0VfSUQsIHtcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsnKCcsICcpJ10sXG5cdFx0XHRcdFsnWycsICddJ10sXG5cdFx0XHRcdFsneycsICd9J10sXG5cdFx0XHRdLFxuXHRcdFx0c3Vycm91bmRpbmdQYWlyczogW1xuXHRcdFx0XHR7IG9wZW46ICd7JywgY2xvc2U6ICd9JyB9LFxuXHRcdFx0XHR7IG9wZW46ICdbJywgY2xvc2U6ICddJyB9LFxuXHRcdFx0XHR7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxuXHRcdFx0XHR7IG9wZW46ICc8JywgY2xvc2U6ICc+JyB9LFxuXHRcdFx0XHR7IG9wZW46ICdcXFwiJywgY2xvc2U6ICdcXFwiJyB9LFxuXHRcdFx0XHR7IG9wZW46ICdcXCcnLCBjbG9zZTogJ1xcJycgfSxcblx0XHRcdFx0eyBvcGVuOiAnYCcsIGNsb3NlOiAnYCcgfSxcblx0XHRcdF0sXG5cdFx0XHRjb2xvcml6ZWRCcmFja2V0UGFpcnM6IFtdLFxuXHRcdFx0Zm9sZGluZzoge1xuXHRcdFx0XHRvZmZTaWRlOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSwgMCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSBwcmlvcml0eSBVc2UgYSBoaWdoZXIgbnVtYmVyIGZvciBoaWdoZXIgcHJpb3JpdHlcblx0ICovXG5cdHB1YmxpYyByZWdpc3RlcihsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IExhbmd1YWdlQ29uZmlndXJhdGlvbiwgcHJpb3JpdHk6IG51bWJlciA9IDApOiBJRGlzcG9zYWJsZSB7XG5cdFx0bGV0IGVudHJpZXMgPSB0aGlzLl9lbnRyaWVzLmdldChsYW5ndWFnZUlkKTtcblx0XHRpZiAoIWVudHJpZXMpIHtcblx0XHRcdGVudHJpZXMgPSBuZXcgQ29tcG9zZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCk7XG5cdFx0XHR0aGlzLl9lbnRyaWVzLnNldChsYW5ndWFnZUlkLCBlbnRyaWVzKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gZW50cmllcy5yZWdpc3Rlcihjb25maWd1cmF0aW9uLCBwcmlvcml0eSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShuZXcgTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQobGFuZ3VhZ2VJZCkpO1xuXG5cdFx0cmV0dXJuIG1hcmtBc1NpbmdsZXRvbih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKG5ldyBMYW5ndWFnZUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudChsYW5ndWFnZUlkKSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkOiBzdHJpbmcpOiBSZXNvbHZlZExhbmd1YWdlQ29uZmlndXJhdGlvbiB8IG51bGwge1xuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLl9lbnRyaWVzLmdldChsYW5ndWFnZUlkKTtcblx0XHRyZXR1cm4gZW50cmllcz8uZ2V0UmVzb2x2ZWRDb25maWd1cmF0aW9uKCkgfHwgbnVsbDtcblx0fVxufVxuXG4vKipcbiAqIEltbXV0YWJsZS5cbiovXG5leHBvcnQgY2xhc3MgUmVzb2x2ZWRMYW5ndWFnZUNvbmZpZ3VyYXRpb24ge1xuXHRwcml2YXRlIF9icmFja2V0czogUmljaEVkaXRCcmFja2V0cyB8IG51bGw7XG5cdHByaXZhdGUgX2VsZWN0cmljQ2hhcmFjdGVyOiBCcmFja2V0RWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0IHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25FbnRlclN1cHBvcnQ6IE9uRW50ZXJTdXBwb3J0IHwgbnVsbDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgY29tbWVudHM6IElDb21tZW50c0NvbmZpZ3VyYXRpb24gfCBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgY2hhcmFjdGVyUGFpcjogQ2hhcmFjdGVyUGFpclN1cHBvcnQ7XG5cdHB1YmxpYyByZWFkb25seSB3b3JkRGVmaW5pdGlvbjogUmVnRXhwO1xuXHRwdWJsaWMgcmVhZG9ubHkgaW5kZW50UnVsZXNTdXBwb3J0OiBJbmRlbnRSdWxlc1N1cHBvcnQgfCBudWxsO1xuXHRwdWJsaWMgcmVhZG9ubHkgaW5kZW50YXRpb25SdWxlczogSW5kZW50YXRpb25SdWxlIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgZm9sZGluZ1J1bGVzOiBGb2xkaW5nUnVsZXM7XG5cdHB1YmxpYyByZWFkb25seSBicmFja2V0c05ldzogTGFuZ3VhZ2VCcmFja2V0c0NvbmZpZ3VyYXRpb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdW5kZXJseWluZ0NvbmZpZzogTGFuZ3VhZ2VDb25maWd1cmF0aW9uXG5cdCkge1xuXHRcdHRoaXMuX2JyYWNrZXRzID0gbnVsbDtcblx0XHR0aGlzLl9lbGVjdHJpY0NoYXJhY3RlciA9IG51bGw7XG5cdFx0dGhpcy5fb25FbnRlclN1cHBvcnQgPVxuXHRcdFx0dGhpcy51bmRlcmx5aW5nQ29uZmlnLmJyYWNrZXRzIHx8XG5cdFx0XHRcdHRoaXMudW5kZXJseWluZ0NvbmZpZy5pbmRlbnRhdGlvblJ1bGVzIHx8XG5cdFx0XHRcdHRoaXMudW5kZXJseWluZ0NvbmZpZy5vbkVudGVyUnVsZXNcblx0XHRcdFx0PyBuZXcgT25FbnRlclN1cHBvcnQodGhpcy51bmRlcmx5aW5nQ29uZmlnKVxuXHRcdFx0XHQ6IG51bGw7XG5cdFx0dGhpcy5jb21tZW50cyA9IFJlc29sdmVkTGFuZ3VhZ2VDb25maWd1cmF0aW9uLl9oYW5kbGVDb21tZW50cyh0aGlzLnVuZGVybHlpbmdDb25maWcpO1xuXHRcdHRoaXMuY2hhcmFjdGVyUGFpciA9IG5ldyBDaGFyYWN0ZXJQYWlyU3VwcG9ydCh0aGlzLnVuZGVybHlpbmdDb25maWcpO1xuXG5cdFx0dGhpcy53b3JkRGVmaW5pdGlvbiA9IHRoaXMudW5kZXJseWluZ0NvbmZpZy53b3JkUGF0dGVybiB8fCBERUZBVUxUX1dPUkRfUkVHRVhQO1xuXHRcdHRoaXMuaW5kZW50YXRpb25SdWxlcyA9IHRoaXMudW5kZXJseWluZ0NvbmZpZy5pbmRlbnRhdGlvblJ1bGVzO1xuXHRcdGlmICh0aGlzLnVuZGVybHlpbmdDb25maWcuaW5kZW50YXRpb25SdWxlcykge1xuXHRcdFx0dGhpcy5pbmRlbnRSdWxlc1N1cHBvcnQgPSBuZXcgSW5kZW50UnVsZXNTdXBwb3J0KFxuXHRcdFx0XHR0aGlzLnVuZGVybHlpbmdDb25maWcuaW5kZW50YXRpb25SdWxlc1xuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbmRlbnRSdWxlc1N1cHBvcnQgPSBudWxsO1xuXHRcdH1cblx0XHR0aGlzLmZvbGRpbmdSdWxlcyA9IHRoaXMudW5kZXJseWluZ0NvbmZpZy5mb2xkaW5nIHx8IHt9O1xuXG5cdFx0dGhpcy5icmFja2V0c05ldyA9IG5ldyBMYW5ndWFnZUJyYWNrZXRzQ29uZmlndXJhdGlvbihcblx0XHRcdGxhbmd1YWdlSWQsXG5cdFx0XHR0aGlzLnVuZGVybHlpbmdDb25maWdcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGdldFdvcmREZWZpbml0aW9uKCk6IFJlZ0V4cCB7XG5cdFx0cmV0dXJuIGVuc3VyZVZhbGlkV29yZERlZmluaXRpb24odGhpcy53b3JkRGVmaW5pdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGJyYWNrZXRzKCk6IFJpY2hFZGl0QnJhY2tldHMgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2JyYWNrZXRzICYmIHRoaXMudW5kZXJseWluZ0NvbmZpZy5icmFja2V0cykge1xuXHRcdFx0dGhpcy5fYnJhY2tldHMgPSBuZXcgUmljaEVkaXRCcmFja2V0cyhcblx0XHRcdFx0dGhpcy5sYW5ndWFnZUlkLFxuXHRcdFx0XHR0aGlzLnVuZGVybHlpbmdDb25maWcuYnJhY2tldHNcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9icmFja2V0cztcblx0fVxuXG5cdHB1YmxpYyBnZXQgZWxlY3RyaWNDaGFyYWN0ZXIoKTogQnJhY2tldEVsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydCB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fZWxlY3RyaWNDaGFyYWN0ZXIpIHtcblx0XHRcdHRoaXMuX2VsZWN0cmljQ2hhcmFjdGVyID0gbmV3IEJyYWNrZXRFbGVjdHJpY0NoYXJhY3RlclN1cHBvcnQoXG5cdFx0XHRcdHRoaXMuYnJhY2tldHNcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9lbGVjdHJpY0NoYXJhY3Rlcjtcblx0fVxuXG5cdHB1YmxpYyBvbkVudGVyKFxuXHRcdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSxcblx0XHRwcmV2aW91c0xpbmVUZXh0OiBzdHJpbmcsXG5cdFx0YmVmb3JlRW50ZXJUZXh0OiBzdHJpbmcsXG5cdFx0YWZ0ZXJFbnRlclRleHQ6IHN0cmluZ1xuXHQpOiBFbnRlckFjdGlvbiB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fb25FbnRlclN1cHBvcnQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fb25FbnRlclN1cHBvcnQub25FbnRlcihcblx0XHRcdGF1dG9JbmRlbnQsXG5cdFx0XHRwcmV2aW91c0xpbmVUZXh0LFxuXHRcdFx0YmVmb3JlRW50ZXJUZXh0LFxuXHRcdFx0YWZ0ZXJFbnRlclRleHRcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGdldEF1dG9DbG9zaW5nUGFpcnMoKTogQXV0b0Nsb3NpbmdQYWlycyB7XG5cdFx0cmV0dXJuIG5ldyBBdXRvQ2xvc2luZ1BhaXJzKHRoaXMuY2hhcmFjdGVyUGFpci5nZXRBdXRvQ2xvc2luZ1BhaXJzKCkpO1xuXHR9XG5cblx0cHVibGljIGdldEF1dG9DbG9zZUJlZm9yZVNldChmb3JRdW90ZXM6IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmNoYXJhY3RlclBhaXIuZ2V0QXV0b0Nsb3NlQmVmb3JlU2V0KGZvclF1b3Rlcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3Vycm91bmRpbmdQYWlycygpOiBJQXV0b0Nsb3NpbmdQYWlyW10ge1xuXHRcdHJldHVybiB0aGlzLmNoYXJhY3RlclBhaXIuZ2V0U3Vycm91bmRpbmdQYWlycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2hhbmRsZUNvbW1lbnRzKFxuXHRcdGNvbmY6IExhbmd1YWdlQ29uZmlndXJhdGlvblxuXHQpOiBJQ29tbWVudHNDb25maWd1cmF0aW9uIHwgbnVsbCB7XG5cdFx0Y29uc3QgY29tbWVudFJ1bGUgPSBjb25mLmNvbW1lbnRzO1xuXHRcdGlmICghY29tbWVudFJ1bGUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdC8vIGNvbW1lbnQgY29uZmlndXJhdGlvblxuXHRcdGNvbnN0IGNvbW1lbnRzOiBJQ29tbWVudHNDb25maWd1cmF0aW9uID0ge307XG5cblx0XHRpZiAoY29tbWVudFJ1bGUubGluZUNvbW1lbnQpIHtcblx0XHRcdGlmICh0eXBlb2YgY29tbWVudFJ1bGUubGluZUNvbW1lbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbW1lbnRzLmxpbmVDb21tZW50VG9rZW4gPSBjb21tZW50UnVsZS5saW5lQ29tbWVudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbW1lbnRzLmxpbmVDb21tZW50VG9rZW4gPSBjb21tZW50UnVsZS5saW5lQ29tbWVudC5jb21tZW50O1xuXHRcdFx0XHRjb21tZW50cy5saW5lQ29tbWVudE5vSW5kZW50ID0gY29tbWVudFJ1bGUubGluZUNvbW1lbnQubm9JbmRlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjb21tZW50UnVsZS5ibG9ja0NvbW1lbnQpIHtcblx0XHRcdGNvbnN0IFtibG9ja1N0YXJ0LCBibG9ja0VuZF0gPSBjb21tZW50UnVsZS5ibG9ja0NvbW1lbnQ7XG5cdFx0XHRjb21tZW50cy5ibG9ja0NvbW1lbnRTdGFydFRva2VuID0gYmxvY2tTdGFydDtcblx0XHRcdGNvbW1lbnRzLmJsb2NrQ29tbWVudEVuZFRva2VuID0gYmxvY2tFbmQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbW1lbnRzO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQXlCLGlCQUFpQixvQkFBb0I7QUFDdkUsWUFBWSxhQUFhO0FBRXpCLFNBQVMscUJBQXFCLGlDQUFpQztBQUMvRCxTQUE4Rix3QkFBc0U7QUFDcEssU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JE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
