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
import { Emitter } from "../../../base/common/event.js";
import { StringSHA1 } from "../../../base/common/hash.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { equals } from "../../../base/common/objects.js";
import * as platform from "../../../base/common/platform.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { clampedInt } from "../config/editorOptions.js";
import { EditOperation } from "../core/editOperation.js";
import { EDITOR_MODEL_DEFAULTS } from "../core/misc/textModelDefaults.js";
import { Range } from "../core/range.js";
import { PLAINTEXT_LANGUAGE_ID } from "../languages/modesRegistry.js";
import { DefaultEndOfLine, EndOfLinePreference, EndOfLineSequence } from "../model.js";
import { isEditStackElement } from "../model/editStack.js";
import { TextModel, createTextBuffer } from "../model/textModel.js";
import { EditSources } from "../textModelEditSource.js";
import { ITextResourcePropertiesService } from "./textResourceConfiguration.js";
function MODEL_ID(resource) {
  return resource.toString();
}
class ModelData {
  constructor(model, onWillDispose, onDidChangeLanguage) {
    this.model = model;
    this._modelEventListeners = new DisposableStore();
    this.model = model;
    this._modelEventListeners.add(model.onWillDispose(() => onWillDispose(model)));
    this._modelEventListeners.add(model.onDidChangeLanguage((e) => onDidChangeLanguage(model, e)));
  }
  dispose() {
    this._modelEventListeners.dispose();
  }
}
const DEFAULT_EOL = platform.isLinux || platform.isMacintosh ? DefaultEndOfLine.LF : DefaultEndOfLine.CRLF;
class DisposedModelInfo {
  constructor(uri, initialUndoRedoSnapshot, time, sharesUndoRedoStack, heapSize, sha1, versionId, alternativeVersionId) {
    this.uri = uri;
    this.initialUndoRedoSnapshot = initialUndoRedoSnapshot;
    this.time = time;
    this.sharesUndoRedoStack = sharesUndoRedoStack;
    this.heapSize = heapSize;
    this.sha1 = sha1;
    this.versionId = versionId;
    this.alternativeVersionId = alternativeVersionId;
  }
}
let ModelService = class extends Disposable {
  constructor(_configurationService, _resourcePropertiesService, _undoRedoService, _instantiationService) {
    super();
    this._configurationService = _configurationService;
    this._resourcePropertiesService = _resourcePropertiesService;
    this._undoRedoService = _undoRedoService;
    this._instantiationService = _instantiationService;
    this._onModelAdded = this._register(new Emitter());
    this.onModelAdded = this._onModelAdded.event;
    this._onModelRemoved = this._register(new Emitter());
    this.onModelRemoved = this._onModelRemoved.event;
    this._onModelModeChanged = this._register(new Emitter());
    this.onModelLanguageChanged = this._onModelModeChanged.event;
    this._modelCreationOptionsByLanguageAndResource = /* @__PURE__ */ Object.create(null);
    this._models = {};
    this._disposedModels = /* @__PURE__ */ new Map();
    this._disposedModelsHeapSize = 0;
    this._register(this._configurationService.onDidChangeConfiguration((e) => this._updateModelOptions(e)));
    this._updateModelOptions(void 0);
  }
  static _readModelOptions(config, isForSimpleWidget) {
    let tabSize = EDITOR_MODEL_DEFAULTS.tabSize;
    if (config.editor && typeof config.editor.tabSize !== "undefined") {
      tabSize = clampedInt(config.editor.tabSize, EDITOR_MODEL_DEFAULTS.tabSize, 1, 100);
    }
    let indentSize = "tabSize";
    if (config.editor && typeof config.editor.indentSize !== "undefined" && config.editor.indentSize !== "tabSize") {
      indentSize = clampedInt(config.editor.indentSize, "tabSize", 1, 100);
    }
    let insertSpaces = EDITOR_MODEL_DEFAULTS.insertSpaces;
    if (config.editor && typeof config.editor.insertSpaces !== "undefined") {
      insertSpaces = config.editor.insertSpaces === "false" ? false : Boolean(config.editor.insertSpaces);
    }
    let newDefaultEOL = DEFAULT_EOL;
    const eol = config.eol;
    if (eol === "\r\n") {
      newDefaultEOL = DefaultEndOfLine.CRLF;
    } else if (eol === "\n") {
      newDefaultEOL = DefaultEndOfLine.LF;
    }
    let trimAutoWhitespace = EDITOR_MODEL_DEFAULTS.trimAutoWhitespace;
    if (config.editor && typeof config.editor.trimAutoWhitespace !== "undefined") {
      trimAutoWhitespace = config.editor.trimAutoWhitespace === "false" ? false : Boolean(config.editor.trimAutoWhitespace);
    }
    let detectIndentation = EDITOR_MODEL_DEFAULTS.detectIndentation;
    if (config.editor && typeof config.editor.detectIndentation !== "undefined") {
      detectIndentation = config.editor.detectIndentation === "false" ? false : Boolean(config.editor.detectIndentation);
    }
    let largeFileOptimizations = EDITOR_MODEL_DEFAULTS.largeFileOptimizations;
    if (config.editor && typeof config.editor.largeFileOptimizations !== "undefined") {
      largeFileOptimizations = config.editor.largeFileOptimizations === "false" ? false : Boolean(config.editor.largeFileOptimizations);
    }
    let bracketPairColorizationOptions = EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions;
    if (config.editor?.bracketPairColorization && typeof config.editor.bracketPairColorization === "object") {
      const bpConfig = config.editor.bracketPairColorization;
      bracketPairColorizationOptions = {
        enabled: !!bpConfig.enabled,
        independentColorPoolPerBracketType: !!bpConfig.independentColorPoolPerBracketType
      };
    }
    return {
      isForSimpleWidget,
      tabSize,
      indentSize,
      insertSpaces,
      detectIndentation,
      defaultEOL: newDefaultEOL,
      trimAutoWhitespace,
      largeFileOptimizations,
      bracketPairColorizationOptions
    };
  }
  _getEOL(resource, language) {
    if (resource) {
      return this._resourcePropertiesService.getEOL(resource, language);
    }
    const eol = this._configurationService.getValue("files.eol", { overrideIdentifier: language });
    if (eol && typeof eol === "string" && eol !== "auto") {
      return eol;
    }
    return platform.OS === platform.OperatingSystem.Linux || platform.OS === platform.OperatingSystem.Macintosh ? "\n" : "\r\n";
  }
  _shouldRestoreUndoStack() {
    const result = this._configurationService.getValue("files.restoreUndoStack");
    if (typeof result === "boolean") {
      return result;
    }
    return true;
  }
  getCreationOptions(languageIdOrSelection, resource, isForSimpleWidget) {
    const language = typeof languageIdOrSelection === "string" ? languageIdOrSelection : languageIdOrSelection.languageId;
    let creationOptions = this._modelCreationOptionsByLanguageAndResource[language + resource];
    if (!creationOptions) {
      const editor = this._configurationService.getValue("editor", { overrideIdentifier: language, resource });
      const eol = this._getEOL(resource, language);
      creationOptions = ModelService._readModelOptions({ editor, eol }, isForSimpleWidget);
      this._modelCreationOptionsByLanguageAndResource[language + resource] = creationOptions;
    }
    return creationOptions;
  }
  _updateModelOptions(e) {
    const oldOptionsByLanguageAndResource = this._modelCreationOptionsByLanguageAndResource;
    this._modelCreationOptionsByLanguageAndResource = /* @__PURE__ */ Object.create(null);
    const keys = Object.keys(this._models);
    for (let i = 0, len = keys.length; i < len; i++) {
      const modelId = keys[i];
      const modelData = this._models[modelId];
      const language = modelData.model.getLanguageId();
      const uri = modelData.model.uri;
      if (e && !e.affectsConfiguration("editor", { overrideIdentifier: language, resource: uri }) && !e.affectsConfiguration("files.eol", { overrideIdentifier: language, resource: uri })) {
        continue;
      }
      const oldOptions = oldOptionsByLanguageAndResource[language + uri];
      const newOptions = this.getCreationOptions(language, uri, modelData.model.isForSimpleWidget);
      ModelService._setModelOptionsForModel(modelData.model, newOptions, oldOptions);
    }
  }
  static _setModelOptionsForModel(model, newOptions, currentOptions) {
    if (currentOptions && currentOptions.defaultEOL !== newOptions.defaultEOL && model.getLineCount() === 1) {
      model.setEOL(newOptions.defaultEOL === DefaultEndOfLine.LF ? EndOfLineSequence.LF : EndOfLineSequence.CRLF);
    }
    if (currentOptions && currentOptions.detectIndentation === newOptions.detectIndentation && currentOptions.insertSpaces === newOptions.insertSpaces && currentOptions.tabSize === newOptions.tabSize && currentOptions.indentSize === newOptions.indentSize && currentOptions.trimAutoWhitespace === newOptions.trimAutoWhitespace && equals(currentOptions.bracketPairColorizationOptions, newOptions.bracketPairColorizationOptions)) {
      return;
    }
    if (newOptions.detectIndentation) {
      model.detectIndentation(newOptions.insertSpaces, newOptions.tabSize);
      model.updateOptions({
        trimAutoWhitespace: newOptions.trimAutoWhitespace,
        bracketColorizationOptions: newOptions.bracketPairColorizationOptions
      });
    } else {
      model.updateOptions({
        insertSpaces: newOptions.insertSpaces,
        tabSize: newOptions.tabSize,
        indentSize: newOptions.indentSize,
        trimAutoWhitespace: newOptions.trimAutoWhitespace,
        bracketColorizationOptions: newOptions.bracketPairColorizationOptions
      });
    }
  }
  // --- begin IModelService
  _insertDisposedModel(disposedModelData) {
    this._disposedModels.set(MODEL_ID(disposedModelData.uri), disposedModelData);
    this._disposedModelsHeapSize += disposedModelData.heapSize;
  }
  _removeDisposedModel(resource) {
    const disposedModelData = this._disposedModels.get(MODEL_ID(resource));
    if (disposedModelData) {
      this._disposedModelsHeapSize -= disposedModelData.heapSize;
    }
    this._disposedModels.delete(MODEL_ID(resource));
    return disposedModelData;
  }
  _ensureDisposedModelsHeapSize(maxModelsHeapSize) {
    if (this._disposedModelsHeapSize > maxModelsHeapSize) {
      const disposedModels = [];
      this._disposedModels.forEach((entry) => {
        if (!entry.sharesUndoRedoStack) {
          disposedModels.push(entry);
        }
      });
      disposedModels.sort((a, b) => a.time - b.time);
      while (disposedModels.length > 0 && this._disposedModelsHeapSize > maxModelsHeapSize) {
        const disposedModel = disposedModels.shift();
        this._removeDisposedModel(disposedModel.uri);
        if (disposedModel.initialUndoRedoSnapshot !== null) {
          this._undoRedoService.restoreSnapshot(disposedModel.initialUndoRedoSnapshot);
        }
      }
    }
  }
  _createModelData(value, languageIdOrSelection, resource, isForSimpleWidget) {
    const options = this.getCreationOptions(languageIdOrSelection, resource, isForSimpleWidget);
    const model = this._instantiationService.createInstance(
      TextModel,
      value,
      languageIdOrSelection,
      options,
      resource
    );
    if (resource && this._disposedModels.has(MODEL_ID(resource))) {
      const disposedModelData = this._removeDisposedModel(resource);
      const elements = this._undoRedoService.getElements(resource);
      const sha1Computer = this._getSHA1Computer();
      const sha1IsEqual = sha1Computer.canComputeSHA1(model) ? sha1Computer.computeSHA1(model) === disposedModelData.sha1 : false;
      if (sha1IsEqual || disposedModelData.sharesUndoRedoStack) {
        for (const element of elements.past) {
          if (isEditStackElement(element) && element.matchesResource(resource)) {
            element.setModel(model);
          }
        }
        for (const element of elements.future) {
          if (isEditStackElement(element) && element.matchesResource(resource)) {
            element.setModel(model);
          }
        }
        this._undoRedoService.setElementsValidFlag(resource, true, (element) => isEditStackElement(element) && element.matchesResource(resource));
        if (sha1IsEqual) {
          model._overwriteVersionId(disposedModelData.versionId);
          model._overwriteAlternativeVersionId(disposedModelData.alternativeVersionId);
          model._overwriteInitialUndoRedoSnapshot(disposedModelData.initialUndoRedoSnapshot);
        }
      } else {
        if (disposedModelData.initialUndoRedoSnapshot !== null) {
          this._undoRedoService.restoreSnapshot(disposedModelData.initialUndoRedoSnapshot);
        }
      }
    }
    const modelId = MODEL_ID(model.uri);
    if (this._models[modelId]) {
      throw new Error("ModelService: Cannot add model because it already exists!");
    }
    const modelData = new ModelData(
      model,
      (model2) => this._onWillDispose(model2),
      (model2, e) => this._onDidChangeLanguage(model2, e)
    );
    this._models[modelId] = modelData;
    return modelData;
  }
  updateModel(model, value, reason = EditSources.unknown({ name: "updateModel" })) {
    const options = this.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
    const { textBuffer, disposable } = createTextBuffer(value, options.defaultEOL);
    if (model.equalsTextBuffer(textBuffer)) {
      disposable.dispose();
      return;
    }
    model.pushStackElement();
    model.pushEOL(textBuffer.getEOL() === "\r\n" ? EndOfLineSequence.CRLF : EndOfLineSequence.LF);
    model.pushEditOperations(
      [],
      ModelService._computeEdits(model, textBuffer),
      () => [],
      void 0,
      reason
    );
    model.pushStackElement();
    disposable.dispose();
  }
  static _commonPrefix(a, aLen, aDelta, b, bLen, bDelta) {
    const maxResult = Math.min(aLen, bLen);
    let result = 0;
    for (let i = 0; i < maxResult && a.getLineContent(aDelta + i) === b.getLineContent(bDelta + i); i++) {
      result++;
    }
    return result;
  }
  static _commonSuffix(a, aLen, aDelta, b, bLen, bDelta) {
    const maxResult = Math.min(aLen, bLen);
    let result = 0;
    for (let i = 0; i < maxResult && a.getLineContent(aDelta + aLen - i) === b.getLineContent(bDelta + bLen - i); i++) {
      result++;
    }
    return result;
  }
  /**
   * Compute edits to bring `model` to the state of `textSource`.
   */
  static _computeEdits(model, textBuffer) {
    const modelLineCount = model.getLineCount();
    const textBufferLineCount = textBuffer.getLineCount();
    const commonPrefix = this._commonPrefix(model, modelLineCount, 1, textBuffer, textBufferLineCount, 1);
    if (modelLineCount === textBufferLineCount && commonPrefix === modelLineCount) {
      return [];
    }
    const commonSuffix = this._commonSuffix(model, modelLineCount - commonPrefix, commonPrefix, textBuffer, textBufferLineCount - commonPrefix, commonPrefix);
    let oldRange;
    let newRange;
    if (commonSuffix > 0) {
      oldRange = new Range(commonPrefix + 1, 1, modelLineCount - commonSuffix + 1, 1);
      newRange = new Range(commonPrefix + 1, 1, textBufferLineCount - commonSuffix + 1, 1);
    } else if (commonPrefix > 0) {
      oldRange = new Range(commonPrefix, model.getLineMaxColumn(commonPrefix), modelLineCount, model.getLineMaxColumn(modelLineCount));
      newRange = new Range(commonPrefix, 1 + textBuffer.getLineLength(commonPrefix), textBufferLineCount, 1 + textBuffer.getLineLength(textBufferLineCount));
    } else {
      oldRange = new Range(1, 1, modelLineCount, model.getLineMaxColumn(modelLineCount));
      newRange = new Range(1, 1, textBufferLineCount, 1 + textBuffer.getLineLength(textBufferLineCount));
    }
    return [EditOperation.replaceMove(oldRange, textBuffer.getValueInRange(newRange, EndOfLinePreference.TextDefined))];
  }
  createModel(value, languageSelection, resource, isForSimpleWidget = false) {
    let modelData;
    if (languageSelection) {
      modelData = this._createModelData(value, languageSelection, resource, isForSimpleWidget);
    } else {
      modelData = this._createModelData(value, PLAINTEXT_LANGUAGE_ID, resource, isForSimpleWidget);
    }
    this._onModelAdded.fire(modelData.model);
    return modelData.model;
  }
  destroyModel(resource) {
    const modelData = this._models[MODEL_ID(resource)];
    if (!modelData) {
      return;
    }
    modelData.model.dispose();
  }
  getModels() {
    const ret = [];
    const keys = Object.keys(this._models);
    for (let i = 0, len = keys.length; i < len; i++) {
      const modelId = keys[i];
      ret.push(this._models[modelId].model);
    }
    return ret;
  }
  getModel(resource) {
    const modelId = MODEL_ID(resource);
    const modelData = this._models[modelId];
    if (!modelData) {
      return null;
    }
    return modelData.model;
  }
  // --- end IModelService
  _schemaShouldMaintainUndoRedoElements(resource) {
    return resource.scheme === Schemas.file || resource.scheme === Schemas.vscodeRemote || resource.scheme === Schemas.vscodeUserData || resource.scheme === Schemas.vscodeNotebookCell || resource.scheme === "fake-fs";
  }
  _onWillDispose(model) {
    const modelId = MODEL_ID(model.uri);
    const modelData = this._models[modelId];
    const sharesUndoRedoStack = this._undoRedoService.getUriComparisonKey(model.uri) !== model.uri.toString();
    let maintainUndoRedoStack = false;
    let heapSize = 0;
    if (sharesUndoRedoStack || this._shouldRestoreUndoStack() && this._schemaShouldMaintainUndoRedoElements(model.uri)) {
      const elements = this._undoRedoService.getElements(model.uri);
      if (elements.past.length > 0 || elements.future.length > 0) {
        for (const element of elements.past) {
          if (isEditStackElement(element) && element.matchesResource(model.uri)) {
            maintainUndoRedoStack = true;
            heapSize += element.heapSize(model.uri);
            element.setModel(model.uri);
          }
        }
        for (const element of elements.future) {
          if (isEditStackElement(element) && element.matchesResource(model.uri)) {
            maintainUndoRedoStack = true;
            heapSize += element.heapSize(model.uri);
            element.setModel(model.uri);
          }
        }
      }
    }
    const maxMemory = ModelService.MAX_MEMORY_FOR_CLOSED_FILES_UNDO_STACK;
    const sha1Computer = this._getSHA1Computer();
    if (!maintainUndoRedoStack) {
      if (!sharesUndoRedoStack) {
        const initialUndoRedoSnapshot = modelData.model.getInitialUndoRedoSnapshot();
        if (initialUndoRedoSnapshot !== null) {
          this._undoRedoService.restoreSnapshot(initialUndoRedoSnapshot);
        }
      }
    } else if (!sharesUndoRedoStack && (heapSize > maxMemory || !sha1Computer.canComputeSHA1(model))) {
      const initialUndoRedoSnapshot = modelData.model.getInitialUndoRedoSnapshot();
      if (initialUndoRedoSnapshot !== null) {
        this._undoRedoService.restoreSnapshot(initialUndoRedoSnapshot);
      }
    } else {
      this._ensureDisposedModelsHeapSize(maxMemory - heapSize);
      this._undoRedoService.setElementsValidFlag(model.uri, false, (element) => isEditStackElement(element) && element.matchesResource(model.uri));
      this._insertDisposedModel(new DisposedModelInfo(model.uri, modelData.model.getInitialUndoRedoSnapshot(), Date.now(), sharesUndoRedoStack, heapSize, sha1Computer.computeSHA1(model), model.getVersionId(), model.getAlternativeVersionId()));
    }
    delete this._models[modelId];
    modelData.dispose();
    delete this._modelCreationOptionsByLanguageAndResource[model.getLanguageId() + model.uri];
    this._onModelRemoved.fire(model);
  }
  _onDidChangeLanguage(model, e) {
    const oldLanguageId = e.oldLanguage;
    const newLanguageId = model.getLanguageId();
    const oldOptions = this.getCreationOptions(oldLanguageId, model.uri, model.isForSimpleWidget);
    const newOptions = this.getCreationOptions(newLanguageId, model.uri, model.isForSimpleWidget);
    ModelService._setModelOptionsForModel(model, newOptions, oldOptions);
    this._onModelModeChanged.fire({ model, oldLanguageId });
  }
  _getSHA1Computer() {
    return new DefaultModelSHA1Computer();
  }
};
ModelService.MAX_MEMORY_FOR_CLOSED_FILES_UNDO_STACK = 20 * 1024 * 1024;
ModelService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ITextResourcePropertiesService),
  __decorateParam(2, IUndoRedoService),
  __decorateParam(3, IInstantiationService)
], ModelService);
const _DefaultModelSHA1Computer = class _DefaultModelSHA1Computer {
  // takes 200ms to compute a sha1 on a 10MB model on a new machine
  canComputeSHA1(model) {
    return model.getValueLength() <= _DefaultModelSHA1Computer.MAX_MODEL_SIZE;
  }
  computeSHA1(model) {
    const shaComputer = new StringSHA1();
    const snapshot = model.createSnapshot();
    let text;
    while (text = snapshot.read()) {
      shaComputer.update(text);
    }
    return shaComputer.digest();
  }
};
_DefaultModelSHA1Computer.MAX_MODEL_SIZE = 10 * 1024 * 1024;
let DefaultModelSHA1Computer = _DefaultModelSHA1Computer;
export {
  DefaultModelSHA1Computer,
  ModelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcc2VydmljZXNcXG1vZGVsU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgU3RyaW5nU0hBMSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSwgUmVzb3VyY2VFZGl0U3RhY2tTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBjbGFtcGVkSW50IH0gZnJvbSAnLi4vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiwgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgRURJVE9SX01PREVMX0RFRkFVTFRTIH0gZnJvbSAnLi4vY29yZS9taXNjL3RleHRNb2RlbERlZmF1bHRzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZWxlY3Rpb24gfSBmcm9tICcuLi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRGVmYXVsdEVuZE9mTGluZSwgRW5kT2ZMaW5lUHJlZmVyZW5jZSwgRW5kT2ZMaW5lU2VxdWVuY2UsIElUZXh0QnVmZmVyLCBJVGV4dEJ1ZmZlckZhY3RvcnksIElUZXh0TW9kZWwsIElUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBpc0VkaXRTdGFja0VsZW1lbnQgfSBmcm9tICcuLi9tb2RlbC9lZGl0U3RhY2suanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsLCBjcmVhdGVUZXh0QnVmZmVyIH0gZnJvbSAnLi4vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IEVkaXRTb3VyY2VzLCBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxMYW5ndWFnZUNoYW5nZWRFdmVudCB9IGZyb20gJy4uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuXG5mdW5jdGlvbiBNT0RFTF9JRChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0cmV0dXJuIHJlc291cmNlLnRvU3RyaW5nKCk7XG59XG5cbmNsYXNzIE1vZGVsRGF0YSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbEV2ZW50TGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RlbDogVGV4dE1vZGVsLFxuXHRcdG9uV2lsbERpc3Bvc2U6IChtb2RlbDogSVRleHRNb2RlbCkgPT4gdm9pZCxcblx0XHRvbkRpZENoYW5nZUxhbmd1YWdlOiAobW9kZWw6IElUZXh0TW9kZWwsIGU6IElNb2RlbExhbmd1YWdlQ2hhbmdlZEV2ZW50KSA9PiB2b2lkXG5cdCkge1xuXHRcdHRoaXMubW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLl9tb2RlbEV2ZW50TGlzdGVuZXJzLmFkZChtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IG9uV2lsbERpc3Bvc2UobW9kZWwpKSk7XG5cdFx0dGhpcy5fbW9kZWxFdmVudExpc3RlbmVycy5hZGQobW9kZWwub25EaWRDaGFuZ2VMYW5ndWFnZSgoZSkgPT4gb25EaWRDaGFuZ2VMYW5ndWFnZShtb2RlbCwgZSkpKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsRXZlbnRMaXN0ZW5lcnMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJUmF3RWRpdG9yQ29uZmlnIHtcblx0dGFiU2l6ZT86IHVua25vd247XG5cdGluZGVudFNpemU/OiB1bmtub3duO1xuXHRpbnNlcnRTcGFjZXM/OiB1bmtub3duO1xuXHRkZXRlY3RJbmRlbnRhdGlvbj86IHVua25vd247XG5cdHRyaW1BdXRvV2hpdGVzcGFjZT86IHVua25vd247XG5cdGNyZWF0aW9uT3B0aW9ucz86IHVua25vd247XG5cdGxhcmdlRmlsZU9wdGltaXphdGlvbnM/OiB1bmtub3duO1xuXHRicmFja2V0UGFpckNvbG9yaXphdGlvbj86IHVua25vd247XG59XG5cbmludGVyZmFjZSBJUmF3Q29uZmlnIHtcblx0ZW9sPzogdW5rbm93bjtcblx0ZWRpdG9yPzogSVJhd0VkaXRvckNvbmZpZztcbn1cblxuY29uc3QgREVGQVVMVF9FT0wgPSAocGxhdGZvcm0uaXNMaW51eCB8fCBwbGF0Zm9ybS5pc01hY2ludG9zaCkgPyBEZWZhdWx0RW5kT2ZMaW5lLkxGIDogRGVmYXVsdEVuZE9mTGluZS5DUkxGO1xuXG5jbGFzcyBEaXNwb3NlZE1vZGVsSW5mbyB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB1cmk6IFVSSSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaW5pdGlhbFVuZG9SZWRvU25hcHNob3Q6IFJlc291cmNlRWRpdFN0YWNrU25hcHNob3QgfCBudWxsLFxuXHRcdHB1YmxpYyByZWFkb25seSB0aW1lOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNoYXJlc1VuZG9SZWRvU3RhY2s6IGJvb2xlYW4sXG5cdFx0cHVibGljIHJlYWRvbmx5IGhlYXBTaXplOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNoYTE6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmVyc2lvbklkOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFsdGVybmF0aXZlVmVyc2lvbklkOiBudW1iZXIsXG5cdCkgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RlbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1vZGVsU2VydmljZSB7XG5cblx0cHVibGljIHN0YXRpYyBNQVhfTUVNT1JZX0ZPUl9DTE9TRURfRklMRVNfVU5ET19TVEFDSyA9IDIwICogMTAyNCAqIDEwMjQ7XG5cblx0cHVibGljIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vZGVsQWRkZWQ6IEVtaXR0ZXI8SVRleHRNb2RlbD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGV4dE1vZGVsPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTW9kZWxBZGRlZDogRXZlbnQ8SVRleHRNb2RlbD4gPSB0aGlzLl9vbk1vZGVsQWRkZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb2RlbFJlbW92ZWQ6IEVtaXR0ZXI8SVRleHRNb2RlbD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGV4dE1vZGVsPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTW9kZWxSZW1vdmVkOiBFdmVudDxJVGV4dE1vZGVsPiA9IHRoaXMuX29uTW9kZWxSZW1vdmVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW9kZWxNb2RlQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgbW9kZWw6IElUZXh0TW9kZWw7IG9sZExhbmd1YWdlSWQ6IHN0cmluZyB9PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTW9kZWxMYW5ndWFnZUNoYW5nZWQgPSB0aGlzLl9vbk1vZGVsTW9kZUNoYW5nZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfbW9kZWxDcmVhdGlvbk9wdGlvbnNCeUxhbmd1YWdlQW5kUmVzb3VyY2U6IHsgW2xhbmd1YWdlQW5kUmVzb3VyY2U6IHN0cmluZ106IElUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMgfTtcblxuXHQvKipcblx0ICogQWxsIHRoZSBtb2RlbHMga25vd24gaW4gdGhlIHN5c3RlbS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsczogeyBbbW9kZWxJZDogc3RyaW5nXTogTW9kZWxEYXRhIH07XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2VkTW9kZWxzOiBNYXA8c3RyaW5nLCBEaXNwb3NlZE1vZGVsSW5mbz47XG5cdHByaXZhdGUgX2Rpc3Bvc2VkTW9kZWxzSGVhcFNpemU6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlOiBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX21vZGVsQ3JlYXRpb25PcHRpb25zQnlMYW5ndWFnZUFuZFJlc291cmNlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9tb2RlbHMgPSB7fTtcblx0XHR0aGlzLl9kaXNwb3NlZE1vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCBEaXNwb3NlZE1vZGVsSW5mbz4oKTtcblx0XHR0aGlzLl9kaXNwb3NlZE1vZGVsc0hlYXBTaXplID0gMDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHRoaXMuX3VwZGF0ZU1vZGVsT3B0aW9ucyhlKSkpO1xuXHRcdHRoaXMuX3VwZGF0ZU1vZGVsT3B0aW9ucyh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlYWRNb2RlbE9wdGlvbnMoY29uZmlnOiBJUmF3Q29uZmlnLCBpc0ZvclNpbXBsZVdpZGdldDogYm9vbGVhbik6IElUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMge1xuXHRcdGxldCB0YWJTaXplID0gRURJVE9SX01PREVMX0RFRkFVTFRTLnRhYlNpemU7XG5cdFx0aWYgKGNvbmZpZy5lZGl0b3IgJiYgdHlwZW9mIGNvbmZpZy5lZGl0b3IudGFiU2l6ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRhYlNpemUgPSBjbGFtcGVkSW50KGNvbmZpZy5lZGl0b3IudGFiU2l6ZSwgRURJVE9SX01PREVMX0RFRkFVTFRTLnRhYlNpemUsIDEsIDEwMCk7XG5cdFx0fVxuXG5cdFx0bGV0IGluZGVudFNpemU6IG51bWJlciB8ICd0YWJTaXplJyA9ICd0YWJTaXplJztcblx0XHRpZiAoY29uZmlnLmVkaXRvciAmJiB0eXBlb2YgY29uZmlnLmVkaXRvci5pbmRlbnRTaXplICE9PSAndW5kZWZpbmVkJyAmJiBjb25maWcuZWRpdG9yLmluZGVudFNpemUgIT09ICd0YWJTaXplJykge1xuXHRcdFx0aW5kZW50U2l6ZSA9IGNsYW1wZWRJbnQoY29uZmlnLmVkaXRvci5pbmRlbnRTaXplLCAndGFiU2l6ZScsIDEsIDEwMCk7XG5cdFx0fVxuXG5cdFx0bGV0IGluc2VydFNwYWNlcyA9IEVESVRPUl9NT0RFTF9ERUZBVUxUUy5pbnNlcnRTcGFjZXM7XG5cdFx0aWYgKGNvbmZpZy5lZGl0b3IgJiYgdHlwZW9mIGNvbmZpZy5lZGl0b3IuaW5zZXJ0U3BhY2VzICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0aW5zZXJ0U3BhY2VzID0gKGNvbmZpZy5lZGl0b3IuaW5zZXJ0U3BhY2VzID09PSAnZmFsc2UnID8gZmFsc2UgOiBCb29sZWFuKGNvbmZpZy5lZGl0b3IuaW5zZXJ0U3BhY2VzKSk7XG5cdFx0fVxuXG5cdFx0bGV0IG5ld0RlZmF1bHRFT0wgPSBERUZBVUxUX0VPTDtcblx0XHRjb25zdCBlb2wgPSBjb25maWcuZW9sO1xuXHRcdGlmIChlb2wgPT09ICdcXHJcXG4nKSB7XG5cdFx0XHRuZXdEZWZhdWx0RU9MID0gRGVmYXVsdEVuZE9mTGluZS5DUkxGO1xuXHRcdH0gZWxzZSBpZiAoZW9sID09PSAnXFxuJykge1xuXHRcdFx0bmV3RGVmYXVsdEVPTCA9IERlZmF1bHRFbmRPZkxpbmUuTEY7XG5cdFx0fVxuXG5cdFx0bGV0IHRyaW1BdXRvV2hpdGVzcGFjZSA9IEVESVRPUl9NT0RFTF9ERUZBVUxUUy50cmltQXV0b1doaXRlc3BhY2U7XG5cdFx0aWYgKGNvbmZpZy5lZGl0b3IgJiYgdHlwZW9mIGNvbmZpZy5lZGl0b3IudHJpbUF1dG9XaGl0ZXNwYWNlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dHJpbUF1dG9XaGl0ZXNwYWNlID0gKGNvbmZpZy5lZGl0b3IudHJpbUF1dG9XaGl0ZXNwYWNlID09PSAnZmFsc2UnID8gZmFsc2UgOiBCb29sZWFuKGNvbmZpZy5lZGl0b3IudHJpbUF1dG9XaGl0ZXNwYWNlKSk7XG5cdFx0fVxuXG5cdFx0bGV0IGRldGVjdEluZGVudGF0aW9uID0gRURJVE9SX01PREVMX0RFRkFVTFRTLmRldGVjdEluZGVudGF0aW9uO1xuXHRcdGlmIChjb25maWcuZWRpdG9yICYmIHR5cGVvZiBjb25maWcuZWRpdG9yLmRldGVjdEluZGVudGF0aW9uICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0ZGV0ZWN0SW5kZW50YXRpb24gPSAoY29uZmlnLmVkaXRvci5kZXRlY3RJbmRlbnRhdGlvbiA9PT0gJ2ZhbHNlJyA/IGZhbHNlIDogQm9vbGVhbihjb25maWcuZWRpdG9yLmRldGVjdEluZGVudGF0aW9uKSk7XG5cdFx0fVxuXG5cdFx0bGV0IGxhcmdlRmlsZU9wdGltaXphdGlvbnMgPSBFRElUT1JfTU9ERUxfREVGQVVMVFMubGFyZ2VGaWxlT3B0aW1pemF0aW9ucztcblx0XHRpZiAoY29uZmlnLmVkaXRvciAmJiB0eXBlb2YgY29uZmlnLmVkaXRvci5sYXJnZUZpbGVPcHRpbWl6YXRpb25zICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0bGFyZ2VGaWxlT3B0aW1pemF0aW9ucyA9IChjb25maWcuZWRpdG9yLmxhcmdlRmlsZU9wdGltaXphdGlvbnMgPT09ICdmYWxzZScgPyBmYWxzZSA6IEJvb2xlYW4oY29uZmlnLmVkaXRvci5sYXJnZUZpbGVPcHRpbWl6YXRpb25zKSk7XG5cdFx0fVxuXHRcdGxldCBicmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnMgPSBFRElUT1JfTU9ERUxfREVGQVVMVFMuYnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zO1xuXHRcdGlmIChjb25maWcuZWRpdG9yPy5icmFja2V0UGFpckNvbG9yaXphdGlvbiAmJiB0eXBlb2YgY29uZmlnLmVkaXRvci5icmFja2V0UGFpckNvbG9yaXphdGlvbiA9PT0gJ29iamVjdCcpIHtcblx0XHRcdGNvbnN0IGJwQ29uZmlnID0gY29uZmlnLmVkaXRvci5icmFja2V0UGFpckNvbG9yaXphdGlvbiBhcyB7IGVuYWJsZWQ/OiB1bmtub3duOyBpbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlPzogdW5rbm93biB9O1xuXHRcdFx0YnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zID0ge1xuXHRcdFx0XHRlbmFibGVkOiAhIWJwQ29uZmlnLmVuYWJsZWQsXG5cdFx0XHRcdGluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGU6ICEhYnBDb25maWcuaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aXNGb3JTaW1wbGVXaWRnZXQ6IGlzRm9yU2ltcGxlV2lkZ2V0LFxuXHRcdFx0dGFiU2l6ZTogdGFiU2l6ZSxcblx0XHRcdGluZGVudFNpemU6IGluZGVudFNpemUsXG5cdFx0XHRpbnNlcnRTcGFjZXM6IGluc2VydFNwYWNlcyxcblx0XHRcdGRldGVjdEluZGVudGF0aW9uOiBkZXRlY3RJbmRlbnRhdGlvbixcblx0XHRcdGRlZmF1bHRFT0w6IG5ld0RlZmF1bHRFT0wsXG5cdFx0XHR0cmltQXV0b1doaXRlc3BhY2U6IHRyaW1BdXRvV2hpdGVzcGFjZSxcblx0XHRcdGxhcmdlRmlsZU9wdGltaXphdGlvbnM6IGxhcmdlRmlsZU9wdGltaXphdGlvbnMsXG5cdFx0XHRicmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnNcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RU9MKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGxhbmd1YWdlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlUHJvcGVydGllc1NlcnZpY2UuZ2V0RU9MKHJlc291cmNlLCBsYW5ndWFnZSk7XG5cdFx0fVxuXHRcdGNvbnN0IGVvbCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdmaWxlcy5lb2wnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UgfSk7XG5cdFx0aWYgKGVvbCAmJiB0eXBlb2YgZW9sID09PSAnc3RyaW5nJyAmJiBlb2wgIT09ICdhdXRvJykge1xuXHRcdFx0cmV0dXJuIGVvbDtcblx0XHR9XG5cdFx0cmV0dXJuIHBsYXRmb3JtLk9TID09PSBwbGF0Zm9ybS5PcGVyYXRpbmdTeXN0ZW0uTGludXggfHwgcGxhdGZvcm0uT1MgPT09IHBsYXRmb3JtLk9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2ggPyAnXFxuJyA6ICdcXHJcXG4nO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkUmVzdG9yZVVuZG9TdGFjaygpOiBib29sZWFuIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZmlsZXMucmVzdG9yZVVuZG9TdGFjaycpO1xuXHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGdldENyZWF0aW9uT3B0aW9ucyhsYW5ndWFnZUlkT3JTZWxlY3Rpb246IHN0cmluZyB8IElMYW5ndWFnZVNlbGVjdGlvbiwgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgaXNGb3JTaW1wbGVXaWRnZXQ6IGJvb2xlYW4pOiBJVGV4dE1vZGVsQ3JlYXRpb25PcHRpb25zIHtcblx0XHRjb25zdCBsYW5ndWFnZSA9ICh0eXBlb2YgbGFuZ3VhZ2VJZE9yU2VsZWN0aW9uID09PSAnc3RyaW5nJyA/IGxhbmd1YWdlSWRPclNlbGVjdGlvbiA6IGxhbmd1YWdlSWRPclNlbGVjdGlvbi5sYW5ndWFnZUlkKTtcblx0XHRsZXQgY3JlYXRpb25PcHRpb25zID0gdGhpcy5fbW9kZWxDcmVhdGlvbk9wdGlvbnNCeUxhbmd1YWdlQW5kUmVzb3VyY2VbbGFuZ3VhZ2UgKyByZXNvdXJjZV07XG5cdFx0aWYgKCFjcmVhdGlvbk9wdGlvbnMpIHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElSYXdFZGl0b3JDb25maWc+KCdlZGl0b3InLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UsIHJlc291cmNlIH0pO1xuXHRcdFx0Y29uc3QgZW9sID0gdGhpcy5fZ2V0RU9MKHJlc291cmNlLCBsYW5ndWFnZSk7XG5cdFx0XHRjcmVhdGlvbk9wdGlvbnMgPSBNb2RlbFNlcnZpY2UuX3JlYWRNb2RlbE9wdGlvbnMoeyBlZGl0b3IsIGVvbCB9LCBpc0ZvclNpbXBsZVdpZGdldCk7XG5cdFx0XHR0aGlzLl9tb2RlbENyZWF0aW9uT3B0aW9uc0J5TGFuZ3VhZ2VBbmRSZXNvdXJjZVtsYW5ndWFnZSArIHJlc291cmNlXSA9IGNyZWF0aW9uT3B0aW9ucztcblx0XHR9XG5cdFx0cmV0dXJuIGNyZWF0aW9uT3B0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU1vZGVsT3B0aW9ucyhlOiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkT3B0aW9uc0J5TGFuZ3VhZ2VBbmRSZXNvdXJjZSA9IHRoaXMuX21vZGVsQ3JlYXRpb25PcHRpb25zQnlMYW5ndWFnZUFuZFJlc291cmNlO1xuXHRcdHRoaXMuX21vZGVsQ3JlYXRpb25PcHRpb25zQnlMYW5ndWFnZUFuZFJlc291cmNlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRcdC8vIFVwZGF0ZSBvcHRpb25zIG9uIGFsbCBtb2RlbHNcblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5fbW9kZWxzKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0ga2V5cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbW9kZWxJZCA9IGtleXNbaV07XG5cdFx0XHRjb25zdCBtb2RlbERhdGEgPSB0aGlzLl9tb2RlbHNbbW9kZWxJZF07XG5cdFx0XHRjb25zdCBsYW5ndWFnZSA9IG1vZGVsRGF0YS5tb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHRjb25zdCB1cmkgPSBtb2RlbERhdGEubW9kZWwudXJpO1xuXG5cdFx0XHRpZiAoZSAmJiAhZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yJywgeyBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlLCByZXNvdXJjZTogdXJpIH0pICYmICFlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdmaWxlcy5lb2wnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UsIHJlc291cmNlOiB1cmkgfSkpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIHBlcmY6IHNraXAgaWYgdGhpcyBtb2RlbCBpcyBub3QgYWZmZWN0ZWQgYnkgY29uZmlndXJhdGlvbiBjaGFuZ2Vcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb2xkT3B0aW9ucyA9IG9sZE9wdGlvbnNCeUxhbmd1YWdlQW5kUmVzb3VyY2VbbGFuZ3VhZ2UgKyB1cmldO1xuXHRcdFx0Y29uc3QgbmV3T3B0aW9ucyA9IHRoaXMuZ2V0Q3JlYXRpb25PcHRpb25zKGxhbmd1YWdlLCB1cmksIG1vZGVsRGF0YS5tb2RlbC5pc0ZvclNpbXBsZVdpZGdldCk7XG5cdFx0XHRNb2RlbFNlcnZpY2UuX3NldE1vZGVsT3B0aW9uc0Zvck1vZGVsKG1vZGVsRGF0YS5tb2RlbCwgbmV3T3B0aW9ucywgb2xkT3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NldE1vZGVsT3B0aW9uc0Zvck1vZGVsKG1vZGVsOiBJVGV4dE1vZGVsLCBuZXdPcHRpb25zOiBJVGV4dE1vZGVsQ3JlYXRpb25PcHRpb25zLCBjdXJyZW50T3B0aW9uczogSVRleHRNb2RlbENyZWF0aW9uT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmIChjdXJyZW50T3B0aW9ucyAmJiBjdXJyZW50T3B0aW9ucy5kZWZhdWx0RU9MICE9PSBuZXdPcHRpb25zLmRlZmF1bHRFT0wgJiYgbW9kZWwuZ2V0TGluZUNvdW50KCkgPT09IDEpIHtcblx0XHRcdG1vZGVsLnNldEVPTChuZXdPcHRpb25zLmRlZmF1bHRFT0wgPT09IERlZmF1bHRFbmRPZkxpbmUuTEYgPyBFbmRPZkxpbmVTZXF1ZW5jZS5MRiA6IEVuZE9mTGluZVNlcXVlbmNlLkNSTEYpO1xuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50T3B0aW9uc1xuXHRcdFx0JiYgKGN1cnJlbnRPcHRpb25zLmRldGVjdEluZGVudGF0aW9uID09PSBuZXdPcHRpb25zLmRldGVjdEluZGVudGF0aW9uKVxuXHRcdFx0JiYgKGN1cnJlbnRPcHRpb25zLmluc2VydFNwYWNlcyA9PT0gbmV3T3B0aW9ucy5pbnNlcnRTcGFjZXMpXG5cdFx0XHQmJiAoY3VycmVudE9wdGlvbnMudGFiU2l6ZSA9PT0gbmV3T3B0aW9ucy50YWJTaXplKVxuXHRcdFx0JiYgKGN1cnJlbnRPcHRpb25zLmluZGVudFNpemUgPT09IG5ld09wdGlvbnMuaW5kZW50U2l6ZSlcblx0XHRcdCYmIChjdXJyZW50T3B0aW9ucy50cmltQXV0b1doaXRlc3BhY2UgPT09IG5ld09wdGlvbnMudHJpbUF1dG9XaGl0ZXNwYWNlKVxuXHRcdFx0JiYgZXF1YWxzKGN1cnJlbnRPcHRpb25zLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucywgbmV3T3B0aW9ucy5icmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnMpXG5cdFx0KSB7XG5cdFx0XHQvLyBTYW1lIGluZGVudCBvcHRzLCBubyBuZWVkIHRvIHRvdWNoIHRoZSBtb2RlbFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChuZXdPcHRpb25zLmRldGVjdEluZGVudGF0aW9uKSB7XG5cdFx0XHRtb2RlbC5kZXRlY3RJbmRlbnRhdGlvbihuZXdPcHRpb25zLmluc2VydFNwYWNlcywgbmV3T3B0aW9ucy50YWJTaXplKTtcblx0XHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHR0cmltQXV0b1doaXRlc3BhY2U6IG5ld09wdGlvbnMudHJpbUF1dG9XaGl0ZXNwYWNlLFxuXHRcdFx0XHRicmFja2V0Q29sb3JpemF0aW9uT3B0aW9uczogbmV3T3B0aW9ucy5icmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnNcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBuZXdPcHRpb25zLmluc2VydFNwYWNlcyxcblx0XHRcdFx0dGFiU2l6ZTogbmV3T3B0aW9ucy50YWJTaXplLFxuXHRcdFx0XHRpbmRlbnRTaXplOiBuZXdPcHRpb25zLmluZGVudFNpemUsXG5cdFx0XHRcdHRyaW1BdXRvV2hpdGVzcGFjZTogbmV3T3B0aW9ucy50cmltQXV0b1doaXRlc3BhY2UsXG5cdFx0XHRcdGJyYWNrZXRDb2xvcml6YXRpb25PcHRpb25zOiBuZXdPcHRpb25zLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9uc1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIGJlZ2luIElNb2RlbFNlcnZpY2VcblxuXHRwcml2YXRlIF9pbnNlcnREaXNwb3NlZE1vZGVsKGRpc3Bvc2VkTW9kZWxEYXRhOiBEaXNwb3NlZE1vZGVsSW5mbyk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2VkTW9kZWxzLnNldChNT0RFTF9JRChkaXNwb3NlZE1vZGVsRGF0YS51cmkpLCBkaXNwb3NlZE1vZGVsRGF0YSk7XG5cdFx0dGhpcy5fZGlzcG9zZWRNb2RlbHNIZWFwU2l6ZSArPSBkaXNwb3NlZE1vZGVsRGF0YS5oZWFwU2l6ZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZURpc3Bvc2VkTW9kZWwocmVzb3VyY2U6IFVSSSk6IERpc3Bvc2VkTW9kZWxJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkaXNwb3NlZE1vZGVsRGF0YSA9IHRoaXMuX2Rpc3Bvc2VkTW9kZWxzLmdldChNT0RFTF9JRChyZXNvdXJjZSkpO1xuXHRcdGlmIChkaXNwb3NlZE1vZGVsRGF0YSkge1xuXHRcdFx0dGhpcy5fZGlzcG9zZWRNb2RlbHNIZWFwU2l6ZSAtPSBkaXNwb3NlZE1vZGVsRGF0YS5oZWFwU2l6ZTtcblx0XHR9XG5cdFx0dGhpcy5fZGlzcG9zZWRNb2RlbHMuZGVsZXRlKE1PREVMX0lEKHJlc291cmNlKSk7XG5cdFx0cmV0dXJuIGRpc3Bvc2VkTW9kZWxEYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlRGlzcG9zZWRNb2RlbHNIZWFwU2l6ZShtYXhNb2RlbHNIZWFwU2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Rpc3Bvc2VkTW9kZWxzSGVhcFNpemUgPiBtYXhNb2RlbHNIZWFwU2l6ZSkge1xuXHRcdFx0Ly8gd2UgbXVzdCByZW1vdmUgc29tZSBvbGQgdW5kbyBzdGFjayBlbGVtZW50cyB0byBmcmVlIHVwIHNvbWUgbWVtb3J5XG5cdFx0XHRjb25zdCBkaXNwb3NlZE1vZGVsczogRGlzcG9zZWRNb2RlbEluZm9bXSA9IFtdO1xuXHRcdFx0dGhpcy5fZGlzcG9zZWRNb2RlbHMuZm9yRWFjaChlbnRyeSA9PiB7XG5cdFx0XHRcdGlmICghZW50cnkuc2hhcmVzVW5kb1JlZG9TdGFjaykge1xuXHRcdFx0XHRcdGRpc3Bvc2VkTW9kZWxzLnB1c2goZW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGRpc3Bvc2VkTW9kZWxzLnNvcnQoKGEsIGIpID0+IGEudGltZSAtIGIudGltZSk7XG5cdFx0XHR3aGlsZSAoZGlzcG9zZWRNb2RlbHMubGVuZ3RoID4gMCAmJiB0aGlzLl9kaXNwb3NlZE1vZGVsc0hlYXBTaXplID4gbWF4TW9kZWxzSGVhcFNpemUpIHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zZWRNb2RlbCA9IGRpc3Bvc2VkTW9kZWxzLnNoaWZ0KCkhO1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVEaXNwb3NlZE1vZGVsKGRpc3Bvc2VkTW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKGRpc3Bvc2VkTW9kZWwuaW5pdGlhbFVuZG9SZWRvU25hcHNob3QgIT09IG51bGwpIHtcblx0XHRcdFx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UucmVzdG9yZVNuYXBzaG90KGRpc3Bvc2VkTW9kZWwuaW5pdGlhbFVuZG9SZWRvU25hcHNob3QpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlTW9kZWxEYXRhKHZhbHVlOiBzdHJpbmcgfCBJVGV4dEJ1ZmZlckZhY3RvcnksIGxhbmd1YWdlSWRPclNlbGVjdGlvbjogc3RyaW5nIHwgSUxhbmd1YWdlU2VsZWN0aW9uLCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBpc0ZvclNpbXBsZVdpZGdldDogYm9vbGVhbik6IE1vZGVsRGF0YSB7XG5cdFx0Ly8gY3JlYXRlICYgc2F2ZSB0aGUgbW9kZWxcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5nZXRDcmVhdGlvbk9wdGlvbnMobGFuZ3VhZ2VJZE9yU2VsZWN0aW9uLCByZXNvdXJjZSwgaXNGb3JTaW1wbGVXaWRnZXQpO1xuXHRcdGNvbnN0IG1vZGVsOiBUZXh0TW9kZWwgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0TW9kZWwsXG5cdFx0XHR2YWx1ZSxcblx0XHRcdGxhbmd1YWdlSWRPclNlbGVjdGlvbixcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRyZXNvdXJjZVxuXHRcdCk7XG5cdFx0aWYgKHJlc291cmNlICYmIHRoaXMuX2Rpc3Bvc2VkTW9kZWxzLmhhcyhNT0RFTF9JRChyZXNvdXJjZSkpKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NlZE1vZGVsRGF0YSA9IHRoaXMuX3JlbW92ZURpc3Bvc2VkTW9kZWwocmVzb3VyY2UpITtcblx0XHRcdGNvbnN0IGVsZW1lbnRzID0gdGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmdldEVsZW1lbnRzKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IHNoYTFDb21wdXRlciA9IHRoaXMuX2dldFNIQTFDb21wdXRlcigpO1xuXHRcdFx0Y29uc3Qgc2hhMUlzRXF1YWwgPSAoXG5cdFx0XHRcdHNoYTFDb21wdXRlci5jYW5Db21wdXRlU0hBMShtb2RlbClcblx0XHRcdFx0XHQ/IHNoYTFDb21wdXRlci5jb21wdXRlU0hBMShtb2RlbCkgPT09IGRpc3Bvc2VkTW9kZWxEYXRhLnNoYTFcblx0XHRcdFx0XHQ6IGZhbHNlXG5cdFx0XHQpO1xuXHRcdFx0aWYgKHNoYTFJc0VxdWFsIHx8IGRpc3Bvc2VkTW9kZWxEYXRhLnNoYXJlc1VuZG9SZWRvU3RhY2spIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzLnBhc3QpIHtcblx0XHRcdFx0XHRpZiAoaXNFZGl0U3RhY2tFbGVtZW50KGVsZW1lbnQpICYmIGVsZW1lbnQubWF0Y2hlc1Jlc291cmNlKHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5zZXRNb2RlbChtb2RlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cy5mdXR1cmUpIHtcblx0XHRcdFx0XHRpZiAoaXNFZGl0U3RhY2tFbGVtZW50KGVsZW1lbnQpICYmIGVsZW1lbnQubWF0Y2hlc1Jlc291cmNlKHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5zZXRNb2RlbChtb2RlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VuZG9SZWRvU2VydmljZS5zZXRFbGVtZW50c1ZhbGlkRmxhZyhyZXNvdXJjZSwgdHJ1ZSwgKGVsZW1lbnQpID0+IChpc0VkaXRTdGFja0VsZW1lbnQoZWxlbWVudCkgJiYgZWxlbWVudC5tYXRjaGVzUmVzb3VyY2UocmVzb3VyY2UpKSk7XG5cdFx0XHRcdGlmIChzaGExSXNFcXVhbCkge1xuXHRcdFx0XHRcdG1vZGVsLl9vdmVyd3JpdGVWZXJzaW9uSWQoZGlzcG9zZWRNb2RlbERhdGEudmVyc2lvbklkKTtcblx0XHRcdFx0XHRtb2RlbC5fb3ZlcndyaXRlQWx0ZXJuYXRpdmVWZXJzaW9uSWQoZGlzcG9zZWRNb2RlbERhdGEuYWx0ZXJuYXRpdmVWZXJzaW9uSWQpO1xuXHRcdFx0XHRcdG1vZGVsLl9vdmVyd3JpdGVJbml0aWFsVW5kb1JlZG9TbmFwc2hvdChkaXNwb3NlZE1vZGVsRGF0YS5pbml0aWFsVW5kb1JlZG9TbmFwc2hvdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChkaXNwb3NlZE1vZGVsRGF0YS5pbml0aWFsVW5kb1JlZG9TbmFwc2hvdCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdHRoaXMuX3VuZG9SZWRvU2VydmljZS5yZXN0b3JlU25hcHNob3QoZGlzcG9zZWRNb2RlbERhdGEuaW5pdGlhbFVuZG9SZWRvU25hcHNob3QpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsSWQgPSBNT0RFTF9JRChtb2RlbC51cmkpO1xuXG5cdFx0aWYgKHRoaXMuX21vZGVsc1ttb2RlbElkXSkge1xuXHRcdFx0Ly8gVGhlcmUgYWxyZWFkeSBleGlzdHMgYSBtb2RlbCB3aXRoIHRoaXMgaWQgPT4gdGhpcyBpcyBhIHByb2dyYW1tZXIgZXJyb3Jcblx0XHRcdHRocm93IG5ldyBFcnJvcignTW9kZWxTZXJ2aWNlOiBDYW5ub3QgYWRkIG1vZGVsIGJlY2F1c2UgaXQgYWxyZWFkeSBleGlzdHMhJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gbmV3IE1vZGVsRGF0YShcblx0XHRcdG1vZGVsLFxuXHRcdFx0KG1vZGVsKSA9PiB0aGlzLl9vbldpbGxEaXNwb3NlKG1vZGVsKSxcblx0XHRcdChtb2RlbCwgZSkgPT4gdGhpcy5fb25EaWRDaGFuZ2VMYW5ndWFnZShtb2RlbCwgZSlcblx0XHQpO1xuXHRcdHRoaXMuX21vZGVsc1ttb2RlbElkXSA9IG1vZGVsRGF0YTtcblxuXHRcdHJldHVybiBtb2RlbERhdGE7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlTW9kZWwobW9kZWw6IElUZXh0TW9kZWwsIHZhbHVlOiBzdHJpbmcgfCBJVGV4dEJ1ZmZlckZhY3RvcnksIHJlYXNvbjogVGV4dE1vZGVsRWRpdFNvdXJjZSA9IEVkaXRTb3VyY2VzLnVua25vd24oeyBuYW1lOiAndXBkYXRlTW9kZWwnIH0pKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuZ2V0Q3JlYXRpb25PcHRpb25zKG1vZGVsLmdldExhbmd1YWdlSWQoKSwgbW9kZWwudXJpLCBtb2RlbC5pc0ZvclNpbXBsZVdpZGdldCk7XG5cdFx0Y29uc3QgeyB0ZXh0QnVmZmVyLCBkaXNwb3NhYmxlIH0gPSBjcmVhdGVUZXh0QnVmZmVyKHZhbHVlLCBvcHRpb25zLmRlZmF1bHRFT0wpO1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIHRoZSB0ZXh0IGlzIGFscmVhZHkgc2V0IGluIHRoYXQgZm9ybVxuXHRcdGlmIChtb2RlbC5lcXVhbHNUZXh0QnVmZmVyKHRleHRCdWZmZXIpKSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgZmluZCBhIGRpZmYgYmV0d2VlbiB0aGUgdmFsdWVzIGFuZCB1cGRhdGUgbW9kZWxcblx0XHRtb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0bW9kZWwucHVzaEVPTCh0ZXh0QnVmZmVyLmdldEVPTCgpID09PSAnXFxyXFxuJyA/IEVuZE9mTGluZVNlcXVlbmNlLkNSTEYgOiBFbmRPZkxpbmVTZXF1ZW5jZS5MRik7XG5cdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFxuXHRcdFx0W10sXG5cdFx0XHRNb2RlbFNlcnZpY2UuX2NvbXB1dGVFZGl0cyhtb2RlbCwgdGV4dEJ1ZmZlciksXG5cdFx0XHQoKSA9PiBbXSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHJlYXNvblxuXHRcdCk7XG5cdFx0bW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbW1vblByZWZpeChhOiBJVGV4dE1vZGVsLCBhTGVuOiBudW1iZXIsIGFEZWx0YTogbnVtYmVyLCBiOiBJVGV4dEJ1ZmZlciwgYkxlbjogbnVtYmVyLCBiRGVsdGE6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgbWF4UmVzdWx0ID0gTWF0aC5taW4oYUxlbiwgYkxlbik7XG5cblx0XHRsZXQgcmVzdWx0ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1heFJlc3VsdCAmJiBhLmdldExpbmVDb250ZW50KGFEZWx0YSArIGkpID09PSBiLmdldExpbmVDb250ZW50KGJEZWx0YSArIGkpOyBpKyspIHtcblx0XHRcdHJlc3VsdCsrO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbW1vblN1ZmZpeChhOiBJVGV4dE1vZGVsLCBhTGVuOiBudW1iZXIsIGFEZWx0YTogbnVtYmVyLCBiOiBJVGV4dEJ1ZmZlciwgYkxlbjogbnVtYmVyLCBiRGVsdGE6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgbWF4UmVzdWx0ID0gTWF0aC5taW4oYUxlbiwgYkxlbik7XG5cblx0XHRsZXQgcmVzdWx0ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1heFJlc3VsdCAmJiBhLmdldExpbmVDb250ZW50KGFEZWx0YSArIGFMZW4gLSBpKSA9PT0gYi5nZXRMaW5lQ29udGVudChiRGVsdGEgKyBiTGVuIC0gaSk7IGkrKykge1xuXHRcdFx0cmVzdWx0Kys7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZSBlZGl0cyB0byBicmluZyBgbW9kZWxgIHRvIHRoZSBzdGF0ZSBvZiBgdGV4dFNvdXJjZWAuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIF9jb21wdXRlRWRpdHMobW9kZWw6IElUZXh0TW9kZWwsIHRleHRCdWZmZXI6IElUZXh0QnVmZmVyKTogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSB7XG5cdFx0Y29uc3QgbW9kZWxMaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCB0ZXh0QnVmZmVyTGluZUNvdW50ID0gdGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCBjb21tb25QcmVmaXggPSB0aGlzLl9jb21tb25QcmVmaXgobW9kZWwsIG1vZGVsTGluZUNvdW50LCAxLCB0ZXh0QnVmZmVyLCB0ZXh0QnVmZmVyTGluZUNvdW50LCAxKTtcblxuXHRcdGlmIChtb2RlbExpbmVDb3VudCA9PT0gdGV4dEJ1ZmZlckxpbmVDb3VudCAmJiBjb21tb25QcmVmaXggPT09IG1vZGVsTGluZUNvdW50KSB7XG5cdFx0XHQvLyBlcXVhbGl0eSBjYXNlXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbW9uU3VmZml4ID0gdGhpcy5fY29tbW9uU3VmZml4KG1vZGVsLCBtb2RlbExpbmVDb3VudCAtIGNvbW1vblByZWZpeCwgY29tbW9uUHJlZml4LCB0ZXh0QnVmZmVyLCB0ZXh0QnVmZmVyTGluZUNvdW50IC0gY29tbW9uUHJlZml4LCBjb21tb25QcmVmaXgpO1xuXG5cdFx0bGV0IG9sZFJhbmdlOiBSYW5nZTtcblx0XHRsZXQgbmV3UmFuZ2U6IFJhbmdlO1xuXHRcdGlmIChjb21tb25TdWZmaXggPiAwKSB7XG5cdFx0XHRvbGRSYW5nZSA9IG5ldyBSYW5nZShjb21tb25QcmVmaXggKyAxLCAxLCBtb2RlbExpbmVDb3VudCAtIGNvbW1vblN1ZmZpeCArIDEsIDEpO1xuXHRcdFx0bmV3UmFuZ2UgPSBuZXcgUmFuZ2UoY29tbW9uUHJlZml4ICsgMSwgMSwgdGV4dEJ1ZmZlckxpbmVDb3VudCAtIGNvbW1vblN1ZmZpeCArIDEsIDEpO1xuXHRcdH0gZWxzZSBpZiAoY29tbW9uUHJlZml4ID4gMCkge1xuXHRcdFx0b2xkUmFuZ2UgPSBuZXcgUmFuZ2UoY29tbW9uUHJlZml4LCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGNvbW1vblByZWZpeCksIG1vZGVsTGluZUNvdW50LCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKG1vZGVsTGluZUNvdW50KSk7XG5cdFx0XHRuZXdSYW5nZSA9IG5ldyBSYW5nZShjb21tb25QcmVmaXgsIDEgKyB0ZXh0QnVmZmVyLmdldExpbmVMZW5ndGgoY29tbW9uUHJlZml4KSwgdGV4dEJ1ZmZlckxpbmVDb3VudCwgMSArIHRleHRCdWZmZXIuZ2V0TGluZUxlbmd0aCh0ZXh0QnVmZmVyTGluZUNvdW50KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9sZFJhbmdlID0gbmV3IFJhbmdlKDEsIDEsIG1vZGVsTGluZUNvdW50LCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKG1vZGVsTGluZUNvdW50KSk7XG5cdFx0XHRuZXdSYW5nZSA9IG5ldyBSYW5nZSgxLCAxLCB0ZXh0QnVmZmVyTGluZUNvdW50LCAxICsgdGV4dEJ1ZmZlci5nZXRMaW5lTGVuZ3RoKHRleHRCdWZmZXJMaW5lQ291bnQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW0VkaXRPcGVyYXRpb24ucmVwbGFjZU1vdmUob2xkUmFuZ2UsIHRleHRCdWZmZXIuZ2V0VmFsdWVJblJhbmdlKG5ld1JhbmdlLCBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKSldO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZU1vZGVsKHZhbHVlOiBzdHJpbmcgfCBJVGV4dEJ1ZmZlckZhY3RvcnksIGxhbmd1YWdlU2VsZWN0aW9uOiBJTGFuZ3VhZ2VTZWxlY3Rpb24gfCBudWxsLCByZXNvdXJjZT86IFVSSSwgaXNGb3JTaW1wbGVXaWRnZXQ6IGJvb2xlYW4gPSBmYWxzZSk6IElUZXh0TW9kZWwge1xuXHRcdGxldCBtb2RlbERhdGE6IE1vZGVsRGF0YTtcblxuXHRcdGlmIChsYW5ndWFnZVNlbGVjdGlvbikge1xuXHRcdFx0bW9kZWxEYXRhID0gdGhpcy5fY3JlYXRlTW9kZWxEYXRhKHZhbHVlLCBsYW5ndWFnZVNlbGVjdGlvbiwgcmVzb3VyY2UsIGlzRm9yU2ltcGxlV2lkZ2V0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kZWxEYXRhID0gdGhpcy5fY3JlYXRlTW9kZWxEYXRhKHZhbHVlLCBQTEFJTlRFWFRfTEFOR1VBR0VfSUQsIHJlc291cmNlLCBpc0ZvclNpbXBsZVdpZGdldCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25Nb2RlbEFkZGVkLmZpcmUobW9kZWxEYXRhLm1vZGVsKTtcblxuXHRcdHJldHVybiBtb2RlbERhdGEubW9kZWw7XG5cdH1cblxuXHRwdWJsaWMgZGVzdHJveU1vZGVsKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHQvLyBXZSBuZWVkIHRvIHN1cHBvcnQgdGhhdCBub3QgYWxsIG1vZGVscyBnZXQgZGlzcG9zZWQgdGhyb3VnaCB0aGlzIHNlcnZpY2UgKGkuZS4gbW9kZWwuZGlzcG9zZSgpIHNob3VsZCB3b3JrISlcblx0XHRjb25zdCBtb2RlbERhdGEgPSB0aGlzLl9tb2RlbHNbTU9ERUxfSUQocmVzb3VyY2UpXTtcblx0XHRpZiAoIW1vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRtb2RlbERhdGEubW9kZWwuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIGdldE1vZGVscygpOiBJVGV4dE1vZGVsW10ge1xuXHRcdGNvbnN0IHJldDogSVRleHRNb2RlbFtdID0gW107XG5cblx0XHRjb25zdCBrZXlzID0gT2JqZWN0LmtleXModGhpcy5fbW9kZWxzKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0ga2V5cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbW9kZWxJZCA9IGtleXNbaV07XG5cdFx0XHRyZXQucHVzaCh0aGlzLl9tb2RlbHNbbW9kZWxJZF0ubW9kZWwpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TW9kZWwocmVzb3VyY2U6IFVSSSk6IElUZXh0TW9kZWwgfCBudWxsIHtcblx0XHRjb25zdCBtb2RlbElkID0gTU9ERUxfSUQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IG1vZGVsRGF0YSA9IHRoaXMuX21vZGVsc1ttb2RlbElkXTtcblx0XHRpZiAoIW1vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbERhdGEubW9kZWw7XG5cdH1cblxuXHQvLyAtLS0gZW5kIElNb2RlbFNlcnZpY2VcblxuXHRwcm90ZWN0ZWQgX3NjaGVtYVNob3VsZE1haW50YWluVW5kb1JlZG9FbGVtZW50cyhyZXNvdXJjZTogVVJJKSB7XG5cdFx0cmV0dXJuIChcblx0XHRcdHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlXG5cdFx0XHR8fCByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlUmVtb3RlXG5cdFx0XHR8fCByZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlVXNlckRhdGFcblx0XHRcdHx8IHJlc291cmNlLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGxcblx0XHRcdHx8IHJlc291cmNlLnNjaGVtZSA9PT0gJ2Zha2UtZnMnIC8vIGZvciB0ZXN0c1xuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbldpbGxEaXNwb3NlKG1vZGVsOiBJVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWxJZCA9IE1PREVMX0lEKG1vZGVsLnVyaSk7XG5cdFx0Y29uc3QgbW9kZWxEYXRhID0gdGhpcy5fbW9kZWxzW21vZGVsSWRdO1xuXG5cdFx0Y29uc3Qgc2hhcmVzVW5kb1JlZG9TdGFjayA9ICh0aGlzLl91bmRvUmVkb1NlcnZpY2UuZ2V0VXJpQ29tcGFyaXNvbktleShtb2RlbC51cmkpICE9PSBtb2RlbC51cmkudG9TdHJpbmcoKSk7XG5cdFx0bGV0IG1haW50YWluVW5kb1JlZG9TdGFjayA9IGZhbHNlO1xuXHRcdGxldCBoZWFwU2l6ZSA9IDA7XG5cdFx0aWYgKHNoYXJlc1VuZG9SZWRvU3RhY2sgfHwgKHRoaXMuX3Nob3VsZFJlc3RvcmVVbmRvU3RhY2soKSAmJiB0aGlzLl9zY2hlbWFTaG91bGRNYWludGFpblVuZG9SZWRvRWxlbWVudHMobW9kZWwudXJpKSkpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnRzID0gdGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmdldEVsZW1lbnRzKG1vZGVsLnVyaSk7XG5cdFx0XHRpZiAoZWxlbWVudHMucGFzdC5sZW5ndGggPiAwIHx8IGVsZW1lbnRzLmZ1dHVyZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cy5wYXN0KSB7XG5cdFx0XHRcdFx0aWYgKGlzRWRpdFN0YWNrRWxlbWVudChlbGVtZW50KSAmJiBlbGVtZW50Lm1hdGNoZXNSZXNvdXJjZShtb2RlbC51cmkpKSB7XG5cdFx0XHRcdFx0XHRtYWludGFpblVuZG9SZWRvU3RhY2sgPSB0cnVlO1xuXHRcdFx0XHRcdFx0aGVhcFNpemUgKz0gZWxlbWVudC5oZWFwU2l6ZShtb2RlbC51cmkpO1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5zZXRNb2RlbChtb2RlbC51cmkpOyAvLyByZW1vdmUgcmVmZXJlbmNlIGZyb20gdGV4dCBidWZmZXIgaW5zdGFuY2Vcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzLmZ1dHVyZSkge1xuXHRcdFx0XHRcdGlmIChpc0VkaXRTdGFja0VsZW1lbnQoZWxlbWVudCkgJiYgZWxlbWVudC5tYXRjaGVzUmVzb3VyY2UobW9kZWwudXJpKSkge1xuXHRcdFx0XHRcdFx0bWFpbnRhaW5VbmRvUmVkb1N0YWNrID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGhlYXBTaXplICs9IGVsZW1lbnQuaGVhcFNpemUobW9kZWwudXJpKTtcblx0XHRcdFx0XHRcdGVsZW1lbnQuc2V0TW9kZWwobW9kZWwudXJpKTsgLy8gcmVtb3ZlIHJlZmVyZW5jZSBmcm9tIHRleHQgYnVmZmVyIGluc3RhbmNlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF4TWVtb3J5ID0gTW9kZWxTZXJ2aWNlLk1BWF9NRU1PUllfRk9SX0NMT1NFRF9GSUxFU19VTkRPX1NUQUNLO1xuXHRcdGNvbnN0IHNoYTFDb21wdXRlciA9IHRoaXMuX2dldFNIQTFDb21wdXRlcigpO1xuXHRcdGlmICghbWFpbnRhaW5VbmRvUmVkb1N0YWNrKSB7XG5cdFx0XHRpZiAoIXNoYXJlc1VuZG9SZWRvU3RhY2spIHtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbFVuZG9SZWRvU25hcHNob3QgPSBtb2RlbERhdGEubW9kZWwuZ2V0SW5pdGlhbFVuZG9SZWRvU25hcHNob3QoKTtcblx0XHRcdFx0aWYgKGluaXRpYWxVbmRvUmVkb1NuYXBzaG90ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0dGhpcy5fdW5kb1JlZG9TZXJ2aWNlLnJlc3RvcmVTbmFwc2hvdChpbml0aWFsVW5kb1JlZG9TbmFwc2hvdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCFzaGFyZXNVbmRvUmVkb1N0YWNrICYmIChoZWFwU2l6ZSA+IG1heE1lbW9yeSB8fCAhc2hhMUNvbXB1dGVyLmNhbkNvbXB1dGVTSEExKG1vZGVsKSkpIHtcblx0XHRcdC8vIHRoZSB1bmRvIHN0YWNrIGZvciB0aGlzIGZpbGUgd291bGQgbmV2ZXIgZml0IGluIHRoZSBjb25maWd1cmVkIG1lbW9yeSBvciB0aGUgZmlsZSBpcyB2ZXJ5IGxhcmdlLCBzbyBkb24ndCBib3RoZXIgd2l0aCBpdC5cblx0XHRcdGNvbnN0IGluaXRpYWxVbmRvUmVkb1NuYXBzaG90ID0gbW9kZWxEYXRhLm1vZGVsLmdldEluaXRpYWxVbmRvUmVkb1NuYXBzaG90KCk7XG5cdFx0XHRpZiAoaW5pdGlhbFVuZG9SZWRvU25hcHNob3QgIT09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5fdW5kb1JlZG9TZXJ2aWNlLnJlc3RvcmVTbmFwc2hvdChpbml0aWFsVW5kb1JlZG9TbmFwc2hvdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2Vuc3VyZURpc3Bvc2VkTW9kZWxzSGVhcFNpemUobWF4TWVtb3J5IC0gaGVhcFNpemUpO1xuXHRcdFx0Ly8gV2Ugb25seSBpbnZhbGlkYXRlIHRoZSBlbGVtZW50cywgYnV0IHRoZXkgcmVtYWluIGluIHRoZSB1bmRvLXJlZG8gc2VydmljZS5cblx0XHRcdHRoaXMuX3VuZG9SZWRvU2VydmljZS5zZXRFbGVtZW50c1ZhbGlkRmxhZyhtb2RlbC51cmksIGZhbHNlLCAoZWxlbWVudCkgPT4gKGlzRWRpdFN0YWNrRWxlbWVudChlbGVtZW50KSAmJiBlbGVtZW50Lm1hdGNoZXNSZXNvdXJjZShtb2RlbC51cmkpKSk7XG5cdFx0XHR0aGlzLl9pbnNlcnREaXNwb3NlZE1vZGVsKG5ldyBEaXNwb3NlZE1vZGVsSW5mbyhtb2RlbC51cmksIG1vZGVsRGF0YS5tb2RlbC5nZXRJbml0aWFsVW5kb1JlZG9TbmFwc2hvdCgpLCBEYXRlLm5vdygpLCBzaGFyZXNVbmRvUmVkb1N0YWNrLCBoZWFwU2l6ZSwgc2hhMUNvbXB1dGVyLmNvbXB1dGVTSEExKG1vZGVsKSwgbW9kZWwuZ2V0VmVyc2lvbklkKCksIG1vZGVsLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCkpKTtcblx0XHR9XG5cblx0XHRkZWxldGUgdGhpcy5fbW9kZWxzW21vZGVsSWRdO1xuXHRcdG1vZGVsRGF0YS5kaXNwb3NlKCk7XG5cblx0XHQvLyBjbGVhbiB1cCBjYWNoZVxuXHRcdGRlbGV0ZSB0aGlzLl9tb2RlbENyZWF0aW9uT3B0aW9uc0J5TGFuZ3VhZ2VBbmRSZXNvdXJjZVttb2RlbC5nZXRMYW5ndWFnZUlkKCkgKyBtb2RlbC51cmldO1xuXG5cdFx0dGhpcy5fb25Nb2RlbFJlbW92ZWQuZmlyZShtb2RlbCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUxhbmd1YWdlKG1vZGVsOiBJVGV4dE1vZGVsLCBlOiBJTW9kZWxMYW5ndWFnZUNoYW5nZWRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZExhbmd1YWdlSWQgPSBlLm9sZExhbmd1YWdlO1xuXHRcdGNvbnN0IG5ld0xhbmd1YWdlSWQgPSBtb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0Y29uc3Qgb2xkT3B0aW9ucyA9IHRoaXMuZ2V0Q3JlYXRpb25PcHRpb25zKG9sZExhbmd1YWdlSWQsIG1vZGVsLnVyaSwgbW9kZWwuaXNGb3JTaW1wbGVXaWRnZXQpO1xuXHRcdGNvbnN0IG5ld09wdGlvbnMgPSB0aGlzLmdldENyZWF0aW9uT3B0aW9ucyhuZXdMYW5ndWFnZUlkLCBtb2RlbC51cmksIG1vZGVsLmlzRm9yU2ltcGxlV2lkZ2V0KTtcblx0XHRNb2RlbFNlcnZpY2UuX3NldE1vZGVsT3B0aW9uc0Zvck1vZGVsKG1vZGVsLCBuZXdPcHRpb25zLCBvbGRPcHRpb25zKTtcblx0XHR0aGlzLl9vbk1vZGVsTW9kZUNoYW5nZWQuZmlyZSh7IG1vZGVsLCBvbGRMYW5ndWFnZUlkOiBvbGRMYW5ndWFnZUlkIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRTSEExQ29tcHV0ZXIoKTogSVRleHRNb2RlbFNIQTFDb21wdXRlciB7XG5cdFx0cmV0dXJuIG5ldyBEZWZhdWx0TW9kZWxTSEExQ29tcHV0ZXIoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXh0TW9kZWxTSEExQ29tcHV0ZXIge1xuXHRjYW5Db21wdXRlU0hBMShtb2RlbDogSVRleHRNb2RlbCk6IGJvb2xlYW47XG5cdGNvbXB1dGVTSEExKG1vZGVsOiBJVGV4dE1vZGVsKTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRGVmYXVsdE1vZGVsU0hBMUNvbXB1dGVyIGltcGxlbWVudHMgSVRleHRNb2RlbFNIQTFDb21wdXRlciB7XG5cblx0cHVibGljIHN0YXRpYyBNQVhfTU9ERUxfU0laRSA9IDEwICogMTAyNCAqIDEwMjQ7IC8vIHRha2VzIDIwMG1zIHRvIGNvbXB1dGUgYSBzaGExIG9uIGEgMTBNQiBtb2RlbCBvbiBhIG5ldyBtYWNoaW5lXG5cblx0Y2FuQ29tcHV0ZVNIQTEobW9kZWw6IElUZXh0TW9kZWwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKG1vZGVsLmdldFZhbHVlTGVuZ3RoKCkgPD0gRGVmYXVsdE1vZGVsU0hBMUNvbXB1dGVyLk1BWF9NT0RFTF9TSVpFKTtcblx0fVxuXG5cdGNvbXB1dGVTSEExKG1vZGVsOiBJVGV4dE1vZGVsKTogc3RyaW5nIHtcblx0XHQvLyBjb21wdXRlIHRoZSBzaGExXG5cdFx0Y29uc3Qgc2hhQ29tcHV0ZXIgPSBuZXcgU3RyaW5nU0hBMSgpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbW9kZWwuY3JlYXRlU25hcHNob3QoKTtcblx0XHRsZXQgdGV4dDogc3RyaW5nIHwgbnVsbDtcblx0XHR3aGlsZSAoKHRleHQgPSBzbmFwc2hvdC5yZWFkKCkpKSB7XG5cdFx0XHRzaGFDb21wdXRlci51cGRhdGUodGV4dCk7XG5cdFx0fVxuXHRcdHJldHVybiBzaGFDb21wdXRlci5kaWdlc3QoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYztBQUN2QixZQUFZLGNBQWM7QUFFMUIsU0FBb0MsNkJBQTZCO0FBQ2pFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQW1EO0FBQzVELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQTJDO0FBQ3BELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYTtBQUV0QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQixxQkFBcUIseUJBQWlHO0FBQ2pKLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsV0FBVyx3QkFBd0I7QUFDNUMsU0FBUyxtQkFBd0M7QUFHakQsU0FBUyxzQ0FBc0M7QUFFL0MsU0FBUyxTQUFTLFVBQXVCO0FBQ3hDLFNBQU8sU0FBUyxTQUFTO0FBQzFCO0FBRUEsTUFBTSxVQUFpQztBQUFBLEVBSXRDLFlBQ2lCLE9BQ2hCLGVBQ0EscUJBQ0M7QUFIZTtBQUhqQixTQUFpQix1QkFBdUIsSUFBSSxnQkFBZ0I7QUFPM0QsU0FBSyxRQUFRO0FBQ2IsU0FBSyxxQkFBcUIsSUFBSSxNQUFNLGNBQWMsTUFBTSxjQUFjLEtBQUssQ0FBQyxDQUFDO0FBQzdFLFNBQUsscUJBQXFCLElBQUksTUFBTSxvQkFBb0IsQ0FBQyxNQUFNLG9CQUFvQixPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQUEs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
