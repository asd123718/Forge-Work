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
import { EditorExtensions, EditorsOrder, GroupModelChangeKind, EditorInputCapabilities } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { dispose, Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { IEditorGroupsService, GroupsOrder } from "../../../services/editor/common/editorGroupsService.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { LinkedMap, Touch, ResourceMap } from "../../../../base/common/map.js";
import { equals } from "../../../../base/common/objects.js";
let EditorsObserver = class extends Disposable {
  constructor(editorGroupsContainer, editorGroupService, storageService) {
    super();
    this.editorGroupService = editorGroupService;
    this.storageService = storageService;
    this.keyMap = /* @__PURE__ */ new Map();
    this.mostRecentEditorsMap = new LinkedMap();
    this.editorsPerResourceCounter = new ResourceMap();
    this._onDidMostRecentlyActiveEditorsChange = this._register(new Emitter());
    this.onDidMostRecentlyActiveEditorsChange = this._onDidMostRecentlyActiveEditorsChange.event;
    this.editorGroupsContainer = editorGroupsContainer ?? editorGroupService;
    this.isScoped = !!editorGroupsContainer;
    this.registerListeners();
    this.loadState();
  }
  get count() {
    return this.mostRecentEditorsMap.size;
  }
  get editors() {
    return [...this.mostRecentEditorsMap.values()];
  }
  hasEditor(editor) {
    const editors = this.editorsPerResourceCounter.get(editor.resource);
    return editors?.has(this.toIdentifier(editor)) ?? false;
  }
  hasEditors(resource) {
    return this.editorsPerResourceCounter.has(resource);
  }
  toIdentifier(arg1, editorId) {
    if (typeof arg1 !== "string") {
      return this.toIdentifier(arg1.typeId, arg1.editorId);
    }
    if (editorId) {
      return `${arg1}/${editorId}`;
    }
    return arg1;
  }
  registerListeners() {
    this._register(this.editorGroupsContainer.onDidAddGroup((group) => this.onGroupAdded(group)));
    this._register(this.editorGroupService.onDidChangeEditorPartOptions((e) => this.onDidChangeEditorPartOptions(e)));
    this._register(this.storageService.onWillSaveState(() => this.saveState()));
  }
  onGroupAdded(group) {
    const groupEditorsMru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
    for (let i = groupEditorsMru.length - 1; i >= 0; i--) {
      this.addMostRecentEditor(
        group,
        groupEditorsMru[i],
        false,
        true
        /* is new */
      );
    }
    if (this.editorGroupsContainer.activeGroup === group && group.activeEditor) {
      this.addMostRecentEditor(
        group,
        group.activeEditor,
        true,
        false
        /* already added before */
      );
    }
    this.registerGroupListeners(group);
  }
  registerGroupListeners(group) {
    const groupDisposables = new DisposableStore();
    groupDisposables.add(group.onDidModelChange((e) => {
      switch (e.kind) {
        // Group gets active: put active editor as most recent
        case GroupModelChangeKind.GROUP_ACTIVE: {
          if (this.editorGroupsContainer.activeGroup === group && group.activeEditor) {
            this.addMostRecentEditor(
              group,
              group.activeEditor,
              true,
              false
              /* editor already opened */
            );
          }
          break;
        }
        // Editor opens: put it as second most recent
        //
        // Also check for maximum allowed number of editors and
        // start to close oldest ones if needed.
        case GroupModelChangeKind.EDITOR_OPEN: {
          if (e.editor) {
            this.addMostRecentEditor(
              group,
              e.editor,
              false,
              true
              /* is new */
            );
            this.ensureOpenedEditorsLimit({ groupId: group.id, editor: e.editor }, group.id);
          }
          break;
        }
      }
    }));
    groupDisposables.add(group.onDidCloseEditor((e) => {
      this.removeMostRecentEditor(group, e.editor);
    }));
    groupDisposables.add(group.onDidActiveEditorChange((e) => {
      if (e.editor) {
        this.addMostRecentEditor(
          group,
          e.editor,
          this.editorGroupsContainer.activeGroup === group,
          false
          /* editor already opened */
        );
      }
    }));
    Event.once(group.onWillDispose)(() => dispose(groupDisposables));
  }
  onDidChangeEditorPartOptions(event) {
    if (!equals(event.newPartOptions.limit, event.oldPartOptions.limit)) {
      const activeGroup = this.editorGroupsContainer.activeGroup;
      let exclude = void 0;
      if (activeGroup.activeEditor) {
        exclude = { editor: activeGroup.activeEditor, groupId: activeGroup.id };
      }
      this.ensureOpenedEditorsLimit(exclude);
    }
  }
  addMostRecentEditor(group, editor, isActive, isNew) {
    const key = this.ensureKey(group, editor);
    const mostRecentEditor = this.mostRecentEditorsMap.first;
    if (isActive || !mostRecentEditor) {
      this.mostRecentEditorsMap.set(key, key, mostRecentEditor ? Touch.AsOld : void 0);
    } else {
      this.mostRecentEditorsMap.set(
        key,
        key,
        Touch.AsOld
        /* make first */
      );
      this.mostRecentEditorsMap.set(
        mostRecentEditor,
        mostRecentEditor,
        Touch.AsOld
        /* make first */
      );
    }
    if (isNew) {
      this.updateEditorResourcesMap(editor, true);
    }
    this._onDidMostRecentlyActiveEditorsChange.fire();
  }
  updateEditorResourcesMap(editor, add) {
    let resource = void 0;
    let typeId = void 0;
    let editorId = void 0;
    if (editor instanceof SideBySideEditorInput) {
      resource = editor.primary.resource;
      typeId = editor.primary.typeId;
      editorId = editor.primary.editorId;
    } else {
      resource = editor.resource;
      typeId = editor.typeId;
      editorId = editor.editorId;
    }
    if (!resource) {
      return;
    }
    const identifier = this.toIdentifier(typeId, editorId);
    if (add) {
      let editorsPerResource = this.editorsPerResourceCounter.get(resource);
      if (!editorsPerResource) {
        editorsPerResource = /* @__PURE__ */ new Map();
        this.editorsPerResourceCounter.set(resource, editorsPerResource);
      }
      editorsPerResource.set(identifier, (editorsPerResource.get(identifier) ?? 0) + 1);
    } else {
      const editorsPerResource = this.editorsPerResourceCounter.get(resource);
      if (editorsPerResource) {
        const counter = editorsPerResource.get(identifier) ?? 0;
        if (counter > 1) {
          editorsPerResource.set(identifier, counter - 1);
        } else {
          editorsPerResource.delete(identifier);
          if (editorsPerResource.size === 0) {
            this.editorsPerResourceCounter.delete(resource);
          }
        }
      }
    }
  }
  removeMostRecentEditor(group, editor) {
    this.updateEditorResourcesMap(editor, false);
    const key = this.findKey(group, editor);
    if (key) {
      this.mostRecentEditorsMap.delete(key);
      const map = this.keyMap.get(group.id);
      if (map?.delete(key.editor) && map.size === 0) {
        this.keyMap.delete(group.id);
      }
      this._onDidMostRecentlyActiveEditorsChange.fire();
    }
  }
  findKey(group, editor) {
    const groupMap = this.keyMap.get(group.id);
    if (!groupMap) {
      return void 0;
    }
    return groupMap.get(editor);
  }
  ensureKey(group, editor) {
    let groupMap = this.keyMap.get(group.id);
    if (!groupMap) {
      groupMap = /* @__PURE__ */ new Map();
      this.keyMap.set(group.id, groupMap);
    }
    let key = groupMap.get(editor);
    if (!key) {
      key = { groupId: group.id, editor };
      groupMap.set(editor, key);
    }
    return key;
  }
  async ensureOpenedEditorsLimit(exclude, groupId) {
    if (!this.editorGroupService.partOptions.limit?.enabled || typeof this.editorGroupService.partOptions.limit.value !== "number" || this.editorGroupService.partOptions.limit.value <= 0) {
      return;
    }
    const limit = this.editorGroupService.partOptions.limit.value;
    if (this.editorGroupService.partOptions.limit?.perEditorGroup) {
      if (typeof groupId === "number") {
        const group = this.editorGroupsContainer.getGroup(groupId);
        if (group) {
          await this.doEnsureOpenedEditorsLimit(limit, group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE).map((editor) => ({ editor, groupId })), exclude);
        }
      } else {
        for (const group of this.editorGroupsContainer.groups) {
          await this.ensureOpenedEditorsLimit(exclude, group.id);
        }
      }
    } else {
      await this.doEnsureOpenedEditorsLimit(limit, [...this.mostRecentEditorsMap.values()], exclude);
    }
  }
  async doEnsureOpenedEditorsLimit(limit, mostRecentEditors, exclude) {
    const mostRecentEditorsCountingForLimit = mostRecentEditors.filter(({ editor }) => {
      if (editor.hasCapability(EditorInputCapabilities.ExcludeFromEditorLimit)) {
        return false;
      }
      if (this.editorGroupService.partOptions.limit?.excludeDirty && (editor.isDirty() && !editor.isSaving() || editor.hasCapability(EditorInputCapabilities.Scratchpad))) {
        return false;
      }
      return true;
    });
    if (limit >= mostRecentEditorsCountingForLimit.length) {
      return;
    }
    const leastRecentlyClosableEditors = mostRecentEditorsCountingForLimit.reverse().filter(({ editor, groupId }) => {
      if (editor.isDirty() && !editor.isSaving() || editor.hasCapability(EditorInputCapabilities.Scratchpad)) {
        return false;
      }
      if (exclude && editor === exclude.editor && groupId === exclude.groupId) {
        return false;
      }
      if (this.editorGroupsContainer.getGroup(groupId)?.isSticky(editor)) {
        return false;
      }
      return true;
    });
    let editorsToCloseCount = mostRecentEditorsCountingForLimit.length - limit;
    const mapGroupToEditorsToClose = /* @__PURE__ */ new Map();
    for (const { groupId, editor } of leastRecentlyClosableEditors) {
      let editorsInGroupToClose = mapGroupToEditorsToClose.get(groupId);
      if (!editorsInGroupToClose) {
        editorsInGroupToClose = [];
        mapGroupToEditorsToClose.set(groupId, editorsInGroupToClose);
      }
      editorsInGroupToClose.push(editor);
      editorsToCloseCount--;
      if (editorsToCloseCount === 0) {
        break;
      }
    }
    for (const [groupId, editors] of mapGroupToEditorsToClose) {
      const group = this.editorGroupsContainer.getGroup(groupId);
      if (group) {
        await group.closeEditors(editors, { preserveFocus: true });
      }
    }
  }
  saveState() {
    if (this.isScoped) {
      return;
    }
    if (this.mostRecentEditorsMap.isEmpty()) {
      this.storageService.remove(EditorsObserver.STORAGE_KEY, StorageScope.WORKSPACE);
    } else {
      this.storageService.store(EditorsObserver.STORAGE_KEY, JSON.stringify(this.serialize()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  serialize() {
    const registry = Registry.as(EditorExtensions.EditorFactory);
    const entries = [...this.mostRecentEditorsMap.values()];
    const mapGroupToSerializableEditorsOfGroup = /* @__PURE__ */ new Map();
    return {
      entries: coalesce(entries.map(({ editor, groupId }) => {
        const group = this.editorGroupsContainer.getGroup(groupId);
        if (!group) {
          return void 0;
        }
        let serializableEditorsOfGroup = mapGroupToSerializableEditorsOfGroup.get(group);
        if (!serializableEditorsOfGroup) {
          serializableEditorsOfGroup = group.getEditors(EditorsOrder.SEQUENTIAL).filter((editor2) => {
            const editorSerializer = registry.getEditorSerializer(editor2);
            return editorSerializer?.canSerialize(editor2);
          });
          mapGroupToSerializableEditorsOfGroup.set(group, serializableEditorsOfGroup);
        }
        const index = serializableEditorsOfGroup.indexOf(editor);
        if (index === -1) {
          return void 0;
        }
        return { groupId, index };
      }))
    };
  }
  async loadState() {
    if (this.editorGroupsContainer === this.editorGroupService.mainPart || this.editorGroupsContainer === this.editorGroupService) {
      await this.editorGroupService.whenReady;
    }
    let hasRestorableState = false;
    if (!this.isScoped) {
      const serialized = this.storageService.get(EditorsObserver.STORAGE_KEY, StorageScope.WORKSPACE);
      if (serialized) {
        hasRestorableState = true;
        this.deserialize(JSON.parse(serialized));
      }
    }
    if (!hasRestorableState) {
      const groups = this.editorGroupsContainer.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
      for (let i = groups.length - 1; i >= 0; i--) {
        const group = groups[i];
        const groupEditorsMru = group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
        for (let i2 = groupEditorsMru.length - 1; i2 >= 0; i2--) {
          this.addMostRecentEditor(
            group,
            groupEditorsMru[i2],
            true,
            true
            /* is new */
          );
        }
      }
    }
    for (const group of this.editorGroupsContainer.groups) {
      this.registerGroupListeners(group);
    }
  }
  deserialize(serialized) {
    const mapValues = [];
    for (const { groupId, index } of serialized.entries) {
      const group = this.editorGroupsContainer.getGroup(groupId);
      if (!group) {
        continue;
      }
      const editor = group.getEditorByIndex(index);
      if (!editor) {
        continue;
      }
      const editorIdentifier = this.ensureKey(group, editor);
      mapValues.push([editorIdentifier, editorIdentifier]);
      this.updateEditorResourcesMap(editor, true);
    }
    this.mostRecentEditorsMap.fromJSON(mapValues);
  }
};
EditorsObserver.STORAGE_KEY = "editors.mru";
EditorsObserver = __decorateClass([
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IStorageService)
], EditorsObserver);
export {
  EditorsObserver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvcnNPYnNlcnZlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIElFZGl0b3JJZGVudGlmaWVyLCBHcm91cElkZW50aWZpZXIsIEVkaXRvckV4dGVuc2lvbnMsIElFZGl0b3JQYXJ0T3B0aW9uc0NoYW5nZUV2ZW50LCBFZGl0b3JzT3JkZXIsIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLCBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IGRpc3Bvc2UsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSwgSUVkaXRvckdyb3VwLCBHcm91cHNPcmRlciwgSUVkaXRvckdyb3Vwc0NvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBMaW5rZWRNYXAsIFRvdWNoLCBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUVkaXRvcklucHV0SWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZEVkaXRvcnNMaXN0IHtcblx0ZW50cmllczogSVNlcmlhbGl6ZWRFZGl0b3JJZGVudGlmaWVyW107XG59XG5cbmludGVyZmFjZSBJU2VyaWFsaXplZEVkaXRvcklkZW50aWZpZXIge1xuXHRncm91cElkOiBHcm91cElkZW50aWZpZXI7XG5cdGluZGV4OiBudW1iZXI7XG59XG5cbi8qKlxuICogQSBvYnNlcnZlciBvZiBvcGVuZWQgZWRpdG9ycyBhY3Jvc3MgYWxsIGVkaXRvciBncm91cHMgYnkgbW9zdCByZWNlbnRseSB1c2VkLlxuICogUnVsZXM6XG4gKiAtIHRoZSBsYXN0IGVkaXRvciBpbiB0aGUgbGlzdCBpcyB0aGUgb25lIG1vc3QgcmVjZW50bHkgYWN0aXZhdGVkXG4gKiAtIHRoZSBmaXJzdCBlZGl0b3IgaW4gdGhlIGxpc3QgaXMgdGhlIG9uZSB0aGF0IHdhcyBhY3RpdmF0ZWQgdGhlIGxvbmdlc3QgdGltZSBhZ29cbiAqIC0gYW4gZWRpdG9yIHRoYXQgb3BlbnMgaW5hY3RpdmUgd2lsbCBiZSBwbGFjZWQgYmVoaW5kIHRoZSBjdXJyZW50bHkgYWN0aXZlIGVkaXRvclxuICpcbiAqIFRoZSBvYnNlcnZlciBtYXkgc3RhcnQgdG8gY2xvc2UgZWRpdG9ycyBiYXNlZCBvbiB0aGUgd29ya2JlbmNoLmVkaXRvci5saW1pdCBzZXR0aW5nLlxuICovXG5leHBvcnQgY2xhc3MgRWRpdG9yc09ic2VydmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU1RPUkFHRV9LRVkgPSAnZWRpdG9ycy5tcnUnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkga2V5TWFwID0gbmV3IE1hcDxHcm91cElkZW50aWZpZXIsIE1hcDxFZGl0b3JJbnB1dCwgSUVkaXRvcklkZW50aWZpZXI+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vc3RSZWNlbnRFZGl0b3JzTWFwID0gbmV3IExpbmtlZE1hcDxJRWRpdG9ySWRlbnRpZmllciwgSUVkaXRvcklkZW50aWZpZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yc1BlclJlc291cmNlQ291bnRlciA9IG5ldyBSZXNvdXJjZU1hcDxNYXA8c3RyaW5nIC8qIHR5cGVJZC9lZGl0b3JJZCAqLywgbnVtYmVyIC8qIGNvdW50ZXIgKi8+PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTW9zdFJlY2VudGx5QWN0aXZlRWRpdG9yc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZE1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnNDaGFuZ2UgPSB0aGlzLl9vbkRpZE1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnNDaGFuZ2UuZXZlbnQ7XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAuc2l6ZTtcblx0fVxuXG5cdGdldCBlZGl0b3JzKCk6IElFZGl0b3JJZGVudGlmaWVyW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5tb3N0UmVjZW50RWRpdG9yc01hcC52YWx1ZXMoKV07XG5cdH1cblxuXHRoYXNFZGl0b3IoZWRpdG9yOiBJUmVzb3VyY2VFZGl0b3JJbnB1dElkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBlZGl0b3JzID0gdGhpcy5lZGl0b3JzUGVyUmVzb3VyY2VDb3VudGVyLmdldChlZGl0b3IucmVzb3VyY2UpO1xuXG5cdFx0cmV0dXJuIGVkaXRvcnM/Lmhhcyh0aGlzLnRvSWRlbnRpZmllcihlZGl0b3IpKSA/PyBmYWxzZTtcblx0fVxuXG5cdGhhc0VkaXRvcnMocmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvcnNQZXJSZXNvdXJjZUNvdW50ZXIuaGFzKHJlc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgdG9JZGVudGlmaWVyKHR5cGVJZDogc3RyaW5nLCBlZGl0b3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nO1xuXHRwcml2YXRlIHRvSWRlbnRpZmllcihlZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0SWRlbnRpZmllcik6IHN0cmluZztcblx0cHJpdmF0ZSB0b0lkZW50aWZpZXIoYXJnMTogc3RyaW5nIHwgSVJlc291cmNlRWRpdG9ySW5wdXRJZGVudGlmaWVyLCBlZGl0b3JJZD86IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKHR5cGVvZiBhcmcxICE9PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMudG9JZGVudGlmaWVyKGFyZzEudHlwZUlkLCBhcmcxLmVkaXRvcklkKTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9ySWQpIHtcblx0XHRcdHJldHVybiBgJHthcmcxfS8ke2VkaXRvcklkfWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyZzE7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc0NvbnRhaW5lcjogSUVkaXRvckdyb3Vwc0NvbnRhaW5lcjtcblx0cHJpdmF0ZSByZWFkb25seSBpc1Njb3BlZDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3JHcm91cHNDb250YWluZXI6IElFZGl0b3JHcm91cHNDb250YWluZXIgfCB1bmRlZmluZWQsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIgPSBlZGl0b3JHcm91cHNDb250YWluZXIgPz8gZWRpdG9yR3JvdXBTZXJ2aWNlO1xuXHRcdHRoaXMuaXNTY29wZWQgPSAhIWVkaXRvckdyb3Vwc0NvbnRhaW5lcjtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLmxvYWRTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5vbkRpZEFkZEdyb3VwKGdyb3VwID0+IHRoaXMub25Hcm91cEFkZGVkKGdyb3VwKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB0aGlzLnNhdmVTdGF0ZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uR3JvdXBBZGRlZChncm91cDogSUVkaXRvckdyb3VwKTogdm9pZCB7XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gYWRkIGFueSBhbHJlYWR5IGV4aXN0aW5nIGVkaXRvclxuXHRcdC8vIG9mIHRoZSBuZXcgZ3JvdXAgaW50byBvdXIgbGlzdCBpbiBMUlUgb3JkZXJcblx0XHRjb25zdCBncm91cEVkaXRvcnNNcnUgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0Zm9yIChsZXQgaSA9IGdyb3VwRWRpdG9yc01ydS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0dGhpcy5hZGRNb3N0UmVjZW50RWRpdG9yKGdyb3VwLCBncm91cEVkaXRvcnNNcnVbaV0sIGZhbHNlIC8qIGlzIG5vdCBhY3RpdmUgKi8sIHRydWUgLyogaXMgbmV3ICovKTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdGhhdCBhY3RpdmUgZWRpdG9yIGlzIHB1dCBhcyBmaXJzdCBpZiBncm91cCBpcyBhY3RpdmVcblx0XHRpZiAodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuYWN0aXZlR3JvdXAgPT09IGdyb3VwICYmIGdyb3VwLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0dGhpcy5hZGRNb3N0UmVjZW50RWRpdG9yKGdyb3VwLCBncm91cC5hY3RpdmVFZGl0b3IsIHRydWUgLyogaXMgYWN0aXZlICovLCBmYWxzZSAvKiBhbHJlYWR5IGFkZGVkIGJlZm9yZSAqLyk7XG5cdFx0fVxuXG5cdFx0Ly8gR3JvdXAgTGlzdGVuZXJzXG5cdFx0dGhpcy5yZWdpc3Rlckdyb3VwTGlzdGVuZXJzKGdyb3VwKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJHcm91cExpc3RlbmVycyhncm91cDogSUVkaXRvckdyb3VwKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXBEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRncm91cERpc3Bvc2FibGVzLmFkZChncm91cC5vbkRpZE1vZGVsQ2hhbmdlKGUgPT4ge1xuXHRcdFx0c3dpdGNoIChlLmtpbmQpIHtcblxuXHRcdFx0XHQvLyBHcm91cCBnZXRzIGFjdGl2ZTogcHV0IGFjdGl2ZSBlZGl0b3IgYXMgbW9zdCByZWNlbnRcblx0XHRcdFx0Y2FzZSBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9BQ1RJVkU6IHtcblx0XHRcdFx0XHRpZiAodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuYWN0aXZlR3JvdXAgPT09IGdyb3VwICYmIGdyb3VwLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5hZGRNb3N0UmVjZW50RWRpdG9yKGdyb3VwLCBncm91cC5hY3RpdmVFZGl0b3IsIHRydWUgLyogaXMgYWN0aXZlICovLCBmYWxzZSAvKiBlZGl0b3IgYWxyZWFkeSBvcGVuZWQgKi8pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRWRpdG9yIG9wZW5zOiBwdXQgaXQgYXMgc2Vjb25kIG1vc3QgcmVjZW50XG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIEFsc28gY2hlY2sgZm9yIG1heGltdW0gYWxsb3dlZCBudW1iZXIgb2YgZWRpdG9ycyBhbmRcblx0XHRcdFx0Ly8gc3RhcnQgdG8gY2xvc2Ugb2xkZXN0IG9uZXMgaWYgbmVlZGVkLlxuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9PUEVOOiB7XG5cdFx0XHRcdFx0aWYgKGUuZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZE1vc3RSZWNlbnRFZGl0b3IoZ3JvdXAsIGUuZWRpdG9yLCBmYWxzZSAvKiBpcyBub3QgYWN0aXZlICovLCB0cnVlIC8qIGlzIG5ldyAqLyk7XG5cdFx0XHRcdFx0XHR0aGlzLmVuc3VyZU9wZW5lZEVkaXRvcnNMaW1pdCh7IGdyb3VwSWQ6IGdyb3VwLmlkLCBlZGl0b3I6IGUuZWRpdG9yIH0sIGdyb3VwLmlkKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEVkaXRvciBjbG9zZXM6IHJlbW92ZSBmcm9tIHJlY2VudGx5IG9wZW5lZFxuXHRcdGdyb3VwRGlzcG9zYWJsZXMuYWRkKGdyb3VwLm9uRGlkQ2xvc2VFZGl0b3IoZSA9PiB7XG5cdFx0XHR0aGlzLnJlbW92ZU1vc3RSZWNlbnRFZGl0b3IoZ3JvdXAsIGUuZWRpdG9yKTtcblx0XHR9KSk7XG5cblx0XHQvLyBFZGl0b3IgZ2V0cyBhY3RpdmU6IHB1dCBhY3RpdmUgZWRpdG9yIGFzIG1vc3QgcmVjZW50XG5cdFx0Ly8gaWYgZ3JvdXAgaXMgYWN0aXZlLCBvdGhlcndpc2Ugc2Vjb25kIG1vc3QgcmVjZW50XG5cdFx0Z3JvdXBEaXNwb3NhYmxlcy5hZGQoZ3JvdXAub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5lZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5hZGRNb3N0UmVjZW50RWRpdG9yKGdyb3VwLCBlLmVkaXRvciwgdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuYWN0aXZlR3JvdXAgPT09IGdyb3VwLCBmYWxzZSAvKiBlZGl0b3IgYWxyZWFkeSBvcGVuZWQgKi8pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSB0byBjbGVhbnVwIG9uIGRpc3Bvc2Vcblx0XHRFdmVudC5vbmNlKGdyb3VwLm9uV2lsbERpc3Bvc2UpKCgpID0+IGRpc3Bvc2UoZ3JvdXBEaXNwb3NhYmxlcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKGV2ZW50OiBJRWRpdG9yUGFydE9wdGlvbnNDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghZXF1YWxzKGV2ZW50Lm5ld1BhcnRPcHRpb25zLmxpbWl0LCBldmVudC5vbGRQYXJ0T3B0aW9ucy5saW1pdCkpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuYWN0aXZlR3JvdXA7XG5cdFx0XHRsZXQgZXhjbHVkZTogSUVkaXRvcklkZW50aWZpZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdGV4Y2x1ZGUgPSB7IGVkaXRvcjogYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yLCBncm91cElkOiBhY3RpdmVHcm91cC5pZCB9O1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVuc3VyZU9wZW5lZEVkaXRvcnNMaW1pdChleGNsdWRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFkZE1vc3RSZWNlbnRFZGl0b3IoZ3JvdXA6IElFZGl0b3JHcm91cCwgZWRpdG9yOiBFZGl0b3JJbnB1dCwgaXNBY3RpdmU6IGJvb2xlYW4sIGlzTmV3OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5lbnN1cmVLZXkoZ3JvdXAsIGVkaXRvcik7XG5cdFx0Y29uc3QgbW9zdFJlY2VudEVkaXRvciA9IHRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAuZmlyc3Q7XG5cblx0XHQvLyBBY3RpdmUgb3IgZmlyc3QgZW50cnk6IGFkZCB0byBlbmQgb2YgbWFwXG5cdFx0aWYgKGlzQWN0aXZlIHx8ICFtb3N0UmVjZW50RWRpdG9yKSB7XG5cdFx0XHR0aGlzLm1vc3RSZWNlbnRFZGl0b3JzTWFwLnNldChrZXksIGtleSwgbW9zdFJlY2VudEVkaXRvciA/IFRvdWNoLkFzT2xkIC8qIG1ha2UgZmlyc3QgKi8gOiB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZTogaW5zZXJ0IGJlZm9yZSBtb3N0IHJlY2VudFxuXHRcdGVsc2Uge1xuXHRcdFx0Ly8gd2UgaGF2ZSBtb3N0IHJlY2VudCBlZGl0b3JzLiBhcyBzdWNoIHdlXG5cdFx0XHQvLyBwdXQgdGhpcyBuZXdseSBvcGVuZWQgZWRpdG9yIHJpZ2h0IGJlZm9yZVxuXHRcdFx0Ly8gdGhlIGN1cnJlbnQgbW9zdCByZWNlbnQgb25lIGJlY2F1c2UgaXQgY2Fubm90XG5cdFx0XHQvLyBiZSB0aGUgbW9zdCByZWNlbnRseSBhY3RpdmUgb25lIHVubGVzc1xuXHRcdFx0Ly8gaXQgYmVjb21lcyBhY3RpdmUuIGJ1dCBpdCBpcyBzdGlsbCBtb3JlXG5cdFx0XHQvLyBhY3RpdmUgdGhlbiBhbnkgb3RoZXIgZWRpdG9yIGluIHRoZSBsaXN0LlxuXHRcdFx0dGhpcy5tb3N0UmVjZW50RWRpdG9yc01hcC5zZXQoa2V5LCBrZXksIFRvdWNoLkFzT2xkIC8qIG1ha2UgZmlyc3QgKi8pO1xuXHRcdFx0dGhpcy5tb3N0UmVjZW50RWRpdG9yc01hcC5zZXQobW9zdFJlY2VudEVkaXRvciwgbW9zdFJlY2VudEVkaXRvciwgVG91Y2guQXNPbGQgLyogbWFrZSBmaXJzdCAqLyk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGluIHJlc291cmNlIG1hcCBpZiB0aGlzIGlzIGEgbmV3IGVkaXRvclxuXHRcdGlmIChpc05ldykge1xuXHRcdFx0dGhpcy51cGRhdGVFZGl0b3JSZXNvdXJjZXNNYXAoZWRpdG9yLCB0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uRGlkTW9zdFJlY2VudGx5QWN0aXZlRWRpdG9yc0NoYW5nZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUVkaXRvclJlc291cmNlc01hcChlZGl0b3I6IEVkaXRvcklucHV0LCBhZGQ6IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIERpc3RpbGwgdGhlIGVkaXRvciByZXNvdXJjZSBhbmQgdHlwZSBpZCB3aXRoIHN1cHBvcnRcblx0XHQvLyBmb3Igc2lkZSBieSBzaWRlIGVkaXRvcidzIHByaW1hcnkgc2lkZSB0b28uXG5cdFx0bGV0IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IHR5cGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBlZGl0b3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChlZGl0b3IgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpIHtcblx0XHRcdHJlc291cmNlID0gZWRpdG9yLnByaW1hcnkucmVzb3VyY2U7XG5cdFx0XHR0eXBlSWQgPSBlZGl0b3IucHJpbWFyeS50eXBlSWQ7XG5cdFx0XHRlZGl0b3JJZCA9IGVkaXRvci5wcmltYXJ5LmVkaXRvcklkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvdXJjZSA9IGVkaXRvci5yZXNvdXJjZTtcblx0XHRcdHR5cGVJZCA9IGVkaXRvci50eXBlSWQ7XG5cdFx0XHRlZGl0b3JJZCA9IGVkaXRvci5lZGl0b3JJZDtcblx0XHR9XG5cblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47IC8vIHJlcXVpcmUgYSByZXNvdXJjZVxuXHRcdH1cblxuXHRcdGNvbnN0IGlkZW50aWZpZXIgPSB0aGlzLnRvSWRlbnRpZmllcih0eXBlSWQsIGVkaXRvcklkKTtcblxuXHRcdC8vIEFkZCBlbnRyeVxuXHRcdGlmIChhZGQpIHtcblx0XHRcdGxldCBlZGl0b3JzUGVyUmVzb3VyY2UgPSB0aGlzLmVkaXRvcnNQZXJSZXNvdXJjZUNvdW50ZXIuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmICghZWRpdG9yc1BlclJlc291cmNlKSB7XG5cdFx0XHRcdGVkaXRvcnNQZXJSZXNvdXJjZSA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0XHRcdHRoaXMuZWRpdG9yc1BlclJlc291cmNlQ291bnRlci5zZXQocmVzb3VyY2UsIGVkaXRvcnNQZXJSZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvcnNQZXJSZXNvdXJjZS5zZXQoaWRlbnRpZmllciwgKGVkaXRvcnNQZXJSZXNvdXJjZS5nZXQoaWRlbnRpZmllcikgPz8gMCkgKyAxKTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgZW50cnlcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IGVkaXRvcnNQZXJSZXNvdXJjZSA9IHRoaXMuZWRpdG9yc1BlclJlc291cmNlQ291bnRlci5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKGVkaXRvcnNQZXJSZXNvdXJjZSkge1xuXHRcdFx0XHRjb25zdCBjb3VudGVyID0gZWRpdG9yc1BlclJlc291cmNlLmdldChpZGVudGlmaWVyKSA/PyAwO1xuXHRcdFx0XHRpZiAoY291bnRlciA+IDEpIHtcblx0XHRcdFx0XHRlZGl0b3JzUGVyUmVzb3VyY2Uuc2V0KGlkZW50aWZpZXIsIGNvdW50ZXIgLSAxKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlZGl0b3JzUGVyUmVzb3VyY2UuZGVsZXRlKGlkZW50aWZpZXIpO1xuXG5cdFx0XHRcdFx0aWYgKGVkaXRvcnNQZXJSZXNvdXJjZS5zaXplID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmVkaXRvcnNQZXJSZXNvdXJjZUNvdW50ZXIuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZU1vc3RSZWNlbnRFZGl0b3IoZ3JvdXA6IElFZGl0b3JHcm91cCwgZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIGluIHJlc291cmNlIG1hcFxuXHRcdHRoaXMudXBkYXRlRWRpdG9yUmVzb3VyY2VzTWFwKGVkaXRvciwgZmFsc2UpO1xuXG5cdFx0Ly8gVXBkYXRlIGluIE1SVSBsaXN0XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5maW5kS2V5KGdyb3VwLCBlZGl0b3IpO1xuXHRcdGlmIChrZXkpIHtcblxuXHRcdFx0Ly8gUmVtb3ZlIGZyb20gbW9zdCByZWNlbnQgZWRpdG9yc1xuXHRcdFx0dGhpcy5tb3N0UmVjZW50RWRpdG9yc01hcC5kZWxldGUoa2V5KTtcblxuXHRcdFx0Ly8gUmVtb3ZlIGZyb20ga2V5IG1hcFxuXHRcdFx0Y29uc3QgbWFwID0gdGhpcy5rZXlNYXAuZ2V0KGdyb3VwLmlkKTtcblx0XHRcdGlmIChtYXA/LmRlbGV0ZShrZXkuZWRpdG9yKSAmJiBtYXAuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmtleU1hcC5kZWxldGUoZ3JvdXAuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFdmVudFxuXHRcdFx0dGhpcy5fb25EaWRNb3N0UmVjZW50bHlBY3RpdmVFZGl0b3JzQ2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpbmRLZXkoZ3JvdXA6IElFZGl0b3JHcm91cCwgZWRpdG9yOiBFZGl0b3JJbnB1dCk6IElFZGl0b3JJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBncm91cE1hcCA9IHRoaXMua2V5TWFwLmdldChncm91cC5pZCk7XG5cdFx0aWYgKCFncm91cE1hcCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ3JvdXBNYXAuZ2V0KGVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZUtleShncm91cDogSUVkaXRvckdyb3VwLCBlZGl0b3I6IEVkaXRvcklucHV0KTogSUVkaXRvcklkZW50aWZpZXIge1xuXHRcdGxldCBncm91cE1hcCA9IHRoaXMua2V5TWFwLmdldChncm91cC5pZCk7XG5cdFx0aWYgKCFncm91cE1hcCkge1xuXHRcdFx0Z3JvdXBNYXAgPSBuZXcgTWFwKCk7XG5cblx0XHRcdHRoaXMua2V5TWFwLnNldChncm91cC5pZCwgZ3JvdXBNYXApO1xuXHRcdH1cblxuXHRcdGxldCBrZXkgPSBncm91cE1hcC5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWtleSkge1xuXHRcdFx0a2V5ID0geyBncm91cElkOiBncm91cC5pZCwgZWRpdG9yIH07XG5cdFx0XHRncm91cE1hcC5zZXQoZWRpdG9yLCBrZXkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBrZXk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGVuc3VyZU9wZW5lZEVkaXRvcnNMaW1pdChleGNsdWRlOiBJRWRpdG9ySWRlbnRpZmllciB8IHVuZGVmaW5lZCwgZ3JvdXBJZD86IEdyb3VwSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChcblx0XHRcdCF0aGlzLmVkaXRvckdyb3VwU2VydmljZS5wYXJ0T3B0aW9ucy5saW1pdD8uZW5hYmxlZCB8fFxuXHRcdFx0dHlwZW9mIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLnBhcnRPcHRpb25zLmxpbWl0LnZhbHVlICE9PSAnbnVtYmVyJyB8fFxuXHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydE9wdGlvbnMubGltaXQudmFsdWUgPD0gMFxuXHRcdCkge1xuXHRcdFx0cmV0dXJuOyAvLyByZXR1cm4gZWFybHkgaWYgbm90IGVuYWJsZWQgb3IgaW52YWxpZFxuXHRcdH1cblxuXHRcdGNvbnN0IGxpbWl0ID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydE9wdGlvbnMubGltaXQudmFsdWU7XG5cblx0XHQvLyBJbiBlZGl0b3IgZ3JvdXBcblx0XHRpZiAodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydE9wdGlvbnMubGltaXQ/LnBlckVkaXRvckdyb3VwKSB7XG5cblx0XHRcdC8vIEZvciBzcGVjaWZpYyBlZGl0b3IgZ3JvdXBzXG5cdFx0XHRpZiAodHlwZW9mIGdyb3VwSWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0XHRcdGlmIChncm91cCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZG9FbnN1cmVPcGVuZWRFZGl0b3JzTGltaXQobGltaXQsIGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5tYXAoZWRpdG9yID0+ICh7IGVkaXRvciwgZ3JvdXBJZCB9KSksIGV4Y2x1ZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvciBhbGwgZWRpdG9yIGdyb3Vwc1xuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ3JvdXBzKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5lbnN1cmVPcGVuZWRFZGl0b3JzTGltaXQoZXhjbHVkZSwgZ3JvdXAuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWNyb3NzIGFsbCBlZGl0b3IgZ3JvdXBzXG5cdFx0ZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRvRW5zdXJlT3BlbmVkRWRpdG9yc0xpbWl0KGxpbWl0LCBbLi4udGhpcy5tb3N0UmVjZW50RWRpdG9yc01hcC52YWx1ZXMoKV0sIGV4Y2x1ZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9FbnN1cmVPcGVuZWRFZGl0b3JzTGltaXQobGltaXQ6IG51bWJlciwgbW9zdFJlY2VudEVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10sIGV4Y2x1ZGU/OiBJRWRpdG9ySWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gRWRpdG9ycyB0aGF0IG9wdCBvdXQgb2YgdGhlIGxpbWl0IChlLmcuIHRoZSBBZ2VudHMgd2luZG93J3MgbWFuYWdlZFxuXHRcdC8vIGRvY2tlZCB0YWJzKSBuZXZlciBjb3VudCB0b3dhcmRzIGl0IGFuZCBhcmUgbmV2ZXIgYXV0by1jbG9zZWQuXG5cdFx0Y29uc3QgbW9zdFJlY2VudEVkaXRvcnNDb3VudGluZ0ZvckxpbWl0ID0gbW9zdFJlY2VudEVkaXRvcnMuZmlsdGVyKCh7IGVkaXRvciB9KSA9PiB7XG5cdFx0XHRpZiAoZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuRXhjbHVkZUZyb21FZGl0b3JMaW1pdCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBmb3IgYGV4Y2x1ZGVEaXJ0eWAgc2V0dGluZyBhbmQgYXBwbHkgaXQgYnkgZXhjbHVkaW5nXG5cdFx0XHQvLyBhbnkgcmVjZW50IGVkaXRvciB0aGF0IGlzIGRpcnR5IGZyb20gdGhlIG9wZW5lZCBlZGl0b3JzIGxpbWl0XG5cdFx0XHRpZiAodGhpcy5lZGl0b3JHcm91cFNlcnZpY2UucGFydE9wdGlvbnMubGltaXQ/LmV4Y2x1ZGVEaXJ0eSAmJiAoKGVkaXRvci5pc0RpcnR5KCkgJiYgIWVkaXRvci5pc1NhdmluZygpKSB8fCBlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TY3JhdGNocGFkKSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBub3QgZGlydHkgZWRpdG9ycyAodW5sZXNzIGluIHRoZSBwcm9jZXNzIG9mIHNhdmluZykgb3Igc2NyYXRjaHBhZHNcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRpZiAobGltaXQgPj0gbW9zdFJlY2VudEVkaXRvcnNDb3VudGluZ0ZvckxpbWl0Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuOyAvLyBvbmx5IGlmIG9wZW5lZCBlZGl0b3JzIGV4Y2VlZCBzZXR0aW5nIGFuZCBpcyB2YWxpZCBhbmQgZW5hYmxlZFxuXHRcdH1cblxuXHRcdC8vIEV4dHJhY3QgbGVhc3QgcmVjZW50bHkgdXNlZCBlZGl0b3JzIHRoYXQgY2FuIGJlIGNsb3NlZFxuXHRcdGNvbnN0IGxlYXN0UmVjZW50bHlDbG9zYWJsZUVkaXRvcnMgPSBtb3N0UmVjZW50RWRpdG9yc0NvdW50aW5nRm9yTGltaXQucmV2ZXJzZSgpLmZpbHRlcigoeyBlZGl0b3IsIGdyb3VwSWQgfSkgPT4ge1xuXHRcdFx0aWYgKChlZGl0b3IuaXNEaXJ0eSgpICYmICFlZGl0b3IuaXNTYXZpbmcoKSkgfHwgZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuU2NyYXRjaHBhZCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBub3QgZGlydHkgZWRpdG9ycyAodW5sZXNzIGluIHRoZSBwcm9jZXNzIG9mIHNhdmluZykgb3Igc2NyYXRjaHBhZHNcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV4Y2x1ZGUgJiYgZWRpdG9yID09PSBleGNsdWRlLmVkaXRvciAmJiBncm91cElkID09PSBleGNsdWRlLmdyb3VwSWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBuZXZlciB0aGUgZWRpdG9yIHRoYXQgc2hvdWxkIGJlIGV4Y2x1ZGVkXG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cChncm91cElkKT8uaXNTdGlja3koZWRpdG9yKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG5ldmVyIHN0aWNreSBlZGl0b3JzXG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ2xvc2UgZWRpdG9ycyB1bnRpbCB3ZSByZWFjaGVkIHRoZSBsaW1pdCBhZ2FpblxuXHRcdGxldCBlZGl0b3JzVG9DbG9zZUNvdW50ID0gbW9zdFJlY2VudEVkaXRvcnNDb3VudGluZ0ZvckxpbWl0Lmxlbmd0aCAtIGxpbWl0O1xuXHRcdGNvbnN0IG1hcEdyb3VwVG9FZGl0b3JzVG9DbG9zZSA9IG5ldyBNYXA8R3JvdXBJZGVudGlmaWVyLCBFZGl0b3JJbnB1dFtdPigpO1xuXHRcdGZvciAoY29uc3QgeyBncm91cElkLCBlZGl0b3IgfSBvZiBsZWFzdFJlY2VudGx5Q2xvc2FibGVFZGl0b3JzKSB7XG5cdFx0XHRsZXQgZWRpdG9yc0luR3JvdXBUb0Nsb3NlID0gbWFwR3JvdXBUb0VkaXRvcnNUb0Nsb3NlLmdldChncm91cElkKTtcblx0XHRcdGlmICghZWRpdG9yc0luR3JvdXBUb0Nsb3NlKSB7XG5cdFx0XHRcdGVkaXRvcnNJbkdyb3VwVG9DbG9zZSA9IFtdO1xuXHRcdFx0XHRtYXBHcm91cFRvRWRpdG9yc1RvQ2xvc2Uuc2V0KGdyb3VwSWQsIGVkaXRvcnNJbkdyb3VwVG9DbG9zZSk7XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvcnNJbkdyb3VwVG9DbG9zZS5wdXNoKGVkaXRvcik7XG5cdFx0XHRlZGl0b3JzVG9DbG9zZUNvdW50LS07XG5cblx0XHRcdGlmIChlZGl0b3JzVG9DbG9zZUNvdW50ID09PSAwKSB7XG5cdFx0XHRcdGJyZWFrOyAvLyBsaW1pdCByZWFjaGVkXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbZ3JvdXBJZCwgZWRpdG9yc10gb2YgbWFwR3JvdXBUb0VkaXRvcnNUb0Nsb3NlKSB7XG5cdFx0XHRjb25zdCBncm91cCA9IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwKGdyb3VwSWQpO1xuXHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyhlZGl0b3JzLCB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNTY29wZWQpIHtcblx0XHRcdHJldHVybjsgLy8gZG8gbm90IHBlcnNpc3Qgc3RhdGUgd2hlbiBzY29wZWRcblx0XHR9XG5cblx0XHRpZiAodGhpcy5tb3N0UmVjZW50RWRpdG9yc01hcC5pc0VtcHR5KCkpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEVkaXRvcnNPYnNlcnZlci5TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRWRpdG9yc09ic2VydmVyLlNUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeSh0aGlzLnNlcmlhbGl6ZSgpKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNlcmlhbGl6ZSgpOiBJU2VyaWFsaXplZEVkaXRvcnNMaXN0IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSk7XG5cblx0XHRjb25zdCBlbnRyaWVzID0gWy4uLnRoaXMubW9zdFJlY2VudEVkaXRvcnNNYXAudmFsdWVzKCldO1xuXHRcdGNvbnN0IG1hcEdyb3VwVG9TZXJpYWxpemFibGVFZGl0b3JzT2ZHcm91cCA9IG5ldyBNYXA8SUVkaXRvckdyb3VwLCBFZGl0b3JJbnB1dFtdPigpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVudHJpZXM6IGNvYWxlc2NlKGVudHJpZXMubWFwKCh7IGVkaXRvciwgZ3JvdXBJZCB9KSA9PiB7XG5cblx0XHRcdFx0Ly8gRmluZCBncm91cCBmb3IgZW50cnlcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cChncm91cElkKTtcblx0XHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBGaW5kIHNlcmlhbGl6YWJsZSBlZGl0b3JzIG9mIGdyb3VwXG5cdFx0XHRcdGxldCBzZXJpYWxpemFibGVFZGl0b3JzT2ZHcm91cCA9IG1hcEdyb3VwVG9TZXJpYWxpemFibGVFZGl0b3JzT2ZHcm91cC5nZXQoZ3JvdXApO1xuXHRcdFx0XHRpZiAoIXNlcmlhbGl6YWJsZUVkaXRvcnNPZkdyb3VwKSB7XG5cdFx0XHRcdFx0c2VyaWFsaXphYmxlRWRpdG9yc09mR3JvdXAgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKS5maWx0ZXIoZWRpdG9yID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvclNlcmlhbGl6ZXIgPSByZWdpc3RyeS5nZXRFZGl0b3JTZXJpYWxpemVyKGVkaXRvcik7XG5cblx0XHRcdFx0XHRcdHJldHVybiBlZGl0b3JTZXJpYWxpemVyPy5jYW5TZXJpYWxpemUoZWRpdG9yKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRtYXBHcm91cFRvU2VyaWFsaXphYmxlRWRpdG9yc09mR3JvdXAuc2V0KGdyb3VwLCBzZXJpYWxpemFibGVFZGl0b3JzT2ZHcm91cCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPbmx5IHN0b3JlIHRoZSBpbmRleCBvZiB0aGUgZWRpdG9yIG9mIHRoYXQgZ3JvdXBcblx0XHRcdFx0Ly8gd2hpY2ggY2FuIGJlIHVuZGVmaW5lZCBpZiB0aGUgZWRpdG9yIGlzIG5vdCBzZXJpYWxpemFibGVcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBzZXJpYWxpemFibGVFZGl0b3JzT2ZHcm91cC5pbmRleE9mKGVkaXRvcik7XG5cdFx0XHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHsgZ3JvdXBJZCwgaW5kZXggfTtcblx0XHRcdH0pKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWRTdGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIgPT09IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0IHx8IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyID09PSB0aGlzLmVkaXRvckdyb3VwU2VydmljZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uud2hlblJlYWR5O1xuXHRcdH1cblxuXHRcdC8vIFByZXZpb3VzIHN0YXRlOiBMb2FkIGVkaXRvcnMgbWFwIGZyb20gcGVyc2lzdGVkIHN0YXRlXG5cdFx0Ly8gdW5sZXNzIHdlIGFyZSBydW5uaW5nIGluIHNjb3BlZCBtb2RlXG5cdFx0bGV0IGhhc1Jlc3RvcmFibGVTdGF0ZSA9IGZhbHNlO1xuXHRcdGlmICghdGhpcy5pc1Njb3BlZCkge1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEVkaXRvcnNPYnNlcnZlci5TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRpZiAoc2VyaWFsaXplZCkge1xuXHRcdFx0XHRoYXNSZXN0b3JhYmxlU3RhdGUgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLmRlc2VyaWFsaXplKEpTT04ucGFyc2Uoc2VyaWFsaXplZCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vIHByZXZpb3VzIHN0YXRlOiBiZXN0IHdlIGNhbiBkbyBpcyBhZGQgZWFjaCBlZGl0b3Jcblx0XHQvLyBmcm9tIG9sZGVzdCB0byBtb3N0IHJlY2VudGx5IHVzZWQgZWRpdG9yIGdyb3VwXG5cdFx0aWYgKCFoYXNSZXN0b3JhYmxlU3RhdGUpIHtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0XHRmb3IgKGxldCBpID0gZ3JvdXBzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdGNvbnN0IGdyb3VwID0gZ3JvdXBzW2ldO1xuXHRcdFx0XHRjb25zdCBncm91cEVkaXRvcnNNcnUgPSBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0XHRcdGZvciAobGV0IGkgPSBncm91cEVkaXRvcnNNcnUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHR0aGlzLmFkZE1vc3RSZWNlbnRFZGl0b3IoZ3JvdXAsIGdyb3VwRWRpdG9yc01ydVtpXSwgdHJ1ZSAvKiBlbmZvcmNlIGFzIGFjdGl2ZSB0byBwcmVzZXJ2ZSBvcmRlciAqLywgdHJ1ZSAvKiBpcyBuZXcgKi8pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHdlIGxpc3RlbiBvbiBncm91cCBjaGFuZ2VzIGZvciB0aG9zZSB0aGF0IGV4aXN0IG9uIHN0YXJ0dXBcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdyb3Vwcykge1xuXHRcdFx0dGhpcy5yZWdpc3Rlckdyb3VwTGlzdGVuZXJzKGdyb3VwKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRlc2VyaWFsaXplKHNlcmlhbGl6ZWQ6IElTZXJpYWxpemVkRWRpdG9yc0xpc3QpOiB2b2lkIHtcblx0XHRjb25zdCBtYXBWYWx1ZXM6IFtJRWRpdG9ySWRlbnRpZmllciwgSUVkaXRvcklkZW50aWZpZXJdW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgeyBncm91cElkLCBpbmRleCB9IG9mIHNlcmlhbGl6ZWQuZW50cmllcykge1xuXG5cdFx0XHQvLyBGaW5kIGdyb3VwIGZvciBlbnRyeVxuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cChncm91cElkKTtcblx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZpbmQgZWRpdG9yIGZvciBlbnRyeVxuXHRcdFx0Y29uc3QgZWRpdG9yID0gZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleChpbmRleCk7XG5cdFx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIGtleSBpcyByZWdpc3RlcmVkIGFzIHdlbGxcblx0XHRcdGNvbnN0IGVkaXRvcklkZW50aWZpZXIgPSB0aGlzLmVuc3VyZUtleShncm91cCwgZWRpdG9yKTtcblx0XHRcdG1hcFZhbHVlcy5wdXNoKFtlZGl0b3JJZGVudGlmaWVyLCBlZGl0b3JJZGVudGlmaWVyXSk7XG5cblx0XHRcdC8vIFVwZGF0ZSBpbiByZXNvdXJjZSBtYXBcblx0XHRcdHRoaXMudXBkYXRlRWRpdG9yUmVzb3VyY2VzTWFwKGVkaXRvciwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRmlsbCBtYXAgd2l0aCBkZXNlcmlhbGl6ZWQgdmFsdWVzXG5cdFx0dGhpcy5tb3N0UmVjZW50RWRpdG9yc01hcC5mcm9tSlNPTihtYXBWYWx1ZXMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQXFFLGtCQUFpRCxjQUFjLHNCQUFzQiwrQkFBK0I7QUFFekwsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxTQUFTLFlBQVksdUJBQXVCO0FBQ3JELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsc0JBQW9DLG1CQUEyQztBQUN4RixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVcsT0FBTyxtQkFBbUI7QUFDOUMsU0FBUyxjQUFjO0FBc0JoQixJQUFNLGtCQUFOLGNBQThCLFdBQVc7QUFBQSxFQThDL0MsWUFDQyx1QkFDOEIsb0JBQ0ksZ0JBQ2pDO0FBQ0QsVUFBTTtBQUh3QjtBQUNJO0FBN0NuQyxTQUFpQixTQUFTLG9CQUFJLElBQTBEO0FBQ3hGLFNBQWlCLHVCQUF1QixJQUFJLFVBQWdEO0FBQzVGLFNBQWlCLDRCQUE0QixJQUFJLFlBQXFFO0FBRXRILFNBQWlCLHdDQUF3QyxLQUFLLFVBQVUsSUFBSSxRQUFj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
