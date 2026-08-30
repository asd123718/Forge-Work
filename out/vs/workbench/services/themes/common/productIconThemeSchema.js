import * as nls from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { fontIdErrorMessage, fontIdRegex, fontStyleRegex, fontWeightRegex, iconsSchemaId } from "../../../../platform/theme/common/iconRegistry.js";
const schemaId = "vscode://schemas/product-icon-theme";
const schema = {
  type: "object",
  allowComments: true,
  allowTrailingCommas: true,
  properties: {
    fonts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: nls.localize("schema.id", "The ID of the font."),
            pattern: fontIdRegex.source,
            patternErrorMessage: fontIdErrorMessage
          },
          src: {
            type: "array",
            description: nls.localize("schema.src", "The location of the font."),
            items: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: nls.localize("schema.font-path", "The font path, relative to the current product icon theme file.")
                },
                format: {
                  type: "string",
                  description: nls.localize("schema.font-format", "The format of the font."),
                  enum: ["woff", "woff2", "truetype", "opentype", "embedded-opentype", "svg"]
                }
              },
              required: [
                "path",
                "format"
              ]
            }
          },
          weight: {
            type: "string",
            description: nls.localize("schema.font-weight", "The weight of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight for valid values."),
            anyOf: [
              { enum: ["normal", "bold", "lighter", "bolder"] },
              { type: "string", pattern: fontWeightRegex.source }
            ]
          },
          style: {
            type: "string",
            description: nls.localize("schema.font-style", "The style of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-style for valid values."),
            anyOf: [
              { enum: ["normal", "italic", "oblique"] },
              { type: "string", pattern: fontStyleRegex.source }
            ]
          }
        },
        required: [
          "id",
          "src"
        ]
      }
    },
    iconDefinitions: {
      description: nls.localize("schema.iconDefinitions", "Association of icon name to a font character."),
      $ref: iconsSchemaId
    }
  }
};
function registerProductIconThemeSchemas() {
  const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
  schemaRegistry.registerSchema(schemaId, schema);
}
export {
  registerProductIconThemeSchemas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxccHJvZHVjdEljb25UaGVtZVNjaGVtYS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IGZvbnRJZEVycm9yTWVzc2FnZSwgZm9udElkUmVnZXgsIGZvbnRTdHlsZVJlZ2V4LCBmb250V2VpZ2h0UmVnZXgsIGljb25zU2NoZW1hSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcblxuY29uc3Qgc2NoZW1hSWQgPSAndnNjb2RlOi8vc2NoZW1hcy9wcm9kdWN0LWljb24tdGhlbWUnO1xuY29uc3Qgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGFsbG93Q29tbWVudHM6IHRydWUsXG5cdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRmb250czoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmlkJywgJ1RoZSBJRCBvZiB0aGUgZm9udC4nKSxcblx0XHRcdFx0XHRcdHBhdHRlcm46IGZvbnRJZFJlZ2V4LnNvdXJjZSxcblx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IGZvbnRJZEVycm9yTWVzc2FnZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c3JjOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnNyYycsICdUaGUgbG9jYXRpb24gb2YgdGhlIGZvbnQuJyksXG5cdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnQtcGF0aCcsICdUaGUgZm9udCBwYXRoLCByZWxhdGl2ZSB0byB0aGUgY3VycmVudCBwcm9kdWN0IGljb24gdGhlbWUgZmlsZS4nKSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGZvcm1hdDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udC1mb3JtYXQnLCAnVGhlIGZvcm1hdCBvZiB0aGUgZm9udC4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdGVudW06IFsnd29mZicsICd3b2ZmMicsICd0cnVldHlwZScsICdvcGVudHlwZScsICdlbWJlZGRlZC1vcGVudHlwZScsICdzdmcnXVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFtcblx0XHRcdFx0XHRcdFx0XHQncGF0aCcsXG5cdFx0XHRcdFx0XHRcdFx0J2Zvcm1hdCdcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2VpZ2h0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb250LXdlaWdodCcsICdUaGUgd2VpZ2h0IG9mIHRoZSBmb250LiBTZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQ1NTL2ZvbnQtd2VpZ2h0IGZvciB2YWxpZCB2YWx1ZXMuJyksXG5cdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHR7IGVudW06IFsnbm9ybWFsJywgJ2JvbGQnLCAnbGlnaHRlcicsICdib2xkZXInXSB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnLCBwYXR0ZXJuOiBmb250V2VpZ2h0UmVnZXguc291cmNlIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb250LXN0eWxlJywgJ1RoZSBzdHlsZSBvZiB0aGUgZm9udC4gU2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0NTUy9mb250LXN0eWxlIGZvciB2YWxpZCB2YWx1ZXMuJyksXG5cdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHR7IGVudW06IFsnbm9ybWFsJywgJ2l0YWxpYycsICdvYmxpcXVlJ10gfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgcGF0dGVybjogZm9udFN0eWxlUmVnZXguc291cmNlIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbXG5cdFx0XHRcdFx0J2lkJyxcblx0XHRcdFx0XHQnc3JjJ1xuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRpY29uRGVmaW5pdGlvbnM6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pY29uRGVmaW5pdGlvbnMnLCAnQXNzb2NpYXRpb24gb2YgaWNvbiBuYW1lIHRvIGEgZm9udCBjaGFyYWN0ZXIuJyksXG5cdFx0XHQkcmVmOiBpY29uc1NjaGVtYUlkXG5cdFx0fVxuXHR9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJQcm9kdWN0SWNvblRoZW1lU2NoZW1hcygpIHtcblx0Y29uc3Qgc2NoZW1hUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblx0c2NoZW1hUmVnaXN0cnku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
