import * as nls from "../../../../nls.js";
import * as types from "../../../../base/common/types.js";
import * as resources from "../../../../base/common/resources.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { ExtensionData, migrateThemeSettingsId } from "./workbenchThemeService.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions } from "../../extensionManagement/common/extensionFeatures.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ThemeTypeSelector } from "../../../../platform/theme/common/theme.js";
function registerColorThemeExtensionPoint() {
  return ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: "themes",
    jsonSchema: {
      description: nls.localize("vscode.extension.contributes.themes", "Contributes textmate color themes."),
      type: "array",
      items: {
        type: "object",
        defaultSnippets: [{ body: { label: "${1:label}", id: "${2:id}", uiTheme: ThemeTypeSelector.VS_DARK, path: "./themes/${3:id}.tmTheme." } }],
        properties: {
          id: {
            description: nls.localize("vscode.extension.contributes.themes.id", "Id of the color theme as used in the user settings."),
            type: "string"
          },
          label: {
            description: nls.localize("vscode.extension.contributes.themes.label", "Label of the color theme as shown in the UI."),
            type: "string"
          },
          uiTheme: {
            markdownDescription: nls.localize("vscode.extension.contributes.themes.uiTheme", "Base theme defining the colors around the editor: `vs` is the light color theme, `vs-dark` is the dark color theme. `hc-black` is the dark high contrast theme, `hc-light` is the light high contrast theme."),
            enum: [ThemeTypeSelector.VS, ThemeTypeSelector.VS_DARK, ThemeTypeSelector.HC_BLACK, ThemeTypeSelector.HC_LIGHT]
          },
          path: {
            markdownDescription: nls.localize("vscode.extension.contributes.themes.path", "Path of the tmTheme file. The path is relative to the extension folder and is typically `./colorthemes/awesome-color-theme.json`."),
            type: "string"
          }
        },
        required: ["path", "uiTheme"]
      }
    }
  });
}
function registerFileIconThemeExtensionPoint() {
  return ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: "iconThemes",
    jsonSchema: {
      description: nls.localize("vscode.extension.contributes.iconThemes", "Contributes file icon themes."),
      type: "array",
      items: {
        type: "object",
        defaultSnippets: [{ body: { id: "${1:id}", label: "${2:label}", path: "./fileicons/${3:id}-icon-theme.json" } }],
        properties: {
          id: {
            description: nls.localize("vscode.extension.contributes.iconThemes.id", "Id of the file icon theme as used in the user settings."),
            type: "string"
          },
          label: {
            description: nls.localize("vscode.extension.contributes.iconThemes.label", "Label of the file icon theme as shown in the UI."),
            type: "string"
          },
          path: {
            description: nls.localize("vscode.extension.contributes.iconThemes.path", "Path of the file icon theme definition file. The path is relative to the extension folder and is typically './fileicons/awesome-icon-theme.json'."),
            type: "string"
          }
        },
        required: ["path", "id"]
      }
    }
  });
}
function registerProductIconThemeExtensionPoint() {
  return ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: "productIconThemes",
    jsonSchema: {
      description: nls.localize("vscode.extension.contributes.productIconThemes", "Contributes product icon themes."),
      type: "array",
      items: {
        type: "object",
        defaultSnippets: [{ body: { id: "${1:id}", label: "${2:label}", path: "./producticons/${3:id}-product-icon-theme.json" } }],
        properties: {
          id: {
            description: nls.localize("vscode.extension.contributes.productIconThemes.id", "Id of the product icon theme as used in the user settings."),
            type: "string"
          },
          label: {
            description: nls.localize("vscode.extension.contributes.productIconThemes.label", "Label of the product icon theme as shown in the UI."),
            type: "string"
          },
          path: {
            description: nls.localize("vscode.extension.contributes.productIconThemes.path", "Path of the product icon theme definition file. The path is relative to the extension folder and is typically './producticons/awesome-product-icon-theme.json'."),
            type: "string"
          }
        },
        required: ["path", "id"]
      }
    }
  });
}
class ThemeDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "markdown";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.themes || !!manifest.contributes?.iconThemes || !!manifest.contributes?.productIconThemes;
  }
  render(manifest) {
    const markdown = new MarkdownString();
    if (manifest.contributes?.themes) {
      markdown.appendMarkdown(`### ${nls.localize("color themes", "Color Themes")}

`);
      for (const theme of manifest.contributes.themes) {
        markdown.appendMarkdown(`- ${theme.label}
`);
      }
    }
    if (manifest.contributes?.iconThemes) {
      markdown.appendMarkdown(`### ${nls.localize("file icon themes", "File Icon Themes")}

`);
      for (const theme of manifest.contributes.iconThemes) {
        markdown.appendMarkdown(`- ${theme.label}
`);
      }
    }
    if (manifest.contributes?.productIconThemes) {
      markdown.appendMarkdown(`### ${nls.localize("product icon themes", "Product Icon Themes")}

`);
      for (const theme of manifest.contributes.productIconThemes) {
        markdown.appendMarkdown(`- ${theme.label}
`);
      }
    }
    return {
      data: markdown,
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "themes",
  label: nls.localize("themes", "Themes"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ThemeDataRenderer)
});
class ThemeRegistry {
  constructor(themesExtPoint, create, idRequired = false, builtInTheme = void 0) {
    this.themesExtPoint = themesExtPoint;
    this.create = create;
    this.idRequired = idRequired;
    this.builtInTheme = builtInTheme;
    this.onDidChangeEmitter = new Emitter();
    this.onDidChange = this.onDidChangeEmitter.event;
    this.extensionThemes = [];
    this.initialize();
  }
  dispose() {
    this.themesExtPoint.setHandler(() => {
    });
    this.onDidChangeEmitter.dispose();
  }
  initialize() {
    this.themesExtPoint.setHandler((extensions, delta) => {
      const previousIds = {};
      const added = [];
      for (const theme of this.extensionThemes) {
        previousIds[theme.id] = theme;
      }
      this.extensionThemes.length = 0;
      for (const ext of extensions) {
        const extensionData = ExtensionData.fromName(ext.description.publisher, ext.description.name, ext.description.isBuiltin);
        this.onThemes(extensionData, ext.description.extensionLocation, ext.value, this.extensionThemes, ext.collector);
      }
      for (const theme of this.extensionThemes) {
        if (!previousIds[theme.id]) {
          added.push(theme);
        } else {
          delete previousIds[theme.id];
        }
      }
      const removed = Object.values(previousIds);
      this.onDidChangeEmitter.fire({ themes: this.extensionThemes, added, removed });
    });
  }
  onThemes(extensionData, extensionLocation, themeContributions, resultingThemes = [], log) {
    if (!Array.isArray(themeContributions)) {
      log?.error(nls.localize(
        "reqarray",
        "Extension point `{0}` must be an array.",
        this.themesExtPoint.name
      ));
      return resultingThemes;
    }
    themeContributions.forEach((theme) => {
      if (!theme.path || !types.isString(theme.path)) {
        log?.error(nls.localize(
          "reqpath",
          "Expected string in `contributes.{0}.path`. Provided value: {1}",
          this.themesExtPoint.name,
          String(theme.path)
        ));
        return;
      }
      if (this.idRequired && (!theme.id || !types.isString(theme.id))) {
        log?.error(nls.localize(
          "reqid",
          "Expected string in `contributes.{0}.id`. Provided value: {1}",
          this.themesExtPoint.name,
          String(theme.id)
        ));
        return;
      }
      const themeLocation = resources.joinPath(extensionLocation, theme.path);
      if (!resources.isEqualOrParent(themeLocation, extensionLocation)) {
        log?.warn(nls.localize("invalid.path.1", "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", this.themesExtPoint.name, themeLocation.path, extensionLocation.path));
      }
      const themeData = this.create(theme, themeLocation, extensionData);
      resultingThemes.push(themeData);
    });
    return resultingThemes;
  }
  findThemeById(themeId) {
    if (this.builtInTheme && this.builtInTheme.id === themeId) {
      return this.builtInTheme;
    }
    const allThemes = this.getThemes();
    for (const t of allThemes) {
      if (t.id === themeId) {
        return t;
      }
    }
    return void 0;
  }
  findThemeBySettingsId(settingsId, defaultSettingsId) {
    const migratedId = settingsId ? migrateThemeSettingsId(settingsId) : settingsId;
    if (this.builtInTheme && this.builtInTheme.settingsId === migratedId) {
      return this.builtInTheme;
    }
    const allThemes = this.getThemes();
    let defaultTheme = void 0;
    for (const t of allThemes) {
      if (t.settingsId === migratedId) {
        return t;
      }
      if (t.settingsId === defaultSettingsId) {
        defaultTheme = t;
      }
    }
    return defaultTheme;
  }
  findThemeByExtensionLocation(extLocation) {
    if (extLocation) {
      return this.getThemes().filter((t) => t.location && resources.isEqualOrParent(t.location, extLocation));
    }
    return [];
  }
  getThemes() {
    return this.extensionThemes;
  }
  getMarketplaceThemes(manifest, extensionLocation, extensionData) {
    const themes = manifest?.contributes?.[this.themesExtPoint.name];
    if (Array.isArray(themes)) {
      return this.onThemes(extensionData, extensionLocation, themes);
    }
    return [];
  }
}
export {
  ThemeRegistry,
  registerColorThemeExtensionPoint,
  registerFileIconThemeExtensionPoint,
  registerProductIconThemeExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcdGhlbWVFeHRlbnNpb25Qb2ludHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yLCBJRXh0ZW5zaW9uUG9pbnQsIEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EYXRhLCBJVGhlbWVFeHRlbnNpb25Qb2ludCwgbWlncmF0ZVRoZW1lU2V0dGluZ3NJZCB9IGZyb20gJy4vd29ya2JlbmNoVGhlbWVTZXJ2aWNlLmpzJztcblxuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVNYXJrZG93blJlbmRlcmVyLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgSVJlbmRlcmVkRGF0YSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgVGhlbWVUeXBlU2VsZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb2xvclRoZW1lRXh0ZW5zaW9uUG9pbnQoKSB7XG5cdHJldHVybiBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJVGhlbWVFeHRlbnNpb25Qb2ludFtdPih7XG5cdFx0ZXh0ZW5zaW9uUG9pbnQ6ICd0aGVtZXMnLFxuXHRcdGpzb25TY2hlbWE6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGhlbWVzJywgJ0NvbnRyaWJ1dGVzIHRleHRtYXRlIGNvbG9yIHRoZW1lcy4nKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGxhYmVsOiAnJHsxOmxhYmVsfScsIGlkOiAnJHsyOmlkfScsIHVpVGhlbWU6IFRoZW1lVHlwZVNlbGVjdG9yLlZTX0RBUkssIHBhdGg6ICcuL3RoZW1lcy8kezM6aWR9LnRtVGhlbWUuJyB9IH1dLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGhlbWVzLmlkJywgJ0lkIG9mIHRoZSBjb2xvciB0aGVtZSBhcyB1c2VkIGluIHRoZSB1c2VyIHNldHRpbmdzLicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGxhYmVsOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRoZW1lcy5sYWJlbCcsICdMYWJlbCBvZiB0aGUgY29sb3IgdGhlbWUgYXMgc2hvd24gaW4gdGhlIFVJLicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHVpVGhlbWU6IHtcblx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50aGVtZXMudWlUaGVtZScsICdCYXNlIHRoZW1lIGRlZmluaW5nIHRoZSBjb2xvcnMgYXJvdW5kIHRoZSBlZGl0b3I6IGB2c2AgaXMgdGhlIGxpZ2h0IGNvbG9yIHRoZW1lLCBgdnMtZGFya2AgaXMgdGhlIGRhcmsgY29sb3IgdGhlbWUuIGBoYy1ibGFja2AgaXMgdGhlIGRhcmsgaGlnaCBjb250cmFzdCB0aGVtZSwgYGhjLWxpZ2h0YCBpcyB0aGUgbGlnaHQgaGlnaCBjb250cmFzdCB0aGVtZS4nKSxcblx0XHRcdFx0XHRcdGVudW06IFtUaGVtZVR5cGVTZWxlY3Rvci5WUywgVGhlbWVUeXBlU2VsZWN0b3IuVlNfREFSSywgVGhlbWVUeXBlU2VsZWN0b3IuSENfQkxBQ0ssIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0xJR0hUXVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRoZW1lcy5wYXRoJywgJ1BhdGggb2YgdGhlIHRtVGhlbWUgZmlsZS4gVGhlIHBhdGggaXMgcmVsYXRpdmUgdG8gdGhlIGV4dGVuc2lvbiBmb2xkZXIgYW5kIGlzIHR5cGljYWxseSBgLi9jb2xvcnRoZW1lcy9hd2Vzb21lLWNvbG9yLXRoZW1lLmpzb25gLicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ3BhdGgnLCAndWlUaGVtZSddXG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckZpbGVJY29uVGhlbWVFeHRlbnNpb25Qb2ludCgpIHtcblx0cmV0dXJuIEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElUaGVtZUV4dGVuc2lvblBvaW50W10+KHtcblx0XHRleHRlbnNpb25Qb2ludDogJ2ljb25UaGVtZXMnLFxuXHRcdGpzb25TY2hlbWE6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuaWNvblRoZW1lcycsICdDb250cmlidXRlcyBmaWxlIGljb24gdGhlbWVzLicpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgaWQ6ICckezE6aWR9JywgbGFiZWw6ICckezI6bGFiZWx9JywgcGF0aDogJy4vZmlsZWljb25zLyR7MzppZH0taWNvbi10aGVtZS5qc29uJyB9IH1dLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuaWNvblRoZW1lcy5pZCcsICdJZCBvZiB0aGUgZmlsZSBpY29uIHRoZW1lIGFzIHVzZWQgaW4gdGhlIHVzZXIgc2V0dGluZ3MuJyksXG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bGFiZWw6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuaWNvblRoZW1lcy5sYWJlbCcsICdMYWJlbCBvZiB0aGUgZmlsZSBpY29uIHRoZW1lIGFzIHNob3duIGluIHRoZSBVSS4nKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmljb25UaGVtZXMucGF0aCcsICdQYXRoIG9mIHRoZSBmaWxlIGljb24gdGhlbWUgZGVmaW5pdGlvbiBmaWxlLiBUaGUgcGF0aCBpcyByZWxhdGl2ZSB0byB0aGUgZXh0ZW5zaW9uIGZvbGRlciBhbmQgaXMgdHlwaWNhbGx5IFxcJy4vZmlsZWljb25zL2F3ZXNvbWUtaWNvbi10aGVtZS5qc29uXFwnLicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ3BhdGgnLCAnaWQnXVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlclByb2R1Y3RJY29uVGhlbWVFeHRlbnNpb25Qb2ludCgpIHtcblx0cmV0dXJuIEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElUaGVtZUV4dGVuc2lvblBvaW50W10+KHtcblx0XHRleHRlbnNpb25Qb2ludDogJ3Byb2R1Y3RJY29uVGhlbWVzJyxcblx0XHRqc29uU2NoZW1hOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnByb2R1Y3RJY29uVGhlbWVzJywgJ0NvbnRyaWJ1dGVzIHByb2R1Y3QgaWNvbiB0aGVtZXMuJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBpZDogJyR7MTppZH0nLCBsYWJlbDogJyR7MjpsYWJlbH0nLCBwYXRoOiAnLi9wcm9kdWN0aWNvbnMvJHszOmlkfS1wcm9kdWN0LWljb24tdGhlbWUuanNvbicgfSB9XSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnByb2R1Y3RJY29uVGhlbWVzLmlkJywgJ0lkIG9mIHRoZSBwcm9kdWN0IGljb24gdGhlbWUgYXMgdXNlZCBpbiB0aGUgdXNlciBzZXR0aW5ncy4nKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsYWJlbDoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5wcm9kdWN0SWNvblRoZW1lcy5sYWJlbCcsICdMYWJlbCBvZiB0aGUgcHJvZHVjdCBpY29uIHRoZW1lIGFzIHNob3duIGluIHRoZSBVSS4nKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnByb2R1Y3RJY29uVGhlbWVzLnBhdGgnLCAnUGF0aCBvZiB0aGUgcHJvZHVjdCBpY29uIHRoZW1lIGRlZmluaXRpb24gZmlsZS4gVGhlIHBhdGggaXMgcmVsYXRpdmUgdG8gdGhlIGV4dGVuc2lvbiBmb2xkZXIgYW5kIGlzIHR5cGljYWxseSBcXCcuL3Byb2R1Y3RpY29ucy9hd2Vzb21lLXByb2R1Y3QtaWNvbi10aGVtZS5qc29uXFwnLicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ3BhdGgnLCAnaWQnXVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbmNsYXNzIFRoZW1lRGF0YVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlTWFya2Rvd25SZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICdtYXJrZG93bic7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8udGhlbWVzIHx8ICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/Lmljb25UaGVtZXMgfHwgISFtYW5pZmVzdC5jb250cmlidXRlcz8ucHJvZHVjdEljb25UaGVtZXM7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SU1hcmtkb3duU3RyaW5nPiB7XG5cdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRpZiAobWFuaWZlc3QuY29udHJpYnV0ZXM/LnRoZW1lcykge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCMjIyAke25scy5sb2NhbGl6ZSgnY29sb3IgdGhlbWVzJywgXCJDb2xvciBUaGVtZXNcIil9XFxuXFxuYCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRoZW1lIG9mIG1hbmlmZXN0LmNvbnRyaWJ1dGVzLnRoZW1lcykge1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgLSAke3RoZW1lLmxhYmVsfVxcbmApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAobWFuaWZlc3QuY29udHJpYnV0ZXM/Lmljb25UaGVtZXMpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAjIyMgJHtubHMubG9jYWxpemUoJ2ZpbGUgaWNvbiB0aGVtZXMnLCBcIkZpbGUgSWNvbiBUaGVtZXNcIil9XFxuXFxuYCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRoZW1lIG9mIG1hbmlmZXN0LmNvbnRyaWJ1dGVzLmljb25UaGVtZXMpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYC0gJHt0aGVtZS5sYWJlbH1cXG5gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5wcm9kdWN0SWNvblRoZW1lcykge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCMjIyAke25scy5sb2NhbGl6ZSgncHJvZHVjdCBpY29uIHRoZW1lcycsIFwiUHJvZHVjdCBJY29uIFRoZW1lc1wiKX1cXG5cXG5gKTtcblx0XHRcdGZvciAoY29uc3QgdGhlbWUgb2YgbWFuaWZlc3QuY29udHJpYnV0ZXMucHJvZHVjdEljb25UaGVtZXMpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYC0gJHt0aGVtZS5sYWJlbH1cXG5gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IG1hcmtkb3duLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyAvKiBub29wICovIH1cblx0XHR9O1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAndGhlbWVzJyxcblx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndGhlbWVzJywgXCJUaGVtZXNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihUaGVtZURhdGFSZW5kZXJlciksXG59KTtcblxuZXhwb3J0IGludGVyZmFjZSBUaGVtZUNoYW5nZUV2ZW50PFQ+IHtcblx0dGhlbWVzOiBUW107XG5cdGFkZGVkOiBUW107XG5cdHJlbW92ZWQ6IFRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGhlbWVEYXRhIHtcblx0aWQ6IHN0cmluZztcblx0c2V0dGluZ3NJZDogc3RyaW5nIHwgbnVsbDtcblx0bG9jYXRpb24/OiBVUkk7XG59XG5cbmV4cG9ydCBjbGFzcyBUaGVtZVJlZ2lzdHJ5PFQgZXh0ZW5kcyBJVGhlbWVEYXRhPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGV4dGVuc2lvblRoZW1lczogVFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8VGhlbWVDaGFuZ2VFdmVudDxUPj4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxUaGVtZUNoYW5nZUV2ZW50PFQ+PiA9IHRoaXMub25EaWRDaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGhlbWVzRXh0UG9pbnQ6IElFeHRlbnNpb25Qb2ludDxJVGhlbWVFeHRlbnNpb25Qb2ludFtdPixcblx0XHRwcml2YXRlIGNyZWF0ZTogKHRoZW1lOiBJVGhlbWVFeHRlbnNpb25Qb2ludCwgdGhlbWVMb2NhdGlvbjogVVJJLCBleHRlbnNpb25EYXRhOiBFeHRlbnNpb25EYXRhKSA9PiBULFxuXHRcdHByaXZhdGUgaWRSZXF1aXJlZCA9IGZhbHNlLFxuXHRcdHByaXZhdGUgYnVpbHRJblRoZW1lOiBUIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkXG5cdCkge1xuXHRcdHRoaXMuZXh0ZW5zaW9uVGhlbWVzID0gW107XG5cdFx0dGhpcy5pbml0aWFsaXplKCk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMudGhlbWVzRXh0UG9pbnQuc2V0SGFuZGxlcigoKSA9PiB7IH0pO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VFbWl0dGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZSgpIHtcblx0XHR0aGlzLnRoZW1lc0V4dFBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIGRlbHRhKSA9PiB7XG5cdFx0XHRjb25zdCBwcmV2aW91c0lkczogeyBba2V5OiBzdHJpbmddOiBUIH0gPSB7fTtcblxuXHRcdFx0Y29uc3QgYWRkZWQ6IFRbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCB0aGVtZSBvZiB0aGlzLmV4dGVuc2lvblRoZW1lcykge1xuXHRcdFx0XHRwcmV2aW91c0lkc1t0aGVtZS5pZF0gPSB0aGVtZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZXh0ZW5zaW9uVGhlbWVzLmxlbmd0aCA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dCBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkRhdGEgPSBFeHRlbnNpb25EYXRhLmZyb21OYW1lKGV4dC5kZXNjcmlwdGlvbi5wdWJsaXNoZXIsIGV4dC5kZXNjcmlwdGlvbi5uYW1lLCBleHQuZGVzY3JpcHRpb24uaXNCdWlsdGluKTtcblx0XHRcdFx0dGhpcy5vblRoZW1lcyhleHRlbnNpb25EYXRhLCBleHQuZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGV4dC52YWx1ZSwgdGhpcy5leHRlbnNpb25UaGVtZXMsIGV4dC5jb2xsZWN0b3IpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0aGVtZSBvZiB0aGlzLmV4dGVuc2lvblRoZW1lcykge1xuXHRcdFx0XHRpZiAoIXByZXZpb3VzSWRzW3RoZW1lLmlkXSkge1xuXHRcdFx0XHRcdGFkZGVkLnB1c2godGhlbWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlbGV0ZSBwcmV2aW91c0lkc1t0aGVtZS5pZF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlbW92ZWQgPSBPYmplY3QudmFsdWVzKHByZXZpb3VzSWRzKTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VFbWl0dGVyLmZpcmUoeyB0aGVtZXM6IHRoaXMuZXh0ZW5zaW9uVGhlbWVzLCBhZGRlZCwgcmVtb3ZlZCB9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25UaGVtZXMoZXh0ZW5zaW9uRGF0YTogRXh0ZW5zaW9uRGF0YSwgZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgdGhlbWVDb250cmlidXRpb25zOiBJVGhlbWVFeHRlbnNpb25Qb2ludFtdLCByZXN1bHRpbmdUaGVtZXM6IFRbXSA9IFtdLCBsb2c/OiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogVFtdIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkodGhlbWVDb250cmlidXRpb25zKSkge1xuXHRcdFx0bG9nPy5lcnJvcihubHMubG9jYWxpemUoXG5cdFx0XHRcdCdyZXFhcnJheScsXG5cdFx0XHRcdFwiRXh0ZW5zaW9uIHBvaW50IGB7MH1gIG11c3QgYmUgYW4gYXJyYXkuXCIsXG5cdFx0XHRcdHRoaXMudGhlbWVzRXh0UG9pbnQubmFtZVxuXHRcdFx0KSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0aW5nVGhlbWVzO1xuXHRcdH1cblx0XHR0aGVtZUNvbnRyaWJ1dGlvbnMuZm9yRWFjaCh0aGVtZSA9PiB7XG5cdFx0XHRpZiAoIXRoZW1lLnBhdGggfHwgIXR5cGVzLmlzU3RyaW5nKHRoZW1lLnBhdGgpKSB7XG5cdFx0XHRcdGxvZz8uZXJyb3IobmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdCdyZXFwYXRoJyxcblx0XHRcdFx0XHRcIkV4cGVjdGVkIHN0cmluZyBpbiBgY29udHJpYnV0ZXMuezB9LnBhdGhgLiBQcm92aWRlZCB2YWx1ZTogezF9XCIsXG5cdFx0XHRcdFx0dGhpcy50aGVtZXNFeHRQb2ludC5uYW1lLFxuXHRcdFx0XHRcdFN0cmluZyh0aGVtZS5wYXRoKVxuXHRcdFx0XHQpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaWRSZXF1aXJlZCAmJiAoIXRoZW1lLmlkIHx8ICF0eXBlcy5pc1N0cmluZyh0aGVtZS5pZCkpKSB7XG5cdFx0XHRcdGxvZz8uZXJyb3IobmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdCdyZXFpZCcsXG5cdFx0XHRcdFx0XCJFeHBlY3RlZCBzdHJpbmcgaW4gYGNvbnRyaWJ1dGVzLnswfS5pZGAuIFByb3ZpZGVkIHZhbHVlOiB7MX1cIixcblx0XHRcdFx0XHR0aGlzLnRoZW1lc0V4dFBvaW50Lm5hbWUsXG5cdFx0XHRcdFx0U3RyaW5nKHRoZW1lLmlkKVxuXHRcdFx0XHQpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0aGVtZUxvY2F0aW9uID0gcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCB0aGVtZS5wYXRoKTtcblx0XHRcdGlmICghcmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudCh0aGVtZUxvY2F0aW9uLCBleHRlbnNpb25Mb2NhdGlvbikpIHtcblx0XHRcdFx0bG9nPy53YXJuKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5wYXRoLjEnLCBcIkV4cGVjdGVkIGBjb250cmlidXRlcy57MH0ucGF0aGAgKHsxfSkgdG8gYmUgaW5jbHVkZWQgaW5zaWRlIGV4dGVuc2lvbidzIGZvbGRlciAoezJ9KS4gVGhpcyBtaWdodCBtYWtlIHRoZSBleHRlbnNpb24gbm9uLXBvcnRhYmxlLlwiLCB0aGlzLnRoZW1lc0V4dFBvaW50Lm5hbWUsIHRoZW1lTG9jYXRpb24ucGF0aCwgZXh0ZW5zaW9uTG9jYXRpb24ucGF0aCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0aGVtZURhdGEgPSB0aGlzLmNyZWF0ZSh0aGVtZSwgdGhlbWVMb2NhdGlvbiwgZXh0ZW5zaW9uRGF0YSk7XG5cdFx0XHRyZXN1bHRpbmdUaGVtZXMucHVzaCh0aGVtZURhdGEpO1xuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHRpbmdUaGVtZXM7XG5cdH1cblxuXHRwdWJsaWMgZmluZFRoZW1lQnlJZCh0aGVtZUlkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5idWlsdEluVGhlbWUgJiYgdGhpcy5idWlsdEluVGhlbWUuaWQgPT09IHRoZW1lSWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmJ1aWx0SW5UaGVtZTtcblx0XHR9XG5cdFx0Y29uc3QgYWxsVGhlbWVzID0gdGhpcy5nZXRUaGVtZXMoKTtcblx0XHRmb3IgKGNvbnN0IHQgb2YgYWxsVGhlbWVzKSB7XG5cdFx0XHRpZiAodC5pZCA9PT0gdGhlbWVJZCkge1xuXHRcdFx0XHRyZXR1cm4gdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBmaW5kVGhlbWVCeVNldHRpbmdzSWQoc2V0dGluZ3NJZDogc3RyaW5nIHwgbnVsbCwgZGVmYXVsdFNldHRpbmdzSWQ/OiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtaWdyYXRlZElkID0gc2V0dGluZ3NJZCA/IG1pZ3JhdGVUaGVtZVNldHRpbmdzSWQoc2V0dGluZ3NJZCkgOiBzZXR0aW5nc0lkO1xuXHRcdGlmICh0aGlzLmJ1aWx0SW5UaGVtZSAmJiB0aGlzLmJ1aWx0SW5UaGVtZS5zZXR0aW5nc0lkID09PSBtaWdyYXRlZElkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5idWlsdEluVGhlbWU7XG5cdFx0fVxuXHRcdGNvbnN0IGFsbFRoZW1lcyA9IHRoaXMuZ2V0VGhlbWVzKCk7XG5cdFx0bGV0IGRlZmF1bHRUaGVtZTogVCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHQgb2YgYWxsVGhlbWVzKSB7XG5cdFx0XHRpZiAodC5zZXR0aW5nc0lkID09PSBtaWdyYXRlZElkKSB7XG5cdFx0XHRcdHJldHVybiB0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHQuc2V0dGluZ3NJZCA9PT0gZGVmYXVsdFNldHRpbmdzSWQpIHtcblx0XHRcdFx0ZGVmYXVsdFRoZW1lID0gdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGRlZmF1bHRUaGVtZTtcblx0fVxuXG5cdHB1YmxpYyBmaW5kVGhlbWVCeUV4dGVuc2lvbkxvY2F0aW9uKGV4dExvY2F0aW9uOiBVUkkgfCB1bmRlZmluZWQpOiBUW10ge1xuXHRcdGlmIChleHRMb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0VGhlbWVzKCkuZmlsdGVyKHQgPT4gdC5sb2NhdGlvbiAmJiByZXNvdXJjZXMuaXNFcXVhbE9yUGFyZW50KHQubG9jYXRpb24sIGV4dExvY2F0aW9uKSk7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUaGVtZXMoKTogVFtdIHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25UaGVtZXM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TWFya2V0cGxhY2VUaGVtZXMobWFuaWZlc3Q6IGFueSwgZXh0ZW5zaW9uTG9jYXRpb246IFVSSSwgZXh0ZW5zaW9uRGF0YTogRXh0ZW5zaW9uRGF0YSk6IFRbXSB7XG5cdFx0Y29uc3QgdGhlbWVzID0gbWFuaWZlc3Q/LmNvbnRyaWJ1dGVzPy5bdGhpcy50aGVtZXNFeHRQb2ludC5uYW1lXTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh0aGVtZXMpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5vblRoZW1lcyhleHRlbnNpb25EYXRhLCBleHRlbnNpb25Mb2NhdGlvbiwgdGhlbWVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUVyQixZQUFZLFdBQVc7QUFDdkIsWUFBWSxlQUFlO0FBQzNCLFNBQXFELDBCQUEwQjtBQUMvRSxTQUFTLGVBQXFDLDhCQUE4QjtBQUU1RSxTQUFnQixlQUFlO0FBRS9CLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsa0JBQWdHO0FBRXpHLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUUzQixTQUFTLG1DQUFtQztBQUNsRCxTQUFPLG1CQUFtQix1QkFBK0M7QUFBQSxJQUN4RSxnQkFBZ0I7QUFBQSxJQUNoQixZQUFZO0FBQUEsTUFDWCxhQUFhLElBQUksU0FBUyx1Q0FBdUMsb0NBQW9DO0FBQUEsTUFDckcsTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04saUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyxjQUFjLElBQUksV0FBVyxTQUFTLGtCQUFrQixTQUFTLE1BQU0sNEJBQTRCLEVBQUUsQ0FBQztBQUFBLFFBQ3pJLFlBQVk7QUFBQSxVQUNYLElBQUk7QUFBQSxZQUNILGFBQWEsSUFBSSxTQUFTLDBDQUEwQyxxREFB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
