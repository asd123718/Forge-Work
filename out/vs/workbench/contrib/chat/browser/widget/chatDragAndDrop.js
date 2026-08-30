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
import { DataTransfers } from "../../../../../base/browser/dnd.js";
import { $, DragAndDropObserver } from "../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { coalesce } from "../../../../../base/common/arrays.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { UriList } from "../../../../../base/common/dataTransfer.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { DraggedChatReferenceIdentifier, CodeDataTransfers, containsDragType, extractChatReferenceDropData, extractEditorsDropData, extractMarkerDropData, extractNotebookCellOutputDropData, extractSymbolDropData, LocalSelectionTransfer } from "../../../../../platform/dnd/browser/dnd.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IThemeService, Themable } from "../../../../../platform/theme/common/themeService.js";
import { ISharedWebContentExtractorService } from "../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { IExtensionService, isProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import { extractSCMHistoryItemDropData } from "../../../scm/browser/scmHistoryChatContext.js";
import { isAgentHostTarget } from "../../common/chatSessionsService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { IChatAttachmentResolveService } from "../attachments/chatAttachmentResolveService.js";
import { isCrossAgentHostChatReferenceDrop, isSelfChatReferenceDrop, resolveChatReferenceDropEntry } from "./chatReferenceDrop.js";
import { convertStringToUInt8Array } from "../chatImageUtils.js";
var ChatDragAndDropType = /* @__PURE__ */ ((ChatDragAndDropType2) => {
  ChatDragAndDropType2[ChatDragAndDropType2["CHAT_REFERENCE"] = 0] = "CHAT_REFERENCE";
  ChatDragAndDropType2[ChatDragAndDropType2["FILE_INTERNAL"] = 1] = "FILE_INTERNAL";
  ChatDragAndDropType2[ChatDragAndDropType2["FILE_EXTERNAL"] = 2] = "FILE_EXTERNAL";
  ChatDragAndDropType2[ChatDragAndDropType2["FOLDER"] = 3] = "FOLDER";
  ChatDragAndDropType2[ChatDragAndDropType2["IMAGE"] = 4] = "IMAGE";
  ChatDragAndDropType2[ChatDragAndDropType2["SYMBOL"] = 5] = "SYMBOL";
  ChatDragAndDropType2[ChatDragAndDropType2["HTML"] = 6] = "HTML";
  ChatDragAndDropType2[ChatDragAndDropType2["MARKER"] = 7] = "MARKER";
  ChatDragAndDropType2[ChatDragAndDropType2["NOTEBOOK_CELL_OUTPUT"] = 8] = "NOTEBOOK_CELL_OUTPUT";
  ChatDragAndDropType2[ChatDragAndDropType2["SCM_HISTORY_ITEM"] = 9] = "SCM_HISTORY_ITEM";
  return ChatDragAndDropType2;
})(ChatDragAndDropType || {});
const IMAGE_DATA_REGEX = /^data:image\/[a-z]+;base64,/;
const URL_REGEX = /^https?:\/\/.+/;
let ChatDragAndDrop = class extends Themable {
  constructor(widgetRef, attachmentTarget, styles, themeService, extensionService, webContentExtractorService, logService, chatAttachmentResolveService) {
    super(themeService);
    this.widgetRef = widgetRef;
    this.attachmentTarget = attachmentTarget;
    this.styles = styles;
    this.extensionService = extensionService;
    this.webContentExtractorService = webContentExtractorService;
    this.logService = logService;
    this.chatAttachmentResolveService = chatAttachmentResolveService;
    this.overlays = /* @__PURE__ */ new Map();
    this.overlayTextBackground = "";
    this.disableOverlay = false;
    /**
     * In-process transfer for a dragged chat reference. Readable during
     * `dragover` (unlike the `dataTransfer` mime payload), so the self-reference
     * guard can suppress the overlay when a chat is dragged onto its own input.
     */
    this.chatReferenceTransfer = LocalSelectionTransfer.getInstance();
    this.currentActiveTarget = void 0;
    this.updateStyles();
    this._register(toDisposable(() => {
      this.overlays.forEach(({ overlay, disposable }) => {
        disposable.dispose();
        overlay.remove();
      });
      this.overlays.clear();
      this.currentActiveTarget = void 0;
      this.overlayText?.remove();
      this.overlayText = void 0;
    }));
  }
  addOverlay(target, overlayContainer) {
    this.removeOverlay(target);
    const { overlay, disposable } = this.createOverlay(target, overlayContainer);
    this.overlays.set(target, { overlay, disposable });
  }
  removeOverlay(target) {
    if (this.currentActiveTarget === target) {
      this.currentActiveTarget = void 0;
    }
    const existingOverlay = this.overlays.get(target);
    if (existingOverlay) {
      existingOverlay.overlay.remove();
      existingOverlay.disposable.dispose();
      this.overlays.delete(target);
    }
  }
  setDisabledOverlay(disable) {
    this.disableOverlay = disable;
  }
  createOverlay(target, overlayContainer) {
    const overlay = document.createElement("div");
    overlay.classList.add("chat-dnd-overlay");
    this.updateOverlayStyles(overlay);
    overlayContainer.appendChild(overlay);
    const disposable = new DragAndDropObserver(target, {
      onDragOver: (e) => {
        if (this.disableOverlay) {
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        if (target === this.currentActiveTarget) {
          return;
        }
        if (this.currentActiveTarget) {
          this.setOverlay(this.currentActiveTarget, void 0);
        }
        this.currentActiveTarget = target;
        this.onDragEnter(e, target);
      },
      onDragLeave: (e) => {
        if (this.disableOverlay) {
          return;
        }
        if (target === this.currentActiveTarget) {
          this.currentActiveTarget = void 0;
        }
        this.onDragLeave(e, target);
      },
      onDrop: (e) => {
        if (this.disableOverlay) {
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        if (target !== this.currentActiveTarget) {
          return;
        }
        this.currentActiveTarget = void 0;
        this.onDrop(e, target);
      }
    });
    return { overlay, disposable };
  }
  onDragEnter(e, target) {
    const estimatedDropType = this.guessDropType(e);
    this.updateDropFeedback(e, target, estimatedDropType);
  }
  onDragLeave(e, target) {
    this.updateDropFeedback(e, target, void 0);
  }
  onDrop(e, target) {
    this.updateDropFeedback(e, target, void 0);
    this.drop(e);
  }
  async drop(e) {
    const contexts = await this.resolveAttachmentsFromDragEvent(e);
    if (contexts.length === 0) {
      return;
    }
    this.attachmentTarget.addAttachments(contexts);
  }
  updateDropFeedback(e, target, dropType) {
    const showOverlay = dropType !== void 0;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = showOverlay ? "copy" : "none";
    }
    this.setOverlay(target, dropType);
  }
  guessDropType(e) {
    if (containsDragType(e, CodeDataTransfers.CHAT_REFERENCE)) {
      return this.guessChatReferenceDropType(e);
    } else if (containsDragType(e, CodeDataTransfers.NOTEBOOK_CELL_OUTPUT)) {
      return 8 /* NOTEBOOK_CELL_OUTPUT */;
    } else if (containsDragType(e, CodeDataTransfers.SCM_HISTORY_ITEM)) {
      return 9 /* SCM_HISTORY_ITEM */;
    } else if (containsImageDragType(e)) {
      return this.extensionService.extensions.some((ext) => isProposedApiEnabled(ext, "chatReferenceBinaryData")) ? 4 /* IMAGE */ : void 0;
    } else if (containsDragType(e, "text/html")) {
      return 6 /* HTML */;
    } else if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
      return 5 /* SYMBOL */;
    } else if (containsDragType(e, CodeDataTransfers.MARKERS)) {
      return 7 /* MARKER */;
    } else if (containsDragType(e, DataTransfers.FILES)) {
      return 2 /* FILE_EXTERNAL */;
    } else if (containsDragType(e, CodeDataTransfers.EDITORS)) {
      return 1 /* FILE_INTERNAL */;
    } else if (containsDragType(e, Mimes.uriList, CodeDataTransfers.FILES, DataTransfers.RESOURCES, DataTransfers.INTERNAL_URI_LIST)) {
      return 3 /* FOLDER */;
    }
    return void 0;
  }
  /**
   * Resolves the drop type for a dragged chat reference. Only agent-host-backed
   * chat inputs can reference another chat, and a chat may reference any other
   * chat of the *same agent host* — including one from a different session shown
   * side by side in the Agents window.
   *
   * Two payload-dependent guards suppress the overlay entirely (rather than
   * appearing droppable and then doing nothing):
   * - a self-reference (a chat dropped onto its *own* input), and
   * - a cross-agent-host reference, which the owning host could never resolve.
   *
   * The dragged chat's client resource is read from the in-process
   * {@link LocalSelectionTransfer} (readable during `dragover`) with the
   * `dataTransfer` mime payload as a fallback (readable on `drop`), and compared
   * against this input's own client session resource. Both are opaque client
   * URIs, so the workbench never touches an AHP chat URI.
   */
  guessChatReferenceDropType(e) {
    const sessionResource = this.widgetRef()?.viewModel?.model.sessionResource;
    if (!sessionResource || !isAgentHostTarget(getChatSessionType(sessionResource))) {
      return void 0;
    }
    const droppedClientResource = this.getDraggedClientResource(e);
    if (droppedClientResource !== void 0 && (isSelfChatReferenceDrop(droppedClientResource, sessionResource.toString()) || isCrossAgentHostChatReferenceDrop(droppedClientResource, sessionResource.toString()))) {
      return void 0;
    }
    return 0 /* CHAT_REFERENCE */;
  }
  /**
   * The client resource of the dragged chat reference (used only for
   * self-reference identity comparison). Prefers the in-process local transfer
   * (available during `dragover`), falling back to the `dataTransfer` mime
   * payload (only readable on `drop`). Returns `undefined` when neither source
   * carries a chat reference.
   */
  getDraggedClientResource(e) {
    const local = this.chatReferenceTransfer.getData(DraggedChatReferenceIdentifier.prototype);
    if (local && local.length > 0) {
      return local[0].clientResource;
    }
    return extractChatReferenceDropData(e)?.clientResource;
  }
  isDragEventSupported(e) {
    const dropType = this.guessDropType(e);
    return dropType !== void 0;
  }
  getDropTypeName(type) {
    switch (type) {
      case 1 /* FILE_INTERNAL */:
        return localize("file", "File");
      case 2 /* FILE_EXTERNAL */:
        return localize("file", "File");
      case 3 /* FOLDER */:
        return localize("folder", "Folder");
      case 4 /* IMAGE */:
        return localize("image", "Image");
      case 5 /* SYMBOL */:
        return localize("symbol", "Symbol");
      case 7 /* MARKER */:
        return localize("problem", "Problem");
      case 6 /* HTML */:
        return localize("url", "URL");
      case 8 /* NOTEBOOK_CELL_OUTPUT */:
        return localize("notebookOutput", "Output");
      case 9 /* SCM_HISTORY_ITEM */:
        return localize("scmHistoryItem", "Change");
      case 0 /* CHAT_REFERENCE */:
        return localize("chat", "Chat");
    }
  }
  async resolveAttachmentsFromDragEvent(e) {
    if (!this.isDragEventSupported(e)) {
      return [];
    }
    if (containsDragType(e, CodeDataTransfers.CHAT_REFERENCE)) {
      return this.resolveChatReferenceAttachContext(e);
    }
    if (containsDragType(e, CodeDataTransfers.NOTEBOOK_CELL_OUTPUT)) {
      const notebookOutputData = extractNotebookCellOutputDropData(e);
      if (notebookOutputData) {
        return this.chatAttachmentResolveService.resolveNotebookOutputAttachContext(notebookOutputData);
      }
    }
    if (containsDragType(e, CodeDataTransfers.SCM_HISTORY_ITEM)) {
      const scmHistoryItemData = extractSCMHistoryItemDropData(e);
      if (scmHistoryItemData) {
        return this.chatAttachmentResolveService.resolveSourceControlHistoryItemAttachContext(scmHistoryItemData);
      }
    }
    const markerData = extractMarkerDropData(e);
    if (markerData) {
      return this.chatAttachmentResolveService.resolveMarkerAttachContext(markerData);
    }
    if (containsDragType(e, CodeDataTransfers.SYMBOLS)) {
      const symbolsData = extractSymbolDropData(e);
      return this.chatAttachmentResolveService.resolveSymbolsAttachContext(symbolsData);
    }
    const editorDragData = extractEditorsDropData(e);
    if (editorDragData.length > 0) {
      return coalesce(await Promise.all(editorDragData.map((editorInput) => {
        return this.chatAttachmentResolveService.resolveEditorAttachContext(editorInput);
      })));
    }
    const internal = e.dataTransfer?.getData(DataTransfers.INTERNAL_URI_LIST);
    if (internal) {
      const uriList = UriList.parse(internal);
      if (uriList.length) {
        return coalesce(await Promise.all(
          uriList.map((uri) => this.chatAttachmentResolveService.resolveEditorAttachContext({ resource: URI.parse(uri) }))
        ));
      }
    }
    if (!containsDragType(e, DataTransfers.INTERNAL_URI_LIST) && containsDragType(e, Mimes.uriList) && (containsDragType(e, Mimes.html) || containsDragType(e, Mimes.text))) {
      return this.resolveHTMLAttachContext(e);
    }
    return [];
  }
  /**
   * Resolves a dropped chat reference (a chat tab from the Agents window) to a
   * plain chat-reference attachment (a pill) — the same shape every other drop
   * type produces, with no inline text, range, or editor manipulation.
   *
   * The target must be an agent-host-backed input; the actual resolution and
   * the self / cross-agent-host guards live in {@link resolveChatReferenceDropEntry}.
   * Returns `[]` when any guard rejects.
   */
  resolveChatReferenceAttachContext(e) {
    const data = extractChatReferenceDropData(e);
    if (!data) {
      return [];
    }
    const sessionResource = this.widgetRef()?.viewModel?.model.sessionResource;
    const ownClientResource = sessionResource && isAgentHostTarget(getChatSessionType(sessionResource)) ? sessionResource.toString() : void 0;
    const entry = resolveChatReferenceDropEntry(data, ownClientResource);
    return entry ? [entry] : [];
  }
  async downloadImageAsUint8Array(url) {
    try {
      const extractedImages = await this.webContentExtractorService.readImage(URI.parse(url), CancellationToken.None);
      if (extractedImages) {
        return extractedImages.buffer;
      }
    } catch (error) {
      this.logService.warn("Fetch failed:", error);
    }
    const widget = this.widgetRef();
    const selection = widget?.inputEditor.getSelection();
    if (selection && widget) {
      widget.inputEditor.executeEdits("chatInsertUrl", [{ range: selection, text: url }]);
    }
    this.logService.warn(`Image URLs must end in .jpg, .png, .gif, .webp, or .bmp. Failed to fetch image from this URL: ${url}`);
    return void 0;
  }
  async resolveHTMLAttachContext(e) {
    const existingAttachmentNames = new Set(this.attachmentTarget.attachments.map((attachment) => attachment.name));
    const createDisplayName = () => {
      const baseName = localize("dragAndDroppedImageName", "Image from URL");
      let uniqueName = baseName;
      let baseNameInstance = 1;
      while (existingAttachmentNames.has(uniqueName)) {
        uniqueName = `${baseName} ${++baseNameInstance}`;
      }
      existingAttachmentNames.add(uniqueName);
      return uniqueName;
    };
    const getImageTransferDataFromUrl = async (url) => {
      const resource = URI.parse(url);
      if (IMAGE_DATA_REGEX.test(url)) {
        return { data: convertStringToUInt8Array(url), name: createDisplayName(), resource };
      }
      if (URL_REGEX.test(url)) {
        const data = await this.downloadImageAsUint8Array(url);
        if (data) {
          return { data, name: createDisplayName(), resource, id: url };
        }
      }
      return void 0;
    };
    const getImageTransferDataFromFile = async (file) => {
      try {
        const buffer = await file.arrayBuffer();
        return { data: new Uint8Array(buffer), name: createDisplayName() };
      } catch (error) {
        this.logService.error("Error reading file:", error);
      }
      return void 0;
    };
    const imageTransferData = [];
    const imageFiles = extractImageFilesFromDragEvent(e);
    if (imageFiles.length) {
      const imageTransferDataFromFiles = await Promise.all(imageFiles.map((file) => getImageTransferDataFromFile(file)));
      imageTransferData.push(...imageTransferDataFromFiles.filter((data) => !!data));
    }
    const imageUrls = extractUrlsFromDragEvent(e);
    if (imageUrls.length) {
      const imageTransferDataFromUrl = await Promise.all(imageUrls.map(getImageTransferDataFromUrl));
      imageTransferData.push(...imageTransferDataFromUrl.filter((data) => !!data));
    }
    return await this.chatAttachmentResolveService.resolveImageAttachContext(imageTransferData);
  }
  setOverlay(target, type) {
    this.overlayText?.remove();
    this.overlayText = void 0;
    const { overlay } = this.overlays.get(target);
    if (type !== void 0) {
      const iconAndtextElements = renderLabelWithIcons(`$(${Codicon.attach.id}) ${this.getOverlayText(type)}`);
      const htmlElements = iconAndtextElements.map((element) => {
        if (typeof element === "string") {
          return $("span.overlay-text", void 0, element);
        }
        return element;
      });
      this.overlayText = $("span.attach-context-overlay-text", void 0, ...htmlElements);
      this.overlayText.style.backgroundColor = this.overlayTextBackground;
      overlay.appendChild(this.overlayText);
    }
    overlay.classList.toggle("visible", type !== void 0);
  }
  getOverlayText(type) {
    const typeName = this.getDropTypeName(type);
    return localize("attacAsContext", "Attach {0} as Context", typeName);
  }
  updateOverlayStyles(overlay) {
    overlay.style.backgroundColor = this.getColor(this.styles.overlayBackground) || "";
    overlay.style.color = this.getColor(this.styles.listForeground) || "";
  }
  updateStyles() {
    this.overlays.forEach((overlay) => this.updateOverlayStyles(overlay.overlay));
    this.overlayTextBackground = this.getColor(this.styles.listBackground) || "";
  }
};
ChatDragAndDrop = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IExtensionService),
  __decorateParam(5, ISharedWebContentExtractorService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IChatAttachmentResolveService)
], ChatDragAndDrop);
function containsImageDragType(e) {
  if (containsDragType(e, "image")) {
    return true;
  }
  if (containsDragType(e, DataTransfers.FILES)) {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      return Array.from(files).some((file) => file.type.startsWith("image/"));
    }
    const items = e.dataTransfer?.items;
    if (items && items.length > 0) {
      return Array.from(items).some((item) => item.type.startsWith("image/"));
    }
  }
  return false;
}
function extractUrlsFromDragEvent(e, logService) {
  const textUrl = e.dataTransfer?.getData("text/uri-list");
  if (textUrl) {
    try {
      const urls = UriList.parse(textUrl);
      if (urls.length > 0) {
        return urls;
      }
    } catch (error) {
      logService?.error("Error parsing URI list:", error);
      return [];
    }
  }
  return [];
}
function extractImageFilesFromDragEvent(e) {
  const files = e.dataTransfer?.files;
  if (!files) {
    return [];
  }
  return Array.from(files).filter((file) => file.type.startsWith("image/"));
}
export {
  ChatDragAndDrop
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdERyYWdBbmREcm9wLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGF0YVRyYW5zZmVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgJCwgRHJhZ0FuZERyb3BPYnNlcnZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFVyaUxpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRhVHJhbnNmZXIuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERyYWdnZWRDaGF0UmVmZXJlbmNlSWRlbnRpZmllciwgQ29kZURhdGFUcmFuc2ZlcnMsIGNvbnRhaW5zRHJhZ1R5cGUsIGV4dHJhY3RDaGF0UmVmZXJlbmNlRHJvcERhdGEsIGV4dHJhY3RFZGl0b3JzRHJvcERhdGEsIGV4dHJhY3RNYXJrZXJEcm9wRGF0YSwgZXh0cmFjdE5vdGVib29rQ2VsbE91dHB1dERyb3BEYXRhLCBleHRyYWN0U3ltYm9sRHJvcERhdGEsIExvY2FsU2VsZWN0aW9uVHJhbnNmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNoYXJlZFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2ViQ29udGVudEV4dHJhY3Rvci9jb21tb24vd2ViQ29udGVudEV4dHJhY3Rvci5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGV4dHJhY3RTQ01IaXN0b3J5SXRlbURyb3BEYXRhIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2Jyb3dzZXIvc2NtSGlzdG9yeUNoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0QXR0YWNobWVudFRhcmdldCwgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLCBJbWFnZVRyYW5zZmVyRGF0YSB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNDcm9zc0FnZW50SG9zdENoYXRSZWZlcmVuY2VEcm9wLCBpc1NlbGZDaGF0UmVmZXJlbmNlRHJvcCwgcmVzb2x2ZUNoYXRSZWZlcmVuY2VEcm9wRW50cnkgfSBmcm9tICcuL2NoYXRSZWZlcmVuY2VEcm9wLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXRTdHlsZXMgfSBmcm9tICcuL2lucHV0L2NoYXRJbnB1dFBhcnQuanMnO1xuaW1wb3J0IHsgY29udmVydFN0cmluZ1RvVUludDhBcnJheSB9IGZyb20gJy4uL2NoYXRJbWFnZVV0aWxzLmpzJztcblxuZW51bSBDaGF0RHJhZ0FuZERyb3BUeXBlIHtcblx0Q0hBVF9SRUZFUkVOQ0UsXG5cdEZJTEVfSU5URVJOQUwsXG5cdEZJTEVfRVhURVJOQUwsXG5cdEZPTERFUixcblx0SU1BR0UsXG5cdFNZTUJPTCxcblx0SFRNTCxcblx0TUFSS0VSLFxuXHROT1RFQk9PS19DRUxMX09VVFBVVCxcblx0U0NNX0hJU1RPUllfSVRFTVxufVxuXG5jb25zdCBJTUFHRV9EQVRBX1JFR0VYID0gL15kYXRhOmltYWdlXFwvW2Etel0rO2Jhc2U2NCwvO1xuY29uc3QgVVJMX1JFR0VYID0gL15odHRwcz86XFwvXFwvLisvO1xuXG5leHBvcnQgY2xhc3MgQ2hhdERyYWdBbmREcm9wIGV4dGVuZHMgVGhlbWFibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb3ZlcmxheXM6IE1hcDxIVE1MRWxlbWVudCwgeyBvdmVybGF5OiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfT4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgb3ZlcmxheVRleHQ/OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBvdmVybGF5VGV4dEJhY2tncm91bmQ6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIGRpc2FibGVPdmVybGF5OiBib29sZWFuID0gZmFsc2U7XG5cblx0LyoqXG5cdCAqIEluLXByb2Nlc3MgdHJhbnNmZXIgZm9yIGEgZHJhZ2dlZCBjaGF0IHJlZmVyZW5jZS4gUmVhZGFibGUgZHVyaW5nXG5cdCAqIGBkcmFnb3ZlcmAgKHVubGlrZSB0aGUgYGRhdGFUcmFuc2ZlcmAgbWltZSBwYXlsb2FkKSwgc28gdGhlIHNlbGYtcmVmZXJlbmNlXG5cdCAqIGd1YXJkIGNhbiBzdXBwcmVzcyB0aGUgb3ZlcmxheSB3aGVuIGEgY2hhdCBpcyBkcmFnZ2VkIG9udG8gaXRzIG93biBpbnB1dC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhdFJlZmVyZW5jZVRyYW5zZmVyID0gTG9jYWxTZWxlY3Rpb25UcmFuc2Zlci5nZXRJbnN0YW5jZTxEcmFnZ2VkQ2hhdFJlZmVyZW5jZUlkZW50aWZpZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3aWRnZXRSZWY6ICgpID0+IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYXR0YWNobWVudFRhcmdldDogSUNoYXRBdHRhY2htZW50VGFyZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3R5bGVzOiBJQ2hhdElucHV0U3R5bGVzLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVNoYXJlZFdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2U6IElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlOiBJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodGhlbWVTZXJ2aWNlKTtcblxuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5vdmVybGF5cy5mb3JFYWNoKCh7IG92ZXJsYXksIGRpc3Bvc2FibGUgfSkgPT4ge1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0b3ZlcmxheS5yZW1vdmUoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLm92ZXJsYXlzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmN1cnJlbnRBY3RpdmVUYXJnZXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLm92ZXJsYXlUZXh0Py5yZW1vdmUoKTtcblx0XHRcdHRoaXMub3ZlcmxheVRleHQgPSB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXHR9XG5cblx0YWRkT3ZlcmxheSh0YXJnZXQ6IEhUTUxFbGVtZW50LCBvdmVybGF5Q29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMucmVtb3ZlT3ZlcmxheSh0YXJnZXQpO1xuXG5cdFx0Y29uc3QgeyBvdmVybGF5LCBkaXNwb3NhYmxlIH0gPSB0aGlzLmNyZWF0ZU92ZXJsYXkodGFyZ2V0LCBvdmVybGF5Q29udGFpbmVyKTtcblx0XHR0aGlzLm92ZXJsYXlzLnNldCh0YXJnZXQsIHsgb3ZlcmxheSwgZGlzcG9zYWJsZSB9KTtcblx0fVxuXG5cdHJlbW92ZU92ZXJsYXkodGFyZ2V0OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRBY3RpdmVUYXJnZXQgPT09IHRhcmdldCkge1xuXHRcdFx0dGhpcy5jdXJyZW50QWN0aXZlVGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nT3ZlcmxheSA9IHRoaXMub3ZlcmxheXMuZ2V0KHRhcmdldCk7XG5cdFx0aWYgKGV4aXN0aW5nT3ZlcmxheSkge1xuXHRcdFx0ZXhpc3RpbmdPdmVybGF5Lm92ZXJsYXkucmVtb3ZlKCk7XG5cdFx0XHRleGlzdGluZ092ZXJsYXkuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLm92ZXJsYXlzLmRlbGV0ZSh0YXJnZXQpO1xuXHRcdH1cblx0fVxuXG5cdHNldERpc2FibGVkT3ZlcmxheShkaXNhYmxlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5kaXNhYmxlT3ZlcmxheSA9IGRpc2FibGU7XG5cdH1cblxuXHRwcml2YXRlIGN1cnJlbnRBY3RpdmVUYXJnZXQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNyZWF0ZU92ZXJsYXkodGFyZ2V0OiBIVE1MRWxlbWVudCwgb3ZlcmxheUNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB7IG92ZXJsYXk6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9IHtcblx0XHRjb25zdCBvdmVybGF5ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0b3ZlcmxheS5jbGFzc0xpc3QuYWRkKCdjaGF0LWRuZC1vdmVybGF5Jyk7XG5cdFx0dGhpcy51cGRhdGVPdmVybGF5U3R5bGVzKG92ZXJsYXkpO1xuXHRcdG92ZXJsYXlDb250YWluZXIuYXBwZW5kQ2hpbGQob3ZlcmxheSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERyYWdBbmREcm9wT2JzZXJ2ZXIodGFyZ2V0LCB7XG5cdFx0XHRvbkRyYWdPdmVyOiAoZSkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5kaXNhYmxlT3ZlcmxheSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHRpZiAodGFyZ2V0ID09PSB0aGlzLmN1cnJlbnRBY3RpdmVUYXJnZXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50QWN0aXZlVGFyZ2V0KSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRPdmVybGF5KHRoaXMuY3VycmVudEFjdGl2ZVRhcmdldCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuY3VycmVudEFjdGl2ZVRhcmdldCA9IHRhcmdldDtcblxuXHRcdFx0XHR0aGlzLm9uRHJhZ0VudGVyKGUsIHRhcmdldCk7XG5cblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdMZWF2ZTogKGUpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZGlzYWJsZU92ZXJsYXkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRhcmdldCA9PT0gdGhpcy5jdXJyZW50QWN0aXZlVGFyZ2V0KSB7XG5cdFx0XHRcdFx0dGhpcy5jdXJyZW50QWN0aXZlVGFyZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5vbkRyYWdMZWF2ZShlLCB0YXJnZXQpO1xuXHRcdFx0fSxcblx0XHRcdG9uRHJvcDogKGUpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZGlzYWJsZU92ZXJsYXkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0XHRcdGlmICh0YXJnZXQgIT09IHRoaXMuY3VycmVudEFjdGl2ZVRhcmdldCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuY3VycmVudEFjdGl2ZVRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5vbkRyb3AoZSwgdGFyZ2V0KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4geyBvdmVybGF5LCBkaXNwb3NhYmxlIH07XG5cdH1cblxuXHRwcml2YXRlIG9uRHJhZ0VudGVyKGU6IERyYWdFdmVudCwgdGFyZ2V0OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVzdGltYXRlZERyb3BUeXBlID0gdGhpcy5ndWVzc0Ryb3BUeXBlKGUpO1xuXHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKGUsIHRhcmdldCwgZXN0aW1hdGVkRHJvcFR5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRyYWdMZWF2ZShlOiBEcmFnRXZlbnQsIHRhcmdldDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZURyb3BGZWVkYmFjayhlLCB0YXJnZXQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRHJvcChlOiBEcmFnRXZlbnQsIHRhcmdldDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZURyb3BGZWVkYmFjayhlLCB0YXJnZXQsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5kcm9wKGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkcm9wKGU6IERyYWdFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRleHRzID0gYXdhaXQgdGhpcy5yZXNvbHZlQXR0YWNobWVudHNGcm9tRHJhZ0V2ZW50KGUpO1xuXHRcdGlmIChjb250ZXh0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmF0dGFjaG1lbnRUYXJnZXQuYWRkQXR0YWNobWVudHMoY29udGV4dHMpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEcm9wRmVlZGJhY2soZTogRHJhZ0V2ZW50LCB0YXJnZXQ6IEhUTUxFbGVtZW50LCBkcm9wVHlwZTogQ2hhdERyYWdBbmREcm9wVHlwZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHNob3dPdmVybGF5ID0gZHJvcFR5cGUgIT09IHVuZGVmaW5lZDtcblx0XHRpZiAoZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdGUuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSBzaG93T3ZlcmxheSA/ICdjb3B5JyA6ICdub25lJztcblx0XHR9XG5cblx0XHR0aGlzLnNldE92ZXJsYXkodGFyZ2V0LCBkcm9wVHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIGd1ZXNzRHJvcFR5cGUoZTogRHJhZ0V2ZW50KTogQ2hhdERyYWdBbmREcm9wVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gVGhpcyBpcyBhbiBlc3RpbWF0aW9uIGJhc2VkIG9uIHRoZSBkYXRhdHJhbnNmZXIgdHlwZXMvaXRlbXNcblx0XHRpZiAoY29udGFpbnNEcmFnVHlwZShlLCBDb2RlRGF0YVRyYW5zZmVycy5DSEFUX1JFRkVSRU5DRSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmd1ZXNzQ2hhdFJlZmVyZW5jZURyb3BUeXBlKGUpO1xuXHRcdH0gZWxzZSBpZiAoY29udGFpbnNEcmFnVHlwZShlLCBDb2RlRGF0YVRyYW5zZmVycy5OT1RFQk9PS19DRUxMX09VVFBVVCkpIHtcblx0XHRcdHJldHVybiBDaGF0RHJhZ0FuZERyb3BUeXBlLk5PVEVCT09LX0NFTExfT1VUUFVUO1xuXHRcdH0gZWxzZSBpZiAoY29udGFpbnNEcmFnVHlwZShlLCBDb2RlRGF0YVRyYW5zZmVycy5TQ01fSElTVE9SWV9JVEVNKSkge1xuXHRcdFx0cmV0dXJuIENoYXREcmFnQW5kRHJvcFR5cGUuU0NNX0hJU1RPUllfSVRFTTtcblx0XHR9IGVsc2UgaWYgKGNvbnRhaW5zSW1hZ2VEcmFnVHlwZShlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLnNvbWUoZXh0ID0+IGlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dCwgJ2NoYXRSZWZlcmVuY2VCaW5hcnlEYXRhJykpID8gQ2hhdERyYWdBbmREcm9wVHlwZS5JTUFHRSA6IHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgJ3RleHQvaHRtbCcpKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdERyYWdBbmREcm9wVHlwZS5IVE1MO1xuXHRcdH0gZWxzZSBpZiAoY29udGFpbnNEcmFnVHlwZShlLCBDb2RlRGF0YVRyYW5zZmVycy5TWU1CT0xTKSkge1xuXHRcdFx0cmV0dXJuIENoYXREcmFnQW5kRHJvcFR5cGUuU1lNQk9MO1xuXHRcdH0gZWxzZSBpZiAoY29udGFpbnNEcmFnVHlwZShlLCBDb2RlRGF0YVRyYW5zZmVycy5NQVJLRVJTKSkge1xuXHRcdFx0cmV0dXJuIENoYXREcmFnQW5kRHJvcFR5cGUuTUFSS0VSO1xuXHRcdH0gZWxzZSBpZiAoY29udGFpbnNEcmFnVHlwZShlLCBEYXRhVHJhbnNmZXJzLkZJTEVTKSkge1xuXHRcdFx0cmV0dXJuIENoYXREcmFnQW5kRHJvcFR5cGUuRklMRV9FWFRFUk5BTDtcblx0XHR9IGVsc2UgaWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgQ29kZURhdGFUcmFuc2ZlcnMuRURJVE9SUykpIHtcblx0XHRcdHJldHVybiBDaGF0RHJhZ0FuZERyb3BUeXBlLkZJTEVfSU5URVJOQUw7XG5cdFx0fSBlbHNlIGlmIChjb250YWluc0RyYWdUeXBlKGUsIE1pbWVzLnVyaUxpc3QsIENvZGVEYXRhVHJhbnNmZXJzLkZJTEVTLCBEYXRhVHJhbnNmZXJzLlJFU09VUkNFUywgRGF0YVRyYW5zZmVycy5JTlRFUk5BTF9VUklfTElTVCkpIHtcblx0XHRcdHJldHVybiBDaGF0RHJhZ0FuZERyb3BUeXBlLkZPTERFUjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBkcm9wIHR5cGUgZm9yIGEgZHJhZ2dlZCBjaGF0IHJlZmVyZW5jZS4gT25seSBhZ2VudC1ob3N0LWJhY2tlZFxuXHQgKiBjaGF0IGlucHV0cyBjYW4gcmVmZXJlbmNlIGFub3RoZXIgY2hhdCwgYW5kIGEgY2hhdCBtYXkgcmVmZXJlbmNlIGFueSBvdGhlclxuXHQgKiBjaGF0IG9mIHRoZSAqc2FtZSBhZ2VudCBob3N0KiBcdTIwMTQgaW5jbHVkaW5nIG9uZSBmcm9tIGEgZGlmZmVyZW50IHNlc3Npb24gc2hvd25cblx0ICogc2lkZSBieSBzaWRlIGluIHRoZSBBZ2VudHMgd2luZG93LlxuXHQgKlxuXHQgKiBUd28gcGF5bG9hZC1kZXBlbmRlbnQgZ3VhcmRzIHN1cHByZXNzIHRoZSBvdmVybGF5IGVudGlyZWx5IChyYXRoZXIgdGhhblxuXHQgKiBhcHBlYXJpbmcgZHJvcHBhYmxlIGFuZCB0aGVuIGRvaW5nIG5vdGhpbmcpOlxuXHQgKiAtIGEgc2VsZi1yZWZlcmVuY2UgKGEgY2hhdCBkcm9wcGVkIG9udG8gaXRzICpvd24qIGlucHV0KSwgYW5kXG5cdCAqIC0gYSBjcm9zcy1hZ2VudC1ob3N0IHJlZmVyZW5jZSwgd2hpY2ggdGhlIG93bmluZyBob3N0IGNvdWxkIG5ldmVyIHJlc29sdmUuXG5cdCAqXG5cdCAqIFRoZSBkcmFnZ2VkIGNoYXQncyBjbGllbnQgcmVzb3VyY2UgaXMgcmVhZCBmcm9tIHRoZSBpbi1wcm9jZXNzXG5cdCAqIHtAbGluayBMb2NhbFNlbGVjdGlvblRyYW5zZmVyfSAocmVhZGFibGUgZHVyaW5nIGBkcmFnb3ZlcmApIHdpdGggdGhlXG5cdCAqIGBkYXRhVHJhbnNmZXJgIG1pbWUgcGF5bG9hZCBhcyBhIGZhbGxiYWNrIChyZWFkYWJsZSBvbiBgZHJvcGApLCBhbmQgY29tcGFyZWRcblx0ICogYWdhaW5zdCB0aGlzIGlucHV0J3Mgb3duIGNsaWVudCBzZXNzaW9uIHJlc291cmNlLiBCb3RoIGFyZSBvcGFxdWUgY2xpZW50XG5cdCAqIFVSSXMsIHNvIHRoZSB3b3JrYmVuY2ggbmV2ZXIgdG91Y2hlcyBhbiBBSFAgY2hhdCBVUkkuXG5cdCAqL1xuXHRwcml2YXRlIGd1ZXNzQ2hhdFJlZmVyZW5jZURyb3BUeXBlKGU6IERyYWdFdmVudCk6IENoYXREcmFnQW5kRHJvcFR5cGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMud2lkZ2V0UmVmKCk/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlIHx8ICFpc0FnZW50SG9zdFRhcmdldChnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGRyb3BwZWRDbGllbnRSZXNvdXJjZSA9IHRoaXMuZ2V0RHJhZ2dlZENsaWVudFJlc291cmNlKGUpO1xuXHRcdGlmIChkcm9wcGVkQ2xpZW50UmVzb3VyY2UgIT09IHVuZGVmaW5lZFxuXHRcdFx0JiYgKGlzU2VsZkNoYXRSZWZlcmVuY2VEcm9wKGRyb3BwZWRDbGllbnRSZXNvdXJjZSwgc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpXG5cdFx0XHRcdHx8IGlzQ3Jvc3NBZ2VudEhvc3RDaGF0UmVmZXJlbmNlRHJvcChkcm9wcGVkQ2xpZW50UmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBDaGF0RHJhZ0FuZERyb3BUeXBlLkNIQVRfUkVGRVJFTkNFO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBjbGllbnQgcmVzb3VyY2Ugb2YgdGhlIGRyYWdnZWQgY2hhdCByZWZlcmVuY2UgKHVzZWQgb25seSBmb3Jcblx0ICogc2VsZi1yZWZlcmVuY2UgaWRlbnRpdHkgY29tcGFyaXNvbikuIFByZWZlcnMgdGhlIGluLXByb2Nlc3MgbG9jYWwgdHJhbnNmZXJcblx0ICogKGF2YWlsYWJsZSBkdXJpbmcgYGRyYWdvdmVyYCksIGZhbGxpbmcgYmFjayB0byB0aGUgYGRhdGFUcmFuc2ZlcmAgbWltZVxuXHQgKiBwYXlsb2FkIChvbmx5IHJlYWRhYmxlIG9uIGBkcm9wYCkuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBuZWl0aGVyIHNvdXJjZVxuXHQgKiBjYXJyaWVzIGEgY2hhdCByZWZlcmVuY2UuXG5cdCAqL1xuXHRwcml2YXRlIGdldERyYWdnZWRDbGllbnRSZXNvdXJjZShlOiBEcmFnRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGxvY2FsID0gdGhpcy5jaGF0UmVmZXJlbmNlVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkQ2hhdFJlZmVyZW5jZUlkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHRpZiAobG9jYWwgJiYgbG9jYWwubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsWzBdLmNsaWVudFJlc291cmNlO1xuXHRcdH1cblx0XHRyZXR1cm4gZXh0cmFjdENoYXRSZWZlcmVuY2VEcm9wRGF0YShlKT8uY2xpZW50UmVzb3VyY2U7XG5cdH1cblxuXHRwcml2YXRlIGlzRHJhZ0V2ZW50U3VwcG9ydGVkKGU6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHRcdC8vIGlmIGd1ZXNzZWQgZHJvcCB0eXBlIGlzIHVuZGVmaW5lZCwgaXQgbWVhbnMgdGhlIGRyb3AgaXMgbm90IHN1cHBvcnRlZFxuXHRcdGNvbnN0IGRyb3BUeXBlID0gdGhpcy5ndWVzc0Ryb3BUeXBlKGUpO1xuXHRcdHJldHVybiBkcm9wVHlwZSAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREcm9wVHlwZU5hbWUodHlwZTogQ2hhdERyYWdBbmREcm9wVHlwZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0eXBlKSB7XG5cdFx0XHRjYXNlIENoYXREcmFnQW5kRHJvcFR5cGUuRklMRV9JTlRFUk5BTDogcmV0dXJuIGxvY2FsaXplKCdmaWxlJywgJ0ZpbGUnKTtcblx0XHRcdGNhc2UgQ2hhdERyYWdBbmREcm9wVHlwZS5GSUxFX0VYVEVSTkFMOiByZXR1cm4gbG9jYWxpemUoJ2ZpbGUnLCAnRmlsZScpO1xuXHRcdFx0Y2FzZSBDaGF0RHJhZ0FuZERyb3BUeXBlLkZPTERFUjogcmV0dXJuIGxvY2FsaXplKCdmb2xkZXInLCAnRm9sZGVyJyk7XG5cdFx0XHRjYXNlIENoYXREcmFnQW5kRHJvcFR5cGUuSU1BR0U6IHJldHVybiBsb2NhbGl6ZSgnaW1hZ2UnLCAnSW1hZ2UnKTtcblx0XHRcdGNhc2UgQ2hhdERyYWdBbmREcm9wVHlwZS5TWU1CT0w6IHJldHVybiBsb2NhbGl6ZSgnc3ltYm9sJywgJ1N5bWJvbCcpO1xuXHRcdFx0Y2FzZSBDaGF0RHJhZ0FuZERyb3BUeXBlLk1BUktFUjogcmV0dXJuIGxvY2FsaXplKCdwcm9ibGVtJywgJ1Byb2JsZW0nKTtcblx0XHRcdGNhc2UgQ2hhdERyYWdBbmREcm9wVHlwZS5IVE1MOiByZXR1cm4gbG9jYWxpemUoJ3VybCcsICdVUkwnKTtcblx0XHRcdGNhc2UgQ2hhdERyYWdBbmREcm9wVHlwZS5OT1RFQk9PS19DRUxMX09VVFBVVDogcmV0dXJuIGxvY2FsaXplKCdub3RlYm9va091dHB1dCcsICdPdXRwdXQnKTtcblx0XHRcdGNhc2UgQ2hhdERyYWdBbmREcm9wVHlwZS5TQ01fSElTVE9SWV9JVEVNOiByZXR1cm4gbG9jYWxpemUoJ3NjbUhpc3RvcnlJdGVtJywgJ0NoYW5nZScpO1xuXHRcdFx0Y2FzZSBDaGF0RHJhZ0FuZERyb3BUeXBlLkNIQVRfUkVGRVJFTkNFOiByZXR1cm4gbG9jYWxpemUoJ2NoYXQnLCAnQ2hhdCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUF0dGFjaG1lbnRzRnJvbURyYWdFdmVudChlOiBEcmFnRXZlbnQpOiBQcm9taXNlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXT4ge1xuXHRcdGlmICghdGhpcy5pc0RyYWdFdmVudFN1cHBvcnRlZChlKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGlmIChjb250YWluc0RyYWdUeXBlKGUsIENvZGVEYXRhVHJhbnNmZXJzLkNIQVRfUkVGRVJFTkNFKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUNoYXRSZWZlcmVuY2VBdHRhY2hDb250ZXh0KGUpO1xuXHRcdH1cblxuXHRcdGlmIChjb250YWluc0RyYWdUeXBlKGUsIENvZGVEYXRhVHJhbnNmZXJzLk5PVEVCT09LX0NFTExfT1VUUFVUKSkge1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tPdXRwdXREYXRhID0gZXh0cmFjdE5vdGVib29rQ2VsbE91dHB1dERyb3BEYXRhKGUpO1xuXHRcdFx0aWYgKG5vdGVib29rT3V0cHV0RGF0YSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnJlc29sdmVOb3RlYm9va091dHB1dEF0dGFjaENvbnRleHQobm90ZWJvb2tPdXRwdXREYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY29udGFpbnNEcmFnVHlwZShlLCBDb2RlRGF0YVRyYW5zZmVycy5TQ01fSElTVE9SWV9JVEVNKSkge1xuXHRcdFx0Y29uc3Qgc2NtSGlzdG9yeUl0ZW1EYXRhID0gZXh0cmFjdFNDTUhpc3RvcnlJdGVtRHJvcERhdGEoZSk7XG5cdFx0XHRpZiAoc2NtSGlzdG9yeUl0ZW1EYXRhKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UucmVzb2x2ZVNvdXJjZUNvbnRyb2xIaXN0b3J5SXRlbUF0dGFjaENvbnRleHQoc2NtSGlzdG9yeUl0ZW1EYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtYXJrZXJEYXRhID0gZXh0cmFjdE1hcmtlckRyb3BEYXRhKGUpO1xuXHRcdGlmIChtYXJrZXJEYXRhKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnJlc29sdmVNYXJrZXJBdHRhY2hDb250ZXh0KG1hcmtlckRhdGEpO1xuXHRcdH1cblxuXHRcdGlmIChjb250YWluc0RyYWdUeXBlKGUsIENvZGVEYXRhVHJhbnNmZXJzLlNZTUJPTFMpKSB7XG5cdFx0XHRjb25zdCBzeW1ib2xzRGF0YSA9IGV4dHJhY3RTeW1ib2xEcm9wRGF0YShlKTtcblx0XHRcdHJldHVybiB0aGlzLmNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UucmVzb2x2ZVN5bWJvbHNBdHRhY2hDb250ZXh0KHN5bWJvbHNEYXRhKTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JEcmFnRGF0YSA9IGV4dHJhY3RFZGl0b3JzRHJvcERhdGEoZSk7XG5cdFx0aWYgKGVkaXRvckRyYWdEYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBjb2FsZXNjZShhd2FpdCBQcm9taXNlLmFsbChlZGl0b3JEcmFnRGF0YS5tYXAoZWRpdG9ySW5wdXQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnJlc29sdmVFZGl0b3JBdHRhY2hDb250ZXh0KGVkaXRvcklucHV0KTtcblx0XHRcdH0pKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW50ZXJuYWwgPSBlLmRhdGFUcmFuc2Zlcj8uZ2V0RGF0YShEYXRhVHJhbnNmZXJzLklOVEVSTkFMX1VSSV9MSVNUKTtcblx0XHRpZiAoaW50ZXJuYWwpIHtcblx0XHRcdGNvbnN0IHVyaUxpc3QgPSBVcmlMaXN0LnBhcnNlKGludGVybmFsKTtcblx0XHRcdGlmICh1cmlMaXN0Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gY29hbGVzY2UoYXdhaXQgUHJvbWlzZS5hbGwoXG5cdFx0XHRcdFx0dXJpTGlzdC5tYXAodXJpID0+IHRoaXMuY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlRWRpdG9yQXR0YWNoQ29udGV4dCh7IHJlc291cmNlOiBVUkkucGFyc2UodXJpKSB9KSlcblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFjb250YWluc0RyYWdUeXBlKGUsIERhdGFUcmFuc2ZlcnMuSU5URVJOQUxfVVJJX0xJU1QpICYmIGNvbnRhaW5zRHJhZ1R5cGUoZSwgTWltZXMudXJpTGlzdCkgJiYgKChjb250YWluc0RyYWdUeXBlKGUsIE1pbWVzLmh0bWwpIHx8IGNvbnRhaW5zRHJhZ1R5cGUoZSwgTWltZXMudGV4dCkgLyogVGV4dCBtaW1lIG5lZWRlZCBmb3Igc2FmYXJpIHN1cHBvcnQgKi8pKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUhUTUxBdHRhY2hDb250ZXh0KGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIGRyb3BwZWQgY2hhdCByZWZlcmVuY2UgKGEgY2hhdCB0YWIgZnJvbSB0aGUgQWdlbnRzIHdpbmRvdykgdG8gYVxuXHQgKiBwbGFpbiBjaGF0LXJlZmVyZW5jZSBhdHRhY2htZW50IChhIHBpbGwpIFx1MjAxNCB0aGUgc2FtZSBzaGFwZSBldmVyeSBvdGhlciBkcm9wXG5cdCAqIHR5cGUgcHJvZHVjZXMsIHdpdGggbm8gaW5saW5lIHRleHQsIHJhbmdlLCBvciBlZGl0b3IgbWFuaXB1bGF0aW9uLlxuXHQgKlxuXHQgKiBUaGUgdGFyZ2V0IG11c3QgYmUgYW4gYWdlbnQtaG9zdC1iYWNrZWQgaW5wdXQ7IHRoZSBhY3R1YWwgcmVzb2x1dGlvbiBhbmRcblx0ICogdGhlIHNlbGYgLyBjcm9zcy1hZ2VudC1ob3N0IGd1YXJkcyBsaXZlIGluIHtAbGluayByZXNvbHZlQ2hhdFJlZmVyZW5jZURyb3BFbnRyeX0uXG5cdCAqIFJldHVybnMgYFtdYCB3aGVuIGFueSBndWFyZCByZWplY3RzLlxuXHQgKi9cblx0cHJpdmF0ZSByZXNvbHZlQ2hhdFJlZmVyZW5jZUF0dGFjaENvbnRleHQoZTogRHJhZ0V2ZW50KTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHtcblx0XHRjb25zdCBkYXRhID0gZXh0cmFjdENoYXRSZWZlcmVuY2VEcm9wRGF0YShlKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLndpZGdldFJlZigpPy52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBvd25DbGllbnRSZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZSAmJiBpc0FnZW50SG9zdFRhcmdldChnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSlcblx0XHRcdD8gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgZW50cnkgPSByZXNvbHZlQ2hhdFJlZmVyZW5jZURyb3BFbnRyeShkYXRhLCBvd25DbGllbnRSZXNvdXJjZSk7XG5cdFx0cmV0dXJuIGVudHJ5ID8gW2VudHJ5XSA6IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb3dubG9hZEltYWdlQXNVaW50OEFycmF5KHVybDogc3RyaW5nKTogUHJvbWlzZTxVaW50OEFycmF5IHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV4dHJhY3RlZEltYWdlcyA9IGF3YWl0IHRoaXMud2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UucmVhZEltYWdlKFVSSS5wYXJzZSh1cmwpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChleHRyYWN0ZWRJbWFnZXMpIHtcblx0XHRcdFx0cmV0dXJuIGV4dHJhY3RlZEltYWdlcy5idWZmZXI7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdGZXRjaCBmYWlsZWQ6JywgZXJyb3IpO1xuXHRcdH1cblxuXHRcdC8vIFRPRE86IHVzZSBkbmQgcHJvdmlkZXIgdG8gaW5zZXJ0IHRleHQgQGp1c3RzY2hlblxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMud2lkZ2V0UmVmKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gd2lkZ2V0Py5pbnB1dEVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2VsZWN0aW9uICYmIHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmlucHV0RWRpdG9yLmV4ZWN1dGVFZGl0cygnY2hhdEluc2VydFVybCcsIFt7IHJhbmdlOiBzZWxlY3Rpb24sIHRleHQ6IHVybCB9XSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEltYWdlIFVSTHMgbXVzdCBlbmQgaW4gLmpwZywgLnBuZywgLmdpZiwgLndlYnAsIG9yIC5ibXAuIEZhaWxlZCB0byBmZXRjaCBpbWFnZSBmcm9tIHRoaXMgVVJMOiAke3VybH1gKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlSFRNTEF0dGFjaENvbnRleHQoZTogRHJhZ0V2ZW50KTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10+IHtcblx0XHRjb25zdCBleGlzdGluZ0F0dGFjaG1lbnROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPih0aGlzLmF0dGFjaG1lbnRUYXJnZXQuYXR0YWNobWVudHMubWFwKGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudC5uYW1lKSk7XG5cdFx0Y29uc3QgY3JlYXRlRGlzcGxheU5hbWUgPSAoKTogc3RyaW5nID0+IHtcblx0XHRcdGNvbnN0IGJhc2VOYW1lID0gbG9jYWxpemUoJ2RyYWdBbmREcm9wcGVkSW1hZ2VOYW1lJywgJ0ltYWdlIGZyb20gVVJMJyk7XG5cdFx0XHRsZXQgdW5pcXVlTmFtZSA9IGJhc2VOYW1lO1xuXHRcdFx0bGV0IGJhc2VOYW1lSW5zdGFuY2UgPSAxO1xuXG5cdFx0XHR3aGlsZSAoZXhpc3RpbmdBdHRhY2htZW50TmFtZXMuaGFzKHVuaXF1ZU5hbWUpKSB7XG5cdFx0XHRcdHVuaXF1ZU5hbWUgPSBgJHtiYXNlTmFtZX0gJHsrK2Jhc2VOYW1lSW5zdGFuY2V9YDtcblx0XHRcdH1cblxuXHRcdFx0ZXhpc3RpbmdBdHRhY2htZW50TmFtZXMuYWRkKHVuaXF1ZU5hbWUpO1xuXHRcdFx0cmV0dXJuIHVuaXF1ZU5hbWU7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdldEltYWdlVHJhbnNmZXJEYXRhRnJvbVVybCA9IGFzeW5jICh1cmw6IHN0cmluZyk6IFByb21pc2U8SW1hZ2VUcmFuc2ZlckRhdGEgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKHVybCk7XG5cblx0XHRcdGlmIChJTUFHRV9EQVRBX1JFR0VYLnRlc3QodXJsKSkge1xuXHRcdFx0XHRyZXR1cm4geyBkYXRhOiBjb252ZXJ0U3RyaW5nVG9VSW50OEFycmF5KHVybCksIG5hbWU6IGNyZWF0ZURpc3BsYXlOYW1lKCksIHJlc291cmNlIH07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChVUkxfUkVHRVgudGVzdCh1cmwpKSB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCB0aGlzLmRvd25sb2FkSW1hZ2VBc1VpbnQ4QXJyYXkodXJsKTtcblx0XHRcdFx0aWYgKGRhdGEpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBkYXRhLCBuYW1lOiBjcmVhdGVEaXNwbGF5TmFtZSgpLCByZXNvdXJjZSwgaWQ6IHVybCB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdldEltYWdlVHJhbnNmZXJEYXRhRnJvbUZpbGUgPSBhc3luYyAoZmlsZTogRmlsZSk6IFByb21pc2U8SW1hZ2VUcmFuc2ZlckRhdGEgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGJ1ZmZlciA9IGF3YWl0IGZpbGUuYXJyYXlCdWZmZXIoKTtcblx0XHRcdFx0cmV0dXJuIHsgZGF0YTogbmV3IFVpbnQ4QXJyYXkoYnVmZmVyKSwgbmFtZTogY3JlYXRlRGlzcGxheU5hbWUoKSB9O1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdFcnJvciByZWFkaW5nIGZpbGU6JywgZXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHRjb25zdCBpbWFnZVRyYW5zZmVyRGF0YTogSW1hZ2VUcmFuc2ZlckRhdGFbXSA9IFtdO1xuXG5cdFx0Ly8gSW1hZ2UgV2ViIEZpbGUgRHJhZyBhbmQgRHJvcFxuXHRcdGNvbnN0IGltYWdlRmlsZXMgPSBleHRyYWN0SW1hZ2VGaWxlc0Zyb21EcmFnRXZlbnQoZSk7XG5cdFx0aWYgKGltYWdlRmlsZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBpbWFnZVRyYW5zZmVyRGF0YUZyb21GaWxlcyA9IGF3YWl0IFByb21pc2UuYWxsKGltYWdlRmlsZXMubWFwKGZpbGUgPT4gZ2V0SW1hZ2VUcmFuc2ZlckRhdGFGcm9tRmlsZShmaWxlKSkpO1xuXHRcdFx0aW1hZ2VUcmFuc2ZlckRhdGEucHVzaCguLi5pbWFnZVRyYW5zZmVyRGF0YUZyb21GaWxlcy5maWx0ZXIoZGF0YSA9PiAhIWRhdGEpKTtcblx0XHR9XG5cblx0XHQvLyBJbWFnZSBXZWIgVVJMIERyYWcgYW5kIERyb3Bcblx0XHRjb25zdCBpbWFnZVVybHMgPSBleHRyYWN0VXJsc0Zyb21EcmFnRXZlbnQoZSk7XG5cdFx0aWYgKGltYWdlVXJscy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGltYWdlVHJhbnNmZXJEYXRhRnJvbVVybCA9IGF3YWl0IFByb21pc2UuYWxsKGltYWdlVXJscy5tYXAoZ2V0SW1hZ2VUcmFuc2ZlckRhdGFGcm9tVXJsKSk7XG5cdFx0XHRpbWFnZVRyYW5zZmVyRGF0YS5wdXNoKC4uLmltYWdlVHJhbnNmZXJEYXRhRnJvbVVybC5maWx0ZXIoZGF0YSA9PiAhIWRhdGEpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnJlc29sdmVJbWFnZUF0dGFjaENvbnRleHQoaW1hZ2VUcmFuc2ZlckRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRPdmVybGF5KHRhcmdldDogSFRNTEVsZW1lbnQsIHR5cGU6IENoYXREcmFnQW5kRHJvcFR5cGUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBSZW1vdmUgYW55IHByZXZpb3VzIG92ZXJsYXkgdGV4dFxuXHRcdHRoaXMub3ZlcmxheVRleHQ/LnJlbW92ZSgpO1xuXHRcdHRoaXMub3ZlcmxheVRleHQgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB7IG92ZXJsYXkgfSA9IHRoaXMub3ZlcmxheXMuZ2V0KHRhcmdldCkhO1xuXHRcdGlmICh0eXBlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFJlbmRlciB0aGUgb3ZlcmxheSB0ZXh0XG5cblx0XHRcdGNvbnN0IGljb25BbmR0ZXh0RWxlbWVudHMgPSByZW5kZXJMYWJlbFdpdGhJY29ucyhgJCgke0NvZGljb24uYXR0YWNoLmlkfSkgJHt0aGlzLmdldE92ZXJsYXlUZXh0KHR5cGUpfWApO1xuXHRcdFx0Y29uc3QgaHRtbEVsZW1lbnRzID0gaWNvbkFuZHRleHRFbGVtZW50cy5tYXAoZWxlbWVudCA9PiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRyZXR1cm4gJCgnc3Bhbi5vdmVybGF5LXRleHQnLCB1bmRlZmluZWQsIGVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlbGVtZW50O1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMub3ZlcmxheVRleHQgPSAkKCdzcGFuLmF0dGFjaC1jb250ZXh0LW92ZXJsYXktdGV4dCcsIHVuZGVmaW5lZCwgLi4uaHRtbEVsZW1lbnRzKTtcblx0XHRcdHRoaXMub3ZlcmxheVRleHQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gdGhpcy5vdmVybGF5VGV4dEJhY2tncm91bmQ7XG5cdFx0XHRvdmVybGF5LmFwcGVuZENoaWxkKHRoaXMub3ZlcmxheVRleHQpO1xuXHRcdH1cblxuXHRcdG92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgndmlzaWJsZScsIHR5cGUgIT09IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE92ZXJsYXlUZXh0KHR5cGU6IENoYXREcmFnQW5kRHJvcFR5cGUpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHR5cGVOYW1lID0gdGhpcy5nZXREcm9wVHlwZU5hbWUodHlwZSk7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhdHRhY0FzQ29udGV4dCcsICdBdHRhY2ggezB9IGFzIENvbnRleHQnLCB0eXBlTmFtZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU92ZXJsYXlTdHlsZXMob3ZlcmxheTogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRvdmVybGF5LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHRoaXMuZ2V0Q29sb3IodGhpcy5zdHlsZXMub3ZlcmxheUJhY2tncm91bmQpIHx8ICcnO1xuXHRcdG92ZXJsYXkuc3R5bGUuY29sb3IgPSB0aGlzLmdldENvbG9yKHRoaXMuc3R5bGVzLmxpc3RGb3JlZ3JvdW5kKSB8fCAnJztcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHR0aGlzLm92ZXJsYXlzLmZvckVhY2gob3ZlcmxheSA9PiB0aGlzLnVwZGF0ZU92ZXJsYXlTdHlsZXMob3ZlcmxheS5vdmVybGF5KSk7XG5cdFx0dGhpcy5vdmVybGF5VGV4dEJhY2tncm91bmQgPSB0aGlzLmdldENvbG9yKHRoaXMuc3R5bGVzLmxpc3RCYWNrZ3JvdW5kKSB8fCAnJztcblx0fVxufVxuXG5mdW5jdGlvbiBjb250YWluc0ltYWdlRHJhZ1R5cGUoZTogRHJhZ0V2ZW50KTogYm9vbGVhbiB7XG5cdC8vIEltYWdlIGRldGVjdGlvbiBzaG91bGQgbm90IGhhdmUgZmFsc2UgcG9zaXRpdmVzLCBvbmx5IGZhbHNlIG5lZ2F0aXZlcyBhcmUgYWxsb3dlZFxuXHRpZiAoY29udGFpbnNEcmFnVHlwZShlLCAnaW1hZ2UnKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgRGF0YVRyYW5zZmVycy5GSUxFUykpIHtcblx0XHRjb25zdCBmaWxlcyA9IGUuZGF0YVRyYW5zZmVyPy5maWxlcztcblx0XHRpZiAoZmlsZXMgJiYgZmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20oZmlsZXMpLnNvbWUoZmlsZSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aCgnaW1hZ2UvJykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zID0gZS5kYXRhVHJhbnNmZXI/Lml0ZW1zO1xuXHRcdGlmIChpdGVtcyAmJiBpdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gQXJyYXkuZnJvbShpdGVtcykuc29tZShpdGVtID0+IGl0ZW0udHlwZS5zdGFydHNXaXRoKCdpbWFnZS8nKSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBleHRyYWN0VXJsc0Zyb21EcmFnRXZlbnQoZTogRHJhZ0V2ZW50LCBsb2dTZXJ2aWNlPzogSUxvZ1NlcnZpY2UpOiBzdHJpbmdbXSB7XG5cdGNvbnN0IHRleHRVcmwgPSBlLmRhdGFUcmFuc2Zlcj8uZ2V0RGF0YSgndGV4dC91cmktbGlzdCcpO1xuXHRpZiAodGV4dFVybCkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB1cmxzID0gVXJpTGlzdC5wYXJzZSh0ZXh0VXJsKTtcblx0XHRcdGlmICh1cmxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmV0dXJuIHVybHM7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvZ1NlcnZpY2U/LmVycm9yKCdFcnJvciBwYXJzaW5nIFVSSSBsaXN0OicsIGVycm9yKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gW107XG59XG5cbmZ1bmN0aW9uIGV4dHJhY3RJbWFnZUZpbGVzRnJvbURyYWdFdmVudChlOiBEcmFnRXZlbnQpOiBGaWxlW10ge1xuXHRjb25zdCBmaWxlcyA9IGUuZGF0YVRyYW5zZmVyPy5maWxlcztcblx0aWYgKCFmaWxlcykge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHJldHVybiBBcnJheS5mcm9tKGZpbGVzKS5maWx0ZXIoZmlsZSA9PiBmaWxlLnR5cGUuc3RhcnRzV2l0aCgnaW1hZ2UvJykpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLEdBQUcsMkJBQTJCO0FBQ3ZDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBc0Isb0JBQW9CO0FBQzFDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQ0FBZ0MsbUJBQW1CLGtCQUFrQiw4QkFBOEIsd0JBQXdCLHVCQUF1QixtQ0FBbUMsdUJBQXVCLDhCQUE4QjtBQUNuUCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWUsZ0JBQWdCO0FBQ3hDLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsbUJBQW1CLDRCQUE0QjtBQUN4RCxTQUFTLHFDQUFxQztBQUU5QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLHFDQUF3RDtBQUNqRSxTQUFTLG1DQUFtQyx5QkFBeUIscUNBQXFDO0FBRTFHLFNBQVMsaUNBQWlDO0FBRTFDLElBQUssc0JBQUwsa0JBQUtBLHlCQUFMO0FBQ0MsRUFBQUEsMENBQUE7QUFDQSxFQUFBQSwwQ0FBQTtBQUNBLEVBQUFBLDBDQUFBO0FBQ0EsRUFBQUEsMENBQUE7QUFDQSxFQUFBQSwwQ0FBQTtBQUNBLEVBQUFBLDBDQUFBO0FBQ0EsRUFBQUEsMENBQUE7QUFDQSxFQUFBQSwwQ0FBQTtBQUNBLEVBQUFBLDBDQUFBO0FBQ0EsRUFBQUEsMENBQUE7QUFWSSxTQUFBQTtBQUFBLEdBQUE7QUFhTCxNQUFNLG1CQUFtQjtBQUN6QixNQUFNLFlBQVk7QUFFWCxJQUFNLGtCQUFOLGNBQThCLFNBQVM7QUFBQSxFQWM3QyxZQUNrQixXQUNBLGtCQUNBLFFBQ0YsY0FDcUIsa0JBQ2dCLDRCQUN0QixZQUNrQiw4QkFDL0M7QUFDRCxVQUFNLFlBQVk7QUFURDtBQUNBO0FBQ0E7QUFFbUI7QUFDZ0I7QUFDdEI7QUFDa0I7QUFwQmpELFNBQWlCLFdBQWdGLG9CQUFJLElBQUk7QUFFekcsU0FBUSx3QkFBZ0M7QUFDeEMsU0FBUSxpQkFBMEI7QUFPbEM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLHdCQUF3Qix1QkFBdUIsWUFBNEM7QUFxRDVHLFNBQVEsc0JBQStDO0FBdkN0RCxTQUFLLGFBQWE7QUFFbEIsU0FBSyxVQUFVLGFBQWEsTUFBTTtBQUNqQyxXQUFLLFNBQVMsUUFBUSxDQUFDLEVBQUUsU0FBUyxXQUFXLE1BQU07QUFDbEQsbUJBQVcsUUFBUTtBQUNuQixnQkFBUSxPQUFPO0FBQUEsTUFDaEIsQ0FBQztBQUVELFdBQUssU0FBUyxNQUFNO0FBQ3BCLFdBQUssc0JBQXNCO0FBQzNCLFdBQUssYUFBYSxPQUFPO0FBQ3pCLFdBQUssY0FBYztBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLFdBQVcsUUFBcUIsa0JBQXFDO0FBQ3BFLFNBQUssY0FBYyxNQUFNO0FBRXpCLFVBQU0sRUFBRSxTQUFTLFdBQVcsSUFBSSxLQUFLLGNBQWMsUUFBUSxnQkFBZ0I7QUFDM0UsU0FBSyxTQUFTLElBQUksUUFBUSxFQUFFLFNBQVMsV0FBVyxDQUFDO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLGNBQWMsUUFBMkI7QUFDeEMsUUFBSSxLQUFLLHdCQUF3QixRQUFRO0FBQ3hDLFdBQUssc0JBQXNCO0FBQUEsSUFDNUI7QUFFQSxVQUFNLGtCQUFrQixLQUFLLFNBQVMsSUFBSSxNQUFNO0FBQ2hELFFBQUksaUJBQWlCO0FBQ3BCLHNCQUFnQixRQUFRLE9BQU87QUFDL0Isc0JBQWdCLFdBQVcsUUFBUTtBQUNuQyxXQUFLLFNBQVMsT0FBTyxNQUFNO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFQSxtQkFBbUIsU0FBa0I7QUFDcEMsU0FBSyxpQkFBaUI7QUFBQSxFQUN2QjtBQUFBLEVBR1EsY0FBYyxRQUFxQixrQkFBa0Y7QUFDNUgsVUFBTSxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzVDLFlBQVEsVUFBVSxJQUFJLGtCQUFrQjtBQUN4QyxTQUFLLG9CQUFvQixPQUFPO0FBQ2hDLHFCQUFpQixZQUFZLE9BQU87QUFFcEMsVUFBTSxhQUFhLElBQUksb0JBQW9CLFFBQVE7QUFBQSxNQUNsRCxZQUFZLENBQUMsTUFBTTtBQUNsQixZQUFJLEtBQUssZ0JBQWdCO0FBQ3hCO0FBQUEsUUFDRDtBQUVBLFVBQUUsZ0JBQWdCO0FBQ2xCLFVBQUUsZUFBZTtBQUVqQixZQUFJLFdBQVcsS0FBSyxxQkFBcUI7QUFDeEM7QUFBQSxRQUNEO0FBRUEsWUFBSSxLQUFLLHFCQUFxQjtBQUM3QixlQUFLLFdBQVcsS0FBSyxxQkFBcUIsTUFBUztBQUFBLFFBQ3BEO0FBRUEsYUFBSyxzQkFBc0I7QUFFM0IsYUFBSyxZQUFZLEdBQUcsTUFBTTtBQUFBLE1BRTNCO0FBQUEsTUFDQSxhQUFhLENBQUMsTUFBTTtBQUNuQixZQUFJLEtBQUssZ0JBQWdCO0FBQ3hCO0FBQUEsUUFDRDtBQUNBLFlBQUksV0FBVyxLQUFLLHFCQUFxQjtBQUN4QyxlQUFLLHNCQUFzQjtBQUFBLFFBQzVCO0FBRUEsYUFBSyxZQUFZLEdBQUcsTUFBTTtBQUFBLE1BQzNCO0FBQUEsTUFDQSxRQUFRLENBQUMsTUFBTTtBQUNkLFlBQUksS0FBSyxnQkFBZ0I7QUFDeEI7QUFBQSxRQUNEO0FBQ0EsVUFBRSxnQkFBZ0I7QUFDbEIsVUFBRSxlQUFlO0FBRWpCLFlBQUksV0FBVyxLQUFLLHFCQUFxQjtBQUN4QztBQUFBLFFBQ0Q7QUFFQSxhQUFLLHNCQUFzQjtBQUMzQixhQUFLLE9BQU8sR0FBRyxNQUFNO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLEVBQUUsU0FBUyxXQUFXO0FBQUEsRUFDOUI7QUFBQSxFQUVRLFlBQVksR0FBYyxRQUEyQjtBQUM1RCxVQUFNLG9CQUFvQixLQUFLLGNBQWMsQ0FBQztBQUM5QyxTQUFLLG1CQUFtQixHQUFHLFFBQVEsaUJBQWlCO0FBQUEsRUFDckQ7QUFBQSxFQUVRLFlBQVksR0FBYyxRQUEyQjtBQUM1RCxTQUFLLG1CQUFtQixHQUFHLFFBQVEsTUFBUztBQUFBLEVBQzdDO0FBQUEsRUFFUSxPQUFPLEdBQWMsUUFBMkI7QUFDdkQsU0FBSyxtQkFBbUIsR0FBRyxRQUFRLE1BQVM7QUFDNUMsU0FBSyxLQUFLLENBQUM7QUFBQSxFQUNaO0FBQUEsRUFFQSxNQUFjLEtBQUssR0FBNkI7QUFDL0MsVUFBTSxXQUFXLE1BQU0sS0FBSyxnQ0FBZ0MsQ0FBQztBQUM3RCxRQUFJLFNBQVMsV0FBVyxHQUFHO0FBQzFCO0FBQUEsSUFDRDtBQUVBLFNBQUssaUJBQWlCLGVBQWUsUUFBUTtBQUFBLEVBQzlDO0FBQUEsRUFFUSxtQkFBbUIsR0FBYyxRQUFxQixVQUFpRDtBQUM5RyxVQUFNLGNBQWMsYUFBYTtBQUNqQyxRQUFJLEVBQUUsY0FBYztBQUNuQixRQUFFLGFBQWEsYUFBYSxjQUFjLFNBQVM7QUFBQSxJQUNwRDtBQUVBLFNBQUssV0FBVyxRQUFRLFFBQVE7QUFBQSxFQUNqQztBQUFBLEVBRVEsY0FBYyxHQUErQztBQUVwRSxRQUFJLGlCQUFpQixHQUFHLGtCQUFrQixjQUFjLEdBQUc7QUFDMUQsYUFBTyxLQUFLLDJCQUEyQixDQUFDO0FBQUEsSUFDekMsV0FBVyxpQkFBaUIsR0FBRyxrQkFBa0Isb0JBQW9CLEdBQUc7QUFDdkUsYUFBTztBQUFBLElBQ1IsV0FBVyxpQkFBaUIsR0FBRyxrQkFBa0IsZ0JBQWdCLEdBQUc7QUFDbkUsYUFBTztBQUFBLElBQ1IsV0FBVyxzQkFBc0IsQ0FBQyxHQUFHO0FBQ3BDLGFBQU8sS0FBSyxpQkFBaUIsV0FBVyxLQUFLLFNBQU8scUJBQXFCLEtBQUsseUJBQXlCLENBQUMsSUFBSSxnQkFBNEI7QUFBQSxJQUN6SSxXQUFXLGlCQUFpQixHQUFHLFdBQVcsR0FBRztBQUM1QyxhQUFPO0FBQUEsSUFDUixXQUFXLGlCQUFpQixHQUFHLGtCQUFrQixPQUFPLEdBQUc7QUFDMUQsYUFBTztBQUFBLElBQ1IsV0FBVyxpQkFBaUIsR0FBRyxrQkFBa0IsT0FBTyxHQUFHO0FBQzFELGFBQU87QUFBQSxJQUNSLFdBQVcsaUJBQWlCLEdBQUcsY0FBYyxLQUFLLEdBQUc7QUFDcEQsYUFBTztBQUFBLElBQ1IsV0FBVyxpQkFBaUIsR0FBRyxrQkFBa0IsT0FBTyxHQUFHO0FBQzFELGFBQU87QUFBQSxJQUNSLFdBQVcsaUJBQWlCLEdBQUcsTUFBTSxTQUFTLGtCQUFrQixPQUFPLGNBQWMsV0FBVyxjQUFjLGlCQUFpQixHQUFHO0FBQ2pJLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFtQlEsMkJBQTJCLEdBQStDO0FBQ2pGLFVBQU0sa0JBQWtCLEtBQUssVUFBVSxHQUFHLFdBQVcsTUFBTTtBQUMzRCxRQUFJLENBQUMsbUJBQW1CLENBQUMsa0JBQWtCLG1CQUFtQixlQUFlLENBQUMsR0FBRztBQUNoRixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sd0JBQXdCLEtBQUsseUJBQXlCLENBQUM7QUFDN0QsUUFBSSwwQkFBMEIsV0FDekIsd0JBQXdCLHVCQUF1QixnQkFBZ0IsU0FBUyxDQUFDLEtBQ3pFLGtDQUFrQyx1QkFBdUIsZ0JBQWdCLFNBQVMsQ0FBQyxJQUFJO0FBQzNGLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1EseUJBQXlCLEdBQWtDO0FBQ2xFLFVBQU0sUUFBUSxLQUFLLHNCQUFzQixRQUFRLCtCQUErQixTQUFTO0FBQ3pGLFFBQUksU0FBUyxNQUFNLFNBQVMsR0FBRztBQUM5QixhQUFPLE1BQU0sQ0FBQyxFQUFFO0FBQUEsSUFDakI7QUFDQSxXQUFPLDZCQUE2QixDQUFDLEdBQUc7QUFBQSxFQUN6QztBQUFBLEVBRVEscUJBQXFCLEdBQXVCO0FBRW5ELFVBQU0sV0FBVyxLQUFLLGNBQWMsQ0FBQztBQUNyQyxXQUFPLGFBQWE7QUFBQSxFQUNyQjtBQUFBLEVBRVEsZ0JBQWdCLE1BQW1DO0FBQzFELFlBQVEsTUFBTTtBQUFBLE1BQ2IsS0FBSztBQUFtQyxlQUFPLFNBQVMsUUFBUSxNQUFNO0FBQUEsTUFDdEUsS0FBSztBQUFtQyxlQUFPLFNBQVMsUUFBUSxNQUFNO0FBQUEsTUFDdEUsS0FBSztBQUE0QixlQUFPLFNBQVMsVUFBVSxRQUFRO0FBQUEsTUFDbkUsS0FBSztBQUEyQixlQUFPLFNBQVMsU0FBUyxPQUFPO0FBQUEsTUFDaEUsS0FBSztBQUE0QixlQUFPLFNBQVMsVUFBVSxRQUFRO0FBQUEsTUFDbkUsS0FBSztBQUE0QixlQUFPLFNBQVMsV0FBVyxTQUFTO0FBQUEsTUFDckUsS0FBSztBQUEwQixlQUFPLFNBQVMsT0FBTyxLQUFLO0FBQUEsTUFDM0QsS0FBSztBQUEwQyxlQUFPLFNBQVMsa0JBQWtCLFFBQVE7QUFBQSxNQUN6RixLQUFLO0FBQXNDLGVBQU8sU0FBUyxrQkFBa0IsUUFBUTtBQUFBLE1BQ3JGLEtBQUs7QUFBb0MsZUFBTyxTQUFTLFFBQVEsTUFBTTtBQUFBLElBQ3hFO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxnQ0FBZ0MsR0FBb0Q7QUFDakcsUUFBSSxDQUFDLEtBQUsscUJBQXFCLENBQUMsR0FBRztBQUNsQyxhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsUUFBSSxpQkFBaUIsR0FBRyxrQkFBa0IsY0FBYyxHQUFHO0FBQzFELGFBQU8sS0FBSyxrQ0FBa0MsQ0FBQztBQUFBLElBQ2hEO0FBRUEsUUFBSSxpQkFBaUIsR0FBRyxrQkFBa0Isb0JBQW9CLEdBQUc7QUFDaEUsWUFBTSxxQkFBcUIsa0NBQWtDLENBQUM7QUFDOUQsVUFBSSxvQkFBb0I7QUFDdkIsZUFBTyxLQUFLLDZCQUE2QixtQ0FBbUMsa0JBQWtCO0FBQUEsTUFDL0Y7QUFBQSxJQUNEO0FBRUEsUUFBSSxpQkFBaUIsR0FBRyxrQkFBa0IsZ0JBQWdCLEdBQUc7QUFDNUQsWUFBTSxxQkFBcUIsOEJBQThCLENBQUM7QUFDMUQsVUFBSSxvQkFBb0I7QUFDdkIsZUFBTyxLQUFLLDZCQUE2Qiw2Q0FBNkMsa0JBQWtCO0FBQUEsTUFDekc7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLHNCQUFzQixDQUFDO0FBQzFDLFFBQUksWUFBWTtBQUNmLGFBQU8sS0FBSyw2QkFBNkIsMkJBQTJCLFVBQVU7QUFBQSxJQUMvRTtBQUVBLFFBQUksaUJBQWlCLEdBQUcsa0JBQWtCLE9BQU8sR0FBRztBQUNuRCxZQUFNLGNBQWMsc0JBQXNCLENBQUM7QUFDM0MsYUFBTyxLQUFLLDZCQUE2Qiw0QkFBNEIsV0FBVztBQUFBLElBQ2pGO0FBRUEsVUFBTSxpQkFBaUIsdUJBQXVCLENBQUM7QUFDL0MsUUFBSSxlQUFlLFNBQVMsR0FBRztBQUM5QixhQUFPLFNBQVMsTUFBTSxRQUFRLElBQUksZUFBZSxJQUFJLGlCQUFlO0FBQ25FLGVBQU8sS0FBSyw2QkFBNkIsMkJBQTJCLFdBQVc7QUFBQSxNQUNoRixDQUFDLENBQUMsQ0FBQztBQUFBLElBQ0o7QUFFQSxVQUFNLFdBQVcsRUFBRSxjQUFjLFFBQVEsY0FBYyxpQkFBaUI7QUFDeEUsUUFBSSxVQUFVO0FBQ2IsWUFBTSxVQUFVLFFBQVEsTUFBTSxRQUFRO0FBQ3RDLFVBQUksUUFBUSxRQUFRO0FBQ25CLGVBQU8sU0FBUyxNQUFNLFFBQVE7QUFBQSxVQUM3QixRQUFRLElBQUksU0FBTyxLQUFLLDZCQUE2QiwyQkFBMkIsRUFBRSxVQUFVLElBQUksTUFBTSxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQUEsUUFDOUcsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLGlCQUFpQixHQUFHLGNBQWMsaUJBQWlCLEtBQUssaUJBQWlCLEdBQUcsTUFBTSxPQUFPLE1BQU8saUJBQWlCLEdBQUcsTUFBTSxJQUFJLEtBQUssaUJBQWlCLEdBQUcsTUFBTSxJQUFJLElBQStDO0FBQ3BOLGFBQU8sS0FBSyx5QkFBeUIsQ0FBQztBQUFBLElBQ3ZDO0FBRUEsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV1Esa0NBQWtDLEdBQTJDO0FBQ3BGLFVBQU0sT0FBTyw2QkFBNkIsQ0FBQztBQUMzQyxRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLGtCQUFrQixLQUFLLFVBQVUsR0FBRyxXQUFXLE1BQU07QUFDM0QsVUFBTSxvQkFBb0IsbUJBQW1CLGtCQUFrQixtQkFBbUIsZUFBZSxDQUFDLElBQy9GLGdCQUFnQixTQUFTLElBQ3pCO0FBRUgsVUFBTSxRQUFRLDhCQUE4QixNQUFNLGlCQUFpQjtBQUNuRSxXQUFPLFFBQVEsQ0FBQyxLQUFLLElBQUksQ0FBQztBQUFBLEVBQzNCO0FBQUEsRUFFQSxNQUFjLDBCQUEwQixLQUE4QztBQUNyRixRQUFJO0FBQ0gsWUFBTSxrQkFBa0IsTUFBTSxLQUFLLDJCQUEyQixVQUFVLElBQUksTUFBTSxHQUFHLEdBQUcsa0JBQWtCLElBQUk7QUFDOUcsVUFBSSxpQkFBaUI7QUFDcEIsZUFBTyxnQkFBZ0I7QUFBQSxNQUN4QjtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLEtBQUssaUJBQWlCLEtBQUs7QUFBQSxJQUM1QztBQUdBLFVBQU0sU0FBUyxLQUFLLFVBQVU7QUFDOUIsVUFBTSxZQUFZLFFBQVEsWUFBWSxhQUFhO0FBQ25ELFFBQUksYUFBYSxRQUFRO0FBQ3hCLGFBQU8sWUFBWSxhQUFhLGlCQUFpQixDQUFDLEVBQUUsT0FBTyxXQUFXLE1BQU0sSUFBSSxDQUFDLENBQUM7QUFBQSxJQUNuRjtBQUVBLFNBQUssV0FBVyxLQUFLLGlHQUFpRyxHQUFHLEVBQUU7QUFDM0gsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMseUJBQXlCLEdBQW9EO0FBQzFGLFVBQU0sMEJBQTBCLElBQUksSUFBWSxLQUFLLGlCQUFpQixZQUFZLElBQUksZ0JBQWMsV0FBVyxJQUFJLENBQUM7QUFDcEgsVUFBTSxvQkFBb0IsTUFBYztBQUN2QyxZQUFNLFdBQVcsU0FBUywyQkFBMkIsZ0JBQWdCO0FBQ3JFLFVBQUksYUFBYTtBQUNqQixVQUFJLG1CQUFtQjtBQUV2QixhQUFPLHdCQUF3QixJQUFJLFVBQVUsR0FBRztBQUMvQyxxQkFBYSxHQUFHLFFBQVEsSUFBSSxFQUFFLGdCQUFnQjtBQUFBLE1BQy9DO0FBRUEsOEJBQXdCLElBQUksVUFBVTtBQUN0QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sOEJBQThCLE9BQU8sUUFBd0Q7QUFDbEcsWUFBTSxXQUFXLElBQUksTUFBTSxHQUFHO0FBRTlCLFVBQUksaUJBQWlCLEtBQUssR0FBRyxHQUFHO0FBQy9CLGVBQU8sRUFBRSxNQUFNLDBCQUEwQixHQUFHLEdBQUcsTUFBTSxrQkFBa0IsR0FBRyxTQUFTO0FBQUEsTUFDcEY7QUFFQSxVQUFJLFVBQVUsS0FBSyxHQUFHLEdBQUc7QUFDeEIsY0FBTSxPQUFPLE1BQU0sS0FBSywwQkFBMEIsR0FBRztBQUNyRCxZQUFJLE1BQU07QUFDVCxpQkFBTyxFQUFFLE1BQU0sTUFBTSxrQkFBa0IsR0FBRyxVQUFVLElBQUksSUFBSTtBQUFBLFFBQzdEO0FBQUEsTUFDRDtBQUVBLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSwrQkFBK0IsT0FBTyxTQUF1RDtBQUNsRyxVQUFJO0FBQ0gsY0FBTSxTQUFTLE1BQU0sS0FBSyxZQUFZO0FBQ3RDLGVBQU8sRUFBRSxNQUFNLElBQUksV0FBVyxNQUFNLEdBQUcsTUFBTSxrQkFBa0IsRUFBRTtBQUFBLE1BQ2xFLFNBQVMsT0FBTztBQUNmLGFBQUssV0FBVyxNQUFNLHVCQUF1QixLQUFLO0FBQUEsTUFDbkQ7QUFFQSxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sb0JBQXlDLENBQUM7QUFHaEQsVUFBTSxhQUFhLCtCQUErQixDQUFDO0FBQ25ELFFBQUksV0FBVyxRQUFRO0FBQ3RCLFlBQU0sNkJBQTZCLE1BQU0sUUFBUSxJQUFJLFdBQVcsSUFBSSxVQUFRLDZCQUE2QixJQUFJLENBQUMsQ0FBQztBQUMvRyx3QkFBa0IsS0FBSyxHQUFHLDJCQUEyQixPQUFPLFVBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUFBLElBQzVFO0FBR0EsVUFBTSxZQUFZLHlCQUF5QixDQUFDO0FBQzVDLFFBQUksVUFBVSxRQUFRO0FBQ3JCLFlBQU0sMkJBQTJCLE1BQU0sUUFBUSxJQUFJLFVBQVUsSUFBSSwyQkFBMkIsQ0FBQztBQUM3Rix3QkFBa0IsS0FBSyxHQUFHLHlCQUF5QixPQUFPLFVBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUFBLElBQzFFO0FBRUEsV0FBTyxNQUFNLEtBQUssNkJBQTZCLDBCQUEwQixpQkFBaUI7QUFBQSxFQUMzRjtBQUFBLEVBRVEsV0FBVyxRQUFxQixNQUE2QztBQUVwRixTQUFLLGFBQWEsT0FBTztBQUN6QixTQUFLLGNBQWM7QUFFbkIsVUFBTSxFQUFFLFFBQVEsSUFBSSxLQUFLLFNBQVMsSUFBSSxNQUFNO0FBQzVDLFFBQUksU0FBUyxRQUFXO0FBR3ZCLFlBQU0sc0JBQXNCLHFCQUFxQixLQUFLLFFBQVEsT0FBTyxFQUFFLEtBQUssS0FBSyxlQUFlLElBQUksQ0FBQyxFQUFFO0FBQ3ZHLFlBQU0sZUFBZSxvQkFBb0IsSUFBSSxhQUFXO0FBQ3ZELFlBQUksT0FBTyxZQUFZLFVBQVU7QUFDaEMsaUJBQU8sRUFBRSxxQkFBcUIsUUFBVyxPQUFPO0FBQUEsUUFDakQ7QUFDQSxlQUFPO0FBQUEsTUFDUixDQUFDO0FBRUQsV0FBSyxjQUFjLEVBQUUsb0NBQW9DLFFBQVcsR0FBRyxZQUFZO0FBQ25GLFdBQUssWUFBWSxNQUFNLGtCQUFrQixLQUFLO0FBQzlDLGNBQVEsWUFBWSxLQUFLLFdBQVc7QUFBQSxJQUNyQztBQUVBLFlBQVEsVUFBVSxPQUFPLFdBQVcsU0FBUyxNQUFTO0FBQUEsRUFDdkQ7QUFBQSxFQUVRLGVBQWUsTUFBbUM7QUFDekQsVUFBTSxXQUFXLEtBQUssZ0JBQWdCLElBQUk7QUFDMUMsV0FBTyxTQUFTLGtCQUFrQix5QkFBeUIsUUFBUTtBQUFBLEVBQ3BFO0FBQUEsRUFFUSxvQkFBb0IsU0FBNEI7QUFDdkQsWUFBUSxNQUFNLGtCQUFrQixLQUFLLFNBQVMsS0FBSyxPQUFPLGlCQUFpQixLQUFLO0FBQ2hGLFlBQVEsTUFBTSxRQUFRLEtBQUssU0FBUyxLQUFLLE9BQU8sY0FBYyxLQUFLO0FBQUEsRUFDcEU7QUFBQSxFQUVTLGVBQXFCO0FBQzdCLFNBQUssU0FBUyxRQUFRLGFBQVcsS0FBSyxvQkFBb0IsUUFBUSxPQUFPLENBQUM7QUFDMUUsU0FBSyx3QkFBd0IsS0FBSyxTQUFTLEtBQUssT0FBTyxjQUFjLEtBQUs7QUFBQSxFQUMzRTtBQUNEO0FBcGNhLGtCQUFOO0FBQUEsRUFrQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F0QlU7QUFzY2IsU0FBUyxzQkFBc0IsR0FBdUI7QUFFckQsTUFBSSxpQkFBaUIsR0FBRyxPQUFPLEdBQUc7QUFDakMsV0FBTztBQUFBLEVBQ1I7QUFFQSxNQUFJLGlCQUFpQixHQUFHLGNBQWMsS0FBSyxHQUFHO0FBQzdDLFVBQU0sUUFBUSxFQUFFLGNBQWM7QUFDOUIsUUFBSSxTQUFTLE1BQU0sU0FBUyxHQUFHO0FBQzlCLGFBQU8sTUFBTSxLQUFLLEtBQUssRUFBRSxLQUFLLFVBQVEsS0FBSyxLQUFLLFdBQVcsUUFBUSxDQUFDO0FBQUEsSUFDckU7QUFFQSxVQUFNLFFBQVEsRUFBRSxjQUFjO0FBQzlCLFFBQUksU0FBUyxNQUFNLFNBQVMsR0FBRztBQUM5QixhQUFPLE1BQU0sS0FBSyxLQUFLLEVBQUUsS0FBSyxVQUFRLEtBQUssS0FBSyxXQUFXLFFBQVEsQ0FBQztBQUFBLElBQ3JFO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQUVBLFNBQVMseUJBQXlCLEdBQWMsWUFBb0M7QUFDbkYsUUFBTSxVQUFVLEVBQUUsY0FBYyxRQUFRLGVBQWU7QUFDdkQsTUFBSSxTQUFTO0FBQ1osUUFBSTtBQUNILFlBQU0sT0FBTyxRQUFRLE1BQU0sT0FBTztBQUNsQyxVQUFJLEtBQUssU0FBUyxHQUFHO0FBQ3BCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxTQUFTLE9BQU87QUFDZixrQkFBWSxNQUFNLDJCQUEyQixLQUFLO0FBQ2xELGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBRUEsU0FBTyxDQUFDO0FBQ1Q7QUFFQSxTQUFTLCtCQUErQixHQUFzQjtBQUM3RCxRQUFNLFFBQVEsRUFBRSxjQUFjO0FBQzlCLE1BQUksQ0FBQyxPQUFPO0FBQ1gsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUVBLFNBQU8sTUFBTSxLQUFLLEtBQUssRUFBRSxPQUFPLFVBQVEsS0FBSyxLQUFLLFdBQVcsUUFBUSxDQUFDO0FBQ3ZFOyIsCiAgIm5hbWVzIjogWyJDaGF0RHJhZ0FuZERyb3BUeXBlIl0KfQo=
