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
import { EditorInputCapabilities, DEFAULT_EDITOR_ASSOCIATION, findViewStateForEditor, isResourceEditorInput } from "../../../../common/editor.js";
import { AbstractTextResourceEditorInput } from "../../../../common/editor/textResourceEditorInput.js";
import { BinaryEditorModel } from "../../../../common/editor/binaryEditorModel.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ITextFileService, TextFileEditorModelState, TextFileResolveReason, TextFileOperationResult } from "../../../../services/textfile/common/textfiles.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { dispose, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { FILE_EDITOR_INPUT_ID, TEXT_FILE_EDITOR_ID, BINARY_FILE_EDITOR_ID } from "../../common/files.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { IFilesConfigurationService } from "../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { Event } from "../../../../../base/common/event.js";
import { Schemas } from "../../../../../base/common/network.js";
import { createTextBufferFactory } from "../../../../../editor/common/model/textModel.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { ITextResourceConfigurationService } from "../../../../../editor/common/services/textResourceConfiguration.js";
import { ICustomEditorLabelService } from "../../../../services/editor/common/customEditorLabelService.js";
var ForceOpenAs = /* @__PURE__ */ ((ForceOpenAs2) => {
  ForceOpenAs2[ForceOpenAs2["None"] = 0] = "None";
  ForceOpenAs2[ForceOpenAs2["Text"] = 1] = "Text";
  ForceOpenAs2[ForceOpenAs2["Binary"] = 2] = "Binary";
  return ForceOpenAs2;
})(ForceOpenAs || {});
let FileEditorInput = class extends AbstractTextResourceEditorInput {
  constructor(resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents, instantiationService, textFileService, textModelService, labelService, fileService, filesConfigurationService, editorService, pathService, textResourceConfigurationService, customEditorLabelService) {
    super(resource, preferredResource, editorService, textFileService, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
    this.instantiationService = instantiationService;
    this.textModelService = textModelService;
    this.pathService = pathService;
    this.forceOpenAs = 0 /* None */;
    this.model = void 0;
    this.cachedTextFileModelReference = void 0;
    this.modelListeners = this._register(new DisposableStore());
    this.model = this.textFileService.files.get(resource);
    if (preferredName) {
      this.setPreferredName(preferredName);
    }
    if (preferredDescription) {
      this.setPreferredDescription(preferredDescription);
    }
    if (preferredEncoding) {
      this.setPreferredEncoding(preferredEncoding);
    }
    if (preferredLanguageId) {
      this.setPreferredLanguageId(preferredLanguageId);
    }
    if (typeof preferredContents === "string") {
      this.setPreferredContents(preferredContents);
    }
    this._register(this.textFileService.files.onDidCreate((model) => this.onDidCreateTextFileModel(model)));
    if (this.model) {
      this.registerModelListeners(this.model);
    }
  }
  get typeId() {
    return FILE_EDITOR_INPUT_ID;
  }
  get editorId() {
    return DEFAULT_EDITOR_ASSOCIATION.id;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.CanSplitInGroup;
    if (this.model) {
      if (this.model.isReadonly()) {
        capabilities |= EditorInputCapabilities.Readonly;
      }
    } else {
      if (this.fileService.hasProvider(this.resource)) {
        if (this.filesConfigurationService.isReadonly(this.resource)) {
          capabilities |= EditorInputCapabilities.Readonly;
        }
      } else {
        capabilities |= EditorInputCapabilities.Untitled;
      }
    }
    if (!(capabilities & EditorInputCapabilities.Readonly)) {
      capabilities |= EditorInputCapabilities.CanDropIntoEditor;
    }
    return capabilities;
  }
  onDidCreateTextFileModel(model) {
    if (isEqual(model.resource, this.resource)) {
      this.model = model;
      this.registerModelListeners(model);
    }
  }
  registerModelListeners(model) {
    this.modelListeners.clear();
    this.modelListeners.add(model.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
    this.modelListeners.add(model.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
    this.modelListeners.add(model.onDidSaveError(() => this._onDidChangeDirty.fire()));
    this.modelListeners.add(Event.once(model.onWillDispose)(() => {
      this.modelListeners.clear();
      this.model = void 0;
    }));
  }
  getName() {
    return this.preferredName || super.getName();
  }
  setPreferredName(name) {
    if (!this.allowLabelOverride()) {
      return;
    }
    if (this.preferredName !== name) {
      this.preferredName = name;
      this._onDidChangeLabel.fire();
    }
  }
  allowLabelOverride() {
    return this.resource.scheme !== this.pathService.defaultUriScheme && this.resource.scheme !== Schemas.vscodeUserData && this.resource.scheme !== Schemas.file && this.resource.scheme !== Schemas.vscodeRemote;
  }
  getPreferredName() {
    return this.preferredName;
  }
  isReadonly() {
    return this.model ? this.model.isReadonly() : this.filesConfigurationService.isReadonly(this.resource);
  }
  getDescription(verbosity) {
    return this.preferredDescription || super.getDescription(verbosity);
  }
  setPreferredDescription(description) {
    if (!this.allowLabelOverride()) {
      return;
    }
    if (this.preferredDescription !== description) {
      this.preferredDescription = description;
      this._onDidChangeLabel.fire();
    }
  }
  getPreferredDescription() {
    return this.preferredDescription;
  }
  getTitle(verbosity) {
    let title = super.getTitle(verbosity);
    const preferredTitle = this.getPreferredTitle();
    if (preferredTitle) {
      title = `${preferredTitle} (${title})`;
    }
    return title;
  }
  getPreferredTitle() {
    if (this.preferredName && this.preferredDescription) {
      return `${this.preferredName} ${this.preferredDescription}`;
    }
    if (this.preferredName || this.preferredDescription) {
      return this.preferredName ?? this.preferredDescription;
    }
    return void 0;
  }
  getEncoding() {
    if (this.model) {
      return this.model.getEncoding();
    }
    return this.preferredEncoding;
  }
  getPreferredEncoding() {
    return this.preferredEncoding;
  }
  async setEncoding(encoding, mode) {
    this.setPreferredEncoding(encoding);
    return this.model?.setEncoding(encoding, mode);
  }
  setPreferredEncoding(encoding) {
    this.preferredEncoding = encoding;
    this.setForceOpenAsText();
  }
  getLanguageId() {
    if (this.model) {
      return this.model.getLanguageId();
    }
    return this.preferredLanguageId;
  }
  getPreferredLanguageId() {
    return this.preferredLanguageId;
  }
  setLanguageId(languageId, source) {
    this.setPreferredLanguageId(languageId);
    this.model?.setLanguageId(languageId, source);
  }
  setPreferredLanguageId(languageId) {
    this.preferredLanguageId = languageId;
    this.setForceOpenAsText();
  }
  setPreferredContents(contents) {
    this.preferredContents = contents;
    this.setForceOpenAsText();
  }
  setForceOpenAsText() {
    this.forceOpenAs = 1 /* Text */;
  }
  setForceOpenAsBinary() {
    this.forceOpenAs = 2 /* Binary */;
  }
  isDirty() {
    return !!this.model?.isDirty();
  }
  isSaving() {
    if (this.model?.hasState(TextFileEditorModelState.SAVED) || this.model?.hasState(TextFileEditorModelState.CONFLICT) || this.model?.hasState(TextFileEditorModelState.ERROR)) {
      return false;
    }
    if (this.filesConfigurationService.hasShortAutoSaveDelay(this)) {
      return true;
    }
    return super.isSaving();
  }
  prefersEditorPane(editorPanes) {
    if (this.forceOpenAs === 2 /* Binary */) {
      return editorPanes.find((editorPane) => editorPane.typeId === BINARY_FILE_EDITOR_ID);
    }
    return editorPanes.find((editorPane) => editorPane.typeId === TEXT_FILE_EDITOR_ID);
  }
  resolve(options) {
    if (this.forceOpenAs === 2 /* Binary */) {
      return this.doResolveAsBinary();
    }
    return this.doResolveAsText(options);
  }
  async doResolveAsText(options) {
    try {
      const preferredContents = this.preferredContents;
      this.preferredContents = void 0;
      await this.textFileService.files.resolve(this.resource, {
        languageId: this.preferredLanguageId,
        encoding: this.preferredEncoding,
        contents: typeof preferredContents === "string" ? createTextBufferFactory(preferredContents) : void 0,
        reload: { async: true },
        // trigger a reload of the model if it exists already but do not wait to show the model
        allowBinary: this.forceOpenAs === 1 /* Text */,
        reason: TextFileResolveReason.EDITOR,
        limits: this.ensureLimits(options)
      });
      if (!this.cachedTextFileModelReference) {
        this.cachedTextFileModelReference = await this.textModelService.createModelReference(this.resource);
      }
      const model = this.cachedTextFileModelReference.object;
      if (this.isDisposed()) {
        this.disposeModelReference();
      }
      return model;
    } catch (error) {
      if (error.textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY) {
        return this.doResolveAsBinary();
      }
      throw error;
    }
  }
  async doResolveAsBinary() {
    const model = this.instantiationService.createInstance(BinaryEditorModel, this.preferredResource, this.getName());
    await model.resolve();
    return model;
  }
  isResolved() {
    return !!this.model;
  }
  async rename(group, target) {
    return {
      editor: {
        resource: target,
        encoding: this.getEncoding(),
        options: {
          viewState: findViewStateForEditor(this, group, this.editorService)
        }
      }
    };
  }
  toUntyped(options) {
    const untypedInput = {
      resource: this.preferredResource,
      forceFile: true,
      options: {
        override: this.editorId
      }
    };
    if (typeof options?.preserveViewState === "number") {
      untypedInput.encoding = this.getEncoding();
      untypedInput.languageId = this.getLanguageId();
      untypedInput.contents = (() => {
        const model = this.textFileService.files.get(this.resource);
        if (model?.isDirty() && !model.textEditorModel.isTooLargeForHeapOperation()) {
          return model.textEditorModel.getValue();
        }
        return void 0;
      })();
      untypedInput.options = {
        ...untypedInput.options,
        viewState: findViewStateForEditor(this, options.preserveViewState, this.editorService)
      };
    }
    return untypedInput;
  }
  matches(otherInput) {
    if (this === otherInput) {
      return true;
    }
    if (otherInput instanceof FileEditorInput) {
      return isEqual(otherInput.resource, this.resource);
    }
    if (isResourceEditorInput(otherInput)) {
      return super.matches(otherInput);
    }
    return false;
  }
  dispose() {
    this.model = void 0;
    this.disposeModelReference();
    super.dispose();
  }
  disposeModelReference() {
    dispose(this.cachedTextFileModelReference);
    this.cachedTextFileModelReference = void 0;
  }
};
FileEditorInput = __decorateClass([
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, ITextFileService),
  __decorateParam(9, ITextModelService),
  __decorateParam(10, ILabelService),
  __decorateParam(11, IFileService),
  __decorateParam(12, IFilesConfigurationService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IPathService),
  __decorateParam(15, ITextResourceConfigurationService),
  __decorateParam(16, ICustomEditorLabelService)
], FileEditorInput);
export {
  FileEditorInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxlZGl0b3JzXFxmaWxlRWRpdG9ySW5wdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVFZGl0b3JJbnB1dCwgVmVyYm9zaXR5LCBHcm91cElkZW50aWZpZXIsIElNb3ZlUmVzdWx0LCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgSUVkaXRvckRlc2NyaXB0b3IsIElFZGl0b3JQYW5lLCBJVW50eXBlZEVkaXRvcklucHV0LCBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiwgSVVudHlwZWRGaWxlRWRpdG9ySW5wdXQsIGZpbmRWaWV3U3RhdGVGb3JFZGl0b3IsIGlzUmVzb3VyY2VFZGl0b3JJbnB1dCwgSUZpbGVFZGl0b3JJbnB1dE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0LCBJVW50eXBlZEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEFic3RyYWN0VGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yL3RleHRSZXNvdXJjZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEJpbmFyeUVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9iaW5hcnlFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSwgVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLCBUZXh0RmlsZVJlc29sdmVSZWFzb24sIFRleHRGaWxlT3BlcmF0aW9uRXJyb3IsIFRleHRGaWxlT3BlcmF0aW9uUmVzdWx0LCBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgRW5jb2RpbmdNb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElSZWZlcmVuY2UsIGRpc3Bvc2UsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZJTEVfRURJVE9SX0lOUFVUX0lELCBURVhUX0ZJTEVfRURJVE9SX0lELCBCSU5BUllfRklMRV9FRElUT1JfSUQgfSBmcm9tICcuLi8uLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLmpzJztcblxuY29uc3QgZW51bSBGb3JjZU9wZW5BcyB7XG5cdE5vbmUsXG5cdFRleHQsXG5cdEJpbmFyeVxufVxuXG4vKipcbiAqIEEgZmlsZSBlZGl0b3IgaW5wdXQgaXMgdGhlIGlucHV0IHR5cGUgZm9yIHRoZSBmaWxlIGVkaXRvciBvZiBmaWxlIHN5c3RlbSByZXNvdXJjZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBGaWxlRWRpdG9ySW5wdXQgZXh0ZW5kcyBBYnN0cmFjdFRleHRSZXNvdXJjZUVkaXRvcklucHV0IGltcGxlbWVudHMgSUZpbGVFZGl0b3JJbnB1dCB7XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBGSUxFX0VESVRPUl9JTlBVVF9JRDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMge1xuXHRcdGxldCBjYXBhYmlsaXRpZXMgPSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5TcGxpdEluR3JvdXA7XG5cblx0XHRpZiAodGhpcy5tb2RlbCkge1xuXHRcdFx0aWYgKHRoaXMubW9kZWwuaXNSZWFkb25seSgpKSB7XG5cdFx0XHRcdGNhcGFiaWxpdGllcyB8PSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIodGhpcy5yZXNvdXJjZSkpIHtcblx0XHRcdFx0aWYgKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRoaXMucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0Y2FwYWJpbGl0aWVzIHw9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlYWRvbmx5O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjYXBhYmlsaXRpZXMgfD0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCEoY2FwYWJpbGl0aWVzICYgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVhZG9ubHkpKSB7XG5cdFx0XHRjYXBhYmlsaXRpZXMgfD0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2FuRHJvcEludG9FZGl0b3I7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhcGFiaWxpdGllcztcblx0fVxuXG5cdHByaXZhdGUgcHJlZmVycmVkTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByZWZlcnJlZERlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJlZmVycmVkRW5jb2Rpbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwcmVmZXJyZWRMYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJlZmVycmVkQ29udGVudHM6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGZvcmNlT3BlbkFzOiBGb3JjZU9wZW5BcyA9IEZvcmNlT3BlbkFzLk5vbmU7XG5cblx0cHJpdmF0ZSBtb2RlbDogSVRleHRGaWxlRWRpdG9yTW9kZWwgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY2FjaGVkVGV4dEZpbGVNb2RlbFJlZmVyZW5jZTogSVJlZmVyZW5jZTxJVGV4dEZpbGVFZGl0b3JNb2RlbD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbExpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVzb3VyY2U6IFVSSSxcblx0XHRwcmVmZXJyZWRSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHByZWZlcnJlZE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcmVmZXJyZWREZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHByZWZlcnJlZEVuY29kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJlZmVycmVkTGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHByZWZlcnJlZENvbnRlbnRzOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlOiBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHJlc291cmNlLCBwcmVmZXJyZWRSZXNvdXJjZSwgZWRpdG9yU2VydmljZSwgdGV4dEZpbGVTZXJ2aWNlLCBsYWJlbFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlKTtcblxuXHRcdHRoaXMubW9kZWwgPSB0aGlzLnRleHRGaWxlU2VydmljZS5maWxlcy5nZXQocmVzb3VyY2UpO1xuXG5cdFx0aWYgKHByZWZlcnJlZE5hbWUpIHtcblx0XHRcdHRoaXMuc2V0UHJlZmVycmVkTmFtZShwcmVmZXJyZWROYW1lKTtcblx0XHR9XG5cblx0XHRpZiAocHJlZmVycmVkRGVzY3JpcHRpb24pIHtcblx0XHRcdHRoaXMuc2V0UHJlZmVycmVkRGVzY3JpcHRpb24ocHJlZmVycmVkRGVzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdGlmIChwcmVmZXJyZWRFbmNvZGluZykge1xuXHRcdFx0dGhpcy5zZXRQcmVmZXJyZWRFbmNvZGluZyhwcmVmZXJyZWRFbmNvZGluZyk7XG5cdFx0fVxuXG5cdFx0aWYgKHByZWZlcnJlZExhbmd1YWdlSWQpIHtcblx0XHRcdHRoaXMuc2V0UHJlZmVycmVkTGFuZ3VhZ2VJZChwcmVmZXJyZWRMYW5ndWFnZUlkKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHByZWZlcnJlZENvbnRlbnRzID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5zZXRQcmVmZXJyZWRDb250ZW50cyhwcmVmZXJyZWRDb250ZW50cyk7XG5cdFx0fVxuXG5cdFx0Ly8gQXR0YWNoIHRvIG1vZGVsIHRoYXQgbWF0Y2hlcyBvdXIgcmVzb3VyY2Ugb25jZSBjcmVhdGVkXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMub25EaWRDcmVhdGUobW9kZWwgPT4gdGhpcy5vbkRpZENyZWF0ZVRleHRGaWxlTW9kZWwobW9kZWwpKSk7XG5cblx0XHQvLyBJZiBhIGZpbGUgbW9kZWwgYWxyZWFkeSBleGlzdHMsIG1ha2Ugc3VyZSB0byB3aXJlIGl0IGluXG5cdFx0aWYgKHRoaXMubW9kZWwpIHtcblx0XHRcdHRoaXMucmVnaXN0ZXJNb2RlbExpc3RlbmVycyh0aGlzLm1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ3JlYXRlVGV4dEZpbGVNb2RlbChtb2RlbDogSVRleHRGaWxlRWRpdG9yTW9kZWwpOiB2b2lkIHtcblxuXHRcdC8vIE9uY2UgdGhlIHRleHQgZmlsZSBtb2RlbCBpcyBjcmVhdGVkLCB3ZSBrZWVwIGl0IGluc2lkZVxuXHRcdC8vIHRoZSBpbnB1dCB0byBiZSBhYmxlIHRvIGltcGxlbWVudCBzb21lIG1ldGhvZHMgcHJvcGVybHlcblx0XHRpZiAoaXNFcXVhbChtb2RlbC5yZXNvdXJjZSwgdGhpcy5yZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMubW9kZWwgPSBtb2RlbDtcblxuXHRcdFx0dGhpcy5yZWdpc3Rlck1vZGVsTGlzdGVuZXJzKG1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTW9kZWxMaXN0ZW5lcnMobW9kZWw6IElUZXh0RmlsZUVkaXRvck1vZGVsKTogdm9pZCB7XG5cblx0XHQvLyBDbGVhciBhbnkgb2xkXG5cdFx0dGhpcy5tb2RlbExpc3RlbmVycy5jbGVhcigpO1xuXG5cdFx0Ly8gcmUtZW1pdCBzb21lIGV2ZW50cyBmcm9tIHRoZSBtb2RlbFxuXHRcdHRoaXMubW9kZWxMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlRGlydHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCkpKTtcblx0XHR0aGlzLm1vZGVsTGlzdGVuZXJzLmFkZChtb2RlbC5vbkRpZENoYW5nZVJlYWRvbmx5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzLmZpcmUoKSkpO1xuXG5cdFx0Ly8gaW1wb3J0YW50OiB0cmVhdCBzYXZlIGVycm9ycyBhcyBwb3RlbnRpYWwgZGlydHkgY2hhbmdlIGJlY2F1c2Vcblx0XHQvLyBhIGZpbGUgdGhhdCBpcyBpbiBzYXZlIGNvbmZsaWN0IG9yIGVycm9yIHdpbGwgcmVwb3J0IGRpcnR5IGV2ZW5cblx0XHQvLyBpZiBhdXRvIHNhdmUgaXMgdHVybmVkIG9uLlxuXHRcdHRoaXMubW9kZWxMaXN0ZW5lcnMuYWRkKG1vZGVsLm9uRGlkU2F2ZUVycm9yKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpKSk7XG5cblx0XHQvLyByZW1vdmUgbW9kZWwgYXNzb2NpYXRpb24gb25jZSBpdCBnZXRzIGRpc3Bvc2VkXG5cdFx0dGhpcy5tb2RlbExpc3RlbmVycy5hZGQoRXZlbnQub25jZShtb2RlbC5vbldpbGxEaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHR0aGlzLm1vZGVsTGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLm1vZGVsID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5wcmVmZXJyZWROYW1lIHx8IHN1cGVyLmdldE5hbWUoKTtcblx0fVxuXG5cdHNldFByZWZlcnJlZE5hbWUobmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmFsbG93TGFiZWxPdmVycmlkZSgpKSB7XG5cdFx0XHRyZXR1cm47IC8vIGJsb2NrIGZvciBzcGVjaWZpYyBzY2hlbWVzIHdlIGNvbnNpZGVyIHRvIGJlIG93bmluZ1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnByZWZlcnJlZE5hbWUgIT09IG5hbWUpIHtcblx0XHRcdHRoaXMucHJlZmVycmVkTmFtZSA9IG5hbWU7XG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWxsb3dMYWJlbE92ZXJyaWRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnJlc291cmNlLnNjaGVtZSAhPT0gdGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lICYmXG5cdFx0XHR0aGlzLnJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVVc2VyRGF0YSAmJlxuXHRcdFx0dGhpcy5yZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSAmJlxuXHRcdFx0dGhpcy5yZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHR9XG5cblx0Z2V0UHJlZmVycmVkTmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByZWZlcnJlZE5hbWU7XG5cdH1cblxuXHRvdmVycmlkZSBpc1JlYWRvbmx5KCk6IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsID8gdGhpcy5tb2RlbC5pc1JlYWRvbmx5KCkgOiB0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaXNSZWFkb25seSh0aGlzLnJlc291cmNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldERlc2NyaXB0aW9uKHZlcmJvc2l0eT86IFZlcmJvc2l0eSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucHJlZmVycmVkRGVzY3JpcHRpb24gfHwgc3VwZXIuZ2V0RGVzY3JpcHRpb24odmVyYm9zaXR5KTtcblx0fVxuXG5cdHNldFByZWZlcnJlZERlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYWxsb3dMYWJlbE92ZXJyaWRlKCkpIHtcblx0XHRcdHJldHVybjsgLy8gYmxvY2sgZm9yIHNwZWNpZmljIHNjaGVtZXMgd2UgY29uc2lkZXIgdG8gYmUgb3duaW5nXG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJlZmVycmVkRGVzY3JpcHRpb24gIT09IGRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0aGlzLnByZWZlcnJlZERlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdGdldFByZWZlcnJlZERlc2NyaXB0aW9uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucHJlZmVycmVkRGVzY3JpcHRpb247XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUaXRsZSh2ZXJib3NpdHk/OiBWZXJib3NpdHkpOiBzdHJpbmcge1xuXHRcdGxldCB0aXRsZSA9IHN1cGVyLmdldFRpdGxlKHZlcmJvc2l0eSk7XG5cblx0XHRjb25zdCBwcmVmZXJyZWRUaXRsZSA9IHRoaXMuZ2V0UHJlZmVycmVkVGl0bGUoKTtcblx0XHRpZiAocHJlZmVycmVkVGl0bGUpIHtcblx0XHRcdHRpdGxlID0gYCR7cHJlZmVycmVkVGl0bGV9ICgke3RpdGxlfSlgO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aXRsZTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRQcmVmZXJyZWRUaXRsZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnByZWZlcnJlZE5hbWUgJiYgdGhpcy5wcmVmZXJyZWREZXNjcmlwdGlvbikge1xuXHRcdFx0cmV0dXJuIGAke3RoaXMucHJlZmVycmVkTmFtZX0gJHt0aGlzLnByZWZlcnJlZERlc2NyaXB0aW9ufWA7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJlZmVycmVkTmFtZSB8fCB0aGlzLnByZWZlcnJlZERlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcmVmZXJyZWROYW1lID8/IHRoaXMucHJlZmVycmVkRGVzY3JpcHRpb247XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEVuY29kaW5nKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMubW9kZWwpIHtcblx0XHRcdHJldHVybiB0aGlzLm1vZGVsLmdldEVuY29kaW5nKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucHJlZmVycmVkRW5jb2Rpbmc7XG5cdH1cblxuXHRnZXRQcmVmZXJyZWRFbmNvZGluZygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByZWZlcnJlZEVuY29kaW5nO1xuXHR9XG5cblx0YXN5bmMgc2V0RW5jb2RpbmcoZW5jb2Rpbmc6IHN0cmluZywgbW9kZTogRW5jb2RpbmdNb2RlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZXRQcmVmZXJyZWRFbmNvZGluZyhlbmNvZGluZyk7XG5cblx0XHRyZXR1cm4gdGhpcy5tb2RlbD8uc2V0RW5jb2RpbmcoZW5jb2RpbmcsIG1vZGUpO1xuXHR9XG5cblx0c2V0UHJlZmVycmVkRW5jb2RpbmcoZW5jb2Rpbmc6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucHJlZmVycmVkRW5jb2RpbmcgPSBlbmNvZGluZztcblxuXHRcdC8vIGVuY29kaW5nIGlzIGEgZ29vZCBoaW50IHRvIG9wZW4gdGhlIGZpbGUgYXMgdGV4dFxuXHRcdHRoaXMuc2V0Rm9yY2VPcGVuQXNUZXh0KCk7XG5cdH1cblxuXHRnZXRMYW5ndWFnZUlkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMubW9kZWwpIHtcblx0XHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5wcmVmZXJyZWRMYW5ndWFnZUlkO1xuXHR9XG5cblx0Z2V0UHJlZmVycmVkTGFuZ3VhZ2VJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByZWZlcnJlZExhbmd1YWdlSWQ7XG5cdH1cblxuXHRzZXRMYW5ndWFnZUlkKGxhbmd1YWdlSWQ6IHN0cmluZywgc291cmNlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRQcmVmZXJyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXG5cdFx0dGhpcy5tb2RlbD8uc2V0TGFuZ3VhZ2VJZChsYW5ndWFnZUlkLCBzb3VyY2UpO1xuXHR9XG5cblx0c2V0UHJlZmVycmVkTGFuZ3VhZ2VJZChsYW5ndWFnZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnByZWZlcnJlZExhbmd1YWdlSWQgPSBsYW5ndWFnZUlkO1xuXG5cdFx0Ly8gbGFuZ3VhZ2VzIGFyZSBhIGdvb2QgaGludCB0byBvcGVuIHRoZSBmaWxlIGFzIHRleHRcblx0XHR0aGlzLnNldEZvcmNlT3BlbkFzVGV4dCgpO1xuXHR9XG5cblx0c2V0UHJlZmVycmVkQ29udGVudHMoY29udGVudHM6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucHJlZmVycmVkQ29udGVudHMgPSBjb250ZW50cztcblxuXHRcdC8vIGNvbnRlbnRzIGlzIGEgZ29vZCBoaW50IHRvIG9wZW4gdGhlIGZpbGUgYXMgdGV4dFxuXHRcdHRoaXMuc2V0Rm9yY2VPcGVuQXNUZXh0KCk7XG5cdH1cblxuXHRzZXRGb3JjZU9wZW5Bc1RleHQoKTogdm9pZCB7XG5cdFx0dGhpcy5mb3JjZU9wZW5BcyA9IEZvcmNlT3BlbkFzLlRleHQ7XG5cdH1cblxuXHRzZXRGb3JjZU9wZW5Bc0JpbmFyeSgpOiB2b2lkIHtcblx0XHR0aGlzLmZvcmNlT3BlbkFzID0gRm9yY2VPcGVuQXMuQmluYXJ5O1xuXHR9XG5cblx0b3ZlcnJpZGUgaXNEaXJ0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISEodGhpcy5tb2RlbD8uaXNEaXJ0eSgpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzU2F2aW5nKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLm1vZGVsPy5oYXNTdGF0ZShUZXh0RmlsZUVkaXRvck1vZGVsU3RhdGUuU0FWRUQpIHx8IHRoaXMubW9kZWw/Lmhhc1N0YXRlKFRleHRGaWxlRWRpdG9yTW9kZWxTdGF0ZS5DT05GTElDVCkgfHwgdGhpcy5tb2RlbD8uaGFzU3RhdGUoVGV4dEZpbGVFZGl0b3JNb2RlbFN0YXRlLkVSUk9SKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyByZXF1aXJlIHRoZSBtb2RlbCB0byBiZSBkaXJ0eSBhbmQgbm90IGluIGNvbmZsaWN0IG9yIGVycm9yIHN0YXRlXG5cdFx0fVxuXG5cdFx0Ly8gTm90ZTogY3VycmVudGx5IG5vdCBjaGVja2luZyBmb3IgTW9kZWxTdGF0ZS5QRU5ESU5HX1NBVkUgZm9yIGEgcmVhc29uXG5cdFx0Ly8gYmVjYXVzZSB3ZSBjdXJyZW50bHkgbWlzcyBhbiBldmVudCBmb3IgdGhpcyBzdGF0ZSBjaGFuZ2Ugb24gZWRpdG9yc1xuXHRcdC8vIGFuZCBpdCBjb3VsZCByZXN1bHQgaW4gYmFkIFVYIHdoZXJlIGFuIGVkaXRvciBjYW4gYmUgY2xvc2VkIGV2ZW4gdGhvdWdoXG5cdFx0Ly8gaXQgc2hvd3MgdXAgYXMgZGlydHkgYW5kIGhhcyBub3QgZmluaXNoZWQgc2F2aW5nIHlldC5cblxuXHRcdGlmICh0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaGFzU2hvcnRBdXRvU2F2ZURlbGF5KHRoaXMpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gYSBzaG9ydCBhdXRvIHNhdmUgaXMgY29uZmlndXJlZCwgdHJlYXQgdGhpcyBhcyBiZWluZyBzYXZlZFxuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5pc1NhdmluZygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcHJlZmVyc0VkaXRvclBhbmU8VCBleHRlbmRzIElFZGl0b3JEZXNjcmlwdG9yPElFZGl0b3JQYW5lPj4oZWRpdG9yUGFuZXM6IFRbXSk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmZvcmNlT3BlbkFzID09PSBGb3JjZU9wZW5Bcy5CaW5hcnkpIHtcblx0XHRcdHJldHVybiBlZGl0b3JQYW5lcy5maW5kKGVkaXRvclBhbmUgPT4gZWRpdG9yUGFuZS50eXBlSWQgPT09IEJJTkFSWV9GSUxFX0VESVRPUl9JRCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvclBhbmVzLmZpbmQoZWRpdG9yUGFuZSA9PiBlZGl0b3JQYW5lLnR5cGVJZCA9PT0gVEVYVF9GSUxFX0VESVRPUl9JRCk7XG5cdH1cblxuXHRvdmVycmlkZSByZXNvbHZlKG9wdGlvbnM/OiBJRmlsZUVkaXRvcklucHV0T3B0aW9ucyk6IFByb21pc2U8SVRleHRGaWxlRWRpdG9yTW9kZWwgfCBCaW5hcnlFZGl0b3JNb2RlbD4ge1xuXG5cdFx0Ly8gUmVzb2x2ZSBhcyBiaW5hcnlcblx0XHRpZiAodGhpcy5mb3JjZU9wZW5BcyA9PT0gRm9yY2VPcGVuQXMuQmluYXJ5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb1Jlc29sdmVBc0JpbmFyeSgpO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgYXMgdGV4dFxuXHRcdHJldHVybiB0aGlzLmRvUmVzb2x2ZUFzVGV4dChvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlQXNUZXh0KG9wdGlvbnM/OiBJRmlsZUVkaXRvcklucHV0T3B0aW9ucyk6IFByb21pc2U8SVRleHRGaWxlRWRpdG9yTW9kZWwgfCBCaW5hcnlFZGl0b3JNb2RlbD4ge1xuXHRcdHRyeSB7XG5cblx0XHRcdC8vIFVuc2V0IHByZWZlcnJlZCBjb250ZW50cyBhZnRlciBoYXZpbmcgYXBwbGllZCBpdCBvbmNlXG5cdFx0XHQvLyB0byBwcmV2ZW50IHRoaXMgcHJvcGVydHkgdG8gc3RpY2suIFdlIHN0aWxsIHdhbnQgZnV0dXJlXG5cdFx0XHQvLyBgcmVzb2x2ZWAgY2FsbHMgdG8gZmV0Y2ggdGhlIGNvbnRlbnRzIGZyb20gZGlzay5cblx0XHRcdGNvbnN0IHByZWZlcnJlZENvbnRlbnRzID0gdGhpcy5wcmVmZXJyZWRDb250ZW50cztcblx0XHRcdHRoaXMucHJlZmVycmVkQ29udGVudHMgPSB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIFJlc29sdmUgcmVzb3VyY2UgdmlhIHRleHQgZmlsZSBzZXJ2aWNlIGFuZCBvbmx5IGFsbG93XG5cdFx0XHQvLyB0byBvcGVuIGJpbmFyeSBmaWxlcyBpZiB3ZSBhcmUgaW5zdHJ1Y3RlZCBzb1xuXHRcdFx0YXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMucmVzb2x2ZSh0aGlzLnJlc291cmNlLCB7XG5cdFx0XHRcdGxhbmd1YWdlSWQ6IHRoaXMucHJlZmVycmVkTGFuZ3VhZ2VJZCxcblx0XHRcdFx0ZW5jb2Rpbmc6IHRoaXMucHJlZmVycmVkRW5jb2RpbmcsXG5cdFx0XHRcdGNvbnRlbnRzOiB0eXBlb2YgcHJlZmVycmVkQ29udGVudHMgPT09ICdzdHJpbmcnID8gY3JlYXRlVGV4dEJ1ZmZlckZhY3RvcnkocHJlZmVycmVkQ29udGVudHMpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZWxvYWQ6IHsgYXN5bmM6IHRydWUgfSwgLy8gdHJpZ2dlciBhIHJlbG9hZCBvZiB0aGUgbW9kZWwgaWYgaXQgZXhpc3RzIGFscmVhZHkgYnV0IGRvIG5vdCB3YWl0IHRvIHNob3cgdGhlIG1vZGVsXG5cdFx0XHRcdGFsbG93QmluYXJ5OiB0aGlzLmZvcmNlT3BlbkFzID09PSBGb3JjZU9wZW5Bcy5UZXh0LFxuXHRcdFx0XHRyZWFzb246IFRleHRGaWxlUmVzb2x2ZVJlYXNvbi5FRElUT1IsXG5cdFx0XHRcdGxpbWl0czogdGhpcy5lbnN1cmVMaW1pdHMob3B0aW9ucylcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGlzIGlzIGEgYml0IHVnbHksIGJlY2F1c2Ugd2UgZmlyc3QgcmVzb2x2ZSB0aGUgbW9kZWwgYW5kIHRoZW4gcmVzb2x2ZSBhIG1vZGVsIHJlZmVyZW5jZS4gdGhlIHJlYXNvbiBiZWluZyB0aGF0IGJpbmFyeVxuXHRcdFx0Ly8gb3IgdmVyeSBsYXJnZSBmaWxlcyBkbyBub3QgcmVzb2x2ZSB0byBhIHRleHQgZmlsZSBtb2RlbCBidXQgc2hvdWxkIGJlIG9wZW5lZCBhcyBiaW5hcnkgZmlsZXMgd2l0aG91dCB0ZXh0LiBGaXJzdCBjYWxsaW5nIGludG9cblx0XHRcdC8vIHJlc29sdmUoKSBlbnN1cmVzIHdlIGFyZSBub3QgY3JlYXRpbmcgbW9kZWwgcmVmZXJlbmNlcyBmb3IgdGhlc2Uga2luZCBvZiByZXNvdXJjZXMuXG5cdFx0XHQvLyBJbiBhZGRpdGlvbiB3ZSBoYXZlIGEgYml0IG9mIHBheWxvYWQgdG8gdGFrZSBpbnRvIGFjY291bnQgKGVuY29kaW5nLCByZWxvYWQpIHRoYXQgdGhlIHRleHQgcmVzb2x2ZXIgZG9lcyBub3QgaGFuZGxlIHlldC5cblx0XHRcdGlmICghdGhpcy5jYWNoZWRUZXh0RmlsZU1vZGVsUmVmZXJlbmNlKSB7XG5cdFx0XHRcdHRoaXMuY2FjaGVkVGV4dEZpbGVNb2RlbFJlZmVyZW5jZSA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh0aGlzLnJlc291cmNlKSBhcyBJUmVmZXJlbmNlPElUZXh0RmlsZUVkaXRvck1vZGVsPjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNhY2hlZFRleHRGaWxlTW9kZWxSZWZlcmVuY2Uub2JqZWN0O1xuXG5cdFx0XHQvLyBJdCBpcyBwb3NzaWJsZSB0aGF0IHRoaXMgaW5wdXQgd2FzIGRpc3Bvc2VkIGJlZm9yZSB0aGUgbW9kZWxcblx0XHRcdC8vIGZpbmlzaGVkIHJlc29sdmluZy4gQXMgc3VjaCwgd2UgbmVlZCB0byBtYWtlIHN1cmUgdG8gZGlzcG9zZVxuXHRcdFx0Ly8gdGhlIG1vZGVsIHJlZmVyZW5jZSB0byBub3QgbGVhayBpdC5cblx0XHRcdGlmICh0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2VNb2RlbFJlZmVyZW5jZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbW9kZWw7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0Ly8gSGFuZGxlIGJpbmFyeSBmaWxlcyB3aXRoIGJpbmFyeSBtb2RlbFxuXHRcdFx0aWYgKCg8VGV4dEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikudGV4dEZpbGVPcGVyYXRpb25SZXN1bHQgPT09IFRleHRGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfSVNfQklOQVJZKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmRvUmVzb2x2ZUFzQmluYXJ5KCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEJ1YmJsZSBhbnkgb3RoZXIgZXJyb3IgdXBcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlQXNCaW5hcnkoKTogUHJvbWlzZTxCaW5hcnlFZGl0b3JNb2RlbD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCaW5hcnlFZGl0b3JNb2RlbCwgdGhpcy5wcmVmZXJyZWRSZXNvdXJjZSwgdGhpcy5nZXROYW1lKCkpO1xuXHRcdGF3YWl0IG1vZGVsLnJlc29sdmUoKTtcblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdGlzUmVzb2x2ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5tb2RlbDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlbmFtZShncm91cDogR3JvdXBJZGVudGlmaWVyLCB0YXJnZXQ6IFVSSSk6IFByb21pc2U8SU1vdmVSZXN1bHQ+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWRpdG9yOiB7XG5cdFx0XHRcdHJlc291cmNlOiB0YXJnZXQsXG5cdFx0XHRcdGVuY29kaW5nOiB0aGlzLmdldEVuY29kaW5nKCksXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHR2aWV3U3RhdGU6IGZpbmRWaWV3U3RhdGVGb3JFZGl0b3IodGhpcywgZ3JvdXAsIHRoaXMuZWRpdG9yU2VydmljZSlcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSB0b1VudHlwZWQob3B0aW9ucz86IElVbnR5cGVkRWRpdG9yT3B0aW9ucyk6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB7XG5cdFx0Y29uc3QgdW50eXBlZElucHV0OiBJVW50eXBlZEZpbGVFZGl0b3JJbnB1dCA9IHtcblx0XHRcdHJlc291cmNlOiB0aGlzLnByZWZlcnJlZFJlc291cmNlLFxuXHRcdFx0Zm9yY2VGaWxlOiB0cnVlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRvdmVycmlkZTogdGhpcy5lZGl0b3JJZFxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnM/LnByZXNlcnZlVmlld1N0YXRlID09PSAnbnVtYmVyJykge1xuXHRcdFx0dW50eXBlZElucHV0LmVuY29kaW5nID0gdGhpcy5nZXRFbmNvZGluZygpO1xuXHRcdFx0dW50eXBlZElucHV0Lmxhbmd1YWdlSWQgPSB0aGlzLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdHVudHlwZWRJbnB1dC5jb250ZW50cyA9ICgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMuZ2V0KHRoaXMucmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAobW9kZWw/LmlzRGlydHkoKSAmJiAhbW9kZWwudGV4dEVkaXRvck1vZGVsLmlzVG9vTGFyZ2VGb3JIZWFwT3BlcmF0aW9uKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbW9kZWwudGV4dEVkaXRvck1vZGVsLmdldFZhbHVlKCk7IC8vIG9ubHkgaWYgZGlydHkgYW5kIG5vdCB0b28gbGFyZ2Vcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9KSgpO1xuXG5cdFx0XHR1bnR5cGVkSW5wdXQub3B0aW9ucyA9IHtcblx0XHRcdFx0Li4udW50eXBlZElucHV0Lm9wdGlvbnMsXG5cdFx0XHRcdHZpZXdTdGF0ZTogZmluZFZpZXdTdGF0ZUZvckVkaXRvcih0aGlzLCBvcHRpb25zLnByZXNlcnZlVmlld1N0YXRlLCB0aGlzLmVkaXRvclNlcnZpY2UpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bnR5cGVkSW5wdXQ7XG5cdH1cblxuXHRvdmVycmlkZSBtYXRjaGVzKG90aGVySW5wdXQ6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzID09PSBvdGhlcklucHV0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAob3RoZXJJbnB1dCBpbnN0YW5jZW9mIEZpbGVFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIGlzRXF1YWwob3RoZXJJbnB1dC5yZXNvdXJjZSwgdGhpcy5yZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUmVzb3VyY2VFZGl0b3JJbnB1dChvdGhlcklucHV0KSkge1xuXHRcdFx0cmV0dXJuIHN1cGVyLm1hdGNoZXMob3RoZXJJbnB1dCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblxuXHRcdC8vIE1vZGVsXG5cdFx0dGhpcy5tb2RlbCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIE1vZGVsIHJlZmVyZW5jZVxuXHRcdHRoaXMuZGlzcG9zZU1vZGVsUmVmZXJlbmNlKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGRpc3Bvc2VNb2RlbFJlZmVyZW5jZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMuY2FjaGVkVGV4dEZpbGVNb2RlbFJlZmVyZW5jZSk7XG5cdFx0dGhpcy5jYWNoZWRUZXh0RmlsZU1vZGVsUmVmZXJlbmNlID0gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQW9FLHlCQUE4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
