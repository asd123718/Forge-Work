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
import { Barrier } from "../../../base/common/async.js";
import { isUriComponents, URI } from "../../../base/common/uri.js";
import { Event, Emitter } from "../../../base/common/event.js";
import { observableValue, observableValueOpts, transaction } from "../../../base/common/observable.js";
import { DisposableStore, combinedDisposable, dispose, Disposable } from "../../../base/common/lifecycle.js";
import { ISCMService, ISCMViewService } from "../../contrib/scm/common/scm.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { IQuickDiffService } from "../../contrib/scm/common/quickDiff.js";
import { ResourceTree } from "../../../base/common/resourceTree.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import { basename } from "../../../base/common/resources.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { ITextModelService } from "../../../editor/common/services/resolverService.js";
import { Schemas } from "../../../base/common/network.js";
import { structuralEquals } from "../../../base/common/equals.js";
import { historyItemBaseRefColor, historyItemRefColor, historyItemRemoteRefColor } from "../../contrib/scm/browser/scmHistory.js";
function getIconFromIconDto(iconDto) {
  if (iconDto === void 0) {
    return void 0;
  } else if (ThemeIcon.isThemeIcon(iconDto)) {
    return iconDto;
  } else if (isUriComponents(iconDto)) {
    return URI.revive(iconDto);
  } else {
    const icon = iconDto;
    return { light: URI.revive(icon.light), dark: URI.revive(icon.dark) };
  }
}
function toISCMHistoryItem(historyItemDto) {
  const authorIcon = getIconFromIconDto(historyItemDto.authorIcon);
  const references = historyItemDto.references?.map((r) => ({
    ...r,
    icon: getIconFromIconDto(r.icon)
  }));
  return { ...historyItemDto, authorIcon, references };
}
function toISCMHistoryItemRef(historyItemRefDto, color) {
  return historyItemRefDto ? { ...historyItemRefDto, icon: getIconFromIconDto(historyItemRefDto.icon), color } : void 0;
}
class SCMInputBoxContentProvider extends Disposable {
  constructor(textModelService, modelService, languageService) {
    super();
    this.modelService = modelService;
    this.languageService = languageService;
    this._register(textModelService.registerTextModelContentProvider(Schemas.vscodeSourceControl, this));
  }
  async provideTextContent(resource) {
    const existing = this.modelService.getModel(resource);
    if (existing) {
      return existing;
    }
    return this.modelService.createModel("", this.languageService.createById("scminput"), resource);
  }
}
class MainThreadSCMResourceGroup {
  constructor(sourceControlHandle, handle, provider, features, label, id, multiDiffEditorEnableViewChanges, _uriIdentService) {
    this.sourceControlHandle = sourceControlHandle;
    this.handle = handle;
    this.provider = provider;
    this.features = features;
    this.label = label;
    this.id = id;
    this.multiDiffEditorEnableViewChanges = multiDiffEditorEnableViewChanges;
    this._uriIdentService = _uriIdentService;
    this.resources = [];
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._onDidChangeResources = new Emitter();
    this.onDidChangeResources = this._onDidChangeResources.event;
  }
  get resourceTree() {
    if (!this._resourceTree) {
      const rootUri = this.provider.rootUri ?? URI.file("/");
      this._resourceTree = new ResourceTree(this, rootUri, this._uriIdentService.extUri);
      for (const resource of this.resources) {
        this._resourceTree.add(resource.sourceUri, resource);
      }
    }
    return this._resourceTree;
  }
  get hideWhenEmpty() {
    return !!this.features.hideWhenEmpty;
  }
  get contextValue() {
    return this.features.contextValue;
  }
  toJSON() {
    return {
      $mid: MarshalledId.ScmResourceGroup,
      sourceControlHandle: this.sourceControlHandle,
      groupHandle: this.handle
    };
  }
  splice(start, deleteCount, toInsert) {
    this.resources.splice(start, deleteCount, ...toInsert);
    this._resourceTree = void 0;
    this._onDidChangeResources.fire();
  }
  $updateGroup(features) {
    this.features = { ...this.features, ...features };
    this._onDidChange.fire();
  }
  $updateGroupLabel(label) {
    this.label = label;
    this._onDidChange.fire();
  }
}
class MainThreadSCMResource {
  constructor(proxy, sourceControlHandle, groupHandle, handle, sourceUri, resourceGroup, decorations, contextValue, command, multiDiffEditorOriginalUri, multiDiffEditorModifiedUri) {
    this.proxy = proxy;
    this.sourceControlHandle = sourceControlHandle;
    this.groupHandle = groupHandle;
    this.handle = handle;
    this.sourceUri = sourceUri;
    this.resourceGroup = resourceGroup;
    this.decorations = decorations;
    this.contextValue = contextValue;
    this.command = command;
    this.multiDiffEditorOriginalUri = multiDiffEditorOriginalUri;
    this.multiDiffEditorModifiedUri = multiDiffEditorModifiedUri;
  }
  open(preserveFocus) {
    return this.proxy.$executeResourceCommand(this.sourceControlHandle, this.groupHandle, this.handle, preserveFocus);
  }
  toJSON() {
    return {
      $mid: MarshalledId.ScmResource,
      sourceControlHandle: this.sourceControlHandle,
      groupHandle: this.groupHandle,
      handle: this.handle
    };
  }
}
class MainThreadSCMArtifactProvider {
  constructor(proxy, handle) {
    this.proxy = proxy;
    this.handle = handle;
    this._onDidChangeArtifacts = new Emitter();
    this.onDidChangeArtifacts = this._onDidChangeArtifacts.event;
    this._disposables = new DisposableStore();
    this._disposables.add(this._onDidChangeArtifacts);
  }
  async provideArtifactGroups(token) {
    const artifactGroups = await this.proxy.$provideArtifactGroups(this.handle, token ?? CancellationToken.None);
    return artifactGroups?.map((group) => ({ ...group, icon: getIconFromIconDto(group.icon) }));
  }
  async provideArtifacts(group, token) {
    const artifacts = await this.proxy.$provideArtifacts(this.handle, group, token ?? CancellationToken.None);
    return artifacts?.map((artifact) => ({ ...artifact, icon: getIconFromIconDto(artifact.icon) }));
  }
  $onDidChangeArtifacts(groups) {
    this._onDidChangeArtifacts.fire(groups);
  }
  dispose() {
    this._disposables.dispose();
  }
}
class MainThreadSCMHistoryProvider {
  constructor(proxy, handle) {
    this.proxy = proxy;
    this.handle = handle;
    this._historyItemRef = observableValueOpts({
      owner: this,
      equalsFn: structuralEquals
    }, void 0);
    this._historyItemRemoteRef = observableValueOpts({
      owner: this,
      equalsFn: structuralEquals
    }, void 0);
    this._historyItemBaseRef = observableValueOpts({
      owner: this,
      equalsFn: structuralEquals
    }, void 0);
    this._historyItemRefChanges = observableValue(this, { added: [], modified: [], removed: [], silent: false });
  }
  get historyItemRef() {
    return this._historyItemRef;
  }
  get historyItemRemoteRef() {
    return this._historyItemRemoteRef;
  }
  get historyItemBaseRef() {
    return this._historyItemBaseRef;
  }
  get historyItemRefChanges() {
    return this._historyItemRefChanges;
  }
  async resolveHistoryItem(historyItemId, token) {
    const historyItem = await this.proxy.$resolveHistoryItem(this.handle, historyItemId, token ?? CancellationToken.None);
    return historyItem ? toISCMHistoryItem(historyItem) : void 0;
  }
  async resolveHistoryItemChatContext(historyItemId, token) {
    return this.proxy.$resolveHistoryItemChatContext(this.handle, historyItemId, token ?? CancellationToken.None);
  }
  async resolveHistoryItemChangeRangeChatContext(historyItemId, historyItemParentId, path, token) {
    return this.proxy.$resolveHistoryItemChangeRangeChatContext(this.handle, historyItemId, historyItemParentId, path, token ?? CancellationToken.None);
  }
  async resolveHistoryItemRefsCommonAncestor(historyItemRefs, token) {
    return this.proxy.$resolveHistoryItemRefsCommonAncestor(this.handle, historyItemRefs, token ?? CancellationToken.None);
  }
  async provideHistoryItemRefs(historyItemsRefs, token) {
    const historyItemRefs = await this.proxy.$provideHistoryItemRefs(this.handle, historyItemsRefs, token ?? CancellationToken.None);
    return historyItemRefs?.map((ref) => ({ ...ref, icon: getIconFromIconDto(ref.icon) }));
  }
  async provideHistoryItems(options, token) {
    const historyItems = await this.proxy.$provideHistoryItems(this.handle, options, token ?? CancellationToken.None);
    return historyItems?.map((historyItem) => toISCMHistoryItem(historyItem));
  }
  async provideHistoryItemChanges(historyItemId, historyItemParentId, token) {
    const changes = await this.proxy.$provideHistoryItemChanges(this.handle, historyItemId, historyItemParentId, token ?? CancellationToken.None);
    return changes?.map((change) => ({
      uri: URI.revive(change.uri),
      originalUri: change.originalUri && URI.revive(change.originalUri),
      modifiedUri: change.modifiedUri && URI.revive(change.modifiedUri)
    }));
  }
  $onDidChangeCurrentHistoryItemRefs(historyItemRef, historyItemRemoteRef, historyItemBaseRef) {
    transaction((tx) => {
      this._historyItemRef.set(toISCMHistoryItemRef(historyItemRef, historyItemRefColor), tx);
      this._historyItemRemoteRef.set(toISCMHistoryItemRef(historyItemRemoteRef, historyItemRemoteRefColor), tx);
      this._historyItemBaseRef.set(toISCMHistoryItemRef(historyItemBaseRef, historyItemBaseRefColor), tx);
    });
  }
  $onDidChangeHistoryItemRefs(historyItemRefs) {
    const added = historyItemRefs.added.map((ref) => toISCMHistoryItemRef(ref));
    const modified = historyItemRefs.modified.map((ref) => toISCMHistoryItemRef(ref));
    const removed = historyItemRefs.removed.map((ref) => toISCMHistoryItemRef(ref));
    this._historyItemRefChanges.set({ added, modified, removed, silent: historyItemRefs.silent }, void 0);
  }
}
class MainThreadSCMProvider {
  constructor(proxy, _handle, _parentHandle, _providerId, _label, _rootUri, _iconPath, _isHidden, _inputBoxTextModel, _quickDiffService, _uriIdentService, _workspaceContextService) {
    this.proxy = proxy;
    this._handle = _handle;
    this._parentHandle = _parentHandle;
    this._providerId = _providerId;
    this._label = _label;
    this._rootUri = _rootUri;
    this._iconPath = _iconPath;
    this._isHidden = _isHidden;
    this._inputBoxTextModel = _inputBoxTextModel;
    this._quickDiffService = _quickDiffService;
    this._uriIdentService = _uriIdentService;
    this._workspaceContextService = _workspaceContextService;
    this.groups = [];
    this._onDidChangeResourceGroups = new Emitter();
    this.onDidChangeResourceGroups = this._onDidChangeResourceGroups.event;
    this._onDidChangeResources = new Emitter();
    this.onDidChangeResources = this._onDidChangeResources.event;
    this._groupsByHandle = /* @__PURE__ */ Object.create(null);
    // get groups(): ISequence<ISCMResourceGroup> {
    // 	return {
    // 		elements: this._groups,
    // 		onDidSplice: this._onDidSplice.event
    // 	};
    // 	// return this._groups
    // 	// 	.filter(g => g.resources.elements.length > 0 || !g.features.hideWhenEmpty);
    // }
    this.features = {};
    this._contextValue = observableValue(this, void 0);
    this._count = observableValue(this, void 0);
    this._statusBarCommands = observableValue(this, void 0);
    this._commitTemplate = observableValue(this, "");
    this._actionButton = observableValue(this, void 0);
    this._artifactProvider = observableValue(this, void 0);
    this._historyProvider = observableValue(this, void 0);
    if (_rootUri) {
      const folder = this._workspaceContextService.getWorkspaceFolder(_rootUri);
      if (folder?.uri.toString() === _rootUri.toString()) {
        this._name = folder.name;
      } else if (_rootUri.path !== "/") {
        this._name = basename(_rootUri);
      }
    }
  }
  get id() {
    return `scm${this._handle}`;
  }
  get parentId() {
    return this._parentHandle !== void 0 ? `scm${this._parentHandle}` : void 0;
  }
  get providerId() {
    return this._providerId;
  }
  get handle() {
    return this._handle;
  }
  get label() {
    return this._label;
  }
  get rootUri() {
    return this._rootUri;
  }
  get iconPath() {
    return this._iconPath;
  }
  get isHidden() {
    return this._isHidden;
  }
  get inputBoxTextModel() {
    return this._inputBoxTextModel;
  }
  get contextValue() {
    return this._contextValue;
  }
  get acceptInputCommand() {
    return this.features.acceptInputCommand;
  }
  get count() {
    return this._count;
  }
  get statusBarCommands() {
    return this._statusBarCommands;
  }
  get name() {
    return this._name ?? this._label;
  }
  get commitTemplate() {
    return this._commitTemplate;
  }
  get actionButton() {
    return this._actionButton;
  }
  get artifactProvider() {
    return this._artifactProvider;
  }
  get historyProvider() {
    return this._historyProvider;
  }
  $updateSourceControl(features) {
    this.features = { ...this.features, ...features };
    if (typeof features.commitTemplate !== "undefined") {
      this._commitTemplate.set(features.commitTemplate, void 0);
    }
    if (typeof features.actionButton !== "undefined") {
      this._actionButton.set(features.actionButton ?? void 0, void 0);
    }
    if (typeof features.contextValue !== "undefined") {
      this._contextValue.set(features.contextValue, void 0);
    }
    if (typeof features.count !== "undefined") {
      this._count.set(features.count, void 0);
    }
    if (typeof features.statusBarCommands !== "undefined") {
      this._statusBarCommands.set(features.statusBarCommands, void 0);
    }
    if (features.hasQuickDiffProvider && !this._quickDiff) {
      this._quickDiff = this._quickDiffService.addQuickDiffProvider({
        id: `${this._providerId}.quickDiffProvider`,
        label: features.quickDiffLabel ?? this.label,
        rootUri: this.rootUri,
        kind: "primary",
        getOriginalResource: async (uri) => {
          if (!this.features.hasQuickDiffProvider) {
            return null;
          }
          const result = await this.proxy.$provideOriginalResource(this.handle, uri, CancellationToken.None);
          return result && URI.revive(result);
        }
      });
    } else if (features.hasQuickDiffProvider === false && this._quickDiff) {
      this._quickDiff.dispose();
      this._quickDiff = void 0;
    }
    if (features.hasSecondaryQuickDiffProvider && !this._stagedQuickDiff) {
      this._stagedQuickDiff = this._quickDiffService.addQuickDiffProvider({
        id: `${this._providerId}.secondaryQuickDiffProvider`,
        label: features.secondaryQuickDiffLabel ?? this.label,
        rootUri: this.rootUri,
        kind: "secondary",
        getOriginalResource: async (uri) => {
          if (!this.features.hasSecondaryQuickDiffProvider) {
            return null;
          }
          const result = await this.proxy.$provideSecondaryOriginalResource(this.handle, uri, CancellationToken.None);
          return result && URI.revive(result);
        }
      });
    } else if (features.hasSecondaryQuickDiffProvider === false && this._stagedQuickDiff) {
      this._stagedQuickDiff.dispose();
      this._stagedQuickDiff = void 0;
    }
    if (features.hasArtifactProvider && !this.artifactProvider.get()) {
      const artifactProvider = new MainThreadSCMArtifactProvider(this.proxy, this.handle);
      this._artifactProvider.set(artifactProvider, void 0);
    } else if (features.hasArtifactProvider === false && this.artifactProvider.get()) {
      this._artifactProvider.get()?.dispose();
      this._artifactProvider.set(void 0, void 0);
    }
    if (features.hasHistoryProvider && !this.historyProvider.get()) {
      const historyProvider = new MainThreadSCMHistoryProvider(this.proxy, this.handle);
      this._historyProvider.set(historyProvider, void 0);
    } else if (features.hasHistoryProvider === false && this.historyProvider.get()) {
      this._historyProvider.set(void 0, void 0);
    }
  }
  $registerGroups(_groups) {
    const groups = _groups.map(([handle, id, label, features, multiDiffEditorEnableViewChanges]) => {
      const group = new MainThreadSCMResourceGroup(
        this.handle,
        handle,
        this,
        features,
        label,
        id,
        multiDiffEditorEnableViewChanges,
        this._uriIdentService
      );
      this._groupsByHandle[handle] = group;
      return group;
    });
    this.groups.splice(this.groups.length, 0, ...groups);
    this._onDidChangeResourceGroups.fire();
  }
  $updateGroup(handle, features) {
    const group = this._groupsByHandle[handle];
    if (!group) {
      return;
    }
    group.$updateGroup(features);
  }
  $updateGroupLabel(handle, label) {
    const group = this._groupsByHandle[handle];
    if (!group) {
      return;
    }
    group.$updateGroupLabel(label);
  }
  $spliceGroupResourceStates(splices) {
    for (const [groupHandle, groupSlices] of splices) {
      const group = this._groupsByHandle[groupHandle];
      if (!group) {
        console.warn(`SCM group ${groupHandle} not found in provider ${this.label}`);
        continue;
      }
      groupSlices.reverse();
      for (const [start, deleteCount, rawResources] of groupSlices) {
        const resources = rawResources.map((rawResource) => {
          const [handle, sourceUri, icons, tooltip, strikeThrough, faded, contextValue, command, multiDiffEditorOriginalUri, multiDiffEditorModifiedUri] = rawResource;
          const [light, dark] = icons;
          const icon = ThemeIcon.isThemeIcon(light) ? light : URI.revive(light);
          const iconDark = (ThemeIcon.isThemeIcon(dark) ? dark : URI.revive(dark)) || icon;
          const decorations = {
            icon,
            iconDark,
            tooltip,
            strikeThrough,
            faded
          };
          return new MainThreadSCMResource(
            this.proxy,
            this.handle,
            groupHandle,
            handle,
            URI.revive(sourceUri),
            group,
            decorations,
            contextValue || void 0,
            command,
            URI.revive(multiDiffEditorOriginalUri),
            URI.revive(multiDiffEditorModifiedUri)
          );
        });
        group.splice(start, deleteCount, resources);
      }
    }
    this._onDidChangeResources.fire();
  }
  $unregisterGroup(handle) {
    const group = this._groupsByHandle[handle];
    if (!group) {
      return;
    }
    delete this._groupsByHandle[handle];
    this.groups.splice(this.groups.indexOf(group), 1);
    this._onDidChangeResourceGroups.fire();
  }
  async getOriginalResource(uri) {
    if (!this.features.hasQuickDiffProvider) {
      return null;
    }
    const result = await this.proxy.$provideOriginalResource(this.handle, uri, CancellationToken.None);
    return result && URI.revive(result);
  }
  $onDidChangeHistoryProviderCurrentHistoryItemRefs(historyItemRef, historyItemRemoteRef, historyItemBaseRef) {
    const provider = this.historyProvider.get();
    if (!provider) {
      return;
    }
    provider.$onDidChangeCurrentHistoryItemRefs(historyItemRef, historyItemRemoteRef, historyItemBaseRef);
  }
  $onDidChangeHistoryProviderHistoryItemRefs(historyItemRefs) {
    const provider = this.historyProvider.get();
    if (!provider) {
      return;
    }
    provider.$onDidChangeHistoryItemRefs(historyItemRefs);
  }
  $onDidChangeArtifacts(groups) {
    const provider = this.artifactProvider.get();
    if (!provider) {
      return;
    }
    provider.$onDidChangeArtifacts(groups);
  }
  toJSON() {
    return {
      $mid: MarshalledId.ScmProvider,
      handle: this.handle
    };
  }
  dispose() {
    this._onDidChangeResourceGroups.dispose();
    this._onDidChangeResources.dispose();
    this._artifactProvider.get()?.dispose();
    this._stagedQuickDiff?.dispose();
    this._quickDiff?.dispose();
  }
}
let MainThreadSCM = class {
  constructor(extHostContext, scmService, scmViewService, languageService, modelService, textModelService, quickDiffService, _uriIdentService, workspaceContextService) {
    this.scmService = scmService;
    this.scmViewService = scmViewService;
    this.languageService = languageService;
    this.modelService = modelService;
    this.textModelService = textModelService;
    this.quickDiffService = quickDiffService;
    this._uriIdentService = _uriIdentService;
    this.workspaceContextService = workspaceContextService;
    this._repositories = /* @__PURE__ */ new Map();
    this._repositoryBarriers = /* @__PURE__ */ new Map();
    this._repositoryDisposables = /* @__PURE__ */ new Map();
    this._disposables = new DisposableStore();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostSCM);
    this._disposables.add(new SCMInputBoxContentProvider(this.textModelService, this.modelService, this.languageService));
  }
  dispose() {
    dispose(this._repositories.values());
    this._repositories.clear();
    dispose(this._repositoryDisposables.values());
    this._repositoryDisposables.clear();
    this._disposables.dispose();
  }
  async $registerSourceControl(handle, parentHandle, id, label, rootUri, iconPath, isHidden, inputBoxDocumentUri) {
    this._repositoryBarriers.set(handle, new Barrier());
    const inputBoxTextModelRef = await this.textModelService.createModelReference(URI.revive(inputBoxDocumentUri));
    const provider = new MainThreadSCMProvider(this._proxy, handle, parentHandle, id, label, rootUri ? URI.revive(rootUri) : void 0, getIconFromIconDto(iconPath), isHidden, inputBoxTextModelRef.object.textEditorModel, this.quickDiffService, this._uriIdentService, this.workspaceContextService);
    const repository = this.scmService.registerSCMProvider(provider);
    this._repositories.set(handle, repository);
    const disposable = combinedDisposable(
      inputBoxTextModelRef,
      Event.filter(this.scmViewService.onDidFocusRepository, (r) => r === repository)((_) => this._proxy.$setSelectedSourceControl(handle)),
      repository.input.onDidChange(({ value }) => this._proxy.$onInputBoxValueChange(handle, value))
    );
    this._repositoryDisposables.set(handle, disposable);
    if (this.scmViewService.focusedRepository === repository) {
      setTimeout(() => this._proxy.$setSelectedSourceControl(handle), 0);
    }
    if (repository.input.value) {
      setTimeout(() => this._proxy.$onInputBoxValueChange(handle, repository.input.value), 0);
    }
    this._repositoryBarriers.get(handle)?.open();
  }
  async $updateSourceControl(handle, features) {
    await this._repositoryBarriers.get(handle)?.wait();
    const repository = this._repositories.get(handle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$updateSourceControl(features);
  }
  async $unregisterSourceControl(handle) {
    await this._repositoryBarriers.get(handle)?.wait();
    const repository = this._repositories.get(handle);
    if (!repository) {
      return;
    }
    this._repositoryDisposables.get(handle).dispose();
    this._repositoryDisposables.delete(handle);
    repository.dispose();
    this._repositories.delete(handle);
  }
  async $registerGroups(sourceControlHandle, groups, splices) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$registerGroups(groups);
    provider.$spliceGroupResourceStates(splices);
  }
  async $updateGroup(sourceControlHandle, groupHandle, features) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$updateGroup(groupHandle, features);
  }
  async $updateGroupLabel(sourceControlHandle, groupHandle, label) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$updateGroupLabel(groupHandle, label);
  }
  async $spliceResourceStates(sourceControlHandle, splices) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$spliceGroupResourceStates(splices);
  }
  async $unregisterGroup(sourceControlHandle, handle) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$unregisterGroup(handle);
  }
  async $setInputBoxValue(sourceControlHandle, value) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.setValue(value, false);
  }
  async $setInputBoxPlaceholder(sourceControlHandle, placeholder) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.placeholder = placeholder;
  }
  async $setInputBoxEnablement(sourceControlHandle, enabled) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.enabled = enabled;
  }
  async $setInputBoxVisibility(sourceControlHandle, visible) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.visible = visible;
  }
  async $showValidationMessage(sourceControlHandle, message, type) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    repository.input.showValidationMessage(message, type);
  }
  async $setValidationProviderIsEnabled(sourceControlHandle, enabled) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    if (enabled) {
      repository.input.validateInput = async (value, pos) => {
        const result = await this._proxy.$validateInput(sourceControlHandle, value, pos);
        return result && { message: result[0], type: result[1] };
      };
    } else {
      repository.input.validateInput = async () => void 0;
    }
  }
  async $onDidChangeHistoryProviderCurrentHistoryItemRefs(sourceControlHandle, historyItemRef, historyItemRemoteRef, historyItemBaseRef) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$onDidChangeHistoryProviderCurrentHistoryItemRefs(historyItemRef, historyItemRemoteRef, historyItemBaseRef);
  }
  async $onDidChangeHistoryProviderHistoryItemRefs(sourceControlHandle, historyItemRefs) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$onDidChangeHistoryProviderHistoryItemRefs(historyItemRefs);
  }
  async $onDidChangeArtifacts(sourceControlHandle, groups) {
    await this._repositoryBarriers.get(sourceControlHandle)?.wait();
    const repository = this._repositories.get(sourceControlHandle);
    if (!repository) {
      return;
    }
    const provider = repository.provider;
    provider.$onDidChangeArtifacts(groups);
  }
};
MainThreadSCM = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadSCM),
  __decorateParam(1, ISCMService),
  __decorateParam(2, ISCMViewService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IModelService),
  __decorateParam(5, ITextModelService),
  __decorateParam(6, IQuickDiffService),
  __decorateParam(7, IUriIdentityService),
  __decorateParam(8, IWorkspaceContextService)
], MainThreadSCM);
export {
  MainThreadSCM
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZFNDTS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJhcnJpZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpc1VyaUNvbXBvbmVudHMsIFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIG9ic2VydmFibGVWYWx1ZU9wdHMsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBjb21iaW5lZERpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVNDTVNlcnZpY2UsIElTQ01SZXBvc2l0b3J5LCBJU0NNUHJvdmlkZXIsIElTQ01SZXNvdXJjZSwgSVNDTVJlc291cmNlR3JvdXAsIElTQ01SZXNvdXJjZURlY29yYXRpb25zLCBJSW5wdXRWYWxpZGF0aW9uLCBJU0NNVmlld1NlcnZpY2UsIElucHV0VmFsaWRhdGlvblR5cGUsIElTQ01BY3Rpb25CdXR0b25EZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vY29udHJpYi9zY20vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29udGV4dCwgTWFpblRocmVhZFNDTVNoYXBlLCBFeHRIb3N0U0NNU2hhcGUsIFNDTVByb3ZpZGVyRmVhdHVyZXMsIFNDTVJhd1Jlc291cmNlU3BsaWNlcywgU0NNR3JvdXBGZWF0dXJlcywgTWFpbkNvbnRleHQsIFNDTUhpc3RvcnlJdGVtRHRvLCBTQ01IaXN0b3J5SXRlbVJlZnNDaGFuZ2VFdmVudER0bywgU0NNSGlzdG9yeUl0ZW1SZWZEdG8gfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElRdWlja0RpZmZTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9zY20vY29tbW9uL3F1aWNrRGlmZi5qcyc7XG5pbXBvcnQgeyBJU0NNSGlzdG9yeUl0ZW0sIElTQ01IaXN0b3J5SXRlbUNoYW5nZSwgSVNDTUhpc3RvcnlJdGVtUmVmLCBJU0NNSGlzdG9yeUl0ZW1SZWZzQ2hhbmdlRXZlbnQsIElTQ01IaXN0b3J5T3B0aW9ucywgSVNDTUhpc3RvcnlQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc2NtL2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IFJlc291cmNlVHJlZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlVHJlZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgaGlzdG9yeUl0ZW1CYXNlUmVmQ29sb3IsIGhpc3RvcnlJdGVtUmVmQ29sb3IsIGhpc3RvcnlJdGVtUmVtb3RlUmVmQ29sb3IgfSBmcm9tICcuLi8uLi9jb250cmliL3NjbS9icm93c2VyL3NjbUhpc3RvcnkuanMnO1xuaW1wb3J0IHsgQ29sb3JJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgSVNDTUFydGlmYWN0LCBJU0NNQXJ0aWZhY3RHcm91cCwgSVNDTUFydGlmYWN0UHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb250cmliL3NjbS9jb21tb24vYXJ0aWZhY3QuanMnO1xuXG5mdW5jdGlvbiBnZXRJY29uRnJvbUljb25EdG8oaWNvbkR0bz86IFVyaUNvbXBvbmVudHMgfCB7IGxpZ2h0OiBVcmlDb21wb25lbnRzOyBkYXJrOiBVcmlDb21wb25lbnRzIH0gfCBUaGVtZUljb24pOiBVUkkgfCB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9IHwgVGhlbWVJY29uIHwgdW5kZWZpbmVkIHtcblx0aWYgKGljb25EdG8gPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH0gZWxzZSBpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb25EdG8pKSB7XG5cdFx0cmV0dXJuIGljb25EdG87XG5cdH0gZWxzZSBpZiAoaXNVcmlDb21wb25lbnRzKGljb25EdG8pKSB7XG5cdFx0cmV0dXJuIFVSSS5yZXZpdmUoaWNvbkR0byk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgaWNvbiA9IGljb25EdG8gYXMgeyBsaWdodDogVXJpQ29tcG9uZW50czsgZGFyazogVXJpQ29tcG9uZW50cyB9O1xuXHRcdHJldHVybiB7IGxpZ2h0OiBVUkkucmV2aXZlKGljb24ubGlnaHQpLCBkYXJrOiBVUkkucmV2aXZlKGljb24uZGFyaykgfTtcblx0fVxufVxuXG5mdW5jdGlvbiB0b0lTQ01IaXN0b3J5SXRlbShoaXN0b3J5SXRlbUR0bzogU0NNSGlzdG9yeUl0ZW1EdG8pOiBJU0NNSGlzdG9yeUl0ZW0ge1xuXHRjb25zdCBhdXRob3JJY29uID0gZ2V0SWNvbkZyb21JY29uRHRvKGhpc3RvcnlJdGVtRHRvLmF1dGhvckljb24pO1xuXG5cdGNvbnN0IHJlZmVyZW5jZXMgPSBoaXN0b3J5SXRlbUR0by5yZWZlcmVuY2VzPy5tYXAociA9PiAoe1xuXHRcdC4uLnIsIGljb246IGdldEljb25Gcm9tSWNvbkR0byhyLmljb24pXG5cdH0pKTtcblxuXHRyZXR1cm4geyAuLi5oaXN0b3J5SXRlbUR0bywgYXV0aG9ySWNvbiwgcmVmZXJlbmNlcyB9O1xufVxuXG5mdW5jdGlvbiB0b0lTQ01IaXN0b3J5SXRlbVJlZihoaXN0b3J5SXRlbVJlZkR0bz86IFNDTUhpc3RvcnlJdGVtUmVmRHRvLCBjb2xvcj86IENvbG9ySWRlbnRpZmllcik6IElTQ01IaXN0b3J5SXRlbVJlZiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBoaXN0b3J5SXRlbVJlZkR0byA/IHsgLi4uaGlzdG9yeUl0ZW1SZWZEdG8sIGljb246IGdldEljb25Gcm9tSWNvbkR0byhoaXN0b3J5SXRlbVJlZkR0by5pY29uKSwgY29sb3I6IGNvbG9yIH0gOiB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIFNDTUlucHV0Qm94Q29udGVudFByb3ZpZGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHR0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0ZXh0TW9kZWxTZXJ2aWNlLnJlZ2lzdGVyVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKFNjaGVtYXMudnNjb2RlU291cmNlQ29udHJvbCwgdGhpcykpO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZVRleHRDb250ZW50KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElUZXh0TW9kZWwgfCBudWxsPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgdGhpcy5sYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZCgnc2NtaW5wdXQnKSwgcmVzb3VyY2UpO1xuXHR9XG59XG5cbmNsYXNzIE1haW5UaHJlYWRTQ01SZXNvdXJjZUdyb3VwIGltcGxlbWVudHMgSVNDTVJlc291cmNlR3JvdXAge1xuXG5cdHJlYWRvbmx5IHJlc291cmNlczogSVNDTVJlc291cmNlW10gPSBbXTtcblxuXHRwcml2YXRlIF9yZXNvdXJjZVRyZWU6IFJlc291cmNlVHJlZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPiB8IHVuZGVmaW5lZDtcblx0Z2V0IHJlc291cmNlVHJlZSgpOiBSZXNvdXJjZVRyZWU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD4ge1xuXHRcdGlmICghdGhpcy5fcmVzb3VyY2VUcmVlKSB7XG5cdFx0XHRjb25zdCByb290VXJpID0gdGhpcy5wcm92aWRlci5yb290VXJpID8/IFVSSS5maWxlKCcvJyk7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZVRyZWUgPSBuZXcgUmVzb3VyY2VUcmVlPElTQ01SZXNvdXJjZSwgSVNDTVJlc291cmNlR3JvdXA+KHRoaXMsIHJvb3RVcmksIHRoaXMuX3VyaUlkZW50U2VydmljZS5leHRVcmkpO1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiB0aGlzLnJlc291cmNlcykge1xuXHRcdFx0XHR0aGlzLl9yZXNvdXJjZVRyZWUuYWRkKHJlc291cmNlLnNvdXJjZVVyaSwgcmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZXNvdXJjZVRyZWU7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVzb3VyY2VzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZXNvdXJjZXMgPSB0aGlzLl9vbkRpZENoYW5nZVJlc291cmNlcy5ldmVudDtcblxuXHRnZXQgaGlkZVdoZW5FbXB0eSgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5mZWF0dXJlcy5oaWRlV2hlbkVtcHR5OyB9XG5cblx0Z2V0IGNvbnRleHRWYWx1ZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5mZWF0dXJlcy5jb250ZXh0VmFsdWU7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhhbmRsZTogbnVtYmVyLFxuXHRcdHB1YmxpYyBwcm92aWRlcjogSVNDTVByb3ZpZGVyLFxuXHRcdHB1YmxpYyBmZWF0dXJlczogU0NNR3JvdXBGZWF0dXJlcyxcblx0XHRwdWJsaWMgbGFiZWw6IHN0cmluZyxcblx0XHRwdWJsaWMgaWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbXVsdGlEaWZmRWRpdG9yRW5hYmxlVmlld0NoYW5nZXM6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlXG5cdCkgeyB9XG5cblx0dG9KU09OKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuU2NtUmVzb3VyY2VHcm91cCxcblx0XHRcdHNvdXJjZUNvbnRyb2xIYW5kbGU6IHRoaXMuc291cmNlQ29udHJvbEhhbmRsZSxcblx0XHRcdGdyb3VwSGFuZGxlOiB0aGlzLmhhbmRsZVxuXHRcdH07XG5cdH1cblxuXHRzcGxpY2Uoc3RhcnQ6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlciwgdG9JbnNlcnQ6IElTQ01SZXNvdXJjZVtdKSB7XG5cdFx0dGhpcy5yZXNvdXJjZXMuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgLi4udG9JbnNlcnQpO1xuXHRcdHRoaXMuX3Jlc291cmNlVHJlZSA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVzb3VyY2VzLmZpcmUoKTtcblx0fVxuXG5cdCR1cGRhdGVHcm91cChmZWF0dXJlczogU0NNR3JvdXBGZWF0dXJlcyk6IHZvaWQge1xuXHRcdHRoaXMuZmVhdHVyZXMgPSB7IC4uLnRoaXMuZmVhdHVyZXMsIC4uLmZlYXR1cmVzIH07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0JHVwZGF0ZUdyb3VwTGFiZWwobGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cbn1cblxuY2xhc3MgTWFpblRocmVhZFNDTVJlc291cmNlIGltcGxlbWVudHMgSVNDTVJlc291cmNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb3h5OiBFeHRIb3N0U0NNU2hhcGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBncm91cEhhbmRsZTogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaGFuZGxlOiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgc291cmNlVXJpOiBVUkksXG5cdFx0cmVhZG9ubHkgcmVzb3VyY2VHcm91cDogSVNDTVJlc291cmNlR3JvdXAsXG5cdFx0cmVhZG9ubHkgZGVjb3JhdGlvbnM6IElTQ01SZXNvdXJjZURlY29yYXRpb25zLFxuXHRcdHJlYWRvbmx5IGNvbnRleHRWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGNvbW1hbmQ6IENvbW1hbmQgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgbXVsdGlEaWZmRWRpdG9yT3JpZ2luYWxVcmk6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSBtdWx0aURpZmZFZGl0b3JNb2RpZmllZFVyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHQpIHsgfVxuXG5cdG9wZW4ocHJlc2VydmVGb2N1czogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnByb3h5LiRleGVjdXRlUmVzb3VyY2VDb21tYW5kKHRoaXMuc291cmNlQ29udHJvbEhhbmRsZSwgdGhpcy5ncm91cEhhbmRsZSwgdGhpcy5oYW5kbGUsIHByZXNlcnZlRm9jdXMpO1xuXHR9XG5cblx0dG9KU09OKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuU2NtUmVzb3VyY2UsXG5cdFx0XHRzb3VyY2VDb250cm9sSGFuZGxlOiB0aGlzLnNvdXJjZUNvbnRyb2xIYW5kbGUsXG5cdFx0XHRncm91cEhhbmRsZTogdGhpcy5ncm91cEhhbmRsZSxcblx0XHRcdGhhbmRsZTogdGhpcy5oYW5kbGVcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIE1haW5UaHJlYWRTQ01BcnRpZmFjdFByb3ZpZGVyIGltcGxlbWVudHMgSVNDTUFydGlmYWN0UHJvdmlkZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFydGlmYWN0cyA9IG5ldyBFbWl0dGVyPHN0cmluZ1tdPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFydGlmYWN0cyA9IHRoaXMuX29uRGlkQ2hhbmdlQXJ0aWZhY3RzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgcHJveHk6IEV4dEhvc3RTQ01TaGFwZSwgcHJpdmF0ZSByZWFkb25seSBoYW5kbGU6IG51bWJlcikge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9vbkRpZENoYW5nZUFydGlmYWN0cyk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlQXJ0aWZhY3RHcm91cHModG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNDTUFydGlmYWN0R3JvdXBbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGFydGlmYWN0R3JvdXBzID0gYXdhaXQgdGhpcy5wcm94eS4kcHJvdmlkZUFydGlmYWN0R3JvdXBzKHRoaXMuaGFuZGxlLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gYXJ0aWZhY3RHcm91cHM/Lm1hcChncm91cCA9PiAoeyAuLi5ncm91cCwgaWNvbjogZ2V0SWNvbkZyb21JY29uRHRvKGdyb3VwLmljb24pIH0pKTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVBcnRpZmFjdHMoZ3JvdXA6IHN0cmluZywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNDTUFydGlmYWN0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcnRpZmFjdHMgPSBhd2FpdCB0aGlzLnByb3h5LiRwcm92aWRlQXJ0aWZhY3RzKHRoaXMuaGFuZGxlLCBncm91cCwgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0cmV0dXJuIGFydGlmYWN0cz8ubWFwKGFydGlmYWN0ID0+ICh7IC4uLmFydGlmYWN0LCBpY29uOiBnZXRJY29uRnJvbUljb25EdG8oYXJ0aWZhY3QuaWNvbikgfSkpO1xuXHR9XG5cblx0JG9uRGlkQ2hhbmdlQXJ0aWZhY3RzKGdyb3Vwczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFydGlmYWN0cy5maXJlKGdyb3Vwcyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBNYWluVGhyZWFkU0NNSGlzdG9yeVByb3ZpZGVyIGltcGxlbWVudHMgSVNDTUhpc3RvcnlQcm92aWRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlJdGVtUmVmID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxJU0NNSGlzdG9yeUl0ZW1SZWYgfCB1bmRlZmluZWQ+KHtcblx0XHRvd25lcjogdGhpcyxcblx0XHRlcXVhbHNGbjogc3RydWN0dXJhbEVxdWFsc1xuXHR9LCB1bmRlZmluZWQpO1xuXHRnZXQgaGlzdG9yeUl0ZW1SZWYoKTogSU9ic2VydmFibGU8SVNDTUhpc3RvcnlJdGVtUmVmIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9oaXN0b3J5SXRlbVJlZjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlJdGVtUmVtb3RlUmVmID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxJU0NNSGlzdG9yeUl0ZW1SZWYgfCB1bmRlZmluZWQ+KHtcblx0XHRvd25lcjogdGhpcyxcblx0XHRlcXVhbHNGbjogc3RydWN0dXJhbEVxdWFsc1xuXHR9LCB1bmRlZmluZWQpO1xuXHRnZXQgaGlzdG9yeUl0ZW1SZW1vdGVSZWYoKTogSU9ic2VydmFibGU8SVNDTUhpc3RvcnlJdGVtUmVmIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9oaXN0b3J5SXRlbVJlbW90ZVJlZjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlJdGVtQmFzZVJlZiA9IG9ic2VydmFibGVWYWx1ZU9wdHM8SVNDTUhpc3RvcnlJdGVtUmVmIHwgdW5kZWZpbmVkPih7XG5cdFx0b3duZXI6IHRoaXMsXG5cdFx0ZXF1YWxzRm46IHN0cnVjdHVyYWxFcXVhbHNcblx0fSwgdW5kZWZpbmVkKTtcblx0Z2V0IGhpc3RvcnlJdGVtQmFzZVJlZigpOiBJT2JzZXJ2YWJsZTxJU0NNSGlzdG9yeUl0ZW1SZWYgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX2hpc3RvcnlJdGVtQmFzZVJlZjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlJdGVtUmVmQ2hhbmdlcyA9IG9ic2VydmFibGVWYWx1ZTxJU0NNSGlzdG9yeUl0ZW1SZWZzQ2hhbmdlRXZlbnQ+KHRoaXMsIHsgYWRkZWQ6IFtdLCBtb2RpZmllZDogW10sIHJlbW92ZWQ6IFtdLCBzaWxlbnQ6IGZhbHNlIH0pO1xuXHRnZXQgaGlzdG9yeUl0ZW1SZWZDaGFuZ2VzKCk6IElPYnNlcnZhYmxlPElTQ01IaXN0b3J5SXRlbVJlZnNDaGFuZ2VFdmVudD4geyByZXR1cm4gdGhpcy5faGlzdG9yeUl0ZW1SZWZDaGFuZ2VzOyB9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBwcm94eTogRXh0SG9zdFNDTVNoYXBlLCBwcml2YXRlIHJlYWRvbmx5IGhhbmRsZTogbnVtYmVyKSB7IH1cblxuXHRhc3luYyByZXNvbHZlSGlzdG9yeUl0ZW0oaGlzdG9yeUl0ZW1JZDogc3RyaW5nLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU0NNSGlzdG9yeUl0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGF3YWl0IHRoaXMucHJveHkuJHJlc29sdmVIaXN0b3J5SXRlbSh0aGlzLmhhbmRsZSwgaGlzdG9yeUl0ZW1JZCwgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0cmV0dXJuIGhpc3RvcnlJdGVtID8gdG9JU0NNSGlzdG9yeUl0ZW0oaGlzdG9yeUl0ZW0pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUhpc3RvcnlJdGVtQ2hhdENvbnRleHQoaGlzdG9yeUl0ZW1JZDogc3RyaW5nLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm94eS4kcmVzb2x2ZUhpc3RvcnlJdGVtQ2hhdENvbnRleHQodGhpcy5oYW5kbGUsIGhpc3RvcnlJdGVtSWQsIHRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VDaGF0Q29udGV4dChoaXN0b3J5SXRlbUlkOiBzdHJpbmcsIGhpc3RvcnlJdGVtUGFyZW50SWQ6IHN0cmluZywgcGF0aDogc3RyaW5nLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm94eS4kcmVzb2x2ZUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VDaGF0Q29udGV4dCh0aGlzLmhhbmRsZSwgaGlzdG9yeUl0ZW1JZCwgaGlzdG9yeUl0ZW1QYXJlbnRJZCwgcGF0aCwgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlSGlzdG9yeUl0ZW1SZWZzQ29tbW9uQW5jZXN0b3IoaGlzdG9yeUl0ZW1SZWZzOiBzdHJpbmdbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5wcm94eS4kcmVzb2x2ZUhpc3RvcnlJdGVtUmVmc0NvbW1vbkFuY2VzdG9yKHRoaXMuaGFuZGxlLCBoaXN0b3J5SXRlbVJlZnMsIHRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUhpc3RvcnlJdGVtUmVmcyhoaXN0b3J5SXRlbXNSZWZzPzogc3RyaW5nW10sIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTQ01IaXN0b3J5SXRlbVJlZltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWZzID0gYXdhaXQgdGhpcy5wcm94eS4kcHJvdmlkZUhpc3RvcnlJdGVtUmVmcyh0aGlzLmhhbmRsZSwgaGlzdG9yeUl0ZW1zUmVmcywgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0cmV0dXJuIGhpc3RvcnlJdGVtUmVmcz8ubWFwKHJlZiA9PiAoeyAuLi5yZWYsIGljb246IGdldEljb25Gcm9tSWNvbkR0byhyZWYuaWNvbikgfSkpO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUhpc3RvcnlJdGVtcyhvcHRpb25zOiBJU0NNSGlzdG9yeU9wdGlvbnMsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTQ01IaXN0b3J5SXRlbVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1zID0gYXdhaXQgdGhpcy5wcm94eS4kcHJvdmlkZUhpc3RvcnlJdGVtcyh0aGlzLmhhbmRsZSwgb3B0aW9ucywgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0cmV0dXJuIGhpc3RvcnlJdGVtcz8ubWFwKGhpc3RvcnlJdGVtID0+IHRvSVNDTUhpc3RvcnlJdGVtKGhpc3RvcnlJdGVtKSk7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlSGlzdG9yeUl0ZW1DaGFuZ2VzKGhpc3RvcnlJdGVtSWQ6IHN0cmluZywgaGlzdG9yeUl0ZW1QYXJlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNoYW5nZXMgPSBhd2FpdCB0aGlzLnByb3h5LiRwcm92aWRlSGlzdG9yeUl0ZW1DaGFuZ2VzKHRoaXMuaGFuZGxlLCBoaXN0b3J5SXRlbUlkLCBoaXN0b3J5SXRlbVBhcmVudElkLCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gY2hhbmdlcz8ubWFwKGNoYW5nZSA9PiAoe1xuXHRcdFx0dXJpOiBVUkkucmV2aXZlKGNoYW5nZS51cmkpLFxuXHRcdFx0b3JpZ2luYWxVcmk6IGNoYW5nZS5vcmlnaW5hbFVyaSAmJiBVUkkucmV2aXZlKGNoYW5nZS5vcmlnaW5hbFVyaSksXG5cdFx0XHRtb2RpZmllZFVyaTogY2hhbmdlLm1vZGlmaWVkVXJpICYmIFVSSS5yZXZpdmUoY2hhbmdlLm1vZGlmaWVkVXJpKVxuXHRcdH0pKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZUN1cnJlbnRIaXN0b3J5SXRlbVJlZnMoaGlzdG9yeUl0ZW1SZWY/OiBTQ01IaXN0b3J5SXRlbVJlZkR0bywgaGlzdG9yeUl0ZW1SZW1vdGVSZWY/OiBTQ01IaXN0b3J5SXRlbVJlZkR0bywgaGlzdG9yeUl0ZW1CYXNlUmVmPzogU0NNSGlzdG9yeUl0ZW1SZWZEdG8pOiB2b2lkIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9oaXN0b3J5SXRlbVJlZi5zZXQodG9JU0NNSGlzdG9yeUl0ZW1SZWYoaGlzdG9yeUl0ZW1SZWYsIGhpc3RvcnlJdGVtUmVmQ29sb3IpLCB0eCk7XG5cdFx0XHR0aGlzLl9oaXN0b3J5SXRlbVJlbW90ZVJlZi5zZXQodG9JU0NNSGlzdG9yeUl0ZW1SZWYoaGlzdG9yeUl0ZW1SZW1vdGVSZWYsIGhpc3RvcnlJdGVtUmVtb3RlUmVmQ29sb3IpLCB0eCk7XG5cdFx0XHR0aGlzLl9oaXN0b3J5SXRlbUJhc2VSZWYuc2V0KHRvSVNDTUhpc3RvcnlJdGVtUmVmKGhpc3RvcnlJdGVtQmFzZVJlZiwgaGlzdG9yeUl0ZW1CYXNlUmVmQ29sb3IpLCB0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VIaXN0b3J5SXRlbVJlZnMoaGlzdG9yeUl0ZW1SZWZzOiBTQ01IaXN0b3J5SXRlbVJlZnNDaGFuZ2VFdmVudER0byk6IHZvaWQge1xuXHRcdGNvbnN0IGFkZGVkID0gaGlzdG9yeUl0ZW1SZWZzLmFkZGVkLm1hcChyZWYgPT4gdG9JU0NNSGlzdG9yeUl0ZW1SZWYocmVmKSEpO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gaGlzdG9yeUl0ZW1SZWZzLm1vZGlmaWVkLm1hcChyZWYgPT4gdG9JU0NNSGlzdG9yeUl0ZW1SZWYocmVmKSEpO1xuXHRcdGNvbnN0IHJlbW92ZWQgPSBoaXN0b3J5SXRlbVJlZnMucmVtb3ZlZC5tYXAocmVmID0+IHRvSVNDTUhpc3RvcnlJdGVtUmVmKHJlZikhKTtcblxuXHRcdHRoaXMuX2hpc3RvcnlJdGVtUmVmQ2hhbmdlcy5zZXQoeyBhZGRlZCwgbW9kaWZpZWQsIHJlbW92ZWQsIHNpbGVudDogaGlzdG9yeUl0ZW1SZWZzLnNpbGVudCB9LCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbmNsYXNzIE1haW5UaHJlYWRTQ01Qcm92aWRlciBpbXBsZW1lbnRzIElTQ01Qcm92aWRlciB7XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7IHJldHVybiBgc2NtJHt0aGlzLl9oYW5kbGV9YDsgfVxuXHRnZXQgcGFyZW50SWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcGFyZW50SGFuZGxlICE9PSB1bmRlZmluZWRcblx0XHRcdD8gYHNjbSR7dGhpcy5fcGFyZW50SGFuZGxlfWBcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cdGdldCBwcm92aWRlcklkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9wcm92aWRlcklkOyB9XG5cblx0cmVhZG9ubHkgZ3JvdXBzOiBNYWluVGhyZWFkU0NNUmVzb3VyY2VHcm91cFtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlc291cmNlR3JvdXBzID0gdGhpcy5fb25EaWRDaGFuZ2VSZXNvdXJjZUdyb3Vwcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVJlc291cmNlcyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVzb3VyY2VzID0gdGhpcy5fb25EaWRDaGFuZ2VSZXNvdXJjZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZ3JvdXBzQnlIYW5kbGU6IHsgW2hhbmRsZTogbnVtYmVyXTogTWFpblRocmVhZFNDTVJlc291cmNlR3JvdXAgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0Ly8gZ2V0IGdyb3VwcygpOiBJU2VxdWVuY2U8SVNDTVJlc291cmNlR3JvdXA+IHtcblx0Ly8gXHRyZXR1cm4ge1xuXHQvLyBcdFx0ZWxlbWVudHM6IHRoaXMuX2dyb3Vwcyxcblx0Ly8gXHRcdG9uRGlkU3BsaWNlOiB0aGlzLl9vbkRpZFNwbGljZS5ldmVudFxuXHQvLyBcdH07XG5cblx0Ly8gXHQvLyByZXR1cm4gdGhpcy5fZ3JvdXBzXG5cdC8vIFx0Ly8gXHQuZmlsdGVyKGcgPT4gZy5yZXNvdXJjZXMuZWxlbWVudHMubGVuZ3RoID4gMCB8fCAhZy5mZWF0dXJlcy5oaWRlV2hlbkVtcHR5KTtcblx0Ly8gfVxuXG5cblx0cHJpdmF0ZSBmZWF0dXJlczogU0NNUHJvdmlkZXJGZWF0dXJlcyA9IHt9O1xuXG5cdGdldCBoYW5kbGUoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX2hhbmRsZTsgfVxuXHRnZXQgbGFiZWwoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX2xhYmVsOyB9XG5cdGdldCByb290VXJpKCk6IFVSSSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9yb290VXJpOyB9XG5cdGdldCBpY29uUGF0aCgpOiBVUkkgfCB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9IHwgVGhlbWVJY29uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2ljb25QYXRoOyB9XG5cdGdldCBpc0hpZGRlbigpOiBib29sZWFuIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2lzSGlkZGVuOyB9XG5cdGdldCBpbnB1dEJveFRleHRNb2RlbCgpOiBJVGV4dE1vZGVsIHsgcmV0dXJuIHRoaXMuX2lucHV0Qm94VGV4dE1vZGVsOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dFZhbHVlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0Z2V0IGNvbnRleHRWYWx1ZSgpOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX2NvbnRleHRWYWx1ZTsgfVxuXG5cdGdldCBhY2NlcHRJbnB1dENvbW1hbmQoKTogQ29tbWFuZCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLmZlYXR1cmVzLmFjY2VwdElucHV0Q29tbWFuZDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvdW50ID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlciB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0Z2V0IGNvdW50KCkgeyByZXR1cm4gdGhpcy5fY291bnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXNCYXJDb21tYW5kcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBDb21tYW5kW10gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdGdldCBzdGF0dXNCYXJDb21tYW5kcygpIHsgcmV0dXJuIHRoaXMuX3N0YXR1c0JhckNvbW1hbmRzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgbmFtZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fbmFtZSA/PyB0aGlzLl9sYWJlbDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1pdFRlbXBsYXRlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZz4odGhpcywgJycpO1xuXHRnZXQgY29tbWl0VGVtcGxhdGUoKSB7IHJldHVybiB0aGlzLl9jb21taXRUZW1wbGF0ZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbkJ1dHRvbiA9IG9ic2VydmFibGVWYWx1ZTxJU0NNQWN0aW9uQnV0dG9uRGVzY3JpcHRvciB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0Z2V0IGFjdGlvbkJ1dHRvbigpOiBJT2JzZXJ2YWJsZTxJU0NNQWN0aW9uQnV0dG9uRGVzY3JpcHRvciB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fYWN0aW9uQnV0dG9uOyB9XG5cblx0cHJpdmF0ZSBfcXVpY2tEaWZmOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc3RhZ2VkUXVpY2tEaWZmOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hcnRpZmFjdFByb3ZpZGVyID0gb2JzZXJ2YWJsZVZhbHVlPE1haW5UaHJlYWRTQ01BcnRpZmFjdFByb3ZpZGVyIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRnZXQgYXJ0aWZhY3RQcm92aWRlcigpIHsgcmV0dXJuIHRoaXMuX2FydGlmYWN0UHJvdmlkZXI7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oaXN0b3J5UHJvdmlkZXIgPSBvYnNlcnZhYmxlVmFsdWU8TWFpblRocmVhZFNDTUhpc3RvcnlQcm92aWRlciB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0Z2V0IGhpc3RvcnlQcm92aWRlcigpIHsgcmV0dXJuIHRoaXMuX2hpc3RvcnlQcm92aWRlcjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJveHk6IEV4dEhvc3RTQ01TaGFwZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGU6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wYXJlbnRIYW5kbGU6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcklkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWw6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yb290VXJpOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaWNvblBhdGg6IFVSSSB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCBUaGVtZUljb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNIaWRkZW46IGJvb2xlYW4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRCb3hUZXh0TW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcXVpY2tEaWZmU2VydmljZTogSVF1aWNrRGlmZlNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Vcblx0KSB7XG5cdFx0aWYgKF9yb290VXJpKSB7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoX3Jvb3RVcmkpO1xuXHRcdFx0aWYgKGZvbGRlcj8udXJpLnRvU3RyaW5nKCkgPT09IF9yb290VXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0dGhpcy5fbmFtZSA9IGZvbGRlci5uYW1lO1xuXHRcdFx0fSBlbHNlIGlmIChfcm9vdFVyaS5wYXRoICE9PSAnLycpIHtcblx0XHRcdFx0dGhpcy5fbmFtZSA9IGJhc2VuYW1lKF9yb290VXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQkdXBkYXRlU291cmNlQ29udHJvbChmZWF0dXJlczogU0NNUHJvdmlkZXJGZWF0dXJlcyk6IHZvaWQge1xuXHRcdHRoaXMuZmVhdHVyZXMgPSB7IC4uLnRoaXMuZmVhdHVyZXMsIC4uLmZlYXR1cmVzIH07XG5cblx0XHRpZiAodHlwZW9mIGZlYXR1cmVzLmNvbW1pdFRlbXBsYXRlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fY29tbWl0VGVtcGxhdGUuc2V0KGZlYXR1cmVzLmNvbW1pdFRlbXBsYXRlLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgZmVhdHVyZXMuYWN0aW9uQnV0dG9uICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fYWN0aW9uQnV0dG9uLnNldChmZWF0dXJlcy5hY3Rpb25CdXR0b24gPz8gdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgZmVhdHVyZXMuY29udGV4dFZhbHVlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fY29udGV4dFZhbHVlLnNldChmZWF0dXJlcy5jb250ZXh0VmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBmZWF0dXJlcy5jb3VudCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuX2NvdW50LnNldChmZWF0dXJlcy5jb3VudCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGZlYXR1cmVzLnN0YXR1c0JhckNvbW1hbmRzICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fc3RhdHVzQmFyQ29tbWFuZHMuc2V0KGZlYXR1cmVzLnN0YXR1c0JhckNvbW1hbmRzLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmIChmZWF0dXJlcy5oYXNRdWlja0RpZmZQcm92aWRlciAmJiAhdGhpcy5fcXVpY2tEaWZmKSB7XG5cdFx0XHR0aGlzLl9xdWlja0RpZmYgPSB0aGlzLl9xdWlja0RpZmZTZXJ2aWNlLmFkZFF1aWNrRGlmZlByb3ZpZGVyKHtcblx0XHRcdFx0aWQ6IGAke3RoaXMuX3Byb3ZpZGVySWR9LnF1aWNrRGlmZlByb3ZpZGVyYCxcblx0XHRcdFx0bGFiZWw6IGZlYXR1cmVzLnF1aWNrRGlmZkxhYmVsID8/IHRoaXMubGFiZWwsXG5cdFx0XHRcdHJvb3RVcmk6IHRoaXMucm9vdFVyaSxcblx0XHRcdFx0a2luZDogJ3ByaW1hcnknLFxuXHRcdFx0XHRnZXRPcmlnaW5hbFJlc291cmNlOiBhc3luYyAodXJpOiBVUkkpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuZmVhdHVyZXMuaGFzUXVpY2tEaWZmUHJvdmlkZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucHJveHkuJHByb3ZpZGVPcmlnaW5hbFJlc291cmNlKHRoaXMuaGFuZGxlLCB1cmksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQgJiYgVVJJLnJldml2ZShyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKGZlYXR1cmVzLmhhc1F1aWNrRGlmZlByb3ZpZGVyID09PSBmYWxzZSAmJiB0aGlzLl9xdWlja0RpZmYpIHtcblx0XHRcdHRoaXMuX3F1aWNrRGlmZi5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9xdWlja0RpZmYgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGZlYXR1cmVzLmhhc1NlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyICYmICF0aGlzLl9zdGFnZWRRdWlja0RpZmYpIHtcblx0XHRcdHRoaXMuX3N0YWdlZFF1aWNrRGlmZiA9IHRoaXMuX3F1aWNrRGlmZlNlcnZpY2UuYWRkUXVpY2tEaWZmUHJvdmlkZXIoe1xuXHRcdFx0XHRpZDogYCR7dGhpcy5fcHJvdmlkZXJJZH0uc2Vjb25kYXJ5UXVpY2tEaWZmUHJvdmlkZXJgLFxuXHRcdFx0XHRsYWJlbDogZmVhdHVyZXMuc2Vjb25kYXJ5UXVpY2tEaWZmTGFiZWwgPz8gdGhpcy5sYWJlbCxcblx0XHRcdFx0cm9vdFVyaTogdGhpcy5yb290VXJpLFxuXHRcdFx0XHRraW5kOiAnc2Vjb25kYXJ5Jyxcblx0XHRcdFx0Z2V0T3JpZ2luYWxSZXNvdXJjZTogYXN5bmMgKHVyaTogVVJJKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmZlYXR1cmVzLmhhc1NlY29uZGFyeVF1aWNrRGlmZlByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnByb3h5LiRwcm92aWRlU2Vjb25kYXJ5T3JpZ2luYWxSZXNvdXJjZSh0aGlzLmhhbmRsZSwgdXJpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0ICYmIFVSSS5yZXZpdmUocmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChmZWF0dXJlcy5oYXNTZWNvbmRhcnlRdWlja0RpZmZQcm92aWRlciA9PT0gZmFsc2UgJiYgdGhpcy5fc3RhZ2VkUXVpY2tEaWZmKSB7XG5cdFx0XHR0aGlzLl9zdGFnZWRRdWlja0RpZmYuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fc3RhZ2VkUXVpY2tEaWZmID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChmZWF0dXJlcy5oYXNBcnRpZmFjdFByb3ZpZGVyICYmICF0aGlzLmFydGlmYWN0UHJvdmlkZXIuZ2V0KCkpIHtcblx0XHRcdGNvbnN0IGFydGlmYWN0UHJvdmlkZXIgPSBuZXcgTWFpblRocmVhZFNDTUFydGlmYWN0UHJvdmlkZXIodGhpcy5wcm94eSwgdGhpcy5oYW5kbGUpO1xuXHRcdFx0dGhpcy5fYXJ0aWZhY3RQcm92aWRlci5zZXQoYXJ0aWZhY3RQcm92aWRlciwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2UgaWYgKGZlYXR1cmVzLmhhc0FydGlmYWN0UHJvdmlkZXIgPT09IGZhbHNlICYmIHRoaXMuYXJ0aWZhY3RQcm92aWRlci5nZXQoKSkge1xuXHRcdFx0dGhpcy5fYXJ0aWZhY3RQcm92aWRlci5nZXQoKT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fYXJ0aWZhY3RQcm92aWRlci5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmIChmZWF0dXJlcy5oYXNIaXN0b3J5UHJvdmlkZXIgJiYgIXRoaXMuaGlzdG9yeVByb3ZpZGVyLmdldCgpKSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSBuZXcgTWFpblRocmVhZFNDTUhpc3RvcnlQcm92aWRlcih0aGlzLnByb3h5LCB0aGlzLmhhbmRsZSk7XG5cdFx0XHR0aGlzLl9oaXN0b3J5UHJvdmlkZXIuc2V0KGhpc3RvcnlQcm92aWRlciwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2UgaWYgKGZlYXR1cmVzLmhhc0hpc3RvcnlQcm92aWRlciA9PT0gZmFsc2UgJiYgdGhpcy5oaXN0b3J5UHJvdmlkZXIuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX2hpc3RvcnlQcm92aWRlci5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdCRyZWdpc3Rlckdyb3VwcyhfZ3JvdXBzOiBbbnVtYmVyIC8qaGFuZGxlKi8sIHN0cmluZyAvKmlkKi8sIHN0cmluZyAvKmxhYmVsKi8sIFNDTUdyb3VwRmVhdHVyZXMsIC8qIG11bHRpRGlmZkVkaXRvckVuYWJsZVZpZXdDaGFuZ2VzICovIGJvb2xlYW5dW10pOiB2b2lkIHtcblx0XHRjb25zdCBncm91cHMgPSBfZ3JvdXBzLm1hcCgoW2hhbmRsZSwgaWQsIGxhYmVsLCBmZWF0dXJlcywgbXVsdGlEaWZmRWRpdG9yRW5hYmxlVmlld0NoYW5nZXNdKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cCA9IG5ldyBNYWluVGhyZWFkU0NNUmVzb3VyY2VHcm91cChcblx0XHRcdFx0dGhpcy5oYW5kbGUsXG5cdFx0XHRcdGhhbmRsZSxcblx0XHRcdFx0dGhpcyxcblx0XHRcdFx0ZmVhdHVyZXMsXG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRpZCxcblx0XHRcdFx0bXVsdGlEaWZmRWRpdG9yRW5hYmxlVmlld0NoYW5nZXMsXG5cdFx0XHRcdHRoaXMuX3VyaUlkZW50U2VydmljZVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5fZ3JvdXBzQnlIYW5kbGVbaGFuZGxlXSA9IGdyb3VwO1xuXHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5ncm91cHMuc3BsaWNlKHRoaXMuZ3JvdXBzLmxlbmd0aCwgMCwgLi4uZ3JvdXBzKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlc291cmNlR3JvdXBzLmZpcmUoKTtcblx0fVxuXG5cdCR1cGRhdGVHcm91cChoYW5kbGU6IG51bWJlciwgZmVhdHVyZXM6IFNDTUdyb3VwRmVhdHVyZXMpOiB2b2lkIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2dyb3Vwc0J5SGFuZGxlW2hhbmRsZV07XG5cblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Z3JvdXAuJHVwZGF0ZUdyb3VwKGZlYXR1cmVzKTtcblx0fVxuXG5cdCR1cGRhdGVHcm91cExhYmVsKGhhbmRsZTogbnVtYmVyLCBsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9ncm91cHNCeUhhbmRsZVtoYW5kbGVdO1xuXG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGdyb3VwLiR1cGRhdGVHcm91cExhYmVsKGxhYmVsKTtcblx0fVxuXG5cdCRzcGxpY2VHcm91cFJlc291cmNlU3RhdGVzKHNwbGljZXM6IFNDTVJhd1Jlc291cmNlU3BsaWNlc1tdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbZ3JvdXBIYW5kbGUsIGdyb3VwU2xpY2VzXSBvZiBzcGxpY2VzKSB7XG5cdFx0XHRjb25zdCBncm91cCA9IHRoaXMuX2dyb3Vwc0J5SGFuZGxlW2dyb3VwSGFuZGxlXTtcblxuXHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYFNDTSBncm91cCAke2dyb3VwSGFuZGxlfSBub3QgZm91bmQgaW4gcHJvdmlkZXIgJHt0aGlzLmxhYmVsfWApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcmV2ZXJzZSB0aGUgc3BsaWNlcyBzZXF1ZW5jZSBpbiBvcmRlciB0byBhcHBseSB0aGVtIGNvcnJlY3RseVxuXHRcdFx0Z3JvdXBTbGljZXMucmV2ZXJzZSgpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IFtzdGFydCwgZGVsZXRlQ291bnQsIHJhd1Jlc291cmNlc10gb2YgZ3JvdXBTbGljZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gcmF3UmVzb3VyY2VzLm1hcChyYXdSZXNvdXJjZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgW2hhbmRsZSwgc291cmNlVXJpLCBpY29ucywgdG9vbHRpcCwgc3RyaWtlVGhyb3VnaCwgZmFkZWQsIGNvbnRleHRWYWx1ZSwgY29tbWFuZCwgbXVsdGlEaWZmRWRpdG9yT3JpZ2luYWxVcmksIG11bHRpRGlmZkVkaXRvck1vZGlmaWVkVXJpXSA9IHJhd1Jlc291cmNlO1xuXG5cdFx0XHRcdFx0Y29uc3QgW2xpZ2h0LCBkYXJrXSA9IGljb25zO1xuXHRcdFx0XHRcdGNvbnN0IGljb24gPSBUaGVtZUljb24uaXNUaGVtZUljb24obGlnaHQpID8gbGlnaHQgOiBVUkkucmV2aXZlKGxpZ2h0KTtcblx0XHRcdFx0XHRjb25zdCBpY29uRGFyayA9IChUaGVtZUljb24uaXNUaGVtZUljb24oZGFyaykgPyBkYXJrIDogVVJJLnJldml2ZShkYXJrKSkgfHwgaWNvbjtcblxuXHRcdFx0XHRcdGNvbnN0IGRlY29yYXRpb25zID0ge1xuXHRcdFx0XHRcdFx0aWNvbjogaWNvbixcblx0XHRcdFx0XHRcdGljb25EYXJrOiBpY29uRGFyayxcblx0XHRcdFx0XHRcdHRvb2x0aXAsXG5cdFx0XHRcdFx0XHRzdHJpa2VUaHJvdWdoLFxuXHRcdFx0XHRcdFx0ZmFkZWRcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBNYWluVGhyZWFkU0NNUmVzb3VyY2UoXG5cdFx0XHRcdFx0XHR0aGlzLnByb3h5LFxuXHRcdFx0XHRcdFx0dGhpcy5oYW5kbGUsXG5cdFx0XHRcdFx0XHRncm91cEhhbmRsZSxcblx0XHRcdFx0XHRcdGhhbmRsZSxcblx0XHRcdFx0XHRcdFVSSS5yZXZpdmUoc291cmNlVXJpKSxcblx0XHRcdFx0XHRcdGdyb3VwLFxuXHRcdFx0XHRcdFx0ZGVjb3JhdGlvbnMsXG5cdFx0XHRcdFx0XHRjb250ZXh0VmFsdWUgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y29tbWFuZCxcblx0XHRcdFx0XHRcdFVSSS5yZXZpdmUobXVsdGlEaWZmRWRpdG9yT3JpZ2luYWxVcmkpLFxuXHRcdFx0XHRcdFx0VVJJLnJldml2ZShtdWx0aURpZmZFZGl0b3JNb2RpZmllZFVyaSksXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Z3JvdXAuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgcmVzb3VyY2VzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVJlc291cmNlcy5maXJlKCk7XG5cdH1cblxuXHQkdW5yZWdpc3Rlckdyb3VwKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9ncm91cHNCeUhhbmRsZVtoYW5kbGVdO1xuXG5cdFx0aWYgKCFncm91cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGRlbGV0ZSB0aGlzLl9ncm91cHNCeUhhbmRsZVtoYW5kbGVdO1xuXHRcdHRoaXMuZ3JvdXBzLnNwbGljZSh0aGlzLmdyb3Vwcy5pbmRleE9mKGdyb3VwKSwgMSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZXNvdXJjZUdyb3Vwcy5maXJlKCk7XG5cdH1cblxuXHRhc3luYyBnZXRPcmlnaW5hbFJlc291cmNlKHVyaTogVVJJKTogUHJvbWlzZTxVUkkgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLmZlYXR1cmVzLmhhc1F1aWNrRGlmZlByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnByb3h5LiRwcm92aWRlT3JpZ2luYWxSZXNvdXJjZSh0aGlzLmhhbmRsZSwgdXJpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZXR1cm4gcmVzdWx0ICYmIFVSSS5yZXZpdmUocmVzdWx0KTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZUhpc3RvcnlQcm92aWRlckN1cnJlbnRIaXN0b3J5SXRlbVJlZnMoaGlzdG9yeUl0ZW1SZWY/OiBTQ01IaXN0b3J5SXRlbVJlZkR0bywgaGlzdG9yeUl0ZW1SZW1vdGVSZWY/OiBTQ01IaXN0b3J5SXRlbVJlZkR0bywgaGlzdG9yeUl0ZW1CYXNlUmVmPzogU0NNSGlzdG9yeUl0ZW1SZWZEdG8pOiB2b2lkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRwcm92aWRlci4kb25EaWRDaGFuZ2VDdXJyZW50SGlzdG9yeUl0ZW1SZWZzKGhpc3RvcnlJdGVtUmVmLCBoaXN0b3J5SXRlbVJlbW90ZVJlZiwgaGlzdG9yeUl0ZW1CYXNlUmVmKTtcblx0fVxuXG5cdCRvbkRpZENoYW5nZUhpc3RvcnlQcm92aWRlckhpc3RvcnlJdGVtUmVmcyhoaXN0b3J5SXRlbVJlZnM6IFNDTUhpc3RvcnlJdGVtUmVmc0NoYW5nZUV2ZW50RHRvKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmhpc3RvcnlQcm92aWRlci5nZXQoKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cHJvdmlkZXIuJG9uRGlkQ2hhbmdlSGlzdG9yeUl0ZW1SZWZzKGhpc3RvcnlJdGVtUmVmcyk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VBcnRpZmFjdHMoZ3JvdXBzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5hcnRpZmFjdFByb3ZpZGVyLmdldCgpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRwcm92aWRlci4kb25EaWRDaGFuZ2VBcnRpZmFjdHMoZ3JvdXBzKTtcblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0JG1pZDogTWFyc2hhbGxlZElkLlNjbVByb3ZpZGVyLFxuXHRcdFx0aGFuZGxlOiB0aGlzLmhhbmRsZVxuXHRcdH07XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVzb3VyY2VzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9hcnRpZmFjdFByb3ZpZGVyLmdldCgpPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc3RhZ2VkUXVpY2tEaWZmPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcXVpY2tEaWZmPy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRTQ00pXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFNDTSBpbXBsZW1lbnRzIE1haW5UaHJlYWRTQ01TaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RTQ01TaGFwZTtcblx0cHJpdmF0ZSBfcmVwb3NpdG9yaWVzID0gbmV3IE1hcDxudW1iZXIsIElTQ01SZXBvc2l0b3J5PigpO1xuXHRwcml2YXRlIF9yZXBvc2l0b3J5QmFycmllcnMgPSBuZXcgTWFwPG51bWJlciwgQmFycmllcj4oKTtcblx0cHJpdmF0ZSBfcmVwb3NpdG9yeURpc3Bvc2FibGVzID0gbmV3IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJUXVpY2tEaWZmU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrRGlmZlNlcnZpY2U6IElRdWlja0RpZmZTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VyaUlkZW50U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RTQ00pO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBTQ01JbnB1dEJveENvbnRlbnRQcm92aWRlcih0aGlzLnRleHRNb2RlbFNlcnZpY2UsIHRoaXMubW9kZWxTZXJ2aWNlLCB0aGlzLmxhbmd1YWdlU2VydmljZSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMuX3JlcG9zaXRvcmllcy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5fcmVwb3NpdG9yaWVzLmNsZWFyKCk7XG5cblx0XHRkaXNwb3NlKHRoaXMuX3JlcG9zaXRvcnlEaXNwb3NhYmxlcy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5fcmVwb3NpdG9yeURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRhc3luYyAkcmVnaXN0ZXJTb3VyY2VDb250cm9sKGhhbmRsZTogbnVtYmVyLCBwYXJlbnRIYW5kbGU6IG51bWJlciB8IHVuZGVmaW5lZCwgaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgcm9vdFVyaTogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZCwgaWNvblBhdGg6IFVyaUNvbXBvbmVudHMgfCB7IGxpZ2h0OiBVcmlDb21wb25lbnRzOyBkYXJrOiBVcmlDb21wb25lbnRzIH0gfCBUaGVtZUljb24gfCB1bmRlZmluZWQsIGlzSGlkZGVuOiBib29sZWFuIHwgdW5kZWZpbmVkLCBpbnB1dEJveERvY3VtZW50VXJpOiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLnNldChoYW5kbGUsIG5ldyBCYXJyaWVyKCkpO1xuXG5cdFx0Y29uc3QgaW5wdXRCb3hUZXh0TW9kZWxSZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoVVJJLnJldml2ZShpbnB1dEJveERvY3VtZW50VXJpKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTWFpblRocmVhZFNDTVByb3ZpZGVyKHRoaXMuX3Byb3h5LCBoYW5kbGUsIHBhcmVudEhhbmRsZSwgaWQsIGxhYmVsLCByb290VXJpID8gVVJJLnJldml2ZShyb290VXJpKSA6IHVuZGVmaW5lZCwgZ2V0SWNvbkZyb21JY29uRHRvKGljb25QYXRoKSwgaXNIaWRkZW4sIGlucHV0Qm94VGV4dE1vZGVsUmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwsIHRoaXMucXVpY2tEaWZmU2VydmljZSwgdGhpcy5fdXJpSWRlbnRTZXJ2aWNlLCB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5zY21TZXJ2aWNlLnJlZ2lzdGVyU0NNUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdHRoaXMuX3JlcG9zaXRvcmllcy5zZXQoaGFuZGxlLCByZXBvc2l0b3J5KTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHRpbnB1dEJveFRleHRNb2RlbFJlZixcblx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLnNjbVZpZXdTZXJ2aWNlLm9uRGlkRm9jdXNSZXBvc2l0b3J5LCByID0+IHIgPT09IHJlcG9zaXRvcnkpKF8gPT4gdGhpcy5fcHJveHkuJHNldFNlbGVjdGVkU291cmNlQ29udHJvbChoYW5kbGUpKSxcblx0XHRcdHJlcG9zaXRvcnkuaW5wdXQub25EaWRDaGFuZ2UoKHsgdmFsdWUgfSkgPT4gdGhpcy5fcHJveHkuJG9uSW5wdXRCb3hWYWx1ZUNoYW5nZShoYW5kbGUsIHZhbHVlKSlcblx0XHQpO1xuXHRcdHRoaXMuX3JlcG9zaXRvcnlEaXNwb3NhYmxlcy5zZXQoaGFuZGxlLCBkaXNwb3NhYmxlKTtcblxuXHRcdGlmICh0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzZWRSZXBvc2l0b3J5ID09PSByZXBvc2l0b3J5KSB7XG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMuX3Byb3h5LiRzZXRTZWxlY3RlZFNvdXJjZUNvbnRyb2woaGFuZGxlKSwgMCk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlcG9zaXRvcnkuaW5wdXQudmFsdWUpIHtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5fcHJveHkuJG9uSW5wdXRCb3hWYWx1ZUNoYW5nZShoYW5kbGUsIHJlcG9zaXRvcnkuaW5wdXQudmFsdWUpLCAwKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KGhhbmRsZSk/Lm9wZW4oKTtcblx0fVxuXG5cdGFzeW5jICR1cGRhdGVTb3VyY2VDb250cm9sKGhhbmRsZTogbnVtYmVyLCBmZWF0dXJlczogU0NNUHJvdmlkZXJGZWF0dXJlcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoaGFuZGxlKT8ud2FpdCgpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KGhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIgYXMgTWFpblRocmVhZFNDTVByb3ZpZGVyO1xuXHRcdHByb3ZpZGVyLiR1cGRhdGVTb3VyY2VDb250cm9sKGZlYXR1cmVzKTtcblx0fVxuXG5cdGFzeW5jICR1bnJlZ2lzdGVyU291cmNlQ29udHJvbChoYW5kbGU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoaGFuZGxlKT8ud2FpdCgpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KGhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXBvc2l0b3J5RGlzcG9zYWJsZXMuZ2V0KGhhbmRsZSkhLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZXBvc2l0b3J5RGlzcG9zYWJsZXMuZGVsZXRlKGhhbmRsZSk7XG5cblx0XHRyZXBvc2l0b3J5LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZXBvc2l0b3JpZXMuZGVsZXRlKGhhbmRsZSk7XG5cdH1cblxuXHRhc3luYyAkcmVnaXN0ZXJHcm91cHMoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBncm91cHM6IFtudW1iZXIgLypoYW5kbGUqLywgc3RyaW5nIC8qaWQqLywgc3RyaW5nIC8qbGFiZWwqLywgU0NNR3JvdXBGZWF0dXJlcywgLyogbXVsdGlEaWZmRWRpdG9yRW5hYmxlVmlld0NoYW5nZXMgKi8gYm9vbGVhbl1bXSwgc3BsaWNlczogU0NNUmF3UmVzb3VyY2VTcGxpY2VzW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIgYXMgTWFpblRocmVhZFNDTVByb3ZpZGVyO1xuXHRcdHByb3ZpZGVyLiRyZWdpc3Rlckdyb3Vwcyhncm91cHMpO1xuXHRcdHByb3ZpZGVyLiRzcGxpY2VHcm91cFJlc291cmNlU3RhdGVzKHNwbGljZXMpO1xuXHR9XG5cblx0YXN5bmMgJHVwZGF0ZUdyb3VwKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgZ3JvdXBIYW5kbGU6IG51bWJlciwgZmVhdHVyZXM6IFNDTUdyb3VwRmVhdHVyZXMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIgYXMgTWFpblRocmVhZFNDTVByb3ZpZGVyO1xuXHRcdHByb3ZpZGVyLiR1cGRhdGVHcm91cChncm91cEhhbmRsZSwgZmVhdHVyZXMpO1xuXHR9XG5cblx0YXN5bmMgJHVwZGF0ZUdyb3VwTGFiZWwoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBncm91cEhhbmRsZTogbnVtYmVyLCBsYWJlbDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8ud2FpdCgpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSByZXBvc2l0b3J5LnByb3ZpZGVyIGFzIE1haW5UaHJlYWRTQ01Qcm92aWRlcjtcblx0XHRwcm92aWRlci4kdXBkYXRlR3JvdXBMYWJlbChncm91cEhhbmRsZSwgbGFiZWwpO1xuXHR9XG5cblx0YXN5bmMgJHNwbGljZVJlc291cmNlU3RhdGVzKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgc3BsaWNlczogU0NNUmF3UmVzb3VyY2VTcGxpY2VzW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIgYXMgTWFpblRocmVhZFNDTVByb3ZpZGVyO1xuXHRcdHByb3ZpZGVyLiRzcGxpY2VHcm91cFJlc291cmNlU3RhdGVzKHNwbGljZXMpO1xuXHR9XG5cblx0YXN5bmMgJHVucmVnaXN0ZXJHcm91cChzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGhhbmRsZTogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8ud2FpdCgpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSByZXBvc2l0b3J5LnByb3ZpZGVyIGFzIE1haW5UaHJlYWRTQ01Qcm92aWRlcjtcblx0XHRwcm92aWRlci4kdW5yZWdpc3Rlckdyb3VwKGhhbmRsZSk7XG5cdH1cblxuXHRhc3luYyAkc2V0SW5wdXRCb3hWYWx1ZShzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXBvc2l0b3J5LmlucHV0LnNldFZhbHVlKHZhbHVlLCBmYWxzZSk7XG5cdH1cblxuXHRhc3luYyAkc2V0SW5wdXRCb3hQbGFjZWhvbGRlcihzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIHBsYWNlaG9sZGVyOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXBvc2l0b3J5LmlucHV0LnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdH1cblxuXHRhc3luYyAkc2V0SW5wdXRCb3hFbmFibGVtZW50KHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgZW5hYmxlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlcG9zaXRvcnkuaW5wdXQuZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdH1cblxuXHRhc3luYyAkc2V0SW5wdXRCb3hWaXNpYmlsaXR5KHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgdmlzaWJsZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlcG9zaXRvcnkuaW5wdXQudmlzaWJsZSA9IHZpc2libGU7XG5cdH1cblxuXHRhc3luYyAkc2hvd1ZhbGlkYXRpb25NZXNzYWdlKHNvdXJjZUNvbnRyb2xIYW5kbGU6IG51bWJlciwgbWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nLCB0eXBlOiBJbnB1dFZhbGlkYXRpb25UeXBlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8ud2FpdCgpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJlcG9zaXRvcnkuaW5wdXQuc2hvd1ZhbGlkYXRpb25NZXNzYWdlKG1lc3NhZ2UsIHR5cGUpO1xuXHR9XG5cblx0YXN5bmMgJHNldFZhbGlkYXRpb25Qcm92aWRlcklzRW5hYmxlZChzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGVuYWJsZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZW5hYmxlZCkge1xuXHRcdFx0cmVwb3NpdG9yeS5pbnB1dC52YWxpZGF0ZUlucHV0ID0gYXN5bmMgKHZhbHVlLCBwb3MpOiBQcm9taXNlPElJbnB1dFZhbGlkYXRpb24gfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJveHkuJHZhbGlkYXRlSW5wdXQoc291cmNlQ29udHJvbEhhbmRsZSwgdmFsdWUsIHBvcyk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQgJiYgeyBtZXNzYWdlOiByZXN1bHRbMF0sIHR5cGU6IHJlc3VsdFsxXSB9O1xuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVwb3NpdG9yeS5pbnB1dC52YWxpZGF0ZUlucHV0ID0gYXN5bmMgKCkgPT4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRvbkRpZENoYW5nZUhpc3RvcnlQcm92aWRlckN1cnJlbnRIaXN0b3J5SXRlbVJlZnMoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBoaXN0b3J5SXRlbVJlZj86IFNDTUhpc3RvcnlJdGVtUmVmRHRvLCBoaXN0b3J5SXRlbVJlbW90ZVJlZj86IFNDTUhpc3RvcnlJdGVtUmVmRHRvLCBoaXN0b3J5SXRlbUJhc2VSZWY/OiBTQ01IaXN0b3J5SXRlbVJlZkR0byk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlcG9zaXRvcnlCYXJyaWVycy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk/LndhaXQoKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fcmVwb3NpdG9yaWVzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gcmVwb3NpdG9yeS5wcm92aWRlciBhcyBNYWluVGhyZWFkU0NNUHJvdmlkZXI7XG5cdFx0cHJvdmlkZXIuJG9uRGlkQ2hhbmdlSGlzdG9yeVByb3ZpZGVyQ3VycmVudEhpc3RvcnlJdGVtUmVmcyhoaXN0b3J5SXRlbVJlZiwgaGlzdG9yeUl0ZW1SZW1vdGVSZWYsIGhpc3RvcnlJdGVtQmFzZVJlZik7XG5cdH1cblxuXHRhc3luYyAkb25EaWRDaGFuZ2VIaXN0b3J5UHJvdmlkZXJIaXN0b3J5SXRlbVJlZnMoc291cmNlQ29udHJvbEhhbmRsZTogbnVtYmVyLCBoaXN0b3J5SXRlbVJlZnM6IFNDTUhpc3RvcnlJdGVtUmVmc0NoYW5nZUV2ZW50RHRvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVwb3NpdG9yeUJhcnJpZXJzLmdldChzb3VyY2VDb250cm9sSGFuZGxlKT8ud2FpdCgpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl9yZXBvc2l0b3JpZXMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpO1xuXG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSByZXBvc2l0b3J5LnByb3ZpZGVyIGFzIE1haW5UaHJlYWRTQ01Qcm92aWRlcjtcblx0XHRwcm92aWRlci4kb25EaWRDaGFuZ2VIaXN0b3J5UHJvdmlkZXJIaXN0b3J5SXRlbVJlZnMoaGlzdG9yeUl0ZW1SZWZzKTtcblx0fVxuXG5cdGFzeW5jICRvbkRpZENoYW5nZUFydGlmYWN0cyhzb3VyY2VDb250cm9sSGFuZGxlOiBudW1iZXIsIGdyb3Vwczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZXBvc2l0b3J5QmFycmllcnMuZ2V0KHNvdXJjZUNvbnRyb2xIYW5kbGUpPy53YWl0KCk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3JlcG9zaXRvcmllcy5nZXQoc291cmNlQ29udHJvbEhhbmRsZSk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHJlcG9zaXRvcnkucHJvdmlkZXIgYXMgTWFpblRocmVhZFNDTVByb3ZpZGVyO1xuXHRc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
