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
import { DataTransfers } from "../../base/browser/dnd.js";
import { DragAndDropObserver, EventType, addDisposableListener, onDidRegisterWindow } from "../../base/browser/dom.js";
import { coalesce } from "../../base/common/arrays.js";
import { UriList } from "../../base/common/dataTransfer.js";
import { Emitter, Event } from "../../base/common/event.js";
import { Disposable, DisposableStore, markAsSingleton } from "../../base/common/lifecycle.js";
import { stringify } from "../../base/common/marshalling.js";
import { Mimes } from "../../base/common/mime.js";
import { FileAccess, Schemas } from "../../base/common/network.js";
import { isWindows } from "../../base/common/platform.js";
import { basename, isEqual } from "../../base/common/resources.js";
import { URI } from "../../base/common/uri.js";
import { CodeDataTransfers, Extensions, LocalSelectionTransfer, createDraggedEditorInputFromRawResourcesData, extractEditorsAndFilesDropData } from "../../platform/dnd/browser/dnd.js";
import { IFileService } from "../../platform/files/common/files.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../platform/label/common/label.js";
import { extractSelection, withSelection } from "../../platform/opener/common/opener.js";
import { Registry } from "../../platform/registry/common/platform.js";
import { IWorkspaceContextService, hasWorkspaceFileExtension, isTemporaryWorkspace } from "../../platform/workspace/common/workspace.js";
import { IWorkspacesService } from "../../platform/workspaces/common/workspaces.js";
import { EditorResourceAccessor, isEditorIdentifier, isResourceDiffEditorInput, isResourceMergeEditorInput, isResourceSideBySideEditorInput } from "../common/editor.js";
import { IEditorService } from "../services/editor/common/editorService.js";
import { IHostService } from "../services/host/browser/host.js";
import { ITextFileService } from "../services/textfile/common/textfiles.js";
import { IWorkspaceEditingService } from "../services/workspaces/common/workspaceEditing.js";
import { mainWindow } from "../../base/browser/window.js";
import { BroadcastDataChannel } from "../../base/browser/broadcast.js";
class DraggedEditorIdentifier {
  constructor(identifier) {
    this.identifier = identifier;
  }
}
class DraggedEditorGroupIdentifier {
  constructor(identifier) {
    this.identifier = identifier;
  }
}
async function extractTreeDropData(dataTransfer) {
  const editors = [];
  const resourcesKey = Mimes.uriList.toLowerCase();
  if (dataTransfer.has(resourcesKey)) {
    try {
      const asString = await dataTransfer.get(resourcesKey)?.asString();
      const rawResourcesData = JSON.stringify(UriList.parse(asString ?? ""));
      editors.push(...createDraggedEditorInputFromRawResourcesData(rawResourcesData));
    } catch (error) {
    }
  }
  return editors;
}
let ResourcesDropHandler = class {
  constructor(options, fileService, workspacesService, editorService, workspaceEditingService, hostService, contextService, instantiationService) {
    this.options = options;
    this.fileService = fileService;
    this.workspacesService = workspacesService;
    this.editorService = editorService;
    this.workspaceEditingService = workspaceEditingService;
    this.hostService = hostService;
    this.contextService = contextService;
    this.instantiationService = instantiationService;
  }
  async handleDrop(event, targetWindow, resolveTargetGroup, afterDrop, options) {
    const editors = await this.instantiationService.invokeFunction((accessor) => extractEditorsAndFilesDropData(accessor, event));
    if (!editors.length) {
      return;
    }
    await this.hostService.focus(targetWindow);
    const dndRegistry = Registry.as(Extensions.DragAndDropContribution);
    for (const { resource } of editors) {
      if (resource) {
        const handled = await this.instantiationService.invokeFunction((accessor) => dndRegistry.handleResourceDrop(resource, accessor));
        if (handled) {
          return;
        }
      }
    }
    if (this.options.allowWorkspaceOpen) {
      const localFilesAllowedToOpenAsWorkspace = coalesce(editors.filter((editor) => editor.allowWorkspaceOpen && editor.resource?.scheme === Schemas.file).map((editor) => editor.resource));
      if (localFilesAllowedToOpenAsWorkspace.length > 0) {
        const isWorkspaceOpening = await this.handleWorkspaceDrop(localFilesAllowedToOpenAsWorkspace);
        if (isWorkspaceOpening) {
          return;
        }
      }
    }
    const externalLocalFiles = coalesce(editors.filter((editor) => editor.isExternal && editor.resource?.scheme === Schemas.file).map((editor) => editor.resource));
    if (externalLocalFiles.length) {
      this.workspacesService.addRecentlyOpened(externalLocalFiles.map((resource) => ({ fileUri: resource })));
    }
    const targetGroup = resolveTargetGroup?.();
    await this.editorService.openEditors(editors.map((editor) => ({
      ...editor,
      resource: editor.resource,
      options: {
        ...editor.options,
        ...options,
        pinned: true
      }
    })), targetGroup, { validateTrust: true });
    afterDrop?.(targetGroup);
  }
  async handleWorkspaceDrop(resources) {
    const toOpen = [];
    const folderURIs = [];
    await Promise.all(resources.map(async (resource) => {
      if (hasWorkspaceFileExtension(resource)) {
        toOpen.push({ workspaceUri: resource });
        return;
      }
      try {
        const stat = await this.fileService.stat(resource);
        if (stat.isDirectory) {
          toOpen.push({ folderUri: stat.resource });
          folderURIs.push({ uri: stat.resource });
        }
      } catch (error) {
      }
    }));
    if (toOpen.length === 0) {
      return false;
    }
    if (toOpen.length > folderURIs.length || folderURIs.length === 1) {
      await this.hostService.openWindow(toOpen);
    } else if (isTemporaryWorkspace(this.contextService.getWorkspace())) {
      await this.workspaceEditingService.addFolders(folderURIs);
    } else {
      await this.workspaceEditingService.createAndEnterWorkspace(folderURIs);
    }
    return true;
  }
};
ResourcesDropHandler = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IWorkspacesService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IWorkspaceEditingService),
  __decorateParam(5, IHostService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IInstantiationService)
], ResourcesDropHandler);
function fillEditorsDragData(accessor, resourcesOrEditors, event, options) {
  if (resourcesOrEditors.length === 0 || !event.dataTransfer) {
    return;
  }
  const textFileService = accessor.get(ITextFileService);
  const editorService = accessor.get(IEditorService);
  const fileService = accessor.get(IFileService);
  const labelService = accessor.get(ILabelService);
  const resources = coalesce(resourcesOrEditors.map((resourceOrEditor) => {
    if (URI.isUri(resourceOrEditor)) {
      return { resource: resourceOrEditor };
    }
    if (isEditorIdentifier(resourceOrEditor)) {
      if (URI.isUri(resourceOrEditor.editor.resource)) {
        return { resource: resourceOrEditor.editor.resource };
      }
      return void 0;
    }
    return {
      resource: resourceOrEditor.selection ? withSelection(resourceOrEditor.resource, resourceOrEditor.selection) : resourceOrEditor.resource,
      isDirectory: resourceOrEditor.isDirectory,
      selection: resourceOrEditor.selection
    };
  }));
  const fileSystemResources = resources.filter(({ resource }) => fileService.hasProvider(resource));
  if (!options?.disableStandardTransfer) {
    const lineDelimiter = isWindows ? "\r\n" : "\n";
    event.dataTransfer.setData(DataTransfers.TEXT, fileSystemResources.map(({ resource }) => labelService.getUriLabel(resource, { noPrefix: true })).join(lineDelimiter));
    const firstFile = fileSystemResources.find(({ isDirectory }) => !isDirectory);
    if (firstFile) {
      const firstFileUri = FileAccess.uriToFileUri(firstFile.resource);
      if (firstFileUri.scheme === Schemas.file) {
        event.dataTransfer.setData(DataTransfers.DOWNLOAD_URL, [Mimes.binary, basename(firstFile.resource), firstFileUri.toString()].join(":"));
      }
    }
  }
  const files = fileSystemResources.filter(({ isDirectory }) => !isDirectory);
  if (files.length) {
    event.dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify(files.map(({ resource }) => resource.toString())));
  }
  const contributions = Registry.as(Extensions.DragAndDropContribution).getAll();
  for (const contribution of contributions) {
    contribution.setData(resources, event);
  }
  const draggedEditors = [];
  for (const resourceOrEditor of resourcesOrEditors) {
    let editor = void 0;
    if (isEditorIdentifier(resourceOrEditor)) {
      const untypedEditor = resourceOrEditor.editor.toUntyped({ preserveViewState: resourceOrEditor.groupId });
      if (untypedEditor) {
        editor = { ...untypedEditor, resource: EditorResourceAccessor.getCanonicalUri(untypedEditor) };
      }
    } else if (URI.isUri(resourceOrEditor)) {
      const { selection, uri } = extractSelection(resourceOrEditor);
      editor = { resource: uri, options: selection ? { selection } : void 0 };
    } else if (!resourceOrEditor.isDirectory) {
      editor = {
        resource: resourceOrEditor.resource,
        options: {
          selection: resourceOrEditor.selection
        }
      };
    }
    if (!editor) {
      continue;
    }
    {
      const resource = editor.resource;
      if (resource) {
        const textFileModel = textFileService.files.get(resource);
        if (textFileModel) {
          if (typeof editor.languageId !== "string") {
            editor.languageId = textFileModel.getLanguageId();
          }
          if (typeof editor.encoding !== "string") {
            editor.encoding = textFileModel.getEncoding();
          }
          if (typeof editor.contents !== "string" && textFileModel.isDirty() && !textFileModel.textEditorModel.isTooLargeForHeapOperation()) {
            editor.contents = textFileModel.textEditorModel.getValue();
          }
        }
        if (!editor.options?.viewState) {
          editor.options = {
            ...editor.options,
            viewState: (() => {
              for (const visibleEditorPane of editorService.visibleEditorPanes) {
                if (isEqual(visibleEditorPane.input.resource, resource)) {
                  const viewState = visibleEditorPane.getViewState();
                  if (viewState) {
                    return viewState;
                  }
                }
              }
              return void 0;
            })()
          };
        }
      }
    }
    draggedEditors.push(editor);
  }
  if (draggedEditors.length) {
    event.dataTransfer.setData(CodeDataTransfers.EDITORS, stringify(draggedEditors));
  }
  const draggedDirectories = fileSystemResources.filter(({ isDirectory }) => isDirectory).map(({ resource }) => resource);
  if (draggedEditors.length || draggedDirectories.length) {
    const uriListEntries = [...draggedDirectories];
    for (const editor of draggedEditors) {
      if (editor.resource) {
        uriListEntries.push(editor.options?.selection ? withSelection(editor.resource, editor.options.selection) : editor.resource);
      } else if (isResourceDiffEditorInput(editor)) {
        if (editor.modified.resource) {
          uriListEntries.push(editor.modified.resource);
        }
      } else if (isResourceSideBySideEditorInput(editor)) {
        if (editor.primary.resource) {
          uriListEntries.push(editor.primary.resource);
        }
      } else if (isResourceMergeEditorInput(editor)) {
        uriListEntries.push(editor.result.resource);
      }
    }
    if (!options?.disableStandardTransfer) {
      event.dataTransfer.setData(Mimes.uriList, UriList.create(uriListEntries.slice(0, 1)));
    }
    event.dataTransfer.setData(DataTransfers.INTERNAL_URI_LIST, UriList.create(uriListEntries));
  }
}
class CompositeDragAndDropData {
  constructor(type, id) {
    this.type = type;
    this.id = id;
  }
  update(dataTransfer) {
  }
  getData() {
    return { type: this.type, id: this.id };
  }
}
class DraggedCompositeIdentifier {
  constructor(compositeId) {
    this.compositeId = compositeId;
  }
  get id() {
    return this.compositeId;
  }
}
class DraggedViewIdentifier {
  constructor(viewId) {
    this.viewId = viewId;
  }
  get id() {
    return this.viewId;
  }
}
class CompositeDragAndDropObserver extends Disposable {
  constructor() {
    super();
    this.transferData = LocalSelectionTransfer.getInstance();
    this.onDragStart = this._register(new Emitter());
    this.onDragEnd = this._register(new Emitter());
    this._register(this.onDragEnd.event((e) => {
      const id = e.dragAndDropData.getData().id;
      const type = e.dragAndDropData.getData().type;
      const data = this.readDragData(type);
      if (data?.getData().id === id) {
        this.transferData.clearData(type === "view" ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype);
      }
    }));
  }
  static get INSTANCE() {
    if (!CompositeDragAndDropObserver.instance) {
      CompositeDragAndDropObserver.instance = new CompositeDragAndDropObserver();
      markAsSingleton(CompositeDragAndDropObserver.instance);
    }
    return CompositeDragAndDropObserver.instance;
  }
  readDragData(type) {
    if (this.transferData.hasData(type === "view" ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype)) {
      const data = this.transferData.getData(type === "view" ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype);
      if (data?.[0]) {
        return new CompositeDragAndDropData(type, data[0].id);
      }
    }
    return void 0;
  }
  writeDragData(id, type) {
    this.transferData.setData([type === "view" ? new DraggedViewIdentifier(id) : new DraggedCompositeIdentifier(id)], type === "view" ? DraggedViewIdentifier.prototype : DraggedCompositeIdentifier.prototype);
  }
  registerTarget(element, callbacks) {
    const disposableStore = new DisposableStore();
    disposableStore.add(new DragAndDropObserver(element, {
      onDragEnter: (e) => {
        e.preventDefault();
        if (callbacks.onDragEnter) {
          const data = this.readDragData("composite") || this.readDragData("view");
          if (data) {
            callbacks.onDragEnter({ eventData: e, dragAndDropData: data });
          }
        }
      },
      onDragLeave: (e) => {
        const data = this.readDragData("composite") || this.readDragData("view");
        if (callbacks.onDragLeave && data) {
          callbacks.onDragLeave({ eventData: e, dragAndDropData: data });
        }
      },
      onDrop: (e) => {
        if (callbacks.onDrop) {
          const data = this.readDragData("composite") || this.readDragData("view");
          if (!data) {
            return;
          }
          callbacks.onDrop({ eventData: e, dragAndDropData: data });
          this.onDragEnd.fire({ eventData: e, dragAndDropData: data });
        }
      },
      onDragOver: (e) => {
        e.preventDefault();
        if (callbacks.onDragOver) {
          const data = this.readDragData("composite") || this.readDragData("view");
          if (!data) {
            return;
          }
          callbacks.onDragOver({ eventData: e, dragAndDropData: data });
        }
      }
    }));
    if (callbacks.onDragStart) {
      this.onDragStart.event((e) => {
        callbacks.onDragStart(e);
      }, this, disposableStore);
    }
    if (callbacks.onDragEnd) {
      this.onDragEnd.event((e) => {
        callbacks.onDragEnd(e);
      }, this, disposableStore);
    }
    return this._register(disposableStore);
  }
  registerDraggable(element, draggedItemProvider, callbacks) {
    element.draggable = true;
    const disposableStore = new DisposableStore();
    disposableStore.add(new DragAndDropObserver(element, {
      onDragStart: (e) => {
        const { id, type } = draggedItemProvider();
        this.writeDragData(id, type);
        e.dataTransfer?.setDragImage(element, 0, 0);
        this.onDragStart.fire({ eventData: e, dragAndDropData: this.readDragData(type) });
      },
      onDragEnd: (e) => {
        const { type } = draggedItemProvider();
        const data = this.readDragData(type);
        if (!data) {
          return;
        }
        this.onDragEnd.fire({ eventData: e, dragAndDropData: data });
      },
      onDragEnter: (e) => {
        if (callbacks.onDragEnter) {
          const data = this.readDragData("composite") || this.readDragData("view");
          if (!data) {
            return;
          }
          if (data) {
            callbacks.onDragEnter({ eventData: e, dragAndDropData: data });
          }
        }
      },
      onDragLeave: (e) => {
        const data = this.readDragData("composite") || this.readDragData("view");
        if (!data) {
          return;
        }
        callbacks.onDragLeave?.({ eventData: e, dragAndDropData: data });
      },
      onDrop: (e) => {
        if (callbacks.onDrop) {
          const data = this.readDragData("composite") || this.readDragData("view");
          if (!data) {
            return;
          }
          callbacks.onDrop({ eventData: e, dragAndDropData: data });
          this.onDragEnd.fire({ eventData: e, dragAndDropData: data });
        }
      },
      onDragOver: (e) => {
        if (callbacks.onDragOver) {
          const data = this.readDragData("composite") || this.readDragData("view");
          if (!data) {
            return;
          }
          callbacks.onDragOver({ eventData: e, dragAndDropData: data });
        }
      }
    }));
    if (callbacks.onDragStart) {
      this.onDragStart.event((e) => {
        callbacks.onDragStart(e);
      }, this, disposableStore);
    }
    if (callbacks.onDragEnd) {
      this.onDragEnd.event((e) => {
        callbacks.onDragEnd(e);
      }, this, disposableStore);
    }
    return this._register(disposableStore);
  }
}
function toggleDropEffect(dataTransfer, dropEffect, shouldHaveIt) {
  if (!dataTransfer) {
    return;
  }
  dataTransfer.dropEffect = shouldHaveIt ? dropEffect : "none";
}
let ResourceListDnDHandler = class {
  constructor(toResource, instantiationService) {
    this.toResource = toResource;
    this.instantiationService = instantiationService;
  }
  getDragURI(element) {
    const resource = this.toResource(element);
    return resource ? resource.toString() : null;
  }
  getDragLabel(elements) {
    const resources = coalesce(elements.map(this.toResource));
    return resources.length === 1 ? basename(resources[0]) : resources.length > 1 ? String(resources.length) : void 0;
  }
  onDragStart(data, originalEvent) {
    const resources = [];
    const elements = data.elements;
    for (const element of elements) {
      const resource = this.toResource(element);
      if (resource) {
        resources.push(resource);
      }
    }
    this.onWillDragElements(elements, originalEvent);
    if (resources.length) {
      this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, resources, originalEvent));
    }
  }
  onWillDragElements(elements, originalEvent) {
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    return false;
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
  }
  dispose() {
  }
};
ResourceListDnDHandler = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ResourceListDnDHandler);
const _GlobalWindowDraggedOverTracker = class _GlobalWindowDraggedOverTracker extends Disposable {
  constructor() {
    super();
    this.broadcaster = this._register(new BroadcastDataChannel(_GlobalWindowDraggedOverTracker.CHANNEL_NAME));
    this.draggedOver = false;
    this.registerListeners();
  }
  registerListeners() {
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      disposables.add(addDisposableListener(window, EventType.DRAG_OVER, () => this.markDraggedOver(false), true));
      disposables.add(addDisposableListener(window, EventType.DRAG_LEAVE, () => this.clearDraggedOver(false), true));
    }, { window: mainWindow, disposables: this._store }));
    this._register(this.broadcaster.onDidReceiveData((data) => {
      if (data === true) {
        this.markDraggedOver(true);
      } else {
        this.clearDraggedOver(true);
      }
    }));
  }
  get isDraggedOver() {
    return this.draggedOver;
  }
  markDraggedOver(fromBroadcast) {
    if (this.draggedOver === true) {
      return;
    }
    this.draggedOver = true;
    if (!fromBroadcast) {
      this.broadcaster.postData(true);
    }
  }
  clearDraggedOver(fromBroadcast) {
    if (this.draggedOver === false) {
      return;
    }
    this.draggedOver = false;
    if (!fromBroadcast) {
      this.broadcaster.postData(false);
    }
  }
};
_GlobalWindowDraggedOverTracker.CHANNEL_NAME = "monaco-workbench-global-dragged-over";
let GlobalWindowDraggedOverTracker = _GlobalWindowDraggedOverTracker;
const globalDraggedOverTracker = new GlobalWindowDraggedOverTracker();
function isWindowDraggedOver() {
  return globalDraggedOverTracker.isDraggedOver;
}
export {
  CompositeDragAndDropData,
  CompositeDragAndDropObserver,
  DraggedCompositeIdentifier,
  DraggedEditorGroupIdentifier,
  DraggedEditorIdentifier,
  DraggedViewIdentifier,
  ResourceListDnDHandler,
  ResourcesDropHandler,
  extractTreeDropData,
  fillEditorsDragData,
  isWindowDraggedOver,
  toggleDropEffect
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXGRuZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERhdGFUcmFuc2ZlcnMsIElEcmFnQW5kRHJvcERhdGEgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IERyYWdBbmREcm9wT2JzZXJ2ZXIsIEV2ZW50VHlwZSwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBvbkRpZFJlZ2lzdGVyV2luZG93IH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEcmFnTW91c2VFdmVudCB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElMaXN0RHJhZ0FuZERyb3AgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IElUcmVlRHJhZ092ZXJSZWFjdGlvbiB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgVXJpTGlzdCwgVlNEYXRhVHJhbnNmZXIgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9kYXRhVHJhbnNmZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBtYXJrQXNTaW5nbGV0b24gfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgc3RyaW5naWZ5IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIFNjaGVtYXMgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb2RlRGF0YVRyYW5zZmVycywgRXh0ZW5zaW9ucywgSURyYWdBbmREcm9wQ29udHJpYnV0aW9uUmVnaXN0cnksIElEcmFnZ2VkUmVzb3VyY2VFZGl0b3JJbnB1dCwgSVJlc291cmNlU3RhdCwgTG9jYWxTZWxlY3Rpb25UcmFuc2ZlciwgY3JlYXRlRHJhZ2dlZEVkaXRvcklucHV0RnJvbVJhd1Jlc291cmNlc0RhdGEsIGV4dHJhY3RFZGl0b3JzQW5kRmlsZXNEcm9wRGF0YSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IGV4dHJhY3RTZWxlY3Rpb24sIHdpdGhTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV2luZG93T3BlbmFibGUgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24sIGlzVGVtcG9yYXJ5V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YSwgSVdvcmtzcGFjZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBHcm91cElkZW50aWZpZXIsIElFZGl0b3JJZGVudGlmaWVyLCBpc0VkaXRvcklkZW50aWZpZXIsIGlzUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIGlzUmVzb3VyY2VNZXJnZUVkaXRvcklucHV0LCBpc1Jlc291cmNlU2lkZUJ5U2lkZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEJyb2FkY2FzdERhdGFDaGFubmVsIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL2Jyb2FkY2FzdC5qcyc7XG5cbi8vI3JlZ2lvbiBFZGl0b3IgLyBSZXNvdXJjZXMgRE5EXG5cbmV4cG9ydCBjbGFzcyBEcmFnZ2VkRWRpdG9ySWRlbnRpZmllciB7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgaWRlbnRpZmllcjogSUVkaXRvcklkZW50aWZpZXIpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllciB7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgaWRlbnRpZmllcjogR3JvdXBJZGVudGlmaWVyKSB7IH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4dHJhY3RUcmVlRHJvcERhdGEoZGF0YVRyYW5zZmVyOiBWU0RhdGFUcmFuc2Zlcik6IFByb21pc2U8QXJyYXk8SURyYWdnZWRSZXNvdXJjZUVkaXRvcklucHV0Pj4ge1xuXHRjb25zdCBlZGl0b3JzOiBJRHJhZ2dlZFJlc291cmNlRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRjb25zdCByZXNvdXJjZXNLZXkgPSBNaW1lcy51cmlMaXN0LnRvTG93ZXJDYXNlKCk7XG5cblx0Ly8gRGF0YSBUcmFuc2ZlcjogUmVzb3VyY2VzXG5cdGlmIChkYXRhVHJhbnNmZXIuaGFzKHJlc291cmNlc0tleSkpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXNTdHJpbmcgPSBhd2FpdCBkYXRhVHJhbnNmZXIuZ2V0KHJlc291cmNlc0tleSk/LmFzU3RyaW5nKCk7XG5cdFx0XHRjb25zdCByYXdSZXNvdXJjZXNEYXRhID0gSlNPTi5zdHJpbmdpZnkoVXJpTGlzdC5wYXJzZShhc1N0cmluZyA/PyAnJykpO1xuXHRcdFx0ZWRpdG9ycy5wdXNoKC4uLmNyZWF0ZURyYWdnZWRFZGl0b3JJbnB1dEZyb21SYXdSZXNvdXJjZXNEYXRhKHJhd1Jlc291cmNlc0RhdGEpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gSW52YWxpZCB0cmFuc2ZlclxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBlZGl0b3JzO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvdXJjZXNEcm9wSGFuZGxlck9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHdlIHByb2JlIGZvciB0aGUgZHJvcHBlZCByZXNvdXJjZSB0byBiZSBhIHdvcmtzcGFjZVxuXHQgKiAoaS5lLiBjb2RlLXdvcmtzcGFjZSBmaWxlIG9yIGV2ZW4gYSBmb2xkZXIpLCBhbGxvd2luZyB0b1xuXHQgKiBvcGVuIGl0IGFzIHdvcmtzcGFjZSBpbnN0ZWFkIG9mIG9wZW5pbmcgYXMgZWRpdG9yLlxuXHQgKi9cblx0cmVhZG9ubHkgYWxsb3dXb3Jrc3BhY2VPcGVuOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFNoYXJlZCBmdW5jdGlvbiBhY3Jvc3Mgc29tZSBjb21wb25lbnRzIHRvIGhhbmRsZSBkcmFnICYgZHJvcCBvZiByZXNvdXJjZXMuXG4gKiBFLmcuIG9mIGZvbGRlcnMgYW5kIHdvcmtzcGFjZSBmaWxlcyB0byBvcGVuIHRoZW0gaW4gdGhlIHdpbmRvdyBpbnN0ZWFkIG9mXG4gKiB0aGUgZWRpdG9yIG9yIHRvIGhhbmRsZSBkaXJ0eSBlZGl0b3JzIGJlaW5nIGRyb3BwZWQgYmV0d2VlbiBpbnN0YW5jZXMgb2YgQ29kZS5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlc291cmNlc0Ryb3BIYW5kbGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElSZXNvdXJjZXNEcm9wSGFuZGxlck9wdGlvbnMsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNTZXJ2aWNlOiBJV29ya3NwYWNlc1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlOiBJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgaGFuZGxlRHJvcChldmVudDogRHJhZ0V2ZW50LCB0YXJnZXRXaW5kb3c6IFdpbmRvdywgcmVzb2x2ZVRhcmdldEdyb3VwPzogKCkgPT4gSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkLCBhZnRlckRyb3A/OiAodGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cCB8IHVuZGVmaW5lZCkgPT4gdm9pZCwgb3B0aW9ucz86IElFZGl0b3JPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZXh0cmFjdEVkaXRvcnNBbmRGaWxlc0Ryb3BEYXRhKGFjY2Vzc29yLCBldmVudCkpO1xuXHRcdGlmICghZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHRoZSB3aW5kb3cgYWN0aXZlIHRvIGhhbmRsZSB0aGUgZHJvcCBwcm9wZXJseSB3aXRoaW5cblx0XHRhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLmZvY3VzKHRhcmdldFdpbmRvdyk7XG5cblx0XHQvLyBDaGVjayBmb3IgcmVnaXN0ZXJlZCBkcm9wIGhhbmRsZXJzXG5cdFx0Y29uc3QgZG5kUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJRHJhZ0FuZERyb3BDb250cmlidXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5EcmFnQW5kRHJvcENvbnRyaWJ1dGlvbik7XG5cdFx0Zm9yIChjb25zdCB7IHJlc291cmNlIH0gb2YgZWRpdG9ycykge1xuXHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZWQgPSBhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGRuZFJlZ2lzdHJ5LmhhbmRsZVJlc291cmNlRHJvcChyZXNvdXJjZSwgYWNjZXNzb3IpKTtcblx0XHRcdFx0aWYgKGhhbmRsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3Igd29ya3NwYWNlIGZpbGUgLyBmb2xkZXIgYmVpbmcgZHJvcHBlZCBpZiB3ZSBhcmUgYWxsb3dlZCB0byBkbyBzb1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuYWxsb3dXb3Jrc3BhY2VPcGVuKSB7XG5cdFx0XHRjb25zdCBsb2NhbEZpbGVzQWxsb3dlZFRvT3BlbkFzV29ya3NwYWNlID0gY29hbGVzY2UoZWRpdG9ycy5maWx0ZXIoZWRpdG9yID0+IGVkaXRvci5hbGxvd1dvcmtzcGFjZU9wZW4gJiYgZWRpdG9yLnJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkubWFwKGVkaXRvciA9PiBlZGl0b3IucmVzb3VyY2UpKTtcblx0XHRcdGlmIChsb2NhbEZpbGVzQWxsb3dlZFRvT3BlbkFzV29ya3NwYWNlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgaXNXb3Jrc3BhY2VPcGVuaW5nID0gYXdhaXQgdGhpcy5oYW5kbGVXb3Jrc3BhY2VEcm9wKGxvY2FsRmlsZXNBbGxvd2VkVG9PcGVuQXNXb3Jrc3BhY2UpO1xuXHRcdFx0XHRpZiAoaXNXb3Jrc3BhY2VPcGVuaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gZWFybHkgaWYgdGhlIGRyb3Agb3BlcmF0aW9uIHJlc3VsdGVkIGluIHRoaXMgd2luZG93IGNoYW5naW5nIHRvIGEgd29ya3NwYWNlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgZXh0ZXJuYWwgb25lcyB0byByZWNlbnRseSBvcGVuIGxpc3QgdW5sZXNzIGRyb3BwZWQgcmVzb3VyY2UgaXMgYSB3b3Jrc3BhY2Vcblx0XHRjb25zdCBleHRlcm5hbExvY2FsRmlsZXMgPSBjb2FsZXNjZShlZGl0b3JzLmZpbHRlcihlZGl0b3IgPT4gZWRpdG9yLmlzRXh0ZXJuYWwgJiYgZWRpdG9yLnJlc291cmNlPy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkubWFwKGVkaXRvciA9PiBlZGl0b3IucmVzb3VyY2UpKTtcblx0XHRpZiAoZXh0ZXJuYWxMb2NhbEZpbGVzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VzU2VydmljZS5hZGRSZWNlbnRseU9wZW5lZChleHRlcm5hbExvY2FsRmlsZXMubWFwKHJlc291cmNlID0+ICh7IGZpbGVVcmk6IHJlc291cmNlIH0pKSk7XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBpbiBFZGl0b3Jcblx0XHRjb25zdCB0YXJnZXRHcm91cCA9IHJlc29sdmVUYXJnZXRHcm91cD8uKCk7XG5cdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3JzKGVkaXRvcnMubWFwKGVkaXRvciA9PiAoe1xuXHRcdFx0Li4uZWRpdG9yLFxuXHRcdFx0cmVzb3VyY2U6IGVkaXRvci5yZXNvdXJjZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0Li4uZWRpdG9yLm9wdGlvbnMsXG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdHBpbm5lZDogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0pKSwgdGFyZ2V0R3JvdXAsIHsgdmFsaWRhdGVUcnVzdDogdHJ1ZSB9KTtcblxuXHRcdC8vIEZpbmlzaCB3aXRoIHByb3ZpZGVkIGZ1bmN0aW9uXG5cdFx0YWZ0ZXJEcm9wPy4odGFyZ2V0R3JvdXApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVXb3Jrc3BhY2VEcm9wKHJlc291cmNlczogVVJJW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB0b09wZW46IElXaW5kb3dPcGVuYWJsZVtdID0gW107XG5cdFx0Y29uc3QgZm9sZGVyVVJJczogSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YVtdID0gW107XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChyZXNvdXJjZXMubWFwKGFzeW5jIHJlc291cmNlID0+IHtcblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIFdvcmtzcGFjZVxuXHRcdFx0aWYgKGhhc1dvcmtzcGFjZUZpbGVFeHRlbnNpb24ocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRvT3Blbi5wdXNoKHsgd29ya3NwYWNlVXJpOiByZXNvdXJjZSB9KTtcblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGZvciBGb2xkZXJcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdHRvT3Blbi5wdXNoKHsgZm9sZGVyVXJpOiBzdGF0LnJlc291cmNlIH0pO1xuXHRcdFx0XHRcdGZvbGRlclVSSXMucHVzaCh7IHVyaTogc3RhdC5yZXNvdXJjZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gSWdub3JlIGVycm9yXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmV0dXJuIGVhcmx5IGlmIG5vIGV4dGVybmFsIHJlc291cmNlIGlzIGEgZm9sZGVyIG9yIHdvcmtzcGFjZVxuXHRcdGlmICh0b09wZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBpbiBzZXBhcmF0ZSB3aW5kb3dzIGlmIHdlIGRyb3Agd29ya3NwYWNlcyBvciBqdXN0IG9uZSBmb2xkZXJcblx0XHRpZiAodG9PcGVuLmxlbmd0aCA+IGZvbGRlclVSSXMubGVuZ3RoIHx8IGZvbGRlclVSSXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3codG9PcGVuKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgdG8gd29ya3NwYWNlIGlmIHdlIGFyZSBpbiBhIHRlbXBvcmFyeSB3b3Jrc3BhY2Vcblx0XHRlbHNlIGlmIChpc1RlbXBvcmFyeVdvcmtzcGFjZSh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSkge1xuXHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VFZGl0aW5nU2VydmljZS5hZGRGb2xkZXJzKGZvbGRlclVSSXMpO1xuXHRcdH1cblxuXHRcdC8vIEZpbmFsbHksIGVudGVyIHVudGl0bGVkIHdvcmtzcGFjZSB3aGVuIGRyb3BwaW5nID4xIGZvbGRlcnNcblx0XHRlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlRWRpdGluZ1NlcnZpY2UuY3JlYXRlQW5kRW50ZXJXb3Jrc3BhY2UoZm9sZGVyVVJJcyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbGxFZGl0b3JzRHJhZ0RhdGEoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlczogVVJJW10sIGV2ZW50OiBEcmFnTW91c2VFdmVudCB8IERyYWdFdmVudCwgb3B0aW9ucz86IHsgZGlzYWJsZVN0YW5kYXJkVHJhbnNmZXI6IGJvb2xlYW4gfSk6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gZmlsbEVkaXRvcnNEcmFnRGF0YShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2VzOiBJUmVzb3VyY2VTdGF0W10sIGV2ZW50OiBEcmFnTW91c2VFdmVudCB8IERyYWdFdmVudCwgb3B0aW9ucz86IHsgZGlzYWJsZVN0YW5kYXJkVHJhbnNmZXI6IGJvb2xlYW4gfSk6IHZvaWQ7XG5leHBvcnQgZnVuY3Rpb24gZmlsbEVkaXRvcnNEcmFnRGF0YShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yczogSUVkaXRvcklkZW50aWZpZXJbXSwgZXZlbnQ6IERyYWdNb3VzZUV2ZW50IHwgRHJhZ0V2ZW50LCBvcHRpb25zPzogeyBkaXNhYmxlU3RhbmRhcmRUcmFuc2ZlcjogYm9vbGVhbiB9KTogdm9pZDtcbmV4cG9ydCBmdW5jdGlvbiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZXNPckVkaXRvcnM6IEFycmF5PFVSSSB8IElSZXNvdXJjZVN0YXQgfCBJRWRpdG9ySWRlbnRpZmllcj4sIGV2ZW50OiBEcmFnTW91c2VFdmVudCB8IERyYWdFdmVudCwgb3B0aW9ucz86IHsgZGlzYWJsZVN0YW5kYXJkVHJhbnNmZXI6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRpZiAocmVzb3VyY2VzT3JFZGl0b3JzLmxlbmd0aCA9PT0gMCB8fCAhZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgdGV4dEZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0RmlsZVNlcnZpY2UpO1xuXHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0Y29uc3QgbGFiZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYWJlbFNlcnZpY2UpO1xuXG5cdC8vIEV4dHJhY3QgcmVzb3VyY2VzIGZyb20gVVJJcyBvciBFZGl0b3JzIHRoYXRcblx0Ly8gY2FuIGJlIGhhbmRsZWQgYnkgdGhlIGZpbGUgc2VydmljZVxuXHRjb25zdCByZXNvdXJjZXMgPSBjb2FsZXNjZShyZXNvdXJjZXNPckVkaXRvcnMubWFwKChyZXNvdXJjZU9yRWRpdG9yKTogSVJlc291cmNlU3RhdCB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZU9yRWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuIHsgcmVzb3VyY2U6IHJlc291cmNlT3JFZGl0b3IgfTtcblx0XHR9XG5cblx0XHRpZiAoaXNFZGl0b3JJZGVudGlmaWVyKHJlc291cmNlT3JFZGl0b3IpKSB7XG5cdFx0XHRpZiAoVVJJLmlzVXJpKHJlc291cmNlT3JFZGl0b3IuZWRpdG9yLnJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4geyByZXNvdXJjZTogcmVzb3VyY2VPckVkaXRvci5lZGl0b3IucmVzb3VyY2UgfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gZWRpdG9yIHdpdGhvdXQgcmVzb3VyY2Vcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlT3JFZGl0b3Iuc2VsZWN0aW9uID8gd2l0aFNlbGVjdGlvbihyZXNvdXJjZU9yRWRpdG9yLnJlc291cmNlLCByZXNvdXJjZU9yRWRpdG9yLnNlbGVjdGlvbikgOiByZXNvdXJjZU9yRWRpdG9yLnJlc291cmNlLFxuXHRcdFx0aXNEaXJlY3Rvcnk6IHJlc291cmNlT3JFZGl0b3IuaXNEaXJlY3RvcnksXG5cdFx0XHRzZWxlY3Rpb246IHJlc291cmNlT3JFZGl0b3Iuc2VsZWN0aW9uLFxuXHRcdH07XG5cdH0pKTtcblxuXHRjb25zdCBmaWxlU3lzdGVtUmVzb3VyY2VzID0gcmVzb3VyY2VzLmZpbHRlcigoeyByZXNvdXJjZSB9KSA9PiBmaWxlU2VydmljZS5oYXNQcm92aWRlcihyZXNvdXJjZSkpO1xuXHRpZiAoIW9wdGlvbnM/LmRpc2FibGVTdGFuZGFyZFRyYW5zZmVyKSB7XG5cblx0XHQvLyBUZXh0OiBhbGxvd3MgdG8gcGFzdGUgaW50byB0ZXh0LWNhcGFibGUgYXJlYXNcblx0XHRjb25zdCBsaW5lRGVsaW1pdGVyID0gaXNXaW5kb3dzID8gJ1xcclxcbicgOiAnXFxuJztcblx0XHRldmVudC5kYXRhVHJhbnNmZXIuc2V0RGF0YShEYXRhVHJhbnNmZXJzLlRFWFQsIGZpbGVTeXN0ZW1SZXNvdXJjZXMubWFwKCh7IHJlc291cmNlIH0pID0+IGxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyZXNvdXJjZSwgeyBub1ByZWZpeDogdHJ1ZSB9KSkuam9pbihsaW5lRGVsaW1pdGVyKSk7XG5cblx0XHQvLyBEb3dubG9hZCBVUkw6IGVuYWJsZXMgc3VwcG9ydCB0byBkcmFnIGEgdGFiIGFzIGZpbGUgdG8gZGVza3RvcFxuXHRcdC8vIFJlcXVpcmVtZW50czpcblx0XHQvLyAtIENocm9tZS9FZGdlIG9ubHlcblx0XHQvLyAtIG9ubHkgYSBzaW5nbGUgZmlsZSBpcyBzdXBwb3J0ZWRcblx0XHQvLyAtIG9ubHkgZmlsZTovIHJlc291cmNlcyBhcmUgc3VwcG9ydGVkXG5cdFx0Y29uc3QgZmlyc3RGaWxlID0gZmlsZVN5c3RlbVJlc291cmNlcy5maW5kKCh7IGlzRGlyZWN0b3J5IH0pID0+ICFpc0RpcmVjdG9yeSk7XG5cdFx0aWYgKGZpcnN0RmlsZSkge1xuXHRcdFx0Y29uc3QgZmlyc3RGaWxlVXJpID0gRmlsZUFjY2Vzcy51cmlUb0ZpbGVVcmkoZmlyc3RGaWxlLnJlc291cmNlKTsgLy8gZW5mb3JjZSBgZmlsZTpgIFVSSXNcblx0XHRcdGlmIChmaXJzdEZpbGVVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0ZXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoRGF0YVRyYW5zZmVycy5ET1dOTE9BRF9VUkwsIFtNaW1lcy5iaW5hcnksIGJhc2VuYW1lKGZpcnN0RmlsZS5yZXNvdXJjZSksIGZpcnN0RmlsZVVyaS50b1N0cmluZygpXS5qb2luKCc6JykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFJlc291cmNlIFVSTHM6IGFsbG93cyB0byBkcm9wIG11bHRpcGxlIGZpbGUgcmVzb3VyY2VzIHRvIGEgdGFyZ2V0IGluIFZTIENvZGVcblx0Y29uc3QgZmlsZXMgPSBmaWxlU3lzdGVtUmVzb3VyY2VzLmZpbHRlcigoeyBpc0RpcmVjdG9yeSB9KSA9PiAhaXNEaXJlY3RvcnkpO1xuXHRpZiAoZmlsZXMubGVuZ3RoKSB7XG5cdFx0ZXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoRGF0YVRyYW5zZmVycy5SRVNPVVJDRVMsIEpTT04uc3RyaW5naWZ5KGZpbGVzLm1hcCgoeyByZXNvdXJjZSB9KSA9PiByZXNvdXJjZS50b1N0cmluZygpKSkpO1xuXHR9XG5cblx0Ly8gQ29udHJpYnV0aW9uc1xuXHRjb25zdCBjb250cmlidXRpb25zID0gUmVnaXN0cnkuYXM8SURyYWdBbmREcm9wQ29udHJpYnV0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuRHJhZ0FuZERyb3BDb250cmlidXRpb24pLmdldEFsbCgpO1xuXHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBjb250cmlidXRpb25zKSB7XG5cdFx0Y29udHJpYnV0aW9uLnNldERhdGEocmVzb3VyY2VzLCBldmVudCk7XG5cdH1cblxuXHQvLyBFZGl0b3JzOiBlbmFibGVzIGNyb3NzIHdpbmRvdyBETkQgb2YgZWRpdG9yc1xuXHQvLyBpbnRvIHRoZSBlZGl0b3IgYXJlYSB3aGlsZSBwcmVzZXJpbmcgVUkgc3RhdGVcblx0Y29uc3QgZHJhZ2dlZEVkaXRvcnM6IElEcmFnZ2VkUmVzb3VyY2VFZGl0b3JJbnB1dFtdID0gW107XG5cblx0Zm9yIChjb25zdCByZXNvdXJjZU9yRWRpdG9yIG9mIHJlc291cmNlc09yRWRpdG9ycykge1xuXG5cdFx0Ly8gRXh0cmFjdCByZXNvdXJjZSBlZGl0b3IgZnJvbSBwcm92aWRlZCBvYmplY3Qgb3IgVVJJXG5cdFx0bGV0IGVkaXRvcjogSURyYWdnZWRSZXNvdXJjZUVkaXRvcklucHV0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChpc0VkaXRvcklkZW50aWZpZXIocmVzb3VyY2VPckVkaXRvcikpIHtcblx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3IgPSByZXNvdXJjZU9yRWRpdG9yLmVkaXRvci50b1VudHlwZWQoeyBwcmVzZXJ2ZVZpZXdTdGF0ZTogcmVzb3VyY2VPckVkaXRvci5ncm91cElkIH0pO1xuXHRcdFx0aWYgKHVudHlwZWRFZGl0b3IpIHtcblx0XHRcdFx0ZWRpdG9yID0geyAuLi51bnR5cGVkRWRpdG9yLCByZXNvdXJjZTogRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkodW50eXBlZEVkaXRvcikgfTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKFVSSS5pc1VyaShyZXNvdXJjZU9yRWRpdG9yKSkge1xuXHRcdFx0Y29uc3QgeyBzZWxlY3Rpb24sIHVyaSB9ID0gZXh0cmFjdFNlbGVjdGlvbihyZXNvdXJjZU9yRWRpdG9yKTtcblx0XHRcdGVkaXRvciA9IHsgcmVzb3VyY2U6IHVyaSwgb3B0aW9uczogc2VsZWN0aW9uID8geyBzZWxlY3Rpb24gfSA6IHVuZGVmaW5lZCB9O1xuXHRcdH0gZWxzZSBpZiAoIXJlc291cmNlT3JFZGl0b3IuaXNEaXJlY3RvcnkpIHtcblx0XHRcdGVkaXRvciA9IHtcblx0XHRcdFx0cmVzb3VyY2U6IHJlc291cmNlT3JFZGl0b3IucmVzb3VyY2UsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRzZWxlY3Rpb246IHJlc291cmNlT3JFZGl0b3Iuc2VsZWN0aW9uLFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRjb250aW51ZTsgLy8gc2tpcCBvdmVyIGVkaXRvcnMgdGhhdCBjYW5ub3QgYmUgdHJhbnNmZXJyZWQgdmlhIGRuZFxuXHRcdH1cblxuXHRcdC8vIEZpbGwgaW4gc29tZSBwcm9wZXJ0aWVzIGlmIHRoZXkgYXJlIG5vdCB0aGVyZSBhbHJlYWR5IGJ5IGFjY2Vzc2luZ1xuXHRcdC8vIHNvbWUgd2VsbCBrbm93biB0aGluZ3MgZnJvbSB0aGUgdGV4dCBmaWxlIHVuaXZlcnNlLlxuXHRcdC8vIFRoaXMgaXMgbm90IGlkZWFsIGZvciBjdXN0b20gZWRpdG9ycywgYnV0IHRob3NlIGhhdmUgYSBjaGFuY2UgdG9cblx0XHQvLyBwcm92aWRlIGV2ZXJ5dGhpbmcgZnJvbSB0aGUgYHRvVW50eXBlZGAgbWV0aG9kLlxuXHRcdHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZWRpdG9yLnJlc291cmNlO1xuXHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IHRleHRGaWxlTW9kZWwgPSB0ZXh0RmlsZVNlcnZpY2UuZmlsZXMuZ2V0KHJlc291cmNlKTtcblx0XHRcdFx0aWYgKHRleHRGaWxlTW9kZWwpIHtcblxuXHRcdFx0XHRcdC8vIGxhbmd1YWdlXG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBlZGl0b3IubGFuZ3VhZ2VJZCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGVkaXRvci5sYW5ndWFnZUlkID0gdGV4dEZpbGVNb2RlbC5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gZW5jb2Rpbmdcblx0XHRcdFx0XHRpZiAodHlwZW9mIGVkaXRvci5lbmNvZGluZyAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGVkaXRvci5lbmNvZGluZyA9IHRleHRGaWxlTW9kZWwuZ2V0RW5jb2RpbmcoKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBjb250ZW50cyAob25seSBpZiBkaXJ0eSBhbmQgbm90IHRvbyBsYXJnZSlcblx0XHRcdFx0XHRpZiAodHlwZW9mIGVkaXRvci5jb250ZW50cyAhPT0gJ3N0cmluZycgJiYgdGV4dEZpbGVNb2RlbC5pc0RpcnR5KCkgJiYgIXRleHRGaWxlTW9kZWwudGV4dEVkaXRvck1vZGVsLmlzVG9vTGFyZ2VGb3JIZWFwT3BlcmF0aW9uKCkpIHtcblx0XHRcdFx0XHRcdGVkaXRvci5jb250ZW50cyA9IHRleHRGaWxlTW9kZWwudGV4dEVkaXRvck1vZGVsLmdldFZhbHVlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gdmlld1N0YXRlXG5cdFx0XHRcdGlmICghZWRpdG9yLm9wdGlvbnM/LnZpZXdTdGF0ZSkge1xuXHRcdFx0XHRcdGVkaXRvci5vcHRpb25zID0ge1xuXHRcdFx0XHRcdFx0Li4uZWRpdG9yLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHR2aWV3U3RhdGU6ICgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgdmlzaWJsZUVkaXRvclBhbmUgb2YgZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9yUGFuZXMpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoaXNFcXVhbCh2aXNpYmxlRWRpdG9yUGFuZS5pbnB1dC5yZXNvdXJjZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCB2aWV3U3RhdGUgPSB2aXNpYmxlRWRpdG9yUGFuZS5nZXRWaWV3U3RhdGUoKTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmICh2aWV3U3RhdGUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHZpZXdTdGF0ZTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fSkoKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgYXMgZHJhZ2dlZCBlZGl0b3Jcblx0XHRkcmFnZ2VkRWRpdG9ycy5wdXNoKGVkaXRvcik7XG5cdH1cblxuXHRpZiAoZHJhZ2dlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0ZXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoQ29kZURhdGFUcmFuc2ZlcnMuRURJVE9SUywgc3RyaW5naWZ5KGRyYWdnZWRFZGl0b3JzKSk7XG5cdH1cblxuXHQvLyBBZGQgYSBVUkkgbGlzdCBlbnRyeVxuXHRjb25zdCBkcmFnZ2VkRGlyZWN0b3JpZXM6IFVSSVtdID0gZmlsZVN5c3RlbVJlc291cmNlcy5maWx0ZXIoKHsgaXNEaXJlY3RvcnkgfSkgPT4gaXNEaXJlY3RvcnkpLm1hcCgoeyByZXNvdXJjZSB9KSA9PiByZXNvdXJjZSk7XG5cdGlmIChkcmFnZ2VkRWRpdG9ycy5sZW5ndGggfHwgZHJhZ2dlZERpcmVjdG9yaWVzLmxlbmd0aCkge1xuXHRcdGNvbnN0IHVyaUxpc3RFbnRyaWVzOiBVUklbXSA9IFsuLi5kcmFnZ2VkRGlyZWN0b3JpZXNdO1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGRyYWdnZWRFZGl0b3JzKSB7XG5cdFx0XHRpZiAoZWRpdG9yLnJlc291cmNlKSB7XG5cdFx0XHRcdHVyaUxpc3RFbnRyaWVzLnB1c2goZWRpdG9yLm9wdGlvbnM/LnNlbGVjdGlvbiA/IHdpdGhTZWxlY3Rpb24oZWRpdG9yLnJlc291cmNlLCBlZGl0b3Iub3B0aW9ucy5zZWxlY3Rpb24pIDogZWRpdG9yLnJlc291cmNlKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNSZXNvdXJjZURpZmZFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRcdGlmIChlZGl0b3IubW9kaWZpZWQucmVzb3VyY2UpIHtcblx0XHRcdFx0XHR1cmlMaXN0RW50cmllcy5wdXNoKGVkaXRvci5tb2RpZmllZC5yZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNSZXNvdXJjZVNpZGVCeVNpZGVFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRcdGlmIChlZGl0b3IucHJpbWFyeS5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdHVyaUxpc3RFbnRyaWVzLnB1c2goZWRpdG9yLnByaW1hcnkucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGlzUmVzb3VyY2VNZXJnZUVkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdFx0dXJpTGlzdEVudHJpZXMucHVzaChlZGl0b3IucmVzdWx0LnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEdWUgdG8gaHR0cHM6Ly9idWdzLmNocm9taXVtLm9yZy9wL2Nocm9taXVtL2lzc3Vlcy9kZXRhaWw/aWQ9MjM5NzQ1LCB3ZSBjYW4gb25seSBzZXRcblx0XHQvLyBhIHNpbmdsZSB1cmkgZm9yIHRoZSByZWFsIGB0ZXh0L3VyaS1saXN0YCB0eXBlLiBPdGhlcndpc2UgYWxsIHVyaXMgZW5kIHVwIGpvaW5lZCB0b2dldGhlclxuXHRcdC8vIEhvd2V2ZXIgd2Ugd3JpdGUgdGhlIGZ1bGwgdXJpLWxpc3QgdG8gYW4gaW50ZXJuYWwgdHlwZSBzbyB0aGF0IG90aGVyIHBhcnRzIG9mIFZTIENvZGVcblx0XHQvLyBjYW4gdXNlIHRoZSBmdWxsIGxpc3QuXG5cdFx0aWYgKCFvcHRpb25zPy5kaXNhYmxlU3RhbmRhcmRUcmFuc2Zlcikge1xuXHRcdFx0ZXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoTWltZXMudXJpTGlzdCwgVXJpTGlzdC5jcmVhdGUodXJpTGlzdEVudHJpZXMuc2xpY2UoMCwgMSkpKTtcblx0XHR9XG5cdFx0ZXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoRGF0YVRyYW5zZmVycy5JTlRFUk5BTF9VUklfTElTVCwgVXJpTGlzdC5jcmVhdGUodXJpTGlzdEVudHJpZXMpKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIENvbXBvc2l0ZXMgRE5EXG5cbmV4cG9ydCB0eXBlIEJlZm9yZTJEID0ge1xuXHRyZWFkb25seSB2ZXJ0aWNhbGx5QmVmb3JlOiBib29sZWFuO1xuXHRyZWFkb25seSBob3Jpem9udGFsbHlCZWZvcmU6IGJvb2xlYW47XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wb3NpdGVEcmFnQW5kRHJvcCB7XG5cdGRyb3AoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0OiBzdHJpbmcgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCwgYmVmb3JlPzogQmVmb3JlMkQpOiB2b2lkO1xuXHRvbkRyYWdPdmVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldDogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuO1xuXHRvbkRyYWdFbnRlcihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlckNhbGxiYWNrcyB7XG5cdG9uRHJhZ0VudGVyPzogKGU6IElEcmFnZ2VkQ29tcG9zaXRlRGF0YSkgPT4gdm9pZDtcblx0b25EcmFnTGVhdmU/OiAoZTogSURyYWdnZWRDb21wb3NpdGVEYXRhKSA9PiB2b2lkO1xuXHRvbkRyb3A/OiAoZTogSURyYWdnZWRDb21wb3NpdGVEYXRhKSA9PiB2b2lkO1xuXHRvbkRyYWdPdmVyPzogKGU6IElEcmFnZ2VkQ29tcG9zaXRlRGF0YSkgPT4gdm9pZDtcblx0b25EcmFnU3RhcnQ/OiAoZTogSURyYWdnZWRDb21wb3NpdGVEYXRhKSA9PiB2b2lkO1xuXHRvbkRyYWdFbmQ/OiAoZTogSURyYWdnZWRDb21wb3NpdGVEYXRhKSA9PiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgQ29tcG9zaXRlRHJhZ0FuZERyb3BEYXRhIGltcGxlbWVudHMgSURyYWdBbmREcm9wRGF0YSB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSB0eXBlOiAndmlldycgfCAnY29tcG9zaXRlJywgcHJpdmF0ZSBpZDogc3RyaW5nKSB7IH1cblxuXHR1cGRhdGUoZGF0YVRyYW5zZmVyOiBEYXRhVHJhbnNmZXIpOiB2b2lkIHtcblx0XHQvLyBuby1vcFxuXHR9XG5cblx0Z2V0RGF0YSgpOiB7XG5cdFx0dHlwZTogJ3ZpZXcnIHwgJ2NvbXBvc2l0ZSc7XG5cdFx0aWQ6IHN0cmluZztcblx0fSB7XG5cdFx0cmV0dXJuIHsgdHlwZTogdGhpcy50eXBlLCBpZDogdGhpcy5pZCB9O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURyYWdnZWRDb21wb3NpdGVEYXRhIHtcblx0cmVhZG9ubHkgZXZlbnREYXRhOiBEcmFnRXZlbnQ7XG5cdHJlYWRvbmx5IGRyYWdBbmREcm9wRGF0YTogQ29tcG9zaXRlRHJhZ0FuZERyb3BEYXRhO1xufVxuXG5leHBvcnQgY2xhc3MgRHJhZ2dlZENvbXBvc2l0ZUlkZW50aWZpZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgY29tcG9zaXRlSWQ6IHN0cmluZykgeyB9XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlSWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERyYWdnZWRWaWV3SWRlbnRpZmllciB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSB2aWV3SWQ6IHN0cmluZykgeyB9XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudmlld0lkO1xuXHR9XG59XG5cbmV4cG9ydCB0eXBlIFZpZXdUeXBlID0gJ2NvbXBvc2l0ZScgfCAndmlldyc7XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgaW5zdGFuY2U6IENvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXIgfCB1bmRlZmluZWQ7XG5cblx0c3RhdGljIGdldCBJTlNUQU5DRSgpOiBDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyIHtcblx0XHRpZiAoIUNvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXIuaW5zdGFuY2UpIHtcblx0XHRcdENvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXIuaW5zdGFuY2UgPSBuZXcgQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlcigpO1xuXHRcdFx0bWFya0FzU2luZ2xldG9uKENvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXIuaW5zdGFuY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyLmluc3RhbmNlO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSB0cmFuc2ZlckRhdGEgPSBMb2NhbFNlbGVjdGlvblRyYW5zZmVyLmdldEluc3RhbmNlPERyYWdnZWRDb21wb3NpdGVJZGVudGlmaWVyIHwgRHJhZ2dlZFZpZXdJZGVudGlmaWVyPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb25EcmFnU3RhcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRHJhZ2dlZENvbXBvc2l0ZURhdGE+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRHJhZ0VuZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElEcmFnZ2VkQ29tcG9zaXRlRGF0YT4oKSk7XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRyYWdFbmQuZXZlbnQoZSA9PiB7XG5cdFx0XHRjb25zdCBpZCA9IGUuZHJhZ0FuZERyb3BEYXRhLmdldERhdGEoKS5pZDtcblx0XHRcdGNvbnN0IHR5cGUgPSBlLmRyYWdBbmREcm9wRGF0YS5nZXREYXRhKCkudHlwZTtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLnJlYWREcmFnRGF0YSh0eXBlKTtcblx0XHRcdGlmIChkYXRhPy5nZXREYXRhKCkuaWQgPT09IGlkKSB7XG5cdFx0XHRcdHRoaXMudHJhbnNmZXJEYXRhLmNsZWFyRGF0YSh0eXBlID09PSAndmlldycgPyBEcmFnZ2VkVmlld0lkZW50aWZpZXIucHJvdG90eXBlIDogRHJhZ2dlZENvbXBvc2l0ZUlkZW50aWZpZXIucHJvdG90eXBlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWREcmFnRGF0YSh0eXBlOiBWaWV3VHlwZSk6IENvbXBvc2l0ZURyYWdBbmREcm9wRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMudHJhbnNmZXJEYXRhLmhhc0RhdGEodHlwZSA9PT0gJ3ZpZXcnID8gRHJhZ2dlZFZpZXdJZGVudGlmaWVyLnByb3RvdHlwZSA6IERyYWdnZWRDb21wb3NpdGVJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLnRyYW5zZmVyRGF0YS5nZXREYXRhKHR5cGUgPT09ICd2aWV3JyA/IERyYWdnZWRWaWV3SWRlbnRpZmllci5wcm90b3R5cGUgOiBEcmFnZ2VkQ29tcG9zaXRlSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKGRhdGE/LlswXSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IENvbXBvc2l0ZURyYWdBbmREcm9wRGF0YSh0eXBlLCBkYXRhWzBdLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSB3cml0ZURyYWdEYXRhKGlkOiBzdHJpbmcsIHR5cGU6IFZpZXdUeXBlKTogdm9pZCB7XG5cdFx0dGhpcy50cmFuc2ZlckRhdGEuc2V0RGF0YShbdHlwZSA9PT0gJ3ZpZXcnID8gbmV3IERyYWdnZWRWaWV3SWRlbnRpZmllcihpZCkgOiBuZXcgRHJhZ2dlZENvbXBvc2l0ZUlkZW50aWZpZXIoaWQpXSwgdHlwZSA9PT0gJ3ZpZXcnID8gRHJhZ2dlZFZpZXdJZGVudGlmaWVyLnByb3RvdHlwZSA6IERyYWdnZWRDb21wb3NpdGVJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdH1cblxuXHRyZWdpc3RlclRhcmdldChlbGVtZW50OiBIVE1MRWxlbWVudCwgY2FsbGJhY2tzOiBJQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlckNhbGxiYWNrcyk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgRHJhZ0FuZERyb3BPYnNlcnZlcihlbGVtZW50LCB7XG5cdFx0XHRvbkRyYWdFbnRlcjogZSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHRpZiAoY2FsbGJhY2tzLm9uRHJhZ0VudGVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMucmVhZERyYWdEYXRhKCdjb21wb3NpdGUnKSB8fCB0aGlzLnJlYWREcmFnRGF0YSgndmlldycpO1xuXHRcdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0XHRjYWxsYmFja3Mub25EcmFnRW50ZXIoeyBldmVudERhdGE6IGUsIGRyYWdBbmREcm9wRGF0YTogZGF0YSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdMZWF2ZTogZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLnJlYWREcmFnRGF0YSgnY29tcG9zaXRlJykgfHwgdGhpcy5yZWFkRHJhZ0RhdGEoJ3ZpZXcnKTtcblx0XHRcdFx0aWYgKGNhbGxiYWNrcy5vbkRyYWdMZWF2ZSAmJiBkYXRhKSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2tzLm9uRHJhZ0xlYXZlKHsgZXZlbnREYXRhOiBlLCBkcmFnQW5kRHJvcERhdGE6IGRhdGEgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRyb3A6IGUgPT4ge1xuXHRcdFx0XHRpZiAoY2FsbGJhY2tzLm9uRHJvcCkge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLnJlYWREcmFnRGF0YSgnY29tcG9zaXRlJykgfHwgdGhpcy5yZWFkRHJhZ0RhdGEoJ3ZpZXcnKTtcblx0XHRcdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjYWxsYmFja3Mub25Ecm9wKHsgZXZlbnREYXRhOiBlLCBkcmFnQW5kRHJvcERhdGE6IGRhdGEgfSk7XG5cblx0XHRcdFx0XHQvLyBGaXJlIGRyYWcgZXZlbnQgaW4gY2FzZSBkcm9wIGhhbmRsZXIgZGVzdHJveXMgdGhlIGRyYWdnZWQgZWxlbWVudFxuXHRcdFx0XHRcdHRoaXMub25EcmFnRW5kLmZpcmUoeyBldmVudERhdGE6IGUsIGRyYWdBbmREcm9wRGF0YTogZGF0YSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG9uRHJhZ092ZXI6IGUgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0aWYgKGNhbGxiYWNrcy5vbkRyYWdPdmVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMucmVhZERyYWdEYXRhKCdjb21wb3NpdGUnKSB8fCB0aGlzLnJlYWREcmFnRGF0YSgndmlldycpO1xuXHRcdFx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhbGxiYWNrcy5vbkRyYWdPdmVyKHsgZXZlbnREYXRhOiBlLCBkcmFnQW5kRHJvcERhdGE6IGRhdGEgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoY2FsbGJhY2tzLm9uRHJhZ1N0YXJ0KSB7XG5cdFx0XHR0aGlzLm9uRHJhZ1N0YXJ0LmV2ZW50KGUgPT4ge1xuXHRcdFx0XHRjYWxsYmFja3Mub25EcmFnU3RhcnQhKGUpO1xuXHRcdFx0fSwgdGhpcywgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHR9XG5cblx0XHRpZiAoY2FsbGJhY2tzLm9uRHJhZ0VuZCkge1xuXHRcdFx0dGhpcy5vbkRyYWdFbmQuZXZlbnQoZSA9PiB7XG5cdFx0XHRcdGNhbGxiYWNrcy5vbkRyYWdFbmQhKGUpO1xuXHRcdFx0fSwgdGhpcywgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZVN0b3JlKTtcblx0fVxuXG5cdHJlZ2lzdGVyRHJhZ2dhYmxlKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBkcmFnZ2VkSXRlbVByb3ZpZGVyOiAoKSA9PiB7IHR5cGU6IFZpZXdUeXBlOyBpZDogc3RyaW5nIH0sIGNhbGxiYWNrczogSUNvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXJDYWxsYmFja3MpOiBJRGlzcG9zYWJsZSB7XG5cdFx0ZWxlbWVudC5kcmFnZ2FibGUgPSB0cnVlO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgRHJhZ0FuZERyb3BPYnNlcnZlcihlbGVtZW50LCB7XG5cdFx0XHRvbkRyYWdTdGFydDogZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHsgaWQsIHR5cGUgfSA9IGRyYWdnZWRJdGVtUHJvdmlkZXIoKTtcblx0XHRcdFx0dGhpcy53cml0ZURyYWdEYXRhKGlkLCB0eXBlKTtcblxuXHRcdFx0XHRlLmRhdGFUcmFuc2Zlcj8uc2V0RHJhZ0ltYWdlKGVsZW1lbnQsIDAsIDApO1xuXG5cdFx0XHRcdHRoaXMub25EcmFnU3RhcnQuZmlyZSh7IGV2ZW50RGF0YTogZSwgZHJhZ0FuZERyb3BEYXRhOiB0aGlzLnJlYWREcmFnRGF0YSh0eXBlKSEgfSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnRW5kOiBlID0+IHtcblx0XHRcdFx0Y29uc3QgeyB0eXBlIH0gPSBkcmFnZ2VkSXRlbVByb3ZpZGVyKCk7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLnJlYWREcmFnRGF0YSh0eXBlKTtcblx0XHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5vbkRyYWdFbmQuZmlyZSh7IGV2ZW50RGF0YTogZSwgZHJhZ0FuZERyb3BEYXRhOiBkYXRhIH0pO1xuXHRcdFx0fSxcblx0XHRcdG9uRHJhZ0VudGVyOiBlID0+IHtcblx0XHRcdFx0aWYgKGNhbGxiYWNrcy5vbkRyYWdFbnRlcikge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLnJlYWREcmFnRGF0YSgnY29tcG9zaXRlJykgfHwgdGhpcy5yZWFkRHJhZ0RhdGEoJ3ZpZXcnKTtcblx0XHRcdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRcdFx0Y2FsbGJhY2tzLm9uRHJhZ0VudGVyKHsgZXZlbnREYXRhOiBlLCBkcmFnQW5kRHJvcERhdGE6IGRhdGEgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnTGVhdmU6IGUgPT4ge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5yZWFkRHJhZ0RhdGEoJ2NvbXBvc2l0ZScpIHx8IHRoaXMucmVhZERyYWdEYXRhKCd2aWV3Jyk7XG5cdFx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNhbGxiYWNrcy5vbkRyYWdMZWF2ZT8uKHsgZXZlbnREYXRhOiBlLCBkcmFnQW5kRHJvcERhdGE6IGRhdGEgfSk7XG5cdFx0XHR9LFxuXHRcdFx0b25Ecm9wOiBlID0+IHtcblx0XHRcdFx0aWYgKGNhbGxiYWNrcy5vbkRyb3ApIHtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gdGhpcy5yZWFkRHJhZ0RhdGEoJ2NvbXBvc2l0ZScpIHx8IHRoaXMucmVhZERyYWdEYXRhKCd2aWV3Jyk7XG5cdFx0XHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y2FsbGJhY2tzLm9uRHJvcCh7IGV2ZW50RGF0YTogZSwgZHJhZ0FuZERyb3BEYXRhOiBkYXRhIH0pO1xuXG5cdFx0XHRcdFx0Ly8gRmlyZSBkcmFnIGV2ZW50IGluIGNhc2UgZHJvcCBoYW5kbGVyIGRlc3Ryb3lzIHRoZSBkcmFnZ2VkIGVsZW1lbnRcblx0XHRcdFx0XHR0aGlzLm9uRHJhZ0VuZC5maXJlKHsgZXZlbnREYXRhOiBlLCBkcmFnQW5kRHJvcERhdGE6IGRhdGEgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdPdmVyOiBlID0+IHtcblx0XHRcdFx0aWYgKGNhbGxiYWNrcy5vbkRyYWdPdmVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMucmVhZERyYWdEYXRhKCdjb21wb3NpdGUnKSB8fCB0aGlzLnJlYWREcmFnRGF0YSgndmlldycpO1xuXHRcdFx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhbGxiYWNrcy5vbkRyYWdPdmVyKHsgZXZlbnREYXRhOiBlLCBkcmFnQW5kRHJvcERhdGE6IGRhdGEgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoY2FsbGJhY2tzLm9uRHJhZ1N0YXJ0KSB7XG5cdFx0XHR0aGlzLm9uRHJhZ1N0YXJ0LmV2ZW50KGUgPT4ge1xuXHRcdFx0XHRjYWxsYmFja3Mub25EcmFnU3RhcnQhKGUpO1xuXHRcdFx0fSwgdGhpcywgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHR9XG5cblx0XHRpZiAoY2FsbGJhY2tzLm9uRHJhZ0VuZCkge1xuXHRcdFx0dGhpcy5vbkRyYWdFbmQuZXZlbnQoZSA9PiB7XG5cdFx0XHRcdGNhbGxiYWNrcy5vbkRyYWdFbmQhKGUpO1xuXHRcdFx0fSwgdGhpcywgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZVN0b3JlKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9nZ2xlRHJvcEVmZmVjdChkYXRhVHJhbnNmZXI6IERhdGFUcmFuc2ZlciB8IG51bGwsIGRyb3BFZmZlY3Q6ICdub25lJyB8ICdjb3B5JyB8ICdsaW5rJyB8ICdtb3ZlJywgc2hvdWxkSGF2ZUl0OiBib29sZWFuKSB7XG5cdGlmICghZGF0YVRyYW5zZmVyKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0ZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSBzaG91bGRIYXZlSXQgPyBkcm9wRWZmZWN0IDogJ25vbmUnO1xufVxuXG5leHBvcnQgY2xhc3MgUmVzb3VyY2VMaXN0RG5ESGFuZGxlcjxUPiBpbXBsZW1lbnRzIElMaXN0RHJhZ0FuZERyb3A8VD4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvUmVzb3VyY2U6IChlOiBUKSA9PiBVUkkgfCBudWxsLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0RHJhZ1VSSShlbGVtZW50OiBUKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnRvUmVzb3VyY2UoZWxlbWVudCk7XG5cdFx0cmV0dXJuIHJlc291cmNlID8gcmVzb3VyY2UudG9TdHJpbmcoKSA6IG51bGw7XG5cdH1cblxuXHRnZXREcmFnTGFiZWwoZWxlbWVudHM6IFRbXSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VzID0gY29hbGVzY2UoZWxlbWVudHMubWFwKHRoaXMudG9SZXNvdXJjZSkpO1xuXHRcdHJldHVybiByZXNvdXJjZXMubGVuZ3RoID09PSAxID8gYmFzZW5hbWUocmVzb3VyY2VzWzBdKSA6IHJlc291cmNlcy5sZW5ndGggPiAxID8gU3RyaW5nKHJlc291cmNlcy5sZW5ndGgpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0b25EcmFnU3RhcnQoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gKGRhdGEgYXMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VD4pLmVsZW1lbnRzO1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cykge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnRvUmVzb3VyY2UoZWxlbWVudCk7XG5cdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0cmVzb3VyY2VzLnB1c2gocmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLm9uV2lsbERyYWdFbGVtZW50cyhlbGVtZW50cywgb3JpZ2luYWxFdmVudCk7XG5cdFx0aWYgKHJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdC8vIEFwcGx5IHNvbWUgZGF0YXRyYW5zZmVyIHR5cGVzIHRvIGFsbG93IGZvciBkcmFnZ2luZyB0aGUgZWxlbWVudCBvdXRzaWRlIG9mIHRoZSBhcHBsaWNhdGlvblxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yLCByZXNvdXJjZXMsIG9yaWdpbmFsRXZlbnQpKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25XaWxsRHJhZ0VsZW1lbnRzKGVsZW1lbnRzOiByZWFkb25seSBUW10sIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxuXG5cdG9uRHJhZ092ZXIoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogVCwgdGFyZ2V0SW5kZXg6IG51bWJlciwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbiB8IElUcmVlRHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0ZHJvcChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBULCB0YXJnZXRJbmRleDogbnVtYmVyLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHsgfVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7IH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbmNsYXNzIEdsb2JhbFdpbmRvd0RyYWdnZWRPdmVyVHJhY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENIQU5ORUxfTkFNRSA9ICdtb25hY28td29ya2JlbmNoLWdsb2JhbC1kcmFnZ2VkLW92ZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYnJvYWRjYXN0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnJvYWRjYXN0RGF0YUNoYW5uZWw8Ym9vbGVhbj4oR2xvYmFsV2luZG93RHJhZ2dlZE92ZXJUcmFja2VyLkNIQU5ORUxfTkFNRSkpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShvbkRpZFJlZ2lzdGVyV2luZG93LCAoeyB3aW5kb3csIGRpc3Bvc2FibGVzIH0pID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCBFdmVudFR5cGUuRFJBR19PVkVSLCAoKSA9PiB0aGlzLm1hcmtEcmFnZ2VkT3ZlcihmYWxzZSksIHRydWUpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCBFdmVudFR5cGUuRFJBR19MRUFWRSwgKCkgPT4gdGhpcy5jbGVhckRyYWdnZWRPdmVyKGZhbHNlKSwgdHJ1ZSkpO1xuXHRcdH0sIHsgd2luZG93OiBtYWluV2luZG93LCBkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUgfSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5icm9hZGNhc3Rlci5vbkRpZFJlY2VpdmVEYXRhKGRhdGEgPT4ge1xuXHRcdFx0aWYgKGRhdGEgPT09IHRydWUpIHtcblx0XHRcdFx0dGhpcy5tYXJrRHJhZ2dlZE92ZXIodHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNsZWFyRHJhZ2dlZE92ZXIodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkcmFnZ2VkT3ZlciA9IGZhbHNlO1xuXHRnZXQgaXNEcmFnZ2VkT3ZlcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuZHJhZ2dlZE92ZXI7IH1cblxuXHRwcml2YXRlIG1hcmtEcmFnZ2VkT3Zlcihmcm9tQnJvYWRjYXN0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZHJhZ2dlZE92ZXIgPT09IHRydWUpIHtcblx0XHRcdHJldHVybjsgLy8gYWxyYWR5IG1hcmtlZFxuXHRcdH1cblxuXHRcdHRoaXMuZHJhZ2dlZE92ZXIgPSB0cnVlO1xuXG5cdFx0aWYgKCFmcm9tQnJvYWRjYXN0KSB7XG5cdFx0XHR0aGlzLmJyb2FkY2FzdGVyLnBvc3REYXRhKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXJEcmFnZ2VkT3Zlcihmcm9tQnJvYWRjYXN0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZHJhZ2dlZE92ZXIgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm47IC8vIGFscmFkeSBjbGVhcmVkXG5cdFx0fVxuXG5cdFx0dGhpcy5kcmFnZ2VkT3ZlciA9IGZhbHNlO1xuXG5cdFx0aWYgKCFmcm9tQnJvYWRjYXN0KSB7XG5cdFx0XHR0aGlzLmJyb2FkY2FzdGVyLnBvc3REYXRhKGZhbHNlKTtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgZ2xvYmFsRHJhZ2dlZE92ZXJUcmFja2VyID0gbmV3IEdsb2JhbFdpbmRvd0RyYWdnZWRPdmVyVHJhY2tlcigpO1xuXG4vKipcbiAqIFJldHVybnMgd2hldGhlciB0aGUgd29ya2JlbmNoIGlzIGN1cnJlbnRseSBkcmFnZ2VkIG92ZXIgaW4gYW55IG9mXG4gKiB0aGUgb3BlbmVkIHdpbmRvd3MgKG1haW4gd2luZG93cyBhbmQgYXV4aWxpYXJ5IHdpbmRvd3MpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNXaW5kb3dEcmFnZ2VkT3ZlcigpOiBib29sZWFuIHtcblx0cmV0dXJuIGdsb2JhbERyYWdnZWRPdmVyVHJhY2tlci5pc0RyYWdnZWRPdmVyO1xufVxuIl0sCiAgIm1hcHBp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
