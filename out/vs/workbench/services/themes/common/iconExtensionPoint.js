import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { Extensions as IconRegistryExtensions } from "../../../../platform/theme/common/iconRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import * as resources from "../../../../base/common/resources.js";
import { extname, posix } from "../../../../base/common/path.js";
const iconRegistry = Registry.as(IconRegistryExtensions.IconContribution);
const iconReferenceSchema = iconRegistry.getIconReferenceSchema();
const iconIdPattern = `^${ThemeIcon.iconNameSegment}(-${ThemeIcon.iconNameSegment})+$`;
const iconConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "icons",
  jsonSchema: {
    description: nls.localize("contributes.icons", "Contributes extension defined themable icons"),
    type: "object",
    propertyNames: {
      pattern: iconIdPattern,
      description: nls.localize("contributes.icon.id", "The identifier of the themable icon"),
      patternErrorMessage: nls.localize("contributes.icon.id.format", "Identifiers can only contain letters, digits and minuses and need to consist of at least two segments in the form `component-iconname`.")
    },
    additionalProperties: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: nls.localize("contributes.icon.description", "The description of the themable icon")
        },
        default: {
          anyOf: [
            iconReferenceSchema,
            {
              type: "object",
              properties: {
                fontPath: {
                  description: nls.localize("contributes.icon.default.fontPath", "The path of the icon font that defines the icon."),
                  type: "string"
                },
                fontCharacter: {
                  description: nls.localize("contributes.icon.default.fontCharacter", "The character for the icon in the icon font."),
                  type: "string"
                }
              },
              required: ["fontPath", "fontCharacter"],
              defaultSnippets: [{ body: { fontPath: "${1:myiconfont.woff}", fontCharacter: "${2:\\\\E001}" } }]
            }
          ],
          description: nls.localize("contributes.icon.default", "The default of the icon. Either a reference to an existing ThemeIcon or an icon in an icon font.")
        }
      },
      required: ["description", "default"],
      defaultSnippets: [{ body: { description: "${1:my icon}", default: { fontPath: "${2:myiconfont.woff}", fontCharacter: "${3:\\\\E001}" } } }]
    },
    defaultSnippets: [{ body: { "${1:my-icon-id}": { description: "${2:my icon}", default: { fontPath: "${3:myiconfont.woff}", fontCharacter: "${4:\\\\E001}" } } } }]
  }
});
class IconExtensionPoint {
  constructor() {
    iconConfigurationExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || typeof extensionValue !== "object") {
          collector.error(nls.localize("invalid.icons.configuration", "'configuration.icons' must be an object with the icon names as properties."));
          return;
        }
        for (const id in extensionValue) {
          if (!id.match(iconIdPattern)) {
            collector.error(nls.localize("invalid.icons.id.format", "'configuration.icons' keys represent the icon id and can only contain letter, digits and minuses. They need to consist of at least two segments in the form `component-iconname`."));
            return;
          }
          const iconContribution = extensionValue[id];
          if (typeof iconContribution.description !== "string" || iconContribution.description.length === 0) {
            collector.error(nls.localize("invalid.icons.description", "'configuration.icons.description' must be defined and can not be empty"));
            return;
          }
          const defaultIcon = iconContribution.default;
          if (typeof defaultIcon === "string") {
            iconRegistry.registerIcon(id, { id: defaultIcon }, iconContribution.description);
          } else if (typeof defaultIcon === "object" && typeof defaultIcon.fontPath === "string" && typeof defaultIcon.fontCharacter === "string") {
            const fileExt = extname(defaultIcon.fontPath).substring(1);
            const format = formatMap[fileExt];
            if (!format) {
              collector.warn(nls.localize("invalid.icons.default.fontPath.extension", "Expected `contributes.icons.default.fontPath` to have file extension 'woff', woff2' or 'ttf', is '{0}'.", fileExt));
              return;
            }
            const extensionLocation = extension.description.extensionLocation;
            const iconFontLocation = resources.joinPath(extensionLocation, defaultIcon.fontPath);
            const fontId = getFontId(extension.description, defaultIcon.fontPath);
            const definition = iconRegistry.registerIconFont(fontId, { src: [{ location: iconFontLocation, format }] });
            if (!resources.isEqualOrParent(iconFontLocation, extensionLocation)) {
              collector.warn(nls.localize("invalid.icons.default.fontPath.path", "Expected `contributes.icons.default.fontPath` ({0}) to be included inside extension's folder ({0}).", iconFontLocation.path, extensionLocation.path));
              return;
            }
            iconRegistry.registerIcon(id, {
              fontCharacter: defaultIcon.fontCharacter,
              font: {
                id: fontId,
                definition
              }
            }, iconContribution.description);
          } else {
            collector.error(nls.localize("invalid.icons.default", "'configuration.icons.default' must be either a reference to the id of an other theme icon (string) or a icon definition (object) with properties `fontPath` and `fontCharacter`."));
          }
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const id in extensionValue) {
          iconRegistry.deregisterIcon(id);
        }
      }
    });
  }
}
const formatMap = {
  "ttf": "truetype",
  "woff": "woff",
  "woff2": "woff2"
};
function getFontId(description, fontPath) {
  return posix.join(description.identifier.value, fontPath);
}
export {
  IconExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcaWNvbkV4dGVuc2lvblBvaW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUljb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBJY29uUmVnaXN0cnlFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIHBvc2l4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5cbmludGVyZmFjZSBJSWNvbkV4dGVuc2lvblBvaW50IHtcblx0W2lkOiBzdHJpbmddOiB7XG5cdFx0ZGVzY3JpcHRpb246IHN0cmluZztcblx0XHRkZWZhdWx0OiB7IGZvbnRQYXRoOiBzdHJpbmc7IGZvbnRDaGFyYWN0ZXI6IHN0cmluZyB9IHwgc3RyaW5nO1xuXHR9O1xufVxuXG5jb25zdCBpY29uUmVnaXN0cnk6IElJY29uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSWNvblJlZ2lzdHJ5PihJY29uUmVnaXN0cnlFeHRlbnNpb25zLkljb25Db250cmlidXRpb24pO1xuXG5jb25zdCBpY29uUmVmZXJlbmNlU2NoZW1hID0gaWNvblJlZ2lzdHJ5LmdldEljb25SZWZlcmVuY2VTY2hlbWEoKTtcbmNvbnN0IGljb25JZFBhdHRlcm4gPSBgXiR7VGhlbWVJY29uLmljb25OYW1lU2VnbWVudH0oLSR7VGhlbWVJY29uLmljb25OYW1lU2VnbWVudH0pKyRgO1xuXG5jb25zdCBpY29uQ29uZmlndXJhdGlvbkV4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SUljb25FeHRlbnNpb25Qb2ludD4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2ljb25zJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmljb25zJywgJ0NvbnRyaWJ1dGVzIGV4dGVuc2lvbiBkZWZpbmVkIHRoZW1hYmxlIGljb25zJyksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydHlOYW1lczoge1xuXHRcdFx0cGF0dGVybjogaWNvbklkUGF0dGVybixcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmljb24uaWQnLCAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIHRoZW1hYmxlIGljb24nKSxcblx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuaWNvbi5pZC5mb3JtYXQnLCAnSWRlbnRpZmllcnMgY2FuIG9ubHkgY29udGFpbiBsZXR0ZXJzLCBkaWdpdHMgYW5kIG1pbnVzZXMgYW5kIG5lZWQgdG8gY29uc2lzdCBvZiBhdCBsZWFzdCB0d28gc2VnbWVudHMgaW4gdGhlIGZvcm0gYGNvbXBvbmVudC1pY29ubmFtZWAuJyksXG5cdFx0fSxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuaWNvbi5kZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIHRoZW1hYmxlIGljb24nKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRpY29uUmVmZXJlbmNlU2NoZW1hLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdGZvbnRQYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5pY29uLmRlZmF1bHQuZm9udFBhdGgnLCAnVGhlIHBhdGggb2YgdGhlIGljb24gZm9udCB0aGF0IGRlZmluZXMgdGhlIGljb24uJyksXG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0Zm9udENoYXJhY3Rlcjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuaWNvbi5kZWZhdWx0LmZvbnRDaGFyYWN0ZXInLCAnVGhlIGNoYXJhY3RlciBmb3IgdGhlIGljb24gaW4gdGhlIGljb24gZm9udC4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydmb250UGF0aCcsICdmb250Q2hhcmFjdGVyJ10sXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBmb250UGF0aDogJyR7MTpteWljb25mb250LndvZmZ9JywgZm9udENoYXJhY3RlcjogJyR7MjpcXFxcXFxcXEUwMDF9JyB9IH1dXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5pY29uLmRlZmF1bHQnLCAnVGhlIGRlZmF1bHQgb2YgdGhlIGljb24uIEVpdGhlciBhIHJlZmVyZW5jZSB0byBhbiBleGlzdGluZyBUaGVtZUljb24gb3IgYW4gaWNvbiBpbiBhbiBpY29uIGZvbnQuJyksXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRyZXF1aXJlZDogWydkZXNjcmlwdGlvbicsICdkZWZhdWx0J10sXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgZGVzY3JpcHRpb246ICckezE6bXkgaWNvbn0nLCBkZWZhdWx0OiB7IGZvbnRQYXRoOiAnJHsyOm15aWNvbmZvbnQud29mZn0nLCBmb250Q2hhcmFjdGVyOiAnJHszOlxcXFxcXFxcRTAwMX0nIH0gfSB9XVxuXHRcdH0sXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7ICckezE6bXktaWNvbi1pZH0nOiB7IGRlc2NyaXB0aW9uOiAnJHsyOm15IGljb259JywgZGVmYXVsdDogeyBmb250UGF0aDogJyR7MzpteWljb25mb250LndvZmZ9JywgZm9udENoYXJhY3RlcjogJyR7NDpcXFxcXFxcXEUwMDF9JyB9IH0gfSB9XVxuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIEljb25FeHRlbnNpb25Qb2ludCB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0aWNvbkNvbmZpZ3VyYXRpb25FeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEuYWRkZWQpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVmFsdWUgPSA8SUljb25FeHRlbnNpb25Qb2ludD5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGNvbnN0IGNvbGxlY3RvciA9IGV4dGVuc2lvbi5jb2xsZWN0b3I7XG5cblx0XHRcdFx0aWYgKCFleHRlbnNpb25WYWx1ZSB8fCB0eXBlb2YgZXh0ZW5zaW9uVmFsdWUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5pY29ucy5jb25maWd1cmF0aW9uJywgXCInY29uZmlndXJhdGlvbi5pY29ucycgbXVzdCBiZSBhbiBvYmplY3Qgd2l0aCB0aGUgaWNvbiBuYW1lcyBhcyBwcm9wZXJ0aWVzLlwiKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBpZCBpbiBleHRlbnNpb25WYWx1ZSkge1xuXHRcdFx0XHRcdGlmICghaWQubWF0Y2goaWNvbklkUGF0dGVybikpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuaWNvbnMuaWQuZm9ybWF0JywgXCInY29uZmlndXJhdGlvbi5pY29ucycga2V5cyByZXByZXNlbnQgdGhlIGljb24gaWQgYW5kIGNhbiBvbmx5IGNvbnRhaW4gbGV0dGVyLCBkaWdpdHMgYW5kIG1pbnVzZXMuIFRoZXkgbmVlZCB0byBjb25zaXN0IG9mIGF0IGxlYXN0IHR3byBzZWdtZW50cyBpbiB0aGUgZm9ybSBgY29tcG9uZW50LWljb25uYW1lYC5cIikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBpY29uQ29udHJpYnV0aW9uID0gZXh0ZW5zaW9uVmFsdWVbaWRdO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgaWNvbkNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbiAhPT0gJ3N0cmluZycgfHwgaWNvbkNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbi5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuaWNvbnMuZGVzY3JpcHRpb24nLCBcIidjb25maWd1cmF0aW9uLmljb25zLmRlc2NyaXB0aW9uJyBtdXN0IGJlIGRlZmluZWQgYW5kIGNhbiBub3QgYmUgZW1wdHlcIikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBkZWZhdWx0SWNvbiA9IGljb25Db250cmlidXRpb24uZGVmYXVsdDtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGRlZmF1bHRJY29uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0aWNvblJlZ2lzdHJ5LnJlZ2lzdGVySWNvbihpZCwgeyBpZDogZGVmYXVsdEljb24gfSwgaWNvbkNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbik7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgZGVmYXVsdEljb24gPT09ICdvYmplY3QnICYmIHR5cGVvZiBkZWZhdWx0SWNvbi5mb250UGF0aCA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGRlZmF1bHRJY29uLmZvbnRDaGFyYWN0ZXIgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBmaWxlRXh0ID0gZXh0bmFtZShkZWZhdWx0SWNvbi5mb250UGF0aCkuc3Vic3RyaW5nKDEpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZm9ybWF0ID0gZm9ybWF0TWFwW2ZpbGVFeHRdO1xuXHRcdFx0XHRcdFx0aWYgKCFmb3JtYXQpIHtcblx0XHRcdFx0XHRcdFx0Y29sbGVjdG9yLndhcm4obmxzLmxvY2FsaXplKCdpbnZhbGlkLmljb25zLmRlZmF1bHQuZm9udFBhdGguZXh0ZW5zaW9uJywgXCJFeHBlY3RlZCBgY29udHJpYnV0ZXMuaWNvbnMuZGVmYXVsdC5mb250UGF0aGAgdG8gaGF2ZSBmaWxlIGV4dGVuc2lvbiAnd29mZicsIHdvZmYyJyBvciAndHRmJywgaXMgJ3swfScuXCIsIGZpbGVFeHQpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb24gPSBleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb247XG5cdFx0XHRcdFx0XHRjb25zdCBpY29uRm9udExvY2F0aW9uID0gcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCBkZWZhdWx0SWNvbi5mb250UGF0aCk7XG5cdFx0XHRcdFx0XHRjb25zdCBmb250SWQgPSBnZXRGb250SWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCBkZWZhdWx0SWNvbi5mb250UGF0aCk7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWZpbml0aW9uID0gaWNvblJlZ2lzdHJ5LnJlZ2lzdGVySWNvbkZvbnQoZm9udElkLCB7IHNyYzogW3sgbG9jYXRpb246IGljb25Gb250TG9jYXRpb24sIGZvcm1hdCB9XSB9KTtcblx0XHRcdFx0XHRcdGlmICghcmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudChpY29uRm9udExvY2F0aW9uLCBleHRlbnNpb25Mb2NhdGlvbikpIHtcblx0XHRcdFx0XHRcdFx0Y29sbGVjdG9yLndhcm4obmxzLmxvY2FsaXplKCdpbnZhbGlkLmljb25zLmRlZmF1bHQuZm9udFBhdGgucGF0aCcsIFwiRXhwZWN0ZWQgYGNvbnRyaWJ1dGVzLmljb25zLmRlZmF1bHQuZm9udFBhdGhgICh7MH0pIHRvIGJlIGluY2x1ZGVkIGluc2lkZSBleHRlbnNpb24ncyBmb2xkZXIgKHswfSkuXCIsIGljb25Gb250TG9jYXRpb24ucGF0aCwgZXh0ZW5zaW9uTG9jYXRpb24ucGF0aCkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpY29uUmVnaXN0cnkucmVnaXN0ZXJJY29uKGlkLCB7XG5cdFx0XHRcdFx0XHRcdGZvbnRDaGFyYWN0ZXI6IGRlZmF1bHRJY29uLmZvbnRDaGFyYWN0ZXIsXG5cdFx0XHRcdFx0XHRcdGZvbnQ6IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogZm9udElkLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmluaXRpb25cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSwgaWNvbkNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuaWNvbnMuZGVmYXVsdCcsIFwiJ2NvbmZpZ3VyYXRpb24uaWNvbnMuZGVmYXVsdCcgbXVzdCBiZSBlaXRoZXIgYSByZWZlcmVuY2UgdG8gdGhlIGlkIG9mIGFuIG90aGVyIHRoZW1lIGljb24gKHN0cmluZykgb3IgYSBpY29uIGRlZmluaXRpb24gKG9iamVjdCkgd2l0aCBwcm9wZXJ0aWVzIGBmb250UGF0aGAgYW5kIGBmb250Q2hhcmFjdGVyYC5cIikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEucmVtb3ZlZCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25WYWx1ZSA9IDxJSWNvbkV4dGVuc2lvblBvaW50PmV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBpbiBleHRlbnNpb25WYWx1ZSkge1xuXHRcdFx0XHRcdGljb25SZWdpc3RyeS5kZXJlZ2lzdGVySWNvbihpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5jb25zdCBmb3JtYXRNYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdCd0dGYnOiAndHJ1ZXR5cGUnLFxuXHQnd29mZic6ICd3b2ZmJyxcblx0J3dvZmYyJzogJ3dvZmYyJ1xufTtcblxuZnVuY3Rpb24gZ2V0Rm9udElkKGRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGZvbnRQYXRoOiBzdHJpbmcpIHtcblx0cmV0dXJuIHBvc2l4LmpvaW4oZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgZm9udFBhdGgpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXdCLGNBQWMsOEJBQThCO0FBQ3BFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFlBQVksZUFBZTtBQUUzQixTQUFTLFNBQVMsYUFBYTtBQVMvQixNQUFNLGVBQThCLFNBQVMsR0FBa0IsdUJBQXVCLGdCQUFnQjtBQUV0RyxNQUFNLHNCQUFzQixhQUFhLHVCQUF1QjtBQUNoRSxNQUFNLGdCQUFnQixJQUFJLFVBQVUsZUFBZSxLQUFLLFVBQVUsZUFBZTtBQUVqRixNQUFNLDRCQUE0QixtQkFBbUIsdUJBQTRDO0FBQUEsRUFDaEcsZ0JBQWdCO0FBQUEsRUFDaEIsWUFBWTtBQUFBLElBQ1gsYUFBYSxJQUFJLFNBQVMscUJBQXFCLDhDQUE4QztBQUFBLElBQzdGLE1BQU07QUFBQSxJQUNOLGVBQWU7QUFBQSxNQUNkLFNBQVM7QUFBQSxNQUNULGFBQWEsSUFBSSxTQUFTLHVCQUF1Qixx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
