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
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { SideBySideEditor, isEditorInputWithOptions, SaveReason, EditorsOrder, EditorResourceAccessor, EditorInputCapabilities, isResourceDiffEditorInput, isResourceEditorInput, isEditorInput, isEditorInputWithOptionsAndGroup, isResourceMergeEditorInput } from "../../../common/editor.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { ResourceMap, ResourceSet } from "../../../../base/common/map.js";
import { IFileService, FileOperation, FileChangesEvent, FileChangeType } from "../../../../platform/files/common/files.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { joinPath } from "../../../../base/common/resources.js";
import { DiffEditorInput } from "../../../common/editor/diffEditorInput.js";
import { SideBySideEditor as SideBySideEditorPane } from "../../../browser/parts/editor/sideBySideEditor.js";
import { IEditorGroupsService, GroupsOrder, isEditorReplacement } from "../common/editorGroupsService.js";
import { IEditorService, isPreferredGroup } from "../common/editorService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Disposable, dispose, DisposableStore } from "../../../../base/common/lifecycle.js";
import { coalesce, distinct } from "../../../../base/common/arrays.js";
import { isCodeEditor, isDiffEditor, isCompositeEditor } from "../../../../editor/browser/editorBrowser.js";
import { registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { isUndefined } from "../../../../base/common/types.js";
import { EditorsObserver } from "../../../browser/parts/editor/editorsObserver.js";
import { Promises, timeout } from "../../../../base/common/async.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { indexOfPath } from "../../../../base/common/extpath.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IEditorResolverService, ResolvedStatus } from "../common/editorResolverService.js";
import { IWorkspaceTrustRequestService, WorkspaceTrustUriResponse } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IHostService } from "../../host/browser/host.js";
import { findGroup } from "../common/editorGroupFinder.js";
import { ITextEditorService } from "../../textfile/common/textEditorService.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
let EditorService = class extends Disposable {
  constructor(editorGroupsContainer, editorGroupService, instantiationService, fileService, configurationService, contextService, uriIdentityService, editorResolverService, workspaceTrustRequestService, hostService, textEditorService) {
    super();
    this.editorGroupService = editorGroupService;
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.uriIdentityService = uriIdentityService;
    this.editorResolverService = editorResolverService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.hostService = hostService;
    this.textEditorService = textEditorService;
    //#region events
    this._onDidActiveEditorChange = this._register(new Emitter());
    this.onDidActiveEditorChange = this._onDidActiveEditorChange.event;
    this._onDidVisibleEditorsChange = this._register(new Emitter());
    this.onDidVisibleEditorsChange = this._onDidVisibleEditorsChange.event;
    this._onDidEditorsChange = this._register(new Emitter());
    this.onDidEditorsChange = this._onDidEditorsChange.event;
    this._onWillOpenEditor = this._register(new Emitter());
    this.onWillOpenEditor = this._onWillOpenEditor.event;
    this._onDidCloseEditor = this._register(new Emitter());
    this.onDidCloseEditor = this._onDidCloseEditor.event;
    this._onDidOpenEditorFail = this._register(new Emitter());
    this.onDidOpenEditorFail = this._onDidOpenEditorFail.event;
    this._onDidMostRecentlyActiveEditorsChange = this._register(new Emitter());
    this.onDidMostRecentlyActiveEditorsChange = this._onDidMostRecentlyActiveEditorsChange.event;
    //#region Editor & group event handlers
    this.lastActiveEditor = void 0;
    //#endregion
    //#region Visible Editors Change: Install file watchers for out of workspace resources that became visible
    this.activeOutOfWorkspaceWatchers = new ResourceMap();
    this.closeOnFileDelete = false;
    this.editorGroupsContainer = editorGroupsContainer ?? editorGroupService;
    this.isScoped = editorGroupsContainer !== void 0;
    this.editorsObserver = this._register(this.instantiationService.createInstance(EditorsObserver, this.editorGroupsContainer));
    this.onConfigurationUpdated();
    this.registerListeners();
  }
  createScoped(editorGroupsContainer, disposables) {
    return disposables.add(new EditorService(editorGroupsContainer, this.editorGroupService, this.instantiationService, this.fileService, this.configurationService, this.contextService, this.uriIdentityService, this.editorResolverService, this.workspaceTrustRequestService, this.hostService, this.textEditorService));
  }
  registerListeners() {
    if (this.editorGroupsContainer === this.editorGroupService.mainPart || this.editorGroupsContainer === this.editorGroupService) {
      this.editorGroupService.whenReady.then(() => this.onEditorGroupsReady());
    } else {
      this.onEditorGroupsReady();
    }
    this._register(this.editorGroupsContainer.onDidChangeActiveGroup((group) => this.handleActiveEditorChange(group)));
    this._register(this.editorGroupsContainer.onDidAddGroup((group) => this.registerGroupListeners(group)));
    this._register(this.editorsObserver.onDidMostRecentlyActiveEditorsChange(() => this._onDidMostRecentlyActiveEditorsChange.fire()));
    this._register(this.onDidVisibleEditorsChange(() => this.handleVisibleEditorsChange()));
    if (!this.isScoped) {
      this._register(this.fileService.onDidRunOperation((e) => this.onDidRunFileOperation(e)));
      this._register(this.fileService.onDidFilesChange((e) => this.onDidFilesChange(e)));
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
  }
  onEditorGroupsReady() {
    for (const group of this.editorGroupsContainer.groups) {
      this.registerGroupListeners(group);
    }
    if (this.activeEditor) {
      this.doHandleActiveEditorChangeEvent();
      this._onDidVisibleEditorsChange.fire({ isExplicit: false });
    }
  }
  handleActiveEditorChange(group) {
    if (group !== this.editorGroupsContainer.activeGroup) {
      return;
    }
    if (!this.lastActiveEditor && !group.activeEditor) {
      return;
    }
    this.doHandleActiveEditorChangeEvent();
  }
  doHandleActiveEditorChangeEvent() {
    const activeGroup = this.editorGroupsContainer.activeGroup;
    this.lastActiveEditor = activeGroup.activeEditor ?? void 0;
    this._onDidActiveEditorChange.fire();
  }
  registerGroupListeners(group) {
    const groupDisposables = new DisposableStore();
    groupDisposables.add(group.onDidModelChange((e) => {
      this._onDidEditorsChange.fire({ groupId: group.id, event: e });
    }));
    groupDisposables.add(group.onDidActiveEditorChange((e) => {
      this.handleActiveEditorChange(group);
      this._onDidVisibleEditorsChange.fire({
        isExplicit: e.isExplicit !== false
        /* treat undefined as explicit */
      });
    }));
    groupDisposables.add(group.onWillOpenEditor((e) => {
      this._onWillOpenEditor.fire(e);
    }));
    groupDisposables.add(group.onDidCloseEditor((e) => {
      this._onDidCloseEditor.fire(e);
    }));
    groupDisposables.add(group.onDidOpenEditorFail((editor) => {
      this._onDidOpenEditorFail.fire({ editor, groupId: group.id });
    }));
    Event.once(group.onWillDispose)(() => {
      dispose(groupDisposables);
    });
  }
  handleVisibleEditorsChange() {
    const visibleOutOfWorkspaceResources = new ResourceSet();
    for (const editor of this.visibleEditors) {
      const resources = distinct(coalesce([
        EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY }),
        EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.SECONDARY })
      ]), (resource) => resource.toString());
      for (const resource of resources) {
        if (this.fileService.hasProvider(resource) && !this.contextService.isInsideWorkspace(resource)) {
          visibleOutOfWorkspaceResources.add(resource);
        }
      }
    }
    for (const resource of this.activeOutOfWorkspaceWatchers.keys()) {
      if (!visibleOutOfWorkspaceResources.has(resource)) {
        dispose(this.activeOutOfWorkspaceWatchers.get(resource));
        this.activeOutOfWorkspaceWatchers.delete(resource);
      }
    }
    for (const resource of visibleOutOfWorkspaceResources.keys()) {
      if (!this.activeOutOfWorkspaceWatchers.get(resource)) {
        const disposable = this.fileService.watch(resource);
        this.activeOutOfWorkspaceWatchers.set(resource, disposable);
      }
    }
  }
  //#endregion
  //#region File Changes: Move & Deletes to move or close opend editors
  async onDidRunFileOperation(e) {
    if (e.isOperation(FileOperation.MOVE)) {
      this.handleMovedFile(e.resource, e.target.resource);
    }
    if (e.isOperation(FileOperation.DELETE) || e.isOperation(FileOperation.MOVE)) {
      this.handleDeletedFile(e.resource, false, e.target ? e.target.resource : void 0);
    }
  }
  onDidFilesChange(e) {
    if (e.gotDeleted()) {
      this.handleDeletedFile(e, true);
    }
  }
  async handleMovedFile(source, target) {
    for (const group of this.editorGroupsContainer.groups) {
      const replacements = [];
      for (const editor of group.editors) {
        const resource = EditorResourceAccessor.getOriginalUri(editor) ?? editor.resource;
        if (!resource || !this.uriIdentityService.extUri.isEqualOrParent(resource, source)) {
          continue;
        }
        let targetResource;
        if (this.uriIdentityService.extUri.isEqual(source, resource)) {
          targetResource = target;
        } else {
          const index = indexOfPath(resource.path, source.path, this.uriIdentityService.extUri.ignorePathCasing(resource));
          targetResource = joinPath(target, resource.path.substr(index + source.path.length + 1));
        }
        const moveResult = await editor.rename(group.id, targetResource);
        if (!moveResult) {
          return;
        }
        const optionOverrides = {
          preserveFocus: true,
          pinned: group.isPinned(editor),
          sticky: group.isSticky(editor),
          index: group.getIndexOfEditor(editor),
          inactive: !group.isActive(editor)
        };
        if (isEditorInput(moveResult.editor)) {
          replacements.push({
            editor,
            replacement: moveResult.editor,
            options: {
              ...moveResult.options,
              ...optionOverrides
            }
          });
        } else {
          replacements.push({
            editor,
            replacement: {
              ...moveResult.editor,
              options: {
                ...moveResult.editor.options,
                ...optionOverrides
              }
            }
          });
        }
      }
      if (replacements.length) {
        this.replaceEditors(replacements, group);
      }
    }
  }
  onConfigurationUpdated(e) {
    if (e && !e.affectsConfiguration("workbench.editor.closeOnFileDelete")) {
      return;
    }
    const configuration = this.configurationService.getValue();
    if (typeof configuration.workbench?.editor?.closeOnFileDelete === "boolean") {
      this.closeOnFileDelete = configuration.workbench.editor.closeOnFileDelete;
    } else {
      this.closeOnFileDelete = false;
    }
  }
  handleDeletedFile(arg1, isExternal, movedTo) {
    for (const editor of this.getAllNonDirtyEditors({ includeUntitled: false, supportSideBySide: true })) {
      (async () => {
        const resource = EditorResourceAccessor.getOriginalUri(editor) ?? editor.resource;
        if (!resource) {
          return;
        }
        if (this.closeOnFileDelete || !isExternal) {
          if (movedTo && this.uriIdentityService.extUri.isEqualOrParent(resource, movedTo)) {
            return;
          }
          let matches = false;
          if (arg1 instanceof FileChangesEvent) {
            matches = arg1.contains(resource, FileChangeType.DELETED);
          } else {
            matches = this.uriIdentityService.extUri.isEqualOrParent(resource, arg1);
          }
          if (!matches) {
            return;
          }
          let exists = false;
          if (isExternal && this.fileService.hasProvider(resource)) {
            await timeout(100);
            exists = await this.fileService.exists(resource);
          }
          if (!exists && !editor.isDisposed()) {
            editor.dispose();
          }
        }
      })();
    }
  }
  getAllNonDirtyEditors(options) {
    const editors = [];
    function conditionallyAddEditor(editor) {
      if (editor.hasCapability(EditorInputCapabilities.Untitled) && !options.includeUntitled) {
        return;
      }
      if (editor.isDirty()) {
        return;
      }
      editors.push(editor);
    }
    for (const editor of this.editors) {
      if (options.supportSideBySide && editor instanceof SideBySideEditorInput) {
        conditionallyAddEditor(editor.primary);
        conditionallyAddEditor(editor.secondary);
      } else {
        conditionallyAddEditor(editor);
      }
    }
    return editors;
  }
  get activeEditorPane() {
    return this.editorGroupsContainer.activeGroup?.activeEditorPane;
  }
  get activeTextEditorControl() {
    const activeEditorPane = this.activeEditorPane;
    if (activeEditorPane) {
      const activeControl = activeEditorPane.getControl();
      if (isCodeEditor(activeControl) || isDiffEditor(activeControl)) {
        return activeControl;
      }
      if (isCompositeEditor(activeControl) && isCodeEditor(activeControl.activeCodeEditor)) {
        return activeControl.activeCodeEditor;
      }
    }
    return void 0;
  }
  get activeTextEditorLanguageId() {
    let activeCodeEditor = void 0;
    const activeTextEditorControl = this.activeTextEditorControl;
    if (isDiffEditor(activeTextEditorControl)) {
      activeCodeEditor = activeTextEditorControl.getModifiedEditor();
    } else {
      activeCodeEditor = activeTextEditorControl;
    }
    return activeCodeEditor?.getModel()?.getLanguageId();
  }
  get count() {
    return this.editorsObserver.count;
  }
  get editors() {
    return this.getEditors(EditorsOrder.SEQUENTIAL).map(({ editor }) => editor);
  }
  getEditors(order, options) {
    switch (order) {
      // MRU
      case EditorsOrder.MOST_RECENTLY_ACTIVE:
        if (options?.excludeSticky) {
          return this.editorsObserver.editors.filter(({ groupId, editor }) => !this.editorGroupsContainer.getGroup(groupId)?.isSticky(editor));
        }
        return this.editorsObserver.editors;
      // Sequential
      case EditorsOrder.SEQUENTIAL: {
        const editors = [];
        for (const group of this.editorGroupsContainer.getGroups(GroupsOrder.GRID_APPEARANCE)) {
          editors.push(...group.getEditors(EditorsOrder.SEQUENTIAL, options).map((editor) => ({ editor, groupId: group.id })));
        }
        return editors;
      }
    }
  }
  get activeEditor() {
    const activeGroup = this.editorGroupsContainer.activeGroup;
    return activeGroup ? activeGroup.activeEditor ?? void 0 : void 0;
  }
  get visibleEditorPanes() {
    return coalesce(this.editorGroupsContainer.groups.map((group) => group.activeEditorPane));
  }
  get visibleTextEditorControls() {
    return this.doGetVisibleTextEditorControls(this.visibleEditorPanes);
  }
  doGetVisibleTextEditorControls(editorPanes) {
    const visibleTextEditorControls = [];
    for (const editorPane of editorPanes) {
      const controls = [];
      if (editorPane instanceof SideBySideEditorPane) {
        controls.push(editorPane.getPrimaryEditorPane()?.getControl());
        controls.push(editorPane.getSecondaryEditorPane()?.getControl());
      } else {
        controls.push(editorPane.getControl());
      }
      for (const control of controls) {
        if (isCodeEditor(control) || isDiffEditor(control)) {
          visibleTextEditorControls.push(control);
        }
      }
    }
    return visibleTextEditorControls;
  }
  getVisibleTextEditorControls(order) {
    return this.doGetVisibleTextEditorControls(coalesce(this.editorGroupsContainer.getGroups(order === EditorsOrder.SEQUENTIAL ? GroupsOrder.GRID_APPEARANCE : GroupsOrder.MOST_RECENTLY_ACTIVE).map((group) => group.activeEditorPane)));
  }
  get visibleEditors() {
    return coalesce(this.editorGroupsContainer.groups.map((group) => group.activeEditor));
  }
  async openEditor(editor, optionsOrPreferredGroup, preferredGroup) {
    let typedEditor = void 0;
    let options = isEditorInput(editor) ? optionsOrPreferredGroup : editor.options;
    let group = void 0;
    if (isPreferredGroup(optionsOrPreferredGroup)) {
      preferredGroup = optionsOrPreferredGroup;
    }
    if (!isEditorInput(editor)) {
      const resolvedEditor = await this.editorResolverService.resolveEditor(editor, preferredGroup);
      if (resolvedEditor === ResolvedStatus.ABORT) {
        return;
      }
      if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
        typedEditor = resolvedEditor.editor;
        options = resolvedEditor.options;
        group = resolvedEditor.group;
      }
    }
    if (!typedEditor) {
      typedEditor = isEditorInput(editor) ? editor : await this.textEditorService.resolveTextEditor(editor);
    }
    if (!group) {
      let activation = void 0;
      const findGroupResult = this.instantiationService.invokeFunction(findGroup, { editor: typedEditor, options }, preferredGroup);
      if (findGroupResult instanceof Promise) {
        [group, activation] = await findGroupResult;
      } else {
        [group, activation] = findGroupResult;
      }
      if (activation) {
        options = { ...options, activation };
      }
    }
    if (options?.preserveFocus && this.editorGroupService.activeModalEditorPart?.groups.some((modalGroup) => modalGroup.id === group.id) && this.editorGroupService.activeModalEditorPart.count === 1 && this.editorGroupService.activeModalEditorPart.groups[0].isEmpty) {
      options = { ...options, preserveFocus: false };
    }
    return group.openEditor(typedEditor, options);
  }
  async openEditors(editors, preferredGroup, options) {
    if (options?.validateTrust) {
      const editorsTrusted = await this.handleWorkspaceTrust(editors);
      if (!editorsTrusted) {
        return [];
      }
    }
    const mapGroupToTypedEditors = /* @__PURE__ */ new Map();
    for (const editor of editors) {
      let typedEditor = void 0;
      let group = void 0;
      if (!isEditorInputWithOptions(editor)) {
        const resolvedEditor = await this.editorResolverService.resolveEditor(editor, preferredGroup);
        if (resolvedEditor === ResolvedStatus.ABORT) {
          continue;
        }
        if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
          typedEditor = resolvedEditor;
          group = resolvedEditor.group;
        }
      }
      if (!typedEditor) {
        typedEditor = isEditorInputWithOptions(editor) ? editor : { editor: await this.textEditorService.resolveTextEditor(editor), options: editor.options };
      }
      if (!group) {
        const findGroupResult = this.instantiationService.invokeFunction(findGroup, typedEditor, preferredGroup);
        if (findGroupResult instanceof Promise) {
          [group] = await findGroupResult;
        } else {
          [group] = findGroupResult;
        }
      }
      if (typedEditor.options?.preserveFocus && this.editorGroupService.activeModalEditorPart?.groups.some((modalGroup) => modalGroup.id === group.id) && this.editorGroupService.activeModalEditorPart.count === 1 && this.editorGroupService.activeModalEditorPart.groups[0].isEmpty) {
        typedEditor = { ...typedEditor, options: { ...typedEditor.options, preserveFocus: false } };
      }
      let targetGroupEditors = mapGroupToTypedEditors.get(group);
      if (!targetGroupEditors) {
        targetGroupEditors = [];
        mapGroupToTypedEditors.set(group, targetGroupEditors);
      }
      targetGroupEditors.push(typedEditor);
    }
    const result = [];
    for (const [group, editors2] of mapGroupToTypedEditors) {
      result.push(group.openEditors(editors2));
    }
    return coalesce(await Promises.settled(result));
  }
  async handleWorkspaceTrust(editors) {
    const { resources, diffMode, mergeMode } = this.extractEditorResources(editors);
    const trustResult = await this.workspaceTrustRequestService.requestOpenFilesTrust(resources);
    switch (trustResult) {
      case WorkspaceTrustUriResponse.Open:
        return true;
      case WorkspaceTrustUriResponse.OpenInNewWindow:
        await this.hostService.openWindow(resources.map((resource) => ({ fileUri: resource })), { forceNewWindow: true, diffMode, mergeMode });
        return false;
      case WorkspaceTrustUriResponse.Cancel:
        return false;
    }
  }
  extractEditorResources(editors) {
    const resources = new ResourceSet();
    let diffMode = false;
    let mergeMode = false;
    for (const editor of editors) {
      if (isEditorInputWithOptions(editor)) {
        const resource = EditorResourceAccessor.getOriginalUri(editor.editor, { supportSideBySide: SideBySideEditor.BOTH });
        if (URI.isUri(resource)) {
          resources.add(resource);
        } else if (resource) {
          if (resource.primary) {
            resources.add(resource.primary);
          }
          if (resource.secondary) {
            resources.add(resource.secondary);
          }
          diffMode = editor.editor instanceof DiffEditorInput;
        }
      } else {
        if (isResourceMergeEditorInput(editor)) {
          if (URI.isUri(editor.input1)) {
            resources.add(editor.input1.resource);
          }
          if (URI.isUri(editor.input2)) {
            resources.add(editor.input2.resource);
          }
          if (URI.isUri(editor.base)) {
            resources.add(editor.base.resource);
          }
          if (URI.isUri(editor.result)) {
            resources.add(editor.result.resource);
          }
          mergeMode = true;
        }
        if (isResourceDiffEditorInput(editor)) {
          if (URI.isUri(editor.original.resource)) {
            resources.add(editor.original.resource);
          }
          if (URI.isUri(editor.modified.resource)) {
            resources.add(editor.modified.resource);
          }
          diffMode = true;
        } else if (isResourceEditorInput(editor)) {
          resources.add(editor.resource);
        }
      }
    }
    return {
      resources: Array.from(resources.keys()),
      diffMode,
      mergeMode
    };
  }
  //#endregion
  //#region isOpened() / isVisible()
  isOpened(editor) {
    return this.editorsObserver.hasEditor({
      resource: this.uriIdentityService.asCanonicalUri(editor.resource),
      typeId: editor.typeId,
      editorId: editor.editorId
    });
  }
  isVisible(editor) {
    for (const group of this.editorGroupsContainer.groups) {
      if (group.activeEditor?.matches(editor)) {
        return true;
      }
    }
    return false;
  }
  //#endregion
  //#region closeEditor()
  async closeEditor({ editor, groupId }, options) {
    const group = this.editorGroupsContainer.getGroup(groupId);
    await group?.closeEditor(editor, options);
  }
  //#endregion
  //#region closeEditors()
  async closeEditors(editors, options) {
    const mapGroupToEditors = /* @__PURE__ */ new Map();
    for (const { editor, groupId } of editors) {
      const group = this.editorGroupsContainer.getGroup(groupId);
      if (!group) {
        continue;
      }
      let editors2 = mapGroupToEditors.get(group);
      if (!editors2) {
        editors2 = [];
        mapGroupToEditors.set(group, editors2);
      }
      editors2.push(editor);
    }
    for (const [group, editors2] of mapGroupToEditors) {
      await group.closeEditors(editors2, options);
    }
  }
  findEditors(arg1, options, arg2) {
    const resource = URI.isUri(arg1) ? arg1 : arg1.resource;
    const typeId = URI.isUri(arg1) ? void 0 : arg1.typeId;
    if (options?.supportSideBySide !== SideBySideEditor.ANY && options?.supportSideBySide !== SideBySideEditor.SECONDARY) {
      if (!this.editorsObserver.hasEditors(resource)) {
        if (URI.isUri(arg1) || isUndefined(arg2)) {
          return [];
        }
        return void 0;
      }
    }
    if (!isUndefined(arg2)) {
      const targetGroup = typeof arg2 === "number" ? this.editorGroupsContainer.getGroup(arg2) : arg2;
      if (URI.isUri(arg1)) {
        if (!targetGroup) {
          return [];
        }
        return targetGroup.findEditors(resource, options);
      } else {
        if (!targetGroup) {
          return void 0;
        }
        const editors = targetGroup.findEditors(resource, options);
        for (const editor of editors) {
          if (editor.typeId === typeId) {
            return editor;
          }
        }
        return void 0;
      }
    } else {
      const result = [];
      for (const group of this.editorGroupsContainer.getGroups(options?.order === EditorsOrder.SEQUENTIAL ? GroupsOrder.GRID_APPEARANCE : GroupsOrder.MOST_RECENTLY_ACTIVE)) {
        const editors = [];
        if (URI.isUri(arg1)) {
          editors.push(...this.findEditors(arg1, options, group));
        } else {
          const editor = this.findEditors(arg1, options, group);
          if (editor) {
            editors.push(editor);
          }
        }
        result.push(...editors.map((editor) => ({ editor, groupId: group.id })));
      }
      return result;
    }
  }
  async replaceEditors(replacements, group) {
    const targetGroup = typeof group === "number" ? this.editorGroupsContainer.getGroup(group) : group;
    const typedReplacements = [];
    for (const replacement of replacements) {
      let typedReplacement = void 0;
      if (!isEditorInput(replacement.replacement)) {
        const resolvedEditor = await this.editorResolverService.resolveEditor(
          replacement.replacement,
          targetGroup
        );
        if (resolvedEditor === ResolvedStatus.ABORT) {
          continue;
        }
        if (isEditorInputWithOptionsAndGroup(resolvedEditor)) {
          typedReplacement = {
            editor: replacement.editor,
            replacement: resolvedEditor.editor,
            options: resolvedEditor.options,
            forceReplaceDirty: replacement.forceReplaceDirty
          };
        }
      }
      if (!typedReplacement) {
        typedReplacement = {
          editor: replacement.editor,
          replacement: isEditorReplacement(replacement) ? replacement.replacement : await this.textEditorService.resolveTextEditor(replacement.replacement),
          options: isEditorReplacement(replacement) ? replacement.options : replacement.replacement.options,
          forceReplaceDirty: replacement.forceReplaceDirty
        };
      }
      typedReplacements.push(typedReplacement);
    }
    return targetGroup?.replaceEditors(typedReplacements);
  }
  //#endregion
  //#region save/revert
  async save(editors, options) {
    if (!Array.isArray(editors)) {
      editors = [editors];
    }
    const uniqueEditors = this.getUniqueEditors(editors);
    const editorsToSaveParallel = [];
    const editorsToSaveSequentially = [];
    if (options?.saveAs) {
      editorsToSaveSequentially.push(...uniqueEditors);
    } else {
      for (const { groupId, editor } of uniqueEditors) {
        if (editor.hasCapability(EditorInputCapabilities.Untitled)) {
          editorsToSaveSequentially.push({ groupId, editor });
        } else {
          editorsToSaveParallel.push({ groupId, editor });
        }
      }
    }
    const saveResults = await Promises.settled(editorsToSaveParallel.map(({ groupId, editor }) => {
      if (options?.reason === SaveReason.EXPLICIT) {
        this.editorGroupsContainer.getGroup(groupId)?.pinEditor(editor);
      }
      return editor.save(groupId, options);
    }));
    for (const { groupId, editor } of editorsToSaveSequentially) {
      if (editor.isDisposed()) {
        continue;
      }
      const editorPane = await this.openEditor(editor, groupId);
      const editorOptions = {
        pinned: true,
        viewState: editorPane?.getViewState()
      };
      const result = options?.saveAs ? await editor.saveAs(groupId, options) : await editor.save(groupId, options);
      saveResults.push(result);
      if (!result) {
        break;
      }
      if (!editor.matches(result)) {
        const targetGroups = editor.hasCapability(EditorInputCapabilities.Untitled) ? this.editorGroupsContainer.groups.map((group) => group.id) : [groupId];
        for (const targetGroup of targetGroups) {
          if (result instanceof EditorInput) {
            await this.replaceEditors([{ editor, replacement: result, options: editorOptions }], targetGroup);
          } else {
            await this.replaceEditors([{ editor, replacement: { ...result, options: editorOptions } }], targetGroup);
          }
        }
      }
    }
    return {
      success: saveResults.every((result) => !!result),
      editors: coalesce(saveResults)
    };
  }
  saveAll(options) {
    return this.save(this.getAllModifiedEditors(options), options);
  }
  async revert(editors, options) {
    if (!Array.isArray(editors)) {
      editors = [editors];
    }
    const uniqueEditors = this.getUniqueEditors(editors);
    await Promises.settled(uniqueEditors.map(async ({ groupId, editor }) => {
      this.editorGroupsContainer.getGroup(groupId)?.pinEditor(editor);
      return editor.revert(groupId, options);
    }));
    return !uniqueEditors.some(({ editor }) => editor.isDirty());
  }
  async revertAll(options) {
    return this.revert(this.getAllModifiedEditors(options), options);
  }
  getAllModifiedEditors(options) {
    const editors = [];
    for (const group of this.editorGroupsContainer.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      for (const editor of group.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
        if (!editor.isModified()) {
          continue;
        }
        if ((typeof options?.includeUntitled === "boolean" || !options?.includeUntitled?.includeScratchpad) && editor.hasCapability(EditorInputCapabilities.Scratchpad)) {
          continue;
        }
        if (!options?.includeUntitled && editor.hasCapability(EditorInputCapabilities.Untitled)) {
          continue;
        }
        if (options?.excludeSticky && group.isSticky(editor)) {
          continue;
        }
        editors.push({ groupId: group.id, editor });
      }
    }
    return editors;
  }
  getUniqueEditors(editors) {
    const uniqueEditors = [];
    for (const { editor, groupId } of editors) {
      if (uniqueEditors.some((uniqueEditor) => uniqueEditor.editor.matches(editor))) {
        continue;
      }
      uniqueEditors.push({ editor, groupId });
    }
    return uniqueEditors;
  }
  //#endregion
  dispose() {
    super.dispose();
    this.activeOutOfWorkspaceWatchers.forEach((disposable) => dispose(disposable));
    this.activeOutOfWorkspaceWatchers.clear();
  }
};
EditorService = __decorateClass([
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IFileService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IUriIdentityService),
  __decorateParam(7, IEditorResolverService),
  __decorateParam(8, IWorkspaceTrustRequestService),
  __decorateParam(9, IHostService),
  __decorateParam(10, ITextEditorService)
], EditorService);
registerSingleton(IEditorService, new SyncDescriptor(EditorService, [void 0], false));
export {
  EditorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxlZGl0b3JcXGJyb3dzZXJcXGVkaXRvclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUVkaXRvcklucHV0LCBJRWRpdG9yT3B0aW9ucywgRWRpdG9yQWN0aXZhdGlvbiwgSVJlc291cmNlRWRpdG9ySW5wdXRJZGVudGlmaWVyLCBJVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9yLCBJRWRpdG9yUGFuZSwgR3JvdXBJZGVudGlmaWVyLCBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCwgSVJlc291cmNlRGlmZkVkaXRvcklucHV0LCBFZGl0b3JJbnB1dFdpdGhPcHRpb25zLCBpc0VkaXRvcklucHV0V2l0aE9wdGlvbnMsIElFZGl0b3JJZGVudGlmaWVyLCBJRWRpdG9yQ2xvc2VFdmVudCwgSVRleHREaWZmRWRpdG9yUGFuZSwgSVJldmVydE9wdGlvbnMsIFNhdmVSZWFzb24sIEVkaXRvcnNPcmRlciwgSVdvcmtiZW5jaEVkaXRvckNvbmZpZ3VyYXRpb24sIEVkaXRvclJlc291cmNlQWNjZXNzb3IsIElWaXNpYmxlRWRpdG9yUGFuZSwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIGlzUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQsIElVbnR5cGVkRWRpdG9ySW5wdXQsIGlzUmVzb3VyY2VFZGl0b3JJbnB1dCwgaXNFZGl0b3JJbnB1dCwgaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAsIElGaW5kRWRpdG9yT3B0aW9ucywgaXNSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQsIElFZGl0b3JXaWxsT3BlbkV2ZW50LCBJRWRpdG9yQ29udHJvbCwgSVRleHRSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIEZpbGVPcGVyYXRpb25FdmVudCwgRmlsZU9wZXJhdGlvbiwgRmlsZUNoYW5nZXNFdmVudCwgRmlsZUNoYW5nZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9kaWZmRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgU2lkZUJ5U2lkZUVkaXRvciBhcyBTaWRlQnlTaWRlRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UsIElFZGl0b3JHcm91cCwgR3JvdXBzT3JkZXIsIElFZGl0b3JSZXBsYWNlbWVudCwgaXNFZGl0b3JSZXBsYWNlbWVudCwgSUNsb3NlRWRpdG9yT3B0aW9ucywgSUVkaXRvckdyb3Vwc0NvbnRhaW5lciB9IGZyb20gJy4uL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVbnR5cGVkRWRpdG9yUmVwbGFjZW1lbnQsIElFZGl0b3JTZXJ2aWNlLCBJU2F2ZUVkaXRvcnNPcHRpb25zLCBJU2F2ZUFsbEVkaXRvcnNPcHRpb25zLCBJUmV2ZXJ0QWxsRWRpdG9yc09wdGlvbnMsIElCYXNlU2F2ZVJldmVydEFsbEVkaXRvck9wdGlvbnMsIElPcGVuRWRpdG9yc09wdGlvbnMsIFByZWZlcnJlZEdyb3VwLCBpc1ByZWZlcnJlZEdyb3VwLCBJRWRpdG9yc0NoYW5nZUV2ZW50LCBJU2F2ZUVkaXRvcnNSZXN1bHQsIElWaXNpYmxlRWRpdG9yc0NoYW5nZUV2ZW50IH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgZGlzcG9zZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlLCBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBpc0NvZGVFZGl0b3IsIGlzRGlmZkVkaXRvciwgSUNvZGVFZGl0b3IsIElEaWZmRWRpdG9yLCBpc0NvbXBvc2l0ZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwVmlldywgRWRpdG9yU2VydmljZUltcGwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRWRpdG9yc09ic2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yc09ic2VydmVyLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgaW5kZXhPZlBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSwgUmVzb2x2ZWRTdGF0dXMgfSBmcm9tICcuLi9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBmaW5kR3JvdXAgfSBmcm9tICcuLi9jb21tb24vZWRpdG9yR3JvdXBGaW5kZXIuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGV4dGZpbGUvY29tbW9uL3RleHRFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuXG5leHBvcnQgY2xhc3MgRWRpdG9yU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBFZGl0b3JTZXJ2aWNlSW1wbCB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Ly8jcmVnaW9uIGV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlID0gdGhpcy5fb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElWaXNpYmxlRWRpdG9yc0NoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSA9IHRoaXMuX29uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFZGl0b3JzQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvcnNDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRWRpdG9yc0NoYW5nZSA9IHRoaXMuX29uRGlkRWRpdG9yc0NoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxPcGVuRWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvcldpbGxPcGVuRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxPcGVuRWRpdG9yID0gdGhpcy5fb25XaWxsT3BlbkVkaXRvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlRWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvckNsb3NlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlRWRpdG9yID0gdGhpcy5fb25EaWRDbG9zZUVkaXRvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE9wZW5FZGl0b3JGYWlsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvcklkZW50aWZpZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZE9wZW5FZGl0b3JGYWlsID0gdGhpcy5fb25EaWRPcGVuRWRpdG9yRmFpbC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnNDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRNb3N0UmVjZW50bHlBY3RpdmVFZGl0b3JzQ2hhbmdlID0gdGhpcy5fb25EaWRNb3N0UmVjZW50bHlBY3RpdmVFZGl0b3JzQ2hhbmdlLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzU2NvcGVkOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvckdyb3Vwc0NvbnRhaW5lcjogSUVkaXRvckdyb3Vwc0NvbnRhaW5lciB8IHVuZGVmaW5lZCxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlOiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJVGV4dEVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RWRpdG9yU2VydmljZTogSVRleHRFZGl0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lciA9IGVkaXRvckdyb3Vwc0NvbnRhaW5lciA/PyBlZGl0b3JHcm91cFNlcnZpY2U7XG5cdFx0dGhpcy5pc1Njb3BlZCA9IGVkaXRvckdyb3Vwc0NvbnRhaW5lciAhPT0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuZWRpdG9yc09ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JzT2JzZXJ2ZXIsIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyKSk7XG5cblx0XHR0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdGNyZWF0ZVNjb3BlZChlZGl0b3JHcm91cHNDb250YWluZXI6IElFZGl0b3JHcm91cHNDb250YWluZXIsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBJRWRpdG9yU2VydmljZSB7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdG9yU2VydmljZShlZGl0b3JHcm91cHNDb250YWluZXIsIHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmNvbnRleHRTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdGhpcy5lZGl0b3JSZXNvbHZlclNlcnZpY2UsIHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgdGhpcy5ob3N0U2VydmljZSwgdGhpcy50ZXh0RWRpdG9yU2VydmljZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIEVkaXRvciAmIGdyb3VwIGNoYW5nZXNcblx0XHRpZiAodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIgPT09IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLm1haW5QYXJ0IHx8IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyID09PSB0aGlzLmVkaXRvckdyb3VwU2VydmljZSkge1xuXHRcdFx0dGhpcy5lZGl0b3JHcm91cFNlcnZpY2Uud2hlblJlYWR5LnRoZW4oKCkgPT4gdGhpcy5vbkVkaXRvckdyb3Vwc1JlYWR5KCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm9uRWRpdG9yR3JvdXBzUmVhZHkoKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIub25EaWRDaGFuZ2VBY3RpdmVHcm91cChncm91cCA9PiB0aGlzLmhhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZShncm91cCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5vbkRpZEFkZEdyb3VwKGdyb3VwID0+IHRoaXMucmVnaXN0ZXJHcm91cExpc3RlbmVycyhncm91cCBhcyBJRWRpdG9yR3JvdXBWaWV3KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yc09ic2VydmVyLm9uRGlkTW9zdFJlY2VudGx5QWN0aXZlRWRpdG9yc0NoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZE1vc3RSZWNlbnRseUFjdGl2ZUVkaXRvcnNDaGFuZ2UuZmlyZSgpKSk7XG5cblx0XHQvLyBPdXQgb2Ygd29ya3NwYWNlIGZpbGUgd2F0Y2hlcnNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UoKCkgPT4gdGhpcy5oYW5kbGVWaXNpYmxlRWRpdG9yc0NoYW5nZSgpKSk7XG5cblx0XHQvLyBGaWxlIG9wZXJhdGlvbiBldmVudHMgYXJlIGdsb2JhbDsgc2NvcGVkIHNlcnZpY2VzIHdvdWxkIHByb2Nlc3MgZWFjaCBvcGVyYXRpb24gYWdhaW4uXG5cdFx0aWYgKCF0aGlzLmlzU2NvcGVkKSB7XG5cdFx0XHQvLyBOb3RlOiB0aGVyZSBpcyBzb21lIGR1cGxpY2F0aW9uIHdpdGggdGhlIHR3byBmaWxlIGV2ZW50IGhhbmRsZXJzLSBTaW5jZSB3ZSBjYW5ub3QgYWx3YXlzIHJlbHkgb24gdGhlIGRpc2sgZXZlbnRzXG5cdFx0XHQvLyBjYXJyeWluZyBhbGwgbmVjZXNzYXJ5IGRhdGEgaW4gYWxsIGVudmlyb25tZW50cywgd2UgYWxzbyB1c2UgdGhlIGZpbGUgb3BlcmF0aW9uIGV2ZW50cyB0byBtYWtlIHN1cmUgb3BlcmF0aW9ucyBhcmUgaGFuZGxlZC5cblx0XHRcdC8vIEluIGFueSBjYXNlIHRoZXJlIGlzIG5vIGd1YXJhbnRlZSBpZiB0aGUgbG9jYWwgZXZlbnQgaXMgZmlyZWQgZmlyc3Qgb3IgdGhlIGRpc2sgb25lLiBUaHVzLCBjb2RlIG11c3QgaGFuZGxlIHRoZSBjYXNlXG5cdFx0XHQvLyB0aGF0IHRoZSBldmVudCBvcmRlcmluZyBpcyByYW5kb20gYXMgd2VsbCBhcyBtaWdodCBub3QgY2FycnkgYWxsIGluZm9ybWF0aW9uIG5lZWRlZC5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRSdW5PcGVyYXRpb24oZSA9PiB0aGlzLm9uRGlkUnVuRmlsZU9wZXJhdGlvbihlKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4gdGhpcy5vbkRpZEZpbGVzQ2hhbmdlKGUpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29uZmlndXJhdGlvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy5vbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGUpKSk7XG5cdH1cblxuXHQvLyNyZWdpb24gRWRpdG9yICYgZ3JvdXAgZXZlbnQgaGFuZGxlcnNcblxuXHRwcml2YXRlIGxhc3RBY3RpdmVFZGl0b3I6IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgb25FZGl0b3JHcm91cHNSZWFkeSgpOiB2b2lkIHtcblxuXHRcdC8vIFJlZ2lzdGVyIGxpc3RlbmVycyB0byBlYWNoIG9wZW5lZCBncm91cFxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ3JvdXBzKSB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyR3JvdXBMaXN0ZW5lcnMoZ3JvdXAgYXMgSUVkaXRvckdyb3VwVmlldyk7XG5cdFx0fVxuXG5cdFx0Ly8gRmlyZSBpbml0aWFsIHNldCBvZiBlZGl0b3IgZXZlbnRzIGlmIHRoZXJlIGlzIGFuIGFjdGl2ZSBlZGl0b3Jcblx0XHRpZiAodGhpcy5hY3RpdmVFZGl0b3IpIHtcblx0XHRcdHRoaXMuZG9IYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2VFdmVudCgpO1xuXHRcdFx0dGhpcy5fb25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZS5maXJlKHsgaXNFeHBsaWNpdDogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVBY3RpdmVFZGl0b3JDaGFuZ2UoZ3JvdXA6IElFZGl0b3JHcm91cCk6IHZvaWQge1xuXHRcdGlmIChncm91cCAhPT0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuYWN0aXZlR3JvdXApIHtcblx0XHRcdHJldHVybjsgLy8gaWdub3JlIGlmIG5vdCB0aGUgYWN0aXZlIGdyb3VwXG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmxhc3RBY3RpdmVFZGl0b3IgJiYgIWdyb3VwLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuOyAvLyBpZ25vcmUgaWYgd2Ugc3RpbGwgaGF2ZSBubyBhY3RpdmUgZWRpdG9yXG5cdFx0fVxuXG5cdFx0dGhpcy5kb0hhbmRsZUFjdGl2ZUVkaXRvckNoYW5nZUV2ZW50KCk7XG5cdH1cblxuXHRwcml2YXRlIGRvSGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlRXZlbnQoKTogdm9pZCB7XG5cblx0XHQvLyBSZW1lbWJlciBhcyBsYXN0IGFjdGl2ZVxuXHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuYWN0aXZlR3JvdXA7XG5cdFx0dGhpcy5sYXN0QWN0aXZlRWRpdG9yID0gYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yID8/IHVuZGVmaW5lZDtcblxuXHRcdC8vIEZpcmUgZXZlbnQgdG8gb3V0c2lkZSBwYXJ0aWVzXG5cdFx0dGhpcy5fb25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckdyb3VwTGlzdGVuZXJzKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3KTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXBEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGdyb3VwRGlzcG9zYWJsZXMuYWRkKGdyb3VwLm9uRGlkTW9kZWxDaGFuZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZEVkaXRvcnNDaGFuZ2UuZmlyZSh7IGdyb3VwSWQ6IGdyb3VwLmlkLCBldmVudDogZSB9KTtcblx0XHR9KSk7XG5cblx0XHRncm91cERpc3Bvc2FibGVzLmFkZChncm91cC5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZShlID0+IHtcblx0XHRcdHRoaXMuaGFuZGxlQWN0aXZlRWRpdG9yQ2hhbmdlKGdyb3VwKTtcblx0XHRcdHRoaXMuX29uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UuZmlyZSh7IGlzRXhwbGljaXQ6IGUuaXNFeHBsaWNpdCAhPT0gZmFsc2UgLyogdHJlYXQgdW5kZWZpbmVkIGFzIGV4cGxpY2l0ICovIH0pO1xuXHRcdH0pKTtcblxuXHRcdGdyb3VwRGlzcG9zYWJsZXMuYWRkKGdyb3VwLm9uV2lsbE9wZW5FZGl0b3IoZSA9PiB7XG5cdFx0XHR0aGlzLl9vbldpbGxPcGVuRWRpdG9yLmZpcmUoZSk7XG5cdFx0fSkpO1xuXG5cdFx0Z3JvdXBEaXNwb3NhYmxlcy5hZGQoZ3JvdXAub25EaWRDbG9zZUVkaXRvcihlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2xvc2VFZGl0b3IuZmlyZShlKTtcblx0XHR9KSk7XG5cblx0XHRncm91cERpc3Bvc2FibGVzLmFkZChncm91cC5vbkRpZE9wZW5FZGl0b3JGYWlsKGVkaXRvciA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZE9wZW5FZGl0b3JGYWlsLmZpcmUoeyBlZGl0b3IsIGdyb3VwSWQ6IGdyb3VwLmlkIH0pO1xuXHRcdH0pKTtcblxuXHRcdEV2ZW50Lm9uY2UoZ3JvdXAub25XaWxsRGlzcG9zZSkoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zZShncm91cERpc3Bvc2FibGVzKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBWaXNpYmxlIEVkaXRvcnMgQ2hhbmdlOiBJbnN0YWxsIGZpbGUgd2F0Y2hlcnMgZm9yIG91dCBvZiB3b3Jrc3BhY2UgcmVzb3VyY2VzIHRoYXQgYmVjYW1lIHZpc2libGVcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2ZU91dE9mV29ya3NwYWNlV2F0Y2hlcnMgPSBuZXcgUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCk7XG5cblx0cHJpdmF0ZSBoYW5kbGVWaXNpYmxlRWRpdG9yc0NoYW5nZSgpOiB2b2lkIHtcblx0XHRjb25zdCB2aXNpYmxlT3V0T2ZXb3Jrc3BhY2VSZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMudmlzaWJsZUVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlcyA9IGRpc3RpbmN0KGNvYWxlc2NlKFtcblx0XHRcdFx0RWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSksXG5cdFx0XHRcdEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5TRUNPTkRBUlkgfSlcblx0XHRcdF0pLCByZXNvdXJjZSA9PiByZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdFx0aWYgKHRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIocmVzb3VyY2UpICYmICF0aGlzLmNvbnRleHRTZXJ2aWNlLmlzSW5zaWRlV29ya3NwYWNlKHJlc291cmNlKSkge1xuXHRcdFx0XHRcdHZpc2libGVPdXRPZldvcmtzcGFjZVJlc291cmNlcy5hZGQocmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIG5vIGxvbmdlciB2aXNpYmxlIG91dCBvZiB3b3Jrc3BhY2UgcmVzb3VyY2VzXG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiB0aGlzLmFjdGl2ZU91dE9mV29ya3NwYWNlV2F0Y2hlcnMua2V5cygpKSB7XG5cdFx0XHRpZiAoIXZpc2libGVPdXRPZldvcmtzcGFjZVJlc291cmNlcy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdGRpc3Bvc2UodGhpcy5hY3RpdmVPdXRPZldvcmtzcGFjZVdhdGNoZXJzLmdldChyZXNvdXJjZSkpO1xuXHRcdFx0XHR0aGlzLmFjdGl2ZU91dE9mV29ya3NwYWNlV2F0Y2hlcnMuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgbmV3bHkgdmlzaWJsZSBvdXQgb2Ygd29ya3NwYWNlIHJlc291cmNlc1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgdmlzaWJsZU91dE9mV29ya3NwYWNlUmVzb3VyY2VzLmtleXMoKSkge1xuXHRcdFx0aWYgKCF0aGlzLmFjdGl2ZU91dE9mV29ya3NwYWNlV2F0Y2hlcnMuZ2V0KHJlc291cmNlKSkge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5maWxlU2VydmljZS53YXRjaChyZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuYWN0aXZlT3V0T2ZXb3Jrc3BhY2VXYXRjaGVycy5zZXQocmVzb3VyY2UsIGRpc3Bvc2FibGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBGaWxlIENoYW5nZXM6IE1vdmUgJiBEZWxldGVzIHRvIG1vdmUgb3IgY2xvc2Ugb3BlbmQgZWRpdG9yc1xuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRSdW5GaWxlT3BlcmF0aW9uKGU6IEZpbGVPcGVyYXRpb25FdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gSGFuZGxlIG1vdmVzIHNwZWNpYWxseSB3aGVuIGZpbGUgaXMgb3BlbmVkXG5cdFx0aWYgKGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5NT1ZFKSkge1xuXHRcdFx0dGhpcy5oYW5kbGVNb3ZlZEZpbGUoZS5yZXNvdXJjZSwgZS50YXJnZXQucmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBkZWxldGVzXG5cdFx0aWYgKGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5ERUxFVEUpIHx8IGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5NT1ZFKSkge1xuXHRcdFx0dGhpcy5oYW5kbGVEZWxldGVkRmlsZShlLnJlc291cmNlLCBmYWxzZSwgZS50YXJnZXQgPyBlLnRhcmdldC5yZXNvdXJjZSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEZpbGVzQ2hhbmdlKGU6IEZpbGVDaGFuZ2VzRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZS5nb3REZWxldGVkKCkpIHtcblx0XHRcdHRoaXMuaGFuZGxlRGVsZXRlZEZpbGUoZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVNb3ZlZEZpbGUoc291cmNlOiBVUkksIHRhcmdldDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5ncm91cHMpIHtcblx0XHRcdGNvbnN0IHJlcGxhY2VtZW50czogKElVbnR5cGVkRWRpdG9yUmVwbGFjZW1lbnQgfCBJRWRpdG9yUmVwbGFjZW1lbnQpW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZ3JvdXAuZWRpdG9ycykge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yKSA/PyBlZGl0b3IucmVzb3VyY2U7XG5cdFx0XHRcdGlmICghcmVzb3VyY2UgfHwgIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsT3JQYXJlbnQocmVzb3VyY2UsIHNvdXJjZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gbm90IG1hdGNoaW5nIG91ciByZXNvdXJjZVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRGV0ZXJtaW5lIG5ldyByZXN1bHRpbmcgdGFyZ2V0IHJlc291cmNlXG5cdFx0XHRcdGxldCB0YXJnZXRSZXNvdXJjZTogVVJJO1xuXHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoc291cmNlLCByZXNvdXJjZSkpIHtcblx0XHRcdFx0XHR0YXJnZXRSZXNvdXJjZSA9IHRhcmdldDsgLy8gZmlsZSBnb3QgbW92ZWRcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IGluZGV4T2ZQYXRoKHJlc291cmNlLnBhdGgsIHNvdXJjZS5wYXRoLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaWdub3JlUGF0aENhc2luZyhyZXNvdXJjZSkpO1xuXHRcdFx0XHRcdHRhcmdldFJlc291cmNlID0gam9pblBhdGgodGFyZ2V0LCByZXNvdXJjZS5wYXRoLnN1YnN0cihpbmRleCArIHNvdXJjZS5wYXRoLmxlbmd0aCArIDEpKTsgLy8gcGFyZW50IGZvbGRlciBnb3QgbW92ZWRcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIERlbGVnYXRlIHJlbmFtZSgpIHRvIGVkaXRvciBpbnN0YW5jZVxuXHRcdFx0XHRjb25zdCBtb3ZlUmVzdWx0ID0gYXdhaXQgZWRpdG9yLnJlbmFtZShncm91cC5pZCwgdGFyZ2V0UmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoIW1vdmVSZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIG5vdCB0YXJnZXQgLSBpZ25vcmVcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG9wdGlvbk92ZXJyaWRlcyA9IHtcblx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0cnVlLFxuXHRcdFx0XHRcdHBpbm5lZDogZ3JvdXAuaXNQaW5uZWQoZWRpdG9yKSxcblx0XHRcdFx0XHRzdGlja3k6IGdyb3VwLmlzU3RpY2t5KGVkaXRvciksXG5cdFx0XHRcdFx0aW5kZXg6IGdyb3VwLmdldEluZGV4T2ZFZGl0b3IoZWRpdG9yKSxcblx0XHRcdFx0XHRpbmFjdGl2ZTogIWdyb3VwLmlzQWN0aXZlKGVkaXRvcilcblx0XHRcdFx0fTtcblxuXHRcdFx0XHQvLyBDb25zdHJ1Y3QgYSByZXBsYWNlbWVudCB3aXRoIG91ciBleHRyYSBvcHRpb25zIG1peGVkIGluXG5cdFx0XHRcdGlmIChpc0VkaXRvcklucHV0KG1vdmVSZXN1bHQuZWRpdG9yKSkge1xuXHRcdFx0XHRcdHJlcGxhY2VtZW50cy5wdXNoKHtcblx0XHRcdFx0XHRcdGVkaXRvcixcblx0XHRcdFx0XHRcdHJlcGxhY2VtZW50OiBtb3ZlUmVzdWx0LmVkaXRvcixcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0Li4ubW92ZVJlc3VsdC5vcHRpb25zLFxuXHRcdFx0XHRcdFx0XHQuLi5vcHRpb25PdmVycmlkZXNcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXBsYWNlbWVudHMucHVzaCh7XG5cdFx0XHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdFx0XHRyZXBsYWNlbWVudDoge1xuXHRcdFx0XHRcdFx0XHQuLi5tb3ZlUmVzdWx0LmVkaXRvcixcblx0XHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdC4uLm1vdmVSZXN1bHQuZWRpdG9yLm9wdGlvbnMsXG5cdFx0XHRcdFx0XHRcdFx0Li4ub3B0aW9uT3ZlcnJpZGVzXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBcHBseSByZXBsYWNlbWVudHNcblx0XHRcdGlmIChyZXBsYWNlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMucmVwbGFjZUVkaXRvcnMocmVwbGFjZW1lbnRzLCBncm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbG9zZU9uRmlsZURlbGV0ZSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgb25Db25maWd1cmF0aW9uVXBkYXRlZChlPzogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlICYmICFlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd3b3JrYmVuY2guZWRpdG9yLmNsb3NlT25GaWxlRGVsZXRlJykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV29ya2JlbmNoRWRpdG9yQ29uZmlndXJhdGlvbj4oKTtcblx0XHRpZiAodHlwZW9mIGNvbmZpZ3VyYXRpb24ud29ya2JlbmNoPy5lZGl0b3I/LmNsb3NlT25GaWxlRGVsZXRlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRoaXMuY2xvc2VPbkZpbGVEZWxldGUgPSBjb25maWd1cmF0aW9uLndvcmtiZW5jaC5lZGl0b3IuY2xvc2VPbkZpbGVEZWxldGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY2xvc2VPbkZpbGVEZWxldGUgPSBmYWxzZTsgLy8gZGVmYXVsdFxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlRGVsZXRlZEZpbGUoYXJnMTogVVJJIHwgRmlsZUNoYW5nZXNFdmVudCwgaXNFeHRlcm5hbDogYm9vbGVhbiwgbW92ZWRUbz86IFVSSSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMuZ2V0QWxsTm9uRGlydHlFZGl0b3JzKHsgaW5jbHVkZVVudGl0bGVkOiBmYWxzZSwgc3VwcG9ydFNpZGVCeVNpZGU6IHRydWUgfSkpIHtcblx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3IpID8/IGVkaXRvci5yZXNvdXJjZTtcblx0XHRcdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEhhbmRsZSBkZWxldGVzIGluIG9wZW5lZCBlZGl0b3JzIGRlcGVuZGluZyBvbjpcblx0XHRcdFx0Ly8gLSB3ZSBjbG9zZSBhbnkgZWRpdG9yIHdoZW4gYGNsb3NlT25GaWxlRGVsZXRlOiB0cnVlYFxuXHRcdFx0XHQvLyAtIHdlIGNsb3NlIGFueSBlZGl0b3Igd2hlbiB0aGUgZGVsZXRlIG9jY3VycmVkIGZyb20gd2l0aGluIFZTQ29kZVxuXHRcdFx0XHRpZiAodGhpcy5jbG9zZU9uRmlsZURlbGV0ZSB8fCAhaXNFeHRlcm5hbCkge1xuXG5cdFx0XHRcdFx0Ly8gRG8gTk9UIGNsb3NlIGFueSBvcGVuZWQgZWRpdG9yIHRoYXQgbWF0Y2hlcyB0aGUgcmVzb3VyY2UgcGF0aCAoZWl0aGVyIGVxdWFsIG9yIGJlaW5nIHBhcmVudCkgb2YgdGhlXG5cdFx0XHRcdFx0Ly8gcmVzb3VyY2Ugd2UgbW92ZSB0byAobW92ZWRUbykuIE90aGVyd2lzZSB3ZSB3b3VsZCBjbG9zZSBhIHJlc291cmNlIHRoYXQgaGFzIGJlZW4gcmVuYW1lZCB0byB0aGUgc2FtZVxuXHRcdFx0XHRcdC8vIHBhdGggYnV0IGRpZmZlcmVudCBjYXNpbmcuXG5cdFx0XHRcdFx0aWYgKG1vdmVkVG8gJiYgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgbW92ZWRUbykpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgbWF0Y2hlcyA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmIChhcmcxIGluc3RhbmNlb2YgRmlsZUNoYW5nZXNFdmVudCkge1xuXHRcdFx0XHRcdFx0bWF0Y2hlcyA9IGFyZzEuY29udGFpbnMocmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtYXRjaGVzID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgYXJnMSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFtYXRjaGVzKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gV2UgaGF2ZSByZWNlaXZlZCByZXBvcnRzIG9mIHVzZXJzIHNlZWluZyBkZWxldGUgZXZlbnRzIGV2ZW4gdGhvdWdoIHRoZSBmaWxlIHN0aWxsXG5cdFx0XHRcdFx0Ly8gZXhpc3RzIChuZXR3b3JrIHNoYXJlcyBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzNjY1KS5cblx0XHRcdFx0XHQvLyBTaW5jZSB3ZSBkbyBub3Qgd2FudCB0byBjbG9zZSBhbiBlZGl0b3Igd2l0aG91dCByZWFzb24sIHdlIGhhdmUgdG8gY2hlY2sgaWYgdGhlXG5cdFx0XHRcdFx0Ly8gZmlsZSBpcyByZWFsbHkgZ29uZSBhbmQgbm90IGp1c3QgYSBmYXVsdHkgZmlsZSBldmVudC5cblx0XHRcdFx0XHQvLyBUaGlzIG9ubHkgYXBwbGllcyB0byBleHRlcm5hbCBmaWxlIGV2ZW50cywgc28gd2UgbmVlZCB0byBjaGVjayBmb3IgdGhlIGlzRXh0ZXJuYWxcblx0XHRcdFx0XHQvLyBmbGFnLlxuXHRcdFx0XHRcdGxldCBleGlzdHMgPSBmYWxzZTtcblx0XHRcdFx0XHRpZiAoaXNFeHRlcm5hbCAmJiB0aGlzLmZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGltZW91dCgxMDApO1xuXHRcdFx0XHRcdFx0ZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMocmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghZXhpc3RzICYmICFlZGl0b3IuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdFx0XHRlZGl0b3IuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbE5vbkRpcnR5RWRpdG9ycyhvcHRpb25zOiB7IGluY2x1ZGVVbnRpdGxlZDogYm9vbGVhbjsgc3VwcG9ydFNpZGVCeVNpZGU6IGJvb2xlYW4gfSk6IEVkaXRvcklucHV0W10ge1xuXHRcdGNvbnN0IGVkaXRvcnM6IEVkaXRvcklucHV0W10gPSBbXTtcblxuXHRcdGZ1bmN0aW9uIGNvbmRpdGlvbmFsbHlBZGRFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdFx0aWYgKGVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlVudGl0bGVkKSAmJiAhb3B0aW9ucy5pbmNsdWRlVW50aXRsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWRpdG9yLmlzRGlydHkoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHRoaXMuZWRpdG9ycykge1xuXHRcdFx0aWYgKG9wdGlvbnMuc3VwcG9ydFNpZGVCeVNpZGUgJiYgZWRpdG9yIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdGNvbmRpdGlvbmFsbHlBZGRFZGl0b3IoZWRpdG9yLnByaW1hcnkpO1xuXHRcdFx0XHRjb25kaXRpb25hbGx5QWRkRWRpdG9yKGVkaXRvci5zZWNvbmRhcnkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uZGl0aW9uYWxseUFkZEVkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JzO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEVkaXRvciBhY2Nlc3NvcnNcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcnNPYnNlcnZlcjogRWRpdG9yc09ic2VydmVyO1xuXG5cdGdldCBhY3RpdmVFZGl0b3JQYW5lKCk6IElWaXNpYmxlRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmFjdGl2ZUdyb3VwPy5hY3RpdmVFZGl0b3JQYW5lO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKCk6IElDb2RlRWRpdG9yIHwgSURpZmZFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSB0aGlzLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUNvbnRyb2wgPSBhY3RpdmVFZGl0b3JQYW5lLmdldENvbnRyb2woKTtcblx0XHRcdGlmIChpc0NvZGVFZGl0b3IoYWN0aXZlQ29udHJvbCkgfHwgaXNEaWZmRWRpdG9yKGFjdGl2ZUNvbnRyb2wpKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmVDb250cm9sO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQ29tcG9zaXRlRWRpdG9yKGFjdGl2ZUNvbnRyb2wpICYmIGlzQ29kZUVkaXRvcihhY3RpdmVDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmVDb250cm9sLmFjdGl2ZUNvZGVFZGl0b3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldCBhY3RpdmVUZXh0RWRpdG9yTGFuZ3VhZ2VJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCBhY3RpdmVDb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gdGhpcy5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRpZiAoaXNEaWZmRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0YWN0aXZlQ29kZUVkaXRvciA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGl2ZUNvZGVFZGl0b3IgPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gYWN0aXZlQ29kZUVkaXRvcj8uZ2V0TW9kZWwoKT8uZ2V0TGFuZ3VhZ2VJZCgpO1xuXHR9XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yc09ic2VydmVyLmNvdW50O1xuXHR9XG5cblx0Z2V0IGVkaXRvcnMoKTogRWRpdG9ySW5wdXRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkubWFwKCh7IGVkaXRvciB9KSA9PiBlZGl0b3IpO1xuXHR9XG5cblx0Z2V0RWRpdG9ycyhvcmRlcjogRWRpdG9yc09yZGVyLCBvcHRpb25zPzogeyBleGNsdWRlU3RpY2t5PzogYm9vbGVhbiB9KTogSUVkaXRvcklkZW50aWZpZXJbXSB7XG5cdFx0c3dpdGNoIChvcmRlcikge1xuXG5cdFx0XHQvLyBNUlVcblx0XHRcdGNhc2UgRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFOlxuXHRcdFx0XHRpZiAob3B0aW9ucz8uZXhjbHVkZVN0aWNreSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmVkaXRvcnNPYnNlcnZlci5lZGl0b3JzLmZpbHRlcigoeyBncm91cElkLCBlZGl0b3IgfSkgPT4gIXRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwKGdyb3VwSWQpPy5pc1N0aWNreShlZGl0b3IpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlzLmVkaXRvcnNPYnNlcnZlci5lZGl0b3JzO1xuXG5cdFx0XHQvLyBTZXF1ZW50aWFsXG5cdFx0XHRjYXNlIEVkaXRvcnNPcmRlci5TRVFVRU5USUFMOiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10gPSBbXTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpKSB7XG5cdFx0XHRcdFx0ZWRpdG9ycy5wdXNoKC4uLmdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIG9wdGlvbnMpLm1hcChlZGl0b3IgPT4gKHsgZWRpdG9yLCBncm91cElkOiBncm91cC5pZCB9KSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGVkaXRvcnM7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGFjdGl2ZUVkaXRvcigpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5hY3RpdmVHcm91cDtcblxuXHRcdHJldHVybiBhY3RpdmVHcm91cCA/IGFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvciA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgdmlzaWJsZUVkaXRvclBhbmVzKCk6IElWaXNpYmxlRWRpdG9yUGFuZVtdIHtcblx0XHRyZXR1cm4gY29hbGVzY2UodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5hY3RpdmVFZGl0b3JQYW5lKSk7XG5cdH1cblxuXHRnZXQgdmlzaWJsZVRleHRFZGl0b3JDb250cm9scygpOiBBcnJheTxJQ29kZUVkaXRvciB8IElEaWZmRWRpdG9yPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9HZXRWaXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzKHRoaXMudmlzaWJsZUVkaXRvclBhbmVzKTtcblx0fVxuXG5cdHByaXZhdGUgZG9HZXRWaXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzKGVkaXRvclBhbmVzOiBJVmlzaWJsZUVkaXRvclBhbmVbXSk6IEFycmF5PElDb2RlRWRpdG9yIHwgSURpZmZFZGl0b3I+IHtcblx0XHRjb25zdCB2aXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzOiBBcnJheTxJQ29kZUVkaXRvciB8IElEaWZmRWRpdG9yPiA9IFtdO1xuXHRcdGZvciAoY29uc3QgZWRpdG9yUGFuZSBvZiBlZGl0b3JQYW5lcykge1xuXHRcdFx0Y29uc3QgY29udHJvbHM6IEFycmF5PElFZGl0b3JDb250cm9sIHwgdW5kZWZpbmVkPiA9IFtdO1xuXHRcdFx0aWYgKGVkaXRvclBhbmUgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9yUGFuZSkge1xuXHRcdFx0XHRjb250cm9scy5wdXNoKGVkaXRvclBhbmUuZ2V0UHJpbWFyeUVkaXRvclBhbmUoKT8uZ2V0Q29udHJvbCgpKTtcblx0XHRcdFx0Y29udHJvbHMucHVzaChlZGl0b3JQYW5lLmdldFNlY29uZGFyeUVkaXRvclBhbmUoKT8uZ2V0Q29udHJvbCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRyb2xzLnB1c2goZWRpdG9yUGFuZS5nZXRDb250cm9sKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRyb2wgb2YgY29udHJvbHMpIHtcblx0XHRcdFx0aWYgKGlzQ29kZUVkaXRvcihjb250cm9sKSB8fCBpc0RpZmZFZGl0b3IoY29udHJvbCkpIHtcblx0XHRcdFx0XHR2aXNpYmxlVGV4dEVkaXRvckNvbnRyb2xzLnB1c2goY29udHJvbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdmlzaWJsZVRleHRFZGl0b3JDb250cm9scztcblx0fVxuXG5cdGdldFZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMob3JkZXI6IEVkaXRvcnNPcmRlcik6IHJlYWRvbmx5IChJQ29kZUVkaXRvciB8IElEaWZmRWRpdG9yKVtdIHtcblx0XHRyZXR1cm4gdGhpcy5kb0dldFZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMoY29hbGVzY2UodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXBzKG9yZGVyID09PSBFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCA/IEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSA6IEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKS5tYXAoZ3JvdXAgPT4gZ3JvdXAuYWN0aXZlRWRpdG9yUGFuZSkpKTtcblx0fVxuXG5cdGdldCB2aXNpYmxlRWRpdG9ycygpOiBFZGl0b3JJbnB1dFtdIHtcblx0XHRyZXR1cm4gY29hbGVzY2UodGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ3JvdXBzLm1hcChncm91cCA9PiBncm91cC5hY3RpdmVFZGl0b3IpKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBvcGVuRWRpdG9yKClcblxuXHRvcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIG9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucywgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRvcGVuRWRpdG9yKGVkaXRvcjogSVVudHlwZWRFZGl0b3JJbnB1dCwgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRvcGVuRWRpdG9yKGVkaXRvcjogSVJlc291cmNlRWRpdG9ySW5wdXQsIGdyb3VwPzogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPjtcblx0b3BlbkVkaXRvcihlZGl0b3I6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB8IElVbnRpdGxlZFRleHRSZXNvdXJjZUVkaXRvcklucHV0LCBncm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD47XG5cdG9wZW5FZGl0b3IoZWRpdG9yOiBJVGV4dFJlc291cmNlRGlmZkVkaXRvcklucHV0LCBncm91cD86IFByZWZlcnJlZEdyb3VwKTogUHJvbWlzZTxJVGV4dERpZmZFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPjtcblx0b3BlbkVkaXRvcihlZGl0b3I6IElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCwgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SVRleHREaWZmRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD47XG5cdG9wZW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCB8IElVbnR5cGVkRWRpdG9ySW5wdXQsIG9wdGlvbnNPclByZWZlcnJlZEdyb3VwPzogSUVkaXRvck9wdGlvbnMgfCBQcmVmZXJyZWRHcm91cCwgcHJlZmVycmVkR3JvdXA/OiBQcmVmZXJyZWRHcm91cCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+O1xuXHRhc3luYyBvcGVuRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQgfCBJVW50eXBlZEVkaXRvcklucHV0LCBvcHRpb25zT3JQcmVmZXJyZWRHcm91cD86IElFZGl0b3JPcHRpb25zIHwgUHJlZmVycmVkR3JvdXAsIHByZWZlcnJlZEdyb3VwPzogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IHR5cGVkRWRpdG9yOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgb3B0aW9ucyA9IGlzRWRpdG9ySW5wdXQoZWRpdG9yKSA/IG9wdGlvbnNPclByZWZlcnJlZEdyb3VwIGFzIElFZGl0b3JPcHRpb25zIDogZWRpdG9yLm9wdGlvbnM7XG5cdFx0bGV0IGdyb3VwOiBJRWRpdG9yR3JvdXAgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoaXNQcmVmZXJyZWRHcm91cChvcHRpb25zT3JQcmVmZXJyZWRHcm91cCkpIHtcblx0XHRcdHByZWZlcnJlZEdyb3VwID0gb3B0aW9uc09yUHJlZmVycmVkR3JvdXA7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSBvdmVycmlkZSB1bmxlc3MgZGlzYWJsZWRcblx0XHRpZiAoIWlzRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRFZGl0b3IgPSBhd2FpdCB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZS5yZXNvbHZlRWRpdG9yKGVkaXRvciwgcHJlZmVycmVkR3JvdXApO1xuXG5cdFx0XHRpZiAocmVzb2x2ZWRFZGl0b3IgPT09IFJlc29sdmVkU3RhdHVzLkFCT1JUKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gc2tpcCBlZGl0b3IgaWYgb3ZlcnJpZGUgaXMgYWJvcnRlZFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBXZSByZXNvbHZlZCBhbiBlZGl0b3IgdG8gdXNlXG5cdFx0XHRpZiAoaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAocmVzb2x2ZWRFZGl0b3IpKSB7XG5cdFx0XHRcdHR5cGVkRWRpdG9yID0gcmVzb2x2ZWRFZGl0b3IuZWRpdG9yO1xuXHRcdFx0XHRvcHRpb25zID0gcmVzb2x2ZWRFZGl0b3Iub3B0aW9ucztcblx0XHRcdFx0Z3JvdXAgPSByZXNvbHZlZEVkaXRvci5ncm91cDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPdmVycmlkZSBpcyBkaXNhYmxlZCBvciBkaWQgbm90IGFwcGx5OiBmYWxsYmFjayB0byBkZWZhdWx0XG5cdFx0aWYgKCF0eXBlZEVkaXRvcikge1xuXHRcdFx0dHlwZWRFZGl0b3IgPSBpc0VkaXRvcklucHV0KGVkaXRvcikgPyBlZGl0b3IgOiBhd2FpdCB0aGlzLnRleHRFZGl0b3JTZXJ2aWNlLnJlc29sdmVUZXh0RWRpdG9yKGVkaXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgZ3JvdXAgc3RpbGwgaXNuJ3QgZGVmaW5lZCBiZWNhdXNlIG9mIGEgZGlzYWJsZWQgb3ZlcnJpZGUgd2UgcmVzb2x2ZSBpdFxuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdGxldCBhY3RpdmF0aW9uOiBFZGl0b3JBY3RpdmF0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZmluZEdyb3VwUmVzdWx0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmaW5kR3JvdXAsIHsgZWRpdG9yOiB0eXBlZEVkaXRvciwgb3B0aW9ucyB9LCBwcmVmZXJyZWRHcm91cCk7XG5cdFx0XHRpZiAoZmluZEdyb3VwUmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0XHQoW2dyb3VwLCBhY3RpdmF0aW9uXSA9IGF3YWl0IGZpbmRHcm91cFJlc3VsdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQoW2dyb3VwLCBhY3RpdmF0aW9uXSA9IGZpbmRHcm91cFJlc3VsdCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1peGluIGVkaXRvciBncm91cCBhY3RpdmF0aW9uIGlmIHJldHVybmVkXG5cdFx0XHRpZiAoYWN0aXZhdGlvbikge1xuXHRcdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBhY3RpdmF0aW9uIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTW9kYWwgZ3JvdXA6IG92ZXJyaWRlIGBwcmVzZXJ2ZUZvY3VzYCB0byBtb3ZlIGZvY3VzIGludG8gdGhlIG1vZGFsIGJlY2F1c2UgdGhlcmUgaXMgbm90aGluZyB0byBwcmVzZXJ2ZSBpZiB0aGlzIGlzIHRoZSBmaXJzdCBtb2RhbCBlZGl0b3Jcblx0XHRpZiAoXG5cdFx0XHRvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzICYmXG5cdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQ/Lmdyb3Vwcy5zb21lKG1vZGFsR3JvdXAgPT4gbW9kYWxHcm91cC5pZCA9PT0gZ3JvdXAuaWQpICYmXG5cdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQuY291bnQgPT09IDEgJiZcblx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZU1vZGFsRWRpdG9yUGFydC5ncm91cHNbMF0uaXNFbXB0eVxuXHRcdCkge1xuXHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgcHJlc2VydmVGb2N1czogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZ3JvdXAub3BlbkVkaXRvcih0eXBlZEVkaXRvciwgb3B0aW9ucyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gb3BlbkVkaXRvcnMoKVxuXG5cdG9wZW5FZGl0b3JzKGVkaXRvcnM6IEVkaXRvcklucHV0V2l0aE9wdGlvbnNbXSwgZ3JvdXA/OiBQcmVmZXJyZWRHcm91cCwgb3B0aW9ucz86IElPcGVuRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lW10+O1xuXHRvcGVuRWRpdG9ycyhlZGl0b3JzOiBJVW50eXBlZEVkaXRvcklucHV0W10sIGdyb3VwPzogUHJlZmVycmVkR3JvdXAsIG9wdGlvbnM/OiBJT3BlbkVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTxJRWRpdG9yUGFuZVtdPjtcblx0b3BlbkVkaXRvcnMoZWRpdG9yczogQXJyYXk8RWRpdG9ySW5wdXRXaXRoT3B0aW9ucyB8IElVbnR5cGVkRWRpdG9ySW5wdXQ+LCBncm91cD86IFByZWZlcnJlZEdyb3VwLCBvcHRpb25zPzogSU9wZW5FZGl0b3JzT3B0aW9ucyk6IFByb21pc2U8SUVkaXRvclBhbmVbXT47XG5cdGFzeW5jIG9wZW5FZGl0b3JzKGVkaXRvcnM6IEFycmF5PEVkaXRvcklucHV0V2l0aE9wdGlvbnMgfCBJVW50eXBlZEVkaXRvcklucHV0PiwgcHJlZmVycmVkR3JvdXA/OiBQcmVmZXJyZWRHcm91cCwgb3B0aW9ucz86IElPcGVuRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPElFZGl0b3JQYW5lW10+IHtcblxuXHRcdC8vIFBhc3MgYWxsIGVkaXRvcnMgdG8gdHJ1c3Qgc2VydmljZSB0byBkZXRlcm1pbmUgaWZcblx0XHQvLyB3ZSBzaG91bGQgcHJvY2VlZCB3aXRoIG9wZW5pbmcgdGhlIGVkaXRvcnMgaWYgd2Vcblx0XHQvLyBhcmUgYXNrZWQgdG8gdmFsaWRhdGUgdHJ1c3QuXG5cdFx0aWYgKG9wdGlvbnM/LnZhbGlkYXRlVHJ1c3QpIHtcblx0XHRcdGNvbnN0IGVkaXRvcnNUcnVzdGVkID0gYXdhaXQgdGhpcy5oYW5kbGVXb3Jrc3BhY2VUcnVzdChlZGl0b3JzKTtcblx0XHRcdGlmICghZWRpdG9yc1RydXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbmQgdGFyZ2V0IGdyb3VwcyBmb3IgZWRpdG9ycyB0byBvcGVuXG5cdFx0Y29uc3QgbWFwR3JvdXBUb1R5cGVkRWRpdG9ycyA9IG5ldyBNYXA8SUVkaXRvckdyb3VwLCBBcnJheTxFZGl0b3JJbnB1dFdpdGhPcHRpb25zPj4oKTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cdFx0XHRsZXQgdHlwZWRFZGl0b3I6IEVkaXRvcklucHV0V2l0aE9wdGlvbnMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZ3JvdXA6IElFZGl0b3JHcm91cCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gUmVzb2x2ZSBvdmVycmlkZSB1bmxlc3MgZGlzYWJsZWRcblx0XHRcdGlmICghaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zKGVkaXRvcikpIHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRFZGl0b3IgPSBhd2FpdCB0aGlzLmVkaXRvclJlc29sdmVyU2VydmljZS5yZXNvbHZlRWRpdG9yKGVkaXRvciwgcHJlZmVycmVkR3JvdXApO1xuXG5cdFx0XHRcdGlmIChyZXNvbHZlZEVkaXRvciA9PT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gc2tpcCBlZGl0b3IgaWYgb3ZlcnJpZGUgaXMgYWJvcnRlZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2UgcmVzb2x2ZWQgYW4gZWRpdG9yIHRvIHVzZVxuXHRcdFx0XHRpZiAoaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAocmVzb2x2ZWRFZGl0b3IpKSB7XG5cdFx0XHRcdFx0dHlwZWRFZGl0b3IgPSByZXNvbHZlZEVkaXRvcjtcblx0XHRcdFx0XHRncm91cCA9IHJlc29sdmVkRWRpdG9yLmdyb3VwO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE92ZXJyaWRlIGlzIGRpc2FibGVkIG9yIGRpZCBub3QgYXBwbHk6IGZhbGxiYWNrIHRvIGRlZmF1bHRcblx0XHRcdGlmICghdHlwZWRFZGl0b3IpIHtcblx0XHRcdFx0dHlwZWRFZGl0b3IgPSBpc0VkaXRvcklucHV0V2l0aE9wdGlvbnMoZWRpdG9yKSA/IGVkaXRvciA6IHsgZWRpdG9yOiBhd2FpdCB0aGlzLnRleHRFZGl0b3JTZXJ2aWNlLnJlc29sdmVUZXh0RWRpdG9yKGVkaXRvciksIG9wdGlvbnM6IGVkaXRvci5vcHRpb25zIH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIGdyb3VwIHN0aWxsIGlzbid0IGRlZmluZWQgYmVjYXVzZSBvZiBhIGRpc2FibGVkIG92ZXJyaWRlIHdlIHJlc29sdmUgaXRcblx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0Y29uc3QgZmluZEdyb3VwUmVzdWx0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmaW5kR3JvdXAsIHR5cGVkRWRpdG9yLCBwcmVmZXJyZWRHcm91cCk7XG5cdFx0XHRcdGlmIChmaW5kR3JvdXBSZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG5cdFx0XHRcdFx0KFtncm91cF0gPSBhd2FpdCBmaW5kR3JvdXBSZXN1bHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdChbZ3JvdXBdID0gZmluZEdyb3VwUmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBNb2RhbCBncm91cDogb3ZlcnJpZGUgYHByZXNlcnZlRm9jdXNgIHRvIG1vdmUgZm9jdXMgaW50byB0aGUgbW9kYWwgdGhlcmUgaXMgbm90aGluZyB0byBwcmVzZXJ2ZSBpZiB0aGlzIGlzIHRoZSBmaXJzdCBtb2RhbCBlZGl0b3Jcblx0XHRcdGlmIChcblx0XHRcdFx0dHlwZWRFZGl0b3Iub3B0aW9ucz8ucHJlc2VydmVGb2N1cyAmJlxuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQ/Lmdyb3Vwcy5zb21lKG1vZGFsR3JvdXAgPT4gbW9kYWxHcm91cC5pZCA9PT0gZ3JvdXAuaWQpICYmXG5cdFx0XHRcdHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZU1vZGFsRWRpdG9yUGFydC5jb3VudCA9PT0gMSAmJlxuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQuZ3JvdXBzWzBdLmlzRW1wdHlcblx0XHRcdCkge1xuXHRcdFx0XHR0eXBlZEVkaXRvciA9IHsgLi4udHlwZWRFZGl0b3IsIG9wdGlvbnM6IHsgLi4udHlwZWRFZGl0b3Iub3B0aW9ucywgcHJlc2VydmVGb2N1czogZmFsc2UgfSB9O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgbWFwIG9mIGdyb3VwcyB0byBlZGl0b3JzXG5cdFx0XHRsZXQgdGFyZ2V0R3JvdXBFZGl0b3JzID0gbWFwR3JvdXBUb1R5cGVkRWRpdG9ycy5nZXQoZ3JvdXApO1xuXHRcdFx0aWYgKCF0YXJnZXRHcm91cEVkaXRvcnMpIHtcblx0XHRcdFx0dGFyZ2V0R3JvdXBFZGl0b3JzID0gW107XG5cdFx0XHRcdG1hcEdyb3VwVG9UeXBlZEVkaXRvcnMuc2V0KGdyb3VwLCB0YXJnZXRHcm91cEVkaXRvcnMpO1xuXHRcdFx0fVxuXG5cdFx0XHR0YXJnZXRHcm91cEVkaXRvcnMucHVzaCh0eXBlZEVkaXRvcik7XG5cdFx0fVxuXG5cdFx0Ly8gT3BlbiBpbiB0YXJnZXQgZ3JvdXBzXG5cdFx0Y29uc3QgcmVzdWx0OiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPltdID0gW107XG5cdFx0Zm9yIChjb25zdCBbZ3JvdXAsIGVkaXRvcnNdIG9mIG1hcEdyb3VwVG9UeXBlZEVkaXRvcnMpIHtcblx0XHRcdHJlc3VsdC5wdXNoKGdyb3VwLm9wZW5FZGl0b3JzKGVkaXRvcnMpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29hbGVzY2UoYXdhaXQgUHJvbWlzZXMuc2V0dGxlZChyZXN1bHQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlV29ya3NwYWNlVHJ1c3QoZWRpdG9yczogQXJyYXk8RWRpdG9ySW5wdXRXaXRoT3B0aW9ucyB8IElVbnR5cGVkRWRpdG9ySW5wdXQ+KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgeyByZXNvdXJjZXMsIGRpZmZNb2RlLCBtZXJnZU1vZGUgfSA9IHRoaXMuZXh0cmFjdEVkaXRvclJlc291cmNlcyhlZGl0b3JzKTtcblxuXHRcdGNvbnN0IHRydXN0UmVzdWx0ID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RPcGVuRmlsZXNUcnVzdChyZXNvdXJjZXMpO1xuXHRcdHN3aXRjaCAodHJ1c3RSZXN1bHQpIHtcblx0XHRcdGNhc2UgV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuSW5OZXdXaW5kb3c6XG5cdFx0XHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhyZXNvdXJjZXMubWFwKHJlc291cmNlID0+ICh7IGZpbGVVcmk6IHJlc291cmNlIH0pKSwgeyBmb3JjZU5ld1dpbmRvdzogdHJ1ZSwgZGlmZk1vZGUsIG1lcmdlTW9kZSB9KTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0Y2FzZSBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLkNhbmNlbDpcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZXh0cmFjdEVkaXRvclJlc291cmNlcyhlZGl0b3JzOiBBcnJheTxFZGl0b3JJbnB1dFdpdGhPcHRpb25zIHwgSVVudHlwZWRFZGl0b3JJbnB1dD4pOiB7IHJlc291cmNlczogVVJJW107IGRpZmZNb2RlPzogYm9vbGVhbjsgbWVyZ2VNb2RlPzogYm9vbGVhbiB9IHtcblx0XHRjb25zdCByZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRsZXQgZGlmZk1vZGUgPSBmYWxzZTtcblx0XHRsZXQgbWVyZ2VNb2RlID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cblx0XHRcdC8vIFR5cGVkIEVkaXRvclxuXHRcdFx0aWYgKGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9ucyhlZGl0b3IpKSB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3IuZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLkJPVEggfSk7XG5cdFx0XHRcdGlmIChVUkkuaXNVcmkocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0cmVzb3VyY2VzLmFkZChyZXNvdXJjZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRpZiAocmVzb3VyY2UucHJpbWFyeSkge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VzLmFkZChyZXNvdXJjZS5wcmltYXJ5KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocmVzb3VyY2Uuc2Vjb25kYXJ5KSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZXMuYWRkKHJlc291cmNlLnNlY29uZGFyeSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZGlmZk1vZGUgPSBlZGl0b3IuZWRpdG9yIGluc3RhbmNlb2YgRGlmZkVkaXRvcklucHV0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFVudHlwZWQgZWRpdG9yXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0aWYgKGlzUmVzb3VyY2VNZXJnZUVkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdFx0XHRpZiAoVVJJLmlzVXJpKGVkaXRvci5pbnB1dDEpKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZXMuYWRkKGVkaXRvci5pbnB1dDEucmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChVUkkuaXNVcmkoZWRpdG9yLmlucHV0MikpIHtcblx0XHRcdFx0XHRcdHJlc291cmNlcy5hZGQoZWRpdG9yLmlucHV0Mi5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaShlZGl0b3IuYmFzZSkpIHtcblx0XHRcdFx0XHRcdHJlc291cmNlcy5hZGQoZWRpdG9yLmJhc2UucmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChVUkkuaXNVcmkoZWRpdG9yLnJlc3VsdCkpIHtcblx0XHRcdFx0XHRcdHJlc291cmNlcy5hZGQoZWRpdG9yLnJlc3VsdC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bWVyZ2VNb2RlID0gdHJ1ZTtcblx0XHRcdFx0fSBpZiAoaXNSZXNvdXJjZURpZmZFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaShlZGl0b3Iub3JpZ2luYWwucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZXMuYWRkKGVkaXRvci5vcmlnaW5hbC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaShlZGl0b3IubW9kaWZpZWQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZXMuYWRkKGVkaXRvci5tb2RpZmllZC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZGlmZk1vZGUgPSB0cnVlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHRcdFx0cmVzb3VyY2VzLmFkZChlZGl0b3IucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlczogQXJyYXkuZnJvbShyZXNvdXJjZXMua2V5cygpKSxcblx0XHRcdGRpZmZNb2RlLFxuXHRcdFx0bWVyZ2VNb2RlXG5cdFx0fTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBpc09wZW5lZCgpIC8gaXNWaXNpYmxlKClcblxuXHRpc09wZW5lZChlZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0SWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvcnNPYnNlcnZlci5oYXNFZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKGVkaXRvci5yZXNvdXJjZSksXG5cdFx0XHR0eXBlSWQ6IGVkaXRvci50eXBlSWQsXG5cdFx0XHRlZGl0b3JJZDogZWRpdG9yLmVkaXRvcklkXG5cdFx0fSk7XG5cdH1cblxuXHRpc1Zpc2libGUoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAuYWN0aXZlRWRpdG9yPy5tYXRjaGVzKGVkaXRvcikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIGNsb3NlRWRpdG9yKClcblxuXHRhc3luYyBjbG9zZUVkaXRvcih7IGVkaXRvciwgZ3JvdXBJZCB9OiBJRWRpdG9ySWRlbnRpZmllciwgb3B0aW9ucz86IElDbG9zZUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwKGdyb3VwSWQpO1xuXG5cdFx0YXdhaXQgZ3JvdXA/LmNsb3NlRWRpdG9yKGVkaXRvciwgb3B0aW9ucyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gY2xvc2VFZGl0b3JzKClcblxuXHRhc3luYyBjbG9zZUVkaXRvcnMoZWRpdG9yczogSUVkaXRvcklkZW50aWZpZXJbXSwgb3B0aW9ucz86IElDbG9zZUVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtYXBHcm91cFRvRWRpdG9ycyA9IG5ldyBNYXA8SUVkaXRvckdyb3VwLCBFZGl0b3JJbnB1dFtdPigpO1xuXG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciwgZ3JvdXBJZCB9IG9mIGVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXAoZ3JvdXBJZCk7XG5cdFx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZWRpdG9ycyA9IG1hcEdyb3VwVG9FZGl0b3JzLmdldChncm91cCk7XG5cdFx0XHRpZiAoIWVkaXRvcnMpIHtcblx0XHRcdFx0ZWRpdG9ycyA9IFtdO1xuXHRcdFx0XHRtYXBHcm91cFRvRWRpdG9ycy5zZXQoZ3JvdXAsIGVkaXRvcnMpO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFtncm91cCwgZWRpdG9yc10gb2YgbWFwR3JvdXBUb0VkaXRvcnMpIHtcblx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlRWRpdG9ycyhlZGl0b3JzLCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gZmluZEVkaXRvcnMoKVxuXG5cdGZpbmRFZGl0b3JzKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJRmluZEVkaXRvck9wdGlvbnMpOiByZWFkb25seSBJRWRpdG9ySWRlbnRpZmllcltdO1xuXHRmaW5kRWRpdG9ycyhlZGl0b3I6IElSZXNvdXJjZUVkaXRvcklucHV0SWRlbnRpZmllciwgb3B0aW9ucz86IElGaW5kRWRpdG9yT3B0aW9ucyk6IHJlYWRvbmx5IElFZGl0b3JJZGVudGlmaWVyW107XG5cdGZpbmRFZGl0b3JzKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElGaW5kRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgZ3JvdXA6IElFZGl0b3JHcm91cCB8IEdyb3VwSWRlbnRpZmllcik6IHJlYWRvbmx5IEVkaXRvcklucHV0W107XG5cdGZpbmRFZGl0b3JzKGVkaXRvcjogSVJlc291cmNlRWRpdG9ySW5wdXRJZGVudGlmaWVyLCBvcHRpb25zOiBJRmluZEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGdyb3VwOiBJRWRpdG9yR3JvdXAgfCBHcm91cElkZW50aWZpZXIpOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0ZmluZEVkaXRvcnMoYXJnMTogVVJJIHwgSVJlc291cmNlRWRpdG9ySW5wdXRJZGVudGlmaWVyLCBvcHRpb25zOiBJRmluZEVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGFyZzI/OiBJRWRpdG9yR3JvdXAgfCBHcm91cElkZW50aWZpZXIpOiByZWFkb25seSBJRWRpdG9ySWRlbnRpZmllcltdIHwgcmVhZG9ubHkgRWRpdG9ySW5wdXRbXSB8IEVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRmaW5kRWRpdG9ycyhhcmcxOiBVUkkgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dElkZW50aWZpZXIsIG9wdGlvbnM6IElGaW5kRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgYXJnMj86IElFZGl0b3JHcm91cCB8IEdyb3VwSWRlbnRpZmllcik6IHJlYWRvbmx5IElFZGl0b3JJZGVudGlmaWVyW10gfCByZWFkb25seSBFZGl0b3JJbnB1dFtdIHwgRWRpdG9ySW5wdXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmlzVXJpKGFyZzEpID8gYXJnMSA6IGFyZzEucmVzb3VyY2U7XG5cdFx0Y29uc3QgdHlwZUlkID0gVVJJLmlzVXJpKGFyZzEpID8gdW5kZWZpbmVkIDogYXJnMS50eXBlSWQ7XG5cblx0XHQvLyBEbyBhIHF1aWNrIGNoZWNrIGZvciB0aGUgcmVzb3VyY2UgdmlhIHRoZSBlZGl0b3Igb2JzZXJ2ZXJcblx0XHQvLyB3aGljaCBpcyBhIHZlcnkgZWZmaWNpZW50IHdheSB0byBmaW5kIGFuIGVkaXRvciBieSByZXNvdXJjZS5cblx0XHQvLyBIb3dldmVyLCB3ZSBjYW4gb25seSBkbyB0aGF0IHVubGVzcyB3ZSBhcmUgYXNrZWQgdG8gZmluZCBhblxuXHRcdC8vIGVkaXRvciBvbiB0aGUgc2Vjb25kYXJ5IHNpZGUgb2YgYSBzaWRlIGJ5IHNpZGUgZWRpdG9yLCBiZWNhdXNlXG5cdFx0Ly8gdGhlIGVkaXRvciBvYnNlcnZlciBwcm92aWRlcyBmYXN0IGxvb2t1cHMgb25seSBmb3IgcHJpbWFyeVxuXHRcdC8vIGVkaXRvcnMuXG5cdFx0aWYgKG9wdGlvbnM/LnN1cHBvcnRTaWRlQnlTaWRlICE9PSBTaWRlQnlTaWRlRWRpdG9yLkFOWSAmJiBvcHRpb25zPy5zdXBwb3J0U2lkZUJ5U2lkZSAhPT0gU2lkZUJ5U2lkZUVkaXRvci5TRUNPTkRBUlkpIHtcblx0XHRcdGlmICghdGhpcy5lZGl0b3JzT2JzZXJ2ZXIuaGFzRWRpdG9ycyhyZXNvdXJjZSkpIHtcblx0XHRcdFx0aWYgKFVSSS5pc1VyaShhcmcxKSB8fCBpc1VuZGVmaW5lZChhcmcyKSkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2VhcmNoIG9ubHkgaW4gc3BlY2lmaWMgZ3JvdXBcblx0XHRpZiAoIWlzVW5kZWZpbmVkKGFyZzIpKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRHcm91cCA9IHR5cGVvZiBhcmcyID09PSAnbnVtYmVyJyA/IHRoaXMuZWRpdG9yR3JvdXBzQ29udGFpbmVyLmdldEdyb3VwKGFyZzIpIDogYXJnMjtcblxuXHRcdFx0Ly8gUmVzb3VyY2UgcHJvdmlkZWQ6IHJlc3VsdCBpcyBhbiBhcnJheVxuXHRcdFx0aWYgKFVSSS5pc1VyaShhcmcxKSkge1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRhcmdldEdyb3VwLmZpbmRFZGl0b3JzKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRWRpdG9yIGlkZW50aWZpZXIgcHJvdmlkZWQsIHJlc3VsdCBpcyBzaW5nbGVcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGVkaXRvcnMgPSB0YXJnZXRHcm91cC5maW5kRWRpdG9ycyhyZXNvdXJjZSwgb3B0aW9ucyk7XG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0XHRpZiAoZWRpdG9yLnR5cGVJZCA9PT0gdHlwZUlkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2VhcmNoIGFjcm9zcyBhbGwgZ3JvdXBzIGluIE1SVSBvcmRlclxuXHRcdGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJRWRpdG9ySWRlbnRpZmllcltdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXBzKG9wdGlvbnM/Lm9yZGVyID09PSBFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCA/IEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSA6IEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JzOiBFZGl0b3JJbnB1dFtdID0gW107XG5cblx0XHRcdFx0Ly8gUmVzb3VyY2UgcHJvdmlkZWQ6IHJlc3VsdCBpcyBhbiBhcnJheVxuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKGFyZzEpKSB7XG5cdFx0XHRcdFx0ZWRpdG9ycy5wdXNoKC4uLnRoaXMuZmluZEVkaXRvcnMoYXJnMSwgb3B0aW9ucywgZ3JvdXApKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEVkaXRvciBpZGVudGlmaWVyIHByb3ZpZGVkLCByZXN1bHQgaXMgc2luZ2xlXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuZmluZEVkaXRvcnMoYXJnMSwgb3B0aW9ucywgZ3JvdXApO1xuXHRcdFx0XHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdFx0XHRcdGVkaXRvcnMucHVzaChlZGl0b3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlc3VsdC5wdXNoKC4uLmVkaXRvcnMubWFwKGVkaXRvciA9PiAoeyBlZGl0b3IsIGdyb3VwSWQ6IGdyb3VwLmlkIH0pKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIHJlcGxhY2VFZGl0b3JzKClcblxuXHRhc3luYyByZXBsYWNlRWRpdG9ycyhyZXBsYWNlbWVudHM6IElVbnR5cGVkRWRpdG9yUmVwbGFjZW1lbnRbXSwgZ3JvdXA6IElFZGl0b3JHcm91cCB8IEdyb3VwSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD47XG5cdGFzeW5jIHJlcGxhY2VFZGl0b3JzKHJlcGxhY2VtZW50czogSUVkaXRvclJlcGxhY2VtZW50W10sIGdyb3VwOiBJRWRpdG9yR3JvdXAgfCBHcm91cElkZW50aWZpZXIpOiBQcm9taXNlPHZvaWQ+O1xuXHRhc3luYyByZXBsYWNlRWRpdG9ycyhyZXBsYWNlbWVudHM6IEFycmF5PElFZGl0b3JSZXBsYWNlbWVudCB8IElVbnR5cGVkRWRpdG9yUmVwbGFjZW1lbnQ+LCBncm91cDogSUVkaXRvckdyb3VwIHwgR3JvdXBJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSB0eXBlb2YgZ3JvdXAgPT09ICdudW1iZXInID8gdGhpcy5lZGl0b3JHcm91cHNDb250YWluZXIuZ2V0R3JvdXAoZ3JvdXApIDogZ3JvdXA7XG5cblx0XHQvLyBDb252ZXJ0IGFsbCByZXBsYWNlbWVudHMgdG8gdHlwZWQgZWRpdG9ycyB1bmxlc3MgYWxyZWFkeVxuXHRcdC8vIHR5cGVkIGFuZCBoYW5kbGUgb3ZlcnJpZGVzIHByb3Blcmx5LlxuXHRcdGNvbnN0IHR5cGVkUmVwbGFjZW1lbnRzOiBJRWRpdG9yUmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgcmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRsZXQgdHlwZWRSZXBsYWNlbWVudDogSUVkaXRvclJlcGxhY2VtZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBSZXNvbHZlIG92ZXJyaWRlIHVubGVzcyBkaXNhYmxlZFxuXHRcdFx0aWYgKCFpc0VkaXRvcklucHV0KHJlcGxhY2VtZW50LnJlcGxhY2VtZW50KSkge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZEVkaXRvciA9IGF3YWl0IHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVFZGl0b3IoXG5cdFx0XHRcdFx0cmVwbGFjZW1lbnQucmVwbGFjZW1lbnQsXG5cdFx0XHRcdFx0dGFyZ2V0R3JvdXBcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRpZiAocmVzb2x2ZWRFZGl0b3IgPT09IFJlc29sdmVkU3RhdHVzLkFCT1JUKSB7XG5cdFx0XHRcdFx0Y29udGludWU7IC8vIHNraXAgZWRpdG9yIGlmIG92ZXJyaWRlIGlzIGFib3J0ZWRcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFdlIHJlc29sdmVkIGFuIGVkaXRvciB0byB1c2Vcblx0XHRcdFx0aWYgKGlzRWRpdG9ySW5wdXRXaXRoT3B0aW9uc0FuZEdyb3VwKHJlc29sdmVkRWRpdG9yKSkge1xuXHRcdFx0XHRcdHR5cGVkUmVwbGFjZW1lbnQgPSB7XG5cdFx0XHRcdFx0XHRlZGl0b3I6IHJlcGxhY2VtZW50LmVkaXRvcixcblx0XHRcdFx0XHRcdHJlcGxhY2VtZW50OiByZXNvbHZlZEVkaXRvci5lZGl0b3IsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiByZXNvbHZlZEVkaXRvci5vcHRpb25zLFxuXHRcdFx0XHRcdFx0Zm9yY2VSZXBsYWNlRGlydHk6IHJlcGxhY2VtZW50LmZvcmNlUmVwbGFjZURpcnR5XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdmVycmlkZSBpcyBkaXNhYmxlZCBvciBkaWQgbm90IGFwcGx5OiBmYWxsYmFjayB0byBkZWZhdWx0XG5cdFx0XHRpZiAoIXR5cGVkUmVwbGFjZW1lbnQpIHtcblx0XHRcdFx0dHlwZWRSZXBsYWNlbWVudCA9IHtcblx0XHRcdFx0XHRlZGl0b3I6IHJlcGxhY2VtZW50LmVkaXRvcixcblx0XHRcdFx0XHRyZXBsYWNlbWVudDogaXNFZGl0b3JSZXBsYWNlbWVudChyZXBsYWNlbWVudCkgPyByZXBsYWNlbWVudC5yZXBsYWNlbWVudCA6IGF3YWl0IHRoaXMudGV4dEVkaXRvclNlcnZpY2UucmVzb2x2ZVRleHRFZGl0b3IocmVwbGFjZW1lbnQucmVwbGFjZW1lbnQpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IGlzRWRpdG9yUmVwbGFjZW1lbnQocmVwbGFjZW1lbnQpID8gcmVwbGFjZW1lbnQub3B0aW9ucyA6IHJlcGxhY2VtZW50LnJlcGxhY2VtZW50Lm9wdGlvbnMsXG5cdFx0XHRcdFx0Zm9yY2VSZXBsYWNlRGlydHk6IHJlcGxhY2VtZW50LmZvcmNlUmVwbGFjZURpcnR5XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHR5cGVkUmVwbGFjZW1lbnRzLnB1c2godHlwZWRSZXBsYWNlbWVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRhcmdldEdyb3VwPy5yZXBsYWNlRWRpdG9ycyh0eXBlZFJlcGxhY2VtZW50cyk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gc2F2ZS9yZXZlcnRcblxuXHRhc3luYyBzYXZlKGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyIHwgSUVkaXRvcklkZW50aWZpZXJbXSwgb3B0aW9ucz86IElTYXZlRWRpdG9yc09wdGlvbnMpOiBQcm9taXNlPElTYXZlRWRpdG9yc1Jlc3VsdD4ge1xuXG5cdFx0Ly8gQ29udmVydCB0byBhcnJheVxuXHRcdGlmICghQXJyYXkuaXNBcnJheShlZGl0b3JzKSkge1xuXHRcdFx0ZWRpdG9ycyA9IFtlZGl0b3JzXTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gbm90IHNhdmUgdGhlIHNhbWUgZWRpdG9yIG11bHRpcGxlIHRpbWVzXG5cdFx0Ly8gYnkgdXNpbmcgdGhlIGBtYXRjaGVzKClgIG1ldGhvZCB0byBmaW5kIGR1cGxpY2F0ZXNcblx0XHRjb25zdCB1bmlxdWVFZGl0b3JzID0gdGhpcy5nZXRVbmlxdWVFZGl0b3JzKGVkaXRvcnMpO1xuXG5cdFx0Ly8gU3BsaXQgZWRpdG9ycyB1cCBpbnRvIGEgYnVja2V0IHRoYXQgaXMgc2F2ZWQgaW4gcGFyYWxsZWxcblx0XHQvLyBhbmQgc2VxdWVudGlhbGx5LiBVbmxlc3MgXCJTYXZlIEFzXCIsIGFsbCBub24tdW50aXRsZWQgZWRpdG9yc1xuXHRcdC8vIGNhbiBiZSBzYXZlZCBpbiBwYXJhbGxlbCB0byBzcGVlZCB1cCB0aGUgb3BlcmF0aW9uLiBSZW1haW5pbmdcblx0XHQvLyBlZGl0b3JzIGFyZSBwb3RlbnRpYWxseSBicmluZ2luZyB1cCBzb21lIFVJIGFuZCB0aHVzIHJ1blxuXHRcdC8vIHNlcXVlbnRpYWxseS5cblx0XHRjb25zdCBlZGl0b3JzVG9TYXZlUGFyYWxsZWw6IElFZGl0b3JJZGVudGlmaWVyW10gPSBbXTtcblx0XHRjb25zdCBlZGl0b3JzVG9TYXZlU2VxdWVudGlhbGx5OiBJRWRpdG9ySWRlbnRpZmllcltdID0gW107XG5cdFx0aWYgKG9wdGlvbnM/LnNhdmVBcykge1xuXHRcdFx0ZWRpdG9yc1RvU2F2ZVNlcXVlbnRpYWxseS5wdXNoKC4uLnVuaXF1ZUVkaXRvcnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgZ3JvdXBJZCwgZWRpdG9yIH0gb2YgdW5pcXVlRWRpdG9ycykge1xuXHRcdFx0XHRpZiAoZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpKSB7XG5cdFx0XHRcdFx0ZWRpdG9yc1RvU2F2ZVNlcXVlbnRpYWxseS5wdXNoKHsgZ3JvdXBJZCwgZWRpdG9yIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVkaXRvcnNUb1NhdmVQYXJhbGxlbC5wdXNoKHsgZ3JvdXBJZCwgZWRpdG9yIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRWRpdG9ycyB0byBzYXZlIGluIHBhcmFsbGVsXG5cdFx0Y29uc3Qgc2F2ZVJlc3VsdHMgPSBhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGVkaXRvcnNUb1NhdmVQYXJhbGxlbC5tYXAoKHsgZ3JvdXBJZCwgZWRpdG9yIH0pID0+IHtcblxuXHRcdFx0Ly8gVXNlIHNhdmUgYXMgYSBoaW50IHRvIHBpbiB0aGUgZWRpdG9yIGlmIHVzZWQgZXhwbGljaXRseVxuXHRcdFx0aWYgKG9wdGlvbnM/LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5FWFBMSUNJVCkge1xuXHRcdFx0XHR0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cChncm91cElkKT8ucGluRWRpdG9yKGVkaXRvcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNhdmVcblx0XHRcdHJldHVybiBlZGl0b3Iuc2F2ZShncm91cElkLCBvcHRpb25zKTtcblx0XHR9KSk7XG5cblx0XHQvLyBFZGl0b3JzIHRvIHNhdmUgc2VxdWVudGlhbGx5XG5cdFx0Zm9yIChjb25zdCB7IGdyb3VwSWQsIGVkaXRvciB9IG9mIGVkaXRvcnNUb1NhdmVTZXF1ZW50aWFsbHkpIHtcblx0XHRcdGlmIChlZGl0b3IuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBtaWdodCBoYXZlIGJlZW4gZGlzcG9zZWQgZnJvbSB0aGUgc2F2ZSBhbHJlYWR5XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByZXNlcnZlIHZpZXcgc3RhdGUgYnkgb3BlbmluZyB0aGUgZWRpdG9yIGZpcnN0IGlmIHRoZSBlZGl0b3Jcblx0XHRcdC8vIGlzIHVudGl0bGVkIG9yIHdlIFwiU2F2ZSBBc1wiLiBUaGlzIGFsc28gYWxsb3dzIHRoZSB1c2VyIHRvIHJldmlld1xuXHRcdFx0Ly8gdGhlIGNvbnRlbnRzIG9mIHRoZSBlZGl0b3IgYmVmb3JlIG1ha2luZyBhIGRlY2lzaW9uLlxuXHRcdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGF3YWl0IHRoaXMub3BlbkVkaXRvcihlZGl0b3IsIGdyb3VwSWQpO1xuXHRcdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdFx0dmlld1N0YXRlOiBlZGl0b3JQYW5lPy5nZXRWaWV3U3RhdGUoKVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gb3B0aW9ucz8uc2F2ZUFzID8gYXdhaXQgZWRpdG9yLnNhdmVBcyhncm91cElkLCBvcHRpb25zKSA6IGF3YWl0IGVkaXRvci5zYXZlKGdyb3VwSWQsIG9wdGlvbnMpO1xuXHRcdFx0c2F2ZVJlc3VsdHMucHVzaChyZXN1bHQpO1xuXG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRicmVhazsgLy8gZmFpbGVkIG9yIGNhbmNlbGxlZCwgYWJvcnRcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVwbGFjZSBlZGl0b3IgcHJlc2VydmluZyB2aWV3c3RhdGUgKGVpdGhlciBhY3Jvc3MgYWxsIGdyb3VwcyBvclxuXHRcdFx0Ly8gb25seSBzZWxlY3RlZCBncm91cCkgaWYgdGhlIHJlc3VsdGluZyBlZGl0b3IgaXMgZGlmZmVyZW50IGZyb20gdGhlXG5cdFx0XHQvLyBjdXJyZW50IG9uZS5cblx0XHRcdGlmICghZWRpdG9yLm1hdGNoZXMocmVzdWx0KSkge1xuXHRcdFx0XHRjb25zdCB0YXJnZXRHcm91cHMgPSBlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5VbnRpdGxlZCkgPyB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmlkKSAvKiB1bnRpdGxlZCByZXBsYWNlcyBhY3Jvc3MgYWxsIGdyb3VwcyAqLyA6IFtncm91cElkXTtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXJnZXRHcm91cCBvZiB0YXJnZXRHcm91cHMpIHtcblx0XHRcdFx0XHRpZiAocmVzdWx0IGluc3RhbmNlb2YgRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yLCByZXBsYWNlbWVudDogcmVzdWx0LCBvcHRpb25zOiBlZGl0b3JPcHRpb25zIH1dLCB0YXJnZXRHcm91cCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yLCByZXBsYWNlbWVudDogeyAuLi5yZXN1bHQsIG9wdGlvbnM6IGVkaXRvck9wdGlvbnMgfSB9XSwgdGFyZ2V0R3JvdXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3VjY2Vzczogc2F2ZVJlc3VsdHMuZXZlcnkocmVzdWx0ID0+ICEhcmVzdWx0KSxcblx0XHRcdGVkaXRvcnM6IGNvYWxlc2NlKHNhdmVSZXN1bHRzKVxuXHRcdH07XG5cdH1cblxuXHRzYXZlQWxsKG9wdGlvbnM/OiBJU2F2ZUFsbEVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTxJU2F2ZUVkaXRvcnNSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zYXZlKHRoaXMuZ2V0QWxsTW9kaWZpZWRFZGl0b3JzKG9wdGlvbnMpLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIHJldmVydChlZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllciB8IElFZGl0b3JJZGVudGlmaWVyW10sIG9wdGlvbnM/OiBJUmV2ZXJ0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gQ29udmVydCB0byBhcnJheVxuXHRcdGlmICghQXJyYXkuaXNBcnJheShlZGl0b3JzKSkge1xuXHRcdFx0ZWRpdG9ycyA9IFtlZGl0b3JzXTtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdG8gbm90IHJldmVydCB0aGUgc2FtZSBlZGl0b3IgbXVsdGlwbGUgdGltZXNcblx0XHQvLyBieSB1c2luZyB0aGUgYG1hdGNoZXMoKWAgbWV0aG9kIHRvIGZpbmQgZHVwbGljYXRlc1xuXHRcdGNvbnN0IHVuaXF1ZUVkaXRvcnMgPSB0aGlzLmdldFVuaXF1ZUVkaXRvcnMoZWRpdG9ycyk7XG5cblx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHVuaXF1ZUVkaXRvcnMubWFwKGFzeW5jICh7IGdyb3VwSWQsIGVkaXRvciB9KSA9PiB7XG5cblx0XHRcdC8vIFVzZSByZXZlcnQgYXMgYSBoaW50IHRvIHBpbiB0aGUgZWRpdG9yXG5cdFx0XHR0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cChncm91cElkKT8ucGluRWRpdG9yKGVkaXRvcik7XG5cblx0XHRcdHJldHVybiBlZGl0b3IucmV2ZXJ0KGdyb3VwSWQsIG9wdGlvbnMpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiAhdW5pcXVlRWRpdG9ycy5zb21lKCh7IGVkaXRvciB9KSA9PiBlZGl0b3IuaXNEaXJ0eSgpKTtcblx0fVxuXG5cdGFzeW5jIHJldmVydEFsbChvcHRpb25zPzogSVJldmVydEFsbEVkaXRvcnNPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMucmV2ZXJ0KHRoaXMuZ2V0QWxsTW9kaWZpZWRFZGl0b3JzKG9wdGlvbnMpLCBvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWxsTW9kaWZpZWRFZGl0b3JzKG9wdGlvbnM/OiBJQmFzZVNhdmVSZXZlcnRBbGxFZGl0b3JPcHRpb25zKTogSUVkaXRvcklkZW50aWZpZXJbXSB7XG5cdFx0Y29uc3QgZWRpdG9yczogSUVkaXRvcklkZW50aWZpZXJbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvckdyb3Vwc0NvbnRhaW5lci5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBncm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkpIHtcblx0XHRcdFx0aWYgKCFlZGl0b3IuaXNNb2RpZmllZCgpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoKHR5cGVvZiBvcHRpb25zPy5pbmNsdWRlVW50aXRsZWQgPT09ICdib29sZWFuJyB8fCAhb3B0aW9ucz8uaW5jbHVkZVVudGl0bGVkPy5pbmNsdWRlU2NyYXRjaHBhZClcblx0XHRcdFx0XHQmJiBlZGl0b3IuaGFzQ2FwYWJpbGl0eShFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5TY3JhdGNocGFkKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFvcHRpb25zPy5pbmNsdWRlVW50aXRsZWQgJiYgZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAob3B0aW9ucz8uZXhjbHVkZVN0aWNreSAmJiBncm91cC5pc1N0aWNreShlZGl0b3IpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlZGl0b3JzLnB1c2goeyBncm91cElkOiBncm91cC5pZCwgZWRpdG9yIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVbmlxdWVFZGl0b3JzKGVkaXRvcnM6IElFZGl0b3JJZGVudGlmaWVyW10pOiBJRWRpdG9ySWRlbnRpZmllcltdIHtcblx0XHRjb25zdCB1bmlxdWVFZGl0b3JzOiBJRWRpdG9ySWRlbnRpZmllcltdID0gW107XG5cdFx0Zm9yIChjb25zdCB7IGVkaXRvciwgZ3JvdXBJZCB9IG9mIGVkaXRvcnMpIHtcblx0XHRcdGlmICh1bmlxdWVFZGl0b3JzLnNvbWUodW5pcXVlRWRpdG9yID0+IHVuaXF1ZUVkaXRvci5lZGl0b3IubWF0Y2hlcyhlZGl0b3IpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dW5pcXVlRWRpdG9ycy5wdXNoKHsgZWRpdG9yLCBncm91cElkIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmlxdWVFZGl0b3JzO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBEaXNwb3NlIHJlbWFpbmluZyB3YXRjaGVycyBpZiBhbnlcblx0XHR0aGlzLmFjdGl2ZU91dE9mV29ya3NwYWNlV2F0Y2hlcnMuZm9yRWFjaChkaXNwb3NhYmxlID0+IGRpc3Bvc2UoZGlzcG9zYWJsZSkpO1xuXHRcdHRoaXMuYWN0aXZlT3V0T2ZXb3Jrc3BhY2VXYXRjaGVycy5jbGVhcigpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElFZGl0b3JTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoRWRpdG9yU2VydmljZSwgW3VuZGVmaW5lZF0sIGZhbHNlKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsa0JBQW9JLDBC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
