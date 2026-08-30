import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { languagesExtPoint } from "../../language/common/languageService.js";
const grammarsExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "grammars",
  deps: [languagesExtPoint],
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.grammars", "Contributes textmate tokenizers."),
    type: "array",
    defaultSnippets: [{ body: [{ language: "${1:id}", scopeName: "source.${2:id}", path: "./syntaxes/${3:id}.tmLanguage." }] }],
    items: {
      type: "object",
      defaultSnippets: [{ body: { language: "${1:id}", scopeName: "source.${2:id}", path: "./syntaxes/${3:id}.tmLanguage." } }],
      properties: {
        language: {
          description: nls.localize("vscode.extension.contributes.grammars.language", "Language identifier for which this syntax is contributed to."),
          type: "string"
        },
        scopeName: {
          description: nls.localize("vscode.extension.contributes.grammars.scopeName", "Textmate scope name used by the tmLanguage file."),
          type: "string"
        },
        path: {
          description: nls.localize("vscode.extension.contributes.grammars.path", "Path of the tmLanguage file. The path is relative to the extension folder and typically starts with './syntaxes/'."),
          type: "string"
        },
        embeddedLanguages: {
          description: nls.localize("vscode.extension.contributes.grammars.embeddedLanguages", "A map of scope name to language id if this grammar contains embedded languages."),
          type: "object"
        },
        tokenTypes: {
          description: nls.localize("vscode.extension.contributes.grammars.tokenTypes", "A map of scope name to token types."),
          type: "object",
          additionalProperties: {
            enum: ["string", "comment", "other", "regex"]
          }
        },
        injectTo: {
          description: nls.localize("vscode.extension.contributes.grammars.injectTo", "List of language scope names to which this grammar is injected to."),
          type: "array",
          items: {
            type: "string"
          }
        },
        balancedBracketScopes: {
          description: nls.localize("vscode.extension.contributes.grammars.balancedBracketScopes", "Defines which scope names contain balanced brackets."),
          type: "array",
          items: {
            type: "string"
          },
          default: ["*"]
        },
        unbalancedBracketScopes: {
          description: nls.localize("vscode.extension.contributes.grammars.unbalancedBracketScopes", "Defines which scope names do not contain balanced brackets."),
          type: "array",
          items: {
            type: "string"
          },
          default: []
        }
      },
      required: ["scopeName", "path"]
    }
  }
});
export {
  grammarsExtPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0TWF0ZVxcY29tbW9uXFxUTUdyYW1tYXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnksIElFeHRlbnNpb25Qb2ludCB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZXNFeHRQb2ludCB9IGZyb20gJy4uLy4uL2xhbmd1YWdlL2NvbW1vbi9sYW5ndWFnZVNlcnZpY2UuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFbWJlZGRlZExhbmd1YWdlc01hcCB7XG5cdFtzY29wZU5hbWU6IHN0cmluZ106IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUb2tlblR5cGVzQ29udHJpYnV0aW9uIHtcblx0W3Njb3BlTmFtZTogc3RyaW5nXTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUTVN5bnRheEV4dGVuc2lvblBvaW50IHtcblx0bGFuZ3VhZ2U/OiBzdHJpbmc7IC8vIHVuZGVmaW5lZCBpZiB0aGUgZ3JhbW1hciBpcyBvbmx5IGluY2x1ZGVkIGJ5IG90aGVyIGdyYW1tYXJzXG5cdHNjb3BlTmFtZTogc3RyaW5nO1xuXHRwYXRoOiBzdHJpbmc7XG5cdGVtYmVkZGVkTGFuZ3VhZ2VzOiBJRW1iZWRkZWRMYW5ndWFnZXNNYXA7XG5cdHRva2VuVHlwZXM6IFRva2VuVHlwZXNDb250cmlidXRpb247XG5cdGluamVjdFRvOiBzdHJpbmdbXTtcblx0YmFsYW5jZWRCcmFja2V0U2NvcGVzOiBzdHJpbmdbXTtcblx0dW5iYWxhbmNlZEJyYWNrZXRTY29wZXM6IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY29uc3QgZ3JhbW1hcnNFeHRQb2ludDogSUV4dGVuc2lvblBvaW50PElUTVN5bnRheEV4dGVuc2lvblBvaW50W10+ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVRNU3ludGF4RXh0ZW5zaW9uUG9pbnRbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2dyYW1tYXJzJyxcblx0ZGVwczogW2xhbmd1YWdlc0V4dFBvaW50XSxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZ3JhbW1hcnMnLCAnQ29udHJpYnV0ZXMgdGV4dG1hdGUgdG9rZW5pemVycy4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogW3sgbGFuZ3VhZ2U6ICckezE6aWR9Jywgc2NvcGVOYW1lOiAnc291cmNlLiR7MjppZH0nLCBwYXRoOiAnLi9zeW50YXhlcy8kezM6aWR9LnRtTGFuZ3VhZ2UuJyB9XSB9XSxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgbGFuZ3VhZ2U6ICckezE6aWR9Jywgc2NvcGVOYW1lOiAnc291cmNlLiR7MjppZH0nLCBwYXRoOiAnLi9zeW50YXhlcy8kezM6aWR9LnRtTGFuZ3VhZ2UuJyB9IH1dLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRsYW5ndWFnZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZ3JhbW1hcnMubGFuZ3VhZ2UnLCAnTGFuZ3VhZ2UgaWRlbnRpZmllciBmb3Igd2hpY2ggdGhpcyBzeW50YXggaXMgY29udHJpYnV0ZWQgdG8uJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0c2NvcGVOYW1lOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5ncmFtbWFycy5zY29wZU5hbWUnLCAnVGV4dG1hdGUgc2NvcGUgbmFtZSB1c2VkIGJ5IHRoZSB0bUxhbmd1YWdlIGZpbGUuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZ3JhbW1hcnMucGF0aCcsICdQYXRoIG9mIHRoZSB0bUxhbmd1YWdlIGZpbGUuIFRoZSBwYXRoIGlzIHJlbGF0aXZlIHRvIHRoZSBleHRlbnNpb24gZm9sZGVyIGFuZCB0eXBpY2FsbHkgc3RhcnRzIHdpdGggXFwnLi9zeW50YXhlcy9cXCcuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0ZW1iZWRkZWRMYW5ndWFnZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmdyYW1tYXJzLmVtYmVkZGVkTGFuZ3VhZ2VzJywgJ0EgbWFwIG9mIHNjb3BlIG5hbWUgdG8gbGFuZ3VhZ2UgaWQgaWYgdGhpcyBncmFtbWFyIGNvbnRhaW5zIGVtYmVkZGVkIGxhbmd1YWdlcy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0J1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b2tlblR5cGVzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5ncmFtbWFycy50b2tlblR5cGVzJywgJ0EgbWFwIG9mIHNjb3BlIG5hbWUgdG8gdG9rZW4gdHlwZXMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGVudW06IFsnc3RyaW5nJywgJ2NvbW1lbnQnLCAnb3RoZXInLCAncmVnZXgnXVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0aW5qZWN0VG86IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmdyYW1tYXJzLmluamVjdFRvJywgJ0xpc3Qgb2YgbGFuZ3VhZ2Ugc2NvcGUgbmFtZXMgdG8gd2hpY2ggdGhpcyBncmFtbWFyIGlzIGluamVjdGVkIHRvLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRiYWxhbmNlZEJyYWNrZXRTY29wZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmdyYW1tYXJzLmJhbGFuY2VkQnJhY2tldFNjb3BlcycsICdEZWZpbmVzIHdoaWNoIHNjb3BlIG5hbWVzIGNvbnRhaW4gYmFsYW5jZWQgYnJhY2tldHMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlZmF1bHQ6IFsnKiddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR1bmJhbGFuY2VkQnJhY2tldFNjb3Blczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZ3JhbW1hcnMudW5iYWxhbmNlZEJyYWNrZXRTY29wZXMnLCAnRGVmaW5lcyB3aGljaCBzY29wZSBuYW1lcyBkbyBub3QgY29udGFpbiBiYWxhbmNlZCBicmFja2V0cy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogW10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsnc2NvcGVOYW1lJywgJ3BhdGgnXVxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBMkM7QUFDcEQsU0FBUyx5QkFBeUI7QUFxQjNCLE1BQU0sbUJBQStELG1CQUFtQix1QkFBa0Q7QUFBQSxFQUNoSixnQkFBZ0I7QUFBQSxFQUNoQixNQUFNLENBQUMsaUJBQWlCO0FBQUEsRUFDeEIsWUFBWTtBQUFBLElBQ1gsYUFBYSxJQUFJLFNBQVMseUNBQXlDLGtDQUFrQztBQUFBLElBQ3JHLE1BQU07QUFBQSxJQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsVUFBVSxXQUFXLFdBQVcsa0JBQWtCLE1BQU0saUNBQWlDLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDMUgsT0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04saUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsVUFBVSxXQUFXLFdBQVcsa0JBQWtCLE1BQU0saUNBQWlDLEVBQUUsQ0FBQztBQUFBLE1BQ3hILFlBQVk7QUFBQSxRQUNYLFVBQVU7QUFBQSxVQUNULGFBQWEsSUFBSSxTQUFTLGtEQUFrRCw4REFBOEQ7QUFBQSxVQUMxSSxNQUFNO0FBQUEsUUFDUDtBQUFBLFFBQ0EsV0FBVztBQUFBLFVBQ1YsYUFBYSxJQUFJLFNBQVMsbURBQW1ELGtEQUFrRDtBQUFBLFVBQy9ILE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDTCxhQUFhLElBQUksU0FBUyw4Q0FBOEMsb0hBQXNIO0FBQUEsVUFDOUwsTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLG1CQUFtQjtBQUFBLFVBQ2xCLGFBQWEsSUFBSSxTQUFTLDJEQUEyRCxpRkFBaUY7QUFBQSxVQUN0SyxNQUFNO0FBQUEsUUFDUDtBQUFBLFFBQ0EsWUFBWTtBQUFBLFVBQ1gsYUFBYSxJQUFJLFNBQVMsb0RBQW9ELHFDQUFxQztBQUFBLFVBQ25ILE1BQU07QUFBQSxVQUNOLHNCQUFzQjtBQUFBLFlBQ3JCLE1BQU0sQ0FBQyxVQUFVLFdBQVcsU0FBUyxPQUFPO0FBQUEsVUFDN0M7QUFBQSxRQUNEO0FBQUEsUUFDQSxVQUFVO0FBQUEsVUFDVCxhQUFhLElBQUksU0FBUyxrREFBa0Qsb0VBQW9FO0FBQUEsVUFDaEosTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFlBQ04sTUFBTTtBQUFBLFVBQ1A7QUFBQSxRQUNEO0FBQUEsUUFDQSx1QkFBdUI7QUFBQSxVQUN0QixhQUFhLElBQUksU0FBUywrREFBK0Qsc0RBQXNEO0FBQUEsVUFDL0ksTUFBTTtBQUFBLFVBQ04sT0FBTztBQUFBLFlBQ04sTUFBTTtBQUFBLFVBQ1A7QUFBQSxVQUNBLFNBQVMsQ0FBQyxHQUFHO0FBQUEsUUFDZDtBQUFBLFFBQ0EseUJBQXlCO0FBQUEsVUFDeEIsYUFBYSxJQUFJLFNBQVMsaUVBQWlFLDZEQUE2RDtBQUFBLFVBQ3hKLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxZQUNOLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQSxTQUFTLENBQUM7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUFBLE1BQ0EsVUFBVSxDQUFDLGFBQWEsTUFBTTtBQUFBLElBQy9CO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
