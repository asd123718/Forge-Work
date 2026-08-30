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
import * as glob from "../../../../base/common/glob.js";
import { EditorInputCapabilities, Verbosity, isResourceEditorInput } from "../../../common/editor.js";
import { INotebookService, SimpleNotebookProviderInfo } from "./notebookService.js";
import { URI } from "../../../../base/common/uri.js";
import { isEqual, toLocalResource } from "../../../../base/common/resources.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INotebookEditorModelResolverService } from "./notebookEditorModelResolverService.js";
import { CellEditType, CellUri } from "./notebookCommon.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Schemas } from "../../../../base/common/network.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { AbstractResourceEditorInput } from "../../../common/editor/resourceEditorInput.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { localize } from "../../../../nls.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { ICustomEditorLabelService } from "../../../services/editor/common/customEditorLabelService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { isAbsolute } from "../../../../base/common/path.js";
let NotebookEditorInput = class extends AbstractResourceEditorInput {
  constructor(resource, preferredResource, viewType, options, _notebookService, _notebookModelResolverService, _fileDialogService, labelService, fileService, filesConfigurationService, extensionService, editorService, textResourceConfigurationService, customEditorLabelService, environmentService, pathService) {
    super(resource, preferredResource, labelService, fileService, filesConfigurationService, textResourceConfigurationService, customEditorLabelService);
    this.viewType = viewType;
    this.options = options;
    this._notebookService = _notebookService;
    this._notebookModelResolverService = _notebookModelResolverService;
    this._fileDialogService = _fileDialogService;
    this.environmentService = environmentService;
    this.pathService = pathService;
    this.editorModelReference = null;
    this._defaultDirtyState = false;
    this._defaultDirtyState = !!options.startDirty;
    this._sideLoadedListener = _notebookService.onDidAddNotebookDocument((e) => {
      if (e.viewType === this.viewType && e.uri.toString() === this.resource.toString()) {
        this.resolve().catch(onUnexpectedError);
      }
    });
    this._register(extensionService.onWillStop((e) => {
      if (!e.auto && !this.isDirty()) {
        return;
      }
      const reason = e.auto ? localize("vetoAutoExtHostRestart", "An extension provided notebook for '{0}' is still open that would close otherwise.", this.getName()) : localize("vetoExtHostRestart", "An extension provided notebook for '{0}' could not be saved.", this.getName());
      e.veto((async () => {
        const editors = editorService.findEditors(this);
        if (e.auto) {
          return true;
        }
        if (editors.length > 0) {
          const result = await editorService.save(editors[0]);
          if (result.success) {
            return false;
          }
        }
        return true;
      })(), reason);
    }));
  }
  static getOrCreate(instantiationService, resource, preferredResource, viewType, options = {}) {
    const editor = instantiationService.createInstance(NotebookEditorInput, resource, preferredResource, viewType, options);
    if (preferredResource) {
      editor.setPreferredResource(preferredResource);
    }
    return editor;
  }
  dispose() {
    this._sideLoadedListener.dispose();
    this.editorModelReference?.dispose();
    this.editorModelReference = null;
    super.dispose();
  }
  get typeId() {
    return NotebookEditorInput.ID;
  }
  get editorId() {
    return this.viewType;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.None;
    if (this.resource.scheme === Schemas.untitled) {
      capabilities |= EditorInputCapabilities.Untitled;
    }
    if (this.editorModelReference) {
      if (this.editorModelReference.object.isReadonly()) {
        capabilities |= EditorInputCapabilities.Readonly;
      }
    } else {
      if (this.filesConfigurationService.isReadonly(this.resource)) {
        capabilities |= EditorInputCapabilities.Readonly;
      }
    }
    if (!(capabilities & EditorInputCapabilities.Readonly)) {
      capabilities |= EditorInputCapabilities.CanDropIntoEditor;
    }
    return capabilities;
  }
  getDescription(verbosity = Verbosity.MEDIUM) {
    if (!this.hasCapability(EditorInputCapabilities.Untitled) || this.editorModelReference?.object.hasAssociatedFilePath()) {
      return super.getDescription(verbosity);
    }
    return void 0;
  }
  isReadonly() {
    if (!this.editorModelReference) {
      return this.filesConfigurationService.isReadonly(this.resource);
    }
    return this.editorModelReference.object.isReadonly();
  }
  isDirty() {
    if (!this.editorModelReference) {
      return this._defaultDirtyState;
    }
    return this.editorModelReference.object.isDirty();
  }
  isSaving() {
    const model = this.editorModelReference?.object;
    if (!model || !model.isDirty() || model.hasErrorState || this.hasCapability(EditorInputCapabilities.Untitled)) {
      return false;
    }
    return this.filesConfigurationService.hasShortAutoSaveDelay(this);
  }
  async save(group, options) {
    if (this.editorModelReference) {
      if (this.hasCapability(EditorInputCapabilities.Untitled)) {
        return this.saveAs(group, options);
      } else {
        await this.editorModelReference.object.save(options);
      }
      return this;
    }
    return void 0;
  }
  async saveAs(group, options) {
    if (!this.editorModelReference) {
      return void 0;
    }
    const provider = this._notebookService.getContributedNotebookType(this.viewType);
    if (!provider) {
      return void 0;
    }
    const pathCandidate = this.hasCapability(EditorInputCapabilities.Untitled) ? await this._suggestName(provider) : this.editorModelReference.object.resource;
    let target;
    if (this.editorModelReference.object.hasAssociatedFilePath()) {
      target = pathCandidate;
    } else {
      target = await this._fileDialogService.pickFileToSave(pathCandidate, options?.availableFileSystems);
      if (!target) {
        return void 0;
      }
    }
    if (!provider.matches(target)) {
      const patterns = provider.selectors.map((pattern) => {
        if (typeof pattern === "string") {
          return pattern;
        }
        if (glob.isRelativePattern(pattern)) {
          return `${pattern} (base ${pattern.base})`;
        }
        if (pattern.exclude) {
          return `${pattern.include} (exclude: ${pattern.exclude})`;
        } else {
          return `${pattern.include}`;
        }
      }).join(", ");
      throw new Error(`File name ${target} is not supported by ${provider.providerDisplayName}.

Please make sure the file name matches following patterns:
${patterns}`);
    }
    return await this.editorModelReference.object.saveAs(target);
  }
  async _suggestName(provider) {
    const resource = await this.ensureAbsolutePath(this.ensureProviderExtension(provider));
    const remoteAuthority = this.environmentService.remoteAuthority;
    return toLocalResource(resource, remoteAuthority, this.pathService.defaultUriScheme);
  }
  async ensureAbsolutePath(resource) {
    if (resource.scheme !== Schemas.untitled || isAbsolute(resource.path)) {
      return resource;
    }
    const defaultFilePath = await this._fileDialogService.defaultFilePath();
    return URI.joinPath(defaultFilePath, resource.path);
  }
  ensureProviderExtension(provider) {
    const firstSelector = provider.selectors[0];
    let selectorStr = firstSelector && typeof firstSelector === "string" ? firstSelector : void 0;
    if (!selectorStr && firstSelector) {
      const include = firstSelector.include;
      if (typeof include === "string") {
        selectorStr = include;
      }
    }
    const resource = this.resource;
    if (selectorStr) {
      const matches = /^\*\.([A-Za-z_-]*)$/.exec(selectorStr);
      if (matches && matches.length > 1) {
        const fileExt = matches[1];
        if (!resource.path.endsWith(fileExt)) {
          return resource.with({ path: resource.path + "." + fileExt });
        }
      }
    }
    return resource;
  }
  // called when users rename a notebook document
  async rename(group, target) {
    if (this.editorModelReference) {
      return { editor: { resource: target }, options: { override: this.viewType } };
    }
    return void 0;
  }
  async revert(_group, options) {
    if (this.editorModelReference && this.editorModelReference.object.isDirty()) {
      await this.editorModelReference.object.revert(options);
    }
  }
  async resolve(_options, perf) {
    if (!await this._notebookService.canResolve(this.viewType)) {
      return null;
    }
    perf?.mark("extensionActivated");
    this._sideLoadedListener.dispose();
    if (!this.editorModelReference) {
      const scratchpad = this.capabilities & EditorInputCapabilities.Scratchpad ? true : false;
      const ref = await this._notebookModelResolverService.resolve(this.resource, this.viewType, { limits: this.ensureLimits(_options), scratchpad, viewType: this.editorId });
      if (this.editorModelReference) {
        ref.dispose();
        return this.editorModelReference.object;
      }
      this.editorModelReference = ref;
      if (this.isDisposed()) {
        this.editorModelReference.dispose();
        this.editorModelReference = null;
        return null;
      }
      this._register(this.editorModelReference.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
      this._register(this.editorModelReference.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
      this._register(this.editorModelReference.object.onDidRevertUntitled(() => this.dispose()));
      if (this.editorModelReference.object.isDirty()) {
        this._onDidChangeDirty.fire();
      }
    } else {
      this.editorModelReference.object.load({ limits: this.ensureLimits(_options) });
    }
    if (this.options._backupId) {
      const info = await this._notebookService.withNotebookDataProvider(this.editorModelReference.object.notebook.viewType);
      if (!(info instanceof SimpleNotebookProviderInfo)) {
        throw new Error("CANNOT open file notebook with this provider");
      }
      const data = await info.serializer.dataToNotebook(VSBuffer.fromString(JSON.stringify({ __webview_backup: this.options._backupId })));
      this.editorModelReference.object.notebook.applyEdits([
        {
          editType: CellEditType.Replace,
          index: 0,
          count: this.editorModelReference.object.notebook.length,
          cells: data.cells
        }
      ], true, void 0, () => void 0, void 0, false);
      if (this.options._workingCopy) {
        this.options._backupId = void 0;
        this.options._workingCopy = void 0;
        this.options.startDirty = void 0;
      }
    }
    return this.editorModelReference.object;
  }
  toUntyped() {
    return {
      resource: this.resource,
      options: {
        override: this.viewType
      }
    };
  }
  matches(otherInput) {
    if (super.matches(otherInput)) {
      return true;
    }
    if (otherInput instanceof NotebookEditorInput) {
      return this.viewType === otherInput.viewType && isEqual(this.resource, otherInput.resource);
    }
    if (isResourceEditorInput(otherInput) && otherInput.resource.scheme === CellUri.scheme) {
      return isEqual(this.resource, CellUri.parse(otherInput.resource)?.notebook);
    }
    return false;
  }
};
NotebookEditorInput.ID = "workbench.input.notebook";
NotebookEditorInput = __decorateClass([
  __decorateParam(4, INotebookService),
  __decorateParam(5, INotebookEditorModelResolverService),
  __decorateParam(6, IFileDialogService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IFilesConfigurationService),
  __decorateParam(10, IExtensionService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, ITextResourceConfigurationService),
  __decorateParam(13, ICustomEditorLabelService),
  __decorateParam(14, IWorkbenchEnvironmentService),
  __decorateParam(15, IPathService)
], NotebookEditorInput);
function isCompositeNotebookEditorInput(thing) {
  return !!thing && typeof thing === "object" && Array.isArray(thing.editorInputs) && thing.editorInputs.every((input) => input instanceof NotebookEditorInput);
}
function isNotebookEditorInput(thing) {
  return !!thing && typeof thing === "object" && thing.typeId === NotebookEditorInput.ID;
}
export {
  NotebookEditorInput,
  isCompositeNotebookEditorInput,
  isNotebookEditorInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxjb21tb25cXG5vdGVib29rRWRpdG9ySW5wdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgR3JvdXBJZGVudGlmaWVyLCBJU2F2ZU9wdGlvbnMsIElNb3ZlUmVzdWx0LCBJUmV2ZXJ0T3B0aW9ucywgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIFZlcmJvc2l0eSwgSVVudHlwZWRFZGl0b3JJbnB1dCwgSUZpbGVMaW1pdGVkRWRpdG9ySW5wdXRPcHRpb25zLCBpc1Jlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlLCBTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbyB9IGZyb20gJy4vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsLCB0b0xvY2FsUmVzb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi9ub3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbFVyaSwgSVJlc29sdmVkTm90ZWJvb2tFZGl0b3JNb2RlbCB9IGZyb20gJy4vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9yZXNvdXJjZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5SWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1Byb3ZpZGVySW5mbyB9IGZyb20gJy4vbm90ZWJvb2tQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1BlcmZNYXJrcyB9IGZyb20gJy4vbm90ZWJvb2tQZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2N1c3RvbUVkaXRvckxhYmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0Fic29sdXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tFZGl0b3JJbnB1dE9wdGlvbnMge1xuXHRzdGFydERpcnR5PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIGJhY2t1cElkIGZvciB3ZWJ2aWV3XG5cdCAqL1xuXHRfYmFja3VwSWQ/OiBzdHJpbmc7XG5cdF93b3JraW5nQ29weT86IElXb3JraW5nQ29weUlkZW50aWZpZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0VkaXRvcklucHV0IGV4dGVuZHMgQWJzdHJhY3RSZXNvdXJjZUVkaXRvcklucHV0IHtcblxuXHRzdGF0aWMgZ2V0T3JDcmVhdGUoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgcmVzb3VyY2U6IFVSSSwgcHJlZmVycmVkUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgdmlld1R5cGU6IHN0cmluZywgb3B0aW9uczogTm90ZWJvb2tFZGl0b3JJbnB1dE9wdGlvbnMgPSB7fSkge1xuXHRcdGNvbnN0IGVkaXRvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRWRpdG9ySW5wdXQsIHJlc291cmNlLCBwcmVmZXJyZWRSZXNvdXJjZSwgdmlld1R5cGUsIG9wdGlvbnMpO1xuXHRcdGlmIChwcmVmZXJyZWRSZXNvdXJjZSkge1xuXHRcdFx0ZWRpdG9yLnNldFByZWZlcnJlZFJlc291cmNlKHByZWZlcnJlZFJlc291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gJ3dvcmtiZW5jaC5pbnB1dC5ub3RlYm9vayc7XG5cblx0cHJvdGVjdGVkIGVkaXRvck1vZGVsUmVmZXJlbmNlOiBJUmVmZXJlbmNlPElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWw+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX3NpZGVMb2FkZWRMaXN0ZW5lcjogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgX2RlZmF1bHREaXJ0eVN0YXRlOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVzb3VyY2U6IFVSSSxcblx0XHRwcmVmZXJyZWRSZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSB2aWV3VHlwZTogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBvcHRpb25zOiBOb3RlYm9va0VkaXRvcklucHV0T3B0aW9ucyxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rTW9kZWxSZXNvbHZlclNlcnZpY2U6IElOb3RlYm9va0VkaXRvck1vZGVsUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJRmlsZURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSBjdXN0b21FZGl0b3JMYWJlbFNlcnZpY2U6IElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihyZXNvdXJjZSwgcHJlZmVycmVkUmVzb3VyY2UsIGxhYmVsU2VydmljZSwgZmlsZVNlcnZpY2UsIGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UpO1xuXHRcdHRoaXMuX2RlZmF1bHREaXJ0eVN0YXRlID0gISFvcHRpb25zLnN0YXJ0RGlydHk7XG5cblx0XHQvLyBBdXRvbWF0aWNhbGx5IHJlc29sdmUgdGhpcyBpbnB1dCB3aGVuIHRoZSBcIndhbnRlZFwiIG1vZGVsIGNvbWVzIHRvIGxpZmUgdmlhXG5cdFx0Ly8gc29tZSBvdGhlciB3YXkuIFRoaXMgaGFwcGVucyBvbmx5IG9uY2UgcGVyIGlucHV0IGFuZCByZXNvbHZlIGRpc3Bvc2VzXG5cdFx0Ly8gdGhpcyBsaXN0ZW5lclxuXHRcdHRoaXMuX3NpZGVMb2FkZWRMaXN0ZW5lciA9IF9ub3RlYm9va1NlcnZpY2Uub25EaWRBZGROb3RlYm9va0RvY3VtZW50KGUgPT4ge1xuXHRcdFx0aWYgKGUudmlld1R5cGUgPT09IHRoaXMudmlld1R5cGUgJiYgZS51cmkudG9TdHJpbmcoKSA9PT0gdGhpcy5yZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHRoaXMucmVzb2x2ZSgpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvblNlcnZpY2Uub25XaWxsU3RvcChlID0+IHtcblx0XHRcdGlmICghZS5hdXRvICYmICF0aGlzLmlzRGlydHkoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlYXNvbiA9IGUuYXV0b1xuXHRcdFx0XHQ/IGxvY2FsaXplKCd2ZXRvQXV0b0V4dEhvc3RSZXN0YXJ0JywgXCJBbiBleHRlbnNpb24gcHJvdmlkZWQgbm90ZWJvb2sgZm9yICd7MH0nIGlzIHN0aWxsIG9wZW4gdGhhdCB3b3VsZCBjbG9zZSBvdGhlcndpc2UuXCIsIHRoaXMuZ2V0TmFtZSgpKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCd2ZXRvRXh0SG9zdFJlc3RhcnQnLCBcIkFuIGV4dGVuc2lvbiBwcm92aWRlZCBub3RlYm9vayBmb3IgJ3swfScgY291bGQgbm90IGJlIHNhdmVkLlwiLCB0aGlzLmdldE5hbWUoKSk7XG5cblx0XHRcdGUudmV0bygoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JzID0gZWRpdG9yU2VydmljZS5maW5kRWRpdG9ycyh0aGlzKTtcblx0XHRcdFx0aWYgKGUuYXV0bykge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlZGl0b3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBlZGl0b3JTZXJ2aWNlLnNhdmUoZWRpdG9yc1swXSk7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdC5zdWNjZXNzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIERvbid0IFZldG9cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIFZldG9cblx0XHRcdH0pKCksIHJlYXNvbik7XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9zaWRlTG9hZGVkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2U/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlID0gbnVsbDtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIE5vdGVib29rRWRpdG9ySW5wdXQuSUQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3VHlwZTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMge1xuXHRcdGxldCBjYXBhYmlsaXRpZXMgPSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5Ob25lO1xuXG5cdFx0aWYgKHRoaXMucmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkKSB7XG5cdFx0XHRjYXBhYmlsaXRpZXMgfD0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2UpIHtcblx0XHRcdGlmICh0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5pc1JlYWRvbmx5KCkpIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzIHw9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlYWRvbmx5O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzUmVhZG9ubHkodGhpcy5yZXNvdXJjZSkpIHtcblx0XHRcdFx0Y2FwYWJpbGl0aWVzIHw9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlYWRvbmx5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghKGNhcGFiaWxpdGllcyAmIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlJlYWRvbmx5KSkge1xuXHRcdFx0Y2FwYWJpbGl0aWVzIHw9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkNhbkRyb3BJbnRvRWRpdG9yO1xuXHRcdH1cblxuXHRcdHJldHVybiBjYXBhYmlsaXRpZXM7XG5cdH1cblxuXHRvdmVycmlkZSBnZXREZXNjcmlwdGlvbih2ZXJib3NpdHkgPSBWZXJib3NpdHkuTUVESVVNKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkgfHwgdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZT8ub2JqZWN0Lmhhc0Fzc29jaWF0ZWRGaWxlUGF0aCgpKSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIuZ2V0RGVzY3JpcHRpb24odmVyYm9zaXR5KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBubyBkZXNjcmlwdGlvbiBmb3IgdW50aXRsZWQgbm90ZWJvb2tzIHdpdGhvdXQgYXNzb2NpYXRlZCBmaWxlIHBhdGhcblx0fVxuXG5cdG92ZXJyaWRlIGlzUmVhZG9ubHkoKTogYm9vbGVhbiB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzUmVhZG9ubHkodGhpcy5yZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5pc1JlYWRvbmx5KCk7XG5cdH1cblxuXHRvdmVycmlkZSBpc0RpcnR5KCkge1xuXHRcdGlmICghdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHREaXJ0eVN0YXRlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3QuaXNEaXJ0eSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaXNTYXZpbmcoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlPy5vYmplY3Q7XG5cdFx0aWYgKCFtb2RlbCB8fCAhbW9kZWwuaXNEaXJ0eSgpIHx8IG1vZGVsLmhhc0Vycm9yU3RhdGUgfHwgdGhpcy5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyByZXF1aXJlIHRoZSBtb2RlbCB0byBiZSBkaXJ0eSwgZmlsZS1iYWNrZWQgYW5kIG5vdCBpbiBhbiBlcnJvciBzdGF0ZVxuXHRcdH1cblxuXHRcdC8vIGlmIGEgc2hvcnQgYXV0byBzYXZlIGlzIGNvbmZpZ3VyZWQsIHRyZWF0IHRoaXMgYXMgYmVpbmcgc2F2ZWRcblx0XHRyZXR1cm4gdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmhhc1Nob3J0QXV0b1NhdmVEZWxheSh0aGlzKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNhdmUoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8RWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2UpIHtcblxuXHRcdFx0aWYgKHRoaXMuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2F2ZUFzKGdyb3VwLCBvcHRpb25zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0LnNhdmUob3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzYXZlQXMoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8SVVudHlwZWRFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX25vdGVib29rU2VydmljZS5nZXRDb250cmlidXRlZE5vdGVib29rVHlwZSh0aGlzLnZpZXdUeXBlKTtcblxuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF0aENhbmRpZGF0ZSA9IHRoaXMuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZClcblx0XHRcdD8gYXdhaXQgdGhpcy5fc3VnZ2VzdE5hbWUocHJvdmlkZXIpXG5cdFx0XHQ6IHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0LnJlc291cmNlO1xuXG5cdFx0bGV0IHRhcmdldDogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5oYXNBc3NvY2lhdGVkRmlsZVBhdGgoKSkge1xuXHRcdFx0dGFyZ2V0ID0gcGF0aENhbmRpZGF0ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFyZ2V0ID0gYXdhaXQgdGhpcy5fZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZpbGVUb1NhdmUocGF0aENhbmRpZGF0ZSwgb3B0aW9ucz8uYXZhaWxhYmxlRmlsZVN5c3RlbXMpO1xuXHRcdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gc2F2ZSBjYW5jZWxsZWRcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXByb3ZpZGVyLm1hdGNoZXModGFyZ2V0KSkge1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSBwcm92aWRlci5zZWxlY3RvcnMubWFwKHBhdHRlcm4gPT4ge1xuXHRcdFx0XHRpZiAodHlwZW9mIHBhdHRlcm4gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhdHRlcm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZ2xvYi5pc1JlbGF0aXZlUGF0dGVybihwYXR0ZXJuKSkge1xuXHRcdFx0XHRcdHJldHVybiBgJHtwYXR0ZXJufSAoYmFzZSAke3BhdHRlcm4uYmFzZX0pYDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChwYXR0ZXJuLmV4Y2x1ZGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gYCR7cGF0dGVybi5pbmNsdWRlfSAoZXhjbHVkZTogJHtwYXR0ZXJuLmV4Y2x1ZGV9KWA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIGAke3BhdHRlcm4uaW5jbHVkZX1gO1xuXHRcdFx0XHR9XG5cblx0XHRcdH0pLmpvaW4oJywgJyk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZpbGUgbmFtZSAke3RhcmdldH0gaXMgbm90IHN1cHBvcnRlZCBieSAke3Byb3ZpZGVyLnByb3ZpZGVyRGlzcGxheU5hbWV9LlxcblxcblBsZWFzZSBtYWtlIHN1cmUgdGhlIGZpbGUgbmFtZSBtYXRjaGVzIGZvbGxvd2luZyBwYXR0ZXJuczpcXG4ke3BhdHRlcm5zfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiBhd2FpdCB0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5zYXZlQXModGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N1Z2dlc3ROYW1lKHByb3ZpZGVyOiBOb3RlYm9va1Byb3ZpZGVySW5mbykge1xuXHRcdGNvbnN0IHJlc291cmNlID0gYXdhaXQgdGhpcy5lbnN1cmVBYnNvbHV0ZVBhdGgodGhpcy5lbnN1cmVQcm92aWRlckV4dGVuc2lvbihwcm92aWRlcikpO1xuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRyZXR1cm4gdG9Mb2NhbFJlc291cmNlKHJlc291cmNlLCByZW1vdGVBdXRob3JpdHksIHRoaXMucGF0aFNlcnZpY2UuZGVmYXVsdFVyaVNjaGVtZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVuc3VyZUFic29sdXRlUGF0aChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxVUkk+IHtcblx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLnVudGl0bGVkIHx8IGlzQWJzb2x1dGUocmVzb3VyY2UucGF0aCkpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZhdWx0RmlsZVBhdGggPSBhd2FpdCB0aGlzLl9maWxlRGlhbG9nU2VydmljZS5kZWZhdWx0RmlsZVBhdGgoKTtcblx0XHRyZXR1cm4gVVJJLmpvaW5QYXRoKGRlZmF1bHRGaWxlUGF0aCwgcmVzb3VyY2UucGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZVByb3ZpZGVyRXh0ZW5zaW9uKHByb3ZpZGVyOiBOb3RlYm9va1Byb3ZpZGVySW5mbykge1xuXHRcdGNvbnN0IGZpcnN0U2VsZWN0b3IgPSBwcm92aWRlci5zZWxlY3RvcnNbMF07XG5cdFx0bGV0IHNlbGVjdG9yU3RyID0gZmlyc3RTZWxlY3RvciAmJiB0eXBlb2YgZmlyc3RTZWxlY3RvciA9PT0gJ3N0cmluZycgPyBmaXJzdFNlbGVjdG9yIDogdW5kZWZpbmVkO1xuXHRcdGlmICghc2VsZWN0b3JTdHIgJiYgZmlyc3RTZWxlY3Rvcikge1xuXHRcdFx0Y29uc3QgaW5jbHVkZSA9IChmaXJzdFNlbGVjdG9yIGFzIHsgaW5jbHVkZT86IHN0cmluZyB9KS5pbmNsdWRlO1xuXHRcdFx0aWYgKHR5cGVvZiBpbmNsdWRlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRzZWxlY3RvclN0ciA9IGluY2x1ZGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnJlc291cmNlO1xuXHRcdGlmIChzZWxlY3RvclN0cikge1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IC9eXFwqXFwuKFtBLVphLXpfLV0qKSQvLmV4ZWMoc2VsZWN0b3JTdHIpO1xuXHRcdFx0aWYgKG1hdGNoZXMgJiYgbWF0Y2hlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVFeHQgPSBtYXRjaGVzWzFdO1xuXHRcdFx0XHRpZiAoIXJlc291cmNlLnBhdGguZW5kc1dpdGgoZmlsZUV4dCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2Uud2l0aCh7IHBhdGg6IHJlc291cmNlLnBhdGggKyAnLicgKyBmaWxlRXh0IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc291cmNlO1xuXHR9XG5cblx0Ly8gY2FsbGVkIHdoZW4gdXNlcnMgcmVuYW1lIGEgbm90ZWJvb2sgZG9jdW1lbnRcblx0b3ZlcnJpZGUgYXN5bmMgcmVuYW1lKGdyb3VwOiBHcm91cElkZW50aWZpZXIsIHRhcmdldDogVVJJKTogUHJvbWlzZTxJTW92ZVJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlKSB7XG5cdFx0XHRyZXR1cm4geyBlZGl0b3I6IHsgcmVzb3VyY2U6IHRhcmdldCB9LCBvcHRpb25zOiB7IG92ZXJyaWRlOiB0aGlzLnZpZXdUeXBlIH0gfTtcblxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmV2ZXJ0KF9ncm91cDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSAmJiB0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5pc0RpcnR5KCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0LnJldmVydChvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlKF9vcHRpb25zPzogSUZpbGVMaW1pdGVkRWRpdG9ySW5wdXRPcHRpb25zLCBwZXJmPzogTm90ZWJvb2tQZXJmTWFya3MpOiBQcm9taXNlPElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWwgfCBudWxsPiB7XG5cdFx0aWYgKCFhd2FpdCB0aGlzLl9ub3RlYm9va1NlcnZpY2UuY2FuUmVzb2x2ZSh0aGlzLnZpZXdUeXBlKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cGVyZj8ubWFyaygnZXh0ZW5zaW9uQWN0aXZhdGVkJyk7XG5cblx0XHQvLyB3ZSBhcmUgbm93IGxvYWRpbmcgdGhlIG5vdGVib29rIGFuZCBkb24ndCBuZWVkIHRvIGxpc3RlbiB0b1xuXHRcdC8vIFwib3RoZXJcIiBsb2FkaW5nIGFueW1vcmVcblx0XHR0aGlzLl9zaWRlTG9hZGVkTGlzdGVuZXIuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKCF0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlKSB7XG5cdFx0XHRjb25zdCBzY3JhdGNocGFkID0gdGhpcy5jYXBhYmlsaXRpZXMgJiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TY3JhdGNocGFkID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fbm90ZWJvb2tNb2RlbFJlc29sdmVyU2VydmljZS5yZXNvbHZlKHRoaXMucmVzb3VyY2UsIHRoaXMudmlld1R5cGUsIHsgbGltaXRzOiB0aGlzLmVuc3VyZUxpbWl0cyhfb3B0aW9ucyksIHNjcmF0Y2hwYWQsIHZpZXdUeXBlOiB0aGlzLmVkaXRvcklkIH0pO1xuXHRcdFx0aWYgKHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2UpIHtcblx0XHRcdFx0Ly8gUmUtZW50cmFudCwgZG91YmxlIHJlc29sdmUgaGFwcGVuZWQuIERpc3Bvc2UgdGhlIGFkZGl0aW9uIHJlZmVyZW5jZXMgYW5kIHByb2NlZWRcblx0XHRcdFx0Ly8gd2l0aCB0aGUgdHJ1dGguXG5cdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybiAoPElSZWZlcmVuY2U8SVJlc29sdmVkTm90ZWJvb2tFZGl0b3JNb2RlbD4+dGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSkub2JqZWN0O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSA9IHJlZjtcblx0XHRcdGlmICh0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0XHR0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZSA9IG51bGw7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3Qub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3Qub25EaWRDaGFuZ2VSZWFkb25seSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUNhcGFiaWxpdGllcy5maXJlKCkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0Lm9uRGlkUmV2ZXJ0VW50aXRsZWQoKCkgPT4gdGhpcy5kaXNwb3NlKCkpKTtcblx0XHRcdGlmICh0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5pc0RpcnR5KCkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0LmxvYWQoeyBsaW1pdHM6IHRoaXMuZW5zdXJlTGltaXRzKF9vcHRpb25zKSB9KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLl9iYWNrdXBJZCkge1xuXHRcdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHRoaXMuX25vdGVib29rU2VydmljZS53aXRoTm90ZWJvb2tEYXRhUHJvdmlkZXIodGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3Qubm90ZWJvb2sudmlld1R5cGUpO1xuXHRcdFx0aWYgKCEoaW5mbyBpbnN0YW5jZW9mIFNpbXBsZU5vdGVib29rUHJvdmlkZXJJbmZvKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NBTk5PVCBvcGVuIGZpbGUgbm90ZWJvb2sgd2l0aCB0aGlzIHByb3ZpZGVyJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRhdGEgPSBhd2FpdCBpbmZvLnNlcmlhbGl6ZXIuZGF0YVRvTm90ZWJvb2soVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7IF9fd2Vidmlld19iYWNrdXA6IHRoaXMub3B0aW9ucy5fYmFja3VwSWQgfSkpKTtcblx0XHRcdHRoaXMuZWRpdG9yTW9kZWxSZWZlcmVuY2Uub2JqZWN0Lm5vdGVib29rLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdGNvdW50OiB0aGlzLmVkaXRvck1vZGVsUmVmZXJlbmNlLm9iamVjdC5ub3RlYm9vay5sZW5ndGgsXG5cdFx0XHRcdFx0Y2VsbHM6IGRhdGEuY2VsbHNcblx0XHRcdFx0fVxuXHRcdFx0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLl93b3JraW5nQ29weSkge1xuXHRcdFx0XHR0aGlzLm9wdGlvbnMuX2JhY2t1cElkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLm9wdGlvbnMuX3dvcmtpbmdDb3B5ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLm9wdGlvbnMuc3RhcnREaXJ0eSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JNb2RlbFJlZmVyZW5jZS5vYmplY3Q7XG5cdH1cblxuXHRvdmVycmlkZSB0b1VudHlwZWQoKTogSVJlc291cmNlRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5yZXNvdXJjZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0b3ZlcnJpZGU6IHRoaXMudmlld1R5cGVcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgbWF0Y2hlcyhvdGhlcklucHV0OiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAoc3VwZXIubWF0Y2hlcyhvdGhlcklucHV0KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChvdGhlcklucHV0IGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudmlld1R5cGUgPT09IG90aGVySW5wdXQudmlld1R5cGUgJiYgaXNFcXVhbCh0aGlzLnJlc291cmNlLCBvdGhlcklucHV0LnJlc291cmNlKTtcblx0XHR9XG5cdFx0aWYgKGlzUmVzb3VyY2VFZGl0b3JJbnB1dChvdGhlcklucHV0KSAmJiBvdGhlcklucHV0LnJlc291cmNlLnNjaGVtZSA9PT0gQ2VsbFVyaS5zY2hlbWUpIHtcblx0XHRcdHJldHVybiBpc0VxdWFsKHRoaXMucmVzb3VyY2UsIENlbGxVcmkucGFyc2Uob3RoZXJJbnB1dC5yZXNvdXJjZSk/Lm5vdGVib29rKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvc2l0ZU5vdGVib29rRWRpdG9ySW5wdXQge1xuXHRyZWFkb25seSBlZGl0b3JJbnB1dHM6IE5vdGVib29rRWRpdG9ySW5wdXRbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ29tcG9zaXRlTm90ZWJvb2tFZGl0b3JJbnB1dCh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIElDb21wb3NpdGVOb3RlYm9va0VkaXRvcklucHV0IHtcblx0cmV0dXJuICEhdGhpbmdcblx0XHQmJiB0eXBlb2YgdGhpbmcgPT09ICdvYmplY3QnXG5cdFx0JiYgQXJyYXkuaXNBcnJheSgoPElDb21wb3NpdGVOb3RlYm9va0VkaXRvcklucHV0PnRoaW5nKS5lZGl0b3JJbnB1dHMpXG5cdFx0JiYgKCg8SUNvbXBvc2l0ZU5vdGVib29rRWRpdG9ySW5wdXQ+dGhpbmcpLmVkaXRvcklucHV0cy5ldmVyeShpbnB1dCA9PiBpbnB1dCBpbnN0YW5jZW9mIE5vdGVib29rRWRpdG9ySW5wdXQpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTm90ZWJvb2tFZGl0b3JJbnB1dCh0aGluZzogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQpOiB0aGluZyBpcyBOb3RlYm9va0VkaXRvcklucHV0IHtcblx0cmV0dXJuICEhdGhpbmdcblx0XHQmJiB0eXBlb2YgdGhpbmcgPT09ICdvYmplY3QnXG5cdFx0JiYgdGhpbmcudHlwZUlkID09PSBOb3RlYm9va0VkaXRvcklucHV0LklEO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFVBQVU7QUFDdEIsU0FBcUUseUJBQXlCLFdBQWdFLDZCQUE2QjtBQUUzTCxTQUFTLGtCQUFrQixrQ0FBa0M7QUFDN0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsU0FBUyx1QkFBdUI7QUFFekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQ0FBMkM7QUFFcEQsU0FBUyxjQUFjLGVBQTZDO0FBQ3BFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1DQUFtQztBQUU1QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUl6QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQVdwQixJQUFNLHNCQUFOLGNBQWtDLDRCQUE0QjtBQUFBLEVBZ0JwRSxZQUNDLFVBQ0EsbUJBQ2dCLFVBQ0EsU0FDbUIsa0JBQ21CLCtCQUNqQixvQkFDdEIsY0FDRCxhQUNjLDJCQUNULGtCQUNILGVBQ21CLGtDQUNSLDBCQUNzQixvQkFDbEIsYUFDOUI7QUFDRCxVQUFNLFVBQVUsbUJBQW1CLGNBQWMsYUFBYSwyQkFBMkIsa0NBQWtDLHdCQUF3QjtBQWZuSTtBQUNBO0FBQ21CO0FBQ21CO0FBQ2pCO0FBUVk7QUFDbEI7QUFwQmhDLFNBQVUsdUJBQXdFO0FBRWxGLFNBQVEscUJBQThCO0FBcUJyQyxTQUFLLHFCQUFxQixDQUFDLENBQUMsUUFBUTtBQUtwQyxTQUFLLHNC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
