import * as nls from "../../../../nls.js";
import * as paths from "../../../../base/common/path.js";
import * as resources from "../../../../base/common/resources.js";
import * as Json from "../../../../base/common/json.js";
import { ExtensionData } from "../common/workbenchThemeService.js";
import { getParseErrorMessage } from "../../../../base/common/jsonErrorMessages.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { fontColorRegex, fontSizeRegex } from "../../../../platform/theme/common/iconRegistry.js";
import * as css from "../../../../base/browser/cssValue.js";
import { fileIconSelectorEscape } from "../../../../editor/common/services/getIconClasses.js";
const _FileIconThemeData = class _FileIconThemeData {
  constructor(id, label, settingsId) {
    this.id = id;
    this.label = label;
    this.settingsId = settingsId;
    this.isLoaded = false;
    this.hasFileIcons = false;
    this.hasFolderIcons = false;
    this.hidesExplorerArrows = false;
  }
  ensureLoaded(themeLoader) {
    return !this.isLoaded ? this.load(themeLoader) : Promise.resolve(this.styleSheetContent);
  }
  reload(themeLoader) {
    return this.load(themeLoader);
  }
  load(themeLoader) {
    return themeLoader.load(this);
  }
  static fromExtensionTheme(iconTheme, iconThemeLocation, extensionData) {
    const id = extensionData.extensionId + "-" + iconTheme.id;
    const label = iconTheme.label || paths.basename(iconTheme.path);
    const settingsId = iconTheme.id;
    const themeData = new _FileIconThemeData(id, label, settingsId);
    themeData.description = iconTheme.description;
    themeData.location = iconThemeLocation;
    themeData.extensionData = extensionData;
    themeData.watch = iconTheme._watch;
    themeData.isLoaded = false;
    return themeData;
  }
  static get noIconTheme() {
    let themeData = _FileIconThemeData._noIconTheme;
    if (!themeData) {
      themeData = _FileIconThemeData._noIconTheme = new _FileIconThemeData("", "", null);
      themeData.hasFileIcons = false;
      themeData.hasFolderIcons = false;
      themeData.hidesExplorerArrows = false;
      themeData.isLoaded = true;
      themeData.extensionData = void 0;
      themeData.watch = false;
    }
    return themeData;
  }
  static createUnloadedTheme(id) {
    const themeData = new _FileIconThemeData(id, "", "__" + id);
    themeData.isLoaded = false;
    themeData.hasFileIcons = false;
    themeData.hasFolderIcons = false;
    themeData.hidesExplorerArrows = false;
    themeData.extensionData = void 0;
    themeData.watch = false;
    return themeData;
  }
  static fromStorageData(storageService) {
    const input = storageService.get(_FileIconThemeData.STORAGE_KEY, StorageScope.PROFILE);
    if (!input) {
      return void 0;
    }
    try {
      const data = JSON.parse(input);
      const theme = new _FileIconThemeData("", "", null);
      for (const key in data) {
        switch (key) {
          case "id":
          case "label":
          case "description":
          case "settingsId":
          case "styleSheetContent":
          case "hasFileIcons":
          case "hidesExplorerArrows":
          case "hasFolderIcons":
          case "watch":
            theme[key] = data[key];
            break;
          case "location":
            break;
          case "extensionData":
            theme.extensionData = ExtensionData.fromJSONObject(data.extensionData);
            break;
        }
      }
      return theme;
    } catch (e) {
      return void 0;
    }
  }
  toStorage(storageService) {
    const data = JSON.stringify({
      id: this.id,
      label: this.label,
      description: this.description,
      settingsId: this.settingsId,
      styleSheetContent: this.styleSheetContent,
      hasFileIcons: this.hasFileIcons,
      hasFolderIcons: this.hasFolderIcons,
      hidesExplorerArrows: this.hidesExplorerArrows,
      extensionData: ExtensionData.toJSONObject(this.extensionData),
      watch: this.watch
    });
    storageService.store(_FileIconThemeData.STORAGE_KEY, data, StorageScope.PROFILE, StorageTarget.MACHINE);
  }
};
_FileIconThemeData.STORAGE_KEY = "iconThemeData";
_FileIconThemeData._noIconTheme = null;
let FileIconThemeData = _FileIconThemeData;
class FileIconThemeLoader {
  constructor(fileService, languageService) {
    this.fileService = fileService;
    this.languageService = languageService;
  }
  load(data) {
    if (!data.location) {
      return Promise.resolve(data.styleSheetContent);
    }
    return this.loadIconThemeDocument(data.location).then((iconThemeDocument) => {
      const result = this.processIconThemeDocument(data.id, data.location, iconThemeDocument);
      data.styleSheetContent = result.content;
      data.hasFileIcons = result.hasFileIcons;
      data.hasFolderIcons = result.hasFolderIcons;
      data.hidesExplorerArrows = result.hidesExplorerArrows;
      data.isLoaded = true;
      return data.styleSheetContent;
    });
  }
  loadIconThemeDocument(location) {
    return this.fileService.readExtensionResource(location).then((content) => {
      const errors = [];
      const contentValue = Json.parse(content, errors);
      if (errors.length > 0) {
        return Promise.reject(new Error(nls.localize("error.cannotparseicontheme", "Problems parsing file icons file: {0}", errors.map((e) => getParseErrorMessage(e.error)).join(", "))));
      } else if (Json.getNodeType(contentValue) !== "object") {
        return Promise.reject(new Error(nls.localize("error.invalidformat", "Invalid format for file icons theme file: Object expected.")));
      }
      return Promise.resolve(contentValue);
    });
  }
  processIconThemeDocument(id, iconThemeDocumentLocation, iconThemeDocument) {
    const result = { content: "", hasFileIcons: false, hasFolderIcons: false, hidesExplorerArrows: !!iconThemeDocument.hidesExplorerArrows };
    let hasSpecificFileIcons = false;
    if (!iconThemeDocument.iconDefinitions) {
      return result;
    }
    const selectorByDefinitionId = {};
    const coveredLanguages = {};
    const iconThemeDocumentLocationDirname = resources.dirname(iconThemeDocumentLocation);
    function resolvePath(path) {
      return resources.joinPath(iconThemeDocumentLocationDirname, path);
    }
    function collectSelectors(associations, baseThemeClassName) {
      function addSelector(selector, defId) {
        if (defId) {
          let list = selectorByDefinitionId[defId];
          if (!list) {
            list = selectorByDefinitionId[defId] = new css.Builder();
          }
          list.push(selector);
        }
      }
      if (associations) {
        let qualifier = css.inline`.show-file-icons`;
        if (baseThemeClassName) {
          qualifier = css.inline`${baseThemeClassName} ${qualifier}`;
        }
        const expanded = css.inline`.monaco-tl-twistie.collapsible:not(.collapsed) + .monaco-tl-contents`;
        if (associations.folder) {
          addSelector(css.inline`${qualifier} .folder-icon::before`, associations.folder);
          result.hasFolderIcons = true;
        }
        if (associations.folderExpanded) {
          addSelector(css.inline`${qualifier} ${expanded} .folder-icon::before`, associations.folderExpanded);
          result.hasFolderIcons = true;
        }
        const rootFolder = associations.rootFolder || associations.folder;
        const rootFolderExpanded = associations.rootFolderExpanded || associations.folderExpanded;
        if (rootFolder) {
          addSelector(css.inline`${qualifier} .rootfolder-icon::before`, rootFolder);
          result.hasFolderIcons = true;
        }
        if (rootFolderExpanded) {
          addSelector(css.inline`${qualifier} ${expanded} .rootfolder-icon::before`, rootFolderExpanded);
          result.hasFolderIcons = true;
        }
        if (associations.file) {
          addSelector(css.inline`${qualifier} .file-icon::before`, associations.file);
          result.hasFileIcons = true;
        }
        const folderNames = associations.folderNames;
        if (folderNames) {
          for (const key in folderNames) {
            const selectors = new css.Builder();
            const name = handleParentFolder(key.toLowerCase(), selectors);
            selectors.push(css.inline`.${classSelectorPart(name)}-name-folder-icon`);
            addSelector(css.inline`${qualifier} ${selectors.join("")}.folder-icon::before`, folderNames[key]);
            result.hasFolderIcons = true;
          }
        }
        const folderNamesExpanded = associations.folderNamesExpanded;
        if (folderNamesExpanded) {
          for (const key in folderNamesExpanded) {
            const selectors = new css.Builder();
            const name = handleParentFolder(key.toLowerCase(), selectors);
            selectors.push(css.inline`.${classSelectorPart(name)}-name-folder-icon`);
            addSelector(css.inline`${qualifier} ${expanded} ${selectors.join("")}.folder-icon::before`, folderNamesExpanded[key]);
            result.hasFolderIcons = true;
          }
        }
        const rootFolderNames = associations.rootFolderNames;
        if (rootFolderNames) {
          for (const key in rootFolderNames) {
            const name = key.toLowerCase();
            addSelector(css.inline`${qualifier} .${classSelectorPart(name)}-root-name-folder-icon.rootfolder-icon::before`, rootFolderNames[key]);
            result.hasFolderIcons = true;
          }
        }
        const rootFolderNamesExpanded = associations.rootFolderNamesExpanded;
        if (rootFolderNamesExpanded) {
          for (const key in rootFolderNamesExpanded) {
            const name = key.toLowerCase();
            addSelector(css.inline`${qualifier} ${expanded} .${classSelectorPart(name)}-root-name-folder-icon.rootfolder-icon::before`, rootFolderNamesExpanded[key]);
            result.hasFolderIcons = true;
          }
        }
        const languageIds = associations.languageIds;
        if (languageIds) {
          if (!languageIds.jsonc && languageIds.json) {
            languageIds.jsonc = languageIds.json;
          }
          for (const languageId in languageIds) {
            addSelector(css.inline`${qualifier} .${classSelectorPart(languageId)}-lang-file-icon.file-icon::before`, languageIds[languageId]);
            result.hasFileIcons = true;
            hasSpecificFileIcons = true;
            coveredLanguages[languageId] = true;
          }
        }
        const fileExtensions = associations.fileExtensions;
        if (fileExtensions) {
          for (const key in fileExtensions) {
            const selectors = new css.Builder();
            const name = handleParentFolder(key.toLowerCase(), selectors);
            const segments = name.split(".");
            if (segments.length) {
              for (let i = 0; i < segments.length; i++) {
                selectors.push(css.inline`.${classSelectorPart(segments.slice(i).join("."))}-ext-file-icon`);
              }
              selectors.push(css.inline`.ext-file-icon`);
            }
            addSelector(css.inline`${qualifier} ${selectors.join("")}.file-icon::before`, fileExtensions[key]);
            result.hasFileIcons = true;
            hasSpecificFileIcons = true;
          }
        }
        const fileNames = associations.fileNames;
        if (fileNames) {
          for (const key in fileNames) {
            const selectors = new css.Builder();
            const fileName = handleParentFolder(key.toLowerCase(), selectors);
            selectors.push(css.inline`.${classSelectorPart(fileName)}-name-file-icon`);
            selectors.push(css.inline`.name-file-icon`);
            const segments = fileName.split(".");
            if (segments.length) {
              for (let i = 1; i < segments.length; i++) {
                selectors.push(css.inline`.${classSelectorPart(segments.slice(i).join("."))}-ext-file-icon`);
              }
              selectors.push(css.inline`.ext-file-icon`);
            }
            addSelector(css.inline`${qualifier} ${selectors.join("")}.file-icon::before`, fileNames[key]);
            result.hasFileIcons = true;
            hasSpecificFileIcons = true;
          }
        }
      }
    }
    collectSelectors(iconThemeDocument);
    collectSelectors(iconThemeDocument.light, css.inline`.vs`);
    collectSelectors(iconThemeDocument.highContrast, css.inline`.hc-black`);
    collectSelectors(iconThemeDocument.highContrast, css.inline`.hc-light`);
    if (!result.hasFileIcons && !result.hasFolderIcons) {
      return result;
    }
    const showLanguageModeIcons = iconThemeDocument.showLanguageModeIcons === true || hasSpecificFileIcons && iconThemeDocument.showLanguageModeIcons !== false;
    const cssRules = new css.Builder();
    const fonts = iconThemeDocument.fonts;
    const fontSizes = /* @__PURE__ */ new Map();
    if (Array.isArray(fonts)) {
      const defaultFontSize = this.tryNormalizeFontSize(fonts[0].size) || "150%";
      fonts.forEach((font) => {
        const fontSrcs = new css.Builder();
        fontSrcs.push(...font.src.map((l) => css.inline`${css.asCSSUrl(resolvePath(l.path))} format(${css.stringValue(l.format)})`));
        cssRules.push(css.inline`@font-face { src: ${fontSrcs.join(", ")}; font-family: ${css.stringValue(font.id)}; font-weight: ${css.identValue(font.weight)}; font-style: ${css.identValue(font.style)}; font-display: block; }`);
        const fontSize = this.tryNormalizeFontSize(font.size);
        if (fontSize !== void 0 && fontSize !== defaultFontSize) {
          fontSizes.set(font.id, fontSize);
        }
      });
      cssRules.push(css.inline`.show-file-icons .file-icon::before, .show-file-icons .folder-icon::before, .show-file-icons .rootfolder-icon::before { font-family: ${css.stringValue(fonts[0].id)}; font-size: ${css.sizeValue(defaultFontSize)}; }`);
    }
    const emQuad = css.stringValue("\\2001");
    const imageIconStyle = (iconPath) => iconThemeDocument.usesCurrentColor ? css.inline`background-color: currentColor; background-image: none; mask: ${iconPath} no-repeat left center; mask-size: 16px; -webkit-mask: ${iconPath} no-repeat left center; -webkit-mask-size: 16px;` : css.inline`background-image: ${iconPath};`;
    for (const defId in selectorByDefinitionId) {
      const selectors = selectorByDefinitionId[defId];
      const definition = iconThemeDocument.iconDefinitions[defId];
      if (definition) {
        if (definition.iconPath) {
          const iconPath = css.asCSSUrl(resolvePath(definition.iconPath));
          cssRules.push(css.inline`${selectors.join(", ")} { content: ${emQuad}; ${imageIconStyle(iconPath)} }`);
        } else if (definition.fontCharacter || definition.fontColor) {
          const body = new css.Builder();
          if (definition.fontColor && definition.fontColor.match(fontColorRegex)) {
            body.push(css.inline`color: ${css.hexColorValue(definition.fontColor)};`);
          }
          if (definition.fontCharacter) {
            body.push(css.inline`content: ${css.stringValue(definition.fontCharacter)};`);
          }
          const fontSize = definition.fontSize ?? (definition.fontId ? fontSizes.get(definition.fontId) : void 0);
          if (fontSize && fontSize.match(fontSizeRegex)) {
            body.push(css.inline`font-size: ${css.sizeValue(fontSize)};`);
          }
          if (definition.fontId) {
            body.push(css.inline`font-family: ${css.stringValue(definition.fontId)};`);
          }
          if (showLanguageModeIcons) {
            body.push(css.inline`background-image: unset;`);
          }
          cssRules.push(css.inline`${selectors.join(", ")} { ${body.join(" ")} }`);
        }
      }
    }
    if (showLanguageModeIcons) {
      for (const languageId of this.languageService.getRegisteredLanguageIds()) {
        if (!coveredLanguages[languageId]) {
          const icon = this.languageService.getIcon(languageId);
          if (icon) {
            const selector = css.inline`.show-file-icons .${classSelectorPart(languageId)}-lang-file-icon.file-icon::before`;
            cssRules.push(css.inline`${selector} { content: ${emQuad}; ${imageIconStyle(css.asCSSUrl(icon.dark))} }`);
            cssRules.push(css.inline`.vs ${selector} { content: ${emQuad}; ${imageIconStyle(css.asCSSUrl(icon.light))} }`);
          }
        }
      }
    }
    result.content = cssRules.join("\n");
    return result;
  }
  /**
   * Try converting absolute font sizes to relative values.
   *
   * This allows them to be scaled nicely depending on where they are used.
   */
  tryNormalizeFontSize(size) {
    if (!size) {
      return void 0;
    }
    const defaultFontSizeInPx = 13;
    if (size.endsWith("px")) {
      const value = parseInt(size, 10);
      if (!isNaN(value)) {
        return Math.round(value / defaultFontSizeInPx * 100) + "%";
      }
    }
    return size;
  }
}
function handleParentFolder(key, selectors) {
  const lastIndexOfSlash = key.lastIndexOf("/");
  if (lastIndexOfSlash >= 0) {
    const parentFolder = key.substring(0, lastIndexOfSlash);
    selectors.push(css.inline`.${classSelectorPart(parentFolder)}-name-dir-icon`);
    return key.substring(lastIndexOfSlash + 1);
  }
  return key;
}
function classSelectorPart(str) {
  str = fileIconSelectorEscape(str);
  return css.className(str, true);
}
export {
  FileIconThemeData,
  FileIconThemeLoader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGJyb3dzZXJcXGZpbGVJY29uVGhlbWVEYXRhLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgcGF0aHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCAqIGFzIEpzb24gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EYXRhLCBJVGhlbWVFeHRlbnNpb25Qb2ludCwgSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUgfSBmcm9tICcuLi9jb21tb24vd29ya2JlbmNoVGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFBhcnNlRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkVycm9yTWVzc2FnZXMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGZvbnRDb2xvclJlZ2V4LCBmb250U2l6ZVJlZ2V4IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgKiBhcyBjc3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IGZpbGVJY29uU2VsZWN0b3JFc2NhcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcblxuZXhwb3J0IGNsYXNzIEZpbGVJY29uVGhlbWVEYXRhIGltcGxlbWVudHMgSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUge1xuXG5cdHN0YXRpYyByZWFkb25seSBTVE9SQUdFX0tFWSA9ICdpY29uVGhlbWVEYXRhJztcblxuXHRpZDogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRzZXR0aW5nc0lkOiBzdHJpbmcgfCBudWxsO1xuXHRkZXNjcmlwdGlvbj86IHN0cmluZztcblx0aGFzRmlsZUljb25zOiBib29sZWFuO1xuXHRoYXNGb2xkZXJJY29uczogYm9vbGVhbjtcblx0aGlkZXNFeHBsb3JlckFycm93czogYm9vbGVhbjtcblx0aXNMb2FkZWQ6IGJvb2xlYW47XG5cdGxvY2F0aW9uPzogVVJJO1xuXHRleHRlbnNpb25EYXRhPzogRXh0ZW5zaW9uRGF0YTtcblx0d2F0Y2g/OiBib29sZWFuO1xuXG5cdHN0eWxlU2hlZXRDb250ZW50Pzogc3RyaW5nO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IoaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgc2V0dGluZ3NJZDogc3RyaW5nIHwgbnVsbCkge1xuXHRcdHRoaXMuaWQgPSBpZDtcblx0XHR0aGlzLmxhYmVsID0gbGFiZWw7XG5cdFx0dGhpcy5zZXR0aW5nc0lkID0gc2V0dGluZ3NJZDtcblx0XHR0aGlzLmlzTG9hZGVkID0gZmFsc2U7XG5cdFx0dGhpcy5oYXNGaWxlSWNvbnMgPSBmYWxzZTtcblx0XHR0aGlzLmhhc0ZvbGRlckljb25zID0gZmFsc2U7XG5cdFx0dGhpcy5oaWRlc0V4cGxvcmVyQXJyb3dzID0gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgZW5zdXJlTG9hZGVkKHRoZW1lTG9hZGVyOiBGaWxlSWNvblRoZW1lTG9hZGVyKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gIXRoaXMuaXNMb2FkZWQgPyB0aGlzLmxvYWQodGhlbWVMb2FkZXIpIDogUHJvbWlzZS5yZXNvbHZlKHRoaXMuc3R5bGVTaGVldENvbnRlbnQpO1xuXHR9XG5cblx0cHVibGljIHJlbG9hZCh0aGVtZUxvYWRlcjogRmlsZUljb25UaGVtZUxvYWRlcik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMubG9hZCh0aGVtZUxvYWRlcik7XG5cdH1cblxuXHRwcml2YXRlIGxvYWQodGhlbWVMb2FkZXI6IEZpbGVJY29uVGhlbWVMb2FkZXIpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGVtZUxvYWRlci5sb2FkKHRoaXMpO1xuXHR9XG5cblx0c3RhdGljIGZyb21FeHRlbnNpb25UaGVtZShpY29uVGhlbWU6IElUaGVtZUV4dGVuc2lvblBvaW50LCBpY29uVGhlbWVMb2NhdGlvbjogVVJJLCBleHRlbnNpb25EYXRhOiBFeHRlbnNpb25EYXRhKTogRmlsZUljb25UaGVtZURhdGEge1xuXHRcdGNvbnN0IGlkID0gZXh0ZW5zaW9uRGF0YS5leHRlbnNpb25JZCArICctJyArIGljb25UaGVtZS5pZDtcblx0XHRjb25zdCBsYWJlbCA9IGljb25UaGVtZS5sYWJlbCB8fCBwYXRocy5iYXNlbmFtZShpY29uVGhlbWUucGF0aCk7XG5cdFx0Y29uc3Qgc2V0dGluZ3NJZCA9IGljb25UaGVtZS5pZDtcblxuXHRcdGNvbnN0IHRoZW1lRGF0YSA9IG5ldyBGaWxlSWNvblRoZW1lRGF0YShpZCwgbGFiZWwsIHNldHRpbmdzSWQpO1xuXG5cdFx0dGhlbWVEYXRhLmRlc2NyaXB0aW9uID0gaWNvblRoZW1lLmRlc2NyaXB0aW9uO1xuXHRcdHRoZW1lRGF0YS5sb2NhdGlvbiA9IGljb25UaGVtZUxvY2F0aW9uO1xuXHRcdHRoZW1lRGF0YS5leHRlbnNpb25EYXRhID0gZXh0ZW5zaW9uRGF0YTtcblx0XHR0aGVtZURhdGEud2F0Y2ggPSBpY29uVGhlbWUuX3dhdGNoO1xuXHRcdHRoZW1lRGF0YS5pc0xvYWRlZCA9IGZhbHNlO1xuXHRcdHJldHVybiB0aGVtZURhdGE7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbm9JY29uVGhlbWU6IEZpbGVJY29uVGhlbWVEYXRhIHwgbnVsbCA9IG51bGw7XG5cblx0c3RhdGljIGdldCBub0ljb25UaGVtZSgpOiBGaWxlSWNvblRoZW1lRGF0YSB7XG5cdFx0bGV0IHRoZW1lRGF0YSA9IEZpbGVJY29uVGhlbWVEYXRhLl9ub0ljb25UaGVtZTtcblx0XHRpZiAoIXRoZW1lRGF0YSkge1xuXHRcdFx0dGhlbWVEYXRhID0gRmlsZUljb25UaGVtZURhdGEuX25vSWNvblRoZW1lID0gbmV3IEZpbGVJY29uVGhlbWVEYXRhKCcnLCAnJywgbnVsbCk7XG5cdFx0XHR0aGVtZURhdGEuaGFzRmlsZUljb25zID0gZmFsc2U7XG5cdFx0XHR0aGVtZURhdGEuaGFzRm9sZGVySWNvbnMgPSBmYWxzZTtcblx0XHRcdHRoZW1lRGF0YS5oaWRlc0V4cGxvcmVyQXJyb3dzID0gZmFsc2U7XG5cdFx0XHR0aGVtZURhdGEuaXNMb2FkZWQgPSB0cnVlO1xuXHRcdFx0dGhlbWVEYXRhLmV4dGVuc2lvbkRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGVtZURhdGEud2F0Y2ggPSBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoZW1lRGF0YTtcblx0fVxuXG5cdHN0YXRpYyBjcmVhdGVVbmxvYWRlZFRoZW1lKGlkOiBzdHJpbmcpOiBGaWxlSWNvblRoZW1lRGF0YSB7XG5cdFx0Y29uc3QgdGhlbWVEYXRhID0gbmV3IEZpbGVJY29uVGhlbWVEYXRhKGlkLCAnJywgJ19fJyArIGlkKTtcblx0XHR0aGVtZURhdGEuaXNMb2FkZWQgPSBmYWxzZTtcblx0XHR0aGVtZURhdGEuaGFzRmlsZUljb25zID0gZmFsc2U7XG5cdFx0dGhlbWVEYXRhLmhhc0ZvbGRlckljb25zID0gZmFsc2U7XG5cdFx0dGhlbWVEYXRhLmhpZGVzRXhwbG9yZXJBcnJvd3MgPSBmYWxzZTtcblx0XHR0aGVtZURhdGEuZXh0ZW5zaW9uRGF0YSA9IHVuZGVmaW5lZDtcblx0XHR0aGVtZURhdGEud2F0Y2ggPSBmYWxzZTtcblx0XHRyZXR1cm4gdGhlbWVEYXRhO1xuXHR9XG5cblxuXHRzdGF0aWMgZnJvbVN0b3JhZ2VEYXRhKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiBGaWxlSWNvblRoZW1lRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5wdXQgPSBzdG9yYWdlU2VydmljZS5nZXQoRmlsZUljb25UaGVtZURhdGEuU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAoIWlucHV0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IEpTT04ucGFyc2UoaW5wdXQpO1xuXHRcdFx0Y29uc3QgdGhlbWUgPSBuZXcgRmlsZUljb25UaGVtZURhdGEoJycsICcnLCBudWxsKTtcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIGRhdGEpIHtcblx0XHRcdFx0c3dpdGNoIChrZXkpIHtcblx0XHRcdFx0XHRjYXNlICdpZCc6XG5cdFx0XHRcdFx0Y2FzZSAnbGFiZWwnOlxuXHRcdFx0XHRcdGNhc2UgJ2Rlc2NyaXB0aW9uJzpcblx0XHRcdFx0XHRjYXNlICdzZXR0aW5nc0lkJzpcblx0XHRcdFx0XHRjYXNlICdzdHlsZVNoZWV0Q29udGVudCc6XG5cdFx0XHRcdFx0Y2FzZSAnaGFzRmlsZUljb25zJzpcblx0XHRcdFx0XHRjYXNlICdoaWRlc0V4cGxvcmVyQXJyb3dzJzpcblx0XHRcdFx0XHRjYXNlICdoYXNGb2xkZXJJY29ucyc6XG5cdFx0XHRcdFx0Y2FzZSAnd2F0Y2gnOlxuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0XHQodGhlbWUgYXMgYW55KVtrZXldID0gZGF0YVtrZXldO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbG9jYXRpb24nOlxuXHRcdFx0XHRcdFx0Ly8gaWdub3JlLCBubyBsb25nZXIgcmVzdG9yZVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZXh0ZW5zaW9uRGF0YSc6XG5cdFx0XHRcdFx0XHR0aGVtZS5leHRlbnNpb25EYXRhID0gRXh0ZW5zaW9uRGF0YS5mcm9tSlNPTk9iamVjdChkYXRhLmV4dGVuc2lvbkRhdGEpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGVtZTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHRvU3RvcmFnZShzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKSB7XG5cdFx0Y29uc3QgZGF0YSA9IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0bGFiZWw6IHRoaXMubGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbixcblx0XHRcdHNldHRpbmdzSWQ6IHRoaXMuc2V0dGluZ3NJZCxcblx0XHRcdHN0eWxlU2hlZXRDb250ZW50OiB0aGlzLnN0eWxlU2hlZXRDb250ZW50LFxuXHRcdFx0aGFzRmlsZUljb25zOiB0aGlzLmhhc0ZpbGVJY29ucyxcblx0XHRcdGhhc0ZvbGRlckljb25zOiB0aGlzLmhhc0ZvbGRlckljb25zLFxuXHRcdFx0aGlkZXNFeHBsb3JlckFycm93czogdGhpcy5oaWRlc0V4cGxvcmVyQXJyb3dzLFxuXHRcdFx0ZXh0ZW5zaW9uRGF0YTogRXh0ZW5zaW9uRGF0YS50b0pTT05PYmplY3QodGhpcy5leHRlbnNpb25EYXRhKSxcblx0XHRcdHdhdGNoOiB0aGlzLndhdGNoXG5cdFx0fSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoRmlsZUljb25UaGVtZURhdGEuU1RPUkFHRV9LRVksIGRhdGEsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJY29uRGVmaW5pdGlvbiB7XG5cdGljb25QYXRoOiBzdHJpbmc7XG5cdGZvbnRDb2xvcjogc3RyaW5nO1xuXHRmb250Q2hhcmFjdGVyOiBzdHJpbmc7XG5cdGZvbnRTaXplOiBzdHJpbmc7XG5cdGZvbnRJZDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgRm9udERlZmluaXRpb24ge1xuXHRpZDogc3RyaW5nO1xuXHR3ZWlnaHQ6IHN0cmluZztcblx0c3R5bGU6IHN0cmluZztcblx0c2l6ZTogc3RyaW5nO1xuXHRzcmM6IHsgcGF0aDogc3RyaW5nOyBmb3JtYXQ6IHN0cmluZyB9W107XG59XG5cbmludGVyZmFjZSBJY29uc0Fzc29jaWF0aW9uIHtcblx0Zm9sZGVyPzogc3RyaW5nO1xuXHRmaWxlPzogc3RyaW5nO1xuXHRmb2xkZXJFeHBhbmRlZD86IHN0cmluZztcblx0cm9vdEZvbGRlcj86IHN0cmluZztcblx0cm9vdEZvbGRlckV4cGFuZGVkPzogc3RyaW5nO1xuXHRyb290Rm9sZGVyTmFtZXM/OiB7IFtmb2xkZXJOYW1lOiBzdHJpbmddOiBzdHJpbmcgfTtcblx0cm9vdEZvbGRlck5hbWVzRXhwYW5kZWQ/OiB7IFtmb2xkZXJOYW1lOiBzdHJpbmddOiBzdHJpbmcgfTtcblx0Zm9sZGVyTmFtZXM/OiB7IFtmb2xkZXJOYW1lOiBzdHJpbmddOiBzdHJpbmcgfTtcblx0Zm9sZGVyTmFtZXNFeHBhbmRlZD86IHsgW2ZvbGRlck5hbWU6IHN0cmluZ106IHN0cmluZyB9O1xuXHRmaWxlRXh0ZW5zaW9ucz86IHsgW2V4dGVuc2lvbjogc3RyaW5nXTogc3RyaW5nIH07XG5cdGZpbGVOYW1lcz86IHsgW2ZpbGVOYW1lOiBzdHJpbmddOiBzdHJpbmcgfTtcblx0bGFuZ3VhZ2VJZHM/OiB7IFtsYW5ndWFnZUlkOiBzdHJpbmddOiBzdHJpbmcgfTtcbn1cblxuaW50ZXJmYWNlIEljb25UaGVtZURvY3VtZW50IGV4dGVuZHMgSWNvbnNBc3NvY2lhdGlvbiB7XG5cdGljb25EZWZpbml0aW9uczogeyBba2V5OiBzdHJpbmddOiBJY29uRGVmaW5pdGlvbiB9O1xuXHRmb250czogRm9udERlZmluaXRpb25bXTtcblx0bGlnaHQ/OiBJY29uc0Fzc29jaWF0aW9uO1xuXHRoaWdoQ29udHJhc3Q/OiBJY29uc0Fzc29jaWF0aW9uO1xuXHR1c2VzQ3VycmVudENvbG9yPzogYm9vbGVhbjtcblx0aGlkZXNFeHBsb3JlckFycm93cz86IGJvb2xlYW47XG5cdHNob3dMYW5ndWFnZU1vZGVJY29ucz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlSWNvblRoZW1lTG9hZGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGxvYWQoZGF0YTogRmlsZUljb25UaGVtZURhdGEpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghZGF0YS5sb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShkYXRhLnN0eWxlU2hlZXRDb250ZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubG9hZEljb25UaGVtZURvY3VtZW50KGRhdGEubG9jYXRpb24pLnRoZW4oaWNvblRoZW1lRG9jdW1lbnQgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5wcm9jZXNzSWNvblRoZW1lRG9jdW1lbnQoZGF0YS5pZCwgZGF0YS5sb2NhdGlvbiEsIGljb25UaGVtZURvY3VtZW50KTtcblx0XHRcdGRhdGEuc3R5bGVTaGVldENvbnRlbnQgPSByZXN1bHQuY29udGVudDtcblx0XHRcdGRhdGEuaGFzRmlsZUljb25zID0gcmVzdWx0Lmhhc0ZpbGVJY29ucztcblx0XHRcdGRhdGEuaGFzRm9sZGVySWNvbnMgPSByZXN1bHQuaGFzRm9sZGVySWNvbnM7XG5cdFx0XHRkYXRhLmhpZGVzRXhwbG9yZXJBcnJvd3MgPSByZXN1bHQuaGlkZXNFeHBsb3JlckFycm93cztcblx0XHRcdGRhdGEuaXNMb2FkZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuIGRhdGEuc3R5bGVTaGVldENvbnRlbnQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGxvYWRJY29uVGhlbWVEb2N1bWVudChsb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJY29uVGhlbWVEb2N1bWVudD4ge1xuXHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRFeHRlbnNpb25SZXNvdXJjZShsb2NhdGlvbikudGhlbigoY29udGVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyb3JzOiBKc29uLlBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdFx0Y29uc3QgY29udGVudFZhbHVlID0gSnNvbi5wYXJzZShjb250ZW50LCBlcnJvcnMpO1xuXHRcdFx0aWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdlcnJvci5jYW5ub3RwYXJzZWljb250aGVtZScsIFwiUHJvYmxlbXMgcGFyc2luZyBmaWxlIGljb25zIGZpbGU6IHswfVwiLCBlcnJvcnMubWFwKGUgPT4gZ2V0UGFyc2VFcnJvck1lc3NhZ2UoZS5lcnJvcikpLmpvaW4oJywgJykpKSk7XG5cdFx0XHR9IGVsc2UgaWYgKEpzb24uZ2V0Tm9kZVR5cGUoY29udGVudFZhbHVlKSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2Vycm9yLmludmFsaWRmb3JtYXQnLCBcIkludmFsaWQgZm9ybWF0IGZvciBmaWxlIGljb25zIHRoZW1lIGZpbGU6IE9iamVjdCBleHBlY3RlZC5cIikpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoY29udGVudFZhbHVlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcHJvY2Vzc0ljb25UaGVtZURvY3VtZW50KGlkOiBzdHJpbmcsIGljb25UaGVtZURvY3VtZW50TG9jYXRpb246IFVSSSwgaWNvblRoZW1lRG9jdW1lbnQ6IEljb25UaGVtZURvY3VtZW50KTogeyBjb250ZW50OiBzdHJpbmc7IGhhc0ZpbGVJY29uczogYm9vbGVhbjsgaGFzRm9sZGVySWNvbnM6IGJvb2xlYW47IGhpZGVzRXhwbG9yZXJBcnJvd3M6IGJvb2xlYW4gfSB7XG5cblx0XHRjb25zdCByZXN1bHQgPSB7IGNvbnRlbnQ6ICcnLCBoYXNGaWxlSWNvbnM6IGZhbHNlLCBoYXNGb2xkZXJJY29uczogZmFsc2UsIGhpZGVzRXhwbG9yZXJBcnJvd3M6ICEhaWNvblRoZW1lRG9jdW1lbnQuaGlkZXNFeHBsb3JlckFycm93cyB9O1xuXG5cdFx0bGV0IGhhc1NwZWNpZmljRmlsZUljb25zID0gZmFsc2U7XG5cblx0XHRpZiAoIWljb25UaGVtZURvY3VtZW50Lmljb25EZWZpbml0aW9ucykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0b3JCeURlZmluaXRpb25JZDogeyBbZGVmOiBzdHJpbmddOiBjc3MuQnVpbGRlciB9ID0ge307XG5cdFx0Y29uc3QgY292ZXJlZExhbmd1YWdlczogeyBbbGFuZ3VhZ2VJZDogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XG5cblx0XHRjb25zdCBpY29uVGhlbWVEb2N1bWVudExvY2F0aW9uRGlybmFtZSA9IHJlc291cmNlcy5kaXJuYW1lKGljb25UaGVtZURvY3VtZW50TG9jYXRpb24pO1xuXHRcdGZ1bmN0aW9uIHJlc29sdmVQYXRoKHBhdGg6IHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlcy5qb2luUGF0aChpY29uVGhlbWVEb2N1bWVudExvY2F0aW9uRGlybmFtZSwgcGF0aCk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY29sbGVjdFNlbGVjdG9ycyhhc3NvY2lhdGlvbnM6IEljb25zQXNzb2NpYXRpb24gfCB1bmRlZmluZWQsIGJhc2VUaGVtZUNsYXNzTmFtZT86IGNzcy5Dc3NGcmFnbWVudCkge1xuXHRcdFx0ZnVuY3Rpb24gYWRkU2VsZWN0b3Ioc2VsZWN0b3I6IGNzcy5Dc3NGcmFnbWVudCwgZGVmSWQ6IHN0cmluZykge1xuXHRcdFx0XHRpZiAoZGVmSWQpIHtcblx0XHRcdFx0XHRsZXQgbGlzdCA9IHNlbGVjdG9yQnlEZWZpbml0aW9uSWRbZGVmSWRdO1xuXHRcdFx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRcdFx0bGlzdCA9IHNlbGVjdG9yQnlEZWZpbml0aW9uSWRbZGVmSWRdID0gbmV3IGNzcy5CdWlsZGVyKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxpc3QucHVzaChzZWxlY3Rvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFzc29jaWF0aW9ucykge1xuXHRcdFx0XHRsZXQgcXVhbGlmaWVyID0gY3NzLmlubGluZWAuc2hvdy1maWxlLWljb25zYDtcblx0XHRcdFx0aWYgKGJhc2VUaGVtZUNsYXNzTmFtZSkge1xuXHRcdFx0XHRcdHF1YWxpZmllciA9IGNzcy5pbmxpbmVgJHtiYXNlVGhlbWVDbGFzc05hbWV9ICR7cXVhbGlmaWVyfWA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleHBhbmRlZCA9IGNzcy5pbmxpbmVgLm1vbmFjby10bC10d2lzdGllLmNvbGxhcHNpYmxlOm5vdCguY29sbGFwc2VkKSArIC5tb25hY28tdGwtY29udGVudHNgO1xuXG5cdFx0XHRcdGlmIChhc3NvY2lhdGlvbnMuZm9sZGVyKSB7XG5cdFx0XHRcdFx0YWRkU2VsZWN0b3IoY3NzLmlubGluZWAke3F1YWxpZmllcn0gLmZvbGRlci1pY29uOjpiZWZvcmVgLCBhc3NvY2lhdGlvbnMuZm9sZGVyKTtcblx0XHRcdFx0XHRyZXN1bHQuaGFzRm9sZGVySWNvbnMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFzc29jaWF0aW9ucy5mb2xkZXJFeHBhbmRlZCkge1xuXHRcdFx0XHRcdGFkZFNlbGVjdG9yKGNzcy5pbmxpbmVgJHtxdWFsaWZpZXJ9ICR7ZXhwYW5kZWR9IC5mb2xkZXItaWNvbjo6YmVmb3JlYCwgYXNzb2NpYXRpb25zLmZvbGRlckV4cGFuZGVkKTtcblx0XHRcdFx0XHRyZXN1bHQuaGFzRm9sZGVySWNvbnMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlciA9IGFzc29jaWF0aW9ucy5yb290Rm9sZGVyIHx8IGFzc29jaWF0aW9ucy5mb2xkZXI7XG5cdFx0XHRcdGNvbnN0IHJvb3RGb2xkZXJFeHBhbmRlZCA9IGFzc29jaWF0aW9ucy5yb290Rm9sZGVyRXhwYW5kZWQgfHwgYXNzb2NpYXRpb25zLmZvbGRlckV4cGFuZGVkO1xuXG5cdFx0XHRcdGlmIChyb290Rm9sZGVyKSB7XG5cdFx0XHRcdFx0YWRkU2VsZWN0b3IoY3NzLmlubGluZWAke3F1YWxpZmllcn0gLnJvb3Rmb2xkZXItaWNvbjo6YmVmb3JlYCwgcm9vdEZvbGRlcik7XG5cdFx0XHRcdFx0cmVzdWx0Lmhhc0ZvbGRlckljb25zID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChyb290Rm9sZGVyRXhwYW5kZWQpIHtcblx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAke2V4cGFuZGVkfSAucm9vdGZvbGRlci1pY29uOjpiZWZvcmVgLCByb290Rm9sZGVyRXhwYW5kZWQpO1xuXHRcdFx0XHRcdHJlc3VsdC5oYXNGb2xkZXJJY29ucyA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYXNzb2NpYXRpb25zLmZpbGUpIHtcblx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAuZmlsZS1pY29uOjpiZWZvcmVgLCBhc3NvY2lhdGlvbnMuZmlsZSk7XG5cdFx0XHRcdFx0cmVzdWx0Lmhhc0ZpbGVJY29ucyA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBmb2xkZXJOYW1lcyA9IGFzc29jaWF0aW9ucy5mb2xkZXJOYW1lcztcblx0XHRcdFx0aWYgKGZvbGRlck5hbWVzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZm9sZGVyTmFtZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdG9ycyA9IG5ldyBjc3MuQnVpbGRlcigpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbmFtZSA9IGhhbmRsZVBhcmVudEZvbGRlcihrZXkudG9Mb3dlckNhc2UoKSwgc2VsZWN0b3JzKTtcblx0XHRcdFx0XHRcdHNlbGVjdG9ycy5wdXNoKGNzcy5pbmxpbmVgLiR7Y2xhc3NTZWxlY3RvclBhcnQobmFtZSl9LW5hbWUtZm9sZGVyLWljb25gKTtcblx0XHRcdFx0XHRcdGFkZFNlbGVjdG9yKGNzcy5pbmxpbmVgJHtxdWFsaWZpZXJ9ICR7c2VsZWN0b3JzLmpvaW4oJycpfS5mb2xkZXItaWNvbjo6YmVmb3JlYCwgZm9sZGVyTmFtZXNba2V5XSk7XG5cdFx0XHRcdFx0XHRyZXN1bHQuaGFzRm9sZGVySWNvbnMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBmb2xkZXJOYW1lc0V4cGFuZGVkID0gYXNzb2NpYXRpb25zLmZvbGRlck5hbWVzRXhwYW5kZWQ7XG5cdFx0XHRcdGlmIChmb2xkZXJOYW1lc0V4cGFuZGVkKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZm9sZGVyTmFtZXNFeHBhbmRlZCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0b3JzID0gbmV3IGNzcy5CdWlsZGVyKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBuYW1lID0gaGFuZGxlUGFyZW50Rm9sZGVyKGtleS50b0xvd2VyQ2FzZSgpLCBzZWxlY3RvcnMpO1xuXHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuJHtjbGFzc1NlbGVjdG9yUGFydChuYW1lKX0tbmFtZS1mb2xkZXItaWNvbmApO1xuXHRcdFx0XHRcdFx0YWRkU2VsZWN0b3IoY3NzLmlubGluZWAke3F1YWxpZmllcn0gJHtleHBhbmRlZH0gJHtzZWxlY3RvcnMuam9pbignJyl9LmZvbGRlci1pY29uOjpiZWZvcmVgLCBmb2xkZXJOYW1lc0V4cGFuZGVkW2tleV0pO1xuXHRcdFx0XHRcdFx0cmVzdWx0Lmhhc0ZvbGRlckljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByb290Rm9sZGVyTmFtZXMgPSBhc3NvY2lhdGlvbnMucm9vdEZvbGRlck5hbWVzO1xuXHRcdFx0XHRpZiAocm9vdEZvbGRlck5hbWVzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gcm9vdEZvbGRlck5hbWVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuYW1lID0ga2V5LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAuJHtjbGFzc1NlbGVjdG9yUGFydChuYW1lKX0tcm9vdC1uYW1lLWZvbGRlci1pY29uLnJvb3Rmb2xkZXItaWNvbjo6YmVmb3JlYCwgcm9vdEZvbGRlck5hbWVzW2tleV0pO1xuXHRcdFx0XHRcdFx0cmVzdWx0Lmhhc0ZvbGRlckljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgcm9vdEZvbGRlck5hbWVzRXhwYW5kZWQgPSBhc3NvY2lhdGlvbnMucm9vdEZvbGRlck5hbWVzRXhwYW5kZWQ7XG5cdFx0XHRcdGlmIChyb290Rm9sZGVyTmFtZXNFeHBhbmRlZCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IGluIHJvb3RGb2xkZXJOYW1lc0V4cGFuZGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuYW1lID0ga2V5LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAke2V4cGFuZGVkfSAuJHtjbGFzc1NlbGVjdG9yUGFydChuYW1lKX0tcm9vdC1uYW1lLWZvbGRlci1pY29uLnJvb3Rmb2xkZXItaWNvbjo6YmVmb3JlYCwgcm9vdEZvbGRlck5hbWVzRXhwYW5kZWRba2V5XSk7XG5cdFx0XHRcdFx0XHRyZXN1bHQuaGFzRm9sZGVySWNvbnMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWRzID0gYXNzb2NpYXRpb25zLmxhbmd1YWdlSWRzO1xuXHRcdFx0XHRpZiAobGFuZ3VhZ2VJZHMpIHtcblx0XHRcdFx0XHRpZiAoIWxhbmd1YWdlSWRzLmpzb25jICYmIGxhbmd1YWdlSWRzLmpzb24pIHtcblx0XHRcdFx0XHRcdGxhbmd1YWdlSWRzLmpzb25jID0gbGFuZ3VhZ2VJZHMuanNvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBsYW5ndWFnZUlkIGluIGxhbmd1YWdlSWRzKSB7XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAuJHtjbGFzc1NlbGVjdG9yUGFydChsYW5ndWFnZUlkKX0tbGFuZy1maWxlLWljb24uZmlsZS1pY29uOjpiZWZvcmVgLCBsYW5ndWFnZUlkc1tsYW5ndWFnZUlkXSk7XG5cdFx0XHRcdFx0XHRyZXN1bHQuaGFzRmlsZUljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGhhc1NwZWNpZmljRmlsZUljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvdmVyZWRMYW5ndWFnZXNbbGFuZ3VhZ2VJZF0gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBmaWxlRXh0ZW5zaW9ucyA9IGFzc29jaWF0aW9ucy5maWxlRXh0ZW5zaW9ucztcblx0XHRcdFx0aWYgKGZpbGVFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZmlsZUV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdG9ycyA9IG5ldyBjc3MuQnVpbGRlcigpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbmFtZSA9IGhhbmRsZVBhcmVudEZvbGRlcihrZXkudG9Mb3dlckNhc2UoKSwgc2VsZWN0b3JzKTtcblx0XHRcdFx0XHRcdGNvbnN0IHNlZ21lbnRzID0gbmFtZS5zcGxpdCgnLicpO1xuXHRcdFx0XHRcdFx0aWYgKHNlZ21lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuJHtjbGFzc1NlbGVjdG9yUGFydChzZWdtZW50cy5zbGljZShpKS5qb2luKCcuJykpfS1leHQtZmlsZS1pY29uYCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuZXh0LWZpbGUtaWNvbmApOyAvLyBleHRyYSBzZWdtZW50IHRvIGluY3JlYXNlIGZpbGUtZXh0IHNjb3JlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAke3NlbGVjdG9ycy5qb2luKCcnKX0uZmlsZS1pY29uOjpiZWZvcmVgLCBmaWxlRXh0ZW5zaW9uc1trZXldKTtcblx0XHRcdFx0XHRcdHJlc3VsdC5oYXNGaWxlSWNvbnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aGFzU3BlY2lmaWNGaWxlSWNvbnMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBmaWxlTmFtZXMgPSBhc3NvY2lhdGlvbnMuZmlsZU5hbWVzO1xuXHRcdFx0XHRpZiAoZmlsZU5hbWVzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgaW4gZmlsZU5hbWVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RvcnMgPSBuZXcgY3NzLkJ1aWxkZXIoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGZpbGVOYW1lID0gaGFuZGxlUGFyZW50Rm9sZGVyKGtleS50b0xvd2VyQ2FzZSgpLCBzZWxlY3RvcnMpO1xuXHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuJHtjbGFzc1NlbGVjdG9yUGFydChmaWxlTmFtZSl9LW5hbWUtZmlsZS1pY29uYCk7XG5cdFx0XHRcdFx0XHRzZWxlY3RvcnMucHVzaChjc3MuaW5saW5lYC5uYW1lLWZpbGUtaWNvbmApOyAvLyBleHRyYSBzZWdtZW50IHRvIGluY3JlYXNlIGZpbGUtbmFtZSBzY29yZVxuXHRcdFx0XHRcdFx0Y29uc3Qgc2VnbWVudHMgPSBmaWxlTmFtZS5zcGxpdCgnLicpO1xuXHRcdFx0XHRcdFx0aWYgKHNlZ21lbnRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHNlZ21lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuJHtjbGFzc1NlbGVjdG9yUGFydChzZWdtZW50cy5zbGljZShpKS5qb2luKCcuJykpfS1leHQtZmlsZS1pY29uYCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuZXh0LWZpbGUtaWNvbmApOyAvLyBleHRyYSBzZWdtZW50IHRvIGluY3JlYXNlIGZpbGUtZXh0IHNjb3JlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhZGRTZWxlY3Rvcihjc3MuaW5saW5lYCR7cXVhbGlmaWVyfSAke3NlbGVjdG9ycy5qb2luKCcnKX0uZmlsZS1pY29uOjpiZWZvcmVgLCBmaWxlTmFtZXNba2V5XSk7XG5cdFx0XHRcdFx0XHRyZXN1bHQuaGFzRmlsZUljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGhhc1NwZWNpZmljRmlsZUljb25zID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29sbGVjdFNlbGVjdG9ycyhpY29uVGhlbWVEb2N1bWVudCk7XG5cdFx0Y29sbGVjdFNlbGVjdG9ycyhpY29uVGhlbWVEb2N1bWVudC5saWdodCwgY3NzLmlubGluZWAudnNgKTtcblx0XHRjb2xsZWN0U2VsZWN0b3JzKGljb25UaGVtZURvY3VtZW50LmhpZ2hDb250cmFzdCwgY3NzLmlubGluZWAuaGMtYmxhY2tgKTtcblx0XHRjb2xsZWN0U2VsZWN0b3JzKGljb25UaGVtZURvY3VtZW50LmhpZ2hDb250cmFzdCwgY3NzLmlubGluZWAuaGMtbGlnaHRgKTtcblxuXHRcdGlmICghcmVzdWx0Lmhhc0ZpbGVJY29ucyAmJiAhcmVzdWx0Lmhhc0ZvbGRlckljb25zKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3dMYW5ndWFnZU1vZGVJY29ucyA9IGljb25UaGVtZURvY3VtZW50LnNob3dMYW5ndWFnZU1vZGVJY29ucyA9PT0gdHJ1ZSB8fCAoaGFzU3BlY2lmaWNGaWxlSWNvbnMgJiYgaWNvblRoZW1lRG9jdW1lbnQuc2hvd0xhbmd1YWdlTW9kZUljb25zICE9PSBmYWxzZSk7XG5cblx0XHRjb25zdCBjc3NSdWxlcyA9IG5ldyBjc3MuQnVpbGRlcigpO1xuXG5cdFx0Y29uc3QgZm9udHMgPSBpY29uVGhlbWVEb2N1bWVudC5mb250cztcblx0XHRjb25zdCBmb250U2l6ZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGZvbnRzKSkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdEZvbnRTaXplID0gdGhpcy50cnlOb3JtYWxpemVGb250U2l6ZShmb250c1swXS5zaXplKSB8fCAnMTUwJSc7XG5cdFx0XHRmb250cy5mb3JFYWNoKGZvbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBmb250U3JjcyA9IG5ldyBjc3MuQnVpbGRlcigpO1xuXHRcdFx0XHRmb250U3Jjcy5wdXNoKC4uLmZvbnQuc3JjLm1hcChsID0+IGNzcy5pbmxpbmVgJHtjc3MuYXNDU1NVcmwocmVzb2x2ZVBhdGgobC5wYXRoKSl9IGZvcm1hdCgke2Nzcy5zdHJpbmdWYWx1ZShsLmZvcm1hdCl9KWApKTtcblx0XHRcdFx0Y3NzUnVsZXMucHVzaChjc3MuaW5saW5lYEBmb250LWZhY2UgeyBzcmM6ICR7Zm9udFNyY3Muam9pbignLCAnKX07IGZvbnQtZmFtaWx5OiAke2Nzcy5zdHJpbmdWYWx1ZShmb250LmlkKX07IGZvbnQtd2VpZ2h0OiAke2Nzcy5pZGVudFZhbHVlKGZvbnQud2VpZ2h0KX07IGZvbnQtc3R5bGU6ICR7Y3NzLmlkZW50VmFsdWUoZm9udC5zdHlsZSl9OyBmb250LWRpc3BsYXk6IGJsb2NrOyB9YCk7XG5cblx0XHRcdFx0Y29uc3QgZm9udFNpemUgPSB0aGlzLnRyeU5vcm1hbGl6ZUZvbnRTaXplKGZvbnQuc2l6ZSk7XG5cdFx0XHRcdGlmIChmb250U2l6ZSAhPT0gdW5kZWZpbmVkICYmIGZvbnRTaXplICE9PSBkZWZhdWx0Rm9udFNpemUpIHtcblx0XHRcdFx0XHRmb250U2l6ZXMuc2V0KGZvbnQuaWQsIGZvbnRTaXplKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRjc3NSdWxlcy5wdXNoKGNzcy5pbmxpbmVgLnNob3ctZmlsZS1pY29ucyAuZmlsZS1pY29uOjpiZWZvcmUsIC5zaG93LWZpbGUtaWNvbnMgLmZvbGRlci1pY29uOjpiZWZvcmUsIC5zaG93LWZpbGUtaWNvbnMgLnJvb3Rmb2xkZXItaWNvbjo6YmVmb3JlIHsgZm9udC1mYW1pbHk6ICR7Y3NzLnN0cmluZ1ZhbHVlKGZvbnRzWzBdLmlkKX07IGZvbnQtc2l6ZTogJHtjc3Muc2l6ZVZhbHVlKGRlZmF1bHRGb250U2l6ZSl9OyB9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIGVtUXVhZHMgdG8gcHJldmVudCB0aGUgaWNvbiBmcm9tIGNvbGxhcHNpbmcgdG8gemVybyBoZWlnaHQgZm9yIGltYWdlIGljb25zXG5cdFx0Y29uc3QgZW1RdWFkID0gY3NzLnN0cmluZ1ZhbHVlKCdcXFxcMjAwMScpO1xuXG5cdFx0Ly8gV2hlbiB1c2VzQ3VycmVudENvbG9yIGlzIHNldCwgaW1hZ2UgaWNvbnMgYXJlIHJlbmRlcmVkIGFzIG1hc2tzIGZpbGxlZCB3aXRoIHRoZSBjdXJyZW50IHRleHQgY29sb3Jcblx0XHRjb25zdCBpbWFnZUljb25TdHlsZSA9IChpY29uUGF0aDogY3NzLkNzc0ZyYWdtZW50KTogY3NzLkNzc0ZyYWdtZW50ID0+IGljb25UaGVtZURvY3VtZW50LnVzZXNDdXJyZW50Q29sb3Jcblx0XHRcdD8gY3NzLmlubGluZWBiYWNrZ3JvdW5kLWNvbG9yOiBjdXJyZW50Q29sb3I7IGJhY2tncm91bmQtaW1hZ2U6IG5vbmU7IG1hc2s6ICR7aWNvblBhdGh9IG5vLXJlcGVhdCBsZWZ0IGNlbnRlcjsgbWFzay1zaXplOiAxNnB4OyAtd2Via2l0LW1hc2s6ICR7aWNvblBhdGh9IG5vLXJlcGVhdCBsZWZ0IGNlbnRlcjsgLXdlYmtpdC1tYXNrLXNpemU6IDE2cHg7YFxuXHRcdFx0OiBjc3MuaW5saW5lYGJhY2tncm91bmQtaW1hZ2U6ICR7aWNvblBhdGh9O2A7XG5cblx0XHRmb3IgKGNvbnN0IGRlZklkIGluIHNlbGVjdG9yQnlEZWZpbml0aW9uSWQpIHtcblx0XHRcdGNvbnN0IHNlbGVjdG9ycyA9IHNlbGVjdG9yQnlEZWZpbml0aW9uSWRbZGVmSWRdO1xuXHRcdFx0Y29uc3QgZGVmaW5pdGlvbiA9IGljb25UaGVtZURvY3VtZW50Lmljb25EZWZpbml0aW9uc1tkZWZJZF07XG5cdFx0XHRpZiAoZGVmaW5pdGlvbikge1xuXHRcdFx0XHRpZiAoZGVmaW5pdGlvbi5pY29uUGF0aCkge1xuXHRcdFx0XHRcdGNvbnN0IGljb25QYXRoID0gY3NzLmFzQ1NTVXJsKHJlc29sdmVQYXRoKGRlZmluaXRpb24uaWNvblBhdGgpKTtcblx0XHRcdFx0XHRjc3NSdWxlcy5wdXNoKGNzcy5pbmxpbmVgJHtzZWxlY3RvcnMuam9pbignLCAnKX0geyBjb250ZW50OiAke2VtUXVhZH07ICR7aW1hZ2VJY29uU3R5bGUoaWNvblBhdGgpfSB9YCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZGVmaW5pdGlvbi5mb250Q2hhcmFjdGVyIHx8IGRlZmluaXRpb24uZm9udENvbG9yKSB7XG5cdFx0XHRcdFx0Y29uc3QgYm9keSA9IG5ldyBjc3MuQnVpbGRlcigpO1xuXHRcdFx0XHRcdGlmIChkZWZpbml0aW9uLmZvbnRDb2xvciAmJiBkZWZpbml0aW9uLmZvbnRDb2xvci5tYXRjaChmb250Q29sb3JSZWdleCkpIHtcblx0XHRcdFx0XHRcdGJvZHkucHVzaChjc3MuaW5saW5lYGNvbG9yOiAke2Nzcy5oZXhDb2xvclZhbHVlKGRlZmluaXRpb24uZm9udENvbG9yKX07YCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChkZWZpbml0aW9uLmZvbnRDaGFyYWN0ZXIpIHtcblx0XHRcdFx0XHRcdGJvZHkucHVzaChjc3MuaW5saW5lYGNvbnRlbnQ6ICR7Y3NzLnN0cmluZ1ZhbHVlKGRlZmluaXRpb24uZm9udENoYXJhY3Rlcil9O2ApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBmb250U2l6ZSA9IGRlZmluaXRpb24uZm9udFNpemUgPz8gKGRlZmluaXRpb24uZm9udElkID8gZm9udFNpemVzLmdldChkZWZpbml0aW9uLmZvbnRJZCkgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGlmIChmb250U2l6ZSAmJiBmb250U2l6ZS5tYXRjaChmb250U2l6ZVJlZ2V4KSkge1xuXHRcdFx0XHRcdFx0Ym9keS5wdXNoKGNzcy5pbmxpbmVgZm9udC1zaXplOiAke2Nzcy5zaXplVmFsdWUoZm9udFNpemUpfTtgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRlZmluaXRpb24uZm9udElkKSB7XG5cdFx0XHRcdFx0XHRib2R5LnB1c2goY3NzLmlubGluZWBmb250LWZhbWlseTogJHtjc3Muc3RyaW5nVmFsdWUoZGVmaW5pdGlvbi5mb250SWQpfTtgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHNob3dMYW5ndWFnZU1vZGVJY29ucykge1xuXHRcdFx0XHRcdFx0Ym9keS5wdXNoKGNzcy5pbmxpbmVgYmFja2dyb3VuZC1pbWFnZTogdW5zZXQ7YCk7IC8vIHBvdGVudGlhbGx5IHNldCBieSB0aGUgbGFuZ3VhZ2UgZGVmYXVsdFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjc3NSdWxlcy5wdXNoKGNzcy5pbmxpbmVgJHtzZWxlY3RvcnMuam9pbignLCAnKX0geyAke2JvZHkuam9pbignICcpfSB9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2hvd0xhbmd1YWdlTW9kZUljb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGxhbmd1YWdlSWQgb2YgdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0UmVnaXN0ZXJlZExhbmd1YWdlSWRzKCkpIHtcblx0XHRcdFx0aWYgKCFjb3ZlcmVkTGFuZ3VhZ2VzW2xhbmd1YWdlSWRdKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWNvbiA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldEljb24obGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdFx0aWYgKGljb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdG9yID0gY3NzLmlubGluZWAuc2hvdy1maWxlLWljb25zIC4ke2NsYXNzU2VsZWN0b3JQYXJ0KGxhbmd1YWdlSWQpfS1sYW5nLWZpbGUtaWNvbi5maWxlLWljb246OmJlZm9yZWA7XG5cdFx0XHRcdFx0XHRjc3NSdWxlcy5wdXNoKGNzcy5pbmxpbmVgJHtzZWxlY3Rvcn0geyBjb250ZW50OiAke2VtUXVhZH07ICR7aW1hZ2VJY29uU3R5bGUoY3NzLmFzQ1NTVXJsKGljb24uZGFyaykpfSB9YCk7XG5cdFx0XHRcdFx0XHRjc3NSdWxlcy5wdXNoKGNzcy5pbmxpbmVgLnZzICR7c2VsZWN0b3J9IHsgY29udGVudDogJHtlbVF1YWR9OyAke2ltYWdlSWNvblN0eWxlKGNzcy5hc0NTU1VybChpY29uLmxpZ2h0KSl9IH1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXN1bHQuY29udGVudCA9IGNzc1J1bGVzLmpvaW4oJ1xcbicpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogVHJ5IGNvbnZlcnRpbmcgYWJzb2x1dGUgZm9udCBzaXplcyB0byByZWxhdGl2ZSB2YWx1ZXMuXG5cdCAqXG5cdCAqIFRoaXMgYWxsb3dzIHRoZW0gdG8gYmUgc2NhbGVkIG5pY2VseSBkZXBlbmRpbmcgb24gd2hlcmUgdGhleSBhcmUgdXNlZC5cblx0ICovXG5cdHByaXZhdGUgdHJ5Tm9ybWFsaXplRm9udFNpemUoc2l6ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXNpemUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmYXVsdEZvbnRTaXplSW5QeCA9IDEzO1xuXG5cdFx0aWYgKHNpemUuZW5kc1dpdGgoJ3B4JykpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gcGFyc2VJbnQoc2l6ZSwgMTApO1xuXHRcdFx0aWYgKCFpc05hTih2YWx1ZSkpIHtcblx0XHRcdFx0cmV0dXJuIE1hdGgucm91bmQoKHZhbHVlIC8gZGVmYXVsdEZvbnRTaXplSW5QeCkgKiAxMDApICsgJyUnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzaXplO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGhhbmRsZVBhcmVudEZvbGRlcihrZXk6IHN0cmluZywgc2VsZWN0b3JzOiBjc3MuQnVpbGRlcik6IHN0cmluZyB7XG5cdGNvbnN0IGxhc3RJbmRleE9mU2xhc2ggPSBrZXkubGFzdEluZGV4T2YoJy8nKTtcblx0aWYgKGxhc3RJbmRleE9mU2xhc2ggPj0gMCkge1xuXHRcdGNvbnN0IHBhcmVudEZvbGRlciA9IGtleS5zdWJzdHJpbmcoMCwgbGFzdEluZGV4T2ZTbGFzaCk7XG5cdFx0c2VsZWN0b3JzLnB1c2goY3NzLmlubGluZWAuJHtjbGFzc1NlbGVjdG9yUGFydChwYXJlbnRGb2xkZXIpfS1uYW1lLWRpci1pY29uYCk7XG5cdFx0cmV0dXJuIGtleS5zdWJzdHJpbmcobGFzdEluZGV4T2ZTbGFzaCArIDEpO1xuXHR9XG5cdHJldHVybiBrZXk7XG59XG5cbmZ1bmN0aW9uIGNsYXNzU2VsZWN0b3JQYXJ0KHN0cjogc3RyaW5nKTogY3NzLkNzc0ZyYWdtZW50IHtcblx0c3RyID0gZmlsZUljb25TZWxlY3RvckVzY2FwZShzdHIpO1xuXHRyZXR1cm4gY3NzLmNsYXNzTmFtZShzdHIsIHRydWUpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEs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
