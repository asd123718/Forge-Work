import { coalesce } from "../../../../base/common/arrays.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as nls from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { CustomEditorPriority } from "./customEditor.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { languagesExtPoint } from "../../../services/language/common/languageService.js";
const Fields = Object.freeze({
  viewType: "viewType",
  displayName: "displayName",
  selector: "selector",
  priority: "priority"
});
const PriorityFields = Object.freeze({
  textEditor: "textEditor",
  diffEditor: "diffEditor"
});
const customEditorPrioritySchema = {
  type: "string",
  enum: [
    CustomEditorPriority.default,
    CustomEditorPriority.option,
    CustomEditorPriority.explicit
  ],
  markdownEnumDescriptions: [
    nls.localize("contributes.priority.default", "The editor is automatically used when the user opens a resource, provided that no other default custom editors are registered for that resource."),
    nls.localize("contributes.priority.option", "The editor is not automatically used when the user opens a resource, but a user can switch to the editor using the `Reopen With` command."),
    nls.localize("contributes.priority.explicit", "The editor is not automatically used or opted into by an association from another editor mode. It can still be opened using the `Reopen With` command or an association configured specifically for this editor mode.")
  ]
};
const customEditorsContributionSchema = {
  type: "object",
  required: [
    Fields.viewType,
    Fields.displayName,
    Fields.selector
  ],
  additionalProperties: false,
  properties: {
    [Fields.viewType]: {
      type: "string",
      markdownDescription: nls.localize("contributes.viewType", "Identifier for the custom editor. This must be unique across all custom editors, so we recommend including your extension id as part of `viewType`. The `viewType` is used when registering custom editors with `vscode.registerCustomEditorProvider` and in the `onCustomEditor:${id}` [activation event](https://code.visualstudio.com/api/references/activation-events).")
    },
    [Fields.displayName]: {
      type: "string",
      description: nls.localize("contributes.displayName", "Human readable name of the custom editor. This is displayed to users when selecting which editor to use.")
    },
    [Fields.selector]: {
      type: "array",
      description: nls.localize("contributes.selector", "Set of globs that the custom editor is enabled for."),
      items: {
        type: "object",
        defaultSnippets: [{
          body: {
            filenamePattern: "$1"
          }
        }],
        additionalProperties: false,
        properties: {
          filenamePattern: {
            type: "string",
            description: nls.localize("contributes.selector.filenamePattern", "Glob that the custom editor is enabled for.")
          }
        }
      }
    },
    [Fields.priority]: {
      markdownDescription: nls.localize("contributes.priority", "Controls if the custom editor is enabled automatically when the user opens a file or diff editor. This may be overridden by users using the `workbench.editorAssociations` or `workbench.diffEditorAssociations` setting. When omitted, the custom editor defaults to `default` for the normal editor and `explicit` for diff editors, so it is not used for diffs unless it opts in."),
      anyOf: [
        customEditorPrioritySchema,
        {
          type: "object",
          required: [PriorityFields.textEditor],
          additionalProperties: false,
          properties: {
            [PriorityFields.textEditor]: {
              ...customEditorPrioritySchema,
              markdownDescription: nls.localize("contributes.priority.textEditor", "Controls if the custom editor is enabled automatically when the user opens a file. `diffEditor` does not inherit this value; when it is not specified it defaults to `explicit`.")
            },
            [PriorityFields.diffEditor]: {
              ...customEditorPrioritySchema,
              markdownDescription: nls.localize("contributes.priority.diffEditor", "Controls if the custom editor is enabled automatically when the user opens a diff. When not specified this defaults to `explicit`, so the custom editor is not used for diffs unless it opts in.")
            }
          }
        }
      ],
      default: CustomEditorPriority.default
    }
  }
};
const customEditorsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "customEditors",
  deps: [languagesExtPoint],
  jsonSchema: {
    description: nls.localize("contributes.customEditors", "Contributed custom editors."),
    type: "array",
    defaultSnippets: [{
      body: [{
        [Fields.viewType]: "$1",
        [Fields.displayName]: "$2",
        [Fields.selector]: [{
          filenamePattern: "$3"
        }]
      }]
    }],
    items: customEditorsContributionSchema
  },
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      const viewType = contrib[Fields.viewType];
      if (viewType) {
        yield `onCustomEditor:${viewType}`;
      }
    }
  }
});
class CustomEditorsDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.customEditors;
  }
  render(manifest) {
    const customEditors = manifest.contributes?.customEditors || [];
    if (!customEditors.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("customEditors view type", "View Type"),
      nls.localize("customEditors priority", "Priority"),
      nls.localize("customEditors filenamePattern", "Filename Pattern")
    ];
    const rows = customEditors.map((customEditor) => {
      return [
        customEditor.viewType,
        renderPriority(customEditor.priority),
        coalesce(customEditor.selector.map((x) => x.filenamePattern)).join(", ")
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
function renderPriority(priority) {
  if (!priority) {
    return "";
  }
  if (typeof priority === "string") {
    return priority;
  }
  return coalesce([
    priority.textEditor ? `textEditor: ${priority.textEditor}` : void 0,
    priority.diffEditor ? `diffEditor: ${priority.diffEditor}` : void 0
  ]).join(", ");
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "customEditors",
  label: nls.localize("customEditors", "Custom Editors"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(CustomEditorsDataRenderer)
});
export {
  customEditorsExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGN1c3RvbUVkaXRvclxcY29tbW9uXFxleHRlbnNpb25Qb2ludC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFR5cGVGcm9tSnNvblNjaGVtYSwgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ3VzdG9tRWRpdG9yUHJpb3JpdHkgfSBmcm9tICcuL2N1c3RvbUVkaXRvci5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBJUmVuZGVyZWREYXRhLCBJUm93RGF0YSwgSVRhYmxlRGF0YSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZXNFeHRQb2ludCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xhbmd1YWdlL2NvbW1vbi9sYW5ndWFnZVNlcnZpY2UuanMnO1xuXG5jb25zdCBGaWVsZHMgPSBPYmplY3QuZnJlZXplKHtcblx0dmlld1R5cGU6ICd2aWV3VHlwZScsXG5cdGRpc3BsYXlOYW1lOiAnZGlzcGxheU5hbWUnLFxuXHRzZWxlY3RvcjogJ3NlbGVjdG9yJyxcblx0cHJpb3JpdHk6ICdwcmlvcml0eScsXG59KTtcblxuY29uc3QgUHJpb3JpdHlGaWVsZHMgPSBPYmplY3QuZnJlZXplKHtcblx0dGV4dEVkaXRvcjogJ3RleHRFZGl0b3InLFxuXHRkaWZmRWRpdG9yOiAnZGlmZkVkaXRvcicsXG59KTtcblxuY29uc3QgY3VzdG9tRWRpdG9yUHJpb3JpdHlTY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRlbnVtOiBbXG5cdFx0Q3VzdG9tRWRpdG9yUHJpb3JpdHkuZGVmYXVsdCxcblx0XHRDdXN0b21FZGl0b3JQcmlvcml0eS5vcHRpb24sXG5cdFx0Q3VzdG9tRWRpdG9yUHJpb3JpdHkuZXhwbGljaXQsXG5cdF0sXG5cdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJpb3JpdHkuZGVmYXVsdCcsICdUaGUgZWRpdG9yIGlzIGF1dG9tYXRpY2FsbHkgdXNlZCB3aGVuIHRoZSB1c2VyIG9wZW5zIGEgcmVzb3VyY2UsIHByb3ZpZGVkIHRoYXQgbm8gb3RoZXIgZGVmYXVsdCBjdXN0b20gZWRpdG9ycyBhcmUgcmVnaXN0ZXJlZCBmb3IgdGhhdCByZXNvdXJjZS4nKSxcblx0XHRubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByaW9yaXR5Lm9wdGlvbicsICdUaGUgZWRpdG9yIGlzIG5vdCBhdXRvbWF0aWNhbGx5IHVzZWQgd2hlbiB0aGUgdXNlciBvcGVucyBhIHJlc291cmNlLCBidXQgYSB1c2VyIGNhbiBzd2l0Y2ggdG8gdGhlIGVkaXRvciB1c2luZyB0aGUgYFJlb3BlbiBXaXRoYCBjb21tYW5kLicpLFxuXHRcdG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJpb3JpdHkuZXhwbGljaXQnLCAnVGhlIGVkaXRvciBpcyBub3QgYXV0b21hdGljYWxseSB1c2VkIG9yIG9wdGVkIGludG8gYnkgYW4gYXNzb2NpYXRpb24gZnJvbSBhbm90aGVyIGVkaXRvciBtb2RlLiBJdCBjYW4gc3RpbGwgYmUgb3BlbmVkIHVzaW5nIHRoZSBgUmVvcGVuIFdpdGhgIGNvbW1hbmQgb3IgYW4gYXNzb2NpYXRpb24gY29uZmlndXJlZCBzcGVjaWZpY2FsbHkgZm9yIHRoaXMgZWRpdG9yIG1vZGUuJyksXG5cdF0sXG59IGFzIGNvbnN0IHNhdGlzZmllcyBJSlNPTlNjaGVtYTtcblxuY29uc3QgY3VzdG9tRWRpdG9yc0NvbnRyaWJ1dGlvblNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHJlcXVpcmVkOiBbXG5cdFx0RmllbGRzLnZpZXdUeXBlLFxuXHRcdEZpZWxkcy5kaXNwbGF5TmFtZSxcblx0XHRGaWVsZHMuc2VsZWN0b3IsXG5cdF0sXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0cHJvcGVydGllczoge1xuXHRcdFtGaWVsZHMudmlld1R5cGVdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMudmlld1R5cGUnLCAnSWRlbnRpZmllciBmb3IgdGhlIGN1c3RvbSBlZGl0b3IuIFRoaXMgbXVzdCBiZSB1bmlxdWUgYWNyb3NzIGFsbCBjdXN0b20gZWRpdG9ycywgc28gd2UgcmVjb21tZW5kIGluY2x1ZGluZyB5b3VyIGV4dGVuc2lvbiBpZCBhcyBwYXJ0IG9mIGB2aWV3VHlwZWAuIFRoZSBgdmlld1R5cGVgIGlzIHVzZWQgd2hlbiByZWdpc3RlcmluZyBjdXN0b20gZWRpdG9ycyB3aXRoIGB2c2NvZGUucmVnaXN0ZXJDdXN0b21FZGl0b3JQcm92aWRlcmAgYW5kIGluIHRoZSBgb25DdXN0b21FZGl0b3I6JHtpZH1gIFthY3RpdmF0aW9uIGV2ZW50XShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvcmVmZXJlbmNlcy9hY3RpdmF0aW9uLWV2ZW50cykuJyksXG5cdFx0fSxcblx0XHRbRmllbGRzLmRpc3BsYXlOYW1lXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5kaXNwbGF5TmFtZScsICdIdW1hbiByZWFkYWJsZSBuYW1lIG9mIHRoZSBjdXN0b20gZWRpdG9yLiBUaGlzIGlzIGRpc3BsYXllZCB0byB1c2VycyB3aGVuIHNlbGVjdGluZyB3aGljaCBlZGl0b3IgdG8gdXNlLicpLFxuXHRcdH0sXG5cdFx0W0ZpZWxkcy5zZWxlY3Rvcl06IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZWxlY3RvcicsICdTZXQgb2YgZ2xvYnMgdGhhdCB0aGUgY3VzdG9tIGVkaXRvciBpcyBlbmFibGVkIGZvci4nKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdFx0ZmlsZW5hbWVQYXR0ZXJuOiAnJDEnLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGZpbGVuYW1lUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZWxlY3Rvci5maWxlbmFtZVBhdHRlcm4nLCAnR2xvYiB0aGF0IHRoZSBjdXN0b20gZWRpdG9yIGlzIGVuYWJsZWQgZm9yLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdFtGaWVsZHMucHJpb3JpdHldOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByaW9yaXR5JywgJ0NvbnRyb2xzIGlmIHRoZSBjdXN0b20gZWRpdG9yIGlzIGVuYWJsZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB1c2VyIG9wZW5zIGEgZmlsZSBvciBkaWZmIGVkaXRvci4gVGhpcyBtYXkgYmUgb3ZlcnJpZGRlbiBieSB1c2VycyB1c2luZyB0aGUgYHdvcmtiZW5jaC5lZGl0b3JBc3NvY2lhdGlvbnNgIG9yIGB3b3JrYmVuY2guZGlmZkVkaXRvckFzc29jaWF0aW9uc2Agc2V0dGluZy4gV2hlbiBvbWl0dGVkLCB0aGUgY3VzdG9tIGVkaXRvciBkZWZhdWx0cyB0byBgZGVmYXVsdGAgZm9yIHRoZSBub3JtYWwgZWRpdG9yIGFuZCBgZXhwbGljaXRgIGZvciBkaWZmIGVkaXRvcnMsIHNvIGl0IGlzIG5vdCB1c2VkIGZvciBkaWZmcyB1bmxlc3MgaXQgb3B0cyBpbi4nKSxcblx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdGN1c3RvbUVkaXRvclByaW9yaXR5U2NoZW1hLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFtQcmlvcml0eUZpZWxkcy50ZXh0RWRpdG9yXSxcblx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0W1ByaW9yaXR5RmllbGRzLnRleHRFZGl0b3JdOiB7XG5cdFx0XHRcdFx0XHRcdC4uLmN1c3RvbUVkaXRvclByaW9yaXR5U2NoZW1hLFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByaW9yaXR5LnRleHRFZGl0b3InLCAnQ29udHJvbHMgaWYgdGhlIGN1c3RvbSBlZGl0b3IgaXMgZW5hYmxlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHVzZXIgb3BlbnMgYSBmaWxlLiBgZGlmZkVkaXRvcmAgZG9lcyBub3QgaW5oZXJpdCB0aGlzIHZhbHVlOyB3aGVuIGl0IGlzIG5vdCBzcGVjaWZpZWQgaXQgZGVmYXVsdHMgdG8gYGV4cGxpY2l0YC4nKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRbUHJpb3JpdHlGaWVsZHMuZGlmZkVkaXRvcl06IHtcblx0XHRcdFx0XHRcdFx0Li4uY3VzdG9tRWRpdG9yUHJpb3JpdHlTY2hlbWEsXG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJpb3JpdHkuZGlmZkVkaXRvcicsICdDb250cm9scyBpZiB0aGUgY3VzdG9tIGVkaXRvciBpcyBlbmFibGVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdXNlciBvcGVucyBhIGRpZmYuIFdoZW4gbm90IHNwZWNpZmllZCB0aGlzIGRlZmF1bHRzIHRvIGBleHBsaWNpdGAsIHNvIHRoZSBjdXN0b20gZWRpdG9yIGlzIG5vdCB1c2VkIGZvciBkaWZmcyB1bmxlc3MgaXQgb3B0cyBpbi4nKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogQ3VzdG9tRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdH1cblx0fVxufSBhcyBjb25zdCBzYXRpc2ZpZXMgSUpTT05TY2hlbWE7XG5cbmV4cG9ydCB0eXBlIElDdXN0b21FZGl0b3JzRXh0ZW5zaW9uUG9pbnQgPSBUeXBlRnJvbUpzb25TY2hlbWE8dHlwZW9mIGN1c3RvbUVkaXRvcnNDb250cmlidXRpb25TY2hlbWE+O1xuXG5leHBvcnQgY29uc3QgY3VzdG9tRWRpdG9yc0V4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SUN1c3RvbUVkaXRvcnNFeHRlbnNpb25Qb2ludFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnY3VzdG9tRWRpdG9ycycsXG5cdGRlcHM6IFtsYW5ndWFnZXNFeHRQb2ludF0sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5jdXN0b21FZGl0b3JzJywgJ0NvbnRyaWJ1dGVkIGN1c3RvbSBlZGl0b3JzLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbe1xuXHRcdFx0Ym9keTogW3tcblx0XHRcdFx0W0ZpZWxkcy52aWV3VHlwZV06ICckMScsXG5cdFx0XHRcdFtGaWVsZHMuZGlzcGxheU5hbWVdOiAnJDInLFxuXHRcdFx0XHRbRmllbGRzLnNlbGVjdG9yXTogW3tcblx0XHRcdFx0XHRmaWxlbmFtZVBhdHRlcm46ICckMydcblx0XHRcdFx0fV0sXG5cdFx0XHR9XVxuXHRcdH1dLFxuXHRcdGl0ZW1zOiBjdXN0b21FZGl0b3JzQ29udHJpYnV0aW9uU2NoZW1hXG5cdH0sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnM6IHJlYWRvbmx5IElDdXN0b21FZGl0b3JzRXh0ZW5zaW9uUG9pbnRbXSkge1xuXHRcdGZvciAoY29uc3QgY29udHJpYiBvZiBjb250cmlicykge1xuXHRcdFx0Y29uc3Qgdmlld1R5cGUgPSBjb250cmliW0ZpZWxkcy52aWV3VHlwZV07XG5cdFx0XHRpZiAodmlld1R5cGUpIHtcblx0XHRcdFx0eWllbGQgYG9uQ3VzdG9tRWRpdG9yOiR7dmlld1R5cGV9YDtcblx0XHRcdH1cblx0XHR9XG5cdH0sXG59KTtcblxuY2xhc3MgQ3VzdG9tRWRpdG9yc0RhdGFSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/LmN1c3RvbUVkaXRvcnM7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IGN1c3RvbUVkaXRvcnMgPSBtYW5pZmVzdC5jb250cmlidXRlcz8uY3VzdG9tRWRpdG9ycyB8fCBbXTtcblx0XHRpZiAoIWN1c3RvbUVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiB7IGhlYWRlcnM6IFtdLCByb3dzOiBbXSB9LCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJzID0gW1xuXHRcdFx0bmxzLmxvY2FsaXplKCdjdXN0b21FZGl0b3JzIHZpZXcgdHlwZScsIFwiVmlldyBUeXBlXCIpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdjdXN0b21FZGl0b3JzIHByaW9yaXR5JywgXCJQcmlvcml0eVwiKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnY3VzdG9tRWRpdG9ycyBmaWxlbmFtZVBhdHRlcm4nLCBcIkZpbGVuYW1lIFBhdHRlcm5cIiksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJvd3M6IElSb3dEYXRhW11bXSA9IGN1c3RvbUVkaXRvcnNcblx0XHRcdC5tYXAoY3VzdG9tRWRpdG9yID0+IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRjdXN0b21FZGl0b3Iudmlld1R5cGUsXG5cdFx0XHRcdFx0cmVuZGVyUHJpb3JpdHkoY3VzdG9tRWRpdG9yLnByaW9yaXR5KSxcblx0XHRcdFx0XHRjb2FsZXNjZShjdXN0b21FZGl0b3Iuc2VsZWN0b3IubWFwKHggPT4geC5maWxlbmFtZVBhdHRlcm4pKS5qb2luKCcsICcpXG5cdFx0XHRcdF07XG5cdFx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdHJvd3Ncblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbmRlclByaW9yaXR5KHByaW9yaXR5OiBJQ3VzdG9tRWRpdG9yc0V4dGVuc2lvblBvaW50Wydwcmlvcml0eSddIHwgc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0aWYgKCFwcmlvcml0eSkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRpZiAodHlwZW9mIHByaW9yaXR5ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBwcmlvcml0eTtcblx0fVxuXHRyZXR1cm4gY29hbGVzY2UoW1xuXHRcdHByaW9yaXR5LnRleHRFZGl0b3IgPyBgdGV4dEVkaXRvcjogJHtwcmlvcml0eS50ZXh0RWRpdG9yfWAgOiB1bmRlZmluZWQsXG5cdFx0cHJpb3JpdHkuZGlmZkVkaXRvciA/IGBkaWZmRWRpdG9yOiAke3ByaW9yaXR5LmRpZmZFZGl0b3J9YCA6IHVuZGVmaW5lZCxcblx0XSkuam9pbignLCAnKTtcbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdjdXN0b21FZGl0b3JzJyxcblx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY3VzdG9tRWRpdG9ycycsIFwiQ3VzdG9tIEVkaXRvcnNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihDdXN0b21FZGl0b3JzRGF0YVJlbmRlcmVyKSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxTQUFTO0FBRXJCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsa0JBQW1IO0FBQzVILFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBRWxDLE1BQU0sU0FBUyxPQUFPLE9BQU87QUFBQSxFQUM1QixVQUFVO0FBQUEsRUFDVixhQUFhO0FBQUEsRUFDYixVQUFVO0FBQUEsRUFDVixVQUFVO0FBQ1gsQ0FBQztBQUVELE1BQU0saUJBQWlCLE9BQU8sT0FBTztBQUFBLEVBQ3BDLFlBQVk7QUFBQSxFQUNaLFlBQVk7QUFDYixDQUFDO0FBRUQsTUFBTSw2QkFBNkI7QUFBQSxFQUNsQyxNQUFNO0FBQUEsRUFDTixNQUFNO0FBQUEsSUFDTCxxQkFBcUI7QUFBQSxJQUNyQixxQkFBcUI7QUFBQSxJQUNyQixxQkFBcUI7QUFBQSxFQUN0QjtBQUFBLEVBQ0Es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
