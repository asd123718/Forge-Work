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
import { basename, isEqual } from "../../../../base/common/resources.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { EditorInputCapabilities, isEditorInput, isResourceEditorInput, isResourceDiffEditorInput } from "../../../common/editor.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { ICustomEditorService } from "../common/customEditor.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from "../../webviewPanel/browser/webviewWorkbenchService.js";
function getCustomEditorSideBySideDiffInputResource(init) {
  return init.side === "original" ? init.originalResource : init.modifiedResource;
}
let CustomEditorDiffInput = class extends LazilyResolvedWebviewEditorInput {
  constructor(init, webview, themeService, webviewWorkbenchService, instantiationService, customEditorService, filesConfigurationService, fileDialogService, undoRedoService) {
    super({ providedId: init.viewType, viewType: init.viewType, name: init.label ?? "", iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
    this.init = init;
    this.instantiationService = instantiationService;
    this.customEditorService = customEditorService;
    this.filesConfigurationService = filesConfigurationService;
    this.fileDialogService = fileDialogService;
    this.undoRedoService = undoRedoService;
    this._modelRef = this._register(new MutableDisposable());
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
  }
  static create(instantiationService, init, group) {
    return instantiationService.invokeFunction((accessor) => {
      const webview = accessor.get(IWebviewService).createWebviewOverlay({
        providedViewType: init.viewType,
        title: init.label,
        options: {},
        contentOptions: {},
        extension: void 0
      });
      const input = instantiationService.createInstance(CustomEditorDiffInput, init, webview);
      if (group) {
        input.updateGroup(group.id);
      }
      return input;
    });
  }
  get typeId() {
    return CustomEditorDiffInput.typeId;
  }
  get editorId() {
    return this.viewType;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.Singleton | EditorInputCapabilities.CanDropIntoEditor;
    if (this.isReadonly()) {
      capabilities |= EditorInputCapabilities.Readonly;
    }
    return capabilities;
  }
  get resource() {
    return this.modifiedResource;
  }
  get originalResource() {
    return this.init.originalResource;
  }
  get modifiedResource() {
    return this.init.modifiedResource;
  }
  get diffResources() {
    return {
      original: this.originalResource,
      modified: this.modifiedResource
    };
  }
  getName() {
    return this.init.label ?? localize("customEditorDiffLabel", "{0} - {1}", basename(this.originalResource), basename(this.modifiedResource));
  }
  getDescription(_verbosity) {
    return this.init.description ?? super.getDescription();
  }
  getTitle(verbosity) {
    const description = this.getDescription(verbosity);
    if (description) {
      return localize("customEditorDiffTitle", "{0} ({1})", this.getName(), description);
    }
    return this.getName();
  }
  isReadonly() {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return this.filesConfigurationService.isReadonly(this.modifiedResource);
    }
    return modelRef.object.isReadonly();
  }
  isDirty() {
    return this._modelRef.value?.object.isDirty() ?? false;
  }
  matches(otherInput) {
    if (this === otherInput) {
      return true;
    }
    if (otherInput instanceof CustomEditorDiffInput) {
      return this.viewType === otherInput.viewType && isEqual(this.originalResource, otherInput.originalResource) && isEqual(this.modifiedResource, otherInput.modifiedResource);
    }
    if (isEditorInput(otherInput)) {
      return false;
    }
    if (isResourceDiffEditorInput(otherInput)) {
      const override = otherInput.options?.override;
      return override === this.viewType && isEqual(this.originalResource, otherInput.original.resource) && isEqual(this.modifiedResource, otherInput.modified.resource);
    }
    return false;
  }
  copy() {
    return CustomEditorDiffInput.create(this.instantiationService, this.init, void 0);
  }
  async save(groupId, options) {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return void 0;
    }
    const target = await modelRef.object.saveCustomEditor(options);
    if (!target) {
      return void 0;
    }
    if (!isEqual(target, this.modifiedResource)) {
      return this.toUntypedWithModifiedResource(target);
    }
    return this;
  }
  async saveAs(groupId, options) {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return void 0;
    }
    const target = await this.fileDialogService.pickFileToSave(this.modifiedResource, options?.availableFileSystems);
    if (!target) {
      return void 0;
    }
    if (!await modelRef.object.saveCustomEditorAs(this.modifiedResource, target, options)) {
      return void 0;
    }
    return this.toUntypedWithModifiedResource(target);
  }
  async revert(group, options) {
    await this._modelRef.value?.object.revert(options);
  }
  async resolve() {
    await super.resolve();
    if (this.isDisposed()) {
      return null;
    }
    if (!this._modelRef.value) {
      const modelRef = this.customEditorService.models.tryRetain(this.modifiedResource, this.viewType);
      if (modelRef) {
        const oldCapabilities = this.capabilities;
        const retainedModelRef = await modelRef;
        if (this.isDisposed()) {
          retainedModelRef.dispose();
          return null;
        }
        this._modelRef.value = retainedModelRef;
        this._register(retainedModelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
        this._register(retainedModelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
        if (this.isDirty()) {
          this._onDidChangeDirty.fire();
        }
        if (this.capabilities !== oldCapabilities) {
          this._onDidChangeCapabilities.fire();
        }
      }
    }
    return null;
  }
  undo() {
    return this.undoRedoService.undo(this.modifiedResource);
  }
  redo() {
    return this.undoRedoService.redo(this.modifiedResource);
  }
  toUntyped(_options) {
    return this.toUntypedWithModifiedResource(this.modifiedResource);
  }
  toUntypedWithModifiedResource(modifiedResource) {
    return {
      original: { resource: this.originalResource },
      modified: { resource: modifiedResource },
      label: this.init.label,
      description: this.init.description,
      options: {
        override: this.viewType
      }
    };
  }
};
CustomEditorDiffInput.typeId = "workbench.editors.customDiffEditor";
CustomEditorDiffInput = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IWebviewWorkbenchService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICustomEditorService),
  __decorateParam(6, IFilesConfigurationService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, IUndoRedoService)
], CustomEditorDiffInput);
let CustomEditorSideBySideDiffInput = class extends LazilyResolvedWebviewEditorInput {
  constructor(init, webview, themeService, webviewWorkbenchService, instantiationService, customEditorService, filesConfigurationService, fileDialogService, undoRedoService) {
    super({ providedId: init.viewType, viewType: init.viewType, name: basename(getCustomEditorSideBySideDiffInputResource(init)), iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
    this.init = init;
    this.instantiationService = instantiationService;
    this.customEditorService = customEditorService;
    this.filesConfigurationService = filesConfigurationService;
    this.fileDialogService = fileDialogService;
    this.undoRedoService = undoRedoService;
    this._modelRef = this._register(new MutableDisposable());
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
  }
  static create(instantiationService, init, group) {
    return instantiationService.invokeFunction((accessor) => {
      const webview = accessor.get(IWebviewService).createWebviewOverlay({
        providedViewType: init.viewType,
        title: basename(getCustomEditorSideBySideDiffInputResource(init)),
        options: {},
        contentOptions: {},
        extension: void 0
      });
      const input = instantiationService.createInstance(CustomEditorSideBySideDiffInput, init, webview);
      if (group) {
        input.updateGroup(group.id);
      }
      return input;
    });
  }
  get typeId() {
    return CustomEditorSideBySideDiffInput.typeId;
  }
  get editorId() {
    return this.viewType;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.Singleton | EditorInputCapabilities.CanDropIntoEditor;
    if (this.isReadonly()) {
      capabilities |= EditorInputCapabilities.Readonly;
    }
    return capabilities;
  }
  get resource() {
    return this.side === "original" ? this.originalResource : this.modifiedResource;
  }
  get originalResource() {
    return this.init.originalResource;
  }
  get modifiedResource() {
    return this.init.modifiedResource;
  }
  get side() {
    return this.init.side;
  }
  get diffId() {
    return this.init.diffId;
  }
  getName() {
    return basename(this.resource);
  }
  getDescription(_verbosity) {
    return this.init.description ?? super.getDescription();
  }
  getTitle(verbosity) {
    const description = this.getDescription(verbosity);
    if (description) {
      return localize("customEditorSideBySideDiffTitle", "{0} ({1})", this.getName(), description);
    }
    return this.getName();
  }
  isReadonly() {
    if (this.side === "original") {
      return true;
    }
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return this.filesConfigurationService.isReadonly(this.modifiedResource);
    }
    return modelRef.object.isReadonly();
  }
  isDirty() {
    return this.side === "modified" ? this._modelRef.value?.object.isDirty() ?? false : false;
  }
  matches(otherInput) {
    if (this === otherInput) {
      return true;
    }
    if (otherInput instanceof CustomEditorSideBySideDiffInput) {
      return this.editorId === otherInput.editorId && this.side === otherInput.side && isEqual(this.originalResource, otherInput.originalResource) && isEqual(this.modifiedResource, otherInput.modifiedResource);
    }
    if (isEditorInput(otherInput)) {
      return false;
    }
    if (isResourceEditorInput(otherInput)) {
      return isEqual(this.resource, otherInput.resource);
    }
    return false;
  }
  copy() {
    return CustomEditorSideBySideDiffInput.create(this.instantiationService, this.init, void 0);
  }
  async save(groupId, options) {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return void 0;
    }
    const target = await modelRef.object.saveCustomEditor(options);
    if (!target) {
      return void 0;
    }
    if (!isEqual(target, this.modifiedResource)) {
      return { resource: target };
    }
    return this;
  }
  async saveAs(groupId, options) {
    const modelRef = this._modelRef.value;
    if (!modelRef) {
      return void 0;
    }
    const target = await this.fileDialogService.pickFileToSave(this.modifiedResource, options?.availableFileSystems);
    if (!target) {
      return void 0;
    }
    if (!await modelRef.object.saveCustomEditorAs(this.modifiedResource, target, options)) {
      return void 0;
    }
    return { resource: target };
  }
  async revert(group, options) {
    await this._modelRef.value?.object.revert(options);
  }
  async resolve() {
    await super.resolve();
    if (this.isDisposed()) {
      return null;
    }
    if (this.side === "modified" && !this._modelRef.value) {
      const modelRef = this.customEditorService.models.tryRetain(this.modifiedResource, this.viewType);
      if (modelRef) {
        const oldCapabilities = this.capabilities;
        const retainedModelRef = await modelRef;
        if (this.isDisposed()) {
          retainedModelRef.dispose();
          return null;
        }
        this._modelRef.value = retainedModelRef;
        this._register(retainedModelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
        this._register(retainedModelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
        if (this.isDirty()) {
          this._onDidChangeDirty.fire();
        }
        if (this.capabilities !== oldCapabilities) {
          this._onDidChangeCapabilities.fire();
        }
      }
    }
    return null;
  }
  undo() {
    return this.undoRedoService.undo(this.modifiedResource);
  }
  redo() {
    return this.undoRedoService.redo(this.modifiedResource);
  }
  toUntyped(_options) {
    return { resource: this.resource };
  }
};
CustomEditorSideBySideDiffInput.typeId = "workbench.editors.customSideBySideDiffEditor";
CustomEditorSideBySideDiffInput = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IWebviewWorkbenchService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICustomEditorService),
  __decorateParam(6, IFilesConfigurationService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, IUndoRedoService)
], CustomEditorSideBySideDiffInput);
export {
  CustomEditorDiffInput,
  CustomEditorSideBySideDiffInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGN1c3RvbUVkaXRvclxcYnJvd3NlclxcY3VzdG9tRWRpdG9yRGlmZklucHV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBHcm91cElkZW50aWZpZXIsIElFZGl0b3JJbnB1dFdpdGhEaWZmUmVzb3VyY2VzLCBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIElSZXZlcnRPcHRpb25zLCBJU2F2ZU9wdGlvbnMsIElVbnR5cGVkRWRpdG9ySW5wdXQsIGlzRWRpdG9ySW5wdXQsIGlzUmVzb3VyY2VFZGl0b3JJbnB1dCwgaXNSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCwgSVVudHlwZWRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbUVkaXRvck1vZGVsLCBJQ3VzdG9tRWRpdG9yU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jdXN0b21FZGl0b3IuanMnO1xuaW1wb3J0IHsgSU92ZXJsYXlXZWJ2aWV3LCBJV2Vidmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2UsIExhemlseVJlc29sdmVkV2Vidmlld0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vd2Vidmlld1BhbmVsL2Jyb3dzZXIvd2Vidmlld1dvcmtiZW5jaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgV2Vidmlld0ljb25QYXRoIH0gZnJvbSAnLi4vLi4vd2Vidmlld1BhbmVsL2Jyb3dzZXIvd2Vidmlld0VkaXRvcklucHV0LmpzJztcblxuaW50ZXJmYWNlIEN1c3RvbUVkaXRvckRpZmZJbnB1dEluaXRJbmZvIHtcblx0cmVhZG9ubHkgb3JpZ2luYWxSZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBtb2RpZmllZFJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IHZpZXdUeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGljb25QYXRoOiBXZWJ2aWV3SWNvblBhdGggfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0SW5pdEluZm8gZXh0ZW5kcyBDdXN0b21FZGl0b3JEaWZmSW5wdXRJbml0SW5mbyB7XG5cdHJlYWRvbmx5IGRpZmZJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzaWRlOiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZlNpZGU7XG59XG5cbmV4cG9ydCB0eXBlIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmU2lkZSA9ICdvcmlnaW5hbCcgfCAnbW9kaWZpZWQnO1xuXG5mdW5jdGlvbiBnZXRDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0UmVzb3VyY2UoaW5pdDogQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dEluaXRJbmZvKTogVVJJIHtcblx0cmV0dXJuIGluaXQuc2lkZSA9PT0gJ29yaWdpbmFsJyA/IGluaXQub3JpZ2luYWxSZXNvdXJjZSA6IGluaXQubW9kaWZpZWRSZXNvdXJjZTtcbn1cblxuZXhwb3J0IGNsYXNzIEN1c3RvbUVkaXRvckRpZmZJbnB1dCBleHRlbmRzIExhemlseVJlc29sdmVkV2Vidmlld0VkaXRvcklucHV0IGltcGxlbWVudHMgSUVkaXRvcklucHV0V2l0aERpZmZSZXNvdXJjZXMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsUmVmID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElSZWZlcmVuY2U8SUN1c3RvbUVkaXRvck1vZGVsPj4oKSk7XG5cblx0c3RhdGljIGNyZWF0ZShcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdGluaXQ6IEN1c3RvbUVkaXRvckRpZmZJbnB1dEluaXRJbmZvLFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQsXG5cdCk6IEN1c3RvbUVkaXRvckRpZmZJbnB1dCB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IHdlYnZpZXcgPSBhY2Nlc3Nvci5nZXQoSVdlYnZpZXdTZXJ2aWNlKS5jcmVhdGVXZWJ2aWV3T3ZlcmxheSh7XG5cdFx0XHRcdHByb3ZpZGVkVmlld1R5cGU6IGluaXQudmlld1R5cGUsXG5cdFx0XHRcdHRpdGxlOiBpbml0LmxhYmVsLFxuXHRcdFx0XHRvcHRpb25zOiB7fSxcblx0XHRcdFx0Y29udGVudE9wdGlvbnM6IHt9LFxuXHRcdFx0XHRleHRlbnNpb246IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnB1dCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbUVkaXRvckRpZmZJbnB1dCwgaW5pdCwgd2Vidmlldyk7XG5cdFx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdFx0aW5wdXQudXBkYXRlR3JvdXAoZ3JvdXAuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIG92ZXJyaWRlIHJlYWRvbmx5IHR5cGVJZCA9ICd3b3JrYmVuY2guZWRpdG9ycy5jdXN0b21EaWZmRWRpdG9yJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluaXQ6IEN1c3RvbUVkaXRvckRpZmZJbnB1dEluaXRJbmZvLFxuXHRcdHdlYnZpZXc6IElPdmVybGF5V2Vidmlldyxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElXZWJ2aWV3V29ya2JlbmNoU2VydmljZSB3ZWJ2aWV3V29ya2JlbmNoU2VydmljZTogSVdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ3VzdG9tRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbUVkaXRvclNlcnZpY2U6IElDdXN0b21FZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlRGlhbG9nU2VydmljZTogSUZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJVW5kb1JlZG9TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7IHByb3ZpZGVkSWQ6IGluaXQudmlld1R5cGUsIHZpZXdUeXBlOiBpbml0LnZpZXdUeXBlLCBuYW1lOiBpbml0LmxhYmVsID8/ICcnLCBpY29uUGF0aDogaW5pdC5pY29uUGF0aCB9LCB3ZWJ2aWV3LCB0aGVtZVNlcnZpY2UsIHdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VSZWFkb25seSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUNhcGFiaWxpdGllcy5maXJlKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCB0eXBlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQ3VzdG9tRWRpdG9yRGlmZklucHV0LnR5cGVJZDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnZpZXdUeXBlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7XG5cdFx0bGV0IGNhcGFiaWxpdGllcyA9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlNpbmdsZXRvbiB8IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkNhbkRyb3BJbnRvRWRpdG9yO1xuXHRcdGlmICh0aGlzLmlzUmVhZG9ubHkoKSkge1xuXHRcdFx0Y2FwYWJpbGl0aWVzIHw9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlYWRvbmx5O1xuXHRcdH1cblx0XHRyZXR1cm4gY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHJlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kaWZpZWRSZXNvdXJjZTtcblx0fVxuXG5cdGdldCBvcmlnaW5hbFJlc291cmNlKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5pdC5vcmlnaW5hbFJlc291cmNlO1xuXHR9XG5cblx0Z2V0IG1vZGlmaWVkUmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5pbml0Lm1vZGlmaWVkUmVzb3VyY2U7XG5cdH1cblxuXHRnZXQgZGlmZlJlc291cmNlcygpOiBJRWRpdG9ySW5wdXRXaXRoRGlmZlJlc291cmNlc1snZGlmZlJlc291cmNlcyddIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3JpZ2luYWw6IHRoaXMub3JpZ2luYWxSZXNvdXJjZSxcblx0XHRcdG1vZGlmaWVkOiB0aGlzLm1vZGlmaWVkUmVzb3VyY2UsXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pbml0LmxhYmVsID8/IGxvY2FsaXplKCdjdXN0b21FZGl0b3JEaWZmTGFiZWwnLCBcInswfSAtIHsxfVwiLCBiYXNlbmFtZSh0aGlzLm9yaWdpbmFsUmVzb3VyY2UpLCBiYXNlbmFtZSh0aGlzLm1vZGlmaWVkUmVzb3VyY2UpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldERlc2NyaXB0aW9uKF92ZXJib3NpdHk/OiBWZXJib3NpdHkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmluaXQuZGVzY3JpcHRpb24gPz8gc3VwZXIuZ2V0RGVzY3JpcHRpb24oKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFRpdGxlKHZlcmJvc2l0eT86IFZlcmJvc2l0eSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB0aGlzLmdldERlc2NyaXB0aW9uKHZlcmJvc2l0eSk7XG5cdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2N1c3RvbUVkaXRvckRpZmZUaXRsZScsIFwiezB9ICh7MX0pXCIsIHRoaXMuZ2V0TmFtZSgpLCBkZXNjcmlwdGlvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0TmFtZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaXNSZWFkb25seSgpOiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuX21vZGVsUmVmLnZhbHVlO1xuXHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiB0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaXNSZWFkb25seSh0aGlzLm1vZGlmaWVkUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9kZWxSZWYub2JqZWN0LmlzUmVhZG9ubHkoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzRGlydHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsUmVmLnZhbHVlPy5vYmplY3QuaXNEaXJ0eSgpID8/IGZhbHNlO1xuXHR9XG5cblx0b3ZlcnJpZGUgbWF0Y2hlcyhvdGhlcklucHV0OiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcyA9PT0gb3RoZXJJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG90aGVySW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JEaWZmSW5wdXQpIHtcblx0XHRcdHJldHVybiB0aGlzLnZpZXdUeXBlID09PSBvdGhlcklucHV0LnZpZXdUeXBlXG5cdFx0XHRcdCYmIGlzRXF1YWwodGhpcy5vcmlnaW5hbFJlc291cmNlLCBvdGhlcklucHV0Lm9yaWdpbmFsUmVzb3VyY2UpXG5cdFx0XHRcdCYmIGlzRXF1YWwodGhpcy5tb2RpZmllZFJlc291cmNlLCBvdGhlcklucHV0Lm1vZGlmaWVkUmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdGlmIChpc0VkaXRvcklucHV0KG90aGVySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQob3RoZXJJbnB1dCkpIHtcblx0XHRcdGNvbnN0IG92ZXJyaWRlID0gb3RoZXJJbnB1dC5vcHRpb25zPy5vdmVycmlkZTtcblx0XHRcdHJldHVybiBvdmVycmlkZSA9PT0gdGhpcy52aWV3VHlwZVxuXHRcdFx0XHQmJiBpc0VxdWFsKHRoaXMub3JpZ2luYWxSZXNvdXJjZSwgb3RoZXJJbnB1dC5vcmlnaW5hbC5yZXNvdXJjZSlcblx0XHRcdFx0JiYgaXNFcXVhbCh0aGlzLm1vZGlmaWVkUmVzb3VyY2UsIG90aGVySW5wdXQubW9kaWZpZWQucmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdG92ZXJyaWRlIGNvcHkoKTogRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBDdXN0b21FZGl0b3JEaWZmSW5wdXQuY3JlYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuaW5pdCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNhdmUoZ3JvdXBJZDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuX21vZGVsUmVmLnZhbHVlO1xuXHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgbW9kZWxSZWYub2JqZWN0LnNhdmVDdXN0b21FZGl0b3Iob3B0aW9ucyk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0VxdWFsKHRhcmdldCwgdGhpcy5tb2RpZmllZFJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudG9VbnR5cGVkV2l0aE1vZGlmaWVkUmVzb3VyY2UodGFyZ2V0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNhdmVBcyhncm91cElkOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGhpcy5fbW9kZWxSZWYudmFsdWU7XG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnBpY2tGaWxlVG9TYXZlKHRoaXMubW9kaWZpZWRSZXNvdXJjZSwgb3B0aW9ucz8uYXZhaWxhYmxlRmlsZVN5c3RlbXMpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghYXdhaXQgbW9kZWxSZWYub2JqZWN0LnNhdmVDdXN0b21FZGl0b3JBcyh0aGlzLm1vZGlmaWVkUmVzb3VyY2UsIHRhcmdldCwgb3B0aW9ucykpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudG9VbnR5cGVkV2l0aE1vZGlmaWVkUmVzb3VyY2UodGFyZ2V0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJldmVydChncm91cDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9tb2RlbFJlZi52YWx1ZT8ub2JqZWN0LnJldmVydChvcHRpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTxudWxsPiB7XG5cdFx0YXdhaXQgc3VwZXIucmVzb2x2ZSgpO1xuXG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX21vZGVsUmVmLnZhbHVlKSB7XG5cdFx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuY3VzdG9tRWRpdG9yU2VydmljZS5tb2RlbHMudHJ5UmV0YWluKHRoaXMubW9kaWZpZWRSZXNvdXJjZSwgdGhpcy52aWV3VHlwZSk7XG5cdFx0XHRpZiAobW9kZWxSZWYpIHtcblx0XHRcdFx0Y29uc3Qgb2xkQ2FwYWJpbGl0aWVzID0gdGhpcy5jYXBhYmlsaXRpZXM7XG5cdFx0XHRcdGNvbnN0IHJldGFpbmVkTW9kZWxSZWYgPSBhd2FpdCBtb2RlbFJlZjtcblx0XHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0cmV0YWluZWRNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbW9kZWxSZWYudmFsdWUgPSByZXRhaW5lZE1vZGVsUmVmO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZXRhaW5lZE1vZGVsUmVmLm9iamVjdC5vbkRpZENoYW5nZURpcnR5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJldGFpbmVkTW9kZWxSZWYub2JqZWN0Lm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMuZmlyZSgpKSk7XG5cdFx0XHRcdGlmICh0aGlzLmlzRGlydHkoKSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGlydHkuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLmNhcGFiaWxpdGllcyAhPT0gb2xkQ2FwYWJpbGl0aWVzKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgdW5kbygpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudW5kb1JlZG9TZXJ2aWNlLnVuZG8odGhpcy5tb2RpZmllZFJlc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyByZWRvKCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy51bmRvUmVkb1NlcnZpY2UucmVkbyh0aGlzLm1vZGlmaWVkUmVzb3VyY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdG9VbnR5cGVkKF9vcHRpb25zPzogSVVudHlwZWRFZGl0b3JPcHRpb25zKTogSVJlc291cmNlRGlmZkVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gdGhpcy50b1VudHlwZWRXaXRoTW9kaWZpZWRSZXNvdXJjZSh0aGlzLm1vZGlmaWVkUmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1VudHlwZWRXaXRoTW9kaWZpZWRSZXNvdXJjZShtb2RpZmllZFJlc291cmNlOiBVUkkpOiBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogdGhpcy5vcmlnaW5hbFJlc291cmNlIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogbW9kaWZpZWRSZXNvdXJjZSB9LFxuXHRcdFx0bGFiZWw6IHRoaXMuaW5pdC5sYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmluaXQuZGVzY3JpcHRpb24sXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiB0aGlzLnZpZXdUeXBlLFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQgZXh0ZW5kcyBMYXppbHlSZXNvbHZlZFdlYnZpZXdFZGl0b3JJbnB1dCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVJlZmVyZW5jZTxJQ3VzdG9tRWRpdG9yTW9kZWw+PigpKTtcblxuXHRzdGF0aWMgY3JlYXRlKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0aW5pdDogQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dEluaXRJbmZvLFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQsXG5cdCk6IEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQge1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCB3ZWJ2aWV3ID0gYWNjZXNzb3IuZ2V0KElXZWJ2aWV3U2VydmljZSkuY3JlYXRlV2Vidmlld092ZXJsYXkoe1xuXHRcdFx0XHRwcm92aWRlZFZpZXdUeXBlOiBpbml0LnZpZXdUeXBlLFxuXHRcdFx0XHR0aXRsZTogYmFzZW5hbWUoZ2V0Q3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dFJlc291cmNlKGluaXQpKSxcblx0XHRcdFx0b3B0aW9uczoge30sXG5cdFx0XHRcdGNvbnRlbnRPcHRpb25zOiB7fSxcblx0XHRcdFx0ZXh0ZW5zaW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaW5wdXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0LCBpbml0LCB3ZWJ2aWV3KTtcblx0XHRcdGlmIChncm91cCkge1xuXHRcdFx0XHRpbnB1dC51cGRhdGVHcm91cChncm91cC5pZCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBpbnB1dDtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgb3ZlcnJpZGUgcmVhZG9ubHkgdHlwZUlkID0gJ3dvcmtiZW5jaC5lZGl0b3JzLmN1c3RvbVNpZGVCeVNpZGVEaWZmRWRpdG9yJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluaXQ6IEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXRJbml0SW5mbyxcblx0XHR3ZWJ2aWV3OiBJT3ZlcmxheVdlYnZpZXcsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2Ugd2Vidmlld1dvcmtiZW5jaFNlcnZpY2U6IElXZWJ2aWV3V29ya2JlbmNoU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUN1c3RvbUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21FZGl0b3JTZXJ2aWNlOiBJQ3VzdG9tRWRpdG9yU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASVVuZG9SZWRvU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVuZG9SZWRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoeyBwcm92aWRlZElkOiBpbml0LnZpZXdUeXBlLCB2aWV3VHlwZTogaW5pdC52aWV3VHlwZSwgbmFtZTogYmFzZW5hbWUoZ2V0Q3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dFJlc291cmNlKGluaXQpKSwgaWNvblBhdGg6IGluaXQuaWNvblBhdGggfSwgd2VidmlldywgdGhlbWVTZXJ2aWNlLCB3ZWJ2aWV3V29ya2JlbmNoU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMuZmlyZSgpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQudHlwZUlkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGVkaXRvcklkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudmlld1R5cGU7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgY2FwYWJpbGl0aWVzKCk6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIHtcblx0XHRsZXQgY2FwYWJpbGl0aWVzID0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuU2luZ2xldG9uIHwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuQ2FuRHJvcEludG9FZGl0b3I7XG5cdFx0aWYgKHRoaXMuaXNSZWFkb25seSgpKSB7XG5cdFx0XHRjYXBhYmlsaXRpZXMgfD0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuUmVhZG9ubHk7XG5cdFx0fVxuXHRcdHJldHVybiBjYXBhYmlsaXRpZXM7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgcmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5zaWRlID09PSAnb3JpZ2luYWwnID8gdGhpcy5vcmlnaW5hbFJlc291cmNlIDogdGhpcy5tb2RpZmllZFJlc291cmNlO1xuXHR9XG5cblx0Z2V0IG9yaWdpbmFsUmVzb3VyY2UoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5pbml0Lm9yaWdpbmFsUmVzb3VyY2U7XG5cdH1cblxuXHRnZXQgbW9kaWZpZWRSZXNvdXJjZSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLmluaXQubW9kaWZpZWRSZXNvdXJjZTtcblx0fVxuXG5cdGdldCBzaWRlKCk6IEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmU2lkZSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5pdC5zaWRlO1xuXHR9XG5cblx0Z2V0IGRpZmZJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmluaXQuZGlmZklkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0TmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBiYXNlbmFtZSh0aGlzLnJlc291cmNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldERlc2NyaXB0aW9uKF92ZXJib3NpdHk/OiBWZXJib3NpdHkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmluaXQuZGVzY3JpcHRpb24gPz8gc3VwZXIuZ2V0RGVzY3JpcHRpb24oKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFRpdGxlKHZlcmJvc2l0eT86IFZlcmJvc2l0eSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB0aGlzLmdldERlc2NyaXB0aW9uKHZlcmJvc2l0eSk7XG5cdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2N1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmVGl0bGUnLCBcInswfSAoezF9KVwiLCB0aGlzLmdldE5hbWUoKSwgZGVzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmdldE5hbWUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzUmVhZG9ubHkoKTogYm9vbGVhbiB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0aWYgKHRoaXMuc2lkZSA9PT0gJ29yaWdpbmFsJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGhpcy5fbW9kZWxSZWYudmFsdWU7XG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc1JlYWRvbmx5KHRoaXMubW9kaWZpZWRSZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbFJlZi5vYmplY3QuaXNSZWFkb25seSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaXNEaXJ0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zaWRlID09PSAnbW9kaWZpZWQnID8gdGhpcy5fbW9kZWxSZWYudmFsdWU/Lm9iamVjdC5pc0RpcnR5KCkgPz8gZmFsc2UgOiBmYWxzZTtcblx0fVxuXG5cdG92ZXJyaWRlIG1hdGNoZXMob3RoZXJJbnB1dDogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMgPT09IG90aGVySW5wdXQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChvdGhlcklucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZWRpdG9ySWQgPT09IG90aGVySW5wdXQuZWRpdG9ySWRcblx0XHRcdFx0JiYgdGhpcy5zaWRlID09PSBvdGhlcklucHV0LnNpZGVcblx0XHRcdFx0JiYgaXNFcXVhbCh0aGlzLm9yaWdpbmFsUmVzb3VyY2UsIG90aGVySW5wdXQub3JpZ2luYWxSZXNvdXJjZSlcblx0XHRcdFx0JiYgaXNFcXVhbCh0aGlzLm1vZGlmaWVkUmVzb3VyY2UsIG90aGVySW5wdXQubW9kaWZpZWRSZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRWRpdG9ySW5wdXQob3RoZXJJbnB1dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaXNSZXNvdXJjZUVkaXRvcklucHV0KG90aGVySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gaXNFcXVhbCh0aGlzLnJlc291cmNlLCBvdGhlcklucHV0LnJlc291cmNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSBjb3B5KCk6IEVkaXRvcklucHV0IHtcblx0XHRyZXR1cm4gQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dC5jcmVhdGUodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5pbml0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2F2ZShncm91cElkOiBHcm91cElkZW50aWZpZXIsIG9wdGlvbnM/OiBJU2F2ZU9wdGlvbnMpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gdGhpcy5fbW9kZWxSZWYudmFsdWU7XG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCBtb2RlbFJlZi5vYmplY3Quc2F2ZUN1c3RvbUVkaXRvcihvcHRpb25zKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIWlzRXF1YWwodGFyZ2V0LCB0aGlzLm1vZGlmaWVkUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4geyByZXNvdXJjZTogdGFyZ2V0IH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzYXZlQXMoZ3JvdXBJZDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuX21vZGVsUmVmLnZhbHVlO1xuXHRcdGlmICghbW9kZWxSZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5waWNrRmlsZVRvU2F2ZSh0aGlzLm1vZGlmaWVkUmVzb3VyY2UsIG9wdGlvbnM/LmF2YWlsYWJsZUZpbGVTeXN0ZW1zKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIWF3YWl0IG1vZGVsUmVmLm9iamVjdC5zYXZlQ3VzdG9tRWRpdG9yQXModGhpcy5tb2RpZmllZFJlc291cmNlLCB0YXJnZXQsIG9wdGlvbnMpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHJlc291cmNlOiB0YXJnZXQgfTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJldmVydChncm91cDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9tb2RlbFJlZi52YWx1ZT8ub2JqZWN0LnJldmVydChvcHRpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmUoKTogUHJvbWlzZTxudWxsPiB7XG5cdFx0YXdhaXQgc3VwZXIucmVzb2x2ZSgpO1xuXG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zaWRlID09PSAnbW9kaWZpZWQnICYmICF0aGlzLl9tb2RlbFJlZi52YWx1ZSkge1xuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSB0aGlzLmN1c3RvbUVkaXRvclNlcnZpY2UubW9kZWxzLnRyeVJldGFpbih0aGlzLm1vZGlmaWVkUmVzb3VyY2UsIHRoaXMudmlld1R5cGUpO1xuXHRcdFx0aWYgKG1vZGVsUmVmKSB7XG5cdFx0XHRcdGNvbnN0IG9sZENhcGFiaWxpdGllcyA9IHRoaXMuY2FwYWJpbGl0aWVzO1xuXHRcdFx0XHRjb25zdCByZXRhaW5lZE1vZGVsUmVmID0gYXdhaXQgbW9kZWxSZWY7XG5cdFx0XHRcdGlmICh0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHRcdHJldGFpbmVkTW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX21vZGVsUmVmLnZhbHVlID0gcmV0YWluZWRNb2RlbFJlZjtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmV0YWluZWRNb2RlbFJlZi5vYmplY3Qub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihyZXRhaW5lZE1vZGVsUmVmLm9iamVjdC5vbkRpZENoYW5nZVJlYWRvbmx5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzLmZpcmUoKSkpO1xuXHRcdFx0XHRpZiAodGhpcy5pc0RpcnR5KCkpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMgIT09IG9sZENhcGFiaWxpdGllcykge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHVibGljIHVuZG8oKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnVuZG9SZWRvU2VydmljZS51bmRvKHRoaXMubW9kaWZpZWRSZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVkbygpOiB2b2lkIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudW5kb1JlZG9TZXJ2aWNlLnJlZG8odGhpcy5tb2RpZmllZFJlc291cmNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvVW50eXBlZChfb3B0aW9ucz86IElVbnR5cGVkRWRpdG9yT3B0aW9ucyk6IElVbnR5cGVkRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiB7IHJlc291cmNlOiB0aGlzLnJlc291cmNlIH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxV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
