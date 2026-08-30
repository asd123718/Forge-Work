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
import "./media/scm.css";
import { localize } from "../../../../nls.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { append, $ } from "../../../../base/browser/dom.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { ISCMService, ISCMViewService } from "../common/scm.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { combinedDisposable, Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { RepositoryActionRunner, RepositoryRenderer } from "./scmRepositoryRenderer.js";
import { collectContextMenuActions, connectPrimaryMenu, getActionViewItemProvider, isSCMArtifactGroupTreeElement, isSCMArtifactNode, isSCMArtifactTreeElement, isSCMRepository } from "./util.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { autorun, observableSignalFromEvent, runOnChange } from "../../../../base/common/observable.js";
import { Sequencer, Throttler } from "../../../../base/common/async.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { SCMViewService } from "./scmViewService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { URI } from "../../../../base/common/uri.js";
import { basename } from "../../../../base/common/resources.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { fromNow } from "../../../../base/common/date.js";
class ListDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId(element) {
    if (isSCMRepository(element)) {
      return RepositoryRenderer.TEMPLATE_ID;
    } else if (isSCMArtifactGroupTreeElement(element)) {
      return ArtifactGroupRenderer.TEMPLATE_ID;
    } else if (isSCMArtifactTreeElement(element) || isSCMArtifactNode(element)) {
      return ArtifactRenderer.TEMPLATE_ID;
    } else {
      throw new Error("Invalid tree element");
    }
  }
}
let ArtifactGroupRenderer = class {
  constructor(actionViewItemProvider, _contextMenuService, _contextKeyService, _keybindingService, _menuService, _commandService, _scmViewService, _telemetryService) {
    this.actionViewItemProvider = actionViewItemProvider;
    this._contextMenuService = _contextMenuService;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._menuService = _menuService;
    this._commandService = _commandService;
    this._scmViewService = _scmViewService;
    this._telemetryService = _telemetryService;
  }
  get templateId() {
    return ArtifactGroupRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".scm-artifact-group"));
    const icon = append(element, $(".icon"));
    const label = new IconLabel(element, { supportIcons: false });
    const actionsContainer = append(element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider }, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
    return { icon, label, actionBar, elementDisposables: new DisposableStore(), templateDisposable: combinedDisposable(label, actionBar) };
  }
  renderElement(node, index, templateData) {
    const provider = node.element.repository.provider;
    const artifactGroup = node.element.artifactGroup;
    templateData.icon.className = ThemeIcon.isThemeIcon(artifactGroup.icon) ? `icon ${ThemeIcon.asClassName(artifactGroup.icon)}` : "";
    templateData.label.setLabel(artifactGroup.name);
    const repositoryMenus = this._scmViewService.menus.getRepositoryMenus(provider);
    templateData.elementDisposables.add(connectPrimaryMenu(repositoryMenus.getArtifactGroupMenu(artifactGroup), (primary) => {
      templateData.actionBar.setActions(primary);
    }, "inline", provider));
    templateData.actionBar.context = artifactGroup;
  }
  renderCompressedElements(node, index, templateData, details) {
    throw new Error("Should never happen since node is incompressible");
  }
  disposeElement(element, index, templateData, details) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposable.dispose();
  }
};
ArtifactGroupRenderer.TEMPLATE_ID = "artifactGroup";
ArtifactGroupRenderer = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, ISCMViewService),
  __decorateParam(7, ITelemetryService)
], ArtifactGroupRenderer);
let ArtifactRenderer = class {
  constructor(actionViewItemProvider, _contextMenuService, _contextKeyService, _keybindingService, _menuService, _commandService, _scmViewService, _telemetryService) {
    this.actionViewItemProvider = actionViewItemProvider;
    this._contextMenuService = _contextMenuService;
    this._contextKeyService = _contextKeyService;
    this._keybindingService = _keybindingService;
    this._menuService = _menuService;
    this._commandService = _commandService;
    this._scmViewService = _scmViewService;
    this._telemetryService = _telemetryService;
  }
  get templateId() {
    return ArtifactRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".scm-artifact"));
    const icon = append(element, $(".icon"));
    const label = new IconLabel(element, { supportIcons: false });
    const timestampContainer = append(element, $(".timestamp-container"));
    const timestamp = append(timestampContainer, $(".timestamp"));
    const actionsContainer = append(element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, { actionViewItemProvider: this.actionViewItemProvider }, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
    return { icon, label, timestampContainer, timestamp, actionBar, elementDisposables: new DisposableStore(), templateDisposable: combinedDisposable(label, actionBar) };
  }
  renderElement(nodeOrElement, index, templateData) {
    const artifactOrFolder = nodeOrElement.element;
    if (isSCMArtifactTreeElement(artifactOrFolder)) {
      const artifactGroup = artifactOrFolder.group;
      const artifact = artifactOrFolder.artifact;
      const artifactIcon = artifact.icon ?? artifactOrFolder.group.icon;
      templateData.icon.className = ThemeIcon.isThemeIcon(artifactIcon) ? `icon ${ThemeIcon.asClassName(artifactIcon)}` : "";
      const artifactLabel = artifactGroup.supportsFolders ? artifact.name.split("/").pop() ?? artifact.name : artifact.name;
      templateData.label.setLabel(artifactLabel, artifact.description);
      templateData.timestamp.textContent = artifact.timestamp ? fromNow(artifact.timestamp) : "";
      templateData.timestampContainer.classList.toggle("duplicate", artifactOrFolder.hideTimestamp);
      templateData.timestampContainer.style.display = "";
    } else if (isSCMArtifactNode(artifactOrFolder)) {
      templateData.icon.className = `icon ${ThemeIcon.asClassName(Codicon.folder)}`;
      templateData.label.setLabel(basename(artifactOrFolder.uri));
      templateData.timestamp.textContent = "";
      templateData.timestampContainer.classList.remove("duplicate");
      templateData.timestampContainer.style.display = "none";
    }
    this._renderActionBar(artifactOrFolder, templateData);
  }
  renderCompressedElements(node, index, templateData, details) {
    const compressed = node.element;
    const artifactOrFolder = compressed.elements[compressed.elements.length - 1];
    if (isSCMArtifactTreeElement(artifactOrFolder)) {
      const artifact = artifactOrFolder.artifact;
      const artifactIcon = artifact.icon ?? artifactOrFolder.group.icon;
      templateData.icon.className = ThemeIcon.isThemeIcon(artifactIcon) ? `icon ${ThemeIcon.asClassName(artifactIcon)}` : "";
      templateData.label.setLabel(artifact.name, artifact.description);
      templateData.timestamp.textContent = artifact.timestamp ? fromNow(artifact.timestamp) : "";
      templateData.timestampContainer.classList.toggle("duplicate", artifactOrFolder.hideTimestamp);
      templateData.timestampContainer.style.display = "";
    } else if (isSCMArtifactNode(artifactOrFolder)) {
      templateData.icon.className = `icon ${ThemeIcon.asClassName(Codicon.folder)}`;
      templateData.label.setLabel(artifactOrFolder.uri.fsPath.substring(1));
      templateData.timestamp.textContent = "";
      templateData.timestampContainer.classList.remove("duplicate");
      templateData.timestampContainer.style.display = "none";
    }
    this._renderActionBar(artifactOrFolder, templateData);
  }
  _renderActionBar(artifactOrFolder, templateData) {
    if (isSCMArtifactTreeElement(artifactOrFolder)) {
      const artifact = artifactOrFolder.artifact;
      const provider = artifactOrFolder.repository.provider;
      const repositoryMenus = this._scmViewService.menus.getRepositoryMenus(provider);
      templateData.elementDisposables.add(connectPrimaryMenu(repositoryMenus.getArtifactMenu(artifactOrFolder.group, artifact), (primary) => {
        templateData.actionBar.setActions(primary);
      }, "inline", provider));
      templateData.actionBar.context = artifact;
    } else if (ResourceTree.isResourceNode(artifactOrFolder)) {
      templateData.actionBar.setActions([]);
      templateData.actionBar.context = void 0;
    }
  }
  disposeElement(element, index, templateData, details) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposable.dispose();
  }
};
ArtifactRenderer.TEMPLATE_ID = "artifact";
ArtifactRenderer = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, ISCMViewService),
  __decorateParam(7, ITelemetryService)
], ArtifactRenderer);
let RepositoryTreeDataSource = class extends Disposable {
  constructor(scmViewService) {
    super();
    this.scmViewService = scmViewService;
  }
  async getChildren(inputOrElement) {
    if (this.scmViewService.explorerEnabledConfig.get() === false) {
      const parentId = isSCMRepository(inputOrElement) ? inputOrElement.provider.id : void 0;
      const repositories = this.scmViewService.repositories.filter((r) => r.provider.parentId === parentId);
      return repositories;
    }
    if (inputOrElement instanceof SCMViewService) {
      const repositories = this.scmViewService.repositories.filter((r) => r.provider.parentId === void 0);
      if (repositories.length !== this.scmViewService.repositories.length) {
        for (const repository of repositories) {
          const childRepositories = this.scmViewService.repositories.filter((r) => r.provider.parentId === repository.provider.id);
          if (childRepositories.length === 0) {
            continue;
          }
          const repositoryIndex = repositories.indexOf(repository);
          repositories.splice(repositoryIndex + 1, 0, ...childRepositories);
        }
      }
      return repositories;
    } else if (isSCMRepository(inputOrElement)) {
      const artifactGroups = await inputOrElement.provider.artifactProvider.get()?.provideArtifactGroups() ?? [];
      return artifactGroups.map((group) => ({
        repository: inputOrElement,
        artifactGroup: group,
        type: "artifactGroup"
      }));
    } else if (isSCMArtifactGroupTreeElement(inputOrElement)) {
      const repository = inputOrElement.repository;
      const artifacts = await repository.provider.artifactProvider.get()?.provideArtifacts(inputOrElement.artifactGroup.id) ?? [];
      if (inputOrElement.artifactGroup.supportsFolders) {
        const artifactsTree = new ResourceTree(inputOrElement);
        for (let index = 0; index < artifacts.length; index++) {
          const artifact = artifacts[index];
          const artifactUri = URI.from({ scheme: "scm-artifact", path: artifact.name });
          const artifactDirectory = artifact.id.lastIndexOf("/") > 0 ? artifact.id.substring(0, artifact.id.lastIndexOf("/")) : artifact.id;
          const prevArtifact = index > 0 ? artifacts[index - 1] : void 0;
          const prevArtifactDirectory = prevArtifact && prevArtifact.id.lastIndexOf("/") > 0 ? prevArtifact.id.substring(0, prevArtifact.id.lastIndexOf("/")) : prevArtifact?.id;
          const hideTimestamp = index > 0 && artifact.timestamp !== void 0 && prevArtifact?.timestamp !== void 0 && artifactDirectory === prevArtifactDirectory && fromNow(prevArtifact.timestamp) === fromNow(artifact.timestamp);
          artifactsTree.add(artifactUri, {
            repository,
            group: inputOrElement.artifactGroup,
            artifact,
            hideTimestamp,
            type: "artifact"
          });
        }
        return Iterable.map(artifactsTree.root.children, (node) => node.element ?? node);
      }
      return artifacts.map((artifact, index, artifacts2) => ({
        repository,
        group: inputOrElement.artifactGroup,
        artifact,
        hideTimestamp: index > 0 && artifact.timestamp !== void 0 && artifacts2[index - 1].timestamp !== void 0 && fromNow(artifacts2[index - 1].timestamp) === fromNow(artifact.timestamp),
        type: "artifact"
      }));
    } else if (isSCMArtifactNode(inputOrElement)) {
      return Iterable.map(
        inputOrElement.children,
        (node) => node.element && node.childrenCount === 0 ? node.element : node
      );
    }
    return [];
  }
  hasChildren(inputOrElement) {
    if (this.scmViewService.explorerEnabledConfig.get() === false) {
      const parentId = isSCMRepository(inputOrElement) ? inputOrElement.provider.id : void 0;
      const repositories = this.scmViewService.repositories.filter((r) => r.provider.parentId === parentId);
      return repositories.length > 0;
    }
    if (inputOrElement instanceof SCMViewService) {
      return this.scmViewService.repositories.length > 0;
    } else if (isSCMRepository(inputOrElement)) {
      return true;
    } else if (isSCMArtifactGroupTreeElement(inputOrElement)) {
      return true;
    } else if (isSCMArtifactTreeElement(inputOrElement)) {
      return false;
    } else if (isSCMArtifactNode(inputOrElement)) {
      return inputOrElement.childrenCount > 0;
    } else {
      return false;
    }
  }
};
RepositoryTreeDataSource = __decorateClass([
  __decorateParam(0, ISCMViewService)
], RepositoryTreeDataSource);
class RepositoryTreeIdentityProvider {
  getId(element) {
    if (isSCMRepository(element)) {
      return `repo:${element.provider.id}`;
    } else if (isSCMArtifactGroupTreeElement(element)) {
      return `artifactGroup:${element.repository.provider.id}/${element.artifactGroup.id}`;
    } else if (isSCMArtifactTreeElement(element)) {
      return `artifact:${element.repository.provider.id}/${element.group.id}/${element.artifact.id}`;
    } else if (isSCMArtifactNode(element)) {
      return `artifactFolder:${element.context.repository.provider.id}/${element.context.artifactGroup.id}/${element.uri.fsPath}`;
    } else {
      throw new Error("Invalid tree element");
    }
  }
}
class RepositoriesTreeCompressionDelegate {
  isIncompressible(element) {
    if (ResourceTree.isResourceNode(element)) {
      return element.childrenCount > 1;
    } else {
      return true;
    }
  }
}
let SCMRepositoriesViewPane = class extends ViewPane {
  constructor(options, scmService, scmViewService, keybindingService, contextMenuService, commandService, instantiationService, viewDescriptorService, contextKeyService, configurationService, openerService, themeService, hoverService, storageService) {
    super({ ...options, titleMenuId: MenuId.SCMSourceControlTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.scmService = scmService;
    this.scmViewService = scmViewService;
    this.commandService = commandService;
    this.storageService = storageService;
    this.treeOperationSequencer = new Sequencer();
    this.updateChildrenThrottler = new Throttler();
    this.visibilityDisposables = new DisposableStore();
    this.repositoryDisposables = new DisposableMap();
    this.visibleCountObs = observableConfigValue("scm.repositories.visible", 10, this.configurationService);
    this.providerCountBadgeObs = observableConfigValue("scm.providerCountBadge", "hidden", this.configurationService);
    this.storageService.onWillSaveState(() => {
      this.storeTreeViewState();
    }, this, this._store);
    this._register(this.updateChildrenThrottler);
  }
  renderBody(container) {
    super.renderBody(container);
    const treeContainer = append(container, $(".scm-view.scm-repositories-view"));
    this._register(autorun((reader) => {
      const providerCountBadge = this.providerCountBadgeObs.read(reader);
      treeContainer.classList.toggle("hide-provider-counts", providerCountBadge === "hidden");
      treeContainer.classList.toggle("auto-provider-counts", providerCountBadge === "auto");
    }));
    const viewState = this.loadTreeViewState();
    this.createTree(treeContainer, viewState);
    this.onDidChangeBodyVisibility(async (visible) => {
      if (!visible) {
        this.visibilityDisposables.clear();
        return;
      }
      this.treeOperationSequencer.queue(async () => {
        await this.tree.setInput(this.scmViewService, viewState);
        this.visibilityDisposables.add(autorun((reader) => {
          const visibleCount = this.visibleCountObs.read(reader);
          this.updateBodySize(this.tree.contentHeight, visibleCount);
        }));
        this.visibilityDisposables.add(runOnChange(this.scmViewService.explorerEnabledConfig, async () => {
          await this.updateChildren();
          this.updateBodySize(this.tree.contentHeight);
          if (this.scmViewService.repositories.length === 1) {
            await this.treeOperationSequencer.queue(() => this.tree.expand(this.scmViewService.repositories[0]));
          }
        }));
        const onDidChangeVisibleRepositoriesSignal = observableSignalFromEvent(
          this,
          this.scmViewService.onDidChangeVisibleRepositories
        );
        this.visibilityDisposables.add(autorun(async (reader) => {
          onDidChangeVisibleRepositoriesSignal.read(reader);
          await this.treeOperationSequencer.queue(() => this.updateTreeSelection());
        }));
        this.scmService.onDidAddRepository(this.onDidAddRepository, this, this.visibilityDisposables);
        this.scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.visibilityDisposables);
        for (const repository of this.scmService.repositories) {
          this.onDidAddRepository(repository);
        }
        this.visibilityDisposables.add(autorun(async (reader) => {
          const explorerEnabledConfig = this.scmViewService.explorerEnabledConfig.read(reader);
          const didFinishLoadingRepositories = this.scmViewService.didFinishLoadingRepositories.read(reader);
          if (viewState === void 0 && explorerEnabledConfig && didFinishLoadingRepositories && this.scmViewService.repositories.length === 1) {
            await this.treeOperationSequencer.queue(() => this.tree.expand(this.scmViewService.repositories[0]));
          }
        }));
      });
    }, this, this._store);
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
  focus() {
    super.focus();
    this.tree.domFocus();
  }
  createTree(container, viewState) {
    this.treeIdentityProvider = new RepositoryTreeIdentityProvider();
    this.treeDataSource = this.instantiationService.createInstance(RepositoryTreeDataSource);
    this._register(this.treeDataSource);
    this.tree = this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "SCM Repositories",
      container,
      new ListDelegate(),
      new RepositoriesTreeCompressionDelegate(),
      [
        this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMSourceControlInline, getActionViewItemProvider(this.instantiationService)),
        this.instantiationService.createInstance(ArtifactGroupRenderer, getActionViewItemProvider(this.instantiationService)),
        this.instantiationService.createInstance(ArtifactRenderer, getActionViewItemProvider(this.instantiationService))
      ],
      this.treeDataSource,
      {
        identityProvider: this.treeIdentityProvider,
        horizontalScrolling: false,
        collapseByDefault: (e) => {
          if (this.scmViewService.explorerEnabledConfig.get() === false) {
            if (isSCMRepository(e) && e.provider.parentId === void 0) {
              return false;
            }
            return true;
          }
          if (viewState?.expanded && (isSCMRepository(e) || isSCMArtifactGroupTreeElement(e) || isSCMArtifactTreeElement(e))) {
            return viewState.expanded.indexOf(this.treeIdentityProvider.getId(e)) === -1;
          } else if (isSCMArtifactNode(e)) {
            return !(e.childrenCount === 1 && Iterable.first(e.children)?.element === void 0);
          } else {
            return true;
          }
        },
        compressionEnabled: true,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles,
        multipleSelectionSupport: this.scmViewService.selectionModeConfig.get() === "multiple",
        expandOnDoubleClick: true,
        expandOnlyOnTwistieClick: true,
        accessibilityProvider: {
          getAriaLabel(element) {
            if (isSCMRepository(element)) {
              return element.provider.label;
            } else if (isSCMArtifactGroupTreeElement(element)) {
              return element.artifactGroup.name;
            } else if (isSCMArtifactTreeElement(element)) {
              return element.artifact.name;
            } else {
              return "";
            }
          },
          getWidgetAriaLabel() {
            return localize("scm", "Source Control Repositories");
          }
        }
      }
    );
    this._register(this.tree);
    this._register(autorun((reader) => {
      const selectionMode = this.scmViewService.selectionModeConfig.read(reader);
      this.tree.updateOptions({ multipleSelectionSupport: selectionMode === "multiple" });
    }));
    this._register(this.tree.onDidOpen(this.onTreeDidOpen, this));
    this._register(this.tree.onDidChangeSelection(this.onTreeSelectionChange, this));
    this._register(this.tree.onDidChangeFocus(this.onTreeDidChangeFocus, this));
    this._register(this.tree.onDidFocus(this.onDidTreeFocus, this));
    this._register(this.tree.onContextMenu(this.onTreeContextMenu, this));
    this._register(this.tree.onDidChangeContentHeight(this.onTreeContentHeightChange, this));
  }
  async onDidAddRepository(repository) {
    const disposables = new DisposableStore();
    disposables.add(autorun(async (reader) => {
      const explorerEnabled = this.scmViewService.explorerEnabledConfig.read(reader);
      const artifactsProvider = repository.provider.artifactProvider.read(reader);
      if (!explorerEnabled || !artifactsProvider) {
        return;
      }
      reader.store.add(artifactsProvider.onDidChangeArtifacts(async (groups) => {
        await this.updateRepository(repository);
      }));
    }));
    disposables.add(autorun(async (reader) => {
      const historyProvider = repository.provider.historyProvider.read(reader);
      if (!historyProvider) {
        return;
      }
      reader.store.add(runOnChange(historyProvider.historyItemRef, async () => {
        await this.updateRepository(repository);
      }));
    }));
    await this.updateRepository(repository);
    this.repositoryDisposables.set(repository, disposables);
  }
  async onDidRemoveRepository(repository) {
    await this.updateRepository(repository);
    this.repositoryDisposables.deleteAndDispose(repository);
  }
  onTreeDidOpen(e) {
    if (!e.element || !isSCMArtifactTreeElement(e.element) || !e.element.artifact.command) {
      return;
    }
    this.commandService.executeCommand(e.element.artifact.command.id, e.element.repository.provider, e.element.artifact);
  }
  onTreeContextMenu(e) {
    if (!e.element) {
      return;
    }
    if (isSCMRepository(e.element)) {
      const provider = e.element.provider;
      const menus = this.scmViewService.menus.getRepositoryMenus(provider);
      const menu = menus.getRepositoryContextMenu(e.element);
      const actions = collectContextMenuActions(menu);
      const disposables = new DisposableStore();
      const actionRunner = new RepositoryActionRunner(() => {
        return this.getTreeSelection();
      });
      disposables.add(actionRunner);
      disposables.add(actionRunner.onWillRun(() => this.tree.domFocus()));
      this.contextMenuService.showContextMenu({
        actionRunner,
        getAnchor: () => e.anchor,
        getActions: () => actions,
        getActionsContext: () => provider,
        onHide: () => disposables.dispose()
      });
    } else if (isSCMArtifactTreeElement(e.element)) {
      const provider = e.element.repository.provider;
      const artifact = e.element.artifact;
      const menus = this.scmViewService.menus.getRepositoryMenus(provider);
      const menu = menus.getArtifactMenu(e.element.group, artifact);
      const actions = collectContextMenuActions(menu, provider);
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions,
        getActionsContext: () => artifact
      });
    }
  }
  onTreeSelectionChange(e) {
    if (e.browserEvent && e.elements.length > 0) {
      const scrollTop = this.tree.scrollTop;
      if (e.elements.every((e2) => isSCMRepository(e2))) {
        this.scmViewService.visibleRepositories = e.elements;
      } else if (e.elements.every((e2) => isSCMArtifactGroupTreeElement(e2) || isSCMArtifactTreeElement(e2))) {
        this.scmViewService.visibleRepositories = e.elements.map((e2) => e2.repository);
      }
      this.tree.scrollTop = scrollTop;
    }
  }
  onTreeDidChangeFocus(e) {
    if (e.browserEvent && e.elements.length > 0) {
      if (isSCMRepository(e.elements[0])) {
        this.scmViewService.focus(e.elements[0]);
      }
    }
  }
  onDidTreeFocus() {
    const focused = this.tree.getFocus();
    if (focused.length > 0) {
      if (isSCMRepository(focused[0])) {
        this.scmViewService.focus(focused[0]);
      } else if (isSCMArtifactGroupTreeElement(focused[0]) || isSCMArtifactTreeElement(focused[0])) {
        this.scmViewService.focus(focused[0].repository);
      }
    }
  }
  onTreeContentHeightChange(height) {
    this.updateBodySize(height);
    this.treeOperationSequencer.queue(() => this.updateTreeSelection());
  }
  async updateChildren(element) {
    return this.updateChildrenThrottler.queue(
      () => this.treeOperationSequencer.queue(async () => {
        if (element && this.tree.hasNode(element)) {
          await this.tree.updateChildren(element, true);
        } else {
          await this.tree.updateChildren(void 0, true);
        }
      })
    );
  }
  async expand(element) {
    await this.treeOperationSequencer.queue(() => this.tree.expand(element, true));
  }
  async updateRepository(repository) {
    if (this.scmViewService.explorerEnabledConfig.get() === false) {
      if (repository.provider.parentId === void 0) {
        await this.updateChildren();
        return;
      }
      await this.updateParentRepository(repository);
    }
    await this.updateChildren();
  }
  async updateParentRepository(repository) {
    const parentRepository = this.scmViewService.repositories.find((r) => r.provider.id === repository.provider.parentId);
    if (!parentRepository) {
      return;
    }
    await this.updateChildren(parentRepository);
    await this.expand(parentRepository);
  }
  updateBodySize(contentHeight, visibleCount) {
    if (this.orientation === Orientation.HORIZONTAL) {
      return;
    }
    if (this.scmViewService.explorerEnabledConfig.get() === false) {
      visibleCount = visibleCount ?? this.visibleCountObs.get();
      const empty = this.scmViewService.repositories.length === 0;
      const size = Math.min(contentHeight / 22, visibleCount) * 22;
      this.minimumBodySize = visibleCount === 0 ? 22 : size;
      this.maximumBodySize = visibleCount === 0 ? Number.POSITIVE_INFINITY : empty ? Number.POSITIVE_INFINITY : size;
    } else {
      this.minimumBodySize = 120;
      this.maximumBodySize = Number.POSITIVE_INFINITY;
    }
  }
  async updateTreeSelection() {
    const oldSelection = this.getTreeSelection();
    const oldSet = new Set(oldSelection);
    const set = new Set(this.scmViewService.visibleRepositories);
    const added = new Set(Iterable.filter(set, (r) => !oldSet.has(r)));
    const removed = new Set(Iterable.filter(oldSet, (r) => !set.has(r)));
    if (added.size === 0 && removed.size === 0) {
      return;
    }
    const selection = oldSelection.filter((repo) => !removed.has(repo));
    for (const repo of this.scmViewService.repositories) {
      if (added.has(repo)) {
        selection.push(repo);
      }
    }
    const visibleSelection = selection.filter((s) => this.tree.hasNode(s));
    this.tree.setSelection(visibleSelection);
    if (visibleSelection.length > 0 && !this.tree.getFocus().includes(visibleSelection[0])) {
      this.tree.setAnchor(visibleSelection[0]);
      this.tree.setFocus([visibleSelection[0]]);
    }
  }
  getTreeSelection() {
    return this.tree.getSelection().map((e) => {
      if (isSCMRepository(e)) {
        return e;
      } else if (isSCMArtifactGroupTreeElement(e) || isSCMArtifactTreeElement(e)) {
        return e.repository;
      } else if (isSCMArtifactNode(e)) {
        return e.context.repository;
      } else {
        throw new Error("Invalid tree element");
      }
    });
  }
  loadTreeViewState() {
    const storageViewState = this.storageService.get("scm.repositoriesViewState", StorageScope.WORKSPACE);
    if (!storageViewState) {
      return void 0;
    }
    try {
      const treeViewState = JSON.parse(storageViewState);
      return treeViewState;
    } catch {
      return void 0;
    }
  }
  storeTreeViewState() {
    if (this.tree) {
      this.storageService.store("scm.repositoriesViewState", JSON.stringify(this.tree.getViewState()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  dispose() {
    this.visibilityDisposables.dispose();
    this.repositoryDisposables.dispose();
    super.dispose();
  }
};
SCMRepositoriesViewPane = __decorateClass([
  __decorateParam(1, ISCMService),
  __decorateParam(2, ISCMViewService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IViewDescriptorService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IHoverService),
  __decorateParam(13, IStorageService)
], SCMRepositoriesViewPane);
export {
  SCMRepositoriesViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3Nlclxcc2NtUmVwb3NpdG9yaWVzVmlld1BhbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvc2NtLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSwgSVZpZXdQYW5lT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgYXBwZW5kLCAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUlkZW50aXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlRXZlbnQsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVOb2RlLCBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBJT3BlbkV2ZW50LCBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTQ01SZXBvc2l0b3J5LCBJU0NNU2VydmljZSwgSVNDTVZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgUmVwb3NpdG9yeUFjdGlvblJ1bm5lciwgUmVwb3NpdG9yeVJlbmRlcmVyIH0gZnJvbSAnLi9zY21SZXBvc2l0b3J5UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgY29sbGVjdENvbnRleHRNZW51QWN0aW9ucywgY29ubmVjdFByaW1hcnlNZW51LCBnZXRBY3Rpb25WaWV3SXRlbVByb3ZpZGVyLCBpc1NDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudCwgaXNTQ01BcnRpZmFjdE5vZGUsIGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudCwgaXNTQ01SZXBvc2l0b3J5IH0gZnJvbSAnLi91dGlsLmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCwgcnVuT25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFNlcXVlbmNlciwgVGhyb3R0bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50LCBTQ01BcnRpZmFjdFRyZWVFbGVtZW50IH0gZnJvbSAnLi4vY29tbW9uL2FydGlmYWN0LmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdXp6eVNjb3Jlci5qcyc7XG5pbXBvcnQgeyBJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBTQ01WaWV3U2VydmljZSB9IGZyb20gJy4vc2NtVmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VOb2RlLCBSZXNvdXJjZVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZVRyZWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFUcmVlVmlld1N0YXRlLCBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBmcm9tTm93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5cbnR5cGUgVHJlZUVsZW1lbnQgPSBJU0NNUmVwb3NpdG9yeSB8IFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudCB8IFNDTUFydGlmYWN0VHJlZUVsZW1lbnQgfCBJUmVzb3VyY2VOb2RlPFNDTUFydGlmYWN0VHJlZUVsZW1lbnQsIFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudD47XG5cbmNsYXNzIExpc3REZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElTQ01SZXBvc2l0b3J5PiB7XG5cblx0Z2V0SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFJlcG9zaXRvcnlSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gQXJ0aWZhY3RHcm91cFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdFRyZWVFbGVtZW50KGVsZW1lbnQpIHx8IGlzU0NNQXJ0aWZhY3ROb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gQXJ0aWZhY3RSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRyZWUgZWxlbWVudCcpO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgQXJ0aWZhY3RHcm91cFRlbXBsYXRlIHtcblx0cmVhZG9ubHkgaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBJY29uTGFiZWw7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogV29ya2JlbmNoVG9vbEJhcjtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG59XG5cbmNsYXNzIEFydGlmYWN0R3JvdXBSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8U0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50LCBGdXp6eVNjb3JlLCBBcnRpZmFjdEdyb3VwVGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnYXJ0aWZhY3RHcm91cCc7XG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiBBcnRpZmFjdEdyb3VwUmVuZGVyZXIuVEVNUExBVEVfSUQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBBcnRpZmFjdEdyb3VwVGVtcGxhdGUge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuc2NtLWFydGlmYWN0LWdyb3VwJykpO1xuXHRcdGNvbnN0IGljb24gPSBhcHBlbmQoZWxlbWVudCwgJCgnLmljb24nKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBuZXcgSWNvbkxhYmVsKGVsZW1lbnQsIHsgc3VwcG9ydEljb25zOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLmFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IFdvcmtiZW5jaFRvb2xCYXIoYWN0aW9uc0NvbnRhaW5lciwgeyBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIgfSwgdGhpcy5fbWVudVNlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UsIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9jb21tYW5kU2VydmljZSwgdGhpcy5fdGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRyZXR1cm4geyBpY29uLCBsYWJlbCwgYWN0aW9uQmFyLCBlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSwgdGVtcGxhdGVEaXNwb3NhYmxlOiBjb21iaW5lZERpc3Bvc2FibGUobGFiZWwsIGFjdGlvbkJhcikgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudCwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQXJ0aWZhY3RHcm91cFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBub2RlLmVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRjb25zdCBhcnRpZmFjdEdyb3VwID0gbm9kZS5lbGVtZW50LmFydGlmYWN0R3JvdXA7XG5cblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uaXNUaGVtZUljb24oYXJ0aWZhY3RHcm91cC5pY29uKVxuXHRcdFx0PyBgaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShhcnRpZmFjdEdyb3VwLmljb24pfWBcblx0XHRcdDogJyc7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKGFydGlmYWN0R3JvdXAubmFtZSk7XG5cblx0XHRjb25zdCByZXBvc2l0b3J5TWVudXMgPSB0aGlzLl9zY21WaWV3U2VydmljZS5tZW51cy5nZXRSZXBvc2l0b3J5TWVudXMocHJvdmlkZXIpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGNvbm5lY3RQcmltYXJ5TWVudShyZXBvc2l0b3J5TWVudXMuZ2V0QXJ0aWZhY3RHcm91cE1lbnUoYXJ0aWZhY3RHcm91cCksIHByaW1hcnkgPT4ge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKHByaW1hcnkpO1xuXHRcdH0sICdpbmxpbmUnLCBwcm92aWRlcikpO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY29udGV4dCA9IGFydGlmYWN0R3JvdXA7XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8U0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50PiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQXJ0aWZhY3RHcm91cFRlbXBsYXRlLCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignU2hvdWxkIG5ldmVyIGhhcHBlbiBzaW5jZSBub2RlIGlzIGluY29tcHJlc3NpYmxlJyk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBBcnRpZmFjdEdyb3VwVGVtcGxhdGUsIGRldGFpbHM/OiBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogQXJ0aWZhY3RHcm91cFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIEFydGlmYWN0VGVtcGxhdGUge1xuXHRyZWFkb25seSBpY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbGFiZWw6IEljb25MYWJlbDtcblx0cmVhZG9ubHkgdGltZXN0YW1wQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdGltZXN0YW1wOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcbn1cblxuY2xhc3MgQXJ0aWZhY3RSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8U0NNQXJ0aWZhY3RUcmVlRWxlbWVudCB8IElSZXNvdXJjZU5vZGU8U0NNQXJ0aWZhY3RUcmVlRWxlbWVudCwgU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50PiwgRnV6enlTY29yZSwgQXJ0aWZhY3RUZW1wbGF0ZT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdhcnRpZmFjdCc7XG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiBBcnRpZmFjdFJlbmRlcmVyLlRFTVBMQVRFX0lEOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcixcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2NtVmlld1NlcnZpY2U6IElTQ01WaWV3U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2Vcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogQXJ0aWZhY3RUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5zY20tYXJ0aWZhY3QnKSk7XG5cdFx0Y29uc3QgaWNvbiA9IGFwcGVuZChlbGVtZW50LCAkKCcuaWNvbicpKTtcblx0XHRjb25zdCBsYWJlbCA9IG5ldyBJY29uTGFiZWwoZWxlbWVudCwgeyBzdXBwb3J0SWNvbnM6IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgdGltZXN0YW1wQ29udGFpbmVyID0gYXBwZW5kKGVsZW1lbnQsICQoJy50aW1lc3RhbXAtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHRpbWVzdGFtcCA9IGFwcGVuZCh0aW1lc3RhbXBDb250YWluZXIsICQoJy50aW1lc3RhbXAnKSk7XG5cblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKGVsZW1lbnQsICQoJy5hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBXb3JrYmVuY2hUb29sQmFyKGFjdGlvbnNDb250YWluZXIsIHsgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0sIHRoaXMuX21lbnVTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29tbWFuZFNlcnZpY2UsIHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHsgaWNvbiwgbGFiZWwsIHRpbWVzdGFtcENvbnRhaW5lciwgdGltZXN0YW1wLCBhY3Rpb25CYXIsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCB0ZW1wbGF0ZURpc3Bvc2FibGU6IGNvbWJpbmVkRGlzcG9zYWJsZShsYWJlbCwgYWN0aW9uQmFyKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlT3JFbGVtZW50OiBJVHJlZU5vZGU8U0NNQXJ0aWZhY3RUcmVlRWxlbWVudCB8IElSZXNvdXJjZU5vZGU8U0NNQXJ0aWZhY3RUcmVlRWxlbWVudCwgU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50PiwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogQXJ0aWZhY3RUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGFydGlmYWN0T3JGb2xkZXIgPSBub2RlT3JFbGVtZW50LmVsZW1lbnQ7XG5cblx0XHQvLyBMYWJlbFxuXHRcdGlmIChpc1NDTUFydGlmYWN0VHJlZUVsZW1lbnQoYXJ0aWZhY3RPckZvbGRlcikpIHtcblx0XHRcdC8vIEFydGlmYWN0XG5cdFx0XHRjb25zdCBhcnRpZmFjdEdyb3VwID0gYXJ0aWZhY3RPckZvbGRlci5ncm91cDtcblx0XHRcdGNvbnN0IGFydGlmYWN0ID0gYXJ0aWZhY3RPckZvbGRlci5hcnRpZmFjdDtcblxuXHRcdFx0Y29uc3QgYXJ0aWZhY3RJY29uID0gYXJ0aWZhY3QuaWNvbiA/PyBhcnRpZmFjdE9yRm9sZGVyLmdyb3VwLmljb247XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uaXNUaGVtZUljb24oYXJ0aWZhY3RJY29uKVxuXHRcdFx0XHQ/IGBpY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGFydGlmYWN0SWNvbil9YFxuXHRcdFx0XHQ6ICcnO1xuXG5cdFx0XHRjb25zdCBhcnRpZmFjdExhYmVsID0gYXJ0aWZhY3RHcm91cC5zdXBwb3J0c0ZvbGRlcnNcblx0XHRcdFx0PyBhcnRpZmFjdC5uYW1lLnNwbGl0KCcvJykucG9wKCkgPz8gYXJ0aWZhY3QubmFtZVxuXHRcdFx0XHQ6IGFydGlmYWN0Lm5hbWU7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0TGFiZWwoYXJ0aWZhY3RMYWJlbCwgYXJ0aWZhY3QuZGVzY3JpcHRpb24pO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wLnRleHRDb250ZW50ID0gYXJ0aWZhY3QudGltZXN0YW1wID8gZnJvbU5vdyhhcnRpZmFjdC50aW1lc3RhbXApIDogJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2R1cGxpY2F0ZScsIGFydGlmYWN0T3JGb2xkZXIuaGlkZVRpbWVzdGFtcCk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3ROb2RlKGFydGlmYWN0T3JGb2xkZXIpKSB7XG5cdFx0XHQvLyBGb2xkZXJcblx0XHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9IGBpY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZm9sZGVyKX1gO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKGJhc2VuYW1lKGFydGlmYWN0T3JGb2xkZXIudXJpKSk7XG5cblx0XHRcdHRlbXBsYXRlRGF0YS50aW1lc3RhbXAudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRlbXBsYXRlRGF0YS50aW1lc3RhbXBDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZHVwbGljYXRlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0Ly8gQWN0aW9uc1xuXHRcdHRoaXMuX3JlbmRlckFjdGlvbkJhcihhcnRpZmFjdE9yRm9sZGVyLCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFNDTUFydGlmYWN0VHJlZUVsZW1lbnQgfCBJUmVzb3VyY2VOb2RlPFNDTUFydGlmYWN0VHJlZUVsZW1lbnQsIFNDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudD4+LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBBcnRpZmFjdFRlbXBsYXRlLCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0Y29uc3QgYXJ0aWZhY3RPckZvbGRlciA9IGNvbXByZXNzZWQuZWxlbWVudHNbY29tcHJlc3NlZC5lbGVtZW50cy5sZW5ndGggLSAxXTtcblxuXHRcdC8vIExhYmVsXG5cdFx0aWYgKGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChhcnRpZmFjdE9yRm9sZGVyKSkge1xuXHRcdFx0Ly8gQXJ0aWZhY3Rcblx0XHRcdGNvbnN0IGFydGlmYWN0ID0gYXJ0aWZhY3RPckZvbGRlci5hcnRpZmFjdDtcblxuXHRcdFx0Y29uc3QgYXJ0aWZhY3RJY29uID0gYXJ0aWZhY3QuaWNvbiA/PyBhcnRpZmFjdE9yRm9sZGVyLmdyb3VwLmljb247XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uaXNUaGVtZUljb24oYXJ0aWZhY3RJY29uKVxuXHRcdFx0XHQ/IGBpY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGFydGlmYWN0SWNvbil9YFxuXHRcdFx0XHQ6ICcnO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0TGFiZWwoYXJ0aWZhY3QubmFtZSwgYXJ0aWZhY3QuZGVzY3JpcHRpb24pO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wLnRleHRDb250ZW50ID0gYXJ0aWZhY3QudGltZXN0YW1wID8gZnJvbU5vdyhhcnRpZmFjdC50aW1lc3RhbXApIDogJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2R1cGxpY2F0ZScsIGFydGlmYWN0T3JGb2xkZXIuaGlkZVRpbWVzdGFtcCk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3ROb2RlKGFydGlmYWN0T3JGb2xkZXIpKSB7XG5cdFx0XHQvLyBGb2xkZXJcblx0XHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9IGBpY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZm9sZGVyKX1gO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKGFydGlmYWN0T3JGb2xkZXIudXJpLmZzUGF0aC5zdWJzdHJpbmcoMSkpO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGltZXN0YW1wQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2R1cGxpY2F0ZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRpbWVzdGFtcENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIEFjdGlvbnNcblx0XHR0aGlzLl9yZW5kZXJBY3Rpb25CYXIoYXJ0aWZhY3RPckZvbGRlciwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckFjdGlvbkJhcihhcnRpZmFjdE9yRm9sZGVyOiBTQ01BcnRpZmFjdFRyZWVFbGVtZW50IHwgSVJlc291cmNlTm9kZTxTQ01BcnRpZmFjdFRyZWVFbGVtZW50LCBTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQ+LCB0ZW1wbGF0ZURhdGE6IEFydGlmYWN0VGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoaXNTQ01BcnRpZmFjdFRyZWVFbGVtZW50KGFydGlmYWN0T3JGb2xkZXIpKSB7XG5cdFx0XHRjb25zdCBhcnRpZmFjdCA9IGFydGlmYWN0T3JGb2xkZXIuYXJ0aWZhY3Q7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGFydGlmYWN0T3JGb2xkZXIucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnlNZW51cyA9IHRoaXMuX3NjbVZpZXdTZXJ2aWNlLm1lbnVzLmdldFJlcG9zaXRvcnlNZW51cyhwcm92aWRlcik7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChjb25uZWN0UHJpbWFyeU1lbnUocmVwb3NpdG9yeU1lbnVzLmdldEFydGlmYWN0TWVudShhcnRpZmFjdE9yRm9sZGVyLmdyb3VwLCBhcnRpZmFjdCksIHByaW1hcnkgPT4ge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMocHJpbWFyeSk7XG5cdFx0XHR9LCAnaW5saW5lJywgcHJvdmlkZXIpKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY29udGV4dCA9IGFydGlmYWN0O1xuXHRcdH0gZWxzZSBpZiAoUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGFydGlmYWN0T3JGb2xkZXIpKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMoW10pO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxTQ01BcnRpZmFjdFRyZWVFbGVtZW50IHwgSVJlc291cmNlTm9kZTxTQ01BcnRpZmFjdFRyZWVFbGVtZW50LCBTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQ+LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBBcnRpZmFjdFRlbXBsYXRlLCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IEFydGlmYWN0VGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBSZXBvc2l0b3J5VHJlZURhdGFTb3VyY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxJU0NNVmlld1NlcnZpY2UsIFRyZWVFbGVtZW50PiB7XG5cdGNvbnN0cnVjdG9yKEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGlucHV0T3JFbGVtZW50OiBJU0NNVmlld1NlcnZpY2UgfCBUcmVlRWxlbWVudCk6IFByb21pc2U8SXRlcmFibGU8VHJlZUVsZW1lbnQ+PiB7XG5cdFx0aWYgKHRoaXMuc2NtVmlld1NlcnZpY2UuZXhwbG9yZXJFbmFibGVkQ29uZmlnLmdldCgpID09PSBmYWxzZSkge1xuXHRcdFx0Y29uc3QgcGFyZW50SWQgPSBpc1NDTVJlcG9zaXRvcnkoaW5wdXRPckVsZW1lbnQpXG5cdFx0XHRcdD8gaW5wdXRPckVsZW1lbnQucHJvdmlkZXIuaWRcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHJlcG9zaXRvcmllcyA9IHRoaXMuc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzXG5cdFx0XHRcdC5maWx0ZXIociA9PiByLnByb3ZpZGVyLnBhcmVudElkID09PSBwYXJlbnRJZCk7XG5cblx0XHRcdHJldHVybiByZXBvc2l0b3JpZXM7XG5cdFx0fVxuXG5cdFx0Ly8gRXhwbG9yZXIgbW9kZVxuXHRcdGlmIChpbnB1dE9yRWxlbWVudCBpbnN0YW5jZW9mIFNDTVZpZXdTZXJ2aWNlKSB7XG5cdFx0XHQvLyBHZXQgYWxsIHRvcCBsZXZlbCByZXBvc2l0b3JpZXNcblx0XHRcdGNvbnN0IHJlcG9zaXRvcmllcyA9IHRoaXMuc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzXG5cdFx0XHRcdC5maWx0ZXIociA9PiByLnByb3ZpZGVyLnBhcmVudElkID09PSB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBDaGVjayB3aGV0aGVyIHRoZXJlIGFyZSBhbnkgY2hpbGQgcmVwb3NpdG9yaWVzXG5cdFx0XHRpZiAocmVwb3NpdG9yaWVzLmxlbmd0aCAhPT0gdGhpcy5zY21WaWV3U2VydmljZS5yZXBvc2l0b3JpZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeSBvZiByZXBvc2l0b3JpZXMpIHtcblx0XHRcdFx0XHRjb25zdCBjaGlsZFJlcG9zaXRvcmllcyA9IHRoaXMuc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzXG5cdFx0XHRcdFx0XHQuZmlsdGVyKHIgPT4gci5wcm92aWRlci5wYXJlbnRJZCA9PT0gcmVwb3NpdG9yeS5wcm92aWRlci5pZCk7XG5cblx0XHRcdFx0XHRpZiAoY2hpbGRSZXBvc2l0b3JpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBJbnNlcnQgY2hpbGQgcmVwb3NpdG9yaWVzIHJpZ2h0IGFmdGVyIHRoZSBwYXJlbnRcblx0XHRcdFx0XHRjb25zdCByZXBvc2l0b3J5SW5kZXggPSByZXBvc2l0b3JpZXMuaW5kZXhPZihyZXBvc2l0b3J5KTtcblx0XHRcdFx0XHRyZXBvc2l0b3JpZXMuc3BsaWNlKHJlcG9zaXRvcnlJbmRleCArIDEsIDAsIC4uLmNoaWxkUmVwb3NpdG9yaWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVwb3NpdG9yaWVzO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXBvc2l0b3J5KGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgYXJ0aWZhY3RHcm91cHMgPSBhd2FpdCBpbnB1dE9yRWxlbWVudC5wcm92aWRlci5hcnRpZmFjdFByb3ZpZGVyLmdldCgpPy5wcm92aWRlQXJ0aWZhY3RHcm91cHMoKSA/PyBbXTtcblx0XHRcdHJldHVybiBhcnRpZmFjdEdyb3Vwcy5tYXAoZ3JvdXAgPT4gKHtcblx0XHRcdFx0cmVwb3NpdG9yeTogaW5wdXRPckVsZW1lbnQsXG5cdFx0XHRcdGFydGlmYWN0R3JvdXA6IGdyb3VwLFxuXHRcdFx0XHR0eXBlOiAnYXJ0aWZhY3RHcm91cCdcblx0XHRcdH0pKTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50KGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IGlucHV0T3JFbGVtZW50LnJlcG9zaXRvcnk7XG5cdFx0XHRjb25zdCBhcnRpZmFjdHMgPSBhd2FpdCByZXBvc2l0b3J5LnByb3ZpZGVyLmFydGlmYWN0UHJvdmlkZXIuZ2V0KCk/LnByb3ZpZGVBcnRpZmFjdHMoaW5wdXRPckVsZW1lbnQuYXJ0aWZhY3RHcm91cC5pZCkgPz8gW107XG5cblx0XHRcdGlmIChpbnB1dE9yRWxlbWVudC5hcnRpZmFjdEdyb3VwLnN1cHBvcnRzRm9sZGVycykge1xuXHRcdFx0XHQvLyBSZXNvdXJjZSB0cmVlIGZvciBhcnRpZmFjdHNcblx0XHRcdFx0Y29uc3QgYXJ0aWZhY3RzVHJlZSA9IG5ldyBSZXNvdXJjZVRyZWU8U0NNQXJ0aWZhY3RUcmVlRWxlbWVudCwgU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50PihpbnB1dE9yRWxlbWVudCk7XG5cdFx0XHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBhcnRpZmFjdHMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgYXJ0aWZhY3QgPSBhcnRpZmFjdHNbaW5kZXhdO1xuXHRcdFx0XHRcdGNvbnN0IGFydGlmYWN0VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdzY20tYXJ0aWZhY3QnLCBwYXRoOiBhcnRpZmFjdC5uYW1lIH0pO1xuXHRcdFx0XHRcdGNvbnN0IGFydGlmYWN0RGlyZWN0b3J5ID0gYXJ0aWZhY3QuaWQubGFzdEluZGV4T2YoJy8nKSA+IDBcblx0XHRcdFx0XHRcdD8gYXJ0aWZhY3QuaWQuc3Vic3RyaW5nKDAsIGFydGlmYWN0LmlkLmxhc3RJbmRleE9mKCcvJykpXG5cdFx0XHRcdFx0XHQ6IGFydGlmYWN0LmlkO1xuXG5cdFx0XHRcdFx0Y29uc3QgcHJldkFydGlmYWN0ID0gaW5kZXggPiAwID8gYXJ0aWZhY3RzW2luZGV4IC0gMV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgcHJldkFydGlmYWN0RGlyZWN0b3J5ID0gcHJldkFydGlmYWN0ICYmIHByZXZBcnRpZmFjdC5pZC5sYXN0SW5kZXhPZignLycpID4gMFxuXHRcdFx0XHRcdFx0PyBwcmV2QXJ0aWZhY3QuaWQuc3Vic3RyaW5nKDAsIHByZXZBcnRpZmFjdC5pZC5sYXN0SW5kZXhPZignLycpKVxuXHRcdFx0XHRcdFx0OiBwcmV2QXJ0aWZhY3Q/LmlkO1xuXG5cdFx0XHRcdFx0Y29uc3QgaGlkZVRpbWVzdGFtcCA9IGluZGV4ID4gMCAmJlxuXHRcdFx0XHRcdFx0YXJ0aWZhY3QudGltZXN0YW1wICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0XHRcdHByZXZBcnRpZmFjdD8udGltZXN0YW1wICE9PSB1bmRlZmluZWQgJiZcblx0XHRcdFx0XHRcdGFydGlmYWN0RGlyZWN0b3J5ID09PSBwcmV2QXJ0aWZhY3REaXJlY3RvcnkgJiZcblx0XHRcdFx0XHRcdGZyb21Ob3cocHJldkFydGlmYWN0LnRpbWVzdGFtcCkgPT09IGZyb21Ob3coYXJ0aWZhY3QudGltZXN0YW1wKTtcblxuXHRcdFx0XHRcdGFydGlmYWN0c1RyZWUuYWRkKGFydGlmYWN0VXJpLCB7XG5cdFx0XHRcdFx0XHRyZXBvc2l0b3J5LFxuXHRcdFx0XHRcdFx0Z3JvdXA6IGlucHV0T3JFbGVtZW50LmFydGlmYWN0R3JvdXAsXG5cdFx0XHRcdFx0XHRhcnRpZmFjdCxcblx0XHRcdFx0XHRcdGhpZGVUaW1lc3RhbXAsXG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJ0aWZhY3QnXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gSXRlcmFibGUubWFwKGFydGlmYWN0c1RyZWUucm9vdC5jaGlsZHJlbiwgbm9kZSA9PiBub2RlLmVsZW1lbnQgPz8gbm9kZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZsYXQgbGlzdCBvZiBhcnRpZmFjdHNcblx0XHRcdHJldHVybiBhcnRpZmFjdHMubWFwKChhcnRpZmFjdCwgaW5kZXgsIGFydGlmYWN0cykgPT4gKHtcblx0XHRcdFx0cmVwb3NpdG9yeSxcblx0XHRcdFx0Z3JvdXA6IGlucHV0T3JFbGVtZW50LmFydGlmYWN0R3JvdXAsXG5cdFx0XHRcdGFydGlmYWN0LFxuXHRcdFx0XHRoaWRlVGltZXN0YW1wOiBpbmRleCA+IDAgJiZcblx0XHRcdFx0XHRhcnRpZmFjdC50aW1lc3RhbXAgIT09IHVuZGVmaW5lZCAmJlxuXHRcdFx0XHRcdGFydGlmYWN0c1tpbmRleCAtIDFdLnRpbWVzdGFtcCAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHRcdFx0ZnJvbU5vdyhhcnRpZmFjdHNbaW5kZXggLSAxXS50aW1lc3RhbXAhKSA9PT0gZnJvbU5vdyhhcnRpZmFjdC50aW1lc3RhbXApLFxuXHRcdFx0XHR0eXBlOiAnYXJ0aWZhY3QnXG5cdFx0XHR9IHNhdGlzZmllcyBTQ01BcnRpZmFjdFRyZWVFbGVtZW50KSk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0Tm9kZShpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBJdGVyYWJsZS5tYXAoaW5wdXRPckVsZW1lbnQuY2hpbGRyZW4sXG5cdFx0XHRcdG5vZGUgPT4gbm9kZS5lbGVtZW50ICYmIG5vZGUuY2hpbGRyZW5Db3VudCA9PT0gMCA/IG5vZGUuZWxlbWVudCA6IG5vZGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGhhc0NoaWxkcmVuKGlucHV0T3JFbGVtZW50OiBJU0NNVmlld1NlcnZpY2UgfCBUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnNjbVZpZXdTZXJ2aWNlLmV4cGxvcmVyRW5hYmxlZENvbmZpZy5nZXQoKSA9PT0gZmFsc2UpIHtcblx0XHRcdGNvbnN0IHBhcmVudElkID0gaXNTQ01SZXBvc2l0b3J5KGlucHV0T3JFbGVtZW50KVxuXHRcdFx0XHQ/IGlucHV0T3JFbGVtZW50LnByb3ZpZGVyLmlkXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCByZXBvc2l0b3JpZXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllc1xuXHRcdFx0XHQuZmlsdGVyKHIgPT4gci5wcm92aWRlci5wYXJlbnRJZCA9PT0gcGFyZW50SWQpO1xuXG5cdFx0XHRyZXR1cm4gcmVwb3NpdG9yaWVzLmxlbmd0aCA+IDA7XG5cdFx0fVxuXG5cdFx0Ly8gRXhwbG9yZXIgbW9kZVxuXHRcdGlmIChpbnB1dE9yRWxlbWVudCBpbnN0YW5jZW9mIFNDTVZpZXdTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zY21WaWV3U2VydmljZS5yZXBvc2l0b3JpZXMubGVuZ3RoID4gMDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVwb3NpdG9yeShpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQoaW5wdXRPckVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3ROb2RlKGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGlucHV0T3JFbGVtZW50LmNoaWxkcmVuQ291bnQgPiAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFJlcG9zaXRvcnlUcmVlSWRlbnRpdHlQcm92aWRlciBpbXBsZW1lbnRzIElJZGVudGl0eVByb3ZpZGVyPFRyZWVFbGVtZW50PiB7XG5cdGdldElkKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHRpZiAoaXNTQ01SZXBvc2l0b3J5KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gYHJlcG86JHtlbGVtZW50LnByb3ZpZGVyLmlkfWA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGBhcnRpZmFjdEdyb3VwOiR7ZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyLmlkfS8ke2VsZW1lbnQuYXJ0aWZhY3RHcm91cC5pZH1gO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gYGFydGlmYWN0OiR7ZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyLmlkfS8ke2VsZW1lbnQuZ3JvdXAuaWR9LyR7ZWxlbWVudC5hcnRpZmFjdC5pZH1gO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdE5vZGUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBgYXJ0aWZhY3RGb2xkZXI6JHtlbGVtZW50LmNvbnRleHQucmVwb3NpdG9yeS5wcm92aWRlci5pZH0vJHtlbGVtZW50LmNvbnRleHQuYXJ0aWZhY3RHcm91cC5pZH0vJHtlbGVtZW50LnVyaS5mc1BhdGh9YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRyZWUgZWxlbWVudCcpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSZXBvc2l0b3JpZXNUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZSBpbXBsZW1lbnRzIElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZTxUcmVlRWxlbWVudD4ge1xuXHRpc0luY29tcHJlc3NpYmxlKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuY2hpbGRyZW5Db3VudCA+IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU0NNUmVwb3NpdG9yaWVzVmlld1BhbmUgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cblx0cHJpdmF0ZSB0cmVlITogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU0NNVmlld1NlcnZpY2UsIFRyZWVFbGVtZW50Pjtcblx0cHJpdmF0ZSB0cmVlRGF0YVNvdXJjZSE6IFJlcG9zaXRvcnlUcmVlRGF0YVNvdXJjZTtcblx0cHJpdmF0ZSB0cmVlSWRlbnRpdHlQcm92aWRlciE6IFJlcG9zaXRvcnlUcmVlSWRlbnRpdHlQcm92aWRlcjtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlT3BlcmF0aW9uU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZUNoaWxkcmVuVGhyb3R0bGVyID0gbmV3IFRocm90dGxlcigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJsZUNvdW50T2JzOiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb3ZpZGVyQ291bnRCYWRnZU9iczogSU9ic2VydmFibGU8J2hpZGRlbicgfCAnYXV0bycgfCAndmlzaWJsZSc+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJpbGl0eURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlcG9zaXRvcnlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlTWFwPElTQ01SZXBvc2l0b3J5PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElTQ01TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2NtU2VydmljZTogSVNDTVNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVZpZXdTZXJ2aWNlOiBJU0NNVmlld1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoeyAuLi5vcHRpb25zLCB0aXRsZU1lbnVJZDogTWVudUlkLlNDTVNvdXJjZUNvbnRyb2xUaXRsZSB9LCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMudmlzaWJsZUNvdW50T2JzID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKCdzY20ucmVwb3NpdG9yaWVzLnZpc2libGUnLCAxMCwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5wcm92aWRlckNvdW50QmFkZ2VPYnMgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8J2hpZGRlbicgfCAnYXV0bycgfCAndmlzaWJsZSc+KCdzY20ucHJvdmlkZXJDb3VudEJhZGdlJywgJ2hpZGRlbicsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5zdG9yZVRyZWVWaWV3U3RhdGUoKTtcblx0XHR9LCB0aGlzLCB0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnVwZGF0ZUNoaWxkcmVuVGhyb3R0bGVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCB0cmVlQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNjbS12aWV3LnNjbS1yZXBvc2l0b3JpZXMtdmlldycpKTtcblxuXHRcdC8vIHNjbS5wcm92aWRlckNvdW50QmFkZ2Ugc2V0dGluZ1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyQ291bnRCYWRnZSA9IHRoaXMucHJvdmlkZXJDb3VudEJhZGdlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZS1wcm92aWRlci1jb3VudHMnLCBwcm92aWRlckNvdW50QmFkZ2UgPT09ICdoaWRkZW4nKTtcblx0XHRcdHRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYXV0by1wcm92aWRlci1jb3VudHMnLCBwcm92aWRlckNvdW50QmFkZ2UgPT09ICdhdXRvJyk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5sb2FkVHJlZVZpZXdTdGF0ZSgpO1xuXHRcdHRoaXMuY3JlYXRlVHJlZSh0cmVlQ29udGFpbmVyLCB2aWV3U3RhdGUpO1xuXG5cdFx0dGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KGFzeW5jIHZpc2libGUgPT4ge1xuXHRcdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gSW5pdGlhbCByZW5kZXJpbmdcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLnNldElucHV0KHRoaXMuc2NtVmlld1NlcnZpY2UsIHZpZXdTdGF0ZSk7XG5cblx0XHRcdFx0Ly8gc2NtLnJlcG9zaXRvcmllcy52aXNpYmxlIHNldHRpbmdcblx0XHRcdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCB2aXNpYmxlQ291bnQgPSB0aGlzLnZpc2libGVDb3VudE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVCb2R5U2l6ZSh0aGlzLnRyZWUuY29udGVudEhlaWdodCwgdmlzaWJsZUNvdW50KTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIHNjbS5yZXBvc2l0b3JpZXMuZXhwbG9yZXIgc2V0dGluZ1xuXHRcdFx0XHR0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcy5hZGQocnVuT25DaGFuZ2UodGhpcy5zY21WaWV3U2VydmljZS5leHBsb3JlckVuYWJsZWRDb25maWcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVCb2R5U2l6ZSh0aGlzLnRyZWUuY29udGVudEhlaWdodCk7XG5cblx0XHRcdFx0XHQvLyBJZiB3ZSBvbmx5IGhhdmUgb25lIHJlcG9zaXRvcnksIGV4cGFuZCBpdFxuXHRcdFx0XHRcdGlmICh0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZSgoKSA9PlxuXHRcdFx0XHRcdFx0XHR0aGlzLnRyZWUuZXhwYW5kKHRoaXMuc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzWzBdKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gVXBkYXRlIHRyZWUgc2VsZWN0aW9uXG5cdFx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlVmlzaWJsZVJlcG9zaXRvcmllc1NpZ25hbCA9IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQoXG5cdFx0XHRcdFx0dGhpcywgdGhpcy5zY21WaWV3U2VydmljZS5vbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXMpO1xuXG5cdFx0XHRcdHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzLmFkZChhdXRvcnVuKGFzeW5jIHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VWaXNpYmxlUmVwb3NpdG9yaWVzU2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoKCkgPT4gdGhpcy51cGRhdGVUcmVlU2VsZWN0aW9uKCkpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gQWRkL1JlbW92ZSBldmVudCBoYW5kbGVyc1xuXHRcdFx0XHR0aGlzLnNjbVNlcnZpY2Uub25EaWRBZGRSZXBvc2l0b3J5KHRoaXMub25EaWRBZGRSZXBvc2l0b3J5LCB0aGlzLCB0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdHRoaXMuc2NtU2VydmljZS5vbkRpZFJlbW92ZVJlcG9zaXRvcnkodGhpcy5vbkRpZFJlbW92ZVJlcG9zaXRvcnksIHRoaXMsIHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzKTtcblx0XHRcdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdFx0XHR0aGlzLm9uRGlkQWRkUmVwb3NpdG9yeShyZXBvc2l0b3J5KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEV4cGFuZCByZXBvc2l0b3J5IGlmIHRoZXJlIGlzIG9ubHkgb25lXG5cdFx0XHRcdHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzLmFkZChhdXRvcnVuKGFzeW5jIHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXhwbG9yZXJFbmFibGVkQ29uZmlnID0gdGhpcy5zY21WaWV3U2VydmljZS5leHBsb3JlckVuYWJsZWRDb25maWcucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGNvbnN0IGRpZEZpbmlzaExvYWRpbmdSZXBvc2l0b3JpZXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLmRpZEZpbmlzaExvYWRpbmdSZXBvc2l0b3JpZXMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRcdFx0aWYgKHZpZXdTdGF0ZSA9PT0gdW5kZWZpbmVkICYmIGV4cGxvcmVyRW5hYmxlZENvbmZpZyAmJiBkaWRGaW5pc2hMb2FkaW5nUmVwb3NpdG9yaWVzICYmIHRoaXMuc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKCgpID0+XG5cdFx0XHRcdFx0XHRcdHRoaXMudHJlZS5leHBhbmQodGhpcy5zY21WaWV3U2VydmljZS5yZXBvc2l0b3JpZXNbMF0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdH0sIHRoaXMsIHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLnRyZWUubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVHJlZShjb250YWluZXI6IEhUTUxFbGVtZW50LCB2aWV3U3RhdGU/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMudHJlZUlkZW50aXR5UHJvdmlkZXIgPSBuZXcgUmVwb3NpdG9yeVRyZWVJZGVudGl0eVByb3ZpZGVyKCk7XG5cdFx0dGhpcy50cmVlRGF0YVNvdXJjZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwb3NpdG9yeVRyZWVEYXRhU291cmNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWVEYXRhU291cmNlKTtcblxuXHRcdHRoaXMudHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlLFxuXHRcdFx0J1NDTSBSZXBvc2l0b3JpZXMnLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IExpc3REZWxlZ2F0ZSgpLFxuXHRcdFx0bmV3IFJlcG9zaXRvcmllc1RyZWVDb21wcmVzc2lvbkRlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwb3NpdG9yeVJlbmRlcmVyLCBNZW51SWQuU0NNU291cmNlQ29udHJvbElubGluZSwgZ2V0QWN0aW9uVmlld0l0ZW1Qcm92aWRlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQXJ0aWZhY3RHcm91cFJlbmRlcmVyLCBnZXRBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBcnRpZmFjdFJlbmRlcmVyLCBnZXRBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpKVxuXHRcdFx0XSxcblx0XHRcdHRoaXMudHJlZURhdGFTb3VyY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHRoaXMudHJlZUlkZW50aXR5UHJvdmlkZXIsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRjb2xsYXBzZUJ5RGVmYXVsdDogKGU6IHVua25vd24pID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5zY21WaWV3U2VydmljZS5leHBsb3JlckVuYWJsZWRDb25maWcuZ2V0KCkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRpZiAoaXNTQ01SZXBvc2l0b3J5KGUpICYmIGUucHJvdmlkZXIucGFyZW50SWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBFeHBsb3JlciBtb2RlXG5cdFx0XHRcdFx0aWYgKHZpZXdTdGF0ZT8uZXhwYW5kZWQgJiYgKGlzU0NNUmVwb3NpdG9yeShlKSB8fCBpc1NDTUFydGlmYWN0R3JvdXBUcmVlRWxlbWVudChlKSB8fCBpc1NDTUFydGlmYWN0VHJlZUVsZW1lbnQoZSkpKSB7XG5cdFx0XHRcdFx0XHQvLyBPbmx5IGV4cGFuZCByZXBvc2l0b3JpZXMvYXJ0aWZhY3QgZ3JvdXBzL2FydGlmYWN0cyB0aGF0IHdlcmUgZXhwYW5kZWQgYmVmb3JlXG5cdFx0XHRcdFx0XHRyZXR1cm4gdmlld1N0YXRlLmV4cGFuZGVkLmluZGV4T2YodGhpcy50cmVlSWRlbnRpdHlQcm92aWRlci5nZXRJZChlKSkgPT09IC0xO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdE5vZGUoZSkpIHtcblx0XHRcdFx0XHRcdC8vIE9ubHkgZXhwYW5kIGFydGlmYWN0IGZvbGRlcnMgYXMgdGhleSBhcmUgY29tcHJlc3NlZCBieSBkZWZhdWx0XG5cdFx0XHRcdFx0XHRyZXR1cm4gIShlLmNoaWxkcmVuQ291bnQgPT09IDEgJiYgSXRlcmFibGUuZmlyc3QoZS5jaGlsZHJlbik/LmVsZW1lbnQgPT09IHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcHJlc3Npb25FbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczogdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCkubGlzdE92ZXJyaWRlU3R5bGVzLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRoaXMuc2NtVmlld1NlcnZpY2Uuc2VsZWN0aW9uTW9kZUNvbmZpZy5nZXQoKSA9PT0gJ211bHRpcGxlJyxcblx0XHRcdFx0ZXhwYW5kT25Eb3VibGVDbGljazogdHJ1ZSxcblx0XHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWwoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5wcm92aWRlci5sYWJlbDtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuYXJ0aWZhY3RHcm91cC5uYW1lO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChpc1NDTUFydGlmYWN0VHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuYXJ0aWZhY3QubmFtZTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2NtJywgXCJTb3VyY2UgQ29udHJvbCBSZXBvc2l0b3JpZXNcIik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSBhcyBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPElTQ01WaWV3U2VydmljZSwgVHJlZUVsZW1lbnQ+O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25Nb2RlID0gdGhpcy5zY21WaWV3U2VydmljZS5zZWxlY3Rpb25Nb2RlQ29uZmlnLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudHJlZS51cGRhdGVPcHRpb25zKHsgbXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBzZWxlY3Rpb25Nb2RlID09PSAnbXVsdGlwbGUnIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4odGhpcy5vblRyZWVEaWRPcGVuLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKHRoaXMub25UcmVlU2VsZWN0aW9uQ2hhbmdlLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlRm9jdXModGhpcy5vblRyZWVEaWRDaGFuZ2VGb2N1cywgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZEZvY3VzKHRoaXMub25EaWRUcmVlRm9jdXMsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25Db250ZXh0TWVudSh0aGlzLm9uVHJlZUNvbnRleHRNZW51LCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCh0aGlzLm9uVHJlZUNvbnRlbnRIZWlnaHRDaGFuZ2UsIHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRBZGRSZXBvc2l0b3J5KHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBBcnRpZmFjdCBncm91cCBjaGFuZ2VkXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4oYXN5bmMgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGV4cGxvcmVyRW5hYmxlZCA9IHRoaXMuc2NtVmlld1NlcnZpY2UuZXhwbG9yZXJFbmFibGVkQ29uZmlnLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGFydGlmYWN0c1Byb3ZpZGVyID0gcmVwb3NpdG9yeS5wcm92aWRlci5hcnRpZmFjdFByb3ZpZGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZXhwbG9yZXJFbmFibGVkIHx8ICFhcnRpZmFjdHNQcm92aWRlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYXJ0aWZhY3RzUHJvdmlkZXIub25EaWRDaGFuZ2VBcnRpZmFjdHMoYXN5bmMgZ3JvdXBzID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVSZXBvc2l0b3J5KHJlcG9zaXRvcnkpO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEhpc3RvcnlJdGVtUmVmIGNoYW5nZWRcblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihhc3luYyByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeS5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFoaXN0b3J5UHJvdmlkZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJ1bk9uQ2hhbmdlKGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbVJlZiwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVJlcG9zaXRvcnkocmVwb3NpdG9yeSk7XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVSZXBvc2l0b3J5KHJlcG9zaXRvcnkpO1xuXHRcdHRoaXMucmVwb3NpdG9yeURpc3Bvc2FibGVzLnNldChyZXBvc2l0b3J5LCBkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkUmVtb3ZlUmVwb3NpdG9yeShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMudXBkYXRlUmVwb3NpdG9yeShyZXBvc2l0b3J5KTtcblx0XHR0aGlzLnJlcG9zaXRvcnlEaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHJlcG9zaXRvcnkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblRyZWVEaWRPcGVuKGU6IElPcGVuRXZlbnQ8VHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ+KTogdm9pZCB7XG5cdFx0aWYgKCFlLmVsZW1lbnQgfHwgIWlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChlLmVsZW1lbnQpIHx8ICFlLmVsZW1lbnQuYXJ0aWZhY3QuY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZS5lbGVtZW50LmFydGlmYWN0LmNvbW1hbmQuaWQsIGUuZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyLCBlLmVsZW1lbnQuYXJ0aWZhY3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblRyZWVDb250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8VHJlZUVsZW1lbnQ+KTogdm9pZCB7XG5cdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNTQ01SZXBvc2l0b3J5KGUuZWxlbWVudCkpIHtcblx0XHRcdC8vIFJlcG9zaXRvcnlcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gZS5lbGVtZW50LnByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgbWVudXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLm1lbnVzLmdldFJlcG9zaXRvcnlNZW51cyhwcm92aWRlcik7XG5cdFx0XHRjb25zdCBtZW51ID0gbWVudXMuZ2V0UmVwb3NpdG9yeUNvbnRleHRNZW51KGUuZWxlbWVudCk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gY29sbGVjdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblxuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBhY3Rpb25SdW5uZXIgPSBuZXcgUmVwb3NpdG9yeUFjdGlvblJ1bm5lcigoKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFRyZWVTZWxlY3Rpb24oKTtcblx0XHRcdH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFjdGlvblJ1bm5lcik7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWN0aW9uUnVubmVyLm9uV2lsbFJ1bigoKSA9PiB0aGlzLnRyZWUuZG9tRm9jdXMoKSkpO1xuXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRhY3Rpb25SdW5uZXIsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBwcm92aWRlcixcblx0XHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKClcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdFRyZWVFbGVtZW50KGUuZWxlbWVudCkpIHtcblx0XHRcdC8vIEFydGlmYWN0XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGUuZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgYXJ0aWZhY3QgPSBlLmVsZW1lbnQuYXJ0aWZhY3Q7XG5cblx0XHRcdGNvbnN0IG1lbnVzID0gdGhpcy5zY21WaWV3U2VydmljZS5tZW51cy5nZXRSZXBvc2l0b3J5TWVudXMocHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgbWVudSA9IG1lbnVzLmdldEFydGlmYWN0TWVudShlLmVsZW1lbnQuZ3JvdXAsIGFydGlmYWN0KTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBjb2xsZWN0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUsIHByb3ZpZGVyKTtcblxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGFydGlmYWN0XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVHJlZVNlbGVjdGlvbkNoYW5nZShlOiBJVHJlZUV2ZW50PFRyZWVFbGVtZW50Pik6IHZvaWQge1xuXHRcdGlmIChlLmJyb3dzZXJFdmVudCAmJiBlLmVsZW1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMudHJlZS5zY3JvbGxUb3A7XG5cblx0XHRcdGlmIChlLmVsZW1lbnRzLmV2ZXJ5KGUgPT4gaXNTQ01SZXBvc2l0b3J5KGUpKSkge1xuXHRcdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLnZpc2libGVSZXBvc2l0b3JpZXMgPSBlLmVsZW1lbnRzO1xuXHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnRzLmV2ZXJ5KGUgPT4gaXNTQ01BcnRpZmFjdEdyb3VwVHJlZUVsZW1lbnQoZSkgfHwgaXNTQ01BcnRpZmFjdFRyZWVFbGVtZW50KGUpKSkge1xuXHRcdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLnZpc2libGVSZXBvc2l0b3JpZXMgPSBlLmVsZW1lbnRzLm1hcChlID0+IGUucmVwb3NpdG9yeSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJlZS5zY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblRyZWVEaWRDaGFuZ2VGb2N1cyhlOiBJVHJlZUV2ZW50PFRyZWVFbGVtZW50Pik6IHZvaWQge1xuXHRcdGlmIChlLmJyb3dzZXJFdmVudCAmJiBlLmVsZW1lbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmIChpc1NDTVJlcG9zaXRvcnkoZS5lbGVtZW50c1swXSkpIHtcblx0XHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS5mb2N1cyhlLmVsZW1lbnRzWzBdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkVHJlZUZvY3VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnRyZWUuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoaXNTQ01SZXBvc2l0b3J5KGZvY3VzZWRbMF0pKSB7XG5cdFx0XHRcdHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXMoZm9jdXNlZFswXSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50KGZvY3VzZWRbMF0pIHx8IGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChmb2N1c2VkWzBdKSkge1xuXHRcdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzKGZvY3VzZWRbMF0ucmVwb3NpdG9yeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblRyZWVDb250ZW50SGVpZ2h0Q2hhbmdlKGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVCb2R5U2l6ZShoZWlnaHQpO1xuXG5cdFx0Ly8gUmVmcmVzaCB0aGUgc2VsZWN0aW9uXG5cdFx0dGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMudXBkYXRlVHJlZVNlbGVjdGlvbigpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQ2hpbGRyZW4oZWxlbWVudD86IFRyZWVFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudXBkYXRlQ2hpbGRyZW5UaHJvdHRsZXIucXVldWUoXG5cdFx0XHQoKSA9PiB0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAoZWxlbWVudCAmJiB0aGlzLnRyZWUuaGFzTm9kZShlbGVtZW50KSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbihlbGVtZW50LCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4odW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBleHBhbmQoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoKCkgPT4gdGhpcy50cmVlLmV4cGFuZChlbGVtZW50LCB0cnVlKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZVJlcG9zaXRvcnkocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zY21WaWV3U2VydmljZS5leHBsb3JlckVuYWJsZWRDb25maWcuZ2V0KCkgPT09IGZhbHNlKSB7XG5cdFx0XHRpZiAocmVwb3NpdG9yeS5wcm92aWRlci5wYXJlbnRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudXBkYXRlQ2hpbGRyZW4oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZVBhcmVudFJlcG9zaXRvcnkocmVwb3NpdG9yeSk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhwbG9yZXIgbW9kZVxuXHRcdGF3YWl0IHRoaXMudXBkYXRlQ2hpbGRyZW4oKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlUGFyZW50UmVwb3NpdG9yeShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBhcmVudFJlcG9zaXRvcnkgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllc1xuXHRcdFx0LmZpbmQociA9PiByLnByb3ZpZGVyLmlkID09PSByZXBvc2l0b3J5LnByb3ZpZGVyLnBhcmVudElkKTtcblx0XHRpZiAoIXBhcmVudFJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUNoaWxkcmVuKHBhcmVudFJlcG9zaXRvcnkpO1xuXHRcdGF3YWl0IHRoaXMuZXhwYW5kKHBhcmVudFJlcG9zaXRvcnkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCb2R5U2l6ZShjb250ZW50SGVpZ2h0OiBudW1iZXIsIHZpc2libGVDb3VudD86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2NtVmlld1NlcnZpY2UuZXhwbG9yZXJFbmFibGVkQ29uZmlnLmdldCgpID09PSBmYWxzZSkge1xuXHRcdFx0dmlzaWJsZUNvdW50ID0gdmlzaWJsZUNvdW50ID8/IHRoaXMudmlzaWJsZUNvdW50T2JzLmdldCgpO1xuXHRcdFx0Y29uc3QgZW1wdHkgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLnJlcG9zaXRvcmllcy5sZW5ndGggPT09IDA7XG5cdFx0XHRjb25zdCBzaXplID0gTWF0aC5taW4oY29udGVudEhlaWdodCAvIDIyLCB2aXNpYmxlQ291bnQpICogMjI7XG5cblx0XHRcdHRoaXMubWluaW11bUJvZHlTaXplID0gdmlzaWJsZUNvdW50ID09PSAwID8gMjIgOiBzaXplO1xuXHRcdFx0dGhpcy5tYXhpbXVtQm9keVNpemUgPSB2aXNpYmxlQ291bnQgPT09IDAgPyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkgOiBlbXB0eSA/IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSA6IHNpemU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWluaW11bUJvZHlTaXplID0gMTIwO1xuXHRcdFx0dGhpcy5tYXhpbXVtQm9keVNpemUgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVUcmVlU2VsZWN0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9sZFNlbGVjdGlvbiA9IHRoaXMuZ2V0VHJlZVNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IG9sZFNldCA9IG5ldyBTZXQob2xkU2VsZWN0aW9uKTtcblxuXHRcdGNvbnN0IHNldCA9IG5ldyBTZXQodGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzKTtcblx0XHRjb25zdCBhZGRlZCA9IG5ldyBTZXQoSXRlcmFibGUuZmlsdGVyKHNldCwgciA9PiAhb2xkU2V0LmhhcyhyKSkpO1xuXHRcdGNvbnN0IHJlbW92ZWQgPSBuZXcgU2V0KEl0ZXJhYmxlLmZpbHRlcihvbGRTZXQsIHIgPT4gIXNldC5oYXMocikpKTtcblxuXHRcdGlmIChhZGRlZC5zaXplID09PSAwICYmIHJlbW92ZWQuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IG9sZFNlbGVjdGlvbi5maWx0ZXIocmVwbyA9PiAhcmVtb3ZlZC5oYXMocmVwbykpO1xuXG5cdFx0Zm9yIChjb25zdCByZXBvIG9mIHRoaXMuc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRpZiAoYWRkZWQuaGFzKHJlcG8pKSB7XG5cdFx0XHRcdHNlbGVjdGlvbi5wdXNoKHJlcG8pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHZpc2libGVTZWxlY3Rpb24gPSBzZWxlY3Rpb25cblx0XHRcdC5maWx0ZXIocyA9PiB0aGlzLnRyZWUuaGFzTm9kZShzKSk7XG5cblx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKHZpc2libGVTZWxlY3Rpb24pO1xuXG5cdFx0aWYgKHZpc2libGVTZWxlY3Rpb24ubGVuZ3RoID4gMCAmJiAhdGhpcy50cmVlLmdldEZvY3VzKCkuaW5jbHVkZXModmlzaWJsZVNlbGVjdGlvblswXSkpIHtcblx0XHRcdHRoaXMudHJlZS5zZXRBbmNob3IodmlzaWJsZVNlbGVjdGlvblswXSk7XG5cdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW3Zpc2libGVTZWxlY3Rpb25bMF1dKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFRyZWVTZWxlY3Rpb24oKTogSVNDTVJlcG9zaXRvcnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKVxuXHRcdFx0Lm1hcChlID0+IHtcblx0XHRcdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlKSkge1xuXHRcdFx0XHRcdHJldHVybiBlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzU0NNQXJ0aWZhY3RHcm91cFRyZWVFbGVtZW50KGUpIHx8IGlzU0NNQXJ0aWZhY3RUcmVlRWxlbWVudChlKSkge1xuXHRcdFx0XHRcdHJldHVybiBlLnJlcG9zaXRvcnk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNTQ01BcnRpZmFjdE5vZGUoZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZS5jb250ZXh0LnJlcG9zaXRvcnk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHRyZWUgZWxlbWVudCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZFRyZWVWaWV3U3RhdGUoKTogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN0b3JhZ2VWaWV3U3RhdGUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldCgnc2NtLnJlcG9zaXRvcmllc1ZpZXdTdGF0ZScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmICghc3RvcmFnZVZpZXdTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdHJlZVZpZXdTdGF0ZSA9IEpTT04ucGFyc2Uoc3RvcmFnZVZpZXdTdGF0ZSk7XG5cdFx0XHRyZXR1cm4gdHJlZVZpZXdTdGF0ZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdG9yZVRyZWVWaWV3U3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSgnc2NtLnJlcG9zaXRvcmllc1ZpZXdTdGF0ZScsIEpTT04uc3RyaW5naWZ5KHRoaXMudHJlZS5nZXRWaWV3U3RhdGUoKSksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5yZXBvc2l0b3J5RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBa0M7QUFDM0MsU0FBUyxRQUFRLFNBQVM7QUFHMUIsU0FBcUIsMENBQTBDO0FBQy9ELFNBQXlCLGFBQWEsdUJBQXVCO0FBQzdELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CLFlBQVksZUFBZSx1QkFBb0M7QUFDNUYsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0IsMEJBQTBCO0FBQzNELFNBQVMsMkJBQTJCLG9CQUFvQiwyQkFBMkIsK0JBQStCLG1CQUFtQiwwQkFBMEIsdUJBQXVCO0FBQ3RMLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYyxjQUFjO0FBQ3JDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBc0IsMkJBQTJCLG1CQUFtQjtBQUM3RSxTQUFTLFdBQVcsaUJBQWlCO0FBR3JDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQXdCLG9C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
