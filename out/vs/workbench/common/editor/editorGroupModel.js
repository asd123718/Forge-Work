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
import { Event, Emitter } from "../../../base/common/event.js";
import { EditorsOrder, EditorExtensions, SideBySideEditor, EditorCloseContext, GroupModelChangeKind } from "../editor.js";
import { EditorInput } from "./editorInput.js";
import { SideBySideEditorInput } from "./sideBySideEditorInput.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { dispose, Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { coalesce } from "../../../base/common/arrays.js";
const EditorOpenPositioning = {
  LEFT: "left",
  RIGHT: "right",
  FIRST: "first",
  LAST: "last"
};
function isSerializedEditorGroupModel(group) {
  const candidate = group;
  return !!(candidate && typeof candidate === "object" && Array.isArray(candidate.editors) && Array.isArray(candidate.mru));
}
function isGroupEditorChangeEvent(e) {
  const candidate = e;
  return candidate.editor && candidate.editorIndex !== void 0;
}
function isGroupEditorOpenEvent(e) {
  const candidate = e;
  return candidate.kind === GroupModelChangeKind.EDITOR_OPEN && candidate.editorIndex !== void 0;
}
function isGroupEditorMoveEvent(e) {
  const candidate = e;
  return candidate.kind === GroupModelChangeKind.EDITOR_MOVE && candidate.editorIndex !== void 0 && candidate.oldEditorIndex !== void 0;
}
function isGroupEditorCloseEvent(e) {
  const candidate = e;
  return candidate.kind === GroupModelChangeKind.EDITOR_CLOSE && candidate.editorIndex !== void 0 && candidate.context !== void 0 && candidate.sticky !== void 0;
}
let EditorGroupModel = class extends Disposable {
  constructor(labelOrSerializedGroup, instantiationService, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    //#region events
    this._onDidModelChange = this._register(new Emitter({
      leakWarningThreshold: 500,
      leakWarningName: "EditorGroupModel._onDidModelChange"
      /* increased for users with hundreds of inputs opened */
    }));
    this.onDidModelChange = this._onDidModelChange.event;
    this.editors = [];
    this.mru = [];
    this.editorListeners = /* @__PURE__ */ new Set();
    this.locked = false;
    this.selection = [];
    this.preview = null;
    // editor in preview state
    this.sticky = -1;
    // index of first editor in sticky state
    this.transient = /* @__PURE__ */ new Set();
    if (isSerializedEditorGroupModel(labelOrSerializedGroup)) {
      this._id = this.deserialize(labelOrSerializedGroup);
    } else {
      this._id = EditorGroupModel.IDS++;
    }
    this.onConfigurationUpdated();
    this.registerListeners();
  }
  get id() {
    return this._id;
  }
  // editors in selected state, first one is active
  get active() {
    return this.selection[0] ?? null;
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
  }
  onConfigurationUpdated(e) {
    if (e && !e.affectsConfiguration("workbench.editor.openPositioning") && !e.affectsConfiguration("workbench.editor.focusRecentEditorAfterClose")) {
      return;
    }
    this.editorOpenPositioning = this.configurationService.getValue("workbench.editor.openPositioning");
    this.focusRecentEditorAfterClose = this.configurationService.getValue("workbench.editor.focusRecentEditorAfterClose");
  }
  get count() {
    return this.editors.length;
  }
  get stickyCount() {
    return this.sticky + 1;
  }
  getEditors(order, options) {
    const editors = order === EditorsOrder.MOST_RECENTLY_ACTIVE ? this.mru.slice(0) : this.editors.slice(0);
    if (options?.excludeSticky) {
      if (order === EditorsOrder.MOST_RECENTLY_ACTIVE) {
        return editors.filter((editor) => !this.isSticky(editor));
      }
      return editors.slice(this.sticky + 1);
    }
    return editors;
  }
  getEditorByIndex(index) {
    return this.editors[index];
  }
  get activeEditor() {
    return this.active;
  }
  isActive(candidate) {
    return this.matches(this.active, candidate);
  }
  get previewEditor() {
    return this.preview;
  }
  openEditor(candidate, options) {
    const makeSticky = options?.sticky || typeof options?.index === "number" && this.isSticky(options.index);
    const makePinned = options?.pinned || options?.sticky;
    const makeTransient = !!options?.transient;
    const makeActive = options?.active || !this.activeEditor || !makePinned && this.preview === this.activeEditor;
    const existingEditorAndIndex = this.findEditor(candidate, options);
    if (!existingEditorAndIndex) {
      const newEditor = candidate;
      const indexOfActive = this.indexOf(this.active);
      let targetIndex;
      if (options && typeof options.index === "number") {
        targetIndex = options.index;
      } else if (this.editorOpenPositioning === EditorOpenPositioning.FIRST) {
        targetIndex = 0;
        if (!makeSticky && this.isSticky(targetIndex)) {
          targetIndex = this.sticky + 1;
        }
      } else if (this.editorOpenPositioning === EditorOpenPositioning.LAST) {
        targetIndex = this.editors.length;
      } else {
        if (this.editorOpenPositioning === EditorOpenPositioning.LEFT) {
          if (indexOfActive === 0 || !this.editors.length) {
            targetIndex = 0;
          } else {
            targetIndex = indexOfActive;
          }
        } else {
          targetIndex = indexOfActive + 1;
        }
        if (!makeSticky && this.isSticky(targetIndex)) {
          targetIndex = this.sticky + 1;
        }
      }
      if (makeSticky) {
        this.sticky++;
        if (!this.isSticky(targetIndex)) {
          targetIndex = this.sticky;
        }
      }
      if (makePinned || !this.preview) {
        this.splice(targetIndex, false, newEditor);
      }
      if (makeTransient) {
        this.doSetTransient(newEditor, targetIndex, true);
      }
      if (!makePinned) {
        if (this.preview) {
          const indexOfPreview = this.indexOf(this.preview);
          if (targetIndex > indexOfPreview) {
            targetIndex--;
          }
          this.replaceEditor(this.preview, newEditor, targetIndex, !makeActive);
        }
        this.preview = newEditor;
      }
      this.registerEditorListeners(newEditor);
      const event = {
        kind: GroupModelChangeKind.EDITOR_OPEN,
        editor: newEditor,
        editorIndex: targetIndex
      };
      this._onDidModelChange.fire(event);
      this.setSelection(makeActive ? newEditor : this.activeEditor, options?.inactiveSelection ?? []);
      return {
        editor: newEditor,
        isNew: true
      };
    } else {
      const [existingEditor, existingEditorIndex] = existingEditorAndIndex;
      this.doSetTransient(existingEditor, existingEditorIndex, makeTransient === false ? false : this.isTransient(existingEditor));
      if (makePinned) {
        this.doPin(existingEditor, existingEditorIndex);
      }
      this.setSelection(makeActive ? existingEditor : this.activeEditor, options?.inactiveSelection ?? []);
      if (options && typeof options.index === "number") {
        this.moveEditor(existingEditor, options.index);
      }
      if (makeSticky) {
        this.doStick(existingEditor, this.indexOf(existingEditor));
      }
      return {
        editor: existingEditor,
        isNew: false
      };
    }
  }
  registerEditorListeners(editor) {
    const listeners = new DisposableStore();
    this.editorListeners.add(listeners);
    listeners.add(Event.once(editor.onWillDispose)(() => {
      const editorIndex = this.editors.indexOf(editor);
      if (editorIndex >= 0) {
        const event = {
          kind: GroupModelChangeKind.EDITOR_WILL_DISPOSE,
          editor,
          editorIndex
        };
        this._onDidModelChange.fire(event);
      }
    }));
    listeners.add(editor.onDidChangeDirty(() => {
      const event = {
        kind: GroupModelChangeKind.EDITOR_DIRTY,
        editor,
        editorIndex: this.editors.indexOf(editor)
      };
      this._onDidModelChange.fire(event);
    }));
    listeners.add(editor.onDidChangeLabel(() => {
      const event = {
        kind: GroupModelChangeKind.EDITOR_LABEL,
        editor,
        editorIndex: this.editors.indexOf(editor)
      };
      this._onDidModelChange.fire(event);
    }));
    listeners.add(editor.onDidChangeCapabilities(() => {
      const event = {
        kind: GroupModelChangeKind.EDITOR_CAPABILITIES,
        editor,
        editorIndex: this.editors.indexOf(editor)
      };
      this._onDidModelChange.fire(event);
    }));
    listeners.add(this.onDidModelChange((event) => {
      if (event.kind === GroupModelChangeKind.EDITOR_CLOSE && event.editor?.matches(editor)) {
        dispose(listeners);
        this.editorListeners.delete(listeners);
      }
    }));
  }
  replaceEditor(toReplace, replaceWith, replaceIndex, openNext = true) {
    const closeResult = this.doCloseEditor(toReplace, EditorCloseContext.REPLACE, openNext);
    this.splice(replaceIndex, false, replaceWith);
    if (closeResult) {
      const event = {
        kind: GroupModelChangeKind.EDITOR_CLOSE,
        ...closeResult
      };
      this._onDidModelChange.fire(event);
    }
  }
  closeEditor(candidate, context = EditorCloseContext.UNKNOWN, openNext = true) {
    const closeResult = this.doCloseEditor(candidate, context, openNext);
    if (closeResult) {
      const event = {
        kind: GroupModelChangeKind.EDITOR_CLOSE,
        ...closeResult
      };
      this._onDidModelChange.fire(event);
      return closeResult;
    }
    return void 0;
  }
  doCloseEditor(candidate, context, openNext) {
    const index = this.indexOf(candidate);
    if (index === -1) {
      return void 0;
    }
    const editor = this.editors[index];
    const sticky = this.isSticky(index);
    const isActiveEditor = this.active === editor;
    if (openNext && isActiveEditor) {
      if (this.mru.length > 1) {
        let newActive;
        if (this.focusRecentEditorAfterClose) {
          newActive = this.mru[1];
        } else {
          if (index === this.editors.length - 1) {
            newActive = this.editors[index - 1];
          } else {
            newActive = this.editors[index + 1];
          }
        }
        const newInactiveSelectedEditors = this.selection.filter((selected) => selected !== editor && selected !== newActive);
        this.doSetSelection(newActive, this.editors.indexOf(newActive), newInactiveSelectedEditors);
      } else {
        this.doSetSelection(null, void 0, []);
      }
    } else if (!isActiveEditor) {
      if (this.doIsSelected(editor)) {
        const newInactiveSelectedEditors = this.selection.filter((selected) => selected !== editor && selected !== this.activeEditor);
        this.doSetSelection(this.activeEditor, this.indexOf(this.activeEditor), newInactiveSelectedEditors);
      }
    }
    if (this.preview === editor) {
      this.preview = null;
    }
    this.transient.delete(editor);
    this.splice(index, true);
    return { editor, sticky, editorIndex: index, context };
  }
  moveEditor(candidate, toIndex) {
    if (toIndex >= this.editors.length) {
      toIndex = this.editors.length - 1;
    } else if (toIndex < 0) {
      toIndex = 0;
    }
    const index = this.indexOf(candidate);
    if (index < 0 || toIndex === index) {
      return;
    }
    const editor = this.editors[index];
    const sticky = this.sticky;
    if (this.isSticky(index) && toIndex > this.sticky) {
      this.sticky--;
    } else if (!this.isSticky(index) && toIndex <= this.sticky) {
      this.sticky++;
    }
    this.editors.splice(index, 1);
    this.editors.splice(toIndex, 0, editor);
    const event = {
      kind: GroupModelChangeKind.EDITOR_MOVE,
      editor,
      oldEditorIndex: index,
      editorIndex: toIndex
    };
    this._onDidModelChange.fire(event);
    if (sticky !== this.sticky) {
      const event2 = {
        kind: GroupModelChangeKind.EDITOR_STICKY,
        editor,
        editorIndex: toIndex
      };
      this._onDidModelChange.fire(event2);
    }
    return editor;
  }
  setActive(candidate) {
    let result;
    if (!candidate) {
      this.setGroupActive();
    } else {
      result = this.setEditorActive(candidate);
    }
    return result;
  }
  setGroupActive() {
    this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_ACTIVE });
  }
  setEditorActive(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doSetSelection(editor, editorIndex, []);
    return editor;
  }
  get selectedEditors() {
    return this.editors.filter((editor) => this.doIsSelected(editor));
  }
  isSelected(editorCandidateOrIndex) {
    let editor;
    if (typeof editorCandidateOrIndex === "number") {
      editor = this.editors[editorCandidateOrIndex];
    } else {
      editor = this.findEditor(editorCandidateOrIndex)?.[0];
    }
    return !!editor && this.doIsSelected(editor);
  }
  doIsSelected(editor) {
    return this.selection.includes(editor);
  }
  setSelection(activeSelectedEditorCandidate, inactiveSelectedEditorCandidates) {
    const res = this.findEditor(activeSelectedEditorCandidate);
    if (!res) {
      return;
    }
    const [activeSelectedEditor, activeSelectedEditorIndex] = res;
    const inactiveSelectedEditors = /* @__PURE__ */ new Set();
    for (const inactiveSelectedEditorCandidate of inactiveSelectedEditorCandidates) {
      const res2 = this.findEditor(inactiveSelectedEditorCandidate);
      if (!res2) {
        return;
      }
      const [inactiveSelectedEditor] = res2;
      if (inactiveSelectedEditor === activeSelectedEditor) {
        continue;
      }
      inactiveSelectedEditors.add(inactiveSelectedEditor);
    }
    this.doSetSelection(activeSelectedEditor, activeSelectedEditorIndex, Array.from(inactiveSelectedEditors));
  }
  doSetSelection(activeSelectedEditor, activeSelectedEditorIndex, inactiveSelectedEditors) {
    const previousActiveEditor = this.activeEditor;
    const previousSelection = this.selection;
    let newSelection;
    if (activeSelectedEditor) {
      newSelection = [activeSelectedEditor, ...inactiveSelectedEditors];
    } else {
      newSelection = [];
    }
    this.selection = newSelection;
    const activeEditorChanged = activeSelectedEditor && typeof activeSelectedEditorIndex === "number" && previousActiveEditor !== activeSelectedEditor;
    if (activeEditorChanged) {
      const mruIndex = this.indexOf(activeSelectedEditor, this.mru);
      this.mru.splice(mruIndex, 1);
      this.mru.unshift(activeSelectedEditor);
      const event = {
        kind: GroupModelChangeKind.EDITOR_ACTIVE,
        editor: activeSelectedEditor,
        editorIndex: activeSelectedEditorIndex
      };
      this._onDidModelChange.fire(event);
    }
    if (activeEditorChanged || previousSelection.length !== newSelection.length || previousSelection.some((editor) => !newSelection.includes(editor))) {
      const event = {
        kind: GroupModelChangeKind.EDITORS_SELECTION
      };
      this._onDidModelChange.fire(event);
    }
  }
  setIndex(index) {
    this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_INDEX });
  }
  setLabel(label) {
    this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_LABEL });
  }
  pin(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doPin(editor, editorIndex);
    return editor;
  }
  doPin(editor, editorIndex) {
    if (this.isPinned(editor)) {
      return;
    }
    this.setTransient(editor, false);
    this.preview = null;
    const event = {
      kind: GroupModelChangeKind.EDITOR_PIN,
      editor,
      editorIndex
    };
    this._onDidModelChange.fire(event);
  }
  unpin(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doUnpin(editor, editorIndex);
    return editor;
  }
  doUnpin(editor, editorIndex) {
    if (!this.isPinned(editor)) {
      return;
    }
    const oldPreview = this.preview;
    this.preview = editor;
    const event = {
      kind: GroupModelChangeKind.EDITOR_PIN,
      editor,
      editorIndex
    };
    this._onDidModelChange.fire(event);
    if (oldPreview) {
      this.closeEditor(oldPreview, EditorCloseContext.UNPIN);
    }
  }
  isPinned(editorCandidateOrIndex) {
    let editor;
    if (typeof editorCandidateOrIndex === "number") {
      editor = this.editors[editorCandidateOrIndex];
    } else {
      editor = editorCandidateOrIndex;
    }
    return !this.matches(this.preview, editor);
  }
  stick(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doStick(editor, editorIndex);
    return editor;
  }
  doStick(editor, editorIndex) {
    if (this.isSticky(editorIndex)) {
      return;
    }
    this.pin(editor);
    const newEditorIndex = this.sticky + 1;
    this.moveEditor(editor, newEditorIndex);
    this.sticky++;
    const event = {
      kind: GroupModelChangeKind.EDITOR_STICKY,
      editor,
      editorIndex: newEditorIndex
    };
    this._onDidModelChange.fire(event);
  }
  unstick(candidate) {
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doUnstick(editor, editorIndex);
    return editor;
  }
  doUnstick(editor, editorIndex) {
    if (!this.isSticky(editorIndex)) {
      return;
    }
    const newEditorIndex = this.sticky;
    this.moveEditor(editor, newEditorIndex);
    this.sticky--;
    const event = {
      kind: GroupModelChangeKind.EDITOR_STICKY,
      editor,
      editorIndex: newEditorIndex
    };
    this._onDidModelChange.fire(event);
  }
  isSticky(candidateOrIndex) {
    if (this.sticky < 0) {
      return false;
    }
    let index;
    if (typeof candidateOrIndex === "number") {
      index = candidateOrIndex;
    } else {
      index = this.indexOf(candidateOrIndex);
    }
    if (index < 0) {
      return false;
    }
    return index <= this.sticky;
  }
  setTransient(candidate, transient) {
    if (!transient && this.transient.size === 0) {
      return;
    }
    const res = this.findEditor(candidate);
    if (!res) {
      return;
    }
    const [editor, editorIndex] = res;
    this.doSetTransient(editor, editorIndex, transient);
    return editor;
  }
  doSetTransient(editor, editorIndex, transient) {
    if (transient) {
      if (this.transient.has(editor)) {
        return;
      }
      this.transient.add(editor);
    } else {
      if (!this.transient.has(editor)) {
        return;
      }
      this.transient.delete(editor);
    }
    const event = {
      kind: GroupModelChangeKind.EDITOR_TRANSIENT,
      editor,
      editorIndex
    };
    this._onDidModelChange.fire(event);
  }
  isTransient(editorCandidateOrIndex) {
    if (this.transient.size === 0) {
      return false;
    }
    let editor;
    if (typeof editorCandidateOrIndex === "number") {
      editor = this.editors[editorCandidateOrIndex];
    } else {
      editor = this.findEditor(editorCandidateOrIndex)?.[0];
    }
    return !!editor && this.transient.has(editor);
  }
  splice(index, del, editor) {
    const editorToDeleteOrReplace = this.editors[index];
    if (del && this.isSticky(index)) {
      this.sticky--;
    }
    if (editor) {
      this.editors.splice(index, del ? 1 : 0, editor);
    } else {
      this.editors.splice(index, del ? 1 : 0);
    }
    {
      if (!del && editor) {
        if (this.mru.length === 0) {
          this.mru.push(editor);
        } else {
          this.mru.splice(1, 0, editor);
        }
      } else {
        const indexInMRU = this.indexOf(editorToDeleteOrReplace, this.mru);
        if (del && !editor) {
          this.mru.splice(indexInMRU, 1);
        } else if (del && editor) {
          this.mru.splice(indexInMRU, 1, editor);
        }
      }
    }
  }
  indexOf(candidate, editors = this.editors, options) {
    let index = -1;
    if (!candidate) {
      return index;
    }
    for (let i = 0; i < editors.length; i++) {
      const editor = editors[i];
      if (this.matches(editor, candidate, options)) {
        if (options?.supportSideBySide && editor instanceof SideBySideEditorInput && !(candidate instanceof SideBySideEditorInput)) {
          index = i;
        } else {
          index = i;
          break;
        }
      }
    }
    return index;
  }
  findEditor(candidate, options) {
    const index = this.indexOf(candidate, this.editors, options);
    if (index === -1) {
      return void 0;
    }
    return [this.editors[index], index];
  }
  isFirst(candidate, editors = this.editors) {
    return this.matches(editors[0], candidate);
  }
  isLast(candidate, editors = this.editors) {
    return this.matches(editors[editors.length - 1], candidate);
  }
  contains(candidate, options) {
    return this.indexOf(candidate, this.editors, options) !== -1;
  }
  matches(editor, candidate, options) {
    if (!editor || !candidate) {
      return false;
    }
    if (options?.supportSideBySide && editor instanceof SideBySideEditorInput && !(candidate instanceof SideBySideEditorInput)) {
      switch (options.supportSideBySide) {
        case SideBySideEditor.ANY:
          if (this.matches(editor.primary, candidate, options) || this.matches(editor.secondary, candidate, options)) {
            return true;
          }
          break;
        case SideBySideEditor.BOTH:
          if (this.matches(editor.primary, candidate, options) && this.matches(editor.secondary, candidate, options)) {
            return true;
          }
          break;
      }
    }
    const strictEquals = editor === candidate;
    if (options?.strictEquals) {
      return strictEquals;
    }
    return strictEquals || editor.matches(candidate);
  }
  get isLocked() {
    return this.locked;
  }
  lock(locked) {
    if (this.isLocked !== locked) {
      this.locked = locked;
      this._onDidModelChange.fire({ kind: GroupModelChangeKind.GROUP_LOCKED });
    }
  }
  clone() {
    const clone = this.instantiationService.createInstance(EditorGroupModel, void 0);
    clone.editors = this.editors.slice(0);
    clone.mru = this.mru.slice(0);
    clone.preview = this.preview;
    clone.selection = this.selection.slice(0);
    clone.sticky = this.sticky;
    for (const editor of clone.editors) {
      clone.registerEditorListeners(editor);
    }
    return clone;
  }
  serialize() {
    const registry = Registry.as(EditorExtensions.EditorFactory);
    const serializableEditors = [];
    const serializedEditors = [];
    let serializablePreviewIndex;
    let serializableSticky = this.sticky;
    for (let i = 0; i < this.editors.length; i++) {
      const editor = this.editors[i];
      let canSerializeEditor = false;
      const editorSerializer = registry.getEditorSerializer(editor);
      if (editorSerializer) {
        const value = editorSerializer.canSerialize(editor) ? editorSerializer.serialize(editor) : void 0;
        if (typeof value === "string") {
          canSerializeEditor = true;
          serializedEditors.push({ id: editor.typeId, value });
          serializableEditors.push(editor);
          if (this.preview === editor) {
            serializablePreviewIndex = serializableEditors.length - 1;
          }
        } else {
          canSerializeEditor = false;
        }
      }
      if (!canSerializeEditor && this.isSticky(i)) {
        serializableSticky--;
      }
    }
    const serializableMru = this.mru.map((editor) => this.indexOf(editor, serializableEditors)).filter((i) => i >= 0);
    return {
      id: this.id,
      locked: this.locked ? true : void 0,
      editors: serializedEditors,
      mru: serializableMru,
      preview: serializablePreviewIndex,
      sticky: serializableSticky >= 0 ? serializableSticky : void 0
    };
  }
  deserialize(data) {
    const registry = Registry.as(EditorExtensions.EditorFactory);
    if (typeof data.id === "number") {
      this._id = data.id;
      EditorGroupModel.IDS = Math.max(data.id + 1, EditorGroupModel.IDS);
    } else {
      this._id = EditorGroupModel.IDS++;
    }
    if (data.locked) {
      this.locked = true;
    }
    this.editors = coalesce(data.editors.map((e, index) => {
      let editor;
      const editorSerializer = registry.getEditorSerializer(e.id);
      if (editorSerializer) {
        const deserializedEditor = editorSerializer.deserialize(this.instantiationService, e.value);
        if (deserializedEditor instanceof EditorInput) {
          editor = deserializedEditor;
          this.registerEditorListeners(editor);
        }
      }
      if (!editor && typeof data.sticky === "number" && index <= data.sticky) {
        data.sticky--;
      }
      return editor;
    }));
    this.mru = coalesce(data.mru.map((i) => this.editors[i]));
    this.selection = this.mru.length > 0 ? [this.mru[0]] : [];
    if (typeof data.preview === "number") {
      this.preview = this.editors[data.preview];
    }
    if (typeof data.sticky === "number") {
      this.sticky = data.sticky;
    }
    return this._id;
  }
  dispose() {
    dispose(Array.from(this.editorListeners));
    this.editorListeners.clear();
    this.transient.clear();
    super.dispose();
  }
};
EditorGroupModel.IDS = 0;
EditorGroupModel = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService)
], EditorGroupModel);
export {
  EditorGroupModel,
  isGroupEditorChangeEvent,
  isGroupEditorCloseEvent,
  isGroupEditorMoveEvent,
  isGroupEditorOpenEvent,
  isSerializedEditorGroupModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbW1vblxcZWRpdG9yXFxlZGl0b3JHcm91cE1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBHcm91cElkZW50aWZpZXIsIEVkaXRvcnNPcmRlciwgRWRpdG9yRXh0ZW5zaW9ucywgSVVudHlwZWRFZGl0b3JJbnB1dCwgU2lkZUJ5U2lkZUVkaXRvciwgRWRpdG9yQ2xvc2VDb250ZXh0LCBJTWF0Y2hFZGl0b3JPcHRpb25zLCBHcm91cE1vZGVsQ2hhbmdlS2luZCB9IGZyb20gJy4uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4vZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvcklucHV0IH0gZnJvbSAnLi9zaWRlQnlTaWRlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGRpc3Bvc2UsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5cbmNvbnN0IEVkaXRvck9wZW5Qb3NpdGlvbmluZyA9IHtcblx0TEVGVDogJ2xlZnQnLFxuXHRSSUdIVDogJ3JpZ2h0Jyxcblx0RklSU1Q6ICdmaXJzdCcsXG5cdExBU1Q6ICdsYXN0J1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yT3Blbk9wdGlvbnMge1xuXHRyZWFkb25seSBwaW5uZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBzdGlja3k/OiBib29sZWFuO1xuXHRyZWFkb25seSB0cmFuc2llbnQ/OiBib29sZWFuO1xuXHRhY3RpdmU/OiBib29sZWFuO1xuXHRyZWFkb25seSBpbmFjdGl2ZVNlbGVjdGlvbj86IEVkaXRvcklucHV0W107XG5cdHJlYWRvbmx5IGluZGV4PzogbnVtYmVyO1xuXHRyZWFkb25seSBzdXBwb3J0U2lkZUJ5U2lkZT86IFNpZGVCeVNpZGVFZGl0b3IuQU5ZIHwgU2lkZUJ5U2lkZUVkaXRvci5CT1RIO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JPcGVuUmVzdWx0IHtcblx0cmVhZG9ubHkgZWRpdG9yOiBFZGl0b3JJbnB1dDtcblx0cmVhZG9ubHkgaXNOZXc6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRFZGl0b3JJbnB1dCB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZhbHVlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsIHtcblx0cmVhZG9ubHkgaWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbG9ja2VkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZWRpdG9yczogSVNlcmlhbGl6ZWRFZGl0b3JJbnB1dFtdO1xuXHRyZWFkb25seSBtcnU6IG51bWJlcltdO1xuXHRyZWFkb25seSBwcmV2aWV3PzogbnVtYmVyO1xuXHRzdGlja3k/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsKGdyb3VwPzogdW5rbm93bik6IGdyb3VwIGlzIElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGdyb3VwIGFzIElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCB8IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4gISEoY2FuZGlkYXRlICYmIHR5cGVvZiBjYW5kaWRhdGUgPT09ICdvYmplY3QnICYmIEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLmVkaXRvcnMpICYmIEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlLm1ydSkpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHcm91cE1vZGVsQ2hhbmdlRXZlbnQge1xuXG5cdC8qKlxuXHQgKiBUaGUga2luZCBvZiBjaGFuZ2UgdGhhdCBvY2N1cnJlZCBpbiB0aGUgZ3JvdXAgbW9kZWwuXG5cdCAqL1xuXHRyZWFkb25seSBraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZDtcblxuXHQvKipcblx0ICogT25seSBhcHBsaWVzIHdoZW4gZWRpdG9ycyBjaGFuZ2UgcHJvdmlkaW5nXG5cdCAqIGFjY2VzcyB0byB0aGUgZWRpdG9yIHRoZSBldmVudCBpcyBhYm91dC5cblx0ICovXG5cdHJlYWRvbmx5IGVkaXRvcj86IEVkaXRvcklucHV0O1xuXG5cdC8qKlxuXHQgKiBPbmx5IGFwcGxpZXMgd2hlbiBlZGl0b3JzIGNoYW5nZSBwcm92aWRpbmdcblx0ICogYWNjZXNzIHRvIHRoZSBpbmRleCBvZiB0aGUgZWRpdG9yIHRoZSBldmVudFxuXHQgKiBpcyBhYm91dC5cblx0ICovXG5cdHJlYWRvbmx5IGVkaXRvckluZGV4PzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElHcm91cEVkaXRvckNoYW5nZUV2ZW50IGV4dGVuZHMgSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IGVkaXRvcjogRWRpdG9ySW5wdXQ7XG5cdHJlYWRvbmx5IGVkaXRvckluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0dyb3VwRWRpdG9yQ2hhbmdlRXZlbnQoZTogSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCk6IGUgaXMgSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBlIGFzIElHcm91cEVkaXRvck9wZW5FdmVudDtcblxuXHRyZXR1cm4gY2FuZGlkYXRlLmVkaXRvciAmJiBjYW5kaWRhdGUuZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJR3JvdXBFZGl0b3JPcGVuRXZlbnQgZXh0ZW5kcyBJR3JvdXBFZGl0b3JDaGFuZ2VFdmVudCB7XG5cblx0cmVhZG9ubHkga2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0dyb3VwRWRpdG9yT3BlbkV2ZW50KGU6IElHcm91cE1vZGVsQ2hhbmdlRXZlbnQpOiBlIGlzIElHcm91cEVkaXRvck9wZW5FdmVudCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGUgYXMgSUdyb3VwRWRpdG9yT3BlbkV2ZW50O1xuXG5cdHJldHVybiBjYW5kaWRhdGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX09QRU4gJiYgY2FuZGlkYXRlLmVkaXRvckluZGV4ICE9PSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdyb3VwRWRpdG9yTW92ZUV2ZW50IGV4dGVuZHMgSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQge1xuXG5cdHJlYWRvbmx5IGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9NT1ZFO1xuXG5cdC8qKlxuXHQgKiBTaWduaWZpZXMgdGhlIGluZGV4IHRoZSBlZGl0b3IgaXMgbW92aW5nIGZyb20uXG5cdCAqIGBlZGl0b3JJbmRleGAgd2lsbCBjb250YWluIHRoZSBpbmRleCB0aGUgZWRpdG9yXG5cdCAqIGlzIG1vdmluZyB0by5cblx0ICovXG5cdHJlYWRvbmx5IG9sZEVkaXRvckluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0dyb3VwRWRpdG9yTW92ZUV2ZW50KGU6IElHcm91cE1vZGVsQ2hhbmdlRXZlbnQpOiBlIGlzIElHcm91cEVkaXRvck1vdmVFdmVudCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGUgYXMgSUdyb3VwRWRpdG9yTW92ZUV2ZW50O1xuXG5cdHJldHVybiBjYW5kaWRhdGUua2luZCA9PT0gR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX01PVkUgJiYgY2FuZGlkYXRlLmVkaXRvckluZGV4ICE9PSB1bmRlZmluZWQgJiYgY2FuZGlkYXRlLm9sZEVkaXRvckluZGV4ICE9PSB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdyb3VwRWRpdG9yQ2xvc2VFdmVudCBleHRlbmRzIElHcm91cEVkaXRvckNoYW5nZUV2ZW50IHtcblxuXHRyZWFkb25seSBraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0U7XG5cblx0LyoqXG5cdCAqIFNpZ25pZmllcyB0aGUgY29udGV4dCBpbiB3aGljaCB0aGUgZWRpdG9yXG5cdCAqIGlzIGJlaW5nIGNsb3NlZC4gVGhpcyBhbGxvd3MgZm9yIHVuZGVyc3RhbmRpbmdcblx0ICogaWYgYSByZXBsYWNlIG9yIHJlb3BlbiBpcyBvY2N1cnJpbmdcblx0ICovXG5cdHJlYWRvbmx5IGNvbnRleHQ6IEVkaXRvckNsb3NlQ29udGV4dDtcblxuXHQvKipcblx0ICogU2lnbmlmaWVzIHdoZXRoZXIgb3Igbm90IHRoZSBjbG9zZWQgZWRpdG9yIHdhc1xuXHQgKiBzdGlja3kuIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2FzdWUgc3RhdGUgaXMgbG9zdFxuXHQgKiBhZnRlciBjbG9zaW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgc3RpY2t5OiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNHcm91cEVkaXRvckNsb3NlRXZlbnQoZTogSUdyb3VwTW9kZWxDaGFuZ2VFdmVudCk6IGUgaXMgSUdyb3VwRWRpdG9yQ2xvc2VFdmVudCB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IGUgYXMgSUdyb3VwRWRpdG9yQ2xvc2VFdmVudDtcblxuXHRyZXR1cm4gY2FuZGlkYXRlLmtpbmQgPT09IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DTE9TRSAmJiBjYW5kaWRhdGUuZWRpdG9ySW5kZXggIT09IHVuZGVmaW5lZCAmJiBjYW5kaWRhdGUuY29udGV4dCAhPT0gdW5kZWZpbmVkICYmIGNhbmRpZGF0ZS5zdGlja3kgIT09IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElFZGl0b3JDbG9zZVJlc3VsdCB7XG5cdHJlYWRvbmx5IGVkaXRvcjogRWRpdG9ySW5wdXQ7XG5cdHJlYWRvbmx5IGNvbnRleHQ6IEVkaXRvckNsb3NlQ29udGV4dDtcblx0cmVhZG9ubHkgZWRpdG9ySW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgc3RpY2t5OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZWFkb25seUVkaXRvckdyb3VwTW9kZWwge1xuXG5cdHJlYWRvbmx5IG9uRGlkTW9kZWxDaGFuZ2U6IEV2ZW50PElHcm91cE1vZGVsQ2hhbmdlRXZlbnQ+O1xuXG5cdHJlYWRvbmx5IGlkOiBHcm91cElkZW50aWZpZXI7XG5cdHJlYWRvbmx5IGNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHN0aWNreUNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGlzTG9ja2VkOiBib29sZWFuO1xuXHRyZWFkb25seSBhY3RpdmVFZGl0b3I6IEVkaXRvcklucHV0IHwgbnVsbDtcblx0cmVhZG9ubHkgcHJldmlld0VkaXRvcjogRWRpdG9ySW5wdXQgfCBudWxsO1xuXHRyZWFkb25seSBzZWxlY3RlZEVkaXRvcnM6IEVkaXRvcklucHV0W107XG5cblx0Z2V0RWRpdG9ycyhvcmRlcjogRWRpdG9yc09yZGVyLCBvcHRpb25zPzogeyBleGNsdWRlU3RpY2t5PzogYm9vbGVhbiB9KTogRWRpdG9ySW5wdXRbXTtcblx0Z2V0RWRpdG9yQnlJbmRleChpbmRleDogbnVtYmVyKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdGluZGV4T2YoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQgfCBudWxsLCBlZGl0b3JzPzogRWRpdG9ySW5wdXRbXSwgb3B0aW9ucz86IElNYXRjaEVkaXRvck9wdGlvbnMpOiBudW1iZXI7XG5cdGlzQWN0aXZlKGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0KTogYm9vbGVhbjtcblx0aXNQaW5uZWQoZWRpdG9yT3JJbmRleDogRWRpdG9ySW5wdXQgfCBudW1iZXIpOiBib29sZWFuO1xuXHRpc1N0aWNreShlZGl0b3JPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcik6IGJvb2xlYW47XG5cdGlzU2VsZWN0ZWQoZWRpdG9yT3JJbmRleDogRWRpdG9ySW5wdXQgfCBudW1iZXIpOiBib29sZWFuO1xuXHRpc1RyYW5zaWVudChlZGl0b3JPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcik6IGJvb2xlYW47XG5cdGlzRmlyc3QoZWRpdG9yOiBFZGl0b3JJbnB1dCwgZWRpdG9ycz86IEVkaXRvcklucHV0W10pOiBib29sZWFuO1xuXHRpc0xhc3QoZWRpdG9yOiBFZGl0b3JJbnB1dCwgZWRpdG9ycz86IEVkaXRvcklucHV0W10pOiBib29sZWFuO1xuXHRmaW5kRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQgfCBudWxsLCBvcHRpb25zPzogSU1hdGNoRWRpdG9yT3B0aW9ucyk6IFtFZGl0b3JJbnB1dCwgbnVtYmVyIC8qIGluZGV4ICovXSB8IHVuZGVmaW5lZDtcblx0Y29udGFpbnMoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJTWF0Y2hFZGl0b3JPcHRpb25zKTogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElFZGl0b3JHcm91cE1vZGVsIGV4dGVuZHMgSVJlYWRvbmx5RWRpdG9yR3JvdXBNb2RlbCB7XG5cdG9wZW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgb3B0aW9ucz86IElFZGl0b3JPcGVuT3B0aW9ucyk6IElFZGl0b3JPcGVuUmVzdWx0O1xuXHRjbG9zZUVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCBjb250ZXh0PzogRWRpdG9yQ2xvc2VDb250ZXh0LCBvcGVuTmV4dD86IGJvb2xlYW4pOiBJRWRpdG9yQ2xvc2VSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdG1vdmVFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdG9JbmRleDogbnVtYmVyKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdHNldEFjdGl2ZShlZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdHNldFNlbGVjdGlvbihhY3RpdmVTZWxlY3RlZEVkaXRvcjogRWRpdG9ySW5wdXQsIGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JzOiBFZGl0b3JJbnB1dFtdKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvckdyb3VwTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckdyb3VwTW9kZWwge1xuXG5cdHByaXZhdGUgc3RhdGljIElEUyA9IDA7XG5cblx0Ly8jcmVnaW9uIGV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTW9kZWxDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJR3JvdXBNb2RlbENoYW5nZUV2ZW50Pih7IGxlYWtXYXJuaW5nVGhyZXNob2xkOiA1MDAsIGxlYWtXYXJuaW5nTmFtZTogJ0VkaXRvckdyb3VwTW9kZWwuX29uRGlkTW9kZWxDaGFuZ2UnIC8qIGluY3JlYXNlZCBmb3IgdXNlcnMgd2l0aCBodW5kcmVkcyBvZiBpbnB1dHMgb3BlbmVkICovIH0pKTtcblx0cmVhZG9ubHkgb25EaWRNb2RlbENoYW5nZSA9IHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBfaWQ6IEdyb3VwSWRlbnRpZmllcjtcblx0Z2V0IGlkKCk6IEdyb3VwSWRlbnRpZmllciB7IHJldHVybiB0aGlzLl9pZDsgfVxuXG5cdHByaXZhdGUgZWRpdG9yczogRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRwcml2YXRlIG1ydTogRWRpdG9ySW5wdXRbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yTGlzdGVuZXJzID0gbmV3IFNldDxEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0cHJpdmF0ZSBsb2NrZWQgPSBmYWxzZTtcblxuXHRwcml2YXRlIHNlbGVjdGlvbjogRWRpdG9ySW5wdXRbXSA9IFtdO1x0XHRcdFx0XHQvLyBlZGl0b3JzIGluIHNlbGVjdGVkIHN0YXRlLCBmaXJzdCBvbmUgaXMgYWN0aXZlXG5cblx0cHJpdmF0ZSBnZXQgYWN0aXZlKCk6IEVkaXRvcklucHV0IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuc2VsZWN0aW9uWzBdID8/IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHByZXZpZXc6IEVkaXRvcklucHV0IHwgbnVsbCA9IG51bGw7IFx0XHRcdC8vIGVkaXRvciBpbiBwcmV2aWV3IHN0YXRlXG5cdHByaXZhdGUgc3RpY2t5ID0gLTE7XHRcdFx0XHRcdFx0XHRcdFx0Ly8gaW5kZXggb2YgZmlyc3QgZWRpdG9yIGluIHN0aWNreSBzdGF0ZVxuXHRwcml2YXRlIHJlYWRvbmx5IHRyYW5zaWVudCA9IG5ldyBTZXQ8RWRpdG9ySW5wdXQ+KCk7IFx0Ly8gZWRpdG9ycyBpbiB0cmFuc2llbnQgc3RhdGVcblxuXHRwcml2YXRlIGVkaXRvck9wZW5Qb3NpdGlvbmluZzogKCdsZWZ0JyB8ICdyaWdodCcgfCAnZmlyc3QnIHwgJ2xhc3QnKSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBmb2N1c1JlY2VudEVkaXRvckFmdGVyQ2xvc2U6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bGFiZWxPclNlcmlhbGl6ZWRHcm91cDogSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsIHwgdW5kZWZpbmVkLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoaXNTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbChsYWJlbE9yU2VyaWFsaXplZEdyb3VwKSkge1xuXHRcdFx0dGhpcy5faWQgPSB0aGlzLmRlc2VyaWFsaXplKGxhYmVsT3JTZXJpYWxpemVkR3JvdXApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pZCA9IEVkaXRvckdyb3VwTW9kZWwuSURTKys7XG5cdFx0fVxuXG5cdFx0dGhpcy5vbkNvbmZpZ3VyYXRpb25VcGRhdGVkKCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHRoaXMub25Db25maWd1cmF0aW9uVXBkYXRlZChlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGU/OiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUgJiYgIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5lZGl0b3Iub3BlblBvc2l0aW9uaW5nJykgJiYgIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5lZGl0b3IuZm9jdXNSZWNlbnRFZGl0b3JBZnRlckNsb3NlJykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvck9wZW5Qb3NpdGlvbmluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dvcmtiZW5jaC5lZGl0b3Iub3BlblBvc2l0aW9uaW5nJyk7XG5cdFx0dGhpcy5mb2N1c1JlY2VudEVkaXRvckFmdGVyQ2xvc2UgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guZWRpdG9yLmZvY3VzUmVjZW50RWRpdG9yQWZ0ZXJDbG9zZScpO1xuXHR9XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9ycy5sZW5ndGg7XG5cdH1cblxuXHRnZXQgc3RpY2t5Q291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5zdGlja3kgKyAxO1xuXHR9XG5cblx0Z2V0RWRpdG9ycyhvcmRlcjogRWRpdG9yc09yZGVyLCBvcHRpb25zPzogeyBleGNsdWRlU3RpY2t5PzogYm9vbGVhbiB9KTogRWRpdG9ySW5wdXRbXSB7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IG9yZGVyID09PSBFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUgPyB0aGlzLm1ydS5zbGljZSgwKSA6IHRoaXMuZWRpdG9ycy5zbGljZSgwKTtcblxuXHRcdGlmIChvcHRpb25zPy5leGNsdWRlU3RpY2t5KSB7XG5cblx0XHRcdC8vIE1SVTogbmVlZCB0byBjaGVjayBmb3IgaW5kZXggb24gZWFjaFxuXHRcdFx0aWYgKG9yZGVyID09PSBFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiAhdGhpcy5pc1N0aWNreShlZGl0b3IpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2VxdWVudGlhbDogc2ltcGx5IHN0YXJ0IGFmdGVyIHN0aWNreSBpbmRleFxuXHRcdFx0cmV0dXJuIGVkaXRvcnMuc2xpY2UodGhpcy5zdGlja3kgKyAxKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9ycztcblx0fVxuXG5cdGdldEVkaXRvckJ5SW5kZXgoaW5kZXg6IG51bWJlcik6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JzW2luZGV4XTtcblx0fVxuXG5cdGdldCBhY3RpdmVFZGl0b3IoKTogRWRpdG9ySW5wdXQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5hY3RpdmU7XG5cdH1cblxuXHRpc0FjdGl2ZShjYW5kaWRhdGU6IEVkaXRvcklucHV0IHwgSVVudHlwZWRFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLm1hdGNoZXModGhpcy5hY3RpdmUsIGNhbmRpZGF0ZSk7XG5cdH1cblxuXHRnZXQgcHJldmlld0VkaXRvcigpOiBFZGl0b3JJbnB1dCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLnByZXZpZXc7XG5cdH1cblxuXHRvcGVuRWRpdG9yKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJRWRpdG9yT3Blbk9wdGlvbnMpOiBJRWRpdG9yT3BlblJlc3VsdCB7XG5cdFx0Y29uc3QgbWFrZVN0aWNreSA9IG9wdGlvbnM/LnN0aWNreSB8fCAodHlwZW9mIG9wdGlvbnM/LmluZGV4ID09PSAnbnVtYmVyJyAmJiB0aGlzLmlzU3RpY2t5KG9wdGlvbnMuaW5kZXgpKTtcblx0XHRjb25zdCBtYWtlUGlubmVkID0gb3B0aW9ucz8ucGlubmVkIHx8IG9wdGlvbnM/LnN0aWNreTtcblx0XHRjb25zdCBtYWtlVHJhbnNpZW50ID0gISFvcHRpb25zPy50cmFuc2llbnQ7XG5cdFx0Y29uc3QgbWFrZUFjdGl2ZSA9IG9wdGlvbnM/LmFjdGl2ZSB8fCAhdGhpcy5hY3RpdmVFZGl0b3IgfHwgKCFtYWtlUGlubmVkICYmIHRoaXMucHJldmlldyA9PT0gdGhpcy5hY3RpdmVFZGl0b3IpO1xuXG5cdFx0Y29uc3QgZXhpc3RpbmdFZGl0b3JBbmRJbmRleCA9IHRoaXMuZmluZEVkaXRvcihjYW5kaWRhdGUsIG9wdGlvbnMpO1xuXG5cdFx0Ly8gTmV3IGVkaXRvclxuXHRcdGlmICghZXhpc3RpbmdFZGl0b3JBbmRJbmRleCkge1xuXHRcdFx0Y29uc3QgbmV3RWRpdG9yID0gY2FuZGlkYXRlO1xuXHRcdFx0Y29uc3QgaW5kZXhPZkFjdGl2ZSA9IHRoaXMuaW5kZXhPZih0aGlzLmFjdGl2ZSk7XG5cblx0XHRcdC8vIEluc2VydCBpbnRvIHNwZWNpZmljIHBvc2l0aW9uXG5cdFx0XHRsZXQgdGFyZ2V0SW5kZXg6IG51bWJlcjtcblx0XHRcdGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLmluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHR0YXJnZXRJbmRleCA9IG9wdGlvbnMuaW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluc2VydCB0byB0aGUgQkVHSU5OSU5HXG5cdFx0XHRlbHNlIGlmICh0aGlzLmVkaXRvck9wZW5Qb3NpdGlvbmluZyA9PT0gRWRpdG9yT3BlblBvc2l0aW9uaW5nLkZJUlNUKSB7XG5cdFx0XHRcdHRhcmdldEluZGV4ID0gMDtcblxuXHRcdFx0XHQvLyBBbHdheXMgbWFrZSBzdXJlIHRhcmdldEluZGV4IGlzIGFmdGVyIHN0aWNreSBlZGl0b3JzXG5cdFx0XHRcdC8vIHVubGVzcyB3ZSBhcmUgZXhwbGljaXRseSB0b2xkIHRvIG1ha2UgdGhlIGVkaXRvciBzdGlja3lcblx0XHRcdFx0aWYgKCFtYWtlU3RpY2t5ICYmIHRoaXMuaXNTdGlja3kodGFyZ2V0SW5kZXgpKSB7XG5cdFx0XHRcdFx0dGFyZ2V0SW5kZXggPSB0aGlzLnN0aWNreSArIDE7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5zZXJ0IHRvIHRoZSBFTkRcblx0XHRcdGVsc2UgaWYgKHRoaXMuZWRpdG9yT3BlblBvc2l0aW9uaW5nID09PSBFZGl0b3JPcGVuUG9zaXRpb25pbmcuTEFTVCkge1xuXHRcdFx0XHR0YXJnZXRJbmRleCA9IHRoaXMuZWRpdG9ycy5sZW5ndGg7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluc2VydCB0byBMRUZUIG9yIFJJR0hUIG9mIGFjdGl2ZSBlZGl0b3Jcblx0XHRcdGVsc2Uge1xuXG5cdFx0XHRcdC8vIEluc2VydCB0byB0aGUgTEVGVCBvZiBhY3RpdmUgZWRpdG9yXG5cdFx0XHRcdGlmICh0aGlzLmVkaXRvck9wZW5Qb3NpdGlvbmluZyA9PT0gRWRpdG9yT3BlblBvc2l0aW9uaW5nLkxFRlQpIHtcblx0XHRcdFx0XHRpZiAoaW5kZXhPZkFjdGl2ZSA9PT0gMCB8fCAhdGhpcy5lZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0dGFyZ2V0SW5kZXggPSAwOyAvLyB0byB0aGUgbGVmdCBiZWNvbWluZyBmaXJzdCBlZGl0b3IgaW4gbGlzdFxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0YXJnZXRJbmRleCA9IGluZGV4T2ZBY3RpdmU7IC8vIHRvIHRoZSBsZWZ0IG9mIGFjdGl2ZSBlZGl0b3Jcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJbnNlcnQgdG8gdGhlIFJJR0hUIG9mIGFjdGl2ZSBlZGl0b3Jcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dGFyZ2V0SW5kZXggPSBpbmRleE9mQWN0aXZlICsgMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFsd2F5cyBtYWtlIHN1cmUgdGFyZ2V0SW5kZXggaXMgYWZ0ZXIgc3RpY2t5IGVkaXRvcnNcblx0XHRcdFx0Ly8gdW5sZXNzIHdlIGFyZSBleHBsaWNpdGx5IHRvbGQgdG8gbWFrZSB0aGUgZWRpdG9yIHN0aWNreVxuXHRcdFx0XHRpZiAoIW1ha2VTdGlja3kgJiYgdGhpcy5pc1N0aWNreSh0YXJnZXRJbmRleCkpIHtcblx0XHRcdFx0XHR0YXJnZXRJbmRleCA9IHRoaXMuc3RpY2t5ICsgMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB0aGUgZWRpdG9yIGJlY29tZXMgc3RpY2t5LCBpbmNyZW1lbnQgdGhlIHN0aWNreSBpbmRleCBhbmQgYWRqdXN0XG5cdFx0XHQvLyB0aGUgdGFyZ2V0SW5kZXggdG8gYmUgYXQgdGhlIGVuZCBvZiBzdGlja3kgZWRpdG9ycyB1bmxlc3MgYWxyZWFkeS5cblx0XHRcdGlmIChtYWtlU3RpY2t5KSB7XG5cdFx0XHRcdHRoaXMuc3RpY2t5Kys7XG5cblx0XHRcdFx0aWYgKCF0aGlzLmlzU3RpY2t5KHRhcmdldEluZGV4KSkge1xuXHRcdFx0XHRcdHRhcmdldEluZGV4ID0gdGhpcy5zdGlja3k7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSW5zZXJ0IGludG8gb3VyIGxpc3Qgb2YgZWRpdG9ycyBpZiBwaW5uZWQgb3Igd2UgaGF2ZSBubyBwcmV2aWV3IGVkaXRvclxuXHRcdFx0aWYgKG1ha2VQaW5uZWQgfHwgIXRoaXMucHJldmlldykge1xuXHRcdFx0XHR0aGlzLnNwbGljZSh0YXJnZXRJbmRleCwgZmFsc2UsIG5ld0VkaXRvcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSB0cmFuc2llbnRcblx0XHRcdGlmIChtYWtlVHJhbnNpZW50KSB7XG5cdFx0XHRcdHRoaXMuZG9TZXRUcmFuc2llbnQobmV3RWRpdG9yLCB0YXJnZXRJbmRleCwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSBwcmV2aWV3XG5cdFx0XHRpZiAoIW1ha2VQaW5uZWQpIHtcblxuXHRcdFx0XHQvLyBSZXBsYWNlIGV4aXN0aW5nIHByZXZpZXcgd2l0aCB0aGlzIGVkaXRvciBpZiB3ZSBoYXZlIGEgcHJldmlld1xuXHRcdFx0XHRpZiAodGhpcy5wcmV2aWV3KSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZXhPZlByZXZpZXcgPSB0aGlzLmluZGV4T2YodGhpcy5wcmV2aWV3KTtcblx0XHRcdFx0XHRpZiAodGFyZ2V0SW5kZXggPiBpbmRleE9mUHJldmlldykge1xuXHRcdFx0XHRcdFx0dGFyZ2V0SW5kZXgtLTsgLy8gYWNjb21tb2RhdGUgZm9yIHRoZSBmYWN0IHRoYXQgdGhlIHByZXZpZXcgZWRpdG9yIGNsb3Nlc1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMucmVwbGFjZUVkaXRvcih0aGlzLnByZXZpZXcsIG5ld0VkaXRvciwgdGFyZ2V0SW5kZXgsICFtYWtlQWN0aXZlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucHJldmlldyA9IG5ld0VkaXRvcjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTGlzdGVuZXJzXG5cdFx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yTGlzdGVuZXJzKG5ld0VkaXRvcik7XG5cblx0XHRcdC8vIEV2ZW50XG5cdFx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yT3BlbkV2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfT1BFTixcblx0XHRcdFx0ZWRpdG9yOiBuZXdFZGl0b3IsXG5cdFx0XHRcdGVkaXRvckluZGV4OiB0YXJnZXRJbmRleFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cblx0XHRcdC8vIEhhbmRsZSBhY3RpdmUgZWRpdG9yIC8gc2VsZWN0ZWQgZWRpdG9yc1xuXHRcdFx0dGhpcy5zZXRTZWxlY3Rpb24obWFrZUFjdGl2ZSA/IG5ld0VkaXRvciA6IHRoaXMuYWN0aXZlRWRpdG9yLCBvcHRpb25zPy5pbmFjdGl2ZVNlbGVjdGlvbiA/PyBbXSk7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVkaXRvcjogbmV3RWRpdG9yLFxuXHRcdFx0XHRpc05ldzogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBFeGlzdGluZyBlZGl0b3Jcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IFtleGlzdGluZ0VkaXRvciwgZXhpc3RpbmdFZGl0b3JJbmRleF0gPSBleGlzdGluZ0VkaXRvckFuZEluZGV4O1xuXG5cdFx0XHQvLyBVcGRhdGUgdHJhbnNpZW50IChleGlzdGluZyBlZGl0b3JzIGRvIG5vdCB0dXJuIHRyYW5zaWVudCBpZiB0aGV5IHdlcmUgbm90IGJlZm9yZSlcblx0XHRcdHRoaXMuZG9TZXRUcmFuc2llbnQoZXhpc3RpbmdFZGl0b3IsIGV4aXN0aW5nRWRpdG9ySW5kZXgsIG1ha2VUcmFuc2llbnQgPT09IGZhbHNlID8gZmFsc2UgOiB0aGlzLmlzVHJhbnNpZW50KGV4aXN0aW5nRWRpdG9yKSk7XG5cblx0XHRcdC8vIFBpbiBpdFxuXHRcdFx0aWYgKG1ha2VQaW5uZWQpIHtcblx0XHRcdFx0dGhpcy5kb1BpbihleGlzdGluZ0VkaXRvciwgZXhpc3RpbmdFZGl0b3JJbmRleCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEhhbmRsZSBhY3RpdmUgZWRpdG9yIC8gc2VsZWN0ZWQgZWRpdG9yc1xuXHRcdFx0dGhpcy5zZXRTZWxlY3Rpb24obWFrZUFjdGl2ZSA/IGV4aXN0aW5nRWRpdG9yIDogdGhpcy5hY3RpdmVFZGl0b3IsIG9wdGlvbnM/LmluYWN0aXZlU2VsZWN0aW9uID8/IFtdKTtcblxuXHRcdFx0Ly8gUmVzcGVjdCBpbmRleFxuXHRcdFx0aWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMuaW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHRoaXMubW92ZUVkaXRvcihleGlzdGluZ0VkaXRvciwgb3B0aW9ucy5pbmRleCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN0aWNrIGl0IChpbnRlbnRpb25hbGx5IGFmdGVyIHRoZSBtb3ZlRWRpdG9yIGNhbGwgaW4gY2FzZVxuXHRcdFx0Ly8gdGhlIGVkaXRvciB3YXMgYWxyZWFkeSBtb3ZlZCBpbnRvIHRoZSBzdGlja3kgcmFuZ2UpXG5cdFx0XHRpZiAobWFrZVN0aWNreSkge1xuXHRcdFx0XHR0aGlzLmRvU3RpY2soZXhpc3RpbmdFZGl0b3IsIHRoaXMuaW5kZXhPZihleGlzdGluZ0VkaXRvcikpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0b3I6IGV4aXN0aW5nRWRpdG9yLFxuXHRcdFx0XHRpc05ldzogZmFsc2Vcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckVkaXRvckxpc3RlbmVycyhlZGl0b3I6IEVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0Y29uc3QgbGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuZWRpdG9yTGlzdGVuZXJzLmFkZChsaXN0ZW5lcnMpO1xuXG5cdFx0Ly8gUmUtZW1pdCBkaXNwb3NhbCBvZiBlZGl0b3IgaW5wdXQgYXMgb3VyIG93biBldmVudFxuXHRcdGxpc3RlbmVycy5hZGQoRXZlbnQub25jZShlZGl0b3Iub25XaWxsRGlzcG9zZSkoKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9ySW5kZXggPSB0aGlzLmVkaXRvcnMuaW5kZXhPZihlZGl0b3IpO1xuXHRcdFx0aWYgKGVkaXRvckluZGV4ID49IDApIHtcblx0XHRcdFx0Y29uc3QgZXZlbnQ6IElHcm91cEVkaXRvckNoYW5nZUV2ZW50ID0ge1xuXHRcdFx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9XSUxMX0RJU1BPU0UsXG5cdFx0XHRcdFx0ZWRpdG9yLFxuXHRcdFx0XHRcdGVkaXRvckluZGV4XG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtRW1pdCBkaXJ0eSBzdGF0ZSBjaGFuZ2VzXG5cdFx0bGlzdGVuZXJzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VEaXJ0eSgoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9ESVJUWSxcblx0XHRcdFx0ZWRpdG9yLFxuXHRcdFx0XHRlZGl0b3JJbmRleDogdGhpcy5lZGl0b3JzLmluZGV4T2YoZWRpdG9yKVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtRW1pdCBsYWJlbCBjaGFuZ2VzXG5cdFx0bGlzdGVuZXJzLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9MQUJFTCxcblx0XHRcdFx0ZWRpdG9yLFxuXHRcdFx0XHRlZGl0b3JJbmRleDogdGhpcy5lZGl0b3JzLmluZGV4T2YoZWRpdG9yKVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtRW1pdCBjYXBhYmlsaXR5IGNoYW5nZXNcblx0XHRsaXN0ZW5lcnMuYWRkKGVkaXRvci5vbkRpZENoYW5nZUNhcGFiaWxpdGllcygoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9DQVBBQklMSVRJRVMsXG5cdFx0XHRcdGVkaXRvcixcblx0XHRcdFx0ZWRpdG9ySW5kZXg6IHRoaXMuZWRpdG9ycy5pbmRleE9mKGVkaXRvcilcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENsZWFuIHVwIGRpc3Bvc2UgbGlzdGVuZXJzIG9uY2UgdGhlIGVkaXRvciBnZXRzIGNsb3NlZFxuXHRcdGxpc3RlbmVycy5hZGQodGhpcy5vbkRpZE1vZGVsQ2hhbmdlKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5raW5kID09PSBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfQ0xPU0UgJiYgZXZlbnQuZWRpdG9yPy5tYXRjaGVzKGVkaXRvcikpIHtcblx0XHRcdFx0ZGlzcG9zZShsaXN0ZW5lcnMpO1xuXHRcdFx0XHR0aGlzLmVkaXRvckxpc3RlbmVycy5kZWxldGUobGlzdGVuZXJzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlcGxhY2VFZGl0b3IodG9SZXBsYWNlOiBFZGl0b3JJbnB1dCwgcmVwbGFjZVdpdGg6IEVkaXRvcklucHV0LCByZXBsYWNlSW5kZXg6IG51bWJlciwgb3Blbk5leHQgPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3QgY2xvc2VSZXN1bHQgPSB0aGlzLmRvQ2xvc2VFZGl0b3IodG9SZXBsYWNlLCBFZGl0b3JDbG9zZUNvbnRleHQuUkVQTEFDRSwgb3Blbk5leHQpOyAvLyBvcHRpbWl6YXRpb24gdG8gcHJldmVudCBtdWx0aXBsZSBzZXRBY3RpdmUoKSBpbiBvbmUgY2FsbFxuXG5cdFx0Ly8gV2Ugd2FudCB0byBmaXJzdCBhZGQgdGhlIG5ldyBlZGl0b3IgaW50byBvdXIgbW9kZWwgYmVmb3JlIGVtaXR0aW5nIHRoZSBjbG9zZSBldmVudCBiZWNhdXNlXG5cdFx0Ly8gZmlyaW5nIHRoZSBjbG9zZSBldmVudCBjYW4gdHJpZ2dlciBhIGRpc3Bvc2Ugb24gdGhlIHNhbWUgZWRpdG9yIHRoYXQgaXMgbm93IGJlaW5nIGFkZGVkLlxuXHRcdC8vIFRoaXMgY2FuIGxlYWQgaW50byBvcGVuaW5nIGEgZGlzcG9zZWQgZWRpdG9yIHdoaWNoIGlzIG5vdCB3aGF0IHdlIHdhbnQuXG5cdFx0dGhpcy5zcGxpY2UocmVwbGFjZUluZGV4LCBmYWxzZSwgcmVwbGFjZVdpdGgpO1xuXG5cdFx0aWYgKGNsb3NlUmVzdWx0KSB7XG5cdFx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2xvc2VFdmVudCA9IHtcblx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NMT1NFLFxuXHRcdFx0XHQuLi5jbG9zZVJlc3VsdFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xvc2VFZGl0b3IoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCwgY29udGV4dCA9IEVkaXRvckNsb3NlQ29udGV4dC5VTktOT1dOLCBvcGVuTmV4dCA9IHRydWUpOiBJRWRpdG9yQ2xvc2VSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNsb3NlUmVzdWx0ID0gdGhpcy5kb0Nsb3NlRWRpdG9yKGNhbmRpZGF0ZSwgY29udGV4dCwgb3Blbk5leHQpO1xuXG5cdFx0aWYgKGNsb3NlUmVzdWx0KSB7XG5cdFx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2xvc2VFdmVudCA9IHtcblx0XHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX0NMT1NFLFxuXHRcdFx0XHQuLi5jbG9zZVJlc3VsdFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cblx0XHRcdHJldHVybiBjbG9zZVJlc3VsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0Nsb3NlRWRpdG9yKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQsIGNvbnRleHQ6IEVkaXRvckNsb3NlQ29udGV4dCwgb3Blbk5leHQ6IGJvb2xlYW4pOiBJRWRpdG9yQ2xvc2VSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pbmRleE9mKGNhbmRpZGF0ZSk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gbm90IGZvdW5kXG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5lZGl0b3JzW2luZGV4XTtcblx0XHRjb25zdCBzdGlja3kgPSB0aGlzLmlzU3RpY2t5KGluZGV4KTtcblxuXHRcdC8vIEFjdGl2ZSBlZGl0b3IgY2xvc2VkXG5cdFx0Y29uc3QgaXNBY3RpdmVFZGl0b3IgPSB0aGlzLmFjdGl2ZSA9PT0gZWRpdG9yO1xuXHRcdGlmIChvcGVuTmV4dCAmJiBpc0FjdGl2ZUVkaXRvcikge1xuXG5cdFx0XHQvLyBNb3JlIHRoYW4gb25lIGVkaXRvclxuXHRcdFx0aWYgKHRoaXMubXJ1Lmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0bGV0IG5ld0FjdGl2ZTogRWRpdG9ySW5wdXQ7XG5cdFx0XHRcdGlmICh0aGlzLmZvY3VzUmVjZW50RWRpdG9yQWZ0ZXJDbG9zZSkge1xuXHRcdFx0XHRcdG5ld0FjdGl2ZSA9IHRoaXMubXJ1WzFdOyAvLyBhY3RpdmUgZWRpdG9yIGlzIGFsd2F5cyBmaXJzdCBpbiBNUlUsIHNvIHBpY2sgc2Vjb25kIGVkaXRvciBhZnRlciBhcyBuZXcgYWN0aXZlXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKGluZGV4ID09PSB0aGlzLmVkaXRvcnMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdFx0bmV3QWN0aXZlID0gdGhpcy5lZGl0b3JzW2luZGV4IC0gMV07IC8vIGxhc3QgZWRpdG9yIGlzIGNsb3NlZCwgcGljayBwcmV2aW91cyBhcyBuZXcgYWN0aXZlXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG5ld0FjdGl2ZSA9IHRoaXMuZWRpdG9yc1tpbmRleCArIDFdOyAvLyBwaWNrIG5leHQgZWRpdG9yIGFzIG5ldyBhY3RpdmVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTZWxlY3QgZWRpdG9yIGFzIGFjdGl2ZVxuXHRcdFx0XHRjb25zdCBuZXdJbmFjdGl2ZVNlbGVjdGVkRWRpdG9ycyA9IHRoaXMuc2VsZWN0aW9uLmZpbHRlcihzZWxlY3RlZCA9PiBzZWxlY3RlZCAhPT0gZWRpdG9yICYmIHNlbGVjdGVkICE9PSBuZXdBY3RpdmUpO1xuXHRcdFx0XHR0aGlzLmRvU2V0U2VsZWN0aW9uKG5ld0FjdGl2ZSwgdGhpcy5lZGl0b3JzLmluZGV4T2YobmV3QWN0aXZlKSwgbmV3SW5hY3RpdmVTZWxlY3RlZEVkaXRvcnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBMYXN0IGVkaXRvciBjbG9zZWQ6IGNsZWFyIHNlbGVjdGlvblxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMuZG9TZXRTZWxlY3Rpb24obnVsbCwgdW5kZWZpbmVkLCBbXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSW5hY3RpdmUgZWRpdG9yIGNsb3NlZFxuXHRcdGVsc2UgaWYgKCFpc0FjdGl2ZUVkaXRvcikge1xuXG5cdFx0XHQvLyBSZW1vdmUgZWRpdG9yIGZyb20gaW5hY3RpdmUgc2VsZWN0aW9uXG5cdFx0XHRpZiAodGhpcy5kb0lzU2VsZWN0ZWQoZWRpdG9yKSkge1xuXHRcdFx0XHRjb25zdCBuZXdJbmFjdGl2ZVNlbGVjdGVkRWRpdG9ycyA9IHRoaXMuc2VsZWN0aW9uLmZpbHRlcihzZWxlY3RlZCA9PiBzZWxlY3RlZCAhPT0gZWRpdG9yICYmIHNlbGVjdGVkICE9PSB0aGlzLmFjdGl2ZUVkaXRvcik7XG5cdFx0XHRcdHRoaXMuZG9TZXRTZWxlY3Rpb24odGhpcy5hY3RpdmVFZGl0b3IsIHRoaXMuaW5kZXhPZih0aGlzLmFjdGl2ZUVkaXRvciksIG5ld0luYWN0aXZlU2VsZWN0ZWRFZGl0b3JzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBQcmV2aWV3IEVkaXRvciBjbG9zZWRcblx0XHRpZiAodGhpcy5wcmV2aWV3ID09PSBlZGl0b3IpIHtcblx0XHRcdHRoaXMucHJldmlldyA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gdHJhbnNpZW50XG5cdFx0dGhpcy50cmFuc2llbnQuZGVsZXRlKGVkaXRvcik7XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBhcnJheXNcblx0XHR0aGlzLnNwbGljZShpbmRleCwgdHJ1ZSk7XG5cblx0XHQvLyBFdmVudFxuXHRcdHJldHVybiB7IGVkaXRvciwgc3RpY2t5LCBlZGl0b3JJbmRleDogaW5kZXgsIGNvbnRleHQgfTtcblx0fVxuXG5cdG1vdmVFZGl0b3IoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCwgdG9JbmRleDogbnVtYmVyKTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gRW5zdXJlIHRvSW5kZXggaXMgaW4gYm91bmRzIG9mIG91ciBtb2RlbFxuXHRcdGlmICh0b0luZGV4ID49IHRoaXMuZWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdHRvSW5kZXggPSB0aGlzLmVkaXRvcnMubGVuZ3RoIC0gMTtcblx0XHR9IGVsc2UgaWYgKHRvSW5kZXggPCAwKSB7XG5cdFx0XHR0b0luZGV4ID0gMDtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW5kZXhPZihjYW5kaWRhdGUpO1xuXHRcdGlmIChpbmRleCA8IDAgfHwgdG9JbmRleCA9PT0gaW5kZXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmVkaXRvcnNbaW5kZXhdO1xuXHRcdGNvbnN0IHN0aWNreSA9IHRoaXMuc3RpY2t5O1xuXG5cdFx0Ly8gQWRqdXN0IHN0aWNreSBpbmRleDogZWRpdG9yIG1vdmVkIG91dCBvZiBzdGlja3kgc3RhdGUgaW50byB1bnN0aWNreSBzdGF0ZVxuXHRcdGlmICh0aGlzLmlzU3RpY2t5KGluZGV4KSAmJiB0b0luZGV4ID4gdGhpcy5zdGlja3kpIHtcblx0XHRcdHRoaXMuc3RpY2t5LS07XG5cdFx0fVxuXG5cdFx0Ly8gLi4ub3IgZWRpdG9yIG1vdmVkIGludG8gc3RpY2t5IHN0YXRlIGZyb20gdW5zdGlja3kgc3RhdGVcblx0XHRlbHNlIGlmICghdGhpcy5pc1N0aWNreShpbmRleCkgJiYgdG9JbmRleCA8PSB0aGlzLnN0aWNreSkge1xuXHRcdFx0dGhpcy5zdGlja3krKztcblx0XHR9XG5cblx0XHQvLyBNb3ZlXG5cdFx0dGhpcy5lZGl0b3JzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0dGhpcy5lZGl0b3JzLnNwbGljZSh0b0luZGV4LCAwLCBlZGl0b3IpO1xuXG5cdFx0Ly8gTW92ZSBFdmVudFxuXHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBFZGl0b3JNb3ZlRXZlbnQgPSB7XG5cdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfTU9WRSxcblx0XHRcdGVkaXRvcixcblx0XHRcdG9sZEVkaXRvckluZGV4OiBpbmRleCxcblx0XHRcdGVkaXRvckluZGV4OiB0b0luZGV4XG5cdFx0fTtcblx0XHR0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXG5cdFx0Ly8gU3RpY2t5IEV2ZW50IChpZiBzdGlja3kgY2hhbmdlZCBhcyBwYXJ0IG9mIHRoZSBtb3ZlKVxuXHRcdGlmIChzdGlja3kgIT09IHRoaXMuc3RpY2t5KSB7XG5cdFx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9TVElDS1ksXG5cdFx0XHRcdGVkaXRvcixcblx0XHRcdFx0ZWRpdG9ySW5kZXg6IHRvSW5kZXhcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRzZXRBY3RpdmUoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCk6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgcmVzdWx0OiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblxuXHRcdGlmICghY2FuZGlkYXRlKSB7XG5cdFx0XHR0aGlzLnNldEdyb3VwQWN0aXZlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IHRoaXMuc2V0RWRpdG9yQWN0aXZlKGNhbmRpZGF0ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc2V0R3JvdXBBY3RpdmUoKTogdm9pZCB7XG5cdFx0Ly8gV2UgZG8gbm90IHJlYWxseSBrZWVwIHRoZSBgYWN0aXZlYCBzdGF0ZSBpbiBvdXIgbW9kZWwgYmVjYXVzZVxuXHRcdC8vIGl0IGhhcyBubyBzcGVjaWFsIG1lYW5pbmcgdG8gdXMgaGVyZS4gQnV0IGZvciBjb25zaXN0ZW5jeVxuXHRcdC8vIHdlIGVtaXQgYSBgb25EaWRNb2RlbENoYW5nZWAgZXZlbnQgc28gdGhhdCBjb21wb25lbnRzIGNhblxuXHRcdC8vIHJlYWN0LlxuXHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZSh7IGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0FDVElWRSB9KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0RWRpdG9yQWN0aXZlKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzID0gdGhpcy5maW5kRWRpdG9yKGNhbmRpZGF0ZSk7XG5cdFx0aWYgKCFyZXMpIHtcblx0XHRcdHJldHVybjsgLy8gbm90IGZvdW5kXG5cdFx0fVxuXG5cdFx0Y29uc3QgW2VkaXRvciwgZWRpdG9ySW5kZXhdID0gcmVzO1xuXG5cdFx0dGhpcy5kb1NldFNlbGVjdGlvbihlZGl0b3IsIGVkaXRvckluZGV4LCBbXSk7XG5cblx0XHRyZXR1cm4gZWRpdG9yO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGVkRWRpdG9ycygpOiBFZGl0b3JJbnB1dFtdIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JzLmZpbHRlcihlZGl0b3IgPT4gdGhpcy5kb0lzU2VsZWN0ZWQoZWRpdG9yKSk7IC8vIHJldHVybiBpbiBzZXF1ZW50aWFsIG9yZGVyXG5cdH1cblxuXHRpc1NlbGVjdGVkKGVkaXRvckNhbmRpZGF0ZU9ySW5kZXg6IEVkaXRvcklucHV0IHwgbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0bGV0IGVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBlZGl0b3JDYW5kaWRhdGVPckluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0ZWRpdG9yID0gdGhpcy5lZGl0b3JzW2VkaXRvckNhbmRpZGF0ZU9ySW5kZXhdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlZGl0b3IgPSB0aGlzLmZpbmRFZGl0b3IoZWRpdG9yQ2FuZGlkYXRlT3JJbmRleCk/LlswXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISFlZGl0b3IgJiYgdGhpcy5kb0lzU2VsZWN0ZWQoZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgZG9Jc1NlbGVjdGVkKGVkaXRvcjogRWRpdG9ySW5wdXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zZWxlY3Rpb24uaW5jbHVkZXMoZWRpdG9yKTtcblx0fVxuXG5cdHNldFNlbGVjdGlvbihhY3RpdmVTZWxlY3RlZEVkaXRvckNhbmRpZGF0ZTogRWRpdG9ySW5wdXQsIGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JDYW5kaWRhdGVzOiBFZGl0b3JJbnB1dFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzID0gdGhpcy5maW5kRWRpdG9yKGFjdGl2ZVNlbGVjdGVkRWRpdG9yQ2FuZGlkYXRlKTtcblx0XHRpZiAoIXJlcykge1xuXHRcdFx0cmV0dXJuOyAvLyBub3QgZm91bmRcblx0XHR9XG5cblx0XHRjb25zdCBbYWN0aXZlU2VsZWN0ZWRFZGl0b3IsIGFjdGl2ZVNlbGVjdGVkRWRpdG9ySW5kZXhdID0gcmVzO1xuXG5cdFx0Y29uc3QgaW5hY3RpdmVTZWxlY3RlZEVkaXRvcnMgPSBuZXcgU2V0PEVkaXRvcklucHV0PigpO1xuXHRcdGZvciAoY29uc3QgaW5hY3RpdmVTZWxlY3RlZEVkaXRvckNhbmRpZGF0ZSBvZiBpbmFjdGl2ZVNlbGVjdGVkRWRpdG9yQ2FuZGlkYXRlcykge1xuXHRcdFx0Y29uc3QgcmVzID0gdGhpcy5maW5kRWRpdG9yKGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JDYW5kaWRhdGUpO1xuXHRcdFx0aWYgKCFyZXMpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBub3QgZm91bmRcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgW2luYWN0aXZlU2VsZWN0ZWRFZGl0b3JdID0gcmVzO1xuXHRcdFx0aWYgKGluYWN0aXZlU2VsZWN0ZWRFZGl0b3IgPT09IGFjdGl2ZVNlbGVjdGVkRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBhbHJlYWR5IHNlbGVjdGVkXG5cdFx0XHR9XG5cblx0XHRcdGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JzLmFkZChpbmFjdGl2ZVNlbGVjdGVkRWRpdG9yKTtcblx0XHR9XG5cblx0XHR0aGlzLmRvU2V0U2VsZWN0aW9uKGFjdGl2ZVNlbGVjdGVkRWRpdG9yLCBhY3RpdmVTZWxlY3RlZEVkaXRvckluZGV4LCBBcnJheS5mcm9tKGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JzKSk7XG5cdH1cblxuXHRwcml2YXRlIGRvU2V0U2VsZWN0aW9uKGFjdGl2ZVNlbGVjdGVkRWRpdG9yOiBFZGl0b3JJbnB1dCB8IG51bGwsIGFjdGl2ZVNlbGVjdGVkRWRpdG9ySW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgaW5hY3RpdmVTZWxlY3RlZEVkaXRvcnM6IEVkaXRvcklucHV0W10pOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c0FjdGl2ZUVkaXRvciA9IHRoaXMuYWN0aXZlRWRpdG9yO1xuXHRcdGNvbnN0IHByZXZpb3VzU2VsZWN0aW9uID0gdGhpcy5zZWxlY3Rpb247XG5cblx0XHRsZXQgbmV3U2VsZWN0aW9uOiBFZGl0b3JJbnB1dFtdO1xuXHRcdGlmIChhY3RpdmVTZWxlY3RlZEVkaXRvcikge1xuXHRcdFx0bmV3U2VsZWN0aW9uID0gW2FjdGl2ZVNlbGVjdGVkRWRpdG9yLCAuLi5pbmFjdGl2ZVNlbGVjdGVkRWRpdG9yc107XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld1NlbGVjdGlvbiA9IFtdO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBzZWxlY3Rpb25cblx0XHR0aGlzLnNlbGVjdGlvbiA9IG5ld1NlbGVjdGlvbjtcblxuXHRcdC8vIFVwZGF0ZSBhY3RpdmUgZWRpdG9yIGlmIGl0IGhhcyBjaGFuZ2VkXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yQ2hhbmdlZCA9IGFjdGl2ZVNlbGVjdGVkRWRpdG9yICYmIHR5cGVvZiBhY3RpdmVTZWxlY3RlZEVkaXRvckluZGV4ID09PSAnbnVtYmVyJyAmJiBwcmV2aW91c0FjdGl2ZUVkaXRvciAhPT0gYWN0aXZlU2VsZWN0ZWRFZGl0b3I7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvckNoYW5nZWQpIHtcblxuXHRcdFx0Ly8gQnJpbmcgdG8gZnJvbnQgaW4gTVJVIGxpc3Rcblx0XHRcdGNvbnN0IG1ydUluZGV4ID0gdGhpcy5pbmRleE9mKGFjdGl2ZVNlbGVjdGVkRWRpdG9yLCB0aGlzLm1ydSk7XG5cdFx0XHR0aGlzLm1ydS5zcGxpY2UobXJ1SW5kZXgsIDEpO1xuXHRcdFx0dGhpcy5tcnUudW5zaGlmdChhY3RpdmVTZWxlY3RlZEVkaXRvcik7XG5cblx0XHRcdC8vIEV2ZW50XG5cdFx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRcdGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkVESVRPUl9BQ1RJVkUsXG5cdFx0XHRcdGVkaXRvcjogYWN0aXZlU2VsZWN0ZWRFZGl0b3IsXG5cdFx0XHRcdGVkaXRvckluZGV4OiBhY3RpdmVTZWxlY3RlZEVkaXRvckluZGV4XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblx0XHR9XG5cblx0XHQvLyBGaXJlIGV2ZW50IGlmIHRoZSBzZWxlY3Rpb24gaGFzIGNoYW5nZWRcblx0XHRpZiAoXG5cdFx0XHRhY3RpdmVFZGl0b3JDaGFuZ2VkIHx8XG5cdFx0XHRwcmV2aW91c1NlbGVjdGlvbi5sZW5ndGggIT09IG5ld1NlbGVjdGlvbi5sZW5ndGggfHxcblx0XHRcdHByZXZpb3VzU2VsZWN0aW9uLnNvbWUoZWRpdG9yID0+ICFuZXdTZWxlY3Rpb24uaW5jbHVkZXMoZWRpdG9yKSlcblx0XHQpIHtcblx0XHRcdGNvbnN0IGV2ZW50OiBJR3JvdXBNb2RlbENoYW5nZUV2ZW50ID0ge1xuXHRcdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JTX1NFTEVDVElPTlxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0SW5kZXgoaW5kZXg6IG51bWJlcikge1xuXHRcdC8vIFdlIGRvIG5vdCByZWFsbHkga2VlcCB0aGUgYGluZGV4YCBpbiBvdXIgbW9kZWwgYmVjYXVzZVxuXHRcdC8vIGl0IGhhcyBubyBzcGVjaWFsIG1lYW5pbmcgdG8gdXMgaGVyZS4gQnV0IGZvciBjb25zaXN0ZW5jeVxuXHRcdC8vIHdlIGVtaXQgYSBgb25EaWRNb2RlbENoYW5nZWAgZXZlbnQgc28gdGhhdCBjb21wb25lbnRzIGNhblxuXHRcdC8vIHJlYWN0LlxuXHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZSh7IGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0lOREVYIH0pO1xuXHR9XG5cblx0c2V0TGFiZWwobGFiZWw6IHN0cmluZykge1xuXHRcdC8vIFdlIGRvIG5vdCByZWFsbHkga2VlcCB0aGUgYGxhYmVsYCBpbiBvdXIgbW9kZWwgYmVjYXVzZVxuXHRcdC8vIGl0IGhhcyBubyBzcGVjaWFsIG1lYW5pbmcgdG8gdXMgaGVyZS4gQnV0IGZvciBjb25zaXN0ZW5jeVxuXHRcdC8vIHdlIGVtaXQgYSBgb25EaWRNb2RlbENoYW5nZWAgZXZlbnQgc28gdGhhdCBjb21wb25lbnRzIGNhblxuXHRcdC8vIHJlYWN0LlxuXHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZSh7IGtpbmQ6IEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0xBQkVMIH0pO1xuXHR9XG5cblx0cGluKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzID0gdGhpcy5maW5kRWRpdG9yKGNhbmRpZGF0ZSk7XG5cdFx0aWYgKCFyZXMpIHtcblx0XHRcdHJldHVybjsgLy8gbm90IGZvdW5kXG5cdFx0fVxuXG5cdFx0Y29uc3QgW2VkaXRvciwgZWRpdG9ySW5kZXhdID0gcmVzO1xuXG5cdFx0dGhpcy5kb1BpbihlZGl0b3IsIGVkaXRvckluZGV4KTtcblxuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRwcml2YXRlIGRvUGluKGVkaXRvcjogRWRpdG9ySW5wdXQsIGVkaXRvckluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc1Bpbm5lZChlZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47IC8vIGNhbiBvbmx5IHBpbiBhIHByZXZpZXcgZWRpdG9yXG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgVHJhbnNpZW50XG5cdFx0dGhpcy5zZXRUcmFuc2llbnQoZWRpdG9yLCBmYWxzZSk7XG5cblx0XHQvLyBDb252ZXJ0IHRoZSBwcmV2aWV3IGVkaXRvciB0byBiZSBhIHBpbm5lZCBlZGl0b3Jcblx0XHR0aGlzLnByZXZpZXcgPSBudWxsO1xuXG5cdFx0Ly8gRXZlbnRcblx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfUElOLFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0ZWRpdG9ySW5kZXhcblx0XHR9O1xuXHRcdHRoaXMuX29uRGlkTW9kZWxDaGFuZ2UuZmlyZShldmVudCk7XG5cdH1cblxuXHR1bnBpbihjYW5kaWRhdGU6IEVkaXRvcklucHV0KTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlcyA9IHRoaXMuZmluZEVkaXRvcihjYW5kaWRhdGUpO1xuXHRcdGlmICghcmVzKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdCBmb3VuZFxuXHRcdH1cblxuXHRcdGNvbnN0IFtlZGl0b3IsIGVkaXRvckluZGV4XSA9IHJlcztcblxuXHRcdHRoaXMuZG9VbnBpbihlZGl0b3IsIGVkaXRvckluZGV4KTtcblxuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRwcml2YXRlIGRvVW5waW4oZWRpdG9yOiBFZGl0b3JJbnB1dCwgZWRpdG9ySW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1Bpbm5lZChlZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47IC8vIGNhbiBvbmx5IHVucGluIGEgcGlubmVkIGVkaXRvclxuXHRcdH1cblxuXHRcdC8vIFNldCBuZXdcblx0XHRjb25zdCBvbGRQcmV2aWV3ID0gdGhpcy5wcmV2aWV3O1xuXHRcdHRoaXMucHJldmlldyA9IGVkaXRvcjtcblxuXHRcdC8vIEV2ZW50XG5cdFx0Y29uc3QgZXZlbnQ6IElHcm91cEVkaXRvckNoYW5nZUV2ZW50ID0ge1xuXHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1BJTixcblx0XHRcdGVkaXRvcixcblx0XHRcdGVkaXRvckluZGV4XG5cdFx0fTtcblx0XHR0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXG5cdFx0Ly8gQ2xvc2Ugb2xkIHByZXZpZXcgZWRpdG9yIGlmIGFueVxuXHRcdGlmIChvbGRQcmV2aWV3KSB7XG5cdFx0XHR0aGlzLmNsb3NlRWRpdG9yKG9sZFByZXZpZXcsIEVkaXRvckNsb3NlQ29udGV4dC5VTlBJTik7XG5cdFx0fVxuXHR9XG5cblx0aXNQaW5uZWQoZWRpdG9yQ2FuZGlkYXRlT3JJbmRleDogRWRpdG9ySW5wdXQgfCBudW1iZXIpOiBib29sZWFuIHtcblx0XHRsZXQgZWRpdG9yOiBFZGl0b3JJbnB1dDtcblx0XHRpZiAodHlwZW9mIGVkaXRvckNhbmRpZGF0ZU9ySW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRlZGl0b3IgPSB0aGlzLmVkaXRvcnNbZWRpdG9yQ2FuZGlkYXRlT3JJbmRleF07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVkaXRvciA9IGVkaXRvckNhbmRpZGF0ZU9ySW5kZXg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICF0aGlzLm1hdGNoZXModGhpcy5wcmV2aWV3LCBlZGl0b3IpO1xuXHR9XG5cblx0c3RpY2soY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCk6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXMgPSB0aGlzLmZpbmRFZGl0b3IoY2FuZGlkYXRlKTtcblx0XHRpZiAoIXJlcykge1xuXHRcdFx0cmV0dXJuOyAvLyBub3QgZm91bmRcblx0XHR9XG5cblx0XHRjb25zdCBbZWRpdG9yLCBlZGl0b3JJbmRleF0gPSByZXM7XG5cblx0XHR0aGlzLmRvU3RpY2soZWRpdG9yLCBlZGl0b3JJbmRleCk7XG5cblx0XHRyZXR1cm4gZWRpdG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1N0aWNrKGVkaXRvcjogRWRpdG9ySW5wdXQsIGVkaXRvckluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc1N0aWNreShlZGl0b3JJbmRleCkpIHtcblx0XHRcdHJldHVybjsgLy8gY2FuIG9ubHkgc3RpY2sgYSBub24tc3RpY2t5IGVkaXRvclxuXHRcdH1cblxuXHRcdC8vIFBpbiBlZGl0b3Jcblx0XHR0aGlzLnBpbihlZGl0b3IpO1xuXG5cdFx0Ly8gTW92ZSBlZGl0b3IgdG8gYmUgdGhlIGxhc3Qgc3RpY2t5IGVkaXRvclxuXHRcdGNvbnN0IG5ld0VkaXRvckluZGV4ID0gdGhpcy5zdGlja3kgKyAxO1xuXHRcdHRoaXMubW92ZUVkaXRvcihlZGl0b3IsIG5ld0VkaXRvckluZGV4KTtcblxuXHRcdC8vIEFkanVzdCBzdGlja3kgaW5kZXhcblx0XHR0aGlzLnN0aWNreSsrO1xuXG5cdFx0Ly8gRXZlbnRcblx0XHRjb25zdCBldmVudDogSUdyb3VwRWRpdG9yQ2hhbmdlRXZlbnQgPSB7XG5cdFx0XHRraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5FRElUT1JfU1RJQ0tZLFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0ZWRpdG9ySW5kZXg6IG5ld0VkaXRvckluZGV4XG5cdFx0fTtcblx0XHR0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0dW5zdGljayhjYW5kaWRhdGU6IEVkaXRvcklucHV0KTogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlcyA9IHRoaXMuZmluZEVkaXRvcihjYW5kaWRhdGUpO1xuXHRcdGlmICghcmVzKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdCBmb3VuZFxuXHRcdH1cblxuXHRcdGNvbnN0IFtlZGl0b3IsIGVkaXRvckluZGV4XSA9IHJlcztcblxuXHRcdHRoaXMuZG9VbnN0aWNrKGVkaXRvciwgZWRpdG9ySW5kZXgpO1xuXG5cdFx0cmV0dXJuIGVkaXRvcjtcblx0fVxuXG5cdHByaXZhdGUgZG9VbnN0aWNrKGVkaXRvcjogRWRpdG9ySW5wdXQsIGVkaXRvckluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaXNTdGlja3koZWRpdG9ySW5kZXgpKSB7XG5cdFx0XHRyZXR1cm47IC8vIGNhbiBvbmx5IHVuc3RpY2sgYSBzdGlja3kgZWRpdG9yXG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSBlZGl0b3IgdG8gYmUgdGhlIGZpcnN0IG5vbi1zdGlja3kgZWRpdG9yXG5cdFx0Y29uc3QgbmV3RWRpdG9ySW5kZXggPSB0aGlzLnN0aWNreTtcblx0XHR0aGlzLm1vdmVFZGl0b3IoZWRpdG9yLCBuZXdFZGl0b3JJbmRleCk7XG5cblx0XHQvLyBBZGp1c3Qgc3RpY2t5IGluZGV4XG5cdFx0dGhpcy5zdGlja3ktLTtcblxuXHRcdC8vIEV2ZW50XG5cdFx0Y29uc3QgZXZlbnQ6IElHcm91cEVkaXRvckNoYW5nZUV2ZW50ID0ge1xuXHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1NUSUNLWSxcblx0XHRcdGVkaXRvcixcblx0XHRcdGVkaXRvckluZGV4OiBuZXdFZGl0b3JJbmRleFxuXHRcdH07XG5cdFx0dGhpcy5fb25EaWRNb2RlbENoYW5nZS5maXJlKGV2ZW50KTtcblx0fVxuXG5cdGlzU3RpY2t5KGNhbmRpZGF0ZU9ySW5kZXg6IEVkaXRvcklucHV0IHwgbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuc3RpY2t5IDwgMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBubyBzdGlja3kgZWRpdG9yXG5cdFx0fVxuXG5cdFx0bGV0IGluZGV4OiBudW1iZXI7XG5cdFx0aWYgKHR5cGVvZiBjYW5kaWRhdGVPckluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0aW5kZXggPSBjYW5kaWRhdGVPckluZGV4O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbmRleCA9IHRoaXMuaW5kZXhPZihjYW5kaWRhdGVPckluZGV4KTtcblx0XHR9XG5cblx0XHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZGV4IDw9IHRoaXMuc3RpY2t5O1xuXHR9XG5cblx0c2V0VHJhbnNpZW50KGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQsIHRyYW5zaWVudDogYm9vbGVhbik6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRyYW5zaWVudCAmJiB0aGlzLnRyYW5zaWVudC5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vIHRyYW5zaWVudCBlZGl0b3Jcblx0XHR9XG5cblx0XHRjb25zdCByZXMgPSB0aGlzLmZpbmRFZGl0b3IoY2FuZGlkYXRlKTtcblx0XHRpZiAoIXJlcykge1xuXHRcdFx0cmV0dXJuOyAvLyBub3QgZm91bmRcblx0XHR9XG5cblx0XHRjb25zdCBbZWRpdG9yLCBlZGl0b3JJbmRleF0gPSByZXM7XG5cblx0XHR0aGlzLmRvU2V0VHJhbnNpZW50KGVkaXRvciwgZWRpdG9ySW5kZXgsIHRyYW5zaWVudCk7XG5cblx0XHRyZXR1cm4gZWRpdG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NldFRyYW5zaWVudChlZGl0b3I6IEVkaXRvcklucHV0LCBlZGl0b3JJbmRleDogbnVtYmVyLCB0cmFuc2llbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodHJhbnNpZW50KSB7XG5cdFx0XHRpZiAodGhpcy50cmFuc2llbnQuaGFzKGVkaXRvcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRyYW5zaWVudC5hZGQoZWRpdG9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCF0aGlzLnRyYW5zaWVudC5oYXMoZWRpdG9yKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJhbnNpZW50LmRlbGV0ZShlZGl0b3IpO1xuXHRcdH1cblxuXHRcdC8vIEV2ZW50XG5cdFx0Y29uc3QgZXZlbnQ6IElHcm91cEVkaXRvckNoYW5nZUV2ZW50ID0ge1xuXHRcdFx0a2luZDogR3JvdXBNb2RlbENoYW5nZUtpbmQuRURJVE9SX1RSQU5TSUVOVCxcblx0XHRcdGVkaXRvcixcblx0XHRcdGVkaXRvckluZGV4XG5cdFx0fTtcblx0XHR0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0aXNUcmFuc2llbnQoZWRpdG9yQ2FuZGlkYXRlT3JJbmRleDogRWRpdG9ySW5wdXQgfCBudW1iZXIpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy50cmFuc2llbnQuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBubyB0cmFuc2llbnQgZWRpdG9yXG5cdFx0fVxuXG5cdFx0bGV0IGVkaXRvcjogRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBlZGl0b3JDYW5kaWRhdGVPckluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0ZWRpdG9yID0gdGhpcy5lZGl0b3JzW2VkaXRvckNhbmRpZGF0ZU9ySW5kZXhdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlZGl0b3IgPSB0aGlzLmZpbmRFZGl0b3IoZWRpdG9yQ2FuZGlkYXRlT3JJbmRleCk/LlswXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gISFlZGl0b3IgJiYgdGhpcy50cmFuc2llbnQuaGFzKGVkaXRvcik7XG5cdH1cblxuXHRwcml2YXRlIHNwbGljZShpbmRleDogbnVtYmVyLCBkZWw6IGJvb2xlYW4sIGVkaXRvcj86IEVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yVG9EZWxldGVPclJlcGxhY2UgPSB0aGlzLmVkaXRvcnNbaW5kZXhdO1xuXG5cdFx0Ly8gUGVyZm9ybSBvbiBzdGlja3kgaW5kZXhcblx0XHRpZiAoZGVsICYmIHRoaXMuaXNTdGlja3koaW5kZXgpKSB7XG5cdFx0XHR0aGlzLnN0aWNreS0tO1xuXHRcdH1cblxuXHRcdC8vIFBlcmZvcm0gb24gZWRpdG9ycyBhcnJheVxuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdHRoaXMuZWRpdG9ycy5zcGxpY2UoaW5kZXgsIGRlbCA/IDEgOiAwLCBlZGl0b3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRvcnMuc3BsaWNlKGluZGV4LCBkZWwgPyAxIDogMCk7XG5cdFx0fVxuXG5cdFx0Ly8gUGVyZm9ybSBvbiBNUlVcblx0XHR7XG5cdFx0XHQvLyBBZGRcblx0XHRcdGlmICghZGVsICYmIGVkaXRvcikge1xuXHRcdFx0XHRpZiAodGhpcy5tcnUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gdGhlIGxpc3Qgb2YgbW9zdCByZWNlbnQgZWRpdG9ycyBpcyBlbXB0eVxuXHRcdFx0XHRcdC8vIHNvIHRoaXMgZWRpdG9yIGNhbiBvbmx5IGJlIHRoZSBtb3N0IHJlY2VudFxuXHRcdFx0XHRcdHRoaXMubXJ1LnB1c2goZWRpdG9yKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyB3ZSBoYXZlIG1vc3QgcmVjZW50IGVkaXRvcnMuIGFzIHN1Y2ggd2Vcblx0XHRcdFx0XHQvLyBwdXQgdGhpcyBuZXdseSBvcGVuZWQgZWRpdG9yIHJpZ2h0IGFmdGVyXG5cdFx0XHRcdFx0Ly8gdGhlIGN1cnJlbnQgbW9zdCByZWNlbnQgb25lIGJlY2F1c2UgaXQgY2Fubm90XG5cdFx0XHRcdFx0Ly8gYmUgdGhlIG1vc3QgcmVjZW50bHkgYWN0aXZlIG9uZSB1bmxlc3Ncblx0XHRcdFx0XHQvLyBpdCBiZWNvbWVzIGFjdGl2ZS4gYnV0IGl0IGlzIHN0aWxsIG1vcmVcblx0XHRcdFx0XHQvLyBhY3RpdmUgdGhlbiBhbnkgb3RoZXIgZWRpdG9yIGluIHRoZSBsaXN0LlxuXHRcdFx0XHRcdHRoaXMubXJ1LnNwbGljZSgxLCAwLCBlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbW92ZSAvIFJlcGxhY2Vcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpbmRleEluTVJVID0gdGhpcy5pbmRleE9mKGVkaXRvclRvRGVsZXRlT3JSZXBsYWNlLCB0aGlzLm1ydSk7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlXG5cdFx0XHRcdGlmIChkZWwgJiYgIWVkaXRvcikge1xuXHRcdFx0XHRcdHRoaXMubXJ1LnNwbGljZShpbmRleEluTVJVLCAxKTsgLy8gcmVtb3ZlIGZyb20gTVJVXG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZXBsYWNlXG5cdFx0XHRcdGVsc2UgaWYgKGRlbCAmJiBlZGl0b3IpIHtcblx0XHRcdFx0XHR0aGlzLm1ydS5zcGxpY2UoaW5kZXhJbk1SVSwgMSwgZWRpdG9yKTsgLy8gcmVwbGFjZSBNUlUgYXQgbG9jYXRpb25cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGluZGV4T2YoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQgfCBudWxsLCBlZGl0b3JzID0gdGhpcy5lZGl0b3JzLCBvcHRpb25zPzogSU1hdGNoRWRpdG9yT3B0aW9ucyk6IG51bWJlciB7XG5cdFx0bGV0IGluZGV4ID0gLTE7XG5cdFx0aWYgKCFjYW5kaWRhdGUpIHtcblx0XHRcdHJldHVybiBpbmRleDtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVkaXRvcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvcnNbaV07XG5cblx0XHRcdGlmICh0aGlzLm1hdGNoZXMoZWRpdG9yLCBjYW5kaWRhdGUsIG9wdGlvbnMpKSB7XG5cdFx0XHRcdC8vIElmIHdlIGFyZSB0byBzdXBwb3J0IHNpZGUgYnkgc2lkZSBtYXRjaGluZywgaXQgaXMgcG9zc2libGUgdGhhdFxuXHRcdFx0XHQvLyBhIGJldHRlciBkaXJlY3QgbWF0Y2ggaXMgZm91bmQgbGF0ZXIuIEFzIHN1Y2gsIHdlIGNvbnRpbnVlIGZpbmRpbmdcblx0XHRcdFx0Ly8gYSBtYXRjaGluZyBlZGl0b3IgYW5kIHByZWZlciB0aGF0IG1hdGNoIG92ZXIgdGhlIHNpZGUgYnkgc2lkZSBvbmUuXG5cdFx0XHRcdGlmIChvcHRpb25zPy5zdXBwb3J0U2lkZUJ5U2lkZSAmJiBlZGl0b3IgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgJiYgIShjYW5kaWRhdGUgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRcdFx0aW5kZXggPSBpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGluZGV4ID0gaTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBpbmRleDtcblx0fVxuXG5cdGZpbmRFZGl0b3IoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IG51bGwsIG9wdGlvbnM/OiBJTWF0Y2hFZGl0b3JPcHRpb25zKTogW0VkaXRvcklucHV0LCBudW1iZXIgLyogaW5kZXggKi9dIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuaW5kZXhPZihjYW5kaWRhdGUsIHRoaXMuZWRpdG9ycywgb3B0aW9ucyk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gW3RoaXMuZWRpdG9yc1tpbmRleF0sIGluZGV4XTtcblx0fVxuXG5cdGlzRmlyc3QoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IG51bGwsIGVkaXRvcnMgPSB0aGlzLmVkaXRvcnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tYXRjaGVzKGVkaXRvcnNbMF0sIGNhbmRpZGF0ZSk7XG5cdH1cblxuXHRpc0xhc3QoY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IG51bGwsIGVkaXRvcnMgPSB0aGlzLmVkaXRvcnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tYXRjaGVzKGVkaXRvcnNbZWRpdG9ycy5sZW5ndGggLSAxXSwgY2FuZGlkYXRlKTtcblx0fVxuXG5cdGNvbnRhaW5zKGNhbmRpZGF0ZTogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0LCBvcHRpb25zPzogSU1hdGNoRWRpdG9yT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmluZGV4T2YoY2FuZGlkYXRlLCB0aGlzLmVkaXRvcnMsIG9wdGlvbnMpICE9PSAtMTtcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hlcyhlZGl0b3I6IEVkaXRvcklucHV0IHwgbnVsbCB8IHVuZGVmaW5lZCwgY2FuZGlkYXRlOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQgfCBudWxsLCBvcHRpb25zPzogSU1hdGNoRWRpdG9yT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGlmICghZWRpdG9yIHx8ICFjYW5kaWRhdGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucz8uc3VwcG9ydFNpZGVCeVNpZGUgJiYgZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0ICYmICEoY2FuZGlkYXRlIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSkge1xuXHRcdFx0c3dpdGNoIChvcHRpb25zLnN1cHBvcnRTaWRlQnlTaWRlKSB7XG5cdFx0XHRcdGNhc2UgU2lkZUJ5U2lkZUVkaXRvci5BTlk6XG5cdFx0XHRcdFx0aWYgKHRoaXMubWF0Y2hlcyhlZGl0b3IucHJpbWFyeSwgY2FuZGlkYXRlLCBvcHRpb25zKSB8fCB0aGlzLm1hdGNoZXMoZWRpdG9yLnNlY29uZGFyeSwgY2FuZGlkYXRlLCBvcHRpb25zKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNpZGVCeVNpZGVFZGl0b3IuQk9USDpcblx0XHRcdFx0XHRpZiAodGhpcy5tYXRjaGVzKGVkaXRvci5wcmltYXJ5LCBjYW5kaWRhdGUsIG9wdGlvbnMpICYmIHRoaXMubWF0Y2hlcyhlZGl0b3Iuc2Vjb25kYXJ5LCBjYW5kaWRhdGUsIG9wdGlvbnMpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RyaWN0RXF1YWxzID0gZWRpdG9yID09PSBjYW5kaWRhdGU7XG5cblx0XHRpZiAob3B0aW9ucz8uc3RyaWN0RXF1YWxzKSB7XG5cdFx0XHRyZXR1cm4gc3RyaWN0RXF1YWxzO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdHJpY3RFcXVhbHMgfHwgZWRpdG9yLm1hdGNoZXMoY2FuZGlkYXRlKTtcblx0fVxuXG5cdGdldCBpc0xvY2tlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5sb2NrZWQ7XG5cdH1cblxuXHRsb2NrKGxvY2tlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzTG9ja2VkICE9PSBsb2NrZWQpIHtcblx0XHRcdHRoaXMubG9ja2VkID0gbG9ja2VkO1xuXG5cdFx0XHR0aGlzLl9vbkRpZE1vZGVsQ2hhbmdlLmZpcmUoeyBraW5kOiBHcm91cE1vZGVsQ2hhbmdlS2luZC5HUk9VUF9MT0NLRUQgfSk7XG5cdFx0fVxuXHR9XG5cblx0Y2xvbmUoKTogRWRpdG9yR3JvdXBNb2RlbCB7XG5cdFx0Y29uc3QgY2xvbmUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRvckdyb3VwTW9kZWwsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBDb3B5IG92ZXIgZ3JvdXAgcHJvcGVydGllc1xuXHRcdGNsb25lLmVkaXRvcnMgPSB0aGlzLmVkaXRvcnMuc2xpY2UoMCk7XG5cdFx0Y2xvbmUubXJ1ID0gdGhpcy5tcnUuc2xpY2UoMCk7XG5cdFx0Y2xvbmUucHJldmlldyA9IHRoaXMucHJldmlldztcblx0XHRjbG9uZS5zZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGlvbi5zbGljZSgwKTtcblx0XHRjbG9uZS5zdGlja3kgPSB0aGlzLnN0aWNreTtcblxuXHRcdC8vIEVuc3VyZSB0byByZWdpc3RlciBsaXN0ZW5lcnMgZm9yIGVhY2ggZWRpdG9yXG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgY2xvbmUuZWRpdG9ycykge1xuXHRcdFx0Y2xvbmUucmVnaXN0ZXJFZGl0b3JMaXN0ZW5lcnMoZWRpdG9yKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2xvbmU7XG5cdH1cblxuXHRzZXJpYWxpemUoKTogSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsIHtcblx0XHRjb25zdCByZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSk7XG5cblx0XHQvLyBTZXJpYWxpemUgYWxsIGVkaXRvciBpbnB1dHMgc28gdGhhdCB3ZSBjYW4gc3RvcmUgdGhlbS5cblx0XHQvLyBFZGl0b3JzIHRoYXQgY2Fubm90IGJlIHNlcmlhbGl6ZWQgbmVlZCB0byBiZSBpZ25vcmVkXG5cdFx0Ly8gZnJvbSBtcnUsIGFjdGl2ZSwgcHJldmlldyBhbmQgc3RpY2t5IGlmIGFueS5cblx0XHRjb25zdCBzZXJpYWxpemFibGVFZGl0b3JzOiBFZGl0b3JJbnB1dFtdID0gW107XG5cdFx0Y29uc3Qgc2VyaWFsaXplZEVkaXRvcnM6IElTZXJpYWxpemVkRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdGxldCBzZXJpYWxpemFibGVQcmV2aWV3SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc2VyaWFsaXphYmxlU3RpY2t5ID0gdGhpcy5zdGlja3k7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZWRpdG9ycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5lZGl0b3JzW2ldO1xuXHRcdFx0bGV0IGNhblNlcmlhbGl6ZUVkaXRvciA9IGZhbHNlO1xuXG5cdFx0XHRjb25zdCBlZGl0b3JTZXJpYWxpemVyID0gcmVnaXN0cnkuZ2V0RWRpdG9yU2VyaWFsaXplcihlZGl0b3IpO1xuXHRcdFx0aWYgKGVkaXRvclNlcmlhbGl6ZXIpIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBlZGl0b3JTZXJpYWxpemVyLmNhblNlcmlhbGl6ZShlZGl0b3IpID8gZWRpdG9yU2VyaWFsaXplci5zZXJpYWxpemUoZWRpdG9yKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBFZGl0b3IgY2FuIGJlIHNlcmlhbGl6ZWRcblx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRjYW5TZXJpYWxpemVFZGl0b3IgPSB0cnVlO1xuXG5cdFx0XHRcdFx0c2VyaWFsaXplZEVkaXRvcnMucHVzaCh7IGlkOiBlZGl0b3IudHlwZUlkLCB2YWx1ZSB9KTtcblx0XHRcdFx0XHRzZXJpYWxpemFibGVFZGl0b3JzLnB1c2goZWRpdG9yKTtcblxuXHRcdFx0XHRcdGlmICh0aGlzLnByZXZpZXcgPT09IGVkaXRvcikge1xuXHRcdFx0XHRcdFx0c2VyaWFsaXphYmxlUHJldmlld0luZGV4ID0gc2VyaWFsaXphYmxlRWRpdG9ycy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEVkaXRvciBjYW5ub3QgYmUgc2VyaWFsaXplZFxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjYW5TZXJpYWxpemVFZGl0b3IgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGp1c3QgaW5kZXggb2Ygc3RpY2t5IGVkaXRvcnMgaWYgdGhlIGVkaXRvciBjYW5ub3QgYmUgc2VyaWFsaXplZCBhbmQgaXMgcGlubmVkXG5cdFx0XHRpZiAoIWNhblNlcmlhbGl6ZUVkaXRvciAmJiB0aGlzLmlzU3RpY2t5KGkpKSB7XG5cdFx0XHRcdHNlcmlhbGl6YWJsZVN0aWNreS0tO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlcmlhbGl6YWJsZU1ydSA9IHRoaXMubXJ1Lm1hcChlZGl0b3IgPT4gdGhpcy5pbmRleE9mKGVkaXRvciwgc2VyaWFsaXphYmxlRWRpdG9ycykpLmZpbHRlcihpID0+IGkgPj0gMCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHRoaXMuaWQsXG5cdFx0XHRsb2NrZWQ6IHRoaXMubG9ja2VkID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdGVkaXRvcnM6IHNlcmlhbGl6ZWRFZGl0b3JzLFxuXHRcdFx0bXJ1OiBzZXJpYWxpemFibGVNcnUsXG5cdFx0XHRwcmV2aWV3OiBzZXJpYWxpemFibGVQcmV2aWV3SW5kZXgsXG5cdFx0XHRzdGlja3k6IHNlcmlhbGl6YWJsZVN0aWNreSA+PSAwID8gc2VyaWFsaXphYmxlU3RpY2t5IDogdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZGVzZXJpYWxpemUoZGF0YTogSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsKTogbnVtYmVyIHtcblx0XHRjb25zdCByZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSk7XG5cblx0XHRpZiAodHlwZW9mIGRhdGEuaWQgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLl9pZCA9IGRhdGEuaWQ7XG5cblx0XHRcdEVkaXRvckdyb3VwTW9kZWwuSURTID0gTWF0aC5tYXgoZGF0YS5pZCArIDEsIEVkaXRvckdyb3VwTW9kZWwuSURTKTsgLy8gbWFrZSBzdXJlIG91ciBJRCBnZW5lcmF0b3IgaXMgYWx3YXlzIGxhcmdlclxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pZCA9IEVkaXRvckdyb3VwTW9kZWwuSURTKys7IC8vIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5cdFx0fVxuXG5cdFx0aWYgKGRhdGEubG9ja2VkKSB7XG5cdFx0XHR0aGlzLmxvY2tlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3JzID0gY29hbGVzY2UoZGF0YS5lZGl0b3JzLm1hcCgoZSwgaW5kZXgpID0+IHtcblx0XHRcdGxldCBlZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBlZGl0b3JTZXJpYWxpemVyID0gcmVnaXN0cnkuZ2V0RWRpdG9yU2VyaWFsaXplcihlLmlkKTtcblx0XHRcdGlmIChlZGl0b3JTZXJpYWxpemVyKSB7XG5cdFx0XHRcdGNvbnN0IGRlc2VyaWFsaXplZEVkaXRvciA9IGVkaXRvclNlcmlhbGl6ZXIuZGVzZXJpYWxpemUodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgZS52YWx1ZSk7XG5cdFx0XHRcdGlmIChkZXNlcmlhbGl6ZWRFZGl0b3IgaW5zdGFuY2VvZiBFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRcdGVkaXRvciA9IGRlc2VyaWFsaXplZEVkaXRvcjtcblx0XHRcdFx0XHR0aGlzLnJlZ2lzdGVyRWRpdG9yTGlzdGVuZXJzKGVkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFlZGl0b3IgJiYgdHlwZW9mIGRhdGEuc3RpY2t5ID09PSAnbnVtYmVyJyAmJiBpbmRleCA8PSBkYXRhLnN0aWNreSkge1xuXHRcdFx0XHRkYXRhLnN0aWNreS0tOyAvLyBpZiBlZGl0b3IgY2Fubm90IGJlIGRlc2VyaWFsaXplZCBidXQgd2FzIHN0aWNreSwgd2UgbmVlZCB0byBkZWNyZWFzZSBzdGlja3kgaW5kZXhcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGVkaXRvcjtcblx0XHR9KSk7XG5cblx0XHR0aGlzLm1ydSA9IGNvYWxlc2NlKGRhdGEubXJ1Lm1hcChpID0+IHRoaXMuZWRpdG9yc1tpXSkpO1xuXG5cdFx0dGhpcy5zZWxlY3Rpb24gPSB0aGlzLm1ydS5sZW5ndGggPiAwID8gW3RoaXMubXJ1WzBdXSA6IFtdO1xuXG5cdFx0aWYgKHR5cGVvZiBkYXRhLnByZXZpZXcgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLnByZXZpZXcgPSB0aGlzLmVkaXRvcnNbZGF0YS5wcmV2aWV3XTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGRhdGEuc3RpY2t5ID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5zdGlja3kgPSBkYXRhLnN0aWNreTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UoQXJyYXkuZnJvbSh0aGlzLmVkaXRvckxpc3RlbmVycykpO1xuXHRcdHRoaXMuZWRpdG9yTGlzdGVuZXJzLmNsZWFyKCk7XG5cblx0XHR0aGlzLnRyYW5zaWVudC5jbGVhcigpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7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
