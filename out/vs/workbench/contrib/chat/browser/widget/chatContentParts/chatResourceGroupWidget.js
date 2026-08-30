var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as dom from "../../../../../../base/browser/dom.js";
import { disposableTimeout } from "../../../../../../base/common/async.js";
import { decodeBase64 } from "../../../../../../base/common/buffer.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { basename, extname, joinPath } from "../../../../../../base/common/resources.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IProgressService, ProgressLocation } from "../../../../../../platform/progress/common/progress.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { REVEAL_IN_EXPLORER_COMMAND_ID } from "../../../../files/browser/fileConstants.js";
import { CHAT_ATTACHABLE_IMAGE_MIME_TYPES, getAttachableImageExtension } from "../../../common/model/chatModel.js";
import { ChatAttachmentsContentPart } from "./chatAttachmentsContentPart.js";
const IMAGE_DECODE_DELAY_MS = 100;
let ChatResourceGroupWidget = class extends Disposable {
  constructor(parts, _instantiationService, _contextMenuService, _fileService) {
    super();
    this._instantiationService = _instantiationService;
    this._contextMenuService = _contextMenuService;
    this._fileService = _fileService;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    const el = dom.h(".chat-collapsible-io-resource-group", [
      dom.h(".chat-collapsible-io-resource-items@items"),
      dom.h(".chat-collapsible-io-resource-actions@actions")
    ]);
    this.domNode = el.root;
    this._fillInResourceGroup(parts, el.items, el.actions);
  }
  async _fillInResourceGroup(parts, itemsContainer, actionsContainer) {
    const entries = [];
    const deferredImageParts = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const imageMimeType = getResourceImageMimeType(part);
      if (imageMimeType) {
        if (part.base64Value) {
          entries.push({ kind: "file", id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
          deferredImageParts.push({ index: i, part, mimeType: imageMimeType });
        } else if (part.value) {
          entries.push({ kind: "image", id: generateUuid(), name: basename(part.uri), value: part.value, mimeType: imageMimeType, isURL: false, references: [{ kind: "reference", reference: part.uri }] });
        } else {
          const value = await this._fileService.readFile(part.uri).then((f) => f.value.buffer, () => void 0);
          if (!value) {
            entries.push({ kind: "file", id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
          } else {
            entries.push({ kind: "image", id: generateUuid(), name: basename(part.uri), value, mimeType: imageMimeType, isURL: false, references: [{ kind: "reference", reference: part.uri }] });
          }
        }
      } else {
        entries.push({ kind: "file", id: generateUuid(), name: basename(part.uri), fullName: part.uri.path, value: part.uri });
      }
    }
    if (this._store.isDisposed) {
      return;
    }
    const attachments = this._register(this._instantiationService.createInstance(
      ChatAttachmentsContentPart,
      {
        variables: entries,
        limit: 5,
        contentReferences: void 0,
        domNode: void 0
      }
    ));
    attachments.contextMenuHandler = (attachment, event) => {
      const index = entries.indexOf(attachment);
      const part = parts[index];
      if (part) {
        event.preventDefault();
        event.stopPropagation();
        this._contextMenuService.showContextMenu({
          menuId: MenuId.ChatToolOutputResourceContext,
          menuActionOptions: { shouldForwardArgs: true },
          getAnchor: () => ({ x: event.pageX, y: event.pageY }),
          getActionsContext: () => ({ parts: [part] })
        });
      }
    };
    itemsContainer.appendChild(attachments.domNode);
    this._onDidChangeHeight.fire();
    const toolbar = this._register(this._instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, MenuId.ChatToolOutputResourceToolbar, {
      menuOptions: {
        shouldForwardArgs: true
      }
    }));
    toolbar.context = { parts };
    if (deferredImageParts.length > 0) {
      this._register(disposableTimeout(() => {
        for (const { index, part, mimeType } of deferredImageParts) {
          try {
            const value = decodeBase64(part.base64Value).buffer;
            entries[index] = { kind: "image", id: generateUuid(), name: basename(part.uri), value, mimeType, isURL: false, references: [{ kind: "reference", reference: part.uri }] };
          } catch {
          }
        }
        attachments.updateVariables(entries);
        this._onDidChangeHeight.fire();
      }, IMAGE_DECODE_DELAY_MS));
    }
  }
};
ChatResourceGroupWidget = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IFileService)
], ChatResourceGroupWidget);
function getResourceImageMimeType(part) {
  if (part.mimeType && getAttachableImageExtension(part.mimeType)) {
    return part.mimeType;
  }
  const extension = extname(part.uri).slice(1).toLowerCase();
  return CHAT_ATTACHABLE_IMAGE_MIME_TYPES[extension];
}
const _SaveResourcesAction = class _SaveResourcesAction extends Action2 {
  constructor() {
    super({
      id: _SaveResourcesAction.ID,
      title: localize2("chat.saveResources", "Save..."),
      icon: Codicon.cloudDownload,
      menu: [{
        id: MenuId.ChatToolOutputResourceToolbar,
        group: "navigation",
        order: 1
      }, {
        id: MenuId.ChatToolOutputResourceContext
      }]
    });
  }
  async run(accessor, context) {
    const fileDialog = accessor.get(IFileDialogService);
    const fileService = accessor.get(IFileService);
    const notificationService = accessor.get(INotificationService);
    const progressService = accessor.get(IProgressService);
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const commandService = accessor.get(ICommandService);
    const labelService = accessor.get(ILabelService);
    const defaultFilepath = await fileDialog.defaultFilePath();
    const savePart = async (part, isFolder, uri) => {
      const target = isFolder ? joinPath(uri, basename(part.uri)) : uri;
      try {
        if (part.kind === "data") {
          await fileService.copy(part.uri, target, true);
        } else {
          const contents = await fileService.readFile(part.uri);
          await fileService.writeFile(target, contents.value);
        }
      } catch (e) {
        notificationService.error(localize("chat.saveResources.error", "Failed to save {0}: {1}", basename(part.uri), e));
      }
    };
    const withProgress = async (thenReveal, todo) => {
      await progressService.withProgress({
        location: ProgressLocation.Notification,
        delay: 5e3,
        title: localize("chat.saveResources.progress", "Saving resources...")
      }, async (report) => {
        for (const task of todo) {
          await task();
          report.report({ increment: 1, total: todo.length });
        }
      });
      if (workspaceContextService.isInsideWorkspace(thenReveal)) {
        commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, thenReveal);
      } else {
        notificationService.info(localize("chat.saveResources.reveal", "Saved resources to {0}", labelService.getUriLabel(thenReveal)));
      }
    };
    if (context.parts.length === 1) {
      const part = context.parts[0];
      const uri = await fileDialog.pickFileToSave(joinPath(defaultFilepath, basename(part.uri)));
      if (!uri) {
        return;
      }
      await withProgress(uri, [() => savePart(part, false, uri)]);
    } else {
      const uris = await fileDialog.showOpenDialog({
        title: localize("chat.saveResources.title", "Pick folder to save resources"),
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: workspaceContextService.getWorkspace().folders[0]?.uri
      });
      if (!uris?.length) {
        return;
      }
      await withProgress(uris[0], context.parts.map((part) => () => savePart(part, true, uris[0])));
    }
  }
};
_SaveResourcesAction.ID = "chat.toolOutput.save";
let SaveResourcesAction = _SaveResourcesAction;
registerAction2(SaveResourcesAction);
export {
  ChatResourceGroupWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdFJlc291cmNlR3JvdXBXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRlY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGV4dG5hbWUsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUkVWRUFMX0lOX0VYUExPUkVSX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9maWxlcy9icm93c2VyL2ZpbGVDb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ0hBVF9BVFRBQ0hBQkxFX0lNQUdFX01JTUVfVFlQRVMsIGdldEF0dGFjaGFibGVJbWFnZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0QXR0YWNobWVudHNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydCB9IGZyb20gJy4vY2hhdFRvb2xJbnB1dE91dHB1dENvbnRlbnRQYXJ0LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZVRvb2xiYXJDb250ZXh0IHtcblx0cGFydHM6IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0W107XG59XG5cbi8qKlxuICogRGVsYXkgaW4gbWlsbGlzZWNvbmRzIGJlZm9yZSBkZWNvZGluZyBiYXNlNjQgaW1hZ2UgZGF0YS5cbiAqIFRoaXMgYXZvaWRzIGV4cGVuc2l2ZSBkZWNvZGUgb3BlcmF0aW9ucyBkdXJpbmcgc2Nyb2xsaW5nLlxuICovXG5jb25zdCBJTUFHRV9ERUNPREVfREVMQVlfTVMgPSAxMDA7XG5cbi8qKlxuICogQSByZXVzYWJsZSB3aWRnZXQgZm9yIHJlbmRlcmluZyBhIGdyb3VwIG9mIHJlc291cmNlIGRhdGEgcGFydHMgKGZpbGVzLCBpbWFnZXMpXG4gKiB3aXRoIGF0dGFjaG1lbnQgcGlsbHMgYW5kIGEgdG9vbGJhciB3aXRoIHNhdmUgYWN0aW9ucy5cbiAqXG4gKiBVc2VkIGJ5IENoYXRUb29sT3V0cHV0Q29udGVudFN1YlBhcnQgYW5kIENoYXRNY3BBcHBTdWJQYXJ0IChmb3IgZG93bmxvYWQgcmVzb3VyY2VzKS5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRSZXNvdXJjZUdyb3VwV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFydHM6IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0W10sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBlbCA9IGRvbS5oKCcuY2hhdC1jb2xsYXBzaWJsZS1pby1yZXNvdXJjZS1ncm91cCcsIFtcblx0XHRcdGRvbS5oKCcuY2hhdC1jb2xsYXBzaWJsZS1pby1yZXNvdXJjZS1pdGVtc0BpdGVtcycpLFxuXHRcdFx0ZG9tLmgoJy5jaGF0LWNvbGxhcHNpYmxlLWlvLXJlc291cmNlLWFjdGlvbnNAYWN0aW9ucycpLFxuXHRcdF0pO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZWwucm9vdDtcblx0XHR0aGlzLl9maWxsSW5SZXNvdXJjZUdyb3VwKHBhcnRzLCBlbC5pdGVtcywgZWwuYWN0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9maWxsSW5SZXNvdXJjZUdyb3VwKHBhcnRzOiBJQ2hhdENvbGxhcHNpYmxlSU9EYXRhUGFydFtdLCBpdGVtc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGFjdGlvbnNDb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Ly8gRmlyc3QgcGFzczogY3JlYXRlIGVudHJpZXMgaW1tZWRpYXRlbHksIHVzaW5nIGZpbGUgcGxhY2Vob2xkZXJzIGZvciBiYXNlNjQgaW1hZ2VzXG5cdFx0Y29uc3QgZW50cmllczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cdFx0Y29uc3QgZGVmZXJyZWRJbWFnZVBhcnRzOiB7IGluZGV4OiBudW1iZXI7IHBhcnQ6IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0OyBtaW1lVHlwZTogc3RyaW5nIH1bXSA9IFtdO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcGFydCA9IHBhcnRzW2ldO1xuXHRcdFx0Y29uc3QgaW1hZ2VNaW1lVHlwZSA9IGdldFJlc291cmNlSW1hZ2VNaW1lVHlwZShwYXJ0KTtcblx0XHRcdGlmIChpbWFnZU1pbWVUeXBlKSB7XG5cdFx0XHRcdGlmIChwYXJ0LmJhc2U2NFZhbHVlKSB7XG5cdFx0XHRcdFx0Ly8gRGVmZXIgYmFzZTY0IGRlY29kZSAtIHVzZSBmaWxlIHBsYWNlaG9sZGVyIGZvciBub3dcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiAnZmlsZScsIGlkOiBnZW5lcmF0ZVV1aWQoKSwgbmFtZTogYmFzZW5hbWUocGFydC51cmkpLCBmdWxsTmFtZTogcGFydC51cmkucGF0aCwgdmFsdWU6IHBhcnQudXJpIH0pO1xuXHRcdFx0XHRcdGRlZmVycmVkSW1hZ2VQYXJ0cy5wdXNoKHsgaW5kZXg6IGksIHBhcnQsIG1pbWVUeXBlOiBpbWFnZU1pbWVUeXBlIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHBhcnQudmFsdWUpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiAnaW1hZ2UnLCBpZDogZ2VuZXJhdGVVdWlkKCksIG5hbWU6IGJhc2VuYW1lKHBhcnQudXJpKSwgdmFsdWU6IHBhcnQudmFsdWUsIG1pbWVUeXBlOiBpbWFnZU1pbWVUeXBlLCBpc1VSTDogZmFsc2UsIHJlZmVyZW5jZXM6IFt7IGtpbmQ6ICdyZWZlcmVuY2UnLCByZWZlcmVuY2U6IHBhcnQudXJpIH1dIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUocGFydC51cmkpLnRoZW4oZiA9PiBmLnZhbHVlLmJ1ZmZlciwgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiAnZmlsZScsIGlkOiBnZW5lcmF0ZVV1aWQoKSwgbmFtZTogYmFzZW5hbWUocGFydC51cmkpLCBmdWxsTmFtZTogcGFydC51cmkucGF0aCwgdmFsdWU6IHBhcnQudXJpIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiAnaW1hZ2UnLCBpZDogZ2VuZXJhdGVVdWlkKCksIG5hbWU6IGJhc2VuYW1lKHBhcnQudXJpKSwgdmFsdWUsIG1pbWVUeXBlOiBpbWFnZU1pbWVUeXBlLCBpc1VSTDogZmFsc2UsIHJlZmVyZW5jZXM6IFt7IGtpbmQ6ICdyZWZlcmVuY2UnLCByZWZlcmVuY2U6IHBhcnQudXJpIH1dIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogJ2ZpbGUnLCBpZDogZ2VuZXJhdGVVdWlkKCksIG5hbWU6IGJhc2VuYW1lKHBhcnQudXJpKSwgZnVsbE5hbWU6IHBhcnQudXJpLnBhdGgsIHZhbHVlOiBwYXJ0LnVyaSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciBhdHRhY2htZW50cyBpbW1lZGlhdGVseSB3aXRoIHBsYWNlaG9sZGVyc1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0QXR0YWNobWVudHNDb250ZW50UGFydCxcblx0XHRcdHtcblx0XHRcdFx0dmFyaWFibGVzOiBlbnRyaWVzLFxuXHRcdFx0XHRsaW1pdDogNSxcblx0XHRcdFx0Y29udGVudFJlZmVyZW5jZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZG9tTm9kZTogdW5kZWZpbmVkXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHRhdHRhY2htZW50cy5jb250ZXh0TWVudUhhbmRsZXIgPSAoYXR0YWNobWVudCwgZXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gZW50cmllcy5pbmRleE9mKGF0dGFjaG1lbnQpO1xuXHRcdFx0Y29uc3QgcGFydCA9IHBhcnRzW2luZGV4XTtcblx0XHRcdGlmIChwYXJ0KSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0XHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdG1lbnVJZDogTWVudUlkLkNoYXRUb29sT3V0cHV0UmVzb3VyY2VDb250ZXh0LFxuXHRcdFx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiAoeyB4OiBldmVudC5wYWdlWCwgeTogZXZlbnQucGFnZVkgfSksXG5cdFx0XHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+ICh7IHBhcnRzOiBbcGFydF0gfSBzYXRpc2ZpZXMgSUNoYXRUb29sT3V0cHV0UmVzb3VyY2VUb29sYmFyQ29udGV4dCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpdGVtc0NvbnRhaW5lci5hcHBlbmRDaGlsZChhdHRhY2htZW50cy5kb21Ob2RlISk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBhY3Rpb25zQ29udGFpbmVyLCBNZW51SWQuQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZVRvb2xiYXIsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0dG9vbGJhci5jb250ZXh0ID0geyBwYXJ0cyB9IHNhdGlzZmllcyBJQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZVRvb2xiYXJDb250ZXh0O1xuXG5cdFx0Ly8gU2Vjb25kIHBhc3M6IGRlY29kZSBiYXNlNjQgaW1hZ2VzIGFzeW5jaHJvbm91c2x5IGFuZCB1cGRhdGUgaW4gcGxhY2Vcblx0XHRpZiAoZGVmZXJyZWRJbWFnZVBhcnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGluZGV4LCBwYXJ0LCBtaW1lVHlwZSB9IG9mIGRlZmVycmVkSW1hZ2VQYXJ0cykge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGRlY29kZUJhc2U2NChwYXJ0LmJhc2U2NFZhbHVlISkuYnVmZmVyO1xuXHRcdFx0XHRcdFx0ZW50cmllc1tpbmRleF0gPSB7IGtpbmQ6ICdpbWFnZScsIGlkOiBnZW5lcmF0ZVV1aWQoKSwgbmFtZTogYmFzZW5hbWUocGFydC51cmkpLCB2YWx1ZSwgbWltZVR5cGUsIGlzVVJMOiBmYWxzZSwgcmVmZXJlbmNlczogW3sga2luZDogJ3JlZmVyZW5jZScsIHJlZmVyZW5jZTogcGFydC51cmkgfV0gfTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIEtlZXAgdGhlIGZpbGUgcGxhY2Vob2xkZXIgb24gZGVjb2RlIGZhaWx1cmVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVcGRhdGUgYXR0YWNobWVudHMgaW4gcGxhY2Vcblx0XHRcdFx0YXR0YWNobWVudHMudXBkYXRlVmFyaWFibGVzKGVudHJpZXMpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5maXJlKCk7XG5cdFx0XHR9LCBJTUFHRV9ERUNPREVfREVMQVlfTVMpKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0UmVzb3VyY2VJbWFnZU1pbWVUeXBlKHBhcnQ6IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHBhcnQubWltZVR5cGUgJiYgZ2V0QXR0YWNoYWJsZUltYWdlRXh0ZW5zaW9uKHBhcnQubWltZVR5cGUpKSB7XG5cdFx0cmV0dXJuIHBhcnQubWltZVR5cGU7XG5cdH1cblxuXHRjb25zdCBleHRlbnNpb24gPSBleHRuYW1lKHBhcnQudXJpKS5zbGljZSgxKS50b0xvd2VyQ2FzZSgpO1xuXHRyZXR1cm4gQ0hBVF9BVFRBQ0hBQkxFX0lNQUdFX01JTUVfVFlQRVNbZXh0ZW5zaW9uXTtcbn1cblxuXG5jbGFzcyBTYXZlUmVzb3VyY2VzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnY2hhdC50b29sT3V0cHV0LnNhdmUnO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2F2ZVJlc291cmNlc0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuc2F2ZVJlc291cmNlcycsIFwiU2F2ZS4uLlwiKSxcblx0XHRcdGljb246IENvZGljb24uY2xvdWREb3dubG9hZCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZVRvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZUNvbnRleHQsXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZVRvb2xiYXJDb250ZXh0KSB7XG5cdFx0Y29uc3QgZmlsZURpYWxvZyA9IGFjY2Vzc29yLmdldChJRmlsZURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9ncmVzc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBsYWJlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSk7XG5cdFx0Y29uc3QgZGVmYXVsdEZpbGVwYXRoID0gYXdhaXQgZmlsZURpYWxvZy5kZWZhdWx0RmlsZVBhdGgoKTtcblxuXHRcdGNvbnN0IHNhdmVQYXJ0ID0gYXN5bmMgKHBhcnQ6IElDaGF0Q29sbGFwc2libGVJT0RhdGFQYXJ0LCBpc0ZvbGRlcjogYm9vbGVhbiwgdXJpOiBVUkkpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGlzRm9sZGVyID8gam9pblBhdGgodXJpLCBiYXNlbmFtZShwYXJ0LnVyaSkpIDogdXJpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdFx0YXdhaXQgZmlsZVNlcnZpY2UuY29weShwYXJ0LnVyaSwgdGFyZ2V0LCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBNQ1AgZG9lc24ndCBzdXBwb3J0IHN0cmVhbWluZyBkYXRhLCBzbyBubyBzZW5zZSB0cnlpbmdcblx0XHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHBhcnQudXJpKTtcblx0XHRcdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodGFyZ2V0LCBjb250ZW50cy52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnY2hhdC5zYXZlUmVzb3VyY2VzLmVycm9yJywgXCJGYWlsZWQgdG8gc2F2ZSB7MH06IHsxfVwiLCBiYXNlbmFtZShwYXJ0LnVyaSksIGUpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgd2l0aFByb2dyZXNzID0gYXN5bmMgKHRoZW5SZXZlYWw6IFVSSSwgdG9kbzogKCgpID0+IFByb21pc2U8dm9pZD4pW10pID0+IHtcblx0XHRcdGF3YWl0IHByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdGRlbGF5OiA1XzAwMCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0LnNhdmVSZXNvdXJjZXMucHJvZ3Jlc3MnLCBcIlNhdmluZyByZXNvdXJjZXMuLi5cIiksXG5cdFx0XHR9LCBhc3luYyByZXBvcnQgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdG9kbykge1xuXHRcdFx0XHRcdGF3YWl0IHRhc2soKTtcblx0XHRcdFx0XHRyZXBvcnQucmVwb3J0KHsgaW5jcmVtZW50OiAxLCB0b3RhbDogdG9kby5sZW5ndGggfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAod29ya3NwYWNlQ29udGV4dFNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UodGhlblJldmVhbCkpIHtcblx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoUkVWRUFMX0lOX0VYUExPUkVSX0NPTU1BTkRfSUQsIHRoZW5SZXZlYWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCdjaGF0LnNhdmVSZXNvdXJjZXMucmV2ZWFsJywgXCJTYXZlZCByZXNvdXJjZXMgdG8gezB9XCIsIGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh0aGVuUmV2ZWFsKSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAoY29udGV4dC5wYXJ0cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IHBhcnQgPSBjb250ZXh0LnBhcnRzWzBdO1xuXHRcdFx0Y29uc3QgdXJpID0gYXdhaXQgZmlsZURpYWxvZy5waWNrRmlsZVRvU2F2ZShqb2luUGF0aChkZWZhdWx0RmlsZXBhdGgsIGJhc2VuYW1lKHBhcnQudXJpKSkpO1xuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgd2l0aFByb2dyZXNzKHVyaSwgWygpID0+IHNhdmVQYXJ0KHBhcnQsIGZhbHNlLCB1cmkpXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHVyaXMgPSBhd2FpdCBmaWxlRGlhbG9nLnNob3dPcGVuRGlhbG9nKHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGF0LnNhdmVSZXNvdXJjZXMudGl0bGUnLCBcIlBpY2sgZm9sZGVyIHRvIHNhdmUgcmVzb3VyY2VzXCIpLFxuXHRcdFx0XHRjYW5TZWxlY3RGaWxlczogZmFsc2UsXG5cdFx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0XHRcdGNhblNlbGVjdE1hbnk6IGZhbHNlLFxuXHRcdFx0XHRkZWZhdWx0VXJpOiB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdPy51cmksXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCF1cmlzPy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB3aXRoUHJvZ3Jlc3ModXJpc1swXSwgY29udGV4dC5wYXJ0cy5tYXAocGFydCA9PiAoKSA9PiBzYXZlUGFydChwYXJ0LCB0cnVlLCB1cmlzWzBdKSkpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoU2F2ZVJlc291cmNlc0FjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsVUFBVSxTQUFTLGdCQUFnQjtBQUU1QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUErQztBQUN4RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxrQ0FBa0MsbUNBQW1DO0FBRTlFLFNBQVMsa0NBQWtDO0FBVzNDLE1BQU0sd0JBQXdCO0FBUXZCLElBQU0sMEJBQU4sY0FBc0MsV0FBVztBQUFBLEVBS3ZELFlBQ0MsT0FDd0MsdUJBQ0YscUJBQ1AsY0FDOUI7QUFDRCxVQUFNO0FBSmtDO0FBQ0Y7QUFDUDtBQVBoQyxTQUFpQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3hFLFNBQWdCLG9CQUFvQixLQUFLLG1CQUFtQjtBQVUzRCxVQUFNLEtBQUssSUFBSSxFQUFFLHVDQUF1QztBQUFBLE1BQ3ZELElBQUksRUFBRSwyQ0FB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
