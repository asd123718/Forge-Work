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
import "./media/customEditor.css";
import { coalesce } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { RedoCommand, UndoCommand } from "../../../../editor/browser/editorExtensions.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { FileOperation, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { DEFAULT_EDITOR_ASSOCIATION, EditorExtensions } from "../../../common/editor.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { ActiveCustomEditorDiffCanToggleLayoutContext, ActiveCustomEditorTextDiffContext } from "../../../common/contextkeys.js";
import { CONTEXT_ACTIVE_CUSTOM_EDITOR_ID, CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CustomEditorDiffEditorLayout, CustomEditorInfoCollection } from "../common/customEditor.js";
import { CustomEditorModelManager } from "../common/customEditorModelManager.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ContributedCustomEditors } from "../common/contributedCustomEditors.js";
import { CustomEditorDiffInput, CustomEditorSideBySideDiffInput } from "./customEditorDiffInput.js";
import { CustomEditorInput } from "./customEditorInput.js";
let CustomEditorService = class extends Disposable {
  constructor(fileService, storageService, editorService, editorGroupService, instantiationService, uriIdentityService, editorResolverService, textResourceConfigurationService, extensionService) {
    super();
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.instantiationService = instantiationService;
    this.uriIdentityService = uriIdentityService;
    this.editorResolverService = editorResolverService;
    this.textResourceConfigurationService = textResourceConfigurationService;
    this.extensionService = extensionService;
    this._untitledCounter = 0;
    this._editorResolverDisposables = this._register(new DisposableStore());
    this._editorCapabilities = /* @__PURE__ */ new Map();
    this._onDidChangeEditorTypes = this._register(new Emitter());
    this.onDidChangeEditorTypes = this._onDidChangeEditorTypes.event;
    this._fileEditorFactory = Registry.as(EditorExtensions.EditorFactory).getFileEditorFactory();
    this._models = new CustomEditorModelManager();
    this._contributedEditors = this._register(new ContributedCustomEditors(storageService));
    this.editorResolverService.bufferChangeEvents(this.registerContributionPoints.bind(this));
    this._register(this._contributedEditors.onChange(() => {
      this.editorResolverService.bufferChangeEvents(this.registerContributionPoints.bind(this));
      this._onDidChangeEditorTypes.fire();
    }));
    const activeCustomEditorContextKeyProvider = {
      contextKey: CONTEXT_ACTIVE_CUSTOM_EDITOR_ID,
      getGroupContextKeyValue: (group) => this.getActiveCustomEditorId(group),
      onDidChange: this.onDidChangeEditorTypes
    };
    const customEditorIsEditableContextKeyProvider = {
      contextKey: CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE,
      getGroupContextKeyValue: (group) => this.getCustomEditorIsEditable(group),
      onDidChange: this.onDidChangeEditorTypes
    };
    const customEditorDiffCanToggleLayoutContextKeyProvider = {
      contextKey: ActiveCustomEditorDiffCanToggleLayoutContext,
      getGroupContextKeyValue: (group) => this.getActiveCustomEditorDiffCanToggleLayout(group),
      onDidChange: this.onDidChangeEditorTypes
    };
    const customEditorTextDiffContextKeyProvider = {
      contextKey: ActiveCustomEditorTextDiffContext,
      getGroupContextKeyValue: (group) => this.getActiveCustomEditorTextDiff(group),
      onDidChange: this.onDidChangeEditorTypes
    };
    this._register(this.editorGroupService.registerContextKeyProvider(activeCustomEditorContextKeyProvider));
    this._register(this.editorGroupService.registerContextKeyProvider(customEditorIsEditableContextKeyProvider));
    this._register(this.editorGroupService.registerContextKeyProvider(customEditorDiffCanToggleLayoutContextKeyProvider));
    this._register(this.editorGroupService.registerContextKeyProvider(customEditorTextDiffContextKeyProvider));
    this._register(this.textResourceConfigurationService.onDidChangeConfiguration((e) => {
      void this.updateCustomDiffEditorsForDiffConfigurationChange(e);
    }));
    this._register(fileService.onDidRunOperation((e) => {
      if (e.isOperation(FileOperation.MOVE)) {
        this.handleMovedFileInOpenedFileEditors(e.resource, this.uriIdentityService.asCanonicalUri(e.target.resource));
      }
      if (e.isOperation(FileOperation.DELETE)) {
        this.handleDeletedFile(e.resource);
      }
    }));
    const PRIORITY = 105;
    this._register(UndoCommand.addImplementation(PRIORITY, "custom-editor", () => {
      return this.withActiveCustomEditor((editor) => editor.undo());
    }));
    this._register(RedoCommand.addImplementation(PRIORITY, "custom-editor", () => {
      return this.withActiveCustomEditor((editor) => editor.redo());
    }));
  }
  getEditorTypes() {
    return [...this._contributedEditors];
  }
  withActiveCustomEditor(f) {
    const editor = this.getActiveCustomEditorUndoRedoInput();
    if (editor) {
      const result = f(editor);
      if (result) {
        return result;
      }
      return true;
    }
    return false;
  }
  getActiveCustomEditorUndoRedoInput() {
    const activeEditor = this.editorService.activeEditor;
    if (activeEditor instanceof CustomEditorInput || activeEditor instanceof CustomEditorDiffInput || activeEditor instanceof CustomEditorSideBySideDiffInput) {
      return activeEditor;
    }
    if (activeEditor instanceof DiffEditorInput && activeEditor.modified instanceof CustomEditorSideBySideDiffInput) {
      return activeEditor.modified;
    }
    return void 0;
  }
  registerContributionPoints() {
    this._editorResolverDisposables.clear();
    for (const contributedEditor of this._contributedEditors) {
      for (const globPattern of contributedEditor.selector) {
        if (!globPattern.filenamePattern) {
          continue;
        }
        this._editorResolverDisposables.add(this.editorResolverService.registerEditor(
          globPattern.filenamePattern,
          {
            id: contributedEditor.id,
            label: contributedEditor.displayName,
            detail: contributedEditor.providerDisplayName,
            priority: contributedEditor.priority
          },
          {
            singlePerResource: () => !(this.getCustomEditorCapabilities(contributedEditor.id)?.supportsMultipleEditorsPerDocument ?? false)
          },
          {
            createEditorInput: ({ resource, label }, group) => {
              return { editor: CustomEditorInput.create(this.instantiationService, { resource, viewType: contributedEditor.id, webviewTitle: void 0, preferredName: label, iconPath: void 0 }, group.id) };
            },
            createUntitledEditorInput: ({ resource }, group) => {
              return { editor: CustomEditorInput.create(this.instantiationService, { resource: resource ?? URI.from({ scheme: Schemas.untitled, authority: `Untitled-${this._untitledCounter++}` }), viewType: contributedEditor.id, webviewTitle: void 0, preferredName: void 0, iconPath: void 0 }, group.id) };
            },
            createDiffEditorInput: async (diffEditorInput, group) => {
              await this.extensionService.activateByEvent(`onCustomEditor:${contributedEditor.id}`);
              return { editor: this.createDiffEditorInput(diffEditorInput, contributedEditor, group) };
            }
          }
        ));
      }
    }
  }
  createDiffEditorInput(editor, contributedEditor, group) {
    const originalResource = assertReturnsDefined(editor.original.resource);
    const modifiedResource = assertReturnsDefined(editor.modified.resource);
    const diffEditorLayout = this.getDiffEditorLayout(contributedEditor, modifiedResource);
    if (diffEditorLayout === CustomEditorDiffEditorLayout.Inline) {
      return CustomEditorDiffInput.create(this.instantiationService, {
        originalResource,
        modifiedResource,
        viewType: contributedEditor.id,
        label: editor.label,
        description: editor.description,
        iconPath: void 0
      }, group);
    }
    if (diffEditorLayout === CustomEditorDiffEditorLayout.SideBySide) {
      const diffId = generateUuid();
      const originalOverride2 = CustomEditorSideBySideDiffInput.create(this.instantiationService, {
        originalResource,
        modifiedResource,
        viewType: contributedEditor.id,
        diffId,
        side: "original",
        label: editor.label,
        description: editor.description,
        iconPath: void 0
      }, group);
      const modifiedOverride2 = CustomEditorSideBySideDiffInput.create(this.instantiationService, {
        originalResource,
        modifiedResource,
        viewType: contributedEditor.id,
        diffId,
        side: "modified",
        label: editor.label,
        description: editor.description,
        iconPath: void 0
      }, group);
      return this.instantiationService.createInstance(DiffEditorInput, editor.label, editor.description, originalOverride2, modifiedOverride2, true);
    }
    const modifiedOverride = CustomEditorInput.create(this.instantiationService, { resource: modifiedResource, viewType: contributedEditor.id, webviewTitle: void 0, preferredName: void 0, iconPath: void 0 }, group.id, { customClasses: "modified" });
    const originalOverride = CustomEditorInput.create(this.instantiationService, { resource: originalResource, viewType: contributedEditor.id, webviewTitle: void 0, preferredName: void 0, iconPath: void 0 }, group.id, { customClasses: "original" });
    return this.instantiationService.createInstance(DiffEditorInput, editor.label, editor.description, originalOverride, modifiedOverride, true);
  }
  getDiffEditorLayout(contributedEditor, modifiedResource) {
    const capabilities = this.getCustomEditorCapabilities(contributedEditor.id);
    const supportsInlineDiff = capabilities?.supportsInlineDiff === true;
    const supportsSideBySideDiff = capabilities?.supportsSideBySideDiff === true;
    if (supportsInlineDiff && supportsSideBySideDiff) {
      return this.textResourceConfigurationService.getValue(modifiedResource, "diffEditor.renderSideBySide") ? CustomEditorDiffEditorLayout.SideBySide : CustomEditorDiffEditorLayout.Inline;
    }
    return supportsInlineDiff ? CustomEditorDiffEditorLayout.Inline : supportsSideBySideDiff ? CustomEditorDiffEditorLayout.SideBySide : void 0;
  }
  async updateCustomDiffEditorsForDiffConfigurationChange(e) {
    for (const group of this.editorGroupService.groups) {
      const replacements = [];
      for (const editor of group.editors) {
        const diffInfo = this.getCustomEditorDiffInputInfo(editor);
        const contributedEditor = diffInfo ? this._contributedEditors.get(diffInfo.viewType) : void 0;
        if (!diffInfo || !contributedEditor || !e.affectsConfiguration(diffInfo.modifiedResource, "diffEditor.renderSideBySide") || !this.getCustomEditorCapabilities(contributedEditor.id)?.supportsInlineDiff || !this.getCustomEditorCapabilities(contributedEditor.id)?.supportsSideBySideDiff || this.getDiffEditorLayout(contributedEditor, diffInfo.modifiedResource) === diffInfo.layout) {
          continue;
        }
        replacements.push({
          editor,
          replacement: {
            original: { resource: diffInfo.originalResource },
            modified: { resource: diffInfo.modifiedResource },
            label: editor.getName(),
            description: editor.getDescription(),
            options: {
              override: diffInfo.viewType,
              pinned: group.isPinned(editor),
              sticky: group.isSticky(editor),
              preserveFocus: group.activeEditor !== editor
            }
          }
        });
      }
      if (replacements.length) {
        await this.editorService.replaceEditors(replacements, group);
      }
    }
  }
  getCustomEditorDiffInputInfo(input) {
    if (input instanceof CustomEditorDiffInput) {
      return {
        viewType: input.viewType,
        originalResource: input.originalResource,
        modifiedResource: input.modifiedResource,
        layout: CustomEditorDiffEditorLayout.Inline
      };
    }
    if (input instanceof DiffEditorInput && input.original instanceof CustomEditorSideBySideDiffInput && input.modified instanceof CustomEditorSideBySideDiffInput && input.original.side === "original" && input.modified.side === "modified" && input.original.viewType === input.modified.viewType && input.original.diffId === input.modified.diffId) {
      return {
        viewType: input.original.viewType,
        originalResource: input.original.originalResource,
        modifiedResource: input.original.modifiedResource,
        layout: CustomEditorDiffEditorLayout.SideBySide
      };
    }
    return void 0;
  }
  get models() {
    return this._models;
  }
  getCustomEditor(viewType) {
    return this._contributedEditors.get(viewType);
  }
  getContributedCustomEditors(resource) {
    return new CustomEditorInfoCollection(this._contributedEditors.getContributedEditors(resource));
  }
  getUserConfiguredCustomEditors(resource) {
    const resourceAssocations = this.editorResolverService.getAssociationsForResource(resource);
    return new CustomEditorInfoCollection(
      coalesce(resourceAssocations.map((association) => this._contributedEditors.get(association.viewType)))
    );
  }
  getAllCustomEditors(resource) {
    return new CustomEditorInfoCollection([
      ...this.getUserConfiguredCustomEditors(resource).allEditors,
      ...this.getContributedCustomEditors(resource).allEditors
    ]);
  }
  registerCustomEditorCapabilities(viewType, options) {
    if (this._editorCapabilities.has(viewType)) {
      throw new Error(`Capabilities for ${viewType} already set`);
    }
    this._editorCapabilities.set(viewType, options);
    this._onDidChangeEditorTypes.fire();
    return toDisposable(() => {
      this._editorCapabilities.delete(viewType);
      this._onDidChangeEditorTypes.fire();
    });
  }
  getCustomEditorCapabilities(viewType) {
    return this._editorCapabilities.get(viewType);
  }
  getActiveCustomEditorId(group) {
    const activeEditorPane = group.activeEditorPane;
    const input = activeEditorPane?.input;
    const diffInfo = this.getCustomEditorDiffInputInfo(input);
    if (diffInfo) {
      return diffInfo.viewType;
    }
    return input instanceof CustomEditorInput && input.resource ? input.viewType : "";
  }
  getActiveCustomEditorDiffCanToggleLayout(group) {
    const diffInfo = this.getCustomEditorDiffInputInfo(group.activeEditorPane?.input);
    const capabilities = diffInfo ? this.getCustomEditorCapabilities(diffInfo.viewType) : void 0;
    return capabilities?.supportsInlineDiff === true && capabilities.supportsSideBySideDiff === true;
  }
  getActiveCustomEditorTextDiff(group) {
    const diffInfo = this.getCustomEditorDiffInputInfo(group.activeEditorPane?.input);
    return !!diffInfo && this.getCustomEditorCapabilities(diffInfo.viewType)?.isTextEditor === true;
  }
  getCustomEditorIsEditable(group) {
    const activeEditorPane = group.activeEditorPane;
    const resource = activeEditorPane?.input?.resource;
    if (!resource) {
      return false;
    }
    return activeEditorPane?.input instanceof CustomEditorInput;
  }
  handleDeletedFile(resource) {
    this._models.disposeAllModelsForResource(resource);
  }
  async handleMovedFileInOpenedFileEditors(oldResource, newResource) {
    if (extname(oldResource).toLowerCase() === extname(newResource).toLowerCase()) {
      return;
    }
    const possibleEditors = this.getAllCustomEditors(newResource);
    if (!possibleEditors.allEditors.some((editor) => editor.priority.editor !== RegisteredEditorPriority.option)) {
      return;
    }
    const editorsToReplace = /* @__PURE__ */ new Map();
    for (const group of this.editorGroupService.groups) {
      for (const editor of group.editors) {
        if (this._fileEditorFactory.isFileEditor(editor) && !(editor instanceof CustomEditorInput) && isEqual(editor.resource, newResource)) {
          let entry = editorsToReplace.get(group.id);
          if (!entry) {
            entry = [];
            editorsToReplace.set(group.id, entry);
          }
          entry.push(editor);
        }
      }
    }
    if (!editorsToReplace.size) {
      return;
    }
    for (const [group, entries] of editorsToReplace) {
      this.editorService.replaceEditors(entries.map((editor) => {
        let replacement;
        if (possibleEditors.defaultEditor) {
          const viewType = possibleEditors.defaultEditor.id;
          replacement = CustomEditorInput.create(this.instantiationService, { resource: newResource, viewType, webviewTitle: void 0, preferredName: void 0, iconPath: void 0 }, group);
        } else {
          replacement = { resource: newResource, options: { override: DEFAULT_EDITOR_ASSOCIATION.id } };
        }
        return {
          editor,
          replacement,
          options: {
            preserveFocus: true
          }
        };
      }), group);
    }
  }
};
CustomEditorService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IEditorGroupsService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IEditorResolverService),
  __decorateParam(7, ITextResourceConfigurationService),
  __decorateParam(8, IExtensionService)
], CustomEditorService);
export {
  CustomEditorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGN1c3RvbUVkaXRvclxcYnJvd3NlclxcY3VzdG9tRWRpdG9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jdXN0b21FZGl0b3IuY3NzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGV4dG5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBSZWRvQ29tbWFuZCwgVW5kb0NvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb24sIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiwgRWRpdG9yRXh0ZW5zaW9ucywgR3JvdXBJZGVudGlmaWVyLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBBY3RpdmVDdXN0b21FZGl0b3JEaWZmQ2FuVG9nZ2xlTGF5b3V0Q29udGV4dCwgQWN0aXZlQ3VzdG9tRWRpdG9yVGV4dERpZmZDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNUSVZFX0NVU1RPTV9FRElUT1JfSUQsIENPTlRFWFRfRk9DVVNFRF9DVVNUT01fRURJVE9SX0lTX0VESVRBQkxFLCBDdXN0b21FZGl0b3JDYXBhYmlsaXRpZXMsIEN1c3RvbUVkaXRvckRpZmZFZGl0b3JMYXlvdXQsIEN1c3RvbUVkaXRvckluZm8sIEN1c3RvbUVkaXRvckluZm9Db2xsZWN0aW9uLCBJQ3VzdG9tRWRpdG9yTW9kZWxNYW5hZ2VyLCBJQ3VzdG9tRWRpdG9yU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jdXN0b21FZGl0b3IuanMnO1xuaW1wb3J0IHsgQ3VzdG9tRWRpdG9yTW9kZWxNYW5hZ2VyIH0gZnJvbSAnLi4vY29tbW9uL2N1c3RvbUVkaXRvck1vZGVsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cENvbnRleHRLZXlQcm92aWRlciwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSwgSUVkaXRvclR5cGUsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBJVW50eXBlZEVkaXRvclJlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRlZEN1c3RvbUVkaXRvcnMgfSBmcm9tICcuLi9jb21tb24vY29udHJpYnV0ZWRDdXN0b21FZGl0b3JzLmpzJztcbmltcG9ydCB7IEN1c3RvbUVkaXRvckRpZmZJbnB1dCwgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCB9IGZyb20gJy4vY3VzdG9tRWRpdG9yRGlmZklucHV0LmpzJztcbmltcG9ydCB7IEN1c3RvbUVkaXRvcklucHV0IH0gZnJvbSAnLi9jdXN0b21FZGl0b3JJbnB1dC5qcyc7XG5cbmludGVyZmFjZSBDdXN0b21FZGl0b3JEaWZmSW5wdXRJbmZvIHtcblx0cmVhZG9ubHkgdmlld1R5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgb3JpZ2luYWxSZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBtb2RpZmllZFJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGxheW91dDogQ3VzdG9tRWRpdG9yRGlmZkVkaXRvckxheW91dDtcbn1cblxudHlwZSBDdXN0b21FZGl0b3JVbmRvUmVkb0lucHV0ID0gQ3VzdG9tRWRpdG9ySW5wdXQgfCBDdXN0b21FZGl0b3JEaWZmSW5wdXQgfCBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0O1xuXG5leHBvcnQgY2xhc3MgQ3VzdG9tRWRpdG9yU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ3VzdG9tRWRpdG9yU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IGFueTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cmlidXRlZEVkaXRvcnM6IENvbnRyaWJ1dGVkQ3VzdG9tRWRpdG9ycztcblx0cHJpdmF0ZSBfdW50aXRsZWRDb3VudGVyID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yUmVzb2x2ZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckNhcGFiaWxpdGllcyA9IG5ldyBNYXA8c3RyaW5nLCBDdXN0b21FZGl0b3JDYXBhYmlsaXRpZXM+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxzOiBJQ3VzdG9tRWRpdG9yTW9kZWxNYW5hZ2VyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRWRpdG9yVHlwZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRWRpdG9yVHlwZXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JUeXBlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9maWxlRWRpdG9yRmFjdG9yeSA9IFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkuZ2V0RmlsZUVkaXRvckZhY3RvcnkoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3VwU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElFZGl0b3JSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9tb2RlbHMgPSBuZXcgQ3VzdG9tRWRpdG9yTW9kZWxNYW5hZ2VyKCk7XG5cblx0XHR0aGlzLl9jb250cmlidXRlZEVkaXRvcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29udHJpYnV0ZWRDdXN0b21FZGl0b3JzKHN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGNvbnRyaWJ1dGlvbiBwb2ludHMgb25seSBlbWl0dGluZyBvbmUgY2hhbmdlIGZyb20gdGhlIHJlc29sdmVyXG5cdFx0dGhpcy5lZGl0b3JSZXNvbHZlclNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKHRoaXMucmVnaXN0ZXJDb250cmlidXRpb25Qb2ludHMuYmluZCh0aGlzKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb250cmlidXRlZEVkaXRvcnMub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Ly8gUmVnaXN0ZXIgdGhlIGNvbnRyaWJ1dGlvbiBwb2ludHMgb25seSBlbWl0dGluZyBvbmUgY2hhbmdlIGZyb20gdGhlIHJlc29sdmVyXG5cdFx0XHR0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHModGhpcy5yZWdpc3RlckNvbnRyaWJ1dGlvblBvaW50cy5iaW5kKHRoaXMpKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yVHlwZXMuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGdyb3VwIGNvbnRleHQga2V5IHByb3ZpZGVycy5cblx0XHQvLyBUaGVzZSBzZXQgdGhlIGNvbnRleHQga2V5cyBmb3IgZWFjaCBlZGl0b3IgZ3JvdXAgYW5kIHRoZSBnbG9iYWwgY29udGV4dFxuXHRcdGNvbnN0IGFjdGl2ZUN1c3RvbUVkaXRvckNvbnRleHRLZXlQcm92aWRlcjogSUVkaXRvckdyb3VwQ29udGV4dEtleVByb3ZpZGVyPHN0cmluZz4gPSB7XG5cdFx0XHRjb250ZXh0S2V5OiBDT05URVhUX0FDVElWRV9DVVNUT01fRURJVE9SX0lELFxuXHRcdFx0Z2V0R3JvdXBDb250ZXh0S2V5VmFsdWU6IGdyb3VwID0+IHRoaXMuZ2V0QWN0aXZlQ3VzdG9tRWRpdG9ySWQoZ3JvdXApLFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMub25EaWRDaGFuZ2VFZGl0b3JUeXBlc1xuXHRcdH07XG5cblx0XHRjb25zdCBjdXN0b21FZGl0b3JJc0VkaXRhYmxlQ29udGV4dEtleVByb3ZpZGVyOiBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXI8Ym9vbGVhbj4gPSB7XG5cdFx0XHRjb250ZXh0S2V5OiBDT05URVhUX0ZPQ1VTRURfQ1VTVE9NX0VESVRPUl9JU19FRElUQUJMRSxcblx0XHRcdGdldEdyb3VwQ29udGV4dEtleVZhbHVlOiBncm91cCA9PiB0aGlzLmdldEN1c3RvbUVkaXRvcklzRWRpdGFibGUoZ3JvdXApLFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMub25EaWRDaGFuZ2VFZGl0b3JUeXBlc1xuXHRcdH07XG5cblx0XHRjb25zdCBjdXN0b21FZGl0b3JEaWZmQ2FuVG9nZ2xlTGF5b3V0Q29udGV4dEtleVByb3ZpZGVyOiBJRWRpdG9yR3JvdXBDb250ZXh0S2V5UHJvdmlkZXI8Ym9vbGVhbj4gPSB7XG5cdFx0XHRjb250ZXh0S2V5OiBBY3RpdmVDdXN0b21FZGl0b3JEaWZmQ2FuVG9nZ2xlTGF5b3V0Q29udGV4dCxcblx0XHRcdGdldEdyb3VwQ29udGV4dEtleVZhbHVlOiBncm91cCA9PiB0aGlzLmdldEFjdGl2ZUN1c3RvbUVkaXRvckRpZmZDYW5Ub2dnbGVMYXlvdXQoZ3JvdXApLFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMub25EaWRDaGFuZ2VFZGl0b3JUeXBlc1xuXHRcdH07XG5cblx0XHRjb25zdCBjdXN0b21FZGl0b3JUZXh0RGlmZkNvbnRleHRLZXlQcm92aWRlcjogSUVkaXRvckdyb3VwQ29udGV4dEtleVByb3ZpZGVyPGJvb2xlYW4+ID0ge1xuXHRcdFx0Y29udGV4dEtleTogQWN0aXZlQ3VzdG9tRWRpdG9yVGV4dERpZmZDb250ZXh0LFxuXHRcdFx0Z2V0R3JvdXBDb250ZXh0S2V5VmFsdWU6IGdyb3VwID0+IHRoaXMuZ2V0QWN0aXZlQ3VzdG9tRWRpdG9yVGV4dERpZmYoZ3JvdXApLFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMub25EaWRDaGFuZ2VFZGl0b3JUeXBlc1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5yZWdpc3RlckNvbnRleHRLZXlQcm92aWRlcihhY3RpdmVDdXN0b21FZGl0b3JDb250ZXh0S2V5UHJvdmlkZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3VwU2VydmljZS5yZWdpc3RlckNvbnRleHRLZXlQcm92aWRlcihjdXN0b21FZGl0b3JJc0VkaXRhYmxlQ29udGV4dEtleVByb3ZpZGVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucmVnaXN0ZXJDb250ZXh0S2V5UHJvdmlkZXIoY3VzdG9tRWRpdG9yRGlmZkNhblRvZ2dsZUxheW91dENvbnRleHRLZXlQcm92aWRlcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLnJlZ2lzdGVyQ29udGV4dEtleVByb3ZpZGVyKGN1c3RvbUVkaXRvclRleHREaWZmQ29udGV4dEtleVByb3ZpZGVyKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdHZvaWQgdGhpcy51cGRhdGVDdXN0b21EaWZmRWRpdG9yc0ZvckRpZmZDb25maWd1cmF0aW9uQ2hhbmdlKGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGZpbGVTZXJ2aWNlLm9uRGlkUnVuT3BlcmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5NT1ZFKSkge1xuXHRcdFx0XHR0aGlzLmhhbmRsZU1vdmVkRmlsZUluT3BlbmVkRmlsZUVkaXRvcnMoZS5yZXNvdXJjZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuYXNDYW5vbmljYWxVcmkoZS50YXJnZXQucmVzb3VyY2UpKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uREVMRVRFKSkge1xuXHRcdFx0XHR0aGlzLmhhbmRsZURlbGV0ZWRGaWxlKGUucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IFBSSU9SSVRZID0gMTA1O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFVuZG9Db21tYW5kLmFkZEltcGxlbWVudGF0aW9uKFBSSU9SSVRZLCAnY3VzdG9tLWVkaXRvcicsICgpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLndpdGhBY3RpdmVDdXN0b21FZGl0b3IoZWRpdG9yID0+IGVkaXRvci51bmRvKCkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihSZWRvQ29tbWFuZC5hZGRJbXBsZW1lbnRhdGlvbihQUklPUklUWSwgJ2N1c3RvbS1lZGl0b3InLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy53aXRoQWN0aXZlQ3VzdG9tRWRpdG9yKGVkaXRvciA9PiBlZGl0b3IucmVkbygpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXRFZGl0b3JUeXBlcygpOiBJRWRpdG9yVHlwZVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2NvbnRyaWJ1dGVkRWRpdG9yc107XG5cdH1cblxuXHRwcml2YXRlIHdpdGhBY3RpdmVDdXN0b21FZGl0b3IoZjogKGVkaXRvcjogQ3VzdG9tRWRpdG9yVW5kb1JlZG9JbnB1dCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pOiBib29sZWFuIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5nZXRBY3RpdmVDdXN0b21FZGl0b3JVbmRvUmVkb0lucHV0KCk7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZihlZGl0b3IpO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlQ3VzdG9tRWRpdG9yVW5kb1JlZG9JbnB1dCgpOiBDdXN0b21FZGl0b3JVbmRvUmVkb0lucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGlmIChhY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JJbnB1dCB8fCBhY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JEaWZmSW5wdXQgfHwgYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dCkge1xuXHRcdFx0cmV0dXJuIGFjdGl2ZUVkaXRvcjtcblx0XHR9XG5cdFx0aWYgKGFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIERpZmZFZGl0b3JJbnB1dCAmJiBhY3RpdmVFZGl0b3IubW9kaWZpZWQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0KSB7XG5cdFx0XHRyZXR1cm4gYWN0aXZlRWRpdG9yLm1vZGlmaWVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbnRyaWJ1dGlvblBvaW50cygpOiB2b2lkIHtcblx0XHQvLyBDbGVhciBhbGwgcHJldmlvdXMgY29udHJpYnV0aW9ucyB3ZSBrbm93XG5cdFx0dGhpcy5fZWRpdG9yUmVzb2x2ZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Zm9yIChjb25zdCBjb250cmlidXRlZEVkaXRvciBvZiB0aGlzLl9jb250cmlidXRlZEVkaXRvcnMpIHtcblx0XHRcdGZvciAoY29uc3QgZ2xvYlBhdHRlcm4gb2YgY29udHJpYnV0ZWRFZGl0b3Iuc2VsZWN0b3IpIHtcblx0XHRcdFx0aWYgKCFnbG9iUGF0dGVybi5maWxlbmFtZVBhdHRlcm4pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2VkaXRvclJlc29sdmVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0XHRcdGdsb2JQYXR0ZXJuLmZpbGVuYW1lUGF0dGVybixcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZDogY29udHJpYnV0ZWRFZGl0b3IuaWQsXG5cdFx0XHRcdFx0XHRsYWJlbDogY29udHJpYnV0ZWRFZGl0b3IuZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRkZXRhaWw6IGNvbnRyaWJ1dGVkRWRpdG9yLnByb3ZpZGVyRGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRwcmlvcml0eTogY29udHJpYnV0ZWRFZGl0b3IucHJpb3JpdHksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzaW5nbGVQZXJSZXNvdXJjZTogKCkgPT4gISh0aGlzLmdldEN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyhjb250cmlidXRlZEVkaXRvci5pZCk/LnN1cHBvcnRzTXVsdGlwbGVFZGl0b3JzUGVyRG9jdW1lbnQgPz8gZmFsc2UpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIGxhYmVsIH0sIGdyb3VwKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogQ3VzdG9tRWRpdG9ySW5wdXQuY3JlYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgcmVzb3VyY2UsIHZpZXdUeXBlOiBjb250cmlidXRlZEVkaXRvci5pZCwgd2Vidmlld1RpdGxlOiB1bmRlZmluZWQsIHByZWZlcnJlZE5hbWU6IGxhYmVsLCBpY29uUGF0aDogdW5kZWZpbmVkIH0sIGdyb3VwLmlkKSB9O1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGNyZWF0ZVVudGl0bGVkRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0sIGdyb3VwKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogQ3VzdG9tRWRpdG9ySW5wdXQuY3JlYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgcmVzb3VyY2U6IHJlc291cmNlID8/IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBhdXRob3JpdHk6IGBVbnRpdGxlZC0ke3RoaXMuX3VudGl0bGVkQ291bnRlcisrfWAgfSksIHZpZXdUeXBlOiBjb250cmlidXRlZEVkaXRvci5pZCwgd2Vidmlld1RpdGxlOiB1bmRlZmluZWQsIHByZWZlcnJlZE5hbWU6IHVuZGVmaW5lZCwgaWNvblBhdGg6IHVuZGVmaW5lZCB9LCBncm91cC5pZCkgfTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6IGFzeW5jIChkaWZmRWRpdG9ySW5wdXQsIGdyb3VwKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uQ3VzdG9tRWRpdG9yOiR7Y29udHJpYnV0ZWRFZGl0b3IuaWR9YCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogdGhpcy5jcmVhdGVEaWZmRWRpdG9ySW5wdXQoZGlmZkVkaXRvcklucHV0LCBjb250cmlidXRlZEVkaXRvciwgZ3JvdXApIH07XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVEaWZmRWRpdG9ySW5wdXQoXG5cdFx0ZWRpdG9yOiBJUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsXG5cdFx0Y29udHJpYnV0ZWRFZGl0b3I6IEN1c3RvbUVkaXRvckluZm8sXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0KTogRWRpdG9ySW5wdXQge1xuXHRcdGNvbnN0IG9yaWdpbmFsUmVzb3VyY2UgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChlZGl0b3Iub3JpZ2luYWwucmVzb3VyY2UpO1xuXHRcdGNvbnN0IG1vZGlmaWVkUmVzb3VyY2UgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZChlZGl0b3IubW9kaWZpZWQucmVzb3VyY2UpO1xuXHRcdGNvbnN0IGRpZmZFZGl0b3JMYXlvdXQgPSB0aGlzLmdldERpZmZFZGl0b3JMYXlvdXQoY29udHJpYnV0ZWRFZGl0b3IsIG1vZGlmaWVkUmVzb3VyY2UpO1xuXG5cdFx0aWYgKGRpZmZFZGl0b3JMYXlvdXQgPT09IEN1c3RvbUVkaXRvckRpZmZFZGl0b3JMYXlvdXQuSW5saW5lKSB7XG5cdFx0XHRyZXR1cm4gQ3VzdG9tRWRpdG9yRGlmZklucHV0LmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRcdG9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdG1vZGlmaWVkUmVzb3VyY2UsXG5cdFx0XHRcdHZpZXdUeXBlOiBjb250cmlidXRlZEVkaXRvci5pZCxcblx0XHRcdFx0bGFiZWw6IGVkaXRvci5sYWJlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGVkaXRvci5kZXNjcmlwdGlvbixcblx0XHRcdFx0aWNvblBhdGg6IHVuZGVmaW5lZFxuXHRcdFx0fSwgZ3JvdXApO1xuXHRcdH1cblxuXHRcdGlmIChkaWZmRWRpdG9yTGF5b3V0ID09PSBDdXN0b21FZGl0b3JEaWZmRWRpdG9yTGF5b3V0LlNpZGVCeVNpZGUpIHtcblx0XHRcdGNvbnN0IGRpZmZJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxPdmVycmlkZSA9IEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXQuY3JlYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHtcblx0XHRcdFx0b3JpZ2luYWxSZXNvdXJjZSxcblx0XHRcdFx0bW9kaWZpZWRSZXNvdXJjZSxcblx0XHRcdFx0dmlld1R5cGU6IGNvbnRyaWJ1dGVkRWRpdG9yLmlkLFxuXHRcdFx0XHRkaWZmSWQsXG5cdFx0XHRcdHNpZGU6ICdvcmlnaW5hbCcsXG5cdFx0XHRcdGxhYmVsOiBlZGl0b3IubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBlZGl0b3IuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGljb25QYXRoOiB1bmRlZmluZWRcblx0XHRcdH0sIGdyb3VwKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkT3ZlcnJpZGUgPSBDdXN0b21FZGl0b3JTaWRlQnlTaWRlRGlmZklucHV0LmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRcdG9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdG1vZGlmaWVkUmVzb3VyY2UsXG5cdFx0XHRcdHZpZXdUeXBlOiBjb250cmlidXRlZEVkaXRvci5pZCxcblx0XHRcdFx0ZGlmZklkLFxuXHRcdFx0XHRzaWRlOiAnbW9kaWZpZWQnLFxuXHRcdFx0XHRsYWJlbDogZWRpdG9yLmxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZWRpdG9yLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRpY29uUGF0aDogdW5kZWZpbmVkXG5cdFx0XHR9LCBncm91cCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9ySW5wdXQsIGVkaXRvci5sYWJlbCwgZWRpdG9yLmRlc2NyaXB0aW9uLCBvcmlnaW5hbE92ZXJyaWRlLCBtb2RpZmllZE92ZXJyaWRlLCB0cnVlKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RpZmllZE92ZXJyaWRlID0gQ3VzdG9tRWRpdG9ySW5wdXQuY3JlYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgcmVzb3VyY2U6IG1vZGlmaWVkUmVzb3VyY2UsIHZpZXdUeXBlOiBjb250cmlidXRlZEVkaXRvci5pZCwgd2Vidmlld1RpdGxlOiB1bmRlZmluZWQsIHByZWZlcnJlZE5hbWU6IHVuZGVmaW5lZCwgaWNvblBhdGg6IHVuZGVmaW5lZCB9LCBncm91cC5pZCwgeyBjdXN0b21DbGFzc2VzOiAnbW9kaWZpZWQnIH0pO1xuXHRcdGNvbnN0IG9yaWdpbmFsT3ZlcnJpZGUgPSBDdXN0b21FZGl0b3JJbnB1dC5jcmVhdGUodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgeyByZXNvdXJjZTogb3JpZ2luYWxSZXNvdXJjZSwgdmlld1R5cGU6IGNvbnRyaWJ1dGVkRWRpdG9yLmlkLCB3ZWJ2aWV3VGl0bGU6IHVuZGVmaW5lZCwgcHJlZmVycmVkTmFtZTogdW5kZWZpbmVkLCBpY29uUGF0aDogdW5kZWZpbmVkIH0sIGdyb3VwLmlkLCB7IGN1c3RvbUNsYXNzZXM6ICdvcmlnaW5hbCcgfSk7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlmZkVkaXRvcklucHV0LCBlZGl0b3IubGFiZWwsIGVkaXRvci5kZXNjcmlwdGlvbiwgb3JpZ2luYWxPdmVycmlkZSwgbW9kaWZpZWRPdmVycmlkZSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldERpZmZFZGl0b3JMYXlvdXQoY29udHJpYnV0ZWRFZGl0b3I6IEN1c3RvbUVkaXRvckluZm8sIG1vZGlmaWVkUmVzb3VyY2U6IFVSSSk6IEN1c3RvbUVkaXRvckRpZmZFZGl0b3JMYXlvdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IHRoaXMuZ2V0Q3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzKGNvbnRyaWJ1dGVkRWRpdG9yLmlkKTtcblx0XHRjb25zdCBzdXBwb3J0c0lubGluZURpZmYgPSBjYXBhYmlsaXRpZXM/LnN1cHBvcnRzSW5saW5lRGlmZiA9PT0gdHJ1ZTtcblx0XHRjb25zdCBzdXBwb3J0c1NpZGVCeVNpZGVEaWZmID0gY2FwYWJpbGl0aWVzPy5zdXBwb3J0c1NpZGVCeVNpZGVEaWZmID09PSB0cnVlO1xuXG5cdFx0aWYgKHN1cHBvcnRzSW5saW5lRGlmZiAmJiBzdXBwb3J0c1NpZGVCeVNpZGVEaWZmKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihtb2RpZmllZFJlc291cmNlLCAnZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJykgPyBDdXN0b21FZGl0b3JEaWZmRWRpdG9yTGF5b3V0LlNpZGVCeVNpZGUgOiBDdXN0b21FZGl0b3JEaWZmRWRpdG9yTGF5b3V0LklubGluZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwcG9ydHNJbmxpbmVEaWZmID8gQ3VzdG9tRWRpdG9yRGlmZkVkaXRvckxheW91dC5JbmxpbmUgOiBzdXBwb3J0c1NpZGVCeVNpZGVEaWZmID8gQ3VzdG9tRWRpdG9yRGlmZkVkaXRvckxheW91dC5TaWRlQnlTaWRlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVDdXN0b21EaWZmRWRpdG9yc0ZvckRpZmZDb25maWd1cmF0aW9uQ2hhbmdlKGU6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcykge1xuXHRcdFx0Y29uc3QgcmVwbGFjZW1lbnRzOiBJVW50eXBlZEVkaXRvclJlcGxhY2VtZW50W10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmVkaXRvcnMpIHtcblx0XHRcdFx0Y29uc3QgZGlmZkluZm8gPSB0aGlzLmdldEN1c3RvbUVkaXRvckRpZmZJbnB1dEluZm8oZWRpdG9yKTtcblx0XHRcdFx0Y29uc3QgY29udHJpYnV0ZWRFZGl0b3IgPSBkaWZmSW5mbyA/IHRoaXMuX2NvbnRyaWJ1dGVkRWRpdG9ycy5nZXQoZGlmZkluZm8udmlld1R5cGUpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoIWRpZmZJbmZvXG5cdFx0XHRcdFx0fHwgIWNvbnRyaWJ1dGVkRWRpdG9yXG5cdFx0XHRcdFx0fHwgIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZGlmZkluZm8ubW9kaWZpZWRSZXNvdXJjZSwgJ2RpZmZFZGl0b3IucmVuZGVyU2lkZUJ5U2lkZScpXG5cdFx0XHRcdFx0fHwgIXRoaXMuZ2V0Q3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzKGNvbnRyaWJ1dGVkRWRpdG9yLmlkKT8uc3VwcG9ydHNJbmxpbmVEaWZmXG5cdFx0XHRcdFx0fHwgIXRoaXMuZ2V0Q3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzKGNvbnRyaWJ1dGVkRWRpdG9yLmlkKT8uc3VwcG9ydHNTaWRlQnlTaWRlRGlmZlxuXHRcdFx0XHRcdHx8IHRoaXMuZ2V0RGlmZkVkaXRvckxheW91dChjb250cmlidXRlZEVkaXRvciwgZGlmZkluZm8ubW9kaWZpZWRSZXNvdXJjZSkgPT09IGRpZmZJbmZvLmxheW91dCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVwbGFjZW1lbnRzLnB1c2goe1xuXHRcdFx0XHRcdGVkaXRvcixcblx0XHRcdFx0XHRyZXBsYWNlbWVudDoge1xuXHRcdFx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IGRpZmZJbmZvLm9yaWdpbmFsUmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBkaWZmSW5mby5tb2RpZmllZFJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRsYWJlbDogZWRpdG9yLmdldE5hbWUoKSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBlZGl0b3IuZ2V0RGVzY3JpcHRpb24oKSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0b3ZlcnJpZGU6IGRpZmZJbmZvLnZpZXdUeXBlLFxuXHRcdFx0XHRcdFx0XHRwaW5uZWQ6IGdyb3VwLmlzUGlubmVkKGVkaXRvciksXG5cdFx0XHRcdFx0XHRcdHN0aWNreTogZ3JvdXAuaXNTdGlja3koZWRpdG9yKSxcblx0XHRcdFx0XHRcdFx0cHJlc2VydmVGb2N1czogZ3JvdXAuYWN0aXZlRWRpdG9yICE9PSBlZGl0b3IsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlcGxhY2VtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLnJlcGxhY2VFZGl0b3JzKHJlcGxhY2VtZW50cywgZ3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VzdG9tRWRpdG9yRGlmZklucHV0SW5mbyhpbnB1dDogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQpOiBDdXN0b21FZGl0b3JEaWZmSW5wdXRJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBDdXN0b21FZGl0b3JEaWZmSW5wdXQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHZpZXdUeXBlOiBpbnB1dC52aWV3VHlwZSxcblx0XHRcdFx0b3JpZ2luYWxSZXNvdXJjZTogaW5wdXQub3JpZ2luYWxSZXNvdXJjZSxcblx0XHRcdFx0bW9kaWZpZWRSZXNvdXJjZTogaW5wdXQubW9kaWZpZWRSZXNvdXJjZSxcblx0XHRcdFx0bGF5b3V0OiBDdXN0b21FZGl0b3JEaWZmRWRpdG9yTGF5b3V0LklubGluZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0XG5cdFx0XHQmJiBpbnB1dC5vcmlnaW5hbCBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmSW5wdXRcblx0XHRcdCYmIGlucHV0Lm1vZGlmaWVkIGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbnB1dFxuXHRcdFx0JiYgaW5wdXQub3JpZ2luYWwuc2lkZSA9PT0gJ29yaWdpbmFsJ1xuXHRcdFx0JiYgaW5wdXQubW9kaWZpZWQuc2lkZSA9PT0gJ21vZGlmaWVkJ1xuXHRcdFx0JiYgaW5wdXQub3JpZ2luYWwudmlld1R5cGUgPT09IGlucHV0Lm1vZGlmaWVkLnZpZXdUeXBlXG5cdFx0XHQmJiBpbnB1dC5vcmlnaW5hbC5kaWZmSWQgPT09IGlucHV0Lm1vZGlmaWVkLmRpZmZJZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dmlld1R5cGU6IGlucHV0Lm9yaWdpbmFsLnZpZXdUeXBlLFxuXHRcdFx0XHRvcmlnaW5hbFJlc291cmNlOiBpbnB1dC5vcmlnaW5hbC5vcmlnaW5hbFJlc291cmNlLFxuXHRcdFx0XHRtb2RpZmllZFJlc291cmNlOiBpbnB1dC5vcmlnaW5hbC5tb2RpZmllZFJlc291cmNlLFxuXHRcdFx0XHRsYXlvdXQ6IEN1c3RvbUVkaXRvckRpZmZFZGl0b3JMYXlvdXQuU2lkZUJ5U2lkZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbW9kZWxzKCkgeyByZXR1cm4gdGhpcy5fbW9kZWxzOyB9XG5cblx0cHVibGljIGdldEN1c3RvbUVkaXRvcih2aWV3VHlwZTogc3RyaW5nKTogQ3VzdG9tRWRpdG9ySW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRyaWJ1dGVkRWRpdG9ycy5nZXQodmlld1R5cGUpO1xuXHR9XG5cblx0cHVibGljIGdldENvbnRyaWJ1dGVkQ3VzdG9tRWRpdG9ycyhyZXNvdXJjZTogVVJJKTogQ3VzdG9tRWRpdG9ySW5mb0NvbGxlY3Rpb24ge1xuXHRcdHJldHVybiBuZXcgQ3VzdG9tRWRpdG9ySW5mb0NvbGxlY3Rpb24odGhpcy5fY29udHJpYnV0ZWRFZGl0b3JzLmdldENvbnRyaWJ1dGVkRWRpdG9ycyhyZXNvdXJjZSkpO1xuXHR9XG5cblx0cHVibGljIGdldFVzZXJDb25maWd1cmVkQ3VzdG9tRWRpdG9ycyhyZXNvdXJjZTogVVJJKTogQ3VzdG9tRWRpdG9ySW5mb0NvbGxlY3Rpb24ge1xuXHRcdGNvbnN0IHJlc291cmNlQXNzb2NhdGlvbnMgPSB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZS5nZXRBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZShyZXNvdXJjZSk7XG5cdFx0cmV0dXJuIG5ldyBDdXN0b21FZGl0b3JJbmZvQ29sbGVjdGlvbihcblx0XHRcdGNvYWxlc2NlKHJlc291cmNlQXNzb2NhdGlvbnNcblx0XHRcdFx0Lm1hcChhc3NvY2lhdGlvbiA9PiB0aGlzLl9jb250cmlidXRlZEVkaXRvcnMuZ2V0KGFzc29jaWF0aW9uLnZpZXdUeXBlKSkpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBbGxDdXN0b21FZGl0b3JzKHJlc291cmNlOiBVUkkpOiBDdXN0b21FZGl0b3JJbmZvQ29sbGVjdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyBDdXN0b21FZGl0b3JJbmZvQ29sbGVjdGlvbihbXG5cdFx0XHQuLi50aGlzLmdldFVzZXJDb25maWd1cmVkQ3VzdG9tRWRpdG9ycyhyZXNvdXJjZSkuYWxsRWRpdG9ycyxcblx0XHRcdC4uLnRoaXMuZ2V0Q29udHJpYnV0ZWRDdXN0b21FZGl0b3JzKHJlc291cmNlKS5hbGxFZGl0b3JzLFxuXHRcdF0pO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyQ3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzKHZpZXdUeXBlOiBzdHJpbmcsIG9wdGlvbnM6IEN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fZWRpdG9yQ2FwYWJpbGl0aWVzLmhhcyh2aWV3VHlwZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2FwYWJpbGl0aWVzIGZvciAke3ZpZXdUeXBlfSBhbHJlYWR5IHNldGApO1xuXHRcdH1cblx0XHR0aGlzLl9lZGl0b3JDYXBhYmlsaXRpZXMuc2V0KHZpZXdUeXBlLCBvcHRpb25zKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVkaXRvclR5cGVzLmZpcmUoKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2VkaXRvckNhcGFiaWxpdGllcy5kZWxldGUodmlld1R5cGUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JUeXBlcy5maXJlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzKHZpZXdUeXBlOiBzdHJpbmcpOiBDdXN0b21FZGl0b3JDYXBhYmlsaXRpZXMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JDYXBhYmlsaXRpZXMuZ2V0KHZpZXdUeXBlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlQ3VzdG9tRWRpdG9ySWQoZ3JvdXA6IElFZGl0b3JHcm91cCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGdyb3VwLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0Y29uc3QgaW5wdXQgPSBhY3RpdmVFZGl0b3JQYW5lPy5pbnB1dDtcblx0XHRjb25zdCBkaWZmSW5mbyA9IHRoaXMuZ2V0Q3VzdG9tRWRpdG9yRGlmZklucHV0SW5mbyhpbnB1dCk7XG5cdFx0aWYgKGRpZmZJbmZvKSB7XG5cdFx0XHRyZXR1cm4gZGlmZkluZm8udmlld1R5cGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXQgJiYgaW5wdXQucmVzb3VyY2UgPyBpbnB1dC52aWV3VHlwZSA6ICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3RpdmVDdXN0b21FZGl0b3JEaWZmQ2FuVG9nZ2xlTGF5b3V0KGdyb3VwOiBJRWRpdG9yR3JvdXApOiBib29sZWFuIHtcblx0XHRjb25zdCBkaWZmSW5mbyA9IHRoaXMuZ2V0Q3VzdG9tRWRpdG9yRGlmZklucHV0SW5mbyhncm91cC5hY3RpdmVFZGl0b3JQYW5lPy5pbnB1dCk7XG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gZGlmZkluZm8gPyB0aGlzLmdldEN1c3RvbUVkaXRvckNhcGFiaWxpdGllcyhkaWZmSW5mby52aWV3VHlwZSkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIGNhcGFiaWxpdGllcz8uc3VwcG9ydHNJbmxpbmVEaWZmID09PSB0cnVlICYmIGNhcGFiaWxpdGllcy5zdXBwb3J0c1NpZGVCeVNpZGVEaWZmID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3RpdmVDdXN0b21FZGl0b3JUZXh0RGlmZihncm91cDogSUVkaXRvckdyb3VwKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZGlmZkluZm8gPSB0aGlzLmdldEN1c3RvbUVkaXRvckRpZmZJbnB1dEluZm8oZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uaW5wdXQpO1xuXHRcdHJldHVybiAhIWRpZmZJbmZvICYmIHRoaXMuZ2V0Q3VzdG9tRWRpdG9yQ2FwYWJpbGl0aWVzKGRpZmZJbmZvLnZpZXdUeXBlKT8uaXNUZXh0RWRpdG9yID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXN0b21FZGl0b3JJc0VkaXRhYmxlKGdyb3VwOiBJRWRpdG9yR3JvdXApOiBib29sZWFuIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRjb25zdCByZXNvdXJjZSA9IGFjdGl2ZUVkaXRvclBhbmU/LmlucHV0Py5yZXNvdXJjZTtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGl2ZUVkaXRvclBhbmU/LmlucHV0IGluc3RhbmNlb2YgQ3VzdG9tRWRpdG9ySW5wdXQ7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZURlbGV0ZWRGaWxlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHQvLyBEaXNwb3NlIGFsbCBjdXN0b20gZWRpdG9yIG1vZGVscyBhc3NvY2lhdGVkIHdpdGggdGhlIGRlbGV0ZWQgcmVzb3VyY2Vcblx0XHQvLyB0byBwcmV2ZW50IHN0YWxlIHJlZmVyZW5jZXMgdGhhdCBjYW4gY2F1c2UgaXNzdWVzIHdoZW4gcmVjcmVhdGluZyBmaWxlcyB3aXRoIHRoZSBzYW1lIG5hbWVcblx0XHR0aGlzLl9tb2RlbHMuZGlzcG9zZUFsbE1vZGVsc0ZvclJlc291cmNlKHJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlTW92ZWRGaWxlSW5PcGVuZWRGaWxlRWRpdG9ycyhvbGRSZXNvdXJjZTogVVJJLCBuZXdSZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGV4dG5hbWUob2xkUmVzb3VyY2UpLnRvTG93ZXJDYXNlKCkgPT09IGV4dG5hbWUobmV3UmVzb3VyY2UpLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NzaWJsZUVkaXRvcnMgPSB0aGlzLmdldEFsbEN1c3RvbUVkaXRvcnMobmV3UmVzb3VyY2UpO1xuXG5cdFx0Ly8gU2VlIGlmIHdlIGhhdmUgYW55IG5vbi1vcHRpb25hbCBjdXN0b20gZWRpdG9yIGZvciB0aGlzIHJlc291cmNlXG5cdFx0aWYgKCFwb3NzaWJsZUVkaXRvcnMuYWxsRWRpdG9ycy5zb21lKGVkaXRvciA9PiBlZGl0b3IucHJpb3JpdHkuZWRpdG9yICE9PSBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHNvLCBjaGVjayBhbGwgZWRpdG9ycyB0byBzZWUgaWYgdGhlcmUgYXJlIGFueSBmaWxlIGVkaXRvcnMgb3BlbiBmb3IgdGhlIG5ldyByZXNvdXJjZVxuXHRcdGNvbnN0IGVkaXRvcnNUb1JlcGxhY2UgPSBuZXcgTWFwPEdyb3VwSWRlbnRpZmllciwgRWRpdG9ySW5wdXRbXT4oKTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmdyb3Vwcykge1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZ3JvdXAuZWRpdG9ycykge1xuXHRcdFx0XHRpZiAodGhpcy5fZmlsZUVkaXRvckZhY3RvcnkuaXNGaWxlRWRpdG9yKGVkaXRvcilcblx0XHRcdFx0XHQmJiAhKGVkaXRvciBpbnN0YW5jZW9mIEN1c3RvbUVkaXRvcklucHV0KVxuXHRcdFx0XHRcdCYmIGlzRXF1YWwoZWRpdG9yLnJlc291cmNlLCBuZXdSZXNvdXJjZSlcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0bGV0IGVudHJ5ID0gZWRpdG9yc1RvUmVwbGFjZS5nZXQoZ3JvdXAuaWQpO1xuXHRcdFx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0XHRcdGVudHJ5ID0gW107XG5cdFx0XHRcdFx0XHRlZGl0b3JzVG9SZXBsYWNlLnNldChncm91cC5pZCwgZW50cnkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbnRyeS5wdXNoKGVkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWVkaXRvcnNUb1JlcGxhY2Uuc2l6ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgW2dyb3VwLCBlbnRyaWVzXSBvZiBlZGl0b3JzVG9SZXBsYWNlKSB7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2UucmVwbGFjZUVkaXRvcnMoZW50cmllcy5tYXAoZWRpdG9yID0+IHtcblx0XHRcdFx0bGV0IHJlcGxhY2VtZW50OiBFZGl0b3JJbnB1dCB8IElSZXNvdXJjZUVkaXRvcklucHV0O1xuXHRcdFx0XHRpZiAocG9zc2libGVFZGl0b3JzLmRlZmF1bHRFZGl0b3IpIHtcblx0XHRcdFx0XHRjb25zdCB2aWV3VHlwZSA9IHBvc3NpYmxlRWRpdG9ycy5kZWZhdWx0RWRpdG9yLmlkO1xuXHRcdFx0XHRcdHJlcGxhY2VtZW50ID0gQ3VzdG9tRWRpdG9ySW5wdXQuY3JlYXRlKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHsgcmVzb3VyY2U6IG5ld1Jlc291cmNlLCB2aWV3VHlwZSwgd2Vidmlld1RpdGxlOiB1bmRlZmluZWQsIHByZWZlcnJlZE5hbWU6IHVuZGVmaW5lZCwgaWNvblBhdGg6IHVuZGVmaW5lZCB9LCBncm91cCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVwbGFjZW1lbnQgPSB7IHJlc291cmNlOiBuZXdSZXNvdXJjZSwgb3B0aW9uczogeyBvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQgfSB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdFx0cmVwbGFjZW1lbnQsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJlc2VydmVGb2N1czogdHJ1ZSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHR9KSwgZ3JvdXApO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQThCLG9CQUFvQjtBQUN2RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYSxtQkFBbUI7QUFDekMsU0FBZ0QseUNBQXlDO0FBRXpGLFNBQVMsZUFBZSxvQkFBb0I7QUFDNUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBNEIsd0JBQTJGO0FBQ2hJLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsOENBQThDLHlDQUF5QztBQUNoRyxTQUFTLGlDQUFpQywyQ0FBcUUsOEJBQWdELGtDQUFtRjtBQUNsUCxTQUFTLGdDQUFnQztBQUN6QyxTQUF1RCw0QkFBNEI7QUFDbkYsU0FBUyx3QkFBcUMsZ0NBQWdDO0FBQzlFLFNBQVMsc0JBQWlEO0FBQzFELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUJBQXVCLHVDQUF1QztBQUN2RSxTQUFTLHlCQUF5QjtBQVczQixJQUFNLHNCQUFOLGNBQWtDLFdBQTJDO0FBQUEsRUFlbkYsWUFDZSxhQUNHLGdCQUNnQixlQUNNLG9CQUNDLHNCQUNGLG9CQUNHLHVCQUNXLGtDQUNoQixr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
