import "./media/imageCarousel.css";
import { localize, localize2 } from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ImageCarouselEditor } from "./imageCarouselEditor.js";
import { ImageCarouselEditorInput } from "./imageCarouselEditorInput.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { ExplorerFolderContext } from "../../files/common/files.js";
import { IExplorerService } from "../../files/browser/files.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { getMediaMime } from "../../../../base/common/mime.js";
import { URI } from "../../../../base/common/uri.js";
import { basename, dirname, extname } from "../../../../base/common/resources.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "imageCarousel",
  title: localize("imageCarouselConfigurationTitle", "Images Preview"),
  type: "object",
  properties: {
    "imageCarousel.explorerContextMenu.enabled": {
      type: "boolean",
      default: true,
      markdownDescription: localize("imageCarousel.explorerContextMenu.enabled", "Controls whether the **Open in Images Preview** option appears in the Explorer context menu."),
      tags: ["experimental"]
    },
    "imageCarousel.chat.enabled": {
      type: "boolean",
      default: true,
      description: localize("imageCarousel.chat.enabled", "Controls whether clicking an image attachment in chat opens the Images Preview viewer.")
    }
  }
});
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ImageCarouselEditor,
    ImageCarouselEditor.ID,
    localize("imageCarouselEditor", "Images Preview")
  ),
  [
    new SyncDescriptor(ImageCarouselEditorInput)
  ]
);
class ImageCarouselEditorInputSerializer {
  canSerialize() {
    return false;
  }
  serialize() {
    return void 0;
  }
  deserialize() {
    return void 0;
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ImageCarouselEditorInput.ID, ImageCarouselEditorInputSerializer);
function isCollectionArgs(args) {
  return typeof args === "object" && args !== null && typeof args.collection === "object" && typeof args.startIndex === "number";
}
function isSingleImageArgs(args) {
  return typeof args === "object" && args !== null && typeof args.name === "string" && typeof args.mimeType === "string" && args.data instanceof Uint8Array;
}
class OpenImageInCarouselAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.openImageInCarousel",
      title: localize2("openImageInCarousel", "Open in Images Preview"),
      f1: false
    });
  }
  async run(accessor, args) {
    const editorService = accessor.get(IEditorService);
    let collection;
    let startIndex;
    if (isCollectionArgs(args)) {
      collection = args.collection;
      startIndex = args.startIndex;
    } else if (isSingleImageArgs(args)) {
      collection = {
        id: generateUuid(),
        title: args.title ?? localize("imageCarousel.title", "Images Preview"),
        sections: [{
          title: "",
          images: [{
            id: generateUuid(),
            name: args.name,
            mimeType: args.mimeType,
            data: VSBuffer.wrap(args.data)
          }]
        }]
      };
      startIndex = 0;
    } else {
      return;
    }
    const input = new ImageCarouselEditorInput(collection, startIndex);
    await editorService.openEditor(input, { pinned: true });
  }
}
registerAction2(OpenImageInCarouselAction);
const MEDIA_EXTENSION_REGEX = /^\.(png|jpg|jpeg|jpe|gif|webp|svg|bmp|ico|mp4|webm|mov)$/i;
function isMediaResource(uri) {
  return MEDIA_EXTENSION_REGEX.test(extname(uri));
}
async function collectImageFilesFromFolder(fileService, folderUri) {
  const stat = await fileService.resolve(folderUri);
  const imageUris = [];
  if (stat.children) {
    for (const child of stat.children) {
      if (child.isFile && isMediaResource(child.resource)) {
        imageUris.push(child.resource);
      }
    }
  }
  imageUris.sort((a, b) => basename(a).localeCompare(basename(b)));
  return imageUris;
}
function createImageEntries(uris) {
  return uris.map((uri) => ({
    id: generateUuid(),
    name: basename(uri),
    mimeType: getMediaMime(uri.path) ?? "image/png",
    uri
  }));
}
class OpenImagesInCarouselFromExplorerAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openImagesInCarousel",
      title: localize2("openImagesInCarousel", "Open in Images Preview"),
      f1: false,
      menu: [{
        id: MenuId.ExplorerContext,
        group: "navigation",
        order: 25,
        when: ContextKeyExpr.and(
          ContextKeyExpr.has("config.imageCarousel.explorerContextMenu.enabled"),
          ContextKeyExpr.or(
            ExplorerFolderContext,
            ContextKeyExpr.regex(ResourceContextKey.Extension.key, MEDIA_EXTENSION_REGEX)
          )
        )
      }]
    });
  }
  async run(accessor, resource) {
    const explorerService = accessor.get(IExplorerService);
    const fileService = accessor.get(IFileService);
    const editorService = accessor.get(IEditorService);
    const notificationService = accessor.get(INotificationService);
    const contextService = accessor.get(IWorkspaceContextService);
    const context = explorerService.getContext(true);
    let imageUris = [];
    let startUri;
    try {
      if (context.length === 0) {
        let folderUri;
        if (URI.isUri(resource)) {
          folderUri = resource;
        } else {
          const folders = contextService.getWorkspace().folders;
          if (folders.length > 0) {
            folderUri = folders[0].uri;
          }
        }
        if (folderUri) {
          imageUris = await collectImageFilesFromFolder(fileService, folderUri);
        }
      } else {
        const hasSingleImageFile = context.length === 1 && !context[0].isDirectory && isMediaResource(context[0].resource);
        if (hasSingleImageFile) {
          startUri = context[0].resource;
          const parentUri = dirname(context[0].resource);
          imageUris = await collectImageFilesFromFolder(fileService, parentUri);
        } else {
          const seen = new ResourceSet();
          for (const item of context) {
            if (item.isDirectory) {
              const folderImages = await collectImageFilesFromFolder(fileService, item.resource);
              for (const uri of folderImages) {
                if (!seen.has(uri)) {
                  seen.add(uri);
                  imageUris.push(uri);
                }
              }
            } else if (isMediaResource(item.resource)) {
              if (!seen.has(item.resource)) {
                seen.add(item.resource);
                imageUris.push(item.resource);
                if (!startUri) {
                  startUri = item.resource;
                }
              }
            }
          }
        }
      }
    } catch {
      notificationService.error(localize("folderReadError", "Could not read folder contents."));
      return;
    }
    if (imageUris.length === 0) {
      notificationService.info(localize("noImagesFound", "No images found in this folder."));
      return;
    }
    const images = createImageEntries(imageUris);
    let startIndex = 0;
    if (startUri) {
      const idx = images.findIndex((img) => img.uri?.toString() === startUri.toString());
      if (idx >= 0) {
        startIndex = idx;
      }
    }
    const collection = {
      id: generateUuid(),
      title: localize("imageCarousel.explorerTitle", "Images Preview"),
      sections: [{
        title: "",
        images
      }]
    };
    const input = new ImageCarouselEditorInput(collection, startIndex);
    await editorService.openEditor(input, { pinned: true });
  }
}
registerAction2(OpenImagesInCarouselFromExplorerAction);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGltYWdlQ2Fyb3VzZWxcXGJyb3dzZXJcXGltYWdlQ2Fyb3VzZWwuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2ltYWdlQ2Fyb3VzZWwuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lRGVzY3JpcHRvciwgSUVkaXRvclBhbmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnMsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIElFZGl0b3JTZXJpYWxpemVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEltYWdlQ2Fyb3VzZWxFZGl0b3IgfSBmcm9tICcuL2ltYWdlQ2Fyb3VzZWxFZGl0b3IuanMnO1xuaW1wb3J0IHsgSW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0IH0gZnJvbSAnLi9pbWFnZUNhcm91c2VsRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUNhcm91c2VsSW1hZ2UsIElJbWFnZUNhcm91c2VsQ29sbGVjdGlvbiB9IGZyb20gJy4vaW1hZ2VDYXJvdXNlbFR5cGVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJGb2xkZXJDb250ZXh0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9icm93c2VyL2ZpbGVzLmpzJztcbmltcG9ydCB7IFJlc291cmNlQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgZ2V0TWVkaWFNaW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGV4dG5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcblxuLy8gLS0tIENvbmZpZ3VyYXRpb24gLS0tXG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnaW1hZ2VDYXJvdXNlbCcsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbENvbmZpZ3VyYXRpb25UaXRsZScsIFwiSW1hZ2VzIFByZXZpZXdcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J2ltYWdlQ2Fyb3VzZWwuZXhwbG9yZXJDb250ZXh0TWVudS5lbmFibGVkJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLmV4cGxvcmVyQ29udGV4dE1lbnUuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgKipPcGVuIGluIEltYWdlcyBQcmV2aWV3Kiogb3B0aW9uIGFwcGVhcnMgaW4gdGhlIEV4cGxvcmVyIGNvbnRleHQgbWVudS5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0J2ltYWdlQ2Fyb3VzZWwuY2hhdC5lbmFibGVkJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbC5jaGF0LmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY2xpY2tpbmcgYW4gaW1hZ2UgYXR0YWNobWVudCBpbiBjaGF0IG9wZW5zIHRoZSBJbWFnZXMgUHJldmlldyB2aWV3ZXIuXCIpLFxuXHRcdH0sXG5cdH1cbn0pO1xuXG4vLyAtLS0gRWRpdG9yIFBhbmUgUmVnaXN0cmF0aW9uIC0tLVxuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdEltYWdlQ2Fyb3VzZWxFZGl0b3IsXG5cdFx0SW1hZ2VDYXJvdXNlbEVkaXRvci5JRCxcblx0XHRsb2NhbGl6ZSgnaW1hZ2VDYXJvdXNlbEVkaXRvcicsIFwiSW1hZ2VzIFByZXZpZXdcIilcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihJbWFnZUNhcm91c2VsRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cbi8vIC0tLSBTZXJpYWxpemVyIC0tLVxuXG5jbGFzcyBJbWFnZUNhcm91c2VsRWRpdG9ySW5wdXRTZXJpYWxpemVyIGltcGxlbWVudHMgSUVkaXRvclNlcmlhbGl6ZXIge1xuXHRjYW5TZXJpYWxpemUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0c2VyaWFsaXplKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGRlc2VyaWFsaXplKCk6IEltYWdlQ2Fyb3VzZWxFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpXG5cdC5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoSW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0LklELCBJbWFnZUNhcm91c2VsRWRpdG9ySW5wdXRTZXJpYWxpemVyKTtcblxuLy8gLS0tIEFyZ3MgVHlwZXMgLS0tXG5cbmludGVyZmFjZSBJT3BlbkNhcm91c2VsQ29sbGVjdGlvbkFyZ3Mge1xuXHRyZWFkb25seSBjb2xsZWN0aW9uOiBJSW1hZ2VDYXJvdXNlbENvbGxlY3Rpb247XG5cdHJlYWRvbmx5IHN0YXJ0SW5kZXg6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElPcGVuQ2Fyb3VzZWxTaW5nbGVJbWFnZUFyZ3Mge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1pbWVUeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRhdGE6IFVpbnQ4QXJyYXk7XG5cdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBpc0NvbGxlY3Rpb25BcmdzKGFyZ3M6IHVua25vd24pOiBhcmdzIGlzIElPcGVuQ2Fyb3VzZWxDb2xsZWN0aW9uQXJncyB7XG5cdHJldHVybiB0eXBlb2YgYXJncyA9PT0gJ29iamVjdCcgJiYgYXJncyAhPT0gbnVsbFxuXHRcdCYmIHR5cGVvZiAoYXJncyBhcyBJT3BlbkNhcm91c2VsQ29sbGVjdGlvbkFyZ3MpLmNvbGxlY3Rpb24gPT09ICdvYmplY3QnXG5cdFx0JiYgdHlwZW9mIChhcmdzIGFzIElPcGVuQ2Fyb3VzZWxDb2xsZWN0aW9uQXJncykuc3RhcnRJbmRleCA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIGlzU2luZ2xlSW1hZ2VBcmdzKGFyZ3M6IHVua25vd24pOiBhcmdzIGlzIElPcGVuQ2Fyb3VzZWxTaW5nbGVJbWFnZUFyZ3Mge1xuXHRyZXR1cm4gdHlwZW9mIGFyZ3MgPT09ICdvYmplY3QnICYmIGFyZ3MgIT09IG51bGxcblx0XHQmJiB0eXBlb2YgKGFyZ3MgYXMgSU9wZW5DYXJvdXNlbFNpbmdsZUltYWdlQXJncykubmFtZSA9PT0gJ3N0cmluZydcblx0XHQmJiB0eXBlb2YgKGFyZ3MgYXMgSU9wZW5DYXJvdXNlbFNpbmdsZUltYWdlQXJncykubWltZVR5cGUgPT09ICdzdHJpbmcnXG5cdFx0JiYgKGFyZ3MgYXMgSU9wZW5DYXJvdXNlbFNpbmdsZUltYWdlQXJncykuZGF0YSBpbnN0YW5jZW9mIFVpbnQ4QXJyYXk7XG59XG5cbi8vIC0tLSBBY3Rpb25zIC0tLVxuXG5jbGFzcyBPcGVuSW1hZ2VJbkNhcm91c2VsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5JbWFnZUluQ2Fyb3VzZWwnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkltYWdlSW5DYXJvdXNlbCcsIFwiT3BlbiBpbiBJbWFnZXMgUHJldmlld1wiKSxcblx0XHRcdGYxOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzPzogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0bGV0IGNvbGxlY3Rpb246IElJbWFnZUNhcm91c2VsQ29sbGVjdGlvbjtcblx0XHRsZXQgc3RhcnRJbmRleDogbnVtYmVyO1xuXG5cdFx0aWYgKGlzQ29sbGVjdGlvbkFyZ3MoYXJncykpIHtcblx0XHRcdGNvbGxlY3Rpb24gPSBhcmdzLmNvbGxlY3Rpb247XG5cdFx0XHRzdGFydEluZGV4ID0gYXJncy5zdGFydEluZGV4O1xuXHRcdH0gZWxzZSBpZiAoaXNTaW5nbGVJbWFnZUFyZ3MoYXJncykpIHtcblx0XHRcdGNvbGxlY3Rpb24gPSB7XG5cdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0dGl0bGU6IGFyZ3MudGl0bGUgPz8gbG9jYWxpemUoJ2ltYWdlQ2Fyb3VzZWwudGl0bGUnLCBcIkltYWdlcyBQcmV2aWV3XCIpLFxuXHRcdFx0XHRzZWN0aW9uczogW3tcblx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0aW1hZ2VzOiBbe1xuXHRcdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdFx0bmFtZTogYXJncy5uYW1lLFxuXHRcdFx0XHRcdFx0bWltZVR5cGU6IGFyZ3MubWltZVR5cGUsXG5cdFx0XHRcdFx0XHRkYXRhOiBWU0J1ZmZlci53cmFwKGFyZ3MuZGF0YSksXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblx0XHRcdHN0YXJ0SW5kZXggPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXQgPSBuZXcgSW1hZ2VDYXJvdXNlbEVkaXRvcklucHV0KGNvbGxlY3Rpb24sIHN0YXJ0SW5kZXgpO1xuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgeyBwaW5uZWQ6IHRydWUgfSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5JbWFnZUluQ2Fyb3VzZWxBY3Rpb24pO1xuXG4vLyAtLS0gRXhwbG9yZXIgQ29udGV4dCBNZW51IEludGVncmF0aW9uIC0tLVxuXG4vKiogU3VwcG9ydGVkIG1lZGlhIChpbWFnZSArIHZpZGVvKSBleHRlbnNpb25zIGZvciB0aGUgY2Fyb3VzZWwgZXhwbG9yZXIgY29udGV4dCBtZW51LiAqL1xuY29uc3QgTUVESUFfRVhURU5TSU9OX1JFR0VYID0gL15cXC4ocG5nfGpwZ3xqcGVnfGpwZXxnaWZ8d2VicHxzdmd8Ym1wfGljb3xtcDR8d2VibXxtb3YpJC9pO1xuXG5mdW5jdGlvbiBpc01lZGlhUmVzb3VyY2UodXJpOiBVUkkpOiBib29sZWFuIHtcblx0cmV0dXJuIE1FRElBX0VYVEVOU0lPTl9SRUdFWC50ZXN0KGV4dG5hbWUodXJpKSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNvbGxlY3RJbWFnZUZpbGVzRnJvbUZvbGRlcihmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLCBmb2xkZXJVcmk6IFVSSSk6IFByb21pc2U8VVJJW10+IHtcblx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoZm9sZGVyVXJpKTtcblx0Y29uc3QgaW1hZ2VVcmlzOiBVUklbXSA9IFtdO1xuXHRpZiAoc3RhdC5jaGlsZHJlbikge1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0aWYgKGNoaWxkLmlzRmlsZSAmJiBpc01lZGlhUmVzb3VyY2UoY2hpbGQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdGltYWdlVXJpcy5wdXNoKGNoaWxkLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0aW1hZ2VVcmlzLnNvcnQoKGEsIGIpID0+IGJhc2VuYW1lKGEpLmxvY2FsZUNvbXBhcmUoYmFzZW5hbWUoYikpKTtcblx0cmV0dXJuIGltYWdlVXJpcztcbn1cblxuZnVuY3Rpb24gY3JlYXRlSW1hZ2VFbnRyaWVzKHVyaXM6IFVSSVtdKTogSUNhcm91c2VsSW1hZ2VbXSB7XG5cdHJldHVybiB1cmlzLm1hcCh1cmkgPT4gKHtcblx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0bmFtZTogYmFzZW5hbWUodXJpKSxcblx0XHRtaW1lVHlwZTogZ2V0TWVkaWFNaW1lKHVyaS5wYXRoKSA/PyAnaW1hZ2UvcG5nJyxcblx0XHR1cmksXG5cdH0pKTtcbn1cblxuY2xhc3MgT3BlbkltYWdlc0luQ2Fyb3VzZWxGcm9tRXhwbG9yZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5JbWFnZXNJbkNhcm91c2VsJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5JbWFnZXNJbkNhcm91c2VsJywgXCJPcGVuIGluIEltYWdlcyBQcmV2aWV3XCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FeHBsb3JlckNvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyNSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcygnY29uZmlnLmltYWdlQ2Fyb3VzZWwuZXhwbG9yZXJDb250ZXh0TWVudS5lbmFibGVkJyksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRFeHBsb3JlckZvbGRlckNvbnRleHQsXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5yZWdleChSZXNvdXJjZUNvbnRleHRLZXkuRXh0ZW5zaW9uLmtleSwgTUVESUFfRVhURU5TSU9OX1JFR0VYKSxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHQpLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlPzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbnRleHQgPSBleHBsb3JlclNlcnZpY2UuZ2V0Q29udGV4dCh0cnVlKTtcblxuXHRcdGxldCBpbWFnZVVyaXM6IFVSSVtdID0gW107XG5cdFx0bGV0IHN0YXJ0VXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0XHR0cnkge1xuXHRcdFx0aWYgKGNvbnRleHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIEVtcHR5LXNwYWNlIHJpZ2h0LWNsaWNrOiB0aGUgZXhwbG9yZXIgcGFzc2VzIHRoZSB3b3Jrc3BhY2Ugcm9vdFxuXHRcdFx0XHQvLyBhcyB0aGUgcmVzb3VyY2UgYXJndW1lbnQuIEZhbGwgYmFjayB0byB0aGUgZmlyc3Qgd29ya3NwYWNlIGZvbGRlclxuXHRcdFx0XHQvLyB3aGVuIG5vIHJlc291cmNlIGlzIGF2YWlsYWJsZS5cblx0XHRcdFx0bGV0IGZvbGRlclVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKHJlc291cmNlKSkge1xuXHRcdFx0XHRcdGZvbGRlclVyaSA9IHJlc291cmNlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSBjb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdFx0XHRcdGlmIChmb2xkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGZvbGRlclVyaSA9IGZvbGRlcnNbMF0udXJpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChmb2xkZXJVcmkpIHtcblx0XHRcdFx0XHRpbWFnZVVyaXMgPSBhd2FpdCBjb2xsZWN0SW1hZ2VGaWxlc0Zyb21Gb2xkZXIoZmlsZVNlcnZpY2UsIGZvbGRlclVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGhhc1NpbmdsZUltYWdlRmlsZSA9IGNvbnRleHQubGVuZ3RoID09PSAxICYmICFjb250ZXh0WzBdLmlzRGlyZWN0b3J5ICYmIGlzTWVkaWFSZXNvdXJjZShjb250ZXh0WzBdLnJlc291cmNlKTtcblxuXHRcdFx0XHRpZiAoaGFzU2luZ2xlSW1hZ2VGaWxlKSB7XG5cdFx0XHRcdFx0Ly8gU2luZ2xlIGltYWdlOiBzaG93IGFsbCBzaWJsaW5nIGltYWdlcyBpbiB0aGUgc2FtZSBmb2xkZXIgd2l0aFxuXHRcdFx0XHRcdC8vIHRoZSBzZWxlY3RlZCBpbWFnZSBmb2N1c2VkXG5cdFx0XHRcdFx0c3RhcnRVcmkgPSBjb250ZXh0WzBdLnJlc291cmNlO1xuXHRcdFx0XHRcdGNvbnN0IHBhcmVudFVyaSA9IGRpcm5hbWUoY29udGV4dFswXS5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0aW1hZ2VVcmlzID0gYXdhaXQgY29sbGVjdEltYWdlRmlsZXNGcm9tRm9sZGVyKGZpbGVTZXJ2aWNlLCBwYXJlbnRVcmkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE11bHRpcGxlIGl0ZW1zIG9yIGEgZm9sZGVyOiBjb2xsZWN0IGltYWdlcyBmcm9tIHNlbGVjdGlvbixcblx0XHRcdFx0XHQvLyBkZWR1cGxpY2F0aW5nIGluIGNhc2UgYSBmb2xkZXIgYW5kIGl0cyBjaGlsZHJlbiBhcmUgYm90aCBzZWxlY3RlZFxuXHRcdFx0XHRcdGNvbnN0IHNlZW4gPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgY29udGV4dCkge1xuXHRcdFx0XHRcdFx0aWYgKGl0ZW0uaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZm9sZGVySW1hZ2VzID0gYXdhaXQgY29sbGVjdEltYWdlRmlsZXNGcm9tRm9sZGVyKGZpbGVTZXJ2aWNlLCBpdGVtLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCB1cmkgb2YgZm9sZGVySW1hZ2VzKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFzZWVuLmhhcyh1cmkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzZWVuLmFkZCh1cmkpO1xuXHRcdFx0XHRcdFx0XHRcdFx0aW1hZ2VVcmlzLnB1c2godXJpKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNNZWRpYVJlc291cmNlKGl0ZW0ucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghc2Vlbi5oYXMoaXRlbS5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRzZWVuLmFkZChpdGVtLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0XHRpbWFnZVVyaXMucHVzaChpdGVtLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIXN0YXJ0VXJpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRzdGFydFVyaSA9IGl0ZW0ucmVzb3VyY2U7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdmb2xkZXJSZWFkRXJyb3InLCBcIkNvdWxkIG5vdCByZWFkIGZvbGRlciBjb250ZW50cy5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpbWFnZVVyaXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ25vSW1hZ2VzRm91bmQnLCBcIk5vIGltYWdlcyBmb3VuZCBpbiB0aGlzIGZvbGRlci5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGltYWdlcyA9IGNyZWF0ZUltYWdlRW50cmllcyhpbWFnZVVyaXMpO1xuXG5cdFx0bGV0IHN0YXJ0SW5kZXggPSAwO1xuXHRcdGlmIChzdGFydFVyaSkge1xuXHRcdFx0Y29uc3QgaWR4ID0gaW1hZ2VzLmZpbmRJbmRleChpbWcgPT4gaW1nLnVyaT8udG9TdHJpbmcoKSA9PT0gc3RhcnRVcmkhLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKGlkeCA+PSAwKSB7XG5cdFx0XHRcdHN0YXJ0SW5kZXggPSBpZHg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29sbGVjdGlvbjogSUltYWdlQ2Fyb3VzZWxDb2xsZWN0aW9uID0ge1xuXHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbWFnZUNhcm91c2VsLmV4cGxvcmVyVGl0bGUnLCBcIkltYWdlcyBQcmV2aWV3XCIpLFxuXHRcdFx0c2VjdGlvbnM6IFt7XG5cdFx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdFx0aW1hZ2VzLFxuXHRcdFx0fV0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGlucHV0ID0gbmV3IEltYWdlQ2Fyb3VzZWxFZGl0b3JJbnB1dChjb2xsZWN0aW9uLCBzdGFydEluZGV4KTtcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuSW1hZ2VzSW5DYXJvdXNlbEZyb21FeHBsb3JlckFjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUFpRDtBQUMxRCxTQUFTLHdCQUFtRTtBQUM1RSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsVUFBVSxTQUFTLGVBQWU7QUFDM0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxjQUFjLCtCQUF1RDtBQUk5RSxTQUFTLEdBQTJCLHdCQUF3QixhQUFhLEVBQUUsc0JBQXNCO0FBQUEsRUFDaEcsSUFBSTtBQUFBLEVBQ0osT0FBTyxTQUFTLG1DQUFtQyxnQkFBZ0I7QUFBQSxFQUNuRSxNQUFNO0FBQUEsRUFDTixZQUFZO0FBQUEsSUFDWCw2Q0FBNkM7QUFBQSxNQUM1QyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxxQkFBcUIsU0FBUyw2Q0FBNkMsOEZBQThGO0FBQUEsTUFDekssTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUN0QjtBQUFBLElBQ0EsOEJBQThCO0FBQUEsTUFDN0IsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsYUFBYSxTQUFTLDhCQUE4Qix3RkFBd0Y7QUFBQSxJQUM3STtB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
