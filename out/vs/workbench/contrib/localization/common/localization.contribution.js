import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { registerAction2 } from "../../../../platform/actions/common/actions.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ClearDisplayLanguageAction, ConfigureDisplayLanguageAction } from "./localizationsActions.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
class BaseLocalizationWorkbenchContribution extends Disposable {
  constructor() {
    super();
    registerAction2(ConfigureDisplayLanguageAction);
    registerAction2(ClearDisplayLanguageAction);
    ExtensionsRegistry.registerExtensionPoint({
      extensionPoint: "localizations",
      defaultExtensionKind: ["ui", "workspace"],
      jsonSchema: {
        description: localize("vscode.extension.contributes.localizations", "Contributes localizations to the editor"),
        type: "array",
        default: [],
        items: {
          type: "object",
          required: ["languageId", "translations"],
          defaultSnippets: [{ body: { languageId: "", languageName: "", localizedLanguageName: "", translations: [{ id: "vscode", path: "" }] } }],
          properties: {
            languageId: {
              description: localize("vscode.extension.contributes.localizations.languageId", "Id of the language into which the display strings are translated."),
              type: "string"
            },
            languageName: {
              description: localize("vscode.extension.contributes.localizations.languageName", "Name of the language in English."),
              type: "string"
            },
            localizedLanguageName: {
              description: localize("vscode.extension.contributes.localizations.languageNameLocalized", "Name of the language in contributed language."),
              type: "string"
            },
            translations: {
              description: localize("vscode.extension.contributes.localizations.translations", "List of translations associated to the language."),
              type: "array",
              default: [{ id: "vscode", path: "" }],
              items: {
                type: "object",
                required: ["id", "path"],
                properties: {
                  id: {
                    type: "string",
                    description: localize("vscode.extension.contributes.localizations.translations.id", "Id of VS Code or Extension for which this translation is contributed to. Id of VS Code is always `vscode` and of extension should be in format `publisherId.extensionName`."),
                    pattern: "^((vscode)|([a-z0-9A-Z][a-z0-9A-Z-]*)\\.([a-z0-9A-Z][a-z0-9A-Z-]*))$",
                    patternErrorMessage: localize("vscode.extension.contributes.localizations.translations.id.pattern", "Id should be `vscode` or in format `publisherId.extensionName` for translating VS code or an extension respectively.")
                  },
                  path: {
                    type: "string",
                    description: localize("vscode.extension.contributes.localizations.translations.path", "A relative path to a file containing translations for the language.")
                  }
                },
                defaultSnippets: [{ body: { id: "", path: "" } }]
              }
            }
          }
        }
      }
    });
  }
}
class LocalizationsDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.localizations;
  }
  render(manifest) {
    const localizations = manifest.contributes?.localizations || [];
    if (!localizations.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("language id", "Language ID"),
      localize("localizations language name", "Language Name"),
      localize("localizations localized language name", "Language Name (Localized)")
    ];
    const rows = localizations.sort((a, b) => a.languageId.localeCompare(b.languageId)).map((localization) => {
      return [
        localization.languageId,
        localization.languageName ?? "",
        localization.localizedLanguageName ?? ""
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
  id: "localizations",
  label: localize("localizations", "Language Packs"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(LocalizationsDataRenderer)
});
export {
  BaseLocalizationWorkbenchContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGxvY2FsaXphdGlvblxcY29tbW9uXFxsb2NhbGl6YXRpb24uY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQ2xlYXJEaXNwbGF5TGFuZ3VhZ2VBY3Rpb24sIENvbmZpZ3VyZURpc3BsYXlMYW5ndWFnZUFjdGlvbiB9IGZyb20gJy4vbG9jYWxpemF0aW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyLCBJUmVuZGVyZWREYXRhLCBJVGFibGVEYXRhLCBJUm93RGF0YSwgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuXG5leHBvcnQgY2xhc3MgQmFzZUxvY2FsaXphdGlvbldvcmtiZW5jaENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGFjdGlvbiB0byBjb25maWd1cmUgbG9jYWxlIGFuZCByZWxhdGVkIHNldHRpbmdzXG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENvbmZpZ3VyZURpc3BsYXlMYW5ndWFnZUFjdGlvbik7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENsZWFyRGlzcGxheUxhbmd1YWdlQWN0aW9uKTtcblxuXHRcdEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50KHtcblx0XHRcdGV4dGVuc2lvblBvaW50OiAnbG9jYWxpemF0aW9ucycsXG5cdFx0XHRkZWZhdWx0RXh0ZW5zaW9uS2luZDogWyd1aScsICd3b3Jrc3BhY2UnXSxcblx0XHRcdGpzb25TY2hlbWE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxvY2FsaXphdGlvbnMnLCBcIkNvbnRyaWJ1dGVzIGxvY2FsaXphdGlvbnMgdG8gdGhlIGVkaXRvclwiKSxcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0ZGVmYXVsdDogW10sXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnbGFuZ3VhZ2VJZCcsICd0cmFuc2xhdGlvbnMnXSxcblx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgbGFuZ3VhZ2VJZDogJycsIGxhbmd1YWdlTmFtZTogJycsIGxvY2FsaXplZExhbmd1YWdlTmFtZTogJycsIHRyYW5zbGF0aW9uczogW3sgaWQ6ICd2c2NvZGUnLCBwYXRoOiAnJyB9XSB9IH1dLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGxhbmd1YWdlSWQ6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxvY2FsaXphdGlvbnMubGFuZ3VhZ2VJZCcsICdJZCBvZiB0aGUgbGFuZ3VhZ2UgaW50byB3aGljaCB0aGUgZGlzcGxheSBzdHJpbmdzIGFyZSB0cmFuc2xhdGVkLicpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGxhbmd1YWdlTmFtZToge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubG9jYWxpemF0aW9ucy5sYW5ndWFnZU5hbWUnLCAnTmFtZSBvZiB0aGUgbGFuZ3VhZ2UgaW4gRW5nbGlzaC4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZWRMYW5ndWFnZU5hbWU6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxvY2FsaXphdGlvbnMubGFuZ3VhZ2VOYW1lTG9jYWxpemVkJywgJ05hbWUgb2YgdGhlIGxhbmd1YWdlIGluIGNvbnRyaWJ1dGVkIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRyYW5zbGF0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubG9jYWxpemF0aW9ucy50cmFuc2xhdGlvbnMnLCAnTGlzdCBvZiB0cmFuc2xhdGlvbnMgYXNzb2NpYXRlZCB0byB0aGUgbGFuZ3VhZ2UuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IFt7IGlkOiAndnNjb2RlJywgcGF0aDogJycgfV0sXG5cdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaWQnLCAncGF0aCddLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubG9jYWxpemF0aW9ucy50cmFuc2xhdGlvbnMuaWQnLCBcIklkIG9mIFZTIENvZGUgb3IgRXh0ZW5zaW9uIGZvciB3aGljaCB0aGlzIHRyYW5zbGF0aW9uIGlzIGNvbnRyaWJ1dGVkIHRvLiBJZCBvZiBWUyBDb2RlIGlzIGFsd2F5cyBgdnNjb2RlYCBhbmQgb2YgZXh0ZW5zaW9uIHNob3VsZCBiZSBpbiBmb3JtYXQgYHB1Ymxpc2hlcklkLmV4dGVuc2lvbk5hbWVgLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ14oKHZzY29kZSl8KFthLXowLTlBLVpdW2EtejAtOUEtWi1dKilcXFxcLihbYS16MC05QS1aXVthLXowLTlBLVotXSopKSQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sb2NhbGl6YXRpb25zLnRyYW5zbGF0aW9ucy5pZC5wYXR0ZXJuJywgXCJJZCBzaG91bGQgYmUgYHZzY29kZWAgb3IgaW4gZm9ybWF0IGBwdWJsaXNoZXJJZC5leHRlbnNpb25OYW1lYCBmb3IgdHJhbnNsYXRpbmcgVlMgY29kZSBvciBhbiBleHRlbnNpb24gcmVzcGVjdGl2ZWx5LlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sb2NhbGl6YXRpb25zLnRyYW5zbGF0aW9ucy5wYXRoJywgXCJBIHJlbGF0aXZlIHBhdGggdG8gYSBmaWxlIGNvbnRhaW5pbmcgdHJhbnNsYXRpb25zIGZvciB0aGUgbGFuZ3VhZ2UuXCIpXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgaWQ6ICcnLCBwYXRoOiAnJyB9IH1dLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIExvY2FsaXphdGlvbnNEYXRhUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3RhYmxlJztcblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5sb2NhbGl6YXRpb25zO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBsb2NhbGl6YXRpb25zID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/LmxvY2FsaXphdGlvbnMgfHwgW107XG5cdFx0aWYgKCFsb2NhbGl6YXRpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdGxvY2FsaXplKCdsYW5ndWFnZSBpZCcsIFwiTGFuZ3VhZ2UgSURcIiksXG5cdFx0XHRsb2NhbGl6ZSgnbG9jYWxpemF0aW9ucyBsYW5ndWFnZSBuYW1lJywgXCJMYW5ndWFnZSBOYW1lXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2xvY2FsaXphdGlvbnMgbG9jYWxpemVkIGxhbmd1YWdlIG5hbWUnLCBcIkxhbmd1YWdlIE5hbWUgKExvY2FsaXplZClcIiksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJvd3M6IElSb3dEYXRhW11bXSA9IGxvY2FsaXphdGlvbnNcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLmxhbmd1YWdlSWQubG9jYWxlQ29tcGFyZShiLmxhbmd1YWdlSWQpKVxuXHRcdFx0Lm1hcChsb2NhbGl6YXRpb24gPT4ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdGxvY2FsaXphdGlvbi5sYW5ndWFnZUlkLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbi5sYW5ndWFnZU5hbWUgPz8gJycsXG5cdFx0XHRcdFx0bG9jYWxpemF0aW9uLmxvY2FsaXplZExhbmd1YWdlTmFtZSA/PyAnJ1xuXHRcdFx0XHRdO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ2xvY2FsaXphdGlvbnMnLFxuXHRsYWJlbDogbG9jYWxpemUoJ2xvY2FsaXphdGlvbnMnLCBcIkxhbmd1YWdlIFBhY2tzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoTG9jYWxpemF0aW9uc0RhdGFSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsNEJBQTRCLHNDQUFzQztBQUMzRSxTQUEwRyxrQkFBa0I7QUFDNUgsU0FBUywwQkFBMEI7QUFFNUIsTUFBTSw4Q0FBOEMsV0FBNkM7QUFBQSxFQUN2RyxjQUFjO0FBQ2IsVUFBTTtBQUdOLG9CQUFn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
