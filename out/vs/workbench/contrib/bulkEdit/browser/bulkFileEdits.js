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
import { IFileService, FileSystemProviderCapabilities } from "../../../../platform/files/common/files.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IWorkingCopyFileService } from "../../../services/workingCopy/common/workingCopyFileService.js";
import { UndoRedoElementType, IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { Schemas } from "../../../../base/common/network.js";
class Noop {
  constructor() {
    this.uris = [];
  }
  async perform() {
    return this;
  }
  toString() {
    return "(noop)";
  }
}
class RenameEdit {
  constructor(newUri, oldUri, options) {
    this.newUri = newUri;
    this.oldUri = oldUri;
    this.options = options;
    this.type = "rename";
  }
}
let RenameOperation = class {
  constructor(_edits, _undoRedoInfo, _workingCopyFileService, _fileService) {
    this._edits = _edits;
    this._undoRedoInfo = _undoRedoInfo;
    this._workingCopyFileService = _workingCopyFileService;
    this._fileService = _fileService;
  }
  get uris() {
    return this._edits.flatMap((edit) => [edit.newUri, edit.oldUri]);
  }
  async perform(token) {
    const moves = [];
    const undoes = [];
    for (const edit of this._edits) {
      const skip = edit.options.overwrite === void 0 && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri);
      if (!skip) {
        moves.push({
          file: { source: edit.oldUri, target: edit.newUri },
          overwrite: edit.options.overwrite
        });
        undoes.push(new RenameEdit(edit.oldUri, edit.newUri, edit.options));
      }
    }
    if (moves.length === 0) {
      return new Noop();
    }
    await this._workingCopyFileService.move(moves, token, this._undoRedoInfo);
    return new RenameOperation(undoes, { isUndoing: true }, this._workingCopyFileService, this._fileService);
  }
  toString() {
    return `(rename ${this._edits.map((edit) => `${edit.oldUri} to ${edit.newUri}`).join(", ")})`;
  }
};
RenameOperation = __decorateClass([
  __decorateParam(2, IWorkingCopyFileService),
  __decorateParam(3, IFileService)
], RenameOperation);
class CopyEdit {
  constructor(newUri, oldUri, options) {
    this.newUri = newUri;
    this.oldUri = oldUri;
    this.options = options;
    this.type = "copy";
  }
}
let CopyOperation = class {
  constructor(_edits, _undoRedoInfo, _workingCopyFileService, _fileService, _instaService) {
    this._edits = _edits;
    this._undoRedoInfo = _undoRedoInfo;
    this._workingCopyFileService = _workingCopyFileService;
    this._fileService = _fileService;
    this._instaService = _instaService;
  }
  get uris() {
    return this._edits.flatMap((edit) => [edit.newUri, edit.oldUri]);
  }
  async perform(token) {
    const copies = [];
    for (const edit of this._edits) {
      const skip = edit.options.overwrite === void 0 && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri);
      if (!skip) {
        copies.push({ file: { source: edit.oldUri, target: edit.newUri }, overwrite: edit.options.overwrite });
      }
    }
    if (copies.length === 0) {
      return new Noop();
    }
    const stats = await this._workingCopyFileService.copy(copies, token, this._undoRedoInfo);
    const undoes = [];
    for (let i = 0; i < stats.length; i++) {
      const stat = stats[i];
      const edit = this._edits[i];
      undoes.push(new DeleteEdit(stat.resource, { recursive: true, folder: this._edits[i].options.folder || stat.isDirectory, ...edit.options }, false));
    }
    return this._instaService.createInstance(DeleteOperation, undoes, { isUndoing: true });
  }
  toString() {
    return `(copy ${this._edits.map((edit) => `${edit.oldUri} to ${edit.newUri}`).join(", ")})`;
  }
};
CopyOperation = __decorateClass([
  __decorateParam(2, IWorkingCopyFileService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IInstantiationService)
], CopyOperation);
class CreateEdit {
  constructor(newUri, options, contents) {
    this.newUri = newUri;
    this.options = options;
    this.contents = contents;
    this.type = "create";
  }
}
let CreateOperation = class {
  constructor(_edits, _undoRedoInfo, _fileService, _workingCopyFileService, _instaService, _textFileService) {
    this._edits = _edits;
    this._undoRedoInfo = _undoRedoInfo;
    this._fileService = _fileService;
    this._workingCopyFileService = _workingCopyFileService;
    this._instaService = _instaService;
    this._textFileService = _textFileService;
  }
  get uris() {
    return this._edits.map((edit) => edit.newUri);
  }
  async perform(token) {
    const folderCreates = [];
    const fileCreates = [];
    const undoes = [];
    for (const edit of this._edits) {
      if (edit.newUri.scheme === Schemas.untitled) {
        continue;
      }
      if (edit.options.overwrite === void 0 && edit.options.ignoreIfExists && await this._fileService.exists(edit.newUri)) {
        continue;
      }
      if (edit.options.folder) {
        folderCreates.push({ resource: edit.newUri });
      } else {
        const encodedReadable = typeof edit.contents !== "undefined" ? edit.contents : await this._textFileService.getEncodedReadable(edit.newUri);
        fileCreates.push({ resource: edit.newUri, contents: encodedReadable, overwrite: edit.options.overwrite });
      }
      undoes.push(new DeleteEdit(edit.newUri, edit.options, !edit.options.folder && !edit.contents));
    }
    if (folderCreates.length === 0 && fileCreates.length === 0) {
      return new Noop();
    }
    await this._workingCopyFileService.createFolder(folderCreates, token, this._undoRedoInfo);
    await this._workingCopyFileService.create(fileCreates, token, this._undoRedoInfo);
    return this._instaService.createInstance(DeleteOperation, undoes, { isUndoing: true });
  }
  toString() {
    return `(create ${this._edits.map((edit) => edit.options.folder ? `folder ${edit.newUri}` : `file ${edit.newUri} with ${edit.contents?.byteLength || 0} bytes`).join(", ")})`;
  }
};
CreateOperation = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, IWorkingCopyFileService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITextFileService)
], CreateOperation);
class DeleteEdit {
  constructor(oldUri, options, undoesCreate) {
    this.oldUri = oldUri;
    this.options = options;
    this.undoesCreate = undoesCreate;
    this.type = "delete";
  }
}
let DeleteOperation = class {
  constructor(_edits, _undoRedoInfo, _workingCopyFileService, _fileService, _configurationService, _instaService, _logService) {
    this._edits = _edits;
    this._undoRedoInfo = _undoRedoInfo;
    this._workingCopyFileService = _workingCopyFileService;
    this._fileService = _fileService;
    this._configurationService = _configurationService;
    this._instaService = _instaService;
    this._logService = _logService;
  }
  get uris() {
    return this._edits.map((edit) => edit.oldUri);
  }
  async perform(token) {
    const deletes = [];
    const undoes = [];
    for (const edit of this._edits) {
      let fileStat;
      try {
        fileStat = await this._fileService.resolve(edit.oldUri, { resolveMetadata: true });
      } catch (err) {
        if (!edit.options.ignoreIfNotExists) {
          throw new Error(`${edit.oldUri} does not exist and can not be deleted`);
        }
        continue;
      }
      deletes.push({
        resource: edit.oldUri,
        recursive: edit.options.recursive,
        useTrash: !edit.options.skipTrashBin && this._fileService.hasCapability(edit.oldUri, FileSystemProviderCapabilities.Trash) && this._configurationService.getValue("files.enableTrash")
      });
      let fileContent;
      let fileContentExceedsMaxSize = false;
      if (!edit.undoesCreate && !edit.options.folder) {
        fileContentExceedsMaxSize = typeof edit.options.maxSize === "number" && fileStat.size > edit.options.maxSize;
        if (!fileContentExceedsMaxSize) {
          try {
            fileContent = await this._fileService.readFile(edit.oldUri);
          } catch (err) {
            this._logService.error(err);
          }
        }
      }
      if (!fileContentExceedsMaxSize) {
        undoes.push(new CreateEdit(edit.oldUri, edit.options, fileContent?.value));
      }
    }
    if (deletes.length === 0) {
      return new Noop();
    }
    await this._workingCopyFileService.delete(deletes, token, this._undoRedoInfo);
    if (undoes.length === 0) {
      return new Noop();
    }
    return this._instaService.createInstance(CreateOperation, undoes, { isUndoing: true });
  }
  toString() {
    return `(delete ${this._edits.map((edit) => edit.oldUri).join(", ")})`;
  }
};
DeleteOperation = __decorateClass([
  __decorateParam(2, IWorkingCopyFileService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILogService)
], DeleteOperation);
class FileUndoRedoElement {
  constructor(label, code, operations, confirmBeforeUndo) {
    this.label = label;
    this.code = code;
    this.operations = operations;
    this.confirmBeforeUndo = confirmBeforeUndo;
    this.type = UndoRedoElementType.Workspace;
    this.resources = operations.flatMap((op) => op.uris);
  }
  async undo() {
    await this._reverse();
  }
  async redo() {
    await this._reverse();
  }
  async _reverse() {
    for (let i = 0; i < this.operations.length; i++) {
      const op = this.operations[i];
      const undo = await op.perform(CancellationToken.None);
      this.operations[i] = undo;
    }
  }
  toString() {
    return this.operations.map((op) => String(op)).join(", ");
  }
}
let BulkFileEdits = class {
  constructor(_label, _code, _undoRedoGroup, _undoRedoSource, _confirmBeforeUndo, _progress, _token, _edits, _instaService, _undoRedoService) {
    this._label = _label;
    this._code = _code;
    this._undoRedoGroup = _undoRedoGroup;
    this._undoRedoSource = _undoRedoSource;
    this._confirmBeforeUndo = _confirmBeforeUndo;
    this._progress = _progress;
    this._token = _token;
    this._edits = _edits;
    this._instaService = _instaService;
    this._undoRedoService = _undoRedoService;
  }
  async apply() {
    const undoOperations = [];
    const undoRedoInfo = { undoRedoGroupId: this._undoRedoGroup.id };
    const edits = [];
    for (const edit of this._edits) {
      if (edit.newResource && edit.oldResource && !edit.options?.copy) {
        edits.push(new RenameEdit(edit.newResource, edit.oldResource, edit.options ?? {}));
      } else if (edit.newResource && edit.oldResource && edit.options?.copy) {
        edits.push(new CopyEdit(edit.newResource, edit.oldResource, edit.options ?? {}));
      } else if (!edit.newResource && edit.oldResource) {
        edits.push(new DeleteEdit(edit.oldResource, edit.options ?? {}, false));
      } else if (edit.newResource && !edit.oldResource) {
        edits.push(new CreateEdit(edit.newResource, edit.options ?? {}, await edit.options.contents));
      }
    }
    if (edits.length === 0) {
      return [];
    }
    const groups = [];
    groups[0] = [edits[0]];
    for (let i = 1; i < edits.length; i++) {
      const edit = edits[i];
      const lastGroup = groups.at(-1);
      if (lastGroup?.[0].type === edit.type) {
        lastGroup.push(edit);
      } else {
        groups.push([edit]);
      }
    }
    for (const group of groups) {
      if (this._token.isCancellationRequested) {
        break;
      }
      let op;
      switch (group[0].type) {
        case "rename":
          op = this._instaService.createInstance(RenameOperation, group, undoRedoInfo);
          break;
        case "copy":
          op = this._instaService.createInstance(CopyOperation, group, undoRedoInfo);
          break;
        case "delete":
          op = this._instaService.createInstance(DeleteOperation, group, undoRedoInfo);
          break;
        case "create":
          op = this._instaService.createInstance(CreateOperation, group, undoRedoInfo);
          break;
      }
      if (op) {
        const undoOp = await op.perform(this._token);
        undoOperations.push(undoOp);
      }
      this._progress.report(void 0);
    }
    const undoRedoElement = new FileUndoRedoElement(this._label, this._code, undoOperations, this._confirmBeforeUndo);
    this._undoRedoService.pushElement(undoRedoElement, this._undoRedoGroup, this._undoRedoSource);
    return undoRedoElement.resources;
  }
};
BulkFileEdits = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IUndoRedoService)
], BulkFileEdits);
export {
  BulkFileEdits
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJ1bGtFZGl0XFxicm93c2VyXFxidWxrRmlsZUVkaXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXG5pbXBvcnQgeyBXb3Jrc3BhY2VGaWxlRWRpdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcywgSUZpbGVDb250ZW50LCBJRmlsZVN0YXRXaXRoTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvLCBJTW92ZU9wZXJhdGlvbiwgSUNvcHlPcGVyYXRpb24sIElEZWxldGVPcGVyYXRpb24sIElDcmVhdGVPcGVyYXRpb24sIElDcmVhdGVGaWxlT3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVVuZG9SZWRvRWxlbWVudCwgVW5kb1JlZG9FbGVtZW50VHlwZSwgSVVuZG9SZWRvU2VydmljZSwgVW5kb1JlZG9Hcm91cCwgVW5kb1JlZG9Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUZpbGVFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcblxuaW50ZXJmYWNlIElGaWxlT3BlcmF0aW9uIHtcblx0dXJpczogVVJJW107XG5cdHBlcmZvcm0odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZU9wZXJhdGlvbj47XG59XG5cbmNsYXNzIE5vb3AgaW1wbGVtZW50cyBJRmlsZU9wZXJhdGlvbiB7XG5cdHJlYWRvbmx5IHVyaXMgPSBbXTtcblx0YXN5bmMgcGVyZm9ybSgpIHsgcmV0dXJuIHRoaXM7IH1cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJyhub29wKSc7XG5cdH1cbn1cblxuY2xhc3MgUmVuYW1lRWRpdCB7XG5cdHJlYWRvbmx5IHR5cGUgPSAncmVuYW1lJztcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbmV3VXJpOiBVUkksXG5cdFx0cmVhZG9ubHkgb2xkVXJpOiBVUkksXG5cdFx0cmVhZG9ubHkgb3B0aW9uczogV29ya3NwYWNlRmlsZUVkaXRPcHRpb25zXG5cdCkgeyB9XG59XG5cbmNsYXNzIFJlbmFtZU9wZXJhdGlvbiBpbXBsZW1lbnRzIElGaWxlT3BlcmF0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0czogUmVuYW1lRWRpdFtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvSW5mbzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8sXG5cdFx0QElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7IH1cblxuXHRnZXQgdXJpcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdHMuZmxhdE1hcChlZGl0ID0+IFtlZGl0Lm5ld1VyaSwgZWRpdC5vbGRVcmldKTtcblx0fVxuXG5cdGFzeW5jIHBlcmZvcm0odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRmlsZU9wZXJhdGlvbj4ge1xuXG5cdFx0Y29uc3QgbW92ZXM6IElNb3ZlT3BlcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCB1bmRvZXM6IFJlbmFtZUVkaXRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiB0aGlzLl9lZGl0cykge1xuXHRcdFx0Ly8gY2hlY2s6IG5vdCBvdmVyd3JpdGluZywgYnV0IGlnbm9yaW5nLCBhbmQgdGhlIHRhcmdldCBmaWxlIGV4aXN0c1xuXHRcdFx0Y29uc3Qgc2tpcCA9IGVkaXQub3B0aW9ucy5vdmVyd3JpdGUgPT09IHVuZGVmaW5lZCAmJiBlZGl0Lm9wdGlvbnMuaWdub3JlSWZFeGlzdHMgJiYgYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKGVkaXQubmV3VXJpKTtcblx0XHRcdGlmICghc2tpcCkge1xuXHRcdFx0XHRtb3Zlcy5wdXNoKHtcblx0XHRcdFx0XHRmaWxlOiB7IHNvdXJjZTogZWRpdC5vbGRVcmksIHRhcmdldDogZWRpdC5uZXdVcmkgfSxcblx0XHRcdFx0XHRvdmVyd3JpdGU6IGVkaXQub3B0aW9ucy5vdmVyd3JpdGVcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gcmV2ZXJzZSBlZGl0XG5cdFx0XHRcdHVuZG9lcy5wdXNoKG5ldyBSZW5hbWVFZGl0KGVkaXQub2xkVXJpLCBlZGl0Lm5ld1VyaSwgZWRpdC5vcHRpb25zKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG1vdmVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG5ldyBOb29wKCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fd29ya2luZ0NvcHlGaWxlU2VydmljZS5tb3ZlKG1vdmVzLCB0b2tlbiwgdGhpcy5fdW5kb1JlZG9JbmZvKTtcblx0XHRyZXR1cm4gbmV3IFJlbmFtZU9wZXJhdGlvbih1bmRvZXMsIHsgaXNVbmRvaW5nOiB0cnVlIH0sIHRoaXMuX3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UsIHRoaXMuX2ZpbGVTZXJ2aWNlKTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAocmVuYW1lICR7dGhpcy5fZWRpdHMubWFwKGVkaXQgPT4gYCR7ZWRpdC5vbGRVcml9IHRvICR7ZWRpdC5uZXdVcml9YCkuam9pbignLCAnKX0pYDtcblx0fVxufVxuXG5jbGFzcyBDb3B5RWRpdCB7XG5cdHJlYWRvbmx5IHR5cGUgPSAnY29weSc7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5ld1VyaTogVVJJLFxuXHRcdHJlYWRvbmx5IG9sZFVyaTogVVJJLFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IFdvcmtzcGFjZUZpbGVFZGl0T3B0aW9uc1xuXHQpIHsgfVxufVxuXG5jbGFzcyBDb3B5T3BlcmF0aW9uIGltcGxlbWVudHMgSUZpbGVPcGVyYXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRzOiBDb3B5RWRpdFtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvSW5mbzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8sXG5cdFx0QElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0IHVyaXMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRzLmZsYXRNYXAoZWRpdCA9PiBbZWRpdC5uZXdVcmksIGVkaXQub2xkVXJpXSk7XG5cdH1cblxuXHRhc3luYyBwZXJmb3JtKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUZpbGVPcGVyYXRpb24+IHtcblxuXHRcdC8vICgxKSBjcmVhdGUgY29weSBvcGVyYXRpb25zLCByZW1vdmUgbm9vcHNcblx0XHRjb25zdCBjb3BpZXM6IElDb3B5T3BlcmF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5fZWRpdHMpIHtcblx0XHRcdC8vY2hlY2s6IG5vdCBvdmVyd3JpdGluZywgYnV0IGlnbm9yaW5nLCBhbmQgdGhlIHRhcmdldCBmaWxlIGV4aXN0c1xuXHRcdFx0Y29uc3Qgc2tpcCA9IGVkaXQub3B0aW9ucy5vdmVyd3JpdGUgPT09IHVuZGVmaW5lZCAmJiBlZGl0Lm9wdGlvbnMuaWdub3JlSWZFeGlzdHMgJiYgYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKGVkaXQubmV3VXJpKTtcblx0XHRcdGlmICghc2tpcCkge1xuXHRcdFx0XHRjb3BpZXMucHVzaCh7IGZpbGU6IHsgc291cmNlOiBlZGl0Lm9sZFVyaSwgdGFyZ2V0OiBlZGl0Lm5ld1VyaSB9LCBvdmVyd3JpdGU6IGVkaXQub3B0aW9ucy5vdmVyd3JpdGUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNvcGllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBuZXcgTm9vcCgpO1xuXHRcdH1cblxuXHRcdC8vICgyKSBwZXJmb3JtIHRoZSBhY3R1YWwgY29weSBhbmQgdXNlIHRoZSByZXR1cm4gc3RhdHMgdG8gYnVpbGQgdW5kbyBlZGl0c1xuXHRcdGNvbnN0IHN0YXRzID0gYXdhaXQgdGhpcy5fd29ya2luZ0NvcHlGaWxlU2VydmljZS5jb3B5KGNvcGllcywgdG9rZW4sIHRoaXMuX3VuZG9SZWRvSW5mbyk7XG5cdFx0Y29uc3QgdW5kb2VzOiBEZWxldGVFZGl0W10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc3RhdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHN0YXQgPSBzdGF0c1tpXTtcblx0XHRcdGNvbnN0IGVkaXQgPSB0aGlzLl9lZGl0c1tpXTtcblx0XHRcdHVuZG9lcy5wdXNoKG5ldyBEZWxldGVFZGl0KHN0YXQucmVzb3VyY2UsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb2xkZXI6IHRoaXMuX2VkaXRzW2ldLm9wdGlvbnMuZm9sZGVyIHx8IHN0YXQuaXNEaXJlY3RvcnksIC4uLmVkaXQub3B0aW9ucyB9LCBmYWxzZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVsZXRlT3BlcmF0aW9uLCB1bmRvZXMsIHsgaXNVbmRvaW5nOiB0cnVlIH0pO1xuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYChjb3B5ICR7dGhpcy5fZWRpdHMubWFwKGVkaXQgPT4gYCR7ZWRpdC5vbGRVcml9IHRvICR7ZWRpdC5uZXdVcml9YCkuam9pbignLCAnKX0pYDtcblx0fVxufVxuXG5jbGFzcyBDcmVhdGVFZGl0IHtcblx0cmVhZG9ubHkgdHlwZSA9ICdjcmVhdGUnO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBuZXdVcmk6IFVSSSxcblx0XHRyZWFkb25seSBvcHRpb25zOiBXb3Jrc3BhY2VGaWxlRWRpdE9wdGlvbnMsXG5cdFx0cmVhZG9ubHkgY29udGVudHM6IFZTQnVmZmVyIHwgdW5kZWZpbmVkLFxuXHQpIHsgfVxufVxuXG5jbGFzcyBDcmVhdGVPcGVyYXRpb24gaW1wbGVtZW50cyBJRmlsZU9wZXJhdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdHM6IENyZWF0ZUVkaXRbXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb0luZm86IElGaWxlT3BlcmF0aW9uVW5kb1JlZG9JbmZvLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0NvcHlGaWxlU2VydmljZTogSVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2Vcblx0KSB7IH1cblxuXHRnZXQgdXJpcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdHMubWFwKGVkaXQgPT4gZWRpdC5uZXdVcmkpO1xuXHR9XG5cblx0YXN5bmMgcGVyZm9ybSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElGaWxlT3BlcmF0aW9uPiB7XG5cblx0XHRjb25zdCBmb2xkZXJDcmVhdGVzOiBJQ3JlYXRlT3BlcmF0aW9uW10gPSBbXTtcblx0XHRjb25zdCBmaWxlQ3JlYXRlczogSUNyZWF0ZUZpbGVPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHVuZG9lczogRGVsZXRlRWRpdFtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5fZWRpdHMpIHtcblx0XHRcdGlmIChlZGl0Lm5ld1VyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIGlnbm9yZSwgd2lsbCBiZSBoYW5kbGVkIGJ5IGEgbGF0ZXIgZWRpdFxuXHRcdFx0fVxuXHRcdFx0aWYgKGVkaXQub3B0aW9ucy5vdmVyd3JpdGUgPT09IHVuZGVmaW5lZCAmJiBlZGl0Lm9wdGlvbnMuaWdub3JlSWZFeGlzdHMgJiYgYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKGVkaXQubmV3VXJpKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gbm90IG92ZXJ3cml0aW5nLCBidXQgaWdub3JpbmcsIGFuZCB0aGUgdGFyZ2V0IGZpbGUgZXhpc3RzXG5cdFx0XHR9XG5cdFx0XHRpZiAoZWRpdC5vcHRpb25zLmZvbGRlcikge1xuXHRcdFx0XHRmb2xkZXJDcmVhdGVzLnB1c2goeyByZXNvdXJjZTogZWRpdC5uZXdVcmkgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBJZiB0aGUgY29udGVudHMgYXJlIHBhcnQgb2YgdGhlIGVkaXQgdGhleSBpbmNsdWRlIHRoZSBlbmNvZGluZywgdGh1cyB1c2UgdGhlbS4gT3RoZXJ3aXNlIGdldCB0aGUgZW5jb2RpbmcgZm9yIGEgbmV3IGVtcHR5IGZpbGUuXG5cdFx0XHRcdGNvbnN0IGVuY29kZWRSZWFkYWJsZSA9IHR5cGVvZiBlZGl0LmNvbnRlbnRzICE9PSAndW5kZWZpbmVkJyA/IGVkaXQuY29udGVudHMgOiBhd2FpdCB0aGlzLl90ZXh0RmlsZVNlcnZpY2UuZ2V0RW5jb2RlZFJlYWRhYmxlKGVkaXQubmV3VXJpKTtcblx0XHRcdFx0ZmlsZUNyZWF0ZXMucHVzaCh7IHJlc291cmNlOiBlZGl0Lm5ld1VyaSwgY29udGVudHM6IGVuY29kZWRSZWFkYWJsZSwgb3ZlcndyaXRlOiBlZGl0Lm9wdGlvbnMub3ZlcndyaXRlIH0pO1xuXHRcdFx0fVxuXHRcdFx0dW5kb2VzLnB1c2gobmV3IERlbGV0ZUVkaXQoZWRpdC5uZXdVcmksIGVkaXQub3B0aW9ucywgIWVkaXQub3B0aW9ucy5mb2xkZXIgJiYgIWVkaXQuY29udGVudHMpKTtcblx0XHR9XG5cblx0XHRpZiAoZm9sZGVyQ3JlYXRlcy5sZW5ndGggPT09IDAgJiYgZmlsZUNyZWF0ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gbmV3IE5vb3AoKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLl93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihmb2xkZXJDcmVhdGVzLCB0b2tlbiwgdGhpcy5fdW5kb1JlZG9JbmZvKTtcblx0XHRhd2FpdCB0aGlzLl93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmNyZWF0ZShmaWxlQ3JlYXRlcywgdG9rZW4sIHRoaXMuX3VuZG9SZWRvSW5mbyk7XG5cblx0XHRyZXR1cm4gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlbGV0ZU9wZXJhdGlvbiwgdW5kb2VzLCB7IGlzVW5kb2luZzogdHJ1ZSB9KTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAoY3JlYXRlICR7dGhpcy5fZWRpdHMubWFwKGVkaXQgPT4gZWRpdC5vcHRpb25zLmZvbGRlciA/IGBmb2xkZXIgJHtlZGl0Lm5ld1VyaX1gIDogYGZpbGUgJHtlZGl0Lm5ld1VyaX0gd2l0aCAke2VkaXQuY29udGVudHM/LmJ5dGVMZW5ndGggfHwgMH0gYnl0ZXNgKS5qb2luKCcsICcpfSlgO1xuXHR9XG59XG5cbmNsYXNzIERlbGV0ZUVkaXQge1xuXHRyZWFkb25seSB0eXBlID0gJ2RlbGV0ZSc7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG9sZFVyaTogVVJJLFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IFdvcmtzcGFjZUZpbGVFZGl0T3B0aW9ucyxcblx0XHRyZWFkb25seSB1bmRvZXNDcmVhdGU6IGJvb2xlYW4sXG5cdCkgeyB9XG59XG5cbmNsYXNzIERlbGV0ZU9wZXJhdGlvbiBpbXBsZW1lbnRzIElGaWxlT3BlcmF0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9lZGl0czogRGVsZXRlRWRpdFtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvSW5mbzogSUZpbGVPcGVyYXRpb25VbmRvUmVkb0luZm8sXG5cdFx0QElXb3JraW5nQ29weUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdDb3B5RmlsZVNlcnZpY2U6IElXb3JraW5nQ29weUZpbGVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7IH1cblxuXHRnZXQgdXJpcygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdHMubWFwKGVkaXQgPT4gZWRpdC5vbGRVcmkpO1xuXHR9XG5cblx0YXN5bmMgcGVyZm9ybSh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElGaWxlT3BlcmF0aW9uPiB7XG5cdFx0Ly8gZGVsZXRlIGZpbGVcblxuXHRcdGNvbnN0IGRlbGV0ZXM6IElEZWxldGVPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHVuZG9lczogQ3JlYXRlRWRpdFtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5fZWRpdHMpIHtcblx0XHRcdGxldCBmaWxlU3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZmlsZVN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKGVkaXQub2xkVXJpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoIWVkaXQub3B0aW9ucy5pZ25vcmVJZk5vdEV4aXN0cykge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtlZGl0Lm9sZFVyaX0gZG9lcyBub3QgZXhpc3QgYW5kIGNhbiBub3QgYmUgZGVsZXRlZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWxldGVzLnB1c2goe1xuXHRcdFx0XHRyZXNvdXJjZTogZWRpdC5vbGRVcmksXG5cdFx0XHRcdHJlY3Vyc2l2ZTogZWRpdC5vcHRpb25zLnJlY3Vyc2l2ZSxcblx0XHRcdFx0dXNlVHJhc2g6ICFlZGl0Lm9wdGlvbnMuc2tpcFRyYXNoQmluICYmIHRoaXMuX2ZpbGVTZXJ2aWNlLmhhc0NhcGFiaWxpdHkoZWRpdC5vbGRVcmksIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5UcmFzaCkgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2ZpbGVzLmVuYWJsZVRyYXNoJylcblx0XHRcdH0pO1xuXG5cblx0XHRcdC8vIHJlYWQgZmlsZSBjb250ZW50cyBmb3IgdW5kbyBvcGVyYXRpb24uIHdoZW4gYSBmaWxlIGlzIHRvbyBsYXJnZSBpdCB3b24ndCBiZSByZXN0b3JlZFxuXHRcdFx0bGV0IGZpbGVDb250ZW50OiBJRmlsZUNvbnRlbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZmlsZUNvbnRlbnRFeGNlZWRzTWF4U2l6ZSA9IGZhbHNlO1xuXHRcdFx0aWYgKCFlZGl0LnVuZG9lc0NyZWF0ZSAmJiAhZWRpdC5vcHRpb25zLmZvbGRlcikge1xuXHRcdFx0XHRmaWxlQ29udGVudEV4Y2VlZHNNYXhTaXplID0gdHlwZW9mIGVkaXQub3B0aW9ucy5tYXhTaXplID09PSAnbnVtYmVyJyAmJiBmaWxlU3RhdC5zaXplID4gZWRpdC5vcHRpb25zLm1heFNpemU7XG5cdFx0XHRcdGlmICghZmlsZUNvbnRlbnRFeGNlZWRzTWF4U2l6ZSkge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKGVkaXQub2xkVXJpKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghZmlsZUNvbnRlbnRFeGNlZWRzTWF4U2l6ZSkge1xuXHRcdFx0XHR1bmRvZXMucHVzaChuZXcgQ3JlYXRlRWRpdChlZGl0Lm9sZFVyaSwgZWRpdC5vcHRpb25zLCBmaWxlQ29udGVudD8udmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGVsZXRlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBuZXcgTm9vcCgpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3dvcmtpbmdDb3B5RmlsZVNlcnZpY2UuZGVsZXRlKGRlbGV0ZXMsIHRva2VuLCB0aGlzLl91bmRvUmVkb0luZm8pO1xuXG5cdFx0aWYgKHVuZG9lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBuZXcgTm9vcCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENyZWF0ZU9wZXJhdGlvbiwgdW5kb2VzLCB7IGlzVW5kb2luZzogdHJ1ZSB9KTtcblx0fVxuXG5cdHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAoZGVsZXRlICR7dGhpcy5fZWRpdHMubWFwKGVkaXQgPT4gZWRpdC5vbGRVcmkpLmpvaW4oJywgJyl9KWA7XG5cdH1cbn1cblxuY2xhc3MgRmlsZVVuZG9SZWRvRWxlbWVudCBpbXBsZW1lbnRzIElXb3Jrc3BhY2VVbmRvUmVkb0VsZW1lbnQge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSBVbmRvUmVkb0VsZW1lbnRUeXBlLldvcmtzcGFjZTtcblxuXHRyZWFkb25seSByZXNvdXJjZXM6IHJlYWRvbmx5IFVSSVtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgY29kZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IG9wZXJhdGlvbnM6IElGaWxlT3BlcmF0aW9uW10sXG5cdFx0cmVhZG9ubHkgY29uZmlybUJlZm9yZVVuZG86IGJvb2xlYW5cblx0KSB7XG5cdFx0dGhpcy5yZXNvdXJjZXMgPSBvcGVyYXRpb25zLmZsYXRNYXAob3AgPT4gb3AudXJpcyk7XG5cdH1cblxuXHRhc3luYyB1bmRvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JldmVyc2UoKTtcblx0fVxuXG5cdGFzeW5jIHJlZG8oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmV2ZXJzZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmV2ZXJzZSgpIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMub3BlcmF0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3Qgb3AgPSB0aGlzLm9wZXJhdGlvbnNbaV07XG5cdFx0XHRjb25zdCB1bmRvID0gYXdhaXQgb3AucGVyZm9ybShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdHRoaXMub3BlcmF0aW9uc1tpXSA9IHVuZG87XG5cdFx0fVxuXHR9XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5vcGVyYXRpb25zLm1hcChvcCA9PiBTdHJpbmcob3ApKS5qb2luKCcsICcpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCdWxrRmlsZUVkaXRzIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvZGU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvU291cmNlOiBVbmRvUmVkb1NvdXJjZSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maXJtQmVmb3JlVW5kbzogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzczogSVByb2dyZXNzPHZvaWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0czogUmVzb3VyY2VGaWxlRWRpdFtdLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVbmRvUmVkb1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIGFwcGx5KCk6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHRjb25zdCB1bmRvT3BlcmF0aW9uczogSUZpbGVPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHVuZG9SZWRvSW5mbyA9IHsgdW5kb1JlZG9Hcm91cElkOiB0aGlzLl91bmRvUmVkb0dyb3VwLmlkIH07XG5cblx0XHRjb25zdCBlZGl0czogQXJyYXk8UmVuYW1lRWRpdCB8IENvcHlFZGl0IHwgRGVsZXRlRWRpdCB8IENyZWF0ZUVkaXQ+ID0gW107XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMuX2VkaXRzKSB7XG5cdFx0XHRpZiAoZWRpdC5uZXdSZXNvdXJjZSAmJiBlZGl0Lm9sZFJlc291cmNlICYmICFlZGl0Lm9wdGlvbnM/LmNvcHkpIHtcblx0XHRcdFx0ZWRpdHMucHVzaChuZXcgUmVuYW1lRWRpdChlZGl0Lm5ld1Jlc291cmNlLCBlZGl0Lm9sZFJlc291cmNlLCBlZGl0Lm9wdGlvbnMgPz8ge30pKTtcblx0XHRcdH0gZWxzZSBpZiAoZWRpdC5uZXdSZXNvdXJjZSAmJiBlZGl0Lm9sZFJlc291cmNlICYmIGVkaXQub3B0aW9ucz8uY29weSkge1xuXHRcdFx0XHRlZGl0cy5wdXNoKG5ldyBDb3B5RWRpdChlZGl0Lm5ld1Jlc291cmNlLCBlZGl0Lm9sZFJlc291cmNlLCBlZGl0Lm9wdGlvbnMgPz8ge30pKTtcblx0XHRcdH0gZWxzZSBpZiAoIWVkaXQubmV3UmVzb3VyY2UgJiYgZWRpdC5vbGRSZXNvdXJjZSkge1xuXHRcdFx0XHRlZGl0cy5wdXNoKG5ldyBEZWxldGVFZGl0KGVkaXQub2xkUmVzb3VyY2UsIGVkaXQub3B0aW9ucyA/PyB7fSwgZmFsc2UpKTtcblx0XHRcdH0gZWxzZSBpZiAoZWRpdC5uZXdSZXNvdXJjZSAmJiAhZWRpdC5vbGRSZXNvdXJjZSkge1xuXHRcdFx0XHRlZGl0cy5wdXNoKG5ldyBDcmVhdGVFZGl0KGVkaXQubmV3UmVzb3VyY2UsIGVkaXQub3B0aW9ucyA/PyB7fSwgYXdhaXQgZWRpdC5vcHRpb25zLmNvbnRlbnRzKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdyb3VwczogQXJyYXk8UmVuYW1lRWRpdCB8IENvcHlFZGl0IHwgRGVsZXRlRWRpdCB8IENyZWF0ZUVkaXQ+W10gPSBbXTtcblx0XHRncm91cHNbMF0gPSBbZWRpdHNbMF1dO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBlZGl0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZWRpdCA9IGVkaXRzW2ldO1xuXHRcdFx0Y29uc3QgbGFzdEdyb3VwID0gZ3JvdXBzLmF0KC0xKTtcblx0XHRcdGlmIChsYXN0R3JvdXA/LlswXS50eXBlID09PSBlZGl0LnR5cGUpIHtcblx0XHRcdFx0bGFzdEdyb3VwLnB1c2goZWRpdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRncm91cHMucHVzaChbZWRpdF0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cblx0XHRcdGlmICh0aGlzLl90b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0bGV0IG9wOiBJRmlsZU9wZXJhdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRcdHN3aXRjaCAoZ3JvdXBbMF0udHlwZSkge1xuXHRcdFx0XHRjYXNlICdyZW5hbWUnOlxuXHRcdFx0XHRcdG9wID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbmFtZU9wZXJhdGlvbiwgPFJlbmFtZUVkaXRbXT5ncm91cCwgdW5kb1JlZG9JbmZvKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnY29weSc6XG5cdFx0XHRcdFx0b3AgPSB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29weU9wZXJhdGlvbiwgPENvcHlFZGl0W10+Z3JvdXAsIHVuZG9SZWRvSW5mbyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2RlbGV0ZSc6XG5cdFx0XHRcdFx0b3AgPSB0aGlzLl9pbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVsZXRlT3BlcmF0aW9uLCA8RGVsZXRlRWRpdFtdPmdyb3VwLCB1bmRvUmVkb0luZm8pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdjcmVhdGUnOlxuXHRcdFx0XHRcdG9wID0gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENyZWF0ZU9wZXJhdGlvbiwgPENyZWF0ZUVkaXRbXT5ncm91cCwgdW5kb1JlZG9JbmZvKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9wKSB7XG5cdFx0XHRcdGNvbnN0IHVuZG9PcCA9IGF3YWl0IG9wLnBlcmZvcm0odGhpcy5fdG9rZW4pO1xuXHRcdFx0XHR1bmRvT3BlcmF0aW9ucy5wdXNoKHVuZG9PcCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm9ncmVzcy5yZXBvcnQodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCB1bmRvUmVkb0VsZW1lbnQgPSBuZXcgRmlsZVVuZG9SZWRvRWxlbWVudCh0aGlzLl9sYWJlbCwgdGhpcy5fY29kZSwgdW5kb09wZXJhdGlvbnMsIHRoaXMuX2NvbmZpcm1CZWZvcmVVbmRvKTtcblx0XHR0aGlzLl91bmRvUmVkb1NlcnZpY2UucHVzaEVsZW1lbnQodW5kb1JlZG9FbGVtZW50LCB0aGlzLl91bmRvUmVkb0dyb3VwLCB0aGlzLl91bmRvUmVkb1NvdXJjZSk7XG5cdFx0cmV0dXJuIHVuZG9SZWRvRWxlbWVudC5yZXNvdXJjZXM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBUyxjQUFjLHNDQUEyRTtBQUVsRyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUFxSjtBQUM5SixTQUFvQyxxQkFBcUIsd0JBQXVEO0FBRWhILFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBRzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQU94QixNQUFNLEtBQStCO0FBQUEsRUFBckM7QUFDQyxTQUFTLE9BQU8sQ0FBQztBQUFBO0FBQUEsRUFDakIsTUFBTSxVQUFVO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUMvQixXQUFtQjtBQUNsQixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsTUFBTSxXQUFXO0FBQUEsRUFFaEIsWUFDVSxRQUNBLFFBQ0EsU0FDUjtBQUhRO0FBQ0E7QUFDQTtBQUpWLFNBQVMsT0FBTztBQUFBLEVBS1o7QUFDTDtBQUVBLElBQU0sa0JBQU4sTUFBZ0Q7QUFBQSxFQUUvQyxZQUNrQixRQUNBLGVBQ3lCLHlCQUNYLGNBQzlCO0FBSmdCO0FBQ0E7QUFDeUI7QUFDWDtBQUFBLEVBQzVCO0FBQUEsRUFFSixJQUFJLE9BQU87QUFDVixXQUFPLEtBQUssT0FBTyxRQUFRLFVBQVEsQ0FBQyxLQUFLLFFBQVEsS0FBSyxNQUFNLENBQUM7QUFBQSxFQUM5RDtBQUFBLEVBRUEsTUFBTSxRQUFRLE9BQW1EO0FBRWhFLFVBQU0sUUFBMEIsQ0FBQztBQUNqQyxVQUFNLFNBQXVC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
