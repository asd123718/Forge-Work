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
import { DEFAULT_FONT_FAMILY } from "../../../../base/browser/fonts.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { EditorFontLigatures } from "../../../../editor/common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../editor/common/config/fontInfo.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import * as colorRegistry from "../../../../platform/theme/common/colorRegistry.js";
import { getSizeRegistry, sizeValueToCss } from "../../../../platform/theme/common/sizeRegistry.js";
import { ColorScheme } from "../../../../platform/theme/common/theme.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
let WebviewThemeDataProvider = class extends Disposable {
  constructor(_themeService, _configurationService) {
    super();
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._cachedWebViewThemeData = void 0;
    this._onThemeDataChanged = this._register(new Emitter());
    this.onThemeDataChanged = this._onThemeDataChanged.event;
    this._register(this._themeService.onDidColorThemeChange(() => {
      this._reset();
    }));
    const webviewConfigurationKeys = ["editor.fontFamily", "editor.fontWeight", "editor.fontSize", "editor.fontLigatures", "accessibility.underlineLinks"];
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (webviewConfigurationKeys.some((key) => e.affectsConfiguration(key))) {
        this._reset();
      }
    }));
  }
  getTheme() {
    return this._themeService.getColorTheme();
  }
  getWebviewThemeData() {
    if (!this._cachedWebViewThemeData) {
      const configuration = this._configurationService.getValue("editor");
      const editorFontFamily = configuration.fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
      const editorFontWeight = configuration.fontWeight || EDITOR_FONT_DEFAULTS.fontWeight;
      const editorFontSize = configuration.fontSize || EDITOR_FONT_DEFAULTS.fontSize;
      const editorFontLigatures = new EditorFontLigatures().validate(configuration.fontLigatures);
      const linkUnderlines = this._configurationService.getValue("accessibility.underlineLinks");
      const theme = this._themeService.getColorTheme();
      const exportedColors = colorRegistry.getColorRegistry().getColors().reduce((colors, entry) => {
        const color = theme.getColor(entry.id);
        if (color) {
          colors["vscode-" + entry.id.replace(".", "-")] = color.toString();
        }
        return colors;
      }, {});
      const sizeRegistry = getSizeRegistry();
      const exportedSizes = sizeRegistry.getSizes().reduce((sizes, entry) => {
        const sizeValue = sizeRegistry.resolveDefaultSize(entry.id, theme);
        if (sizeValue) {
          sizes["vscode-" + entry.id.replace(/\./g, "-")] = sizeValueToCss(sizeValue);
        }
        return sizes;
      }, {});
      const styles = {
        "vscode-font-family": DEFAULT_FONT_FAMILY,
        "vscode-font-weight": "normal",
        "vscode-font-size": "13px",
        "vscode-editor-font-family": editorFontFamily,
        "vscode-editor-font-weight": editorFontWeight,
        "vscode-editor-font-size": editorFontSize + "px",
        "text-link-decoration": linkUnderlines ? "underline" : "none",
        ...exportedColors,
        ...exportedSizes,
        "vscode-editor-font-feature-settings": editorFontLigatures
      };
      const activeTheme = ApiThemeClassName.fromTheme(theme);
      this._cachedWebViewThemeData = { styles, activeTheme, themeLabel: theme.label, themeId: theme.settingsId };
    }
    return this._cachedWebViewThemeData;
  }
  _reset() {
    this._cachedWebViewThemeData = void 0;
    this._onThemeDataChanged.fire();
  }
};
WebviewThemeDataProvider = __decorateClass([
  __decorateParam(0, IWorkbenchThemeService),
  __decorateParam(1, IConfigurationService)
], WebviewThemeDataProvider);
var ApiThemeClassName = /* @__PURE__ */ ((ApiThemeClassName2) => {
  ApiThemeClassName2["light"] = "vscode-light";
  ApiThemeClassName2["dark"] = "vscode-dark";
  ApiThemeClassName2["highContrast"] = "vscode-high-contrast";
  ApiThemeClassName2["highContrastLight"] = "vscode-high-contrast-light";
  return ApiThemeClassName2;
})(ApiThemeClassName || {});
((ApiThemeClassName2) => {
  function fromTheme(theme) {
    switch (theme.type) {
      case ColorScheme.LIGHT:
        return "vscode-light" /* light */;
      case ColorScheme.DARK:
        return "vscode-dark" /* dark */;
      case ColorScheme.HIGH_CONTRAST_DARK:
        return "vscode-high-contrast" /* highContrast */;
      case ColorScheme.HIGH_CONTRAST_LIGHT:
        return "vscode-high-contrast-light" /* highContrastLight */;
    }
  }
  ApiThemeClassName2.fromTheme = fromTheme;
})(ApiThemeClassName || (ApiThemeClassName = {}));
export {
  WebviewThemeDataProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlYnZpZXdcXGJyb3dzZXJcXHRoZW1laW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgREVGQVVMVF9GT05UX0ZBTUlMWSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb250cy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucywgRWRpdG9yRm9udExpZ2F0dXJlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRURJVE9SX0ZPTlRfREVGQVVMVFMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCAqIGFzIGNvbG9yUmVnaXN0cnkgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZ2V0U2l6ZVJlZ2lzdHJ5LCBzaXplVmFsdWVUb0NzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9zaXplUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29sb3JTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbG9yVGhlbWUsIElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBXZWJ2aWV3U3R5bGVzIH0gZnJvbSAnLi93ZWJ2aWV3LmpzJztcblxuaW50ZXJmYWNlIFdlYnZpZXdUaGVtZURhdGEge1xuXHRyZWFkb25seSBhY3RpdmVUaGVtZTogc3RyaW5nO1xuXHRyZWFkb25seSB0aGVtZUxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRoZW1lSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc3R5bGVzOiBSZWFkb25seTxXZWJ2aWV3U3R5bGVzPjtcbn1cblxuZXhwb3J0IGNsYXNzIFdlYnZpZXdUaGVtZURhdGFQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX2NhY2hlZFdlYlZpZXdUaGVtZURhdGE6IFdlYnZpZXdUaGVtZURhdGEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25UaGVtZURhdGFDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvblRoZW1lRGF0YUNoYW5nZWQgPSB0aGlzLl9vblRoZW1lRGF0YUNoYW5nZWQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVzZXQoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB3ZWJ2aWV3Q29uZmlndXJhdGlvbktleXMgPSBbJ2VkaXRvci5mb250RmFtaWx5JywgJ2VkaXRvci5mb250V2VpZ2h0JywgJ2VkaXRvci5mb250U2l6ZScsICdlZGl0b3IuZm9udExpZ2F0dXJlcycsICdhY2Nlc3NpYmlsaXR5LnVuZGVybGluZUxpbmtzJ107XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKHdlYnZpZXdDb25maWd1cmF0aW9uS2V5cy5zb21lKGtleSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKGtleSkpKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGdldFRoZW1lKCk6IElXb3JrYmVuY2hDb2xvclRoZW1lIHtcblx0XHRyZXR1cm4gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXZWJ2aWV3VGhlbWVEYXRhKCk6IFdlYnZpZXdUaGVtZURhdGEge1xuXHRcdGlmICghdGhpcy5fY2FjaGVkV2ViVmlld1RoZW1lRGF0YSkge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zPignZWRpdG9yJyk7XG5cdFx0XHRjb25zdCBlZGl0b3JGb250RmFtaWx5ID0gY29uZmlndXJhdGlvbi5mb250RmFtaWx5IHx8IEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRGYW1pbHk7XG5cdFx0XHRjb25zdCBlZGl0b3JGb250V2VpZ2h0ID0gY29uZmlndXJhdGlvbi5mb250V2VpZ2h0IHx8IEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRXZWlnaHQ7XG5cdFx0XHRjb25zdCBlZGl0b3JGb250U2l6ZSA9IGNvbmZpZ3VyYXRpb24uZm9udFNpemUgfHwgRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udFNpemU7XG5cdFx0XHRjb25zdCBlZGl0b3JGb250TGlnYXR1cmVzID0gbmV3IEVkaXRvckZvbnRMaWdhdHVyZXMoKS52YWxpZGF0ZShjb25maWd1cmF0aW9uLmZvbnRMaWdhdHVyZXMpO1xuXHRcdFx0Y29uc3QgbGlua1VuZGVybGluZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnYWNjZXNzaWJpbGl0eS51bmRlcmxpbmVMaW5rcycpO1xuXG5cdFx0XHRjb25zdCB0aGVtZSA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0XHRjb25zdCBleHBvcnRlZENvbG9ycyA9IGNvbG9yUmVnaXN0cnkuZ2V0Q29sb3JSZWdpc3RyeSgpLmdldENvbG9ycygpLnJlZHVjZTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+PigoY29sb3JzLCBlbnRyeSkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb2xvciA9IHRoZW1lLmdldENvbG9yKGVudHJ5LmlkKTtcblx0XHRcdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHRcdFx0Y29sb3JzWyd2c2NvZGUtJyArIGVudHJ5LmlkLnJlcGxhY2UoJy4nLCAnLScpXSA9IGNvbG9yLnRvU3RyaW5nKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNvbG9ycztcblx0XHRcdH0sIHt9KTtcblxuXHRcdFx0Y29uc3Qgc2l6ZVJlZ2lzdHJ5ID0gZ2V0U2l6ZVJlZ2lzdHJ5KCk7XG5cdFx0XHRjb25zdCBleHBvcnRlZFNpemVzID0gc2l6ZVJlZ2lzdHJ5LmdldFNpemVzKCkucmVkdWNlPFJlY29yZDxzdHJpbmcsIHN0cmluZz4+KChzaXplcywgZW50cnkpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2l6ZVZhbHVlID0gc2l6ZVJlZ2lzdHJ5LnJlc29sdmVEZWZhdWx0U2l6ZShlbnRyeS5pZCwgdGhlbWUpO1xuXHRcdFx0XHRpZiAoc2l6ZVZhbHVlKSB7XG5cdFx0XHRcdFx0c2l6ZXNbJ3ZzY29kZS0nICsgZW50cnkuaWQucmVwbGFjZSgvXFwuL2csICctJyldID0gc2l6ZVZhbHVlVG9Dc3Moc2l6ZVZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc2l6ZXM7XG5cdFx0XHR9LCB7fSk7XG5cblx0XHRcdGNvbnN0IHN0eWxlcyA9IHtcblx0XHRcdFx0J3ZzY29kZS1mb250LWZhbWlseSc6IERFRkFVTFRfRk9OVF9GQU1JTFksXG5cdFx0XHRcdCd2c2NvZGUtZm9udC13ZWlnaHQnOiAnbm9ybWFsJyxcblx0XHRcdFx0J3ZzY29kZS1mb250LXNpemUnOiAnMTNweCcsXG5cdFx0XHRcdCd2c2NvZGUtZWRpdG9yLWZvbnQtZmFtaWx5JzogZWRpdG9yRm9udEZhbWlseSxcblx0XHRcdFx0J3ZzY29kZS1lZGl0b3ItZm9udC13ZWlnaHQnOiBlZGl0b3JGb250V2VpZ2h0LFxuXHRcdFx0XHQndnNjb2RlLWVkaXRvci1mb250LXNpemUnOiBlZGl0b3JGb250U2l6ZSArICdweCcsXG5cdFx0XHRcdCd0ZXh0LWxpbmstZGVjb3JhdGlvbic6IGxpbmtVbmRlcmxpbmVzID8gJ3VuZGVybGluZScgOiAnbm9uZScsXG5cdFx0XHRcdC4uLmV4cG9ydGVkQ29sb3JzLFxuXHRcdFx0XHQuLi5leHBvcnRlZFNpemVzLFxuXHRcdFx0XHQndnNjb2RlLWVkaXRvci1mb250LWZlYXR1cmUtc2V0dGluZ3MnOiBlZGl0b3JGb250TGlnYXR1cmVzLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgYWN0aXZlVGhlbWUgPSBBcGlUaGVtZUNsYXNzTmFtZS5mcm9tVGhlbWUodGhlbWUpO1xuXHRcdFx0dGhpcy5fY2FjaGVkV2ViVmlld1RoZW1lRGF0YSA9IHsgc3R5bGVzLCBhY3RpdmVUaGVtZSwgdGhlbWVMYWJlbDogdGhlbWUubGFiZWwsIHRoZW1lSWQ6IHRoZW1lLnNldHRpbmdzSWQgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY2FjaGVkV2ViVmlld1RoZW1lRGF0YTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0KCkge1xuXHRcdHRoaXMuX2NhY2hlZFdlYlZpZXdUaGVtZURhdGEgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25UaGVtZURhdGFDaGFuZ2VkLmZpcmUoKTtcblx0fVxufVxuXG5lbnVtIEFwaVRoZW1lQ2xhc3NOYW1lIHtcblx0bGlnaHQgPSAndnNjb2RlLWxpZ2h0Jyxcblx0ZGFyayA9ICd2c2NvZGUtZGFyaycsXG5cdGhpZ2hDb250cmFzdCA9ICd2c2NvZGUtaGlnaC1jb250cmFzdCcsXG5cdGhpZ2hDb250cmFzdExpZ2h0ID0gJ3ZzY29kZS1oaWdoLWNvbnRyYXN0LWxpZ2h0Jyxcbn1cblxubmFtZXNwYWNlIEFwaVRoZW1lQ2xhc3NOYW1lIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21UaGVtZSh0aGVtZTogSVdvcmtiZW5jaENvbG9yVGhlbWUpOiBBcGlUaGVtZUNsYXNzTmFtZSB7XG5cdFx0c3dpdGNoICh0aGVtZS50eXBlKSB7XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkxJR0hUOiByZXR1cm4gQXBpVGhlbWVDbGFzc05hbWUubGlnaHQ7XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkRBUks6IHJldHVybiBBcGlUaGVtZUNsYXNzTmFtZS5kYXJrO1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0RBUks6IHJldHVybiBBcGlUaGVtZUNsYXNzTmFtZS5oaWdoQ29udHJhc3Q7XG5cdFx0XHRjYXNlIENvbG9yU2NoZW1lLkhJR0hfQ09OVFJBU1RfTElHSFQ6IHJldHVybiBBcGlUaGVtZUNsYXNzTmFtZS5oaWdoQ29udHJhc3RMaWdodDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQXlCLDJCQUEyQjtBQUNwRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDZCQUE2QjtBQUN0QyxZQUFZLG1CQUFtQjtBQUMvQixTQUFTLGlCQUFpQixzQkFBc0I7QUFDaEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBK0IsOEJBQThCO0FBVXRELElBQU0sMkJBQU4sY0FBdUMsV0FBVztBQUFBLEVBT3hELFlBQzBDLGVBQ0QsdUJBQ3ZDO0FBQ0QsVUFBTTtBQUhtQztBQUNEO0FBUHpDLFNBQVEsMEJBQXdEO0FBRWhFLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDekUsU0FBZ0IscUJBQXFCLEtBQUssb0JBQW9CO0FBUTdELFNBQUssVUFBVSxLQUFLLGNBQWMsc0JBQXNCLE1BQU07QUFDN0QsV0FBSyxPQUFPO0FBQUEsSUFDYixDQUFDLENBQUM7QUFFRixVQUFNLDJCQUEyQixDQUFDLHFCQUFxQixxQkFBcUIsbUJBQW1CLHdCQUF3Qiw4QkFBOEI7QUFDckosU0FBSyxVQUFVLEtBQUssc0JBQXNCLHlCQUF5QixPQUFLO0FBQ3ZFLFVBQUkseUJBQXlCLEtBQUssU0FBTyxFQUFFLHFCQUFxQixHQUFHLENBQUMsR0FBRztBQUN0RSxhQUFLLE9BQU87QUFBQSxNQUNiO0FBQUEsSUFDRCxDQUFD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
