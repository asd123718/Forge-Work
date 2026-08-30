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
import * as nls from "../../../../nls.js";
import { parse, getNodeType } from "../../../../base/common/json.js";
import * as types from "../../../../base/common/types.js";
import { IndentAction } from "../../../../editor/common/languages/languageConfiguration.js";
import { ILanguageConfigurationService } from "../../../../editor/common/languages/languageConfigurationRegistry.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { Extensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { getParseErrorMessage } from "../../../../base/common/jsonErrorMessages.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { hash } from "../../../../base/common/hash.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
function isStringArr(something) {
  if (!Array.isArray(something)) {
    return false;
  }
  for (let i = 0, len = something.length; i < len; i++) {
    if (typeof something[i] !== "string") {
      return false;
    }
  }
  return true;
}
function isCharacterPair(something) {
  return isStringArr(something) && something.length === 2;
}
let LanguageConfigurationFileHandler = class extends Disposable {
  constructor(_languageService, _extensionResourceLoaderService, _extensionService, _languageConfigurationService) {
    super();
    this._languageService = _languageService;
    this._extensionResourceLoaderService = _extensionResourceLoaderService;
    this._extensionService = _extensionService;
    this._languageConfigurationService = _languageConfigurationService;
    /**
     * A map from language id to a hash computed from the config files locations.
     */
    this._done = /* @__PURE__ */ new Map();
    this._register(this._languageService.onDidRequestBasicLanguageFeatures(async (languageIdentifier) => {
      this._extensionService.whenInstalledExtensionsRegistered().then(() => {
        this._loadConfigurationsForMode(languageIdentifier);
      });
    }));
    this._register(this._languageService.onDidChange(() => {
      for (const [languageId] of this._done) {
        this._loadConfigurationsForMode(languageId);
      }
    }));
  }
  async _loadConfigurationsForMode(languageId) {
    const configurationFiles = this._languageService.getConfigurationFiles(languageId);
    const configurationHash = hash(configurationFiles.map((uri) => uri.toString()));
    if (this._done.get(languageId) === configurationHash) {
      return;
    }
    this._done.set(languageId, configurationHash);
    const configs = await Promise.all(configurationFiles.map((configFile) => this._readConfigFile(configFile)));
    for (const config of configs) {
      this._handleConfig(languageId, config);
    }
  }
  async _readConfigFile(configFileLocation) {
    try {
      const contents = await this._extensionResourceLoaderService.readExtensionResource(configFileLocation);
      const errors = [];
      let configuration = parse(contents, errors);
      if (errors.length) {
        console.error(nls.localize("parseErrors", "Errors parsing {0}: {1}", configFileLocation.toString(), errors.map((e) => `[${e.offset}, ${e.length}] ${getParseErrorMessage(e.error)}`).join("\n")));
      }
      if (getNodeType(configuration) !== "object") {
        console.error(nls.localize("formatError", "{0}: Invalid format, JSON object expected.", configFileLocation.toString()));
        configuration = {};
      }
      return configuration;
    } catch (err) {
      console.error(err);
      return {};
    }
  }
  static _extractValidCommentRule(languageId, configuration) {
    const source = configuration.comments;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!types.isObject(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`comments\` to be an object.`);
      return void 0;
    }
    let result = void 0;
    if (typeof source.lineComment !== "undefined") {
      if (typeof source.lineComment === "string") {
        result = result || {};
        result.lineComment = source.lineComment;
      } else if (types.isObject(source.lineComment)) {
        const lineCommentObj = source.lineComment;
        if (typeof lineCommentObj.comment === "string") {
          result = result || {};
          result.lineComment = {
            comment: lineCommentObj.comment,
            noIndent: lineCommentObj.noIndent
          };
        } else {
          console.warn(`[${languageId}]: language configuration: expected \`comments.lineComment.comment\` to be a string.`);
        }
      } else {
        console.warn(`[${languageId}]: language configuration: expected \`comments.lineComment\` to be a string or an object with comment property.`);
      }
    }
    if (typeof source.blockComment !== "undefined") {
      if (!isCharacterPair(source.blockComment)) {
        console.warn(`[${languageId}]: language configuration: expected \`comments.blockComment\` to be an array of two strings.`);
      } else {
        result = result || {};
        result.blockComment = source.blockComment;
      }
    }
    return result;
  }
  static _extractValidBrackets(languageId, configuration) {
    const source = configuration.brackets;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`brackets\` to be an array.`);
      return void 0;
    }
    let result = void 0;
    for (let i = 0, len = source.length; i < len; i++) {
      const pair = source[i];
      if (!isCharacterPair(pair)) {
        console.warn(`[${languageId}]: language configuration: expected \`brackets[${i}]\` to be an array of two strings.`);
        continue;
      }
      result = result || [];
      result.push(pair);
    }
    return result;
  }
  static _extractValidAutoClosingPairs(languageId, configuration) {
    const source = configuration.autoClosingPairs;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs\` to be an array.`);
      return void 0;
    }
    let result = void 0;
    for (let i = 0, len = source.length; i < len; i++) {
      const pair = source[i];
      if (Array.isArray(pair)) {
        if (!isCharacterPair(pair)) {
          console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
          continue;
        }
        result = result || [];
        result.push({ open: pair[0], close: pair[1] });
      } else {
        if (!types.isObject(pair)) {
          console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}]\` to be an array of two strings or an object.`);
          continue;
        }
        if (typeof pair.open !== "string") {
          console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}].open\` to be a string.`);
          continue;
        }
        if (typeof pair.close !== "string") {
          console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}].close\` to be a string.`);
          continue;
        }
        if (typeof pair.notIn !== "undefined") {
          if (!isStringArr(pair.notIn)) {
            console.warn(`[${languageId}]: language configuration: expected \`autoClosingPairs[${i}].notIn\` to be a string array.`);
            continue;
          }
        }
        result = result || [];
        result.push({ open: pair.open, close: pair.close, notIn: pair.notIn });
      }
    }
    return result;
  }
  static _extractValidSurroundingPairs(languageId, configuration) {
    const source = configuration.surroundingPairs;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs\` to be an array.`);
      return void 0;
    }
    let result = void 0;
    for (let i = 0, len = source.length; i < len; i++) {
      const pair = source[i];
      if (Array.isArray(pair)) {
        if (!isCharacterPair(pair)) {
          console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
          continue;
        }
        result = result || [];
        result.push({ open: pair[0], close: pair[1] });
      } else {
        if (!types.isObject(pair)) {
          console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}]\` to be an array of two strings or an object.`);
          continue;
        }
        if (typeof pair.open !== "string") {
          console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}].open\` to be a string.`);
          continue;
        }
        if (typeof pair.close !== "string") {
          console.warn(`[${languageId}]: language configuration: expected \`surroundingPairs[${i}].close\` to be a string.`);
          continue;
        }
        result = result || [];
        result.push({ open: pair.open, close: pair.close });
      }
    }
    return result;
  }
  static _extractValidColorizedBracketPairs(languageId, configuration) {
    const source = configuration.colorizedBracketPairs;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`colorizedBracketPairs\` to be an array.`);
      return void 0;
    }
    const result = [];
    for (let i = 0, len = source.length; i < len; i++) {
      const pair = source[i];
      if (!isCharacterPair(pair)) {
        console.warn(`[${languageId}]: language configuration: expected \`colorizedBracketPairs[${i}]\` to be an array of two strings.`);
        continue;
      }
      result.push([pair[0], pair[1]]);
    }
    return result;
  }
  static _extractValidOnEnterRules(languageId, configuration) {
    const source = configuration.onEnterRules;
    if (typeof source === "undefined") {
      return void 0;
    }
    if (!Array.isArray(source)) {
      console.warn(`[${languageId}]: language configuration: expected \`onEnterRules\` to be an array.`);
      return void 0;
    }
    let result = void 0;
    for (let i = 0, len = source.length; i < len; i++) {
      const onEnterRule = source[i];
      if (!types.isObject(onEnterRule)) {
        console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}]\` to be an object.`);
        continue;
      }
      if (!types.isObject(onEnterRule.action)) {
        console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action\` to be an object.`);
        continue;
      }
      let indentAction;
      if (onEnterRule.action.indent === "none") {
        indentAction = IndentAction.None;
      } else if (onEnterRule.action.indent === "indent") {
        indentAction = IndentAction.Indent;
      } else if (onEnterRule.action.indent === "indentOutdent") {
        indentAction = IndentAction.IndentOutdent;
      } else if (onEnterRule.action.indent === "outdent") {
        indentAction = IndentAction.Outdent;
      } else {
        console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action.indent\` to be 'none', 'indent', 'indentOutdent' or 'outdent'.`);
        continue;
      }
      const action = { indentAction };
      if (onEnterRule.action.appendText) {
        if (typeof onEnterRule.action.appendText === "string") {
          action.appendText = onEnterRule.action.appendText;
        } else {
          console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action.appendText\` to be undefined or a string.`);
        }
      }
      if (onEnterRule.action.removeText) {
        if (typeof onEnterRule.action.removeText === "number") {
          action.removeText = onEnterRule.action.removeText;
        } else {
          console.warn(`[${languageId}]: language configuration: expected \`onEnterRules[${i}].action.removeText\` to be undefined or a number.`);
        }
      }
      const beforeText = this._parseRegex(languageId, `onEnterRules[${i}].beforeText`, onEnterRule.beforeText);
      if (!beforeText) {
        continue;
      }
      const resultingOnEnterRule = { beforeText, action };
      if (onEnterRule.afterText) {
        const afterText = this._parseRegex(languageId, `onEnterRules[${i}].afterText`, onEnterRule.afterText);
        if (afterText) {
          resultingOnEnterRule.afterText = afterText;
        }
      }
      if (onEnterRule.previousLineText) {
        const previousLineText = this._parseRegex(languageId, `onEnterRules[${i}].previousLineText`, onEnterRule.previousLineText);
        if (previousLineText) {
          resultingOnEnterRule.previousLineText = previousLineText;
        }
      }
      result = result || [];
      result.push(resultingOnEnterRule);
    }
    return result;
  }
  static extractValidConfig(languageId, configuration) {
    const comments = this._extractValidCommentRule(languageId, configuration);
    const brackets = this._extractValidBrackets(languageId, configuration);
    const autoClosingPairs = this._extractValidAutoClosingPairs(languageId, configuration);
    const surroundingPairs = this._extractValidSurroundingPairs(languageId, configuration);
    const colorizedBracketPairs = this._extractValidColorizedBracketPairs(languageId, configuration);
    const autoCloseBefore = typeof configuration.autoCloseBefore === "string" ? configuration.autoCloseBefore : void 0;
    const wordPattern = configuration.wordPattern ? this._parseRegex(languageId, `wordPattern`, configuration.wordPattern) : void 0;
    const indentationRules = configuration.indentationRules ? this._mapIndentationRules(languageId, configuration.indentationRules) : void 0;
    let folding = void 0;
    if (configuration.folding) {
      const rawMarkers = configuration.folding.markers;
      const startMarker = rawMarkers && rawMarkers.start ? this._parseRegex(languageId, `folding.markers.start`, rawMarkers.start) : void 0;
      const endMarker = rawMarkers && rawMarkers.end ? this._parseRegex(languageId, `folding.markers.end`, rawMarkers.end) : void 0;
      const markers = startMarker && endMarker ? { start: startMarker, end: endMarker } : void 0;
      folding = {
        offSide: configuration.folding.offSide,
        markers
      };
    }
    const onEnterRules = this._extractValidOnEnterRules(languageId, configuration);
    const richEditConfig = {
      comments,
      brackets,
      wordPattern,
      indentationRules,
      onEnterRules,
      autoClosingPairs,
      surroundingPairs,
      colorizedBracketPairs,
      autoCloseBefore,
      folding,
      __electricCharacterSupport: void 0
    };
    return richEditConfig;
  }
  _handleConfig(languageId, configuration) {
    const richEditConfig = LanguageConfigurationFileHandler.extractValidConfig(languageId, configuration);
    this._languageConfigurationService.register(languageId, richEditConfig, 50);
  }
  static _parseRegex(languageId, confPath, value) {
    if (typeof value === "string") {
      try {
        return new RegExp(value, "");
      } catch (err) {
        console.warn(`[${languageId}]: Invalid regular expression in \`${confPath}\`: `, err);
        return void 0;
      }
    }
    if (types.isObject(value)) {
      if (typeof value.pattern !== "string") {
        console.warn(`[${languageId}]: language configuration: expected \`${confPath}.pattern\` to be a string.`);
        return void 0;
      }
      if (typeof value.flags !== "undefined" && typeof value.flags !== "string") {
        console.warn(`[${languageId}]: language configuration: expected \`${confPath}.flags\` to be a string.`);
        return void 0;
      }
      try {
        return new RegExp(value.pattern, value.flags);
      } catch (err) {
        console.warn(`[${languageId}]: Invalid regular expression in \`${confPath}\`: `, err);
        return void 0;
      }
    }
    console.warn(`[${languageId}]: language configuration: expected \`${confPath}\` to be a string or an object.`);
    return void 0;
  }
  static _mapIndentationRules(languageId, indentationRules) {
    const increaseIndentPattern = this._parseRegex(languageId, `indentationRules.increaseIndentPattern`, indentationRules.increaseIndentPattern);
    if (!increaseIndentPattern) {
      return void 0;
    }
    const decreaseIndentPattern = this._parseRegex(languageId, `indentationRules.decreaseIndentPattern`, indentationRules.decreaseIndentPattern);
    if (!decreaseIndentPattern) {
      return void 0;
    }
    const result = {
      increaseIndentPattern,
      decreaseIndentPattern
    };
    if (indentationRules.indentNextLinePattern) {
      result.indentNextLinePattern = this._parseRegex(languageId, `indentationRules.indentNextLinePattern`, indentationRules.indentNextLinePattern);
    }
    if (indentationRules.unIndentedLinePattern) {
      result.unIndentedLinePattern = this._parseRegex(languageId, `indentationRules.unIndentedLinePattern`, indentationRules.unIndentedLinePattern);
    }
    return result;
  }
};
LanguageConfigurationFileHandler = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, IExtensionResourceLoaderService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, ILanguageConfigurationService)
], LanguageConfigurationFileHandler);
const schemaId = "vscode://schemas/language-configuration";
const schema = {
  allowComments: true,
  allowTrailingCommas: true,
  default: {
    comments: {
      blockComment: ["/*", "*/"],
      lineComment: "//"
    },
    brackets: [["(", ")"], ["[", "]"], ["{", "}"]],
    autoClosingPairs: [["(", ")"], ["[", "]"], ["{", "}"]],
    surroundingPairs: [["(", ")"], ["[", "]"], ["{", "}"]]
  },
  definitions: {
    openBracket: {
      type: "string",
      description: nls.localize("schema.openBracket", "The opening bracket character or string sequence.")
    },
    closeBracket: {
      type: "string",
      description: nls.localize("schema.closeBracket", "The closing bracket character or string sequence.")
    },
    bracketPair: {
      type: "array",
      items: [{
        $ref: "#/definitions/openBracket"
      }, {
        $ref: "#/definitions/closeBracket"
      }]
    }
  },
  properties: {
    comments: {
      default: {
        blockComment: ["/*", "*/"],
        lineComment: { comment: "//", noIndent: false }
      },
      description: nls.localize("schema.comments", "Defines the comment symbols"),
      type: "object",
      properties: {
        blockComment: {
          type: "array",
          description: nls.localize("schema.blockComments", "Defines how block comments are marked."),
          items: [{
            type: "string",
            description: nls.localize("schema.blockComment.begin", "The character sequence that starts a block comment.")
          }, {
            type: "string",
            description: nls.localize("schema.blockComment.end", "The character sequence that ends a block comment.")
          }]
        },
        lineComment: {
          type: "object",
          description: nls.localize("schema.lineComment.object", "Configuration for line comments."),
          properties: {
            comment: {
              type: "string",
              description: nls.localize("schema.lineComment.comment", "The character sequence that starts a line comment.")
            },
            noIndent: {
              type: "boolean",
              description: nls.localize("schema.lineComment.noIndent", "Whether the comment token should not be indented and placed at the first column. Defaults to false."),
              default: false
            }
          },
          required: ["comment"],
          additionalProperties: false
        }
      }
    },
    brackets: {
      default: [["(", ")"], ["[", "]"], ["{", "}"]],
      markdownDescription: nls.localize("schema.brackets", "Defines the bracket symbols that increase or decrease the indentation. When bracket pair colorization is enabled and {0} is not defined, this also defines the bracket pairs that are colorized by their nesting level.", "`colorizedBracketPairs`"),
      type: "array",
      items: {
        $ref: "#/definitions/bracketPair"
      }
    },
    colorizedBracketPairs: {
      default: [["(", ")"], ["[", "]"], ["{", "}"]],
      markdownDescription: nls.localize("schema.colorizedBracketPairs", "Defines the bracket pairs that are colorized by their nesting level if bracket pair colorization is enabled. Any brackets included here that are not included in {0} will be automatically included in {0}.", "`brackets`"),
      type: "array",
      items: {
        $ref: "#/definitions/bracketPair"
      }
    },
    autoClosingPairs: {
      default: [["(", ")"], ["[", "]"], ["{", "}"]],
      description: nls.localize("schema.autoClosingPairs", "Defines the bracket pairs. When a opening bracket is entered, the closing bracket is inserted automatically."),
      type: "array",
      items: {
        oneOf: [{
          $ref: "#/definitions/bracketPair"
        }, {
          type: "object",
          properties: {
            open: {
              $ref: "#/definitions/openBracket"
            },
            close: {
              $ref: "#/definitions/closeBracket"
            },
            notIn: {
              type: "array",
              description: nls.localize("schema.autoClosingPairs.notIn", "Defines a list of scopes where the auto pairs are disabled."),
              items: {
                enum: ["string", "comment"]
              }
            }
          }
        }]
      }
    },
    autoCloseBefore: {
      default: ";:.,=}])> \n	",
      description: nls.localize("schema.autoCloseBefore", "Defines what characters must be after the cursor in order for bracket or quote autoclosing to occur when using the 'languageDefined' autoclosing setting. This is typically the set of characters which can not start an expression."),
      type: "string"
    },
    surroundingPairs: {
      default: [["(", ")"], ["[", "]"], ["{", "}"]],
      description: nls.localize("schema.surroundingPairs", "Defines the bracket pairs that can be used to surround a selected string."),
      type: "array",
      items: {
        oneOf: [{
          $ref: "#/definitions/bracketPair"
        }, {
          type: "object",
          properties: {
            open: {
              $ref: "#/definitions/openBracket"
            },
            close: {
              $ref: "#/definitions/closeBracket"
            }
          }
        }]
      }
    },
    wordPattern: {
      default: "",
      description: nls.localize("schema.wordPattern", "Defines what is considered to be a word in the programming language."),
      type: ["string", "object"],
      properties: {
        pattern: {
          type: "string",
          description: nls.localize("schema.wordPattern.pattern", "The RegExp pattern used to match words."),
          default: ""
        },
        flags: {
          type: "string",
          description: nls.localize("schema.wordPattern.flags", "The RegExp flags used to match words."),
          default: "g",
          pattern: "^([gimuy]+)$",
          patternErrorMessage: nls.localize("schema.wordPattern.flags.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
        }
      }
    },
    indentationRules: {
      default: {
        increaseIndentPattern: "",
        decreaseIndentPattern: ""
      },
      description: nls.localize("schema.indentationRules", "The language's indentation settings."),
      type: "object",
      properties: {
        increaseIndentPattern: {
          type: ["string", "object"],
          description: nls.localize("schema.indentationRules.increaseIndentPattern", "If a line matches this pattern, then all the lines after it should be indented once (until another rule matches)."),
          properties: {
            pattern: {
              type: "string",
              description: nls.localize("schema.indentationRules.increaseIndentPattern.pattern", "The RegExp pattern for increaseIndentPattern."),
              default: ""
            },
            flags: {
              type: "string",
              description: nls.localize("schema.indentationRules.increaseIndentPattern.flags", "The RegExp flags for increaseIndentPattern."),
              default: "",
              pattern: "^([gimuy]+)$",
              patternErrorMessage: nls.localize("schema.indentationRules.increaseIndentPattern.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
            }
          }
        },
        decreaseIndentPattern: {
          type: ["string", "object"],
          description: nls.localize("schema.indentationRules.decreaseIndentPattern", "If a line matches this pattern, then all the lines after it should be unindented once (until another rule matches)."),
          properties: {
            pattern: {
              type: "string",
              description: nls.localize("schema.indentationRules.decreaseIndentPattern.pattern", "The RegExp pattern for decreaseIndentPattern."),
              default: ""
            },
            flags: {
              type: "string",
              description: nls.localize("schema.indentationRules.decreaseIndentPattern.flags", "The RegExp flags for decreaseIndentPattern."),
              default: "",
              pattern: "^([gimuy]+)$",
              patternErrorMessage: nls.localize("schema.indentationRules.decreaseIndentPattern.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
            }
          }
        },
        indentNextLinePattern: {
          type: ["string", "object"],
          description: nls.localize("schema.indentationRules.indentNextLinePattern", "If a line matches this pattern, then **only the next line** after it should be indented once."),
          properties: {
            pattern: {
              type: "string",
              description: nls.localize("schema.indentationRules.indentNextLinePattern.pattern", "The RegExp pattern for indentNextLinePattern."),
              default: ""
            },
            flags: {
              type: "string",
              description: nls.localize("schema.indentationRules.indentNextLinePattern.flags", "The RegExp flags for indentNextLinePattern."),
              default: "",
              pattern: "^([gimuy]+)$",
              patternErrorMessage: nls.localize("schema.indentationRules.indentNextLinePattern.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
            }
          }
        },
        unIndentedLinePattern: {
          type: ["string", "object"],
          description: nls.localize("schema.indentationRules.unIndentedLinePattern", "If a line matches this pattern, then its indentation should not be changed and it should not be evaluated against the other rules."),
          properties: {
            pattern: {
              type: "string",
              description: nls.localize("schema.indentationRules.unIndentedLinePattern.pattern", "The RegExp pattern for unIndentedLinePattern."),
              default: ""
            },
            flags: {
              type: "string",
              description: nls.localize("schema.indentationRules.unIndentedLinePattern.flags", "The RegExp flags for unIndentedLinePattern."),
              default: "",
              pattern: "^([gimuy]+)$",
              patternErrorMessage: nls.localize("schema.indentationRules.unIndentedLinePattern.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
            }
          }
        }
      }
    },
    folding: {
      type: "object",
      description: nls.localize("schema.folding", "The language's folding settings."),
      properties: {
        offSide: {
          type: "boolean",
          description: nls.localize("schema.folding.offSide", "A language adheres to the off-side rule if blocks in that language are expressed by their indentation. If set, empty lines belong to the subsequent block.")
        },
        markers: {
          type: "object",
          description: nls.localize("schema.folding.markers", "Language specific folding markers such as '#region' and '#endregion'. The start and end regexes will be tested against the contents of all lines and must be designed efficiently"),
          properties: {
            start: {
              type: ["string", "object"],
              description: nls.localize("schema.folding.markers.start", "The RegExp pattern for the start marker. The regexp must start with '^'."),
              properties: {
                pattern: {
                  type: "string",
                  description: nls.localize("schema.folding.markers.start.pattern", "The RegExp pattern for the start marker."),
                  default: ""
                },
                flags: {
                  type: "string",
                  description: nls.localize("schema.folding.markers.start.flags", "The RegExp flags for the start marker."),
                  default: "",
                  pattern: "^([gimuy]+)$",
                  patternErrorMessage: nls.localize("schema.folding.markers.start.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
                }
              }
            },
            end: {
              type: ["string", "object"],
              description: nls.localize("schema.folding.markers.end", "The RegExp pattern for the end marker. The regexp must start with '^'."),
              properties: {
                pattern: {
                  type: "string",
                  description: nls.localize("schema.folding.markers.end.pattern", "The RegExp pattern for the end marker."),
                  default: ""
                },
                flags: {
                  type: "string",
                  description: nls.localize("schema.folding.markers.end.flags", "The RegExp flags for the end marker."),
                  default: "",
                  pattern: "^([gimuy]+)$",
                  patternErrorMessage: nls.localize("schema.folding.markers.end.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
                }
              }
            }
          }
        }
      }
    },
    onEnterRules: {
      type: "array",
      description: nls.localize("schema.onEnterRules", "The language's rules to be evaluated when pressing Enter."),
      items: {
        type: "object",
        description: nls.localize("schema.onEnterRules", "The language's rules to be evaluated when pressing Enter."),
        required: ["beforeText", "action"],
        properties: {
          beforeText: {
            type: ["string", "object"],
            description: nls.localize("schema.onEnterRules.beforeText", "This rule will only execute if the text before the cursor matches this regular expression."),
            properties: {
              pattern: {
                type: "string",
                description: nls.localize("schema.onEnterRules.beforeText.pattern", "The RegExp pattern for beforeText."),
                default: ""
              },
              flags: {
                type: "string",
                description: nls.localize("schema.onEnterRules.beforeText.flags", "The RegExp flags for beforeText."),
                default: "",
                pattern: "^([gimuy]+)$",
                patternErrorMessage: nls.localize("schema.onEnterRules.beforeText.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
              }
            }
          },
          afterText: {
            type: ["string", "object"],
            description: nls.localize("schema.onEnterRules.afterText", "This rule will only execute if the text after the cursor matches this regular expression."),
            properties: {
              pattern: {
                type: "string",
                description: nls.localize("schema.onEnterRules.afterText.pattern", "The RegExp pattern for afterText."),
                default: ""
              },
              flags: {
                type: "string",
                description: nls.localize("schema.onEnterRules.afterText.flags", "The RegExp flags for afterText."),
                default: "",
                pattern: "^([gimuy]+)$",
                patternErrorMessage: nls.localize("schema.onEnterRules.afterText.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
              }
            }
          },
          previousLineText: {
            type: ["string", "object"],
            description: nls.localize("schema.onEnterRules.previousLineText", "This rule will only execute if the text above the line matches this regular expression."),
            properties: {
              pattern: {
                type: "string",
                description: nls.localize("schema.onEnterRules.previousLineText.pattern", "The RegExp pattern for previousLineText."),
                default: ""
              },
              flags: {
                type: "string",
                description: nls.localize("schema.onEnterRules.previousLineText.flags", "The RegExp flags for previousLineText."),
                default: "",
                pattern: "^([gimuy]+)$",
                patternErrorMessage: nls.localize("schema.onEnterRules.previousLineText.errorMessage", "Must match the pattern `/^([gimuy]+)$/`.")
              }
            }
          },
          action: {
            type: ["string", "object"],
            description: nls.localize("schema.onEnterRules.action", "The action to execute."),
            required: ["indent"],
            default: { "indent": "indent" },
            properties: {
              indent: {
                type: "string",
                description: nls.localize("schema.onEnterRules.action.indent", "Describe what to do with the indentation"),
                default: "indent",
                enum: ["none", "indent", "indentOutdent", "outdent"],
                markdownEnumDescriptions: [
                  nls.localize("schema.onEnterRules.action.indent.none", "Insert new line and copy the previous line's indentation."),
                  nls.localize("schema.onEnterRules.action.indent.indent", "Insert new line and indent once (relative to the previous line's indentation)."),
                  nls.localize("schema.onEnterRules.action.indent.indentOutdent", "Insert two new lines:\n - the first one indented which will hold the cursor\n - the second one at the same indentation level"),
                  nls.localize("schema.onEnterRules.action.indent.outdent", "Insert new line and outdent once (relative to the previous line's indentation).")
                ]
              },
              appendText: {
                type: "string",
                description: nls.localize("schema.onEnterRules.action.appendText", "Describes text to be appended after the new line and after the indentation."),
                default: ""
              },
              removeText: {
                type: "number",
                description: nls.localize("schema.onEnterRules.action.removeText", "Describes the number of characters to remove from the new line's indentation."),
                default: 0
              }
            }
          }
        }
      }
    }
  }
};
const schemaRegistry = Registry.as(Extensions.JSONContribution);
schemaRegistry.registerSchema(schemaId, schema);
export {
  LanguageConfigurationFileHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGNvbW1vblxcbGFuZ3VhZ2VDb25maWd1cmF0aW9uRXh0ZW5zaW9uUG9pbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFBhcnNlRXJyb3IsIHBhcnNlLCBnZXROb2RlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDaGFyYWN0ZXJQYWlyLCBDb21tZW50UnVsZSwgRW50ZXJBY3Rpb24sIEV4cGxpY2l0TGFuZ3VhZ2VDb25maWd1cmF0aW9uLCBGb2xkaW5nTWFya2VycywgRm9sZGluZ1J1bGVzLCBJQXV0b0Nsb3NpbmdQYWlyLCBJQXV0b0Nsb3NpbmdQYWlyQ29uZGl0aW9uYWwsIEluZGVudEFjdGlvbiwgSW5kZW50YXRpb25SdWxlLCBPbkVudGVyUnVsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZ2V0UGFyc2VFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRXJyb3JNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIvY29tbW9uL2V4dGVuc2lvblJlc291cmNlTG9hZGVyLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5pbnRlcmZhY2UgSVJlZ0V4cCB7XG5cdHBhdHRlcm46IHN0cmluZztcblx0ZmxhZ3M/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJSW5kZW50YXRpb25SdWxlcyB7XG5cdGRlY3JlYXNlSW5kZW50UGF0dGVybjogc3RyaW5nIHwgSVJlZ0V4cDtcblx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiBzdHJpbmcgfCBJUmVnRXhwO1xuXHRpbmRlbnROZXh0TGluZVBhdHRlcm4/OiBzdHJpbmcgfCBJUmVnRXhwO1xuXHR1bkluZGVudGVkTGluZVBhdHRlcm4/OiBzdHJpbmcgfCBJUmVnRXhwO1xufVxuXG5pbnRlcmZhY2UgSUVudGVyQWN0aW9uIHtcblx0aW5kZW50OiAnbm9uZScgfCAnaW5kZW50JyB8ICdpbmRlbnRPdXRkZW50JyB8ICdvdXRkZW50Jztcblx0YXBwZW5kVGV4dD86IHN0cmluZztcblx0cmVtb3ZlVGV4dD86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElPbkVudGVyUnVsZSB7XG5cdGJlZm9yZVRleHQ6IHN0cmluZyB8IElSZWdFeHA7XG5cdGFmdGVyVGV4dD86IHN0cmluZyB8IElSZWdFeHA7XG5cdHByZXZpb3VzTGluZVRleHQ/OiBzdHJpbmcgfCBJUmVnRXhwO1xuXHRhY3Rpb246IElFbnRlckFjdGlvbjtcbn1cblxuLyoqXG4gKiBTZXJpYWxpemVkIGZvcm0gb2YgYSBsYW5ndWFnZSBjb25maWd1cmF0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlQ29uZmlndXJhdGlvbiB7XG5cdGNvbW1lbnRzPzogQ29tbWVudFJ1bGU7XG5cdGJyYWNrZXRzPzogQ2hhcmFjdGVyUGFpcltdO1xuXHRhdXRvQ2xvc2luZ1BhaXJzPzogQXJyYXk8Q2hhcmFjdGVyUGFpciB8IElBdXRvQ2xvc2luZ1BhaXJDb25kaXRpb25hbD47XG5cdHN1cnJvdW5kaW5nUGFpcnM/OiBBcnJheTxDaGFyYWN0ZXJQYWlyIHwgSUF1dG9DbG9zaW5nUGFpcj47XG5cdGNvbG9yaXplZEJyYWNrZXRQYWlycz86IEFycmF5PENoYXJhY3RlclBhaXI+O1xuXHR3b3JkUGF0dGVybj86IHN0cmluZyB8IElSZWdFeHA7XG5cdGluZGVudGF0aW9uUnVsZXM/OiBJSW5kZW50YXRpb25SdWxlcztcblx0Zm9sZGluZz86IHtcblx0XHRvZmZTaWRlPzogYm9vbGVhbjtcblx0XHRtYXJrZXJzPzoge1xuXHRcdFx0c3RhcnQ/OiBzdHJpbmcgfCBJUmVnRXhwO1xuXHRcdFx0ZW5kPzogc3RyaW5nIHwgSVJlZ0V4cDtcblx0XHR9O1xuXHR9O1xuXHRhdXRvQ2xvc2VCZWZvcmU/OiBzdHJpbmc7XG5cdG9uRW50ZXJSdWxlcz86IElPbkVudGVyUnVsZVtdO1xufVxuXG5mdW5jdGlvbiBpc1N0cmluZ0Fycihzb21ldGhpbmc6IHN0cmluZ1tdIHwgbnVsbCk6IHNvbWV0aGluZyBpcyBzdHJpbmdbXSB7XG5cdGlmICghQXJyYXkuaXNBcnJheShzb21ldGhpbmcpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSBzb21ldGhpbmcubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRpZiAodHlwZW9mIHNvbWV0aGluZ1tpXSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHRydWU7XG5cbn1cblxuZnVuY3Rpb24gaXNDaGFyYWN0ZXJQYWlyKHNvbWV0aGluZzogQ2hhcmFjdGVyUGFpciB8IG51bGwpOiBib29sZWFuIHtcblx0cmV0dXJuIChcblx0XHRpc1N0cmluZ0Fycihzb21ldGhpbmcpXG5cdFx0JiYgc29tZXRoaW5nLmxlbmd0aCA9PT0gMlxuXHQpO1xufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VDb25maWd1cmF0aW9uRmlsZUhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogQSBtYXAgZnJvbSBsYW5ndWFnZSBpZCB0byBhIGhhc2ggY29tcHV0ZWQgZnJvbSB0aGUgY29uZmlnIGZpbGVzIGxvY2F0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbmUgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2U6IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhbmd1YWdlU2VydmljZS5vbkRpZFJlcXVlc3RCYXNpY0xhbmd1YWdlRmVhdHVyZXMoYXN5bmMgKGxhbmd1YWdlSWRlbnRpZmllcikgPT4ge1xuXHRcdFx0Ly8gTW9kZXMgY2FuIGJlIGluc3RhbnRpYXRlZCBiZWZvcmUgdGhlIGV4dGVuc2lvbiBwb2ludHMgaGF2ZSBmaW5pc2hlZCByZWdpc3RlcmluZ1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKS50aGVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9hZENvbmZpZ3VyYXRpb25zRm9yTW9kZShsYW5ndWFnZUlkZW50aWZpZXIpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhbmd1YWdlU2VydmljZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHQvLyByZWxvYWQgbGFuZ3VhZ2UgY29uZmlndXJhdGlvbnMgYXMgbmVjZXNzYXJ5XG5cdFx0XHRmb3IgKGNvbnN0IFtsYW5ndWFnZUlkXSBvZiB0aGlzLl9kb25lKSB7XG5cdFx0XHRcdHRoaXMuX2xvYWRDb25maWd1cmF0aW9uc0Zvck1vZGUobGFuZ3VhZ2VJZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZENvbmZpZ3VyYXRpb25zRm9yTW9kZShsYW5ndWFnZUlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uRmlsZXMgPSB0aGlzLl9sYW5ndWFnZVNlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbkZpbGVzKGxhbmd1YWdlSWQpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25IYXNoID0gaGFzaChjb25maWd1cmF0aW9uRmlsZXMubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSkpO1xuXG5cdFx0aWYgKHRoaXMuX2RvbmUuZ2V0KGxhbmd1YWdlSWQpID09PSBjb25maWd1cmF0aW9uSGFzaCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9kb25lLnNldChsYW5ndWFnZUlkLCBjb25maWd1cmF0aW9uSGFzaCk7XG5cblx0XHRjb25zdCBjb25maWdzID0gYXdhaXQgUHJvbWlzZS5hbGwoY29uZmlndXJhdGlvbkZpbGVzLm1hcChjb25maWdGaWxlID0+IHRoaXMuX3JlYWRDb25maWdGaWxlKGNvbmZpZ0ZpbGUpKSk7XG5cdFx0Zm9yIChjb25zdCBjb25maWcgb2YgY29uZmlncykge1xuXHRcdFx0dGhpcy5faGFuZGxlQ29uZmlnKGxhbmd1YWdlSWQsIGNvbmZpZyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZENvbmZpZ0ZpbGUoY29uZmlnRmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMYW5ndWFnZUNvbmZpZ3VyYXRpb24+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLl9leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKGNvbmZpZ0ZpbGVMb2NhdGlvbik7XG5cdFx0XHRjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0bGV0IGNvbmZpZ3VyYXRpb24gPSA8SUxhbmd1YWdlQ29uZmlndXJhdGlvbj5wYXJzZShjb250ZW50cywgZXJyb3JzKTtcblx0XHRcdGlmIChlcnJvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IobmxzLmxvY2FsaXplKCdwYXJzZUVycm9ycycsIFwiRXJyb3JzIHBhcnNpbmcgezB9OiB7MX1cIiwgY29uZmlnRmlsZUxvY2F0aW9uLnRvU3RyaW5nKCksIGVycm9ycy5tYXAoZSA9PiAoYFske2Uub2Zmc2V0fSwgJHtlLmxlbmd0aH1dICR7Z2V0UGFyc2VFcnJvck1lc3NhZ2UoZS5lcnJvcil9YCkpLmpvaW4oJ1xcbicpKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZ2V0Tm9kZVR5cGUoY29uZmlndXJhdGlvbikgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IobmxzLmxvY2FsaXplKCdmb3JtYXRFcnJvcicsIFwiezB9OiBJbnZhbGlkIGZvcm1hdCwgSlNPTiBvYmplY3QgZXhwZWN0ZWQuXCIsIGNvbmZpZ0ZpbGVMb2NhdGlvbi50b1N0cmluZygpKSk7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb24gPSB7fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjb25maWd1cmF0aW9uO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlcnIpO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9leHRyYWN0VmFsaWRDb21tZW50UnVsZShsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElMYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiBDb21tZW50UnVsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc291cmNlID0gY29uZmlndXJhdGlvbi5jb21tZW50cztcblx0XHRpZiAodHlwZW9mIHNvdXJjZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdHlwZXMuaXNPYmplY3Qoc291cmNlKSkge1xuXHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGNvbW1lbnRzXFxgIHRvIGJlIGFuIG9iamVjdC5gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdDogQ29tbWVudFJ1bGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBzb3VyY2UubGluZUNvbW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRpZiAodHlwZW9mIHNvdXJjZS5saW5lQ29tbWVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0cmVzdWx0ID0gcmVzdWx0IHx8IHt9O1xuXHRcdFx0XHRyZXN1bHQubGluZUNvbW1lbnQgPSBzb3VyY2UubGluZUNvbW1lbnQ7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVzLmlzT2JqZWN0KHNvdXJjZS5saW5lQ29tbWVudCkpIHtcblx0XHRcdFx0Y29uc3QgbGluZUNvbW1lbnRPYmogPSBzb3VyY2UubGluZUNvbW1lbnQ7XG5cdFx0XHRcdGlmICh0eXBlb2YgbGluZUNvbW1lbnRPYmouY29tbWVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRyZXN1bHQgPSByZXN1bHQgfHwge307XG5cdFx0XHRcdFx0cmVzdWx0LmxpbmVDb21tZW50ID0ge1xuXHRcdFx0XHRcdFx0Y29tbWVudDogbGluZUNvbW1lbnRPYmouY29tbWVudCxcblx0XHRcdFx0XHRcdG5vSW5kZW50OiBsaW5lQ29tbWVudE9iai5ub0luZGVudFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGNvbW1lbnRzLmxpbmVDb21tZW50LmNvbW1lbnRcXGAgdG8gYmUgYSBzdHJpbmcuYCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBjb21tZW50cy5saW5lQ29tbWVudFxcYCB0byBiZSBhIHN0cmluZyBvciBhbiBvYmplY3Qgd2l0aCBjb21tZW50IHByb3BlcnR5LmApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodHlwZW9mIHNvdXJjZS5ibG9ja0NvbW1lbnQgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRpZiAoIWlzQ2hhcmFjdGVyUGFpcihzb3VyY2UuYmxvY2tDb21tZW50KSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgY29tbWVudHMuYmxvY2tDb21tZW50XFxgIHRvIGJlIGFuIGFycmF5IG9mIHR3byBzdHJpbmdzLmApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0ID0gcmVzdWx0IHx8IHt9O1xuXHRcdFx0XHRyZXN1bHQuYmxvY2tDb21tZW50ID0gc291cmNlLmJsb2NrQ29tbWVudDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9leHRyYWN0VmFsaWRCcmFja2V0cyhsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElMYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiBDaGFyYWN0ZXJQYWlyW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNvdXJjZSA9IGNvbmZpZ3VyYXRpb24uYnJhY2tldHM7XG5cdFx0aWYgKHR5cGVvZiBzb3VyY2UgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc291cmNlKSkge1xuXHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGJyYWNrZXRzXFxgIHRvIGJlIGFuIGFycmF5LmApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBDaGFyYWN0ZXJQYWlyW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNvdXJjZS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcGFpciA9IHNvdXJjZVtpXTtcblx0XHRcdGlmICghaXNDaGFyYWN0ZXJQYWlyKHBhaXIpKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBicmFja2V0c1ske2l9XVxcYCB0byBiZSBhbiBhcnJheSBvZiB0d28gc3RyaW5ncy5gKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBbXTtcblx0XHRcdHJlc3VsdC5wdXNoKHBhaXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2V4dHJhY3RWYWxpZEF1dG9DbG9zaW5nUGFpcnMobGFuZ3VhZ2VJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uKTogSUF1dG9DbG9zaW5nUGFpckNvbmRpdGlvbmFsW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNvdXJjZSA9IGNvbmZpZ3VyYXRpb24uYXV0b0Nsb3NpbmdQYWlycztcblx0XHRpZiAodHlwZW9mIHNvdXJjZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghQXJyYXkuaXNBcnJheShzb3VyY2UpKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgYXV0b0Nsb3NpbmdQYWlyc1xcYCB0byBiZSBhbiBhcnJheS5gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3VsdDogSUF1dG9DbG9zaW5nUGFpckNvbmRpdGlvbmFsW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNvdXJjZS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcGFpciA9IHNvdXJjZVtpXTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhaXIpKSB7XG5cdFx0XHRcdGlmICghaXNDaGFyYWN0ZXJQYWlyKHBhaXIpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGF1dG9DbG9zaW5nUGFpcnNbJHtpfV1cXGAgdG8gYmUgYW4gYXJyYXkgb2YgdHdvIHN0cmluZ3Mgb3IgYW4gb2JqZWN0LmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBbXTtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBvcGVuOiBwYWlyWzBdLCBjbG9zZTogcGFpclsxXSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghdHlwZXMuaXNPYmplY3QocGFpcikpIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgYXV0b0Nsb3NpbmdQYWlyc1ske2l9XVxcYCB0byBiZSBhbiBhcnJheSBvZiB0d28gc3RyaW5ncyBvciBhbiBvYmplY3QuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZiBwYWlyLm9wZW4gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGF1dG9DbG9zaW5nUGFpcnNbJHtpfV0ub3BlblxcYCB0byBiZSBhIHN0cmluZy5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZW9mIHBhaXIuY2xvc2UgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGF1dG9DbG9zaW5nUGFpcnNbJHtpfV0uY2xvc2VcXGAgdG8gYmUgYSBzdHJpbmcuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZiBwYWlyLm5vdEluICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdGlmICghaXNTdHJpbmdBcnIocGFpci5ub3RJbikpIHtcblx0XHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBhdXRvQ2xvc2luZ1BhaXJzWyR7aX1dLm5vdEluXFxgIHRvIGJlIGEgc3RyaW5nIGFycmF5LmApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBbXTtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBvcGVuOiBwYWlyLm9wZW4sIGNsb3NlOiBwYWlyLmNsb3NlLCBub3RJbjogcGFpci5ub3RJbiB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9leHRyYWN0VmFsaWRTdXJyb3VuZGluZ1BhaXJzKGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSUxhbmd1YWdlQ29uZmlndXJhdGlvbik6IElBdXRvQ2xvc2luZ1BhaXJbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc291cmNlID0gY29uZmlndXJhdGlvbi5zdXJyb3VuZGluZ1BhaXJzO1xuXHRcdGlmICh0eXBlb2Ygc291cmNlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHNvdXJjZSkpIHtcblx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBzdXJyb3VuZGluZ1BhaXJzXFxgIHRvIGJlIGFuIGFycmF5LmApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBJQXV0b0Nsb3NpbmdQYWlyW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNvdXJjZS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcGFpciA9IHNvdXJjZVtpXTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHBhaXIpKSB7XG5cdFx0XHRcdGlmICghaXNDaGFyYWN0ZXJQYWlyKHBhaXIpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYHN1cnJvdW5kaW5nUGFpcnNbJHtpfV1cXGAgdG8gYmUgYW4gYXJyYXkgb2YgdHdvIHN0cmluZ3Mgb3IgYW4gb2JqZWN0LmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc3VsdCA9IHJlc3VsdCB8fCBbXTtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBvcGVuOiBwYWlyWzBdLCBjbG9zZTogcGFpclsxXSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghdHlwZXMuaXNPYmplY3QocGFpcikpIHtcblx0XHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgc3Vycm91bmRpbmdQYWlyc1ske2l9XVxcYCB0byBiZSBhbiBhcnJheSBvZiB0d28gc3RyaW5ncyBvciBhbiBvYmplY3QuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHR5cGVvZiBwYWlyLm9wZW4gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYHN1cnJvdW5kaW5nUGFpcnNbJHtpfV0ub3BlblxcYCB0byBiZSBhIHN0cmluZy5gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodHlwZW9mIHBhaXIuY2xvc2UgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYHN1cnJvdW5kaW5nUGFpcnNbJHtpfV0uY2xvc2VcXGAgdG8gYmUgYSBzdHJpbmcuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0ID0gcmVzdWx0IHx8IFtdO1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IG9wZW46IHBhaXIub3BlbiwgY2xvc2U6IHBhaXIuY2xvc2UgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZXh0cmFjdFZhbGlkQ29sb3JpemVkQnJhY2tldFBhaXJzKGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSUxhbmd1YWdlQ29uZmlndXJhdGlvbik6IENoYXJhY3RlclBhaXJbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc291cmNlID0gY29uZmlndXJhdGlvbi5jb2xvcml6ZWRCcmFja2V0UGFpcnM7XG5cdFx0aWYgKHR5cGVvZiBzb3VyY2UgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc291cmNlKSkge1xuXHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGNvbG9yaXplZEJyYWNrZXRQYWlyc1xcYCB0byBiZSBhbiBhcnJheS5gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBDaGFyYWN0ZXJQYWlyW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc291cmNlLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBwYWlyID0gc291cmNlW2ldO1xuXHRcdFx0aWYgKCFpc0NoYXJhY3RlclBhaXIocGFpcikpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYGNvbG9yaXplZEJyYWNrZXRQYWlyc1ske2l9XVxcYCB0byBiZSBhbiBhcnJheSBvZiB0d28gc3RyaW5ncy5gKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChbcGFpclswXSwgcGFpclsxXV0pO1xuXG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZXh0cmFjdFZhbGlkT25FbnRlclJ1bGVzKGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSUxhbmd1YWdlQ29uZmlndXJhdGlvbik6IE9uRW50ZXJSdWxlW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNvdXJjZSA9IGNvbmZpZ3VyYXRpb24ub25FbnRlclJ1bGVzO1xuXHRcdGlmICh0eXBlb2Ygc291cmNlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHNvdXJjZSkpIHtcblx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBvbkVudGVyUnVsZXNcXGAgdG8gYmUgYW4gYXJyYXkuYCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGxldCByZXN1bHQ6IE9uRW50ZXJSdWxlW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNvdXJjZS5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgb25FbnRlclJ1bGUgPSBzb3VyY2VbaV07XG5cdFx0XHRpZiAoIXR5cGVzLmlzT2JqZWN0KG9uRW50ZXJSdWxlKSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgb25FbnRlclJ1bGVzWyR7aX1dXFxgIHRvIGJlIGFuIG9iamVjdC5gKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXR5cGVzLmlzT2JqZWN0KG9uRW50ZXJSdWxlLmFjdGlvbikpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYG9uRW50ZXJSdWxlc1ske2l9XS5hY3Rpb25cXGAgdG8gYmUgYW4gb2JqZWN0LmApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCBpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbjtcblx0XHRcdGlmIChvbkVudGVyUnVsZS5hY3Rpb24uaW5kZW50ID09PSAnbm9uZScpIHtcblx0XHRcdFx0aW5kZW50QWN0aW9uID0gSW5kZW50QWN0aW9uLk5vbmU7XG5cdFx0XHR9IGVsc2UgaWYgKG9uRW50ZXJSdWxlLmFjdGlvbi5pbmRlbnQgPT09ICdpbmRlbnQnKSB7XG5cdFx0XHRcdGluZGVudEFjdGlvbiA9IEluZGVudEFjdGlvbi5JbmRlbnQ7XG5cdFx0XHR9IGVsc2UgaWYgKG9uRW50ZXJSdWxlLmFjdGlvbi5pbmRlbnQgPT09ICdpbmRlbnRPdXRkZW50Jykge1xuXHRcdFx0XHRpbmRlbnRBY3Rpb24gPSBJbmRlbnRBY3Rpb24uSW5kZW50T3V0ZGVudDtcblx0XHRcdH0gZWxzZSBpZiAob25FbnRlclJ1bGUuYWN0aW9uLmluZGVudCA9PT0gJ291dGRlbnQnKSB7XG5cdFx0XHRcdGluZGVudEFjdGlvbiA9IEluZGVudEFjdGlvbi5PdXRkZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYG9uRW50ZXJSdWxlc1ske2l9XS5hY3Rpb24uaW5kZW50XFxgIHRvIGJlICdub25lJywgJ2luZGVudCcsICdpbmRlbnRPdXRkZW50JyBvciAnb3V0ZGVudCcuYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uOiBFbnRlckFjdGlvbiA9IHsgaW5kZW50QWN0aW9uIH07XG5cdFx0XHRpZiAob25FbnRlclJ1bGUuYWN0aW9uLmFwcGVuZFRleHQpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBvbkVudGVyUnVsZS5hY3Rpb24uYXBwZW5kVGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRhY3Rpb24uYXBwZW5kVGV4dCA9IG9uRW50ZXJSdWxlLmFjdGlvbi5hcHBlbmRUZXh0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBvbkVudGVyUnVsZXNbJHtpfV0uYWN0aW9uLmFwcGVuZFRleHRcXGAgdG8gYmUgdW5kZWZpbmVkIG9yIGEgc3RyaW5nLmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAob25FbnRlclJ1bGUuYWN0aW9uLnJlbW92ZVRleHQpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBvbkVudGVyUnVsZS5hY3Rpb24ucmVtb3ZlVGV4dCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRhY3Rpb24ucmVtb3ZlVGV4dCA9IG9uRW50ZXJSdWxlLmFjdGlvbi5yZW1vdmVUZXh0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBsYW5ndWFnZSBjb25maWd1cmF0aW9uOiBleHBlY3RlZCBcXGBvbkVudGVyUnVsZXNbJHtpfV0uYWN0aW9uLnJlbW92ZVRleHRcXGAgdG8gYmUgdW5kZWZpbmVkIG9yIGEgbnVtYmVyLmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBiZWZvcmVUZXh0ID0gdGhpcy5fcGFyc2VSZWdleChsYW5ndWFnZUlkLCBgb25FbnRlclJ1bGVzWyR7aX1dLmJlZm9yZVRleHRgLCBvbkVudGVyUnVsZS5iZWZvcmVUZXh0KTtcblx0XHRcdGlmICghYmVmb3JlVGV4dCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdGluZ09uRW50ZXJSdWxlOiBPbkVudGVyUnVsZSA9IHsgYmVmb3JlVGV4dCwgYWN0aW9uIH07XG5cdFx0XHRpZiAob25FbnRlclJ1bGUuYWZ0ZXJUZXh0KSB7XG5cdFx0XHRcdGNvbnN0IGFmdGVyVGV4dCA9IHRoaXMuX3BhcnNlUmVnZXgobGFuZ3VhZ2VJZCwgYG9uRW50ZXJSdWxlc1ske2l9XS5hZnRlclRleHRgLCBvbkVudGVyUnVsZS5hZnRlclRleHQpO1xuXHRcdFx0XHRpZiAoYWZ0ZXJUZXh0KSB7XG5cdFx0XHRcdFx0cmVzdWx0aW5nT25FbnRlclJ1bGUuYWZ0ZXJUZXh0ID0gYWZ0ZXJUZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAob25FbnRlclJ1bGUucHJldmlvdXNMaW5lVGV4dCkge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91c0xpbmVUZXh0ID0gdGhpcy5fcGFyc2VSZWdleChsYW5ndWFnZUlkLCBgb25FbnRlclJ1bGVzWyR7aX1dLnByZXZpb3VzTGluZVRleHRgLCBvbkVudGVyUnVsZS5wcmV2aW91c0xpbmVUZXh0KTtcblx0XHRcdFx0aWYgKHByZXZpb3VzTGluZVRleHQpIHtcblx0XHRcdFx0XHRyZXN1bHRpbmdPbkVudGVyUnVsZS5wcmV2aW91c0xpbmVUZXh0ID0gcHJldmlvdXNMaW5lVGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmVzdWx0ID0gcmVzdWx0IHx8IFtdO1xuXHRcdFx0cmVzdWx0LnB1c2gocmVzdWx0aW5nT25FbnRlclJ1bGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGV4dHJhY3RWYWxpZENvbmZpZyhsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElMYW5ndWFnZUNvbmZpZ3VyYXRpb24pOiBFeHBsaWNpdExhbmd1YWdlQ29uZmlndXJhdGlvbiB7XG5cblx0XHRjb25zdCBjb21tZW50cyA9IHRoaXMuX2V4dHJhY3RWYWxpZENvbW1lbnRSdWxlKGxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGJyYWNrZXRzID0gdGhpcy5fZXh0cmFjdFZhbGlkQnJhY2tldHMobGFuZ3VhZ2VJZCwgY29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgYXV0b0Nsb3NpbmdQYWlycyA9IHRoaXMuX2V4dHJhY3RWYWxpZEF1dG9DbG9zaW5nUGFpcnMobGFuZ3VhZ2VJZCwgY29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3Qgc3Vycm91bmRpbmdQYWlycyA9IHRoaXMuX2V4dHJhY3RWYWxpZFN1cnJvdW5kaW5nUGFpcnMobGFuZ3VhZ2VJZCwgY29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgY29sb3JpemVkQnJhY2tldFBhaXJzID0gdGhpcy5fZXh0cmFjdFZhbGlkQ29sb3JpemVkQnJhY2tldFBhaXJzKGxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGF1dG9DbG9zZUJlZm9yZSA9ICh0eXBlb2YgY29uZmlndXJhdGlvbi5hdXRvQ2xvc2VCZWZvcmUgPT09ICdzdHJpbmcnID8gY29uZmlndXJhdGlvbi5hdXRvQ2xvc2VCZWZvcmUgOiB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHdvcmRQYXR0ZXJuID0gKGNvbmZpZ3VyYXRpb24ud29yZFBhdHRlcm4gPyB0aGlzLl9wYXJzZVJlZ2V4KGxhbmd1YWdlSWQsIGB3b3JkUGF0dGVybmAsIGNvbmZpZ3VyYXRpb24ud29yZFBhdHRlcm4pIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCBpbmRlbnRhdGlvblJ1bGVzID0gKGNvbmZpZ3VyYXRpb24uaW5kZW50YXRpb25SdWxlcyA/IHRoaXMuX21hcEluZGVudGF0aW9uUnVsZXMobGFuZ3VhZ2VJZCwgY29uZmlndXJhdGlvbi5pbmRlbnRhdGlvblJ1bGVzKSA6IHVuZGVmaW5lZCk7XG5cdFx0bGV0IGZvbGRpbmc6IEZvbGRpbmdSdWxlcyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoY29uZmlndXJhdGlvbi5mb2xkaW5nKSB7XG5cdFx0XHRjb25zdCByYXdNYXJrZXJzID0gY29uZmlndXJhdGlvbi5mb2xkaW5nLm1hcmtlcnM7XG5cdFx0XHRjb25zdCBzdGFydE1hcmtlciA9IChyYXdNYXJrZXJzICYmIHJhd01hcmtlcnMuc3RhcnQgPyB0aGlzLl9wYXJzZVJlZ2V4KGxhbmd1YWdlSWQsIGBmb2xkaW5nLm1hcmtlcnMuc3RhcnRgLCByYXdNYXJrZXJzLnN0YXJ0KSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBlbmRNYXJrZXIgPSAocmF3TWFya2VycyAmJiByYXdNYXJrZXJzLmVuZCA/IHRoaXMuX3BhcnNlUmVnZXgobGFuZ3VhZ2VJZCwgYGZvbGRpbmcubWFya2Vycy5lbmRgLCByYXdNYXJrZXJzLmVuZCkgOiB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgbWFya2VyczogRm9sZGluZ01hcmtlcnMgfCB1bmRlZmluZWQgPSAoc3RhcnRNYXJrZXIgJiYgZW5kTWFya2VyID8geyBzdGFydDogc3RhcnRNYXJrZXIsIGVuZDogZW5kTWFya2VyIH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0Zm9sZGluZyA9IHtcblx0XHRcdFx0b2ZmU2lkZTogY29uZmlndXJhdGlvbi5mb2xkaW5nLm9mZlNpZGUsXG5cdFx0XHRcdG1hcmtlcnNcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IG9uRW50ZXJSdWxlcyA9IHRoaXMuX2V4dHJhY3RWYWxpZE9uRW50ZXJSdWxlcyhsYW5ndWFnZUlkLCBjb25maWd1cmF0aW9uKTtcblxuXHRcdGNvbnN0IHJpY2hFZGl0Q29uZmlnOiBFeHBsaWNpdExhbmd1YWdlQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdGNvbW1lbnRzLFxuXHRcdFx0YnJhY2tldHMsXG5cdFx0XHR3b3JkUGF0dGVybixcblx0XHRcdGluZGVudGF0aW9uUnVsZXMsXG5cdFx0XHRvbkVudGVyUnVsZXMsXG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzLFxuXHRcdFx0c3Vycm91bmRpbmdQYWlycyxcblx0XHRcdGNvbG9yaXplZEJyYWNrZXRQYWlycyxcblx0XHRcdGF1dG9DbG9zZUJlZm9yZSxcblx0XHRcdGZvbGRpbmcsXG5cdFx0XHRfX2VsZWN0cmljQ2hhcmFjdGVyU3VwcG9ydDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0cmV0dXJuIHJpY2hFZGl0Q29uZmlnO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ29uZmlnKGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZmlndXJhdGlvbjogSUxhbmd1YWdlQ29uZmlndXJhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IHJpY2hFZGl0Q29uZmlnID0gTGFuZ3VhZ2VDb25maWd1cmF0aW9uRmlsZUhhbmRsZXIuZXh0cmFjdFZhbGlkQ29uZmlnKGxhbmd1YWdlSWQsIGNvbmZpZ3VyYXRpb24pO1xuXHRcdHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwgcmljaEVkaXRDb25maWcsIDUwKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9wYXJzZVJlZ2V4KGxhbmd1YWdlSWQ6IHN0cmluZywgY29uZlBhdGg6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IElSZWdFeHApOiBSZWdFeHAgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJlZ0V4cCh2YWx1ZSwgJycpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBJbnZhbGlkIHJlZ3VsYXIgZXhwcmVzc2lvbiBpbiBcXGAke2NvbmZQYXRofVxcYDogYCwgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHR5cGVzLmlzT2JqZWN0KHZhbHVlKSkge1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZS5wYXR0ZXJuICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFske2xhbmd1YWdlSWR9XTogbGFuZ3VhZ2UgY29uZmlndXJhdGlvbjogZXhwZWN0ZWQgXFxgJHtjb25mUGF0aH0ucGF0dGVyblxcYCB0byBiZSBhIHN0cmluZy5gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgdmFsdWUuZmxhZ3MgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiB2YWx1ZS5mbGFncyAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYCR7Y29uZlBhdGh9LmZsYWdzXFxgIHRvIGJlIGEgc3RyaW5nLmApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBSZWdFeHAodmFsdWUucGF0dGVybiwgdmFsdWUuZmxhZ3MpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGNvbnNvbGUud2FybihgWyR7bGFuZ3VhZ2VJZH1dOiBJbnZhbGlkIHJlZ3VsYXIgZXhwcmVzc2lvbiBpbiBcXGAke2NvbmZQYXRofVxcYDogYCwgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc29sZS53YXJuKGBbJHtsYW5ndWFnZUlkfV06IGxhbmd1YWdlIGNvbmZpZ3VyYXRpb246IGV4cGVjdGVkIFxcYCR7Y29uZlBhdGh9XFxgIHRvIGJlIGEgc3RyaW5nIG9yIGFuIG9iamVjdC5gKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21hcEluZGVudGF0aW9uUnVsZXMobGFuZ3VhZ2VJZDogc3RyaW5nLCBpbmRlbnRhdGlvblJ1bGVzOiBJSW5kZW50YXRpb25SdWxlcyk6IEluZGVudGF0aW9uUnVsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5jcmVhc2VJbmRlbnRQYXR0ZXJuID0gdGhpcy5fcGFyc2VSZWdleChsYW5ndWFnZUlkLCBgaW5kZW50YXRpb25SdWxlcy5pbmNyZWFzZUluZGVudFBhdHRlcm5gLCBpbmRlbnRhdGlvblJ1bGVzLmluY3JlYXNlSW5kZW50UGF0dGVybik7XG5cdFx0aWYgKCFpbmNyZWFzZUluZGVudFBhdHRlcm4pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGRlY3JlYXNlSW5kZW50UGF0dGVybiA9IHRoaXMuX3BhcnNlUmVnZXgobGFuZ3VhZ2VJZCwgYGluZGVudGF0aW9uUnVsZXMuZGVjcmVhc2VJbmRlbnRQYXR0ZXJuYCwgaW5kZW50YXRpb25SdWxlcy5kZWNyZWFzZUluZGVudFBhdHRlcm4pO1xuXHRcdGlmICghZGVjcmVhc2VJbmRlbnRQYXR0ZXJuKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSW5kZW50YXRpb25SdWxlID0ge1xuXHRcdFx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiBpbmNyZWFzZUluZGVudFBhdHRlcm4sXG5cdFx0XHRkZWNyZWFzZUluZGVudFBhdHRlcm46IGRlY3JlYXNlSW5kZW50UGF0dGVyblxuXHRcdH07XG5cblx0XHRpZiAoaW5kZW50YXRpb25SdWxlcy5pbmRlbnROZXh0TGluZVBhdHRlcm4pIHtcblx0XHRcdHJlc3VsdC5pbmRlbnROZXh0TGluZVBhdHRlcm4gPSB0aGlzLl9wYXJzZVJlZ2V4KGxhbmd1YWdlSWQsIGBpbmRlbnRhdGlvblJ1bGVzLmluZGVudE5leHRMaW5lUGF0dGVybmAsIGluZGVudGF0aW9uUnVsZXMuaW5kZW50TmV4dExpbmVQYXR0ZXJuKTtcblx0XHR9XG5cdFx0aWYgKGluZGVudGF0aW9uUnVsZXMudW5JbmRlbnRlZExpbmVQYXR0ZXJuKSB7XG5cdFx0XHRyZXN1bHQudW5JbmRlbnRlZExpbmVQYXR0ZXJuID0gdGhpcy5fcGFyc2VSZWdleChsYW5ndWFnZUlkLCBgaW5kZW50YXRpb25SdWxlcy51bkluZGVudGVkTGluZVBhdHRlcm5gLCBpbmRlbnRhdGlvblJ1bGVzLnVuSW5kZW50ZWRMaW5lUGF0dGVybik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jb25zdCBzY2hlbWFJZCA9ICd2c2NvZGU6Ly9zY2hlbWFzL2xhbmd1YWdlLWNvbmZpZ3VyYXRpb24nO1xuY29uc3Qgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0YWxsb3dDb21tZW50czogdHJ1ZSxcblx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0ZGVmYXVsdDoge1xuXHRcdGNvbW1lbnRzOiB7XG5cdFx0XHRibG9ja0NvbW1lbnQ6IFsnLyonLCAnKi8nXSxcblx0XHRcdGxpbmVDb21tZW50OiAnLy8nXG5cdFx0fSxcblx0XHRicmFja2V0czogW1snKCcsICcpJ10sIFsnWycsICddJ10sIFsneycsICd9J11dLFxuXHRcdGF1dG9DbG9zaW5nUGFpcnM6IFtbJygnLCAnKSddLCBbJ1snLCAnXSddLCBbJ3snLCAnfSddXSxcblx0XHRzdXJyb3VuZGluZ1BhaXJzOiBbWycoJywgJyknXSwgWydbJywgJ10nXSwgWyd7JywgJ30nXV1cblx0fSxcblx0ZGVmaW5pdGlvbnM6IHtcblx0XHRvcGVuQnJhY2tldDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub3BlbkJyYWNrZXQnLCAnVGhlIG9wZW5pbmcgYnJhY2tldCBjaGFyYWN0ZXIgb3Igc3RyaW5nIHNlcXVlbmNlLicpXG5cdFx0fSxcblx0XHRjbG9zZUJyYWNrZXQ6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmNsb3NlQnJhY2tldCcsICdUaGUgY2xvc2luZyBicmFja2V0IGNoYXJhY3RlciBvciBzdHJpbmcgc2VxdWVuY2UuJylcblx0XHR9LFxuXHRcdGJyYWNrZXRQYWlyOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL29wZW5CcmFja2V0J1xuXHRcdFx0fSwge1xuXHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9jbG9zZUJyYWNrZXQnXG5cdFx0XHR9XVxuXHRcdH1cblx0fSxcblx0cHJvcGVydGllczoge1xuXHRcdGNvbW1lbnRzOiB7XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGJsb2NrQ29tbWVudDogWycvKicsICcqLyddLFxuXHRcdFx0XHRsaW5lQ29tbWVudDogeyBjb21tZW50OiAnLy8nLCBub0luZGVudDogZmFsc2UgfVxuXHRcdFx0fSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5jb21tZW50cycsICdEZWZpbmVzIHRoZSBjb21tZW50IHN5bWJvbHMnKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRibG9ja0NvbW1lbnQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5ibG9ja0NvbW1lbnRzJywgJ0RlZmluZXMgaG93IGJsb2NrIGNvbW1lbnRzIGFyZSBtYXJrZWQuJyksXG5cdFx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5ibG9ja0NvbW1lbnQuYmVnaW4nLCAnVGhlIGNoYXJhY3RlciBzZXF1ZW5jZSB0aGF0IHN0YXJ0cyBhIGJsb2NrIGNvbW1lbnQuJylcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5ibG9ja0NvbW1lbnQuZW5kJywgJ1RoZSBjaGFyYWN0ZXIgc2VxdWVuY2UgdGhhdCBlbmRzIGEgYmxvY2sgY29tbWVudC4nKVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxpbmVDb21tZW50OiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmxpbmVDb21tZW50Lm9iamVjdCcsICdDb25maWd1cmF0aW9uIGZvciBsaW5lIGNvbW1lbnRzLicpLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGNvbW1lbnQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5saW5lQ29tbWVudC5jb21tZW50JywgJ1RoZSBjaGFyYWN0ZXIgc2VxdWVuY2UgdGhhdCBzdGFydHMgYSBsaW5lIGNvbW1lbnQuJylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRub0luZGVudDoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5saW5lQ29tbWVudC5ub0luZGVudCcsICdXaGV0aGVyIHRoZSBjb21tZW50IHRva2VuIHNob3VsZCBub3QgYmUgaW5kZW50ZWQgYW5kIHBsYWNlZCBhdCB0aGUgZmlyc3QgY29sdW1uLiBEZWZhdWx0cyB0byBmYWxzZS4nKSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2NvbW1lbnQnXSxcblx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0YnJhY2tldHM6IHtcblx0XHRcdGRlZmF1bHQ6IFtbJygnLCAnKSddLCBbJ1snLCAnXSddLCBbJ3snLCAnfSddXSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmJyYWNrZXRzJywgJ0RlZmluZXMgdGhlIGJyYWNrZXQgc3ltYm9scyB0aGF0IGluY3JlYXNlIG9yIGRlY3JlYXNlIHRoZSBpbmRlbnRhdGlvbi4gV2hlbiBicmFja2V0IHBhaXIgY29sb3JpemF0aW9uIGlzIGVuYWJsZWQgYW5kIHswfSBpcyBub3QgZGVmaW5lZCwgdGhpcyBhbHNvIGRlZmluZXMgdGhlIGJyYWNrZXQgcGFpcnMgdGhhdCBhcmUgY29sb3JpemVkIGJ5IHRoZWlyIG5lc3RpbmcgbGV2ZWwuJywgJ1xcYGNvbG9yaXplZEJyYWNrZXRQYWlyc1xcYCcpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2JyYWNrZXRQYWlyJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Y29sb3JpemVkQnJhY2tldFBhaXJzOiB7XG5cdFx0XHRkZWZhdWx0OiBbWycoJywgJyknXSwgWydbJywgJ10nXSwgWyd7JywgJ30nXV0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5jb2xvcml6ZWRCcmFja2V0UGFpcnMnLCAnRGVmaW5lcyB0aGUgYnJhY2tldCBwYWlycyB0aGF0IGFyZSBjb2xvcml6ZWQgYnkgdGhlaXIgbmVzdGluZyBsZXZlbCBpZiBicmFja2V0IHBhaXIgY29sb3JpemF0aW9uIGlzIGVuYWJsZWQuIEFueSBicmFja2V0cyBpbmNsdWRlZCBoZXJlIHRoYXQgYXJlIG5vdCBpbmNsdWRlZCBpbiB7MH0gd2lsbCBiZSBhdXRvbWF0aWNhbGx5IGluY2x1ZGVkIGluIHswfS4nLCAnXFxgYnJhY2tldHNcXGAnKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9icmFja2V0UGFpcidcblx0XHRcdH1cblx0XHR9LFxuXHRcdGF1dG9DbG9zaW5nUGFpcnM6IHtcblx0XHRcdGRlZmF1bHQ6IFtbJygnLCAnKSddLCBbJ1snLCAnXSddLCBbJ3snLCAnfSddXSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5hdXRvQ2xvc2luZ1BhaXJzJywgJ0RlZmluZXMgdGhlIGJyYWNrZXQgcGFpcnMuIFdoZW4gYSBvcGVuaW5nIGJyYWNrZXQgaXMgZW50ZXJlZCwgdGhlIGNsb3NpbmcgYnJhY2tldCBpcyBpbnNlcnRlZCBhdXRvbWF0aWNhbGx5LicpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdG9uZU9mOiBbe1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2JyYWNrZXRQYWlyJ1xuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0b3Blbjoge1xuXHRcdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9vcGVuQnJhY2tldCdcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjbG9zZToge1xuXHRcdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9jbG9zZUJyYWNrZXQnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bm90SW46IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmF1dG9DbG9zaW5nUGFpcnMubm90SW4nLCAnRGVmaW5lcyBhIGxpc3Qgb2Ygc2NvcGVzIHdoZXJlIHRoZSBhdXRvIHBhaXJzIGFyZSBkaXNhYmxlZC4nKSxcblx0XHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ3N0cmluZycsICdjb21tZW50J11cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9LFxuXHRcdGF1dG9DbG9zZUJlZm9yZToge1xuXHRcdFx0ZGVmYXVsdDogJzs6Liw9fV0pPiBcXG5cXHQnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmF1dG9DbG9zZUJlZm9yZScsICdEZWZpbmVzIHdoYXQgY2hhcmFjdGVycyBtdXN0IGJlIGFmdGVyIHRoZSBjdXJzb3IgaW4gb3JkZXIgZm9yIGJyYWNrZXQgb3IgcXVvdGUgYXV0b2Nsb3NpbmcgdG8gb2NjdXIgd2hlbiB1c2luZyB0aGUgXFwnbGFuZ3VhZ2VEZWZpbmVkXFwnIGF1dG9jbG9zaW5nIHNldHRpbmcuIFRoaXMgaXMgdHlwaWNhbGx5IHRoZSBzZXQgb2YgY2hhcmFjdGVycyB3aGljaCBjYW4gbm90IHN0YXJ0IGFuIGV4cHJlc3Npb24uJyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHR9LFxuXHRcdHN1cnJvdW5kaW5nUGFpcnM6IHtcblx0XHRcdGRlZmF1bHQ6IFtbJygnLCAnKSddLCBbJ1snLCAnXSddLCBbJ3snLCAnfSddXSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5zdXJyb3VuZGluZ1BhaXJzJywgJ0RlZmluZXMgdGhlIGJyYWNrZXQgcGFpcnMgdGhhdCBjYW4gYmUgdXNlZCB0byBzdXJyb3VuZCBhIHNlbGVjdGVkIHN0cmluZy4nKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHRvbmVPZjogW3tcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9icmFja2V0UGFpcidcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdG9wZW46IHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvb3BlbkJyYWNrZXQnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Y2xvc2U6IHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvY2xvc2VCcmFja2V0J1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9LFxuXHRcdHdvcmRQYXR0ZXJuOiB7XG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS53b3JkUGF0dGVybicsICdEZWZpbmVzIHdoYXQgaXMgY29uc2lkZXJlZCB0byBiZSBhIHdvcmQgaW4gdGhlIHByb2dyYW1taW5nIGxhbmd1YWdlLicpLFxuXHRcdFx0dHlwZTogWydzdHJpbmcnLCAnb2JqZWN0J10sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEud29yZFBhdHRlcm4ucGF0dGVybicsICdUaGUgUmVnRXhwIHBhdHRlcm4gdXNlZCB0byBtYXRjaCB3b3Jkcy4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmxhZ3M6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEud29yZFBhdHRlcm4uZmxhZ3MnLCAnVGhlIFJlZ0V4cCBmbGFncyB1c2VkIHRvIG1hdGNoIHdvcmRzLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdnJyxcblx0XHRcdFx0XHRwYXR0ZXJuOiAnXihbZ2ltdXldKykkJyxcblx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS53b3JkUGF0dGVybi5mbGFncy5lcnJvck1lc3NhZ2UnLCAnTXVzdCBtYXRjaCB0aGUgcGF0dGVybiBgL14oW2dpbXV5XSspJC9gLicpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdGluZGVudGF0aW9uUnVsZXM6IHtcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiAnJyxcblx0XHRcdFx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiAnJ1xuXHRcdFx0fSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzJywgJ1RoZSBsYW5ndWFnZVxcJ3MgaW5kZW50YXRpb24gc2V0dGluZ3MuJyksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnb2JqZWN0J10sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMuaW5jcmVhc2VJbmRlbnRQYXR0ZXJuJywgJ0lmIGEgbGluZSBtYXRjaGVzIHRoaXMgcGF0dGVybiwgdGhlbiBhbGwgdGhlIGxpbmVzIGFmdGVyIGl0IHNob3VsZCBiZSBpbmRlbnRlZCBvbmNlICh1bnRpbCBhbm90aGVyIHJ1bGUgbWF0Y2hlcykuJyksXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMuaW5jcmVhc2VJbmRlbnRQYXR0ZXJuLnBhdHRlcm4nLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIGZvciBpbmNyZWFzZUluZGVudFBhdHRlcm4uJyksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGZsYWdzOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy5pbmNyZWFzZUluZGVudFBhdHRlcm4uZmxhZ3MnLCAnVGhlIFJlZ0V4cCBmbGFncyBmb3IgaW5jcmVhc2VJbmRlbnRQYXR0ZXJuLicpLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ14oW2dpbXV5XSspJCcsXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMuaW5jcmVhc2VJbmRlbnRQYXR0ZXJuLmVycm9yTWVzc2FnZScsICdNdXN0IG1hdGNoIHRoZSBwYXR0ZXJuIGAvXihbZ2ltdXldKykkL2AuJylcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjoge1xuXHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLmRlY3JlYXNlSW5kZW50UGF0dGVybicsICdJZiBhIGxpbmUgbWF0Y2hlcyB0aGlzIHBhdHRlcm4sIHRoZW4gYWxsIHRoZSBsaW5lcyBhZnRlciBpdCBzaG91bGQgYmUgdW5pbmRlbnRlZCBvbmNlICh1bnRpbCBhbm90aGVyIHJ1bGUgbWF0Y2hlcykuJyksXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMuZGVjcmVhc2VJbmRlbnRQYXR0ZXJuLnBhdHRlcm4nLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIGZvciBkZWNyZWFzZUluZGVudFBhdHRlcm4uJyksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGZsYWdzOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy5kZWNyZWFzZUluZGVudFBhdHRlcm4uZmxhZ3MnLCAnVGhlIFJlZ0V4cCBmbGFncyBmb3IgZGVjcmVhc2VJbmRlbnRQYXR0ZXJuLicpLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ14oW2dpbXV5XSspJCcsXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMuZGVjcmVhc2VJbmRlbnRQYXR0ZXJuLmVycm9yTWVzc2FnZScsICdNdXN0IG1hdGNoIHRoZSBwYXR0ZXJuIGAvXihbZ2ltdXldKykkL2AuJylcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluZGVudE5leHRMaW5lUGF0dGVybjoge1xuXHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLmluZGVudE5leHRMaW5lUGF0dGVybicsICdJZiBhIGxpbmUgbWF0Y2hlcyB0aGlzIHBhdHRlcm4sIHRoZW4gKipvbmx5IHRoZSBuZXh0IGxpbmUqKiBhZnRlciBpdCBzaG91bGQgYmUgaW5kZW50ZWQgb25jZS4nKSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy5pbmRlbnROZXh0TGluZVBhdHRlcm4ucGF0dGVybicsICdUaGUgUmVnRXhwIHBhdHRlcm4gZm9yIGluZGVudE5leHRMaW5lUGF0dGVybi4nKSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZmxhZ3M6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLmluZGVudE5leHRMaW5lUGF0dGVybi5mbGFncycsICdUaGUgUmVnRXhwIGZsYWdzIGZvciBpbmRlbnROZXh0TGluZVBhdHRlcm4uJyksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXihbZ2ltdXldKykkJyxcblx0XHRcdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy5pbmRlbnROZXh0TGluZVBhdHRlcm4uZXJyb3JNZXNzYWdlJywgJ011c3QgbWF0Y2ggdGhlIHBhdHRlcm4gYC9eKFtnaW11eV0rKSQvYC4nKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0dW5JbmRlbnRlZExpbmVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnb2JqZWN0J10sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmluZGVudGF0aW9uUnVsZXMudW5JbmRlbnRlZExpbmVQYXR0ZXJuJywgJ0lmIGEgbGluZSBtYXRjaGVzIHRoaXMgcGF0dGVybiwgdGhlbiBpdHMgaW5kZW50YXRpb24gc2hvdWxkIG5vdCBiZSBjaGFuZ2VkIGFuZCBpdCBzaG91bGQgbm90IGJlIGV2YWx1YXRlZCBhZ2FpbnN0IHRoZSBvdGhlciBydWxlcy4nKSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy51bkluZGVudGVkTGluZVBhdHRlcm4ucGF0dGVybicsICdUaGUgUmVnRXhwIHBhdHRlcm4gZm9yIHVuSW5kZW50ZWRMaW5lUGF0dGVybi4nKSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZmxhZ3M6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pbmRlbnRhdGlvblJ1bGVzLnVuSW5kZW50ZWRMaW5lUGF0dGVybi5mbGFncycsICdUaGUgUmVnRXhwIGZsYWdzIGZvciB1bkluZGVudGVkTGluZVBhdHRlcm4uJyksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXihbZ2ltdXldKykkJyxcblx0XHRcdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdzY2hlbWEuaW5kZW50YXRpb25SdWxlcy51bkluZGVudGVkTGluZVBhdHRlcm4uZXJyb3JNZXNzYWdlJywgJ011c3QgbWF0Y2ggdGhlIHBhdHRlcm4gYC9eKFtnaW11eV0rKSQvYC4nKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Zm9sZGluZzoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGluZycsICdUaGUgbGFuZ3VhZ2VcXCdzIGZvbGRpbmcgc2V0dGluZ3MuJyksXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdG9mZlNpZGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRpbmcub2ZmU2lkZScsICdBIGxhbmd1YWdlIGFkaGVyZXMgdG8gdGhlIG9mZi1zaWRlIHJ1bGUgaWYgYmxvY2tzIGluIHRoYXQgbGFuZ3VhZ2UgYXJlIGV4cHJlc3NlZCBieSB0aGVpciBpbmRlbnRhdGlvbi4gSWYgc2V0LCBlbXB0eSBsaW5lcyBiZWxvbmcgdG8gdGhlIHN1YnNlcXVlbnQgYmxvY2suJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1hcmtlcnM6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGluZy5tYXJrZXJzJywgJ0xhbmd1YWdlIHNwZWNpZmljIGZvbGRpbmcgbWFya2VycyBzdWNoIGFzIFxcJyNyZWdpb25cXCcgYW5kIFxcJyNlbmRyZWdpb25cXCcuIFRoZSBzdGFydCBhbmQgZW5kIHJlZ2V4ZXMgd2lsbCBiZSB0ZXN0ZWQgYWdhaW5zdCB0aGUgY29udGVudHMgb2YgYWxsIGxpbmVzIGFuZCBtdXN0IGJlIGRlc2lnbmVkIGVmZmljaWVudGx5JyksXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0c3RhcnQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnb2JqZWN0J10sXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb2xkaW5nLm1hcmtlcnMuc3RhcnQnLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIGZvciB0aGUgc3RhcnQgbWFya2VyLiBUaGUgcmVnZXhwIG11c3Qgc3RhcnQgd2l0aCBcXCdeXFwnLicpLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGluZy5tYXJrZXJzLnN0YXJ0LnBhdHRlcm4nLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIGZvciB0aGUgc3RhcnQgbWFya2VyLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRmbGFnczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGluZy5tYXJrZXJzLnN0YXJ0LmZsYWdzJywgJ1RoZSBSZWdFeHAgZmxhZ3MgZm9yIHRoZSBzdGFydCBtYXJrZXIuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0XHRcdHBhdHRlcm46ICdeKFtnaW11eV0rKSQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGluZy5tYXJrZXJzLnN0YXJ0LmVycm9yTWVzc2FnZScsICdNdXN0IG1hdGNoIHRoZSBwYXR0ZXJuIGAvXihbZ2ltdXldKykkL2AuJylcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRlbmQ6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnb2JqZWN0J10sXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb2xkaW5nLm1hcmtlcnMuZW5kJywgJ1RoZSBSZWdFeHAgcGF0dGVybiBmb3IgdGhlIGVuZCBtYXJrZXIuIFRoZSByZWdleHAgbXVzdCBzdGFydCB3aXRoIFxcJ15cXCcuJyksXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb2xkaW5nLm1hcmtlcnMuZW5kLnBhdHRlcm4nLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIGZvciB0aGUgZW5kIG1hcmtlci4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0ZmxhZ3M6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRpbmcubWFya2Vycy5lbmQuZmxhZ3MnLCAnVGhlIFJlZ0V4cCBmbGFncyBmb3IgdGhlIGVuZCBtYXJrZXIuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0XHRcdHBhdHRlcm46ICdeKFtnaW11eV0rKSQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGluZy5tYXJrZXJzLmVuZC5lcnJvck1lc3NhZ2UnLCAnTXVzdCBtYXRjaCB0aGUgcGF0dGVybiBgL14oW2dpbXV5XSspJC9gLicpXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0b25FbnRlclJ1bGVzOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcycsICdUaGUgbGFuZ3VhZ2VcXCdzIHJ1bGVzIHRvIGJlIGV2YWx1YXRlZCB3aGVuIHByZXNzaW5nIEVudGVyLicpLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMnLCAnVGhlIGxhbmd1YWdlXFwncyBydWxlcyB0byBiZSBldmFsdWF0ZWQgd2hlbiBwcmVzc2luZyBFbnRlci4nKSxcblx0XHRcdFx0cmVxdWlyZWQ6IFsnYmVmb3JlVGV4dCcsICdhY3Rpb24nXSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGJlZm9yZVRleHQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5iZWZvcmVUZXh0JywgJ1RoaXMgcnVsZSB3aWxsIG9ubHkgZXhlY3V0ZSBpZiB0aGUgdGV4dCBiZWZvcmUgdGhlIGN1cnNvciBtYXRjaGVzIHRoaXMgcmVndWxhciBleHByZXNzaW9uLicpLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5iZWZvcmVUZXh0LnBhdHRlcm4nLCAnVGhlIFJlZ0V4cCBwYXR0ZXJuIGZvciBiZWZvcmVUZXh0LicpLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRmbGFnczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYmVmb3JlVGV4dC5mbGFncycsICdUaGUgUmVnRXhwIGZsYWdzIGZvciBiZWZvcmVUZXh0LicpLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm46ICdeKFtnaW11eV0rKSQnLFxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5iZWZvcmVUZXh0LmVycm9yTWVzc2FnZScsICdNdXN0IG1hdGNoIHRoZSBwYXR0ZXJuIGAvXihbZ2ltdXldKykkL2AuJylcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YWZ0ZXJUZXh0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdvYmplY3QnXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYWZ0ZXJUZXh0JywgJ1RoaXMgcnVsZSB3aWxsIG9ubHkgZXhlY3V0ZSBpZiB0aGUgdGV4dCBhZnRlciB0aGUgY3Vyc29yIG1hdGNoZXMgdGhpcyByZWd1bGFyIGV4cHJlc3Npb24uJyksXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmFmdGVyVGV4dC5wYXR0ZXJuJywgJ1RoZSBSZWdFeHAgcGF0dGVybiBmb3IgYWZ0ZXJUZXh0LicpLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRmbGFnczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYWZ0ZXJUZXh0LmZsYWdzJywgJ1RoZSBSZWdFeHAgZmxhZ3MgZm9yIGFmdGVyVGV4dC4nKSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXihbZ2ltdXldKykkJyxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYWZ0ZXJUZXh0LmVycm9yTWVzc2FnZScsICdNdXN0IG1hdGNoIHRoZSBwYXR0ZXJuIGAvXihbZ2ltdXldKykkL2AuJylcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cHJldmlvdXNMaW5lVGV4dDoge1xuXHRcdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnb2JqZWN0J10sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLnByZXZpb3VzTGluZVRleHQnLCAnVGhpcyBydWxlIHdpbGwgb25seSBleGVjdXRlIGlmIHRoZSB0ZXh0IGFib3ZlIHRoZSBsaW5lIG1hdGNoZXMgdGhpcyByZWd1bGFyIGV4cHJlc3Npb24uJyksXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLnByZXZpb3VzTGluZVRleHQucGF0dGVybicsICdUaGUgUmVnRXhwIHBhdHRlcm4gZm9yIHByZXZpb3VzTGluZVRleHQuJyksXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGZsYWdzOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5wcmV2aW91c0xpbmVUZXh0LmZsYWdzJywgJ1RoZSBSZWdFeHAgZmxhZ3MgZm9yIHByZXZpb3VzTGluZVRleHQuJyksXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ14oW2dpbXV5XSspJCcsXG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLnByZXZpb3VzTGluZVRleHQuZXJyb3JNZXNzYWdlJywgJ011c3QgbWF0Y2ggdGhlIHBhdHRlcm4gYC9eKFtnaW11eV0rKSQvYC4nKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCddLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5hY3Rpb24nLCAnVGhlIGFjdGlvbiB0byBleGVjdXRlLicpLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaW5kZW50J10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiB7ICdpbmRlbnQnOiAnaW5kZW50JyB9LFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRpbmRlbnQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmFjdGlvbi5pbmRlbnQnLCBcIkRlc2NyaWJlIHdoYXQgdG8gZG8gd2l0aCB0aGUgaW5kZW50YXRpb25cIiksXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJ2luZGVudCcsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydub25lJywgJ2luZGVudCcsICdpbmRlbnRPdXRkZW50JywgJ291dGRlbnQnXSxcblx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5hY3Rpb24uaW5kZW50Lm5vbmUnLCBcIkluc2VydCBuZXcgbGluZSBhbmQgY29weSB0aGUgcHJldmlvdXMgbGluZSdzIGluZGVudGF0aW9uLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2NoZW1hLm9uRW50ZXJSdWxlcy5hY3Rpb24uaW5kZW50LmluZGVudCcsIFwiSW5zZXJ0IG5ldyBsaW5lIGFuZCBpbmRlbnQgb25jZSAocmVsYXRpdmUgdG8gdGhlIHByZXZpb3VzIGxpbmUncyBpbmRlbnRhdGlvbikuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmFjdGlvbi5pbmRlbnQuaW5kZW50T3V0ZGVudCcsIFwiSW5zZXJ0IHR3byBuZXcgbGluZXM6XFxuIC0gdGhlIGZpcnN0IG9uZSBpbmRlbnRlZCB3aGljaCB3aWxsIGhvbGQgdGhlIGN1cnNvclxcbiAtIHRoZSBzZWNvbmQgb25lIGF0IHRoZSBzYW1lIGluZGVudGF0aW9uIGxldmVsXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmFjdGlvbi5pbmRlbnQub3V0ZGVudCcsIFwiSW5zZXJ0IG5ldyBsaW5lIGFuZCBvdXRkZW50IG9uY2UgKHJlbGF0aXZlIHRvIHRoZSBwcmV2aW91cyBsaW5lJ3MgaW5kZW50YXRpb24pLlwiKVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0YXBwZW5kVGV4dDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5vbkVudGVyUnVsZXMuYWN0aW9uLmFwcGVuZFRleHQnLCAnRGVzY3JpYmVzIHRleHQgdG8gYmUgYXBwZW5kZWQgYWZ0ZXIgdGhlIG5ldyBsaW5lIGFuZCBhZnRlciB0aGUgaW5kZW50YXRpb24uJyksXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHJlbW92ZVRleHQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEub25FbnRlclJ1bGVzLmFjdGlvbi5yZW1vdmVUZXh0JywgJ0Rlc2NyaWJlcyB0aGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgdG8gcmVtb3ZlIGZyb20gdGhlIG5ldyBsaW5lXFwncyBpbmRlbnRhdGlvbi4nKSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAwLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cbn07XG5jb25zdCBzY2hlbWFSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5zY2hlbWFSZWdpc3RyeS5yZWdpc3RlclNjaGVtYShzY2hlbWFJZCwgc2NoZW1hKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQXFCLE9BQU8sbUJBQW1CO0FBRS9DLFlBQVksV0FBVztBQUV2QixTQUE4SixvQkFBa0Q7QUFDaE4sU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBNkM7QUFDdEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0JBQWtCO0FBaUQzQixTQUFTLFlBQVksV0FBbUQ7QUFDdkUsTUFB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
