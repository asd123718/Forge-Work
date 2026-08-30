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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { ResourceMap, ResourceSet } from "../../../../base/common/map.js";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { IBulkEditService, ResourceFileEdit, ResourceTextEdit } from "../../../../editor/browser/services/bulkEditService.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { UndoRedoGroup } from "../../../../platform/undoRedo/common/undoRedo.js";
import { BulkCellEdits, ResourceNotebookCellEdit } from "./bulkCellEdits.js";
import { BulkFileEdits } from "./bulkFileEdits.js";
import { BulkTextEdits } from "./bulkTextEdits.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ILifecycleService, ShutdownReason } from "../../../services/lifecycle/common/lifecycle.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { OpaqueEdits, ResourceAttachmentEdit } from "./opaqueEdits.js";
import { isMacintosh } from "../../../../base/common/platform.js";
function liftEdits(edits) {
  return edits.map((edit) => {
    if (ResourceTextEdit.is(edit)) {
      return ResourceTextEdit.lift(edit);
    }
    if (ResourceFileEdit.is(edit)) {
      return ResourceFileEdit.lift(edit);
    }
    if (ResourceNotebookCellEdit.is(edit)) {
      return ResourceNotebookCellEdit.lift(edit);
    }
    if (ResourceAttachmentEdit.is(edit)) {
      return ResourceAttachmentEdit.lift(edit);
    }
    throw new Error("Unsupported edit");
  });
}
let BulkEdit = class {
  constructor(_label, _code, _editor, _progress, _token, _edits, _undoRedoGroup, _undoRedoSource, _confirmBeforeUndo, _instaService, _logService) {
    this._label = _label;
    this._code = _code;
    this._editor = _editor;
    this._progress = _progress;
    this._token = _token;
    this._edits = _edits;
    this._undoRedoGroup = _undoRedoGroup;
    this._undoRedoSource = _undoRedoSource;
    this._confirmBeforeUndo = _confirmBeforeUndo;
    this._instaService = _instaService;
    this._logService = _logService;
  }
  ariaMessage() {
    const otherResources = new ResourceMap();
    const textEditResources = new ResourceMap();
    let textEditCount = 0;
    for (const edit of this._edits) {
      if (edit instanceof ResourceTextEdit) {
        textEditCount += 1;
        textEditResources.set(edit.resource, true);
      } else if (edit instanceof ResourceFileEdit) {
        otherResources.set(edit.oldResource ?? edit.newResource, true);
      }
    }
    if (this._edits.length === 0) {
      return localize("summary.0", "Made no edits");
    } else if (otherResources.size === 0) {
      if (textEditCount > 1 && textEditResources.size > 1) {
        return localize("summary.nm", "Made {0} text edits in {1} files", textEditCount, textEditResources.size);
      } else {
        return localize("summary.n0", "Made {0} text edits in one file", textEditCount);
      }
    } else {
      return localize("summary.textFiles", "Made {0} text edits in {1} files, also created or deleted {2} files", textEditCount, textEditResources.size, otherResources.size);
    }
  }
  async perform(reason) {
    if (this._edits.length === 0) {
      return [];
    }
    const ranges = [1];
    for (let i = 1; i < this._edits.length; i++) {
      if (Object.getPrototypeOf(this._edits[i - 1]) === Object.getPrototypeOf(this._edits[i])) {
        ranges[ranges.length - 1]++;
      } else {
        ranges.push(1);
      }
    }
    const increment = this._edits.length > 1 ? 0 : void 0;
    this._progress.report({ increment, total: 100 });
    const progress = { report: (_) => this._progress.report({ increment: 100 / this._edits.length }) };
    const resources = [];
    let index = 0;
    for (const range of ranges) {
      if (this._token.isCancellationRequested) {
        break;
      }
      const group = this._edits.slice(index, index + range);
      if (group[0] instanceof ResourceFileEdit) {
        resources.push(await this._performFileEdits(group, this._undoRedoGroup, this._undoRedoSource, this._confirmBeforeUndo, progress));
      } else if (group[0] instanceof ResourceTextEdit) {
        resources.push(await this._performTextEdits(group, this._undoRedoGroup, this._undoRedoSource, progress, reason));
      } else if (group[0] instanceof ResourceNotebookCellEdit) {
        resources.push(await this._performCellEdits(group, this._undoRedoGroup, this._undoRedoSource, progress));
      } else if (group[0] instanceof ResourceAttachmentEdit) {
        resources.push(await this._performOpaqueEdits(group, this._undoRedoGroup, this._undoRedoSource, progress));
      } else {
        console.log("UNKNOWN EDIT");
      }
      index = index + range;
    }
    return resources.flat();
  }
  async _performFileEdits(edits, undoRedoGroup, undoRedoSource, confirmBeforeUndo, progress) {
    this._logService.debug("_performFileEdits", JSON.stringify(edits));
    const model = this._instaService.createInstance(BulkFileEdits, this._label || localize("workspaceEdit", "Workspace Edit"), this._code || "undoredo.workspaceEdit", undoRedoGroup, undoRedoSource, confirmBeforeUndo, progress, this._token, edits);
    return await model.apply();
  }
  async _performTextEdits(edits, undoRedoGroup, undoRedoSource, progress, reason) {
    this._logService.debug("_performTextEdits", JSON.stringify(edits));
    const model = this._instaService.createInstance(BulkTextEdits, this._label || localize("workspaceEdit", "Workspace Edit"), this._code || "undoredo.workspaceEdit", this._editor, undoRedoGroup, undoRedoSource, progress, this._token, edits);
    return await model.apply(reason);
  }
  async _performCellEdits(edits, undoRedoGroup, undoRedoSource, progress) {
    this._logService.debug("_performCellEdits", JSON.stringify(edits));
    const model = this._instaService.createInstance(BulkCellEdits, undoRedoGroup, undoRedoSource, progress, this._token, edits);
    return await model.apply();
  }
  async _performOpaqueEdits(edits, undoRedoGroup, undoRedoSource, progress) {
    this._logService.debug("_performOpaqueEdits", JSON.stringify(edits));
    const model = this._instaService.createInstance(OpaqueEdits, undoRedoGroup, undoRedoSource, progress, this._token, edits);
    return await model.apply();
  }
};
BulkEdit = __decorateClass([
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, ILogService)
], BulkEdit);
let BulkEditService = class {
  constructor(_instaService, _logService, _editorService, _lifecycleService, _dialogService, _workingCopyService, _configService) {
    this._instaService = _instaService;
    this._logService = _logService;
    this._editorService = _editorService;
    this._lifecycleService = _lifecycleService;
    this._dialogService = _dialogService;
    this._workingCopyService = _workingCopyService;
    this._configService = _configService;
    this._activeUndoRedoGroups = new LinkedList();
  }
  setPreviewHandler(handler) {
    this._previewHandler = handler;
    return toDisposable(() => {
      if (this._previewHandler === handler) {
        this._previewHandler = void 0;
      }
    });
  }
  hasPreviewHandler() {
    return Boolean(this._previewHandler);
  }
  async apply(editsIn, options) {
    let edits = liftEdits(Array.isArray(editsIn) ? editsIn : editsIn.edits);
    if (edits.length === 0) {
      return { ariaSummary: localize("nothing", "Made no edits"), isApplied: false };
    }
    if (this._previewHandler && (options?.showPreview || edits.some((value) => value.metadata?.needsConfirmation))) {
      edits = await this._previewHandler(edits, options);
    }
    let codeEditor = options?.editor;
    if (!codeEditor) {
      const candidate = this._editorService.activeTextEditorControl;
      if (isCodeEditor(candidate)) {
        codeEditor = candidate;
      } else if (isDiffEditor(candidate)) {
        codeEditor = candidate.getModifiedEditor();
      }
    }
    if (codeEditor && codeEditor.getOption(EditorOption.readOnly)) {
      codeEditor = void 0;
    }
    let undoRedoGroup;
    let undoRedoGroupRemove = () => {
    };
    if (typeof options?.undoRedoGroupId === "number") {
      for (const candidate of this._activeUndoRedoGroups) {
        if (candidate.id === options.undoRedoGroupId) {
          undoRedoGroup = candidate;
          break;
        }
      }
    }
    if (!undoRedoGroup) {
      undoRedoGroup = new UndoRedoGroup();
      undoRedoGroupRemove = this._activeUndoRedoGroups.push(undoRedoGroup);
    }
    const label = options?.quotableLabel || options?.label;
    const bulkEdit = this._instaService.createInstance(
      BulkEdit,
      label,
      options?.code,
      codeEditor,
      options?.progress ?? Progress.None,
      options?.token ?? CancellationToken.None,
      edits,
      undoRedoGroup,
      options?.undoRedoSource,
      !!options?.confirmBeforeUndo
    );
    let listener;
    try {
      listener = this._lifecycleService.onBeforeShutdown((e) => e.veto(this._shouldVeto(label, e.reason), "veto.blukEditService"));
      const resources = await bulkEdit.perform(options?.reason);
      if (options?.respectAutoSaveConfig && this._configService.getValue(autoSaveSetting) === true && resources.length > 1) {
        await this._saveAll(resources);
      }
      return { ariaSummary: bulkEdit.ariaMessage(), isApplied: edits.length > 0 };
    } catch (err) {
      this._logService.error(err);
      throw err;
    } finally {
      listener?.dispose();
      undoRedoGroupRemove();
    }
  }
  async _saveAll(resources) {
    const set = new ResourceSet(resources);
    const saves = this._workingCopyService.dirtyWorkingCopies.map(async (copy) => {
      if (set.has(copy.resource)) {
        await copy.save();
      }
    });
    const result = await Promise.allSettled(saves);
    for (const item of result) {
      if (item.status === "rejected") {
        this._logService.warn(item.reason);
      }
    }
  }
  async _shouldVeto(label, reason) {
    let message;
    switch (reason) {
      case ShutdownReason.CLOSE:
        message = localize("closeTheWindow.message", "Are you sure you want to close the window?");
        break;
      case ShutdownReason.LOAD:
        message = localize("changeWorkspace.message", "Are you sure you want to change the workspace?");
        break;
      case ShutdownReason.RELOAD:
        message = localize("reloadTheWindow.message", "Are you sure you want to reload the window?");
        break;
      default:
        message = isMacintosh ? localize("quitMessageMac", "Are you sure you want to quit?") : localize("quitMessage", "Are you sure you want to exit?");
        break;
    }
    const result = await this._dialogService.confirm({
      message,
      detail: localize("areYouSureQuiteBulkEdit.detail", "'{0}' is in progress.", label || localize("fileOperation", "File operation"))
    });
    return !result.confirmed;
  }
};
BulkEditService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IWorkingCopyService),
  __decorateParam(6, IConfigurationService)
], BulkEditService);
registerSingleton(IBulkEditService, BulkEditService, InstantiationType.Delayed);
const autoSaveSetting = "files.refactoring.autoSave";
Registry.as(Extensions.Configuration).registerConfiguration({
  id: "files",
  properties: {
    [autoSaveSetting]: {
      description: localize("refactoring.autoSave", "Controls if files that were part of a refactoring are saved automatically"),
      default: true,
      type: "boolean"
    }
  }
});
export {
  BulkEditService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJ1bGtFZGl0XFxicm93c2VyXFxidWxrRWRpdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciwgaXNEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRPcHRpb25zLCBJQnVsa0VkaXRQcmV2aWV3SGFuZGxlciwgSUJ1bGtFZGl0UmVzdWx0LCBJQnVsa0VkaXRTZXJ2aWNlLCBSZXNvdXJjZUVkaXQsIFJlc291cmNlRmlsZUVkaXQsIFJlc291cmNlVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MsIElQcm9ncmVzc1N0ZXAsIFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVuZG9SZWRvR3JvdXAsIFVuZG9SZWRvU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IEJ1bGtDZWxsRWRpdHMsIFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdCB9IGZyb20gJy4vYnVsa0NlbGxFZGl0cy5qcyc7XG5pbXBvcnQgeyBCdWxrRmlsZUVkaXRzIH0gZnJvbSAnLi9idWxrRmlsZUVkaXRzLmpzJztcbmltcG9ydCB7IEJ1bGtUZXh0RWRpdHMgfSBmcm9tICcuL2J1bGtUZXh0RWRpdHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIFNodXRkb3duUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgT3BhcXVlRWRpdHMsIFJlc291cmNlQXR0YWNobWVudEVkaXQgfSBmcm9tICcuL29wYXF1ZUVkaXRzLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbEVkaXRTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmZ1bmN0aW9uIGxpZnRFZGl0cyhlZGl0czogUmVzb3VyY2VFZGl0W10pOiBSZXNvdXJjZUVkaXRbXSB7XG5cdHJldHVybiBlZGl0cy5tYXAoZWRpdCA9PiB7XG5cdFx0aWYgKFJlc291cmNlVGV4dEVkaXQuaXMoZWRpdCkpIHtcblx0XHRcdHJldHVybiBSZXNvdXJjZVRleHRFZGl0LmxpZnQoZWRpdCk7XG5cdFx0fVxuXHRcdGlmIChSZXNvdXJjZUZpbGVFZGl0LmlzKGVkaXQpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb3VyY2VGaWxlRWRpdC5saWZ0KGVkaXQpO1xuXHRcdH1cblx0XHRpZiAoUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0LmlzKGVkaXQpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0LmxpZnQoZWRpdCk7XG5cdFx0fVxuXG5cdFx0aWYgKFJlc291cmNlQXR0YWNobWVudEVkaXQuaXMoZWRpdCkpIHtcblx0XHRcdHJldHVybiBSZXNvdXJjZUF0dGFjaG1lbnRFZGl0LmxpZnQoZWRpdCk7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdVbnN1cHBvcnRlZCBlZGl0Jyk7XG5cdH0pO1xufVxuXG5jbGFzcyBCdWxrRWRpdCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0czogUmVzb3VyY2VFZGl0W10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9Hcm91cDogVW5kb1JlZG9Hcm91cCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb1NvdXJjZTogVW5kb1JlZG9Tb3VyY2UgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlybUJlZm9yZVVuZG86IGJvb2xlYW4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXG5cdH1cblxuXHRhcmlhTWVzc2FnZSgpOiBzdHJpbmcge1xuXG5cdFx0Y29uc3Qgb3RoZXJSZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4oKTtcblx0XHRjb25zdCB0ZXh0RWRpdFJlc291cmNlcyA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPigpO1xuXHRcdGxldCB0ZXh0RWRpdENvdW50ID0gMDtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5fZWRpdHMpIHtcblx0XHRcdGlmIChlZGl0IGluc3RhbmNlb2YgUmVzb3VyY2VUZXh0RWRpdCkge1xuXHRcdFx0XHR0ZXh0RWRpdENvdW50ICs9IDE7XG5cdFx0XHRcdHRleHRFZGl0UmVzb3VyY2VzLnNldChlZGl0LnJlc291cmNlLCB0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoZWRpdCBpbnN0YW5jZW9mIFJlc291cmNlRmlsZUVkaXQpIHtcblx0XHRcdFx0b3RoZXJSZXNvdXJjZXMuc2V0KGVkaXQub2xkUmVzb3VyY2UgPz8gZWRpdC5uZXdSZXNvdXJjZSEsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fZWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3N1bW1hcnkuMCcsIFwiTWFkZSBubyBlZGl0c1wiKTtcblx0XHR9IGVsc2UgaWYgKG90aGVyUmVzb3VyY2VzLnNpemUgPT09IDApIHtcblx0XHRcdGlmICh0ZXh0RWRpdENvdW50ID4gMSAmJiB0ZXh0RWRpdFJlc291cmNlcy5zaXplID4gMSkge1xuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3N1bW1hcnkubm0nLCBcIk1hZGUgezB9IHRleHQgZWRpdHMgaW4gezF9IGZpbGVzXCIsIHRleHRFZGl0Q291bnQsIHRleHRFZGl0UmVzb3VyY2VzLnNpemUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzdW1tYXJ5Lm4wJywgXCJNYWRlIHswfSB0ZXh0IGVkaXRzIGluIG9uZSBmaWxlXCIsIHRleHRFZGl0Q291bnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3N1bW1hcnkudGV4dEZpbGVzJywgXCJNYWRlIHswfSB0ZXh0IGVkaXRzIGluIHsxfSBmaWxlcywgYWxzbyBjcmVhdGVkIG9yIGRlbGV0ZWQgezJ9IGZpbGVzXCIsIHRleHRFZGl0Q291bnQsIHRleHRFZGl0UmVzb3VyY2VzLnNpemUsIG90aGVyUmVzb3VyY2VzLnNpemUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHBlcmZvcm0ocmVhc29uPzogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblxuXHRcdGlmICh0aGlzLl9lZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZXM6IG51bWJlcltdID0gWzFdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgdGhpcy5fZWRpdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChPYmplY3QuZ2V0UHJvdG90eXBlT2YodGhpcy5fZWRpdHNbaSAtIDFdKSA9PT0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHRoaXMuX2VkaXRzW2ldKSkge1xuXHRcdFx0XHRyYW5nZXNbcmFuZ2VzLmxlbmd0aCAtIDFdKys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyYW5nZXMucHVzaCgxKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTaG93IGluZmludGUgcHJvZ3Jlc3Mgd2hlbiB0aGVyZSBpcyBvbmx5IDEgaXRlbSBzaW5jZSB3ZSBkbyBub3Qga25vdyBob3cgbG9uZyBpdCB0YWtlc1xuXHRcdGNvbnN0IGluY3JlbWVudCA9IHRoaXMuX2VkaXRzLmxlbmd0aCA+IDEgPyAwIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Byb2dyZXNzLnJlcG9ydCh7IGluY3JlbWVudCwgdG90YWw6IDEwMCB9KTtcblx0XHQvLyBJbmNyZW1lbnQgYnkgcGVyY2VudGFnZSBwb2ludHMgc2luY2UgcHJvZ3Jlc3MgQVBJIGV4cGVjdHMgdGhhdFxuXHRcdGNvbnN0IHByb2dyZXNzOiBJUHJvZ3Jlc3M8dm9pZD4gPSB7IHJlcG9ydDogXyA9PiB0aGlzLl9wcm9ncmVzcy5yZXBvcnQoeyBpbmNyZW1lbnQ6IDEwMCAvIHRoaXMuX2VkaXRzLmxlbmd0aCB9KSB9O1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VzOiAocmVhZG9ubHkgVVJJW10pW10gPSBbXTtcblx0XHRsZXQgaW5kZXggPSAwO1xuXHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgcmFuZ2VzKSB7XG5cdFx0XHRpZiAodGhpcy5fdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBncm91cCA9IHRoaXMuX2VkaXRzLnNsaWNlKGluZGV4LCBpbmRleCArIHJhbmdlKTtcblx0XHRcdGlmIChncm91cFswXSBpbnN0YW5jZW9mIFJlc291cmNlRmlsZUVkaXQpIHtcblx0XHRcdFx0cmVzb3VyY2VzLnB1c2goYXdhaXQgdGhpcy5fcGVyZm9ybUZpbGVFZGl0cyg8UmVzb3VyY2VGaWxlRWRpdFtdPmdyb3VwLCB0aGlzLl91bmRvUmVkb0dyb3VwLCB0aGlzLl91bmRvUmVkb1NvdXJjZSwgdGhpcy5fY29uZmlybUJlZm9yZVVuZG8sIHByb2dyZXNzKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGdyb3VwWzBdIGluc3RhbmNlb2YgUmVzb3VyY2VUZXh0RWRpdCkge1xuXHRcdFx0XHRyZXNvdXJjZXMucHVzaChhd2FpdCB0aGlzLl9wZXJmb3JtVGV4dEVkaXRzKDxSZXNvdXJjZVRleHRFZGl0W10+Z3JvdXAsIHRoaXMuX3VuZG9SZWRvR3JvdXAsIHRoaXMuX3VuZG9SZWRvU291cmNlLCBwcm9ncmVzcywgcmVhc29uKSk7XG5cdFx0XHR9IGVsc2UgaWYgKGdyb3VwWzBdIGluc3RhbmNlb2YgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0KSB7XG5cdFx0XHRcdHJlc291cmNlcy5wdXNoKGF3YWl0IHRoaXMuX3BlcmZvcm1DZWxsRWRpdHMoPFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdFtdPmdyb3VwLCB0aGlzLl91bmRvUmVkb0dyb3VwLCB0aGlzLl91bmRvUmVkb1NvdXJjZSwgcHJvZ3Jlc3MpKTtcblx0XHRcdH0gZWxzZSBpZiAoZ3JvdXBbMF0gaW5zdGFuY2VvZiBSZXNvdXJjZUF0dGFjaG1lbnRFZGl0KSB7XG5cdFx0XHRcdHJlc291cmNlcy5wdXNoKGF3YWl0IHRoaXMuX3BlcmZvcm1PcGFxdWVFZGl0cyg8UmVzb3VyY2VBdHRhY2htZW50RWRpdFtdPmdyb3VwLCB0aGlzLl91bmRvUmVkb0dyb3VwLCB0aGlzLl91bmRvUmVkb1NvdXJjZSwgcHJvZ3Jlc3MpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnNvbGUubG9nKCdVTktOT1dOIEVESVQnKTtcblx0XHRcdH1cblx0XHRcdGluZGV4ID0gaW5kZXggKyByYW5nZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzb3VyY2VzLmZsYXQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BlcmZvcm1GaWxlRWRpdHMoZWRpdHM6IFJlc291cmNlRmlsZUVkaXRbXSwgdW5kb1JlZG9Hcm91cDogVW5kb1JlZG9Hcm91cCwgdW5kb1JlZG9Tb3VyY2U6IFVuZG9SZWRvU291cmNlIHwgdW5kZWZpbmVkLCBjb25maXJtQmVmb3JlVW5kbzogYm9vbGVhbiwgcHJvZ3Jlc3M6IElQcm9ncmVzczx2b2lkPik6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdfcGVyZm9ybUZpbGVFZGl0cycsIEpTT04uc3RyaW5naWZ5KGVkaXRzKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnVsa0ZpbGVFZGl0cywgdGhpcy5fbGFiZWwgfHwgbG9jYWxpemUoJ3dvcmtzcGFjZUVkaXQnLCBcIldvcmtzcGFjZSBFZGl0XCIpLCB0aGlzLl9jb2RlIHx8ICd1bmRvcmVkby53b3Jrc3BhY2VFZGl0JywgdW5kb1JlZG9Hcm91cCwgdW5kb1JlZG9Tb3VyY2UsIGNvbmZpcm1CZWZvcmVVbmRvLCBwcm9ncmVzcywgdGhpcy5fdG9rZW4sIGVkaXRzKTtcblx0XHRyZXR1cm4gYXdhaXQgbW9kZWwuYXBwbHkoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BlcmZvcm1UZXh0RWRpdHMoZWRpdHM6IFJlc291cmNlVGV4dEVkaXRbXSwgdW5kb1JlZG9Hcm91cDogVW5kb1JlZG9Hcm91cCwgdW5kb1JlZG9Tb3VyY2U6IFVuZG9SZWRvU291cmNlIHwgdW5kZWZpbmVkLCBwcm9ncmVzczogSVByb2dyZXNzPHZvaWQ+LCByZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2UgfCB1bmRlZmluZWQpOiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnX3BlcmZvcm1UZXh0RWRpdHMnLCBKU09OLnN0cmluZ2lmeShlZGl0cykpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJ1bGtUZXh0RWRpdHMsIHRoaXMuX2xhYmVsIHx8IGxvY2FsaXplKCd3b3Jrc3BhY2VFZGl0JywgXCJXb3Jrc3BhY2UgRWRpdFwiKSwgdGhpcy5fY29kZSB8fCAndW5kb3JlZG8ud29ya3NwYWNlRWRpdCcsIHRoaXMuX2VkaXRvciwgdW5kb1JlZG9Hcm91cCwgdW5kb1JlZG9Tb3VyY2UsIHByb2dyZXNzLCB0aGlzLl90b2tlbiwgZWRpdHMpO1xuXHRcdHJldHVybiBhd2FpdCBtb2RlbC5hcHBseShyZWFzb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGVyZm9ybUNlbGxFZGl0cyhlZGl0czogUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0W10sIHVuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAsIHVuZG9SZWRvU291cmNlOiBVbmRvUmVkb1NvdXJjZSB8IHVuZGVmaW5lZCwgcHJvZ3Jlc3M6IElQcm9ncmVzczx2b2lkPik6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdfcGVyZm9ybUNlbGxFZGl0cycsIEpTT04uc3RyaW5naWZ5KGVkaXRzKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnVsa0NlbGxFZGl0cywgdW5kb1JlZG9Hcm91cCwgdW5kb1JlZG9Tb3VyY2UsIHByb2dyZXNzLCB0aGlzLl90b2tlbiwgZWRpdHMpO1xuXHRcdHJldHVybiBhd2FpdCBtb2RlbC5hcHBseSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGVyZm9ybU9wYXF1ZUVkaXRzKGVkaXRzOiBSZXNvdXJjZUF0dGFjaG1lbnRFZGl0W10sIHVuZG9SZWRvR3JvdXA6IFVuZG9SZWRvR3JvdXAsIHVuZG9SZWRvU291cmNlOiBVbmRvUmVkb1NvdXJjZSB8IHVuZGVmaW5lZCwgcHJvZ3Jlc3M6IElQcm9ncmVzczx2b2lkPik6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdfcGVyZm9ybU9wYXF1ZUVkaXRzJywgSlNPTi5zdHJpbmdpZnkoZWRpdHMpKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShPcGFxdWVFZGl0cywgdW5kb1JlZG9Hcm91cCwgdW5kb1JlZG9Tb3VyY2UsIHByb2dyZXNzLCB0aGlzLl90b2tlbiwgZWRpdHMpO1xuXHRcdHJldHVybiBhd2FpdCBtb2RlbC5hcHBseSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCdWxrRWRpdFNlcnZpY2UgaW1wbGVtZW50cyBJQnVsa0VkaXRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVVbmRvUmVkb0dyb3VwcyA9IG5ldyBMaW5rZWRMaXN0PFVuZG9SZWRvR3JvdXA+KCk7XG5cdHByaXZhdGUgX3ByZXZpZXdIYW5kbGVyPzogSUJ1bGtFZGl0UHJldmlld0hhbmRsZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHNldFByZXZpZXdIYW5kbGVyKGhhbmRsZXI6IElCdWxrRWRpdFByZXZpZXdIYW5kbGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX3ByZXZpZXdIYW5kbGVyID0gaGFuZGxlcjtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9wcmV2aWV3SGFuZGxlciA9PT0gaGFuZGxlcikge1xuXHRcdFx0XHR0aGlzLl9wcmV2aWV3SGFuZGxlciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGhhc1ByZXZpZXdIYW5kbGVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBCb29sZWFuKHRoaXMuX3ByZXZpZXdIYW5kbGVyKTtcblx0fVxuXG5cdGFzeW5jIGFwcGx5KGVkaXRzSW46IFJlc291cmNlRWRpdFtdIHwgV29ya3NwYWNlRWRpdCwgb3B0aW9ucz86IElCdWxrRWRpdE9wdGlvbnMpOiBQcm9taXNlPElCdWxrRWRpdFJlc3VsdD4ge1xuXHRcdGxldCBlZGl0cyA9IGxpZnRFZGl0cyhBcnJheS5pc0FycmF5KGVkaXRzSW4pID8gZWRpdHNJbiA6IGVkaXRzSW4uZWRpdHMpO1xuXG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgYXJpYVN1bW1hcnk6IGxvY2FsaXplKCdub3RoaW5nJywgXCJNYWRlIG5vIGVkaXRzXCIpLCBpc0FwcGxpZWQ6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3ByZXZpZXdIYW5kbGVyICYmIChvcHRpb25zPy5zaG93UHJldmlldyB8fCBlZGl0cy5zb21lKHZhbHVlID0+IHZhbHVlLm1ldGFkYXRhPy5uZWVkc0NvbmZpcm1hdGlvbikpKSB7XG5cdFx0XHRlZGl0cyA9IGF3YWl0IHRoaXMuX3ByZXZpZXdIYW5kbGVyKGVkaXRzLCBvcHRpb25zKTtcblx0XHR9XG5cblx0XHRsZXQgY29kZUVkaXRvciA9IG9wdGlvbnM/LmVkaXRvcjtcblx0XHQvLyB0cnkgdG8gZmluZCBjb2RlIGVkaXRvclxuXHRcdGlmICghY29kZUVkaXRvcikge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRcdGlmIChpc0NvZGVFZGl0b3IoY2FuZGlkYXRlKSkge1xuXHRcdFx0XHRjb2RlRWRpdG9yID0gY2FuZGlkYXRlO1xuXHRcdFx0fSBlbHNlIGlmIChpc0RpZmZFZGl0b3IoY2FuZGlkYXRlKSkge1xuXHRcdFx0XHRjb2RlRWRpdG9yID0gY2FuZGlkYXRlLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNvZGVFZGl0b3IgJiYgY29kZUVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSkge1xuXHRcdFx0Ly8gSWYgdGhlIGNvZGUgZWRpdG9yIGlzIHJlYWRvbmx5IHN0aWxsIGFsbG93IGJ1bGsgZWRpdHMgdG8gYmUgYXBwbGllZCAjNjg1NDlcblx0XHRcdGNvZGVFZGl0b3IgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gdW5kby1yZWRvLWdyb3VwOiBpZiBhIGdyb3VwIGlkIGlzIHBhc3NlZCB0aGVuIHRyeSB0byBmaW5kIGl0XG5cdFx0Ly8gaW4gdGhlIGxpc3Qgb2YgYWN0aXZlIGVkaXRzLiBvdGhlcndpc2UgKG9yIHdoZW4gbm90IGZvdW5kKVxuXHRcdC8vIGNyZWF0ZSBhIHNlcGFyYXRlIHVuZG8tcmVkby1ncm91cFxuXHRcdGxldCB1bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB1bmRvUmVkb0dyb3VwUmVtb3ZlID0gKCkgPT4geyB9O1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8udW5kb1JlZG9Hcm91cElkID09PSAnbnVtYmVyJykge1xuXHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgdGhpcy5fYWN0aXZlVW5kb1JlZG9Hcm91cHMpIHtcblx0XHRcdFx0aWYgKGNhbmRpZGF0ZS5pZCA9PT0gb3B0aW9ucy51bmRvUmVkb0dyb3VwSWQpIHtcblx0XHRcdFx0XHR1bmRvUmVkb0dyb3VwID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghdW5kb1JlZG9Hcm91cCkge1xuXHRcdFx0dW5kb1JlZG9Hcm91cCA9IG5ldyBVbmRvUmVkb0dyb3VwKCk7XG5cdFx0XHR1bmRvUmVkb0dyb3VwUmVtb3ZlID0gdGhpcy5fYWN0aXZlVW5kb1JlZG9Hcm91cHMucHVzaCh1bmRvUmVkb0dyb3VwKTtcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbCA9IG9wdGlvbnM/LnF1b3RhYmxlTGFiZWwgfHwgb3B0aW9ucz8ubGFiZWw7XG5cdFx0Y29uc3QgYnVsa0VkaXQgPSB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRCdWxrRWRpdCxcblx0XHRcdGxhYmVsLFxuXHRcdFx0b3B0aW9ucz8uY29kZSxcblx0XHRcdGNvZGVFZGl0b3IsXG5cdFx0XHRvcHRpb25zPy5wcm9ncmVzcyA/PyBQcm9ncmVzcy5Ob25lLFxuXHRcdFx0b3B0aW9ucz8udG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdGVkaXRzLFxuXHRcdFx0dW5kb1JlZG9Hcm91cCxcblx0XHRcdG9wdGlvbnM/LnVuZG9SZWRvU291cmNlLFxuXHRcdFx0ISFvcHRpb25zPy5jb25maXJtQmVmb3JlVW5kb1xuXHRcdCk7XG5cblx0XHRsZXQgbGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRsaXN0ZW5lciA9IHRoaXMuX2xpZmVjeWNsZVNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bihlID0+IGUudmV0byh0aGlzLl9zaG91bGRWZXRvKGxhYmVsLCBlLnJlYXNvbiksICd2ZXRvLmJsdWtFZGl0U2VydmljZScpKTtcblx0XHRcdGNvbnN0IHJlc291cmNlcyA9IGF3YWl0IGJ1bGtFZGl0LnBlcmZvcm0ob3B0aW9ucz8ucmVhc29uKTtcblxuXHRcdFx0Ly8gd2hlbiBlbmFibGVkIChvcHRpb24gQU5EIHNldHRpbmcpIGxvb3Agb3ZlciBhbGwgZGlydHkgd29ya2luZyBjb3BpZXMgYW5kIHRyaWdnZXIgc2F2ZVxuXHRcdFx0Ly8gZm9yIHRob3NlIHRoYXQgd2VyZSBpbnZvbHZlZCBpbiB0aGlzIGJ1bGsgZWRpdCBvcGVyYXRpb24uXG5cdFx0XHRpZiAob3B0aW9ucz8ucmVzcGVjdEF1dG9TYXZlQ29uZmlnICYmIHRoaXMuX2NvbmZpZ1NlcnZpY2UuZ2V0VmFsdWUoYXV0b1NhdmVTZXR0aW5nKSA9PT0gdHJ1ZSAmJiByZXNvdXJjZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zYXZlQWxsKHJlc291cmNlcyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IGFyaWFTdW1tYXJ5OiBidWxrRWRpdC5hcmlhTWVzc2FnZSgpLCBpc0FwcGxpZWQ6IGVkaXRzLmxlbmd0aCA+IDAgfTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIGNvbnNvbGUubG9nKCdhcHBseSBGQUlMRUQnKTtcblx0XHRcdC8vIGNvbnNvbGUubG9nKGVycik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0XHR1bmRvUmVkb0dyb3VwUmVtb3ZlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2F2ZUFsbChyZXNvdXJjZXM6IHJlYWRvbmx5IFVSSVtdKSB7XG5cdFx0Y29uc3Qgc2V0ID0gbmV3IFJlc291cmNlU2V0KHJlc291cmNlcyk7XG5cdFx0Y29uc3Qgc2F2ZXMgPSB0aGlzLl93b3JraW5nQ29weVNlcnZpY2UuZGlydHlXb3JraW5nQ29waWVzLm1hcChhc3luYyAoY29weSkgPT4ge1xuXHRcdFx0aWYgKHNldC5oYXMoY29weS5yZXNvdXJjZSkpIHtcblx0XHRcdFx0YXdhaXQgY29weS5zYXZlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoc2F2ZXMpO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiByZXN1bHQpIHtcblx0XHRcdGlmIChpdGVtLnN0YXR1cyA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oaXRlbS5yZWFzb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Nob3VsZFZldG8obGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVhc29uOiBTaHV0ZG93blJlYXNvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0c3dpdGNoIChyZWFzb24pIHtcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uQ0xPU0U6XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2xvc2VUaGVXaW5kb3cubWVzc2FnZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGNsb3NlIHRoZSB3aW5kb3c/XCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uTE9BRDpcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjaGFuZ2VXb3Jrc3BhY2UubWVzc2FnZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGNoYW5nZSB0aGUgd29ya3NwYWNlP1wiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLlJFTE9BRDpcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdyZWxvYWRUaGVXaW5kb3cubWVzc2FnZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIHJlbG9hZCB0aGUgd2luZG93P1wiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRtZXNzYWdlID0gaXNNYWNpbnRvc2ggPyBsb2NhbGl6ZSgncXVpdE1lc3NhZ2VNYWMnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBxdWl0P1wiKSA6IGxvY2FsaXplKCdxdWl0TWVzc2FnZScsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGV4aXQ/XCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2FyZVlvdVN1cmVRdWl0ZUJ1bGtFZGl0LmRldGFpbCcsIFwiJ3swfScgaXMgaW4gcHJvZ3Jlc3MuXCIsIGxhYmVsIHx8IGxvY2FsaXplKCdmaWxlT3BlcmF0aW9uJywgXCJGaWxlIG9wZXJhdGlvblwiKSksXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gIXJlc3VsdC5jb25maXJtZWQ7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUJ1bGtFZGl0U2VydmljZSwgQnVsa0VkaXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuY29uc3QgYXV0b1NhdmVTZXR0aW5nID0gJ2ZpbGVzLnJlZmFjdG9yaW5nLmF1dG9TYXZlJztcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRpZDogJ2ZpbGVzJyxcblx0cHJvcGVydGllczoge1xuXHRcdFthdXRvU2F2ZVNldHRpbmddOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlZmFjdG9yaW5nLmF1dG9TYXZlJywgXCJDb250cm9scyBpZiBmaWxlcyB0aGF0IHdlcmUgcGFydCBvZiBhIHJlZmFjdG9yaW5nIGFyZSBzYXZlZCBhdXRvbWF0aWNhbGx5XCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQXNCLG9CQUFvQjtBQUMxQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGFBQWEsbUJBQW1CO0FBRXpDLFNBQXNCLGNBQWMsb0JBQW9CO0FBQ3hELFNBQXFFLGtCQUFnQyxrQkFBa0Isd0JBQXdCO0FBQy9JLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQTBDO0FBQ25ELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFtQyxnQkFBZ0I7QUFDbkQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUM7QUFDOUMsU0FBUyxlQUFlLGdDQUFnQztBQUN4RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxhQUFhLDhCQUE4QjtBQUVwRCxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLFVBQVUsT0FBdUM7QUFDekQsU0FBTyxNQUFNLElBQUksVUFBUTtBQUN4QixRQUFJLGlC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
