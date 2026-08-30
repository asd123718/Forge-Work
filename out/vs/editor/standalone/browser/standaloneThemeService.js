import * as dom from "../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../base/browser/domStylesheets.js";
import { addMatchMediaChangeListener } from "../../../base/browser/browser.js";
import { Color } from "../../../base/common/color.js";
import { Emitter } from "../../../base/common/event.js";
import { TokenizationRegistry } from "../../common/languages.js";
import { FontStyle, TokenMetadata } from "../../common/encodedTokenAttributes.js";
import { TokenTheme, generateTokensCSSForColorMap } from "../../common/languages/supports/tokenization.js";
import { hc_black, hc_light, vs, vs_dark } from "../common/themes.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { asCssVariableName, Extensions } from "../../../platform/theme/common/colorRegistry.js";
import { Extensions as ThemingExtensions } from "../../../platform/theme/common/themeService.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ColorScheme, isDark, isHighContrast } from "../../../platform/theme/common/theme.js";
import { getIconsStyleSheet, UnthemedProductIconTheme } from "../../../platform/theme/browser/iconsStyleSheet.js";
import { mainWindow } from "../../../base/browser/window.js";
const VS_LIGHT_THEME_NAME = "vs";
const VS_DARK_THEME_NAME = "vs-dark";
const HC_BLACK_THEME_NAME = "hc-black";
const HC_LIGHT_THEME_NAME = "hc-light";
const colorRegistry = Registry.as(Extensions.ColorContribution);
const themingRegistry = Registry.as(ThemingExtensions.ThemingContribution);
class StandaloneTheme {
  constructor(name, standaloneThemeData) {
    this.semanticHighlighting = false;
    this.themeData = standaloneThemeData;
    const base = standaloneThemeData.base;
    if (name.length > 0) {
      if (isBuiltinTheme(name)) {
        this.id = name;
      } else {
        this.id = base + " " + name;
      }
      this.themeName = name;
    } else {
      this.id = base;
      this.themeName = base;
    }
    this.colors = null;
    this.defaultColors = /* @__PURE__ */ Object.create(null);
    this._tokenTheme = null;
  }
  get label() {
    return this.themeName;
  }
  get base() {
    return this.themeData.base;
  }
  notifyBaseUpdated() {
    if (this.themeData.inherit) {
      this.colors = null;
      this._tokenTheme = null;
    }
  }
  getColors() {
    if (!this.colors) {
      const colors = /* @__PURE__ */ new Map();
      for (const id in this.themeData.colors) {
        colors.set(id, Color.fromHex(this.themeData.colors[id]));
      }
      if (this.themeData.inherit) {
        const baseData = getBuiltinRules(this.themeData.base);
        for (const id in baseData.colors) {
          if (!colors.has(id)) {
            colors.set(id, Color.fromHex(baseData.colors[id]));
          }
        }
      }
      this.colors = colors;
    }
    return this.colors;
  }
  getColor(colorId, useDefault) {
    const color = this.getColors().get(colorId);
    if (color) {
      return color;
    }
    if (useDefault !== false) {
      return this.getDefault(colorId);
    }
    return void 0;
  }
  getDefault(colorId) {
    let color = this.defaultColors[colorId];
    if (color) {
      return color;
    }
    color = colorRegistry.resolveDefaultColor(colorId, this);
    this.defaultColors[colorId] = color;
    return color;
  }
  defines(colorId) {
    return this.getColors().has(colorId);
  }
  get type() {
    switch (this.base) {
      case VS_LIGHT_THEME_NAME:
        return ColorScheme.LIGHT;
      case HC_BLACK_THEME_NAME:
        return ColorScheme.HIGH_CONTRAST_DARK;
      case HC_LIGHT_THEME_NAME:
        return ColorScheme.HIGH_CONTRAST_LIGHT;
      default:
        return ColorScheme.DARK;
    }
  }
  get tokenTheme() {
    if (!this._tokenTheme) {
      let rules = [];
      let encodedTokensColors = [];
      if (this.themeData.inherit) {
        const baseData = getBuiltinRules(this.themeData.base);
        rules = baseData.rules;
        if (baseData.encodedTokensColors) {
          encodedTokensColors = baseData.encodedTokensColors;
        }
      }
      const editorForeground = this.themeData.colors["editor.foreground"];
      const editorBackground = this.themeData.colors["editor.background"];
      if (editorForeground || editorBackground) {
        const rule = { token: "" };
        if (editorForeground) {
          rule.foreground = editorForeground;
        }
        if (editorBackground) {
          rule.background = editorBackground;
        }
        rules.push(rule);
      }
      rules = rules.concat(this.themeData.rules);
      if (this.themeData.encodedTokensColors) {
        encodedTokensColors = this.themeData.encodedTokensColors;
      }
      this._tokenTheme = TokenTheme.createFromRawTokenTheme(rules, encodedTokensColors);
    }
    return this._tokenTheme;
  }
  getTokenStyleMetadata(type, modifiers, modelLanguage) {
    const style = this.tokenTheme._match([type].concat(modifiers).join("."));
    const metadata = style.metadata;
    const foreground = TokenMetadata.getForeground(metadata);
    const fontStyle = TokenMetadata.getFontStyle(metadata);
    return {
      foreground,
      italic: Boolean(fontStyle & FontStyle.Italic),
      bold: Boolean(fontStyle & FontStyle.Bold),
      underline: Boolean(fontStyle & FontStyle.Underline),
      strikethrough: Boolean(fontStyle & FontStyle.Strikethrough)
    };
  }
  get tokenColorMap() {
    return [];
  }
  get tokenFontMap() {
    return [];
  }
}
function isBuiltinTheme(themeName) {
  return themeName === VS_LIGHT_THEME_NAME || themeName === VS_DARK_THEME_NAME || themeName === HC_BLACK_THEME_NAME || themeName === HC_LIGHT_THEME_NAME;
}
function getBuiltinRules(builtinTheme) {
  switch (builtinTheme) {
    case VS_LIGHT_THEME_NAME:
      return vs;
    case VS_DARK_THEME_NAME:
      return vs_dark;
    case HC_BLACK_THEME_NAME:
      return hc_black;
    case HC_LIGHT_THEME_NAME:
      return hc_light;
  }
}
function newBuiltInTheme(builtinTheme) {
  const themeData = getBuiltinRules(builtinTheme);
  return new StandaloneTheme(builtinTheme, themeData);
}
class StandaloneThemeService extends Disposable {
  constructor() {
    super();
    this._onColorThemeChange = this._register(new Emitter());
    this.onDidColorThemeChange = this._onColorThemeChange.event;
    this._onFileIconThemeChange = this._register(new Emitter());
    this.onDidFileIconThemeChange = this._onFileIconThemeChange.event;
    this._onProductIconThemeChange = this._register(new Emitter());
    this.onDidProductIconThemeChange = this._onProductIconThemeChange.event;
    this._environment = /* @__PURE__ */ Object.create(null);
    this._builtInProductIconTheme = new UnthemedProductIconTheme();
    this._autoDetectHighContrast = true;
    this._knownThemes = /* @__PURE__ */ new Map();
    this._knownThemes.set(VS_LIGHT_THEME_NAME, newBuiltInTheme(VS_LIGHT_THEME_NAME));
    this._knownThemes.set(VS_DARK_THEME_NAME, newBuiltInTheme(VS_DARK_THEME_NAME));
    this._knownThemes.set(HC_BLACK_THEME_NAME, newBuiltInTheme(HC_BLACK_THEME_NAME));
    this._knownThemes.set(HC_LIGHT_THEME_NAME, newBuiltInTheme(HC_LIGHT_THEME_NAME));
    const iconsStyleSheet = this._register(getIconsStyleSheet(this));
    this._codiconCSS = iconsStyleSheet.getCSS();
    this._themeCSS = "";
    this._allCSS = `${this._codiconCSS}
${this._themeCSS}`;
    this._globalStyleElement = null;
    this._styleElements = [];
    this._colorMapOverride = null;
    this.setTheme(VS_LIGHT_THEME_NAME);
    this._onOSSchemeChanged();
    this._register(iconsStyleSheet.onDidChange(() => {
      this._codiconCSS = iconsStyleSheet.getCSS();
      this._updateCSS();
    }));
    addMatchMediaChangeListener(mainWindow, "(forced-colors: active)", () => {
      this._onOSSchemeChanged();
    });
  }
  registerEditorContainer(domNode) {
    if (dom.isInShadowDOM(domNode)) {
      return this._registerShadowDomContainer(domNode);
    }
    return this._registerRegularEditorContainer();
  }
  _registerRegularEditorContainer() {
    if (!this._globalStyleElement) {
      this._globalStyleElement = domStylesheetsJs.createStyleSheet(void 0, (style) => {
        style.className = "monaco-colors";
        style.textContent = this._allCSS;
      });
      this._styleElements.push(this._globalStyleElement);
    }
    return Disposable.None;
  }
  _registerShadowDomContainer(domNode) {
    const styleElement = domStylesheetsJs.createStyleSheet(domNode, (style) => {
      style.className = "monaco-colors";
      style.textContent = this._allCSS;
    });
    this._styleElements.push(styleElement);
    return {
      dispose: () => {
        for (let i = 0; i < this._styleElements.length; i++) {
          if (this._styleElements[i] === styleElement) {
            this._styleElements.splice(i, 1);
            return;
          }
        }
      }
    };
  }
  defineTheme(themeName, themeData) {
    if (!/^[a-z0-9\-]+$/i.test(themeName)) {
      throw new Error("Illegal theme name!");
    }
    if (!isBuiltinTheme(themeData.base) && !isBuiltinTheme(themeName)) {
      throw new Error("Illegal theme base!");
    }
    this._knownThemes.set(themeName, new StandaloneTheme(themeName, themeData));
    if (isBuiltinTheme(themeName)) {
      this._knownThemes.forEach((theme) => {
        if (theme.base === themeName) {
          theme.notifyBaseUpdated();
        }
      });
    }
    if (this._theme.themeName === themeName) {
      this.setTheme(themeName);
    }
  }
  getColorTheme() {
    return this._theme;
  }
  setColorMapOverride(colorMapOverride) {
    this._colorMapOverride = colorMapOverride;
    this._updateThemeOrColorMap();
  }
  setTheme(themeName) {
    let theme;
    if (this._knownThemes.has(themeName)) {
      theme = this._knownThemes.get(themeName);
    } else {
      theme = this._knownThemes.get(VS_LIGHT_THEME_NAME);
    }
    this._updateActualTheme(theme);
  }
  _updateActualTheme(desiredTheme) {
    if (!desiredTheme || this._theme === desiredTheme) {
      return;
    }
    this._theme = desiredTheme;
    this._updateThemeOrColorMap();
  }
  _onOSSchemeChanged() {
    if (this._autoDetectHighContrast) {
      const wantsHighContrast = mainWindow.matchMedia(`(forced-colors: active)`).matches;
      if (wantsHighContrast !== isHighContrast(this._theme.type)) {
        let newThemeName;
        if (isDark(this._theme.type)) {
          newThemeName = wantsHighContrast ? HC_BLACK_THEME_NAME : VS_DARK_THEME_NAME;
        } else {
          newThemeName = wantsHighContrast ? HC_LIGHT_THEME_NAME : VS_LIGHT_THEME_NAME;
        }
        this._updateActualTheme(this._knownThemes.get(newThemeName));
      }
    }
  }
  setAutoDetectHighContrast(autoDetectHighContrast) {
    this._autoDetectHighContrast = autoDetectHighContrast;
    this._onOSSchemeChanged();
  }
  _updateThemeOrColorMap() {
    const cssRules = [];
    const hasRule = {};
    const ruleCollector = {
      addRule: (rule) => {
        if (!hasRule[rule]) {
          cssRules.push(rule);
          hasRule[rule] = true;
        }
      }
    };
    themingRegistry.getThemingParticipants().forEach((p) => p(this._theme, ruleCollector, this._environment));
    const colorVariables = [];
    for (const item of colorRegistry.getColors()) {
      const color = this._theme.getColor(item.id, true);
      if (color) {
        colorVariables.push(`${asCssVariableName(item.id)}: ${color.toString()};`);
      }
    }
    ruleCollector.addRule(`.monaco-editor, .monaco-diff-editor, .monaco-component { ${colorVariables.join("\n")} }`);
    const colorMap = this._colorMapOverride || this._theme.tokenTheme.getColorMap();
    ruleCollector.addRule(generateTokensCSSForColorMap(colorMap));
    ruleCollector.addRule(`.monaco-editor, .monaco-diff-editor, .monaco-component { forced-color-adjust: none; }`);
    this._themeCSS = cssRules.join("\n");
    this._updateCSS();
    TokenizationRegistry.setColorMap(colorMap);
    this._onColorThemeChange.fire(this._theme);
  }
  _updateCSS() {
    this._allCSS = `${this._codiconCSS}
${this._themeCSS}`;
    this._styleElements.forEach((styleElement) => styleElement.textContent = this._allCSS);
  }
  getFileIconTheme() {
    return {
      hasFileIcons: false,
      hasFolderIcons: false,
      hidesExplorerArrows: false
    };
  }
  getProductIconTheme() {
    return this._builtInProductIconTheme;
  }
}
export {
  HC_BLACK_THEME_NAME,
  HC_LIGHT_THEME_NAME,
  StandaloneThemeService,
  VS_DARK_THEME_NAME,
  VS_LIGHT_THEME_NAME
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXGJyb3dzZXJcXHN0YW5kYWxvbmVUaGVtZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb21TdHlsZXNoZWV0c0pzIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBhZGRNYXRjaE1lZGlhQ2hhbmdlTGlzdGVuZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRm9udFN0eWxlLCBUb2tlbk1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSVRva2VuVGhlbWVSdWxlLCBUb2tlblRoZW1lLCBnZW5lcmF0ZVRva2Vuc0NTU0ZvckNvbG9yTWFwIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy90b2tlbml6YXRpb24uanMnO1xuaW1wb3J0IHsgQnVpbHRpblRoZW1lLCBJU3RhbmRhbG9uZVRoZW1lLCBJU3RhbmRhbG9uZVRoZW1lRGF0YSwgSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc3RhbmRhbG9uZVRoZW1lLmpzJztcbmltcG9ydCB7IGhjX2JsYWNrLCBoY19saWdodCwgdnMsIHZzX2RhcmsgfSBmcm9tICcuLi9jb21tb24vdGhlbWVzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZU5hbWUsIENvbG9ySWRlbnRpZmllciwgRXh0ZW5zaW9ucywgSUNvbG9yUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFRoZW1pbmdFeHRlbnNpb25zLCBJQ3NzU3R5bGVDb2xsZWN0b3IsIElGaWxlSWNvblRoZW1lLCBJUHJvZHVjdEljb25UaGVtZSwgSVRoZW1pbmdSZWdpc3RyeSwgSVRva2VuU3R5bGUsIElGb250VG9rZW5PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb2xvclNjaGVtZSwgaXNEYXJrLCBpc0hpZ2hDb250cmFzdCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uc1N0eWxlU2hlZXQsIFVudGhlbWVkUHJvZHVjdEljb25UaGVtZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvaWNvbnNTdHlsZVNoZWV0LmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcblxuZXhwb3J0IGNvbnN0IFZTX0xJR0hUX1RIRU1FX05BTUUgPSAndnMnO1xuZXhwb3J0IGNvbnN0IFZTX0RBUktfVEhFTUVfTkFNRSA9ICd2cy1kYXJrJztcbmV4cG9ydCBjb25zdCBIQ19CTEFDS19USEVNRV9OQU1FID0gJ2hjLWJsYWNrJztcbmV4cG9ydCBjb25zdCBIQ19MSUdIVF9USEVNRV9OQU1FID0gJ2hjLWxpZ2h0JztcblxuY29uc3QgY29sb3JSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb2xvclJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbG9yQ29udHJpYnV0aW9uKTtcbmNvbnN0IHRoZW1pbmdSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElUaGVtaW5nUmVnaXN0cnk+KFRoZW1pbmdFeHRlbnNpb25zLlRoZW1pbmdDb250cmlidXRpb24pO1xuXG5jbGFzcyBTdGFuZGFsb25lVGhlbWUgaW1wbGVtZW50cyBJU3RhbmRhbG9uZVRoZW1lIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IHRoZW1lTmFtZTogc3RyaW5nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGhlbWVEYXRhOiBJU3RhbmRhbG9uZVRoZW1lRGF0YTtcblx0cHJpdmF0ZSBjb2xvcnM6IE1hcDxzdHJpbmcsIENvbG9yPiB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdENvbG9yczogeyBbY29sb3JJZDogc3RyaW5nXTogQ29sb3IgfCB1bmRlZmluZWQgfTtcblx0cHJpdmF0ZSBfdG9rZW5UaGVtZTogVG9rZW5UaGVtZSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IobmFtZTogc3RyaW5nLCBzdGFuZGFsb25lVGhlbWVEYXRhOiBJU3RhbmRhbG9uZVRoZW1lRGF0YSkge1xuXHRcdHRoaXMudGhlbWVEYXRhID0gc3RhbmRhbG9uZVRoZW1lRGF0YTtcblx0XHRjb25zdCBiYXNlID0gc3RhbmRhbG9uZVRoZW1lRGF0YS5iYXNlO1xuXHRcdGlmIChuYW1lLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmIChpc0J1aWx0aW5UaGVtZShuYW1lKSkge1xuXHRcdFx0XHR0aGlzLmlkID0gbmFtZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaWQgPSBiYXNlICsgJyAnICsgbmFtZTtcblx0XHRcdH1cblx0XHRcdHRoaXMudGhlbWVOYW1lID0gbmFtZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pZCA9IGJhc2U7XG5cdFx0XHR0aGlzLnRoZW1lTmFtZSA9IGJhc2U7XG5cdFx0fVxuXHRcdHRoaXMuY29sb3JzID0gbnVsbDtcblx0XHR0aGlzLmRlZmF1bHRDb2xvcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX3Rva2VuVGhlbWUgPSBudWxsO1xuXHR9XG5cblx0cHVibGljIGdldCBsYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnRoZW1lTmFtZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgYmFzZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnRoZW1lRGF0YS5iYXNlO1xuXHR9XG5cblx0cHVibGljIG5vdGlmeUJhc2VVcGRhdGVkKCkge1xuXHRcdGlmICh0aGlzLnRoZW1lRGF0YS5pbmhlcml0KSB7XG5cdFx0XHR0aGlzLmNvbG9ycyA9IG51bGw7XG5cdFx0XHR0aGlzLl90b2tlblRoZW1lID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldENvbG9ycygpOiBNYXA8c3RyaW5nLCBDb2xvcj4ge1xuXHRcdGlmICghdGhpcy5jb2xvcnMpIHtcblx0XHRcdGNvbnN0IGNvbG9ycyA9IG5ldyBNYXA8c3RyaW5nLCBDb2xvcj4oKTtcblx0XHRcdGZvciAoY29uc3QgaWQgaW4gdGhpcy50aGVtZURhdGEuY29sb3JzKSB7XG5cdFx0XHRcdGNvbG9ycy5zZXQoaWQsIENvbG9yLmZyb21IZXgodGhpcy50aGVtZURhdGEuY29sb3JzW2lkXSkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMudGhlbWVEYXRhLmluaGVyaXQpIHtcblx0XHRcdFx0Y29uc3QgYmFzZURhdGEgPSBnZXRCdWlsdGluUnVsZXModGhpcy50aGVtZURhdGEuYmFzZSk7XG5cdFx0XHRcdGZvciAoY29uc3QgaWQgaW4gYmFzZURhdGEuY29sb3JzKSB7XG5cdFx0XHRcdFx0aWYgKCFjb2xvcnMuaGFzKGlkKSkge1xuXHRcdFx0XHRcdFx0Y29sb3JzLnNldChpZCwgQ29sb3IuZnJvbUhleChiYXNlRGF0YS5jb2xvcnNbaWRdKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbG9ycyA9IGNvbG9ycztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY29sb3JzO1xuXHR9XG5cblx0cHVibGljIGdldENvbG9yKGNvbG9ySWQ6IENvbG9ySWRlbnRpZmllciwgdXNlRGVmYXVsdD86IGJvb2xlYW4pOiBDb2xvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29sb3IgPSB0aGlzLmdldENvbG9ycygpLmdldChjb2xvcklkKTtcblx0XHRpZiAoY29sb3IpIHtcblx0XHRcdHJldHVybiBjb2xvcjtcblx0XHR9XG5cdFx0aWYgKHVzZURlZmF1bHQgIT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXREZWZhdWx0KGNvbG9ySWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0KGNvbG9ySWQ6IENvbG9ySWRlbnRpZmllcik6IENvbG9yIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgY29sb3IgPSB0aGlzLmRlZmF1bHRDb2xvcnNbY29sb3JJZF07XG5cdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHRyZXR1cm4gY29sb3I7XG5cdFx0fVxuXHRcdGNvbG9yID0gY29sb3JSZWdpc3RyeS5yZXNvbHZlRGVmYXVsdENvbG9yKGNvbG9ySWQsIHRoaXMpO1xuXHRcdHRoaXMuZGVmYXVsdENvbG9yc1tjb2xvcklkXSA9IGNvbG9yO1xuXHRcdHJldHVybiBjb2xvcjtcblx0fVxuXG5cdHB1YmxpYyBkZWZpbmVzKGNvbG9ySWQ6IENvbG9ySWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdldENvbG9ycygpLmhhcyhjb2xvcklkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdHlwZSgpOiBDb2xvclNjaGVtZSB7XG5cdFx0c3dpdGNoICh0aGlzLmJhc2UpIHtcblx0XHRcdGNhc2UgVlNfTElHSFRfVEhFTUVfTkFNRTogcmV0dXJuIENvbG9yU2NoZW1lLkxJR0hUO1xuXHRcdFx0Y2FzZSBIQ19CTEFDS19USEVNRV9OQU1FOiByZXR1cm4gQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9EQVJLO1xuXHRcdFx0Y2FzZSBIQ19MSUdIVF9USEVNRV9OQU1FOiByZXR1cm4gQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9MSUdIVDtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBDb2xvclNjaGVtZS5EQVJLO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgdG9rZW5UaGVtZSgpOiBUb2tlblRoZW1lIHtcblx0XHRpZiAoIXRoaXMuX3Rva2VuVGhlbWUpIHtcblx0XHRcdGxldCBydWxlczogSVRva2VuVGhlbWVSdWxlW10gPSBbXTtcblx0XHRcdGxldCBlbmNvZGVkVG9rZW5zQ29sb3JzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKHRoaXMudGhlbWVEYXRhLmluaGVyaXQpIHtcblx0XHRcdFx0Y29uc3QgYmFzZURhdGEgPSBnZXRCdWlsdGluUnVsZXModGhpcy50aGVtZURhdGEuYmFzZSk7XG5cdFx0XHRcdHJ1bGVzID0gYmFzZURhdGEucnVsZXM7XG5cdFx0XHRcdGlmIChiYXNlRGF0YS5lbmNvZGVkVG9rZW5zQ29sb3JzKSB7XG5cdFx0XHRcdFx0ZW5jb2RlZFRva2Vuc0NvbG9ycyA9IGJhc2VEYXRhLmVuY29kZWRUb2tlbnNDb2xvcnM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIFBpY2sgdXAgZGVmYXVsdCBjb2xvcnMgZnJvbSBgZWRpdG9yLmZvcmVncm91bmRgIGFuZCBgZWRpdG9yLmJhY2tncm91bmRgIGlmIGF2YWlsYWJsZVxuXHRcdFx0Y29uc3QgZWRpdG9yRm9yZWdyb3VuZCA9IHRoaXMudGhlbWVEYXRhLmNvbG9yc1snZWRpdG9yLmZvcmVncm91bmQnXTtcblx0XHRcdGNvbnN0IGVkaXRvckJhY2tncm91bmQgPSB0aGlzLnRoZW1lRGF0YS5jb2xvcnNbJ2VkaXRvci5iYWNrZ3JvdW5kJ107XG5cdFx0XHRpZiAoZWRpdG9yRm9yZWdyb3VuZCB8fCBlZGl0b3JCYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdGNvbnN0IHJ1bGU6IElUb2tlblRoZW1lUnVsZSA9IHsgdG9rZW46ICcnIH07XG5cdFx0XHRcdGlmIChlZGl0b3JGb3JlZ3JvdW5kKSB7XG5cdFx0XHRcdFx0cnVsZS5mb3JlZ3JvdW5kID0gZWRpdG9yRm9yZWdyb3VuZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZWRpdG9yQmFja2dyb3VuZCkge1xuXHRcdFx0XHRcdHJ1bGUuYmFja2dyb3VuZCA9IGVkaXRvckJhY2tncm91bmQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cnVsZXMucHVzaChydWxlKTtcblx0XHRcdH1cblx0XHRcdHJ1bGVzID0gcnVsZXMuY29uY2F0KHRoaXMudGhlbWVEYXRhLnJ1bGVzKTtcblx0XHRcdGlmICh0aGlzLnRoZW1lRGF0YS5lbmNvZGVkVG9rZW5zQ29sb3JzKSB7XG5cdFx0XHRcdGVuY29kZWRUb2tlbnNDb2xvcnMgPSB0aGlzLnRoZW1lRGF0YS5lbmNvZGVkVG9rZW5zQ29sb3JzO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdG9rZW5UaGVtZSA9IFRva2VuVGhlbWUuY3JlYXRlRnJvbVJhd1Rva2VuVGhlbWUocnVsZXMsIGVuY29kZWRUb2tlbnNDb2xvcnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdG9rZW5UaGVtZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlblN0eWxlTWV0YWRhdGEodHlwZTogc3RyaW5nLCBtb2RpZmllcnM6IHN0cmluZ1tdLCBtb2RlbExhbmd1YWdlOiBzdHJpbmcpOiBJVG9rZW5TdHlsZSB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gdXNlIHRoZW1lIHJ1bGVzIG1hdGNoXG5cdFx0Y29uc3Qgc3R5bGUgPSB0aGlzLnRva2VuVGhlbWUuX21hdGNoKFt0eXBlXS5jb25jYXQobW9kaWZpZXJzKS5qb2luKCcuJykpO1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gc3R5bGUubWV0YWRhdGE7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZCA9IFRva2VuTWV0YWRhdGEuZ2V0Rm9yZWdyb3VuZChtZXRhZGF0YSk7XG5cdFx0Y29uc3QgZm9udFN0eWxlID0gVG9rZW5NZXRhZGF0YS5nZXRGb250U3R5bGUobWV0YWRhdGEpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRmb3JlZ3JvdW5kOiBmb3JlZ3JvdW5kLFxuXHRcdFx0aXRhbGljOiBCb29sZWFuKGZvbnRTdHlsZSAmIEZvbnRTdHlsZS5JdGFsaWMpLFxuXHRcdFx0Ym9sZDogQm9vbGVhbihmb250U3R5bGUgJiBGb250U3R5bGUuQm9sZCksXG5cdFx0XHR1bmRlcmxpbmU6IEJvb2xlYW4oZm9udFN0eWxlICYgRm9udFN0eWxlLlVuZGVybGluZSksXG5cdFx0XHRzdHJpa2V0aHJvdWdoOiBCb29sZWFuKGZvbnRTdHlsZSAmIEZvbnRTdHlsZS5TdHJpa2V0aHJvdWdoKVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRva2VuQ29sb3JNYXAoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdG9rZW5Gb250TWFwKCk6IElGb250VG9rZW5PcHRpb25zW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBzZW1hbnRpY0hpZ2hsaWdodGluZyA9IGZhbHNlO1xufVxuXG5mdW5jdGlvbiBpc0J1aWx0aW5UaGVtZSh0aGVtZU5hbWU6IHN0cmluZyk6IHRoZW1lTmFtZSBpcyBCdWlsdGluVGhlbWUge1xuXHRyZXR1cm4gKFxuXHRcdHRoZW1lTmFtZSA9PT0gVlNfTElHSFRfVEhFTUVfTkFNRVxuXHRcdHx8IHRoZW1lTmFtZSA9PT0gVlNfREFSS19USEVNRV9OQU1FXG5cdFx0fHwgdGhlbWVOYW1lID09PSBIQ19CTEFDS19USEVNRV9OQU1FXG5cdFx0fHwgdGhlbWVOYW1lID09PSBIQ19MSUdIVF9USEVNRV9OQU1FXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGdldEJ1aWx0aW5SdWxlcyhidWlsdGluVGhlbWU6IEJ1aWx0aW5UaGVtZSk6IElTdGFuZGFsb25lVGhlbWVEYXRhIHtcblx0c3dpdGNoIChidWlsdGluVGhlbWUpIHtcblx0XHRjYXNlIFZTX0xJR0hUX1RIRU1FX05BTUU6XG5cdFx0XHRyZXR1cm4gdnM7XG5cdFx0Y2FzZSBWU19EQVJLX1RIRU1FX05BTUU6XG5cdFx0XHRyZXR1cm4gdnNfZGFyaztcblx0XHRjYXNlIEhDX0JMQUNLX1RIRU1FX05BTUU6XG5cdFx0XHRyZXR1cm4gaGNfYmxhY2s7XG5cdFx0Y2FzZSBIQ19MSUdIVF9USEVNRV9OQU1FOlxuXHRcdFx0cmV0dXJuIGhjX2xpZ2h0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIG5ld0J1aWx0SW5UaGVtZShidWlsdGluVGhlbWU6IEJ1aWx0aW5UaGVtZSk6IFN0YW5kYWxvbmVUaGVtZSB7XG5cdGNvbnN0IHRoZW1lRGF0YSA9IGdldEJ1aWx0aW5SdWxlcyhidWlsdGluVGhlbWUpO1xuXHRyZXR1cm4gbmV3IFN0YW5kYWxvbmVUaGVtZShidWlsdGluVGhlbWUsIHRoZW1lRGF0YSk7XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFuZGFsb25lVGhlbWVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTdGFuZGFsb25lVGhlbWVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbG9yVGhlbWVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RhbmRhbG9uZVRoZW1lPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ29sb3JUaGVtZUNoYW5nZSA9IHRoaXMuX29uQ29sb3JUaGVtZUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkZpbGVJY29uVGhlbWVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRmlsZUljb25UaGVtZT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2UgPSB0aGlzLl9vbkZpbGVJY29uVGhlbWVDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9kdWN0SWNvblRoZW1lQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVByb2R1Y3RJY29uVGhlbWU+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRQcm9kdWN0SWNvblRoZW1lQ2hhbmdlID0gdGhpcy5fb25Qcm9kdWN0SWNvblRoZW1lQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50OiBJRW52aXJvbm1lbnRTZXJ2aWNlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0cHJpdmF0ZSByZWFkb25seSBfa25vd25UaGVtZXM6IE1hcDxzdHJpbmcsIFN0YW5kYWxvbmVUaGVtZT47XG5cdHByaXZhdGUgX2F1dG9EZXRlY3RIaWdoQ29udHJhc3Q6IGJvb2xlYW47XG5cdHByaXZhdGUgX2NvZGljb25DU1M6IHN0cmluZztcblx0cHJpdmF0ZSBfdGhlbWVDU1M6IHN0cmluZztcblx0cHJpdmF0ZSBfYWxsQ1NTOiBzdHJpbmc7XG5cdHByaXZhdGUgX2dsb2JhbFN0eWxlRWxlbWVudDogSFRNTFN0eWxlRWxlbWVudCB8IG51bGw7XG5cdHByaXZhdGUgX3N0eWxlRWxlbWVudHM6IEhUTUxTdHlsZUVsZW1lbnRbXTtcblx0cHJpdmF0ZSBfY29sb3JNYXBPdmVycmlkZTogQ29sb3JbXSB8IG51bGw7XG5cdHByaXZhdGUgX3RoZW1lITogSVN0YW5kYWxvbmVUaGVtZTtcblxuXHRwcml2YXRlIF9idWlsdEluUHJvZHVjdEljb25UaGVtZSA9IG5ldyBVbnRoZW1lZFByb2R1Y3RJY29uVGhlbWUoKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fYXV0b0RldGVjdEhpZ2hDb250cmFzdCA9IHRydWU7XG5cblx0XHR0aGlzLl9rbm93blRoZW1lcyA9IG5ldyBNYXA8c3RyaW5nLCBTdGFuZGFsb25lVGhlbWU+KCk7XG5cdFx0dGhpcy5fa25vd25UaGVtZXMuc2V0KFZTX0xJR0hUX1RIRU1FX05BTUUsIG5ld0J1aWx0SW5UaGVtZShWU19MSUdIVF9USEVNRV9OQU1FKSk7XG5cdFx0dGhpcy5fa25vd25UaGVtZXMuc2V0KFZTX0RBUktfVEhFTUVfTkFNRSwgbmV3QnVpbHRJblRoZW1lKFZTX0RBUktfVEhFTUVfTkFNRSkpO1xuXHRcdHRoaXMuX2tub3duVGhlbWVzLnNldChIQ19CTEFDS19USEVNRV9OQU1FLCBuZXdCdWlsdEluVGhlbWUoSENfQkxBQ0tfVEhFTUVfTkFNRSkpO1xuXHRcdHRoaXMuX2tub3duVGhlbWVzLnNldChIQ19MSUdIVF9USEVNRV9OQU1FLCBuZXdCdWlsdEluVGhlbWUoSENfTElHSFRfVEhFTUVfTkFNRSkpO1xuXG5cdFx0Y29uc3QgaWNvbnNTdHlsZVNoZWV0ID0gdGhpcy5fcmVnaXN0ZXIoZ2V0SWNvbnNTdHlsZVNoZWV0KHRoaXMpKTtcblxuXHRcdHRoaXMuX2NvZGljb25DU1MgPSBpY29uc1N0eWxlU2hlZXQuZ2V0Q1NTKCk7XG5cdFx0dGhpcy5fdGhlbWVDU1MgPSAnJztcblx0XHR0aGlzLl9hbGxDU1MgPSBgJHt0aGlzLl9jb2RpY29uQ1NTfVxcbiR7dGhpcy5fdGhlbWVDU1N9YDtcblx0XHR0aGlzLl9nbG9iYWxTdHlsZUVsZW1lbnQgPSBudWxsO1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudHMgPSBbXTtcblx0XHR0aGlzLl9jb2xvck1hcE92ZXJyaWRlID0gbnVsbDtcblx0XHR0aGlzLnNldFRoZW1lKFZTX0xJR0hUX1RIRU1FX05BTUUpO1xuXHRcdHRoaXMuX29uT1NTY2hlbWVDaGFuZ2VkKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihpY29uc1N0eWxlU2hlZXQub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29kaWNvbkNTUyA9IGljb25zU3R5bGVTaGVldC5nZXRDU1MoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUNTUygpO1xuXHRcdH0pKTtcblxuXHRcdGFkZE1hdGNoTWVkaWFDaGFuZ2VMaXN0ZW5lcihtYWluV2luZG93LCAnKGZvcmNlZC1jb2xvcnM6IGFjdGl2ZSknLCAoKSA9PiB7XG5cdFx0XHQvLyBVcGRhdGUgdGhlbWUgc2VsZWN0aW9uIGZvciBhdXRvLWRldGVjdGluZyBoaWdoIGNvbnRyYXN0XG5cdFx0XHR0aGlzLl9vbk9TU2NoZW1lQ2hhbmdlZCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyRWRpdG9yQ29udGFpbmVyKGRvbU5vZGU6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGlmIChkb20uaXNJblNoYWRvd0RPTShkb21Ob2RlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyU2hhZG93RG9tQ29udGFpbmVyKGRvbU5vZGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXJSZWd1bGFyRWRpdG9yQ29udGFpbmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlclJlZ3VsYXJFZGl0b3JDb250YWluZXIoKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICghdGhpcy5fZ2xvYmFsU3R5bGVFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9nbG9iYWxTdHlsZUVsZW1lbnQgPSBkb21TdHlsZXNoZWV0c0pzLmNyZWF0ZVN0eWxlU2hlZXQodW5kZWZpbmVkLCBzdHlsZSA9PiB7XG5cdFx0XHRcdHN0eWxlLmNsYXNzTmFtZSA9ICdtb25hY28tY29sb3JzJztcblx0XHRcdFx0c3R5bGUudGV4dENvbnRlbnQgPSB0aGlzLl9hbGxDU1M7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3N0eWxlRWxlbWVudHMucHVzaCh0aGlzLl9nbG9iYWxTdHlsZUVsZW1lbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJTaGFkb3dEb21Db250YWluZXIoZG9tTm9kZTogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3R5bGVFbGVtZW50ID0gZG9tU3R5bGVzaGVldHNKcy5jcmVhdGVTdHlsZVNoZWV0KGRvbU5vZGUsIHN0eWxlID0+IHtcblx0XHRcdHN0eWxlLmNsYXNzTmFtZSA9ICdtb25hY28tY29sb3JzJztcblx0XHRcdHN0eWxlLnRleHRDb250ZW50ID0gdGhpcy5fYWxsQ1NTO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudHMucHVzaChzdHlsZUVsZW1lbnQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc3R5bGVFbGVtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zdHlsZUVsZW1lbnRzW2ldID09PSBzdHlsZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3N0eWxlRWxlbWVudHMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZGVmaW5lVGhlbWUodGhlbWVOYW1lOiBzdHJpbmcsIHRoZW1lRGF0YTogSVN0YW5kYWxvbmVUaGVtZURhdGEpOiB2b2lkIHtcblx0XHRpZiAoIS9eW2EtejAtOVxcLV0rJC9pLnRlc3QodGhlbWVOYW1lKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbGxlZ2FsIHRoZW1lIG5hbWUhJyk7XG5cdFx0fVxuXHRcdGlmICghaXNCdWlsdGluVGhlbWUodGhlbWVEYXRhLmJhc2UpICYmICFpc0J1aWx0aW5UaGVtZSh0aGVtZU5hbWUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lsbGVnYWwgdGhlbWUgYmFzZSEnKTtcblx0XHR9XG5cdFx0Ly8gc2V0IG9yIHJlcGxhY2UgdGhlbWVcblx0XHR0aGlzLl9rbm93blRoZW1lcy5zZXQodGhlbWVOYW1lLCBuZXcgU3RhbmRhbG9uZVRoZW1lKHRoZW1lTmFtZSwgdGhlbWVEYXRhKSk7XG5cblx0XHRpZiAoaXNCdWlsdGluVGhlbWUodGhlbWVOYW1lKSkge1xuXHRcdFx0dGhpcy5fa25vd25UaGVtZXMuZm9yRWFjaCh0aGVtZSA9PiB7XG5cdFx0XHRcdGlmICh0aGVtZS5iYXNlID09PSB0aGVtZU5hbWUpIHtcblx0XHRcdFx0XHR0aGVtZS5ub3RpZnlCYXNlVXBkYXRlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3RoZW1lLnRoZW1lTmFtZSA9PT0gdGhlbWVOYW1lKSB7XG5cdFx0XHR0aGlzLnNldFRoZW1lKHRoZW1lTmFtZSk7IC8vIHJlZnJlc2ggdGhlbWVcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29sb3JUaGVtZSgpOiBJU3RhbmRhbG9uZVRoZW1lIHtcblx0XHRyZXR1cm4gdGhpcy5fdGhlbWU7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29sb3JNYXBPdmVycmlkZShjb2xvck1hcE92ZXJyaWRlOiBDb2xvcltdIHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbG9yTWFwT3ZlcnJpZGUgPSBjb2xvck1hcE92ZXJyaWRlO1xuXHRcdHRoaXMuX3VwZGF0ZVRoZW1lT3JDb2xvck1hcCgpO1xuXHR9XG5cblx0cHVibGljIHNldFRoZW1lKHRoZW1lTmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IHRoZW1lOiBTdGFuZGFsb25lVGhlbWUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuX2tub3duVGhlbWVzLmhhcyh0aGVtZU5hbWUpKSB7XG5cdFx0XHR0aGVtZSA9IHRoaXMuX2tub3duVGhlbWVzLmdldCh0aGVtZU5hbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGVtZSA9IHRoaXMuX2tub3duVGhlbWVzLmdldChWU19MSUdIVF9USEVNRV9OQU1FKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlQWN0dWFsVGhlbWUodGhlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQWN0dWFsVGhlbWUoZGVzaXJlZFRoZW1lOiBJU3RhbmRhbG9uZVRoZW1lIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFkZXNpcmVkVGhlbWUgfHwgdGhpcy5fdGhlbWUgPT09IGRlc2lyZWRUaGVtZSkge1xuXHRcdFx0Ly8gTm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90aGVtZSA9IGRlc2lyZWRUaGVtZTtcblx0XHR0aGlzLl91cGRhdGVUaGVtZU9yQ29sb3JNYXAoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uT1NTY2hlbWVDaGFuZ2VkKCkge1xuXHRcdGlmICh0aGlzLl9hdXRvRGV0ZWN0SGlnaENvbnRyYXN0KSB7XG5cdFx0XHRjb25zdCB3YW50c0hpZ2hDb250cmFzdCA9IG1haW5XaW5kb3cubWF0Y2hNZWRpYShgKGZvcmNlZC1jb2xvcnM6IGFjdGl2ZSlgKS5tYXRjaGVzO1xuXHRcdFx0aWYgKHdhbnRzSGlnaENvbnRyYXN0ICE9PSBpc0hpZ2hDb250cmFzdCh0aGlzLl90aGVtZS50eXBlKSkge1xuXHRcdFx0XHQvLyBzd2l0Y2ggdG8gaGlnaCBjb250cmFzdCBvciBub24taGlnaCBjb250cmFzdCBidXQgc3RpY2sgdG8gZGFyayBvciBsaWdodFxuXHRcdFx0XHRsZXQgbmV3VGhlbWVOYW1lO1xuXHRcdFx0XHRpZiAoaXNEYXJrKHRoaXMuX3RoZW1lLnR5cGUpKSB7XG5cdFx0XHRcdFx0bmV3VGhlbWVOYW1lID0gd2FudHNIaWdoQ29udHJhc3QgPyBIQ19CTEFDS19USEVNRV9OQU1FIDogVlNfREFSS19USEVNRV9OQU1FO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG5ld1RoZW1lTmFtZSA9IHdhbnRzSGlnaENvbnRyYXN0ID8gSENfTElHSFRfVEhFTUVfTkFNRSA6IFZTX0xJR0hUX1RIRU1FX05BTUU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdXBkYXRlQWN0dWFsVGhlbWUodGhpcy5fa25vd25UaGVtZXMuZ2V0KG5ld1RoZW1lTmFtZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRBdXRvRGV0ZWN0SGlnaENvbnRyYXN0KGF1dG9EZXRlY3RIaWdoQ29udHJhc3Q6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9hdXRvRGV0ZWN0SGlnaENvbnRyYXN0ID0gYXV0b0RldGVjdEhpZ2hDb250cmFzdDtcblx0XHR0aGlzLl9vbk9TU2NoZW1lQ2hhbmdlZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGhlbWVPckNvbG9yTWFwKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNzc1J1bGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGhhc1J1bGU6IHsgW3J1bGU6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9O1xuXHRcdGNvbnN0IHJ1bGVDb2xsZWN0b3I6IElDc3NTdHlsZUNvbGxlY3RvciA9IHtcblx0XHRcdGFkZFJ1bGU6IChydWxlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKCFoYXNSdWxlW3J1bGVdKSB7XG5cdFx0XHRcdFx0Y3NzUnVsZXMucHVzaChydWxlKTtcblx0XHRcdFx0XHRoYXNSdWxlW3J1bGVdID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhlbWluZ1JlZ2lzdHJ5LmdldFRoZW1pbmdQYXJ0aWNpcGFudHMoKS5mb3JFYWNoKHAgPT4gcCh0aGlzLl90aGVtZSwgcnVsZUNvbGxlY3RvciwgdGhpcy5fZW52aXJvbm1lbnQpKTtcblxuXHRcdGNvbnN0IGNvbG9yVmFyaWFibGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBjb2xvclJlZ2lzdHJ5LmdldENvbG9ycygpKSB7XG5cdFx0XHRjb25zdCBjb2xvciA9IHRoaXMuX3RoZW1lLmdldENvbG9yKGl0ZW0uaWQsIHRydWUpO1xuXHRcdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHRcdGNvbG9yVmFyaWFibGVzLnB1c2goYCR7YXNDc3NWYXJpYWJsZU5hbWUoaXRlbS5pZCl9OiAke2NvbG9yLnRvU3RyaW5nKCl9O2ApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRydWxlQ29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yLCAubW9uYWNvLWRpZmYtZWRpdG9yLCAubW9uYWNvLWNvbXBvbmVudCB7ICR7Y29sb3JWYXJpYWJsZXMuam9pbignXFxuJyl9IH1gKTtcblxuXHRcdGNvbnN0IGNvbG9yTWFwID0gdGhpcy5fY29sb3JNYXBPdmVycmlkZSB8fCB0aGlzLl90aGVtZS50b2tlblRoZW1lLmdldENvbG9yTWFwKCk7XG5cdFx0cnVsZUNvbGxlY3Rvci5hZGRSdWxlKGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAoY29sb3JNYXApKTtcblxuXHRcdC8vIElmIHRoZSBPUyBoYXMgZm9yY2VkLWNvbG9ycyBhY3RpdmUsIGRpc2FibGUgZm9yY2VkIGNvbG9yIGFkanVzdG1lbnQgZm9yXG5cdFx0Ly8gTW9uYWNvIGVkaXRvciBlbGVtZW50cyBzbyB0aGF0IFZTIENvZGUncyBidWlsdC1pbiBoaWdoIGNvbnRyYXN0IHRoZW1lc1xuXHRcdC8vIChoYy1ibGFjayAvIGhjLWxpZ2h0KSBhcmUgdXNlZCBpbnN0ZWFkIG9mIHRoZSBPUyBmb3JjaW5nIHN5c3RlbSBjb2xvcnMuXG5cdFx0cnVsZUNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciwgLm1vbmFjby1kaWZmLWVkaXRvciwgLm1vbmFjby1jb21wb25lbnQgeyBmb3JjZWQtY29sb3ItYWRqdXN0OiBub25lOyB9YCk7XG5cblx0XHR0aGlzLl90aGVtZUNTUyA9IGNzc1J1bGVzLmpvaW4oJ1xcbicpO1xuXHRcdHRoaXMuX3VwZGF0ZUNTUygpO1xuXG5cdFx0VG9rZW5pemF0aW9uUmVnaXN0cnkuc2V0Q29sb3JNYXAoY29sb3JNYXApO1xuXHRcdHRoaXMuX29uQ29sb3JUaGVtZUNoYW5nZS5maXJlKHRoaXMuX3RoZW1lKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNTUygpOiB2b2lkIHtcblx0XHR0aGlzLl9hbGxDU1MgPSBgJHt0aGlzLl9jb2RpY29uQ1NTfVxcbiR7dGhpcy5fdGhlbWVDU1N9YDtcblx0XHR0aGlzLl9zdHlsZUVsZW1lbnRzLmZvckVhY2goc3R5bGVFbGVtZW50ID0+IHN0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuX2FsbENTUyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RmlsZUljb25UaGVtZSgpOiBJRmlsZUljb25UaGVtZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGhhc0ZpbGVJY29uczogZmFsc2UsXG5cdFx0XHRoYXNGb2xkZXJJY29uczogZmFsc2UsXG5cdFx0XHRoaWRlc0V4cGxvcmVyQXJyb3dzOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgZ2V0UHJvZHVjdEljb25UaGVtZSgpOiBJUHJvZHVjdEljb25UaGVtZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1aWx0SW5Qcm9kdWN0SWNvblRoZW1lO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLHNCQUFzQjtBQUNsQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsV0FBVyxxQkFBcUI7QUFDekMsU0FBMEIsWUFBWSxvQ0FBb0M7QUFFMUUsU0FBUyxVQUFVLFVBQVUsSUFBSSxlQUFlO0FBRWhELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW9DLGtCQUFrQztBQUMvRSxTQUFTLGNBQWMseUJBQWtJO0FBQ3pKLFNBQXNCLGtCQUFrQjtBQUN4QyxTQUFTLGFBQWEsUUFBUSxzQkFBc0I7QUFDcEQsU0FBUyxvQkFBb0IsZ0NBQWdDO0FBQzdELFNBQVMsa0JBQWtCO0FBRXBCLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0scUJBQXFCO0FBQzNCLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0sc0JBQXNCO0FBRW5DLE1BQU0sZ0JBQWdCLFNBQVMsR0FBbUIsV0FBVyxpQkFBaUI7QUFDOUUsTUFBTSxrQkFBa0IsU0FBUyxHQUFxQixrQkFBa0IsbUJBQW1CO0FBRTNGLE1BQU0sZ0JBQTRDO0FBQUEsRUFVakQsWUFBWSxNQUFjLHFCQUEyQztBQStJckUsU0FBZ0IsdUJBQXVCO0FBOUl0QyxTQUFLLFlBQVk7QUFDakIsVUFBTSxPQUFPLG9CQUFvQjtBQUNqQyxRQUFJLEtBQUssU0FBUyxHQUFHO0FBQ3BCLFVBQUksZUFBZSxJQUFJLEdBQUc7QUFDekIsYUFBSyxLQUFLO0FBQUEsTUFDWCxPQUFPO0FBQ04sYUFBSyxLQUFLLE9BQU8sTUFBTTtBQUFBLE1BQ3hCO0FBQ0EsV0FBSyxZQUFZO0FBQUEsSUFDbEIsT0FBTztBQUNOLFdBQUssS0FBSztBQUNWLFdBQUssWUFBWTtBQUFBLElBQ2xCO0FBQ0EsU0FBSyxTQUFTO0FBQ2Qs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
