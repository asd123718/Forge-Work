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
import { distinct, insert } from "../../../../base/common/arrays.js";
import { PauseableEmitter } from "../../../../base/common/event.js";
import * as glob from "../../../../base/common/glob.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, extname } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { EditorActivation, EditorResolution } from "../../../../platform/editor/common/editor.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { DEFAULT_EDITOR_ASSOCIATION, EditorResourceAccessor, isEditorInputWithOptions, isEditorInputWithOptionsAndGroup, isResourceDiffEditorInput, isResourceMergeEditorInput, isResourceMultiDiffEditorInput, isResourceSideBySideEditorInput, isUntitledResourceEditorInput, SideBySideEditor } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { findGroup } from "../common/editorGroupFinder.js";
import { IEditorGroupsService } from "../common/editorGroupsService.js";
import { diffEditorsAssociationsSettingId, editorsAssociationsSettingId, globMatchesResource, IEditorResolverService, priorityToRank, RegisteredEditorPriority, ResolvedStatus, toRegisteredEditorPriorityInfo } from "../common/editorResolverService.js";
function normalizeRegisteredEditorInfo(editorInfo) {
  return {
    id: editorInfo.id,
    label: editorInfo.label,
    detail: editorInfo.detail,
    priority: toRegisteredEditorPriorityInfo(editorInfo.priority)
  };
}
var EditorAssociationType = /* @__PURE__ */ ((EditorAssociationType2) => {
  EditorAssociationType2[EditorAssociationType2["Editor"] = 0] = "Editor";
  EditorAssociationType2[EditorAssociationType2["DiffEditor"] = 1] = "DiffEditor";
  EditorAssociationType2[EditorAssociationType2["MergeEditor"] = 2] = "MergeEditor";
  return EditorAssociationType2;
})(EditorAssociationType || {});
let EditorResolverService = class extends Disposable {
  constructor(editorGroupService, instantiationService, configurationService, quickInputService, notificationService, storageService, extensionService, logService, uriIdentityService) {
    super();
    this.editorGroupService = editorGroupService;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.quickInputService = quickInputService;
    this.notificationService = notificationService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.logService = logService;
    this.uriIdentityService = uriIdentityService;
    // Events
    this._onDidChangeEditorRegistrations = this._register(new PauseableEmitter());
    this.onDidChangeEditorRegistrations = this._onDidChangeEditorRegistrations.event;
    // Data Stores
    this._editors = /* @__PURE__ */ new Map();
    this._flattenedEditors = /* @__PURE__ */ new Map();
    this._shouldReFlattenEditors = true;
    this.cache = new Set(JSON.parse(this.storageService.get(EditorResolverService.cacheStorageID, StorageScope.PROFILE, JSON.stringify([]))));
    this.storageService.remove(EditorResolverService.cacheStorageID, StorageScope.PROFILE);
    this._register(this.storageService.onWillSaveState(() => {
      this.cacheEditors();
    }));
    this._register(this.extensionService.onDidRegisterExtensions(() => {
      this.cache = void 0;
    }));
  }
  resolveUntypedInputAndGroup(editor, preferredGroup) {
    const untypedEditor = editor;
    const findGroupResult = this.instantiationService.invokeFunction(findGroup, untypedEditor, preferredGroup);
    if (findGroupResult instanceof Promise) {
      return findGroupResult.then(([group, activation]) => [untypedEditor, group, activation]);
    } else {
      const [group, activation] = findGroupResult;
      return [untypedEditor, group, activation];
    }
  }
  async resolveEditor(editor, preferredGroup) {
    this._flattenedEditors = this._flattenEditorsMap();
    if (isResourceSideBySideEditorInput(editor)) {
      return this.doResolveSideBySideEditor(editor, preferredGroup);
    }
    let resolvedUntypedAndGroup;
    const resolvedUntypedAndGroupResult = this.resolveUntypedInputAndGroup(editor, preferredGroup);
    if (resolvedUntypedAndGroupResult instanceof Promise) {
      resolvedUntypedAndGroup = await resolvedUntypedAndGroupResult;
    } else {
      resolvedUntypedAndGroup = resolvedUntypedAndGroupResult;
    }
    if (!resolvedUntypedAndGroup) {
      return ResolvedStatus.NONE;
    }
    const [untypedEditor, group, activation] = resolvedUntypedAndGroup;
    if (activation) {
      untypedEditor.options = { ...untypedEditor.options, activation };
    }
    let resource = EditorResourceAccessor.getCanonicalUri(untypedEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    const editorAssociationType = isResourceDiffEditorInput(untypedEditor) ? 1 /* DiffEditor */ : isResourceMergeEditorInput(untypedEditor) ? 2 /* MergeEditor */ : 0 /* Editor */;
    if (this.cache && resource && (this.resourceMatchesCache(resource) || this.resourceMatchesUserAssociation(resource, editorAssociationType))) {
      await this.extensionService.whenInstalledExtensionsRegistered();
    }
    if (resource === void 0) {
      resource = URI.from({ scheme: Schemas.untitled });
    } else if (resource.scheme === void 0 || resource === null) {
      return ResolvedStatus.NONE;
    }
    if (untypedEditor.options?.override === EditorResolution.PICK) {
      const picked = await this.doPickEditor(untypedEditor);
      if (!picked) {
        return ResolvedStatus.ABORT;
      }
      untypedEditor.options = picked;
    }
    let { editor: selectedEditor, conflictingDefault } = this.getEditor(resource, untypedEditor.options?.override, editorAssociationType);
    if (!selectedEditor && (untypedEditor.options?.override || isEditorInputWithOptions(editor))) {
      return ResolvedStatus.NONE;
    } else if (!selectedEditor) {
      const resolvedEditor = this.getEditor(resource, DEFAULT_EDITOR_ASSOCIATION.id, editorAssociationType);
      selectedEditor = resolvedEditor?.editor;
      conflictingDefault = resolvedEditor?.conflictingDefault;
      if (!selectedEditor) {
        return ResolvedStatus.NONE;
      }
    }
    if (isResourceDiffEditorInput(untypedEditor) && untypedEditor.options?.override === void 0) {
      let resource2 = EditorResourceAccessor.getCanonicalUri(untypedEditor, { supportSideBySide: SideBySideEditor.SECONDARY });
      if (!resource2) {
        resource2 = URI.from({ scheme: Schemas.untitled });
      }
      const { editor: selectedEditor2 } = this.getEditor(resource2, void 0, editorAssociationType);
      if (!selectedEditor2 || selectedEditor.editorInfo.id !== selectedEditor2.editorInfo.id) {
        const { editor: selectedDiff, conflictingDefault: conflictingDefaultDiff } = this.getEditor(resource, DEFAULT_EDITOR_ASSOCIATION.id, editorAssociationType);
        selectedEditor = selectedDiff;
        conflictingDefault = conflictingDefaultDiff;
      }
      if (!selectedEditor) {
        return ResolvedStatus.NONE;
      }
    }
    untypedEditor.options = { override: selectedEditor.editorInfo.id, ...untypedEditor.options };
    if (selectedEditor.editorFactoryObject.createDiffEditorInput === void 0 && isResourceDiffEditorInput(untypedEditor)) {
      return ResolvedStatus.NONE;
    }
    const input = await this.doResolveEditor(untypedEditor, group, selectedEditor);
    if (conflictingDefault && input) {
      await this.doHandleConflictingDefaults(resource, selectedEditor.editorInfo.label, untypedEditor, input.editor, group);
    }
    if (input) {
      if (input.editor.editorId !== selectedEditor.editorInfo.id) {
        this.logService.warn(`Editor ID Mismatch: ${input.editor.editorId} !== ${selectedEditor.editorInfo.id}. This will cause bugs. Please ensure editorInput.editorId matches the registered id`);
      }
      return { ...input, group };
    }
    return ResolvedStatus.ABORT;
  }
  async doResolveSideBySideEditor(editor, preferredGroup) {
    const primaryResolvedEditor = await this.resolveEditor(editor.primary, preferredGroup);
    if (!isEditorInputWithOptionsAndGroup(primaryResolvedEditor)) {
      return ResolvedStatus.NONE;
    }
    const secondaryResolvedEditor = await this.resolveEditor(editor.secondary, primaryResolvedEditor.group ?? preferredGroup);
    if (!isEditorInputWithOptionsAndGroup(secondaryResolvedEditor)) {
      return ResolvedStatus.NONE;
    }
    return {
      group: primaryResolvedEditor.group ?? secondaryResolvedEditor.group,
      editor: this.instantiationService.createInstance(SideBySideEditorInput, editor.label, editor.description, secondaryResolvedEditor.editor, primaryResolvedEditor.editor),
      options: editor.options
    };
  }
  bufferChangeEvents(callback) {
    this._onDidChangeEditorRegistrations.pause();
    try {
      callback();
    } finally {
      this._onDidChangeEditorRegistrations.resume();
    }
  }
  registerEditor(globPattern, editorInfo, options, editorFactoryObject) {
    const registeredEditorInfo = normalizeRegisteredEditorInfo(editorInfo);
    let registeredEditor = this._editors.get(globPattern);
    if (registeredEditor === void 0) {
      registeredEditor = /* @__PURE__ */ new Map();
      this._editors.set(globPattern, registeredEditor);
    }
    let editorsWithId = registeredEditor.get(registeredEditorInfo.id);
    if (editorsWithId === void 0) {
      editorsWithId = [];
    }
    const remove = insert(editorsWithId, {
      globPattern,
      editorInfo: registeredEditorInfo,
      options,
      editorFactoryObject
    });
    registeredEditor.set(registeredEditorInfo.id, editorsWithId);
    this._shouldReFlattenEditors = true;
    this._onDidChangeEditorRegistrations.fire();
    return toDisposable(() => {
      remove();
      if (editorsWithId && editorsWithId.length === 0) {
        registeredEditor?.delete(editorInfo.id);
      }
      this._shouldReFlattenEditors = true;
      this._onDidChangeEditorRegistrations.fire();
    });
  }
  getAssociationsForResource(resource) {
    return this.getAssociationsForResourceFromSetting(resource, editorsAssociationsSettingId);
  }
  getConfiguredDefaultEditor(resource, forDiffEditor) {
    const settingId = forDiffEditor ? diffEditorsAssociationsSettingId : editorsAssociationsSettingId;
    return this.getAssociationsForResourceFromSetting(resource, settingId)[0]?.viewType;
  }
  getAssociationsForResourceByType(resource, associationType) {
    if (associationType === 0 /* Editor */) {
      return this.getAssociationsForResource(resource);
    }
    const modeAssociations = this.getAssociationsForResourceFromSetting(resource, diffEditorsAssociationsSettingId);
    if (modeAssociations.length) {
      return modeAssociations;
    }
    return this.getAssociationsForResource(resource).filter((association) => !this.isExplicitForAssociationType(association.viewType, associationType));
  }
  /**
   * Whether the editor requires an association for the given input kind instead of inheriting one
   * from another input kind.
   */
  isExplicitForAssociationType(viewType, associationType) {
    const editor = this._registeredEditors.filter((editor2) => editor2.editorInfo.id === viewType).at(0);
    return !!editor && this.getEffectivePriority(editor.editorInfo, associationType) === RegisteredEditorPriority.explicit;
  }
  getAssociationsForResourceFromSetting(resource, settingId) {
    const matchingAssociations = this.getRawAssociationsForResourceFromSetting(resource, settingId);
    const allEditors = this._registeredEditors;
    return matchingAssociations.filter((association) => allEditors.find((c) => c.editorInfo.id === association.viewType));
  }
  getRawAssociationsForResourceByType(resource, associationType) {
    if (associationType === 0 /* Editor */) {
      return this.getRawAssociationsForResourceFromSetting(resource, editorsAssociationsSettingId);
    }
    const diffAssociations = this.getRawAssociationsForResourceFromSetting(resource, diffEditorsAssociationsSettingId);
    return diffAssociations.length ? diffAssociations : this.getRawAssociationsForResourceFromSetting(resource, editorsAssociationsSettingId);
  }
  getRawAssociationsForResourceFromSetting(resource, settingId) {
    const associations = this.getAllUserAssociationsForSetting(settingId);
    const matchingAssociations = associations.filter((association) => association.filenamePattern && globMatchesResource(association.filenamePattern, resource));
    return matchingAssociations.sort((a, b) => (b.filenamePattern?.length ?? 0) - (a.filenamePattern?.length ?? 0));
  }
  getAllUserAssociations() {
    return this.getAllUserAssociationsForSetting(editorsAssociationsSettingId);
  }
  getAllUserAssociationsForSetting(settingId) {
    const inspectedEditorAssociations = this.configurationService.inspect(settingId) || {};
    const defaultAssociations = inspectedEditorAssociations.defaultValue ?? {};
    const workspaceAssociations = inspectedEditorAssociations.workspaceValue ?? {};
    const userAssociations = inspectedEditorAssociations.userValue ?? {};
    const rawAssociations = { ...workspaceAssociations };
    for (const [key, value] of Object.entries({ ...defaultAssociations, ...userAssociations })) {
      if (rawAssociations[key] === void 0) {
        rawAssociations[key] = value;
      }
    }
    const associations = [];
    for (const [key, value] of Object.entries(rawAssociations)) {
      const association = {
        filenamePattern: key,
        viewType: value
      };
      associations.push(association);
    }
    return associations;
  }
  /**
   * Given the nested nature of the editors map, we merge factories of the same glob and id to make it flat
   * and easier to work with
   */
  _flattenEditorsMap() {
    if (!this._shouldReFlattenEditors) {
      return this._flattenedEditors;
    }
    this._shouldReFlattenEditors = false;
    const editors = /* @__PURE__ */ new Map();
    for (const [glob2, value] of this._editors) {
      const registeredEditors = [];
      for (const editors2 of value.values()) {
        let registeredEditor = void 0;
        for (const editor of editors2) {
          if (!registeredEditor) {
            registeredEditor = {
              editorInfo: editor.editorInfo,
              globPattern: editor.globPattern,
              options: {},
              editorFactoryObject: {}
            };
          }
          registeredEditor.options = { ...registeredEditor.options, ...editor.options };
          registeredEditor.editorFactoryObject = { ...registeredEditor.editorFactoryObject, ...editor.editorFactoryObject };
        }
        if (registeredEditor) {
          registeredEditors.push(registeredEditor);
        }
      }
      editors.set(glob2, registeredEditors);
    }
    return editors;
  }
  /**
   * Returns all editors as an array. Possible to contain duplicates
   */
  get _registeredEditors() {
    return Array.from(this._flattenedEditors.values()).flat();
  }
  updateUserAssociations(globPattern, editorID, forDiffEditor) {
    this.updateUserAssociationsForSetting(forDiffEditor ? diffEditorsAssociationsSettingId : editorsAssociationsSettingId, globPattern, editorID);
  }
  updateUserAssociationsForType(associationType, globPattern, editorID) {
    this.updateUserAssociationsForSetting(associationType === 1 /* DiffEditor */ ? diffEditorsAssociationsSettingId : editorsAssociationsSettingId, globPattern, editorID);
  }
  updateUserAssociationsForSetting(settingId, globPattern, editorID) {
    const newAssociation = { viewType: editorID, filenamePattern: globPattern };
    const currentAssociations = this.getAllUserAssociationsForSetting(settingId);
    const newSettingObject = /* @__PURE__ */ Object.create(null);
    for (const association of [...currentAssociations, newAssociation]) {
      if (association.filenamePattern) {
        newSettingObject[association.filenamePattern] = association.viewType;
      }
    }
    this.configurationService.updateValue(settingId, newSettingObject);
  }
  removeUserAssociationForSetting(settingId, globPattern) {
    const currentAssociations = this.getAllUserAssociationsForSetting(settingId);
    if (!currentAssociations.some((association) => association.filenamePattern === globPattern)) {
      return;
    }
    const newSettingObject = /* @__PURE__ */ Object.create(null);
    for (const association of currentAssociations) {
      if (association.filenamePattern && association.filenamePattern !== globPattern) {
        newSettingObject[association.filenamePattern] = association.viewType;
      }
    }
    this.configurationService.updateValue(settingId, newSettingObject);
  }
  findMatchingEditors(resource, associationType = 0 /* Editor */) {
    const userSettings = this.getAssociationsForResourceByType(resource, associationType);
    const matchingEditors = [];
    for (const [key, editors] of this._flattenedEditors) {
      for (const editor of editors) {
        if (associationType === 1 /* DiffEditor */ && !editor.editorFactoryObject.createDiffEditorInput) {
          continue;
        }
        if (associationType === 2 /* MergeEditor */ && !editor.editorFactoryObject.createMergeEditorInput) {
          continue;
        }
        if (editor.options?.canSupportResource && !editor.options.canSupportResource(resource)) {
          continue;
        }
        const foundInSettings = userSettings.find((setting) => setting.viewType === editor.editorInfo.id);
        if (foundInSettings && this.getEffectivePriority(editor.editorInfo, associationType) !== RegisteredEditorPriority.exclusive || globMatchesResource(key, resource)) {
          matchingEditors.push(editor);
        }
      }
    }
    return matchingEditors.sort((a, b) => {
      const aPriority = this.getEffectivePriority(a.editorInfo, associationType);
      const bPriority = this.getEffectivePriority(b.editorInfo, associationType);
      if (priorityToRank(bPriority) === priorityToRank(aPriority) && typeof b.globPattern === "string" && typeof a.globPattern === "string") {
        return b.globPattern.length - a.globPattern.length;
      }
      return priorityToRank(bPriority) - priorityToRank(aPriority);
    });
  }
  getEditors(resourceOrOptions, options) {
    this._flattenedEditors = this._flattenEditorsMap();
    if (URI.isUri(resourceOrOptions)) {
      const resource = resourceOrOptions;
      const associationType = options?.isDiffEditor ? 1 /* DiffEditor */ : 0 /* Editor */;
      let editors2 = this.findMatchingEditors(resource, associationType);
      if (editors2.find((editor) => this.getEffectivePriority(editor.editorInfo, associationType) === RegisteredEditorPriority.exclusive)) {
        return [];
      }
      if (options?.excludeUnconfiguredUniversalOptionalEditors) {
        const configuredEditorIds = new Set(this.getAssociationsForResourceByType(resource, associationType).map((association) => association.viewType));
        editors2 = editors2.filter((editor) => {
          const priority = this.getEffectivePriority(editor.editorInfo, associationType);
          return editor.globPattern !== "*" || priority !== RegisteredEditorPriority.option || editor.editorInfo.id === options.currentEditorId || configuredEditorIds.has(editor.editorInfo.id);
        });
        return distinct(editors2.map((editor) => editor.editorInfo), (editor) => editor.id);
      }
      return editors2.map((editor) => editor.editorInfo);
    }
    const editors = resourceOrOptions?.excludeExclusiveEditors ? this._registeredEditors.filter((editor) => editor.editorInfo.priority.editor !== RegisteredEditorPriority.exclusive) : this._registeredEditors;
    return distinct(editors.map((editor) => editor.editorInfo), (editor) => editor.id);
  }
  getBinaryDiffFallbackEditor(resource) {
    this._flattenedEditors = this._flattenEditorsMap();
    const editors = this.findMatchingEditors(resource, 1 /* DiffEditor */).filter((editor) => editor.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
    return editors[0]?.editorInfo.id;
  }
  /**
   * Given a resource and an editorId selects the best possible editor
   * @returns The editor and whether there was another default which conflicted with it
   */
  getEditor(resource, editorId, associationType) {
    const findMatchingEditor = (editors2, viewType) => {
      return editors2.find((editor) => {
        if (associationType === 1 /* DiffEditor */ && !editor.editorFactoryObject.createDiffEditorInput) {
          return false;
        }
        if (associationType === 2 /* MergeEditor */ && !editor.editorFactoryObject.createMergeEditorInput) {
          return false;
        }
        if (editor.options?.canSupportResource !== void 0) {
          return editor.editorInfo.id === viewType && editor.options.canSupportResource(resource);
        }
        return editor.editorInfo.id === viewType;
      });
    };
    if (editorId && editorId !== EditorResolution.EXCLUSIVE_ONLY) {
      const registeredEditors = this._registeredEditors;
      return {
        editor: findMatchingEditor(registeredEditors, editorId),
        conflictingDefault: false
      };
    }
    const editors = this.findMatchingEditors(resource, associationType);
    const associationsFromSetting = this.getAssociationsForResourceByType(resource, associationType);
    const minPriority = editorId === EditorResolution.EXCLUSIVE_ONLY ? RegisteredEditorPriority.exclusive : RegisteredEditorPriority.builtin;
    let possibleEditors = editors.filter((editor) => priorityToRank(this.getEffectivePriority(editor.editorInfo, associationType)) >= priorityToRank(minPriority) && editor.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
    if (possibleEditors.length === 0) {
      return {
        editor: associationsFromSetting[0] && minPriority !== RegisteredEditorPriority.exclusive ? findMatchingEditor(editors, associationsFromSetting[0].viewType) : void 0,
        conflictingDefault: false
      };
    }
    const configuredEditor = associationsFromSetting[0] ? findMatchingEditor(editors, associationsFromSetting[0].viewType) : void 0;
    const selectedViewType = this.getEffectivePriority(possibleEditors[0].editorInfo, associationType) === RegisteredEditorPriority.exclusive ? possibleEditors[0].editorInfo.id : configuredEditor?.editorInfo.id || possibleEditors.find((editor) => !editor.options?.canSupportResource || editor.options.canSupportResource(resource))?.editorInfo.id || possibleEditors[0].editorInfo.id;
    let conflictingDefault = false;
    possibleEditors = possibleEditors.filter((editor) => this.getEffectivePriority(editor.editorInfo, associationType) !== RegisteredEditorPriority.exclusive).filter((editor) => !editor.options?.canSupportResource || editor.options.canSupportResource(resource));
    if (associationsFromSetting.length === 0 && possibleEditors.length > 1) {
      conflictingDefault = true;
    }
    return {
      editor: findMatchingEditor(editors, selectedViewType),
      conflictingDefault
    };
  }
  getEffectivePriority(editorInfo, associationType) {
    switch (associationType) {
      case 1 /* DiffEditor */:
        return editorInfo.priority.diff;
      case 2 /* MergeEditor */:
        return editorInfo.priority.merge;
      default:
        return editorInfo.priority.editor;
    }
  }
  async doResolveEditor(editor, group, selectedEditor) {
    let options = editor.options;
    const resource = EditorResourceAccessor.getCanonicalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (options && typeof options.activation === "undefined") {
      options = { ...options, activation: options.preserveFocus ? EditorActivation.RESTORE : void 0 };
    }
    if (isResourceMergeEditorInput(editor)) {
      if (!selectedEditor.editorFactoryObject.createMergeEditorInput) {
        return;
      }
      const inputWithOptions2 = await selectedEditor.editorFactoryObject.createMergeEditorInput(editor, group);
      return { editor: inputWithOptions2.editor, options: inputWithOptions2.options ?? options };
    }
    if (isResourceDiffEditorInput(editor)) {
      if (!selectedEditor.editorFactoryObject.createDiffEditorInput) {
        return;
      }
      const inputWithOptions2 = await selectedEditor.editorFactoryObject.createDiffEditorInput(editor, group);
      return { editor: inputWithOptions2.editor, options: inputWithOptions2.options ?? options };
    }
    if (isResourceMultiDiffEditorInput(editor)) {
      if (!selectedEditor.editorFactoryObject.createMultiDiffEditorInput) {
        return;
      }
      const inputWithOptions2 = await selectedEditor.editorFactoryObject.createMultiDiffEditorInput(editor, group);
      return { editor: inputWithOptions2.editor, options: inputWithOptions2.options ?? options };
    }
    if (isResourceSideBySideEditorInput(editor)) {
      throw new Error(`Untyped side by side editor input not supported here.`);
    }
    if (isUntitledResourceEditorInput(editor)) {
      if (!selectedEditor.editorFactoryObject.createUntitledEditorInput) {
        return;
      }
      const inputWithOptions2 = await selectedEditor.editorFactoryObject.createUntitledEditorInput(editor, group);
      return { editor: inputWithOptions2.editor, options: inputWithOptions2.options ?? options };
    }
    if (resource === void 0) {
      throw new Error(`Undefined resource on non untitled editor input.`);
    }
    const singleEditorPerResource = typeof selectedEditor.options?.singlePerResource === "function" ? selectedEditor.options.singlePerResource() : selectedEditor.options?.singlePerResource;
    if (singleEditorPerResource) {
      const existingEditors = this.findExistingEditorsForResource(resource, selectedEditor.editorInfo.id);
      if (existingEditors.length) {
        const editor2 = await this.moveExistingEditorForResource(existingEditors, group);
        if (editor2) {
          return { editor: editor2, options };
        } else {
          return;
        }
      }
    }
    if (!selectedEditor.editorFactoryObject.createEditorInput) {
      return;
    }
    const inputWithOptions = await selectedEditor.editorFactoryObject.createEditorInput(editor, group);
    options = inputWithOptions.options ?? options;
    const input = inputWithOptions.editor;
    return { editor: input, options };
  }
  /**
   * Moves the first existing editor for a resource to the target group unless already opened there.
   * Additionally will close any other editors that are open for that resource and viewtype besides the first one found
   * @param resource The resource of the editor
   * @param viewType the viewtype of the editor
   * @param targetGroup The group to move it to
   * @returns The moved editor input or `undefined` if the editor could not be moved
   */
  async moveExistingEditorForResource(existingEditorsForResource, targetGroup) {
    const editorToUse = existingEditorsForResource[0];
    for (const { editor, group } of existingEditorsForResource) {
      if (editor !== editorToUse.editor) {
        const closed = await group.closeEditor(editor);
        if (!closed) {
          return;
        }
      }
    }
    if (targetGroup.id !== editorToUse.group.id) {
      const moved = editorToUse.group.moveEditor(editorToUse.editor, targetGroup);
      if (!moved) {
        return;
      }
    }
    return editorToUse.editor;
  }
  /**
   * Given a resource and an editorId, returns all editors open for that resource and editorId.
   * @param resource The resource specified
   * @param editorId The editorID
   * @returns A list of editors
   */
  findExistingEditorsForResource(resource, editorId) {
    const out = [];
    const orderedGroups = distinct([
      ...this.editorGroupService.groups
    ]);
    for (const group of orderedGroups) {
      for (const editor of group.editors) {
        if ((this.uriIdentityService.extUri.isEqual(editor.resource, resource) || this.uriIdentityService.extUri.isEqual(EditorResourceAccessor.getOriginalUri(editor), resource)) && editor.editorId === editorId) {
          out.push({ editor, group });
        }
      }
    }
    return out;
  }
  async doHandleConflictingDefaults(resource, editorName, untypedInput, currentEditor, group) {
    const associationType = isResourceDiffEditorInput(untypedInput) ? 1 /* DiffEditor */ : isResourceMergeEditorInput(untypedInput) ? 2 /* MergeEditor */ : 0 /* Editor */;
    const editors = this.findMatchingEditors(resource, associationType);
    const storedChoices = JSON.parse(this.storageService.get(EditorResolverService.conflictingDefaultsStorageID, StorageScope.PROFILE, "{}"));
    const globForResource = `*${extname(resource)}`;
    const writeCurrentEditorsToStorage = () => {
      storedChoices[globForResource] = [];
      editors.forEach((editor) => storedChoices[globForResource].push(editor.editorInfo.id));
      this.storageService.store(EditorResolverService.conflictingDefaultsStorageID, JSON.stringify(storedChoices), StorageScope.PROFILE, StorageTarget.MACHINE);
    };
    if (storedChoices[globForResource]?.find((editorID) => editorID === currentEditor.editorId)) {
      return;
    }
    const handle = this.notificationService.prompt(
      Severity.Warning,
      localize("editorResolver.conflictingDefaults", "There are multiple default editors available for the resource."),
      [
        {
          label: localize("editorResolver.configureDefault", "Configure Default"),
          run: async () => {
            const picked = await this.doPickEditor(untypedInput, true);
            if (!picked) {
              return;
            }
            untypedInput.options = picked;
            const replacementEditor = await this.resolveEditor(untypedInput, group);
            if (replacementEditor === ResolvedStatus.ABORT || replacementEditor === ResolvedStatus.NONE) {
              return;
            }
            group.replaceEditors([
              {
                editor: currentEditor,
                replacement: replacementEditor.editor,
                options: replacementEditor.options ?? picked
              }
            ]);
          }
        },
        {
          label: localize("editorResolver.keepDefault", "Keep {0}", editorName),
          run: writeCurrentEditorsToStorage
        }
      ]
    );
    const onCloseListener = handle.onDidClose(() => {
      writeCurrentEditorsToStorage();
      onCloseListener.dispose();
    });
  }
  mapEditorsToQuickPickEntry(resource, showDefaultPicker, associationType) {
    const currentEditor = this.editorGroupService.activeGroup.findEditors(resource).at(0);
    let registeredEditors = resource.scheme === Schemas.untitled ? this._registeredEditors.filter((e) => e.editorInfo.priority.editor !== RegisteredEditorPriority.exclusive) : this.findMatchingEditors(resource, associationType);
    if (associationType === 1 /* DiffEditor */) {
      registeredEditors = registeredEditors.filter((editor) => !!editor.editorFactoryObject.createDiffEditorInput);
    }
    registeredEditors = distinct(registeredEditors, (c) => c.editorInfo.id);
    const defaultSetting = this.getAssociationsForResourceByType(resource, associationType)[0]?.viewType;
    registeredEditors = registeredEditors.sort((a, b) => {
      if (a.editorInfo.id === DEFAULT_EDITOR_ASSOCIATION.id) {
        return -1;
      } else if (b.editorInfo.id === DEFAULT_EDITOR_ASSOCIATION.id) {
        return 1;
      } else {
        return priorityToRank(this.getEffectivePriority(b.editorInfo, associationType)) - priorityToRank(this.getEffectivePriority(a.editorInfo, associationType));
      }
    });
    const quickPickEntries = [];
    const currentlyActiveLabel = localize("promptOpenWith.currentlyActive", "Active");
    const currentDefaultLabel = localize("promptOpenWith.currentDefault", "Default");
    const currentDefaultAndActiveLabel = localize("promptOpenWith.currentDefaultAndActive", "Active and Default");
    let defaultViewType = defaultSetting;
    if (!defaultViewType && registeredEditors.length > 2 && this.getEffectivePriority(registeredEditors[1].editorInfo, associationType) !== RegisteredEditorPriority.option) {
      defaultViewType = registeredEditors[1]?.editorInfo.id;
    }
    if (!defaultViewType) {
      defaultViewType = DEFAULT_EDITOR_ASSOCIATION.id;
    }
    registeredEditors.forEach((editor) => {
      const currentViewType = currentEditor?.editorId ?? DEFAULT_EDITOR_ASSOCIATION.id;
      const isActive = currentEditor ? editor.editorInfo.id === currentViewType : false;
      const isDefault = editor.editorInfo.id === defaultViewType;
      const quickPickEntry = {
        id: editor.editorInfo.id,
        label: editor.editorInfo.label,
        description: isActive && isDefault ? currentDefaultAndActiveLabel : isActive ? currentlyActiveLabel : isDefault ? currentDefaultLabel : void 0,
        detail: editor.editorInfo.detail ?? editor.editorInfo.priority.editor
      };
      quickPickEntries.push(quickPickEntry);
    });
    if (!showDefaultPicker && extname(resource) !== "") {
      const separator = { type: "separator" };
      quickPickEntries.push(separator);
      const configureDefaultEntry = {
        id: EditorResolverService.configureDefaultID,
        label: localize("promptOpenWith.configureDefault", "Configure default editor for '{0}'...", `*${extname(resource)}`)
      };
      quickPickEntries.push(configureDefaultEntry);
      if (associationType === 1 /* DiffEditor */) {
        const configureDefaultDiffEntry = {
          id: EditorResolverService.configureDefaultDiffID,
          label: localize("promptOpenWith.configureDefaultDiff", "Configure default editor (diff only) for '{0}'...", `*${extname(resource)}`)
        };
        quickPickEntries.push(configureDefaultDiffEntry);
      }
    }
    return quickPickEntries;
  }
  async doPickEditor(editor, showDefaultPicker, updateAssociationType) {
    let resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (resource === void 0) {
      resource = URI.from({ scheme: Schemas.untitled });
    }
    const associationType = isResourceDiffEditorInput(editor) ? 1 /* DiffEditor */ : 0 /* Editor */;
    const updateSettingType = updateAssociationType ?? associationType;
    const persistDefaultAssociation = (editorID) => {
      const globPattern = `*${extname(resource)}`;
      this.updateUserAssociationsForType(updateSettingType, globPattern, editorID);
      if (updateSettingType === 0 /* Editor */ && associationType === 1 /* DiffEditor */) {
        this.removeUserAssociationForSetting(diffEditorsAssociationsSettingId, globPattern);
      }
    };
    const editorPicks = this.mapEditorsToQuickPickEntry(resource, showDefaultPicker, associationType);
    const disposables = new DisposableStore();
    const editorPicker = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    const placeHolderMessage = showDefaultPicker ? updateSettingType === 1 /* DiffEditor */ ? localize("promptOpenWith.updateDefaultDiffPlaceHolder", "Select new default editor (diff only) for '{0}'", `*${extname(resource)}`) : localize("promptOpenWith.updateDefaultPlaceHolder", "Select new default editor for '{0}'", `*${extname(resource)}`) : localize("promptOpenWith.placeHolder", "Select editor for '{0}'", basename(resource));
    editorPicker.placeholder = placeHolderMessage;
    editorPicker.canAcceptInBackground = true;
    editorPicker.items = editorPicks;
    const firstItem = editorPicker.items.find((item) => item.type === "item");
    if (firstItem) {
      editorPicker.selectedItems = [firstItem];
    }
    const picked = await new Promise((resolve) => {
      disposables.add(editorPicker.onDidAccept((e) => {
        let result = void 0;
        if (editorPicker.selectedItems.length === 1) {
          result = {
            item: editorPicker.selectedItems[0],
            keyMods: editorPicker.keyMods,
            openInBackground: e.inBackground
          };
        }
        if (resource && showDefaultPicker && result?.item.id) {
          persistDefaultAssociation(result.item.id);
        }
        resolve(result);
      }));
      disposables.add(editorPicker.onDidHide(() => {
        disposables.dispose();
        resolve(void 0);
      }));
      disposables.add(editorPicker.onDidTriggerItemButton((e) => {
        resolve({ item: e.item, openInBackground: false });
        if (resource && e.item?.id) {
          persistDefaultAssociation(e.item.id);
        }
      }));
      editorPicker.show();
    });
    editorPicker.dispose();
    if (picked) {
      if (picked.item.id === EditorResolverService.configureDefaultID) {
        return this.doPickEditor(editor, true, 0 /* Editor */);
      }
      if (picked.item.id === EditorResolverService.configureDefaultDiffID) {
        return this.doPickEditor(editor, true, 1 /* DiffEditor */);
      }
      const targetOptions = {
        ...editor.options,
        override: picked.item.id,
        preserveFocus: picked.openInBackground || editor.options?.preserveFocus
      };
      return targetOptions;
    }
    return void 0;
  }
  cacheEditors() {
    const cacheStorage = /* @__PURE__ */ new Set();
    for (const [globPattern, contribPoint] of this._flattenedEditors) {
      const nonOptional = !!contribPoint.find((c) => c.editorInfo.priority.editor !== RegisteredEditorPriority.option && c.editorInfo.id !== DEFAULT_EDITOR_ASSOCIATION.id);
      if (!nonOptional) {
        continue;
      }
      if (glob.isRelativePattern(globPattern)) {
        cacheStorage.add(`${globPattern.pattern}`);
      } else {
        cacheStorage.add(globPattern);
      }
    }
    const userAssociations = [
      ...this.getAllUserAssociations(),
      ...this.getAllUserAssociationsForSetting(diffEditorsAssociationsSettingId)
    ];
    for (const association of userAssociations) {
      if (association.filenamePattern) {
        cacheStorage.add(association.filenamePattern);
      }
    }
    this.storageService.store(EditorResolverService.cacheStorageID, JSON.stringify(Array.from(cacheStorage)), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  /**
   * Checks if a resource matches any user-configured editor association that
   * points to a non-default editor. This ensures that on first startup (when
   * the cache is empty), we still wait for extensions to register before
   * resolving the editor, so that user-configured custom editors are available.
   */
  resourceMatchesUserAssociation(resource, associationType) {
    const userAssociations = this.getRawAssociationsForResourceByType(resource, associationType);
    for (const association of userAssociations) {
      if (association.viewType !== DEFAULT_EDITOR_ASSOCIATION.id) {
        return true;
      }
    }
    return false;
  }
  resourceMatchesCache(resource) {
    if (!this.cache) {
      return false;
    }
    for (const cacheEntry of this.cache) {
      if (globMatchesResource(cacheEntry, resource)) {
        return true;
      }
    }
    return false;
  }
};
// Constants
EditorResolverService.configureDefaultID = "promptOpenWith.configureDefault";
EditorResolverService.configureDefaultDiffID = "promptOpenWith.configureDefaultDiff";
EditorResolverService.cacheStorageID = "editorOverrideService.cache";
EditorResolverService.conflictingDefaultsStorageID = "editorOverrideService.conflictingDefaults";
EditorResolverService = __decorateClass([
  __decorateParam(0, IEditorGroupsService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IUriIdentityService)
], EditorResolverService);
registerSingleton(IEditorResolverService, EditorResolverService, InstantiationType.Eager);
export {
  EditorResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxlZGl0b3JcXGJyb3dzZXJcXGVkaXRvclJlc29sdmVyU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3RpbmN0LCBpbnNlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgUGF1c2VhYmxlRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIGdsb2IgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGV4dG5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aXZhdGlvbiwgRWRpdG9yUmVzb2x1dGlvbiwgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5TW9kcywgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciwgUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04sIEVkaXRvcklucHV0V2l0aE9wdGlvbnMsIEVkaXRvclJlc291cmNlQWNjZXNzb3IsIElSZXNvdXJjZVNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zLCBpc0VkaXRvcklucHV0V2l0aE9wdGlvbnNBbmRHcm91cCwgaXNSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCwgaXNSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQsIGlzUmVzb3VyY2VNdWx0aURpZmZFZGl0b3JJbnB1dCwgaXNSZXNvdXJjZVNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgaXNVbnRpdGxlZFJlc291cmNlRWRpdG9ySW5wdXQsIElVbnR5cGVkRWRpdG9ySW5wdXQsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZmluZEdyb3VwIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvckdyb3VwRmluZGVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkaWZmRWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCwgRWRpdG9yQXNzb2NpYXRpb24sIEVkaXRvckFzc29jaWF0aW9ucywgRWRpdG9ySW5wdXRGYWN0b3J5T2JqZWN0LCBlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkLCBnbG9iTWF0Y2hlc1Jlc291cmNlLCBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlR2V0QWxsRWRpdG9yc09wdGlvbnMsIElFZGl0b3JSZXNvbHZlclNlcnZpY2VHZXRFZGl0b3JzT3B0aW9ucywgcHJpb3JpdHlUb1JhbmssIFJlZ2lzdGVyZWRFZGl0b3JJbmZvLCBSZWdpc3RlcmVkRWRpdG9yT3B0aW9ucywgUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LCBSZWdpc3RlcmVkRWRpdG9yUmVnaXN0cmF0aW9uSW5mbywgUmVzb2x2ZWRFZGl0b3IsIFJlc29sdmVkU3RhdHVzLCB0b1JlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eUluZm8gfSBmcm9tICcuLi9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByZWZlcnJlZEdyb3VwIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuXG5pbnRlcmZhY2UgUmVnaXN0ZXJlZEVkaXRvciB7XG5cdGdsb2JQYXR0ZXJuOiBzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm47XG5cdGVkaXRvckluZm86IFJlZ2lzdGVyZWRFZGl0b3JJbmZvO1xuXHRvcHRpb25zPzogUmVnaXN0ZXJlZEVkaXRvck9wdGlvbnM7XG5cdGVkaXRvckZhY3RvcnlPYmplY3Q6IEVkaXRvcklucHV0RmFjdG9yeU9iamVjdDtcbn1cblxudHlwZSBSZWdpc3RlcmVkRWRpdG9ycyA9IEFycmF5PFJlZ2lzdGVyZWRFZGl0b3I+O1xuXG5mdW5jdGlvbiBub3JtYWxpemVSZWdpc3RlcmVkRWRpdG9ySW5mbyhlZGl0b3JJbmZvOiBSZWdpc3RlcmVkRWRpdG9yUmVnaXN0cmF0aW9uSW5mbyk6IFJlZ2lzdGVyZWRFZGl0b3JJbmZvIHtcblx0cmV0dXJuIHtcblx0XHRpZDogZWRpdG9ySW5mby5pZCxcblx0XHRsYWJlbDogZWRpdG9ySW5mby5sYWJlbCxcblx0XHRkZXRhaWw6IGVkaXRvckluZm8uZGV0YWlsLFxuXHRcdHByaW9yaXR5OiB0b1JlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eUluZm8oZWRpdG9ySW5mby5wcmlvcml0eSksXG5cdH07XG59XG5cbmNvbnN0IGVudW0gRWRpdG9yQXNzb2NpYXRpb25UeXBlIHtcblx0RWRpdG9yLFxuXHREaWZmRWRpdG9yLFxuXHRNZXJnZUVkaXRvclxufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JSZXNvbHZlclNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Ly8gRXZlbnRzXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlRWRpdG9yUmVnaXN0cmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQYXVzZWFibGVFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVkaXRvclJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUVkaXRvclJlZ2lzdHJhdGlvbnMuZXZlbnQ7XG5cblx0Ly8gQ29uc3RhbnRzXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGNvbmZpZ3VyZURlZmF1bHRJRCA9ICdwcm9tcHRPcGVuV2l0aC5jb25maWd1cmVEZWZhdWx0Jztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgY29uZmlndXJlRGVmYXVsdERpZmZJRCA9ICdwcm9tcHRPcGVuV2l0aC5jb25maWd1cmVEZWZhdWx0RGlmZic7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGNhY2hlU3RvcmFnZUlEID0gJ2VkaXRvck92ZXJyaWRlU2VydmljZS5jYWNoZSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGNvbmZsaWN0aW5nRGVmYXVsdHNTdG9yYWdlSUQgPSAnZWRpdG9yT3ZlcnJpZGVTZXJ2aWNlLmNvbmZsaWN0aW5nRGVmYXVsdHMnO1xuXG5cdC8vIERhdGEgU3RvcmVzXG5cdHByaXZhdGUgX2VkaXRvcnM6IE1hcDxzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm4sIE1hcDxzdHJpbmcsIFJlZ2lzdGVyZWRFZGl0b3JzPj4gPSBuZXcgTWFwPHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybiwgTWFwPHN0cmluZywgUmVnaXN0ZXJlZEVkaXRvcnM+PigpO1xuXHRwcml2YXRlIF9mbGF0dGVuZWRFZGl0b3JzOiBNYXA8c3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuLCBSZWdpc3RlcmVkRWRpdG9ycz4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgX3Nob3VsZFJlRmxhdHRlbkVkaXRvcnMgPSB0cnVlO1xuXHRwcml2YXRlIGNhY2hlOiBTZXQ8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Ly8gUmVhZCBpbiB0aGUgY2FjaGUgb24gc3RhdHVwXG5cdFx0dGhpcy5jYWNoZSA9IG5ldyBTZXQ8c3RyaW5nPihKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEVkaXRvclJlc29sdmVyU2VydmljZS5jYWNoZVN0b3JhZ2VJRCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIEpTT04uc3RyaW5naWZ5KFtdKSkpKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShFZGl0b3JSZXNvbHZlclNlcnZpY2UuY2FjaGVTdG9yYWdlSUQsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHtcblx0XHRcdC8vIFdlIHdhbnQgdG8gc3RvcmUgdGhlIGdsb2IgcGF0dGVybnMgd2Ugd291bGQgYWN0aXZhdGUgb24sIHRoaXMgYWxsb3dzIHVzIHRvIGtub3cgaWYgd2UgbmVlZCB0byBhd2FpdCB0aGUgZXh0IGhvc3Qgb24gc3RhcnR1cCBmb3Igb3BlbmluZyBhIHJlc291cmNlXG5cdFx0XHR0aGlzLmNhY2hlRWRpdG9ycygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gZXh0ZW5zaW9ucyBoYXZlIHJlZ2lzdGVyZWQgd2Ugbm8gbG9uZ2VyIG5lZWQgdGhlIGNhY2hlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkUmVnaXN0ZXJFeHRlbnNpb25zKCgpID0+IHtcblx0XHRcdHRoaXMuY2FjaGUgPSB1bmRlZmluZWQ7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlVW50eXBlZElucHV0QW5kR3JvdXAoZWRpdG9yOiBJVW50eXBlZEVkaXRvcklucHV0LCBwcmVmZXJyZWRHcm91cDogUHJlZmVycmVkR3JvdXAgfCB1bmRlZmluZWQpOiBQcm9taXNlPFtJVW50eXBlZEVkaXRvcklucHV0LCBJRWRpdG9yR3JvdXAsIEVkaXRvckFjdGl2YXRpb24gfCB1bmRlZmluZWRdIHwgdW5kZWZpbmVkPiB8IFtJVW50eXBlZEVkaXRvcklucHV0LCBJRWRpdG9yR3JvdXAsIEVkaXRvckFjdGl2YXRpb24gfCB1bmRlZmluZWRdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB1bnR5cGVkRWRpdG9yID0gZWRpdG9yO1xuXG5cdFx0Ly8gVXNlIHRoZSB1bnR5cGVkIGVkaXRvciB0byBmaW5kIGEgZ3JvdXBcblx0XHRjb25zdCBmaW5kR3JvdXBSZXN1bHQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZpbmRHcm91cCwgdW50eXBlZEVkaXRvciwgcHJlZmVycmVkR3JvdXApO1xuXHRcdGlmIChmaW5kR3JvdXBSZXN1bHQgaW5zdGFuY2VvZiBQcm9taXNlKSB7XG5cdFx0XHRyZXR1cm4gZmluZEdyb3VwUmVzdWx0LnRoZW4oKFtncm91cCwgYWN0aXZhdGlvbl0pID0+IFt1bnR5cGVkRWRpdG9yLCBncm91cCwgYWN0aXZhdGlvbl0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBbZ3JvdXAsIGFjdGl2YXRpb25dID0gZmluZEdyb3VwUmVzdWx0O1xuXHRcdFx0cmV0dXJuIFt1bnR5cGVkRWRpdG9yLCBncm91cCwgYWN0aXZhdGlvbl07XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUVkaXRvcihlZGl0b3I6IElVbnR5cGVkRWRpdG9ySW5wdXQsIHByZWZlcnJlZEdyb3VwOiBQcmVmZXJyZWRHcm91cCB8IHVuZGVmaW5lZCk6IFByb21pc2U8UmVzb2x2ZWRFZGl0b3I+IHtcblx0XHQvLyBVcGRhdGUgdGhlIGZsYXR0ZW5lZCBlZGl0b3JzXG5cdFx0dGhpcy5fZmxhdHRlbmVkRWRpdG9ycyA9IHRoaXMuX2ZsYXR0ZW5FZGl0b3JzTWFwKCk7XG5cblx0XHQvLyBTcGVjaWFsIGNhc2U6IHNpZGUgYnkgc2lkZSBlZGl0b3JzIHJlcXVpcmVzIHVzIHRvXG5cdFx0Ly8gaW5kZXBlbmRlbnRseSByZXNvbHZlIGJvdGggc2lkZXMgYW5kIHRoZW4gYnVpbGRcblx0XHQvLyBhIHNpZGUgYnkgc2lkZSBlZGl0b3Igd2l0aCB0aGUgcmVzdWx0XG5cdFx0aWYgKGlzUmVzb3VyY2VTaWRlQnlTaWRlRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9SZXNvbHZlU2lkZUJ5U2lkZUVkaXRvcihlZGl0b3IsIHByZWZlcnJlZEdyb3VwKTtcblx0XHR9XG5cblx0XHRsZXQgcmVzb2x2ZWRVbnR5cGVkQW5kR3JvdXA6IFtJVW50eXBlZEVkaXRvcklucHV0LCBJRWRpdG9yR3JvdXAsIEVkaXRvckFjdGl2YXRpb24gfCB1bmRlZmluZWRdIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc29sdmVkVW50eXBlZEFuZEdyb3VwUmVzdWx0ID0gdGhpcy5yZXNvbHZlVW50eXBlZElucHV0QW5kR3JvdXAoZWRpdG9yLCBwcmVmZXJyZWRHcm91cCk7XG5cdFx0aWYgKHJlc29sdmVkVW50eXBlZEFuZEdyb3VwUmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0cmVzb2x2ZWRVbnR5cGVkQW5kR3JvdXAgPSBhd2FpdCByZXNvbHZlZFVudHlwZWRBbmRHcm91cFJlc3VsdDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb2x2ZWRVbnR5cGVkQW5kR3JvdXAgPSByZXNvbHZlZFVudHlwZWRBbmRHcm91cFJlc3VsdDtcblx0XHR9XG5cblx0XHRpZiAoIXJlc29sdmVkVW50eXBlZEFuZEdyb3VwKSB7XG5cdFx0XHRyZXR1cm4gUmVzb2x2ZWRTdGF0dXMuTk9ORTtcblx0XHR9XG5cdFx0Ly8gR2V0IHRoZSByZXNvbHZlZCB1bnR5cGVkIGVkaXRvciwgZ3JvdXAsIGFuZCBhY3RpdmF0aW9uXG5cdFx0Y29uc3QgW3VudHlwZWRFZGl0b3IsIGdyb3VwLCBhY3RpdmF0aW9uXSA9IHJlc29sdmVkVW50eXBlZEFuZEdyb3VwO1xuXHRcdGlmIChhY3RpdmF0aW9uKSB7XG5cdFx0XHR1bnR5cGVkRWRpdG9yLm9wdGlvbnMgPSB7IC4uLnVudHlwZWRFZGl0b3Iub3B0aW9ucywgYWN0aXZhdGlvbiB9O1xuXHRcdH1cblxuXHRcdGxldCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKHVudHlwZWRFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblxuXHRcdC8vIElmIGl0IHdhcyByZXNvbHZlZCBiZWZvcmUgd2UgYXdhaXQgZm9yIHRoZSBleHRlbnNpb25zIHRvIGFjdGl2YXRlIGFuZCB0aGVuIHByb2NlZWQgd2l0aCByZXNvbHV0aW9uIG9yIGVsc2UgdGhlIGJhY2tpbmcgZXh0ZW5zaW9ucyB3b24ndCBiZSByZWdpc3RlcmVkXG5cdFx0Y29uc3QgZWRpdG9yQXNzb2NpYXRpb25UeXBlID0gaXNSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCh1bnR5cGVkRWRpdG9yKSA/IEVkaXRvckFzc29jaWF0aW9uVHlwZS5EaWZmRWRpdG9yIDogaXNSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQodW50eXBlZEVkaXRvcikgPyBFZGl0b3JBc3NvY2lhdGlvblR5cGUuTWVyZ2VFZGl0b3IgOiBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRWRpdG9yO1xuXHRcdGlmICh0aGlzLmNhY2hlICYmIHJlc291cmNlICYmICh0aGlzLnJlc291cmNlTWF0Y2hlc0NhY2hlKHJlc291cmNlKSB8fCB0aGlzLnJlc291cmNlTWF0Y2hlc1VzZXJBc3NvY2lhdGlvbihyZXNvdXJjZSwgZWRpdG9yQXNzb2NpYXRpb25UeXBlKSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHR9XG5cblx0XHQvLyBVbmRlZmluZWQgcmVzb3VyY2UgLT4gdW50aWx0ZWQuIE90aGVyIG1hbGZvcm1lZCBVUkkncyBhcmUgdW5yZXNvbHZhYmxlXG5cdFx0aWYgKHJlc291cmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQgfSk7XG5cdFx0fSBlbHNlIGlmIChyZXNvdXJjZS5zY2hlbWUgPT09IHVuZGVmaW5lZCB8fCByZXNvdXJjZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIFJlc29sdmVkU3RhdHVzLk5PTkU7XG5cdFx0fVxuXG5cdFx0aWYgKHVudHlwZWRFZGl0b3Iub3B0aW9ucz8ub3ZlcnJpZGUgPT09IEVkaXRvclJlc29sdXRpb24uUElDSykge1xuXHRcdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgdGhpcy5kb1BpY2tFZGl0b3IodW50eXBlZEVkaXRvcik7XG5cdFx0XHQvLyBJZiB0aGUgcGlja2VyIHdhcyBjYW5jZWxsZWQgd2Ugd2lsbCBzdG9wIHJlc29sdmluZyB0aGUgZWRpdG9yXG5cdFx0XHRpZiAoIXBpY2tlZCkge1xuXHRcdFx0XHRyZXR1cm4gUmVzb2x2ZWRTdGF0dXMuQUJPUlQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBQb3B1bGF0ZSB0aGUgb3B0aW9ucyB3aXRoIHRoZSBuZXcgb25lc1xuXHRcdFx0dW50eXBlZEVkaXRvci5vcHRpb25zID0gcGlja2VkO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmVkIHRoZSBlZGl0b3IgSUQgYXMgbXVjaCBhcyBwb3NzaWJsZSwgbm93IGZpbmQgYSBnaXZlbiBlZGl0b3IgKGNhc3QgaGVyZSBpcyBvayBiZWNhdXNlIHdlIHJlc29sdmUgZG93biB0byBhIHN0cmluZyBhYm92ZSlcblx0XHRsZXQgeyBlZGl0b3I6IHNlbGVjdGVkRWRpdG9yLCBjb25mbGljdGluZ0RlZmF1bHQgfSA9IHRoaXMuZ2V0RWRpdG9yKHJlc291cmNlLCB1bnR5cGVkRWRpdG9yLm9wdGlvbnM/Lm92ZXJyaWRlIGFzIChzdHJpbmcgfCBFZGl0b3JSZXNvbHV0aW9uLkVYQ0xVU0lWRV9PTkxZIHwgdW5kZWZpbmVkKSwgZWRpdG9yQXNzb2NpYXRpb25UeXBlKTtcblx0XHQvLyBJZiBubyBlZGl0b3Igd2FzIGZvdW5kIGFuZCB0aGlzIHdhcyBhIHR5cGVkIGVkaXRvciBvciBhbiBlZGl0b3Igd2l0aCBhbiBleHBsaWNpdCBvdmVycmlkZSB3ZSBjb3VsZCBub3QgcmVzb2x2ZSBpdFxuXHRcdGlmICghc2VsZWN0ZWRFZGl0b3IgJiYgKHVudHlwZWRFZGl0b3Iub3B0aW9ucz8ub3ZlcnJpZGUgfHwgaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zKGVkaXRvcikpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb2x2ZWRTdGF0dXMuTk9ORTtcblx0XHR9IGVsc2UgaWYgKCFzZWxlY3RlZEVkaXRvcikge1xuXHRcdFx0Ly8gU2ltcGxlIHVudHlwZWQgZWRpdG9ycyB0aGF0IHdlIGNvdWxkIG5vdCByZXNvbHZlIHdpbGwgYmUgcmVzb2x2ZWQgdG8gdGhlIGRlZmF1bHQgZWRpdG9yXG5cdFx0XHRjb25zdCByZXNvbHZlZEVkaXRvciA9IHRoaXMuZ2V0RWRpdG9yKHJlc291cmNlLCBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCwgZWRpdG9yQXNzb2NpYXRpb25UeXBlKTtcblx0XHRcdHNlbGVjdGVkRWRpdG9yID0gcmVzb2x2ZWRFZGl0b3I/LmVkaXRvcjtcblx0XHRcdGNvbmZsaWN0aW5nRGVmYXVsdCA9IHJlc29sdmVkRWRpdG9yPy5jb25mbGljdGluZ0RlZmF1bHQ7XG5cdFx0XHRpZiAoIXNlbGVjdGVkRWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybiBSZXNvbHZlZFN0YXR1cy5OT05FO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEluIHRoZSBzcGVjaWFsIGNhc2Ugb2YgZGlmZiBlZGl0b3JzIHdlIGRvIHNvbWUgbW9yZSB3b3JrIHRvIGRldGVybWluZSB0aGUgY29ycmVjdCBlZGl0b3IgZm9yIGJvdGggc2lkZXNcblx0XHRpZiAoaXNSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCh1bnR5cGVkRWRpdG9yKSAmJiB1bnR5cGVkRWRpdG9yLm9wdGlvbnM/Lm92ZXJyaWRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGxldCByZXNvdXJjZTIgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaSh1bnR5cGVkRWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlNFQ09OREFSWSB9KTtcblx0XHRcdGlmICghcmVzb3VyY2UyKSB7XG5cdFx0XHRcdHJlc291cmNlMiA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBlZGl0b3I6IHNlbGVjdGVkRWRpdG9yMiB9ID0gdGhpcy5nZXRFZGl0b3IocmVzb3VyY2UyLCB1bmRlZmluZWQsIGVkaXRvckFzc29jaWF0aW9uVHlwZSk7XG5cdFx0XHRpZiAoIXNlbGVjdGVkRWRpdG9yMiB8fCBzZWxlY3RlZEVkaXRvci5lZGl0b3JJbmZvLmlkICE9PSBzZWxlY3RlZEVkaXRvcjIuZWRpdG9ySW5mby5pZCkge1xuXHRcdFx0XHRjb25zdCB7IGVkaXRvcjogc2VsZWN0ZWREaWZmLCBjb25mbGljdGluZ0RlZmF1bHQ6IGNvbmZsaWN0aW5nRGVmYXVsdERpZmYgfSA9IHRoaXMuZ2V0RWRpdG9yKHJlc291cmNlLCBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCwgZWRpdG9yQXNzb2NpYXRpb25UeXBlKTtcblx0XHRcdFx0c2VsZWN0ZWRFZGl0b3IgPSBzZWxlY3RlZERpZmY7XG5cdFx0XHRcdGNvbmZsaWN0aW5nRGVmYXVsdCA9IGNvbmZsaWN0aW5nRGVmYXVsdERpZmY7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXNlbGVjdGVkRWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybiBSZXNvbHZlZFN0YXR1cy5OT05FO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIG5vIG92ZXJyaWRlIHdlIHRha2UgdGhlIHNlbGVjdGVkIGVkaXRvciBpZCBzbyB0aGF0IG1hdGNoZXMgd29ya3Mgd2l0aCB0aGUgaXNBY3RpdmUgY2hlY2tcblx0XHR1bnR5cGVkRWRpdG9yLm9wdGlvbnMgPSB7IG92ZXJyaWRlOiBzZWxlY3RlZEVkaXRvci5lZGl0b3JJbmZvLmlkLCAuLi51bnR5cGVkRWRpdG9yLm9wdGlvbnMgfTtcblxuXHRcdC8vIENoZWNrIGlmIGRpZmYgY2FuIGJlIGNyZWF0ZWQgYmFzZWQgb24gcHJlc2NlbmUgb2YgZmFjdG9yeSBmdW5jdGlvblxuXHRcdGlmIChzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZURpZmZFZGl0b3JJbnB1dCA9PT0gdW5kZWZpbmVkICYmIGlzUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQodW50eXBlZEVkaXRvcikpIHtcblx0XHRcdHJldHVybiBSZXNvbHZlZFN0YXR1cy5OT05FO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0ID0gYXdhaXQgdGhpcy5kb1Jlc29sdmVFZGl0b3IodW50eXBlZEVkaXRvciwgZ3JvdXAsIHNlbGVjdGVkRWRpdG9yKTtcblx0XHRpZiAoY29uZmxpY3RpbmdEZWZhdWx0ICYmIGlucHV0KSB7XG5cdFx0XHQvLyBTaG93IHRoZSBjb25mbGljdGluZyBkZWZhdWx0IGRpYWxvZ1xuXHRcdFx0YXdhaXQgdGhpcy5kb0hhbmRsZUNvbmZsaWN0aW5nRGVmYXVsdHMocmVzb3VyY2UsIHNlbGVjdGVkRWRpdG9yLmVkaXRvckluZm8ubGFiZWwsIHVudHlwZWRFZGl0b3IsIGlucHV0LmVkaXRvciwgZ3JvdXApO1xuXHRcdH1cblxuXHRcdGlmIChpbnB1dCkge1xuXHRcdFx0aWYgKGlucHV0LmVkaXRvci5lZGl0b3JJZCAhPT0gc2VsZWN0ZWRFZGl0b3IuZWRpdG9ySW5mby5pZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRWRpdG9yIElEIE1pc21hdGNoOiAke2lucHV0LmVkaXRvci5lZGl0b3JJZH0gIT09ICR7c2VsZWN0ZWRFZGl0b3IuZWRpdG9ySW5mby5pZH0uIFRoaXMgd2lsbCBjYXVzZSBidWdzLiBQbGVhc2UgZW5zdXJlIGVkaXRvcklucHV0LmVkaXRvcklkIG1hdGNoZXMgdGhlIHJlZ2lzdGVyZWQgaWRgKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IC4uLmlucHV0LCBncm91cCB9O1xuXHRcdH1cblx0XHRyZXR1cm4gUmVzb2x2ZWRTdGF0dXMuQUJPUlQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUmVzb2x2ZVNpZGVCeVNpZGVFZGl0b3IoZWRpdG9yOiBJUmVzb3VyY2VTaWRlQnlTaWRlRWRpdG9ySW5wdXQsIHByZWZlcnJlZEdyb3VwOiBQcmVmZXJyZWRHcm91cCB8IHVuZGVmaW5lZCk6IFByb21pc2U8UmVzb2x2ZWRFZGl0b3I+IHtcblx0XHRjb25zdCBwcmltYXJ5UmVzb2x2ZWRFZGl0b3IgPSBhd2FpdCB0aGlzLnJlc29sdmVFZGl0b3IoZWRpdG9yLnByaW1hcnksIHByZWZlcnJlZEdyb3VwKTtcblx0XHRpZiAoIWlzRWRpdG9ySW5wdXRXaXRoT3B0aW9uc0FuZEdyb3VwKHByaW1hcnlSZXNvbHZlZEVkaXRvcikpIHtcblx0XHRcdHJldHVybiBSZXNvbHZlZFN0YXR1cy5OT05FO1xuXHRcdH1cblx0XHRjb25zdCBzZWNvbmRhcnlSZXNvbHZlZEVkaXRvciA9IGF3YWl0IHRoaXMucmVzb2x2ZUVkaXRvcihlZGl0b3Iuc2Vjb25kYXJ5LCBwcmltYXJ5UmVzb2x2ZWRFZGl0b3IuZ3JvdXAgPz8gcHJlZmVycmVkR3JvdXApO1xuXHRcdGlmICghaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAoc2Vjb25kYXJ5UmVzb2x2ZWRFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb2x2ZWRTdGF0dXMuTk9ORTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdyb3VwOiBwcmltYXJ5UmVzb2x2ZWRFZGl0b3IuZ3JvdXAgPz8gc2Vjb25kYXJ5UmVzb2x2ZWRFZGl0b3IuZ3JvdXAsXG5cdFx0XHRlZGl0b3I6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2lkZUJ5U2lkZUVkaXRvcklucHV0LCBlZGl0b3IubGFiZWwsIGVkaXRvci5kZXNjcmlwdGlvbiwgc2Vjb25kYXJ5UmVzb2x2ZWRFZGl0b3IuZWRpdG9yLCBwcmltYXJ5UmVzb2x2ZWRFZGl0b3IuZWRpdG9yKSxcblx0XHRcdG9wdGlvbnM6IGVkaXRvci5vcHRpb25zXG5cdFx0fTtcblx0fVxuXG5cdGJ1ZmZlckNoYW5nZUV2ZW50cyhjYWxsYmFjazogRnVuY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVkaXRvclJlZ2lzdHJhdGlvbnMucGF1c2UoKTtcblx0XHR0cnkge1xuXHRcdFx0Y2FsbGJhY2soKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JSZWdpc3RyYXRpb25zLnJlc3VtZSgpO1xuXHRcdH1cblx0fVxuXG5cdHJlZ2lzdGVyRWRpdG9yKFxuXHRcdGdsb2JQYXR0ZXJuOiBzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm4sXG5cdFx0ZWRpdG9ySW5mbzogUmVnaXN0ZXJlZEVkaXRvclJlZ2lzdHJhdGlvbkluZm8sXG5cdFx0b3B0aW9uczogUmVnaXN0ZXJlZEVkaXRvck9wdGlvbnMsXG5cdFx0ZWRpdG9yRmFjdG9yeU9iamVjdDogRWRpdG9ySW5wdXRGYWN0b3J5T2JqZWN0XG5cdCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZWdpc3RlcmVkRWRpdG9ySW5mbyA9IG5vcm1hbGl6ZVJlZ2lzdGVyZWRFZGl0b3JJbmZvKGVkaXRvckluZm8pO1xuXHRcdGxldCByZWdpc3RlcmVkRWRpdG9yID0gdGhpcy5fZWRpdG9ycy5nZXQoZ2xvYlBhdHRlcm4pO1xuXHRcdGlmIChyZWdpc3RlcmVkRWRpdG9yID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlZ2lzdGVyZWRFZGl0b3IgPSBuZXcgTWFwPHN0cmluZywgUmVnaXN0ZXJlZEVkaXRvcnM+KCk7XG5cdFx0XHR0aGlzLl9lZGl0b3JzLnNldChnbG9iUGF0dGVybiwgcmVnaXN0ZXJlZEVkaXRvcik7XG5cdFx0fVxuXG5cdFx0bGV0IGVkaXRvcnNXaXRoSWQgPSByZWdpc3RlcmVkRWRpdG9yLmdldChyZWdpc3RlcmVkRWRpdG9ySW5mby5pZCk7XG5cdFx0aWYgKGVkaXRvcnNXaXRoSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZWRpdG9yc1dpdGhJZCA9IFtdO1xuXHRcdH1cblx0XHRjb25zdCByZW1vdmUgPSBpbnNlcnQoZWRpdG9yc1dpdGhJZCwge1xuXHRcdFx0Z2xvYlBhdHRlcm4sXG5cdFx0XHRlZGl0b3JJbmZvOiByZWdpc3RlcmVkRWRpdG9ySW5mbyxcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRlZGl0b3JGYWN0b3J5T2JqZWN0XG5cdFx0fSk7XG5cdFx0cmVnaXN0ZXJlZEVkaXRvci5zZXQocmVnaXN0ZXJlZEVkaXRvckluZm8uaWQsIGVkaXRvcnNXaXRoSWQpO1xuXHRcdHRoaXMuX3Nob3VsZFJlRmxhdHRlbkVkaXRvcnMgPSB0cnVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yUmVnaXN0cmF0aW9ucy5maXJlKCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRyZW1vdmUoKTtcblx0XHRcdGlmIChlZGl0b3JzV2l0aElkICYmIGVkaXRvcnNXaXRoSWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJlZ2lzdGVyZWRFZGl0b3I/LmRlbGV0ZShlZGl0b3JJbmZvLmlkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Nob3VsZFJlRmxhdHRlbkVkaXRvcnMgPSB0cnVlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JSZWdpc3RyYXRpb25zLmZpcmUoKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldEFzc29jaWF0aW9uc0ZvclJlc291cmNlKHJlc291cmNlOiBVUkkpOiBFZGl0b3JBc3NvY2lhdGlvbnMge1xuXHRcdHJldHVybiB0aGlzLmdldEFzc29jaWF0aW9uc0ZvclJlc291cmNlRnJvbVNldHRpbmcocmVzb3VyY2UsIGVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQpO1xuXHR9XG5cblx0Z2V0Q29uZmlndXJlZERlZmF1bHRFZGl0b3IocmVzb3VyY2U6IFVSSSwgZm9yRGlmZkVkaXRvcj86IGJvb2xlYW4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNldHRpbmdJZCA9IGZvckRpZmZFZGl0b3IgPyBkaWZmRWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCA6IGVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQ7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VGcm9tU2V0dGluZyhyZXNvdXJjZSwgc2V0dGluZ0lkKVswXT8udmlld1R5cGU7XG5cdH1cblxuXHRwcml2YXRlIGdldEFzc29jaWF0aW9uc0ZvclJlc291cmNlQnlUeXBlKHJlc291cmNlOiBVUkksIGFzc29jaWF0aW9uVHlwZTogRWRpdG9yQXNzb2NpYXRpb25UeXBlKTogRWRpdG9yQXNzb2NpYXRpb25zIHtcblx0XHRpZiAoYXNzb2NpYXRpb25UeXBlID09PSBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZShyZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZUFzc29jaWF0aW9ucyA9IHRoaXMuZ2V0QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VGcm9tU2V0dGluZyhyZXNvdXJjZSwgZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQpO1xuXHRcdGlmIChtb2RlQXNzb2NpYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIG1vZGVBc3NvY2lhdGlvbnM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0QXNzb2NpYXRpb25zRm9yUmVzb3VyY2UocmVzb3VyY2UpXG5cdFx0XHQuZmlsdGVyKGFzc29jaWF0aW9uID0+ICF0aGlzLmlzRXhwbGljaXRGb3JBc3NvY2lhdGlvblR5cGUoYXNzb2NpYXRpb24udmlld1R5cGUsIGFzc29jaWF0aW9uVHlwZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGVkaXRvciByZXF1aXJlcyBhbiBhc3NvY2lhdGlvbiBmb3IgdGhlIGdpdmVuIGlucHV0IGtpbmQgaW5zdGVhZCBvZiBpbmhlcml0aW5nIG9uZVxuXHQgKiBmcm9tIGFub3RoZXIgaW5wdXQga2luZC5cblx0ICovXG5cdHByaXZhdGUgaXNFeHBsaWNpdEZvckFzc29jaWF0aW9uVHlwZSh2aWV3VHlwZTogc3RyaW5nLCBhc3NvY2lhdGlvblR5cGU6IEVkaXRvckFzc29jaWF0aW9uVHlwZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyZWRFZGl0b3JzLmZpbHRlcihlZGl0b3IgPT4gZWRpdG9yLmVkaXRvckluZm8uaWQgPT09IHZpZXdUeXBlKS5hdCgwKTtcblx0XHRyZXR1cm4gISFlZGl0b3IgJiYgdGhpcy5nZXRFZmZlY3RpdmVQcmlvcml0eShlZGl0b3IuZWRpdG9ySW5mbywgYXNzb2NpYXRpb25UeXBlKSA9PT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4cGxpY2l0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZUZyb21TZXR0aW5nKHJlc291cmNlOiBVUkksIHNldHRpbmdJZDogc3RyaW5nKTogRWRpdG9yQXNzb2NpYXRpb25zIHtcblx0XHRjb25zdCBtYXRjaGluZ0Fzc29jaWF0aW9ucyA9IHRoaXMuZ2V0UmF3QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VGcm9tU2V0dGluZyhyZXNvdXJjZSwgc2V0dGluZ0lkKTtcblx0XHRjb25zdCBhbGxFZGl0b3JzOiBSZWdpc3RlcmVkRWRpdG9ycyA9IHRoaXMuX3JlZ2lzdGVyZWRFZGl0b3JzO1xuXHRcdC8vIEVuc3VyZSB0aGF0IHRoZSBzZXR0aW5ncyBhcmUgdmFsaWQgZWRpdG9yc1xuXHRcdHJldHVybiBtYXRjaGluZ0Fzc29jaWF0aW9ucy5maWx0ZXIoYXNzb2NpYXRpb24gPT4gYWxsRWRpdG9ycy5maW5kKGMgPT4gYy5lZGl0b3JJbmZvLmlkID09PSBhc3NvY2lhdGlvbi52aWV3VHlwZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSYXdBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZUJ5VHlwZShyZXNvdXJjZTogVVJJLCBhc3NvY2lhdGlvblR5cGU6IEVkaXRvckFzc29jaWF0aW9uVHlwZSk6IEVkaXRvckFzc29jaWF0aW9ucyB7XG5cdFx0aWYgKGFzc29jaWF0aW9uVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0UmF3QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VGcm9tU2V0dGluZyhyZXNvdXJjZSwgZWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlmZkFzc29jaWF0aW9ucyA9IHRoaXMuZ2V0UmF3QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VGcm9tU2V0dGluZyhyZXNvdXJjZSwgZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQpO1xuXHRcdHJldHVybiBkaWZmQXNzb2NpYXRpb25zLmxlbmd0aCA/IGRpZmZBc3NvY2lhdGlvbnMgOiB0aGlzLmdldFJhd0Fzc29jaWF0aW9uc0ZvclJlc291cmNlRnJvbVNldHRpbmcocmVzb3VyY2UsIGVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSYXdBc3NvY2lhdGlvbnNGb3JSZXNvdXJjZUZyb21TZXR0aW5nKHJlc291cmNlOiBVUkksIHNldHRpbmdJZDogc3RyaW5nKTogRWRpdG9yQXNzb2NpYXRpb25zIHtcblx0XHRjb25zdCBhc3NvY2lhdGlvbnMgPSB0aGlzLmdldEFsbFVzZXJBc3NvY2lhdGlvbnNGb3JTZXR0aW5nKHNldHRpbmdJZCk7XG5cdFx0Y29uc3QgbWF0Y2hpbmdBc3NvY2lhdGlvbnMgPSBhc3NvY2lhdGlvbnMuZmlsdGVyKGFzc29jaWF0aW9uID0+IGFzc29jaWF0aW9uLmZpbGVuYW1lUGF0dGVybiAmJiBnbG9iTWF0Y2hlc1Jlc291cmNlKGFzc29jaWF0aW9uLmZpbGVuYW1lUGF0dGVybiwgcmVzb3VyY2UpKTtcblx0XHQvLyBTb3J0IG1hdGNoaW5nIGFzc29jaWF0aW9ucyBiYXNlZCBvbiBnbG9iIGxlbmd0aCBhcyBhIGxvbmdlciBnbG9iIHdpbGwgYmUgbW9yZSBzcGVjaWZpY1xuXHRcdHJldHVybiBtYXRjaGluZ0Fzc29jaWF0aW9ucy5zb3J0KChhLCBiKSA9PiAoYi5maWxlbmFtZVBhdHRlcm4/Lmxlbmd0aCA/PyAwKSAtIChhLmZpbGVuYW1lUGF0dGVybj8ubGVuZ3RoID8/IDApKTtcblx0fVxuXG5cdGdldEFsbFVzZXJBc3NvY2lhdGlvbnMoKTogRWRpdG9yQXNzb2NpYXRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRBbGxVc2VyQXNzb2NpYXRpb25zRm9yU2V0dGluZyhlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWxsVXNlckFzc29jaWF0aW9uc0ZvclNldHRpbmcoc2V0dGluZ0lkOiBzdHJpbmcpOiBFZGl0b3JBc3NvY2lhdGlvbnMge1xuXHRcdGNvbnN0IGluc3BlY3RlZEVkaXRvckFzc29jaWF0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDx7IFtmaWxlTmFtZVBhdHRlcm46IHN0cmluZ106IHN0cmluZyB9PihzZXR0aW5nSWQpIHx8IHt9O1xuXHRcdGNvbnN0IGRlZmF1bHRBc3NvY2lhdGlvbnMgPSBpbnNwZWN0ZWRFZGl0b3JBc3NvY2lhdGlvbnMuZGVmYXVsdFZhbHVlID8/IHt9O1xuXHRcdGNvbnN0IHdvcmtzcGFjZUFzc29jaWF0aW9ucyA9IGluc3BlY3RlZEVkaXRvckFzc29jaWF0aW9ucy53b3Jrc3BhY2VWYWx1ZSA/PyB7fTtcblx0XHRjb25zdCB1c2VyQXNzb2NpYXRpb25zID0gaW5zcGVjdGVkRWRpdG9yQXNzb2NpYXRpb25zLnVzZXJWYWx1ZSA/PyB7fTtcblx0XHRjb25zdCByYXdBc3NvY2lhdGlvbnM6IHsgW2ZpbGVOYW1lUGF0dGVybjogc3RyaW5nXTogc3RyaW5nIH0gPSB7IC4uLndvcmtzcGFjZUFzc29jaWF0aW9ucyB9O1xuXHRcdC8vIFdlIHdhbnQgdG8gYXBwbHkgdGhlIGRlZmF1bHQgYXNzb2NpYXRpb25zIGFuZCB1c2VyIGFzc29jaWF0aW9ucyBvbiB0b3Agb2YgdGhlIHdvcmtzcGFjZSBhc3NvY2lhdGlvbnMgYnV0IGlnbm9yZSBkdXBsaWNhdGUga2V5cy5cblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyh7IC4uLmRlZmF1bHRBc3NvY2lhdGlvbnMsIC4uLnVzZXJBc3NvY2lhdGlvbnMgfSkpIHtcblx0XHRcdGlmIChyYXdBc3NvY2lhdGlvbnNba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJhd0Fzc29jaWF0aW9uc1trZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGFzc29jaWF0aW9ucyA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHJhd0Fzc29jaWF0aW9ucykpIHtcblx0XHRcdGNvbnN0IGFzc29jaWF0aW9uOiBFZGl0b3JBc3NvY2lhdGlvbiA9IHtcblx0XHRcdFx0ZmlsZW5hbWVQYXR0ZXJuOiBrZXksXG5cdFx0XHRcdHZpZXdUeXBlOiB2YWx1ZVxuXHRcdFx0fTtcblx0XHRcdGFzc29jaWF0aW9ucy5wdXNoKGFzc29jaWF0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFzc29jaWF0aW9ucztcblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlbiB0aGUgbmVzdGVkIG5hdHVyZSBvZiB0aGUgZWRpdG9ycyBtYXAsIHdlIG1lcmdlIGZhY3RvcmllcyBvZiB0aGUgc2FtZSBnbG9iIGFuZCBpZCB0byBtYWtlIGl0IGZsYXRcblx0ICogYW5kIGVhc2llciB0byB3b3JrIHdpdGhcblx0ICovXG5cdHByaXZhdGUgX2ZsYXR0ZW5FZGl0b3JzTWFwKCkge1xuXHRcdC8vIElmIHdlIHNob3VsZG4ndCBiZSByZS1mbGF0dGVuaW5nIChkdWUgdG8gbGFjayBvZiB1cGRhdGUpIHRoZW4gcmV0dXJuIGVhcmx5XG5cdFx0aWYgKCF0aGlzLl9zaG91bGRSZUZsYXR0ZW5FZGl0b3JzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmxhdHRlbmVkRWRpdG9ycztcblx0XHR9XG5cdFx0dGhpcy5fc2hvdWxkUmVGbGF0dGVuRWRpdG9ycyA9IGZhbHNlO1xuXHRcdGNvbnN0IGVkaXRvcnMgPSBuZXcgTWFwPHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybiwgUmVnaXN0ZXJlZEVkaXRvcnM+KCk7XG5cdFx0Zm9yIChjb25zdCBbZ2xvYiwgdmFsdWVdIG9mIHRoaXMuX2VkaXRvcnMpIHtcblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3JzOiBSZWdpc3RlcmVkRWRpdG9ycyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3JzIG9mIHZhbHVlLnZhbHVlcygpKSB7XG5cdFx0XHRcdGxldCByZWdpc3RlcmVkRWRpdG9yOiBSZWdpc3RlcmVkRWRpdG9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBNZXJnZSBhbGwgZWRpdG9ycyB3aXRoIHRoZSBzYW1lIGlkIGFuZCBnbG9iIHBhdHRlcm4gdG9nZXRoZXJcblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0XHRcdGlmICghcmVnaXN0ZXJlZEVkaXRvcikge1xuXHRcdFx0XHRcdFx0cmVnaXN0ZXJlZEVkaXRvciA9IHtcblx0XHRcdFx0XHRcdFx0ZWRpdG9ySW5mbzogZWRpdG9yLmVkaXRvckluZm8sXG5cdFx0XHRcdFx0XHRcdGdsb2JQYXR0ZXJuOiBlZGl0b3IuZ2xvYlBhdHRlcm4sXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHt9LFxuXHRcdFx0XHRcdFx0XHRlZGl0b3JGYWN0b3J5T2JqZWN0OiB7fVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gTWVyZ2Ugb3B0aW9ucyBhbmQgZmFjdG9yaWVzXG5cdFx0XHRcdFx0cmVnaXN0ZXJlZEVkaXRvci5vcHRpb25zID0geyAuLi5yZWdpc3RlcmVkRWRpdG9yLm9wdGlvbnMsIC4uLmVkaXRvci5vcHRpb25zIH07XG5cdFx0XHRcdFx0cmVnaXN0ZXJlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0ID0geyAuLi5yZWdpc3RlcmVkRWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QsIC4uLmVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlZ2lzdGVyZWRFZGl0b3IpIHtcblx0XHRcdFx0XHRyZWdpc3RlcmVkRWRpdG9ycy5wdXNoKHJlZ2lzdGVyZWRFZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRlZGl0b3JzLnNldChnbG9iLCByZWdpc3RlcmVkRWRpdG9ycyk7XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0b3JzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIGVkaXRvcnMgYXMgYW4gYXJyYXkuIFBvc3NpYmxlIHRvIGNvbnRhaW4gZHVwbGljYXRlc1xuXHQgKi9cblx0cHJpdmF0ZSBnZXQgX3JlZ2lzdGVyZWRFZGl0b3JzKCk6IFJlZ2lzdGVyZWRFZGl0b3JzIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLl9mbGF0dGVuZWRFZGl0b3JzLnZhbHVlcygpKS5mbGF0KCk7XG5cdH1cblxuXHR1cGRhdGVVc2VyQXNzb2NpYXRpb25zKGdsb2JQYXR0ZXJuOiBzdHJpbmcsIGVkaXRvcklEOiBzdHJpbmcsIGZvckRpZmZFZGl0b3I/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVVc2VyQXNzb2NpYXRpb25zRm9yU2V0dGluZyhmb3JEaWZmRWRpdG9yID8gZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNTZXR0aW5nSWQgOiBlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkLCBnbG9iUGF0dGVybiwgZWRpdG9ySUQpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVVc2VyQXNzb2NpYXRpb25zRm9yVHlwZShhc3NvY2lhdGlvblR5cGU6IEVkaXRvckFzc29jaWF0aW9uVHlwZSwgZ2xvYlBhdHRlcm46IHN0cmluZywgZWRpdG9ySUQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlVXNlckFzc29jaWF0aW9uc0ZvclNldHRpbmcoYXNzb2NpYXRpb25UeXBlID09PSBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRGlmZkVkaXRvciA/IGRpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkIDogZWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCwgZ2xvYlBhdHRlcm4sIGVkaXRvcklEKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVXNlckFzc29jaWF0aW9uc0ZvclNldHRpbmcoc2V0dGluZ0lkOiBzdHJpbmcsIGdsb2JQYXR0ZXJuOiBzdHJpbmcsIGVkaXRvcklEOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdBc3NvY2lhdGlvbjogRWRpdG9yQXNzb2NpYXRpb24gPSB7IHZpZXdUeXBlOiBlZGl0b3JJRCwgZmlsZW5hbWVQYXR0ZXJuOiBnbG9iUGF0dGVybiB9O1xuXHRcdGNvbnN0IGN1cnJlbnRBc3NvY2lhdGlvbnMgPSB0aGlzLmdldEFsbFVzZXJBc3NvY2lhdGlvbnNGb3JTZXR0aW5nKHNldHRpbmdJZCk7XG5cdFx0Y29uc3QgbmV3U2V0dGluZ09iamVjdCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0Ly8gRm9ybSB0aGUgbmV3IHNldHRpbmcgb2JqZWN0IGluY2x1ZGluZyB0aGUgbmV3ZXN0IGFzc29jaWF0aW9uc1xuXHRcdGZvciAoY29uc3QgYXNzb2NpYXRpb24gb2YgWy4uLmN1cnJlbnRBc3NvY2lhdGlvbnMsIG5ld0Fzc29jaWF0aW9uXSkge1xuXHRcdFx0aWYgKGFzc29jaWF0aW9uLmZpbGVuYW1lUGF0dGVybikge1xuXHRcdFx0XHRuZXdTZXR0aW5nT2JqZWN0W2Fzc29jaWF0aW9uLmZpbGVuYW1lUGF0dGVybl0gPSBhc3NvY2lhdGlvbi52aWV3VHlwZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShzZXR0aW5nSWQsIG5ld1NldHRpbmdPYmplY3QpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVVc2VyQXNzb2NpYXRpb25Gb3JTZXR0aW5nKHNldHRpbmdJZDogc3RyaW5nLCBnbG9iUGF0dGVybjogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudEFzc29jaWF0aW9ucyA9IHRoaXMuZ2V0QWxsVXNlckFzc29jaWF0aW9uc0ZvclNldHRpbmcoc2V0dGluZ0lkKTtcblx0XHRpZiAoIWN1cnJlbnRBc3NvY2lhdGlvbnMuc29tZShhc3NvY2lhdGlvbiA9PiBhc3NvY2lhdGlvbi5maWxlbmFtZVBhdHRlcm4gPT09IGdsb2JQYXR0ZXJuKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuZXdTZXR0aW5nT2JqZWN0ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRmb3IgKGNvbnN0IGFzc29jaWF0aW9uIG9mIGN1cnJlbnRBc3NvY2lhdGlvbnMpIHtcblx0XHRcdGlmIChhc3NvY2lhdGlvbi5maWxlbmFtZVBhdHRlcm4gJiYgYXNzb2NpYXRpb24uZmlsZW5hbWVQYXR0ZXJuICE9PSBnbG9iUGF0dGVybikge1xuXHRcdFx0XHRuZXdTZXR0aW5nT2JqZWN0W2Fzc29jaWF0aW9uLmZpbGVuYW1lUGF0dGVybl0gPSBhc3NvY2lhdGlvbi52aWV3VHlwZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShzZXR0aW5nSWQsIG5ld1NldHRpbmdPYmplY3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kTWF0Y2hpbmdFZGl0b3JzKHJlc291cmNlOiBVUkksIGFzc29jaWF0aW9uVHlwZTogRWRpdG9yQXNzb2NpYXRpb25UeXBlID0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkVkaXRvcik6IFJlZ2lzdGVyZWRFZGl0b3JbXSB7XG5cdFx0Ly8gVGhlIHVzZXIgc2V0dGluZyBzaG91bGQgYmUgcmVzcGVjdGVkIGV2ZW4gaWYgdGhlIGVkaXRvciBkb2Vzbid0IHNwZWNpZnkgdGhhdCByZXNvdXJjZSBpbiBwYWNrYWdlLmpzb25cblx0XHRjb25zdCB1c2VyU2V0dGluZ3MgPSB0aGlzLmdldEFzc29jaWF0aW9uc0ZvclJlc291cmNlQnlUeXBlKHJlc291cmNlLCBhc3NvY2lhdGlvblR5cGUpO1xuXHRcdGNvbnN0IG1hdGNoaW5nRWRpdG9yczogUmVnaXN0ZXJlZEVkaXRvcltdID0gW107XG5cdFx0Ly8gVGhlbiBhbGwgZ2xvYiBwYXR0ZXJuc1xuXHRcdGZvciAoY29uc3QgW2tleSwgZWRpdG9yc10gb2YgdGhpcy5fZmxhdHRlbmVkRWRpdG9ycykge1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0XHRpZiAoYXNzb2NpYXRpb25UeXBlID09PSBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRGlmZkVkaXRvciAmJiAhZWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFzc29jaWF0aW9uVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLk1lcmdlRWRpdG9yICYmICFlZGl0b3IuZWRpdG9yRmFjdG9yeU9iamVjdC5jcmVhdGVNZXJnZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVkaXRvci5vcHRpb25zPy5jYW5TdXBwb3J0UmVzb3VyY2UgJiYgIWVkaXRvci5vcHRpb25zLmNhblN1cHBvcnRSZXNvdXJjZShyZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGZvdW5kSW5TZXR0aW5ncyA9IHVzZXJTZXR0aW5ncy5maW5kKHNldHRpbmcgPT4gc2V0dGluZy52aWV3VHlwZSA9PT0gZWRpdG9yLmVkaXRvckluZm8uaWQpO1xuXHRcdFx0XHRpZiAoKGZvdW5kSW5TZXR0aW5ncyAmJiB0aGlzLmdldEVmZmVjdGl2ZVByaW9yaXR5KGVkaXRvci5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpICE9PSBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlKSB8fCBnbG9iTWF0Y2hlc1Jlc291cmNlKGtleSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0bWF0Y2hpbmdFZGl0b3JzLnB1c2goZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBSZXR1cm4gdGhlIGVkaXRvcnMgc29ydGVkIGJ5IHRoZWlyIHByaW9yaXR5XG5cdFx0cmV0dXJuIG1hdGNoaW5nRWRpdG9ycy5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRjb25zdCBhUHJpb3JpdHkgPSB0aGlzLmdldEVmZmVjdGl2ZVByaW9yaXR5KGEuZWRpdG9ySW5mbywgYXNzb2NpYXRpb25UeXBlKTtcblx0XHRcdGNvbnN0IGJQcmlvcml0eSA9IHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkoYi5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpO1xuXHRcdFx0Ly8gVmVyeSBjcnVkZSBpZiBwcmlvcml0aWVzIG1hdGNoIGxvbmdlciBnbG9iIHdpbnMgYXMgbG9uZ2VyIGdsb2JzIGFyZSBub3JtYWxseSBtb3JlIHNwZWNpZmljXG5cdFx0XHRpZiAocHJpb3JpdHlUb1JhbmsoYlByaW9yaXR5KSA9PT0gcHJpb3JpdHlUb1JhbmsoYVByaW9yaXR5KSAmJiB0eXBlb2YgYi5nbG9iUGF0dGVybiA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGEuZ2xvYlBhdHRlcm4gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybiBiLmdsb2JQYXR0ZXJuLmxlbmd0aCAtIGEuZ2xvYlBhdHRlcm4ubGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHByaW9yaXR5VG9SYW5rKGJQcmlvcml0eSkgLSBwcmlvcml0eVRvUmFuayhhUHJpb3JpdHkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldEVkaXRvcnMocmVzb3VyY2VPck9wdGlvbnM/OiBVUkkgfCBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlR2V0QWxsRWRpdG9yc09wdGlvbnMsIG9wdGlvbnM/OiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlR2V0RWRpdG9yc09wdGlvbnMpOiBSZWdpc3RlcmVkRWRpdG9ySW5mb1tdIHtcblx0XHR0aGlzLl9mbGF0dGVuZWRFZGl0b3JzID0gdGhpcy5fZmxhdHRlbkVkaXRvcnNNYXAoKTtcblxuXHRcdC8vIEJ5IHJlc291cmNlXG5cdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZU9yT3B0aW9ucykpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VPck9wdGlvbnM7XG5cdFx0XHRjb25zdCBhc3NvY2lhdGlvblR5cGUgPSBvcHRpb25zPy5pc0RpZmZFZGl0b3IgPyBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRGlmZkVkaXRvciA6IEVkaXRvckFzc29jaWF0aW9uVHlwZS5FZGl0b3I7XG5cdFx0XHRsZXQgZWRpdG9ycyA9IHRoaXMuZmluZE1hdGNoaW5nRWRpdG9ycyhyZXNvdXJjZSwgYXNzb2NpYXRpb25UeXBlKTtcblx0XHRcdGlmIChlZGl0b3JzLmZpbmQoZWRpdG9yID0+IHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkoZWRpdG9yLmVkaXRvckluZm8sIGFzc29jaWF0aW9uVHlwZSkgPT09IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmUpKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGlmIChvcHRpb25zPy5leGNsdWRlVW5jb25maWd1cmVkVW5pdmVyc2FsT3B0aW9uYWxFZGl0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRFZGl0b3JJZHMgPSBuZXcgU2V0KHRoaXMuZ2V0QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VCeVR5cGUocmVzb3VyY2UsIGFzc29jaWF0aW9uVHlwZSkubWFwKGFzc29jaWF0aW9uID0+IGFzc29jaWF0aW9uLnZpZXdUeXBlKSk7XG5cdFx0XHRcdGVkaXRvcnMgPSBlZGl0b3JzLmZpbHRlcihlZGl0b3IgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByaW9yaXR5ID0gdGhpcy5nZXRFZmZlY3RpdmVQcmlvcml0eShlZGl0b3IuZWRpdG9ySW5mbywgYXNzb2NpYXRpb25UeXBlKTtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yLmdsb2JQYXR0ZXJuICE9PSAnKidcblx0XHRcdFx0XHRcdHx8IHByaW9yaXR5ICE9PSBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uXG5cdFx0XHRcdFx0XHR8fCBlZGl0b3IuZWRpdG9ySW5mby5pZCA9PT0gb3B0aW9ucy5jdXJyZW50RWRpdG9ySWRcblx0XHRcdFx0XHRcdHx8IGNvbmZpZ3VyZWRFZGl0b3JJZHMuaGFzKGVkaXRvci5lZGl0b3JJbmZvLmlkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBkaXN0aW5jdChlZGl0b3JzLm1hcChlZGl0b3IgPT4gZWRpdG9yLmVkaXRvckluZm8pLCBlZGl0b3IgPT4gZWRpdG9yLmlkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBlZGl0b3JzLm1hcChlZGl0b3IgPT4gZWRpdG9yLmVkaXRvckluZm8pO1xuXHRcdH1cblxuXHRcdC8vIEFsbFxuXHRcdGNvbnN0IGVkaXRvcnMgPSByZXNvdXJjZU9yT3B0aW9ucz8uZXhjbHVkZUV4Y2x1c2l2ZUVkaXRvcnNcblx0XHRcdD8gdGhpcy5fcmVnaXN0ZXJlZEVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiBlZGl0b3IuZWRpdG9ySW5mby5wcmlvcml0eS5lZGl0b3IgIT09IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leGNsdXNpdmUpXG5cdFx0XHQ6IHRoaXMuX3JlZ2lzdGVyZWRFZGl0b3JzO1xuXHRcdHJldHVybiBkaXN0aW5jdChlZGl0b3JzLm1hcChlZGl0b3IgPT4gZWRpdG9yLmVkaXRvckluZm8pLCBlZGl0b3IgPT4gZWRpdG9yLmlkKTtcblx0fVxuXG5cdGdldEJpbmFyeURpZmZGYWxsYmFja0VkaXRvcihyZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLl9mbGF0dGVuZWRFZGl0b3JzID0gdGhpcy5fZmxhdHRlbkVkaXRvcnNNYXAoKTtcblxuXHRcdC8vIGBmaW5kTWF0Y2hpbmdFZGl0b3JzKC4uLiwgRGlmZkVkaXRvcilgIG9ubHkga2VlcHMgZWRpdG9ycyB0aGF0IHByb3ZpZGUgYSBkaWZmIGVkaXRvciBmYWN0b3J5XG5cdFx0Ly8gYW5kIHNvcnRzIHRoZW0gYnkgdGhlaXIgZGlmZiBwcmlvcml0eS4gSXQgc3RpbGwgaW5jbHVkZXMgYGV4cGxpY2l0YCBlZGl0b3JzICh0aGV5IG1hdGNoIGJ5IGdsb2IpLFxuXHRcdC8vIHdoaWNoIGlzIGV4YWN0bHkgd2hhdCB3ZSB3YW50IGhlcmU6IGFuIGBleHBsaWNpdGAgZWRpdG9yIG9wdHMgb3V0IG9mIGRpZmZzIGZvciB0ZXh0IGZpbGVzLCBidXQgaXNcblx0XHQvLyB0aGUgYmV0dGVyIGNob2ljZSB0aGFuIHRoZSBnZW5lcmljIGJpbmFyeSBmYWxsYmFjayB3aGVuIHRoZSB0ZXh0IGRpZmYgZWRpdG9yIGNhbm5vdCByZW5kZXIgdGhlXG5cdFx0Ly8gY29udGVudC4gV2UgZXhjbHVkZSB0aGUgYnVpbHQtaW4gZGVmYXVsdCB0ZXh0IGVkaXRvciBzaW5jZSB0aGF0IGlzIHRoZSBlZGl0b3IgdGhhdCBhbHJlYWR5XG5cdFx0Ly8gZmFpbGVkIHRvIHJlbmRlciB0aGUgYmluYXJ5IGNvbnRlbnQuXG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuZmluZE1hdGNoaW5nRWRpdG9ycyhyZXNvdXJjZSwgRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IpXG5cdFx0XHQuZmlsdGVyKGVkaXRvciA9PiBlZGl0b3IuZWRpdG9ySW5mby5pZCAhPT0gREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQpO1xuXHRcdHJldHVybiBlZGl0b3JzWzBdPy5lZGl0b3JJbmZvLmlkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGEgcmVzb3VyY2UgYW5kIGFuIGVkaXRvcklkIHNlbGVjdHMgdGhlIGJlc3QgcG9zc2libGUgZWRpdG9yXG5cdCAqIEByZXR1cm5zIFRoZSBlZGl0b3IgYW5kIHdoZXRoZXIgdGhlcmUgd2FzIGFub3RoZXIgZGVmYXVsdCB3aGljaCBjb25mbGljdGVkIHdpdGggaXRcblx0ICovXG5cdHByaXZhdGUgZ2V0RWRpdG9yKHJlc291cmNlOiBVUkksIGVkaXRvcklkOiBzdHJpbmcgfCBFZGl0b3JSZXNvbHV0aW9uLkVYQ0xVU0lWRV9PTkxZIHwgdW5kZWZpbmVkLCBhc3NvY2lhdGlvblR5cGU6IEVkaXRvckFzc29jaWF0aW9uVHlwZSk6IHsgZWRpdG9yOiBSZWdpc3RlcmVkRWRpdG9yIHwgdW5kZWZpbmVkOyBjb25mbGljdGluZ0RlZmF1bHQ6IGJvb2xlYW4gfSB7XG5cblx0XHRjb25zdCBmaW5kTWF0Y2hpbmdFZGl0b3IgPSAoZWRpdG9yczogUmVnaXN0ZXJlZEVkaXRvcnMsIHZpZXdUeXBlOiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiBlZGl0b3JzLmZpbmQoKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRpZiAoYXNzb2NpYXRpb25UeXBlID09PSBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRGlmZkVkaXRvciAmJiAhZWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhc3NvY2lhdGlvblR5cGUgPT09IEVkaXRvckFzc29jaWF0aW9uVHlwZS5NZXJnZUVkaXRvciAmJiAhZWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlTWVyZ2VFZGl0b3JJbnB1dCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlZGl0b3Iub3B0aW9ucz8uY2FuU3VwcG9ydFJlc291cmNlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yLmVkaXRvckluZm8uaWQgPT09IHZpZXdUeXBlICYmIGVkaXRvci5vcHRpb25zLmNhblN1cHBvcnRSZXNvdXJjZShyZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGVkaXRvci5lZGl0b3JJbmZvLmlkID09PSB2aWV3VHlwZTtcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRpZiAoZWRpdG9ySWQgJiYgZWRpdG9ySWQgIT09IEVkaXRvclJlc29sdXRpb24uRVhDTFVTSVZFX09OTFkpIHtcblx0XHRcdC8vIFNwZWNpZmljIGlkIHBhc3NlZCBpbiBkb2Vzbid0IGhhdmUgdG8gbWF0Y2ggdGhlIHJlc291cmNlLCBpdCBjYW4gYmUgYW55dGhpbmdcblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3JzID0gdGhpcy5fcmVnaXN0ZXJlZEVkaXRvcnM7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlZGl0b3I6IGZpbmRNYXRjaGluZ0VkaXRvcihyZWdpc3RlcmVkRWRpdG9ycywgZWRpdG9ySWQpLFxuXHRcdFx0XHRjb25mbGljdGluZ0RlZmF1bHQ6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvcnMgPSB0aGlzLmZpbmRNYXRjaGluZ0VkaXRvcnMocmVzb3VyY2UsIGFzc29jaWF0aW9uVHlwZSk7XG5cblx0XHRjb25zdCBhc3NvY2lhdGlvbnNGcm9tU2V0dGluZyA9IHRoaXMuZ2V0QXNzb2NpYXRpb25zRm9yUmVzb3VyY2VCeVR5cGUocmVzb3VyY2UsIGFzc29jaWF0aW9uVHlwZSk7XG5cdFx0Ly8gV2Ugb25seSB3YW50IG1pblByaW9yaXR5KyBpZiBubyB1c2VyIGRlZmluZWQgc2V0dGluZyBpcyBmb3VuZCwgZWxzZSB3ZSB3b24ndCByZXNvbHZlIGFuIGVkaXRvclxuXHRcdGNvbnN0IG1pblByaW9yaXR5ID0gZWRpdG9ySWQgPT09IEVkaXRvclJlc29sdXRpb24uRVhDTFVTSVZFX09OTFkgPyBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlIDogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmJ1aWx0aW47XG5cdFx0bGV0IHBvc3NpYmxlRWRpdG9ycyA9IGVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiBwcmlvcml0eVRvUmFuayh0aGlzLmdldEVmZmVjdGl2ZVByaW9yaXR5KGVkaXRvci5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpKSA+PSBwcmlvcml0eVRvUmFuayhtaW5Qcmlvcml0eSkgJiYgZWRpdG9yLmVkaXRvckluZm8uaWQgIT09IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkKTtcblx0XHRpZiAocG9zc2libGVFZGl0b3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZWRpdG9yOiBhc3NvY2lhdGlvbnNGcm9tU2V0dGluZ1swXSAmJiBtaW5Qcmlvcml0eSAhPT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZSA/IGZpbmRNYXRjaGluZ0VkaXRvcihlZGl0b3JzLCBhc3NvY2lhdGlvbnNGcm9tU2V0dGluZ1swXS52aWV3VHlwZSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbmZsaWN0aW5nRGVmYXVsdDogZmFsc2Vcblx0XHRcdH07XG5cdFx0fVxuXHRcdC8vIElmIHRoZSBlZGl0b3IgaXMgZXhjbHVzaXZlIHdlIHVzZSB0aGF0LCBlbHNlIHVzZSB0aGUgdXNlciBzZXR0aW5nLCBlbHNlIHdlIGNoZWNrIGNhblN1cHBvcnRSZXNvdXJjZSwgZWxzZSB0YWtlIHRoZSB2aWV3dHlwZSBvZiBmaXJzdCBwb3NzaWJsZSBlZGl0b3Jcblx0XHRjb25zdCBjb25maWd1cmVkRWRpdG9yID0gYXNzb2NpYXRpb25zRnJvbVNldHRpbmdbMF0gPyBmaW5kTWF0Y2hpbmdFZGl0b3IoZWRpdG9ycywgYXNzb2NpYXRpb25zRnJvbVNldHRpbmdbMF0udmlld1R5cGUpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNlbGVjdGVkVmlld1R5cGUgPSB0aGlzLmdldEVmZmVjdGl2ZVByaW9yaXR5KHBvc3NpYmxlRWRpdG9yc1swXS5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpID09PSBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlID9cblx0XHRcdHBvc3NpYmxlRWRpdG9yc1swXS5lZGl0b3JJbmZvLmlkIDpcblx0XHRcdGNvbmZpZ3VyZWRFZGl0b3I/LmVkaXRvckluZm8uaWQgfHxcblx0XHRcdChwb3NzaWJsZUVkaXRvcnMuZmluZChlZGl0b3IgPT4gKCFlZGl0b3Iub3B0aW9ucz8uY2FuU3VwcG9ydFJlc291cmNlIHx8IGVkaXRvci5vcHRpb25zLmNhblN1cHBvcnRSZXNvdXJjZShyZXNvdXJjZSkpKT8uZWRpdG9ySW5mby5pZCkgfHxcblx0XHRcdHBvc3NpYmxlRWRpdG9yc1swXS5lZGl0b3JJbmZvLmlkO1xuXG5cdFx0bGV0IGNvbmZsaWN0aW5nRGVmYXVsdCA9IGZhbHNlO1xuXG5cdFx0Ly8gRmlsdGVyIG91dCBleGNsdXNpdmUgYmVmb3JlIHdlIGNoZWNrIGZvciBjb25mbGljdHMgYXMgZXhjbHVzaXZlIGVkaXRvcnMgY2Fubm90IGJlIG1hbnVhbGx5IGNob3NlblxuXHRcdC8vIHNpbWlsYXIgdG8gYWJvdmUsIG5lZWQgdG8gY2hlY2sgY2FuU3VwcG9ydFJlc291cmNlIGlmIG5vdGhpbmcgaXMgZXhjbHVzaXZlXG5cdFx0cG9zc2libGVFZGl0b3JzID0gcG9zc2libGVFZGl0b3JzXG5cdFx0XHQuZmlsdGVyKGVkaXRvciA9PiB0aGlzLmdldEVmZmVjdGl2ZVByaW9yaXR5KGVkaXRvci5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpICE9PSBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhjbHVzaXZlKVxuXHRcdFx0LmZpbHRlcihlZGl0b3IgPT4gIWVkaXRvci5vcHRpb25zPy5jYW5TdXBwb3J0UmVzb3VyY2UgfHwgZWRpdG9yLm9wdGlvbnMuY2FuU3VwcG9ydFJlc291cmNlKHJlc291cmNlKSk7XG5cdFx0aWYgKGFzc29jaWF0aW9uc0Zyb21TZXR0aW5nLmxlbmd0aCA9PT0gMCAmJiBwb3NzaWJsZUVkaXRvcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uZmxpY3RpbmdEZWZhdWx0ID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWRpdG9yOiBmaW5kTWF0Y2hpbmdFZGl0b3IoZWRpdG9ycywgc2VsZWN0ZWRWaWV3VHlwZSksXG5cdFx0XHRjb25mbGljdGluZ0RlZmF1bHRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZmZlY3RpdmVQcmlvcml0eShlZGl0b3JJbmZvOiBSZWdpc3RlcmVkRWRpdG9ySW5mbywgYXNzb2NpYXRpb25UeXBlOiBFZGl0b3JBc3NvY2lhdGlvblR5cGUpOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkge1xuXHRcdHN3aXRjaCAoYXNzb2NpYXRpb25UeXBlKSB7XG5cdFx0XHRjYXNlIEVkaXRvckFzc29jaWF0aW9uVHlwZS5EaWZmRWRpdG9yOlxuXHRcdFx0XHRyZXR1cm4gZWRpdG9ySW5mby5wcmlvcml0eS5kaWZmO1xuXHRcdFx0Y2FzZSBFZGl0b3JBc3NvY2lhdGlvblR5cGUuTWVyZ2VFZGl0b3I6XG5cdFx0XHRcdHJldHVybiBlZGl0b3JJbmZvLnByaW9yaXR5Lm1lcmdlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGVkaXRvckluZm8ucHJpb3JpdHkuZWRpdG9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZXNvbHZlRWRpdG9yKGVkaXRvcjogSVVudHlwZWRFZGl0b3JJbnB1dCwgZ3JvdXA6IElFZGl0b3JHcm91cCwgc2VsZWN0ZWRFZGl0b3I6IFJlZ2lzdGVyZWRFZGl0b3IpOiBQcm9taXNlPEVkaXRvcklucHV0V2l0aE9wdGlvbnMgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgb3B0aW9ucyA9IGVkaXRvci5vcHRpb25zO1xuXHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRDYW5vbmljYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0Ly8gSWYgbm8gYWN0aXZhdGlvbiBvcHRpb24gaXMgcHJvdmlkZWQsIHBvcHVsYXRlIGl0LlxuXHRcdGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLmFjdGl2YXRpb24gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBhY3RpdmF0aW9uOiBvcHRpb25zLnByZXNlcnZlRm9jdXMgPyBFZGl0b3JBY3RpdmF0aW9uLlJFU1RPUkUgOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cblx0XHQvLyBJZiBpdCdzIGEgbWVyZ2UgZWRpdG9yIHdlIHRyaWdnZXIgdGhlIGNyZWF0ZSBtZXJnZSBlZGl0b3IgaW5wdXRcblx0XHRpZiAoaXNSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0aWYgKCFzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZU1lcmdlRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5wdXRXaXRoT3B0aW9ucyA9IGF3YWl0IHNlbGVjdGVkRWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlTWVyZ2VFZGl0b3JJbnB1dChlZGl0b3IsIGdyb3VwKTtcblx0XHRcdHJldHVybiB7IGVkaXRvcjogaW5wdXRXaXRoT3B0aW9ucy5lZGl0b3IsIG9wdGlvbnM6IGlucHV0V2l0aE9wdGlvbnMub3B0aW9ucyA/PyBvcHRpb25zIH07XG5cdFx0fVxuXG5cdFx0Ly8gSWYgaXQncyBhIGRpZmYgZWRpdG9yIHdlIHRyaWdnZXIgdGhlIGNyZWF0ZSBkaWZmIGVkaXRvciBpbnB1dFxuXHRcdGlmIChpc1Jlc291cmNlRGlmZkVkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdGlmICghc2VsZWN0ZWRFZGl0b3IuZWRpdG9yRmFjdG9yeU9iamVjdC5jcmVhdGVEaWZmRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5wdXRXaXRoT3B0aW9ucyA9IGF3YWl0IHNlbGVjdGVkRWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlRGlmZkVkaXRvcklucHV0KGVkaXRvciwgZ3JvdXApO1xuXHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBpbnB1dFdpdGhPcHRpb25zLmVkaXRvciwgb3B0aW9uczogaW5wdXRXaXRoT3B0aW9ucy5vcHRpb25zID8/IG9wdGlvbnMgfTtcblx0XHR9XG5cblx0XHQvLyBJZiBpdCdzIGEgZGlmZiBsaXN0IGVkaXRvciB3ZSB0cmlnZ2VyIHRoZSBjcmVhdGUgZGlmZiBsaXN0IGVkaXRvciBpbnB1dFxuXHRcdGlmIChpc1Jlc291cmNlTXVsdGlEaWZmRWRpdG9ySW5wdXQoZWRpdG9yKSkge1xuXHRcdFx0aWYgKCFzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZU11bHRpRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlucHV0V2l0aE9wdGlvbnMgPSBhd2FpdCBzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZU11bHRpRGlmZkVkaXRvcklucHV0KGVkaXRvciwgZ3JvdXApO1xuXHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBpbnB1dFdpdGhPcHRpb25zLmVkaXRvciwgb3B0aW9uczogaW5wdXRXaXRoT3B0aW9ucy5vcHRpb25zID8/IG9wdGlvbnMgfTtcblx0XHR9XG5cblx0XHRpZiAoaXNSZXNvdXJjZVNpZGVCeVNpZGVFZGl0b3JJbnB1dChlZGl0b3IpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVudHlwZWQgc2lkZSBieSBzaWRlIGVkaXRvciBpbnB1dCBub3Qgc3VwcG9ydGVkIGhlcmUuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzVW50aXRsZWRSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvcikpIHtcblx0XHRcdGlmICghc2VsZWN0ZWRFZGl0b3IuZWRpdG9yRmFjdG9yeU9iamVjdC5jcmVhdGVVbnRpdGxlZEVkaXRvcklucHV0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlucHV0V2l0aE9wdGlvbnMgPSBhd2FpdCBzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZVVudGl0bGVkRWRpdG9ySW5wdXQoZWRpdG9yLCBncm91cCk7XG5cdFx0XHRyZXR1cm4geyBlZGl0b3I6IGlucHV0V2l0aE9wdGlvbnMuZWRpdG9yLCBvcHRpb25zOiBpbnB1dFdpdGhPcHRpb25zLm9wdGlvbnMgPz8gb3B0aW9ucyB9O1xuXHRcdH1cblxuXHRcdC8vIFNob3VsZCBubyBsb25nZXIgaGF2ZSBhbiB1bmRlZmluZWQgcmVzb3VyY2Ugc28gbGV0cyB0aHJvdyBhbiBlcnJvciBpZiB0aGF0J3Mgc29tZWhvdyB0aGUgY2FzZVxuXHRcdGlmIChyZXNvdXJjZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZGVmaW5lZCByZXNvdXJjZSBvbiBub24gdW50aXRsZWQgZWRpdG9yIGlucHV0LmApO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBlZGl0b3Igc3RhdGVzIGl0IGNhbiBvbmx5IGJlIG9wZW5lZCBvbmNlIHBlciByZXNvdXJjZSB3ZSBtdXN0IGNsb3NlIGFsbCBleGlzdGluZyBvbmVzIGV4Y2VwdCBvbmUgYW5kIG1vdmUgdGhlIG5ldyBvbmUgaW50byB0aGUgZ3JvdXBcblx0XHRjb25zdCBzaW5nbGVFZGl0b3JQZXJSZXNvdXJjZSA9IHR5cGVvZiBzZWxlY3RlZEVkaXRvci5vcHRpb25zPy5zaW5nbGVQZXJSZXNvdXJjZSA9PT0gJ2Z1bmN0aW9uJyA/IHNlbGVjdGVkRWRpdG9yLm9wdGlvbnMuc2luZ2xlUGVyUmVzb3VyY2UoKSA6IHNlbGVjdGVkRWRpdG9yLm9wdGlvbnM/LnNpbmdsZVBlclJlc291cmNlO1xuXHRcdGlmIChzaW5nbGVFZGl0b3JQZXJSZXNvdXJjZSkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdFZGl0b3JzID0gdGhpcy5maW5kRXhpc3RpbmdFZGl0b3JzRm9yUmVzb3VyY2UocmVzb3VyY2UsIHNlbGVjdGVkRWRpdG9yLmVkaXRvckluZm8uaWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhpcy5tb3ZlRXhpc3RpbmdFZGl0b3JGb3JSZXNvdXJjZShleGlzdGluZ0VkaXRvcnMsIGdyb3VwKTtcblx0XHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRcdHJldHVybiB7IGVkaXRvciwgb3B0aW9ucyB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gZmFpbGVkIHRvIG1vdmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIG5vIGZhY3RvcnkgaXMgYWJvdmUsIHJldHVybiBmbG93IGJhY2sgdG8gY2FsbGVyIGxldHRpbmcgdGhlbSBrbm93IHdlIGNvdWxkIG5vdCByZXNvbHZlIGl0XG5cdFx0aWYgKCFzZWxlY3RlZEVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZUVkaXRvcklucHV0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVzcGVjdCBvcHRpb25zIHBhc3NlZCBiYWNrXG5cdFx0Y29uc3QgaW5wdXRXaXRoT3B0aW9ucyA9IGF3YWl0IHNlbGVjdGVkRWRpdG9yLmVkaXRvckZhY3RvcnlPYmplY3QuY3JlYXRlRWRpdG9ySW5wdXQoZWRpdG9yLCBncm91cCk7XG5cdFx0b3B0aW9ucyA9IGlucHV0V2l0aE9wdGlvbnMub3B0aW9ucyA/PyBvcHRpb25zO1xuXHRcdGNvbnN0IGlucHV0ID0gaW5wdXRXaXRoT3B0aW9ucy5lZGl0b3I7XG5cblx0XHRyZXR1cm4geyBlZGl0b3I6IGlucHV0LCBvcHRpb25zIH07XG5cdH1cblxuXHQvKipcblx0ICogTW92ZXMgdGhlIGZpcnN0IGV4aXN0aW5nIGVkaXRvciBmb3IgYSByZXNvdXJjZSB0byB0aGUgdGFyZ2V0IGdyb3VwIHVubGVzcyBhbHJlYWR5IG9wZW5lZCB0aGVyZS5cblx0ICogQWRkaXRpb25hbGx5IHdpbGwgY2xvc2UgYW55IG90aGVyIGVkaXRvcnMgdGhhdCBhcmUgb3BlbiBmb3IgdGhhdCByZXNvdXJjZSBhbmQgdmlld3R5cGUgYmVzaWRlcyB0aGUgZmlyc3Qgb25lIGZvdW5kXG5cdCAqIEBwYXJhbSByZXNvdXJjZSBUaGUgcmVzb3VyY2Ugb2YgdGhlIGVkaXRvclxuXHQgKiBAcGFyYW0gdmlld1R5cGUgdGhlIHZpZXd0eXBlIG9mIHRoZSBlZGl0b3Jcblx0ICogQHBhcmFtIHRhcmdldEdyb3VwIFRoZSBncm91cCB0byBtb3ZlIGl0IHRvXG5cdCAqIEByZXR1cm5zIFRoZSBtb3ZlZCBlZGl0b3IgaW5wdXQgb3IgYHVuZGVmaW5lZGAgaWYgdGhlIGVkaXRvciBjb3VsZCBub3QgYmUgbW92ZWRcblx0ICovXG5cdHByaXZhdGUgYXN5bmMgbW92ZUV4aXN0aW5nRWRpdG9yRm9yUmVzb3VyY2UoXG5cdFx0ZXhpc3RpbmdFZGl0b3JzRm9yUmVzb3VyY2U6IEFycmF5PHsgZWRpdG9yOiBFZGl0b3JJbnB1dDsgZ3JvdXA6IElFZGl0b3JHcm91cCB9Pixcblx0XHR0YXJnZXRHcm91cDogSUVkaXRvckdyb3VwLFxuXHQpOiBQcm9taXNlPEVkaXRvcklucHV0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZWRpdG9yVG9Vc2UgPSBleGlzdGluZ0VkaXRvcnNGb3JSZXNvdXJjZVswXTtcblxuXHRcdC8vIFdlIHNob3VsZCBvbmx5IGhhdmUgb25lIGVkaXRvciBidXQgaWYgdGhlcmUgYXJlIG11bHRpcGxlIHdlIGNsb3NlIHRoZSBvdGhlcnNcblx0XHRmb3IgKGNvbnN0IHsgZWRpdG9yLCBncm91cCB9IG9mIGV4aXN0aW5nRWRpdG9yc0ZvclJlc291cmNlKSB7XG5cdFx0XHRpZiAoZWRpdG9yICE9PSBlZGl0b3JUb1VzZS5lZGl0b3IpIHtcblx0XHRcdFx0Y29uc3QgY2xvc2VkID0gYXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0aWYgKCFjbG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNb3ZlIHRoZSBlZGl0b3IgYWxyZWFkeSBvcGVuZWQgdG8gdGhlIHRhcmdldCBncm91cFxuXHRcdGlmICh0YXJnZXRHcm91cC5pZCAhPT0gZWRpdG9yVG9Vc2UuZ3JvdXAuaWQpIHtcblx0XHRcdGNvbnN0IG1vdmVkID0gZWRpdG9yVG9Vc2UuZ3JvdXAubW92ZUVkaXRvcihlZGl0b3JUb1VzZS5lZGl0b3IsIHRhcmdldEdyb3VwKTtcblx0XHRcdGlmICghbW92ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0b3JUb1VzZS5lZGl0b3I7XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYSByZXNvdXJjZSBhbmQgYW4gZWRpdG9ySWQsIHJldHVybnMgYWxsIGVkaXRvcnMgb3BlbiBmb3IgdGhhdCByZXNvdXJjZSBhbmQgZWRpdG9ySWQuXG5cdCAqIEBwYXJhbSByZXNvdXJjZSBUaGUgcmVzb3VyY2Ugc3BlY2lmaWVkXG5cdCAqIEBwYXJhbSBlZGl0b3JJZCBUaGUgZWRpdG9ySURcblx0ICogQHJldHVybnMgQSBsaXN0IG9mIGVkaXRvcnNcblx0ICovXG5cdHByaXZhdGUgZmluZEV4aXN0aW5nRWRpdG9yc0ZvclJlc291cmNlKFxuXHRcdHJlc291cmNlOiBVUkksXG5cdFx0ZWRpdG9ySWQ6IHN0cmluZyxcblx0KTogQXJyYXk8eyBlZGl0b3I6IEVkaXRvcklucHV0OyBncm91cDogSUVkaXRvckdyb3VwIH0+IHtcblx0XHRjb25zdCBvdXQ6IEFycmF5PHsgZWRpdG9yOiBFZGl0b3JJbnB1dDsgZ3JvdXA6IElFZGl0b3JHcm91cCB9PiA9IFtdO1xuXHRcdGNvbnN0IG9yZGVyZWRHcm91cHMgPSBkaXN0aW5jdChbXG5cdFx0XHQuLi50aGlzLmVkaXRvckdyb3VwU2VydmljZS5ncm91cHMsXG5cdFx0XSk7XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIG9yZGVyZWRHcm91cHMpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKCh0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChlZGl0b3IucmVzb3VyY2UsIHJlc291cmNlKSB8fCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvciksIHJlc291cmNlKSkgJiYgZWRpdG9yLmVkaXRvcklkID09PSBlZGl0b3JJZCkge1xuXHRcdFx0XHRcdG91dC5wdXNoKHsgZWRpdG9yLCBncm91cCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3V0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0hhbmRsZUNvbmZsaWN0aW5nRGVmYXVsdHMocmVzb3VyY2U6IFVSSSwgZWRpdG9yTmFtZTogc3RyaW5nLCB1bnR5cGVkSW5wdXQ6IElVbnR5cGVkRWRpdG9ySW5wdXQsIGN1cnJlbnRFZGl0b3I6IEVkaXRvcklucHV0LCBncm91cDogSUVkaXRvckdyb3VwKSB7XG5cdFx0dHlwZSBTdG9yZWRDaG9pY2UgPSB7XG5cdFx0XHRba2V5OiBzdHJpbmddOiBzdHJpbmdbXTtcblx0XHR9O1xuXHRcdGNvbnN0IGFzc29jaWF0aW9uVHlwZSA9IGlzUmVzb3VyY2VEaWZmRWRpdG9ySW5wdXQodW50eXBlZElucHV0KSA/IEVkaXRvckFzc29jaWF0aW9uVHlwZS5EaWZmRWRpdG9yIDogaXNSZXNvdXJjZU1lcmdlRWRpdG9ySW5wdXQodW50eXBlZElucHV0KSA/IEVkaXRvckFzc29jaWF0aW9uVHlwZS5NZXJnZUVkaXRvciA6IEVkaXRvckFzc29jaWF0aW9uVHlwZS5FZGl0b3I7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IHRoaXMuZmluZE1hdGNoaW5nRWRpdG9ycyhyZXNvdXJjZSwgYXNzb2NpYXRpb25UeXBlKTtcblx0XHRjb25zdCBzdG9yZWRDaG9pY2VzOiBTdG9yZWRDaG9pY2UgPSBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEVkaXRvclJlc29sdmVyU2VydmljZS5jb25mbGljdGluZ0RlZmF1bHRzU3RvcmFnZUlELCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ3t9JykpO1xuXHRcdGNvbnN0IGdsb2JGb3JSZXNvdXJjZSA9IGAqJHtleHRuYW1lKHJlc291cmNlKX1gO1xuXHRcdC8vIFdyaXRlcyB0byB0aGUgc3RvcmFnZSBzZXJ2aWNlIHRoYXQgYSBjaG9pY2UgaGFzIGJlZW4gbWFkZSBmb3IgdGhlIGN1cnJlbnRseSBpbnN0YWxsZWQgZWRpdG9yc1xuXHRcdGNvbnN0IHdyaXRlQ3VycmVudEVkaXRvcnNUb1N0b3JhZ2UgPSAoKSA9PiB7XG5cdFx0XHRzdG9yZWRDaG9pY2VzW2dsb2JGb3JSZXNvdXJjZV0gPSBbXTtcblx0XHRcdGVkaXRvcnMuZm9yRWFjaChlZGl0b3IgPT4gc3RvcmVkQ2hvaWNlc1tnbG9iRm9yUmVzb3VyY2VdLnB1c2goZWRpdG9yLmVkaXRvckluZm8uaWQpKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmNvbmZsaWN0aW5nRGVmYXVsdHNTdG9yYWdlSUQsIEpTT04uc3RyaW5naWZ5KHN0b3JlZENob2ljZXMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9O1xuXG5cdFx0Ly8gSWYgdGhlIHVzZXIgaGFzIGFscmVhZHkgbWFkZSBhIGNob2ljZSBmb3IgdGhpcyBlZGl0b3Igd2UgZG9uJ3Qgd2FudCB0byBhc2sgdGhlbSBhZ2FpblxuXHRcdGlmIChzdG9yZWRDaG9pY2VzW2dsb2JGb3JSZXNvdXJjZV0/LmZpbmQoZWRpdG9ySUQgPT4gZWRpdG9ySUQgPT09IGN1cnJlbnRFZGl0b3IuZWRpdG9ySWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0bG9jYWxpemUoJ2VkaXRvclJlc29sdmVyLmNvbmZsaWN0aW5nRGVmYXVsdHMnLCAnVGhlcmUgYXJlIG11bHRpcGxlIGRlZmF1bHQgZWRpdG9ycyBhdmFpbGFibGUgZm9yIHRoZSByZXNvdXJjZS4nKSxcblx0XHRcdFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZWRpdG9yUmVzb2x2ZXIuY29uZmlndXJlRGVmYXVsdCcsICdDb25maWd1cmUgRGVmYXVsdCcpLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHQvLyBTaG93IHRoZSBwaWNrZXIgYW5kIHRlbGwgaXQgdG8gdXBkYXRlIHRoZSBzZXR0aW5nIHRvIHdoYXRldmVyIHRoZSB1c2VyIHNlbGVjdGVkXG5cdFx0XHRcdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgdGhpcy5kb1BpY2tFZGl0b3IodW50eXBlZElucHV0LCB0cnVlKTtcblx0XHRcdFx0XHRpZiAoIXBpY2tlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR1bnR5cGVkSW5wdXQub3B0aW9ucyA9IHBpY2tlZDtcblx0XHRcdFx0XHRjb25zdCByZXBsYWNlbWVudEVkaXRvciA9IGF3YWl0IHRoaXMucmVzb2x2ZUVkaXRvcih1bnR5cGVkSW5wdXQsIGdyb3VwKTtcblx0XHRcdFx0XHRpZiAocmVwbGFjZW1lbnRFZGl0b3IgPT09IFJlc29sdmVkU3RhdHVzLkFCT1JUIHx8IHJlcGxhY2VtZW50RWRpdG9yID09PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFJlcGxhY2UgdGhlIGN1cnJlbnQgZWRpdG9yIHdpdGggdGhlIHBpY2tlZCBvbmVcblx0XHRcdFx0XHRncm91cC5yZXBsYWNlRWRpdG9ycyhbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGVkaXRvcjogY3VycmVudEVkaXRvcixcblx0XHRcdFx0XHRcdFx0cmVwbGFjZW1lbnQ6IHJlcGxhY2VtZW50RWRpdG9yLmVkaXRvcixcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogcmVwbGFjZW1lbnRFZGl0b3Iub3B0aW9ucyA/PyBwaWNrZWQsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZWRpdG9yUmVzb2x2ZXIua2VlcERlZmF1bHQnLCAnS2VlcCB7MH0nLCBlZGl0b3JOYW1lKSxcblx0XHRcdFx0cnVuOiB3cml0ZUN1cnJlbnRFZGl0b3JzVG9TdG9yYWdlXG5cdFx0XHR9XG5cdFx0XHRdKTtcblx0XHQvLyBJZiB0aGUgdXNlciBwcmVzc2VkIFggd2UgYXNzdW1lIHRoZXkgd2FudCB0byBrZWVwIHRoZSBjdXJyZW50IGVkaXRvciBhcyBkZWZhdWx0XG5cdFx0Y29uc3Qgb25DbG9zZUxpc3RlbmVyID0gaGFuZGxlLm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0d3JpdGVDdXJyZW50RWRpdG9yc1RvU3RvcmFnZSgpO1xuXHRcdFx0b25DbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgbWFwRWRpdG9yc1RvUXVpY2tQaWNrRW50cnkocmVzb3VyY2U6IFVSSSwgc2hvd0RlZmF1bHRQaWNrZXI6IGJvb2xlYW4gfCB1bmRlZmluZWQsIGFzc29jaWF0aW9uVHlwZTogRWRpdG9yQXNzb2NpYXRpb25UeXBlKSB7XG5cdFx0Y29uc3QgY3VycmVudEVkaXRvciA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwLmZpbmRFZGl0b3JzKHJlc291cmNlKS5hdCgwKTtcblx0XHQvLyBJZiB1bnRpdGxlZCwgd2Ugd2FudCBhbGwgcmVnaXN0ZXJlZCBlZGl0b3JzXG5cdFx0bGV0IHJlZ2lzdGVyZWRFZGl0b3JzID0gcmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkID8gdGhpcy5fcmVnaXN0ZXJlZEVkaXRvcnMuZmlsdGVyKGUgPT4gZS5lZGl0b3JJbmZvLnByaW9yaXR5LmVkaXRvciAhPT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZSkgOiB0aGlzLmZpbmRNYXRjaGluZ0VkaXRvcnMocmVzb3VyY2UsIGFzc29jaWF0aW9uVHlwZSk7XG5cdFx0aWYgKGFzc29jaWF0aW9uVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IpIHtcblx0XHRcdHJlZ2lzdGVyZWRFZGl0b3JzID0gcmVnaXN0ZXJlZEVkaXRvcnMuZmlsdGVyKGVkaXRvciA9PiAhIWVkaXRvci5lZGl0b3JGYWN0b3J5T2JqZWN0LmNyZWF0ZURpZmZFZGl0b3JJbnB1dCk7XG5cdFx0fVxuXHRcdC8vIFdlIGRvbid0IHdhbnQgZHVwbGljYXRlIElkIGVudHJpZXNcblx0XHRyZWdpc3RlcmVkRWRpdG9ycyA9IGRpc3RpbmN0KHJlZ2lzdGVyZWRFZGl0b3JzLCBjID0+IGMuZWRpdG9ySW5mby5pZCk7XG5cdFx0Y29uc3QgZGVmYXVsdFNldHRpbmcgPSB0aGlzLmdldEFzc29jaWF0aW9uc0ZvclJlc291cmNlQnlUeXBlKHJlc291cmNlLCBhc3NvY2lhdGlvblR5cGUpWzBdPy52aWV3VHlwZTtcblx0XHQvLyBOb3QgdGhlIG1vc3QgZWZmaWNpZW50IHdheSB0byBkbyB0aGlzLCBidXQgd2Ugd2FudCB0byBlbnN1cmUgdGhlIHRleHQgZWRpdG9yIGlzIGF0IHRoZSB0b3Agb2YgdGhlIHF1aWNrcGlja1xuXHRcdHJlZ2lzdGVyZWRFZGl0b3JzID0gcmVnaXN0ZXJlZEVkaXRvcnMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0aWYgKGEuZWRpdG9ySW5mby5pZCA9PT0gREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQpIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fSBlbHNlIGlmIChiLmVkaXRvckluZm8uaWQgPT09IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkKSB7XG5cdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHByaW9yaXR5VG9SYW5rKHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkoYi5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpKSAtIHByaW9yaXR5VG9SYW5rKHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkoYS5lZGl0b3JJbmZvLCBhc3NvY2lhdGlvblR5cGUpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBxdWlja1BpY2tFbnRyaWVzOiBBcnJheTxRdWlja1BpY2tJdGVtPiA9IFtdO1xuXHRcdGNvbnN0IGN1cnJlbnRseUFjdGl2ZUxhYmVsID0gbG9jYWxpemUoJ3Byb21wdE9wZW5XaXRoLmN1cnJlbnRseUFjdGl2ZScsIFwiQWN0aXZlXCIpO1xuXHRcdGNvbnN0IGN1cnJlbnREZWZhdWx0TGFiZWwgPSBsb2NhbGl6ZSgncHJvbXB0T3BlbldpdGguY3VycmVudERlZmF1bHQnLCBcIkRlZmF1bHRcIik7XG5cdFx0Y29uc3QgY3VycmVudERlZmF1bHRBbmRBY3RpdmVMYWJlbCA9IGxvY2FsaXplKCdwcm9tcHRPcGVuV2l0aC5jdXJyZW50RGVmYXVsdEFuZEFjdGl2ZScsIFwiQWN0aXZlIGFuZCBEZWZhdWx0XCIpO1xuXHRcdC8vIERlZmF1bHQgb3JkZXIgPSBzZXR0aW5nIC0+IGhpZ2hlc3QgcHJpb3JpdHkgLT4gdGV4dFxuXHRcdGxldCBkZWZhdWx0Vmlld1R5cGUgPSBkZWZhdWx0U2V0dGluZztcblx0XHRpZiAoIWRlZmF1bHRWaWV3VHlwZSAmJiByZWdpc3RlcmVkRWRpdG9ycy5sZW5ndGggPiAyICYmIHRoaXMuZ2V0RWZmZWN0aXZlUHJpb3JpdHkocmVnaXN0ZXJlZEVkaXRvcnNbMV0uZWRpdG9ySW5mbywgYXNzb2NpYXRpb25UeXBlKSAhPT0gUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvbikge1xuXHRcdFx0ZGVmYXVsdFZpZXdUeXBlID0gcmVnaXN0ZXJlZEVkaXRvcnNbMV0/LmVkaXRvckluZm8uaWQ7XG5cdFx0fVxuXHRcdGlmICghZGVmYXVsdFZpZXdUeXBlKSB7XG5cdFx0XHRkZWZhdWx0Vmlld1R5cGUgPSBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZDtcblx0XHR9XG5cdFx0Ly8gTWFwIHRoZSBlZGl0b3JzIHRvIHF1aWNrcGljayBlbnRyaWVzXG5cdFx0cmVnaXN0ZXJlZEVkaXRvcnMuZm9yRWFjaChlZGl0b3IgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFZpZXdUeXBlID0gY3VycmVudEVkaXRvcj8uZWRpdG9ySWQgPz8gREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQ7XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGN1cnJlbnRFZGl0b3IgPyBlZGl0b3IuZWRpdG9ySW5mby5pZCA9PT0gY3VycmVudFZpZXdUeXBlIDogZmFsc2U7XG5cdFx0XHRjb25zdCBpc0RlZmF1bHQgPSBlZGl0b3IuZWRpdG9ySW5mby5pZCA9PT0gZGVmYXVsdFZpZXdUeXBlO1xuXHRcdFx0Y29uc3QgcXVpY2tQaWNrRW50cnk6IElRdWlja1BpY2tJdGVtID0ge1xuXHRcdFx0XHRpZDogZWRpdG9yLmVkaXRvckluZm8uaWQsXG5cdFx0XHRcdGxhYmVsOiBlZGl0b3IuZWRpdG9ySW5mby5sYWJlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGlzQWN0aXZlICYmIGlzRGVmYXVsdCA/IGN1cnJlbnREZWZhdWx0QW5kQWN0aXZlTGFiZWwgOiBpc0FjdGl2ZSA/IGN1cnJlbnRseUFjdGl2ZUxhYmVsIDogaXNEZWZhdWx0ID8gY3VycmVudERlZmF1bHRMYWJlbCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGV0YWlsOiBlZGl0b3IuZWRpdG9ySW5mby5kZXRhaWwgPz8gZWRpdG9yLmVkaXRvckluZm8ucHJpb3JpdHkuZWRpdG9yLFxuXHRcdFx0fTtcblx0XHRcdHF1aWNrUGlja0VudHJpZXMucHVzaChxdWlja1BpY2tFbnRyeSk7XG5cdFx0fSk7XG5cdFx0aWYgKCFzaG93RGVmYXVsdFBpY2tlciAmJiBleHRuYW1lKHJlc291cmNlKSAhPT0gJycpIHtcblx0XHRcdGNvbnN0IHNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciA9IHsgdHlwZTogJ3NlcGFyYXRvcicgfTtcblx0XHRcdHF1aWNrUGlja0VudHJpZXMucHVzaChzZXBhcmF0b3IpO1xuXHRcdFx0Y29uc3QgY29uZmlndXJlRGVmYXVsdEVudHJ5ID0ge1xuXHRcdFx0XHRpZDogRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmNvbmZpZ3VyZURlZmF1bHRJRCxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm9tcHRPcGVuV2l0aC5jb25maWd1cmVEZWZhdWx0JywgXCJDb25maWd1cmUgZGVmYXVsdCBlZGl0b3IgZm9yICd7MH0nLi4uXCIsIGAqJHtleHRuYW1lKHJlc291cmNlKX1gKSxcblx0XHRcdH07XG5cdFx0XHRxdWlja1BpY2tFbnRyaWVzLnB1c2goY29uZmlndXJlRGVmYXVsdEVudHJ5KTtcblx0XHRcdC8vIEZvciBkaWZmcywgYWRkaXRpb25hbGx5IG9mZmVyIHRvIGNvbmZpZ3VyZSBhIGRpZmYtb25seSBkZWZhdWx0IHNvIHRoZSBjaG9pY2UgZG9lcyBub3Rcblx0XHRcdC8vIGFmZmVjdCBob3cgdGhlIHJlc291cmNlIG9wZW5zIGFzIGEgbm9ybWFsIGVkaXRvciAod3JpdGVzIHRvIGBkaWZmRWRpdG9yQXNzb2NpYXRpb25zYCkuXG5cdFx0XHRpZiAoYXNzb2NpYXRpb25UeXBlID09PSBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRGlmZkVkaXRvcikge1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVEZWZhdWx0RGlmZkVudHJ5ID0ge1xuXHRcdFx0XHRcdGlkOiBFZGl0b3JSZXNvbHZlclNlcnZpY2UuY29uZmlndXJlRGVmYXVsdERpZmZJRCxcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Byb21wdE9wZW5XaXRoLmNvbmZpZ3VyZURlZmF1bHREaWZmJywgXCJDb25maWd1cmUgZGVmYXVsdCBlZGl0b3IgKGRpZmYgb25seSkgZm9yICd7MH0nLi4uXCIsIGAqJHtleHRuYW1lKHJlc291cmNlKX1gKSxcblx0XHRcdFx0fTtcblx0XHRcdFx0cXVpY2tQaWNrRW50cmllcy5wdXNoKGNvbmZpZ3VyZURlZmF1bHREaWZmRW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcXVpY2tQaWNrRW50cmllcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9QaWNrRWRpdG9yKGVkaXRvcjogSVVudHlwZWRFZGl0b3JJbnB1dCwgc2hvd0RlZmF1bHRQaWNrZXI/OiBib29sZWFuLCB1cGRhdGVBc3NvY2lhdGlvblR5cGU/OiBFZGl0b3JBc3NvY2lhdGlvblR5cGUpOiBQcm9taXNlPElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkPiB7XG5cblx0XHR0eXBlIEVkaXRvclBpY2sgPSB7XG5cdFx0XHRyZWFkb25seSBpdGVtOiBJUXVpY2tQaWNrSXRlbTtcblx0XHRcdHJlYWRvbmx5IGtleU1vZHM/OiBJS2V5TW9kcztcblx0XHRcdHJlYWRvbmx5IG9wZW5JbkJhY2tncm91bmQ6IGJvb2xlYW47XG5cdFx0fTtcblxuXHRcdGxldCByZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cblx0XHRpZiAocmVzb3VyY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCB9KTtcblx0XHR9XG5cdFx0Y29uc3QgYXNzb2NpYXRpb25UeXBlID0gaXNSZXNvdXJjZURpZmZFZGl0b3JJbnB1dChlZGl0b3IpID8gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IgOiBFZGl0b3JBc3NvY2lhdGlvblR5cGUuRWRpdG9yO1xuXHRcdC8vIFdoaWNoIHNldHRpbmcgdGhlIGRlZmF1bHQgcGlja2VyIHNob3VsZCB3cml0ZSB0by4gRGVmYXVsdHMgdG8gdGhlIHJlc291cmNlJ3MgYXNzb2NpYXRpb24gdHlwZVxuXHRcdC8vIHNvIHRoYXQgdGhlIHBlci1pdGVtIGdlYXIgYnV0dG9uIGtlZXBzIHdyaXRpbmcgdG8gdGhlIG1hdGNoaW5nIHNldHRpbmcsIGJ1dCB0aGUgXCJDb25maWd1cmVcblx0XHQvLyBkZWZhdWx0IGVkaXRvclwiIGVudHJpZXMgY2FuIHRhcmdldCBhIHNwZWNpZmljIHNldHRpbmcgKGdlbmVyYWwgdnMuIGRpZmYtb25seSkuXG5cdFx0Y29uc3QgdXBkYXRlU2V0dGluZ1R5cGUgPSB1cGRhdGVBc3NvY2lhdGlvblR5cGUgPz8gYXNzb2NpYXRpb25UeXBlO1xuXG5cdFx0Ly8gUGVyc2lzdHMgdGhlIHBpY2tlZCBlZGl0b3IgYXMgdGhlIGRlZmF1bHQgZm9yIHRoaXMgcmVzb3VyY2UncyBnbG9iLiBXaGVuIHRoZSB1c2VyIGNvbmZpZ3VyZXNcblx0XHQvLyB0aGUgZ2VuZXJhbCBkZWZhdWx0IGZyb20gYSBkaWZmIGNvbnRleHQsIGFueSBkaWZmLW9ubHkgb3ZlcnJpZGUgZm9yIHRoZSBzYW1lIGdsb2IgaXMgY2xlYXJlZFxuXHRcdC8vIHNvIHRoYXQgdGhlIGdlbmVyYWwgZGVmYXVsdCBhbHNvIHRha2VzIGVmZmVjdCBmb3IgZGlmZnMuXG5cdFx0Y29uc3QgcGVyc2lzdERlZmF1bHRBc3NvY2lhdGlvbiA9IChlZGl0b3JJRDogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBnbG9iUGF0dGVybiA9IGAqJHtleHRuYW1lKHJlc291cmNlKX1gO1xuXHRcdFx0dGhpcy51cGRhdGVVc2VyQXNzb2NpYXRpb25zRm9yVHlwZSh1cGRhdGVTZXR0aW5nVHlwZSwgZ2xvYlBhdHRlcm4sIGVkaXRvcklEKTtcblx0XHRcdGlmICh1cGRhdGVTZXR0aW5nVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkVkaXRvciAmJiBhc3NvY2lhdGlvblR5cGUgPT09IEVkaXRvckFzc29jaWF0aW9uVHlwZS5EaWZmRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlVXNlckFzc29jaWF0aW9uRm9yU2V0dGluZyhkaWZmRWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCwgZ2xvYlBhdHRlcm4pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBHZXQgYWxsIHRoZSBlZGl0b3JzIGZvciB0aGUgcmVzb3VyY2UgYXMgcXVpY2twaWNrIGVudHJpZXNcblx0XHRjb25zdCBlZGl0b3JQaWNrcyA9IHRoaXMubWFwRWRpdG9yc1RvUXVpY2tQaWNrRW50cnkocmVzb3VyY2UsIHNob3dEZWZhdWx0UGlja2VyLCBhc3NvY2lhdGlvblR5cGUpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSBlZGl0b3IgcGlja2VyXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWRpdG9yUGlja2VyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtPih7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSkpO1xuXHRcdGNvbnN0IHBsYWNlSG9sZGVyTWVzc2FnZSA9IHNob3dEZWZhdWx0UGlja2VyID9cblx0XHRcdCh1cGRhdGVTZXR0aW5nVHlwZSA9PT0gRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IgP1xuXHRcdFx0XHRsb2NhbGl6ZSgncHJvbXB0T3BlbldpdGgudXBkYXRlRGVmYXVsdERpZmZQbGFjZUhvbGRlcicsIFwiU2VsZWN0IG5ldyBkZWZhdWx0IGVkaXRvciAoZGlmZiBvbmx5KSBmb3IgJ3swfSdcIiwgYCoke2V4dG5hbWUocmVzb3VyY2UpfWApIDpcblx0XHRcdFx0bG9jYWxpemUoJ3Byb21wdE9wZW5XaXRoLnVwZGF0ZURlZmF1bHRQbGFjZUhvbGRlcicsIFwiU2VsZWN0IG5ldyBkZWZhdWx0IGVkaXRvciBmb3IgJ3swfSdcIiwgYCoke2V4dG5hbWUocmVzb3VyY2UpfWApKSA6XG5cdFx0XHRsb2NhbGl6ZSgncHJvbXB0T3BlbldpdGgucGxhY2VIb2xkZXInLCBcIlNlbGVjdCBlZGl0b3IgZm9yICd7MH0nXCIsIGJhc2VuYW1lKHJlc291cmNlKSk7XG5cdFx0ZWRpdG9yUGlja2VyLnBsYWNlaG9sZGVyID0gcGxhY2VIb2xkZXJNZXNzYWdlO1xuXHRcdGVkaXRvclBpY2tlci5jYW5BY2NlcHRJbkJhY2tncm91bmQgPSB0cnVlO1xuXHRcdGVkaXRvclBpY2tlci5pdGVtcyA9IGVkaXRvclBpY2tzO1xuXHRcdGNvbnN0IGZpcnN0SXRlbSA9IGVkaXRvclBpY2tlci5pdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS50eXBlID09PSAnaXRlbScpIGFzIElRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChmaXJzdEl0ZW0pIHtcblx0XHRcdGVkaXRvclBpY2tlci5zZWxlY3RlZEl0ZW1zID0gW2ZpcnN0SXRlbV07XG5cdFx0fVxuXG5cdFx0Ly8gUHJvbXB0IHRoZSB1c2VyIHRvIHNlbGVjdCBhbiBlZGl0b3Jcblx0XHRjb25zdCBwaWNrZWQ6IEVkaXRvclBpY2sgfCB1bmRlZmluZWQgPSBhd2FpdCBuZXcgUHJvbWlzZTxFZGl0b3JQaWNrIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQaWNrZXIub25EaWRBY2NlcHQoZSA9PiB7XG5cdFx0XHRcdGxldCByZXN1bHQ6IEVkaXRvclBpY2sgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdFx0aWYgKGVkaXRvclBpY2tlci5zZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IHtcblx0XHRcdFx0XHRcdGl0ZW06IGVkaXRvclBpY2tlci5zZWxlY3RlZEl0ZW1zWzBdLFxuXHRcdFx0XHRcdFx0a2V5TW9kczogZWRpdG9yUGlja2VyLmtleU1vZHMsXG5cdFx0XHRcdFx0XHRvcGVuSW5CYWNrZ3JvdW5kOiBlLmluQmFja2dyb3VuZFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJZiBhc2tlZCB0byBhbHdheXMgdXBkYXRlIHRoZSBzZXR0aW5nIHRoZW4gdXBkYXRlIGl0IGV2ZW4gaWYgdGhlIGdlYXIgaXNuJ3QgY2xpY2tlZFxuXHRcdFx0XHRpZiAocmVzb3VyY2UgJiYgc2hvd0RlZmF1bHRQaWNrZXIgJiYgcmVzdWx0Py5pdGVtLmlkKSB7XG5cdFx0XHRcdFx0cGVyc2lzdERlZmF1bHRBc3NvY2lhdGlvbihyZXN1bHQuaXRlbS5pZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQaWNrZXIub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQaWNrZXIub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihlID0+IHtcblxuXHRcdFx0XHQvLyBUcmlnZ2VyIG9wZW5pbmcgYW5kIGNsb3NlIHBpY2tlclxuXHRcdFx0XHRyZXNvbHZlKHsgaXRlbTogZS5pdGVtLCBvcGVuSW5CYWNrZ3JvdW5kOiBmYWxzZSB9KTtcblxuXHRcdFx0XHQvLyBQZXJzaXN0IHNldHRpbmdcblx0XHRcdFx0aWYgKHJlc291cmNlICYmIGUuaXRlbT8uaWQpIHtcblx0XHRcdFx0XHRwZXJzaXN0RGVmYXVsdEFzc29jaWF0aW9uKGUuaXRlbS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZWRpdG9yUGlja2VyLnNob3coKTtcblx0XHR9KTtcblxuXHRcdC8vIENsb3NlIHBpY2tlclxuXHRcdGVkaXRvclBpY2tlci5kaXNwb3NlKCk7XG5cblx0XHQvLyBJZiB0aGUgdXNlciBwaWNrZWQgYW4gZWRpdG9yLCBsb29rIGF0IGhvdyB0aGUgcGlja2VyIHdhc1xuXHRcdC8vIHVzZWQgKGUuZy4gbW9kaWZpZXIga2V5cywgb3BlbiBpbiBiYWNrZ3JvdW5kKSBhbmQgY3JlYXRlIHRoZVxuXHRcdC8vIG9wdGlvbnMgYW5kIGdyb3VwIHRvIHVzZSBhY2NvcmRpbmdseVxuXHRcdGlmIChwaWNrZWQpIHtcblxuXHRcdFx0Ly8gSWYgdGhlIHVzZXIgc2VsZWN0ZWQgdG8gY29uZmlndXJlIGRlZmF1bHQgd2UgdHJpZ2dlciB0aGlzIHBpY2tlciBhZ2FpbiBhbmQgdGVsbCBpdCB0byBzaG93IHRoZSBkZWZhdWx0IHBpY2tlclxuXHRcdFx0aWYgKHBpY2tlZC5pdGVtLmlkID09PSBFZGl0b3JSZXNvbHZlclNlcnZpY2UuY29uZmlndXJlRGVmYXVsdElEKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmRvUGlja0VkaXRvcihlZGl0b3IsIHRydWUsIEVkaXRvckFzc29jaWF0aW9uVHlwZS5FZGl0b3IpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIGRpZmYtb25seSB2YXJpYW50IHdyaXRlcyB0byBgZGlmZkVkaXRvckFzc29jaWF0aW9uc2Agc28gaXQgZG9lcyBub3QgY2hhbmdlIGhvdyB0aGVcblx0XHRcdC8vIHJlc291cmNlIG9wZW5zIGFzIGEgbm9ybWFsIGVkaXRvci5cblx0XHRcdGlmIChwaWNrZWQuaXRlbS5pZCA9PT0gRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmNvbmZpZ3VyZURlZmF1bHREaWZmSUQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZG9QaWNrRWRpdG9yKGVkaXRvciwgdHJ1ZSwgRWRpdG9yQXNzb2NpYXRpb25UeXBlLkRpZmZFZGl0b3IpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaWd1cmUgb3V0IG9wdGlvbnNcblx0XHRcdGNvbnN0IHRhcmdldE9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHQuLi5lZGl0b3Iub3B0aW9ucyxcblx0XHRcdFx0b3ZlcnJpZGU6IHBpY2tlZC5pdGVtLmlkLFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBwaWNrZWQub3BlbkluQmFja2dyb3VuZCB8fCBlZGl0b3Iub3B0aW9ucz8ucHJlc2VydmVGb2N1cyxcblx0XHRcdH07XG5cblx0XHRcdHJldHVybiB0YXJnZXRPcHRpb25zO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNhY2hlRWRpdG9ycygpIHtcblx0XHQvLyBDcmVhdGUgYSBzZXQgdG8gc3RvcmUgZ2xvYiBwYXR0ZXJuc1xuXHRcdGNvbnN0IGNhY2hlU3RvcmFnZTogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdC8vIFN0b3JlIGp1c3QgdGhlIHJlbGF0aXZlIHBhdHRlcm4gcGllY2VzIHdpdGhvdXQgYW55IHBhdGggaW5mb1xuXHRcdGZvciAoY29uc3QgW2dsb2JQYXR0ZXJuLCBjb250cmliUG9pbnRdIG9mIHRoaXMuX2ZsYXR0ZW5lZEVkaXRvcnMpIHtcblx0XHRcdGNvbnN0IG5vbk9wdGlvbmFsID0gISFjb250cmliUG9pbnQuZmluZChjID0+IGMuZWRpdG9ySW5mby5wcmlvcml0eS5lZGl0b3IgIT09IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb24gJiYgYy5lZGl0b3JJbmZvLmlkICE9PSBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCk7XG5cdFx0XHQvLyBEb24ndCBrZWVwIGEgY2FjaGUgb2YgdGhlIG9wdGlvbmFsIG9uZXMgYXMgdGhvc2Ugd291bGRuJ3QgYmUgb3BlbmVkIG9uIHN0YXJ0IGFueXdheXNcblx0XHRcdGlmICghbm9uT3B0aW9uYWwpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZ2xvYi5pc1JlbGF0aXZlUGF0dGVybihnbG9iUGF0dGVybikpIHtcblx0XHRcdFx0Y2FjaGVTdG9yYWdlLmFkZChgJHtnbG9iUGF0dGVybi5wYXR0ZXJufWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2FjaGVTdG9yYWdlLmFkZChnbG9iUGF0dGVybik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWxzbyBzdG9yZSB0aGUgdXNlcnMgc2V0dGluZ3MgYXMgdGhvc2Ugd291bGQgaGF2ZSB0byBhY3RpdmF0ZSBvbiBzdGFydHVwIGFzIHdlbGxcblx0XHRjb25zdCB1c2VyQXNzb2NpYXRpb25zID0gW1xuXHRcdFx0Li4udGhpcy5nZXRBbGxVc2VyQXNzb2NpYXRpb25zKCksXG5cdFx0XHQuLi50aGlzLmdldEFsbFVzZXJBc3NvY2lhdGlvbnNGb3JTZXR0aW5nKGRpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkKVxuXHRcdF07XG5cdFx0Zm9yIChjb25zdCBhc3NvY2lhdGlvbiBvZiB1c2VyQXNzb2NpYXRpb25zKSB7XG5cdFx0XHRpZiAoYXNzb2NpYXRpb24uZmlsZW5hbWVQYXR0ZXJuKSB7XG5cdFx0XHRcdGNhY2hlU3RvcmFnZS5hZGQoYXNzb2NpYXRpb24uZmlsZW5hbWVQYXR0ZXJuKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShFZGl0b3JSZXNvbHZlclNlcnZpY2UuY2FjaGVTdG9yYWdlSUQsIEpTT04uc3RyaW5naWZ5KEFycmF5LmZyb20oY2FjaGVTdG9yYWdlKSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiBhIHJlc291cmNlIG1hdGNoZXMgYW55IHVzZXItY29uZmlndXJlZCBlZGl0b3IgYXNzb2NpYXRpb24gdGhhdFxuXHQgKiBwb2ludHMgdG8gYSBub24tZGVmYXVsdCBlZGl0b3IuIFRoaXMgZW5zdXJlcyB0aGF0IG9uIGZpcnN0IHN0YXJ0dXAgKHdoZW5cblx0ICogdGhlIGNhY2hlIGlzIGVtcHR5KSwgd2Ugc3RpbGwgd2FpdCBmb3IgZXh0ZW5zaW9ucyB0byByZWdpc3RlciBiZWZvcmVcblx0ICogcmVzb2x2aW5nIHRoZSBlZGl0b3IsIHNvIHRoYXQgdXNlci1jb25maWd1cmVkIGN1c3RvbSBlZGl0b3JzIGFyZSBhdmFpbGFibGUuXG5cdCAqL1xuXHRwcml2YXRlIHJlc291cmNlTWF0Y2hlc1VzZXJBc3NvY2lhdGlvbihyZXNvdXJjZTogVVJJLCBhc3NvY2lhdGlvblR5cGU6IEVkaXRvckFzc29jaWF0aW9uVHlwZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHVzZXJBc3NvY2lhdGlvbnMgPSB0aGlzLmdldFJhd0Fzc29jaWF0aW9uc0ZvclJlc291cmNlQnlUeXBlKHJlc291cmNlLCBhc3NvY2lhdGlvblR5cGUpO1xuXHRcdGZvciAoY29uc3QgYXNzb2NpYXRpb24gb2YgdXNlckFzc29jaWF0aW9ucykge1xuXHRcdFx0aWYgKGFzc29jaWF0aW9uLnZpZXdUeXBlICE9PSBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvdXJjZU1hdGNoZXNDYWNoZShyZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmNhY2hlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjYWNoZUVudHJ5IG9mIHRoaXMuY2FjaGUpIHtcblx0XHRcdGlmIChnbG9iTWF0Y2hlc1Jlc291cmNlKGNhY2hlRW50cnksIHJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIEVkaXRvclJlc29sdmVyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsY0FBYztBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQix3QkFBd0M7QUFDbkUsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFtQiwwQkFBOEU7QUFDakcsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBb0Qsd0JBQXdELDBCQUEwQixrQ0FBa0MsMkJBQTJCLDRCQUE0QixnQ0FBZ0MsaUNBQWlDLCtCQUFvRCx3QkFBd0I7QUFFclgsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBdUIsNEJBQTRCO0FBQ25ELFNBQVMsa0NBQW1HLDhCQUE4QixxQkFBcUIsd0JBQTZHLGdCQUErRCwwQkFBNEUsZ0JBQWdCLHNDQUFzQztBQVk3YyxTQUFTLDhCQUE4QixZQUFvRTtBQUMxRyxTQUFPO0FBQUEsSUFDTixJQUFJLFdBQVc7QUFBQSxJQUNmLE9BQU8sV0FBVztBQUFBLElBQ2xCLFFBQVEsV0FBVztBQUFBLElBQ25CLFVBQVUsK0JBQStCLFdBQVcsUUFBUTtBQUFBLEVBQzdEO0FBQ0Q7QUFFQSxJQUFXLHdCQUFYLGtCQUFXQSwyQkFBWDtBQUNDLEVBQUFBLDhDQUFBO0FBQ0EsRUFBQUEsOENBQUE7QUFDQSxFQUFBQSw4Q0FBQTtBQUhVLFNBQUFBO0FBQUEsR0FBQTtBQU1KLElBQU0sd0JBQU4sY0FBb0MsV0FBNkM7QUFBQSxFQW1CdkYsWUFDd0Msb0JBQ0Msc0JBQ0Esc0JBQ0gsbUJBQ0UscUJBQ0wsZ0JBQ0Usa0JBQ04sWUFDUSxvQkFDckM7QUFDRCxVQUFNO0FBVmlDO0FBQ0M7QUFDQTtBQUNIO0FBQ0U7QUFDTDtBQUNFO0FBQ047QUFDUTtBQXhCdkM7QUFBQSxTQUFpQixrQ0FBa0MsS0FBSyxVQUFVLElBQUksaUJBQXVCLENBQUM7QUFDOUYsU0FBUyxpQ0FBaUMsS0FBSyxnQ0FBZ0M7QUFTL0U7QUFBQSxTQUFRLFdBQWdGLG9CQUFJLElBQW9FO0FBQ2hLLFNBQVEsb0JBQTRFLG9CQUFJLElBQUk7QUFDNUYsU0FBUSwwQkFBMEI7QUFnQmpDLFNBQUssUUFBUSxJQUFJLElBQVksS0FBSyxNQUFNLEtBQUssZUFBZSxJQUFJLHNCQUFzQixnQkFBZ0IsYUFBYSxTQUFTLEtBQUssVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDaEosU0FBSyxlQUFlLE9BQU8sc0JBQXNCLGdCQUFnQixhQUFhLE9BQU87QUFFckYsU0FBSyxVQUFVLEtBQUssZUFBZSxnQkFBZ0IsTUFBTTtBQUV4RCxXQUFLLGFBQWE7QUFBQSxJQUNuQixDQUFDLENBQUM7QUFHRixTQUFLLFVBQVUsS0FBSyxpQkFBaUIsd0JBQXdCLE1BQU07QUFDbEUsV0FBSyxRQUFRO0FBQUEsSUFDZCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSw0QkFBNEIsUUFBNkIsZ0JBQW9OO0FBQ3BSLFVBQU0sZ0JBQWdCO0FBR3RCLFVBQU0sa0JBQWtCLEtBQUsscUJBQXFCLGVBQWUsV0FBVyxlQUFlLGNBQWM7QUFDekcsUUFBSSwyQkFBMkIsU0FBUztBQUN2QyxhQUFPLGdCQUFnQixLQUFLLENBQUMsQ0FBQyxPQUFPLFVBQVUsTUFBTSxDQUFDLGVBQWUsT0FBTyxVQUFVLENBQUM7QUFBQSxJQUN4RixPQUFPO0FBQ04sWUFBTSxDQUFDLE9BQU8sVUFBVSxJQUFJO0FBQzVCLGFBQU8sQ0FBQyxlQUFlLE9BQU8sVUFBVTtBQUFBLElBQ3pDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxjQUFjLFFBQTZCLGdCQUFxRTtBQUVySCxTQUFLLG9CQUFvQixLQUFLLG1CQUFtQjtBQUtqRCxRQUFJLGdDQUFnQyxNQUFNLEdBQUc7QUFDNUMsYUFBTyxLQUFLLDBCQUEwQixRQUFRLGNBQWM7QUFBQSxJQUM3RDtBQUVBLFFBQUk7QUFDSixVQUFNLGdDQUFnQyxLQUFLLDRCQUE0QixRQUFRLGNBQWM7QUFDN0YsUUFBSSx5Q0FBeUMsU0FBUztBQUNyRCxnQ0FBMEIsTUFBTTtBQUFBLElBQ2pDLE9BQU87QUFDTixnQ0FBMEI7QUFBQSxJQUMzQjtBQUVBLFFBQUksQ0FBQyx5QkFBeUI7QUFDN0IsYUFBTyxlQUFlO0FBQUEsSUFDdkI7QUFFQSxVQUFNLENBQUMsZUFBZSxPQUFPLFVBQVUsSUFBSTtBQUMzQyxRQUFJLFlBQVk7QUFDZixvQkFBYyxVQUFVLEVBQUUsR0FBRyxjQUFjLFNBQVMsV0FBVztBQUFBLElBQ2hFO0FBRUEsUUFBSSxXQUFXLHVCQUF1QixnQkFBZ0IsZUFBZSxFQUFFLG1CQUFtQixpQkFBaUIsUUFBUSxDQUFDO0FBR3BILFVBQU0sd0JBQXdCLDBCQUEwQixhQUFhLElBQUkscUJBQW1DLDJCQUEyQixhQUFhLElBQUksc0JBQW9DO0FBQzVMLFFBQUksS0FBSyxTQUFTLGFBQWEsS0FBSyxxQkFBcUIsUUFBUSxLQUFLLEtBQUssK0JBQStCLFVBQVUscUJBQXFCLElBQUk7QUFDNUksWUFBTSxLQUFLLGlCQUFpQixrQ0FBa0M7QUFBQSxJQUMvRDtBQUdBLFFBQUksYUFBYSxRQUFXO0FBQzNCLGlCQUFXLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxTQUFTLENBQUM7QUFBQSxJQUNqRCxXQUFXLFNBQVMsV0FBVyxVQUFhLGFBQWEsTUFBTTtBQUM5RCxhQUFPLGVBQWU7QUFBQSxJQUN2QjtBQUVBLFFBQUksY0FBYyxTQUFTLGFBQWEsaUJBQWlCLE1BQU07QUFDOUQsWUFBTSxTQUFTLE1BQU0sS0FBSyxhQUFhLGFBQWE7QUFFcEQsVUFBSSxDQUFDLFFBQVE7QUFDWixlQUFPLGVBQWU7QUFBQSxNQUN2QjtBQUVBLG9CQUFjLFVBQVU7QUFBQSxJQUN6QjtBQUdBLFFBQUksRUFBRSxRQUFRLGdCQUFnQixtQkFBbUIsSUFBSSxLQUFLLFVBQVUsVUFBVSxjQUFjLFNBQVMsVUFBb0UscUJBQXFCO0FBRTlMLFFBQUksQ0FBQyxtQkFBbUIsY0FBYyxTQUFTLFlBQVkseUJBQXlCLE1BQU0sSUFBSTtBQUM3RixhQUFPLGVBQWU7QUFBQSxJQUN2QixXQUFXLENBQUMsZ0JBQWdCO0FBRTNCLFlBQU0saUJBQWlCLEtBQUssVUFBVSxVQUFVLDJCQUEyQixJQUFJLHFCQUFxQjtBQUNwRyx1QkFBaUIsZ0JBQWdCO0FBQ2pDLDJCQUFxQixnQkFBZ0I7QUFDckMsVUFBSSxDQUFDLGdCQUFnQjtBQUNwQixlQUFPLGVBQWU7QUFBQSxNQUN2QjtBQUFBLElBQ0Q7QUFHQSxRQUFJLDBCQUEwQixhQUFhLEtBQUssY0FBYyxTQUFTLGFBQWEsUUFBVztBQUM5RixVQUFJLFlBQVksdUJBQXVCLGdCQUFnQixlQUFlLEVBQUUsbUJBQW1CLGlCQUFpQixVQUFVLENBQUM7QUFDdkgsVUFBSSxDQUFDLFdBQVc7QUFDZixvQkFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsU0FBUyxDQUFDO0FBQUEsTUFDbEQ7QUFDQSxZQUFNLEVBQUUsUUFBUSxnQkFBZ0IsSUFBSSxLQUFLLFVBQVUsV0FBVyxRQUFXLHFCQUFxQjtBQUM5RixVQUFJLENBQUMsbUJBQW1CLGVBQWUsV0FBVyxPQUFPLGdCQUFnQixXQUFXLElBQUk7QUFDdkYsY0FBTSxFQUFFLFFBQVEsY0FBYyxvQkFBb0IsdUJBQXVCLElBQUksS0FBSyxVQUFVLFVBQVUsMkJBQTJCLElBQUkscUJBQXFCO0FBQzFKLHlCQUFpQjtBQUNqQiw2QkFBcUI7QUFBQSxNQUN0QjtBQUNBLFVBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsZUFBTyxlQUFlO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBR0Esa0JBQWMsVUFBVSxFQUFFLFVBQVUsZUFBZSxXQUFXLElBQUksR0FBRyxjQUFjLFFBQVE7QUFHM0YsUUFBSSxlQUFlLG9CQUFvQiwwQkFBMEIsVUFBYSwwQkFBMEIsYUFBYSxHQUFHO0FBQ3ZILGFBQU8sZUFBZTtBQUFBLElBQ3ZCO0FBRUEsVUFBTSxRQUFRLE1BQU0sS0FBSyxnQkFBZ0IsZUFBZSxPQUFPLGNBQWM7QUFDN0UsUUFBSSxzQkFBc0IsT0FBTztBQUVoQyxZQUFNLEtBQUssNEJBQTRCLFVBQVUsZUFBZSxXQUFXLE9BQU8sZUFBZSxNQUFNLFFBQVEsS0FBSztBQUFBLElBQ3JIO0FBRUEsUUFBSSxPQUFPO0FBQ1YsVUFBSSxNQUFNLE9BQU8sYUFBYSxlQUFlLFdBQVcsSUFBSTtBQUMzRCxhQUFLLFdBQVcsS0FBSyx1QkFBdUIsTUFBTSxPQUFPLFFBQVEsUUFBUSxlQUFlLFdBQVcsRUFBRSxzRkFBc0Y7QUFBQSxNQUM1TDtBQUNBLGFBQU8sRUFBRSxHQUFHLE9BQU8sTUFBTTtBQUFBLElBQzFCO0FBQ0EsV0FBTyxlQUFlO0FBQUEsRUFDdkI7QUFBQSxFQUVBLE1BQWMsMEJBQTBCLFFBQXdDLGdCQUFxRTtBQUNwSixVQUFNLHdCQUF3QixNQUFNLEtBQUssY0FBYyxPQUFPLFNBQVMsY0FBYztBQUNyRixRQUFJLENBQUMsaUNBQWlDLHFCQUFxQixHQUFHO0FBQzdELGFBQU8sZUFBZTtBQUFBLElBQ3ZCO0FBQ0EsVUFBTSwwQkFBMEIsTUFBTSxLQUFLLGNBQWMsT0FBTyxXQUFXLHNCQUFzQixTQUFTLGNBQWM7QUFDeEgsUUFBSSxDQUFDLGlDQUFpQyx1QkFBdUIsR0FBRztBQUMvRCxhQUFPLGVBQWU7QUFBQSxJQUN2QjtBQUNBLFdBQU87QUFBQSxNQUNOLE9BQU8sc0JBQXNCLFNBQVMsd0JBQXdCO0FBQUEsTUFDOUQsUUFBUSxLQUFLLHFCQUFxQixlQUFlLHVCQUF1QixPQUFPLE9BQU8sT0FBTyxhQUFhLHdCQUF3QixRQUFRLHNCQUFzQixNQUFNO0FBQUEsTUFDdEssU0FBUyxPQUFPO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFQSxtQkFBbUIsVUFBMEI7QUFDNUMsU0FBSyxnQ0FBZ0MsTUFBTTtBQUMzQyxRQUFJO0FBQ0gsZUFBUztBQUFBLElBQ1YsVUFBRTtBQUNELFdBQUssZ0NBQWdDLE9BQU87QUFBQSxJQUM3QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLGVBQ0MsYUFDQSxZQUNBLFNBQ0EscUJBQ2M7QUFDZCxVQUFNLHVCQUF1Qiw4QkFBOEIsVUFBVTtBQUNyRSxRQUFJLG1CQUFtQixLQUFLLFNBQVMsSUFBSSxXQUFXO0FBQ3BELFFBQUkscUJBQXFCLFFBQVc7QUFDbkMseUJBQW1CLG9CQUFJLElBQStCO0FBQ3RELFdBQUssU0FBUyxJQUFJLGFBQWEsZ0JBQWdCO0FBQUEsSUFDaEQ7QUFFQSxRQUFJLGdCQUFnQixpQkFBaUIsSUFBSSxxQkFBcUIsRUFBRTtBQUNoRSxRQUFJLGtCQUFrQixRQUFXO0FBQ2hDLHNCQUFnQixDQUFDO0FBQUEsSUFDbEI7QUFDQSxVQUFNLFNBQVMsT0FBTyxlQUFlO0FBQUEsTUFDcEM7QUFBQSxNQUNBLFlBQVk7QUFBQSxNQUNaO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUNELHFCQUFpQixJQUFJLHFCQUFxQixJQUFJLGFBQWE7QUFDM0QsU0FBSywwQkFBMEI7QUFDL0IsU0FBSyxnQ0FBZ0MsS0FBSztBQUMxQyxXQUFPLGFBQWEsTUFBTTtBQUN6QixhQUFPO0FBQ1AsVUFBSSxpQkFBaUIsY0FBYyxXQUFXLEdBQUc7QUFDaEQsMEJBQWtCLE9BQU8sV0FBVyxFQUFFO0FBQUEsTUFDdkM7QUFDQSxXQUFLLDBCQUEwQjtBQUMvQixXQUFLLGdDQUFnQyxLQUFLO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLDJCQUEyQixVQUFtQztBQUM3RCxXQUFPLEtBQUssc0NBQXNDLFVBQVUsNEJBQTRCO0FBQUEsRUFDekY7QUFBQSxFQUVBLDJCQUEyQixVQUFlLGVBQTZDO0FBQ3RGLFVBQU0sWUFBWSxnQkFBZ0IsbUNBQW1DO0FBQ3JFLFdBQU8sS0FBSyxzQ0FBc0MsVUFBVSxTQUFTLEVBQUUsQ0FBQyxHQUFHO0FBQUEsRUFDNUU7QUFBQSxFQUVRLGlDQUFpQyxVQUFlLGlCQUE0RDtBQUNuSCxRQUFJLG9CQUFvQixnQkFBOEI7QUFDckQsYUFBTyxLQUFLLDJCQUEyQixRQUFRO0FBQUEsSUFDaEQ7QUFFQSxVQUFNLG1CQUFtQixLQUFLLHNDQUFzQyxVQUFVLGdDQUFnQztBQUM5RyxRQUFJLGlCQUFpQixRQUFRO0FBQzVCLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxLQUFLLDJCQUEyQixRQUFRLEVBQzdDLE9BQU8saUJBQWUsQ0FBQyxLQUFLLDZCQUE2QixZQUFZLFVBQVUsZUFBZSxDQUFDO0FBQUEsRUFDbEc7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsNkJBQTZCLFVBQWtCLGlCQUFpRDtBQUN2RyxVQUFNLFNBQVMsS0FBSyxtQkFBbUIsT0FBTyxDQUFBQyxZQUFVQSxRQUFPLFdBQVcsT0FBTyxRQUFRLEVBQUUsR0FBRyxDQUFDO0FBQy9GLFdBQU8sQ0FBQyxDQUFDLFVBQVUsS0FBSyxxQkFBcUIsT0FBTyxZQUFZLGVBQWUsTUFBTSx5QkFBeUI7QUFBQSxFQUMvRztBQUFBLEVBRVEsc0NBQXNDLFVBQWUsV0FBdUM7QUFDbkcsVUFBTSx1QkFBdUIsS0FBSyx5Q0FBeUMsVUFBVSxTQUFTO0FBQzlGLFVBQU0sYUFBZ0MsS0FBSztBQUUzQyxXQUFPLHFCQUFxQixPQUFPLGlCQUFlLFdBQVcsS0FBSyxPQUFLLEVBQUUsV0FBVyxPQUFPLFlBQVksUUFBUSxDQUFDO0FBQUEsRUFDakg7QUFBQSxFQUVRLG9DQUFvQyxVQUFlLGlCQUE0RDtBQUN0SCxRQUFJLG9CQUFvQixnQkFBOEI7QUFDckQsYUFBTyxLQUFLLHlDQUF5QyxVQUFVLDRCQUE0QjtBQUFBLElBQzVGO0FBRUEsVUFBTSxtQkFBbUIsS0FBSyx5Q0FBeUMsVUFBVSxnQ0FBZ0M7QUFDakgsV0FBTyxpQkFBaUIsU0FBUyxtQkFBbUIsS0FBSyx5Q0FBeUMsVUFBVSw0QkFBNEI7QUFBQSxFQUN6STtBQUFBLEVBRVEseUNBQXlDLFVBQWUsV0FBdUM7QUFDdEcsVUFBTSxlQUFlLEtBQUssaUNBQWlDLFNBQVM7QUFDcEUsVUFBTSx1QkFBdUIsYUFBYSxPQUFPLGlCQUFlLFlBQVksbUJBQW1CLG9CQUFvQixZQUFZLGlCQUFpQixRQUFRLENBQUM7QUFFekosV0FBTyxxQkFBcUIsS0FBSyxDQUFDLEdBQUcsT0FBTyxFQUFFLGlCQUFpQixVQUFVLE1BQU0sRUFBRSxpQkFBaUIsVUFBVSxFQUFFO0FBQUEsRUFDL0c7QUFBQSxFQUVBLHlCQUE2QztBQUM1QyxXQUFPLEtBQUssaUNBQWlDLDRCQUE0QjtBQUFBLEVBQzFFO0FBQUEsRUFFUSxpQ0FBaUMsV0FBdUM7QUFDL0UsVUFBTSw4QkFBOEIsS0FBSyxxQkFBcUIsUUFBK0MsU0FBUyxLQUFLLENBQUM7QUFDNUgsVUFBTSxzQkFBc0IsNEJBQTRCLGdCQUFnQixDQUFDO0FBQ3pFLFVBQU0sd0JBQXdCLDRCQUE0QixrQkFBa0IsQ0FBQztBQUM3RSxVQUFNLG1CQUFtQiw0QkFBNEIsYUFBYSxDQUFDO0FBQ25FLFVBQU0sa0JBQXlELEVBQUUsR0FBRyxzQkFBc0I7QUFFMUYsZUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE9BQU8sUUFBUSxFQUFFLEdBQUcscUJBQXFCLEdBQUcsaUJBQWlCLENBQUMsR0FBRztBQUMzRixVQUFJLGdCQUFnQixHQUFHLE1BQU0sUUFBVztBQUN2Qyx3QkFBZ0IsR0FBRyxJQUFJO0FBQUEsTUFDeEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxlQUFlLENBQUM7QUFDdEIsZUFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLE9BQU8sUUFBUSxlQUFlLEdBQUc7QUFDM0QsWUFBTSxjQUFpQztBQUFBLFFBQ3RDLGlCQUFpQjtBQUFBLFFBQ2pCLFVBQVU7QUFBQSxNQUNYO0FBQ0EsbUJBQWEsS0FBSyxXQUFXO0FBQUEsSUFDOUI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxxQkFBcUI7QUFFNUIsUUFBSSxDQUFDLEtBQUsseUJBQXlCO0FBQ2xDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxTQUFLLDBCQUEwQjtBQUMvQixVQUFNLFVBQVUsb0JBQUksSUFBdUQ7QUFDM0UsZUFBVyxDQUFDQyxPQUFNLEtBQUssS0FBSyxLQUFLLFVBQVU7QUFDMUMsWUFBTSxvQkFBdUMsQ0FBQztBQUM5QyxpQkFBV0MsWUFBVyxNQUFNLE9BQU8sR0FBRztBQUNyQyxZQUFJLG1CQUFpRDtBQUVyRCxtQkFBVyxVQUFVQSxVQUFTO0FBQzdCLGNBQUksQ0FBQyxrQkFBa0I7QUFDdEIsK0JBQW1CO0FBQUEsY0FDbEIsWUFBWSxPQUFPO0FBQUEsY0FDbkIsYUFBYSxPQUFPO0FBQUEsY0FDcEIsU0FBUyxDQUFDO0FBQUEsY0FDVixxQkFBcUIsQ0FBQztBQUFBLFlBQ3ZCO0FBQUEsVUFDRDtBQUVBLDJCQUFpQixVQUFVLEVBQUUsR0FBRyxpQkFBaUIsU0FBUyxHQUFHLE9BQU8sUUFBUTtBQUM1RSwyQkFBaUIsc0JBQXNCLEVBQUUsR0FBRyxpQkFBaUIscUJBQXFCLEdBQUcsT0FBTyxvQkFBb0I7QUFBQSxRQUNqSDtBQUNBLFlBQUksa0JBQWtCO0FBQ3JCLDRCQUFrQixLQUFLLGdCQUFnQjtBQUFBLFFBQ3hDO0FBQUEsTUFDRDtBQUNBLGNBQVEsSUFBSUQsT0FBTSxpQkFBaUI7QUFBQSxJQUNwQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFZLHFCQUF3QztBQUNuRCxXQUFPLE1BQU0sS0FBSyxLQUFLLGtCQUFrQixPQUFPLENBQUMsRUFBRSxLQUFLO0FBQUEsRUFDekQ7QUFBQSxFQUVBLHVCQUF1QixhQUFxQixVQUFrQixlQUErQjtBQUM1RixTQUFLLGlDQUFpQyxnQkFBZ0IsbUNBQW1DLDhCQUE4QixhQUFhLFFBQVE7QUFBQSxFQUM3STtBQUFBLEVBRVEsOEJBQThCLGlCQUF3QyxhQUFxQixVQUF3QjtBQUMxSCxTQUFLLGlDQUFpQyxvQkFBb0IscUJBQW1DLG1DQUFtQyw4QkFBOEIsYUFBYSxRQUFRO0FBQUEsRUFDcEw7QUFBQSxFQUVRLGlDQUFpQyxXQUFtQixhQUFxQixVQUF3QjtBQUN4RyxVQUFNLGlCQUFvQyxFQUFFLFVBQVUsVUFBVSxpQkFBaUIsWUFBWTtBQUM3RixVQUFNLHNCQUFzQixLQUFLLGlDQUFpQyxTQUFTO0FBQzNFLFVBQU0sbUJBQW1CLHVCQUFPLE9BQU8sSUFBSTtBQUUzQyxlQUFXLGVBQWUsQ0FBQyxHQUFHLHFCQUFxQixjQUFjLEdBQUc7QUFDbkUsVUFBSSxZQUFZLGlCQUFpQjtBQUNoQyx5QkFBaUIsWUFBWSxlQUFlLElBQUksWUFBWTtBQUFBLE1BQzdEO0FBQUEsSUFDRDtBQUNBLFNBQUsscUJBQXFCLFlBQVksV0FBVyxnQkFBZ0I7QUFBQSxFQUNsRTtBQUFBLEVBRVEsZ0NBQWdDLFdBQW1CLGFBQTJCO0FBQ3JGLFVBQU0sc0JBQXNCLEtBQUssaUNBQWlDLFNBQVM7QUFDM0UsUUFBSSxDQUFDLG9CQUFvQixLQUFLLGlCQUFlLFlBQVksb0JBQW9CLFdBQVcsR0FBRztBQUMxRjtBQUFBLElBQ0Q7QUFDQSxVQUFNLG1CQUFtQix1QkFBTyxPQUFPLElBQUk7QUFDM0MsZUFBVyxlQUFlLHFCQUFxQjtBQUM5QyxVQUFJLFlBQVksbUJBQW1CLFlBQVksb0JBQW9CLGFBQWE7QUFDL0UseUJBQWlCLFlBQVksZUFBZSxJQUFJLFlBQVk7QUFBQSxNQUM3RDtBQUFBLElBQ0Q7QUFDQSxTQUFLLHFCQUFxQixZQUFZLFdBQVcsZ0JBQWdCO0FBQUEsRUFDbEU7QUFBQSxFQUVRLG9CQUFvQixVQUFlLGtCQUF5QyxnQkFBa0Q7QUFFckksVUFBTSxlQUFlLEtBQUssaUNBQWlDLFVBQVUsZUFBZTtBQUNwRixVQUFNLGtCQUFzQyxDQUFDO0FBRTdDLGVBQVcsQ0FBQyxLQUFLLE9BQU8sS0FBSyxLQUFLLG1CQUFtQjtBQUNwRCxpQkFBVyxVQUFVLFNBQVM7QUFDN0IsWUFBSSxvQkFBb0Isc0JBQW9DLENBQUMsT0FBTyxvQkFBb0IsdUJBQXVCO0FBQzlHO0FBQUEsUUFDRDtBQUNBLFlBQUksb0JBQW9CLHVCQUFxQyxDQUFDLE9BQU8sb0JBQW9CLHdCQUF3QjtBQUNoSDtBQUFBLFFBQ0Q7QUFDQSxZQUFJLE9BQU8sU0FBUyxzQkFBc0IsQ0FBQyxPQUFPLFFBQVEsbUJBQW1CLFFBQVEsR0FBRztBQUN2RjtBQUFBLFFBQ0Q7QUFFQSxjQUFNLGtCQUFrQixhQUFhLEtBQUssYUFBVyxRQUFRLGFBQWEsT0FBTyxXQUFXLEVBQUU7QUFDOUYsWUFBSyxtQkFBbUIsS0FBSyxxQkFBcUIsT0FBTyxZQUFZLGVBQWUsTUFBTSx5QkFBeUIsYUFBYyxvQkFBb0IsS0FBSyxRQUFRLEdBQUc7QUFDcEssMEJBQWdCLEtBQUssTUFBTTtBQUFBLFFBQzVCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLGdCQUFnQixLQUFLLENBQUMsR0FBRyxNQUFNO0FBQ3JDLFlBQU0sWUFBWSxLQUFLLHFCQUFxQixFQUFFLFlBQVksZUFBZTtBQUN6RSxZQUFNLFlBQVksS0FBSyxxQkFBcUIsRUFBRSxZQUFZLGVBQWU7QUFFekUsVUFBSSxlQUFlLFNBQVMsTUFBTSxlQUFlLFNBQVMsS0FBSyxPQUFPLEVBQUUsZ0JBQWdCLFlBQVksT0FBTyxFQUFFLGdCQUFnQixVQUFVO0FBQ3RJLGVBQU8sRUFBRSxZQUFZLFNBQVMsRUFBRSxZQUFZO0FBQUEsTUFDN0M7QUFDQSxhQUFPLGVBQWUsU0FBUyxJQUFJLGVBQWUsU0FBUztBQUFBLElBQzVELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxXQUFXLG1CQUFzRSxTQUEyRTtBQUNsSyxTQUFLLG9CQUFvQixLQUFLLG1CQUFtQjtBQUdqRCxRQUFJLElBQUksTUFBTSxpQkFBaUIsR0FBRztBQUNqQyxZQUFNLFdBQVc7QUFDakIsWUFBTSxrQkFBa0IsU0FBUyxlQUFlLHFCQUFtQztBQUNuRixVQUFJQyxXQUFVLEtBQUssb0JBQW9CLFVBQVUsZUFBZTtBQUNoRSxVQUFJQSxTQUFRLEtBQUssWUFBVSxLQUFLLHFCQUFxQixPQUFPLFlBQVksZUFBZSxNQUFNLHlCQUF5QixTQUFTLEdBQUc7QUFDakksZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUNBLFVBQUksU0FBUyw2Q0FBNkM7QUFDekQsY0FBTSxzQkFBc0IsSUFBSSxJQUFJLEtBQUssaUNBQWlDLFVBQVUsZUFBZSxFQUFFLElBQUksaUJBQWUsWUFBWSxRQUFRLENBQUM7QUFDN0ksUUFBQUEsV0FBVUEsU0FBUSxPQUFPLFlBQVU7QUFDbEMsZ0JBQU0sV0FBVyxLQUFLLHFCQUFxQixPQUFPLFlBQVksZUFBZTtBQUM3RSxpQkFBTyxPQUFPLGdCQUFnQixPQUMxQixhQUFhLHlCQUF5QixVQUN0QyxPQUFPLFdBQVcsT0FBTyxRQUFRLG1CQUNqQyxvQkFBb0IsSUFBSSxPQUFPLFdBQVcsRUFBRTtBQUFBLFFBQ2pELENBQUM7QUFDRCxlQUFPLFNBQVNBLFNBQVEsSUFBSSxZQUFVLE9BQU8sVUFBVSxHQUFHLFlBQVUsT0FBTyxFQUFFO0FBQUEsTUFDOUU7QUFDQSxhQUFPQSxTQUFRLElBQUksWUFBVSxPQUFPLFVBQVU7QUFBQSxJQUMvQztBQUdBLFVBQU0sVUFBVSxtQkFBbUIsMEJBQ2hDLEtBQUssbUJBQW1CLE9BQU8sWUFBVSxPQUFPLFdBQVcsU0FBUyxXQUFXLHlCQUF5QixTQUFTLElBQ2pILEtBQUs7QUFDUixXQUFPLFNBQVMsUUFBUSxJQUFJLFlBQVUsT0FBTyxVQUFVLEdBQUcsWUFBVSxPQUFPLEVBQUU7QUFBQSxFQUM5RTtBQUFBLEVBRUEsNEJBQTRCLFVBQW1DO0FBQzlELFNBQUssb0JBQW9CLEtBQUssbUJBQW1CO0FBUWpELFVBQU0sVUFBVSxLQUFLLG9CQUFvQixVQUFVLGtCQUFnQyxFQUNqRixPQUFPLFlBQVUsT0FBTyxXQUFXLE9BQU8sMkJBQTJCLEVBQUU7QUFDekUsV0FBTyxRQUFRLENBQUMsR0FBRyxXQUFXO0FBQUEsRUFDL0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsVUFBVSxVQUFlLFVBQWdFLGlCQUErRztBQUUvTSxVQUFNLHFCQUFxQixDQUFDQSxVQUE0QixhQUFxQjtBQUM1RSxhQUFPQSxTQUFRLEtBQUssQ0FBQyxXQUFXO0FBQy9CLFlBQUksb0JBQW9CLHNCQUFvQyxDQUFDLE9BQU8sb0JBQW9CLHVCQUF1QjtBQUM5RyxpQkFBTztBQUFBLFFBQ1I7QUFDQSxZQUFJLG9CQUFvQix1QkFBcUMsQ0FBQyxPQUFPLG9CQUFvQix3QkFBd0I7QUFDaEgsaUJBQU87QUFBQSxRQUNSO0FBRUEsWUFBSSxPQUFPLFNBQVMsdUJBQXVCLFFBQVc7QUFDckQsaUJBQU8sT0FBTyxXQUFXLE9BQU8sWUFBWSxPQUFPLFFBQVEsbUJBQW1CLFFBQVE7QUFBQSxRQUN2RjtBQUNBLGVBQU8sT0FBTyxXQUFXLE9BQU87QUFBQSxNQUNqQyxDQUFDO0FBQUEsSUFDRjtBQUVBLFFBQUksWUFBWSxhQUFhLGlCQUFpQixnQkFBZ0I7QUFFN0QsWUFBTSxvQkFBb0IsS0FBSztBQUMvQixhQUFPO0FBQUEsUUFDTixRQUFRLG1CQUFtQixtQkFBbUIsUUFBUTtBQUFBLFFBQ3RELG9CQUFvQjtBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxLQUFLLG9CQUFvQixVQUFVLGVBQWU7QUFFbEUsVUFBTSwwQkFBMEIsS0FBSyxpQ0FBaUMsVUFBVSxlQUFlO0FBRS9GLFVBQU0sY0FBYyxhQUFhLGlCQUFpQixpQkFBaUIseUJBQXlCLFlBQVkseUJBQXlCO0FBQ2pJLFFBQUksa0JBQWtCLFFBQVEsT0FBTyxZQUFVLGVBQWUsS0FBSyxxQkFBcUIsT0FBTyxZQUFZLGVBQWUsQ0FBQyxLQUFLLGVBQWUsV0FBVyxLQUFLLE9BQU8sV0FBVyxPQUFPLDJCQUEyQixFQUFFO0FBQ3JOLFFBQUksZ0JBQWdCLFdBQVcsR0FBRztBQUNqQyxhQUFPO0FBQUEsUUFDTixRQUFRLHdCQUF3QixDQUFDLEtBQUssZ0JBQWdCLHlCQUF5QixZQUFZLG1CQUFtQixTQUFTLHdCQUF3QixDQUFDLEVBQUUsUUFBUSxJQUFJO0FBQUEsUUFDOUosb0JBQW9CO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBRUEsVUFBTSxtQkFBbUIsd0JBQXdCLENBQUMsSUFBSSxtQkFBbUIsU0FBUyx3QkFBd0IsQ0FBQyxFQUFFLFFBQVEsSUFBSTtBQUN6SCxVQUFNLG1CQUFtQixLQUFLLHFCQUFxQixnQkFBZ0IsQ0FBQyxFQUFFLFlBQVksZUFBZSxNQUFNLHlCQUF5QixZQUMvSCxnQkFBZ0IsQ0FBQyxFQUFFLFdBQVcsS0FDOUIsa0JBQWtCLFdBQVcsTUFDNUIsZ0JBQWdCLEtBQUssWUFBVyxDQUFDLE9BQU8sU0FBUyxzQkFBc0IsT0FBTyxRQUFRLG1CQUFtQixRQUFRLENBQUUsR0FBRyxXQUFXLE1BQ2xJLGdCQUFnQixDQUFDLEVBQUUsV0FBVztBQUUvQixRQUFJLHFCQUFxQjtBQUl6QixzQkFBa0IsZ0JBQ2hCLE9BQU8sWUFBVSxLQUFLLHFCQUFxQixPQUFPLFlBQVksZUFBZSxNQUFNLHlCQUF5QixTQUFTLEVBQ3JILE9BQU8sWUFBVSxDQUFDLE9BQU8sU0FBUyxzQkFBc0IsT0FBTyxRQUFRLG1CQUFtQixRQUFRLENBQUM7QUFDckcsUUFBSSx3QkFBd0IsV0FBVyxLQUFLLGdCQUFnQixTQUFTLEdBQUc7QUFDdkUsMkJBQXFCO0FBQUEsSUFDdEI7QUFFQSxXQUFPO0FBQUEsTUFDTixRQUFRLG1CQUFtQixTQUFTLGdCQUFnQjtBQUFBLE1BQ3BEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUFxQixZQUFrQyxpQkFBa0U7QUFDaEksWUFBUSxpQkFBaUI7QUFBQSxNQUN4QixLQUFLO0FBQ0osZUFBTyxXQUFXLFNBQVM7QUFBQSxNQUM1QixLQUFLO0FBQ0osZUFBTyxXQUFXLFNBQVM7QUFBQSxNQUM1QjtBQUNDLGVBQU8sV0FBVyxTQUFTO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGdCQUFnQixRQUE2QixPQUFxQixnQkFBK0U7QUFDOUosUUFBSSxVQUFVLE9BQU87QUFDckIsVUFBTSxXQUFXLHVCQUF1QixnQkFBZ0IsUUFBUSxFQUFFLG1CQUFtQixpQkFBaUIsUUFBUSxDQUFDO0FBRS9HLFFBQUksV0FBVyxPQUFPLFFBQVEsZUFBZSxhQUFhO0FBQ3pELGdCQUFVLEVBQUUsR0FBRyxTQUFTLFlBQVksUUFBUSxnQkFBZ0IsaUJBQWlCLFVBQVUsT0FBVTtBQUFBLElBQ2xHO0FBR0EsUUFBSSwyQkFBMkIsTUFBTSxHQUFHO0FBQ3ZDLFVBQUksQ0FBQyxlQUFlLG9CQUFvQix3QkFBd0I7QUFDL0Q7QUFBQSxNQUNEO0FBQ0EsWUFBTUMsb0JBQW1CLE1BQU0sZUFBZSxvQkFBb0IsdUJBQXVCLFFBQVEsS0FBSztBQUN0RyxhQUFPLEVBQUUsUUFBUUEsa0JBQWlCLFFBQVEsU0FBU0Esa0JBQWlCLFdBQVcsUUFBUTtBQUFBLElBQ3hGO0FBR0EsUUFBSSwwQkFBMEIsTUFBTSxHQUFHO0FBQ3RDLFVBQUksQ0FBQyxlQUFlLG9CQUFvQix1QkFBdUI7QUFDOUQ7QUFBQSxNQUNEO0FBQ0EsWUFBTUEsb0JBQW1CLE1BQU0sZUFBZSxvQkFBb0Isc0JBQXNCLFFBQVEsS0FBSztBQUNyRyxhQUFPLEVBQUUsUUFBUUEsa0JBQWlCLFFBQVEsU0FBU0Esa0JBQWlCLFdBQVcsUUFBUTtBQUFBLElBQ3hGO0FBR0EsUUFBSSwrQkFBK0IsTUFBTSxHQUFHO0FBQzNDLFVBQUksQ0FBQyxlQUFlLG9CQUFvQiw0QkFBNEI7QUFDbkU7QUFBQSxNQUNEO0FBQ0EsWUFBTUEsb0JBQW1CLE1BQU0sZUFBZSxvQkFBb0IsMkJBQTJCLFFBQVEsS0FBSztBQUMxRyxhQUFPLEVBQUUsUUFBUUEsa0JBQWlCLFFBQVEsU0FBU0Esa0JBQWlCLFdBQVcsUUFBUTtBQUFBLElBQ3hGO0FBRUEsUUFBSSxnQ0FBZ0MsTUFBTSxHQUFHO0FBQzVDLFlBQU0sSUFBSSxNQUFNLHVEQUF1RDtBQUFBLElBQ3hFO0FBRUEsUUFBSSw4QkFBOEIsTUFBTSxHQUFHO0FBQzFDLFVBQUksQ0FBQyxlQUFlLG9CQUFvQiwyQkFBMkI7QUFDbEU7QUFBQSxNQUNEO0FBQ0EsWUFBTUEsb0JBQW1CLE1BQU0sZUFBZSxvQkFBb0IsMEJBQTBCLFFBQVEsS0FBSztBQUN6RyxhQUFPLEVBQUUsUUFBUUEsa0JBQWlCLFFBQVEsU0FBU0Esa0JBQWlCLFdBQVcsUUFBUTtBQUFBLElBQ3hGO0FBR0EsUUFBSSxhQUFhLFFBQVc7QUFDM0IsWUFBTSxJQUFJLE1BQU0sa0RBQWtEO0FBQUEsSUFDbkU7QUFHQSxVQUFNLDBCQUEwQixPQUFPLGVBQWUsU0FBUyxzQkFBc0IsYUFBYSxlQUFlLFFBQVEsa0JBQWtCLElBQUksZUFBZSxTQUFTO0FBQ3ZLLFFBQUkseUJBQXlCO0FBQzVCLFlBQU0sa0JBQWtCLEtBQUssK0JBQStCLFVBQVUsZUFBZSxXQUFXLEVBQUU7QUFDbEcsVUFBSSxnQkFBZ0IsUUFBUTtBQUMzQixjQUFNSCxVQUFTLE1BQU0sS0FBSyw4QkFBOEIsaUJBQWlCLEtBQUs7QUFDOUUsWUFBSUEsU0FBUTtBQUNYLGlCQUFPLEVBQUUsUUFBQUEsU0FBUSxRQUFRO0FBQUEsUUFDMUIsT0FBTztBQUNOO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsUUFBSSxDQUFDLGVBQWUsb0JBQW9CLG1CQUFtQjtBQUMxRDtBQUFBLElBQ0Q7QUFHQSxVQUFNLG1CQUFtQixNQUFNLGVBQWUsb0JBQW9CLGtCQUFrQixRQUFRLEtBQUs7QUFDakcsY0FBVSxpQkFBaUIsV0FBVztBQUN0QyxVQUFNLFFBQVEsaUJBQWlCO0FBRS9CLFdBQU8sRUFBRSxRQUFRLE9BQU8sUUFBUTtBQUFBLEVBQ2pDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsTUFBYyw4QkFDYiw0QkFDQSxhQUNtQztBQUNuQyxVQUFNLGNBQWMsMkJBQTJCLENBQUM7QUFHaEQsZUFBVyxFQUFFLFFBQVEsTUFBTSxLQUFLLDRCQUE0QjtBQUMzRCxVQUFJLFdBQVcsWUFBWSxRQUFRO0FBQ2xDLGNBQU0sU0FBUyxNQUFNLE1BQU0sWUFBWSxNQUFNO0FBQzdDLFlBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJLFlBQVksT0FBTyxZQUFZLE1BQU0sSUFBSTtBQUM1QyxZQUFNLFFBQVEsWUFBWSxNQUFNLFdBQVcsWUFBWSxRQUFRLFdBQVc7QUFDMUUsVUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTyxZQUFZO0FBQUEsRUFDcEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLCtCQUNQLFVBQ0EsVUFDc0Q7QUFDdEQsVUFBTSxNQUEyRCxDQUFDO0FBQ2xFLFVBQU0sZ0JBQWdCLFNBQVM7QUFBQSxNQUM5QixHQUFHLEtBQUssbUJBQW1CO0FBQUEsSUFDNUIsQ0FBQztBQUVELGVBQVcsU0FBUyxlQUFlO0FBQ2xDLGlCQUFXLFVBQVUsTUFBTSxTQUFTO0FBQ25DLGFBQUssS0FBSyxtQkFBbUIsT0FBTyxRQUFRLE9BQU8sVUFBVSxRQUFRLEtBQUssS0FBSyxtQkFBbUIsT0FBTyxRQUFRLHVCQUF1QixlQUFlLE1BQU0sR0FBRyxRQUFRLE1BQU0sT0FBTyxhQUFhLFVBQVU7QUFDM00sY0FBSSxLQUFLLEVBQUUsUUFBUSxNQUFNLENBQUM7QUFBQSxRQUMzQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsNEJBQTRCLFVBQWUsWUFBb0IsY0FBbUMsZUFBNEIsT0FBcUI7QUFJaEssVUFBTSxrQkFBa0IsMEJBQTBCLFlBQVksSUFBSSxxQkFBbUMsMkJBQTJCLFlBQVksSUFBSSxzQkFBb0M7QUFDcEwsVUFBTSxVQUFVLEtBQUssb0JBQW9CLFVBQVUsZUFBZTtBQUNsRSxVQUFNLGdCQUE4QixLQUFLLE1BQU0sS0FBSyxlQUFlLElBQUksc0JBQXNCLDhCQUE4QixhQUFhLFNBQVMsSUFBSSxDQUFDO0FBQ3RKLFVBQU0sa0JBQWtCLElBQUksUUFBUSxRQUFRLENBQUM7QUFFN0MsVUFBTSwrQkFBK0IsTUFBTTtBQUMxQyxvQkFBYyxlQUFlLElBQUksQ0FBQztBQUNsQyxjQUFRLFFBQVEsWUFBVSxjQUFjLGVBQWUsRUFBRSxLQUFLLE9BQU8sV0FBVyxFQUFFLENBQUM7QUFDbkYsV0FBSyxlQUFlLE1BQU0sc0JBQXNCLDhCQUE4QixLQUFLLFVBQVUsYUFBYSxHQUFHLGFBQWEsU0FBUyxjQUFjLE9BQU87QUFBQSxJQUN6SjtBQUdBLFFBQUksY0FBYyxlQUFlLEdBQUcsS0FBSyxjQUFZLGFBQWEsY0FBYyxRQUFRLEdBQUc7QUFDMUY7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLEtBQUssb0JBQW9CO0FBQUEsTUFBTyxTQUFTO0FBQUEsTUFDdkQsU0FBUyxzQ0FBc0MsZ0VBQWdFO0FBQUEsTUFDL0c7QUFBQSxRQUFDO0FBQUEsVUFDQSxPQUFPLFNBQVMsbUNBQW1DLG1CQUFtQjtBQUFBLFVBQ3RFLEtBQUssWUFBWTtBQUVoQixrQkFBTSxTQUFTLE1BQU0sS0FBSyxhQUFhLGNBQWMsSUFBSTtBQUN6RCxnQkFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLFlBQ0Q7QUFDQSx5QkFBYSxVQUFVO0FBQ3ZCLGtCQUFNLG9CQUFvQixNQUFNLEtBQUssY0FBYyxjQUFjLEtBQUs7QUFDdEUsZ0JBQUksc0JBQXNCLGVBQWUsU0FBUyxzQkFBc0IsZUFBZSxNQUFNO0FBQzVGO0FBQUEsWUFDRDtBQUVBLGtCQUFNLGVBQWU7QUFBQSxjQUNwQjtBQUFBLGdCQUNDLFFBQVE7QUFBQSxnQkFDUixhQUFhLGtCQUFrQjtBQUFBLGdCQUMvQixTQUFTLGtCQUFrQixXQUFXO0FBQUEsY0FDdkM7QUFBQSxZQUNELENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE9BQU8sU0FBUyw4QkFBOEIsWUFBWSxVQUFVO0FBQUEsVUFDcEUsS0FBSztBQUFBLFFBQ047QUFBQSxNQUNBO0FBQUEsSUFBQztBQUVGLFVBQU0sa0JBQWtCLE9BQU8sV0FBVyxNQUFNO0FBQy9DLG1DQUE2QjtBQUM3QixzQkFBZ0IsUUFBUTtBQUFBLElBQ3pCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSwyQkFBMkIsVUFBZSxtQkFBd0MsaUJBQXdDO0FBQ2pJLFVBQU0sZ0JBQWdCLEtBQUssbUJBQW1CLFlBQVksWUFBWSxRQUFRLEVBQUUsR0FBRyxDQUFDO0FBRXBGLFFBQUksb0JBQW9CLFNBQVMsV0FBVyxRQUFRLFdBQVcsS0FBSyxtQkFBbUIsT0FBTyxPQUFLLEVBQUUsV0FBVyxTQUFTLFdBQVcseUJBQXlCLFNBQVMsSUFBSSxLQUFLLG9CQUFvQixVQUFVLGVBQWU7QUFDNU4sUUFBSSxvQkFBb0Isb0JBQWtDO0FBQ3pELDBCQUFvQixrQkFBa0IsT0FBTyxZQUFVLENBQUMsQ0FBQyxPQUFPLG9CQUFvQixxQkFBcUI7QUFBQSxJQUMxRztBQUVBLHdCQUFvQixTQUFTLG1CQUFtQixPQUFLLEVBQUUsV0FBVyxFQUFFO0FBQ3BFLFVBQU0saUJBQWlCLEtBQUssaUNBQWlDLFVBQVUsZUFBZSxFQUFFLENBQUMsR0FBRztBQUU1Rix3QkFBb0Isa0JBQWtCLEtBQUssQ0FBQyxHQUFHLE1BQU07QUFDcEQsVUFBSSxFQUFFLFdBQVcsT0FBTywyQkFBMkIsSUFBSTtBQUN0RCxlQUFPO0FBQUEsTUFDUixXQUFXLEVBQUUsV0FBVyxPQUFPLDJCQUEyQixJQUFJO0FBQzdELGVBQU87QUFBQSxNQUNSLE9BQU87QUFDTixlQUFPLGVBQWUsS0FBSyxxQkFBcUIsRUFBRSxZQUFZLGVBQWUsQ0FBQyxJQUFJLGVBQWUsS0FBSyxxQkFBcUIsRUFBRSxZQUFZLGVBQWUsQ0FBQztBQUFBLE1BQzFKO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxtQkFBeUMsQ0FBQztBQUNoRCxVQUFNLHVCQUF1QixTQUFTLGtDQUFrQyxRQUFRO0FBQ2hGLFVBQU0sc0JBQXNCLFNBQVMsaUNBQWlDLFNBQVM7QUFDL0UsVUFBTSwrQkFBK0IsU0FBUywwQ0FBMEMsb0JBQW9CO0FBRTVHLFFBQUksa0JBQWtCO0FBQ3RCLFFBQUksQ0FBQyxtQkFBbUIsa0JBQWtCLFNBQVMsS0FBSyxLQUFLLHFCQUFxQixrQkFBa0IsQ0FBQyxFQUFFLFlBQVksZUFBZSxNQUFNLHlCQUF5QixRQUFRO0FBQ3hLLHdCQUFrQixrQkFBa0IsQ0FBQyxHQUFHLFdBQVc7QUFBQSxJQUNwRDtBQUNBLFFBQUksQ0FBQyxpQkFBaUI7QUFDckIsd0JBQWtCLDJCQUEyQjtBQUFBLElBQzlDO0FBRUEsc0JBQWtCLFFBQVEsWUFBVTtBQUNuQyxZQUFNLGtCQUFrQixlQUFlLFlBQVksMkJBQTJCO0FBQzlFLFlBQU0sV0FBVyxnQkFBZ0IsT0FBTyxXQUFXLE9BQU8sa0JBQWtCO0FBQzVFLFlBQU0sWUFBWSxPQUFPLFdBQVcsT0FBTztBQUMzQyxZQUFNLGlCQUFpQztBQUFBLFFBQ3RDLElBQUksT0FBTyxXQUFXO0FBQUEsUUFDdEIsT0FBTyxPQUFPLFdBQVc7QUFBQSxRQUN6QixhQUFhLFlBQVksWUFBWSwrQkFBK0IsV0FBVyx1QkFBdUIsWUFBWSxzQkFBc0I7QUFBQSxRQUN4SSxRQUFRLE9BQU8sV0FBVyxVQUFVLE9BQU8sV0FBVyxTQUFTO0FBQUEsTUFDaEU7QUFDQSx1QkFBaUIsS0FBSyxjQUFjO0FBQUEsSUFDckMsQ0FBQztBQUNELFFBQUksQ0FBQyxxQkFBcUIsUUFBUSxRQUFRLE1BQU0sSUFBSTtBQUNuRCxZQUFNLFlBQWlDLEVBQUUsTUFBTSxZQUFZO0FBQzNELHVCQUFpQixLQUFLLFNBQVM7QUFDL0IsWUFBTSx3QkFBd0I7QUFBQSxRQUM3QixJQUFJLHNCQUFzQjtBQUFBLFFBQzFCLE9BQU8sU0FBUyxtQ0FBbUMseUNBQXlDLElBQUksUUFBUSxRQUFRLENBQUMsRUFBRTtBQUFBLE1BQ3BIO0FBQ0EsdUJBQWlCLEtBQUsscUJBQXFCO0FBRzNDLFVBQUksb0JBQW9CLG9CQUFrQztBQUN6RCxjQUFNLDRCQUE0QjtBQUFBLFVBQ2pDLElBQUksc0JBQXNCO0FBQUEsVUFDMUIsT0FBTyxTQUFTLHVDQUF1QyxxREFBcUQsSUFBSSxRQUFRLFFBQVEsQ0FBQyxFQUFFO0FBQUEsUUFDcEk7QUFDQSx5QkFBaUIsS0FBSyx5QkFBeUI7QUFBQSxNQUNoRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxhQUFhLFFBQTZCLG1CQUE2Qix1QkFBb0Y7QUFReEssUUFBSSxXQUFXLHVCQUF1QixlQUFlLFFBQVEsRUFBRSxtQkFBbUIsaUJBQWlCLFFBQVEsQ0FBQztBQUU1RyxRQUFJLGFBQWEsUUFBVztBQUMzQixpQkFBVyxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsU0FBUyxDQUFDO0FBQUEsSUFDakQ7QUFDQSxVQUFNLGtCQUFrQiwwQkFBMEIsTUFBTSxJQUFJLHFCQUFtQztBQUkvRixVQUFNLG9CQUFvQix5QkFBeUI7QUFLbkQsVUFBTSw0QkFBNEIsQ0FBQyxhQUFxQjtBQUN2RCxZQUFNLGNBQWMsSUFBSSxRQUFRLFFBQVEsQ0FBQztBQUN6QyxXQUFLLDhCQUE4QixtQkFBbUIsYUFBYSxRQUFRO0FBQzNFLFVBQUksc0JBQXNCLGtCQUFnQyxvQkFBb0Isb0JBQWtDO0FBQy9HLGFBQUssZ0NBQWdDLGtDQUFrQyxXQUFXO0FBQUEsTUFDbkY7QUFBQSxJQUNEO0FBR0EsVUFBTSxjQUFjLEtBQUssMkJBQTJCLFVBQVUsbUJBQW1CLGVBQWU7QUFHaEcsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0sZUFBZSxZQUFZLElBQUksS0FBSyxrQkFBa0IsZ0JBQWdDLEVBQUUsZUFBZSxLQUFLLENBQUMsQ0FBQztBQUNwSCxVQUFNLHFCQUFxQixvQkFDekIsc0JBQXNCLHFCQUN0QixTQUFTLCtDQUErQyxtREFBbUQsSUFBSSxRQUFRLFFBQVEsQ0FBQyxFQUFFLElBQ2xJLFNBQVMsMkNBQTJDLHVDQUF1QyxJQUFJLFFBQVEsUUFBUSxDQUFDLEVBQUUsSUFDbkgsU0FBUyw4QkFBOEIsMkJBQTJCLFNBQVMsUUFBUSxDQUFDO0FBQ3JGLGlCQUFhLGNBQWM7QUFDM0IsaUJBQWEsd0JBQXdCO0FBQ3JDLGlCQUFhLFFBQVE7QUFDckIsVUFBTSxZQUFZLGFBQWEsTUFBTSxLQUFLLFVBQVEsS0FBSyxTQUFTLE1BQU07QUFDdEUsUUFBSSxXQUFXO0FBQ2QsbUJBQWEsZ0JBQWdCLENBQUMsU0FBUztBQUFBLElBQ3hDO0FBR0EsVUFBTSxTQUFpQyxNQUFNLElBQUksUUFBZ0MsYUFBVztBQUMzRixrQkFBWSxJQUFJLGFBQWEsWUFBWSxPQUFLO0FBQzdDLFlBQUksU0FBaUM7QUFFckMsWUFBSSxhQUFhLGNBQWMsV0FBVyxHQUFHO0FBQzVDLG1CQUFTO0FBQUEsWUFDUixNQUFNLGFBQWEsY0FBYyxDQUFDO0FBQUEsWUFDbEMsU0FBUyxhQUFhO0FBQUEsWUFDdEIsa0JBQWtCLEVBQUU7QUFBQSxVQUNyQjtBQUFBLFFBQ0Q7QUFHQSxZQUFJLFlBQVkscUJBQXFCLFFBQVEsS0FBSyxJQUFJO0FBQ3JELG9DQUEwQixPQUFPLEtBQUssRUFBRTtBQUFBLFFBQ3pDO0FBRUEsZ0JBQVEsTUFBTTtBQUFBLE1BQ2YsQ0FBQyxDQUFDO0FBRUYsa0JBQVksSUFBSSxhQUFhLFVBQVUsTUFBTTtBQUM1QyxvQkFBWSxRQUFRO0FBQ3BCLGdCQUFRLE1BQVM7QUFBQSxNQUNsQixDQUFDLENBQUM7QUFFRixrQkFBWSxJQUFJLGFBQWEsdUJBQXVCLE9BQUs7QUFHeEQsZ0JBQVEsRUFBRSxNQUFNLEVBQUUsTUFBTSxrQkFBa0IsTUFBTSxDQUFDO0FBR2pELFlBQUksWUFBWSxFQUFFLE1BQU0sSUFBSTtBQUMzQixvQ0FBMEIsRUFBRSxLQUFLLEVBQUU7QUFBQSxRQUNwQztBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBRUYsbUJBQWEsS0FBSztBQUFBLElBQ25CLENBQUM7QUFHRCxpQkFBYSxRQUFRO0FBS3JCLFFBQUksUUFBUTtBQUdYLFVBQUksT0FBTyxLQUFLLE9BQU8sc0JBQXNCLG9CQUFvQjtBQUNoRSxlQUFPLEtBQUssYUFBYSxRQUFRLE1BQU0sY0FBNEI7QUFBQSxNQUNwRTtBQUdBLFVBQUksT0FBTyxLQUFLLE9BQU8sc0JBQXNCLHdCQUF3QjtBQUNwRSxlQUFPLEtBQUssYUFBYSxRQUFRLE1BQU0sa0JBQWdDO0FBQUEsTUFDeEU7QUFHQSxZQUFNLGdCQUFnQztBQUFBLFFBQ3JDLEdBQUcsT0FBTztBQUFBLFFBQ1YsVUFBVSxPQUFPLEtBQUs7QUFBQSxRQUN0QixlQUFlLE9BQU8sb0JBQW9CLE9BQU8sU0FBUztBQUFBLE1BQzNEO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZUFBZTtBQUV0QixVQUFNLGVBQTRCLG9CQUFJLElBQVk7QUFHbEQsZUFBVyxDQUFDLGFBQWEsWUFBWSxLQUFLLEtBQUssbUJBQW1CO0FBQ2pFLFlBQU0sY0FBYyxDQUFDLENBQUMsYUFBYSxLQUFLLE9BQUssRUFBRSxXQUFXLFNBQVMsV0FBVyx5QkFBeUIsVUFBVSxFQUFFLFdBQVcsT0FBTywyQkFBMkIsRUFBRTtBQUVsSyxVQUFJLENBQUMsYUFBYTtBQUNqQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLEtBQUssa0JBQWtCLFdBQVcsR0FBRztBQUN4QyxxQkFBYSxJQUFJLEdBQUcsWUFBWSxPQUFPLEVBQUU7QUFBQSxNQUMxQyxPQUFPO0FBQ04scUJBQWEsSUFBSSxXQUFXO0FBQUEsTUFDN0I7QUFBQSxJQUNEO0FBR0EsVUFBTSxtQkFBbUI7QUFBQSxNQUN4QixHQUFHLEtBQUssdUJBQXVCO0FBQUEsTUFDL0IsR0FBRyxLQUFLLGlDQUFpQyxnQ0FBZ0M7QUFBQSxJQUMxRTtBQUNBLGVBQVcsZUFBZSxrQkFBa0I7QUFDM0MsVUFBSSxZQUFZLGlCQUFpQjtBQUNoQyxxQkFBYSxJQUFJLFlBQVksZUFBZTtBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUNBLFNBQUssZUFBZSxNQUFNLHNCQUFzQixnQkFBZ0IsS0FBSyxVQUFVLE1BQU0sS0FBSyxZQUFZLENBQUMsR0FBRyxhQUFhLFNBQVMsY0FBYyxPQUFPO0FBQUEsRUFDdEo7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLCtCQUErQixVQUFlLGlCQUFpRDtBQUN0RyxVQUFNLG1CQUFtQixLQUFLLG9DQUFvQyxVQUFVLGVBQWU7QUFDM0YsZUFBVyxlQUFlLGtCQUFrQjtBQUMzQyxVQUFJLFlBQVksYUFBYSwyQkFBMkIsSUFBSTtBQUMzRCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEscUJBQXFCLFVBQXdCO0FBQ3BELFFBQUksQ0FBQyxLQUFLLE9BQU87QUFDaEIsYUFBTztBQUFBLElBQ1I7QUFFQSxlQUFXLGNBQWMsS0FBSyxPQUFPO0FBQ3BDLFVBQUksb0JBQW9CLFlBQVksUUFBUSxHQUFHO0FBQzlDLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFBQTtBQS85QmEsc0JBUVkscUJBQXFCO0FBUmpDLHNCQVNZLHlCQUF5QjtBQVRyQyxzQkFVWSxpQkFBaUI7QUFWN0Isc0JBV1ksK0JBQStCO0FBWDNDLHdCQUFOO0FBQUEsRUFvQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBNUJVO0FBaStCYixrQkFBa0Isd0JBQXdCLHVCQUF1QixrQkFBa0IsS0FBSzsiLAogICJuYW1lcyI6IFsiRWRpdG9yQXNzb2NpYXRpb25UeXBlIiwgImVkaXRvciIsICJnbG9iIiwgImVkaXRvcnMiLCAiaW5wdXRXaXRoT3B0aW9ucyJdCn0K
