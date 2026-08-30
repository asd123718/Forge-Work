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
import { localize } from "../../../../nls.js";
import { toBufferOrReadable, TextFileOperationError, TextFileOperationResult, stringToSnapshot, TextFileEditorModelState } from "../common/textfiles.js";
import { SaveSourceRegistry } from "../../../common/editor.js";
import { ILifecycleService } from "../../lifecycle/common/lifecycle.js";
import { IFileService, FileOperationResult } from "../../../../platform/files/common/files.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { extname as pathExtname } from "../../../../base/common/path.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IUntitledTextEditorService } from "../../untitled/common/untitledTextEditorService.js";
import { UntitledTextEditorModel } from "../../untitled/common/untitledTextEditorModel.js";
import { TextFileEditorModelManager } from "../common/textFileEditorModelManager.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Schemas } from "../../../../base/common/network.js";
import { createTextBufferFactoryFromSnapshot, createTextBufferFactoryFromStream } from "../../../../editor/common/model/textModel.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { joinPath, dirname, basename, toLocalResource, extname, isEqual } from "../../../../base/common/resources.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { bufferToStream } from "../../../../base/common/buffer.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
import { BaseTextEditorModel } from "../../../common/editor/textEditorModel.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { IPathService } from "../../path/common/pathService.js";
import { IWorkingCopyFileService } from "../../workingCopy/common/workingCopyFileService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService, WORKSPACE_EXTENSION } from "../../../../platform/workspace/common/workspace.js";
import { UTF8, UTF8_with_bom, UTF16be, UTF16le, encodingExists, toEncodeReadable, toDecodeStream, DecodeStreamErrorKind } from "../common/encoding.js";
import { consumeStream } from "../../../../base/common/stream.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IElevatedFileService } from "../../files/common/elevatedFileService.js";
import { IDecorationsService } from "../../decorations/common/decorations.js";
import { Emitter } from "../../../../base/common/event.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { listErrorForeground } from "../../../../platform/theme/common/colorRegistry.js";
let AbstractTextFileService = class extends Disposable {
  constructor(fileService, untitledTextEditorService, lifecycleService, instantiationService, modelService, environmentService, dialogService, fileDialogService, textResourceConfigurationService, filesConfigurationService, codeEditorService, pathService, workingCopyFileService, uriIdentityService, languageService, logService, elevatedFileService, decorationsService) {
    super();
    this.fileService = fileService;
    this.lifecycleService = lifecycleService;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.environmentService = environmentService;
    this.dialogService = dialogService;
    this.fileDialogService = fileDialogService;
    this.textResourceConfigurationService = textResourceConfigurationService;
    this.filesConfigurationService = filesConfigurationService;
    this.codeEditorService = codeEditorService;
    this.pathService = pathService;
    this.workingCopyFileService = workingCopyFileService;
    this.uriIdentityService = uriIdentityService;
    this.languageService = languageService;
    this.logService = logService;
    this.elevatedFileService = elevatedFileService;
    this.decorationsService = decorationsService;
    this.files = this._register(this.instantiationService.createInstance(TextFileEditorModelManager));
    this.untitled = untitledTextEditorService;
    this.provideDecorations();
  }
  //#region decorations
  provideDecorations() {
    const provider = this._register(new class extends Disposable {
      constructor(files) {
        super();
        this.files = files;
        this.label = localize("textFileModelDecorations", "Text File Model Decorations");
        this._onDidChange = this._register(new Emitter());
        this.onDidChange = this._onDidChange.event;
        this.registerListeners();
      }
      registerListeners() {
        this._register(this.files.onDidResolve(({ model }) => {
          if (model.isReadonly() || model.hasState(TextFileEditorModelState.ORPHAN)) {
            this._onDidChange.fire([model.resource]);
          }
        }));
        this._register(this.files.onDidRemove((modelUri) => this._onDidChange.fire([modelUri])));
        this._register(this.files.onDidChangeReadonly((model) => this._onDidChange.fire([model.resource])));
        this._register(this.files.onDidChangeOrphaned((model) => this._onDidChange.fire([model.resource])));
      }
      provideDecorations(uri) {
        const model = this.files.get(uri);
        if (!model || model.isDisposed()) {
          return void 0;
        }
        const isReadonly = model.isReadonly();
        const isOrphaned = model.hasState(TextFileEditorModelState.ORPHAN);
        if (isReadonly && isOrphaned) {
          return {
            color: listErrorForeground,
            letter: Codicon.lockSmall,
            strikethrough: true,
            tooltip: localize("readonlyAndDeleted", "Deleted, Read-only")
          };
        } else if (isReadonly) {
          return {
            letter: Codicon.lockSmall,
            tooltip: localize("readonly", "Read-only")
          };
        } else if (isOrphaned) {
          return {
            color: listErrorForeground,
            strikethrough: true,
            tooltip: localize("deleted", "Deleted")
          };
        }
        return void 0;
      }
    }(this.files));
    this._register(this.decorationsService.registerDecorationsProvider(provider));
  }
  get encoding() {
    if (!this._encoding) {
      this._encoding = this._register(this.instantiationService.createInstance(EncodingOracle));
    }
    return this._encoding;
  }
  async read(resource, options) {
    const [bufferStream, decoder] = await this.doRead(resource, {
      ...options,
      // optimization: since we know that the caller does not
      // care about buffering, we indicate this to the reader.
      // this reduces all the overhead the buffered reading
      // has (open, read, close) if the provider supports
      // unbuffered reading.
      preferUnbuffered: true
    });
    return {
      ...bufferStream,
      encoding: decoder.detected.encoding || UTF8,
      value: await consumeStream(decoder.stream, (strings) => strings.join(""))
    };
  }
  async readStream(resource, options) {
    const [bufferStream, decoder] = await this.doRead(resource, options);
    return {
      ...bufferStream,
      encoding: decoder.detected.encoding || UTF8,
      value: await createTextBufferFactoryFromStream(decoder.stream)
    };
  }
  async doRead(resource, options) {
    const cts = new CancellationTokenSource();
    let bufferStream;
    if (options?.preferUnbuffered) {
      const content = await this.fileService.readFile(resource, options, cts.token);
      bufferStream = {
        ...content,
        value: bufferToStream(content.value)
      };
    } else {
      bufferStream = await this.fileService.readFileStream(resource, options, cts.token);
    }
    try {
      const decoder = await this.doGetDecodedStream(resource, bufferStream.value, options);
      return [bufferStream, decoder];
    } catch (error) {
      cts.dispose(true);
      if (error.decodeStreamErrorKind === DecodeStreamErrorKind.STREAM_IS_BINARY) {
        throw new TextFileOperationError(localize("fileBinaryError", "File seems to be binary and cannot be opened as text"), TextFileOperationResult.FILE_IS_BINARY, options);
      } else {
        throw error;
      }
    }
  }
  async create(operations, undoInfo) {
    const operationsWithContents = await Promise.all(operations.map(async (operation) => {
      const contents = await this.getEncodedReadable(operation.resource, operation.value);
      return {
        resource: operation.resource,
        contents,
        overwrite: operation.options?.overwrite
      };
    }));
    return this.workingCopyFileService.create(operationsWithContents, CancellationToken.None, undoInfo);
  }
  async write(resource, value, options) {
    const readable = await this.getEncodedReadable(resource, value, options);
    if (options?.writeElevated && this.elevatedFileService.isSupported(resource)) {
      return this.elevatedFileService.writeFileElevated(resource, readable, options);
    }
    return this.fileService.writeFile(resource, readable, options);
  }
  async getEncodedReadable(resource, value, options) {
    const { encoding, addBOM } = await this.encoding.getWriteEncoding(resource, options);
    if (encoding === UTF8 && !addBOM) {
      return typeof value === "undefined" ? void 0 : toBufferOrReadable(value);
    }
    value = value || "";
    const snapshot = typeof value === "string" ? stringToSnapshot(value) : value;
    return toEncodeReadable(snapshot, encoding, { addBOM });
  }
  async getDecodedStream(resource, value, options) {
    return (await this.doGetDecodedStream(resource, value, options)).stream;
  }
  doGetDecodedStream(resource, stream, options) {
    return toDecodeStream(stream, {
      acceptTextOnly: options?.acceptTextOnly ?? false,
      guessEncoding: options?.autoGuessEncoding || this.textResourceConfigurationService.getValue(resource, "files.autoGuessEncoding"),
      candidateGuessEncodings: options?.candidateGuessEncodings || this.textResourceConfigurationService.getValue(resource, "files.candidateGuessEncodings"),
      overwriteEncoding: async (detectedEncoding) => this.validateDetectedEncoding(resource, detectedEncoding ?? void 0, options)
    });
  }
  getEncoding(resource) {
    const model = resource.scheme === Schemas.untitled ? this.untitled.get(resource) : this.files.get(resource);
    return model?.getEncoding() ?? this.encoding.getUnvalidatedEncodingForResource(resource);
  }
  async resolveDecoding(resource, options) {
    return {
      preferredEncoding: (await this.encoding.getPreferredReadEncoding(resource, options, void 0)).encoding,
      guessEncoding: options?.autoGuessEncoding || this.textResourceConfigurationService.getValue(resource, "files.autoGuessEncoding"),
      candidateGuessEncodings: options?.candidateGuessEncodings || this.textResourceConfigurationService.getValue(resource, "files.candidateGuessEncodings")
    };
  }
  async validateDetectedEncoding(resource, detectedEncoding, options) {
    const { encoding } = await this.encoding.getPreferredReadEncoding(resource, options, detectedEncoding);
    return encoding;
  }
  resolveEncoding(resource, options) {
    return this.encoding.getWriteEncoding(resource, options);
  }
  //#endregion
  //#region save
  async save(resource, options) {
    if (resource.scheme === Schemas.untitled) {
      const model = this.untitled.get(resource);
      if (model) {
        let targetUri;
        if (model.hasAssociatedFilePath) {
          targetUri = await this.suggestSavePath(resource);
        } else {
          targetUri = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(resource), options?.availableFileSystems);
        }
        if (targetUri) {
          return this.saveAs(resource, targetUri, options);
        }
      }
    } else {
      const model = this.files.get(resource);
      if (model) {
        return await model.save(options) ? resource : void 0;
      }
    }
    return void 0;
  }
  async saveAs(source, target, options) {
    if (!target) {
      target = await this.fileDialogService.pickFileToSave(await this.suggestSavePath(options?.suggestedTarget ?? source), options?.availableFileSystems);
    }
    if (!target) {
      return;
    }
    if (this.filesConfigurationService.isReadonly(target)) {
      const confirmed = await this.confirmMakeWriteable(target);
      if (!confirmed) {
        return;
      } else {
        this.filesConfigurationService.updateReadonly(target, false);
      }
    }
    if (isEqual(source, target)) {
      return this.save(source, {
        ...options,
        force: true
        /* force to save, even if not dirty (https://github.com/microsoft/vscode/issues/99619) */
      });
    }
    if (this.fileService.hasProvider(source) && this.uriIdentityService.extUri.isEqual(source, target) && await this.fileService.exists(source)) {
      await this.workingCopyFileService.move([{ file: { source, target } }], CancellationToken.None);
      const success = await this.save(source, options);
      if (!success) {
        await this.save(target, options);
      }
      return target;
    }
    return this.doSaveAs(source, target, options);
  }
  async doSaveAs(source, target, options) {
    let success = false;
    let resolvedTextModel;
    if (source.scheme !== Schemas.untitled) {
      const textFileModel = this.files.get(source);
      if (textFileModel?.isResolved()) {
        resolvedTextModel = textFileModel;
      }
    } else {
      const untitledTextModel = this.untitled.get(source);
      if (untitledTextModel?.isResolved()) {
        resolvedTextModel = untitledTextModel;
      }
    }
    if (resolvedTextModel) {
      success = await this.doSaveAsTextFile(resolvedTextModel, source, target, options);
    } else if (this.fileService.hasProvider(source)) {
      await this.fileService.copy(source, target, true);
      success = true;
    } else {
      const textModel = this.modelService.getModel(source);
      if (textModel) {
        success = await this.doSaveAsTextFile(textModel, source, target, options);
      }
    }
    if (!success) {
      return void 0;
    }
    try {
      await this.revert(source);
    } catch (error) {
      this.logService.error(error);
    }
    if (source.scheme === Schemas.untitled) {
      this.untitled.notifyDidSave(source, target);
    }
    return target;
  }
  async doSaveAsTextFile(sourceModel, source, target, options) {
    let sourceModelEncoding = void 0;
    const sourceModelWithEncodingSupport = sourceModel;
    if (typeof sourceModelWithEncodingSupport.getEncoding === "function") {
      sourceModelEncoding = sourceModelWithEncodingSupport.getEncoding();
    }
    let targetExists = false;
    let targetModel = this.files.get(target);
    if (targetModel?.isResolved()) {
      targetExists = true;
    } else {
      targetExists = await this.fileService.exists(target);
      if (!targetExists) {
        await this.create([{ resource: target, value: "" }]);
      }
      try {
        targetModel = await this.files.resolve(target, { encoding: sourceModelEncoding });
      } catch (error) {
        if (targetExists) {
          if (error.textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY || error.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
            await this.fileService.del(target);
            return this.doSaveAsTextFile(sourceModel, source, target, options);
          }
        }
        throw error;
      }
    }
    let write;
    if (sourceModel instanceof UntitledTextEditorModel && sourceModel.hasAssociatedFilePath && targetExists && this.uriIdentityService.extUri.isEqual(target, toLocalResource(sourceModel.resource, this.environmentService.remoteAuthority, this.pathService.defaultUriScheme))) {
      write = await this.confirmOverwrite(target);
    } else {
      write = true;
    }
    if (!write) {
      return false;
    }
    let sourceTextModel = void 0;
    if (sourceModel instanceof BaseTextEditorModel) {
      if (sourceModel.isResolved()) {
        sourceTextModel = sourceModel.textEditorModel ?? void 0;
      }
    } else {
      sourceTextModel = sourceModel;
    }
    let targetTextModel = void 0;
    if (targetModel.isResolved()) {
      targetTextModel = targetModel.textEditorModel;
    }
    if (sourceTextModel && targetTextModel) {
      targetModel.updatePreferredEncoding(sourceModelEncoding);
      this.modelService.updateModel(targetTextModel, createTextBufferFactoryFromSnapshot(sourceTextModel.createSnapshot()));
      const sourceLanguageId = sourceTextModel.getLanguageId();
      const targetLanguageId = targetTextModel.getLanguageId();
      if (sourceLanguageId !== PLAINTEXT_LANGUAGE_ID && targetLanguageId === PLAINTEXT_LANGUAGE_ID) {
        targetTextModel.setLanguage(sourceLanguageId);
      }
      const sourceOptions = sourceTextModel.getOptions();
      targetTextModel.updateOptions({
        tabSize: sourceOptions.tabSize,
        indentSize: sourceOptions.indentSize,
        insertSpaces: sourceOptions.insertSpaces
      });
      const sourceEOL = sourceTextModel.getEndOfLineSequence();
      targetTextModel.setEOL(sourceEOL);
      const sourceTransientProperties = this.codeEditorService.getTransientModelProperties(sourceTextModel);
      if (sourceTransientProperties) {
        for (const [key, value] of sourceTransientProperties) {
          this.codeEditorService.setTransientModelProperty(targetTextModel, key, value);
        }
      }
    }
    if (!options?.source) {
      options = {
        ...options,
        source: targetExists ? AbstractTextFileService.TEXTFILE_SAVE_REPLACE_SOURCE : AbstractTextFileService.TEXTFILE_SAVE_CREATE_SOURCE
      };
    }
    return targetModel.save({
      ...options,
      from: source
    });
  }
  async confirmOverwrite(resource) {
    const { confirmed } = await this.dialogService.confirm({
      type: "warning",
      message: localize("confirmOverwrite", "'{0}' already exists. Do you want to replace it?", basename(resource)),
      detail: localize("overwriteIrreversible", "A file or folder with the name '{0}' already exists in the folder '{1}'. Replacing it will overwrite its current contents.", basename(resource), basename(dirname(resource))),
      primaryButton: localize({ key: "replaceButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Replace")
    });
    return confirmed;
  }
  async confirmMakeWriteable(resource) {
    const { confirmed } = await this.dialogService.confirm({
      type: "warning",
      message: localize("confirmMakeWriteable", "'{0}' is marked as read-only. Do you want to save anyway?", basename(resource)),
      detail: localize("confirmMakeWriteableDetail", "Paths can be configured as read-only via settings."),
      primaryButton: localize({ key: "makeWriteableButtonLabel", comment: ["&& denotes a mnemonic"] }, "&&Save Anyway")
    });
    return confirmed;
  }
  async suggestSavePath(resource) {
    if (this.fileService.hasProvider(resource)) {
      return resource;
    }
    const remoteAuthority = this.environmentService.remoteAuthority;
    const defaultFilePath = await this.fileDialogService.defaultFilePath();
    let suggestedFilename = void 0;
    if (resource.scheme === Schemas.untitled) {
      const model = this.untitled.get(resource);
      if (model) {
        if (model.hasAssociatedFilePath) {
          return toLocalResource(resource, remoteAuthority, this.pathService.defaultUriScheme);
        }
        let nameCandidate;
        if (await this.pathService.hasValidBasename(joinPath(defaultFilePath, model.name), model.name)) {
          nameCandidate = model.name;
        } else {
          nameCandidate = basename(resource);
        }
        const languageId = model.getLanguageId();
        if (languageId && languageId !== PLAINTEXT_LANGUAGE_ID) {
          suggestedFilename = this.suggestFilename(languageId, nameCandidate);
        } else {
          suggestedFilename = nameCandidate;
        }
      }
    }
    if (!suggestedFilename) {
      suggestedFilename = basename(resource);
    }
    return joinPath(defaultFilePath, suggestedFilename);
  }
  suggestFilename(languageId, untitledName) {
    const languageName = this.languageService.getLanguageName(languageId);
    if (!languageName) {
      return untitledName;
    }
    const untitledExtension = pathExtname(untitledName);
    const extensions = this.languageService.getExtensions(languageId);
    if (extensions.includes(untitledExtension)) {
      return untitledName;
    }
    const primaryExtension = extensions.at(0);
    if (primaryExtension) {
      if (untitledExtension) {
        return `${untitledName.substring(0, untitledName.indexOf(untitledExtension))}${primaryExtension}`;
      }
      return `${untitledName}${primaryExtension}`;
    }
    const filenames = this.languageService.getFilenames(languageId);
    if (filenames.includes(untitledName)) {
      return untitledName;
    }
    return filenames.at(0) ?? untitledName;
  }
  //#endregion
  //#region revert
  async revert(resource, options) {
    if (resource.scheme === Schemas.untitled) {
      const model = this.untitled.get(resource);
      if (model) {
        return model.revert(options);
      }
    } else {
      const model = this.files.get(resource);
      if (model && (model.isDirty() || options?.force)) {
        return model.revert(options);
      }
    }
  }
  //#endregion
  //#region dirty
  isDirty(resource) {
    const model = resource.scheme === Schemas.untitled ? this.untitled.get(resource) : this.files.get(resource);
    if (model) {
      return model.isDirty();
    }
    return false;
  }
  //#endregion
};
AbstractTextFileService.TEXTFILE_SAVE_CREATE_SOURCE = SaveSourceRegistry.registerSource("textFileCreate.source", localize("textFileCreate.source", "File Created"));
AbstractTextFileService.TEXTFILE_SAVE_REPLACE_SOURCE = SaveSourceRegistry.registerSource("textFileOverwrite.source", localize("textFileOverwrite.source", "File Replaced"));
AbstractTextFileService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUntitledTextEditorService),
  __decorateParam(2, ILifecycleService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, ITextResourceConfigurationService),
  __decorateParam(9, IFilesConfigurationService),
  __decorateParam(10, ICodeEditorService),
  __decorateParam(11, IPathService),
  __decorateParam(12, IWorkingCopyFileService),
  __decorateParam(13, IUriIdentityService),
  __decorateParam(14, ILanguageService),
  __decorateParam(15, ILogService),
  __decorateParam(16, IElevatedFileService),
  __decorateParam(17, IDecorationsService)
], AbstractTextFileService);
let EncodingOracle = class extends Disposable {
  constructor(textResourceConfigurationService, environmentService, contextService, uriIdentityService) {
    super();
    this.textResourceConfigurationService = textResourceConfigurationService;
    this.environmentService = environmentService;
    this.contextService = contextService;
    this.uriIdentityService = uriIdentityService;
    this._encodingOverrides = this.getDefaultEncodingOverrides();
    this.registerListeners();
  }
  get encodingOverrides() {
    return this._encodingOverrides;
  }
  set encodingOverrides(value) {
    this._encodingOverrides = value;
  }
  registerListeners() {
    this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.encodingOverrides = this.getDefaultEncodingOverrides()));
  }
  getDefaultEncodingOverrides() {
    const defaultEncodingOverrides = [];
    defaultEncodingOverrides.push({ parent: this.environmentService.userRoamingDataHome, encoding: UTF8 });
    defaultEncodingOverrides.push({ extension: WORKSPACE_EXTENSION, encoding: UTF8 });
    defaultEncodingOverrides.push({ parent: this.environmentService.untitledWorkspacesHome, encoding: UTF8 });
    this.contextService.getWorkspace().folders.forEach((folder) => {
      defaultEncodingOverrides.push({ parent: joinPath(folder.uri, ".vscode"), encoding: UTF8 });
    });
    return defaultEncodingOverrides;
  }
  async getWriteEncoding(resource, options) {
    const { encoding, hasBOM } = await this.getPreferredWriteEncoding(resource, options ? options.encoding : void 0);
    return { encoding, addBOM: hasBOM };
  }
  async getPreferredWriteEncoding(resource, preferredEncoding) {
    const resourceEncoding = await this.getValidatedEncodingForResource(resource, preferredEncoding);
    return {
      encoding: resourceEncoding,
      hasBOM: resourceEncoding === UTF16be || resourceEncoding === UTF16le || resourceEncoding === UTF8_with_bom
      // enforce BOM for certain encodings
    };
  }
  async getPreferredReadEncoding(resource, options, detectedEncoding) {
    let preferredEncoding;
    if (options?.encoding) {
      if (detectedEncoding === UTF8_with_bom && options.encoding === UTF8) {
        preferredEncoding = UTF8_with_bom;
      } else {
        preferredEncoding = options.encoding;
      }
    } else if (typeof detectedEncoding === "string") {
      preferredEncoding = detectedEncoding;
    } else if (this.textResourceConfigurationService.getValue(resource, "files.encoding") === UTF8_with_bom) {
      preferredEncoding = UTF8;
    }
    const encoding = await this.getValidatedEncodingForResource(resource, preferredEncoding);
    return {
      encoding,
      hasBOM: encoding === UTF16be || encoding === UTF16le || encoding === UTF8_with_bom
      // enforce BOM for certain encodings
    };
  }
  getUnvalidatedEncodingForResource(resource, preferredEncoding) {
    let fileEncoding;
    const override = this.getEncodingOverride(resource);
    if (override) {
      fileEncoding = override;
    } else if (preferredEncoding) {
      fileEncoding = preferredEncoding;
    } else {
      fileEncoding = this.textResourceConfigurationService.getValue(resource, "files.encoding");
    }
    return fileEncoding || UTF8;
  }
  async getValidatedEncodingForResource(resource, preferredEncoding) {
    let fileEncoding = this.getUnvalidatedEncodingForResource(resource, preferredEncoding);
    if (fileEncoding !== UTF8 && !await encodingExists(fileEncoding)) {
      fileEncoding = UTF8;
    }
    return fileEncoding;
  }
  getEncodingOverride(resource) {
    if (resource && this.encodingOverrides?.length) {
      for (const override of this.encodingOverrides) {
        if (override.parent && this.uriIdentityService.extUri.isEqualOrParent(resource, override.parent)) {
          return override.encoding;
        }
        if (override.extension && extname(resource) === `.${override.extension}`) {
          return override.encoding;
        }
      }
    }
    return void 0;
  }
};
EncodingOracle = __decorateClass([
  __decorateParam(0, ITextResourceConfigurationService),
  __decorateParam(1, IWorkbenchEnvironmentService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IUriIdentityService)
], EncodingOracle);
export {
  AbstractTextFileService,
  EncodingOracle
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx0ZXh0ZmlsZVxcYnJvd3NlclxcdGV4dEZpbGVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElFbmNvZGluZ1N1cHBvcnQsIElUZXh0RmlsZVNlcnZpY2UsIElUZXh0RmlsZVN0cmVhbUNvbnRlbnQsIElUZXh0RmlsZUNvbnRlbnQsIElSZXNvdXJjZUVuY29kaW5ncywgSVJlYWRUZXh0RmlsZU9wdGlvbnMsIElXcml0ZVRleHRGaWxlT3B0aW9ucywgdG9CdWZmZXJPclJlYWRhYmxlLCBUZXh0RmlsZU9wZXJhdGlvbkVycm9yLCBUZXh0RmlsZU9wZXJhdGlvblJlc3VsdCwgSVRleHRGaWxlU2F2ZU9wdGlvbnMsIElUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlciwgSVJlc291cmNlRW5jb2RpbmcsIHN0cmluZ1RvU25hcHNob3QsIElUZXh0RmlsZVNhdmVBc09wdGlvbnMsIElSZWFkVGV4dEZpbGVFbmNvZGluZ09wdGlvbnMsIFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZSwgSVJlc29sdmVkVGV4dEZpbGVFZGl0b3JNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSVJldmVydE9wdGlvbnMsIFNhdmVTb3VyY2VSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCBJQ3JlYXRlRmlsZU9wdGlvbnMsIElGaWxlU3RyZWFtQ29udGVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGV4dG5hbWUgYXMgcGF0aEV4dG5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLCBJVW50aXRsZWRUZXh0RWRpdG9yTW9kZWxNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVW50aXRsZWRUZXh0RWRpdG9yTW9kZWwsIFVudGl0bGVkVGV4dEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyIH0gZnJvbSAnLi4vY29tbW9uL3RleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU25hcHNob3QsIGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoLCBkaXJuYW1lLCBiYXNlbmFtZSwgdG9Mb2NhbFJlc291cmNlLCBleHRuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlLCBidWZmZXJUb1N0cmVhbSwgVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJVGV4dFNuYXBzaG90LCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBCYXNlVGV4dEVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci90ZXh0RWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvLCBJQ3JlYXRlRmlsZU9wZXJhdGlvbiB9IGZyb20gJy4uLy4uL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXT1JLU1BBQ0VfRVhURU5TSU9OIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVVRGOCwgVVRGOF93aXRoX2JvbSwgVVRGMTZiZSwgVVRGMTZsZSwgZW5jb2RpbmdFeGlzdHMsIHRvRW5jb2RlUmVhZGFibGUsIHRvRGVjb2RlU3RyZWFtLCBJRGVjb2RlU3RyZWFtUmVzdWx0LCBEZWNvZGVTdHJlYW1FcnJvciwgRGVjb2RlU3RyZWFtRXJyb3JLaW5kIH0gZnJvbSAnLi4vY29tbW9uL2VuY29kaW5nLmpzJztcbmltcG9ydCB7IGNvbnN1bWVTdHJlYW0sIFJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyZWFtLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWxldmF0ZWRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9lbGV2YXRlZEZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uRGF0YSwgSURlY29yYXRpb25zUHJvdmlkZXIsIElEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBsaXN0RXJyb3JGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RUZXh0RmlsZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRleHRGaWxlU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVEVYVEZJTEVfU0FWRV9DUkVBVEVfU09VUkNFID0gU2F2ZVNvdXJjZVJlZ2lzdHJ5LnJlZ2lzdGVyU291cmNlKCd0ZXh0RmlsZUNyZWF0ZS5zb3VyY2UnLCBsb2NhbGl6ZSgndGV4dEZpbGVDcmVhdGUuc291cmNlJywgXCJGaWxlIENyZWF0ZWRcIikpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBURVhURklMRV9TQVZFX1JFUExBQ0VfU09VUkNFID0gU2F2ZVNvdXJjZVJlZ2lzdHJ5LnJlZ2lzdGVyU291cmNlKCd0ZXh0RmlsZU92ZXJ3cml0ZS5zb3VyY2UnLCBsb2NhbGl6ZSgndGV4dEZpbGVPdmVyd3JpdGUuc291cmNlJywgXCJGaWxlIFJlcGxhY2VkXCIpKTtcblxuXHRyZWFkb25seSBmaWxlczogSVRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyO1xuXG5cdHJlYWRvbmx5IHVudGl0bGVkOiBJVW50aXRsZWRUZXh0RWRpdG9yTW9kZWxNYW5hZ2VyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlIHVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U6IElVbnRpdGxlZFRleHRFZGl0b3JNb2RlbE1hbmFnZXIsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFbGV2YXRlZEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWxldmF0ZWRGaWxlU2VydmljZTogSUVsZXZhdGVkRmlsZVNlcnZpY2UsXG5cdFx0QElEZWNvcmF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uc1NlcnZpY2U6IElEZWNvcmF0aW9uc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZmlsZXMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRleHRGaWxlRWRpdG9yTW9kZWxNYW5hZ2VyKSk7XG5cdFx0dGhpcy51bnRpdGxlZCA9IHVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2U7XG5cblx0XHR0aGlzLnByb3ZpZGVEZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIGRlY29yYXRpb25zXG5cblx0cHJpdmF0ZSBwcm92aWRlRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cblx0XHQvLyBUZXh0IGZpbGUgbW9kZWwgZGVjb3JhdGlvbnNcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBjbGFzcyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGVjb3JhdGlvbnNQcm92aWRlciB7XG5cblx0XHRcdHJlYWRvbmx5IGxhYmVsID0gbG9jYWxpemUoJ3RleHRGaWxlTW9kZWxEZWNvcmF0aW9ucycsIFwiVGV4dCBGaWxlIE1vZGVsIERlY29yYXRpb25zXCIpO1xuXG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSSVtdPigpKTtcblx0XHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0XHRcdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZmlsZXM6IElUZXh0RmlsZUVkaXRvck1vZGVsTWFuYWdlcikge1xuXHRcdFx0XHRzdXBlcigpO1xuXG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHRcdH1cblxuXHRcdFx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdFx0XHQvLyBDcmVhdGVzXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZXMub25EaWRSZXNvbHZlKCh7IG1vZGVsIH0pID0+IHtcblx0XHRcdFx0XHRpZiAobW9kZWwuaXNSZWFkb25seSgpIHx8IG1vZGVsLmhhc1N0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5PUlBIQU4pKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKFttb2RlbC5yZXNvdXJjZV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIFJlbW92YWxzOiBvbmNlIGEgdGV4dCBmaWxlIG1vZGVsIGlzIG5vIGxvbmdlclxuXHRcdFx0XHQvLyB1bmRlciBvdXIgY29udHJvbCwgbWFrZSBzdXJlIHRvIHNpZ25hbCB0aGlzIGFzXG5cdFx0XHRcdC8vIGRlY29yYXRpb24gY2hhbmdlIGJlY2F1c2UgZnJvbSB0aGlzIHBvaW50IG9uIHdlXG5cdFx0XHRcdC8vIGhhdmUgbm8gd2F5IG9mIHVwZGF0aW5nIHRoZSBkZWNvcmF0aW9uIGFueW1vcmUuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZXMub25EaWRSZW1vdmUobW9kZWxVcmkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShbbW9kZWxVcmldKSkpO1xuXG5cdFx0XHRcdC8vIENoYW5nZXNcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlcy5vbkRpZENoYW5nZVJlYWRvbmx5KG1vZGVsID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW21vZGVsLnJlc291cmNlXSkpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlcy5vbkRpZENoYW5nZU9ycGhhbmVkKG1vZGVsID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW21vZGVsLnJlc291cmNlXSkpKTtcblx0XHRcdH1cblxuXHRcdFx0cHJvdmlkZURlY29yYXRpb25zKHVyaTogVVJJKTogSURlY29yYXRpb25EYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmZpbGVzLmdldCh1cmkpO1xuXHRcdFx0XHRpZiAoIW1vZGVsIHx8IG1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpc1JlYWRvbmx5ID0gbW9kZWwuaXNSZWFkb25seSgpO1xuXHRcdFx0XHRjb25zdCBpc09ycGhhbmVkID0gbW9kZWwuaGFzU3RhdGUoVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLk9SUEhBTik7XG5cblx0XHRcdFx0Ly8gUmVhZG9ubHkgKyBPcnBoYW5lZFxuXHRcdFx0XHRpZiAoaXNSZWFkb25seSAmJiBpc09ycGhhbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbG9yOiBsaXN0RXJyb3JGb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdFx0bGV0dGVyOiBDb2RpY29uLmxvY2tTbWFsbCxcblx0XHRcdFx0XHRcdHN0cmlrZXRocm91Z2g6IHRydWUsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgncmVhZG9ubHlBbmREZWxldGVkJywgXCJEZWxldGVkLCBSZWFkLW9ubHlcIiksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlYWRvbmx5XG5cdFx0XHRcdGVsc2UgaWYgKGlzUmVhZG9ubHkpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bGV0dGVyOiBDb2RpY29uLmxvY2tTbWFsbCxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdyZWFkb25seScsIFwiUmVhZC1vbmx5XCIpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPcnBoYW5lZFxuXHRcdFx0XHRlbHNlIGlmIChpc09ycGhhbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbG9yOiBsaXN0RXJyb3JGb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdFx0c3RyaWtldGhyb3VnaDogdHJ1ZSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdkZWxldGVkJywgXCJEZWxldGVkXCIpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0odGhpcy5maWxlcykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWNvcmF0aW9uc1NlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gdGV4dCBmaWxlIHJlYWQgLyB3cml0ZSAvIGNyZWF0ZVxuXG5cdHByaXZhdGUgX2VuY29kaW5nOiBFbmNvZGluZ09yYWNsZSB8IHVuZGVmaW5lZDtcblxuXHRnZXQgZW5jb2RpbmcoKTogRW5jb2RpbmdPcmFjbGUge1xuXHRcdGlmICghdGhpcy5fZW5jb2RpbmcpIHtcblx0XHRcdHRoaXMuX2VuY29kaW5nID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmNvZGluZ09yYWNsZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9lbmNvZGluZztcblx0fVxuXG5cdGFzeW5jIHJlYWQocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkVGV4dEZpbGVPcHRpb25zKTogUHJvbWlzZTxJVGV4dEZpbGVDb250ZW50PiB7XG5cdFx0Y29uc3QgW2J1ZmZlclN0cmVhbSwgZGVjb2Rlcl0gPSBhd2FpdCB0aGlzLmRvUmVhZChyZXNvdXJjZSwge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdC8vIG9wdGltaXphdGlvbjogc2luY2Ugd2Uga25vdyB0aGF0IHRoZSBjYWxsZXIgZG9lcyBub3Rcblx0XHRcdC8vIGNhcmUgYWJvdXQgYnVmZmVyaW5nLCB3ZSBpbmRpY2F0ZSB0aGlzIHRvIHRoZSByZWFkZXIuXG5cdFx0XHQvLyB0aGlzIHJlZHVjZXMgYWxsIHRoZSBvdmVyaGVhZCB0aGUgYnVmZmVyZWQgcmVhZGluZ1xuXHRcdFx0Ly8gaGFzIChvcGVuLCByZWFkLCBjbG9zZSkgaWYgdGhlIHByb3ZpZGVyIHN1cHBvcnRzXG5cdFx0XHQvLyB1bmJ1ZmZlcmVkIHJlYWRpbmcuXG5cdFx0XHRwcmVmZXJVbmJ1ZmZlcmVkOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uYnVmZmVyU3RyZWFtLFxuXHRcdFx0ZW5jb2Rpbmc6IGRlY29kZXIuZGV0ZWN0ZWQuZW5jb2RpbmcgfHwgVVRGOCxcblx0XHRcdHZhbHVlOiBhd2FpdCBjb25zdW1lU3RyZWFtKGRlY29kZXIuc3RyZWFtLCBzdHJpbmdzID0+IHN0cmluZ3Muam9pbignJykpXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHJlYWRTdHJlYW0ocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZWFkVGV4dEZpbGVPcHRpb25zKTogUHJvbWlzZTxJVGV4dEZpbGVTdHJlYW1Db250ZW50PiB7XG5cdFx0Y29uc3QgW2J1ZmZlclN0cmVhbSwgZGVjb2Rlcl0gPSBhd2FpdCB0aGlzLmRvUmVhZChyZXNvdXJjZSwgb3B0aW9ucyk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uYnVmZmVyU3RyZWFtLFxuXHRcdFx0ZW5jb2Rpbmc6IGRlY29kZXIuZGV0ZWN0ZWQuZW5jb2RpbmcgfHwgVVRGOCxcblx0XHRcdHZhbHVlOiBhd2FpdCBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TdHJlYW0oZGVjb2Rlci5zdHJlYW0pXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZWFkKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJUmVhZFRleHRGaWxlT3B0aW9ucyAmIHsgcHJlZmVyVW5idWZmZXJlZD86IGJvb2xlYW4gfSk6IFByb21pc2U8W0lGaWxlU3RyZWFtQ29udGVudCwgSURlY29kZVN0cmVhbVJlc3VsdF0+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdC8vIHJlYWQgc3RyZWFtIHJhdyAoZWl0aGVyIGJ1ZmZlcmVkIG9yIHVuYnVmZmVyZWQpXG5cdFx0bGV0IGJ1ZmZlclN0cmVhbTogSUZpbGVTdHJlYW1Db250ZW50O1xuXHRcdGlmIChvcHRpb25zPy5wcmVmZXJVbmJ1ZmZlcmVkKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSwgb3B0aW9ucywgY3RzLnRva2VuKTtcblx0XHRcdGJ1ZmZlclN0cmVhbSA9IHtcblx0XHRcdFx0Li4uY29udGVudCxcblx0XHRcdFx0dmFsdWU6IGJ1ZmZlclRvU3RyZWFtKGNvbnRlbnQudmFsdWUpXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRidWZmZXJTdHJlYW0gPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlU3RyZWFtKHJlc291cmNlLCBvcHRpb25zLCBjdHMudG9rZW4pO1xuXHRcdH1cblxuXHRcdC8vIHJlYWQgdGhyb3VnaCBlbmNvZGluZyBsaWJyYXJ5XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRlY29kZXIgPSBhd2FpdCB0aGlzLmRvR2V0RGVjb2RlZFN0cmVhbShyZXNvdXJjZSwgYnVmZmVyU3RyZWFtLnZhbHVlLCBvcHRpb25zKTtcblxuXHRcdFx0cmV0dXJuIFtidWZmZXJTdHJlYW0sIGRlY29kZXJdO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIE1ha2Ugc3VyZSB0byBjYW5jZWwgcmVhZGluZyBvbiBlcnJvciB0b1xuXHRcdFx0Ly8gc3RvcCBmaWxlIHNlcnZpY2UgYWN0aXZpdHkgYXMgc29vbiBhc1xuXHRcdFx0Ly8gcG9zc2libGUuIFdoZW4gZm9yIGV4YW1wbGUgYSBsYXJnZSBiaW5hcnlcblx0XHRcdC8vIGZpbGUgaXMgcmVhZCB3ZSB3YW50IHRvIGNhbmNlbCB0aGUgcmVhZFxuXHRcdFx0Ly8gaW5zdGFudGx5LlxuXHRcdFx0Ly8gUmVmczpcblx0XHRcdC8vIC0gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzODgwNVxuXHRcdFx0Ly8gLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTMyNzcxXG5cdFx0XHRjdHMuZGlzcG9zZSh0cnVlKTtcblxuXHRcdFx0Ly8gc3BlY2lhbCB0cmVhdG1lbnQgZm9yIHN0cmVhbXMgdGhhdCBhcmUgYmluYXJ5XG5cdFx0XHRpZiAoKDxEZWNvZGVTdHJlYW1FcnJvcj5lcnJvcikuZGVjb2RlU3RyZWFtRXJyb3JLaW5kID09PSBEZWNvZGVTdHJlYW1FcnJvcktpbmQuU1RSRUFNX0lTX0JJTkFSWSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgVGV4dEZpbGVPcGVyYXRpb25FcnJvcihsb2NhbGl6ZSgnZmlsZUJpbmFyeUVycm9yJywgXCJGaWxlIHNlZW1zIHRvIGJlIGJpbmFyeSBhbmQgY2Fubm90IGJlIG9wZW5lZCBhcyB0ZXh0XCIpLCBUZXh0RmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX0lTX0JJTkFSWSwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHJlLXRocm93IGFueSBvdGhlciBlcnJvciBhcyBpdCBpc1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNyZWF0ZShvcGVyYXRpb25zOiB7IHJlc291cmNlOiBVUkk7IHZhbHVlPzogc3RyaW5nIHwgSVRleHRTbmFwc2hvdDsgb3B0aW9ucz86IElDcmVhdGVGaWxlT3B0aW9ucyB9W10sIHVuZG9JbmZvPzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8pOiBQcm9taXNlPHJlYWRvbmx5IElGaWxlU3RhdFdpdGhNZXRhZGF0YVtdPiB7XG5cdFx0Y29uc3Qgb3BlcmF0aW9uc1dpdGhDb250ZW50czogSUNyZWF0ZUZpbGVPcGVyYXRpb25bXSA9IGF3YWl0IFByb21pc2UuYWxsKG9wZXJhdGlvbnMubWFwKGFzeW5jIG9wZXJhdGlvbiA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuZ2V0RW5jb2RlZFJlYWRhYmxlKG9wZXJhdGlvbi5yZXNvdXJjZSwgb3BlcmF0aW9uLnZhbHVlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc291cmNlOiBvcGVyYXRpb24ucmVzb3VyY2UsXG5cdFx0XHRcdGNvbnRlbnRzLFxuXHRcdFx0XHRvdmVyd3JpdGU6IG9wZXJhdGlvbi5vcHRpb25zPy5vdmVyd3JpdGVcblx0XHRcdH07XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5jcmVhdGUob3BlcmF0aW9uc1dpdGhDb250ZW50cywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgdW5kb0luZm8pO1xuXHR9XG5cblx0YXN5bmMgd3JpdGUocmVzb3VyY2U6IFVSSSwgdmFsdWU6IHN0cmluZyB8IElUZXh0U25hcHNob3QsIG9wdGlvbnM/OiBJV3JpdGVUZXh0RmlsZU9wdGlvbnMpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4ge1xuXHRcdGNvbnN0IHJlYWRhYmxlID0gYXdhaXQgdGhpcy5nZXRFbmNvZGVkUmVhZGFibGUocmVzb3VyY2UsIHZhbHVlLCBvcHRpb25zKTtcblxuXHRcdGlmIChvcHRpb25zPy53cml0ZUVsZXZhdGVkICYmIHRoaXMuZWxldmF0ZWRGaWxlU2VydmljZS5pc1N1cHBvcnRlZChyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmVsZXZhdGVkRmlsZVNlcnZpY2Uud3JpdGVGaWxlRWxldmF0ZWQocmVzb3VyY2UsIHJlYWRhYmxlLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUocmVzb3VyY2UsIHJlYWRhYmxlLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIGdldEVuY29kZWRSZWFkYWJsZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB2YWx1ZTogSVRleHRTbmFwc2hvdCk6IFByb21pc2U8VlNCdWZmZXJSZWFkYWJsZT47XG5cdGFzeW5jIGdldEVuY29kZWRSZWFkYWJsZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGU+O1xuXHRhc3luYyBnZXRFbmNvZGVkUmVhZGFibGUocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdmFsdWU/OiBJVGV4dFNuYXBzaG90KTogUHJvbWlzZTxWU0J1ZmZlclJlYWRhYmxlIHwgdW5kZWZpbmVkPjtcblx0YXN5bmMgZ2V0RW5jb2RlZFJlYWRhYmxlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHZhbHVlPzogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCB1bmRlZmluZWQ+O1xuXHRhc3luYyBnZXRFbmNvZGVkUmVhZGFibGUocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdmFsdWU/OiBzdHJpbmcgfCBJVGV4dFNuYXBzaG90KTogUHJvbWlzZTxWU0J1ZmZlciB8IFZTQnVmZmVyUmVhZGFibGUgfCB1bmRlZmluZWQ+O1xuXHRhc3luYyBnZXRFbmNvZGVkUmVhZGFibGUocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdmFsdWU6IHN0cmluZyB8IElUZXh0U25hcHNob3QsIG9wdGlvbnM/OiBJV3JpdGVUZXh0RmlsZU9wdGlvbnMpOiBQcm9taXNlPFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZT47XG5cdGFzeW5jIGdldEVuY29kZWRSZWFkYWJsZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB2YWx1ZT86IHN0cmluZyB8IElUZXh0U25hcHNob3QsIG9wdGlvbnM/OiBJV3JpdGVUZXh0RmlsZU9wdGlvbnMpOiBQcm9taXNlPFZTQnVmZmVyIHwgVlNCdWZmZXJSZWFkYWJsZSB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Ly8gY2hlY2sgZm9yIGVuY29kaW5nXG5cdFx0Y29uc3QgeyBlbmNvZGluZywgYWRkQk9NIH0gPSBhd2FpdCB0aGlzLmVuY29kaW5nLmdldFdyaXRlRW5jb2RpbmcocmVzb3VyY2UsIG9wdGlvbnMpO1xuXG5cdFx0Ly8gd2hlbiBlbmNvZGluZyBpcyBzdGFuZGFyZCBza2lwIGVuY29kaW5nIHN0ZXBcblx0XHRpZiAoZW5jb2RpbmcgPT09IFVURjggJiYgIWFkZEJPTSkge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCdcblx0XHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdFx0OiB0b0J1ZmZlck9yUmVhZGFibGUodmFsdWUpO1xuXHRcdH1cblxuXHRcdC8vIG90aGVyd2lzZSBjcmVhdGUgZW5jb2RlZCByZWFkYWJsZVxuXHRcdHZhbHVlID0gdmFsdWUgfHwgJyc7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gc3RyaW5nVG9TbmFwc2hvdCh2YWx1ZSkgOiB2YWx1ZTtcblx0XHRyZXR1cm4gdG9FbmNvZGVSZWFkYWJsZShzbmFwc2hvdCwgZW5jb2RpbmcsIHsgYWRkQk9NIH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0RGVjb2RlZFN0cmVhbShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB2YWx1ZTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgb3B0aW9ucz86IElSZWFkVGV4dEZpbGVFbmNvZGluZ09wdGlvbnMpOiBQcm9taXNlPFJlYWRhYmxlU3RyZWFtPHN0cmluZz4+IHtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuZG9HZXREZWNvZGVkU3RyZWFtKHJlc291cmNlLCB2YWx1ZSwgb3B0aW9ucykpLnN0cmVhbTtcblx0fVxuXG5cdHByaXZhdGUgZG9HZXREZWNvZGVkU3RyZWFtKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHN0cmVhbTogVlNCdWZmZXJSZWFkYWJsZVN0cmVhbSwgb3B0aW9ucz86IElSZWFkVGV4dEZpbGVFbmNvZGluZ09wdGlvbnMpOiBQcm9taXNlPElEZWNvZGVTdHJlYW1SZXN1bHQ+IHtcblxuXHRcdC8vIHJlYWQgdGhyb3VnaCBlbmNvZGluZyBsaWJyYXJ5XG5cdFx0cmV0dXJuIHRvRGVjb2RlU3RyZWFtKHN0cmVhbSwge1xuXHRcdFx0YWNjZXB0VGV4dE9ubHk6IG9wdGlvbnM/LmFjY2VwdFRleHRPbmx5ID8/IGZhbHNlLFxuXHRcdFx0Z3Vlc3NFbmNvZGluZzpcblx0XHRcdFx0b3B0aW9ucz8uYXV0b0d1ZXNzRW5jb2RpbmcgfHxcblx0XHRcdFx0dGhpcy50ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShyZXNvdXJjZSwgJ2ZpbGVzLmF1dG9HdWVzc0VuY29kaW5nJyksXG5cdFx0XHRjYW5kaWRhdGVHdWVzc0VuY29kaW5nczpcblx0XHRcdFx0b3B0aW9ucz8uY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MgfHxcblx0XHRcdFx0dGhpcy50ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShyZXNvdXJjZSwgJ2ZpbGVzLmNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzJyksXG5cdFx0XHRvdmVyd3JpdGVFbmNvZGluZzogYXN5bmMgZGV0ZWN0ZWRFbmNvZGluZyA9PiB0aGlzLnZhbGlkYXRlRGV0ZWN0ZWRFbmNvZGluZyhyZXNvdXJjZSwgZGV0ZWN0ZWRFbmNvZGluZyA/PyB1bmRlZmluZWQsIG9wdGlvbnMpXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRFbmNvZGluZyhyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBtb2RlbCA9IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCA/IHRoaXMudW50aXRsZWQuZ2V0KHJlc291cmNlKSA6IHRoaXMuZmlsZXMuZ2V0KHJlc291cmNlKTtcblx0XHRyZXR1cm4gbW9kZWw/LmdldEVuY29kaW5nKCkgPz8gdGhpcy5lbmNvZGluZy5nZXRVbnZhbGlkYXRlZEVuY29kaW5nRm9yUmVzb3VyY2UocmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZURlY29kaW5nKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJUmVhZFRleHRGaWxlRW5jb2RpbmdPcHRpb25zKTogUHJvbWlzZTx7IHByZWZlcnJlZEVuY29kaW5nOiBzdHJpbmc7IGd1ZXNzRW5jb2Rpbmc6IGJvb2xlYW47IGNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzOiBzdHJpbmdbXSB9PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByZWZlcnJlZEVuY29kaW5nOiAoYXdhaXQgdGhpcy5lbmNvZGluZy5nZXRQcmVmZXJyZWRSZWFkRW5jb2RpbmcocmVzb3VyY2UsIG9wdGlvbnMsIHVuZGVmaW5lZCkpLmVuY29kaW5nLFxuXHRcdFx0Z3Vlc3NFbmNvZGluZzpcblx0XHRcdFx0b3B0aW9ucz8uYXV0b0d1ZXNzRW5jb2RpbmcgfHxcblx0XHRcdFx0dGhpcy50ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShyZXNvdXJjZSwgJ2ZpbGVzLmF1dG9HdWVzc0VuY29kaW5nJyksXG5cdFx0XHRjYW5kaWRhdGVHdWVzc0VuY29kaW5nczpcblx0XHRcdFx0b3B0aW9ucz8uY2FuZGlkYXRlR3Vlc3NFbmNvZGluZ3MgfHxcblx0XHRcdFx0dGhpcy50ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShyZXNvdXJjZSwgJ2ZpbGVzLmNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzJyksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHZhbGlkYXRlRGV0ZWN0ZWRFbmNvZGluZyhyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBkZXRlY3RlZEVuY29kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJUmVhZFRleHRGaWxlRW5jb2RpbmdPcHRpb25zKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCB7IGVuY29kaW5nIH0gPSBhd2FpdCB0aGlzLmVuY29kaW5nLmdldFByZWZlcnJlZFJlYWRFbmNvZGluZyhyZXNvdXJjZSwgb3B0aW9ucywgZGV0ZWN0ZWRFbmNvZGluZyk7XG5cblx0XHRyZXR1cm4gZW5jb2Rpbmc7XG5cdH1cblxuXHRyZXNvbHZlRW5jb2RpbmcocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElXcml0ZVRleHRGaWxlT3B0aW9ucyk6IFByb21pc2U8eyBlbmNvZGluZzogc3RyaW5nOyBhZGRCT006IGJvb2xlYW4gfT4ge1xuXHRcdHJldHVybiB0aGlzLmVuY29kaW5nLmdldFdyaXRlRW5jb2RpbmcocmVzb3VyY2UsIG9wdGlvbnMpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gc2F2ZVxuXG5cdGFzeW5jIHNhdmUocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElUZXh0RmlsZVNhdmVPcHRpb25zKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblxuXHRcdC8vIFVudGl0bGVkXG5cdFx0aWYgKHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLnVudGl0bGVkLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0bGV0IHRhcmdldFVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIFVudGl0bGVkIHdpdGggYXNzb2NpYXRlZCBmaWxlIHBhdGggZG9uJ3QgbmVlZCB0byBwcm9tcHRcblx0XHRcdFx0aWYgKG1vZGVsLmhhc0Fzc29jaWF0ZWRGaWxlUGF0aCkge1xuXHRcdFx0XHRcdHRhcmdldFVyaSA9IGF3YWl0IHRoaXMuc3VnZ2VzdFNhdmVQYXRoKHJlc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE90aGVyd2lzZSBhc2sgdXNlclxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0YXJnZXRVcmkgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnBpY2tGaWxlVG9TYXZlKGF3YWl0IHRoaXMuc3VnZ2VzdFNhdmVQYXRoKHJlc291cmNlKSwgb3B0aW9ucz8uYXZhaWxhYmxlRmlsZVN5c3RlbXMpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2F2ZSBhcyBpZiB0YXJnZXQgcHJvdmlkZWRcblx0XHRcdFx0aWYgKHRhcmdldFVyaSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnNhdmVBcyhyZXNvdXJjZSwgdGFyZ2V0VXJpLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbGVcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5maWxlcy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBtb2RlbC5zYXZlKG9wdGlvbnMpID8gcmVzb3VyY2UgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHNhdmVBcyhzb3VyY2U6IFVSSSwgdGFyZ2V0PzogVVJJLCBvcHRpb25zPzogSVRleHRGaWxlU2F2ZUFzT3B0aW9ucyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cblx0XHQvLyBHZXQgdG8gdGFyZ2V0IHJlc291cmNlXG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRhcmdldCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZpbGVUb1NhdmUoYXdhaXQgdGhpcy5zdWdnZXN0U2F2ZVBhdGgob3B0aW9ucz8uc3VnZ2VzdGVkVGFyZ2V0ID8/IHNvdXJjZSksIG9wdGlvbnM/LmF2YWlsYWJsZUZpbGVTeXN0ZW1zKTtcblx0XHR9XG5cblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuOyAvLyB1c2VyIGNhbmNlbGVkXG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHRhcmdldCBpcyBub3QgbWFya2VkIGFzIHJlYWRvbmx5IGFuZCBwcm9tcHQgb3RoZXJ3aXNlXG5cdFx0aWYgKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRhcmdldCkpIHtcblx0XHRcdGNvbnN0IGNvbmZpcm1lZCA9IGF3YWl0IHRoaXMuY29uZmlybU1ha2VXcml0ZWFibGUodGFyZ2V0KTtcblx0XHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVSZWFkb25seSh0YXJnZXQsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBKdXN0IHNhdmUgaWYgdGFyZ2V0IGlzIHNhbWUgYXMgbW9kZWxzIG93biByZXNvdXJjZVxuXHRcdGlmIChpc0VxdWFsKHNvdXJjZSwgdGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2F2ZShzb3VyY2UsIHsgLi4ub3B0aW9ucywgZm9yY2U6IHRydWUgIC8qIGZvcmNlIHRvIHNhdmUsIGV2ZW4gaWYgbm90IGRpcnR5IChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTk2MTkpICovIH0pO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSB0YXJnZXQgaXMgZGlmZmVyZW50IGJ1dCBvZiBzYW1lIGlkZW50aXR5LCB3ZVxuXHRcdC8vIG1vdmUgdGhlIHNvdXJjZSB0byB0aGUgdGFyZ2V0LCBrbm93aW5nIHRoYXQgdGhlXG5cdFx0Ly8gdW5kZXJseWluZyBmaWxlIHN5c3RlbSBjYW5ub3QgaGF2ZSBib3RoIGFuZCB0aGVuIHNhdmUuXG5cdFx0Ly8gSG93ZXZlciwgdGhpcyB3aWxsIG9ubHkgd29yayBpZiB0aGUgc291cmNlIGV4aXN0c1xuXHRcdC8vIGFuZCBpcyBub3Qgb3JwaGFuZWQsIHNvIHdlIG5lZWQgdG8gY2hlY2sgdGhhdCB0b28uXG5cdFx0aWYgKHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIoc291cmNlKSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzb3VyY2UsIHRhcmdldCkgJiYgKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHNvdXJjZSkpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UubW92ZShbeyBmaWxlOiB7IHNvdXJjZSwgdGFyZ2V0IH0gfV0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHQvLyBBdCB0aGlzIHBvaW50IHdlIGRvbid0IGtub3cgd2hldGhlciB3ZSBoYXZlIGFcblx0XHRcdC8vIG1vZGVsIGZvciB0aGUgc291cmNlIG9yIHRoZSB0YXJnZXQgVVJJIHNvIHdlXG5cdFx0XHQvLyBzaW1wbHkgdHJ5IHRvIHNhdmUgd2l0aCBib3RoIHJlc291cmNlcy5cblx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLnNhdmUoc291cmNlLCBvcHRpb25zKTtcblx0XHRcdGlmICghc3VjY2Vzcykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNhdmUodGFyZ2V0LCBvcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHR9XG5cblx0XHQvLyBEbyBpdFxuXHRcdHJldHVybiB0aGlzLmRvU2F2ZUFzKHNvdXJjZSwgdGFyZ2V0LCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TYXZlQXMoc291cmNlOiBVUkksIHRhcmdldDogVVJJLCBvcHRpb25zPzogSVRleHRGaWxlU2F2ZU9wdGlvbnMpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBzdWNjZXNzID0gZmFsc2U7XG5cblx0XHRsZXQgcmVzb2x2ZWRUZXh0TW9kZWw6IElSZXNvbHZlZFRleHRGaWxlRWRpdG9yTW9kZWwgfCBJUmVzb2x2ZWRVbnRpdGxlZFRleHRFZGl0b3JNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0Y29uc3QgdGV4dEZpbGVNb2RlbCA9IHRoaXMuZmlsZXMuZ2V0KHNvdXJjZSk7XG5cdFx0XHRpZiAodGV4dEZpbGVNb2RlbD8uaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRcdHJlc29sdmVkVGV4dE1vZGVsID0gdGV4dEZpbGVNb2RlbDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdW50aXRsZWRUZXh0TW9kZWwgPSB0aGlzLnVudGl0bGVkLmdldChzb3VyY2UpO1xuXHRcdFx0aWYgKHVudGl0bGVkVGV4dE1vZGVsPy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdFx0cmVzb2x2ZWRUZXh0TW9kZWwgPSB1bnRpdGxlZFRleHRNb2RlbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgc291cmNlIGlzIGFuIGV4aXN0aW5nIHJlc29sdmVkIGZpbGUgb3IgdW50aXRsZWQgdGV4dCBtb2RlbCwgd2UgY2FuXG5cdFx0Ly8gZGlyZWN0bHkgdXNlIHRoYXQgbW9kZWwgdG8gY29weSB0aGUgY29udGVudHMgdG8gdGhlIHRhcmdldCBkZXN0aW5hdGlvblxuXHRcdGlmIChyZXNvbHZlZFRleHRNb2RlbCkge1xuXHRcdFx0c3VjY2VzcyA9IGF3YWl0IHRoaXMuZG9TYXZlQXNUZXh0RmlsZShyZXNvbHZlZFRleHRNb2RlbCwgc291cmNlLCB0YXJnZXQsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBpZiB0aGUgc291cmNlIGNhbiBiZSBoYW5kbGVkIGJ5IHRoZSBmaWxlIHNlcnZpY2Vcblx0XHQvLyB3ZSBjYW4gc2ltcGx5IGludm9rZSB0aGUgY29weSgpIGZ1bmN0aW9uIHRvIHNhdmUgYXNcblx0XHRlbHNlIGlmICh0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHNvdXJjZSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY29weShzb3VyY2UsIHRhcmdldCwgdHJ1ZSk7XG5cblx0XHRcdHN1Y2Nlc3MgPSB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIEZpbmFsbHkgd2Ugc2ltcGx5IGNoZWNrIGlmIHdlIGNhbiBmaW5kIGEgZWRpdG9yIG1vZGVsIHRoYXRcblx0XHQvLyB3b3VsZCBnaXZlIHVzIGFjY2VzcyB0byB0aGUgY29udGVudHMuXG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChzb3VyY2UpO1xuXHRcdFx0aWYgKHRleHRNb2RlbCkge1xuXHRcdFx0XHRzdWNjZXNzID0gYXdhaXQgdGhpcy5kb1NhdmVBc1RleHRGaWxlKHRleHRNb2RlbCwgc291cmNlLCB0YXJnZXQsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghc3VjY2Vzcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBSZXZlcnQgdGhlIHNvdXJjZVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJldmVydChzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cblx0XHRcdC8vIEl0IGlzIHBvc3NpYmxlIHRoYXQgcmV2ZXJ0aW5nIHRoZSBzb3VyY2UgZmFpbHMsIGZvciBleGFtcGxlXG5cdFx0XHQvLyB3aGVuIGEgcmVtb3RlIGlzIGRpc2Nvbm5lY3RlZCBhbmQgd2UgY2Fubm90IHJlYWQgaXQgYW55bW9yZS5cblx0XHRcdC8vIEhvd2V2ZXIsIHRoaXMgc2hvdWxkIG5vdCBpbnRlcnJ1cHQgdGhlIFwiU2F2ZSBBc1wiIGZsb3csIHNvXG5cdFx0XHQvLyB3ZSBncmFjZWZ1bGx5IGNhdGNoIHRoZSBlcnJvciBhbmQganVzdCBsb2cgaXQuXG5cblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRzXG5cdFx0aWYgKHNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdHRoaXMudW50aXRsZWQubm90aWZ5RGlkU2F2ZShzb3VyY2UsIHRhcmdldCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRhcmdldDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TYXZlQXNUZXh0RmlsZShzb3VyY2VNb2RlbDogSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsIHwgSVJlc29sdmVkVW50aXRsZWRUZXh0RWRpdG9yTW9kZWwgfCBJVGV4dE1vZGVsLCBzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkksIG9wdGlvbnM/OiBJVGV4dEZpbGVTYXZlT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gRmluZCBzb3VyY2UgZW5jb2RpbmcgaWYgYW55XG5cdFx0bGV0IHNvdXJjZU1vZGVsRW5jb2Rpbmc6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzb3VyY2VNb2RlbFdpdGhFbmNvZGluZ1N1cHBvcnQgPSAoc291cmNlTW9kZWwgYXMgdW5rbm93biBhcyBJRW5jb2RpbmdTdXBwb3J0KTtcblx0XHRpZiAodHlwZW9mIHNvdXJjZU1vZGVsV2l0aEVuY29kaW5nU3VwcG9ydC5nZXRFbmNvZGluZyA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0c291cmNlTW9kZWxFbmNvZGluZyA9IHNvdXJjZU1vZGVsV2l0aEVuY29kaW5nU3VwcG9ydC5nZXRFbmNvZGluZygpO1xuXHRcdH1cblxuXHRcdC8vIFByZWZlciBhbiBleGlzdGluZyBtb2RlbCBpZiBpdCBpcyBhbHJlYWR5IHJlc29sdmVkIGZvciB0aGUgZ2l2ZW4gdGFyZ2V0IHJlc291cmNlXG5cdFx0bGV0IHRhcmdldEV4aXN0cyA9IGZhbHNlO1xuXHRcdGxldCB0YXJnZXRNb2RlbCA9IHRoaXMuZmlsZXMuZ2V0KHRhcmdldCk7XG5cdFx0aWYgKHRhcmdldE1vZGVsPy5pc1Jlc29sdmVkKCkpIHtcblx0XHRcdHRhcmdldEV4aXN0cyA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIGNyZWF0ZSB0aGUgdGFyZ2V0IGZpbGUgZW1wdHkgaWYgaXQgZG9lcyBub3QgZXhpc3QgYWxyZWFkeSBhbmQgcmVzb2x2ZSBpdCBmcm9tIHRoZXJlXG5cdFx0ZWxzZSB7XG5cdFx0XHR0YXJnZXRFeGlzdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh0YXJnZXQpO1xuXG5cdFx0XHQvLyBjcmVhdGUgdGFyZ2V0IGZpbGUgYWRob2MgaWYgaXQgZG9lcyBub3QgZXhpc3QgeWV0XG5cdFx0XHRpZiAoIXRhcmdldEV4aXN0cykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmNyZWF0ZShbeyByZXNvdXJjZTogdGFyZ2V0LCB2YWx1ZTogJycgfV0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0YXJnZXRNb2RlbCA9IGF3YWl0IHRoaXMuZmlsZXMucmVzb2x2ZSh0YXJnZXQsIHsgZW5jb2Rpbmc6IHNvdXJjZU1vZGVsRW5jb2RpbmcgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBpZiB0aGUgdGFyZ2V0IGFscmVhZHkgZXhpc3RzIGFuZCB3YXMgbm90IGNyZWF0ZWQgYnkgdXMsIGl0IGlzIHBvc3NpYmxlXG5cdFx0XHRcdC8vIHRoYXQgd2UgY2Fubm90IHJlc29sdmUgdGhlIHRhcmdldCBhcyB0ZXh0IG1vZGVsIGlmIGl0IGlzIGJpbmFyeSBvciB0b29cblx0XHRcdFx0Ly8gbGFyZ2UuIGluIHRoYXQgY2FzZSB3ZSBoYXZlIHRvIGRlbGV0ZSB0aGUgdGFyZ2V0IGZpbGUgZmlyc3QgYW5kIHRoZW5cblx0XHRcdFx0Ly8gcmUtcnVuIHRoZSBvcGVyYXRpb24uXG5cdFx0XHRcdGlmICh0YXJnZXRFeGlzdHMpIHtcblx0XHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0XHQoPFRleHRGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLnRleHRGaWxlT3BlcmF0aW9uUmVzdWx0ID09PSBUZXh0RmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX0lTX0JJTkFSWSB8fFxuXHRcdFx0XHRcdFx0KDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9UT09fTEFSR0Vcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHRhcmdldCk7XG5cblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmRvU2F2ZUFzVGV4dEZpbGUoc291cmNlTW9kZWwsIHNvdXJjZSwgdGFyZ2V0LCBvcHRpb25zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDb25maXJtIHRvIG92ZXJ3cml0ZSBpZiB3ZSBoYXZlIGFuIHVudGl0bGVkIGZpbGUgd2l0aCBhc3NvY2lhdGVkIGZpbGUgd2hlcmVcblx0XHQvLyB0aGUgZmlsZSBhY3R1YWxseSBleGlzdHMgb24gZGlzayBhbmQgd2UgYXJlIGluc3RydWN0ZWQgdG8gc2F2ZSB0byB0aGF0IGZpbGVcblx0XHQvLyBwYXRoLiBUaGlzIGNhbiBoYXBwZW4gaWYgdGhlIGZpbGUgd2FzIGNyZWF0ZWQgYWZ0ZXIgdGhlIHVudGl0bGVkIGZpbGUgd2FzIG9wZW5lZC5cblx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzY3OTQ2XG5cdFx0bGV0IHdyaXRlOiBib29sZWFuO1xuXHRcdGlmIChzb3VyY2VNb2RlbCBpbnN0YW5jZW9mIFVudGl0bGVkVGV4dEVkaXRvck1vZGVsICYmIHNvdXJjZU1vZGVsLmhhc0Fzc29jaWF0ZWRGaWxlUGF0aCAmJiB0YXJnZXRFeGlzdHMgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwodGFyZ2V0LCB0b0xvY2FsUmVzb3VyY2Uoc291cmNlTW9kZWwucmVzb3VyY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSwgdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lKSkpIHtcblx0XHRcdHdyaXRlID0gYXdhaXQgdGhpcy5jb25maXJtT3ZlcndyaXRlKHRhcmdldCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHdyaXRlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoIXdyaXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IHNvdXJjZVRleHRNb2RlbDogSVRleHRNb2RlbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoc291cmNlTW9kZWwgaW5zdGFuY2VvZiBCYXNlVGV4dEVkaXRvck1vZGVsKSB7XG5cdFx0XHRpZiAoc291cmNlTW9kZWwuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHRcdHNvdXJjZVRleHRNb2RlbCA9IHNvdXJjZU1vZGVsLnRleHRFZGl0b3JNb2RlbCA/PyB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNvdXJjZVRleHRNb2RlbCA9IHNvdXJjZU1vZGVsIGFzIElUZXh0TW9kZWw7XG5cdFx0fVxuXG5cdFx0bGV0IHRhcmdldFRleHRNb2RlbDogSVRleHRNb2RlbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGFyZ2V0TW9kZWwuaXNSZXNvbHZlZCgpKSB7XG5cdFx0XHR0YXJnZXRUZXh0TW9kZWwgPSB0YXJnZXRNb2RlbC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0fVxuXG5cdFx0Ly8gdGFrZSBvdmVyIG1vZGVsIHZhbHVlLCBlbmNvZGluZyBhbmQgbGFuZ3VhZ2UgKG9ubHkgaWYgbW9yZSBzcGVjaWZpYykgZnJvbSBzb3VyY2UgbW9kZWxcblx0XHRpZiAoc291cmNlVGV4dE1vZGVsICYmIHRhcmdldFRleHRNb2RlbCkge1xuXG5cdFx0XHQvLyBlbmNvZGluZ1xuXHRcdFx0dGFyZ2V0TW9kZWwudXBkYXRlUHJlZmVycmVkRW5jb2Rpbmcoc291cmNlTW9kZWxFbmNvZGluZyk7XG5cblx0XHRcdC8vIGNvbnRlbnRcblx0XHRcdHRoaXMubW9kZWxTZXJ2aWNlLnVwZGF0ZU1vZGVsKHRhcmdldFRleHRNb2RlbCwgY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnlGcm9tU25hcHNob3Qoc291cmNlVGV4dE1vZGVsLmNyZWF0ZVNuYXBzaG90KCkpKTtcblxuXHRcdFx0Ly8gbGFuZ3VhZ2Vcblx0XHRcdGNvbnN0IHNvdXJjZUxhbmd1YWdlSWQgPSBzb3VyY2VUZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0TGFuZ3VhZ2VJZCA9IHRhcmdldFRleHRNb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHRpZiAoc291cmNlTGFuZ3VhZ2VJZCAhPT0gUExBSU5URVhUX0xBTkdVQUdFX0lEICYmIHRhcmdldExhbmd1YWdlSWQgPT09IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCkge1xuXHRcdFx0XHR0YXJnZXRUZXh0TW9kZWwuc2V0TGFuZ3VhZ2Uoc291cmNlTGFuZ3VhZ2VJZCk7IC8vIG9ubHkgdXNlIGlmIG1vcmUgc3BlY2lmaWMgdGhhbiBwbGFpbi90ZXh0XG5cdFx0XHR9XG5cblx0XHRcdC8vIGluZGVudGF0aW9uIG9wdGlvbnMgKHByZXNlcnZlIHRhYnMgdnMgc3BhY2VzLCB0YWIgc2l6ZSwgaW5kZW50IHNpemUpXG5cdFx0XHRjb25zdCBzb3VyY2VPcHRpb25zID0gc291cmNlVGV4dE1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRcdHRhcmdldFRleHRNb2RlbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0dGFiU2l6ZTogc291cmNlT3B0aW9ucy50YWJTaXplLFxuXHRcdFx0XHRpbmRlbnRTaXplOiBzb3VyY2VPcHRpb25zLmluZGVudFNpemUsXG5cdFx0XHRcdGluc2VydFNwYWNlczogc291cmNlT3B0aW9ucy5pbnNlcnRTcGFjZXNcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBlbmQgb2YgbGluZSBzZXF1ZW5jZSAocHJlc2VydmUgTEYgdnMgQ1JMRilcblx0XHRcdGNvbnN0IHNvdXJjZUVPTCA9IHNvdXJjZVRleHRNb2RlbC5nZXRFbmRPZkxpbmVTZXF1ZW5jZSgpO1xuXHRcdFx0dGFyZ2V0VGV4dE1vZGVsLnNldEVPTChzb3VyY2VFT0wpO1xuXG5cdFx0XHQvLyB0cmFuc2llbnQgcHJvcGVydGllc1xuXHRcdFx0Y29uc3Qgc291cmNlVHJhbnNpZW50UHJvcGVydGllcyA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UuZ2V0VHJhbnNpZW50TW9kZWxQcm9wZXJ0aWVzKHNvdXJjZVRleHRNb2RlbCk7XG5cdFx0XHRpZiAoc291cmNlVHJhbnNpZW50UHJvcGVydGllcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBzb3VyY2VUcmFuc2llbnRQcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdFx0dGhpcy5jb2RlRWRpdG9yU2VydmljZS5zZXRUcmFuc2llbnRNb2RlbFByb3BlcnR5KHRhcmdldFRleHRNb2RlbCwga2V5LCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBzZXQgc291cmNlIG9wdGlvbnMgZGVwZW5kaW5nIG9uIHRhcmdldCBleGlzdHMgb3Igbm90XG5cdFx0aWYgKCFvcHRpb25zPy5zb3VyY2UpIHtcblx0XHRcdG9wdGlvbnMgPSB7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdHNvdXJjZTogdGFyZ2V0RXhpc3RzID8gQWJzdHJhY3RUZXh0RmlsZVNlcnZpY2UuVEVYVEZJTEVfU0FWRV9SRVBMQUNFX1NPVVJDRSA6IEFic3RyYWN0VGV4dEZpbGVTZXJ2aWNlLlRFWFRGSUxFX1NBVkVfQ1JFQVRFX1NPVVJDRVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBzYXZlIG1vZGVsXG5cdFx0cmV0dXJuIHRhcmdldE1vZGVsLnNhdmUoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGZyb206IHNvdXJjZVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtT3ZlcndyaXRlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1PdmVyd3JpdGUnLCBcIid7MH0nIGFscmVhZHkgZXhpc3RzLiBEbyB5b3Ugd2FudCB0byByZXBsYWNlIGl0P1wiLCBiYXNlbmFtZShyZXNvdXJjZSkpLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnb3ZlcndyaXRlSXJyZXZlcnNpYmxlJywgXCJBIGZpbGUgb3IgZm9sZGVyIHdpdGggdGhlIG5hbWUgJ3swfScgYWxyZWFkeSBleGlzdHMgaW4gdGhlIGZvbGRlciAnezF9Jy4gUmVwbGFjaW5nIGl0IHdpbGwgb3ZlcndyaXRlIGl0cyBjdXJyZW50IGNvbnRlbnRzLlwiLCBiYXNlbmFtZShyZXNvdXJjZSksIGJhc2VuYW1lKGRpcm5hbWUocmVzb3VyY2UpKSksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ3JlcGxhY2VCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlcGxhY2VcIiksXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gY29uZmlybWVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtTWFrZVdyaXRlYWJsZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtTWFrZVdyaXRlYWJsZScsIFwiJ3swfScgaXMgbWFya2VkIGFzIHJlYWQtb25seS4gRG8geW91IHdhbnQgdG8gc2F2ZSBhbnl3YXk/XCIsIGJhc2VuYW1lKHJlc291cmNlKSksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtTWFrZVdyaXRlYWJsZURldGFpbCcsIFwiUGF0aHMgY2FuIGJlIGNvbmZpZ3VyZWQgYXMgcmVhZC1vbmx5IHZpYSBzZXR0aW5ncy5cIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ21ha2VXcml0ZWFibGVCdXR0b25MYWJlbCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNhdmUgQW55d2F5XCIpXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gY29uZmlybWVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdWdnZXN0U2F2ZVBhdGgocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VVJJPiB7XG5cblx0XHQvLyBKdXN0IHRha2UgdGhlIHJlc291cmNlIGFzIGlzIGlmIHRoZSBmaWxlIHNlcnZpY2UgY2FuIGhhbmRsZSBpdFxuXHRcdGlmICh0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRjb25zdCBkZWZhdWx0RmlsZVBhdGggPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLmRlZmF1bHRGaWxlUGF0aCgpO1xuXG5cdFx0Ly8gT3RoZXJ3aXNlIHRyeSB0byBzdWdnZXN0IGEgcGF0aCB0aGF0IGNhbiBiZSBzYXZlZFxuXHRcdGxldCBzdWdnZXN0ZWRGaWxlbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy51bnRpdGxlZC5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cblx0XHRcdFx0Ly8gVW50aXRsZWQgd2l0aCBhc3NvY2lhdGVkIGZpbGUgcGF0aFxuXHRcdFx0XHRpZiAobW9kZWwuaGFzQXNzb2NpYXRlZEZpbGVQYXRoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRvTG9jYWxSZXNvdXJjZShyZXNvdXJjZSwgcmVtb3RlQXV0aG9yaXR5LCB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVW50aXRsZWQgd2l0aG91dCBhc3NvY2lhdGVkIGZpbGUgcGF0aDogdXNlIG5hbWVcblx0XHRcdFx0Ly8gb2YgdW50aXRsZWQgbW9kZWwgaWYgaXQgaXMgYSB2YWxpZCBwYXRoIG5hbWUgYW5kXG5cdFx0XHRcdC8vIGZpZ3VyZSBvdXQgdGhlIGZpbGUgZXh0ZW5zaW9uIGZyb20gdGhlIG1vZGUgaWYgYW55LlxuXG5cdFx0XHRcdGxldCBuYW1lQ2FuZGlkYXRlOiBzdHJpbmc7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLmhhc1ZhbGlkQmFzZW5hbWUoam9pblBhdGgoZGVmYXVsdEZpbGVQYXRoLCBtb2RlbC5uYW1lKSwgbW9kZWwubmFtZSkpIHtcblx0XHRcdFx0XHRuYW1lQ2FuZGlkYXRlID0gbW9kZWwubmFtZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRuYW1lQ2FuZGlkYXRlID0gYmFzZW5hbWUocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IG1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdFx0aWYgKGxhbmd1YWdlSWQgJiYgbGFuZ3VhZ2VJZCAhPT0gUExBSU5URVhUX0xBTkdVQUdFX0lEKSB7XG5cdFx0XHRcdFx0c3VnZ2VzdGVkRmlsZW5hbWUgPSB0aGlzLnN1Z2dlc3RGaWxlbmFtZShsYW5ndWFnZUlkLCBuYW1lQ2FuZGlkYXRlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdWdnZXN0ZWRGaWxlbmFtZSA9IG5hbWVDYW5kaWRhdGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGYWxsYmFjayB0byBiYXNlbmFtZSBvZiByZXNvdXJjZVxuXHRcdGlmICghc3VnZ2VzdGVkRmlsZW5hbWUpIHtcblx0XHRcdHN1Z2dlc3RlZEZpbGVuYW1lID0gYmFzZW5hbWUocmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdC8vIFRyeSB0byBwbGFjZSB3aGVyZSBsYXN0IGFjdGl2ZSBmaWxlIHdhcyBpZiBhbnlcblx0XHQvLyBPdGhlcndpc2UgZmFsbGJhY2sgdG8gdXNlciBob21lXG5cdFx0cmV0dXJuIGpvaW5QYXRoKGRlZmF1bHRGaWxlUGF0aCwgc3VnZ2VzdGVkRmlsZW5hbWUpO1xuXHR9XG5cblx0c3VnZ2VzdEZpbGVuYW1lKGxhbmd1YWdlSWQ6IHN0cmluZywgdW50aXRsZWROYW1lOiBzdHJpbmcpIHtcblx0XHRjb25zdCBsYW5ndWFnZU5hbWUgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobGFuZ3VhZ2VJZCk7XG5cdFx0aWYgKCFsYW5ndWFnZU5hbWUpIHtcblx0XHRcdHJldHVybiB1bnRpdGxlZE5hbWU7IC8vIHVua25vd24gbGFuZ3VhZ2UsIHNvIHdlIGNhbm5vdCBzdWdnZXN0IGEgYmV0dGVyIG5hbWVcblx0XHR9XG5cblx0XHRjb25zdCB1bnRpdGxlZEV4dGVuc2lvbiA9IHBhdGhFeHRuYW1lKHVudGl0bGVkTmFtZSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhsYW5ndWFnZUlkKTtcblx0XHRpZiAoZXh0ZW5zaW9ucy5pbmNsdWRlcyh1bnRpdGxlZEV4dGVuc2lvbikpIHtcblx0XHRcdHJldHVybiB1bnRpdGxlZE5hbWU7IC8vIHByZXNlcnZlIGV4dGVuc2lvbiBpZiBpdCBpcyBjb21wYXRpYmxlIHdpdGggdGhlIG1vZGVcblx0XHR9XG5cblx0XHRjb25zdCBwcmltYXJ5RXh0ZW5zaW9uID0gZXh0ZW5zaW9ucy5hdCgwKTtcblx0XHRpZiAocHJpbWFyeUV4dGVuc2lvbikge1xuXHRcdFx0aWYgKHVudGl0bGVkRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdHJldHVybiBgJHt1bnRpdGxlZE5hbWUuc3Vic3RyaW5nKDAsIHVudGl0bGVkTmFtZS5pbmRleE9mKHVudGl0bGVkRXh0ZW5zaW9uKSl9JHtwcmltYXJ5RXh0ZW5zaW9ufWA7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBgJHt1bnRpdGxlZE5hbWV9JHtwcmltYXJ5RXh0ZW5zaW9ufWA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZW5hbWVzID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0RmlsZW5hbWVzKGxhbmd1YWdlSWQpO1xuXHRcdGlmIChmaWxlbmFtZXMuaW5jbHVkZXModW50aXRsZWROYW1lKSkge1xuXHRcdFx0cmV0dXJuIHVudGl0bGVkTmFtZTsgLy8gcHJlc2VydmUgbmFtZSBpZiBpdCBpcyBjb21wYXRpYmxlIHdpdGggdGhlIG1vZGVcblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsZW5hbWVzLmF0KDApID8/IHVudGl0bGVkTmFtZTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiByZXZlcnRcblxuXHRhc3luYyByZXZlcnQocmVzb3VyY2U6IFVSSSwgb3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBVbnRpdGxlZFxuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy51bnRpdGxlZC5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBtb2RlbC5yZXZlcnQob3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlsZVxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmZpbGVzLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAobW9kZWwgJiYgKG1vZGVsLmlzRGlydHkoKSB8fCBvcHRpb25zPy5mb3JjZSkpIHtcblx0XHRcdFx0cmV0dXJuIG1vZGVsLnJldmVydChvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gZGlydHlcblxuXHRpc0RpcnR5KHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCBtb2RlbCA9IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCA/IHRoaXMudW50aXRsZWQuZ2V0KHJlc291cmNlKSA6IHRoaXMuZmlsZXMuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHJldHVybiBtb2RlbC5pc0RpcnR5KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVuY29kaW5nT3ZlcnJpZGUge1xuXHRwYXJlbnQ/OiBVUkk7XG5cdGV4dGVuc2lvbj86IHN0cmluZztcblx0ZW5jb2Rpbmc6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEVuY29kaW5nT3JhY2xlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElSZXNvdXJjZUVuY29kaW5ncyB7XG5cblx0cHJpdmF0ZSBfZW5jb2RpbmdPdmVycmlkZXM6IElFbmNvZGluZ092ZXJyaWRlW107XG5cdHByb3RlY3RlZCBnZXQgZW5jb2RpbmdPdmVycmlkZXMoKTogSUVuY29kaW5nT3ZlcnJpZGVbXSB7IHJldHVybiB0aGlzLl9lbmNvZGluZ092ZXJyaWRlczsgfVxuXHRwcm90ZWN0ZWQgc2V0IGVuY29kaW5nT3ZlcnJpZGVzKHZhbHVlOiBJRW5jb2RpbmdPdmVycmlkZVtdKSB7IHRoaXMuX2VuY29kaW5nT3ZlcnJpZGVzID0gdmFsdWU7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZW5jb2RpbmdPdmVycmlkZXMgPSB0aGlzLmdldERlZmF1bHRFbmNvZGluZ092ZXJyaWRlcygpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIFdvcmtzcGFjZSBGb2xkZXIgQ2hhbmdlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy5lbmNvZGluZ092ZXJyaWRlcyA9IHRoaXMuZ2V0RGVmYXVsdEVuY29kaW5nT3ZlcnJpZGVzKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVmYXVsdEVuY29kaW5nT3ZlcnJpZGVzKCk6IElFbmNvZGluZ092ZXJyaWRlW10ge1xuXHRcdGNvbnN0IGRlZmF1bHRFbmNvZGluZ092ZXJyaWRlczogSUVuY29kaW5nT3ZlcnJpZGVbXSA9IFtdO1xuXG5cdFx0Ly8gR2xvYmFsIHNldHRpbmdzXG5cdFx0ZGVmYXVsdEVuY29kaW5nT3ZlcnJpZGVzLnB1c2goeyBwYXJlbnQ6IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJSb2FtaW5nRGF0YUhvbWUsIGVuY29kaW5nOiBVVEY4IH0pO1xuXG5cdFx0Ly8gV29ya3NwYWNlIGZpbGVzICh2aWEgZXh0ZW5zaW9uIGFuZCB2aWEgdW50aXRsZWQgd29ya3NwYWNlcyBsb2NhdGlvbilcblx0XHRkZWZhdWx0RW5jb2RpbmdPdmVycmlkZXMucHVzaCh7IGV4dGVuc2lvbjogV09SS1NQQUNFX0VYVEVOU0lPTiwgZW5jb2Rpbmc6IFVURjggfSk7XG5cdFx0ZGVmYXVsdEVuY29kaW5nT3ZlcnJpZGVzLnB1c2goeyBwYXJlbnQ6IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVudGl0bGVkV29ya3NwYWNlc0hvbWUsIGVuY29kaW5nOiBVVEY4IH0pO1xuXG5cdFx0Ly8gRm9sZGVyIFNldHRpbmdzXG5cdFx0dGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmZvckVhY2goZm9sZGVyID0+IHtcblx0XHRcdGRlZmF1bHRFbmNvZGluZ092ZXJyaWRlcy5wdXNoKHsgcGFyZW50OiBqb2luUGF0aChmb2xkZXIudXJpLCAnLnZzY29kZScpLCBlbmNvZGluZzogVVRGOCB9KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBkZWZhdWx0RW5jb2RpbmdPdmVycmlkZXM7XG5cdH1cblxuXHRhc3luYyBnZXRXcml0ZUVuY29kaW5nKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJV3JpdGVUZXh0RmlsZU9wdGlvbnMpOiBQcm9taXNlPHsgZW5jb2Rpbmc6IHN0cmluZzsgYWRkQk9NOiBib29sZWFuIH0+IHtcblx0XHRjb25zdCB7IGVuY29kaW5nLCBoYXNCT00gfSA9IGF3YWl0IHRoaXMuZ2V0UHJlZmVycmVkV3JpdGVFbmNvZGluZyhyZXNvdXJjZSwgb3B0aW9ucyA/IG9wdGlvbnMuZW5jb2RpbmcgOiB1bmRlZmluZWQpO1xuXG5cdFx0cmV0dXJuIHsgZW5jb2RpbmcsIGFkZEJPTTogaGFzQk9NIH07XG5cdH1cblxuXHRhc3luYyBnZXRQcmVmZXJyZWRXcml0ZUVuY29kaW5nKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHByZWZlcnJlZEVuY29kaW5nPzogc3RyaW5nKTogUHJvbWlzZTxJUmVzb3VyY2VFbmNvZGluZz4ge1xuXHRcdGNvbnN0IHJlc291cmNlRW5jb2RpbmcgPSBhd2FpdCB0aGlzLmdldFZhbGlkYXRlZEVuY29kaW5nRm9yUmVzb3VyY2UocmVzb3VyY2UsIHByZWZlcnJlZEVuY29kaW5nKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbmNvZGluZzogcmVzb3VyY2VFbmNvZGluZyxcblx0XHRcdGhhc0JPTTogcmVzb3VyY2VFbmNvZGluZyA9PT0gVVRGMTZiZSB8fCByZXNvdXJjZUVuY29kaW5nID09PSBVVEYxNmxlIHx8IHJlc291cmNlRW5jb2RpbmcgPT09IFVURjhfd2l0aF9ib20gLy8gZW5mb3JjZSBCT00gZm9yIGNlcnRhaW4gZW5jb2RpbmdzXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGdldFByZWZlcnJlZFJlYWRFbmNvZGluZyhyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSVJlYWRUZXh0RmlsZUVuY29kaW5nT3B0aW9ucywgZGV0ZWN0ZWRFbmNvZGluZz86IHN0cmluZyk6IFByb21pc2U8SVJlc291cmNlRW5jb2Rpbmc+IHtcblx0XHRsZXQgcHJlZmVycmVkRW5jb2Rpbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIEVuY29kaW5nIHBhc3NlZCBpbiBhcyBvcHRpb25cblx0XHRpZiAob3B0aW9ucz8uZW5jb2RpbmcpIHtcblx0XHRcdGlmIChkZXRlY3RlZEVuY29kaW5nID09PSBVVEY4X3dpdGhfYm9tICYmIG9wdGlvbnMuZW5jb2RpbmcgPT09IFVURjgpIHtcblx0XHRcdFx0cHJlZmVycmVkRW5jb2RpbmcgPSBVVEY4X3dpdGhfYm9tOyAvLyBpbmRpY2F0ZSB0aGUgZmlsZSBoYXMgQk9NIGlmIHdlIGFyZSB0byByZXNvbHZlIHdpdGggVVRGIDhcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByZWZlcnJlZEVuY29kaW5nID0gb3B0aW9ucy5lbmNvZGluZzsgLy8gZ2l2ZSBwYXNzZWQgaW4gZW5jb2RpbmcgaGlnaGVzdCBwcmlvcml0eVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEVuY29kaW5nIGRldGVjdGVkXG5cdFx0ZWxzZSBpZiAodHlwZW9mIGRldGVjdGVkRW5jb2RpbmcgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRwcmVmZXJyZWRFbmNvZGluZyA9IGRldGVjdGVkRW5jb2Rpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gRW5jb2RpbmcgY29uZmlndXJlZFxuXHRcdGVsc2UgaWYgKHRoaXMudGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUocmVzb3VyY2UsICdmaWxlcy5lbmNvZGluZycpID09PSBVVEY4X3dpdGhfYm9tKSB7XG5cdFx0XHRwcmVmZXJyZWRFbmNvZGluZyA9IFVURjg7IC8vIGlmIHdlIGRpZCBub3QgZGV0ZWN0IFVURiA4IEJPTSBiZWZvcmUsIHRoaXMgY2FuIG9ubHkgYmUgVVRGIDggdGhlblxuXHRcdH1cblxuXHRcdGNvbnN0IGVuY29kaW5nID0gYXdhaXQgdGhpcy5nZXRWYWxpZGF0ZWRFbmNvZGluZ0ZvclJlc291cmNlKHJlc291cmNlLCBwcmVmZXJyZWRFbmNvZGluZyk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5jb2RpbmcsXG5cdFx0XHRoYXNCT006IGVuY29kaW5nID09PSBVVEYxNmJlIHx8IGVuY29kaW5nID09PSBVVEYxNmxlIHx8IGVuY29kaW5nID09PSBVVEY4X3dpdGhfYm9tIC8vIGVuZm9yY2UgQk9NIGZvciBjZXJ0YWluIGVuY29kaW5nc1xuXHRcdH07XG5cdH1cblxuXHRnZXRVbnZhbGlkYXRlZEVuY29kaW5nRm9yUmVzb3VyY2UocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgcHJlZmVycmVkRW5jb2Rpbmc/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGxldCBmaWxlRW5jb2Rpbmc6IHN0cmluZztcblxuXHRcdGNvbnN0IG92ZXJyaWRlID0gdGhpcy5nZXRFbmNvZGluZ092ZXJyaWRlKHJlc291cmNlKTtcblx0XHRpZiAob3ZlcnJpZGUpIHtcblx0XHRcdGZpbGVFbmNvZGluZyA9IG92ZXJyaWRlOyAvLyBlbmNvZGluZyBvdmVycmlkZSBhbHdheXMgd2luc1xuXHRcdH0gZWxzZSBpZiAocHJlZmVycmVkRW5jb2RpbmcpIHtcblx0XHRcdGZpbGVFbmNvZGluZyA9IHByZWZlcnJlZEVuY29kaW5nOyAvLyBwcmVmZXJyZWQgZW5jb2RpbmcgY29tZXMgc2Vjb25kXG5cdFx0fSBlbHNlIHtcblx0XHRcdGZpbGVFbmNvZGluZyA9IHRoaXMudGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUocmVzb3VyY2UsICdmaWxlcy5lbmNvZGluZycpOyAvLyBhbmQgbGFzdCB3ZSBjaGVjayBmb3Igc2V0dGluZ3Ncblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsZUVuY29kaW5nIHx8IFVURjg7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFZhbGlkYXRlZEVuY29kaW5nRm9yUmVzb3VyY2UocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgcHJlZmVycmVkRW5jb2Rpbmc/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGxldCBmaWxlRW5jb2RpbmcgPSB0aGlzLmdldFVudmFsaWRhdGVkRW5jb2RpbmdGb3JSZXNvdXJjZShyZXNvdXJjZSwgcHJlZmVycmVkRW5jb2RpbmcpO1xuXHRcdGlmIChmaWxlRW5jb2RpbmcgIT09IFVURjggJiYgIShhd2FpdCBlbmNvZGluZ0V4aXN0cyhmaWxlRW5jb2RpbmcpKSkge1xuXHRcdFx0ZmlsZUVuY29kaW5nID0gVVRGODtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsZUVuY29kaW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFbmNvZGluZ092ZXJyaWRlKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChyZXNvdXJjZSAmJiB0aGlzLmVuY29kaW5nT3ZlcnJpZGVzPy5sZW5ndGgpIHtcblx0XHRcdGZvciAoY29uc3Qgb3ZlcnJpZGUgb2YgdGhpcy5lbmNvZGluZ092ZXJyaWRlcykge1xuXG5cdFx0XHRcdC8vIGNoZWNrIGlmIHRoZSByZXNvdXJjZSBpcyBjaGlsZCBvZiBlbmNvZGluZyBvdmVycmlkZSBwYXRoXG5cdFx0XHRcdGlmIChvdmVycmlkZS5wYXJlbnQgJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgb3ZlcnJpZGUucGFyZW50KSkge1xuXHRcdFx0XHRcdHJldHVybiBvdmVycmlkZS5lbmNvZGluZztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGNoZWNrIGlmIHRoZSByZXNvdXJjZSBleHRlbnNpb24gaXMgZXF1YWwgdG8gZW5jb2Rpbmcgb3ZlcnJpZGVcblx0XHRcdFx0aWYgKG92ZXJyaWRlLmV4dGVuc2lvbiAmJiBleHRuYW1lKHJlc291cmNlKSA9PT0gYC4ke292ZXJyaWRlLmV4dGVuc2lvbn1gKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG92ZXJyaWRlLmVuY29kaW5nO1xuXHRcdFx0XHR9XG5c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
