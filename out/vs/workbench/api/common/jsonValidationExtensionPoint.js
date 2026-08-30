import * as nls from "../../../nls.js";
import { ExtensionsRegistry } from "../../services/extensions/common/extensionsRegistry.js";
import * as resources from "../../../base/common/resources.js";
import { isString } from "../../../base/common/types.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Extensions } from "../../services/extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "jsonValidation",
  defaultExtensionKind: ["workspace", "web"],
  jsonSchema: {
    description: nls.localize("contributes.jsonValidation", "Contributes json schema configuration."),
    type: "array",
    defaultSnippets: [{ body: [{ fileMatch: "${1:file.json}", url: "${2:url}" }] }],
    items: {
      type: "object",
      defaultSnippets: [{ body: { fileMatch: "${1:file.json}", url: "${2:url}" } }],
      properties: {
        fileMatch: {
          type: ["string", "array"],
          description: nls.localize("contributes.jsonValidation.fileMatch", `The file pattern (or an array of patterns) to match, for example "package.json" or "*.launch". Exclusion patterns start with '!'`),
          items: {
            type: ["string"]
          }
        },
        url: {
          description: nls.localize("contributes.jsonValidation.url", "A schema URL ('http:', 'https:') or relative path to the extension folder ('./')."),
          type: "string"
        }
      }
    }
  }
});
const registryExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "jsonValidationRegistry",
  defaultExtensionKind: ["workspace", "web"],
  jsonSchema: {
    description: nls.localize("contributes.jsonValidationRegistry", "Contributes a JSON validation registry. The registry can be a dynamic resource from a filesystem provider and allows associations to change at runtime."),
    type: "array",
    defaultSnippets: [{ body: [{ url: "${1:url}" }] }],
    items: {
      type: "object",
      defaultSnippets: [{ body: { url: "${1:url}" } }],
      properties: {
        url: {
          description: nls.localize("contributes.jsonValidationRegistry.url", "A registry URI or relative path to the extension folder ('./')."),
          type: "string"
        }
      }
    }
  }
});
class JSONValidationExtensionPoint {
  constructor() {
    configurationExtPoint.setHandler((extensions) => {
      for (const extension of extensions) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        const extensionLocation = extension.description.extensionLocation;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.jsonValidation", "'configuration.jsonValidation' must be a array"));
          return;
        }
        extensionValue.forEach((extension2) => {
          if (!isString(extension2.fileMatch) && !(Array.isArray(extension2.fileMatch) && extension2.fileMatch.every(isString))) {
            collector.error(nls.localize("invalid.fileMatch", "'configuration.jsonValidation.fileMatch' must be defined as a string or an array of strings."));
            return;
          }
          const uri = extension2.url;
          if (!isString(uri)) {
            collector.error(nls.localize("invalid.url", "'configuration.jsonValidation.url' must be a URL or relative path"));
            return;
          }
          if (uri.startsWith("./")) {
            try {
              const colorThemeLocation = resources.joinPath(extensionLocation, uri);
              if (!resources.isEqualOrParent(colorThemeLocation, extensionLocation)) {
                collector.warn(nls.localize("invalid.path.1", "Expected `contributes.{0}.url` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", configurationExtPoint.name, colorThemeLocation.toString(), extensionLocation.path));
              }
            } catch (e) {
              collector.error(nls.localize("invalid.url.fileschema", "'configuration.jsonValidation.url' is an invalid relative URL: {0}", e.message));
            }
          } else if (!/^[^:/?#]+:\/\//.test(uri)) {
            collector.error(nls.localize("invalid.url.schema", "'configuration.jsonValidation.url' must be an absolute URL or start with './'  to reference schemas located in the extension."));
            return;
          }
        });
      }
    });
    registryExtPoint.setHandler((extensions) => {
      for (const extension of extensions) {
        const catalogs = extension.value;
        const collector = extension.collector;
        const extensionLocation = extension.description.extensionLocation;
        if (!Array.isArray(catalogs)) {
          collector.error(nls.localize("invalid.jsonValidationRegistry", "'configuration.jsonValidationRegistry' must be an array"));
          continue;
        }
        for (const catalog of catalogs) {
          const uri = catalog?.url;
          if (!isString(uri)) {
            collector.error(nls.localize("invalid.jsonValidationRegistry.url", "'configuration.jsonValidationRegistry.url' must be a URI or relative path"));
            continue;
          }
          if (uri.startsWith("./")) {
            try {
              const catalogLocation = resources.joinPath(extensionLocation, uri);
              if (!resources.isEqualOrParent(catalogLocation, extensionLocation)) {
                collector.warn(nls.localize("invalid.jsonValidationRegistry.path", "Expected `contributes.{0}.url` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", registryExtPoint.name, catalogLocation.toString(), extensionLocation.path));
              }
            } catch (e) {
              collector.error(nls.localize("invalid.jsonValidationRegistry.fileschema", "'configuration.jsonValidationRegistry.url' is an invalid relative URI: {0}", e.message));
            }
          } else if (!/^[^:/?#]+:\/\//.test(uri)) {
            collector.error(nls.localize("invalid.jsonValidationRegistry.schema", "'configuration.jsonValidationRegistry.url' must be an absolute URI or start with './' to reference a registry located in the extension."));
          }
        }
      }
    });
  }
}
class JSONValidationDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.jsonValidation;
  }
  render(manifest) {
    const contrib = manifest.contributes?.jsonValidation || [];
    if (!contrib.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("fileMatch", "File Match"),
      nls.localize("schema", "Schema")
    ];
    const rows = contrib.map((v) => {
      return [
        new MarkdownString().appendMarkdown(`\`${Array.isArray(v.fileMatch) ? v.fileMatch.join(", ") : v.fileMatch}\``),
        v.url
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
  id: "jsonValidation",
  label: nls.localize("jsonValidation", "JSON Validation"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(JSONValidationDataRenderer)
});
export {
  JSONValidationExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxqc29uVmFsaWRhdGlvbkV4dGVuc2lvblBvaW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgSVJlbmRlcmVkRGF0YSwgSVJvd0RhdGEsIElUYWJsZURhdGEgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5cbmludGVyZmFjZSBJSlNPTlZhbGlkYXRpb25FeHRlbnNpb25Qb2ludCB7XG5cdGZpbGVNYXRjaDogc3RyaW5nIHwgc3RyaW5nW107XG5cdHVybDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSUpTT05WYWxpZGF0aW9uUmVnaXN0cnlFeHRlbnNpb25Qb2ludCB7XG5cdHVybDogc3RyaW5nO1xufVxuXG5jb25zdCBjb25maWd1cmF0aW9uRXh0UG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJSlNPTlZhbGlkYXRpb25FeHRlbnNpb25Qb2ludFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnanNvblZhbGlkYXRpb24nLFxuXHRkZWZhdWx0RXh0ZW5zaW9uS2luZDogWyd3b3Jrc3BhY2UnLCAnd2ViJ10sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5qc29uVmFsaWRhdGlvbicsICdDb250cmlidXRlcyBqc29uIHNjaGVtYSBjb25maWd1cmF0aW9uLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiBbeyBmaWxlTWF0Y2g6ICckezE6ZmlsZS5qc29ufScsIHVybDogJyR7Mjp1cmx9JyB9XSB9XSxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgZmlsZU1hdGNoOiAnJHsxOmZpbGUuanNvbn0nLCB1cmw6ICckezI6dXJsfScgfSB9XSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0ZmlsZU1hdGNoOiB7XG5cdFx0XHRcdFx0dHlwZTogWydzdHJpbmcnLCAnYXJyYXknXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5qc29uVmFsaWRhdGlvbi5maWxlTWF0Y2gnLCAnVGhlIGZpbGUgcGF0dGVybiAob3IgYW4gYXJyYXkgb2YgcGF0dGVybnMpIHRvIG1hdGNoLCBmb3IgZXhhbXBsZSBcInBhY2thZ2UuanNvblwiIG9yIFwiKi5sYXVuY2hcIi4gRXhjbHVzaW9uIHBhdHRlcm5zIHN0YXJ0IHdpdGggXFwnIVxcJycpLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZyddXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR1cmw6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5qc29uVmFsaWRhdGlvbi51cmwnLCAnQSBzY2hlbWEgVVJMIChcXCdodHRwOlxcJywgXFwnaHR0cHM6XFwnKSBvciByZWxhdGl2ZSBwYXRoIHRvIHRoZSBleHRlbnNpb24gZm9sZGVyIChcXCcuL1xcJykuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmNvbnN0IHJlZ2lzdHJ5RXh0UG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJSlNPTlZhbGlkYXRpb25SZWdpc3RyeUV4dGVuc2lvblBvaW50W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdqc29uVmFsaWRhdGlvblJlZ2lzdHJ5Jyxcblx0ZGVmYXVsdEV4dGVuc2lvbktpbmQ6IFsnd29ya3NwYWNlJywgJ3dlYiddLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuanNvblZhbGlkYXRpb25SZWdpc3RyeScsICdDb250cmlidXRlcyBhIEpTT04gdmFsaWRhdGlvbiByZWdpc3RyeS4gVGhlIHJlZ2lzdHJ5IGNhbiBiZSBhIGR5bmFtaWMgcmVzb3VyY2UgZnJvbSBhIGZpbGVzeXN0ZW0gcHJvdmlkZXIgYW5kIGFsbG93cyBhc3NvY2lhdGlvbnMgdG8gY2hhbmdlIGF0IHJ1bnRpbWUuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IFt7IHVybDogJyR7MTp1cmx9JyB9XSB9XSxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgdXJsOiAnJHsxOnVybH0nIH0gfV0sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHVybDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmpzb25WYWxpZGF0aW9uUmVnaXN0cnkudXJsJywgJ0EgcmVnaXN0cnkgVVJJIG9yIHJlbGF0aXZlIHBhdGggdG8gdGhlIGV4dGVuc2lvbiBmb2xkZXIgKFxcJy4vXFwnKS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIEpTT05WYWxpZGF0aW9uRXh0ZW5zaW9uUG9pbnQge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbmZpZ3VyYXRpb25FeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblZhbHVlID0gPElKU09OVmFsaWRhdGlvbkV4dGVuc2lvblBvaW50W10+ZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0b3IgPSBleHRlbnNpb24uY29sbGVjdG9yO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Mb2NhdGlvbiA9IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbjtcblxuXHRcdFx0XHRpZiAoIWV4dGVuc2lvblZhbHVlIHx8ICFBcnJheS5pc0FycmF5KGV4dGVuc2lvblZhbHVlKSkge1xuXHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuanNvblZhbGlkYXRpb24nLCBcIidjb25maWd1cmF0aW9uLmpzb25WYWxpZGF0aW9uJyBtdXN0IGJlIGEgYXJyYXlcIikpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRleHRlbnNpb25WYWx1ZS5mb3JFYWNoKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdFx0aWYgKCFpc1N0cmluZyhleHRlbnNpb24uZmlsZU1hdGNoKSAmJiAhKEFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uLmZpbGVNYXRjaCkgJiYgZXh0ZW5zaW9uLmZpbGVNYXRjaC5ldmVyeShpc1N0cmluZykpKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmZpbGVNYXRjaCcsIFwiJ2NvbmZpZ3VyYXRpb24uanNvblZhbGlkYXRpb24uZmlsZU1hdGNoJyBtdXN0IGJlIGRlZmluZWQgYXMgYSBzdHJpbmcgb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncy5cIikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB1cmkgPSBleHRlbnNpb24udXJsO1xuXHRcdFx0XHRcdGlmICghaXNTdHJpbmcodXJpKSkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC51cmwnLCBcIidjb25maWd1cmF0aW9uLmpzb25WYWxpZGF0aW9uLnVybCcgbXVzdCBiZSBhIFVSTCBvciByZWxhdGl2ZSBwYXRoXCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHVyaS5zdGFydHNXaXRoKCcuLycpKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjb2xvclRoZW1lTG9jYXRpb24gPSByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sIHVyaSk7XG5cdFx0XHRcdFx0XHRcdGlmICghcmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudChjb2xvclRoZW1lTG9jYXRpb24sIGV4dGVuc2lvbkxvY2F0aW9uKSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbGxlY3Rvci53YXJuKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5wYXRoLjEnLCBcIkV4cGVjdGVkIGBjb250cmlidXRlcy57MH0udXJsYCAoezF9KSB0byBiZSBpbmNsdWRlZCBpbnNpZGUgZXh0ZW5zaW9uJ3MgZm9sZGVyICh7Mn0pLiBUaGlzIG1pZ2h0IG1ha2UgdGhlIGV4dGVuc2lvbiBub24tcG9ydGFibGUuXCIsIGNvbmZpZ3VyYXRpb25FeHRQb2ludC5uYW1lLCBjb2xvclRoZW1lTG9jYXRpb24udG9TdHJpbmcoKSwgZXh0ZW5zaW9uTG9jYXRpb24ucGF0aCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQudXJsLmZpbGVzY2hlbWEnLCBcIidjb25maWd1cmF0aW9uLmpzb25WYWxpZGF0aW9uLnVybCcgaXMgYW4gaW52YWxpZCByZWxhdGl2ZSBVUkw6IHswfVwiLCBlLm1lc3NhZ2UpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKCEvXlteOi8/I10rOlxcL1xcLy8udGVzdCh1cmkpKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnVybC5zY2hlbWEnLCBcIidjb25maWd1cmF0aW9uLmpzb25WYWxpZGF0aW9uLnVybCcgbXVzdCBiZSBhbiBhYnNvbHV0ZSBVUkwgb3Igc3RhcnQgd2l0aCAnLi8nICB0byByZWZlcmVuY2Ugc2NoZW1hcyBsb2NhdGVkIGluIHRoZSBleHRlbnNpb24uXCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmVnaXN0cnlFeHRQb2ludC5zZXRIYW5kbGVyKGV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb25zdCBjYXRhbG9ncyA9IGV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdFx0Y29uc3QgY29sbGVjdG9yID0gZXh0ZW5zaW9uLmNvbGxlY3Rvcjtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb24gPSBleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb247XG5cblx0XHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGNhdGFsb2dzKSkge1xuXHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuanNvblZhbGlkYXRpb25SZWdpc3RyeScsIFwiJ2NvbmZpZ3VyYXRpb24uanNvblZhbGlkYXRpb25SZWdpc3RyeScgbXVzdCBiZSBhbiBhcnJheVwiKSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBjYXRhbG9nIG9mIGNhdGFsb2dzKSB7XG5cdFx0XHRcdFx0Y29uc3QgdXJpID0gY2F0YWxvZz8udXJsO1xuXHRcdFx0XHRcdGlmICghaXNTdHJpbmcodXJpKSkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5qc29uVmFsaWRhdGlvblJlZ2lzdHJ5LnVybCcsIFwiJ2NvbmZpZ3VyYXRpb24uanNvblZhbGlkYXRpb25SZWdpc3RyeS51cmwnIG11c3QgYmUgYSBVUkkgb3IgcmVsYXRpdmUgcGF0aFwiKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHVyaS5zdGFydHNXaXRoKCcuLycpKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjYXRhbG9nTG9jYXRpb24gPSByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uTG9jYXRpb24sIHVyaSk7XG5cdFx0XHRcdFx0XHRcdGlmICghcmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudChjYXRhbG9nTG9jYXRpb24sIGV4dGVuc2lvbkxvY2F0aW9uKSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbGxlY3Rvci53YXJuKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5qc29uVmFsaWRhdGlvblJlZ2lzdHJ5LnBhdGgnLCBcIkV4cGVjdGVkIGBjb250cmlidXRlcy57MH0udXJsYCAoezF9KSB0byBiZSBpbmNsdWRlZCBpbnNpZGUgZXh0ZW5zaW9uJ3MgZm9sZGVyICh7Mn0pLiBUaGlzIG1pZ2h0IG1ha2UgdGhlIGV4dGVuc2lvbiBub24tcG9ydGFibGUuXCIsIHJlZ2lzdHJ5RXh0UG9pbnQubmFtZSwgY2F0YWxvZ0xvY2F0aW9uLnRvU3RyaW5nKCksIGV4dGVuc2lvbkxvY2F0aW9uLnBhdGgpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmpzb25WYWxpZGF0aW9uUmVnaXN0cnkuZmlsZXNjaGVtYScsIFwiJ2NvbmZpZ3VyYXRpb24uanNvblZhbGlkYXRpb25SZWdpc3RyeS51cmwnIGlzIGFuIGludmFsaWQgcmVsYXRpdmUgVVJJOiB7MH1cIiwgZS5tZXNzYWdlKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghL15bXjovPyNdKzpcXC9cXC8vLnRlc3QodXJpKSkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5qc29uVmFsaWRhdGlvblJlZ2lzdHJ5LnNjaGVtYScsIFwiJ2NvbmZpZ3VyYXRpb24uanNvblZhbGlkYXRpb25SZWdpc3RyeS51cmwnIG11c3QgYmUgYW4gYWJzb2x1dGUgVVJJIG9yIHN0YXJ0IHdpdGggJy4vJyB0byByZWZlcmVuY2UgYSByZWdpc3RyeSBsb2NhdGVkIGluIHRoZSBleHRlbnNpb24uXCIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG59XG5cbmNsYXNzIEpTT05WYWxpZGF0aW9uRGF0YVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8uanNvblZhbGlkYXRpb247XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IGNvbnRyaWIgPSBtYW5pZmVzdC5jb250cmlidXRlcz8uanNvblZhbGlkYXRpb24gfHwgW107XG5cdFx0aWYgKCFjb250cmliLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdG5scy5sb2NhbGl6ZSgnZmlsZU1hdGNoJywgXCJGaWxlIE1hdGNoXCIpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdzY2hlbWEnLCBcIlNjaGVtYVwiKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gY29udHJpYi5tYXAodiA9PiB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgXFxgJHtBcnJheS5pc0FycmF5KHYuZmlsZU1hdGNoKSA/IHYuZmlsZU1hdGNoLmpvaW4oJywgJykgOiB2LmZpbGVNYXRjaH1cXGBgKSxcblx0XHRcdFx0di51cmwsXG5cdFx0XHRdO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdqc29uVmFsaWRhdGlvbicsXG5cdGxhYmVsOiBubHMubG9jYWxpemUoJ2pzb25WYWxpZGF0aW9uJywgXCJKU09OIFZhbGlkYXRpb25cIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihKU09OVmFsaWRhdGlvbkRhdGFSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtB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SSxTQUFTLHVDQUF1QyxvSUFBb0ksaUJBQWlCLE1BQU0sZ0JBQWdCLFNBQVMsR0FBRyxrQkFBa0IsSUFBSSxDQUFDO0FBQUEsY0FDbFI7QUFBQSxZQUNELFNBQVMsR0FBRztBQUNYLHdCQUFVLE1BQU0sSUFBSSxTQUFTLDZDQUE2Qyw4RUFBOEUsRUFBRSxPQUFPLENBQUM7QUFBQSxZQUNuSztBQUFBLFVBQ0QsV0FBVyxDQUFDLGlCQUFpQixLQUFLLEdBQUcsR0FBRztBQUN2QyxzQkFBVSxNQUFNLElBQUksU0FBUyx5Q0FBeUMseUlBQXlJLENBQUM7QUFBQSxVQUNqTjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUVEO0FBRUEsTUFBTSxtQ0FBbUMsV0FBcUQ7QUFBQSxFQUE5RjtBQUFBO0FBRUMsU0FBUyxPQUFPO0FBQUE7QUFBQSxFQUVoQixhQUFhLFVBQXVDO0FBQ25ELFdBQU8sQ0FBQyxDQUFDLFNBQVMsYUFBYTtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxPQUFPLFVBQXlEO0FBQy9ELFVBQU0sVUFBVSxTQUFTLGFBQWEsa0JBQWtCLENBQUM7QUFDekQsUUFBSSxDQUFDLFFBQVEsUUFBUTtBQUNwQixhQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFFLEdBQUcsU0FBUyxNQUFNO0FBQUEsTUFBRSxFQUFFO0FBQUEsSUFDOUQ7QUFFQSxVQUFNLFVBQVU7QUFBQSxNQUNmLElBQUksU0FBUyxhQUFhLFlBQVk7QUFBQSxNQUN0QyxJQUFJLFNBQVMsVUFBVSxRQUFRO0FBQUEsSUFDaEM7QUFFQSxVQUFNLE9BQXFCLFFBQVEsSUFBSSxPQUFLO0FBQzNDLGFBQU87QUFBQSxRQUNOLElBQUksZUFBZSxFQUFFLGVBQWUsS0FBSyxNQUFNLFFBQVEsRUFBRSxTQUFTLElBQUksRUFBRSxVQUFVLEtBQUssSUFBSSxJQUFJLEVBQUUsU0FBUyxJQUFJO0FBQUEsUUFDOUcsRUFBRTtBQUFBLE1BQ0g7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLEdBQStCLFdBQVcseUJBQXlCLEVBQUUseUJBQXlCO0FBQUEsRUFDdEcsSUFBSTtBQUFBLEVBQ0osT0FBTyxJQUFJLFNBQVMsa0JBQWtCLGlCQUFpQjtBQUFBLEVBQ3ZELFFBQVE7QUFBQSxJQUNQLFdBQVc7QUFBQSxFQUNaO0FBQUEsRUFDQSxVQUFVLElBQUksZUFBZSwwQkFBMEI7QUFDeEQsQ0FBQzsiLAogICJuYW1lcyI6IFsiZXh0ZW5zaW9uIl0KfQo=
