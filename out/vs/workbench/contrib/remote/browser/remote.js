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
import "./media/remoteViewlet.css";
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import { URI } from "../../../../base/common/uri.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IExtensionService, isProposedApiEnabled } from "../../../services/extensions/common/extensions.js";
import { FilterViewPaneContainer } from "../../../browser/parts/views/viewsViewlet.js";
import { VIEWLET_ID } from "./remoteExplorer.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { Extensions, ViewContainerLocation, IViewDescriptorService } from "../../../common/views.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { PersistentConnectionEventType } from "../../../../platform/remote/common/remoteAgentConnection.js";
import Severity from "../../../../base/common/severity.js";
import { ReloadWindowAction } from "../../../browser/actions/windowActions.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { SwitchRemoteViewItem } from "./explorerViewItems.js";
import { isStringArray } from "../../../../base/common/types.js";
import { IRemoteExplorerService } from "../../../services/remote/common/remoteExplorerService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import * as icons from "./remoteIcons.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
import { getRemoteName } from "../../../../platform/remote/common/remoteHosts.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IWalkthroughsService } from "../../welcomeGettingStarted/browser/gettingStartedService.js";
import { Schemas } from "../../../../base/common/network.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
class HelpTreeVirtualDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    return "HelpItemTemplate";
  }
}
class HelpTreeRenderer {
  constructor() {
    this.templateId = "HelpItemTemplate";
  }
  renderTemplate(container) {
    container.classList.add("remote-help-tree-node-item");
    const icon = dom.append(container, dom.$(".remote-help-tree-node-item-icon"));
    const parent = container;
    return { parent, icon };
  }
  renderElement(element, index, templateData) {
    const container = templateData.parent;
    dom.append(container, templateData.icon);
    templateData.icon.classList.add(...element.element.iconClasses);
    const labelContainer = dom.append(container, dom.$(".help-item-label"));
    labelContainer.innerText = element.element.label;
  }
  disposeTemplate(templateData) {
  }
}
class HelpDataSource {
  hasChildren(element) {
    return element instanceof HelpModel;
  }
  getChildren(element) {
    if (element instanceof HelpModel && element.items) {
      return element.items;
    }
    return [];
  }
}
class HelpModel extends Disposable {
  constructor(viewModel, openerService, quickInputService, commandService, remoteExplorerService, environmentService, workspaceContextService, walkthroughsService) {
    super();
    this.viewModel = viewModel;
    this.openerService = openerService;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.remoteExplorerService = remoteExplorerService;
    this.environmentService = environmentService;
    this.workspaceContextService = workspaceContextService;
    this.walkthroughsService = walkthroughsService;
    this.updateItems();
    this._register(viewModel.onDidChangeHelpInformation(() => this.updateItems()));
  }
  createHelpItemValue(info, infoKey) {
    return new HelpItemValue(
      this.commandService,
      this.walkthroughsService,
      info.extensionDescription,
      typeof info.remoteName === "string" ? [info.remoteName] : info.remoteName,
      info.virtualWorkspace,
      info[infoKey]
    );
  }
  updateItems() {
    const helpItems = [];
    const getStarted = this.viewModel.helpInformation.filter((info) => info.getStarted);
    if (getStarted.length) {
      const helpItemValues = getStarted.map((info) => this.createHelpItemValue(info, "getStarted"));
      const getStartedHelpItem = this.items?.find((item) => item.icon === icons.getStartedIcon) ?? new GetStartedHelpItem(
        icons.getStartedIcon,
        nls.localize("remote.help.getStarted", "Get Started"),
        helpItemValues,
        this.quickInputService,
        this.environmentService,
        this.openerService,
        this.remoteExplorerService,
        this.workspaceContextService,
        this.commandService
      );
      getStartedHelpItem.values = helpItemValues;
      helpItems.push(getStartedHelpItem);
    }
    const documentation = this.viewModel.helpInformation.filter((info) => info.documentation);
    if (documentation.length) {
      const helpItemValues = documentation.map((info) => this.createHelpItemValue(info, "documentation"));
      const documentationHelpItem = this.items?.find((item) => item.icon === icons.documentationIcon) ?? new HelpItem(
        icons.documentationIcon,
        nls.localize("remote.help.documentation", "Read Documentation"),
        helpItemValues,
        this.quickInputService,
        this.environmentService,
        this.openerService,
        this.remoteExplorerService,
        this.workspaceContextService
      );
      documentationHelpItem.values = helpItemValues;
      helpItems.push(documentationHelpItem);
    }
    const issues = this.viewModel.helpInformation.filter((info) => info.issues);
    if (issues.length) {
      const helpItemValues = issues.map((info) => this.createHelpItemValue(info, "issues"));
      const reviewIssuesHelpItem = this.items?.find((item) => item.icon === icons.reviewIssuesIcon) ?? new HelpItem(
        icons.reviewIssuesIcon,
        nls.localize("remote.help.issues", "Review Issues"),
        helpItemValues,
        this.quickInputService,
        this.environmentService,
        this.openerService,
        this.remoteExplorerService,
        this.workspaceContextService
      );
      reviewIssuesHelpItem.values = helpItemValues;
      helpItems.push(reviewIssuesHelpItem);
    }
    if (helpItems.length) {
      const helpItemValues = this.viewModel.helpInformation.map((info) => this.createHelpItemValue(info, "reportIssue"));
      const issueReporterItem = this.items?.find((item) => item.icon === icons.reportIssuesIcon) ?? new IssueReporterItem(
        icons.reportIssuesIcon,
        nls.localize("remote.help.report", "Report Issue"),
        helpItemValues,
        this.quickInputService,
        this.environmentService,
        this.commandService,
        this.openerService,
        this.remoteExplorerService,
        this.workspaceContextService
      );
      issueReporterItem.values = helpItemValues;
      helpItems.push(issueReporterItem);
    }
    if (helpItems.length) {
      this.items = helpItems;
    }
  }
}
class HelpItemValue {
  constructor(commandService, walkthroughService, extensionDescription, remoteAuthority, virtualWorkspace, urlOrCommandOrId) {
    this.commandService = commandService;
    this.walkthroughService = walkthroughService;
    this.extensionDescription = extensionDescription;
    this.remoteAuthority = remoteAuthority;
    this.virtualWorkspace = virtualWorkspace;
    this.urlOrCommandOrId = urlOrCommandOrId;
  }
  get description() {
    return this.getUrl().then(() => this._description);
  }
  get url() {
    return this.getUrl();
  }
  async getUrl() {
    if (this._url === void 0) {
      if (typeof this.urlOrCommandOrId === "string") {
        const url = URI.parse(this.urlOrCommandOrId);
        if (url.authority) {
          this._url = this.urlOrCommandOrId;
        } else {
          const urlCommand = this.commandService.executeCommand(this.urlOrCommandOrId).then((result) => {
            this._url = result;
            return this._url;
          });
          const emptyString = new Promise((resolve) => setTimeout(() => resolve(""), 500));
          this._url = await Promise.race([urlCommand, emptyString]);
        }
      } else if (this.urlOrCommandOrId?.id) {
        try {
          const walkthroughId = `${this.extensionDescription.id}#${this.urlOrCommandOrId.id}`;
          const walkthrough = await this.walkthroughService.getWalkthrough(walkthroughId);
          this._description = walkthrough.title;
          this._url = walkthroughId;
        } catch {
        }
      }
    }
    if (this._url === void 0) {
      this._url = "";
    }
    return this._url;
  }
}
class HelpItemBase {
  constructor(icon, label, values, quickInputService, environmentService, remoteExplorerService, workspaceContextService) {
    this.icon = icon;
    this.label = label;
    this.values = values;
    this.quickInputService = quickInputService;
    this.environmentService = environmentService;
    this.remoteExplorerService = remoteExplorerService;
    this.workspaceContextService = workspaceContextService;
    this.iconClasses = [];
    this.iconClasses.push(...ThemeIcon.asClassNameArray(icon));
    this.iconClasses.push("remote-help-tree-node-item-icon");
  }
  async getActions() {
    return (await Promise.all(this.values.map(async (value) => {
      return {
        label: value.extensionDescription.displayName || value.extensionDescription.identifier.value,
        description: await value.description ?? await value.url,
        url: await value.url,
        extensionDescription: value.extensionDescription
      };
    }))).filter((item) => item.description);
  }
  async handleClick() {
    const remoteAuthority = this.environmentService.remoteAuthority;
    if (remoteAuthority) {
      for (let i = 0; i < this.remoteExplorerService.targetType.length; i++) {
        if (remoteAuthority.startsWith(this.remoteExplorerService.targetType[i])) {
          for (const value of this.values) {
            if (value.remoteAuthority) {
              for (const authority of value.remoteAuthority) {
                if (remoteAuthority.startsWith(authority)) {
                  await this.takeAction(value.extensionDescription, await value.url);
                  return;
                }
              }
            }
          }
        }
      }
    } else {
      const virtualWorkspace = getVirtualWorkspaceLocation(this.workspaceContextService.getWorkspace())?.scheme;
      if (virtualWorkspace) {
        for (let i = 0; i < this.remoteExplorerService.targetType.length; i++) {
          for (const value of this.values) {
            if (value.virtualWorkspace && value.remoteAuthority) {
              for (const authority of value.remoteAuthority) {
                if (this.remoteExplorerService.targetType[i].startsWith(authority) && virtualWorkspace.startsWith(value.virtualWorkspace)) {
                  await this.takeAction(value.extensionDescription, await value.url);
                  return;
                }
              }
            }
          }
        }
      }
    }
    if (this.values.length > 1) {
      const actions = await this.getActions();
      if (actions.length) {
        const action = await this.quickInputService.pick(actions, { placeHolder: nls.localize("pickRemoteExtension", "Select url to open") });
        if (action) {
          await this.takeAction(action.extensionDescription, action.url);
        }
      }
    } else {
      await this.takeAction(this.values[0].extensionDescription, await this.values[0].url);
    }
  }
}
class GetStartedHelpItem extends HelpItemBase {
  constructor(icon, label, values, quickInputService, environmentService, openerService, remoteExplorerService, workspaceContextService, commandService) {
    super(icon, label, values, quickInputService, environmentService, remoteExplorerService, workspaceContextService);
    this.openerService = openerService;
    this.commandService = commandService;
  }
  async takeAction(extensionDescription, urlOrWalkthroughId) {
    if ([Schemas.http, Schemas.https].includes(URI.parse(urlOrWalkthroughId).scheme)) {
      this.openerService.open(urlOrWalkthroughId, { allowCommands: true });
      return;
    }
    this.commandService.executeCommand("workbench.action.openWalkthrough", urlOrWalkthroughId);
  }
}
class HelpItem extends HelpItemBase {
  constructor(icon, label, values, quickInputService, environmentService, openerService, remoteExplorerService, workspaceContextService) {
    super(icon, label, values, quickInputService, environmentService, remoteExplorerService, workspaceContextService);
    this.openerService = openerService;
  }
  async takeAction(extensionDescription, url) {
    await this.openerService.open(URI.parse(url), { allowCommands: true });
  }
}
class IssueReporterItem extends HelpItemBase {
  constructor(icon, label, values, quickInputService, environmentService, commandService, openerService, remoteExplorerService, workspaceContextService) {
    super(icon, label, values, quickInputService, environmentService, remoteExplorerService, workspaceContextService);
    this.commandService = commandService;
    this.openerService = openerService;
  }
  async getActions() {
    return Promise.all(this.values.map(async (value) => {
      return {
        label: value.extensionDescription.displayName || value.extensionDescription.identifier.value,
        description: "",
        url: await value.url,
        extensionDescription: value.extensionDescription
      };
    }));
  }
  async takeAction(extensionDescription, url) {
    if (!url) {
      await this.commandService.executeCommand("workbench.action.openIssueReporter", [extensionDescription.identifier.value]);
    } else {
      await this.openerService.open(URI.parse(url));
    }
  }
}
let HelpPanel = class extends ViewPane {
  constructor(viewModel, options, keybindingService, contextMenuService, contextKeyService, configurationService, instantiationService, viewDescriptorService, openerService, quickInputService, commandService, remoteExplorerService, environmentService, themeService, hoverService, workspaceContextService, walkthroughsService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.viewModel = viewModel;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.remoteExplorerService = remoteExplorerService;
    this.environmentService = environmentService;
    this.workspaceContextService = workspaceContextService;
    this.walkthroughsService = walkthroughsService;
  }
  renderBody(container) {
    super.renderBody(container);
    container.classList.add("remote-help");
    const treeContainer = document.createElement("div");
    treeContainer.classList.add("remote-help-content");
    container.appendChild(treeContainer);
    this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "RemoteHelp",
      treeContainer,
      new HelpTreeVirtualDelegate(),
      [new HelpTreeRenderer()],
      new HelpDataSource(),
      {
        accessibilityProvider: {
          getAriaLabel: (item) => {
            return item.label;
          },
          getWidgetAriaLabel: () => nls.localize("remotehelp", "Remote Help")
        }
      }
    );
    const model = this._register(new HelpModel(this.viewModel, this.openerService, this.quickInputService, this.commandService, this.remoteExplorerService, this.environmentService, this.workspaceContextService, this.walkthroughsService));
    this.tree.setInput(model);
    this._register(Event.debounce(this.tree.onDidOpen, (last, event) => event, 75, true)((e) => {
      e.element?.handleClick();
    }));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
};
HelpPanel.ID = "~remote.helpPanel";
HelpPanel.TITLE = nls.localize2("remote.help", "Help and feedback");
HelpPanel = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IViewDescriptorService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IQuickInputService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IRemoteExplorerService),
  __decorateParam(12, IWorkbenchEnvironmentService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IWorkspaceContextService),
  __decorateParam(16, IWalkthroughsService)
], HelpPanel);
class HelpPanelDescriptor {
  constructor(viewModel) {
    this.id = HelpPanel.ID;
    this.name = HelpPanel.TITLE;
    this.canToggleVisibility = true;
    this.hideByDefault = false;
    this.group = "help@50";
    this.order = -10;
    this.ctorDescriptor = new SyncDescriptor(HelpPanel, [viewModel]);
  }
}
let RemoteViewPaneContainer = class extends FilterViewPaneContainer {
  constructor(layoutService, telemetryService, contextService, storageService, configurationService, instantiationService, themeService, contextMenuService, extensionService, remoteExplorerService, viewDescriptorService, logService) {
    super(VIEWLET_ID, remoteExplorerService.onDidChangeTargetType, configurationService, layoutService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService, viewDescriptorService, logService);
    this.remoteExplorerService = remoteExplorerService;
    this.helpPanelDescriptor = new HelpPanelDescriptor(this);
    this.helpInformation = [];
    this._onDidChangeHelpInformation = this._register(new Emitter());
    this.onDidChangeHelpInformation = this._onDidChangeHelpInformation.event;
    this.hasRegisteredHelpView = false;
    this.addConstantViewDescriptors([this.helpPanelDescriptor]);
    this._register(this.remoteSwitcher = this.instantiationService.createInstance(SwitchRemoteViewItem));
    this._register(this.remoteExplorerService.onDidChangeHelpInformation((extensions) => {
      this._setHelpInformation(extensions);
    }));
    this._setHelpInformation(this.remoteExplorerService.helpInformation);
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    this.remoteSwitcher.createOptionItems(viewsRegistry.getViews(this.viewContainer));
    this._register(viewsRegistry.onViewsRegistered((e) => {
      const remoteViews = [];
      for (const view of e) {
        if (view.viewContainer.id === VIEWLET_ID) {
          remoteViews.push(...view.views);
        }
      }
      if (remoteViews.length > 0) {
        this.remoteSwitcher.createOptionItems(remoteViews);
      }
    }));
    this._register(viewsRegistry.onViewsDeregistered((e) => {
      if (e.viewContainer.id === VIEWLET_ID) {
        this.remoteSwitcher.removeOptionItems(e.views);
      }
    }));
  }
  _setHelpInformation(extensions) {
    const helpInformation = [];
    for (const extension of extensions) {
      this._handleRemoteInfoExtensionPoint(extension, helpInformation);
    }
    this.helpInformation = helpInformation;
    this._onDidChangeHelpInformation.fire();
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    if (this.helpInformation.length && !this.hasRegisteredHelpView) {
      const view = viewsRegistry.getView(this.helpPanelDescriptor.id);
      if (!view) {
        viewsRegistry.registerViews([this.helpPanelDescriptor], this.viewContainer);
      }
      this.hasRegisteredHelpView = true;
    } else if (this.hasRegisteredHelpView) {
      viewsRegistry.deregisterViews([this.helpPanelDescriptor], this.viewContainer);
      this.hasRegisteredHelpView = false;
    }
  }
  _handleRemoteInfoExtensionPoint(extension, helpInformation) {
    if (!isProposedApiEnabled(extension.description, "contribRemoteHelp")) {
      return;
    }
    if (!extension.value.documentation && !extension.value.getStarted && !extension.value.issues) {
      return;
    }
    helpInformation.push({
      extensionDescription: extension.description,
      getStarted: extension.value.getStarted,
      documentation: extension.value.documentation,
      reportIssue: extension.value.reportIssue,
      issues: extension.value.issues,
      remoteName: extension.value.remoteName,
      virtualWorkspace: extension.value.virtualWorkspace
    });
  }
  getFilterOn(viewDescriptor) {
    return isStringArray(viewDescriptor.remoteAuthority) ? viewDescriptor.remoteAuthority[0] : viewDescriptor.remoteAuthority;
  }
  setFilter(viewDescriptor) {
    this.remoteExplorerService.targetType = isStringArray(viewDescriptor.remoteAuthority) ? viewDescriptor.remoteAuthority : [viewDescriptor.remoteAuthority];
  }
  getTitle() {
    const title = nls.localize("remote.explorer", "Remote Explorer");
    return title;
  }
};
RemoteViewPaneContainer = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, IRemoteExplorerService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, ILogService)
], RemoteViewPaneContainer);
Registry.as(Extensions.ViewContainersRegistry).registerViewContainer(
  {
    id: VIEWLET_ID,
    title: nls.localize2("remote.explorer", "Remote Explorer"),
    ctorDescriptor: new SyncDescriptor(RemoteViewPaneContainer),
    hideIfEmpty: true,
    viewOrderDelegate: {
      getOrder: (group) => {
        if (!group) {
          return;
        }
        let matches = /^targets@(\d+)$/.exec(group);
        if (matches) {
          return -1e3;
        }
        matches = /^details(@(\d+))?$/.exec(group);
        if (matches) {
          return -500 + Number(matches[2]);
        }
        matches = /^help(@(\d+))?$/.exec(group);
        if (matches) {
          return -10;
        }
        return;
      }
    },
    icon: icons.remoteExplorerViewIcon,
    order: 4
  },
  ViewContainerLocation.Sidebar
);
let RemoteMarkers = class {
  constructor(remoteAgentService, timerService) {
    remoteAgentService.getEnvironment().then((remoteEnv) => {
      if (remoteEnv) {
        timerService.setPerformanceMarks("server", remoteEnv.marks);
      }
    });
  }
};
RemoteMarkers = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, ITimerService)
], RemoteMarkers);
class VisibleProgress {
  get lastReport() {
    return this._lastReport;
  }
  constructor(progressService, location, initialReport, buttons, onDidCancel) {
    this.location = location;
    this._isDisposed = false;
    this._lastReport = initialReport;
    this._currentProgressPromiseResolve = null;
    this._currentProgress = null;
    this._currentTimer = null;
    const promise = new Promise((resolve) => this._currentProgressPromiseResolve = resolve);
    progressService.withProgress(
      { location, buttons },
      (progress) => {
        if (!this._isDisposed) {
          this._currentProgress = progress;
        }
        return promise;
      },
      (choice) => onDidCancel(choice, this._lastReport)
    );
    if (this._lastReport) {
      this.report();
    }
  }
  dispose() {
    this._isDisposed = true;
    if (this._currentProgressPromiseResolve) {
      this._currentProgressPromiseResolve();
      this._currentProgressPromiseResolve = null;
    }
    this._currentProgress = null;
    if (this._currentTimer) {
      this._currentTimer.dispose();
      this._currentTimer = null;
    }
  }
  report(message) {
    if (message) {
      this._lastReport = message;
    }
    if (this._lastReport && this._currentProgress) {
      this._currentProgress.report({ message: this._lastReport });
    }
  }
  startTimer(completionTime) {
    this.stopTimer();
    this._currentTimer = new ReconnectionTimer(this, completionTime);
  }
  stopTimer() {
    if (this._currentTimer) {
      this._currentTimer.dispose();
      this._currentTimer = null;
    }
  }
}
class ReconnectionTimer {
  constructor(parent, completionTime) {
    this._parent = parent;
    this._completionTime = completionTime;
    this._renderInterval = dom.disposableWindowInterval(mainWindow, () => this._render(), 1e3);
    this._render();
  }
  dispose() {
    this._renderInterval.dispose();
  }
  _render() {
    const remainingTimeMs = this._completionTime - Date.now();
    if (remainingTimeMs < 0) {
      return;
    }
    const remainingTime = Math.ceil(remainingTimeMs / 1e3);
    if (remainingTime === 1) {
      this._parent.report(nls.localize("reconnectionWaitOne", "Attempting to reconnect in {0} second...", remainingTime));
    } else {
      this._parent.report(nls.localize("reconnectionWaitMany", "Attempting to reconnect in {0} seconds...", remainingTime));
    }
  }
}
const DISCONNECT_PROMPT_TIME = 40 * 1e3;
let RemoteAgentConnectionStatusListener = class extends Disposable {
  constructor(remoteAgentService, progressService, dialogService, commandService, quickInputService, logService, environmentService, telemetryService) {
    super();
    this._reloadWindowShown = false;
    const connection = remoteAgentService.getConnection();
    if (connection) {
      let showProgress2 = function(location, buttons, initialReport = null) {
        if (visibleProgress) {
          visibleProgress.dispose();
          visibleProgress = null;
        }
        if (!location) {
          location = quickInputVisible ? ProgressLocation.Notification : ProgressLocation.Dialog;
        }
        return new VisibleProgress(
          progressService,
          location,
          initialReport,
          buttons.map((button) => button.label),
          (choice, lastReport) => {
            if (typeof choice !== "undefined" && buttons[choice]) {
              buttons[choice].callback();
            } else {
              if (location === ProgressLocation.Dialog) {
                visibleProgress = showProgress2(ProgressLocation.Notification, buttons, lastReport);
              } else {
                hideProgress2();
              }
            }
          }
        );
      }, hideProgress2 = function() {
        if (visibleProgress) {
          visibleProgress.dispose();
          visibleProgress = null;
        }
      };
      var showProgress = showProgress2, hideProgress = hideProgress2;
      let quickInputVisible = false;
      this._register(quickInputService.onShow(() => quickInputVisible = true));
      this._register(quickInputService.onHide(() => quickInputVisible = false));
      let visibleProgress = null;
      let reconnectWaitEvent = null;
      const disposableListener = this._register(new MutableDisposable());
      let reconnectionToken = "";
      let lastIncomingDataTime = 0;
      let reconnectionAttempts = 0;
      const reconnectButton = {
        label: nls.localize("reconnectNow", "Reconnect Now"),
        callback: () => {
          reconnectWaitEvent?.skipWait();
        }
      };
      const reloadButton = {
        label: nls.localize("reloadWindow", "Reload Window"),
        callback: () => {
          telemetryService.publicLog2("remoteReconnectionReload", {
            remoteName: getRemoteName(environmentService.remoteAuthority),
            reconnectionToken,
            millisSinceLastIncomingData: Date.now() - lastIncomingDataTime,
            attempt: reconnectionAttempts
          });
          commandService.executeCommand(ReloadWindowAction.ID);
        }
      };
      this._register(connection.onDidStateChange((e) => {
        visibleProgress?.stopTimer();
        disposableListener.clear();
        switch (e.type) {
          case PersistentConnectionEventType.ConnectionLost:
            reconnectionToken = e.reconnectionToken;
            lastIncomingDataTime = Date.now() - e.millisSinceLastIncomingData;
            reconnectionAttempts = 0;
            telemetryService.publicLog2("remoteConnectionLost", {
              remoteName: getRemoteName(environmentService.remoteAuthority),
              reconnectionToken: e.reconnectionToken
            });
            if (visibleProgress || e.millisSinceLastIncomingData > DISCONNECT_PROMPT_TIME) {
              if (!visibleProgress) {
                visibleProgress = showProgress2(null, [reconnectButton, reloadButton]);
              }
              visibleProgress.report(nls.localize("connectionLost", "Connection Lost"));
            }
            break;
          case PersistentConnectionEventType.ReconnectionWait:
            if (visibleProgress) {
              reconnectWaitEvent = e;
              visibleProgress = showProgress2(null, [reconnectButton, reloadButton]);
              visibleProgress.startTimer(Date.now() + 1e3 * e.durationSeconds);
            }
            break;
          case PersistentConnectionEventType.ReconnectionRunning:
            reconnectionToken = e.reconnectionToken;
            lastIncomingDataTime = Date.now() - e.millisSinceLastIncomingData;
            reconnectionAttempts = e.attempt;
            telemetryService.publicLog2("remoteReconnectionRunning", {
              remoteName: getRemoteName(environmentService.remoteAuthority),
              reconnectionToken: e.reconnectionToken,
              millisSinceLastIncomingData: e.millisSinceLastIncomingData,
              attempt: e.attempt
            });
            if (visibleProgress || e.millisSinceLastIncomingData > DISCONNECT_PROMPT_TIME) {
              visibleProgress = showProgress2(null, [reloadButton]);
              visibleProgress.report(nls.localize("reconnectionRunning", "Disconnected. Attempting to reconnect..."));
              disposableListener.value = quickInputService.onShow(() => {
                if (visibleProgress && visibleProgress.location === ProgressLocation.Dialog) {
                  visibleProgress = showProgress2(ProgressLocation.Notification, [reloadButton], visibleProgress.lastReport);
                }
              });
            }
            break;
          case PersistentConnectionEventType.ReconnectionPermanentFailure:
            reconnectionToken = e.reconnectionToken;
            lastIncomingDataTime = Date.now() - e.millisSinceLastIncomingData;
            reconnectionAttempts = e.attempt;
            telemetryService.publicLog2("remoteReconnectionPermanentFailure", {
              remoteName: getRemoteName(environmentService.remoteAuthority),
              reconnectionToken: e.reconnectionToken,
              millisSinceLastIncomingData: e.millisSinceLastIncomingData,
              attempt: e.attempt,
              handled: e.handled
            });
            hideProgress2();
            if (e.handled) {
              logService.info(`Error handled: Not showing a notification for the error.`);
            } else if (!this._reloadWindowShown) {
              this._reloadWindowShown = true;
              dialogService.confirm({
                type: Severity.Error,
                message: nls.localize("reconnectionPermanentFailure", "Cannot reconnect. Please reload the window."),
                primaryButton: nls.localize({ key: "reloadWindow.dialog", comment: ["&& denotes a mnemonic"] }, "&&Reload Window")
              }).then((result) => {
                if (result.confirmed) {
                  commandService.executeCommand(ReloadWindowAction.ID);
                }
              });
            }
            break;
          case PersistentConnectionEventType.ConnectionGain:
            reconnectionToken = e.reconnectionToken;
            lastIncomingDataTime = Date.now() - e.millisSinceLastIncomingData;
            reconnectionAttempts = e.attempt;
            telemetryService.publicLog2("remoteConnectionGain", {
              remoteName: getRemoteName(environmentService.remoteAuthority),
              reconnectionToken: e.reconnectionToken,
              millisSinceLastIncomingData: e.millisSinceLastIncomingData,
              attempt: e.attempt
            });
            hideProgress2();
            break;
        }
      }));
    }
  }
};
RemoteAgentConnectionStatusListener = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, IProgressService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IWorkbenchEnvironmentService),
  __decorateParam(7, ITelemetryService)
], RemoteAgentConnectionStatusListener);
export {
  RemoteAgentConnectionStatusListener,
  RemoteMarkers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVxcYnJvd3NlclxccmVtb3RlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3JlbW90ZVZpZXdsZXQuY3NzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEZpbHRlclZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3c1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgVklFV0xFVF9JRCB9IGZyb20gJy4vcmVtb3RlRXhwbG9yZXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3IsIElWaWV3c1JlZ2lzdHJ5LCBFeHRlbnNpb25zLCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3MsIElQcm9ncmVzc1N0ZXAsIElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgUmVjb25uZWN0aW9uV2FpdEV2ZW50LCBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRDb25uZWN0aW9uLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBSZWxvYWRXaW5kb3dBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd2luZG93QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3dpdGNoUmVtb3RlVmlld0l0ZW0gfSBmcm9tICcuL2V4cGxvcmVyVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBIZWxwSW5mb3JtYXRpb24sIElSZW1vdGVFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUV4cGxvcmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSwgSVZpZXdQYW5lT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElUcmVlUmVuZGVyZXIsIElUcmVlTm9kZSwgSUFzeW5jRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblBvaW50VXNlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4vcmVtb3RlSWNvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGltZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGltZXIvYnJvd3Nlci90aW1lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0UmVtb3RlTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlSG9zdHMuanMnO1xuaW1wb3J0IHsgZ2V0VmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi92aXJ0dWFsV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXYWxrdGhyb3VnaHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vd2VsY29tZUdldHRpbmdTdGFydGVkL2Jyb3dzZXIvZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcblxuaW50ZXJmYWNlIElWaWV3TW9kZWwge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhlbHBJbmZvcm1hdGlvbjogRXZlbnQ8dm9pZD47XG5cdGhlbHBJbmZvcm1hdGlvbjogSGVscEluZm9ybWF0aW9uW107XG59XG5cbmNsYXNzIEhlbHBUcmVlVmlydHVhbERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUhlbHBJdGVtPiB7XG5cdGdldEhlaWdodChlbGVtZW50OiBJSGVscEl0ZW0pOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogSUhlbHBJdGVtKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ0hlbHBJdGVtVGVtcGxhdGUnO1xuXHR9XG59XG5cbmludGVyZmFjZSBJSGVscEl0ZW1UZW1wbGF0ZURhdGEge1xuXHRwYXJlbnQ6IEhUTUxFbGVtZW50O1xuXHRpY29uOiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgSGVscFRyZWVSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8SGVscE1vZGVsIHwgSUhlbHBJdGVtLCBJSGVscEl0ZW0sIElIZWxwSXRlbVRlbXBsYXRlRGF0YT4ge1xuXHR0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnSGVscEl0ZW1UZW1wbGF0ZSc7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElIZWxwSXRlbVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3JlbW90ZS1oZWxwLXRyZWUtbm9kZS1pdGVtJyk7XG5cdFx0Y29uc3QgaWNvbiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnJlbW90ZS1oZWxwLXRyZWUtbm9kZS1pdGVtLWljb24nKSk7XG5cdFx0Y29uc3QgcGFyZW50ID0gY29udGFpbmVyO1xuXHRcdHJldHVybiB7IHBhcmVudCwgaWNvbiB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8SUhlbHBJdGVtLCBJSGVscEl0ZW0+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElIZWxwSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRlbXBsYXRlRGF0YS5wYXJlbnQ7XG5cdFx0ZG9tLmFwcGVuZChjb250YWluZXIsIHRlbXBsYXRlRGF0YS5pY29uKTtcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc0xpc3QuYWRkKC4uLmVsZW1lbnQuZWxlbWVudC5pY29uQ2xhc3Nlcyk7XG5cdFx0Y29uc3QgbGFiZWxDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5oZWxwLWl0ZW0tbGFiZWwnKSk7XG5cdFx0bGFiZWxDb250YWluZXIuaW5uZXJUZXh0ID0gZWxlbWVudC5lbGVtZW50LmxhYmVsO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUhlbHBJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cblx0fVxufVxuXG5jbGFzcyBIZWxwRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8SGVscE1vZGVsLCBJSGVscEl0ZW0+IHtcblx0aGFzQ2hpbGRyZW4oZWxlbWVudDogSGVscE1vZGVsKSB7XG5cdFx0cmV0dXJuIGVsZW1lbnQgaW5zdGFuY2VvZiBIZWxwTW9kZWw7XG5cdH1cblxuXHRnZXRDaGlsZHJlbihlbGVtZW50OiBIZWxwTW9kZWwpIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEhlbHBNb2RlbCAmJiBlbGVtZW50Lml0ZW1zKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5pdGVtcztcblx0XHR9XG5cblx0XHRyZXR1cm4gW107XG5cdH1cbn1cbmludGVyZmFjZSBJSGVscEl0ZW0ge1xuXHRpY29uOiBUaGVtZUljb247XG5cdGljb25DbGFzc2VzOiBzdHJpbmdbXTtcblx0bGFiZWw6IHN0cmluZztcblx0dmFsdWVzOiBIZWxwSXRlbVZhbHVlW107XG5cdGhhbmRsZUNsaWNrKCk6IFByb21pc2U8dm9pZD47XG59XG5cbmNsYXNzIEhlbHBNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRpdGVtczogSUhlbHBJdGVtW10gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB2aWV3TW9kZWw6IElWaWV3TW9kZWwsXG5cdFx0cHJpdmF0ZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRwcml2YXRlIHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRwcml2YXRlIHdhbGt0aHJvdWdoc1NlcnZpY2U6IElXYWxrdGhyb3VnaHNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUl0ZW1zKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlld01vZGVsLm9uRGlkQ2hhbmdlSGVscEluZm9ybWF0aW9uKCgpID0+IHRoaXMudXBkYXRlSXRlbXMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVIZWxwSXRlbVZhbHVlKGluZm86IEhlbHBJbmZvcm1hdGlvbiwgaW5mb0tleTogRXhjbHVkZTxrZXlvZiBIZWxwSW5mb3JtYXRpb24sICdleHRlbnNpb25EZXNjcmlwdGlvbicgfCAncmVtb3RlTmFtZScgfCAndmlydHVhbFdvcmtzcGFjZSc+KSB7XG5cdFx0cmV0dXJuIG5ldyBIZWxwSXRlbVZhbHVlKHRoaXMuY29tbWFuZFNlcnZpY2UsXG5cdFx0XHR0aGlzLndhbGt0aHJvdWdoc1NlcnZpY2UsXG5cdFx0XHRpbmZvLmV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdFx0KHR5cGVvZiBpbmZvLnJlbW90ZU5hbWUgPT09ICdzdHJpbmcnKSA/IFtpbmZvLnJlbW90ZU5hbWVdIDogaW5mby5yZW1vdGVOYW1lLFxuXHRcdFx0aW5mby52aXJ0dWFsV29ya3NwYWNlLFxuXHRcdFx0aW5mb1tpbmZvS2V5XSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUl0ZW1zKCkge1xuXHRcdGNvbnN0IGhlbHBJdGVtczogSUhlbHBJdGVtW10gPSBbXTtcblxuXHRcdGNvbnN0IGdldFN0YXJ0ZWQgPSB0aGlzLnZpZXdNb2RlbC5oZWxwSW5mb3JtYXRpb24uZmlsdGVyKGluZm8gPT4gaW5mby5nZXRTdGFydGVkKTtcblx0XHRpZiAoZ2V0U3RhcnRlZC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGhlbHBJdGVtVmFsdWVzID0gZ2V0U3RhcnRlZC5tYXAoKGluZm86IEhlbHBJbmZvcm1hdGlvbikgPT4gdGhpcy5jcmVhdGVIZWxwSXRlbVZhbHVlKGluZm8sICdnZXRTdGFydGVkJykpO1xuXHRcdFx0Y29uc3QgZ2V0U3RhcnRlZEhlbHBJdGVtID0gdGhpcy5pdGVtcz8uZmluZChpdGVtID0+IGl0ZW0uaWNvbiA9PT0gaWNvbnMuZ2V0U3RhcnRlZEljb24pID8/IG5ldyBHZXRTdGFydGVkSGVscEl0ZW0oXG5cdFx0XHRcdGljb25zLmdldFN0YXJ0ZWRJY29uLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3JlbW90ZS5oZWxwLmdldFN0YXJ0ZWQnLCBcIkdldCBTdGFydGVkXCIpLFxuXHRcdFx0XHRoZWxwSXRlbVZhbHVlcyxcblx0XHRcdFx0dGhpcy5xdWlja0lucHV0U2VydmljZSxcblx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZSxcblx0XHRcdFx0dGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2Vcblx0XHRcdCk7XG5cdFx0XHRnZXRTdGFydGVkSGVscEl0ZW0udmFsdWVzID0gaGVscEl0ZW1WYWx1ZXM7XG5cdFx0XHRoZWxwSXRlbXMucHVzaChnZXRTdGFydGVkSGVscEl0ZW0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRvY3VtZW50YXRpb24gPSB0aGlzLnZpZXdNb2RlbC5oZWxwSW5mb3JtYXRpb24uZmlsdGVyKGluZm8gPT4gaW5mby5kb2N1bWVudGF0aW9uKTtcblx0XHRpZiAoZG9jdW1lbnRhdGlvbi5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGhlbHBJdGVtVmFsdWVzID0gZG9jdW1lbnRhdGlvbi5tYXAoKGluZm86IEhlbHBJbmZvcm1hdGlvbikgPT4gdGhpcy5jcmVhdGVIZWxwSXRlbVZhbHVlKGluZm8sICdkb2N1bWVudGF0aW9uJykpO1xuXHRcdFx0Y29uc3QgZG9jdW1lbnRhdGlvbkhlbHBJdGVtID0gdGhpcy5pdGVtcz8uZmluZChpdGVtID0+IGl0ZW0uaWNvbiA9PT0gaWNvbnMuZG9jdW1lbnRhdGlvbkljb24pID8/IG5ldyBIZWxwSXRlbShcblx0XHRcdFx0aWNvbnMuZG9jdW1lbnRhdGlvbkljb24sXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgncmVtb3RlLmhlbHAuZG9jdW1lbnRhdGlvbicsIFwiUmVhZCBEb2N1bWVudGF0aW9uXCIpLFxuXHRcdFx0XHRoZWxwSXRlbVZhbHVlcyxcblx0XHRcdFx0dGhpcy5xdWlja0lucHV0U2VydmljZSxcblx0XHRcdFx0dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZSxcblx0XHRcdFx0dGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Vcblx0XHRcdCk7XG5cdFx0XHRkb2N1bWVudGF0aW9uSGVscEl0ZW0udmFsdWVzID0gaGVscEl0ZW1WYWx1ZXM7XG5cdFx0XHRoZWxwSXRlbXMucHVzaChkb2N1bWVudGF0aW9uSGVscEl0ZW0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzc3VlcyA9IHRoaXMudmlld01vZGVsLmhlbHBJbmZvcm1hdGlvbi5maWx0ZXIoaW5mbyA9PiBpbmZvLmlzc3Vlcyk7XG5cdFx0aWYgKGlzc3Vlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGhlbHBJdGVtVmFsdWVzID0gaXNzdWVzLm1hcCgoaW5mbzogSGVscEluZm9ybWF0aW9uKSA9PiB0aGlzLmNyZWF0ZUhlbHBJdGVtVmFsdWUoaW5mbywgJ2lzc3VlcycpKTtcblx0XHRcdGNvbnN0IHJldmlld0lzc3Vlc0hlbHBJdGVtID0gdGhpcy5pdGVtcz8uZmluZChpdGVtID0+IGl0ZW0uaWNvbiA9PT0gaWNvbnMucmV2aWV3SXNzdWVzSWNvbikgPz8gbmV3IEhlbHBJdGVtKFxuXHRcdFx0XHRpY29ucy5yZXZpZXdJc3N1ZXNJY29uLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3JlbW90ZS5oZWxwLmlzc3VlcycsIFwiUmV2aWV3IElzc3Vlc1wiKSxcblx0XHRcdFx0aGVscEl0ZW1WYWx1ZXMsXG5cdFx0XHRcdHRoaXMucXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdFx0XHQpO1xuXHRcdFx0cmV2aWV3SXNzdWVzSGVscEl0ZW0udmFsdWVzID0gaGVscEl0ZW1WYWx1ZXM7XG5cdFx0XHRoZWxwSXRlbXMucHVzaChyZXZpZXdJc3N1ZXNIZWxwSXRlbSk7XG5cdFx0fVxuXG5cdFx0aWYgKGhlbHBJdGVtcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGhlbHBJdGVtVmFsdWVzID0gdGhpcy52aWV3TW9kZWwuaGVscEluZm9ybWF0aW9uLm1hcChpbmZvID0+IHRoaXMuY3JlYXRlSGVscEl0ZW1WYWx1ZShpbmZvLCAncmVwb3J0SXNzdWUnKSk7XG5cdFx0XHRjb25zdCBpc3N1ZVJlcG9ydGVySXRlbSA9IHRoaXMuaXRlbXM/LmZpbmQoaXRlbSA9PiBpdGVtLmljb24gPT09IGljb25zLnJlcG9ydElzc3Vlc0ljb24pID8/IG5ldyBJc3N1ZVJlcG9ydGVySXRlbShcblx0XHRcdFx0aWNvbnMucmVwb3J0SXNzdWVzSWNvbixcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdyZW1vdGUuaGVscC5yZXBvcnQnLCBcIlJlcG9ydCBJc3N1ZVwiKSxcblx0XHRcdFx0aGVscEl0ZW1WYWx1ZXMsXG5cdFx0XHRcdHRoaXMucXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdFx0XHQpO1xuXHRcdFx0aXNzdWVSZXBvcnRlckl0ZW0udmFsdWVzID0gaGVscEl0ZW1WYWx1ZXM7XG5cdFx0XHRoZWxwSXRlbXMucHVzaChpc3N1ZVJlcG9ydGVySXRlbSk7XG5cdFx0fVxuXG5cdFx0aWYgKGhlbHBJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuaXRlbXMgPSBoZWxwSXRlbXM7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEhlbHBJdGVtVmFsdWUge1xuXHRwcml2YXRlIF91cmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsIHByaXZhdGUgd2Fsa3Rocm91Z2hTZXJ2aWNlOiBJV2Fsa3Rocm91Z2hzU2VydmljZSwgcHVibGljIGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHB1YmxpYyByZWFkb25seSByZW1vdGVBdXRob3JpdHk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBwdWJsaWMgcmVhZG9ubHkgdmlydHVhbFdvcmtzcGFjZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBwcml2YXRlIHVybE9yQ29tbWFuZE9ySWQ/OiBzdHJpbmcgfCB7IGlkOiBzdHJpbmcgfSkge1xuXHR9XG5cblx0Z2V0IGRlc2NyaXB0aW9uKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VXJsKCkudGhlbigoKSA9PiB0aGlzLl9kZXNjcmlwdGlvbik7XG5cdH1cblxuXHRnZXQgdXJsKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VXJsKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFVybCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl91cmwgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKHR5cGVvZiB0aGlzLnVybE9yQ29tbWFuZE9ySWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSh0aGlzLnVybE9yQ29tbWFuZE9ySWQpO1xuXHRcdFx0XHRpZiAodXJsLmF1dGhvcml0eSkge1xuXHRcdFx0XHRcdHRoaXMuX3VybCA9IHRoaXMudXJsT3JDb21tYW5kT3JJZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCB1cmxDb21tYW5kID0gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZDxzdHJpbmc+KHRoaXMudXJsT3JDb21tYW5kT3JJZCkudGhlbigocmVzdWx0KSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBpZiBleGVjdXRpbmcgdGhpcyBjb21tYW5kIHRpbWVzIG91dCwgY2FjaGUgaXRzIHZhbHVlIHdoZW5ldmVyIGl0IGV2ZW50dWFsbHkgcmVzb2x2ZXNcblx0XHRcdFx0XHRcdHRoaXMuX3VybCA9IHJlc3VsdDtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl91cmw7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Ly8gV2UgbXVzdCBiZSBkZWZlbnNpdmUuIFRoZSBjb21tYW5kIG1heSBuZXZlciByZXR1cm4sIG1lYW5pbmcgdGhhdCBubyBoZWxwIGF0IGFsbCBpcyBldmVyIHNob3duIVxuXHRcdFx0XHRcdGNvbnN0IGVtcHR5U3RyaW5nOiBQcm9taXNlPHN0cmluZz4gPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQoKCkgPT4gcmVzb2x2ZSgnJyksIDUwMCkpO1xuXHRcdFx0XHRcdHRoaXMuX3VybCA9IGF3YWl0IFByb21pc2UucmFjZShbdXJsQ29tbWFuZCwgZW1wdHlTdHJpbmddKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnVybE9yQ29tbWFuZE9ySWQ/LmlkKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgd2Fsa3Rocm91Z2hJZCA9IGAke3RoaXMuZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWR9IyR7dGhpcy51cmxPckNvbW1hbmRPcklkLmlkfWA7XG5cdFx0XHRcdFx0Y29uc3Qgd2Fsa3Rocm91Z2ggPSBhd2FpdCB0aGlzLndhbGt0aHJvdWdoU2VydmljZS5nZXRXYWxrdGhyb3VnaCh3YWxrdGhyb3VnaElkKTtcblx0XHRcdFx0XHR0aGlzLl9kZXNjcmlwdGlvbiA9IHdhbGt0aHJvdWdoLnRpdGxlO1xuXHRcdFx0XHRcdHRoaXMuX3VybCA9IHdhbGt0aHJvdWdoSWQ7XG5cdFx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl91cmwgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fdXJsID0gJyc7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl91cmw7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgSGVscEl0ZW1CYXNlIGltcGxlbWVudHMgSUhlbHBJdGVtIHtcblx0cHVibGljIGljb25DbGFzc2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgaWNvbjogVGhlbWVJY29uLFxuXHRcdHB1YmxpYyBsYWJlbDogc3RyaW5nLFxuXHRcdHB1YmxpYyB2YWx1ZXM6IEhlbHBJdGVtVmFsdWVbXSxcblx0XHRwcml2YXRlIHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuaWNvbkNsYXNzZXMucHVzaCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG5cdFx0dGhpcy5pY29uQ2xhc3Nlcy5wdXNoKCdyZW1vdGUtaGVscC10cmVlLW5vZGUtaXRlbS1pY29uJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZ2V0QWN0aW9ucygpOiBQcm9taXNlPHtcblx0XHRsYWJlbDogc3RyaW5nO1xuXHRcdHVybDogc3RyaW5nO1xuXHRcdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0fVtdPiB7XG5cdFx0cmV0dXJuIChhd2FpdCBQcm9taXNlLmFsbCh0aGlzLnZhbHVlcy5tYXAoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogdmFsdWUuZXh0ZW5zaW9uRGVzY3JpcHRpb24uZGlzcGxheU5hbWUgfHwgdmFsdWUuZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGF3YWl0IHZhbHVlLmRlc2NyaXB0aW9uID8/IGF3YWl0IHZhbHVlLnVybCxcblx0XHRcdFx0dXJsOiBhd2FpdCB2YWx1ZS51cmwsXG5cdFx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uOiB2YWx1ZS5leHRlbnNpb25EZXNjcmlwdGlvblxuXHRcdFx0fTtcblx0XHR9KSkpLmZpbHRlcihpdGVtID0+IGl0ZW0uZGVzY3JpcHRpb24pO1xuXHR9XG5cblx0YXN5bmMgaGFuZGxlQ2xpY2soKSB7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGlmIChyZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudGFyZ2V0VHlwZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAocmVtb3RlQXV0aG9yaXR5LnN0YXJ0c1dpdGgodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudGFyZ2V0VHlwZVtpXSkpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHRoaXMudmFsdWVzKSB7XG5cdFx0XHRcdFx0XHRpZiAodmFsdWUucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgYXV0aG9yaXR5IG9mIHZhbHVlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChyZW1vdGVBdXRob3JpdHkuc3RhcnRzV2l0aChhdXRob3JpdHkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnRha2VBY3Rpb24odmFsdWUuZXh0ZW5zaW9uRGVzY3JpcHRpb24sIGF3YWl0IHZhbHVlLnVybCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHZpcnR1YWxXb3Jrc3BhY2UgPSBnZXRWaXJ0dWFsV29ya3NwYWNlTG9jYXRpb24odGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSk/LnNjaGVtZTtcblx0XHRcdGlmICh2aXJ0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudGFyZ2V0VHlwZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdmFsdWUgb2YgdGhpcy52YWx1ZXMpIHtcblx0XHRcdFx0XHRcdGlmICh2YWx1ZS52aXJ0dWFsV29ya3NwYWNlICYmIHZhbHVlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGF1dGhvcml0eSBvZiB2YWx1ZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudGFyZ2V0VHlwZVtpXS5zdGFydHNXaXRoKGF1dGhvcml0eSkgJiYgdmlydHVhbFdvcmtzcGFjZS5zdGFydHNXaXRoKHZhbHVlLnZpcnR1YWxXb3Jrc3BhY2UpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnRha2VBY3Rpb24odmFsdWUuZXh0ZW5zaW9uRGVzY3JpcHRpb24sIGF3YWl0IHZhbHVlLnVybCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy52YWx1ZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0QWN0aW9ucygpO1xuXG5cdFx0XHRpZiAoYWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKGFjdGlvbnMsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgncGlja1JlbW90ZUV4dGVuc2lvbicsIFwiU2VsZWN0IHVybCB0byBvcGVuXCIpIH0pO1xuXHRcdFx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy50YWtlQWN0aW9uKGFjdGlvbi5leHRlbnNpb25EZXNjcmlwdGlvbiwgYWN0aW9uLnVybCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy50YWtlQWN0aW9uKHRoaXMudmFsdWVzWzBdLmV4dGVuc2lvbkRlc2NyaXB0aW9uLCBhd2FpdCB0aGlzLnZhbHVlc1swXS51cmwpO1xuXHRcdH1cblxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IHRha2VBY3Rpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdXJsPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuY2xhc3MgR2V0U3RhcnRlZEhlbHBJdGVtIGV4dGVuZHMgSGVscEl0ZW1CYXNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0aWNvbjogVGhlbWVJY29uLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0dmFsdWVzOiBIZWxwSXRlbVZhbHVlW10sXG5cdFx0cXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRyZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRwcml2YXRlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaWNvbiwgbGFiZWwsIHZhbHVlcywgcXVpY2tJbnB1dFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgdGFrZUFjdGlvbihleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB1cmxPcldhbGt0aHJvdWdoSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChbU2NoZW1hcy5odHRwLCBTY2hlbWFzLmh0dHBzXS5pbmNsdWRlcyhVUkkucGFyc2UodXJsT3JXYWxrdGhyb3VnaElkKS5zY2hlbWUpKSB7XG5cdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih1cmxPcldhbGt0aHJvdWdoSWQsIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5XYWxrdGhyb3VnaCcsIHVybE9yV2Fsa3Rocm91Z2hJZCk7XG5cdH1cbn1cblxuY2xhc3MgSGVscEl0ZW0gZXh0ZW5kcyBIZWxwSXRlbUJhc2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRpY29uOiBUaGVtZUljb24sXG5cdFx0bGFiZWw6IHN0cmluZyxcblx0XHR2YWx1ZXM6IEhlbHBJdGVtVmFsdWVbXSxcblx0XHRxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRwcml2YXRlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGljb24sIGxhYmVsLCB2YWx1ZXMsIHF1aWNrSW5wdXRTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHJlbW90ZUV4cGxvcmVyU2VydmljZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHRha2VBY3Rpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdXJsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UodXJsKSwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHR9XG59XG5cbmNsYXNzIElzc3VlUmVwb3J0ZXJJdGVtIGV4dGVuZHMgSGVscEl0ZW1CYXNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0aWNvbjogVGhlbWVJY29uLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0dmFsdWVzOiBIZWxwSXRlbVZhbHVlW10sXG5cdFx0cXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaWNvbiwgbGFiZWwsIHZhbHVlcywgcXVpY2tJbnB1dFNlcnZpY2UsIGVudmlyb25tZW50U2VydmljZSwgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZ2V0QWN0aW9ucygpOiBQcm9taXNlPHtcblx0XHRsYWJlbDogc3RyaW5nO1xuXHRcdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdFx0dXJsOiBzdHJpbmc7XG5cdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0fVtdPiB7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHRoaXMudmFsdWVzLm1hcChhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiB2YWx1ZS5leHRlbnNpb25EZXNjcmlwdGlvbi5kaXNwbGF5TmFtZSB8fCB2YWx1ZS5leHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRcdHVybDogYXdhaXQgdmFsdWUudXJsLFxuXHRcdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbjogdmFsdWUuZXh0ZW5zaW9uRGVzY3JpcHRpb25cblx0XHRcdH07XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHRha2VBY3Rpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdXJsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXVybCkge1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuSXNzdWVSZXBvcnRlcicsIFtleHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSh1cmwpKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgSGVscFBhbmVsIGV4dGVuZHMgVmlld1BhbmUge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnfnJlbW90ZS5oZWxwUGFuZWwnO1xuXHRzdGF0aWMgcmVhZG9ubHkgVElUTEUgPSBubHMubG9jYWxpemUyKCdyZW1vdGUuaGVscCcsIFwiSGVscCBhbmQgZmVlZGJhY2tcIik7XG5cdHByaXZhdGUgdHJlZSE6IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SGVscE1vZGVsLCBJSGVscEl0ZW0sIElIZWxwSXRlbT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHZpZXdNb2RlbDogSVZpZXdNb2RlbCxcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByb3RlY3RlZCBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJvdGVjdGVkIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElXYWxrdGhyb3VnaHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2Fsa3Rocm91Z2hzU2VydmljZTogSVdhbGt0aHJvdWdoc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdyZW1vdGUtaGVscCcpO1xuXHRcdGNvbnN0IHRyZWVDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0cmVlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3JlbW90ZS1oZWxwLWNvbnRlbnQnKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodHJlZUNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8SGVscE1vZGVsLCBJSGVscEl0ZW0sIElIZWxwSXRlbT4sXG5cdFx0XHQnUmVtb3RlSGVscCcsXG5cdFx0XHR0cmVlQ29udGFpbmVyLFxuXHRcdFx0bmV3IEhlbHBUcmVlVmlydHVhbERlbGVnYXRlKCksXG5cdFx0XHRbbmV3IEhlbHBUcmVlUmVuZGVyZXIoKV0sXG5cdFx0XHRuZXcgSGVscERhdGFTb3VyY2UoKSxcblx0XHRcdHtcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoaXRlbTogSGVscEl0ZW1CYXNlKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaXRlbS5sYWJlbDtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbmxzLmxvY2FsaXplKCdyZW1vdGVoZWxwJywgXCJSZW1vdGUgSGVscFwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEhlbHBNb2RlbCh0aGlzLnZpZXdNb2RlbCwgdGhpcy5vcGVuZXJTZXJ2aWNlLCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLCB0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHRoaXMud2Fsa3Rocm91Z2hzU2VydmljZSkpO1xuXG5cdFx0dGhpcy50cmVlLnNldElucHV0KG1vZGVsKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmRlYm91bmNlKHRoaXMudHJlZS5vbkRpZE9wZW4sIChsYXN0LCBldmVudCkgPT4gZXZlbnQsIDc1LCB0cnVlKShlID0+IHtcblx0XHRcdGUuZWxlbWVudD8uaGFuZGxlQ2xpY2soKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxufVxuXG5jbGFzcyBIZWxwUGFuZWxEZXNjcmlwdG9yIGltcGxlbWVudHMgSVZpZXdEZXNjcmlwdG9yIHtcblx0cmVhZG9ubHkgaWQgPSBIZWxwUGFuZWwuSUQ7XG5cdHJlYWRvbmx5IG5hbWUgPSBIZWxwUGFuZWwuVElUTEU7XG5cdHJlYWRvbmx5IGN0b3JEZXNjcmlwdG9yOiBTeW5jRGVzY3JpcHRvcjxIZWxwUGFuZWw+O1xuXHRyZWFkb25seSBjYW5Ub2dnbGVWaXNpYmlsaXR5ID0gdHJ1ZTtcblx0cmVhZG9ubHkgaGlkZUJ5RGVmYXVsdCA9IGZhbHNlO1xuXHRyZWFkb25seSBncm91cCA9ICdoZWxwQDUwJztcblx0cmVhZG9ubHkgb3JkZXIgPSAtMTA7XG5cblx0Y29uc3RydWN0b3Iodmlld01vZGVsOiBJVmlld01vZGVsKSB7XG5cdFx0dGhpcy5jdG9yRGVzY3JpcHRvciA9IG5ldyBTeW5jRGVzY3JpcHRvcihIZWxwUGFuZWwsIFt2aWV3TW9kZWxdKTtcblx0fVxufVxuXG5jbGFzcyBSZW1vdGVWaWV3UGFuZUNvbnRhaW5lciBleHRlbmRzIEZpbHRlclZpZXdQYW5lQ29udGFpbmVyIGltcGxlbWVudHMgSVZpZXdNb2RlbCB7XG5cdHByaXZhdGUgaGVscFBhbmVsRGVzY3JpcHRvciA9IG5ldyBIZWxwUGFuZWxEZXNjcmlwdG9yKHRoaXMpO1xuXHRoZWxwSW5mb3JtYXRpb246IEhlbHBJbmZvcm1hdGlvbltdID0gW107XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlSGVscEluZm9ybWF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyBvbkRpZENoYW5nZUhlbHBJbmZvcm1hdGlvbjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUhlbHBJbmZvcm1hdGlvbi5ldmVudDtcblx0cHJpdmF0ZSBoYXNSZWdpc3RlcmVkSGVscFZpZXc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZW1vdGVTd2l0Y2hlcjogU3dpdGNoUmVtb3RlVmlld0l0ZW0gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoVklFV0xFVF9JRCwgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlVGFyZ2V0VHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGxheW91dFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGV4dGVuc2lvblNlcnZpY2UsIGNvbnRleHRTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuYWRkQ29uc3RhbnRWaWV3RGVzY3JpcHRvcnMoW3RoaXMuaGVscFBhbmVsRGVzY3JpcHRvcl0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlU3dpdGNoZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN3aXRjaFJlbW90ZVZpZXdJdGVtKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2Uub25EaWRDaGFuZ2VIZWxwSW5mb3JtYXRpb24oZXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHR0aGlzLl9zZXRIZWxwSW5mb3JtYXRpb24oZXh0ZW5zaW9ucyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc2V0SGVscEluZm9ybWF0aW9uKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmhlbHBJbmZvcm1hdGlvbik7XG5cdFx0Y29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXG5cdFx0dGhpcy5yZW1vdGVTd2l0Y2hlci5jcmVhdGVPcHRpb25JdGVtcyh2aWV3c1JlZ2lzdHJ5LmdldFZpZXdzKHRoaXMudmlld0NvbnRhaW5lcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHZpZXdzUmVnaXN0cnkub25WaWV3c1JlZ2lzdGVyZWQoZSA9PiB7XG5cdFx0XHRjb25zdCByZW1vdGVWaWV3czogSVZpZXdEZXNjcmlwdG9yW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgdmlldyBvZiBlKSB7XG5cdFx0XHRcdGlmICh2aWV3LnZpZXdDb250YWluZXIuaWQgPT09IFZJRVdMRVRfSUQpIHtcblx0XHRcdFx0XHRyZW1vdGVWaWV3cy5wdXNoKC4uLnZpZXcudmlld3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVtb3RlVmlld3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLnJlbW90ZVN3aXRjaGVyIS5jcmVhdGVPcHRpb25JdGVtcyhyZW1vdGVWaWV3cyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHZpZXdzUmVnaXN0cnkub25WaWV3c0RlcmVnaXN0ZXJlZChlID0+IHtcblx0XHRcdGlmIChlLnZpZXdDb250YWluZXIuaWQgPT09IFZJRVdMRVRfSUQpIHtcblx0XHRcdFx0dGhpcy5yZW1vdGVTd2l0Y2hlciEucmVtb3ZlT3B0aW9uSXRlbXMoZS52aWV3cyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SGVscEluZm9ybWF0aW9uKGV4dGVuc2lvbnM6IHJlYWRvbmx5IElFeHRlbnNpb25Qb2ludFVzZXI8SGVscEluZm9ybWF0aW9uPltdKSB7XG5cdFx0Y29uc3QgaGVscEluZm9ybWF0aW9uOiBIZWxwSW5mb3JtYXRpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdHRoaXMuX2hhbmRsZVJlbW90ZUluZm9FeHRlbnNpb25Qb2ludChleHRlbnNpb24sIGhlbHBJbmZvcm1hdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5oZWxwSW5mb3JtYXRpb24gPSBoZWxwSW5mb3JtYXRpb247XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWxwSW5mb3JtYXRpb24uZmlyZSgpO1xuXG5cdFx0Y29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXHRcdGlmICh0aGlzLmhlbHBJbmZvcm1hdGlvbi5sZW5ndGggJiYgIXRoaXMuaGFzUmVnaXN0ZXJlZEhlbHBWaWV3KSB7XG5cdFx0XHRjb25zdCB2aWV3ID0gdmlld3NSZWdpc3RyeS5nZXRWaWV3KHRoaXMuaGVscFBhbmVsRGVzY3JpcHRvci5pZCk7XG5cdFx0XHRpZiAoIXZpZXcpIHtcblx0XHRcdFx0dmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt0aGlzLmhlbHBQYW5lbERlc2NyaXB0b3JdLCB0aGlzLnZpZXdDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5oYXNSZWdpc3RlcmVkSGVscFZpZXcgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5oYXNSZWdpc3RlcmVkSGVscFZpZXcpIHtcblx0XHRcdHZpZXdzUmVnaXN0cnkuZGVyZWdpc3RlclZpZXdzKFt0aGlzLmhlbHBQYW5lbERlc2NyaXB0b3JdLCB0aGlzLnZpZXdDb250YWluZXIpO1xuXHRcdFx0dGhpcy5oYXNSZWdpc3RlcmVkSGVscFZpZXcgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSZW1vdGVJbmZvRXh0ZW5zaW9uUG9pbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uUG9pbnRVc2VyPEhlbHBJbmZvcm1hdGlvbj4sIGhlbHBJbmZvcm1hdGlvbjogSGVscEluZm9ybWF0aW9uW10pIHtcblx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2NvbnRyaWJSZW1vdGVIZWxwJykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWV4dGVuc2lvbi52YWx1ZS5kb2N1bWVudGF0aW9uICYmICFleHRlbnNpb24udmFsdWUuZ2V0U3RhcnRlZCAmJiAhZXh0ZW5zaW9uLnZhbHVlLmlzc3Vlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGhlbHBJbmZvcm1hdGlvbi5wdXNoKHtcblx0XHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBleHRlbnNpb24uZGVzY3JpcHRpb24sXG5cdFx0XHRnZXRTdGFydGVkOiBleHRlbnNpb24udmFsdWUuZ2V0U3RhcnRlZCxcblx0XHRcdGRvY3VtZW50YXRpb246IGV4dGVuc2lvbi52YWx1ZS5kb2N1bWVudGF0aW9uLFxuXHRcdFx0cmVwb3J0SXNzdWU6IGV4dGVuc2lvbi52YWx1ZS5yZXBvcnRJc3N1ZSxcblx0XHRcdGlzc3VlczogZXh0ZW5zaW9uLnZhbHVlLmlzc3Vlcyxcblx0XHRcdHJlbW90ZU5hbWU6IGV4dGVuc2lvbi52YWx1ZS5yZW1vdGVOYW1lLFxuXHRcdFx0dmlydHVhbFdvcmtzcGFjZTogZXh0ZW5zaW9uLnZhbHVlLnZpcnR1YWxXb3Jrc3BhY2Vcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRGaWx0ZXJPbih2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gaXNTdHJpbmdBcnJheSh2aWV3RGVzY3JpcHRvci5yZW1vdGVBdXRob3JpdHkpID8gdmlld0Rlc2NyaXB0b3IucmVtb3RlQXV0aG9yaXR5WzBdIDogdmlld0Rlc2NyaXB0b3IucmVtb3RlQXV0aG9yaXR5O1xuXHR9XG5cblx0cHJvdGVjdGVkIHNldEZpbHRlcih2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yKTogdm9pZCB7XG5cdFx0dGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudGFyZ2V0VHlwZSA9IGlzU3RyaW5nQXJyYXkodmlld0Rlc2NyaXB0b3IucmVtb3RlQXV0aG9yaXR5KSA/IHZpZXdEZXNjcmlwdG9yLnJlbW90ZUF1dGhvcml0eSA6IFt2aWV3RGVzY3JpcHRvci5yZW1vdGVBdXRob3JpdHkhXTtcblx0fVxuXG5cdGdldFRpdGxlKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdGl0bGUgPSBubHMubG9jYWxpemUoJ3JlbW90ZS5leHBsb3JlcicsIFwiUmVtb3RlIEV4cGxvcmVyXCIpO1xuXHRcdHJldHVybiB0aXRsZTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3Q29udGFpbmVyc1JlZ2lzdHJ5KS5yZWdpc3RlclZpZXdDb250YWluZXIoXG5cdHtcblx0XHRpZDogVklFV0xFVF9JRCxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigncmVtb3RlLmV4cGxvcmVyJywgXCJSZW1vdGUgRXhwbG9yZXJcIiksXG5cdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihSZW1vdGVWaWV3UGFuZUNvbnRhaW5lciksXG5cdFx0aGlkZUlmRW1wdHk6IHRydWUsXG5cdFx0dmlld09yZGVyRGVsZWdhdGU6IHtcblx0XHRcdGdldE9yZGVyOiAoZ3JvdXA/OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCBtYXRjaGVzID0gL150YXJnZXRzQChcXGQrKSQvLmV4ZWMoZ3JvdXApO1xuXHRcdFx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0XHRcdHJldHVybiAtMTAwMDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1hdGNoZXMgPSAvXmRldGFpbHMoQChcXGQrKSk/JC8uZXhlYyhncm91cCk7XG5cblx0XHRcdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTUwMCArIE51bWJlcihtYXRjaGVzWzJdKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1hdGNoZXMgPSAvXmhlbHAoQChcXGQrKSk/JC8uZXhlYyhncm91cCk7XG5cdFx0XHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xMDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGljb246IGljb25zLnJlbW90ZUV4cGxvcmVyVmlld0ljb24sXG5cdFx0b3JkZXI6IDRcblx0fSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXG5leHBvcnQgY2xhc3MgUmVtb3RlTWFya2VycyBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVRpbWVyU2VydmljZSB0aW1lclNlcnZpY2U6IElUaW1lclNlcnZpY2UsXG5cdCkge1xuXHRcdHJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpLnRoZW4ocmVtb3RlRW52ID0+IHtcblx0XHRcdGlmIChyZW1vdGVFbnYpIHtcblx0XHRcdFx0dGltZXJTZXJ2aWNlLnNldFBlcmZvcm1hbmNlTWFya3MoJ3NlcnZlcicsIHJlbW90ZUVudi5tYXJrcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgVmlzaWJsZVByb2dyZXNzIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb247XG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX2xhc3RSZXBvcnQ6IHN0cmluZyB8IG51bGw7XG5cdHByaXZhdGUgX2N1cnJlbnRQcm9ncmVzc1Byb21pc2VSZXNvbHZlOiAoKCkgPT4gdm9pZCkgfCBudWxsO1xuXHRwcml2YXRlIF9jdXJyZW50UHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiB8IG51bGw7XG5cdHByaXZhdGUgX2N1cnJlbnRUaW1lcjogUmVjb25uZWN0aW9uVGltZXIgfCBudWxsO1xuXG5cdHB1YmxpYyBnZXQgbGFzdFJlcG9ydCgpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdFJlcG9ydDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSwgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24sIGluaXRpYWxSZXBvcnQ6IHN0cmluZyB8IG51bGwsIGJ1dHRvbnM6IHN0cmluZ1tdLCBvbkRpZENhbmNlbDogKGNob2ljZTogbnVtYmVyIHwgdW5kZWZpbmVkLCBsYXN0UmVwb3J0OiBzdHJpbmcgfCBudWxsKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy5sb2NhdGlvbiA9IGxvY2F0aW9uO1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9sYXN0UmVwb3J0ID0gaW5pdGlhbFJlcG9ydDtcblx0XHR0aGlzLl9jdXJyZW50UHJvZ3Jlc3NQcm9taXNlUmVzb2x2ZSA9IG51bGw7XG5cdFx0dGhpcy5fY3VycmVudFByb2dyZXNzID0gbnVsbDtcblx0XHR0aGlzLl9jdXJyZW50VGltZXIgPSBudWxsO1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB0aGlzLl9jdXJyZW50UHJvZ3Jlc3NQcm9taXNlUmVzb2x2ZSA9IHJlc29sdmUpO1xuXG5cdFx0cHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhcblx0XHRcdHsgbG9jYXRpb246IGxvY2F0aW9uLCBidXR0b25zOiBidXR0b25zIH0sXG5cdFx0XHQocHJvZ3Jlc3MpID0+IHsgaWYgKCF0aGlzLl9pc0Rpc3Bvc2VkKSB7IHRoaXMuX2N1cnJlbnRQcm9ncmVzcyA9IHByb2dyZXNzOyB9IHJldHVybiBwcm9taXNlOyB9LFxuXHRcdFx0KGNob2ljZSkgPT4gb25EaWRDYW5jZWwoY2hvaWNlLCB0aGlzLl9sYXN0UmVwb3J0KVxuXHRcdCk7XG5cblx0XHRpZiAodGhpcy5fbGFzdFJlcG9ydCkge1xuXHRcdFx0dGhpcy5yZXBvcnQoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRpZiAodGhpcy5fY3VycmVudFByb2dyZXNzUHJvbWlzZVJlc29sdmUpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRQcm9ncmVzc1Byb21pc2VSZXNvbHZlKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50UHJvZ3Jlc3NQcm9taXNlUmVzb2x2ZSA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRQcm9ncmVzcyA9IG51bGw7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRUaW1lcikge1xuXHRcdFx0dGhpcy5fY3VycmVudFRpbWVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRUaW1lciA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlcG9ydChtZXNzYWdlPzogc3RyaW5nKSB7XG5cdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdHRoaXMuX2xhc3RSZXBvcnQgPSBtZXNzYWdlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9sYXN0UmVwb3J0ICYmIHRoaXMuX2N1cnJlbnRQcm9ncmVzcykge1xuXHRcdFx0dGhpcy5fY3VycmVudFByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IHRoaXMuX2xhc3RSZXBvcnQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN0YXJ0VGltZXIoY29tcGxldGlvblRpbWU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuc3RvcFRpbWVyKCk7XG5cdFx0dGhpcy5fY3VycmVudFRpbWVyID0gbmV3IFJlY29ubmVjdGlvblRpbWVyKHRoaXMsIGNvbXBsZXRpb25UaW1lKTtcblx0fVxuXG5cdHB1YmxpYyBzdG9wVGltZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRUaW1lcikge1xuXHRcdFx0dGhpcy5fY3VycmVudFRpbWVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRUaW1lciA9IG51bGw7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFJlY29ubmVjdGlvblRpbWVyIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wYXJlbnQ6IFZpc2libGVQcm9ncmVzcztcblx0cHJpdmF0ZSByZWFkb25seSBfY29tcGxldGlvblRpbWU6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVySW50ZXJ2YWw6IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKHBhcmVudDogVmlzaWJsZVByb2dyZXNzLCBjb21wbGV0aW9uVGltZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5fcGFyZW50ID0gcGFyZW50O1xuXHRcdHRoaXMuX2NvbXBsZXRpb25UaW1lID0gY29tcGxldGlvblRpbWU7XG5cdFx0dGhpcy5fcmVuZGVySW50ZXJ2YWwgPSBkb20uZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKG1haW5XaW5kb3csICgpID0+IHRoaXMuX3JlbmRlcigpLCAxMDAwKTtcblx0XHR0aGlzLl9yZW5kZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlckludGVydmFsLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlcigpIHtcblx0XHRjb25zdCByZW1haW5pbmdUaW1lTXMgPSB0aGlzLl9jb21wbGV0aW9uVGltZSAtIERhdGUubm93KCk7XG5cdFx0aWYgKHJlbWFpbmluZ1RpbWVNcyA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVtYWluaW5nVGltZSA9IE1hdGguY2VpbChyZW1haW5pbmdUaW1lTXMgLyAxMDAwKTtcblx0XHRpZiAocmVtYWluaW5nVGltZSA9PT0gMSkge1xuXHRcdFx0dGhpcy5fcGFyZW50LnJlcG9ydChubHMubG9jYWxpemUoJ3JlY29ubmVjdGlvbldhaXRPbmUnLCBcIkF0dGVtcHRpbmcgdG8gcmVjb25uZWN0IGluIHswfSBzZWNvbmQuLi5cIiwgcmVtYWluaW5nVGltZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wYXJlbnQucmVwb3J0KG5scy5sb2NhbGl6ZSgncmVjb25uZWN0aW9uV2FpdE1hbnknLCBcIkF0dGVtcHRpbmcgdG8gcmVjb25uZWN0IGluIHswfSBzZWNvbmRzLi4uXCIsIHJlbWFpbmluZ1RpbWUpKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBUaGUgdGltZSB3aGVuIGEgcHJvbXB0IGlzIHNob3duIHRvIHRoZSB1c2VyXG4gKi9cbmNvbnN0IERJU0NPTk5FQ1RfUFJPTVBUX1RJTUUgPSA0MCAqIDEwMDA7IC8vIDQwIHNlY29uZHNcblxuZXhwb3J0IGNsYXNzIFJlbW90ZUFnZW50Q29ubmVjdGlvblN0YXR1c0xpc3RlbmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgX3JlbG9hZFdpbmRvd1Nob3duOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSByZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpO1xuXHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRsZXQgcXVpY2tJbnB1dFZpc2libGUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHF1aWNrSW5wdXRTZXJ2aWNlLm9uU2hvdygoKSA9PiBxdWlja0lucHV0VmlzaWJsZSA9IHRydWUpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHF1aWNrSW5wdXRTZXJ2aWNlLm9uSGlkZSgoKSA9PiBxdWlja0lucHV0VmlzaWJsZSA9IGZhbHNlKSk7XG5cblx0XHRcdGxldCB2aXNpYmxlUHJvZ3Jlc3M6IFZpc2libGVQcm9ncmVzcyB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IHJlY29ubmVjdFdhaXRFdmVudDogUmVjb25uZWN0aW9uV2FpdEV2ZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0XHRcdGZ1bmN0aW9uIHNob3dQcm9ncmVzcyhsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5EaWFsb2cgfCBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbiB8IG51bGwsIGJ1dHRvbnM6IHsgbGFiZWw6IHN0cmluZzsgY2FsbGJhY2s6ICgpID0+IHZvaWQgfVtdLCBpbml0aWFsUmVwb3J0OiBzdHJpbmcgfCBudWxsID0gbnVsbCk6IFZpc2libGVQcm9ncmVzcyB7XG5cdFx0XHRcdGlmICh2aXNpYmxlUHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHR2aXNpYmxlUHJvZ3Jlc3MuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcyA9IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWxvY2F0aW9uKSB7XG5cdFx0XHRcdFx0bG9jYXRpb24gPSBxdWlja0lucHV0VmlzaWJsZSA/IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uIDogUHJvZ3Jlc3NMb2NhdGlvbi5EaWFsb2c7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gbmV3IFZpc2libGVQcm9ncmVzcyhcblx0XHRcdFx0XHRwcm9ncmVzc1NlcnZpY2UsIGxvY2F0aW9uLCBpbml0aWFsUmVwb3J0LCBidXR0b25zLm1hcChidXR0b24gPT4gYnV0dG9uLmxhYmVsKSxcblx0XHRcdFx0XHQoY2hvaWNlLCBsYXN0UmVwb3J0KSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBIYW5kbGUgY2hvaWNlIGZyb20gZGlhbG9nXG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIGNob2ljZSAhPT0gJ3VuZGVmaW5lZCcgJiYgYnV0dG9uc1tjaG9pY2VdKSB7XG5cdFx0XHRcdFx0XHRcdGJ1dHRvbnNbY2hvaWNlXS5jYWxsYmFjaygpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0aWYgKGxvY2F0aW9uID09PSBQcm9ncmVzc0xvY2F0aW9uLkRpYWxvZykge1xuXHRcdFx0XHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcyA9IHNob3dQcm9ncmVzcyhQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbiwgYnV0dG9ucywgbGFzdFJlcG9ydCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0aGlkZVByb2dyZXNzKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdGZ1bmN0aW9uIGhpZGVQcm9ncmVzcygpIHtcblx0XHRcdFx0aWYgKHZpc2libGVQcm9ncmVzcykge1xuXHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dmlzaWJsZVByb2dyZXNzID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcmVjb25uZWN0aW9uVG9rZW46IHN0cmluZyA9ICcnO1xuXHRcdFx0bGV0IGxhc3RJbmNvbWluZ0RhdGFUaW1lOiBudW1iZXIgPSAwO1xuXHRcdFx0bGV0IHJlY29ubmVjdGlvbkF0dGVtcHRzOiBudW1iZXIgPSAwO1xuXG5cdFx0XHRjb25zdCByZWNvbm5lY3RCdXR0b24gPSB7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlY29ubmVjdE5vdycsIFwiUmVjb25uZWN0IE5vd1wiKSxcblx0XHRcdFx0Y2FsbGJhY2s6ICgpID0+IHtcblx0XHRcdFx0XHRyZWNvbm5lY3RXYWl0RXZlbnQ/LnNraXBXYWl0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlbG9hZEJ1dHRvbiA9IHtcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVsb2FkV2luZG93JywgXCJSZWxvYWQgV2luZG93XCIpLFxuXHRcdFx0XHRjYWxsYmFjazogKCkgPT4ge1xuXG5cdFx0XHRcdFx0dHlwZSBSZWNvbm5lY3RSZWxvYWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdG93bmVyOiAnYWxleGRpbWEnO1xuXHRcdFx0XHRcdFx0Y29tbWVudDogJ1RoZSByZWxvYWQgYnV0dG9uIGluIHRoZSBidWlsdGluIHBlcm1hbmVudCByZWNvbm5lY3Rpb24gZmFpbHVyZSBkaWFsb2cgd2FzIHByZXNzZWQnO1xuXHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSByZXNvbHZlci4nIH07XG5cdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBjb25uZWN0aW9uLicgfTtcblx0XHRcdFx0XHRcdG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0VsYXBzZWQgdGltZSAoaW4gbXMpIHNpbmNlIGRhdGEgd2FzIGxhc3QgcmVjZWl2ZWQuJyB9O1xuXHRcdFx0XHRcdFx0YXR0ZW1wdDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSByZWNvbm5lY3Rpb24gYXR0ZW1wdCBjb3VudGVyLicgfTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHR5cGUgUmVjb25uZWN0UmVsb2FkRXZlbnQgPSB7XG5cdFx0XHRcdFx0XHRyZW1vdGVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nO1xuXHRcdFx0XHRcdFx0bWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXI7XG5cdFx0XHRcdFx0XHRhdHRlbXB0OiBudW1iZXI7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmVjb25uZWN0UmVsb2FkRXZlbnQsIFJlY29ubmVjdFJlbG9hZENsYXNzaWZpY2F0aW9uPigncmVtb3RlUmVjb25uZWN0aW9uUmVsb2FkJywge1xuXHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogZ2V0UmVtb3RlTmFtZShlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSxcblx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuOiByZWNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0XHRcdG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogRGF0ZS5ub3coKSAtIGxhc3RJbmNvbWluZ0RhdGFUaW1lLFxuXHRcdFx0XHRcdFx0YXR0ZW1wdDogcmVjb25uZWN0aW9uQXR0ZW1wdHNcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFJlbG9hZFdpbmRvd0FjdGlvbi5JRCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdC8vIFBvc3NpYmxlIHN0YXRlIHRyYW5zaXRpb25zOlxuXHRcdFx0Ly8gQ29ubmVjdGlvbkdhaW4gICAgICAtPiBDb25uZWN0aW9uTG9zdFxuXHRcdFx0Ly8gQ29ubmVjdGlvbkxvc3QgICAgICAtPiBSZWNvbm5lY3Rpb25XYWl0LCBSZWNvbm5lY3Rpb25SdW5uaW5nXG5cdFx0XHQvLyBSZWNvbm5lY3Rpb25XYWl0ICAgIC0+IFJlY29ubmVjdGlvblJ1bm5pbmdcblx0XHRcdC8vIFJlY29ubmVjdGlvblJ1bm5pbmcgLT4gQ29ubmVjdGlvbkdhaW4sIFJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmVcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY29ubmVjdGlvbi5vbkRpZFN0YXRlQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRcdHZpc2libGVQcm9ncmVzcz8uc3RvcFRpbWVyKCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVMaXN0ZW5lci5jbGVhcigpO1xuXG5cdFx0XHRcdHN3aXRjaCAoZS50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5Db25uZWN0aW9uTG9zdDpcblx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuID0gZS5yZWNvbm5lY3Rpb25Ub2tlbjtcblx0XHRcdFx0XHRcdGxhc3RJbmNvbWluZ0RhdGFUaW1lID0gRGF0ZS5ub3coKSAtIGUubWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhO1xuXHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uQXR0ZW1wdHMgPSAwO1xuXG5cdFx0XHRcdFx0XHR0eXBlIFJlbW90ZUNvbm5lY3Rpb25Mb3N0Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRcdG93bmVyOiAnYWxleGRpbWEnO1xuXHRcdFx0XHRcdFx0XHRjb21tZW50OiAnVGhlIHJlbW90ZSBjb25uZWN0aW9uIHN0YXRlIGlzIG5vdyBgQ29ubmVjdGlvbkxvc3RgJztcblx0XHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSByZXNvbHZlci4nIH07XG5cdFx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGNvbm5lY3Rpb24uJyB9O1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHR5cGUgUmVtb3RlQ29ubmVjdGlvbkxvc3RFdmVudCA9IHtcblx0XHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nO1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSZW1vdGVDb25uZWN0aW9uTG9zdEV2ZW50LCBSZW1vdGVDb25uZWN0aW9uTG9zdENsYXNzaWZpY2F0aW9uPigncmVtb3RlQ29ubmVjdGlvbkxvc3QnLCB7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IGdldFJlbW90ZU5hbWUoZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSksXG5cdFx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuOiBlLnJlY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdGlmICh2aXNpYmxlUHJvZ3Jlc3MgfHwgZS5taWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEgPiBESVNDT05ORUNUX1BST01QVF9USU1FKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghdmlzaWJsZVByb2dyZXNzKSB7XG5cdFx0XHRcdFx0XHRcdFx0dmlzaWJsZVByb2dyZXNzID0gc2hvd1Byb2dyZXNzKG51bGwsIFtyZWNvbm5lY3RCdXR0b24sIHJlbG9hZEJ1dHRvbl0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcy5yZXBvcnQobmxzLmxvY2FsaXplKCdjb25uZWN0aW9uTG9zdCcsIFwiQ29ubmVjdGlvbiBMb3N0XCIpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0Y2FzZSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5SZWNvbm5lY3Rpb25XYWl0OlxuXHRcdFx0XHRcdFx0aWYgKHZpc2libGVQcm9ncmVzcykge1xuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3RXYWl0RXZlbnQgPSBlO1xuXHRcdFx0XHRcdFx0XHR2aXNpYmxlUHJvZ3Jlc3MgPSBzaG93UHJvZ3Jlc3MobnVsbCwgW3JlY29ubmVjdEJ1dHRvbiwgcmVsb2FkQnV0dG9uXSk7XG5cdFx0XHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcy5zdGFydFRpbWVyKERhdGUubm93KCkgKyAxMDAwICogZS5kdXJhdGlvblNlY29uZHMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0XHRjYXNlIFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLlJlY29ubmVjdGlvblJ1bm5pbmc6XG5cdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbiA9IGUucmVjb25uZWN0aW9uVG9rZW47XG5cdFx0XHRcdFx0XHRsYXN0SW5jb21pbmdEYXRhVGltZSA9IERhdGUubm93KCkgLSBlLm1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTtcblx0XHRcdFx0XHRcdHJlY29ubmVjdGlvbkF0dGVtcHRzID0gZS5hdHRlbXB0O1xuXG5cdFx0XHRcdFx0XHR0eXBlIFJlbW90ZVJlY29ubmVjdGlvblJ1bm5pbmdDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdFx0b3duZXI6ICdhbGV4ZGltYSc7XG5cdFx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdUaGUgcmVtb3RlIGNvbm5lY3Rpb24gc3RhdGUgaXMgbm93IGBSZWNvbm5lY3Rpb25SdW5uaW5nYCc7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgcmVzb2x2ZXIuJyB9O1xuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBjb25uZWN0aW9uLicgfTtcblx0XHRcdFx0XHRcdFx0bWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnRWxhcHNlZCB0aW1lIChpbiBtcykgc2luY2UgZGF0YSB3YXMgbGFzdCByZWNlaXZlZC4nIH07XG5cdFx0XHRcdFx0XHRcdGF0dGVtcHQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgcmVjb25uZWN0aW9uIGF0dGVtcHQgY291bnRlci4nIH07XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0dHlwZSBSZW1vdGVSZWNvbm5lY3Rpb25SdW5uaW5nRXZlbnQgPSB7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW46IHN0cmluZztcblx0XHRcdFx0XHRcdFx0bWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXI7XG5cdFx0XHRcdFx0XHRcdGF0dGVtcHQ6IG51bWJlcjtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmVtb3RlUmVjb25uZWN0aW9uUnVubmluZ0V2ZW50LCBSZW1vdGVSZWNvbm5lY3Rpb25SdW5uaW5nQ2xhc3NpZmljYXRpb24+KCdyZW1vdGVSZWNvbm5lY3Rpb25SdW5uaW5nJywge1xuXHRcdFx0XHRcdFx0XHRyZW1vdGVOYW1lOiBnZXRSZW1vdGVOYW1lKGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpLFxuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogZS5yZWNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0XHRcdFx0bWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBlLm1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSxcblx0XHRcdFx0XHRcdFx0YXR0ZW1wdDogZS5hdHRlbXB0XG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0aWYgKHZpc2libGVQcm9ncmVzcyB8fCBlLm1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSA+IERJU0NPTk5FQ1RfUFJPTVBUX1RJTUUpIHtcblx0XHRcdFx0XHRcdFx0dmlzaWJsZVByb2dyZXNzID0gc2hvd1Byb2dyZXNzKG51bGwsIFtyZWxvYWRCdXR0b25dKTtcblx0XHRcdFx0XHRcdFx0dmlzaWJsZVByb2dyZXNzLnJlcG9ydChubHMubG9jYWxpemUoJ3JlY29ubmVjdGlvblJ1bm5pbmcnLCBcIkRpc2Nvbm5lY3RlZC4gQXR0ZW1wdGluZyB0byByZWNvbm5lY3QuLi5cIikpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIFJlZ2lzdGVyIHRvIGxpc3RlbiBmb3IgcXVpY2sgaW5wdXQgaXMgb3BlbmVkXG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2FibGVMaXN0ZW5lci52YWx1ZSA9IHF1aWNrSW5wdXRTZXJ2aWNlLm9uU2hvdygoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gTmVlZCB0byBtb3ZlIGZyb20gZGlhbG9nIGlmIGJlaW5nIHNob3duIGFuZCB1c2VyIG5lZWRzIHRvIHR5cGUgaW4gYSBwcm9tcHRcblx0XHRcdFx0XHRcdFx0XHRpZiAodmlzaWJsZVByb2dyZXNzICYmIHZpc2libGVQcm9ncmVzcy5sb2NhdGlvbiA9PT0gUHJvZ3Jlc3NMb2NhdGlvbi5EaWFsb2cpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcyA9IHNob3dQcm9ncmVzcyhQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbiwgW3JlbG9hZEJ1dHRvbl0sIHZpc2libGVQcm9ncmVzcy5sYXN0UmVwb3J0KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGNhc2UgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZTpcblx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuID0gZS5yZWNvbm5lY3Rpb25Ub2tlbjtcblx0XHRcdFx0XHRcdGxhc3RJbmNvbWluZ0RhdGFUaW1lID0gRGF0ZS5ub3coKSAtIGUubWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhO1xuXHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uQXR0ZW1wdHMgPSBlLmF0dGVtcHQ7XG5cblx0XHRcdFx0XHRcdHR5cGUgUmVtb3RlUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZUNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdFx0XHRvd25lcjogJ2FsZXhkaW1hJztcblx0XHRcdFx0XHRcdFx0Y29tbWVudDogJ1RoZSByZW1vdGUgY29ubmVjdGlvbiBzdGF0ZSBpcyBub3cgYFJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmVgJztcblx0XHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSByZXNvbHZlci4nIH07XG5cdFx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGNvbm5lY3Rpb24uJyB9O1xuXHRcdFx0XHRcdFx0XHRtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdFbGFwc2VkIHRpbWUgKGluIG1zKSBzaW5jZSBkYXRhIHdhcyBsYXN0IHJlY2VpdmVkLicgfTtcblx0XHRcdFx0XHRcdFx0YXR0ZW1wdDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSByZWNvbm5lY3Rpb24gYXR0ZW1wdCBjb3VudGVyLicgfTtcblx0XHRcdFx0XHRcdFx0aGFuZGxlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBlcnJvciB3YXMgaGFuZGxlZCBieSB0aGUgcmVzb2x2ZXIuJyB9O1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHR5cGUgUmVtb3RlUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZUV2ZW50ID0ge1xuXHRcdFx0XHRcdFx0XHRyZW1vdGVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRcdG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogbnVtYmVyO1xuXHRcdFx0XHRcdFx0XHRhdHRlbXB0OiBudW1iZXI7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZWQ6IGJvb2xlYW47XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJlbW90ZVJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmVFdmVudCwgUmVtb3RlUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZUNsYXNzaWZpY2F0aW9uPigncmVtb3RlUmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZScsIHtcblx0XHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogZ2V0UmVtb3RlTmFtZShlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSxcblx0XHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW46IGUucmVjb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdFx0XHRcdG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogZS5taWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEsXG5cdFx0XHRcdFx0XHRcdGF0dGVtcHQ6IGUuYXR0ZW1wdCxcblx0XHRcdFx0XHRcdFx0aGFuZGxlZDogZS5oYW5kbGVkXG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0aGlkZVByb2dyZXNzKCk7XG5cblx0XHRcdFx0XHRcdGlmIChlLmhhbmRsZWQpIHtcblx0XHRcdFx0XHRcdFx0bG9nU2VydmljZS5pbmZvKGBFcnJvciBoYW5kbGVkOiBOb3Qgc2hvd2luZyBhIG5vdGlmaWNhdGlvbiBmb3IgdGhlIGVycm9yLmApO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICghdGhpcy5fcmVsb2FkV2luZG93U2hvd24pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcmVsb2FkV2luZG93U2hvd24gPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgncmVjb25uZWN0aW9uUGVybWFuZW50RmFpbHVyZScsIFwiQ2Fubm90IHJlY29ubmVjdC4gUGxlYXNlIHJlbG9hZCB0aGUgd2luZG93LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBubHMubG9jYWxpemUoeyBrZXk6ICdyZWxvYWRXaW5kb3cuZGlhbG9nJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmVsb2FkIFdpbmRvd1wiKVxuXHRcdFx0XHRcdFx0XHR9KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFJlbG9hZFdpbmRvd0FjdGlvbi5JRCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0Y2FzZSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5Db25uZWN0aW9uR2Fpbjpcblx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuID0gZS5yZWNvbm5lY3Rpb25Ub2tlbjtcblx0XHRcdFx0XHRcdGxhc3RJbmNvbWluZ0RhdGFUaW1lID0gRGF0ZS5ub3coKSAtIGUubWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhO1xuXHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uQXR0ZW1wdHMgPSBlLmF0dGVtcHQ7XG5cblx0XHRcdFx0XHRcdHR5cGUgUmVtb3RlQ29ubmVjdGlvbkdhaW5DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdFx0b3duZXI6ICdhbGV4ZGltYSc7XG5cdFx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdUaGUgcmVtb3RlIGNvbm5lY3Rpb24gc3RhdGUgaXMgbm93IGBDb25uZWN0aW9uR2FpbmAnO1xuXHRcdFx0XHRcdFx0XHRyZW1vdGVOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIHJlc29sdmVyLicgfTtcblx0XHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW46IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgY29ubmVjdGlvbi4nIH07XG5cdFx0XHRcdFx0XHRcdG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0VsYXBzZWQgdGltZSAoaW4gbXMpIHNpbmNlIGRhdGEgd2FzIGxhc3QgcmVjZWl2ZWQuJyB9O1xuXHRcdFx0XHRcdFx0XHRhdHRlbXB0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHJlY29ubmVjdGlvbiBhdHRlbXB0IGNvdW50ZXIuJyB9O1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHR5cGUgUmVtb3RlQ29ubmVjdGlvbkdhaW5FdmVudCA9IHtcblx0XHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nO1xuXHRcdFx0XHRcdFx0XHRtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IG51bWJlcjtcblx0XHRcdFx0XHRcdFx0YXR0ZW1wdDogbnVtYmVyO1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSZW1vdGVDb25uZWN0aW9uR2FpbkV2ZW50LCBSZW1vdGVDb25uZWN0aW9uR2FpbkNsYXNzaWZpY2F0aW9uPigncmVtb3RlQ29ubmVjdGlvbkdhaW4nLCB7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IGdldFJlbW90ZU5hbWUoZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSksXG5cdFx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuOiBlLnJlY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRcdFx0XHRtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IGUubWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhLFxuXHRcdFx0XHRcdFx0XHRhdHRlbXB0OiBlLmF0dGVtcHRcblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHRoaWRlUHJvZ3Jlc3MoKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQiw0QkFBNEI7QUFDeEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBMEMsWUFBWSx1QkFBZ0QsOEJBQThCO0FBQ3BJLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQW1DLGtCQUFrQix3QkFBd0I7QUFFN0UsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBZ0MscUNBQXFDO0FBQ3JFLE9BQU8sY0FBYztBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFlBQXlCLHlCQUF5QjtBQUMzRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUFxQjtBQUM5QixTQUEwQiw4QkFBOEI7QUFDeEQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxnQkFBa0M7QUFHM0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxPQUFPLGVBQWU7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
