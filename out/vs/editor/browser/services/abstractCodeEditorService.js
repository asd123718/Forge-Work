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
import * as dom from "../../../base/browser/dom.js";
import * as domStylesheets from "../../../base/browser/domStylesheets.js";
import * as cssJs from "../../../base/browser/cssValue.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore, Disposable, toDisposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { LinkedList } from "../../../base/common/linkedList.js";
import * as strings from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { isThemeColor } from "../../common/editorCommon.js";
import { OverviewRulerLane } from "../../common/model.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
let AbstractCodeEditorService = class extends Disposable {
  constructor(_themeService) {
    super();
    this._themeService = _themeService;
    this._onWillCreateCodeEditor = this._register(new Emitter());
    this.onWillCreateCodeEditor = this._onWillCreateCodeEditor.event;
    this._onCodeEditorAdd = this._register(new Emitter());
    this.onCodeEditorAdd = this._onCodeEditorAdd.event;
    this._onCodeEditorRemove = this._register(new Emitter());
    this.onCodeEditorRemove = this._onCodeEditorRemove.event;
    this._onWillCreateDiffEditor = this._register(new Emitter());
    this.onWillCreateDiffEditor = this._onWillCreateDiffEditor.event;
    this._onDiffEditorAdd = this._register(new Emitter());
    this.onDiffEditorAdd = this._onDiffEditorAdd.event;
    this._onDiffEditorRemove = this._register(new Emitter());
    this.onDiffEditorRemove = this._onDiffEditorRemove.event;
    this._onDidChangeTransientModelProperty = this._register(new Emitter());
    this.onDidChangeTransientModelProperty = this._onDidChangeTransientModelProperty.event;
    this._onDecorationTypeRegistered = this._register(new Emitter());
    this.onDecorationTypeRegistered = this._onDecorationTypeRegistered.event;
    this._decorationOptionProviders = /* @__PURE__ */ new Map();
    this._editorStyleSheets = /* @__PURE__ */ new Map();
    this._codeEditorOpenHandlers = new LinkedList();
    this._transientWatchers = this._register(new DisposableMap());
    this._modelProperties = /* @__PURE__ */ new Map();
    this._codeEditors = /* @__PURE__ */ Object.create(null);
    this._diffEditors = /* @__PURE__ */ Object.create(null);
    this._globalStyleSheet = null;
  }
  willCreateCodeEditor() {
    this._onWillCreateCodeEditor.fire();
  }
  addCodeEditor(editor) {
    this._codeEditors[editor.getId()] = editor;
    this._onCodeEditorAdd.fire(editor);
  }
  removeCodeEditor(editor) {
    if (delete this._codeEditors[editor.getId()]) {
      this._onCodeEditorRemove.fire(editor);
    }
  }
  listCodeEditors() {
    return Object.keys(this._codeEditors).map((id) => this._codeEditors[id]);
  }
  willCreateDiffEditor() {
    this._onWillCreateDiffEditor.fire();
  }
  addDiffEditor(editor) {
    this._diffEditors[editor.getId()] = editor;
    this._onDiffEditorAdd.fire(editor);
  }
  removeDiffEditor(editor) {
    if (delete this._diffEditors[editor.getId()]) {
      this._onDiffEditorRemove.fire(editor);
    }
  }
  listDiffEditors() {
    return Object.keys(this._diffEditors).map((id) => this._diffEditors[id]);
  }
  getFocusedCodeEditor() {
    let editorWithWidgetFocus = null;
    const editors = this.listCodeEditors();
    for (const editor of editors) {
      if (editor.hasTextFocus()) {
        return editor;
      }
      if (editor.hasWidgetFocus()) {
        editorWithWidgetFocus = editor;
      }
    }
    return editorWithWidgetFocus;
  }
  _getOrCreateGlobalStyleSheet() {
    if (!this._globalStyleSheet) {
      this._globalStyleSheet = this._createGlobalStyleSheet();
    }
    return this._globalStyleSheet;
  }
  _createGlobalStyleSheet() {
    return new GlobalStyleSheet(domStylesheets.createStyleSheet());
  }
  _getOrCreateStyleSheet(editor) {
    if (!editor) {
      return this._getOrCreateGlobalStyleSheet();
    }
    const domNode = editor.getContainerDomNode();
    if (!dom.isInShadowDOM(domNode)) {
      return this._getOrCreateGlobalStyleSheet();
    }
    const editorId = editor.getId();
    if (!this._editorStyleSheets.has(editorId)) {
      const refCountedStyleSheet = new RefCountedStyleSheet(this, editorId, domStylesheets.createStyleSheet(domNode));
      this._editorStyleSheets.set(editorId, refCountedStyleSheet);
    }
    return this._editorStyleSheets.get(editorId);
  }
  _removeEditorStyleSheets(editorId) {
    this._editorStyleSheets.delete(editorId);
  }
  registerDecorationType(description, key, options, parentTypeKey, editor) {
    let provider = this._decorationOptionProviders.get(key);
    if (!provider) {
      const styleSheet = this._getOrCreateStyleSheet(editor);
      const providerArgs = {
        styleSheet,
        key,
        parentTypeKey,
        options: options || /* @__PURE__ */ Object.create(null)
      };
      if (!parentTypeKey) {
        provider = new DecorationTypeOptionsProvider(description, this._themeService, styleSheet, providerArgs);
      } else {
        provider = new DecorationSubTypeOptionsProvider(this._themeService, styleSheet, providerArgs);
      }
      this._decorationOptionProviders.set(key, provider);
      this._onDecorationTypeRegistered.fire(key);
    }
    provider.refCount++;
    return {
      dispose: () => {
        this.removeDecorationType(key);
      }
    };
  }
  listDecorationTypes() {
    return Array.from(this._decorationOptionProviders.keys());
  }
  removeDecorationType(key) {
    const provider = this._decorationOptionProviders.get(key);
    if (provider) {
      provider.refCount--;
      if (provider.refCount <= 0) {
        this._decorationOptionProviders.delete(key);
        provider.dispose();
        this.listCodeEditors().forEach((ed) => ed.removeDecorationsByType(key));
      }
    }
  }
  resolveDecorationOptions(decorationTypeKey, writable) {
    const provider = this._decorationOptionProviders.get(decorationTypeKey);
    if (!provider) {
      throw new Error("Unknown decoration type key: " + decorationTypeKey);
    }
    return provider.getOptions(this, writable);
  }
  resolveDecorationCSSRules(decorationTypeKey) {
    const provider = this._decorationOptionProviders.get(decorationTypeKey);
    if (!provider) {
      return null;
    }
    return provider.resolveDecorationCSSRules();
  }
  setModelProperty(resource, key, value) {
    const key1 = resource.toString();
    let dest;
    if (this._modelProperties.has(key1)) {
      dest = this._modelProperties.get(key1);
    } else {
      dest = /* @__PURE__ */ new Map();
      this._modelProperties.set(key1, dest);
    }
    dest.set(key, value);
  }
  getModelProperty(resource, key) {
    const key1 = resource.toString();
    if (this._modelProperties.has(key1)) {
      const innerMap = this._modelProperties.get(key1);
      return innerMap.get(key);
    }
    return void 0;
  }
  setTransientModelProperty(model, key, value) {
    const uri = model.uri.toString();
    let w = this._transientWatchers.get(uri);
    if (!w) {
      w = new ModelTransientSettingWatcher(uri, model, this);
      this._transientWatchers.set(uri, w);
    }
    const previousValue = w.get(key);
    if (previousValue !== value) {
      w.set(key, value);
      this._onDidChangeTransientModelProperty.fire(model);
    }
  }
  getTransientModelProperty(model, key) {
    const uri = model.uri.toString();
    const watcher = this._transientWatchers.get(uri);
    if (!watcher) {
      return void 0;
    }
    return watcher.get(key);
  }
  getTransientModelProperties(model) {
    const uri = model.uri.toString();
    const watcher = this._transientWatchers.get(uri);
    if (!watcher) {
      return void 0;
    }
    return watcher.keys().map((key) => [key, watcher.get(key)]);
  }
  _removeWatcher(w) {
    this._transientWatchers.deleteAndDispose(w.uri);
  }
  async openCodeEditor(input, source, sideBySide) {
    for (const handler of this._codeEditorOpenHandlers) {
      const candidate = await handler(input, source, sideBySide);
      if (candidate !== null) {
        return candidate;
      }
    }
    return null;
  }
  registerCodeEditorOpenHandler(handler) {
    const rm = this._codeEditorOpenHandlers.unshift(handler);
    return toDisposable(rm);
  }
};
AbstractCodeEditorService = __decorateClass([
  __decorateParam(0, IThemeService)
], AbstractCodeEditorService);
class ModelTransientSettingWatcher extends Disposable {
  constructor(uri, model, owner) {
    super();
    this.uri = uri;
    this._values = {};
    this._register(model.onWillDispose(() => owner._removeWatcher(this)));
  }
  set(key, value) {
    this._values[key] = value;
  }
  get(key) {
    return this._values[key];
  }
  keys() {
    return Object.keys(this._values);
  }
}
class RefCountedStyleSheet {
  get sheet() {
    return this._styleSheet.sheet;
  }
  constructor(parent, editorId, styleSheet) {
    this._parent = parent;
    this._editorId = editorId;
    this._styleSheet = styleSheet;
    this._refCount = 0;
  }
  ref() {
    this._refCount++;
  }
  unref() {
    this._refCount--;
    if (this._refCount === 0) {
      this._styleSheet.remove();
      this._parent._removeEditorStyleSheets(this._editorId);
    }
  }
  insertRule(selector, rule) {
    domStylesheets.createCSSRule(selector, rule, this._styleSheet);
  }
  removeRulesContainingSelector(ruleName) {
    domStylesheets.removeCSSRulesContainingSelector(ruleName, this._styleSheet);
  }
}
class GlobalStyleSheet {
  get sheet() {
    return this._styleSheet.sheet;
  }
  constructor(styleSheet) {
    this._styleSheet = styleSheet;
  }
  ref() {
  }
  unref() {
  }
  insertRule(selector, rule) {
    domStylesheets.createCSSRule(selector, rule, this._styleSheet);
  }
  removeRulesContainingSelector(ruleName) {
    domStylesheets.removeCSSRulesContainingSelector(ruleName, this._styleSheet);
  }
}
class DecorationSubTypeOptionsProvider {
  constructor(themeService, styleSheet, providerArgs) {
    this._styleSheet = styleSheet;
    this._styleSheet.ref();
    this._parentTypeKey = providerArgs.parentTypeKey;
    this.refCount = 0;
    this._beforeContentRules = new DecorationCSSRules(3 /* BeforeContentClassName */, providerArgs, themeService);
    this._afterContentRules = new DecorationCSSRules(4 /* AfterContentClassName */, providerArgs, themeService);
  }
  getOptions(codeEditorService, writable) {
    const options = codeEditorService.resolveDecorationOptions(this._parentTypeKey, true);
    if (this._beforeContentRules) {
      options.beforeContentClassName = this._beforeContentRules.className;
    }
    if (this._afterContentRules) {
      options.afterContentClassName = this._afterContentRules.className;
    }
    return options;
  }
  resolveDecorationCSSRules() {
    return this._styleSheet.sheet.cssRules;
  }
  dispose() {
    if (this._beforeContentRules) {
      this._beforeContentRules.dispose();
      this._beforeContentRules = null;
    }
    if (this._afterContentRules) {
      this._afterContentRules.dispose();
      this._afterContentRules = null;
    }
    this._styleSheet.unref();
  }
}
class DecorationTypeOptionsProvider {
  constructor(description, themeService, styleSheet, providerArgs) {
    this._disposables = new DisposableStore();
    this.description = description;
    this._styleSheet = styleSheet;
    this._styleSheet.ref();
    this.refCount = 0;
    const createCSSRules = (type) => {
      const rules = new DecorationCSSRules(type, providerArgs, themeService);
      this._disposables.add(rules);
      if (rules.hasContent) {
        return rules.className;
      }
      return void 0;
    };
    const createInlineCSSRules = (type) => {
      const rules = new DecorationCSSRules(type, providerArgs, themeService);
      this._disposables.add(rules);
      if (rules.hasContent) {
        return { className: rules.className, hasLetterSpacing: rules.hasLetterSpacing };
      }
      return null;
    };
    this.className = createCSSRules(0 /* ClassName */);
    const inlineData = createInlineCSSRules(1 /* InlineClassName */);
    if (inlineData) {
      this.inlineClassName = inlineData.className;
      this.inlineClassNameAffectsLetterSpacing = inlineData.hasLetterSpacing;
    }
    this.beforeContentClassName = createCSSRules(3 /* BeforeContentClassName */);
    this.afterContentClassName = createCSSRules(4 /* AfterContentClassName */);
    if (providerArgs.options.beforeInjectedText && providerArgs.options.beforeInjectedText.contentText) {
      const beforeInlineData = createInlineCSSRules(5 /* BeforeInjectedTextClassName */);
      this.beforeInjectedText = {
        content: providerArgs.options.beforeInjectedText.contentText,
        inlineClassName: beforeInlineData?.className,
        inlineClassNameAffectsLetterSpacing: beforeInlineData?.hasLetterSpacing || providerArgs.options.beforeInjectedText.affectsLetterSpacing
      };
    }
    if (providerArgs.options.afterInjectedText && providerArgs.options.afterInjectedText.contentText) {
      const afterInlineData = createInlineCSSRules(6 /* AfterInjectedTextClassName */);
      this.afterInjectedText = {
        content: providerArgs.options.afterInjectedText.contentText,
        inlineClassName: afterInlineData?.className,
        inlineClassNameAffectsLetterSpacing: afterInlineData?.hasLetterSpacing || providerArgs.options.afterInjectedText.affectsLetterSpacing
      };
    }
    this.glyphMarginClassName = createCSSRules(2 /* GlyphMarginClassName */);
    const options = providerArgs.options;
    this.isWholeLine = Boolean(options.isWholeLine);
    this.lineHeight = options.lineHeight;
    this.fontFamily = options.fontFamily;
    this.fontSize = options.fontSize;
    this.fontWeight = options.fontWeight;
    this.fontStyle = options.fontStyle;
    this.stickiness = options.rangeBehavior;
    const lightOverviewRulerColor = options.light && options.light.overviewRulerColor || options.overviewRulerColor;
    const darkOverviewRulerColor = options.dark && options.dark.overviewRulerColor || options.overviewRulerColor;
    if (typeof lightOverviewRulerColor !== "undefined" || typeof darkOverviewRulerColor !== "undefined") {
      this.overviewRuler = {
        color: lightOverviewRulerColor || darkOverviewRulerColor,
        darkColor: darkOverviewRulerColor || lightOverviewRulerColor,
        position: options.overviewRulerLane || OverviewRulerLane.Center
      };
    }
  }
  getOptions(codeEditorService, writable) {
    if (!writable) {
      return this;
    }
    return {
      description: this.description,
      inlineClassName: this.inlineClassName,
      beforeContentClassName: this.beforeContentClassName,
      afterContentClassName: this.afterContentClassName,
      className: this.className,
      glyphMarginClassName: this.glyphMarginClassName,
      isWholeLine: this.isWholeLine,
      lineHeight: this.lineHeight,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle,
      overviewRuler: this.overviewRuler,
      stickiness: this.stickiness,
      before: this.beforeInjectedText,
      after: this.afterInjectedText
    };
  }
  resolveDecorationCSSRules() {
    return this._styleSheet.sheet.rules;
  }
  dispose() {
    this._disposables.dispose();
    this._styleSheet.unref();
  }
}
const _CSS_MAP = {
  color: "color:{0} !important;",
  opacity: "opacity:{0};",
  backgroundColor: "background-color:{0};",
  outline: "outline:{0};",
  outlineColor: "outline-color:{0};",
  outlineStyle: "outline-style:{0};",
  outlineWidth: "outline-width:{0};",
  border: "border:{0};",
  borderColor: "border-color:{0};",
  borderRadius: "border-radius:{0};",
  borderSpacing: "border-spacing:{0};",
  borderStyle: "border-style:{0};",
  borderWidth: "border-width:{0};",
  fontStyle: "font-style:{0};",
  fontWeight: "font-weight:{0};",
  fontSize: "font-size:{0};",
  fontFamily: "font-family:{0};",
  textDecoration: "text-decoration:{0};",
  cursor: "cursor:{0};",
  letterSpacing: "letter-spacing:{0};",
  gutterIconPath: "background:{0} center center no-repeat;",
  gutterIconSize: "background-size:{0};",
  contentText: "content:'{0}';",
  contentIconPath: "content:{0};",
  margin: "margin:{0};",
  padding: "padding:{0};",
  width: "width:{0};",
  height: "height:{0};",
  verticalAlign: "vertical-align:{0};"
};
class DecorationCSSRules {
  constructor(ruleType, providerArgs, themeService) {
    this._theme = themeService.getColorTheme();
    this._ruleType = ruleType;
    this._providerArgs = providerArgs;
    this._usesThemeColors = false;
    this._hasContent = false;
    this._hasLetterSpacing = false;
    let className = CSSNameHelper.getClassName(this._providerArgs.key, ruleType);
    if (this._providerArgs.parentTypeKey) {
      className = className + " " + CSSNameHelper.getClassName(this._providerArgs.parentTypeKey, ruleType);
    }
    this._className = className;
    this._unThemedSelector = CSSNameHelper.getSelector(this._providerArgs.key, this._providerArgs.parentTypeKey, ruleType);
    this._buildCSS();
    if (this._usesThemeColors) {
      this._themeListener = themeService.onDidColorThemeChange((theme) => {
        this._theme = themeService.getColorTheme();
        this._removeCSS();
        this._buildCSS();
      });
    } else {
      this._themeListener = null;
    }
  }
  dispose() {
    if (this._hasContent) {
      this._removeCSS();
      this._hasContent = false;
    }
    if (this._themeListener) {
      this._themeListener.dispose();
      this._themeListener = null;
    }
  }
  get hasContent() {
    return this._hasContent;
  }
  get hasLetterSpacing() {
    return this._hasLetterSpacing;
  }
  get className() {
    return this._className;
  }
  _buildCSS() {
    const options = this._providerArgs.options;
    let unthemedCSS, lightCSS, darkCSS;
    switch (this._ruleType) {
      case 0 /* ClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationClassName(options);
        lightCSS = this.getCSSTextForModelDecorationClassName(options.light);
        darkCSS = this.getCSSTextForModelDecorationClassName(options.dark);
        break;
      case 1 /* InlineClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationInlineClassName(options);
        lightCSS = this.getCSSTextForModelDecorationInlineClassName(options.light);
        darkCSS = this.getCSSTextForModelDecorationInlineClassName(options.dark);
        break;
      case 2 /* GlyphMarginClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options);
        lightCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options.light);
        darkCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options.dark);
        break;
      case 3 /* BeforeContentClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.before);
        lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.before);
        darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.before);
        break;
      case 4 /* AfterContentClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.after);
        lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.after);
        darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.after);
        break;
      case 5 /* BeforeInjectedTextClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.beforeInjectedText);
        lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.beforeInjectedText);
        darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.beforeInjectedText);
        break;
      case 6 /* AfterInjectedTextClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.afterInjectedText);
        lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.afterInjectedText);
        darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.afterInjectedText);
        break;
      default:
        throw new Error("Unknown rule type: " + this._ruleType);
    }
    const sheet = this._providerArgs.styleSheet;
    let hasContent = false;
    if (unthemedCSS.length > 0) {
      sheet.insertRule(this._unThemedSelector, unthemedCSS);
      hasContent = true;
    }
    if (lightCSS.length > 0) {
      sheet.insertRule(`.vs${this._unThemedSelector}, .hc-light${this._unThemedSelector}`, lightCSS);
      hasContent = true;
    }
    if (darkCSS.length > 0) {
      sheet.insertRule(`.vs-dark${this._unThemedSelector}, .hc-black${this._unThemedSelector}`, darkCSS);
      hasContent = true;
    }
    this._hasContent = hasContent;
  }
  _removeCSS() {
    this._providerArgs.styleSheet.removeRulesContainingSelector(this._unThemedSelector);
  }
  /**
   * Build the CSS for decorations styled via `className`.
   */
  getCSSTextForModelDecorationClassName(opts) {
    if (!opts) {
      return "";
    }
    const cssTextArr = [];
    this.collectCSSText(opts, ["backgroundColor"], cssTextArr);
    this.collectCSSText(opts, ["outline", "outlineColor", "outlineStyle", "outlineWidth"], cssTextArr);
    this.collectBorderSettingsCSSText(opts, cssTextArr);
    return cssTextArr.join("");
  }
  /**
   * Build the CSS for decorations styled via `inlineClassName`.
   */
  getCSSTextForModelDecorationInlineClassName(opts) {
    if (!opts) {
      return "";
    }
    const cssTextArr = [];
    this.collectCSSText(opts, ["fontStyle", "fontWeight", "fontFamily", "fontSize", "textDecoration", "cursor", "color", "opacity", "letterSpacing"], cssTextArr);
    if (opts.letterSpacing) {
      this._hasLetterSpacing = true;
    }
    return cssTextArr.join("");
  }
  /**
   * Build the CSS for decorations styled before or after content.
   */
  getCSSTextForModelDecorationContentClassName(opts) {
    if (!opts) {
      return "";
    }
    const cssTextArr = [];
    if (typeof opts !== "undefined") {
      this.collectBorderSettingsCSSText(opts, cssTextArr);
      if (typeof opts.contentIconPath !== "undefined") {
        cssTextArr.push(strings.format(_CSS_MAP.contentIconPath, cssJs.asCSSUrl(URI.revive(opts.contentIconPath))));
      }
      if (typeof opts.contentText === "string") {
        const truncated = opts.contentText.match(/^.*$/m)[0];
        const escaped = truncated.replace(/['\\]/g, "\\$&");
        cssTextArr.push(strings.format(_CSS_MAP.contentText, escaped));
      }
      this.collectCSSText(opts, ["verticalAlign", "fontStyle", "fontWeight", "fontSize", "fontFamily", "textDecoration", "color", "opacity", "backgroundColor", "margin", "padding"], cssTextArr);
      if (this.collectCSSText(opts, ["width", "height"], cssTextArr)) {
        cssTextArr.push("display:inline-block;");
      }
    }
    return cssTextArr.join("");
  }
  /**
   * Build the CSS for decorations styled via `glyphMarginClassName`.
   */
  getCSSTextForModelDecorationGlyphMarginClassName(opts) {
    if (!opts) {
      return "";
    }
    const cssTextArr = [];
    if (typeof opts.gutterIconPath !== "undefined") {
      cssTextArr.push(strings.format(_CSS_MAP.gutterIconPath, cssJs.asCSSUrl(URI.revive(opts.gutterIconPath))));
      if (typeof opts.gutterIconSize !== "undefined") {
        cssTextArr.push(strings.format(_CSS_MAP.gutterIconSize, opts.gutterIconSize));
      }
    }
    return cssTextArr.join("");
  }
  collectBorderSettingsCSSText(opts, cssTextArr) {
    if (this.collectCSSText(opts, ["border", "borderColor", "borderRadius", "borderSpacing", "borderStyle", "borderWidth"], cssTextArr)) {
      cssTextArr.push(strings.format("box-sizing: border-box;"));
      return true;
    }
    return false;
  }
  collectCSSText(opts, properties, cssTextArr) {
    const lenBefore = cssTextArr.length;
    for (const property of properties) {
      const value = this.resolveValue(opts[property]);
      if (typeof value === "string") {
        cssTextArr.push(strings.format(_CSS_MAP[property], value));
      }
    }
    return cssTextArr.length !== lenBefore;
  }
  resolveValue(value) {
    if (isThemeColor(value)) {
      this._usesThemeColors = true;
      const color = this._theme.getColor(value.id);
      if (color) {
        return color.toString();
      }
      return "transparent";
    }
    return value;
  }
}
var ModelDecorationCSSRuleType = /* @__PURE__ */ ((ModelDecorationCSSRuleType2) => {
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["ClassName"] = 0] = "ClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["InlineClassName"] = 1] = "InlineClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["GlyphMarginClassName"] = 2] = "GlyphMarginClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["BeforeContentClassName"] = 3] = "BeforeContentClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["AfterContentClassName"] = 4] = "AfterContentClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["BeforeInjectedTextClassName"] = 5] = "BeforeInjectedTextClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["AfterInjectedTextClassName"] = 6] = "AfterInjectedTextClassName";
  return ModelDecorationCSSRuleType2;
})(ModelDecorationCSSRuleType || {});
class CSSNameHelper {
  static getClassName(key, type) {
    return "ced-" + key + "-" + type;
  }
  static getSelector(key, parentKey, ruleType) {
    let selector = ".monaco-editor ." + this.getClassName(key, ruleType);
    if (parentKey) {
      selector = selector + "." + this.getClassName(parentKey, ruleType);
    }
    if (ruleType === 3 /* BeforeContentClassName */) {
      selector += "::before";
    } else if (ruleType === 4 /* AfterContentClassName */) {
      selector += "::after";
    }
    return selector;
  }
}
export {
  AbstractCodeEditorService,
  GlobalStyleSheet,
  ModelTransientSettingWatcher,
  _CSS_MAP
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHNlcnZpY2VzXFxhYnN0cmFjdENvZGVFZGl0b3JTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHMgZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCAqIGFzIGNzc0pzIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRGlmZkVkaXRvciB9IGZyb20gJy4uL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JPcGVuSGFuZGxlciwgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGVudERlY29yYXRpb25SZW5kZXJPcHRpb25zLCBJRGVjb3JhdGlvblJlbmRlck9wdGlvbnMsIElUaGVtZURlY29yYXRpb25SZW5kZXJPcHRpb25zLCBpc1RoZW1lQ29sb3IgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElNb2RlbERlY29yYXRpb25PcHRpb25zLCBJTW9kZWxEZWNvcmF0aW9uT3ZlcnZpZXdSdWxlck9wdGlvbnMsIEluamVjdGVkVGV4dE9wdGlvbnMsIElUZXh0TW9kZWwsIE92ZXJ2aWV3UnVsZXJMYW5lLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RDb2RlRWRpdG9yU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29kZUVkaXRvclNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbENyZWF0ZUNvZGVFZGl0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbENyZWF0ZUNvZGVFZGl0b3IgPSB0aGlzLl9vbldpbGxDcmVhdGVDb2RlRWRpdG9yLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29kZUVkaXRvckFkZDogRW1pdHRlcjxJQ29kZUVkaXRvcj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29kZUVkaXRvcj4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkNvZGVFZGl0b3JBZGQ6IEV2ZW50PElDb2RlRWRpdG9yPiA9IHRoaXMuX29uQ29kZUVkaXRvckFkZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvZGVFZGl0b3JSZW1vdmU6IEVtaXR0ZXI8SUNvZGVFZGl0b3I+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvZGVFZGl0b3I+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Db2RlRWRpdG9yUmVtb3ZlOiBFdmVudDxJQ29kZUVkaXRvcj4gPSB0aGlzLl9vbkNvZGVFZGl0b3JSZW1vdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQ3JlYXRlRGlmZkVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsQ3JlYXRlRGlmZkVkaXRvciA9IHRoaXMuX29uV2lsbENyZWF0ZURpZmZFZGl0b3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWZmRWRpdG9yQWRkOiBFbWl0dGVyPElEaWZmRWRpdG9yPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElEaWZmRWRpdG9yPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlmZkVkaXRvckFkZDogRXZlbnQ8SURpZmZFZGl0b3I+ID0gdGhpcy5fb25EaWZmRWRpdG9yQWRkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlmZkVkaXRvclJlbW92ZTogRW1pdHRlcjxJRGlmZkVkaXRvcj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRGlmZkVkaXRvcj4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZmZFZGl0b3JSZW1vdmU6IEV2ZW50PElEaWZmRWRpdG9yPiA9IHRoaXMuX29uRGlmZkVkaXRvclJlbW92ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRyYW5zaWVudE1vZGVsUHJvcGVydHk6IEVtaXR0ZXI8SVRleHRNb2RlbD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGV4dE1vZGVsPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHJhbnNpZW50TW9kZWxQcm9wZXJ0eTogRXZlbnQ8SVRleHRNb2RlbD4gPSB0aGlzLl9vbkRpZENoYW5nZVRyYW5zaWVudE1vZGVsUHJvcGVydHkuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRlY29yYXRpb25UeXBlUmVnaXN0ZXJlZDogRW1pdHRlcjxzdHJpbmc+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cHVibGljIG9uRGVjb3JhdGlvblR5cGVSZWdpc3RlcmVkOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EZWNvcmF0aW9uVHlwZVJlZ2lzdGVyZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvcnM6IHsgW2VkaXRvcklkOiBzdHJpbmddOiBJQ29kZUVkaXRvciB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmRWRpdG9yczogeyBbZWRpdG9ySWQ6IHN0cmluZ106IElEaWZmRWRpdG9yIH07XG5cdHByb3RlY3RlZCBfZ2xvYmFsU3R5bGVTaGVldDogR2xvYmFsU3R5bGVTaGVldCB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25PcHRpb25Qcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnNQcm92aWRlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU3R5bGVTaGVldHMgPSBuZXcgTWFwPHN0cmluZywgUmVmQ291bnRlZFN0eWxlU2hlZXQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JPcGVuSGFuZGxlcnMgPSBuZXcgTGlua2VkTGlzdDxJQ29kZUVkaXRvck9wZW5IYW5kbGVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9ycyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fZGlmZkVkaXRvcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX2dsb2JhbFN0eWxlU2hlZXQgPSBudWxsO1xuXHR9XG5cblx0d2lsbENyZWF0ZUNvZGVFZGl0b3IoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25XaWxsQ3JlYXRlQ29kZUVkaXRvci5maXJlKCk7XG5cdH1cblxuXHRhZGRDb2RlRWRpdG9yKGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHR0aGlzLl9jb2RlRWRpdG9yc1tlZGl0b3IuZ2V0SWQoKV0gPSBlZGl0b3I7XG5cdFx0dGhpcy5fb25Db2RlRWRpdG9yQWRkLmZpcmUoZWRpdG9yKTtcblx0fVxuXG5cdHJlbW92ZUNvZGVFZGl0b3IoZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGlmIChkZWxldGUgdGhpcy5fY29kZUVkaXRvcnNbZWRpdG9yLmdldElkKCldKSB7XG5cdFx0XHR0aGlzLl9vbkNvZGVFZGl0b3JSZW1vdmUuZmlyZShlZGl0b3IpO1xuXHRcdH1cblx0fVxuXG5cdGxpc3RDb2RlRWRpdG9ycygpOiBJQ29kZUVkaXRvcltdIHtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy5fY29kZUVkaXRvcnMpLm1hcChpZCA9PiB0aGlzLl9jb2RlRWRpdG9yc1tpZF0pO1xuXHR9XG5cblx0d2lsbENyZWF0ZURpZmZFZGl0b3IoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25XaWxsQ3JlYXRlRGlmZkVkaXRvci5maXJlKCk7XG5cdH1cblxuXHRhZGREaWZmRWRpdG9yKGVkaXRvcjogSURpZmZFZGl0b3IpOiB2b2lkIHtcblx0XHR0aGlzLl9kaWZmRWRpdG9yc1tlZGl0b3IuZ2V0SWQoKV0gPSBlZGl0b3I7XG5cdFx0dGhpcy5fb25EaWZmRWRpdG9yQWRkLmZpcmUoZWRpdG9yKTtcblx0fVxuXG5cdHJlbW92ZURpZmZFZGl0b3IoZWRpdG9yOiBJRGlmZkVkaXRvcik6IHZvaWQge1xuXHRcdGlmIChkZWxldGUgdGhpcy5fZGlmZkVkaXRvcnNbZWRpdG9yLmdldElkKCldKSB7XG5cdFx0XHR0aGlzLl9vbkRpZmZFZGl0b3JSZW1vdmUuZmlyZShlZGl0b3IpO1xuXHRcdH1cblx0fVxuXG5cdGxpc3REaWZmRWRpdG9ycygpOiBJRGlmZkVkaXRvcltdIHtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy5fZGlmZkVkaXRvcnMpLm1hcChpZCA9PiB0aGlzLl9kaWZmRWRpdG9yc1tpZF0pO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZENvZGVFZGl0b3IoKTogSUNvZGVFZGl0b3IgfCBudWxsIHtcblx0XHRsZXQgZWRpdG9yV2l0aFdpZGdldEZvY3VzOiBJQ29kZUVkaXRvciB8IG51bGwgPSBudWxsO1xuXG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMubGlzdENvZGVFZGl0b3JzKCk7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXG5cdFx0XHRpZiAoZWRpdG9yLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRcdC8vIGJpbmdvIVxuXHRcdFx0XHRyZXR1cm4gZWRpdG9yO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWRpdG9yLmhhc1dpZGdldEZvY3VzKCkpIHtcblx0XHRcdFx0ZWRpdG9yV2l0aFdpZGdldEZvY3VzID0gZWRpdG9yO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JXaXRoV2lkZ2V0Rm9jdXM7XG5cdH1cblxuXG5cdHByaXZhdGUgX2dldE9yQ3JlYXRlR2xvYmFsU3R5bGVTaGVldCgpOiBHbG9iYWxTdHlsZVNoZWV0IHtcblx0XHRpZiAoIXRoaXMuX2dsb2JhbFN0eWxlU2hlZXQpIHtcblx0XHRcdHRoaXMuX2dsb2JhbFN0eWxlU2hlZXQgPSB0aGlzLl9jcmVhdGVHbG9iYWxTdHlsZVNoZWV0KCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nbG9iYWxTdHlsZVNoZWV0O1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVHbG9iYWxTdHlsZVNoZWV0KCk6IEdsb2JhbFN0eWxlU2hlZXQge1xuXHRcdHJldHVybiBuZXcgR2xvYmFsU3R5bGVTaGVldChkb21TdHlsZXNoZWV0cy5jcmVhdGVTdHlsZVNoZWV0KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVTdHlsZVNoZWV0KGVkaXRvcjogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQpOiBHbG9iYWxTdHlsZVNoZWV0IHwgUmVmQ291bnRlZFN0eWxlU2hlZXQge1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0T3JDcmVhdGVHbG9iYWxTdHlsZVNoZWV0KCk7XG5cdFx0fVxuXHRcdGNvbnN0IGRvbU5vZGUgPSBlZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpO1xuXHRcdGlmICghZG9tLmlzSW5TaGFkb3dET00oZG9tTm9kZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRPckNyZWF0ZUdsb2JhbFN0eWxlU2hlZXQoKTtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9ySWQgPSBlZGl0b3IuZ2V0SWQoKTtcblx0XHRpZiAoIXRoaXMuX2VkaXRvclN0eWxlU2hlZXRzLmhhcyhlZGl0b3JJZCkpIHtcblx0XHRcdGNvbnN0IHJlZkNvdW50ZWRTdHlsZVNoZWV0ID0gbmV3IFJlZkNvdW50ZWRTdHlsZVNoZWV0KHRoaXMsIGVkaXRvcklkLCBkb21TdHlsZXNoZWV0cy5jcmVhdGVTdHlsZVNoZWV0KGRvbU5vZGUpKTtcblx0XHRcdHRoaXMuX2VkaXRvclN0eWxlU2hlZXRzLnNldChlZGl0b3JJZCwgcmVmQ291bnRlZFN0eWxlU2hlZXQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yU3R5bGVTaGVldHMuZ2V0KGVkaXRvcklkKSE7XG5cdH1cblxuXHRfcmVtb3ZlRWRpdG9yU3R5bGVTaGVldHMoZWRpdG9ySWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvclN0eWxlU2hlZXRzLmRlbGV0ZShlZGl0b3JJZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJEZWNvcmF0aW9uVHlwZShkZXNjcmlwdGlvbjogc3RyaW5nLCBrZXk6IHN0cmluZywgb3B0aW9uczogSURlY29yYXRpb25SZW5kZXJPcHRpb25zLCBwYXJlbnRUeXBlS2V5Pzogc3RyaW5nLCBlZGl0b3I/OiBJQ29kZUVkaXRvcik6IElEaXNwb3NhYmxlIHtcblx0XHRsZXQgcHJvdmlkZXIgPSB0aGlzLl9kZWNvcmF0aW9uT3B0aW9uUHJvdmlkZXJzLmdldChrZXkpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IHN0eWxlU2hlZXQgPSB0aGlzLl9nZXRPckNyZWF0ZVN0eWxlU2hlZXQoZWRpdG9yKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyQXJnczogUHJvdmlkZXJBcmd1bWVudHMgPSB7XG5cdFx0XHRcdHN0eWxlU2hlZXQ6IHN0eWxlU2hlZXQsXG5cdFx0XHRcdGtleToga2V5LFxuXHRcdFx0XHRwYXJlbnRUeXBlS2V5OiBwYXJlbnRUeXBlS2V5LFxuXHRcdFx0XHRvcHRpb25zOiBvcHRpb25zIHx8IE9iamVjdC5jcmVhdGUobnVsbClcblx0XHRcdH07XG5cdFx0XHRpZiAoIXBhcmVudFR5cGVLZXkpIHtcblx0XHRcdFx0cHJvdmlkZXIgPSBuZXcgRGVjb3JhdGlvblR5cGVPcHRpb25zUHJvdmlkZXIoZGVzY3JpcHRpb24sIHRoaXMuX3RoZW1lU2VydmljZSwgc3R5bGVTaGVldCwgcHJvdmlkZXJBcmdzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb3ZpZGVyID0gbmV3IERlY29yYXRpb25TdWJUeXBlT3B0aW9uc1Byb3ZpZGVyKHRoaXMuX3RoZW1lU2VydmljZSwgc3R5bGVTaGVldCwgcHJvdmlkZXJBcmdzKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RlY29yYXRpb25PcHRpb25Qcm92aWRlcnMuc2V0KGtleSwgcHJvdmlkZXIpO1xuXHRcdFx0dGhpcy5fb25EZWNvcmF0aW9uVHlwZVJlZ2lzdGVyZWQuZmlyZShrZXkpO1xuXHRcdH1cblx0XHRwcm92aWRlci5yZWZDb3VudCsrO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlRGVjb3JhdGlvblR5cGUoa2V5KTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGxpc3REZWNvcmF0aW9uVHlwZXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2RlY29yYXRpb25PcHRpb25Qcm92aWRlcnMua2V5cygpKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVEZWNvcmF0aW9uVHlwZShrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZGVjb3JhdGlvbk9wdGlvblByb3ZpZGVycy5nZXQoa2V5KTtcblx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdHByb3ZpZGVyLnJlZkNvdW50LS07XG5cdFx0XHRpZiAocHJvdmlkZXIucmVmQ291bnQgPD0gMCkge1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9uT3B0aW9uUHJvdmlkZXJzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRwcm92aWRlci5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMubGlzdENvZGVFZGl0b3JzKCkuZm9yRWFjaCgoZWQpID0+IGVkLnJlbW92ZURlY29yYXRpb25zQnlUeXBlKGtleSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlRGVjb3JhdGlvbk9wdGlvbnMoZGVjb3JhdGlvblR5cGVLZXk6IHN0cmluZywgd3JpdGFibGU6IGJvb2xlYW4pOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9kZWNvcmF0aW9uT3B0aW9uUHJvdmlkZXJzLmdldChkZWNvcmF0aW9uVHlwZUtleSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGRlY29yYXRpb24gdHlwZSBrZXk6ICcgKyBkZWNvcmF0aW9uVHlwZUtleSk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm92aWRlci5nZXRPcHRpb25zKHRoaXMsIHdyaXRhYmxlKTtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlRGVjb3JhdGlvbkNTU1J1bGVzKGRlY29yYXRpb25UeXBlS2V5OiBzdHJpbmcpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2RlY29yYXRpb25PcHRpb25Qcm92aWRlcnMuZ2V0KGRlY29yYXRpb25UeXBlS2V5KTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3ZpZGVyLnJlc29sdmVEZWNvcmF0aW9uQ1NTUnVsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zaWVudFdhdGNoZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBNb2RlbFRyYW5zaWVudFNldHRpbmdXYXRjaGVyPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxQcm9wZXJ0aWVzID0gbmV3IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIHVua25vd24+PigpO1xuXG5cdHB1YmxpYyBzZXRNb2RlbFByb3BlcnR5KHJlc291cmNlOiBVUkksIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGtleTEgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGxldCBkZXN0OiBNYXA8c3RyaW5nLCB1bmtub3duPjtcblx0XHRpZiAodGhpcy5fbW9kZWxQcm9wZXJ0aWVzLmhhcyhrZXkxKSkge1xuXHRcdFx0ZGVzdCA9IHRoaXMuX21vZGVsUHJvcGVydGllcy5nZXQoa2V5MSkhO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkZXN0ID0gbmV3IE1hcDxzdHJpbmcsIHVua25vd24+KCk7XG5cdFx0XHR0aGlzLl9tb2RlbFByb3BlcnRpZXMuc2V0KGtleTEsIGRlc3QpO1xuXHRcdH1cblxuXHRcdGRlc3Quc2V0KGtleSwgdmFsdWUpO1xuXHR9XG5cblx0cHVibGljIGdldE1vZGVsUHJvcGVydHkocmVzb3VyY2U6IFVSSSwga2V5OiBzdHJpbmcpOiB1bmtub3duIHtcblx0XHRjb25zdCBrZXkxID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRpZiAodGhpcy5fbW9kZWxQcm9wZXJ0aWVzLmhhcyhrZXkxKSkge1xuXHRcdFx0Y29uc3QgaW5uZXJNYXAgPSB0aGlzLl9tb2RlbFByb3BlcnRpZXMuZ2V0KGtleTEpITtcblx0XHRcdHJldHVybiBpbm5lck1hcC5nZXQoa2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBzZXRUcmFuc2llbnRNb2RlbFByb3BlcnR5KG1vZGVsOiBJVGV4dE1vZGVsLCBrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCB1cmkgPSBtb2RlbC51cmkudG9TdHJpbmcoKTtcblxuXHRcdGxldCB3ID0gdGhpcy5fdHJhbnNpZW50V2F0Y2hlcnMuZ2V0KHVyaSk7XG5cdFx0aWYgKCF3KSB7XG5cdFx0XHR3ID0gbmV3IE1vZGVsVHJhbnNpZW50U2V0dGluZ1dhdGNoZXIodXJpLCBtb2RlbCwgdGhpcyk7XG5cdFx0XHR0aGlzLl90cmFuc2llbnRXYXRjaGVycy5zZXQodXJpLCB3KTtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c1ZhbHVlID0gdy5nZXQoa2V5KTtcblx0XHRpZiAocHJldmlvdXNWYWx1ZSAhPT0gdmFsdWUpIHtcblx0XHRcdHcuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUcmFuc2llbnRNb2RlbFByb3BlcnR5LmZpcmUobW9kZWwpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRUcmFuc2llbnRNb2RlbFByb3BlcnR5KG1vZGVsOiBJVGV4dE1vZGVsLCBrZXk6IHN0cmluZyk6IHVua25vd24ge1xuXHRcdGNvbnN0IHVyaSA9IG1vZGVsLnVyaS50b1N0cmluZygpO1xuXG5cdFx0Y29uc3Qgd2F0Y2hlciA9IHRoaXMuX3RyYW5zaWVudFdhdGNoZXJzLmdldCh1cmkpO1xuXHRcdGlmICghd2F0Y2hlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gd2F0Y2hlci5nZXQoa2V5KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUcmFuc2llbnRNb2RlbFByb3BlcnRpZXMobW9kZWw6IElUZXh0TW9kZWwpOiBbc3RyaW5nLCB1bmtub3duXVtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB1cmkgPSBtb2RlbC51cmkudG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IHdhdGNoZXIgPSB0aGlzLl90cmFuc2llbnRXYXRjaGVycy5nZXQodXJpKTtcblx0XHRpZiAoIXdhdGNoZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdhdGNoZXIua2V5cygpLm1hcChrZXkgPT4gW2tleSwgd2F0Y2hlci5nZXQoa2V5KV0pO1xuXHR9XG5cblx0X3JlbW92ZVdhdGNoZXIodzogTW9kZWxUcmFuc2llbnRTZXR0aW5nV2F0Y2hlcik6IHZvaWQge1xuXHRcdHRoaXMuX3RyYW5zaWVudFdhdGNoZXJzLmRlbGV0ZUFuZERpc3Bvc2Uody51cmkpO1xuXHR9XG5cblx0YWJzdHJhY3QgZ2V0QWN0aXZlQ29kZUVkaXRvcigpOiBJQ29kZUVkaXRvciB8IG51bGw7XG5cblx0YXN5bmMgb3BlbkNvZGVFZGl0b3IoaW5wdXQ6IElSZXNvdXJjZUVkaXRvcklucHV0LCBzb3VyY2U6IElDb2RlRWRpdG9yIHwgbnVsbCwgc2lkZUJ5U2lkZT86IGJvb2xlYW4pOiBQcm9taXNlPElDb2RlRWRpdG9yIHwgbnVsbD4ge1xuXHRcdGZvciAoY29uc3QgaGFuZGxlciBvZiB0aGlzLl9jb2RlRWRpdG9yT3BlbkhhbmRsZXJzKSB7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBhd2FpdCBoYW5kbGVyKGlucHV0LCBzb3VyY2UsIHNpZGVCeVNpZGUpO1xuXHRcdFx0aWYgKGNhbmRpZGF0ZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHJlZ2lzdGVyQ29kZUVkaXRvck9wZW5IYW5kbGVyKGhhbmRsZXI6IElDb2RlRWRpdG9yT3BlbkhhbmRsZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgcm0gPSB0aGlzLl9jb2RlRWRpdG9yT3BlbkhhbmRsZXJzLnVuc2hpZnQoaGFuZGxlcik7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZShybSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGVsVHJhbnNpZW50U2V0dGluZ1dhdGNoZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IHVyaTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92YWx1ZXM6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9O1xuXG5cdGNvbnN0cnVjdG9yKHVyaTogc3RyaW5nLCBtb2RlbDogSVRleHRNb2RlbCwgb3duZXI6IEFic3RyYWN0Q29kZUVkaXRvclNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51cmkgPSB1cmk7XG5cdFx0dGhpcy5fdmFsdWVzID0ge307XG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiBvd25lci5fcmVtb3ZlV2F0Y2hlcih0aGlzKSkpO1xuXHR9XG5cblx0cHVibGljIHNldChrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiB2b2lkIHtcblx0XHR0aGlzLl92YWx1ZXNba2V5XSA9IHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGdldChrZXk6IHN0cmluZyk6IHVua25vd24ge1xuXHRcdHJldHVybiB0aGlzLl92YWx1ZXNba2V5XTtcblx0fVxuXG5cdHB1YmxpYyBrZXlzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy5fdmFsdWVzKTtcblx0fVxufVxuXG5jbGFzcyBSZWZDb3VudGVkU3R5bGVTaGVldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGFyZW50OiBBYnN0cmFjdENvZGVFZGl0b3JTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHlsZVNoZWV0OiBIVE1MU3R5bGVFbGVtZW50O1xuXHRwcml2YXRlIF9yZWZDb3VudDogbnVtYmVyO1xuXG5cdHB1YmxpYyBnZXQgc2hlZXQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0eWxlU2hlZXQuc2hlZXQgYXMgQ1NTU3R5bGVTaGVldDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHBhcmVudDogQWJzdHJhY3RDb2RlRWRpdG9yU2VydmljZSwgZWRpdG9ySWQ6IHN0cmluZywgc3R5bGVTaGVldDogSFRNTFN0eWxlRWxlbWVudCkge1xuXHRcdHRoaXMuX3BhcmVudCA9IHBhcmVudDtcblx0XHR0aGlzLl9lZGl0b3JJZCA9IGVkaXRvcklkO1xuXHRcdHRoaXMuX3N0eWxlU2hlZXQgPSBzdHlsZVNoZWV0O1xuXHRcdHRoaXMuX3JlZkNvdW50ID0gMDtcblx0fVxuXG5cdHB1YmxpYyByZWYoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVmQ291bnQrKztcblx0fVxuXG5cdHB1YmxpYyB1bnJlZigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWZDb3VudC0tO1xuXHRcdGlmICh0aGlzLl9yZWZDb3VudCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3R5bGVTaGVldC5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX3BhcmVudC5fcmVtb3ZlRWRpdG9yU3R5bGVTaGVldHModGhpcy5fZWRpdG9ySWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBpbnNlcnRSdWxlKHNlbGVjdG9yOiBzdHJpbmcsIHJ1bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGRvbVN0eWxlc2hlZXRzLmNyZWF0ZUNTU1J1bGUoc2VsZWN0b3IsIHJ1bGUsIHRoaXMuX3N0eWxlU2hlZXQpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZVJ1bGVzQ29udGFpbmluZ1NlbGVjdG9yKHJ1bGVOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRkb21TdHlsZXNoZWV0cy5yZW1vdmVDU1NSdWxlc0NvbnRhaW5pbmdTZWxlY3RvcihydWxlTmFtZSwgdGhpcy5fc3R5bGVTaGVldCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEdsb2JhbFN0eWxlU2hlZXQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHlsZVNoZWV0OiBIVE1MU3R5bGVFbGVtZW50O1xuXG5cdHB1YmxpYyBnZXQgc2hlZXQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0eWxlU2hlZXQuc2hlZXQgYXMgQ1NTU3R5bGVTaGVldDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHN0eWxlU2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQpIHtcblx0XHR0aGlzLl9zdHlsZVNoZWV0ID0gc3R5bGVTaGVldDtcblx0fVxuXG5cdHB1YmxpYyByZWYoKTogdm9pZCB7XG5cdH1cblxuXHRwdWJsaWMgdW5yZWYoKTogdm9pZCB7XG5cdH1cblxuXHRwdWJsaWMgaW5zZXJ0UnVsZShzZWxlY3Rvcjogc3RyaW5nLCBydWxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRkb21TdHlsZXNoZWV0cy5jcmVhdGVDU1NSdWxlKHNlbGVjdG9yLCBydWxlLCB0aGlzLl9zdHlsZVNoZWV0KTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVSdWxlc0NvbnRhaW5pbmdTZWxlY3RvcihydWxlTmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0ZG9tU3R5bGVzaGVldHMucmVtb3ZlQ1NTUnVsZXNDb250YWluaW5nU2VsZWN0b3IocnVsZU5hbWUsIHRoaXMuX3N0eWxlU2hlZXQpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTW9kZWxEZWNvcmF0aW9uT3B0aW9uc1Byb3ZpZGVyIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWZDb3VudDogbnVtYmVyO1xuXHRnZXRPcHRpb25zKGNvZGVFZGl0b3JTZXJ2aWNlOiBBYnN0cmFjdENvZGVFZGl0b3JTZXJ2aWNlLCB3cml0YWJsZTogYm9vbGVhbik6IElNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXHRyZXNvbHZlRGVjb3JhdGlvbkNTU1J1bGVzKCk6IENTU1J1bGVMaXN0O1xufVxuXG5jbGFzcyBEZWNvcmF0aW9uU3ViVHlwZU9wdGlvbnNQcm92aWRlciBpbXBsZW1lbnRzIElNb2RlbERlY29yYXRpb25PcHRpb25zUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0eWxlU2hlZXQ6IEdsb2JhbFN0eWxlU2hlZXQgfCBSZWZDb3VudGVkU3R5bGVTaGVldDtcblx0cHVibGljIHJlZkNvdW50OiBudW1iZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGFyZW50VHlwZUtleTogc3RyaW5nO1xuXHRwcml2YXRlIF9iZWZvcmVDb250ZW50UnVsZXM6IERlY29yYXRpb25DU1NSdWxlcyB8IG51bGw7XG5cdHByaXZhdGUgX2FmdGVyQ29udGVudFJ1bGVzOiBEZWNvcmF0aW9uQ1NTUnVsZXMgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSwgc3R5bGVTaGVldDogR2xvYmFsU3R5bGVTaGVldCB8IFJlZkNvdW50ZWRTdHlsZVNoZWV0LCBwcm92aWRlckFyZ3M6IFByb3ZpZGVyQXJndW1lbnRzKSB7XG5cdFx0dGhpcy5fc3R5bGVTaGVldCA9IHN0eWxlU2hlZXQ7XG5cdFx0dGhpcy5fc3R5bGVTaGVldC5yZWYoKTtcblx0XHR0aGlzLl9wYXJlbnRUeXBlS2V5ID0gcHJvdmlkZXJBcmdzLnBhcmVudFR5cGVLZXkhO1xuXHRcdHRoaXMucmVmQ291bnQgPSAwO1xuXG5cdFx0dGhpcy5fYmVmb3JlQ29udGVudFJ1bGVzID0gbmV3IERlY29yYXRpb25DU1NSdWxlcyhNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZS5CZWZvcmVDb250ZW50Q2xhc3NOYW1lLCBwcm92aWRlckFyZ3MsIHRoZW1lU2VydmljZSk7XG5cdFx0dGhpcy5fYWZ0ZXJDb250ZW50UnVsZXMgPSBuZXcgRGVjb3JhdGlvbkNTU1J1bGVzKE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkFmdGVyQ29udGVudENsYXNzTmFtZSwgcHJvdmlkZXJBcmdzLCB0aGVtZVNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIGdldE9wdGlvbnMoY29kZUVkaXRvclNlcnZpY2U6IEFic3RyYWN0Q29kZUVkaXRvclNlcnZpY2UsIHdyaXRhYmxlOiBib29sZWFuKTogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBjb2RlRWRpdG9yU2VydmljZS5yZXNvbHZlRGVjb3JhdGlvbk9wdGlvbnModGhpcy5fcGFyZW50VHlwZUtleSwgdHJ1ZSk7XG5cdFx0aWYgKHRoaXMuX2JlZm9yZUNvbnRlbnRSdWxlcykge1xuXHRcdFx0b3B0aW9ucy5iZWZvcmVDb250ZW50Q2xhc3NOYW1lID0gdGhpcy5fYmVmb3JlQ29udGVudFJ1bGVzLmNsYXNzTmFtZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FmdGVyQ29udGVudFJ1bGVzKSB7XG5cdFx0XHRvcHRpb25zLmFmdGVyQ29udGVudENsYXNzTmFtZSA9IHRoaXMuX2FmdGVyQ29udGVudFJ1bGVzLmNsYXNzTmFtZTtcblx0XHR9XG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZURlY29yYXRpb25DU1NSdWxlcygpOiBDU1NSdWxlTGlzdCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0eWxlU2hlZXQuc2hlZXQuY3NzUnVsZXM7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYmVmb3JlQ29udGVudFJ1bGVzKSB7XG5cdFx0XHR0aGlzLl9iZWZvcmVDb250ZW50UnVsZXMuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fYmVmb3JlQ29udGVudFJ1bGVzID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FmdGVyQ29udGVudFJ1bGVzKSB7XG5cdFx0XHR0aGlzLl9hZnRlckNvbnRlbnRSdWxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9hZnRlckNvbnRlbnRSdWxlcyA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX3N0eWxlU2hlZXQudW5yZWYoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgUHJvdmlkZXJBcmd1bWVudHMge1xuXHRzdHlsZVNoZWV0OiBHbG9iYWxTdHlsZVNoZWV0IHwgUmVmQ291bnRlZFN0eWxlU2hlZXQ7XG5cdGtleTogc3RyaW5nO1xuXHRwYXJlbnRUeXBlS2V5Pzogc3RyaW5nO1xuXHRvcHRpb25zOiBJRGVjb3JhdGlvblJlbmRlck9wdGlvbnM7XG59XG5cblxuY2xhc3MgRGVjb3JhdGlvblR5cGVPcHRpb25zUHJvdmlkZXIgaW1wbGVtZW50cyBJTW9kZWxEZWNvcmF0aW9uT3B0aW9uc1Byb3ZpZGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3R5bGVTaGVldDogR2xvYmFsU3R5bGVTaGVldCB8IFJlZkNvdW50ZWRTdHlsZVNoZWV0O1xuXHRwdWJsaWMgcmVmQ291bnQ6IG51bWJlcjtcblxuXHRwdWJsaWMgZGVzY3JpcHRpb246IHN0cmluZztcblx0cHVibGljIGNsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgaW5saW5lQ2xhc3NOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBpbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHVibGljIGJlZm9yZUNvbnRlbnRDbGFzc05hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGFmdGVyQ29udGVudENsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2x5cGhNYXJnaW5DbGFzc05hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGlzV2hvbGVMaW5lOiBib29sZWFuO1xuXHRwdWJsaWMgbGluZUhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZm9udFNpemU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGZvbnRGYW1pbHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGZvbnRXZWlnaHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGZvbnRTdHlsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgb3ZlcnZpZXdSdWxlcjogSU1vZGVsRGVjb3JhdGlvbk92ZXJ2aWV3UnVsZXJPcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgc3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGJlZm9yZUluamVjdGVkVGV4dDogSW5qZWN0ZWRUZXh0T3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGFmdGVySW5qZWN0ZWRUZXh0OiBJbmplY3RlZFRleHRPcHRpb25zIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGRlc2NyaXB0aW9uOiBzdHJpbmcsIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSwgc3R5bGVTaGVldDogR2xvYmFsU3R5bGVTaGVldCB8IFJlZkNvdW50ZWRTdHlsZVNoZWV0LCBwcm92aWRlckFyZ3M6IFByb3ZpZGVyQXJndW1lbnRzKSB7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xuXG5cdFx0dGhpcy5fc3R5bGVTaGVldCA9IHN0eWxlU2hlZXQ7XG5cdFx0dGhpcy5fc3R5bGVTaGVldC5yZWYoKTtcblx0XHR0aGlzLnJlZkNvdW50ID0gMDtcblxuXHRcdGNvbnN0IGNyZWF0ZUNTU1J1bGVzID0gKHR5cGU6IE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlKSA9PiB7XG5cdFx0XHRjb25zdCBydWxlcyA9IG5ldyBEZWNvcmF0aW9uQ1NTUnVsZXModHlwZSwgcHJvdmlkZXJBcmdzLCB0aGVtZVNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHJ1bGVzKTtcblx0XHRcdGlmIChydWxlcy5oYXNDb250ZW50KSB7XG5cdFx0XHRcdHJldHVybiBydWxlcy5jbGFzc05hbWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0Y29uc3QgY3JlYXRlSW5saW5lQ1NTUnVsZXMgPSAodHlwZTogTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUpID0+IHtcblx0XHRcdGNvbnN0IHJ1bGVzID0gbmV3IERlY29yYXRpb25DU1NSdWxlcyh0eXBlLCBwcm92aWRlckFyZ3MsIHRoZW1lU2VydmljZSk7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQocnVsZXMpO1xuXHRcdFx0aWYgKHJ1bGVzLmhhc0NvbnRlbnQpIHtcblx0XHRcdFx0cmV0dXJuIHsgY2xhc3NOYW1lOiBydWxlcy5jbGFzc05hbWUsIGhhc0xldHRlclNwYWNpbmc6IHJ1bGVzLmhhc0xldHRlclNwYWNpbmcgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH07XG5cblx0XHR0aGlzLmNsYXNzTmFtZSA9IGNyZWF0ZUNTU1J1bGVzKE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkNsYXNzTmFtZSk7XG5cdFx0Y29uc3QgaW5saW5lRGF0YSA9IGNyZWF0ZUlubGluZUNTU1J1bGVzKE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLklubGluZUNsYXNzTmFtZSk7XG5cdFx0aWYgKGlubGluZURhdGEpIHtcblx0XHRcdHRoaXMuaW5saW5lQ2xhc3NOYW1lID0gaW5saW5lRGF0YS5jbGFzc05hbWU7XG5cdFx0XHR0aGlzLmlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nID0gaW5saW5lRGF0YS5oYXNMZXR0ZXJTcGFjaW5nO1xuXHRcdH1cblx0XHR0aGlzLmJlZm9yZUNvbnRlbnRDbGFzc05hbWUgPSBjcmVhdGVDU1NSdWxlcyhNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZS5CZWZvcmVDb250ZW50Q2xhc3NOYW1lKTtcblx0XHR0aGlzLmFmdGVyQ29udGVudENsYXNzTmFtZSA9IGNyZWF0ZUNTU1J1bGVzKE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkFmdGVyQ29udGVudENsYXNzTmFtZSk7XG5cblx0XHRpZiAocHJvdmlkZXJBcmdzLm9wdGlvbnMuYmVmb3JlSW5qZWN0ZWRUZXh0ICYmIHByb3ZpZGVyQXJncy5vcHRpb25zLmJlZm9yZUluamVjdGVkVGV4dC5jb250ZW50VGV4dCkge1xuXHRcdFx0Y29uc3QgYmVmb3JlSW5saW5lRGF0YSA9IGNyZWF0ZUlubGluZUNTU1J1bGVzKE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkJlZm9yZUluamVjdGVkVGV4dENsYXNzTmFtZSk7XG5cdFx0XHR0aGlzLmJlZm9yZUluamVjdGVkVGV4dCA9IHtcblx0XHRcdFx0Y29udGVudDogcHJvdmlkZXJBcmdzLm9wdGlvbnMuYmVmb3JlSW5qZWN0ZWRUZXh0LmNvbnRlbnRUZXh0LFxuXHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6IGJlZm9yZUlubGluZURhdGE/LmNsYXNzTmFtZSxcblx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IGJlZm9yZUlubGluZURhdGE/Lmhhc0xldHRlclNwYWNpbmcgfHwgcHJvdmlkZXJBcmdzLm9wdGlvbnMuYmVmb3JlSW5qZWN0ZWRUZXh0LmFmZmVjdHNMZXR0ZXJTcGFjaW5nXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmIChwcm92aWRlckFyZ3Mub3B0aW9ucy5hZnRlckluamVjdGVkVGV4dCAmJiBwcm92aWRlckFyZ3Mub3B0aW9ucy5hZnRlckluamVjdGVkVGV4dC5jb250ZW50VGV4dCkge1xuXHRcdFx0Y29uc3QgYWZ0ZXJJbmxpbmVEYXRhID0gY3JlYXRlSW5saW5lQ1NTUnVsZXMoTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQWZ0ZXJJbmplY3RlZFRleHRDbGFzc05hbWUpO1xuXHRcdFx0dGhpcy5hZnRlckluamVjdGVkVGV4dCA9IHtcblx0XHRcdFx0Y29udGVudDogcHJvdmlkZXJBcmdzLm9wdGlvbnMuYWZ0ZXJJbmplY3RlZFRleHQuY29udGVudFRleHQsXG5cdFx0XHRcdGlubGluZUNsYXNzTmFtZTogYWZ0ZXJJbmxpbmVEYXRhPy5jbGFzc05hbWUsXG5cdFx0XHRcdGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiBhZnRlcklubGluZURhdGE/Lmhhc0xldHRlclNwYWNpbmcgfHwgcHJvdmlkZXJBcmdzLm9wdGlvbnMuYWZ0ZXJJbmplY3RlZFRleHQuYWZmZWN0c0xldHRlclNwYWNpbmdcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGhpcy5nbHlwaE1hcmdpbkNsYXNzTmFtZSA9IGNyZWF0ZUNTU1J1bGVzKE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkdseXBoTWFyZ2luQ2xhc3NOYW1lKTtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSBwcm92aWRlckFyZ3Mub3B0aW9ucztcblx0XHR0aGlzLmlzV2hvbGVMaW5lID0gQm9vbGVhbihvcHRpb25zLmlzV2hvbGVMaW5lKTtcblx0XHR0aGlzLmxpbmVIZWlnaHQgPSBvcHRpb25zLmxpbmVIZWlnaHQ7XG5cdFx0dGhpcy5mb250RmFtaWx5ID0gb3B0aW9ucy5mb250RmFtaWx5O1xuXHRcdHRoaXMuZm9udFNpemUgPSBvcHRpb25zLmZvbnRTaXplO1xuXHRcdHRoaXMuZm9udFdlaWdodCA9IG9wdGlvbnMuZm9udFdlaWdodDtcblx0XHR0aGlzLmZvbnRTdHlsZSA9IG9wdGlvbnMuZm9udFN0eWxlO1xuXHRcdHRoaXMuc3RpY2tpbmVzcyA9IG9wdGlvbnMucmFuZ2VCZWhhdmlvcjtcblxuXHRcdGNvbnN0IGxpZ2h0T3ZlcnZpZXdSdWxlckNvbG9yID0gb3B0aW9ucy5saWdodCAmJiBvcHRpb25zLmxpZ2h0Lm92ZXJ2aWV3UnVsZXJDb2xvciB8fCBvcHRpb25zLm92ZXJ2aWV3UnVsZXJDb2xvcjtcblx0XHRjb25zdCBkYXJrT3ZlcnZpZXdSdWxlckNvbG9yID0gb3B0aW9ucy5kYXJrICYmIG9wdGlvbnMuZGFyay5vdmVydmlld1J1bGVyQ29sb3IgfHwgb3B0aW9ucy5vdmVydmlld1J1bGVyQ29sb3I7XG5cdFx0aWYgKFxuXHRcdFx0dHlwZW9mIGxpZ2h0T3ZlcnZpZXdSdWxlckNvbG9yICE9PSAndW5kZWZpbmVkJ1xuXHRcdFx0fHwgdHlwZW9mIGRhcmtPdmVydmlld1J1bGVyQ29sb3IgIT09ICd1bmRlZmluZWQnXG5cdFx0KSB7XG5cdFx0XHR0aGlzLm92ZXJ2aWV3UnVsZXIgPSB7XG5cdFx0XHRcdGNvbG9yOiBsaWdodE92ZXJ2aWV3UnVsZXJDb2xvciB8fCBkYXJrT3ZlcnZpZXdSdWxlckNvbG9yLFxuXHRcdFx0XHRkYXJrQ29sb3I6IGRhcmtPdmVydmlld1J1bGVyQ29sb3IgfHwgbGlnaHRPdmVydmlld1J1bGVyQ29sb3IsXG5cdFx0XHRcdHBvc2l0aW9uOiBvcHRpb25zLm92ZXJ2aWV3UnVsZXJMYW5lIHx8IE92ZXJ2aWV3UnVsZXJMYW5lLkNlbnRlclxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0T3B0aW9ucyhjb2RlRWRpdG9yU2VydmljZTogQWJzdHJhY3RDb2RlRWRpdG9yU2VydmljZSwgd3JpdGFibGU6IGJvb2xlYW4pOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdFx0aWYgKCF3cml0YWJsZSkge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmRlc2NyaXB0aW9uLFxuXHRcdFx0aW5saW5lQ2xhc3NOYW1lOiB0aGlzLmlubGluZUNsYXNzTmFtZSxcblx0XHRcdGJlZm9yZUNvbnRlbnRDbGFzc05hbWU6IHRoaXMuYmVmb3JlQ29udGVudENsYXNzTmFtZSxcblx0XHRcdGFmdGVyQ29udGVudENsYXNzTmFtZTogdGhpcy5hZnRlckNvbnRlbnRDbGFzc05hbWUsXG5cdFx0XHRjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lLFxuXHRcdFx0Z2x5cGhNYXJnaW5DbGFzc05hbWU6IHRoaXMuZ2x5cGhNYXJnaW5DbGFzc05hbWUsXG5cdFx0XHRpc1dob2xlTGluZTogdGhpcy5pc1dob2xlTGluZSxcblx0XHRcdGxpbmVIZWlnaHQ6IHRoaXMubGluZUhlaWdodCxcblx0XHRcdGZvbnRGYW1pbHk6IHRoaXMuZm9udEZhbWlseSxcblx0XHRcdGZvbnRTaXplOiB0aGlzLmZvbnRTaXplLFxuXHRcdFx0Zm9udFdlaWdodDogdGhpcy5mb250V2VpZ2h0LFxuXHRcdFx0Zm9udFN0eWxlOiB0aGlzLmZvbnRTdHlsZSxcblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHRoaXMub3ZlcnZpZXdSdWxlcixcblx0XHRcdHN0aWNraW5lc3M6IHRoaXMuc3RpY2tpbmVzcyxcblx0XHRcdGJlZm9yZTogdGhpcy5iZWZvcmVJbmplY3RlZFRleHQsXG5cdFx0XHRhZnRlcjogdGhpcy5hZnRlckluamVjdGVkVGV4dFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZURlY29yYXRpb25DU1NSdWxlcygpOiBDU1NSdWxlTGlzdCB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0eWxlU2hlZXQuc2hlZXQucnVsZXM7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc3R5bGVTaGVldC51bnJlZigpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNvbnN0IF9DU1NfTUFQOiB7IFtwcm9wOiBzdHJpbmddOiBzdHJpbmcgfSA9IHtcblx0Y29sb3I6ICdjb2xvcjp7MH0gIWltcG9ydGFudDsnLFxuXHRvcGFjaXR5OiAnb3BhY2l0eTp7MH07Jyxcblx0YmFja2dyb3VuZENvbG9yOiAnYmFja2dyb3VuZC1jb2xvcjp7MH07JyxcblxuXHRvdXRsaW5lOiAnb3V0bGluZTp7MH07Jyxcblx0b3V0bGluZUNvbG9yOiAnb3V0bGluZS1jb2xvcjp7MH07Jyxcblx0b3V0bGluZVN0eWxlOiAnb3V0bGluZS1zdHlsZTp7MH07Jyxcblx0b3V0bGluZVdpZHRoOiAnb3V0bGluZS13aWR0aDp7MH07JyxcblxuXHRib3JkZXI6ICdib3JkZXI6ezB9OycsXG5cdGJvcmRlckNvbG9yOiAnYm9yZGVyLWNvbG9yOnswfTsnLFxuXHRib3JkZXJSYWRpdXM6ICdib3JkZXItcmFkaXVzOnswfTsnLFxuXHRib3JkZXJTcGFjaW5nOiAnYm9yZGVyLXNwYWNpbmc6ezB9OycsXG5cdGJvcmRlclN0eWxlOiAnYm9yZGVyLXN0eWxlOnswfTsnLFxuXHRib3JkZXJXaWR0aDogJ2JvcmRlci13aWR0aDp7MH07JyxcblxuXHRmb250U3R5bGU6ICdmb250LXN0eWxlOnswfTsnLFxuXHRmb250V2VpZ2h0OiAnZm9udC13ZWlnaHQ6ezB9OycsXG5cdGZvbnRTaXplOiAnZm9udC1zaXplOnswfTsnLFxuXHRmb250RmFtaWx5OiAnZm9udC1mYW1pbHk6ezB9OycsXG5cdHRleHREZWNvcmF0aW9uOiAndGV4dC1kZWNvcmF0aW9uOnswfTsnLFxuXHRjdXJzb3I6ICdjdXJzb3I6ezB9OycsXG5cdGxldHRlclNwYWNpbmc6ICdsZXR0ZXItc3BhY2luZzp7MH07JyxcblxuXHRndXR0ZXJJY29uUGF0aDogJ2JhY2tncm91bmQ6ezB9IGNlbnRlciBjZW50ZXIgbm8tcmVwZWF0OycsXG5cdGd1dHRlckljb25TaXplOiAnYmFja2dyb3VuZC1zaXplOnswfTsnLFxuXG5cdGNvbnRlbnRUZXh0OiAnY29udGVudDpcXCd7MH1cXCc7Jyxcblx0Y29udGVudEljb25QYXRoOiAnY29udGVudDp7MH07Jyxcblx0bWFyZ2luOiAnbWFyZ2luOnswfTsnLFxuXHRwYWRkaW5nOiAncGFkZGluZzp7MH07Jyxcblx0d2lkdGg6ICd3aWR0aDp7MH07Jyxcblx0aGVpZ2h0OiAnaGVpZ2h0OnswfTsnLFxuXG5cdHZlcnRpY2FsQWxpZ246ICd2ZXJ0aWNhbC1hbGlnbjp7MH07Jyxcbn07XG5cblxuY2xhc3MgRGVjb3JhdGlvbkNTU1J1bGVzIHtcblxuXHRwcml2YXRlIF90aGVtZTogSUNvbG9yVGhlbWU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsYXNzTmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91blRoZW1lZFNlbGVjdG9yOiBzdHJpbmc7XG5cdHByaXZhdGUgX2hhc0NvbnRlbnQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2hhc0xldHRlclNwYWNpbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3J1bGVUeXBlOiBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZTtcblx0cHJpdmF0ZSBfdGhlbWVMaXN0ZW5lcjogSURpc3Bvc2FibGUgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlckFyZ3M6IFByb3ZpZGVyQXJndW1lbnRzO1xuXHRwcml2YXRlIF91c2VzVGhlbWVDb2xvcnM6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IocnVsZVR5cGU6IE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLCBwcm92aWRlckFyZ3M6IFByb3ZpZGVyQXJndW1lbnRzLCB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UpIHtcblx0XHR0aGlzLl90aGVtZSA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0dGhpcy5fcnVsZVR5cGUgPSBydWxlVHlwZTtcblx0XHR0aGlzLl9wcm92aWRlckFyZ3MgPSBwcm92aWRlckFyZ3M7XG5cdFx0dGhpcy5fdXNlc1RoZW1lQ29sb3JzID0gZmFsc2U7XG5cdFx0dGhpcy5faGFzQ29udGVudCA9IGZhbHNlO1xuXHRcdHRoaXMuX2hhc0xldHRlclNwYWNpbmcgPSBmYWxzZTtcblxuXHRcdGxldCBjbGFzc05hbWUgPSBDU1NOYW1lSGVscGVyLmdldENsYXNzTmFtZSh0aGlzLl9wcm92aWRlckFyZ3Mua2V5LCBydWxlVHlwZSk7XG5cdFx0aWYgKHRoaXMuX3Byb3ZpZGVyQXJncy5wYXJlbnRUeXBlS2V5KSB7XG5cdFx0XHRjbGFzc05hbWUgPSBjbGFzc05hbWUgKyAnICcgKyBDU1NOYW1lSGVscGVyLmdldENsYXNzTmFtZSh0aGlzLl9wcm92aWRlckFyZ3MucGFyZW50VHlwZUtleSwgcnVsZVR5cGUpO1xuXHRcdH1cblx0XHR0aGlzLl9jbGFzc05hbWUgPSBjbGFzc05hbWU7XG5cblx0XHR0aGlzLl91blRoZW1lZFNlbGVjdG9yID0gQ1NTTmFtZUhlbHBlci5nZXRTZWxlY3Rvcih0aGlzLl9wcm92aWRlckFyZ3Mua2V5LCB0aGlzLl9wcm92aWRlckFyZ3MucGFyZW50VHlwZUtleSwgcnVsZVR5cGUpO1xuXG5cdFx0dGhpcy5fYnVpbGRDU1MoKTtcblxuXHRcdGlmICh0aGlzLl91c2VzVGhlbWVDb2xvcnMpIHtcblx0XHRcdHRoaXMuX3RoZW1lTGlzdGVuZXIgPSB0aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHRoZW1lID0+IHtcblx0XHRcdFx0dGhpcy5fdGhlbWUgPSB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVDU1MoKTtcblx0XHRcdFx0dGhpcy5fYnVpbGRDU1MoKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90aGVtZUxpc3RlbmVyID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHRpZiAodGhpcy5faGFzQ29udGVudCkge1xuXHRcdFx0dGhpcy5fcmVtb3ZlQ1NTKCk7XG5cdFx0XHR0aGlzLl9oYXNDb250ZW50ID0gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90aGVtZUxpc3RlbmVyKSB7XG5cdFx0XHR0aGlzLl90aGVtZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3RoZW1lTGlzdGVuZXIgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgaGFzQ29udGVudCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGFzQ29udGVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaGFzTGV0dGVyU3BhY2luZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGFzTGV0dGVyU3BhY2luZztcblx0fVxuXG5cdHB1YmxpYyBnZXQgY2xhc3NOYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NsYXNzTmFtZTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkQ1NTKCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9wcm92aWRlckFyZ3Mub3B0aW9ucztcblx0XHRsZXQgdW50aGVtZWRDU1M6IHN0cmluZywgbGlnaHRDU1M6IHN0cmluZywgZGFya0NTUzogc3RyaW5nO1xuXHRcdHN3aXRjaCAodGhpcy5fcnVsZVR5cGUpIHtcblx0XHRcdGNhc2UgTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQ2xhc3NOYW1lOlxuXHRcdFx0XHR1bnRoZW1lZENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNsYXNzTmFtZShvcHRpb25zKTtcblx0XHRcdFx0bGlnaHRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25DbGFzc05hbWUob3B0aW9ucy5saWdodCk7XG5cdFx0XHRcdGRhcmtDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25DbGFzc05hbWUob3B0aW9ucy5kYXJrKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLklubGluZUNsYXNzTmFtZTpcblx0XHRcdFx0dW50aGVtZWRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25JbmxpbmVDbGFzc05hbWUob3B0aW9ucyk7XG5cdFx0XHRcdGxpZ2h0Q1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uSW5saW5lQ2xhc3NOYW1lKG9wdGlvbnMubGlnaHQpO1xuXHRcdFx0XHRkYXJrQ1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uSW5saW5lQ2xhc3NOYW1lKG9wdGlvbnMuZGFyayk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZS5HbHlwaE1hcmdpbkNsYXNzTmFtZTpcblx0XHRcdFx0dW50aGVtZWRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25HbHlwaE1hcmdpbkNsYXNzTmFtZShvcHRpb25zKTtcblx0XHRcdFx0bGlnaHRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25HbHlwaE1hcmdpbkNsYXNzTmFtZShvcHRpb25zLmxpZ2h0KTtcblx0XHRcdFx0ZGFya0NTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkdseXBoTWFyZ2luQ2xhc3NOYW1lKG9wdGlvbnMuZGFyayk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZS5CZWZvcmVDb250ZW50Q2xhc3NOYW1lOlxuXHRcdFx0XHR1bnRoZW1lZENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0aW9ucy5iZWZvcmUpO1xuXHRcdFx0XHRsaWdodENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0aW9ucy5saWdodCAmJiBvcHRpb25zLmxpZ2h0LmJlZm9yZSk7XG5cdFx0XHRcdGRhcmtDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25Db250ZW50Q2xhc3NOYW1lKG9wdGlvbnMuZGFyayAmJiBvcHRpb25zLmRhcmsuYmVmb3JlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkFmdGVyQ29udGVudENsYXNzTmFtZTpcblx0XHRcdFx0dW50aGVtZWRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25Db250ZW50Q2xhc3NOYW1lKG9wdGlvbnMuYWZ0ZXIpO1xuXHRcdFx0XHRsaWdodENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0aW9ucy5saWdodCAmJiBvcHRpb25zLmxpZ2h0LmFmdGVyKTtcblx0XHRcdFx0ZGFya0NTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0aW9ucy5kYXJrICYmIG9wdGlvbnMuZGFyay5hZnRlcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZS5CZWZvcmVJbmplY3RlZFRleHRDbGFzc05hbWU6XG5cdFx0XHRcdHVudGhlbWVkQ1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ29udGVudENsYXNzTmFtZShvcHRpb25zLmJlZm9yZUluamVjdGVkVGV4dCk7XG5cdFx0XHRcdGxpZ2h0Q1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ29udGVudENsYXNzTmFtZShvcHRpb25zLmxpZ2h0ICYmIG9wdGlvbnMubGlnaHQuYmVmb3JlSW5qZWN0ZWRUZXh0KTtcblx0XHRcdFx0ZGFya0NTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0aW9ucy5kYXJrICYmIG9wdGlvbnMuZGFyay5iZWZvcmVJbmplY3RlZFRleHQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQWZ0ZXJJbmplY3RlZFRleHRDbGFzc05hbWU6XG5cdFx0XHRcdHVudGhlbWVkQ1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ29udGVudENsYXNzTmFtZShvcHRpb25zLmFmdGVySW5qZWN0ZWRUZXh0KTtcblx0XHRcdFx0bGlnaHRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25Db250ZW50Q2xhc3NOYW1lKG9wdGlvbnMubGlnaHQgJiYgb3B0aW9ucy5saWdodC5hZnRlckluamVjdGVkVGV4dCk7XG5cdFx0XHRcdGRhcmtDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25Db250ZW50Q2xhc3NOYW1lKG9wdGlvbnMuZGFyayAmJiBvcHRpb25zLmRhcmsuYWZ0ZXJJbmplY3RlZFRleHQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBydWxlIHR5cGU6ICcgKyB0aGlzLl9ydWxlVHlwZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHNoZWV0ID0gdGhpcy5fcHJvdmlkZXJBcmdzLnN0eWxlU2hlZXQ7XG5cblx0XHRsZXQgaGFzQ29udGVudCA9IGZhbHNlO1xuXHRcdGlmICh1bnRoZW1lZENTUy5sZW5ndGggPiAwKSB7XG5cdFx0XHRzaGVldC5pbnNlcnRSdWxlKHRoaXMuX3VuVGhlbWVkU2VsZWN0b3IsIHVudGhlbWVkQ1NTKTtcblx0XHRcdGhhc0NvbnRlbnQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAobGlnaHRDU1MubGVuZ3RoID4gMCkge1xuXHRcdFx0c2hlZXQuaW5zZXJ0UnVsZShgLnZzJHt0aGlzLl91blRoZW1lZFNlbGVjdG9yfSwgLmhjLWxpZ2h0JHt0aGlzLl91blRoZW1lZFNlbGVjdG9yfWAsIGxpZ2h0Q1NTKTtcblx0XHRcdGhhc0NvbnRlbnQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoZGFya0NTUy5sZW5ndGggPiAwKSB7XG5cdFx0XHRzaGVldC5pbnNlcnRSdWxlKGAudnMtZGFyayR7dGhpcy5fdW5UaGVtZWRTZWxlY3Rvcn0sIC5oYy1ibGFjayR7dGhpcy5fdW5UaGVtZWRTZWxlY3Rvcn1gLCBkYXJrQ1NTKTtcblx0XHRcdGhhc0NvbnRlbnQgPSB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLl9oYXNDb250ZW50ID0gaGFzQ29udGVudDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUNTUygpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm92aWRlckFyZ3Muc3R5bGVTaGVldC5yZW1vdmVSdWxlc0NvbnRhaW5pbmdTZWxlY3Rvcih0aGlzLl91blRoZW1lZFNlbGVjdG9yKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgQ1NTIGZvciBkZWNvcmF0aW9ucyBzdHlsZWQgdmlhIGBjbGFzc05hbWVgLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ2xhc3NOYW1lKG9wdHM6IElUaGVtZURlY29yYXRpb25SZW5kZXJPcHRpb25zIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAoIW9wdHMpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgY3NzVGV4dEFycjogc3RyaW5nW10gPSBbXTtcblx0XHR0aGlzLmNvbGxlY3RDU1NUZXh0KG9wdHMsIFsnYmFja2dyb3VuZENvbG9yJ10sIGNzc1RleHRBcnIpO1xuXHRcdHRoaXMuY29sbGVjdENTU1RleHQob3B0cywgWydvdXRsaW5lJywgJ291dGxpbmVDb2xvcicsICdvdXRsaW5lU3R5bGUnLCAnb3V0bGluZVdpZHRoJ10sIGNzc1RleHRBcnIpO1xuXHRcdHRoaXMuY29sbGVjdEJvcmRlclNldHRpbmdzQ1NTVGV4dChvcHRzLCBjc3NUZXh0QXJyKTtcblx0XHRyZXR1cm4gY3NzVGV4dEFyci5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgQ1NTIGZvciBkZWNvcmF0aW9ucyBzdHlsZWQgdmlhIGBpbmxpbmVDbGFzc05hbWVgLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uSW5saW5lQ2xhc3NOYW1lKG9wdHM6IElUaGVtZURlY29yYXRpb25SZW5kZXJPcHRpb25zIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAoIW9wdHMpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Y29uc3QgY3NzVGV4dEFycjogc3RyaW5nW10gPSBbXTtcblx0XHR0aGlzLmNvbGxlY3RDU1NUZXh0KG9wdHMsIFsnZm9udFN0eWxlJywgJ2ZvbnRXZWlnaHQnLCAnZm9udEZhbWlseScsICdmb250U2l6ZScsICd0ZXh0RGVjb3JhdGlvbicsICdjdXJzb3InLCAnY29sb3InLCAnb3BhY2l0eScsICdsZXR0ZXJTcGFjaW5nJ10sIGNzc1RleHRBcnIpO1xuXHRcdGlmIChvcHRzLmxldHRlclNwYWNpbmcpIHtcblx0XHRcdHRoaXMuX2hhc0xldHRlclNwYWNpbmcgPSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gY3NzVGV4dEFyci5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgQ1NTIGZvciBkZWNvcmF0aW9ucyBzdHlsZWQgYmVmb3JlIG9yIGFmdGVyIGNvbnRlbnQuXG5cdCAqL1xuXHRwcml2YXRlIGdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25Db250ZW50Q2xhc3NOYW1lKG9wdHM6IElDb250ZW50RGVjb3JhdGlvblJlbmRlck9wdGlvbnMgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmICghb3B0cykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCBjc3NUZXh0QXJyOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0aWYgKHR5cGVvZiBvcHRzICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5jb2xsZWN0Qm9yZGVyU2V0dGluZ3NDU1NUZXh0KG9wdHMsIGNzc1RleHRBcnIpO1xuXHRcdFx0aWYgKHR5cGVvZiBvcHRzLmNvbnRlbnRJY29uUGF0aCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0Y3NzVGV4dEFyci5wdXNoKHN0cmluZ3MuZm9ybWF0KF9DU1NfTUFQLmNvbnRlbnRJY29uUGF0aCwgY3NzSnMuYXNDU1NVcmwoVVJJLnJldml2ZShvcHRzLmNvbnRlbnRJY29uUGF0aCkpKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIG9wdHMuY29udGVudFRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IHRydW5jYXRlZCA9IG9wdHMuY29udGVudFRleHQubWF0Y2goL14uKiQvbSkhWzBdOyAvLyBvbmx5IHRha2UgZmlyc3QgbGluZVxuXHRcdFx0XHRjb25zdCBlc2NhcGVkID0gdHJ1bmNhdGVkLnJlcGxhY2UoL1snXFxcXF0vZywgJ1xcXFwkJicpO1xuXG5cdFx0XHRcdGNzc1RleHRBcnIucHVzaChzdHJpbmdzLmZvcm1hdChfQ1NTX01BUC5jb250ZW50VGV4dCwgZXNjYXBlZCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb2xsZWN0Q1NTVGV4dChvcHRzLCBbJ3ZlcnRpY2FsQWxpZ24nLCAnZm9udFN0eWxlJywgJ2ZvbnRXZWlnaHQnLCAnZm9udFNpemUnLCAnZm9udEZhbWlseScsICd0ZXh0RGVjb3JhdGlvbicsICdjb2xvcicsICdvcGFjaXR5JywgJ2JhY2tncm91bmRDb2xvcicsICdtYXJnaW4nLCAncGFkZGluZyddLCBjc3NUZXh0QXJyKTtcblx0XHRcdGlmICh0aGlzLmNvbGxlY3RDU1NUZXh0KG9wdHMsIFsnd2lkdGgnLCAnaGVpZ2h0J10sIGNzc1RleHRBcnIpKSB7XG5cdFx0XHRcdGNzc1RleHRBcnIucHVzaCgnZGlzcGxheTppbmxpbmUtYmxvY2s7Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNzc1RleHRBcnIuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIENTUyBmb3IgZGVjb3JhdGlvbnMgc3R5bGVkIHZpYSBgZ2x5cGhNYXJnaW5DbGFzc05hbWVgLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uR2x5cGhNYXJnaW5DbGFzc05hbWUob3B0czogSVRoZW1lRGVjb3JhdGlvblJlbmRlck9wdGlvbnMgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmICghb3B0cykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCBjc3NUZXh0QXJyOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0aWYgKHR5cGVvZiBvcHRzLmd1dHRlckljb25QYXRoICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y3NzVGV4dEFyci5wdXNoKHN0cmluZ3MuZm9ybWF0KF9DU1NfTUFQLmd1dHRlckljb25QYXRoLCBjc3NKcy5hc0NTU1VybChVUkkucmV2aXZlKG9wdHMuZ3V0dGVySWNvblBhdGgpKSkpO1xuXHRcdFx0aWYgKHR5cGVvZiBvcHRzLmd1dHRlckljb25TaXplICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRjc3NUZXh0QXJyLnB1c2goc3RyaW5ncy5mb3JtYXQoX0NTU19NQVAuZ3V0dGVySWNvblNpemUsIG9wdHMuZ3V0dGVySWNvblNpemUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY3NzVGV4dEFyci5qb2luKCcnKTtcblx0fVxuXG5cdHByaXZhdGUgY29sbGVjdEJvcmRlclNldHRpbmdzQ1NTVGV4dChvcHRzOiB1bmtub3duLCBjc3NUZXh0QXJyOiBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmNvbGxlY3RDU1NUZXh0KG9wdHMsIFsnYm9yZGVyJywgJ2JvcmRlckNvbG9yJywgJ2JvcmRlclJhZGl1cycsICdib3JkZXJTcGFjaW5nJywgJ2JvcmRlclN0eWxlJywgJ2JvcmRlcldpZHRoJ10sIGNzc1RleHRBcnIpKSB7XG5cdFx0XHRjc3NUZXh0QXJyLnB1c2goc3RyaW5ncy5mb3JtYXQoJ2JveC1zaXppbmc6IGJvcmRlci1ib3g7JykpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgY29sbGVjdENTU1RleHQob3B0czogdW5rbm93biwgcHJvcGVydGllczogc3RyaW5nW10sIGNzc1RleHRBcnI6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbGVuQmVmb3JlID0gY3NzVGV4dEFyci5sZW5ndGg7XG5cdFx0Zm9yIChjb25zdCBwcm9wZXJ0eSBvZiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMucmVzb2x2ZVZhbHVlKChvcHRzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtwcm9wZXJ0eV0gYXMgc3RyaW5nIHwgVGhlbWVDb2xvcik7XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjc3NUZXh0QXJyLnB1c2goc3RyaW5ncy5mb3JtYXQoX0NTU19NQVBbcHJvcGVydHldLCB2YWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY3NzVGV4dEFyci5sZW5ndGggIT09IGxlbkJlZm9yZTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZVZhbHVlKHZhbHVlOiBzdHJpbmcgfCBUaGVtZUNvbG9yKTogc3RyaW5nIHtcblx0XHRpZiAoaXNUaGVtZUNvbG9yKHZhbHVlKSkge1xuXHRcdFx0dGhpcy5fdXNlc1RoZW1lQ29sb3JzID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGNvbG9yID0gdGhpcy5fdGhlbWUuZ2V0Q29sb3IodmFsdWUuaWQpO1xuXHRcdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHRcdHJldHVybiBjb2xvci50b1N0cmluZygpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuICd0cmFuc3BhcmVudCc7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG5jb25zdCBlbnVtIE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlIHtcblx0Q2xhc3NOYW1lID0gMCxcblx0SW5saW5lQ2xhc3NOYW1lID0gMSxcblx0R2x5cGhNYXJnaW5DbGFzc05hbWUgPSAyLFxuXHRCZWZvcmVDb250ZW50Q2xhc3NOYW1lID0gMyxcblx0QWZ0ZXJDb250ZW50Q2xhc3NOYW1lID0gNCxcblx0QmVmb3JlSW5qZWN0ZWRUZXh0Q2xhc3NOYW1lID0gNSxcblx0QWZ0ZXJJbmplY3RlZFRleHRDbGFzc05hbWUgPSA2LFxufVxuXG5jbGFzcyBDU1NOYW1lSGVscGVyIHtcblxuXHRwdWJsaWMgc3RhdGljIGdldENsYXNzTmFtZShrZXk6IHN0cmluZywgdHlwZTogTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnY2VkLScgKyBrZXkgKyAnLScgKyB0eXBlO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXRTZWxlY3RvcihrZXk6IHN0cmluZywgcGFyZW50S2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsIHJ1bGVUeXBlOiBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZSk6IHN0cmluZyB7XG5cdFx0bGV0IHNlbGVjdG9yID0gJy5tb25hY28tZWRpdG9yIC4nICsgdGhpcy5nZXRDbGFzc05hbWUoa2V5LCBydWxlVHlwZSk7XG5cdFx0aWYgKHBhcmVudEtleSkge1xuXHRcdFx0c2VsZWN0b3IgPSBzZWxlY3RvciArICcuJyArIHRoaXMuZ2V0Q2xhc3NOYW1lKHBhcmVudEtleSwgcnVsZVR5cGUpO1xuXHRcdH1cblx0XHRpZiAocnVsZVR5cGUgPT09IE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkJlZm9yZUNvbnRlbnRDbGFzc05hbWUpIHtcblx0XHRcdHNlbGVjdG9yICs9ICc6OmJlZm9yZSc7XG5cdFx0fSBlbHNlIGlmIChydWxlVHlwZSA9PT0gTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQWZ0ZXJDb250ZW50Q2xhc3NOYW1lKSB7XG5cdFx0XHRzZWxlY3RvciArPSAnOjphZnRlcic7XG5cdFx0fVxuXHRcdHJldHVybiBzZWxlY3Rvcjtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxvQkFBb0I7QUFDaEMsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsZUFBc0I7QUFDL0IsU0FBc0IsaUJBQWlCLFlBQVksY0FBYyxxQkFBcUI7QUFDdEYsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsV0FBVztBQUdwQixTQUFtRyxvQkFBb0I7QUFDdkgsU0FBeUcseUJBQWlEO0FBRTFKLFNBQXNCLHFCQUFxQjtBQUdwQyxJQUFlLDRCQUFmLGNBQWlELFdBQXlDO0FBQUEsRUFtQ2hHLFlBQ2lDLGVBQy9CO0FBQ0QsVUFBTTtBQUYwQjtBQWhDakMsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUM3RSxTQUFnQix5QkFBeUIsS0FBSyx3QkFBd0I7QUFFdEUsU0FBaUIsbUJBQXlDLEtBQUssVUFBVSxJQUFJLFFBQXFCLENBQUM7QUFDbkcsU0FBZ0Isa0JBQXNDLEtBQUssaUJBQWlCO0FBRTVFLFNBQWlCLHNCQUE0QyxLQUFLLFVBQVUsSUFBSSxRQUFxQixDQUFDO0FBQ3RHLFNBQWdCLHFCQUF5QyxLQUFLLG9CQUFvQjtBQUVsRixTQUFpQiwwQkFBMEIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzdFLFNBQWdCLHlCQUF5QixLQUFLLHdCQUF3QjtB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QWEsR0FBRyxVQUFVLEdBQUc7QUFDcEksaUJBQVcsS0FBSyxRQUFRLE9BQU8seUJBQXlCLENBQUM7QUFDekQsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZUFBZSxNQUFlLFlBQXNCLFlBQStCO0FBQzFGLFVBQU0sWUFBWSxXQUFXO0FBQzdCLGVBQVcsWUFBWSxZQUFZO0FBQ2xDLFlBQU0sUUFBUSxLQUFLLGFBQWMsS0FBaUMsUUFBUSxDQUF3QjtBQUNsRyxVQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLG1CQUFXLEtBQUssUUFBUSxPQUFPLFNBQVMsUUFBUSxHQUFHLEtBQUssQ0FBQztBQUFBLE1BQzFEO0FBQUEsSUFDRDtBQUNBLFdBQU8sV0FBVyxXQUFXO0FBQUEsRUFDOUI7QUFBQSxFQUVRLGFBQWEsT0FBb0M7QUFDeEQsUUFBSSxhQUFhLEtBQUssR0FBRztBQUN4QixXQUFLLG1CQUFtQjtBQUN4QixZQUFNLFFBQVEsS0FBSyxPQUFPLFNBQVMsTUFBTSxFQUFFO0FBQzNDLFVBQUksT0FBTztBQUNWLGVBQU8sTUFBTSxTQUFTO0FBQUEsTUFDdkI7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxJQUFXLDZCQUFYLGtCQUFXQSxnQ0FBWDtBQUNDLEVBQUFBLHdEQUFBLGVBQVksS0FBWjtBQUNBLEVBQUFBLHdEQUFBLHFCQUFrQixLQUFsQjtBQUNBLEVBQUFBLHdEQUFBLDBCQUF1QixLQUF2QjtBQUNBLEVBQUFBLHdEQUFBLDRCQUF5QixLQUF6QjtBQUNBLEVBQUFBLHdEQUFBLDJCQUF3QixLQUF4QjtBQUNBLEVBQUFBLHdEQUFBLGlDQUE4QixLQUE5QjtBQUNBLEVBQUFBLHdEQUFBLGdDQUE2QixLQUE3QjtBQVBVLFNBQUFBO0FBQUEsR0FBQTtBQVVYLE1BQU0sY0FBYztBQUFBLEVBRW5CLE9BQWMsYUFBYSxLQUFhLE1BQTBDO0FBQ2pGLFdBQU8sU0FBUyxNQUFNLE1BQU07QUFBQSxFQUM3QjtBQUFBLEVBRUEsT0FBYyxZQUFZLEtBQWEsV0FBK0IsVUFBOEM7QUFDbkgsUUFBSSxXQUFXLHFCQUFxQixLQUFLLGFBQWEsS0FBSyxRQUFRO0FBQ25FLFFBQUksV0FBVztBQUNkLGlCQUFXLFdBQVcsTUFBTSxLQUFLLGFBQWEsV0FBVyxRQUFRO0FBQUEsSUFDbEU7QUFDQSxRQUFJLGFBQWEsZ0NBQW1EO0FBQ25FLGtCQUFZO0FBQUEsSUFDYixXQUFXLGFBQWEsK0JBQWtEO0FBQ3pFLGtCQUFZO0FBQUEsSUFDYjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbIk1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlIl0KfQo=
