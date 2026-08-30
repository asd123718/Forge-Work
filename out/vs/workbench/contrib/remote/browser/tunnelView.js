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
import "./media/tunnelView.css";
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IContextKeyService, RawContextKey, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ICommandService, CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { Event } from "../../../../base/common/event.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { toDisposable, dispose, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { IMenuService, MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { createActionViewItem, getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IRemoteExplorerService, TunnelType, TUNNEL_VIEW_ID, TunnelEditId } from "../../../services/remote/common/remoteExplorerService.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { URI } from "../../../../base/common/uri.js";
import { isAllInterfaces, isLocalhost, isRemoteTunnel, ITunnelService, TunnelPrivacyId, TunnelProtocol } from "../../../../platform/tunnel/common/tunnel.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { copyAddressIcon, forwardedPortWithoutProcessIcon, forwardedPortWithProcessIcon, forwardPortIcon, labelPortIcon, openBrowserIcon, openPreviewIcon, portsViewIcon, privatePortIcon, stopForwardIcon } from "./remoteIcons.js";
import { IExternalUriOpenerService } from "../../externalUriOpener/common/externalUriOpenerService.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { STATUS_BAR_REMOTE_ITEM_BACKGROUND } from "../../../common/theme.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { defaultButtonStyles, defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { TunnelCloseReason, TunnelSource, forwardedPortsViewEnabled, makeAddress, mapHasAddressLocalhostOrAllInterfaces, parseAddress } from "../../../services/remote/common/tunnelModel.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
const openPreviewEnabledContext = new RawContextKey("openPreviewEnabled", false);
class TunnelTreeVirtualDelegate {
  constructor(remoteExplorerService) {
    this.remoteExplorerService = remoteExplorerService;
    this.headerRowHeight = 22;
  }
  getHeight(row) {
    return row.tunnelType === TunnelType.Add && !this.remoteExplorerService.getEditableData(void 0) ? 30 : 22;
  }
}
let TunnelViewModel = class {
  constructor(remoteExplorerService, tunnelService) {
    this.remoteExplorerService = remoteExplorerService;
    this.tunnelService = tunnelService;
    this._candidates = /* @__PURE__ */ new Map();
    this.input = {
      label: nls.localize("remote.tunnelsView.addPort", "Add Port"),
      icon: void 0,
      tunnelType: TunnelType.Add,
      hasRunningProcess: false,
      remoteHost: "",
      remotePort: 0,
      processDescription: "",
      tooltipPostfix: "",
      iconTooltip: "",
      portTooltip: "",
      processTooltip: "",
      originTooltip: "",
      privacyTooltip: "",
      source: { source: TunnelSource.User, description: "" },
      protocol: TunnelProtocol.Http,
      privacy: {
        id: TunnelPrivacyId.Private,
        themeIcon: privatePortIcon.id,
        label: nls.localize("tunnelPrivacy.private", "Private")
      },
      strip: () => void 0
    };
    this.model = remoteExplorerService.tunnelModel;
    this.onForwardedPortsChanged = Event.any(this.model.onForwardPort, this.model.onClosePort, this.model.onPortName, this.model.onCandidatesChanged);
  }
  get all() {
    const result = [];
    this._candidates = /* @__PURE__ */ new Map();
    this.model.candidates.forEach((candidate) => {
      this._candidates.set(makeAddress(candidate.host, candidate.port), candidate);
    });
    if (this.model.forwarded.size > 0 || this.remoteExplorerService.getEditableData(void 0)) {
      result.push(...this.forwarded);
    }
    if (this.model.detected.size > 0) {
      result.push(...this.detected);
    }
    result.push(this.input);
    return result;
  }
  addProcessInfoFromCandidate(tunnelItem) {
    const key = makeAddress(tunnelItem.remoteHost, tunnelItem.remotePort);
    if (this._candidates.has(key)) {
      tunnelItem.processDescription = this._candidates.get(key).detail;
    }
  }
  get forwarded() {
    const forwarded = Array.from(this.model.forwarded.values()).map((tunnel) => {
      const tunnelItem = TunnelItem.createFromTunnel(this.remoteExplorerService, this.tunnelService, tunnel);
      this.addProcessInfoFromCandidate(tunnelItem);
      return tunnelItem;
    }).sort((a, b) => {
      if (a.remotePort === b.remotePort) {
        return a.remoteHost < b.remoteHost ? -1 : 1;
      } else {
        return a.remotePort < b.remotePort ? -1 : 1;
      }
    });
    return forwarded;
  }
  get detected() {
    return Array.from(this.model.detected.values()).map((tunnel) => {
      const tunnelItem = TunnelItem.createFromTunnel(this.remoteExplorerService, this.tunnelService, tunnel, TunnelType.Detected, false);
      this.addProcessInfoFromCandidate(tunnelItem);
      return tunnelItem;
    });
  }
  isEmpty() {
    return this.detected.length === 0 && (this.forwarded.length === 0 || this.forwarded.length === 1 && this.forwarded[0].tunnelType === TunnelType.Add && !this.remoteExplorerService.getEditableData(void 0));
  }
};
TunnelViewModel = __decorateClass([
  __decorateParam(0, IRemoteExplorerService),
  __decorateParam(1, ITunnelService)
], TunnelViewModel);
function emptyCell(item) {
  return { label: "", tunnel: item, editId: TunnelEditId.None, tooltip: "" };
}
class IconColumn {
  constructor() {
    this.label = "";
    this.tooltip = "";
    this.weight = 1;
    this.minimumWidth = 40;
    this.maximumWidth = 40;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const icon = row.processDescription ? forwardedPortWithProcessIcon : forwardedPortWithoutProcessIcon;
    let tooltip = "";
    if (row instanceof TunnelItem) {
      tooltip = `${row.iconTooltip} ${row.tooltipPostfix}`;
    }
    return {
      label: "",
      icon,
      tunnel: row,
      editId: TunnelEditId.None,
      tooltip
    };
  }
}
class PortColumn {
  constructor() {
    this.label = nls.localize("tunnel.portColumn.label", "Port");
    this.tooltip = nls.localize("tunnel.portColumn.tooltip", "The label and remote port number of the forwarded port.");
    this.weight = 1;
    this.templateId = "actionbar";
  }
  project(row) {
    const isAdd = row.tunnelType === TunnelType.Add;
    const label = row.label;
    let tooltip = "";
    if (row instanceof TunnelItem && !isAdd) {
      tooltip = `${row.portTooltip} ${row.tooltipPostfix}`;
    } else {
      tooltip = label;
    }
    return {
      label,
      tunnel: row,
      menuId: MenuId.TunnelPortInline,
      editId: row.tunnelType === TunnelType.Add ? TunnelEditId.New : TunnelEditId.Label,
      tooltip
    };
  }
}
class LocalAddressColumn {
  constructor() {
    this.label = nls.localize("tunnel.addressColumn.label", "Forwarded Address");
    this.tooltip = nls.localize("tunnel.addressColumn.tooltip", "The address that the forwarded port is available at.");
    this.weight = 1;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const label = row.localAddress ?? "";
    let tooltip = label;
    if (row instanceof TunnelItem) {
      tooltip = row.tooltipPostfix;
    }
    return {
      label,
      menuId: MenuId.TunnelLocalAddressInline,
      tunnel: row,
      editId: TunnelEditId.LocalPort,
      tooltip,
      markdownTooltip: label ? LocalAddressColumn.getHoverText(label) : void 0
    };
  }
  static getHoverText(localAddress) {
    return function(configurationService) {
      const editorConf = configurationService.getValue("editor");
      let clickLabel = "";
      if (editorConf.multiCursorModifier === "ctrlCmd") {
        if (isMacintosh) {
          clickLabel = nls.localize("portsLink.followLinkAlt.mac", "option + click");
        } else {
          clickLabel = nls.localize("portsLink.followLinkAlt", "alt + click");
        }
      } else {
        if (isMacintosh) {
          clickLabel = nls.localize("portsLink.followLinkCmd", "cmd + click");
        } else {
          clickLabel = nls.localize("portsLink.followLinkCtrl", "ctrl + click");
        }
      }
      const markdown = new MarkdownString("", true);
      const uri = localAddress.startsWith("http") ? localAddress : `http://${localAddress}`;
      return markdown.appendLink(uri, "Follow link").appendMarkdown(` (${clickLabel})`);
    };
  }
}
class RunningProcessColumn {
  constructor() {
    this.label = nls.localize("tunnel.processColumn.label", "Running Process");
    this.tooltip = nls.localize("tunnel.processColumn.tooltip", "The command line of the process that is using the port.");
    this.weight = 2;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const label = row.processDescription ?? "";
    return { label, tunnel: row, editId: TunnelEditId.None, tooltip: row instanceof TunnelItem ? row.processTooltip : "" };
  }
}
class OriginColumn {
  constructor() {
    this.label = nls.localize("tunnel.originColumn.label", "Origin");
    this.tooltip = nls.localize("tunnel.originColumn.tooltip", "The source that a forwarded port originates from. Can be an extension, user forwarded, statically forwarded, or automatically forwarded.");
    this.weight = 1;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const label = row.source.description;
    const tooltip = `${row instanceof TunnelItem ? row.originTooltip : ""}. ${row instanceof TunnelItem ? row.tooltipPostfix : ""}`;
    return { label, menuId: MenuId.TunnelOriginInline, tunnel: row, editId: TunnelEditId.None, tooltip };
  }
}
class PrivacyColumn {
  constructor() {
    this.label = nls.localize("tunnel.privacyColumn.label", "Visibility");
    this.tooltip = nls.localize("tunnel.privacyColumn.tooltip", "The availability of the forwarded port.");
    this.weight = 1;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const label = row.privacy?.label;
    let tooltip = "";
    if (row instanceof TunnelItem) {
      tooltip = `${row.privacy.label} ${row.tooltipPostfix}`;
    }
    return { label, tunnel: row, icon: { id: row.privacy.themeIcon }, editId: TunnelEditId.None, tooltip };
  }
}
let ActionBarRenderer = class {
  constructor(instantiationService, contextKeyService, menuService, contextViewService, remoteExplorerService, commandService, configurationService) {
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this.contextViewService = contextViewService;
    this.remoteExplorerService = remoteExplorerService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.templateId = "actionbar";
    this._hoverDelegate = getDefaultHoverDelegate("mouse");
  }
  set actionRunner(actionRunner) {
    this._actionRunner = actionRunner;
  }
  renderTemplate(container) {
    const cell = dom.append(container, dom.$(".ports-view-actionbar-cell"));
    const icon = dom.append(cell, dom.$(".ports-view-actionbar-cell-icon"));
    const templateDisposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    templateDisposables.add(elementDisposables);
    const label = templateDisposables.add(new IconLabel(
      cell,
      {
        supportHighlights: true,
        hoverDelegate: this._hoverDelegate
      }
    ));
    const actionsContainer = dom.append(cell, dom.$(".actions"));
    const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
      actionViewItemProvider: createActionViewItem.bind(void 0, this.instantiationService),
      hoverDelegate: this._hoverDelegate
    }));
    return { label, icon, actionBar, container: cell, templateDisposables, elementDisposables };
  }
  renderElement(element, index, templateData) {
    templateData.actionBar.clear();
    templateData.icon.className = "ports-view-actionbar-cell-icon";
    templateData.icon.style.display = "none";
    templateData.label.setLabel("");
    templateData.label.element.style.display = "none";
    templateData.container.style.height = "22px";
    if (templateData.button) {
      templateData.button.element.style.display = "none";
    }
    templateData.container.style.paddingLeft = "0px";
    templateData.elementDisposables.clear();
    let editableData;
    if (element.editId === TunnelEditId.New && (editableData = this.remoteExplorerService.getEditableData(void 0))) {
      this.renderInputBox(templateData, editableData);
    } else {
      editableData = this.remoteExplorerService.getEditableData(element.tunnel, element.editId);
      if (editableData) {
        this.renderInputBox(templateData, editableData);
      } else if (element.tunnel.tunnelType === TunnelType.Add && element.menuId === MenuId.TunnelPortInline) {
        this.renderButton(element, templateData);
      } else {
        this.renderActionBarItem(element, templateData);
      }
    }
  }
  renderButton(element, templateData) {
    templateData.container.style.paddingLeft = "7px";
    templateData.container.style.height = "28px";
    templateData.button = templateData.elementDisposables.add(new Button(templateData.container, defaultButtonStyles));
    templateData.button.label = element.label;
    templateData.button.element.title = element.tooltip;
    templateData.elementDisposables.add(templateData.button.onDidClick(() => {
      this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
    }));
  }
  tunnelContext(tunnel) {
    let context;
    if (tunnel instanceof TunnelItem) {
      context = tunnel.strip();
    }
    if (!context) {
      context = {
        tunnelType: tunnel.tunnelType,
        remoteHost: tunnel.remoteHost,
        remotePort: tunnel.remotePort,
        localAddress: tunnel.localAddress,
        protocol: tunnel.protocol,
        localUri: tunnel.localUri,
        localPort: tunnel.localPort,
        name: tunnel.name,
        closeable: tunnel.closeable,
        source: tunnel.source,
        privacy: tunnel.privacy,
        processDescription: tunnel.processDescription,
        label: tunnel.label
      };
    }
    return context;
  }
  renderActionBarItem(element, templateData) {
    templateData.label.element.style.display = "flex";
    templateData.label.setLabel(
      element.label,
      void 0,
      {
        title: element.markdownTooltip ? { markdown: element.markdownTooltip(this.configurationService), markdownNotSupportedFallback: element.tooltip } : element.tooltip,
        extraClasses: element.menuId === MenuId.TunnelLocalAddressInline ? ["ports-view-actionbar-cell-localaddress"] : void 0
      }
    );
    templateData.actionBar.context = this.tunnelContext(element.tunnel);
    templateData.container.style.paddingLeft = "10px";
    const context = [
      ["view", TUNNEL_VIEW_ID],
      [TunnelTypeContextKey.key, element.tunnel.tunnelType],
      [TunnelCloseableContextKey.key, element.tunnel.closeable],
      [TunnelPrivacyContextKey.key, element.tunnel.privacy.id],
      [TunnelProtocolContextKey.key, element.tunnel.protocol]
    ];
    const contextKeyService = this.contextKeyService.createOverlay(context);
    if (element.menuId) {
      const menu = templateData.elementDisposables.add(this.menuService.createMenu(element.menuId, contextKeyService));
      let actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
      if (actions) {
        const labelActions = actions.filter((action) => action.id.toLowerCase().indexOf("label") >= 0);
        if (labelActions.length > 1) {
          labelActions.sort((a, b) => a.label.length - b.label.length);
          labelActions.pop();
          actions = actions.filter((action) => labelActions.indexOf(action) < 0);
        }
        templateData.actionBar.push(actions, { icon: true, label: false });
        if (this._actionRunner) {
          templateData.actionBar.actionRunner = this._actionRunner;
        }
      }
    }
    if (element.icon) {
      templateData.icon.className = `ports-view-actionbar-cell-icon ${ThemeIcon.asClassName(element.icon)}`;
      templateData.icon.title = element.tooltip;
      templateData.icon.style.display = "inline";
    }
  }
  renderInputBox(templateData, editableData) {
    if (this.inputDone) {
      this.inputDone(false, false);
      this.inputDone = void 0;
    }
    const { container } = templateData;
    container.style.paddingLeft = "5px";
    const value = editableData.startingValue || "";
    const inputBox = new InputBox(container, this.contextViewService, {
      ariaLabel: nls.localize("remote.tunnelsView.input", "Press Enter to confirm or Escape to cancel."),
      validationOptions: {
        validation: (value2) => {
          const message = editableData.validationMessage(value2);
          if (!message) {
            return null;
          }
          return {
            content: message.content,
            formatContent: true,
            type: message.severity === Severity.Error ? MessageType.ERROR : MessageType.INFO
          };
        }
      },
      placeholder: editableData.placeholder || "",
      inputBoxStyles: defaultInputBoxStyles
    });
    inputBox.value = value;
    inputBox.focus();
    inputBox.select({ start: 0, end: editableData.startingValue ? editableData.startingValue.length : 0 });
    const done = createSingleCallFunction(async (success, finishEditing) => {
      dispose(toDispose);
      if (this.inputDone) {
        this.inputDone = void 0;
      }
      inputBox.element.style.display = "none";
      const inputValue = inputBox.value;
      if (finishEditing) {
        return editableData.onFinish(inputValue, success);
      }
    });
    this.inputDone = done;
    const toDispose = [
      inputBox,
      dom.addStandardDisposableListener(inputBox.inputElement, dom.EventType.KEY_DOWN, async (e) => {
        if (e.equals(KeyCode.Enter)) {
          e.stopPropagation();
          if (inputBox.validate() !== MessageType.ERROR) {
            return done(true, true);
          } else {
            return done(false, true);
          }
        } else if (e.equals(KeyCode.Escape)) {
          e.preventDefault();
          e.stopPropagation();
          return done(false, true);
        }
      }),
      dom.addDisposableListener(inputBox.inputElement, dom.EventType.BLUR, () => {
        return done(inputBox.validate() !== MessageType.ERROR, true);
      })
    ];
    templateData.elementDisposables.add(toDisposable(() => {
      done(false, false);
    }));
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
ActionBarRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IMenuService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IRemoteExplorerService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IConfigurationService)
], ActionBarRenderer);
class TunnelItem {
  constructor(tunnelType, remoteHost, remotePort, source, hasRunningProcess, protocol, localUri, localAddress, localPort, closeable, name, runningProcess, pid, _privacy, remoteExplorerService, tunnelService) {
    this.tunnelType = tunnelType;
    this.remoteHost = remoteHost;
    this.remotePort = remotePort;
    this.source = source;
    this.hasRunningProcess = hasRunningProcess;
    this.protocol = protocol;
    this.localUri = localUri;
    this.localAddress = localAddress;
    this.localPort = localPort;
    this.closeable = closeable;
    this.name = name;
    this.runningProcess = runningProcess;
    this.pid = pid;
    this._privacy = _privacy;
    this.remoteExplorerService = remoteExplorerService;
    this.tunnelService = tunnelService;
  }
  static createFromTunnel(remoteExplorerService, tunnelService, tunnel, type = TunnelType.Forwarded, closeable) {
    return new TunnelItem(
      type,
      tunnel.remoteHost,
      tunnel.remotePort,
      tunnel.source,
      !!tunnel.hasRunningProcess,
      tunnel.protocol,
      tunnel.localUri,
      tunnel.localAddress,
      tunnel.localPort,
      closeable === void 0 ? tunnel.closeable : closeable,
      tunnel.name,
      tunnel.runningProcess,
      tunnel.pid,
      tunnel.privacy,
      remoteExplorerService,
      tunnelService
    );
  }
  /**
   * Removes all non-serializable properties from the tunnel
   * @returns A new TunnelItem without any services
   */
  strip() {
    return new TunnelItem(
      this.tunnelType,
      this.remoteHost,
      this.remotePort,
      this.source,
      this.hasRunningProcess,
      this.protocol,
      this.localUri,
      this.localAddress,
      this.localPort,
      this.closeable,
      this.name,
      this.runningProcess,
      this.pid,
      this._privacy
    );
  }
  get label() {
    if (this.tunnelType === TunnelType.Add && this.name) {
      return this.name;
    }
    const portNumberLabel = isLocalhost(this.remoteHost) || isAllInterfaces(this.remoteHost) ? `${this.remotePort}` : `${this.remoteHost}:${this.remotePort}`;
    if (this.name) {
      return `${this.name} (${portNumberLabel})`;
    } else {
      return portNumberLabel;
    }
  }
  set processDescription(description) {
    this.runningProcess = description;
  }
  get processDescription() {
    let description = "";
    if (this.runningProcess) {
      if (this.pid && this.remoteExplorerService?.namedProcesses.has(this.pid)) {
        description = this.remoteExplorerService.namedProcesses.get(this.pid);
      } else {
        description = this.runningProcess.replace(/\0/g, " ").trim();
      }
      if (this.pid) {
        description += ` (${this.pid})`;
      }
    } else if (this.hasRunningProcess) {
      description = nls.localize("tunnelView.runningProcess.inacessable", "Process information unavailable");
    }
    return description;
  }
  get tooltipPostfix() {
    let information;
    if (this.localAddress) {
      information = nls.localize("remote.tunnel.tooltipForwarded", "Remote port {0}:{1} forwarded to local address {2}. ", this.remoteHost, this.remotePort, this.localAddress);
    } else {
      information = nls.localize("remote.tunnel.tooltipCandidate", "Remote port {0}:{1} not forwarded. ", this.remoteHost, this.remotePort);
    }
    return information;
  }
  get iconTooltip() {
    const isAdd = this.tunnelType === TunnelType.Add;
    if (!isAdd) {
      return `${this.processDescription ? nls.localize("tunnel.iconColumn.running", "Port has running process.") : nls.localize("tunnel.iconColumn.notRunning", "No running process.")}`;
    } else {
      return this.label;
    }
  }
  get portTooltip() {
    const isAdd = this.tunnelType === TunnelType.Add;
    if (!isAdd) {
      return `${this.name ? nls.localize("remote.tunnel.tooltipName", "Port labeled {0}. ", this.name) : ""}`;
    } else {
      return "";
    }
  }
  get processTooltip() {
    return this.processDescription ?? "";
  }
  get originTooltip() {
    return this.source.description;
  }
  get privacy() {
    if (this.tunnelService?.privacyOptions) {
      return this.tunnelService?.privacyOptions.find((element) => element.id === this._privacy) ?? {
        id: "",
        themeIcon: Codicon.question.id,
        label: nls.localize("tunnelPrivacy.unknown", "Unknown")
      };
    } else {
      return {
        id: TunnelPrivacyId.Private,
        themeIcon: privatePortIcon.id,
        label: nls.localize("tunnelPrivacy.private", "Private")
      };
    }
  }
}
const TunnelTypeContextKey = new RawContextKey("tunnelType", TunnelType.Add, true);
const TunnelCloseableContextKey = new RawContextKey("tunnelCloseable", false, true);
const TunnelPrivacyContextKey = new RawContextKey("tunnelPrivacy", void 0, true);
const TunnelPrivacyEnabledContextKey = new RawContextKey("tunnelPrivacyEnabled", false, true);
const TunnelProtocolContextKey = new RawContextKey("tunnelProtocol", TunnelProtocol.Http, true);
const TunnelViewFocusContextKey = new RawContextKey("tunnelViewFocus", false, nls.localize("tunnel.focusContext", "Whether the Ports view has focus."));
const TunnelViewSelectionKeyName = "tunnelViewSelection";
const TunnelViewSelectionContextKey = new RawContextKey(TunnelViewSelectionKeyName, void 0, true);
const TunnelViewMultiSelectionKeyName = "tunnelViewMultiSelection";
const TunnelViewMultiSelectionContextKey = new RawContextKey(TunnelViewMultiSelectionKeyName, void 0, true);
const PortChangableContextKey = new RawContextKey("portChangable", false, true);
const ProtocolChangeableContextKey = new RawContextKey("protocolChangable", true, true);
let TunnelPanel = class extends ViewPane {
  constructor(viewModel, options, keybindingService, contextMenuService, contextKeyService, configurationService, instantiationService, viewDescriptorService, openerService, quickInputService, commandService, menuService, themeService, remoteExplorerService, hoverService, tunnelService, contextViewService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.viewModel = viewModel;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.menuService = menuService;
    this.remoteExplorerService = remoteExplorerService;
    this.tunnelService = tunnelService;
    this.contextViewService = contextViewService;
    this.tableDisposables = this._register(new DisposableStore());
    this.isEditing = false;
    // TODO: Should this be removed?
    //@ts-expect-error
    this.titleActions = [];
    this.lastFocus = [];
    this.height = 0;
    this.width = 0;
    this.tunnelTypeContext = TunnelTypeContextKey.bindTo(contextKeyService);
    this.tunnelCloseableContext = TunnelCloseableContextKey.bindTo(contextKeyService);
    this.tunnelPrivacyContext = TunnelPrivacyContextKey.bindTo(contextKeyService);
    this.tunnelPrivacyEnabledContext = TunnelPrivacyEnabledContextKey.bindTo(contextKeyService);
    this.tunnelPrivacyEnabledContext.set(tunnelService.canChangePrivacy);
    this.protocolChangableContextKey = ProtocolChangeableContextKey.bindTo(contextKeyService);
    this.protocolChangableContextKey.set(tunnelService.canChangeProtocol);
    this.tunnelProtocolContext = TunnelProtocolContextKey.bindTo(contextKeyService);
    this.tunnelViewFocusContext = TunnelViewFocusContextKey.bindTo(contextKeyService);
    this.tunnelViewSelectionContext = TunnelViewSelectionContextKey.bindTo(contextKeyService);
    this.tunnelViewMultiSelectionContext = TunnelViewMultiSelectionContextKey.bindTo(contextKeyService);
    this.portChangableContextKey = PortChangableContextKey.bindTo(contextKeyService);
    const overlayContextKeyService = this.contextKeyService.createOverlay([["view", TunnelPanel.ID]]);
    const titleMenu = this._register(this.menuService.createMenu(MenuId.TunnelTitle, overlayContextKeyService));
    const updateActions = () => {
      this.titleActions = getFlatActionBarActions(titleMenu.getActions());
      this.updateActions();
    };
    this._register(titleMenu.onDidChange(updateActions));
    updateActions();
    this._register(toDisposable(() => {
      this.titleActions = [];
    }));
    this.registerPrivacyActions();
    this._register(Event.once(this.tunnelService.onAddedTunnelProvider)(() => {
      let updated = false;
      if (this.tunnelPrivacyEnabledContext.get() === false) {
        this.tunnelPrivacyEnabledContext.set(tunnelService.canChangePrivacy);
        updated = true;
      }
      if (this.protocolChangableContextKey.get() === true) {
        this.protocolChangableContextKey.set(tunnelService.canChangeProtocol);
        updated = true;
      }
      if (updated) {
        updateActions();
        this.registerPrivacyActions();
        this.createTable();
        this.table?.layout(this.height, this.width);
      }
    }));
  }
  registerPrivacyActions() {
    for (const privacyOption of this.tunnelService.privacyOptions) {
      const optionId = `remote.tunnel.privacy${privacyOption.id}`;
      CommandsRegistry.registerCommand(optionId, ChangeTunnelPrivacyAction.handler(privacyOption.id));
      MenuRegistry.appendMenuItem(MenuId.TunnelPrivacy, {
        order: 0,
        command: {
          id: optionId,
          title: privacyOption.label,
          toggled: TunnelPrivacyContextKey.isEqualTo(privacyOption.id)
        }
      });
    }
  }
  get portCount() {
    return this.remoteExplorerService.tunnelModel.forwarded.size + this.remoteExplorerService.tunnelModel.detected.size;
  }
  createTable() {
    if (!this.panelContainer) {
      return;
    }
    this.tableDisposables.clear();
    dom.clearNode(this.panelContainer);
    const widgetContainer = dom.append(this.panelContainer, dom.$(".customview-tree"));
    widgetContainer.classList.add("ports-view");
    widgetContainer.classList.add("file-icon-themable-tree", "show-file-icons");
    const actionBarRenderer = new ActionBarRenderer(
      this.instantiationService,
      this.contextKeyService,
      this.menuService,
      this.contextViewService,
      this.remoteExplorerService,
      this.commandService,
      this.configurationService
    );
    const columns = [new IconColumn(), new PortColumn(), new LocalAddressColumn(), new RunningProcessColumn()];
    if (this.tunnelService.canChangePrivacy) {
      columns.push(new PrivacyColumn());
    }
    columns.push(new OriginColumn());
    this.table = this.instantiationService.createInstance(
      WorkbenchTable,
      "RemoteTunnels",
      widgetContainer,
      new TunnelTreeVirtualDelegate(this.remoteExplorerService),
      columns,
      [actionBarRenderer],
      {
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (item) => {
            return item.label;
          }
        },
        multipleSelectionSupport: true,
        accessibilityProvider: {
          getAriaLabel: (item) => {
            if (item instanceof TunnelItem) {
              return `${item.tooltipPostfix} ${item.portTooltip} ${item.iconTooltip} ${item.processTooltip} ${item.originTooltip} ${this.tunnelService.canChangePrivacy ? item.privacy.label : ""}`;
            } else {
              return item.label;
            }
          },
          getWidgetAriaLabel: () => nls.localize("tunnelView", "Tunnel View")
        },
        openOnSingleClick: true
      }
    );
    const actionRunner = this.tableDisposables.add(new ActionRunner());
    actionBarRenderer.actionRunner = actionRunner;
    this.tableDisposables.add(this.table);
    this.tableDisposables.add(this.table.onContextMenu((e) => this.onContextMenu(e, actionRunner)));
    this.tableDisposables.add(this.table.onMouseDblClick((e) => this.onMouseDblClick(e)));
    this.tableDisposables.add(this.table.onDidChangeFocus((e) => this.onFocusChanged(e)));
    this.tableDisposables.add(this.table.onDidChangeSelection((e) => this.onSelectionChanged(e)));
    this.tableDisposables.add(this.table.onDidFocus(() => this.tunnelViewFocusContext.set(true)));
    this.tableDisposables.add(this.table.onDidBlur(() => this.tunnelViewFocusContext.set(false)));
    const rerender = () => this.table?.splice(0, Number.POSITIVE_INFINITY, this.viewModel.all);
    rerender();
    let lastPortCount = this.portCount;
    this.tableDisposables.add(Event.debounce(this.viewModel.onForwardedPortsChanged, (_last, e) => e, 50)(() => {
      const newPortCount = this.portCount;
      if ((lastPortCount === 0 || newPortCount === 0) && lastPortCount !== newPortCount) {
        this._onDidChangeViewWelcomeState.fire();
      }
      lastPortCount = newPortCount;
      rerender();
    }));
    this.tableDisposables.add(this.table.onMouseClick((e) => {
      if (this.hasOpenLinkModifier(e.browserEvent) && this.table) {
        const selection = this.table.getSelectedElements();
        if (selection.length === 0 || selection.length === 1 && selection[0] === e.element) {
          this.commandService.executeCommand(OpenPortInBrowserAction.ID, e.element);
        }
      }
    }));
    this.tableDisposables.add(this.table.onDidOpen((e) => {
      if (!e.element || e.element.tunnelType !== TunnelType.Forwarded) {
        return;
      }
      if (e.browserEvent?.type === "dblclick") {
        this.commandService.executeCommand(LabelTunnelAction.ID);
      }
    }));
    this.tableDisposables.add(this.remoteExplorerService.onDidChangeEditable((e) => {
      this.isEditing = !!this.remoteExplorerService.getEditableData(e?.tunnel, e?.editId);
      this._onDidChangeViewWelcomeState.fire();
      if (!this.isEditing) {
        widgetContainer.classList.remove("highlight");
      }
      rerender();
      if (this.isEditing) {
        widgetContainer.classList.add("highlight");
        if (!e) {
          this.table?.reveal(this.table.indexOf(this.viewModel.input));
        }
      } else {
        if (e && e.tunnel.tunnelType !== TunnelType.Add) {
          this.table?.setFocus(this.lastFocus);
        }
        this.focus();
      }
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    this.panelContainer = dom.append(container, dom.$(".tree-explorer-viewlet-tree-view"));
    this.createTable();
  }
  shouldShowWelcome() {
    return this.viewModel.isEmpty() && !this.isEditing;
  }
  focus() {
    super.focus();
    this.table?.domFocus();
  }
  onFocusChanged(event) {
    if (event.indexes.length > 0 && event.elements.length > 0) {
      this.lastFocus = [...event.indexes];
    }
    const elements = event.elements;
    const item = elements && elements.length ? elements[0] : void 0;
    if (item) {
      this.tunnelViewSelectionContext.set(makeAddress(item.remoteHost, item.remotePort));
      this.tunnelTypeContext.set(item.tunnelType);
      this.tunnelCloseableContext.set(!!item.closeable);
      this.tunnelPrivacyContext.set(item.privacy.id);
      this.tunnelProtocolContext.set(item.protocol === TunnelProtocol.Https ? TunnelProtocol.Https : TunnelProtocol.Http);
      this.portChangableContextKey.set(!!item.localPort);
    } else {
      this.tunnelTypeContext.reset();
      this.tunnelViewSelectionContext.reset();
      this.tunnelCloseableContext.reset();
      this.tunnelPrivacyContext.reset();
      this.tunnelProtocolContext.reset();
      this.portChangableContextKey.reset();
    }
  }
  hasOpenLinkModifier(e) {
    const editorConf = this.configurationService.getValue("editor");
    let modifierKey = false;
    if (editorConf.multiCursorModifier === "ctrlCmd") {
      modifierKey = e.altKey;
    } else {
      if (isMacintosh) {
        modifierKey = e.metaKey;
      } else {
        modifierKey = e.ctrlKey;
      }
    }
    return modifierKey;
  }
  onSelectionChanged(event) {
    const elements = event.elements;
    if (elements.length > 1) {
      this.tunnelViewMultiSelectionContext.set(elements.map((element) => makeAddress(element.remoteHost, element.remotePort)));
    } else {
      this.tunnelViewMultiSelectionContext.set(void 0);
    }
  }
  onContextMenu(event, actionRunner) {
    if (event.element !== void 0 && !(event.element instanceof TunnelItem)) {
      return;
    }
    event.browserEvent.preventDefault();
    event.browserEvent.stopPropagation();
    const node = event.element;
    if (node) {
      this.table?.setFocus([this.table.indexOf(node)]);
      this.tunnelTypeContext.set(node.tunnelType);
      this.tunnelCloseableContext.set(!!node.closeable);
      this.tunnelPrivacyContext.set(node.privacy.id);
      this.tunnelProtocolContext.set(node.protocol);
      this.portChangableContextKey.set(!!node.localPort);
    } else {
      this.tunnelTypeContext.set(TunnelType.Add);
      this.tunnelCloseableContext.set(false);
      this.tunnelPrivacyContext.set(void 0);
      this.tunnelProtocolContext.set(void 0);
      this.portChangableContextKey.set(false);
    }
    this.contextMenuService.showContextMenu({
      menuId: MenuId.TunnelContext,
      menuActionOptions: { shouldForwardArgs: true },
      contextKeyService: this.table?.contextKeyService,
      getAnchor: () => event.anchor,
      getActionViewItem: (action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
        }
        return void 0;
      },
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.table?.domFocus();
        }
      },
      getActionsContext: () => node?.strip(),
      actionRunner
    });
  }
  onMouseDblClick(e) {
    if (!e.element) {
      this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
    }
  }
  layoutBody(height, width) {
    this.height = height;
    this.width = width;
    super.layoutBody(height, width);
    this.table?.layout(height, width);
  }
};
TunnelPanel.ID = TUNNEL_VIEW_ID;
TunnelPanel.TITLE = nls.localize2("remote.tunnel", "Ports");
TunnelPanel = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IViewDescriptorService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IQuickInputService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, IThemeService),
  __decorateParam(13, IRemoteExplorerService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, ITunnelService),
  __decorateParam(16, IContextViewService)
], TunnelPanel);
class TunnelPanelDescriptor {
  constructor(viewModel, environmentService) {
    this.id = TunnelPanel.ID;
    this.name = TunnelPanel.TITLE;
    this.canToggleVisibility = true;
    this.hideByDefault = false;
    // group is not actually used for views that are not extension contributed. Use order instead.
    this.group = "details@0";
    // -500 comes from the remote explorer viewOrderDelegate
    this.order = -500;
    this.canMoveView = true;
    this.containerIcon = portsViewIcon;
    this.ctorDescriptor = new SyncDescriptor(TunnelPanel, [viewModel]);
    this.remoteAuthority = environmentService.remoteAuthority ? environmentService.remoteAuthority.split("+")[0] : void 0;
  }
}
function isITunnelItem(item) {
  return item && item.tunnelType && item.remoteHost && item.source;
}
var LabelTunnelAction;
((LabelTunnelAction2) => {
  LabelTunnelAction2.ID = "remote.tunnel.label";
  LabelTunnelAction2.LABEL = nls.localize("remote.tunnel.label", "Set Port Label");
  LabelTunnelAction2.COMMAND_ID_KEYWORD = "label";
  function handler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      let tunnelContext;
      if (isITunnelItem(arg)) {
        tunnelContext = arg;
      } else {
        const context = accessor.get(IContextKeyService).getContextKeyValue(TunnelViewSelectionKeyName);
        const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : void 0;
        if (tunnel) {
          const tunnelService = accessor.get(ITunnelService);
          tunnelContext = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, tunnel);
        }
      }
      if (tunnelContext) {
        const tunnelItem = tunnelContext;
        return new Promise((resolve) => {
          const startingValue = tunnelItem.name ? tunnelItem.name : `${tunnelItem.remotePort}`;
          remoteExplorerService.setEditable(tunnelItem, TunnelEditId.Label, {
            onFinish: async (value, success) => {
              value = value.trim();
              remoteExplorerService.setEditable(tunnelItem, TunnelEditId.Label, null);
              const changed = success && value !== startingValue;
              if (changed) {
                await remoteExplorerService.tunnelModel.name(tunnelItem.remoteHost, tunnelItem.remotePort, value);
              }
              resolve(changed ? { port: tunnelItem.remotePort, label: value } : void 0);
            },
            validationMessage: () => null,
            placeholder: nls.localize("remote.tunnelsView.labelPlaceholder", "Port label"),
            startingValue
          });
        });
      }
      return void 0;
    };
  }
  LabelTunnelAction2.handler = handler;
})(LabelTunnelAction || (LabelTunnelAction = {}));
const invalidPortString = nls.localize("remote.tunnelsView.portNumberValid", "Forwarded port should be a number or a host:port.");
const maxPortNumber = 65536;
const invalidPortNumberString = nls.localize("remote.tunnelsView.portNumberToHigh", "Port number must be \u2265 0 and < {0}.", maxPortNumber);
const requiresSudoString = nls.localize("remote.tunnelView.inlineElevationMessage", "May Require Sudo");
const alreadyForwarded = nls.localize("remote.tunnelView.alreadyForwarded", "Port is already forwarded");
var ForwardPortAction;
((ForwardPortAction2) => {
  ForwardPortAction2.INLINE_ID = "remote.tunnel.forwardInline";
  ForwardPortAction2.COMMANDPALETTE_ID = "remote.tunnel.forwardCommandPalette";
  ForwardPortAction2.LABEL = nls.localize2("remote.tunnel.forward", "Forward a Port");
  ForwardPortAction2.TREEITEM_LABEL = nls.localize("remote.tunnel.forwardItem", "Forward Port");
  const forwardPrompt = nls.localize("remote.tunnel.forwardPrompt", "Port number or address (eg. 3000 or 10.10.10.10:2000).");
  function validateInput(remoteExplorerService, tunnelService, value, canElevate) {
    const parsed = parseAddress(value);
    if (!parsed) {
      return { content: invalidPortString, severity: Severity.Error };
    } else if (parsed.port >= maxPortNumber) {
      return { content: invalidPortNumberString, severity: Severity.Error };
    } else if (canElevate && tunnelService.isPortPrivileged(parsed.port)) {
      return { content: requiresSudoString, severity: Severity.Info };
    } else if (mapHasAddressLocalhostOrAllInterfaces(remoteExplorerService.tunnelModel.forwarded, parsed.host, parsed.port)) {
      return { content: alreadyForwarded, severity: Severity.Error };
    }
    return null;
  }
  function error(notificationService, tunnelOrError, host, port) {
    if (!tunnelOrError) {
      notificationService.warn(nls.localize("remote.tunnel.forwardError", "Unable to forward {0}:{1}. The host may not be available or that remote port may already be forwarded", host, port));
    } else if (typeof tunnelOrError === "string") {
      notificationService.warn(nls.localize("remote.tunnel.forwardErrorProvided", "Unable to forward {0}:{1}. {2}", host, port, tunnelOrError));
    }
  }
  function inlineHandler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const notificationService = accessor.get(INotificationService);
      const tunnelService = accessor.get(ITunnelService);
      remoteExplorerService.setEditable(void 0, TunnelEditId.New, {
        onFinish: async (value, success) => {
          remoteExplorerService.setEditable(void 0, TunnelEditId.New, null);
          let parsed;
          if (success && (parsed = parseAddress(value))) {
            remoteExplorerService.forward({
              remote: { host: parsed.host, port: parsed.port },
              elevateIfNeeded: true
            }).then((tunnelOrError) => error(notificationService, tunnelOrError, parsed.host, parsed.port));
          }
        },
        validationMessage: (value) => validateInput(remoteExplorerService, tunnelService, value, tunnelService.canElevate),
        placeholder: forwardPrompt
      });
    };
  }
  ForwardPortAction2.inlineHandler = inlineHandler;
  function commandPaletteHandler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const notificationService = accessor.get(INotificationService);
      const viewsService = accessor.get(IViewsService);
      const quickInputService = accessor.get(IQuickInputService);
      const tunnelService = accessor.get(ITunnelService);
      await viewsService.openView(TunnelPanel.ID, true);
      const value = await quickInputService.input({
        prompt: forwardPrompt,
        validateInput: (value2) => Promise.resolve(validateInput(remoteExplorerService, tunnelService, value2, tunnelService.canElevate))
      });
      let parsed;
      if (value && (parsed = parseAddress(value))) {
        remoteExplorerService.forward({
          remote: { host: parsed.host, port: parsed.port },
          elevateIfNeeded: true
        }).then((tunnel) => error(notificationService, tunnel, parsed.host, parsed.port));
      }
    };
  }
  ForwardPortAction2.commandPaletteHandler = commandPaletteHandler;
})(ForwardPortAction || (ForwardPortAction = {}));
function makeTunnelPicks(tunnels, remoteExplorerService, tunnelService) {
  const picks = tunnels.map((forwarded) => {
    const item = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, forwarded);
    return {
      label: item.label,
      description: item.processDescription,
      tunnel: item
    };
  });
  if (picks.length === 0) {
    picks.push({
      label: nls.localize("remote.tunnel.closeNoPorts", "No ports currently forwarded. Try running the {0} command", ForwardPortAction.LABEL.value)
    });
  }
  return picks;
}
var ClosePortAction;
((ClosePortAction2) => {
  ClosePortAction2.INLINE_ID = "remote.tunnel.closeInline";
  ClosePortAction2.COMMANDPALETTE_ID = "remote.tunnel.closeCommandPalette";
  ClosePortAction2.LABEL = nls.localize2("remote.tunnel.close", "Stop Forwarding Port");
  function inlineHandler() {
    return async (accessor, arg) => {
      const contextKeyService = accessor.get(IContextKeyService);
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      let ports = [];
      const multiSelectContext = contextKeyService.getContextKeyValue(TunnelViewMultiSelectionKeyName);
      if (multiSelectContext) {
        multiSelectContext.forEach((context) => {
          const tunnel = remoteExplorerService.tunnelModel.forwarded.get(context);
          if (tunnel) {
            ports?.push(tunnel);
          }
        });
      } else if (isITunnelItem(arg)) {
        ports = [arg];
      } else {
        const context = contextKeyService.getContextKeyValue(TunnelViewSelectionKeyName);
        const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : void 0;
        if (tunnel) {
          ports = [tunnel];
        }
      }
      if (!ports || ports.length === 0) {
        return;
      }
      return Promise.all(ports.map((port) => remoteExplorerService.close({ host: port.remoteHost, port: port.remotePort }, TunnelCloseReason.User)));
    };
  }
  ClosePortAction2.inlineHandler = inlineHandler;
  function commandPaletteHandler() {
    return async (accessor) => {
      const quickInputService = accessor.get(IQuickInputService);
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const tunnelService = accessor.get(ITunnelService);
      const commandService = accessor.get(ICommandService);
      const picks = makeTunnelPicks(Array.from(remoteExplorerService.tunnelModel.forwarded.values()).filter((tunnel) => tunnel.closeable), remoteExplorerService, tunnelService);
      const result = await quickInputService.pick(picks, { placeHolder: nls.localize("remote.tunnel.closePlaceholder", "Choose a port to stop forwarding") });
      if (result && result.tunnel) {
        await remoteExplorerService.close({ host: result.tunnel.remoteHost, port: result.tunnel.remotePort }, TunnelCloseReason.User);
      } else if (result) {
        await commandService.executeCommand(ForwardPortAction.COMMANDPALETTE_ID);
      }
    };
  }
  ClosePortAction2.commandPaletteHandler = commandPaletteHandler;
})(ClosePortAction || (ClosePortAction = {}));
var OpenPortInBrowserAction;
((OpenPortInBrowserAction2) => {
  OpenPortInBrowserAction2.ID = "remote.tunnel.open";
  OpenPortInBrowserAction2.LABEL = nls.localize("remote.tunnel.open", "Open in Browser");
  function handler() {
    return async (accessor, arg) => {
      let key;
      if (isITunnelItem(arg)) {
        key = makeAddress(arg.remoteHost, arg.remotePort);
      } else if (isRemoteTunnel(arg)) {
        key = makeAddress(arg.tunnelRemoteHost, arg.tunnelRemotePort);
      }
      if (key) {
        const model = accessor.get(IRemoteExplorerService).tunnelModel;
        const openerService = accessor.get(IOpenerService);
        return run(model, openerService, key);
      }
    };
  }
  OpenPortInBrowserAction2.handler = handler;
  function run(model, openerService, key) {
    const tunnel = model.forwarded.get(key) || model.detected.get(key);
    if (tunnel) {
      return openerService.open(tunnel.localUri, { allowContributedOpeners: false });
    }
    return Promise.resolve();
  }
  OpenPortInBrowserAction2.run = run;
})(OpenPortInBrowserAction || (OpenPortInBrowserAction = {}));
var OpenPortInPreviewAction;
((OpenPortInPreviewAction2) => {
  OpenPortInPreviewAction2.ID = "remote.tunnel.openPreview";
  OpenPortInPreviewAction2.LABEL = nls.localize("remote.tunnel.openPreview", "Preview in Editor");
  function handler() {
    return async (accessor, arg) => {
      let key;
      if (isITunnelItem(arg)) {
        key = makeAddress(arg.remoteHost, arg.remotePort);
      } else if (isRemoteTunnel(arg)) {
        key = makeAddress(arg.tunnelRemoteHost, arg.tunnelRemotePort);
      }
      if (key) {
        const model = accessor.get(IRemoteExplorerService).tunnelModel;
        const openerService = accessor.get(IOpenerService);
        const externalOpenerService = accessor.get(IExternalUriOpenerService);
        return run(model, openerService, externalOpenerService, key);
      }
    };
  }
  OpenPortInPreviewAction2.handler = handler;
  async function run(model, openerService, externalOpenerService, key) {
    const tunnel = model.forwarded.get(key) || model.detected.get(key);
    if (tunnel) {
      const remoteHost = tunnel.remoteHost.includes(":") ? `[${tunnel.remoteHost}]` : tunnel.remoteHost;
      const sourceUri = URI.parse(`http://${remoteHost}:${tunnel.remotePort}`);
      const opener = await externalOpenerService.getOpener(tunnel.localUri, { sourceUri }, CancellationToken.None);
      if (opener) {
        return opener.openExternalUri(tunnel.localUri, { sourceUri }, CancellationToken.None);
      }
      return openerService.open(tunnel.localUri);
    }
    return Promise.resolve();
  }
  OpenPortInPreviewAction2.run = run;
})(OpenPortInPreviewAction || (OpenPortInPreviewAction = {}));
var OpenPortInBrowserCommandPaletteAction;
((OpenPortInBrowserCommandPaletteAction2) => {
  OpenPortInBrowserCommandPaletteAction2.ID = "remote.tunnel.openCommandPalette";
  OpenPortInBrowserCommandPaletteAction2.LABEL = nls.localize("remote.tunnel.openCommandPalette", "Open Port in Browser");
  function handler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const tunnelService = accessor.get(ITunnelService);
      const model = remoteExplorerService.tunnelModel;
      const quickPickService = accessor.get(IQuickInputService);
      const openerService = accessor.get(IOpenerService);
      const commandService = accessor.get(ICommandService);
      const options = [...model.forwarded, ...model.detected].map((value) => {
        const tunnelItem = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, value[1]);
        return {
          label: tunnelItem.label,
          description: tunnelItem.processDescription,
          tunnel: tunnelItem
        };
      });
      if (options.length === 0) {
        options.push({
          label: nls.localize("remote.tunnel.openCommandPaletteNone", "No ports currently forwarded. Open the Ports view to get started.")
        });
      } else {
        options.push({
          label: nls.localize("remote.tunnel.openCommandPaletteView", "Open the Ports view...")
        });
      }
      const picked = await quickPickService.pick(options, { placeHolder: nls.localize("remote.tunnel.openCommandPalettePick", "Choose the port to open") });
      if (picked && picked.tunnel) {
        return OpenPortInBrowserAction.run(model, openerService, makeAddress(picked.tunnel.remoteHost, picked.tunnel.remotePort));
      } else if (picked) {
        return commandService.executeCommand(`${TUNNEL_VIEW_ID}.focus`);
      }
    };
  }
  OpenPortInBrowserCommandPaletteAction2.handler = handler;
})(OpenPortInBrowserCommandPaletteAction || (OpenPortInBrowserCommandPaletteAction = {}));
var CopyAddressAction;
((CopyAddressAction2) => {
  CopyAddressAction2.INLINE_ID = "remote.tunnel.copyAddressInline";
  CopyAddressAction2.COMMANDPALETTE_ID = "remote.tunnel.copyAddressCommandPalette";
  CopyAddressAction2.INLINE_LABEL = nls.localize("remote.tunnel.copyAddressInline", "Copy Local Address");
  CopyAddressAction2.COMMANDPALETTE_LABEL = nls.localize("remote.tunnel.copyAddressCommandPalette", "Copy Forwarded Port Address");
  async function copyAddress(remoteExplorerService, clipboardService, tunnelItem) {
    const address = remoteExplorerService.tunnelModel.address(tunnelItem.remoteHost, tunnelItem.remotePort);
    if (address) {
      await clipboardService.writeText(address.toString());
    }
  }
  function inlineHandler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      let tunnelItem;
      if (isITunnelItem(arg)) {
        tunnelItem = arg;
      } else {
        const context = accessor.get(IContextKeyService).getContextKeyValue(TunnelViewSelectionKeyName);
        tunnelItem = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : void 0;
      }
      if (tunnelItem) {
        return copyAddress(remoteExplorerService, accessor.get(IClipboardService), tunnelItem);
      }
    };
  }
  CopyAddressAction2.inlineHandler = inlineHandler;
  function commandPaletteHandler() {
    return async (accessor, arg) => {
      const quickInputService = accessor.get(IQuickInputService);
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const tunnelService = accessor.get(ITunnelService);
      const commandService = accessor.get(ICommandService);
      const clipboardService = accessor.get(IClipboardService);
      const tunnels = Array.from(remoteExplorerService.tunnelModel.forwarded.values()).concat(Array.from(remoteExplorerService.tunnelModel.detected.values()));
      const result = await quickInputService.pick(makeTunnelPicks(tunnels, remoteExplorerService, tunnelService), { placeHolder: nls.localize("remote.tunnel.copyAddressPlaceholdter", "Choose a forwarded port") });
      if (result && result.tunnel) {
        await copyAddress(remoteExplorerService, clipboardService, result.tunnel);
      } else if (result) {
        await commandService.executeCommand(ForwardPortAction.COMMANDPALETTE_ID);
      }
    };
  }
  CopyAddressAction2.commandPaletteHandler = commandPaletteHandler;
})(CopyAddressAction || (CopyAddressAction = {}));
var ChangeLocalPortAction;
((ChangeLocalPortAction2) => {
  ChangeLocalPortAction2.ID = "remote.tunnel.changeLocalPort";
  ChangeLocalPortAction2.LABEL = nls.localize("remote.tunnel.changeLocalPort", "Change Local Address Port");
  function validateInput(tunnelService, value, canElevate) {
    if (!value.match(/^[0-9]+$/)) {
      return { content: nls.localize("remote.tunnelsView.portShouldBeNumber", "Local port should be a number."), severity: Severity.Error };
    } else if (Number(value) >= maxPortNumber) {
      return { content: invalidPortNumberString, severity: Severity.Error };
    } else if (canElevate && tunnelService.isPortPrivileged(Number(value))) {
      return { content: requiresSudoString, severity: Severity.Info };
    }
    return null;
  }
  function handler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const notificationService = accessor.get(INotificationService);
      const tunnelService = accessor.get(ITunnelService);
      let tunnelContext;
      if (isITunnelItem(arg)) {
        tunnelContext = arg;
      } else {
        const context = accessor.get(IContextKeyService).getContextKeyValue(TunnelViewSelectionKeyName);
        const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : void 0;
        if (tunnel) {
          const tunnelService2 = accessor.get(ITunnelService);
          tunnelContext = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService2, tunnel);
        }
      }
      if (tunnelContext) {
        const tunnelItem = tunnelContext;
        remoteExplorerService.setEditable(tunnelItem, TunnelEditId.LocalPort, {
          onFinish: async (value, success) => {
            remoteExplorerService.setEditable(tunnelItem, TunnelEditId.LocalPort, null);
            if (success) {
              await remoteExplorerService.close({ host: tunnelItem.remoteHost, port: tunnelItem.remotePort }, TunnelCloseReason.Other);
              const numberValue = Number(value);
              const newForward = await remoteExplorerService.forward({
                remote: { host: tunnelItem.remoteHost, port: tunnelItem.remotePort },
                local: numberValue,
                name: tunnelItem.name,
                elevateIfNeeded: true,
                source: tunnelItem.source
              });
              if (newForward && typeof newForward !== "string" && newForward.tunnelLocalPort !== numberValue) {
                notificationService.warn(nls.localize("remote.tunnel.changeLocalPortNumber", "The local port {0} is not available. Port number {1} has been used instead", value, newForward.tunnelLocalPort ?? newForward.localAddress));
              }
            }
          },
          validationMessage: (value) => validateInput(tunnelService, value, tunnelService.canElevate),
          placeholder: nls.localize("remote.tunnelsView.changePort", "New local port")
        });
      }
    };
  }
  ChangeLocalPortAction2.handler = handler;
})(ChangeLocalPortAction || (ChangeLocalPortAction = {}));
var ChangeTunnelPrivacyAction;
((ChangeTunnelPrivacyAction2) => {
  function handler(privacyId) {
    return async (accessor, arg) => {
      if (isITunnelItem(arg)) {
        const remoteExplorerService = accessor.get(IRemoteExplorerService);
        await remoteExplorerService.close({ host: arg.remoteHost, port: arg.remotePort }, TunnelCloseReason.Other);
        return remoteExplorerService.forward({
          remote: { host: arg.remoteHost, port: arg.remotePort },
          local: arg.localPort,
          name: arg.name,
          elevateIfNeeded: true,
          privacy: privacyId,
          source: arg.source
        });
      }
      return void 0;
    };
  }
  ChangeTunnelPrivacyAction2.handler = handler;
})(ChangeTunnelPrivacyAction || (ChangeTunnelPrivacyAction = {}));
var SetTunnelProtocolAction;
((SetTunnelProtocolAction2) => {
  SetTunnelProtocolAction2.ID_HTTP = "remote.tunnel.setProtocolHttp";
  SetTunnelProtocolAction2.ID_HTTPS = "remote.tunnel.setProtocolHttps";
  SetTunnelProtocolAction2.LABEL_HTTP = nls.localize("remote.tunnel.protocolHttp", "HTTP");
  SetTunnelProtocolAction2.LABEL_HTTPS = nls.localize("remote.tunnel.protocolHttps", "HTTPS");
  async function handler(arg, protocol, remoteExplorerService, environmentService) {
    if (isITunnelItem(arg)) {
      const attributes = {
        protocol
      };
      const target = environmentService.remoteAuthority ? ConfigurationTarget.USER_REMOTE : ConfigurationTarget.USER_LOCAL;
      return remoteExplorerService.tunnelModel.configPortsAttributes.addAttributes(arg.remotePort, attributes, target);
    }
  }
  function handlerHttp() {
    return async (accessor, arg) => {
      return handler(arg, TunnelProtocol.Http, accessor.get(IRemoteExplorerService), accessor.get(IWorkbenchEnvironmentService));
    };
  }
  SetTunnelProtocolAction2.handlerHttp = handlerHttp;
  function handlerHttps() {
    return async (accessor, arg) => {
      return handler(arg, TunnelProtocol.Https, accessor.get(IRemoteExplorerService), accessor.get(IWorkbenchEnvironmentService));
    };
  }
  SetTunnelProtocolAction2.handlerHttps = handlerHttps;
})(SetTunnelProtocolAction || (SetTunnelProtocolAction = {}));
const tunnelViewCommandsWeightBonus = 10;
const isForwardedExpr = TunnelTypeContextKey.isEqualTo(TunnelType.Forwarded);
const isForwardedOrDetectedExpr = ContextKeyExpr.or(isForwardedExpr, TunnelTypeContextKey.isEqualTo(TunnelType.Detected));
const isNotMultiSelectionExpr = TunnelViewMultiSelectionContextKey.isEqualTo(void 0);
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: LabelTunnelAction.ID,
  weight: KeybindingWeight.WorkbenchContrib + tunnelViewCommandsWeightBonus,
  when: ContextKeyExpr.and(TunnelViewFocusContextKey, isForwardedExpr, isNotMultiSelectionExpr),
  primary: KeyCode.F2,
  mac: {
    primary: KeyCode.Enter
  },
  handler: LabelTunnelAction.handler()
});
CommandsRegistry.registerCommand(ForwardPortAction.INLINE_ID, ForwardPortAction.inlineHandler());
CommandsRegistry.registerCommand(ForwardPortAction.COMMANDPALETTE_ID, ForwardPortAction.commandPaletteHandler());
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: ClosePortAction.INLINE_ID,
  weight: KeybindingWeight.WorkbenchContrib + tunnelViewCommandsWeightBonus,
  when: ContextKeyExpr.and(TunnelCloseableContextKey, TunnelViewFocusContextKey),
  primary: KeyCode.Delete,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.Backspace,
    secondary: [KeyCode.Delete]
  },
  handler: ClosePortAction.inlineHandler()
});
CommandsRegistry.registerCommand(ClosePortAction.COMMANDPALETTE_ID, ClosePortAction.commandPaletteHandler());
CommandsRegistry.registerCommand(OpenPortInBrowserAction.ID, OpenPortInBrowserAction.handler());
CommandsRegistry.registerCommand(OpenPortInPreviewAction.ID, OpenPortInPreviewAction.handler());
CommandsRegistry.registerCommand(OpenPortInBrowserCommandPaletteAction.ID, OpenPortInBrowserCommandPaletteAction.handler());
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CopyAddressAction.INLINE_ID,
  weight: KeybindingWeight.WorkbenchContrib + tunnelViewCommandsWeightBonus,
  when: ContextKeyExpr.and(TunnelViewFocusContextKey, isForwardedOrDetectedExpr, isNotMultiSelectionExpr),
  primary: KeyMod.CtrlCmd | KeyCode.KeyC,
  handler: CopyAddressAction.inlineHandler()
});
CommandsRegistry.registerCommand(CopyAddressAction.COMMANDPALETTE_ID, CopyAddressAction.commandPaletteHandler());
CommandsRegistry.registerCommand(ChangeLocalPortAction.ID, ChangeLocalPortAction.handler());
CommandsRegistry.registerCommand(SetTunnelProtocolAction.ID_HTTP, SetTunnelProtocolAction.handlerHttp());
CommandsRegistry.registerCommand(SetTunnelProtocolAction.ID_HTTPS, SetTunnelProtocolAction.handlerHttps());
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ClosePortAction.COMMANDPALETTE_ID,
    title: ClosePortAction.LABEL
  },
  when: forwardedPortsViewEnabled
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ForwardPortAction.COMMANDPALETTE_ID,
    title: ForwardPortAction.LABEL
  },
  when: forwardedPortsViewEnabled
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: CopyAddressAction.COMMANDPALETTE_ID,
    title: CopyAddressAction.COMMANDPALETTE_LABEL
  },
  when: forwardedPortsViewEnabled
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: OpenPortInBrowserCommandPaletteAction.ID,
    title: OpenPortInBrowserCommandPaletteAction.LABEL
  },
  when: forwardedPortsViewEnabled
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "._open",
  order: 0,
  command: {
    id: OpenPortInBrowserAction.ID,
    title: OpenPortInBrowserAction.LABEL
  },
  when: ContextKeyExpr.and(isForwardedOrDetectedExpr, isNotMultiSelectionExpr)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "._open",
  order: 1,
  command: {
    id: OpenPortInPreviewAction.ID,
    title: OpenPortInPreviewAction.LABEL
  },
  when: ContextKeyExpr.and(
    isForwardedOrDetectedExpr,
    isNotMultiSelectionExpr
  )
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "0_manage",
  order: 1,
  command: {
    id: LabelTunnelAction.ID,
    title: LabelTunnelAction.LABEL,
    icon: labelPortIcon
  },
  when: ContextKeyExpr.and(isForwardedExpr, isNotMultiSelectionExpr)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "2_localaddress",
  order: 0,
  command: {
    id: CopyAddressAction.INLINE_ID,
    title: CopyAddressAction.INLINE_LABEL
  },
  when: ContextKeyExpr.and(isForwardedOrDetectedExpr, isNotMultiSelectionExpr)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "2_localaddress",
  order: 1,
  command: {
    id: ChangeLocalPortAction.ID,
    title: ChangeLocalPortAction.LABEL
  },
  when: ContextKeyExpr.and(isForwardedExpr, PortChangableContextKey, isNotMultiSelectionExpr)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "2_localaddress",
  order: 2,
  submenu: MenuId.TunnelPrivacy,
  title: nls.localize("tunnelContext.privacyMenu", "Port Visibility"),
  when: ContextKeyExpr.and(isForwardedExpr, TunnelPrivacyEnabledContextKey)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "2_localaddress",
  order: 3,
  submenu: MenuId.TunnelProtocol,
  title: nls.localize("tunnelContext.protocolMenu", "Change Port Protocol"),
  when: ContextKeyExpr.and(isForwardedExpr, isNotMultiSelectionExpr, ProtocolChangeableContextKey)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "3_forward",
  order: 0,
  command: {
    id: ClosePortAction.INLINE_ID,
    title: ClosePortAction.LABEL
  },
  when: TunnelCloseableContextKey
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "3_forward",
  order: 1,
  command: {
    id: ForwardPortAction.INLINE_ID,
    title: ForwardPortAction.LABEL
  }
});
MenuRegistry.appendMenuItem(MenuId.TunnelProtocol, {
  order: 0,
  command: {
    id: SetTunnelProtocolAction.ID_HTTP,
    title: SetTunnelProtocolAction.LABEL_HTTP,
    toggled: TunnelProtocolContextKey.isEqualTo(TunnelProtocol.Http)
  }
});
MenuRegistry.appendMenuItem(MenuId.TunnelProtocol, {
  order: 1,
  command: {
    id: SetTunnelProtocolAction.ID_HTTPS,
    title: SetTunnelProtocolAction.LABEL_HTTPS,
    toggled: TunnelProtocolContextKey.isEqualTo(TunnelProtocol.Https)
  }
});
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, {
  group: "0_manage",
  order: 0,
  command: {
    id: ForwardPortAction.INLINE_ID,
    title: ForwardPortAction.TREEITEM_LABEL,
    icon: forwardPortIcon
  },
  when: TunnelTypeContextKey.isEqualTo(TunnelType.Candidate)
});
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, {
  group: "0_manage",
  order: 4,
  command: {
    id: LabelTunnelAction.ID,
    title: LabelTunnelAction.LABEL,
    icon: labelPortIcon
  },
  when: isForwardedExpr
});
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, {
  group: "0_manage",
  order: 5,
  command: {
    id: ClosePortAction.INLINE_ID,
    title: ClosePortAction.LABEL,
    icon: stopForwardIcon
  },
  when: TunnelCloseableContextKey
});
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, {
  order: -1,
  command: {
    id: CopyAddressAction.INLINE_ID,
    title: CopyAddressAction.INLINE_LABEL,
    icon: copyAddressIcon
  },
  when: isForwardedOrDetectedExpr
});
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, {
  order: 0,
  command: {
    id: OpenPortInBrowserAction.ID,
    title: OpenPortInBrowserAction.LABEL,
    icon: openBrowserIcon
  },
  when: isForwardedOrDetectedExpr
});
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, {
  order: 1,
  command: {
    id: OpenPortInPreviewAction.ID,
    title: OpenPortInPreviewAction.LABEL,
    icon: openPreviewIcon
  },
  when: isForwardedOrDetectedExpr
});
registerColor("ports.iconRunningProcessForeground", STATUS_BAR_REMOTE_ITEM_BACKGROUND, nls.localize("portWithRunningProcess.foreground", "The color of the icon for a port that has an associated running process."));
export {
  ForwardPortAction,
  OpenPortInBrowserAction,
  OpenPortInPreviewAction,
  TunnelPanel,
  TunnelPanelDescriptor,
  TunnelViewModel,
  openPreviewEnabledContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVxcYnJvd3NlclxcdHVubmVsVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS90dW5uZWxWaWV3LmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvciwgSUVkaXRhYmxlRGF0YSwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXksIFJhd0NvbnRleHRLZXksIENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlLCBJQ29tbWFuZEhhbmRsZXIsIENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIsIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSwgZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUV4cGxvcmVyU2VydmljZSwgVHVubmVsVHlwZSwgSVR1bm5lbEl0ZW0sIFRVTk5FTF9WSUVXX0lELCBUdW5uZWxFZGl0SWQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUV4cGxvcmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCwgTWVzc2FnZVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZnVuY3Rpb25hbC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSwgSVZpZXdQYW5lT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlzQWxsSW50ZXJmYWNlcywgaXNMb2NhbGhvc3QsIGlzUmVtb3RlVHVubmVsLCBJVHVubmVsU2VydmljZSwgUmVtb3RlVHVubmVsLCBUdW5uZWxQcml2YWN5SWQsIFR1bm5lbFByb3RvY29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdHVubmVsL2NvbW1vbi90dW5uZWwuanMnO1xuaW1wb3J0IHsgVHVubmVsUHJpdmFjeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGNvcHlBZGRyZXNzSWNvbiwgZm9yd2FyZGVkUG9ydFdpdGhvdXRQcm9jZXNzSWNvbiwgZm9yd2FyZGVkUG9ydFdpdGhQcm9jZXNzSWNvbiwgZm9yd2FyZFBvcnRJY29uLCBsYWJlbFBvcnRJY29uLCBvcGVuQnJvd3Nlckljb24sIG9wZW5QcmV2aWV3SWNvbiwgcG9ydHNWaWV3SWNvbiwgcHJpdmF0ZVBvcnRJY29uLCBzdG9wRm9yd2FyZEljb24gfSBmcm9tICcuL3JlbW90ZUljb25zLmpzJztcbmltcG9ydCB7IElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlcm5hbFVyaU9wZW5lci9jb21tb24vZXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVRhYmxlQ29sdW1uLCBJVGFibGVDb250ZXh0TWVudUV2ZW50LCBJVGFibGVFdmVudCwgSVRhYmxlTW91c2VFdmVudCwgSVRhYmxlUmVuZGVyZXIsIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90YWJsZS90YWJsZS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgU1RBVFVTX0JBUl9SRU1PVEVfSVRFTV9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgQXR0cmlidXRlcywgQ2FuZGlkYXRlUG9ydCwgVHVubmVsLCBUdW5uZWxDbG9zZVJlYXNvbiwgVHVubmVsTW9kZWwsIFR1bm5lbFNvdXJjZSwgZm9yd2FyZGVkUG9ydHNWaWV3RW5hYmxlZCwgbWFrZUFkZHJlc3MsIG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXMsIHBhcnNlQWRkcmVzcyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vdHVubmVsTW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuXG5leHBvcnQgY29uc3Qgb3BlblByZXZpZXdFbmFibGVkQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdvcGVuUHJldmlld0VuYWJsZWQnLCBmYWxzZSk7XG5cbmNsYXNzIFR1bm5lbFRyZWVWaXJ0dWFsRGVsZWdhdGUgaW1wbGVtZW50cyBJVGFibGVWaXJ0dWFsRGVsZWdhdGU8SVR1bm5lbEl0ZW0+IHtcblxuXHRyZWFkb25seSBoZWFkZXJSb3dIZWlnaHQ6IG51bWJlciA9IDIyO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlKSB7IH1cblxuXHRnZXRIZWlnaHQocm93OiBJVHVubmVsSXRlbSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIChyb3cudHVubmVsVHlwZSA9PT0gVHVubmVsVHlwZS5BZGQgJiYgIXRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmdldEVkaXRhYmxlRGF0YSh1bmRlZmluZWQpKSA/IDMwIDogMjI7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUdW5uZWxWaWV3TW9kZWwge1xuXHRyZWFkb25seSBvbkZvcndhcmRlZFBvcnRzQ2hhbmdlZDogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IGFsbDogVHVubmVsSXRlbVtdO1xuXHRyZWFkb25seSBpbnB1dDogVHVubmVsSXRlbTtcblx0aXNFbXB0eSgpOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVHVubmVsVmlld01vZGVsIGltcGxlbWVudHMgSVR1bm5lbFZpZXdNb2RlbCB7XG5cblx0cmVhZG9ubHkgb25Gb3J3YXJkZWRQb3J0c0NoYW5nZWQ6IEV2ZW50PHZvaWQ+O1xuXHRwcml2YXRlIG1vZGVsOiBUdW5uZWxNb2RlbDtcblx0cHJpdmF0ZSBfY2FuZGlkYXRlczogTWFwPHN0cmluZywgQ2FuZGlkYXRlUG9ydD4gPSBuZXcgTWFwKCk7XG5cblx0cmVhZG9ubHkgaW5wdXQgPSB7XG5cdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbHNWaWV3LmFkZFBvcnQnLCBcIkFkZCBQb3J0XCIpLFxuXHRcdGljb246IHVuZGVmaW5lZCxcblx0XHR0dW5uZWxUeXBlOiBUdW5uZWxUeXBlLkFkZCxcblx0XHRoYXNSdW5uaW5nUHJvY2VzczogZmFsc2UsXG5cdFx0cmVtb3RlSG9zdDogJycsXG5cdFx0cmVtb3RlUG9ydDogMCxcblx0XHRwcm9jZXNzRGVzY3JpcHRpb246ICcnLFxuXHRcdHRvb2x0aXBQb3N0Zml4OiAnJyxcblx0XHRpY29uVG9vbHRpcDogJycsXG5cdFx0cG9ydFRvb2x0aXA6ICcnLFxuXHRcdHByb2Nlc3NUb29sdGlwOiAnJyxcblx0XHRvcmlnaW5Ub29sdGlwOiAnJyxcblx0XHRwcml2YWN5VG9vbHRpcDogJycsXG5cdFx0c291cmNlOiB7IHNvdXJjZTogVHVubmVsU291cmNlLlVzZXIsIGRlc2NyaXB0aW9uOiAnJyB9LFxuXHRcdHByb3RvY29sOiBUdW5uZWxQcm90b2NvbC5IdHRwLFxuXHRcdHByaXZhY3k6IHtcblx0XHRcdGlkOiBUdW5uZWxQcml2YWN5SWQuUHJpdmF0ZSxcblx0XHRcdHRoZW1lSWNvbjogcHJpdmF0ZVBvcnRJY29uLmlkLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndHVubmVsUHJpdmFjeS5wcml2YXRlJywgXCJQcml2YXRlXCIpXG5cdFx0fSxcblx0XHRzdHJpcDogKCkgPT4gdW5kZWZpbmVkXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElUdW5uZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5tb2RlbCA9IHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbDtcblx0XHR0aGlzLm9uRm9yd2FyZGVkUG9ydHNDaGFuZ2VkID0gRXZlbnQuYW55KHRoaXMubW9kZWwub25Gb3J3YXJkUG9ydCwgdGhpcy5tb2RlbC5vbkNsb3NlUG9ydCwgdGhpcy5tb2RlbC5vblBvcnROYW1lLCB0aGlzLm1vZGVsLm9uQ2FuZGlkYXRlc0NoYW5nZWQpO1xuXHR9XG5cblx0Z2V0IGFsbCgpOiBUdW5uZWxJdGVtW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogVHVubmVsSXRlbVtdID0gW107XG5cdFx0dGhpcy5fY2FuZGlkYXRlcyA9IG5ldyBNYXAoKTtcblx0XHR0aGlzLm1vZGVsLmNhbmRpZGF0ZXMuZm9yRWFjaChjYW5kaWRhdGUgPT4ge1xuXHRcdFx0dGhpcy5fY2FuZGlkYXRlcy5zZXQobWFrZUFkZHJlc3MoY2FuZGlkYXRlLmhvc3QsIGNhbmRpZGF0ZS5wb3J0KSwgY2FuZGlkYXRlKTtcblx0XHR9KTtcblx0XHRpZiAoKHRoaXMubW9kZWwuZm9yd2FyZGVkLnNpemUgPiAwKSB8fCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5nZXRFZGl0YWJsZURhdGEodW5kZWZpbmVkKSkge1xuXHRcdFx0cmVzdWx0LnB1c2goLi4udGhpcy5mb3J3YXJkZWQpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5tb2RlbC5kZXRlY3RlZC5zaXplID4gMCkge1xuXHRcdFx0cmVzdWx0LnB1c2goLi4udGhpcy5kZXRlY3RlZCk7XG5cdFx0fVxuXG5cdFx0cmVzdWx0LnB1c2godGhpcy5pbnB1dCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYWRkUHJvY2Vzc0luZm9Gcm9tQ2FuZGlkYXRlKHR1bm5lbEl0ZW06IElUdW5uZWxJdGVtKSB7XG5cdFx0Y29uc3Qga2V5ID0gbWFrZUFkZHJlc3ModHVubmVsSXRlbS5yZW1vdGVIb3N0LCB0dW5uZWxJdGVtLnJlbW90ZVBvcnQpO1xuXHRcdGlmICh0aGlzLl9jYW5kaWRhdGVzLmhhcyhrZXkpKSB7XG5cdFx0XHR0dW5uZWxJdGVtLnByb2Nlc3NEZXNjcmlwdGlvbiA9IHRoaXMuX2NhbmRpZGF0ZXMuZ2V0KGtleSkhLmRldGFpbDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBmb3J3YXJkZWQoKTogVHVubmVsSXRlbVtdIHtcblx0XHRjb25zdCBmb3J3YXJkZWQgPSBBcnJheS5mcm9tKHRoaXMubW9kZWwuZm9yd2FyZGVkLnZhbHVlcygpKS5tYXAodHVubmVsID0+IHtcblx0XHRcdGNvbnN0IHR1bm5lbEl0ZW0gPSBUdW5uZWxJdGVtLmNyZWF0ZUZyb21UdW5uZWwodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UsIHRoaXMudHVubmVsU2VydmljZSwgdHVubmVsKTtcblx0XHRcdHRoaXMuYWRkUHJvY2Vzc0luZm9Gcm9tQ2FuZGlkYXRlKHR1bm5lbEl0ZW0pO1xuXHRcdFx0cmV0dXJuIHR1bm5lbEl0ZW07XG5cdFx0fSkuc29ydCgoYTogVHVubmVsSXRlbSwgYjogVHVubmVsSXRlbSkgPT4ge1xuXHRcdFx0aWYgKGEucmVtb3RlUG9ydCA9PT0gYi5yZW1vdGVQb3J0KSB7XG5cdFx0XHRcdHJldHVybiBhLnJlbW90ZUhvc3QgPCBiLnJlbW90ZUhvc3QgPyAtMSA6IDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gYS5yZW1vdGVQb3J0IDwgYi5yZW1vdGVQb3J0ID8gLTEgOiAxO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBmb3J3YXJkZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldCBkZXRlY3RlZCgpOiBUdW5uZWxJdGVtW10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMubW9kZWwuZGV0ZWN0ZWQudmFsdWVzKCkpLm1hcCh0dW5uZWwgPT4ge1xuXHRcdFx0Y29uc3QgdHVubmVsSXRlbSA9IFR1bm5lbEl0ZW0uY3JlYXRlRnJvbVR1bm5lbCh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSwgdGhpcy50dW5uZWxTZXJ2aWNlLCB0dW5uZWwsIFR1bm5lbFR5cGUuRGV0ZWN0ZWQsIGZhbHNlKTtcblx0XHRcdHRoaXMuYWRkUHJvY2Vzc0luZm9Gcm9tQ2FuZGlkYXRlKHR1bm5lbEl0ZW0pO1xuXHRcdFx0cmV0dXJuIHR1bm5lbEl0ZW07XG5cdFx0fSk7XG5cdH1cblxuXHRpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5kZXRlY3RlZC5sZW5ndGggPT09IDApICYmXG5cdFx0XHQoKHRoaXMuZm9yd2FyZGVkLmxlbmd0aCA9PT0gMCkgfHwgKHRoaXMuZm9yd2FyZGVkLmxlbmd0aCA9PT0gMSAmJlxuXHRcdFx0XHQodGhpcy5mb3J3YXJkZWRbMF0udHVubmVsVHlwZSA9PT0gVHVubmVsVHlwZS5BZGQpICYmICF0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5nZXRFZGl0YWJsZURhdGEodW5kZWZpbmVkKSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGVtcHR5Q2VsbChpdGVtOiBJVHVubmVsSXRlbSk6IEFjdGlvbkJhckNlbGwge1xuXHRyZXR1cm4geyBsYWJlbDogJycsIHR1bm5lbDogaXRlbSwgZWRpdElkOiBUdW5uZWxFZGl0SWQuTm9uZSwgdG9vbHRpcDogJycgfTtcbn1cblxuY2xhc3MgSWNvbkNvbHVtbiBpbXBsZW1lbnRzIElUYWJsZUNvbHVtbjxJVHVubmVsSXRlbSwgQWN0aW9uQmFyQ2VsbD4ge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gJyc7XG5cdHJlYWRvbmx5IHRvb2x0aXA6IHN0cmluZyA9ICcnO1xuXHRyZWFkb25seSB3ZWlnaHQ6IG51bWJlciA9IDE7XG5cdHJlYWRvbmx5IG1pbmltdW1XaWR0aCA9IDQwO1xuXHRyZWFkb25seSBtYXhpbXVtV2lkdGggPSA0MDtcblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gJ2FjdGlvbmJhcic7XG5cdHByb2plY3Qocm93OiBJVHVubmVsSXRlbSk6IEFjdGlvbkJhckNlbGwge1xuXHRcdGlmIChyb3cudHVubmVsVHlwZSA9PT0gVHVubmVsVHlwZS5BZGQpIHtcblx0XHRcdHJldHVybiBlbXB0eUNlbGwocm93KTtcblx0XHR9XG5cblx0XHRjb25zdCBpY29uID0gcm93LnByb2Nlc3NEZXNjcmlwdGlvbiA/IGZvcndhcmRlZFBvcnRXaXRoUHJvY2Vzc0ljb24gOiBmb3J3YXJkZWRQb3J0V2l0aG91dFByb2Nlc3NJY29uO1xuXHRcdGxldCB0b29sdGlwOiBzdHJpbmcgPSAnJztcblx0XHRpZiAocm93IGluc3RhbmNlb2YgVHVubmVsSXRlbSkge1xuXHRcdFx0dG9vbHRpcCA9IGAke3Jvdy5pY29uVG9vbHRpcH0gJHtyb3cudG9vbHRpcFBvc3RmaXh9YDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiAnJywgaWNvbiwgdHVubmVsOiByb3csIGVkaXRJZDogVHVubmVsRWRpdElkLk5vbmUsIHRvb2x0aXBcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFBvcnRDb2x1bW4gaW1wbGVtZW50cyBJVGFibGVDb2x1bW48SVR1bm5lbEl0ZW0sIEFjdGlvbkJhckNlbGw+IHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgndHVubmVsLnBvcnRDb2x1bW4ubGFiZWwnLCBcIlBvcnRcIik7XG5cdHJlYWRvbmx5IHRvb2x0aXA6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgndHVubmVsLnBvcnRDb2x1bW4udG9vbHRpcCcsIFwiVGhlIGxhYmVsIGFuZCByZW1vdGUgcG9ydCBudW1iZXIgb2YgdGhlIGZvcndhcmRlZCBwb3J0LlwiKTtcblx0cmVhZG9ubHkgd2VpZ2h0OiBudW1iZXIgPSAxO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnYWN0aW9uYmFyJztcblx0cHJvamVjdChyb3c6IElUdW5uZWxJdGVtKTogQWN0aW9uQmFyQ2VsbCB7XG5cdFx0Y29uc3QgaXNBZGQgPSByb3cudHVubmVsVHlwZSA9PT0gVHVubmVsVHlwZS5BZGQ7XG5cdFx0Y29uc3QgbGFiZWwgPSByb3cubGFiZWw7XG5cdFx0bGV0IHRvb2x0aXA6IHN0cmluZyA9ICcnO1xuXHRcdGlmIChyb3cgaW5zdGFuY2VvZiBUdW5uZWxJdGVtICYmICFpc0FkZCkge1xuXHRcdFx0dG9vbHRpcCA9IGAke3Jvdy5wb3J0VG9vbHRpcH0gJHtyb3cudG9vbHRpcFBvc3RmaXh9YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9vbHRpcCA9IGxhYmVsO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWwsIHR1bm5lbDogcm93LCBtZW51SWQ6IE1lbnVJZC5UdW5uZWxQb3J0SW5saW5lLFxuXHRcdFx0ZWRpdElkOiByb3cudHVubmVsVHlwZSA9PT0gVHVubmVsVHlwZS5BZGQgPyBUdW5uZWxFZGl0SWQuTmV3IDogVHVubmVsRWRpdElkLkxhYmVsLCB0b29sdGlwXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBMb2NhbEFkZHJlc3NDb2x1bW4gaW1wbGVtZW50cyBJVGFibGVDb2x1bW48SVR1bm5lbEl0ZW0sIEFjdGlvbkJhckNlbGw+IHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgndHVubmVsLmFkZHJlc3NDb2x1bW4ubGFiZWwnLCBcIkZvcndhcmRlZCBBZGRyZXNzXCIpO1xuXHRyZWFkb25seSB0b29sdGlwOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3R1bm5lbC5hZGRyZXNzQ29sdW1uLnRvb2x0aXAnLCBcIlRoZSBhZGRyZXNzIHRoYXQgdGhlIGZvcndhcmRlZCBwb3J0IGlzIGF2YWlsYWJsZSBhdC5cIik7XG5cdHJlYWRvbmx5IHdlaWdodDogbnVtYmVyID0gMTtcblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gJ2FjdGlvbmJhcic7XG5cdHByb2plY3Qocm93OiBJVHVubmVsSXRlbSk6IEFjdGlvbkJhckNlbGwge1xuXHRcdGlmIChyb3cudHVubmVsVHlwZSA9PT0gVHVubmVsVHlwZS5BZGQpIHtcblx0XHRcdHJldHVybiBlbXB0eUNlbGwocm93KTtcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbCA9IHJvdy5sb2NhbEFkZHJlc3MgPz8gJyc7XG5cdFx0bGV0IHRvb2x0aXA6IHN0cmluZyA9IGxhYmVsO1xuXHRcdGlmIChyb3cgaW5zdGFuY2VvZiBUdW5uZWxJdGVtKSB7XG5cdFx0XHR0b29sdGlwID0gcm93LnRvb2x0aXBQb3N0Zml4O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWwsXG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5UdW5uZWxMb2NhbEFkZHJlc3NJbmxpbmUsXG5cdFx0XHR0dW5uZWw6IHJvdyxcblx0XHRcdGVkaXRJZDogVHVubmVsRWRpdElkLkxvY2FsUG9ydCxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRtYXJrZG93blRvb2x0aXA6IGxhYmVsID8gTG9jYWxBZGRyZXNzQ29sdW1uLmdldEhvdmVyVGV4dChsYWJlbCkgOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgZ2V0SG92ZXJUZXh0KGxvY2FsQWRkcmVzczogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uIChjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0XHRjb25zdCBlZGl0b3JDb25mID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBtdWx0aUN1cnNvck1vZGlmaWVyOiAnY3RybENtZCcgfCAnYWx0JyB9PignZWRpdG9yJyk7XG5cblx0XHRcdGxldCBjbGlja0xhYmVsID0gJyc7XG5cdFx0XHRpZiAoZWRpdG9yQ29uZi5tdWx0aUN1cnNvck1vZGlmaWVyID09PSAnY3RybENtZCcpIHtcblx0XHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdFx0Y2xpY2tMYWJlbCA9IG5scy5sb2NhbGl6ZSgncG9ydHNMaW5rLmZvbGxvd0xpbmtBbHQubWFjJywgXCJvcHRpb24gKyBjbGlja1wiKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjbGlja0xhYmVsID0gbmxzLmxvY2FsaXplKCdwb3J0c0xpbmsuZm9sbG93TGlua0FsdCcsIFwiYWx0ICsgY2xpY2tcIik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0XHRcdGNsaWNrTGFiZWwgPSBubHMubG9jYWxpemUoJ3BvcnRzTGluay5mb2xsb3dMaW5rQ21kJywgXCJjbWQgKyBjbGlja1wiKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjbGlja0xhYmVsID0gbmxzLmxvY2FsaXplKCdwb3J0c0xpbmsuZm9sbG93TGlua0N0cmwnLCBcImN0cmwgKyBjbGlja1wiKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygnJywgdHJ1ZSk7XG5cdFx0XHRjb25zdCB1cmkgPSBsb2NhbEFkZHJlc3Muc3RhcnRzV2l0aCgnaHR0cCcpID8gbG9jYWxBZGRyZXNzIDogYGh0dHA6Ly8ke2xvY2FsQWRkcmVzc31gO1xuXHRcdFx0cmV0dXJuIG1hcmtkb3duLmFwcGVuZExpbmsodXJpLCAnRm9sbG93IGxpbmsnKS5hcHBlbmRNYXJrZG93bihgICgke2NsaWNrTGFiZWx9KWApO1xuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgUnVubmluZ1Byb2Nlc3NDb2x1bW4gaW1wbGVtZW50cyBJVGFibGVDb2x1bW48SVR1bm5lbEl0ZW0sIEFjdGlvbkJhckNlbGw+IHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgndHVubmVsLnByb2Nlc3NDb2x1bW4ubGFiZWwnLCBcIlJ1bm5pbmcgUHJvY2Vzc1wiKTtcblx0cmVhZG9ubHkgdG9vbHRpcDogc3RyaW5nID0gbmxzLmxvY2FsaXplKCd0dW5uZWwucHJvY2Vzc0NvbHVtbi50b29sdGlwJywgXCJUaGUgY29tbWFuZCBsaW5lIG9mIHRoZSBwcm9jZXNzIHRoYXQgaXMgdXNpbmcgdGhlIHBvcnQuXCIpO1xuXHRyZWFkb25seSB3ZWlnaHQ6IG51bWJlciA9IDI7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdhY3Rpb25iYXInO1xuXHRwcm9qZWN0KHJvdzogSVR1bm5lbEl0ZW0pOiBBY3Rpb25CYXJDZWxsIHtcblx0XHRpZiAocm93LnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkKSB7XG5cdFx0XHRyZXR1cm4gZW1wdHlDZWxsKHJvdyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSByb3cucHJvY2Vzc0Rlc2NyaXB0aW9uID8/ICcnO1xuXHRcdHJldHVybiB7IGxhYmVsLCB0dW5uZWw6IHJvdywgZWRpdElkOiBUdW5uZWxFZGl0SWQuTm9uZSwgdG9vbHRpcDogcm93IGluc3RhbmNlb2YgVHVubmVsSXRlbSA/IHJvdy5wcm9jZXNzVG9vbHRpcCA6ICcnIH07XG5cdH1cbn1cblxuY2xhc3MgT3JpZ2luQ29sdW1uIGltcGxlbWVudHMgSVRhYmxlQ29sdW1uPElUdW5uZWxJdGVtLCBBY3Rpb25CYXJDZWxsPiB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3R1bm5lbC5vcmlnaW5Db2x1bW4ubGFiZWwnLCBcIk9yaWdpblwiKTtcblx0cmVhZG9ubHkgdG9vbHRpcDogc3RyaW5nID0gbmxzLmxvY2FsaXplKCd0dW5uZWwub3JpZ2luQ29sdW1uLnRvb2x0aXAnLCBcIlRoZSBzb3VyY2UgdGhhdCBhIGZvcndhcmRlZCBwb3J0IG9yaWdpbmF0ZXMgZnJvbS4gQ2FuIGJlIGFuIGV4dGVuc2lvbiwgdXNlciBmb3J3YXJkZWQsIHN0YXRpY2FsbHkgZm9yd2FyZGVkLCBvciBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZC5cIik7XG5cdHJlYWRvbmx5IHdlaWdodDogbnVtYmVyID0gMTtcblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gJ2FjdGlvbmJhcic7XG5cdHByb2plY3Qocm93OiBJVHVubmVsSXRlbSk6IEFjdGlvbkJhckNlbGwge1xuXHRcdGlmIChyb3cudHVubmVsVHlwZSA9PT0gVHVubmVsVHlwZS5BZGQpIHtcblx0XHRcdHJldHVybiBlbXB0eUNlbGwocm93KTtcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbCA9IHJvdy5zb3VyY2UuZGVzY3JpcHRpb247XG5cdFx0Y29uc3QgdG9vbHRpcCA9IGAke3JvdyBpbnN0YW5jZW9mIFR1bm5lbEl0ZW0gPyByb3cub3JpZ2luVG9vbHRpcCA6ICcnfS4gJHtyb3cgaW5zdGFuY2VvZiBUdW5uZWxJdGVtID8gcm93LnRvb2x0aXBQb3N0Zml4IDogJyd9YDtcblx0XHRyZXR1cm4geyBsYWJlbCwgbWVudUlkOiBNZW51SWQuVHVubmVsT3JpZ2luSW5saW5lLCB0dW5uZWw6IHJvdywgZWRpdElkOiBUdW5uZWxFZGl0SWQuTm9uZSwgdG9vbHRpcCB9O1xuXHR9XG59XG5cbmNsYXNzIFByaXZhY3lDb2x1bW4gaW1wbGVtZW50cyBJVGFibGVDb2x1bW48SVR1bm5lbEl0ZW0sIEFjdGlvbkJhckNlbGw+IHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgndHVubmVsLnByaXZhY3lDb2x1bW4ubGFiZWwnLCBcIlZpc2liaWxpdHlcIik7XG5cdHJlYWRvbmx5IHRvb2x0aXA6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgndHVubmVsLnByaXZhY3lDb2x1bW4udG9vbHRpcCcsIFwiVGhlIGF2YWlsYWJpbGl0eSBvZiB0aGUgZm9yd2FyZGVkIHBvcnQuXCIpO1xuXHRyZWFkb25seSB3ZWlnaHQ6IG51bWJlciA9IDE7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdhY3Rpb25iYXInO1xuXHRwcm9qZWN0KHJvdzogSVR1bm5lbEl0ZW0pOiBBY3Rpb25CYXJDZWxsIHtcblx0XHRpZiAocm93LnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkKSB7XG5cdFx0XHRyZXR1cm4gZW1wdHlDZWxsKHJvdyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSByb3cucHJpdmFjeT8ubGFiZWw7XG5cdFx0bGV0IHRvb2x0aXA6IHN0cmluZyA9ICcnO1xuXHRcdGlmIChyb3cgaW5zdGFuY2VvZiBUdW5uZWxJdGVtKSB7XG5cdFx0XHR0b29sdGlwID0gYCR7cm93LnByaXZhY3kubGFiZWx9ICR7cm93LnRvb2x0aXBQb3N0Zml4fWA7XG5cdFx0fVxuXHRcdHJldHVybiB7IGxhYmVsLCB0dW5uZWw6IHJvdywgaWNvbjogeyBpZDogcm93LnByaXZhY3kudGhlbWVJY29uIH0sIGVkaXRJZDogVHVubmVsRWRpdElkLk5vbmUsIHRvb2x0aXAgfTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUFjdGlvbkJhclRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSB0ZW1wbGF0ZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGxhYmVsOiBJY29uTGFiZWw7XG5cdGJ1dHRvbj86IEJ1dHRvbjtcblx0aWNvbjogSFRNTEVsZW1lbnQ7XG5cdGFjdGlvbkJhcjogQWN0aW9uQmFyO1xufVxuXG5pbnRlcmZhY2UgQWN0aW9uQmFyQ2VsbCB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGljb24/OiBUaGVtZUljb247XG5cdHRvb2x0aXA6IHN0cmluZztcblx0bWFya2Rvd25Ub29sdGlwPzogKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpID0+IElNYXJrZG93blN0cmluZztcblx0bWVudUlkPzogTWVudUlkO1xuXHR0dW5uZWw6IElUdW5uZWxJdGVtO1xuXHRlZGl0SWQ6IFR1bm5lbEVkaXRJZDtcbn1cblxuY2xhc3MgQWN0aW9uQmFyUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxBY3Rpb25CYXJDZWxsLCBJQWN0aW9uQmFyVGVtcGxhdGVEYXRhPiB7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnYWN0aW9uYmFyJztcblx0cHJpdmF0ZSBpbnB1dERvbmU/OiAoc3VjY2VzczogYm9vbGVhbiwgZmluaXNoRWRpdGluZzogYm9vbGVhbikgPT4gdm9pZDtcblx0cHJpdmF0ZSBfYWN0aW9uUnVubmVyOiBBY3Rpb25SdW5uZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9ob3ZlckRlbGVnYXRlID0gZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyk7XG5cdH1cblxuXHRzZXQgYWN0aW9uUnVubmVyKGFjdGlvblJ1bm5lcjogQWN0aW9uUnVubmVyKSB7XG5cdFx0dGhpcy5fYWN0aW9uUnVubmVyID0gYWN0aW9uUnVubmVyO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElBY3Rpb25CYXJUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGNlbGwgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5wb3J0cy12aWV3LWFjdGlvbmJhci1jZWxsJykpO1xuXHRcdGNvbnN0IGljb24gPSBkb20uYXBwZW5kKGNlbGwsIGRvbS4kKCcucG9ydHMtdmlldy1hY3Rpb25iYXItY2VsbC1pY29uJykpO1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKGVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbGFiZWwgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgSWNvbkxhYmVsKGNlbGwsXG5cdFx0XHR7XG5cdFx0XHRcdHN1cHBvcnRIaWdobGlnaHRzOiB0cnVlLFxuXHRcdFx0XHRob3ZlckRlbGVnYXRlOiB0aGlzLl9ob3ZlckRlbGVnYXRlXG5cdFx0XHR9KSk7XG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQoY2VsbCwgZG9tLiQoJy5hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb25CYXIoYWN0aW9uc0NvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogY3JlYXRlQWN0aW9uVmlld0l0ZW0uYmluZCh1bmRlZmluZWQsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZTogdGhpcy5faG92ZXJEZWxlZ2F0ZVxuXHRcdH0pKTtcblx0XHRyZXR1cm4geyBsYWJlbCwgaWNvbiwgYWN0aW9uQmFyLCBjb250YWluZXI6IGNlbGwsIHRlbXBsYXRlRGlzcG9zYWJsZXMsIGVsZW1lbnREaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBBY3Rpb25CYXJDZWxsLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBY3Rpb25CYXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHQvLyByZXNldFxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSAncG9ydHMtdmlldy1hY3Rpb25iYXItY2VsbC1pY29uJztcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbCgnJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcyMnB4Jztcblx0XHRpZiAodGVtcGxhdGVEYXRhLmJ1dHRvbikge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuc3R5bGUucGFkZGluZ0xlZnQgPSAnMHB4JztcblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXG5cdFx0bGV0IGVkaXRhYmxlRGF0YTogSUVkaXRhYmxlRGF0YSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZWxlbWVudC5lZGl0SWQgPT09IFR1bm5lbEVkaXRJZC5OZXcgJiYgKGVkaXRhYmxlRGF0YSA9IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmdldEVkaXRhYmxlRGF0YSh1bmRlZmluZWQpKSkge1xuXHRcdFx0dGhpcy5yZW5kZXJJbnB1dEJveCh0ZW1wbGF0ZURhdGEsIGVkaXRhYmxlRGF0YSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVkaXRhYmxlRGF0YSA9IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmdldEVkaXRhYmxlRGF0YShlbGVtZW50LnR1bm5lbCwgZWxlbWVudC5lZGl0SWQpO1xuXHRcdFx0aWYgKGVkaXRhYmxlRGF0YSkge1xuXHRcdFx0XHR0aGlzLnJlbmRlcklucHV0Qm94KHRlbXBsYXRlRGF0YSwgZWRpdGFibGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoKGVsZW1lbnQudHVubmVsLnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkKSAmJiAoZWxlbWVudC5tZW51SWQgPT09IE1lbnVJZC5UdW5uZWxQb3J0SW5saW5lKSkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckJ1dHRvbihlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJBY3Rpb25CYXJJdGVtKGVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyQnV0dG9uKGVsZW1lbnQ6IEFjdGlvbkJhckNlbGwsIHRlbXBsYXRlRGF0YTogSUFjdGlvbkJhclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuc3R5bGUucGFkZGluZ0xlZnQgPSAnN3B4Jztcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcyOHB4Jztcblx0XHR0ZW1wbGF0ZURhdGEuYnV0dG9uID0gdGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbih0ZW1wbGF0ZURhdGEuY29udGFpbmVyLCBkZWZhdWx0QnV0dG9uU3R5bGVzKSk7XG5cdFx0dGVtcGxhdGVEYXRhLmJ1dHRvbi5sYWJlbCA9IGVsZW1lbnQubGFiZWw7XG5cdFx0dGVtcGxhdGVEYXRhLmJ1dHRvbi5lbGVtZW50LnRpdGxlID0gZWxlbWVudC50b29sdGlwO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRlbXBsYXRlRGF0YS5idXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEZvcndhcmRQb3J0QWN0aW9uLklOTElORV9JRCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB0dW5uZWxDb250ZXh0KHR1bm5lbDogSVR1bm5lbEl0ZW0pOiBJVHVubmVsSXRlbSB7XG5cdFx0bGV0IGNvbnRleHQ6IElUdW5uZWxJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0dW5uZWwgaW5zdGFuY2VvZiBUdW5uZWxJdGVtKSB7XG5cdFx0XHRjb250ZXh0ID0gdHVubmVsLnN0cmlwKCk7XG5cdFx0fVxuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0Y29udGV4dCA9IHtcblx0XHRcdFx0dHVubmVsVHlwZTogdHVubmVsLnR1bm5lbFR5cGUsXG5cdFx0XHRcdHJlbW90ZUhvc3Q6IHR1bm5lbC5yZW1vdGVIb3N0LFxuXHRcdFx0XHRyZW1vdGVQb3J0OiB0dW5uZWwucmVtb3RlUG9ydCxcblx0XHRcdFx0bG9jYWxBZGRyZXNzOiB0dW5uZWwubG9jYWxBZGRyZXNzLFxuXHRcdFx0XHRwcm90b2NvbDogdHVubmVsLnByb3RvY29sLFxuXHRcdFx0XHRsb2NhbFVyaTogdHVubmVsLmxvY2FsVXJpLFxuXHRcdFx0XHRsb2NhbFBvcnQ6IHR1bm5lbC5sb2NhbFBvcnQsXG5cdFx0XHRcdG5hbWU6IHR1bm5lbC5uYW1lLFxuXHRcdFx0XHRjbG9zZWFibGU6IHR1bm5lbC5jbG9zZWFibGUsXG5cdFx0XHRcdHNvdXJjZTogdHVubmVsLnNvdXJjZSxcblx0XHRcdFx0cHJpdmFjeTogdHVubmVsLnByaXZhY3ksXG5cdFx0XHRcdHByb2Nlc3NEZXNjcmlwdGlvbjogdHVubmVsLnByb2Nlc3NEZXNjcmlwdGlvbixcblx0XHRcdFx0bGFiZWw6IHR1bm5lbC5sYWJlbFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRleHQ7XG5cdH1cblxuXHRyZW5kZXJBY3Rpb25CYXJJdGVtKGVsZW1lbnQ6IEFjdGlvbkJhckNlbGwsIHRlbXBsYXRlRGF0YTogSUFjdGlvbkJhclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKGVsZW1lbnQubGFiZWwsIHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0dGl0bGU6IGVsZW1lbnQubWFya2Rvd25Ub29sdGlwID9cblx0XHRcdFx0XHR7IG1hcmtkb3duOiBlbGVtZW50Lm1hcmtkb3duVG9vbHRpcCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgbWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogZWxlbWVudC50b29sdGlwIH1cblx0XHRcdFx0XHQ6IGVsZW1lbnQudG9vbHRpcCxcblx0XHRcdFx0ZXh0cmFDbGFzc2VzOiBlbGVtZW50Lm1lbnVJZCA9PT0gTWVudUlkLlR1bm5lbExvY2FsQWRkcmVzc0lubGluZSA/IFsncG9ydHMtdmlldy1hY3Rpb25iYXItY2VsbC1sb2NhbGFkZHJlc3MnXSA6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jb250ZXh0ID0gdGhpcy50dW5uZWxDb250ZXh0KGVsZW1lbnQudHVubmVsKTtcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzEwcHgnO1xuXHRcdGNvbnN0IGNvbnRleHQ6IFtzdHJpbmcsIGFueV1bXSA9XG5cdFx0XHRbXG5cdFx0XHRcdFsndmlldycsIFRVTk5FTF9WSUVXX0lEXSxcblx0XHRcdFx0W1R1bm5lbFR5cGVDb250ZXh0S2V5LmtleSwgZWxlbWVudC50dW5uZWwudHVubmVsVHlwZV0sXG5cdFx0XHRcdFtUdW5uZWxDbG9zZWFibGVDb250ZXh0S2V5LmtleSwgZWxlbWVudC50dW5uZWwuY2xvc2VhYmxlXSxcblx0XHRcdFx0W1R1bm5lbFByaXZhY3lDb250ZXh0S2V5LmtleSwgZWxlbWVudC50dW5uZWwucHJpdmFjeS5pZF0sXG5cdFx0XHRcdFtUdW5uZWxQcm90b2NvbENvbnRleHRLZXkua2V5LCBlbGVtZW50LnR1bm5lbC5wcm90b2NvbF1cblx0XHRcdF07XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoY29udGV4dCk7XG5cdFx0aWYgKGVsZW1lbnQubWVudUlkKSB7XG5cdFx0XHRjb25zdCBtZW51ID0gdGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KGVsZW1lbnQubWVudUlkLCBjb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdFx0bGV0IGFjdGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KSk7XG5cdFx0XHRpZiAoYWN0aW9ucykge1xuXHRcdFx0XHRjb25zdCBsYWJlbEFjdGlvbnMgPSBhY3Rpb25zLmZpbHRlcihhY3Rpb24gPT4gYWN0aW9uLmlkLnRvTG93ZXJDYXNlKCkuaW5kZXhPZignbGFiZWwnKSA+PSAwKTtcblx0XHRcdFx0aWYgKGxhYmVsQWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0bGFiZWxBY3Rpb25zLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubGVuZ3RoIC0gYi5sYWJlbC5sZW5ndGgpO1xuXHRcdFx0XHRcdGxhYmVsQWN0aW9ucy5wb3AoKTtcblx0XHRcdFx0XHRhY3Rpb25zID0gYWN0aW9ucy5maWx0ZXIoYWN0aW9uID0+IGxhYmVsQWN0aW9ucy5pbmRleE9mKGFjdGlvbikgPCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2goYWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0XHRcdGlmICh0aGlzLl9hY3Rpb25SdW5uZXIpIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmFjdGlvblJ1bm5lciA9IHRoaXMuX2FjdGlvblJ1bm5lcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZWxlbWVudC5pY29uKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSBgcG9ydHMtdmlldy1hY3Rpb25iYXItY2VsbC1pY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGVsZW1lbnQuaWNvbil9YDtcblx0XHRcdHRlbXBsYXRlRGF0YS5pY29uLnRpdGxlID0gZWxlbWVudC50b29sdGlwO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmljb24uc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySW5wdXRCb3godGVtcGxhdGVEYXRhOiBJQWN0aW9uQmFyVGVtcGxhdGVEYXRhLCBlZGl0YWJsZURhdGE6IElFZGl0YWJsZURhdGEpOiB2b2lkIHtcblx0XHQvLyBSZXF1aXJlZCBmb3IgRmlyZUZveC4gVGhlIGJsdXIgZXZlbnQgZG9lc24ndCBmaXJlIG9uIEZpcmVGb3ggd2hlbiB5b3UganVzdCBtYXNoIHRoZSBcIitcIiBidXR0b24gdG8gZm9yd2FyZCBhIHBvcnQuXG5cdFx0aWYgKHRoaXMuaW5wdXREb25lKSB7XG5cdFx0XHR0aGlzLmlucHV0RG9uZShmYWxzZSwgZmFsc2UpO1xuXHRcdFx0dGhpcy5pbnB1dERvbmUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHsgY29udGFpbmVyIH0gPSB0ZW1wbGF0ZURhdGE7XG5cdFx0Y29udGFpbmVyLnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzVweCc7XG5cdFx0Y29uc3QgdmFsdWUgPSBlZGl0YWJsZURhdGEuc3RhcnRpbmdWYWx1ZSB8fCAnJztcblx0XHRjb25zdCBpbnB1dEJveCA9IG5ldyBJbnB1dEJveChjb250YWluZXIsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRhcmlhTGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbHNWaWV3LmlucHV0JywgXCJQcmVzcyBFbnRlciB0byBjb25maXJtIG9yIEVzY2FwZSB0byBjYW5jZWwuXCIpLFxuXHRcdFx0dmFsaWRhdGlvbk9wdGlvbnM6IHtcblx0XHRcdFx0dmFsaWRhdGlvbjogKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVkaXRhYmxlRGF0YS52YWxpZGF0aW9uTWVzc2FnZSh2YWx1ZSk7XG5cdFx0XHRcdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y29udGVudDogbWVzc2FnZS5jb250ZW50LFxuXHRcdFx0XHRcdFx0Zm9ybWF0Q29udGVudDogdHJ1ZSxcblx0XHRcdFx0XHRcdHR5cGU6IG1lc3NhZ2Uuc2V2ZXJpdHkgPT09IFNldmVyaXR5LkVycm9yID8gTWVzc2FnZVR5cGUuRVJST1IgOiBNZXNzYWdlVHlwZS5JTkZPXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHBsYWNlaG9sZGVyOiBlZGl0YWJsZURhdGEucGxhY2Vob2xkZXIgfHwgJycsXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzXG5cdFx0fSk7XG5cdFx0aW5wdXRCb3gudmFsdWUgPSB2YWx1ZTtcblx0XHRpbnB1dEJveC5mb2N1cygpO1xuXHRcdGlucHV0Qm94LnNlbGVjdCh7IHN0YXJ0OiAwLCBlbmQ6IGVkaXRhYmxlRGF0YS5zdGFydGluZ1ZhbHVlID8gZWRpdGFibGVEYXRhLnN0YXJ0aW5nVmFsdWUubGVuZ3RoIDogMCB9KTtcblxuXHRcdGNvbnN0IGRvbmUgPSBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oYXN5bmMgKHN1Y2Nlc3M6IGJvb2xlYW4sIGZpbmlzaEVkaXRpbmc6IGJvb2xlYW4pID0+IHtcblx0XHRcdGRpc3Bvc2UodG9EaXNwb3NlKTtcblx0XHRcdGlmICh0aGlzLmlucHV0RG9uZSkge1xuXHRcdFx0XHR0aGlzLmlucHV0RG9uZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlucHV0Qm94LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdGNvbnN0IGlucHV0VmFsdWUgPSBpbnB1dEJveC52YWx1ZTtcblx0XHRcdGlmIChmaW5pc2hFZGl0aW5nKSB7XG5cdFx0XHRcdHJldHVybiBlZGl0YWJsZURhdGEub25GaW5pc2goaW5wdXRWYWx1ZSwgc3VjY2Vzcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5pbnB1dERvbmUgPSBkb25lO1xuXG5cdFx0Y29uc3QgdG9EaXNwb3NlID0gW1xuXHRcdFx0aW5wdXRCb3gsXG5cdFx0XHRkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRCb3guaW5wdXRFbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBhc3luYyAoZTogSUtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRpZiAoaW5wdXRCb3gudmFsaWRhdGUoKSAhPT0gTWVzc2FnZVR5cGUuRVJST1IpIHtcblx0XHRcdFx0XHRcdHJldHVybiBkb25lKHRydWUsIHRydWUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZG9uZShmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHJldHVybiBkb25lKGZhbHNlLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHRkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgZG9tLkV2ZW50VHlwZS5CTFVSLCAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBkb25lKGlucHV0Qm94LnZhbGlkYXRlKCkgIT09IE1lc3NhZ2VUeXBlLkVSUk9SLCB0cnVlKTtcblx0XHRcdH0pXG5cdFx0XTtcblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRkb25lKGZhbHNlLCBmYWxzZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogQWN0aW9uQmFyQ2VsbCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQWN0aW9uQmFyVGVtcGxhdGVEYXRhKSB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUFjdGlvbkJhclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBUdW5uZWxJdGVtIGltcGxlbWVudHMgSVR1bm5lbEl0ZW0ge1xuXHRzdGF0aWMgY3JlYXRlRnJvbVR1bm5lbChyZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsIHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLFxuXHRcdHR1bm5lbDogVHVubmVsLCB0eXBlOiBUdW5uZWxUeXBlID0gVHVubmVsVHlwZS5Gb3J3YXJkZWQsIGNsb3NlYWJsZT86IGJvb2xlYW4pIHtcblx0XHRyZXR1cm4gbmV3IFR1bm5lbEl0ZW0odHlwZSxcblx0XHRcdHR1bm5lbC5yZW1vdGVIb3N0LFxuXHRcdFx0dHVubmVsLnJlbW90ZVBvcnQsXG5cdFx0XHR0dW5uZWwuc291cmNlLFxuXHRcdFx0ISF0dW5uZWwuaGFzUnVubmluZ1Byb2Nlc3MsXG5cdFx0XHR0dW5uZWwucHJvdG9jb2wsXG5cdFx0XHR0dW5uZWwubG9jYWxVcmksXG5cdFx0XHR0dW5uZWwubG9jYWxBZGRyZXNzLFxuXHRcdFx0dHVubmVsLmxvY2FsUG9ydCxcblx0XHRcdGNsb3NlYWJsZSA9PT0gdW5kZWZpbmVkID8gdHVubmVsLmNsb3NlYWJsZSA6IGNsb3NlYWJsZSxcblx0XHRcdHR1bm5lbC5uYW1lLFxuXHRcdFx0dHVubmVsLnJ1bm5pbmdQcm9jZXNzLFxuXHRcdFx0dHVubmVsLnBpZCxcblx0XHRcdHR1bm5lbC5wcml2YWN5LFxuXHRcdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdFx0dHVubmVsU2VydmljZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhbGwgbm9uLXNlcmlhbGl6YWJsZSBwcm9wZXJ0aWVzIGZyb20gdGhlIHR1bm5lbFxuXHQgKiBAcmV0dXJucyBBIG5ldyBUdW5uZWxJdGVtIHdpdGhvdXQgYW55IHNlcnZpY2VzXG5cdCAqL1xuXHRwdWJsaWMgc3RyaXAoKTogVHVubmVsSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIG5ldyBUdW5uZWxJdGVtKFxuXHRcdFx0dGhpcy50dW5uZWxUeXBlLFxuXHRcdFx0dGhpcy5yZW1vdGVIb3N0LFxuXHRcdFx0dGhpcy5yZW1vdGVQb3J0LFxuXHRcdFx0dGhpcy5zb3VyY2UsXG5cdFx0XHR0aGlzLmhhc1J1bm5pbmdQcm9jZXNzLFxuXHRcdFx0dGhpcy5wcm90b2NvbCxcblx0XHRcdHRoaXMubG9jYWxVcmksXG5cdFx0XHR0aGlzLmxvY2FsQWRkcmVzcyxcblx0XHRcdHRoaXMubG9jYWxQb3J0LFxuXHRcdFx0dGhpcy5jbG9zZWFibGUsXG5cdFx0XHR0aGlzLm5hbWUsXG5cdFx0XHR0aGlzLnJ1bm5pbmdQcm9jZXNzLFxuXHRcdFx0dGhpcy5waWQsXG5cdFx0XHR0aGlzLl9wcml2YWN5XG5cdFx0KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyB0dW5uZWxUeXBlOiBUdW5uZWxUeXBlLFxuXHRcdHB1YmxpYyByZW1vdGVIb3N0OiBzdHJpbmcsXG5cdFx0cHVibGljIHJlbW90ZVBvcnQ6IG51bWJlcixcblx0XHRwdWJsaWMgc291cmNlOiB7IHNvdXJjZTogVHVubmVsU291cmNlOyBkZXNjcmlwdGlvbjogc3RyaW5nIH0sXG5cdFx0cHVibGljIGhhc1J1bm5pbmdQcm9jZXNzOiBib29sZWFuLFxuXHRcdHB1YmxpYyBwcm90b2NvbDogVHVubmVsUHJvdG9jb2wsXG5cdFx0cHVibGljIGxvY2FsVXJpPzogVVJJLFxuXHRcdHB1YmxpYyBsb2NhbEFkZHJlc3M/OiBzdHJpbmcsXG5cdFx0cHVibGljIGxvY2FsUG9ydD86IG51bWJlcixcblx0XHRwdWJsaWMgY2xvc2VhYmxlPzogYm9vbGVhbixcblx0XHRwdWJsaWMgbmFtZT86IHN0cmluZyxcblx0XHRwcml2YXRlIHJ1bm5pbmdQcm9jZXNzPzogc3RyaW5nLFxuXHRcdHByaXZhdGUgcGlkPzogbnVtYmVyLFxuXHRcdHByaXZhdGUgX3ByaXZhY3k/OiBUdW5uZWxQcml2YWN5SWQgfCBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZW1vdGVFeHBsb3JlclNlcnZpY2U/OiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgdHVubmVsU2VydmljZT86IElUdW5uZWxTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMudHVubmVsVHlwZSA9PT0gVHVubmVsVHlwZS5BZGQgJiYgdGhpcy5uYW1lKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5uYW1lO1xuXHRcdH1cblx0XHRjb25zdCBwb3J0TnVtYmVyTGFiZWwgPSAoaXNMb2NhbGhvc3QodGhpcy5yZW1vdGVIb3N0KSB8fCBpc0FsbEludGVyZmFjZXModGhpcy5yZW1vdGVIb3N0KSlcblx0XHRcdD8gYCR7dGhpcy5yZW1vdGVQb3J0fWBcblx0XHRcdDogYCR7dGhpcy5yZW1vdGVIb3N0fToke3RoaXMucmVtb3RlUG9ydH1gO1xuXHRcdGlmICh0aGlzLm5hbWUpIHtcblx0XHRcdHJldHVybiBgJHt0aGlzLm5hbWV9ICgke3BvcnROdW1iZXJMYWJlbH0pYDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHBvcnROdW1iZXJMYWJlbDtcblx0XHR9XG5cdH1cblxuXHRzZXQgcHJvY2Vzc0Rlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLnJ1bm5pbmdQcm9jZXNzID0gZGVzY3JpcHRpb247XG5cdH1cblxuXHRnZXQgcHJvY2Vzc0Rlc2NyaXB0aW9uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmcgPSAnJztcblx0XHRpZiAodGhpcy5ydW5uaW5nUHJvY2Vzcykge1xuXHRcdFx0aWYgKHRoaXMucGlkICYmIHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlPy5uYW1lZFByb2Nlc3Nlcy5oYXModGhpcy5waWQpKSB7XG5cdFx0XHRcdC8vIFRoaXMgaXMgYSBrbm93biBwcm9jZXNzLiBHaXZlIGl0IGEgZnJpZW5kbHkgbmFtZS5cblx0XHRcdFx0ZGVzY3JpcHRpb24gPSB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5uYW1lZFByb2Nlc3Nlcy5nZXQodGhpcy5waWQpITtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gdGhpcy5ydW5uaW5nUHJvY2Vzcy5yZXBsYWNlKC9cXDAvZywgJyAnKS50cmltKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5waWQpIHtcblx0XHRcdFx0ZGVzY3JpcHRpb24gKz0gYCAoJHt0aGlzLnBpZH0pYDtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMuaGFzUnVubmluZ1Byb2Nlc3MpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gbmxzLmxvY2FsaXplKCd0dW5uZWxWaWV3LnJ1bm5pbmdQcm9jZXNzLmluYWNlc3NhYmxlJywgXCJQcm9jZXNzIGluZm9ybWF0aW9uIHVuYXZhaWxhYmxlXCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBkZXNjcmlwdGlvbjtcblx0fVxuXG5cdGdldCB0b29sdGlwUG9zdGZpeCgpOiBzdHJpbmcge1xuXHRcdGxldCBpbmZvcm1hdGlvbjogc3RyaW5nO1xuXHRcdGlmICh0aGlzLmxvY2FsQWRkcmVzcykge1xuXHRcdFx0aW5mb3JtYXRpb24gPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwudG9vbHRpcEZvcndhcmRlZCcsIFwiUmVtb3RlIHBvcnQgezB9OnsxfSBmb3J3YXJkZWQgdG8gbG9jYWwgYWRkcmVzcyB7Mn0uIFwiLCB0aGlzLnJlbW90ZUhvc3QsIHRoaXMucmVtb3RlUG9ydCwgdGhpcy5sb2NhbEFkZHJlc3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbmZvcm1hdGlvbiA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC50b29sdGlwQ2FuZGlkYXRlJywgXCJSZW1vdGUgcG9ydCB7MH06ezF9IG5vdCBmb3J3YXJkZWQuIFwiLCB0aGlzLnJlbW90ZUhvc3QsIHRoaXMucmVtb3RlUG9ydCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZm9ybWF0aW9uO1xuXHR9XG5cblx0Z2V0IGljb25Ub29sdGlwKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaXNBZGQgPSB0aGlzLnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkO1xuXHRcdGlmICghaXNBZGQpIHtcblx0XHRcdHJldHVybiBgJHt0aGlzLnByb2Nlc3NEZXNjcmlwdGlvbiA/IG5scy5sb2NhbGl6ZSgndHVubmVsLmljb25Db2x1bW4ucnVubmluZycsIFwiUG9ydCBoYXMgcnVubmluZyBwcm9jZXNzLlwiKSA6XG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndHVubmVsLmljb25Db2x1bW4ubm90UnVubmluZycsIFwiTm8gcnVubmluZyBwcm9jZXNzLlwiKX1gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sYWJlbDtcblx0XHR9XG5cdH1cblxuXHRnZXQgcG9ydFRvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRjb25zdCBpc0FkZCA9IHRoaXMudHVubmVsVHlwZSA9PT0gVHVubmVsVHlwZS5BZGQ7XG5cdFx0aWYgKCFpc0FkZCkge1xuXHRcdFx0cmV0dXJuIGAke3RoaXMubmFtZSA/IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC50b29sdGlwTmFtZScsIFwiUG9ydCBsYWJlbGVkIHswfS4gXCIsIHRoaXMubmFtZSkgOiAnJ31gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHByb2Nlc3NUb29sdGlwKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMucHJvY2Vzc0Rlc2NyaXB0aW9uID8/ICcnO1xuXHR9XG5cblx0Z2V0IG9yaWdpblRvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zb3VyY2UuZGVzY3JpcHRpb247XG5cdH1cblxuXHRnZXQgcHJpdmFjeSgpOiBUdW5uZWxQcml2YWN5IHtcblx0XHRpZiAodGhpcy50dW5uZWxTZXJ2aWNlPy5wcml2YWN5T3B0aW9ucykge1xuXHRcdFx0cmV0dXJuIHRoaXMudHVubmVsU2VydmljZT8ucHJpdmFjeU9wdGlvbnMuZmluZChlbGVtZW50ID0+IGVsZW1lbnQuaWQgPT09IHRoaXMuX3ByaXZhY3kpID8/XG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnJyxcblx0XHRcdFx0dGhlbWVJY29uOiBDb2RpY29uLnF1ZXN0aW9uLmlkLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCd0dW5uZWxQcml2YWN5LnVua25vd24nLCBcIlVua25vd25cIilcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBUdW5uZWxQcml2YWN5SWQuUHJpdmF0ZSxcblx0XHRcdFx0dGhlbWVJY29uOiBwcml2YXRlUG9ydEljb24uaWQsXG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3R1bm5lbFByaXZhY3kucHJpdmF0ZScsIFwiUHJpdmF0ZVwiKVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgVHVubmVsVHlwZUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxUdW5uZWxUeXBlPigndHVubmVsVHlwZScsIFR1bm5lbFR5cGUuQWRkLCB0cnVlKTtcbmNvbnN0IFR1bm5lbENsb3NlYWJsZUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndHVubmVsQ2xvc2VhYmxlJywgZmFsc2UsIHRydWUpO1xuY29uc3QgVHVubmVsUHJpdmFjeUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxUdW5uZWxQcml2YWN5SWQgfCBzdHJpbmcgfCB1bmRlZmluZWQ+KCd0dW5uZWxQcml2YWN5JywgdW5kZWZpbmVkLCB0cnVlKTtcbmNvbnN0IFR1bm5lbFByaXZhY3lFbmFibGVkQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd0dW5uZWxQcml2YWN5RW5hYmxlZCcsIGZhbHNlLCB0cnVlKTtcbmNvbnN0IFR1bm5lbFByb3RvY29sQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PFR1bm5lbFByb3RvY29sIHwgdW5kZWZpbmVkPigndHVubmVsUHJvdG9jb2wnLCBUdW5uZWxQcm90b2NvbC5IdHRwLCB0cnVlKTtcbmNvbnN0IFR1bm5lbFZpZXdGb2N1c0NvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndHVubmVsVmlld0ZvY3VzJywgZmFsc2UsIG5scy5sb2NhbGl6ZSgndHVubmVsLmZvY3VzQ29udGV4dCcsIFwiV2hldGhlciB0aGUgUG9ydHMgdmlldyBoYXMgZm9jdXMuXCIpKTtcbmNvbnN0IFR1bm5lbFZpZXdTZWxlY3Rpb25LZXlOYW1lID0gJ3R1bm5lbFZpZXdTZWxlY3Rpb24nO1xuLy8gaG9zdDpwb3J0XG5jb25zdCBUdW5uZWxWaWV3U2VsZWN0aW9uQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZyB8IHVuZGVmaW5lZD4oVHVubmVsVmlld1NlbGVjdGlvbktleU5hbWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5jb25zdCBUdW5uZWxWaWV3TXVsdGlTZWxlY3Rpb25LZXlOYW1lID0gJ3R1bm5lbFZpZXdNdWx0aVNlbGVjdGlvbic7XG4vLyBob3N0OnBvcnRbXVxuY29uc3QgVHVubmVsVmlld011bHRpU2VsZWN0aW9uQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZ1tdIHwgdW5kZWZpbmVkPihUdW5uZWxWaWV3TXVsdGlTZWxlY3Rpb25LZXlOYW1lLCB1bmRlZmluZWQsIHRydWUpO1xuY29uc3QgUG9ydENoYW5nYWJsZUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigncG9ydENoYW5nYWJsZScsIGZhbHNlLCB0cnVlKTtcbmNvbnN0IFByb3RvY29sQ2hhbmdlYWJsZUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigncHJvdG9jb2xDaGFuZ2FibGUnLCB0cnVlLCB0cnVlKTtcblxuZXhwb3J0IGNsYXNzIFR1bm5lbFBhbmVsIGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IFRVTk5FTF9WSUVXX0lEO1xuXHRzdGF0aWMgcmVhZG9ubHkgVElUTEU6IElMb2NhbGl6ZWRTdHJpbmcgPSBubHMubG9jYWxpemUyKCdyZW1vdGUudHVubmVsJywgXCJQb3J0c1wiKTtcblxuXHRwcml2YXRlIHBhbmVsQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0YWJsZTogV29ya2JlbmNoVGFibGU8SVR1bm5lbEl0ZW0+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRhYmxlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgdHVubmVsVHlwZUNvbnRleHQ6IElDb250ZXh0S2V5PFR1bm5lbFR5cGU+O1xuXHRwcml2YXRlIHR1bm5lbENsb3NlYWJsZUNvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHR1bm5lbFByaXZhY3lDb250ZXh0OiBJQ29udGV4dEtleTxUdW5uZWxQcml2YWN5SWQgfCBzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHR1bm5lbFByaXZhY3lFbmFibGVkQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgdHVubmVsUHJvdG9jb2xDb250ZXh0OiBJQ29udGV4dEtleTxUdW5uZWxQcm90b2NvbCB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgdHVubmVsVmlld0ZvY3VzQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgdHVubmVsVmlld1NlbGVjdGlvbkNvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgdHVubmVsVmlld011bHRpU2VsZWN0aW9uQ29udGV4dDogSUNvbnRleHRLZXk8c3RyaW5nW10gfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHBvcnRDaGFuZ2FibGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBwcm90b2NvbENoYW5nYWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGlzRWRpdGluZzogYm9vbGVhbiA9IGZhbHNlO1xuXHQvLyBUT0RPOiBTaG91bGQgdGhpcyBiZSByZW1vdmVkP1xuXHQvL0B0cy1leHBlY3QtZXJyb3Jcblx0cHJpdmF0ZSB0aXRsZUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRwcml2YXRlIGxhc3RGb2N1czogbnVtYmVyW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgdmlld01vZGVsOiBJVHVubmVsVmlld01vZGVsLFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJvdGVjdGVkIHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcm90ZWN0ZWQgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJVHVubmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0XHR0aGlzLnR1bm5lbFR5cGVDb250ZXh0ID0gVHVubmVsVHlwZUNvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnR1bm5lbENsb3NlYWJsZUNvbnRleHQgPSBUdW5uZWxDbG9zZWFibGVDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50dW5uZWxQcml2YWN5Q29udGV4dCA9IFR1bm5lbFByaXZhY3lDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50dW5uZWxQcml2YWN5RW5hYmxlZENvbnRleHQgPSBUdW5uZWxQcml2YWN5RW5hYmxlZENvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnR1bm5lbFByaXZhY3lFbmFibGVkQ29udGV4dC5zZXQodHVubmVsU2VydmljZS5jYW5DaGFuZ2VQcml2YWN5KTtcblx0XHR0aGlzLnByb3RvY29sQ2hhbmdhYmxlQ29udGV4dEtleSA9IFByb3RvY29sQ2hhbmdlYWJsZUNvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnByb3RvY29sQ2hhbmdhYmxlQ29udGV4dEtleS5zZXQodHVubmVsU2VydmljZS5jYW5DaGFuZ2VQcm90b2NvbCk7XG5cdFx0dGhpcy50dW5uZWxQcm90b2NvbENvbnRleHQgPSBUdW5uZWxQcm90b2NvbENvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnR1bm5lbFZpZXdGb2N1c0NvbnRleHQgPSBUdW5uZWxWaWV3Rm9jdXNDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50dW5uZWxWaWV3U2VsZWN0aW9uQ29udGV4dCA9IFR1bm5lbFZpZXdTZWxlY3Rpb25Db250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50dW5uZWxWaWV3TXVsdGlTZWxlY3Rpb25Db250ZXh0ID0gVHVubmVsVmlld011bHRpU2VsZWN0aW9uQ29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucG9ydENoYW5nYWJsZUNvbnRleHRLZXkgPSBQb3J0Q2hhbmdhYmxlQ29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgb3ZlcmxheUNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtbJ3ZpZXcnLCBUdW5uZWxQYW5lbC5JRF1dKTtcblx0XHRjb25zdCB0aXRsZU1lbnUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLlR1bm5lbFRpdGxlLCBvdmVybGF5Q29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRjb25zdCB1cGRhdGVBY3Rpb25zID0gKCkgPT4ge1xuXHRcdFx0dGhpcy50aXRsZUFjdGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyh0aXRsZU1lbnUuZ2V0QWN0aW9ucygpKTtcblx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucygpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aXRsZU1lbnUub25EaWRDaGFuZ2UodXBkYXRlQWN0aW9ucykpO1xuXHRcdHVwZGF0ZUFjdGlvbnMoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnRpdGxlQWN0aW9ucyA9IFtdO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJQcml2YWN5QWN0aW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50Lm9uY2UodGhpcy50dW5uZWxTZXJ2aWNlLm9uQWRkZWRUdW5uZWxQcm92aWRlcikoKCkgPT4ge1xuXHRcdFx0bGV0IHVwZGF0ZWQgPSBmYWxzZTtcblx0XHRcdGlmICh0aGlzLnR1bm5lbFByaXZhY3lFbmFibGVkQ29udGV4dC5nZXQoKSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0dGhpcy50dW5uZWxQcml2YWN5RW5hYmxlZENvbnRleHQuc2V0KHR1bm5lbFNlcnZpY2UuY2FuQ2hhbmdlUHJpdmFjeSk7XG5cdFx0XHRcdHVwZGF0ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMucHJvdG9jb2xDaGFuZ2FibGVDb250ZXh0S2V5LmdldCgpID09PSB0cnVlKSB7XG5cdFx0XHRcdHRoaXMucHJvdG9jb2xDaGFuZ2FibGVDb250ZXh0S2V5LnNldCh0dW5uZWxTZXJ2aWNlLmNhbkNoYW5nZVByb3RvY29sKTtcblx0XHRcdFx0dXBkYXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodXBkYXRlZCkge1xuXHRcdFx0XHR1cGRhdGVBY3Rpb25zKCk7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJQcml2YWN5QWN0aW9ucygpO1xuXHRcdFx0XHR0aGlzLmNyZWF0ZVRhYmxlKCk7XG5cdFx0XHRcdHRoaXMudGFibGU/LmxheW91dCh0aGlzLmhlaWdodCwgdGhpcy53aWR0aCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclByaXZhY3lBY3Rpb25zKCkge1xuXHRcdGZvciAoY29uc3QgcHJpdmFjeU9wdGlvbiBvZiB0aGlzLnR1bm5lbFNlcnZpY2UucHJpdmFjeU9wdGlvbnMpIHtcblx0XHRcdGNvbnN0IG9wdGlvbklkID0gYHJlbW90ZS50dW5uZWwucHJpdmFjeSR7cHJpdmFjeU9wdGlvbi5pZH1gO1xuXHRcdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQob3B0aW9uSWQsIENoYW5nZVR1bm5lbFByaXZhY3lBY3Rpb24uaGFuZGxlcihwcml2YWN5T3B0aW9uLmlkKSk7XG5cdFx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbFByaXZhY3ksICh7XG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0aWQ6IG9wdGlvbklkLFxuXHRcdFx0XHRcdHRpdGxlOiBwcml2YWN5T3B0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdHRvZ2dsZWQ6IFR1bm5lbFByaXZhY3lDb250ZXh0S2V5LmlzRXF1YWxUbyhwcml2YWN5T3B0aW9uLmlkKVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHBvcnRDb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQuc2l6ZSArIHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmRldGVjdGVkLnNpemU7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRhYmxlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5wYW5lbENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5wYW5lbENvbnRhaW5lcik7XG5cblx0XHRjb25zdCB3aWRnZXRDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMucGFuZWxDb250YWluZXIsIGRvbS4kKCcuY3VzdG9tdmlldy10cmVlJykpO1xuXHRcdHdpZGdldENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdwb3J0cy12aWV3Jyk7XG5cdFx0d2lkZ2V0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2ZpbGUtaWNvbi10aGVtYWJsZS10cmVlJywgJ3Nob3ctZmlsZS1pY29ucycpO1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyUmVuZGVyZXIgPSBuZXcgQWN0aW9uQmFyUmVuZGVyZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHRoaXMubWVudVNlcnZpY2UsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSwgdGhpcy5jb21tYW5kU2VydmljZSxcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbHVtbnMgPSBbbmV3IEljb25Db2x1bW4oKSwgbmV3IFBvcnRDb2x1bW4oKSwgbmV3IExvY2FsQWRkcmVzc0NvbHVtbigpLCBuZXcgUnVubmluZ1Byb2Nlc3NDb2x1bW4oKV07XG5cdFx0aWYgKHRoaXMudHVubmVsU2VydmljZS5jYW5DaGFuZ2VQcml2YWN5KSB7XG5cdFx0XHRjb2x1bW5zLnB1c2gobmV3IFByaXZhY3lDb2x1bW4oKSk7XG5cdFx0fVxuXHRcdGNvbHVtbnMucHVzaChuZXcgT3JpZ2luQ29sdW1uKCkpO1xuXG5cdFx0dGhpcy50YWJsZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVGFibGUsXG5cdFx0XHQnUmVtb3RlVHVubmVscycsXG5cdFx0XHR3aWRnZXRDb250YWluZXIsXG5cdFx0XHRuZXcgVHVubmVsVHJlZVZpcnR1YWxEZWxlZ2F0ZSh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSksXG5cdFx0XHRjb2x1bW5zLFxuXHRcdFx0W2FjdGlvbkJhclJlbmRlcmVyXSxcblx0XHRcdHtcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoaXRlbTogSVR1bm5lbEl0ZW0pID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBpdGVtLmxhYmVsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiB0cnVlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtOiBJVHVubmVsSXRlbSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGl0ZW0gaW5zdGFuY2VvZiBUdW5uZWxJdGVtKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBgJHtpdGVtLnRvb2x0aXBQb3N0Zml4fSAke2l0ZW0ucG9ydFRvb2x0aXB9ICR7aXRlbS5pY29uVG9vbHRpcH0gJHtpdGVtLnByb2Nlc3NUb29sdGlwfSAke2l0ZW0ub3JpZ2luVG9vbHRpcH0gJHt0aGlzLnR1bm5lbFNlcnZpY2UuY2FuQ2hhbmdlUHJpdmFjeSA/IGl0ZW0ucHJpdmFjeS5sYWJlbCA6ICcnfWA7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gaXRlbS5sYWJlbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbmxzLmxvY2FsaXplKCd0dW5uZWxWaWV3JywgXCJUdW5uZWwgVmlld1wiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZVxuXHRcdFx0fVxuXHRcdCkgYXMgV29ya2JlbmNoVGFibGU8SVR1bm5lbEl0ZW0+O1xuXG5cdFx0Y29uc3QgYWN0aW9uUnVubmVyOiBBY3Rpb25SdW5uZXIgPSB0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb25SdW5uZXIoKSk7XG5cdFx0YWN0aW9uQmFyUmVuZGVyZXIuYWN0aW9uUnVubmVyID0gYWN0aW9uUnVubmVyO1xuXG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlKTtcblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudGFibGUub25Db250ZXh0TWVudShlID0+IHRoaXMub25Db250ZXh0TWVudShlLCBhY3Rpb25SdW5uZXIpKSk7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uTW91c2VEYmxDbGljayhlID0+IHRoaXMub25Nb3VzZURibENsaWNrKGUpKSk7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB0aGlzLm9uRm9jdXNDaGFuZ2VkKGUpKSk7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4gdGhpcy5vblNlbGVjdGlvbkNoYW5nZWQoZSkpKTtcblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudGFibGUub25EaWRGb2N1cygoKSA9PiB0aGlzLnR1bm5lbFZpZXdGb2N1c0NvbnRleHQuc2V0KHRydWUpKSk7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uRGlkQmx1cigoKSA9PiB0aGlzLnR1bm5lbFZpZXdGb2N1c0NvbnRleHQuc2V0KGZhbHNlKSkpO1xuXG5cdFx0Y29uc3QgcmVyZW5kZXIgPSAoKSA9PiB0aGlzLnRhYmxlPy5zcGxpY2UoMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCB0aGlzLnZpZXdNb2RlbC5hbGwpO1xuXG5cdFx0cmVyZW5kZXIoKTtcblx0XHRsZXQgbGFzdFBvcnRDb3VudCA9IHRoaXMucG9ydENvdW50O1xuXHRcdHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UodGhpcy52aWV3TW9kZWwub25Gb3J3YXJkZWRQb3J0c0NoYW5nZWQsIChfbGFzdCwgZSkgPT4gZSwgNTApKCgpID0+IHtcblx0XHRcdGNvbnN0IG5ld1BvcnRDb3VudCA9IHRoaXMucG9ydENvdW50O1xuXHRcdFx0aWYgKCgobGFzdFBvcnRDb3VudCA9PT0gMCkgfHwgKG5ld1BvcnRDb3VudCA9PT0gMCkpICYmIChsYXN0UG9ydENvdW50ICE9PSBuZXdQb3J0Q291bnQpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0XHRsYXN0UG9ydENvdW50ID0gbmV3UG9ydENvdW50O1xuXHRcdFx0cmVyZW5kZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudGFibGUub25Nb3VzZUNsaWNrKGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaGFzT3BlbkxpbmtNb2RpZmllcihlLmJyb3dzZXJFdmVudCkgJiYgdGhpcy50YWJsZSkge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRhYmxlLmdldFNlbGVjdGVkRWxlbWVudHMoKTtcblx0XHRcdFx0aWYgKChzZWxlY3Rpb24ubGVuZ3RoID09PSAwKSB8fFxuXHRcdFx0XHRcdCgoc2VsZWN0aW9uLmxlbmd0aCA9PT0gMSkgJiYgKHNlbGVjdGlvblswXSA9PT0gZS5lbGVtZW50KSkpIHtcblx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLklELCBlLmVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uRGlkT3BlbihlID0+IHtcblx0XHRcdGlmICghZS5lbGVtZW50IHx8IChlLmVsZW1lbnQudHVubmVsVHlwZSAhPT0gVHVubmVsVHlwZS5Gb3J3YXJkZWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmJyb3dzZXJFdmVudD8udHlwZSA9PT0gJ2RibGNsaWNrJykge1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKExhYmVsVHVubmVsQWN0aW9uLklEKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlRWRpdGFibGUoZSA9PiB7XG5cdFx0XHR0aGlzLmlzRWRpdGluZyA9ICEhdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuZ2V0RWRpdGFibGVEYXRhKGU/LnR1bm5lbCwgZT8uZWRpdElkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5maXJlKCk7XG5cblx0XHRcdGlmICghdGhpcy5pc0VkaXRpbmcpIHtcblx0XHRcdFx0d2lkZ2V0Q29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hpZ2hsaWdodCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXJlbmRlcigpO1xuXG5cdFx0XHRpZiAodGhpcy5pc0VkaXRpbmcpIHtcblx0XHRcdFx0d2lkZ2V0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hpZ2hsaWdodCcpO1xuXHRcdFx0XHRpZiAoIWUpIHtcblx0XHRcdFx0XHQvLyBXaGVuIHdlIGFyZSBpbiBlZGl0aW5nIG1vZGUgZm9yIGEgbmV3IGZvcndhcmQsIHJhdGhlciB0aGFuIHVwZGF0aW5nIGFuIGV4aXN0aW5nIG9uZSB3ZSBuZWVkIHRvIHJldmVhbCB0aGUgaW5wdXQgYm94IHNpbmNlIGl0IG1pZ2h0IGJlIG91dCBvZiB2aWV3LlxuXHRcdFx0XHRcdHRoaXMudGFibGU/LnJldmVhbCh0aGlzLnRhYmxlLmluZGV4T2YodGhpcy52aWV3TW9kZWwuaW5wdXQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGUgJiYgKGUudHVubmVsLnR1bm5lbFR5cGUgIT09IFR1bm5lbFR5cGUuQWRkKSkge1xuXHRcdFx0XHRcdHRoaXMudGFibGU/LnNldEZvY3VzKHRoaXMubGFzdEZvY3VzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMucGFuZWxDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy50cmVlLWV4cGxvcmVyLXZpZXdsZXQtdHJlZS12aWV3JykpO1xuXHRcdHRoaXMuY3JlYXRlVGFibGUoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3VsZFNob3dXZWxjb21lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbC5pc0VtcHR5KCkgJiYgIXRoaXMuaXNFZGl0aW5nO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLnRhYmxlPy5kb21Gb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkZvY3VzQ2hhbmdlZChldmVudDogSVRhYmxlRXZlbnQ8SVR1bm5lbEl0ZW0+KSB7XG5cdFx0aWYgKGV2ZW50LmluZGV4ZXMubGVuZ3RoID4gMCAmJiBldmVudC5lbGVtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmxhc3RGb2N1cyA9IFsuLi5ldmVudC5pbmRleGVzXTtcblx0XHR9XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBldmVudC5lbGVtZW50cztcblx0XHRjb25zdCBpdGVtID0gZWxlbWVudHMgJiYgZWxlbWVudHMubGVuZ3RoID8gZWxlbWVudHNbMF0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGl0ZW0pIHtcblx0XHRcdHRoaXMudHVubmVsVmlld1NlbGVjdGlvbkNvbnRleHQuc2V0KG1ha2VBZGRyZXNzKGl0ZW0ucmVtb3RlSG9zdCwgaXRlbS5yZW1vdGVQb3J0KSk7XG5cdFx0XHR0aGlzLnR1bm5lbFR5cGVDb250ZXh0LnNldChpdGVtLnR1bm5lbFR5cGUpO1xuXHRcdFx0dGhpcy50dW5uZWxDbG9zZWFibGVDb250ZXh0LnNldCghIWl0ZW0uY2xvc2VhYmxlKTtcblx0XHRcdHRoaXMudHVubmVsUHJpdmFjeUNvbnRleHQuc2V0KGl0ZW0ucHJpdmFjeS5pZCk7XG5cdFx0XHR0aGlzLnR1bm5lbFByb3RvY29sQ29udGV4dC5zZXQoaXRlbS5wcm90b2NvbCA9PT0gVHVubmVsUHJvdG9jb2wuSHR0cHMgPyBUdW5uZWxQcm90b2NvbC5IdHRwcyA6IFR1bm5lbFByb3RvY29sLkh0dHApO1xuXHRcdFx0dGhpcy5wb3J0Q2hhbmdhYmxlQ29udGV4dEtleS5zZXQoISFpdGVtLmxvY2FsUG9ydCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHVubmVsVHlwZUNvbnRleHQucmVzZXQoKTtcblx0XHRcdHRoaXMudHVubmVsVmlld1NlbGVjdGlvbkNvbnRleHQucmVzZXQoKTtcblx0XHRcdHRoaXMudHVubmVsQ2xvc2VhYmxlQ29udGV4dC5yZXNldCgpO1xuXHRcdFx0dGhpcy50dW5uZWxQcml2YWN5Q29udGV4dC5yZXNldCgpO1xuXHRcdFx0dGhpcy50dW5uZWxQcm90b2NvbENvbnRleHQucmVzZXQoKTtcblx0XHRcdHRoaXMucG9ydENoYW5nYWJsZUNvbnRleHRLZXkucmVzZXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhc09wZW5MaW5rTW9kaWZpZXIoZTogTW91c2VFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVkaXRvckNvbmYgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgbXVsdGlDdXJzb3JNb2RpZmllcjogJ2N0cmxDbWQnIHwgJ2FsdCcgfT4oJ2VkaXRvcicpO1xuXG5cdFx0bGV0IG1vZGlmaWVyS2V5ID0gZmFsc2U7XG5cdFx0aWYgKGVkaXRvckNvbmYubXVsdGlDdXJzb3JNb2RpZmllciA9PT0gJ2N0cmxDbWQnKSB7XG5cdFx0XHRtb2RpZmllcktleSA9IGUuYWx0S2V5O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0bW9kaWZpZXJLZXkgPSBlLm1ldGFLZXk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtb2RpZmllcktleSA9IGUuY3RybEtleTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1vZGlmaWVyS2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBvblNlbGVjdGlvbkNoYW5nZWQoZXZlbnQ6IElUYWJsZUV2ZW50PElUdW5uZWxJdGVtPikge1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gZXZlbnQuZWxlbWVudHM7XG5cdFx0aWYgKGVsZW1lbnRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHRoaXMudHVubmVsVmlld011bHRpU2VsZWN0aW9uQ29udGV4dC5zZXQoZWxlbWVudHMubWFwKGVsZW1lbnQgPT4gbWFrZUFkZHJlc3MoZWxlbWVudC5yZW1vdGVIb3N0LCBlbGVtZW50LnJlbW90ZVBvcnQpKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHVubmVsVmlld011bHRpU2VsZWN0aW9uQ29udGV4dC5zZXQodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUoZXZlbnQ6IElUYWJsZUNvbnRleHRNZW51RXZlbnQ8SVR1bm5lbEl0ZW0+LCBhY3Rpb25SdW5uZXI6IEFjdGlvblJ1bm5lcik6IHZvaWQge1xuXHRcdGlmICgoZXZlbnQuZWxlbWVudCAhPT0gdW5kZWZpbmVkKSAmJiAhKGV2ZW50LmVsZW1lbnQgaW5zdGFuY2VvZiBUdW5uZWxJdGVtKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGV2ZW50LmJyb3dzZXJFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGV2ZW50LmJyb3dzZXJFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdGNvbnN0IG5vZGU6IFR1bm5lbEl0ZW0gfCB1bmRlZmluZWQgPSBldmVudC5lbGVtZW50O1xuXG5cdFx0aWYgKG5vZGUpIHtcblx0XHRcdHRoaXMudGFibGU/LnNldEZvY3VzKFt0aGlzLnRhYmxlLmluZGV4T2Yobm9kZSldKTtcblx0XHRcdHRoaXMudHVubmVsVHlwZUNvbnRleHQuc2V0KG5vZGUudHVubmVsVHlwZSk7XG5cdFx0XHR0aGlzLnR1bm5lbENsb3NlYWJsZUNvbnRleHQuc2V0KCEhbm9kZS5jbG9zZWFibGUpO1xuXHRcdFx0dGhpcy50dW5uZWxQcml2YWN5Q29udGV4dC5zZXQobm9kZS5wcml2YWN5LmlkKTtcblx0XHRcdHRoaXMudHVubmVsUHJvdG9jb2xDb250ZXh0LnNldChub2RlLnByb3RvY29sKTtcblx0XHRcdHRoaXMucG9ydENoYW5nYWJsZUNvbnRleHRLZXkuc2V0KCEhbm9kZS5sb2NhbFBvcnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnR1bm5lbFR5cGVDb250ZXh0LnNldChUdW5uZWxUeXBlLkFkZCk7XG5cdFx0XHR0aGlzLnR1bm5lbENsb3NlYWJsZUNvbnRleHQuc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMudHVubmVsUHJpdmFjeUNvbnRleHQuc2V0KHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLnR1bm5lbFByb3RvY29sQ29udGV4dC5zZXQodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMucG9ydENoYW5nYWJsZUNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0bWVudUlkOiBNZW51SWQuVHVubmVsQ29udGV4dCxcblx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogdGhpcy50YWJsZT8uY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LmFuY2hvcixcblx0XHRcdGdldEFjdGlvblZpZXdJdGVtOiAoYWN0aW9uKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKTtcblx0XHRcdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgYWN0aW9uLCB7IGxhYmVsOiB0cnVlLCBrZXliaW5kaW5nOiBrZXliaW5kaW5nLmdldExhYmVsKCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICh3YXNDYW5jZWxsZWQ/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGlmICh3YXNDYW5jZWxsZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRhYmxlPy5kb21Gb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IG5vZGU/LnN0cmlwKCksXG5cdFx0XHRhY3Rpb25SdW5uZXJcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25Nb3VzZURibENsaWNrKGU6IElUYWJsZU1vdXNlRXZlbnQ8SVR1bm5lbEl0ZW0+KTogdm9pZCB7XG5cdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRm9yd2FyZFBvcnRBY3Rpb24uSU5MSU5FX0lEKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhlaWdodCA9IDA7XG5cdHByaXZhdGUgd2lkdGggPSAwO1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdHRoaXMud2lkdGggPSB3aWR0aDtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMudGFibGU/LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHVubmVsUGFuZWxEZXNjcmlwdG9yIGltcGxlbWVudHMgSVZpZXdEZXNjcmlwdG9yIHtcblx0cmVhZG9ubHkgaWQgPSBUdW5uZWxQYW5lbC5JRDtcblx0cmVhZG9ubHkgbmFtZTogSUxvY2FsaXplZFN0cmluZyA9IFR1bm5lbFBhbmVsLlRJVExFO1xuXHRyZWFkb25seSBjdG9yRGVzY3JpcHRvcjogU3luY0Rlc2NyaXB0b3I8VHVubmVsUGFuZWw+O1xuXHRyZWFkb25seSBjYW5Ub2dnbGVWaXNpYmlsaXR5ID0gdHJ1ZTtcblx0cmVhZG9ubHkgaGlkZUJ5RGVmYXVsdCA9IGZhbHNlO1xuXHQvLyBncm91cCBpcyBub3QgYWN0dWFsbHkgdXNlZCBmb3Igdmlld3MgdGhhdCBhcmUgbm90IGV4dGVuc2lvbiBjb250cmlidXRlZC4gVXNlIG9yZGVyIGluc3RlYWQuXG5cdHJlYWRvbmx5IGdyb3VwID0gJ2RldGFpbHNAMCc7XG5cdC8vIC01MDAgY29tZXMgZnJvbSB0aGUgcmVtb3RlIGV4cGxvcmVyIHZpZXdPcmRlckRlbGVnYXRlXG5cdHJlYWRvbmx5IG9yZGVyID0gLTUwMDtcblx0cmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nIHwgc3RyaW5nW107XG5cdHJlYWRvbmx5IGNhbk1vdmVWaWV3ID0gdHJ1ZTtcblx0cmVhZG9ubHkgY29udGFpbmVySWNvbiA9IHBvcnRzVmlld0ljb247XG5cblx0Y29uc3RydWN0b3Iodmlld01vZGVsOiBJVHVubmVsVmlld01vZGVsLCBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpIHtcblx0XHR0aGlzLmN0b3JEZXNjcmlwdG9yID0gbmV3IFN5bmNEZXNjcmlwdG9yKFR1bm5lbFBhbmVsLCBbdmlld01vZGVsXSk7XG5cdFx0dGhpcy5yZW1vdGVBdXRob3JpdHkgPSBlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ID8gZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eS5zcGxpdCgnKycpWzBdIDogdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzSVR1bm5lbEl0ZW0oaXRlbTogYW55KTogaXRlbSBpcyBJVHVubmVsSXRlbSB7XG5cdHJldHVybiBpdGVtICYmIGl0ZW0udHVubmVsVHlwZSAmJiBpdGVtLnJlbW90ZUhvc3QgJiYgaXRlbS5zb3VyY2U7XG59XG5cbm5hbWVzcGFjZSBMYWJlbFR1bm5lbEFjdGlvbiB7XG5cdGV4cG9ydCBjb25zdCBJRCA9ICdyZW1vdGUudHVubmVsLmxhYmVsJztcblx0ZXhwb3J0IGNvbnN0IExBQkVMID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLmxhYmVsJywgXCJTZXQgUG9ydCBMYWJlbFwiKTtcblx0ZXhwb3J0IGNvbnN0IENPTU1BTkRfSURfS0VZV09SRCA9ICdsYWJlbCc7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZXIoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYXN5bmMgKGFjY2Vzc29yLCBhcmcpOiBQcm9taXNlPHsgcG9ydDogbnVtYmVyOyBsYWJlbDogc3RyaW5nIH0gfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdGNvbnN0IHJlbW90ZUV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlKTtcblx0XHRcdGxldCB0dW5uZWxDb250ZXh0OiBJVHVubmVsSXRlbSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpc0lUdW5uZWxJdGVtKGFyZykpIHtcblx0XHRcdFx0dHVubmVsQ29udGV4dCA9IGFyZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHQgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKS5nZXRDb250ZXh0S2V5VmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPihUdW5uZWxWaWV3U2VsZWN0aW9uS2V5TmFtZSk7XG5cdFx0XHRcdGNvbnN0IHR1bm5lbCA9IGNvbnRleHQgPyByZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLmdldChjb250ZXh0KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHR1bm5lbCkge1xuXHRcdFx0XHRcdGNvbnN0IHR1bm5lbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVR1bm5lbFNlcnZpY2UpO1xuXHRcdFx0XHRcdHR1bm5lbENvbnRleHQgPSBUdW5uZWxJdGVtLmNyZWF0ZUZyb21UdW5uZWwocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlLCB0dW5uZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAodHVubmVsQ29udGV4dCkge1xuXHRcdFx0XHRjb25zdCB0dW5uZWxJdGVtOiBJVHVubmVsSXRlbSA9IHR1bm5lbENvbnRleHQ7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRjb25zdCBzdGFydGluZ1ZhbHVlID0gdHVubmVsSXRlbS5uYW1lID8gdHVubmVsSXRlbS5uYW1lIDogYCR7dHVubmVsSXRlbS5yZW1vdGVQb3J0fWA7XG5cdFx0XHRcdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnNldEVkaXRhYmxlKHR1bm5lbEl0ZW0sIFR1bm5lbEVkaXRJZC5MYWJlbCwge1xuXHRcdFx0XHRcdFx0b25GaW5pc2g6IGFzeW5jICh2YWx1ZSwgc3VjY2VzcykgPT4ge1xuXHRcdFx0XHRcdFx0XHR2YWx1ZSA9IHZhbHVlLnRyaW0oKTtcblx0XHRcdFx0XHRcdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnNldEVkaXRhYmxlKHR1bm5lbEl0ZW0sIFR1bm5lbEVkaXRJZC5MYWJlbCwgbnVsbCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNoYW5nZWQgPSBzdWNjZXNzICYmICh2YWx1ZSAhPT0gc3RhcnRpbmdWYWx1ZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLm5hbWUodHVubmVsSXRlbS5yZW1vdGVIb3N0LCB0dW5uZWxJdGVtLnJlbW90ZVBvcnQsIHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKGNoYW5nZWQgPyB7IHBvcnQ6IHR1bm5lbEl0ZW0ucmVtb3RlUG9ydCwgbGFiZWw6IHZhbHVlIH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHZhbGlkYXRpb25NZXNzYWdlOiAoKSA9PiBudWxsLFxuXHRcdFx0XHRcdFx0cGxhY2Vob2xkZXI6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbHNWaWV3LmxhYmVsUGxhY2Vob2xkZXInLCBcIlBvcnQgbGFiZWxcIiksXG5cdFx0XHRcdFx0XHRzdGFydGluZ1ZhbHVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXHR9XG59XG5cbmNvbnN0IGludmFsaWRQb3J0U3RyaW5nOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxzVmlldy5wb3J0TnVtYmVyVmFsaWQnLCBcIkZvcndhcmRlZCBwb3J0IHNob3VsZCBiZSBhIG51bWJlciBvciBhIGhvc3Q6cG9ydC5cIik7XG5jb25zdCBtYXhQb3J0TnVtYmVyOiBudW1iZXIgPSA2NTUzNjtcbmNvbnN0IGludmFsaWRQb3J0TnVtYmVyU3RyaW5nOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxzVmlldy5wb3J0TnVtYmVyVG9IaWdoJywgXCJQb3J0IG51bWJlciBtdXN0IGJlIFxcdTIyNjUgMCBhbmQgPCB7MH0uXCIsIG1heFBvcnROdW1iZXIpO1xuY29uc3QgcmVxdWlyZXNTdWRvU3RyaW5nOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxWaWV3LmlubGluZUVsZXZhdGlvbk1lc3NhZ2UnLCBcIk1heSBSZXF1aXJlIFN1ZG9cIik7XG5jb25zdCBhbHJlYWR5Rm9yd2FyZGVkOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxWaWV3LmFscmVhZHlGb3J3YXJkZWQnLCBcIlBvcnQgaXMgYWxyZWFkeSBmb3J3YXJkZWRcIik7XG5cbmV4cG9ydCBuYW1lc3BhY2UgRm9yd2FyZFBvcnRBY3Rpb24ge1xuXHRleHBvcnQgY29uc3QgSU5MSU5FX0lEID0gJ3JlbW90ZS50dW5uZWwuZm9yd2FyZElubGluZSc7XG5cdGV4cG9ydCBjb25zdCBDT01NQU5EUEFMRVRURV9JRCA9ICdyZW1vdGUudHVubmVsLmZvcndhcmRDb21tYW5kUGFsZXR0ZSc7XG5cdGV4cG9ydCBjb25zdCBMQUJFTDogSUxvY2FsaXplZFN0cmluZyA9IG5scy5sb2NhbGl6ZTIoJ3JlbW90ZS50dW5uZWwuZm9yd2FyZCcsIFwiRm9yd2FyZCBhIFBvcnRcIik7XG5cdGV4cG9ydCBjb25zdCBUUkVFSVRFTV9MQUJFTCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5mb3J3YXJkSXRlbScsIFwiRm9yd2FyZCBQb3J0XCIpO1xuXHRjb25zdCBmb3J3YXJkUHJvbXB0ID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLmZvcndhcmRQcm9tcHQnLCBcIlBvcnQgbnVtYmVyIG9yIGFkZHJlc3MgKGVnLiAzMDAwIG9yIDEwLjEwLjEwLjEwOjIwMDApLlwiKTtcblxuXHRmdW5jdGlvbiB2YWxpZGF0ZUlucHV0KHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSwgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2UsIHZhbHVlOiBzdHJpbmcsIGNhbkVsZXZhdGU6IGJvb2xlYW4pOiB7IGNvbnRlbnQ6IHN0cmluZzsgc2V2ZXJpdHk6IFNldmVyaXR5IH0gfCBudWxsIHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUFkZHJlc3ModmFsdWUpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiBpbnZhbGlkUG9ydFN0cmluZywgc2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yIH07XG5cdFx0fSBlbHNlIGlmIChwYXJzZWQucG9ydCA+PSBtYXhQb3J0TnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiBpbnZhbGlkUG9ydE51bWJlclN0cmluZywgc2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yIH07XG5cdFx0fSBlbHNlIGlmIChjYW5FbGV2YXRlICYmIHR1bm5lbFNlcnZpY2UuaXNQb3J0UHJpdmlsZWdlZChwYXJzZWQucG9ydCkpIHtcblx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IHJlcXVpcmVzU3Vkb1N0cmluZywgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8gfTtcblx0XHR9IGVsc2UgaWYgKG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXMocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZCwgcGFyc2VkLmhvc3QsIHBhcnNlZC5wb3J0KSkge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogYWxyZWFkeUZvcndhcmRlZCwgc2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yIH07XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0ZnVuY3Rpb24gZXJyb3Iobm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsIHR1bm5lbE9yRXJyb3I6IFJlbW90ZVR1bm5lbCB8IHN0cmluZyB8IHZvaWQsIGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyKSB7XG5cdFx0aWYgKCF0dW5uZWxPckVycm9yKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLmZvcndhcmRFcnJvcicsIFwiVW5hYmxlIHRvIGZvcndhcmQgezB9OnsxfS4gVGhlIGhvc3QgbWF5IG5vdCBiZSBhdmFpbGFibGUgb3IgdGhhdCByZW1vdGUgcG9ydCBtYXkgYWxyZWFkeSBiZSBmb3J3YXJkZWRcIiwgaG9zdCwgcG9ydCkpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHR1bm5lbE9yRXJyb3IgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLmZvcndhcmRFcnJvclByb3ZpZGVkJywgXCJVbmFibGUgdG8gZm9yd2FyZCB7MH06ezF9LiB7Mn1cIiwgaG9zdCwgcG9ydCwgdHVubmVsT3JFcnJvcikpO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpbmxpbmVIYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRjb25zdCByZW1vdGVFeHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUV4cGxvcmVyU2VydmljZSk7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHR1bm5lbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVR1bm5lbFNlcnZpY2UpO1xuXHRcdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnNldEVkaXRhYmxlKHVuZGVmaW5lZCwgVHVubmVsRWRpdElkLk5ldywge1xuXHRcdFx0XHRvbkZpbmlzaDogYXN5bmMgKHZhbHVlLCBzdWNjZXNzKSA9PiB7XG5cdFx0XHRcdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnNldEVkaXRhYmxlKHVuZGVmaW5lZCwgVHVubmVsRWRpdElkLk5ldywgbnVsbCk7XG5cdFx0XHRcdFx0bGV0IHBhcnNlZDogeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChzdWNjZXNzICYmIChwYXJzZWQgPSBwYXJzZUFkZHJlc3ModmFsdWUpKSkge1xuXHRcdFx0XHRcdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmZvcndhcmQoe1xuXHRcdFx0XHRcdFx0XHRyZW1vdGU6IHsgaG9zdDogcGFyc2VkLmhvc3QsIHBvcnQ6IHBhcnNlZC5wb3J0IH0sXG5cdFx0XHRcdFx0XHRcdGVsZXZhdGVJZk5lZWRlZDogdHJ1ZVxuXHRcdFx0XHRcdFx0fSkudGhlbih0dW5uZWxPckVycm9yID0+IGVycm9yKG5vdGlmaWNhdGlvblNlcnZpY2UsIHR1bm5lbE9yRXJyb3IsIHBhcnNlZCEuaG9zdCwgcGFyc2VkIS5wb3J0KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWxpZGF0aW9uTWVzc2FnZTogKHZhbHVlKSA9PiB2YWxpZGF0ZUlucHV0KHJlbW90ZUV4cGxvcmVyU2VydmljZSwgdHVubmVsU2VydmljZSwgdmFsdWUsIHR1bm5lbFNlcnZpY2UuY2FuRWxldmF0ZSksXG5cdFx0XHRcdHBsYWNlaG9sZGVyOiBmb3J3YXJkUHJvbXB0XG5cdFx0XHR9KTtcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGNvbW1hbmRQYWxldHRlSGFuZGxlcigpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhc3luYyAoYWNjZXNzb3IsIGFyZykgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdHVubmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVHVubmVsU2VydmljZSk7XG5cdFx0XHRhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXcoVHVubmVsUGFuZWwuSUQsIHRydWUpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5pbnB1dCh7XG5cdFx0XHRcdHByb21wdDogZm9yd2FyZFByb21wdCxcblx0XHRcdFx0dmFsaWRhdGVJbnB1dDogKHZhbHVlKSA9PiBQcm9taXNlLnJlc29sdmUodmFsaWRhdGVJbnB1dChyZW1vdGVFeHBsb3JlclNlcnZpY2UsIHR1bm5lbFNlcnZpY2UsIHZhbHVlLCB0dW5uZWxTZXJ2aWNlLmNhbkVsZXZhdGUpKVxuXHRcdFx0fSk7XG5cdFx0XHRsZXQgcGFyc2VkOiB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodmFsdWUgJiYgKHBhcnNlZCA9IHBhcnNlQWRkcmVzcyh2YWx1ZSkpKSB7XG5cdFx0XHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZS5mb3J3YXJkKHtcblx0XHRcdFx0XHRyZW1vdGU6IHsgaG9zdDogcGFyc2VkLmhvc3QsIHBvcnQ6IHBhcnNlZC5wb3J0IH0sXG5cdFx0XHRcdFx0ZWxldmF0ZUlmTmVlZGVkOiB0cnVlXG5cdFx0XHRcdH0pLnRoZW4odHVubmVsID0+IGVycm9yKG5vdGlmaWNhdGlvblNlcnZpY2UsIHR1bm5lbCwgcGFyc2VkIS5ob3N0LCBwYXJzZWQhLnBvcnQpKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmludGVyZmFjZSBRdWlja1BpY2tUdW5uZWwgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHR1bm5lbD86IElUdW5uZWxJdGVtO1xufVxuXG5mdW5jdGlvbiBtYWtlVHVubmVsUGlja3ModHVubmVsczogVHVubmVsW10sIHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSwgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2UpOiBRdWlja1BpY2tJbnB1dDxRdWlja1BpY2tUdW5uZWw+W10ge1xuXHRjb25zdCBwaWNrczogUXVpY2tQaWNrSW5wdXQ8UXVpY2tQaWNrVHVubmVsPltdID0gdHVubmVscy5tYXAoZm9yd2FyZGVkID0+IHtcblx0XHRjb25zdCBpdGVtID0gVHVubmVsSXRlbS5jcmVhdGVGcm9tVHVubmVsKHJlbW90ZUV4cGxvcmVyU2VydmljZSwgdHVubmVsU2VydmljZSwgZm9yd2FyZGVkKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGl0ZW0ubGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogaXRlbS5wcm9jZXNzRGVzY3JpcHRpb24sXG5cdFx0XHR0dW5uZWw6IGl0ZW1cblx0XHR9O1xuXHR9KTtcblx0aWYgKHBpY2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHBpY2tzLnB1c2goe1xuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5jbG9zZU5vUG9ydHMnLCBcIk5vIHBvcnRzIGN1cnJlbnRseSBmb3J3YXJkZWQuIFRyeSBydW5uaW5nIHRoZSB7MH0gY29tbWFuZFwiLCBGb3J3YXJkUG9ydEFjdGlvbi5MQUJFTC52YWx1ZSlcblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gcGlja3M7XG59XG5cbm5hbWVzcGFjZSBDbG9zZVBvcnRBY3Rpb24ge1xuXHRleHBvcnQgY29uc3QgSU5MSU5FX0lEID0gJ3JlbW90ZS50dW5uZWwuY2xvc2VJbmxpbmUnO1xuXHRleHBvcnQgY29uc3QgQ09NTUFORFBBTEVUVEVfSUQgPSAncmVtb3RlLnR1bm5lbC5jbG9zZUNvbW1hbmRQYWxldHRlJztcblx0ZXhwb3J0IGNvbnN0IExBQkVMOiBJTG9jYWxpemVkU3RyaW5nID0gbmxzLmxvY2FsaXplMigncmVtb3RlLnR1bm5lbC5jbG9zZScsIFwiU3RvcCBGb3J3YXJkaW5nIFBvcnRcIik7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlubGluZUhhbmRsZXIoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYXN5bmMgKGFjY2Vzc29yLCBhcmcpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRjb25zdCByZW1vdGVFeHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUV4cGxvcmVyU2VydmljZSk7XG5cdFx0XHRsZXQgcG9ydHM6IChJVHVubmVsSXRlbSB8IFR1bm5lbClbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbXVsdGlTZWxlY3RDb250ZXh0ID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPihUdW5uZWxWaWV3TXVsdGlTZWxlY3Rpb25LZXlOYW1lKTtcblx0XHRcdGlmIChtdWx0aVNlbGVjdENvbnRleHQpIHtcblx0XHRcdFx0bXVsdGlTZWxlY3RDb250ZXh0LmZvckVhY2goY29udGV4dCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdHVubmVsID0gcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZC5nZXQoY29udGV4dCk7XG5cdFx0XHRcdFx0aWYgKHR1bm5lbCkge1xuXHRcdFx0XHRcdFx0cG9ydHM/LnB1c2godHVubmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChpc0lUdW5uZWxJdGVtKGFyZykpIHtcblx0XHRcdFx0cG9ydHMgPSBbYXJnXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHQgPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPihUdW5uZWxWaWV3U2VsZWN0aW9uS2V5TmFtZSk7XG5cdFx0XHRcdGNvbnN0IHR1bm5lbCA9IGNvbnRleHQgPyByZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLmdldChjb250ZXh0KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHR1bm5lbCkge1xuXHRcdFx0XHRcdHBvcnRzID0gW3R1bm5lbF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFwb3J0cyB8fCBwb3J0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHBvcnRzLm1hcChwb3J0ID0+IHJlbW90ZUV4cGxvcmVyU2VydmljZS5jbG9zZSh7IGhvc3Q6IHBvcnQucmVtb3RlSG9zdCwgcG9ydDogcG9ydC5yZW1vdGVQb3J0IH0sIFR1bm5lbENsb3NlUmVhc29uLlVzZXIpKSk7XG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBjb21tYW5kUGFsZXR0ZUhhbmRsZXIoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYXN5bmMgKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdHVubmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVHVubmVsU2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBwaWNrczogUXVpY2tQaWNrSW5wdXQ8UXVpY2tQaWNrVHVubmVsPltdID0gbWFrZVR1bm5lbFBpY2tzKEFycmF5LmZyb20ocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZC52YWx1ZXMoKSkuZmlsdGVyKHR1bm5lbCA9PiB0dW5uZWwuY2xvc2VhYmxlKSwgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5jbG9zZVBsYWNlaG9sZGVyJywgXCJDaG9vc2UgYSBwb3J0IHRvIHN0b3AgZm9yd2FyZGluZ1wiKSB9KTtcblx0XHRcdGlmIChyZXN1bHQgJiYgcmVzdWx0LnR1bm5lbCkge1xuXHRcdFx0XHRhd2FpdCByZW1vdGVFeHBsb3JlclNlcnZpY2UuY2xvc2UoeyBob3N0OiByZXN1bHQudHVubmVsLnJlbW90ZUhvc3QsIHBvcnQ6IHJlc3VsdC50dW5uZWwucmVtb3RlUG9ydCB9LCBUdW5uZWxDbG9zZVJlYXNvbi5Vc2VyKTtcblx0XHRcdH0gZWxzZSBpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEZvcndhcmRQb3J0QWN0aW9uLkNPTU1BTkRQQUxFVFRFX0lEKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgT3BlblBvcnRJbkJyb3dzZXJBY3Rpb24ge1xuXHRleHBvcnQgY29uc3QgSUQgPSAncmVtb3RlLnR1bm5lbC5vcGVuJztcblx0ZXhwb3J0IGNvbnN0IExBQkVMID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLm9wZW4nLCBcIk9wZW4gaW4gQnJvd3NlclwiKTtcblxuXHRleHBvcnQgZnVuY3Rpb24gaGFuZGxlcigpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhc3luYyAoYWNjZXNzb3IsIGFyZykgPT4ge1xuXHRcdFx0bGV0IGtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGlzSVR1bm5lbEl0ZW0oYXJnKSkge1xuXHRcdFx0XHRrZXkgPSBtYWtlQWRkcmVzcyhhcmcucmVtb3RlSG9zdCwgYXJnLnJlbW90ZVBvcnQpO1xuXHRcdFx0fSBlbHNlIGlmIChpc1JlbW90ZVR1bm5lbChhcmcpKSB7XG5cdFx0XHRcdGtleSA9IG1ha2VBZGRyZXNzKGFyZy50dW5uZWxSZW1vdGVIb3N0LCBhcmcudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpLnR1bm5lbE1vZGVsO1xuXHRcdFx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRcdFx0cmV0dXJuIHJ1bihtb2RlbCwgb3BlbmVyU2VydmljZSwga2V5KTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHJ1bihtb2RlbDogVHVubmVsTW9kZWwsIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLCBrZXk6IHN0cmluZykge1xuXHRcdGNvbnN0IHR1bm5lbCA9IG1vZGVsLmZvcndhcmRlZC5nZXQoa2V5KSB8fCBtb2RlbC5kZXRlY3RlZC5nZXQoa2V5KTtcblx0XHRpZiAodHVubmVsKSB7XG5cdFx0XHRyZXR1cm4gb3BlbmVyU2VydmljZS5vcGVuKHR1bm5lbC5sb2NhbFVyaSwgeyBhbGxvd0NvbnRyaWJ1dGVkT3BlbmVyczogZmFsc2UgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE9wZW5Qb3J0SW5QcmV2aWV3QWN0aW9uIHtcblx0ZXhwb3J0IGNvbnN0IElEID0gJ3JlbW90ZS50dW5uZWwub3BlblByZXZpZXcnO1xuXHRleHBvcnQgY29uc3QgTEFCRUwgPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwub3BlblByZXZpZXcnLCBcIlByZXZpZXcgaW4gRWRpdG9yXCIpO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBoYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRsZXQga2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXNJVHVubmVsSXRlbShhcmcpKSB7XG5cdFx0XHRcdGtleSA9IG1ha2VBZGRyZXNzKGFyZy5yZW1vdGVIb3N0LCBhcmcucmVtb3RlUG9ydCk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzUmVtb3RlVHVubmVsKGFyZykpIHtcblx0XHRcdFx0a2V5ID0gbWFrZUFkZHJlc3MoYXJnLnR1bm5lbFJlbW90ZUhvc3QsIGFyZy50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRcdH1cblx0XHRcdGlmIChrZXkpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUV4cGxvcmVyU2VydmljZSkudHVubmVsTW9kZWw7XG5cdFx0XHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBleHRlcm5hbE9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVybmFsVXJpT3BlbmVyU2VydmljZSk7XG5cdFx0XHRcdHJldHVybiBydW4obW9kZWwsIG9wZW5lclNlcnZpY2UsIGV4dGVybmFsT3BlbmVyU2VydmljZSwga2V5KTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bihtb2RlbDogVHVubmVsTW9kZWwsIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLCBleHRlcm5hbE9wZW5lclNlcnZpY2U6IElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UsIGtleTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgdHVubmVsID0gbW9kZWwuZm9yd2FyZGVkLmdldChrZXkpIHx8IG1vZGVsLmRldGVjdGVkLmdldChrZXkpO1xuXHRcdGlmICh0dW5uZWwpIHtcblx0XHRcdGNvbnN0IHJlbW90ZUhvc3QgPSB0dW5uZWwucmVtb3RlSG9zdC5pbmNsdWRlcygnOicpID8gYFske3R1bm5lbC5yZW1vdGVIb3N0fV1gIDogdHVubmVsLnJlbW90ZUhvc3Q7XG5cdFx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkucGFyc2UoYGh0dHA6Ly8ke3JlbW90ZUhvc3R9OiR7dHVubmVsLnJlbW90ZVBvcnR9YCk7XG5cdFx0XHRjb25zdCBvcGVuZXIgPSBhd2FpdCBleHRlcm5hbE9wZW5lclNlcnZpY2UuZ2V0T3BlbmVyKHR1bm5lbC5sb2NhbFVyaSwgeyBzb3VyY2VVcmkgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAob3BlbmVyKSB7XG5cdFx0XHRcdHJldHVybiBvcGVuZXIub3BlbkV4dGVybmFsVXJpKHR1bm5lbC5sb2NhbFVyaSwgeyBzb3VyY2VVcmkgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gb3BlbmVyU2VydmljZS5vcGVuKHR1bm5lbC5sb2NhbFVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5uYW1lc3BhY2UgT3BlblBvcnRJbkJyb3dzZXJDb21tYW5kUGFsZXR0ZUFjdGlvbiB7XG5cdGV4cG9ydCBjb25zdCBJRCA9ICdyZW1vdGUudHVubmVsLm9wZW5Db21tYW5kUGFsZXR0ZSc7XG5cdGV4cG9ydCBjb25zdCBMQUJFTCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5vcGVuQ29tbWFuZFBhbGV0dGUnLCBcIk9wZW4gUG9ydCBpbiBCcm93c2VyXCIpO1xuXG5cdGludGVyZmFjZSBRdWlja1BpY2tUdW5uZWwgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdFx0dHVubmVsPzogVHVubmVsSXRlbTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBoYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRjb25zdCByZW1vdGVFeHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUV4cGxvcmVyU2VydmljZSk7XG5cdFx0XHRjb25zdCB0dW5uZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUdW5uZWxTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsO1xuXHRcdFx0Y29uc3QgcXVpY2tQaWNrU2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogUXVpY2tQaWNrVHVubmVsW10gPSBbLi4ubW9kZWwuZm9yd2FyZGVkLCAuLi5tb2RlbC5kZXRlY3RlZF0ubWFwKHZhbHVlID0+IHtcblx0XHRcdFx0Y29uc3QgdHVubmVsSXRlbSA9IFR1bm5lbEl0ZW0uY3JlYXRlRnJvbVR1bm5lbChyZW1vdGVFeHBsb3JlclNlcnZpY2UsIHR1bm5lbFNlcnZpY2UsIHZhbHVlWzFdKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRsYWJlbDogdHVubmVsSXRlbS5sYWJlbCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdHVubmVsSXRlbS5wcm9jZXNzRGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0dHVubmVsOiB0dW5uZWxJdGVtXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdGlmIChvcHRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRvcHRpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwub3BlbkNvbW1hbmRQYWxldHRlTm9uZScsIFwiTm8gcG9ydHMgY3VycmVudGx5IGZvcndhcmRlZC4gT3BlbiB0aGUgUG9ydHMgdmlldyB0byBnZXQgc3RhcnRlZC5cIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvcHRpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwub3BlbkNvbW1hbmRQYWxldHRlVmlldycsIFwiT3BlbiB0aGUgUG9ydHMgdmlldy4uLlwiKVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBpY2tlZCA9IGF3YWl0IHF1aWNrUGlja1NlcnZpY2UucGljazxRdWlja1BpY2tUdW5uZWw+KG9wdGlvbnMsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5vcGVuQ29tbWFuZFBhbGV0dGVQaWNrJywgXCJDaG9vc2UgdGhlIHBvcnQgdG8gb3BlblwiKSB9KTtcblx0XHRcdGlmIChwaWNrZWQgJiYgcGlja2VkLnR1bm5lbCkge1xuXHRcdFx0XHRyZXR1cm4gT3BlblBvcnRJbkJyb3dzZXJBY3Rpb24ucnVuKG1vZGVsLCBvcGVuZXJTZXJ2aWNlLCBtYWtlQWRkcmVzcyhwaWNrZWQudHVubmVsLnJlbW90ZUhvc3QsIHBpY2tlZC50dW5uZWwucmVtb3RlUG9ydCkpO1xuXHRcdFx0fSBlbHNlIGlmIChwaWNrZWQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGAke1RVTk5FTF9WSUVXX0lEfS5mb2N1c2ApO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxubmFtZXNwYWNlIENvcHlBZGRyZXNzQWN0aW9uIHtcblx0ZXhwb3J0IGNvbnN0IElOTElORV9JRCA9ICdyZW1vdGUudHVubmVsLmNvcHlBZGRyZXNzSW5saW5lJztcblx0ZXhwb3J0IGNvbnN0IENPTU1BTkRQQUxFVFRFX0lEID0gJ3JlbW90ZS50dW5uZWwuY29weUFkZHJlc3NDb21tYW5kUGFsZXR0ZSc7XG5cdGV4cG9ydCBjb25zdCBJTkxJTkVfTEFCRUwgPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwuY29weUFkZHJlc3NJbmxpbmUnLCBcIkNvcHkgTG9jYWwgQWRkcmVzc1wiKTtcblx0ZXhwb3J0IGNvbnN0IENPTU1BTkRQQUxFVFRFX0xBQkVMID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLmNvcHlBZGRyZXNzQ29tbWFuZFBhbGV0dGUnLCBcIkNvcHkgRm9yd2FyZGVkIFBvcnQgQWRkcmVzc1wiKTtcblxuXHRhc3luYyBmdW5jdGlvbiBjb3B5QWRkcmVzcyhyZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsIGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLCB0dW5uZWxJdGVtOiB7IHJlbW90ZUhvc3Q6IHN0cmluZzsgcmVtb3RlUG9ydDogbnVtYmVyIH0pIHtcblx0XHRjb25zdCBhZGRyZXNzID0gcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmFkZHJlc3ModHVubmVsSXRlbS5yZW1vdGVIb3N0LCB0dW5uZWxJdGVtLnJlbW90ZVBvcnQpO1xuXHRcdGlmIChhZGRyZXNzKSB7XG5cdFx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChhZGRyZXNzLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpbmxpbmVIYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRjb25zdCByZW1vdGVFeHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUV4cGxvcmVyU2VydmljZSk7XG5cdFx0XHRsZXQgdHVubmVsSXRlbTogSVR1bm5lbEl0ZW0gfCBUdW5uZWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXNJVHVubmVsSXRlbShhcmcpKSB7XG5cdFx0XHRcdHR1bm5lbEl0ZW0gPSBhcmc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSkuZ2V0Q29udGV4dEtleVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oVHVubmVsVmlld1NlbGVjdGlvbktleU5hbWUpO1xuXHRcdFx0XHR0dW5uZWxJdGVtID0gY29udGV4dCA/IHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQuZ2V0KGNvbnRleHQpIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR1bm5lbEl0ZW0pIHtcblx0XHRcdFx0cmV0dXJuIGNvcHlBZGRyZXNzKHJlbW90ZUV4cGxvcmVyU2VydmljZSwgYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKSwgdHVubmVsSXRlbSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBjb21tYW5kUGFsZXR0ZUhhbmRsZXIoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYXN5bmMgKGFjY2Vzc29yLCBhcmcpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0XHRjb25zdCByZW1vdGVFeHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUV4cGxvcmVyU2VydmljZSk7XG5cdFx0XHRjb25zdCB0dW5uZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUdW5uZWxTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgdHVubmVscyA9IEFycmF5LmZyb20ocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZC52YWx1ZXMoKSkuY29uY2F0KEFycmF5LmZyb20ocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmRldGVjdGVkLnZhbHVlcygpKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKG1ha2VUdW5uZWxQaWNrcyh0dW5uZWxzLCByZW1vdGVFeHBsb3JlclNlcnZpY2UsIHR1bm5lbFNlcnZpY2UpLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwuY29weUFkZHJlc3NQbGFjZWhvbGR0ZXInLCBcIkNob29zZSBhIGZvcndhcmRlZCBwb3J0XCIpIH0pO1xuXHRcdFx0aWYgKHJlc3VsdCAmJiByZXN1bHQudHVubmVsKSB7XG5cdFx0XHRcdGF3YWl0IGNvcHlBZGRyZXNzKHJlbW90ZUV4cGxvcmVyU2VydmljZSwgY2xpcGJvYXJkU2VydmljZSwgcmVzdWx0LnR1bm5lbCk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc3VsdCkge1xuXHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChGb3J3YXJkUG9ydEFjdGlvbi5DT01NQU5EUEFMRVRURV9JRCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5uYW1lc3BhY2UgQ2hhbmdlTG9jYWxQb3J0QWN0aW9uIHtcblx0ZXhwb3J0IGNvbnN0IElEID0gJ3JlbW90ZS50dW5uZWwuY2hhbmdlTG9jYWxQb3J0Jztcblx0ZXhwb3J0IGNvbnN0IExBQkVMID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLmNoYW5nZUxvY2FsUG9ydCcsIFwiQ2hhbmdlIExvY2FsIEFkZHJlc3MgUG9ydFwiKTtcblxuXHRmdW5jdGlvbiB2YWxpZGF0ZUlucHV0KHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLCB2YWx1ZTogc3RyaW5nLCBjYW5FbGV2YXRlOiBib29sZWFuKTogeyBjb250ZW50OiBzdHJpbmc7IHNldmVyaXR5OiBTZXZlcml0eSB9IHwgbnVsbCB7XG5cdFx0aWYgKCF2YWx1ZS5tYXRjaCgvXlswLTldKyQvKSkge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsc1ZpZXcucG9ydFNob3VsZEJlTnVtYmVyJywgXCJMb2NhbCBwb3J0IHNob3VsZCBiZSBhIG51bWJlci5cIiksIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9O1xuXHRcdH0gZWxzZSBpZiAoTnVtYmVyKHZhbHVlKSA+PSBtYXhQb3J0TnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiBpbnZhbGlkUG9ydE51bWJlclN0cmluZywgc2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yIH07XG5cdFx0fSBlbHNlIGlmIChjYW5FbGV2YXRlICYmIHR1bm5lbFNlcnZpY2UuaXNQb3J0UHJpdmlsZWdlZChOdW1iZXIodmFsdWUpKSkge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogcmVxdWlyZXNTdWRvU3RyaW5nLCBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyB9O1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBoYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRjb25zdCByZW1vdGVFeHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUV4cGxvcmVyU2VydmljZSk7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHR1bm5lbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVR1bm5lbFNlcnZpY2UpO1xuXHRcdFx0bGV0IHR1bm5lbENvbnRleHQ6IElUdW5uZWxJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGlzSVR1bm5lbEl0ZW0oYXJnKSkge1xuXHRcdFx0XHR0dW5uZWxDb250ZXh0ID0gYXJnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpLmdldENvbnRleHRLZXlWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KFR1bm5lbFZpZXdTZWxlY3Rpb25LZXlOYW1lKTtcblx0XHRcdFx0Y29uc3QgdHVubmVsID0gY29udGV4dCA/IHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQuZ2V0KGNvbnRleHQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodHVubmVsKSB7XG5cdFx0XHRcdFx0Y29uc3QgdHVubmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVHVubmVsU2VydmljZSk7XG5cdFx0XHRcdFx0dHVubmVsQ29udGV4dCA9IFR1bm5lbEl0ZW0uY3JlYXRlRnJvbVR1bm5lbChyZW1vdGVFeHBsb3JlclNlcnZpY2UsIHR1bm5lbFNlcnZpY2UsIHR1bm5lbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHR1bm5lbENvbnRleHQpIHtcblx0XHRcdFx0Y29uc3QgdHVubmVsSXRlbTogSVR1bm5lbEl0ZW0gPSB0dW5uZWxDb250ZXh0O1xuXHRcdFx0XHRyZW1vdGVFeHBsb3JlclNlcnZpY2Uuc2V0RWRpdGFibGUodHVubmVsSXRlbSwgVHVubmVsRWRpdElkLkxvY2FsUG9ydCwge1xuXHRcdFx0XHRcdG9uRmluaXNoOiBhc3luYyAodmFsdWUsIHN1Y2Nlc3MpID0+IHtcblx0XHRcdFx0XHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZS5zZXRFZGl0YWJsZSh0dW5uZWxJdGVtLCBUdW5uZWxFZGl0SWQuTG9jYWxQb3J0LCBudWxsKTtcblx0XHRcdFx0XHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHJlbW90ZUV4cGxvcmVyU2VydmljZS5jbG9zZSh7IGhvc3Q6IHR1bm5lbEl0ZW0ucmVtb3RlSG9zdCwgcG9ydDogdHVubmVsSXRlbS5yZW1vdGVQb3J0IH0sIFR1bm5lbENsb3NlUmVhc29uLk90aGVyKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbnVtYmVyVmFsdWUgPSBOdW1iZXIodmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBuZXdGb3J3YXJkID0gYXdhaXQgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmZvcndhcmQoe1xuXHRcdFx0XHRcdFx0XHRcdHJlbW90ZTogeyBob3N0OiB0dW5uZWxJdGVtLnJlbW90ZUhvc3QsIHBvcnQ6IHR1bm5lbEl0ZW0ucmVtb3RlUG9ydCB9LFxuXHRcdFx0XHRcdFx0XHRcdGxvY2FsOiBudW1iZXJWYWx1ZSxcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiB0dW5uZWxJdGVtLm5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0ZWxldmF0ZUlmTmVlZGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdHNvdXJjZTogdHVubmVsSXRlbS5zb3VyY2Vcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdGlmIChuZXdGb3J3YXJkICYmICh0eXBlb2YgbmV3Rm9yd2FyZCAhPT0gJ3N0cmluZycpICYmIG5ld0ZvcndhcmQudHVubmVsTG9jYWxQb3J0ICE9PSBudW1iZXJWYWx1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uud2FybihubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwuY2hhbmdlTG9jYWxQb3J0TnVtYmVyJywgXCJUaGUgbG9jYWwgcG9ydCB7MH0gaXMgbm90IGF2YWlsYWJsZS4gUG9ydCBudW1iZXIgezF9IGhhcyBiZWVuIHVzZWQgaW5zdGVhZFwiLCB2YWx1ZSwgbmV3Rm9yd2FyZC50dW5uZWxMb2NhbFBvcnQgPz8gbmV3Rm9yd2FyZC5sb2NhbEFkZHJlc3MpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dmFsaWRhdGlvbk1lc3NhZ2U6ICh2YWx1ZSkgPT4gdmFsaWRhdGVJbnB1dCh0dW5uZWxTZXJ2aWNlLCB2YWx1ZSwgdHVubmVsU2VydmljZS5jYW5FbGV2YXRlKSxcblx0XHRcdFx0XHRwbGFjZWhvbGRlcjogbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsc1ZpZXcuY2hhbmdlUG9ydCcsIFwiTmV3IGxvY2FsIHBvcnRcIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5uYW1lc3BhY2UgQ2hhbmdlVHVubmVsUHJpdmFjeUFjdGlvbiB7XG5cdGV4cG9ydCBmdW5jdGlvbiBoYW5kbGVyKHByaXZhY3lJZDogc3RyaW5nKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYXN5bmMgKGFjY2Vzc29yLCBhcmcpID0+IHtcblx0XHRcdGlmIChpc0lUdW5uZWxJdGVtKGFyZykpIHtcblx0XHRcdFx0Y29uc3QgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpO1xuXHRcdFx0XHRhd2FpdCByZW1vdGVFeHBsb3JlclNlcnZpY2UuY2xvc2UoeyBob3N0OiBhcmcucmVtb3RlSG9zdCwgcG9ydDogYXJnLnJlbW90ZVBvcnQgfSwgVHVubmVsQ2xvc2VSZWFzb24uT3RoZXIpO1xuXHRcdFx0XHRyZXR1cm4gcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmZvcndhcmQoe1xuXHRcdFx0XHRcdHJlbW90ZTogeyBob3N0OiBhcmcucmVtb3RlSG9zdCwgcG9ydDogYXJnLnJlbW90ZVBvcnQgfSxcblx0XHRcdFx0XHRsb2NhbDogYXJnLmxvY2FsUG9ydCxcblx0XHRcdFx0XHRuYW1lOiBhcmcubmFtZSxcblx0XHRcdFx0XHRlbGV2YXRlSWZOZWVkZWQ6IHRydWUsXG5cdFx0XHRcdFx0cHJpdmFjeTogcHJpdmFjeUlkLFxuXHRcdFx0XHRcdHNvdXJjZTogYXJnLnNvdXJjZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBTZXRUdW5uZWxQcm90b2NvbEFjdGlvbiB7XG5cdGV4cG9ydCBjb25zdCBJRF9IVFRQID0gJ3JlbW90ZS50dW5uZWwuc2V0UHJvdG9jb2xIdHRwJztcblx0ZXhwb3J0IGNvbnN0IElEX0hUVFBTID0gJ3JlbW90ZS50dW5uZWwuc2V0UHJvdG9jb2xIdHRwcyc7XG5cdGV4cG9ydCBjb25zdCBMQUJFTF9IVFRQID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLnByb3RvY29sSHR0cCcsIFwiSFRUUFwiKTtcblx0ZXhwb3J0IGNvbnN0IExBQkVMX0hUVFBTID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLnByb3RvY29sSHR0cHMnLCBcIkhUVFBTXCIpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGhhbmRsZXIoYXJnOiBhbnksIHByb3RvY29sOiBUdW5uZWxQcm90b2NvbCwgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpIHtcblx0XHRpZiAoaXNJVHVubmVsSXRlbShhcmcpKSB7XG5cdFx0XHRjb25zdCBhdHRyaWJ1dGVzOiBQYXJ0aWFsPEF0dHJpYnV0ZXM+ID0ge1xuXHRcdFx0XHRwcm90b2NvbFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgPyBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFIDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMO1xuXHRcdFx0cmV0dXJuIHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5jb25maWdQb3J0c0F0dHJpYnV0ZXMuYWRkQXR0cmlidXRlcyhhcmcucmVtb3RlUG9ydCwgYXR0cmlidXRlcywgdGFyZ2V0KTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaGFuZGxlckh0dHAoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYXN5bmMgKGFjY2Vzc29yLCBhcmcpID0+IHtcblx0XHRcdHJldHVybiBoYW5kbGVyKGFyZywgVHVubmVsUHJvdG9jb2wuSHR0cCwgYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSkpO1xuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaGFuZGxlckh0dHBzKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRyZXR1cm4gaGFuZGxlcihhcmcsIFR1bm5lbFByb3RvY29sLkh0dHBzLCBhY2Nlc3Nvci5nZXQoSVJlbW90ZUV4cGxvcmVyU2VydmljZSksIGFjY2Vzc29yLmdldChJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlKSk7XG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCB0dW5uZWxWaWV3Q29tbWFuZHNXZWlnaHRCb251cyA9IDEwOyAvLyBnaXZlIG91ciBjb21tYW5kcyBhIGxpdHRsZSBiaXQgbW9yZSB3ZWlnaHQgb3ZlciBvdGhlciBkZWZhdWx0IGxpc3QvdHJlZSBjb21tYW5kc1xuXG5jb25zdCBpc0ZvcndhcmRlZEV4cHIgPSBUdW5uZWxUeXBlQ29udGV4dEtleS5pc0VxdWFsVG8oVHVubmVsVHlwZS5Gb3J3YXJkZWQpO1xuY29uc3QgaXNGb3J3YXJkZWRPckRldGVjdGVkRXhwciA9IENvbnRleHRLZXlFeHByLm9yKGlzRm9yd2FyZGVkRXhwciwgVHVubmVsVHlwZUNvbnRleHRLZXkuaXNFcXVhbFRvKFR1bm5lbFR5cGUuRGV0ZWN0ZWQpKTtcbmNvbnN0IGlzTm90TXVsdGlTZWxlY3Rpb25FeHByID0gVHVubmVsVmlld011bHRpU2VsZWN0aW9uQ29udGV4dEtleS5pc0VxdWFsVG8odW5kZWZpbmVkKTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBMYWJlbFR1bm5lbEFjdGlvbi5JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyB0dW5uZWxWaWV3Q29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFR1bm5lbFZpZXdGb2N1c0NvbnRleHRLZXksIGlzRm9yd2FyZGVkRXhwciwgaXNOb3RNdWx0aVNlbGVjdGlvbkV4cHIpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkYyLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyXG5cdH0sXG5cdGhhbmRsZXI6IExhYmVsVHVubmVsQWN0aW9uLmhhbmRsZXIoKVxufSk7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChGb3J3YXJkUG9ydEFjdGlvbi5JTkxJTkVfSUQsIEZvcndhcmRQb3J0QWN0aW9uLmlubGluZUhhbmRsZXIoKSk7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChGb3J3YXJkUG9ydEFjdGlvbi5DT01NQU5EUEFMRVRURV9JRCwgRm9yd2FyZFBvcnRBY3Rpb24uY29tbWFuZFBhbGV0dGVIYW5kbGVyKCkpO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBDbG9zZVBvcnRBY3Rpb24uSU5MSU5FX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIHR1bm5lbFZpZXdDb21tYW5kc1dlaWdodEJvbnVzLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVHVubmVsQ2xvc2VhYmxlQ29udGV4dEtleSwgVHVubmVsVmlld0ZvY3VzQ29udGV4dEtleSksXG5cdHByaW1hcnk6IEtleUNvZGUuRGVsZXRlLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdHNlY29uZGFyeTogW0tleUNvZGUuRGVsZXRlXVxuXHR9LFxuXHRoYW5kbGVyOiBDbG9zZVBvcnRBY3Rpb24uaW5saW5lSGFuZGxlcigpXG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQ2xvc2VQb3J0QWN0aW9uLkNPTU1BTkRQQUxFVFRFX0lELCBDbG9zZVBvcnRBY3Rpb24uY29tbWFuZFBhbGV0dGVIYW5kbGVyKCkpO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoT3BlblBvcnRJbkJyb3dzZXJBY3Rpb24uSUQsIE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLmhhbmRsZXIoKSk7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChPcGVuUG9ydEluUHJldmlld0FjdGlvbi5JRCwgT3BlblBvcnRJblByZXZpZXdBY3Rpb24uaGFuZGxlcigpKTtcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKE9wZW5Qb3J0SW5Ccm93c2VyQ29tbWFuZFBhbGV0dGVBY3Rpb24uSUQsIE9wZW5Qb3J0SW5Ccm93c2VyQ29tbWFuZFBhbGV0dGVBY3Rpb24uaGFuZGxlcigpKTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ29weUFkZHJlc3NBY3Rpb24uSU5MSU5FX0lELFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIHR1bm5lbFZpZXdDb21tYW5kc1dlaWdodEJvbnVzLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVHVubmVsVmlld0ZvY3VzQ29udGV4dEtleSwgaXNGb3J3YXJkZWRPckRldGVjdGVkRXhwciwgaXNOb3RNdWx0aVNlbGVjdGlvbkV4cHIpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Qyxcblx0aGFuZGxlcjogQ29weUFkZHJlc3NBY3Rpb24uaW5saW5lSGFuZGxlcigpXG59KTtcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKENvcHlBZGRyZXNzQWN0aW9uLkNPTU1BTkRQQUxFVFRFX0lELCBDb3B5QWRkcmVzc0FjdGlvbi5jb21tYW5kUGFsZXR0ZUhhbmRsZXIoKSk7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChDaGFuZ2VMb2NhbFBvcnRBY3Rpb24uSUQsIENoYW5nZUxvY2FsUG9ydEFjdGlvbi5oYW5kbGVyKCkpO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoU2V0VHVubmVsUHJvdG9jb2xBY3Rpb24uSURfSFRUUCwgU2V0VHVubmVsUHJvdG9jb2xBY3Rpb24uaGFuZGxlckh0dHAoKSk7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChTZXRUdW5uZWxQcm90b2NvbEFjdGlvbi5JRF9IVFRQUywgU2V0VHVubmVsUHJvdG9jb2xBY3Rpb24uaGFuZGxlckh0dHBzKCkpO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCAoe1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENsb3NlUG9ydEFjdGlvbi5DT01NQU5EUEFMRVRURV9JRCxcblx0XHR0aXRsZTogQ2xvc2VQb3J0QWN0aW9uLkxBQkVMXG5cdH0sXG5cdHdoZW46IGZvcndhcmRlZFBvcnRzVmlld0VuYWJsZWRcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsICh7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRm9yd2FyZFBvcnRBY3Rpb24uQ09NTUFORFBBTEVUVEVfSUQsXG5cdFx0dGl0bGU6IEZvcndhcmRQb3J0QWN0aW9uLkxBQkVMXG5cdH0sXG5cdHdoZW46IGZvcndhcmRlZFBvcnRzVmlld0VuYWJsZWRcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsICh7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ29weUFkZHJlc3NBY3Rpb24uQ09NTUFORFBBTEVUVEVfSUQsXG5cdFx0dGl0bGU6IENvcHlBZGRyZXNzQWN0aW9uLkNPTU1BTkRQQUxFVFRFX0xBQkVMXG5cdH0sXG5cdHdoZW46IGZvcndhcmRlZFBvcnRzVmlld0VuYWJsZWRcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsICh7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogT3BlblBvcnRJbkJyb3dzZXJDb21tYW5kUGFsZXR0ZUFjdGlvbi5JRCxcblx0XHR0aXRsZTogT3BlblBvcnRJbkJyb3dzZXJDb21tYW5kUGFsZXR0ZUFjdGlvbi5MQUJFTFxuXHR9LFxuXHR3aGVuOiBmb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkXG59KSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsQ29udGV4dCwgKHtcblx0Z3JvdXA6ICcuX29wZW4nLFxuXHRvcmRlcjogMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBPcGVuUG9ydEluQnJvd3NlckFjdGlvbi5JRCxcblx0XHR0aXRsZTogT3BlblBvcnRJbkJyb3dzZXJBY3Rpb24uTEFCRUwsXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChpc0ZvcndhcmRlZE9yRGV0ZWN0ZWRFeHByLCBpc05vdE11bHRpU2VsZWN0aW9uRXhwcilcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsQ29udGV4dCwgKHtcblx0Z3JvdXA6ICcuX29wZW4nLFxuXHRvcmRlcjogMSxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBPcGVuUG9ydEluUHJldmlld0FjdGlvbi5JRCxcblx0XHR0aXRsZTogT3BlblBvcnRJblByZXZpZXdBY3Rpb24uTEFCRUwsXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRpc0ZvcndhcmRlZE9yRGV0ZWN0ZWRFeHByLFxuXHRcdGlzTm90TXVsdGlTZWxlY3Rpb25FeHByKVxufSkpO1xuLy8gVGhlIGdyb3VwIDBfbWFuYWdlIGlzIHVzZWQgYnkgZXh0ZW5zaW9ucywgc28gdHJ5IG5vdCB0byBjaGFuZ2UgaXRcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsQ29udGV4dCwgKHtcblx0Z3JvdXA6ICcwX21hbmFnZScsXG5cdG9yZGVyOiAxLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IExhYmVsVHVubmVsQWN0aW9uLklELFxuXHRcdHRpdGxlOiBMYWJlbFR1bm5lbEFjdGlvbi5MQUJFTCxcblx0XHRpY29uOiBsYWJlbFBvcnRJY29uXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChpc0ZvcndhcmRlZEV4cHIsIGlzTm90TXVsdGlTZWxlY3Rpb25FeHByKVxufSkpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxDb250ZXh0LCAoe1xuXHRncm91cDogJzJfbG9jYWxhZGRyZXNzJyxcblx0b3JkZXI6IDAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ29weUFkZHJlc3NBY3Rpb24uSU5MSU5FX0lELFxuXHRcdHRpdGxlOiBDb3B5QWRkcmVzc0FjdGlvbi5JTkxJTkVfTEFCRUwsXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChpc0ZvcndhcmRlZE9yRGV0ZWN0ZWRFeHByLCBpc05vdE11bHRpU2VsZWN0aW9uRXhwcilcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsQ29udGV4dCwgKHtcblx0Z3JvdXA6ICcyX2xvY2FsYWRkcmVzcycsXG5cdG9yZGVyOiAxLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENoYW5nZUxvY2FsUG9ydEFjdGlvbi5JRCxcblx0XHR0aXRsZTogQ2hhbmdlTG9jYWxQb3J0QWN0aW9uLkxBQkVMLFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoaXNGb3J3YXJkZWRFeHByLCBQb3J0Q2hhbmdhYmxlQ29udGV4dEtleSwgaXNOb3RNdWx0aVNlbGVjdGlvbkV4cHIpXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbENvbnRleHQsICh7XG5cdGdyb3VwOiAnMl9sb2NhbGFkZHJlc3MnLFxuXHRvcmRlcjogMixcblx0c3VibWVudTogTWVudUlkLlR1bm5lbFByaXZhY3ksXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ3R1bm5lbENvbnRleHQucHJpdmFjeU1lbnUnLCBcIlBvcnQgVmlzaWJpbGl0eVwiKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGlzRm9yd2FyZGVkRXhwciwgVHVubmVsUHJpdmFjeUVuYWJsZWRDb250ZXh0S2V5KVxufSkpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxDb250ZXh0LCAoe1xuXHRncm91cDogJzJfbG9jYWxhZGRyZXNzJyxcblx0b3JkZXI6IDMsXG5cdHN1Ym1lbnU6IE1lbnVJZC5UdW5uZWxQcm90b2NvbCxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgndHVubmVsQ29udGV4dC5wcm90b2NvbE1lbnUnLCBcIkNoYW5nZSBQb3J0IFByb3RvY29sXCIpLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoaXNGb3J3YXJkZWRFeHByLCBpc05vdE11bHRpU2VsZWN0aW9uRXhwciwgUHJvdG9jb2xDaGFuZ2VhYmxlQ29udGV4dEtleSlcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsQ29udGV4dCwgKHtcblx0Z3JvdXA6ICczX2ZvcndhcmQnLFxuXHRvcmRlcjogMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDbG9zZVBvcnRBY3Rpb24uSU5MSU5FX0lELFxuXHRcdHRpdGxlOiBDbG9zZVBvcnRBY3Rpb24uTEFCRUwsXG5cdH0sXG5cdHdoZW46IFR1bm5lbENsb3NlYWJsZUNvbnRleHRLZXlcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsQ29udGV4dCwgKHtcblx0Z3JvdXA6ICczX2ZvcndhcmQnLFxuXHRvcmRlcjogMSxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBGb3J3YXJkUG9ydEFjdGlvbi5JTkxJTkVfSUQsXG5cdFx0dGl0bGU6IEZvcndhcmRQb3J0QWN0aW9uLkxBQkVMLFxuXHR9LFxufSkpO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbFByb3RvY29sLCAoe1xuXHRvcmRlcjogMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTZXRUdW5uZWxQcm90b2NvbEFjdGlvbi5JRF9IVFRQLFxuXHRcdHRpdGxlOiBTZXRUdW5uZWxQcm90b2NvbEFjdGlvbi5MQUJFTF9IVFRQLFxuXHRcdHRvZ2dsZWQ6IFR1bm5lbFByb3RvY29sQ29udGV4dEtleS5pc0VxdWFsVG8oVHVubmVsUHJvdG9jb2wuSHR0cClcblx0fVxufSkpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxQcm90b2NvbCwgKHtcblx0b3JkZXI6IDEsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU2V0VHVubmVsUHJvdG9jb2xBY3Rpb24uSURfSFRUUFMsXG5cdFx0dGl0bGU6IFNldFR1bm5lbFByb3RvY29sQWN0aW9uLkxBQkVMX0hUVFBTLFxuXHRcdHRvZ2dsZWQ6IFR1bm5lbFByb3RvY29sQ29udGV4dEtleS5pc0VxdWFsVG8oVHVubmVsUHJvdG9jb2wuSHR0cHMpXG5cdH1cbn0pKTtcblxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbFBvcnRJbmxpbmUsICh7XG5cdGdyb3VwOiAnMF9tYW5hZ2UnLFxuXHRvcmRlcjogMCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBGb3J3YXJkUG9ydEFjdGlvbi5JTkxJTkVfSUQsXG5cdFx0dGl0bGU6IEZvcndhcmRQb3J0QWN0aW9uLlRSRUVJVEVNX0xBQkVMLFxuXHRcdGljb246IGZvcndhcmRQb3J0SWNvblxuXHR9LFxuXHR3aGVuOiBUdW5uZWxUeXBlQ29udGV4dEtleS5pc0VxdWFsVG8oVHVubmVsVHlwZS5DYW5kaWRhdGUpXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbFBvcnRJbmxpbmUsICh7XG5cdGdyb3VwOiAnMF9tYW5hZ2UnLFxuXHRvcmRlcjogNCxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBMYWJlbFR1bm5lbEFjdGlvbi5JRCxcblx0XHR0aXRsZTogTGFiZWxUdW5uZWxBY3Rpb24uTEFCRUwsXG5cdFx0aWNvbjogbGFiZWxQb3J0SWNvblxuXHR9LFxuXHR3aGVuOiBpc0ZvcndhcmRlZEV4cHJcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsUG9ydElubGluZSwgKHtcblx0Z3JvdXA6ICcwX21hbmFnZScsXG5cdG9yZGVyOiA1LFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENsb3NlUG9ydEFjdGlvbi5JTkxJTkVfSUQsXG5cdFx0dGl0bGU6IENsb3NlUG9ydEFjdGlvbi5MQUJFTCxcblx0XHRpY29uOiBzdG9wRm9yd2FyZEljb25cblx0fSxcblx0d2hlbjogVHVubmVsQ2xvc2VhYmxlQ29udGV4dEtleVxufSkpO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbExvY2FsQWRkcmVzc0lubGluZSwgKHtcblx0b3JkZXI6IC0xLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENvcHlBZGRyZXNzQWN0aW9uLklOTElORV9JRCxcblx0XHR0aXRsZTogQ29weUFkZHJlc3NBY3Rpb24uSU5MSU5FX0xBQkVMLFxuXHRcdGljb246IGNvcHlBZGRyZXNzSWNvblxuXHR9LFxuXHR3aGVuOiBpc0ZvcndhcmRlZE9yRGV0ZWN0ZWRFeHByXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbExvY2FsQWRkcmVzc0lubGluZSwgKHtcblx0b3JkZXI6IDAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogT3BlblBvcnRJbkJyb3dzZXJBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLkxBQkVMLFxuXHRcdGljb246IG9wZW5Ccm93c2VySWNvblxuXHR9LFxuXHR3aGVuOiBpc0ZvcndhcmRlZE9yRGV0ZWN0ZWRFeHByXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbExvY2FsQWRkcmVzc0lubGluZSwgKHtcblx0b3JkZXI6IDEsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogT3BlblBvcnRJblByZXZpZXdBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IE9wZW5Qb3J0SW5QcmV2aWV3QWN0aW9uLkxBQkVMLFxuXHRcdGljb246IG9wZW5QcmV2aWV3SWNvblxuXHR9LFxuXHR3aGVuOiBpc0ZvcndhcmRlZE9yRGV0ZWN0ZWRFeHByXG59KSk7XG5cbnJlZ2lzdGVyQ29sb3IoJ3BvcnRzLmljb25SdW5uaW5nUHJvY2Vzc0ZvcmVncm91bmQnLCBTVEFUVVNfQkFSX1JFTU9URV9JVEVNX0JBQ0tHUk9VTkQsIG5scy5sb2NhbGl6ZSgncG9ydFdpdGhSdW5uaW5nUHJvY2Vzcy5mb3JlZ3JvdW5kJywgXCJUaGUgY29sb3Igb2YgdGhlIGljb24gZm9yIGEgcG9ydCB0aGF0IGhhcyBhbiBhc3NvY2lhdGVkIHJ1bm5pbmcgcHJvY2Vzcy5cIikpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFlBQVksU0FBUztBQUNyQixTQUF5Qyw4QkFBOEI7QUFDdkUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMsb0JBQWlDLGVBQWUsc0JBQXNCO0FBQy9FLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwRDtBQUNuRSxTQUFTLGlC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QUEsRUFDUCxTQUFTO0FBQUEsSUFDUixJQUFJLHdCQUF3QjtBQUFBLElBQzVCLE9BQU8sd0JBQXdCO0FBQUEsSUFDL0IsTUFBTTtBQUFBLEVBQ1A7QUFBQSxFQUNBLE1BQU07QUFDUCxDQUFFO0FBQ0YsYUFBYSxlQUFlLE9BQU8sMEJBQTJCO0FBQUEsRUFDN0QsT0FBTztBQUFBLEVBQ1AsU0FBUztBQUFBLElBQ1IsSUFBSSx3QkFBd0I7QUFBQSxJQUM1QixPQUFPLHdCQUF3QjtBQUFBLElBQy9CLE1BQU07QUFBQSxFQUNQO0FBQUEsRUFDQSxNQUFNO0FBQ1AsQ0FBRTtBQUVGLGNBQWMsc0NBQXNDLG1DQUFtQyxJQUFJLFNBQVMscUNBQXFDLDBFQUEwRSxDQUFDOyIsCiAgIm5hbWVzIjogWyJ2YWx1ZSIsICJMYWJlbFR1bm5lbEFjdGlvbiIsICJGb3J3YXJkUG9ydEFjdGlvbiIsICJDbG9zZVBvcnRBY3Rpb24iLCAiT3BlblBvcnRJbkJyb3dzZXJBY3Rpb24iLCAiT3BlblBvcnRJblByZXZpZXdBY3Rpb24iLCAiT3BlblBvcnRJbkJyb3dzZXJDb21tYW5kUGFsZXR0ZUFjdGlvbiIsICJDb3B5QWRkcmVzc0FjdGlvbiIsICJDaGFuZ2VMb2NhbFBvcnRBY3Rpb24iLCAidHVubmVsU2VydmljZSIsICJDaGFuZ2VUdW5uZWxQcml2YWN5QWN0aW9uIiwgIlNldFR1bm5lbFByb3RvY29sQWN0aW9uIl0KfQo=
