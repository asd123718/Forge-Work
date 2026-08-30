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
import "./media/searchEditor.css";
import { Emitter } from "../../../../base/common/event.js";
import { basename } from "../../../../base/common/path.js";
import { extname, isEqual, joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { TrackedRangeStickiness } from "../../../../editor/common/model.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { localize } from "../../../../nls.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { EditorResourceAccessor, EditorInputCapabilities } from "../../../common/editor.js";
import { Memento } from "../../../common/memento.js";
import { SearchEditorFindMatchClass, SearchEditorInputTypeId, SearchEditorScheme, SearchEditorWorkingCopyTypeId } from "./constants.js";
import { SearchEditorModel, searchEditorModelFactory } from "./searchEditorModel.js";
import { defaultSearchConfig, parseSavedSearchEditor, serializeSearchConfiguration } from "./searchEditorSerialization.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { WorkingCopyCapabilities } from "../../../services/workingCopy/common/workingCopy.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { bufferToReadable, VSBuffer } from "../../../../base/common/buffer.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
const SEARCH_EDITOR_EXT = ".code-search";
const SearchEditorIcon = registerIcon("search-editor-label-icon", Codicon.search, localize("searchEditorLabelIcon", "Icon of the search editor label."));
let SearchEditorInput = class extends EditorInput {
  constructor(modelUri, backingUri, modelService, textFileService, fileDialogService, instantiationService, workingCopyService, telemetryService, pathService, storageService) {
    super();
    this.modelUri = modelUri;
    this.backingUri = backingUri;
    this.modelService = modelService;
    this.textFileService = textFileService;
    this.fileDialogService = fileDialogService;
    this.instantiationService = instantiationService;
    this.workingCopyService = workingCopyService;
    this.telemetryService = telemetryService;
    this.pathService = pathService;
    this.dirty = false;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidSave = this._register(new Emitter());
    this.onDidSave = this._onDidSave.event;
    this.oldDecorationsIDs = [];
    this.model = instantiationService.createInstance(SearchEditorModel, modelUri);
    if (this.modelUri.scheme !== SearchEditorScheme) {
      throw Error("SearchEditorInput must be invoked with a SearchEditorScheme uri");
    }
    this.memento = new Memento(SearchEditorInput.ID, storageService);
    this._register(storageService.onWillSaveState(() => this.memento.saveMemento()));
    const input = this;
    const workingCopyAdapter = new class {
      constructor() {
        this.typeId = SearchEditorWorkingCopyTypeId;
        this.resource = input.modelUri;
        this.capabilities = input.hasCapability(EditorInputCapabilities.Untitled) ? WorkingCopyCapabilities.Untitled : WorkingCopyCapabilities.None;
        this.onDidChangeDirty = input.onDidChangeDirty;
        this.onDidChangeContent = input.onDidChangeContent;
        this.onDidSave = input.onDidSave;
      }
      get name() {
        return input.getName();
      }
      isDirty() {
        return input.isDirty();
      }
      isModified() {
        return input.isDirty();
      }
      backup(token) {
        return input.backup(token);
      }
      save(options) {
        return input.save(0, options).then((editor) => !!editor);
      }
      revert(options) {
        return input.revert(0, options);
      }
    }();
    this._register(this.workingCopyService.registerWorkingCopy(workingCopyAdapter));
  }
  get typeId() {
    return SearchEditorInput.ID;
  }
  get editorId() {
    return this.typeId;
  }
  getIcon() {
    return SearchEditorIcon;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.None;
    if (!this.backingUri) {
      capabilities |= EditorInputCapabilities.Untitled;
    }
    return capabilities;
  }
  get resource() {
    return this.backingUri || this.modelUri;
  }
  async save(group, options) {
    if ((await this.resolveModels()).resultsModel.isDisposed()) {
      return;
    }
    if (this.backingUri) {
      await this.textFileService.write(this.backingUri, await this.serializeForDisk(), options);
      this.setDirty(false);
      this._onDidSave.fire({ reason: options?.reason, source: options?.source });
      return this;
    } else {
      return this.saveAs(group, options);
    }
  }
  tryReadConfigSync() {
    return this._cachedConfigurationModel?.config;
  }
  async serializeForDisk() {
    const { configurationModel, resultsModel } = await this.resolveModels();
    return serializeSearchConfiguration(configurationModel.config) + "\n" + resultsModel.getValue();
  }
  registerConfigChangeListeners(model) {
    this.configChangeListenerDisposable?.dispose();
    if (!this.isDisposed()) {
      this.configChangeListenerDisposable = model.onConfigDidUpdate(() => {
        if (this.lastLabel !== this.getName()) {
          this._onDidChangeLabel.fire();
          this.lastLabel = this.getName();
        }
        this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).searchConfig = model.config;
      });
      this._register(this.configChangeListenerDisposable);
    }
  }
  async resolveModels() {
    return this.model.resolve().then((data) => {
      this._cachedResultsModel = data.resultsModel;
      this._cachedConfigurationModel = data.configurationModel;
      if (this.lastLabel !== this.getName()) {
        this._onDidChangeLabel.fire();
        this.lastLabel = this.getName();
      }
      this.registerConfigChangeListeners(data.configurationModel);
      return data;
    });
  }
  async saveAs(group, options) {
    const path = await this.fileDialogService.pickFileToSave(await this.suggestFileName(), options?.availableFileSystems);
    if (path) {
      this.telemetryService.publicLog2("searchEditor/saveSearchResults");
      const toWrite = await this.serializeForDisk();
      if (await this.textFileService.create([{ resource: path, value: toWrite, options: { overwrite: true } }])) {
        this.setDirty(false);
        if (!isEqual(path, this.modelUri)) {
          const input = this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { fileUri: path, from: "existingFile" });
          input.setMatchRanges(this.getMatchRanges());
          return input;
        }
        return this;
      }
    }
    return void 0;
  }
  getName(maxLength = 12) {
    const trimToMax = (label) => label.length < maxLength ? label : `${label.slice(0, maxLength - 3)}...`;
    if (this.backingUri) {
      const originalURI = EditorResourceAccessor.getOriginalUri(this);
      return localize("searchTitle.withQuery", "Search: {0}", basename((originalURI ?? this.backingUri).path, SEARCH_EDITOR_EXT));
    }
    const query = this._cachedConfigurationModel?.config?.query?.trim();
    if (query) {
      return localize("searchTitle.withQuery", "Search: {0}", trimToMax(query));
    }
    return localize("searchTitle", "Search");
  }
  setDirty(dirty) {
    const wasDirty = this.dirty;
    this.dirty = dirty;
    if (wasDirty !== dirty) {
      this._onDidChangeDirty.fire();
    }
  }
  isDirty() {
    return this.dirty;
  }
  async rename(group, target) {
    if (extname(target) === SEARCH_EDITOR_EXT) {
      return {
        editor: this.instantiationService.invokeFunction(getOrMakeSearchEditorInput, { from: "existingFile", fileUri: target })
      };
    }
    return void 0;
  }
  dispose() {
    this.modelService.destroyModel(this.modelUri);
    super.dispose();
  }
  matches(other) {
    if (super.matches(other)) {
      return true;
    }
    if (other instanceof SearchEditorInput) {
      return !!(other.modelUri.fragment && other.modelUri.fragment === this.modelUri.fragment) || !!(other.backingUri && isEqual(other.backingUri, this.backingUri));
    }
    return false;
  }
  getMatchRanges() {
    return (this._cachedResultsModel?.getAllDecorations() ?? []).filter((decoration) => decoration.options.className === SearchEditorFindMatchClass).filter(({ range }) => !(range.startColumn === 1 && range.endColumn === 1)).map(({ range }) => range);
  }
  async setMatchRanges(ranges) {
    this.oldDecorationsIDs = (await this.resolveModels()).resultsModel.deltaDecorations(this.oldDecorationsIDs, ranges.map((range) => ({ range, options: { description: "search-editor-find-match", className: SearchEditorFindMatchClass, stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));
  }
  async revert(group, options) {
    if (options?.soft) {
      this.setDirty(false);
      return;
    }
    if (this.backingUri) {
      const { config, text } = await this.instantiationService.invokeFunction(parseSavedSearchEditor, this.backingUri);
      const { resultsModel, configurationModel } = await this.resolveModels();
      resultsModel.setValue(text);
      configurationModel.updateConfig(config);
    } else {
      (await this.resolveModels()).resultsModel.setValue("");
    }
    super.revert(group, options);
    this.setDirty(false);
  }
  async backup(token) {
    const contents = await this.serializeForDisk();
    if (token.isCancellationRequested) {
      return {};
    }
    return {
      content: bufferToReadable(VSBuffer.fromString(contents))
    };
  }
  async suggestFileName() {
    const query = (await this.resolveModels()).configurationModel.config.query;
    const searchFileName = (query.replace(/[^\w \-_]+/g, "_") || "Search") + SEARCH_EDITOR_EXT;
    return joinPath(await this.fileDialogService.defaultFilePath(this.pathService.defaultUriScheme), searchFileName);
  }
  toUntyped() {
    if (this.hasCapability(EditorInputCapabilities.Untitled)) {
      return void 0;
    }
    return {
      resource: this.resource,
      options: {
        override: SearchEditorInput.ID
      }
    };
  }
  copy() {
    const newModelUri = URI.from({ scheme: SearchEditorScheme, fragment: `${Math.random()}` });
    const config = this._cachedConfigurationModel?.config ?? {};
    const results = this._cachedResultsModel?.getValue() ?? "";
    return this.instantiationService.invokeFunction(
      getOrMakeSearchEditorInput,
      // eslint-disable-next-line local/code-no-any-casts
      { from: "rawData", config, resultsContents: results, modelUri: newModelUri }
      // modelUri is not in the type, but we handle it below
    );
  }
};
SearchEditorInput.ID = SearchEditorInputTypeId;
SearchEditorInput = __decorateClass([
  __decorateParam(2, IModelService),
  __decorateParam(3, ITextFileService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IWorkingCopyService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IPathService),
  __decorateParam(9, IStorageService)
], SearchEditorInput);
const getOrMakeSearchEditorInput = (accessor, existingData) => {
  const storageService = accessor.get(IStorageService);
  const configurationService = accessor.get(IConfigurationService);
  const instantiationService = accessor.get(IInstantiationService);
  let modelUri;
  if (existingData.from === "model") {
    modelUri = existingData.modelUri;
  } else if (existingData.from === "rawData" && existingData.modelUri) {
    modelUri = existingData.modelUri;
  } else {
    modelUri = URI.from({ scheme: SearchEditorScheme, fragment: `${Math.random()}` });
  }
  if (!searchEditorModelFactory.models.has(modelUri)) {
    if (existingData.from === "existingFile") {
      instantiationService.invokeFunction((accessor2) => searchEditorModelFactory.initializeModelFromExistingFile(accessor2, modelUri, existingData.fileUri));
    } else {
      const searchEditorSettings = configurationService.getValue("search").searchEditor;
      const reuseOldSettings = searchEditorSettings.reusePriorSearchConfiguration;
      const defaultNumberOfContextLines = searchEditorSettings.defaultNumberOfContextLines;
      const priorConfig = reuseOldSettings ? new Memento(SearchEditorInput.ID, storageService).getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE).searchConfig ?? {} : {};
      const defaultConfig = defaultSearchConfig();
      const config = { ...defaultConfig, ...priorConfig, ...existingData.config };
      if (defaultNumberOfContextLines !== null && defaultNumberOfContextLines !== void 0) {
        config.contextLines = existingData?.config?.contextLines ?? defaultNumberOfContextLines;
      }
      if (existingData.from === "rawData") {
        if (existingData.resultsContents) {
          config.contextLines = 0;
        }
        instantiationService.invokeFunction((accessor2) => searchEditorModelFactory.initializeModelFromRawData(accessor2, modelUri, config, existingData.resultsContents));
      } else {
        instantiationService.invokeFunction((accessor2) => searchEditorModelFactory.initializeModelFromExistingModel(accessor2, modelUri, config));
      }
    }
  }
  return instantiationService.createInstance(
    SearchEditorInput,
    modelUri,
    existingData.from === "existingFile" ? existingData.fileUri : existingData.from === "model" ? existingData.backupOf : void 0
  );
};
export {
  SEARCH_EDITOR_EXT,
  SearchEditorInput,
  getOrMakeSearchEditorInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaEVkaXRvclxcYnJvd3Nlclxcc2VhcmNoRWRpdG9ySW5wdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvc2VhcmNoRWRpdG9yLmNzcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBleHRuYW1lLCBpc0VxdWFsLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEdyb3VwSWRlbnRpZmllciwgSVJldmVydE9wdGlvbnMsIElTYXZlT3B0aW9ucywgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgSU1vdmVSZXN1bHQsIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBJVW50eXBlZEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuaW1wb3J0IHsgU2VhcmNoRWRpdG9yRmluZE1hdGNoQ2xhc3MsIFNlYXJjaEVkaXRvcklucHV0VHlwZUlkLCBTZWFyY2hFZGl0b3JTY2hlbWUsIFNlYXJjaEVkaXRvcldvcmtpbmdDb3B5VHlwZUlkLCBTZWFyY2hDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgU2VhcmNoQ29uZmlndXJhdGlvbk1vZGVsLCBTZWFyY2hFZGl0b3JNb2RlbCwgc2VhcmNoRWRpdG9yTW9kZWxGYWN0b3J5IH0gZnJvbSAnLi9zZWFyY2hFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0U2VhcmNoQ29uZmlnLCBwYXJzZVNhdmVkU2VhcmNoRWRpdG9yLCBzZXJpYWxpemVTZWFyY2hDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9zZWFyY2hFZGl0b3JTZXJpYWxpemF0aW9uLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNhdmVPcHRpb25zLCBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHksIElXb3JraW5nQ29weUJhY2t1cCwgSVdvcmtpbmdDb3B5U2F2ZUV2ZW50LCBXb3JraW5nQ29weUNhcGFiaWxpdGllcyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElTZWFyY2hDb21wbGV0ZSwgSVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgYnVmZmVyVG9SZWFkYWJsZSwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcblxuZXhwb3J0IGNvbnN0IFNFQVJDSF9FRElUT1JfRVhUID0gJy5jb2RlLXNlYXJjaCc7XG5cbmNvbnN0IFNlYXJjaEVkaXRvckljb24gPSByZWdpc3Rlckljb24oJ3NlYXJjaC1lZGl0b3ItbGFiZWwtaWNvbicsIENvZGljb24uc2VhcmNoLCBsb2NhbGl6ZSgnc2VhcmNoRWRpdG9yTGFiZWxJY29uJywgJ0ljb24gb2YgdGhlIHNlYXJjaCBlZGl0b3IgbGFiZWwuJykpO1xuXG5leHBvcnQgY2xhc3MgU2VhcmNoRWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCB7XG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gU2VhcmNoRWRpdG9ySW5wdXRUeXBlSWQ7XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBTZWFyY2hFZGl0b3JJbnB1dC5JRDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnR5cGVJZDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEljb24oKTogVGhlbWVJY29uIHtcblx0XHRyZXR1cm4gU2VhcmNoRWRpdG9ySWNvbjtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMge1xuXHRcdGxldCBjYXBhYmlsaXRpZXMgPSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5Ob25lO1xuXHRcdGlmICghdGhpcy5iYWNraW5nVXJpKSB7XG5cdFx0XHRjYXBhYmlsaXRpZXMgfD0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhcGFiaWxpdGllcztcblx0fVxuXG5cdHByaXZhdGUgbWVtZW50bzogTWVtZW50bzx7IHNlYXJjaENvbmZpZzogU2VhcmNoQ29uZmlndXJhdGlvbiB9PjtcblxuXHRwcml2YXRlIGRpcnR5OiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBsYXN0TGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNhdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJV29ya2luZ0NvcHlTYXZlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNhdmU6IEV2ZW50PElXb3JraW5nQ29weVNhdmVFdmVudD4gPSB0aGlzLl9vbkRpZFNhdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBvbGREZWNvcmF0aW9uc0lEczogc3RyaW5nW10gPSBbXTtcblxuXHRnZXQgcmVzb3VyY2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuYmFja2luZ1VyaSB8fCB0aGlzLm1vZGVsVXJpO1xuXHR9XG5cblx0cHVibGljIG9uZ29pbmdTZWFyY2hPcGVyYXRpb246IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgbW9kZWw6IFNlYXJjaEVkaXRvck1vZGVsO1xuXHRwcml2YXRlIF9jYWNoZWRSZXN1bHRzTW9kZWw6IElUZXh0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NhY2hlZENvbmZpZ3VyYXRpb25Nb2RlbDogU2VhcmNoQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RlbFVyaTogVVJJLFxuXHRcdHB1YmxpYyByZWFkb25seSBiYWNraW5nVXJpOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtpbmdDb3B5U2VydmljZTogSVdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoRWRpdG9yTW9kZWwsIG1vZGVsVXJpKTtcblxuXHRcdGlmICh0aGlzLm1vZGVsVXJpLnNjaGVtZSAhPT0gU2VhcmNoRWRpdG9yU2NoZW1lKSB7XG5cdFx0XHR0aHJvdyBFcnJvcignU2VhcmNoRWRpdG9ySW5wdXQgbXVzdCBiZSBpbnZva2VkIHdpdGggYSBTZWFyY2hFZGl0b3JTY2hlbWUgdXJpJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5tZW1lbnRvID0gbmV3IE1lbWVudG8oU2VhcmNoRWRpdG9ySW5wdXQuSUQsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4gdGhpcy5tZW1lbnRvLnNhdmVNZW1lbnRvKCkpKTtcblxuXHRcdGNvbnN0IGlucHV0ID0gdGhpcztcblx0XHRjb25zdCB3b3JraW5nQ29weUFkYXB0ZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJV29ya2luZ0NvcHkge1xuXHRcdFx0cmVhZG9ubHkgdHlwZUlkID0gU2VhcmNoRWRpdG9yV29ya2luZ0NvcHlUeXBlSWQ7XG5cdFx0XHRyZWFkb25seSByZXNvdXJjZSA9IGlucHV0Lm1vZGVsVXJpO1xuXHRcdFx0Z2V0IG5hbWUoKSB7IHJldHVybiBpbnB1dC5nZXROYW1lKCk7IH1cblx0XHRcdHJlYWRvbmx5IGNhcGFiaWxpdGllcyA9IGlucHV0Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpID8gV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMuVW50aXRsZWQgOiBXb3JraW5nQ29weUNhcGFiaWxpdGllcy5Ob25lO1xuXHRcdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eSA9IGlucHV0Lm9uRGlkQ2hhbmdlRGlydHk7XG5cdFx0XHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQgPSBpbnB1dC5vbkRpZENoYW5nZUNvbnRlbnQ7XG5cdFx0XHRyZWFkb25seSBvbkRpZFNhdmUgPSBpbnB1dC5vbkRpZFNhdmU7XG5cdFx0XHRpc0RpcnR5KCk6IGJvb2xlYW4geyByZXR1cm4gaW5wdXQuaXNEaXJ0eSgpOyB9XG5cdFx0XHRpc01vZGlmaWVkKCk6IGJvb2xlYW4geyByZXR1cm4gaW5wdXQuaXNEaXJ0eSgpOyB9XG5cdFx0XHRiYWNrdXAodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJV29ya2luZ0NvcHlCYWNrdXA+IHsgcmV0dXJuIGlucHV0LmJhY2t1cCh0b2tlbik7IH1cblx0XHRcdHNhdmUob3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gaW5wdXQuc2F2ZSgwLCBvcHRpb25zKS50aGVuKGVkaXRvciA9PiAhIWVkaXRvcik7IH1cblx0XHRcdHJldmVydChvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIGlucHV0LnJldmVydCgwLCBvcHRpb25zKTsgfVxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5U2VydmljZS5yZWdpc3RlcldvcmtpbmdDb3B5KHdvcmtpbmdDb3B5QWRhcHRlcikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2F2ZShncm91cDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVRleHRGaWxlU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCgoYXdhaXQgdGhpcy5yZXNvbHZlTW9kZWxzKCkpLnJlc3VsdHNNb2RlbCkuaXNEaXNwb3NlZCgpKSB7IHJldHVybjsgfVxuXG5cdFx0aWYgKHRoaXMuYmFja2luZ1VyaSkge1xuXHRcdFx0YXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2Uud3JpdGUodGhpcy5iYWNraW5nVXJpLCBhd2FpdCB0aGlzLnNlcmlhbGl6ZUZvckRpc2soKSwgb3B0aW9ucyk7XG5cdFx0XHR0aGlzLnNldERpcnR5KGZhbHNlKTtcblx0XHRcdHRoaXMuX29uRGlkU2F2ZS5maXJlKHsgcmVhc29uOiBvcHRpb25zPy5yZWFzb24sIHNvdXJjZTogb3B0aW9ucz8uc291cmNlIH0pO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLnNhdmVBcyhncm91cCwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRyeVJlYWRDb25maWdTeW5jKCk6IFNlYXJjaENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRDb25maWd1cmF0aW9uTW9kZWw/LmNvbmZpZztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2VyaWFsaXplRm9yRGlzaygpIHtcblx0XHRjb25zdCB7IGNvbmZpZ3VyYXRpb25Nb2RlbCwgcmVzdWx0c01vZGVsIH0gPSBhd2FpdCB0aGlzLnJlc29sdmVNb2RlbHMoKTtcblx0XHRyZXR1cm4gc2VyaWFsaXplU2VhcmNoQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uTW9kZWwuY29uZmlnKSArICdcXG4nICsgcmVzdWx0c01vZGVsLmdldFZhbHVlKCk7XG5cdH1cblxuXHRwcml2YXRlIGNvbmZpZ0NoYW5nZUxpc3RlbmVyRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVnaXN0ZXJDb25maWdDaGFuZ2VMaXN0ZW5lcnMobW9kZWw6IFNlYXJjaENvbmZpZ3VyYXRpb25Nb2RlbCkge1xuXHRcdHRoaXMuY29uZmlnQ2hhbmdlTGlzdGVuZXJEaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0aWYgKCF0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0dGhpcy5jb25maWdDaGFuZ2VMaXN0ZW5lckRpc3Bvc2FibGUgPSBtb2RlbC5vbkNvbmZpZ0RpZFVwZGF0ZSgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmxhc3RMYWJlbCAhPT0gdGhpcy5nZXROYW1lKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxhYmVsLmZpcmUoKTtcblx0XHRcdFx0XHR0aGlzLmxhc3RMYWJlbCA9IHRoaXMuZ2V0TmFtZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMubWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSkuc2VhcmNoQ29uZmlnID0gbW9kZWwuY29uZmlnO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ0NoYW5nZUxpc3RlbmVyRGlzcG9zYWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZU1vZGVscygpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5yZXNvbHZlKCkudGhlbihkYXRhID0+IHtcblx0XHRcdHRoaXMuX2NhY2hlZFJlc3VsdHNNb2RlbCA9IGRhdGEucmVzdWx0c01vZGVsO1xuXHRcdFx0dGhpcy5fY2FjaGVkQ29uZmlndXJhdGlvbk1vZGVsID0gZGF0YS5jb25maWd1cmF0aW9uTW9kZWw7XG5cdFx0XHRpZiAodGhpcy5sYXN0TGFiZWwgIT09IHRoaXMuZ2V0TmFtZSgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpO1xuXHRcdFx0XHR0aGlzLmxhc3RMYWJlbCA9IHRoaXMuZ2V0TmFtZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZWdpc3RlckNvbmZpZ0NoYW5nZUxpc3RlbmVycyhkYXRhLmNvbmZpZ3VyYXRpb25Nb2RlbCk7XG5cdFx0XHRyZXR1cm4gZGF0YTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNhdmVBcyhncm91cDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVRleHRGaWxlU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGF0aCA9IGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZpbGVUb1NhdmUoYXdhaXQgdGhpcy5zdWdnZXN0RmlsZU5hbWUoKSwgb3B0aW9ucz8uYXZhaWxhYmxlRmlsZVN5c3RlbXMpO1xuXHRcdGlmIChwYXRoKSB7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxcblx0XHRcdFx0e30sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRvd25lcjogJ3JvYmxvdXJlbnMnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdGaXJlZCB3aGVuIGEgc2VhcmNoIGVkaXRvciBpcyBzYXZlZCc7XG5cdFx0XHRcdH0+XG5cdFx0XHRcdCgnc2VhcmNoRWRpdG9yL3NhdmVTZWFyY2hSZXN1bHRzJyk7XG5cdFx0XHRjb25zdCB0b1dyaXRlID0gYXdhaXQgdGhpcy5zZXJpYWxpemVGb3JEaXNrKCk7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UuY3JlYXRlKFt7IHJlc291cmNlOiBwYXRoLCB2YWx1ZTogdG9Xcml0ZSwgb3B0aW9uczogeyBvdmVyd3JpdGU6IHRydWUgfSB9XSkpIHtcblx0XHRcdFx0dGhpcy5zZXREaXJ0eShmYWxzZSk7XG5cdFx0XHRcdGlmICghaXNFcXVhbChwYXRoLCB0aGlzLm1vZGVsVXJpKSkge1xuXHRcdFx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihnZXRPck1ha2VTZWFyY2hFZGl0b3JJbnB1dCwgeyBmaWxlVXJpOiBwYXRoLCBmcm9tOiAnZXhpc3RpbmdGaWxlJyB9KTtcblx0XHRcdFx0XHRpbnB1dC5zZXRNYXRjaFJhbmdlcyh0aGlzLmdldE1hdGNoUmFuZ2VzKCkpO1xuXHRcdFx0XHRcdHJldHVybiBpbnB1dDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE5hbWUobWF4TGVuZ3RoID0gMTIpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHRyaW1Ub01heCA9IChsYWJlbDogc3RyaW5nKSA9PiAobGFiZWwubGVuZ3RoIDwgbWF4TGVuZ3RoID8gbGFiZWwgOiBgJHtsYWJlbC5zbGljZSgwLCBtYXhMZW5ndGggLSAzKX0uLi5gKTtcblxuXHRcdGlmICh0aGlzLmJhY2tpbmdVcmkpIHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsVVJJID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaSh0aGlzKTtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2VhcmNoVGl0bGUud2l0aFF1ZXJ5JywgXCJTZWFyY2g6IHswfVwiLCBiYXNlbmFtZSgob3JpZ2luYWxVUkkgPz8gdGhpcy5iYWNraW5nVXJpKS5wYXRoLCBTRUFSQ0hfRURJVE9SX0VYVCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5fY2FjaGVkQ29uZmlndXJhdGlvbk1vZGVsPy5jb25maWc/LnF1ZXJ5Py50cmltKCk7XG5cdFx0aWYgKHF1ZXJ5KSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3NlYXJjaFRpdGxlLndpdGhRdWVyeScsIFwiU2VhcmNoOiB7MH1cIiwgdHJpbVRvTWF4KHF1ZXJ5KSk7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgnc2VhcmNoVGl0bGUnLCBcIlNlYXJjaFwiKTtcblx0fVxuXG5cdHNldERpcnR5KGRpcnR5OiBib29sZWFuKSB7XG5cdFx0Y29uc3Qgd2FzRGlydHkgPSB0aGlzLmRpcnR5O1xuXHRcdHRoaXMuZGlydHkgPSBkaXJ0eTtcblx0XHRpZiAod2FzRGlydHkgIT09IGRpcnR5KSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBpc0RpcnR5KCkge1xuXHRcdHJldHVybiB0aGlzLmRpcnR5O1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVuYW1lKGdyb3VwOiBHcm91cElkZW50aWZpZXIsIHRhcmdldDogVVJJKTogUHJvbWlzZTxJTW92ZVJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChleHRuYW1lKHRhcmdldCkgPT09IFNFQVJDSF9FRElUT1JfRVhUKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0b3I6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0T3JNYWtlU2VhcmNoRWRpdG9ySW5wdXQsIHsgZnJvbTogJ2V4aXN0aW5nRmlsZScsIGZpbGVVcmk6IHRhcmdldCB9KVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Ly8gSWdub3JlIG1vdmUgaWYgZWRpdG9yIHdhcyByZW5hbWVkIHRvIGEgZGlmZmVyZW50IGZpbGUgZXh0ZW5zaW9uXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5tb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKHRoaXMubW9kZWxVcmkpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdG92ZXJyaWRlIG1hdGNoZXMob3RoZXI6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmIChzdXBlci5tYXRjaGVzKG90aGVyKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG90aGVyIGluc3RhbmNlb2YgU2VhcmNoRWRpdG9ySW5wdXQpIHtcblx0XHRcdHJldHVybiAhIShvdGhlci5tb2RlbFVyaS5mcmFnbWVudCAmJiBvdGhlci5tb2RlbFVyaS5mcmFnbWVudCA9PT0gdGhpcy5tb2RlbFVyaS5mcmFnbWVudCkgfHwgISEob3RoZXIuYmFja2luZ1VyaSAmJiBpc0VxdWFsKG90aGVyLmJhY2tpbmdVcmksIHRoaXMuYmFja2luZ1VyaSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXRNYXRjaFJhbmdlcygpOiBSYW5nZVtdIHtcblx0XHRyZXR1cm4gKHRoaXMuX2NhY2hlZFJlc3VsdHNNb2RlbD8uZ2V0QWxsRGVjb3JhdGlvbnMoKSA/PyBbXSlcblx0XHRcdC5maWx0ZXIoZGVjb3JhdGlvbiA9PiBkZWNvcmF0aW9uLm9wdGlvbnMuY2xhc3NOYW1lID09PSBTZWFyY2hFZGl0b3JGaW5kTWF0Y2hDbGFzcylcblx0XHRcdC5maWx0ZXIoKHsgcmFuZ2UgfSkgPT4gIShyYW5nZS5zdGFydENvbHVtbiA9PT0gMSAmJiByYW5nZS5lbmRDb2x1bW4gPT09IDEpKVxuXHRcdFx0Lm1hcCgoeyByYW5nZSB9KSA9PiByYW5nZSk7XG5cdH1cblxuXHRhc3luYyBzZXRNYXRjaFJhbmdlcyhyYW5nZXM6IFJhbmdlW10pIHtcblx0XHR0aGlzLm9sZERlY29yYXRpb25zSURzID0gKGF3YWl0IHRoaXMucmVzb2x2ZU1vZGVscygpKS5yZXN1bHRzTW9kZWwuZGVsdGFEZWNvcmF0aW9ucyh0aGlzLm9sZERlY29yYXRpb25zSURzLCByYW5nZXMubWFwKHJhbmdlID0+XG5cdFx0XHQoeyByYW5nZSwgb3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ3NlYXJjaC1lZGl0b3ItZmluZC1tYXRjaCcsIGNsYXNzTmFtZTogU2VhcmNoRWRpdG9yRmluZE1hdGNoQ2xhc3MsIHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzIH0gfSkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJldmVydChncm91cDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVJldmVydE9wdGlvbnMpIHtcblx0XHRpZiAob3B0aW9ucz8uc29mdCkge1xuXHRcdFx0dGhpcy5zZXREaXJ0eShmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuYmFja2luZ1VyaSkge1xuXHRcdFx0Y29uc3QgeyBjb25maWcsIHRleHQgfSA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocGFyc2VTYXZlZFNlYXJjaEVkaXRvciwgdGhpcy5iYWNraW5nVXJpKTtcblx0XHRcdGNvbnN0IHsgcmVzdWx0c01vZGVsLCBjb25maWd1cmF0aW9uTW9kZWwgfSA9IGF3YWl0IHRoaXMucmVzb2x2ZU1vZGVscygpO1xuXHRcdFx0cmVzdWx0c01vZGVsLnNldFZhbHVlKHRleHQpO1xuXHRcdFx0Y29uZmlndXJhdGlvbk1vZGVsLnVwZGF0ZUNvbmZpZyhjb25maWcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQoYXdhaXQgdGhpcy5yZXNvbHZlTW9kZWxzKCkpLnJlc3VsdHNNb2RlbC5zZXRWYWx1ZSgnJyk7XG5cdFx0fVxuXHRcdHN1cGVyLnJldmVydChncm91cCwgb3B0aW9ucyk7XG5cdFx0dGhpcy5zZXREaXJ0eShmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGJhY2t1cCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElXb3JraW5nQ29weUJhY2t1cD4ge1xuXHRcdGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgdGhpcy5zZXJpYWxpemVGb3JEaXNrKCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IGJ1ZmZlclRvUmVhZGFibGUoVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50cykpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3VnZ2VzdEZpbGVOYW1lKCk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgcXVlcnkgPSAoYXdhaXQgdGhpcy5yZXNvbHZlTW9kZWxzKCkpLmNvbmZpZ3VyYXRpb25Nb2RlbC5jb25maWcucXVlcnk7XG5cdFx0Y29uc3Qgc2VhcmNoRmlsZU5hbWUgPSAocXVlcnkucmVwbGFjZSgvW15cXHcgXFwtX10rL2csICdfJykgfHwgJ1NlYXJjaCcpICsgU0VBUkNIX0VESVRPUl9FWFQ7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKGF3YWl0IHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UuZGVmYXVsdEZpbGVQYXRoKHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZSksIHNlYXJjaEZpbGVOYW1lKTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvVW50eXBlZCgpOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiB0aGlzLnJlc291cmNlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRvdmVycmlkZTogU2VhcmNoRWRpdG9ySW5wdXQuSURcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgY29weSgpOiBFZGl0b3JJbnB1dCB7XG5cdFx0Ly8gR2VuZXJhdGUgYSBuZXcgbW9kZWxVcmkgZm9yIHRoZSBzcGxpdCBlZGl0b3Jcblx0XHRjb25zdCBuZXdNb2RlbFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTZWFyY2hFZGl0b3JTY2hlbWUsIGZyYWdtZW50OiBgJHtNYXRoLnJhbmRvbSgpfWAgfSk7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fY2FjaGVkQ29uZmlndXJhdGlvbk1vZGVsPy5jb25maWcgPz8ge307XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHRoaXMuX2NhY2hlZFJlc3VsdHNNb2RlbD8uZ2V0VmFsdWUoKSA/PyAnJztcblx0XHQvLyBVc2UgdGhlICdyYXdEYXRhJyB2YXJpYW50IGFuZCBwYXNzIG1vZGVsVXJpXG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oXG5cdFx0XHRnZXRPck1ha2VTZWFyY2hFZGl0b3JJbnB1dCxcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0eyBmcm9tOiAncmF3RGF0YScsIGNvbmZpZywgcmVzdWx0c0NvbnRlbnRzOiByZXN1bHRzLCBtb2RlbFVyaTogbmV3TW9kZWxVcmkgfSBhcyBhbnkgLy8gbW9kZWxVcmkgaXMgbm90IGluIHRoZSB0eXBlLCBidXQgd2UgaGFuZGxlIGl0IGJlbG93XG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZ2V0T3JNYWtlU2VhcmNoRWRpdG9ySW5wdXQgPSAoXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRleGlzdGluZ0RhdGE6IChcblx0XHR8IHsgZnJvbTogJ21vZGVsJzsgY29uZmlnPzogUGFydGlhbDxTZWFyY2hDb25maWd1cmF0aW9uPjsgbW9kZWxVcmk6IFVSSTsgYmFja3VwT2Y/OiBVUkkgfVxuXHRcdHwgeyBmcm9tOiAncmF3RGF0YSc7IHJlc3VsdHNDb250ZW50czogc3RyaW5nIHwgdW5kZWZpbmVkOyBjb25maWc6IFBhcnRpYWw8U2VhcmNoQ29uZmlndXJhdGlvbj47IG1vZGVsVXJpPzogVVJJIH1cblx0XHR8IHsgZnJvbTogJ2V4aXN0aW5nRmlsZSc7IGZpbGVVcmk6IFVSSSB9KVxuKTogU2VhcmNoRWRpdG9ySW5wdXQgPT4ge1xuXG5cdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0bGV0IG1vZGVsVXJpOiBVUkk7XG5cdGlmIChleGlzdGluZ0RhdGEuZnJvbSA9PT0gJ21vZGVsJykge1xuXHRcdG1vZGVsVXJpID0gZXhpc3RpbmdEYXRhLm1vZGVsVXJpO1xuXHR9IGVsc2UgaWYgKGV4aXN0aW5nRGF0YS5mcm9tID09PSAncmF3RGF0YScgJiYgZXhpc3RpbmdEYXRhLm1vZGVsVXJpKSB7XG5cdFx0bW9kZWxVcmkgPSBleGlzdGluZ0RhdGEubW9kZWxVcmk7XG5cdH0gZWxzZSB7XG5cdFx0bW9kZWxVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2VhcmNoRWRpdG9yU2NoZW1lLCBmcmFnbWVudDogYCR7TWF0aC5yYW5kb20oKX1gIH0pO1xuXHR9XG5cblx0aWYgKCFzZWFyY2hFZGl0b3JNb2RlbEZhY3RvcnkubW9kZWxzLmhhcyhtb2RlbFVyaSkpIHtcblx0XHRpZiAoZXhpc3RpbmdEYXRhLmZyb20gPT09ICdleGlzdGluZ0ZpbGUnKSB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBzZWFyY2hFZGl0b3JNb2RlbEZhY3RvcnkuaW5pdGlhbGl6ZU1vZGVsRnJvbUV4aXN0aW5nRmlsZShhY2Nlc3NvciwgbW9kZWxVcmksIGV4aXN0aW5nRGF0YS5maWxlVXJpKSk7XG5cdFx0fSBlbHNlIHtcblxuXHRcdFx0Y29uc3Qgc2VhcmNoRWRpdG9yU2V0dGluZ3MgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXM+KCdzZWFyY2gnKS5zZWFyY2hFZGl0b3I7XG5cblx0XHRcdGNvbnN0IHJldXNlT2xkU2V0dGluZ3MgPSBzZWFyY2hFZGl0b3JTZXR0aW5ncy5yZXVzZVByaW9yU2VhcmNoQ29uZmlndXJhdGlvbjtcblx0XHRcdGNvbnN0IGRlZmF1bHROdW1iZXJPZkNvbnRleHRMaW5lcyA9IHNlYXJjaEVkaXRvclNldHRpbmdzLmRlZmF1bHROdW1iZXJPZkNvbnRleHRMaW5lcztcblxuXHRcdFx0Y29uc3QgcHJpb3JDb25maWcgPSByZXVzZU9sZFNldHRpbmdzID8gbmV3IE1lbWVudG88eyBzZWFyY2hDb25maWc/OiBTZWFyY2hDb25maWd1cmF0aW9uIH0+KFNlYXJjaEVkaXRvcklucHV0LklELCBzdG9yYWdlU2VydmljZSkuZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpLnNlYXJjaENvbmZpZyA/PyB7fSA6IHt9O1xuXHRcdFx0Y29uc3QgZGVmYXVsdENvbmZpZyA9IGRlZmF1bHRTZWFyY2hDb25maWcoKTtcblxuXHRcdFx0Y29uc3QgY29uZmlnID0geyAuLi5kZWZhdWx0Q29uZmlnLCAuLi5wcmlvckNvbmZpZywgLi4uZXhpc3RpbmdEYXRhLmNvbmZpZyB9O1xuXG5cdFx0XHRpZiAoZGVmYXVsdE51bWJlck9mQ29udGV4dExpbmVzICE9PSBudWxsICYmIGRlZmF1bHROdW1iZXJPZkNvbnRleHRMaW5lcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbmZpZy5jb250ZXh0TGluZXMgPSBleGlzdGluZ0RhdGE/LmNvbmZpZz8uY29udGV4dExpbmVzID8/IGRlZmF1bHROdW1iZXJPZkNvbnRleHRMaW5lcztcblx0XHRcdH1cblx0XHRcdGlmIChleGlzdGluZ0RhdGEuZnJvbSA9PT0gJ3Jhd0RhdGEnKSB7XG5cdFx0XHRcdGlmIChleGlzdGluZ0RhdGEucmVzdWx0c0NvbnRlbnRzKSB7XG5cdFx0XHRcdFx0Y29uZmlnLmNvbnRleHRMaW5lcyA9IDA7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gc2VhcmNoRWRpdG9yTW9kZWxGYWN0b3J5LmluaXRpYWxpemVNb2RlbEZyb21SYXdEYXRhKGFjY2Vzc29yLCBtb2RlbFVyaSwgY29uZmlnLCBleGlzdGluZ0RhdGEucmVzdWx0c0NvbnRlbnRzKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBzZWFyY2hFZGl0b3JNb2RlbEZhY3RvcnkuaW5pdGlhbGl6ZU1vZGVsRnJvbUV4aXN0aW5nTW9kZWwoYWNjZXNzb3IsIG1vZGVsVXJpLCBjb25maWcpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFNlYXJjaEVkaXRvcklucHV0LFxuXHRcdG1vZGVsVXJpLFxuXHRcdGV4aXN0aW5nRGF0YS5mcm9tID09PSAnZXhpc3RpbmdGaWxlJ1xuXHRcdFx0PyBleGlzdGluZ0RhdGEuZmlsZVVyaVxuXHRcdFx0OiBleGlzdGluZ0RhdGEuZnJvbSA9PT0gJ21vZGVsJ1xuXHRcdFx0XHQ/IGV4aXN0aW5nRGF0YS5iYWNrdXBPZlxuXHRcdFx0XHQ6IHVuZGVmaW5lZCk7XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsU0FBUyxnQkFBZ0I7QUFDM0MsU0FBUyxXQUFXO0FBRXBCLFNBQXFCLDhCQUE4QjtBQUNuRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUF3RCx3QkFBcUMsK0JBQW9EO0FBQ2pKLFNBQVMsZUFBZTtBQUN4QixTQUFTLDRCQUE0Qix5QkFBeUIsb0JBQW9C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
