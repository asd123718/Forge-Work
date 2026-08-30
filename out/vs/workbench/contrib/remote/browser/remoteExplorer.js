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
import * as nls from "../../../../nls.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Extensions, ViewContainerLocation } from "../../../common/views.js";
import { IRemoteExplorerService, PORT_AUTO_FALLBACK_SETTING, PORT_AUTO_FORWARD_SETTING, PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_HYBRID, PORT_AUTO_SOURCE_SETTING_OUTPUT, PORT_AUTO_SOURCE_SETTING_PROCESS, PortsEnablement, TUNNEL_VIEW_CONTAINER_ID, TUNNEL_VIEW_ID } from "../../../services/remote/common/remoteExplorerService.js";
import { AutoTunnelSource, forwardedPortsFeaturesEnabled, forwardedPortsViewEnabled, makeAddress, mapHasAddressLocalhostOrAllInterfaces, OnPortForward, TunnelCloseReason, TunnelSource } from "../../../services/remote/common/tunnelModel.js";
import { ForwardPortAction, OpenPortInBrowserAction, TunnelPanel, TunnelPanelDescriptor, TunnelViewModel, OpenPortInPreviewAction, openPreviewEnabledContext } from "./tunnelView.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { UrlFinder } from "./urlFinder.js";
import Severity from "../../../../base/common/severity.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITerminalService } from "../../terminal/browser/terminal.js";
import { IDebugService } from "../../debug/common/debug.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { isWeb, OperatingSystem } from "../../../../base/common/platform.js";
import { isAllInterfaces, isLocalhost, ITunnelService, TunnelPrivacyId } from "../../../../platform/tunnel/common/tunnel.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { IActivityService, NumberBadge } from "../../../services/activity/common/activity.js";
import { portsViewIcon } from "./remoteIcons.js";
import { Event } from "../../../../base/common/event.js";
import { IExternalUriOpenerService } from "../../externalUriOpener/common/externalUriOpenerService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { toAction } from "../../../../base/common/actions.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
const VIEWLET_ID = "workbench.view.remote";
const TOGGLE_VIEW_ACTION_ID = "remoteExplorer.toggleForwardedPortsView";
function isCandidateRemappedTunnelLocalEndpoint(candidate, tunnels) {
  if (!isLocalhost(candidate.host) && !isAllInterfaces(candidate.host)) {
    return false;
  }
  for (const tunnel of tunnels) {
    if (tunnel.localPort === candidate.port && tunnel.remotePort !== candidate.port) {
      return true;
    }
  }
  return false;
}
let ForwardedPortsView = class extends Disposable {
  constructor(contextKeyService, environmentService, remoteExplorerService, tunnelService, activityService, statusbarService) {
    super();
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.remoteExplorerService = remoteExplorerService;
    this.tunnelService = tunnelService;
    this.activityService = activityService;
    this.statusbarService = statusbarService;
    this.contextKeyListener = this._register(new MutableDisposable());
    this.activityBadge = this._register(new MutableDisposable());
    this.hasPortsInSession = false;
    this._register(Registry.as(Extensions.ViewsRegistry).registerViewWelcomeContent(TUNNEL_VIEW_ID, {
      content: this.environmentService.remoteAuthority ? nls.localize("remoteNoPorts", "No forwarded ports. Forward a port to access your running services locally.\n[Forward a Port]({0})", `command:${ForwardPortAction.INLINE_ID}`) : nls.localize("noRemoteNoPorts", "No forwarded ports. Forward a port to access your locally running services over the internet.\n[Forward a Port]({0})", `command:${ForwardPortAction.INLINE_ID}`)
    }));
    this.enableBadgeAndStatusBar();
    this.enableForwardedPortsFeatures();
    if (!this.environmentService.remoteAuthority) {
      this._register(Event.once(this.tunnelService.onTunnelOpened)(() => {
        this.hasPortsInSession = true;
      }));
    }
  }
  async getViewContainer() {
    return Registry.as(Extensions.ViewContainersRegistry).registerViewContainer({
      id: TUNNEL_VIEW_CONTAINER_ID,
      title: nls.localize2("ports", "Ports"),
      icon: portsViewIcon,
      ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [TUNNEL_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
      storageId: TUNNEL_VIEW_CONTAINER_ID,
      hideIfEmpty: true,
      order: 5
    }, ViewContainerLocation.Panel);
  }
  async enableForwardedPortsFeatures() {
    this.contextKeyListener.clear();
    const featuresEnabled = !!forwardedPortsFeaturesEnabled.getValue(this.contextKeyService);
    const viewEnabled = !!forwardedPortsViewEnabled.getValue(this.contextKeyService);
    if (featuresEnabled || viewEnabled) {
      if (!viewEnabled) {
        this.contextKeyService.createKey(forwardedPortsViewEnabled.key, true);
      }
      const viewContainer = await this.getViewContainer();
      const tunnelPanelDescriptor = new TunnelPanelDescriptor(new TunnelViewModel(this.remoteExplorerService, this.tunnelService), this.environmentService);
      const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
      if (viewContainer) {
        this.remoteExplorerService.enablePortsFeatures(!featuresEnabled);
        viewsRegistry.registerViews([tunnelPanelDescriptor], viewContainer);
      }
    } else {
      this.contextKeyListener.value = this.contextKeyService.onDidChangeContext((e) => {
        if (e.affectsSome(/* @__PURE__ */ new Set([...forwardedPortsFeaturesEnabled.keys(), ...forwardedPortsViewEnabled.keys()]))) {
          this.enableForwardedPortsFeatures();
        }
      });
    }
  }
  enableBadgeAndStatusBar() {
    const disposable = Registry.as(Extensions.ViewsRegistry).onViewsRegistered((e) => {
      if (e.find((view) => view.views.find((viewDescriptor) => viewDescriptor.id === TUNNEL_VIEW_ID))) {
        this._register(Event.debounce(this.remoteExplorerService.tunnelModel.onForwardPort, (_last, e2) => e2, 50)(() => {
          this.updateActivityBadge();
          this.updateStatusBar();
        }));
        this._register(Event.debounce(this.remoteExplorerService.tunnelModel.onClosePort, (_last, e2) => e2, 50)(() => {
          this.updateActivityBadge();
          this.updateStatusBar();
        }));
        this.updateActivityBadge();
        this.updateStatusBar();
        disposable.dispose();
      }
    });
  }
  async updateActivityBadge() {
    if (this.remoteExplorerService.tunnelModel.forwarded.size > 0) {
      this.activityBadge.value = this.activityService.showViewActivity(TUNNEL_VIEW_ID, {
        badge: new NumberBadge(this.remoteExplorerService.tunnelModel.forwarded.size, (n) => n === 1 ? nls.localize("1forwardedPort", "1 forwarded port") : nls.localize("nForwardedPorts", "{0} forwarded ports", n))
      });
    } else {
      this.activityBadge.clear();
    }
  }
  updateStatusBar() {
    if (!this.environmentService.remoteAuthority && !this.hasPortsInSession) {
      return;
    }
    if (!this.entryAccessor) {
      this._register(this.entryAccessor = this.statusbarService.addEntry(this.entry, "status.forwardedPorts", StatusbarAlignment.LEFT, 40));
    } else {
      this.entryAccessor.update(this.entry);
    }
  }
  get entry() {
    let tooltip;
    const count = this.remoteExplorerService.tunnelModel.forwarded.size + this.remoteExplorerService.tunnelModel.detected.size;
    const text = `${count}`;
    if (count === 0) {
      tooltip = nls.localize("remote.forwardedPorts.statusbarTextNone", "No Ports Forwarded");
    } else {
      const allTunnels = Array.from(this.remoteExplorerService.tunnelModel.forwarded.values());
      allTunnels.push(...Array.from(this.remoteExplorerService.tunnelModel.detected.values()));
      tooltip = nls.localize(
        "remote.forwardedPorts.statusbarTooltip",
        "Forwarded Ports: {0}",
        allTunnels.map((forwarded) => forwarded.remotePort).join(", ")
      );
    }
    return {
      name: nls.localize("status.forwardedPorts", "Forwarded Ports"),
      text: `$(radio-tower) ${text}`,
      ariaLabel: tooltip,
      tooltip,
      command: TOGGLE_VIEW_ACTION_ID
    };
  }
};
ForwardedPortsView = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IWorkbenchEnvironmentService),
  __decorateParam(2, IRemoteExplorerService),
  __decorateParam(3, ITunnelService),
  __decorateParam(4, IActivityService),
  __decorateParam(5, IStatusbarService)
], ForwardedPortsView);
let PortRestore = class {
  constructor(remoteExplorerService, logService) {
    this.remoteExplorerService = remoteExplorerService;
    this.logService = logService;
    if (!this.remoteExplorerService.tunnelModel.environmentTunnelsSet) {
      Event.once(this.remoteExplorerService.tunnelModel.onEnvironmentTunnelsSet)(async () => {
        await this.restore();
      });
    } else {
      this.restore();
    }
  }
  async restore() {
    this.logService.trace("ForwardedPorts: Doing first restore.");
    return this.remoteExplorerService.restore();
  }
};
PortRestore = __decorateClass([
  __decorateParam(0, IRemoteExplorerService),
  __decorateParam(1, ILogService)
], PortRestore);
let AutomaticPortForwarding = class extends Disposable {
  constructor(terminalService, notificationService, openerService, externalOpenerService, remoteExplorerService, environmentService, contextKeyService, configurationService, debugService, remoteAgentService, tunnelService, hostService, logService, storageService, preferencesService) {
    super();
    this.terminalService = terminalService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.externalOpenerService = externalOpenerService;
    this.remoteExplorerService = remoteExplorerService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.debugService = debugService;
    this.tunnelService = tunnelService;
    this.hostService = hostService;
    this.logService = logService;
    this.storageService = storageService;
    this.preferencesService = preferencesService;
    if (!environmentService.remoteAuthority) {
      return;
    }
    configurationService.whenRemoteConfigurationLoaded().then(() => remoteAgentService.getEnvironment()).then((environment) => {
      this.setup(environment);
      this._register(configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(PORT_AUTO_SOURCE_SETTING)) {
          this.setup(environment);
        } else if (e.affectsConfiguration(PORT_AUTO_FALLBACK_SETTING) && !this.portListener) {
          this.listenForPorts();
        }
      }));
    });
    if (!this.storageService.getBoolean("processPortForwardingFallback", StorageScope.WORKSPACE, true)) {
      this.configurationService.updateValue(PORT_AUTO_FALLBACK_SETTING, 0, ConfigurationTarget.WORKSPACE);
    }
  }
  getPortAutoFallbackNumber() {
    const fallbackAt = this.configurationService.inspect(PORT_AUTO_FALLBACK_SETTING);
    if (fallbackAt.value !== void 0 && (fallbackAt.value === 0 || fallbackAt.value !== fallbackAt.defaultValue)) {
      return fallbackAt.value;
    }
    const inspectSource = this.configurationService.inspect(PORT_AUTO_SOURCE_SETTING);
    if (inspectSource.applicationValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.userValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.userLocalValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.userRemoteValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.workspaceFolderValue === PORT_AUTO_SOURCE_SETTING_PROCESS || inspectSource.workspaceValue === PORT_AUTO_SOURCE_SETTING_PROCESS) {
      return 0;
    }
    return fallbackAt.value ?? 20;
  }
  listenForPorts() {
    let fallbackAt = this.getPortAutoFallbackNumber();
    if (fallbackAt === 0) {
      this.portListener?.dispose();
      return;
    }
    if (this.procForwarder && !this.portListener && this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_PROCESS) {
      this.portListener = this._register(this.remoteExplorerService.tunnelModel.onForwardPort(async () => {
        fallbackAt = this.getPortAutoFallbackNumber();
        if (fallbackAt === 0) {
          this.portListener?.dispose();
          return;
        }
        if (Array.from(this.remoteExplorerService.tunnelModel.forwarded.values()).filter((tunnel) => tunnel.source.source === TunnelSource.Auto).length > fallbackAt) {
          await this.configurationService.updateValue(PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_HYBRID);
          this.notificationService.notify({
            message: nls.localize("remote.autoForwardPortsSource.fallback", "Over 20 ports have been automatically forwarded. The `process` based automatic port forwarding has been switched to `hybrid` in settings. Some ports may no longer be detected."),
            severity: Severity.Warning,
            actions: {
              primary: [
                toAction({
                  id: "switchBack",
                  label: nls.localize("remote.autoForwardPortsSource.fallback.switchBack", "Undo"),
                  run: async () => {
                    await this.configurationService.updateValue(PORT_AUTO_SOURCE_SETTING, PORT_AUTO_SOURCE_SETTING_PROCESS);
                    await this.configurationService.updateValue(PORT_AUTO_FALLBACK_SETTING, 0, ConfigurationTarget.WORKSPACE);
                    this.portListener?.dispose();
                    this.portListener = void 0;
                  }
                }),
                toAction({
                  id: "showPortSourceSetting",
                  label: nls.localize("remote.autoForwardPortsSource.fallback.showPortSourceSetting", "Show Setting"),
                  run: async () => {
                    await this.preferencesService.openSettings({
                      query: "remote.autoForwardPortsSource"
                    });
                  }
                })
              ]
            }
          });
        }
      }));
    } else {
      this.portListener?.dispose();
      this.portListener = void 0;
    }
  }
  setup(environment) {
    const alreadyForwarded = this.procForwarder?.forwarded;
    const isSwitch = this.outputForwarder || this.procForwarder;
    this.procForwarder?.dispose();
    this.procForwarder = void 0;
    this.outputForwarder?.dispose();
    this.outputForwarder = void 0;
    if (environment?.os !== OperatingSystem.Linux) {
      if (this.configurationService.inspect(PORT_AUTO_SOURCE_SETTING).default?.value !== PORT_AUTO_SOURCE_SETTING_OUTPUT) {
        Registry.as(ConfigurationExtensions.Configuration).registerDefaultConfigurations([{ overrides: { "remote.autoForwardPortsSource": PORT_AUTO_SOURCE_SETTING_OUTPUT } }]);
      }
      this.outputForwarder = this._register(new OutputAutomaticPortForwarding(
        this.terminalService,
        this.notificationService,
        this.openerService,
        this.externalOpenerService,
        this.remoteExplorerService,
        this.configurationService,
        this.debugService,
        this.tunnelService,
        this.hostService,
        this.logService,
        this.contextKeyService,
        () => false
      ));
    } else {
      const useProc = () => this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_PROCESS;
      if (useProc()) {
        this.procForwarder = this._register(new ProcAutomaticPortForwarding(
          false,
          alreadyForwarded,
          !isSwitch,
          this.configurationService,
          this.remoteExplorerService,
          this.notificationService,
          this.openerService,
          this.externalOpenerService,
          this.tunnelService,
          this.hostService,
          this.logService,
          this.contextKeyService
        ));
      } else if (this.configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_HYBRID) {
        this.procForwarder = this._register(new ProcAutomaticPortForwarding(
          true,
          alreadyForwarded,
          !isSwitch,
          this.configurationService,
          this.remoteExplorerService,
          this.notificationService,
          this.openerService,
          this.externalOpenerService,
          this.tunnelService,
          this.hostService,
          this.logService,
          this.contextKeyService
        ));
      }
      this.outputForwarder = this._register(new OutputAutomaticPortForwarding(
        this.terminalService,
        this.notificationService,
        this.openerService,
        this.externalOpenerService,
        this.remoteExplorerService,
        this.configurationService,
        this.debugService,
        this.tunnelService,
        this.hostService,
        this.logService,
        this.contextKeyService,
        useProc
      ));
    }
    this.listenForPorts();
  }
};
AutomaticPortForwarding = __decorateClass([
  __decorateParam(0, ITerminalService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IExternalUriOpenerService),
  __decorateParam(4, IRemoteExplorerService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IWorkbenchConfigurationService),
  __decorateParam(8, IDebugService),
  __decorateParam(9, IRemoteAgentService),
  __decorateParam(10, ITunnelService),
  __decorateParam(11, IHostService),
  __decorateParam(12, ILogService),
  __decorateParam(13, IStorageService),
  __decorateParam(14, IPreferencesService)
], AutomaticPortForwarding);
const _OnAutoForwardedAction = class _OnAutoForwardedAction extends Disposable {
  constructor(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService) {
    super();
    this.notificationService = notificationService;
    this.remoteExplorerService = remoteExplorerService;
    this.openerService = openerService;
    this.externalOpenerService = externalOpenerService;
    this.tunnelService = tunnelService;
    this.hostService = hostService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.notificationDisposable = this._register(new MutableDisposable());
    this.alreadyOpenedOnce = /* @__PURE__ */ new Set();
    this.lastNotifyTime = /* @__PURE__ */ new Date();
    this.lastNotifyTime.setFullYear(this.lastNotifyTime.getFullYear() - 1);
  }
  async doAction(tunnels) {
    this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Starting action for ${tunnels[0]?.tunnelRemotePort}`);
    this.doActionTunnels = tunnels;
    const tunnel = await this.portNumberHeuristicDelay();
    this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose ${tunnel?.tunnelRemotePort}`);
    if (tunnel) {
      const allAttributes = await this.remoteExplorerService.tunnelModel.getAttributes([{ port: tunnel.tunnelRemotePort, host: tunnel.tunnelRemoteHost }]);
      const attributes = allAttributes?.get(tunnel.tunnelRemotePort)?.onAutoForward;
      this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) onAutoForward action is ${attributes}`);
      switch (attributes) {
        case OnPortForward.OpenBrowserOnce: {
          if (this.alreadyOpenedOnce.has(tunnel.localAddress)) {
            break;
          }
          this.alreadyOpenedOnce.add(tunnel.localAddress);
        }
        case OnPortForward.OpenBrowser: {
          const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
          await OpenPortInBrowserAction.run(this.remoteExplorerService.tunnelModel, this.openerService, address);
          break;
        }
        case OnPortForward.OpenPreview: {
          const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
          await OpenPortInPreviewAction.run(this.remoteExplorerService.tunnelModel, this.openerService, this.externalOpenerService, address);
          break;
        }
        case OnPortForward.Silent:
          break;
        default: {
          const elapsed = (/* @__PURE__ */ new Date()).getTime() - this.lastNotifyTime.getTime();
          this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) time elapsed since last notification ${elapsed} ms`);
          if (elapsed > _OnAutoForwardedAction.NOTIFY_COOL_DOWN) {
            await this.showNotification(tunnel);
          }
        }
      }
    }
  }
  hide(removedPorts) {
    if (this.doActionTunnels) {
      this.doActionTunnels = this.doActionTunnels.filter((value) => !removedPorts.includes(value.tunnelRemotePort));
    }
    if (this.lastShownPort && removedPorts.indexOf(this.lastShownPort) >= 0) {
      this.lastNotification?.close();
    }
  }
  async portNumberHeuristicDelay() {
    this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Starting heuristic delay`);
    if (!this.doActionTunnels || this.doActionTunnels.length === 0) {
      return;
    }
    this.doActionTunnels = this.doActionTunnels.sort((a, b) => a.tunnelRemotePort - b.tunnelRemotePort);
    const firstTunnel = this.doActionTunnels.shift();
    if (firstTunnel.tunnelRemotePort % 1e3 === 0) {
      this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose tunnel because % 1000: ${firstTunnel.tunnelRemotePort}`);
      this.newerTunnel = firstTunnel;
      return firstTunnel;
    } else if (firstTunnel.tunnelRemotePort < 1e4 && firstTunnel.tunnelRemotePort !== 9229) {
      this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Heuristic chose tunnel because < 10000: ${firstTunnel.tunnelRemotePort}`);
      this.newerTunnel = firstTunnel;
      return firstTunnel;
    }
    this.logService.trace(`ForwardedPorts: (OnAutoForwardedAction) Waiting for "better" tunnel than ${firstTunnel.tunnelRemotePort}`);
    this.newerTunnel = void 0;
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.newerTunnel) {
          resolve(void 0);
        } else if (this.doActionTunnels?.includes(firstTunnel)) {
          resolve(firstTunnel);
        } else {
          resolve(void 0);
        }
      }, 3e3);
    });
  }
  async basicMessage(tunnel) {
    const properties = await this.remoteExplorerService.tunnelModel.getAttributes([{ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }], false);
    const label = properties?.get(tunnel.tunnelRemotePort)?.label;
    return nls.localize(
      "remote.tunnelsView.automaticForward",
      "Your application{0} running on port {1} is available.  ",
      label ? ` (${label})` : "",
      tunnel.tunnelRemotePort
    );
  }
  linkMessage() {
    return nls.localize(
      { key: "remote.tunnelsView.notificationLink2", comment: ["[See all forwarded ports]({0}) is a link. Only translate `See all forwarded ports`. Do not change brackets and parentheses or {0}"] },
      "[See all forwarded ports]({0})",
      `command:${TunnelPanel.ID}.focus`
    );
  }
  async showNotification(tunnel) {
    if (!await this.hostService.hadLastFocus()) {
      return;
    }
    this.lastNotification?.close();
    let message = await this.basicMessage(tunnel);
    const choices = [this.openBrowserChoice(tunnel)];
    if (!isWeb || openPreviewEnabledContext.getValue(this.contextKeyService)) {
      choices.push(this.openPreviewChoice(tunnel));
    }
    if (tunnel.tunnelLocalPort !== tunnel.tunnelRemotePort && this.tunnelService.canElevate && this.tunnelService.isPortPrivileged(tunnel.tunnelRemotePort)) {
      message += nls.localize("remote.tunnelsView.elevationMessage", "You'll need to run as superuser to use port {0} locally.  ", tunnel.tunnelRemotePort);
      choices.unshift(this.elevateChoice(tunnel));
    }
    if (tunnel.privacy === TunnelPrivacyId.Private && isWeb && this.tunnelService.canChangePrivacy) {
      choices.push(this.makePublicChoice(tunnel));
    }
    message += this.linkMessage();
    this.lastNotification = this.notificationService.prompt(Severity.Info, message, choices, { neverShowAgain: { id: "remote.tunnelsView.autoForwardNeverShow", isSecondary: true } });
    this.lastShownPort = tunnel.tunnelRemotePort;
    this.lastNotifyTime = /* @__PURE__ */ new Date();
    this.notificationDisposable.value = this.lastNotification.onDidClose(() => {
      this.lastNotification = void 0;
      this.lastShownPort = void 0;
    });
  }
  makePublicChoice(tunnel) {
    return {
      label: nls.localize("remote.tunnelsView.makePublic", "Make Public"),
      run: async () => {
        const oldTunnelDetails = mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.forwarded, tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
        await this.remoteExplorerService.close({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, TunnelCloseReason.Other);
        return this.remoteExplorerService.forward({
          remote: { host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort },
          local: tunnel.tunnelLocalPort,
          name: oldTunnelDetails?.name,
          elevateIfNeeded: true,
          privacy: TunnelPrivacyId.Public,
          source: oldTunnelDetails?.source
        });
      }
    };
  }
  openBrowserChoice(tunnel) {
    const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
    return {
      label: OpenPortInBrowserAction.LABEL,
      run: () => OpenPortInBrowserAction.run(this.remoteExplorerService.tunnelModel, this.openerService, address)
    };
  }
  openPreviewChoice(tunnel) {
    const address = makeAddress(tunnel.tunnelRemoteHost, tunnel.tunnelRemotePort);
    return {
      label: OpenPortInPreviewAction.LABEL,
      run: () => OpenPortInPreviewAction.run(this.remoteExplorerService.tunnelModel, this.openerService, this.externalOpenerService, address)
    };
  }
  elevateChoice(tunnel) {
    return {
      // Privileged ports are not on Windows, so it's ok to stick to just "sudo".
      label: nls.localize("remote.tunnelsView.elevationButton", "Use Port {0} as Sudo...", tunnel.tunnelRemotePort),
      run: async () => {
        await this.remoteExplorerService.close({ host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort }, TunnelCloseReason.Other);
        const newTunnel = await this.remoteExplorerService.forward({
          remote: { host: tunnel.tunnelRemoteHost, port: tunnel.tunnelRemotePort },
          local: tunnel.tunnelRemotePort,
          elevateIfNeeded: true,
          source: AutoTunnelSource
        });
        if (!newTunnel || typeof newTunnel === "string") {
          return;
        }
        this.lastNotification?.close();
        this.lastShownPort = newTunnel.tunnelRemotePort;
        this.lastNotification = this.notificationService.prompt(
          Severity.Info,
          await this.basicMessage(newTunnel) + this.linkMessage(),
          [this.openBrowserChoice(newTunnel), this.openPreviewChoice(tunnel)],
          { neverShowAgain: { id: "remote.tunnelsView.autoForwardNeverShow", isSecondary: true } }
        );
        this.notificationDisposable.value = this.lastNotification.onDidClose(() => {
          this.lastNotification = void 0;
          this.lastShownPort = void 0;
        });
      }
    };
  }
};
_OnAutoForwardedAction.NOTIFY_COOL_DOWN = 5e3;
let OnAutoForwardedAction = _OnAutoForwardedAction;
class OutputAutomaticPortForwarding extends Disposable {
  constructor(terminalService, notificationService, openerService, externalOpenerService, remoteExplorerService, configurationService, debugService, tunnelService, hostService, logService, contextKeyService, privilegedOnly) {
    super();
    this.terminalService = terminalService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.externalOpenerService = externalOpenerService;
    this.remoteExplorerService = remoteExplorerService;
    this.configurationService = configurationService;
    this.debugService = debugService;
    this.tunnelService = tunnelService;
    this.hostService = hostService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.privilegedOnly = privilegedOnly;
    this.notifier = new OnAutoForwardedAction(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(PORT_AUTO_FORWARD_SETTING)) {
        this.tryStartStopUrlFinder();
      }
    }));
    this.portsFeatures = this._register(this.remoteExplorerService.onEnabledPortsFeatures(() => {
      this.tryStartStopUrlFinder();
    }));
    this.tryStartStopUrlFinder();
    if (configurationService.getValue(PORT_AUTO_SOURCE_SETTING) === PORT_AUTO_SOURCE_SETTING_HYBRID) {
      this._register(this.tunnelService.onTunnelClosed((tunnel) => this.notifier.hide([tunnel.port])));
    }
  }
  tryStartStopUrlFinder() {
    if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
      this.startUrlFinder();
    } else {
      this.stopUrlFinder();
    }
  }
  startUrlFinder() {
    if (!this.urlFinder && this.remoteExplorerService.portsFeaturesEnabled !== PortsEnablement.AdditionalFeatures) {
      return;
    }
    this.portsFeatures?.dispose();
    this.urlFinder = this._register(new UrlFinder(this.terminalService, this.debugService));
    this._register(this.urlFinder.onDidMatchLocalUrl(async (localUrl) => {
      if (mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.detected, localUrl.host, localUrl.port)) {
        return;
      }
      const attributes = (await this.remoteExplorerService.tunnelModel.getAttributes([localUrl]))?.get(localUrl.port);
      if (attributes?.onAutoForward === OnPortForward.Ignore) {
        return;
      }
      if (this.privilegedOnly() && !this.tunnelService.isPortPrivileged(localUrl.port)) {
        return;
      }
      const forwarded = await this.remoteExplorerService.forward({ remote: localUrl, source: AutoTunnelSource }, attributes ?? null);
      if (forwarded && typeof forwarded !== "string") {
        this.notifier.doAction([forwarded]);
      }
    }));
  }
  stopUrlFinder() {
    if (this.urlFinder) {
      this.urlFinder.dispose();
      this.urlFinder = void 0;
    }
  }
}
class ProcAutomaticPortForwarding extends Disposable {
  constructor(unforwardOnly, alreadyAutoForwarded, needsInitialCandidates, configurationService, remoteExplorerService, notificationService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService) {
    super();
    this.unforwardOnly = unforwardOnly;
    this.alreadyAutoForwarded = alreadyAutoForwarded;
    this.needsInitialCandidates = needsInitialCandidates;
    this.configurationService = configurationService;
    this.remoteExplorerService = remoteExplorerService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.externalOpenerService = externalOpenerService;
    this.tunnelService = tunnelService;
    this.hostService = hostService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.autoForwarded = /* @__PURE__ */ new Set();
    this.notifiedOnly = /* @__PURE__ */ new Set();
    this.initialCandidates = /* @__PURE__ */ new Set();
    this.notifier = new OnAutoForwardedAction(notificationService, remoteExplorerService, openerService, externalOpenerService, tunnelService, hostService, logService, contextKeyService);
    alreadyAutoForwarded?.forEach((port) => this.autoForwarded.add(port));
    this.initialize();
  }
  get forwarded() {
    return this.autoForwarded;
  }
  async initialize() {
    if (!this.remoteExplorerService.tunnelModel.environmentTunnelsSet) {
      await new Promise((resolve) => this.remoteExplorerService.tunnelModel.onEnvironmentTunnelsSet(() => resolve()));
    }
    this._register(this.configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(PORT_AUTO_FORWARD_SETTING)) {
        await this.startStopCandidateListener();
      }
    }));
    this.portsFeatures = this._register(this.remoteExplorerService.onEnabledPortsFeatures(async () => {
      await this.startStopCandidateListener();
    }));
    this.startStopCandidateListener();
  }
  async startStopCandidateListener() {
    if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
      await this.startCandidateListener();
    } else {
      this.stopCandidateListener();
    }
  }
  stopCandidateListener() {
    if (this.candidateListener) {
      this.candidateListener.dispose();
      this.candidateListener = void 0;
    }
  }
  async startCandidateListener() {
    if (this.candidateListener || this.remoteExplorerService.portsFeaturesEnabled !== PortsEnablement.AdditionalFeatures) {
      return;
    }
    this.portsFeatures?.dispose();
    await this.setInitialCandidates();
    if (this.configurationService.getValue(PORT_AUTO_FORWARD_SETTING)) {
      this.candidateListener = this._register(this.remoteExplorerService.tunnelModel.onCandidatesChanged(this.handleCandidateUpdate, this));
    }
  }
  async setInitialCandidates() {
    if (!this.needsInitialCandidates) {
      this.logService.debug(`ForwardedPorts: (ProcForwarding) Not setting initial candidates`);
      return;
    }
    let startingCandidates = this.remoteExplorerService.tunnelModel.candidatesOrUndefined;
    if (!startingCandidates) {
      await new Promise((resolve) => this.remoteExplorerService.tunnelModel.onCandidatesChanged(() => resolve()));
      startingCandidates = this.remoteExplorerService.tunnelModel.candidates;
    }
    for (const value of startingCandidates) {
      this.initialCandidates.add(makeAddress(value.host, value.port));
    }
    this.logService.debug(`ForwardedPorts: (ProcForwarding) Initial candidates set to ${startingCandidates.map((candidate) => candidate.port).join(", ")}`);
  }
  async forwardCandidates() {
    let attributes;
    const allTunnels = [];
    this.logService.trace(`ForwardedPorts: (ProcForwarding) Attempting to forward ${this.remoteExplorerService.tunnelModel.candidates.length} candidates`);
    for (const value of this.remoteExplorerService.tunnelModel.candidates) {
      if (!value.detail) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} missing detail`);
        continue;
      }
      if (isCandidateRemappedTunnelLocalEndpoint(value, this.remoteExplorerService.tunnelModel.forwarded.values())) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} is the local port of a forwarded tunnel`);
        continue;
      }
      if (!attributes) {
        attributes = await this.remoteExplorerService.tunnelModel.getAttributes(this.remoteExplorerService.tunnelModel.candidates);
      }
      const portAttributes = attributes?.get(value.port);
      const address = makeAddress(value.host, value.port);
      if (this.initialCandidates.has(address) && portAttributes?.onAutoForward === void 0) {
        continue;
      }
      if (this.notifiedOnly.has(address) || this.autoForwarded.has(address)) {
        continue;
      }
      const alreadyForwarded = mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.forwarded, value.host, value.port);
      if (mapHasAddressLocalhostOrAllInterfaces(this.remoteExplorerService.tunnelModel.detected, value.host, value.port)) {
        continue;
      }
      if (portAttributes?.onAutoForward === OnPortForward.Ignore) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} is ignored`);
        continue;
      }
      const forwarded = await this.remoteExplorerService.forward({ remote: value, source: AutoTunnelSource }, portAttributes ?? null);
      if (!alreadyForwarded && forwarded) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} has been forwarded`);
        this.autoForwarded.add(address);
      } else if (forwarded) {
        this.logService.trace(`ForwardedPorts: (ProcForwarding) Port ${value.port} has been notified`);
        this.notifiedOnly.add(address);
      }
      if (forwarded && typeof forwarded !== "string") {
        allTunnels.push(forwarded);
      }
    }
    this.logService.trace(`ForwardedPorts: (ProcForwarding) Forwarded ${allTunnels.length} candidates`);
    if (allTunnels.length === 0) {
      return void 0;
    }
    return allTunnels;
  }
  async handleCandidateUpdate(removed) {
    const removedPorts = [];
    let autoForwarded;
    if (this.unforwardOnly) {
      autoForwarded = /* @__PURE__ */ new Map();
      for (const entry of this.remoteExplorerService.tunnelModel.forwarded.entries()) {
        if (entry[1].source.source === TunnelSource.Auto) {
          autoForwarded.set(entry[0], entry[1]);
        }
      }
    } else {
      autoForwarded = new Map(this.autoForwarded.entries());
    }
    for (const removedPort of removed) {
      const key = removedPort[0];
      let value = removedPort[1];
      const forwardedValue = mapHasAddressLocalhostOrAllInterfaces(autoForwarded, value.host, value.port);
      if (forwardedValue) {
        if (typeof forwardedValue === "string") {
          this.autoForwarded.delete(key);
        } else {
          value = { host: forwardedValue.remoteHost, port: forwardedValue.remotePort };
        }
        await this.remoteExplorerService.close(value, TunnelCloseReason.AutoForwardEnd);
        removedPorts.push(value.port);
      } else if (this.notifiedOnly.delete(key)) {
        removedPorts.push(value.port);
      } else {
        this.initialCandidates.delete(key);
      }
    }
    if (this.unforwardOnly) {
      return;
    }
    if (removedPorts.length > 0) {
      await this.notifier.hide(removedPorts);
    }
    const tunnels = await this.forwardCandidates();
    if (tunnels) {
      await this.notifier.doAction(tunnels);
    }
  }
}
export {
  AutomaticPortForwarding,
  ForwardedPortsView,
  PortRestore,
  TOGGLE_VIEW_ACTION_ID,
  VIEWLET_ID,
  isCandidateRemappedTunnelLocalEndpoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVxcYnJvd3NlclxccmVtb3RlRXhwbG9yZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBJVmlld3NSZWdpc3RyeSwgVmlld0NvbnRhaW5lciwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsIFBPUlRfQVVUT19GQUxMQkFDS19TRVRUSU5HLCBQT1JUX0FVVE9fRk9SV0FSRF9TRVRUSU5HLCBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkcsIFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19IWUJSSUQsIFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19PVVRQVVQsIFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19QUk9DRVNTLCBQb3J0c0VuYWJsZW1lbnQsIFRVTk5FTF9WSUVXX0NPTlRBSU5FUl9JRCwgVFVOTkVMX1ZJRVdfSUQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUV4cGxvcmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBdHRyaWJ1dGVzLCBBdXRvVHVubmVsU291cmNlLCBDYW5kaWRhdGVQb3J0LCBmb3J3YXJkZWRQb3J0c0ZlYXR1cmVzRW5hYmxlZCwgZm9yd2FyZGVkUG9ydHNWaWV3RW5hYmxlZCwgbWFrZUFkZHJlc3MsIG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXMsIE9uUG9ydEZvcndhcmQsIFR1bm5lbCwgVHVubmVsQ2xvc2VSZWFzb24sIFR1bm5lbFNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vdHVubmVsTW9kZWwuanMnO1xuaW1wb3J0IHsgRm9yd2FyZFBvcnRBY3Rpb24sIE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLCBUdW5uZWxQYW5lbCwgVHVubmVsUGFuZWxEZXNjcmlwdG9yLCBUdW5uZWxWaWV3TW9kZWwsIE9wZW5Qb3J0SW5QcmV2aWV3QWN0aW9uLCBvcGVuUHJldmlld0VuYWJsZWRDb250ZXh0IH0gZnJvbSAnLi90dW5uZWxWaWV3LmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhckVudHJ5LCBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhclNlcnZpY2UsIFN0YXR1c2JhckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBVcmxGaW5kZXIgfSBmcm9tICcuL3VybEZpbmRlci5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uSGFuZGxlLCBJTm90aWZpY2F0aW9uU2VydmljZSwgSVByb21wdENob2ljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uL2RlYnVnL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNXZWIsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzQWxsSW50ZXJmYWNlcywgaXNMb2NhbGhvc3QsIElUdW5uZWxTZXJ2aWNlLCBSZW1vdGVUdW5uZWwsIFR1bm5lbFByaXZhY3lJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9jb21tb24vdHVubmVsLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lQ29udGFpbmVyLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIE51bWJlckJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IHBvcnRzVmlld0ljb24gfSBmcm9tICcuL3JlbW90ZUljb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUV4dGVybmFsVXJpT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVybmFsVXJpT3BlbmVyL2NvbW1vbi9leHRlcm5hbFVyaU9wZW5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50RW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50RW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcblxuZXhwb3J0IGNvbnN0IFZJRVdMRVRfSUQgPSAnd29ya2JlbmNoLnZpZXcucmVtb3RlJztcbmV4cG9ydCBjb25zdCBUT0dHTEVfVklFV19BQ1RJT05fSUQgPSAncmVtb3RlRXhwbG9yZXIudG9nZ2xlRm9yd2FyZGVkUG9ydHNWaWV3JztcblxuLyoqXG4gKiBDaGVja3MgaWYgYSBwcm9jZXNzIGNhbmRpZGF0ZSBpcyB0aGUgcmVtYXBwZWQgbG9jYWwgZW5kcG9pbnQgb2YgYW4gZXhpc3RpbmcgdHVubmVsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNDYW5kaWRhdGVSZW1hcHBlZFR1bm5lbExvY2FsRW5kcG9pbnQoY2FuZGlkYXRlOiBDYW5kaWRhdGVQb3J0LCB0dW5uZWxzOiBJdGVyYWJsZTxQaWNrPFR1bm5lbCwgJ2xvY2FsUG9ydCcgfCAncmVtb3RlUG9ydCc+Pik6IGJvb2xlYW4ge1xuXHRpZiAoIWlzTG9jYWxob3N0KGNhbmRpZGF0ZS5ob3N0KSAmJiAhaXNBbGxJbnRlcmZhY2VzKGNhbmRpZGF0ZS5ob3N0KSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRmb3IgKGNvbnN0IHR1bm5lbCBvZiB0dW5uZWxzKSB7XG5cdFx0aWYgKHR1bm5lbC5sb2NhbFBvcnQgPT09IGNhbmRpZGF0ZS5wb3J0ICYmIHR1bm5lbC5yZW1vdGVQb3J0ICE9PSBjYW5kaWRhdGUucG9ydCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGNsYXNzIEZvcndhcmRlZFBvcnRzVmlldyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5TGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5QmFkZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIGVudHJ5QWNjZXNzb3I6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhhc1BvcnRzSW5TZXNzaW9uOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElSZW1vdGVFeHBsb3JlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElUdW5uZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHVubmVsU2VydmljZTogSVR1bm5lbFNlcnZpY2UsXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoVFVOTkVMX1ZJRVdfSUQsIHtcblx0XHRcdGNvbnRlbnQ6IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSA/IG5scy5sb2NhbGl6ZSgncmVtb3RlTm9Qb3J0cycsIFwiTm8gZm9yd2FyZGVkIHBvcnRzLiBGb3J3YXJkIGEgcG9ydCB0byBhY2Nlc3MgeW91ciBydW5uaW5nIHNlcnZpY2VzIGxvY2FsbHkuXFxuW0ZvcndhcmQgYSBQb3J0XSh7MH0pXCIsIGBjb21tYW5kOiR7Rm9yd2FyZFBvcnRBY3Rpb24uSU5MSU5FX0lEfWApXG5cdFx0XHRcdDogbmxzLmxvY2FsaXplKCdub1JlbW90ZU5vUG9ydHMnLCBcIk5vIGZvcndhcmRlZCBwb3J0cy4gRm9yd2FyZCBhIHBvcnQgdG8gYWNjZXNzIHlvdXIgbG9jYWxseSBydW5uaW5nIHNlcnZpY2VzIG92ZXIgdGhlIGludGVybmV0LlxcbltGb3J3YXJkIGEgUG9ydF0oezB9KVwiLCBgY29tbWFuZDoke0ZvcndhcmRQb3J0QWN0aW9uLklOTElORV9JRH1gKSxcblx0XHR9KSk7XG5cdFx0dGhpcy5lbmFibGVCYWRnZUFuZFN0YXR1c0JhcigpO1xuXHRcdHRoaXMuZW5hYmxlRm9yd2FyZGVkUG9ydHNGZWF0dXJlcygpO1xuXHRcdGlmICghdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKHRoaXMudHVubmVsU2VydmljZS5vblR1bm5lbE9wZW5lZCkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmhhc1BvcnRzSW5TZXNzaW9uID0gdHJ1ZTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFZpZXdDb250YWluZXIoKTogUHJvbWlzZTxWaWV3Q29udGFpbmVyIHwgbnVsbD4ge1xuXHRcdHJldHVybiBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3Q29udGFpbmVyc1JlZ2lzdHJ5KS5yZWdpc3RlclZpZXdDb250YWluZXIoe1xuXHRcdFx0aWQ6IFRVTk5FTF9WSUVXX0NPTlRBSU5FUl9JRCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdwb3J0cycsIFwiUG9ydHNcIiksXG5cdFx0XHRpY29uOiBwb3J0c1ZpZXdJY29uLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihWaWV3UGFuZUNvbnRhaW5lciwgW1RVTk5FTF9WSUVXX0NPTlRBSU5FUl9JRCwgeyBtZXJnZVZpZXdXaXRoQ29udGFpbmVyV2hlblNpbmdsZVZpZXc6IHRydWUgfV0pLFxuXHRcdFx0c3RvcmFnZUlkOiBUVU5ORUxfVklFV19DT05UQUlORVJfSUQsXG5cdFx0XHRoaWRlSWZFbXB0eTogdHJ1ZSxcblx0XHRcdG9yZGVyOiA1XG5cdFx0fSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZW5hYmxlRm9yd2FyZGVkUG9ydHNGZWF0dXJlcygpIHtcblx0XHR0aGlzLmNvbnRleHRLZXlMaXN0ZW5lci5jbGVhcigpO1xuXG5cdFx0Y29uc3QgZmVhdHVyZXNFbmFibGVkOiBib29sZWFuID0gISFmb3J3YXJkZWRQb3J0c0ZlYXR1cmVzRW5hYmxlZC5nZXRWYWx1ZSh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCB2aWV3RW5hYmxlZDogYm9vbGVhbiA9ICEhZm9yd2FyZGVkUG9ydHNWaWV3RW5hYmxlZC5nZXRWYWx1ZSh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGlmIChmZWF0dXJlc0VuYWJsZWQgfHwgdmlld0VuYWJsZWQpIHtcblx0XHRcdC8vIEFsc28gZW5hYmxlIHRoZSB2aWV3IGlmIGl0IGlzbid0IGFscmVhZHkuXG5cdFx0XHRpZiAoIXZpZXdFbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KGZvcndhcmRlZFBvcnRzVmlld0VuYWJsZWQua2V5LCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSBhd2FpdCB0aGlzLmdldFZpZXdDb250YWluZXIoKTtcblx0XHRcdGNvbnN0IHR1bm5lbFBhbmVsRGVzY3JpcHRvciA9IG5ldyBUdW5uZWxQYW5lbERlc2NyaXB0b3IobmV3IFR1bm5lbFZpZXdNb2RlbCh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSwgdGhpcy50dW5uZWxTZXJ2aWNlKSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdFx0dGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuZW5hYmxlUG9ydHNGZWF0dXJlcyghZmVhdHVyZXNFbmFibGVkKTtcblx0XHRcdFx0dmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt0dW5uZWxQYW5lbERlc2NyaXB0b3JdLCB2aWV3Q29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb250ZXh0S2V5TGlzdGVuZXIudmFsdWUgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUobmV3IFNldChbLi4uZm9yd2FyZGVkUG9ydHNGZWF0dXJlc0VuYWJsZWQua2V5cygpLCAuLi5mb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkLmtleXMoKV0pKSkge1xuXHRcdFx0XHRcdHRoaXMuZW5hYmxlRm9yd2FyZGVkUG9ydHNGZWF0dXJlcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVuYWJsZUJhZGdlQW5kU3RhdHVzQmFyKCkge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KS5vblZpZXdzUmVnaXN0ZXJlZChlID0+IHtcblx0XHRcdGlmIChlLmZpbmQodmlldyA9PiB2aWV3LnZpZXdzLmZpbmQodmlld0Rlc2NyaXB0b3IgPT4gdmlld0Rlc2NyaXB0b3IuaWQgPT09IFRVTk5FTF9WSUVXX0lEKSkpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwub25Gb3J3YXJkUG9ydCwgKF9sYXN0LCBlKSA9PiBlLCA1MCkoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQWN0aXZpdHlCYWRnZSgpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzQmFyKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwub25DbG9zZVBvcnQsIChfbGFzdCwgZSkgPT4gZSwgNTApKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUFjdGl2aXR5QmFkZ2UoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1c0JhcigpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0dGhpcy51cGRhdGVBY3Rpdml0eUJhZGdlKCk7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzQmFyKCk7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVBY3Rpdml0eUJhZGdlKCkge1xuXHRcdGlmICh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQuc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMuYWN0aXZpdHlCYWRnZS52YWx1ZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dWaWV3QWN0aXZpdHkoVFVOTkVMX1ZJRVdfSUQsIHtcblx0XHRcdFx0YmFkZ2U6IG5ldyBOdW1iZXJCYWRnZSh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQuc2l6ZSwgbiA9PiBuID09PSAxID8gbmxzLmxvY2FsaXplKCcxZm9yd2FyZGVkUG9ydCcsIFwiMSBmb3J3YXJkZWQgcG9ydFwiKSA6IG5scy5sb2NhbGl6ZSgnbkZvcndhcmRlZFBvcnRzJywgXCJ7MH0gZm9yd2FyZGVkIHBvcnRzXCIsIG4pKVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWN0aXZpdHlCYWRnZS5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3RhdHVzQmFyKCkge1xuXHRcdGlmICghdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ICYmICF0aGlzLmhhc1BvcnRzSW5TZXNzaW9uKSB7XG5cdFx0XHQvLyBXZSBvbmx5IHdhbnQgdG8gc2hvdyB0aGUgcG9ydHMgc3RhdHVzIGJhciBlbnRyeSB3aGVuIHRoZSB1c2VyIGhhcyB0YWtlbiBhbiBhY3Rpb24gdGhhdCBpbmRpY2F0ZXMgdGhhdCB0aGV5IG1pZ2h0IGNhcmUgYWJvdXQgaXQuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLmVudHJ5QWNjZXNzb3IpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZW50cnlBY2Nlc3NvciA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeSh0aGlzLmVudHJ5LCAnc3RhdHVzLmZvcndhcmRlZFBvcnRzJywgU3RhdHVzYmFyQWxpZ25tZW50LkxFRlQsIDQwKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZW50cnlBY2Nlc3Nvci51cGRhdGUodGhpcy5lbnRyeSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZW50cnkoKTogSVN0YXR1c2JhckVudHJ5IHtcblx0XHRsZXQgdG9vbHRpcDogc3RyaW5nO1xuXHRcdGNvbnN0IGNvdW50ID0gdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLnNpemUgKyB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5kZXRlY3RlZC5zaXplO1xuXHRcdGNvbnN0IHRleHQgPSBgJHtjb3VudH1gO1xuXHRcdGlmIChjb3VudCA9PT0gMCkge1xuXHRcdFx0dG9vbHRpcCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLmZvcndhcmRlZFBvcnRzLnN0YXR1c2JhclRleHROb25lJywgXCJObyBQb3J0cyBGb3J3YXJkZWRcIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGFsbFR1bm5lbHMgPSBBcnJheS5mcm9tKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZC52YWx1ZXMoKSk7XG5cdFx0XHRhbGxUdW5uZWxzLnB1c2goLi4uQXJyYXkuZnJvbSh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5kZXRlY3RlZC52YWx1ZXMoKSkpO1xuXHRcdFx0dG9vbHRpcCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLmZvcndhcmRlZFBvcnRzLnN0YXR1c2JhclRvb2x0aXAnLCBcIkZvcndhcmRlZCBQb3J0czogezB9XCIsXG5cdFx0XHRcdGFsbFR1bm5lbHMubWFwKGZvcndhcmRlZCA9PiBmb3J3YXJkZWQucmVtb3RlUG9ydCkuam9pbignLCAnKSk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUoJ3N0YXR1cy5mb3J3YXJkZWRQb3J0cycsIFwiRm9yd2FyZGVkIFBvcnRzXCIpLFxuXHRcdFx0dGV4dDogYCQocmFkaW8tdG93ZXIpICR7dGV4dH1gLFxuXHRcdFx0YXJpYUxhYmVsOiB0b29sdGlwLFxuXHRcdFx0dG9vbHRpcCxcblx0XHRcdGNvbW1hbmQ6IFRPR0dMRV9WSUVXX0FDVElPTl9JRFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFBvcnRSZXN0b3JlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdGlmICghdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZW52aXJvbm1lbnRUdW5uZWxzU2V0KSB7XG5cdFx0XHRFdmVudC5vbmNlKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLm9uRW52aXJvbm1lbnRUdW5uZWxzU2V0KShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVzdG9yZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVzdG9yZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzdG9yZSgpIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0ZvcndhcmRlZFBvcnRzOiBEb2luZyBmaXJzdCByZXN0b3JlLicpO1xuXHRcdHJldHVybiB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5yZXN0b3JlKCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgQXV0b21hdGljUG9ydEZvcndhcmRpbmcgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHByaXZhdGUgcHJvY0ZvcndhcmRlcjogUHJvY0F1dG9tYXRpY1BvcnRGb3J3YXJkaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG91dHB1dEZvcndhcmRlcjogT3V0cHV0QXV0b21hdGljUG9ydEZvcndhcmRpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcG9ydExpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUV4dGVybmFsVXJpT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVybmFsT3BlbmVyU2VydmljZTogSUV4dGVybmFsVXJpT3BlbmVyU2VydmljZSxcblx0XHRASVJlbW90ZUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJVHVubmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGlmICghZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLndoZW5SZW1vdGVDb25maWd1cmF0aW9uTG9hZGVkKCkudGhlbigoKSA9PiByZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKSkudGhlbihlbnZpcm9ubWVudCA9PiB7XG5cdFx0XHR0aGlzLnNldHVwKGVudmlyb25tZW50KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HKSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0dXAoZW52aXJvbm1lbnQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUE9SVF9BVVRPX0ZBTExCQUNLX1NFVFRJTkcpICYmICF0aGlzLnBvcnRMaXN0ZW5lcikge1xuXHRcdFx0XHRcdHRoaXMubGlzdGVuRm9yUG9ydHMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0aWYgKCF0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ3Byb2Nlc3NQb3J0Rm9yd2FyZGluZ0ZhbGxiYWNrJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdHJ1ZSkpIHtcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoUE9SVF9BVVRPX0ZBTExCQUNLX1NFVFRJTkcsIDAsIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFBvcnRBdXRvRmFsbGJhY2tOdW1iZXIoKTogbnVtYmVyIHtcblx0XHRjb25zdCBmYWxsYmFja0F0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PG51bWJlcj4oUE9SVF9BVVRPX0ZBTExCQUNLX1NFVFRJTkcpO1xuXHRcdGlmICgoZmFsbGJhY2tBdC52YWx1ZSAhPT0gdW5kZWZpbmVkKSAmJiAoZmFsbGJhY2tBdC52YWx1ZSA9PT0gMCB8fCAoZmFsbGJhY2tBdC52YWx1ZSAhPT0gZmFsbGJhY2tBdC5kZWZhdWx0VmFsdWUpKSkge1xuXHRcdFx0cmV0dXJuIGZhbGxiYWNrQXQudmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGluc3BlY3RTb3VyY2UgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HKTtcblx0XHRpZiAoaW5zcGVjdFNvdXJjZS5hcHBsaWNhdGlvblZhbHVlID09PSBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfUFJPQ0VTUyB8fFxuXHRcdFx0aW5zcGVjdFNvdXJjZS51c2VyVmFsdWUgPT09IFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19QUk9DRVNTIHx8XG5cdFx0XHRpbnNwZWN0U291cmNlLnVzZXJMb2NhbFZhbHVlID09PSBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfUFJPQ0VTUyB8fFxuXHRcdFx0aW5zcGVjdFNvdXJjZS51c2VyUmVtb3RlVmFsdWUgPT09IFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19QUk9DRVNTIHx8XG5cdFx0XHRpbnNwZWN0U291cmNlLndvcmtzcGFjZUZvbGRlclZhbHVlID09PSBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfUFJPQ0VTUyB8fFxuXHRcdFx0aW5zcGVjdFNvdXJjZS53b3Jrc3BhY2VWYWx1ZSA9PT0gUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HX1BST0NFU1MpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsbGJhY2tBdC52YWx1ZSA/PyAyMDtcblx0fVxuXG5cdHByaXZhdGUgbGlzdGVuRm9yUG9ydHMoKSB7XG5cdFx0bGV0IGZhbGxiYWNrQXQgPSB0aGlzLmdldFBvcnRBdXRvRmFsbGJhY2tOdW1iZXIoKTtcblx0XHRpZiAoZmFsbGJhY2tBdCA9PT0gMCkge1xuXHRcdFx0dGhpcy5wb3J0TGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5wcm9jRm9yd2FyZGVyICYmICF0aGlzLnBvcnRMaXN0ZW5lciAmJiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkcpID09PSBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfUFJPQ0VTUykpIHtcblx0XHRcdHRoaXMucG9ydExpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwub25Gb3J3YXJkUG9ydChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGZhbGxiYWNrQXQgPSB0aGlzLmdldFBvcnRBdXRvRmFsbGJhY2tOdW1iZXIoKTtcblx0XHRcdFx0aWYgKGZhbGxiYWNrQXQgPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLnBvcnRMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoQXJyYXkuZnJvbSh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQudmFsdWVzKCkpLmZpbHRlcih0dW5uZWwgPT4gdHVubmVsLnNvdXJjZS5zb3VyY2UgPT09IFR1bm5lbFNvdXJjZS5BdXRvKS5sZW5ndGggPiBmYWxsYmFja0F0KSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkcsIFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19IWUJSSUQpO1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZS5mYWxsYmFjaycsIFwiT3ZlciAyMCBwb3J0cyBoYXZlIGJlZW4gYXV0b21hdGljYWxseSBmb3J3YXJkZWQuIFRoZSBgcHJvY2Vzc2AgYmFzZWQgYXV0b21hdGljIHBvcnQgZm9yd2FyZGluZyBoYXMgYmVlbiBzd2l0Y2hlZCB0byBgaHlicmlkYCBpbiBzZXR0aW5ncy4gU29tZSBwb3J0cyBtYXkgbm8gbG9uZ2VyIGJlIGRldGVjdGVkLlwiKSxcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRwcmltYXJ5OiBbXG5cdFx0XHRcdFx0XHRcdFx0dG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6ICdzd2l0Y2hCYWNrJyxcblx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlLmZhbGxiYWNrLnN3aXRjaEJhY2snLCBcIlVuZG9cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkcsIFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19QUk9DRVNTKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShQT1JUX0FVVE9fRkFMTEJBQ0tfU0VUVElORywgMCwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnBvcnRMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLnBvcnRMaXN0ZW5lciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZDogJ3Nob3dQb3J0U291cmNlU2V0dGluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZS5mYWxsYmFjay5zaG93UG9ydFNvdXJjZVNldHRpbmcnLCBcIlNob3cgU2V0dGluZ1wiKSxcblx0XHRcdFx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3Moe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHF1ZXJ5OiAncmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHNTb3VyY2UnXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnBvcnRMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5wb3J0TGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblxuXHRwcml2YXRlIHNldHVwKGVudmlyb25tZW50OiBJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCB8IG51bGwpIHtcblx0XHRjb25zdCBhbHJlYWR5Rm9yd2FyZGVkID0gdGhpcy5wcm9jRm9yd2FyZGVyPy5mb3J3YXJkZWQ7XG5cdFx0Y29uc3QgaXNTd2l0Y2ggPSB0aGlzLm91dHB1dEZvcndhcmRlciB8fCB0aGlzLnByb2NGb3J3YXJkZXI7XG5cdFx0dGhpcy5wcm9jRm9yd2FyZGVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5wcm9jRm9yd2FyZGVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMub3V0cHV0Rm9yd2FyZGVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5vdXRwdXRGb3J3YXJkZXIgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGVudmlyb25tZW50Py5vcyAhPT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSB7XG5cdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZz4oUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HKS5kZWZhdWx0Py52YWx1ZSAhPT0gUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HX09VVFBVVCkge1xuXHRcdFx0XHRSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKVxuXHRcdFx0XHRcdC5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhbeyBvdmVycmlkZXM6IHsgJ3JlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlJzogUE9SVF9BVVRPX1NPVVJDRV9TRVRUSU5HX09VVFBVVCB9IH1dKTtcblx0XHRcdH1cblx0XHRcdHRoaXMub3V0cHV0Rm9yd2FyZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE91dHB1dEF1dG9tYXRpY1BvcnRGb3J3YXJkaW5nKHRoaXMudGVybWluYWxTZXJ2aWNlLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UsIHRoaXMub3BlbmVyU2VydmljZSwgdGhpcy5leHRlcm5hbE9wZW5lclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZSwgdGhpcy50dW5uZWxTZXJ2aWNlLCB0aGlzLmhvc3RTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsICgpID0+IGZhbHNlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHVzZVByb2MgPSAoKSA9PiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkcpID09PSBQT1JUX0FVVE9fU09VUkNFX1NFVFRJTkdfUFJPQ0VTUyk7XG5cdFx0XHRpZiAodXNlUHJvYygpKSB7XG5cdFx0XHRcdHRoaXMucHJvY0ZvcndhcmRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9jQXV0b21hdGljUG9ydEZvcndhcmRpbmcoZmFsc2UsIGFscmVhZHlGb3J3YXJkZWQsICFpc1N3aXRjaCwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UsIHRoaXMubm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2UsIHRoaXMuZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlLCB0aGlzLnR1bm5lbFNlcnZpY2UsIHRoaXMuaG9zdFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFBPUlRfQVVUT19TT1VSQ0VfU0VUVElORykgPT09IFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19IWUJSSUQpIHtcblx0XHRcdFx0dGhpcy5wcm9jRm9yd2FyZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFByb2NBdXRvbWF0aWNQb3J0Rm9yd2FyZGluZyh0cnVlLCBhbHJlYWR5Rm9yd2FyZGVkLCAhaXNTd2l0Y2gsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLCB0aGlzLmV4dGVybmFsT3BlbmVyU2VydmljZSwgdGhpcy50dW5uZWxTZXJ2aWNlLCB0aGlzLmhvc3RTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMub3V0cHV0Rm9yd2FyZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE91dHB1dEF1dG9tYXRpY1BvcnRGb3J3YXJkaW5nKHRoaXMudGVybWluYWxTZXJ2aWNlLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UsIHRoaXMub3BlbmVyU2VydmljZSwgdGhpcy5leHRlcm5hbE9wZW5lclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZSwgdGhpcy50dW5uZWxTZXJ2aWNlLCB0aGlzLmhvc3RTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHVzZVByb2MpKTtcblx0XHR9XG5cdFx0dGhpcy5saXN0ZW5Gb3JQb3J0cygpO1xuXHR9XG59XG5cbmNsYXNzIE9uQXV0b0ZvcndhcmRlZEFjdGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIGxhc3ROb3RpZnlUaW1lOiBEYXRlO1xuXHRwcml2YXRlIHN0YXRpYyBOT1RJRllfQ09PTF9ET1dOID0gNTAwMDsgLy8gbWlsbGlzZWNvbmRzXG5cdHByaXZhdGUgbGFzdE5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbkhhbmRsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25EaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIGxhc3RTaG93blBvcnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkb0FjdGlvblR1bm5lbHM6IFJlbW90ZVR1bm5lbFtdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFscmVhZHlPcGVuZWRPbmNlOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlcm5hbE9wZW5lclNlcnZpY2U6IElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0dW5uZWxTZXJ2aWNlOiBJVHVubmVsU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubGFzdE5vdGlmeVRpbWUgPSBuZXcgRGF0ZSgpO1xuXHRcdHRoaXMubGFzdE5vdGlmeVRpbWUuc2V0RnVsbFllYXIodGhpcy5sYXN0Tm90aWZ5VGltZS5nZXRGdWxsWWVhcigpIC0gMSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZG9BY3Rpb24odHVubmVsczogUmVtb3RlVHVubmVsW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoT25BdXRvRm9yd2FyZGVkQWN0aW9uKSBTdGFydGluZyBhY3Rpb24gZm9yICR7dHVubmVsc1swXT8udHVubmVsUmVtb3RlUG9ydH1gKTtcblx0XHR0aGlzLmRvQWN0aW9uVHVubmVscyA9IHR1bm5lbHM7XG5cdFx0Y29uc3QgdHVubmVsID0gYXdhaXQgdGhpcy5wb3J0TnVtYmVySGV1cmlzdGljRGVsYXkoKTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoT25BdXRvRm9yd2FyZGVkQWN0aW9uKSBIZXVyaXN0aWMgY2hvc2UgJHt0dW5uZWw/LnR1bm5lbFJlbW90ZVBvcnR9YCk7XG5cdFx0aWYgKHR1bm5lbCkge1xuXHRcdFx0Y29uc3QgYWxsQXR0cmlidXRlcyA9IGF3YWl0IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmdldEF0dHJpYnV0ZXMoW3sgcG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQsIGhvc3Q6IHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0IH1dKTtcblx0XHRcdGNvbnN0IGF0dHJpYnV0ZXMgPSBhbGxBdHRyaWJ1dGVzPy5nZXQodHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpPy5vbkF1dG9Gb3J3YXJkO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKE9uQXV0b0ZvcndhcmRlZEFjdGlvbikgb25BdXRvRm9yd2FyZCBhY3Rpb24gaXMgJHthdHRyaWJ1dGVzfWApO1xuXHRcdFx0c3dpdGNoIChhdHRyaWJ1dGVzKSB7XG5cdFx0XHRcdGNhc2UgT25Qb3J0Rm9yd2FyZC5PcGVuQnJvd3Nlck9uY2U6IHtcblx0XHRcdFx0XHRpZiAodGhpcy5hbHJlYWR5T3BlbmVkT25jZS5oYXModHVubmVsLmxvY2FsQWRkcmVzcykpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmFscmVhZHlPcGVuZWRPbmNlLmFkZCh0dW5uZWwubG9jYWxBZGRyZXNzKTtcblx0XHRcdFx0XHQvLyBJbnRlbnRpb25hbGx5IGRvIG5vdCBicmVhayBzbyB0aGF0IHRoZSBvcGVuIGJyb3dzZXIgcGF0aCBjYW4gYmUgcnVuLlxuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgT25Qb3J0Rm9yd2FyZC5PcGVuQnJvd3Nlcjoge1xuXHRcdFx0XHRcdGNvbnN0IGFkZHJlc3MgPSBtYWtlQWRkcmVzcyh0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpO1xuXHRcdFx0XHRcdGF3YWl0IE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLnJ1bih0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbCwgdGhpcy5vcGVuZXJTZXJ2aWNlLCBhZGRyZXNzKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIE9uUG9ydEZvcndhcmQuT3BlblByZXZpZXc6IHtcblx0XHRcdFx0XHRjb25zdCBhZGRyZXNzID0gbWFrZUFkZHJlc3ModHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRcdFx0XHRhd2FpdCBPcGVuUG9ydEluUHJldmlld0FjdGlvbi5ydW4odGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwsIHRoaXMub3BlbmVyU2VydmljZSwgdGhpcy5leHRlcm5hbE9wZW5lclNlcnZpY2UsIGFkZHJlc3MpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgT25Qb3J0Rm9yd2FyZC5TaWxlbnQ6IGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0Y29uc3QgZWxhcHNlZCA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gdGhpcy5sYXN0Tm90aWZ5VGltZS5nZXRUaW1lKCk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKE9uQXV0b0ZvcndhcmRlZEFjdGlvbikgdGltZSBlbGFwc2VkIHNpbmNlIGxhc3Qgbm90aWZpY2F0aW9uICR7ZWxhcHNlZH0gbXNgKTtcblx0XHRcdFx0XHRpZiAoZWxhcHNlZCA+IE9uQXV0b0ZvcndhcmRlZEFjdGlvbi5OT1RJRllfQ09PTF9ET1dOKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnNob3dOb3RpZmljYXRpb24odHVubmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGlkZShyZW1vdmVkUG9ydHM6IG51bWJlcltdKSB7XG5cdFx0aWYgKHRoaXMuZG9BY3Rpb25UdW5uZWxzKSB7XG5cdFx0XHR0aGlzLmRvQWN0aW9uVHVubmVscyA9IHRoaXMuZG9BY3Rpb25UdW5uZWxzLmZpbHRlcih2YWx1ZSA9PiAhcmVtb3ZlZFBvcnRzLmluY2x1ZGVzKHZhbHVlLnR1bm5lbFJlbW90ZVBvcnQpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubGFzdFNob3duUG9ydCAmJiByZW1vdmVkUG9ydHMuaW5kZXhPZih0aGlzLmxhc3RTaG93blBvcnQpID49IDApIHtcblx0XHRcdHRoaXMubGFzdE5vdGlmaWNhdGlvbj8uY2xvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG5ld2VyVHVubmVsOiBSZW1vdGVUdW5uZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXN5bmMgcG9ydE51bWJlckhldXJpc3RpY0RlbGF5KCk6IFByb21pc2U8UmVtb3RlVHVubmVsIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKE9uQXV0b0ZvcndhcmRlZEFjdGlvbikgU3RhcnRpbmcgaGV1cmlzdGljIGRlbGF5YCk7XG5cdFx0aWYgKCF0aGlzLmRvQWN0aW9uVHVubmVscyB8fCB0aGlzLmRvQWN0aW9uVHVubmVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5kb0FjdGlvblR1bm5lbHMgPSB0aGlzLmRvQWN0aW9uVHVubmVscy5zb3J0KChhLCBiKSA9PiBhLnR1bm5lbFJlbW90ZVBvcnQgLSBiLnR1bm5lbFJlbW90ZVBvcnQpO1xuXHRcdGNvbnN0IGZpcnN0VHVubmVsID0gdGhpcy5kb0FjdGlvblR1bm5lbHMuc2hpZnQoKSE7XG5cdFx0Ly8gSGV1cmlzdGljLlxuXHRcdGlmIChmaXJzdFR1bm5lbC50dW5uZWxSZW1vdGVQb3J0ICUgMTAwMCA9PT0gMCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKE9uQXV0b0ZvcndhcmRlZEFjdGlvbikgSGV1cmlzdGljIGNob3NlIHR1bm5lbCBiZWNhdXNlICUgMTAwMDogJHtmaXJzdFR1bm5lbC50dW5uZWxSZW1vdGVQb3J0fWApO1xuXHRcdFx0dGhpcy5uZXdlclR1bm5lbCA9IGZpcnN0VHVubmVsO1xuXHRcdFx0cmV0dXJuIGZpcnN0VHVubmVsO1xuXHRcdFx0Ly8gOTIyOSBpcyB0aGUgbm9kZSBpbnNwZWN0IHBvcnRcblx0XHR9IGVsc2UgaWYgKGZpcnN0VHVubmVsLnR1bm5lbFJlbW90ZVBvcnQgPCAxMDAwMCAmJiBmaXJzdFR1bm5lbC50dW5uZWxSZW1vdGVQb3J0ICE9PSA5MjI5KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoT25BdXRvRm9yd2FyZGVkQWN0aW9uKSBIZXVyaXN0aWMgY2hvc2UgdHVubmVsIGJlY2F1c2UgPCAxMDAwMDogJHtmaXJzdFR1bm5lbC50dW5uZWxSZW1vdGVQb3J0fWApO1xuXHRcdFx0dGhpcy5uZXdlclR1bm5lbCA9IGZpcnN0VHVubmVsO1xuXHRcdFx0cmV0dXJuIGZpcnN0VHVubmVsO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChPbkF1dG9Gb3J3YXJkZWRBY3Rpb24pIFdhaXRpbmcgZm9yIFwiYmV0dGVyXCIgdHVubmVsIHRoYW4gJHtmaXJzdFR1bm5lbC50dW5uZWxSZW1vdGVQb3J0fWApO1xuXHRcdHRoaXMubmV3ZXJUdW5uZWwgPSB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLm5ld2VyVHVubmVsKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZG9BY3Rpb25UdW5uZWxzPy5pbmNsdWRlcyhmaXJzdFR1bm5lbCkpIHtcblx0XHRcdFx0XHRyZXNvbHZlKGZpcnN0VHVubmVsKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDMwMDApO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBiYXNpY01lc3NhZ2UodHVubmVsOiBSZW1vdGVUdW5uZWwpIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gYXdhaXQgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZ2V0QXR0cmlidXRlcyhbeyBob3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgcG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQgfV0sIGZhbHNlKTtcblx0XHRjb25zdCBsYWJlbCA9IHByb3BlcnRpZXM/LmdldCh0dW5uZWwudHVubmVsUmVtb3RlUG9ydCk/LmxhYmVsO1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxzVmlldy5hdXRvbWF0aWNGb3J3YXJkJywgXCJZb3VyIGFwcGxpY2F0aW9uezB9IHJ1bm5pbmcgb24gcG9ydCB7MX0gaXMgYXZhaWxhYmxlLiAgXCIsXG5cdFx0XHRsYWJlbCA/IGAgKCR7bGFiZWx9KWAgOiAnJyxcblx0XHRcdHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0fVxuXG5cdHByaXZhdGUgbGlua01lc3NhZ2UoKSB7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZShcblx0XHRcdHsga2V5OiAncmVtb3RlLnR1bm5lbHNWaWV3Lm5vdGlmaWNhdGlvbkxpbmsyJywgY29tbWVudDogWydbU2VlIGFsbCBmb3J3YXJkZWQgcG9ydHNdKHswfSkgaXMgYSBsaW5rLiBPbmx5IHRyYW5zbGF0ZSBgU2VlIGFsbCBmb3J3YXJkZWQgcG9ydHNgLiBEbyBub3QgY2hhbmdlIGJyYWNrZXRzIGFuZCBwYXJlbnRoZXNlcyBvciB7MH0nXSB9LFxuXHRcdFx0XCJbU2VlIGFsbCBmb3J3YXJkZWQgcG9ydHNdKHswfSlcIiwgYGNvbW1hbmQ6JHtUdW5uZWxQYW5lbC5JRH0uZm9jdXNgKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd05vdGlmaWNhdGlvbih0dW5uZWw6IFJlbW90ZVR1bm5lbCkge1xuXHRcdGlmICghYXdhaXQgdGhpcy5ob3N0U2VydmljZS5oYWRMYXN0Rm9jdXMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubGFzdE5vdGlmaWNhdGlvbj8uY2xvc2UoKTtcblx0XHRsZXQgbWVzc2FnZSA9IGF3YWl0IHRoaXMuYmFzaWNNZXNzYWdlKHR1bm5lbCk7XG5cdFx0Y29uc3QgY2hvaWNlcyA9IFt0aGlzLm9wZW5Ccm93c2VyQ2hvaWNlKHR1bm5lbCldO1xuXHRcdGlmICghaXNXZWIgfHwgb3BlblByZXZpZXdFbmFibGVkQ29udGV4dC5nZXRWYWx1ZSh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdFx0Y2hvaWNlcy5wdXNoKHRoaXMub3BlblByZXZpZXdDaG9pY2UodHVubmVsKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCh0dW5uZWwudHVubmVsTG9jYWxQb3J0ICE9PSB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCkgJiYgdGhpcy50dW5uZWxTZXJ2aWNlLmNhbkVsZXZhdGUgJiYgdGhpcy50dW5uZWxTZXJ2aWNlLmlzUG9ydFByaXZpbGVnZWQodHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpKSB7XG5cdFx0XHQvLyBQcml2aWxlZ2VkIHBvcnRzIGFyZSBub3Qgb24gV2luZG93cywgc28gaXQncyBzYWZlIHRvIHVzZSBcInN1cGVydXNlclwiXG5cdFx0XHRtZXNzYWdlICs9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbHNWaWV3LmVsZXZhdGlvbk1lc3NhZ2UnLCBcIllvdSdsbCBuZWVkIHRvIHJ1biBhcyBzdXBlcnVzZXIgdG8gdXNlIHBvcnQgezB9IGxvY2FsbHkuICBcIiwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpO1xuXHRcdFx0Y2hvaWNlcy51bnNoaWZ0KHRoaXMuZWxldmF0ZUNob2ljZSh0dW5uZWwpKTtcblx0XHR9XG5cblx0XHRpZiAodHVubmVsLnByaXZhY3kgPT09IFR1bm5lbFByaXZhY3lJZC5Qcml2YXRlICYmIGlzV2ViICYmIHRoaXMudHVubmVsU2VydmljZS5jYW5DaGFuZ2VQcml2YWN5KSB7XG5cdFx0XHRjaG9pY2VzLnB1c2godGhpcy5tYWtlUHVibGljQ2hvaWNlKHR1bm5lbCkpO1xuXHRcdH1cblxuXHRcdG1lc3NhZ2UgKz0gdGhpcy5saW5rTWVzc2FnZSgpO1xuXG5cdFx0dGhpcy5sYXN0Tm90aWZpY2F0aW9uID0gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5JbmZvLCBtZXNzYWdlLCBjaG9pY2VzLCB7IG5ldmVyU2hvd0FnYWluOiB7IGlkOiAncmVtb3RlLnR1bm5lbHNWaWV3LmF1dG9Gb3J3YXJkTmV2ZXJTaG93JywgaXNTZWNvbmRhcnk6IHRydWUgfSB9KTtcblx0XHR0aGlzLmxhc3RTaG93blBvcnQgPSB0dW5uZWwudHVubmVsUmVtb3RlUG9ydDtcblx0XHR0aGlzLmxhc3ROb3RpZnlUaW1lID0gbmV3IERhdGUoKTtcblx0XHR0aGlzLm5vdGlmaWNhdGlvbkRpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmxhc3ROb3RpZmljYXRpb24ub25EaWRDbG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmxhc3ROb3RpZmljYXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmxhc3RTaG93blBvcnQgPSB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG1ha2VQdWJsaWNDaG9pY2UodHVubmVsOiBSZW1vdGVUdW5uZWwpOiBJUHJvbXB0Q2hvaWNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbHNWaWV3Lm1ha2VQdWJsaWMnLCBcIk1ha2UgUHVibGljXCIpLFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG9sZFR1bm5lbERldGFpbHMgPSBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZCwgdHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuY2xvc2UoeyBob3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgcG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQgfSwgVHVubmVsQ2xvc2VSZWFzb24uT3RoZXIpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuZm9yd2FyZCh7XG5cdFx0XHRcdFx0cmVtb3RlOiB7IGhvc3Q6IHR1bm5lbC50dW5uZWxSZW1vdGVIb3N0LCBwb3J0OiB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCB9LFxuXHRcdFx0XHRcdGxvY2FsOiB0dW5uZWwudHVubmVsTG9jYWxQb3J0LFxuXHRcdFx0XHRcdG5hbWU6IG9sZFR1bm5lbERldGFpbHM/Lm5hbWUsXG5cdFx0XHRcdFx0ZWxldmF0ZUlmTmVlZGVkOiB0cnVlLFxuXHRcdFx0XHRcdHByaXZhY3k6IFR1bm5lbFByaXZhY3lJZC5QdWJsaWMsXG5cdFx0XHRcdFx0c291cmNlOiBvbGRUdW5uZWxEZXRhaWxzPy5zb3VyY2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgb3BlbkJyb3dzZXJDaG9pY2UodHVubmVsOiBSZW1vdGVUdW5uZWwpOiBJUHJvbXB0Q2hvaWNlIHtcblx0XHRjb25zdCBhZGRyZXNzID0gbWFrZUFkZHJlc3ModHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLkxBQkVMLFxuXHRcdFx0cnVuOiAoKSA9PiBPcGVuUG9ydEluQnJvd3NlckFjdGlvbi5ydW4odGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwsIHRoaXMub3BlbmVyU2VydmljZSwgYWRkcmVzcylcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBvcGVuUHJldmlld0Nob2ljZSh0dW5uZWw6IFJlbW90ZVR1bm5lbCk6IElQcm9tcHRDaG9pY2Uge1xuXHRcdGNvbnN0IGFkZHJlc3MgPSBtYWtlQWRkcmVzcyh0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogT3BlblBvcnRJblByZXZpZXdBY3Rpb24uTEFCRUwsXG5cdFx0XHRydW46ICgpID0+IE9wZW5Qb3J0SW5QcmV2aWV3QWN0aW9uLnJ1bih0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbCwgdGhpcy5vcGVuZXJTZXJ2aWNlLCB0aGlzLmV4dGVybmFsT3BlbmVyU2VydmljZSwgYWRkcmVzcylcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBlbGV2YXRlQ2hvaWNlKHR1bm5lbDogUmVtb3RlVHVubmVsKTogSVByb21wdENob2ljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC8vIFByaXZpbGVnZWQgcG9ydHMgYXJlIG5vdCBvbiBXaW5kb3dzLCBzbyBpdCdzIG9rIHRvIHN0aWNrIHRvIGp1c3QgXCJzdWRvXCIuXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsc1ZpZXcuZWxldmF0aW9uQnV0dG9uJywgXCJVc2UgUG9ydCB7MH0gYXMgU3Vkby4uLlwiLCB0dW5uZWwudHVubmVsUmVtb3RlUG9ydCksXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuY2xvc2UoeyBob3N0OiB0dW5uZWwudHVubmVsUmVtb3RlSG9zdCwgcG9ydDogdHVubmVsLnR1bm5lbFJlbW90ZVBvcnQgfSwgVHVubmVsQ2xvc2VSZWFzb24uT3RoZXIpO1xuXHRcdFx0XHRjb25zdCBuZXdUdW5uZWwgPSBhd2FpdCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5mb3J3YXJkKHtcblx0XHRcdFx0XHRyZW1vdGU6IHsgaG9zdDogdHVubmVsLnR1bm5lbFJlbW90ZUhvc3QsIHBvcnQ6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0IH0sXG5cdFx0XHRcdFx0bG9jYWw6IHR1bm5lbC50dW5uZWxSZW1vdGVQb3J0LFxuXHRcdFx0XHRcdGVsZXZhdGVJZk5lZWRlZDogdHJ1ZSxcblx0XHRcdFx0XHRzb3VyY2U6IEF1dG9UdW5uZWxTb3VyY2Vcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghbmV3VHVubmVsIHx8ICh0eXBlb2YgbmV3VHVubmVsID09PSAnc3RyaW5nJykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5sYXN0Tm90aWZpY2F0aW9uPy5jbG9zZSgpO1xuXHRcdFx0XHR0aGlzLmxhc3RTaG93blBvcnQgPSBuZXdUdW5uZWwudHVubmVsUmVtb3RlUG9ydDtcblx0XHRcdFx0dGhpcy5sYXN0Tm90aWZpY2F0aW9uID0gdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuYmFzaWNNZXNzYWdlKG5ld1R1bm5lbCkgKyB0aGlzLmxpbmtNZXNzYWdlKCksXG5cdFx0XHRcdFx0W3RoaXMub3BlbkJyb3dzZXJDaG9pY2UobmV3VHVubmVsKSwgdGhpcy5vcGVuUHJldmlld0Nob2ljZSh0dW5uZWwpXSxcblx0XHRcdFx0XHR7IG5ldmVyU2hvd0FnYWluOiB7IGlkOiAncmVtb3RlLnR1bm5lbHNWaWV3LmF1dG9Gb3J3YXJkTmV2ZXJTaG93JywgaXNTZWNvbmRhcnk6IHRydWUgfSB9KTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25EaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5sYXN0Tm90aWZpY2F0aW9uLm9uRGlkQ2xvc2UoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMubGFzdE5vdGlmaWNhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLmxhc3RTaG93blBvcnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgT3V0cHV0QXV0b21hdGljUG9ydEZvcndhcmRpbmcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBwb3J0c0ZlYXR1cmVzPzogSURpc3Bvc2FibGU7XG5cdHByaXZhdGUgdXJsRmluZGVyPzogVXJsRmluZGVyO1xuXHRwcml2YXRlIG5vdGlmaWVyOiBPbkF1dG9Gb3J3YXJkZWRBY3Rpb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlOiBJRXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRyZWFkb25seSB0dW5uZWxTZXJ2aWNlOiBJVHVubmVsU2VydmljZSxcblx0XHRyZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgcHJpdmlsZWdlZE9ubHk6ICgpID0+IGJvb2xlYW5cblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm5vdGlmaWVyID0gbmV3IE9uQXV0b0ZvcndhcmRlZEFjdGlvbihub3RpZmljYXRpb25TZXJ2aWNlLCByZW1vdGVFeHBsb3JlclNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGV4dGVybmFsT3BlbmVyU2VydmljZSwgdHVubmVsU2VydmljZSwgaG9zdFNlcnZpY2UsIGxvZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFBPUlRfQVVUT19GT1JXQVJEX1NFVFRJTkcpKSB7XG5cdFx0XHRcdHRoaXMudHJ5U3RhcnRTdG9wVXJsRmluZGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5wb3J0c0ZlYXR1cmVzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2Uub25FbmFibGVkUG9ydHNGZWF0dXJlcygoKSA9PiB7XG5cdFx0XHR0aGlzLnRyeVN0YXJ0U3RvcFVybEZpbmRlcigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnRyeVN0YXJ0U3RvcFVybEZpbmRlcigpO1xuXG5cdFx0aWYgKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFBPUlRfQVVUT19TT1VSQ0VfU0VUVElORykgPT09IFBPUlRfQVVUT19TT1VSQ0VfU0VUVElOR19IWUJSSUQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHVubmVsU2VydmljZS5vblR1bm5lbENsb3NlZCh0dW5uZWwgPT4gdGhpcy5ub3RpZmllci5oaWRlKFt0dW5uZWwucG9ydF0pKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0cnlTdGFydFN0b3BVcmxGaW5kZXIoKSB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUE9SVF9BVVRPX0ZPUldBUkRfU0VUVElORykpIHtcblx0XHRcdHRoaXMuc3RhcnRVcmxGaW5kZXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9wVXJsRmluZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGFydFVybEZpbmRlcigpIHtcblx0XHRpZiAoIXRoaXMudXJsRmluZGVyICYmICh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5wb3J0c0ZlYXR1cmVzRW5hYmxlZCAhPT0gUG9ydHNFbmFibGVtZW50LkFkZGl0aW9uYWxGZWF0dXJlcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5wb3J0c0ZlYXR1cmVzPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy51cmxGaW5kZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVXJsRmluZGVyKHRoaXMudGVybWluYWxTZXJ2aWNlLCB0aGlzLmRlYnVnU2VydmljZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXJsRmluZGVyLm9uRGlkTWF0Y2hMb2NhbFVybChhc3luYyAobG9jYWxVcmwpID0+IHtcblx0XHRcdGlmIChtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmRldGVjdGVkLCBsb2NhbFVybC5ob3N0LCBsb2NhbFVybC5wb3J0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhdHRyaWJ1dGVzID0gKGF3YWl0IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmdldEF0dHJpYnV0ZXMoW2xvY2FsVXJsXSkpPy5nZXQobG9jYWxVcmwucG9ydCk7XG5cdFx0XHRpZiAoYXR0cmlidXRlcz8ub25BdXRvRm9yd2FyZCA9PT0gT25Qb3J0Rm9yd2FyZC5JZ25vcmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMucHJpdmlsZWdlZE9ubHkoKSAmJiAhdGhpcy50dW5uZWxTZXJ2aWNlLmlzUG9ydFByaXZpbGVnZWQobG9jYWxVcmwucG9ydCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gYXdhaXQgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuZm9yd2FyZCh7IHJlbW90ZTogbG9jYWxVcmwsIHNvdXJjZTogQXV0b1R1bm5lbFNvdXJjZSB9LCBhdHRyaWJ1dGVzID8/IG51bGwpO1xuXHRcdFx0aWYgKGZvcndhcmRlZCAmJiAodHlwZW9mIGZvcndhcmRlZCAhPT0gJ3N0cmluZycpKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpZXIuZG9BY3Rpb24oW2ZvcndhcmRlZF0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcFVybEZpbmRlcigpIHtcblx0XHRpZiAodGhpcy51cmxGaW5kZXIpIHtcblx0XHRcdHRoaXMudXJsRmluZGVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMudXJsRmluZGVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBQcm9jQXV0b21hdGljUG9ydEZvcndhcmRpbmcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBjYW5kaWRhdGVMaXN0ZW5lcjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXV0b0ZvcndhcmRlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdHByaXZhdGUgbm90aWZpZWRPbmx5OiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblx0cHJpdmF0ZSBub3RpZmllcjogT25BdXRvRm9yd2FyZGVkQWN0aW9uO1xuXHRwcml2YXRlIGluaXRpYWxDYW5kaWRhdGVzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblx0cHJpdmF0ZSBwb3J0c0ZlYXR1cmVzOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVuZm9yd2FyZE9ubHk6IGJvb2xlYW4sXG5cdFx0cmVhZG9ubHkgYWxyZWFkeUF1dG9Gb3J3YXJkZWQ6IFNldDxzdHJpbmc+IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbmVlZHNJbml0aWFsQ2FuZGlkYXRlczogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0cmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IGV4dGVybmFsT3BlbmVyU2VydmljZTogSUV4dGVybmFsVXJpT3BlbmVyU2VydmljZSxcblx0XHRyZWFkb25seSB0dW5uZWxTZXJ2aWNlOiBJVHVubmVsU2VydmljZSxcblx0XHRyZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5ub3RpZmllciA9IG5ldyBPbkF1dG9Gb3J3YXJkZWRBY3Rpb24obm90aWZpY2F0aW9uU2VydmljZSwgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBleHRlcm5hbE9wZW5lclNlcnZpY2UsIHR1bm5lbFNlcnZpY2UsIGhvc3RTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0YWxyZWFkeUF1dG9Gb3J3YXJkZWQ/LmZvckVhY2gocG9ydCA9PiB0aGlzLmF1dG9Gb3J3YXJkZWQuYWRkKHBvcnQpKTtcblx0XHR0aGlzLmluaXRpYWxpemUoKTtcblx0fVxuXG5cdGdldCBmb3J3YXJkZWQoKTogU2V0PHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLmF1dG9Gb3J3YXJkZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGluaXRpYWxpemUoKSB7XG5cdFx0aWYgKCF0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5lbnZpcm9ubWVudFR1bm5lbHNTZXQpIHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwub25FbnZpcm9ubWVudFR1bm5lbHNTZXQoKCkgPT4gcmVzb2x2ZSgpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oYXN5bmMgKGUpID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFBPUlRfQVVUT19GT1JXQVJEX1NFVFRJTkcpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc3RhcnRTdG9wQ2FuZGlkYXRlTGlzdGVuZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnBvcnRzRmVhdHVyZXMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5vbkVuYWJsZWRQb3J0c0ZlYXR1cmVzKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuc3RhcnRTdG9wQ2FuZGlkYXRlTGlzdGVuZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnN0YXJ0U3RvcENhbmRpZGF0ZUxpc3RlbmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHN0YXJ0U3RvcENhbmRpZGF0ZUxpc3RlbmVyKCkge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFBPUlRfQVVUT19GT1JXQVJEX1NFVFRJTkcpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN0YXJ0Q2FuZGlkYXRlTGlzdGVuZXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9wQ2FuZGlkYXRlTGlzdGVuZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0b3BDYW5kaWRhdGVMaXN0ZW5lcigpIHtcblx0XHRpZiAodGhpcy5jYW5kaWRhdGVMaXN0ZW5lcikge1xuXHRcdFx0dGhpcy5jYW5kaWRhdGVMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmNhbmRpZGF0ZUxpc3RlbmVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3RhcnRDYW5kaWRhdGVMaXN0ZW5lcigpIHtcblx0XHRpZiAodGhpcy5jYW5kaWRhdGVMaXN0ZW5lciB8fCAodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UucG9ydHNGZWF0dXJlc0VuYWJsZWQgIT09IFBvcnRzRW5hYmxlbWVudC5BZGRpdGlvbmFsRmVhdHVyZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucG9ydHNGZWF0dXJlcz8uZGlzcG9zZSgpO1xuXG5cdFx0Ly8gQ2FwdHVyZSBsaXN0IG9mIHN0YXJ0aW5nIGNhbmRpZGF0ZXMgc28gd2UgZG9uJ3QgYXV0byBmb3J3YXJkIHRoZW0gbGF0ZXIuXG5cdFx0YXdhaXQgdGhpcy5zZXRJbml0aWFsQ2FuZGlkYXRlcygpO1xuXG5cdFx0Ly8gTmVlZCB0byBjaGVjayB0aGUgc2V0dGluZyBhZ2Fpbiwgc2luY2UgaXQgbWF5IGhhdmUgY2hhbmdlZCB3aGlsZSB3ZSB3YWl0ZWQgZm9yIHRoZSBpbml0aWFsIGNhbmRpZGF0ZXMgdG8gYmUgc2V0LlxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFBPUlRfQVVUT19GT1JXQVJEX1NFVFRJTkcpKSB7XG5cdFx0XHR0aGlzLmNhbmRpZGF0ZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwub25DYW5kaWRhdGVzQ2hhbmdlZCh0aGlzLmhhbmRsZUNhbmRpZGF0ZVVwZGF0ZSwgdGhpcykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0SW5pdGlhbENhbmRpZGF0ZXMoKSB7XG5cdFx0aWYgKCF0aGlzLm5lZWRzSW5pdGlhbENhbmRpZGF0ZXMpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgRm9yd2FyZGVkUG9ydHM6IChQcm9jRm9yd2FyZGluZykgTm90IHNldHRpbmcgaW5pdGlhbCBjYW5kaWRhdGVzYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBzdGFydGluZ0NhbmRpZGF0ZXMgPSB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5jYW5kaWRhdGVzT3JVbmRlZmluZWQ7XG5cdFx0aWYgKCFzdGFydGluZ0NhbmRpZGF0ZXMpIHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwub25DYW5kaWRhdGVzQ2hhbmdlZCgoKSA9PiByZXNvbHZlKCkpKTtcblx0XHRcdHN0YXJ0aW5nQ2FuZGlkYXRlcyA9IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmNhbmRpZGF0ZXM7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiBzdGFydGluZ0NhbmRpZGF0ZXMpIHtcblx0XHRcdHRoaXMuaW5pdGlhbENhbmRpZGF0ZXMuYWRkKG1ha2VBZGRyZXNzKHZhbHVlLmhvc3QsIHZhbHVlLnBvcnQpKTtcblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKGBGb3J3YXJkZWRQb3J0czogKFByb2NGb3J3YXJkaW5nKSBJbml0aWFsIGNhbmRpZGF0ZXMgc2V0IHRvICR7c3RhcnRpbmdDYW5kaWRhdGVzLm1hcChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnBvcnQpLmpvaW4oJywgJyl9YCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZvcndhcmRDYW5kaWRhdGVzKCk6IFByb21pc2U8UmVtb3RlVHVubmVsW10gfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgYXR0cmlidXRlczogTWFwPG51bWJlciwgQXR0cmlidXRlcz4gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWxsVHVubmVsczogUmVtb3RlVHVubmVsW10gPSBbXTtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoUHJvY0ZvcndhcmRpbmcpIEF0dGVtcHRpbmcgdG8gZm9yd2FyZCAke3RoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmNhbmRpZGF0ZXMubGVuZ3RofSBjYW5kaWRhdGVzYCk7XG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5jYW5kaWRhdGVzKSB7XG5cdFx0XHRpZiAoIXZhbHVlLmRldGFpbCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoUHJvY0ZvcndhcmRpbmcpIFBvcnQgJHt2YWx1ZS5wb3J0fSBtaXNzaW5nIGRldGFpbGApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0NhbmRpZGF0ZVJlbWFwcGVkVHVubmVsTG9jYWxFbmRwb2ludCh2YWx1ZSwgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLnZhbHVlcygpKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoUHJvY0ZvcndhcmRpbmcpIFBvcnQgJHt2YWx1ZS5wb3J0fSBpcyB0aGUgbG9jYWwgcG9ydCBvZiBhIGZvcndhcmRlZCB0dW5uZWxgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghYXR0cmlidXRlcykge1xuXHRcdFx0XHRhdHRyaWJ1dGVzID0gYXdhaXQgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZ2V0QXR0cmlidXRlcyh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5jYW5kaWRhdGVzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcG9ydEF0dHJpYnV0ZXMgPSBhdHRyaWJ1dGVzPy5nZXQodmFsdWUucG9ydCk7XG5cblx0XHRcdGNvbnN0IGFkZHJlc3MgPSBtYWtlQWRkcmVzcyh2YWx1ZS5ob3N0LCB2YWx1ZS5wb3J0KTtcblx0XHRcdGlmICh0aGlzLmluaXRpYWxDYW5kaWRhdGVzLmhhcyhhZGRyZXNzKSAmJiAocG9ydEF0dHJpYnV0ZXM/Lm9uQXV0b0ZvcndhcmQgPT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5ub3RpZmllZE9ubHkuaGFzKGFkZHJlc3MpIHx8IHRoaXMuYXV0b0ZvcndhcmRlZC5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhbHJlYWR5Rm9yd2FyZGVkID0gbWFwSGFzQWRkcmVzc0xvY2FsaG9zdE9yQWxsSW50ZXJmYWNlcyh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQsIHZhbHVlLmhvc3QsIHZhbHVlLnBvcnQpO1xuXHRcdFx0aWYgKG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXModGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZGV0ZWN0ZWQsIHZhbHVlLmhvc3QsIHZhbHVlLnBvcnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocG9ydEF0dHJpYnV0ZXM/Lm9uQXV0b0ZvcndhcmQgPT09IE9uUG9ydEZvcndhcmQuSWdub3JlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChQcm9jRm9yd2FyZGluZykgUG9ydCAke3ZhbHVlLnBvcnR9IGlzIGlnbm9yZWRgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmb3J3YXJkZWQgPSBhd2FpdCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5mb3J3YXJkKHsgcmVtb3RlOiB2YWx1ZSwgc291cmNlOiBBdXRvVHVubmVsU291cmNlIH0sIHBvcnRBdHRyaWJ1dGVzID8/IG51bGwpO1xuXHRcdFx0aWYgKCFhbHJlYWR5Rm9yd2FyZGVkICYmIGZvcndhcmRlZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYEZvcndhcmRlZFBvcnRzOiAoUHJvY0ZvcndhcmRpbmcpIFBvcnQgJHt2YWx1ZS5wb3J0fSBoYXMgYmVlbiBmb3J3YXJkZWRgKTtcblx0XHRcdFx0dGhpcy5hdXRvRm9yd2FyZGVkLmFkZChhZGRyZXNzKTtcblx0XHRcdH0gZWxzZSBpZiAoZm9yd2FyZGVkKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgRm9yd2FyZGVkUG9ydHM6IChQcm9jRm9yd2FyZGluZykgUG9ydCAke3ZhbHVlLnBvcnR9IGhhcyBiZWVuIG5vdGlmaWVkYCk7XG5cdFx0XHRcdHRoaXMubm90aWZpZWRPbmx5LmFkZChhZGRyZXNzKTtcblx0XHRcdH1cblx0XHRcdGlmIChmb3J3YXJkZWQgJiYgKHR5cGVvZiBmb3J3YXJkZWQgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0XHRhbGxUdW5uZWxzLnB1c2goZm9yd2FyZGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBGb3J3YXJkZWRQb3J0czogKFByb2NGb3J3YXJkaW5nKSBGb3J3YXJkZWQgJHthbGxUdW5uZWxzLmxlbmd0aH0gY2FuZGlkYXRlc2ApO1xuXHRcdGlmIChhbGxUdW5uZWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbFR1bm5lbHM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZUNhbmRpZGF0ZVVwZGF0ZShyZW1vdmVkOiBNYXA8c3RyaW5nLCB7IGhvc3Q6IHN0cmluZzsgcG9ydDogbnVtYmVyIH0+KSB7XG5cdFx0Y29uc3QgcmVtb3ZlZFBvcnRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGxldCBhdXRvRm9yd2FyZGVkOiBNYXA8c3RyaW5nLCBzdHJpbmcgfCBUdW5uZWw+O1xuXHRcdGlmICh0aGlzLnVuZm9yd2FyZE9ubHkpIHtcblx0XHRcdGF1dG9Gb3J3YXJkZWQgPSBuZXcgTWFwKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZC5lbnRyaWVzKCkpIHtcblx0XHRcdFx0aWYgKGVudHJ5WzFdLnNvdXJjZS5zb3VyY2UgPT09IFR1bm5lbFNvdXJjZS5BdXRvKSB7XG5cdFx0XHRcdFx0YXV0b0ZvcndhcmRlZC5zZXQoZW50cnlbMF0sIGVudHJ5WzFdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRhdXRvRm9yd2FyZGVkID0gbmV3IE1hcCh0aGlzLmF1dG9Gb3J3YXJkZWQuZW50cmllcygpKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHJlbW92ZWRQb3J0IG9mIHJlbW92ZWQpIHtcblx0XHRcdGNvbnN0IGtleSA9IHJlbW92ZWRQb3J0WzBdO1xuXHRcdFx0bGV0IHZhbHVlID0gcmVtb3ZlZFBvcnRbMV07XG5cdFx0XHRjb25zdCBmb3J3YXJkZWRWYWx1ZSA9IG1hcEhhc0FkZHJlc3NMb2NhbGhvc3RPckFsbEludGVyZmFjZXMoYXV0b0ZvcndhcmRlZCwgdmFsdWUuaG9zdCwgdmFsdWUucG9ydCk7XG5cdFx0XHRpZiAoZm9yd2FyZGVkVmFsdWUpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBmb3J3YXJkZWRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0aGlzLmF1dG9Gb3J3YXJkZWQuZGVsZXRlKGtleSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dmFsdWUgPSB7IGhvc3Q6IGZvcndhcmRlZFZhbHVlLnJlbW90ZUhvc3QsIHBvcnQ6IGZvcndhcmRlZFZhbHVlLnJlbW90ZVBvcnQgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5jbG9zZSh2YWx1ZSwgVHVubmVsQ2xvc2VSZWFzb24uQXV0b0ZvcndhcmRFbmQpO1xuXHRcdFx0XHRyZW1vdmVkUG9ydHMucHVzaCh2YWx1ZS5wb3J0KTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5ub3RpZmllZE9ubHkuZGVsZXRlKGtleSkpIHtcblx0XHRcdFx0cmVtb3ZlZFBvcnRzLnB1c2godmFsdWUucG9ydCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmluaXRpYWxDYW5kaWRhdGVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnVuZm9yd2FyZE9ubHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocmVtb3ZlZFBvcnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGF3YWl0IHRoaXMubm90aWZpZXIuaGlkZShyZW1vdmVkUG9ydHMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHR1bm5lbHMgPSBhd2FpdCB0aGlzLmZvcndhcmRDYW5kaWRhdGVzKCk7XG5cdFx0aWYgKHR1bm5lbHMpIHtcblx0XHRcdGF3YWl0IHRoaXMubm90aWZpZXIuZG9BY3Rpb24odHVubmVscyk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLFlBQVksU0FBUztBQUNyQixTQUFTLFlBQXlCLHlCQUF5QjtBQUUzRCxTQUFTLFlBQW9FLDZCQUE2QjtBQUMxRyxTQUFTLHdCQUF3Qiw0QkFBNEIsMkJBQTJCLDBCQUEwQixpQ0FBaUMsaUNBQWlDLGtDQUFrQyxpQkFBaUIsMEJBQTBCLHNCQUFzQjtBQUN2UixTQUFxQixrQkFBaUMsK0JBQStCLDJCQUEyQixhQUFhLHVDQUF1QyxlQUF1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
