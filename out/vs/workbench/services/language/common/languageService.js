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
var __decorateParam = (index2, decorator) => (target, key) => decorator(target, key, index2);
import { localize } from "../../../../nls.js";
import { clearConfiguredLanguageAssociations, registerConfiguredLanguageAssociation } from "../../../../editor/common/services/languagesAssociations.js";
import { joinPath } from "../../../../base/common/resources.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { LanguageService } from "../../../../editor/common/services/languageService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { FILES_ASSOCIATIONS_CONFIG } from "../../../../platform/files/common/files.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions } from "../../extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { index } from "../../../../base/common/arrays.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { isString } from "../../../../base/common/types.js";
const languagesExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "languages",
  jsonSchema: {
    description: localize("vscode.extension.contributes.languages", "Contributes language declarations."),
    type: "array",
    items: {
      type: "object",
      defaultSnippets: [{ body: { id: "${1:languageId}", aliases: ["${2:label}"], extensions: ["${3:extension}"], configuration: "./language-configuration.json" } }],
      properties: {
        id: {
          description: localize("vscode.extension.contributes.languages.id", "ID of the language."),
          type: "string"
        },
        aliases: {
          description: localize("vscode.extension.contributes.languages.aliases", "Name aliases for the language."),
          type: "array",
          items: {
            type: "string"
          }
        },
        extensions: {
          description: localize("vscode.extension.contributes.languages.extensions", "File extensions associated to the language."),
          default: [".foo"],
          type: "array",
          items: {
            type: "string"
          }
        },
        filenames: {
          description: localize("vscode.extension.contributes.languages.filenames", "File names associated to the language."),
          type: "array",
          items: {
            type: "string"
          }
        },
        filenamePatterns: {
          description: localize("vscode.extension.contributes.languages.filenamePatterns", "File name glob patterns associated to the language."),
          type: "array",
          items: {
            type: "string"
          }
        },
        mimetypes: {
          description: localize("vscode.extension.contributes.languages.mimetypes", "Mime types associated to the language."),
          type: "array",
          items: {
            type: "string"
          }
        },
        firstLine: {
          description: localize("vscode.extension.contributes.languages.firstLine", "A regular expression matching the first line of a file of the language."),
          type: "string"
        },
        configuration: {
          description: localize("vscode.extension.contributes.languages.configuration", "A relative path to a file containing configuration options for the language."),
          type: "string",
          default: "./language-configuration.json"
        },
        icon: {
          type: "object",
          description: localize("vscode.extension.contributes.languages.icon", "A icon to use as file icon, if no icon theme provides one for the language."),
          properties: {
            light: {
              description: localize("vscode.extension.contributes.languages.icon.light", "Icon path when a light theme is used"),
              type: "string"
            },
            dark: {
              description: localize("vscode.extension.contributes.languages.icon.dark", "Icon path when a dark theme is used"),
              type: "string"
            }
          }
        }
      }
    }
  },
  activationEventsGenerator: function* (languageContributions) {
    for (const languageContribution of languageContributions) {
      if (languageContribution.id && languageContribution.configuration) {
        yield `onLanguage:${languageContribution.id}`;
      }
    }
  }
});
class LanguageTableRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.languages;
  }
  render(manifest) {
    const contributes = manifest.contributes;
    const rawLanguages = contributes?.languages || [];
    const languages = [];
    for (const l of rawLanguages) {
      if (isValidLanguageExtensionPoint(l)) {
        languages.push({
          id: l.id,
          name: (l.aliases || [])[0] || l.id,
          extensions: l.extensions || [],
          hasGrammar: false,
          hasSnippets: false
        });
      }
    }
    const byId = index(languages, (l) => l.id);
    const grammars = contributes?.grammars || [];
    grammars.forEach((grammar) => {
      if (!isString(grammar.language)) {
        return;
      }
      let language = byId[grammar.language];
      if (language) {
        language.hasGrammar = true;
      } else {
        language = { id: grammar.language, name: grammar.language, extensions: [], hasGrammar: true, hasSnippets: false };
        byId[language.id] = language;
        languages.push(language);
      }
    });
    const snippets = contributes?.snippets || [];
    snippets.forEach((snippet) => {
      if (!isString(snippet.language)) {
        return;
      }
      let language = byId[snippet.language];
      if (language) {
        language.hasSnippets = true;
      } else {
        language = { id: snippet.language, name: snippet.language, extensions: [], hasGrammar: false, hasSnippets: true };
        byId[language.id] = language;
        languages.push(language);
      }
    });
    if (!languages.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("language id", "ID"),
      localize("language name", "Name"),
      localize("file extensions", "File Extensions"),
      localize("grammar", "Grammar"),
      localize("snippets", "Snippets")
    ];
    const rows = languages.sort((a, b) => a.id.localeCompare(b.id)).map((l) => {
      return [
        l.id,
        l.name,
        new MarkdownString().appendMarkdown(`${l.extensions.map((e) => `\`${e}\``).join("&nbsp;")}`),
        l.hasGrammar ? "\u2714\uFE0E" : "\u2014",
        l.hasSnippets ? "\u2714\uFE0E" : "\u2014"
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "languages",
  label: localize("languages", "Programming Languages"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(LanguageTableRenderer)
});
let WorkbenchLanguageService = class extends LanguageService {
  constructor(extensionService, configurationService, environmentService, logService) {
    super(environmentService.verbose || environmentService.isExtensionDevelopment || !environmentService.isBuilt);
    this.logService = logService;
    this._configurationService = configurationService;
    this._extensionService = extensionService;
    languagesExtPoint.setHandler((extensions) => {
      const allValidLanguages = [];
      for (let i = 0, len = extensions.length; i < len; i++) {
        const extension = extensions[i];
        if (!Array.isArray(extension.value)) {
          extension.collector.error(localize("invalid", "Invalid `contributes.{0}`. Expected an array.", languagesExtPoint.name));
          continue;
        }
        for (let j = 0, lenJ = extension.value.length; j < lenJ; j++) {
          const ext = extension.value[j];
          if (isValidLanguageExtensionPoint(ext, extension.collector)) {
            let configuration = void 0;
            if (ext.configuration) {
              configuration = joinPath(extension.description.extensionLocation, ext.configuration);
            }
            allValidLanguages.push({
              id: ext.id,
              extensions: ext.extensions,
              filenames: ext.filenames,
              filenamePatterns: ext.filenamePatterns,
              firstLine: ext.firstLine,
              aliases: ext.aliases,
              mimetypes: ext.mimetypes,
              configuration,
              icon: ext.icon && {
                light: joinPath(extension.description.extensionLocation, ext.icon.light),
                dark: joinPath(extension.description.extensionLocation, ext.icon.dark)
              }
            });
          }
        }
      }
      this._registry.setDynamicLanguages(allValidLanguages);
    });
    this.updateMime();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(FILES_ASSOCIATIONS_CONFIG)) {
        this.updateMime();
      }
    }));
    this._extensionService.whenInstalledExtensionsRegistered().then(() => {
      this.updateMime();
    });
    this._register(this.onDidRequestRichLanguageFeatures((languageId) => {
      this._extensionService.activateByEvent(`onLanguage:${languageId}`);
      this._extensionService.activateByEvent(`onLanguage`);
    }));
  }
  updateMime() {
    const configuration = this._configurationService.getValue();
    clearConfiguredLanguageAssociations();
    if (configuration.files?.associations) {
      Object.keys(configuration.files.associations).forEach((pattern) => {
        const langId = configuration.files.associations[pattern];
        if (typeof langId !== "string") {
          this.logService.warn(`Ignoring configured 'files.associations' for '${pattern}' because its type is not a string but '${typeof langId}'`);
          return;
        }
        const mimeType = this.getMimeType(langId) || `text/x-${langId}`;
        registerConfiguredLanguageAssociation({ id: langId, mime: mimeType, filepattern: pattern });
      });
    }
    this._onDidChange.fire();
  }
};
WorkbenchLanguageService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, ILogService)
], WorkbenchLanguageService);
function isUndefinedOrStringArray(value) {
  if (typeof value === "undefined") {
    return true;
  }
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((item) => typeof item === "string");
}
function isValidLanguageExtensionPoint(value, collector) {
  if (!value) {
    collector?.error(localize("invalid.empty", "Empty value for `contributes.{0}`", languagesExtPoint.name));
    return false;
  }
  if (typeof value.id !== "string") {
    collector?.error(localize("require.id", "property `{0}` is mandatory and must be of type `string`", "id"));
    return false;
  }
  if (!isUndefinedOrStringArray(value.extensions)) {
    collector?.error(localize("opt.extensions", "property `{0}` can be omitted and must be of type `string[]`", "extensions"));
    return false;
  }
  if (!isUndefinedOrStringArray(value.filenames)) {
    collector?.error(localize("opt.filenames", "property `{0}` can be omitted and must be of type `string[]`", "filenames"));
    return false;
  }
  if (typeof value.firstLine !== "undefined" && typeof value.firstLine !== "string") {
    collector?.error(localize("opt.firstLine", "property `{0}` can be omitted and must be of type `string`", "firstLine"));
    return false;
  }
  if (typeof value.configuration !== "undefined" && typeof value.configuration !== "string") {
    collector?.error(localize("opt.configuration", "property `{0}` can be omitted and must be of type `string`", "configuration"));
    return false;
  }
  if (!isUndefinedOrStringArray(value.aliases)) {
    collector?.error(localize("opt.aliases", "property `{0}` can be omitted and must be of type `string[]`", "aliases"));
    return false;
  }
  if (!isUndefinedOrStringArray(value.mimetypes)) {
    collector?.error(localize("opt.mimetypes", "property `{0}` can be omitted and must be of type `string[]`", "mimetypes"));
    return false;
  }
  if (typeof value.icon !== "undefined") {
    if (typeof value.icon !== "object" || typeof value.icon.light !== "string" || typeof value.icon.dark !== "string") {
      collector?.error(localize("opt.icon", "property `{0}` can be omitted and must be of type `object` with properties `{1}` and `{2}` of type `string`", "icon", "light", "dark"));
      return false;
    }
  }
  return true;
}
registerSingleton(ILanguageService, WorkbenchLanguageService, InstantiationType.Eager);
export {
  WorkbenchLanguageService,
  languagesExtPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxsYW5ndWFnZVxcY29tbW9uXFxsYW5ndWFnZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjbGVhckNvbmZpZ3VyZWRMYW5ndWFnZUFzc29jaWF0aW9ucywgcmVnaXN0ZXJDb25maWd1cmVkTGFuZ3VhZ2VBc3NvY2lhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VzQXNzb2NpYXRpb25zLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VFeHRlbnNpb25Qb2ludCwgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBGSUxFU19BU1NPQ0lBVElPTlNfQ09ORklHLCBJRmlsZXNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yLCBFeHRlbnNpb25zUmVnaXN0cnksIElFeHRlbnNpb25Qb2ludCwgSUV4dGVuc2lvblBvaW50VXNlciB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElSZW5kZXJlZERhdGEsIElSb3dEYXRhLCBJVGFibGVEYXRhIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBpbmRleCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElSYXdMYW5ndWFnZUV4dGVuc2lvblBvaW50IHtcblx0aWQ6IHN0cmluZztcblx0ZXh0ZW5zaW9uczogc3RyaW5nW107XG5cdGZpbGVuYW1lczogc3RyaW5nW107XG5cdGZpbGVuYW1lUGF0dGVybnM6IHN0cmluZ1tdO1xuXHRmaXJzdExpbmU6IHN0cmluZztcblx0YWxpYXNlczogc3RyaW5nW107XG5cdG1pbWV0eXBlczogc3RyaW5nW107XG5cdGNvbmZpZ3VyYXRpb246IHN0cmluZztcblx0aWNvbjogeyBsaWdodDogc3RyaW5nOyBkYXJrOiBzdHJpbmcgfTtcbn1cblxuZXhwb3J0IGNvbnN0IGxhbmd1YWdlc0V4dFBvaW50OiBJRXh0ZW5zaW9uUG9pbnQ8SVJhd0xhbmd1YWdlRXh0ZW5zaW9uUG9pbnRbXT4gPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJUmF3TGFuZ3VhZ2VFeHRlbnNpb25Qb2ludFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnbGFuZ3VhZ2VzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZXMnLCAnQ29udHJpYnV0ZXMgbGFuZ3VhZ2UgZGVjbGFyYXRpb25zLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGlkOiAnJHsxOmxhbmd1YWdlSWR9JywgYWxpYXNlczogWyckezI6bGFiZWx9J10sIGV4dGVuc2lvbnM6IFsnJHszOmV4dGVuc2lvbn0nXSwgY29uZmlndXJhdGlvbjogJy4vbGFuZ3VhZ2UtY29uZmlndXJhdGlvbi5qc29uJyB9IH1dLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZXMuaWQnLCAnSUQgb2YgdGhlIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFsaWFzZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLmFsaWFzZXMnLCAnTmFtZSBhbGlhc2VzIGZvciB0aGUgbGFuZ3VhZ2UuJyksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGV4dGVuc2lvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLmV4dGVuc2lvbnMnLCAnRmlsZSBleHRlbnNpb25zIGFzc29jaWF0ZWQgdG8gdGhlIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IFsnLmZvbyddLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmaWxlbmFtZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLmZpbGVuYW1lcycsICdGaWxlIG5hbWVzIGFzc29jaWF0ZWQgdG8gdGhlIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmaWxlbmFtZVBhdHRlcm5zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlcy5maWxlbmFtZVBhdHRlcm5zJywgJ0ZpbGUgbmFtZSBnbG9iIHBhdHRlcm5zIGFzc29jaWF0ZWQgdG8gdGhlIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtaW1ldHlwZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLm1pbWV0eXBlcycsICdNaW1lIHR5cGVzIGFzc29jaWF0ZWQgdG8gdGhlIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmaXJzdExpbmU6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLmZpcnN0TGluZScsICdBIHJlZ3VsYXIgZXhwcmVzc2lvbiBtYXRjaGluZyB0aGUgZmlyc3QgbGluZSBvZiBhIGZpbGUgb2YgdGhlIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLmNvbmZpZ3VyYXRpb24nLCAnQSByZWxhdGl2ZSBwYXRoIHRvIGEgZmlsZSBjb250YWluaW5nIGNvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgdGhlIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICcuL2xhbmd1YWdlLWNvbmZpZ3VyYXRpb24uanNvbidcblx0XHRcdFx0fSxcblx0XHRcdFx0aWNvbjoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZXMuaWNvbicsICdBIGljb24gdG8gdXNlIGFzIGZpbGUgaWNvbiwgaWYgbm8gaWNvbiB0aGVtZSBwcm92aWRlcyBvbmUgZm9yIHRoZSBsYW5ndWFnZS4nKSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRsaWdodDoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLmljb24ubGlnaHQnLCAnSWNvbiBwYXRoIHdoZW4gYSBsaWdodCB0aGVtZSBpcyB1c2VkJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZGFyazoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLmljb24uZGFyaycsICdJY29uIHBhdGggd2hlbiBhIGRhcmsgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qIChsYW5ndWFnZUNvbnRyaWJ1dGlvbnMpIHtcblx0XHRmb3IgKGNvbnN0IGxhbmd1YWdlQ29udHJpYnV0aW9uIG9mIGxhbmd1YWdlQ29udHJpYnV0aW9ucykge1xuXHRcdFx0aWYgKGxhbmd1YWdlQ29udHJpYnV0aW9uLmlkICYmIGxhbmd1YWdlQ29udHJpYnV0aW9uLmNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0eWllbGQgYG9uTGFuZ3VhZ2U6JHtsYW5ndWFnZUNvbnRyaWJ1dGlvbi5pZH1gO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmNsYXNzIExhbmd1YWdlVGFibGVSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/Lmxhbmd1YWdlcztcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29udHJpYnV0ZXMgPSBtYW5pZmVzdC5jb250cmlidXRlcztcblx0XHRjb25zdCByYXdMYW5ndWFnZXMgPSBjb250cmlidXRlcz8ubGFuZ3VhZ2VzIHx8IFtdO1xuXHRcdGNvbnN0IGxhbmd1YWdlczogeyBpZDogc3RyaW5nOyBuYW1lOiBzdHJpbmc7IGV4dGVuc2lvbnM6IHN0cmluZ1tdOyBoYXNHcmFtbWFyOiBib29sZWFuOyBoYXNTbmlwcGV0czogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGwgb2YgcmF3TGFuZ3VhZ2VzKSB7XG5cdFx0XHRpZiAoaXNWYWxpZExhbmd1YWdlRXh0ZW5zaW9uUG9pbnQobCkpIHtcblx0XHRcdFx0bGFuZ3VhZ2VzLnB1c2goe1xuXHRcdFx0XHRcdGlkOiBsLmlkLFxuXHRcdFx0XHRcdG5hbWU6IChsLmFsaWFzZXMgfHwgW10pWzBdIHx8IGwuaWQsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uczogbC5leHRlbnNpb25zIHx8IFtdLFxuXHRcdFx0XHRcdGhhc0dyYW1tYXI6IGZhbHNlLFxuXHRcdFx0XHRcdGhhc1NuaXBwZXRzOiBmYWxzZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgYnlJZCA9IGluZGV4KGxhbmd1YWdlcywgbCA9PiBsLmlkKTtcblxuXHRcdGNvbnN0IGdyYW1tYXJzID0gY29udHJpYnV0ZXM/LmdyYW1tYXJzIHx8IFtdO1xuXHRcdGdyYW1tYXJzLmZvckVhY2goZ3JhbW1hciA9PiB7XG5cdFx0XHRpZiAoIWlzU3RyaW5nKGdyYW1tYXIubGFuZ3VhZ2UpKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSB0aGUgZ3JhbW1hcnMgdGhhdCBhcmUgb25seSB1c2VkIGFzIGluY2x1ZGVzIGluIG90aGVyIGdyYW1tYXJzXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxldCBsYW5ndWFnZSA9IGJ5SWRbZ3JhbW1hci5sYW5ndWFnZV07XG5cblx0XHRcdGlmIChsYW5ndWFnZSkge1xuXHRcdFx0XHRsYW5ndWFnZS5oYXNHcmFtbWFyID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhbmd1YWdlID0geyBpZDogZ3JhbW1hci5sYW5ndWFnZSwgbmFtZTogZ3JhbW1hci5sYW5ndWFnZSwgZXh0ZW5zaW9uczogW10sIGhhc0dyYW1tYXI6IHRydWUsIGhhc1NuaXBwZXRzOiBmYWxzZSB9O1xuXHRcdFx0XHRieUlkW2xhbmd1YWdlLmlkXSA9IGxhbmd1YWdlO1xuXHRcdFx0XHRsYW5ndWFnZXMucHVzaChsYW5ndWFnZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzbmlwcGV0cyA9IGNvbnRyaWJ1dGVzPy5zbmlwcGV0cyB8fCBbXTtcblx0XHRzbmlwcGV0cy5mb3JFYWNoKHNuaXBwZXQgPT4ge1xuXHRcdFx0aWYgKCFpc1N0cmluZyhzbmlwcGV0Lmxhbmd1YWdlKSkge1xuXHRcdFx0XHQvLyBpZ25vcmUgaW52YWxpZCBzbmlwcGV0c1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgbGFuZ3VhZ2UgPSBieUlkW3NuaXBwZXQubGFuZ3VhZ2VdO1xuXG5cdFx0XHRpZiAobGFuZ3VhZ2UpIHtcblx0XHRcdFx0bGFuZ3VhZ2UuaGFzU25pcHBldHMgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFuZ3VhZ2UgPSB7IGlkOiBzbmlwcGV0Lmxhbmd1YWdlLCBuYW1lOiBzbmlwcGV0Lmxhbmd1YWdlLCBleHRlbnNpb25zOiBbXSwgaGFzR3JhbW1hcjogZmFsc2UsIGhhc1NuaXBwZXRzOiB0cnVlIH07XG5cdFx0XHRcdGJ5SWRbbGFuZ3VhZ2UuaWRdID0gbGFuZ3VhZ2U7XG5cdFx0XHRcdGxhbmd1YWdlcy5wdXNoKGxhbmd1YWdlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghbGFuZ3VhZ2VzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdGxvY2FsaXplKCdsYW5ndWFnZSBpZCcsIFwiSURcIiksXG5cdFx0XHRsb2NhbGl6ZSgnbGFuZ3VhZ2UgbmFtZScsIFwiTmFtZVwiKSxcblx0XHRcdGxvY2FsaXplKCdmaWxlIGV4dGVuc2lvbnMnLCBcIkZpbGUgRXh0ZW5zaW9uc1wiKSxcblx0XHRcdGxvY2FsaXplKCdncmFtbWFyJywgXCJHcmFtbWFyXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3NuaXBwZXRzJywgXCJTbmlwcGV0c1wiKVxuXHRcdF07XG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gbGFuZ3VhZ2VzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSlcblx0XHRcdC5tYXAobCA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bC5pZCwgbC5uYW1lLFxuXHRcdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGAke2wuZXh0ZW5zaW9ucy5tYXAoZSA9PiBgXFxgJHtlfVxcYGApLmpvaW4oJyZuYnNwOycpfWApLFxuXHRcdFx0XHRcdGwuaGFzR3JhbW1hciA/ICdcdTI3MTRcdUZFMEUnIDogJ1xcdTIwMTQnLFxuXHRcdFx0XHRcdGwuaGFzU25pcHBldHMgPyAnXHUyNzE0XHVGRTBFJyA6ICdcXHUyMDE0J1xuXHRcdFx0XHRdO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ2xhbmd1YWdlcycsXG5cdGxhYmVsOiBsb2NhbGl6ZSgnbGFuZ3VhZ2VzJywgXCJQcm9ncmFtbWluZyBMYW5ndWFnZXNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihMYW5ndWFnZVRhYmxlUmVuZGVyZXIpLFxufSk7XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hMYW5ndWFnZVNlcnZpY2UgZXh0ZW5kcyBMYW5ndWFnZVNlcnZpY2Uge1xuXHRwcml2YXRlIF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihlbnZpcm9ubWVudFNlcnZpY2UudmVyYm9zZSB8fCBlbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCB8fCAhZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZSA9IGV4dGVuc2lvblNlcnZpY2U7XG5cblx0XHRsYW5ndWFnZXNFeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zOiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPElSYXdMYW5ndWFnZUV4dGVuc2lvblBvaW50W10+W10pID0+IHtcblx0XHRcdGNvbnN0IGFsbFZhbGlkTGFuZ3VhZ2VzOiBJTGFuZ3VhZ2VFeHRlbnNpb25Qb2ludFtdID0gW107XG5cblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBleHRlbnNpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGV4dGVuc2lvbnNbaV07XG5cblx0XHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGV4dGVuc2lvbi52YWx1ZSkpIHtcblx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdpbnZhbGlkJywgXCJJbnZhbGlkIGBjb250cmlidXRlcy57MH1gLiBFeHBlY3RlZCBhbiBhcnJheS5cIiwgbGFuZ3VhZ2VzRXh0UG9pbnQubmFtZSkpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSBleHRlbnNpb24udmFsdWUubGVuZ3RoOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXh0ID0gZXh0ZW5zaW9uLnZhbHVlW2pdO1xuXHRcdFx0XHRcdGlmIChpc1ZhbGlkTGFuZ3VhZ2VFeHRlbnNpb25Qb2ludChleHQsIGV4dGVuc2lvbi5jb2xsZWN0b3IpKSB7XG5cdFx0XHRcdFx0XHRsZXQgY29uZmlndXJhdGlvbjogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0aWYgKGV4dC5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGNvbmZpZ3VyYXRpb24gPSBqb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGV4dC5jb25maWd1cmF0aW9uKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGFsbFZhbGlkTGFuZ3VhZ2VzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRpZDogZXh0LmlkLFxuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25zOiBleHQuZXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRcdFx0ZmlsZW5hbWVzOiBleHQuZmlsZW5hbWVzLFxuXHRcdFx0XHRcdFx0XHRmaWxlbmFtZVBhdHRlcm5zOiBleHQuZmlsZW5hbWVQYXR0ZXJucyxcblx0XHRcdFx0XHRcdFx0Zmlyc3RMaW5lOiBleHQuZmlyc3RMaW5lLFxuXHRcdFx0XHRcdFx0XHRhbGlhc2VzOiBleHQuYWxpYXNlcyxcblx0XHRcdFx0XHRcdFx0bWltZXR5cGVzOiBleHQubWltZXR5cGVzLFxuXHRcdFx0XHRcdFx0XHRjb25maWd1cmF0aW9uOiBjb25maWd1cmF0aW9uLFxuXHRcdFx0XHRcdFx0XHRpY29uOiBleHQuaWNvbiAmJiB7XG5cdFx0XHRcdFx0XHRcdFx0bGlnaHQ6IGpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgZXh0Lmljb24ubGlnaHQpLFxuXHRcdFx0XHRcdFx0XHRcdGRhcms6IGpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgZXh0Lmljb24uZGFyaylcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlZ2lzdHJ5LnNldER5bmFtaWNMYW5ndWFnZXMoYWxsVmFsaWRMYW5ndWFnZXMpO1xuXG5cdFx0fSk7XG5cblx0XHR0aGlzLnVwZGF0ZU1pbWUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihGSUxFU19BU1NPQ0lBVElPTlNfQ09ORklHKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZU1pbWUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlTWltZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFJlcXVlc3RSaWNoTGFuZ3VhZ2VGZWF0dXJlcygobGFuZ3VhZ2VJZCkgPT4ge1xuXHRcdFx0Ly8gZXh0ZW5zaW9uIGFjdGl2YXRpb25cblx0XHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkxhbmd1YWdlOiR7bGFuZ3VhZ2VJZH1gKTtcblx0XHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvbkxhbmd1YWdlYCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNaW1lKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpO1xuXG5cdFx0Ly8gQ2xlYXIgdXNlciBjb25maWd1cmVkIG1pbWUgYXNzb2NpYXRpb25zXG5cdFx0Y2xlYXJDb25maWd1cmVkTGFuZ3VhZ2VBc3NvY2lhdGlvbnMoKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGJhc2VkIG9uIHNldHRpbmdzXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24uZmlsZXM/LmFzc29jaWF0aW9ucykge1xuXHRcdFx0T2JqZWN0LmtleXMoY29uZmlndXJhdGlvbi5maWxlcy5hc3NvY2lhdGlvbnMpLmZvckVhY2gocGF0dGVybiA9PiB7XG5cdFx0XHRcdGNvbnN0IGxhbmdJZCA9IGNvbmZpZ3VyYXRpb24uZmlsZXMhLmFzc29jaWF0aW9uc1twYXR0ZXJuXTtcblx0XHRcdFx0aWYgKHR5cGVvZiBsYW5nSWQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYElnbm9yaW5nIGNvbmZpZ3VyZWQgJ2ZpbGVzLmFzc29jaWF0aW9ucycgZm9yICcke3BhdHRlcm59JyBiZWNhdXNlIGl0cyB0eXBlIGlzIG5vdCBhIHN0cmluZyBidXQgJyR7dHlwZW9mIGxhbmdJZH0nYCk7XG5cblx0XHRcdFx0XHRyZXR1cm47IC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDcyODRcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG1pbWVUeXBlID0gdGhpcy5nZXRNaW1lVHlwZShsYW5nSWQpIHx8IGB0ZXh0L3gtJHtsYW5nSWR9YDtcblxuXHRcdFx0XHRyZWdpc3RlckNvbmZpZ3VyZWRMYW5ndWFnZUFzc29jaWF0aW9uKHsgaWQ6IGxhbmdJZCwgbWltZTogbWltZVR5cGUsIGZpbGVwYXR0ZXJuOiBwYXR0ZXJuIH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkT3JTdHJpbmdBcnJheSh2YWx1ZTogc3RyaW5nW10pOiBib29sZWFuIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiB2YWx1ZS5ldmVyeShpdGVtID0+IHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJyk7XG59XG5cbmZ1bmN0aW9uIGlzVmFsaWRMYW5ndWFnZUV4dGVuc2lvblBvaW50KHZhbHVlOiBhbnksIGNvbGxlY3Rvcj86IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IpOiB2YWx1ZSBpcyBJUmF3TGFuZ3VhZ2VFeHRlbnNpb25Qb2ludCB7XG5cdGlmICghdmFsdWUpIHtcblx0XHRjb2xsZWN0b3I/LmVycm9yKGxvY2FsaXplKCdpbnZhbGlkLmVtcHR5JywgXCJFbXB0eSB2YWx1ZSBmb3IgYGNvbnRyaWJ1dGVzLnswfWBcIiwgbGFuZ3VhZ2VzRXh0UG9pbnQubmFtZSkpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlLmlkICE9PSAnc3RyaW5nJykge1xuXHRcdGNvbGxlY3Rvcj8uZXJyb3IobG9jYWxpemUoJ3JlcXVpcmUuaWQnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdpZCcpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKCFpc1VuZGVmaW5lZE9yU3RyaW5nQXJyYXkodmFsdWUuZXh0ZW5zaW9ucykpIHtcblx0XHRjb2xsZWN0b3I/LmVycm9yKGxvY2FsaXplKCdvcHQuZXh0ZW5zaW9ucycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nW11gXCIsICdleHRlbnNpb25zJykpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoIWlzVW5kZWZpbmVkT3JTdHJpbmdBcnJheSh2YWx1ZS5maWxlbmFtZXMpKSB7XG5cdFx0Y29sbGVjdG9yPy5lcnJvcihsb2NhbGl6ZSgnb3B0LmZpbGVuYW1lcycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nW11gXCIsICdmaWxlbmFtZXMnKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICh0eXBlb2YgdmFsdWUuZmlyc3RMaW5lICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgdmFsdWUuZmlyc3RMaW5lICE9PSAnc3RyaW5nJykge1xuXHRcdGNvbGxlY3Rvcj8uZXJyb3IobG9jYWxpemUoJ29wdC5maXJzdExpbmUnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2ZpcnN0TGluZScpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZS5jb25maWd1cmF0aW9uICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgdmFsdWUuY29uZmlndXJhdGlvbiAhPT0gJ3N0cmluZycpIHtcblx0XHRjb2xsZWN0b3I/LmVycm9yKGxvY2FsaXplKCdvcHQuY29uZmlndXJhdGlvbicsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnY29uZmlndXJhdGlvbicpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKCFpc1VuZGVmaW5lZE9yU3RyaW5nQXJyYXkodmFsdWUuYWxpYXNlcykpIHtcblx0XHRjb2xsZWN0b3I/LmVycm9yKGxvY2FsaXplKCdvcHQuYWxpYXNlcycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nW11gXCIsICdhbGlhc2VzJykpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoIWlzVW5kZWZpbmVkT3JTdHJpbmdBcnJheSh2YWx1ZS5taW1ldHlwZXMpKSB7XG5cdFx0Y29sbGVjdG9yPy5lcnJvcihsb2NhbGl6ZSgnb3B0Lm1pbWV0eXBlcycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nW11gXCIsICdtaW1ldHlwZXMnKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICh0eXBlb2YgdmFsdWUuaWNvbiAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlLmljb24gIT09ICdvYmplY3QnIHx8IHR5cGVvZiB2YWx1ZS5pY29uLmxpZ2h0ICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgdmFsdWUuaWNvbi5kYXJrICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29sbGVjdG9yPy5lcnJvcihsb2NhbGl6ZSgnb3B0Lmljb24nLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIGFuZCBtdXN0IGJlIG9mIHR5cGUgYG9iamVjdGAgd2l0aCBwcm9wZXJ0aWVzIGB7MX1gIGFuZCBgezJ9YCBvZiB0eXBlIGBzdHJpbmdgXCIsICdpY29uJywgJ2xpZ2h0JywgJ2RhcmsnKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJTGFuZ3VhZ2VTZXJ2aWNlLCBXb3JrYmVuY2hMYW5ndWFnZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQ0FBcUMsNkNBQTZDO0FBQzNGLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQWtDLHdCQUF3QjtBQUMxRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlDQUFzRDtBQUMvRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFvQywwQkFBZ0U7QUFDcEcsU0FBUyxtQkFBbUIseUJBQXlCO0FBRXJELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQW1IO0FBQzVILFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQWNsQixNQUFNLG9CQUFtRSxtQkFBbUIsdUJBQXFEO0FBQUEsRUFDdkosZ0JBQWdCO0FBQUEsRUFD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
