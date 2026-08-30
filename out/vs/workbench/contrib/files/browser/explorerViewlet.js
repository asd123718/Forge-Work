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
import "./media/explorerviewlet.css";
import { localize, localize2 } from "../../../../nls.js";
import { mark } from "../../../../base/common/performance.js";
import { VIEWLET_ID, VIEW_ID, ExplorerViewletVisibleContext } from "../common/files.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ExplorerView } from "./views/explorerView.js";
import { EmptyView } from "./views/emptyView.js";
import { OpenEditorsView } from "./views/openEditorsView.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { Extensions, ViewContainerLocation, IViewDescriptorService, ViewContentGroups } from "../../../common/views.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { KeyChord, KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { WorkbenchStateContext, RemoteNameContext, OpenFolderWorkspaceSupportContext } from "../../../common/contextkeys.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { AddRootFolderAction, OpenFolderAction, OpenFolderViaWorkspaceAction } from "../../../browser/actions/workspaceActions.js";
import { OpenRecentAction } from "../../../browser/actions/windowActions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { isMouseEvent } from "../../../../base/browser/dom.js";
import { ILogService } from "../../../../platform/log/common/log.js";
const explorerViewIcon = registerIcon("explorer-view-icon", Codicon.files, localize("explorerViewIcon", "View icon of the explorer view."));
const openEditorsViewIcon = registerIcon("open-editors-view-icon", Codicon.book, localize("openEditorsIcon", "View icon of the open editors view."));
let ExplorerViewletViewsContribution = class extends Disposable {
  constructor(workspaceContextService, progressService) {
    super();
    this.workspaceContextService = workspaceContextService;
    progressService.withProgress({ location: ProgressLocation.Explorer }, () => workspaceContextService.getCompleteWorkspace()).finally(() => {
      this.registerViews();
      this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.registerViews()));
      this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.registerViews()));
    });
  }
  registerViews() {
    mark("code/willRegisterExplorerViews");
    const viewDescriptors = viewsRegistry.getViews(VIEW_CONTAINER);
    const viewDescriptorsToRegister = [];
    const viewDescriptorsToDeregister = [];
    const openEditorsViewDescriptor = this.createOpenEditorsViewDescriptor();
    if (!viewDescriptors.some((v) => v.id === openEditorsViewDescriptor.id)) {
      viewDescriptorsToRegister.push(openEditorsViewDescriptor);
    }
    const explorerViewDescriptor = this.createExplorerViewDescriptor();
    const registeredExplorerViewDescriptor = viewDescriptors.find((v) => v.id === explorerViewDescriptor.id);
    const emptyViewDescriptor = this.createEmptyViewDescriptor();
    const registeredEmptyViewDescriptor = viewDescriptors.find((v) => v.id === emptyViewDescriptor.id);
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY || this.workspaceContextService.getWorkspace().folders.length === 0) {
      if (registeredExplorerViewDescriptor) {
        viewDescriptorsToDeregister.push(registeredExplorerViewDescriptor);
      }
      if (!registeredEmptyViewDescriptor) {
        viewDescriptorsToRegister.push(emptyViewDescriptor);
      }
    } else {
      if (registeredEmptyViewDescriptor) {
        viewDescriptorsToDeregister.push(registeredEmptyViewDescriptor);
      }
      if (!registeredExplorerViewDescriptor) {
        viewDescriptorsToRegister.push(explorerViewDescriptor);
      }
    }
    if (viewDescriptorsToDeregister.length) {
      viewsRegistry.deregisterViews(viewDescriptorsToDeregister, VIEW_CONTAINER);
    }
    if (viewDescriptorsToRegister.length) {
      viewsRegistry.registerViews(viewDescriptorsToRegister, VIEW_CONTAINER);
    }
    mark("code/didRegisterExplorerViews");
  }
  createOpenEditorsViewDescriptor() {
    return {
      id: OpenEditorsView.ID,
      name: OpenEditorsView.NAME,
      ctorDescriptor: new SyncDescriptor(OpenEditorsView),
      containerIcon: openEditorsViewIcon,
      order: 0,
      canToggleVisibility: true,
      canMoveView: true,
      collapsed: false,
      hideByDefault: true,
      focusCommand: {
        id: "workbench.files.action.focusOpenEditorsView",
        keybindings: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyE) }
      }
    };
  }
  createEmptyViewDescriptor() {
    return {
      id: EmptyView.ID,
      name: EmptyView.NAME,
      containerIcon: explorerViewIcon,
      ctorDescriptor: new SyncDescriptor(EmptyView),
      order: 1,
      canToggleVisibility: true,
      focusCommand: {
        id: "workbench.explorer.fileView.focus"
      }
    };
  }
  createExplorerViewDescriptor() {
    return {
      id: VIEW_ID,
      name: localize2("folders", "Folders"),
      containerIcon: explorerViewIcon,
      ctorDescriptor: new SyncDescriptor(ExplorerView),
      order: 1,
      canMoveView: true,
      canToggleVisibility: false,
      focusCommand: {
        id: "workbench.explorer.fileView.focus"
      }
    };
  }
};
ExplorerViewletViewsContribution.ID = "workbench.contrib.explorerViewletViews";
ExplorerViewletViewsContribution = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IProgressService)
], ExplorerViewletViewsContribution);
let ExplorerViewPaneContainer = class extends ViewPaneContainer {
  constructor(layoutService, telemetryService, contextService, storageService, configurationService, instantiationService, contextKeyService, themeService, contextMenuService, extensionService, viewDescriptorService, logService) {
    super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
    this.viewletVisibleContextKey = ExplorerViewletVisibleContext.bindTo(contextKeyService);
    this._register(this.contextService.onDidChangeWorkspaceName((e) => this.updateTitleArea()));
  }
  create(parent) {
    super.create(parent);
    parent.classList.add("explorer-viewlet");
  }
  createView(viewDescriptor, options) {
    if (viewDescriptor.id === VIEW_ID) {
      return this.instantiationService.createInstance(ExplorerView, {
        ...options,
        delegate: {
          willOpenElement: (e) => {
            if (!isMouseEvent(e)) {
              return;
            }
            const openEditorsView = this.getOpenEditorsView();
            if (openEditorsView) {
              let delay = 0;
              const config = this.configurationService.getValue();
              if (config.workbench?.editor?.enablePreview) {
                delay = 250;
              }
              openEditorsView.setStructuralRefreshDelay(delay);
            }
          },
          didOpenElement: (e) => {
            if (!isMouseEvent(e)) {
              return;
            }
            const openEditorsView = this.getOpenEditorsView();
            openEditorsView?.setStructuralRefreshDelay(0);
          }
        }
      });
    }
    return super.createView(viewDescriptor, options);
  }
  getExplorerView() {
    return this.getView(VIEW_ID);
  }
  getOpenEditorsView() {
    return this.getView(OpenEditorsView.ID);
  }
  setVisible(visible) {
    this.viewletVisibleContextKey.set(visible);
    super.setVisible(visible);
  }
  focus() {
    const explorerView = this.getView(VIEW_ID);
    if (explorerView && this.panes.every((p) => !p.isExpanded())) {
      explorerView.setExpanded(true);
    }
    if (explorerView?.isExpanded()) {
      explorerView.focus();
    } else {
      super.focus();
    }
  }
};
ExplorerViewPaneContainer = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IExtensionService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, ILogService)
], ExplorerViewPaneContainer);
const viewContainerRegistry = Registry.as(Extensions.ViewContainersRegistry);
const VIEW_CONTAINER = viewContainerRegistry.registerViewContainer({
  id: VIEWLET_ID,
  title: localize2("explore", "Explorer"),
  ctorDescriptor: new SyncDescriptor(ExplorerViewPaneContainer),
  storageId: "workbench.explorer.views.state",
  icon: explorerViewIcon,
  alwaysUseContainerInfo: true,
  hideIfEmpty: true,
  order: 0,
  openCommandActionDescriptor: {
    id: VIEWLET_ID,
    title: localize2("explore", "Explorer"),
    mnemonicTitle: localize({ key: "miViewExplorer", comment: ["&& denotes a mnemonic"] }, "&&Explorer"),
    keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE },
    order: 0
  }
}, ViewContainerLocation.Sidebar, { isDefault: true });
const openFolder = localize("openFolder", "Open Folder");
const addAFolder = localize("addAFolder", "add a folder");
const openRecent = localize("openRecent", "Open Recent");
const addRootFolderButton = `[${openFolder}](command:${AddRootFolderAction.ID})`;
const addAFolderButton = `[${addAFolder}](command:${AddRootFolderAction.ID})`;
const openFolderButton = `[${openFolder}](command:${OpenFolderAction.ID})`;
const openFolderViaWorkspaceButton = `[${openFolder}](command:${OpenFolderViaWorkspaceAction.ID})`;
const openRecentButton = `[${openRecent}](command:${OpenRecentAction.ID})`;
const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "noWorkspaceHelp", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "You have not yet added a folder to the workspace.\n{0}",
    addRootFolderButton
  ),
  when: ContextKeyExpr.and(
    // inside a .code-workspace
    WorkbenchStateContext.isEqualTo("workspace"),
    // unless we cannot enter or open workspaces (e.g. web serverless)
    OpenFolderWorkspaceSupportContext
  ),
  group: ViewContentGroups.Open,
  order: 1
});
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "noFolderHelpWeb", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "You have not yet opened a folder.\n{0}\n{1}",
    openFolderViaWorkspaceButton,
    openRecentButton
  ),
  when: ContextKeyExpr.and(
    // inside a .code-workspace
    WorkbenchStateContext.isEqualTo("workspace"),
    // we cannot enter workspaces (e.g. web serverless)
    OpenFolderWorkspaceSupportContext.toNegated()
  ),
  group: ViewContentGroups.Open,
  order: 1
});
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "remoteNoFolderHelp", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "Connected to remote.\n{0}",
    openFolderButton
  ),
  when: ContextKeyExpr.and(
    // not inside a .code-workspace
    WorkbenchStateContext.notEqualsTo("workspace"),
    // connected to a remote
    RemoteNameContext.notEqualsTo(""),
    // but not in web
    IsWebContext.toNegated()
  ),
  group: ViewContentGroups.Open,
  order: 1
});
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "noFolderButEditorsHelp", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "You have not yet opened a folder.\n{0}\nOpening a folder will close all currently open editors. To keep them open, {1} instead.",
    openFolderButton,
    addAFolderButton
  ),
  when: ContextKeyExpr.and(
    // editors are opened
    ContextKeyExpr.has("editorIsOpen"),
    ContextKeyExpr.or(
      // not inside a .code-workspace and local
      ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("workspace"), RemoteNameContext.isEqualTo("")),
      // not inside a .code-workspace and web
      ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("workspace"), IsWebContext)
    )
  ),
  group: ViewContentGroups.Open,
  order: 1
});
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "noFolderHelp", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "You have not yet opened a folder.\n{0}",
    openFolderButton
  ),
  when: ContextKeyExpr.and(
    // no editor is open
    ContextKeyExpr.has("editorIsOpen")?.negate(),
    ContextKeyExpr.or(
      // not inside a .code-workspace and local
      ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("workspace"), RemoteNameContext.isEqualTo("")),
      // not inside a .code-workspace and web
      ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("workspace"), IsWebContext)
    )
  ),
  group: ViewContentGroups.Open,
  order: 1
});
export {
  ExplorerViewPaneContainer,
  ExplorerViewletViewsContribution,
  VIEW_CONTAINER
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFxicm93c2VyXFxleHBsb3JlclZpZXdsZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvZXhwbG9yZXJ2aWV3bGV0LmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IG1hcmsgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBWSUVXTEVUX0lELCBWSUVXX0lELCBJRmlsZXNDb25maWd1cmF0aW9uLCBFeHBsb3JlclZpZXdsZXRWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVmlld2xldFZpZXdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3c1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlclZpZXcgfSBmcm9tICcuL3ZpZXdzL2V4cGxvcmVyVmlldy5qcyc7XG5pbXBvcnQgeyBFbXB0eVZpZXcgfSBmcm9tICcuL3ZpZXdzL2VtcHR5Vmlldy5qcyc7XG5pbXBvcnQgeyBPcGVuRWRpdG9yc1ZpZXcgfSBmcm9tICcuL3ZpZXdzL29wZW5FZGl0b3JzVmlldy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXksIENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NSZWdpc3RyeSwgSVZpZXdEZXNjcmlwdG9yLCBFeHRlbnNpb25zLCBWaWV3Q29udGFpbmVyLCBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGVudEdyb3VwcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lQ29udGFpbmVyLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5TW9kLCBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFN0YXRlQ29udGV4dCwgUmVtb3RlTmFtZUNvbnRleHQsIE9wZW5Gb2xkZXJXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBBZGRSb290Rm9sZGVyQWN0aW9uLCBPcGVuRm9sZGVyQWN0aW9uLCBPcGVuRm9sZGVyVmlhV29ya3NwYWNlQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dvcmtzcGFjZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgT3BlblJlY2VudEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93aW5kb3dBY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGlzTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmNvbnN0IGV4cGxvcmVyVmlld0ljb24gPSByZWdpc3Rlckljb24oJ2V4cGxvcmVyLXZpZXctaWNvbicsIENvZGljb24uZmlsZXMsIGxvY2FsaXplKCdleHBsb3JlclZpZXdJY29uJywgJ1ZpZXcgaWNvbiBvZiB0aGUgZXhwbG9yZXIgdmlldy4nKSk7XG5jb25zdCBvcGVuRWRpdG9yc1ZpZXdJY29uID0gcmVnaXN0ZXJJY29uKCdvcGVuLWVkaXRvcnMtdmlldy1pY29uJywgQ29kaWNvbi5ib29rLCBsb2NhbGl6ZSgnb3BlbkVkaXRvcnNJY29uJywgJ1ZpZXcgaWNvbiBvZiB0aGUgb3BlbiBlZGl0b3JzIHZpZXcuJykpO1xuXG5leHBvcnQgY2xhc3MgRXhwbG9yZXJWaWV3bGV0Vmlld3NDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmV4cGxvcmVyVmlld2xldFZpZXdzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5FeHBsb3JlciB9LCAoKSA9PiB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRDb21wbGV0ZVdvcmtzcGFjZSgpKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRoaXMucmVnaXN0ZXJWaWV3cygpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCgpID0+IHRoaXMucmVnaXN0ZXJWaWV3cygpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy5yZWdpc3RlclZpZXdzKCkpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJWaWV3cygpOiB2b2lkIHtcblx0XHRtYXJrKCdjb2RlL3dpbGxSZWdpc3RlckV4cGxvcmVyVmlld3MnKTtcblxuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9ycyA9IHZpZXdzUmVnaXN0cnkuZ2V0Vmlld3MoVklFV19DT05UQUlORVIpO1xuXG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzVG9SZWdpc3RlcjogSVZpZXdEZXNjcmlwdG9yW10gPSBbXTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnNUb0RlcmVnaXN0ZXI6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cblx0XHRjb25zdCBvcGVuRWRpdG9yc1ZpZXdEZXNjcmlwdG9yID0gdGhpcy5jcmVhdGVPcGVuRWRpdG9yc1ZpZXdEZXNjcmlwdG9yKCk7XG5cdFx0aWYgKCF2aWV3RGVzY3JpcHRvcnMuc29tZSh2ID0+IHYuaWQgPT09IG9wZW5FZGl0b3JzVmlld0Rlc2NyaXB0b3IuaWQpKSB7XG5cdFx0XHR2aWV3RGVzY3JpcHRvcnNUb1JlZ2lzdGVyLnB1c2gob3BlbkVkaXRvcnNWaWV3RGVzY3JpcHRvcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwbG9yZXJWaWV3RGVzY3JpcHRvciA9IHRoaXMuY3JlYXRlRXhwbG9yZXJWaWV3RGVzY3JpcHRvcigpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFeHBsb3JlclZpZXdEZXNjcmlwdG9yID0gdmlld0Rlc2NyaXB0b3JzLmZpbmQodiA9PiB2LmlkID09PSBleHBsb3JlclZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRjb25zdCBlbXB0eVZpZXdEZXNjcmlwdG9yID0gdGhpcy5jcmVhdGVFbXB0eVZpZXdEZXNjcmlwdG9yKCk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVtcHR5Vmlld0Rlc2NyaXB0b3IgPSB2aWV3RGVzY3JpcHRvcnMuZmluZCh2ID0+IHYuaWQgPT09IGVtcHR5Vmlld0Rlc2NyaXB0b3IuaWQpO1xuXG5cdFx0aWYgKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgfHwgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aWYgKHJlZ2lzdGVyZWRFeHBsb3JlclZpZXdEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdHZpZXdEZXNjcmlwdG9yc1RvRGVyZWdpc3Rlci5wdXNoKHJlZ2lzdGVyZWRFeHBsb3JlclZpZXdEZXNjcmlwdG9yKTtcblx0XHRcdH1cblx0XHRcdGlmICghcmVnaXN0ZXJlZEVtcHR5Vmlld0Rlc2NyaXB0b3IpIHtcblx0XHRcdFx0dmlld0Rlc2NyaXB0b3JzVG9SZWdpc3Rlci5wdXNoKGVtcHR5Vmlld0Rlc2NyaXB0b3IpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAocmVnaXN0ZXJlZEVtcHR5Vmlld0Rlc2NyaXB0b3IpIHtcblx0XHRcdFx0dmlld0Rlc2NyaXB0b3JzVG9EZXJlZ2lzdGVyLnB1c2gocmVnaXN0ZXJlZEVtcHR5Vmlld0Rlc2NyaXB0b3IpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZWdpc3RlcmVkRXhwbG9yZXJWaWV3RGVzY3JpcHRvcikge1xuXHRcdFx0XHR2aWV3RGVzY3JpcHRvcnNUb1JlZ2lzdGVyLnB1c2goZXhwbG9yZXJWaWV3RGVzY3JpcHRvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHZpZXdEZXNjcmlwdG9yc1RvRGVyZWdpc3Rlci5sZW5ndGgpIHtcblx0XHRcdHZpZXdzUmVnaXN0cnkuZGVyZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9yc1RvRGVyZWdpc3RlciwgVklFV19DT05UQUlORVIpO1xuXHRcdH1cblx0XHRpZiAodmlld0Rlc2NyaXB0b3JzVG9SZWdpc3Rlci5sZW5ndGgpIHtcblx0XHRcdHZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyh2aWV3RGVzY3JpcHRvcnNUb1JlZ2lzdGVyLCBWSUVXX0NPTlRBSU5FUik7XG5cdFx0fVxuXG5cdFx0bWFyaygnY29kZS9kaWRSZWdpc3RlckV4cGxvcmVyVmlld3MnKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlT3BlbkVkaXRvcnNWaWV3RGVzY3JpcHRvcigpOiBJVmlld0Rlc2NyaXB0b3Ige1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogT3BlbkVkaXRvcnNWaWV3LklELFxuXHRcdFx0bmFtZTogT3BlbkVkaXRvcnNWaWV3Lk5BTUUsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKE9wZW5FZGl0b3JzVmlldyksXG5cdFx0XHRjb250YWluZXJJY29uOiBvcGVuRWRpdG9yc1ZpZXdJY29uLFxuXHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0Y2FuTW92ZVZpZXc6IHRydWUsXG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0aGlkZUJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdGZvY3VzQ29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5maWxlcy5hY3Rpb24uZm9jdXNPcGVuRWRpdG9yc1ZpZXcnLFxuXHRcdFx0XHRrZXliaW5kaW5nczogeyBwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5Q29kZS5LZXlFKSB9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRW1wdHlWaWV3RGVzY3JpcHRvcigpOiBJVmlld0Rlc2NyaXB0b3Ige1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogRW1wdHlWaWV3LklELFxuXHRcdFx0bmFtZTogRW1wdHlWaWV3Lk5BTUUsXG5cdFx0XHRjb250YWluZXJJY29uOiBleHBsb3JlclZpZXdJY29uLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFbXB0eVZpZXcpLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0Zm9jdXNDb21tYW5kOiB7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmV4cGxvcmVyLmZpbGVWaWV3LmZvY3VzJ1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUV4cGxvcmVyVmlld0Rlc2NyaXB0b3IoKTogSVZpZXdEZXNjcmlwdG9yIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IFZJRVdfSUQsXG5cdFx0XHRuYW1lOiBsb2NhbGl6ZTIoJ2ZvbGRlcnMnLCBcIkZvbGRlcnNcIiksXG5cdFx0XHRjb250YWluZXJJY29uOiBleHBsb3JlclZpZXdJY29uLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFeHBsb3JlclZpZXcpLFxuXHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IGZhbHNlLFxuXHRcdFx0Zm9jdXNDb21tYW5kOiB7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmV4cGxvcmVyLmZpbGVWaWV3LmZvY3VzJ1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4cGxvcmVyVmlld1BhbmVDb250YWluZXIgZXh0ZW5kcyBWaWV3UGFuZUNvbnRhaW5lciB7XG5cblx0cHJpdmF0ZSB2aWV3bGV0VmlzaWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHN1cGVyKFZJRVdMRVRfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH0sIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBjb250ZXh0U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblxuXHRcdHRoaXMudmlld2xldFZpc2libGVDb250ZXh0S2V5ID0gRXhwbG9yZXJWaWV3bGV0VmlzaWJsZUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlTmFtZShlID0+IHRoaXMudXBkYXRlVGl0bGVBcmVhKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIuY3JlYXRlKHBhcmVudCk7XG5cdFx0cGFyZW50LmNsYXNzTGlzdC5hZGQoJ2V4cGxvcmVyLXZpZXdsZXQnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVWaWV3KHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IsIG9wdGlvbnM6IElWaWV3bGV0Vmlld09wdGlvbnMpOiBWaWV3UGFuZSB7XG5cdFx0aWYgKHZpZXdEZXNjcmlwdG9yLmlkID09PSBWSUVXX0lEKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHBsb3JlclZpZXcsIHtcblx0XHRcdFx0Li4ub3B0aW9ucywgZGVsZWdhdGU6IHtcblx0XHRcdFx0XHR3aWxsT3BlbkVsZW1lbnQ6IGUgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFpc01vdXNlRXZlbnQoZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuOyAvLyBvbmx5IGRlbGF5IHdoZW4gdXNlciBjbGlja3Ncblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3Qgb3BlbkVkaXRvcnNWaWV3ID0gdGhpcy5nZXRPcGVuRWRpdG9yc1ZpZXcoKTtcblx0XHRcdFx0XHRcdGlmIChvcGVuRWRpdG9yc1ZpZXcpIHtcblx0XHRcdFx0XHRcdFx0bGV0IGRlbGF5ID0gMDtcblxuXHRcdFx0XHRcdFx0XHRjb25zdCBjb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCk7XG5cdFx0XHRcdFx0XHRcdGlmIChjb25maWcud29ya2JlbmNoPy5lZGl0b3I/LmVuYWJsZVByZXZpZXcpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBkZWxheSBvcGVuIGVkaXRvcnMgdmlldyB3aGVuIHByZXZpZXcgaXMgZW5hYmxlZFxuXHRcdFx0XHRcdFx0XHRcdC8vIHRvIGFjY29tb2RhdGUgZm9yIHRoZSB1c2VyIGRvaW5nIGEgZG91YmxlIGNsaWNrXG5cdFx0XHRcdFx0XHRcdFx0Ly8gdG8gcGluIHRoZSBlZGl0b3IuXG5cdFx0XHRcdFx0XHRcdFx0Ly8gd2l0aG91dCB0aGlzIGRlbGF5IGEgZG91YmxlIGNsaWNrIHdvdWxkIGJlIG5vdFxuXHRcdFx0XHRcdFx0XHRcdC8vIHBvc3NpYmxlIGJlY2F1c2UgdGhlIG5leHQgZWxlbWVudCB3b3VsZCBtb3ZlXG5cdFx0XHRcdFx0XHRcdFx0Ly8gdW5kZXIgdGhlIG1vdXNlIGFmdGVyIHRoZSBmaXJzdCBjbGljay5cblx0XHRcdFx0XHRcdFx0XHRkZWxheSA9IDI1MDtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdG9wZW5FZGl0b3JzVmlldy5zZXRTdHJ1Y3R1cmFsUmVmcmVzaERlbGF5KGRlbGF5KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRpZE9wZW5FbGVtZW50OiBlID0+IHtcblx0XHRcdFx0XHRcdGlmICghaXNNb3VzZUV2ZW50KGUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjsgLy8gb25seSBkZWxheSB3aGVuIHVzZXIgY2xpY2tzXG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IG9wZW5FZGl0b3JzVmlldyA9IHRoaXMuZ2V0T3BlbkVkaXRvcnNWaWV3KCk7XG5cdFx0XHRcdFx0XHRvcGVuRWRpdG9yc1ZpZXc/LnNldFN0cnVjdHVyYWxSZWZyZXNoRGVsYXkoMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLmNyZWF0ZVZpZXcodmlld0Rlc2NyaXB0b3IsIG9wdGlvbnMpO1xuXHR9XG5cblx0Z2V0RXhwbG9yZXJWaWV3KCk6IEV4cGxvcmVyVmlldyB7XG5cdFx0cmV0dXJuIDxFeHBsb3JlclZpZXc+dGhpcy5nZXRWaWV3KFZJRVdfSUQpO1xuXHR9XG5cblx0Z2V0T3BlbkVkaXRvcnNWaWV3KCk6IE9wZW5FZGl0b3JzVmlldyB7XG5cdFx0cmV0dXJuIDxPcGVuRWRpdG9yc1ZpZXc+dGhpcy5nZXRWaWV3KE9wZW5FZGl0b3JzVmlldy5JRCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdsZXRWaXNpYmxlQ29udGV4dEtleS5zZXQodmlzaWJsZSk7XG5cdFx0c3VwZXIuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGV4cGxvcmVyVmlldyA9IHRoaXMuZ2V0VmlldyhWSUVXX0lEKTtcblx0XHRpZiAoZXhwbG9yZXJWaWV3ICYmIHRoaXMucGFuZXMuZXZlcnkocCA9PiAhcC5pc0V4cGFuZGVkKCkpKSB7XG5cdFx0XHRleHBsb3JlclZpZXcuc2V0RXhwYW5kZWQodHJ1ZSk7XG5cdFx0fVxuXHRcdGlmIChleHBsb3JlclZpZXc/LmlzRXhwYW5kZWQoKSkge1xuXHRcdFx0ZXhwbG9yZXJWaWV3LmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IHZpZXdDb250YWluZXJSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpO1xuXG4vKipcbiAqIEV4cGxvcmVyIHZpZXdsZXQgY29udGFpbmVyLlxuICovXG5leHBvcnQgY29uc3QgVklFV19DT05UQUlORVI6IFZpZXdDb250YWluZXIgPSB2aWV3Q29udGFpbmVyUmVnaXN0cnkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHtcblx0aWQ6IFZJRVdMRVRfSUQsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2V4cGxvcmUnLCBcIkV4cGxvcmVyXCIpLFxuXHRjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKEV4cGxvcmVyVmlld1BhbmVDb250YWluZXIpLFxuXHRzdG9yYWdlSWQ6ICd3b3JrYmVuY2guZXhwbG9yZXIudmlld3Muc3RhdGUnLFxuXHRpY29uOiBleHBsb3JlclZpZXdJY29uLFxuXHRhbHdheXNVc2VDb250YWluZXJJbmZvOiB0cnVlLFxuXHRoaWRlSWZFbXB0eTogdHJ1ZSxcblx0b3JkZXI6IDAsXG5cdG9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvcjoge1xuXHRcdGlkOiBWSUVXTEVUX0lELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2V4cGxvcmUnLCBcIkV4cGxvcmVyXCIpLFxuXHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlWaWV3RXhwbG9yZXInLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZFeHBsb3JlclwiKSxcblx0XHRrZXliaW5kaW5nczogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5RSB9LFxuXHRcdG9yZGVyOiAwXG5cdH0sXG59LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgeyBpc0RlZmF1bHQ6IHRydWUgfSk7XG5cbmNvbnN0IG9wZW5Gb2xkZXIgPSBsb2NhbGl6ZSgnb3BlbkZvbGRlcicsIFwiT3BlbiBGb2xkZXJcIik7XG5jb25zdCBhZGRBRm9sZGVyID0gbG9jYWxpemUoJ2FkZEFGb2xkZXInLCBcImFkZCBhIGZvbGRlclwiKTtcbmNvbnN0IG9wZW5SZWNlbnQgPSBsb2NhbGl6ZSgnb3BlblJlY2VudCcsIFwiT3BlbiBSZWNlbnRcIik7XG5cbmNvbnN0IGFkZFJvb3RGb2xkZXJCdXR0b24gPSBgWyR7b3BlbkZvbGRlcn1dKGNvbW1hbmQ6JHtBZGRSb290Rm9sZGVyQWN0aW9uLklEfSlgO1xuY29uc3QgYWRkQUZvbGRlckJ1dHRvbiA9IGBbJHthZGRBRm9sZGVyfV0oY29tbWFuZDoke0FkZFJvb3RGb2xkZXJBY3Rpb24uSUR9KWA7XG5jb25zdCBvcGVuRm9sZGVyQnV0dG9uID0gYFske29wZW5Gb2xkZXJ9XShjb21tYW5kOiR7T3BlbkZvbGRlckFjdGlvbi5JRH0pYDtcbmNvbnN0IG9wZW5Gb2xkZXJWaWFXb3Jrc3BhY2VCdXR0b24gPSBgWyR7b3BlbkZvbGRlcn1dKGNvbW1hbmQ6JHtPcGVuRm9sZGVyVmlhV29ya3NwYWNlQWN0aW9uLklEfSlgO1xuY29uc3Qgb3BlblJlY2VudEJ1dHRvbiA9IGBbJHtvcGVuUmVjZW50fV0oY29tbWFuZDoke09wZW5SZWNlbnRBY3Rpb24uSUR9KWA7XG5cbmNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoRW1wdHlWaWV3LklELCB7XG5cdGNvbnRlbnQ6IGxvY2FsaXplKHsga2V5OiAnbm9Xb3Jrc3BhY2VIZWxwJywgY29tbWVudDogWydQbGVhc2UgZG8gbm90IHRyYW5zbGF0ZSB0aGUgd29yZCBcImNvbW1hbmRcIiwgaXQgaXMgcGFydCBvZiBvdXIgaW50ZXJuYWwgc3ludGF4IHdoaWNoIG11c3Qgbm90IGNoYW5nZSddIH0sXG5cdFx0XCJZb3UgaGF2ZSBub3QgeWV0IGFkZGVkIGEgZm9sZGVyIHRvIHRoZSB3b3Jrc3BhY2UuXFxuezB9XCIsIGFkZFJvb3RGb2xkZXJCdXR0b24pLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Ly8gaW5zaWRlIGEgLmNvZGUtd29ya3NwYWNlXG5cdFx0V29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJyksXG5cdFx0Ly8gdW5sZXNzIHdlIGNhbm5vdCBlbnRlciBvciBvcGVuIHdvcmtzcGFjZXMgKGUuZy4gd2ViIHNlcnZlcmxlc3MpXG5cdFx0T3BlbkZvbGRlcldvcmtzcGFjZVN1cHBvcnRDb250ZXh0XG5cdCksXG5cdGdyb3VwOiBWaWV3Q29udGVudEdyb3Vwcy5PcGVuLFxuXHRvcmRlcjogMVxufSk7XG5cbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoRW1wdHlWaWV3LklELCB7XG5cdGNvbnRlbnQ6IGxvY2FsaXplKHsga2V5OiAnbm9Gb2xkZXJIZWxwV2ViJywgY29tbWVudDogWydQbGVhc2UgZG8gbm90IHRyYW5zbGF0ZSB0aGUgd29yZCBcImNvbW1hbmRcIiwgaXQgaXMgcGFydCBvZiBvdXIgaW50ZXJuYWwgc3ludGF4IHdoaWNoIG11c3Qgbm90IGNoYW5nZSddIH0sXG5cdFx0XCJZb3UgaGF2ZSBub3QgeWV0IG9wZW5lZCBhIGZvbGRlci5cXG57MH1cXG57MX1cIiwgb3BlbkZvbGRlclZpYVdvcmtzcGFjZUJ1dHRvbiwgb3BlblJlY2VudEJ1dHRvbiksXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHQvLyBpbnNpZGUgYSAuY29kZS13b3Jrc3BhY2Vcblx0XHRXb3JrYmVuY2hTdGF0ZUNvbnRleHQuaXNFcXVhbFRvKCd3b3Jrc3BhY2UnKSxcblx0XHQvLyB3ZSBjYW5ub3QgZW50ZXIgd29ya3NwYWNlcyAoZS5nLiB3ZWIgc2VydmVybGVzcylcblx0XHRPcGVuRm9sZGVyV29ya3NwYWNlU3VwcG9ydENvbnRleHQudG9OZWdhdGVkKClcblx0KSxcblx0Z3JvdXA6IFZpZXdDb250ZW50R3JvdXBzLk9wZW4sXG5cdG9yZGVyOiAxXG59KTtcblxudmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdXZWxjb21lQ29udGVudChFbXB0eVZpZXcuSUQsIHtcblx0Y29udGVudDogbG9jYWxpemUoeyBrZXk6ICdyZW1vdGVOb0ZvbGRlckhlbHAnLCBjb21tZW50OiBbJ1BsZWFzZSBkbyBub3QgdHJhbnNsYXRlIHRoZSB3b3JkIFwiY29tbWFuZFwiLCBpdCBpcyBwYXJ0IG9mIG91ciBpbnRlcm5hbCBzeW50YXggd2hpY2ggbXVzdCBub3QgY2hhbmdlJ10gfSxcblx0XHRcIkNvbm5lY3RlZCB0byByZW1vdGUuXFxuezB9XCIsIG9wZW5Gb2xkZXJCdXR0b24pLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Ly8gbm90IGluc2lkZSBhIC5jb2RlLXdvcmtzcGFjZVxuXHRcdFdvcmtiZW5jaFN0YXRlQ29udGV4dC5ub3RFcXVhbHNUbygnd29ya3NwYWNlJyksXG5cdFx0Ly8gY29ubmVjdGVkIHRvIGEgcmVtb3RlXG5cdFx0UmVtb3RlTmFtZUNvbnRleHQubm90RXF1YWxzVG8oJycpLFxuXHRcdC8vIGJ1dCBub3QgaW4gd2ViXG5cdFx0SXNXZWJDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0Z3JvdXA6IFZpZXdDb250ZW50R3JvdXBzLk9wZW4sXG5cdG9yZGVyOiAxXG59KTtcblxudmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdXZWxjb21lQ29udGVudChFbXB0eVZpZXcuSUQsIHtcblx0Y29udGVudDogbG9jYWxpemUoeyBrZXk6ICdub0ZvbGRlckJ1dEVkaXRvcnNIZWxwJywgY29tbWVudDogWydQbGVhc2UgZG8gbm90IHRyYW5zbGF0ZSB0aGUgd29yZCBcImNvbW1hbmRcIiwgaXQgaXMgcGFydCBvZiBvdXIgaW50ZXJuYWwgc3ludGF4IHdoaWNoIG11c3Qgbm90IGNoYW5nZSddIH0sXG5cdFx0XCJZb3UgaGF2ZSBub3QgeWV0IG9wZW5lZCBhIGZvbGRlci5cXG57MH1cXG5PcGVuaW5nIGEgZm9sZGVyIHdpbGwgY2xvc2UgYWxsIGN1cnJlbnRseSBvcGVuIGVkaXRvcnMuIFRvIGtlZXAgdGhlbSBvcGVuLCB7MX0gaW5zdGVhZC5cIiwgb3BlbkZvbGRlckJ1dHRvbiwgYWRkQUZvbGRlckJ1dHRvbiksXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHQvLyBlZGl0b3JzIGFyZSBvcGVuZWRcblx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2VkaXRvcklzT3BlbicpLFxuXHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Ly8gbm90IGluc2lkZSBhIC5jb2RlLXdvcmtzcGFjZSBhbmQgbG9jYWxcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ3dvcmtzcGFjZScpLCBSZW1vdGVOYW1lQ29udGV4dC5pc0VxdWFsVG8oJycpKSxcblx0XHRcdC8vIG5vdCBpbnNpZGUgYSAuY29kZS13b3Jrc3BhY2UgYW5kIHdlYlxuXHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5ub3RFcXVhbHNUbygnd29ya3NwYWNlJyksIElzV2ViQ29udGV4dClcblx0XHQpXG5cdCksXG5cdGdyb3VwOiBWaWV3Q29udGVudEdyb3Vwcy5PcGVuLFxuXHRvcmRlcjogMVxufSk7XG5cbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoRW1wdHlWaWV3LklELCB7XG5cdGNvbnRlbnQ6IGxvY2FsaXplKHsga2V5OiAnbm9Gb2xkZXJIZWxwJywgY29tbWVudDogWydQbGVhc2UgZG8gbm90IHRyYW5zbGF0ZSB0aGUgd29yZCBcImNvbW1hbmRcIiwgaXQgaXMgcGFydCBvZiBvdXIgaW50ZXJuYWwgc3ludGF4IHdoaWNoIG11c3Qgbm90IGNoYW5nZSddIH0sXG5cdFx0XCJZb3UgaGF2ZSBub3QgeWV0IG9wZW5lZCBhIGZvbGRlci5cXG57MH1cIiwgb3BlbkZvbGRlckJ1dHRvbiksXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHQvLyBubyBlZGl0b3IgaXMgb3BlblxuXHRcdENvbnRleHRLZXlFeHByLmhhcygnZWRpdG9ySXNPcGVuJyk/Lm5lZ2F0ZSgpLFxuXHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Ly8gbm90IGluc2lkZSBhIC5jb2RlLXdvcmtzcGFjZSBhbmQgbG9jYWxcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ3dvcmtzcGFjZScpLCBSZW1vdGVOYW1lQ29udGV4dC5pc0VxdWFsVG8oJycpKSxcblx0XHRcdC8vIG5vdCBpbnNpZGUgYSAuY29kZS13b3Jrc3BhY2UgYW5kIHdlYlxuXHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaFN0YXRlQ29udGV4dC5ub3RFcXVhbHNUbygnd29ya3NwYWNlJyksIElzV2ViQ29udGV4dClcblx0XHQpXG5cdCksXG5cdGdyb3VwOiBWaWV3Q29udGVudEdyb3Vwcy5PcGVuLFxuXHRvcmRlcjogMVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQVksU0FBOEIscUNBQXFDO0FBRXhGLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCLHNCQUFzQjtBQUN6RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFpQyxzQkFBc0I7QUFDaEUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBMEMsWUFBb0QsdUJBQXVCLHdCQUF3Qix5QkFBeUI7QUFDdEssU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxVQUFVLFFBQVEsZUFBZTtBQUMxQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUIsbUJBQW1CLHlDQUF5QztBQUM1RixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHFCQUFxQixrQkFBa0Isb0NBQW9DO0FBQ3BGLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUU1QixNQUFNLG1CQUFtQixhQUFhLHNCQUFzQixRQUFRLE9BQU8sU0FBUyxvQkFBb0IsaUNBQWlDLENBQUM7QUFDMUksTUFBTSxzQkFBc0IsYUFBYSwwQkFBMEIsUUFBUSxNQUFNLFNBQVMsbUJBQW1CLHFDQUFxQyxDQUFDO0FBRTVJLElBQU0sbUNBQU4sY0FBK0MsV0FBNkM7QUFBQSxFQUlsRyxZQUM0Qyx5QkFDekIsaUJBQ2pCO0FBQ0QsVUFBTTtBQUhxQztBQUszQyxvQkFBZ0IsYUFBYSxFQUFFLFVBQVUsaUJBQWlCLFNBQVMsR0FBRyxNQUFNLHdCQUF3QixxQkFBcUIsQ0FBQyxFQUFFLFFBQVEsTUFBTTtBQUN6SSxXQUFLLGNBQWM7QUFFbkIsV0FBSyxVQUFVLHdCQUF3QiwwQkFBMEIsTUFBTSxLQUFLLGNBQWMsQ0FBQyxDQUFDO0FBQzVGLFdBQUssVUFBVSx3QkFBd0IsNEJBQTRCLE1BQU0sS0FBSyxjQUFjLENBQUMsQ0FBQztBQUFBLElBQy9GLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxnQkFBc0I7QUFDN0IsU0FBSyxnQ0FBZ0M7QUFFckMsVUFBTSxrQkFBa0IsY0FBYyxTQUFTLGNBQWM7QUFFN0QsVUFBTSw0QkFBK0MsQ0FBQztBQUN0RCxVQUFNLDhCQUFpRCxDQUFDO0FBRXhELFVBQU0sNEJBQTRCLEtBQUssZ0NBQWdDO0FBQ3ZFLFFBQUksQ0FBQyxnQkFBZ0IsS0FBSyxPQUFLLEVBQUUsT0FBTywwQkFBMEIsRUFBRSxHQUFHO0FBQ3RFLGdDQUEwQixLQUFLLHlCQUF5QjtBQUFBLElBQ3pEO0FBRUEsVUFBTSx5QkFBeUIsS0FBSyw2QkFBNkI7QUFDakUsVUFBTSxtQ0FBbUMsZ0JBQWdCLEtBQUssT0FBSyxFQUFFLE9BQU8sdUJBQXVCLEVBQUU7QUFDckcsVUFBTSxzQkFBc0IsS0FBSywwQkFBMEI7QUFDM0QsVUFBTSxnQ0FBZ0MsZ0JBQWdCLEtBQUssT0FBSyxFQUFFLE9BQU8sb0JBQW9CLEVBQUU7QUFFL0YsUUFBSSxLQUFLLHdCQUF3QixrQkFBa0IsTUFBTSxlQUFlLFNBQVMsS0FBSyx3QkFBd0IsYUFBYSxFQUFFLFFBQVEsV0FBVyxHQUFHO0FBQ2xKLFVBQUksa0NBQWtDO0FBQ3JDLG9DQUE0QixLQUFLLGdDQUFnQztBQUFBLE1BQ2xFO0FBQ0EsVUFBSSxDQUFDLCtCQUErQjtBQUNuQyxrQ0FBMEIsS0FBSyxtQkFBbUI7QUFBQSxNQUNuRDtBQUFBLElBQ0QsT0FBTztBQUNOLFVBQUksK0JBQStCO0FBQ2xDLG9DQUE0QixLQUFLLDZCQUE2QjtBQUFBLE1BQy9EO0FBQ0EsVUFBSSxDQUFDLGtDQUFrQztBQUN0QyxrQ0FBMEIsS0FBSyxzQkFBc0I7QUFBQSxNQUN0RDtBQUFBLElBQ0Q7QUFFQSxRQUFJLDRCQUE0QixRQUFRO0FBQ3ZDLG9CQUFjLGdCQUFnQiw2QkFBNkIsY0FBYztBQUFBLElBQzFFO0FBQ0EsUUFBSSwwQkFBMEIsUUFBUTtBQUNyQyxvQkFBYyxjQUFjLDJCQUEyQixjQUFjO0FBQUEsSUFDdEU7QUFFQSxTQUFLLCtCQUErQjtBQUFBLEVBQ3JDO0FBQUEsRUFFUSxrQ0FBbUQ7QUFDMUQsV0FBTztBQUFBLE1BQ04sSUFBSSxnQkFBZ0I7QUFBQSxNQUNwQixNQUFNLGdCQUFnQjtBQUFBLE1BQ3RCLGdCQUFnQixJQUFJLGVBQWUsZUFBZTtBQUFBLE1BQ2xELGVBQWU7QUFBQSxNQUNmLE9BQU87QUFBQSxNQUNQLHFCQUFxQjtBQUFBLE1BQ3JCLGFBQWE7QUFBQSxNQUNiLFdBQVc7QUFBQSxNQUNYLGVBQWU7QUFBQSxNQUNmLGNBQWM7QUFBQSxRQUNiLElBQUk7QUFBQSxRQUNKLGFBQWEsRUFBRSxTQUFTLFNBQVMsT0FBTyxVQUFVLFFBQVEsTUFBTSxRQUFRLElBQUksRUFBRTtBQUFBLE1BQy9FO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDRCQUE2QztBQUNwRCxXQUFPO0FBQUEsTUFDTixJQUFJLFVBQVU7QUFBQSxNQUNkLE1BQU0sVUFBVTtBQUFBLE1BQ2hCLGVBQWU7QUFBQSxNQUNmLGdCQUFnQixJQUFJLGVBQWUsU0FBUztBQUFBLE1BQzVDLE9BQU87QUFBQSxNQUNQLHFCQUFxQjtBQUFBLE1BQ3JCLGNBQWM7QUFBQSxRQUNiLElBQUk7QUFBQSxNQUNMO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLCtCQUFnRDtBQUN2RCxXQUFPO0FBQUEsTUFDTixJQUFJO0FBQUEsTUFDSixNQUFNLFVBQVUsV0FBVyxTQUFTO0FBQUEsTUFDcEMsZUFBZTtBQUFBLE1BQ2YsZ0JBQWdCLElBQUksZUFBZSxZQUFZO0FBQUEsTUFDL0MsT0FBTztBQUFBLE1BQ1AsYUFBYTtBQUFBLE1BQ2IscUJBQXFCO0FBQUEsTUFDckIsY0FBYztBQUFBLFFBQ2IsSUFBSTtBQUFBLE1BQ0w7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBNUdhLGlDQUVJLEtBQUs7QUFGVCxtQ0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsR0FOVTtBQThHTixJQUFNLDRCQUFOLGNBQXdDLGtCQUFrQjtBQUFBLEVBSWhFLFlBQzBCLGVBQ04sa0JBQ08sZ0JBQ1QsZ0JBQ00sc0JBQ0Esc0JBQ0gsbUJBQ0wsY0FDTSxvQkFDRixrQkFDSyx1QkFDWCxZQUNaO0FBRUQsVUFBTSxZQUFZLEVBQUUsc0NBQXNDLEtBQUssR0FBRyxzQkFBc0Isc0JBQXNCLGVBQWUsb0JBQW9CLGtCQUFrQixrQkFBa0IsY0FBYyxnQkFBZ0IsZ0JBQWdCLHVCQUF1QixVQUFVO0FBRXBRLFNBQUssMkJBQTJCLDhCQUE4QixPQUFPLGlCQUFpQjtBQUN0RixTQUFLLFVBQVUsS0FBSyxlQUFlLHlCQUF5QixPQUFLLEtBQUssZ0JBQWdCLENBQUMsQ0FBQztBQUFBLEVBQ3pGO0FBQUEsRUFFUyxPQUFPLFFBQTJCO0FBQzFDLFVBQU0sT0FBTyxNQUFNO0FBQ25CLFdBQU8sVUFBVSxJQUFJLGtCQUFrQjtBQUFBLEVBQ3hDO0FBQUEsRUFFbUIsV0FBVyxnQkFBaUMsU0FBd0M7QUFDdEcsUUFBSSxlQUFlLE9BQU8sU0FBUztBQUNsQyxhQUFPLEtBQUsscUJBQXFCLGVBQWUsY0FBYztBQUFBLFFBQzdELEdBQUc7QUFBQSxRQUFTLFVBQVU7QUFBQSxVQUNyQixpQkFBaUIsT0FBSztBQUNyQixnQkFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHO0FBQ3JCO0FBQUEsWUFDRDtBQUVBLGtCQUFNLGtCQUFrQixLQUFLLG1CQUFtQjtBQUNoRCxnQkFBSSxpQkFBaUI7QUFDcEIsa0JBQUksUUFBUTtBQUVaLG9CQUFNLFNBQVMsS0FBSyxxQkFBcUIsU0FBOEI7QUFDdkUsa0JBQUksT0FBTyxXQUFXLFFBQVEsZUFBZTtBQU81Qyx3QkFBUTtBQUFBLGNBQ1Q7QUFFQSw4QkFBZ0IsMEJBQTBCLEtBQUs7QUFBQSxZQUNoRDtBQUFBLFVBQ0Q7QUFBQSxVQUNBLGdCQUFnQixPQUFLO0FBQ3BCLGdCQUFJLENBQUMsYUFBYSxDQUFDLEdBQUc7QUFDckI7QUFBQSxZQUNEO0FBRUEsa0JBQU0sa0JBQWtCLEtBQUssbUJBQW1CO0FBQ2hELDZCQUFpQiwwQkFBMEIsQ0FBQztBQUFBLFVBQzdDO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFDQSxXQUFPLE1BQU0sV0FBVyxnQkFBZ0IsT0FBTztBQUFBLEVBQ2hEO0FBQUEsRUFFQSxrQkFBZ0M7QUFDL0IsV0FBcUIsS0FBSyxRQUFRLE9BQU87QUFBQSxFQUMxQztBQUFBLEVBRUEscUJBQXNDO0FBQ3JDLFdBQXdCLEtBQUssUUFBUSxnQkFBZ0IsRUFBRTtBQUFBLEVBQ3hEO0FBQUEsRUFFUyxXQUFXLFNBQXdCO0FBQzNDLFNBQUsseUJBQXlCLElBQUksT0FBTztBQUN6QyxVQUFNLFdBQVcsT0FBTztBQUFBLEVBQ3pCO0FBQUEsRUFFUyxRQUFjO0FBQ3RCLFVBQU0sZUFBZSxLQUFLLFFBQVEsT0FBTztBQUN6QyxRQUFJLGdCQUFnQixLQUFLLE1BQU0sTUFBTSxPQUFLLENBQUMsRUFBRSxXQUFXLENBQUMsR0FBRztBQUMzRCxtQkFBYSxZQUFZLElBQUk7QUFBQSxJQUM5QjtBQUNBLFFBQUksY0FBYyxXQUFXLEdBQUc7QUFDL0IsbUJBQWEsTUFBTTtBQUFBLElBQ3BCLE9BQU87QUFDTixZQUFNLE1BQU07QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUNEO0FBL0ZhLDRCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FoQlU7QUFpR2IsTUFBTSx3QkFBd0IsU0FBUyxHQUE0QixXQUFXLHNCQUFzQjtBQUs3RixNQUFNLGlCQUFnQyxzQkFBc0Isc0JBQXNCO0FBQUEsRUFDeEYsSUFBSTtBQUFBLEVBQ0osT0FBTyxVQUFVLFdBQVcsVUFBVTtBQUFBLEVBQ3RDLGdCQUFnQixJQUFJLGVBQWUseUJBQXlCO0FBQUEsRUFDNUQsV0FBVztBQUFBLEVBQ1gsTUFBTTtBQUFBLEVBQ04sd0JBQXdCO0FBQUEsRUFDeEIsYUFBYTtBQUFBLEVBQ2IsT0FBTztBQUFBLEVBQ1AsNkJBQTZCO0FBQUEsSUFDNUIsSUFBSTtBQUFBLElBQ0osT0FBTyxVQUFVLFdBQVcsVUFBVTtBQUFBLElBQ3RDLGVBQWUsU0FBUyxFQUFFLEtBQUssa0JBQWtCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLFlBQVk7QUFBQSxJQUNuRyxhQUFhLEVBQUUsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVEsS0FBSztBQUFBLElBQ3JFLE9BQU87QUFBQSxFQUNSO0FBQ0QsR0FBRyxzQkFBc0IsU0FBUyxFQUFFLFdBQVcsS0FBSyxDQUFDO0FBRXJELE1BQU0sYUFBYSxTQUFTLGNBQWMsYUFBYTtBQUN2RCxNQUFNLGFBQWEsU0FBUyxjQUFjLGNBQWM7QUFDeEQsTUFBTSxhQUFhLFNBQVMsY0FBYyxhQUFhO0FBRXZELE1BQU0sc0JBQXNCLElBQUksVUFBVSxhQUFhLG9CQUFvQixFQUFFO0FBQzdFLE1BQU0sbUJBQW1CLElBQUksVUFBVSxhQUFhLG9CQUFvQixFQUFFO0FBQzFFLE1BQU0sbUJBQW1CLElBQUksVUFBVSxhQUFhLGlCQUFpQixFQUFFO0FBQ3ZFLE1BQU0sK0JBQStCLElBQUksVUFBVSxhQUFhLDZCQUE2QixFQUFFO0FBQy9GLE1BQU0sbUJBQW1CLElBQUksVUFBVSxhQUFhLGlCQUFpQixFQUFFO0FBRXZFLE1BQU0sZ0JBQWdCLFNBQVMsR0FBbUIsV0FBVyxhQUFhO0FBQzFFLGNBQWMsMkJBQTJCLFVBQVUsSUFBSTtBQUFBLEVBQ3RELFNBQVM7QUFBQSxJQUFTLEVBQUUsS0FBSyxtQkFBbUIsU0FBUyxDQUFDLHFHQUFxRyxFQUFFO0FBQUEsSUFDNUo7QUFBQSxJQUEwRDtBQUFBLEVBQW1CO0FBQUEsRUFDOUUsTUFBTSxlQUFlO0FBQUE7QUFBQSxJQUVwQixzQkFBc0IsVUFBVSxXQUFXO0FBQUE7QUFBQSxJQUUzQztBQUFBLEVBQ0Q7QUFBQSxFQUNBLE9BQU8sa0JBQWtCO0FBQUEsRUFDekIsT0FBTztBQUNSLENBQUM7QUFFRCxjQUFjLDJCQUEyQixVQUFVLElBQUk7QUFBQSxFQUN0RCxTQUFTO0FBQUEsSUFBUyxFQUFFLEtBQUssbUJBQW1CLFNBQVMsQ0FBQyxxR0FBcUcsRUFBRTtBQUFBLElBQzVKO0FBQUEsSUFBK0M7QUFBQSxJQUE4QjtBQUFBLEVBQWdCO0FBQUEsRUFDOUYsTUFBTSxlQUFlO0FBQUE7QUFBQSxJQUVwQixzQkFBc0IsVUFBVSxXQUFXO0FBQUE7QUFBQSxJQUUzQyxrQ0FBa0MsVUFBVTtBQUFBLEVBQzdDO0FBQUEsRUFDQSxPQUFPLGtCQUFrQjtBQUFBLEVBQ3pCLE9BQU87QUFDUixDQUFDO0FBRUQsY0FBYywyQkFBMkIsVUFBVSxJQUFJO0FBQUEsRUFDdEQsU0FBUztBQUFBLElBQVMsRUFBRSxLQUFLLHNCQUFzQixTQUFTLENBQUMscUdBQXFHLEVBQUU7QUFBQSxJQUMvSjtBQUFBLElBQTZCO0FBQUEsRUFBZ0I7QUFBQSxFQUM5QyxNQUFNLGVBQWU7QUFBQTtBQUFBLElBRXBCLHNCQUFzQixZQUFZLFdBQVc7QUFBQTtBQUFBLElBRTdDLGtCQUFrQixZQUFZLEVBQUU7QUFBQTtBQUFBLElBRWhDLGFBQWEsVUFBVTtBQUFBLEVBQUM7QUFBQSxFQUN6QixPQUFPLGtCQUFrQjtBQUFBLEVBQ3pCLE9BQU87QUFDUixDQUFDO0FBRUQsY0FBYywyQkFBMkIsVUFBVSxJQUFJO0FBQUEsRUFDdEQsU0FBUztBQUFBLElBQVMsRUFBRSxLQUFLLDBCQUEwQixTQUFTLENBQUMscUdBQXFHLEVBQUU7QUFBQSxJQUNuSztBQUFBLElBQW1JO0FBQUEsSUFBa0I7QUFBQSxFQUFnQjtBQUFBLEVBQ3RLLE1BQU0sZUFBZTtBQUFBO0FBQUEsSUFFcEIsZUFBZSxJQUFJLGNBQWM7QUFBQSxJQUNqQyxlQUFlO0FBQUE7QUFBQSxNQUVkLGVBQWUsSUFBSSxzQkFBc0IsWUFBWSxXQUFXLEdBQUcsa0JBQWtCLFVBQVUsRUFBRSxDQUFDO0FBQUE7QUFBQSxNQUVsRyxlQUFlLElBQUksc0JBQXNCLFlBQVksV0FBVyxHQUFHLFlBQVk7QUFBQSxJQUNoRjtBQUFBLEVBQ0Q7QUFBQSxFQUNBLE9BQU8sa0JBQWtCO0FBQUEsRUFDekIsT0FBTztBQUNSLENBQUM7QUFFRCxjQUFjLDJCQUEyQixVQUFVLElBQUk7QUFBQSxFQUN0RCxTQUFTO0FBQUEsSUFBUyxFQUFFLEtBQUssZ0JBQWdCLFNBQVMsQ0FBQyxxR0FBcUcsRUFBRTtBQUFBLElBQ3pKO0FBQUEsSUFBMEM7QUFBQSxFQUFnQjtBQUFBLEVBQzNELE1BQU0sZUFBZTtBQUFBO0FBQUEsSUFFcEIsZUFBZSxJQUFJLGNBQWMsR0FBRyxPQUFPO0FBQUEsSUFDM0MsZUFBZTtBQUFBO0FBQUEsTUFFZCxlQUFlLElBQUksc0JBQXNCLFlBQVksV0FBVyxHQUFHLGtCQUFrQixVQUFVLEVBQUUsQ0FBQztBQUFBO0FBQUEsTUFFbEcsZUFBZSxJQUFJLHNCQUFzQixZQUFZLFdBQVcsR0FBRyxZQUFZO0FBQUEsSUFDaEY7QUFBQSxFQUNEO0FBQUEsRUFDQSxPQUFPLGtCQUFrQjtBQUFBLEVBQ3pCLE9BQU87QUFDUixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
