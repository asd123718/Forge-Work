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
import { deepClone } from "../../../../base/common/objects.js";
import { isObject, assertReturnsDefined } from "../../../../base/common/types.js";
import { AbstractTextEditor } from "./textEditor.js";
import { TEXT_DIFF_EDITOR_ID, EditorExtensions, isEditorInput, isEditorInputWithOptionsAndGroup, isTextEditorViewState, createTooLargeFileError } from "../../../common/editor.js";
import { applyTextEditorOptions } from "../../../common/editor/editorOptions.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { TextDiffEditorModel } from "../../../common/editor/textDiffEditorModel.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { TextFileOperationResult } from "../../../services/textfile/common/textfiles.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { isEqual } from "../../../../base/common/resources.js";
import { multibyteAwareBtoa } from "../../../../base/common/strings.js";
import { ByteSize, FileOperationResult, IFileService, TooLargeFileOperationError } from "../../../../platform/files/common/files.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { DiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/diffEditorWidget.js";
let TextDiffEditor = class extends AbstractTextEditor {
  constructor(group, telemetryService, instantiationService, storageService, configurationService, editorService, themeService, editorGroupService, fileService, preferencesService, editorResolverService) {
    super(TextDiffEditor.ID, group, telemetryService, instantiationService, storageService, configurationService, themeService, editorService, editorGroupService, fileService);
    this.preferencesService = preferencesService;
    this.editorResolverService = editorResolverService;
    this.diffEditorControl = void 0;
    this.inputLifecycleStopWatch = void 0;
    this._previousViewModel = null;
  }
  get scopedContextKeyService() {
    if (!this.diffEditorControl) {
      return void 0;
    }
    const originalEditor = this.diffEditorControl.getOriginalEditor();
    const modifiedEditor = this.diffEditorControl.getModifiedEditor();
    return (originalEditor.hasTextFocus() ? originalEditor : modifiedEditor).invokeWithinContext((accessor) => accessor.get(IContextKeyService));
  }
  getTitle() {
    if (this.input) {
      return this.input.getName();
    }
    return localize("textDiffEditor", "Text Diff Editor");
  }
  createEditorControl(parent, configuration) {
    this.diffEditorControl = this._register(this.instantiationService.createInstance(DiffEditorWidget, parent, configuration, {}));
  }
  updateEditorControlOptions(options) {
    this.diffEditorControl?.updateOptions(options);
  }
  getMainControl() {
    return this.diffEditorControl?.getModifiedEditor();
  }
  async setInput(input, options, context, token) {
    if (this._previousViewModel) {
      this._previousViewModel.dispose();
      this._previousViewModel = null;
    }
    this.inputLifecycleStopWatch = void 0;
    await super.setInput(input, options, context, token);
    try {
      const resolvedModel = await input.resolve();
      if (token.isCancellationRequested) {
        return void 0;
      }
      if (!(resolvedModel instanceof TextDiffEditorModel)) {
        await this.openAsBinary(input, options);
        return void 0;
      }
      const control = assertReturnsDefined(this.diffEditorControl);
      const resolvedDiffEditorModel = resolvedModel;
      const vm = resolvedDiffEditorModel.textDiffEditorModel ? control.createViewModel(resolvedDiffEditorModel.textDiffEditorModel) : null;
      this._previousViewModel = vm;
      await vm?.waitForDiff();
      control.setModel(vm);
      let hasPreviousViewState = false;
      if (!isTextEditorViewState(options?.viewState)) {
        hasPreviousViewState = this.restoreTextDiffEditorViewState(input, options, context, control);
      }
      let optionsGotApplied = false;
      if (options) {
        optionsGotApplied = applyTextEditorOptions(options, control, ScrollType.Immediate);
      }
      if (!optionsGotApplied && !hasPreviousViewState) {
        control.revealFirstDiff();
      }
      control.updateOptions({
        ...this.getReadonlyConfiguration(resolvedDiffEditorModel.modifiedModel?.isReadonly()),
        originalEditable: !resolvedDiffEditorModel.originalModel?.isReadonly()
      });
      control.handleInitialized();
      this.inputLifecycleStopWatch = new StopWatch(false);
    } catch (error) {
      await this.handleSetInputError(error, input, options);
    }
  }
  async handleSetInputError(error, input, options) {
    if (this.isFileBinaryError(error)) {
      return this.openAsBinary(input, options);
    }
    if (error.fileOperationResult === FileOperationResult.FILE_TOO_LARGE) {
      let message;
      if (error instanceof TooLargeFileOperationError) {
        message = localize("fileTooLargeForHeapErrorWithSize", "At least one file is not displayed in the text compare editor because it is very large ({0}).", ByteSize.formatSize(error.size));
      } else {
        message = localize("fileTooLargeForHeapErrorWithoutSize", "At least one file is not displayed in the text compare editor because it is very large.");
      }
      throw createTooLargeFileError(this.group, input, options, message, this.preferencesService);
    }
    throw error;
  }
  restoreTextDiffEditorViewState(editor, options, context, control) {
    const editorViewState = this.loadEditorViewState(editor, context);
    if (editorViewState) {
      if (options?.selection && editorViewState.modified) {
        editorViewState.modified.cursorState = [];
      }
      control.restoreViewState(editorViewState);
      if (options?.revealIfVisible) {
        control.revealFirstDiff();
      }
      return true;
    }
    return false;
  }
  async openAsBinary(input, options) {
    const original = input.original;
    const modified = input.modified;
    const modifiedResource = modified.resource;
    if (modifiedResource) {
      const fallbackEditorId = this.editorResolverService.getBinaryDiffFallbackEditor(modifiedResource);
      const originalResource = original.resource;
      if (fallbackEditorId && originalResource) {
        const resolved = await this.editorResolverService.resolveEditor({
          original: { resource: originalResource },
          modified: { resource: modifiedResource },
          // Passing an explicit `override` bypasses the automatic `never` filtering and the diff
          // special-casing, so the resolver returns the custom diff editor directly.
          options: { ...options, override: fallbackEditorId }
        }, this.group);
        if (isEditorInputWithOptionsAndGroup(resolved)) {
          this.group.replaceEditors([{
            editor: input,
            replacement: resolved.editor,
            options: {
              ...resolved.options,
              activation: EditorActivation.PRESERVE,
              pinned: this.group.isPinned(input),
              sticky: this.group.isSticky(input)
            }
          }]);
          return;
        }
      }
    }
    const binaryDiffInput = this.instantiationService.createInstance(DiffEditorInput, input.getName(), input.getDescription(), original, modified, true);
    const fileEditorFactory = Registry.as(EditorExtensions.EditorFactory).getFileEditorFactory();
    if (fileEditorFactory.isFileEditor(original)) {
      original.setForceOpenAsBinary();
    }
    if (fileEditorFactory.isFileEditor(modified)) {
      modified.setForceOpenAsBinary();
    }
    this.group.replaceEditors([{
      editor: input,
      replacement: binaryDiffInput,
      options: {
        ...options,
        // Make sure to not steal away the currently active group
        // because we are triggering another openEditor() call
        // and do not control the initial intent that resulted
        // in us now opening as binary.
        activation: EditorActivation.PRESERVE,
        pinned: this.group.isPinned(input),
        sticky: this.group.isSticky(input)
      }
    }]);
  }
  setOptions(options) {
    super.setOptions(options);
    if (options) {
      applyTextEditorOptions(options, assertReturnsDefined(this.diffEditorControl), ScrollType.Smooth);
    }
  }
  shouldHandleConfigurationChangeEvent(e, resource) {
    if (super.shouldHandleConfigurationChangeEvent(e, resource)) {
      return true;
    }
    return e.affectsConfiguration(resource, "diffEditor") || e.affectsConfiguration(resource, "accessibility.verbosity.diffEditor");
  }
  computeConfiguration(configuration) {
    const editorConfiguration = super.computeConfiguration(configuration);
    if (isObject(configuration.diffEditor)) {
      const diffEditorConfiguration = deepClone(configuration.diffEditor);
      diffEditorConfiguration.diffCodeLens = diffEditorConfiguration.codeLens;
      delete diffEditorConfiguration.codeLens;
      diffEditorConfiguration.diffWordWrap = diffEditorConfiguration.wordWrap;
      delete diffEditorConfiguration.wordWrap;
      Object.assign(editorConfiguration, diffEditorConfiguration);
    }
    const verbose = configuration.accessibility?.verbosity?.diffEditor ?? false;
    editorConfiguration.accessibilityVerbose = verbose;
    return editorConfiguration;
  }
  getConfigurationOverrides(configuration) {
    return {
      ...super.getConfigurationOverrides(configuration),
      ...this.getReadonlyConfiguration(this.input?.isReadonly()),
      originalEditable: this.input instanceof DiffEditorInput && !this.input.original.isReadonly(),
      lineDecorationsWidth: "2ch"
    };
  }
  updateReadonly(input) {
    if (input instanceof DiffEditorInput) {
      this.diffEditorControl?.updateOptions({
        ...this.getReadonlyConfiguration(input.isReadonly()),
        originalEditable: !input.original.isReadonly()
      });
    } else {
      super.updateReadonly(input);
    }
  }
  isFileBinaryError(error) {
    if (Array.isArray(error)) {
      const errors = error;
      return errors.some((error2) => this.isFileBinaryError(error2));
    }
    return error.textFileOperationResult === TextFileOperationResult.FILE_IS_BINARY;
  }
  clearInput() {
    if (this._previousViewModel) {
      this._previousViewModel.dispose();
      this._previousViewModel = null;
    }
    super.clearInput();
    const inputLifecycleElapsed = this.inputLifecycleStopWatch?.elapsed();
    this.inputLifecycleStopWatch = void 0;
    if (typeof inputLifecycleElapsed === "number") {
      this.logInputLifecycleTelemetry(inputLifecycleElapsed, this.getControl()?.getModel()?.modified?.getLanguageId());
    }
    this.diffEditorControl?.setModel(null);
  }
  logInputLifecycleTelemetry(duration, languageId) {
    let collapseUnchangedRegions = false;
    if (this.diffEditorControl instanceof DiffEditorWidget) {
      collapseUnchangedRegions = this.diffEditorControl.collapseUnchangedRegions;
    }
    this.telemetryService.publicLog2("diffEditor.editorVisibleTime", {
      editorVisibleTimeMs: duration,
      languageId: languageId ?? "",
      collapseUnchangedRegions
    });
  }
  getControl() {
    return this.diffEditorControl;
  }
  focus() {
    super.focus();
    this.diffEditorControl?.focus();
  }
  hasFocus() {
    return this.diffEditorControl?.hasTextFocus() || super.hasFocus();
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    if (visible) {
      this.diffEditorControl?.onVisible();
    } else {
      this.diffEditorControl?.onHide();
    }
  }
  layout(dimension) {
    this.diffEditorControl?.layout(dimension);
  }
  setBoundarySashes(sashes) {
    this.diffEditorControl?.setBoundarySashes(sashes);
  }
  tracksEditorViewState(input) {
    return input instanceof DiffEditorInput;
  }
  computeEditorViewState(resource) {
    if (!this.diffEditorControl) {
      return void 0;
    }
    const model = this.diffEditorControl.getModel();
    if (!model?.modified || !model.original) {
      return void 0;
    }
    const modelUri = this.toEditorViewStateResource(model);
    if (!modelUri) {
      return void 0;
    }
    if (!isEqual(modelUri, resource)) {
      return void 0;
    }
    return this.diffEditorControl.saveViewState() ?? void 0;
  }
  toEditorViewStateResource(modelOrInput) {
    let original;
    let modified;
    if (modelOrInput instanceof DiffEditorInput) {
      original = modelOrInput.original.resource;
      modified = modelOrInput.modified.resource;
    } else if (!isEditorInput(modelOrInput)) {
      original = modelOrInput.original.uri;
      modified = modelOrInput.modified.uri;
    }
    if (!original || !modified) {
      return void 0;
    }
    return URI.from({ scheme: "diff", path: `${multibyteAwareBtoa(original.toString())}${multibyteAwareBtoa(modified.toString())}` });
  }
};
TextDiffEditor.ID = TEXT_DIFF_EDITOR_ID;
TextDiffEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, ITextResourceConfigurationService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IPreferencesService),
  __decorateParam(10, IEditorResolverService)
], TextDiffEditor);
export {
  TextDiffEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXHRleHREaWZmRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCwgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSURpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yT3B0aW9ucywgSUVkaXRvck9wdGlvbnMgYXMgSUNvZGVFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRleHRFZGl0b3IsIElFZGl0b3JDb25maWd1cmF0aW9uIH0gZnJvbSAnLi90ZXh0RWRpdG9yLmpzJztcbmltcG9ydCB7IFRFWFRfRElGRl9FRElUT1JfSUQsIElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIEVkaXRvckV4dGVuc2lvbnMsIElUZXh0RGlmZkVkaXRvclBhbmUsIElFZGl0b3JPcGVuQ29udGV4dCwgaXNFZGl0b3JJbnB1dCwgaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAsIGlzVGV4dEVkaXRvclZpZXdTdGF0ZSwgY3JlYXRlVG9vTGFyZ2VGaWxlRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBhcHBseVRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRleHREaWZmRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3RleHREaWZmRWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRleHRGaWxlT3BlcmF0aW9uRXJyb3IsIFRleHRGaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlLCBJRGlmZkVkaXRvclZpZXdTdGF0ZSwgSURpZmZFZGl0b3JNb2RlbCwgSURpZmZFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwLCBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aXZhdGlvbiwgSVRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IERpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgbXVsdGlieXRlQXdhcmVCdG9hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElCb3VuZGFyeVNhc2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2RpZmZFZGl0b3JXaWRnZXQuanMnO1xuXG4vKipcbiAqIFRoZSB0ZXh0IGVkaXRvciB0aGF0IGxldmVyYWdlcyB0aGUgZGlmZiB0ZXh0IGVkaXRvciBmb3IgdGhlIGVkaXRpbmcgZXhwZXJpZW5jZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFRleHREaWZmRWRpdG9yIGV4dGVuZHMgQWJzdHJhY3RUZXh0RWRpdG9yPElEaWZmRWRpdG9yVmlld1N0YXRlPiBpbXBsZW1lbnRzIElUZXh0RGlmZkVkaXRvclBhbmUge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBURVhUX0RJRkZfRURJVE9SX0lEO1xuXG5cdHByaXZhdGUgZGlmZkVkaXRvckNvbnRyb2w6IElEaWZmRWRpdG9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgaW5wdXRMaWZlY3ljbGVTdG9wV2F0Y2g6IFN0b3BXYXRjaCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSBnZXQgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuZGlmZkVkaXRvckNvbnRyb2wpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxFZGl0b3IgPSB0aGlzLmRpZmZFZGl0b3JDb250cm9sLmdldE9yaWdpbmFsRWRpdG9yKCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRFZGl0b3IgPSB0aGlzLmRpZmZFZGl0b3JDb250cm9sLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cblx0XHRyZXR1cm4gKG9yaWdpbmFsRWRpdG9yLmhhc1RleHRGb2N1cygpID8gb3JpZ2luYWxFZGl0b3IgOiBtb2RpZmllZEVkaXRvcikuaW52b2tlV2l0aGluQ29udGV4dChhY2Nlc3NvciA9PiBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihUZXh0RGlmZkVkaXRvci5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgZWRpdG9yU2VydmljZSwgZWRpdG9yR3JvdXBTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUaXRsZSgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnB1dC5nZXROYW1lKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvY2FsaXplKCd0ZXh0RGlmZkVkaXRvcicsIFwiVGV4dCBEaWZmIEVkaXRvclwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVFZGl0b3JDb250cm9sKHBhcmVudDogSFRNTEVsZW1lbnQsIGNvbmZpZ3VyYXRpb246IElDb2RlRWRpdG9yT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuZGlmZkVkaXRvckNvbnRyb2wgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpZmZFZGl0b3JXaWRnZXQsIHBhcmVudCwgY29uZmlndXJhdGlvbiwge30pKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVFZGl0b3JDb250cm9sT3B0aW9ucyhvcHRpb25zOiBJQ29kZUVkaXRvck9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLmRpZmZFZGl0b3JDb250cm9sPy51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldE1haW5Db250cm9sKCk6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5kaWZmRWRpdG9yQ29udHJvbD8uZ2V0TW9kaWZpZWRFZGl0b3IoKTtcblx0fVxuXG5cdHByaXZhdGUgX3ByZXZpb3VzVmlld01vZGVsOiBJRGlmZkVkaXRvclZpZXdNb2RlbCB8IG51bGwgPSBudWxsO1xuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBEaWZmRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fcHJldmlvdXNWaWV3TW9kZWwpIHtcblx0XHRcdHRoaXMuX3ByZXZpb3VzVmlld01vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3ByZXZpb3VzVmlld01vZGVsID0gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBDbGVhbnVwIHByZXZpb3VzIHRoaW5ncyBhc3NvY2lhdGVkIHdpdGggdGhlIGlucHV0XG5cdFx0dGhpcy5pbnB1dExpZmVjeWNsZVN0b3BXYXRjaCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIFNldCBpbnB1dCBhbmQgcmVzb2x2ZVxuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRNb2RlbCA9IGF3YWl0IGlucHV0LnJlc29sdmUoKTtcblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIGNhbmNlbGxhdGlvblxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZhbGxiYWNrIHRvIG9wZW4gYXMgYmluYXJ5IGlmIG5vdCB0ZXh0XG5cdFx0XHRpZiAoIShyZXNvbHZlZE1vZGVsIGluc3RhbmNlb2YgVGV4dERpZmZFZGl0b3JNb2RlbCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuQXNCaW5hcnkoaW5wdXQsIG9wdGlvbnMpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZXQgRWRpdG9yIE1vZGVsXG5cdFx0XHRjb25zdCBjb250cm9sID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5kaWZmRWRpdG9yQ29udHJvbCk7XG5cdFx0XHRjb25zdCByZXNvbHZlZERpZmZFZGl0b3JNb2RlbCA9IHJlc29sdmVkTW9kZWw7XG5cblx0XHRcdGNvbnN0IHZtID0gcmVzb2x2ZWREaWZmRWRpdG9yTW9kZWwudGV4dERpZmZFZGl0b3JNb2RlbCA/IGNvbnRyb2wuY3JlYXRlVmlld01vZGVsKHJlc29sdmVkRGlmZkVkaXRvck1vZGVsLnRleHREaWZmRWRpdG9yTW9kZWwpIDogbnVsbDtcblx0XHRcdHRoaXMuX3ByZXZpb3VzVmlld01vZGVsID0gdm07XG5cdFx0XHRhd2FpdCB2bT8ud2FpdEZvckRpZmYoKTtcblx0XHRcdGNvbnRyb2wuc2V0TW9kZWwodm0pO1xuXG5cdFx0XHQvLyBSZXN0b3JlIHZpZXcgc3RhdGUgKHVubGVzcyBwcm92aWRlZCBieSBvcHRpb25zKVxuXHRcdFx0bGV0IGhhc1ByZXZpb3VzVmlld1N0YXRlID0gZmFsc2U7XG5cdFx0XHRpZiAoIWlzVGV4dEVkaXRvclZpZXdTdGF0ZShvcHRpb25zPy52aWV3U3RhdGUpKSB7XG5cdFx0XHRcdGhhc1ByZXZpb3VzVmlld1N0YXRlID0gdGhpcy5yZXN0b3JlVGV4dERpZmZFZGl0b3JWaWV3U3RhdGUoaW5wdXQsIG9wdGlvbnMsIGNvbnRleHQsIGNvbnRyb2wpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcHBseSBvcHRpb25zIHRvIGVkaXRvciBpZiBhbnlcblx0XHRcdGxldCBvcHRpb25zR290QXBwbGllZCA9IGZhbHNlO1xuXHRcdFx0aWYgKG9wdGlvbnMpIHtcblx0XHRcdFx0b3B0aW9uc0dvdEFwcGxpZWQgPSBhcHBseVRleHRFZGl0b3JPcHRpb25zKG9wdGlvbnMsIGNvbnRyb2wsIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFvcHRpb25zR290QXBwbGllZCAmJiAhaGFzUHJldmlvdXNWaWV3U3RhdGUpIHtcblx0XHRcdFx0Y29udHJvbC5yZXZlYWxGaXJzdERpZmYoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2luY2UgdGhlIHJlc29sdmVkIG1vZGVsIHByb3ZpZGVzIGluZm9ybWF0aW9uIGFib3V0IGJlaW5nIHJlYWRvbmx5XG5cdFx0XHQvLyBvciBub3QsIHdlIGFwcGx5IGl0IGhlcmUgdG8gdGhlIGVkaXRvciBldmVuIHRob3VnaCB0aGUgZWRpdG9yIGlucHV0XG5cdFx0XHQvLyB3YXMgYWxyZWFkeSBhc2tlZCBmb3IgYmVpbmcgcmVhZG9ubHkgb3Igbm90LiBUaGUgcmF0aW9uYWxlIGlzIHRoYXRcblx0XHRcdC8vIGEgcmVzb2x2ZWQgbW9kZWwgbWlnaHQgaGF2ZSBtb3JlIHNwZWNpZmljIGluZm9ybWF0aW9uIGFib3V0IGJlaW5nXG5cdFx0XHQvLyByZWFkb25seSBvciBub3QgdGhhdCB0aGUgaW5wdXQgZGlkIG5vdCBoYXZlLlxuXHRcdFx0Y29udHJvbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0Li4udGhpcy5nZXRSZWFkb25seUNvbmZpZ3VyYXRpb24ocmVzb2x2ZWREaWZmRWRpdG9yTW9kZWwubW9kaWZpZWRNb2RlbD8uaXNSZWFkb25seSgpKSxcblx0XHRcdFx0b3JpZ2luYWxFZGl0YWJsZTogIXJlc29sdmVkRGlmZkVkaXRvck1vZGVsLm9yaWdpbmFsTW9kZWw/LmlzUmVhZG9ubHkoKVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnRyb2wuaGFuZGxlSW5pdGlhbGl6ZWQoKTtcblxuXHRcdFx0Ly8gU3RhcnQgdG8gbWVhc3VyZSBpbnB1dCBsaWZlY3ljbGVcblx0XHRcdHRoaXMuaW5wdXRMaWZlY3ljbGVTdG9wV2F0Y2ggPSBuZXcgU3RvcFdhdGNoKGZhbHNlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0YXdhaXQgdGhpcy5oYW5kbGVTZXRJbnB1dEVycm9yKGVycm9yLCBpbnB1dCwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVTZXRJbnB1dEVycm9yKGVycm9yOiBFcnJvciwgaW5wdXQ6IERpZmZFZGl0b3JJbnB1dCwgb3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHQvLyBIYW5kbGUgY2FzZSB3aGVyZSBjb250ZW50IGFwcGVhcnMgdG8gYmUgYmluYXJ5XG5cdFx0aWYgKHRoaXMuaXNGaWxlQmluYXJ5RXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5vcGVuQXNCaW5hcnkoaW5wdXQsIG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBjYXNlIHdoZXJlIGEgZmlsZSBpcyB0b28gbGFyZ2UgdG8gb3BlbiB3aXRob3V0IGNvbmZpcm1hdGlvblxuXHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1RPT19MQVJHRSkge1xuXHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdGlmIChlcnJvciBpbnN0YW5jZW9mIFRvb0xhcmdlRmlsZU9wZXJhdGlvbkVycm9yKSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnZmlsZVRvb0xhcmdlRm9ySGVhcEVycm9yV2l0aFNpemUnLCBcIkF0IGxlYXN0IG9uZSBmaWxlIGlzIG5vdCBkaXNwbGF5ZWQgaW4gdGhlIHRleHQgY29tcGFyZSBlZGl0b3IgYmVjYXVzZSBpdCBpcyB2ZXJ5IGxhcmdlICh7MH0pLlwiLCBCeXRlU2l6ZS5mb3JtYXRTaXplKGVycm9yLnNpemUpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnZmlsZVRvb0xhcmdlRm9ySGVhcEVycm9yV2l0aG91dFNpemUnLCBcIkF0IGxlYXN0IG9uZSBmaWxlIGlzIG5vdCBkaXNwbGF5ZWQgaW4gdGhlIHRleHQgY29tcGFyZSBlZGl0b3IgYmVjYXVzZSBpdCBpcyB2ZXJ5IGxhcmdlLlwiKTtcblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgY3JlYXRlVG9vTGFyZ2VGaWxlRXJyb3IodGhpcy5ncm91cCwgaW5wdXQsIG9wdGlvbnMsIG1lc3NhZ2UsIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgbWFrZSBzdXJlIHRoZSBlcnJvciBidWJibGVzIHVwXG5cdFx0dGhyb3cgZXJyb3I7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVUZXh0RGlmZkVkaXRvclZpZXdTdGF0ZShlZGl0b3I6IERpZmZFZGl0b3JJbnB1dCwgb3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIGNvbnRyb2w6IElEaWZmRWRpdG9yKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZWRpdG9yVmlld1N0YXRlID0gdGhpcy5sb2FkRWRpdG9yVmlld1N0YXRlKGVkaXRvciwgY29udGV4dCk7XG5cdFx0aWYgKGVkaXRvclZpZXdTdGF0ZSkge1xuXHRcdFx0aWYgKG9wdGlvbnM/LnNlbGVjdGlvbiAmJiBlZGl0b3JWaWV3U3RhdGUubW9kaWZpZWQpIHtcblx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlLm1vZGlmaWVkLmN1cnNvclN0YXRlID0gW107IC8vIHByZXZlbnQgZHVwbGljYXRlIHNlbGVjdGlvbnMgdmlhIG9wdGlvbnNcblx0XHRcdH1cblxuXHRcdFx0Y29udHJvbC5yZXN0b3JlVmlld1N0YXRlKGVkaXRvclZpZXdTdGF0ZSk7XG5cblx0XHRcdGlmIChvcHRpb25zPy5yZXZlYWxJZlZpc2libGUpIHtcblx0XHRcdFx0Y29udHJvbC5yZXZlYWxGaXJzdERpZmYoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuQXNCaW5hcnkoaW5wdXQ6IERpZmZFZGl0b3JJbnB1dCwgb3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBpbnB1dC5vcmlnaW5hbDtcblx0XHRjb25zdCBtb2RpZmllZCA9IGlucHV0Lm1vZGlmaWVkO1xuXG5cdFx0Ly8gVGhlIHRleHQgZGlmZiBlZGl0b3IgY2Fubm90IHJlbmRlciBiaW5hcnkgY29udGVudC4gQmVmb3JlIGZhbGxpbmcgYmFjayB0byB0aGUgZ2VuZXJpYyBiaW5hcnlcblx0XHQvLyBcImNhbm5vdCBkaXNwbGF5XCIgcGFuZWwsIGNoZWNrIHdoZXRoZXIgYSBjdXN0b20gZWRpdG9yIGNhbiByZW5kZXIgYSBkaWZmIGZvciB0aGlzIHJlc291cmNlIGFuZFxuXHRcdC8vIHVzZSBpdCBpbnN0ZWFkLiBUaGlzIGludGVudGlvbmFsbHkgaW5jbHVkZXMgZWRpdG9ycyB0aGF0IG9wdGVkIG91dCBvZiBkaWZmcyB2aWEgYSBgbmV2ZXJgXG5cdFx0Ly8gcHJpb3JpdHk6IHRoZXkgb3B0IG91dCBmb3IgdGV4dCBmaWxlcywgYnV0IGEgY3VzdG9tIGRpZmYgZWRpdG9yIGlzIHN0cmljdGx5IGJldHRlciB0aGFuIHRoZVxuXHRcdC8vIGJpbmFyeSBmYWxsYmFjayB3aGVuIHRoZSBjb250ZW50IGlzIGJpbmFyeSAoZS5nLiBhbiBpbWFnZSBvciBoZXggZGlmZiBlZGl0b3IpLlxuXHRcdGNvbnN0IG1vZGlmaWVkUmVzb3VyY2UgPSBtb2RpZmllZC5yZXNvdXJjZTtcblx0XHRpZiAobW9kaWZpZWRSZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgZmFsbGJhY2tFZGl0b3JJZCA9IHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmdldEJpbmFyeURpZmZGYWxsYmFja0VkaXRvcihtb2RpZmllZFJlc291cmNlKTtcblx0XHRcdGNvbnN0IG9yaWdpbmFsUmVzb3VyY2UgPSBvcmlnaW5hbC5yZXNvdXJjZTtcblx0XHRcdGlmIChmYWxsYmFja0VkaXRvcklkICYmIG9yaWdpbmFsUmVzb3VyY2UpIHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogb3JpZ2luYWxSZXNvdXJjZSB9LFxuXHRcdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBtb2RpZmllZFJlc291cmNlIH0sXG5cdFx0XHRcdFx0Ly8gUGFzc2luZyBhbiBleHBsaWNpdCBgb3ZlcnJpZGVgIGJ5cGFzc2VzIHRoZSBhdXRvbWF0aWMgYG5ldmVyYCBmaWx0ZXJpbmcgYW5kIHRoZSBkaWZmXG5cdFx0XHRcdFx0Ly8gc3BlY2lhbC1jYXNpbmcsIHNvIHRoZSByZXNvbHZlciByZXR1cm5zIHRoZSBjdXN0b20gZGlmZiBlZGl0b3IgZGlyZWN0bHkuXG5cdFx0XHRcdFx0b3B0aW9uczogeyAuLi5vcHRpb25zLCBvdmVycmlkZTogZmFsbGJhY2tFZGl0b3JJZCB9XG5cdFx0XHRcdH0sIHRoaXMuZ3JvdXApO1xuXHRcdFx0XHRpZiAoaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAocmVzb2x2ZWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5ncm91cC5yZXBsYWNlRWRpdG9ycyhbe1xuXHRcdFx0XHRcdFx0ZWRpdG9yOiBpbnB1dCxcblx0XHRcdFx0XHRcdHJlcGxhY2VtZW50OiByZXNvbHZlZC5lZGl0b3IsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdC4uLnJlc29sdmVkLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRcdGFjdGl2YXRpb246IEVkaXRvckFjdGl2YXRpb24uUFJFU0VSVkUsXG5cdFx0XHRcdFx0XHRcdHBpbm5lZDogdGhpcy5ncm91cC5pc1Bpbm5lZChpbnB1dCksXG5cdFx0XHRcdFx0XHRcdHN0aWNreTogdGhpcy5ncm91cC5pc1N0aWNreShpbnB1dClcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmluYXJ5RGlmZklucHV0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9ySW5wdXQsIGlucHV0LmdldE5hbWUoKSwgaW5wdXQuZ2V0RGVzY3JpcHRpb24oKSwgb3JpZ2luYWwsIG1vZGlmaWVkLCB0cnVlKTtcblxuXHRcdC8vIEZvcndhcmQgYmluYXJ5IGZsYWcgdG8gaW5wdXQgaWYgc3VwcG9ydGVkXG5cdFx0Y29uc3QgZmlsZUVkaXRvckZhY3RvcnkgPSBSZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLmdldEZpbGVFZGl0b3JGYWN0b3J5KCk7XG5cdFx0aWYgKGZpbGVFZGl0b3JGYWN0b3J5LmlzRmlsZUVkaXRvcihvcmlnaW5hbCkpIHtcblx0XHRcdG9yaWdpbmFsLnNldEZvcmNlT3BlbkFzQmluYXJ5KCk7XG5cdFx0fVxuXG5cdFx0aWYgKGZpbGVFZGl0b3JGYWN0b3J5LmlzRmlsZUVkaXRvcihtb2RpZmllZCkpIHtcblx0XHRcdG1vZGlmaWVkLnNldEZvcmNlT3BlbkFzQmluYXJ5KCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVwbGFjZSB0aGlzIGVkaXRvciB3aXRoIHRoZSBiaW5hcnkgb25lXG5cdFx0dGhpcy5ncm91cC5yZXBsYWNlRWRpdG9ycyhbe1xuXHRcdFx0ZWRpdG9yOiBpbnB1dCxcblx0XHRcdHJlcGxhY2VtZW50OiBiaW5hcnlEaWZmSW5wdXQsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdC8vIE1ha2Ugc3VyZSB0byBub3Qgc3RlYWwgYXdheSB0aGUgY3VycmVudGx5IGFjdGl2ZSBncm91cFxuXHRcdFx0XHQvLyBiZWNhdXNlIHdlIGFyZSB0cmlnZ2VyaW5nIGFub3RoZXIgb3BlbkVkaXRvcigpIGNhbGxcblx0XHRcdFx0Ly8gYW5kIGRvIG5vdCBjb250cm9sIHRoZSBpbml0aWFsIGludGVudCB0aGF0IHJlc3VsdGVkXG5cdFx0XHRcdC8vIGluIHVzIG5vdyBvcGVuaW5nIGFzIGJpbmFyeS5cblx0XHRcdFx0YWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5QUkVTRVJWRSxcblx0XHRcdFx0cGlubmVkOiB0aGlzLmdyb3VwLmlzUGlubmVkKGlucHV0KSxcblx0XHRcdFx0c3RpY2t5OiB0aGlzLmdyb3VwLmlzU3RpY2t5KGlucHV0KVxuXHRcdFx0fVxuXHRcdH1dKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldE9wdGlvbnMob3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0T3B0aW9ucyhvcHRpb25zKTtcblxuXHRcdGlmIChvcHRpb25zKSB7XG5cdFx0XHRhcHBseVRleHRFZGl0b3JPcHRpb25zKG9wdGlvbnMsIGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZGlmZkVkaXRvckNvbnRyb2wpLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNob3VsZEhhbmRsZUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudChlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCByZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0aWYgKHN1cGVyLnNob3VsZEhhbmRsZUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudChlLCByZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKHJlc291cmNlLCAnZGlmZkVkaXRvcicpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24ocmVzb3VyY2UsICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5kaWZmRWRpdG9yJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY29tcHV0ZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbjogSUVkaXRvckNvbmZpZ3VyYXRpb24pOiBJQ29kZUVkaXRvck9wdGlvbnMge1xuXHRcdGNvbnN0IGVkaXRvckNvbmZpZ3VyYXRpb24gPSBzdXBlci5jb21wdXRlQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uKTtcblxuXHRcdC8vIEhhbmRsZSBkaWZmIGVkaXRvciBzcGVjaWFsbHkgYnkgbWVyZ2luZyBpbiBkaWZmRWRpdG9yIGNvbmZpZ3VyYXRpb25cblx0XHRpZiAoaXNPYmplY3QoY29uZmlndXJhdGlvbi5kaWZmRWRpdG9yKSkge1xuXHRcdFx0Y29uc3QgZGlmZkVkaXRvckNvbmZpZ3VyYXRpb246IElEaWZmRWRpdG9yT3B0aW9ucyA9IGRlZXBDbG9uZShjb25maWd1cmF0aW9uLmRpZmZFZGl0b3IpO1xuXG5cdFx0XHQvLyBVc2VyIHNldHRpbmdzIGRlZmluZXMgYGRpZmZFZGl0b3IuY29kZUxlbnNgLCBidXQgaGVyZSB3ZSByZW5hbWUgdGhhdCB0byBgZGlmZkVkaXRvci5kaWZmQ29kZUxlbnNgIHRvIGF2b2lkIGNvbGxpc2lvbnMgd2l0aCBgZWRpdG9yLmNvZGVMZW5zYC5cblx0XHRcdGRpZmZFZGl0b3JDb25maWd1cmF0aW9uLmRpZmZDb2RlTGVucyA9IGRpZmZFZGl0b3JDb25maWd1cmF0aW9uLmNvZGVMZW5zO1xuXHRcdFx0ZGVsZXRlIGRpZmZFZGl0b3JDb25maWd1cmF0aW9uLmNvZGVMZW5zO1xuXG5cdFx0XHQvLyBVc2VyIHNldHRpbmdzIGRlZmluZXMgYGRpZmZFZGl0b3Iud29yZFdyYXBgLCBidXQgaGVyZSB3ZSByZW5hbWUgdGhhdCB0byBgZGlmZkVkaXRvci5kaWZmV29yZFdyYXBgIHRvIGF2b2lkIGNvbGxpc2lvbnMgd2l0aCBgZWRpdG9yLndvcmRXcmFwYC5cblx0XHRcdGRpZmZFZGl0b3JDb25maWd1cmF0aW9uLmRpZmZXb3JkV3JhcCA9IDwnb2ZmJyB8ICdvbicgfCAnaW5oZXJpdCcgfCB1bmRlZmluZWQ+ZGlmZkVkaXRvckNvbmZpZ3VyYXRpb24ud29yZFdyYXA7XG5cdFx0XHRkZWxldGUgZGlmZkVkaXRvckNvbmZpZ3VyYXRpb24ud29yZFdyYXA7XG5cblx0XHRcdE9iamVjdC5hc3NpZ24oZWRpdG9yQ29uZmlndXJhdGlvbiwgZGlmZkVkaXRvckNvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZlcmJvc2UgPSBjb25maWd1cmF0aW9uLmFjY2Vzc2liaWxpdHk/LnZlcmJvc2l0eT8uZGlmZkVkaXRvciA/PyBmYWxzZTtcblx0XHQoZWRpdG9yQ29uZmlndXJhdGlvbiBhcyBJRGlmZkVkaXRvck9wdGlvbnMpLmFjY2Vzc2liaWxpdHlWZXJib3NlID0gdmVyYm9zZTtcblxuXHRcdHJldHVybiBlZGl0b3JDb25maWd1cmF0aW9uO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldENvbmZpZ3VyYXRpb25PdmVycmlkZXMoY29uZmlndXJhdGlvbjogSUVkaXRvckNvbmZpZ3VyYXRpb24pOiBJRGlmZkVkaXRvck9wdGlvbnMge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5zdXBlci5nZXRDb25maWd1cmF0aW9uT3ZlcnJpZGVzKGNvbmZpZ3VyYXRpb24pLFxuXHRcdFx0Li4udGhpcy5nZXRSZWFkb25seUNvbmZpZ3VyYXRpb24odGhpcy5pbnB1dD8uaXNSZWFkb25seSgpKSxcblx0XHRcdG9yaWdpbmFsRWRpdGFibGU6IHRoaXMuaW5wdXQgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQgJiYgIXRoaXMuaW5wdXQub3JpZ2luYWwuaXNSZWFkb25seSgpLFxuXHRcdFx0bGluZURlY29yYXRpb25zV2lkdGg6ICcyY2gnXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVSZWFkb25seShpbnB1dDogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBEaWZmRWRpdG9ySW5wdXQpIHtcblx0XHRcdHRoaXMuZGlmZkVkaXRvckNvbnRyb2w/LnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHQuLi50aGlzLmdldFJlYWRvbmx5Q29uZmlndXJhdGlvbihpbnB1dC5pc1JlYWRvbmx5KCkpLFxuXHRcdFx0XHRvcmlnaW5hbEVkaXRhYmxlOiAhaW5wdXQub3JpZ2luYWwuaXNSZWFkb25seSgpLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN1cGVyLnVwZGF0ZVJlYWRvbmx5KGlucHV0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzRmlsZUJpbmFyeUVycm9yKGVycm9yOiBFcnJvcltdKTogYm9vbGVhbjtcblx0cHJpdmF0ZSBpc0ZpbGVCaW5hcnlFcnJvcihlcnJvcjogRXJyb3IpOiBib29sZWFuO1xuXHRwcml2YXRlIGlzRmlsZUJpbmFyeUVycm9yKGVycm9yOiBFcnJvciB8IEVycm9yW10pOiBib29sZWFuIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShlcnJvcikpIHtcblx0XHRcdGNvbnN0IGVycm9ycyA9IGVycm9yO1xuXG5cdFx0XHRyZXR1cm4gZXJyb3JzLnNvbWUoZXJyb3IgPT4gdGhpcy5pc0ZpbGVCaW5hcnlFcnJvcihlcnJvcikpO1xuXHRcdH1cblxuXHRcdHJldHVybiAoPFRleHRGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLnRleHRGaWxlT3BlcmF0aW9uUmVzdWx0ID09PSBUZXh0RmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX0lTX0JJTkFSWTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ByZXZpb3VzVmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLl9wcmV2aW91c1ZpZXdNb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9wcmV2aW91c1ZpZXdNb2RlbCA9IG51bGw7XG5cdFx0fVxuXG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXG5cdFx0Ly8gTG9nIGlucHV0IGxpZmVjeWNsZSB0ZWxlbWV0cnlcblx0XHRjb25zdCBpbnB1dExpZmVjeWNsZUVsYXBzZWQgPSB0aGlzLmlucHV0TGlmZWN5Y2xlU3RvcFdhdGNoPy5lbGFwc2VkKCk7XG5cdFx0dGhpcy5pbnB1dExpZmVjeWNsZVN0b3BXYXRjaCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGlucHV0TGlmZWN5Y2xlRWxhcHNlZCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMubG9nSW5wdXRMaWZlY3ljbGVUZWxlbWV0cnkoaW5wdXRMaWZlY3ljbGVFbGFwc2VkLCB0aGlzLmdldENvbnRyb2woKT8uZ2V0TW9kZWwoKT8ubW9kaWZpZWQ/LmdldExhbmd1YWdlSWQoKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgTW9kZWxcblx0XHR0aGlzLmRpZmZFZGl0b3JDb250cm9sPy5zZXRNb2RlbChudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgbG9nSW5wdXRMaWZlY3ljbGVUZWxlbWV0cnkoZHVyYXRpb246IG51bWJlciwgbGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0bGV0IGNvbGxhcHNlVW5jaGFuZ2VkUmVnaW9ucyA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLmRpZmZFZGl0b3JDb250cm9sIGluc3RhbmNlb2YgRGlmZkVkaXRvcldpZGdldCkge1xuXHRcdFx0Y29sbGFwc2VVbmNoYW5nZWRSZWdpb25zID0gdGhpcy5kaWZmRWRpdG9yQ29udHJvbC5jb2xsYXBzZVVuY2hhbmdlZFJlZ2lvbnM7XG5cdFx0fVxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHtcblx0XHRcdGVkaXRvclZpc2libGVUaW1lTXM6IG51bWJlcjtcblx0XHRcdGxhbmd1YWdlSWQ6IHN0cmluZztcblx0XHRcdGNvbGxhcHNlVW5jaGFuZ2VkUmVnaW9uczogYm9vbGVhbjtcblx0XHR9LCB7XG5cdFx0XHRvd25lcjogJ2hlZGlldCc7XG5cdFx0XHRlZGl0b3JWaXNpYmxlVGltZU1zOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSW5kaWNhdGVzIHRoZSB0aW1lIHRoZSBkaWZmIGVkaXRvciB3YXMgdmlzaWJsZSB0byB0aGUgdXNlcicgfTtcblx0XHRcdGxhbmd1YWdlSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJbmRpY2F0ZXMgZm9yIHdoaWNoIGxhbmd1YWdlIHRoZSBkaWZmIGVkaXRvciB3YXMgc2hvd24nIH07XG5cdFx0XHRjb2xsYXBzZVVuY2hhbmdlZFJlZ2lvbnM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJbmRpY2F0ZXMgd2hldGhlciB1bmNoYW5nZWQgcmVnaW9ucyB3ZXJlIGNvbGxhcHNlZCcgfTtcblx0XHRcdGNvbW1lbnQ6ICdUaGlzIGV2ZW50IGdpdmVzIGluc2lnaHQgYWJvdXQgaG93IGxvbmcgdGhlIGRpZmYgZWRpdG9yIHdhcyB2aXNpYmxlIHRvIHRoZSB1c2VyLic7XG5cdFx0fT4oJ2RpZmZFZGl0b3IuZWRpdG9yVmlzaWJsZVRpbWUnLCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlVGltZU1zOiBkdXJhdGlvbixcblx0XHRcdGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWQgPz8gJycsXG5cdFx0XHRjb2xsYXBzZVVuY2hhbmdlZFJlZ2lvbnMsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDb250cm9sKCk6IElEaWZmRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5kaWZmRWRpdG9yQ29udHJvbDtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHR0aGlzLmRpZmZFZGl0b3JDb250cm9sPy5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGlmZkVkaXRvckNvbnRyb2w/Lmhhc1RleHRGb2N1cygpIHx8IHN1cGVyLmhhc0ZvY3VzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlKTtcblxuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLmRpZmZFZGl0b3JDb250cm9sPy5vblZpc2libGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaWZmRWRpdG9yQ29udHJvbD8ub25IaWRlKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaWZmRWRpdG9yQ29udHJvbD8ubGF5b3V0KGRpbWVuc2lvbik7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXM6IElCb3VuZGFyeVNhc2hlcykge1xuXHRcdHRoaXMuZGlmZkVkaXRvckNvbnRyb2w/LnNldEJvdW5kYXJ5U2FzaGVzKHNhc2hlcyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdHJhY2tzRWRpdG9yVmlld1N0YXRlKGlucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpbnB1dCBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjb21wdXRlRWRpdG9yVmlld1N0YXRlKHJlc291cmNlOiBVUkkpOiBJRGlmZkVkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmRpZmZFZGl0b3JDb250cm9sKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5kaWZmRWRpdG9yQ29udHJvbC5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWw/Lm1vZGlmaWVkIHx8ICFtb2RlbC5vcmlnaW5hbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gdmlldyBzdGF0ZSBhbHdheXMgbmVlZHMgYSBtb2RlbFxuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsVXJpID0gdGhpcy50b0VkaXRvclZpZXdTdGF0ZVJlc291cmNlKG1vZGVsKTtcblx0XHRpZiAoIW1vZGVsVXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBtb2RlbCBVUkkgaXMgbmVlZGVkIHRvIG1ha2Ugc3VyZSB3ZSBzYXZlIHRoZSB2aWV3IHN0YXRlIGNvcnJlY3RseVxuXHRcdH1cblxuXHRcdGlmICghaXNFcXVhbChtb2RlbFVyaSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBwcmV2ZW50IHNhdmluZyB2aWV3IHN0YXRlIGZvciBhIG1vZGVsIHRoYXQgaXMgbm90IHRoZSBleHBlY3RlZCBvbmVcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kaWZmRWRpdG9yQ29udHJvbC5zYXZlVmlld1N0YXRlKCkgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHRvRWRpdG9yVmlld1N0YXRlUmVzb3VyY2UobW9kZWxPcklucHV0OiBJRGlmZkVkaXRvck1vZGVsIHwgRWRpdG9ySW5wdXQpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGxldCBvcmlnaW5hbDogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBtb2RpZmllZDogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKG1vZGVsT3JJbnB1dCBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dCkge1xuXHRcdFx0b3JpZ2luYWwgPSBtb2RlbE9ySW5wdXQub3JpZ2luYWwucmVzb3VyY2U7XG5cdFx0XHRtb2RpZmllZCA9IG1vZGVsT3JJbnB1dC5tb2RpZmllZC5yZXNvdXJjZTtcblx0XHR9IGVsc2UgaWYgKCFpc0VkaXRvcklucHV0KG1vZGVsT3JJbnB1dCkpIHtcblx0XHRcdG9yaWdpbmFsID0gbW9kZWxPcklucHV0Lm9yaWdpbmFsLnVyaTtcblx0XHRcdG1vZGlmaWVkID0gbW9kZWxPcklucHV0Lm1vZGlmaWVkLnVyaTtcblx0XHR9XG5cblx0XHRpZiAoIW9yaWdpbmFsIHx8ICFtb2RpZmllZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBjcmVhdGUgYSBVUkkgdGhhdCBpcyB0aGUgQmFzZTY0IGNvbmNhdGVuYXRpb24gb2Ygb3JpZ2luYWwgKyBtb2RpZmllZCByZXNvdXJjZVxuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ2RpZmYnLCBwYXRoOiBgJHttdWx0aWJ5dGVBd2FyZUJ0b2Eob3JpZ2luYWwudG9TdHJpbmcoKSl9JHttdWx0aWJ5dGVBd2FyZUJ0b2EobW9kaWZpZWQudG9TdHJpbmcoKSl9YCB9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFVBQVUsNEJBQTRCO0FBRy9DLFNBQVMsMEJBQWdEO0FBQ3pELFNBQVMscUJBQTZDLGtCQUEyRCxlQUFlLGtDQUFrQyx1QkFBdUIsK0JBQStCO0FBRXhOLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQWdELHlDQUF5QztBQUN6RixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFpQywrQkFBK0I7QUFDaEUsU0FBUyxrQkFBZ0Y7QUFDekYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQXVCLDRCQUE0QjtBQUNuRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLHdCQUE0QztBQUNyRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFFeEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxVQUE4QixxQkFBcUIsY0FBYyxrQ0FBa0M7QUFFNUcsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFLMUIsSUFBTSxpQkFBTixjQUE2QixtQkFBd0U7QUFBQSxFQWtCM0csWUFDQyxPQUNtQixrQkFDSSxzQkFDTixnQkFDa0Is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
