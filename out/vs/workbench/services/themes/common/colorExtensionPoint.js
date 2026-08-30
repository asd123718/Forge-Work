import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { Extensions as ColorRegistryExtensions } from "../../../../platform/theme/common/colorRegistry.js";
import { Color } from "../../../../base/common/color.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions } from "../../extensionManagement/common/extensionFeatures.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
const colorRegistry = Registry.as(ColorRegistryExtensions.ColorContribution);
const colorReferenceSchema = colorRegistry.getColorReferenceSchema();
const colorIdPattern = "^\\w+[.\\w+]*$";
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "colors",
  jsonSchema: {
    description: nls.localize("contributes.color", "Contributes extension defined themable colors"),
    type: "array",
    items: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: nls.localize("contributes.color.id", "The identifier of the themable color"),
          pattern: colorIdPattern,
          patternErrorMessage: nls.localize("contributes.color.id.format", "Identifiers must only contain letters, digits and dots and can not start with a dot")
        },
        description: {
          type: "string",
          description: nls.localize("contributes.color.description", "The description of the themable color")
        },
        defaults: {
          type: "object",
          properties: {
            light: {
              description: nls.localize("contributes.defaults.light", "The default color for light themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default."),
              type: "string",
              anyOf: [
                colorReferenceSchema,
                { type: "string", format: "color-hex" }
              ]
            },
            dark: {
              description: nls.localize("contributes.defaults.dark", "The default color for dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default."),
              type: "string",
              anyOf: [
                colorReferenceSchema,
                { type: "string", format: "color-hex" }
              ]
            },
            highContrast: {
              description: nls.localize("contributes.defaults.highContrast", "The default color for high contrast dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default. If not provided, the `dark` color is used as default for high contrast dark themes."),
              type: "string",
              anyOf: [
                colorReferenceSchema,
                { type: "string", format: "color-hex" }
              ]
            },
            highContrastLight: {
              description: nls.localize("contributes.defaults.highContrastLight", "The default color for high contrast light themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default. If not provided, the `light` color is used as default for high contrast light themes."),
              type: "string",
              anyOf: [
                colorReferenceSchema,
                { type: "string", format: "color-hex" }
              ]
            }
          },
          required: ["light", "dark"]
        }
      }
    }
  }
});
class ColorExtensionPoint {
  constructor() {
    configurationExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.colorConfiguration", "'configuration.colors' must be a array"));
          return;
        }
        const parseColorValue = (s, name) => {
          if (s.length > 0) {
            if (s[0] === "#") {
              return Color.Format.CSS.parseHex(s);
            } else {
              return s;
            }
          }
          collector.error(nls.localize("invalid.default.colorType", "{0} must be either a color value in hex (#RRGGBB[AA] or #RGB[A]) or the identifier of a themable color which provides the default.", name));
          return Color.red;
        };
        for (const colorContribution of extensionValue) {
          if (typeof colorContribution.id !== "string" || colorContribution.id.length === 0) {
            collector.error(nls.localize("invalid.id", "'configuration.colors.id' must be defined and can not be empty"));
            return;
          }
          if (!colorContribution.id.match(colorIdPattern)) {
            collector.error(nls.localize("invalid.id.format", "'configuration.colors.id' must only contain letters, digits and dots and can not start with a dot"));
            return;
          }
          if (typeof colorContribution.description !== "string" || colorContribution.id.length === 0) {
            collector.error(nls.localize("invalid.description", "'configuration.colors.description' must be defined and can not be empty"));
            return;
          }
          const defaults = colorContribution.defaults;
          if (!defaults || typeof defaults !== "object" || typeof defaults.light !== "string" || typeof defaults.dark !== "string") {
            collector.error(nls.localize("invalid.defaults", "'configuration.colors.defaults' must be defined and must contain 'light' and 'dark'"));
            return;
          }
          if (defaults.highContrast && typeof defaults.highContrast !== "string") {
            collector.error(nls.localize("invalid.defaults.highContrast", "If defined, 'configuration.colors.defaults.highContrast' must be a string."));
            return;
          }
          if (defaults.highContrastLight && typeof defaults.highContrastLight !== "string") {
            collector.error(nls.localize("invalid.defaults.highContrastLight", "If defined, 'configuration.colors.defaults.highContrastLight' must be a string."));
            return;
          }
          colorRegistry.registerColor(colorContribution.id, {
            light: parseColorValue(defaults.light, "configuration.colors.defaults.light"),
            dark: parseColorValue(defaults.dark, "configuration.colors.defaults.dark"),
            hcDark: parseColorValue(defaults.highContrast ?? defaults.dark, "configuration.colors.defaults.highContrast"),
            hcLight: parseColorValue(defaults.highContrastLight ?? defaults.light, "configuration.colors.defaults.highContrastLight")
          }, colorContribution.description);
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const colorContribution of extensionValue) {
          colorRegistry.deregisterColor(colorContribution.id);
        }
      }
    });
  }
}
class ColorDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.colors;
  }
  render(manifest) {
    const colors = manifest.contributes?.colors || [];
    if (!colors.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("id", "ID"),
      nls.localize("description", "Description"),
      nls.localize("defaultDark", "Dark Default"),
      nls.localize("defaultLight", "Light Default"),
      nls.localize("defaultHC", "High Contrast Default")
    ];
    const toColor = (colorReference) => colorReference[0] === "#" ? Color.fromHex(colorReference) : void 0;
    const rows = colors.sort((a, b) => a.id.localeCompare(b.id)).map((color) => {
      return [
        new MarkdownString().appendMarkdown(`\`${color.id}\``),
        color.description,
        toColor(color.defaults.dark) ?? new MarkdownString().appendMarkdown(`\`${color.defaults.dark}\``),
        toColor(color.defaults.light) ?? new MarkdownString().appendMarkdown(`\`${color.defaults.light}\``),
        toColor(color.defaults.highContrast) ?? new MarkdownString().appendMarkdown(`\`${color.defaults.highContrast}\``)
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
  id: "colors",
  label: nls.localize("colors", "Colors"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ColorDataRenderer)
});
export {
  ColorExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcY29sb3JFeHRlbnNpb25Qb2ludC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb2xvclJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbG9yUmVnaXN0cnlFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElSZW5kZXJlZERhdGEsIElSb3dEYXRhLCBJVGFibGVEYXRhIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuXG5pbnRlcmZhY2UgSUNvbG9yRXh0ZW5zaW9uUG9pbnQge1xuXHRpZDogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRkZWZhdWx0czogeyBsaWdodDogc3RyaW5nOyBkYXJrOiBzdHJpbmc7IGhpZ2hDb250cmFzdDogc3RyaW5nOyBoaWdoQ29udHJhc3RMaWdodD86IHN0cmluZyB9O1xufVxuXG5jb25zdCBjb2xvclJlZ2lzdHJ5OiBJQ29sb3JSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb2xvclJlZ2lzdHJ5PihDb2xvclJlZ2lzdHJ5RXh0ZW5zaW9ucy5Db2xvckNvbnRyaWJ1dGlvbik7XG5cbmNvbnN0IGNvbG9yUmVmZXJlbmNlU2NoZW1hID0gY29sb3JSZWdpc3RyeS5nZXRDb2xvclJlZmVyZW5jZVNjaGVtYSgpO1xuY29uc3QgY29sb3JJZFBhdHRlcm4gPSAnXlxcXFx3K1suXFxcXHcrXSokJztcblxuY29uc3QgY29uZmlndXJhdGlvbkV4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SUNvbG9yRXh0ZW5zaW9uUG9pbnRbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2NvbG9ycycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5jb2xvcicsICdDb250cmlidXRlcyBleHRlbnNpb24gZGVmaW5lZCB0aGVtYWJsZSBjb2xvcnMnKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5jb2xvci5pZCcsICdUaGUgaWRlbnRpZmllciBvZiB0aGUgdGhlbWFibGUgY29sb3InKSxcblx0XHRcdFx0XHRwYXR0ZXJuOiBjb2xvcklkUGF0dGVybixcblx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmNvbG9yLmlkLmZvcm1hdCcsICdJZGVudGlmaWVycyBtdXN0IG9ubHkgY29udGFpbiBsZXR0ZXJzLCBkaWdpdHMgYW5kIGRvdHMgYW5kIGNhbiBub3Qgc3RhcnQgd2l0aCBhIGRvdCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmNvbG9yLmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgdGhlbWFibGUgY29sb3InKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVmYXVsdHM6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRsaWdodDoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5kZWZhdWx0cy5saWdodCcsICdUaGUgZGVmYXVsdCBjb2xvciBmb3IgbGlnaHQgdGhlbWVzLiBFaXRoZXIgYSBjb2xvciB2YWx1ZSBpbiBoZXggKCNSUkdHQkJbQUFdKSBvciB0aGUgaWRlbnRpZmllciBvZiBhIHRoZW1hYmxlIGNvbG9yIHdoaWNoIHByb3ZpZGVzIHRoZSBkZWZhdWx0LicpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHRcdFx0XHRjb2xvclJlZmVyZW5jZVNjaGVtYSxcblx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnLCBmb3JtYXQ6ICdjb2xvci1oZXgnIH1cblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRhcms6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuZGVmYXVsdHMuZGFyaycsICdUaGUgZGVmYXVsdCBjb2xvciBmb3IgZGFyayB0aGVtZXMuIEVpdGhlciBhIGNvbG9yIHZhbHVlIGluIGhleCAoI1JSR0dCQltBQV0pIG9yIHRoZSBpZGVudGlmaWVyIG9mIGEgdGhlbWFibGUgY29sb3Igd2hpY2ggcHJvdmlkZXMgdGhlIGRlZmF1bHQuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHRcdGNvbG9yUmVmZXJlbmNlU2NoZW1hLFxuXHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIGZvcm1hdDogJ2NvbG9yLWhleCcgfVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0aGlnaENvbnRyYXN0OiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmRlZmF1bHRzLmhpZ2hDb250cmFzdCcsICdUaGUgZGVmYXVsdCBjb2xvciBmb3IgaGlnaCBjb250cmFzdCBkYXJrIHRoZW1lcy4gRWl0aGVyIGEgY29sb3IgdmFsdWUgaW4gaGV4ICgjUlJHR0JCW0FBXSkgb3IgdGhlIGlkZW50aWZpZXIgb2YgYSB0aGVtYWJsZSBjb2xvciB3aGljaCBwcm92aWRlcyB0aGUgZGVmYXVsdC4gSWYgbm90IHByb3ZpZGVkLCB0aGUgYGRhcmtgIGNvbG9yIGlzIHVzZWQgYXMgZGVmYXVsdCBmb3IgaGlnaCBjb250cmFzdCBkYXJrIHRoZW1lcy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0Y29sb3JSZWZlcmVuY2VTY2hlbWEsXG5cdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgZm9ybWF0OiAnY29sb3ItaGV4JyB9XG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRoaWdoQ29udHJhc3RMaWdodDoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5kZWZhdWx0cy5oaWdoQ29udHJhc3RMaWdodCcsICdUaGUgZGVmYXVsdCBjb2xvciBmb3IgaGlnaCBjb250cmFzdCBsaWdodCB0aGVtZXMuIEVpdGhlciBhIGNvbG9yIHZhbHVlIGluIGhleCAoI1JSR0dCQltBQV0pIG9yIHRoZSBpZGVudGlmaWVyIG9mIGEgdGhlbWFibGUgY29sb3Igd2hpY2ggcHJvdmlkZXMgdGhlIGRlZmF1bHQuIElmIG5vdCBwcm92aWRlZCwgdGhlIGBsaWdodGAgY29sb3IgaXMgdXNlZCBhcyBkZWZhdWx0IGZvciBoaWdoIGNvbnRyYXN0IGxpZ2h0IHRoZW1lcy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0Y29sb3JSZWZlcmVuY2VTY2hlbWEsXG5cdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgZm9ybWF0OiAnY29sb3ItaGV4JyB9XG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2xpZ2h0JywgJ2RhcmsnXVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIENvbG9yRXh0ZW5zaW9uUG9pbnQge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbmZpZ3VyYXRpb25FeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEuYWRkZWQpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVmFsdWUgPSA8SUNvbG9yRXh0ZW5zaW9uUG9pbnRbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGNvbnN0IGNvbGxlY3RvciA9IGV4dGVuc2lvbi5jb2xsZWN0b3I7XG5cblx0XHRcdFx0aWYgKCFleHRlbnNpb25WYWx1ZSB8fCAhQXJyYXkuaXNBcnJheShleHRlbnNpb25WYWx1ZSkpIHtcblx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmNvbG9yQ29uZmlndXJhdGlvbicsIFwiJ2NvbmZpZ3VyYXRpb24uY29sb3JzJyBtdXN0IGJlIGEgYXJyYXlcIikpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwYXJzZUNvbG9yVmFsdWUgPSAoczogc3RyaW5nLCBuYW1lOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRpZiAocy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRpZiAoc1swXSA9PT0gJyMnKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBDb2xvci5Gb3JtYXQuQ1NTLnBhcnNlSGV4KHMpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHM7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuZGVmYXVsdC5jb2xvclR5cGUnLCBcInswfSBtdXN0IGJlIGVpdGhlciBhIGNvbG9yIHZhbHVlIGluIGhleCAoI1JSR0dCQltBQV0gb3IgI1JHQltBXSkgb3IgdGhlIGlkZW50aWZpZXIgb2YgYSB0aGVtYWJsZSBjb2xvciB3aGljaCBwcm92aWRlcyB0aGUgZGVmYXVsdC5cIiwgbmFtZSkpO1xuXHRcdFx0XHRcdHJldHVybiBDb2xvci5yZWQ7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Zm9yIChjb25zdCBjb2xvckNvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb25WYWx1ZSkge1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgY29sb3JDb250cmlidXRpb24uaWQgIT09ICdzdHJpbmcnIHx8IGNvbG9yQ29udHJpYnV0aW9uLmlkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5pZCcsIFwiJ2NvbmZpZ3VyYXRpb24uY29sb3JzLmlkJyBtdXN0IGJlIGRlZmluZWQgYW5kIGNhbiBub3QgYmUgZW1wdHlcIikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIWNvbG9yQ29udHJpYnV0aW9uLmlkLm1hdGNoKGNvbG9ySWRQYXR0ZXJuKSkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5pZC5mb3JtYXQnLCBcIidjb25maWd1cmF0aW9uLmNvbG9ycy5pZCcgbXVzdCBvbmx5IGNvbnRhaW4gbGV0dGVycywgZGlnaXRzIGFuZCBkb3RzIGFuZCBjYW4gbm90IHN0YXJ0IHdpdGggYSBkb3RcIikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodHlwZW9mIGNvbG9yQ29udHJpYnV0aW9uLmRlc2NyaXB0aW9uICE9PSAnc3RyaW5nJyB8fCBjb2xvckNvbnRyaWJ1dGlvbi5pZC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuZGVzY3JpcHRpb24nLCBcIidjb25maWd1cmF0aW9uLmNvbG9ycy5kZXNjcmlwdGlvbicgbXVzdCBiZSBkZWZpbmVkIGFuZCBjYW4gbm90IGJlIGVtcHR5XCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZGVmYXVsdHMgPSBjb2xvckNvbnRyaWJ1dGlvbi5kZWZhdWx0cztcblx0XHRcdFx0XHRpZiAoIWRlZmF1bHRzIHx8IHR5cGVvZiBkZWZhdWx0cyAhPT0gJ29iamVjdCcgfHwgdHlwZW9mIGRlZmF1bHRzLmxpZ2h0ICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgZGVmYXVsdHMuZGFyayAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuZGVmYXVsdHMnLCBcIidjb25maWd1cmF0aW9uLmNvbG9ycy5kZWZhdWx0cycgbXVzdCBiZSBkZWZpbmVkIGFuZCBtdXN0IGNvbnRhaW4gJ2xpZ2h0JyBhbmQgJ2RhcmsnXCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRlZmF1bHRzLmhpZ2hDb250cmFzdCAmJiB0eXBlb2YgZGVmYXVsdHMuaGlnaENvbnRyYXN0ICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5kZWZhdWx0cy5oaWdoQ29udHJhc3QnLCBcIklmIGRlZmluZWQsICdjb25maWd1cmF0aW9uLmNvbG9ycy5kZWZhdWx0cy5oaWdoQ29udHJhc3QnIG11c3QgYmUgYSBzdHJpbmcuXCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRlZmF1bHRzLmhpZ2hDb250cmFzdExpZ2h0ICYmIHR5cGVvZiBkZWZhdWx0cy5oaWdoQ29udHJhc3RMaWdodCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuZGVmYXVsdHMuaGlnaENvbnRyYXN0TGlnaHQnLCBcIklmIGRlZmluZWQsICdjb25maWd1cmF0aW9uLmNvbG9ycy5kZWZhdWx0cy5oaWdoQ29udHJhc3RMaWdodCcgbXVzdCBiZSBhIHN0cmluZy5cIikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbG9yUmVnaXN0cnkucmVnaXN0ZXJDb2xvcihjb2xvckNvbnRyaWJ1dGlvbi5pZCwge1xuXHRcdFx0XHRcdFx0bGlnaHQ6IHBhcnNlQ29sb3JWYWx1ZShkZWZhdWx0cy5saWdodCwgJ2NvbmZpZ3VyYXRpb24uY29sb3JzLmRlZmF1bHRzLmxpZ2h0JyksXG5cdFx0XHRcdFx0XHRkYXJrOiBwYXJzZUNvbG9yVmFsdWUoZGVmYXVsdHMuZGFyaywgJ2NvbmZpZ3VyYXRpb24uY29sb3JzLmRlZmF1bHRzLmRhcmsnKSxcblx0XHRcdFx0XHRcdGhjRGFyazogcGFyc2VDb2xvclZhbHVlKGRlZmF1bHRzLmhpZ2hDb250cmFzdCA/PyBkZWZhdWx0cy5kYXJrLCAnY29uZmlndXJhdGlvbi5jb2xvcnMuZGVmYXVsdHMuaGlnaENvbnRyYXN0JyksXG5cdFx0XHRcdFx0XHRoY0xpZ2h0OiBwYXJzZUNvbG9yVmFsdWUoZGVmYXVsdHMuaGlnaENvbnRyYXN0TGlnaHQgPz8gZGVmYXVsdHMubGlnaHQsICdjb25maWd1cmF0aW9uLmNvbG9ycy5kZWZhdWx0cy5oaWdoQ29udHJhc3RMaWdodCcpLFxuXHRcdFx0XHRcdH0sIGNvbG9yQ29udHJpYnV0aW9uLmRlc2NyaXB0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEucmVtb3ZlZCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25WYWx1ZSA9IDxJQ29sb3JFeHRlbnNpb25Qb2ludFtdPmV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb2xvckNvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb25WYWx1ZSkge1xuXHRcdFx0XHRcdGNvbG9yUmVnaXN0cnkuZGVyZWdpc3RlckNvbG9yKGNvbG9yQ29udHJpYnV0aW9uLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIENvbG9yRGF0YVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8uY29sb3JzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBjb2xvcnMgPSBtYW5pZmVzdC5jb250cmlidXRlcz8uY29sb3JzIHx8IFtdO1xuXHRcdGlmICghY29sb3JzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdG5scy5sb2NhbGl6ZSgnaWQnLCBcIklEXCIpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdkZXNjcmlwdGlvbicsIFwiRGVzY3JpcHRpb25cIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ2RlZmF1bHREYXJrJywgXCJEYXJrIERlZmF1bHRcIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ2RlZmF1bHRMaWdodCcsIFwiTGlnaHQgRGVmYXVsdFwiKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnZGVmYXVsdEhDJywgXCJIaWdoIENvbnRyYXN0IERlZmF1bHRcIiksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHRvQ29sb3IgPSAoY29sb3JSZWZlcmVuY2U6IHN0cmluZyk6IENvbG9yIHwgdW5kZWZpbmVkID0+IGNvbG9yUmVmZXJlbmNlWzBdID09PSAnIycgPyBDb2xvci5mcm9tSGV4KGNvbG9yUmVmZXJlbmNlKSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHJvd3M6IElSb3dEYXRhW11bXSA9IGNvbG9ycy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpXG5cdFx0XHQubWFwKGNvbG9yID0+IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgXFxgJHtjb2xvci5pZH1cXGBgKSxcblx0XHRcdFx0XHRjb2xvci5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHR0b0NvbG9yKGNvbG9yLmRlZmF1bHRzLmRhcmspID8/IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGBcXGAke2NvbG9yLmRlZmF1bHRzLmRhcmt9XFxgYCksXG5cdFx0XHRcdFx0dG9Db2xvcihjb2xvci5kZWZhdWx0cy5saWdodCkgPz8gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oYFxcYCR7Y29sb3IuZGVmYXVsdHMubGlnaHR9XFxgYCksXG5cdFx0XHRcdFx0dG9Db2xvcihjb2xvci5kZWZhdWx0cy5oaWdoQ29udHJhc3QpID8/IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGBcXGAke2NvbG9yLmRlZmF1bHRzLmhpZ2hDb250cmFzdH1cXGBgKSxcblx0XHRcdFx0XTtcblx0XHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdjb2xvcnMnLFxuXHRsYWJlbDogbmxzLmxvY2FsaXplKCdjb2xvcnMnLCBcIkNvbG9yc1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKENvbG9yRGF0YVJlbmRlcmVyKSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXlCLGNBQWMsK0JBQStCO0FBQ3RFLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFtSDtBQUM1SCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHNCQUFzQjtBQVEvQixNQUFNLGdCQUFnQyxTQUFTLEdBQW1CLHdCQUF3QixpQkFBaUI7QUFFM0csTUFBTSx1QkFBdUIsY0FBYyx3QkFBd0I7QUFDbkUsTUFBTSxpQkFBaUI7QUFFdkIsTUFBTSx3QkFBd0IsbUJBQW1CLHVCQUErQztBQUFBLEVBQy9GLGdCQUFnQjtBQUFBLEVBQ2hCLFlBQVk7QUFBQSxJQUNYLGFBQWEsSUFBSSxTQUFTLHFCQUFxQiwrQ0FBK0M7QUFBQSxJQUM5RixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixZQUFZO0FBQUEsUUFDWCxJQUFJO0FBQUEsVUFDSCxN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
