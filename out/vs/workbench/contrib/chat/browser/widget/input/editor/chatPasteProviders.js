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
import { alert } from "../../../../../../../base/browser/ui/aria/aria.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { createStringDataTransferItem, VSDataTransfer } from "../../../../../../../base/common/dataTransfer.js";
import { convertHtmlToMarkdown } from "../../../../../../../base/browser/htmlToMarkdown.js";
import { HierarchicalKind } from "../../../../../../../base/common/hierarchicalKind.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { revive } from "../../../../../../../base/common/marshalling.js";
import { Mimes } from "../../../../../../../base/common/mime.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { basename, joinPath } from "../../../../../../../base/common/resources.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { Position } from "../../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { DocumentPasteTriggerKind, SymbolKinds } from "../../../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../../../editor/common/services/languageFeatures.js";
import { IModelService } from "../../../../../../../editor/common/services/model.js";
import { IOutlineModelService } from "../../../../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { getDefinitionsAtPosition } from "../../../../../../../editor/contrib/gotoSymbol/browser/goToSymbol.js";
import { localize } from "../../../../../../../nls.js";
import { IEnvironmentService } from "../../../../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../../platform/log/common/log.js";
import { IExtensionService, isProposedApiEnabled } from "../../../../../../services/extensions/common/extensions.js";
import { isImageVariableEntry, toPasteVariableEntry, ChatPasteAttachmentMetadata } from "../../../../common/attachments/chatVariableEntries.js";
import { chatVariableLeader } from "../../../../common/requestParser/chatParserTypes.js";
import { IChatPasteTargetService } from "../../../chat.js";
import { chatInputSchemes, isChatInputModel } from "../../../../common/constants.js";
import { cleanupOldImages, createFileForMedia, resizeImage } from "../../../chatImageUtils.js";
const COPY_MIME_TYPES = "application/vnd.code.additional-editor-data";
const pastedTextArtifactMinLength = 1e3;
const CHAT_ATTACHMENT_MIME_TYPE = "application/vnd.chat.attachment+json";
let PasteImageProvider = class {
  constructor(pasteTargetService, extensionService, fileService, environmentService, logService) {
    this.pasteTargetService = pasteTargetService;
    this.extensionService = extensionService;
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.logService = logService;
    this.kind = new HierarchicalKind("chat.attach.image");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [];
    this.pasteMimeTypes = ["image/*"];
    this.imagesFolder = joinPath(this.environmentService.workspaceStorageHome, "vscode-chat-images");
    cleanupOldImages(this.fileService, this.logService, this.imagesFolder);
  }
  async provideDocumentPasteEdits(model, ranges, dataTransfer, context, token) {
    if (!this.extensionService.extensions.some((ext) => isProposedApiEnabled(ext, "chatReferenceBinaryData"))) {
      return;
    }
    const supportedMimeTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/bmp",
      "image/gif",
      "image/tiff"
    ];
    let mimeType;
    let imageItem;
    for (const type of supportedMimeTypes) {
      imageItem = dataTransfer.get(type);
      if (imageItem) {
        mimeType = type;
        break;
      }
    }
    if (!imageItem || !mimeType) {
      return;
    }
    const currClipboard = await imageItem.asFile()?.data();
    if (token.isCancellationRequested || !currClipboard) {
      return;
    }
    const target = this.pasteTargetService.getTarget(model.uri);
    if (!target) {
      return;
    }
    const attachedVariables = target.attachments;
    const displayName = localize("pastedImageName", "Pasted Image");
    let tempDisplayName = displayName;
    for (let appendValue = 2; attachedVariables.some((attachment) => attachment.name === tempDisplayName); appendValue++) {
      tempDisplayName = `${displayName} ${appendValue}`;
    }
    const fileReference = await createFileForMedia(this.fileService, this.imagesFolder, currClipboard, mimeType);
    if (token.isCancellationRequested || !fileReference) {
      return;
    }
    const scaledImageData = await resizeImage(currClipboard);
    if (token.isCancellationRequested || !scaledImageData) {
      return;
    }
    const scaledImageContext = await getImageAttachContext(scaledImageData, mimeType, token, tempDisplayName, fileReference);
    if (token.isCancellationRequested || !scaledImageContext) {
      return;
    }
    const currentContextIds = new Set(target.attachments.map((attachment) => attachment.id));
    if (currentContextIds.has(scaledImageContext.id)) {
      return;
    }
    const edit = createCustomPasteEdit(model, [scaledImageContext], mimeType, this.kind, localize("pastedImageAttachment", "Pasted Image Attachment"), this.pasteTargetService);
    return createEditSession(edit);
  }
};
PasteImageProvider = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, ILogService)
], PasteImageProvider);
async function getImageAttachContext(data, mimeType, token, displayName, resource) {
  const imageHash = await imageToHash(data);
  if (token.isCancellationRequested) {
    return void 0;
  }
  return {
    kind: "image",
    value: data,
    id: imageHash,
    name: displayName,
    icon: Codicon.fileMedia,
    mimeType,
    isPasted: true,
    references: [{ reference: resource, kind: "reference" }]
  };
}
async function imageToHash(data) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
function isImage(array) {
  if (array.length < 4) {
    return false;
  }
  const identifier = {
    png: [137, 80, 78, 71, 13, 10, 26, 10],
    jpeg: [255, 216, 255],
    bmp: [66, 77],
    gif: [71, 73, 70, 56],
    tiff: [73, 73, 42, 0]
  };
  return Object.values(identifier).some(
    (signature) => signature.every((byte, index) => array[index] === byte)
  );
}
let CopyTextProvider = class {
  constructor(modelService, languageFeaturesService, outlineModelService) {
    this.modelService = modelService;
    this.languageFeaturesService = languageFeaturesService;
    this.outlineModelService = outlineModelService;
    this.providedPasteEditKinds = [];
    this.copyMimeTypes = [COPY_MIME_TYPES];
    this.pasteMimeTypes = [];
  }
  async prepareDocumentPaste(model, ranges, dataTransfer, token) {
    if (isChatInputModel(model.uri)) {
      return;
    }
    const customDataTransfer = new VSDataTransfer();
    const data = { range: ranges[0], uri: model.uri.toJSON() };
    customDataTransfer.append(COPY_MIME_TYPES, createStringDataTransferItem(JSON.stringify(data)));
    const text = dataTransfer.get(Mimes.text);
    if (text && ranges.length) {
      void this.primeSymbolReferenceCache(model, ranges[0], text, token);
    }
    return customDataTransfer;
  }
  async primeSymbolReferenceCache(model, range, textItem, token) {
    const copiedText = model.getValueInRange(range);
    if (range.startLineNumber !== range.endLineNumber) {
      return;
    }
    if (token.isCancellationRequested || !identifierPattern.test(copiedText)) {
      return;
    }
    cacheSymbolReference(model.uri, range, copiedText, resolveSymbolReference(
      this.modelService,
      this.languageFeaturesService,
      this.outlineModelService,
      model.uri,
      range,
      copiedText,
      token
    ));
  }
};
CopyTextProvider = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, IOutlineModelService)
], CopyTextProvider);
let CopyAttachmentsProvider = class {
  constructor(pasteTargetService) {
    this.pasteTargetService = pasteTargetService;
    this.kind = new HierarchicalKind("chat.attach.attachments");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [CHAT_ATTACHMENT_MIME_TYPE];
    this.pasteMimeTypes = [CHAT_ATTACHMENT_MIME_TYPE];
  }
  async prepareDocumentPaste(model, _ranges, _dataTransfer, _token) {
    const target = this.pasteTargetService.getTarget(model.uri);
    if (!target) {
      return void 0;
    }
    const dynamicVariables = target.inlineReferences;
    const referencedIds = new Set(dynamicVariables.map((variable) => variable.id));
    const attachments = target.attachments.map((attachment) => attachment.range && !referencedIds.has(attachment.id) ? { ...attachment, range: void 0 } : attachment);
    if (attachments.length === 0 && dynamicVariables.length === 0) {
      return void 0;
    }
    const result = new VSDataTransfer();
    result.append(CHAT_ATTACHMENT_MIME_TYPE, createStringDataTransferItem(JSON.stringify({ attachments, dynamicVariables })));
    return result;
  }
  async provideDocumentPasteEdits(model, _ranges, dataTransfer, _context, token) {
    const target = this.pasteTargetService.getTarget(model.uri);
    if (!target) {
      return void 0;
    }
    const text = dataTransfer.get(Mimes.text);
    const data = dataTransfer.get(CHAT_ATTACHMENT_MIME_TYPE);
    const rawData = await data?.asString();
    const textdata = await text?.asString();
    if (textdata === void 0 || rawData === void 0) {
      return;
    }
    if (token.isCancellationRequested) {
      return;
    }
    let pastedData;
    try {
      pastedData = revive(JSON.parse(rawData));
    } catch {
    }
    if (!Array.isArray(pastedData?.attachments) && !Array.isArray(pastedData?.dynamicVariables)) {
      return;
    }
    const edit = {
      insertText: textdata,
      title: localize("pastedChatAttachments", "Insert Prompt & Attachments"),
      kind: this.kind,
      handledMimeType: CHAT_ATTACHMENT_MIME_TYPE,
      additionalEdit: {
        edits: []
      }
    };
    edit.additionalEdit?.edits.push({
      resource: model.uri,
      redo: () => {
        target.addAttachments(pastedData.attachments);
        for (const dynamicVariable of pastedData.dynamicVariables) {
          target.addInlineReference(dynamicVariable);
        }
      },
      undo: () => {
        target.removeAttachments(pastedData.attachments.map((c) => c.id));
      }
    });
    return createEditSession(edit);
  }
};
CopyAttachmentsProvider = __decorateClass([
  __decorateParam(0, IChatPasteTargetService)
], CopyAttachmentsProvider);
class PasteTextProvider {
  constructor(pasteTargetService, modelService, logService) {
    this.pasteTargetService = pasteTargetService;
    this.modelService = modelService;
    this.logService = logService;
    this.kind = new HierarchicalKind("chat.attach.text");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [];
    this.pasteMimeTypes = [COPY_MIME_TYPES, Mimes.text];
  }
  async provideDocumentPasteEdits(model, ranges, dataTransfer, _context, token) {
    if (!isChatInputModel(model.uri)) {
      return;
    }
    const text = dataTransfer.get(Mimes.text);
    const editorData = dataTransfer.get("vscode-editor-data");
    const additionalEditorData = dataTransfer.get(COPY_MIME_TYPES);
    if (!text) {
      return;
    }
    const textdata = await text.asString();
    const target = this.pasteTargetService.getTarget(model.uri);
    if (!target) {
      return;
    }
    let copiedContext;
    if (editorData && additionalEditorData) {
      try {
        const metadata = JSON.parse(await editorData.asString());
        const additionalData = JSON.parse(await additionalEditorData.asString());
        const start = additionalData.range.startLineNumber;
        const end = additionalData.range.endLineNumber;
        let isWholeLine = true;
        if (start === end) {
          const textModel = this.modelService.getModel(URI.revive(additionalData.uri));
          isWholeLine = !!textModel && start >= 1 && start <= textModel.getLineCount() && textModel.getLineContent(start) === textdata;
        }
        if (isWholeLine) {
          copiedContext = getCopiedContext(textdata, URI.revive(additionalData.uri), metadata.mode, additionalData.range);
        }
      } catch (error) {
        this.logService.warn("Failed to read copied text metadata", error);
      }
    }
    if (token.isCancellationRequested) {
      return;
    }
    const hasRicherPaste = !!copiedContext || dataTransfer.has(CHAT_ATTACHMENT_MIME_TYPE) || dataTransfer.matches("image/*");
    const markdown = hasRicherPaste ? void 0 : await getMeaningfulMarkdown(dataTransfer);
    if (token.isCancellationRequested) {
      return;
    }
    const artifact = hasRicherPaste ? void 0 : createPastedTextArtifact(textdata, target.attachments, markdown);
    if (artifact) {
      if (ranges.length !== 1 || target.isTerminalCommandPaste(textdata, ranges[0])) {
        return;
      }
      const pasteRange = ranges[0];
      const referenceRange = new Range(
        pasteRange.startLineNumber,
        pasteRange.startColumn,
        pasteRange.startLineNumber,
        pasteRange.startColumn + artifact.referenceText.length
      );
      const referenceOffset = model.getOffsetAt(referenceRange.getStartPosition());
      const edit2 = createCustomPasteEdit(
        model,
        [{
          ...artifact.attachment,
          range: { start: referenceOffset, endExclusive: referenceOffset + artifact.referenceText.length }
        }],
        Mimes.text,
        this.kind,
        localize("pastedTextArtifact", "Pasted Text Attachment"),
        this.pasteTargetService,
        {
          inlineReference: { text: artifact.referenceText, range: referenceRange },
          announcement: localize("chat.pastedTextAttached", "Attached pasted text as {0}", artifact.attachment.name)
        }
      );
      return createEditSession(edit2);
    }
    if (!copiedContext) {
      return;
    }
    const currentContextIds = new Set(target.attachments.map((attachment) => attachment.id));
    if (currentContextIds.has(copiedContext.id)) {
      return;
    }
    const edit = createCustomPasteEdit(model, [copiedContext], Mimes.text, this.kind, localize("pastedCodeAttachment", "Pasted Code Attachment"), this.pasteTargetService);
    edit.yieldTo = [{ kind: HierarchicalKind.Empty.append("text", "plain") }];
    return createEditSession(edit);
  }
}
function createPastedTextArtifact(text, existingAttachments, content) {
  if (text.trim().length < pastedTextArtifactMinLength) {
    return void 0;
  }
  let index = 1;
  let name;
  do {
    name = localize("pastedTextArtifact.name", "Pasted text #{0}", index++);
  } while (existingAttachments.some((attachment2) => attachment2.name === name));
  const value = content ?? text;
  const lineCount = value.split(/\r\n|\r|\n/).length;
  const pastedLines = lineCount === 1 ? localize("pastedTextArtifact.oneLine", "1 line") : localize("pastedTextArtifact.multipleLines", "{0} lines", lineCount);
  const attachment = toPasteVariableEntry(name, value, {
    language: content ? "markdown" : "plaintext",
    fileName: name,
    pastedLines,
    _meta: { [ChatPasteAttachmentMetadata.TextArtifact]: true }
  });
  return {
    attachment,
    referenceText: `${chatVariableLeader}attachment:${name}`
  };
}
function getCopiedContext(code, file, language, range) {
  const fileName = basename(file);
  const start = range.startLineNumber;
  const end = range.endLineNumber;
  const resultText = `Copied Selection of Code: 


 From the file: ${fileName} From lines ${start} to ${end} 
 \`\`\`${code}\`\`\``;
  const pastedLines = start === end ? localize("pastedAttachment.oneLine", "1 line") : localize("pastedAttachment.multipleLines", "{0} lines", end + 1 - start);
  return {
    kind: "paste",
    value: resultText,
    id: `${fileName}${start}${end}${range.startColumn}${range.endColumn}`,
    name: `${fileName} ${pastedLines}`,
    icon: Codicon.code,
    pastedLines,
    language,
    fileName: file.toString(),
    copiedFrom: {
      uri: file,
      range
    },
    code,
    references: [{
      reference: file,
      kind: "reference"
    }]
  };
}
function createCustomPasteEdit(model, context, handledMimeType, kind, title, pasteTargetService, options) {
  const label = context.length === 1 ? context[0].name : localize("pastedAttachment.multiple", "{0} and {1} more", context[0].name, context.length - 1);
  const announceImageAttachment = context.length === 1 && isImageVariableEntry(context[0]);
  const inlineReference = context.length === 1 ? options?.inlineReference : void 0;
  const resolveTarget = (operation) => {
    const target = pasteTargetService.getTarget(model.uri);
    if (!target) {
      throw new Error(`No chat paste target found for ${operation}`);
    }
    return target;
  };
  const customEdit = {
    resource: model.uri,
    variable: context,
    undo: () => {
      resolveTarget("undo").removeAttachments(context.map((c) => c.id));
    },
    redo: () => {
      const target = resolveTarget("redo");
      if (inlineReference) {
        target.addInlineAttachment(context[0], inlineReference.text, inlineReference.range);
      } else {
        target.addAttachments(context);
      }
      if (options?.announcement) {
        alert(options.announcement);
      } else if (announceImageAttachment) {
        alert(localize("chat.pastedImageAttached", "Attached image"));
      }
    },
    metadata: {
      needsConfirmation: false,
      label
    }
  };
  return {
    insertText: options?.inlineReference ? `${options.inlineReference.text} ` : "",
    title,
    kind,
    handledMimeType,
    additionalEdit: {
      edits: [customEdit]
    }
  };
}
function createEditSession(edit) {
  return {
    edits: [edit],
    dispose: () => {
    }
  };
}
const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
const symbolCacheMaxSize = 3;
const symbolReferenceCache = [];
function getSymbolReferenceCacheKey(uri, range, text) {
  return `${uri.toString()}|${range.startLineNumber}:${range.startColumn}-${range.endLineNumber}:${range.endColumn}|${text}`;
}
async function getCachedSymbolReference(uri, range, text) {
  const key = getSymbolReferenceCacheKey(uri, range, text);
  return symbolReferenceCache.find((e) => e.key === key)?.promise;
}
function cacheSymbolReference(uri, range, text, valuePromise) {
  const entry = {
    key: getSymbolReferenceCacheKey(uri, range, text),
    promise: valuePromise
  };
  symbolReferenceCache.unshift(entry);
  while (symbolReferenceCache.length > symbolCacheMaxSize) {
    symbolReferenceCache.pop();
  }
  valuePromise.catch(() => {
    const i = symbolReferenceCache.indexOf(entry);
    if (i !== -1) {
      symbolReferenceCache.splice(i, 1);
    }
  });
}
async function resolveSymbolReference(modelService, languageFeaturesService, outlineModelService, sourceUri, sourceRange, pastedText, token) {
  const sourceModel = modelService.getModel(sourceUri);
  if (!sourceModel) {
    return;
  }
  const sourcePosition = new Position(sourceRange.startLineNumber, sourceRange.startColumn);
  const definitions = await getDefinitionsAtPosition(languageFeaturesService.definitionProvider, sourceModel, sourcePosition, false, token);
  if (token.isCancellationRequested || !definitions.length) {
    return;
  }
  const def = definitions[0];
  const defRange = def.targetSelectionRange ?? def.range;
  const defLocation = { uri: def.uri, range: defRange };
  let icon = Codicon.symbolProperty;
  const defModel = modelService.getModel(def.uri);
  if (defModel) {
    try {
      const outline = await outlineModelService.getOrCreate(defModel, token);
      if (!token.isCancellationRequested) {
        const element = outline.getItemEnclosingPosition({ lineNumber: defRange.startLineNumber, column: defRange.startColumn });
        if (element) {
          icon = SymbolKinds.toIcon(element.symbol.kind);
        }
      }
    } catch {
    }
  }
  if (token.isCancellationRequested) {
    return;
  }
  return {
    id: `vscode.symbol/${JSON.stringify(defLocation)}`,
    fullName: pastedText,
    data: defLocation,
    icon
  };
}
let PasteSymbolProvider = class {
  constructor(pasteTargetService, modelService, languageFeaturesService, outlineModelService) {
    this.pasteTargetService = pasteTargetService;
    this.modelService = modelService;
    this.languageFeaturesService = languageFeaturesService;
    this.outlineModelService = outlineModelService;
    this.kind = new HierarchicalKind("chat.attach.symbol");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [];
    this.pasteMimeTypes = [COPY_MIME_TYPES];
  }
  async provideDocumentPasteEdits(model, ranges, dataTransfer, _context, token) {
    if (!isChatInputModel(model.uri)) {
      return;
    }
    const text = dataTransfer.get(Mimes.text);
    const additionalEditorData = dataTransfer.get(COPY_MIME_TYPES);
    if (!text || !additionalEditorData) {
      return;
    }
    const pastedText = await text.asString();
    if (!identifierPattern.test(pastedText)) {
      return;
    }
    let additionalData;
    try {
      additionalData = JSON.parse(await additionalEditorData.asString());
    } catch {
      return;
    }
    const sourceUri = URI.revive(additionalData.uri);
    const sourceRange = additionalData.range;
    if (!this.pasteTargetService.getTarget(model.uri)) {
      return;
    }
    const cached = await getCachedSymbolReference(sourceUri, sourceRange, pastedText);
    let resolved = cached;
    if (!resolved) {
      resolved = await resolveSymbolReference(
        this.modelService,
        this.languageFeaturesService,
        this.outlineModelService,
        sourceUri,
        sourceRange,
        pastedText,
        token
      );
    }
    if (!resolved) {
      return;
    }
    if (token.isCancellationRequested) {
      return;
    }
    const symText = `${chatVariableLeader}sym:${pastedText}`;
    const pasteRange = ranges[0];
    const insertText = `${symText} `;
    const refRange = {
      startLineNumber: pasteRange.startLineNumber,
      startColumn: pasteRange.startColumn,
      endLineNumber: pasteRange.startLineNumber,
      endColumn: pasteRange.startColumn + symText.length
    };
    const dynamicRef = {
      id: resolved.id,
      fullName: resolved.fullName,
      range: refRange,
      data: resolved.data,
      icon: resolved.icon
    };
    const edit = {
      insertText,
      title: localize("pastedSymbolReference", "Pasted Symbol Reference"),
      kind: this.kind,
      handledMimeType: COPY_MIME_TYPES,
      additionalEdit: {
        edits: [{
          resource: model.uri,
          redo: () => {
            this.pasteTargetService.getTarget(model.uri)?.addInlineReference(dynamicRef);
          },
          undo: () => {
          }
        }]
      }
    };
    edit.yieldTo = [{ kind: new HierarchicalKind("chat.attach.text") }];
    return createEditSession(edit);
  }
};
PasteSymbolProvider = __decorateClass([
  __decorateParam(0, IChatPasteTargetService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, IOutlineModelService)
], PasteSymbolProvider);
class PasteHtmlProvider {
  constructor() {
    this.kind = new HierarchicalKind("chat.paste.html");
    this.providedPasteEditKinds = [this.kind];
    this.copyMimeTypes = [];
    this.pasteMimeTypes = [Mimes.html];
  }
  async provideDocumentPasteEdits(model, _ranges, dataTransfer, context, token) {
    if (!isChatInputModel(model.uri)) {
      return;
    }
    if (context.triggerKind !== DocumentPasteTriggerKind.Automatic) {
      return;
    }
    const entry = dataTransfer.get(Mimes.html);
    const htmlText = await entry?.asString();
    if (!htmlText || token.isCancellationRequested) {
      return;
    }
    if (!isMeaningfulHtml(htmlText)) {
      return;
    }
    const markdown = convertHtmlToMarkdown(htmlText);
    if (!markdown) {
      return;
    }
    return createEditSession({
      insertText: markdown,
      title: localize("pasteHtmlAsMarkdown", "Paste as Markdown"),
      kind: this.kind,
      handledMimeType: Mimes.html,
      yieldTo: [
        { kind: new HierarchicalKind("chat.attach.text") },
        { kind: new HierarchicalKind("chat.attach.image") }
      ]
    });
  }
}
async function getMeaningfulMarkdown(dataTransfer) {
  const htmlText = await dataTransfer.get(Mimes.html)?.asString();
  if (!htmlText || !isMeaningfulHtml(htmlText)) {
    return void 0;
  }
  return convertHtmlToMarkdown(htmlText) || void 0;
}
function isMeaningfulHtml(value) {
  return /<(a|strong|b|em|i|h[1-6]|code|pre|ul|ol|li|blockquote|del|s|strike|img|hr)\b/i.test(value);
}
let ChatPasteProvidersFeature = class extends Disposable {
  constructor(instaService, languageFeaturesService, pasteTargetService, extensionService, fileService, modelService, environmentService, logService) {
    super();
    const chatInputProviders = [
      instaService.createInstance(CopyAttachmentsProvider),
      new PasteImageProvider(pasteTargetService, extensionService, fileService, environmentService, logService),
      new PasteTextProvider(pasteTargetService, modelService, logService),
      new PasteHtmlProvider()
    ];
    for (const scheme of chatInputSchemes) {
      for (const provider of chatInputProviders) {
        this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme, pattern: "*", hasAccessToAllModels: true }, provider));
      }
    }
    this._register(languageFeaturesService.documentPasteEditProvider.register({ scheme: Schemas.vscodeChatInput, pattern: "*", hasAccessToAllModels: true }, instaService.createInstance(PasteSymbolProvider)));
    this._register(languageFeaturesService.documentPasteEditProvider.register("*", instaService.createInstance(CopyTextProvider)));
  }
};
ChatPasteProvidersFeature = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, IChatPasteTargetService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IFileService),
  __decorateParam(5, IModelService),
  __decorateParam(6, IEnvironmentService),
  __decorateParam(7, ILogService)
], ChatPasteProvidersFeature);
export {
  CHAT_ATTACHMENT_MIME_TYPE,
  ChatPasteProvidersFeature,
  CopyTextProvider,
  PasteImageProvider,
  PasteTextProvider,
  createPastedTextArtifact,
  imageToHash,
  isImage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcY2hhdFBhc3RlUHJvdmlkZXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IGFsZXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlU3RyaW5nRGF0YVRyYW5zZmVySXRlbSwgSURhdGFUcmFuc2Zlckl0ZW0sIElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCBWU0RhdGFUcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGFUcmFuc2Zlci5qcyc7XG5pbXBvcnQgeyBjb252ZXJ0SHRtbFRvTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvaHRtbFRvTWFya2Rvd24uanMnO1xuaW1wb3J0IHsgSGllcmFyY2hpY2FsS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpZXJhcmNoaWNhbEtpbmQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IERvY3VtZW50UGFzdGVDb250ZXh0LCBEb2N1bWVudFBhc3RlRWRpdCwgRG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlciwgRG9jdW1lbnRQYXN0ZUVkaXRzU2Vzc2lvbiwgRG9jdW1lbnRQYXN0ZVRyaWdnZXJLaW5kLCBTeW1ib2xLaW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2RvY3VtZW50U3ltYm9scy9icm93c2VyL291dGxpbmVNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXREZWZpbml0aW9uc0F0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvZ29Ub1N5bWJvbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzSW1hZ2VWYXJpYWJsZUVudHJ5LCB0b1Bhc3RlVmFyaWFibGVFbnRyeSwgQ2hhdFBhc3RlQXR0YWNobWVudE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgY2hhdFZhcmlhYmxlTGVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IElEeW5hbWljVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBhc3RlVGFyZ2V0LCBJQ2hhdFBhc3RlVGFyZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgY2hhdElucHV0U2NoZW1lcywgaXNDaGF0SW5wdXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgY2xlYW51cE9sZEltYWdlcywgY3JlYXRlRmlsZUZvck1lZGlhLCByZXNpemVJbWFnZSB9IGZyb20gJy4uLy4uLy4uL2NoYXRJbWFnZVV0aWxzLmpzJztcblxuY29uc3QgQ09QWV9NSU1FX1RZUEVTID0gJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLmFkZGl0aW9uYWwtZWRpdG9yLWRhdGEnO1xuY29uc3QgcGFzdGVkVGV4dEFydGlmYWN0TWluTGVuZ3RoID0gMTAwMDtcbmV4cG9ydCBjb25zdCBDSEFUX0FUVEFDSE1FTlRfTUlNRV9UWVBFID0gJ2FwcGxpY2F0aW9uL3ZuZC5jaGF0LmF0dGFjaG1lbnQranNvbic7XG5cbmludGVyZmFjZSBTZXJpYWxpemVkQ29weURhdGEge1xuXHRyZWFkb25seSB1cmk6IFVyaUNvbXBvbmVudHM7XG5cdHJlYWRvbmx5IHJhbmdlOiBJUmFuZ2U7XG59XG5cbmludGVyZmFjZSBSZXNvbHZlZFN5bWJvbFJlZmVyZW5jZSB7XG5cdGlkOiBzdHJpbmc7XG5cdGZ1bGxOYW1lOiBzdHJpbmc7XG5cdGRhdGE6IHtcblx0XHR1cmk6IFVSSTtcblx0XHRyYW5nZTogSVJhbmdlO1xuXHR9O1xuXHRpY29uOiBJRHluYW1pY1ZhcmlhYmxlWydpY29uJ107XG59XG5cbmV4cG9ydCBjbGFzcyBQYXN0ZUltYWdlUHJvdmlkZXIgaW1wbGVtZW50cyBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBpbWFnZXNGb2xkZXI6IFVSSTtcblxuXHRwdWJsaWMgcmVhZG9ubHkga2luZCA9IG5ldyBIaWVyYXJjaGljYWxLaW5kKCdjaGF0LmF0dGFjaC5pbWFnZScpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IFt0aGlzLmtpbmRdO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb3B5TWltZVR5cGVzID0gW107XG5cdHB1YmxpYyByZWFkb25seSBwYXN0ZU1pbWVUeXBlcyA9IFsnaW1hZ2UvKiddO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGFzdGVUYXJnZXRTZXJ2aWNlOiBJQ2hhdFBhc3RlVGFyZ2V0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmltYWdlc0ZvbGRlciA9IGpvaW5QYXRoKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2VIb21lLCAndnNjb2RlLWNoYXQtaW1hZ2VzJyk7XG5cdFx0Y2xlYW51cE9sZEltYWdlcyh0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuaW1hZ2VzRm9sZGVyLCk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZXM6IHJlYWRvbmx5IElSYW5nZVtdLCBkYXRhVHJhbnNmZXI6IElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCBjb250ZXh0OiBEb2N1bWVudFBhc3RlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxEb2N1bWVudFBhc3RlRWRpdHNTZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5zb21lKGV4dCA9PiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHQsICdjaGF0UmVmZXJlbmNlQmluYXJ5RGF0YScpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1cHBvcnRlZE1pbWVUeXBlcyA9IFtcblx0XHRcdCdpbWFnZS9wbmcnLFxuXHRcdFx0J2ltYWdlL2pwZWcnLFxuXHRcdFx0J2ltYWdlL2pwZycsXG5cdFx0XHQnaW1hZ2UvYm1wJyxcblx0XHRcdCdpbWFnZS9naWYnLFxuXHRcdFx0J2ltYWdlL3RpZmYnXG5cdFx0XTtcblxuXHRcdGxldCBtaW1lVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBpbWFnZUl0ZW06IElEYXRhVHJhbnNmZXJJdGVtIHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRmluZCB0aGUgZmlyc3QgbWF0Y2hpbmcgaW1hZ2UgdHlwZSBpbiB0aGUgZGF0YVRyYW5zZmVyXG5cdFx0Zm9yIChjb25zdCB0eXBlIG9mIHN1cHBvcnRlZE1pbWVUeXBlcykge1xuXHRcdFx0aW1hZ2VJdGVtID0gZGF0YVRyYW5zZmVyLmdldCh0eXBlKTtcblx0XHRcdGlmIChpbWFnZUl0ZW0pIHtcblx0XHRcdFx0bWltZVR5cGUgPSB0eXBlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWltYWdlSXRlbSB8fCAhbWltZVR5cGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VyckNsaXBib2FyZCA9IGF3YWl0IGltYWdlSXRlbS5hc0ZpbGUoKT8uZGF0YSgpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCAhY3VyckNsaXBib2FyZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMucGFzdGVUYXJnZXRTZXJ2aWNlLmdldFRhcmdldChtb2RlbC51cmkpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXR0YWNoZWRWYXJpYWJsZXMgPSB0YXJnZXQuYXR0YWNobWVudHM7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBsb2NhbGl6ZSgncGFzdGVkSW1hZ2VOYW1lJywgJ1Bhc3RlZCBJbWFnZScpO1xuXHRcdGxldCB0ZW1wRGlzcGxheU5hbWUgPSBkaXNwbGF5TmFtZTtcblxuXHRcdGZvciAobGV0IGFwcGVuZFZhbHVlID0gMjsgYXR0YWNoZWRWYXJpYWJsZXMuc29tZShhdHRhY2htZW50ID0+IGF0dGFjaG1lbnQubmFtZSA9PT0gdGVtcERpc3BsYXlOYW1lKTsgYXBwZW5kVmFsdWUrKykge1xuXHRcdFx0dGVtcERpc3BsYXlOYW1lID0gYCR7ZGlzcGxheU5hbWV9ICR7YXBwZW5kVmFsdWV9YDtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlUmVmZXJlbmNlID0gYXdhaXQgY3JlYXRlRmlsZUZvck1lZGlhKHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuaW1hZ2VzRm9sZGVyLCBjdXJyQ2xpcGJvYXJkLCBtaW1lVHlwZSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFmaWxlUmVmZXJlbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NhbGVkSW1hZ2VEYXRhID0gYXdhaXQgcmVzaXplSW1hZ2UoY3VyckNsaXBib2FyZCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFzY2FsZWRJbWFnZURhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzY2FsZWRJbWFnZUNvbnRleHQgPSBhd2FpdCBnZXRJbWFnZUF0dGFjaENvbnRleHQoc2NhbGVkSW1hZ2VEYXRhLCBtaW1lVHlwZSwgdG9rZW4sIHRlbXBEaXNwbGF5TmFtZSwgZmlsZVJlZmVyZW5jZSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFzY2FsZWRJbWFnZUNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gYXR0YWNoIG9ubHkgbmV3IGNvbnRleHRzXG5cdFx0Y29uc3QgY3VycmVudENvbnRleHRJZHMgPSBuZXcgU2V0KHRhcmdldC5hdHRhY2htZW50cy5tYXAoYXR0YWNobWVudCA9PiBhdHRhY2htZW50LmlkKSk7XG5cdFx0aWYgKGN1cnJlbnRDb250ZXh0SWRzLmhhcyhzY2FsZWRJbWFnZUNvbnRleHQuaWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdCA9IGNyZWF0ZUN1c3RvbVBhc3RlRWRpdChtb2RlbCwgW3NjYWxlZEltYWdlQ29udGV4dF0sIG1pbWVUeXBlLCB0aGlzLmtpbmQsIGxvY2FsaXplKCdwYXN0ZWRJbWFnZUF0dGFjaG1lbnQnLCAnUGFzdGVkIEltYWdlIEF0dGFjaG1lbnQnKSwgdGhpcy5wYXN0ZVRhcmdldFNlcnZpY2UpO1xuXHRcdHJldHVybiBjcmVhdGVFZGl0U2Vzc2lvbihlZGl0KTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBnZXRJbWFnZUF0dGFjaENvbnRleHQoZGF0YTogVWludDhBcnJheSwgbWltZVR5cGU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBkaXNwbGF5TmFtZTogc3RyaW5nLCByZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGltYWdlSGFzaCA9IGF3YWl0IGltYWdlVG9IYXNoKGRhdGEpO1xuXHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdHZhbHVlOiBkYXRhLFxuXHRcdGlkOiBpbWFnZUhhc2gsXG5cdFx0bmFtZTogZGlzcGxheU5hbWUsXG5cdFx0aWNvbjogQ29kaWNvbi5maWxlTWVkaWEsXG5cdFx0bWltZVR5cGUsXG5cdFx0aXNQYXN0ZWQ6IHRydWUsXG5cdFx0cmVmZXJlbmNlczogW3sgcmVmZXJlbmNlOiByZXNvdXJjZSwga2luZDogJ3JlZmVyZW5jZScgfV1cblx0fTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGltYWdlVG9IYXNoKGRhdGE6IFVpbnQ4QXJyYXkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRjb25zdCBoYXNoQnVmZmVyID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoJ1NIQS0yNTYnLCBkYXRhKTtcblx0Y29uc3QgaGFzaEFycmF5ID0gQXJyYXkuZnJvbShuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKSk7XG5cdHJldHVybiBoYXNoQXJyYXkubWFwKGIgPT4gYi50b1N0cmluZygxNikucGFkU3RhcnQoMiwgJzAnKSkuam9pbignJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0ltYWdlKGFycmF5OiBVaW50OEFycmF5KTogYm9vbGVhbiB7XG5cdGlmIChhcnJheS5sZW5ndGggPCA0KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gTWFnaWMgbnVtYmVycyAoaWRlbnRpZmljYXRpb24gYnl0ZXMpIGZvciB2YXJpb3VzIGltYWdlIGZvcm1hdHNcblx0Y29uc3QgaWRlbnRpZmllcjogeyBba2V5OiBzdHJpbmddOiBudW1iZXJbXSB9ID0ge1xuXHRcdHBuZzogWzB4ODksIDB4NTAsIDB4NEUsIDB4NDcsIDB4MEQsIDB4MEEsIDB4MUEsIDB4MEFdLFxuXHRcdGpwZWc6IFsweEZGLCAweEQ4LCAweEZGXSxcblx0XHRibXA6IFsweDQyLCAweDREXSxcblx0XHRnaWY6IFsweDQ3LCAweDQ5LCAweDQ2LCAweDM4XSxcblx0XHR0aWZmOiBbMHg0OSwgMHg0OSwgMHgyQSwgMHgwMF1cblx0fTtcblxuXHRyZXR1cm4gT2JqZWN0LnZhbHVlcyhpZGVudGlmaWVyKS5zb21lKChzaWduYXR1cmUpID0+XG5cdFx0c2lnbmF0dXJlLmV2ZXJ5KChieXRlLCBpbmRleCkgPT4gYXJyYXlbaW5kZXhdID09PSBieXRlKVxuXHQpO1xufVxuXG5leHBvcnQgY2xhc3MgQ29weVRleHRQcm92aWRlciBpbXBsZW1lbnRzIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIge1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IFtdO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29weU1pbWVUeXBlcyA9IFtDT1BZX01JTUVfVFlQRVNdO1xuXHRwdWJsaWMgcmVhZG9ubHkgcGFzdGVNaW1lVHlwZXMgPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASU91dGxpbmVNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvdXRsaW5lTW9kZWxTZXJ2aWNlOiBJT3V0bGluZU1vZGVsU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlRG9jdW1lbnRQYXN0ZShtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2VzOiByZWFkb25seSBJUmFuZ2VbXSwgZGF0YVRyYW5zZmVyOiBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx1bmRlZmluZWQgfCBJUmVhZG9ubHlWU0RhdGFUcmFuc2Zlcj4ge1xuXHRcdGlmIChpc0NoYXRJbnB1dE1vZGVsKG1vZGVsLnVyaSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXN0b21EYXRhVHJhbnNmZXIgPSBuZXcgVlNEYXRhVHJhbnNmZXIoKTtcblx0XHRjb25zdCBkYXRhOiBTZXJpYWxpemVkQ29weURhdGEgPSB7IHJhbmdlOiByYW5nZXNbMF0sIHVyaTogbW9kZWwudXJpLnRvSlNPTigpIH07XG5cdFx0Y3VzdG9tRGF0YVRyYW5zZmVyLmFwcGVuZChDT1BZX01JTUVfVFlQRVMsIGNyZWF0ZVN0cmluZ0RhdGFUcmFuc2Zlckl0ZW0oSlNPTi5zdHJpbmdpZnkoZGF0YSkpKTtcblxuXHRcdGNvbnN0IHRleHQgPSBkYXRhVHJhbnNmZXIuZ2V0KE1pbWVzLnRleHQpO1xuXHRcdGlmICh0ZXh0ICYmIHJhbmdlcy5sZW5ndGgpIHtcblx0XHRcdHZvaWQgdGhpcy5wcmltZVN5bWJvbFJlZmVyZW5jZUNhY2hlKG1vZGVsLCByYW5nZXNbMF0sIHRleHQsIHRva2VuKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VzdG9tRGF0YVRyYW5zZmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcmltZVN5bWJvbFJlZmVyZW5jZUNhY2hlKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogSVJhbmdlLCB0ZXh0SXRlbTogSURhdGFUcmFuc2Zlckl0ZW0sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvcGllZFRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmFuZ2UpO1xuXHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgIWlkZW50aWZpZXJQYXR0ZXJuLnRlc3QoY29waWVkVGV4dCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjYWNoZVN5bWJvbFJlZmVyZW5jZShtb2RlbC51cmksIHJhbmdlLCBjb3BpZWRUZXh0LCByZXNvbHZlU3ltYm9sUmVmZXJlbmNlKFxuXHRcdFx0dGhpcy5tb2RlbFNlcnZpY2UsXG5cdFx0XHR0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdFx0dGhpcy5vdXRsaW5lTW9kZWxTZXJ2aWNlLFxuXHRcdFx0bW9kZWwudXJpLFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRjb3BpZWRUZXh0LFxuXHRcdFx0dG9rZW4sXG5cdFx0KSk7XG5cdH1cbn1cblxuY2xhc3MgQ29weUF0dGFjaG1lbnRzUHJvdmlkZXIgaW1wbGVtZW50cyBEb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkga2luZCA9IG5ldyBIaWVyYXJjaGljYWxLaW5kKCdjaGF0LmF0dGFjaC5hdHRhY2htZW50cycpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IFt0aGlzLmtpbmRdO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb3B5TWltZVR5cGVzID0gW0NIQVRfQVRUQUNITUVOVF9NSU1FX1RZUEVdO1xuXHRwdWJsaWMgcmVhZG9ubHkgcGFzdGVNaW1lVHlwZXMgPSBbQ0hBVF9BVFRBQ0hNRU5UX01JTUVfVFlQRV07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0UGFzdGVUYXJnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGFzdGVUYXJnZXRTZXJ2aWNlOiBJQ2hhdFBhc3RlVGFyZ2V0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlRG9jdW1lbnRQYXN0ZShtb2RlbDogSVRleHRNb2RlbCwgX3JhbmdlczogcmVhZG9ubHkgSVJhbmdlW10sIF9kYXRhVHJhbnNmZXI6IElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx1bmRlZmluZWQgfCBJUmVhZG9ubHlWU0RhdGFUcmFuc2Zlcj4ge1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5wYXN0ZVRhcmdldFNlcnZpY2UuZ2V0VGFyZ2V0KG1vZGVsLnVyaSk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHluYW1pY1ZhcmlhYmxlcyA9IHRhcmdldC5pbmxpbmVSZWZlcmVuY2VzO1xuXHRcdGNvbnN0IHJlZmVyZW5jZWRJZHMgPSBuZXcgU2V0KGR5bmFtaWNWYXJpYWJsZXMubWFwKHZhcmlhYmxlID0+IHZhcmlhYmxlLmlkKSk7XG5cdFx0Ly8gQSByYW5nZWQgYXR0YWNobWVudCB3aG9zZSByZWZlcmVuY2UgaXMgbm90IGNhcnJpZWQgYWxvbmcgd291bGQgYmUgcHJ1bmVkXG5cdFx0Ly8gYXMgYW4gb3JwaGFuIGJ5IHRoZSByZWNlaXZpbmcgaW5wdXQsIHNvIHNlbmQgaXQgYXMgYSBwbGFpbiBhdHRhY2htZW50LlxuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gdGFyZ2V0LmF0dGFjaG1lbnRzLm1hcChhdHRhY2htZW50ID0+XG5cdFx0XHRhdHRhY2htZW50LnJhbmdlICYmICFyZWZlcmVuY2VkSWRzLmhhcyhhdHRhY2htZW50LmlkKSA/IHsgLi4uYXR0YWNobWVudCwgcmFuZ2U6IHVuZGVmaW5lZCB9IDogYXR0YWNobWVudCk7XG5cblx0XHRpZiAoYXR0YWNobWVudHMubGVuZ3RoID09PSAwICYmIGR5bmFtaWNWYXJpYWJsZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBWU0RhdGFUcmFuc2ZlcigpO1xuXHRcdHJlc3VsdC5hcHBlbmQoQ0hBVF9BVFRBQ0hNRU5UX01JTUVfVFlQRSwgY3JlYXRlU3RyaW5nRGF0YVRyYW5zZmVySXRlbShKU09OLnN0cmluZ2lmeSh7IGF0dGFjaG1lbnRzLCBkeW5hbWljVmFyaWFibGVzIH0pKSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVEb2N1bWVudFBhc3RlRWRpdHMobW9kZWw6IElUZXh0TW9kZWwsIF9yYW5nZXM6IHJlYWRvbmx5IElSYW5nZVtdLCBkYXRhVHJhbnNmZXI6IElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCBfY29udGV4dDogRG9jdW1lbnRQYXN0ZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RG9jdW1lbnRQYXN0ZUVkaXRzU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5wYXN0ZVRhcmdldFNlcnZpY2UuZ2V0VGFyZ2V0KG1vZGVsLnVyaSk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IGRhdGFUcmFuc2Zlci5nZXQoTWltZXMudGV4dCk7XG5cdFx0Y29uc3QgZGF0YSA9IGRhdGFUcmFuc2Zlci5nZXQoQ0hBVF9BVFRBQ0hNRU5UX01JTUVfVFlQRSk7XG5cdFx0Y29uc3QgcmF3RGF0YSA9IGF3YWl0IGRhdGE/LmFzU3RyaW5nKCk7XG5cdFx0Y29uc3QgdGV4dGRhdGEgPSBhd2FpdCB0ZXh0Py5hc1N0cmluZygpO1xuXG5cdFx0aWYgKHRleHRkYXRhID09PSB1bmRlZmluZWQgfHwgcmF3RGF0YSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHBhc3RlZERhdGE6IHsgYXR0YWNobWVudHM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTsgZHluYW1pY1ZhcmlhYmxlczogSUR5bmFtaWNWYXJpYWJsZVtdIH0gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHBhc3RlZERhdGEgPSByZXZpdmUoSlNPTi5wYXJzZShyYXdEYXRhKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvL1xuXHRcdH1cblxuXHRcdGlmICghQXJyYXkuaXNBcnJheShwYXN0ZWREYXRhPy5hdHRhY2htZW50cykgJiYgIUFycmF5LmlzQXJyYXkocGFzdGVkRGF0YT8uZHluYW1pY1ZhcmlhYmxlcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0OiBEb2N1bWVudFBhc3RlRWRpdCA9IHtcblx0XHRcdGluc2VydFRleHQ6IHRleHRkYXRhLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdwYXN0ZWRDaGF0QXR0YWNobWVudHMnLCAnSW5zZXJ0IFByb21wdCAmIEF0dGFjaG1lbnRzJyksXG5cdFx0XHRraW5kOiB0aGlzLmtpbmQsXG5cdFx0XHRoYW5kbGVkTWltZVR5cGU6IENIQVRfQVRUQUNITUVOVF9NSU1FX1RZUEUsXG5cdFx0XHRhZGRpdGlvbmFsRWRpdDoge1xuXHRcdFx0XHRlZGl0czogW11cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0ZWRpdC5hZGRpdGlvbmFsRWRpdD8uZWRpdHMucHVzaCh7XG5cdFx0XHRyZXNvdXJjZTogbW9kZWwudXJpLFxuXHRcdFx0cmVkbzogKCkgPT4ge1xuXHRcdFx0XHR0YXJnZXQuYWRkQXR0YWNobWVudHMocGFzdGVkRGF0YS5hdHRhY2htZW50cyk7XG5cdFx0XHRcdGZvciAoY29uc3QgZHluYW1pY1ZhcmlhYmxlIG9mIHBhc3RlZERhdGEuZHluYW1pY1ZhcmlhYmxlcykge1xuXHRcdFx0XHRcdHRhcmdldC5hZGRJbmxpbmVSZWZlcmVuY2UoZHluYW1pY1ZhcmlhYmxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHVuZG86ICgpID0+IHtcblx0XHRcdFx0dGFyZ2V0LnJlbW92ZUF0dGFjaG1lbnRzKHBhc3RlZERhdGEuYXR0YWNobWVudHMubWFwKGMgPT4gYy5pZCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGNyZWF0ZUVkaXRTZXNzaW9uKGVkaXQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQYXN0ZVRleHRQcm92aWRlciBpbXBsZW1lbnRzIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIge1xuXG5cdHB1YmxpYyByZWFkb25seSBraW5kID0gbmV3IEhpZXJhcmNoaWNhbEtpbmQoJ2NoYXQuYXR0YWNoLnRleHQnKTtcblx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVkUGFzdGVFZGl0S2luZHMgPSBbdGhpcy5raW5kXTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgY29weU1pbWVUeXBlcyA9IFtdO1xuXHRwdWJsaWMgcmVhZG9ubHkgcGFzdGVNaW1lVHlwZXMgPSBbQ09QWV9NSU1FX1RZUEVTLCBNaW1lcy50ZXh0XTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBhc3RlVGFyZ2V0U2VydmljZTogSUNoYXRQYXN0ZVRhcmdldFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZXM6IHJlYWRvbmx5IElSYW5nZVtdLCBkYXRhVHJhbnNmZXI6IElSZWFkb25seVZTRGF0YVRyYW5zZmVyLCBfY29udGV4dDogRG9jdW1lbnRQYXN0ZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RG9jdW1lbnRQYXN0ZUVkaXRzU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghaXNDaGF0SW5wdXRNb2RlbChtb2RlbC51cmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRleHQgPSBkYXRhVHJhbnNmZXIuZ2V0KE1pbWVzLnRleHQpO1xuXHRcdGNvbnN0IGVkaXRvckRhdGEgPSBkYXRhVHJhbnNmZXIuZ2V0KCd2c2NvZGUtZWRpdG9yLWRhdGEnKTtcblx0XHRjb25zdCBhZGRpdGlvbmFsRWRpdG9yRGF0YSA9IGRhdGFUcmFuc2Zlci5nZXQoQ09QWV9NSU1FX1RZUEVTKTtcblxuXHRcdGlmICghdGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRkYXRhID0gYXdhaXQgdGV4dC5hc1N0cmluZygpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMucGFzdGVUYXJnZXRTZXJ2aWNlLmdldFRhcmdldChtb2RlbC51cmkpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGNvcGllZENvbnRleHQ6IElDaGF0UmVxdWVzdFBhc3RlVmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZWRpdG9yRGF0YSAmJiBhZGRpdGlvbmFsRWRpdG9yRGF0YSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbWV0YWRhdGEgPSBKU09OLnBhcnNlKGF3YWl0IGVkaXRvckRhdGEuYXNTdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IGFkZGl0aW9uYWxEYXRhOiBTZXJpYWxpemVkQ29weURhdGEgPSBKU09OLnBhcnNlKGF3YWl0IGFkZGl0aW9uYWxFZGl0b3JEYXRhLmFzU3RyaW5nKCkpO1xuXHRcdFx0XHRjb25zdCBzdGFydCA9IGFkZGl0aW9uYWxEYXRhLnJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0Y29uc3QgZW5kID0gYWRkaXRpb25hbERhdGEucmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRcdFx0bGV0IGlzV2hvbGVMaW5lID0gdHJ1ZTtcblx0XHRcdFx0aWYgKHN0YXJ0ID09PSBlbmQpIHtcblx0XHRcdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChVUkkucmV2aXZlKGFkZGl0aW9uYWxEYXRhLnVyaSkpO1xuXHRcdFx0XHRcdGlzV2hvbGVMaW5lID0gISF0ZXh0TW9kZWwgJiYgc3RhcnQgPj0gMSAmJiBzdGFydCA8PSB0ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCkgJiYgdGV4dE1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0KSA9PT0gdGV4dGRhdGE7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNXaG9sZUxpbmUpIHtcblx0XHRcdFx0XHRjb3BpZWRDb250ZXh0ID0gZ2V0Q29waWVkQ29udGV4dCh0ZXh0ZGF0YSwgVVJJLnJldml2ZShhZGRpdGlvbmFsRGF0YS51cmkpLCBtZXRhZGF0YS5tb2RlLCBhZGRpdGlvbmFsRGF0YS5yYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdGYWlsZWQgdG8gcmVhZCBjb3BpZWQgdGV4dCBtZXRhZGF0YScsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDbGlwYm9hcmQgZmxhdm9ycyB0aGF0IG93biB0aGUgcGFzdGUgb3V0cmlnaHQuIE1lYW5pbmdmdWwgSFRNTCBpcyBub3Qgb25lXG5cdFx0Ly8gb2YgdGhlbTogY29udmVydGluZyBhIGxvbmcgcGFzdGUgdG8gTWFya2Rvd24gYW5kIGluc2VydGluZyBpdCBpbmxpbmUgaXNcblx0XHQvLyBleGFjdGx5IHdoYXQgdGhlIGFydGlmYWN0IGV4aXN0cyB0byBhdm9pZCwgc28gbGVuZ3RoIGRlY2lkZXMgdGhhdCBjYXNlLlxuXHRcdGNvbnN0IGhhc1JpY2hlclBhc3RlID0gISFjb3BpZWRDb250ZXh0XG5cdFx0XHR8fCBkYXRhVHJhbnNmZXIuaGFzKENIQVRfQVRUQUNITUVOVF9NSU1FX1RZUEUpXG5cdFx0XHR8fCBkYXRhVHJhbnNmZXIubWF0Y2hlcygnaW1hZ2UvKicpO1xuXHRcdGNvbnN0IG1hcmtkb3duID0gaGFzUmljaGVyUGFzdGUgPyB1bmRlZmluZWQgOiBhd2FpdCBnZXRNZWFuaW5nZnVsTWFya2Rvd24oZGF0YVRyYW5zZmVyKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXJ0aWZhY3QgPSBoYXNSaWNoZXJQYXN0ZSA/IHVuZGVmaW5lZCA6IGNyZWF0ZVBhc3RlZFRleHRBcnRpZmFjdCh0ZXh0ZGF0YSwgdGFyZ2V0LmF0dGFjaG1lbnRzLCBtYXJrZG93bik7XG5cdFx0aWYgKGFydGlmYWN0KSB7XG5cdFx0XHRpZiAocmFuZ2VzLmxlbmd0aCAhPT0gMSB8fCB0YXJnZXQuaXNUZXJtaW5hbENvbW1hbmRQYXN0ZSh0ZXh0ZGF0YSwgcmFuZ2VzWzBdKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXN0ZVJhbmdlID0gcmFuZ2VzWzBdO1xuXHRcdFx0Y29uc3QgcmVmZXJlbmNlUmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRcdHBhc3RlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRwYXN0ZVJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRwYXN0ZVJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0cGFzdGVSYW5nZS5zdGFydENvbHVtbiArIGFydGlmYWN0LnJlZmVyZW5jZVRleHQubGVuZ3RoXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgcmVmZXJlbmNlT2Zmc2V0ID0gbW9kZWwuZ2V0T2Zmc2V0QXQocmVmZXJlbmNlUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdGNvbnN0IGVkaXQgPSBjcmVhdGVDdXN0b21QYXN0ZUVkaXQoXG5cdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdC4uLmFydGlmYWN0LmF0dGFjaG1lbnQsXG5cdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IHJlZmVyZW5jZU9mZnNldCwgZW5kRXhjbHVzaXZlOiByZWZlcmVuY2VPZmZzZXQgKyBhcnRpZmFjdC5yZWZlcmVuY2VUZXh0Lmxlbmd0aCB9LFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0TWltZXMudGV4dCxcblx0XHRcdFx0dGhpcy5raW5kLFxuXHRcdFx0XHRsb2NhbGl6ZSgncGFzdGVkVGV4dEFydGlmYWN0JywgXCJQYXN0ZWQgVGV4dCBBdHRhY2htZW50XCIpLFxuXHRcdFx0XHR0aGlzLnBhc3RlVGFyZ2V0U2VydmljZSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlubGluZVJlZmVyZW5jZTogeyB0ZXh0OiBhcnRpZmFjdC5yZWZlcmVuY2VUZXh0LCByYW5nZTogcmVmZXJlbmNlUmFuZ2UgfSxcblx0XHRcdFx0XHRhbm5vdW5jZW1lbnQ6IGxvY2FsaXplKCdjaGF0LnBhc3RlZFRleHRBdHRhY2hlZCcsIFwiQXR0YWNoZWQgcGFzdGVkIHRleHQgYXMgezB9XCIsIGFydGlmYWN0LmF0dGFjaG1lbnQubmFtZSksXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gY3JlYXRlRWRpdFNlc3Npb24oZWRpdCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFjb3BpZWRDb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRDb250ZXh0SWRzID0gbmV3IFNldCh0YXJnZXQuYXR0YWNobWVudHMubWFwKGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudC5pZCkpO1xuXHRcdGlmIChjdXJyZW50Q29udGV4dElkcy5oYXMoY29waWVkQ29udGV4dC5pZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0ID0gY3JlYXRlQ3VzdG9tUGFzdGVFZGl0KG1vZGVsLCBbY29waWVkQ29udGV4dF0sIE1pbWVzLnRleHQsIHRoaXMua2luZCwgbG9jYWxpemUoJ3Bhc3RlZENvZGVBdHRhY2htZW50JywgJ1Bhc3RlZCBDb2RlIEF0dGFjaG1lbnQnKSwgdGhpcy5wYXN0ZVRhcmdldFNlcnZpY2UpO1xuXHRcdGVkaXQueWllbGRUbyA9IFt7IGtpbmQ6IEhpZXJhcmNoaWNhbEtpbmQuRW1wdHkuYXBwZW5kKCd0ZXh0JywgJ3BsYWluJykgfV07XG5cdFx0cmV0dXJuIGNyZWF0ZUVkaXRTZXNzaW9uKGVkaXQpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVQYXN0ZWRUZXh0QXJ0aWZhY3QoXG5cdHRleHQ6IHN0cmluZyxcblx0ZXhpc3RpbmdBdHRhY2htZW50czogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdLFxuXHQvKiogUmljaGVyIHJlcHJlc2VudGF0aW9uIHRvIHN0b3JlIGluc3RlYWQgb2YgYHRleHRgLCBlLmcuIE1hcmtkb3duIGZyb20gcGFzdGVkIEhUTUwuICovXG5cdGNvbnRlbnQ/OiBzdHJpbmcsXG4pOiB7IHJlYWRvbmx5IGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFBhc3RlVmFyaWFibGVFbnRyeTsgcmVhZG9ubHkgcmVmZXJlbmNlVGV4dDogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRpZiAodGV4dC50cmltKCkubGVuZ3RoIDwgcGFzdGVkVGV4dEFydGlmYWN0TWluTGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGxldCBpbmRleCA9IDE7XG5cdGxldCBuYW1lOiBzdHJpbmc7XG5cdGRvIHtcblx0XHRuYW1lID0gbG9jYWxpemUoJ3Bhc3RlZFRleHRBcnRpZmFjdC5uYW1lJywgXCJQYXN0ZWQgdGV4dCAjezB9XCIsIGluZGV4KyspO1xuXHR9IHdoaWxlIChleGlzdGluZ0F0dGFjaG1lbnRzLnNvbWUoYXR0YWNobWVudCA9PiBhdHRhY2htZW50Lm5hbWUgPT09IG5hbWUpKTtcblxuXHRjb25zdCB2YWx1ZSA9IGNvbnRlbnQgPz8gdGV4dDtcblx0Y29uc3QgbGluZUNvdW50ID0gdmFsdWUuc3BsaXQoL1xcclxcbnxcXHJ8XFxuLykubGVuZ3RoO1xuXHRjb25zdCBwYXN0ZWRMaW5lcyA9IGxpbmVDb3VudCA9PT0gMVxuXHRcdD8gbG9jYWxpemUoJ3Bhc3RlZFRleHRBcnRpZmFjdC5vbmVMaW5lJywgXCIxIGxpbmVcIilcblx0XHQ6IGxvY2FsaXplKCdwYXN0ZWRUZXh0QXJ0aWZhY3QubXVsdGlwbGVMaW5lcycsIFwiezB9IGxpbmVzXCIsIGxpbmVDb3VudCk7XG5cdGNvbnN0IGF0dGFjaG1lbnQgPSB0b1Bhc3RlVmFyaWFibGVFbnRyeShuYW1lLCB2YWx1ZSwge1xuXHRcdGxhbmd1YWdlOiBjb250ZW50ID8gJ21hcmtkb3duJyA6ICdwbGFpbnRleHQnLFxuXHRcdGZpbGVOYW1lOiBuYW1lLFxuXHRcdHBhc3RlZExpbmVzLFxuXHRcdF9tZXRhOiB7IFtDaGF0UGFzdGVBdHRhY2htZW50TWV0YWRhdGEuVGV4dEFydGlmYWN0XTogdHJ1ZSB9LFxuXHR9KTtcblxuXHRyZXR1cm4ge1xuXHRcdGF0dGFjaG1lbnQsXG5cdFx0cmVmZXJlbmNlVGV4dDogYCR7Y2hhdFZhcmlhYmxlTGVhZGVyfWF0dGFjaG1lbnQ6JHtuYW1lfWAsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldENvcGllZENvbnRleHQoY29kZTogc3RyaW5nLCBmaWxlOiBVUkksIGxhbmd1YWdlOiBzdHJpbmcsIHJhbmdlOiBJUmFuZ2UpOiBJQ2hhdFJlcXVlc3RQYXN0ZVZhcmlhYmxlRW50cnkge1xuXHRjb25zdCBmaWxlTmFtZSA9IGJhc2VuYW1lKGZpbGUpO1xuXHRjb25zdCBzdGFydCA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0Y29uc3QgZW5kID0gcmFuZ2UuZW5kTGluZU51bWJlcjtcblx0Y29uc3QgcmVzdWx0VGV4dCA9IGBDb3BpZWQgU2VsZWN0aW9uIG9mIENvZGU6IFxcblxcblxcbiBGcm9tIHRoZSBmaWxlOiAke2ZpbGVOYW1lfSBGcm9tIGxpbmVzICR7c3RhcnR9IHRvICR7ZW5kfSBcXG4gXFxgXFxgXFxgJHtjb2RlfVxcYFxcYFxcYGA7XG5cdGNvbnN0IHBhc3RlZExpbmVzID0gc3RhcnQgPT09IGVuZCA/IGxvY2FsaXplKCdwYXN0ZWRBdHRhY2htZW50Lm9uZUxpbmUnLCAnMSBsaW5lJykgOiBsb2NhbGl6ZSgncGFzdGVkQXR0YWNobWVudC5tdWx0aXBsZUxpbmVzJywgJ3swfSBsaW5lcycsIGVuZCArIDEgLSBzdGFydCk7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ3Bhc3RlJyxcblx0XHR2YWx1ZTogcmVzdWx0VGV4dCxcblx0XHRpZDogYCR7ZmlsZU5hbWV9JHtzdGFydH0ke2VuZH0ke3JhbmdlLnN0YXJ0Q29sdW1ufSR7cmFuZ2UuZW5kQ29sdW1ufWAsXG5cdFx0bmFtZTogYCR7ZmlsZU5hbWV9ICR7cGFzdGVkTGluZXN9YCxcblx0XHRpY29uOiBDb2RpY29uLmNvZGUsXG5cdFx0cGFzdGVkTGluZXMsXG5cdFx0bGFuZ3VhZ2UsXG5cdFx0ZmlsZU5hbWU6IGZpbGUudG9TdHJpbmcoKSxcblx0XHRjb3BpZWRGcm9tOiB7XG5cdFx0XHR1cmk6IGZpbGUsXG5cdFx0XHRyYW5nZVxuXHRcdH0sXG5cdFx0Y29kZSxcblx0XHRyZWZlcmVuY2VzOiBbe1xuXHRcdFx0cmVmZXJlbmNlOiBmaWxlLFxuXHRcdFx0a2luZDogJ3JlZmVyZW5jZSdcblx0XHR9XVxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDdXN0b21QYXN0ZUVkaXQoXG5cdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRjb250ZXh0OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10sXG5cdGhhbmRsZWRNaW1lVHlwZTogc3RyaW5nLFxuXHRraW5kOiBIaWVyYXJjaGljYWxLaW5kLFxuXHR0aXRsZTogc3RyaW5nLFxuXHRwYXN0ZVRhcmdldFNlcnZpY2U6IElDaGF0UGFzdGVUYXJnZXRTZXJ2aWNlLFxuXHRvcHRpb25zPzoge1xuXHRcdHJlYWRvbmx5IGlubGluZVJlZmVyZW5jZT86IHsgcmVhZG9ubHkgdGV4dDogc3RyaW5nOyByZWFkb25seSByYW5nZTogSVJhbmdlIH07XG5cdFx0cmVhZG9ubHkgYW5ub3VuY2VtZW50Pzogc3RyaW5nO1xuXHR9LFxuKTogRG9jdW1lbnRQYXN0ZUVkaXQge1xuXG5cdGNvbnN0IGxhYmVsID0gY29udGV4dC5sZW5ndGggPT09IDFcblx0XHQ/IGNvbnRleHRbMF0ubmFtZVxuXHRcdDogbG9jYWxpemUoJ3Bhc3RlZEF0dGFjaG1lbnQubXVsdGlwbGUnLCAnezB9IGFuZCB7MX0gbW9yZScsIGNvbnRleHRbMF0ubmFtZSwgY29udGV4dC5sZW5ndGggLSAxKTtcblx0Y29uc3QgYW5ub3VuY2VJbWFnZUF0dGFjaG1lbnQgPSBjb250ZXh0Lmxlbmd0aCA9PT0gMSAmJiBpc0ltYWdlVmFyaWFibGVFbnRyeShjb250ZXh0WzBdKTtcblx0Y29uc3QgaW5saW5lUmVmZXJlbmNlID0gY29udGV4dC5sZW5ndGggPT09IDEgPyBvcHRpb25zPy5pbmxpbmVSZWZlcmVuY2UgOiB1bmRlZmluZWQ7XG5cblx0Y29uc3QgcmVzb2x2ZVRhcmdldCA9IChvcGVyYXRpb246IHN0cmluZyk6IElDaGF0UGFzdGVUYXJnZXQgPT4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IHBhc3RlVGFyZ2V0U2VydmljZS5nZXRUYXJnZXQobW9kZWwudXJpKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBjaGF0IHBhc3RlIHRhcmdldCBmb3VuZCBmb3IgJHtvcGVyYXRpb259YCk7XG5cdFx0fVxuXHRcdHJldHVybiB0YXJnZXQ7XG5cdH07XG5cblx0Y29uc3QgY3VzdG9tRWRpdCA9IHtcblx0XHRyZXNvdXJjZTogbW9kZWwudXJpLFxuXHRcdHZhcmlhYmxlOiBjb250ZXh0LFxuXHRcdHVuZG86ICgpID0+IHtcblx0XHRcdHJlc29sdmVUYXJnZXQoJ3VuZG8nKS5yZW1vdmVBdHRhY2htZW50cyhjb250ZXh0Lm1hcChjID0+IGMuaWQpKTtcblx0XHR9LFxuXHRcdHJlZG86ICgpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IHJlc29sdmVUYXJnZXQoJ3JlZG8nKTtcblx0XHRcdGlmIChpbmxpbmVSZWZlcmVuY2UpIHtcblx0XHRcdFx0dGFyZ2V0LmFkZElubGluZUF0dGFjaG1lbnQoY29udGV4dFswXSwgaW5saW5lUmVmZXJlbmNlLnRleHQsIGlubGluZVJlZmVyZW5jZS5yYW5nZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0YXJnZXQuYWRkQXR0YWNobWVudHMoY29udGV4dCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3B0aW9ucz8uYW5ub3VuY2VtZW50KSB7XG5cdFx0XHRcdGFsZXJ0KG9wdGlvbnMuYW5ub3VuY2VtZW50KTtcblx0XHRcdH0gZWxzZSBpZiAoYW5ub3VuY2VJbWFnZUF0dGFjaG1lbnQpIHtcblx0XHRcdFx0YWxlcnQobG9jYWxpemUoJ2NoYXQucGFzdGVkSW1hZ2VBdHRhY2hlZCcsICdBdHRhY2hlZCBpbWFnZScpKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRuZWVkc0NvbmZpcm1hdGlvbjogZmFsc2UsXG5cdFx0XHRsYWJlbFxuXHRcdH1cblx0fTtcblxuXHRyZXR1cm4ge1xuXHRcdGluc2VydFRleHQ6IG9wdGlvbnM/LmlubGluZVJlZmVyZW5jZSA/IGAke29wdGlvbnMuaW5saW5lUmVmZXJlbmNlLnRleHR9IGAgOiAnJyxcblx0XHR0aXRsZSxcblx0XHRraW5kLFxuXHRcdGhhbmRsZWRNaW1lVHlwZSxcblx0XHRhZGRpdGlvbmFsRWRpdDoge1xuXHRcdFx0ZWRpdHM6IFtjdXN0b21FZGl0XSxcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVkaXRTZXNzaW9uKGVkaXQ6IERvY3VtZW50UGFzdGVFZGl0KTogRG9jdW1lbnRQYXN0ZUVkaXRzU2Vzc2lvbiB7XG5cdHJldHVybiB7XG5cdFx0ZWRpdHM6IFtlZGl0XSxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdH07XG59XG5cbmNvbnN0IGlkZW50aWZpZXJQYXR0ZXJuID0gL15bYS16QS1aXyRdW2EtekEtWjAtOV8kXSokLztcbmNvbnN0IHN5bWJvbENhY2hlTWF4U2l6ZSA9IDM7XG50eXBlIFN5bWJvbFJlZmVyZW5jZUNhY2hlRW50cnkgPSB7XG5cdGtleTogc3RyaW5nO1xuXHRwcm9taXNlPzogUHJvbWlzZTxSZXNvbHZlZFN5bWJvbFJlZmVyZW5jZSB8IHVuZGVmaW5lZD47XG59O1xuXG5jb25zdCBzeW1ib2xSZWZlcmVuY2VDYWNoZTogU3ltYm9sUmVmZXJlbmNlQ2FjaGVFbnRyeVtdID0gW107XG5cbmZ1bmN0aW9uIGdldFN5bWJvbFJlZmVyZW5jZUNhY2hlS2V5KHVyaTogVVJJLCByYW5nZTogSVJhbmdlLCB0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7dXJpLnRvU3RyaW5nKCl9fCR7cmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfToke3JhbmdlLnN0YXJ0Q29sdW1ufS0ke3JhbmdlLmVuZExpbmVOdW1iZXJ9OiR7cmFuZ2UuZW5kQ29sdW1ufXwke3RleHR9YDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0Q2FjaGVkU3ltYm9sUmVmZXJlbmNlKHVyaTogVVJJLCByYW5nZTogSVJhbmdlLCB0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPFJlc29sdmVkU3ltYm9sUmVmZXJlbmNlIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGtleSA9IGdldFN5bWJvbFJlZmVyZW5jZUNhY2hlS2V5KHVyaSwgcmFuZ2UsIHRleHQpO1xuXHRyZXR1cm4gc3ltYm9sUmVmZXJlbmNlQ2FjaGUuZmluZChlID0+IGUua2V5ID09PSBrZXkpPy5wcm9taXNlO1xufVxuXG5mdW5jdGlvbiBjYWNoZVN5bWJvbFJlZmVyZW5jZSh1cmk6IFVSSSwgcmFuZ2U6IElSYW5nZSwgdGV4dDogc3RyaW5nLCB2YWx1ZVByb21pc2U6IFByb21pc2U8UmVzb2x2ZWRTeW1ib2xSZWZlcmVuY2UgfCB1bmRlZmluZWQ+KTogdm9pZCB7XG5cdGNvbnN0IGVudHJ5OiBTeW1ib2xSZWZlcmVuY2VDYWNoZUVudHJ5ID0ge1xuXHRcdGtleTogZ2V0U3ltYm9sUmVmZXJlbmNlQ2FjaGVLZXkodXJpLCByYW5nZSwgdGV4dCksXG5cdFx0cHJvbWlzZTogdmFsdWVQcm9taXNlLFxuXHR9O1xuXHRzeW1ib2xSZWZlcmVuY2VDYWNoZS51bnNoaWZ0KGVudHJ5KTtcblx0d2hpbGUgKHN5bWJvbFJlZmVyZW5jZUNhY2hlLmxlbmd0aCA+IHN5bWJvbENhY2hlTWF4U2l6ZSkge1xuXHRcdHN5bWJvbFJlZmVyZW5jZUNhY2hlLnBvcCgpO1xuXHR9XG5cblx0dmFsdWVQcm9taXNlLmNhdGNoKCgpID0+IHtcblx0XHRjb25zdCBpID0gc3ltYm9sUmVmZXJlbmNlQ2FjaGUuaW5kZXhPZihlbnRyeSk7XG5cdFx0aWYgKGkgIT09IC0xKSB7XG5cdFx0XHRzeW1ib2xSZWZlcmVuY2VDYWNoZS5zcGxpY2UoaSwgMSk7XG5cdFx0fVxuXHR9KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVN5bWJvbFJlZmVyZW5jZShcblx0bW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRvdXRsaW5lTW9kZWxTZXJ2aWNlOiBJT3V0bGluZU1vZGVsU2VydmljZSxcblx0c291cmNlVXJpOiBVUkksXG5cdHNvdXJjZVJhbmdlOiBJUmFuZ2UsXG5cdHBhc3RlZFRleHQ6IHN0cmluZyxcblx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuKTogUHJvbWlzZTxSZXNvbHZlZFN5bWJvbFJlZmVyZW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBzb3VyY2VNb2RlbCA9IG1vZGVsU2VydmljZS5nZXRNb2RlbChzb3VyY2VVcmkpO1xuXHRpZiAoIXNvdXJjZU1vZGVsKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3Qgc291cmNlUG9zaXRpb24gPSBuZXcgUG9zaXRpb24oc291cmNlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzb3VyY2VSYW5nZS5zdGFydENvbHVtbik7XG5cdGNvbnN0IGRlZmluaXRpb25zID0gYXdhaXQgZ2V0RGVmaW5pdGlvbnNBdFBvc2l0aW9uKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRlZmluaXRpb25Qcm92aWRlciwgc291cmNlTW9kZWwsIHNvdXJjZVBvc2l0aW9uLCBmYWxzZSwgdG9rZW4pO1xuXHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgIWRlZmluaXRpb25zLmxlbmd0aCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGRlZiA9IGRlZmluaXRpb25zWzBdO1xuXHRjb25zdCBkZWZSYW5nZSA9IGRlZi50YXJnZXRTZWxlY3Rpb25SYW5nZSA/PyBkZWYucmFuZ2U7XG5cdGNvbnN0IGRlZkxvY2F0aW9uID0geyB1cmk6IGRlZi51cmksIHJhbmdlOiBkZWZSYW5nZSB9O1xuXG5cdGxldCBpY29uID0gQ29kaWNvbi5zeW1ib2xQcm9wZXJ0eTtcblx0Y29uc3QgZGVmTW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwoZGVmLnVyaSk7XG5cdGlmIChkZWZNb2RlbCkge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBvdXRsaW5lID0gYXdhaXQgb3V0bGluZU1vZGVsU2VydmljZS5nZXRPckNyZWF0ZShkZWZNb2RlbCwgdG9rZW4pO1xuXHRcdFx0aWYgKCF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gb3V0bGluZS5nZXRJdGVtRW5jbG9zaW5nUG9zaXRpb24oeyBsaW5lTnVtYmVyOiBkZWZSYW5nZS5zdGFydExpbmVOdW1iZXIsIGNvbHVtbjogZGVmUmFuZ2Uuc3RhcnRDb2x1bW4gfSk7XG5cdFx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdFx0aWNvbiA9IFN5bWJvbEtpbmRzLnRvSWNvbihlbGVtZW50LnN5bWJvbC5raW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gVXNlIGRlZmF1bHQgaWNvbi5cblx0XHR9XG5cdH1cblxuXHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGlkOiBgdnNjb2RlLnN5bWJvbC8ke0pTT04uc3RyaW5naWZ5KGRlZkxvY2F0aW9uKX1gLFxuXHRcdGZ1bGxOYW1lOiBwYXN0ZWRUZXh0LFxuXHRcdGRhdGE6IGRlZkxvY2F0aW9uLFxuXHRcdGljb25cblx0fTtcbn1cblxuY2xhc3MgUGFzdGVTeW1ib2xQcm92aWRlciBpbXBsZW1lbnRzIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIge1xuXG5cdHB1YmxpYyByZWFkb25seSBraW5kID0gbmV3IEhpZXJhcmNoaWNhbEtpbmQoJ2NoYXQuYXR0YWNoLnN5bWJvbCcpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IFt0aGlzLmtpbmRdO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb3B5TWltZVR5cGVzID0gW107XG5cdHB1YmxpYyByZWFkb25seSBwYXN0ZU1pbWVUeXBlcyA9IFtDT1BZX01JTUVfVFlQRVNdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFBhc3RlVGFyZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhc3RlVGFyZ2V0U2VydmljZTogSUNoYXRQYXN0ZVRhcmdldFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElPdXRsaW5lTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3V0bGluZU1vZGVsU2VydmljZTogSU91dGxpbmVNb2RlbFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJvdmlkZURvY3VtZW50UGFzdGVFZGl0cyhtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2VzOiByZWFkb25seSBJUmFuZ2VbXSwgZGF0YVRyYW5zZmVyOiBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgX2NvbnRleHQ6IERvY3VtZW50UGFzdGVDb250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERvY3VtZW50UGFzdGVFZGl0c1Nlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIWlzQ2hhdElucHV0TW9kZWwobW9kZWwudXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHQgPSBkYXRhVHJhbnNmZXIuZ2V0KE1pbWVzLnRleHQpO1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxFZGl0b3JEYXRhID0gZGF0YVRyYW5zZmVyLmdldChDT1BZX01JTUVfVFlQRVMpO1xuXHRcdGlmICghdGV4dCB8fCAhYWRkaXRpb25hbEVkaXRvckRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXN0ZWRUZXh0ID0gYXdhaXQgdGV4dC5hc1N0cmluZygpO1xuXHRcdGlmICghaWRlbnRpZmllclBhdHRlcm4udGVzdChwYXN0ZWRUZXh0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBhZGRpdGlvbmFsRGF0YTogU2VyaWFsaXplZENvcHlEYXRhO1xuXHRcdHRyeSB7XG5cdFx0XHRhZGRpdGlvbmFsRGF0YSA9IEpTT04ucGFyc2UoYXdhaXQgYWRkaXRpb25hbEVkaXRvckRhdGEuYXNTdHJpbmcoKSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc291cmNlVXJpID0gVVJJLnJldml2ZShhZGRpdGlvbmFsRGF0YS51cmkpO1xuXHRcdGNvbnN0IHNvdXJjZVJhbmdlID0gYWRkaXRpb25hbERhdGEucmFuZ2U7XG5cblx0XHRpZiAoIXRoaXMucGFzdGVUYXJnZXRTZXJ2aWNlLmdldFRhcmdldChtb2RlbC51cmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGVkID0gYXdhaXQgZ2V0Q2FjaGVkU3ltYm9sUmVmZXJlbmNlKHNvdXJjZVVyaSwgc291cmNlUmFuZ2UsIHBhc3RlZFRleHQpO1xuXHRcdGxldCByZXNvbHZlZCA9IGNhY2hlZDtcblx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHRyZXNvbHZlZCA9IGF3YWl0IHJlc29sdmVTeW1ib2xSZWZlcmVuY2UoXG5cdFx0XHRcdHRoaXMubW9kZWxTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLm91dGxpbmVNb2RlbFNlcnZpY2UsXG5cdFx0XHRcdHNvdXJjZVVyaSxcblx0XHRcdFx0c291cmNlUmFuZ2UsXG5cdFx0XHRcdHBhc3RlZFRleHQsXG5cdFx0XHRcdHRva2VuLFxuXHRcdFx0KTtcblx0XHR9XG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN5bVRleHQgPSBgJHtjaGF0VmFyaWFibGVMZWFkZXJ9c3ltOiR7cGFzdGVkVGV4dH1gO1xuXHRcdGNvbnN0IHBhc3RlUmFuZ2UgPSByYW5nZXNbMF07XG5cdFx0Y29uc3QgaW5zZXJ0VGV4dCA9IGAke3N5bVRleHR9IGA7XG5cblx0XHRjb25zdCByZWZSYW5nZSA9IHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogcGFzdGVSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRzdGFydENvbHVtbjogcGFzdGVSYW5nZS5zdGFydENvbHVtbixcblx0XHRcdGVuZExpbmVOdW1iZXI6IHBhc3RlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0ZW5kQ29sdW1uOiBwYXN0ZVJhbmdlLnN0YXJ0Q29sdW1uICsgc3ltVGV4dC5sZW5ndGhcblx0XHR9O1xuXG5cdFx0Y29uc3QgZHluYW1pY1JlZiA9IHtcblx0XHRcdGlkOiByZXNvbHZlZC5pZCxcblx0XHRcdGZ1bGxOYW1lOiByZXNvbHZlZC5mdWxsTmFtZSxcblx0XHRcdHJhbmdlOiByZWZSYW5nZSxcblx0XHRcdGRhdGE6IHJlc29sdmVkLmRhdGEsXG5cdFx0XHRpY29uOiByZXNvbHZlZC5pY29uXG5cdFx0fTtcblxuXHRcdGNvbnN0IGVkaXQ6IERvY3VtZW50UGFzdGVFZGl0ID0ge1xuXHRcdFx0aW5zZXJ0VGV4dCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncGFzdGVkU3ltYm9sUmVmZXJlbmNlJywgJ1Bhc3RlZCBTeW1ib2wgUmVmZXJlbmNlJyksXG5cdFx0XHRraW5kOiB0aGlzLmtpbmQsXG5cdFx0XHRoYW5kbGVkTWltZVR5cGU6IENPUFlfTUlNRV9UWVBFUyxcblx0XHRcdGFkZGl0aW9uYWxFZGl0OiB7XG5cdFx0XHRcdGVkaXRzOiBbe1xuXHRcdFx0XHRcdHJlc291cmNlOiBtb2RlbC51cmksXG5cdFx0XHRcdFx0cmVkbzogKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5wYXN0ZVRhcmdldFNlcnZpY2UuZ2V0VGFyZ2V0KG1vZGVsLnVyaSk/LmFkZElubGluZVJlZmVyZW5jZShkeW5hbWljUmVmKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHVuZG86ICgpID0+IHtcblx0XHRcdFx0XHRcdC8vIFRoZSB0ZXh0IHJlbW92YWwgYnkgdW5kbyBpcyBzdWZmaWNpZW50OyB0aGUgZHluYW1pYyB2YXJpYWJsZVxuXHRcdFx0XHRcdFx0Ly8gbW9kZWwgYXV0by1jbGVhbnMgd2hlbiB0aGUgZGVjb3JhdGlvbiB0ZXh0IGNoYW5nZXMuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRlZGl0LnlpZWxkVG8gPSBbeyBraW5kOiBuZXcgSGllcmFyY2hpY2FsS2luZCgnY2hhdC5hdHRhY2gudGV4dCcpIH1dO1xuXHRcdHJldHVybiBjcmVhdGVFZGl0U2Vzc2lvbihlZGl0KTtcblx0fVxufVxuXG5jbGFzcyBQYXN0ZUh0bWxQcm92aWRlciBpbXBsZW1lbnRzIERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIge1xuXG5cdHB1YmxpYyByZWFkb25seSBraW5kID0gbmV3IEhpZXJhcmNoaWNhbEtpbmQoJ2NoYXQucGFzdGUuaHRtbCcpO1xuXHRwdWJsaWMgcmVhZG9ubHkgcHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA9IFt0aGlzLmtpbmRdO1xuXG5cdHB1YmxpYyByZWFkb25seSBjb3B5TWltZVR5cGVzID0gW107XG5cdHB1YmxpYyByZWFkb25seSBwYXN0ZU1pbWVUeXBlcyA9IFtNaW1lcy5odG1sXTtcblxuXHRhc3luYyBwcm92aWRlRG9jdW1lbnRQYXN0ZUVkaXRzKG1vZGVsOiBJVGV4dE1vZGVsLCBfcmFuZ2VzOiByZWFkb25seSBJUmFuZ2VbXSwgZGF0YVRyYW5zZmVyOiBJUmVhZG9ubHlWU0RhdGFUcmFuc2ZlciwgY29udGV4dDogRG9jdW1lbnRQYXN0ZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RG9jdW1lbnRQYXN0ZUVkaXRzU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghaXNDaGF0SW5wdXRNb2RlbChtb2RlbC51cmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBhY3RpdmF0ZSBvbiBhdXRvbWF0aWMgcGFzdGUgXHUyMDE0IGZvciBleHBsaWNpdCBcIlBhc3RlIEFzXCIgdGhlIHVzZXJcblx0XHQvLyBsaWtlbHkgd2FudHMgdGhlIHJhdyB0ZXh0IG9yIGFuIGF0dGFjaG1lbnQsIG5vdCBhIGNvbnZlcnRlZCBtYXJrZG93biBmb3JtLlxuXHRcdGlmIChjb250ZXh0LnRyaWdnZXJLaW5kICE9PSBEb2N1bWVudFBhc3RlVHJpZ2dlcktpbmQuQXV0b21hdGljKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cnkgPSBkYXRhVHJhbnNmZXIuZ2V0KE1pbWVzLmh0bWwpO1xuXHRcdGNvbnN0IGh0bWxUZXh0ID0gYXdhaXQgZW50cnk/LmFzU3RyaW5nKCk7XG5cdFx0aWYgKCFodG1sVGV4dCB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgaWYgdGhlIEhUTUwgaXMgdHJpdmlhbGx5IHBsYWluIHRleHQgKG5vIG1lYW5pbmdmdWwgdGFncylcblx0XHRpZiAoIWlzTWVhbmluZ2Z1bEh0bWwoaHRtbFRleHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFya2Rvd24gPSBjb252ZXJ0SHRtbFRvTWFya2Rvd24oaHRtbFRleHQpO1xuXG5cdFx0Ly8gSWYgY29udmVyc2lvbiBwcm9kdWNlZCBub3RoaW5nIHVzZWZ1bCwgZmFsbCBiYWNrXG5cdFx0aWYgKCFtYXJrZG93bikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiBjcmVhdGVFZGl0U2Vzc2lvbih7XG5cdFx0XHRpbnNlcnRUZXh0OiBtYXJrZG93bixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncGFzdGVIdG1sQXNNYXJrZG93bicsICdQYXN0ZSBhcyBNYXJrZG93bicpLFxuXHRcdFx0a2luZDogdGhpcy5raW5kLFxuXHRcdFx0aGFuZGxlZE1pbWVUeXBlOiBNaW1lcy5odG1sLFxuXHRcdFx0eWllbGRUbzogW1xuXHRcdFx0XHR7IGtpbmQ6IG5ldyBIaWVyYXJjaGljYWxLaW5kKCdjaGF0LmF0dGFjaC50ZXh0JykgfSxcblx0XHRcdFx0eyBraW5kOiBuZXcgSGllcmFyY2hpY2FsS2luZCgnY2hhdC5hdHRhY2guaW1hZ2UnKSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fVxufVxuXG4vKiogVGhlIE1hcmtkb3duIGZvcm0gb2YgcGFzdGVkIEhUTUwsIHdoZW4gdGhlIEhUTUwgY2FycmllcyByZWFsIGZvcm1hdHRpbmcuICovXG5hc3luYyBmdW5jdGlvbiBnZXRNZWFuaW5nZnVsTWFya2Rvd24oZGF0YVRyYW5zZmVyOiBJUmVhZG9ubHlWU0RhdGFUcmFuc2Zlcik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGh0bWxUZXh0ID0gYXdhaXQgZGF0YVRyYW5zZmVyLmdldChNaW1lcy5odG1sKT8uYXNTdHJpbmcoKTtcblx0aWYgKCFodG1sVGV4dCB8fCAhaXNNZWFuaW5nZnVsSHRtbChodG1sVGV4dCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBjb252ZXJ0SHRtbFRvTWFya2Rvd24oaHRtbFRleHQpIHx8IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNNZWFuaW5nZnVsSHRtbCh2YWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvPChhfHN0cm9uZ3xifGVtfGl8aFsxLTZdfGNvZGV8cHJlfHVsfG9sfGxpfGJsb2NrcXVvdGV8ZGVsfHN8c3RyaWtlfGltZ3xocilcXGIvaS50ZXN0KHZhbHVlKTtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRQYXN0ZVByb3ZpZGVyc0ZlYXR1cmUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElDaGF0UGFzdGVUYXJnZXRTZXJ2aWNlIHBhc3RlVGFyZ2V0U2VydmljZTogSUNoYXRQYXN0ZVRhcmdldFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBjaGF0SW5wdXRQcm92aWRlcnM6IERvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXJbXSA9IFtcblx0XHRcdGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3B5QXR0YWNobWVudHNQcm92aWRlciksXG5cdFx0XHRuZXcgUGFzdGVJbWFnZVByb3ZpZGVyKHBhc3RlVGFyZ2V0U2VydmljZSwgZXh0ZW5zaW9uU2VydmljZSwgZmlsZVNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgbG9nU2VydmljZSksXG5cdFx0XHRuZXcgUGFzdGVUZXh0UHJvdmlkZXIocGFzdGVUYXJnZXRTZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGxvZ1NlcnZpY2UpLFxuXHRcdFx0bmV3IFBhc3RlSHRtbFByb3ZpZGVyKCksXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IHNjaGVtZSBvZiBjaGF0SW5wdXRTY2hlbWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGNoYXRJbnB1dFByb3ZpZGVycykge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFBhc3RlRWRpdFByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lLCBwYXR0ZXJuOiAnKicsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHByb3ZpZGVyKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFN5bWJvbCBwYXN0ZSBpbnNlcnRzIGEgYCNzeW06YCB0b2tlbiB0aGF0IGlzIG9ubHkgbWVhbmluZ2Z1bCBhbG9uZ3NpZGUgYVxuXHRcdC8vIHN0YW5kYWxvbmUgaW5saW5lIHJlZmVyZW5jZSwgd2hpY2ggdGhlIHdpZGdldC1iYWNrZWQgaW5wdXRzIHByb3ZpZGUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIHBhdHRlcm46ICcqJywgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwgaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBhc3RlU3ltYm9sUHJvdmlkZXIpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlci5yZWdpc3RlcignKicsIGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3B5VGV4dFByb3ZpZGVyKSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLFNBQVMsYUFBYTtBQUV0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyw4QkFBMEUsc0JBQXNCO0FBQ3pHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsY0FBYztBQUN2QixT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O0FBQUEsTUFDWixPQUFPLFNBQVMsdUJBQXVCLG1CQUFtQjtBQUFBLE1BQzFELE1BQU0sS0FBSztBQUFBLE1BQ1gsaUJBQWlCLE1BQU07QUFBQSxNQUN2QixTQUFTO0FBQUEsUUFDUixFQUFFLE1BQU0sSUFBSSxpQkFBaUIsa0JBQWtCLEVBQUU7QUFBQSxRQUNqRCxFQUFFLE1BQU0sSUFBSSxpQkFBaUIsbUJBQW1CLEVBQUU7QUFBQSxNQUNuRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQUdBLGVBQWUsc0JBQXNCLGNBQW9FO0FBQ3hHLFFBQU0sV0FBVyxNQUFNLGFBQWEsSUFBSSxNQUFNLElBQUksR0FBRyxTQUFTO0FBQzlELE1BQUksQ0FBQyxZQUFZLENBQUMsaUJBQWlCLFFBQVEsR0FBRztBQUM3QyxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sc0JBQXNCLFFBQVEsS0FBSztBQUMzQztBQUVBLFNBQVMsaUJBQWlCLE9BQXdCO0FBQ2pELFNBQU8sZ0ZBQWdGLEtBQUssS0FBSztBQUNsRztBQUVPLElBQU0sNEJBQU4sY0FBd0MsV0FBVztBQUFBLEVBQ3pELFlBQ3dCLGNBQ0cseUJBQ0Qsb0JBQ04sa0JBQ0wsYUFDQyxjQUNNLG9CQUNSLFlBQ1o7QUFDRCxVQUFNO0FBQ04sVUFBTSxxQkFBa0Q7QUFBQSxNQUN2RCxhQUFhLGVBQWUsdUJBQXVCO0FBQUEsTUFDbkQsSUFBSSxtQkFBbUIsb0JBQW9CLGtCQUFrQixhQUFhLG9CQUFvQixVQUFVO0FBQUEsTUFDeEcsSUFBSSxrQkFBa0Isb0JBQW9CLGNBQWMsVUFBVTtBQUFBLE1BQ2xFLElBQUksa0JBQWtCO0FBQUEsSUFDdkI7QUFDQSxlQUFXLFVBQVUsa0JBQWtCO0FBQ3RDLGlCQUFXLFlBQVksb0JBQW9CO0FBQzFDLGFBQUssVUFBVSx3QkFBd0IsMEJBQTBCLFNBQVMsRUFBRSxRQUFRLFNBQVMsS0FBSyxzQkFBc0IsS0FBSyxHQUFHLFFBQVEsQ0FBQztBQUFBLE1BQzFJO0FBQUEsSUFDRDtBQUdBLFNBQUssVUFBVSx3QkFBd0IsMEJBQTBCLFNBQVMsRUFBRSxRQUFRLFFBQVEsaUJBQWlCLFNBQVMsS0FBSyxzQkFBc0IsS0FBSyxHQUFHLGFBQWEsZUFBZSxtQkFBbUIsQ0FBQyxDQUFDO0FBQzFNLFNBQUssVUFBVSx3QkFBd0IsMEJBQTBCLFNBQVMsS0FBSyxhQUFhLGVBQWUsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLEVBQzlIO0FBQ0Q7QUE1QmEsNEJBQU47QUFBQSxFQUVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVFU7IiwKICAibmFtZXMiOiBbImVkaXQiLCAiYXR0YWNobWVudCJdCn0K
