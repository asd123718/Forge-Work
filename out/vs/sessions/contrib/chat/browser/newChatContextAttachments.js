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
import * as dom from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { localize } from "../../../../nls.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { registerOpenEditorListeners } from "../../../../platform/editor/browser/editor.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ChatConfiguration } from "../../../../workbench/contrib/chat/common/constants.js";
import { IChatImageCarouselService } from "../../../../workbench/contrib/chat/browser/chatImageCarouselService.js";
import { coerceImageBuffer } from "../../../../workbench/contrib/chat/common/chatImageExtraction.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { basename } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../workbench/browser/labels.js";
import { isAgentHostCompletionVariableEntry, isPastedTextArtifact, OmittedState } from "../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js";
import { isLocation } from "../../../../editor/common/languages.js";
import { resizeImage } from "../../../../workbench/contrib/chat/browser/chatImageUtils.js";
import { createImageHoverContent, openPastedTextArtifact } from "../../../../workbench/contrib/chat/browser/attachments/chatAttachmentWidgets.js";
import { imageToHash, isImage } from "../../../../workbench/contrib/chat/browser/widget/input/editor/chatPasteProviders.js";
import { getExcludes, ISearchService, QueryType } from "../../../../workbench/services/search/common/search.js";
let NewChatContextAttachments = class extends Disposable {
  constructor(quickInputService, textModelService, fileService, clipboardService, fileDialogService, labelService, searchService, configurationService, openerService, instantiationService, modelService, languageService, chatImageCarouselService) {
    super();
    this.quickInputService = quickInputService;
    this.textModelService = textModelService;
    this.fileService = fileService;
    this.clipboardService = clipboardService;
    this.fileDialogService = fileDialogService;
    this.labelService = labelService;
    this.searchService = searchService;
    this.configurationService = configurationService;
    this.openerService = openerService;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.chatImageCarouselService = chatImageCarouselService;
    this._attachedContext = [];
    this._renderDisposables = this._register(new DisposableStore());
    this._onDidChangeContext = this._register(new Emitter());
    this.onDidChangeContext = this._onDidChangeContext.event;
    this._resourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
  }
  get attachments() {
    return this._attachedContext;
  }
  setAttachments(entries) {
    this._attachedContext.length = 0;
    this._attachedContext.push(...entries);
    this._updateRendering();
    this._onDidChangeContext.fire();
  }
  // --- Rendering ---
  renderAttachedContext(container) {
    this._container = container;
    this._updateRendering();
  }
  _updateRendering() {
    if (!this._container) {
      return;
    }
    this._renderDisposables.clear();
    this._resourceLabels.clear();
    dom.clearNode(this._container);
    const visibleAttachments = this._attachedContext.filter((entry) => !isAgentHostCompletionVariableEntry(entry));
    if (visibleAttachments.length === 0) {
      this._container.style.display = "none";
      return;
    }
    this._container.style.display = "";
    this._container.classList.add("show-file-icons");
    for (const entry of visibleAttachments) {
      const pill = dom.append(this._container, dom.$(".sessions-chat-attachment-pill"));
      const resource = URI.isUri(entry.value) ? entry.value : isLocation(entry.value) ? entry.value.uri : void 0;
      if (entry.kind === "image") {
        const icon = dom.append(pill, renderIcon(Codicon.fileMedia));
        dom.append(pill, dom.$("span.sessions-chat-attachment-name", void 0, entry.name));
        const buffer = coerceImageBuffer(entry.value);
        if (buffer) {
          const preview = createImageHoverContent(resource, entry.name, buffer, entry.id, void 0, void 0, (url, isThumbnail) => {
            if (isThumbnail) {
              icon.replaceWith(dom.$("img.sessions-chat-attachment-image", { src: url, alt: "" }));
            }
          });
          this._renderDisposables.add(preview.disposable);
        }
      } else {
        const label = this._resourceLabels.create(pill, { supportIcons: true });
        this._renderDisposables.add(label);
        if (resource) {
          label.setFile(resource, {
            fileKind: entry.kind === "directory" ? FileKind.FOLDER : FileKind.FILE,
            hidePath: true
          });
        } else if (isPastedTextArtifact(entry)) {
          label.setLabel(entry.fileName, void 0, { extraClasses: ["file-icon", `${entry.language}-lang-file-icon`] });
          dom.append(pill, dom.$("span.sessions-chat-attachment-info", void 0, localize("pastedLines", "Pasted {0}", entry.pastedLines)));
        } else {
          label.setLabel(entry.name);
        }
      }
      const imageData = entry.kind === "image" ? coerceImageBuffer(entry.value) : void 0;
      if (imageData) {
        pill.style.cursor = "pointer";
        this._renderDisposables.add(registerOpenEditorListeners(pill, async () => {
          if (this.configurationService.getValue(ChatConfiguration.ImageCarouselEnabled)) {
            const imageResource = resource ?? URI.from({ scheme: "data", path: entry.name });
            await this.chatImageCarouselService.openCarouselAtResource(imageResource, imageData);
          } else if (resource) {
            await this.openerService.open(resource, { fromUserGesture: true });
          }
        }));
      } else if (resource) {
        pill.style.cursor = "pointer";
        this._renderDisposables.add(registerOpenEditorListeners(pill, async () => {
          await this.openerService.open(resource, { fromUserGesture: true });
        }));
      } else if (isPastedTextArtifact(entry)) {
        pill.style.cursor = "pointer";
        this._renderDisposables.add(registerOpenEditorListeners(pill, async () => {
          await this.instantiationService.invokeFunction(openPastedTextArtifact, entry);
        }));
      }
      if (imageData || resource || isPastedTextArtifact(entry)) {
        pill.tabIndex = 0;
        pill.role = "button";
      }
      const removeButton = dom.append(pill, dom.$(".sessions-chat-attachment-remove"));
      removeButton.title = localize("removeAttachment", "Remove");
      removeButton.tabIndex = -1;
      dom.append(removeButton, renderIcon(Codicon.closeCompact));
      this._renderDisposables.add(dom.addDisposableListener(removeButton, dom.EventType.CLICK, (e) => {
        e.stopPropagation();
        this.removeAttachment(entry.id);
      }));
    }
  }
  // --- Picker ---
  showPicker(folderUri) {
    const picker = this.quickInputService.createQuickPick({ useSeparators: true });
    const disposables = new DisposableStore();
    picker.placeholder = localize("chatContext.attach.placeholder", "Attach as context...");
    picker.matchOnDescription = true;
    picker.sortByLabel = false;
    const staticPicks = [
      {
        label: localize("files", "Files..."),
        iconClass: ThemeIcon.asClassName(Codicon.file),
        id: "sessions.filesAndFolders"
      },
      {
        label: localize("imageFromClipboard", "Image from Clipboard"),
        iconClass: ThemeIcon.asClassName(Codicon.fileMedia),
        id: "sessions.imageFromClipboard"
      }
    ];
    picker.items = staticPicks;
    picker.show();
    if (folderUri) {
      let searchCts;
      let debounceTimer;
      const runSearch = (filePattern) => {
        searchCts?.dispose(true);
        searchCts = new CancellationTokenSource();
        const token = searchCts.token;
        picker.busy = true;
        this._collectFilePicks(folderUri, filePattern, token).then((filePicks) => {
          if (token.isCancellationRequested) {
            return;
          }
          picker.busy = false;
          if (filePicks.length > 0) {
            picker.items = [
              ...staticPicks,
              { type: "separator", label: basename(folderUri) },
              ...filePicks
            ];
          } else {
            picker.items = staticPicks;
          }
        });
      };
      runSearch();
      disposables.add(picker.onDidChangeValue((value) => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => runSearch(value || void 0), 200);
      }));
      disposables.add({ dispose: () => {
        searchCts?.dispose(true);
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
      } });
    }
    disposables.add(picker.onDidAccept(async () => {
      const [selected] = picker.selectedItems;
      if (!selected) {
        picker.hide();
        return;
      }
      picker.hide();
      if (selected.id === "sessions.filesAndFolders") {
        await this._handleFileDialog();
      } else if (selected.id === "sessions.imageFromClipboard") {
        await this._handleClipboardImage();
      } else if (selected.id) {
        await this._attachFileUri(URI.parse(selected.id), selected.label);
      }
    }));
    disposables.add(picker.onDidHide(() => {
      picker.dispose();
      disposables.dispose();
    }));
  }
  async _collectFilePicks(rootUri, filePattern, token) {
    const maxFiles = 200;
    if (rootUri.scheme === Schemas.file || rootUri.scheme === Schemas.vscodeRemote) {
      return this._collectFilePicksViaSearch(rootUri, maxFiles, filePattern, token);
    }
    return this._collectFilePicksViaFileService(rootUri, maxFiles, filePattern);
  }
  async _collectFilePicksViaSearch(rootUri, maxFiles, filePattern, token) {
    const excludePattern = getExcludes(this.configurationService.getValue({ resource: rootUri }));
    try {
      const searchResult = await this.searchService.fileSearch({
        folderQueries: [{
          folder: rootUri,
          disregardIgnoreFiles: false
        }],
        type: QueryType.File,
        filePattern: filePattern || "",
        excludePattern,
        sortByScore: true,
        maxResults: maxFiles
      }, token);
      return searchResult.results.map((result) => ({
        label: basename(result.resource),
        description: this.labelService.getUriLabel(result.resource, { relative: true }),
        iconClasses: getIconClasses(this.modelService, this.languageService, result.resource, FileKind.FILE),
        id: result.resource.toString()
      }));
    } catch {
      return [];
    }
  }
  async _collectFilePicksViaFileService(rootUri, maxFiles, filePattern) {
    const picks = [];
    const patternLower = filePattern?.toLowerCase();
    const maxDepth = 10;
    const collect = async (uri, depth) => {
      if (picks.length >= maxFiles || depth > maxDepth) {
        return;
      }
      try {
        const stat = await this.fileService.resolve(uri);
        if (!stat.children) {
          return;
        }
        const children = stat.children.slice().sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        for (const child of children) {
          if (picks.length >= maxFiles) {
            break;
          }
          if (child.isDirectory) {
            await collect(child.resource, depth + 1);
          } else {
            if (patternLower && !child.name.toLowerCase().includes(patternLower)) {
              continue;
            }
            picks.push({
              label: child.name,
              description: this.labelService.getUriLabel(child.resource, { relative: true }),
              iconClasses: getIconClasses(this.modelService, this.languageService, child.resource, FileKind.FILE),
              id: child.resource.toString()
            });
          }
        }
      } catch {
      }
    };
    await collect(rootUri, 0);
    return picks;
  }
  async _handleFileDialog() {
    const selected = await this.fileDialogService.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: true,
      canSelectMany: true,
      title: localize("selectFilesOrFolders", "Select Files or Folders")
    });
    if (!selected) {
      return;
    }
    for (const uri of selected) {
      await this._attachFileUri(uri, basename(uri));
    }
  }
  async _attachFileUri(uri, name) {
    let stat;
    try {
      stat = await this.fileService.stat(uri);
    } catch {
      return;
    }
    if (stat.isDirectory) {
      this._addAttachments({
        kind: "directory",
        id: uri.toString(),
        value: uri,
        name
      });
      return;
    }
    if (/\.(png|jpg|jpeg|bmp|gif|tiff)$/i.test(uri.path)) {
      const readFile = await this.fileService.readFile(uri);
      const resizedImage = await resizeImage(readFile.value.buffer);
      this._addAttachments({
        id: uri.toString(),
        name,
        fullName: name,
        value: resizedImage,
        kind: "image",
        references: [{ reference: uri, kind: "reference" }]
      });
    } else {
      let omittedState = OmittedState.NotOmitted;
      try {
        const ref = await this.textModelService.createModelReference(uri);
        ref.dispose();
      } catch {
        omittedState = OmittedState.Full;
      }
      this._addAttachments({
        kind: "file",
        id: uri.toString(),
        value: uri,
        name,
        omittedState
      });
    }
  }
  async _handleClipboardImage() {
    const imageData = await this.clipboardService.readImage();
    if (!isImage(imageData)) {
      return;
    }
    const displayName = this._getUniqueImageName();
    this._addAttachments({
      id: await imageToHash(imageData),
      name: displayName,
      fullName: displayName,
      value: imageData,
      kind: "image"
    });
  }
  // --- State management ---
  _getUniqueImageName() {
    const baseName = localize("pastedImage", "Pasted Image");
    let name = baseName;
    for (let i = 2; this._attachedContext.some((a) => a.name === name); i++) {
      name = `${baseName} ${i}`;
    }
    return name;
  }
  addAttachments(...entries) {
    this._addAttachments(...entries);
  }
  _addAttachments(...entries) {
    for (const entry of entries) {
      if (!this._attachedContext.some((e) => e.id === entry.id)) {
        this._attachedContext.push(entry);
      }
    }
    this._updateRendering();
    this._onDidChangeContext.fire();
  }
  removeAttachment(id) {
    const index = this._attachedContext.findIndex((e) => e.id === id);
    if (index >= 0) {
      this._attachedContext.splice(index, 1);
      this._updateRendering();
      this._onDidChangeContext.fire();
    }
  }
  clear() {
    this._attachedContext.length = 0;
    this._updateRendering();
    this._onDidChangeContext.fire();
  }
};
NewChatContextAttachments = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, ITextModelService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IClipboardService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ISearchService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IModelService),
  __decorateParam(11, ILanguageService),
  __decorateParam(12, IChatImageCarouselService)
], NewChatContextAttachments);
export {
  NewChatContextAttachments
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3NlclxcbmV3Q2hhdENvbnRleHRBdHRhY2htZW50cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyT3BlbkVkaXRvckxpc3RlbmVycyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNvZXJjZUltYWdlQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdEltYWdlRXh0cmFjdGlvbi5qcyc7XG5cbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3NlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZ2V0SWNvbkNsYXNzZXMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL2xhYmVscy5qcyc7XG5cbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnksIGlzUGFzdGVkVGV4dEFydGlmYWN0LCBPbWl0dGVkU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IGlzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyByZXNpemVJbWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0SW1hZ2VVdGlscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbWFnZUhvdmVyQ29udGVudCwgb3BlblBhc3RlZFRleHRBcnRpZmFjdCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudFdpZGdldHMuanMnO1xuaW1wb3J0IHsgaW1hZ2VUb0hhc2gsIGlzSW1hZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0UGFzdGVQcm92aWRlcnMuanMnO1xuaW1wb3J0IHsgZ2V0RXhjbHVkZXMsIElTZWFyY2hDb25maWd1cmF0aW9uLCBJU2VhcmNoU2VydmljZSwgUXVlcnlUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcblxuLyoqXG4gKiBUaGUgYXR0YWNobWVudCBzdXJmYWNlIG9mIHRoZSBjb21wb3NlciwgYXMgc2VlbiBieSBpdHMgaW5wdXQgcGx1bWJpbmdcbiAqIChjb21wbGV0aW9ucywgcGFzdGUpLiBLZXB0IGZyZWUgb2YgcmVuZGVyaW5nIHNvIHRob3NlIHBhcnRzIGNhbiBiZSB1c2VkXG4gKiB3aXRob3V0IHRoZSBwaWxsIFVJLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElOZXdDaGF0QXR0YWNobWVudHMge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRleHQ6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBhdHRhY2htZW50czogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xuXHRzZXRBdHRhY2htZW50cyhlbnRyaWVzOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pOiB2b2lkO1xuXHRhZGRBdHRhY2htZW50cyguLi5lbnRyaWVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pOiB2b2lkO1xuXHRyZW1vdmVBdHRhY2htZW50KGlkOiBzdHJpbmcpOiB2b2lkO1xufVxuXG4vKipcbiAqIE1hbmFnZXMgY29udGV4dCBhdHRhY2htZW50cyBmb3IgdGhlIHNlc3Npb25zIG5ldy1jaGF0IHdpZGdldC5cbiAqXG4gKiBTdXBwb3J0czpcbiAqIC0gRmlsZSBwaWNrZXIgdmlhIHF1aWNrIGFjY2VzcyAoXCJGaWxlcyBhbmQgT3BlbiBGb2xkZXJzLi4uXCIpXG4gKiAtIEltYWdlIGZyb20gQ2xpcGJvYXJkXG4gKiAtIERyYWcgYW5kIGRyb3AgZmlsZXNcbiAqIC0gUGFzdGUgaW1hZ2VzIGZyb20gY2xpcGJvYXJkIChDdHJsL0NtZCtWKVxuICovXG5leHBvcnQgY2xhc3MgTmV3Q2hhdENvbnRleHRBdHRhY2htZW50cyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTmV3Q2hhdEF0dGFjaG1lbnRzIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdHRhY2hlZENvbnRleHQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZXh0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGV4dCA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5ldmVudDtcblxuXHRnZXQgYXR0YWNobWVudHMoKTogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fYXR0YWNoZWRDb250ZXh0O1xuXHR9XG5cblx0c2V0QXR0YWNobWVudHMoZW50cmllczogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fYXR0YWNoZWRDb250ZXh0Lmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5fYXR0YWNoZWRDb250ZXh0LnB1c2goLi4uZW50cmllcyk7XG5cdFx0dGhpcy5fdXBkYXRlUmVuZGVyaW5nKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVNlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRJbWFnZUNhcm91c2VsU2VydmljZTogSUNoYXRJbWFnZUNhcm91c2VsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZXNvdXJjZUxhYmVscyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUikpO1xuXHR9XG5cblx0Ly8gLS0tIFJlbmRlcmluZyAtLS1cblxuXHRyZW5kZXJBdHRhY2hlZENvbnRleHQoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLl91cGRhdGVSZW5kZXJpbmcoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVJlbmRlcmluZygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcmVzb3VyY2VMYWJlbHMuY2xlYXIoKTtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX2NvbnRhaW5lcik7XG5cblx0XHRjb25zdCB2aXNpYmxlQXR0YWNobWVudHMgPSB0aGlzLl9hdHRhY2hlZENvbnRleHQuZmlsdGVyKGVudHJ5ID0+ICFpc0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KGVudHJ5KSk7XG5cdFx0aWYgKHZpc2libGVBdHRhY2htZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nob3ctZmlsZS1pY29ucycpO1xuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB2aXNpYmxlQXR0YWNobWVudHMpIHtcblx0XHRcdGNvbnN0IHBpbGwgPSBkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWF0dGFjaG1lbnQtcGlsbCcpKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmlzVXJpKGVudHJ5LnZhbHVlKSA/IGVudHJ5LnZhbHVlIDogaXNMb2NhdGlvbihlbnRyeS52YWx1ZSkgPyBlbnRyeS52YWx1ZS51cmkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZW50cnkua2luZCA9PT0gJ2ltYWdlJykge1xuXHRcdFx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZChwaWxsLCByZW5kZXJJY29uKENvZGljb24uZmlsZU1lZGlhKSk7XG5cdFx0XHRcdGRvbS5hcHBlbmQocGlsbCwgZG9tLiQoJ3NwYW4uc2Vzc2lvbnMtY2hhdC1hdHRhY2htZW50LW5hbWUnLCB1bmRlZmluZWQsIGVudHJ5Lm5hbWUpKTtcblx0XHRcdFx0Y29uc3QgYnVmZmVyID0gY29lcmNlSW1hZ2VCdWZmZXIoZW50cnkudmFsdWUpO1xuXHRcdFx0XHRpZiAoYnVmZmVyKSB7XG5cdFx0XHRcdFx0Ly8gU3dhcCB0aGUgZ2VuZXJpYyBpY29uIGZvciBhIHRodW1ibmFpbCBvbmNlIHRoZSBzaGFyZWQgaGVscGVyXG5cdFx0XHRcdFx0Ly8gaGFzIGRlY29kZWQgb25lLCBtYXRjaGluZyB0aGUgd29ya2JlbmNoIGF0dGFjaG1lbnQgcGlsbC5cblx0XHRcdFx0XHRjb25zdCBwcmV2aWV3ID0gY3JlYXRlSW1hZ2VIb3ZlckNvbnRlbnQocmVzb3VyY2UsIGVudHJ5Lm5hbWUsIGJ1ZmZlciwgZW50cnkuaWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAodXJsLCBpc1RodW1ibmFpbCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzVGh1bWJuYWlsKSB7XG5cdFx0XHRcdFx0XHRcdGljb24ucmVwbGFjZVdpdGgoZG9tLiQoJ2ltZy5zZXNzaW9ucy1jaGF0LWF0dGFjaG1lbnQtaW1hZ2UnLCB7IHNyYzogdXJsLCBhbHQ6ICcnIH0pKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQocHJldmlldy5kaXNwb3NhYmxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl9yZXNvdXJjZUxhYmVscy5jcmVhdGUocGlsbCwgeyBzdXBwb3J0SWNvbnM6IHRydWUgfSk7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChsYWJlbCk7XG5cdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdGxhYmVsLnNldEZpbGUocmVzb3VyY2UsIHtcblx0XHRcdFx0XHRcdGZpbGVLaW5kOiBlbnRyeS5raW5kID09PSAnZGlyZWN0b3J5JyA/IEZpbGVLaW5kLkZPTERFUiA6IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHRcdFx0XHRoaWRlUGF0aDogdHJ1ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc1Bhc3RlZFRleHRBcnRpZmFjdChlbnRyeSkpIHtcblx0XHRcdFx0XHQvLyBNYXRjaGVzIHRoZSB3b3JrYmVuY2ggcGFzdGUgcGlsbDogYSBmaWxlIGljb24gZm9yIHRoZSBhcnRpZmFjdCdzXG5cdFx0XHRcdFx0Ly8gbGFuZ3VhZ2UsIGFuZCBob3cgbXVjaCB0ZXh0IGl0IHN0YW5kcyBpbiBmb3IuXG5cdFx0XHRcdFx0bGFiZWwuc2V0TGFiZWwoZW50cnkuZmlsZU5hbWUsIHVuZGVmaW5lZCwgeyBleHRyYUNsYXNzZXM6IFsnZmlsZS1pY29uJywgYCR7ZW50cnkubGFuZ3VhZ2V9LWxhbmctZmlsZS1pY29uYF0gfSk7XG5cdFx0XHRcdFx0ZG9tLmFwcGVuZChwaWxsLCBkb20uJCgnc3Bhbi5zZXNzaW9ucy1jaGF0LWF0dGFjaG1lbnQtaW5mbycsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3Bhc3RlZExpbmVzJywgXCJQYXN0ZWQgezB9XCIsIGVudHJ5LnBhc3RlZExpbmVzKSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxhYmVsLnNldExhYmVsKGVudHJ5Lm5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENsaWNrIHRvIG9wZW4gdGhlIHJlc291cmNlIG9yIGltYWdlXG5cdFx0XHRjb25zdCBpbWFnZURhdGEgPSBlbnRyeS5raW5kID09PSAnaW1hZ2UnID8gY29lcmNlSW1hZ2VCdWZmZXIoZW50cnkudmFsdWUpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGltYWdlRGF0YSkge1xuXHRcdFx0XHRwaWxsLnN0eWxlLmN1cnNvciA9ICdwb2ludGVyJztcblx0XHRcdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyT3BlbkVkaXRvckxpc3RlbmVycyhwaWxsLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uSW1hZ2VDYXJvdXNlbEVuYWJsZWQpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbWFnZVJlc291cmNlID0gcmVzb3VyY2UgPz8gVVJJLmZyb20oeyBzY2hlbWU6ICdkYXRhJywgcGF0aDogZW50cnkubmFtZSB9KTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuY2hhdEltYWdlQ2Fyb3VzZWxTZXJ2aWNlLm9wZW5DYXJvdXNlbEF0UmVzb3VyY2UoaW1hZ2VSZXNvdXJjZSwgaW1hZ2VEYXRhKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihyZXNvdXJjZSwgeyBmcm9tVXNlckdlc3R1cmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdHBpbGwuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJPcGVuRWRpdG9yTGlzdGVuZXJzKHBpbGwsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihyZXNvdXJjZSwgeyBmcm9tVXNlckdlc3R1cmU6IHRydWUgfSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNQYXN0ZWRUZXh0QXJ0aWZhY3QoZW50cnkpKSB7XG5cdFx0XHRcdHBpbGwuc3R5bGUuY3Vyc29yID0gJ3BvaW50ZXInO1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJPcGVuRWRpdG9yTGlzdGVuZXJzKHBpbGwsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKG9wZW5QYXN0ZWRUZXh0QXJ0aWZhY3QsIGVudHJ5KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPbmx5IGV4cG9zZSB0aGUgcGlsbCBpdHNlbGYgYXMgYSBmb2N1c2FibGUgYnV0dG9uIHdoZW4gaXQgaGFzIGFuIG9wZW5cblx0XHRcdC8vIGFjdGlvbjsgcmVmZXJlbmNlIHBpbGxzIHdpdGhvdXQgYSByZXNvdXJjZSAoZS5nLiBgI3Nlc3Npb25gKSB3b3VsZFxuXHRcdFx0Ly8gb3RoZXJ3aXNlIGJlIGEgZm9jdXNhYmxlIGNvbnRyb2wgdGhhdCBkb2VzIG5vdGhpbmcuXG5cdFx0XHRpZiAoaW1hZ2VEYXRhIHx8IHJlc291cmNlIHx8IGlzUGFzdGVkVGV4dEFydGlmYWN0KGVudHJ5KSkge1xuXHRcdFx0XHRwaWxsLnRhYkluZGV4ID0gMDtcblx0XHRcdFx0cGlsbC5yb2xlID0gJ2J1dHRvbic7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlbW92ZUJ1dHRvbiA9IGRvbS5hcHBlbmQocGlsbCwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWF0dGFjaG1lbnQtcmVtb3ZlJykpO1xuXHRcdFx0cmVtb3ZlQnV0dG9uLnRpdGxlID0gbG9jYWxpemUoJ3JlbW92ZUF0dGFjaG1lbnQnLCBcIlJlbW92ZVwiKTtcblx0XHRcdHJlbW92ZUJ1dHRvbi50YWJJbmRleCA9IC0xO1xuXHRcdFx0ZG9tLmFwcGVuZChyZW1vdmVCdXR0b24sIHJlbmRlckljb24oQ29kaWNvbi5jbG9zZUNvbXBhY3QpKTtcblx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJlbW92ZUJ1dHRvbiwgZG9tLkV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5yZW1vdmVBdHRhY2htZW50KGVudHJ5LmlkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gUGlja2VyIC0tLVxuXG5cdHNob3dQaWNrZXIoZm9sZGVyVXJpPzogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgcGlja2VyID0gdGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY2hhdENvbnRleHQuYXR0YWNoLnBsYWNlaG9sZGVyJywgXCJBdHRhY2ggYXMgY29udGV4dC4uLlwiKTtcblx0XHRwaWNrZXIubWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHRwaWNrZXIuc29ydEJ5TGFiZWwgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHN0YXRpY1BpY2tzOiAoSVF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZpbGVzJywgXCJGaWxlcy4uLlwiKSxcblx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5maWxlKSxcblx0XHRcdFx0aWQ6ICdzZXNzaW9ucy5maWxlc0FuZEZvbGRlcnMnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbWFnZUZyb21DbGlwYm9hcmQnLCBcIkltYWdlIGZyb20gQ2xpcGJvYXJkXCIpLFxuXHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmZpbGVNZWRpYSksXG5cdFx0XHRcdGlkOiAnc2Vzc2lvbnMuaW1hZ2VGcm9tQ2xpcGJvYXJkJyxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdHBpY2tlci5pdGVtcyA9IHN0YXRpY1BpY2tzO1xuXHRcdHBpY2tlci5zaG93KCk7XG5cblx0XHRpZiAoZm9sZGVyVXJpKSB7XG5cdFx0XHRsZXQgc2VhcmNoQ3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBkZWJvdW5jZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgcnVuU2VhcmNoID0gKGZpbGVQYXR0ZXJuPzogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHNlYXJjaEN0cz8uZGlzcG9zZSh0cnVlKTtcblx0XHRcdFx0c2VhcmNoQ3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdGNvbnN0IHRva2VuID0gc2VhcmNoQ3RzLnRva2VuO1xuXG5cdFx0XHRcdHBpY2tlci5idXN5ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY29sbGVjdEZpbGVQaWNrcyhmb2xkZXJVcmksIGZpbGVQYXR0ZXJuLCB0b2tlbikudGhlbihmaWxlUGlja3MgPT4ge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmIChmaWxlUGlja3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0cGlja2VyLml0ZW1zID0gW1xuXHRcdFx0XHRcdFx0XHQuLi5zdGF0aWNQaWNrcyxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGJhc2VuYW1lKGZvbGRlclVyaSkgfSxcblx0XHRcdFx0XHRcdFx0Li4uZmlsZVBpY2tzLFxuXHRcdFx0XHRcdFx0XTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cGlja2VyLml0ZW1zID0gc3RhdGljUGlja3M7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdC8vIEluaXRpYWwgc2VhcmNoIChubyBmaWx0ZXIpXG5cdFx0XHRydW5TZWFyY2goKTtcblxuXHRcdFx0Ly8gUmUtc2VhcmNoIG9uIHVzZXIgaW5wdXQgd2l0aCBkZWJvdW5jZVxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZENoYW5nZVZhbHVlKHZhbHVlID0+IHtcblx0XHRcdFx0aWYgKGRlYm91bmNlVGltZXIpIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQoZGVib3VuY2VUaW1lcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVib3VuY2VUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4gcnVuU2VhcmNoKHZhbHVlIHx8IHVuZGVmaW5lZCksIDIwMCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHsgc2VhcmNoQ3RzPy5kaXNwb3NlKHRydWUpOyBpZiAoZGVib3VuY2VUaW1lcikgeyBjbGVhclRpbWVvdXQoZGVib3VuY2VUaW1lcik7IH0gfSB9KTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IFtzZWxlY3RlZF0gPSBwaWNrZXIuc2VsZWN0ZWRJdGVtcztcblx0XHRcdGlmICghc2VsZWN0ZWQpIHtcblx0XHRcdFx0cGlja2VyLmhpZGUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRwaWNrZXIuaGlkZSgpO1xuXG5cdFx0XHRpZiAoc2VsZWN0ZWQuaWQgPT09ICdzZXNzaW9ucy5maWxlc0FuZEZvbGRlcnMnKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZUZpbGVEaWFsb2coKTtcblx0XHRcdH0gZWxzZSBpZiAoc2VsZWN0ZWQuaWQgPT09ICdzZXNzaW9ucy5pbWFnZUZyb21DbGlwYm9hcmQnKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZUNsaXBib2FyZEltYWdlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGVkLmlkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2F0dGFjaEZpbGVVcmkoVVJJLnBhcnNlKHNlbGVjdGVkLmlkKSwgc2VsZWN0ZWQubGFiZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdHBpY2tlci5kaXNwb3NlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29sbGVjdEZpbGVQaWNrcyhyb290VXJpOiBVUkksIGZpbGVQYXR0ZXJuPzogc3RyaW5nLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUXVpY2tQaWNrSXRlbVtdPiB7XG5cdFx0Y29uc3QgbWF4RmlsZXMgPSAyMDA7XG5cblx0XHQvLyBGb3IgbG9jYWwgZmlsZTovLyBVUklzLCB1c2UgdGhlIHNlYXJjaCBzZXJ2aWNlIHdoaWNoIHJlc3BlY3RzIC5naXRpZ25vcmUgYW5kIGV4Y2x1ZGVzXG5cdFx0aWYgKHJvb3RVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgfHwgcm9vdFVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY29sbGVjdEZpbGVQaWNrc1ZpYVNlYXJjaChyb290VXJpLCBtYXhGaWxlcywgZmlsZVBhdHRlcm4sIHRva2VuKTtcblx0XHR9XG5cblx0XHQvLyBGb3IgdmlydHVhbCBmaWxlc3lzdGVtcyAoZS5nLiBnaXRodWItcmVtb3RlLWZpbGU6Ly8pLCB3YWxrIHRoZSB0cmVlIHZpYSBJRmlsZVNlcnZpY2Vcblx0XHRyZXR1cm4gdGhpcy5fY29sbGVjdEZpbGVQaWNrc1ZpYUZpbGVTZXJ2aWNlKHJvb3RVcmksIG1heEZpbGVzLCBmaWxlUGF0dGVybik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb2xsZWN0RmlsZVBpY2tzVmlhU2VhcmNoKHJvb3RVcmk6IFVSSSwgbWF4RmlsZXM6IG51bWJlciwgZmlsZVBhdHRlcm4/OiBzdHJpbmcsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElRdWlja1BpY2tJdGVtW10+IHtcblx0XHRjb25zdCBleGNsdWRlUGF0dGVybiA9IGdldEV4Y2x1ZGVzKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KHsgcmVzb3VyY2U6IHJvb3RVcmkgfSkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlYXJjaFJlc3VsdCA9IGF3YWl0IHRoaXMuc2VhcmNoU2VydmljZS5maWxlU2VhcmNoKHtcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW3tcblx0XHRcdFx0XHRmb2xkZXI6IHJvb3RVcmksXG5cdFx0XHRcdFx0ZGlzcmVnYXJkSWdub3JlRmlsZXM6IGZhbHNlLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiBmaWxlUGF0dGVybiB8fCAnJyxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm4sXG5cdFx0XHRcdHNvcnRCeVNjb3JlOiB0cnVlLFxuXHRcdFx0XHRtYXhSZXN1bHRzOiBtYXhGaWxlcyxcblx0XHRcdH0sIHRva2VuKTtcblxuXHRcdFx0cmV0dXJuIHNlYXJjaFJlc3VsdC5yZXN1bHRzLm1hcChyZXN1bHQgPT4gKHtcblx0XHRcdFx0bGFiZWw6IGJhc2VuYW1lKHJlc3VsdC5yZXNvdXJjZSksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXN1bHQucmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSksXG5cdFx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyh0aGlzLm1vZGVsU2VydmljZSwgdGhpcy5sYW5ndWFnZVNlcnZpY2UsIHJlc3VsdC5yZXNvdXJjZSwgRmlsZUtpbmQuRklMRSksXG5cdFx0XHRcdGlkOiByZXN1bHQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdH0gc2F0aXNmaWVzIElRdWlja1BpY2tJdGVtKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29sbGVjdEZpbGVQaWNrc1ZpYUZpbGVTZXJ2aWNlKHJvb3RVcmk6IFVSSSwgbWF4RmlsZXM6IG51bWJlciwgZmlsZVBhdHRlcm4/OiBzdHJpbmcpOiBQcm9taXNlPElRdWlja1BpY2tJdGVtW10+IHtcblx0XHRjb25zdCBwaWNrczogSVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGNvbnN0IHBhdHRlcm5Mb3dlciA9IGZpbGVQYXR0ZXJuPy50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IG1heERlcHRoID0gMTA7XG5cblx0XHRjb25zdCBjb2xsZWN0ID0gYXN5bmMgKHVyaTogVVJJLCBkZXB0aDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRpZiAocGlja3MubGVuZ3RoID49IG1heEZpbGVzIHx8IGRlcHRoID4gbWF4RGVwdGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHVyaSk7XG5cdFx0XHRcdGlmICghc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gc3RhdC5jaGlsZHJlbi5zbGljZSgpLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0XHRpZiAoYS5pc0RpcmVjdG9yeSAhPT0gYi5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGEuaXNEaXJlY3RvcnkgPyAtMSA6IDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0aWYgKHBpY2tzLmxlbmd0aCA+PSBtYXhGaWxlcykge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjaGlsZC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgY29sbGVjdChjaGlsZC5yZXNvdXJjZSwgZGVwdGggKyAxKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKHBhdHRlcm5Mb3dlciAmJiAhY2hpbGQubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHBhdHRlcm5Mb3dlcikpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGNoaWxkLm5hbWUsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChjaGlsZC5yZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdFx0XHRcdFx0aWNvbkNsYXNzZXM6IGdldEljb25DbGFzc2VzKHRoaXMubW9kZWxTZXJ2aWNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSwgY2hpbGQucmVzb3VyY2UsIEZpbGVLaW5kLkZJTEUpLFxuXHRcdFx0XHRcdFx0XHRpZDogY2hpbGQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBlcnJvcnMgZm9yIGluZGl2aWR1YWwgZGlyZWN0b3JpZXNcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgY29sbGVjdChyb290VXJpLCAwKTtcblx0XHRyZXR1cm4gcGlja3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVGaWxlRGlhbG9nKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5zaG93T3BlbkRpYWxvZyh7XG5cdFx0XHRjYW5TZWxlY3RGaWxlczogdHJ1ZSxcblx0XHRcdGNhblNlbGVjdEZvbGRlcnM6IHRydWUsXG5cdFx0XHRjYW5TZWxlY3RNYW55OiB0cnVlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZWxlY3RGaWxlc09yRm9sZGVycycsIFwiU2VsZWN0IEZpbGVzIG9yIEZvbGRlcnNcIiksXG5cdFx0fSk7XG5cdFx0aWYgKCFzZWxlY3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdXJpIG9mIHNlbGVjdGVkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9hdHRhY2hGaWxlVXJpKHVyaSwgYmFzZW5hbWUodXJpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXR0YWNoRmlsZVVyaSh1cmk6IFVSSSwgbmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHN0YXQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodXJpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0dGhpcy5fYWRkQXR0YWNobWVudHMoe1xuXHRcdFx0XHRraW5kOiAnZGlyZWN0b3J5Jyxcblx0XHRcdFx0aWQ6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHR2YWx1ZTogdXJpLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKC9cXC4ocG5nfGpwZ3xqcGVnfGJtcHxnaWZ8dGlmZikkL2kudGVzdCh1cmkucGF0aCkpIHtcblx0XHRcdGNvbnN0IHJlYWRGaWxlID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh1cmkpO1xuXHRcdFx0Y29uc3QgcmVzaXplZEltYWdlID0gYXdhaXQgcmVzaXplSW1hZ2UocmVhZEZpbGUudmFsdWUuYnVmZmVyKTtcblx0XHRcdHRoaXMuX2FkZEF0dGFjaG1lbnRzKHtcblx0XHRcdFx0aWQ6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRmdWxsTmFtZTogbmFtZSxcblx0XHRcdFx0dmFsdWU6IHJlc2l6ZWRJbWFnZSxcblx0XHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdFx0cmVmZXJlbmNlczogW3sgcmVmZXJlbmNlOiB1cmksIGtpbmQ6ICdyZWZlcmVuY2UnIH1dXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IG9taXR0ZWRTdGF0ZSA9IE9taXR0ZWRTdGF0ZS5Ob3RPbWl0dGVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSk7XG5cdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0b21pdHRlZFN0YXRlID0gT21pdHRlZFN0YXRlLkZ1bGw7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2FkZEF0dGFjaG1lbnRzKHtcblx0XHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0XHRpZDogdXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHZhbHVlOiB1cmksXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdG9taXR0ZWRTdGF0ZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUNsaXBib2FyZEltYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGltYWdlRGF0YSA9IGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS5yZWFkSW1hZ2UoKTtcblx0XHRpZiAoIWlzSW1hZ2UoaW1hZ2VEYXRhKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gdGhpcy5fZ2V0VW5pcXVlSW1hZ2VOYW1lKCk7XG5cblx0XHR0aGlzLl9hZGRBdHRhY2htZW50cyh7XG5cdFx0XHRpZDogYXdhaXQgaW1hZ2VUb0hhc2goaW1hZ2VEYXRhKSxcblx0XHRcdG5hbWU6IGRpc3BsYXlOYW1lLFxuXHRcdFx0ZnVsbE5hbWU6IGRpc3BsYXlOYW1lLFxuXHRcdFx0dmFsdWU6IGltYWdlRGF0YSxcblx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0gU3RhdGUgbWFuYWdlbWVudCAtLS1cblxuXHRwcml2YXRlIF9nZXRVbmlxdWVJbWFnZU5hbWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBiYXNlTmFtZSA9IGxvY2FsaXplKCdwYXN0ZWRJbWFnZScsIFwiUGFzdGVkIEltYWdlXCIpO1xuXHRcdGxldCBuYW1lID0gYmFzZU5hbWU7XG5cdFx0Zm9yIChsZXQgaSA9IDI7IHRoaXMuX2F0dGFjaGVkQ29udGV4dC5zb21lKGEgPT4gYS5uYW1lID09PSBuYW1lKTsgaSsrKSB7XG5cdFx0XHRuYW1lID0gYCR7YmFzZU5hbWV9ICR7aX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gbmFtZTtcblx0fVxuXG5cdGFkZEF0dGFjaG1lbnRzKC4uLmVudHJpZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2FkZEF0dGFjaG1lbnRzKC4uLmVudHJpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkQXR0YWNobWVudHMoLi4uZW50cmllczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2F0dGFjaGVkQ29udGV4dC5zb21lKGUgPT4gZS5pZCA9PT0gZW50cnkuaWQpKSB7XG5cdFx0XHRcdHRoaXMuX2F0dGFjaGVkQ29udGV4dC5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlUmVuZGVyaW5nKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUoKTtcblx0fVxuXG5cblx0cmVtb3ZlQXR0YWNobWVudChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9hdHRhY2hlZENvbnRleHQuZmluZEluZGV4KGUgPT4gZS5pZCA9PT0gaWQpO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9hdHRhY2hlZENvbnRleHQuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVJlbmRlcmluZygpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZXh0LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9hdHRhY2hlZENvbnRleHQubGVuZ3RoID0gMDtcblx0XHR0aGlzLl91cGRhdGVSZW5kZXJpbmcoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRleHQuZmlyZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFdBQVc7QUFDcEIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBc0I7QUFD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
