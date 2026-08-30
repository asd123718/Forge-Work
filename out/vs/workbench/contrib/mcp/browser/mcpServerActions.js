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
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { disposeIfDisposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IAuthenticationService } from "../../../services/authentication/common/authentication.js";
import { IAuthenticationQueryService } from "../../../services/authentication/common/authenticationQuery.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { errorIcon, infoIcon, manageExtensionIcon, trustIcon, warningIcon } from "../../extensions/browser/extensionsIcons.js";
import { McpCommandIds } from "../common/mcpCommandIds.js";
import { IMcpRegistry } from "../common/mcpRegistryTypes.js";
import { IMcpSamplingService, IMcpService, IMcpWorkbenchService, McpCapability, McpConnectionState, McpServerEditorTab, McpServerInstallState } from "../common/mcpTypes.js";
import { startServerByFilter } from "../common/mcpTypesUtils.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { Schemas } from "../../../../base/common/network.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { LocalMcpServerScope } from "../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { ActionWithDropdownActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import Severity from "../../../../base/common/severity.js";
import { ContributionEnablementState, isContributionDisabled, isContributionEnabled } from "../../chat/common/enablement.js";
import { getWorkbenchMenuMotionContextMenuOptions } from "../../../browser/actions/menuMotion.js";
const _McpServerAction = class _McpServerAction extends Action {
  constructor() {
    super(...arguments);
    this._onDidChange = this._register(new Emitter());
    this._hidden = false;
    this.hideOnDisabled = true;
    this._mcpServer = null;
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get hidden() {
    return this._hidden;
  }
  set hidden(hidden) {
    if (this._hidden !== hidden) {
      this._hidden = hidden;
      this._onDidChange.fire({ hidden });
    }
  }
  _setEnabled(value) {
    super._setEnabled(value);
    if (this.hideOnDisabled) {
      this.hidden = !value;
    }
  }
  get mcpServer() {
    return this._mcpServer;
  }
  set mcpServer(mcpServer) {
    this._mcpServer = mcpServer;
    this.update();
  }
};
_McpServerAction.EXTENSION_ACTION_CLASS = "extension-action";
_McpServerAction.TEXT_ACTION_CLASS = `${_McpServerAction.EXTENSION_ACTION_CLASS} text`;
_McpServerAction.LABEL_ACTION_CLASS = `${_McpServerAction.EXTENSION_ACTION_CLASS} label`;
_McpServerAction.PROMINENT_LABEL_ACTION_CLASS = `${_McpServerAction.LABEL_ACTION_CLASS} prominent`;
_McpServerAction.ICON_ACTION_CLASS = `${_McpServerAction.EXTENSION_ACTION_CLASS} icon`;
let McpServerAction = _McpServerAction;
class ButtonWithDropDownExtensionAction extends McpServerAction {
  constructor(id, clazz, actionsGroups) {
    clazz = `${clazz} action-dropdown`;
    super(id, void 0, clazz);
    this.actionsGroups = actionsGroups;
    this.menuActionClassNames = [];
    this._menuActions = [];
    this.menuActionClassNames = clazz.split(" ");
    this.hideOnDisabled = false;
    this.actions = actionsGroups.flat();
    this.update();
    this._register(Event.any(...this.actions.map((a) => a.onDidChange))(() => this.update(true)));
    this.actions.forEach((a) => this._register(a));
  }
  get menuActions() {
    return [...this._menuActions];
  }
  get mcpServer() {
    return super.mcpServer;
  }
  set mcpServer(mcpServer) {
    this.actions.forEach((a) => a.mcpServer = mcpServer);
    super.mcpServer = mcpServer;
  }
  update(donotUpdateActions) {
    if (!donotUpdateActions) {
      this.actions.forEach((a) => a.update());
    }
    const actionsGroups = this.actionsGroups.map((actionsGroup) => actionsGroup.filter((a) => !a.hidden));
    let actions = [];
    for (const visibleActions of actionsGroups) {
      if (visibleActions.length) {
        actions = [...actions, ...visibleActions, new Separator()];
      }
    }
    actions = actions.length ? actions.slice(0, actions.length - 1) : actions;
    this.primaryAction = actions[0];
    this._menuActions = actions.length > 1 ? actions : [];
    this._onDidChange.fire({ menuActions: this._menuActions });
    if (this.primaryAction) {
      this.hidden = false;
      this.enabled = this.primaryAction.enabled;
      this.label = this.getLabel(this.primaryAction);
      this.tooltip = this.primaryAction.tooltip;
    } else {
      this.hidden = true;
      this.enabled = false;
    }
  }
  async run() {
    if (this.enabled) {
      await this.primaryAction?.run();
    }
  }
  getLabel(action) {
    return action.label;
  }
}
class ButtonWithDropdownExtensionActionViewItem extends ActionWithDropdownActionViewItem {
  constructor(action, options, contextMenuProvider) {
    super(null, action, options, contextMenuProvider);
    this._register(action.onDidChange((e) => {
      if (e.hidden !== void 0 || e.menuActions !== void 0) {
        this.updateClass();
      }
    }));
  }
  render(container) {
    super.render(container);
    this.updateClass();
  }
  updateClass() {
    super.updateClass();
    if (this.element && this.dropdownMenuActionViewItem?.element) {
      this.element.classList.toggle("hide", this._action.hidden);
      const isMenuEmpty = this._action.menuActions.length === 0;
      this.element.classList.toggle("empty", isMenuEmpty);
      this.dropdownMenuActionViewItem.element.classList.toggle("hide", isMenuEmpty);
    }
  }
}
let DropDownAction = class extends McpServerAction {
  constructor(id, label, cssClass, enabled, instantiationService) {
    super(id, label, cssClass, enabled);
    this.instantiationService = instantiationService;
    this._actionViewItem = null;
  }
  createActionViewItem(options) {
    this._actionViewItem = this.instantiationService.createInstance(DropDownExtensionActionViewItem, this, options);
    return this._actionViewItem;
  }
  run(actionGroups) {
    this._actionViewItem?.showMenu(actionGroups);
    return Promise.resolve();
  }
};
DropDownAction = __decorateClass([
  __decorateParam(4, IInstantiationService)
], DropDownAction);
let DropDownExtensionActionViewItem = class extends ActionViewItem {
  constructor(action, options, contextMenuService) {
    super(null, action, { ...options, icon: true, label: true });
    this.contextMenuService = contextMenuService;
  }
  showMenu(menuActionGroups) {
    if (this.element) {
      const actions = this.getActions(menuActionGroups);
      this.contextMenuService.showContextMenu({
        ...getWorkbenchMenuMotionContextMenuOptions(this.element),
        getActions: () => actions,
        actionRunner: this.actionRunner,
        onHide: () => disposeIfDisposable(actions)
      });
    }
  }
  getActions(menuActionGroups) {
    let actions = [];
    for (const menuActions of menuActionGroups) {
      actions = [...actions, ...menuActions, new Separator()];
    }
    return actions.length ? actions.slice(0, actions.length - 1) : actions;
  }
};
DropDownExtensionActionViewItem = __decorateClass([
  __decorateParam(2, IContextMenuService)
], DropDownExtensionActionViewItem);
let InstallAction = class extends McpServerAction {
  constructor(open, mcpWorkbenchService, telemetryService, mcpService) {
    super("extensions.install", localize("install", "Install"), InstallAction.CLASS, false);
    this.open = open;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.telemetryService = telemetryService;
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = InstallAction.HIDE;
    if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
      return;
    }
    if (this.mcpServer.installState !== McpServerInstallState.Uninstalled) {
      return;
    }
    this.class = InstallAction.CLASS;
    this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    if (this.open) {
      this.mcpWorkbenchService.open(this.mcpServer);
      alert(localize("mcpServerInstallation", "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
    }
    this.telemetryService.publicLog2("mcp:action:install", { name: this.mcpServer.gallery?.name });
    const installed = await this.mcpWorkbenchService.install(this.mcpServer);
    await startServerByFilter(this.mcpService, (s) => {
      return s.definition.label === installed.name;
    });
  }
};
InstallAction.CLASS = `${InstallAction.LABEL_ACTION_CLASS} prominent install`;
InstallAction.HIDE = `${InstallAction.CLASS} hide`;
InstallAction = __decorateClass([
  __decorateParam(1, IMcpWorkbenchService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IMcpService)
], InstallAction);
let InstallInWorkspaceAction = class extends McpServerAction {
  constructor(open, mcpWorkbenchService, workspaceService, quickInputService, telemetryService, mcpService) {
    super("extensions.installWorkspace", localize("installInWorkspace", "Install in Workspace"), InstallAction.CLASS, false);
    this.open = open;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.workspaceService = workspaceService;
    this.quickInputService = quickInputService;
    this.telemetryService = telemetryService;
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = InstallInWorkspaceAction.HIDE;
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
      return;
    }
    if (this.mcpServer.installState !== McpServerInstallState.Uninstalled && this.mcpServer.local?.scope === LocalMcpServerScope.Workspace) {
      return;
    }
    this.class = InstallAction.CLASS;
    this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    if (this.open) {
      this.mcpWorkbenchService.open(this.mcpServer, { preserveFocus: true });
      alert(localize("mcpServerInstallation", "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
    }
    const target = await this.getConfigurationTarget();
    if (!target) {
      return;
    }
    this.telemetryService.publicLog2("mcp:action:install:workspace", { name: this.mcpServer.gallery?.name });
    const installed = await this.mcpWorkbenchService.install(this.mcpServer, { target });
    await startServerByFilter(this.mcpService, (s) => {
      return s.definition.label === installed.name;
    });
  }
  async getConfigurationTarget() {
    const options = [];
    for (const folder of this.workspaceService.getWorkspace().folders) {
      options.push({ target: folder, label: folder.name, description: localize("install in workspace folder", "Workspace Folder") });
    }
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      if (options.length > 0) {
        options.push({ type: "separator" });
      }
      options.push({ target: ConfigurationTarget.WORKSPACE, label: localize("mcp.target.workspace", "Workspace") });
    }
    if (options.length === 1) {
      return options[0].target;
    }
    const targetPick = await this.quickInputService.pick(options, {
      title: localize("mcp.target.title", "Choose where to install the MCP server")
    });
    return targetPick?.target;
  }
};
InstallInWorkspaceAction.CLASS = `${InstallInWorkspaceAction.LABEL_ACTION_CLASS} prominent install`;
InstallInWorkspaceAction.HIDE = `${InstallInWorkspaceAction.CLASS} hide`;
InstallInWorkspaceAction = __decorateClass([
  __decorateParam(1, IMcpWorkbenchService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IMcpService)
], InstallInWorkspaceAction);
let InstallInRemoteAction = class extends McpServerAction {
  constructor(open, mcpWorkbenchService, environmentService, telemetryService, labelService, mcpService) {
    super("extensions.installRemote", localize("installInRemote", "Install (Remote)"), InstallAction.CLASS, false);
    this.open = open;
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.environmentService = environmentService;
    this.telemetryService = telemetryService;
    this.labelService = labelService;
    this.mcpService = mcpService;
    const remoteLabel = this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority);
    this.label = localize("installInRemoteLabel", "Install in {0}", remoteLabel);
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = InstallInRemoteAction.HIDE;
    if (!this.environmentService.remoteAuthority) {
      return;
    }
    if (!this.mcpServer?.gallery && !this.mcpServer?.installable) {
      return;
    }
    if (this.mcpServer.installState !== McpServerInstallState.Uninstalled) {
      if (this.mcpServer.local?.scope === LocalMcpServerScope.RemoteUser) {
        return;
      }
      if (this.mcpWorkbenchService.local.find((mcpServer) => mcpServer.name === this.mcpServer?.name && mcpServer.local?.scope === LocalMcpServerScope.RemoteUser)) {
        return;
      }
    }
    this.class = InstallAction.CLASS;
    this.enabled = this.mcpWorkbenchService.canInstall(this.mcpServer) === true;
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    if (this.open) {
      this.mcpWorkbenchService.open(this.mcpServer);
      alert(localize("mcpServerInstallation", "Installing MCP Server {0} started. An editor is now open with more details on this MCP Server", this.mcpServer.label));
    }
    this.telemetryService.publicLog2("mcp:action:install:remote", { name: this.mcpServer.gallery?.name });
    const installed = await this.mcpWorkbenchService.install(this.mcpServer, { target: ConfigurationTarget.USER_REMOTE });
    await startServerByFilter(this.mcpService, (s) => {
      return s.definition.label === installed.name;
    });
  }
};
InstallInRemoteAction.CLASS = `${InstallInRemoteAction.LABEL_ACTION_CLASS} prominent install`;
InstallInRemoteAction.HIDE = `${InstallInRemoteAction.CLASS} hide`;
InstallInRemoteAction = __decorateClass([
  __decorateParam(1, IMcpWorkbenchService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IMcpService)
], InstallInRemoteAction);
const _InstallingLabelAction = class _InstallingLabelAction extends McpServerAction {
  constructor() {
    super("extension.installing", _InstallingLabelAction.LABEL, _InstallingLabelAction.CLASS, false);
  }
  update() {
    this.class = `${_InstallingLabelAction.CLASS}${this.mcpServer && this.mcpServer.installState === McpServerInstallState.Installing ? "" : " hide"}`;
  }
};
_InstallingLabelAction.LABEL = localize("installing", "Installing");
_InstallingLabelAction.CLASS = `${McpServerAction.LABEL_ACTION_CLASS} install installing`;
let InstallingLabelAction = _InstallingLabelAction;
let UninstallAction = class extends McpServerAction {
  constructor(mcpWorkbenchService) {
    super("extensions.uninstall", localize("uninstall", "Uninstall"), UninstallAction.CLASS, false);
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = UninstallAction.HIDE;
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    if (this.mcpServer.installState !== McpServerInstallState.Installed) {
      this.enabled = false;
      return;
    }
    this.class = UninstallAction.CLASS;
    this.enabled = true;
    this.label = localize("uninstall", "Uninstall");
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    await this.mcpWorkbenchService.uninstall(this.mcpServer);
  }
};
UninstallAction.CLASS = `${UninstallAction.LABEL_ACTION_CLASS} prominent uninstall`;
UninstallAction.HIDE = `${UninstallAction.CLASS} hide`;
UninstallAction = __decorateClass([
  __decorateParam(0, IMcpWorkbenchService)
], UninstallAction);
let EnableMcpServerGloballyAction = class extends McpServerAction {
  constructor(mcpService) {
    super(EnableMcpServerGloballyAction.ID, localize("enableGlobally", "Enable"), McpServerAction.LABEL_ACTION_CLASS);
    this.mcpService = mcpService;
    this.tooltip = localize("enableGloballyTooltip", "Enable this MCP server");
    this.update();
  }
  update() {
    this.enabled = false;
    if (!this.mcpServer?.local) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
    if (!server) {
      return;
    }
    const enablement = server.enablement.get();
    this.enabled = isContributionDisabled(enablement);
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    this.mcpService.enablementModel.setEnabled(this.mcpServer.id, ContributionEnablementState.EnabledProfile);
  }
};
EnableMcpServerGloballyAction.ID = "mcpServer.enableGlobally";
EnableMcpServerGloballyAction = __decorateClass([
  __decorateParam(0, IMcpService)
], EnableMcpServerGloballyAction);
let EnableMcpServerForWorkspaceAction = class extends McpServerAction {
  constructor(mcpService, workspaceService) {
    super(EnableMcpServerForWorkspaceAction.ID, localize("enableForWorkspace", "Enable (Workspace)"), McpServerAction.LABEL_ACTION_CLASS);
    this.mcpService = mcpService;
    this.workspaceService = workspaceService;
    this.tooltip = localize("enableForWorkspaceTooltip", "Enable this MCP server only in this workspace");
    this.update();
  }
  update() {
    this.enabled = false;
    if (!this.mcpServer?.local) {
      return;
    }
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
    if (!server) {
      return;
    }
    const enablement = server.enablement.get();
    this.enabled = isContributionDisabled(enablement);
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    this.mcpService.enablementModel.setEnabled(this.mcpServer.id, ContributionEnablementState.EnabledWorkspace);
  }
};
EnableMcpServerForWorkspaceAction.ID = "mcpServer.enableForWorkspace";
EnableMcpServerForWorkspaceAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IWorkspaceContextService)
], EnableMcpServerForWorkspaceAction);
let DisableMcpServerGloballyAction = class extends McpServerAction {
  constructor(mcpService) {
    super(DisableMcpServerGloballyAction.ID, localize("disableGlobally", "Disable"), McpServerAction.LABEL_ACTION_CLASS);
    this.mcpService = mcpService;
    this.tooltip = localize("disableGloballyTooltip", "Disable this MCP server");
    this.update();
  }
  update() {
    this.enabled = false;
    if (!this.mcpServer?.local) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
    if (!server) {
      return;
    }
    const enablement = server.enablement.get();
    this.enabled = isContributionEnabled(enablement);
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    this.mcpService.enablementModel.setEnabled(this.mcpServer.id, ContributionEnablementState.DisabledProfile);
  }
};
DisableMcpServerGloballyAction.ID = "mcpServer.disableGlobally";
DisableMcpServerGloballyAction = __decorateClass([
  __decorateParam(0, IMcpService)
], DisableMcpServerGloballyAction);
let DisableMcpServerForWorkspaceAction = class extends McpServerAction {
  constructor(mcpService, workspaceService) {
    super(DisableMcpServerForWorkspaceAction.ID, localize("disableForWorkspace", "Disable (Workspace)"), McpServerAction.LABEL_ACTION_CLASS);
    this.mcpService = mcpService;
    this.workspaceService = workspaceService;
    this.tooltip = localize("disableForWorkspaceTooltip", "Disable this MCP server only in this workspace");
    this.update();
  }
  update() {
    this.enabled = false;
    if (!this.mcpServer?.local) {
      return;
    }
    if (this.workspaceService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
    if (!server) {
      return;
    }
    const enablement = server.enablement.get();
    this.enabled = isContributionEnabled(enablement);
  }
  async run() {
    if (!this.mcpServer) {
      return;
    }
    this.mcpService.enablementModel.setEnabled(this.mcpServer.id, ContributionEnablementState.DisabledWorkspace);
  }
};
DisableMcpServerForWorkspaceAction.ID = "mcpServer.disableForWorkspace";
DisableMcpServerForWorkspaceAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IWorkspaceContextService)
], DisableMcpServerForWorkspaceAction);
let EnableMcpDropDownAction = class extends ButtonWithDropDownExtensionAction {
  constructor(instantiationService) {
    super("mcpServer.enable", McpServerAction.LABEL_ACTION_CLASS, [
      [
        instantiationService.createInstance(EnableMcpServerGloballyAction),
        instantiationService.createInstance(EnableMcpServerForWorkspaceAction)
      ]
    ]);
  }
};
EnableMcpDropDownAction = __decorateClass([
  __decorateParam(0, IInstantiationService)
], EnableMcpDropDownAction);
let DisableMcpDropDownAction = class extends ButtonWithDropDownExtensionAction {
  constructor(instantiationService) {
    super("mcpServer.disable", McpServerAction.LABEL_ACTION_CLASS, [
      [
        instantiationService.createInstance(DisableMcpServerGloballyAction),
        instantiationService.createInstance(DisableMcpServerForWorkspaceAction)
      ]
    ]);
  }
};
DisableMcpDropDownAction = __decorateClass([
  __decorateParam(0, IInstantiationService)
], DisableMcpDropDownAction);
function getContextMenuActions(mcpServer, isEditorAction, instantiationService) {
  return instantiationService.invokeFunction((accessor) => {
    const workspaceService = accessor.get(IWorkspaceContextService);
    const environmentService = accessor.get(IWorkbenchEnvironmentService);
    const groups = [];
    const isInstalled = mcpServer.installState === McpServerInstallState.Installed;
    if (isInstalled) {
      groups.push([
        instantiationService.createInstance(StartServerAction)
      ]);
      groups.push([
        instantiationService.createInstance(StopServerAction),
        instantiationService.createInstance(RestartServerAction)
      ]);
      groups.push([
        instantiationService.createInstance(EnableMcpServerGloballyAction),
        instantiationService.createInstance(EnableMcpServerForWorkspaceAction),
        instantiationService.createInstance(DisableMcpServerGloballyAction),
        instantiationService.createInstance(DisableMcpServerForWorkspaceAction)
      ]);
      groups.push([
        instantiationService.createInstance(AuthServerAction)
      ]);
      groups.push([
        instantiationService.createInstance(ShowServerOutputAction),
        instantiationService.createInstance(ShowServerConfigurationAction),
        instantiationService.createInstance(ShowServerJsonConfigurationAction)
      ]);
      groups.push([
        instantiationService.createInstance(ConfigureModelAccessAction),
        instantiationService.createInstance(ShowSamplingRequestsAction)
      ]);
      groups.push([
        instantiationService.createInstance(BrowseResourcesAction)
      ]);
      if (!isEditorAction) {
        const installGroup = [instantiationService.createInstance(UninstallAction)];
        if (workspaceService.getWorkbenchState() !== WorkbenchState.EMPTY) {
          installGroup.push(instantiationService.createInstance(InstallInWorkspaceAction, false));
        }
        if (environmentService.remoteAuthority && mcpServer.local?.scope !== LocalMcpServerScope.RemoteUser) {
          installGroup.push(instantiationService.createInstance(InstallInRemoteAction, false));
        }
        groups.push(installGroup);
      }
    } else {
      const installGroup = [];
      if (workspaceService.getWorkbenchState() !== WorkbenchState.EMPTY) {
        installGroup.push(instantiationService.createInstance(InstallInWorkspaceAction, !isEditorAction));
      }
      if (environmentService.remoteAuthority) {
        installGroup.push(instantiationService.createInstance(InstallInRemoteAction, !isEditorAction));
      }
      groups.push(installGroup);
    }
    groups.forEach((group) => group.forEach((extensionAction) => extensionAction.mcpServer = mcpServer));
    return groups;
  });
}
let ManageMcpServerAction = class extends DropDownAction {
  constructor(isEditorAction, instantiationService) {
    super(ManageMcpServerAction.ID, "", "", true, instantiationService);
    this.isEditorAction = isEditorAction;
    this.tooltip = localize("manage", "Manage");
    this.update();
  }
  async run() {
    return super.run(this.mcpServer ? getContextMenuActions(this.mcpServer, this.isEditorAction, this.instantiationService) : []);
  }
  update() {
    this.class = ManageMcpServerAction.HideManageExtensionClass;
    this.enabled = false;
    if (!this.mcpServer) {
      return;
    }
    if (this.isEditorAction) {
      this.enabled = true;
      this.class = ManageMcpServerAction.Class;
    } else {
      this.enabled = !!this.mcpServer.local;
      this.class = this.enabled ? ManageMcpServerAction.Class : ManageMcpServerAction.HideManageExtensionClass;
    }
  }
};
ManageMcpServerAction.ID = "mcpServer.manage";
ManageMcpServerAction.Class = `${McpServerAction.ICON_ACTION_CLASS} manage ` + ThemeIcon.asClassName(manageExtensionIcon);
ManageMcpServerAction.HideManageExtensionClass = `${ManageMcpServerAction.Class} hide`;
ManageMcpServerAction = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ManageMcpServerAction);
let StartServerAction = class extends McpServerAction {
  constructor(mcpService) {
    super("extensions.start", localize("start", "Start Server"), StartServerAction.CLASS, false);
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = StartServerAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const serverState = server.connectionState.get();
    if (!McpConnectionState.canBeStarted(serverState.state)) {
      return;
    }
    this.class = StartServerAction.CLASS;
    this.enabled = true;
    this.label = localize("start", "Start Server");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    await server.start({ promptType: "all-untrusted" });
    server.showOutput();
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
StartServerAction.CLASS = `${StartServerAction.LABEL_ACTION_CLASS} prominent start`;
StartServerAction.HIDE = `${StartServerAction.CLASS} hide`;
StartServerAction = __decorateClass([
  __decorateParam(0, IMcpService)
], StartServerAction);
let StopServerAction = class extends McpServerAction {
  constructor(mcpService) {
    super("extensions.stop", localize("stop", "Stop Server"), StopServerAction.CLASS, false);
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = StopServerAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const serverState = server.connectionState.get();
    if (McpConnectionState.canBeStarted(serverState.state)) {
      return;
    }
    this.class = StopServerAction.CLASS;
    this.enabled = true;
    this.label = localize("stop", "Stop Server");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    await server.stop();
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
StopServerAction.CLASS = `${StopServerAction.LABEL_ACTION_CLASS} prominent stop`;
StopServerAction.HIDE = `${StopServerAction.CLASS} hide`;
StopServerAction = __decorateClass([
  __decorateParam(0, IMcpService)
], StopServerAction);
let RestartServerAction = class extends McpServerAction {
  constructor(mcpService) {
    super("extensions.restart", localize("restart", "Restart Server"), RestartServerAction.CLASS, false);
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = RestartServerAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const serverState = server.connectionState.get();
    if (McpConnectionState.canBeStarted(serverState.state)) {
      return;
    }
    this.class = RestartServerAction.CLASS;
    this.enabled = true;
    this.label = localize("restart", "Restart Server");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    await server.stop();
    await server.start({ promptType: "all-untrusted" });
    server.showOutput();
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
RestartServerAction.CLASS = `${RestartServerAction.LABEL_ACTION_CLASS} prominent restart`;
RestartServerAction.HIDE = `${RestartServerAction.CLASS} hide`;
RestartServerAction = __decorateClass([
  __decorateParam(0, IMcpService)
], RestartServerAction);
let AuthServerAction = class extends McpServerAction {
  constructor(mcpService, _authenticationQueryService, _authenticationService) {
    super("extensions.restart", localize("restart", "Restart Server"), RestartServerAction.CLASS, false);
    this.mcpService = mcpService;
    this._authenticationQueryService = _authenticationQueryService;
    this._authenticationService = _authenticationService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = AuthServerAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const accountQuery = this.getAccountQuery();
    if (!accountQuery) {
      return;
    }
    this._accountQuery = accountQuery;
    this.class = AuthServerAction.CLASS;
    this.enabled = true;
    let label = accountQuery.entities().getEntityCount().total > 1 ? AuthServerAction.DISCONNECT : AuthServerAction.SIGN_OUT;
    label += ` (${accountQuery.accountName})`;
    this.label = label;
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    const accountQuery = this.getAccountQuery();
    if (!accountQuery) {
      return;
    }
    await server.stop();
    const { providerId, accountName } = accountQuery;
    accountQuery.mcpServer(server.definition.id).setAccessAllowed(false, server.definition.label);
    if (this.label === AuthServerAction.SIGN_OUT) {
      const accounts = await this._authenticationService.getAccounts(providerId);
      const account = accounts.find((a) => a.label === accountName);
      if (account) {
        const sessions = await this._authenticationService.getSessions(providerId, void 0, { account });
        for (const session of sessions) {
          await this._authenticationService.removeSession(providerId, session.id);
        }
      }
    }
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
  getAccountQuery() {
    const server = this.getServer();
    if (!server) {
      return void 0;
    }
    if (this._accountQuery) {
      return this._accountQuery;
    }
    const serverId = server.definition.id;
    const preferences = this._authenticationQueryService.mcpServer(serverId).getAllAccountPreferences();
    if (!preferences.size) {
      return void 0;
    }
    for (const [providerId, accountName] of preferences) {
      const accountQuery = this._authenticationQueryService.provider(providerId).account(accountName);
      if (!accountQuery.mcpServer(serverId).isAccessAllowed()) {
        continue;
      }
      return accountQuery;
    }
    return void 0;
  }
};
AuthServerAction.CLASS = `${AuthServerAction.LABEL_ACTION_CLASS} prominent account`;
AuthServerAction.HIDE = `${AuthServerAction.CLASS} hide`;
AuthServerAction.SIGN_OUT = localize("mcp.signOut", "Sign Out");
AuthServerAction.DISCONNECT = localize("mcp.disconnect", "Disconnect Account");
AuthServerAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IAuthenticationQueryService),
  __decorateParam(2, IAuthenticationService)
], AuthServerAction);
let ShowServerOutputAction = class extends McpServerAction {
  constructor(mcpService) {
    super("extensions.output", localize("output", "Show Output"), ShowServerOutputAction.CLASS, false);
    this.mcpService = mcpService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ShowServerOutputAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    this.class = ShowServerOutputAction.CLASS;
    this.enabled = true;
    this.label = localize("output", "Show Output");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    server.showOutput();
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
ShowServerOutputAction.CLASS = `${ShowServerOutputAction.LABEL_ACTION_CLASS} prominent output`;
ShowServerOutputAction.HIDE = `${ShowServerOutputAction.CLASS} hide`;
ShowServerOutputAction = __decorateClass([
  __decorateParam(0, IMcpService)
], ShowServerOutputAction);
let ShowServerConfigurationAction = class extends McpServerAction {
  constructor(mcpWorkbenchService) {
    super("extensions.config", localize("config", "Show Configuration"), ShowServerConfigurationAction.CLASS, false);
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ShowServerConfigurationAction.HIDE;
    if (!this.mcpServer?.local) {
      return;
    }
    this.class = ShowServerConfigurationAction.CLASS;
    this.enabled = true;
  }
  async run() {
    if (!this.mcpServer?.local) {
      return;
    }
    this.mcpWorkbenchService.open(this.mcpServer, { tab: McpServerEditorTab.Configuration });
  }
};
ShowServerConfigurationAction.CLASS = `${ShowServerConfigurationAction.LABEL_ACTION_CLASS} prominent config`;
ShowServerConfigurationAction.HIDE = `${ShowServerConfigurationAction.CLASS} hide`;
ShowServerConfigurationAction = __decorateClass([
  __decorateParam(0, IMcpWorkbenchService)
], ShowServerConfigurationAction);
let ShowServerJsonConfigurationAction = class extends McpServerAction {
  constructor(mcpService, mcpRegistry, editorService) {
    super("extensions.jsonConfig", localize("configJson", "Show Configuration (JSON)"), ShowServerJsonConfigurationAction.CLASS, false);
    this.mcpService = mcpService;
    this.mcpRegistry = mcpRegistry;
    this.editorService = editorService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ShowServerJsonConfigurationAction.HIDE;
    const configurationTarget = this.getConfigurationTarget();
    if (!configurationTarget) {
      return;
    }
    this.class = ShowServerConfigurationAction.CLASS;
    this.enabled = true;
  }
  async run() {
    const configurationTarget = this.getConfigurationTarget();
    if (!configurationTarget) {
      return;
    }
    this.editorService.openEditor({
      resource: URI.isUri(configurationTarget) ? configurationTarget : configurationTarget.uri,
      options: { selection: URI.isUri(configurationTarget) ? void 0 : configurationTarget.range }
    });
  }
  getConfigurationTarget() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    const server = this.mcpService.servers.get().find((s) => s.definition.label === this.mcpServer?.name);
    if (!server) {
      return;
    }
    const collection = this.mcpRegistry.collections.get().find((c) => c.id === server.collection.id);
    const serverDefinition = collection?.serverDefinitions.get().find((s) => s.id === server.definition.id);
    return serverDefinition?.presentation?.origin || collection?.presentation?.origin;
  }
};
ShowServerJsonConfigurationAction.CLASS = `${ShowServerJsonConfigurationAction.LABEL_ACTION_CLASS} prominent config`;
ShowServerJsonConfigurationAction.HIDE = `${ShowServerJsonConfigurationAction.CLASS} hide`;
ShowServerJsonConfigurationAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IMcpRegistry),
  __decorateParam(2, IEditorService)
], ShowServerJsonConfigurationAction);
let ConfigureModelAccessAction = class extends McpServerAction {
  constructor(mcpService, commandService) {
    super("extensions.config", localize("mcp.configAccess", "Configure Model Access"), ConfigureModelAccessAction.CLASS, false);
    this.mcpService = mcpService;
    this.commandService = commandService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ConfigureModelAccessAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    this.class = ConfigureModelAccessAction.CLASS;
    this.enabled = true;
    this.label = localize("mcp.configAccess", "Configure Model Access");
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    this.commandService.executeCommand(McpCommandIds.ConfigureSamplingModels, server);
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
ConfigureModelAccessAction.CLASS = `${ConfigureModelAccessAction.LABEL_ACTION_CLASS} prominent config`;
ConfigureModelAccessAction.HIDE = `${ConfigureModelAccessAction.CLASS} hide`;
ConfigureModelAccessAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, ICommandService)
], ConfigureModelAccessAction);
let ShowSamplingRequestsAction = class extends McpServerAction {
  constructor(mcpService, samplingService, editorService) {
    super("extensions.config", localize("mcp.samplingLog", "Show Sampling Requests"), ShowSamplingRequestsAction.CLASS, false);
    this.mcpService = mcpService;
    this.samplingService = samplingService;
    this.editorService = editorService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ShowSamplingRequestsAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    if (!this.samplingService.hasLogs(server)) {
      return;
    }
    this.class = ShowSamplingRequestsAction.CLASS;
    this.enabled = true;
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    if (!this.samplingService.hasLogs(server)) {
      return;
    }
    this.editorService.openEditor({
      resource: void 0,
      contents: this.samplingService.getLogText(server),
      label: localize("mcp.samplingLog.title", "MCP Sampling: {0}", server.definition.label)
    });
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
ShowSamplingRequestsAction.CLASS = `${ShowSamplingRequestsAction.LABEL_ACTION_CLASS} prominent config`;
ShowSamplingRequestsAction.HIDE = `${ShowSamplingRequestsAction.CLASS} hide`;
ShowSamplingRequestsAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, IMcpSamplingService),
  __decorateParam(2, IEditorService)
], ShowSamplingRequestsAction);
let BrowseResourcesAction = class extends McpServerAction {
  constructor(mcpService, commandService) {
    super("extensions.config", localize("mcp.resources", "Browse Resources"), BrowseResourcesAction.CLASS, false);
    this.mcpService = mcpService;
    this.commandService = commandService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = BrowseResourcesAction.HIDE;
    const server = this.getServer();
    if (!server) {
      return;
    }
    const capabilities = server.capabilities.get();
    if (capabilities !== void 0 && !(capabilities & McpCapability.Resources)) {
      return;
    }
    this.class = BrowseResourcesAction.CLASS;
    this.enabled = true;
  }
  async run() {
    const server = this.getServer();
    if (!server) {
      return;
    }
    const capabilities = server.capabilities.get();
    if (capabilities !== void 0 && !(capabilities & McpCapability.Resources)) {
      return;
    }
    return this.commandService.executeCommand(McpCommandIds.BrowseResources, server);
  }
  getServer() {
    if (!this.mcpServer) {
      return;
    }
    if (!this.mcpServer.local) {
      return;
    }
    return this.mcpService.servers.get().find((s) => s.definition.id === this.mcpServer?.id);
  }
};
BrowseResourcesAction.CLASS = `${BrowseResourcesAction.LABEL_ACTION_CLASS} prominent config`;
BrowseResourcesAction.HIDE = `${BrowseResourcesAction.CLASS} hide`;
BrowseResourcesAction = __decorateClass([
  __decorateParam(0, IMcpService),
  __decorateParam(1, ICommandService)
], BrowseResourcesAction);
let McpServerStatusAction = class extends McpServerAction {
  constructor(mcpWorkbenchService, commandService) {
    super("extensions.status", "", `${McpServerStatusAction.CLASS} hide`, false);
    this.mcpWorkbenchService = mcpWorkbenchService;
    this.commandService = commandService;
    this._status = [];
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this.update();
  }
  get status() {
    return this._status;
  }
  update() {
    this.computeAndUpdateStatus();
  }
  computeAndUpdateStatus() {
    this.updateStatus(void 0, true);
    this.enabled = false;
    if (!this.mcpServer) {
      return;
    }
    if ((this.mcpServer.gallery || this.mcpServer.installable) && this.mcpServer.installState === McpServerInstallState.Uninstalled) {
      const result = this.mcpWorkbenchService.canInstall(this.mcpServer);
      if (result !== true) {
        this.updateStatus({ icon: warningIcon, message: result }, true);
        return;
      }
    }
    const runtimeState = this.mcpServer.runtimeStatus;
    if (runtimeState?.message) {
      this.updateStatus({ icon: runtimeState.message.severity === Severity.Warning ? warningIcon : runtimeState.message.severity === Severity.Error ? errorIcon : infoIcon, message: runtimeState.message.text }, true);
    }
  }
  updateStatus(status, updateClass) {
    if (status) {
      if (this._status.some((s) => s.message.value === status.message.value && s.icon?.id === status.icon?.id)) {
        return;
      }
    } else {
      if (this._status.length === 0) {
        return;
      }
      this._status = [];
    }
    if (status) {
      this._status.push(status);
      this._status.sort(
        (a, b) => b.icon === trustIcon ? -1 : a.icon === trustIcon ? 1 : b.icon === errorIcon ? -1 : a.icon === errorIcon ? 1 : b.icon === warningIcon ? -1 : a.icon === warningIcon ? 1 : b.icon === infoIcon ? -1 : a.icon === infoIcon ? 1 : 0
      );
    }
    if (updateClass) {
      if (status?.icon === errorIcon) {
        this.class = `${McpServerStatusAction.CLASS} extension-status-error ${ThemeIcon.asClassName(errorIcon)}`;
      } else if (status?.icon === warningIcon) {
        this.class = `${McpServerStatusAction.CLASS} extension-status-warning ${ThemeIcon.asClassName(warningIcon)}`;
      } else if (status?.icon === infoIcon) {
        this.class = `${McpServerStatusAction.CLASS} extension-status-info ${ThemeIcon.asClassName(infoIcon)}`;
      } else if (status?.icon === trustIcon) {
        this.class = `${McpServerStatusAction.CLASS} ${ThemeIcon.asClassName(trustIcon)}`;
      } else {
        this.class = `${McpServerStatusAction.CLASS} hide`;
      }
    }
    this._onDidChangeStatus.fire();
  }
  async run() {
    if (this._status[0]?.icon === trustIcon) {
      return this.commandService.executeCommand("workbench.trust.manage");
    }
  }
};
McpServerStatusAction.CLASS = `${McpServerAction.ICON_ACTION_CLASS} extension-status`;
McpServerStatusAction = __decorateClass([
  __decorateParam(0, IMcpWorkbenchService),
  __decorateParam(1, ICommandService)
], McpServerStatusAction);
export {
  AuthServerAction,
  BrowseResourcesAction,
  ButtonWithDropDownExtensionAction,
  ButtonWithDropdownExtensionActionViewItem,
  ConfigureModelAccessAction,
  DisableMcpDropDownAction,
  DisableMcpServerForWorkspaceAction,
  DisableMcpServerGloballyAction,
  DropDownAction,
  DropDownExtensionActionViewItem,
  EnableMcpDropDownAction,
  EnableMcpServerForWorkspaceAction,
  EnableMcpServerGloballyAction,
  InstallAction,
  InstallInRemoteAction,
  InstallInWorkspaceAction,
  InstallingLabelAction,
  ManageMcpServerAction,
  McpServerAction,
  McpServerStatusAction,
  RestartServerAction,
  ShowSamplingRequestsAction,
  ShowServerConfigurationAction,
  ShowServerJsonConfigurationAction,
  ShowServerOutputAction,
  StartServerAction,
  StopServerAction,
  UninstallAction,
  getContextMenuActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcYnJvd3NlclxcbWNwU2VydmVyQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgSUFjdGlvbkNoYW5nZUV2ZW50LCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZGlzcG9zZUlmRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vY29tbW9uL2F1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElBY2NvdW50UXVlcnksIElBdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvblF1ZXJ5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVycm9ySWNvbiwgaW5mb0ljb24sIG1hbmFnZUV4dGVuc2lvbkljb24sIHRydXN0SWNvbiwgd2FybmluZ0ljb24gfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IE1jcENvbW1hbmRJZHMgfSBmcm9tICcuLi9jb21tb24vbWNwQ29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBJTWNwUmVnaXN0cnkgfSBmcm9tICcuLi9jb21tb24vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTWNwU2FtcGxpbmdTZXJ2aWNlLCBJTWNwU2VydmVyLCBJTWNwU2VydmVyQ29udGFpbmVyLCBJTWNwU2VydmljZSwgSU1jcFdvcmtiZW5jaFNlcnZpY2UsIElXb3JrYmVuY2hNY3BTZXJ2ZXIsIE1jcENhcGFiaWxpdHksIE1jcENvbm5lY3Rpb25TdGF0ZSwgTWNwU2VydmVyRWRpdG9yVGFiLCBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUgfSBmcm9tICcuLi9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgc3RhcnRTZXJ2ZXJCeUZpbHRlciB9IGZyb20gJy4uL2NvbW1vbi9tY3BUeXBlc1V0aWxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIFF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgTG9jYWxNY3BTZXJ2ZXJTY29wZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL21jcC9jb21tb24vbWNwV29ya2JlbmNoTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbldpdGhEcm9wZG93bkFjdGlvblZpZXdJdGVtLCBJQWN0aW9uV2l0aERyb3Bkb3duQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY29udGV4dG1lbnUuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSwgaXNDb250cmlidXRpb25EaXNhYmxlZCwgaXNDb250cmlidXRpb25FbmFibGVkIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vZW5hYmxlbWVudC5qcyc7XG5pbXBvcnQgeyBnZXRXb3JrYmVuY2hNZW51TW90aW9uQ29udGV4dE1lbnVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL21lbnVNb3Rpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElNY3BTZXJ2ZXJBY3Rpb25DaGFuZ2VFdmVudCBleHRlbmRzIElBY3Rpb25DaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IGhpZGRlbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1lbnVBY3Rpb25zPzogSUFjdGlvbltdO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTWNwU2VydmVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uIGltcGxlbWVudHMgSU1jcFNlcnZlckNvbnRhaW5lciB7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNY3BTZXJ2ZXJBY3Rpb25DaGFuZ2VFdmVudD4oKSk7XG5cdG92ZXJyaWRlIGdldCBvbkRpZENoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50OyB9XG5cblx0c3RhdGljIHJlYWRvbmx5IEVYVEVOU0lPTl9BQ1RJT05fQ0xBU1MgPSAnZXh0ZW5zaW9uLWFjdGlvbic7XG5cdHN0YXRpYyByZWFkb25seSBURVhUX0FDVElPTl9DTEFTUyA9IGAke01jcFNlcnZlckFjdGlvbi5FWFRFTlNJT05fQUNUSU9OX0NMQVNTfSB0ZXh0YDtcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMX0FDVElPTl9DTEFTUyA9IGAke01jcFNlcnZlckFjdGlvbi5FWFRFTlNJT05fQUNUSU9OX0NMQVNTfSBsYWJlbGA7XG5cdHN0YXRpYyByZWFkb25seSBQUk9NSU5FTlRfTEFCRUxfQUNUSU9OX0NMQVNTID0gYCR7TWNwU2VydmVyQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gcHJvbWluZW50YDtcblx0c3RhdGljIHJlYWRvbmx5IElDT05fQUNUSU9OX0NMQVNTID0gYCR7TWNwU2VydmVyQWN0aW9uLkVYVEVOU0lPTl9BQ1RJT05fQ0xBU1N9IGljb25gO1xuXG5cdHByaXZhdGUgX2hpZGRlbjogYm9vbGVhbiA9IGZhbHNlO1xuXHRnZXQgaGlkZGVuKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGlkZGVuOyB9XG5cdHNldCBoaWRkZW4oaGlkZGVuOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX2hpZGRlbiAhPT0gaGlkZGVuKSB7XG5cdFx0XHR0aGlzLl9oaWRkZW4gPSBoaWRkZW47XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgaGlkZGVuIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfc2V0RW5hYmxlZCh2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHN1cGVyLl9zZXRFbmFibGVkKHZhbHVlKTtcblx0XHRpZiAodGhpcy5oaWRlT25EaXNhYmxlZCkge1xuXHRcdFx0dGhpcy5oaWRkZW4gPSAhdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGhpZGVPbkRpc2FibGVkOiBib29sZWFuID0gdHJ1ZTtcblxuXHRwcml2YXRlIF9tY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIgfCBudWxsID0gbnVsbDtcblx0Z2V0IG1jcFNlcnZlcigpOiBJV29ya2JlbmNoTWNwU2VydmVyIHwgbnVsbCB7IHJldHVybiB0aGlzLl9tY3BTZXJ2ZXI7IH1cblx0c2V0IG1jcFNlcnZlcihtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIgfCBudWxsKSB7IHRoaXMuX21jcFNlcnZlciA9IG1jcFNlcnZlcjsgdGhpcy51cGRhdGUoKTsgfVxuXG5cdGFic3RyYWN0IHVwZGF0ZSgpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRwcml2YXRlIHByaW1hcnlBY3Rpb246IElBY3Rpb24gfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbWVudUFjdGlvbkNsYXNzTmFtZXM6IHN0cmluZ1tdID0gW107XG5cdHByaXZhdGUgX21lbnVBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0Z2V0IG1lbnVBY3Rpb25zKCk6IElBY3Rpb25bXSB7IHJldHVybiBbLi4udGhpcy5fbWVudUFjdGlvbnNdOyB9XG5cblx0b3ZlcnJpZGUgZ2V0IG1jcFNlcnZlcigpOiBJV29ya2JlbmNoTWNwU2VydmVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHN1cGVyLm1jcFNlcnZlcjtcblx0fVxuXG5cdG92ZXJyaWRlIHNldCBtY3BTZXJ2ZXIobWNwU2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyIHwgbnVsbCkge1xuXHRcdHRoaXMuYWN0aW9ucy5mb3JFYWNoKGEgPT4gYS5tY3BTZXJ2ZXIgPSBtY3BTZXJ2ZXIpO1xuXHRcdHN1cGVyLm1jcFNlcnZlciA9IG1jcFNlcnZlcjtcblx0fVxuXG5cdHByb3RlY3RlZCByZWFkb25seSBhY3Rpb25zOiBNY3BTZXJ2ZXJBY3Rpb25bXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdGNsYXp6OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25zR3JvdXBzOiBNY3BTZXJ2ZXJBY3Rpb25bXVtdLFxuXHQpIHtcblx0XHRjbGF6eiA9IGAke2NsYXp6fSBhY3Rpb24tZHJvcGRvd25gO1xuXHRcdHN1cGVyKGlkLCB1bmRlZmluZWQsIGNsYXp6KTtcblx0XHR0aGlzLm1lbnVBY3Rpb25DbGFzc05hbWVzID0gY2xhenouc3BsaXQoJyAnKTtcblx0XHR0aGlzLmhpZGVPbkRpc2FibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5hY3Rpb25zID0gYWN0aW9uc0dyb3Vwcy5mbGF0KCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoLi4udGhpcy5hY3Rpb25zLm1hcChhID0+IGEub25EaWRDaGFuZ2UpKSgoKSA9PiB0aGlzLnVwZGF0ZSh0cnVlKSkpO1xuXHRcdHRoaXMuYWN0aW9ucy5mb3JFYWNoKGEgPT4gdGhpcy5fcmVnaXN0ZXIoYSkpO1xuXHR9XG5cblx0dXBkYXRlKGRvbm90VXBkYXRlQWN0aW9ucz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIWRvbm90VXBkYXRlQWN0aW9ucykge1xuXHRcdFx0dGhpcy5hY3Rpb25zLmZvckVhY2goYSA9PiBhLnVwZGF0ZSgpKTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zR3JvdXBzID0gdGhpcy5hY3Rpb25zR3JvdXBzLm1hcChhY3Rpb25zR3JvdXAgPT4gYWN0aW9uc0dyb3VwLmZpbHRlcihhID0+ICFhLmhpZGRlbikpO1xuXG5cdFx0bGV0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdmlzaWJsZUFjdGlvbnMgb2YgYWN0aW9uc0dyb3Vwcykge1xuXHRcdFx0aWYgKHZpc2libGVBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRhY3Rpb25zID0gWy4uLmFjdGlvbnMsIC4uLnZpc2libGVBY3Rpb25zLCBuZXcgU2VwYXJhdG9yKCldO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhY3Rpb25zID0gYWN0aW9ucy5sZW5ndGggPyBhY3Rpb25zLnNsaWNlKDAsIGFjdGlvbnMubGVuZ3RoIC0gMSkgOiBhY3Rpb25zO1xuXG5cdFx0dGhpcy5wcmltYXJ5QWN0aW9uID0gYWN0aW9uc1swXTtcblx0XHR0aGlzLl9tZW51QWN0aW9ucyA9IGFjdGlvbnMubGVuZ3RoID4gMSA/IGFjdGlvbnMgOiBbXTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgbWVudUFjdGlvbnM6IHRoaXMuX21lbnVBY3Rpb25zIH0pO1xuXG5cdFx0aWYgKHRoaXMucHJpbWFyeUFjdGlvbikge1xuXHRcdFx0dGhpcy5oaWRkZW4gPSBmYWxzZTtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMucHJpbWFyeUFjdGlvbi5lbmFibGVkO1xuXHRcdFx0dGhpcy5sYWJlbCA9IHRoaXMuZ2V0TGFiZWwodGhpcy5wcmltYXJ5QWN0aW9uIGFzIEV4dGVuc2lvbkFjdGlvbik7XG5cdFx0XHR0aGlzLnRvb2x0aXAgPSB0aGlzLnByaW1hcnlBY3Rpb24udG9vbHRpcDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5oaWRkZW4gPSB0cnVlO1xuXHRcdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmVuYWJsZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMucHJpbWFyeUFjdGlvbj8ucnVuKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldExhYmVsKGFjdGlvbjogRXh0ZW5zaW9uQWN0aW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYWN0aW9uLmxhYmVsO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCdXR0b25XaXRoRHJvcGRvd25FeHRlbnNpb25BY3Rpb25WaWV3SXRlbSBleHRlbmRzIEFjdGlvbldpdGhEcm9wZG93bkFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbixcblx0XHRvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zICYgSUFjdGlvbldpdGhEcm9wZG93bkFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRjb250ZXh0TWVudVByb3ZpZGVyOiBJQ29udGV4dE1lbnVQcm92aWRlclxuXHQpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIG9wdGlvbnMsIGNvbnRleHRNZW51UHJvdmlkZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvbi5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmhpZGRlbiAhPT0gdW5kZWZpbmVkIHx8IGUubWVudUFjdGlvbnMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNsYXNzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLnVwZGF0ZUNsYXNzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQ2xhc3MoKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlQ2xhc3MoKTtcblx0XHRpZiAodGhpcy5lbGVtZW50ICYmIHRoaXMuZHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0/LmVsZW1lbnQpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlJywgKDxCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24+dGhpcy5fYWN0aW9uKS5oaWRkZW4pO1xuXHRcdFx0Y29uc3QgaXNNZW51RW1wdHkgPSAoPEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbj50aGlzLl9hY3Rpb24pLm1lbnVBY3Rpb25zLmxlbmd0aCA9PT0gMDtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdlbXB0eScsIGlzTWVudUVtcHR5KTtcblx0XHRcdHRoaXMuZHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0uZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlJywgaXNNZW51RW1wdHkpO1xuXHRcdH1cblx0fVxuXG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBEcm9wRG93bkFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdGNzc0NsYXNzOiBzdHJpbmcsXG5cdFx0ZW5hYmxlZDogYm9vbGVhbixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCwgY3NzQ2xhc3MsIGVuYWJsZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aW9uVmlld0l0ZW06IERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uVmlld0l0ZW0gfCBudWxsID0gbnVsbDtcblx0Y3JlYXRlQWN0aW9uVmlld0l0ZW0ob3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uVmlld0l0ZW0ge1xuXHRcdHRoaXMuX2FjdGlvblZpZXdJdGVtID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEcm9wRG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtLCB0aGlzLCBvcHRpb25zKTtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uVmlld0l0ZW07XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKGFjdGlvbkdyb3VwczogSUFjdGlvbltdW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9hY3Rpb25WaWV3SXRlbT8uc2hvd01lbnUoYWN0aW9uR3JvdXBzKTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IHRydWUsIGxhYmVsOiB0cnVlIH0pO1xuXHR9XG5cblx0cHVibGljIHNob3dNZW51KG1lbnVBY3Rpb25Hcm91cHM6IElBY3Rpb25bXVtdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuZ2V0QWN0aW9ucyhtZW51QWN0aW9uR3JvdXBzKTtcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdC4uLmdldFdvcmtiZW5jaE1lbnVNb3Rpb25Db250ZXh0TWVudU9wdGlvbnModGhpcy5lbGVtZW50KSxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lcixcblx0XHRcdFx0b25IaWRlOiAoKSA9PiBkaXNwb3NlSWZEaXNwb3NhYmxlKGFjdGlvbnMpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGlvbnMobWVudUFjdGlvbkdyb3VwczogSUFjdGlvbltdW10pOiBJQWN0aW9uW10ge1xuXHRcdGxldCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG1lbnVBY3Rpb25zIG9mIG1lbnVBY3Rpb25Hcm91cHMpIHtcblx0XHRcdGFjdGlvbnMgPSBbLi4uYWN0aW9ucywgLi4ubWVudUFjdGlvbnMsIG5ldyBTZXBhcmF0b3IoKV07XG5cdFx0fVxuXHRcdHJldHVybiBhY3Rpb25zLmxlbmd0aCA/IGFjdGlvbnMuc2xpY2UoMCwgYWN0aW9ucy5sZW5ndGggLSAxKSA6IGFjdGlvbnM7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgaW5zdGFsbGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wZW46IGJvb2xlYW4sXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmluc3RhbGwnLCBsb2NhbGl6ZSgnaW5zdGFsbCcsIFwiSW5zdGFsbFwiKSwgSW5zdGFsbEFjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IEluc3RhbGxBY3Rpb24uSElERTtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyPy5nYWxsZXJ5ICYmICF0aGlzLm1jcFNlcnZlcj8uaW5zdGFsbGFibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMubWNwU2VydmVyLmluc3RhbGxTdGF0ZSAhPT0gTWNwU2VydmVySW5zdGFsbFN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2xhc3MgPSBJbnN0YWxsQWN0aW9uLkNMQVNTO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5jYW5JbnN0YWxsKHRoaXMubWNwU2VydmVyKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3Blbikge1xuXHRcdFx0dGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLm9wZW4odGhpcy5tY3BTZXJ2ZXIpO1xuXHRcdFx0YWxlcnQobG9jYWxpemUoJ21jcFNlcnZlckluc3RhbGxhdGlvbicsIFwiSW5zdGFsbGluZyBNQ1AgU2VydmVyIHswfSBzdGFydGVkLiBBbiBlZGl0b3IgaXMgbm93IG9wZW4gd2l0aCBtb3JlIGRldGFpbHMgb24gdGhpcyBNQ1AgU2VydmVyXCIsIHRoaXMubWNwU2VydmVyLmxhYmVsKSk7XG5cdFx0fVxuXG5cdFx0dHlwZSBNY3BTZXJ2ZXJJbnN0YWxsQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdGNvbW1lbnQ6ICdVc2VkIHRvIHVuZGVyc3RhbmQgaWYgdGhlIGFjdGlvbiB0byBpbnN0YWxsIHRoZSBNQ1Agc2VydmVyIGlzIHVzZWQuJztcblx0XHRcdG5hbWU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGdhbGxlcnkgbmFtZSBvZiB0aGUgTUNQIHNlcnZlciBiZWluZyBpbnN0YWxsZWQnIH07XG5cdFx0fTtcblx0XHR0eXBlIE1jcFNlcnZlckluc3RhbGwgPSB7XG5cdFx0XHRuYW1lPzogc3RyaW5nO1xuXHRcdH07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8TWNwU2VydmVySW5zdGFsbCwgTWNwU2VydmVySW5zdGFsbENsYXNzaWZpY2F0aW9uPignbWNwOmFjdGlvbjppbnN0YWxsJywgeyBuYW1lOiB0aGlzLm1jcFNlcnZlci5nYWxsZXJ5Py5uYW1lIH0pO1xuXG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwodGhpcy5tY3BTZXJ2ZXIpO1xuXG5cdFx0YXdhaXQgc3RhcnRTZXJ2ZXJCeUZpbHRlcih0aGlzLm1jcFNlcnZpY2UsIHMgPT4ge1xuXHRcdFx0cmV0dXJuIHMuZGVmaW5pdGlvbi5sYWJlbCA9PT0gaW5zdGFsbGVkLm5hbWU7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxJbldvcmtzcGFjZUFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBpbnN0YWxsYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3BlbjogYm9vbGVhbixcblx0XHRASU1jcFdvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BXb3JrYmVuY2hTZXJ2aWNlOiBJTWNwV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5pbnN0YWxsV29ya3NwYWNlJywgbG9jYWxpemUoJ2luc3RhbGxJbldvcmtzcGFjZScsIFwiSW5zdGFsbCBpbiBXb3Jrc3BhY2VcIiksIEluc3RhbGxBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBJbnN0YWxsSW5Xb3Jrc3BhY2VBY3Rpb24uSElERTtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXI/LmdhbGxlcnkgJiYgIXRoaXMubWNwU2VydmVyPy5pbnN0YWxsYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIuaW5zdGFsbFN0YXRlICE9PSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuVW5pbnN0YWxsZWQgJiYgdGhpcy5tY3BTZXJ2ZXIubG9jYWw/LnNjb3BlID09PSBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNsYXNzID0gSW5zdGFsbEFjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UuY2FuSW5zdGFsbCh0aGlzLm1jcFNlcnZlcikgPT09IHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wZW4pIHtcblx0XHRcdHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5vcGVuKHRoaXMubWNwU2VydmVyLCB7IHByZXNlcnZlRm9jdXM6IHRydWUgfSk7XG5cdFx0XHRhbGVydChsb2NhbGl6ZSgnbWNwU2VydmVySW5zdGFsbGF0aW9uJywgXCJJbnN0YWxsaW5nIE1DUCBTZXJ2ZXIgezB9IHN0YXJ0ZWQuIEFuIGVkaXRvciBpcyBub3cgb3BlbiB3aXRoIG1vcmUgZGV0YWlscyBvbiB0aGlzIE1DUCBTZXJ2ZXJcIiwgdGhpcy5tY3BTZXJ2ZXIubGFiZWwpKTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLmdldENvbmZpZ3VyYXRpb25UYXJnZXQoKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHR5cGUgTWNwU2VydmVySW5zdGFsbENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRjb21tZW50OiAnVXNlZCB0byB1bmRlcnN0YW5kIGlmIHRoZSBhY3Rpb24gdG8gaW5zdGFsbCB0aGUgTUNQIHNlcnZlciBpcyB1c2VkLic7XG5cdFx0XHRuYW1lPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBnYWxsZXJ5IG5hbWUgb2YgdGhlIE1DUCBzZXJ2ZXIgYmVpbmcgaW5zdGFsbGVkJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBNY3BTZXJ2ZXJJbnN0YWxsID0ge1xuXHRcdFx0bmFtZT86IHN0cmluZztcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPE1jcFNlcnZlckluc3RhbGwsIE1jcFNlcnZlckluc3RhbGxDbGFzc2lmaWNhdGlvbj4oJ21jcDphY3Rpb246aW5zdGFsbDp3b3Jrc3BhY2UnLCB7IG5hbWU6IHRoaXMubWNwU2VydmVyLmdhbGxlcnk/Lm5hbWUgfSk7XG5cblx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbCh0aGlzLm1jcFNlcnZlciwgeyB0YXJnZXQgfSk7XG5cdFx0YXdhaXQgc3RhcnRTZXJ2ZXJCeUZpbHRlcih0aGlzLm1jcFNlcnZpY2UsIHMgPT4ge1xuXHRcdFx0cmV0dXJuIHMuZGVmaW5pdGlvbi5sYWJlbCA9PT0gaW5zdGFsbGVkLm5hbWU7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldENvbmZpZ3VyYXRpb25UYXJnZXQoKTogUHJvbWlzZTxDb25maWd1cmF0aW9uVGFyZ2V0IHwgSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHR5cGUgT3B0aW9uUXVpY2tQaWNrSXRlbSA9IFF1aWNrUGlja0l0ZW0gJiB7IHRhcmdldD86IENvbmZpZ3VyYXRpb25UYXJnZXQgfCBJV29ya3NwYWNlRm9sZGVyIH07XG5cdFx0Y29uc3Qgb3B0aW9uczogT3B0aW9uUXVpY2tQaWNrSXRlbVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycykge1xuXHRcdFx0b3B0aW9ucy5wdXNoKHsgdGFyZ2V0OiBmb2xkZXIsIGxhYmVsOiBmb2xkZXIubmFtZSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnN0YWxsIGluIHdvcmtzcGFjZSBmb2xkZXInLCBcIldvcmtzcGFjZSBGb2xkZXJcIikgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdGlmIChvcHRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0b3B0aW9ucy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0XHR9XG5cdFx0XHRvcHRpb25zLnB1c2goeyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFLCBsYWJlbDogbG9jYWxpemUoJ21jcC50YXJnZXQud29ya3NwYWNlJywgXCJXb3Jrc3BhY2VcIikgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9uc1swXS50YXJnZXQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0UGljayA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhvcHRpb25zLCB7XG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ21jcC50YXJnZXQudGl0bGUnLCBcIkNob29zZSB3aGVyZSB0byBpbnN0YWxsIHRoZSBNQ1Agc2VydmVyXCIpLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuICh0YXJnZXRQaWNrIGFzIE9wdGlvblF1aWNrUGlja0l0ZW0pPy50YXJnZXQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxJblJlbW90ZUFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBpbnN0YWxsYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3BlbjogYm9vbGVhbixcblx0XHRASU1jcFdvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BXb3JrYmVuY2hTZXJ2aWNlOiBJTWNwV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuaW5zdGFsbFJlbW90ZScsIGxvY2FsaXplKCdpbnN0YWxsSW5SZW1vdGUnLCBcIkluc3RhbGwgKFJlbW90ZSlcIiksIEluc3RhbGxBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHRjb25zdCByZW1vdGVMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbChTY2hlbWFzLnZzY29kZVJlbW90ZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KTtcblx0XHR0aGlzLmxhYmVsID0gbG9jYWxpemUoJ2luc3RhbGxJblJlbW90ZUxhYmVsJywgXCJJbnN0YWxsIGluIHswfVwiLCByZW1vdGVMYWJlbCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gSW5zdGFsbEluUmVtb3RlQWN0aW9uLkhJREU7XG5cdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcj8uZ2FsbGVyeSAmJiAhdGhpcy5tY3BTZXJ2ZXI/Lmluc3RhbGxhYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1jcFNlcnZlci5pbnN0YWxsU3RhdGUgIT09IE1jcFNlcnZlckluc3RhbGxTdGF0ZS5Vbmluc3RhbGxlZCkge1xuXHRcdFx0aWYgKHRoaXMubWNwU2VydmVyLmxvY2FsPy5zY29wZSA9PT0gTG9jYWxNY3BTZXJ2ZXJTY29wZS5SZW1vdGVVc2VyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZChtY3BTZXJ2ZXIgPT4gbWNwU2VydmVyLm5hbWUgPT09IHRoaXMubWNwU2VydmVyPy5uYW1lICYmIG1jcFNlcnZlci5sb2NhbD8uc2NvcGUgPT09IExvY2FsTWNwU2VydmVyU2NvcGUuUmVtb3RlVXNlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmNsYXNzID0gSW5zdGFsbEFjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UuY2FuSW5zdGFsbCh0aGlzLm1jcFNlcnZlcikgPT09IHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wZW4pIHtcblx0XHRcdHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5vcGVuKHRoaXMubWNwU2VydmVyKTtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdtY3BTZXJ2ZXJJbnN0YWxsYXRpb24nLCBcIkluc3RhbGxpbmcgTUNQIFNlcnZlciB7MH0gc3RhcnRlZC4gQW4gZWRpdG9yIGlzIG5vdyBvcGVuIHdpdGggbW9yZSBkZXRhaWxzIG9uIHRoaXMgTUNQIFNlcnZlclwiLCB0aGlzLm1jcFNlcnZlci5sYWJlbCkpO1xuXHRcdH1cblxuXHRcdHR5cGUgTWNwU2VydmVySW5zdGFsbENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdzYW5keTA4MSc7XG5cdFx0XHRjb21tZW50OiAnVXNlZCB0byB1bmRlcnN0YW5kIGlmIHRoZSBhY3Rpb24gdG8gaW5zdGFsbCB0aGUgTUNQIHNlcnZlciBpcyB1c2VkLic7XG5cdFx0XHRuYW1lPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBnYWxsZXJ5IG5hbWUgb2YgdGhlIE1DUCBzZXJ2ZXIgYmVpbmcgaW5zdGFsbGVkJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBNY3BTZXJ2ZXJJbnN0YWxsID0ge1xuXHRcdFx0bmFtZT86IHN0cmluZztcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPE1jcFNlcnZlckluc3RhbGwsIE1jcFNlcnZlckluc3RhbGxDbGFzc2lmaWNhdGlvbj4oJ21jcDphY3Rpb246aW5zdGFsbDpyZW1vdGUnLCB7IG5hbWU6IHRoaXMubWNwU2VydmVyLmdhbGxlcnk/Lm5hbWUgfSk7XG5cblx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbCh0aGlzLm1jcFNlcnZlciwgeyB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUgfSk7XG5cdFx0YXdhaXQgc3RhcnRTZXJ2ZXJCeUZpbHRlcih0aGlzLm1jcFNlcnZpY2UsIHMgPT4ge1xuXHRcdFx0cmV0dXJuIHMuZGVmaW5pdGlvbi5sYWJlbCA9PT0gaW5zdGFsbGVkLm5hbWU7XG5cdFx0fSk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFsbGluZ0xhYmVsQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdpbnN0YWxsaW5nJywgXCJJbnN0YWxsaW5nXCIpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke01jcFNlcnZlckFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IGluc3RhbGwgaW5zdGFsbGluZ2A7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbi5pbnN0YWxsaW5nJywgSW5zdGFsbGluZ0xhYmVsQWN0aW9uLkxBQkVMLCBJbnN0YWxsaW5nTGFiZWxBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsYXNzID0gYCR7SW5zdGFsbGluZ0xhYmVsQWN0aW9uLkNMQVNTfSR7dGhpcy5tY3BTZXJ2ZXIgJiYgdGhpcy5tY3BTZXJ2ZXIuaW5zdGFsbFN0YXRlID09PSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuSW5zdGFsbGluZyA/ICcnIDogJyBoaWRlJ31gO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVbmluc3RhbGxBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgdW5pbnN0YWxsYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFdvcmtiZW5jaFNlcnZpY2U6IElNY3BXb3JrYmVuY2hTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy51bmluc3RhbGwnLCBsb2NhbGl6ZSgndW5pbnN0YWxsJywgXCJVbmluc3RhbGxcIiksIFVuaW5zdGFsbEFjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFVuaW5zdGFsbEFjdGlvbi5ISURFO1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlci5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tY3BTZXJ2ZXIuaW5zdGFsbFN0YXRlICE9PSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuSW5zdGFsbGVkKSB7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IFVuaW5zdGFsbEFjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMubGFiZWwgPSBsb2NhbGl6ZSgndW5pbnN0YWxsJywgXCJVbmluc3RhbGxcIik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLm1jcFdvcmtiZW5jaFNlcnZpY2UudW5pbnN0YWxsKHRoaXMubWNwU2VydmVyKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRW5hYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdtY3BTZXJ2ZXIuZW5hYmxlR2xvYmFsbHknO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihFbmFibGVNY3BTZXJ2ZXJHbG9iYWxseUFjdGlvbi5JRCwgbG9jYWxpemUoJ2VuYWJsZUdsb2JhbGx5JywgXCJFbmFibGVcIiksIE1jcFNlcnZlckFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1MpO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdlbmFibGVHbG9iYWxseVRvb2x0aXAnLCBcIkVuYWJsZSB0aGlzIE1DUCBzZXJ2ZXJcIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyPy5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSB0aGlzLm1jcFNlcnZlcj8uaWQpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVuYWJsZW1lbnQgPSBzZXJ2ZXIuZW5hYmxlbWVudC5nZXQoKTtcblx0XHR0aGlzLmVuYWJsZWQgPSBpc0NvbnRyaWJ1dGlvbkRpc2FibGVkKGVuYWJsZW1lbnQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5tY3BTZXJ2aWNlLmVuYWJsZW1lbnRNb2RlbC5zZXRFbmFibGVkKHRoaXMubWNwU2VydmVyLmlkLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFbmFibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdtY3BTZXJ2ZXIuZW5hYmxlRm9yV29ya3NwYWNlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihFbmFibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24uSUQsIGxvY2FsaXplKCdlbmFibGVGb3JXb3Jrc3BhY2UnLCBcIkVuYWJsZSAoV29ya3NwYWNlKVwiKSwgTWNwU2VydmVyQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2VuYWJsZUZvcldvcmtzcGFjZVRvb2x0aXAnLCBcIkVuYWJsZSB0aGlzIE1DUCBzZXJ2ZXIgb25seSBpbiB0aGlzIHdvcmtzcGFjZVwiKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXI/LmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXI/LmlkKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVtZW50ID0gc2VydmVyLmVuYWJsZW1lbnQuZ2V0KCk7XG5cdFx0dGhpcy5lbmFibGVkID0gaXNDb250cmlidXRpb25EaXNhYmxlZChlbmFibGVtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZCh0aGlzLm1jcFNlcnZlci5pZCwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNhYmxlTWNwU2VydmVyR2xvYmFsbHlBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdtY3BTZXJ2ZXIuZGlzYWJsZUdsb2JhbGx5JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRGlzYWJsZU1jcFNlcnZlckdsb2JhbGx5QWN0aW9uLklELCBsb2NhbGl6ZSgnZGlzYWJsZUdsb2JhbGx5JywgXCJEaXNhYmxlXCIpLCBNY3BTZXJ2ZXJBY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnZGlzYWJsZUdsb2JhbGx5VG9vbHRpcCcsIFwiRGlzYWJsZSB0aGlzIE1DUCBzZXJ2ZXJcIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyPy5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSB0aGlzLm1jcFNlcnZlcj8uaWQpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVuYWJsZW1lbnQgPSBzZXJ2ZXIuZW5hYmxlbWVudC5nZXQoKTtcblx0XHR0aGlzLmVuYWJsZWQgPSBpc0NvbnRyaWJ1dGlvbkVuYWJsZWQoZW5hYmxlbWVudCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm1jcFNlcnZpY2UuZW5hYmxlbWVudE1vZGVsLnNldEVuYWJsZWQodGhpcy5tY3BTZXJ2ZXIuaWQsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNhYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnbWNwU2VydmVyLmRpc2FibGVGb3JXb3Jrc3BhY2UnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKERpc2FibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24uSUQsIGxvY2FsaXplKCdkaXNhYmxlRm9yV29ya3NwYWNlJywgXCJEaXNhYmxlIChXb3Jrc3BhY2UpXCIpLCBNY3BTZXJ2ZXJBY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnZGlzYWJsZUZvcldvcmtzcGFjZVRvb2x0aXAnLCBcIkRpc2FibGUgdGhpcyBNQ1Agc2VydmVyIG9ubHkgaW4gdGhpcyB3b3Jrc3BhY2VcIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyPy5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpLmZpbmQocyA9PiBzLmRlZmluaXRpb24uaWQgPT09IHRoaXMubWNwU2VydmVyPy5pZCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW5hYmxlbWVudCA9IHNlcnZlci5lbmFibGVtZW50LmdldCgpO1xuXHRcdHRoaXMuZW5hYmxlZCA9IGlzQ29udHJpYnV0aW9uRW5hYmxlZChlbmFibGVtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubWNwU2VydmljZS5lbmFibGVtZW50TW9kZWwuc2V0RW5hYmxlZCh0aGlzLm1jcFNlcnZlci5pZCwgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRW5hYmxlTWNwRHJvcERvd25BY3Rpb24gZXh0ZW5kcyBCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ21jcFNlcnZlci5lbmFibGUnLCBNY3BTZXJ2ZXJBY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTLCBbXG5cdFx0XHRbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVuYWJsZU1jcFNlcnZlckdsb2JhbGx5QWN0aW9uKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5hYmxlTWNwU2VydmVyRm9yV29ya3NwYWNlQWN0aW9uKSxcblx0XHRcdF1cblx0XHRdKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlzYWJsZU1jcERyb3BEb3duQWN0aW9uIGV4dGVuZHMgQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdtY3BTZXJ2ZXIuZGlzYWJsZScsIE1jcFNlcnZlckFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1MsIFtcblx0XHRcdFtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZU1jcFNlcnZlckdsb2JhbGx5QWN0aW9uKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZU1jcFNlcnZlckZvcldvcmtzcGFjZUFjdGlvbiksXG5cdFx0XHRdXG5cdFx0XSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbnRleHRNZW51QWN0aW9ucyhtY3BTZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIsIGlzRWRpdG9yQWN0aW9uOiBib29sZWFuLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogSUFjdGlvbltdW10ge1xuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSk7XG5cblx0XHRjb25zdCBncm91cHM6IE1jcFNlcnZlckFjdGlvbltdW10gPSBbXTtcblx0XHRjb25zdCBpc0luc3RhbGxlZCA9IG1jcFNlcnZlci5pbnN0YWxsU3RhdGUgPT09IE1jcFNlcnZlckluc3RhbGxTdGF0ZS5JbnN0YWxsZWQ7XG5cblx0XHRpZiAoaXNJbnN0YWxsZWQpIHtcblx0XHRcdGdyb3Vwcy5wdXNoKFtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3RhcnRTZXJ2ZXJBY3Rpb24pLFxuXHRcdFx0XSk7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0b3BTZXJ2ZXJBY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXN0YXJ0U2VydmVyQWN0aW9uKSxcblx0XHRcdF0pO1xuXHRcdFx0Z3JvdXBzLnB1c2goW1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVNY3BTZXJ2ZXJHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVuYWJsZU1jcFNlcnZlckZvcldvcmtzcGFjZUFjdGlvbiksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpc2FibGVNY3BTZXJ2ZXJHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpc2FibGVNY3BTZXJ2ZXJGb3JXb3Jrc3BhY2VBY3Rpb24pLFxuXHRcdFx0XSk7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEF1dGhTZXJ2ZXJBY3Rpb24pLFxuXHRcdFx0XSk7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNob3dTZXJ2ZXJPdXRwdXRBY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaG93U2VydmVyQ29uZmlndXJhdGlvbkFjdGlvbiksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNob3dTZXJ2ZXJKc29uQ29uZmlndXJhdGlvbkFjdGlvbiksXG5cdFx0XHRdKTtcblx0XHRcdGdyb3Vwcy5wdXNoKFtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29uZmlndXJlTW9kZWxBY2Nlc3NBY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaG93U2FtcGxpbmdSZXF1ZXN0c0FjdGlvbiksXG5cdFx0XHRdKTtcblx0XHRcdGdyb3Vwcy5wdXNoKFtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJvd3NlUmVzb3VyY2VzQWN0aW9uKSxcblx0XHRcdF0pO1xuXHRcdFx0aWYgKCFpc0VkaXRvckFjdGlvbikge1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsR3JvdXA6IE1jcFNlcnZlckFjdGlvbltdID0gW2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVuaW5zdGFsbEFjdGlvbildO1xuXHRcdFx0XHRpZiAod29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0XHRcdGluc3RhbGxHcm91cC5wdXNoKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxJbldvcmtzcGFjZUFjdGlvbiwgZmFsc2UpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiBtY3BTZXJ2ZXIubG9jYWw/LnNjb3BlICE9PSBMb2NhbE1jcFNlcnZlclNjb3BlLlJlbW90ZVVzZXIpIHtcblx0XHRcdFx0XHRpbnN0YWxsR3JvdXAucHVzaChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsSW5SZW1vdGVBY3Rpb24sIGZhbHNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z3JvdXBzLnB1c2goaW5zdGFsbEdyb3VwKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaW5zdGFsbEdyb3VwID0gW107XG5cdFx0XHRpZiAod29ya3NwYWNlU2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0XHRpbnN0YWxsR3JvdXAucHVzaChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsSW5Xb3Jrc3BhY2VBY3Rpb24sICFpc0VkaXRvckFjdGlvbikpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0aW5zdGFsbEdyb3VwLnB1c2goaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEluUmVtb3RlQWN0aW9uLCAhaXNFZGl0b3JBY3Rpb24pKTtcblx0XHRcdH1cblx0XHRcdGdyb3Vwcy5wdXNoKGluc3RhbGxHcm91cCk7XG5cdFx0fVxuXHRcdGdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IGdyb3VwLmZvckVhY2goZXh0ZW5zaW9uQWN0aW9uID0+IGV4dGVuc2lvbkFjdGlvbi5tY3BTZXJ2ZXIgPSBtY3BTZXJ2ZXIpKTtcblxuXHRcdHJldHVybiBncm91cHM7XG5cdH0pO1xufVxuXG5leHBvcnQgY2xhc3MgTWFuYWdlTWNwU2VydmVyQWN0aW9uIGV4dGVuZHMgRHJvcERvd25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdtY3BTZXJ2ZXIubWFuYWdlJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDbGFzcyA9IGAke01jcFNlcnZlckFjdGlvbi5JQ09OX0FDVElPTl9DTEFTU30gbWFuYWdlIGAgKyBUaGVtZUljb24uYXNDbGFzc05hbWUobWFuYWdlRXh0ZW5zaW9uSWNvbik7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhpZGVNYW5hZ2VFeHRlbnNpb25DbGFzcyA9IGAke3RoaXMuQ2xhc3N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNFZGl0b3JBY3Rpb246IGJvb2xlYW4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHN1cGVyKE1hbmFnZU1jcFNlcnZlckFjdGlvbi5JRCwgJycsICcnLCB0cnVlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ21hbmFnZScsIFwiTWFuYWdlXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHN1cGVyLnJ1bih0aGlzLm1jcFNlcnZlciA/IGdldENvbnRleHRNZW51QWN0aW9ucyh0aGlzLm1jcFNlcnZlciwgdGhpcy5pc0VkaXRvckFjdGlvbiwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSkgOiBbXSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGFzcyA9IE1hbmFnZU1jcFNlcnZlckFjdGlvbi5IaWRlTWFuYWdlRXh0ZW5zaW9uQ2xhc3M7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pc0VkaXRvckFjdGlvbikge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuY2xhc3MgPSBNYW5hZ2VNY3BTZXJ2ZXJBY3Rpb24uQ2xhc3M7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9ICEhdGhpcy5tY3BTZXJ2ZXIubG9jYWw7XG5cdFx0XHR0aGlzLmNsYXNzID0gdGhpcy5lbmFibGVkID8gTWFuYWdlTWNwU2VydmVyQWN0aW9uLkNsYXNzIDogTWFuYWdlTWNwU2VydmVyQWN0aW9uLkhpZGVNYW5hZ2VFeHRlbnNpb25DbGFzcztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0YXJ0U2VydmVyQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHt0aGlzLkxBQkVMX0FDVElPTl9DTEFTU30gcHJvbWluZW50IHN0YXJ0YDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5zdGFydCcsIGxvY2FsaXplKCdzdGFydCcsIFwiU3RhcnQgU2VydmVyXCIpLCBTdGFydFNlcnZlckFjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFN0YXJ0U2VydmVyQWN0aW9uLkhJREU7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXJTdGF0ZSA9IHNlcnZlci5jb25uZWN0aW9uU3RhdGUuZ2V0KCk7XG5cdFx0aWYgKCFNY3BDb25uZWN0aW9uU3RhdGUuY2FuQmVTdGFydGVkKHNlcnZlclN0YXRlLnN0YXRlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNsYXNzID0gU3RhcnRTZXJ2ZXJBY3Rpb24uQ0xBU1M7XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmxhYmVsID0gbG9jYWxpemUoJ3N0YXJ0JywgXCJTdGFydCBTZXJ2ZXJcIik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBzZXJ2ZXIuc3RhcnQoeyBwcm9tcHRUeXBlOiAnYWxsLXVudHJ1c3RlZCcgfSk7XG5cdFx0c2VydmVyLnNob3dPdXRwdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VydmVyKCk6IElNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlci5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXI/LmlkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RvcFNlcnZlckFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBzdG9wYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5zdG9wJywgbG9jYWxpemUoJ3N0b3AnLCBcIlN0b3AgU2VydmVyXCIpLCBTdG9wU2VydmVyQWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gU3RvcFNlcnZlckFjdGlvbi5ISURFO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyU3RhdGUgPSBzZXJ2ZXIuY29ubmVjdGlvblN0YXRlLmdldCgpO1xuXHRcdGlmIChNY3BDb25uZWN0aW9uU3RhdGUuY2FuQmVTdGFydGVkKHNlcnZlclN0YXRlLnN0YXRlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNsYXNzID0gU3RvcFNlcnZlckFjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMubGFiZWwgPSBsb2NhbGl6ZSgnc3RvcCcsIFwiU3RvcCBTZXJ2ZXJcIik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBzZXJ2ZXIuc3RvcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXJ2ZXIoKTogSU1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMubWNwU2VydmVyLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSB0aGlzLm1jcFNlcnZlcj8uaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXN0YXJ0U2VydmVyQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHt0aGlzLkxBQkVMX0FDVElPTl9DTEFTU30gcHJvbWluZW50IHJlc3RhcnRgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBISURFID0gYCR7dGhpcy5DTEFTU30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLnJlc3RhcnQnLCBsb2NhbGl6ZSgncmVzdGFydCcsIFwiUmVzdGFydCBTZXJ2ZXJcIiksIFJlc3RhcnRTZXJ2ZXJBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBSZXN0YXJ0U2VydmVyQWN0aW9uLkhJREU7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXJTdGF0ZSA9IHNlcnZlci5jb25uZWN0aW9uU3RhdGUuZ2V0KCk7XG5cdFx0aWYgKE1jcENvbm5lY3Rpb25TdGF0ZS5jYW5CZVN0YXJ0ZWQoc2VydmVyU3RhdGUuc3RhdGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2xhc3MgPSBSZXN0YXJ0U2VydmVyQWN0aW9uLkNMQVNTO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5sYWJlbCA9IGxvY2FsaXplKCdyZXN0YXJ0JywgXCJSZXN0YXJ0IFNlcnZlclwiKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcigpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHNlcnZlci5zdG9wKCk7XG5cdFx0YXdhaXQgc2VydmVyLnN0YXJ0KHsgcHJvbXB0VHlwZTogJ2FsbC11bnRydXN0ZWQnIH0pO1xuXHRcdHNlcnZlci5zaG93T3V0cHV0KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlcnZlcigpOiBJTWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpLmZpbmQocyA9PiBzLmRlZmluaXRpb24uaWQgPT09IHRoaXMubWNwU2VydmVyPy5pZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEF1dGhTZXJ2ZXJBY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgYWNjb3VudGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTSUdOX09VVCA9IGxvY2FsaXplKCdtY3Auc2lnbk91dCcsICdTaWduIE91dCcpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBESVNDT05ORUNUID0gbG9jYWxpemUoJ21jcC5kaXNjb25uZWN0JywgJ0Rpc2Nvbm5lY3QgQWNjb3VudCcpO1xuXG5cdHByaXZhdGUgX2FjY291bnRRdWVyeTogSUFjY291bnRRdWVyeSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uUXVlcnlTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25RdWVyeVNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLnJlc3RhcnQnLCBsb2NhbGl6ZSgncmVzdGFydCcsIFwiUmVzdGFydCBTZXJ2ZXJcIiksIFJlc3RhcnRTZXJ2ZXJBY3Rpb24uQ0xBU1MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBBdXRoU2VydmVyQWN0aW9uLkhJREU7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY2NvdW50UXVlcnkgPSB0aGlzLmdldEFjY291bnRRdWVyeSgpO1xuXHRcdGlmICghYWNjb3VudFF1ZXJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FjY291bnRRdWVyeSA9IGFjY291bnRRdWVyeTtcblx0XHR0aGlzLmNsYXNzID0gQXV0aFNlcnZlckFjdGlvbi5DTEFTUztcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdGxldCBsYWJlbCA9IGFjY291bnRRdWVyeS5lbnRpdGllcygpLmdldEVudGl0eUNvdW50KCkudG90YWwgPiAxID8gQXV0aFNlcnZlckFjdGlvbi5ESVNDT05ORUNUIDogQXV0aFNlcnZlckFjdGlvbi5TSUdOX09VVDtcblx0XHRsYWJlbCArPSBgICgke2FjY291bnRRdWVyeS5hY2NvdW50TmFtZX0pYDtcblx0XHR0aGlzLmxhYmVsID0gbGFiZWw7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY2NvdW50UXVlcnkgPSB0aGlzLmdldEFjY291bnRRdWVyeSgpO1xuXHRcdGlmICghYWNjb3VudFF1ZXJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHNlcnZlci5zdG9wKCk7XG5cdFx0Y29uc3QgeyBwcm92aWRlcklkLCBhY2NvdW50TmFtZSB9ID0gYWNjb3VudFF1ZXJ5O1xuXHRcdGFjY291bnRRdWVyeS5tY3BTZXJ2ZXIoc2VydmVyLmRlZmluaXRpb24uaWQpLnNldEFjY2Vzc0FsbG93ZWQoZmFsc2UsIHNlcnZlci5kZWZpbml0aW9uLmxhYmVsKTtcblx0XHRpZiAodGhpcy5sYWJlbCA9PT0gQXV0aFNlcnZlckFjdGlvbi5TSUdOX09VVCkge1xuXHRcdFx0Y29uc3QgYWNjb3VudHMgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UuZ2V0QWNjb3VudHMocHJvdmlkZXJJZCk7XG5cdFx0XHRjb25zdCBhY2NvdW50ID0gYWNjb3VudHMuZmluZChhID0+IGEubGFiZWwgPT09IGFjY291bnROYW1lKTtcblx0XHRcdGlmIChhY2NvdW50KSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVySWQsIHVuZGVmaW5lZCwgeyBhY2NvdW50IH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2UucmVtb3ZlU2Vzc2lvbihwcm92aWRlcklkLCBzZXNzaW9uLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VydmVyKCk6IElNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlci5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXI/LmlkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWNjb3VudFF1ZXJ5KCk6IElBY2NvdW50UXVlcnkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hY2NvdW50UXVlcnkpIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY2NvdW50UXVlcnk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlcnZlcklkID0gc2VydmVyLmRlZmluaXRpb24uaWQ7XG5cdFx0Y29uc3QgcHJlZmVyZW5jZXMgPSB0aGlzLl9hdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZS5tY3BTZXJ2ZXIoc2VydmVySWQpLmdldEFsbEFjY291bnRQcmVmZXJlbmNlcygpO1xuXHRcdGlmICghcHJlZmVyZW5jZXMuc2l6ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbcHJvdmlkZXJJZCwgYWNjb3VudE5hbWVdIG9mIHByZWZlcmVuY2VzKSB7XG5cdFx0XHRjb25zdCBhY2NvdW50UXVlcnkgPSB0aGlzLl9hdXRoZW50aWNhdGlvblF1ZXJ5U2VydmljZS5wcm92aWRlcihwcm92aWRlcklkKS5hY2NvdW50KGFjY291bnROYW1lKTtcblx0XHRcdGlmICghYWNjb3VudFF1ZXJ5Lm1jcFNlcnZlcihzZXJ2ZXJJZCkuaXNBY2Nlc3NBbGxvd2VkKCkpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIHNraXAgYWNjb3VudHMgdGhhdCBhcmUgbm90IGFsbG93ZWRcblx0XHRcdH1cblx0XHRcdHJldHVybiBhY2NvdW50UXVlcnk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgU2hvd1NlcnZlck91dHB1dEFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBvdXRwdXRgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBISURFID0gYCR7dGhpcy5DTEFTU30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLm91dHB1dCcsIGxvY2FsaXplKCdvdXRwdXQnLCBcIlNob3cgT3V0cHV0XCIpLCBTaG93U2VydmVyT3V0cHV0QWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gU2hvd1NlcnZlck91dHB1dEFjdGlvbi5ISURFO1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IFNob3dTZXJ2ZXJPdXRwdXRBY3Rpb24uQ0xBU1M7XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmxhYmVsID0gbG9jYWxpemUoJ291dHB1dCcsIFwiU2hvdyBPdXRwdXRcIik7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzZXJ2ZXIuc2hvd091dHB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXJ2ZXIoKTogSU1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMubWNwU2VydmVyLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSB0aGlzLm1jcFNlcnZlcj8uaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaG93U2VydmVyQ29uZmlndXJhdGlvbkFjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBjb25maWdgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBISURFID0gYCR7dGhpcy5DTEFTU30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuY29uZmlnJywgbG9jYWxpemUoJ2NvbmZpZycsIFwiU2hvdyBDb25maWd1cmF0aW9uXCIpLCBTaG93U2VydmVyQ29uZmlndXJhdGlvbkFjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFNob3dTZXJ2ZXJDb25maWd1cmF0aW9uQWN0aW9uLkhJREU7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IFNob3dTZXJ2ZXJDb25maWd1cmF0aW9uQWN0aW9uLkNMQVNTO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5tY3BXb3JrYmVuY2hTZXJ2aWNlLm9wZW4odGhpcy5tY3BTZXJ2ZXIsIHsgdGFiOiBNY3BTZXJ2ZXJFZGl0b3JUYWIuQ29uZmlndXJhdGlvbiB9KTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBTaG93U2VydmVySnNvbkNvbmZpZ3VyYXRpb25BY3Rpb24gZXh0ZW5kcyBNY3BTZXJ2ZXJBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgY29uZmlnYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSElERSA9IGAke3RoaXMuQ0xBU1N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHRcdEBJTWNwUmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBtY3BSZWdpc3RyeTogSU1jcFJlZ2lzdHJ5LFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5qc29uQ29uZmlnJywgbG9jYWxpemUoJ2NvbmZpZ0pzb24nLCBcIlNob3cgQ29uZmlndXJhdGlvbiAoSlNPTilcIiksIFNob3dTZXJ2ZXJKc29uQ29uZmlndXJhdGlvbkFjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFNob3dTZXJ2ZXJKc29uQ29uZmlndXJhdGlvbkFjdGlvbi5ISURFO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25UYXJnZXQgPSB0aGlzLmdldENvbmZpZ3VyYXRpb25UYXJnZXQoKTtcblx0XHRpZiAoIWNvbmZpZ3VyYXRpb25UYXJnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jbGFzcyA9IFNob3dTZXJ2ZXJDb25maWd1cmF0aW9uQWN0aW9uLkNMQVNTO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblRhcmdldCA9IHRoaXMuZ2V0Q29uZmlndXJhdGlvblRhcmdldCgpO1xuXHRcdGlmICghY29uZmlndXJhdGlvblRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogVVJJLmlzVXJpKGNvbmZpZ3VyYXRpb25UYXJnZXQpID8gY29uZmlndXJhdGlvblRhcmdldCA6IGNvbmZpZ3VyYXRpb25UYXJnZXQhLnVyaSxcblx0XHRcdG9wdGlvbnM6IHsgc2VsZWN0aW9uOiBVUkkuaXNVcmkoY29uZmlndXJhdGlvblRhcmdldCkgPyB1bmRlZmluZWQgOiBjb25maWd1cmF0aW9uVGFyZ2V0IS5yYW5nZSB9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpZ3VyYXRpb25UYXJnZXQoKTogTG9jYXRpb24gfCBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlci5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmxhYmVsID09PSB0aGlzLm1jcFNlcnZlcj8ubmFtZSk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IHRoaXMubWNwUmVnaXN0cnkuY29sbGVjdGlvbnMuZ2V0KCkuZmluZChjID0+IGMuaWQgPT09IHNlcnZlci5jb2xsZWN0aW9uLmlkKTtcblx0XHRjb25zdCBzZXJ2ZXJEZWZpbml0aW9uID0gY29sbGVjdGlvbj8uc2VydmVyRGVmaW5pdGlvbnMuZ2V0KCkuZmluZChzID0+IHMuaWQgPT09IHNlcnZlci5kZWZpbml0aW9uLmlkKTtcblx0XHRyZXR1cm4gc2VydmVyRGVmaW5pdGlvbj8ucHJlc2VudGF0aW9uPy5vcmlnaW4gfHwgY29sbGVjdGlvbj8ucHJlc2VudGF0aW9uPy5vcmlnaW47XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyZU1vZGVsQWNjZXNzQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHt0aGlzLkxBQkVMX0FDVElPTl9DTEFTU30gcHJvbWluZW50IGNvbmZpZ2A7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1jcFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuY29uZmlnJywgbG9jYWxpemUoJ21jcC5jb25maWdBY2Nlc3MnLCAnQ29uZmlndXJlIE1vZGVsIEFjY2VzcycpLCBDb25maWd1cmVNb2RlbEFjY2Vzc0FjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IENvbmZpZ3VyZU1vZGVsQWNjZXNzQWN0aW9uLkhJREU7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNsYXNzID0gQ29uZmlndXJlTW9kZWxBY2Nlc3NBY3Rpb24uQ0xBU1M7XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmxhYmVsID0gbG9jYWxpemUoJ21jcC5jb25maWdBY2Nlc3MnLCAnQ29uZmlndXJlIE1vZGVsIEFjY2VzcycpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuZ2V0U2VydmVyKCk7XG5cdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkNvbmZpZ3VyZVNhbXBsaW5nTW9kZWxzLCBzZXJ2ZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXJ2ZXIoKTogSU1jcFNlcnZlciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMubWNwU2VydmVyLmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1jcFNlcnZpY2Uuc2VydmVycy5nZXQoKS5maW5kKHMgPT4gcy5kZWZpbml0aW9uLmlkID09PSB0aGlzLm1jcFNlcnZlcj8uaWQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaG93U2FtcGxpbmdSZXF1ZXN0c0FjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBjb25maWdgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBISURFID0gYCR7dGhpcy5DTEFTU30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElNY3BTYW1wbGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzYW1wbGluZ1NlcnZpY2U6IElNY3BTYW1wbGluZ1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmNvbmZpZycsIGxvY2FsaXplKCdtY3Auc2FtcGxpbmdMb2cnLCAnU2hvdyBTYW1wbGluZyBSZXF1ZXN0cycpLCBTaG93U2FtcGxpbmdSZXF1ZXN0c0FjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFNob3dTYW1wbGluZ1JlcXVlc3RzQWN0aW9uLkhJREU7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuc2FtcGxpbmdTZXJ2aWNlLmhhc0xvZ3Moc2VydmVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNsYXNzID0gU2hvd1NhbXBsaW5nUmVxdWVzdHNBY3Rpb24uQ0xBU1M7XG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXIgPSB0aGlzLmdldFNlcnZlcigpO1xuXHRcdGlmICghc2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5zYW1wbGluZ1NlcnZpY2UuaGFzTG9ncyhzZXJ2ZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRjb250ZW50czogdGhpcy5zYW1wbGluZ1NlcnZpY2UuZ2V0TG9nVGV4dChzZXJ2ZXIpLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3Auc2FtcGxpbmdMb2cudGl0bGUnLCAnTUNQIFNhbXBsaW5nOiB7MH0nLCBzZXJ2ZXIuZGVmaW5pdGlvbi5sYWJlbCksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlcnZlcigpOiBJTWNwU2VydmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMubWNwU2VydmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWNwU2VydmljZS5zZXJ2ZXJzLmdldCgpLmZpbmQocyA9PiBzLmRlZmluaXRpb24uaWQgPT09IHRoaXMubWNwU2VydmVyPy5pZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZVJlc291cmNlc0FjdGlvbiBleHRlbmRzIE1jcFNlcnZlckFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IENMQVNTID0gYCR7dGhpcy5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCBjb25maWdgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBISURFID0gYCR7dGhpcy5DTEFTU30gaGlkZWA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmNvbmZpZycsIGxvY2FsaXplKCdtY3AucmVzb3VyY2VzJywgJ0Jyb3dzZSBSZXNvdXJjZXMnKSwgQnJvd3NlUmVzb3VyY2VzQWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gQnJvd3NlUmVzb3VyY2VzQWN0aW9uLkhJREU7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSBzZXJ2ZXIuY2FwYWJpbGl0aWVzLmdldCgpO1xuXHRcdGlmIChjYXBhYmlsaXRpZXMgIT09IHVuZGVmaW5lZCAmJiAhKGNhcGFiaWxpdGllcyAmIE1jcENhcGFiaWxpdHkuUmVzb3VyY2VzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNsYXNzID0gQnJvd3NlUmVzb3VyY2VzQWN0aW9uLkNMQVNTO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gdGhpcy5nZXRTZXJ2ZXIoKTtcblx0XHRpZiAoIXNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSBzZXJ2ZXIuY2FwYWJpbGl0aWVzLmdldCgpO1xuXHRcdGlmIChjYXBhYmlsaXRpZXMgIT09IHVuZGVmaW5lZCAmJiAhKGNhcGFiaWxpdGllcyAmIE1jcENhcGFiaWxpdHkuUmVzb3VyY2VzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNY3BDb21tYW5kSWRzLkJyb3dzZVJlc291cmNlcywgc2VydmVyKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VydmVyKCk6IElNY3BTZXJ2ZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5tY3BTZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlci5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5tY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmluZChzID0+IHMuZGVmaW5pdGlvbi5pZCA9PT0gdGhpcy5tY3BTZXJ2ZXI/LmlkKTtcblx0fVxufVxuXG5leHBvcnQgdHlwZSBNY3BTZXJ2ZXJTdGF0dXMgPSB7IHJlYWRvbmx5IG1lc3NhZ2U6IElNYXJrZG93blN0cmluZzsgcmVhZG9ubHkgaWNvbj86IFRoZW1lSWNvbiB9O1xuXG5leHBvcnQgY2xhc3MgTWNwU2VydmVyU3RhdHVzQWN0aW9uIGV4dGVuZHMgTWNwU2VydmVyQWN0aW9uIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke01jcFNlcnZlckFjdGlvbi5JQ09OX0FDVElPTl9DTEFTU30gZXh0ZW5zaW9uLXN0YXR1c2A7XG5cblx0cHJpdmF0ZSBfc3RhdHVzOiBNY3BTZXJ2ZXJTdGF0dXNbXSA9IFtdO1xuXHRnZXQgc3RhdHVzKCk6IE1jcFNlcnZlclN0YXR1c1tdIHsgcmV0dXJuIHRoaXMuX3N0YXR1czsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU3RhdHVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdHVzID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNY3BXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwV29ya2JlbmNoU2VydmljZTogSU1jcFdvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLnN0YXR1cycsICcnLCBgJHtNY3BTZXJ2ZXJTdGF0dXNBY3Rpb24uQ0xBU1N9IGhpZGVgLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXB1dGVBbmRVcGRhdGVTdGF0dXMoKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUFuZFVwZGF0ZVN0YXR1cygpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh1bmRlZmluZWQsIHRydWUpO1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKCF0aGlzLm1jcFNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICgodGhpcy5tY3BTZXJ2ZXIuZ2FsbGVyeSB8fCB0aGlzLm1jcFNlcnZlci5pbnN0YWxsYWJsZSkgJiYgdGhpcy5tY3BTZXJ2ZXIuaW5zdGFsbFN0YXRlID09PSBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUuVW5pbnN0YWxsZWQpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubWNwV29ya2JlbmNoU2VydmljZS5jYW5JbnN0YWxsKHRoaXMubWNwU2VydmVyKTtcblx0XHRcdGlmIChyZXN1bHQgIT09IHRydWUpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB3YXJuaW5nSWNvbiwgbWVzc2FnZTogcmVzdWx0IH0sIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcnVudGltZVN0YXRlID0gdGhpcy5tY3BTZXJ2ZXIucnVudGltZVN0YXR1cztcblx0XHRpZiAocnVudGltZVN0YXRlPy5tZXNzYWdlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHJ1bnRpbWVTdGF0ZS5tZXNzYWdlLnNldmVyaXR5ID09PSBTZXZlcml0eS5XYXJuaW5nID8gd2FybmluZ0ljb24gOiBydW50aW1lU3RhdGUubWVzc2FnZS5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuRXJyb3IgPyBlcnJvckljb24gOiBpbmZvSWNvbiwgbWVzc2FnZTogcnVudGltZVN0YXRlLm1lc3NhZ2UudGV4dCB9LCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXR1cyhzdGF0dXM6IE1jcFNlcnZlclN0YXR1cyB8IHVuZGVmaW5lZCwgdXBkYXRlQ2xhc3M6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoc3RhdHVzKSB7XG5cdFx0XHRpZiAodGhpcy5fc3RhdHVzLnNvbWUocyA9PiBzLm1lc3NhZ2UudmFsdWUgPT09IHN0YXR1cy5tZXNzYWdlLnZhbHVlICYmIHMuaWNvbj8uaWQgPT09IHN0YXR1cy5pY29uPy5pZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5fc3RhdHVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGF0dXMgPSBbXTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdHVzKSB7XG5cdFx0XHR0aGlzLl9zdGF0dXMucHVzaChzdGF0dXMpO1xuXHRcdFx0dGhpcy5fc3RhdHVzLnNvcnQoKGEsIGIpID0+XG5cdFx0XHRcdGIuaWNvbiA9PT0gdHJ1c3RJY29uID8gLTEgOlxuXHRcdFx0XHRcdGEuaWNvbiA9PT0gdHJ1c3RJY29uID8gMSA6XG5cdFx0XHRcdFx0XHRiLmljb24gPT09IGVycm9ySWNvbiA/IC0xIDpcblx0XHRcdFx0XHRcdFx0YS5pY29uID09PSBlcnJvckljb24gPyAxIDpcblx0XHRcdFx0XHRcdFx0XHRiLmljb24gPT09IHdhcm5pbmdJY29uID8gLTEgOlxuXHRcdFx0XHRcdFx0XHRcdFx0YS5pY29uID09PSB3YXJuaW5nSWNvbiA/IDEgOlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRiLmljb24gPT09IGluZm9JY29uID8gLTEgOlxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGEuaWNvbiA9PT0gaW5mb0ljb24gPyAxIDpcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdDBcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0aWYgKHVwZGF0ZUNsYXNzKSB7XG5cdFx0XHRpZiAoc3RhdHVzPy5pY29uID09PSBlcnJvckljb24pIHtcblx0XHRcdFx0dGhpcy5jbGFzcyA9IGAke01jcFNlcnZlclN0YXR1c0FjdGlvbi5DTEFTU30gZXh0ZW5zaW9uLXN0YXR1cy1lcnJvciAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShlcnJvckljb24pfWA7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChzdGF0dXM/Lmljb24gPT09IHdhcm5pbmdJY29uKSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtNY3BTZXJ2ZXJTdGF0dXNBY3Rpb24uQ0xBU1N9IGV4dGVuc2lvbi1zdGF0dXMtd2FybmluZyAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZSh3YXJuaW5nSWNvbil9YDtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYgKHN0YXR1cz8uaWNvbiA9PT0gaW5mb0ljb24pIHtcblx0XHRcdFx0dGhpcy5jbGFzcyA9IGAke01jcFNlcnZlclN0YXR1c0FjdGlvbi5DTEFTU30gZXh0ZW5zaW9uLXN0YXR1cy1pbmZvICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGluZm9JY29uKX1gO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoc3RhdHVzPy5pY29uID09PSB0cnVzdEljb24pIHtcblx0XHRcdFx0dGhpcy5jbGFzcyA9IGAke01jcFNlcnZlclN0YXR1c0FjdGlvbi5DTEFTU30gJHtUaGVtZUljb24uYXNDbGFzc05hbWUodHJ1c3RJY29uKX1gO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtNY3BTZXJ2ZXJTdGF0dXNBY3Rpb24uQ0xBU1N9IGhpZGVgO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXR1cy5maXJlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXR1c1swXT8uaWNvbiA9PT0gdHJ1c3RJY29uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLnRydXN0Lm1hbmFnZScpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUE4QztBQUN2RCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxRQUFxQyxpQkFBaUI7QUFDL0QsU0FBUyxTQUFTLGFBQWE7QUFFL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQXdCLG1DQUFtQztBQUMzRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFdBQVcsVUFBVSxxQkFBcUIsV0FBVyxtQkFBbUI7QUFDakYsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBc0QsYUFBYSxzQkFBMkMsZUFBZSxvQkFBb0Isb0JBQW9CLDZCQUE2QjtBQUMzTSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUE0QyxzQkFBc0I7QUFDM0UsU0FBUywwQkFBeUM7QUFDbEQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxlQUFlO0FBQ3hCLFNB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
