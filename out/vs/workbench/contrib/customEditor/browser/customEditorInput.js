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
import { getWindow } from "../../../../base/browser/dom.js";
import { toAction } from "../../../../base/common/actions.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename } from "../../../../base/common/path.js";
import { dirname, isEqual } from "../../../../base/common/resources.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { EditorInputCapabilities, Verbosity, createEditorOpenError } from "../../../common/editor.js";
import { ICustomEditorLabelService } from "../../../services/editor/common/customEditorLabelService.js";
import { ICustomEditorService } from "../common/customEditor.js";
import { IWebviewService } from "../../webview/browser/webview.js";
import { IWebviewWorkbenchService, LazilyResolvedWebviewEditorInput } from "../../webviewPanel/browser/webviewWorkbenchService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { IUntitledTextEditorService } from "../../../services/untitled/common/untitledTextEditorService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
let CustomEditorInput = class extends LazilyResolvedWebviewEditorInput {
  constructor(init, webview, options, themeService, webviewWorkbenchService, instantiationService, labelService, customEditorService, fileDialogService, undoRedoService, fileService, filesConfigurationService, editorGroupsService, layoutService, customEditorLabelService) {
    super({ providedId: init.viewType, viewType: init.viewType, name: init.preferredName ?? "", iconPath: init.iconPath }, webview, themeService, webviewWorkbenchService);
    this.instantiationService = instantiationService;
    this.labelService = labelService;
    this.customEditorService = customEditorService;
    this.fileDialogService = fileDialogService;
    this.undoRedoService = undoRedoService;
    this.fileService = fileService;
    this.filesConfigurationService = filesConfigurationService;
    this.editorGroupsService = editorGroupsService;
    this.layoutService = layoutService;
    this.customEditorLabelService = customEditorLabelService;
    this._editorName = void 0;
    this._shortDescription = void 0;
    this._mediumDescription = void 0;
    this._longDescription = void 0;
    this._shortTitle = void 0;
    this._mediumTitle = void 0;
    this._longTitle = void 0;
    this._editorResource = init.resource;
    this.oldResource = options.oldResource;
    this._defaultDirtyState = options.startsDirty;
    this._backupId = options.backupId;
    this._untitledDocumentData = options.untitledDocumentData;
    this.registerListeners();
  }
  static create(instantiationService, init, group, options) {
    return instantiationService.invokeFunction((accessor) => {
      const untitledTextEditorService = accessor.get(IUntitledTextEditorService);
      const untitledTextModel = untitledTextEditorService.get(init.resource);
      const untitledString = untitledTextModel?.textEditorModel?.getValue();
      const untitledDocumentData = untitledString ? VSBuffer.fromString(untitledString) : void 0;
      const webview = accessor.get(IWebviewService).createWebviewOverlay({
        providedViewType: init.viewType,
        title: init.webviewTitle,
        options: { customClasses: options?.customClasses },
        contentOptions: {},
        extension: void 0
      });
      const input = instantiationService.createInstance(CustomEditorInput, init, webview, { untitledDocumentData, oldResource: options?.oldResource });
      if (typeof group !== "undefined") {
        input.updateGroup(group);
      }
      return input;
    });
  }
  get resource() {
    return this._editorResource;
  }
  registerListeners() {
    this._register(this.labelService.onDidChangeFormatters((e) => this.onLabelEvent(e.scheme)));
    this._register(this.fileService.onDidChangeFileSystemProviderRegistrations((e) => this.onLabelEvent(e.scheme)));
    this._register(this.fileService.onDidChangeFileSystemProviderCapabilities((e) => this.onLabelEvent(e.scheme)));
    this._register(this.customEditorLabelService.onDidChange(() => this.updateLabel()));
    this._register(this.filesConfigurationService.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
  }
  onLabelEvent(scheme) {
    if (scheme === this.resource.scheme) {
      this.updateLabel();
    }
  }
  updateLabel() {
    this._editorName = void 0;
    this._shortDescription = void 0;
    this._mediumDescription = void 0;
    this._longDescription = void 0;
    this._shortTitle = void 0;
    this._mediumTitle = void 0;
    this._longTitle = void 0;
    this._onDidChangeLabel.fire();
  }
  get typeId() {
    return CustomEditorInput.typeId;
  }
  get editorId() {
    return this.viewType;
  }
  get capabilities() {
    let capabilities = EditorInputCapabilities.None;
    capabilities |= EditorInputCapabilities.CanDropIntoEditor;
    if (!this.customEditorService.getCustomEditorCapabilities(this.viewType)?.supportsMultipleEditorsPerDocument) {
      capabilities |= EditorInputCapabilities.Singleton;
    }
    if (this.isReadonly()) {
      capabilities |= EditorInputCapabilities.Readonly;
    }
    if (this.resource.scheme === Schemas.untitled) {
      capabilities |= EditorInputCapabilities.Untitled;
    }
    return capabilities;
  }
  getName() {
    const customTitle = this.getWebviewTitle();
    if (customTitle) {
      return customTitle;
    }
    this._editorName ??= this.customEditorLabelService.getName(this.resource) ?? basename(this.labelService.getUriLabel(this.resource));
    return this._editorName;
  }
  getDescription(verbosity = Verbosity.MEDIUM) {
    switch (verbosity) {
      case Verbosity.SHORT:
        return this.shortDescription;
      case Verbosity.LONG:
        return this.longDescription;
      case Verbosity.MEDIUM:
      default:
        return this.mediumDescription;
    }
  }
  get shortDescription() {
    this._shortDescription ??= this.labelService.getUriBasenameLabel(dirname(this.resource));
    return this._shortDescription;
  }
  get mediumDescription() {
    this._mediumDescription ??= this.labelService.getUriLabel(dirname(this.resource), { relative: true });
    return this._mediumDescription;
  }
  get longDescription() {
    this._longDescription ??= this.labelService.getUriLabel(dirname(this.resource));
    return this._longDescription;
  }
  get shortTitle() {
    this._shortTitle ??= this.getName();
    return this._shortTitle;
  }
  get mediumTitle() {
    this._mediumTitle ??= this.labelService.getUriLabel(this.resource, { relative: true });
    return this._mediumTitle;
  }
  get longTitle() {
    this._longTitle ??= this.labelService.getUriLabel(this.resource);
    return this._longTitle;
  }
  getTitle(verbosity) {
    const customTitle = this.getWebviewTitle();
    if (customTitle) {
      return customTitle;
    }
    switch (verbosity) {
      case Verbosity.SHORT:
        return this.shortTitle;
      case Verbosity.LONG:
        return this.longTitle;
      default:
      case Verbosity.MEDIUM:
        return this.mediumTitle;
    }
  }
  matches(other) {
    if (super.matches(other)) {
      return true;
    }
    return this === other || other instanceof CustomEditorInput && this.viewType === other.viewType && isEqual(this.resource, other.resource);
  }
  copy() {
    return CustomEditorInput.create(
      this.instantiationService,
      { resource: this.resource, viewType: this.viewType, webviewTitle: this.getWebviewTitle(), preferredName: void 0, iconPath: this.iconPath },
      this.group,
      this.webview.options
    );
  }
  isReadonly() {
    if (!this._modelRef) {
      return this.filesConfigurationService.isReadonly(this.resource);
    }
    return this._modelRef.object.isReadonly();
  }
  isDirty() {
    if (!this._modelRef) {
      return !!this._defaultDirtyState;
    }
    return this._modelRef.object.isDirty();
  }
  async save(groupId, options) {
    if (!this._modelRef) {
      return void 0;
    }
    const target = await this._modelRef.object.saveCustomEditor(options);
    if (!target) {
      return void 0;
    }
    if (!isEqual(target, this.resource)) {
      return { resource: target };
    }
    return this;
  }
  async saveAs(groupId, options) {
    if (!this._modelRef) {
      return void 0;
    }
    const dialogPath = this._editorResource;
    const target = await this.fileDialogService.pickFileToSave(dialogPath, options?.availableFileSystems);
    if (!target) {
      return void 0;
    }
    if (!await this._modelRef.object.saveCustomEditorAs(this._editorResource, target, options)) {
      return void 0;
    }
    return (await this.rename(groupId, target))?.editor;
  }
  async revert(group, options) {
    if (this._modelRef) {
      return this._modelRef.object.revert(options);
    }
    this._defaultDirtyState = false;
    this._onDidChangeDirty.fire();
  }
  async resolve() {
    await super.resolve();
    if (this.isDisposed()) {
      return null;
    }
    if (!this._modelRef) {
      const oldCapabilities = this.capabilities;
      this._modelRef = this._register(assertReturnsDefined(await this.customEditorService.models.tryRetain(this.resource, this.viewType)));
      this._register(this._modelRef.object.onDidChangeDirty(() => this._onDidChangeDirty.fire()));
      this._register(this._modelRef.object.onDidChangeReadonly(() => this._onDidChangeCapabilities.fire()));
      if (this._untitledDocumentData) {
        this._defaultDirtyState = true;
      }
      if (this.isDirty()) {
        this._onDidChangeDirty.fire();
      }
      if (this.capabilities !== oldCapabilities) {
        this._onDidChangeCapabilities.fire();
      }
    }
    return null;
  }
  async rename(group, newResource) {
    return { editor: { resource: newResource } };
  }
  undo() {
    assertReturnsDefined(this._modelRef);
    return this.undoRedoService.undo(this.resource);
  }
  redo() {
    assertReturnsDefined(this._modelRef);
    return this.undoRedoService.redo(this.resource);
  }
  onMove(handler) {
    this._moveHandler = handler;
  }
  transfer(other) {
    if (!super.transfer(other)) {
      return;
    }
    other._moveHandler = this._moveHandler;
    this._moveHandler = void 0;
    return other;
  }
  get backupId() {
    if (this._modelRef) {
      return this._modelRef.object.backupId;
    }
    return this._backupId;
  }
  get untitledDocumentData() {
    return this._untitledDocumentData;
  }
  toUntyped() {
    return {
      resource: this.resource,
      options: {
        override: this.viewType
      }
    };
  }
  claim(claimant, targetWindow, scopedContextKeyService) {
    if (this.doCanMove(targetWindow.vscodeWindowId) !== true) {
      throw createEditorOpenError(localize("editorUnsupportedInWindow", "Unable to open the editor in this window, it contains modifications that can only be saved in the original window."), [
        toAction({
          id: "openInOriginalWindow",
          label: localize("reopenInOriginalWindow", "Open in Original Window"),
          run: async () => {
            const originalPart = this.editorGroupsService.getPart(this.layoutService.getContainer(getWindow(this.webview.container).window));
            const currentPart = this.editorGroupsService.getPart(this.layoutService.getContainer(targetWindow.window));
            currentPart.activeGroup.moveEditor(this, originalPart.activeGroup);
          }
        })
      ], { forceMessage: true });
    }
    return super.claim(claimant, targetWindow, scopedContextKeyService);
  }
  canMove(sourceGroup, targetGroup) {
    const resolvedTargetGroup = this.editorGroupsService.getGroup(targetGroup);
    if (resolvedTargetGroup) {
      const canMove = this.doCanMove(resolvedTargetGroup.windowId);
      if (typeof canMove === "string") {
        return canMove;
      }
    }
    return super.canMove(sourceGroup, targetGroup);
  }
  doCanMove(targetWindowId) {
    if (this.isModified() && this._modelRef?.object.canHotExit === false) {
      const sourceWindowId = getWindow(this.webview.container).vscodeWindowId;
      if (sourceWindowId !== targetWindowId) {
        return localize("editorCannotMove", "Unable to move '{0}': The editor contains changes that can only be saved in its current window.", this.getName());
      }
    }
    return true;
  }
};
CustomEditorInput.typeId = "workbench.editors.webviewEditor";
CustomEditorInput = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IWebviewWorkbenchService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, ICustomEditorService),
  __decorateParam(8, IFileDialogService),
  __decorateParam(9, IUndoRedoService),
  __decorateParam(10, IFileService),
  __decorateParam(11, IFilesConfigurationService),
  __decorateParam(12, IEditorGroupsService),
  __decorateParam(13, IWorkbenchLayoutService),
  __decorateParam(14, ICustomEditorLabelService)
], CustomEditorInput);
export {
  CustomEditorInput
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGN1c3RvbUVkaXRvclxcYnJvd3NlclxcY3VzdG9tRWRpdG9ySW5wdXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgR3JvdXBJZGVudGlmaWVyLCBJTW92ZVJlc3VsdCwgSVJldmVydE9wdGlvbnMsIElTYXZlT3B0aW9ucywgSVVudHlwZWRFZGl0b3JJbnB1dCwgVmVyYm9zaXR5LCBjcmVhdGVFZGl0b3JPcGVuRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9jdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbUVkaXRvck1vZGVsLCBJQ3VzdG9tRWRpdG9yU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jdXN0b21FZGl0b3IuanMnO1xuaW1wb3J0IHsgSU92ZXJsYXlXZWJ2aWV3LCBJV2Vidmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2UsIExhemlseVJlc29sdmVkV2Vidmlld0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vd2Vidmlld1BhbmVsL2Jyb3dzZXIvd2Vidmlld1dvcmtiZW5jaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgV2Vidmlld0ljb25QYXRoIH0gZnJvbSAnLi4vLi4vd2Vidmlld1BhbmVsL2Jyb3dzZXIvd2Vidmlld0VkaXRvcklucHV0LmpzJztcblxuaW50ZXJmYWNlIEN1c3RvbUVkaXRvcklucHV0SW5pdEluZm8ge1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSB2aWV3VHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSB3ZWJ2aWV3VGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcHJlZmVycmVkTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpY29uUGF0aDogV2Vidmlld0ljb25QYXRoIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgQ3VzdG9tRWRpdG9ySW5wdXQgZXh0ZW5kcyBMYXppbHlSZXNvbHZlZFdlYnZpZXdFZGl0b3JJbnB1dCB7XG5cblx0c3RhdGljIGNyZWF0ZShcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdGluaXQ6IEN1c3RvbUVkaXRvcklucHV0SW5pdEluZm8sXG5cdFx0Z3JvdXA6IEdyb3VwSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zPzogeyByZWFkb25seSBjdXN0b21DbGFzc2VzPzogc3RyaW5nOyByZWFkb25seSBvbGRSZXNvdXJjZT86IFVSSSB9LFxuXHQpOiBFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdC8vIElmIGl0J3MgYW4gdW50aXRsZWQgZmlsZSB3ZSBtdXN0IHBvcHVsYXRlIHRoZSB1bnRpdGxlZERvY3VtZW50RGF0YVxuXHRcdFx0Y29uc3QgdW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSk7XG5cdFx0XHRjb25zdCB1bnRpdGxlZFRleHRNb2RlbCA9IHVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuZ2V0KGluaXQucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgdW50aXRsZWRTdHJpbmcgPSB1bnRpdGxlZFRleHRNb2RlbD8udGV4dEVkaXRvck1vZGVsPy5nZXRWYWx1ZSgpO1xuXHRcdFx0Y29uc3QgdW50aXRsZWREb2N1bWVudERhdGEgPSB1bnRpdGxlZFN0cmluZyA/IFZTQnVmZmVyLmZyb21TdHJpbmcodW50aXRsZWRTdHJpbmcpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCB3ZWJ2aWV3ID0gYWNjZXNzb3IuZ2V0KElXZWJ2aWV3U2VydmljZSkuY3JlYXRlV2Vidmlld092ZXJsYXkoe1xuXHRcdFx0XHRwcm92aWRlZFZpZXdUeXBlOiBpbml0LnZpZXdUeXBlLFxuXHRcdFx0XHR0aXRsZTogaW5pdC53ZWJ2aWV3VGl0bGUsXG5cdFx0XHRcdG9wdGlvbnM6IHsgY3VzdG9tQ2xhc3Nlczogb3B0aW9ucz8uY3VzdG9tQ2xhc3NlcyB9LFxuXHRcdFx0XHRjb250ZW50T3B0aW9uczoge30sXG5cdFx0XHRcdGV4dGVuc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbUVkaXRvcklucHV0LCBpbml0LCB3ZWJ2aWV3LCB7IHVudGl0bGVkRG9jdW1lbnREYXRhOiB1bnRpdGxlZERvY3VtZW50RGF0YSwgb2xkUmVzb3VyY2U6IG9wdGlvbnM/Lm9sZFJlc291cmNlIH0pO1xuXHRcdFx0aWYgKHR5cGVvZiBncm91cCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0aW5wdXQudXBkYXRlR3JvdXAoZ3JvdXApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGlucHV0O1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBvdmVycmlkZSByZWFkb25seSB0eXBlSWQgPSAnd29ya2JlbmNoLmVkaXRvcnMud2Vidmlld0VkaXRvcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yUmVzb3VyY2U6IFVSSTtcblx0cHVibGljIHJlYWRvbmx5IG9sZFJlc291cmNlPzogVVJJO1xuXHRwcml2YXRlIF9kZWZhdWx0RGlydHlTdGF0ZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9lZGl0b3JOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYmFja3VwSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF91bnRpdGxlZERvY3VtZW50RGF0YTogVlNCdWZmZXIgfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgZ2V0IHJlc291cmNlKCkgeyByZXR1cm4gdGhpcy5fZWRpdG9yUmVzb3VyY2U7IH1cblxuXHRwcml2YXRlIF9tb2RlbFJlZj86IElSZWZlcmVuY2U8SUN1c3RvbUVkaXRvck1vZGVsPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpbml0OiBDdXN0b21FZGl0b3JJbnB1dEluaXRJbmZvLFxuXHRcdHdlYnZpZXc6IElPdmVybGF5V2Vidmlldyxcblx0XHRvcHRpb25zOiB7IHN0YXJ0c0RpcnR5PzogYm9vbGVhbjsgYmFja3VwSWQ/OiBzdHJpbmc7IHVudGl0bGVkRG9jdW1lbnREYXRhPzogVlNCdWZmZXI7IHJlYWRvbmx5IG9sZFJlc291cmNlPzogVVJJIH0sXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJV2Vidmlld1dvcmtiZW5jaFNlcnZpY2Ugd2Vidmlld1dvcmtiZW5jaFNlcnZpY2U6IElXZWJ2aWV3V29ya2JlbmNoU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUN1c3RvbUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21FZGl0b3JTZXJ2aWNlOiBJQ3VzdG9tRWRpdG9yU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASVVuZG9SZWRvU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVuZG9SZWRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cHNTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbUVkaXRvckxhYmVsU2VydmljZTogSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoeyBwcm92aWRlZElkOiBpbml0LnZpZXdUeXBlLCB2aWV3VHlwZTogaW5pdC52aWV3VHlwZSwgbmFtZTogaW5pdC5wcmVmZXJyZWROYW1lID8/ICcnLCBpY29uUGF0aDogaW5pdC5pY29uUGF0aCB9LCB3ZWJ2aWV3LCB0aGVtZVNlcnZpY2UsIHdlYnZpZXdXb3JrYmVuY2hTZXJ2aWNlKTtcblx0XHR0aGlzLl9lZGl0b3JSZXNvdXJjZSA9IGluaXQucmVzb3VyY2U7XG5cdFx0dGhpcy5vbGRSZXNvdXJjZSA9IG9wdGlvbnMub2xkUmVzb3VyY2U7XG5cdFx0dGhpcy5fZGVmYXVsdERpcnR5U3RhdGUgPSBvcHRpb25zLnN0YXJ0c0RpcnR5O1xuXHRcdHRoaXMuX2JhY2t1cElkID0gb3B0aW9ucy5iYWNrdXBJZDtcblx0XHR0aGlzLl91bnRpdGxlZERvY3VtZW50RGF0YSA9IG9wdGlvbnMudW50aXRsZWREb2N1bWVudERhdGE7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdC8vIENsZWFyIG91ciBsYWJlbHMgb24gY2VydGFpbiBsYWJlbCByZWxhdGVkIGV2ZW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFiZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9ybWF0dGVycyhlID0+IHRoaXMub25MYWJlbEV2ZW50KGUuc2NoZW1lKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGUgPT4gdGhpcy5vbkxhYmVsRXZlbnQoZS5zY2hlbWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcyhlID0+IHRoaXMub25MYWJlbEV2ZW50KGUuc2NoZW1lKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudXBkYXRlTGFiZWwoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZVJlYWRvbmx5KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzLmZpcmUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkxhYmVsRXZlbnQoc2NoZW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoc2NoZW1lID09PSB0aGlzLnJlc291cmNlLnNjaGVtZSkge1xuXHRcdFx0dGhpcy51cGRhdGVMYWJlbCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cblx0XHQvLyBDbGVhciBhbnkgY2FjaGVkIGxhYmVscyBmcm9tIGJlZm9yZVxuXHRcdHRoaXMuX2VkaXRvck5hbWUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2hvcnREZXNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9tZWRpdW1EZXNjcmlwdGlvbiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sb25nRGVzY3JpcHRpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2hvcnRUaXRsZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9tZWRpdW1UaXRsZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sb25nVGl0bGUgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBUcmlnZ2VyIHJlY29tcHV0ZSBvZiBsYWJlbFxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSgpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldCB0eXBlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQ3VzdG9tRWRpdG9ySW5wdXQudHlwZUlkO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldCBlZGl0b3JJZCgpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3VHlwZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXQgY2FwYWJpbGl0aWVzKCk6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzIHtcblx0XHRsZXQgY2FwYWJpbGl0aWVzID0gRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuTm9uZTtcblxuXHRcdGNhcGFiaWxpdGllcyB8PSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5Ecm9wSW50b0VkaXRvcjtcblxuXHRcdGlmICghdGhpcy5jdXN0b21FZGl0b3JTZXJ2aWNlLmdldEN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyh0aGlzLnZpZXdUeXBlKT8uc3VwcG9ydHNNdWx0aXBsZUVkaXRvcnNQZXJEb2N1bWVudCkge1xuXHRcdFx0Y2FwYWJpbGl0aWVzIHw9IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlNpbmdsZXRvbjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1JlYWRvbmx5KCkpIHtcblx0XHRcdGNhcGFiaWxpdGllcyB8PSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5SZWFkb25seTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5yZXNvdXJjZS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdGNhcGFiaWxpdGllcyB8PSBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0TmFtZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGN1c3RvbVRpdGxlID0gdGhpcy5nZXRXZWJ2aWV3VGl0bGUoKTtcblx0XHRpZiAoY3VzdG9tVGl0bGUpIHtcblx0XHRcdHJldHVybiBjdXN0b21UaXRsZTtcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0b3JOYW1lID8/PSB0aGlzLmN1c3RvbUVkaXRvckxhYmVsU2VydmljZS5nZXROYW1lKHRoaXMucmVzb3VyY2UpID8/IGJhc2VuYW1lKHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHRoaXMucmVzb3VyY2UpKTtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yTmFtZTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldERlc2NyaXB0aW9uKHZlcmJvc2l0eSA9IFZlcmJvc2l0eS5NRURJVU0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAodmVyYm9zaXR5KSB7XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5TSE9SVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2hvcnREZXNjcmlwdGlvbjtcblx0XHRcdGNhc2UgVmVyYm9zaXR5LkxPTkc6XG5cdFx0XHRcdHJldHVybiB0aGlzLmxvbmdEZXNjcmlwdGlvbjtcblx0XHRcdGNhc2UgVmVyYm9zaXR5Lk1FRElVTTpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLm1lZGl1bURlc2NyaXB0aW9uO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3J0RGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgc2hvcnREZXNjcmlwdGlvbigpOiBzdHJpbmcge1xuXHRcdHRoaXMuX3Nob3J0RGVzY3JpcHRpb24gPz89IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwoZGlybmFtZSh0aGlzLnJlc291cmNlKSk7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3J0RGVzY3JpcHRpb247XG5cdH1cblxuXHRwcml2YXRlIF9tZWRpdW1EZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBtZWRpdW1EZXNjcmlwdGlvbigpOiBzdHJpbmcge1xuXHRcdHRoaXMuX21lZGl1bURlc2NyaXB0aW9uID8/PSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHRoaXMucmVzb3VyY2UpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdHJldHVybiB0aGlzLl9tZWRpdW1EZXNjcmlwdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgX2xvbmdEZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCBsb25nRGVzY3JpcHRpb24oKTogc3RyaW5nIHtcblx0XHR0aGlzLl9sb25nRGVzY3JpcHRpb24gPz89IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUodGhpcy5yZXNvdXJjZSkpO1xuXHRcdHJldHVybiB0aGlzLl9sb25nRGVzY3JpcHRpb247XG5cdH1cblxuXHRwcml2YXRlIF9zaG9ydFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHNob3J0VGl0bGUoKTogc3RyaW5nIHtcblx0XHR0aGlzLl9zaG9ydFRpdGxlID8/PSB0aGlzLmdldE5hbWUoKTtcblx0XHRyZXR1cm4gdGhpcy5fc2hvcnRUaXRsZTtcblx0fVxuXG5cdHByaXZhdGUgX21lZGl1bVRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IG1lZGl1bVRpdGxlKCk6IHN0cmluZyB7XG5cdFx0dGhpcy5fbWVkaXVtVGl0bGUgPz89IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHRoaXMucmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0cmV0dXJuIHRoaXMuX21lZGl1bVRpdGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9uZ1RpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IGxvbmdUaXRsZSgpOiBzdHJpbmcge1xuXHRcdHRoaXMuX2xvbmdUaXRsZSA/Pz0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwodGhpcy5yZXNvdXJjZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2xvbmdUaXRsZTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFRpdGxlKHZlcmJvc2l0eT86IFZlcmJvc2l0eSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY3VzdG9tVGl0bGUgPSB0aGlzLmdldFdlYnZpZXdUaXRsZSgpO1xuXHRcdGlmIChjdXN0b21UaXRsZSkge1xuXHRcdFx0cmV0dXJuIGN1c3RvbVRpdGxlO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAodmVyYm9zaXR5KSB7XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5TSE9SVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2hvcnRUaXRsZTtcblx0XHRcdGNhc2UgVmVyYm9zaXR5LkxPTkc6XG5cdFx0XHRcdHJldHVybiB0aGlzLmxvbmdUaXRsZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5NRURJVU06XG5cdFx0XHRcdHJldHVybiB0aGlzLm1lZGl1bVRpdGxlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBtYXRjaGVzKG90aGVyOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRpZiAoc3VwZXIubWF0Y2hlcyhvdGhlcikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcyA9PT0gb3RoZXIgfHwgKG90aGVyIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXRcblx0XHRcdCYmIHRoaXMudmlld1R5cGUgPT09IG90aGVyLnZpZXdUeXBlXG5cdFx0XHQmJiBpc0VxdWFsKHRoaXMucmVzb3VyY2UsIG90aGVyLnJlc291cmNlKSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY29weSgpOiBFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIEN1c3RvbUVkaXRvcklucHV0LmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0eyByZXNvdXJjZTogdGhpcy5yZXNvdXJjZSwgdmlld1R5cGU6IHRoaXMudmlld1R5cGUsIHdlYnZpZXdUaXRsZTogdGhpcy5nZXRXZWJ2aWV3VGl0bGUoKSwgcHJlZmVycmVkTmFtZTogdW5kZWZpbmVkLCBpY29uUGF0aDogdGhpcy5pY29uUGF0aCwgfSxcblx0XHRcdHRoaXMuZ3JvdXAsXG5cdFx0XHR0aGlzLndlYnZpZXcub3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgaXNSZWFkb25seSgpOiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzUmVhZG9ubHkodGhpcy5yZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbFJlZi5vYmplY3QuaXNSZWFkb25seSgpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGlzRGlydHkoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuICEhdGhpcy5fZGVmYXVsdERpcnR5U3RhdGU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbFJlZi5vYmplY3QuaXNEaXJ0eSgpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFzeW5jIHNhdmUoZ3JvdXBJZDogR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSVNhdmVPcHRpb25zKTogUHJvbWlzZTxFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX21vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IGF3YWl0IHRoaXMuX21vZGVsUmVmLm9iamVjdC5zYXZlQ3VzdG9tRWRpdG9yKG9wdGlvbnMpO1xuXHRcdGlmICghdGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBzYXZlIGNhbmNlbGxlZFxuXHRcdH1cblxuXHRcdC8vIERpZmZlcmVudCBVUklzID09IHVudHlwZWQgaW5wdXQgcmV0dXJuZWQgdG8gYWxsb3cgcmVzb2x2ZXIgdG8gcG9zc2libHkgcmVzb2x2ZSB0byBhIGRpZmZlcmVudCBlZGl0b3IgdHlwZVxuXHRcdGlmICghaXNFcXVhbCh0YXJnZXQsIHRoaXMucmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4geyByZXNvdXJjZTogdGFyZ2V0IH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgc2F2ZUFzKGdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8RWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkaWFsb2dQYXRoID0gdGhpcy5fZWRpdG9yUmVzb3VyY2U7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5maWxlRGlhbG9nU2VydmljZS5waWNrRmlsZVRvU2F2ZShkaWFsb2dQYXRoLCBvcHRpb25zPy5hdmFpbGFibGVGaWxlU3lzdGVtcyk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHNhdmUgY2FuY2VsbGVkXG5cdFx0fVxuXG5cdFx0aWYgKCFhd2FpdCB0aGlzLl9tb2RlbFJlZi5vYmplY3Quc2F2ZUN1c3RvbUVkaXRvckFzKHRoaXMuX2VkaXRvclJlc291cmNlLCB0YXJnZXQsIG9wdGlvbnMpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5yZW5hbWUoZ3JvdXBJZCwgdGFyZ2V0KSk/LmVkaXRvcjtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyByZXZlcnQoZ3JvdXA6IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElSZXZlcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX21vZGVsUmVmKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW9kZWxSZWYub2JqZWN0LnJldmVydChvcHRpb25zKTtcblx0XHR9XG5cdFx0dGhpcy5fZGVmYXVsdERpcnR5U3RhdGUgPSBmYWxzZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBhc3luYyByZXNvbHZlKCk6IFByb21pc2U8bnVsbD4ge1xuXHRcdGF3YWl0IHN1cGVyLnJlc29sdmUoKTtcblxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9tb2RlbFJlZikge1xuXHRcdFx0Y29uc3Qgb2xkQ2FwYWJpbGl0aWVzID0gdGhpcy5jYXBhYmlsaXRpZXM7XG5cdFx0XHR0aGlzLl9tb2RlbFJlZiA9IHRoaXMuX3JlZ2lzdGVyKGFzc2VydFJldHVybnNEZWZpbmVkKGF3YWl0IHRoaXMuY3VzdG9tRWRpdG9yU2VydmljZS5tb2RlbHMudHJ5UmV0YWluKHRoaXMucmVzb3VyY2UsIHRoaXMudmlld1R5cGUpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tb2RlbFJlZi5vYmplY3Qub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZURpcnR5LmZpcmUoKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZWxSZWYub2JqZWN0Lm9uRGlkQ2hhbmdlUmVhZG9ubHkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VDYXBhYmlsaXRpZXMuZmlyZSgpKSk7XG5cdFx0XHQvLyBJZiB3ZSdyZSBsb2FkaW5nIHVudGl0bGVkIGZpbGUgZGF0YSB3ZSBzaG91bGQgZW5zdXJlIGl0J3MgZGlydHlcblx0XHRcdGlmICh0aGlzLl91bnRpdGxlZERvY3VtZW50RGF0YSkge1xuXHRcdFx0XHR0aGlzLl9kZWZhdWx0RGlydHlTdGF0ZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5pc0RpcnR5KCkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VEaXJ0eS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5jYXBhYmlsaXRpZXMgIT09IG9sZENhcGFiaWxpdGllcykge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNhcGFiaWxpdGllcy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgYXN5bmMgcmVuYW1lKGdyb3VwOiBHcm91cElkZW50aWZpZXIsIG5ld1Jlc291cmNlOiBVUkkpOiBQcm9taXNlPElNb3ZlUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gV2UgcmV0dXJuIGFuIHVudHlwZWQgZWRpdG9yIGlucHV0IHdoaWNoIGNhbiB0aGVuIGJlIHJlc29sdmVkIGluIHRoZSBlZGl0b3Igc2VydmljZVxuXHRcdHJldHVybiB7IGVkaXRvcjogeyByZXNvdXJjZTogbmV3UmVzb3VyY2UgfSB9O1xuXHR9XG5cblx0cHVibGljIHVuZG8oKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuX21vZGVsUmVmKTtcblx0XHRyZXR1cm4gdGhpcy51bmRvUmVkb1NlcnZpY2UudW5kbyh0aGlzLnJlc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyByZWRvKCk6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLl9tb2RlbFJlZik7XG5cdFx0cmV0dXJuIHRoaXMudW5kb1JlZG9TZXJ2aWNlLnJlZG8odGhpcy5yZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9tb3ZlSGFuZGxlcj86IChuZXdSZXNvdXJjZTogVVJJKSA9PiB2b2lkO1xuXG5cdHB1YmxpYyBvbk1vdmUoaGFuZGxlcjogKG5ld1Jlc291cmNlOiBVUkkpID0+IHZvaWQpOiB2b2lkIHtcblx0XHQvLyBUT0RPOiBNb3ZlIHRoaXMgdG8gdGhlIHNlcnZpY2Vcblx0XHR0aGlzLl9tb3ZlSGFuZGxlciA9IGhhbmRsZXI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdHJhbnNmZXIob3RoZXI6IEN1c3RvbUVkaXRvcklucHV0KTogQ3VzdG9tRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghc3VwZXIudHJhbnNmZXIob3RoZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0b3RoZXIuX21vdmVIYW5kbGVyID0gdGhpcy5fbW92ZUhhbmRsZXI7XG5cdFx0dGhpcy5fbW92ZUhhbmRsZXIgPSB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIG90aGVyO1xuXHR9XG5cblx0cHVibGljIGdldCBiYWNrdXBJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9tb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsUmVmLm9iamVjdC5iYWNrdXBJZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2JhY2t1cElkO1xuXHR9XG5cblx0cHVibGljIGdldCB1bnRpdGxlZERvY3VtZW50RGF0YSgpOiBWU0J1ZmZlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3VudGl0bGVkRG9jdW1lbnREYXRhO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHRvVW50eXBlZCgpOiBJUmVzb3VyY2VFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiB0aGlzLnJlc291cmNlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRvdmVycmlkZTogdGhpcy52aWV3VHlwZVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY2xhaW0oY2xhaW1hbnQ6IHVua25vd24sIHRhcmdldFdpbmRvdzogQ29kZVdpbmRvdywgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRvQ2FuTW92ZSh0YXJnZXRXaW5kb3cudnNjb2RlV2luZG93SWQpICE9PSB0cnVlKSB7XG5cdFx0XHR0aHJvdyBjcmVhdGVFZGl0b3JPcGVuRXJyb3IobG9jYWxpemUoJ2VkaXRvclVuc3VwcG9ydGVkSW5XaW5kb3cnLCBcIlVuYWJsZSB0byBvcGVuIHRoZSBlZGl0b3IgaW4gdGhpcyB3aW5kb3csIGl0IGNvbnRhaW5zIG1vZGlmaWNhdGlvbnMgdGhhdCBjYW4gb25seSBiZSBzYXZlZCBpbiB0aGUgb3JpZ2luYWwgd2luZG93LlwiKSwgW1xuXHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0aWQ6ICdvcGVuSW5PcmlnaW5hbFdpbmRvdycsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZW9wZW5Jbk9yaWdpbmFsV2luZG93JywgXCJPcGVuIGluIE9yaWdpbmFsIFdpbmRvd1wiKSxcblx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsUGFydCA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5nZXRQYXJ0KHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoZ2V0V2luZG93KHRoaXMud2Vidmlldy5jb250YWluZXIpLndpbmRvdykpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudFBhcnQgPSB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0UGFydCh0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdy53aW5kb3cpKTtcblx0XHRcdFx0XHRcdGN1cnJlbnRQYXJ0LmFjdGl2ZUdyb3VwLm1vdmVFZGl0b3IodGhpcywgb3JpZ2luYWxQYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHRdLCB7IGZvcmNlTWVzc2FnZTogdHJ1ZSB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmNsYWltKGNsYWltYW50LCB0YXJnZXRXaW5kb3csIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjYW5Nb3ZlKHNvdXJjZUdyb3VwOiBHcm91cElkZW50aWZpZXIsIHRhcmdldEdyb3VwOiBHcm91cElkZW50aWZpZXIpOiB0cnVlIHwgc3RyaW5nIHtcblx0XHRjb25zdCByZXNvbHZlZFRhcmdldEdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmdldEdyb3VwKHRhcmdldEdyb3VwKTtcblx0XHRpZiAocmVzb2x2ZWRUYXJnZXRHcm91cCkge1xuXHRcdFx0Y29uc3QgY2FuTW92ZSA9IHRoaXMuZG9DYW5Nb3ZlKHJlc29sdmVkVGFyZ2V0R3JvdXAud2luZG93SWQpO1xuXHRcdFx0aWYgKHR5cGVvZiBjYW5Nb3ZlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gY2FuTW92ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuY2FuTW92ZShzb3VyY2VHcm91cCwgdGFyZ2V0R3JvdXApO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0Nhbk1vdmUodGFyZ2V0V2luZG93SWQ6IG51bWJlcik6IHRydWUgfCBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmlzTW9kaWZpZWQoKSAmJiB0aGlzLl9tb2RlbFJlZj8ub2JqZWN0LmNhbkhvdEV4aXQgPT09IGZhbHNlKSB7XG5cdFx0XHRjb25zdCBzb3VyY2VXaW5kb3dJZCA9IGdldFdpbmRvdyh0aGlzLndlYnZpZXcuY29udGFpbmVyKS52c2NvZGVXaW5kb3dJZDtcblx0XHRcdGlmIChzb3VyY2VXaW5kb3dJZCAhPT0gdGFyZ2V0V2luZG93SWQpIHtcblxuXHRcdFx0XHQvLyBUaGUgY3VzdG9tIGVkaXRvciBpcyBtb2RpZmllZCwgbm90IGJhY2tlZCBieSBhIGZpbGUgYW5kIHdpdGhvdXQgYSBiYWNrdXAuXG5cdFx0XHRcdC8vIFdlIGhhdmUgdG8gYXNzdW1lIHRoYXQgdGhlIG1vZGlmaWVkIHN0YXRlIGlzIGVuY2xvc2VkIGludG8gdGhlIHdlYnZpZXdcblx0XHRcdFx0Ly8gbWFuYWdlZCBieSBhbiBleHRlbnNpb24uIEFzIHN1Y2gsIHdlIGNhbm5vdCBqdXN0IG1vdmUgdGhlIHdlYnZpZXdcblx0XHRcdFx0Ly8gaW50byBhbm90aGVyIHdpbmRvdyBiZWNhdXNlIHRoYXQgbWVhbnMsIHdlIHBvdGVudGFsbHkgbG9vc2UgdGhlIG1vZGlmaWVkXG5cdFx0XHRcdC8vIHN0YXRlIGFuZCB0aHVzIHRyaWdnZXIgZGF0YSBsb3NzLlxuXG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZWRpdG9yQ2Fubm90TW92ZScsIFwiVW5hYmxlIHRvIG1vdmUgJ3swfSc6IFRoZSBlZGl0b3IgY29udGFpbnMgY2hhbmdlcyB0aGF0IGNhbiBvbmx5IGJlIHNhdmVkIGluIGl0cyBjdXJyZW50IHdpbmRvdy5cIiwgdGhpcy5nZXROYW1lKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBR3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsZUFBZTtBQUNqQyxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUEwRyxXQUFXLDZCQUE2QjtBQUUzSixTQUFTLGlDQUFpQztBQUMxQyxTQUE2Qiw0QkFBNEI7QUFDekQsU0FBMEIsdUJBQXVCO0FB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
