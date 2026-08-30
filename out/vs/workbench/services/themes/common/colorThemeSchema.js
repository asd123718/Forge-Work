import * as nls from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { workbenchColorsSchemaId } from "../../../../platform/theme/common/colorRegistry.js";
import { tokenStylingSchemaId } from "../../../../platform/theme/common/tokenClassificationRegistry.js";
const textMateScopes = [
  "comment",
  "comment.block",
  "comment.block.documentation",
  "comment.line",
  "constant",
  "constant.character",
  "constant.character.escape",
  "constant.numeric",
  "constant.numeric.integer",
  "constant.numeric.float",
  "constant.numeric.hex",
  "constant.numeric.octal",
  "constant.other",
  "constant.regexp",
  "constant.rgb-value",
  "emphasis",
  "entity",
  "entity.name",
  "entity.name.class",
  "entity.name.function",
  "entity.name.method",
  "entity.name.section",
  "entity.name.selector",
  "entity.name.tag",
  "entity.name.type",
  "entity.other",
  "entity.other.attribute-name",
  "entity.other.inherited-class",
  "invalid",
  "invalid.deprecated",
  "invalid.illegal",
  "keyword",
  "keyword.control",
  "keyword.operator",
  "keyword.operator.new",
  "keyword.operator.assignment",
  "keyword.operator.arithmetic",
  "keyword.operator.logical",
  "keyword.other",
  "markup",
  "markup.bold",
  "markup.changed",
  "markup.deleted",
  "markup.heading",
  "markup.inline.raw",
  "markup.inserted",
  "markup.italic",
  "markup.list",
  "markup.list.numbered",
  "markup.list.unnumbered",
  "markup.other",
  "markup.quote",
  "markup.raw",
  "markup.underline",
  "markup.underline.link",
  "meta",
  "meta.block",
  "meta.cast",
  "meta.class",
  "meta.function",
  "meta.function-call",
  "meta.preprocessor",
  "meta.return-type",
  "meta.selector",
  "meta.tag",
  "meta.type.annotation",
  "meta.type",
  "punctuation.definition.string.begin",
  "punctuation.definition.string.end",
  "punctuation.separator",
  "punctuation.separator.continuation",
  "punctuation.terminator",
  "storage",
  "storage.modifier",
  "storage.type",
  "string",
  "string.interpolated",
  "string.other",
  "string.quoted",
  "string.quoted.double",
  "string.quoted.other",
  "string.quoted.single",
  "string.quoted.triple",
  "string.regexp",
  "string.unquoted",
  "strong",
  "support",
  "support.class",
  "support.constant",
  "support.function",
  "support.other",
  "support.type",
  "support.type.property-name",
  "support.variable",
  "variable",
  "variable.language",
  "variable.name",
  "variable.other",
  "variable.other.readwrite",
  "variable.parameter"
];
const textmateColorsSchemaId = "vscode://schemas/textmate-colors";
const textmateColorGroupSchemaId = `${textmateColorsSchemaId}#/definitions/colorGroup`;
const textmateColorSchema = {
  type: "array",
  definitions: {
    colorGroup: {
      default: "#FF0000",
      anyOf: [
        {
          type: "string",
          format: "color-hex"
        },
        {
          $ref: "#/definitions/settings"
        }
      ]
    },
    settings: {
      type: "object",
      description: nls.localize("schema.token.settings", "Colors and styles for the token."),
      properties: {
        foreground: {
          type: "string",
          description: nls.localize("schema.token.foreground", "Foreground color for the token."),
          format: "color-hex",
          default: "#ff0000"
        },
        background: {
          type: "string",
          deprecationMessage: nls.localize("schema.token.background.warning", "Token background colors are currently not supported.")
        },
        fontStyle: {
          type: "string",
          description: nls.localize("schema.token.fontStyle", "Font style of the rule: 'italic', 'bold', 'underline', 'strikethrough' or a combination. The empty string unsets inherited settings."),
          pattern: "^(\\s*\\b(italic|bold|underline|strikethrough))*\\s*$",
          patternErrorMessage: nls.localize("schema.fontStyle.error", "Font style must be 'italic', 'bold', 'underline', 'strikethrough' or a combination or the empty string."),
          defaultSnippets: [
            { label: nls.localize("schema.token.fontStyle.none", "None (clear inherited style)"), bodyText: '""' },
            { body: "italic" },
            { body: "bold" },
            { body: "underline" },
            { body: "strikethrough" },
            { body: "italic bold" },
            { body: "italic underline" },
            { body: "italic strikethrough" },
            { body: "bold underline" },
            { body: "bold strikethrough" },
            { body: "underline strikethrough" },
            { body: "italic bold underline" },
            { body: "italic bold strikethrough" },
            { body: "italic underline strikethrough" },
            { body: "bold underline strikethrough" },
            { body: "italic bold underline strikethrough" }
          ]
        },
        fontFamily: {
          type: "string",
          description: nls.localize("schema.token.fontFamily", 'Font family for the token (e.g., "Fira Code", "JetBrains Mono").')
        },
        fontSize: {
          type: "number",
          description: nls.localize("schema.token.fontSize", "Font size multiplier for the token (e.g., 1.2 will use 1.2 times the default font size).")
        },
        lineHeight: {
          type: "number",
          description: nls.localize("schema.token.lineHeight", "Line height multiplier for the token (e.g., 1.2 will use 1.2 times the default height). If the font size is set and the line height is not explicitly set, the line height will be computed based on the font size.")
        }
      },
      additionalProperties: false,
      defaultSnippets: [{ body: { foreground: "${1:#FF0000}", fontStyle: "${2:bold}" } }]
    }
  },
  items: {
    type: "object",
    defaultSnippets: [{ body: { scope: "${1:keyword.operator}", settings: { foreground: "${2:#FF0000}" } } }],
    properties: {
      name: {
        type: "string",
        description: nls.localize("schema.properties.name", "Description of the rule.")
      },
      scope: {
        description: nls.localize("schema.properties.scope", "Scope selector against which this rule matches."),
        anyOf: [
          {
            enum: textMateScopes
          },
          {
            type: "string"
          },
          {
            type: "array",
            items: {
              enum: textMateScopes
            }
          },
          {
            type: "array",
            items: {
              type: "string"
            }
          }
        ]
      },
      settings: {
        $ref: "#/definitions/settings"
      }
    },
    required: [
      "settings"
    ],
    additionalProperties: false
  }
};
const colorThemeSchemaId = "vscode://schemas/color-theme";
const colorThemeSchema = {
  type: "object",
  allowComments: true,
  allowTrailingCommas: true,
  properties: {
    colors: {
      description: nls.localize("schema.workbenchColors", "Colors in the workbench"),
      $ref: workbenchColorsSchemaId,
      additionalProperties: false
    },
    tokenColors: {
      anyOf: [
        {
          type: "string",
          description: nls.localize("schema.tokenColors.path", "Path to a tmTheme file (relative to the current file).")
        },
        {
          description: nls.localize("schema.colors", "Colors for syntax highlighting"),
          $ref: textmateColorsSchemaId
        }
      ]
    },
    semanticHighlighting: {
      type: "boolean",
      description: nls.localize("schema.supportsSemanticHighlighting", "Whether semantic highlighting should be enabled for this theme.")
    },
    semanticTokenColors: {
      type: "object",
      description: nls.localize("schema.semanticTokenColors", "Colors for semantic tokens"),
      $ref: tokenStylingSchemaId
    }
  }
};
function registerColorThemeSchemas() {
  const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
  schemaRegistry.registerSchema(colorThemeSchemaId, colorThemeSchema);
  schemaRegistry.registerSchema(textmateColorsSchemaId, textmateColorSchema);
}
export {
  colorThemeSchemaId,
  registerColorThemeSchemas,
  textmateColorGroupSchemaId,
  textmateColorsSchemaId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcY29sb3JUaGVtZVNjaGVtYS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcblxuaW1wb3J0IHsgd29ya2JlbmNoQ29sb3JzU2NoZW1hSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB0b2tlblN0eWxpbmdTY2hlbWFJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkuanMnO1xuXG5jb25zdCB0ZXh0TWF0ZVNjb3BlcyA9IFtcblx0J2NvbW1lbnQnLFxuXHQnY29tbWVudC5ibG9jaycsXG5cdCdjb21tZW50LmJsb2NrLmRvY3VtZW50YXRpb24nLFxuXHQnY29tbWVudC5saW5lJyxcblx0J2NvbnN0YW50Jyxcblx0J2NvbnN0YW50LmNoYXJhY3RlcicsXG5cdCdjb25zdGFudC5jaGFyYWN0ZXIuZXNjYXBlJyxcblx0J2NvbnN0YW50Lm51bWVyaWMnLFxuXHQnY29uc3RhbnQubnVtZXJpYy5pbnRlZ2VyJyxcblx0J2NvbnN0YW50Lm51bWVyaWMuZmxvYXQnLFxuXHQnY29uc3RhbnQubnVtZXJpYy5oZXgnLFxuXHQnY29uc3RhbnQubnVtZXJpYy5vY3RhbCcsXG5cdCdjb25zdGFudC5vdGhlcicsXG5cdCdjb25zdGFudC5yZWdleHAnLFxuXHQnY29uc3RhbnQucmdiLXZhbHVlJyxcblx0J2VtcGhhc2lzJyxcblx0J2VudGl0eScsXG5cdCdlbnRpdHkubmFtZScsXG5cdCdlbnRpdHkubmFtZS5jbGFzcycsXG5cdCdlbnRpdHkubmFtZS5mdW5jdGlvbicsXG5cdCdlbnRpdHkubmFtZS5tZXRob2QnLFxuXHQnZW50aXR5Lm5hbWUuc2VjdGlvbicsXG5cdCdlbnRpdHkubmFtZS5zZWxlY3RvcicsXG5cdCdlbnRpdHkubmFtZS50YWcnLFxuXHQnZW50aXR5Lm5hbWUudHlwZScsXG5cdCdlbnRpdHkub3RoZXInLFxuXHQnZW50aXR5Lm90aGVyLmF0dHJpYnV0ZS1uYW1lJyxcblx0J2VudGl0eS5vdGhlci5pbmhlcml0ZWQtY2xhc3MnLFxuXHQnaW52YWxpZCcsXG5cdCdpbnZhbGlkLmRlcHJlY2F0ZWQnLFxuXHQnaW52YWxpZC5pbGxlZ2FsJyxcblx0J2tleXdvcmQnLFxuXHQna2V5d29yZC5jb250cm9sJyxcblx0J2tleXdvcmQub3BlcmF0b3InLFxuXHQna2V5d29yZC5vcGVyYXRvci5uZXcnLFxuXHQna2V5d29yZC5vcGVyYXRvci5hc3NpZ25tZW50Jyxcblx0J2tleXdvcmQub3BlcmF0b3IuYXJpdGhtZXRpYycsXG5cdCdrZXl3b3JkLm9wZXJhdG9yLmxvZ2ljYWwnLFxuXHQna2V5d29yZC5vdGhlcicsXG5cdCdtYXJrdXAnLFxuXHQnbWFya3VwLmJvbGQnLFxuXHQnbWFya3VwLmNoYW5nZWQnLFxuXHQnbWFya3VwLmRlbGV0ZWQnLFxuXHQnbWFya3VwLmhlYWRpbmcnLFxuXHQnbWFya3VwLmlubGluZS5yYXcnLFxuXHQnbWFya3VwLmluc2VydGVkJyxcblx0J21hcmt1cC5pdGFsaWMnLFxuXHQnbWFya3VwLmxpc3QnLFxuXHQnbWFya3VwLmxpc3QubnVtYmVyZWQnLFxuXHQnbWFya3VwLmxpc3QudW5udW1iZXJlZCcsXG5cdCdtYXJrdXAub3RoZXInLFxuXHQnbWFya3VwLnF1b3RlJyxcblx0J21hcmt1cC5yYXcnLFxuXHQnbWFya3VwLnVuZGVybGluZScsXG5cdCdtYXJrdXAudW5kZXJsaW5lLmxpbmsnLFxuXHQnbWV0YScsXG5cdCdtZXRhLmJsb2NrJyxcblx0J21ldGEuY2FzdCcsXG5cdCdtZXRhLmNsYXNzJyxcblx0J21ldGEuZnVuY3Rpb24nLFxuXHQnbWV0YS5mdW5jdGlvbi1jYWxsJyxcblx0J21ldGEucHJlcHJvY2Vzc29yJyxcblx0J21ldGEucmV0dXJuLXR5cGUnLFxuXHQnbWV0YS5zZWxlY3RvcicsXG5cdCdtZXRhLnRhZycsXG5cdCdtZXRhLnR5cGUuYW5ub3RhdGlvbicsXG5cdCdtZXRhLnR5cGUnLFxuXHQncHVuY3R1YXRpb24uZGVmaW5pdGlvbi5zdHJpbmcuYmVnaW4nLFxuXHQncHVuY3R1YXRpb24uZGVmaW5pdGlvbi5zdHJpbmcuZW5kJyxcblx0J3B1bmN0dWF0aW9uLnNlcGFyYXRvcicsXG5cdCdwdW5jdHVhdGlvbi5zZXBhcmF0b3IuY29udGludWF0aW9uJyxcblx0J3B1bmN0dWF0aW9uLnRlcm1pbmF0b3InLFxuXHQnc3RvcmFnZScsXG5cdCdzdG9yYWdlLm1vZGlmaWVyJyxcblx0J3N0b3JhZ2UudHlwZScsXG5cdCdzdHJpbmcnLFxuXHQnc3RyaW5nLmludGVycG9sYXRlZCcsXG5cdCdzdHJpbmcub3RoZXInLFxuXHQnc3RyaW5nLnF1b3RlZCcsXG5cdCdzdHJpbmcucXVvdGVkLmRvdWJsZScsXG5cdCdzdHJpbmcucXVvdGVkLm90aGVyJyxcblx0J3N0cmluZy5xdW90ZWQuc2luZ2xlJyxcblx0J3N0cmluZy5xdW90ZWQudHJpcGxlJyxcblx0J3N0cmluZy5yZWdleHAnLFxuXHQnc3RyaW5nLnVucXVvdGVkJyxcblx0J3N0cm9uZycsXG5cdCdzdXBwb3J0Jyxcblx0J3N1cHBvcnQuY2xhc3MnLFxuXHQnc3VwcG9ydC5jb25zdGFudCcsXG5cdCdzdXBwb3J0LmZ1bmN0aW9uJyxcblx0J3N1cHBvcnQub3RoZXInLFxuXHQnc3VwcG9ydC50eXBlJyxcblx0J3N1cHBvcnQudHlwZS5wcm9wZXJ0eS1uYW1lJyxcblx0J3N1cHBvcnQudmFyaWFibGUnLFxuXHQndmFyaWFibGUnLFxuXHQndmFyaWFibGUubGFuZ3VhZ2UnLFxuXHQndmFyaWFibGUubmFtZScsXG5cdCd2YXJpYWJsZS5vdGhlcicsXG5cdCd2YXJpYWJsZS5vdGhlci5yZWFkd3JpdGUnLFxuXHQndmFyaWFibGUucGFyYW1ldGVyJ1xuXTtcblxuZXhwb3J0IGNvbnN0IHRleHRtYXRlQ29sb3JzU2NoZW1hSWQgPSAndnNjb2RlOi8vc2NoZW1hcy90ZXh0bWF0ZS1jb2xvcnMnO1xuZXhwb3J0IGNvbnN0IHRleHRtYXRlQ29sb3JHcm91cFNjaGVtYUlkID0gYCR7dGV4dG1hdGVDb2xvcnNTY2hlbWFJZH0jL2RlZmluaXRpb25zL2NvbG9yR3JvdXBgO1xuXG5jb25zdCB0ZXh0bWF0ZUNvbG9yU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ2FycmF5Jyxcblx0ZGVmaW5pdGlvbnM6IHtcblx0XHRjb2xvckdyb3VwOiB7XG5cdFx0XHRkZWZhdWx0OiAnI0ZGMDAwMCcsXG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0Zm9ybWF0OiAnY29sb3ItaGV4J1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvc2V0dGluZ3MnXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdHNldHRpbmdzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5zZXR0aW5ncycsICdDb2xvcnMgYW5kIHN0eWxlcyBmb3IgdGhlIHRva2VuLicpLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRmb3JlZ3JvdW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmZvcmVncm91bmQnLCAnRm9yZWdyb3VuZCBjb2xvciBmb3IgdGhlIHRva2VuLicpLFxuXHRcdFx0XHRcdGZvcm1hdDogJ2NvbG9yLWhleCcsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJyNmZjAwMDAnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJhY2tncm91bmQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmJhY2tncm91bmQud2FybmluZycsICdUb2tlbiBiYWNrZ3JvdW5kIGNvbG9ycyBhcmUgY3VycmVudGx5IG5vdCBzdXBwb3J0ZWQuJylcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9udFN0eWxlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmZvbnRTdHlsZScsICdGb250IHN0eWxlIG9mIHRoZSBydWxlOiBcXCdpdGFsaWNcXCcsIFxcJ2JvbGRcXCcsIFxcJ3VuZGVybGluZVxcJywgXFwnc3RyaWtldGhyb3VnaFxcJyBvciBhIGNvbWJpbmF0aW9uLiBUaGUgZW1wdHkgc3RyaW5nIHVuc2V0cyBpbmhlcml0ZWQgc2V0dGluZ3MuJyksXG5cdFx0XHRcdFx0cGF0dGVybjogJ14oXFxcXHMqXFxcXGIoaXRhbGljfGJvbGR8dW5kZXJsaW5lfHN0cmlrZXRocm91Z2gpKSpcXFxccyokJyxcblx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb250U3R5bGUuZXJyb3InLCAnRm9udCBzdHlsZSBtdXN0IGJlIFxcJ2l0YWxpY1xcJywgXFwnYm9sZFxcJywgXFwndW5kZXJsaW5lXFwnLCBcXCdzdHJpa2V0aHJvdWdoXFwnIG9yIGEgY29tYmluYXRpb24gb3IgdGhlIGVtcHR5IHN0cmluZy4nKSxcblx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdFx0XHRcdHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmZvbnRTdHlsZS5ub25lJywgJ05vbmUgKGNsZWFyIGluaGVyaXRlZCBzdHlsZSknKSwgYm9keVRleHQ6ICdcIlwiJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAnYm9sZCcgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ3VuZGVybGluZScgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ3N0cmlrZXRocm91Z2gnIH0sXG5cdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgYm9sZCcgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ2l0YWxpYyB1bmRlcmxpbmUnIH0sXG5cdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ2JvbGQgdW5kZXJsaW5lJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAnYm9sZCBzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAndW5kZXJsaW5lIHN0cmlrZXRocm91Z2gnIH0sXG5cdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgYm9sZCB1bmRlcmxpbmUnIH0sXG5cdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgYm9sZCBzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljIHVuZGVybGluZSBzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAnYm9sZCB1bmRlcmxpbmUgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ2l0YWxpYyBib2xkIHVuZGVybGluZSBzdHJpa2V0aHJvdWdoJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb250RmFtaWx5OiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuLmZvbnRGYW1pbHknLCAnRm9udCBmYW1pbHkgZm9yIHRoZSB0b2tlbiAoZS5nLiwgXCJGaXJhIENvZGVcIiwgXCJKZXRCcmFpbnMgTW9ub1wiKS4nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb250U2l6ZToge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5mb250U2l6ZScsICdGb250IHNpemUgbXVsdGlwbGllciBmb3IgdGhlIHRva2VuIChlLmcuLCAxLjIgd2lsbCB1c2UgMS4yIHRpbWVzIHRoZSBkZWZhdWx0IGZvbnQgc2l6ZSkuJylcblx0XHRcdFx0fSxcblx0XHRcdFx0bGluZUhlaWdodDoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5saW5lSGVpZ2h0JywgJ0xpbmUgaGVpZ2h0IG11bHRpcGxpZXIgZm9yIHRoZSB0b2tlbiAoZS5nLiwgMS4yIHdpbGwgdXNlIDEuMiB0aW1lcyB0aGUgZGVmYXVsdCBoZWlnaHQpLiBJZiB0aGUgZm9udCBzaXplIGlzIHNldCBhbmQgdGhlIGxpbmUgaGVpZ2h0IGlzIG5vdCBleHBsaWNpdGx5IHNldCwgdGhlIGxpbmUgaGVpZ2h0IHdpbGwgYmUgY29tcHV0ZWQgYmFzZWQgb24gdGhlIGZvbnQgc2l6ZS4nKVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGZvcmVncm91bmQ6ICckezE6I0ZGMDAwMH0nLCBmb250U3R5bGU6ICckezI6Ym9sZH0nIH0gfV1cblx0XHR9XG5cdH0sXG5cdGl0ZW1zOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IHNjb3BlOiAnJHsxOmtleXdvcmQub3BlcmF0b3J9Jywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyR7MjojRkYwMDAwfScgfSB9IH1dLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdG5hbWU6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5wcm9wZXJ0aWVzLm5hbWUnLCAnRGVzY3JpcHRpb24gb2YgdGhlIHJ1bGUuJylcblx0XHRcdH0sXG5cdFx0XHRzY29wZToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEucHJvcGVydGllcy5zY29wZScsICdTY29wZSBzZWxlY3RvciBhZ2FpbnN0IHdoaWNoIHRoaXMgcnVsZSBtYXRjaGVzLicpLFxuXHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVudW06IHRleHRNYXRlU2NvcGVzXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdGVudW06IHRleHRNYXRlU2NvcGVzXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHRzZXR0aW5nczoge1xuXHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9zZXR0aW5ncydcblx0XHRcdH1cblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbXG5cdFx0XHQnc2V0dGluZ3MnXG5cdFx0XSxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0fVxufTtcblxuZXhwb3J0IGNvbnN0IGNvbG9yVGhlbWVTY2hlbWFJZCA9ICd2c2NvZGU6Ly9zY2hlbWFzL2NvbG9yLXRoZW1lJztcblxuY29uc3QgY29sb3JUaGVtZVNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRhbGxvd0NvbW1lbnRzOiB0cnVlLFxuXHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0Y29sb3JzOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEud29ya2JlbmNoQ29sb3JzJywgJ0NvbG9ycyBpbiB0aGUgd29ya2JlbmNoJyksXG5cdFx0XHQkcmVmOiB3b3JrYmVuY2hDb2xvcnNTY2hlbWFJZCxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxuXHRcdH0sXG5cdFx0dG9rZW5Db2xvcnM6IHtcblx0XHRcdGFueU9mOiBbe1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnRva2VuQ29sb3JzLnBhdGgnLCAnUGF0aCB0byBhIHRtVGhlbWUgZmlsZSAocmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgZmlsZSkuJylcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5jb2xvcnMnLCAnQ29sb3JzIGZvciBzeW50YXggaGlnaGxpZ2h0aW5nJyksXG5cdFx0XHRcdCRyZWY6IHRleHRtYXRlQ29sb3JzU2NoZW1hSWRcblx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdHNlbWFudGljSGlnaGxpZ2h0aW5nOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuc3VwcG9ydHNTZW1hbnRpY0hpZ2hsaWdodGluZycsICdXaGV0aGVyIHNlbWFudGljIGhpZ2hsaWdodGluZyBzaG91bGQgYmUgZW5hYmxlZCBmb3IgdGhpcyB0aGVtZS4nKVxuXHRcdH0sXG5cdFx0c2VtYW50aWNUb2tlbkNvbG9yczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuc2VtYW50aWNUb2tlbkNvbG9ycycsICdDb2xvcnMgZm9yIHNlbWFudGljIHRva2VucycpLFxuXHRcdFx0JHJlZjogdG9rZW5TdHlsaW5nU2NoZW1hSWRcblx0XHR9XG5cdH1cbn07XG5cblxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDb2xvclRoZW1lU2NoZW1hcygpIHtcblx0Y29uc3Qgc2NoZW1hUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblx0c2NoZW1hUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEoY29sb3JUaGVtZVNjaGVtYUlkLCBjb2xvclRoZW1lU2NoZW1hKTtcblx0c2NoZW1hUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEodGV4dG1hdGVDb2xvcnNTY2hlbWFJZCwgdGV4dG1hdGVDb2xvclNjaGVtYSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjLHNCQUFpRDtBQUd4RSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRCQUE0QjtBQUVyQyxNQUFNLGlCQUFpQjtBQUFBLEVBQ3RCO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFFTyxNQUFNLHlCQUF5QjtBQUMvQixNQUFNLDZCQUE2QixHQUFHLHNCQUFzQjtBQUVuRSxNQUFNLHNCQUFtQztBQUFBLEVBQ3hDLE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxJQUNaLFlBQVk7QUFBQSxNQUNYLFNBQVM7QUFBQSxNQUNULE9BQU87QUFBQSxRQUNOO0FBQUEsVUFDQyxNQUFNO0FBQUEsVUFDTixRQUFRO0FBQUEsUUFDVDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLFVBQVU7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLHlCQUF5QixrQ0FBa0M7QUFBQSxNQUNyRixZQUFZO0FBQUEsUUFDWCxZQUFZO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUywyQkFBMkIsaUNBQWlDO0FBQUEsVUFDdEYsUUFBUTtBQUFBLFVBQ1IsU0FBUztBQUFBLFFBQ1Y7QUFBQSxRQUNBLFlBQVk7QUFBQSxVQUNYLE1BQU07QUFBQSxVQUNOLG9CQUFvQixJQUFJLFNBQVMsbUNBQW1DLHNEQUFzRDtBQUFBLFFBQzNIO0FBQUEsUUFDQSxXQUFXO0FBQUEsVUFDVixNQUFNO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUywwQkFBMEIsc0lBQThJO0FBQUEsVUFDbE0sU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUywwQkFBMEIseUdBQWlIO0FBQUEsVUFDN0ssaUJBQWlCO0FBQUEsWUFDaEIsRUFBRSxPQUFPLElBQUksU0FBUywrQkFBK0IsOEJBQThCLEdBQUcsVUFBVSxLQUFLO0FBQUEsWUFDckcsRUFBRSxNQUFNLFNBQVM7QUFBQSxZQUNqQixFQUFFLE1BQU0sT0FBTztBQUFBLFlBQ2YsRUFBRSxNQUFNLFlBQVk7QUFBQSxZQUNwQixFQUFFLE1BQU0sZ0JBQWdCO0FBQUEsWUFDeEIsRUFBRSxNQUFNLGNBQWM7QUFBQSxZQUN0QixFQUFFLE1BQU0sbUJBQW1CO0FBQUEsWUFDM0IsRUFBRSxNQUFNLHVCQUF1QjtBQUFBLFlBQy9CLEVBQUUsTUFBTSxpQkFBaUI7QUFBQSxZQUN6QixFQUFFLE1BQU0scUJBQXFCO0FBQUEsWUFDN0IsRUFBRSxNQUFNLDBCQUEwQjtBQUFBLFlBQ2xDLEVBQUUsTUFBTSx3QkFBd0I7QUFBQSxZQUNoQyxFQUFFLE1BQU0sNEJBQTRCO0FBQUEsWUFDcEMsRUFBRSxNQUFNLGlDQUFpQztBQUFBLFlBQ3pDLEVBQUUsTUFBTSwrQkFBK0I7QUFBQSxZQUN2QyxFQUFFLE1BQU0sc0NBQXNDO0FBQUEsVUFDL0M7QUFBQSxRQUNEO0FBQUEsUUFDQSxZQUFZO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUywyQkFBMkIsa0VBQWtFO0FBQUEsUUFDeEg7QUFBQSxRQUNBLFVBQVU7QUFBQSxVQUNULE1BQU07QUFBQSxVQUNOLGFBQWEsSUFBSSxTQUFTLHlCQUF5QiwwRkFBMEY7QUFBQSxRQUM5STtBQUFBLFFBQ0EsWUFBWTtBQUFBLFVBQ1gsTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsMkJBQTJCLHFOQUFxTjtBQUFBLFFBQzNRO0FBQUEsTUFDRDtBQUFBLE1BQ0Esc0JBQXNCO0FBQUEsTUFDdEIsaUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsWUFBWSxnQkFBZ0IsV0FBVyxZQUFZLEVBQUUsQ0FBQztBQUFBLElBQ25GO0FBQUEsRUFDRDtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04saUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsT0FBTyx5QkFBeUIsVUFBVSxFQUFFLFlBQVksZUFBZSxFQUFFLEVBQUUsQ0FBQztBQUFBLElBQ3hHLFlBQVk7QUFBQSxNQUNYLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUNOLGFBQWEsSUFBSSxTQUFTLDBCQUEwQiwwQkFBMEI7QUFBQSxNQUMvRTtBQUFBLE1BQ0EsT0FBTztBQUFBLFFBQ04sYUFBYSxJQUFJLFNBQVMsMkJBQTJCLGlEQUFpRDtBQUFBLFFBQ3RHLE9BQU87QUFBQSxVQUNOO0FBQUEsWUFDQyxNQUFNO0FBQUEsVUFDUDtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sT0FBTztBQUFBLGNBQ04sTUFBTTtBQUFBLFlBQ1A7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sT0FBTztBQUFBLGNBQ04sTUFBTTtBQUFBLFlBQ1A7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLElBQ0EsVUFBVTtBQUFBLE1BQ1Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxzQkFBc0I7QUFBQSxFQUN2QjtBQUNEO0FBRU8sTUFBTSxxQkFBcUI7QUFFbEMsTUFBTSxtQkFBZ0M7QUFBQSxFQUNyQyxNQUFNO0FBQUEsRUFDTixlQUFlO0FBQUEsRUFDZixxQkFBcUI7QUFBQSxFQUNyQixZQUFZO0FBQUEsSUFDWCxRQUFRO0FBQUEsTUFDUCxhQUFhLElBQUksU0FBUywwQkFBMEIseUJBQXlCO0FBQUEsTUFDN0UsTUFBTTtBQUFBLE1BQ04sc0JBQXNCO0FBQUEsSUFDdkI7QUFBQSxJQUNBLGFBQWE7QUFBQSxNQUNaLE9BQU87QUFBQSxRQUFDO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUywyQkFBMkIsd0RBQXdEO0FBQUEsUUFDOUc7QUFBQSxRQUNBO0FBQUEsVUFDQyxhQUFhLElBQUksU0FBUyxpQkFBaUIsZ0NBQWdDO0FBQUEsVUFDM0UsTUFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLElBQ0Esc0JBQXNCO0FBQUEsTUFDckIsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsdUNBQXVDLGlFQUFpRTtBQUFBLElBQ25JO0FBQUEsSUFDQSxxQkFBcUI7QUFBQSxNQUNwQixNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyw4QkFBOEIsNEJBQTRCO0FBQUEsTUFDcEYsTUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNEO0FBQ0Q7QUFJTyxTQUFTLDRCQUE0QjtBQUMzQyxRQUFNLGlCQUFpQixTQUFTLEdBQThCLGVBQWUsZ0JBQWdCO0FBQzdGLGlCQUFlLGVBQWUsb0JBQW9CLGdCQUFnQjtBQUNsRSxpQkFBZSxlQUFlLHdCQUF3QixtQkFBbUI7QUFDMUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
