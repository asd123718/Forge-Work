import { CancellationToken } from "../../../base/common/cancellation.js";
import { hash } from "../../../base/common/hash.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { joinPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import * as typeConverters from "./extHostTypeConverters.js";
import { shouldSerializeBuffersForPostMessage, toExtensionData } from "./extHostWebview.js";
import { Cache } from "./cache.js";
import * as extHostProtocol from "./extHost.protocol.js";
import * as extHostTypes from "./extHostTypes.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
class CustomDocumentStoreEntry {
  constructor(document, _storagePath) {
    this.document = document;
    this._storagePath = _storagePath;
    this._backupCounter = 1;
    this._edits = new Cache("custom documents");
  }
  addEdit(item) {
    return this._edits.add([item]);
  }
  async undo(editId, isDirty) {
    await this.getEdit(editId).undo();
    if (!isDirty) {
      this.disposeBackup();
    }
  }
  async redo(editId, isDirty) {
    await this.getEdit(editId).redo();
    if (!isDirty) {
      this.disposeBackup();
    }
  }
  disposeEdits(editIds) {
    for (const id of editIds) {
      this._edits.delete(id);
    }
  }
  getNewBackupUri() {
    if (!this._storagePath) {
      throw new Error("Backup requires a valid storage path");
    }
    const fileName = hashPath(this.document.uri) + this._backupCounter++;
    return joinPath(this._storagePath, fileName);
  }
  updateBackup(backup) {
    this._backup?.delete();
    this._backup = backup;
  }
  disposeBackup() {
    this._backup?.delete();
    this._backup = void 0;
  }
  getEdit(editId) {
    const edit = this._edits.get(editId, 0);
    if (!edit) {
      throw new Error("No edit found");
    }
    return edit;
  }
}
class CustomDocumentStore {
  constructor() {
    this._documents = /* @__PURE__ */ new Map();
  }
  get(viewType, resource) {
    return this._documents.get(this.key(viewType, resource));
  }
  add(viewType, document, storagePath) {
    const key = this.key(viewType, document.uri);
    if (this._documents.has(key)) {
      throw new Error(`Document already exists for viewType:${viewType} resource:${document.uri}`);
    }
    const entry = new CustomDocumentStoreEntry(document, storagePath);
    this._documents.set(key, entry);
    return entry;
  }
  delete(viewType, resource) {
    const key = this.key(viewType, resource);
    this._documents.delete(key);
  }
  key(viewType, resource) {
    return `${viewType}@@@${resource}`;
  }
}
var CustomEditorType = /* @__PURE__ */ ((CustomEditorType2) => {
  CustomEditorType2[CustomEditorType2["Text"] = 0] = "Text";
  CustomEditorType2[CustomEditorType2["Custom"] = 1] = "Custom";
  return CustomEditorType2;
})(CustomEditorType || {});
class EditorProviderStore {
  constructor() {
    this._providers = /* @__PURE__ */ new Map();
  }
  addTextProvider(viewType, extension, provider) {
    return this.add(viewType, { type: 0 /* Text */, extension, provider });
  }
  addCustomProvider(viewType, extension, provider) {
    return this.add(viewType, { type: 1 /* Custom */, extension, provider });
  }
  get(viewType) {
    return this._providers.get(viewType);
  }
  add(viewType, entry) {
    if (this._providers.has(viewType)) {
      throw new Error(`Provider for viewType:${viewType} already registered`);
    }
    this._providers.set(viewType, entry);
    return new extHostTypes.Disposable(() => this._providers.delete(viewType));
  }
}
class ExtHostCustomEditors {
  constructor(mainContext, _extHostDocuments, _extensionStoragePaths, _extHostWebview, _extHostWebviewPanels) {
    this._extHostDocuments = _extHostDocuments;
    this._extensionStoragePaths = _extensionStoragePaths;
    this._extHostWebview = _extHostWebview;
    this._extHostWebviewPanels = _extHostWebviewPanels;
    this._editorProviders = new EditorProviderStore();
    this._documents = new CustomDocumentStore();
    this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadCustomEditors);
  }
  registerCustomEditorProvider(extension, viewType, provider, options) {
    const disposables = new DisposableStore();
    if (isCustomTextEditorProvider(provider)) {
      disposables.add(this._editorProviders.addTextProvider(viewType, extension, provider));
      this._proxy.$registerTextEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, {
        supportsMove: !!provider.moveCustomTextEditor,
        supportsInlineDiff: isProposedApiEnabled(extension, "customEditorDiffs") && isCustomTextEditorProviderWithInlineDiffCapability(provider),
        supportsSideBySideDiff: isProposedApiEnabled(extension, "customEditorDiffs") && isCustomTextEditorProviderWithSideBySideDiffCapability(provider)
      }, shouldSerializeBuffersForPostMessage(extension));
    } else {
      disposables.add(this._editorProviders.addCustomProvider(viewType, extension, provider));
      const supportsCustomEditorDiffs = isProposedApiEnabled(extension, "customEditorDiffs");
      if (isCustomEditorProviderWithEditingCapability(provider)) {
        disposables.add(provider.onDidChangeCustomDocument((e) => {
          const entry = this.getCustomDocumentEntry(viewType, e.document.uri);
          if (isEditEvent(e)) {
            const editId = entry.addEdit(e);
            this._proxy.$onDidEdit(e.document.uri, viewType, editId, e.label);
          } else {
            this._proxy.$onContentChange(e.document.uri, viewType);
          }
        }));
      }
      this._proxy.$registerCustomEditorProvider(toExtensionData(extension), viewType, options.webviewOptions || {}, {
        supportsInlineDiff: supportsCustomEditorDiffs && isCustomEditorProviderWithInlineDiffCapability(provider),
        supportsSideBySideDiff: supportsCustomEditorDiffs && isCustomEditorProviderWithSideBySideDiffCapability(provider)
      }, !!options.supportsMultipleEditorsPerDocument, shouldSerializeBuffersForPostMessage(extension));
    }
    return extHostTypes.Disposable.from(
      disposables,
      new extHostTypes.Disposable(() => {
        this._proxy.$unregisterEditorProvider(viewType);
      })
    );
  }
  async $createCustomDocument(resource, viewType, backupId, untitledDocumentData, cancellation) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    if (entry.type !== 1 /* Custom */) {
      throw new Error(`Invalid provide type for '${viewType}'`);
    }
    const revivedResource = URI.revive(resource);
    const document = await entry.provider.openCustomDocument(revivedResource, { backupId, untitledDocumentData: untitledDocumentData?.buffer }, cancellation);
    let storageRoot;
    if (isCustomEditorProviderWithEditingCapability(entry.provider) && this._extensionStoragePaths) {
      storageRoot = this._extensionStoragePaths.workspaceValue(entry.extension) ?? this._extensionStoragePaths.globalValue(entry.extension);
    }
    this._documents.add(viewType, document, storageRoot);
    return { editable: isCustomEditorProviderWithEditingCapability(entry.provider) };
  }
  async $disposeCustomDocument(resource, viewType) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    if (entry.type !== 1 /* Custom */) {
      throw new Error(`Invalid provider type for '${viewType}'`);
    }
    const revivedResource = URI.revive(resource);
    const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
    this._documents.delete(viewType, revivedResource);
    document.dispose();
  }
  async $resolveCustomEditor(resource, handle, viewType, initData, position, cancellation) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    const viewColumn = typeConverters.ViewColumn.to(position);
    const webview = this._extHostWebview.createNewWebview(handle, initData.contentOptions, entry.extension);
    this._extHostWebview.ensureDefaultContentOptions(handle, initData.contentOptions, entry.extension);
    const panel = this._extHostWebviewPanels.createNewWebviewPanel(handle, viewType, initData.title, viewColumn, initData.options, webview, initData.active);
    const revivedResource = URI.revive(resource);
    switch (entry.type) {
      case 1 /* Custom */: {
        const { document } = this.getCustomDocumentEntry(viewType, revivedResource);
        return entry.provider.resolveCustomEditor(document, panel, cancellation);
      }
      case 0 /* Text */: {
        const document = this._extHostDocuments.getDocument(revivedResource);
        return entry.provider.resolveCustomTextEditor(document, panel, cancellation);
      }
      default: {
        throw new Error("Unknown webview provider type");
      }
    }
  }
  async $resolveCustomEditorInlineDiff(originalResource, modifiedResource, handle, viewType, initData, position, cancellation) {
    const { entry, panel } = this.createCustomEditorDiffPanel(handle, viewType, initData, position);
    const revivedOriginalResource = URI.revive(originalResource);
    const revivedModifiedResource = URI.revive(modifiedResource);
    if (entry.type === 0 /* Text */) {
      if (!isCustomTextEditorProviderWithInlineDiffCapability(entry.provider)) {
        throw new Error(`Provider for '${viewType}' does not support inline custom text editor diffs`);
      }
      const originalDocument2 = this._extHostDocuments.getDocument(revivedOriginalResource);
      const modifiedDocument2 = this._extHostDocuments.getDocument(revivedModifiedResource);
      return entry.provider.resolveCustomTextEditorInlineDiff({ original: originalDocument2, modified: modifiedDocument2 }, panel, cancellation);
    }
    if (!isCustomEditorProviderWithInlineDiffCapability(entry.provider)) {
      throw new Error(`Provider for '${viewType}' does not support inline custom editor diffs`);
    }
    const { document: originalDocument } = this.getCustomDocumentEntry(viewType, revivedOriginalResource);
    const { document: modifiedDocument } = this.getCustomDocumentEntry(viewType, revivedModifiedResource);
    return entry.provider.resolveCustomEditorInlineDiff({ original: originalDocument, modified: modifiedDocument }, panel, cancellation);
  }
  async $resolveCustomEditorSideBySideDiff(originalResource, modifiedResource, webviewHandles, viewType, initData, position, cancellation) {
    const { entry, panel: originalPanel } = this.createCustomEditorDiffPanel(webviewHandles.original, viewType, initData.original, position);
    const { panel: modifiedPanel } = this.createCustomEditorDiffPanel(webviewHandles.modified, viewType, initData.modified, position);
    const revivedOriginalResource = URI.revive(originalResource);
    const revivedModifiedResource = URI.revive(modifiedResource);
    if (entry.type === 0 /* Text */) {
      if (!isCustomTextEditorProviderWithSideBySideDiffCapability(entry.provider)) {
        throw new Error(`Provider for '${viewType}' does not support side by side custom text editor diffs`);
      }
      const originalDocument2 = this._extHostDocuments.getDocument(revivedOriginalResource);
      const modifiedDocument2 = this._extHostDocuments.getDocument(revivedModifiedResource);
      return entry.provider.resolveCustomTextEditorSideBySideDiff({ original: originalDocument2, modified: modifiedDocument2 }, { original: originalPanel, modified: modifiedPanel }, cancellation);
    }
    if (!isCustomEditorProviderWithSideBySideDiffCapability(entry.provider)) {
      throw new Error(`Provider for '${viewType}' does not support side by side custom editor diffs`);
    }
    const { document: originalDocument } = this.getCustomDocumentEntry(viewType, revivedOriginalResource);
    const { document: modifiedDocument } = this.getCustomDocumentEntry(viewType, revivedModifiedResource);
    return entry.provider.resolveCustomEditorSideBySideDiff({ original: originalDocument, modified: modifiedDocument }, { original: originalPanel, modified: modifiedPanel }, cancellation);
  }
  createCustomEditorDiffPanel(handle, viewType, initData, position) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    const viewColumn = typeConverters.ViewColumn.to(position);
    const webview = this._extHostWebview.createNewWebview(handle, initData.contentOptions, entry.extension);
    this._extHostWebview.ensureDefaultContentOptions(handle, initData.contentOptions, entry.extension);
    const panel = this._extHostWebviewPanels.createNewWebviewPanel(handle, viewType, initData.title, viewColumn, initData.options, webview, initData.active);
    return { entry, panel };
  }
  $disposeEdits(resourceComponents, viewType, editIds) {
    const document = this.getCustomDocumentEntry(viewType, resourceComponents);
    document.disposeEdits(editIds);
  }
  async $onMoveCustomEditor(handle, newResourceComponents, viewType) {
    const entry = this._editorProviders.get(viewType);
    if (!entry) {
      throw new Error(`No provider found for '${viewType}'`);
    }
    if (!entry.provider.moveCustomTextEditor) {
      throw new Error(`Provider does not implement move '${viewType}'`);
    }
    const webview = this._extHostWebviewPanels.getWebviewPanel(handle);
    if (!webview) {
      throw new Error(`No webview found`);
    }
    const resource = URI.revive(newResourceComponents);
    const document = this._extHostDocuments.getDocument(resource);
    await entry.provider.moveCustomTextEditor(document, webview, CancellationToken.None);
  }
  async $undo(resourceComponents, viewType, editId, isDirty) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    return entry.undo(editId, isDirty);
  }
  async $redo(resourceComponents, viewType, editId, isDirty) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    return entry.redo(editId, isDirty);
  }
  async $revert(resourceComponents, viewType, cancellation) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    const provider = this.getCustomEditorProvider(viewType);
    await provider.revertCustomDocument(entry.document, cancellation);
    entry.disposeBackup();
  }
  async $onSave(resourceComponents, viewType, cancellation) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    const provider = this.getCustomEditorProvider(viewType);
    await provider.saveCustomDocument(entry.document, cancellation);
    entry.disposeBackup();
  }
  async $onSaveAs(resourceComponents, viewType, targetResource, cancellation) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    const provider = this.getCustomEditorProvider(viewType);
    return provider.saveCustomDocumentAs(entry.document, URI.revive(targetResource), cancellation);
  }
  async $backup(resourceComponents, viewType, cancellation) {
    const entry = this.getCustomDocumentEntry(viewType, resourceComponents);
    const provider = this.getCustomEditorProvider(viewType);
    const backup = await provider.backupCustomDocument(entry.document, {
      destination: entry.getNewBackupUri()
    }, cancellation);
    entry.updateBackup(backup);
    return backup.id;
  }
  getCustomDocumentEntry(viewType, resource) {
    const entry = this._documents.get(viewType, URI.revive(resource));
    if (!entry) {
      throw new Error("No custom document found");
    }
    return entry;
  }
  getCustomEditorProvider(viewType) {
    const entry = this._editorProviders.get(viewType);
    const provider = entry?.provider;
    if (!provider || !isCustomEditorProviderWithEditingCapability(provider)) {
      throw new Error("Custom document is not editable");
    }
    return provider;
  }
}
function isCustomEditorProviderWithEditingCapability(provider) {
  return !!provider.onDidChangeCustomDocument;
}
function isCustomTextEditorProvider(provider) {
  return typeof provider.resolveCustomTextEditor === "function";
}
function isCustomTextEditorProviderWithInlineDiffCapability(provider) {
  return typeof provider.resolveCustomTextEditorInlineDiff === "function";
}
function isCustomTextEditorProviderWithSideBySideDiffCapability(provider) {
  return typeof provider.resolveCustomTextEditorSideBySideDiff === "function";
}
function isCustomEditorProviderWithInlineDiffCapability(provider) {
  return typeof provider.resolveCustomEditorInlineDiff === "function";
}
function isCustomEditorProviderWithSideBySideDiffCapability(provider) {
  return typeof provider.resolveCustomEditorSideBySideDiff === "function";
}
function isEditEvent(e) {
  return typeof e.undo === "function" && typeof e.redo === "function";
}
function hashPath(resource) {
  const str = resource.scheme === Schemas.file || resource.scheme === Schemas.untitled ? resource.fsPath : resource.toString();
  return hash(str) + "";
}
export {
  ExtHostCustomEditors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Q3VzdG9tRWRpdG9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TdG9yYWdlUGF0aHMgfSBmcm9tICcuL2V4dEhvc3RTdG9yYWdlUGF0aHMuanMnO1xuaW1wb3J0ICogYXMgdHlwZUNvbnZlcnRlcnMgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFdlYnZpZXdzLCBzaG91bGRTZXJpYWxpemVCdWZmZXJzRm9yUG9zdE1lc3NhZ2UsIHRvRXh0ZW5zaW9uRGF0YSB9IGZyb20gJy4vZXh0SG9zdFdlYnZpZXcuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFdlYnZpZXdQYW5lbHMgfSBmcm9tICcuL2V4dEhvc3RXZWJ2aWV3UGFuZWxzLmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwQ29sdW1uIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgQ2FjaGUgfSBmcm9tICcuL2NhY2hlLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RQcm90b2NvbCBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cblxuY2xhc3MgQ3VzdG9tRG9jdW1lbnRTdG9yZUVudHJ5IHtcblxuXHRwcml2YXRlIF9iYWNrdXBDb3VudGVyID0gMTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZG9jdW1lbnQ6IHZzY29kZS5DdXN0b21Eb2N1bWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlUGF0aDogVVJJIHwgdW5kZWZpbmVkLFxuXHQpIHsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRzID0gbmV3IENhY2hlPHZzY29kZS5DdXN0b21Eb2N1bWVudEVkaXRFdmVudD4oJ2N1c3RvbSBkb2N1bWVudHMnKTtcblxuXHRwcml2YXRlIF9iYWNrdXA/OiB2c2NvZGUuQ3VzdG9tRG9jdW1lbnRCYWNrdXA7XG5cblx0YWRkRWRpdChpdGVtOiB2c2NvZGUuQ3VzdG9tRG9jdW1lbnRFZGl0RXZlbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0cy5hZGQoW2l0ZW1dKTtcblx0fVxuXG5cdGFzeW5jIHVuZG8oZWRpdElkOiBudW1iZXIsIGlzRGlydHk6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmdldEVkaXQoZWRpdElkKS51bmRvKCk7XG5cdFx0aWYgKCFpc0RpcnR5KSB7XG5cdFx0XHR0aGlzLmRpc3Bvc2VCYWNrdXAoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWRvKGVkaXRJZDogbnVtYmVyLCBpc0RpcnR5OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5nZXRFZGl0KGVkaXRJZCkucmVkbygpO1xuXHRcdGlmICghaXNEaXJ0eSkge1xuXHRcdFx0dGhpcy5kaXNwb3NlQmFja3VwKCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZUVkaXRzKGVkaXRJZHM6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBlZGl0SWRzKSB7XG5cdFx0XHR0aGlzLl9lZGl0cy5kZWxldGUoaWQpO1xuXHRcdH1cblx0fVxuXG5cdGdldE5ld0JhY2t1cFVyaSgpOiBVUkkge1xuXHRcdGlmICghdGhpcy5fc3RvcmFnZVBhdGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQmFja3VwIHJlcXVpcmVzIGEgdmFsaWQgc3RvcmFnZSBwYXRoJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbGVOYW1lID0gaGFzaFBhdGgodGhpcy5kb2N1bWVudC51cmkpICsgKHRoaXMuX2JhY2t1cENvdW50ZXIrKyk7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKHRoaXMuX3N0b3JhZ2VQYXRoLCBmaWxlTmFtZSk7XG5cdH1cblxuXHR1cGRhdGVCYWNrdXAoYmFja3VwOiB2c2NvZGUuQ3VzdG9tRG9jdW1lbnRCYWNrdXApOiB2b2lkIHtcblx0XHR0aGlzLl9iYWNrdXA/LmRlbGV0ZSgpO1xuXHRcdHRoaXMuX2JhY2t1cCA9IGJhY2t1cDtcblx0fVxuXG5cdGRpc3Bvc2VCYWNrdXAoKTogdm9pZCB7XG5cdFx0dGhpcy5fYmFja3VwPy5kZWxldGUoKTtcblx0XHR0aGlzLl9iYWNrdXAgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEVkaXQoZWRpdElkOiBudW1iZXIpOiB2c2NvZGUuQ3VzdG9tRG9jdW1lbnRFZGl0RXZlbnQge1xuXHRcdGNvbnN0IGVkaXQgPSB0aGlzLl9lZGl0cy5nZXQoZWRpdElkLCAwKTtcblx0XHRpZiAoIWVkaXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gZWRpdCBmb3VuZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gZWRpdDtcblx0fVxufVxuXG5jbGFzcyBDdXN0b21Eb2N1bWVudFN0b3JlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIEN1c3RvbURvY3VtZW50U3RvcmVFbnRyeT4oKTtcblxuXHRwdWJsaWMgZ2V0KHZpZXdUeXBlOiBzdHJpbmcsIHJlc291cmNlOiB2c2NvZGUuVXJpKTogQ3VzdG9tRG9jdW1lbnRTdG9yZUVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZG9jdW1lbnRzLmdldCh0aGlzLmtleSh2aWV3VHlwZSwgcmVzb3VyY2UpKTtcblx0fVxuXG5cdHB1YmxpYyBhZGQodmlld1R5cGU6IHN0cmluZywgZG9jdW1lbnQ6IHZzY29kZS5DdXN0b21Eb2N1bWVudCwgc3RvcmFnZVBhdGg6IFVSSSB8IHVuZGVmaW5lZCk6IEN1c3RvbURvY3VtZW50U3RvcmVFbnRyeSB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5rZXkodmlld1R5cGUsIGRvY3VtZW50LnVyaSk7XG5cdFx0aWYgKHRoaXMuX2RvY3VtZW50cy5oYXMoa2V5KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBEb2N1bWVudCBhbHJlYWR5IGV4aXN0cyBmb3Igdmlld1R5cGU6JHt2aWV3VHlwZX0gcmVzb3VyY2U6JHtkb2N1bWVudC51cml9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJ5ID0gbmV3IEN1c3RvbURvY3VtZW50U3RvcmVFbnRyeShkb2N1bWVudCwgc3RvcmFnZVBhdGgpO1xuXHRcdHRoaXMuX2RvY3VtZW50cy5zZXQoa2V5LCBlbnRyeSk7XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHVibGljIGRlbGV0ZSh2aWV3VHlwZTogc3RyaW5nLCByZXNvdXJjZTogdnNjb2RlLlVyaSkge1xuXHRcdC8vIFVzZSB0aGUgcmVzb3VyY2UgcGFyYW1ldGVyIGRpcmVjdGx5IGluc3RlYWQgb2YgZG9jdW1lbnQudXJpLCBiZWNhdXNlIHRoZSBkb2N1bWVudCdzXG5cdFx0Ly8gVVJJIG1heSBoYXZlIGNoYW5nZWQgKGUuZy4sIGFmdGVyIFNhdmVBcyBmcm9tIHVudGl0bGVkIHRvIGEgZmlsZSBwYXRoKS5cblx0XHRjb25zdCBrZXkgPSB0aGlzLmtleSh2aWV3VHlwZSwgcmVzb3VyY2UpO1xuXHRcdHRoaXMuX2RvY3VtZW50cy5kZWxldGUoa2V5KTtcblx0fVxuXG5cdHByaXZhdGUga2V5KHZpZXdUeXBlOiBzdHJpbmcsIHJlc291cmNlOiB2c2NvZGUuVXJpKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dmlld1R5cGV9QEBAJHtyZXNvdXJjZX1gO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gQ3VzdG9tRWRpdG9yVHlwZSB7XG5cdFRleHQsXG5cdEN1c3RvbVxufVxuXG50eXBlIFByb3ZpZGVyRW50cnkgPSB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRyZWFkb25seSB0eXBlOiBDdXN0b21FZGl0b3JUeXBlLlRleHQ7XG5cdHJlYWRvbmx5IHByb3ZpZGVyOiB2c2NvZGUuQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyO1xufSB8IHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdHJlYWRvbmx5IHR5cGU6IEN1c3RvbUVkaXRvclR5cGUuQ3VzdG9tO1xuXHRyZWFkb25seSBwcm92aWRlcjogdnNjb2RlLkN1c3RvbVJlYWRvbmx5RWRpdG9yUHJvdmlkZXI7XG59O1xuXG5jbGFzcyBFZGl0b3JQcm92aWRlclN0b3JlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIFByb3ZpZGVyRW50cnk+KCk7XG5cblx0cHVibGljIGFkZFRleHRQcm92aWRlcih2aWV3VHlwZTogc3RyaW5nLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcHJvdmlkZXI6IHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuYWRkKHZpZXdUeXBlLCB7IHR5cGU6IEN1c3RvbUVkaXRvclR5cGUuVGV4dCwgZXh0ZW5zaW9uLCBwcm92aWRlciB9KTtcblx0fVxuXG5cdHB1YmxpYyBhZGRDdXN0b21Qcm92aWRlcih2aWV3VHlwZTogc3RyaW5nLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcHJvdmlkZXI6IHZzY29kZS5DdXN0b21SZWFkb25seUVkaXRvclByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLmFkZCh2aWV3VHlwZSwgeyB0eXBlOiBDdXN0b21FZGl0b3JUeXBlLkN1c3RvbSwgZXh0ZW5zaW9uLCBwcm92aWRlciB9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQodmlld1R5cGU6IHN0cmluZyk6IFByb3ZpZGVyRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlcnMuZ2V0KHZpZXdUeXBlKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkKHZpZXdUeXBlOiBzdHJpbmcsIGVudHJ5OiBQcm92aWRlckVudHJ5KTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLl9wcm92aWRlcnMuaGFzKHZpZXdUeXBlKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm92aWRlciBmb3Igdmlld1R5cGU6JHt2aWV3VHlwZX0gYWxyZWFkeSByZWdpc3RlcmVkYCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQodmlld1R5cGUsIGVudHJ5KTtcblx0XHRyZXR1cm4gbmV3IGV4dEhvc3RUeXBlcy5EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3Byb3ZpZGVycy5kZWxldGUodmlld1R5cGUpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdEN1c3RvbUVkaXRvcnMgaW1wbGVtZW50cyBleHRIb3N0UHJvdG9jb2wuRXh0SG9zdEN1c3RvbUVkaXRvcnNTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IGV4dEhvc3RQcm90b2NvbC5NYWluVGhyZWFkQ3VzdG9tRWRpdG9yc1NoYXBlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclByb3ZpZGVycyA9IG5ldyBFZGl0b3JQcm92aWRlclN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9jdW1lbnRzID0gbmV3IEN1c3RvbURvY3VtZW50U3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtYWluQ29udGV4dDogZXh0SG9zdFByb3RvY29sLklNYWluQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0RG9jdW1lbnRzOiBFeHRIb3N0RG9jdW1lbnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblN0b3JhZ2VQYXRoczogSUV4dGVuc2lvblN0b3JhZ2VQYXRocyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0V2VidmlldzogRXh0SG9zdFdlYnZpZXdzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RXZWJ2aWV3UGFuZWxzOiBFeHRIb3N0V2Vidmlld1BhbmVscyxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShleHRIb3N0UHJvdG9jb2wuTWFpbkNvbnRleHQuTWFpblRocmVhZEN1c3RvbUVkaXRvcnMpO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyQ3VzdG9tRWRpdG9yUHJvdmlkZXIoXG5cdFx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0dmlld1R5cGU6IHN0cmluZyxcblx0XHRwcm92aWRlcjogdnNjb2RlLkN1c3RvbVJlYWRvbmx5RWRpdG9yUHJvdmlkZXIgfCB2c2NvZGUuQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyLFxuXHRcdG9wdGlvbnM6IHsgd2Vidmlld09wdGlvbnM/OiB2c2NvZGUuV2Vidmlld1BhbmVsT3B0aW9uczsgc3VwcG9ydHNNdWx0aXBsZUVkaXRvcnNQZXJEb2N1bWVudD86IGJvb2xlYW4gfSxcblx0KTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGlmIChpc0N1c3RvbVRleHRFZGl0b3JQcm92aWRlcihwcm92aWRlcikpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3JQcm92aWRlcnMuYWRkVGV4dFByb3ZpZGVyKHZpZXdUeXBlLCBleHRlbnNpb24sIHByb3ZpZGVyKSk7XG5cdFx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJUZXh0RWRpdG9yUHJvdmlkZXIodG9FeHRlbnNpb25EYXRhKGV4dGVuc2lvbiksIHZpZXdUeXBlLCBvcHRpb25zLndlYnZpZXdPcHRpb25zIHx8IHt9LCB7XG5cdFx0XHRcdHN1cHBvcnRzTW92ZTogISFwcm92aWRlci5tb3ZlQ3VzdG9tVGV4dEVkaXRvcixcblx0XHRcdFx0c3VwcG9ydHNJbmxpbmVEaWZmOiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjdXN0b21FZGl0b3JEaWZmcycpICYmIGlzQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyV2l0aElubGluZURpZmZDYXBhYmlsaXR5KHByb3ZpZGVyKSxcblx0XHRcdFx0c3VwcG9ydHNTaWRlQnlTaWRlRGlmZjogaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY3VzdG9tRWRpdG9yRGlmZnMnKSAmJiBpc0N1c3RvbVRleHRFZGl0b3JQcm92aWRlcldpdGhTaWRlQnlTaWRlRGlmZkNhcGFiaWxpdHkocHJvdmlkZXIpLFxuXHRcdFx0fSwgc2hvdWxkU2VyaWFsaXplQnVmZmVyc0ZvclBvc3RNZXNzYWdlKGV4dGVuc2lvbikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yUHJvdmlkZXJzLmFkZEN1c3RvbVByb3ZpZGVyKHZpZXdUeXBlLCBleHRlbnNpb24sIHByb3ZpZGVyKSk7XG5cdFx0XHRjb25zdCBzdXBwb3J0c0N1c3RvbUVkaXRvckRpZmZzID0gaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY3VzdG9tRWRpdG9yRGlmZnMnKTtcblxuXHRcdFx0aWYgKGlzQ3VzdG9tRWRpdG9yUHJvdmlkZXJXaXRoRWRpdGluZ0NhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZUN1c3RvbURvY3VtZW50KGUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5nZXRDdXN0b21Eb2N1bWVudEVudHJ5KHZpZXdUeXBlLCBlLmRvY3VtZW50LnVyaSk7XG5cdFx0XHRcdFx0aWYgKGlzRWRpdEV2ZW50KGUpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0SWQgPSBlbnRyeS5hZGRFZGl0KGUpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkRWRpdChlLmRvY3VtZW50LnVyaSwgdmlld1R5cGUsIGVkaXRJZCwgZS5sYWJlbCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkNvbnRlbnRDaGFuZ2UoZS5kb2N1bWVudC51cmksIHZpZXdUeXBlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQ3VzdG9tRWRpdG9yUHJvdmlkZXIodG9FeHRlbnNpb25EYXRhKGV4dGVuc2lvbiksIHZpZXdUeXBlLCBvcHRpb25zLndlYnZpZXdPcHRpb25zIHx8IHt9LCB7XG5cdFx0XHRcdHN1cHBvcnRzSW5saW5lRGlmZjogc3VwcG9ydHNDdXN0b21FZGl0b3JEaWZmcyAmJiBpc0N1c3RvbUVkaXRvclByb3ZpZGVyV2l0aElubGluZURpZmZDYXBhYmlsaXR5KHByb3ZpZGVyKSxcblx0XHRcdFx0c3VwcG9ydHNTaWRlQnlTaWRlRGlmZjogc3VwcG9ydHNDdXN0b21FZGl0b3JEaWZmcyAmJiBpc0N1c3RvbUVkaXRvclByb3ZpZGVyV2l0aFNpZGVCeVNpZGVEaWZmQ2FwYWJpbGl0eShwcm92aWRlciksXG5cdFx0XHR9LCAhIW9wdGlvbnMuc3VwcG9ydHNNdWx0aXBsZUVkaXRvcnNQZXJEb2N1bWVudCwgc2hvdWxkU2VyaWFsaXplQnVmZmVyc0ZvclBvc3RNZXNzYWdlKGV4dGVuc2lvbikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZS5mcm9tKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRuZXcgZXh0SG9zdFR5cGVzLkRpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlckVkaXRvclByb3ZpZGVyKHZpZXdUeXBlKTtcblx0XHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jICRjcmVhdGVDdXN0b21Eb2N1bWVudChyZXNvdXJjZTogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZywgYmFja3VwSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdW50aXRsZWREb2N1bWVudERhdGE6IFZTQnVmZmVyIHwgdW5kZWZpbmVkLCBjYW5jZWxsYXRpb246IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lZGl0b3JQcm92aWRlcnMuZ2V0KHZpZXdUeXBlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHByb3ZpZGVyIGZvdW5kIGZvciAnJHt2aWV3VHlwZX0nYCk7XG5cdFx0fVxuXG5cdFx0aWYgKGVudHJ5LnR5cGUgIT09IEN1c3RvbUVkaXRvclR5cGUuQ3VzdG9tKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgcHJvdmlkZSB0eXBlIGZvciAnJHt2aWV3VHlwZX0nYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmV2aXZlZFJlc291cmNlID0gVVJJLnJldml2ZShyZXNvdXJjZSk7XG5cdFx0Y29uc3QgZG9jdW1lbnQgPSBhd2FpdCBlbnRyeS5wcm92aWRlci5vcGVuQ3VzdG9tRG9jdW1lbnQocmV2aXZlZFJlc291cmNlLCB7IGJhY2t1cElkLCB1bnRpdGxlZERvY3VtZW50RGF0YTogdW50aXRsZWREb2N1bWVudERhdGE/LmJ1ZmZlciB9LCBjYW5jZWxsYXRpb24pO1xuXG5cdFx0bGV0IHN0b3JhZ2VSb290OiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzQ3VzdG9tRWRpdG9yUHJvdmlkZXJXaXRoRWRpdGluZ0NhcGFiaWxpdHkoZW50cnkucHJvdmlkZXIpICYmIHRoaXMuX2V4dGVuc2lvblN0b3JhZ2VQYXRocykge1xuXHRcdFx0c3RvcmFnZVJvb3QgPSB0aGlzLl9leHRlbnNpb25TdG9yYWdlUGF0aHMud29ya3NwYWNlVmFsdWUoZW50cnkuZXh0ZW5zaW9uKSA/PyB0aGlzLl9leHRlbnNpb25TdG9yYWdlUGF0aHMuZ2xvYmFsVmFsdWUoZW50cnkuZXh0ZW5zaW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fZG9jdW1lbnRzLmFkZCh2aWV3VHlwZSwgZG9jdW1lbnQsIHN0b3JhZ2VSb290KTtcblxuXHRcdHJldHVybiB7IGVkaXRhYmxlOiBpc0N1c3RvbUVkaXRvclByb3ZpZGVyV2l0aEVkaXRpbmdDYXBhYmlsaXR5KGVudHJ5LnByb3ZpZGVyKSB9O1xuXHR9XG5cblx0YXN5bmMgJGRpc3Bvc2VDdXN0b21Eb2N1bWVudChyZXNvdXJjZTogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZWRpdG9yUHJvdmlkZXJzLmdldCh2aWV3VHlwZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBwcm92aWRlciBmb3VuZCBmb3IgJyR7dmlld1R5cGV9J2ApO1xuXHRcdH1cblxuXHRcdGlmIChlbnRyeS50eXBlICE9PSBDdXN0b21FZGl0b3JUeXBlLkN1c3RvbSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHByb3ZpZGVyIHR5cGUgZm9yICcke3ZpZXdUeXBlfSdgKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXZpdmVkUmVzb3VyY2UgPSBVUkkucmV2aXZlKHJlc291cmNlKTtcblx0XHRjb25zdCB7IGRvY3VtZW50IH0gPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJldml2ZWRSZXNvdXJjZSk7XG5cdFx0Ly8gUGFzcyB0aGUgcmVzb3VyY2Ugd2UgdXNlZCB0byBsb29rIHVwIHRoZSBkb2N1bWVudCwgbm90IGRvY3VtZW50LnVyaSxcblx0XHQvLyBiZWNhdXNlIHRoZSBkb2N1bWVudCdzIFVSSSBtYXkgaGF2ZSBjaGFuZ2VkIChlLmcuLCBhZnRlciBTYXZlQXMpLlxuXHRcdHRoaXMuX2RvY3VtZW50cy5kZWxldGUodmlld1R5cGUsIHJldml2ZWRSZXNvdXJjZSk7XG5cdFx0ZG9jdW1lbnQuZGlzcG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgJHJlc29sdmVDdXN0b21FZGl0b3IoXG5cdFx0cmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsXG5cdFx0aGFuZGxlOiBleHRIb3N0UHJvdG9jb2wuV2Vidmlld0hhbmRsZSxcblx0XHR2aWV3VHlwZTogc3RyaW5nLFxuXHRcdGluaXREYXRhOiB7XG5cdFx0XHR0aXRsZTogc3RyaW5nO1xuXHRcdFx0Y29udGVudE9wdGlvbnM6IGV4dEhvc3RQcm90b2NvbC5JV2Vidmlld0NvbnRlbnRPcHRpb25zO1xuXHRcdFx0b3B0aW9uczogZXh0SG9zdFByb3RvY29sLklXZWJ2aWV3UGFuZWxPcHRpb25zO1xuXHRcdFx0YWN0aXZlOiBib29sZWFuO1xuXHRcdH0sXG5cdFx0cG9zaXRpb246IEVkaXRvckdyb3VwQ29sdW1uLFxuXHRcdGNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZWRpdG9yUHJvdmlkZXJzLmdldCh2aWV3VHlwZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBwcm92aWRlciBmb3VuZCBmb3IgJyR7dmlld1R5cGV9J2ApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdDb2x1bW4gPSB0eXBlQ29udmVydGVycy5WaWV3Q29sdW1uLnRvKHBvc2l0aW9uKTtcblxuXHRcdGNvbnN0IHdlYnZpZXcgPSB0aGlzLl9leHRIb3N0V2Vidmlldy5jcmVhdGVOZXdXZWJ2aWV3KGhhbmRsZSwgaW5pdERhdGEuY29udGVudE9wdGlvbnMsIGVudHJ5LmV4dGVuc2lvbik7XG5cdFx0Ly8gVGhlIG1haW4gdGhyZWFkIHN0YXJ0cyB0aGUgY3VzdG9tIGVkaXRvcidzIHdlYnZpZXcgd2l0aCBlbXB0eSBjb250ZW50XG5cdFx0Ly8gb3B0aW9ucy4gRW5zdXJlIGBsb2NhbFJlc291cmNlUm9vdHNgIGRlZmF1bHRzIHRvIHRoZSB3b3Jrc3BhY2UgZm9sZGVyc1xuXHRcdC8vIGFuZCB0aGUgcHJvdmlkaW5nIGV4dGVuc2lvbidzIGluc3RhbGwgZGlyZWN0b3J5LCBhcyBkb2N1bWVudGVkIG9uXG5cdFx0Ly8gYFdlYnZpZXdPcHRpb25zLmxvY2FsUmVzb3VyY2VSb290c2AuXG5cdFx0dGhpcy5fZXh0SG9zdFdlYnZpZXcuZW5zdXJlRGVmYXVsdENvbnRlbnRPcHRpb25zKGhhbmRsZSwgaW5pdERhdGEuY29udGVudE9wdGlvbnMsIGVudHJ5LmV4dGVuc2lvbik7XG5cdFx0Y29uc3QgcGFuZWwgPSB0aGlzLl9leHRIb3N0V2Vidmlld1BhbmVscy5jcmVhdGVOZXdXZWJ2aWV3UGFuZWwoaGFuZGxlLCB2aWV3VHlwZSwgaW5pdERhdGEudGl0bGUsIHZpZXdDb2x1bW4sIGluaXREYXRhLm9wdGlvbnMsIHdlYnZpZXcsIGluaXREYXRhLmFjdGl2ZSk7XG5cblx0XHRjb25zdCByZXZpdmVkUmVzb3VyY2UgPSBVUkkucmV2aXZlKHJlc291cmNlKTtcblxuXHRcdHN3aXRjaCAoZW50cnkudHlwZSkge1xuXHRcdFx0Y2FzZSBDdXN0b21FZGl0b3JUeXBlLkN1c3RvbToge1xuXHRcdFx0XHRjb25zdCB7IGRvY3VtZW50IH0gPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJldml2ZWRSZXNvdXJjZSk7XG5cdFx0XHRcdHJldHVybiBlbnRyeS5wcm92aWRlci5yZXNvbHZlQ3VzdG9tRWRpdG9yKGRvY3VtZW50LCBwYW5lbCwgY2FuY2VsbGF0aW9uKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgQ3VzdG9tRWRpdG9yVHlwZS5UZXh0OiB7XG5cdFx0XHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5fZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChyZXZpdmVkUmVzb3VyY2UpO1xuXHRcdFx0XHRyZXR1cm4gZW50cnkucHJvdmlkZXIucmVzb2x2ZUN1c3RvbVRleHRFZGl0b3IoZG9jdW1lbnQsIHBhbmVsLCBjYW5jZWxsYXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gd2VidmlldyBwcm92aWRlciB0eXBlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHJlc29sdmVDdXN0b21FZGl0b3JJbmxpbmVEaWZmKFxuXHRcdG9yaWdpbmFsUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsXG5cdFx0bW9kaWZpZWRSZXNvdXJjZTogVXJpQ29tcG9uZW50cyxcblx0XHRoYW5kbGU6IGV4dEhvc3RQcm90b2NvbC5XZWJ2aWV3SGFuZGxlLFxuXHRcdHZpZXdUeXBlOiBzdHJpbmcsXG5cdFx0aW5pdERhdGE6IGV4dEhvc3RQcm90b2NvbC5DdXN0b21FZGl0b3JEaWZmSW5pdERhdGEsXG5cdFx0cG9zaXRpb246IEVkaXRvckdyb3VwQ29sdW1uLFxuXHRcdGNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgZW50cnksIHBhbmVsIH0gPSB0aGlzLmNyZWF0ZUN1c3RvbUVkaXRvckRpZmZQYW5lbChoYW5kbGUsIHZpZXdUeXBlLCBpbml0RGF0YSwgcG9zaXRpb24pO1xuXHRcdGNvbnN0IHJldml2ZWRPcmlnaW5hbFJlc291cmNlID0gVVJJLnJldml2ZShvcmlnaW5hbFJlc291cmNlKTtcblx0XHRjb25zdCByZXZpdmVkTW9kaWZpZWRSZXNvdXJjZSA9IFVSSS5yZXZpdmUobW9kaWZpZWRSZXNvdXJjZSk7XG5cblx0XHRpZiAoZW50cnkudHlwZSA9PT0gQ3VzdG9tRWRpdG9yVHlwZS5UZXh0KSB7XG5cdFx0XHRpZiAoIWlzQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyV2l0aElubGluZURpZmZDYXBhYmlsaXR5KGVudHJ5LnByb3ZpZGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb3ZpZGVyIGZvciAnJHt2aWV3VHlwZX0nIGRvZXMgbm90IHN1cHBvcnQgaW5saW5lIGN1c3RvbSB0ZXh0IGVkaXRvciBkaWZmc2ApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcmlnaW5hbERvY3VtZW50ID0gdGhpcy5fZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChyZXZpdmVkT3JpZ2luYWxSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBtb2RpZmllZERvY3VtZW50ID0gdGhpcy5fZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChyZXZpdmVkTW9kaWZpZWRSZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gZW50cnkucHJvdmlkZXIucmVzb2x2ZUN1c3RvbVRleHRFZGl0b3JJbmxpbmVEaWZmKHsgb3JpZ2luYWw6IG9yaWdpbmFsRG9jdW1lbnQsIG1vZGlmaWVkOiBtb2RpZmllZERvY3VtZW50IH0sIHBhbmVsLCBjYW5jZWxsYXRpb24pO1xuXHRcdH1cblxuXHRcdGlmICghaXNDdXN0b21FZGl0b3JQcm92aWRlcldpdGhJbmxpbmVEaWZmQ2FwYWJpbGl0eShlbnRyeS5wcm92aWRlcikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvdmlkZXIgZm9yICcke3ZpZXdUeXBlfScgZG9lcyBub3Qgc3VwcG9ydCBpbmxpbmUgY3VzdG9tIGVkaXRvciBkaWZmc2ApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZG9jdW1lbnQ6IG9yaWdpbmFsRG9jdW1lbnQgfSA9IHRoaXMuZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZSwgcmV2aXZlZE9yaWdpbmFsUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHsgZG9jdW1lbnQ6IG1vZGlmaWVkRG9jdW1lbnQgfSA9IHRoaXMuZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZSwgcmV2aXZlZE1vZGlmaWVkUmVzb3VyY2UpO1xuXHRcdHJldHVybiBlbnRyeS5wcm92aWRlci5yZXNvbHZlQ3VzdG9tRWRpdG9ySW5saW5lRGlmZih7IG9yaWdpbmFsOiBvcmlnaW5hbERvY3VtZW50LCBtb2RpZmllZDogbW9kaWZpZWREb2N1bWVudCB9LCBwYW5lbCwgY2FuY2VsbGF0aW9uKTtcblx0fVxuXG5cdGFzeW5jICRyZXNvbHZlQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmYoXG5cdFx0b3JpZ2luYWxSZXNvdXJjZTogVXJpQ29tcG9uZW50cyxcblx0XHRtb2RpZmllZFJlc291cmNlOiBVcmlDb21wb25lbnRzLFxuXHRcdHdlYnZpZXdIYW5kbGVzOiBleHRIb3N0UHJvdG9jb2wuQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZXZWJ2aWV3SGFuZGxlcyxcblx0XHR2aWV3VHlwZTogc3RyaW5nLFxuXHRcdGluaXREYXRhOiBleHRIb3N0UHJvdG9jb2wuQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmZJbml0RGF0YSxcblx0XHRwb3NpdGlvbjogRWRpdG9yR3JvdXBDb2x1bW4sXG5cdFx0Y2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgeyBlbnRyeSwgcGFuZWw6IG9yaWdpbmFsUGFuZWwgfSA9IHRoaXMuY3JlYXRlQ3VzdG9tRWRpdG9yRGlmZlBhbmVsKHdlYnZpZXdIYW5kbGVzLm9yaWdpbmFsLCB2aWV3VHlwZSwgaW5pdERhdGEub3JpZ2luYWwsIHBvc2l0aW9uKTtcblx0XHRjb25zdCB7IHBhbmVsOiBtb2RpZmllZFBhbmVsIH0gPSB0aGlzLmNyZWF0ZUN1c3RvbUVkaXRvckRpZmZQYW5lbCh3ZWJ2aWV3SGFuZGxlcy5tb2RpZmllZCwgdmlld1R5cGUsIGluaXREYXRhLm1vZGlmaWVkLCBwb3NpdGlvbik7XG5cdFx0Y29uc3QgcmV2aXZlZE9yaWdpbmFsUmVzb3VyY2UgPSBVUkkucmV2aXZlKG9yaWdpbmFsUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJldml2ZWRNb2RpZmllZFJlc291cmNlID0gVVJJLnJldml2ZShtb2RpZmllZFJlc291cmNlKTtcblxuXHRcdGlmIChlbnRyeS50eXBlID09PSBDdXN0b21FZGl0b3JUeXBlLlRleHQpIHtcblx0XHRcdGlmICghaXNDdXN0b21UZXh0RWRpdG9yUHJvdmlkZXJXaXRoU2lkZUJ5U2lkZURpZmZDYXBhYmlsaXR5KGVudHJ5LnByb3ZpZGVyKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb3ZpZGVyIGZvciAnJHt2aWV3VHlwZX0nIGRvZXMgbm90IHN1cHBvcnQgc2lkZSBieSBzaWRlIGN1c3RvbSB0ZXh0IGVkaXRvciBkaWZmc2ApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcmlnaW5hbERvY3VtZW50ID0gdGhpcy5fZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChyZXZpdmVkT3JpZ2luYWxSZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBtb2RpZmllZERvY3VtZW50ID0gdGhpcy5fZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChyZXZpdmVkTW9kaWZpZWRSZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm4gZW50cnkucHJvdmlkZXIucmVzb2x2ZUN1c3RvbVRleHRFZGl0b3JTaWRlQnlTaWRlRGlmZih7IG9yaWdpbmFsOiBvcmlnaW5hbERvY3VtZW50LCBtb2RpZmllZDogbW9kaWZpZWREb2N1bWVudCB9LCB7IG9yaWdpbmFsOiBvcmlnaW5hbFBhbmVsLCBtb2RpZmllZDogbW9kaWZpZWRQYW5lbCB9LCBjYW5jZWxsYXRpb24pO1xuXHRcdH1cblxuXHRcdGlmICghaXNDdXN0b21FZGl0b3JQcm92aWRlcldpdGhTaWRlQnlTaWRlRGlmZkNhcGFiaWxpdHkoZW50cnkucHJvdmlkZXIpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb3ZpZGVyIGZvciAnJHt2aWV3VHlwZX0nIGRvZXMgbm90IHN1cHBvcnQgc2lkZSBieSBzaWRlIGN1c3RvbSBlZGl0b3IgZGlmZnNgKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGRvY3VtZW50OiBvcmlnaW5hbERvY3VtZW50IH0gPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJldml2ZWRPcmlnaW5hbFJlc291cmNlKTtcblx0XHRjb25zdCB7IGRvY3VtZW50OiBtb2RpZmllZERvY3VtZW50IH0gPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJldml2ZWRNb2RpZmllZFJlc291cmNlKTtcblx0XHRyZXR1cm4gZW50cnkucHJvdmlkZXIucmVzb2x2ZUN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmKHsgb3JpZ2luYWw6IG9yaWdpbmFsRG9jdW1lbnQsIG1vZGlmaWVkOiBtb2RpZmllZERvY3VtZW50IH0sIHsgb3JpZ2luYWw6IG9yaWdpbmFsUGFuZWwsIG1vZGlmaWVkOiBtb2RpZmllZFBhbmVsIH0sIGNhbmNlbGxhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUN1c3RvbUVkaXRvckRpZmZQYW5lbChcblx0XHRoYW5kbGU6IGV4dEhvc3RQcm90b2NvbC5XZWJ2aWV3SGFuZGxlLFxuXHRcdHZpZXdUeXBlOiBzdHJpbmcsXG5cdFx0aW5pdERhdGE6IGV4dEhvc3RQcm90b2NvbC5DdXN0b21FZGl0b3JEaWZmSW5pdERhdGEsXG5cdFx0cG9zaXRpb246IEVkaXRvckdyb3VwQ29sdW1uLFxuXHQpOiB7IGVudHJ5OiBQcm92aWRlckVudHJ5OyBwYW5lbDogdnNjb2RlLldlYnZpZXdQYW5lbCB9IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VkaXRvclByb3ZpZGVycy5nZXQodmlld1R5cGUpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gcHJvdmlkZXIgZm91bmQgZm9yICcke3ZpZXdUeXBlfSdgKTtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3Q29sdW1uID0gdHlwZUNvbnZlcnRlcnMuVmlld0NvbHVtbi50byhwb3NpdGlvbik7XG5cdFx0Y29uc3Qgd2VidmlldyA9IHRoaXMuX2V4dEhvc3RXZWJ2aWV3LmNyZWF0ZU5ld1dlYnZpZXcoaGFuZGxlLCBpbml0RGF0YS5jb250ZW50T3B0aW9ucywgZW50cnkuZXh0ZW5zaW9uKTtcblx0XHR0aGlzLl9leHRIb3N0V2Vidmlldy5lbnN1cmVEZWZhdWx0Q29udGVudE9wdGlvbnMoaGFuZGxlLCBpbml0RGF0YS5jb250ZW50T3B0aW9ucywgZW50cnkuZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBwYW5lbCA9IHRoaXMuX2V4dEhvc3RXZWJ2aWV3UGFuZWxzLmNyZWF0ZU5ld1dlYnZpZXdQYW5lbChoYW5kbGUsIHZpZXdUeXBlLCBpbml0RGF0YS50aXRsZSwgdmlld0NvbHVtbiwgaW5pdERhdGEub3B0aW9ucywgd2VidmlldywgaW5pdERhdGEuYWN0aXZlKTtcblx0XHRyZXR1cm4geyBlbnRyeSwgcGFuZWwgfTtcblx0fVxuXG5cdCRkaXNwb3NlRWRpdHMocmVzb3VyY2VDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB2aWV3VHlwZTogc3RyaW5nLCBlZGl0SWRzOiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy5nZXRDdXN0b21Eb2N1bWVudEVudHJ5KHZpZXdUeXBlLCByZXNvdXJjZUNvbXBvbmVudHMpO1xuXHRcdGRvY3VtZW50LmRpc3Bvc2VFZGl0cyhlZGl0SWRzKTtcblx0fVxuXG5cdGFzeW5jICRvbk1vdmVDdXN0b21FZGl0b3IoaGFuZGxlOiBzdHJpbmcsIG5ld1Jlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZWRpdG9yUHJvdmlkZXJzLmdldCh2aWV3VHlwZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBwcm92aWRlciBmb3VuZCBmb3IgJyR7dmlld1R5cGV9J2ApO1xuXHRcdH1cblxuXHRcdGlmICghKGVudHJ5LnByb3ZpZGVyIGFzIHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIpLm1vdmVDdXN0b21UZXh0RWRpdG9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFByb3ZpZGVyIGRvZXMgbm90IGltcGxlbWVudCBtb3ZlICcke3ZpZXdUeXBlfSdgKTtcblx0XHR9XG5cblx0XHRjb25zdCB3ZWJ2aWV3ID0gdGhpcy5fZXh0SG9zdFdlYnZpZXdQYW5lbHMuZ2V0V2Vidmlld1BhbmVsKGhhbmRsZSk7XG5cdFx0aWYgKCF3ZWJ2aWV3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHdlYnZpZXcgZm91bmRgKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5yZXZpdmUobmV3UmVzb3VyY2VDb21wb25lbnRzKTtcblx0XHRjb25zdCBkb2N1bWVudCA9IHRoaXMuX2V4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQocmVzb3VyY2UpO1xuXHRcdGF3YWl0IChlbnRyeS5wcm92aWRlciBhcyB2c2NvZGUuQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyKS5tb3ZlQ3VzdG9tVGV4dEVkaXRvciEoZG9jdW1lbnQsIHdlYnZpZXcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0YXN5bmMgJHVuZG8ocmVzb3VyY2VDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB2aWV3VHlwZTogc3RyaW5nLCBlZGl0SWQ6IG51bWJlciwgaXNEaXJ0eTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5nZXRDdXN0b21Eb2N1bWVudEVudHJ5KHZpZXdUeXBlLCByZXNvdXJjZUNvbXBvbmVudHMpO1xuXHRcdHJldHVybiBlbnRyeS51bmRvKGVkaXRJZCwgaXNEaXJ0eSk7XG5cdH1cblxuXHRhc3luYyAkcmVkbyhyZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHZpZXdUeXBlOiBzdHJpbmcsIGVkaXRJZDogbnVtYmVyLCBpc0RpcnR5OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0cmV0dXJuIGVudHJ5LnJlZG8oZWRpdElkLCBpc0RpcnR5KTtcblx0fVxuXG5cdGFzeW5jICRyZXZlcnQocmVzb3VyY2VDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB2aWV3VHlwZTogc3RyaW5nLCBjYW5jZWxsYXRpb246IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmdldEN1c3RvbUVkaXRvclByb3ZpZGVyKHZpZXdUeXBlKTtcblx0XHRhd2FpdCBwcm92aWRlci5yZXZlcnRDdXN0b21Eb2N1bWVudChlbnRyeS5kb2N1bWVudCwgY2FuY2VsbGF0aW9uKTtcblx0XHRlbnRyeS5kaXNwb3NlQmFja3VwKCk7XG5cdH1cblxuXHRhc3luYyAkb25TYXZlKHJlc291cmNlQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdmlld1R5cGU6IHN0cmluZywgY2FuY2VsbGF0aW9uOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5nZXRDdXN0b21Eb2N1bWVudEVudHJ5KHZpZXdUeXBlLCByZXNvdXJjZUNvbXBvbmVudHMpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5nZXRDdXN0b21FZGl0b3JQcm92aWRlcih2aWV3VHlwZSk7XG5cdFx0YXdhaXQgcHJvdmlkZXIuc2F2ZUN1c3RvbURvY3VtZW50KGVudHJ5LmRvY3VtZW50LCBjYW5jZWxsYXRpb24pO1xuXHRcdGVudHJ5LmRpc3Bvc2VCYWNrdXAoKTtcblx0fVxuXG5cdGFzeW5jICRvblNhdmVBcyhyZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHZpZXdUeXBlOiBzdHJpbmcsIHRhcmdldFJlc291cmNlOiBVcmlDb21wb25lbnRzLCBjYW5jZWxsYXRpb246IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLmdldEN1c3RvbURvY3VtZW50RW50cnkodmlld1R5cGUsIHJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmdldEN1c3RvbUVkaXRvclByb3ZpZGVyKHZpZXdUeXBlKTtcblx0XHRyZXR1cm4gcHJvdmlkZXIuc2F2ZUN1c3RvbURvY3VtZW50QXMoZW50cnkuZG9jdW1lbnQsIFVSSS5yZXZpdmUodGFyZ2V0UmVzb3VyY2UpLCBjYW5jZWxsYXRpb24pO1xuXHR9XG5cblx0YXN5bmMgJGJhY2t1cChyZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHZpZXdUeXBlOiBzdHJpbmcsIGNhbmNlbGxhdGlvbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5nZXRDdXN0b21Eb2N1bWVudEVudHJ5KHZpZXdUeXBlLCByZXNvdXJjZUNvbXBvbmVudHMpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5nZXRDdXN0b21FZGl0b3JQcm92aWRlcih2aWV3VHlwZSk7XG5cblx0XHRjb25zdCBiYWNrdXAgPSBhd2FpdCBwcm92aWRlci5iYWNrdXBDdXN0b21Eb2N1bWVudChlbnRyeS5kb2N1bWVudCwge1xuXHRcdFx0ZGVzdGluYXRpb246IGVudHJ5LmdldE5ld0JhY2t1cFVyaSgpLFxuXHRcdH0sIGNhbmNlbGxhdGlvbik7XG5cdFx0ZW50cnkudXBkYXRlQmFja3VwKGJhY2t1cCk7XG5cdFx0cmV0dXJuIGJhY2t1cC5pZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q3VzdG9tRG9jdW1lbnRFbnRyeSh2aWV3VHlwZTogc3RyaW5nLCByZXNvdXJjZTogVXJpQ29tcG9uZW50cyk6IEN1c3RvbURvY3VtZW50U3RvcmVFbnRyeSB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9kb2N1bWVudHMuZ2V0KHZpZXdUeXBlLCBVUkkucmV2aXZlKHJlc291cmNlKSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBjdXN0b20gZG9jdW1lbnQgZm91bmQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXN0b21FZGl0b3JQcm92aWRlcih2aWV3VHlwZTogc3RyaW5nKTogdnNjb2RlLkN1c3RvbUVkaXRvclByb3ZpZGVyIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2VkaXRvclByb3ZpZGVycy5nZXQodmlld1R5cGUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZW50cnk/LnByb3ZpZGVyO1xuXHRcdGlmICghcHJvdmlkZXIgfHwgIWlzQ3VzdG9tRWRpdG9yUHJvdmlkZXJXaXRoRWRpdGluZ0NhcGFiaWxpdHkocHJvdmlkZXIpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0N1c3RvbSBkb2N1bWVudCBpcyBub3QgZWRpdGFibGUnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3ZpZGVyO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzQ3VzdG9tRWRpdG9yUHJvdmlkZXJXaXRoRWRpdGluZ0NhcGFiaWxpdHkocHJvdmlkZXI6IHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIgfCB2c2NvZGUuQ3VzdG9tRWRpdG9yUHJvdmlkZXIgfCB2c2NvZGUuQ3VzdG9tUmVhZG9ubHlFZGl0b3JQcm92aWRlcik6IHByb3ZpZGVyIGlzIHZzY29kZS5DdXN0b21FZGl0b3JQcm92aWRlciB7XG5cdHJldHVybiAhIShwcm92aWRlciBhcyB2c2NvZGUuQ3VzdG9tRWRpdG9yUHJvdmlkZXIpLm9uRGlkQ2hhbmdlQ3VzdG9tRG9jdW1lbnQ7XG59XG5cbmZ1bmN0aW9uIGlzQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuQ3VzdG9tUmVhZG9ubHlFZGl0b3JQcm92aWRlcjx2c2NvZGUuQ3VzdG9tRG9jdW1lbnQ+IHwgdnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlcik6IHByb3ZpZGVyIGlzIHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIge1xuXHRyZXR1cm4gdHlwZW9mIChwcm92aWRlciBhcyB2c2NvZGUuQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyKS5yZXNvbHZlQ3VzdG9tVGV4dEVkaXRvciA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNDdXN0b21UZXh0RWRpdG9yUHJvdmlkZXJXaXRoSW5saW5lRGlmZkNhcGFiaWxpdHkocHJvdmlkZXI6IHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIpOiBwcm92aWRlciBpcyB2c2NvZGUuQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyICYgUmVxdWlyZWQ8UGljazx2c2NvZGUuQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyLCAncmVzb2x2ZUN1c3RvbVRleHRFZGl0b3JJbmxpbmVEaWZmJz4+IHtcblx0cmV0dXJuIHR5cGVvZiBwcm92aWRlci5yZXNvbHZlQ3VzdG9tVGV4dEVkaXRvcklubGluZURpZmYgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzQ3VzdG9tVGV4dEVkaXRvclByb3ZpZGVyV2l0aFNpZGVCeVNpZGVEaWZmQ2FwYWJpbGl0eShwcm92aWRlcjogdnNjb2RlLkN1c3RvbVRleHRFZGl0b3JQcm92aWRlcik6IHByb3ZpZGVyIGlzIHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIgJiBSZXF1aXJlZDxQaWNrPHZzY29kZS5DdXN0b21UZXh0RWRpdG9yUHJvdmlkZXIsICdyZXNvbHZlQ3VzdG9tVGV4dEVkaXRvclNpZGVCeVNpZGVEaWZmJz4+IHtcblx0cmV0dXJuIHR5cGVvZiBwcm92aWRlci5yZXNvbHZlQ3VzdG9tVGV4dEVkaXRvclNpZGVCeVNpZGVEaWZmID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBpc0N1c3RvbUVkaXRvclByb3ZpZGVyV2l0aElubGluZURpZmZDYXBhYmlsaXR5KHByb3ZpZGVyOiB2c2NvZGUuQ3VzdG9tUmVhZG9ubHlFZGl0b3JQcm92aWRlcik6IHByb3ZpZGVyIGlzIHZzY29kZS5DdXN0b21SZWFkb25seUVkaXRvclByb3ZpZGVyICYgUmVxdWlyZWQ8UGljazx2c2NvZGUuQ3VzdG9tUmVhZG9ubHlFZGl0b3JQcm92aWRlciwgJ3Jlc29sdmVDdXN0b21FZGl0b3JJbmxpbmVEaWZmJz4+IHtcblx0cmV0dXJuIHR5cGVvZiBwcm92aWRlci5yZXNvbHZlQ3VzdG9tRWRpdG9ySW5saW5lRGlmZiA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNDdXN0b21FZGl0b3JQcm92aWRlcldpdGhTaWRlQnlTaWRlRGlmZkNhcGFiaWxpdHkocHJvdmlkZXI6IHZzY29kZS5DdXN0b21SZWFkb25seUVkaXRvclByb3ZpZGVyKTogcHJvdmlkZXIgaXMgdnNjb2RlLkN1c3RvbVJlYWRvbmx5RWRpdG9yUHJvdmlkZXIgJiBSZXF1aXJlZDxQaWNrPHZzY29kZS5DdXN0b21SZWFkb25seUVkaXRvclByb3ZpZGVyLCAncmVzb2x2ZUN1c3RvbUVkaXRvclNpZGVCeVNpZGVEaWZmJz4+IHtcblx0cmV0dXJuIHR5cGVvZiBwcm92aWRlci5yZXNvbHZlQ3VzdG9tRWRpdG9yU2lkZUJ5U2lkZURpZmYgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzRWRpdEV2ZW50KGU6IHZzY29kZS5DdXN0b21Eb2N1bWVudENvbnRlbnRDaGFuZ2VFdmVudCB8IHZzY29kZS5DdXN0b21Eb2N1bWVudEVkaXRFdmVudCk6IGUgaXMgdnNjb2RlLkN1c3RvbURvY3VtZW50RWRpdEV2ZW50IHtcblx0cmV0dXJuIHR5cGVvZiAoZSBhcyB2c2NvZGUuQ3VzdG9tRG9jdW1lbnRFZGl0RXZlbnQpLnVuZG8gPT09ICdmdW5jdGlvbidcblx0XHQmJiB0eXBlb2YgKGUgYXMgdnNjb2RlLkN1c3RvbURvY3VtZW50RWRpdEV2ZW50KS5yZWRvID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBoYXNoUGF0aChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0Y29uc3Qgc3RyID0gcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgfHwgcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkID8gcmVzb3VyY2UuZnNQYXRoIDogcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0cmV0dXJuIGhhc2goc3RyKSArICcnO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQTBCO0FBSW5DLFlBQVksb0JBQW9CO0FBQ2hDLFNBQTBCLHNDQUFzQyx1QkFBdUI7QUFJdkYsU0FBUyxhQUFhO0FBQ3RCLFlBQVkscUJBQXFCO0FBQ2pDLFlBQVksa0JBQWtCO0FBQzlCLFNBQVMsNEJBQTRCO0FBR3JDLE1BQU0seUJBQXlCO0FBQUEsRUFJOUIsWUFDaUIsVUFDQyxjQUNoQjtBQUZlO0FBQ0M7QUFKbEIsU0FBUSxpQkFBaUI7QUFPekIsU0FBaUIsU0FBUyxJQUFJLE1BQXNDLGtCQUFrQjtBQUFBLEVBRmxGO0FBQUEsRUFNSixRQUFRLE1BQThDO0FBQ3JELFdBQU8sS0FBSyxPQUFPLElBQUksQ0FBQyxJQUFJLENBQUM7QUFBQSxFQUM5QjtBQUFBLEVBRUEsTUFBTSxLQUFLLFFBQWdCLFNBQWlDO0FBQzNELFVBQU0sS0FBSyxRQUFRLE1BQU0sRUFBRSxLQUFLO0FBQ2hDLFFBQUksQ0FBQyxTQUFTO0FBQ2IsV0FBSyxjQUFjO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLEtBQUssUUFBZ0IsU0FBaUM7QUFDM0QsVUFBTSxLQUFLLFFBQVEsTUFBTSxFQUFFLEtBQUs7QUFDaEMsUUFBSSxDQUFD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QUFFQSxTQUFTLG1EQUFtRCxVQUErSztBQUMxTyxTQUFPLE9BQU8sU0FBUyxzQ0FBc0M7QUFDOUQ7QUFFQSxTQUFTLHVEQUF1RCxVQUFtTDtBQUNsUCxTQUFPLE9BQU8sU0FBUywwQ0FBMEM7QUFDbEU7QUFFQSxTQUFTLCtDQUErQyxVQUF1TDtBQUM5TyxTQUFPLE9BQU8sU0FBUyxrQ0FBa0M7QUFDMUQ7QUFFQSxTQUFTLG1EQUFtRCxVQUEyTDtBQUN0UCxTQUFPLE9BQU8sU0FBUyxzQ0FBc0M7QUFDOUQ7QUFFQSxTQUFTLFlBQVksR0FBa0g7QUFDdEksU0FBTyxPQUFRLEVBQXFDLFNBQVMsY0FDekQsT0FBUSxFQUFxQyxTQUFTO0FBQzNEO0FBRUEsU0FBUyxTQUFTLFVBQXVCO0FBQ3hDLFFBQU0sTUFBTSxTQUFTLFdBQVcsUUFBUSxRQUFRLFNBQVMsV0FBVyxRQUFRLFdBQVcsU0FBUyxTQUFTLFNBQVMsU0FBUztBQUMzSCxTQUFPLEtBQUssR0FBRyxJQUFJO0FBQ3BCOyIsCiAgIm5hbWVzIjogWyJDdXN0b21FZGl0b3JUeXBlIiwgIm9yaWdpbmFsRG9jdW1lbnQiLCAibW9kaWZpZWREb2N1bWVudCJdCn0K
