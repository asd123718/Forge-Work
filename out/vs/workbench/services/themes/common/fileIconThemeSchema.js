import * as nls from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { fontWeightRegex, fontStyleRegex, fontSizeRegex, fontIdRegex, fontColorRegex, fontIdErrorMessage } from "../../../../platform/theme/common/iconRegistry.js";
const schemaId = "vscode://schemas/icon-theme";
const schema = {
  type: "object",
  allowComments: true,
  allowTrailingCommas: true,
  definitions: {
    folderExpanded: {
      type: "string",
      description: nls.localize("schema.folderExpanded", "The folder icon for expanded folders. The expanded folder icon is optional. If not set, the icon defined for folder will be shown.")
    },
    folder: {
      type: "string",
      description: nls.localize("schema.folder", "The folder icon for collapsed folders, and if folderExpanded is not set, also for expanded folders.")
    },
    file: {
      type: "string",
      description: nls.localize("schema.file", "The default file icon, shown for all files that don't match any extension, filename or language id.")
    },
    rootFolder: {
      type: "string",
      description: nls.localize("schema.rootFolder", "The folder icon for collapsed root folders, and if rootFolderExpanded is not set, also for expanded root folders.")
    },
    rootFolderExpanded: {
      type: "string",
      description: nls.localize("schema.rootFolderExpanded", "The folder icon for expanded root folders. The expanded root folder icon is optional. If not set, the icon defined for root folder will be shown.")
    },
    rootFolderNames: {
      type: "object",
      description: nls.localize("schema.rootFolderNames", "Associates root folder names to icons. The object key is the root folder name. No patterns or wildcards are allowed. Root folder name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.folderName", "The ID of the icon definition for the association.")
      }
    },
    rootFolderNamesExpanded: {
      type: "object",
      description: nls.localize("schema.rootFolderNamesExpanded", "Associates root folder names to icons for expanded root folders. The object key is the root folder name. No patterns or wildcards are allowed. Root folder name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.rootFolderNameExpanded", "The ID of the icon definition for the association.")
      }
    },
    folderNames: {
      type: "object",
      description: nls.localize("schema.folderNames", "Associates folder names to icons. The object key is the folder name, not including any path segments. No patterns or wildcards are allowed. Folder name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.folderName", "The ID of the icon definition for the association.")
      }
    },
    folderNamesExpanded: {
      type: "object",
      description: nls.localize("schema.folderNamesExpanded", "Associates folder names to icons for expanded folders. The object key is the folder name, not including any path segments. No patterns or wildcards are allowed. Folder name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.folderNameExpanded", "The ID of the icon definition for the association.")
      }
    },
    fileExtensions: {
      type: "object",
      description: nls.localize("schema.fileExtensions", "Associates file extensions to icons. The object key is the file extension name. The extension name is the last segment of a file name after the last dot (not including the dot). Extensions are compared case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.fileExtension", "The ID of the icon definition for the association.")
      }
    },
    fileNames: {
      type: "object",
      description: nls.localize("schema.fileNames", "Associates file names to icons. The object key is the full file name, but not including any path segments. File name can include dots and a possible file extension. No patterns or wildcards are allowed. File name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.fileName", "The ID of the icon definition for the association.")
      }
    },
    languageIds: {
      type: "object",
      description: nls.localize("schema.languageIds", "Associates languages to icons. The object key is the language id as defined in the language contribution point."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.languageId", "The ID of the icon definition for the association.")
      }
    },
    associations: {
      type: "object",
      properties: {
        folderExpanded: {
          $ref: "#/definitions/folderExpanded"
        },
        folder: {
          $ref: "#/definitions/folder"
        },
        file: {
          $ref: "#/definitions/file"
        },
        folderNames: {
          $ref: "#/definitions/folderNames"
        },
        folderNamesExpanded: {
          $ref: "#/definitions/folderNamesExpanded"
        },
        rootFolder: {
          $ref: "#/definitions/rootFolder"
        },
        rootFolderExpanded: {
          $ref: "#/definitions/rootFolderExpanded"
        },
        rootFolderNames: {
          $ref: "#/definitions/rootFolderNames"
        },
        rootFolderNamesExpanded: {
          $ref: "#/definitions/rootFolderNamesExpanded"
        },
        fileExtensions: {
          $ref: "#/definitions/fileExtensions"
        },
        fileNames: {
          $ref: "#/definitions/fileNames"
        },
        languageIds: {
          $ref: "#/definitions/languageIds"
        }
      }
    }
  },
  properties: {
    fonts: {
      type: "array",
      description: nls.localize("schema.fonts", "Fonts that are used in the icon definitions."),
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
                  description: nls.localize("schema.font-path", "The font path, relative to the current file icon theme file.")
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
            pattern: fontWeightRegex.source
          },
          style: {
            type: "string",
            description: nls.localize("schema.font-style", "The style of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-style for valid values."),
            pattern: fontStyleRegex.source
          },
          size: {
            type: "string",
            description: nls.localize("schema.font-size", "The default size of the font. We strongly recommend using a percentage value, for example: 125%."),
            pattern: fontSizeRegex.source
          }
        },
        required: [
          "id",
          "src"
        ]
      }
    },
    iconDefinitions: {
      type: "object",
      description: nls.localize("schema.iconDefinitions", "Description of all icons that can be used when associating files to icons."),
      additionalProperties: {
        type: "object",
        description: nls.localize("schema.iconDefinition", "An icon definition. The object key is the ID of the definition."),
        properties: {
          iconPath: {
            type: "string",
            description: nls.localize("schema.iconPath", "When using a SVG or PNG: The path to the image. The path is relative to the icon set file.")
          },
          fontCharacter: {
            type: "string",
            description: nls.localize("schema.fontCharacter", "When using a glyph font: The character in the font to use.")
          },
          fontColor: {
            type: "string",
            format: "color-hex",
            description: nls.localize("schema.fontColor", "When using a glyph font: The color to use."),
            pattern: fontColorRegex.source
          },
          fontSize: {
            type: "string",
            description: nls.localize("schema.fontSize", "When using a font: The font size in percentage to the text font. If not set, defaults to the size in the font definition."),
            pattern: fontSizeRegex.source
          },
          fontId: {
            type: "string",
            description: nls.localize("schema.fontId", "When using a font: The id of the font. If not set, defaults to the first font definition."),
            pattern: fontIdRegex.source,
            patternErrorMessage: fontIdErrorMessage
          }
        }
      }
    },
    usesCurrentColor: {
      type: "boolean",
      description: nls.localize("schema.usesCurrentColor", "Whether image icons use their alpha channel as a mask filled with the current text color. When enabled, only the shape of an image icon is used, so any colors defined in the icon (including light and high contrast variants) are ignored.")
    },
    folderExpanded: {
      $ref: "#/definitions/folderExpanded"
    },
    folder: {
      $ref: "#/definitions/folder"
    },
    file: {
      $ref: "#/definitions/file"
    },
    folderNames: {
      $ref: "#/definitions/folderNames"
    },
    folderNamesExpanded: {
      $ref: "#/definitions/folderNamesExpanded"
    },
    rootFolder: {
      $ref: "#/definitions/rootFolder"
    },
    rootFolderExpanded: {
      $ref: "#/definitions/rootFolderExpanded"
    },
    rootFolderNames: {
      $ref: "#/definitions/rootFolderNames"
    },
    rootFolderNamesExpanded: {
      $ref: "#/definitions/rootFolderNamesExpanded"
    },
    fileExtensions: {
      $ref: "#/definitions/fileExtensions"
    },
    fileNames: {
      $ref: "#/definitions/fileNames"
    },
    languageIds: {
      $ref: "#/definitions/languageIds"
    },
    light: {
      $ref: "#/definitions/associations",
      description: nls.localize("schema.light", "Optional associations for file icons in light color themes.")
    },
    highContrast: {
      $ref: "#/definitions/associations",
      description: nls.localize("schema.highContrast", "Optional associations for file icons in high contrast color themes.")
    },
    hidesExplorerArrows: {
      type: "boolean",
      description: nls.localize("schema.hidesExplorerArrows", "Configures whether the file explorer's arrows should be hidden when this theme is active.")
    },
    showLanguageModeIcons: {
      type: "boolean",
      description: nls.localize("schema.showLanguageModeIcons", "Configures whether the default language icons should be used if the theme does not define an icon for a language.")
    }
  }
};
function registerFileIconThemeSchemas() {
  const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
  schemaRegistry.registerSchema(schemaId, schema);
}
export {
  registerFileIconThemeSchemas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0aGVtZXNcXGNvbW1vblxcZmlsZUljb25UaGVtZVNjaGVtYS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IGZvbnRXZWlnaHRSZWdleCwgZm9udFN0eWxlUmVnZXgsIGZvbnRTaXplUmVnZXgsIGZvbnRJZFJlZ2V4LCBmb250Q29sb3JSZWdleCwgZm9udElkRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5cbmNvbnN0IHNjaGVtYUlkID0gJ3ZzY29kZTovL3NjaGVtYXMvaWNvbi10aGVtZSc7XG5jb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0YWxsb3dDb21tZW50czogdHJ1ZSxcblx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0ZGVmaW5pdGlvbnM6IHtcblx0XHRmb2xkZXJFeHBhbmRlZDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGVyRXhwYW5kZWQnLCAnVGhlIGZvbGRlciBpY29uIGZvciBleHBhbmRlZCBmb2xkZXJzLiBUaGUgZXhwYW5kZWQgZm9sZGVyIGljb24gaXMgb3B0aW9uYWwuIElmIG5vdCBzZXQsIHRoZSBpY29uIGRlZmluZWQgZm9yIGZvbGRlciB3aWxsIGJlIHNob3duLicpXG5cdFx0fSxcblx0XHRmb2xkZXI6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRlcicsICdUaGUgZm9sZGVyIGljb24gZm9yIGNvbGxhcHNlZCBmb2xkZXJzLCBhbmQgaWYgZm9sZGVyRXhwYW5kZWQgaXMgbm90IHNldCwgYWxzbyBmb3IgZXhwYW5kZWQgZm9sZGVycy4nKVxuXG5cdFx0fSxcblx0XHRmaWxlOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5maWxlJywgJ1RoZSBkZWZhdWx0IGZpbGUgaWNvbiwgc2hvd24gZm9yIGFsbCBmaWxlcyB0aGF0IGRvblxcJ3QgbWF0Y2ggYW55IGV4dGVuc2lvbiwgZmlsZW5hbWUgb3IgbGFuZ3VhZ2UgaWQuJylcblxuXHRcdH0sXG5cdFx0cm9vdEZvbGRlcjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEucm9vdEZvbGRlcicsICdUaGUgZm9sZGVyIGljb24gZm9yIGNvbGxhcHNlZCByb290IGZvbGRlcnMsIGFuZCBpZiByb290Rm9sZGVyRXhwYW5kZWQgaXMgbm90IHNldCwgYWxzbyBmb3IgZXhwYW5kZWQgcm9vdCBmb2xkZXJzLicpXG5cdFx0fSxcblx0XHRyb290Rm9sZGVyRXhwYW5kZWQ6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnJvb3RGb2xkZXJFeHBhbmRlZCcsICdUaGUgZm9sZGVyIGljb24gZm9yIGV4cGFuZGVkIHJvb3QgZm9sZGVycy4gVGhlIGV4cGFuZGVkIHJvb3QgZm9sZGVyIGljb24gaXMgb3B0aW9uYWwuIElmIG5vdCBzZXQsIHRoZSBpY29uIGRlZmluZWQgZm9yIHJvb3QgZm9sZGVyIHdpbGwgYmUgc2hvd24uJylcblx0XHR9LFxuXHRcdHJvb3RGb2xkZXJOYW1lczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEucm9vdEZvbGRlck5hbWVzJywgJ0Fzc29jaWF0ZXMgcm9vdCBmb2xkZXIgbmFtZXMgdG8gaWNvbnMuIFRoZSBvYmplY3Qga2V5IGlzIHRoZSByb290IGZvbGRlciBuYW1lLiBObyBwYXR0ZXJucyBvciB3aWxkY2FyZHMgYXJlIGFsbG93ZWQuIFJvb3QgZm9sZGVyIG5hbWUgbWF0Y2hpbmcgaXMgY2FzZSBpbnNlbnNpdGl2ZS4nKSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGVyTmFtZScsICdUaGUgSUQgb2YgdGhlIGljb24gZGVmaW5pdGlvbiBmb3IgdGhlIGFzc29jaWF0aW9uLicpXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyb290Rm9sZGVyTmFtZXNFeHBhbmRlZDoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEucm9vdEZvbGRlck5hbWVzRXhwYW5kZWQnLCAnQXNzb2NpYXRlcyByb290IGZvbGRlciBuYW1lcyB0byBpY29ucyBmb3IgZXhwYW5kZWQgcm9vdCBmb2xkZXJzLiBUaGUgb2JqZWN0IGtleSBpcyB0aGUgcm9vdCBmb2xkZXIgbmFtZS4gTm8gcGF0dGVybnMgb3Igd2lsZGNhcmRzIGFyZSBhbGxvd2VkLiBSb290IGZvbGRlciBuYW1lIG1hdGNoaW5nIGlzIGNhc2UgaW5zZW5zaXRpdmUuJyksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnJvb3RGb2xkZXJOYW1lRXhwYW5kZWQnLCAnVGhlIElEIG9mIHRoZSBpY29uIGRlZmluaXRpb24gZm9yIHRoZSBhc3NvY2lhdGlvbi4nKVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Zm9sZGVyTmFtZXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRlck5hbWVzJywgJ0Fzc29jaWF0ZXMgZm9sZGVyIG5hbWVzIHRvIGljb25zLiBUaGUgb2JqZWN0IGtleSBpcyB0aGUgZm9sZGVyIG5hbWUsIG5vdCBpbmNsdWRpbmcgYW55IHBhdGggc2VnbWVudHMuIE5vIHBhdHRlcm5zIG9yIHdpbGRjYXJkcyBhcmUgYWxsb3dlZC4gRm9sZGVyIG5hbWUgbWF0Y2hpbmcgaXMgY2FzZSBpbnNlbnNpdGl2ZS4nKSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGVyTmFtZScsICdUaGUgSUQgb2YgdGhlIGljb24gZGVmaW5pdGlvbiBmb3IgdGhlIGFzc29jaWF0aW9uLicpXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRmb2xkZXJOYW1lc0V4cGFuZGVkOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb2xkZXJOYW1lc0V4cGFuZGVkJywgJ0Fzc29jaWF0ZXMgZm9sZGVyIG5hbWVzIHRvIGljb25zIGZvciBleHBhbmRlZCBmb2xkZXJzLiBUaGUgb2JqZWN0IGtleSBpcyB0aGUgZm9sZGVyIG5hbWUsIG5vdCBpbmNsdWRpbmcgYW55IHBhdGggc2VnbWVudHMuIE5vIHBhdHRlcm5zIG9yIHdpbGRjYXJkcyBhcmUgYWxsb3dlZC4gRm9sZGVyIG5hbWUgbWF0Y2hpbmcgaXMgY2FzZSBpbnNlbnNpdGl2ZS4nKSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGVyTmFtZUV4cGFuZGVkJywgJ1RoZSBJRCBvZiB0aGUgaWNvbiBkZWZpbml0aW9uIGZvciB0aGUgYXNzb2NpYXRpb24uJylcblx0XHRcdH1cblx0XHR9LFxuXHRcdGZpbGVFeHRlbnNpb25zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5maWxlRXh0ZW5zaW9ucycsICdBc3NvY2lhdGVzIGZpbGUgZXh0ZW5zaW9ucyB0byBpY29ucy4gVGhlIG9iamVjdCBrZXkgaXMgdGhlIGZpbGUgZXh0ZW5zaW9uIG5hbWUuIFRoZSBleHRlbnNpb24gbmFtZSBpcyB0aGUgbGFzdCBzZWdtZW50IG9mIGEgZmlsZSBuYW1lIGFmdGVyIHRoZSBsYXN0IGRvdCAobm90IGluY2x1ZGluZyB0aGUgZG90KS4gRXh0ZW5zaW9ucyBhcmUgY29tcGFyZWQgY2FzZSBpbnNlbnNpdGl2ZS4nKSxcblxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5maWxlRXh0ZW5zaW9uJywgJ1RoZSBJRCBvZiB0aGUgaWNvbiBkZWZpbml0aW9uIGZvciB0aGUgYXNzb2NpYXRpb24uJylcblx0XHRcdH1cblx0XHR9LFxuXHRcdGZpbGVOYW1lczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZmlsZU5hbWVzJywgJ0Fzc29jaWF0ZXMgZmlsZSBuYW1lcyB0byBpY29ucy4gVGhlIG9iamVjdCBrZXkgaXMgdGhlIGZ1bGwgZmlsZSBuYW1lLCBidXQgbm90IGluY2x1ZGluZyBhbnkgcGF0aCBzZWdtZW50cy4gRmlsZSBuYW1lIGNhbiBpbmNsdWRlIGRvdHMgYW5kIGEgcG9zc2libGUgZmlsZSBleHRlbnNpb24uIE5vIHBhdHRlcm5zIG9yIHdpbGRjYXJkcyBhcmUgYWxsb3dlZC4gRmlsZSBuYW1lIG1hdGNoaW5nIGlzIGNhc2UgaW5zZW5zaXRpdmUuJyksXG5cblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZmlsZU5hbWUnLCAnVGhlIElEIG9mIHRoZSBpY29uIGRlZmluaXRpb24gZm9yIHRoZSBhc3NvY2lhdGlvbi4nKVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0bGFuZ3VhZ2VJZHM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmxhbmd1YWdlSWRzJywgJ0Fzc29jaWF0ZXMgbGFuZ3VhZ2VzIHRvIGljb25zLiBUaGUgb2JqZWN0IGtleSBpcyB0aGUgbGFuZ3VhZ2UgaWQgYXMgZGVmaW5lZCBpbiB0aGUgbGFuZ3VhZ2UgY29udHJpYnV0aW9uIHBvaW50LicpLFxuXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmxhbmd1YWdlSWQnLCAnVGhlIElEIG9mIHRoZSBpY29uIGRlZmluaXRpb24gZm9yIHRoZSBhc3NvY2lhdGlvbi4nKVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0YXNzb2NpYXRpb25zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Zm9sZGVyRXhwYW5kZWQ6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9mb2xkZXJFeHBhbmRlZCdcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZm9sZGVyJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRmaWxlOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZmlsZSdcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyTmFtZXM6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9mb2xkZXJOYW1lcydcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyTmFtZXNFeHBhbmRlZDoge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2ZvbGRlck5hbWVzRXhwYW5kZWQnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJvb3RGb2xkZXI6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9yb290Rm9sZGVyJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyb290Rm9sZGVyRXhwYW5kZWQ6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9yb290Rm9sZGVyRXhwYW5kZWQnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJvb3RGb2xkZXJOYW1lczoge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Jvb3RGb2xkZXJOYW1lcydcblx0XHRcdFx0fSxcblx0XHRcdFx0cm9vdEZvbGRlck5hbWVzRXhwYW5kZWQ6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9yb290Rm9sZGVyTmFtZXNFeHBhbmRlZCdcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmlsZUV4dGVuc2lvbnM6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9maWxlRXh0ZW5zaW9ucydcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmlsZU5hbWVzOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZmlsZU5hbWVzJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRsYW5ndWFnZUlkczoge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2xhbmd1YWdlSWRzJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0Zm9udHM6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udHMnLCAnRm9udHMgdGhhdCBhcmUgdXNlZCBpbiB0aGUgaWNvbiBkZWZpbml0aW9ucy4nKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmlkJywgJ1RoZSBJRCBvZiB0aGUgZm9udC4nKSxcblx0XHRcdFx0XHRcdHBhdHRlcm46IGZvbnRJZFJlZ2V4LnNvdXJjZSxcblx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IGZvbnRJZEVycm9yTWVzc2FnZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c3JjOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnNyYycsICdUaGUgbG9jYXRpb24gb2YgdGhlIGZvbnQuJyksXG5cdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnQtcGF0aCcsICdUaGUgZm9udCBwYXRoLCByZWxhdGl2ZSB0byB0aGUgY3VycmVudCBmaWxlIGljb24gdGhlbWUgZmlsZS4nKSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGZvcm1hdDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udC1mb3JtYXQnLCAnVGhlIGZvcm1hdCBvZiB0aGUgZm9udC4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdGVudW06IFsnd29mZicsICd3b2ZmMicsICd0cnVldHlwZScsICdvcGVudHlwZScsICdlbWJlZGRlZC1vcGVudHlwZScsICdzdmcnXVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFtcblx0XHRcdFx0XHRcdFx0XHQncGF0aCcsXG5cdFx0XHRcdFx0XHRcdFx0J2Zvcm1hdCdcblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2VpZ2h0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb250LXdlaWdodCcsICdUaGUgd2VpZ2h0IG9mIHRoZSBmb250LiBTZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQ1NTL2ZvbnQtd2VpZ2h0IGZvciB2YWxpZCB2YWx1ZXMuJyksXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiBmb250V2VpZ2h0UmVnZXguc291cmNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udC1zdHlsZScsICdUaGUgc3R5bGUgb2YgdGhlIGZvbnQuIFNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9DU1MvZm9udC1zdHlsZSBmb3IgdmFsaWQgdmFsdWVzLicpLFxuXHRcdFx0XHRcdFx0cGF0dGVybjogZm9udFN0eWxlUmVnZXguc291cmNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzaXplOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb250LXNpemUnLCAnVGhlIGRlZmF1bHQgc2l6ZSBvZiB0aGUgZm9udC4gV2Ugc3Ryb25nbHkgcmVjb21tZW5kIHVzaW5nIGEgcGVyY2VudGFnZSB2YWx1ZSwgZm9yIGV4YW1wbGU6IDEyNSUuJyksXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiBmb250U2l6ZVJlZ2V4LnNvdXJjZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0cmVxdWlyZWQ6IFtcblx0XHRcdFx0XHQnaWQnLFxuXHRcdFx0XHRcdCdzcmMnXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LFxuXHRcdGljb25EZWZpbml0aW9uczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaWNvbkRlZmluaXRpb25zJywgJ0Rlc2NyaXB0aW9uIG9mIGFsbCBpY29ucyB0aGF0IGNhbiBiZSB1c2VkIHdoZW4gYXNzb2NpYXRpbmcgZmlsZXMgdG8gaWNvbnMuJyksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmljb25EZWZpbml0aW9uJywgJ0FuIGljb24gZGVmaW5pdGlvbi4gVGhlIG9iamVjdCBrZXkgaXMgdGhlIElEIG9mIHRoZSBkZWZpbml0aW9uLicpLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0aWNvblBhdGg6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmljb25QYXRoJywgJ1doZW4gdXNpbmcgYSBTVkcgb3IgUE5HOiBUaGUgcGF0aCB0byB0aGUgaW1hZ2UuIFRoZSBwYXRoIGlzIHJlbGF0aXZlIHRvIHRoZSBpY29uIHNldCBmaWxlLicpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmb250Q2hhcmFjdGVyOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb250Q2hhcmFjdGVyJywgJ1doZW4gdXNpbmcgYSBnbHlwaCBmb250OiBUaGUgY2hhcmFjdGVyIGluIHRoZSBmb250IHRvIHVzZS4nKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Zm9udENvbG9yOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGZvcm1hdDogJ2NvbG9yLWhleCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udENvbG9yJywgJ1doZW4gdXNpbmcgYSBnbHlwaCBmb250OiBUaGUgY29sb3IgdG8gdXNlLicpLFxuXHRcdFx0XHRcdFx0cGF0dGVybjogZm9udENvbG9yUmVnZXguc291cmNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmb250U2l6ZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udFNpemUnLCAnV2hlbiB1c2luZyBhIGZvbnQ6IFRoZSBmb250IHNpemUgaW4gcGVyY2VudGFnZSB0byB0aGUgdGV4dCBmb250LiBJZiBub3Qgc2V0LCBkZWZhdWx0cyB0byB0aGUgc2l6ZSBpbiB0aGUgZm9udCBkZWZpbml0aW9uLicpLFxuXHRcdFx0XHRcdFx0cGF0dGVybjogZm9udFNpemVSZWdleC5zb3VyY2Vcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGZvbnRJZDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udElkJywgJ1doZW4gdXNpbmcgYSBmb250OiBUaGUgaWQgb2YgdGhlIGZvbnQuIElmIG5vdCBzZXQsIGRlZmF1bHRzIHRvIHRoZSBmaXJzdCBmb250IGRlZmluaXRpb24uJyksXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiBmb250SWRSZWdleC5zb3VyY2UsXG5cdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBmb250SWRFcnJvck1lc3NhZ2Vcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdHVzZXNDdXJyZW50Q29sb3I6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS51c2VzQ3VycmVudENvbG9yJywgJ1doZXRoZXIgaW1hZ2UgaWNvbnMgdXNlIHRoZWlyIGFscGhhIGNoYW5uZWwgYXMgYSBtYXNrIGZpbGxlZCB3aXRoIHRoZSBjdXJyZW50IHRleHQgY29sb3IuIFdoZW4gZW5hYmxlZCwgb25seSB0aGUgc2hhcGUgb2YgYW4gaW1hZ2UgaWNvbiBpcyB1c2VkLCBzbyBhbnkgY29sb3JzIGRlZmluZWQgaW4gdGhlIGljb24gKGluY2x1ZGluZyBsaWdodCBhbmQgaGlnaCBjb250cmFzdCB2YXJpYW50cykgYXJlIGlnbm9yZWQuJylcblx0XHR9LFxuXHRcdGZvbGRlckV4cGFuZGVkOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9mb2xkZXJFeHBhbmRlZCdcblx0XHR9LFxuXHRcdGZvbGRlcjoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZm9sZGVyJ1xuXHRcdH0sXG5cdFx0ZmlsZToge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZmlsZSdcblx0XHR9LFxuXHRcdGZvbGRlck5hbWVzOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9mb2xkZXJOYW1lcydcblx0XHR9LFxuXHRcdGZvbGRlck5hbWVzRXhwYW5kZWQ6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2ZvbGRlck5hbWVzRXhwYW5kZWQnXG5cdFx0fSxcblx0XHRyb290Rm9sZGVyOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9yb290Rm9sZGVyJ1xuXHRcdH0sXG5cdFx0cm9vdEZvbGRlckV4cGFuZGVkOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9yb290Rm9sZGVyRXhwYW5kZWQnXG5cdFx0fSxcblx0XHRyb290Rm9sZGVyTmFtZXM6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Jvb3RGb2xkZXJOYW1lcydcblx0XHR9LFxuXHRcdHJvb3RGb2xkZXJOYW1lc0V4cGFuZGVkOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9yb290Rm9sZGVyTmFtZXNFeHBhbmRlZCdcblx0XHR9LFxuXHRcdGZpbGVFeHRlbnNpb25zOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9maWxlRXh0ZW5zaW9ucydcblx0XHR9LFxuXHRcdGZpbGVOYW1lczoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZmlsZU5hbWVzJ1xuXHRcdH0sXG5cdFx0bGFuZ3VhZ2VJZHM6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2xhbmd1YWdlSWRzJ1xuXHRcdH0sXG5cdFx0bGlnaHQ6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2Fzc29jaWF0aW9ucycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEubGlnaHQnLCAnT3B0aW9uYWwgYXNzb2NpYXRpb25zIGZvciBmaWxlIGljb25zIGluIGxpZ2h0IGNvbG9yIHRoZW1lcy4nKVxuXHRcdH0sXG5cdFx0aGlnaENvbnRyYXN0OiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9hc3NvY2lhdGlvbnMnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmhpZ2hDb250cmFzdCcsICdPcHRpb25hbCBhc3NvY2lhdGlvbnMgZm9yIGZpbGUgaWNvbnMgaW4gaGlnaCBjb250cmFzdCBjb2xvciB0aGVtZXMuJylcblx0XHR9LFxuXHRcdGhpZGVzRXhwbG9yZXJBcnJvd3M6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5oaWRlc0V4cGxvcmVyQXJyb3dzJywgJ0NvbmZpZ3VyZXMgd2hldGhlciB0aGUgZmlsZSBleHBsb3JlclxcJ3MgYXJyb3dzIHNob3VsZCBiZSBoaWRkZW4gd2hlbiB0aGlzIHRoZW1lIGlzIGFjdGl2ZS4nKVxuXHRcdH0sXG5cdFx0c2hvd0xhbmd1YWdlTW9kZUljb25zOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuc2hvd0xhbmd1YWdlTW9kZUljb25zJywgJ0NvbmZpZ3VyZXMgd2hldGhlciB0aGUgZGVmYXVsdCBsYW5ndWFnZSBpY29ucyBzaG91bGQgYmUgdXNlZCBpZiB0aGUgdGhlbWUgZG9lcyBub3QgZGVmaW5lIGFuIGljb24gZm9yIGEgbGFuZ3VhZ2UuJylcblx0XHR9XG5cdH1cbn07XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckZpbGVJY29uVGhlbWVTY2hlbWFzKCkge1xuXHRjb25zdCBzY2hlbWFSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+KEpTT05FeHRlbnNpb25zLkpTT05Db250cmlidXRpb24pO1xuXHRzY2hlbWFSZWdpc3RyeS5yZWdpc3RlclNjaGVtYShzY2hlbWFJZCwgc2NoZW1hKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFlBQVksU0FBUztBQUVyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWMsc0JBQWlEO0FBRXhFLFNBQVMsaUJBQWlCLGdCQUFnQixlQUFlLGFBQWEsZ0JBQWdCLDBCQUEwQjtBQUVoSCxNQUFNLFdBQVc7QUFDakIsTUFBTSxTQUFzQjtBQUFBLEVBQzNCLE1BQU07QUFBQSxFQUNOLGVBQWU7QUFBQSxFQUNmLHFCQUFxQjtBQUFBLEVBQ3JCLGFBQWE7QUFBQSxJQUNaLGdCQUFnQjtBQUFBLE1BQ2YsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMseUJBQXlCLG9JQUFvSTtBQUFBLElBQ3hMO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDUCxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyxpQkFBaUIscUdBQXFHO0FBQUEsSUFFako7QUFBQSxJQUNBLE1BQU07QUFBQSxNQUNMLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLGVBQWUscUdBQXNHO0FBQUEsSUFFaEo7QUFBQSxJQUNBLFlBQVk7QUFBQSxNQUNYLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFT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
