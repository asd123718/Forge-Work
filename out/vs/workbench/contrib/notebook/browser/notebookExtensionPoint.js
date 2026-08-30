import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { NotebookEditorPriority } from "../common/notebookCommon.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const NotebookEditorContribution = Object.freeze({
  type: "type",
  displayName: "displayName",
  selector: "selector",
  priority: "priority"
});
const NotebookRendererContribution = Object.freeze({
  id: "id",
  displayName: "displayName",
  mimeTypes: "mimeTypes",
  entrypoint: "entrypoint",
  hardDependencies: "dependencies",
  optionalDependencies: "optionalDependencies",
  requiresMessaging: "requiresMessaging"
});
const NotebookPreloadContribution = Object.freeze({
  type: "type",
  entrypoint: "entrypoint",
  localResourceRoots: "localResourceRoots"
});
const notebookProviderContribution = {
  description: nls.localize("contributes.notebook.provider", "Contributes notebook document provider."),
  type: "array",
  defaultSnippets: [{ body: [{ type: "", displayName: "", "selector": [{ "filenamePattern": "" }] }] }],
  items: {
    type: "object",
    required: [
      NotebookEditorContribution.type,
      NotebookEditorContribution.displayName,
      NotebookEditorContribution.selector
    ],
    properties: {
      [NotebookEditorContribution.type]: {
        type: "string",
        description: nls.localize("contributes.notebook.provider.viewType", "Type of the notebook.")
      },
      [NotebookEditorContribution.displayName]: {
        type: "string",
        description: nls.localize("contributes.notebook.provider.displayName", "Human readable name of the notebook.")
      },
      [NotebookEditorContribution.selector]: {
        type: "array",
        description: nls.localize("contributes.notebook.provider.selector", "Set of globs that the notebook is for."),
        items: {
          type: "object",
          properties: {
            filenamePattern: {
              type: "string",
              description: nls.localize("contributes.notebook.provider.selector.filenamePattern", "Glob that the notebook is enabled for.")
            },
            excludeFileNamePattern: {
              type: "string",
              description: nls.localize("contributes.notebook.selector.provider.excludeFileNamePattern", "Glob that the notebook is disabled for.")
            }
          }
        }
      },
      [NotebookEditorContribution.priority]: {
        type: "string",
        markdownDeprecationMessage: nls.localize("contributes.priority", "Controls if the custom editor is enabled automatically when the user opens a file. This may be overridden by users using the `workbench.editorAssociations` setting."),
        enum: [
          NotebookEditorPriority.default,
          NotebookEditorPriority.option
        ],
        markdownEnumDescriptions: [
          nls.localize("contributes.priority.default", "The editor is automatically used when the user opens a resource, provided that no other default custom editors are registered for that resource."),
          nls.localize("contributes.priority.option", "The editor is not automatically used when the user opens a resource, but a user can switch to the editor using the `Reopen With` command.")
        ],
        default: "default"
      }
    }
  }
};
const defaultRendererSnippet = Object.freeze({ id: "", displayName: "", mimeTypes: [""], entrypoint: "" });
const notebookRendererContribution = {
  description: nls.localize("contributes.notebook.renderer", "Contributes notebook output renderer provider."),
  type: "array",
  defaultSnippets: [{ body: [defaultRendererSnippet] }],
  items: {
    defaultSnippets: [{ body: defaultRendererSnippet }],
    allOf: [
      {
        type: "object",
        required: [
          NotebookRendererContribution.id,
          NotebookRendererContribution.displayName
        ],
        properties: {
          [NotebookRendererContribution.id]: {
            type: "string",
            description: nls.localize("contributes.notebook.renderer.viewType", "Unique identifier of the notebook output renderer.")
          },
          [NotebookRendererContribution.displayName]: {
            type: "string",
            description: nls.localize("contributes.notebook.renderer.displayName", "Human readable name of the notebook output renderer.")
          },
          [NotebookRendererContribution.hardDependencies]: {
            type: "array",
            uniqueItems: true,
            items: { type: "string" },
            markdownDescription: nls.localize("contributes.notebook.renderer.hardDependencies", "List of kernel dependencies the renderer requires. If any of the dependencies are present in the `NotebookKernel.preloads`, the renderer can be used.")
          },
          [NotebookRendererContribution.optionalDependencies]: {
            type: "array",
            uniqueItems: true,
            items: { type: "string" },
            markdownDescription: nls.localize("contributes.notebook.renderer.optionalDependencies", "List of soft kernel dependencies the renderer can make use of. If any of the dependencies are present in the `NotebookKernel.preloads`, the renderer will be preferred over renderers that don't interact with the kernel.")
          },
          [NotebookRendererContribution.requiresMessaging]: {
            default: "never",
            enum: [
              "always",
              "optional",
              "never"
            ],
            enumDescriptions: [
              nls.localize("contributes.notebook.renderer.requiresMessaging.always", "Messaging is required. The renderer will only be used when it's part of an extension that can be run in an extension host."),
              nls.localize("contributes.notebook.renderer.requiresMessaging.optional", "The renderer is better with messaging available, but it's not required."),
              nls.localize("contributes.notebook.renderer.requiresMessaging.never", "The renderer does not require messaging.")
            ],
            description: nls.localize("contributes.notebook.renderer.requiresMessaging", "Defines how and if the renderer needs to communicate with an extension host, via `createRendererMessaging`. Renderers with stronger messaging requirements may not work in all environments.")
          }
        }
      },
      {
        oneOf: [
          {
            required: [
              NotebookRendererContribution.entrypoint,
              NotebookRendererContribution.mimeTypes
            ],
            properties: {
              [NotebookRendererContribution.mimeTypes]: {
                type: "array",
                description: nls.localize("contributes.notebook.selector", "Set of globs that the notebook is for."),
                items: {
                  type: "string"
                }
              },
              [NotebookRendererContribution.entrypoint]: {
                description: nls.localize("contributes.notebook.renderer.entrypoint", "File to load in the webview to render the extension."),
                type: "string"
              }
            }
          },
          {
            required: [
              NotebookRendererContribution.entrypoint
            ],
            properties: {
              [NotebookRendererContribution.entrypoint]: {
                description: nls.localize("contributes.notebook.renderer.entrypoint", "File to load in the webview to render the extension."),
                type: "object",
                required: ["extends", "path"],
                properties: {
                  extends: {
                    type: "string",
                    description: nls.localize("contributes.notebook.renderer.entrypoint.extends", "Existing renderer that this one extends.")
                  },
                  path: {
                    type: "string",
                    description: nls.localize("contributes.notebook.renderer.entrypoint", "File to load in the webview to render the extension.")
                  }
                }
              }
            }
          }
        ]
      }
    ]
  }
};
const notebookPreloadContribution = {
  description: nls.localize("contributes.preload.provider", "Contributes notebook preloads."),
  type: "array",
  defaultSnippets: [{ body: [{ type: "", entrypoint: "" }] }],
  items: {
    type: "object",
    required: [
      NotebookPreloadContribution.type,
      NotebookPreloadContribution.entrypoint
    ],
    properties: {
      [NotebookPreloadContribution.type]: {
        type: "string",
        description: nls.localize("contributes.preload.provider.viewType", "Type of the notebook.")
      },
      [NotebookPreloadContribution.entrypoint]: {
        type: "string",
        description: nls.localize("contributes.preload.entrypoint", "Path to file loaded in the webview.")
      },
      [NotebookPreloadContribution.localResourceRoots]: {
        type: "array",
        items: { type: "string" },
        description: nls.localize("contributes.preload.localResourceRoots", "Paths to additional resources that should be allowed in the webview.")
      }
    }
  }
};
const notebooksExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "notebooks",
  jsonSchema: notebookProviderContribution,
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      if (contrib.type) {
        yield `onNotebookSerializer:${contrib.type}`;
      }
    }
  }
});
const notebookRendererExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "notebookRenderer",
  jsonSchema: notebookRendererContribution,
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      if (contrib.id) {
        yield `onRenderer:${contrib.id}`;
      }
    }
  }
});
const notebookPreloadExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "notebookPreload",
  jsonSchema: notebookPreloadContribution
});
class NotebooksDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.notebooks;
  }
  render(manifest) {
    const contrib = manifest.contributes?.notebooks || [];
    if (!contrib.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("Notebook id", "ID"),
      nls.localize("Notebook name", "Name")
    ];
    const rows = contrib.sort((a, b) => a.type.localeCompare(b.type)).map((notebook) => {
      return [
        notebook.type,
        notebook.displayName
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
class NotebookRenderersDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.notebookRenderer;
  }
  render(manifest) {
    const contrib = manifest.contributes?.notebookRenderer || [];
    if (!contrib.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("Notebook renderer name", "Name"),
      nls.localize("Notebook mimetypes", "Mimetypes")
    ];
    const rows = contrib.sort((a, b) => a.displayName.localeCompare(b.displayName)).map((notebookRenderer) => {
      return [
        notebookRenderer.displayName,
        notebookRenderer.mimeTypes.join(",")
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
  id: "notebooks",
  label: nls.localize("notebooks", "Notebooks"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(NotebooksDataRenderer)
});
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "notebookRenderer",
  label: nls.localize("notebookRenderer", "Notebook Renderers"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(NotebookRenderersDataRenderer)
});
export {
  notebookPreloadExtensionPoint,
  notebookRendererExtensionPoint,
  notebooksExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxub3RlYm9va0V4dGVuc2lvblBvaW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yUHJpb3JpdHksIENvbnRyaWJ1dGVkTm90ZWJvb2tSZW5kZXJlckVudHJ5cG9pbnQsIFJlbmRlcmVyTWVzc2FnaW5nU3BlYyB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElSZW5kZXJlZERhdGEsIElUYWJsZURhdGEsIElSb3dEYXRhLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcblxuY29uc3QgTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24gPSBPYmplY3QuZnJlZXplKHtcblx0dHlwZTogJ3R5cGUnLFxuXHRkaXNwbGF5TmFtZTogJ2Rpc3BsYXlOYW1lJyxcblx0c2VsZWN0b3I6ICdzZWxlY3RvcicsXG5cdHByaW9yaXR5OiAncHJpb3JpdHknLFxufSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cmVhZG9ubHkgW05vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLnR5cGVdOiBzdHJpbmc7XG5cdHJlYWRvbmx5IFtOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbi5kaXNwbGF5TmFtZV06IHN0cmluZztcblx0cmVhZG9ubHkgW05vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLnNlbGVjdG9yXT86IHJlYWRvbmx5IHsgZmlsZW5hbWVQYXR0ZXJuPzogc3RyaW5nOyBleGNsdWRlRmlsZU5hbWVQYXR0ZXJuPzogc3RyaW5nIH1bXTtcblx0cmVhZG9ubHkgW05vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLnByaW9yaXR5XT86IHN0cmluZztcbn1cblxuY29uc3QgTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbiA9IE9iamVjdC5mcmVlemUoe1xuXHRpZDogJ2lkJyxcblx0ZGlzcGxheU5hbWU6ICdkaXNwbGF5TmFtZScsXG5cdG1pbWVUeXBlczogJ21pbWVUeXBlcycsXG5cdGVudHJ5cG9pbnQ6ICdlbnRyeXBvaW50Jyxcblx0aGFyZERlcGVuZGVuY2llczogJ2RlcGVuZGVuY2llcycsXG5cdG9wdGlvbmFsRGVwZW5kZW5jaWVzOiAnb3B0aW9uYWxEZXBlbmRlbmNpZXMnLFxuXHRyZXF1aXJlc01lc3NhZ2luZzogJ3JlcXVpcmVzTWVzc2FnaW5nJyxcbn0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uIHtcblx0cmVhZG9ubHkgW05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uaWRdPzogc3RyaW5nO1xuXHRyZWFkb25seSBbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5kaXNwbGF5TmFtZV06IHN0cmluZztcblx0cmVhZG9ubHkgW05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24ubWltZVR5cGVzXT86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5lbnRyeXBvaW50XTogQ29udHJpYnV0ZWROb3RlYm9va1JlbmRlcmVyRW50cnlwb2ludDtcblx0cmVhZG9ubHkgW05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uaGFyZERlcGVuZGVuY2llc106IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5vcHRpb25hbERlcGVuZGVuY2llc106IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5yZXF1aXJlc01lc3NhZ2luZ106IFJlbmRlcmVyTWVzc2FnaW5nU3BlYztcbn1cblxuY29uc3QgTm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uID0gT2JqZWN0LmZyZWV6ZSh7XG5cdHR5cGU6ICd0eXBlJyxcblx0ZW50cnlwb2ludDogJ2VudHJ5cG9pbnQnLFxuXHRsb2NhbFJlc291cmNlUm9vdHM6ICdsb2NhbFJlc291cmNlUm9vdHMnLFxufSk7XG5cbmludGVyZmFjZSBJTm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uIHtcblx0cmVhZG9ubHkgW05vdGVib29rUHJlbG9hZENvbnRyaWJ1dGlvbi50eXBlXTogc3RyaW5nO1xuXHRyZWFkb25seSBbTm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uLmVudHJ5cG9pbnRdOiBzdHJpbmc7XG5cdHJlYWRvbmx5IFtOb3RlYm9va1ByZWxvYWRDb250cmlidXRpb24ubG9jYWxSZXNvdXJjZVJvb3RzXTogcmVhZG9ubHkgc3RyaW5nW107XG59XG5cbmNvbnN0IG5vdGVib29rUHJvdmlkZXJDb250cmlidXRpb246IElKU09OU2NoZW1hID0ge1xuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5wcm92aWRlcicsICdDb250cmlidXRlcyBub3RlYm9vayBkb2N1bWVudCBwcm92aWRlci4nKSxcblx0dHlwZTogJ2FycmF5Jyxcblx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiBbeyB0eXBlOiAnJywgZGlzcGxheU5hbWU6ICcnLCAnc2VsZWN0b3InOiBbeyAnZmlsZW5hbWVQYXR0ZXJuJzogJycgfV0gfV0gfV0sXG5cdGl0ZW1zOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cmVxdWlyZWQ6IFtcblx0XHRcdE5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLnR5cGUsXG5cdFx0XHROb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdE5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLnNlbGVjdG9yLFxuXHRcdF0sXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0W05vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLnR5cGVdOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5wcm92aWRlci52aWV3VHlwZScsICdUeXBlIG9mIHRoZSBub3RlYm9vay4nKSxcblx0XHRcdH0sXG5cdFx0XHRbTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24uZGlzcGxheU5hbWVdOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5wcm92aWRlci5kaXNwbGF5TmFtZScsICdIdW1hbiByZWFkYWJsZSBuYW1lIG9mIHRoZSBub3RlYm9vay4nKSxcblx0XHRcdH0sXG5cdFx0XHRbTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24uc2VsZWN0b3JdOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnByb3ZpZGVyLnNlbGVjdG9yJywgJ1NldCBvZiBnbG9icyB0aGF0IHRoZSBub3RlYm9vayBpcyBmb3IuJyksXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0ZmlsZW5hbWVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5wcm92aWRlci5zZWxlY3Rvci5maWxlbmFtZVBhdHRlcm4nLCAnR2xvYiB0aGF0IHRoZSBub3RlYm9vayBpcyBlbmFibGVkIGZvci4nKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRleGNsdWRlRmlsZU5hbWVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5zZWxlY3Rvci5wcm92aWRlci5leGNsdWRlRmlsZU5hbWVQYXR0ZXJuJywgJ0dsb2IgdGhhdCB0aGUgbm90ZWJvb2sgaXMgZGlzYWJsZWQgZm9yLicpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0W05vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLnByaW9yaXR5XToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0bWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJpb3JpdHknLCAnQ29udHJvbHMgaWYgdGhlIGN1c3RvbSBlZGl0b3IgaXMgZW5hYmxlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHVzZXIgb3BlbnMgYSBmaWxlLiBUaGlzIG1heSBiZSBvdmVycmlkZGVuIGJ5IHVzZXJzIHVzaW5nIHRoZSBgd29ya2JlbmNoLmVkaXRvckFzc29jaWF0aW9uc2Agc2V0dGluZy4nKSxcblx0XHRcdFx0ZW51bTogW1xuXHRcdFx0XHRcdE5vdGVib29rRWRpdG9yUHJpb3JpdHkuZGVmYXVsdCxcblx0XHRcdFx0XHROb3RlYm9va0VkaXRvclByaW9yaXR5Lm9wdGlvbixcblx0XHRcdFx0XSxcblx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5wcmlvcml0eS5kZWZhdWx0JywgJ1RoZSBlZGl0b3IgaXMgYXV0b21hdGljYWxseSB1c2VkIHdoZW4gdGhlIHVzZXIgb3BlbnMgYSByZXNvdXJjZSwgcHJvdmlkZWQgdGhhdCBubyBvdGhlciBkZWZhdWx0IGN1c3RvbSBlZGl0b3JzIGFyZSByZWdpc3RlcmVkIGZvciB0aGF0IHJlc291cmNlLicpLFxuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJpb3JpdHkub3B0aW9uJywgJ1RoZSBlZGl0b3IgaXMgbm90IGF1dG9tYXRpY2FsbHkgdXNlZCB3aGVuIHRoZSB1c2VyIG9wZW5zIGEgcmVzb3VyY2UsIGJ1dCBhIHVzZXIgY2FuIHN3aXRjaCB0byB0aGUgZWRpdG9yIHVzaW5nIHRoZSBgUmVvcGVuIFdpdGhgIGNvbW1hbmQuJyksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0J1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufTtcblxuY29uc3QgZGVmYXVsdFJlbmRlcmVyU25pcHBldCA9IE9iamVjdC5mcmVlemUoeyBpZDogJycsIGRpc3BsYXlOYW1lOiAnJywgbWltZVR5cGVzOiBbJyddLCBlbnRyeXBvaW50OiAnJyB9KTtcblxuY29uc3Qgbm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbjogSUpTT05TY2hlbWEgPSB7XG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnJlbmRlcmVyJywgJ0NvbnRyaWJ1dGVzIG5vdGVib29rIG91dHB1dCByZW5kZXJlciBwcm92aWRlci4nKSxcblx0dHlwZTogJ2FycmF5Jyxcblx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiBbZGVmYXVsdFJlbmRlcmVyU25pcHBldF0gfV0sXG5cdGl0ZW1zOiB7XG5cdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiBkZWZhdWx0UmVuZGVyZXJTbmlwcGV0IH1dLFxuXHRcdGFsbE9mOiBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRyZXF1aXJlZDogW1xuXHRcdFx0XHRcdE5vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uaWQsXG5cdFx0XHRcdFx0Tm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFtOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLmlkXToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci52aWV3VHlwZScsICdVbmlxdWUgaWRlbnRpZmllciBvZiB0aGUgbm90ZWJvb2sgb3V0cHV0IHJlbmRlcmVyLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0W05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uZGlzcGxheU5hbWVdOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnJlbmRlcmVyLmRpc3BsYXlOYW1lJywgJ0h1bWFuIHJlYWRhYmxlIG5hbWUgb2YgdGhlIG5vdGVib29rIG91dHB1dCByZW5kZXJlci4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFtOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLmhhcmREZXBlbmRlbmNpZXNdOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0dW5pcXVlSXRlbXM6IHRydWUsXG5cdFx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5oYXJkRGVwZW5kZW5jaWVzJywgJ0xpc3Qgb2Yga2VybmVsIGRlcGVuZGVuY2llcyB0aGUgcmVuZGVyZXIgcmVxdWlyZXMuIElmIGFueSBvZiB0aGUgZGVwZW5kZW5jaWVzIGFyZSBwcmVzZW50IGluIHRoZSBgTm90ZWJvb2tLZXJuZWwucHJlbG9hZHNgLCB0aGUgcmVuZGVyZXIgY2FuIGJlIHVzZWQuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5vcHRpb25hbERlcGVuZGVuY2llc106IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHR1bmlxdWVJdGVtczogdHJ1ZSxcblx0XHRcdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnJlbmRlcmVyLm9wdGlvbmFsRGVwZW5kZW5jaWVzJywgJ0xpc3Qgb2Ygc29mdCBrZXJuZWwgZGVwZW5kZW5jaWVzIHRoZSByZW5kZXJlciBjYW4gbWFrZSB1c2Ugb2YuIElmIGFueSBvZiB0aGUgZGVwZW5kZW5jaWVzIGFyZSBwcmVzZW50IGluIHRoZSBgTm90ZWJvb2tLZXJuZWwucHJlbG9hZHNgLCB0aGUgcmVuZGVyZXIgd2lsbCBiZSBwcmVmZXJyZWQgb3ZlciByZW5kZXJlcnMgdGhhdCBkb25cXCd0IGludGVyYWN0IHdpdGggdGhlIGtlcm5lbC4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFtOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLnJlcXVpcmVzTWVzc2FnaW5nXToge1xuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJ25ldmVyJyxcblx0XHRcdFx0XHRcdGVudW06IFtcblx0XHRcdFx0XHRcdFx0J2Fsd2F5cycsXG5cdFx0XHRcdFx0XHRcdCdvcHRpb25hbCcsXG5cdFx0XHRcdFx0XHRcdCduZXZlcicsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnJlbmRlcmVyLnJlcXVpcmVzTWVzc2FnaW5nLmFsd2F5cycsICdNZXNzYWdpbmcgaXMgcmVxdWlyZWQuIFRoZSByZW5kZXJlciB3aWxsIG9ubHkgYmUgdXNlZCB3aGVuIGl0XFwncyBwYXJ0IG9mIGFuIGV4dGVuc2lvbiB0aGF0IGNhbiBiZSBydW4gaW4gYW4gZXh0ZW5zaW9uIGhvc3QuJyksXG5cdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucmVuZGVyZXIucmVxdWlyZXNNZXNzYWdpbmcub3B0aW9uYWwnLCAnVGhlIHJlbmRlcmVyIGlzIGJldHRlciB3aXRoIG1lc3NhZ2luZyBhdmFpbGFibGUsIGJ1dCBpdFxcJ3Mgbm90IHJlcXVpcmVkLicpLFxuXHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnJlbmRlcmVyLnJlcXVpcmVzTWVzc2FnaW5nLm5ldmVyJywgJ1RoZSByZW5kZXJlciBkb2VzIG5vdCByZXF1aXJlIG1lc3NhZ2luZy4nKSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5yZXF1aXJlc01lc3NhZ2luZycsICdEZWZpbmVzIGhvdyBhbmQgaWYgdGhlIHJlbmRlcmVyIG5lZWRzIHRvIGNvbW11bmljYXRlIHdpdGggYW4gZXh0ZW5zaW9uIGhvc3QsIHZpYSBgY3JlYXRlUmVuZGVyZXJNZXNzYWdpbmdgLiBSZW5kZXJlcnMgd2l0aCBzdHJvbmdlciBtZXNzYWdpbmcgcmVxdWlyZW1lbnRzIG1heSBub3Qgd29yayBpbiBhbGwgZW52aXJvbm1lbnRzLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFtcblx0XHRcdFx0XHRcdFx0Tm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5lbnRyeXBvaW50LFxuXHRcdFx0XHRcdFx0XHROb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLm1pbWVUeXBlcyxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFtOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLm1pbWVUeXBlc106IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnNlbGVjdG9yJywgJ1NldCBvZiBnbG9icyB0aGF0IHRoZSBub3RlYm9vayBpcyBmb3IuJyksXG5cdFx0XHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5lbnRyeXBvaW50XToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnJlbmRlcmVyLmVudHJ5cG9pbnQnLCAnRmlsZSB0byBsb2FkIGluIHRoZSB3ZWJ2aWV3IHRvIHJlbmRlciB0aGUgZXh0ZW5zaW9uLicpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFtcblx0XHRcdFx0XHRcdFx0Tm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5lbnRyeXBvaW50LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0W05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uZW50cnlwb2ludF06IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5lbnRyeXBvaW50JywgJ0ZpbGUgdG8gbG9hZCBpbiB0aGUgd2VidmlldyB0byByZW5kZXIgdGhlIGV4dGVuc2lvbi4nKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydleHRlbmRzJywgJ3BhdGgnXSxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRleHRlbmRzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5lbnRyeXBvaW50LmV4dGVuZHMnLCAnRXhpc3RpbmcgcmVuZGVyZXIgdGhhdCB0aGlzIG9uZSBleHRlbmRzLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnJlbmRlcmVyLmVudHJ5cG9pbnQnLCAnRmlsZSB0byBsb2FkIGluIHRoZSB3ZWJ2aWV3IHRvIHJlbmRlciB0aGUgZXh0ZW5zaW9uLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59O1xuXG5jb25zdCBub3RlYm9va1ByZWxvYWRDb250cmlidXRpb246IElKU09OU2NoZW1hID0ge1xuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5wcmVsb2FkLnByb3ZpZGVyJywgJ0NvbnRyaWJ1dGVzIG5vdGVib29rIHByZWxvYWRzLicpLFxuXHR0eXBlOiAnYXJyYXknLFxuXHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IFt7IHR5cGU6ICcnLCBlbnRyeXBvaW50OiAnJyB9XSB9XSxcblx0aXRlbXM6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRyZXF1aXJlZDogW1xuXHRcdFx0Tm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uLnR5cGUsXG5cdFx0XHROb3RlYm9va1ByZWxvYWRDb250cmlidXRpb24uZW50cnlwb2ludFxuXHRcdF0sXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0W05vdGVib29rUHJlbG9hZENvbnRyaWJ1dGlvbi50eXBlXToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJlbG9hZC5wcm92aWRlci52aWV3VHlwZScsICdUeXBlIG9mIHRoZSBub3RlYm9vay4nKSxcblx0XHRcdH0sXG5cdFx0XHRbTm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uLmVudHJ5cG9pbnRdOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5wcmVsb2FkLmVudHJ5cG9pbnQnLCAnUGF0aCB0byBmaWxlIGxvYWRlZCBpbiB0aGUgd2Vidmlldy4nKSxcblx0XHRcdH0sXG5cdFx0XHRbTm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uLmxvY2FsUmVzb3VyY2VSb290c106IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJlbG9hZC5sb2NhbFJlc291cmNlUm9vdHMnLCAnUGF0aHMgdG8gYWRkaXRpb25hbCByZXNvdXJjZXMgdGhhdCBzaG91bGQgYmUgYWxsb3dlZCBpbiB0aGUgd2Vidmlldy4nKSxcblx0XHRcdH0sXG5cdFx0fVxuXHR9XG59O1xuXG5leHBvcnQgY29uc3Qgbm90ZWJvb2tzRXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb25bXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ25vdGVib29rcycsXG5cdGpzb25TY2hlbWE6IG5vdGVib29rUHJvdmlkZXJDb250cmlidXRpb24sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnM6IHJlYWRvbmx5IElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbltdKSB7XG5cdFx0Zm9yIChjb25zdCBjb250cmliIG9mIGNvbnRyaWJzKSB7XG5cdFx0XHRpZiAoY29udHJpYi50eXBlKSB7XG5cdFx0XHRcdHlpZWxkIGBvbk5vdGVib29rU2VyaWFsaXplcjoke2NvbnRyaWIudHlwZX1gO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBub3RlYm9va1JlbmRlcmVyRXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbltdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnbm90ZWJvb2tSZW5kZXJlcicsXG5cdGpzb25TY2hlbWE6IG5vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnM6IHJlYWRvbmx5IElOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uW10pIHtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgY29udHJpYnMpIHtcblx0XHRcdGlmIChjb250cmliLmlkKSB7XG5cdFx0XHRcdHlpZWxkIGBvblJlbmRlcmVyOiR7Y29udHJpYi5pZH1gO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBub3RlYm9va1ByZWxvYWRFeHRlbnNpb25Qb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElOb3RlYm9va1ByZWxvYWRDb250cmlidXRpb25bXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ25vdGVib29rUHJlbG9hZCcsXG5cdGpzb25TY2hlbWE6IG5vdGVib29rUHJlbG9hZENvbnRyaWJ1dGlvbixcbn0pO1xuXG5jbGFzcyBOb3RlYm9va3NEYXRhUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3RhYmxlJztcblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5ub3RlYm9va3M7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IGNvbnRyaWIgPSBtYW5pZmVzdC5jb250cmlidXRlcz8ubm90ZWJvb2tzIHx8IFtdO1xuXHRcdGlmICghY29udHJpYi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IHsgaGVhZGVyczogW10sIHJvd3M6IFtdIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBbXG5cdFx0XHRubHMubG9jYWxpemUoJ05vdGVib29rIGlkJywgXCJJRFwiKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnTm90ZWJvb2sgbmFtZScsIFwiTmFtZVwiKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gY29udHJpYlxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEudHlwZS5sb2NhbGVDb21wYXJlKGIudHlwZSkpXG5cdFx0XHQubWFwKG5vdGVib29rID0+IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRub3RlYm9vay50eXBlLFxuXHRcdFx0XHRcdG5vdGVib29rLmRpc3BsYXlOYW1lXG5cdFx0XHRcdF07XG5cdFx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdHJvd3Ncblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rUmVuZGVyZXJzRGF0YVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8ubm90ZWJvb2tSZW5kZXJlcjtcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29udHJpYiA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5ub3RlYm9va1JlbmRlcmVyIHx8IFtdO1xuXHRcdGlmICghY29udHJpYi5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IHsgaGVhZGVyczogW10sIHJvd3M6IFtdIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBbXG5cdFx0XHRubHMubG9jYWxpemUoJ05vdGVib29rIHJlbmRlcmVyIG5hbWUnLCBcIk5hbWVcIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ05vdGVib29rIG1pbWV0eXBlcycsIFwiTWltZXR5cGVzXCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBjb250cmliXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYS5kaXNwbGF5TmFtZS5sb2NhbGVDb21wYXJlKGIuZGlzcGxheU5hbWUpKVxuXHRcdFx0Lm1hcChub3RlYm9va1JlbmRlcmVyID0+IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRub3RlYm9va1JlbmRlcmVyLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdG5vdGVib29rUmVuZGVyZXIubWltZVR5cGVzLmpvaW4oJywnKVxuXHRcdFx0XHRdO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ25vdGVib29rcycsXG5cdGxhYmVsOiBubHMubG9jYWxpemUoJ25vdGVib29rcycsIFwiTm90ZWJvb2tzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoTm90ZWJvb2tzRGF0YVJlbmRlcmVyKSxcbn0pO1xuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ25vdGVib29rUmVuZGVyZXInLFxuXHRsYWJlbDogbmxzLmxvY2FsaXplKCdub3RlYm9va1JlbmRlcmVyJywgXCJOb3RlYm9vayBSZW5kZXJlcnNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihOb3RlYm9va1JlbmRlcmVyc0RhdGFSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE0RjtBQUNyRyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHNCQUFzQjtBQUMvQixTQUEwRyxrQkFBa0I7QUFDNUgsU0FBUyxnQkFBZ0I7QUFFekIsTUFBTSw2QkFBNkIsT0FBTyxPQUFPO0FBQUEsRUFDaEQsTUFBTTtBQUFBLEVBQ04sYUFBYTtBQUFBLEVBQ2IsVUFBVTtBQUFBLEVBQ1YsVUFBVTtBQUNYLENBQUM7QUFTRCxNQUFNLCtCQUErQixPQUFPLE9BQU87QUFBQSxFQUNsRCxJQUFJO0FBQUEsRUFDSixhQUFhO0FBQUEsRUFDYixXQUFXO0FBQUEsRUFDWCxZQUFZO0FBQUEsRUFDWixrQkFBa0I7QUFBQSxFQUNsQixzQkFBc0I7QUFBQSxFQUN0QixtQkFBbUI7QUFDcEIsQ0FBQztBQVlELE1BQU0sOEJBQThCLE9BQU8sT0FBTztBQUFBLEVBQ2pELE1BQU07QUFBQSxFQUNOLFlBQVk7QUFBQSxFQUNaLG9CQUFvQjtBQUNyQixDQUFDO0FBUUQsTUFBTSwrQkFBNEM7QUFBQSxFQUNqRCxhQUFhLElBQUksU0FBUyxpQ0FBaUMseUNBQXlDO0FBQUEsRUFDcEcsTUFBTTtBQUFBLEVBQ04saUJBQWlCLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxNQUFNLElBQUksYUFBYSxJQUFJLFlBQVksQ0FBQyxFQUFFLG1CQUFtQixHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUFBLEVBQ3BHLE9BQU87QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLFVBQVU7QUFBQSxNQUNULDJCQUEyQjtBQUFBLE1BQzNCLDJCQUEyQjtBQUFBLE1BQzNCLDJCQUEyQjtBQUFBLElBQzVCO0FBQUEsSUFDQSxZQUFZO0FB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
