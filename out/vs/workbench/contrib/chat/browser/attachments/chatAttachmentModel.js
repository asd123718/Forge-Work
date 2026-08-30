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
import { URI } from "../../../../../base/common/uri.js";
import { Emitter } from "../../../../../base/common/event.js";
import { basename } from "../../../../../base/common/resources.js";
import { combinedDisposable, Disposable, DisposableMap } from "../../../../../base/common/lifecycle.js";
import { IChatRequestVariableEntry, isPromptFileVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { FileChangeType, IFileService } from "../../../../../platform/files/common/files.js";
import { ISharedWebContentExtractorService } from "../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { Schemas } from "../../../../../base/common/network.js";
import { IChatAttachmentResolveService } from "./chatAttachmentResolveService.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { equals } from "../../../../../base/common/objects.js";
import { Iterable } from "../../../../../base/common/iterator.js";
let ChatAttachmentModel = class extends Disposable {
  constructor(fileService, webContentExtractorService, chatAttachmentResolveService) {
    super();
    this.fileService = fileService;
    this.webContentExtractorService = webContentExtractorService;
    this.chatAttachmentResolveService = chatAttachmentResolveService;
    this._attachments = /* @__PURE__ */ new Map();
    this._fileWatchers = this._register(new DisposableMap());
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
  }
  get attachments() {
    return Array.from(this._attachments.values());
  }
  get size() {
    return this._attachments.size;
  }
  get fileAttachments() {
    return this.attachments.filter((file) => file.kind === "file" && URI.isUri(file.value)).map((file) => file.value);
  }
  getAttachmentIDs() {
    return new Set(this._attachments.keys());
  }
  async addFile(uri, range) {
    if (/\.(png|jpe?g|gif|bmp|webp)$/i.test(uri.path)) {
      const context = await this.asImageVariableEntry(uri);
      if (context) {
        this.addContext(context);
      }
      return;
    } else if (uri.scheme === Schemas.vscodeBrowser) {
      const entry = await this.chatAttachmentResolveService.resolveEditorAttachContext({ resource: uri });
      if (entry) {
        this.addContext(entry);
      }
      return;
    } else {
      this.addContext(this.asFileVariableEntry(uri, range));
    }
  }
  addFolder(uri) {
    const entry = {
      kind: "directory",
      value: uri,
      id: uri.toString(),
      name: basename(uri)
    };
    this.addContext(entry);
  }
  clear(clearStickyAttachments = false) {
    if (clearStickyAttachments) {
      const deleted = Array.from(this._attachments.keys());
      this._attachments.clear();
      this._fileWatchers.clearAndDisposeAll();
      this._onDidChange.fire({ deleted, added: [], updated: [] });
    } else {
      const deleted = [];
      const allIds = Array.from(this._attachments.keys());
      for (const id of allIds) {
        const entry = this._attachments.get(id);
        if (entry && !isPromptFileVariableEntry(entry)) {
          this._attachments.delete(id);
          this._fileWatchers.deleteAndDispose(id);
          deleted.push(id);
        }
      }
      this._onDidChange.fire({ deleted, added: [], updated: [] });
    }
  }
  addContext(...attachments) {
    attachments = attachments.filter((attachment) => !this._attachments.has(attachment.id));
    this.updateContext(Iterable.empty(), attachments);
  }
  clearAndSetContext(...attachments) {
    this.updateContext(Array.from(this._attachments.keys()), attachments);
  }
  delete(...variableEntryIds) {
    this.updateContext(variableEntryIds, Iterable.empty());
  }
  updateContext(toDelete, upsert) {
    const deleted = [];
    const added = [];
    const updated = [];
    for (const id of toDelete) {
      const item = this._attachments.get(id);
      if (item) {
        this._attachments.delete(id);
        deleted.push(id);
        this._fileWatchers.deleteAndDispose(id);
      }
    }
    for (const item of upsert) {
      const oldItem = this._attachments.get(item.id);
      if (!oldItem) {
        this._attachments.set(item.id, item);
        added.push(item);
        this._watchAttachment(item);
        this._maybeResolveDirectoryImageCount(item);
      } else if (!equals(oldItem, item)) {
        this._fileWatchers.deleteAndDispose(item.id);
        this._attachments.set(item.id, item);
        updated.push(item);
        this._watchAttachment(item);
        this._maybeResolveDirectoryImageCount(item);
      }
    }
    if (deleted.length > 0 || added.length > 0 || updated.length > 0) {
      this._onDidChange.fire({ deleted, added, updated });
    }
  }
  _maybeResolveDirectoryImageCount(attachment) {
    if (attachment.kind !== "directory" || typeof attachment.imageCount === "number" || !URI.isUri(attachment.value)) {
      return;
    }
    const uri = attachment.value;
    this.chatAttachmentResolveService.resolveDirectoryImages(uri).then((images) => {
      const current = this._attachments.get(attachment.id);
      if (current && current.kind === "directory" && current.value?.toString() === uri.toString()) {
        this.updateContext(Iterable.empty(), [{ ...current, imageCount: images.length }]);
      }
    }, () => {
    });
  }
  _watchAttachment(attachment) {
    const uri = IChatRequestVariableEntry.toUri(attachment);
    if (!uri || uri.scheme !== Schemas.file) {
      return;
    }
    const watcher = this.fileService.createWatcher(uri, { recursive: false, excludes: [] });
    const onDidChangeListener = watcher.onDidChange((e) => {
      if (e.contains(uri, FileChangeType.DELETED)) {
        this.updateContext([attachment.id], Iterable.empty());
      }
    });
    this._fileWatchers.set(attachment.id, combinedDisposable(onDidChangeListener, watcher));
  }
  // ---- create utils
  asFileVariableEntry(uri, range) {
    return {
      kind: "file",
      value: range ? { uri, range } : uri,
      id: uri.toString() + (range?.toString() ?? ""),
      name: basename(uri)
    };
  }
  // Gets an image variable for a given URI, which may be a file or a web URL
  async asImageVariableEntry(uri) {
    if (uri.scheme === Schemas.file && await this.fileService.canHandleResource(uri)) {
      return await this.chatAttachmentResolveService.resolveImageEditorAttachContext(uri);
    } else if (uri.scheme === Schemas.http || uri.scheme === Schemas.https) {
      const extractedImages = await this.webContentExtractorService.readImage(uri, CancellationToken.None);
      if (extractedImages) {
        return await this.chatAttachmentResolveService.resolveImageEditorAttachContext(uri, extractedImages);
      }
    }
    return void 0;
  }
};
ChatAttachmentModel = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ISharedWebContentExtractorService),
  __decorateParam(2, IChatAttachmentResolveService)
], ChatAttachmentModel);
export {
  ChatAttachmentModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGF0dGFjaG1lbnRzXFxjaGF0QXR0YWNobWVudE1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RGaWxlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlVHlwZSwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvY29tbW9uL3dlYkNvbnRlbnRFeHRyYWN0b3IuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgfSBmcm9tICcuL2NoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEF0dGFjaG1lbnRDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IGRlbGV0ZWQ6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBhZGRlZDogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xuXHRyZWFkb25seSB1cGRhdGVkOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0QXR0YWNobWVudE1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXR0YWNobWVudHMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZVdhdGNoZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8SUNoYXRSZXF1ZXN0RmlsZUVudHJ5WydpZCddLCBJRGlzcG9zYWJsZT4oKSk7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2hhdEF0dGFjaG1lbnRDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdlYkNvbnRlbnRFeHRyYWN0b3JTZXJ2aWNlOiBJU2hhcmVkV2ViQ29udGVudEV4dHJhY3RvclNlcnZpY2UsXG5cdFx0QElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZTogSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRnZXQgYXR0YWNobWVudHMoKTogUmVhZG9ubHlBcnJheTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5PiB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fYXR0YWNobWVudHMudmFsdWVzKCkpO1xuXHR9XG5cblx0Z2V0IHNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fYXR0YWNobWVudHMuc2l6ZTtcblx0fVxuXG5cdGdldCBmaWxlQXR0YWNobWVudHMoKTogVVJJW10ge1xuXHRcdHJldHVybiB0aGlzLmF0dGFjaG1lbnRzLmZpbHRlcihmaWxlID0+IGZpbGUua2luZCA9PT0gJ2ZpbGUnICYmIFVSSS5pc1VyaShmaWxlLnZhbHVlKSlcblx0XHRcdC5tYXAoZmlsZSA9PiBmaWxlLnZhbHVlIGFzIFVSSSk7XG5cdH1cblxuXHRnZXRBdHRhY2htZW50SURzKCkge1xuXHRcdHJldHVybiBuZXcgU2V0KHRoaXMuX2F0dGFjaG1lbnRzLmtleXMoKSk7XG5cdH1cblxuXHRhc3luYyBhZGRGaWxlKHVyaTogVVJJLCByYW5nZT86IElSYW5nZSkge1xuXHRcdGlmICgvXFwuKHBuZ3xqcGU/Z3xnaWZ8Ym1wfHdlYnApJC9pLnRlc3QodXJpLnBhdGgpKSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5hc0ltYWdlVmFyaWFibGVFbnRyeSh1cmkpO1xuXHRcdFx0aWYgKGNvbnRleHQpIHtcblx0XHRcdFx0dGhpcy5hZGRDb250ZXh0KGNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSBpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVCcm93c2VyKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IHRoaXMuY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlRWRpdG9yQXR0YWNoQ29udGV4dCh7IHJlc291cmNlOiB1cmkgfSk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0dGhpcy5hZGRDb250ZXh0KGVudHJ5KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hZGRDb250ZXh0KHRoaXMuYXNGaWxlVmFyaWFibGVFbnRyeSh1cmksIHJhbmdlKSk7XG5cdFx0fVxuXHR9XG5cblx0YWRkRm9sZGVyKHVyaTogVVJJKSB7XG5cdFx0Y29uc3QgZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgPSB7XG5cdFx0XHRraW5kOiAnZGlyZWN0b3J5Jyxcblx0XHRcdHZhbHVlOiB1cmksXG5cdFx0XHRpZDogdXJpLnRvU3RyaW5nKCksXG5cdFx0XHRuYW1lOiBiYXNlbmFtZSh1cmkpLFxuXHRcdH07XG5cdFx0dGhpcy5hZGRDb250ZXh0KGVudHJ5KTtcblx0fVxuXG5cdGNsZWFyKGNsZWFyU3RpY2t5QXR0YWNobWVudHM6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmIChjbGVhclN0aWNreUF0dGFjaG1lbnRzKSB7XG5cdFx0XHRjb25zdCBkZWxldGVkID0gQXJyYXkuZnJvbSh0aGlzLl9hdHRhY2htZW50cy5rZXlzKCkpO1xuXHRcdFx0dGhpcy5fYXR0YWNobWVudHMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2ZpbGVXYXRjaGVycy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBkZWxldGVkLCBhZGRlZDogW10sIHVwZGF0ZWQ6IFtdIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBkZWxldGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3QgYWxsSWRzID0gQXJyYXkuZnJvbSh0aGlzLl9hdHRhY2htZW50cy5rZXlzKCkpO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBhbGxJZHMpIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9hdHRhY2htZW50cy5nZXQoaWQpO1xuXHRcdFx0XHRpZiAoZW50cnkgJiYgIWlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkoZW50cnkpKSB7XG5cdFx0XHRcdFx0dGhpcy5fYXR0YWNobWVudHMuZGVsZXRlKGlkKTtcblx0XHRcdFx0XHR0aGlzLl9maWxlV2F0Y2hlcnMuZGVsZXRlQW5kRGlzcG9zZShpZCk7XG5cdFx0XHRcdFx0ZGVsZXRlZC5wdXNoKGlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGRlbGV0ZWQsIGFkZGVkOiBbXSwgdXBkYXRlZDogW10gfSk7XG5cdFx0fVxuXHR9XG5cblx0YWRkQ29udGV4dCguLi5hdHRhY2htZW50czogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKSB7XG5cdFx0YXR0YWNobWVudHMgPSBhdHRhY2htZW50cy5maWx0ZXIoYXR0YWNobWVudCA9PiAhdGhpcy5fYXR0YWNobWVudHMuaGFzKGF0dGFjaG1lbnQuaWQpKTtcblx0XHR0aGlzLnVwZGF0ZUNvbnRleHQoSXRlcmFibGUuZW1wdHkoKSwgYXR0YWNobWVudHMpO1xuXHR9XG5cblx0Y2xlYXJBbmRTZXRDb250ZXh0KC4uLmF0dGFjaG1lbnRzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pIHtcblx0XHR0aGlzLnVwZGF0ZUNvbnRleHQoQXJyYXkuZnJvbSh0aGlzLl9hdHRhY2htZW50cy5rZXlzKCkpLCBhdHRhY2htZW50cyk7XG5cdH1cblxuXHRkZWxldGUoLi4udmFyaWFibGVFbnRyeUlkczogc3RyaW5nW10pIHtcblx0XHR0aGlzLnVwZGF0ZUNvbnRleHQodmFyaWFibGVFbnRyeUlkcywgSXRlcmFibGUuZW1wdHkoKSk7XG5cdH1cblxuXHR1cGRhdGVDb250ZXh0KHRvRGVsZXRlOiBJdGVyYWJsZTxzdHJpbmc+LCB1cHNlcnQ6IEl0ZXJhYmxlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnk+KSB7XG5cdFx0Y29uc3QgZGVsZXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhZGRlZDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cdFx0Y29uc3QgdXBkYXRlZDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGlkIG9mIHRvRGVsZXRlKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy5fYXR0YWNobWVudHMuZ2V0KGlkKTtcblx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdHRoaXMuX2F0dGFjaG1lbnRzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdGRlbGV0ZWQucHVzaChpZCk7XG5cdFx0XHRcdHRoaXMuX2ZpbGVXYXRjaGVycy5kZWxldGVBbmREaXNwb3NlKGlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdXBzZXJ0KSB7XG5cdFx0XHRjb25zdCBvbGRJdGVtID0gdGhpcy5fYXR0YWNobWVudHMuZ2V0KGl0ZW0uaWQpO1xuXHRcdFx0aWYgKCFvbGRJdGVtKSB7XG5cdFx0XHRcdHRoaXMuX2F0dGFjaG1lbnRzLnNldChpdGVtLmlkLCBpdGVtKTtcblx0XHRcdFx0YWRkZWQucHVzaChpdGVtKTtcblx0XHRcdFx0dGhpcy5fd2F0Y2hBdHRhY2htZW50KGl0ZW0pO1xuXHRcdFx0XHR0aGlzLl9tYXliZVJlc29sdmVEaXJlY3RvcnlJbWFnZUNvdW50KGl0ZW0pO1xuXHRcdFx0fSBlbHNlIGlmICghZXF1YWxzKG9sZEl0ZW0sIGl0ZW0pKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbGVXYXRjaGVycy5kZWxldGVBbmREaXNwb3NlKGl0ZW0uaWQpO1xuXHRcdFx0XHR0aGlzLl9hdHRhY2htZW50cy5zZXQoaXRlbS5pZCwgaXRlbSk7XG5cdFx0XHRcdHVwZGF0ZWQucHVzaChpdGVtKTtcblx0XHRcdFx0dGhpcy5fd2F0Y2hBdHRhY2htZW50KGl0ZW0pO1xuXHRcdFx0XHR0aGlzLl9tYXliZVJlc29sdmVEaXJlY3RvcnlJbWFnZUNvdW50KGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkZWxldGVkLmxlbmd0aCA+IDAgfHwgYWRkZWQubGVuZ3RoID4gMCB8fCB1cGRhdGVkLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBkZWxldGVkLCBhZGRlZCwgdXBkYXRlZCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tYXliZVJlc29sdmVEaXJlY3RvcnlJbWFnZUNvdW50KGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiB2b2lkIHtcblx0XHQvLyBSZXNvbHZlIHRoZSBmb2xkZXIncyBpbWFnZSBjb3VudCBhc3luY2hyb25vdXNseSBzbyB0aGUgVUkgY2FuIHdhcm4gd2hlblxuXHRcdC8vIGl0IGV4Y2VlZHMgdGhlIG1vZGVsJ3MgcGVyLXJlcXVlc3QgaW1hZ2UgbGltaXQuIFNraXAgaWYgYWxyZWFkeSByZXNvbHZlZC5cblx0XHRpZiAoYXR0YWNobWVudC5raW5kICE9PSAnZGlyZWN0b3J5JyB8fCB0eXBlb2YgYXR0YWNobWVudC5pbWFnZUNvdW50ID09PSAnbnVtYmVyJyB8fCAhVVJJLmlzVXJpKGF0dGFjaG1lbnQudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVyaSA9IGF0dGFjaG1lbnQudmFsdWU7XG5cdFx0dGhpcy5jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnJlc29sdmVEaXJlY3RvcnlJbWFnZXModXJpKS50aGVuKGltYWdlcyA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fYXR0YWNobWVudHMuZ2V0KGF0dGFjaG1lbnQuaWQpO1xuXHRcdFx0aWYgKGN1cnJlbnQgJiYgY3VycmVudC5raW5kID09PSAnZGlyZWN0b3J5JyAmJiBjdXJyZW50LnZhbHVlPy50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbnRleHQoSXRlcmFibGUuZW1wdHkoKSwgW3sgLi4uY3VycmVudCwgaW1hZ2VDb3VudDogaW1hZ2VzLmxlbmd0aCB9XSk7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4geyAvKiBpZ25vcmUgKi8gfSk7XG5cdH1cblxuXHRwcml2YXRlIF93YXRjaEF0dGFjaG1lbnQoYXR0YWNobWVudDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IHZvaWQge1xuXHRcdGNvbnN0IHVyaSA9IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkudG9VcmkoYXR0YWNobWVudCk7XG5cdFx0aWYgKCF1cmkgfHwgdXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2F0Y2hlciA9IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlV2F0Y2hlcih1cmksIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlTGlzdGVuZXIgPSB3YXRjaGVyLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuY29udGFpbnModXJpLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbnRleHQoW2F0dGFjaG1lbnQuaWRdLCBJdGVyYWJsZS5lbXB0eSgpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2ZpbGVXYXRjaGVycy5zZXQoYXR0YWNobWVudC5pZCwgY29tYmluZWREaXNwb3NhYmxlKG9uRGlkQ2hhbmdlTGlzdGVuZXIsIHdhdGNoZXIpKTtcblx0fVxuXG5cdC8vIC0tLS0gY3JlYXRlIHV0aWxzXG5cblx0YXNGaWxlVmFyaWFibGVFbnRyeSh1cmk6IFVSSSwgcmFuZ2U/OiBJUmFuZ2UpOiBJQ2hhdFJlcXVlc3RGaWxlRW50cnkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnZmlsZScsXG5cdFx0XHR2YWx1ZTogcmFuZ2UgPyB7IHVyaSwgcmFuZ2UgfSA6IHVyaSxcblx0XHRcdGlkOiB1cmkudG9TdHJpbmcoKSArIChyYW5nZT8udG9TdHJpbmcoKSA/PyAnJyksXG5cdFx0XHRuYW1lOiBiYXNlbmFtZSh1cmkpLFxuXHRcdH07XG5cdH1cblxuXHQvLyBHZXRzIGFuIGltYWdlIHZhcmlhYmxlIGZvciBhIGdpdmVuIFVSSSwgd2hpY2ggbWF5IGJlIGEgZmlsZSBvciBhIHdlYiBVUkxcblx0YXN5bmMgYXNJbWFnZVZhcmlhYmxlRW50cnkodXJpOiBVUkkpOiBQcm9taXNlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlICYmIGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UodXJpKSkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlSW1hZ2VFZGl0b3JBdHRhY2hDb250ZXh0KHVyaSk7XG5cdFx0fSBlbHNlIGlmICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLmh0dHAgfHwgdXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5odHRwcykge1xuXHRcdFx0Y29uc3QgZXh0cmFjdGVkSW1hZ2VzID0gYXdhaXQgdGhpcy53ZWJDb250ZW50RXh0cmFjdG9yU2VydmljZS5yZWFkSW1hZ2UodXJpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChleHRyYWN0ZWRJbWFnZXMpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5yZXNvbHZlSW1hZ2VFZGl0b3JBdHRhY2hDb250ZXh0KHVyaSwgZXh0cmFjdGVkSW1hZ2VzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG9CQUFvQixZQUFZLHFCQUFrQztBQUMzRSxTQUFnQywyQkFBMkIsaUNBQWlDO0FBQzVGLFNBQVMsZ0JBQWdCLG9CQUFvQjtBQUM3QyxTQUFTLHlDQUF5QztBQUNsRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBUWxCLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBUW5ELFlBQ2dD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
