import { basename } from "../../../../base/common/path.js";
import * as Json from "../../../../base/common/json.js";
import { Color } from "../../../../base/common/color.js";
import { ExtensionData, THEME_SCOPE_CLOSE_PAREN, THEME_SCOPE_OPEN_PAREN, themeScopeRegex, THEME_SCOPE_WILDCARD } from "./workbenchThemeService.js";
import { convertSettings } from "./themeCompatibility.js";
import * as nls from "../../../../nls.js";
import * as types from "../../../../base/common/types.js";
import * as resources from "../../../../base/common/resources.js";
import { Extensions as ColorRegistryExtensions, editorBackground, editorForeground, DEFAULT_COLOR_CONFIG_VALUE } from "../../../../platform/theme/common/colorRegistry.js";
import { getThemeTypeSelector } from "../../../../platform/theme/common/themeService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { getParseErrorMessage } from "../../../../base/common/jsonErrorMessages.js";
import { parse as parsePList } from "./plistParser.js";
import { TokenStyle, SemanticTokenRule, getTokenClassificationRegistry, parseClassifierString } from "../../../../platform/theme/common/tokenClassificationRegistry.js";
import { createMatchers } from "./textMateScopeMatcher.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ColorScheme, ThemeTypeSelector } from "../../../../platform/theme/common/theme.js";
import { ColorId, FontStyle, MetadataConsts } from "../../../../editor/common/encodedTokenAttributes.js";
import { toStandardTokenType } from "../../../../editor/common/languages/supports/tokenization.js";
const colorRegistry = Registry.as(ColorRegistryExtensions.ColorContribution);
const tokenClassificationRegistry = getTokenClassificationRegistry();
const tokenGroupToScopesMap = {
  comments: ["comment", "punctuation.definition.comment"],
  strings: ["string", "meta.embedded.assembly"],
  keywords: ["keyword - keyword.operator", "keyword.control", "storage", "storage.type"],
  numbers: ["constant.numeric"],
  types: ["entity.name.type", "entity.name.class", "support.type", "support.class"],
  functions: ["entity.name.function", "support.function"],
  variables: ["variable", "entity.name.variable"]
};
const _ColorThemeData = class _ColorThemeData {
  // created on demand
  constructor(id, label, settingsId) {
    this.themeTokenColors = [];
    this.customTokenColors = [];
    this.colorMap = {};
    this.customColorMap = {};
    this.semanticTokenRules = [];
    this.customSemanticTokenRules = [];
    this.textMateThemingRules = void 0;
    // created on demand
    this.tokenColorIndex = void 0;
    // created on demand
    this.tokenFontIndex = void 0;
    this.id = id;
    this.label = label;
    this.settingsId = settingsId;
    this.isLoaded = false;
  }
  get semanticHighlighting() {
    if (this.customSemanticHighlighting !== void 0) {
      return this.customSemanticHighlighting;
    }
    if (this.customSemanticHighlightingDeprecated !== void 0) {
      return this.customSemanticHighlightingDeprecated;
    }
    return !!this.themeSemanticHighlighting;
  }
  get tokenColors() {
    if (!this.textMateThemingRules) {
      let addRule2 = function(rule) {
        if (rule.scope && rule.settings) {
          if (rule.scope === "token.info-token") {
            hasDefaultTokens = true;
          }
          const ruleSettings = rule.settings;
          result.push({
            scope: rule.scope,
            settings: {
              foreground: normalizeColor(ruleSettings.foreground),
              background: normalizeColor(ruleSettings.background),
              fontStyle: ruleSettings.fontStyle,
              fontSize: ruleSettings.fontSize,
              fontFamily: ruleSettings.fontFamily,
              lineHeight: ruleSettings.lineHeight
            }
          });
        }
      };
      var addRule = addRule2;
      const result = [];
      const foreground = this.getColor(editorForeground) || this.getDefault(editorForeground);
      const background = this.getColor(editorBackground) || this.getDefault(editorBackground);
      result.push({
        settings: {
          foreground: normalizeColor(foreground),
          background: normalizeColor(background)
        }
      });
      let hasDefaultTokens = false;
      this.themeTokenColors.forEach(addRule2);
      this.customTokenColors.forEach(addRule2);
      if (!hasDefaultTokens) {
        defaultThemeColors[this.type].forEach(addRule2);
      }
      this.textMateThemingRules = result;
    }
    return this.textMateThemingRules;
  }
  getColor(colorId, useDefault) {
    const customColor = this.customColorMap[colorId];
    if (customColor instanceof Color) {
      return customColor;
    }
    if (customColor === void 0) {
      const color = this.colorMap[colorId];
      if (color !== void 0) {
        return color;
      }
    }
    if (useDefault !== false) {
      return this.getDefault(colorId);
    }
    return void 0;
  }
  getTokenStyle(type, modifiers, language, useDefault = true, definitions = {}) {
    const result = {
      foreground: void 0,
      bold: void 0,
      underline: void 0,
      strikethrough: void 0,
      italic: void 0
    };
    const score = {
      foreground: -1,
      bold: -1,
      underline: -1,
      strikethrough: -1,
      italic: -1,
      fontFamily: -1,
      fontSize: -1,
      lineHeight: -1
    };
    function _processStyle(matchScore, style, definition) {
      if (style.foreground && score.foreground <= matchScore) {
        score.foreground = matchScore;
        result.foreground = style.foreground;
        definitions.foreground = definition;
      }
      for (const p of ["bold", "underline", "strikethrough", "italic"]) {
        const property = p;
        const info = style[property];
        if (info !== void 0) {
          if (score[property] <= matchScore) {
            score[property] = matchScore;
            result[property] = info;
            definitions[property] = definition;
          }
        }
      }
    }
    function _processSemanticTokenRule(rule) {
      const matchScore = rule.selector.match(type, modifiers, language);
      if (matchScore >= 0) {
        _processStyle(matchScore, rule.style, rule);
      }
    }
    this.semanticTokenRules.forEach(_processSemanticTokenRule);
    this.customSemanticTokenRules.forEach(_processSemanticTokenRule);
    let hasUndefinedStyleProperty = false;
    for (const k in score) {
      const key = k;
      if (score[key] === -1) {
        hasUndefinedStyleProperty = true;
      } else {
        score[key] = Number.MAX_VALUE;
      }
    }
    if (hasUndefinedStyleProperty) {
      for (const rule of tokenClassificationRegistry.getTokenStylingDefaultRules()) {
        const matchScore = rule.selector.match(type, modifiers, language);
        if (matchScore >= 0) {
          let style;
          if (rule.defaults.scopesToProbe) {
            style = this.resolveScopes(rule.defaults.scopesToProbe);
            if (style) {
              _processStyle(matchScore, style, rule.defaults.scopesToProbe);
            }
          }
          if (!style && useDefault !== false) {
            const tokenStyleValue = rule.defaults[this.type];
            style = this.resolveTokenStyleValue(tokenStyleValue);
            if (style) {
              _processStyle(matchScore, style, tokenStyleValue);
            }
          }
        }
      }
    }
    return TokenStyle.fromData(result);
  }
  /**
   * @param tokenStyleValue Resolve a tokenStyleValue in the context of a theme
   */
  resolveTokenStyleValue(tokenStyleValue) {
    if (tokenStyleValue === void 0) {
      return void 0;
    } else if (typeof tokenStyleValue === "string") {
      const { type, modifiers, language } = parseClassifierString(tokenStyleValue, "");
      return this.getTokenStyle(type, modifiers, language);
    } else if (typeof tokenStyleValue === "object") {
      return tokenStyleValue;
    }
    return void 0;
  }
  getTokenColorIndex() {
    if (!this.tokenColorIndex) {
      const index = new TokenColorIndex();
      this.tokenColors.forEach((rule) => {
        index.add(rule.settings.foreground);
        index.add(rule.settings.background);
      });
      this.semanticTokenRules.forEach((r) => index.add(r.style.foreground));
      tokenClassificationRegistry.getTokenStylingDefaultRules().forEach((r) => {
        const defaultColor = r.defaults[this.type];
        if (defaultColor && typeof defaultColor === "object") {
          index.add(defaultColor.foreground);
        }
      });
      this.customSemanticTokenRules.forEach((r) => index.add(r.style.foreground));
      this.tokenColorIndex = index;
    }
    return this.tokenColorIndex;
  }
  getTokenFontIndex() {
    if (!this.tokenFontIndex) {
      const index = new TokenFontIndex();
      this.tokenColors.forEach((r) => index.add(r.settings.fontFamily, r.settings.fontSize, r.settings.lineHeight));
      this.tokenFontIndex = index;
    }
    return this.tokenFontIndex;
  }
  get tokenColorMap() {
    return this.getTokenColorIndex().asArray();
  }
  get tokenFontMap() {
    return this.getTokenFontIndex().asArray();
  }
  getTokenStyleMetadata(typeWithLanguage, modifiers, defaultLanguage, useDefault = true, definitions = {}) {
    const { type, language } = parseClassifierString(typeWithLanguage, defaultLanguage);
    const style = this.getTokenStyle(type, modifiers, language, useDefault, definitions);
    if (!style) {
      return void 0;
    }
    return {
      foreground: this.getTokenColorIndex().get(style.foreground),
      bold: style.bold,
      underline: style.underline,
      strikethrough: style.strikethrough,
      italic: style.italic
    };
  }
  getTokenStylingRuleScope(rule) {
    if (this.customSemanticTokenRules.indexOf(rule) !== -1) {
      return "setting";
    }
    if (this.semanticTokenRules.indexOf(rule) !== -1) {
      return "theme";
    }
    return void 0;
  }
  getDefault(colorId) {
    return colorRegistry.resolveDefaultColor(colorId, this);
  }
  resolveScopes(scopes, definitions) {
    if (!this.themeTokenScopeMatchers) {
      this.themeTokenScopeMatchers = this.themeTokenColors.map(getScopeMatcher);
    }
    if (!this.customTokenScopeMatchers) {
      this.customTokenScopeMatchers = this.customTokenColors.map(getScopeMatcher);
    }
    for (const scope of scopes) {
      let findTokenStyleForScopeInScopes2 = function(scopeMatchers, themingRules) {
        for (let i = 0; i < scopeMatchers.length; i++) {
          const score = scopeMatchers[i](scope);
          if (score >= 0) {
            const themingRule = themingRules[i];
            const settings = themingRules[i].settings;
            if (score >= foregroundScore && settings.foreground) {
              foreground = settings.foreground;
              foregroundScore = score;
              foregroundThemingRule = themingRule;
            }
            if (score >= fontStyleScore && types.isString(settings.fontStyle)) {
              fontStyle = settings.fontStyle;
              fontStyleScore = score;
              fontStyleThemingRule = themingRule;
            }
          }
        }
      };
      var findTokenStyleForScopeInScopes = findTokenStyleForScopeInScopes2;
      let foreground = void 0;
      let fontStyle = void 0;
      let foregroundScore = -1;
      let fontStyleScore = -1;
      let fontStyleThemingRule = void 0;
      let foregroundThemingRule = void 0;
      findTokenStyleForScopeInScopes2(this.themeTokenScopeMatchers, this.themeTokenColors);
      findTokenStyleForScopeInScopes2(this.customTokenScopeMatchers, this.customTokenColors);
      if (foreground !== void 0 || fontStyle !== void 0) {
        if (definitions) {
          definitions.foreground = foregroundThemingRule;
          definitions.bold = definitions.italic = definitions.underline = definitions.strikethrough = fontStyleThemingRule;
          definitions.scope = scope;
        }
        return TokenStyle.fromSettings(foreground, fontStyle);
      }
    }
    return void 0;
  }
  defines(colorId) {
    const customColor = this.customColorMap[colorId];
    if (customColor instanceof Color) {
      return true;
    }
    return customColor === void 0 && this.colorMap.hasOwnProperty(colorId);
  }
  getColorCustomization(colorId) {
    const customColor = this.customColorMap[colorId];
    return customColor instanceof Color ? customColor : void 0;
  }
  setCustomizations(settings) {
    this.setCustomColors(settings.colorCustomizations);
    this.setCustomTokenColors(settings.tokenColorCustomizations);
    this.setCustomSemanticTokenColors(settings.semanticTokenColorCustomizations);
  }
  setCustomColors(colors) {
    this.customColorMap = {};
    this.overwriteCustomColors(colors);
    const themeSpecificColors = this.getThemeSpecificColors(colors);
    if (types.isObject(themeSpecificColors)) {
      this.overwriteCustomColors(themeSpecificColors);
    }
    this.tokenColorIndex = void 0;
    this.tokenFontIndex = void 0;
    this.textMateThemingRules = void 0;
    this.customTokenScopeMatchers = void 0;
  }
  overwriteCustomColors(colors) {
    for (const id in colors) {
      const colorVal = colors[id];
      if (colorVal === DEFAULT_COLOR_CONFIG_VALUE) {
        this.customColorMap[id] = DEFAULT_COLOR_CONFIG_VALUE;
      } else if (typeof colorVal === "string") {
        this.customColorMap[id] = Color.fromHex(colorVal);
      }
    }
  }
  setCustomTokenColors(customTokenColors) {
    this.customTokenColors = [];
    this.customSemanticHighlightingDeprecated = void 0;
    this.addCustomTokenColors(customTokenColors);
    const themeSpecificTokenColors = this.getThemeSpecificColors(customTokenColors);
    if (types.isObject(themeSpecificTokenColors)) {
      this.addCustomTokenColors(themeSpecificTokenColors);
    }
    this.tokenColorIndex = void 0;
    this.tokenFontIndex = void 0;
    this.textMateThemingRules = void 0;
    this.customTokenScopeMatchers = void 0;
  }
  setCustomSemanticTokenColors(semanticTokenColors) {
    this.customSemanticTokenRules = [];
    this.customSemanticHighlighting = void 0;
    if (semanticTokenColors) {
      this.customSemanticHighlighting = semanticTokenColors.enabled;
      if (semanticTokenColors.rules) {
        this.readSemanticTokenRules(semanticTokenColors.rules);
      }
      const themeSpecificColors = this.getThemeSpecificColors(semanticTokenColors);
      if (types.isObject(themeSpecificColors)) {
        if (themeSpecificColors.enabled !== void 0) {
          this.customSemanticHighlighting = themeSpecificColors.enabled;
        }
        if (themeSpecificColors.rules) {
          this.readSemanticTokenRules(themeSpecificColors.rules);
        }
      }
    }
    this.tokenColorIndex = void 0;
    this.tokenFontIndex = void 0;
    this.textMateThemingRules = void 0;
  }
  isThemeScope(key) {
    return key.charAt(0) === THEME_SCOPE_OPEN_PAREN && key.charAt(key.length - 1) === THEME_SCOPE_CLOSE_PAREN;
  }
  isThemeScopeMatch(themeId) {
    const themeIdFirstChar = themeId.charAt(0);
    const themeIdLastChar = themeId.charAt(themeId.length - 1);
    const themeIdPrefix = themeId.slice(0, -1);
    const themeIdInfix = themeId.slice(1, -1);
    const themeIdSuffix = themeId.slice(1);
    return themeId === this.settingsId || this.settingsId.includes(themeIdInfix) && themeIdFirstChar === THEME_SCOPE_WILDCARD && themeIdLastChar === THEME_SCOPE_WILDCARD || this.settingsId.startsWith(themeIdPrefix) && themeIdLastChar === THEME_SCOPE_WILDCARD || this.settingsId.endsWith(themeIdSuffix) && themeIdFirstChar === THEME_SCOPE_WILDCARD;
  }
  getThemeSpecificColors(colors) {
    let themeSpecificColors;
    for (const key in colors) {
      const scopedColors = colors[key];
      if (this.isThemeScope(key) && scopedColors instanceof Object && !Array.isArray(scopedColors)) {
        const themeScopeList = key.match(themeScopeRegex) || [];
        for (const themeScope of themeScopeList) {
          const themeId = themeScope.substring(1, themeScope.length - 1);
          if (this.isThemeScopeMatch(themeId)) {
            if (!themeSpecificColors) {
              themeSpecificColors = {};
            }
            const scopedThemeSpecificColors = scopedColors;
            for (const subkey in scopedThemeSpecificColors) {
              const originalColors = themeSpecificColors[subkey];
              const overrideColors = scopedThemeSpecificColors[subkey];
              if (Array.isArray(originalColors) && Array.isArray(overrideColors)) {
                themeSpecificColors[subkey] = originalColors.concat(overrideColors);
              } else if (overrideColors) {
                themeSpecificColors[subkey] = overrideColors;
              }
            }
          }
        }
      }
    }
    return themeSpecificColors;
  }
  readSemanticTokenRules(tokenStylingRuleSection) {
    for (const key in tokenStylingRuleSection) {
      if (!this.isThemeScope(key)) {
        try {
          const rule = readSemanticTokenRule(key, tokenStylingRuleSection[key]);
          if (rule) {
            this.customSemanticTokenRules.push(rule);
          }
        } catch (e) {
        }
      }
    }
  }
  addCustomTokenColors(customTokenColors) {
    for (const tokenGroup in tokenGroupToScopesMap) {
      const group = tokenGroup;
      const value = customTokenColors[group];
      if (value) {
        const settings = typeof value === "string" ? { foreground: value } : value;
        const scopes = tokenGroupToScopesMap[group];
        for (const scope of scopes) {
          this.customTokenColors.push({ scope, settings });
        }
      }
    }
    if (Array.isArray(customTokenColors.textMateRules)) {
      for (const rule of customTokenColors.textMateRules) {
        if (rule.scope && rule.settings) {
          this.customTokenColors.push(rule);
        }
      }
    }
    if (customTokenColors.semanticHighlighting !== void 0) {
      this.customSemanticHighlightingDeprecated = customTokenColors.semanticHighlighting;
    }
  }
  ensureLoaded(extensionResourceLoaderService) {
    return !this.isLoaded ? this.load(extensionResourceLoaderService) : Promise.resolve(void 0);
  }
  reload(extensionResourceLoaderService) {
    return this.load(extensionResourceLoaderService);
  }
  load(extensionResourceLoaderService) {
    if (!this.location) {
      return Promise.resolve(void 0);
    }
    this.themeTokenColors = [];
    this.clearCaches();
    const result = {
      colors: {},
      textMateRules: [],
      semanticTokenRules: [],
      semanticHighlighting: false
    };
    return _loadColorTheme(extensionResourceLoaderService, this.location, result).then((_) => {
      this.isLoaded = true;
      this.semanticTokenRules = result.semanticTokenRules;
      this.colorMap = result.colors;
      this.themeTokenColors = result.textMateRules;
      this.themeSemanticHighlighting = result.semanticHighlighting;
    });
  }
  clearCaches() {
    this.tokenColorIndex = void 0;
    this.tokenFontIndex = void 0;
    this.textMateThemingRules = void 0;
    this.themeTokenScopeMatchers = void 0;
    this.customTokenScopeMatchers = void 0;
  }
  toStorage(storageService) {
    const colorMapData = {};
    for (const key in this.colorMap) {
      colorMapData[key] = Color.Format.CSS.formatHexA(this.colorMap[key], true);
    }
    const value = JSON.stringify({
      id: this.id,
      label: this.label,
      settingsId: this.settingsId,
      themeTokenColors: this.themeTokenColors.map((tc) => ({ settings: tc.settings, scope: tc.scope })),
      // don't persist names
      semanticTokenRules: this.semanticTokenRules.map(SemanticTokenRule.toJSONObject),
      extensionData: ExtensionData.toJSONObject(this.extensionData),
      themeSemanticHighlighting: this.themeSemanticHighlighting,
      colorMap: colorMapData,
      watch: this.watch
    });
    storageService.store(_ColorThemeData.STORAGE_KEY, value, StorageScope.PROFILE, StorageTarget.USER);
  }
  get themeTypeSelector() {
    return this.classNames[0];
  }
  get classNames() {
    return this.id.split(" ");
  }
  get type() {
    switch (this.themeTypeSelector) {
      case ThemeTypeSelector.VS:
        return ColorScheme.LIGHT;
      case ThemeTypeSelector.HC_BLACK:
        return ColorScheme.HIGH_CONTRAST_DARK;
      case ThemeTypeSelector.HC_LIGHT:
        return ColorScheme.HIGH_CONTRAST_LIGHT;
      default:
        return ColorScheme.DARK;
    }
  }
  // constructors
  static createUnloadedThemeForThemeType(themeType, colorMap) {
    return _ColorThemeData.createUnloadedTheme(getThemeTypeSelector(themeType), colorMap);
  }
  static createUnloadedTheme(id, colorMap) {
    const themeData = new _ColorThemeData(id, "", "__" + id);
    themeData.isLoaded = false;
    themeData.themeTokenColors = [];
    themeData.watch = false;
    if (colorMap) {
      for (const id2 in colorMap) {
        themeData.colorMap[id2] = Color.fromHex(colorMap[id2]);
      }
    }
    return themeData;
  }
  static createLoadedEmptyTheme(id, settingsId) {
    const themeData = new _ColorThemeData(id, "", settingsId);
    themeData.isLoaded = true;
    themeData.themeTokenColors = [];
    themeData.watch = false;
    return themeData;
  }
  static fromStorageData(storageService) {
    const input = storageService.get(_ColorThemeData.STORAGE_KEY, StorageScope.PROFILE);
    if (!input) {
      return void 0;
    }
    try {
      const data = JSON.parse(input);
      const theme = new _ColorThemeData("", "", "");
      for (const key in data) {
        switch (key) {
          case "colorMap": {
            const colorMapData = data[key];
            for (const id in colorMapData) {
              theme.colorMap[id] = Color.fromHex(colorMapData[id]);
            }
            break;
          }
          case "themeTokenColors":
          case "id":
          case "label":
          case "settingsId":
          case "watch":
          case "themeSemanticHighlighting":
            theme[key] = data[key];
            break;
          case "semanticTokenRules": {
            const rulesData = data[key];
            if (Array.isArray(rulesData)) {
              for (const d of rulesData) {
                const rule = SemanticTokenRule.fromJSONObject(tokenClassificationRegistry, d);
                if (rule) {
                  theme.semanticTokenRules.push(rule);
                }
              }
            }
            break;
          }
          case "location":
            break;
          case "extensionData":
            theme.extensionData = ExtensionData.fromJSONObject(data.extensionData);
            break;
        }
      }
      if (!theme.id || !theme.settingsId) {
        return void 0;
      }
      return theme;
    } catch (e) {
      return void 0;
    }
  }
  static fromExtensionTheme(theme, colorThemeLocation, extensionData) {
    const baseTheme = theme["uiTheme"] || "vs-dark";
    const themeSelector = toCSSSelector(extensionData.extensionId, theme.path);
    const id = `${baseTheme} ${themeSelector}`;
    const label = theme.label || basename(theme.path);
    const settingsId = theme.id || label;
    const themeData = new _ColorThemeData(id, label, settingsId);
    themeData.description = theme.description;
    themeData.watch = theme._watch === true;
    themeData.location = colorThemeLocation;
    themeData.extensionData = extensionData;
    themeData.isLoaded = false;
    return themeData;
  }
};
_ColorThemeData.STORAGE_KEY = "colorThemeData";
let ColorThemeData = _ColorThemeData;
function toCSSSelector(extensionId, path) {
  if (path.startsWith("./")) {
    path = path.substr(2);
  }
  let str = `${extensionId}-${path}`;
  str = str.replace(/[^_a-zA-Z0-9-]/g, "-");
  if (str.charAt(0).match(/[0-9-]/)) {
    str = "_" + str;
  }
  return str;
}
async function _loadColorTheme(extensionResourceLoaderService, themeLocation, result) {
  if (resources.extname(themeLocation) === ".json") {
    const content = await extensionResourceLoaderService.readExtensionResource(themeLocation);
    const errors = [];
    const contentValue = Json.parse(content, errors);
    if (errors.length > 0) {
      return Promise.reject(new Error(nls.localize("error.cannotparsejson", "Problems parsing JSON theme file: {0}", errors.map((e) => getParseErrorMessage(e.error)).join(", "))));
    } else if (Json.getNodeType(contentValue) !== "object") {
      return Promise.reject(new Error(nls.localize("error.invalidformat", "Invalid format for JSON theme file: Object expected.")));
    }
    if (contentValue.include) {
      await _loadColorTheme(extensionResourceLoaderService, resources.joinPath(resources.dirname(themeLocation), contentValue.include), result);
    }
    if (Array.isArray(contentValue.settings)) {
      convertSettings(contentValue.settings, result);
      return null;
    }
    result.semanticHighlighting = result.semanticHighlighting || contentValue.semanticHighlighting;
    const colors = contentValue.colors;
    if (colors) {
      if (typeof colors !== "object") {
        return Promise.reject(new Error(nls.localize({ key: "error.invalidformat.colors", comment: ["{0} will be replaced by a path. Values in quotes should not be translated."] }, "Problem parsing color theme file: {0}. Property 'colors' is not of type 'object'.", themeLocation.toString())));
      }
      for (const colorId in colors) {
        const colorVal = colors[colorId];
        if (colorVal === DEFAULT_COLOR_CONFIG_VALUE) {
          delete result.colors[colorId];
        } else if (typeof colorVal === "string") {
          result.colors[colorId] = Color.fromHex(colors[colorId]);
        }
      }
    }
    const tokenColors = contentValue.tokenColors;
    if (tokenColors) {
      if (Array.isArray(tokenColors)) {
        result.textMateRules.push(...tokenColors);
      } else if (typeof tokenColors === "string") {
        await _loadSyntaxTokens(extensionResourceLoaderService, resources.joinPath(resources.dirname(themeLocation), tokenColors), result);
      } else {
        return Promise.reject(new Error(nls.localize({ key: "error.invalidformat.tokenColors", comment: ["{0} will be replaced by a path. Values in quotes should not be translated."] }, "Problem parsing color theme file: {0}. Property 'tokenColors' should be either an array specifying colors or a path to a TextMate theme file", themeLocation.toString())));
      }
    }
    const semanticTokenColors = contentValue.semanticTokenColors;
    if (semanticTokenColors && typeof semanticTokenColors === "object") {
      for (const key in semanticTokenColors) {
        try {
          const rule = readSemanticTokenRule(key, semanticTokenColors[key]);
          if (rule) {
            result.semanticTokenRules.push(rule);
          }
        } catch (e) {
          return Promise.reject(new Error(nls.localize({ key: "error.invalidformat.semanticTokenColors", comment: ["{0} will be replaced by a path. Values in quotes should not be translated."] }, "Problem parsing color theme file: {0}. Property 'semanticTokenColors' contains a invalid selector", themeLocation.toString())));
        }
      }
    }
  } else {
    return _loadSyntaxTokens(extensionResourceLoaderService, themeLocation, result);
  }
}
function _loadSyntaxTokens(extensionResourceLoaderService, themeLocation, result) {
  return extensionResourceLoaderService.readExtensionResource(themeLocation).then((content) => {
    try {
      const contentValue = parsePList(content);
      const settings = contentValue.settings;
      if (!Array.isArray(settings)) {
        return Promise.reject(new Error(nls.localize("error.plist.invalidformat", "Problem parsing tmTheme file: {0}. 'settings' is not array.")));
      }
      convertSettings(settings, result);
      return Promise.resolve(null);
    } catch (e) {
      return Promise.reject(new Error(nls.localize("error.cannotparse", "Problems parsing tmTheme file: {0}", e.message)));
    }
  }, (error) => {
    return Promise.reject(new Error(nls.localize("error.cannotload", "Problems loading tmTheme file {0}: {1}", themeLocation.toString(), error.message)));
  });
}
const defaultThemeColors = {
  "light": [
    { scope: "token.info-token", settings: { foreground: "#316bcd" } },
    { scope: "token.warn-token", settings: { foreground: "#cd9731" } },
    { scope: "token.error-token", settings: { foreground: "#cd3131" } },
    { scope: "token.debug-token", settings: { foreground: "#800080" } }
  ],
  "dark": [
    { scope: "token.info-token", settings: { foreground: "#6796e6" } },
    { scope: "token.warn-token", settings: { foreground: "#cd9731" } },
    { scope: "token.error-token", settings: { foreground: "#f44747" } },
    { scope: "token.debug-token", settings: { foreground: "#b267e6" } }
  ],
  "hcLight": [
    { scope: "token.info-token", settings: { foreground: "#316bcd" } },
    { scope: "token.warn-token", settings: { foreground: "#cd9731" } },
    { scope: "token.error-token", settings: { foreground: "#cd3131" } },
    { scope: "token.debug-token", settings: { foreground: "#800080" } }
  ],
  "hcDark": [
    { scope: "token.info-token", settings: { foreground: "#6796e6" } },
    { scope: "token.warn-token", settings: { foreground: "#008000" } },
    { scope: "token.error-token", settings: { foreground: "#FF0000" } },
    { scope: "token.debug-token", settings: { foreground: "#b267e6" } }
  ]
};
const noMatch = (_scope) => -1;
function nameMatcher(identifiers, scopes) {
  if (scopes.length < identifiers.length) {
    return -1;
  }
  let score = void 0;
  const every = identifiers.every((identifier) => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopesAreMatching(scopes[i], identifier)) {
        score = (i + 1) * 65536 + identifier.length;
        return true;
      }
    }
    return false;
  });
  return every && score !== void 0 ? score : -1;
}
function scopesAreMatching(thisScopeName, scopeName) {
  if (!thisScopeName) {
    return false;
  }
  if (thisScopeName === scopeName) {
    return true;
  }
  const len = scopeName.length;
  return thisScopeName.length > len && thisScopeName.substr(0, len) === scopeName && thisScopeName[len] === ".";
}
function getScopeMatcher(rule) {
  const ruleScope = rule.scope;
  if (!ruleScope || !rule.settings) {
    return noMatch;
  }
  const matchers = [];
  if (Array.isArray(ruleScope)) {
    for (const rs of ruleScope) {
      createMatchers(rs, nameMatcher, matchers);
    }
  } else {
    createMatchers(ruleScope, nameMatcher, matchers);
  }
  if (matchers.length === 0) {
    return noMatch;
  }
  return (scope) => {
    let max = matchers[0].matcher(scope);
    for (let i = 1; i < matchers.length; i++) {
      max = Math.max(max, matchers[i].matcher(scope));
    }
    return max;
  };
}
function readSemanticTokenRule(selectorString, settings) {
  const selector = tokenClassificationRegistry.parseTokenSelector(selectorString);
  let style;
  if (typeof settings === "string") {
    style = TokenStyle.fromSettings(settings, void 0);
  } else if (isSemanticTokenColorizationSetting(settings)) {
    style = TokenStyle.fromSettings(settings.foreground, settings.fontStyle, settings.bold, settings.underline, settings.strikethrough, settings.italic);
  }
  if (style) {
    return { selector, style };
  }
  return void 0;
}
function isSemanticTokenColorizationSetting(style) {
  return style && (types.isString(style.foreground) || types.isString(style.fontStyle) || types.isBoolean(style.italic) || types.isBoolean(style.underline) || types.isBoolean(style.strikethrough) || types.isBoolean(style.bold));
}
function findMetadata(colorThemeData, captureNames, languageId, bracket) {
  let metadata = 0;
  metadata |= languageId << MetadataConsts.LANGUAGEID_OFFSET;
  const definitions = {};
  const tokenStyle = colorThemeData.resolveScopes([captureNames], definitions);
  if (captureNames.length > 0) {
    const standardToken = toStandardTokenType(captureNames[captureNames.length - 1]);
    metadata |= standardToken << MetadataConsts.TOKEN_TYPE_OFFSET;
  }
  const fontStyle = definitions.foreground?.settings.fontStyle || definitions.bold?.settings.fontStyle;
  if (fontStyle?.includes("italic")) {
    metadata |= FontStyle.Italic | MetadataConsts.ITALIC_MASK;
  }
  if (fontStyle?.includes("bold")) {
    metadata |= FontStyle.Bold | MetadataConsts.BOLD_MASK;
  }
  if (fontStyle?.includes("underline")) {
    metadata |= FontStyle.Underline | MetadataConsts.UNDERLINE_MASK;
  }
  if (fontStyle?.includes("strikethrough")) {
    metadata |= FontStyle.Strikethrough | MetadataConsts.STRIKETHROUGH_MASK;
  }
  const foreground = tokenStyle?.foreground;
  const tokenStyleForeground = foreground !== void 0 ? colorThemeData.getTokenColorIndex().get(foreground) : ColorId.DefaultForeground;
  metadata |= tokenStyleForeground << MetadataConsts.FOREGROUND_OFFSET;
  if (bracket) {
    metadata |= MetadataConsts.BALANCED_BRACKETS_MASK;
  }
  return metadata;
}
class TokenColorIndex {
  constructor() {
    this._lastColorId = 0;
    this._id2color = [];
    this._color2id = /* @__PURE__ */ Object.create(null);
  }
  add(color) {
    color = normalizeColor(color);
    if (color === void 0) {
      return 0;
    }
    let value = this._color2id[color];
    if (value) {
      return value;
    }
    value = ++this._lastColorId;
    this._color2id[color] = value;
    this._id2color[value] = color;
    return value;
  }
  get(color) {
    color = normalizeColor(color);
    if (color === void 0) {
      return 0;
    }
    const value = this._color2id[color];
    if (value) {
      return value;
    }
    console.log(`Color ${color} not in index.`);
    return 0;
  }
  asArray() {
    return this._id2color.slice(0);
  }
}
class TokenFontIndex {
  constructor() {
    this._lastFontId = 0;
    this._id2font = [];
    this._font2id = /* @__PURE__ */ new Map();
  }
  add(fontFamily, fontSizeMultiplier, lineHeightMultiplier) {
    const font = { fontFamily, fontSizeMultiplier, lineHeightMultiplier };
    let value = this._font2id.get(font);
    if (value) {
      return value;
    }
    value = ++this._lastFontId;
    this._font2id.set(font, value);
    this._id2font[value] = font;
    return value;
  }
  get(font) {
    const value = this._font2id.get(font);
    if (value) {
      return value;
    }
    return 0;
  }
  asArray() {
    return this._id2font.slice(0);
  }
}
function normalizeColor(color) {
  if (!color) {
    return void 0;
  }
  if (typeof color !== "string") {
    color = Color.Format.CSS.formatHexA(color, true);
  }
  const len = color.length;
  if (color.charCodeAt(0) !== CharCode.Hash || len !== 4 && len !== 5 && len !== 7 && len !== 9) {
    return void 0;
  }
  const result = [CharCode.Hash];
  for (let i = 1; i < len; i++) {
    const upper = hexUpper(color.charCodeAt(i));
    if (!upper) {
      return void 0;
    }
    result.push(upper);
    if (len === 4 || len === 5) {
      result.push(upper);
    }
  }
  if (result.length === 9 && result[7] === CharCode.F && result[8] === CharCode.F) {
    result.length = 7;
  }
  return String.fromCharCode(...result);
}
function hexUpper(charCode) {
  if (charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9 || charCode >= CharCode.A && charCode <= CharCode.F) {
    return charCode;
  } else if (charCode >= CharCode.a && charCode <= CharCode.f) {
    return charCode - CharCode.a + CharCode.A;
  }
  return 0;
}
export {
  ColorThemeData,
  findMetadata
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcY29sb3JUaGVtZURhdGEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgSnNvbiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRGF0YSwgSVRva2VuQ29sb3JDdXN0b21pemF0aW9ucywgSVRleHRNYXRlVGhlbWluZ1J1bGUsIElXb3JrYmVuY2hDb2xvclRoZW1lLCBJQ29sb3JNYXAsIElUaGVtZUV4dGVuc2lvblBvaW50LCBJQ29sb3JDdXN0b21pemF0aW9ucywgSVNlbWFudGljVG9rZW5SdWxlcywgSVNlbWFudGljVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nLCBJU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMsIElUaGVtZVNjb3BhYmxlQ3VzdG9taXphdGlvbnMsIElUaGVtZVNjb3BlZEN1c3RvbWl6YXRpb25zLCBUSEVNRV9TQ09QRV9DTE9TRV9QQVJFTiwgVEhFTUVfU0NPUEVfT1BFTl9QQVJFTiwgdGhlbWVTY29wZVJlZ2V4LCBUSEVNRV9TQ09QRV9XSUxEQ0FSRCB9IGZyb20gJy4vd29ya2JlbmNoVGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNvbnZlcnRTZXR0aW5ncyB9IGZyb20gJy4vdGhlbWVDb21wYXRpYmlsaXR5LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbG9yUmVnaXN0cnlFeHRlbnNpb25zLCBJQ29sb3JSZWdpc3RyeSwgQ29sb3JJZGVudGlmaWVyLCBlZGl0b3JCYWNrZ3JvdW5kLCBlZGl0b3JGb3JlZ3JvdW5kLCBERUZBVUxUX0NPTE9SX0NPTkZJR19WQUxVRSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElGb250VG9rZW5PcHRpb25zLCBJVG9rZW5TdHlsZSwgZ2V0VGhlbWVUeXBlU2VsZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGdldFBhcnNlRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkVycm9yTWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHBhcnNlIGFzIHBhcnNlUExpc3QgfSBmcm9tICcuL3BsaXN0UGFyc2VyLmpzJztcbmltcG9ydCB7IFRva2VuU3R5bGUsIFNlbWFudGljVG9rZW5SdWxlLCBQcm9iZVNjb3BlLCBnZXRUb2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnksIFRva2VuU3R5bGVWYWx1ZSwgVG9rZW5TdHlsZURhdGEsIHBhcnNlQ2xhc3NpZmllclN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTWF0Y2hlcldpdGhQcmlvcml0eSwgTWF0Y2hlciwgY3JlYXRlTWF0Y2hlcnMgfSBmcm9tICcuL3RleHRNYXRlU2NvcGVNYXRjaGVyLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIuanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBTdG9yYWdlU2NvcGUsIElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGhlbWVDb25maWd1cmF0aW9uIH0gZnJvbSAnLi90aGVtZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29sb3JTY2hlbWUsIFRoZW1lVHlwZVNlbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IENvbG9ySWQsIEZvbnRTdHlsZSwgTWV0YWRhdGFDb25zdHMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgdG9TdGFuZGFyZFRva2VuVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL3Rva2VuaXphdGlvbi5qcyc7XG5cbmNvbnN0IGNvbG9yUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29sb3JSZWdpc3RyeT4oQ29sb3JSZWdpc3RyeUV4dGVuc2lvbnMuQ29sb3JDb250cmlidXRpb24pO1xuXG5jb25zdCB0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkgPSBnZXRUb2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkoKTtcblxuY29uc3QgdG9rZW5Hcm91cFRvU2NvcGVzTWFwID0ge1xuXHRjb21tZW50czogWydjb21tZW50JywgJ3B1bmN0dWF0aW9uLmRlZmluaXRpb24uY29tbWVudCddLFxuXHRzdHJpbmdzOiBbJ3N0cmluZycsICdtZXRhLmVtYmVkZGVkLmFzc2VtYmx5J10sXG5cdGtleXdvcmRzOiBbJ2tleXdvcmQgLSBrZXl3b3JkLm9wZXJhdG9yJywgJ2tleXdvcmQuY29udHJvbCcsICdzdG9yYWdlJywgJ3N0b3JhZ2UudHlwZSddLFxuXHRudW1iZXJzOiBbJ2NvbnN0YW50Lm51bWVyaWMnXSxcblx0dHlwZXM6IFsnZW50aXR5Lm5hbWUudHlwZScsICdlbnRpdHkubmFtZS5jbGFzcycsICdzdXBwb3J0LnR5cGUnLCAnc3VwcG9ydC5jbGFzcyddLFxuXHRmdW5jdGlvbnM6IFsnZW50aXR5Lm5hbWUuZnVuY3Rpb24nLCAnc3VwcG9ydC5mdW5jdGlvbiddLFxuXHR2YXJpYWJsZXM6IFsndmFyaWFibGUnLCAnZW50aXR5Lm5hbWUudmFyaWFibGUnXVxufTtcblxuXG5leHBvcnQgdHlwZSBUb2tlblN0eWxlRGVmaW5pdGlvbiA9IFNlbWFudGljVG9rZW5SdWxlIHwgUHJvYmVTY29wZVtdIHwgVG9rZW5TdHlsZVZhbHVlO1xuZXhwb3J0IHR5cGUgVG9rZW5TdHlsZURlZmluaXRpb25zID0geyBbUCBpbiBrZXlvZiBUb2tlblN0eWxlRGF0YV0/OiBUb2tlblN0eWxlRGVmaW5pdGlvbiB8IHVuZGVmaW5lZCB9O1xuXG5leHBvcnQgdHlwZSBUZXh0TWF0ZVRoZW1pbmdSdWxlRGVmaW5pdGlvbnMgPSB7IFtQIGluIGtleW9mIFRva2VuU3R5bGVEYXRhXT86IElUZXh0TWF0ZVRoZW1pbmdSdWxlIHwgdW5kZWZpbmVkOyB9ICYgeyBzY29wZT86IFByb2JlU2NvcGUgfTtcblxuaW50ZXJmYWNlIElDb2xvck9yRGVmYXVsdE1hcCB7XG5cdFtpZDogc3RyaW5nXTogQ29sb3IgfCB0eXBlb2YgREVGQVVMVF9DT0xPUl9DT05GSUdfVkFMVUU7XG59XG5cbmV4cG9ydCBjbGFzcyBDb2xvclRoZW1lRGF0YSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb2xvclRoZW1lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgU1RPUkFHRV9LRVkgPSAnY29sb3JUaGVtZURhdGEnO1xuXG5cdGlkOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHNldHRpbmdzSWQ6IHN0cmluZztcblx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGlzTG9hZGVkOiBib29sZWFuO1xuXHRsb2NhdGlvbj86IFVSSTsgLy8gb25seSBzZXQgZm9yIGV4dGVuc2lvbiBmcm9tIHRoZSByZWdpc3RyeSwgbm90IGZvciB0aGVtZXMgcmVzdG9yZWQgZnJvbSB0aGUgc3RvcmFnZVxuXHR3YXRjaD86IGJvb2xlYW47XG5cdGV4dGVuc2lvbkRhdGE/OiBFeHRlbnNpb25EYXRhO1xuXG5cdHByaXZhdGUgdGhlbWVTZW1hbnRpY0hpZ2hsaWdodGluZzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXN0b21TZW1hbnRpY0hpZ2hsaWdodGluZzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXN0b21TZW1hbnRpY0hpZ2hsaWdodGluZ0RlcHJlY2F0ZWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB0aGVtZVRva2VuQ29sb3JzOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdID0gW107XG5cdHByaXZhdGUgY3VzdG9tVG9rZW5Db2xvcnM6IElUZXh0TWF0ZVRoZW1pbmdSdWxlW10gPSBbXTtcblx0cHJpdmF0ZSBjb2xvck1hcDogSUNvbG9yTWFwID0ge307XG5cdHByaXZhdGUgY3VzdG9tQ29sb3JNYXA6IElDb2xvck9yRGVmYXVsdE1hcCA9IHt9O1xuXG5cdHByaXZhdGUgc2VtYW50aWNUb2tlblJ1bGVzOiBTZW1hbnRpY1Rva2VuUnVsZVtdID0gW107XG5cdHByaXZhdGUgY3VzdG9tU2VtYW50aWNUb2tlblJ1bGVzOiBTZW1hbnRpY1Rva2VuUnVsZVtdID0gW107XG5cblx0cHJpdmF0ZSB0aGVtZVRva2VuU2NvcGVNYXRjaGVyczogTWF0Y2hlcjxQcm9iZVNjb3BlPltdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1c3RvbVRva2VuU2NvcGVNYXRjaGVyczogTWF0Y2hlcjxQcm9iZVNjb3BlPltdIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgdGV4dE1hdGVUaGVtaW5nUnVsZXM6IElUZXh0TWF0ZVRoZW1pbmdSdWxlW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7IC8vIGNyZWF0ZWQgb24gZGVtYW5kXG5cdHByaXZhdGUgdG9rZW5Db2xvckluZGV4OiBUb2tlbkNvbG9ySW5kZXggfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7IC8vIGNyZWF0ZWQgb24gZGVtYW5kXG5cdHByaXZhdGUgdG9rZW5Gb250SW5kZXg6IFRva2VuRm9udEluZGV4IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkOyAvLyBjcmVhdGVkIG9uIGRlbWFuZFxuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgc2V0dGluZ3NJZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLnNldHRpbmdzSWQgPSBzZXR0aW5nc0lkO1xuXHRcdHRoaXMuaXNMb2FkZWQgPSBmYWxzZTtcblx0fVxuXG5cdGdldCBzZW1hbnRpY0hpZ2hsaWdodGluZygpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5jdXN0b21TZW1hbnRpY0hpZ2hsaWdodGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jdXN0b21TZW1hbnRpY0hpZ2hsaWdodGluZztcblx0XHR9XG5cdFx0aWYgKHRoaXMuY3VzdG9tU2VtYW50aWNIaWdobGlnaHRpbmdEZXByZWNhdGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmN1c3RvbVNlbWFudGljSGlnaGxpZ2h0aW5nRGVwcmVjYXRlZDtcblx0XHR9XG5cdFx0cmV0dXJuICEhdGhpcy50aGVtZVNlbWFudGljSGlnaGxpZ2h0aW5nO1xuXHR9XG5cblx0Z2V0IHRva2VuQ29sb3JzKCk6IElUZXh0TWF0ZVRoZW1pbmdSdWxlW10ge1xuXHRcdGlmICghdGhpcy50ZXh0TWF0ZVRoZW1pbmdSdWxlcykge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdID0gW107XG5cblx0XHRcdC8vIHRoZSBkZWZhdWx0IHJ1bGUgKHNjb3BlIGVtcHR5KSBpcyBhbHdheXMgdGhlIGZpcnN0IHJ1bGUuIElnbm9yZSBhbGwgb3RoZXIgZGVmYXVsdCBydWxlcy5cblx0XHRcdGNvbnN0IGZvcmVncm91bmQgPSB0aGlzLmdldENvbG9yKGVkaXRvckZvcmVncm91bmQpIHx8IHRoaXMuZ2V0RGVmYXVsdChlZGl0b3JGb3JlZ3JvdW5kKSE7XG5cdFx0XHRjb25zdCBiYWNrZ3JvdW5kID0gdGhpcy5nZXRDb2xvcihlZGl0b3JCYWNrZ3JvdW5kKSB8fCB0aGlzLmdldERlZmF1bHQoZWRpdG9yQmFja2dyb3VuZCkhO1xuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRzZXR0aW5nczoge1xuXHRcdFx0XHRcdGZvcmVncm91bmQ6IG5vcm1hbGl6ZUNvbG9yKGZvcmVncm91bmQpLFxuXHRcdFx0XHRcdGJhY2tncm91bmQ6IG5vcm1hbGl6ZUNvbG9yKGJhY2tncm91bmQpXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRsZXQgaGFzRGVmYXVsdFRva2VucyA9IGZhbHNlO1xuXG5cdFx0XHRmdW5jdGlvbiBhZGRSdWxlKHJ1bGU6IElUZXh0TWF0ZVRoZW1pbmdSdWxlKSB7XG5cdFx0XHRcdGlmIChydWxlLnNjb3BlICYmIHJ1bGUuc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRpZiAocnVsZS5zY29wZSA9PT0gJ3Rva2VuLmluZm8tdG9rZW4nKSB7XG5cdFx0XHRcdFx0XHRoYXNEZWZhdWx0VG9rZW5zID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcnVsZVNldHRpbmdzID0gcnVsZS5zZXR0aW5ncztcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRzY29wZTogcnVsZS5zY29wZSwgc2V0dGluZ3M6IHtcblx0XHRcdFx0XHRcdFx0Zm9yZWdyb3VuZDogbm9ybWFsaXplQ29sb3IocnVsZVNldHRpbmdzLmZvcmVncm91bmQpLFxuXHRcdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBub3JtYWxpemVDb2xvcihydWxlU2V0dGluZ3MuYmFja2dyb3VuZCksXG5cdFx0XHRcdFx0XHRcdGZvbnRTdHlsZTogcnVsZVNldHRpbmdzLmZvbnRTdHlsZSxcblx0XHRcdFx0XHRcdFx0Zm9udFNpemU6IHJ1bGVTZXR0aW5ncy5mb250U2l6ZSxcblx0XHRcdFx0XHRcdFx0Zm9udEZhbWlseTogcnVsZVNldHRpbmdzLmZvbnRGYW1pbHksXG5cdFx0XHRcdFx0XHRcdGxpbmVIZWlnaHQ6IHJ1bGVTZXR0aW5ncy5saW5lSGVpZ2h0XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy50aGVtZVRva2VuQ29sb3JzLmZvckVhY2goYWRkUnVsZSk7XG5cdFx0XHQvLyBBZGQgdGhlIGN1c3RvbSBjb2xvcnMgYWZ0ZXIgdGhlIHRoZW1lIGNvbG9yc1xuXHRcdFx0Ly8gc28gdGhhdCB0aGV5IHdpbGwgb3ZlcnJpZGUgdGhlbVxuXHRcdFx0dGhpcy5jdXN0b21Ub2tlbkNvbG9ycy5mb3JFYWNoKGFkZFJ1bGUpO1xuXG5cdFx0XHRpZiAoIWhhc0RlZmF1bHRUb2tlbnMpIHtcblx0XHRcdFx0ZGVmYXVsdFRoZW1lQ29sb3JzW3RoaXMudHlwZV0uZm9yRWFjaChhZGRSdWxlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudGV4dE1hdGVUaGVtaW5nUnVsZXMgPSByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRleHRNYXRlVGhlbWluZ1J1bGVzO1xuXHR9XG5cblx0cHVibGljIGdldENvbG9yKGNvbG9ySWQ6IENvbG9ySWRlbnRpZmllciwgdXNlRGVmYXVsdD86IGJvb2xlYW4pOiBDb2xvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY3VzdG9tQ29sb3IgPSB0aGlzLmN1c3RvbUNvbG9yTWFwW2NvbG9ySWRdO1xuXHRcdGlmIChjdXN0b21Db2xvciBpbnN0YW5jZW9mIENvbG9yKSB7XG5cdFx0XHRyZXR1cm4gY3VzdG9tQ29sb3I7XG5cdFx0fVxuXHRcdGlmIChjdXN0b21Db2xvciA9PT0gdW5kZWZpbmVkKSB7IC8qICE9PSBERUZBVUxUX0NPTE9SX0NPTkZJR19WQUxVRSAqL1xuXHRcdFx0Y29uc3QgY29sb3IgPSB0aGlzLmNvbG9yTWFwW2NvbG9ySWRdO1xuXHRcdFx0aWYgKGNvbG9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbG9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodXNlRGVmYXVsdCAhPT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldERlZmF1bHQoY29sb3JJZCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFRva2VuU3R5bGUodHlwZTogc3RyaW5nLCBtb2RpZmllcnM6IHN0cmluZ1tdLCBsYW5ndWFnZTogc3RyaW5nLCB1c2VEZWZhdWx0ID0gdHJ1ZSwgZGVmaW5pdGlvbnM6IFRva2VuU3R5bGVEZWZpbml0aW9ucyA9IHt9KTogVG9rZW5TdHlsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzdWx0OiBhbnkgPSB7XG5cdFx0XHRmb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRib2xkOiB1bmRlZmluZWQsXG5cdFx0XHR1bmRlcmxpbmU6IHVuZGVmaW5lZCxcblx0XHRcdHN0cmlrZXRocm91Z2g6IHVuZGVmaW5lZCxcblx0XHRcdGl0YWxpYzogdW5kZWZpbmVkXG5cdFx0fTtcblx0XHRjb25zdCBzY29yZSA9IHtcblx0XHRcdGZvcmVncm91bmQ6IC0xLFxuXHRcdFx0Ym9sZDogLTEsXG5cdFx0XHR1bmRlcmxpbmU6IC0xLFxuXHRcdFx0c3RyaWtldGhyb3VnaDogLTEsXG5cdFx0XHRpdGFsaWM6IC0xLFxuXHRcdFx0Zm9udEZhbWlseTogLTEsXG5cdFx0XHRmb250U2l6ZTogLTEsXG5cdFx0XHRsaW5lSGVpZ2h0OiAtMVxuXHRcdH07XG5cblx0XHRmdW5jdGlvbiBfcHJvY2Vzc1N0eWxlKG1hdGNoU2NvcmU6IG51bWJlciwgc3R5bGU6IFRva2VuU3R5bGUsIGRlZmluaXRpb246IFRva2VuU3R5bGVEZWZpbml0aW9uKSB7XG5cdFx0XHRpZiAoc3R5bGUuZm9yZWdyb3VuZCAmJiBzY29yZS5mb3JlZ3JvdW5kIDw9IG1hdGNoU2NvcmUpIHtcblx0XHRcdFx0c2NvcmUuZm9yZWdyb3VuZCA9IG1hdGNoU2NvcmU7XG5cdFx0XHRcdHJlc3VsdC5mb3JlZ3JvdW5kID0gc3R5bGUuZm9yZWdyb3VuZDtcblx0XHRcdFx0ZGVmaW5pdGlvbnMuZm9yZWdyb3VuZCA9IGRlZmluaXRpb247XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHAgb2YgWydib2xkJywgJ3VuZGVybGluZScsICdzdHJpa2V0aHJvdWdoJywgJ2l0YWxpYyddKSB7XG5cdFx0XHRcdGNvbnN0IHByb3BlcnR5ID0gcCBhcyBrZXlvZiBUb2tlblN0eWxlO1xuXHRcdFx0XHRjb25zdCBpbmZvID0gc3R5bGVbcHJvcGVydHldO1xuXHRcdFx0XHRpZiAoaW5mbyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aWYgKHNjb3JlW3Byb3BlcnR5XSA8PSBtYXRjaFNjb3JlKSB7XG5cdFx0XHRcdFx0XHRzY29yZVtwcm9wZXJ0eV0gPSBtYXRjaFNjb3JlO1xuXHRcdFx0XHRcdFx0cmVzdWx0W3Byb3BlcnR5XSA9IGluZm87XG5cdFx0XHRcdFx0XHRkZWZpbml0aW9uc1twcm9wZXJ0eV0gPSBkZWZpbml0aW9uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmdW5jdGlvbiBfcHJvY2Vzc1NlbWFudGljVG9rZW5SdWxlKHJ1bGU6IFNlbWFudGljVG9rZW5SdWxlKSB7XG5cdFx0XHRjb25zdCBtYXRjaFNjb3JlID0gcnVsZS5zZWxlY3Rvci5tYXRjaCh0eXBlLCBtb2RpZmllcnMsIGxhbmd1YWdlKTtcblx0XHRcdGlmIChtYXRjaFNjb3JlID49IDApIHtcblx0XHRcdFx0X3Byb2Nlc3NTdHlsZShtYXRjaFNjb3JlLCBydWxlLnN0eWxlLCBydWxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnNlbWFudGljVG9rZW5SdWxlcy5mb3JFYWNoKF9wcm9jZXNzU2VtYW50aWNUb2tlblJ1bGUpO1xuXHRcdHRoaXMuY3VzdG9tU2VtYW50aWNUb2tlblJ1bGVzLmZvckVhY2goX3Byb2Nlc3NTZW1hbnRpY1Rva2VuUnVsZSk7XG5cblx0XHRsZXQgaGFzVW5kZWZpbmVkU3R5bGVQcm9wZXJ0eSA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgayBpbiBzY29yZSkge1xuXHRcdFx0Y29uc3Qga2V5ID0gayBhcyBrZXlvZiBUb2tlblN0eWxlO1xuXHRcdFx0aWYgKHNjb3JlW2tleV0gPT09IC0xKSB7XG5cdFx0XHRcdGhhc1VuZGVmaW5lZFN0eWxlUHJvcGVydHkgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2NvcmVba2V5XSA9IE51bWJlci5NQVhfVkFMVUU7IC8vIHNldCBpdCB0byB0aGUgbWF4LCBzbyBpdCB3b24ndCBiZSByZXBsYWNlZCBieSBhIGRlZmF1bHRcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGhhc1VuZGVmaW5lZFN0eWxlUHJvcGVydHkpIHtcblx0XHRcdGZvciAoY29uc3QgcnVsZSBvZiB0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkuZ2V0VG9rZW5TdHlsaW5nRGVmYXVsdFJ1bGVzKCkpIHtcblx0XHRcdFx0Y29uc3QgbWF0Y2hTY29yZSA9IHJ1bGUuc2VsZWN0b3IubWF0Y2godHlwZSwgbW9kaWZpZXJzLCBsYW5ndWFnZSk7XG5cdFx0XHRcdGlmIChtYXRjaFNjb3JlID49IDApIHtcblx0XHRcdFx0XHRsZXQgc3R5bGU6IFRva2VuU3R5bGUgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHJ1bGUuZGVmYXVsdHMuc2NvcGVzVG9Qcm9iZSkge1xuXHRcdFx0XHRcdFx0c3R5bGUgPSB0aGlzLnJlc29sdmVTY29wZXMocnVsZS5kZWZhdWx0cy5zY29wZXNUb1Byb2JlKTtcblx0XHRcdFx0XHRcdGlmIChzdHlsZSkge1xuXHRcdFx0XHRcdFx0XHRfcHJvY2Vzc1N0eWxlKG1hdGNoU2NvcmUsIHN0eWxlLCBydWxlLmRlZmF1bHRzLnNjb3Blc1RvUHJvYmUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIXN0eWxlICYmIHVzZURlZmF1bHQgIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlblN0eWxlVmFsdWUgPSBydWxlLmRlZmF1bHRzW3RoaXMudHlwZV07XG5cdFx0XHRcdFx0XHRzdHlsZSA9IHRoaXMucmVzb2x2ZVRva2VuU3R5bGVWYWx1ZSh0b2tlblN0eWxlVmFsdWUpO1xuXHRcdFx0XHRcdFx0aWYgKHN0eWxlKSB7XG5cdFx0XHRcdFx0XHRcdF9wcm9jZXNzU3R5bGUobWF0Y2hTY29yZSwgc3R5bGUsIHRva2VuU3R5bGVWYWx1ZSEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gVG9rZW5TdHlsZS5mcm9tRGF0YShyZXN1bHQpO1xuXG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIHRva2VuU3R5bGVWYWx1ZSBSZXNvbHZlIGEgdG9rZW5TdHlsZVZhbHVlIGluIHRoZSBjb250ZXh0IG9mIGEgdGhlbWVcblx0ICovXG5cdHB1YmxpYyByZXNvbHZlVG9rZW5TdHlsZVZhbHVlKHRva2VuU3R5bGVWYWx1ZTogVG9rZW5TdHlsZVZhbHVlIHwgdW5kZWZpbmVkKTogVG9rZW5TdHlsZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRva2VuU3R5bGVWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHRva2VuU3R5bGVWYWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IHsgdHlwZSwgbW9kaWZpZXJzLCBsYW5ndWFnZSB9ID0gcGFyc2VDbGFzc2lmaWVyU3RyaW5nKHRva2VuU3R5bGVWYWx1ZSwgJycpO1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0VG9rZW5TdHlsZSh0eXBlLCBtb2RpZmllcnMsIGxhbmd1YWdlKTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiB0b2tlblN0eWxlVmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdG9rZW5TdHlsZVZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldFRva2VuQ29sb3JJbmRleCgpOiBUb2tlbkNvbG9ySW5kZXgge1xuXHRcdC8vIGNvbGxlY3QgYWxsIGNvbG9ycyB0aGF0IHRva2VucyBjYW4gaGF2ZVxuXHRcdGlmICghdGhpcy50b2tlbkNvbG9ySW5kZXgpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gbmV3IFRva2VuQ29sb3JJbmRleCgpO1xuXHRcdFx0dGhpcy50b2tlbkNvbG9ycy5mb3JFYWNoKHJ1bGUgPT4ge1xuXHRcdFx0XHRpbmRleC5hZGQocnVsZS5zZXR0aW5ncy5mb3JlZ3JvdW5kKTtcblx0XHRcdFx0aW5kZXguYWRkKHJ1bGUuc2V0dGluZ3MuYmFja2dyb3VuZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5zZW1hbnRpY1Rva2VuUnVsZXMuZm9yRWFjaChyID0+IGluZGV4LmFkZChyLnN0eWxlLmZvcmVncm91bmQpKTtcblx0XHRcdHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5nZXRUb2tlblN0eWxpbmdEZWZhdWx0UnVsZXMoKS5mb3JFYWNoKHIgPT4ge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0Q29sb3IgPSByLmRlZmF1bHRzW3RoaXMudHlwZV07XG5cdFx0XHRcdGlmIChkZWZhdWx0Q29sb3IgJiYgdHlwZW9mIGRlZmF1bHRDb2xvciA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRpbmRleC5hZGQoZGVmYXVsdENvbG9yLmZvcmVncm91bmQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuY3VzdG9tU2VtYW50aWNUb2tlblJ1bGVzLmZvckVhY2gociA9PiBpbmRleC5hZGQoci5zdHlsZS5mb3JlZ3JvdW5kKSk7XG5cblx0XHRcdHRoaXMudG9rZW5Db2xvckluZGV4ID0gaW5kZXg7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRva2VuQ29sb3JJbmRleDtcblx0fVxuXG5cblx0cHVibGljIGdldFRva2VuRm9udEluZGV4KCk6IFRva2VuRm9udEluZGV4IHtcblx0XHRpZiAoIXRoaXMudG9rZW5Gb250SW5kZXgpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gbmV3IFRva2VuRm9udEluZGV4KCk7XG5cdFx0XHR0aGlzLnRva2VuQ29sb3JzLmZvckVhY2gociA9PiBpbmRleC5hZGQoci5zZXR0aW5ncy5mb250RmFtaWx5LCByLnNldHRpbmdzLmZvbnRTaXplLCByLnNldHRpbmdzLmxpbmVIZWlnaHQpKTtcblx0XHRcdHRoaXMudG9rZW5Gb250SW5kZXggPSBpbmRleDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudG9rZW5Gb250SW5kZXg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRva2VuQ29sb3JNYXAoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLmdldFRva2VuQ29sb3JJbmRleCgpLmFzQXJyYXkoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdG9rZW5Gb250TWFwKCk6IElGb250VG9rZW5PcHRpb25zW10ge1xuXHRcdHJldHVybiB0aGlzLmdldFRva2VuRm9udEluZGV4KCkuYXNBcnJheSgpO1xuXHR9XG5cblx0cHVibGljIGdldFRva2VuU3R5bGVNZXRhZGF0YSh0eXBlV2l0aExhbmd1YWdlOiBzdHJpbmcsIG1vZGlmaWVyczogc3RyaW5nW10sIGRlZmF1bHRMYW5ndWFnZTogc3RyaW5nLCB1c2VEZWZhdWx0ID0gdHJ1ZSwgZGVmaW5pdGlvbnM6IFRva2VuU3R5bGVEZWZpbml0aW9ucyA9IHt9KTogSVRva2VuU3R5bGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHsgdHlwZSwgbGFuZ3VhZ2UgfSA9IHBhcnNlQ2xhc3NpZmllclN0cmluZyh0eXBlV2l0aExhbmd1YWdlLCBkZWZhdWx0TGFuZ3VhZ2UpO1xuXHRcdGNvbnN0IHN0eWxlID0gdGhpcy5nZXRUb2tlblN0eWxlKHR5cGUsIG1vZGlmaWVycywgbGFuZ3VhZ2UsIHVzZURlZmF1bHQsIGRlZmluaXRpb25zKTtcblx0XHRpZiAoIXN0eWxlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRmb3JlZ3JvdW5kOiB0aGlzLmdldFRva2VuQ29sb3JJbmRleCgpLmdldChzdHlsZS5mb3JlZ3JvdW5kKSxcblx0XHRcdGJvbGQ6IHN0eWxlLmJvbGQsXG5cdFx0XHR1bmRlcmxpbmU6IHN0eWxlLnVuZGVybGluZSxcblx0XHRcdHN0cmlrZXRocm91Z2g6IHN0eWxlLnN0cmlrZXRocm91Z2gsXG5cdFx0XHRpdGFsaWM6IHN0eWxlLml0YWxpYyxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGdldFRva2VuU3R5bGluZ1J1bGVTY29wZShydWxlOiBTZW1hbnRpY1Rva2VuUnVsZSk6ICdzZXR0aW5nJyB8ICd0aGVtZScgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmN1c3RvbVNlbWFudGljVG9rZW5SdWxlcy5pbmRleE9mKHJ1bGUpICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuICdzZXR0aW5nJztcblx0XHR9XG5cdFx0aWYgKHRoaXMuc2VtYW50aWNUb2tlblJ1bGVzLmluZGV4T2YocnVsZSkgIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gJ3RoZW1lJztcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXREZWZhdWx0KGNvbG9ySWQ6IENvbG9ySWRlbnRpZmllcik6IENvbG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gY29sb3JSZWdpc3RyeS5yZXNvbHZlRGVmYXVsdENvbG9yKGNvbG9ySWQsIHRoaXMpO1xuXHR9XG5cblxuXHRwdWJsaWMgcmVzb2x2ZVNjb3BlcyhzY29wZXM6IFByb2JlU2NvcGVbXSwgZGVmaW5pdGlvbnM/OiBUZXh0TWF0ZVRoZW1pbmdSdWxlRGVmaW5pdGlvbnMpOiBUb2tlblN0eWxlIHwgdW5kZWZpbmVkIHtcblxuXHRcdGlmICghdGhpcy50aGVtZVRva2VuU2NvcGVNYXRjaGVycykge1xuXHRcdFx0dGhpcy50aGVtZVRva2VuU2NvcGVNYXRjaGVycyA9IHRoaXMudGhlbWVUb2tlbkNvbG9ycy5tYXAoZ2V0U2NvcGVNYXRjaGVyKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmN1c3RvbVRva2VuU2NvcGVNYXRjaGVycykge1xuXHRcdFx0dGhpcy5jdXN0b21Ub2tlblNjb3BlTWF0Y2hlcnMgPSB0aGlzLmN1c3RvbVRva2VuQ29sb3JzLm1hcChnZXRTY29wZU1hdGNoZXIpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2NvcGUgb2Ygc2NvcGVzKSB7XG5cdFx0XHRsZXQgZm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGZvbnRTdHlsZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGZvcmVncm91bmRTY29yZSA9IC0xO1xuXHRcdFx0bGV0IGZvbnRTdHlsZVNjb3JlID0gLTE7XG5cdFx0XHRsZXQgZm9udFN0eWxlVGhlbWluZ1J1bGU6IElUZXh0TWF0ZVRoZW1pbmdSdWxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGZvcmVncm91bmRUaGVtaW5nUnVsZTogSVRleHRNYXRlVGhlbWluZ1J1bGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGZ1bmN0aW9uIGZpbmRUb2tlblN0eWxlRm9yU2NvcGVJblNjb3BlcyhzY29wZU1hdGNoZXJzOiBNYXRjaGVyPFByb2JlU2NvcGU+W10sIHRoZW1pbmdSdWxlczogSVRleHRNYXRlVGhlbWluZ1J1bGVbXSkge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNjb3BlTWF0Y2hlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBzY29yZSA9IHNjb3BlTWF0Y2hlcnNbaV0oc2NvcGUpO1xuXHRcdFx0XHRcdGlmIChzY29yZSA+PSAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0aGVtaW5nUnVsZSA9IHRoZW1pbmdSdWxlc1tpXTtcblx0XHRcdFx0XHRcdGNvbnN0IHNldHRpbmdzID0gdGhlbWluZ1J1bGVzW2ldLnNldHRpbmdzO1xuXHRcdFx0XHRcdFx0aWYgKHNjb3JlID49IGZvcmVncm91bmRTY29yZSAmJiBzZXR0aW5ncy5mb3JlZ3JvdW5kKSB7XG5cdFx0XHRcdFx0XHRcdGZvcmVncm91bmQgPSBzZXR0aW5ncy5mb3JlZ3JvdW5kO1xuXHRcdFx0XHRcdFx0XHRmb3JlZ3JvdW5kU2NvcmUgPSBzY29yZTtcblx0XHRcdFx0XHRcdFx0Zm9yZWdyb3VuZFRoZW1pbmdSdWxlID0gdGhlbWluZ1J1bGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoc2NvcmUgPj0gZm9udFN0eWxlU2NvcmUgJiYgdHlwZXMuaXNTdHJpbmcoc2V0dGluZ3MuZm9udFN0eWxlKSkge1xuXHRcdFx0XHRcdFx0XHRmb250U3R5bGUgPSBzZXR0aW5ncy5mb250U3R5bGU7XG5cdFx0XHRcdFx0XHRcdGZvbnRTdHlsZVNjb3JlID0gc2NvcmU7XG5cdFx0XHRcdFx0XHRcdGZvbnRTdHlsZVRoZW1pbmdSdWxlID0gdGhlbWluZ1J1bGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmaW5kVG9rZW5TdHlsZUZvclNjb3BlSW5TY29wZXModGhpcy50aGVtZVRva2VuU2NvcGVNYXRjaGVycywgdGhpcy50aGVtZVRva2VuQ29sb3JzKTtcblx0XHRcdGZpbmRUb2tlblN0eWxlRm9yU2NvcGVJblNjb3Blcyh0aGlzLmN1c3RvbVRva2VuU2NvcGVNYXRjaGVycywgdGhpcy5jdXN0b21Ub2tlbkNvbG9ycyk7XG5cdFx0XHRpZiAoZm9yZWdyb3VuZCAhPT0gdW5kZWZpbmVkIHx8IGZvbnRTdHlsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmIChkZWZpbml0aW9ucykge1xuXHRcdFx0XHRcdGRlZmluaXRpb25zLmZvcmVncm91bmQgPSBmb3JlZ3JvdW5kVGhlbWluZ1J1bGU7XG5cdFx0XHRcdFx0ZGVmaW5pdGlvbnMuYm9sZCA9IGRlZmluaXRpb25zLml0YWxpYyA9IGRlZmluaXRpb25zLnVuZGVybGluZSA9IGRlZmluaXRpb25zLnN0cmlrZXRocm91Z2ggPSBmb250U3R5bGVUaGVtaW5nUnVsZTtcblx0XHRcdFx0XHRkZWZpbml0aW9ucy5zY29wZSA9IHNjb3BlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFRva2VuU3R5bGUuZnJvbVNldHRpbmdzKGZvcmVncm91bmQsIGZvbnRTdHlsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZGVmaW5lcyhjb2xvcklkOiBDb2xvcklkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBjdXN0b21Db2xvciA9IHRoaXMuY3VzdG9tQ29sb3JNYXBbY29sb3JJZF07XG5cdFx0aWYgKGN1c3RvbUNvbG9yIGluc3RhbmNlb2YgQ29sb3IpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VzdG9tQ29sb3IgPT09IHVuZGVmaW5lZCAvKiAhPT0gREVGQVVMVF9DT0xPUl9DT05GSUdfVkFMVUUgKi8gJiYgdGhpcy5jb2xvck1hcC5oYXNPd25Qcm9wZXJ0eShjb2xvcklkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb2xvckN1c3RvbWl6YXRpb24oY29sb3JJZDogQ29sb3JJZGVudGlmaWVyKTogQ29sb3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGN1c3RvbUNvbG9yID0gdGhpcy5jdXN0b21Db2xvck1hcFtjb2xvcklkXTtcblx0XHRyZXR1cm4gY3VzdG9tQ29sb3IgaW5zdGFuY2VvZiBDb2xvciA/IGN1c3RvbUNvbG9yIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIHNldEN1c3RvbWl6YXRpb25zKHNldHRpbmdzOiBUaGVtZUNvbmZpZ3VyYXRpb24pIHtcblx0XHR0aGlzLnNldEN1c3RvbUNvbG9ycyhzZXR0aW5ncy5jb2xvckN1c3RvbWl6YXRpb25zKTtcblx0XHR0aGlzLnNldEN1c3RvbVRva2VuQ29sb3JzKHNldHRpbmdzLnRva2VuQ29sb3JDdXN0b21pemF0aW9ucyk7XG5cdFx0dGhpcy5zZXRDdXN0b21TZW1hbnRpY1Rva2VuQ29sb3JzKHNldHRpbmdzLnNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRDdXN0b21Db2xvcnMoY29sb3JzOiBJQ29sb3JDdXN0b21pemF0aW9ucykge1xuXHRcdHRoaXMuY3VzdG9tQ29sb3JNYXAgPSB7fTtcblx0XHR0aGlzLm92ZXJ3cml0ZUN1c3RvbUNvbG9ycyhjb2xvcnMpO1xuXG5cdFx0Y29uc3QgdGhlbWVTcGVjaWZpY0NvbG9ycyA9IHRoaXMuZ2V0VGhlbWVTcGVjaWZpY0NvbG9ycyhjb2xvcnMpIGFzIElDb2xvckN1c3RvbWl6YXRpb25zO1xuXHRcdGlmICh0eXBlcy5pc09iamVjdCh0aGVtZVNwZWNpZmljQ29sb3JzKSkge1xuXHRcdFx0dGhpcy5vdmVyd3JpdGVDdXN0b21Db2xvcnModGhlbWVTcGVjaWZpY0NvbG9ycyk7XG5cdFx0fVxuXG5cdFx0dGhpcy50b2tlbkNvbG9ySW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50b2tlbkZvbnRJbmRleCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnRleHRNYXRlVGhlbWluZ1J1bGVzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3VzdG9tVG9rZW5TY29wZU1hdGNoZXJzID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBvdmVyd3JpdGVDdXN0b21Db2xvcnMoY29sb3JzOiBJQ29sb3JDdXN0b21pemF0aW9ucykge1xuXHRcdGZvciAoY29uc3QgaWQgaW4gY29sb3JzKSB7XG5cdFx0XHRjb25zdCBjb2xvclZhbCA9IGNvbG9yc1tpZF07XG5cdFx0XHRpZiAoY29sb3JWYWwgPT09IERFRkFVTFRfQ09MT1JfQ09ORklHX1ZBTFVFKSB7XG5cdFx0XHRcdHRoaXMuY3VzdG9tQ29sb3JNYXBbaWRdID0gREVGQVVMVF9DT0xPUl9DT05GSUdfVkFMVUU7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBjb2xvclZhbCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy5jdXN0b21Db2xvck1hcFtpZF0gPSBDb2xvci5mcm9tSGV4KGNvbG9yVmFsKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0Q3VzdG9tVG9rZW5Db2xvcnMoY3VzdG9tVG9rZW5Db2xvcnM6IElUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMpIHtcblx0XHR0aGlzLmN1c3RvbVRva2VuQ29sb3JzID0gW107XG5cdFx0dGhpcy5jdXN0b21TZW1hbnRpY0hpZ2hsaWdodGluZ0RlcHJlY2F0ZWQgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBmaXJzdCBhZGQgdGhlIG5vbi10aGVtZSBzcGVjaWZpYyBzZXR0aW5nc1xuXHRcdHRoaXMuYWRkQ3VzdG9tVG9rZW5Db2xvcnMoY3VzdG9tVG9rZW5Db2xvcnMpO1xuXG5cdFx0Ly8gYXBwZW5kIHRoZW1lIHNwZWNpZmljIHNldHRpbmdzLiBMYXN0IHJ1bGVzIHdpbGwgd2luLlxuXHRcdGNvbnN0IHRoZW1lU3BlY2lmaWNUb2tlbkNvbG9ycyA9IHRoaXMuZ2V0VGhlbWVTcGVjaWZpY0NvbG9ycyhjdXN0b21Ub2tlbkNvbG9ycykgYXMgSVRva2VuQ29sb3JDdXN0b21pemF0aW9ucztcblx0XHRpZiAodHlwZXMuaXNPYmplY3QodGhlbWVTcGVjaWZpY1Rva2VuQ29sb3JzKSkge1xuXHRcdFx0dGhpcy5hZGRDdXN0b21Ub2tlbkNvbG9ycyh0aGVtZVNwZWNpZmljVG9rZW5Db2xvcnMpO1xuXHRcdH1cblxuXHRcdHRoaXMudG9rZW5Db2xvckluZGV4ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudG9rZW5Gb250SW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50ZXh0TWF0ZVRoZW1pbmdSdWxlcyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmN1c3RvbVRva2VuU2NvcGVNYXRjaGVycyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBzZXRDdXN0b21TZW1hbnRpY1Rva2VuQ29sb3JzKHNlbWFudGljVG9rZW5Db2xvcnM6IElTZW1hbnRpY1Rva2VuQ29sb3JDdXN0b21pemF0aW9ucyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuY3VzdG9tU2VtYW50aWNUb2tlblJ1bGVzID0gW107XG5cdFx0dGhpcy5jdXN0b21TZW1hbnRpY0hpZ2hsaWdodGluZyA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChzZW1hbnRpY1Rva2VuQ29sb3JzKSB7XG5cdFx0XHR0aGlzLmN1c3RvbVNlbWFudGljSGlnaGxpZ2h0aW5nID0gc2VtYW50aWNUb2tlbkNvbG9ycy5lbmFibGVkO1xuXHRcdFx0aWYgKHNlbWFudGljVG9rZW5Db2xvcnMucnVsZXMpIHtcblx0XHRcdFx0dGhpcy5yZWFkU2VtYW50aWNUb2tlblJ1bGVzKHNlbWFudGljVG9rZW5Db2xvcnMucnVsZXMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGhlbWVTcGVjaWZpY0NvbG9ycyA9IHRoaXMuZ2V0VGhlbWVTcGVjaWZpY0NvbG9ycyhzZW1hbnRpY1Rva2VuQ29sb3JzKSBhcyBJU2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnM7XG5cdFx0XHRpZiAodHlwZXMuaXNPYmplY3QodGhlbWVTcGVjaWZpY0NvbG9ycykpIHtcblx0XHRcdFx0aWYgKHRoZW1lU3BlY2lmaWNDb2xvcnMuZW5hYmxlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5jdXN0b21TZW1hbnRpY0hpZ2hsaWdodGluZyA9IHRoZW1lU3BlY2lmaWNDb2xvcnMuZW5hYmxlZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhlbWVTcGVjaWZpY0NvbG9ycy5ydWxlcykge1xuXHRcdFx0XHRcdHRoaXMucmVhZFNlbWFudGljVG9rZW5SdWxlcyh0aGVtZVNwZWNpZmljQ29sb3JzLnJ1bGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudG9rZW5Db2xvckluZGV4ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudG9rZW5Gb250SW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50ZXh0TWF0ZVRoZW1pbmdSdWxlcyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBpc1RoZW1lU2NvcGUoa2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4ga2V5LmNoYXJBdCgwKSA9PT0gVEhFTUVfU0NPUEVfT1BFTl9QQVJFTiAmJiBrZXkuY2hhckF0KGtleS5sZW5ndGggLSAxKSA9PT0gVEhFTUVfU0NPUEVfQ0xPU0VfUEFSRU47XG5cdH1cblxuXHRwdWJsaWMgaXNUaGVtZVNjb3BlTWF0Y2godGhlbWVJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdGhlbWVJZEZpcnN0Q2hhciA9IHRoZW1lSWQuY2hhckF0KDApO1xuXHRcdGNvbnN0IHRoZW1lSWRMYXN0Q2hhciA9IHRoZW1lSWQuY2hhckF0KHRoZW1lSWQubGVuZ3RoIC0gMSk7XG5cdFx0Y29uc3QgdGhlbWVJZFByZWZpeCA9IHRoZW1lSWQuc2xpY2UoMCwgLTEpO1xuXHRcdGNvbnN0IHRoZW1lSWRJbmZpeCA9IHRoZW1lSWQuc2xpY2UoMSwgLTEpO1xuXHRcdGNvbnN0IHRoZW1lSWRTdWZmaXggPSB0aGVtZUlkLnNsaWNlKDEpO1xuXHRcdHJldHVybiB0aGVtZUlkID09PSB0aGlzLnNldHRpbmdzSWRcblx0XHRcdHx8ICh0aGlzLnNldHRpbmdzSWQuaW5jbHVkZXModGhlbWVJZEluZml4KSAmJiB0aGVtZUlkRmlyc3RDaGFyID09PSBUSEVNRV9TQ09QRV9XSUxEQ0FSRCAmJiB0aGVtZUlkTGFzdENoYXIgPT09IFRIRU1FX1NDT1BFX1dJTERDQVJEKVxuXHRcdFx0fHwgKHRoaXMuc2V0dGluZ3NJZC5zdGFydHNXaXRoKHRoZW1lSWRQcmVmaXgpICYmIHRoZW1lSWRMYXN0Q2hhciA9PT0gVEhFTUVfU0NPUEVfV0lMRENBUkQpXG5cdFx0XHR8fCAodGhpcy5zZXR0aW5nc0lkLmVuZHNXaXRoKHRoZW1lSWRTdWZmaXgpICYmIHRoZW1lSWRGaXJzdENoYXIgPT09IFRIRU1FX1NDT1BFX1dJTERDQVJEKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUaGVtZVNwZWNpZmljQ29sb3JzKGNvbG9yczogSVRoZW1lU2NvcGFibGVDdXN0b21pemF0aW9ucyk6IElUaGVtZVNjb3BlZEN1c3RvbWl6YXRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgdGhlbWVTcGVjaWZpY0NvbG9yczogSVRoZW1lU2NvcGVkQ3VzdG9taXphdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gY29sb3JzKSB7XG5cdFx0XHRjb25zdCBzY29wZWRDb2xvcnMgPSBjb2xvcnNba2V5XTtcblx0XHRcdGlmICh0aGlzLmlzVGhlbWVTY29wZShrZXkpICYmIHNjb3BlZENvbG9ycyBpbnN0YW5jZW9mIE9iamVjdCAmJiAhQXJyYXkuaXNBcnJheShzY29wZWRDb2xvcnMpKSB7XG5cdFx0XHRcdGNvbnN0IHRoZW1lU2NvcGVMaXN0ID0ga2V5Lm1hdGNoKHRoZW1lU2NvcGVSZWdleCkgfHwgW107XG5cdFx0XHRcdGZvciAoY29uc3QgdGhlbWVTY29wZSBvZiB0aGVtZVNjb3BlTGlzdCkge1xuXHRcdFx0XHRcdGNvbnN0IHRoZW1lSWQgPSB0aGVtZVNjb3BlLnN1YnN0cmluZygxLCB0aGVtZVNjb3BlLmxlbmd0aCAtIDEpO1xuXHRcdFx0XHRcdGlmICh0aGlzLmlzVGhlbWVTY29wZU1hdGNoKHRoZW1lSWQpKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXRoZW1lU3BlY2lmaWNDb2xvcnMpIHtcblx0XHRcdFx0XHRcdFx0dGhlbWVTcGVjaWZpY0NvbG9ycyA9IHt9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3Qgc2NvcGVkVGhlbWVTcGVjaWZpY0NvbG9ycyA9IHNjb3BlZENvbG9ycyBhcyBJVGhlbWVTY29wZWRDdXN0b21pemF0aW9ucztcblx0XHRcdFx0XHRcdGZvciAoY29uc3Qgc3Via2V5IGluIHNjb3BlZFRoZW1lU3BlY2lmaWNDb2xvcnMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxDb2xvcnMgPSB0aGVtZVNwZWNpZmljQ29sb3JzW3N1YmtleV07XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG92ZXJyaWRlQ29sb3JzID0gc2NvcGVkVGhlbWVTcGVjaWZpY0NvbG9yc1tzdWJrZXldO1xuXHRcdFx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShvcmlnaW5hbENvbG9ycykgJiYgQXJyYXkuaXNBcnJheShvdmVycmlkZUNvbG9ycykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGVtZVNwZWNpZmljQ29sb3JzW3N1YmtleV0gPSBvcmlnaW5hbENvbG9ycy5jb25jYXQob3ZlcnJpZGVDb2xvcnMpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKG92ZXJyaWRlQ29sb3JzKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhlbWVTcGVjaWZpY0NvbG9yc1tzdWJrZXldID0gb3ZlcnJpZGVDb2xvcnM7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoZW1lU3BlY2lmaWNDb2xvcnM7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRTZW1hbnRpY1Rva2VuUnVsZXModG9rZW5TdHlsaW5nUnVsZVNlY3Rpb246IElTZW1hbnRpY1Rva2VuUnVsZXMpIHtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiB0b2tlblN0eWxpbmdSdWxlU2VjdGlvbikge1xuXHRcdFx0aWYgKCF0aGlzLmlzVGhlbWVTY29wZShrZXkpKSB7IC8vIHN0aWxsIGRvIHRoaXMgdGVzdCB1bnRpbCBleHBlcmltZW50YWwgc2V0dGluZ3MgYXJlIGdvbmVcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBydWxlID0gcmVhZFNlbWFudGljVG9rZW5SdWxlKGtleSwgdG9rZW5TdHlsaW5nUnVsZVNlY3Rpb25ba2V5XSk7XG5cdFx0XHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuY3VzdG9tU2VtYW50aWNUb2tlblJ1bGVzLnB1c2gocnVsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Ly8gaW52YWxpZCBzZWxlY3RvciwgaWdub3JlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFkZEN1c3RvbVRva2VuQ29sb3JzKGN1c3RvbVRva2VuQ29sb3JzOiBJVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zKSB7XG5cdFx0Ly8gUHV0IHRoZSBnZW5lcmFsIGN1c3RvbWl6YXRpb25zIHN1Y2ggYXMgY29tbWVudHMsIHN0cmluZ3MsIGV0Yy4gZmlyc3Qgc28gdGhhdFxuXHRcdC8vIHRoZXkgY2FuIGJlIG92ZXJyaWRkZW4gYnkgc3BlY2lmaWMgY3VzdG9taXphdGlvbnMgbGlrZSBcInN0cmluZy5pbnRlcnBvbGF0ZWRcIlxuXHRcdGZvciAoY29uc3QgdG9rZW5Hcm91cCBpbiB0b2tlbkdyb3VwVG9TY29wZXNNYXApIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gPGtleW9mIHR5cGVvZiB0b2tlbkdyb3VwVG9TY29wZXNNYXA+dG9rZW5Hcm91cDsgLy8gVFMgZG9lc24ndCB0eXBlICd0b2tlbkdyb3VwJyBwcm9wZXJseVxuXHRcdFx0Y29uc3QgdmFsdWUgPSBjdXN0b21Ub2tlbkNvbG9yc1tncm91cF07XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8geyBmb3JlZ3JvdW5kOiB2YWx1ZSB9IDogdmFsdWU7XG5cdFx0XHRcdGNvbnN0IHNjb3BlcyA9IHRva2VuR3JvdXBUb1Njb3Blc01hcFtncm91cF07XG5cdFx0XHRcdGZvciAoY29uc3Qgc2NvcGUgb2Ygc2NvcGVzKSB7XG5cdFx0XHRcdFx0dGhpcy5jdXN0b21Ub2tlbkNvbG9ycy5wdXNoKHsgc2NvcGUsIHNldHRpbmdzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc3BlY2lmaWMgY3VzdG9taXphdGlvbnNcblx0XHRpZiAoQXJyYXkuaXNBcnJheShjdXN0b21Ub2tlbkNvbG9ycy50ZXh0TWF0ZVJ1bGVzKSkge1xuXHRcdFx0Zm9yIChjb25zdCBydWxlIG9mIGN1c3RvbVRva2VuQ29sb3JzLnRleHRNYXRlUnVsZXMpIHtcblx0XHRcdFx0aWYgKHJ1bGUuc2NvcGUgJiYgcnVsZS5zZXR0aW5ncykge1xuXHRcdFx0XHRcdHRoaXMuY3VzdG9tVG9rZW5Db2xvcnMucHVzaChydWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY3VzdG9tVG9rZW5Db2xvcnMuc2VtYW50aWNIaWdobGlnaHRpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5jdXN0b21TZW1hbnRpY0hpZ2hsaWdodGluZ0RlcHJlY2F0ZWQgPSBjdXN0b21Ub2tlbkNvbG9ycy5zZW1hbnRpY0hpZ2hsaWdodGluZztcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZW5zdXJlTG9hZGVkKGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZTogSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiAhdGhpcy5pc0xvYWRlZCA/IHRoaXMubG9hZChleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UpIDogUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVsb2FkKGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZTogSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmxvYWQoZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZChleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2U6IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMubG9jYXRpb24pIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dGhpcy50aGVtZVRva2VuQ29sb3JzID0gW107XG5cdFx0dGhpcy5jbGVhckNhY2hlcygpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0Y29sb3JzOiB7fSxcblx0XHRcdHRleHRNYXRlUnVsZXM6IFtdLFxuXHRcdFx0c2VtYW50aWNUb2tlblJ1bGVzOiBbXSxcblx0XHRcdHNlbWFudGljSGlnaGxpZ2h0aW5nOiBmYWxzZVxuXHRcdH07XG5cdFx0cmV0dXJuIF9sb2FkQ29sb3JUaGVtZShleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsIHRoaXMubG9jYXRpb24sIHJlc3VsdCkudGhlbihfID0+IHtcblx0XHRcdHRoaXMuaXNMb2FkZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5zZW1hbnRpY1Rva2VuUnVsZXMgPSByZXN1bHQuc2VtYW50aWNUb2tlblJ1bGVzO1xuXHRcdFx0dGhpcy5jb2xvck1hcCA9IHJlc3VsdC5jb2xvcnM7XG5cdFx0XHR0aGlzLnRoZW1lVG9rZW5Db2xvcnMgPSByZXN1bHQudGV4dE1hdGVSdWxlcztcblx0XHRcdHRoaXMudGhlbWVTZW1hbnRpY0hpZ2hsaWdodGluZyA9IHJlc3VsdC5zZW1hbnRpY0hpZ2hsaWdodGluZztcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhckNhY2hlcygpIHtcblx0XHR0aGlzLnRva2VuQ29sb3JJbmRleCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnRva2VuRm9udEluZGV4ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudGV4dE1hdGVUaGVtaW5nUnVsZXMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50aGVtZVRva2VuU2NvcGVNYXRjaGVycyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmN1c3RvbVRva2VuU2NvcGVNYXRjaGVycyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHRvU3RvcmFnZShzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKSB7XG5cdFx0Y29uc3QgY29sb3JNYXBEYXRhOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0ge307XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gdGhpcy5jb2xvck1hcCkge1xuXHRcdFx0Y29sb3JNYXBEYXRhW2tleV0gPSBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEodGhpcy5jb2xvck1hcFtrZXldLCB0cnVlKTtcblx0XHR9XG5cdFx0Ly8gbm8gbmVlZCB0byBwZXJzaXN0IGN1c3RvbSBjb2xvcnMsIHRoZXkgd2lsbCBiZSB0YWtlbiBmcm9tIHRoZSBzZXR0aW5nc1xuXHRcdGNvbnN0IHZhbHVlID0gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0aWQ6IHRoaXMuaWQsXG5cdFx0XHRsYWJlbDogdGhpcy5sYWJlbCxcblx0XHRcdHNldHRpbmdzSWQ6IHRoaXMuc2V0dGluZ3NJZCxcblx0XHRcdHRoZW1lVG9rZW5Db2xvcnM6IHRoaXMudGhlbWVUb2tlbkNvbG9ycy5tYXAodGMgPT4gKHsgc2V0dGluZ3M6IHRjLnNldHRpbmdzLCBzY29wZTogdGMuc2NvcGUgfSkpLCAvLyBkb24ndCBwZXJzaXN0IG5hbWVzXG5cdFx0XHRzZW1hbnRpY1Rva2VuUnVsZXM6IHRoaXMuc2VtYW50aWNUb2tlblJ1bGVzLm1hcChTZW1hbnRpY1Rva2VuUnVsZS50b0pTT05PYmplY3QpLFxuXHRcdFx0ZXh0ZW5zaW9uRGF0YTogRXh0ZW5zaW9uRGF0YS50b0pTT05PYmplY3QodGhpcy5leHRlbnNpb25EYXRhKSxcblx0XHRcdHRoZW1lU2VtYW50aWNIaWdobGlnaHRpbmc6IHRoaXMudGhlbWVTZW1hbnRpY0hpZ2hsaWdodGluZyxcblx0XHRcdGNvbG9yTWFwOiBjb2xvck1hcERhdGEsXG5cdFx0XHR3YXRjaDogdGhpcy53YXRjaFxuXHRcdH0pO1xuXG5cdFx0Ly8gcm9hbSBwZXJzaXN0ZWQgY29sb3IgdGhlbWUgY29sb3JzLiBEb24ndCBlbmFibGUgZm9yIGljb25zIGFzIHRoZXkgY29udGFpbiByZWZlcmVuY2VzIHRvIGZvbnRzIGFuZCBpbWFnZXMuXG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ29sb3JUaGVtZURhdGEuU1RPUkFHRV9LRVksIHZhbHVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdGdldCB0aGVtZVR5cGVTZWxlY3RvcigpOiBUaGVtZVR5cGVTZWxlY3RvciB7XG5cdFx0cmV0dXJuIHRoaXMuY2xhc3NOYW1lc1swXSBhcyBUaGVtZVR5cGVTZWxlY3Rvcjtcblx0fVxuXG5cdGdldCBjbGFzc05hbWVzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5pZC5zcGxpdCgnICcpO1xuXHR9XG5cblx0Z2V0IHR5cGUoKTogQ29sb3JTY2hlbWUge1xuXHRcdHN3aXRjaCAodGhpcy50aGVtZVR5cGVTZWxlY3Rvcikge1xuXHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5WUzogcmV0dXJuIENvbG9yU2NoZW1lLkxJR0hUO1xuXHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5IQ19CTEFDSzogcmV0dXJuIENvbG9yU2NoZW1lLkhJR0hfQ09OVFJBU1RfREFSSztcblx0XHRcdGNhc2UgVGhlbWVUeXBlU2VsZWN0b3IuSENfTElHSFQ6IHJldHVybiBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0xJR0hUO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIENvbG9yU2NoZW1lLkRBUks7XG5cdFx0fVxuXHR9XG5cblx0Ly8gY29uc3RydWN0b3JzXG5cblx0c3RhdGljIGNyZWF0ZVVubG9hZGVkVGhlbWVGb3JUaGVtZVR5cGUodGhlbWVUeXBlOiBDb2xvclNjaGVtZSwgY29sb3JNYXA/OiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIH0pOiBDb2xvclRoZW1lRGF0YSB7XG5cdFx0cmV0dXJuIENvbG9yVGhlbWVEYXRhLmNyZWF0ZVVubG9hZGVkVGhlbWUoZ2V0VGhlbWVUeXBlU2VsZWN0b3IodGhlbWVUeXBlKSwgY29sb3JNYXApO1xuXHR9XG5cblx0c3RhdGljIGNyZWF0ZVVubG9hZGVkVGhlbWUoaWQ6IHN0cmluZywgY29sb3JNYXA/OiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIH0pOiBDb2xvclRoZW1lRGF0YSB7XG5cdFx0Y29uc3QgdGhlbWVEYXRhID0gbmV3IENvbG9yVGhlbWVEYXRhKGlkLCAnJywgJ19fJyArIGlkKTtcblx0XHR0aGVtZURhdGEuaXNMb2FkZWQgPSBmYWxzZTtcblx0XHR0aGVtZURhdGEudGhlbWVUb2tlbkNvbG9ycyA9IFtdO1xuXHRcdHRoZW1lRGF0YS53YXRjaCA9IGZhbHNlO1xuXHRcdGlmIChjb2xvck1hcCkge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBpbiBjb2xvck1hcCkge1xuXHRcdFx0XHR0aGVtZURhdGEuY29sb3JNYXBbaWRdID0gQ29sb3IuZnJvbUhleChjb2xvck1hcFtpZF0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhlbWVEYXRhO1xuXHR9XG5cblx0c3RhdGljIGNyZWF0ZUxvYWRlZEVtcHR5VGhlbWUoaWQ6IHN0cmluZywgc2V0dGluZ3NJZDogc3RyaW5nKTogQ29sb3JUaGVtZURhdGEge1xuXHRcdGNvbnN0IHRoZW1lRGF0YSA9IG5ldyBDb2xvclRoZW1lRGF0YShpZCwgJycsIHNldHRpbmdzSWQpO1xuXHRcdHRoZW1lRGF0YS5pc0xvYWRlZCA9IHRydWU7XG5cdFx0dGhlbWVEYXRhLnRoZW1lVG9rZW5Db2xvcnMgPSBbXTtcblx0XHR0aGVtZURhdGEud2F0Y2ggPSBmYWxzZTtcblx0XHRyZXR1cm4gdGhlbWVEYXRhO1xuXHR9XG5cblx0c3RhdGljIGZyb21TdG9yYWdlRGF0YShzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogQ29sb3JUaGVtZURhdGEgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGlucHV0ID0gc3RvcmFnZVNlcnZpY2UuZ2V0KENvbG9yVGhlbWVEYXRhLlNUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKCFpbnB1dCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRhdGEgPSBKU09OLnBhcnNlKGlucHV0KTtcblx0XHRcdGNvbnN0IHRoZW1lID0gbmV3IENvbG9yVGhlbWVEYXRhKCcnLCAnJywgJycpO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZGF0YSkge1xuXHRcdFx0XHRzd2l0Y2ggKGtleSkge1xuXHRcdFx0XHRcdGNhc2UgJ2NvbG9yTWFwJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29sb3JNYXBEYXRhID0gZGF0YVtrZXldO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBpZCBpbiBjb2xvck1hcERhdGEpIHtcblx0XHRcdFx0XHRcdFx0dGhlbWUuY29sb3JNYXBbaWRdID0gQ29sb3IuZnJvbUhleChjb2xvck1hcERhdGFbaWRdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICd0aGVtZVRva2VuQ29sb3JzJzpcblx0XHRcdFx0XHRjYXNlICdpZCc6IGNhc2UgJ2xhYmVsJzogY2FzZSAnc2V0dGluZ3NJZCc6IGNhc2UgJ3dhdGNoJzogY2FzZSAndGhlbWVTZW1hbnRpY0hpZ2hsaWdodGluZyc6XG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRcdCh0aGVtZSBhcyBhbnkpW2tleV0gPSBkYXRhW2tleV07XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdzZW1hbnRpY1Rva2VuUnVsZXMnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBydWxlc0RhdGEgPSBkYXRhW2tleV07XG5cdFx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShydWxlc0RhdGEpKSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgZCBvZiBydWxlc0RhdGEpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBydWxlID0gU2VtYW50aWNUb2tlblJ1bGUuZnJvbUpTT05PYmplY3QodG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LCBkKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocnVsZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhlbWUuc2VtYW50aWNUb2tlblJ1bGVzLnB1c2gocnVsZSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnbG9jYXRpb24nOlxuXHRcdFx0XHRcdFx0Ly8gaWdub3JlLCBubyBsb25nZXIgcmVzdG9yZVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZXh0ZW5zaW9uRGF0YSc6XG5cdFx0XHRcdFx0XHR0aGVtZS5leHRlbnNpb25EYXRhID0gRXh0ZW5zaW9uRGF0YS5mcm9tSlNPTk9iamVjdChkYXRhLmV4dGVuc2lvbkRhdGEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghdGhlbWUuaWQgfHwgIXRoZW1lLnNldHRpbmdzSWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGVtZTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHN0YXRpYyBmcm9tRXh0ZW5zaW9uVGhlbWUodGhlbWU6IElUaGVtZUV4dGVuc2lvblBvaW50LCBjb2xvclRoZW1lTG9jYXRpb246IFVSSSwgZXh0ZW5zaW9uRGF0YTogRXh0ZW5zaW9uRGF0YSk6IENvbG9yVGhlbWVEYXRhIHtcblx0XHRjb25zdCBiYXNlVGhlbWU6IHN0cmluZyA9IHRoZW1lWyd1aVRoZW1lJ10gfHwgJ3ZzLWRhcmsnO1xuXHRcdGNvbnN0IHRoZW1lU2VsZWN0b3IgPSB0b0NTU1NlbGVjdG9yKGV4dGVuc2lvbkRhdGEuZXh0ZW5zaW9uSWQsIHRoZW1lLnBhdGgpO1xuXHRcdGNvbnN0IGlkID0gYCR7YmFzZVRoZW1lfSAke3RoZW1lU2VsZWN0b3J9YDtcblx0XHRjb25zdCBsYWJlbCA9IHRoZW1lLmxhYmVsIHx8IGJhc2VuYW1lKHRoZW1lLnBhdGgpO1xuXHRcdGNvbnN0IHNldHRpbmdzSWQgPSB0aGVtZS5pZCB8fCBsYWJlbDtcblx0XHRjb25zdCB0aGVtZURhdGEgPSBuZXcgQ29sb3JUaGVtZURhdGEoaWQsIGxhYmVsLCBzZXR0aW5nc0lkKTtcblx0XHR0aGVtZURhdGEuZGVzY3JpcHRpb24gPSB0aGVtZS5kZXNjcmlwdGlvbjtcblx0XHR0aGVtZURhdGEud2F0Y2ggPSB0aGVtZS5fd2F0Y2ggPT09IHRydWU7XG5cdFx0dGhlbWVEYXRhLmxvY2F0aW9uID0gY29sb3JUaGVtZUxvY2F0aW9uO1xuXHRcdHRoZW1lRGF0YS5leHRlbnNpb25EYXRhID0gZXh0ZW5zaW9uRGF0YTtcblx0XHR0aGVtZURhdGEuaXNMb2FkZWQgPSBmYWxzZTtcblx0XHRyZXR1cm4gdGhlbWVEYXRhO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvQ1NTU2VsZWN0b3IoZXh0ZW5zaW9uSWQ6IHN0cmluZywgcGF0aDogc3RyaW5nKSB7XG5cdGlmIChwYXRoLnN0YXJ0c1dpdGgoJy4vJykpIHtcblx0XHRwYXRoID0gcGF0aC5zdWJzdHIoMik7XG5cdH1cblx0bGV0IHN0ciA9IGAke2V4dGVuc2lvbklkfS0ke3BhdGh9YDtcblxuXHQvL3JlbW92ZSBhbGwgY2hhcmFjdGVycyB0aGF0IGFyZSBub3QgYWxsb3dlZCBpbiBjc3Ncblx0c3RyID0gc3RyLnJlcGxhY2UoL1teX2EtekEtWjAtOS1dL2csICctJyk7XG5cdGlmIChzdHIuY2hhckF0KDApLm1hdGNoKC9bMC05LV0vKSkge1xuXHRcdHN0ciA9ICdfJyArIHN0cjtcblx0fVxuXHRyZXR1cm4gc3RyO1xufVxuXG5hc3luYyBmdW5jdGlvbiBfbG9hZENvbG9yVGhlbWUoZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCB0aGVtZUxvY2F0aW9uOiBVUkksIHJlc3VsdDogeyB0ZXh0TWF0ZVJ1bGVzOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdOyBjb2xvcnM6IElDb2xvck1hcDsgc2VtYW50aWNUb2tlblJ1bGVzOiBTZW1hbnRpY1Rva2VuUnVsZVtdOyBzZW1hbnRpY0hpZ2hsaWdodGluZzogYm9vbGVhbiB9KTogUHJvbWlzZTxhbnk+IHtcblx0aWYgKHJlc291cmNlcy5leHRuYW1lKHRoZW1lTG9jYXRpb24pID09PSAnLmpzb24nKSB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5yZWFkRXh0ZW5zaW9uUmVzb3VyY2UodGhlbWVMb2NhdGlvbik7XG5cdFx0Y29uc3QgZXJyb3JzOiBKc29uLlBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRlbnRWYWx1ZSA9IEpzb24ucGFyc2UoY29udGVudCwgZXJyb3JzKTtcblx0XHRpZiAoZXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdlcnJvci5jYW5ub3RwYXJzZWpzb24nLCBcIlByb2JsZW1zIHBhcnNpbmcgSlNPTiB0aGVtZSBmaWxlOiB7MH1cIiwgZXJyb3JzLm1hcChlID0+IGdldFBhcnNlRXJyb3JNZXNzYWdlKGUuZXJyb3IpKS5qb2luKCcsICcpKSkpO1xuXHRcdH0gZWxzZSBpZiAoSnNvbi5nZXROb2RlVHlwZShjb250ZW50VmFsdWUpICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2Vycm9yLmludmFsaWRmb3JtYXQnLCBcIkludmFsaWQgZm9ybWF0IGZvciBKU09OIHRoZW1lIGZpbGU6IE9iamVjdCBleHBlY3RlZC5cIikpKTtcblx0XHR9XG5cdFx0aWYgKGNvbnRlbnRWYWx1ZS5pbmNsdWRlKSB7XG5cdFx0XHRhd2FpdCBfbG9hZENvbG9yVGhlbWUoZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCByZXNvdXJjZXMuam9pblBhdGgocmVzb3VyY2VzLmRpcm5hbWUodGhlbWVMb2NhdGlvbiksIGNvbnRlbnRWYWx1ZS5pbmNsdWRlKSwgcmVzdWx0KTtcblx0XHR9XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoY29udGVudFZhbHVlLnNldHRpbmdzKSkge1xuXHRcdFx0Y29udmVydFNldHRpbmdzKGNvbnRlbnRWYWx1ZS5zZXR0aW5ncywgcmVzdWx0KTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXN1bHQuc2VtYW50aWNIaWdobGlnaHRpbmcgPSByZXN1bHQuc2VtYW50aWNIaWdobGlnaHRpbmcgfHwgY29udGVudFZhbHVlLnNlbWFudGljSGlnaGxpZ2h0aW5nO1xuXHRcdGNvbnN0IGNvbG9ycyA9IGNvbnRlbnRWYWx1ZS5jb2xvcnM7XG5cdFx0aWYgKGNvbG9ycykge1xuXHRcdFx0aWYgKHR5cGVvZiBjb2xvcnMgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKHsga2V5OiAnZXJyb3IuaW52YWxpZGZvcm1hdC5jb2xvcnMnLCBjb21tZW50OiBbJ3swfSB3aWxsIGJlIHJlcGxhY2VkIGJ5IGEgcGF0aC4gVmFsdWVzIGluIHF1b3RlcyBzaG91bGQgbm90IGJlIHRyYW5zbGF0ZWQuJ10gfSwgXCJQcm9ibGVtIHBhcnNpbmcgY29sb3IgdGhlbWUgZmlsZTogezB9LiBQcm9wZXJ0eSAnY29sb3JzJyBpcyBub3Qgb2YgdHlwZSAnb2JqZWN0Jy5cIiwgdGhlbWVMb2NhdGlvbi50b1N0cmluZygpKSkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gbmV3IEpTT04gY29sb3IgdGhlbWVzIGZvcm1hdFxuXHRcdFx0Zm9yIChjb25zdCBjb2xvcklkIGluIGNvbG9ycykge1xuXHRcdFx0XHRjb25zdCBjb2xvclZhbCA9IGNvbG9yc1tjb2xvcklkXTtcblx0XHRcdFx0aWYgKGNvbG9yVmFsID09PSBERUZBVUxUX0NPTE9SX0NPTkZJR19WQUxVRSkgeyAvLyBpZ25vcmUgY29sb3JzIHRoYXQgYXJlIHNldCB0byB0byBkZWZhdWx0XG5cdFx0XHRcdFx0ZGVsZXRlIHJlc3VsdC5jb2xvcnNbY29sb3JJZF07XG5cdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGNvbG9yVmFsID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHJlc3VsdC5jb2xvcnNbY29sb3JJZF0gPSBDb2xvci5mcm9tSGV4KGNvbG9yc1tjb2xvcklkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgdG9rZW5Db2xvcnMgPSBjb250ZW50VmFsdWUudG9rZW5Db2xvcnM7XG5cdFx0aWYgKHRva2VuQ29sb3JzKSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheSh0b2tlbkNvbG9ycykpIHtcblx0XHRcdFx0cmVzdWx0LnRleHRNYXRlUnVsZXMucHVzaCguLi50b2tlbkNvbG9ycyk7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiB0b2tlbkNvbG9ycyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0YXdhaXQgX2xvYWRTeW50YXhUb2tlbnMoZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCByZXNvdXJjZXMuam9pblBhdGgocmVzb3VyY2VzLmRpcm5hbWUodGhlbWVMb2NhdGlvbiksIHRva2VuQ29sb3JzKSwgcmVzdWx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKHsga2V5OiAnZXJyb3IuaW52YWxpZGZvcm1hdC50b2tlbkNvbG9ycycsIGNvbW1lbnQ6IFsnezB9IHdpbGwgYmUgcmVwbGFjZWQgYnkgYSBwYXRoLiBWYWx1ZXMgaW4gcXVvdGVzIHNob3VsZCBub3QgYmUgdHJhbnNsYXRlZC4nXSB9LCBcIlByb2JsZW0gcGFyc2luZyBjb2xvciB0aGVtZSBmaWxlOiB7MH0uIFByb3BlcnR5ICd0b2tlbkNvbG9ycycgc2hvdWxkIGJlIGVpdGhlciBhbiBhcnJheSBzcGVjaWZ5aW5nIGNvbG9ycyBvciBhIHBhdGggdG8gYSBUZXh0TWF0ZSB0aGVtZSBmaWxlXCIsIHRoZW1lTG9jYXRpb24udG9TdHJpbmcoKSkpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2VtYW50aWNUb2tlbkNvbG9ycyA9IGNvbnRlbnRWYWx1ZS5zZW1hbnRpY1Rva2VuQ29sb3JzO1xuXHRcdGlmIChzZW1hbnRpY1Rva2VuQ29sb3JzICYmIHR5cGVvZiBzZW1hbnRpY1Rva2VuQ29sb3JzID09PSAnb2JqZWN0Jykge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gc2VtYW50aWNUb2tlbkNvbG9ycykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJ1bGUgPSByZWFkU2VtYW50aWNUb2tlblJ1bGUoa2V5LCBzZW1hbnRpY1Rva2VuQ29sb3JzW2tleV0pO1xuXHRcdFx0XHRcdGlmIChydWxlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuc2VtYW50aWNUb2tlblJ1bGVzLnB1c2gocnVsZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoeyBrZXk6ICdlcnJvci5pbnZhbGlkZm9ybWF0LnNlbWFudGljVG9rZW5Db2xvcnMnLCBjb21tZW50OiBbJ3swfSB3aWxsIGJlIHJlcGxhY2VkIGJ5IGEgcGF0aC4gVmFsdWVzIGluIHF1b3RlcyBzaG91bGQgbm90IGJlIHRyYW5zbGF0ZWQuJ10gfSwgXCJQcm9ibGVtIHBhcnNpbmcgY29sb3IgdGhlbWUgZmlsZTogezB9LiBQcm9wZXJ0eSAnc2VtYW50aWNUb2tlbkNvbG9ycycgY29udGFpbnMgYSBpbnZhbGlkIHNlbGVjdG9yXCIsIHRoZW1lTG9jYXRpb24udG9TdHJpbmcoKSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gX2xvYWRTeW50YXhUb2tlbnMoZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCB0aGVtZUxvY2F0aW9uLCByZXN1bHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIF9sb2FkU3ludGF4VG9rZW5zKGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZTogSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSwgdGhlbWVMb2NhdGlvbjogVVJJLCByZXN1bHQ6IHsgdGV4dE1hdGVSdWxlczogSVRleHRNYXRlVGhlbWluZ1J1bGVbXTsgY29sb3JzOiBJQ29sb3JNYXAgfSk6IFByb21pc2U8YW55PiB7XG5cdHJldHVybiBleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UucmVhZEV4dGVuc2lvblJlc291cmNlKHRoZW1lTG9jYXRpb24pLnRoZW4oY29udGVudCA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnRWYWx1ZSA9IHBhcnNlUExpc3QoY29udGVudCk7XG5cdFx0XHRjb25zdCBzZXR0aW5nczogSVRleHRNYXRlVGhlbWluZ1J1bGVbXSA9IGNvbnRlbnRWYWx1ZS5zZXR0aW5ncztcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShzZXR0aW5ncykpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2Vycm9yLnBsaXN0LmludmFsaWRmb3JtYXQnLCBcIlByb2JsZW0gcGFyc2luZyB0bVRoZW1lIGZpbGU6IHswfS4gJ3NldHRpbmdzJyBpcyBub3QgYXJyYXkuXCIpKSk7XG5cdFx0XHR9XG5cdFx0XHRjb252ZXJ0U2V0dGluZ3Moc2V0dGluZ3MsIHJlc3VsdCk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdlcnJvci5jYW5ub3RwYXJzZScsIFwiUHJvYmxlbXMgcGFyc2luZyB0bVRoZW1lIGZpbGU6IHswfVwiLCBlLm1lc3NhZ2UpKSk7XG5cdFx0fVxuXHR9LCBlcnJvciA9PiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2Vycm9yLmNhbm5vdGxvYWQnLCBcIlByb2JsZW1zIGxvYWRpbmcgdG1UaGVtZSBmaWxlIHswfTogezF9XCIsIHRoZW1lTG9jYXRpb24udG9TdHJpbmcoKSwgZXJyb3IubWVzc2FnZSkpKTtcblx0fSk7XG59XG5cbmNvbnN0IGRlZmF1bHRUaGVtZUNvbG9yczogeyBbYmFzZVRoZW1lOiBzdHJpbmddOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdIH0gPSB7XG5cdCdsaWdodCc6IFtcblx0XHR7IHNjb3BlOiAndG9rZW4uaW5mby10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjMzE2YmNkJyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLndhcm4tdG9rZW4nLCBzZXR0aW5nczogeyBmb3JlZ3JvdW5kOiAnI2NkOTczMScgfSB9LFxuXHRcdHsgc2NvcGU6ICd0b2tlbi5lcnJvci10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjY2QzMTMxJyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLmRlYnVnLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyM4MDAwODAnIH0gfVxuXHRdLFxuXHQnZGFyayc6IFtcblx0XHR7IHNjb3BlOiAndG9rZW4uaW5mby10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjNjc5NmU2JyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLndhcm4tdG9rZW4nLCBzZXR0aW5nczogeyBmb3JlZ3JvdW5kOiAnI2NkOTczMScgfSB9LFxuXHRcdHsgc2NvcGU6ICd0b2tlbi5lcnJvci10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjZjQ0NzQ3JyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLmRlYnVnLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyNiMjY3ZTYnIH0gfVxuXHRdLFxuXHQnaGNMaWdodCc6IFtcblx0XHR7IHNjb3BlOiAndG9rZW4uaW5mby10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjMzE2YmNkJyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLndhcm4tdG9rZW4nLCBzZXR0aW5nczogeyBmb3JlZ3JvdW5kOiAnI2NkOTczMScgfSB9LFxuXHRcdHsgc2NvcGU6ICd0b2tlbi5lcnJvci10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjY2QzMTMxJyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLmRlYnVnLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyM4MDAwODAnIH0gfVxuXHRdLFxuXHQnaGNEYXJrJzogW1xuXHRcdHsgc2NvcGU6ICd0b2tlbi5pbmZvLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyM2Nzk2ZTYnIH0gfSxcblx0XHR7IHNjb3BlOiAndG9rZW4ud2Fybi10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjMDA4MDAwJyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLmVycm9yLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyNGRjAwMDAnIH0gfSxcblx0XHR7IHNjb3BlOiAndG9rZW4uZGVidWctdG9rZW4nLCBzZXR0aW5nczogeyBmb3JlZ3JvdW5kOiAnI2IyNjdlNicgfSB9XG5cdF1cbn07XG5cbmNvbnN0IG5vTWF0Y2ggPSAoX3Njb3BlOiBQcm9iZVNjb3BlKSA9PiAtMTtcblxuZnVuY3Rpb24gbmFtZU1hdGNoZXIoaWRlbnRpZmllcnM6IHN0cmluZ1tdLCBzY29wZXM6IFByb2JlU2NvcGUpOiBudW1iZXIge1xuXHRpZiAoc2NvcGVzLmxlbmd0aCA8IGlkZW50aWZpZXJzLmxlbmd0aCkge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdGxldCBzY29yZTogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRjb25zdCBldmVyeSA9IGlkZW50aWZpZXJzLmV2ZXJ5KChpZGVudGlmaWVyKSA9PiB7XG5cdFx0Zm9yIChsZXQgaSA9IHNjb3Blcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHNjb3Blc0FyZU1hdGNoaW5nKHNjb3Blc1tpXSwgaWRlbnRpZmllcikpIHtcblx0XHRcdFx0c2NvcmUgPSAoaSArIDEpICogMHgxMDAwMCArIGlkZW50aWZpZXIubGVuZ3RoO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9KTtcblx0cmV0dXJuIGV2ZXJ5ICYmIHNjb3JlICE9PSB1bmRlZmluZWQgPyBzY29yZSA6IC0xO1xufVxuZnVuY3Rpb24gc2NvcGVzQXJlTWF0Y2hpbmcodGhpc1Njb3BlTmFtZTogc3RyaW5nLCBzY29wZU5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRpZiAoIXRoaXNTY29wZU5hbWUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHRoaXNTY29wZU5hbWUgPT09IHNjb3BlTmFtZSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGNvbnN0IGxlbiA9IHNjb3BlTmFtZS5sZW5ndGg7XG5cdHJldHVybiB0aGlzU2NvcGVOYW1lLmxlbmd0aCA+IGxlbiAmJiB0aGlzU2NvcGVOYW1lLnN1YnN0cigwLCBsZW4pID09PSBzY29wZU5hbWUgJiYgdGhpc1Njb3BlTmFtZVtsZW5dID09PSAnLic7XG59XG5cbmZ1bmN0aW9uIGdldFNjb3BlTWF0Y2hlcihydWxlOiBJVGV4dE1hdGVUaGVtaW5nUnVsZSk6IE1hdGNoZXI8UHJvYmVTY29wZT4ge1xuXHRjb25zdCBydWxlU2NvcGUgPSBydWxlLnNjb3BlO1xuXHRpZiAoIXJ1bGVTY29wZSB8fCAhcnVsZS5zZXR0aW5ncykge1xuXHRcdHJldHVybiBub01hdGNoO1xuXHR9XG5cdGNvbnN0IG1hdGNoZXJzOiBNYXRjaGVyV2l0aFByaW9yaXR5PFByb2JlU2NvcGU+W10gPSBbXTtcblx0aWYgKEFycmF5LmlzQXJyYXkocnVsZVNjb3BlKSkge1xuXHRcdGZvciAoY29uc3QgcnMgb2YgcnVsZVNjb3BlKSB7XG5cdFx0XHRjcmVhdGVNYXRjaGVycyhycywgbmFtZU1hdGNoZXIsIG1hdGNoZXJzKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Y3JlYXRlTWF0Y2hlcnMocnVsZVNjb3BlLCBuYW1lTWF0Y2hlciwgbWF0Y2hlcnMpO1xuXHR9XG5cblx0aWYgKG1hdGNoZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBub01hdGNoO1xuXHR9XG5cdHJldHVybiAoc2NvcGU6IFByb2JlU2NvcGUpID0+IHtcblx0XHRsZXQgbWF4ID0gbWF0Y2hlcnNbMF0ubWF0Y2hlcihzY29wZSk7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBtYXRjaGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0bWF4ID0gTWF0aC5tYXgobWF4LCBtYXRjaGVyc1tpXS5tYXRjaGVyKHNjb3BlKSk7XG5cdFx0fVxuXHRcdHJldHVybiBtYXg7XG5cdH07XG59XG5cbmZ1bmN0aW9uIHJlYWRTZW1hbnRpY1Rva2VuUnVsZShzZWxlY3RvclN0cmluZzogc3RyaW5nLCBzZXR0aW5nczogSVNlbWFudGljVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nIHwgc3RyaW5nIHwgYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFNlbWFudGljVG9rZW5SdWxlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc2VsZWN0b3IgPSB0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkucGFyc2VUb2tlblNlbGVjdG9yKHNlbGVjdG9yU3RyaW5nKTtcblx0bGV0IHN0eWxlOiBUb2tlblN0eWxlIHwgdW5kZWZpbmVkO1xuXHRpZiAodHlwZW9mIHNldHRpbmdzID09PSAnc3RyaW5nJykge1xuXHRcdHN0eWxlID0gVG9rZW5TdHlsZS5mcm9tU2V0dGluZ3Moc2V0dGluZ3MsIHVuZGVmaW5lZCk7XG5cdH0gZWxzZSBpZiAoaXNTZW1hbnRpY1Rva2VuQ29sb3JpemF0aW9uU2V0dGluZyhzZXR0aW5ncykpIHtcblx0XHRzdHlsZSA9IFRva2VuU3R5bGUuZnJvbVNldHRpbmdzKHNldHRpbmdzLmZvcmVncm91bmQsIHNldHRpbmdzLmZvbnRTdHlsZSwgc2V0dGluZ3MuYm9sZCwgc2V0dGluZ3MudW5kZXJsaW5lLCBzZXR0aW5ncy5zdHJpa2V0aHJvdWdoLCBzZXR0aW5ncy5pdGFsaWMpO1xuXHR9XG5cdGlmIChzdHlsZSkge1xuXHRcdHJldHVybiB7IHNlbGVjdG9yLCBzdHlsZSB9O1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzU2VtYW50aWNUb2tlbkNvbG9yaXphdGlvblNldHRpbmcoc3R5bGU6IGFueSk6IHN0eWxlIGlzIElTZW1hbnRpY1Rva2VuQ29sb3JpemF0aW9uU2V0dGluZyB7XG5cdHJldHVybiBzdHlsZSAmJiAodHlwZXMuaXNTdHJpbmcoc3R5bGUuZm9yZWdyb3VuZCkgfHwgdHlwZXMuaXNTdHJpbmcoc3R5bGUuZm9udFN0eWxlKSB8fCB0eXBlcy5pc0Jvb2xlYW4oc3R5bGUuaXRhbGljKVxuXHRcdHx8IHR5cGVzLmlzQm9vbGVhbihzdHlsZS51bmRlcmxpbmUpIHx8IHR5cGVzLmlzQm9vbGVhbihzdHlsZS5zdHJpa2V0aHJvdWdoKSB8fCB0eXBlcy5pc0Jvb2xlYW4oc3R5bGUuYm9sZCkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZmluZE1ldGFkYXRhKGNvbG9yVGhlbWVEYXRhOiBDb2xvclRoZW1lRGF0YSwgY2FwdHVyZU5hbWVzOiBzdHJpbmdbXSwgbGFuZ3VhZ2VJZDogbnVtYmVyLCBicmFja2V0OiBib29sZWFuKTogbnVtYmVyIHtcblx0bGV0IG1ldGFkYXRhID0gMDtcblxuXHRtZXRhZGF0YSB8PSAobGFuZ3VhZ2VJZCA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVCk7XG5cblx0Y29uc3QgZGVmaW5pdGlvbnM6IFRleHRNYXRlVGhlbWluZ1J1bGVEZWZpbml0aW9ucyA9IHt9O1xuXHRjb25zdCB0b2tlblN0eWxlID0gY29sb3JUaGVtZURhdGEucmVzb2x2ZVNjb3BlcyhbY2FwdHVyZU5hbWVzXSwgZGVmaW5pdGlvbnMpO1xuXG5cdGlmIChjYXB0dXJlTmFtZXMubGVuZ3RoID4gMCkge1xuXHRcdGNvbnN0IHN0YW5kYXJkVG9rZW4gPSB0b1N0YW5kYXJkVG9rZW5UeXBlKGNhcHR1cmVOYW1lc1tjYXB0dXJlTmFtZXMubGVuZ3RoIC0gMV0pO1xuXHRcdG1ldGFkYXRhIHw9IChzdGFuZGFyZFRva2VuIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKTtcblx0fVxuXG5cdGNvbnN0IGZvbnRTdHlsZSA9IGRlZmluaXRpb25zLmZvcmVncm91bmQ/LnNldHRpbmdzLmZvbnRTdHlsZSB8fCBkZWZpbml0aW9ucy5ib2xkPy5zZXR0aW5ncy5mb250U3R5bGU7XG5cdGlmIChmb250U3R5bGU/LmluY2x1ZGVzKCdpdGFsaWMnKSkge1xuXHRcdG1ldGFkYXRhIHw9IEZvbnRTdHlsZS5JdGFsaWMgfCBNZXRhZGF0YUNvbnN0cy5JVEFMSUNfTUFTSztcblx0fVxuXHRpZiAoZm9udFN0eWxlPy5pbmNsdWRlcygnYm9sZCcpKSB7XG5cdFx0bWV0YWRhdGEgfD0gRm9udFN0eWxlLkJvbGQgfCBNZXRhZGF0YUNvbnN0cy5CT0xEX01BU0s7XG5cdH1cblx0aWYgKGZvbnRTdHlsZT8uaW5jbHVkZXMoJ3VuZGVybGluZScpKSB7XG5cdFx0bWV0YWRhdGEgfD0gRm9udFN0eWxlLlVuZGVybGluZSB8IE1ldGFkYXRhQ29uc3RzLlVOREVSTElORV9NQVNLO1xuXHR9XG5cdGlmIChmb250U3R5bGU/LmluY2x1ZGVzKCdzdHJpa2V0aHJvdWdoJykpIHtcblx0XHRtZXRhZGF0YSB8PSBGb250U3R5bGUuU3RyaWtldGhyb3VnaCB8IE1ldGFkYXRhQ29uc3RzLlNUUklLRVRIUk9VR0hfTUFTSztcblx0fVxuXG5cdGNvbnN0IGZvcmVncm91bmQgPSB0b2tlblN0eWxlPy5mb3JlZ3JvdW5kO1xuXHRjb25zdCB0b2tlblN0eWxlRm9yZWdyb3VuZCA9IChmb3JlZ3JvdW5kICE9PSB1bmRlZmluZWQpID8gY29sb3JUaGVtZURhdGEuZ2V0VG9rZW5Db2xvckluZGV4KCkuZ2V0KGZvcmVncm91bmQpIDogQ29sb3JJZC5EZWZhdWx0Rm9yZWdyb3VuZDtcblx0bWV0YWRhdGEgfD0gdG9rZW5TdHlsZUZvcmVncm91bmQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQ7XG5cblx0aWYgKGJyYWNrZXQpIHtcblx0XHRtZXRhZGF0YSB8PSBNZXRhZGF0YUNvbnN0cy5CQUxBTkNFRF9CUkFDS0VUU19NQVNLO1xuXHR9XG5cblx0cmV0dXJuIG1ldGFkYXRhO1xufVxuXG5jbGFzcyBUb2tlbkNvbG9ySW5kZXgge1xuXG5cdHByaXZhdGUgX2xhc3RDb2xvcklkOiBudW1iZXI7XG5cdHByaXZhdGUgX2lkMmNvbG9yOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSBfY29sb3IyaWQ6IHsgW2NvbG9yOiBzdHJpbmddOiBudW1iZXIgfTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9sYXN0Q29sb3JJZCA9IDA7XG5cdFx0dGhpcy5faWQyY29sb3IgPSBbXTtcblx0XHR0aGlzLl9jb2xvcjJpZCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgYWRkKGNvbG9yOiBzdHJpbmcgfCBDb2xvciB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdFx0Y29sb3IgPSBub3JtYWxpemVDb2xvcihjb2xvcik7XG5cdFx0aWYgKGNvbG9yID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGxldCB2YWx1ZSA9IHRoaXMuX2NvbG9yMmlkW2NvbG9yXTtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdFx0dmFsdWUgPSArK3RoaXMuX2xhc3RDb2xvcklkO1xuXHRcdHRoaXMuX2NvbG9yMmlkW2NvbG9yXSA9IHZhbHVlO1xuXHRcdHRoaXMuX2lkMmNvbG9yW3ZhbHVlXSA9IGNvbG9yO1xuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQoY29sb3I6IHN0cmluZyB8IENvbG9yIHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0XHRjb2xvciA9IG5vcm1hbGl6ZUNvbG9yKGNvbG9yKTtcblx0XHRpZiAoY29sb3IgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fY29sb3IyaWRbY29sb3JdO1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRjb25zb2xlLmxvZyhgQ29sb3IgJHtjb2xvcn0gbm90IGluIGluZGV4LmApO1xuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHVibGljIGFzQXJyYXkoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLl9pZDJjb2xvci5zbGljZSgwKTtcblx0fVxufVxuXG5jbGFzcyBUb2tlbkZvbnRJbmRleCB7XG5cblx0cHJpdmF0ZSBfbGFzdEZvbnRJZDogbnVtYmVyO1xuXHRwcml2YXRlIF9pZDJmb250OiBJRm9udFRva2VuT3B0aW9uc1tdO1xuXHRwcml2YXRlIF9mb250MmlkOiBNYXA8SUZvbnRUb2tlbk9wdGlvbnMsIG51bWJlcj47XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fbGFzdEZvbnRJZCA9IDA7XG5cdFx0dGhpcy5faWQyZm9udCA9IFtdO1xuXHRcdHRoaXMuX2ZvbnQyaWQgPSBuZXcgTWFwKCk7XG5cdH1cblxuXHRwdWJsaWMgYWRkKGZvbnRGYW1pbHk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZm9udFNpemVNdWx0aXBsaWVyOiBudW1iZXIgfCB1bmRlZmluZWQsIGxpbmVIZWlnaHRNdWx0aXBsaWVyOiBudW1iZXIgfCB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRcdGNvbnN0IGZvbnQ6IElGb250VG9rZW5PcHRpb25zID0geyBmb250RmFtaWx5LCBmb250U2l6ZU11bHRpcGxpZXIsIGxpbmVIZWlnaHRNdWx0aXBsaWVyIH07XG5cdFx0bGV0IHZhbHVlID0gdGhpcy5fZm9udDJpZC5nZXQoZm9udCk7XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHRcdHZhbHVlID0gKyt0aGlzLl9sYXN0Rm9udElkO1xuXHRcdHRoaXMuX2ZvbnQyaWQuc2V0KGZvbnQsIHZhbHVlKTtcblx0XHR0aGlzLl9pZDJmb250W3ZhbHVlXSA9IGZvbnQ7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGdldChmb250OiBJRm9udFRva2VuT3B0aW9ucyk6IG51bWJlciB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9mb250MmlkLmdldChmb250KTtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwdWJsaWMgYXNBcnJheSgpOiBJRm9udFRva2VuT3B0aW9uc1tdIHtcblx0XHRyZXR1cm4gdGhpcy5faWQyZm9udC5zbGljZSgwKTtcblx0fVxufVxuXG5mdW5jdGlvbiBub3JtYWxpemVDb2xvcihjb2xvcjogc3RyaW5nIHwgQ29sb3IgfCB1bmRlZmluZWQgfCBudWxsKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFjb2xvcikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHR5cGVvZiBjb2xvciAhPT0gJ3N0cmluZycpIHtcblx0XHRjb2xvciA9IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4QShjb2xvciwgdHJ1ZSk7XG5cdH1cblx0Y29uc3QgbGVuID0gY29sb3IubGVuZ3RoO1xuXHRpZiAoY29sb3IuY2hhckNvZGVBdCgwKSAhPT0gQ2hhckNvZGUuSGFzaCB8fCAobGVuICE9PSA0ICYmIGxlbiAhPT0gNSAmJiBsZW4gIT09IDcgJiYgbGVuICE9PSA5KSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmVzdWx0ID0gW0NoYXJDb2RlLkhhc2hdO1xuXG5cdGZvciAobGV0IGkgPSAxOyBpIDwgbGVuOyBpKyspIHtcblx0XHRjb25zdCB1cHBlciA9IGhleFVwcGVyKGNvbG9yLmNoYXJDb2RlQXQoaSkpO1xuXHRcdGlmICghdXBwZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJlc3VsdC5wdXNoKHVwcGVyKTtcblx0XHRpZiAobGVuID09PSA0IHx8IGxlbiA9PT0gNSkge1xuXHRcdFx0cmVzdWx0LnB1c2godXBwZXIpO1xuXHRcdH1cblx0fVxuXG5cdGlmIChyZXN1bHQubGVuZ3RoID09PSA5ICYmIHJlc3VsdFs3XSA9PT0gQ2hhckNvZGUuRiAmJiByZXN1bHRbOF0gPT09IENoYXJDb2RlLkYpIHtcblx0XHRyZXN1bHQubGVuZ3RoID0gNztcblx0fVxuXHRyZXR1cm4gU3RyaW5nLmZyb21DaGFyQ29kZSguLi5yZXN1bHQpO1xufVxuXG5mdW5jdGlvbiBoZXhVcHBlcihjaGFyQ29kZTogQ2hhckNvZGUpOiBudW1iZXIge1xuXHRpZiAoY2hhckNvZGUgPj0gQ2hhckNvZGUuRGlnaXQwICYmIGNoYXJDb2RlIDw9IENoYXJDb2RlLkRpZ2l0OSB8fCBjaGFyQ29kZSA+PSBDaGFyQ29kZS5BICYmIGNoYXJDb2RlIDw9IENoYXJDb2RlLkYpIHtcblx0XHRyZXR1cm4gY2hhckNvZGU7XG5cdH0gZWxzZSBpZiAoY2hhckNvZGUgPj0gQ2hhckNvZGUuYSAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS5mKSB7XG5cdFx0cmV0dXJuIGNoYXJDb2RlIC0gQ2hhckNvZGUuYSArIENoYXJDb2RlLkE7XG5cdH1cblx0cmV0dXJuIDA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFVBQVU7QUFDdEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBa1MseUJBQXlCLHdCQUF3QixpQkFBaUIsNEJBQTRCO0FBQ3pZLFNBQVMsdUJBQXVCO0FBQ2hDLFlBQVksU0FBUztBQUNyQixZQUFZLFdBQVc7QUFDdkIsWUFBWSxlQUFlO0FBQzNCLFNBQVMsY0FBYyx5QkFBMEQsa0JBQWtCLGtCQUFrQixrQ0FBa0M7QUFDdkosU0FBeUMsNEJBQTRCO0FBQ3JFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsU0FBUyxrQkFBa0I7QUFDcEMsU0FBUyxZQUFZLG1CQUErQixnQ0FBaUUsNkJBQTZCO0FBQ2xKLFNBQXVDLHNCQUFzQjtBQUU3RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQStCLHFCQUFxQjtBQUU3RCxTQUFTLGFBQWEseUJBQXlCO0FBQy9DLFNBQVMsU0FBUyxXQUFXLHNCQUFzQjtBQUNuRCxTQUFTLDJCQUEyQjtBQUVwQyxNQUFNLGdCQUFnQixTQUFTLEdBQW1CLHdCQUF3QixpQkFBaUI7QUFFM0YsTUFBTSw4QkFBOEIsK0JBQStCO0FBRW5FLE1BQU0sd0JBQXdCO0FBQUEsRUFDN0IsVUFBVSxDQUFDLFdBQVcsZ0NBQWdDO0FBQUEsRUFDdEQsU0FBUyxDQUFDLFVBQVUsd0JBQXdCO0FBQUEsRUFDNUMsVUFBVSxDQUFDLDhCQUE4QixtQkFBbUIsV0FBVyxjQUFjO0FBQUEsRUFDckYsU0FBUyxDQUFDLGtCQUFrQjtBQUFBLEVBQzVCLE9BQU8sQ0FBQyxvQkFBb0IscUJBQXFCLGdCQUFnQixlQUFlO0FBQUEsRUFDaEYsV0FBVyxDQUFDLHdCQUF3QixrQkFBa0I7QUFBQSxFQUN0RCxXQUFXLENBQUMsWUFBWSxzQkFBc0I7QUFDL0M7QUFZTyxNQUFNLGtCQUFOLE1BQU0sZ0JBQStDO0FBQUE7QUFBQSxFQWdDbkQsWUFBWSxJQUFZLE9BQWUsWUFBb0I7QUFmbkUsU0FBUSxtQkFBMkMsQ0FBQztBQUNwRCxTQUFRLG9CQUE0QyxDQUFDO0FBQ3JELFNBQVEsV0FBc0IsQ0FBQztBQUMvQixTQUFRLGlCQUFxQyxDQUFDO0FBRTlDLFNBQVEscUJBQTBDLENBQUM7QUFDbkQsU0FBUSwyQkFBZ0QsQ0FBQztBQUt6RCxTQUFRLHVCQUEyRDtBQUNuRTtBQUFBLFNBQVEsa0JBQStDO0FBQ3ZEO0FBQUEsU0FBUSxpQkFBNkM7QUFHcEQsU0FBSyxLQUFLO0FBQ1YsU0FBSyxRQUFRO0FBQ2IsU0FBSyxhQUFhO0FBQ2xCLFNBQUssV0FBVztBQUFBLEVBQ2pCO0FBQUEsRUFFQSxJQUFJLHVCQUFnQztBQUNuQyxRQUFJLEtBQUssK0JBQStCLFFBQVc7QUFDbEQsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFFBQUksS0FBSyx5Q0FBeUMsUUFBVztBQUM1RCxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsV0FBTyxDQUFDLENBQUMsS0FBSztBQUFBLEVBQ2Y7QUFBQSxFQUVBLElBQUksY0FBc0M7QUFDekMsUUFBSSxDQUFDLEtBQUssc0JBQXNCO0FBZS9CLFVBQVNBLFdBQVQsU0FBaUIsTUFBNEI7QUFDNUMsWUFBSSxLQUFLLFNBQVMsS0FBSyxVQUFVO0FBQ2hDLGNBQUksS0FBSyxVQUFVLG9CQUFvQjtBQUN0QywrQkFBbUI7QUFBQSxVQUNwQjtBQUNBLGdCQUFNLGVBQWUsS0FBSztBQUMxQixpQkFBTyxLQUFLO0FBQUEsWUFDWCxPQUFPLEtBQUs7QUFBQSxZQUFPLFVBQVU7QUFBQSxjQUM1QixZQUFZLGVBQWUsYUFBYSxVQUFVO0FBQUEsY0FDbEQsWUFBWSxlQUFlLGFBQWEsVUFBVTtBQUFBLGNBQ2xELFdBQVcsYUFBYTtBQUFBLGNBQ3hCLFVBQVUsYUFBYTtBQUFBLGNBQ3ZCLFlBQVksYUFBYTtBQUFBLGNBQ3pCLFlBQVksYUFBYTtBQUFBLFlBQzFCO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUFBLE1BQ0Q7QUFqQlMsb0JBQUFBO0FBZFQsWUFBTSxTQUFpQyxDQUFDO0FBR3hDLFlBQU0sYUFBYSxLQUFLLFNBQVMsZ0JBQWdCLEtBQUssS0FBSyxXQUFXLGdCQUFnQjtBQUN0RixZQUFNLGFBQWEsS0FBSyxTQUFTLGdCQUFnQixLQUFLLEtBQUssV0FBVyxnQkFBZ0I7QUFDdEYsYUFBTyxLQUFLO0FBQUEsUUFDWCxVQUFVO0FBQUEsVUFDVCxZQUFZLGVBQWUsVUFBVTtBQUFBLFVBQ3JDLFlBQVksZUFBZSxVQUFVO0FBQUEsUUFDdEM7QUFBQSxNQUNELENBQUM7QUFFRCxVQUFJLG1CQUFtQjtBQXFCdkIsV0FBSyxpQkFBaUIsUUFBUUEsUUFBTztBQUdyQyxXQUFLLGtCQUFrQixRQUFRQSxRQUFPO0FBRXRDLFVBQUksQ0FBQyxrQkFBa0I7QUFDdEIsMkJBQW1CLEtBQUssSUFBSSxFQUFFLFFBQVFBLFFBQU87QUFBQSxNQUM5QztBQUNBLFdBQUssdUJBQXVCO0FBQUEsSUFDN0I7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxTQUFTLFNBQTBCLFlBQXlDO0FBQ2xGLFVBQU0sY0FBYyxLQUFLLGVBQWUsT0FBTztBQUMvQyxRQUFJLHVCQUF1QixPQUFPO0FBQ2pDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxnQkFBZ0IsUUFBVztBQUM5QixZQUFNLFFBQVEsS0FBSyxTQUFTLE9BQU87QUFDbkMsVUFBSSxVQUFVLFFBQVc7QUFDeEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsUUFBSSxlQUFlLE9BQU87QUFDekIsYUFBTyxLQUFLLFdBQVcsT0FBTztBQUFBLElBQy9CO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGNBQWMsTUFBYyxXQUFxQixVQUFrQixhQUFhLE1BQU0sY0FBcUMsQ0FBQyxHQUEyQjtBQUM5SixVQUFNLFNBQWM7QUFBQSxNQUNuQixZQUFZO0FBQUEsTUFDWixNQUFNO0FBQUEsTUFDTixXQUFXO0FBQUEsTUFDWCxlQUFlO0FBQUEsTUFDZixRQUFRO0FBQUEsSUFDVDtBQUNBLFVBQU0sUUFBUTtBQUFBLE1BQ2IsWUFBWTtBQUFBLE1BQ1osTUFBTTtBQUFBLE1BQ04sV0FBVztBQUFBLE1BQ1gsZUFBZTtBQUFBLE1BQ2YsUUFBUTtBQUFBLE1BQ1IsWUFBWTtBQUFBLE1BQ1osVUFBVTtBQUFBLE1BQ1YsWUFBWTtBQUFBLElBQ2I7QUFFQSxhQUFTLGNBQWMsWUFBb0IsT0FBbUIsWUFBa0M7QUFDL0YsVUFBSSxNQUFNLGNBQWMsTUFBTSxjQUFjLFlBQVk7QUFDdkQsY0FBTSxhQUFhO0FBQ25CLGVBQU8sYUFBYSxNQUFNO0FBQzFCLG9CQUFZLGFBQWE7QUFBQSxNQUMxQjtBQUNBLGlCQUFXLEtBQUssQ0FBQyxRQUFRLGFBQWEsaUJBQWlCLFFBQVEsR0FBRztBQUNqRSxjQUFNLFdBQVc7QUFDakIsY0FBTSxPQUFPLE1BQU0sUUFBUTtBQUMzQixZQUFJLFNBQVMsUUFBVztBQUN2QixjQUFJLE1BQU0sUUFBUSxLQUFLLFlBQVk7QUFDbEMsa0JBQU0sUUFBUSxJQUFJO0FBQ2xCLG1CQUFPLFFBQVEsSUFBSTtBQUNuQix3QkFBWSxRQUFRLElBQUk7QUFBQSxVQUN6QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLGFBQVMsMEJBQTBCLE1BQXlCO0FBQzNELFlBQU0sYUFBYSxLQUFLLFNBQVMsTUFBTSxNQUFNLFdBQVcsUUFBUTtBQUNoRSxVQUFJLGNBQWMsR0FBRztBQUNwQixzQkFBYyxZQUFZLEtBQUssT0FBTyxJQUFJO0FBQUEsTUFDM0M7QUFBQSxJQUNEO0FBRUEsU0FBSyxtQkFBbUIsUUFBUSx5QkFBeUI7QUFDekQsU0FBSyx5QkFBeUIsUUFBUSx5QkFBeUI7QUFFL0QsUUFBSSw0QkFBNEI7QUFDaEMsZUFBVyxLQUFLLE9BQU87QUFDdEIsWUFBTSxNQUFNO0FBQ1osVUFBSSxNQUFNLEdBQUcsTUFBTSxJQUFJO0FBQ3RCLG9DQUE0QjtBQUFBLE1BQzdCLE9BQU87QUFDTixjQUFNLEdBQUcsSUFBSSxPQUFPO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBQ0EsUUFBSSwyQkFBMkI7QUFDOUIsaUJBQVcsUUFBUSw0QkFBNEIsNEJBQTRCLEdBQUc7QUFDN0UsY0FBTSxhQUFhLEtBQUssU0FBUyxNQUFNLE1BQU0sV0FBVyxRQUFRO0FBQ2hFLFlBQUksY0FBYyxHQUFHO0FBQ3BCLGNBQUk7QUFDSixjQUFJLEtBQUssU0FBUyxlQUFlO0FBQ2hDLG9CQUFRLEtBQUssY0FBYyxLQUFLLFNBQVMsYUFBYTtBQUN0RCxnQkFBSSxPQUFPO0FBQ1YsNEJBQWMsWUFBWSxPQUFPLEtBQUssU0FBUyxhQUFhO0FBQUEsWUFDN0Q7QUFBQSxVQUNEO0FBQ0EsY0FBSSxDQUFDLFNBQVMsZUFBZSxPQUFPO0FBQ25DLGtCQUFNLGtCQUFrQixLQUFLLFNBQVMsS0FBSyxJQUFJO0FBQy9DLG9CQUFRLEtBQUssdUJBQXVCLGVBQWU7QUFDbkQsZ0JBQUksT0FBTztBQUNWLDRCQUFjLFlBQVksT0FBTyxlQUFnQjtBQUFBLFlBQ2xEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU8sV0FBVyxTQUFTLE1BQU07QUFBQSxFQUVsQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sdUJBQXVCLGlCQUFzRTtBQUNuRyxRQUFJLG9CQUFvQixRQUFXO0FBQ2xDLGFBQU87QUFBQSxJQUNSLFdBQVcsT0FBTyxvQkFBb0IsVUFBVTtBQUMvQyxZQUFNLEVBQUUsTUFBTSxXQUFXLFNBQVMsSUFBSSxzQkFBc0IsaUJBQWlCLEVBQUU7QUFDL0UsYUFBTyxLQUFLLGNBQWMsTUFBTSxXQUFXLFFBQVE7QUFBQSxJQUNwRCxXQUFXLE9BQU8sb0JBQW9CLFVBQVU7QUFDL0MsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8scUJBQXNDO0FBRTVDLFFBQUksQ0FBQyxLQUFLLGlCQUFpQjtBQUMxQixZQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsV0FBSyxZQUFZLFFBQVEsVUFBUTtBQUNoQyxjQUFNLElBQUksS0FBSyxTQUFTLFVBQVU7QUFDbEMsY0FBTSxJQUFJLEtBQUssU0FBUyxVQUFVO0FBQUEsTUFDbkMsQ0FBQztBQUVELFdBQUssbUJBQW1CLFFBQVEsT0FBSyxNQUFNLElBQUksRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUNsRSxrQ0FBNEIsNEJBQTRCLEVBQUUsUUFBUSxPQUFLO0FBQ3RFLGNBQU0sZUFBZSxFQUFFLFNBQVMsS0FBSyxJQUFJO0FBQ3pDLFlBQUksZ0JBQWdCLE9BQU8saUJBQWlCLFVBQVU7QUFDckQsZ0JBQU0sSUFBSSxhQUFhLFVBQVU7QUFBQSxRQUNsQztBQUFBLE1BQ0QsQ0FBQztBQUNELFdBQUsseUJBQXlCLFFBQVEsT0FBSyxNQUFNLElBQUksRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUV4RSxXQUFLLGtCQUFrQjtBQUFBLElBQ3hCO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBR08sb0JBQW9DO0FBQzFDLFFBQUksQ0FBQyxLQUFLLGdCQUFnQjtBQUN6QixZQUFNLFFBQVEsSUFBSSxlQUFlO0FBQ2pDLFdBQUssWUFBWSxRQUFRLE9BQUssTUFBTSxJQUFJLEVBQUUsU0FBUyxZQUFZLEVBQUUsU0FBUyxVQUFVLEVBQUUsU0FBUyxVQUFVLENBQUM7QUFDMUcsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QjtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQVcsZ0JBQTBCO0FBQ3BDLFdBQU8sS0FBSyxtQkFBbUIsRUFBRSxRQUFRO0FBQUEsRUFDMUM7QUFBQSxFQUVBLElBQVcsZUFBb0M7QUFDOUMsV0FBTyxLQUFLLGtCQUFrQixFQUFFLFFBQVE7QUFBQSxFQUN6QztBQUFBLEVBRU8sc0JBQXNCLGtCQUEwQixXQUFxQixpQkFBeUIsYUFBYSxNQUFNLGNBQXFDLENBQUMsR0FBNEI7QUFDekwsVUFBTSxFQUFFLE1BQU0sU0FBUyxJQUFJLHNCQUFzQixrQkFBa0IsZUFBZTtBQUNsRixVQUFNLFFBQVEsS0FBSyxjQUFjLE1BQU0sV0FBVyxVQUFVLFlBQVksV0FBVztBQUNuRixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLE1BQ04sWUFBWSxLQUFLLG1CQUFtQixFQUFFLElBQUksTUFBTSxVQUFVO0FBQUEsTUFDMUQsTUFBTSxNQUFNO0FBQUEsTUFDWixXQUFXLE1BQU07QUFBQSxNQUNqQixlQUFlLE1BQU07QUFBQSxNQUNyQixRQUFRLE1BQU07QUFBQSxJQUNmO0FBQUEsRUFDRDtBQUFBLEVBRU8seUJBQXlCLE1BQTBEO0FBQ3pGLFFBQUksS0FBSyx5QkFBeUIsUUFBUSxJQUFJLE1BQU0sSUFBSTtBQUN2RCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxtQkFBbUIsUUFBUSxJQUFJLE1BQU0sSUFBSTtBQUNqRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxXQUFXLFNBQTZDO0FBQzlELFdBQU8sY0FBYyxvQkFBb0IsU0FBUyxJQUFJO0FBQUEsRUFDdkQ7QUFBQSxFQUdPLGNBQWMsUUFBc0IsYUFBc0U7QUFFaEgsUUFBSSxDQUFDLEtBQUsseUJBQXlCO0FBQ2xDLFdBQUssMEJBQTBCLEtBQUssaUJBQWlCLElBQUksZUFBZTtBQUFBLElBQ3pFO0FBQ0EsUUFBSSxDQUFDLEtBQUssMEJBQTBCO0FBQ25DLFdBQUssMkJBQTJCLEtBQUssa0JBQWtCLElBQUksZUFBZTtBQUFBLElBQzNFO0FBRUEsZUFBVyxTQUFTLFFBQVE7QUFRM0IsVUFBU0Msa0NBQVQsU0FBd0MsZUFBc0MsY0FBc0M7QUFDbkgsaUJBQVMsSUFBSSxHQUFHLElBQUksY0FBYyxRQUFRLEtBQUs7QUFDOUMsZ0JBQU0sUUFBUSxjQUFjLENBQUMsRUFBRSxLQUFLO0FBQ3BDLGNBQUksU0FBUyxHQUFHO0FBQ2Ysa0JBQU0sY0FBYyxhQUFhLENBQUM7QUFDbEMsa0JBQU0sV0FBVyxhQUFhLENBQUMsRUFBRTtBQUNqQyxnQkFBSSxTQUFTLG1CQUFtQixTQUFTLFlBQVk7QUFDcEQsMkJBQWEsU0FBUztBQUN0QixnQ0FBa0I7QUFDbEIsc0NBQXdCO0FBQUEsWUFDekI7QUFDQSxnQkFBSSxTQUFTLGtCQUFrQixNQUFNLFNBQVMsU0FBUyxTQUFTLEdBQUc7QUFDbEUsMEJBQVksU0FBUztBQUNyQiwrQkFBaUI7QUFDakIscUNBQXVCO0FBQUEsWUFDeEI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFsQlMsMkNBQUFBO0FBUFQsVUFBSSxhQUFpQztBQUNyQyxVQUFJLFlBQWdDO0FBQ3BDLFVBQUksa0JBQWtCO0FBQ3RCLFVBQUksaUJBQWlCO0FBQ3JCLFVBQUksdUJBQXlEO0FBQzdELFVBQUksd0JBQTBEO0FBcUI5RCxNQUFBQSxnQ0FBK0IsS0FBSyx5QkFBeUIsS0FBSyxnQkFBZ0I7QUFDbEYsTUFBQUEsZ0NBQStCLEtBQUssMEJBQTBCLEtBQUssaUJBQWlCO0FBQ3BGLFVBQUksZUFBZSxVQUFhLGNBQWMsUUFBVztBQUN4RCxZQUFJLGFBQWE7QUFDaEIsc0JBQVksYUFBYTtBQUN6QixzQkFBWSxPQUFPLFlBQVksU0FBUyxZQUFZLFlBQVksWUFBWSxnQkFBZ0I7QUFDNUYsc0JBQVksUUFBUTtBQUFBLFFBQ3JCO0FBRUEsZUFBTyxXQUFXLGFBQWEsWUFBWSxTQUFTO0FBQUEsTUFDckQ7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLFFBQVEsU0FBbUM7QUFDakQsVUFBTSxjQUFjLEtBQUssZUFBZSxPQUFPO0FBQy9DLFFBQUksdUJBQXVCLE9BQU87QUFDakMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLGdCQUFnQixVQUFrRCxLQUFLLFNBQVMsZUFBZSxPQUFPO0FBQUEsRUFDOUc7QUFBQSxFQUVPLHNCQUFzQixTQUE2QztBQUN6RSxVQUFNLGNBQWMsS0FBSyxlQUFlLE9BQU87QUFDL0MsV0FBTyx1QkFBdUIsUUFBUSxjQUFjO0FBQUEsRUFDckQ7QUFBQSxFQUVPLGtCQUFrQixVQUE4QjtBQUN0RCxTQUFLLGdCQUFnQixTQUFTLG1CQUFtQjtBQUNqRCxTQUFLLHFCQUFxQixTQUFTLHdCQUF3QjtBQUMzRCxTQUFLLDZCQUE2QixTQUFTLGdDQUFnQztBQUFBLEVBQzVFO0FBQUEsRUFFTyxnQkFBZ0IsUUFBOEI7QUFDcEQsU0FBSyxpQkFBaUIsQ0FBQztBQUN2QixTQUFLLHNCQUFzQixNQUFNO0FBRWpDLFVBQU0sc0JBQXNCLEtBQUssdUJBQXVCLE1BQU07QUFDOUQsUUFBSSxNQUFNLFNBQVMsbUJBQW1CLEdBQUc7QUFDeEMsV0FBSyxzQkFBc0IsbUJBQW1CO0FBQUEsSUFDL0M7QUFFQSxTQUFLLGtCQUFrQjtBQUN2QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLHVCQUF1QjtBQUM1QixTQUFLLDJCQUEyQjtBQUFBLEVBQ2pDO0FBQUEsRUFFUSxzQkFBc0IsUUFBOEI7QUFDM0QsZUFBVyxNQUFNLFFBQVE7QUFDeEIsWUFBTSxXQUFXLE9BQU8sRUFBRTtBQUMxQixVQUFJLGFBQWEsNEJBQTRCO0FBQzVDLGFBQUssZUFBZSxFQUFFLElBQUk7QUFBQSxNQUMzQixXQUFXLE9BQU8sYUFBYSxVQUFVO0FBQ3hDLGFBQUssZUFBZSxFQUFFLElBQUksTUFBTSxRQUFRLFFBQVE7QUFBQSxNQUNqRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxxQkFBcUIsbUJBQThDO0FBQ3pFLFNBQUssb0JBQW9CLENBQUM7QUFDMUIsU0FBSyx1Q0FBdUM7QUFHNUMsU0FBSyxxQkFBcUIsaUJBQWlCO0FBRzNDLFVBQU0sMkJBQTJCLEtBQUssdUJBQXVCLGlCQUFpQjtBQUM5RSxRQUFJLE1BQU0sU0FBUyx3QkFBd0IsR0FBRztBQUM3QyxXQUFLLHFCQUFxQix3QkFBd0I7QUFBQSxJQUNuRDtBQUVBLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssdUJBQXVCO0FBQzVCLFNBQUssMkJBQTJCO0FBQUEsRUFDakM7QUFBQSxFQUVPLDZCQUE2QixxQkFBb0U7QUFDdkcsU0FBSywyQkFBMkIsQ0FBQztBQUNqQyxTQUFLLDZCQUE2QjtBQUVsQyxRQUFJLHFCQUFxQjtBQUN4QixXQUFLLDZCQUE2QixvQkFBb0I7QUFDdEQsVUFBSSxvQkFBb0IsT0FBTztBQUM5QixhQUFLLHVCQUF1QixvQkFBb0IsS0FBSztBQUFBLE1BQ3REO0FBQ0EsWUFBTSxzQkFBc0IsS0FBSyx1QkFBdUIsbUJBQW1CO0FBQzNFLFVBQUksTUFBTSxTQUFTLG1CQUFtQixHQUFHO0FBQ3hDLFlBQUksb0JBQW9CLFlBQVksUUFBVztBQUM5QyxlQUFLLDZCQUE2QixvQkFBb0I7QUFBQSxRQUN2RDtBQUNBLFlBQUksb0JBQW9CLE9BQU87QUFDOUIsZUFBSyx1QkFBdUIsb0JBQW9CLEtBQUs7QUFBQSxRQUN0RDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUFBLEVBRU8sYUFBYSxLQUFzQjtBQUN6QyxXQUFPLElBQUksT0FBTyxDQUFDLE1BQU0sMEJBQTBCLElBQUksT0FBTyxJQUFJLFNBQVMsQ0FBQyxNQUFNO0FBQUEsRUFDbkY7QUFBQSxFQUVPLGtCQUFrQixTQUEwQjtBQUNsRCxVQUFNLG1CQUFtQixRQUFRLE9BQU8sQ0FBQztBQUN6QyxVQUFNLGtCQUFrQixRQUFRLE9BQU8sUUFBUSxTQUFTLENBQUM7QUFDekQsVUFBTSxnQkFBZ0IsUUFBUSxNQUFNLEdBQUcsRUFBRTtBQUN6QyxVQUFNLGVBQWUsUUFBUSxNQUFNLEdBQUcsRUFBRTtBQUN4QyxVQUFNLGdCQUFnQixRQUFRLE1BQU0sQ0FBQztBQUNyQyxXQUFPLFlBQVksS0FBSyxjQUNuQixLQUFLLFdBQVcsU0FBUyxZQUFZLEtBQUsscUJBQXFCLHdCQUF3QixvQkFBb0Isd0JBQzNHLEtBQUssV0FBVyxXQUFXLGFBQWEsS0FBSyxvQkFBb0Isd0JBQ2pFLEtBQUssV0FBVyxTQUFTLGFBQWEsS0FBSyxxQkFBcUI7QUFBQSxFQUN0RTtBQUFBLEVBRU8sdUJBQXVCLFFBQThFO0FBQzNHLFFBQUk7QUFDSixlQUFXLE9BQU8sUUFBUTtBQUN6QixZQUFNLGVBQWUsT0FBTyxHQUFHO0FBQy9CLFVBQUksS0FBSyxhQUFhLEdBQUcsS0FBSyx3QkFBd0IsVUFBVSxDQUFDLE1BQU0sUUFBUSxZQUFZLEdBQUc7QUFDN0YsY0FBTSxpQkFBaUIsSUFBSSxNQUFNLGVBQWUsS0FBSyxDQUFDO0FBQ3RELG1CQUFXLGNBQWMsZ0JBQWdCO0FBQ3hDLGdCQUFNLFVBQVUsV0FBVyxVQUFVLEdBQUcsV0FBVyxTQUFTLENBQUM7QUFDN0QsY0FBSSxLQUFLLGtCQUFrQixPQUFPLEdBQUc7QUFDcEMsZ0JBQUksQ0FBQyxxQkFBcUI7QUFDekIsb0NBQXNCLENBQUM7QUFBQSxZQUN4QjtBQUNBLGtCQUFNLDRCQUE0QjtBQUNsQyx1QkFBVyxVQUFVLDJCQUEyQjtBQUMvQyxvQkFBTSxpQkFBaUIsb0JBQW9CLE1BQU07QUFDakQsb0JBQU0saUJBQWlCLDBCQUEwQixNQUFNO0FBQ3ZELGtCQUFJLE1BQU0sUUFBUSxjQUFjLEtBQUssTUFBTSxRQUFRLGNBQWMsR0FBRztBQUNuRSxvQ0FBb0IsTUFBTSxJQUFJLGVBQWUsT0FBTyxjQUFjO0FBQUEsY0FDbkUsV0FBVyxnQkFBZ0I7QUFDMUIsb0NBQW9CLE1BQU0sSUFBSTtBQUFBLGNBQy9CO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsdUJBQXVCLHlCQUE4QztBQUM1RSxlQUFXLE9BQU8seUJBQXlCO0FBQzFDLFVBQUksQ0FBQyxLQUFLLGFBQWEsR0FBRyxHQUFHO0FBQzVCLFlBQUk7QUFDSCxnQkFBTSxPQUFPLHNCQUFzQixLQUFLLHdCQUF3QixHQUFHLENBQUM7QUFDcEUsY0FBSSxNQUFNO0FBQ1QsaUJBQUsseUJBQXlCLEtBQUssSUFBSTtBQUFBLFVBQ3hDO0FBQUEsUUFDRCxTQUFTLEdBQUc7QUFBQSxRQUVaO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxxQkFBcUIsbUJBQThDO0FBRzFFLGVBQVcsY0FBYyx1QkFBdUI7QUFDL0MsWUFBTSxRQUE0QztBQUNsRCxZQUFNLFFBQVEsa0JBQWtCLEtBQUs7QUFDckMsVUFBSSxPQUFPO0FBQ1YsY0FBTSxXQUFXLE9BQU8sVUFBVSxXQUFXLEVBQUUsWUFBWSxNQUFNLElBQUk7QUFDckUsY0FBTSxTQUFTLHNCQUFzQixLQUFLO0FBQzFDLG1CQUFXLFNBQVMsUUFBUTtBQUMzQixlQUFLLGtCQUFrQixLQUFLLEVBQUUsT0FBTyxTQUFTLENBQUM7QUFBQSxRQUNoRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsUUFBSSxNQUFNLFFBQVEsa0JBQWtCLGFBQWEsR0FBRztBQUNuRCxpQkFBVyxRQUFRLGtCQUFrQixlQUFlO0FBQ25ELFlBQUksS0FBSyxTQUFTLEtBQUssVUFBVTtBQUNoQyxlQUFLLGtCQUFrQixLQUFLLElBQUk7QUFBQSxRQUNqQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsUUFBSSxrQkFBa0IseUJBQXlCLFFBQVc7QUFDekQsV0FBSyx1Q0FBdUMsa0JBQWtCO0FBQUEsSUFDL0Q7QUFBQSxFQUNEO0FBQUEsRUFFTyxhQUFhLGdDQUFnRjtBQUNuRyxXQUFPLENBQUMsS0FBSyxXQUFXLEtBQUssS0FBSyw4QkFBOEIsSUFBSSxRQUFRLFFBQVEsTUFBUztBQUFBLEVBQzlGO0FBQUEsRUFFTyxPQUFPLGdDQUFnRjtBQUM3RixXQUFPLEtBQUssS0FBSyw4QkFBOEI7QUFBQSxFQUNoRDtBQUFBLEVBRVEsS0FBSyxnQ0FBZ0Y7QUFDNUYsUUFBSSxDQUFDLEtBQUssVUFBVTtBQUNuQixhQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsSUFDakM7QUFDQSxTQUFLLG1CQUFtQixDQUFDO0FBQ3pCLFNBQUssWUFBWTtBQUVqQixVQUFNLFNBQVM7QUFBQSxNQUNkLFFBQVEsQ0FBQztBQUFBLE1BQ1QsZUFBZSxDQUFDO0FBQUEsTUFDaEIsb0JBQW9CLENBQUM7QUFBQSxNQUNyQixzQkFBc0I7QUFBQSxJQUN2QjtBQUNBLFdBQU8sZ0JBQWdCLGdDQUFnQyxLQUFLLFVBQVUsTUFBTSxFQUFFLEtBQUssT0FBSztBQUN2RixXQUFLLFdBQVc7QUFDaEIsV0FBSyxxQkFBcUIsT0FBTztBQUNqQyxXQUFLLFdBQVcsT0FBTztBQUN2QixXQUFLLG1CQUFtQixPQUFPO0FBQy9CLFdBQUssNEJBQTRCLE9BQU87QUFBQSxJQUN6QyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRU8sY0FBYztBQUNwQixTQUFLLGtCQUFrQjtBQUN2QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLHVCQUF1QjtBQUM1QixTQUFLLDBCQUEwQjtBQUMvQixTQUFLLDJCQUEyQjtBQUFBLEVBQ2pDO0FBQUEsRUFFQSxVQUFVLGdCQUFpQztBQUMxQyxVQUFNLGVBQTBDLENBQUM7QUFDakQsZUFBVyxPQUFPLEtBQUssVUFBVTtBQUNoQyxtQkFBYSxHQUFHLElBQUksTUFBTSxPQUFPLElBQUksV0FBVyxLQUFLLFNBQVMsR0FBRyxHQUFHLElBQUk7QUFBQSxJQUN6RTtBQUVBLFVBQU0sUUFBUSxLQUFLLFVBQVU7QUFBQSxNQUM1QixJQUFJLEtBQUs7QUFBQSxNQUNULE9BQU8sS0FBSztBQUFBLE1BQ1osWUFBWSxLQUFLO0FBQUEsTUFDakIsa0JBQWtCLEtBQUssaUJBQWlCLElBQUksU0FBTyxFQUFFLFVBQVUsR0FBRyxVQUFVLE9BQU8sR0FBRyxNQUFNLEVBQUU7QUFBQTtBQUFBLE1BQzlGLG9CQUFvQixLQUFLLG1CQUFtQixJQUFJLGtCQUFrQixZQUFZO0FBQUEsTUFDOUUsZUFBZSxjQUFjLGFBQWEsS0FBSyxhQUFhO0FBQUEsTUFDNUQsMkJBQTJCLEtBQUs7QUFBQSxNQUNoQyxVQUFVO0FBQUEsTUFDVixPQUFPLEtBQUs7QUFBQSxJQUNiLENBQUM7QUFHRCxtQkFBZSxNQUFNLGdCQUFlLGFBQWEsT0FBTyxhQUFhLFNBQVMsY0FBYyxJQUFJO0FBQUEsRUFDakc7QUFBQSxFQUVBLElBQUksb0JBQXVDO0FBQzFDLFdBQU8sS0FBSyxXQUFXLENBQUM7QUFBQSxFQUN6QjtBQUFBLEVBRUEsSUFBSSxhQUF1QjtBQUMxQixXQUFPLEtBQUssR0FBRyxNQUFNLEdBQUc7QUFBQSxFQUN6QjtBQUFBLEVBRUEsSUFBSSxPQUFvQjtBQUN2QixZQUFRLEtBQUssbUJBQW1CO0FBQUEsTUFDL0IsS0FBSyxrQkFBa0I7QUFBSSxlQUFPLFlBQVk7QUFBQSxNQUM5QyxLQUFLLGtCQUFrQjtBQUFVLGVBQU8sWUFBWTtBQUFBLE1BQ3BELEtBQUssa0JBQWtCO0FBQVUsZUFBTyxZQUFZO0FBQUEsTUFDcEQ7QUFBUyxlQUFPLFlBQVk7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBSUEsT0FBTyxnQ0FBZ0MsV0FBd0IsVUFBcUQ7QUFDbkgsV0FBTyxnQkFBZSxvQkFBb0IscUJBQXFCLFNBQVMsR0FBRyxRQUFRO0FBQUEsRUFDcEY7QUFBQSxFQUVBLE9BQU8sb0JBQW9CLElBQVksVUFBcUQ7QUFDM0YsVUFBTSxZQUFZLElBQUksZ0JBQWUsSUFBSSxJQUFJLE9BQU8sRUFBRTtBQUN0RCxjQUFVLFdBQVc7QUFDckIsY0FBVSxtQkFBbUIsQ0FBQztBQUM5QixjQUFVLFFBQVE7QUFDbEIsUUFBSSxVQUFVO0FBQ2IsaUJBQVdDLE9BQU0sVUFBVTtBQUMxQixrQkFBVSxTQUFTQSxHQUFFLElBQUksTUFBTSxRQUFRLFNBQVNBLEdBQUUsQ0FBQztBQUFBLE1BQ3BEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFPLHVCQUF1QixJQUFZLFlBQW9DO0FBQzdFLFVBQU0sWUFBWSxJQUFJLGdCQUFlLElBQUksSUFBSSxVQUFVO0FBQ3ZELGNBQVUsV0FBVztBQUNyQixjQUFVLG1CQUFtQixDQUFDO0FBQzlCLGNBQVUsUUFBUTtBQUNsQixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBTyxnQkFBZ0IsZ0JBQTZEO0FBQ25GLFVBQU0sUUFBUSxlQUFlLElBQUksZ0JBQWUsYUFBYSxhQUFhLE9BQU87QUFDakYsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUk7QUFDSCxZQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUs7QUFDN0IsWUFBTSxRQUFRLElBQUksZ0JBQWUsSUFBSSxJQUFJLEVBQUU7QUFDM0MsaUJBQVcsT0FBTyxNQUFNO0FBQ3ZCLGdCQUFRLEtBQUs7QUFBQSxVQUNaLEtBQUssWUFBWTtBQUNoQixrQkFBTSxlQUFlLEtBQUssR0FBRztBQUM3Qix1QkFBVyxNQUFNLGNBQWM7QUFDOUIsb0JBQU0sU0FBUyxFQUFFLElBQUksTUFBTSxRQUFRLGFBQWEsRUFBRSxDQUFDO0FBQUEsWUFDcEQ7QUFDQTtBQUFBLFVBQ0Q7QUFBQSxVQUNBLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUFNLEtBQUs7QUFBQSxVQUFTLEtBQUs7QUFBQSxVQUFjLEtBQUs7QUFBQSxVQUFTLEtBQUs7QUFFOUQsWUFBQyxNQUFjLEdBQUcsSUFBSSxLQUFLLEdBQUc7QUFDOUI7QUFBQSxVQUNELEtBQUssc0JBQXNCO0FBQzFCLGtCQUFNLFlBQVksS0FBSyxHQUFHO0FBQzFCLGdCQUFJLE1BQU0sUUFBUSxTQUFTLEdBQUc7QUFDN0IseUJBQVcsS0FBSyxXQUFXO0FBQzFCLHNCQUFNLE9BQU8sa0JBQWtCLGVBQWUsNkJBQTZCLENBQUM7QUFDNUUsb0JBQUksTUFBTTtBQUNULHdCQUFNLG1CQUFtQixLQUFLLElBQUk7QUFBQSxnQkFDbkM7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUNBO0FBQUEsVUFDRDtBQUFBLFVBQ0EsS0FBSztBQUVKO0FBQUEsVUFDRCxLQUFLO0FBQ0osa0JBQU0sZ0JBQWdCLGNBQWMsZUFBZSxLQUFLLGFBQWE7QUFDckU7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUNBLFVBQUksQ0FBQyxNQUFNLE1BQU0sQ0FBQyxNQUFNLFlBQVk7QUFDbkMsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsSUFDUixTQUFTLEdBQUc7QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQU8sbUJBQW1CLE9BQTZCLG9CQUF5QixlQUE4QztBQUM3SCxVQUFNLFlBQW9CLE1BQU0sU0FBUyxLQUFLO0FBQzlDLFVBQU0sZ0JBQWdCLGNBQWMsY0FBYyxhQUFhLE1BQU0sSUFBSTtBQUN6RSxVQUFNLEtBQUssR0FBRyxTQUFTLElBQUksYUFBYTtBQUN4QyxVQUFNLFFBQVEsTUFBTSxTQUFTLFNBQVMsTUFBTSxJQUFJO0FBQ2hELFVBQU0sYUFBYSxNQUFNLE1BQU07QUFDL0IsVUFBTSxZQUFZLElBQUksZ0JBQWUsSUFBSSxPQUFPLFVBQVU7QUFDMUQsY0FBVSxjQUFjLE1BQU07QUFDOUIsY0FBVSxRQUFRLE1BQU0sV0FBVztBQUNuQyxjQUFVLFdBQVc7QUFDckIsY0FBVSxnQkFBZ0I7QUFDMUIsY0FBVSxXQUFXO0FBQ3JCLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF2cUJhLGdCQUVJLGNBQWM7QUFGeEIsSUFBTSxpQkFBTjtBQXlxQlAsU0FBUyxjQUFjLGFBQXFCLE1BQWM7QUFDekQsTUFBSSxLQUFLLFdBQVcsSUFBSSxHQUFHO0FBQzFCLFdBQU8sS0FBSyxPQUFPLENBQUM7QUFBQSxFQUNyQjtBQUNBLE1BQUksTUFBTSxHQUFHLFdBQVcsSUFBSSxJQUFJO0FBR2hDLFFBQU0sSUFBSSxRQUFRLG1CQUFtQixHQUFHO0FBQ3hDLE1BQUksSUFBSSxPQUFPLENBQUMsRUFBRSxNQUFNLFFBQVEsR0FBRztBQUNsQyxVQUFNLE1BQU07QUFBQSxFQUNiO0FBQ0EsU0FBTztBQUNSO0FBRUEsZUFBZSxnQkFBZ0IsZ0NBQWlFLGVBQW9CLFFBQTRKO0FBQy9RLE1BQUksVUFBVSxRQUFRLGFBQWEsTUFBTSxTQUFTO0FBQ2pELFVBQU0sVUFBVSxNQUFNLCtCQUErQixzQkFBc0IsYUFBYTtBQUN4RixVQUFNLFNBQTRCLENBQUM7QUFDbkMsVUFBTSxlQUFlLEtBQUssTUFBTSxTQUFTLE1BQU07QUFDL0MsUUFBSSxPQUFPLFNBQVMsR0FBRztBQUN0QixhQUFPLFFBQVEsT0FBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLHlCQUF5Qix5Q0FBeUMsT0FBTyxJQUFJLE9BQUsscUJBQXFCLEVBQUUsS0FBSyxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDM0ssV0FBVyxLQUFLLFlBQVksWUFBWSxNQUFNLFVBQVU7QUFDdkQsYUFBTyxRQUFRLE9BQU8sSUFBSSxNQUFNLElBQUksU0FBUyx1QkFBdUIsc0RBQXNELENBQUMsQ0FBQztBQUFBLElBQzdIO0FBQ0EsUUFBSSxhQUFhLFNBQVM7QUFDekIsWUFBTSxnQkFBZ0IsZ0NBQWdDLFVBQVUsU0FBUyxVQUFVLFFBQVEsYUFBYSxHQUFHLGFBQWEsT0FBTyxHQUFHLE1BQU07QUFBQSxJQUN6STtBQUNBLFFBQUksTUFBTSxRQUFRLGFBQWEsUUFBUSxHQUFHO0FBQ3pDLHNCQUFnQixhQUFhLFVBQVUsTUFBTTtBQUM3QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sdUJBQXVCLE9BQU8sd0JBQXdCLGFBQWE7QUFDMUUsVUFBTSxTQUFTLGFBQWE7QUFDNUIsUUFBSSxRQUFRO0FBQ1gsVUFBSSxPQUFPLFdBQVcsVUFBVTtBQUMvQixlQUFPLFFBQVEsT0FBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLEVBQUUsS0FBSyw4QkFBOEIsU0FBUyxDQUFDLDRFQUE0RSxFQUFFLEdBQUcscUZBQXFGLGNBQWMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQzdSO0FBRUEsaUJBQVcsV0FBVyxRQUFRO0FBQzdCLGNBQU0sV0FBVyxPQUFPLE9BQU87QUFDL0IsWUFBSSxhQUFhLDRCQUE0QjtBQUM1QyxpQkFBTyxPQUFPLE9BQU8sT0FBTztBQUFBLFFBQzdCLFdBQVcsT0FBTyxhQUFhLFVBQVU7QUFDeEMsaUJBQU8sT0FBTyxPQUFPLElBQUksTUFBTSxRQUFRLE9BQU8sT0FBTyxDQUFDO0FBQUEsUUFDdkQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFVBQU0sY0FBYyxhQUFhO0FBQ2pDLFFBQUksYUFBYTtBQUNoQixVQUFJLE1BQU0sUUFBUSxXQUFXLEdBQUc7QUFDL0IsZUFBTyxjQUFjLEtBQUssR0FBRyxXQUFXO0FBQUEsTUFDekMsV0FBVyxPQUFPLGdCQUFnQixVQUFVO0FBQzNDLGNBQU0sa0JBQWtCLGdDQUFnQyxVQUFVLFNBQVMsVUFBVSxRQUFRLGFBQWEsR0FBRyxXQUFXLEdBQUcsTUFBTTtBQUFBLE1BQ2xJLE9BQU87QUFDTixlQUFPLFFBQVEsT0FBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLEVBQUUsS0FBSyxtQ0FBbUMsU0FBUyxDQUFDLDRFQUE0RSxFQUFFLEdBQUcsZ0pBQWdKLGNBQWMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQzdWO0FBQUEsSUFDRDtBQUNBLFVBQU0sc0JBQXNCLGFBQWE7QUFDekMsUUFBSSx1QkFBdUIsT0FBTyx3QkFBd0IsVUFBVTtBQUNuRSxpQkFBVyxPQUFPLHFCQUFxQjtBQUN0QyxZQUFJO0FBQ0gsZ0JBQU0sT0FBTyxzQkFBc0IsS0FBSyxvQkFBb0IsR0FBRyxDQUFDO0FBQ2hFLGNBQUksTUFBTTtBQUNULG1CQUFPLG1CQUFtQixLQUFLLElBQUk7QUFBQSxVQUNwQztBQUFBLFFBQ0QsU0FBUyxHQUFHO0FBQ1gsaUJBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxJQUFJLFNBQVMsRUFBRSxLQUFLLDJDQUEyQyxTQUFTLENBQUMsNEVBQTRFLEVBQUUsR0FBRyxxR0FBcUcsY0FBYyxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDMVQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsT0FBTztBQUNOLFdBQU8sa0JBQWtCLGdDQUFnQyxlQUFlLE1BQU07QUFBQSxFQUMvRTtBQUNEO0FBRUEsU0FBUyxrQkFBa0IsZ0NBQWlFLGVBQW9CLFFBQW9GO0FBQ25NLFNBQU8sK0JBQStCLHNCQUFzQixhQUFhLEVBQUUsS0FBSyxhQUFXO0FBQzFGLFFBQUk7QUFDSCxZQUFNLGVBQWUsV0FBVyxPQUFPO0FBQ3ZDLFlBQU0sV0FBbUMsYUFBYTtBQUN0RCxVQUFJLENBQUMsTUFBTSxRQUFRLFFBQVEsR0FBRztBQUM3QixlQUFPLFFBQVEsT0FBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLDZCQUE2Qiw2REFBNkQsQ0FBQyxDQUFDO0FBQUEsTUFDMUk7QUFDQSxzQkFBZ0IsVUFBVSxNQUFNO0FBQ2hDLGFBQU8sUUFBUSxRQUFRLElBQUk7QUFBQSxJQUM1QixTQUFTLEdBQUc7QUFDWCxhQUFPLFFBQVEsT0FBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLHFCQUFxQixzQ0FBc0MsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUFBLElBQ3BIO0FBQUEsRUFDRCxHQUFHLFdBQVM7QUFDWCxXQUFPLFFBQVEsT0FBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLG9CQUFvQiwwQ0FBMEMsY0FBYyxTQUFTLEdBQUcsTUFBTSxPQUFPLENBQUMsQ0FBQztBQUFBLEVBQ3JKLENBQUM7QUFDRjtBQUVBLE1BQU0scUJBQXNFO0FBQUEsRUFDM0UsU0FBUztBQUFBLElBQ1IsRUFBRSxPQUFPLG9CQUFvQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxJQUNqRSxFQUFFLE9BQU8sb0JBQW9CLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLElBQ2pFLEVBQUUsT0FBTyxxQkFBcUIsVUFBVSxFQUFFLFlBQVksVUFBVSxFQUFFO0FBQUEsSUFDbEUsRUFBRSxPQUFPLHFCQUFxQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxFQUNuRTtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ1AsRUFBRSxPQUFPLG9CQUFvQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxJQUNqRSxFQUFFLE9BQU8sb0JBQW9CLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLElBQ2pFLEVBQUUsT0FBTyxxQkFBcUIsVUFBVSxFQUFFLFlBQVksVUFBVSxFQUFFO0FBQUEsSUFDbEUsRUFBRSxPQUFPLHFCQUFxQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxFQUNuRTtBQUFBLEVBQ0EsV0FBVztBQUFBLElBQ1YsRUFBRSxPQUFPLG9CQUFvQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxJQUNqRSxFQUFFLE9BQU8sb0JBQW9CLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLElBQ2pFLEVBQUUsT0FBTyxxQkFBcUIsVUFBVSxFQUFFLFlBQVksVUFBVSxFQUFFO0FBQUEsSUFDbEUsRUFBRSxPQUFPLHFCQUFxQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxFQUNuRTtBQUFBLEVBQ0EsVUFBVTtBQUFBLElBQ1QsRUFBRSxPQUFPLG9CQUFvQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxJQUNqRSxFQUFFLE9BQU8sb0JBQW9CLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLElBQ2pFLEVBQUUsT0FBTyxxQkFBcUIsVUFBVSxFQUFFLFlBQVksVUFBVSxFQUFFO0FBQUEsSUFDbEUsRUFBRSxPQUFPLHFCQUFxQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxFQUNuRTtBQUNEO0FBRUEsTUFBTSxVQUFVLENBQUMsV0FBdUI7QUFFeEMsU0FBUyxZQUFZLGFBQXVCLFFBQTRCO0FBQ3ZFLE1BQUksT0FBTyxTQUFTLFlBQVksUUFBUTtBQUN2QyxXQUFPO0FBQUEsRUFDUjtBQUVBLE1BQUksUUFBNEI7QUFDaEMsUUFBTSxRQUFRLFlBQVksTUFBTSxDQUFDLGVBQWU7QUFDL0MsYUFBUyxJQUFJLE9BQU8sU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQzVDLFVBQUksa0JBQWtCLE9BQU8sQ0FBQyxHQUFHLFVBQVUsR0FBRztBQUM3QyxpQkFBUyxJQUFJLEtBQUssUUFBVSxXQUFXO0FBQ3ZDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSLENBQUM7QUFDRCxTQUFPLFNBQVMsVUFBVSxTQUFZLFFBQVE7QUFDL0M7QUFDQSxTQUFTLGtCQUFrQixlQUF1QixXQUE0QjtBQUM3RSxNQUFJLENBQUMsZUFBZTtBQUNuQixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksa0JBQWtCLFdBQVc7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLE1BQU0sVUFBVTtBQUN0QixTQUFPLGNBQWMsU0FBUyxPQUFPLGNBQWMsT0FBTyxHQUFHLEdBQUcsTUFBTSxhQUFhLGNBQWMsR0FBRyxNQUFNO0FBQzNHO0FBRUEsU0FBUyxnQkFBZ0IsTUFBaUQ7QUFDekUsUUFBTSxZQUFZLEtBQUs7QUFDdkIsTUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLFVBQVU7QUFDakMsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFdBQThDLENBQUM7QUFDckQsTUFBSSxNQUFNLFFBQVEsU0FBUyxHQUFHO0FBQzdCLGVBQVcsTUFBTSxXQUFXO0FBQzNCLHFCQUFlLElBQUksYUFBYSxRQUFRO0FBQUEsSUFDekM7QUFBQSxFQUNELE9BQU87QUFDTixtQkFBZSxXQUFXLGFBQWEsUUFBUTtBQUFBLEVBQ2hEO0FBRUEsTUFBSSxTQUFTLFdBQVcsR0FBRztBQUMxQixXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sQ0FBQyxVQUFzQjtBQUM3QixRQUFJLE1BQU0sU0FBUyxDQUFDLEVBQUUsUUFBUSxLQUFLO0FBQ25DLGFBQVMsSUFBSSxHQUFHLElBQUksU0FBUyxRQUFRLEtBQUs7QUFDekMsWUFBTSxLQUFLLElBQUksS0FBSyxTQUFTLENBQUMsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLElBQy9DO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMsc0JBQXNCLGdCQUF3QixVQUEyRztBQUNqSyxRQUFNLFdBQVcsNEJBQTRCLG1CQUFtQixjQUFjO0FBQzlFLE1BQUk7QUFDSixNQUFJLE9BQU8sYUFBYSxVQUFVO0FBQ2pDLFlBQVEsV0FBVyxhQUFhLFVBQVUsTUFBUztBQUFBLEVBQ3BELFdBQVcsbUNBQW1DLFFBQVEsR0FBRztBQUN4RCxZQUFRLFdBQVcsYUFBYSxTQUFTLFlBQVksU0FBUyxXQUFXLFNBQVMsTUFBTSxTQUFTLFdBQVcsU0FBUyxlQUFlLFNBQVMsTUFBTTtBQUFBLEVBQ3BKO0FBQ0EsTUFBSSxPQUFPO0FBQ1YsV0FBTyxFQUFFLFVBQVUsTUFBTTtBQUFBLEVBQzFCO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxtQ0FBbUMsT0FBd0Q7QUFDbkcsU0FBTyxVQUFVLE1BQU0sU0FBUyxNQUFNLFVBQVUsS0FBSyxNQUFNLFNBQVMsTUFBTSxTQUFTLEtBQUssTUFBTSxVQUFVLE1BQU0sTUFBTSxLQUNoSCxNQUFNLFVBQVUsTUFBTSxTQUFTLEtBQUssTUFBTSxVQUFVLE1BQU0sYUFBYSxLQUFLLE1BQU0sVUFBVSxNQUFNLElBQUk7QUFDM0c7QUFFTyxTQUFTLGFBQWEsZ0JBQWdDLGNBQXdCLFlBQW9CLFNBQTBCO0FBQ2xJLE1BQUksV0FBVztBQUVmLGNBQWEsY0FBYyxlQUFlO0FBRTFDLFFBQU0sY0FBOEMsQ0FBQztBQUNyRCxRQUFNLGFBQWEsZUFBZSxjQUFjLENBQUMsWUFBWSxHQUFHLFdBQVc7QUFFM0UsTUFBSSxhQUFhLFNBQVMsR0FBRztBQUM1QixVQUFNLGdCQUFnQixvQkFBb0IsYUFBYSxhQUFhLFNBQVMsQ0FBQyxDQUFDO0FBQy9FLGdCQUFhLGlCQUFpQixlQUFlO0FBQUEsRUFDOUM7QUFFQSxRQUFNLFlBQVksWUFBWSxZQUFZLFNBQVMsYUFBYSxZQUFZLE1BQU0sU0FBUztBQUMzRixNQUFJLFdBQVcsU0FBUyxRQUFRLEdBQUc7QUFDbEMsZ0JBQVksVUFBVSxTQUFTLGVBQWU7QUFBQSxFQUMvQztBQUNBLE1BQUksV0FBVyxTQUFTLE1BQU0sR0FBRztBQUNoQyxnQkFBWSxVQUFVLE9BQU8sZUFBZTtBQUFBLEVBQzdDO0FBQ0EsTUFBSSxXQUFXLFNBQVMsV0FBVyxHQUFHO0FBQ3JDLGdCQUFZLFVBQVUsWUFBWSxlQUFlO0FBQUEsRUFDbEQ7QUFDQSxNQUFJLFdBQVcsU0FBUyxlQUFlLEdBQUc7QUFDekMsZ0JBQVksVUFBVSxnQkFBZ0IsZUFBZTtBQUFBLEVBQ3REO0FBRUEsUUFBTSxhQUFhLFlBQVk7QUFDL0IsUUFBTSx1QkFBd0IsZUFBZSxTQUFhLGVBQWUsbUJBQW1CLEVBQUUsSUFBSSxVQUFVLElBQUksUUFBUTtBQUN4SCxjQUFZLHdCQUF3QixlQUFlO0FBRW5ELE1BQUksU0FBUztBQUNaLGdCQUFZLGVBQWU7QUFBQSxFQUM1QjtBQUVBLFNBQU87QUFDUjtBQUVBLE1BQU0sZ0JBQWdCO0FBQUEsRUFNckIsY0FBYztBQUNiLFNBQUssZUFBZTtBQUNwQixTQUFLLFlBQVksQ0FBQztBQUNsQixTQUFLLFlBQVksdUJBQU8sT0FBTyxJQUFJO0FBQUEsRUFDcEM7QUFBQSxFQUVPLElBQUksT0FBMkM7QUFDckQsWUFBUSxlQUFlLEtBQUs7QUFDNUIsUUFBSSxVQUFVLFFBQVc7QUFDeEIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFFBQVEsS0FBSyxVQUFVLEtBQUs7QUFDaEMsUUFBSSxPQUFPO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFDQSxZQUFRLEVBQUUsS0FBSztBQUNmLFNBQUssVUFBVSxLQUFLLElBQUk7QUFDeEIsU0FBSyxVQUFVLEtBQUssSUFBSTtBQUN4QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sSUFBSSxPQUEyQztBQUNyRCxZQUFRLGVBQWUsS0FBSztBQUM1QixRQUFJLFVBQVUsUUFBVztBQUN4QixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sUUFBUSxLQUFLLFVBQVUsS0FBSztBQUNsQyxRQUFJLE9BQU87QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFlBQVEsSUFBSSxTQUFTLEtBQUssZ0JBQWdCO0FBQzFDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxVQUFvQjtBQUMxQixXQUFPLEtBQUssVUFBVSxNQUFNLENBQUM7QUFBQSxFQUM5QjtBQUNEO0FBRUEsTUFBTSxlQUFlO0FBQUEsRUFNcEIsY0FBYztBQUNiLFNBQUssY0FBYztBQUNuQixTQUFLLFdBQVcsQ0FBQztBQUNqQixTQUFLLFdBQVcsb0JBQUksSUFBSTtBQUFBLEVBQ3pCO0FBQUEsRUFFTyxJQUFJLFlBQWdDLG9CQUF3QyxzQkFBa0Q7QUFDcEksVUFBTSxPQUEwQixFQUFFLFlBQVksb0JBQW9CLHFCQUFxQjtBQUN2RixRQUFJLFFBQVEsS0FBSyxTQUFTLElBQUksSUFBSTtBQUNsQyxRQUFJLE9BQU87QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFlBQVEsRUFBRSxLQUFLO0FBQ2YsU0FBSyxTQUFTLElBQUksTUFBTSxLQUFLO0FBQzdCLFNBQUssU0FBUyxLQUFLLElBQUk7QUFDdkIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLElBQUksTUFBaUM7QUFDM0MsVUFBTSxRQUFRLEtBQUssU0FBUyxJQUFJLElBQUk7QUFDcEMsUUFBSSxPQUFPO0FBQ1YsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sVUFBK0I7QUFDckMsV0FBTyxLQUFLLFNBQVMsTUFBTSxDQUFDO0FBQUEsRUFDN0I7QUFDRDtBQUVBLFNBQVMsZUFBZSxPQUE4RDtBQUNyRixNQUFJLENBQUMsT0FBTztBQUNYLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixZQUFRLE1BQU0sT0FBTyxJQUFJLFdBQVcsT0FBTyxJQUFJO0FBQUEsRUFDaEQ7QUFDQSxRQUFNLE1BQU0sTUFBTTtBQUNsQixNQUFJLE1BQU0sV0FBVyxDQUFDLE1BQU0sU0FBUyxRQUFTLFFBQVEsS0FBSyxRQUFRLEtBQUssUUFBUSxLQUFLLFFBQVEsR0FBSTtBQUNoRyxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sU0FBUyxDQUFDLFNBQVMsSUFBSTtBQUU3QixXQUFTLElBQUksR0FBRyxJQUFJLEtBQUssS0FBSztBQUM3QixVQUFNLFFBQVEsU0FBUyxNQUFNLFdBQVcsQ0FBQyxDQUFDO0FBQzFDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUssS0FBSztBQUNqQixRQUFJLFFBQVEsS0FBSyxRQUFRLEdBQUc7QUFDM0IsYUFBTyxLQUFLLEtBQUs7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFFQSxNQUFJLE9BQU8sV0FBVyxLQUFLLE9BQU8sQ0FBQyxNQUFNLFNBQVMsS0FBSyxPQUFPLENBQUMsTUFBTSxTQUFTLEdBQUc7QUFDaEYsV0FBTyxTQUFTO0FBQUEsRUFDakI7QUFDQSxTQUFPLE9BQU8sYUFBYSxHQUFHLE1BQU07QUFDckM7QUFFQSxTQUFTLFNBQVMsVUFBNEI7QUFDN0MsTUFBSSxZQUFZLFNBQVMsVUFBVSxZQUFZLFNBQVMsVUFBVSxZQUFZLFNBQVMsS0FBSyxZQUFZLFNBQVMsR0FBRztBQUNuSCxXQUFPO0FBQUEsRUFDUixXQUFXLFlBQVksU0FBUyxLQUFLLFlBQVksU0FBUyxHQUFHO0FBQzVELFdBQU8sV0FBVyxTQUFTLElBQUksU0FBUztBQUFBLEVBQ3pDO0FBQ0EsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJhZGRSdWxlIiwgImZpbmRUb2tlblN0eWxlRm9yU2NvcGVJblNjb3BlcyIsICJpZCJdCn0K
